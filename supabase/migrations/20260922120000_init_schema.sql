-- =====================================================================
-- Black Pearl Living Memories — initial schema
-- =====================================================================
--
-- Tables: staff, customers, books, memories.
--
-- Per hard rule 1, every table below turns RLS on in this same file and
-- declares its policies here. Each policy carries a plain-English comment
-- saying who it lets in and why.
--
-- ---------------------------------------------------------------------
-- THE ACCESS MODEL — read this before adding any policy
-- ---------------------------------------------------------------------
--
-- There are deliberately NO policies for the `anon` role anywhere in this
-- file. That is not an omission.
--
-- /b/[bookId] is a capability URL: the random UUID printed in the QR code is
-- the only credential. The `anon` key ships inside the browser bundle, so it
-- is public knowledge. If `anon` held even a SELECT policy on books, anyone
-- could run `select * from memories` and walk away with every customer's
-- funeral and wedding video in one query. A capability model only works if
-- possessing one book id gets you one book.
--
-- So: the database denies `anon` everything, and public page loads go through
-- server-side code holding the service role key, which looks up exactly the
-- one book id in the URL. A bug in application code can then leak one book.
-- It cannot leak the table.
--
-- Staff reach everything, but only through membership in public.staff.
--
-- ---------------------------------------------------------------------
-- WHEN IS A BOOK PUBLICLY VIEWABLE?
-- ---------------------------------------------------------------------
--
-- Three conditions, all required:
--   1. the book exists (correct id)
--   2. revoked_at is null          -- not killed after a QR code leaked
--   3. expiry_date >= today        -- hosting term still running
--
-- A null expiry_date fails CLOSED: a book with no term set is not viewable.
-- That is deliberate. Failing open would mean a half-created book is public.
-- =====================================================================


-- =====================================================================
-- staff — who may use /admin
-- =====================================================================
-- Customers never log in; they scan a QR code. The only accounts in this
-- system belong to staff. This table is the allowlist: having a Supabase
-- Auth login is not enough, you must also have a row here.

create table public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  label      text not null,
  created_at timestamptz not null default now()
);

comment on table public.staff is
  'Allowlist of accounts permitted to use /admin. Rows are provisioned out of '
  'band with the service role. Currently holds one shared account; adding '
  'per-person rows later requires no policy changes.';

alter table public.staff enable row level security;
alter table public.staff force row level security;

-- POLICY (staff): A signed-in staff member may read their own row, and only
-- their own. This is what lets the app answer "am I staff?" It deliberately
-- does not let one staff member list the others.
create policy "staff read own row"
  on public.staff for select
  to authenticated
  using (user_id = (select auth.uid()));

-- NO INSERT / UPDATE / DELETE POLICY — on purpose.
-- Nobody can grant themselves admin access, or quietly remove a colleague,
-- through the application. Changing who is staff is an operator action taken
-- with the service role, outside the app.


-- Answers "is the current login a staff member?" and is used by every policy
-- below. SECURITY DEFINER so it can read public.staff past that table's own
-- RLS; otherwise the check would be blocked by the very policy above.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.staff s where s.user_id = (select auth.uid())
  );
$fn$;

revoke execute on function public.is_staff() from public;
revoke execute on function public.is_staff() from anon;
grant  execute on function public.is_staff() to authenticated;


-- Keeps updated_at honest without the application having to remember.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;


-- =====================================================================
-- customers — the people who bought a book
-- =====================================================================
-- Contact details only. Customers have no login and no auth.users row; they
-- reach their book by scanning its QR code. This table exists so staff know
-- whose book it is, and who to contact when a hosting term is expiring.
--
-- Everything here is personal data: a name, an email, sometimes a phone
-- number, attached to a funeral or a wedding. Staff-only, always.

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (length(btrim(full_name)) > 0),
  email       text,
  phone       text,
  notes       text,
  created_by  uuid references public.staff (user_id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.customers is
  'Purchaser contact records. Personal data — staff access only, never anon.';

create index customers_name_idx  on public.customers (lower(full_name));
create index customers_email_idx on public.customers (lower(email));

alter table public.customers enable row level security;
alter table public.customers force row level security;

-- POLICY (customers): Staff may read every customer record. Staff run the
-- business and need to find a customer by name or email.
create policy "staff read customers"
  on public.customers for select
  to authenticated
  using (public.is_staff());

-- POLICY (customers): Staff may add a customer. is_staff() is re-checked
-- against the incoming row, so a non-staff login cannot insert one.
create policy "staff insert customers"
  on public.customers for insert
  to authenticated
  with check (public.is_staff());

-- POLICY (customers): Staff may correct a customer's details. Checked both on
-- the existing row (USING) and on the edited row (WITH CHECK), so an update
-- cannot be used to slip a row past the rule.
create policy "staff update customers"
  on public.customers for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- POLICY (customers): Staff may delete a customer. Note the consequence:
-- books.customer_id is ON DELETE RESTRICT below, so this fails while the
-- customer still has books. Deleting a customer must be a deliberate act,
-- not something that silently takes their memories with it.
create policy "staff delete customers"
  on public.customers for delete
  to authenticated
  using (public.is_staff());

create trigger customers_touch_updated_at
  before update on public.customers
  for each row execute function public.touch_updated_at();


-- =====================================================================
-- books — one printed photo book
-- =====================================================================

create table public.books (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers (id) on delete restrict,
  title            text not null check (length(btrim(title)) > 0),

  status           text not null default 'draft'
                     check (status in ('draft', 'ready', 'printing', 'delivered')),

  -- Hosting term. Access is allowed through the end of this day, inclusive.
  -- Null means no term has been set, and access is DENIED (fails closed).
  expiry_date      date,

  -- Kill switch for a QR code that has leaked. Set this and the book stops
  -- resolving immediately. It cannot be undone by reprinting the same code —
  -- the id is the credential, so a leaked book needs a new id.
  revoked_at       timestamptz,
  revoked_reason   text,

  -- Compiled MindAR target file for this book, in private storage.
  mind_object_key  text,
  mind_compiled_at timestamptz,

  created_by       uuid references public.staff (user_id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.books.id is
  'Random v4 UUID, printed in the QR code (hard rule 3). This value IS the '
  'access credential for /b/[bookId] — treat it as a secret in logs, error '
  'reports and analytics.';
comment on column public.books.expiry_date is
  'Last day of the paid hosting term, inclusive. Null denies access.';

create index books_customer_idx on public.books (customer_id);
create index books_status_idx   on public.books (status);
create index books_expiry_idx   on public.books (expiry_date);

alter table public.books enable row level security;
alter table public.books force row level security;

-- POLICY (books): Staff may read every book, including drafts, revoked books
-- and expired ones — they need to see exactly those in order to manage them.
-- Expiry and revocation gate the PUBLIC path, not the staff path.
create policy "staff read books"
  on public.books for select
  to authenticated
  using (public.is_staff());

-- POLICY (books): Staff may create a book.
create policy "staff insert books"
  on public.books for insert
  to authenticated
  with check (public.is_staff());

-- POLICY (books): Staff may edit a book — including setting expiry_date to
-- renew a hosting term, or setting revoked_at to kill a leaked QR code.
create policy "staff update books"
  on public.books for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- POLICY (books): Staff may delete a book. This cascades to its memories
-- rows, so storage objects must be cleaned up separately — deleting the row
-- does not delete the customer's video from R2.
create policy "staff delete books"
  on public.books for delete
  to authenticated
  using (public.is_staff());

create trigger books_touch_updated_at
  before update on public.books
  for each row execute function public.touch_updated_at();


-- The three public-access conditions in one place, so the admin side and the
-- public side can never drift apart on what "live" means.
create or replace function public.book_is_live(
  p_revoked_at  timestamptz,
  p_expiry_date date
)
returns boolean
language sql
immutable
as $fn$
  select p_revoked_at is null
     and p_expiry_date is not null
     and p_expiry_date >= current_date;
$fn$;

comment on function public.book_is_live(timestamptz, date) is
  'True when a book may be served publicly: not revoked, and inside its paid '
  'hosting term. Null expiry fails closed.';


-- =====================================================================
-- memories — one photo/video pair on one page
-- =====================================================================

create table public.memories (
  id               uuid primary key default gen_random_uuid(),
  book_id          uuid not null references public.books (id) on delete cascade,

  -- Position in the compiled .mind file. A .mind stores no names, only order,
  -- so this binding is load-bearing: a wrong index plays the wrong family's
  -- video, and nothing anywhere raises an error.
  target_index     int not null check (target_index >= 0),
  page_label       text,

  -- Keys into private storage. Never a public URL (hard rule 2).
  photo_object_key text,
  video_object_key text,

  -- Height / width of the PRINTED photo. Drives the MindAR plane, which uses
  -- the image's ratio, not the video's. See CLAUDE.md, anchor geometry.
  photo_aspect     numeric(10, 6) check (photo_aspect > 0),

  video_duration_seconds numeric(10, 3) check (video_duration_seconds > 0),

  -- Trackability, read out of the compiled .mind at upload time.
  feature_points_total    int check (feature_points_total >= 0),
  feature_points_coarsest int check (feature_points_coarsest >= 0),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (book_id, target_index)
);

comment on column public.memories.feature_points_coarsest is
  'Feature points surviving to the coarsest scale in the .mind file. Predicts '
  'whether the photo tracks from a distance, not just close up.';

create index memories_book_idx on public.memories (book_id, target_index);

alter table public.memories enable row level security;
alter table public.memories force row level security;

-- POLICY (memories): Staff may read every memory row. Note this exposes only
-- storage KEYS, not the media itself — the buckets are private and the files
-- are reachable only through short-lived signed URLs minted server-side.
create policy "staff read memories"
  on public.memories for select
  to authenticated
  using (public.is_staff());

-- POLICY (memories): Staff may attach a memory to a book.
create policy "staff insert memories"
  on public.memories for insert
  to authenticated
  with check (public.is_staff());

-- POLICY (memories): Staff may edit a memory — re-ordering target_index,
-- correcting an aspect ratio, or replacing an uploaded file.
create policy "staff update memories"
  on public.memories for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- POLICY (memories): Staff may delete a memory row. As with books, this does
-- NOT delete the underlying photo or video from storage.
create policy "staff delete memories"
  on public.memories for delete
  to authenticated
  using (public.is_staff());

create trigger memories_touch_updated_at
  before update on public.memories
  for each row execute function public.touch_updated_at();
