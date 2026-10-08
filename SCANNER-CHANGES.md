# Scanner changes

Every deviation of `src/app/b/[bookId]/scan/route.ts` from
`reference/scanner-spike/index.html`, and why.

The spike is the only version validated on a real phone against a real target
file. It is the baseline, not a draft.

---

## The frozen core — verified identical

Checked mechanically against the spike, not by eye:

| Core element | Status |
|---|---|
| A-Frame 1.5.0 `aframe-master.min.js` | identical |
| mind-ar 1.2.5 `mindar-image-aframe.prod.js` | identical |
| `maxTrack: 1; autoStart: false; uiLoading: no; uiScanning: no; uiError: no` | identical |
| `<a-camera position="0 0 0" look-controls="enabled: false">` | identical |
| `xr-mode-ui="enabled: false" device-orientation-permission-ui="enabled: false"` | identical |
| Lazy system lookup `getAR = () => scene.systems['mindar-image-system']` | identical |
| `<video>` attributes incl. `playsinline` / `webkit-playsinline` | identical |
| Plane `width="1"`, height from the photo's aspect | identical |
| `targetFound` / `targetLost` / `arReady` / `arError` wiring | identical |
| No `<a-assets>` block | identical (the only match is the warning comment) |
| Target index = position in the sorted array | identical |

---

## Deviations

### 1. Tracking filter parameters are set

`filterMinCF: 0.0001`, `filterBeta: 1000`, `missTolerance: 10`,
`warmupTolerance: 5`, all overridable from the query string.

The spike set none of these and took MindAR's defaults. Per the docs, lowering
`filterMinCF` trades latency for less jitter, which is the right trade for a
phone held nearly still over a page. `missTolerance` is doubled so a hand or a
glare crossing the page does not drop the target.

`warmupTolerance` is deliberately left at the default: lowering it would speed
up first detection at the cost of possibly latching onto the wrong photo.

**Not yet confirmed on a device.** These are reasoned from the documentation,
not measured.

### 2. `<a-video>` settles in from 97% scale

`scale="0.97 0.97 1"` plus an `animation__in` that runs on a `settle` event
emitted in `targetFound`. Cosmetic only — the anchor pose is untouched.

**Risk:** if the animation component fails to run, the video stays 3% smaller
than the photo for the whole session. Needs a device to confirm it fires.

### 3. Entities and media are generated, not hardcoded

The spike had three hardcoded entities pointing at local files. The app
generates one per memory, with signed R2 URLs and the target file from storage.
Unavoidable; the geometry and ordering are unchanged.

### 4. `preload="metadata"`, restored

Briefly changed to `preload="auto"` while branding the scanner, which made the
browser fetch every video in the book on page load. Reverted to the spike's
value in commit `8c151d4`.

### 5. The camera is released when the page is left

`pagehide` calls `arSystem.stop()`; `visibilitychange` pauses and resumes.

The spike has none of this, so **this moves away from the spike rather than
toward it**, and was applied as an explicit exception in Phase 2 (commit
`e439738`). The spike was a throwaway page on a dev machine; a customer-facing
page that keeps the camera live after a back navigation is a defect.

### 6. The camera is requested before MindAR requests it

`preflightCamera()` calls `getUserMedia` itself, stops the stream immediately,
and only then calls `ar.start()`.

**Why:** MindAR catches the `DOMException` internally and emits only
`arError` with `VIDEO_FAIL`. That cannot distinguish "the customer tapped
Block" from "this browser has no camera API" — and those need completely
different instructions. The probe gives the real error name.

Permission persists for the origin, so MindAR's own `getUserMedia` reuses it
without a second prompt.

**Needs a device.** Two things to watch:
- that only **one** permission prompt appears, not two
- that releasing and immediately re-acquiring the camera works on Android, where
  some devices are slow to free it

If either misbehaves, the fallback is to drop the probe and show the generic
"camera didn't start" panel for every failure.

### 7. A UI layer exists

Intro panel, denied panel, breathing reticle, hint, vignette, unmute pill, and
the lost-video card. The spike had two bare buttons and a debug readout.

The debug readout survives behind `?debug=1` and is off for customers.

### 8. The video continues in a card when tracking drops

On `targetLost` the `#vids` container becomes a fixed card and the video keeps
playing for `LOST_CARD_MS` (4.5s) before pausing. Returning to the same photo
resumes; a different photo switches.

Implemented by restyling the existing container, **not** by moving the
`<video>` element in the DOM — the element is a live texture source for A-Frame
and moving it risks breaking the binding.

**Needs a device.** The question is whether 4.5s feels reassuring or like the
page is stuck.

### 9. Strings come from the dictionary

Every customer-visible string is `src/lib/i18n.ts`, with `dir="rtl"` and the
Arabic face under `?lang=ar`. The spike was hardcoded English.

Arabic is machine-drafted and marked `TODO-REVIEW`.

---

## Teardown checklist — how each was verified

Phase 4 asks for this explicitly. **None of it is device-verified**; this is
what was checked statically and what still needs a phone.

| What must happen on leaving | How it is done | Verified how |
|---|---|---|
| Camera tracks stopped | `arSystem.stop()` stops every track in `srcObject` | Read in MindAR's source (`src/image-target/aframe.js`, `stop()`); **not** observed on a device |
| MindAR stops processing | `stop()` calls `pause()` → `controller.stopProcessVideo()`, then `controller.dispose()` | Same source; not observed |
| Videos paused | `videos.forEach(v => v.pause())` before `ar.stop()` | Code path reviewed; not observed |
| Card timer cleared | `cancelCardTimer()` in `releaseCamera()` | Code path reviewed |
| Listeners removed | **Not done.** `pagehide` and `visibilitychange` listeners are left attached | — |

On that last row: the listeners are deliberately left in place. `pagehide`
fires as the document goes away, and `releaseCamera()` is guarded by a
`started` flag so it is a no-op if called again. Removing them would buy
nothing and adds a path where teardown silently stops working.

**What a device must confirm:**
1. The camera indicator light goes out on back-navigation.
2. Returning to the tab after backgrounding resumes without a second prompt.
3. Only one permission prompt appears on first use (deviation 6).
4. bfcache restore. This was a real defect found while writing this file: a
   page restored from the back/forward cache came back with a torn-down scene
   that still looked live, leaving a dead screen with no obvious way out.
   `pageshow` with `event.persisted` now reloads. Needs a device to confirm —
   iOS Safari uses bfcache aggressively and is where this will show up.

---

## Phase 5 deviations

### 10. Video URLs are fetched when a photo is found, not embedded

The document now carries memory ids and no `src`. `ensureSource(i)` fetches a
signed URL from `/b/[bookId]/media/[memoryId]` on `targetFound`, retries once
silently, and surfaces a calm failure on the second attempt.

**Why:** a document holding N signed URLs hands out N live credentials to
anything that can read the HTML, and those URLs start expiring the moment the
page loads — a customer who reads the intro for half an hour finds the videos
dead before pressing start.

**This is the highest-risk change in the phase.** A-Frame builds the video
material at scene init, from an element that now has no source. The code calls
`setAttribute('material', 'src', '#vN')` once the video has frames, to force
the texture to be rebuilt if the first attempt produced nothing.

**Needs a device.** If the plane stays blank after a photo is found, this is
the cause. The revert is to sign videos server-side again in
`lookupPublicBook` and restore the `src` attribute on the `<video>` tags.

### 11. The video texture is cropped, not stretched

`coverFit(i)` sets `texture.repeat` and `texture.offset` so a video whose
aspect ratio differs from the printed photo is cropped rather than squashed.
This is `object-fit: cover` for a three.js texture.

The plane geometry is untouched — it is still `width="1"` with height from the
photo's aspect. Only the material's UV mapping changes.

### 12. The plane fades in instead of flashing black

Planes start at `opacity: 0` and fade up once the video has frames. A video
texture is black until the first frame decodes, and a black rectangle landing
on a customer's photo is worse than a short delay. Because the printed photo is
physically there and visible through the camera, keeping the plane transparent
achieves what a poster image would — the real photo shows through — without
fetching a still.

**Deviation from the brief**, which asked for the photo's own still with a
crossfade. In AR the still would be drawn directly over the identical physical
photo, so it is invisible by construction. The non-AR player at
`/b/[bookId]/m/[memoryId]` does use a real `poster`, where there is no physical
photo to show through.

### 13. Unmute is remembered for the visit

`sessionStorage` under `bp-unmuted`. Wrapped in try/catch: private mode and
blocked storage both throw, and staying muted is the safe default.

---

## Phase 5 verification status

| Claim | Verified how |
|---|---|
| Target index N maps to memory N, including after delete and reorder | **11 unit tests**, `npm test`. The shipped code calls the same module. |
| Media endpoint refuses unknown book or memory | Confirmed on a running server: 404 for both |
| Media endpoint is `no-store, private`, `noindex` | Confirmed on a running server |
| Scanner HTML carries no signed video URL | **NOT VERIFIED.** The only test book is expired, so `/scan` returns the 410 page. The check reported zeros from a 1,314-byte error page, not from the scanner. |
| Lazy source rebuilds the video texture | **NOT VERIFIED** — needs a device and a live book |
| Cover-fit crops rather than stretches | **NOT VERIFIED** — needs a video whose ratio differs from its photo |
| Fade-in removes the black flash | **NOT VERIFIED** — needs a device |
| Unmute persists across pages in a visit | **NOT VERIFIED** — needs a device |

To unblock all of these: extend the test book's hosting date in
**/admin/books/[id] → Hosting and access**, then reload the scanner.
