'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { deleteMemory, reorderMemories } from './actions';

export type MemoryView = {
  id: string;
  target_index: number;
  page_label: string | null;
  photo_object_key: string | null;
  video_object_key: string | null;
  photo_aspect: number | null;
  video_duration_seconds: number | null;
  feature_points_total: number | null;
  feature_points_coarsest: number | null;
  photoUrl: string | null;
};

/**
 * The pages of a book, reorderable.
 *
 * Order is not cosmetic here: position in this list becomes the position in
 * the compiled target file, which is the only thing binding a printed photo to
 * its video. Reordering therefore invalidates the compiled file, and the page
 * says so rather than letting staff think the change is already live.
 *
 * Drag is offered for speed, and Move up / Move down for everything drag is
 * bad at — touch, keyboards, and anyone who finds drop targets fiddly.
 */
export function MemoryList({
  bookId,
  memories,
}: {
  bookId: string;
  memories: MemoryView[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [order, setOrder] = useState(memories);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Note: there is no effect syncing `memories` into state. The parent keys
  // this component on the server's ordering, so a refresh after an upload,
  // delete or saved reorder remounts it with the new data as the initial
  // value. Copying props into state in an effect would render stale rows for
  // a frame first.

  function move(index: number, delta: number) {
    const next = [...order];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setOrder(next);
    setDirty(true);
  }

  function drop(targetId: string) {
    if (!dragging || dragging === targetId) return;
    const next = [...order];
    const from = next.findIndex((m) => m.id === dragging);
    const to = next.findIndex((m) => m.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    setDirty(true);
    setDragging(null);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await reorderMemories(
        bookId,
        order.map((m) => m.id),
      );
      if (!res.ok) setError(res.error ?? 'Could not save the new order.');
      else {
        setDirty(false);
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    setError(null);
    start(async () => {
      const res = await deleteMemory(bookId, id);
      if (!res.ok) setError(res.error ?? 'Could not delete.');
      else router.refresh();
    });
  }

  if (order.length === 0) {
    return <p className="text-muted-foreground text-sm">No pages yet.</p>;
  }

  return (
    <div className="space-y-4">
      {dirty ? (
        <div className="flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
          <span className="flex-1">
            Page order changed. Saving will clear the compiled target file —
            the book must be recompiled before it can be scanned.
          </span>
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save order'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setOrder(memories);
              setDirty(false);
            }}
            disabled={pending}
          >
            Undo
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <ul className="divide-y rounded-md border">
        {order.map((m, i) => {
          const complete = Boolean(m.photo_object_key && m.video_object_key);
          const weak =
            m.feature_points_total !== null && m.feature_points_total < 400;
          return (
            <li
              key={m.id}
              draggable
              onDragStart={() => setDragging(m.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(m.id)}
              onDragEnd={() => setDragging(null)}
              className={`flex items-center gap-4 p-3 ${
                dragging === m.id ? 'opacity-40' : ''
              }`}
            >
              <span
                className="text-muted-foreground cursor-grab select-none text-lg"
                aria-hidden="true"
              >
                ⠿
              </span>
              <span className="text-muted-foreground w-8 tabular-nums">
                {i + 1}
              </span>

              {m.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.photoUrl}
                  alt=""
                  className="h-12 w-12 rounded object-cover"
                />
              ) : (
                <div className="bg-muted h-12 w-12 rounded" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.page_label ?? 'Untitled page'}
                </p>
                <p className="text-muted-foreground text-xs">
                  {m.photo_aspect ? `ratio ${m.photo_aspect.toFixed(3)}` : 'no ratio'}
                  {m.video_duration_seconds
                    ? ` · ${Math.round(m.video_duration_seconds)}s`
                    : ''}
                  {m.feature_points_total !== null
                    ? ` · ${m.feature_points_total} points`
                    : ' · not compiled'}
                </p>
              </div>

              {!complete ? <Badge variant="secondary">incomplete</Badge> : null}
              {weak ? <Badge variant="secondary">weak photo</Badge> : null}

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || pending}
                  aria-label="Move up"
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1 || pending}
                  aria-label="Move down"
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (
                      confirm(
                        `Delete "${m.page_label ?? 'this page'}"? The photo and video are removed from storage.`,
                      )
                    ) {
                      remove(m.id);
                    }
                  }}
                  disabled={pending}
                >
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
