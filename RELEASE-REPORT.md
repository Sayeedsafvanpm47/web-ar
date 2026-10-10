# Release report — Blackpearl Live photo book

Written 2026-10-10, at commit `8387cef`, branch `feat/admin-skeleton`.

**The headline: almost nothing has been tested on a phone.** The only test book
expired on 2026-09-23, so every attempt to open the scanner since then has
returned the "hosting has ended" page instead of the scanner. The app's own
scanner has never run end to end.

One action unblocks most of this column: extend the test book's date in
**/admin/books/[id] → Hosting and access**, then open the scanner on a phone.

---

## Verification status

**"Mocked" is empty throughout.** There is no mock or seed path in this
codebase. Every screen reads real Supabase and real R2, so an unconfigured
environment produces error states rather than fixtures.

"Verified on a real device" contains only what you explicitly reported working.

### The scanner

| Feature | Real device | Local browser | Mocked | Not verified |
|---|---|---|---|---|
| Spike scanner tracking 3 targets (`reference/scanner-spike/`) | ✅ you confirmed on Android | | | |
| App scanner — camera opens at all | | | | ❌ |
| App scanner — video appears on the photo | | | | ❌ |
| Tracking filter values (`filterMinCF` 0.0001, `missTolerance` 10) | | | | ❌ reasoned from docs, never measured |
| Lost-video card (4.5s before pausing) | | | | ❌ |
| Camera released on `pagehide` | | | | ❌ read in MindAR's source only |
| Background suspend / resume | | | | ❌ |
| bfcache reload on `pageshow` | | | | ❌ |
| Camera-denied panel + per-platform steps | | | | ❌ |
| **Pre-flight probe causes one prompt, not two** | | | | ❌ **highest risk — see open issues** |
| Lazy signed URL fetch rebuilds the video texture | | | | ❌ **second highest risk** |
| Cover-fit crops rather than stretches | | | | ❌ |
| Fade-in removes the black flash | | | | ❌ |
| Unmute remembered across a visit | | | | ❌ |

### Customer screens outside the scanner

| Feature | Real device | Local browser | Mocked | Not verified |
|---|---|---|---|---|
| `/b/[bookId]` entry renders | | ✅ | | |
| Expired state renders with correct copy | | ✅ | | |
| WhatsApp link carries `BP-3SMPCA`, not the book id | | ✅ | | |
| No signed URL in entry / pages / downloads HTML | | ✅ grepped for `X-Amz-Signature`, zero | | |
| Arabic: `dir="rtl"`, `lang="ar"`, Arabic face | | ✅ | | |
| Arabic chosen from `Accept-Language` alone | | ✅ | | |
| **Arabic wording is correct** | | | | ❌ machine-drafted, `TODO-REVIEW` |
| `/b/[bookId]/pages` list | | | | ❌ book expired |
| `/b/[bookId]/m/[memoryId]` player | | | | ❌ book expired |
| Download on click (not at page load) | | | | ❌ book expired |
| Loading state | | | | ❌ |
| Safe-area insets, 48px touch targets | | | | ❌ needs a notched phone |

### Admin

| Feature | Real device | Local browser | Mocked | Not verified |
|---|---|---|---|---|
| Staff sign-in, staff gate | | ✅ you signed in as admin2 | | |
| Create customer, create book | | ✅ you created "sayeed" / "test" | | |
| Upload photo + video to R2 | | ✅ you uploaded, thumbnail rendered | | |
| Compile target file + trackability scores | | | | ❌ never run on a real book |
| Drag to reorder pages | | | | ❌ |
| Near-duplicate rejection on upload | | | | ❌ rules unit-tested, UI path not exercised |
| Unusable-photo rejection | | | | ❌ same |
| Mark ready gate | | | | ❌ |
| QR print page | | | | ❌ |
| Extend hosting term / revoke | | | | ❌ |

### Data layer

| Feature | Real device | Local browser | Mocked | Not verified |
|---|---|---|---|---|
| Migrations apply cleanly | | ✅ throwaway Postgres | | |
| RLS enabled, forced, policied, no anon policy | | ✅ asserted + negative-tested | | |
| `anon` cannot read any table | | ✅ behavioural test as 3 principals | | |
| Book reference backfill on an existing database | | ✅ tested against a DB holding 3 books | | |
| Target index N → memory N (delete, reorder) | | ✅ 25 unit tests | | |
| Photo hash / duplicate thresholds | | ✅ 14 of those tests | | |
| **Migrations applied to your Supabase** | | | | ❌ **`photo_hash` not applied — uploads will fail** |

---

## Bugs fixed

| Commit | Fix |
|---|---|
| `8c151d4` | `preload="auto"` fetched every video in the book on page load (~80MB for ten pages). Reverted to the spike's `preload="metadata"`. |
| `61738d9` | A revoked book returned 410 while an unknown id returned 404, so the response confirmed whether an id was real. Both now 404 with identical copy. |
| `e439738` | Nothing stopped the camera on leaving the page — tracks stayed live, indicator lit, MindAR still processing. |
| `978291b` | "Today" was computed in UTC for a business in Doha, so a term ending on the 7th stayed live into the 8th, local time. |
| `12cda77` | `R2_SIGNED_URL_TTL_SECONDS` was read in two places, one with no readers. |
| (in `1df8546`) | bfcache restore returned a torn-down scene that still looked live, stranding the customer on a dead screen. `pageshow` now reloads. |

Found earlier, outside the numbered phases: the proxy threw on a missing env
var and 500'd every route including ones needing no auth (`538c176`); the
scanner used `vr-mode-ui`, which does not exist in A-Frame 1.5.0; the MindAR
system was captured at parse time, before scene systems attach.

---

## Scanner changes

**The core is untouched and that was verified mechanically**, not by eye —
both CDN versions, the `mindar-image` attribute, the camera entity,
`xr-mode-ui`, the lazy system lookup, video attributes, plane geometry, target
ordering, and all four event handlers are byte-identical to
`reference/scanner-spike/`.

Thirteen deviations exist in the UI layer around it, each with its reasoning
and its device-test status in **[SCANNER-CHANGES.md](SCANNER-CHANGES.md)**.

Two of those move *away* from the spike rather than toward it, and were applied
as deliberate exceptions:

- camera release on leave (`e439738`) — the spike has no teardown either, but a
  customer-facing page holding the camera open is a defect
- the `getUserMedia` pre-flight probe — MindAR reports only `VIDEO_FAIL`, which
  cannot distinguish "the customer tapped Block" from "no camera API"

---

## Security checks

All run at `8387cef`. Output verbatim.

```
=== npm run check:secrets ===
> bash scripts/check-secrets.sh
OK: no server-only secret is reachable from the client.
exit=0
```

```
=== npm run verify:db ===
==> applying migrations
    supabase/migrations/20260922120000_init_schema.sql
    supabase/migrations/20261007090000_book_reference.sql
    supabase/migrations/20261008090000_photo_hash.sql
==> asserting security invariants
NOTICE:  all invariants hold
==> asserting policy behaviour
NOTICE:  policy behaviour: all assertions passed
NOTICE:  book reference: all assertions passed
NOTICE:  photo hash: all assertions passed
==> policy inventory
 tablename |       policyname       |      roles      |  cmd
-----------+------------------------+-----------------+--------
 books     | staff delete books     | {authenticated} | DELETE
 books     | staff insert books     | {authenticated} | INSERT
 books     | staff read books       | {authenticated} | SELECT
 books     | staff update books     | {authenticated} | UPDATE
 customers | staff delete customers | {authenticated} | DELETE
 customers | staff insert customers | {authenticated} | INSERT
 customers | staff read customers   | {authenticated} | SELECT
 customers | staff update customers | {authenticated} | UPDATE
 memories  | staff delete memories  | {authenticated} | DELETE
 memories  | staff insert memories  | {authenticated} | INSERT
 memories  | staff read memories    | {authenticated} | SELECT
 memories  | staff update memories  | {authenticated} | UPDATE
 staff     | staff read own row     | {authenticated} | SELECT
(13 rows)
OK: migrations apply cleanly and all invariants hold.
exit=0
```

What those assert: RLS enabled **and forced** on every table; no table left
with RLS on and zero policies; **no policy reachable by `anon`**; every `id`
defaults to `gen_random_uuid()`. Both gates are negative-tested — planting a
table without RLS, an anon-readable policy, a `NEXT_PUBLIC_`-prefixed secret,
and a client component reading the service key each fail the run.

Also verified during the phases:

- The public read path selects **no customer PII** — no name, email or phone
  appears in any query reachable from `/b/`.
- No `X-Amz-Signature` in entry, pages or downloads HTML.
- Download URLs are minted on click, not at page load.
- QR encoding makes **no network call** — confirmed by making `http.request`
  throw, then generating a code successfully.

### Deliberately not done

A hosted QR service was offered and declined. The URL in a book's QR *is* the
credential for that customer's videos; encoding it through a third party would
put a working link to every printed book into someone else's request logs,
permanently and unrevocably. Encoding is pure computation and now happens
locally.

**The API key shared in that conversation should be rotated.**

---

## Open issues

### Blocking a release

1. **`photo_hash` migration is not applied to Supabase.** Uploads will fail
   against production until `20261008090000_photo_hash.sql` runs. Unlike the
   reference migration there is no graceful fallback, because the column is
   written on every upload.
2. **The app's scanner has never been run.** Everything from Phase 4 onward is
   unexercised. Extend the test book's date to unblock.
3. **Arabic is machine-drafted.** Every string is `TODO-REVIEW` in
   `src/lib/i18n.ts`. This product is used at funerals as often as weddings;
   the English was written for that and the Arabic has not been checked by
   anyone who would know.
4. **`NEXT_PUBLIC_VIEWER_ORIGIN` is unset.** A QR printed with the wrong origin
   cannot be fixed without reprinting the book.

### Known risks, ranked

5. **The camera pre-flight may prompt twice.** It calls `getUserMedia`, stops
   the stream, then lets MindAR acquire its own. Permission should persist and
   produce one prompt — if it produces two, that is worse than the problem it
   solves and the probe should be dropped.
6. **Lazy video sources may leave the plane blank.** A-Frame builds the video
   material at scene init from an element that now has no `src`. The code
   forces a texture rebuild once frames arrive; if a found photo shows nothing,
   this is the cause. Revert path documented in SCANNER-CHANGES.md.
7. **Duplicate detection is a perceptual hash, not feature matching.** It
   catches the same photo twice, a re-crop, a re-compression. It does **not**
   catch two different photographs of the same subject — which remains MindAR's
   real confusion mode. Narrowed, not eliminated.
8. **Trackability thresholds are extrapolated from three samples.** The spike's
   targets scored 1633 / 2074 / 2464. Reject-under-300 and warn-under-800 are
   guesses around those and need tuning against real customer photos.

### Smaller

9. `status` still duplicates state derivable from `revoked_at` and
   `expiry_date`. Two sources of truth that can disagree.
10. No rate limiting on `/b/[bookId]`. UUIDs make enumeration impractical, but
    nothing throttles attempts.
11. No access log. A leaked QR being scanned from an unexpected place is
    currently undetectable.
12. **Sentry is in the stack and has never been wired up.** Nothing reports
    errors from production.
13. Three `PRODUCT DECISIONS` in CLAUDE.md are still `TODO`: viewer domain,
    hosting term length, max video length. The last two are unenforced — upload
    caps at 200MB, a file-size proxy for a duration rule.
14. The scanner loads fonts from Google's CDN rather than `next/font`, because
    it returns a raw HTML document outside React.
15. `reference/walkthrough/STORYBOARD.md` was derived from the code and the
    brief, **not** from your walkthrough video. Where the real walkthrough
    disagrees, it wins.
16. No screenshots were captured. Phase 3 asked for 390×844 and 360×800 via
    Playwright "only if already installed" — it is not, and adding it was not
    approved.
