# AUDIT — Blackpearl Live photo book

Read-only audit against `CLAUDE.md`, including the `## Product: Blackpearl Live
Photo Book` contract appended in Phase 0 (commit `9dc3b73`).

Audited at commit `9dc3b73`, branch `feat/admin-skeleton`.

**Section 2 (walkthrough gap table) could not be produced.**
`reference/walkthrough/` does not exist — the directory is absent, so there are
no frames and no `STORYBOARD.md`. The only thing under `reference/` is
`scanner-spike/` (`index.html`, `README.md`). This is prerequisite #1 from the
phase document and it blocks both section 2 here and the matching work in
Phase 3.

---

## 1. What exists

Nine routes. All data is real — there is no mock or seed path anywhere in the
codebase, so a missing Supabase/R2 configuration produces error states rather
than fixtures.

### Public

| Route | File | Renders | Reads | State |
|---|---|---|---|---|
| `/` | `src/app/page.tsx:15` | Static landing, no book access | nothing | real |
| `/b/[bookId]` | `src/app/b/[bookId]/page.tsx:20` | Entry screen + 3 numbered steps + "Scan to play" | `lookupPublicBook()` | real |
| `/b/[bookId]/scan` | `src/app/b/[bookId]/scan/route.ts:218` | Full HTML document, A-Frame + MindAR, not React | `lookupPublicBook()` | real |

`/b/[bookId]` always returns HTTP 200 and renders a message for non-ok states
(`page.tsx:28-60`). `/b/[bookId]/scan` returns 404 / 410 / 503 depending on
state (`route.ts:236-238`) — see bug 4.2.

### Admin (all gated by `requireStaff()`)

| Route | File | Renders | Reads/writes |
|---|---|---|---|
| `/admin` | `src/app/admin/page.tsx:16` | Three count tiles, "not built yet" list | counts from `customers`, `books` |
| `/admin/login` | `src/app/admin/login/page.tsx:15` | Email/password form | `supabase.auth.signInWithPassword` (`login/actions.ts:17`) |
| `/admin/customers` | `src/app/admin/customers/page.tsx:28` | List + create form | `customers` select/insert |
| `/admin/books` | `src/app/admin/books/page.tsx:47` | List + create form, live/expired badge | `books`, `customers` |
| `/admin/books/[bookId]` | `src/app/admin/books/[bookId]/page.tsx:46` | Scan link, hosting/access controls, uploader, memory table | `books`, `memories`, signed thumbnails |
| `/admin/books/[bookId]/compile` | `.../compile/page.tsx:19` | Browser-side `.mind` compiler + trackability scores | `books`, `memories` |

### Libraries

- `src/lib/public-book.ts:50` — the only public read path. Service-role client,
  scoped to one id, returns nothing unless the book is live.
- `src/lib/auth.ts:29` `requireStaff()` — session + `staff` row; `:59`
  `getStaffSession()` non-redirecting variant used for admin chrome only.
- `src/lib/r2.ts` — presigned PUT/GET/DELETE, key layout at `:68-78`.
- `src/proxy.ts:18` — session refresh only, passes through when unconfigured
  (`:31-38`).
- `supabase/migrations/20260922120000_init_schema.sql` — 4 tables, 13 policies,
  RLS enabled and forced on all.

### Not present at all

`/b/[bookId]/m/[memoryId]`, any download route, any Arabic/i18n, any QR
generation, any Sentry integration (listed in the stack, never wired).

---

## 2. Walkthrough gap table

**BLOCKED.** `reference/walkthrough/` does not exist. No frames, no
`STORYBOARD.md`.

Without it I cannot say which customer screens are missing versus merely
different, and Phase 3's instruction to match the walkthrough frames has no
reference to match. Recommend producing it before Phase 3; Phase 2 does not
depend on it.

---

## 3. Scanner diff — app vs `reference/scanner-spike/`

Comparing `src/app/b/[bookId]/scan/route.ts` against
`reference/scanner-spike/index.html`. Listed, not judged.

### Identical

- A-Frame `1.5.0` / `aframe-master.min.js`; mind-ar `1.2.5` /
  `mindar-image-aframe.prod.js` (`route.ts:290-291`, spike `:7-8`)
- `maxTrack: 1`, `autoStart: false`, `uiLoading/uiScanning/uiError: no`
- `xr-mode-ui="enabled: false"`, `device-orientation-permission-ui="enabled: false"`
- `<a-camera position="0 0 0" look-controls="enabled: false">`
- Lazy system lookup: `const getAR = () => scene.systems['mindar-image-system']`
  (`route.ts:321`, spike `:58`)
- Videos outside `<a-assets>`; `playsinline`, `webkit-playsinline`, `loop`,
  `muted`, `crossorigin="anonymous"`
- `width="1"` with height driven by the photo's aspect (`route.ts:357-360`)
- Target index = array position; `targetFound` / `targetLost` / `arReady` /
  `arError` wiring

### Differences

| # | Area | Spike | App | Where |
|---|---|---|---|---|
| 3.1 | Tracking filter | not set (defaults) | `filterMinCF: 0.0001`, `filterBeta: 1000`, `missTolerance: 10`, `warmupTolerance: 5` | `route.ts:50-55`, `:307` |
| 3.2 | Filter overridable | no | yes, via query string (`minCF`, `beta`, `miss`, `warmup`) | `route.ts:244-249` |
| 3.3 | `<a-video>` scale | none | `scale="0.97 0.97 1"` + `animation__in` on a `settle` event | `route.ts:272-274` |
| 3.4 | `<video preload>` | `metadata` | `auto` | `route.ts:259` |
| 3.5 | Pause on loss | immediate | deferred 400 ms, cancelled if target returns | `route.ts:366-368`, `:385-387` |
| 3.6 | Target source | 3 hardcoded entities | generated per memory | `route.ts:268-277` |
| 3.7 | `.mind` source | `./assets/targets.mind` | signed R2 URL | `route.ts:307` |
| 3.8 | Debug readout | always on | only `?debug=1` | `route.ts:243`, `:330` |
| 3.9 | UI chrome | two bare buttons | intro screen, reticle, hint, vignette, unmute pill | `route.ts:295-317` |
| 3.10 | Fonts | none | Google Fonts `<link>` | `route.ts:85-87` |
| 3.11 | Lifecycle cleanup | none | none | — |

Nothing in the frozen core (versions, scene config, geometry, ordering, event
wiring) diverges from the spike. All differences are additions, except 3.4
which is a changed value.

---

## 4. Bugs

### Confirmed from code

**4.1 — Every video for the book downloads on page load.**
`route.ts:259` sets `preload="auto"` on every generated `<video>`. The spike
used `preload="metadata"` (spike `:25`). A ten-page book with 8 MB videos
pulls ~80 MB before the customer taps anything, on whatever connection they
have. This also directly contradicts the Phase 5 requirement "Never fetch all
videos for the book up front". Regression introduced when the scanner was
branded.

**4.2 — Book existence leaks through HTTP status codes.**
`route.ts:236-238` returns 404 for `not-found` but 410 for `revoked` and
`expired`. The brief requires invalid and unknown to look identical. A caller
can distinguish "no such book" from "real book, revoked" without seeing the
body. The copy differs too (`route.ts:230-235`). Low exploitability — ids are
unguessable v4 UUIDs — but it is an explicit contract violation.

**4.3 — The camera is never released when the page is left.**
No `visibilitychange`, `pagehide`, `beforeunload` handler anywhere in
`route.ts`, and `arSystem.stop()` is never called. Navigating back, switching
tabs or following a link leaves `getUserMedia` tracks live, the camera
indicator on, and MindAR's processing loop running. On mobile this drains
battery and keeps the camera LED lit after the customer thinks they have left.
Phase 4 lists this as work; flagging it here because it is a defect in shipped
code, not a missing feature.

**4.4 — Customer-facing naming violates the brief in 13 places.**
"Living Memories" and "Black Pearl" (two words) appear at `page.tsx:4,19,24`;
`layout.tsx:25,26`; `b/[bookId]/page.tsx:6,54,74,75`; `scan/route.ts:205,216,297`.
The brief requires "Live photo book" and "Blackpearl" (one word) and names
"Living Memories" as a term never shown to a customer.

**4.5 — Scanner fonts load from Google's CDN, not `next/font`.**
`route.ts:85-87`. The brief says "Self-hosted via next/font". The React pages
do use `next/font` (`layout.tsx:2`); the scanner route cannot, because it
returns a raw HTML document outside React. Needs a deliberate decision rather
than being left as an accident — it is also a third-party request on a page
the customer reaches by scanning their own family photos.

**4.6 — Dates are computed in UTC for a business operating in Doha (UTC+3).**
`public-book.ts:79` and `dates.ts:14,20-21` both use `toISOString()`. The two
are consistent with each other, so no admin/public disagreement, but a book
expiring on day D stays live until 03:00 Doha time on D+1. Harmless in
direction (over-serves rather than cuts off early), but it will confuse anyone
reconciling a hosting term against a calendar.

**4.7 — `serverEnv().signedUrlTtlSeconds` is dead and duplicated.**
`env.ts:49-51` reads `R2_SIGNED_URL_TTL_SECONDS`, but `r2.ts:55` reads the same
variable independently and is the only one actually used. Two sources of truth
for one setting, one of which has no readers.

### Suspected, needs a device

**4.8 — The `settle` animation may leave the plane 3% undersized.**
`route.ts:272-274` renders `<a-video>` at `scale="0.97 0.97 1"` and animates to
`1 1 1` only on the `settle` event. If the animation component fails to run for
any reason, the video stays 3% smaller than the photo for the whole session.
Needs a device to confirm it fires reliably.

**4.9 — 400 ms pause grace may read as a hang on a deliberate page turn.**
`route.ts:385-387`. Riding through a glare is the intent, but when a customer
deliberately turns the page the old video keeps playing for 0.4 s over the new
one. Only a real book and a real hand can say whether that feels smooth or
broken.

**4.10 — `scanTtl()` of 1800 s versus a long browsing session.**
`r2.ts:118-121`. Signed video URLs are minted once at page load. A customer who
leaves the scanner open longer than 30 minutes gets a silent playback failure
with no retry path. Needs a device to judge how common that is.

---

## 5. Security check

### `npm run check:secrets`

```
> bpm@0.1.0 check:secrets
> bash scripts/check-secrets.sh

OK: no server-only secret is reachable from the client.
```

### Service-role key reachability

`SUPABASE_SERVICE_ROLE_KEY` is read in exactly two places: `env.ts:46` and
`scripts/grant-staff.mjs` (a CLI, never bundled). It reaches
`createAdminClient()` (`supabase/admin.ts:25`), which throws if called in a
browser (`:21-24`). No `NEXT_PUBLIC_` variable carries a secret. No client
component (`'use client'`) references any server-only name — verified by
`scripts/check-secrets.sh` check 2, which has been negative-tested.

### Supabase queries reachable from a public route

Only one: `lookupPublicBook()` (`public-book.ts:50`), called by
`b/[bookId]/page.tsx:26` and `scan/route.ts:224`. It:

- rejects anything that is not a v4 UUID before touching the database
  (`:54`, `:20-21`)
- selects only `id, title, expiry_date, revoked_at, mind_object_key` from
  `books` (`:71`) — **no customer name, email or phone is ever selected**
- selects only `target_index, photo_aspect, video_object_key` from `memories`
  (`:88`)
- returns nothing unless not-revoked, in-term, compiled and contiguous
  (`:76-101`)

It uses the service role, which bypasses RLS. That is deliberate and is why
`anon` holds no policy on any table — a public SELECT policy would let anyone
with the public key enumerate every book. Verified in the migration: the only
13 policies are `to authenticated` gated on `is_staff()`, and
`scripts/verify-migrations.sh` asserts no anon-reachable policy exists and has
been negative-tested.

### Buckets and URLs

Cloudflare R2 bucket `black-pearl-media`. No public URL is ever produced:
`r2.ts` exposes only `signUpload` (`:81`), `signDownload` (`:105`) and
`deleteObject` (`:123`), all presigned. TTLs: 300 s for admin thumbnails and
uploads (`:55`), 1800 s for scanning sessions (`:119`). The scanner document
embeds signed URLs and is served `no-store, private` with
`x-robots-tag: noindex` and `referrer-policy: no-referrer`
(`route.ts:190-195`).

### Gaps

- **No rate limiting** on `/b/[bookId]`. UUIDs make enumeration impractical,
  but nothing throttles attempts.
- **4.2** leaks existence by status code.
- **No audit log.** Nothing records which book was accessed, when, or from
  where. A leaked QR being scanned from an unexpected place is currently
  undetectable.

---

## 6. Brand gaps

Measured against `CLAUDE.md` → Brand system.

| Gap | Where | Detail |
|---|---|---|
| Naming | 13 sites, see 4.4 | "Living Memories" / "Black Pearl" instead of "Live photo book" / "Blackpearl" |
| Dark-mode meaning | `scan/route.ts:111-116` | The intro screen is already ink before the camera opens. The brief wants the switch to ink to *be* the moment the book opens; today the customer is on ink from the moment they tap through from `/b/[bookId]` |
| Grey ramp incomplete | `globals.css` `@theme` | `#1A1A1A` (grey-1) is defined in the brief but absent from the token block; `grey-2..6` are present |
| Utility voice | `b/[bookId]/page.tsx:67-71` | Steps read as sentences ("Allow camera access when your phone asks."). The brief asks for "STEP 01 — SCAN" style uppercase tracked labels |
| Contact-sheet treatment | nowhere | No photograph presentation anywhere in the customer viewer; nothing to caption yet |
| shadcn restyle | n/a | No shadcn primitive is used in the customer viewer, so nothing to restyle. Admin uses them, which the brief permits |
| Colour | — | **Compliant.** No non-monochrome class appears in any customer path (grep across `page.tsx`, `layout.tsx`, `b/**` returns nothing) |

---

## 7. Missing product pieces

| Piece | Status | Note |
|---|---|---|
| Expired state | **exists** | `public-book.ts:80`, rendered `b/[bookId]/page.tsx:36-39`. Copy does not offer renewal via WhatsApp |
| Revoked state | **exists** | `public-book.ts:76` |
| Invalid / unknown book | **exists but distinguishable** | see 4.2 |
| Book with no memories | **exists** | returns `not-ready` (`public-book.ts:94`), same as "not compiled". The customer cannot tell "we are still preparing" from "something is wrong" — acceptable, possibly intentional |
| Loading state | **missing** | No `loading.tsx` anywhere. `/b/[bookId]` is dynamic and does a round trip to Supabase plus 1 + N R2 signings before first paint |
| Per-page QR fallback `/b/[bookId]/m/[memoryId]` | **missing entirely** | No route, no QR generation, nothing in the schema linking a printed page to a memory beyond `target_index` |
| Download my videos | **missing entirely** | |
| Arabic / RTL | **missing entirely** | No dictionary, no `dir` handling, no Arabic font, no `Accept-Language` logic. Every customer string is a hardcoded English literal |
| WhatsApp support link | **missing entirely** | `wa.me/97431123552` appears nowhere in `src/` |
| Short book reference | **missing entirely** | The brief requires a prefilled WhatsApp message carrying "the book's short reference — never the full bookId". No such column exists; books have only a UUID |
| Sentry | **missing** | Listed in the stack, never installed |
| QR generation (book or page) | **missing** | Listed in the architecture section of CLAUDE.md |
| Hosting term default | **missing** | Admin takes an arbitrary date per book; PRODUCT DECISION still TODO |
| Max video length | **not enforced** | `actions.ts:13` caps at 200 MB, a size proxy for a duration rule; PRODUCT DECISION still TODO |

---

## 8. Proposed plan

The phase structure is sound. Four adjustments.

**8a. Add the short book reference to Phase 2, not Phase 3.**
The WhatsApp support path is required on *every* customer error state, and it
must carry a short reference rather than the bookId. That needs a column, a
uniqueness constraint, a generator and a backfill — schema work. Doing it
inside Phase 3 means stopping mid-UI to write a migration. Doing it in Phase 2
means Phase 3 can just use it. Suggested shape: 6 characters from an
unambiguous alphabet (no `0/O`, `1/I`), e.g. `BP-7K4M`, unique per book, shown
in admin and printed inside the book.

**8b. Fix 4.1 and 4.3 in Phase 2, not Phase 4.**
Both are in the scanner, and Phase 2 says no scanner changes unless the bug is
in the scanner and the fix moves it toward the spike. 4.1 (`preload="auto"`)
qualifies exactly — reverting to `preload="metadata"` *is* the spike's value.
4.3 (camera never released) does not move toward the spike, since the spike has
no cleanup either, but shipping a page that holds the camera open after the
customer leaves is not something to carry through two more phases. Recommend
taking 4.1 in Phase 2 as a revert-to-spike, and pulling 4.3 forward into Phase 2
as an explicit exception you approve.

**8c. Produce the walkthrough before Phase 3, not before Phase 1.**
Phase 1 lost only section 2 to its absence. Phase 3 is anchored to it
throughout and should not start without it.

**8d. Consider cutting the `/` route from scope.**
`src/app/page.tsx` is a public landing page for a product whose marketing site
is explicitly a separate codebase. It currently duplicates brand surface that
belongs on blackpearlqa.com. Simplest correct behaviour may be to redirect `/`
to the marketing site, which also removes a surface that has to be translated,
branded and maintained.

Two things worth noting about ordering as written:

- Phase 3 item 5 ("Download my videos") and item 3 (the `m/[memoryId]`
  fallback) both need signed-URL plumbing that exists (`r2.ts:105`) but no
  route. They are small once the short reference lands.
- Phase 6 item 3 asks for near-duplicate photo detection within a book. The
  compiled `.mind` already yields per-target feature data
  (`compile-client.tsx:131-142`), so a duplicate check may be possible from the
  existing compile step without a new dependency. Worth investigating there
  before proposing an image-hashing library.

---

## Build and check results — verbatim

```
######## TYPECHECK ########

> bpm@0.1.0 typecheck
> tsc --noEmit

typecheck exit=0

######## LINT ########

> bpm@0.1.0 lint
> eslint

lint exit=0

######## BUILD ########
  Creating an optimized production build ...
✓ Compiled successfully in 2.4s
  Running TypeScript ...
  Finished TypeScript in 2.3s ...
  Collecting page data using 2 workers ...
  Generating static pages using 2 workers (0/8) ...
  Generating static pages using 2 workers (2/8) 
  Generating static pages using 2 workers (4/8) 
  Generating static pages using 2 workers (6/8) 
✓ Generating static pages using 2 workers (8/8) in 194ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /admin
├ ƒ /admin/books
├ ƒ /admin/books/[bookId]
├ ƒ /admin/books/[bookId]/compile
├ ƒ /admin/customers
├ ƒ /admin/login
├ ƒ /b/[bookId]
└ ƒ /b/[bookId]/scan


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

build exit=0

######## CHECK:SECRETS ########

> bpm@0.1.0 check:secrets
> bash scripts/check-secrets.sh

OK: no server-only secret is reachable from the client.
secrets exit=0
```

`npm run verify:db` was not run — no migration changed in this session, and it
requires Docker, which is currently stopped.
