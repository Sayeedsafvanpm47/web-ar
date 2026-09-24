'use server';

import { revalidatePath } from 'next/cache';

import { requireStaff } from '@/lib/auth';
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
};

export type StartUploadResult =
  | {
      ok: true;
      memoryId: string;
      targetIndex: number;
      photoUrl: string;
      videoUrl: string;
    }
  | { ok: false; error: string };

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

  const supabase = await createClient();

  const { data: book } = await supabase
    .from('books')
    .select('id')
    .eq('id', input.bookId)
    .maybeSingle();

  if (!book) return { ok: false, error: 'Book not found.' };

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
    .gt('target_index', removed)
    .order('target_index', { ascending: true });

  // Ascending order matters: each slot below is vacated before the next row
  // moves into it, so the unique (book_id, target_index) constraint never
  // trips mid-renumber.
  for (const row of after ?? []) {
    const { error } = await supabase
      .from('memories')
      .update({ target_index: (row.target_index as number) - 1 })
      .eq('id', row.id as string);
    if (error) {
      return {
        ok: false,
        error:
          `Deleted, but renumbering failed at index ${row.target_index}: ` +
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
