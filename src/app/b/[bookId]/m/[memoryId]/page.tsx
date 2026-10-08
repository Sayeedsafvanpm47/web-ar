import { headers } from 'next/headers';

import {
  CustomerShell,
  LanguageToggle,
  QuietLink,
  StateScreen,
} from '@/components/customer/chrome';
import { getDictionary, resolveLocale } from '@/lib/i18n';
import { lookupPublicMemory } from '@/lib/public-book';

export const metadata = {
  title: 'Live photo book',
  robots: { index: false, follow: false },
};

/**
 * One page's video, without the camera.
 *
 * This is where the small QR printed on each page leads. CLAUDE.md treats it
 * as part of the product rather than a fallback: if the camera path fails for
 * any reason — permission denied, poor light, an unsupported browser, a photo
 * that will not track — the customer can still watch their video.
 *
 * It addresses the memory by id, so unlike the scanner it cannot play the
 * wrong page even if the compiled target file has drifted.
 */
export default async function MemoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string; memoryId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ bookId, memoryId }, { lang }, headerList] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);

  const locale = resolveLocale(lang, headerList.get('accept-language'));
  const t = getDictionary(locale);
  const path = `/b/${bookId}/m/${memoryId}`;

  const result = await lookupPublicMemory(bookId, memoryId);

  if (result.status !== 'ok') {
    const copy = {
      'not-found': t.states.notFound,
      revoked: t.states.notFound,
      expired: t.states.expired,
      empty: t.states.empty,
      unavailable: t.states.unavailable,
    }[result.status];
    return (
      <StateScreen
        locale={locale}
        path={path}
        heading={copy.heading}
        body={copy.body}
        reference={'reference' in result ? result.reference : null}
      />
    );
  }

  const { memory } = result;
  const { MemoryPlayer } = await import('./player');

  return (
    <CustomerShell locale={locale} tone="ink">
      <header className="flex items-center justify-between px-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <QuietLink href={`/b/${memory.bookId}/pages`} locale={locale}>
          <span className="text-grey-4">{t.player.back}</span>
        </QuietLink>
        <p className="bp-eyebrow text-grey-4">
          {t.player.page(memory.pageNumber)} / {memory.pageCount}
        </p>
        <LanguageToggle locale={locale} path={path} />
      </header>

      <MemoryPlayer
        videoUrl={memory.videoUrl}
        posterUrl={memory.posterUrl}
        photoAspect={memory.photoAspect}
        locale={locale}
        copy={{
          tapForSound: t.player.tapForSound,
          cantLoad: t.player.cantLoad,
          retry: t.player.retry,
        }}
      />

      <footer className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-center">
        <p className="bp-eyebrow text-grey-4">{memory.bookTitle}</p>
      </footer>
    </CustomerShell>
  );
}
