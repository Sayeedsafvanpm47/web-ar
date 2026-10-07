-- =====================================================================
-- Short, human-quotable book reference
-- =====================================================================
--
-- Customers need something they can read aloud or type into WhatsApp when
-- they contact support. The book id cannot serve that purpose twice over:
-- it is a 36-character UUID, and it is the access credential, so it must
-- never be pasted into a support conversation.
--
-- This adds a second identifier with the opposite properties:
--
--   books.id         secret, unguessable, printed in the QR code
--   books.reference  not secret, short, quotable, printed inside the cover
--
-- The reference grants nothing. Knowing BP-7K4MXQ does not let anyone open
-- a book; it only lets staff find the right row.
--
-- Format: BP- followed by 6 characters from a 32-symbol alphabet with the
-- ambiguous glyphs removed (no 0/O, no 1/I), because these get read over a
-- phone line and copied by hand. That is 32^6 ≈ 1.07 billion combinations.
--
-- No new table, so no new policies: the existing books policies already
-- cover every column (hard rule 1 is about tables, and this adds none).
-- =====================================================================

-- Unambiguous alphabet. Deliberately excludes 0, O, 1, I.
create or replace function public.generate_book_reference()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $fn$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
  i int;
begin
  -- Retry on collision rather than trusting a single draw. At a few thousand
  -- books a birthday collision is unlikely but not negligible, and a failed
  -- insert on a customer's order is not an acceptable way to find out.
  for attempt in 1..20 loop
    candidate := 'BP-';
    for i in 1..6 loop
      candidate := candidate ||
        substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    if not exists (select 1 from public.books b where b.reference = candidate) then
      return candidate;
    end if;
  end loop;

  raise exception 'Could not generate a unique book reference after 20 attempts';
end;
$fn$;

comment on function public.generate_book_reference() is
  'Short quotable book reference, BP- plus 6 unambiguous characters. Not a '
  'credential — it grants nothing and is safe to put in a support message.';


alter table public.books add column reference text;

comment on column public.books.reference is
  'Short human-quotable reference, e.g. BP-7K4MXQ. Safe to share: unlike '
  'books.id it grants no access. Printed inside the cover and used in '
  'customer support messages.';


-- Backfill any book that already exists, one row at a time so each draw is
-- checked against the rows written just before it.
do $backfill$
declare
  r record;
begin
  for r in select id from public.books where reference is null loop
    update public.books
       set reference = public.generate_book_reference()
     where id = r.id;
  end loop;
end;
$backfill$;


alter table public.books alter column reference set not null;
alter table public.books add constraint books_reference_key unique (reference);

-- Case-insensitive lookup: staff will type what the customer read out, and
-- nobody holds the shift key consistently.
create index books_reference_lower_idx on public.books (lower(reference));


-- Assigned by the database rather than the application, so a book cannot be
-- created without one and two code paths cannot disagree about the format.
create or replace function public.set_book_reference()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.reference is null then
    new.reference := public.generate_book_reference();
  end if;
  return new;
end;
$fn$;

create trigger books_set_reference
  before insert on public.books
  for each row execute function public.set_book_reference();
