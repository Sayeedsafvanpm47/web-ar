import Link from 'next/link';

export const metadata = {
  title: 'Black Pearl Living Memories',
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs tracking-widest uppercase">
          Black Pearl
        </p>
        <h1 className="text-2xl font-semibold">Living Memories</h1>
      </div>

      <p className="text-muted-foreground text-sm">
        Printed photo books that play your videos. Scan the QR code inside your
        book to watch them.
      </p>

      <p className="text-muted-foreground text-xs">
        Books open only from their own link. There is nothing to browse here.
      </p>

      <Link
        href="/admin"
        className="text-muted-foreground mx-auto text-xs underline"
      >
        Staff sign in
      </Link>
    </main>
  );
}
