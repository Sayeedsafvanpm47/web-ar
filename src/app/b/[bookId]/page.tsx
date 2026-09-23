import Link from 'next/link';

import { lookupPublicBook } from '@/lib/public-book';

export const metadata = {
  title: 'Living Memories',
  robots: { index: false, follow: false },
};

/**
 * Public entry from the QR code.
 *
 * No login, no account. The book id in the URL is the whole credential, which
 * is why this page shows the book title and nothing about the customer.
 *
 * The Start button on the next page is not decoration: iOS will not grant
 * camera access without a user gesture, and a permission prompt firing
 * unannounced on a funeral book would be awful.
 */
export default async function BookLanding({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const result = await lookupPublicBook(bookId);

  if (result.status !== 'ok') {
    const message = {
      'not-found': {
        heading: 'We could not find this book',
        body: 'Check the link, or scan the code again. If it still does not work, get in touch and we will help.',
      },
      revoked: {
        heading: 'This book has been disabled',
        body: 'Access to this book was turned off. Please contact us and we will sort it out.',
      },
      expired: {
        heading: 'This book’s hosting has ended',
        body: 'The videos in this book are no longer being hosted. Get in touch to renew and we will bring them back.',
      },
      'not-ready': {
        heading: 'This book is not ready yet',
        body: 'We are still preparing the videos for this book. Please try again shortly.',
      },
    }[result.status];

    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-8 text-center">
        <h1 className="text-xl font-semibold">{message.heading}</h1>
        <p className="text-muted-foreground text-sm">{message.body}</p>
      </main>
    );
  }

  const { book } = result;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-8 text-center">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs tracking-widest uppercase">
          Living Memories
        </p>
        <h1 className="text-2xl font-semibold">{book.title}</h1>
      </div>

      <ol className="text-muted-foreground mx-auto max-w-xs space-y-2 text-left text-sm">
        <li>1. Tap Start and allow camera access.</li>
        <li>2. Hold your phone over a photo in the book.</li>
        <li>3. The photo will start playing.</li>
      </ol>

      <Link
        href={`/b/${book.id}/scan`}
        className="bg-primary text-primary-foreground mx-auto w-full max-w-xs rounded-full px-8 py-4 text-lg font-medium"
      >
        Start
      </Link>

      <p className="text-muted-foreground text-xs">
        {book.memories.length} photo
        {book.memories.length === 1 ? '' : 's'} in this book. Works best in
        good light, with the whole photo in view.
      </p>
    </main>
  );
}
