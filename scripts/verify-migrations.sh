#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres container and asserts the
# security invariants from CLAUDE.md. Never touches a hosted database.
#
#   bash scripts/verify-migrations.sh
#
# Requires Docker to be running.
set -euo pipefail

NAME=bp-verify-pg
IMAGE=postgres:16-alpine
PSQL=(docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "==> starting $IMAGE"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$NAME" pg_isready -U postgres >/dev/null

echo "==> installing Supabase stubs (auth schema, roles)"
"${PSQL[@]}" <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid
  language sql stable as $fn$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $fn$;
do $$ begin
  create role anon nologin;            exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;   exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated, service_role;
SQL

echo "==> applying migrations"
for f in supabase/migrations/*.sql; do
  echo "    $f"
  "${PSQL[@]}" < "$f"
done

echo "==> asserting security invariants"
"${PSQL[@]}" <<'SQL'
do $$
declare
  bad text;
begin
  -- Rule 1: RLS enabled on every table in public.
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if bad is not null then
    raise exception 'RLS NOT ENABLED on: %', bad;
  end if;

  -- RLS additionally forced, so even the table owner is constrained.
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relforcerowsecurity;
  if bad is not null then
    raise exception 'RLS NOT FORCED on: %', bad;
  end if;

  -- Rule 1: a table with RLS and no policy is a silent deny-all; treat the
  -- absence of an explicit policy as a mistake.
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
  if bad is not null then
    raise exception 'TABLE HAS NO POLICY: %', bad;
  end if;

  -- Access model: anon must hold no policy on any table. Public reads go
  -- through server code with the service role, scoped to one book id.
  select string_agg(format('%s.%s', c.relname, p.polname), ', ') into bad
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (p.polroles = '{0}'::oid[] or 'anon'::regrole = any (p.polroles));
  if bad is not null then
    raise exception 'ANON-REACHABLE POLICY: %', bad;
  end if;

  -- Rule 3: printed identifiers must default to random UUIDs.
  select string_agg(format('%s.%s', c.relname, a.attname), ', ') into bad
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r'
    and a.attname = 'id' and a.attnum > 0 and not a.attisdropped
    and (d.oid is null
         or pg_get_expr(d.adbin, d.adrelid) not like '%gen_random_uuid%');
  if bad is not null then
    raise exception 'ID NOT A RANDOM UUID: %', bad;
  end if;

  raise notice 'all invariants hold';
end $$;
SQL

echo "==> asserting policy behaviour"
"${PSQL[@]}" < scripts/test-policies.sql

echo "==> policy inventory"
"${PSQL[@]}" -c "select tablename, policyname, roles, cmd from pg_policies where schemaname='public' order by tablename, policyname;"

echo "OK: migrations apply cleanly and all invariants hold."
