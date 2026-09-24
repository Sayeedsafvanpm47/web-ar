'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { setExpiry, setRevoked } from './actions';

export function SettingsForm({
  bookId,
  expiryDate,
  revokedAt,
}: {
  bookId: string;
  expiryDate: string | null;
  revokedAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [value, setValue] = useState(expiryDate ?? '');

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      setSaved(false);
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Failed');
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="expiry">Hosting expires</Label>
          <Input
            id="expiry"
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setExpiry(bookId, value))}
        >
          Save
        </Button>
        {saved ? (
          <span className="text-sm text-green-700">Saved.</span>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">
        Blank denies public access. The book stops resolving the day after this
        date.
      </p>

      <div className="border-t pt-4">
        {revokedAt ? (
          <div className="space-y-2">
            <p className="text-sm">
              Revoked {new Date(revokedAt).toLocaleString()}.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setRevoked(bookId, false))}
            >
              Un-revoke
            </Button>
            <p className="text-muted-foreground text-xs">
              Only do this if the code was never actually exposed. The printed
              id cannot be changed, so un-revoking restores access for anyone
              who has it.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setRevoked(bookId, true))}
            >
              Revoke access
            </Button>
            <p className="text-muted-foreground text-xs">
              Kill switch for a leaked QR code. Takes effect immediately.
              Reprinting the same code will not help — a leaked book needs a
              new id.
            </p>
          </div>
        )}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
