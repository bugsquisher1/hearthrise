-- ============================================================================
-- 2026-08-11-telemetry-retention.sql
-- TELEMETRY RETENTION + CRON HEALTH  (b319, server half)
--
-- DO NOT APPLY AUTOMATICALLY — Tyler applies migrations.
--
-- THE INCIDENT
--   public.game_events reached 1,601,032 rows / 229 MB from SIX players in 3.45
--   days — 94% of the database (245 MB -> 16 MB after truncate). Rate: 77,320
--   rows and 11.1 MB per player per day. Cause was client-side: sync.js
--   subscribed to on('*') and wrote one row per event, with five of the eleven
--   emit sites inside per-kill / per-item / per-tick loops. That is fixed in
--   src/net/sync.js (allowlist + kill switch + rate cap).
--
-- WHY THIS MIGRATION EXISTS ANYWAY
--   The retention job was calibrated so it could never fire. `trim-game-events`
--   runs daily at 03:00, has executed 100 times, and returned DELETE 0 EVERY
--   time: a 30-day window against data 3.45 days old. And at the old rate a
--   30-day window would have held ~2 GB, so even when it finally fired it would
--   have been useless. A policy that cannot fire is worse than no policy,
--   because the dashboard reads as covered.
--
--   So: retune the window to 7 days, make the job report what it did, and add
--   the thing that was actually missing — a check that NOTICES when a scheduled
--   job fails or silently stops running. (`trim-expired-listings` and
--   `trim-market-sales` have been erroring for 3 days after the clan-seat column
--   renames and nothing anywhere noticed. The backend architect owns those two
--   fixes; this migration owns the detector that should have caught them.)
--
-- WHAT IT DOES
--   1. public.maintenance_log      — one row per maintenance run (what it did).
--   2. public.maintenance_alerts   — deduped alerts a human/monitor can read.
--   3. public.hr_trim_game_events(days, batch) — batched, column-name-agnostic
--      retention delete. Defaults to 7 days.
--   4. public.hr_cron_health(window) — scans cron.job_run_details for `failed`
--      runs, for jobs that have STOPPED running, and for a telemetry table that
--      is growing again; raises a warning and records a deduped alert.
--   5. Reschedules `trim-game-events` (03:00 daily, 7 days) and schedules
--      `hr-cron-health` hourly.
--
-- SAFETY
--   Idempotent (create-if-not-exists / create-or-replace / unschedule-then-
--   schedule). No player data outside public.game_events is touched, and
--   game_events is pure telemetry — nothing reads it for gameplay. Every cron
--   block is exception-wrapped so a project without pg_cron still applies.
--
-- ⚠ NO TOP-LEVEL `begin;` / `commit;`. (Review S5.) This file used to open and
--   close a transaction itself, which meant NO transactional applier could run
--   it at all: Supabase MCP apply_migration, `supabase db push`, psql -1 and
--   every migration runner already wrap the file, and a nested `begin` is
--   either an error or a silent no-op followed by a `commit` that ends the
--   OUTER transaction early — the worst of the three outcomes, because the
--   remainder of the file then runs unprotected. Net effect: the retention fix
--   sat undeployed while reading as shipped. A migration must be a sequence of
--   statements and let its runner own the transaction. Anything that genuinely
--   needs atomicity goes in a `do $$ … $$` block, which is one statement.
--   tests/run-sql-tests.mjs lints for this.
-- ============================================================================

-- ── 1. Maintenance bookkeeping ─────────────────────────────────────────────
-- A job that runs 100 times and reports nothing is indistinguishable from a job
-- that never ran. Every maintenance run now leaves a receipt.
create table if not exists public.maintenance_log (
  id      bigint generated always as identity primary key,
  job     text        not null,
  ran_at  timestamptz not null default now(),
  detail  jsonb       not null default '{}'::jsonb
);
create index if not exists maintenance_log_job_ran_idx on public.maintenance_log (job, ran_at desc);
alter table public.maintenance_log enable row level security;
-- No policies on purpose: operator-only (service_role / SECURITY DEFINER).

create table if not exists public.maintenance_alerts (
  id         bigint generated always as identity primary key,
  source     text        not null,          -- 'cron' | 'telemetry'
  ref        text        not null unique,   -- dedupe key, e.g. 'cron-run:12345'
  severity   text        not null default 'warn' check (severity in ('info','warn','critical')),
  message    text        not null,
  detail     jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acked_at   timestamptz
);
create index if not exists maintenance_alerts_open_idx on public.maintenance_alerts (created_at desc) where acked_at is null;
alter table public.maintenance_alerts enable row level security;
-- No policies on purpose: operator-only.

-- ── 2. Retention: 7 days, batched, resilient to a column rename ────────────
-- The client posts `occurred_at`; schema.sql documents `created_at`. A retention
-- job that hardcodes the wrong one is exactly how trim-expired-listings started
-- failing silently, so this resolves the timestamp column at run time and raises
-- LOUDLY if it cannot find one.
create or replace function public.hr_trim_game_events(p_days int default 7, p_batch int default 50000)
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_col     text;
  v_n       bigint;
  v_deleted bigint := 0;
  v_before  bigint;
begin
  if p_days is null or p_days < 1 then
    raise exception 'hr_trim_game_events: refusing p_days=% (a 0/negative window would delete everything)', p_days;
  end if;
  if to_regclass('public.game_events') is null then
    raise notice 'hr_trim_game_events: public.game_events does not exist — nothing to do';
    return 0;
  end if;

  select column_name into v_col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'game_events'
     and column_name in ('occurred_at', 'created_at', 'inserted_at')
   order by array_position(array['occurred_at','created_at','inserted_at'], column_name)
   limit 1;
  if v_col is null then
    raise exception 'hr_trim_game_events: no timestamp column on public.game_events (looked for occurred_at/created_at/inserted_at) — retention is NOT running';
  end if;

  execute 'select count(*) from public.game_events' into v_before;

  -- Batched so a large backlog never holds one long transaction / bloats WAL.
  loop
    execute format(
      'delete from public.game_events where ctid = any (array(
         select ctid from public.game_events where %I < now() - make_interval(days => $1) limit $2))',
      v_col
    ) using p_days, p_batch;
    get diagnostics v_n = row_count;
    v_deleted := v_deleted + v_n;
    exit when v_n = 0;
  end loop;

  insert into public.maintenance_log (job, detail)
  values ('trim-game-events', jsonb_build_object(
    'days', p_days, 'ts_column', v_col, 'rows_before', v_before, 'rows_deleted', v_deleted,
    'rows_after', v_before - v_deleted));

  raise notice 'hr_trim_game_events: deleted % row(s) older than % day(s) using %', v_deleted, p_days, v_col;
  return v_deleted;
end;
$fn$;

-- Operator/cron only. (Grant hygiene per tests/run-sql-tests.mjs: revoke from
-- PUBLIC before anything can call it — a new SECURITY DEFINER function is
-- anon-callable by default on Supabase.)
-- ⚠ ALL FOUR ROLES. Revoking three of them leaves the privilege intact via the
--   fourth: Supabase's default ACL grants EXECUTE to anon, authenticated AND
--   service_role, on top of Postgres's own grant to PUBLIC. service_role can
--   already delete this table directly, so the capability removed is small —
--   but `hr_trim_game_events(1)` is a one-request six-day telemetry delete, and
--   "the other three were enough" is how a key ends up under the mat.
revoke execute on function public.hr_trim_game_events(int, int) from public, anon, authenticated, service_role;

-- Make the retention delete cheap regardless of which column exists.
do $$
declare v_col text;
begin
  if to_regclass('public.game_events') is null then return; end if;
  select column_name into v_col from information_schema.columns
   where table_schema='public' and table_name='game_events'
     and column_name in ('occurred_at','created_at','inserted_at')
   order by array_position(array['occurred_at','created_at','inserted_at'], column_name) limit 1;
  if v_col is not null then
    execute format('create index if not exists game_events_retention_idx on public.game_events (%I)', v_col);
  end if;
end $$;

-- ── 3. Cron health: notice failures AND silent stoppages ───────────────────
-- Three questions, because "did it error" is only one of the three ways a cron
-- job lets you down:
--   (a) did any run FAIL in the window?                  -> failed runs
--   (b) has a job STOPPED running altogether?            -> stale last-run
--   (c) is the thing it guards growing anyway?           -> table size alarm
-- (c) is the one that would have caught THIS incident: the job was green for
-- 100 consecutive runs while the table went to 229 MB.
create or replace function public.hr_cron_health(p_window interval default interval '25 hours')
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_alerts int := 0;
  r        record;
  v_bytes  bigint;
  v_sev    text;
  v_msg    text;
begin
  if to_regclass('cron.job_run_details') is not null then
    -- (a) FAILED RUNS — one alert per run id, so re-running the check is free.
    for r in
      select d.runid, d.jobid, j.jobname, d.status, d.return_message, d.start_time
        from cron.job_run_details d
        left join cron.job j on j.jobid = d.jobid
       where d.status = 'failed'
         and d.start_time > now() - p_window
    loop
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('cron', 'cron-run:' || r.runid, 'critical',
              format('cron job %s FAILED: %s', coalesce(r.jobname, 'jobid ' || r.jobid), left(coalesce(r.return_message,''), 300)),
              jsonb_build_object('jobid', r.jobid, 'jobname', r.jobname, 'runid', r.runid,
                                 'status', r.status, 'start_time', r.start_time))
      on conflict (ref) do nothing;
      if found then
        v_alerts := v_alerts + 1;
        raise warning '[cron-health] % FAILED: %', coalesce(r.jobname, r.jobid::text), left(coalesce(r.return_message,''), 300);
      end if;
    end loop;

    -- (b) STOPPED vs NEVER STARTED — an active job with no successful run in 48h.
    --
    -- ⚠ REVISION 2, and it was found the hard way: this check fired FIVE
    --   warn-level alerts the moment this migration was applied to production,
    --   because rescheduling a job gives it a NEW jobid and therefore no run
    --   history — so every freshly (re)scheduled job read as "has not succeeded
    --   since never". Those five sat in the same list as the two genuine
    --   failures this check exists to surface. That is precisely how a monitor
    --   dies: not by missing an incident, but by being noisy enough after a
    --   deploy that nobody reads it the next morning.
    --
    --   pg_cron records no creation time for a job, so "brand new" and "has
    --   never fired" are genuinely indistinguishable from cron.job alone. This
    --   does not pretend otherwise — it splits the two claims by SEVERITY, so
    --   the actionable one (something that used to work has stopped) is never
    --   buried by the ambiguous one. `any_run` counts runs of ANY status, so a
    --   job that has only ever failed still counts as "has run" and correctly
    --   escalates to 'warn'.
    for r in
      select j.jobid, j.jobname,
             max(d.start_time) filter (where d.status = 'succeeded') as last_run,
             count(d.runid)                                          as any_run
        from cron.job j
        left join cron.job_run_details d on d.jobid = j.jobid
       where j.active
       group by j.jobid, j.jobname
      having coalesce(max(d.start_time) filter (where d.status = 'succeeded'),
                      'epoch'::timestamptz) < now() - interval '48 hours'
    loop
      if r.any_run = 0 then
        v_sev := 'info';
        v_msg := format('cron job %s has no run history yet (new, or it has never fired)', r.jobname);
      else
        v_sev := 'warn';
        v_msg := format('cron job %s has not succeeded since %s', r.jobname, coalesce(r.last_run::text, 'never'));
      end if;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('cron', 'cron-stale:' || r.jobname || ':' || to_char(now(), 'YYYY-MM-DD'), v_sev, v_msg,
              jsonb_build_object('jobid', r.jobid, 'jobname', r.jobname,
                                 'last_success', r.last_run, 'runs_seen', r.any_run))
      on conflict (ref) do nothing;
      if found then
        v_alerts := v_alerts + 1;
        if v_sev = 'warn' then raise warning '[cron-health] %', v_msg;
        else raise notice '[cron-health] %', v_msg; end if;
      end if;
    end loop;
  else
    raise notice 'hr_cron_health: cron.job_run_details not readable — failure detection is INERT here';
  end if;

  -- (c) THE ONE THAT WOULD HAVE CAUGHT b319. 100 MB of telemetry is already far
  -- past anything this game needs; with the client fix the allowlisted events
  -- total ~176 rows/player/day (~25 KB), so this cannot false-positive without
  -- something being genuinely wrong.
  if to_regclass('public.game_events') is not null then
    v_bytes := pg_total_relation_size('public.game_events');
    if v_bytes > 100 * 1024 * 1024 then
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('telemetry', 'game_events-size:' || to_char(now(), 'YYYY-MM-DD'), 'critical',
              format('public.game_events is %s — retention is not keeping up (see b319)', pg_size_pretty(v_bytes)),
              jsonb_build_object('bytes', v_bytes))
      on conflict (ref) do nothing;
      if found then
        v_alerts := v_alerts + 1;
        raise warning '[cron-health] game_events is % — retention is not keeping up', pg_size_pretty(v_bytes);
      end if;
    end if;
  end if;

  insert into public.maintenance_log (job, detail)
  values ('cron-health', jsonb_build_object('alerts_raised', v_alerts, 'window', p_window::text));
  return v_alerts;
end;
$fn$;

revoke execute on function public.hr_cron_health(interval) from public, anon, authenticated, service_role;

-- ── 4. Schedule ────────────────────────────────────────────────────────────
-- Retune the EXISTING trim-game-events job (30 days -> 7) rather than adding a
-- second one, and add the health check hourly. Exception-wrapped: a project
-- without pg_cron still applies everything above.
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not installed — schedule these two by hand:';
    raise notice '  select cron.schedule(''trim-game-events'', ''0 3 * * *'', ''select public.hr_trim_game_events(7)'');';
    raise notice '  select cron.schedule(''hr-cron-health'', ''7 * * * *'', ''select public.hr_cron_health()'');';
    return;
  end if;
  begin perform cron.unschedule('trim-game-events'); exception when others then null; end;
  perform cron.schedule('trim-game-events', '0 3 * * *', 'select public.hr_trim_game_events(7)');
  begin perform cron.unschedule('hr-cron-health'); exception when others then null; end;
  perform cron.schedule('hr-cron-health', '7 * * * *', 'select public.hr_cron_health()');
  raise notice 'scheduled: trim-game-events (03:00 daily, 7-day window) + hr-cron-health (hourly)';
exception when others then
  raise notice 'cron scheduling skipped (%) — schedule by hand (see notices above).', sqlerrm;
end $$;

-- ── 5. Self-check ──────────────────────────────────────────────────────────
-- Prove the migration took, and prove the retention job can actually fire —
-- the exact property the old 30-day window did not have.
do $$
declare v_deleted bigint;
begin
  if to_regprocedure('public.hr_trim_game_events(int,int)') is null then
    raise exception 'hr_trim_game_events missing';
  end if;
  if to_regprocedure('public.hr_cron_health(interval)') is null then
    raise exception 'hr_cron_health missing';
  end if;
  -- Dry proof: run it once. On a freshly truncated table this legitimately
  -- deletes 0, but it exercises the column lookup + the delete plan, so a
  -- misnamed column fails HERE, at apply time, instead of silently at 03:00.
  select public.hr_trim_game_events(7) into v_deleted;
  raise notice 'self-check ok: retention pass deleted % row(s)', v_deleted;
  perform public.hr_cron_health();
end $$;
