-- ════════════════════════════════════════════════════════════════════════
-- tests/sql/pglite-fixture.sql — the Supabase-shaped scaffolding that the
-- server-authority migrations expect to already exist.
--
-- USED BY: tests/conservation-fuzz.mjs, which boots an in-process PostgreSQL
-- (PGlite / WASM) and then applies the FOUR REAL MIGRATION FILES verbatim on
-- top of this. Nothing in this file may re-implement, stub or "simplify" any
-- object the migrations create — if it did, the fuzz would be testing the
-- fixture instead of the server, which is the always-null-probe failure this
-- whole harness exists to avoid.
--
-- WHAT IS LEGITIMATELY STUBBED HERE, and why each stub is faithful enough:
--
--   auth.users        Supabase's identity table. The migrations only ever use
--                     it as an FK target (`references auth.users(id)`), so a
--                     one-column table is behaviourally identical.
--   auth.uid()        Supabase reads the `sub` claim off the request JWT via a
--                     GUC. Same here — `request.jwt.claim.sub` — so "who is
--                     calling" is settable per operation, which is exactly what
--                     a fuzz over M characters needs.
--   public.profiles   Only `id` and `display_name` are read (hr_display_name_of).
--   cron.*            pg_cron is a HARD precondition of both foundation files
--                     and is not available in WASM. The shim is a real table
--                     plus schedule/unschedule with pg_cron's semantics that
--                     the migrations actually depend on: schedule() upserts by
--                     jobname, unschedule() RAISES on a missing name (that raise
--                     is the entire reason hr_cron_drop exists), and cron.job
--                     carries jobname + command so market-v2 §0c's ordering
--                     assertion — which greps cron.job.command for a bare
--                     `delete from market_listings` — is a live check here and
--                     not a no-op.
--                     NOTE: the shim does NOT run jobs. The fuzz calls
--                     market_expire() directly instead of waiting for a
--                     scheduler, which is what a deterministic seeded harness
--                     has to do anyway.
--   roles             anon/authenticated/service_role/authenticator are created
--                     by Supabase at project setup; the migrations REVOKE from
--                     them by name and fail hard if they do not exist.
--
-- Everything else — every table, every function, every constraint, every
-- clamp — comes from the migrations themselves.
-- ════════════════════════════════════════════════════════════════════════

-- ── Roles ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator nologin; end if;
  execute 'grant usage on schema public to anon, authenticated, service_role';
end $$;

-- ── auth ─────────────────────────────────────────────────────────────────
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text
);

-- Supabase's auth.uid() is exactly this: the `sub` claim off the request JWT,
-- surfaced as a GUC. `true` = missing_ok, so an unauthenticated call is NULL
-- rather than an error — which is the branch every RPC's `not_signed_in` guard
-- is written against.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- ONE PROBE IDENTITY, and it is not padding. 2026-08-11-apply-engine.sql §6(g)
-- proves the C5 daily budget BEHAVIOURALLY — it stands up a real player_state
-- row, drives the real hr_apply over its ceiling and rolls the whole thing back
-- — and player_state.user_id is an FK to auth.users. With no user in the table
-- the probe SKIPS, which would mean the conservation fuzz applied the migration
-- with its strongest assertion silently switched off. That is the "always-null
-- probe" failure this harness exists to hunt, so the row is seeded here.
--
-- It is deliberately OUTSIDE the fuzz's own uuid space (the fuzz builds
-- `000000NN-0000-4000-a000-…`), it gets no profile, no player_state and no
-- character, and the probe rolls back, so it never appears in any conservation
-- aggregate.
insert into auth.users (id) values ('00000000-0000-4000-b000-c5c5c5c5c5c5')
  on conflict (id) do nothing;

-- ── public.profiles ──────────────────────────────────────────────────────
-- The real table has more columns; the migrations read `id` and
-- `display_name` and nothing else (hr_display_name_of, market_v2 §4).
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text
);

-- ── pg_cron shim ─────────────────────────────────────────────────────────
create schema if not exists cron;

create table if not exists cron.job (
  jobid    bigserial primary key,
  jobname  text unique,
  schedule text not null,
  command  text not null,
  active   boolean not null default true
);

-- pg_cron >= 1.4 semantics: schedule(name, schedule, command) UPSERTS by name.
-- Both foundation files rely on that (`hr_cron_ensure` is documented as
-- idempotent precisely because of it).
create or replace function cron.schedule(p_name text, p_schedule text, p_command text)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into cron.job (jobname, schedule, command)
       values (p_name, p_schedule, p_command)
  on conflict (jobname) do update
       set schedule = excluded.schedule, command = excluded.command
  returning jobid into v_id;
  return v_id;
end $$;

-- …and unschedule() RAISES on a name that is not scheduled. That behaviour is
-- load-bearing: it is the stated reason hr_cron_drop exists and checks first.
-- A shim that returned false instead would make hr_cron_drop's guard untested.
create or replace function cron.unschedule(p_name text)
returns boolean language plpgsql as $$
declare v_n int;
begin
  delete from cron.job where jobname = p_name;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'could not find valid entry for job "%"', p_name;
  end if;
  return true;
end $$;

-- ── The pre-market-v2 world ──────────────────────────────────────────────
-- market-v2 §0c asserts an ORDERING property by looking for a live cron job
-- whose command deletes straight out of market_listings. On a database that
-- has never had one, that assertion is vacuous — and a vacuous assertion is
-- the exact defect class this harness is built to hunt. So the fixture
-- recreates the production state the migration was written against: the v1
-- market table plus the two broken nightly jobs, armed. If anyone ever moves
-- §0c below §1, the fuzz will not even boot.
create table if not exists public.market_listings (
  id             uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  seller_slot    int  not null default 0,
  seller_name    text,
  item_id        text not null,
  qty            bigint not null,
  ask_each       bigint not null,
  created_at     timestamptz not null default now()
);
create table if not exists public.market_sales (
  id             bigserial primary key,
  listing_id     uuid,
  seller_user_id uuid,
  buyer_user_id  uuid,
  item_id        text,
  qty            bigint,
  created_at     timestamptz not null default now()
);

select cron.schedule('trim-expired-listings', '30 3 * * *',
                     'delete from public.market_listings where expires_at < now()');
select cron.schedule('trim-market-sales', '40 3 * * *',
                     'delete from public.market_sales where sold_at < now() - interval ''180 days''');
