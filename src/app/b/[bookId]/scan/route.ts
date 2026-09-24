/**
 * The MindAR scanner.
 *
 * This is a Route Handler returning a complete HTML document, not a React
 * page, and that is deliberate. CLAUDE.md requires the scanner to be
 * self-contained and not rewritten from memory. The markup below is a direct
 * port of reference/scanner-spike/index.html, which was validated on a real
 * phone against a real three-target .mind file.
 *
 * Keeping it outside React means A-Frame owns its DOM completely: no
 * re-render can tear down the scene, no hydration can race the two CDN
 * scripts, and the proven initialisation order is preserved exactly.
 *
 * Every non-obvious line here is load-bearing. Before changing anything, read
 * the "Verified MindAR facts" section of CLAUDE.md:
 *   - A-Frame 1.5.0 uses `xr-mode-ui`, not `vr-mode-ui`
 *   - the mindar system must be looked up lazily, not at parse time
 *   - videos must NOT go in <a-assets>
 *   - autoStart:false plus a user-gesture Start button
 *   - plane width stays 1; only height varies, set to the PHOTO's aspect
 */
import { type NextRequest } from 'next/server';

import { lookupPublicBook } from '@/lib/public-book';

/** Prevents a value breaking out of the <script> block it is embedded in. */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Signed URLs are embedded in this document. Never let it be cached by
      // a proxy, and never let it be indexed.
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
    },
  });
}

function messagePage(heading: string, body: string, status: number): Response {
  return page(
    `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Living Memories</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100dvh;
font:16px/1.5 system-ui,sans-serif;text-align:center;padding:2rem}
h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#666;margin:0;max-width:22rem}</style>
</head><body><div><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(body)}</p></div></body></html>`,
    status,
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const result = await lookupPublicBook(bookId);

  if (result.status !== 'ok') {
    const copy = {
      'not-found': ['We could not find this book', 'Check the link, or scan the code again.'],
      revoked: ['This book has been disabled', 'Please contact us and we will sort it out.'],
      expired: ['This book’s hosting has ended', 'Get in touch to renew and we will bring the videos back.'],
      'not-ready': ['This book is not ready yet', 'We are still preparing the videos. Please try again shortly.'],
      unavailable: ['Something went wrong at our end', 'This is our problem, not yours, and your videos are safe. Please try again in a few minutes.'],
    }[result.status];
    const status =
      result.status === 'not-found' ? 404 : result.status === 'unavailable' ? 503 : 410;
    return messagePage(copy[0], copy[1], status);
  }

  const { book } = result;
  const debug = request.nextUrl.searchParams.get('debug') === '1';

  const ordered = [...book.memories].sort((a, b) => a.targetIndex - b.targetIndex);

  const videoTags = ordered
    .map(
      (m) =>
        `  <video id="v${m.targetIndex}" src="${escapeHtml(m.videoUrl)}" preload="metadata" loop muted playsinline webkit-playsinline crossorigin="anonymous"></video>`,
    )
    .join('\n');

  const targetEntities = ordered
    .map(
      (m) =>
        `    <a-entity class="tgt" mindar-image-target="targetIndex: ${m.targetIndex}">
      <a-video class="scr" src="#v${m.targetIndex}" width="1" height="1" position="0 0 0.001"></a-video>
    </a-entity>`,
    )
    .join('\n');

  // Height/width of each PRINTED photo. The anchor space is normalised so
  // width 1 unit == the target's full width, so only height varies. Falling
  // back to the video's own ratio floats a letterbox strip over the photo
  // instead of covering it, so a missing aspect is a data bug worth seeing.
  const aspects = ordered.map((m) => m.photoAspect ?? 0);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(book.title)}</title>
<script src="https://cdn.jsdelivr.net/npm/aframe@1.5.0/dist/aframe-master.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js"></script>
<style>
  body { margin: 0; font: 16px system-ui, sans-serif; background: #000; }
  #wrap { position: absolute; width: 100%; height: 100%; overflow: hidden; }
  #dbg { position: fixed; top: 0; left: 0; z-index: 10000; background: #000c;
         color: #0f0; padding: 6px 8px; white-space: pre; font: 12px monospace; }
  #start, #unmute {
    position: fixed; z-index: 10001; left: 50%; transform: translateX(-50%);
    border: 0; border-radius: 999px; background: #fff; color: #000;
    padding: 16px 32px; font: inherit; font-weight: 500;
  }
  #start { top: 45%; font-size: 18px; }
  #unmute { bottom: 32px; }
  #hint { position: fixed; z-index: 10001; left: 0; right: 0; bottom: 96px;
          text-align: center; color: #fff; text-shadow: 0 1px 4px #000;
          font-size: 14px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
${debug ? '<div id="dbg">booting</div>' : ''}
<button id="start">Scan to play</button>
<button id="unmute" hidden>Tap for sound</button>
<p id="hint" hidden>Hold your phone over a photo</p>

<div id="vids" style="display:none">
${videoTags}
</div>

<div id="wrap">
  <a-scene
    mindar-image="imageTargetSrc: ${escapeHtml(book.mindUrl)}; maxTrack: 1; autoStart: false; uiLoading: no; uiScanning: no; uiError: no"
    embedded color-space="sRGB"
    renderer="colorManagement: true, physicallyCorrectLights"
    xr-mode-ui="enabled: false" device-orientation-permission-ui="enabled: false">

    <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>

${targetEntities}
  </a-scene>
</div>

<script>
const ASPECT = ${embedJson(aspects)};
const DEBUG = ${debug ? 'true' : 'false'};

const scene = document.querySelector('a-scene');
const getAR = () => scene.systems['mindar-image-system'];
const targets = [...document.querySelectorAll('.tgt')];
const videos = targets.map((_, i) => document.querySelector('#v' + i));
const dbg = document.querySelector('#dbg');
const startBtn = document.querySelector('#start');
const unmuteBtn = document.querySelector('#unmute');
const hint = document.querySelector('#hint');

let current = -1, startedAt = 0, ttfd = null, losses = 0, state = 'idle', lastErr = '';

const diag = () => [
  'af' + (window.AFRAME ? AFRAME.version : '-MISSING'),
  'mindar:' + (scene.systems && scene.systems['mindar-image-system'] ? 'ok' : 'MISSING'),
  'scene:' + (scene.hasLoaded ? 'loaded' : 'NOT-LOADED')
].join(' ');

window.addEventListener('error', e => { lastErr = (e.message || e.error) + ''; draw(); });

const draw = () => {
  if (!DEBUG || !dbg) return;
  dbg.textContent =
    'state    ' + state +
    '\\ntarget   ' + (current < 0 ? 'none' : current) +
    '\\nttfd     ' + (ttfd === null ? '-' : ttfd + ' ms') +
    '\\nlosses   ' + losses +
    '\\naudio    ' + (videos[0] && videos[0].muted ? 'muted' : 'on') +
    '\\nlibs     ' + diag() +
    (lastErr ? '\\nERROR    ' + lastErr : '');
};
draw();

// Size each plane to its photo's aspect ratio.
videos.forEach((v, i) => {
  const fit = () => {
    const a = ASPECT[i] || (v.videoHeight / v.videoWidth) || 1;
    targets[i].querySelector('.scr').setAttribute('height', a.toFixed(4));
  };
  v.readyState >= 1 ? fit() : v.addEventListener('loadedmetadata', fit);
});

targets.forEach((t, i) => {
  t.addEventListener('targetFound', () => {
    current = i;
    if (ttfd === null && startedAt) { ttfd = Math.round(performance.now() - startedAt); }
    hint.hidden = true;
    videos[i].play().catch(e => console.warn('play blocked', e));
    draw();
  });
  t.addEventListener('targetLost', () => {
    if (current === i) current = -1;
    losses++;
    hint.hidden = false;
    videos[i].pause();
    draw();
  });
});

scene.addEventListener('arReady', () => { state = 'scanning'; hint.hidden = false; draw(); });
scene.addEventListener('arError', e => { state = 'error: ' + (e.detail && e.detail.error); draw(); });

startBtn.addEventListener('click', () => {
  startBtn.hidden = true;
  unmuteBtn.hidden = false;
  state = 'starting camera';
  draw();
  startedAt = performance.now();
  try {
    const ar = getAR();
    if (!ar) throw new Error('mindar system not registered');
    ar.start();
  } catch (err) {
    lastErr = err.message;
    state = 'start failed';
  }
  draw();
});

// iOS Safari blocks audio until a user gesture; one tap, once per page load.
unmuteBtn.addEventListener('click', () => {
  videos.forEach(v => { v.muted = false; });
  if (current >= 0) videos[current].play().catch(() => {});
  unmuteBtn.hidden = true;
  draw();
});

if (DEBUG) setInterval(draw, 500);
</script>
</body>
</html>`;

  return page(html);
}
