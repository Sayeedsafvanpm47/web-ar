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
 * this function — which only ever looks up the single id in the URL — is the
 * sole public read path.
 *
 * Every caller gets nothing back unless the book is live: correct id, not
 * revoked, and inside its paid hosting term.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { mindKey, scanTtl, signDownload } from '@/lib/r2';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicMemory = {
  targetIndex: number;
  /** Height / width of the printed photo. Drives the AR plane. */
  photoAspect: number | null;
  videoUrl: string;
};

export type PublicBook = {
  id: string;
  title: string;
  mindUrl: string;
  memories: PublicMemory[];
};

export type LookupResult =
  | { status: 'ok'; book: PublicBook }
  | { status: 'not-found' }
  | { status: 'revoked' }
  | { status: 'expired' }
  | { status: 'not-ready' }
  | { status: 'unavailable' };

/**
 * Nothing here returns customer PII. The landing page is reachable by anyone
 * holding the QR code, so it shows the book title and nothing about the
 * person who bought it.
 */
export async function lookupPublicBook(bookId: string): Promise<LookupResult> {
  if (typeof window !== 'undefined') {
    throw new Error('lookupPublicBook() must never run in the browser.');
  }
  if (!UUID_RE.test(bookId)) return { status: 'not-found' };

  try {
    return await load(bookId);
  } catch (err) {
    // Misconfiguration or an outage. Customers must never see a stack trace
    // or a blank 500, but this still has to be loud for whoever is on call.
    console.error('lookupPublicBook failed', err);
    return { status: 'unavailable' };
  }
}

async function load(bookId: string): Promise<LookupResult> {
  const supabase = createAdminClient();

  const { data: book } = await supabase
    .from('books')
    .select('id, title, expiry_date, revoked_at, mind_object_key')
    .eq('id', bookId)
    .maybeSingle();

  if (!book) return { status: 'not-found' };
  if (book.revoked_at) return { status: 'revoked' };

  // Null expiry fails closed — a book with no term set is not public.
  const today = new Date().toISOString().slice(0, 10);
  if (!book.expiry_date || (book.expiry_date as string) < today) {
    return { status: 'expired' };
  }

  if (!book.mind_object_key) return { status: 'not-ready' };

  const { data: memoryData } = await supabase
    .from('memories')
    .select('target_index, photo_aspect, video_object_key')
    .eq('book_id', bookId)
    .not('video_object_key', 'is', null)
    .order('target_index');

  const memories = memoryData ?? [];
  if (memories.length === 0) return { status: 'not-ready' };

  // Position in the compiled .mind is the only thing binding a photo to its
  // video. If the rows are not contiguous from zero, the file and the database
  // disagree and every video after the gap would play on the wrong photo.
  // Refuse rather than show a customer someone else's memory.
  const contiguous = memories.every((m, i) => m.target_index === i);
  if (!contiguous) return { status: 'not-ready' };

  const ttl = scanTtl();

  return {
    status: 'ok',
    book: {
      id: book.id as string,
      title: book.title as string,
      mindUrl: await signDownload(mindKey(bookId), ttl),
      memories: await Promise.all(
        memories.map(async (m) => ({
          targetIndex: m.target_index as number,
          photoAspect: (m.photo_aspect as number | null) ?? null,
          videoUrl: await signDownload(m.video_object_key as string, ttl),
        })),
      ),
    },
  };
}
