'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { confirmUpload, startUpload } from './actions';

type Phase = 'idle' | 'preparing' | 'photo' | 'video' | 'saving';

/** Reads a photo's aspect ratio (height / width) without uploading it. */
function readPhotoAspect(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth > 0) {
        resolve(img.naturalHeight / img.naturalWidth);
      } else {
        reject(new Error('Could not read image dimensions'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the image'));
    };
    img.src = url;
  });
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? v.duration : 0);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    v.src = url;
  });
}

/** PUTs one file straight to R2 and reports progress. */
function putToR2(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error(
              `R2 rejected the upload (HTTP ${xhr.status}). If this is 0 or a ` +
                'CORS error, the bucket CORS policy is not set.',
            ),
          );
    xhr.onerror = () =>
      reject(
        new Error(
          'Upload failed before reaching R2 — almost always a missing bucket ' +
            'CORS policy.',
        ),
      );
    xhr.send(file);
  });
}

export function MemoryUploader({ bookId }: { bookId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== 'idle';

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const photo = form.get('photo') as File | null;
    const video = form.get('video') as File | null;
    const pageLabel = String(form.get('page_label') ?? '').trim();

    if (!photo?.size || !video?.size) {
      setError('Choose both a photo and a video.');
      return;
    }

    try {
      setPhase('preparing');
      const [photoAspect, videoDurationSeconds] = await Promise.all([
        readPhotoAspect(photo),
        readVideoDuration(video),
      ]);

      const started = await startUpload({
        bookId,
        pageLabel,
        photoType: photo.type,
        photoBytes: photo.size,
        videoType: video.type,
        videoBytes: video.size,
        photoAspect,
        videoDurationSeconds,
      });

      if (!started.ok) {
        setError(started.error);
        setPhase('idle');
        return;
      }

      setPhase('photo');
      setPct(0);
      await putToR2(started.photoUrl, photo, setPct);

      setPhase('video');
      setPct(0);
      await putToR2(started.videoUrl, video, setPct);

      setPhase('saving');
      const confirmed = await confirmUpload(bookId, started.memoryId);
      if (!confirmed.ok) {
        setError(confirmed.error ?? 'Could not save.');
        setPhase('idle');
        return;
      }

      formRef.current?.reset();
      setPhase('idle');
      setPct(0);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPhase('idle');
    }
  }

  const phaseLabel: Record<Phase, string> = {
    idle: 'Add memory',
    preparing: 'Reading files…',
    photo: `Uploading photo ${pct}%`,
    video: `Uploading video ${pct}%`,
    saving: 'Saving…',
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="page_label">Page label</Label>
        <Input id="page_label" name="page_label" placeholder="e.g. Ceremony" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="photo">Photo (JPEG or PNG)</Label>
        <Input id="photo" name="photo" type="file" accept="image/jpeg,image/png" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="video">Video (MP4)</Label>
        <Input id="video" name="video" type="file" accept="video/mp4" required />
      </div>

      <div className="sm:col-span-3 space-y-2">
        <Button type="submit" disabled={busy}>
          {phaseLabel[phase]}
        </Button>
        {busy && (phase === 'photo' || phase === 'video') ? (
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded">
            <div
              className="bg-primary h-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p className="text-muted-foreground text-xs">
          Files go straight from this browser to R2 and never pass through the
          app server. The photo&apos;s aspect ratio is read here and stored, because
          the AR plane must match the printed photo, not the video.
        </p>
      </div>
    </form>
  );
}
