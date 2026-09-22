# Black Pearl Living Memories

Printed photo books where scanning a photo plays the customer's video.

Project rules live in [CLAUDE.md](CLAUDE.md) — read them before contributing.
Customer content is irreplaceable; data loss and leaks are the failure modes
everything here is designed against.

## Status

| Area | State |
|---|---|
| Next.js app shell | scaffolded (Next 16.3.6, React 19, TS strict, Tailwind) |
| Postgres schema + RLS | staff, customers, books, memories — verified structurally and behaviourally |
| Supabase project | **not created yet** — env placeholders only |
| Cloudflare R2 | **not set up yet** |
| /admin | not started |
| /b/[bookId] + scanner | not started; validated prototype in `reference/scanner-spike/` |

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

No hosted service exists yet, so `.env.local` values are placeholders and
anything touching Supabase or R2 will fail until a project is created. The
schema and tooling below run entirely locally.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | Production build (also typechecks) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run check:secrets` | **Run before every deploy.** Hard rule 4 gate. |
| `npm run verify:db` | Apply migrations to a throwaway Postgres and assert the security invariants. Needs Docker. |

## Access model

This is the part to understand before touching a policy.

`/b/[bookId]` is a **capability URL**: the random UUID printed in the QR code
is the only credential. Anyone holding the book — or a photograph of the page —
can open it. That is the intended product behaviour.

The consequence for the database is that **`anon` holds no RLS policy on any
table**. If it held even a SELECT policy, anyone with the public anon key could
enumerate every book and every customer's memories in a single query. Instead:

- Public reads go through server-side code using the service role key, scoped
  to the exact book id in the URL. A book is served only when it is not
  revoked **and** inside its paid hosting term — `public.book_is_live()` is the
  single definition of that. A null `expiry_date` fails closed.
- Video is served only via short-lived signed R2 URLs generated server-side.
- `books.revoked_at` is the kill switch for a leaked QR code. It cannot be
  undone by reprinting — issue a new book id.

Staff access is granted by membership in `public.staff`, checked by
`public.is_staff()`. That table currently holds a single shared account;
adding per-person rows later needs no policy changes.

## The scanner

`reference/scanner-spike/` holds a working MindAR image tracker, validated
on-device against a real three-target `.mind` file. It is reference material,
not dead code — MindAR is niche, its own examples are pinned to an older
A-Frame than its docs recommend, and several failure modes are non-obvious.
CLAUDE.md records the pinned versions and the specific traps. Do not rebuild
the scanner from memory.

## Migrations

Files in `supabase/migrations/`, applied in filename order. Per hard rule 1,
a migration that creates a table must enable RLS and define its policies in
the same file.

`npm run verify:db` spins up a disposable Postgres, installs a minimal stub of
Supabase's `auth` schema and roles, applies every migration, and then asserts:

- RLS enabled on every table in `public`
- RLS also *forced*, so the table owner is constrained too
- no table left with RLS on and zero policies (a silent deny-all)
- no policy reachable by `anon`
- every `id` column defaults to `gen_random_uuid()` (hard rule 3)

It then runs `scripts/test-policies.sql`, which connects as `anon`, as a
signed-in non-staff user, and as staff, and asserts what each can actually
read and write. Structural checks cannot see a policy whose *logic* is wrong;
this catches those.

Never run migrations against production (hard rule 5).
