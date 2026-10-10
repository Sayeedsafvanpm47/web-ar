'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import { markReady } from './actions';

/**
 * The pre-print gate.
 *
 * Compiling is the last moment anything can be corrected for free. Once the
 * codes are printed into a hardback, a wrong target file means a reprint.
 */
export function ReadyButton({
  bookId,
  status,
}: {
  bookId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === 'ready') {
    return (
      <p className="text-muted-foreground text-sm">
        Marked ready. The compiler is unlocked on the compile page.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await markReady(bookId);
            if (!res.ok) setError(res.error ?? 'Could not mark ready.');
            else router.refresh();
          })
        }
      >
        {pending ? 'Checking…' : 'Mark ready to compile'}
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <p className="text-muted-foreground text-xs">
        Checks every page has a photo and a video, that numbering has no gaps,
        and that no photo already measured as untrackable. Each guards a
        failure that is invisible until the book is printed.
      </p>
    </div>
  );
}
