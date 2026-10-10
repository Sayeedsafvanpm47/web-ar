'use server';

import { revalidatePath } from 'next/cache';

import { requireStaff } from '@/lib/auth';
import { findDuplicate, rateTrackability, type HashedPhoto } from '@/lib/photo-check';
import {
  isContiguousFromZero,
  reindexAfterRemoval,
  reindexAfterReorder,
} from '@/lib/target-mapping';
import { deleteObject, photoKey, signUpload, videoKey } from '@/lib/r2';
import { createClient } from '@/lib/supabase/server';

const PHOTO_TYPES = ['image/jpeg', 'image/png'] as const;
const VIDEO_TYPES = ['video/mp4'] as const;

const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

export type StartUploadInput = {
  bookId: string;
  pageLabel: string;
  photoType: string;
  photoBytes: number;
  videoType: string;
  videoBytes: number;
  photoAspect: number;
  videoDurationSeconds: number;
  /** 64-bit difference hash of the photo, computed in the browser. */
  photoHash: string;
};

export type StartUploadResult =
  | {
      ok: false;
      error: string;
      /** Set when the refusal is a near-duplicate, so the UI can name it. */
      duplicateOf?: string;
    }
  | {
      ok: true;
      /** A non-blocking caution shown after the upload succeeds. */
      warning?: string;
      memoryId: string;
      targetIndex: number;
      photoUrl: string;
      videoUrl: string;
    };

/**
 * Creates the memory row and returns presigned PUT URLs.
 *
 * The row is created with NULL object keys on purpose. Keys are only written
 * once confirmUpload() runs, so a half-finished upload leaves a row that is
 * visibly incomplete rather than one pointing at objects that do not exist.
 */
export async function startUpload(
  input: StartUploadInput,
): Promise<StartUploadResult> {
  await requireStaff();

  if (!(PHOTO_TYPES as readonly string[]).includes(input.photoType)) {
    return { ok: false, error: 'Photo must be a JPEG or PNG.' };
  }
  if (!(VIDEO_TYPES as readonly string[]).includes(input.videoType)) {
    return { ok: false, error: 'Video must be an MP4 (H.264 plays everywhere).' };
  }
  if (input.photoBytes <= 0 || input.photoBytes > MAX_PHOTO_BYTES) {
    return { ok: false, error: 'Photo must be under 20 MB.' };
  }
  if (input.videoBytes <= 0 || input.videoBytes > MAX_VIDEO_BYTES) {
    return { ok: false, error: 'Video must be under 200 MB.' };
  }
  if (!(input.photoAspect > 0)) {
    return { ok: false, error: 'Could not read the photo dimensions.' };
  }

  if (!/^[0-9a-f]{16}$/.test(input.photoHash)) {
    return { ok: false, error: 'Could not fingerprint that photo.' };
  }

  const supabase = await createClient();

  const { data: book } = await supabase
    .from('books')
    .select('id')
    .eq('id', input.bookId)
    .maybeSingle();

  if (!book) return { ok: false, error: 'Book not found.' };

  // Refuse a photo the tracker could confuse with one already in this book.
  // Checked before anything is stored, because the alternative is finding out
  // after the book is printed and a customer is watching the wrong video.
  const { data: siblings } = await supabase
    .from('memories')
    .select('id, page_label, target_index, photo_hash')
    .eq('book_id', input.bookId)
    .not('photo_hash', 'is', null);

  const existing: HashedPhoto[] = (siblings ?? []).map((row) => ({
    id: row.id as string,
    label:
      (row.page_label as string | null) ??
      `page ${(row.target_index as number) + 1}`,
    hash: (row.photo_hash as string | null) ?? '',
  }));

  const duplicate = findDuplicate(input.photoHash, existing);
  if (duplicate?.similarity === 'identical') {
    return {
      ok: false,
      error:
        `This photo is almost identical to "${duplicate.against.label}". ` +
        'The scanner would not reliably tell them apart, so one page could ' +
        'play the video belonging to the other one. Use a different photo.',
      duplicateOf: duplicate.against.id,
    };
  }

  // target_index is the position in the compiled .mind file and is
  // load-bearing: a wrong index plays the wrong family's video with no error.
  // Take the next free slot rather than letting staff type a number.
  const { data: last } = await supabase
    .from('memories')
    .select('target_index')
    .eq('book_id', input.bookId)
    .order('target_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const targetIndex = (last?.target_index ?? -1) + 1;

  const { data: created, error } = await supabase
    .from('memories')
    .insert({
      book_id: input.bookId,
      target_index: targetIndex,
      page_label: input.pageLabel || null,
      photo_hash: input.photoHash,
      photo_aspect: input.photoAspect,
      video_duration_seconds: input.videoDurationSeconds || null,
    })
    .select('id')
    .single();

  if (error || !created) {
    return { ok: false, error: error?.message ?? 'Could not create the memory.' };
  }

  const memoryId = created.id as string;

  return {
    ok: true,
    warning:
      duplicate?.similarity === 'similar'
        ? `This photo looks similar to "${duplicate.against.label}". Check they are distinct enough before printing.`
        : undefined,
    memoryId,
    targetIndex,
    photoUrl: await signUpload(
      photoKey(input.bookId, memoryId),
      input.photoType,
    ),
    videoUrl: await signUpload(
      videoKey(input.bookId, memoryId),
      input.videoType,
    ),
  };
}

/** Marks the objects as present, after the browser finished both PUTs. */
export async function confirmUpload(
  bookId: string,
  memoryId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase
    .from('memories')
    .update({
      photo_object_key: photoKey(bookId, memoryId),
      video_object_key: videoKey(bookId, memoryId),
    })
    .eq('id', memoryId)
    .eq('book_id', bookId);

  if (error) return { ok: false, error: error.message };

  await invalidateCompiledTargets(bookId);
  revalidatePath(`/admin/books/${bookId}`);
  return { ok: true };
}

/**
 * Any change to a book's photos makes its compiled targets.mind stale, so the
 * pointer is cleared and the file must be rebuilt.
 *
 * This is why it matters: a .mind stores no names, only positions. If the set
 * of photos changes but the old file stays in place, the positions no longer
 * mean what the database says they mean, and videos play on the wrong photos
 * with no error anywhere.
 */
async function invalidateCompiledTargets(bookId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('books')
    .update({ mind_object_key: null, mind_compiled_at: null })
    .eq('id', bookId)
    .not('mind_object_key', 'is', null);
}

/**
 * Removes a memory, its stored files, and closes the gap it leaves behind.
 *
 * Storage goes first: if the row went first and the object delete failed, the
 * files would be orphaned with nothing pointing at them. A failed object
 * delete leaves the row intact and the operation retryable.
 *
 * Objects that were never uploaded are not an error — an incomplete memory has
 * no files to remove, and refusing to delete the row would strand it.
 */
export async function deleteMemory(
  bookId: string,
  memoryId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();

  const supabase = await createClient();

  const { data: memory } = await supabase
    .from('memories')
    .select('target_index, photo_object_key, video_object_key')
    .eq('id', memoryId)
    .eq('book_id', bookId)
    .maybeSingle();

  if (!memory) return { ok: false, error: 'Memory not found.' };

  for (const key of [memory.photo_object_key, memory.video_object_key]) {
    if (!key) continue;
    try {
      await deleteObject(key as string);
    } catch (err) {
      const name = (err as { name?: string }).name;
      // A missing object is already in the desired state.
      if (name !== 'NoSuchKey' && name !== 'NotFound') {
        return {
          ok: false,
          error: `Could not delete the stored files: ${(err as Error).message}`,
        };
      }
    }
  }

  const { error: deleteError } = await supabase
    .from('memories')
    .delete()
    .eq('id', memoryId)
    .eq('book_id', bookId);

  if (deleteError) return { ok: false, error: deleteError.message };

  // Close the gap. target_index must stay contiguous from 0, because it is
  // the position in the compiled .mind file. A hole would shift every later
  // photo onto the wrong video.
  const removed = memory.target_index as number;

  const { data: after } = await supabase
    .from('memories')
    .select('id, target_index')
    .eq('book_id', bookId)
    .order('target_index', { ascending: true });

  // The renumbering rule itself lives in src/lib/target-mapping.ts, where it
  // is unit tested — including that it emits moves in an order where each slot
  // is vacated before the next row moves into it, so the unique
  // (book_id, target_index) constraint never trips mid-renumber.
  const moves = reindexAfterRemoval(
    (after ?? []).map((row) => ({
      id: row.id as string,
      targetIndex: row.target_index as number,
    })),
    removed,
  );

  for (const move of moves) {
    const { error } = await supabase
      .from('memories')
      .update({ target_index: move.targetIndex })
      .eq('id', move.id);
    if (error) {
      return {
        ok: false,
        error:
          `Deleted, but renumbering failed moving to index ${move.targetIndex}: ` +
          `${error.message}. Indexes are now inconsistent — fix before compiling.`,
      };
    }
  }

  await invalidateCompiledTargets(bookId);
  revalidatePath(`/admin/books/${bookId}`);
  return { ok: true };
}

/**
 * Renews or clears a hosting term.
 *
 * Blank means no term, which denies public access — public.book_is_live()
 * treats a null expiry as closed so a half-set-up book is never viewable.
 */
export async function setExpiry(
  bookId: string,
  expiryDate: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();

  const value = expiryDate.trim();
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: 'Date must be yyyy-mm-dd.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('books')
    .update({ expiry_date: value || null })
    .eq('id', bookId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/books/${bookId}`);
  return { ok: true };
}

/**
 * The kill switch for a leaked QR code, and its reverse.
 *
 * Revoking takes effect on the next public request. It cannot be undone by
 * reprinting: the id in the printed code IS the credential, so a genuinely
 * leaked book needs a new id, not a new print of the same one.
 */
export async function setRevoked(
  bookId: string,
  revoked: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase
    .from('books')
    .update({
      revoked_at: revoked ? new Date().toISOString() : null,
      revoked_reason: revoked ? 'Revoked from admin' : null,
    })
    .eq('id', bookId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/books/${bookId}`);
  return { ok: true };
}

/**
 * Reorders the pages of a book.
 *
 * Takes memory ids in their new visual order and assigns 0..N-1. The rule
 * itself lives in src/lib/target-mapping.ts, where it is unit tested — this
 * function only talks to the database.
 *
 * Writes happen inside a gap: every affected row is moved far out of range
 * first, then into its final slot. A reorder is not a compaction, so two rows
 * routinely want to swap places, and without the gap the unique
 * (book_id, target_index) constraint trips on the first write.
 */
export async function reorderMemories(
  bookId: string,
  idsInNewOrder: string[],
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();

  const supabase = await createClient();

  const { data: current } = await supabase
    .from('memories')
    .select('id, target_index')
    .eq('book_id', bookId)
    .order('target_index');

  const items = (current ?? []).map((row) => ({
    id: row.id as string,
    targetIndex: row.target_index as number,
  }));

  // Refuse anything that is not a permutation of this book's pages. A missing
  // or foreign id would leave holes, and a hole silently shifts every later
  // photo onto the wrong video.
  const known = new Set(items.map((i) => i.id));
  if (
    idsInNewOrder.length !== items.length ||
    new Set(idsInNewOrder).size !== idsInNewOrder.length ||
    idsInNewOrder.some((id) => !known.has(id))
  ) {
    return { ok: false, error: 'That ordering does not match this book.' };
  }

  const moves = reindexAfterReorder(items, idsInNewOrder);
  if (moves.length === 0) return { ok: true };

  const PARK = 100_000;

  for (const [offset, move] of moves.entries()) {
    const { error } = await supabase
      .from('memories')
      .update({ target_index: PARK + offset })
      .eq('id', move.id)
      .eq('book_id', bookId);
    if (error) return { ok: false, error: `Could not reorder: ${error.message}` };
  }

  for (const move of moves) {
    const { error } = await supabase
      .from('memories')
      .update({ target_index: move.targetIndex })
      .eq('id', move.id)
      .eq('book_id', bookId);
    if (error) {
      return {
        ok: false,
        error:
          `Reorder failed partway at page ${move.targetIndex + 1}: ` +
          `${error.message}. Page order is inconsistent — fix before compiling.`,
      };
    }
  }

  await invalidateCompiledTargets(bookId);
  revalidatePath(`/admin/books/${bookId}`);
  return { ok: true };
}

/**
 * Marks a book ready to compile.
 *
 * Compiling is the point of no return before print: the target file it
 * produces is what the printed QR codes will be matched against. So the
 * preconditions are checked here, once, rather than being left to whoever
 * happens to open the compiler.
 *
 * Every check guards a failure that is invisible until a customer is holding
 * the finished book.
 */
export async function markReady(
  bookId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('memories')
    .select('id, target_index, page_label, photo_object_key, video_object_key, feature_points_total')
    .eq('book_id', bookId)
    .order('target_index');

  const memories = rows ?? [];
  if (memories.length === 0) {
    return { ok: false, error: 'This book has no pages yet.' };
  }

  const incomplete = memories.filter(
    (m) => !m.photo_object_key || !m.video_object_key,
  );
  if (incomplete.length > 0) {
    return {
      ok: false,
      error:
        `${incomplete.length} page(s) are missing a photo or a video. ` +
        'Finish or delete them first — a half-uploaded page would be ' +
        'skipped by the compiler and shift every later page onto the wrong video.',
    };
  }

  const positioned = memories.map((m) => ({
    id: m.id as string,
    targetIndex: m.target_index as number,
  }));
  if (!isContiguousFromZero(positioned)) {
    return {
      ok: false,
      error:
        'Page numbering has a gap. Reorder the pages to close it before ' +
        'compiling, or videos will play on the wrong photos.',
    };
  }

  // Trackability is only known after a compile, so this can only catch photos
  // measured on a previous run. It is a backstop, not the first line of
  // defence — that is the check at upload time.
  const unusable = memories.filter(
    (m) => rateTrackability(m.feature_points_total as number | null) === 'unusable',
  );
  if (unusable.length > 0) {
    const names = unusable
      .map((m) => (m.page_label as string | null) ?? `page ${(m.target_index as number) + 1}`)
      .join(', ');
    return {
      ok: false,
      error:
        `These photos scored too low to track reliably: ${names}. ` +
        'Replace them before printing.',
    };
  }

  const { error } = await supabase
    .from('books')
    .update({ status: 'ready' })
    .eq('id', bookId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/books/${bookId}`);
  return { ok: true };
}
