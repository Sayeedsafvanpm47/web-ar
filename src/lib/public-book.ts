/**
 * The public book lookup. SERVER ONLY.
 *
 * This is the one place customer content is read without a logged-in user, so
 * it is the place that has to be careful.
 *
 * It uses the service-role client, which bypasses RLS entirely. That is
 * deliberate and is why `anon` holds no policy on any table: if the public
 * path went through `anon`, a SELECT policy would let anyone with the public
 * key enumerate every book. Instead the database denies anon everything, and
 * this module — which only ever looks up the single id in the URL — is the
 * sole public read path.
 *
 * Nothing here returns customer PII. Everything it exposes is reachable by
 * anyone holding the QR code, so it carries the book title, the short
 * reference and the media, and nothing about the person who bought it.
 */
import { todayISO } from '@/lib/dates';
import { isContiguousFromZero } from '@/lib/target-mapping';
import { mindKey, photoKey, scanTtl, signDownload, videoKey } from '@/lib/r2';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Postgres "column does not exist" — see the note in selectBook(). */
const UNDEFINED_COLUMN = '42703';

/** Null on a database where the reference migration has not been applied. */
function readReference(row: Record<string, unknown>): string | null {
  const value = row['reference'];
  return typeof value === 'string' ? value : null;
}

export type PublicMemory = {
  id: string;
  /** Position in the book, and in the compiled target file. Zero-based. */
  targetIndex: number;
  /** Height / width of the printed photo. Drives the plane the video sits on. */
  photoAspect: number | null;
};

export type PublicBook = {
  id: string;
  title: string;
  /** Short quotable reference for support. Null until the migration is applied. */
  reference: string | null;
  /**
   * Whether the scanner can work: a compiled target file exists and the page
   * indexes line up with it.
   *
   * A book that is not scannable is still watchable — the per-page fallback
   * player needs none of this. CLAUDE.md is explicit that the camera failing
   * must never mean the customer cannot watch their video.
   */
  scannable: boolean;
  mindUrl: string | null;
  memories: PublicMemory[];
};

/**
 * `expired` and `empty` carry the short reference; `not-found` and `revoked`
 * deliberately do not.
 *
 * Expired and empty are states only a legitimate holder of the printed link
 * reaches, and support cannot help them without knowing which book they mean.
 * The reference is not a credential, so sharing it there costs nothing.
 *
 * `revoked` must stay indistinguishable from `not-found`, so it carries
 * nothing a non-existent book would not also carry.
 */
export type LookupResult =
  | { status: 'ok'; book: PublicBook }
  | { status: 'not-found' }
  | { status: 'revoked' }
  | { status: 'expired'; reference: string | null }
  | { status: 'empty'; reference: string | null }
  | { status: 'unavailable' };

type Options = {
  /**
   * Sign the compiled target file. Only the scanner needs it.
   *
   * Videos are deliberately never signed here any more. They are minted one
   * at a time by /b/[bookId]/media/[memoryId], when a photo is actually found
   * — a document carrying N signed URLs hands out N live credentials to
   * anything that can read it, and they start expiring before the customer
   * has pressed start.
   */
  withTargets?: boolean;
};

export async function lookupPublicBook(
  bookId: string,
  options: Options = {},
): Promise<LookupResult> {
  if (typeof window !== 'undefined') {
    throw new Error('lookupPublicBook() must never run in the browser.');
  }
  if (!UUID_RE.test(bookId)) return { status: 'not-found' };

  try {
    return await load(bookId, options);
  } catch (err) {
    // Misconfiguration or an outage. Customers must never see a stack trace
    // or a blank 500, but this still has to be loud for whoever is on call.
    console.error('lookupPublicBook failed', err);
    return { status: 'unavailable' };
  }
}

/**
 * Reads the book row, tolerating a database where books.reference does not
 * exist yet.
 *
 * The column arrives in 20261007090000_book_reference.sql. Deploying this code
 * before that migration is applied would otherwise take the customer viewer
 * down entirely, which is far worse than losing the support reference for a
 * few minutes. Falls back loudly rather than silently.
 */
async function selectBook(bookId: string) {
  const supabase = createAdminClient();
  const withReference =
    'id, title, reference, expiry_date, revoked_at, mind_object_key';
  const withoutReference = 'id, title, expiry_date, revoked_at, mind_object_key';

  const first = await supabase
    .from('books')
    .select(withReference)
    .eq('id', bookId)
    .maybeSingle();

  if (first.error?.code !== UNDEFINED_COLUMN) return first;

  console.warn(
    'books.reference is missing — apply ' +
      'supabase/migrations/20261007090000_book_reference.sql. Support links ' +
      'will have no reference until then.',
  );
  return supabase
    .from('books')
    .select(withoutReference)
    .eq('id', bookId)
    .maybeSingle();
}

async function load(bookId: string, options: Options): Promise<LookupResult> {
  const supabase = createAdminClient();

  const { data: book } = await selectBook(bookId);

  if (!book) return { status: 'not-found' };
  if (book.revoked_at) return { status: 'revoked' };

  // Null expiry fails closed — a book with no term set is not public.
  // todayISO() is Doha time, matching what staff see in admin, so the two
  // never disagree about whether a book is still in term.
  const reference = readReference(book);

  if (!book.expiry_date || (book.expiry_date as string) < todayISO()) {
    return { status: 'expired', reference };
  }

  const { data: memoryData } = await supabase
    .from('memories')
    .select('id, target_index, photo_aspect, video_object_key')
    .eq('book_id', bookId)
    .not('video_object_key', 'is', null)
    .order('target_index');

  const memories = memoryData ?? [];
  if (memories.length === 0) return { status: 'empty', reference };

  // Position in the compiled target file is the only thing binding a photo to
  // its video. If the rows are not contiguous from zero, the file and the
  // database disagree and every video after the gap would play on the wrong
  // photo. That makes the book unscannable — but not unwatchable, since the
  // per-page player addresses a memory by id and cannot mismatch.
  const contiguous = isContiguousFromZero(
    memories.map((m) => ({ id: m.id as string, targetIndex: m.target_index as number })),
  );
  const scannable = Boolean(book.mind_object_key) && contiguous;

  const ttl = scanTtl();

  return {
    status: 'ok',
    book: {
      id: book.id as string,
      title: book.title as string,
      reference,
      scannable,
      mindUrl:
        scannable && options.withTargets
          ? await signDownload(mindKey(bookId), ttl)
          : null,
      memories: memories.map((m) => ({
        id: m.id as string,
        targetIndex: m.target_index as number,
        photoAspect: (m.photo_aspect as number | null) ?? null,
      })),
    },
  };
}

export type PublicMemoryDetail = {
  bookId: string;
  bookTitle: string;
  reference: string | null;
  memoryId: string;
  /** One-based, for showing a human a page number. */
  pageNumber: number;
  pageCount: number;
  photoAspect: number | null;
  videoUrl: string;
  posterUrl: string | null;
};

/** Shares the book's non-ok variants, so the reference is carried the same way. */
export type MemoryLookupResult =
  | { status: 'ok'; memory: PublicMemoryDetail }
  | Exclude<LookupResult, { status: 'ok' }>;

/**
 * One page's video, for the no-camera fallback reached from the small QR
 * printed on each page.
 *
 * Addresses the memory by id rather than by position, so it cannot play the
 * wrong family's video even if the compiled target file and the database have
 * drifted apart.
 *
 * The book's own gates still apply: a revoked or expired book has no playable
 * pages either.
 */
export async function lookupPublicMemory(
  bookId: string,
  memoryId: string,
): Promise<MemoryLookupResult> {
  if (typeof window !== 'undefined') {
    throw new Error('lookupPublicMemory() must never run in the browser.');
  }
  if (!UUID_RE.test(bookId) || !UUID_RE.test(memoryId)) {
    return { status: 'not-found' };
  }

  const result = await lookupPublicBook(bookId);
  if (result.status !== 'ok') return result;

  const { book } = result;
  const index = book.memories.findIndex((m) => m.id === memoryId);
  if (index === -1) return { status: 'not-found' };

  const memory = book.memories[index];

  try {
    const ttl = scanTtl();
    return {
      status: 'ok',
      memory: {
        bookId: book.id,
        bookTitle: book.title,
        reference: book.reference,
        memoryId: memory.id,
        pageNumber: index + 1,
        pageCount: book.memories.length,
        photoAspect: memory.photoAspect,
        videoUrl: await signDownload(videoKey(bookId, memory.id), ttl),
        posterUrl: await signDownload(photoKey(bookId, memory.id), ttl),
      },
    };
  } catch (err) {
    console.error('lookupPublicMemory failed', err);
    return { status: 'unavailable' };
  }
}

/** A fresh, short-lived download URL for one page's video. */
export async function signMemoryDownload(
  bookId: string,
  memoryId: string,
): Promise<string | null> {
  const result = await lookupPublicBook(bookId);
  if (result.status !== 'ok') return null;
  if (!result.book.memories.some((m) => m.id === memoryId)) return null;

  try {
    // Deliberately the short admin TTL, not the scanning TTL: a download URL
    // is used immediately on click, so it has no reason to outlive the click.
    return await signDownload(videoKey(bookId, memoryId));
  } catch (err) {
    console.error('signMemoryDownload failed', err);
    return null;
  }
}
