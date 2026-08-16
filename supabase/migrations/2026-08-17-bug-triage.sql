-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — BUG TRIAGE STATE (the operator half of the bug-report pipe)
--
-- WHY THIS EXISTS
--   Reports already arrive, are already attributed to a verified auth.uid(),
--   already rate-limited, already idempotent, and already forwarded to Discord
--   (2026-08-11-bug-report-relay.sql + supabase/functions/bug-report-bridge).
--   What did NOT exist is anywhere to record what was DONE about one. The only
--   triage field on the table is `resolved boolean` — a single bit that cannot
--   distinguish "nobody has looked at this yet" from "looked at, reproduced,
--   not fixing", and carries no note. So triage lived entirely in Tyler's head
--   while he watched a Discord channel, which is the thing being retired.
--
--   This file adds the state an automated triage loop needs to be RESUMABLE:
--   a status a scheduled agent can filter on, a note saying why, and a server
--   clock for when. See docs/design/bug-triage-loop.md.
--
-- ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
--
--   (a) IT DOES NOT CHANGE public.bug_report_submit's SIGNATURE. That six-arg
--       function is pinned in three places — tests/rpc-resolution.targets.json,
--       tests/schema-drift.baseline.json, and the A9 authenticated-surface
--       retrofit which owns a `bug_report_submit__ungated` TWIN of the same
--       arity. Adding a parameter would not replace it; `create or replace`
--       keys on arity, so a 7-arg version is a NEW OVERLOAD sitting beside the
--       old one, PostgREST would then have an ambiguous target, and the
--       ungated-RPC census would grow an entry nobody retrofitted. Every field
--       this loop needs is either already in `p_state` or is operator-side.
--
--   (b) IT DOES NOT STORE THE SCREENSHOT. Measured, not assumed: the Edge
--       Function bounds a shot at 1.5 MB of decoded image and forwards it to
--       Discord as a multipart attachment, where it already is. A second copy
--       would land base64-inflated (~2 MB/row) in the same database that is the
--       ONLY copy of every player's progression, and PITR is deferred here —
--       restores run off DAILY BACKUPS, whose duration scales with table size.
--       Paying restore-time for a duplicate of an image that is one click away
--       in Discord is a bad trade. Instead the RELAY records that a shot exists
--       (state.hasScreenshot, set Edge-side inside the jsonb it already sends —
--       no signature change, per (a)), so the triage loop knows when to go look.
--
--   (c) IT DOES NOT ADD A `url`/`screen` COLUMN. Hearthrise is a single-page
--       app: the screen IS `state->>'activeTab'`, and viewport / physical
--       screen / dpr / zoom / safe-area already ride in `state->'metrics'`.
--       A generated column duplicating one of them would add drift surface and
--       a second definition of the same fact. tools/triage-bugs.mjs projects
--       them out of the jsonb at read time.
--
--   (d) IT DOES NOT REMOVE "bugs own readable". A reporter reading their OWN
--       rows is deliberate and is pinned by the DR reconstruction file. It
--       crosses to nobody: the policy is `auth.uid() = user_id`.
--
-- ── THE ONE REAL SECURITY GAP THIS CLOSES ───────────────────────────────────
--   The 6/hour + 20/day cap lives INSIDE bug_report_submit. The direct-insert
--   FALLBACK path does not go through that RPC at all — it is a plain
--   PostgREST insert admitted by the "bugs anyone submits" policy, whose only
--   condition is `auth.uid() = user_id`. So any signed-in account could loop
--   POST /rest/v1/bug_reports and grow this table without bound; the RPC's cap
--   never sees it. `hr_rate_gate` cannot be reused — it is granted solely to
--   hr_engine and is keyed (user, slot, bucket) for the accrual engine, so it
--   is not reachable from a client insert.
--
--   The backstop is therefore a BEFORE INSERT trigger, which every write path
--   crosses regardless of policy. It is set at 40/day — DOUBLE the RPC's own
--   20/day — precisely so it can never fire for legitimate relay traffic and
--   can never be mistaken for the primary limit. It takes the SAME per-user
--   advisory key the RPC takes, so the two paths serialise against each other
--   instead of racing; advisory xact locks are re-entrant within a session, so
--   the RPC re-taking its own key costs nothing.
--
--   Operator work is exempt by `auth.uid() is null` — the service role and the
--   management API carry no JWT, so backfills and imports are not throttled by
--   a control that exists to bound CLIENTS.
--
-- Idempotent and ADDITIVE. Creates no table, drops nothing, changes no RPC.
-- ROLLBACK:
--   drop trigger if exists bug_reports_triage_sync_trg  on public.bug_reports;
--   drop trigger if exists bug_reports_insert_guard_trg on public.bug_reports;
--   drop function if exists public.bug_reports_triage_sync();
--   drop function if exists public.bug_reports_insert_guard();
--   alter table public.bug_reports
--     drop column if exists status,
--     drop column if exists triage_note,
--     drop column if exists triaged_at;
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions ─────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.bug_reports') is null then
    raise exception 'public.bug_reports is missing — 2026-08-10-dr-bug-reports-base.sql must run first';
  end if;
  if to_regprocedure('public.bug_report_submit(text,text,text,jsonb,jsonb,text)') is null then
    raise exception 'public.bug_report_submit is missing — 2026-08-11-bug-report-relay.sql must run first';
  end if;
end $$;

-- ── 1. Triage state ──────────────────────────────────────────────────────
-- `status` is the authority. `resolved` (the pre-existing bit, and the
-- predicate of bug_reports_resolved_idx) becomes a DERIVED mirror maintained
-- by the trigger in §3 — two columns that can disagree about the same fact is
-- how a triage queue starts lying, so only one of them is ever written by hand.
alter table public.bug_reports
  add column if not exists status      text not null default 'new',
  add column if not exists triage_note text,
  add column if not exists triaged_at  timestamptz;

do $$ begin
  alter table public.bug_reports add constraint bug_reports_status_chk
    check (status in ('new','triaged','fixed','wontfix'));
exception when duplicate_object then null; end $$;

-- A triage note is operator prose, not a place to park a payload.
do $$ begin
  alter table public.bug_reports add constraint bug_reports_triage_note_chk
    check (triage_note is null or length(triage_note) <= 2000);
exception when duplicate_object then null; end $$;

-- The queue read is "oldest unhandled first". A partial index means the scan
-- cost tracks the size of the BACKLOG, not the size of the archive — which is
-- the property that has to hold when this table has ten thousand rows in it.
create index if not exists bug_reports_status_new_idx
  on public.bug_reports (created_at) where status = 'new';

-- Backfill the single pre-existing bit into the new vocabulary. Guarded so a
-- re-run cannot walk back a status an operator has since set by hand.
update public.bug_reports
   set status = 'fixed'
 where resolved = true and status = 'new';

-- ── 2. Rate backstop on EVERY insert path ────────────────────────────────
create or replace function public.bug_reports_insert_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c_day_backstop constant int := 40;   -- 2x bug_report_submit's own 20/day
  v_uid uuid := auth.uid();
  v_day int;
begin
  -- No JWT = service role / management API = operator work. Not a client.
  if v_uid is null then
    return new;
  end if;

  -- Same key bug_report_submit takes, so the RPC path and the direct-insert
  -- path serialise against each other rather than both reading a stale count.
  perform pg_advisory_xact_lock(hashtextextended('hr:bug_report:' || v_uid::text, 0));

  select count(*) into v_day from public.bug_reports
   where user_id = v_uid and created_at > now() - interval '24 hours';

  if v_day >= c_day_backstop then
    raise exception 'bug report daily backstop reached (% in 24h)', v_day
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function public.bug_reports_insert_guard() is
  'Per-user 40/day backstop crossed by EVERY insert path, including the direct PostgREST fallback that bypasses bug_report_submit''s 6/hour + 20/day cap. Deliberately looser than the RPC so it never fires on legitimate traffic. Exempts operator writes (no auth.uid()).';

drop trigger if exists bug_reports_insert_guard_trg on public.bug_reports;
create trigger bug_reports_insert_guard_trg
  before insert on public.bug_reports
  for each row execute function public.bug_reports_insert_guard();

-- ── 3. Keep `resolved` honest, and stamp the server clock ────────────────
-- triaged_at is never accepted from a caller — it is now(), like every other
-- timestamp on a shared surface.
create or replace function public.bug_reports_triage_sync()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.resolved := (new.status in ('fixed','wontfix'));

  if tg_op = 'INSERT' then
    new.triaged_at := case when new.status = 'new' then null else now() end;
  elsif new.status is distinct from old.status then
    new.triaged_at := case when new.status = 'new' then null else now() end;
  else
    new.triaged_at := old.triaged_at;
  end if;

  return new;
end $$;

comment on function public.bug_reports_triage_sync() is
  'Derives bug_reports.resolved from bug_reports.status and stamps triaged_at from the server clock, so the legacy boolean can never disagree with the status and no caller can backdate a triage.';

drop trigger if exists bug_reports_triage_sync_trg on public.bug_reports;
create trigger bug_reports_triage_sync_trg
  before insert or update on public.bug_reports
  for each row execute function public.bug_reports_triage_sync();

-- ── 4. Self-verification — assert the load-bearing properties ────────────
do $$
declare
  v_missing text[] := '{}';
  v_def     text;
begin
  -- (a) the three triage columns exist with the right defaults
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='bug_reports'
                    and column_name='status' and is_nullable='NO') then
    v_missing := v_missing || 'status (not null)';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='bug_reports'
                    and column_name='triage_note') then
    v_missing := v_missing || 'triage_note';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='bug_reports'
                    and column_name='triaged_at') then
    v_missing := v_missing || 'triaged_at';
  end if;

  -- (b) the status vocabulary is closed — a typo'd status must not persist.
  --     ASSERTED BEHAVIOURALLY, not by name. A `where conname=...` existence
  --     check passes for a constraint that has been quietly widened to
  --     `check (status is not null)` — measured: that exact mutation applied
  --     clean against the name check (tests/bug-triage.mjs --mutate, 'open-vocab').
  --     A constraint is what it REFUSES, so refuse something. The BEGIN/EXCEPTION
  --     block is an implicit savepoint, so the probe row never survives.
  if not exists (select 1 from pg_constraint
                  where conrelid='public.bug_reports'::regclass
                    and conname='bug_reports_status_chk') then
    v_missing := v_missing || 'bug_reports_status_chk';
  else
    declare v_open boolean := true;
    begin
      begin
        insert into public.bug_reports (summary, status)
        values ('__status_vocabulary_probe__', 'not_a_real_status');
      exception when check_violation then v_open := false;
      end;
      if v_open then
        raise exception 'bug-triage: bug_reports_status_chk accepted the status ''not_a_real_status'' — the vocabulary is open, so a typo''d status would silently drop a report out of every triage query';
      end if;
    end;
  end if;

  -- (c) both triggers are attached; a function that exists but is not wired
  --     protects nothing, and that is the failure mode worth naming.
  if not exists (select 1 from pg_trigger
                  where tgrelid='public.bug_reports'::regclass
                    and tgname='bug_reports_insert_guard_trg' and not tgisinternal) then
    v_missing := v_missing || 'trigger bug_reports_insert_guard_trg';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid='public.bug_reports'::regclass
                    and tgname='bug_reports_triage_sync_trg' and not tgisinternal) then
    v_missing := v_missing || 'trigger bug_reports_triage_sync_trg';
  end if;

  if to_regclass('public.bug_reports_status_new_idx') is null then
    v_missing := v_missing || 'bug_reports_status_new_idx';
  end if;

  if array_length(v_missing,1) is not null then
    raise exception 'bug-triage: missing after apply: %', array_to_string(v_missing, ', ');
  end if;

  -- (d) THE INVARIANT THIS FILE MUST NOT BREAK: reports stay append-only to
  --     the client. status / triage_note are operator fields; if a client
  --     UPDATE policy ever appears, a reporter could mark their own bug fixed.
  if exists (select 1 from pg_policy
              where polrelid='public.bug_reports'::regclass and polcmd in ('w','d')) then
    raise exception 'bug_reports has a client UPDATE/DELETE policy — triage state would be client-writable';
  end if;

  -- (e) the INSERT policy still pins the author (unchanged by this file, but
  --     this file adds the trigger that assumes user_id is trustworthy)
  select pg_get_expr(polwithcheck, polrelid) into v_def
    from pg_policy where polrelid='public.bug_reports'::regclass
      and polname='bugs anyone submits';
  if v_def is null or v_def !~ 'uid\(\)\s*=\s*user_id' then
    raise exception 'bug_reports INSERT policy no longer pins user_id to auth.uid() — got %', coalesce(v_def,'<none>');
  end if;

  -- (f) bug_report_submit's arity is UNCHANGED — no accidental overload
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='bug_report_submit') <> 1 then
    raise exception 'bug_report_submit has been overloaded — PostgREST resolution is now ambiguous';
  end if;

  raise notice 'BUG TRIAGE OK — status/note/triaged_at added, resolved derived, 40/day backstop on every insert path, append-only preserved';
end $$;
