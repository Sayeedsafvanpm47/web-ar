'use server';

import { signMemoryDownload } from '@/lib/public-book';

/**
 * Mints one download URL, on click.
 *
 * CLAUDE.md requires these to be generated on click rather than at page load.
 * That is not a performance detail: a page that renders ten signed URLs has
 * handed out ten live credentials to anyone who views the HTML, screenshots
 * it, or has it sitting in their browser history. Signing on demand means a
 * URL exists only because someone asked for it, and only for as long as it
 * takes to use.
 *
 * Authorisation comes from signMemoryDownload(), which re-runs the full book
 * lookup — revoked, expired and unknown books return nothing here, exactly as
 * they do everywhere else.
 */
export async function requestDownload(
  bookId: string,
  memoryId: string,
): Promise<{ url: string } | { error: true }> {
  const url = await signMemoryDownload(bookId, memoryId);
  return url ? { url } : { error: true };
}
