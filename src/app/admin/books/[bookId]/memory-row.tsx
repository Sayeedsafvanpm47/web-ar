'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';

import { deleteMemory } from './actions';

export type MemoryView = {
  id: string;
  target_index: number;
  page_label: string | null;
  photo_object_key: string | null;
  video_object_key: string | null;
  photo_aspect: number | null;
  video_duration_seconds: number | null;
  photoUrl: string | null;
};

export function MemoryRow({
  bookId,
  memory,
}: {
  bookId: string;
  memory: MemoryView;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const complete = Boolean(memory.photo_object_key && memory.video_object_key);

  return (
    <TableRow>
      <TableCell className="tabular-nums">{memory.target_index}</TableCell>
      <TableCell>
        {memory.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={memory.photoUrl}
            alt=""
            className="h-14 w-14 rounded object-cover"
          />
        ) : (
          <div className="bg-muted h-14 w-14 rounded" />
        )}
      </TableCell>
      <TableCell>{memory.page_label ?? '—'}</TableCell>
      <TableCell className="tabular-nums">
        {memory.photo_aspect ? memory.photo_aspect.toFixed(3) : '—'}
      </TableCell>
      <TableCell className="tabular-nums">
        {memory.video_duration_seconds
          ? `${Math.round(memory.video_duration_seconds)}s`
          : '—'}
      </TableCell>
      <TableCell>
        <Badge variant={complete ? 'default' : 'secondary'}>
          {complete ? 'uploaded' : 'incomplete'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {confirming ? (
          <span className="flex items-center justify-end gap-2">
            <span className="text-muted-foreground text-xs">Delete?</span>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteMemory(bookId, memory.id);
                  if (!res.ok) setError(res.error ?? 'Failed');
                  else router.refresh();
                  setConfirming(false);
                })
              }
            >
              Yes
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
              No
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </TableCell>
    </TableRow>
  );
}
