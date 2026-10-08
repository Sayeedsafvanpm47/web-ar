/**
 * A signed playback URL for one page, minted on demand.
 *
 * The scanner used to carry a signed URL for every video in the document. This
 * route exists so it carries none: the page ships memory ids, and asks for a
 * URL only when that photo is actually found.
 *
 * That matters for two reasons. A document holding N signed URLs has handed
 * out N live credentials to anything that can read the HTML — a screenshot, a
 * shared tab, browser history. And the URLs start expiring the moment the page
 * loads, so a customer who lingers on the intro screen finds that the videos
 * died before they ever pressed start.
 *
 * Authorisation is the same as everywhere else: lookupPublicBook() re-runs the
 * full gate, so a revoked, expired or unknown book yields nothing here either.
 */
import { type NextRequest } from 'next/server';

import { lookupPublicBook } from '@/lib/public-book';
import { scanTtl, signDownload, videoKey } from '@/lib/r2';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // A signed URL must never sit in a shared cache.
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string; memoryId: string }> },
) {
  const { bookId, memoryId } = await params;

  const result = await lookupPublicBook(bookId);
  if (result.status !== 'ok') {
    // Deliberately uniform: the status here must not reveal which of
    // unknown / revoked / expired applies.
    return json({ error: 'unavailable' }, 404);
  }

  const memory = result.book.memories.find((m) => m.id === memoryId);
  if (!memory) return json({ error: 'unavailable' }, 404);

  try {
    const url = await signDownload(videoKey(bookId, memory.id), scanTtl());
    return json({ url }, 200);
  } catch (err) {
    console.error('media route failed to sign', err);
    return json({ error: 'unavailable' }, 503);
  }
}
