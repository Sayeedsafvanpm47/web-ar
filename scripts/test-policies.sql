-- Behavioural proof that the policies do what their comments claim.
-- Run by scripts/verify-migrations.sh against a throwaway container.
--
-- This deliberately grants anon and authenticated the same table-level
-- privileges Supabase grants them by default. Without that, a "permission
-- denied" would come from missing GRANTs rather than from RLS, and the test
-- would prove nothing about the policies.

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated;

-- ---------------------------------------------------------------- seed ----
-- As superuser, so RLS is bypassed while we set the scene.

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),  -- will be staff
  ('22222222-2222-4222-8222-222222222222');  -- signed in, but NOT staff

insert into public.staff (user_id, label)
  values ('11111111-1111-4111-8111-111111111111', 'shared staff account');

insert into public.customers (id, full_name, email)
  values ('33333333-3333-4333-8333-333333333333', 'Test Customer', 'a@b.test');

insert into public.books (id, customer_id, title, expiry_date)
  values ('44444444-4444-4444-8444-444444444444',
          '33333333-3333-4333-8333-333333333333',
          'Wedding 2026', current_date + 365);

insert into public.memories (book_id, target_index, page_label)
  values ('44444444-4444-4444-8444-444444444444', 0, 'page 1');

-- ------------------------------------------------------------- the tests --

do $test$
declare
  n   int;
  ok  boolean;
begin
  -- === anon sees nothing, anywhere ===================================
  -- This is the single most important assertion in the project. The anon
  -- key is public; if any of these returns a row, every customer's media
  -- is enumerable by anyone.
  set local role anon;

  select count(*) into n from public.books;
  if n <> 0 then raise exception 'FAIL: anon read % book(s)', n; end if;

  select count(*) into n from public.customers;
  if n <> 0 then raise exception 'FAIL: anon read % customer(s)', n; end if;

  select count(*) into n from public.memories;
  if n <> 0 then raise exception 'FAIL: anon read % memory row(s)', n; end if;

  select count(*) into n from public.staff;
  if n <> 0 then raise exception 'FAIL: anon read % staff row(s)', n; end if;

  -- anon must not be able to write either
  begin
    insert into public.customers (full_name) values ('injected by anon');
    raise exception 'FAIL: anon inserted a customer';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  reset role;

  -- === a signed-in NON-staff user sees nothing =======================
  -- Having a Supabase Auth login is not authorisation. Only membership in
  -- public.staff is.
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select count(*) into n from public.books;
  if n <> 0 then raise exception 'FAIL: non-staff login read % book(s)', n; end if;

  select count(*) into n from public.customers;
  if n <> 0 then raise exception 'FAIL: non-staff login read % customer(s)', n; end if;

  begin
    insert into public.staff (user_id, label)
      values ('22222222-2222-4222-8222-222222222222', 'self-promoted');
    raise exception 'FAIL: a non-staff user granted themselves staff access';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  reset role;

  -- === a staff user sees everything ==================================
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select count(*) into n from public.books;
  if n <> 1 then raise exception 'FAIL: staff read % book(s), expected 1', n; end if;

  select count(*) into n from public.customers;
  if n <> 1 then raise exception 'FAIL: staff read % customer(s), expected 1', n; end if;

  select count(*) into n from public.memories;
  if n <> 1 then raise exception 'FAIL: staff read % memory row(s), expected 1', n; end if;

  -- staff sees only their own staff row, not colleagues'
  select count(*) into n from public.staff;
  if n <> 1 then raise exception 'FAIL: staff read % staff row(s), expected 1', n; end if;

  reset role;

  -- === deleting a customer who still has books is blocked ============
  -- ON DELETE RESTRICT. A customer record cannot be removed in a way that
  -- silently takes a book's memories with it.
  begin
    delete from public.customers
      where id = '33333333-3333-4333-8333-333333333333';
    raise exception 'FAIL: deleted a customer who still has books';
  exception
    when foreign_key_violation then null;  -- expected
  end;

  -- === book_is_live() truth table ====================================
  select public.book_is_live(null, current_date + 30) into ok;
  if not ok then raise exception 'FAIL: live book reported not live'; end if;

  select public.book_is_live(now(), current_date + 30) into ok;
  if ok then raise exception 'FAIL: revoked book reported live'; end if;

  select public.book_is_live(null, current_date - 1) into ok;
  if ok then raise exception 'FAIL: expired book reported live'; end if;

  select public.book_is_live(null, current_date) into ok;
  if not ok then raise exception 'FAIL: book expiring today should be live'; end if;

  -- null expiry must fail CLOSED
  select public.book_is_live(null, null) into ok;
  if ok then raise exception 'FAIL: book with no expiry date reported live'; end if;

  raise notice 'policy behaviour: all assertions passed';
end
$test$;
