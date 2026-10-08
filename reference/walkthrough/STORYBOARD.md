# Customer walkthrough — storyboard

**Provenance, read this first.** This was written by reading the code and the
`## Product: Blackpearl Live Photo Book` brief in CLAUDE.md. It is **not** a
record of the owner's walkthrough video — no frames were exported and none were
seen. Treat it as a specification of the flow as currently built and intended,
not as evidence of what was demonstrated.

Where the real walkthrough disagrees with this, **the walkthrough wins**.
Replace the relevant frames here and note what changed.

There are no image frames in this directory. Each frame below is described in
words and points at the code that produces it.

---

## The spine

```
printed book ──QR on inside cover──▶  /b/[bookId]          entry, on paper
                                            │
                                            ├─▶ /b/[bookId]/scan        camera, on ink
                                            ├─▶ /b/[bookId]/pages       list, on paper
                                            └─▶ /b/[bookId]/downloads   list, on paper

printed page ──small QR on the page──▶ /b/[bookId]/m/[memoryId]   one video, on ink
```

Paper is everything before the book opens. Ink is playback. The switch to dark
is the moment the book opens, not a theme.

---

## 01 — Entry

**Screen:** `/b/[bookId]` · `src/app/b/[bookId]/page.tsx`

Paper ground. `BLACKPEARL` top-left, language toggle top-right. The book's own
title set large in Fraunces. A hairline rule, then three numbered steps in the
utility voice. At the bottom: **Scan to play** as a full-width ink pill, then
two quiet underlined links — *Watch without the camera*, *Download my videos* —
then a line giving the page count and the lighting advice.

**What the customer did:** scanned the QR on the inside cover with their phone
camera, tapped the notification.

**What happens next:** tapping **Scan to play** goes to frame 02. Nothing on
this screen requests the camera.

**Loading:** `loading.tsx` shows a pulsing `BLACKPEARL` wordmark. Deliberately
not a spinner.

**Failure:** any non-ok lookup renders frame 10.

---

## 02 — Before the camera

**Screen:** `/b/[bookId]/scan`, intro layer · `src/app/b/[bookId]/scan/route.ts`

Ink ground, full bleed. `BLACKPEARL · LIVE PHOTO BOOK` at the top, the book
title in Fraunces in the middle with one line of instruction, and a paper pill
reading **Scan to play** at the bottom with a quiet note that the camera comes
next.

**Why it exists:** iOS will not grant camera access without a user gesture, and
a permission prompt firing unannounced on a funeral book would be awful. The
camera is requested only from this tap.

**What happens next:** tap → frame 03.

---

## 03 — Starting the camera

**Screen:** same route, starting state.

The button becomes inert and reads *Starting…*. The browser's own permission
prompt appears over the page. Nothing else moves.

**What happens next:** allow → frame 04. Deny → frame 09.

---

## 04 — Scanning

**Screen:** same route, scanning state.

The camera feed fills the screen. A thin vignette darkens the edges so white UI
stays readable over a bright page. Four corner brackets sit centred, breathing
slowly. One line below them: *Hold over a photo*. A *Tap for sound* pill sits
at the bottom.

Nothing else. No debug text, no branding, no controls.

**What the customer does:** holds the phone over a photo in the book.

---

## 05 — Found

**Screen:** same route, tracking.

The brackets and the instruction fade out. The video appears registered on the
printed photo, settling in from 97% scale rather than popping. It covers the
photo exactly, because the plane is sized from the *photo's* aspect ratio, not
the video's.

Muted by default. Tapping *Tap for sound* unmutes and the control disappears
for the rest of the visit.

---

## 06 — Lost

**Screen:** same route, lost state.

The customer turns the page, moves the phone, or a hand crosses the photo.

The video does **not** vanish. It continues playing in a card at the bottom of
the screen for a few seconds, so a brief glare or a wobble is invisible and a
deliberate page turn does not feel like a crash. The brackets and instruction
return behind it.

**Returning to the same photo** resumes in place. **A different photo**
switches to that page's video. **Several seconds with nothing found** pauses
and dismisses the card.

---

## 07 — Watch without the camera

**Screen:** `/b/[bookId]/pages` · `src/app/b/[bookId]/pages/page.tsx`

Paper. Back link, language toggle. Book title, then every page as a numbered
row with a chevron. Download link at the bottom.

**Why it exists:** the camera path can fail for reasons the customer cannot
fix — permission denied, a dim room, an in-app browser, a photo that will not
track. The brief treats this as part of the product, not a fallback.

---

## 08 — One page, no camera

**Screen:** `/b/[bookId]/m/[memoryId]` · `src/app/b/[bookId]/m/[memoryId]/page.tsx`

Ink. Back link, `PAGE n / total`, language toggle. The video fills the frame at
the printed photo's aspect ratio, `object-cover` so nothing stretches. Muted
autoplay with a paper **Tap for sound** pill beneath. Book title in the footer.

This is where the small QR printed on each page leads. It addresses the memory
by **id**, so unlike the scanner it cannot play the wrong page.

**Failure:** video error → *This video can't load right now* with **Try again**.

---

## 09 — Camera denied

**Screen:** `/b/[bookId]/scan`, denied state.

Ink. A heading saying the camera is blocked, then plain instructions for the
customer's own browser — the iPhone Safari steps and the Android Chrome steps,
shown separately. No error code, no technical language.

Two ways out, always: **Watch without the camera** (frame 07) and **Message us
on WhatsApp**.

---

## 10 — Something is wrong

**Screen:** any customer route · `src/components/customer/chrome.tsx` → `StateScreen`

Paper. Heading, one sentence, and exactly one action: **Message us on
WhatsApp**, prefilled with the book's short reference.

Five variants, from `lookupPublicBook()`:

| State | What the customer sees |
|---|---|
| unknown id | *We couldn't find this book* |
| revoked | *We couldn't find this book* — **identical on purpose**, see below |
| expired | *This book's hosting has ended* — offers renewal |
| empty | *Nothing in this book yet* |
| our fault | *Something went wrong at our end* — says their videos are safe |

Unknown and revoked are byte-identical, including the HTTP status. The response
must not confirm that a given id is real.

`expired` and `empty` carry the short reference in the WhatsApp message;
unknown and revoked carry none, because a non-existent book has none.

---

## Rules that cut across every frame

- No customer screen ever shows: the full book id, a UUID, an error code,
  "Living Memories", "WebAR", "MindAR", "target", "Supabase" or "R2".
- No customer screen shows the purchaser's name, email or phone.
- Every error and empty state offers exactly one action: WhatsApp.
- Every touch target is at least 48px and inside the safe-area insets.
- Monochrome throughout. State is shown by inversion, underline, weight or
  scale — never colour.
- Arabic is a first-class language, not a translation layer: `dir="rtl"` and an
  Arabic face, chosen from `?lang=` or `Accept-Language`.

---

## Known gaps against this storyboard

- **Arabic copy is machine-drafted** and marked `TODO-REVIEW` throughout
  `src/lib/i18n.ts`. Not shippable without a native speaker.
- **No per-page QR codes are generated yet** (Phase 6), so frame 08 is
  currently only reachable through frame 07.
- **Frames 03, 06 and 09 are the subject of Phase 4** and did not exist when
  this was written.
