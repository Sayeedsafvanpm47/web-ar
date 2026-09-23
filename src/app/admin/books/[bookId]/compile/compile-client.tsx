'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { saveCompileResult, signMindUpload, type TargetStat } from './actions';

/**
 * MindAR's compiler only runs in a browser — the package ships no CLI — so
 * compiling happens here, in an admin page, rather than on the server.
 *
 * The bundle is an ES module that imports a sibling chunk and then hangs
 * window.MINDAR.IMAGE off the global. Loading it as a classic script fails
 * silently. See CLAUDE.md.
 */
const COMPILER_URL =
  'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js';

type MindCompiler = {
  compileImageTargets: (
    images: HTMLImageElement[],
    onProgress: (pct: number) => void,
  ) => Promise<CompiledTarget[]>;
  exportData: () => Promise<ArrayBuffer>;
};

type CompiledTarget = {
  targetImage: { width: number; height: number };
  matchingData: { maximaPoints?: unknown[]; minimaPoints?: unknown[] }[];
};

declare global {
  interface Window {
    MINDAR?: { IMAGE?: { Compiler: new () => MindCompiler } };
  }
}

function loadCompiler(): Promise<new () => MindCompiler> {
  if (window.MINDAR?.IMAGE?.Compiler) {
    return Promise.resolve(window.MINDAR.IMAGE.Compiler);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module'; // required — the bundle is an ES module
    script.src = COMPILER_URL;
    script.onload = () => {
      // The module assigns window.MINDAR during evaluation.
      const Compiler = window.MINDAR?.IMAGE?.Compiler;
      if (Compiler) resolve(Compiler);
      else reject(new Error('MindAR loaded but window.MINDAR.IMAGE is missing'));
    };
    script.onerror = () => reject(new Error('Could not load the MindAR compiler'));
    document.head.appendChild(script);
  });
}

/** crossOrigin is required or the canvas the compiler draws into is tainted. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error(
          'Could not load a photo from R2. If the bucket CORS policy does not ' +
            'allow GET from this origin, the browser blocks it.',
        ),
      );
    img.src = url;
  });
}

export type CompileTarget = {
  memoryId: string;
  targetIndex: number;
  pageLabel: string | null;
  photoUrl: string;
};

type Phase = 'idle' | 'loading' | 'compiling' | 'uploading' | 'saving' | 'done';

export function CompileClient({
  bookId,
  targets,
}: {
  bookId: string;
  targets: CompileTarget[];
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TargetStat[] | null>(null);

  async function run() {
    setError(null);
    setStats(null);

    try {
      setPhase('loading');
      const Compiler = await loadCompiler();

      // Order is everything: index in this array becomes targetIndex in the
      // .mind file, and the .mind stores no names to check against.
      const ordered = [...targets].sort((a, b) => a.targetIndex - b.targetIndex);
      const images = await Promise.all(ordered.map((t) => loadImage(t.photoUrl)));

      setPhase('compiling');
      setPct(0);
      const compiler = new Compiler();
      const dataList = await compiler.compileImageTargets(images, (p) =>
        setPct(Math.round(p)),
      );

      const measured: TargetStat[] = dataList.map((target, i) => {
        const perScale = (target.matchingData ?? []).map(
          (m) =>
            (m.maximaPoints?.length ?? 0) + (m.minimaPoints?.length ?? 0),
        );
        return {
          memoryId: ordered[i].memoryId,
          targetIndex: ordered[i].targetIndex,
          featurePointsTotal: perScale.reduce((a, b) => a + b, 0),
          featurePointsCoarsest: perScale.at(-1) ?? 0,
        };
      });

      setPhase('uploading');
      const buffer = await compiler.exportData();

      const signed = await signMindUpload(bookId);
      if (!signed.ok) throw new Error(signed.error);

      const put = await fetch(signed.url, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: buffer,
      });
      if (!put.ok) throw new Error(`R2 rejected the .mind upload (${put.status})`);

      setPhase('saving');
      const saved = await saveCompileResult(bookId, measured);
      if (!saved.ok) throw new Error(saved.error ?? 'Could not save.');

      setStats(measured);
      setPhase('done');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPhase('idle');
    }
  }

  const label: Record<Phase, string> = {
    idle: 'Compile targets',
    loading: 'Loading compiler…',
    compiling: `Compiling ${pct}%`,
    uploading: 'Uploading targets.mind…',
    saving: 'Saving scores…',
    done: 'Compile again',
  };

  const busy = phase !== 'idle' && phase !== 'done';

  return (
    <div className="space-y-4">
      <Button onClick={run} disabled={busy || targets.length === 0}>
        {label[phase]}
      </Button>

      {phase === 'compiling' ? (
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded">
          <div
            className="bg-primary h-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {stats ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Trackability</p>
          <ul className="space-y-1 text-sm">
            {stats.map((s) => {
              const weak = s.featurePointsCoarsest < 20;
              const poor = s.featurePointsTotal < 400;
              return (
                <li key={s.memoryId} className="flex items-center gap-2">
                  <span className="tabular-nums">#{s.targetIndex}</span>
                  <span className="tabular-nums">
                    {s.featurePointsTotal} points
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    ({s.featurePointsCoarsest} at coarsest scale)
                  </span>
                  <Badge variant={poor || weak ? 'secondary' : 'default'}>
                    {poor
                      ? 'weak — may not detect'
                      : weak
                        ? 'close range only'
                        : 'good'}
                  </Badge>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground text-xs">
            Total points is how much detail there is to match. Points at the
            coarsest scale predict whether the photo still tracks from a
            distance rather than only close up. Low numbers usually mean a flat,
            blurry or repetitive image.
          </p>
        </div>
      ) : null}
    </div>
  );
}
