'use client';

import { useRef, useState } from 'react';

import type { Locale } from '@/lib/i18n';

type Copy = {
  tapForSound: string;
  cantLoad: string;
  retry: string;
};

/**
 * The no-camera player.
 *
 * Same presentation as a scan: the video fills the frame at the printed
 * photo's aspect ratio, on ink, with sound behind one tap.
 *
 * Muted autoplay first. iOS blocks autoplay with sound and no amount of
 * cleverness changes that, so the unmute control is part of the design rather
 * than an apology for it.
 */
export function MemoryPlayer({
  videoUrl,
  posterUrl,
  photoAspect,
  locale,
  copy,
}: {
  videoUrl: string;
  posterUrl: string | null;
  photoAspect: number | null;
  locale: Locale;
  copy: Copy;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  // The printed photo's ratio, not the video's — a video exported at a
  // different ratio is letterboxed by object-cover rather than stretched.
  const aspect = photoAspect && photoAspect > 0 ? 1 / photoAspect : undefined;

  function unmute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    void video.play().catch(() => {
      /* a blocked play leaves the control visible, which is the right fallback */
      setMuted(true);
      video.muted = true;
    });
  }

  function retry() {
    setFailed(false);
    const video = videoRef.current;
    if (!video) return;
    video.load();
    void video.play().catch(() => setFailed(true));
  }

  if (failed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
        <p className="text-sm">{copy.cantLoad}</p>
        <button
          onClick={retry}
          className="bg-paper text-ink hover:bg-grey-5 min-h-12 rounded-full px-8 text-sm font-medium transition-colors"
        >
          {copy.retry}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <div
        className="bg-grey-1 relative w-full overflow-hidden"
        style={aspect ? { aspectRatio: String(aspect) } : undefined}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          poster={posterUrl ?? undefined}
          className="h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          // Older iOS reads the attribute form, which React does not emit.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...({ 'webkit-playsinline': 'true' } as any)}
          controls={!muted}
          onError={() => setFailed(true)}
        />
      </div>

      {muted ? (
        <div className="px-8 pt-8">
          <button
            onClick={unmute}
            lang={locale}
            className="bg-paper text-ink hover:bg-grey-5 flex min-h-12 w-full items-center justify-center rounded-full px-8 text-base font-medium transition-colors"
          >
            {copy.tapForSound}
          </button>
        </div>
      ) : null}
    </div>
  );
}
