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
  title: 'Live photo book',
  robots: { index: false, follow: false },
};

/**
 * Public entry from the QR code printed in the book.
 *
 * No login, no account. The book id in the URL is the whole credential, which
 * is why this page shows the title and nothing about the customer.
 *
 * No media is signed here: the entry page plays nothing, and minting a signed
 * URL per video for a page that may never lead to the scanner hands out
 * credentials nobody asked for.
 *
 * The camera is requested on the next screen, never here. iOS will not grant
 * access without a user gesture, and a permission prompt firing unannounced on
 * a funeral book would be awful.
 */
export default async function BookLanding({
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
  const path = `/b/${bookId}`;

  const result = await lookupPublicBook(bookId);

  if (result.status !== 'ok') {
    // 'revoked' shows the same copy as 'not-found' on purpose: the response
    // must not confirm that a given id is real. See scan/route.ts.
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
        <Eyebrow>{t.brand}</Eyebrow>
        <LanguageToggle locale={locale} path={path} />
      </header>

      <main className="flex flex-1 flex-col justify-center px-8 py-12">
        <Eyebrow>{t.entry.eyebrow}</Eyebrow>
        <h1 className="font-display mt-3 text-[2.75rem] leading-[1.02] tracking-tight">
          {book.title}
        </h1>

        <div className="bg-grey-5 mt-8 h-px w-full" />

        <ol className="mt-8 space-y-4">
          {t.entry.steps.map((step, i) => (
            <li key={step} className="flex gap-4">
              <span className="bp-eyebrow text-grey-4 pt-[3px] tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-grey-2 text-sm leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </main>

      <footer className="space-y-5 px-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {book.scannable ? (
          <Link
            href={localeHref(`/b/${book.id}/scan`, locale)}
            className="bg-ink text-paper hover:bg-grey-2 flex min-h-14 w-full items-center justify-center rounded-full px-8 text-base font-medium transition-colors"
          >
            {t.entry.primaryAction}
          </Link>
        ) : null}

        <div className="flex flex-col items-center gap-1">
          {/* Always offered, scannable or not. The camera failing must never
              mean the customer cannot watch their video. */}
          <QuietLink href={`/b/${book.id}/pages`} locale={locale}>
            {t.entry.withoutCamera}
          </QuietLink>
          <QuietLink href={`/b/${book.id}/downloads`} locale={locale}>
            {t.entry.downloads}
          </QuietLink>
        </div>

        <p className="text-grey-4 text-center text-xs leading-relaxed">
          {t.entry.pageCount(book.memories.length)}
          {book.scannable ? ` · ${t.entry.conditions}` : ''}
        </p>
      </footer>
    </CustomerShell>
  );
}
