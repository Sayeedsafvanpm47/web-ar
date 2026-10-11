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
 * The video is shown WHOLE, at its own aspect ratio — never cropped, never
 * stretched, whatever shape it is. The printed photo's ratio is used only as a
 * placeholder for the first paint, so the page does not jump when the real
 * dimensions arrive on loadedmetadata; after that the video's own ratio wins.
 *
 * It previously forced the photo's ratio with object-cover, which silently cut
 * the sides off a portrait clip on a landscape page. A customer watching their
 * own wedding video should see all of it.
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
  const [videoAspect, setVideoAspect] = useState<number | null>(null);

  // Placeholder only, until the video reports its own dimensions.
  const placeholder = photoAspect && photoAspect > 0 ? 1 / photoAspect : undefined;
  const aspect = videoAspect ?? placeholder;

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
          className="h-full w-full object-contain"
          autoPlay
          loop
          muted
          playsInline
          // Older iOS reads the attribute form, which React does not emit.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...({ 'webkit-playsinline': 'true' } as any)}
          controls={!muted}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            if (el.videoWidth > 0 && el.videoHeight > 0) {
              setVideoAspect(el.videoWidth / el.videoHeight);
            }
          }}
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
