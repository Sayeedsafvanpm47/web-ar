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
 * The button here rather than an auto-start is deliberate: iOS will not grant
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
        heading: 'We couldn’t find this book',
        body: 'Check the link, or scan the code again. If it still doesn’t work, get in touch and we’ll help.',
      },
      revoked: {
        heading: 'This book has been disabled',
        body: 'Access to this book was turned off. Please contact us and we’ll sort it out.',
      },
      expired: {
        heading: 'This book’s hosting has ended',
        body: 'The videos in this book are no longer being hosted. Get in touch to renew and we’ll bring them back.',
      },
      'not-ready': {
        heading: 'This book isn’t ready yet',
        body: 'We’re still preparing the videos for this book. Please try again shortly.',
      },
      unavailable: {
        heading: 'Something went wrong at our end',
        body: 'This is our problem, not yours, and your videos are safe. Please try again in a few minutes.',
      },
    }[result.status];

    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-8 text-center">
        <p className="bp-eyebrow text-grey-4">Black Pearl</p>
        <h1 className="font-display text-3xl leading-tight tracking-tight">
          {message.heading}
        </h1>
        <p className="text-grey-3 text-sm leading-relaxed">{message.body}</p>
      </main>
    );
  }

  const { book } = result;

  const steps = [
    'Allow camera access when your phone asks.',
    'Hold your phone over a photo in the book.',
    'Keep it steady — the photo starts playing.',
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-8 py-12">
      <header className="flex items-center justify-between">
        <p className="bp-eyebrow text-grey-4">Black Pearl</p>
        <p className="bp-eyebrow text-grey-4">Living Memories</p>
      </header>

      <div className="flex flex-1 flex-col justify-center py-16">
        <h1 className="font-display text-[2.75rem] leading-[1.02] tracking-tight">
          {book.title}
        </h1>

        <div className="bg-grey-5 mt-8 h-px w-full" />

        <ol className="mt-8 space-y-4">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-4">
              <span className="bp-eyebrow text-grey-4 pt-[3px] tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-grey-2 text-sm leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-5">
        <Link
          href={`/b/${book.id}/scan`}
          className="bg-ink text-paper hover:bg-grey-2 flex w-full items-center justify-center rounded-full px-8 py-4 text-base font-medium transition-colors"
        >
          Scan to play
        </Link>

        <p className="text-grey-4 text-center text-xs leading-relaxed">
          {book.memories.length} photo
          {book.memories.length === 1 ? '' : 's'} in this book. Works best in
          good light, with the whole photo in frame.
        </p>
      </div>
    </main>
  );
}
