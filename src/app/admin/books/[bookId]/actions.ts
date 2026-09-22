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

  // Confirm the book exists and is visible to this staff member under RLS.
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

  revalidatePath(`/admin/books/${bookId}`);
  return { ok: true };
}

/**
 * Removes a memory and its stored files.
 *
 * Storage first: if the row went first and the delete failed, the objects
 * would be orphaned with nothing left pointing at them. A failed object
 * delete leaves the row intact and the operation retryable.
 */
export async function deleteMemory(
  bookId: string,
  memoryId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();

  try {
    await deleteObject(photoKey(bookId, memoryId));
    await deleteObject(videoKey(bookId, memoryId));
  } catch (err) {
    return {
      ok: false,
      error: `Could not delete the stored files: ${(err as Error).message}`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('memories')
    .delete()
    .eq('id', memoryId)
    .eq('book_id', bookId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/books/${bookId}`);
  return { ok: true };
}
