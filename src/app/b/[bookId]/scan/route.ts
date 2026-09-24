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

/**
 * Tracking stability.
 *
 * MindAR smooths pose with a OneEuroFilter. Per the docs: lowering
 * filterMinCF reduces jitter at the cost of latency; raising filterBeta
 * reduces latency at the cost of jitter.
 *
 * A phone held over a page in a book moves slowly, so stability is worth far
 * more than responsiveness here — a video that visibly wobbles on a wedding
 * photo reads as broken. filterMinCF is dropped an order of magnitude below
 * the 0.001 default, with filterBeta left alone.
 *
 * missTolerance is the number of consecutive undetected frames before the
 * target counts as lost. The default 5 makes the video blink out whenever a
 * hand or a glare crosses the page; doubling it rides through that. The cost
 * is that a genuinely removed photo holds its last pose a few frames longer.
 *
 * warmupTolerance stays at its default. Lowering it would speed up first
 * detection but risk latching onto the wrong photo, and showing one family
 * another family's video is the worst outcome this product has.
 *
 * All four are overridable from the query string so they can be tuned on a
 * real device without a redeploy.
 */
const TRACKING_DEFAULTS = {
  filterMinCF: 0.0001,
  filterBeta: 1000,
  missTolerance: 10,
  warmupTolerance: 5,
} as const;

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

/** A finite positive number from the query string, or the fallback. */
function numParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
): number {
  const raw = params.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400&family=Archivo:wght@400;500&display=swap" rel="stylesheet">`;

const BRAND_CSS = `
  :root {
    --ink: #0A0A0A;
    --paper: #FAFAF8;
    --grey-4: #A3A3A3;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ink);
    color: var(--paper);
    font-family: Archivo, system-ui, -apple-system, sans-serif;
    overscroll-behavior: none;
  }
  .eyebrow {
    font-size: 11px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.12em;
  }
  #wrap { position: absolute; inset: 0; overflow: hidden; }

  /* Full-bleed intro, shown until the customer taps. The camera is not
     requested until then. */
  #intro {
    position: fixed; inset: 0; z-index: 10002;
    background: var(--ink); color: var(--paper);
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 48px 32px; text-align: center;
  }
  #intro h1 {
    font-family: Fraunces, Georgia, serif;
    font-size: 34px; line-height: 1.1; letter-spacing: -0.02em;
    font-weight: 400; margin: 0;
  }
  #intro p { color: var(--grey-4); font-size: 13px; line-height: 1.6; margin: 12px 0 0; }
  #start {
    border: 0; border-radius: 999px;
    background: var(--paper); color: var(--ink);
    padding: 17px 32px; font: inherit; font-size: 16px; font-weight: 500;
    width: 100%; cursor: pointer;
  }
  #start:disabled { opacity: 0.55; }

  /* Scanning reticle: four corner brackets that breathe gently. */
  #reticle {
    position: fixed; z-index: 10000;
    left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(62vw, 260px); aspect-ratio: 3 / 4;
    pointer-events: none;
    animation: breathe 3s ease-in-out infinite;
  }
  #reticle span {
    position: absolute; width: 26px; height: 26px;
    border: 1.5px solid rgba(250, 250, 248, 0.9);
  }
  #reticle span:nth-child(1) { top: 0; left: 0; border-right: 0; border-bottom: 0; }
  #reticle span:nth-child(2) { top: 0; right: 0; border-left: 0; border-bottom: 0; }
  #reticle span:nth-child(3) { bottom: 0; left: 0; border-right: 0; border-top: 0; }
  #reticle span:nth-child(4) { bottom: 0; right: 0; border-left: 0; border-top: 0; }
  @keyframes breathe {
    0%, 100% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
    50%      { opacity: 0.45; transform: translate(-50%, -50%) scale(1.03); }
  }

  #hint {
    position: fixed; z-index: 10000; left: 0; right: 0; bottom: 116px;
    text-align: center; color: var(--paper); margin: 0;
    text-shadow: 0 1px 12px rgba(0, 0, 0, 0.65);
  }

  #unmute {
    position: fixed; z-index: 10001; left: 50%; bottom: 40px;
    transform: translateX(-50%);
    border: 0; border-radius: 999px;
    background: rgba(250, 250, 248, 0.94); color: var(--ink);
    padding: 14px 26px; font: inherit; font-size: 14px; font-weight: 500;
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    cursor: pointer; white-space: nowrap;
  }

  /* Thin vignette so the white UI stays readable over a bright page. */
  #vignette {
    position: fixed; inset: 0; z-index: 9999; pointer-events: none;
    background: radial-gradient(ellipse at center,
      rgba(0,0,0,0) 45%, rgba(0,0,0,0.38) 100%);
  }

  #dbg {
    position: fixed; top: 0; left: 0; z-index: 10003;
    background: rgba(0,0,0,0.8); color: #0f0;
    padding: 6px 8px; white-space: pre; font: 12px ui-monospace, monospace;
  }

  .fade { transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
  .is-hidden { opacity: 0; pointer-events: none; }
  [hidden] { display: none !important; }
`;

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
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Living Memories</title>
${FONT_LINKS}
<style>
body{margin:0;background:#FAFAF8;color:#0A0A0A;display:grid;place-items:center;
min-height:100dvh;font-family:Archivo,system-ui,sans-serif;text-align:center;padding:2rem}
.eyebrow{font-size:11px;font-weight:500;text-transform:uppercase;
letter-spacing:.12em;color:#A3A3A3;margin:0 0 20px}
h1{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:1.75rem;
line-height:1.15;letter-spacing:-.02em;margin:0 0 .75rem}
p{color:#6B6B6B;font-size:.875rem;line-height:1.6;margin:0;max-width:22rem}
</style>
</head><body><div><p class="eyebrow">Black Pearl</p><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(body)}</p></div></body></html>`,
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
      'not-found': ['We couldn’t find this book', 'Check the link, or scan the code again.'],
      revoked: ['This book has been disabled', 'Please contact us and we’ll sort it out.'],
      expired: ['This book’s hosting has ended', 'Get in touch to renew and we’ll bring the videos back.'],
      'not-ready': ['This book isn’t ready yet', 'We’re still preparing the videos. Please try again shortly.'],
      unavailable: ['Something went wrong at our end', 'This is our problem, not yours, and your videos are safe. Please try again in a few minutes.'],
    }[result.status];
    const status =
      result.status === 'not-found' ? 404 : result.status === 'unavailable' ? 503 : 410;
    return messagePage(copy[0], copy[1], status);
  }

  const { book } = result;
  const query = request.nextUrl.searchParams;
  const debug = query.get('debug') === '1';

  const tracking = {
    filterMinCF: numParam(query, 'minCF', TRACKING_DEFAULTS.filterMinCF),
    filterBeta: numParam(query, 'beta', TRACKING_DEFAULTS.filterBeta),
    missTolerance: numParam(query, 'miss', TRACKING_DEFAULTS.missTolerance),
    warmupTolerance: numParam(query, 'warmup', TRACKING_DEFAULTS.warmupTolerance),
  };

  const ordered = [...book.memories].sort((a, b) => a.targetIndex - b.targetIndex);

  const videoTags = ordered
    .map(
      (m) =>
        `  <video id="v${m.targetIndex}" src="${escapeHtml(m.videoUrl)}" preload="auto" loop muted playsinline webkit-playsinline crossorigin="anonymous"></video>`,
    )
    .join('\n');

  // Scale starts just under 1 so the video settles into place rather than
  // popping in. Purely cosmetic — the anchor pose itself is untouched.
  const targetEntities = ordered
    .map(
      (m) =>
        `    <a-entity class="tgt" mindar-image-target="targetIndex: ${m.targetIndex}">
      <a-video class="scr" src="#v${m.targetIndex}" width="1" height="1"
               position="0 0 0.001" scale="0.97 0.97 1"
               animation__in="property: scale; to: 1 1 1; dur: 420; easing: easeOutCubic; startEvents: settle"></a-video>
    </a-entity>`,
    )
    .join('\n');

  // Height/width of each PRINTED photo. The anchor space is normalised so
  // width 1 unit == the target's full width, so only height varies. Falling
  // back to the video's own ratio floats a letterbox strip over the photo
  // instead of covering it, so a missing aspect is a data bug worth seeing.
  const aspects = ordered.map((m) => m.photoAspect ?? 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0A0A0A">
<title>${escapeHtml(book.title)}</title>
${FONT_LINKS}
<script src="https://cdn.jsdelivr.net/npm/aframe@1.5.0/dist/aframe-master.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js"></script>
<style>${BRAND_CSS}</style>
</head>
<body>
${debug ? '<div id="dbg">booting</div>' : ''}

<div id="intro">
  <p class="eyebrow" style="color: var(--grey-4)">Black Pearl · Living Memories</p>
  <div>
    <h1>${escapeHtml(book.title)}</h1>
    <p>Hold your phone over a photo in the book and it starts playing.</p>
  </div>
  <div>
    <button id="start">Scan to play</button>
    <p style="margin-top:14px">We’ll ask for camera access next.</p>
  </div>
</div>

<div id="vignette" class="fade is-hidden"></div>

<div id="reticle" class="fade is-hidden" aria-hidden="true">
  <span></span><span></span><span></span><span></span>
</div>

<p id="hint" class="eyebrow fade is-hidden">Hold over a photo</p>

<button id="unmute" hidden>Tap for sound</button>

<div id="vids" style="display:none">
${videoTags}
</div>

<div id="wrap">
  <a-scene
    mindar-image="imageTargetSrc: ${escapeHtml(book.mindUrl)}; maxTrack: 1; autoStart: false; uiLoading: no; uiScanning: no; uiError: no; filterMinCF: ${tracking.filterMinCF}; filterBeta: ${tracking.filterBeta}; missTolerance: ${tracking.missTolerance}; warmupTolerance: ${tracking.warmupTolerance}"
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
const intro = document.querySelector('#intro');
const startBtn = document.querySelector('#start');
const unmuteBtn = document.querySelector('#unmute');
const hint = document.querySelector('#hint');
const reticle = document.querySelector('#reticle');
const vignette = document.querySelector('#vignette');

let current = -1, startedAt = 0, ttfd = null, losses = 0, state = 'idle', lastErr = '';

const show = el => el && el.classList.remove('is-hidden');
const hide = el => el && el.classList.add('is-hidden');

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
    '\\nfilter   minCF ${tracking.filterMinCF} beta ${tracking.filterBeta} miss ${tracking.missTolerance}' +
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

// Pausing the instant tracking drops makes the video stutter every time a
// hand or a glare crosses the page. Hold for a beat and cancel if the target
// comes back, which it usually does.
const PAUSE_GRACE_MS = 400;
const pauseTimers = new Array(targets.length).fill(null);

targets.forEach((t, i) => {
  t.addEventListener('targetFound', () => {
    current = i;
    if (ttfd === null && startedAt) { ttfd = Math.round(performance.now() - startedAt); }
    if (pauseTimers[i]) { clearTimeout(pauseTimers[i]); pauseTimers[i] = null; }
    hide(reticle); hide(hint);
    t.querySelector('.scr').emit('settle');
    videos[i].play().catch(e => console.warn('play blocked', e));
    draw();
  });
  t.addEventListener('targetLost', () => {
    if (current === i) current = -1;
    losses++;
    show(reticle); show(hint);
    if (pauseTimers[i]) clearTimeout(pauseTimers[i]);
    pauseTimers[i] = setTimeout(() => { videos[i].pause(); pauseTimers[i] = null; }, PAUSE_GRACE_MS);
    draw();
  });
});

scene.addEventListener('arReady', () => {
  state = 'scanning';
  show(reticle); show(hint); show(vignette);
  draw();
});
scene.addEventListener('arError', e => {
  state = 'error: ' + (e.detail && e.detail.error);
  intro.hidden = false;
  startBtn.disabled = false;
  startBtn.textContent = 'Camera unavailable';
  draw();
});

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting…';
  state = 'starting camera';
  draw();
  startedAt = performance.now();
  try {
    const ar = getAR();
    if (!ar) throw new Error('mindar system not registered');
    ar.start();
    intro.hidden = true;
    unmuteBtn.hidden = false;
  } catch (err) {
    lastErr = err.message;
    state = 'start failed';
    startBtn.disabled = false;
    startBtn.textContent = 'Try again';
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
