-- Black Pearl Living Memories — initial schema.
--
-- Every table below enables RLS in this same migration, per hard rule 1.
--
-- ACCESS MODEL — read this before adding any policy.
--
-- There are deliberately NO policies granting the `anon` role access to any
-- table. That is not an oversight. /b/[bookId] is a capability URL: the book
-- UUID printed in the QR code is the only credential. If `anon` held even a
-- SELECT policy on books, anyone with the public anon key could enumerate
-- every book and every customer's memories in one query — the exact leak this
-- product cannot survive.
--
-- Instead, all public reads go through server-side code holding the service
-- role key, which looks up exactly the one book id in the URL and mints
-- short-lived signed R2 URLs. RLS stays default-deny for anon, so a mistake in
-- application code cannot turn into a bulk disclosure.
--
-- Staff access is granted through membership in public.staff, checked by
-- public.is_staff(). Today that table holds a single shared account; adding
-- per-person rows later requires no policy changes.

-- ---------------------------------------------------------------- staff ----

create table public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  label      text not null,
  created_at timestamptz not null default now()
);

comment on table public.staff is
  'Allowlist of accounts permitted to use /admin. Rows are provisioned out of '
  'band with the service role; there is no self-service path into this table.';

alter table public.staff enable row level security;
alter table public.staff force row level security;

create policy "staff read own row"
  on public.staff for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Intentionally no insert/update/delete policy: staff cannot grant or revoke
-- staff access. That is an operator action performed with the service role.

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.staff s where s.user_id = (select auth.uid())
  );
$$;

comment on function public.is_staff() is
  'True when the current JWT belongs to a provisioned staff account. '
  'SECURITY DEFINER so it can read public.staff past that table''s own RLS.';

revoke execute on function public.is_staff() from public;
revoke execute on function public.is_staff() from anon;
grant  execute on function public.is_staff() to authenticated;

-- ------------------------------------------------------------ updated_at ----

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- books ----

create table public.books (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(btrim(title)) > 0),
  customer_name    text,
  customer_email   text,
  status           text not null default 'draft'
                     check (status in ('draft', 'ready', 'printing', 'delivered')),

  -- Kill switch for a leaked QR code. Checked by every server read path.
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
  'Random v4 UUID, printed in the QR code. Never sequential or guessable '
  '(hard rule 3). This value IS the access credential for /b/[bookId].';
comment on column public.books.revoked_at is
  'Set to disable a book whose QR code has leaked. Cannot be undone by '
  'reprinting — issue a new book id instead.';

create index books_status_idx  on public.books (status);
create index books_created_idx on public.books (created_at desc);

alter table public.books enable row level security;
alter table public.books force row level security;

create policy "staff read books"
  on public.books for select to authenticated
  using (public.is_staff());

create policy "staff insert books"
  on public.books for insert to authenticated
  with check (public.is_staff());

create policy "staff update books"
  on public.books for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "staff delete books"
  on public.books for delete to authenticated
  using (public.is_staff());

create trigger books_touch_updated_at
  before update on public.books
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------- memories ----

create table public.memories (
  id               uuid primary key default gen_random_uuid(),
  book_id          uuid not null references public.books (id) on delete cascade,

  -- Position in the compiled .mind file. A .mind stores no names, only order,
  -- so this binding is load-bearing: wrong index plays the wrong family's
  -- video with no error anywhere.
  target_index     int not null check (target_index >= 0),
  page_label       text,

  -- Private object keys. Never a public URL (hard rule 2).
  photo_object_key text,
  video_object_key text,

  -- Height / width of the PRINTED photo. Drives the MindAR plane, which uses
  -- the image's ratio, not the video's. See CLAUDE.md, anchor geometry.
  photo_aspect     numeric(10, 6) check (photo_aspect > 0),

  video_duration_seconds numeric(10, 3) check (video_duration_seconds > 0),

  -- Trackability, extracted from the compiled .mind at upload time.
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

create policy "staff read memories"
  on public.memories for select to authenticated
  using (public.is_staff());

create policy "staff insert memories"
  on public.memories for insert to authenticated
  with check (public.is_staff());

create policy "staff update memories"
  on public.memories for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "staff delete memories"
  on public.memories for delete to authenticated
  using (public.is_staff());

create trigger memories_touch_updated_at
  before update on public.memories
  for each row execute function public.touch_updated_at();
