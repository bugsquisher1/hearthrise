-- ============================================================================
-- 2026-08-10-dr-bug-reports-base.sql
--
-- RECONSTRUCTION, NOT A CHANGE. `public.bug_reports` exists in production and
-- is created by NO file in this repo. This file closes that gap.
--
-- ── WHY THIS IS A DURABILITY FILE AND NOT A HOUSEKEEPING ONE ────────────────
-- After cutover the database is the ONLY copy of every player's progression.
-- Disaster recovery rests on one assumption: "we can rebuild the schema from
-- the repo." That assumption was FALSE, and it was false in a way that hid
-- itself — a clean replay of supabase/schema.sql + supabase/migrations/** does
-- not merely lose `bug_reports`, it CASCADES:
--
--   bug-report-relay              fails: public.bug_reports is missing
--     └─ authenticated-surface-lockdown  fails: A9's retrofit target
--        public.bug_report_submit(text,text,text,jsonb,jsonb,text) does not
--        resolve, so the whole 35-RPC __ungated retrofit is refused
--          ├─ grant-hygiene                fails: ungated_client_rpcs is 30+ long
--          ├─ clan-contribute-authority    fails: clan_contribute__ungated missing
--          └─ clan-board-attribution       fails: clan_board_progress__ungated missing
--
-- One absent table takes five further migrations down with it, including every
-- authenticated-surface security control. Measured, not reasoned: see
-- `node tests/schema-replay.mjs --list` before and after this file.
--
-- ── THE SHAPE HERE IS READ OUT OF PRODUCTION, NOT INVENTED ──────────────────
-- Columns, constraints, indexes and the policy below were read from
-- information_schema / pg_constraint / pg_indexes / pg_policies on
-- nezapsylztqbbwuwembx on 2026-08-14. Deliberately reconstructed in the
-- PRE-RELAY shape: `idem_key`, `source`, `bug_reports_source_chk`,
-- `bug_reports_idem_idx`, `bug_reports_user_recent_idx` and the
-- "bugs anyone submits" INSERT policy all belong to
-- 2026-08-11-bug-report-relay.sql and are ADDED BY IT. Duplicating them here
-- would give two files one definition — the exact failure that silently deleted
-- R4's timestamp pin (see HANDOFF, "A LATENT BUG WORTH MORE THAN THE FEATURE").
--
-- What this file owns and no other file does:
--   table bug_reports (9 base columns)   bug_reports_pkey
--   bug_reports_summary_check            bug_reports_user_id_fkey
--   row level security = on              policy "bugs own readable" (SELECT)
--   bug_reports_created_at_idx           bug_reports_resolved_idx
--
-- Table grants are NOT set here. On a real Supabase project anon/authenticated
-- receive select/insert/update/delete on public tables from the platform's
-- default privileges at project setup; RLS is what decides. Writing them into
-- a migration would make the repo the authority for a platform-owned ACL and
-- would drift the moment Supabase changed it.
--
-- ── APPLY SAFETY: THIS FILE IS A NO-OP ON ANY DATABASE THAT ALREADY HAS THE
-- TABLE, BY CONSTRUCTION, NOT BY `if not exists` ────────────────────────────
-- Every statement is inside `if v_fresh then`, where v_fresh is
-- `to_regclass('public.bug_reports') is null`. This is stronger than dressing
-- each statement in `if not exists`, and the difference is load-bearing:
-- `create policy` has no `if not exists`, so the naive form is
-- `drop policy if exists … ; create policy …` — which on production would DROP
-- AND REBUILD a live policy, i.e. a reconstruction file editing production. The
-- guard makes "this file cannot change production" a property of one branch
-- that is trivially readable, rather than a claim about nine statements.
--
-- ROLLBACK: on a database where the table pre-existed there is nothing to roll
-- back — the file did nothing. On a fresh rebuild, roll back with
--   drop table if exists public.bug_reports cascade;
-- ============================================================================

do $$
declare
  v_fresh boolean := to_regclass('public.bug_reports') is null;
begin
  if not v_fresh then
    raise notice 'dr-bug-reports-base: public.bug_reports already exists — no-op (this is the expected result on production)';
    return;
  end if;

  raise notice 'dr-bug-reports-base: reconstructing public.bug_reports from the 2026-08-14 production shape';

  create table public.bug_reports (
    id            bigserial   primary key,
    user_id       uuid        references auth.users(id) on delete set null,
    build_version text,
    summary       text        not null,
    description   text,
    state         jsonb,
    errors        jsonb,
    resolved      boolean     not null default false,
    created_at    timestamptz not null default now(),
    constraint bug_reports_summary_check
      check (length(summary) >= 1 and length(summary) <= 240)
  );

  alter table public.bug_reports enable row level security;

  -- A reporter reads their own reports and nobody else's. Triage happens with
  -- the service role, which bypasses RLS. There is deliberately no INSERT
  -- policy here: 2026-08-11-bug-report-relay.sql adds "bugs anyone submits".
  create policy "bugs own readable" on public.bug_reports
    for select using (auth.uid() = user_id);

  create index bug_reports_created_at_idx on public.bug_reports (created_at desc);
  create index bug_reports_resolved_idx   on public.bug_reports (resolved) where resolved = false;
end $$;

-- ── self-check: the commit gate ─────────────────────────────────────────────
-- apply_migration is atomic on this project, so a raise here aborts the file.
-- Each assertion names an object rather than counting one, because a count
-- passes while pointing at the wrong thing.
do $$
declare
  v_missing text[] := '{}';
  v_cols    int;
begin
  if to_regclass('public.bug_reports') is null then
    raise exception 'dr-bug-reports-base: public.bug_reports does not exist after this file';
  end if;

  -- the 9 base columns, by name
  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'bug_reports'
     and column_name in ('id','user_id','build_version','summary','description',
                         'state','errors','resolved','created_at');
  if v_cols <> 9 then
    raise exception 'dr-bug-reports-base: expected the 9 base columns, found %', v_cols;
  end if;

  if not exists (select 1 from pg_class where oid = 'public.bug_reports'::regclass and relrowsecurity) then
    raise exception 'dr-bug-reports-base: row level security is not enabled on bug_reports';
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'bug_reports'
                    and policyname = 'bugs own readable') then
    raise exception 'dr-bug-reports-base: policy "bugs own readable" is missing';
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.bug_reports'::regclass
                    and conname  = 'bug_reports_summary_check') then
    v_missing := v_missing || 'bug_reports_summary_check';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.bug_reports'::regclass
                    and contype  = 'f'
                    and confrelid = 'auth.users'::regclass) then
    v_missing := v_missing || 'FK bug_reports.user_id -> auth.users';
  end if;
  if to_regclass('public.bug_reports_created_at_idx') is null then
    v_missing := v_missing || 'bug_reports_created_at_idx';
  end if;
  if to_regclass('public.bug_reports_resolved_idx') is null then
    v_missing := v_missing || 'bug_reports_resolved_idx';
  end if;

  if array_length(v_missing, 1) is not null then
    raise exception 'dr-bug-reports-base: missing after apply: %', array_to_string(v_missing, ', ');
  end if;

  raise notice 'dr-bug-reports-base: OK';
end $$;
