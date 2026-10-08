/**
 * The scanner.
 *
 * This is a Route Handler returning a complete HTML document, not a React
 * page, and that is deliberate. CLAUDE.md requires the scanner to be
 * self-contained and not rewritten from memory. The scene below is a direct
 * port of reference/scanner-spike/index.html, which was validated on a real
 * phone against a real three-target target file.
 *
 * Keeping it outside React means A-Frame owns its DOM completely: no
 * re-render can tear down the scene, no hydration can race the two CDN
 * scripts, and the proven initialisation order is preserved exactly.
 *
 * ---------------------------------------------------------------------------
 * THE CORE IS FROZEN. Do not change, without an entry in SCANNER-CHANGES.md:
 *   - the two CDN script tags and their versions
 *   - the <a-scene mindar-image="..."> attribute
 *   - the <a-camera> entity
 *   - the <a-entity mindar-image-target> / <a-video> geometry
 *   - target index order
 *   - the targetFound / targetLost / arReady / arError wiring
 *
 * Everything else in this file is the UI layer and is free to change.
 *
 * Before touching any of it, read "Verified MindAR facts" in CLAUDE.md:
 *   - A-Frame 1.5.0 uses `xr-mode-ui`, not `vr-mode-ui`
 *   - the mindar system must be looked up lazily, not at parse time
 *   - videos must NOT go in <a-assets>
 *   - autoStart:false plus a user-gesture Start button
 *   - plane width stays 1; only height varies, set to the PHOTO's aspect
 * ---------------------------------------------------------------------------
 */
import { headers } from 'next/headers';
import { type NextRequest } from 'next/server';

import { getDictionary, dir, resolveLocale, supportLink, type Locale } from '@/lib/i18n';
import { lookupPublicBook } from '@/lib/public-book';
import { orderByTargetIndex } from '@/lib/target-mapping';

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
 * hand or a glare crosses the page; doubling it rides through that.
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

/**
 * How long a video keeps playing after its photo leaves frame.
 *
 * Vanishing the instant tracking drops makes a deliberate page turn feel like
 * a crash and a passing glare feel like a bug. The video carries on in a card
 * for a few seconds instead, and returning to the photo picks up where it was.
 */
const LOST_CARD_MS = 4500;

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
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400&family=Archivo:wght@400;500&family=IBM+Plex+Sans+Arabic:wght@400;500&display=swap" rel="stylesheet">`;

const BRAND_CSS = `
  :root {
    --ink: #0A0A0A;
    --paper: #FAFAF8;
    --grey-1: #1A1A1A;
    --grey-3: #6B6B6B;
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
  body[dir="rtl"] { font-family: "IBM Plex Sans Arabic", Archivo, system-ui, sans-serif; }

  .eyebrow {
    font-size: 11px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.12em;
  }
  #wrap { position: absolute; inset: 0; overflow: hidden; }

  /* Full-bleed panels shown before, instead of, or after the camera. */
  .panel {
    position: fixed; inset: 0; z-index: 10002;
    background: var(--ink); color: var(--paper);
    display: flex; flex-direction: column; justify-content: space-between;
    padding: max(2.5rem, env(safe-area-inset-top)) 2rem
             max(2.5rem, env(safe-area-inset-bottom));
    text-align: center;
    overflow-y: auto;
  }
  .panel h1 {
    font-family: Fraunces, Georgia, serif;
    font-size: 32px; line-height: 1.1; letter-spacing: -0.02em;
    font-weight: 400; margin: 0;
  }
  .panel p { color: var(--grey-4); font-size: 13px; line-height: 1.6; margin: 12px 0 0; }
  .panel .how {
    text-align: start; background: var(--grey-1); border-radius: 12px;
    padding: 16px; margin-top: 20px;
  }
  .panel .how p { margin: 0 0 10px; color: var(--paper); font-size: 13px; }
  .panel .how p:last-child { margin-bottom: 0; }

  .pill {
    display: flex; align-items: center; justify-content: center;
    min-height: 48px; width: 100%; border: 0; border-radius: 999px;
    background: var(--paper); color: var(--ink);
    padding: 0 32px; font: inherit; font-size: 16px; font-weight: 500;
    cursor: pointer; text-decoration: none;
  }
  .pill:disabled { opacity: 0.55; }
  .quiet {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 48px; color: var(--grey-4); font-size: 14px;
    text-decoration: underline; text-underline-offset: 3px;
  }

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
    position: fixed; z-index: 10001; left: 50%; bottom: max(2.5rem, env(safe-area-inset-bottom));
    transform: translateX(-50%); width: auto; min-width: 180px;
    background: rgba(250, 250, 248, 0.94);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    font-size: 14px; white-space: nowrap;
  }

  /* Thin vignette so the white UI stays readable over a bright page. */
  #vignette {
    position: fixed; inset: 0; z-index: 9999; pointer-events: none;
    background: radial-gradient(ellipse at center,
      rgba(0,0,0,0) 45%, rgba(0,0,0,0.38) 100%);
  }

  /* Videos are normally offscreen texture sources only. When tracking drops,
     the container becomes a card so the video keeps playing where the
     customer can see it instead of vanishing. */
  #vids { display: none; }
  #vids.is-card {
    display: block; position: fixed; z-index: 10001;
    left: 16px; right: 16px; bottom: max(6rem, calc(env(safe-area-inset-bottom) + 6rem));
    border-radius: 14px; overflow: hidden;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    animation: cardin 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  #vids.is-card video { width: 100%; height: auto; display: block; }
  @keyframes cardin {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
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

function messagePage(
  locale: Locale,
  heading: string,
  body: string,
  status: number,
): Response {
  return page(
    `<!DOCTYPE html><html lang="${locale}" dir="${dir(locale)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Live photo book</title>
${FONT_LINKS}
<style>
body{margin:0;background:#FAFAF8;color:#0A0A0A;display:grid;place-items:center;
min-height:100dvh;font-family:Archivo,system-ui,sans-serif;text-align:center;padding:2rem}
body[dir="rtl"]{font-family:"IBM Plex Sans Arabic",Archivo,system-ui,sans-serif}
.eyebrow{font-size:11px;font-weight:500;text-transform:uppercase;
letter-spacing:.12em;color:#A3A3A3;margin:0 0 20px}
h1{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:1.75rem;
line-height:1.15;letter-spacing:-.02em;margin:0 0 .75rem}
p{color:#6B6B6B;font-size:.875rem;line-height:1.6;margin:0;max-width:22rem}
</style>
</head><body><div><p class="eyebrow">Blackpearl</p><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(body)}</p></div></body></html>`,
    status,
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const [{ bookId }, headerList] = await Promise.all([params, headers()]);
  const query = request.nextUrl.searchParams;
  const locale = resolveLocale(
    query.get('lang'),
    headerList.get('accept-language'),
  );
  const t = getDictionary(locale);

  // Only the target file is signed here. Video URLs are fetched one at a time
  // from /b/[bookId]/media/[memoryId] when a photo is actually found.
  const result = await lookupPublicBook(bookId, { withTargets: true });

  // A book with no compiled target file, or whose page indexes no longer line
  // up with it, cannot be scanned — but it can still be watched page by page,
  // so send the customer there rather than telling them it is broken.
  if (result.status === 'ok' && !result.book.scannable) {
    return messagePage(
      locale,
      t.states.notReady.heading,
      t.states.notReady.body,
      410,
    );
  }

  if (result.status !== 'ok') {
    // A revoked book and an id that was never real must be indistinguishable
    // from outside — same body, same status. Otherwise the response itself
    // confirms that a given id exists, which is the one thing the id is
    // supposed to keep secret.
    const copy = {
      'not-found': t.states.notFound,
      revoked: t.states.notFound,
      expired: t.states.expired,
      empty: t.states.empty,
      unavailable: t.states.unavailable,
    }[result.status];
    const status =
      result.status === 'unavailable'
        ? 503
        : result.status === 'expired' || result.status === 'empty'
          ? 410
          : 404;
    return messagePage(locale, copy.heading, copy.body, status);
  }

  const { book } = result;
  const debug = query.get('debug') === '1';

  const tracking = {
    filterMinCF: numParam(query, 'minCF', TRACKING_DEFAULTS.filterMinCF),
    filterBeta: numParam(query, 'beta', TRACKING_DEFAULTS.filterBeta),
    missTolerance: numParam(query, 'miss', TRACKING_DEFAULTS.missTolerance),
    warmupTolerance: numParam(query, 'warmup', TRACKING_DEFAULTS.warmupTolerance),
  };

  // scannable is true and withTargets was requested, so this is present. The
  // type allows null because other callers do not ask for it.
  const mindUrl = book.mindUrl ?? '';
  const ordered = orderByTargetIndex(book.memories);

  // No src attribute. The signed URL is fetched when the photo is actually
  // found — see ensureSource() below — so the document carries no credentials
  // and none of them start expiring while the customer reads the intro.
  const videoTags = ordered
    .map(
      (m) =>
        `  <video id="v${m.targetIndex}" data-memory="${escapeHtml(m.id)}" preload="none" loop muted playsinline webkit-playsinline crossorigin="anonymous"></video>`,
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

  const pagesHref = `/b/${book.id}/pages?lang=${locale}`;
  const whatsapp = supportLink(locale, book.reference);

  const html = `<!DOCTYPE html>
<html lang="${locale}" dir="${dir(locale)}">
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
<body dir="${dir(locale)}">
${debug ? '<div id="dbg">booting</div>' : ''}

<div id="intro" class="panel">
  <p class="eyebrow" style="color: var(--grey-4)">Blackpearl · ${escapeHtml(t.productName)}</p>
  <div>
    <h1>${escapeHtml(book.title)}</h1>
    <p>${escapeHtml(t.scanner.intro)}</p>
  </div>
  <div>
    <button id="start" class="pill">${escapeHtml(t.scanner.start)}</button>
    <p>${escapeHtml(t.scanner.permissionNote)}</p>
  </div>
</div>

<div id="denied" class="panel" hidden>
  <p class="eyebrow" style="color: var(--grey-4)">Blackpearl</p>
  <div>
    <h1 id="denied-heading">${escapeHtml(t.scanner.deniedHeading)}</h1>
    <p id="denied-body">${escapeHtml(t.scanner.deniedBody)}</p>
    <div class="how" id="denied-how">
      <p>${escapeHtml(t.scanner.deniedIos)}</p>
      <p>${escapeHtml(t.scanner.deniedAndroid)}</p>
    </div>
  </div>
  <div>
    <button id="retry" class="pill" hidden style="margin-bottom:12px">${escapeHtml(t.player.retry)}</button>
    <a class="pill" href="${escapeHtml(pagesHref)}">${escapeHtml(t.scanner.watchWithoutCamera)}</a>
    <p><a class="quiet" href="${escapeHtml(whatsapp)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.support.action)}</a></p>
  </div>
</div>

<div id="vignette" class="fade is-hidden"></div>

<div id="reticle" class="fade is-hidden" aria-hidden="true">
  <span></span><span></span><span></span><span></span>
</div>

<p id="hint" class="eyebrow fade is-hidden">${escapeHtml(t.scanner.scanning)}</p>

<button id="unmute" class="pill" hidden>${escapeHtml(t.scanner.tapForSound)}</button>

<div id="vids">
${videoTags}
</div>

<div id="wrap">
  <a-scene
    mindar-image="imageTargetSrc: ${escapeHtml(mindUrl)}; maxTrack: 1; autoStart: false; uiLoading: no; uiScanning: no; uiError: no; filterMinCF: ${tracking.filterMinCF}; filterBeta: ${tracking.filterBeta}; missTolerance: ${tracking.missTolerance}; warmupTolerance: ${tracking.warmupTolerance}"
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
const LOST_CARD_MS = ${LOST_CARD_MS};
const MEDIA_BASE = ${embedJson(`/b/${book.id}/media/`)};
const MEMORY_IDS = ${embedJson(ordered.map((m) => m.id))};
const UNMUTE_KEY = 'bp-unmuted';
const T = ${embedJson({
    starting: t.scanner.starting,
    start: t.scanner.start,
    deniedHeading: t.scanner.deniedHeading,
    deniedBody: t.scanner.deniedBody,
    unavailableHeading: t.scanner.unavailableHeading,
    unavailableBody: t.scanner.unavailableBody,
    cantLoadHeading: t.player.cantLoad,
    cantLoadBody: t.states.unavailable.body,
  })};

const scene = document.querySelector('a-scene');
const getAR = () => scene.systems['mindar-image-system'];
const targets = [...document.querySelectorAll('.tgt')];
const videos = targets.map((_, i) => document.querySelector('#v' + i));
const dbg = document.querySelector('#dbg');
const intro = document.querySelector('#intro');
const denied = document.querySelector('#denied');
const deniedHeading = document.querySelector('#denied-heading');
const deniedBody = document.querySelector('#denied-body');
const deniedHow = document.querySelector('#denied-how');
const startBtn = document.querySelector('#start');
const retryBtn = document.querySelector('#retry');
const unmuteBtn = document.querySelector('#unmute');
const hint = document.querySelector('#hint');
const reticle = document.querySelector('#reticle');
const vignette = document.querySelector('#vignette');
const vids = document.querySelector('#vids');

let current = -1, startedAt = 0, ttfd = null, losses = 0, state = 'idle', lastErr = '';
let started = false;
let cardTimer = null;
let lastFailed = -1;

// MindAR throws if stopped before it was started, and a failed teardown must
// never be what stops the rest of the teardown running.
const safe = (label, fn) => { try { fn(); } catch (err) { console.warn(label, err); } };

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

// ------------------------------------------------------- lazy video source --
// Nothing is fetched until a photo is actually found. One silent retry covers
// an expired or dropped URL; a second failure is shown to the customer.
const sources = new Array(videos.length).fill(null);

async function fetchUrl(i) {
  const res = await fetch(MEDIA_BASE + MEMORY_IDS[i], { cache: 'no-store' });
  if (!res.ok) throw new Error('media ' + res.status);
  const body = await res.json();
  if (!body || !body.url) throw new Error('media: no url');
  return body.url;
}

function whenReady(v) {
  if (v.readyState >= 2) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { v.removeEventListener('loadeddata', done); resolve(); };
    v.addEventListener('loadeddata', done);
    // Never hang forever on a stalled network — fall through and let play()
    // report the real problem.
    setTimeout(done, 8000);
  });
}

async function ensureSource(i, { retry = true } = {}) {
  const v = videos[i];
  if (sources[i]) return;
  try {
    const url = await fetchUrl(i);
    sources[i] = url;
    v.src = url;
    v.load();
    await whenReady(v);
    // The material was built from an empty element, so point it at the video
    // again now that there are frames. Without this the plane can stay blank.
    safe('material.refresh', () => {
      targets[i].querySelector('.scr').setAttribute('material', 'src', '#v' + i);
    });
    coverFit(i);
  } catch (err) {
    sources[i] = null;
    if (retry) {
      console.warn('media fetch failed, retrying once', err);
      await ensureSource(i, { retry: false });
      return;
    }
    throw err;
  }
}

// ------------------------------------------------------------- cover fit ----
// The plane is sized to the PRINTED photo. A video shot at a different ratio
// would otherwise be stretched to fit it. Cropping the texture instead gives
// object-fit: cover — no stretching, no letterbox bars.
function coverFit(i) {
  const v = videos[i];
  const el = targets[i].querySelector('.scr');
  const mesh = el.getObject3D('mesh');
  const tex = mesh && mesh.material && mesh.material.map;
  if (!tex || !v.videoWidth || !v.videoHeight) return;

  const planeAR = 1 / (ASPECT[i] || (v.videoHeight / v.videoWidth) || 1);
  const videoAR = v.videoWidth / v.videoHeight;

  if (videoAR > planeAR) {
    const r = planeAR / videoAR;           // video is wider — crop the sides
    tex.repeat.set(r, 1);
    tex.offset.set((1 - r) / 2, 0);
  } else {
    const r = videoAR / planeAR;           // video is taller — crop top/bottom
    tex.repeat.set(1, r);
    tex.offset.set(0, (1 - r) / 2);
  }
  tex.needsUpdate = true;
}

// --------------------------------------------------------------- fade in ----
// The plane starts transparent so the first frame is never a black rectangle
// over the customer's photo. The printed photo shows through until there is
// something real to put on top of it.
function setPlaneOpacity(i, value) {
  safe('plane.opacity', () => {
    targets[i].querySelector('.scr')
      .setAttribute('material', 'transparent: true; opacity: ' + value);
  });
}

videos.forEach((_, i) => setPlaneOpacity(i, 0));

function revealPlane(i) {
  let o = 0;
  const step = () => {
    o = Math.min(1, o + 0.12);
    setPlaneOpacity(i, o);
    if (o < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- the card --
// On losing a photo the video carries on in a card rather than vanishing, so a
// glare or a deliberate page turn does not read as a crash.
function showCard(i) {
  videos.forEach((v, j) => { v.style.display = j === i ? 'block' : 'none'; });
  vids.classList.add('is-card');
}

function hideCard() {
  vids.classList.remove('is-card');
  videos.forEach(v => { v.style.display = 'none'; });
}

function cancelCardTimer() {
  if (cardTimer) { clearTimeout(cardTimer); cardTimer = null; }
}

// --------------------------------------------------------- the frozen core --
targets.forEach((t, i) => {
  t.addEventListener('targetFound', () => {
    current = i;
    if (ttfd === null && startedAt) { ttfd = Math.round(performance.now() - startedAt); }
    cancelCardTimer();
    hideCard();
    // A different photo switches: whatever was playing stops.
    videos.forEach((v, j) => { if (j !== i) safe('video.pause', () => v.pause()); });
    hide(reticle); hide(hint);
    t.querySelector('.scr').emit('settle');

    ensureSource(i)
      .then(() => {
        // Still the current target? The customer may have moved on while the
        // URL was in flight.
        if (current !== i) return;
        videos[i].muted = muted;
        revealPlane(i);
        return videos[i].play().catch(e => console.warn('play blocked', e));
      })
      .catch(err => {
        console.warn('could not load video', err);
        if (current === i) showPlaybackError(i);
      });

    draw();
  });
  t.addEventListener('targetLost', () => {
    if (current === i) current = -1;
    losses++;
    show(reticle); show(hint);
    showCard(i);
    cancelCardTimer();
    cardTimer = setTimeout(() => {
      safe('video.pause', () => videos[i].pause());
      hideCard();
      cardTimer = null;
    }, LOST_CARD_MS);
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
  showPanel(denied, T.unavailableHeading, T.unavailableBody, false);
  draw();
});
// ----------------------------------------------------- end of frozen core --

function showPanel(el, heading, body, withHow) {
  deniedHeading.textContent = heading;
  deniedBody.textContent = body;
  deniedHow.hidden = !withHow;
  intro.hidden = true;
  el.hidden = false;
}

/**
 * Asks for the camera before MindAR does, purely so a refusal can be told
 * apart from a failure. MindAR swallows the DOMException and reports only
 * "VIDEO_FAIL", which is not enough to tell a customer what to do.
 *
 * The probe stream is stopped immediately. Permission persists for the origin,
 * so MindAR's own getUserMedia reuses it without a second prompt.
 */
async function preflightCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return 'unavailable';
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment' },
    });
    stream.getTracks().forEach(track => track.stop());
    return 'ok';
  } catch (err) {
    const name = err && err.name;
    return (name === 'NotAllowedError' || name === 'SecurityError')
      ? 'denied'
      : 'unavailable';
  }
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = T.starting;
  state = 'starting camera';
  draw();
  startedAt = performance.now();

  const probe = await preflightCamera();
  if (probe === 'denied') {
    state = 'denied';
    showPanel(denied, T.deniedHeading, T.deniedBody, true);
    draw();
    return;
  }
  if (probe === 'unavailable') {
    state = 'camera unavailable';
    showPanel(denied, T.unavailableHeading, T.unavailableBody, false);
    draw();
    return;
  }

  try {
    const ar = getAR();
    if (!ar) throw new Error('mindar system not registered');
    ar.start();
    started = true;
    intro.hidden = true;
    applyMuted();
  } catch (err) {
    lastErr = err.message;
    state = 'start failed';
    showPanel(denied, T.unavailableHeading, T.unavailableBody, false);
  }
  draw();
});

// iOS blocks autoplay with sound until a user gesture. That is not something
// to work around — it is one tap, and the choice is then remembered for the
// rest of the visit so the customer is not asked again on every page.
let muted = true;

try {
  if (sessionStorage.getItem(UNMUTE_KEY) === '1') muted = false;
} catch (err) {
  // Private mode and blocked storage both throw. Staying muted is the safe
  // default, so there is nothing to recover from.
  console.warn('sessionStorage unavailable', err);
}

function applyMuted() {
  videos.forEach(v => { v.muted = muted; });
  unmuteBtn.hidden = !started || !muted;
}

unmuteBtn.addEventListener('click', () => {
  muted = false;
  try { sessionStorage.setItem(UNMUTE_KEY, '1'); } catch { /* not essential */ }
  applyMuted();
  if (current >= 0) videos[current].play().catch(() => {});
  draw();
});

/**
 * A video that will not load, said plainly.
 *
 * ensureSource() has already retried once silently by the time this shows, so
 * the customer is only interrupted for a real failure — and is given the two
 * things that actually help rather than an error code.
 */
function showPlaybackError(i) {
  lastFailed = i;
  state = 'playback failed';
  showPanel(denied, T.cantLoadHeading, T.cantLoadBody, false);
  // Retrying means trying the fetch again, not reloading the whole scanner.
  retryBtn.hidden = false;
}

retryBtn.addEventListener('click', async () => {
  retryBtn.disabled = true;
  const i = lastFailed;
  if (i < 0) { retryBtn.disabled = false; return; }
  sources[i] = null;
  try {
    await ensureSource(i);
    denied.hidden = true;
    intro.hidden = true;
    retryBtn.hidden = true;
    if (current === i) { revealPlane(i); videos[i].play().catch(() => {}); }
  } catch (err) {
    console.warn('retry failed', err);
  }
  retryBtn.disabled = false;
});

// Leaving the page has to release the camera. Without this the getUserMedia
// tracks stay live after a back navigation or a closed tab: the camera
// indicator stays lit and MindAR keeps processing frames for a page the
// customer believes they have left.
//
// arSystem.stop() is what actually ends it — it stops every track, removes the
// video element and disposes the controller.
function releaseCamera() {
  if (!started) return;
  started = false;
  cancelCardTimer();
  hideCard();
  videos.forEach(v => safe('video.pause', () => v.pause()));
  safe('ar.stop', () => getAR().stop());
  state = 'stopped';
  draw();
}

window.addEventListener('pagehide', releaseCamera);

// A page restored from the back/forward cache comes back with a scene that was
// already torn down: the camera tracks are stopped and the controller is
// disposed, but the DOM still looks live. MindAR offers no way to restart in
// place, so reload rather than leaving the customer staring at a dead screen
// with no obvious way out.
window.addEventListener('pageshow', e => {
  if (e.persisted) window.location.reload();
});

// Backgrounding is different from leaving: stop burning CPU and battery, but
// keep the session so returning to the tab resumes instead of demanding
// another tap and another camera prompt.
document.addEventListener('visibilitychange', () => {
  if (!started) return;
  const ar = getAR();
  if (!ar) return;
  if (document.hidden) {
    cancelCardTimer();
    videos.forEach(v => safe('video.pause', () => v.pause()));
    safe('ar.pause', () => ar.pause());
  } else {
    safe('ar.unpause', () => ar.unpause());
  }
});

if (DEBUG) setInterval(draw, 500);
</script>
</body>
</html>`;

  return page(html);
}
