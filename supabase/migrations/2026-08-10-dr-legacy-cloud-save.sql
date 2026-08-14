-- ============================================================================
-- 2026-08-10-dr-legacy-cloud-save.sql  —  RUNS BEFORE supabase/schema.sql
--
-- RECONSTRUCTION, NOT A CHANGE. The oldest tables in this project —
-- `game_saves`, `game_events`, `chat_blocks` — plus the `ensure_rls` event
-- trigger were created by hand from `src/net/SUPABASE_SETUP.md` long before
-- supabase/schema.sql existed, and NO file in supabase/ reproduces them.
--
-- ── THE FINDING THAT MAKES THIS THE MOST IMPORTANT OF THE THREE DR FILES ────
-- schema.sql's own header says it: "game_saves / game_events are assumed to
-- exist already (cloud save has been live since b14x) — included here as IF
-- NOT EXISTS so a fresh project bootstraps completely from this one file."
-- The intent was right. The definitions are WRONG, and they have never been
-- compared against the live tables. Measured against production 2026-08-14:
--
--   game_saves    production                     schema.sql's fallback
--   ─────────────────────────────────────────────────────────────────────────
--   primary key   (id)  bigserial                (user_id, slot)
--   unique        (user_id, slot)                — none —
--   slot          smallint, check 0..4           int, default 0, unchecked
--
--   game_events   production                     schema.sql's fallback
--   ─────────────────────────────────────────────────────────────────────────
--   event column  event_type                     kind
--   time column   occurred_at                    created_at
--   user_id       not null                       nullable
--
-- So a rebuild from this repo did not merely lose these tables — it produced
-- DIFFERENT tables under the same names, with a different primary key and
-- different column names, and reported success. `game_saves` currently holds
-- the ONLY copy of every beta player's progress; restoring a dump into that
-- schema would fail on the column names, and if it did not, it would land on
-- the wrong key.
--
-- Worse, this is invisible to a name-level schema diff: production and the
-- rebuild agree on `game_events_pkey`, `game_events_user_id_fkey` and even
-- `game_events_retention_idx`, because a constraint keeps its name when the
-- column under it changes. That is why tests/schema-replay.mjs's inventory
-- carries a `columns` category — added 2026-08-14 precisely because the
-- first version of it reported these two tables as identical.
--
-- ── WHY THIS FILE RUNS BEFORE schema.sql ────────────────────────────────────
-- schema.sql creates its (wrong) fallback with `create table if not exists`.
-- On production that is a no-op, which is exactly what its author intended.
-- Running this file FIRST restores that intent on a rebuild too: the true
-- shapes are in place, and schema.sql's fallback no-ops there as well. The
-- alternative — ALTERing the wrong table into the right one afterwards — would
-- need a column rename on a table holding live saves, and a rename is the one
-- migration shape that cannot be rolled forward past a failure. Ordering is
-- reversible; `alter table ... rename column` on live data is not.
-- tests/schema-apply-order.json's "pre_schema" array is what places it.
--
-- ── APPLY SAFETY ────────────────────────────────────────────────────────────
-- Every branch is guarded on `to_regclass(...) is null`, so on any database
-- that already has the object this file provably does nothing. It is a no-op
-- on production by construction, not by a chain of `if not exists` clauses
-- that each have to be right.
--
-- ROLLBACK: no-op on production. On a fresh rebuild:
--   drop event trigger if exists ensure_rls;
--   drop function if exists public.rls_auto_enable();
--   drop table if exists public.chat_blocks cascade;
--   -- game_saves / game_events hold player data; do not drop them casually.
--
-- ── RECOMMENDATIONS, RECORDED SO THEY ARE NOT LOST ──────────────────────────
-- · `chat_blocks` is DEAD: 0 rows in production, and the only reference to it
--   anywhere in the tree is the setup doc that created it. It is reconstructed
--   here so the repo tells the truth about production, not because it should
--   survive. Drop it at cutover.
-- · `game_saves` / `game_events` are the client-authored save blob and the
--   telemetry firehose. Both are superseded by the server-authoritative
--   player_state family and both should be dropped at cutover — but NOT
--   before, because until then game_saves is the only copy of every player's
--   progression. See the note on game_events volume below.
-- ============================================================================

-- ── 0. profiles ─────────────────────────────────────────────────────────────
-- `profiles` is the fourth setup-doc table. schema.sql has a `create table if
-- not exists` fallback for it plus three `add column if not exists` repairs —
-- and that repair list OMITS `updated_at`, which production has (NOT NULL,
-- default now()). So a rebuild produced a profiles table one column short.
--
-- ⚠ WORTH MORE THAN THE COLUMN: the reason nobody noticed is that
-- tests/sql/pglite-fixture.sql STUBS public.profiles, so schema.sql's fallback
-- no-ops in every existing harness and the real definition has never been
-- exercised by anything. The base shape of a live table is currently owned by a
-- TEST FIXTURE. That is the same class of defect as scaffolding bug_reports in
-- tests/pglite-chain.mjs — a fixture standing in for a migration — and it is
-- reported rather than silently patched here, because the fixture is shared by
-- conservation-fuzz.mjs and pglite-chain.mjs and unpicking it is their owners'
-- call. The `create` branch below makes a real rebuild correct regardless.
do $$
begin
  if to_regclass('public.profiles') is null then
    create table public.profiles (
      id           uuid primary key references auth.users(id) on delete cascade,
      display_name text,
      created_at   timestamptz not null default now(),
      updated_at   timestamptz not null default now()
    );
    alter table public.profiles enable row level security;
  else
    -- Additive and idempotent: a no-op on production, and the one-column repair
    -- on any database built from schema.sql's incomplete fallback.
    alter table public.profiles add column if not exists updated_at timestamptz not null default now();
  end if;
end $$;

-- ── 1. game_saves — the live cloud save ─────────────────────────────────────
do $$
begin
  if to_regclass('public.game_saves') is not null then
    raise notice 'dr-legacy-cloud-save: public.game_saves already exists — no-op';
  else
    raise notice 'dr-legacy-cloud-save: reconstructing public.game_saves from the 2026-08-14 production shape';
    create table public.game_saves (
      id          bigserial   primary key,
      user_id     uuid        not null references auth.users(id) on delete cascade,
      slot        smallint    not null,
      snapshot    jsonb       not null,
      total_level int         generated always as ((snapshot->>'totalLevel')::int) stored,
      saved_at    timestamptz not null default now(),
      constraint game_saves_slot_check     check (slot >= 0 and slot <= 4),
      constraint game_saves_user_id_slot_key unique (user_id, slot)
    );
    alter table public.game_saves enable row level security;
    -- The four per-verb policies from src/net/SUPABASE_SETUP.md. schema.sql
    -- adds a fifth, "own saves" (FOR ALL), which is why production carries
    -- five. Policies are OR-ed, so the four are redundant with the fifth —
    -- reconstructed anyway, because the job of this file is to reproduce
    -- production, and pruning redundant policies is a separate decision that
    -- deserves its own file and its own rollback.
    create policy "saves owner read"   on public.game_saves for select using (auth.uid() = user_id);
    create policy "saves owner upsert" on public.game_saves for insert with check (auth.uid() = user_id);
    create policy "saves owner update" on public.game_saves for update using (auth.uid() = user_id);
    create policy "saves owner delete" on public.game_saves for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ── 2. game_events — the telemetry firehose ─────────────────────────────────
-- CAPACITY NOTE, because this table has already been an incident: it reached
-- 1,598,269 rows / 229 MB from 6 players in 4 days (~57 MB/day, 94% of a
-- 244 MB database) by logging one row per kill and per gather, and had to be
-- truncated. Retention now lives in 2026-08-11-telemetry-retention.sql, which
-- also adds game_events_retention_idx. As of 2026-08-14 it is 5,113 rows /
-- 1096 kB in a 20 MB database — healthy. The retention policy, not this file,
-- is what keeps it that way; do not add a writer to this table without one.
do $$
begin
  if to_regclass('public.game_events') is not null then
    raise notice 'dr-legacy-cloud-save: public.game_events already exists — no-op';
  else
    raise notice 'dr-legacy-cloud-save: reconstructing public.game_events from the 2026-08-14 production shape';
    create table public.game_events (
      id          bigserial   primary key,
      user_id     uuid        not null references auth.users(id) on delete cascade,
      event_type  text        not null,
      payload     jsonb,
      occurred_at timestamptz not null default now()
    );
    alter table public.game_events enable row level security;
    create policy "events owner write" on public.game_events
      for insert with check (auth.uid() = user_id);
    create index game_events_user_id_occurred_at_idx
      on public.game_events (user_id, occurred_at desc);
  end if;
end $$;

-- ── 3. chat_blocks — dead, reconstructed for truth (see the header) ─────────
do $$
begin
  if to_regclass('public.chat_blocks') is not null then
    raise notice 'dr-legacy-cloud-save: public.chat_blocks already exists — no-op';
  else
    create table public.chat_blocks (
      blocker_id uuid not null references auth.users(id) on delete cascade,
      blocked_id uuid not null references auth.users(id) on delete cascade,
      created_at timestamptz default now(),
      primary key (blocker_id, blocked_id)
    );
    alter table public.chat_blocks enable row level security;
    create policy "blocks own" on public.chat_blocks
      for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
  end if;
end $$;

-- ── 4. ensure_rls — the RLS safety net ──────────────────────────────────────
-- A DDL event trigger that enables row level security on every table created
-- in `public`. Owned by `postgres` in production, so it is THIS PROJECT'S
-- object, not a Supabase platform one (checked: pg_event_trigger.evtowner =
-- postgres, evtenabled = 'O'). It is the backstop that catches a migration
-- which forgets `enable row level security` — the single mistake that exposes
-- a whole table — and a rebuild from the repo was silently losing it.
--
-- ⚠ `create event trigger` requires superuser. `postgres` has it on this
-- project but does NOT on a stock Supabase project, so on some rebuild targets
-- this will be refused. That is raised as a WARNING and not an exception on
-- purpose: aborting an entire disaster-recovery rebuild over a defence-in-depth
-- backstop would be the wrong trade. The warning names the exact remediation,
-- and tests/schema-drift.mjs reports the trigger's absence, so a rebuild that
-- silently lacks it is still visible afterwards.
do $$
begin
  if exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    raise notice 'dr-legacy-cloud-save: event trigger ensure_rls already exists — no-op';
    return;
  end if;

  create or replace function public.rls_auto_enable()
  returns event_trigger
  language plpgsql
  security definer
  set search_path to 'pg_catalog'
  as $fn$
  declare
    cmd record;
  begin
    for cmd in
      select *
      from pg_event_trigger_ddl_commands()
      where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
        and object_type in ('table', 'partitioned table')
    loop
      if cmd.schema_name is not null and cmd.schema_name in ('public')
         and cmd.schema_name not in ('pg_catalog', 'information_schema')
         and cmd.schema_name not like 'pg_toast%'
         and cmd.schema_name not like 'pg_temp%' then
        begin
          execute format('alter table if exists %s enable row level security', cmd.object_identity);
          raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
        exception
          when others then
            raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
        end;
      else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)',
          cmd.object_identity, cmd.schema_name;
      end if;
    end loop;
  end;
  $fn$;

  begin
    create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable();
  exception when insufficient_privilege then
    raise warning 'dr-legacy-cloud-save: could not create event trigger ensure_rls (needs superuser). '
                  'The RLS safety net is NOT installed on this database. Remediate by running, as a '
                  'superuser:  create event trigger ensure_rls on ddl_command_end execute function '
                  'public.rls_auto_enable();  — until then, every migration must enable RLS explicitly.';
  end;
end $$;

-- ── self-check: the commit gate ─────────────────────────────────────────────
-- Asserts COLUMN NAMES, not object names. The whole reason this file exists is
-- that production and the repo agreed on every constraint and index NAME for
-- game_saves and game_events while disagreeing on the columns underneath, so a
-- name-level assertion here would pass on the exact defect being fixed.
do $$
declare
  v_bad text[] := '{}';
begin
  if to_regclass('public.game_saves')  is null then v_bad := v_bad || 'game_saves missing';  end if;
  if to_regclass('public.game_events') is null then v_bad := v_bad || 'game_events missing'; end if;
  if to_regclass('public.chat_blocks') is null then v_bad := v_bad || 'chat_blocks missing'; end if;
  if array_length(v_bad, 1) is not null then
    raise exception 'dr-legacy-cloud-save: %', array_to_string(v_bad, ', ');
  end if;

  -- game_events: the two columns schema.sql gets wrong.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='game_events' and column_name='event_type') then
    v_bad := v_bad || 'game_events.event_type (schema.sql calls it "kind")';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='game_events' and column_name='occurred_at') then
    v_bad := v_bad || 'game_events.occurred_at (schema.sql calls it "created_at")';
  end if;

  -- game_saves: the key shape schema.sql gets wrong.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='game_saves' and column_name='id') then
    v_bad := v_bad || 'game_saves.id (schema.sql keys on (user_id, slot) instead)';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='public.game_saves'::regclass and conname='game_saves_user_id_slot_key') then
    v_bad := v_bad || 'game_saves_user_id_slot_key';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='public.game_saves'::regclass and conname='game_saves_slot_check') then
    v_bad := v_bad || 'game_saves_slot_check';
  end if;

  -- chat_blocks: composite key, both FKs.
  if (select count(*) from pg_constraint
       where conrelid='public.chat_blocks'::regclass and contype='f') <> 2 then
    v_bad := v_bad || 'chat_blocks: expected 2 foreign keys to auth.users';
  end if;

  -- RLS on all three. A table reconstructed without it is worse than absent.
  if exists (select 1 from pg_class
              where oid in ('public.game_saves'::regclass, 'public.game_events'::regclass,
                            'public.chat_blocks'::regclass)
                and not relrowsecurity) then
    v_bad := v_bad || 'one of game_saves/game_events/chat_blocks has RLS disabled';
  end if;

  if array_length(v_bad, 1) is not null then
    raise exception 'dr-legacy-cloud-save: %', array_to_string(v_bad, ', ');
  end if;

  -- rls_auto_enable is asserted; the EVENT TRIGGER is not, because it can be
  -- legitimately refused on a non-superuser rebuild (see §4). Its absence is
  -- surfaced by tests/schema-drift.mjs instead of aborting the rebuild here.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='profiles' and column_name='updated_at') then
    raise exception 'dr-legacy-cloud-save: profiles.updated_at is missing (schema.sql''s repair list omits it)';
  end if;

  if to_regprocedure('public.rls_auto_enable()') is null then
    raise exception 'dr-legacy-cloud-save: public.rls_auto_enable() is missing';
  end if;
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    raise warning 'dr-legacy-cloud-save: rls_auto_enable() exists but event trigger ensure_rls does NOT — the RLS safety net is inert on this database';
  end if;

  raise notice 'dr-legacy-cloud-save: OK';
end $$;
