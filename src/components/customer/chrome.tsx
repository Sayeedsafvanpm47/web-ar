import Link from 'next/link';

import {
  dir,
  getDictionary,
  supportLink,
  type Locale,
} from '@/lib/i18n';

/**
 * Shared customer chrome.
 *
 * Everything here is monochrome by construction — ink, paper and the grey
 * ramp, nothing else — and every string comes from the dictionary, so a screen
 * cannot accidentally ship untranslated.
 *
 * `dir` is set on a wrapper rather than <html> because the root layout is
 * shared with /admin, which is always English and left-to-right. Setting it
 * here keeps the Arabic viewer correct without making admin pay for it.
 */

/** Carries the chosen language through internal navigation. */
export function localeHref(href: string, locale: Locale): string {
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}lang=${locale}`;
}

export function CustomerShell({
  locale,
  children,
  tone = 'paper',
}: {
  locale: Locale;
  children: React.ReactNode;
  /**
   * paper for everything before the book opens; ink for playback. The switch
   * to dark is the moment the book opens, not a theme.
   */
  tone?: 'paper' | 'ink';
}) {
  const ink = tone === 'ink';
  return (
    <div
      dir={dir(locale)}
      lang={locale}
      className={[
        'flex min-h-dvh w-full flex-col',
        ink ? 'bg-ink text-paper' : 'bg-paper text-ink',
        locale === 'ar' ? 'font-arabic' : '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  tone = 'paper',
}: {
  children: React.ReactNode;
  tone?: 'paper' | 'ink';
}) {
  return (
    <p
      className={`bp-eyebrow ${tone === 'ink' ? 'text-grey-4' : 'text-grey-4'}`}
    >
      {children}
    </p>
  );
}

/**
 * The single support action. Present on every error and empty state, per
 * CLAUDE.md.
 *
 * The prefilled message carries the book's short reference, never the book id
 * — the id is the access credential and must not end up pasted into a chat
 * thread, forwarded, or sitting in a screenshot.
 */
export function SupportButton({
  locale,
  reference,
  tone = 'paper',
}: {
  locale: Locale;
  reference: string | null;
  tone?: 'paper' | 'ink';
}) {
  const t = getDictionary(locale);
  return (
    <a
      href={supportLink(locale, reference)}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        'flex min-h-12 w-full items-center justify-center rounded-full px-8 text-base font-medium transition-colors',
        tone === 'ink'
          ? 'bg-paper text-ink hover:bg-grey-5'
          : 'bg-ink text-paper hover:bg-grey-2',
      ].join(' ')}
    >
      {t.support.action}
    </a>
  );
}

/** Secondary action. Shown by underline and weight, never colour. */
export function QuietLink({
  href,
  locale,
  children,
  external = false,
}: {
  href: string;
  locale: Locale;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className =
    'bp-underline text-grey-3 hover:text-ink inline-flex min-h-12 items-center text-sm transition-colors';
  if (external) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={localeHref(href, locale)} className={className}>
      {children}
    </Link>
  );
}

export function LanguageToggle({
  locale,
  path,
}: {
  locale: Locale;
  path: string;
}) {
  const other: Locale = locale === 'en' ? 'ar' : 'en';
  return (
    <Link
      href={localeHref(path, other)}
      hrefLang={other}
      className="bp-eyebrow text-grey-4 hover:text-ink min-h-12 transition-colors inline-flex items-center"
    >
      {getDictionary(locale).switchTo}
    </Link>
  );
}

/**
 * The shape every non-playable outcome takes: a heading, a sentence, and
 * exactly one thing to do about it.
 */
export function StateScreen({
  locale,
  path,
  heading,
  body,
  reference,
}: {
  locale: Locale;
  path: string;
  heading: string;
  body: string;
  reference: string | null;
}) {
  const t = getDictionary(locale);
  return (
    <CustomerShell locale={locale}>
      <header className="flex items-center justify-between px-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <Eyebrow>{t.brand}</Eyebrow>
        <LanguageToggle locale={locale} path={path} />
      </header>

      <main className="flex flex-1 flex-col justify-center px-8 text-center">
        <h1 className="font-display text-3xl leading-tight tracking-tight">
          {heading}
        </h1>
        <p className="text-grey-3 mt-4 text-sm leading-relaxed">{body}</p>
      </main>

      <footer className="px-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <SupportButton locale={locale} reference={reference} />
      </footer>
    </CustomerShell>
  );
}
