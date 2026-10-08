import { headers } from 'next/headers';
import Link from 'next/link';

import {
  CustomerShell,
  Eyebrow,
  LanguageToggle,
  QuietLink,
  StateScreen,
  localeHref,
} from '@/components/customer/chrome';
import { getDictionary, resolveLocale } from '@/lib/i18n';
import { lookupPublicBook } from '@/lib/public-book';

export const metadata = {
  title: 'Watch without the camera',
  robots: { index: false, follow: false },
};

/**
 * Every page in the book, as a plain list.
 *
 * This is the route the entry screen offers when the camera route is
 * unavailable or unwanted, and it is where the small per-page QR codes lead if
 * someone scans one without a working camera path. No media is signed here —
 * each page signs its own video when opened.
 */
export default async function PagesIndex({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ bookId }, { lang }, headerList] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);

  const locale = resolveLocale(lang, headerList.get('accept-language'));
  const t = getDictionary(locale);
  const path = `/b/${bookId}/pages`;

  const result = await lookupPublicBook(bookId);

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

  const { book } = result;

  return (
    <CustomerShell locale={locale}>
      <header className="flex items-center justify-between px-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <QuietLink href={`/b/${book.id}`} locale={locale}>
          {t.player.back}
        </QuietLink>
        <LanguageToggle locale={locale} path={path} />
      </header>

      <main className="flex-1 px-8 py-10">
        <Eyebrow>{t.entry.eyebrow}</Eyebrow>
        <h1 className="font-display mt-3 text-[2rem] leading-tight tracking-tight">
          {book.title}
        </h1>

        <ul className="mt-10">
          {book.memories.map((m, i) => (
            <li key={m.id} className="border-grey-5 border-t last:border-b">
              <Link
                href={localeHref(`/b/${book.id}/m/${m.id}`, locale)}
                className="hover:bg-grey-6 flex min-h-16 items-center gap-5 px-1 transition-colors"
              >
                <span className="bp-eyebrow text-grey-4 tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-sm">{t.downloads.page(i + 1)}</span>
                <span className="text-grey-4 ms-auto text-lg" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <footer className="px-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <QuietLink href={`/b/${book.id}/downloads`} locale={locale}>
          {t.entry.downloads}
        </QuietLink>
      </footer>
    </CustomerShell>
  );
}
