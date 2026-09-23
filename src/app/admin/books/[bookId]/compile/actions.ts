'use server';

import { revalidatePath } from 'next/cache';

import { requireStaff } from '@/lib/auth';
import { mindKey, signUpload } from '@/lib/r2';
import { createClient } from '@/lib/supabase/server';

export type TargetStat = {
  memoryId: string;
  targetIndex: number;
  featurePointsTotal: number;
  featurePointsCoarsest: number;
};

/** Presigned PUT for this book's compiled targets.mind. */
export async function signMindUpload(
  bookId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireStaff();

  const supabase = await createClient();
  const { data: book } = await supabase
    .from('books')
    .select('id')
    .eq('id', bookId)
    .maybeSingle();

  if (!book) return { ok: false, error: 'Book not found.' };

  return {
    ok: true,
    url: await signUpload(mindKey(bookId), 'application/octet-stream'),
  };
}

/**
 * Records a finished compile: the .mind pointer on the book, and the
 * trackability numbers on each memory.
 *
 * Every stat is matched back by memory id rather than by position, so a
 * mismatch between what was compiled and what is in the database shows up as
 * a failed update instead of silently attaching one photo's score to another.
 */
export async function saveCompileResult(
  bookId: string,
  stats: TargetStat[],
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();

  const supabase = await createClient();

  // Guard the binding that CLAUDE.md warns about: the compiled file's
  // positions must line up with target_index, contiguous from zero.
  const { data: memories } = await supabase
    .from('memories')
    .select('id, target_index')
    .eq('book_id', bookId)
    .order('target_index');

  const expected = memories ?? [];

  if (expected.length !== stats.length) {
    return {
      ok: false,
      error: `Compiled ${stats.length} targets but the book has ${expected.length} memories. Not saving.`,
    };
  }

  for (let i = 0; i < expected.length; i++) {
    if (expected[i].target_index !== i) {
      return {
        ok: false,
        error: `Memory indexes are not contiguous from 0 (found ${expected[i].target_index} at position ${i}). Not saving — videos would play on the wrong photos.`,
      };
    }
    if (stats[i].memoryId !== expected[i].id) {
      return {
        ok: false,
        error: `Target ${i} does not match the expected memory. Not saving.`,
      };
    }
  }

  for (const stat of stats) {
    const { error } = await supabase
      .from('memories')
      .update({
        feature_points_total: stat.featurePointsTotal,
        feature_points_coarsest: stat.featurePointsCoarsest,
      })
      .eq('id', stat.memoryId)
      .eq('book_id', bookId);

    if (error) return { ok: false, error: error.message };
  }

  const { error } = await supabase
    .from('books')
    .update({
      mind_object_key: mindKey(bookId),
      mind_compiled_at: new Date().toISOString(),
    })
    .eq('id', bookId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/books/${bookId}`);
  return { ok: true };
}
