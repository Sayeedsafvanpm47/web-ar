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
