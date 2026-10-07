# Black Pearl Living Memories

Printed photo books where scanning a photo plays the customer's video.
Customer content is irreplaceable — weddings, funerals, baby videos.
Data loss or a leak is the worst possible outcome. Optimise for that.

## Stack (do not substitute without asking)
- Next.js App Router, TypeScript strict, Tailwind, shadcn/ui
- Supabase: Postgres, Auth, Storage
- Cloudflare R2 for video, served via short-lived signed URLs
- MindAR + A-Frame for the scanner page (pinned versions, CDN)
- Vercel hosting, Sentry for errors

## Hard rules — never violate, never disable
1. Row Level Security ON for every table. Policies written explicitly.
   Never generate a table without its policy in the same migration.
2. All storage buckets private. Never a public URL to a customer video.
   Access only via server-generated signed URLs with short expiry.
3. book_id and memory_id are random UUIDs. Never sequential, never
   human-readable. They appear in printed QR codes.
4. SUPABASE_SERVICE_ROLE_KEY is server-only. Never in a client component,
   never in a NEXT_PUBLIC_ var. Grep for it before every deploy.
5. Never run migrations or seed scripts against production.

## Architecture
- /admin — staff only, auth-gated. Create books, upload photo+video pairs,
  check image trackability score, generate QR + print files.
- /b/[bookId] — public entry from the QR code. Loads that book's targets only.
- /b/[bookId]/scan — the MindAR scanner. Self-contained. Once it works,
  do NOT refactor it or "improve" it without me asking.

## Scanner page is special
MindAR is niche and you have limited training data on it. Do not rewrite it
from memory. Check the docs, pin versions, and when it works, leave it alone.

## Style
- Small commits, feature branches.
- Ask before adding a dependency.
- If you're unsure about a security implication, stop and ask.

---

# Verified MindAR facts (spike, 2026-09-22)

A working scanner is preserved at `reference/scanner-spike/`. It was validated
on a real phone against a real 3-target `.mind` file. Treat it as the source of
truth over any recollection. Do not delete it.

## Pinned versions — verified reachable, do not bump casually
- A-Frame **1.5.0** — `https://cdn.jsdelivr.net/npm/aframe@1.5.0/dist/aframe-master.min.js`
  (note the filename is `aframe-master.min.js`; `aframe.min.js` 404s on jsDelivr)
- mind-ar **1.2.5** — `https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js`
  Newest npm release (2024-01-16). Plain IIFE bundle, loads as a classic script.

## The two bundles are NOT the same kind of script (verified 2026-09-23)
- **Scanner**: `mindar-image-aframe.prod.js` (1.7MB) is a self-contained
  classic IIFE. Load with a plain `<script src>`.
- **Compiler**: `mindar-image.prod.js` is only 266 bytes and is an **ES
  module** — it `import`s a sibling chunk (`controller-*.js`) and then assigns
  `window.MINDAR.IMAGE = {Controller, Compiler, UI}`. It MUST be loaded as
  `<script type="module">`, and from a URL whose sibling chunk resolves (the
  jsDelivr dist path does). Loading it as a classic script fails silently and
  leaves `window.MINDAR` undefined.

Compiler API, from the docs page source:
```js
const compiler = new window.MINDAR.IMAGE.Compiler();
const dataList = await compiler.compileImageTargets(images, (pct) => {});
const buffer   = await compiler.exportData();   // the .mind file bytes
// dataList[i].targetImage.{width,height}
// dataList[i].matchingData[scale].maximaPoints / .minimaPoints
```
`images` are HTMLImageElements. Compile order IS target index.

## Gotchas that cost real debugging time
1. **`vr-mode-ui` does not exist in A-Frame 1.5.0** — it was renamed to
   **`xr-mode-ui`**. MindAR's own examples still use the old name because they
   target A-Frame 1.4.1. The stale name is silently ignored and the VR button
   appears over the scene.
2. **Scene systems are not attached when an inline script parses.** Capturing
   `scene.systems['mindar-image-system']` at parse time yields `undefined`
   forever. Look it up lazily, at the moment you need it.
3. **Do not put customer videos in `<a-assets>`.** A-Frame blocks scene init
   until every asset preloads; a few MB over a slow link means the scene never
   loads and nothing initialises. Use plain `<video>` elements outside the
   scene and reference them by selector.
4. **`autoStart: false`** plus a user-gesture Start button. MindAR requests the
   camera inside `system.start()`, so this is what keeps the page from
   prompting for camera on load.
5. Events: `targetFound` / `targetLost` / `targetUpdate` on the
   `mindar-image-target` entity; `arReady` / `arError` on the scene.

## Anchor geometry — this is why video sits ON the photo
MindAR normalises the anchor so **1 unit = the tracked image's full width**,
height = image height / image width. So a plane keeps `width="1"` and only its
`height` varies, set to the *target image's* aspect ratio — not the video's.
Photo and video aspect ratios routinely differ; using the video's ratio floats
a letterbox strip across the photo instead of covering it.

## Trackability scoring
`.mind` files are msgpack: `{v, dataList[]}`, each entry carrying
`targetImage{width,height}`, 12 scale keyframes, and per-scale
`matchingData[].maximaPoints` / `.minimaPoints`. Feature-point counts per scale
are the trackability signal the /admin upload flow needs — total count, spread,
and crucially how many survive to the coarsest scale (that predicts whether a
target tracks from a distance). Targets in the spike scored 1633 / 2074 / 2464
total points and all tracked.

## Target index ordering is load-bearing
A `.mind` file stores no names — only position. Compile order *is*
`targetIndex: 0,1,2`. Get it wrong and videos play on the wrong photos with no
error. Whatever builds `.mind` files in /admin must make this binding explicit
and verifiable.

## Docs
- https://hiukim.github.io/mind-ar-js-doc/quick-start/overview/
- https://hiukim.github.io/mind-ar-js-doc/installation/
- https://hiukim.github.io/mind-ar-js-doc/tools/compile/
- https://github.com/hiukim/mind-ar-js/blob/master/src/image-target/aframe.js

---

## Product: Blackpearl Live Photo Book

This repo is the digital half of a product sold by Blackpearl Studio & Printing
(Doha Mall, Abu Hamour, Doha) at https://www.blackpearlqa.com/store as the
"Live photo book" (from QAR 450). A customer buys a printed hardback book;
each page is linked to a short video. Scanning the page with a phone plays
the video over the printed photo.

The marketing site (blackpearlqa.com) is a SEPARATE codebase. This repo is
only: the customer viewer (/b/...) and the staff admin (/admin). Do not
build marketing pages, a store, checkout or payments here.

### Naming (customer-facing)
- Product name: "Live photo book". Brand: "Blackpearl" (one word).
- Never show "Living Memories", "WebAR", "MindAR", "target", "UUID",
  "Supabase", "R2" or any error code to a customer.
- "Black Pearl Living Memories" may stay as the internal repo/package name.

### PRODUCT DECISIONS (owner fills these in; TODO = placeholder, never guess)
- Viewer domain: TODO (e.g. live.blackpearlqa.com)
- Hosting term included with a book: TODO years. After expiry the book
  shows the expired state; videos are NOT deleted automatically.
- Max video length per page: TODO seconds
- Languages: English + Arabic (RTL), matching blackpearlqa.com/ar

### Brand system — match blackpearlqa.com exactly
- Strictly monochrome. Tokens only:
  ink #0A0A0A, paper #FAFAF8, greys #1A1A1A #2E2E2E #6B6B6B #A3A3A3
  #D9D9D9 #EFEFEF. No accent colour, no gradients, no colour on hover.
  States are shown by inversion, underline, weight or scale.
- Type: Fraunces (display, large, tight leading, used sparingly) and
  Archivo (body/UI). Self-hosted via next/font. Arabic: pick one Arabic
  face that pairs with Archivo and use it only under dir="rtl".
- Utility voice for labels and meta: uppercase, tracked, short
  ("STEP 01 — SCAN", "COLLECT FROM DOHA MALL").
- Photographs presented like contact-sheet frames with small captions.
- shadcn/ui is allowed for admin. In the customer viewer, restyle any
  shadcn primitive to these tokens so it does not look like shadcn.
- Customer screens: entry/landing on paper (#FAFAF8). Scanner and video
  on ink (#0A0A0A). The switch to dark is the moment the book "opens",
  not a theme toggle.

### Customer support path
- Every customer error/empty state offers one action: WhatsApp
  Blackpearl (https://wa.me/97431123552) with a prefilled message that
  includes the book's short reference — never the full bookId.

### Fallbacks that are part of the product, not extras
- Each printed page carries a small QR to /b/[bookId]/m/[memoryId] that
  plays that page's video without AR. AR failing must never mean the
  customer cannot watch their video.
- iOS blocks autoplay with sound. The first video per visit needs a tap
  to unmute. Design for it; do not try to bypass it.
- Customers can download their own videos (signed, short-lived URLs).
