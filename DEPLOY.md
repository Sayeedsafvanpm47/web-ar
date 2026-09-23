# Deploying to Vercel

The scanner needs HTTPS (camera access requires a secure context), so a real
deployment is the only way to get a link you can hand to someone.

Work through this in order. Steps 4 and 5 are the ones people forget, and both
fail in ways that look like the app is broken rather than misconfigured.

## 1. Push the branch

```bash
git push -u origin feat/admin-skeleton
```

Or merge to `main` first if you want production rather than a preview URL.

## 2. Import the project

[vercel.com/new](https://vercel.com/new) → import this repository. Framework
detection picks up Next.js; leave the build settings alone.

**Do not deploy yet** — add the environment variables first, or the first
build will fail and you will be debugging a red X for no reason.

## 3. Environment variables

Settings → Environment Variables. Add all of these for **Production** (and
Preview, if you want preview URLs to work):

| Name | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** — never prefix `NEXT_PUBLIC_` |
| `R2_ACCOUNT_ID` | secret |
| `R2_ACCESS_KEY_ID` | secret |
| `R2_SECRET_ACCESS_KEY` | secret |
| `R2_BUCKET` | `black-pearl-media` |
| `R2_SIGNED_URL_TTL_SECONDS` | `300` |
| `R2_SCAN_URL_TTL_SECONDS` | `1800` |

Copy the values from `.env.local`. Vercel does not read that file.

Run `npm run check:secrets` before every deploy — it is the hard rule 4 gate
and it catches a secret that has drifted into a client component or picked up
a `NEXT_PUBLIC_` prefix.

## 4. Add the deployed origin to R2 CORS

**Uploads and the scanner will both fail without this**, and the browser gives
no useful error. The bucket only accepts browser requests from listed origins.

With an R2 token that has Admin Read & Write:

```bash
node scripts/setup-r2-cors.mjs https://your-app.vercel.app
```

That keeps `http://localhost:3000` and adds the new origin. Otherwise set it
by hand: Cloudflare dashboard → R2 → `black-pearl-media` → Settings → CORS
Policy.

Preview deployments get a different URL on every push. If you want previews to
work, add that origin too, or just test on the production URL.

## 5. Turn off Deployment Protection for the public routes

By default Vercel may put preview (and sometimes production) deployments behind
a login wall. A customer scanning a QR code will hit that wall.

Settings → Deployment Protection. Either disable it, or make sure the
production URL is public. `/admin` is protected by the app's own staff gate,
not by Vercel's.

## 6. Smoke test

1. Open `https://your-app.vercel.app/admin/login`, sign in as staff.
2. Open a book, confirm the photos load (signed URLs work).
3. Compile targets if the book has not been compiled.
4. Open `https://your-app.vercel.app/b/<bookId>` on a phone.
5. Tap **Scan to play**, allow camera, point at a photo.

Add `?debug=1` to the scan URL for the readout: tracked target index,
time-to-first-detection, and loss count.

## Scanning from a screen vs print

Both work. A photo on a laptop or phone screen is fine for proving the pipeline
end to end.

Tracking quality is noticeably worse from a screen, though — glare, the
backlight flattening contrast, and moiré between the camera and the display's
pixel grid all destroy feature points. Judge whether tracking is good enough
only from a real print.

## Notes

- The Supabase project in `.env.local` is currently the only one, so it is
  also production. Hard rule 5 says never run migrations or seed scripts
  against production; that rule is being knowingly set aside for now. It stops
  being cheap the moment real customer video is in the bucket.
- `/b/[bookId]` and `/b/[bookId]/scan` are served `no-store` and `noindex`
  because signed URLs are embedded in the HTML.
- Signed video URLs last `R2_SCAN_URL_TTL_SECONDS` (30 minutes by default). A
  scanning session left open longer than that needs a page reload.
