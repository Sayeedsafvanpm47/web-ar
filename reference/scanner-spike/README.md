# WebAR image-tracking spike

Throwaway test page for judging MindAR tracking quality. Single static
`index.html`, no build step.

## Pinned versions

| Library | Version | CDN URL (verified 2026-09-22) |
|---|---|---|
| A-Frame | 1.5.0 | `https://cdn.jsdelivr.net/npm/aframe@1.5.0/dist/aframe-master.min.js` |
| MindAR (image + A-Frame) | 1.2.5 | `https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js` |

1.2.5 is the newest `mind-ar` on npm (published 2024-01-16); there has been no
release since. A-Frame 1.5.0 is what the MindAR install docs pin — A-Frame is
up to 1.8.0, but MindAR 1.2.5 predates it and is not tested against it. If you
want to try a newer A-Frame, change only that one URL.

### Docs used

- Overview / quick start: https://hiukim.github.io/mind-ar-js-doc/quick-start/overview/
- Installation (CDN tags): https://hiukim.github.io/mind-ar-js-doc/installation/
- Tracking config params: https://hiukim.github.io/mind-ar-js-doc/quick-start/tracking-config/
- Image targets compiler: https://hiukim.github.io/mind-ar-js-doc/tools/compile/
- Component source (schema, events, anchor scaling):
  https://github.com/hiukim/mind-ar-js/blob/master/src/image-target/aframe.js
- Events + manual-start example:
  https://github.com/hiukim/mind-ar-js/blob/master/examples/image-tracking/example3.html

## Files you need to supply

```
assets/targets.mind     compiled from your 3 jpgs
assets/video0.mp4       plays on target index 0
assets/video1.mp4       plays on target index 1
assets/video2.mp4       plays on target index 2
```

## How the plane is sized

MindAR normalises the anchor space so **1 unit = the full width of the tracked
image**, with height = image height / image width. So each `<a-video>` keeps
`width="1"` and only its `height` changes.

The page sets that height from each video's own aspect ratio
(`videoHeight/videoWidth`) on `loadedmetadata`. That is correct if you exported
each video at the same aspect ratio as its photo. If a video's aspect differs
from its printed image, put the **image's** height/width ratio into the
`ASPECT` array at the top of the `<script>` (e.g. `[0.75, 0, 1.414]`; `0` means
"use the video's ratio").

`maxTrack: 1` — one target at a time, which is what you want for judging
tracking quality. Raise it in the `mindar-image` attribute if you need
simultaneous tracking.

## Debug readout

Always-on overlay, top-left:

- `state` — idle / starting camera / scanning / error
- `target` — currently tracked target index, or `none`
- `ttfd` — ms from the Start tap to the first `targetFound`. Includes camera
  permission + stream startup, so it is the honest end-user number. Reload to
  measure again.
- `losses` — cumulative `targetLost` count. This is the number that tells you
  whether tracking is viable: a few losses while you move the phone is normal,
  a rising count while holding still is not.
- `audio` — muted / on

## Serving over HTTPS for phone testing

Camera needs a secure context. `localhost` is exempt, a LAN IP is not.

### Simplest that works first try — Cloudflare tunnel

Two terminals, from `D:\web-ar`:

```powershell
npx --yes http-server . -p 8080 -c-1
```

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:8080
```

It prints a `https://<random>.trycloudflare.com` URL. Open that on the phone —
real trusted cert, no warnings, no cert install. The phone does not actually
need to be on the same wifi. Videos stream through the tunnel, so first load is
slower than LAN.

### Same-wifi, no tunnel — mkcert + http-server

```powershell
winget install FiloSottile.mkcert
mkcert -install
ipconfig | findstr /i "IPv4"
mkcert 192.168.1.42 localhost 127.0.0.1
npx --yes http-server . -p 8080 -c-1 -S -C .\192.168.1.42+2.pem -K .\192.168.1.42+2-key.pem
```

Substitute your actual IPv4. Open `https://192.168.1.42:8080` on the phone.
The phone will show a cert warning because it does not trust your local CA —
on iOS you must email/AirDrop yourself `mkcert -CAROOT`'s `rootCA.pem`, install
the profile, then enable it under Settings > General > About > Certificate
Trust Settings. That is why the tunnel is the recommended option.

Also allow the port through the firewall once, elevated:

```powershell
New-NetFirewallRule -DisplayName "web-ar 8080" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
```

## Generating targets.mind from 3 jpgs

There is no official CLI — `mind-ar` ships no `bin` entry. Use the browser
compiler.

1. Open https://hiukim.github.io/mind-ar-js-doc/tools/compile/
   It runs entirely in your browser; images are not uploaded anywhere.
2. Drag all three jpgs into the dropzone **at once, in the order you want
   them indexed**. The first file becomes `targetIndex: 0`, the second `1`,
   the third `2`. This order is the only thing that binds a photo to a video —
   get it wrong and video1 plays on the wrong photo.
3. Click **Start**. A percentage counter runs; three images typically take
   tens of seconds.
4. The page switches to the visualiser. Click **Download compiled** to get
   `targets.mind`. Save it to `assets/targets.mind`.

### Reading the feature-quality output

The compiler does not print a numeric score. What it gives you is a
visualisation, and you read it by eye:

- An **Image 1 / Image 2 / Image 3** tab row — one per input image.
- A **Scale 1 / Scale 2 / ...** tab row — the image resampled at progressively
  smaller resolutions. Each scale is a keyframe MindAR will try to match
  against, which is how it tolerates the phone being near or far.
- A greyscale canvas with detected feature points drawn on it.

What to look for:

- **Density.** Lots of points spread over the whole frame is good. A sparse
  canvas means few things to match and detection will be slow or will not
  happen.
- **Spread.** Points clustered in one corner with large empty regions means
  tracking will break as soon as that corner leaves frame. You want coverage
  edge to edge.
- **Survival across scales.** Step through every Scale tab. A target that has
  plenty of points at Scale 1 but almost none by the last scale will only track
  when the phone is close. Good targets keep a usable spread at the coarsest
  scale.

Images that score badly: large flat areas (sky, plain walls, solid
backgrounds), repeating patterns (grids, text at small sizes, regular tiling —
they produce ambiguous matches), low contrast, heavy blur. Images that score
well: high-contrast, asymmetric, busy but not repetitive detail.

Practical notes: use images around 1000px on the long edge, keep the aspect
ratio the same as what you actually print, and crop out any border/margin that
will not be part of the printed photo — MindAR maps the anchor to the image
you compiled, so extra whitespace shifts the video off the photo.
