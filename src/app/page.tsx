import Link from 'next/link';

export const metadata = {
  title: 'Living Memories',
  description: 'Printed photo books that play your videos.',
};

/**
 * Public root. There is deliberately nothing here to browse.
 *
 * Books are reached only through the QR code printed inside them — the id in
 * that link is the credential, so there is no index, no search, and no way to
 * discover a book from this page.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-8 py-12">
      <header>
        <p className="bp-eyebrow text-grey-4">Black Pearl</p>
      </header>

      <div className="flex flex-1 flex-col justify-center py-16">
        <h1 className="font-display text-[2.75rem] leading-[1.02] tracking-tight">
          Living Memories
        </h1>
        <p className="text-grey-3 mt-5 text-sm leading-relaxed">
          Printed photo books that play your videos. Scan the QR code inside
          your book to watch them.
        </p>

        <div className="bg-grey-5 mt-10 h-px w-full" />

        <p className="text-grey-4 mt-6 text-xs leading-relaxed">
          Books open only from their own printed link. There is nothing to
          browse here.
        </p>
      </div>

      <footer className="flex items-center justify-between">
        <a
          href="https://www.blackpearlqa.com"
          className="bp-eyebrow text-grey-4 hover:text-ink transition-colors"
        >
          blackpearlqa.com
        </a>
        <Link
          href="/admin"
          className="bp-eyebrow text-grey-4 hover:text-ink transition-colors"
        >
          Staff
        </Link>
      </footer>
    </main>
  );
}
