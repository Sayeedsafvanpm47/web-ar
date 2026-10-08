-- =====================================================================
-- Perceptual hash of each page's photo
-- =====================================================================
--
-- Two similar photos in one book is the quietest failure this product has.
-- MindAR matches whichever target scores highest, so a customer can hold
-- their phone over page 4 and watch page 9's video, with nothing anywhere
-- reporting an error. By the time anyone notices, the book is printed.
--
-- This stores a 64-bit difference hash of each photo so an upload can be
-- compared against the pages already in the same book, before print.
--
-- The hash is not a credential and not a secret: it is a 16-character
-- fingerprint from which the photo cannot be reconstructed. It is covered by
-- the existing memories policies like every other column, and no new table
-- means no new policies (hard rule 1 concerns tables).
-- =====================================================================

alter table public.memories add column photo_hash text
  check (photo_hash is null or photo_hash ~ '^[0-9a-f]{16}$');

comment on column public.memories.photo_hash is
  '64-bit difference hash of the printed photo, as 16 hex characters. Used to '
  'warn when two pages in the same book look alike enough that the tracker '
  'could confuse them. Null for pages uploaded before this check existed.';

-- Duplicate checks always run within one book, never across the whole table.
create index memories_book_hash_idx on public.memories (book_id, photo_hash);
