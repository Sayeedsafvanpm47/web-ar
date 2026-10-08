'use client';

import { useState } from 'react';

import { requestDownload } from './actions';

type Item = { id: string; label: string };

export function DownloadList({
  bookId,
  items,
  copy,
}: {
  bookId: string;
  items: Item[];
  copy: { action: string; preparing: string; failed: string };
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function start(memoryId: string) {
    setBusy(memoryId);
    setFailed(null);
    const result = await requestDownload(bookId, memoryId);
    setBusy(null);

    if ('error' in result) {
      setFailed(memoryId);
      return;
    }

    // Navigating to the signed URL lets the browser and OS handle the save,
    // which is the only thing that works consistently across iOS and Android.
    window.location.assign(result.url);
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-grey-5 border-t last:border-b">
          <div className="flex min-h-16 items-center gap-5 px-1">
            <span className="text-sm">{item.label}</span>
            <button
              onClick={() => start(item.id)}
              disabled={busy === item.id}
              className="bp-underline text-grey-3 hover:text-ink ms-auto min-h-12 text-sm transition-colors disabled:opacity-50"
            >
              {busy === item.id ? copy.preparing : copy.action}
            </button>
          </div>
          {failed === item.id ? (
            <p className="text-grey-3 pb-3 text-xs">{copy.failed}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
