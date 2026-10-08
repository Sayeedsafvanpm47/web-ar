import { headers } from 'next/headers';

import {
  CustomerShell,
  Eyebrow,
  LanguageToggle,
  QuietLink,
  StateScreen,
} from '@/components/customer/chrome';
import { getDictionary, resolveLocale } from '@/lib/i18n';
import { lookupPublicBook } from '@/lib/public-book';

import { DownloadList } from './download-list';

export const metadata = {
  title: 'Your videos',
  robots: { index: false, follow: false },
};

/**
 * The customer's own videos, downloadable.
 *
 * Note what this page does NOT do: it renders no signed URL. The list is just
 * ids and page numbers, and a URL is minted only when someone taps Download.
 */
export default async function DownloadsPage({
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
  const path = `/b/${bookId}/downloads`;

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
          {t.downloads.back}
        </QuietLink>
        <LanguageToggle locale={locale} path={path} />
      </header>

      <main className="flex-1 px-8 py-10">
        <Eyebrow>{book.title}</Eyebrow>
        <h1 className="font-display mt-3 text-[2rem] leading-tight tracking-tight">
          {t.downloads.title}
        </h1>
        <p className="text-grey-3 mt-4 text-sm leading-relaxed">
          {t.downloads.intro}
        </p>

        <div className="mt-10">
          <DownloadList
            bookId={book.id}
            items={book.memories.map((m, i) => ({
              id: m.id,
              label: t.downloads.page(i + 1),
            }))}
            copy={{
              action: t.downloads.action,
              preparing: t.downloads.preparing,
              failed: t.downloads.failed,
            }}
          />
        </div>
      </main>
    </CustomerShell>
  );
}
