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

---

## Scanner rework — Part 1: smoothing

### 14. Filter defaults corrected from the source, not the docs

`filterMinCF` 0.0001 -> **0.001**, `filterBeta` 1000 -> **15**.

Read from MindAR 1.2.5 directly: `src/libs/one-euro-filter.js`, called at
`src/image-target/controller.js:257` as
`trackingState.filter.filter(Date.now(), worldMatrix)`. So `t` is in
**milliseconds** and `x` is the entire **16-element pose matrix**, smoothed
element-wise.

```
cutOff = minCutOff + beta * |dxHat|      // dxHat in units per millisecond
a      = r / (r + 1),  r = 2*PI * cutOff * te
xHat   = a * x + (1 - a) * xPrev         // a = 1 means no smoothing at all
```

**The owner's suspicion is confirmed.** At 60fps (te ~ 16ms) and hand tremor
of ~1e-4 per ms, `beta = 1000` gives `cutOff = 0.1001`, `r = 10.1`,
**`a = 0.91`** — 91% of the raw jitter passes straight through. During an
ordinary pan (~1e-3 per ms) it reaches `a = 0.99`. At these units beta=1000
does not "reduce delay"; it disables smoothing whenever the phone is not
perfectly still, which for a hand-held phone is always.

The old `minCF` of 0.0001 was the opposite error (`a = 0.01` at rest, ~1.7s to
settle) and was never visible because beta masked it.

New values, same arithmetic: tremor -> `a = 0.20`, pan -> `a = 0.62`.

**Needs a device.** The A/B table is in the task summary; `?minCF=` and
`?beta=` still override.

### 15. Per-frame pose interpolation (lerp/slerp), `?smooth=off`

Filter tuning alone cannot remove all stepping: the filter runs at MindAR's
detection rate, which is below the display refresh rate, so the pose updates in
visible steps between detections. A `smooth-anchor` component eases toward the
latest filtered pose every rendered frame.

**How it coexists with MindAR.** `mindar-image-target` sets
`root.matrixAutoUpdate = false` and then **assigns a new `Matrix4`** to
`object3D.matrix` on each detection (`src/image-target/aframe.js`,
`updateWorldMatrix`). Two consequences are what make this safe:

1. three.js never recomputes that matrix from position/quaternion, and nothing
   else writes it — so our own write survives through to `matrixWorld`.
2. A fresh pose can be told from our own output by **object identity**: if
   `object3D.matrix` is not the `Matrix4` we last wrote, MindAR has just
   replaced it. No patching or monkey-wrapping of MindAR is needed.

A-Frame runs component `tick()`s before rendering, so the eased pose is the one
drawn that frame. On `targetLost` the entity goes invisible and MindAR assigns
its all-zero `invisibleMatrix`; those frames are skipped and the eased state is
dropped, so the next find snaps to the true pose rather than sliding in from a
stale one.

**Needs a device.** If the video feels like it trails the photo, lower the
factors or use `?smooth=off` to isolate filter behaviour from interpolation.

### 16. Rolling FPS in the `?debug=1` readout

So a "it wobbles" report can be separated from a frame-rate problem. Measured
over the last second of animation frames; only runs when debug is on.

---

## Scanner rework — Part 2: true aspect ratio

### 17. containFit() replaces coverFit() — the video is never cropped

Deviation 11 cropped the texture so the video filled the photo's plane. That
was the wrong trade: a portrait clip on a landscape page lost its sides, and a
customer watching their own wedding video should see all of it.

`containFit()` instead **resizes the plane geometry** once `videoWidth` /
`videoHeight` are known, so the video sits inside the photo's bounds at its own
ratio, centred, whole.

**Why not just `texture.repeat < 1`.** That would letterbox, but three.js
textures wrap `ClampToEdge` by default, so the region outside 0..1 repeats the
edge pixel — a smear of stretched colour down the margins instead of nothing.
Resizing the geometry has no such artefact. `repeat` and `offset` are reset to
`1,1` and `0,0`.

The photo plane remains `width = 1`, `height = ASPECT[i]`, so nothing about the
anchor geometry or target mapping changes.

**Needs a device:** portrait video on a landscape photo, landscape video on a
portrait photo, square, 4:3 and 21:9.

### 18. A backing mat behind the video, `?mat=off`

With contain, the margin would otherwise show the printed photo peeking out
around its own video. An `<a-plane class="mat">` at the photo's exact size sits
at z 0.0005 — between the photo surface and the video at 0.001 — in black at
0.85 opacity, fading in with the video so the margin reads as a frame.

It is a sibling inside the same anchor entity, so it inherits the tracked pose
and needs no separate handling. `?mat=off` renders it invisible for comparison.

### 19. Lost-video card takes the video's own shape

The card box is now sized from `videoWidth`/`videoHeight`, capped to
`min(viewport - 32px, 520px)` wide and 42% of viewport height, with
`object-fit: contain` and a black bed inside. A tall portrait clip can no
longer run off the screen, and nothing in the card is cropped.

### 20. The no-camera player uses the video's ratio, not the photo's

`player.tsx` forced `photoAspect` with `object-cover`. It now reads the real
ratio on `loadedmetadata` and uses `object-contain`; the photo's ratio is kept
only as a first-paint placeholder so the layout does not jump.

---

## Scanner rework — Part 3: presentation mode

### 21. The scan identifies the memory; the mode decides presentation

`mode` is `'photo'` or `'full'`, held in `sessionStorage` under `bp-mode`
alongside `bp-unmuted`, in the same try/catch. If storage throws (private
mode), `mode` stays null and the sheet is asked again on the next scan, which
is the correct fallback rather than silently picking one.

Target detection is untouched: `targetFound` still identifies which memory,
and only the branch afterwards differs.

### 22. First-scan choice sheet

Shown on the first successful scan of a visit when no mode is stored. Two
large targets, neither preselected, RTL-safe (`inset-inline-*`, no
left/right). `ensureSource()` is called **before** the sheet opens, so the
signed URL is already in flight and the tap is followed by playback rather
than a wait.

If the photo is lost while the sheet is open, the sheet stays and the chosen
memory still plays — `targetLost` returns early when `pendingChoice` matches.
The customer has already said which memory they meant; taking it away because
their hand moved would be absurd.

### 23. Full screen is a CSS overlay, NOT the Fullscreen API

`#vids` gets `.is-full` (`position: fixed; inset: 0`, black, `object-fit:
contain`, safe-area padding) exactly as the lost-card does. The `<video>`
element **never moves in the DOM** — see deviation 8.

**Why not `requestFullscreen` or `webkitEnterFullscreen`.** iPhone Safari has
no element fullscreen at all, and `webkitEnterFullscreen` hands the video to
the native player, which detaches the element A-Frame is using as a texture
source. The AR plane would go blank and not recover on exit.

While the overlay is open:

- `targetLost` does not pause, hide, or start the `LOST_CARD_MS` timer — the
  video is on the phone, not the page, so the photo leaving frame is irrelevant.
- MindAR processing is paused with **`arSystem.pause(true)`**. From
  `src/image-target/aframe.js`: `pause(keepVideo = false)` skips
  `this.video.pause()` when `keepVideo` is true, then calls
  `controller.stopProcessVideo()`. So the camera stream stays alive and
  returning to AR is instant with no second permission prompt. `unpause()`
  restarts both.
- The anchor entities are set `visible="false"` so neither the video plane nor
  the mat renders behind the overlay.
- Orientation is **not** locked. The overlay is pure CSS so it reflows on
  rotation; only the lost-card needs re-measuring, which a `resize` listener
  does.
- A new scan while in full screen swaps the overlay's video to the new memory.

### 24. Mode toggle during playback

A pill, top-trailing, shown whenever something is playing. Switching does not
restart the video — `enterFull` / `exitFull` only change presentation — and
writes the new mode to storage. Returning to AR re-anchors on the next
`targetFound`.

### 25. Teardown with the overlay open and MindAR paused

`releaseCamera()` calls `exitFull()` first, then proceeds as before.
`arSystem.stop()` calls `pause()` internally and stopping an
already-stopped controller is a no-op, so a paused MindAR tears down the same
way a running one does; `safe()` covers anything that still throws.

`visibilitychange` no longer unpauses MindAR when returning to a tab that has
the overlay open — it was paused deliberately there, and resuming would burn
battery behind a full-screen video. The video itself resumes.

**Needs a device.** Everything in Part 3 is unverified: the sheet, losing the
photo while it is open, switching modes mid-playback, rotating in full screen,
backgrounding with the overlay open, and returning to AR.

### 26. The corner toggle follows playback (fixes two bugs in 24)

Deviation 24 only ever unhid the toggle from inside `saveMode()`. Two
consequences, both found while re-checking it:

1. **On a return visit the toggle never appeared at all.** `mode` is restored
   by reading `sessionStorage` directly, which does not call `saveMode()`, so a
   customer who had already chosen once could never switch back.
2. **Once shown it never hid**, so it sat over the viewfinder while merely
   scanning, with nothing to re-present.

`syncModeToggle()` now decides visibility from state rather than from which
function last ran: visible when a mode is set **and** something is showing —
anchored on the page, in the lost-card, or in the overlay. It is called from
every transition that changes either (`startOnPhoto`, `enterFull`, `exitFull`,
`showCard`, `hideCard`, and both detection events), and hidden outright while
the choice sheet is open, since a toggle behind the sheet would be two ways to
answer the same question at once.

**Needs a device:** that the toggle appears on a second visit without the sheet
being shown again, and that it disappears when a video stops.
