-- 2026-09-03-cron-health-generalized.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. NOT APPLIED TO PRODUCTION. ⚠⚠⚠
--   Operator/telemetry only. It creates NO client-callable surface, changes NO
--   grant, reads NO player row for gameplay and writes NOTHING a player can see.
--
--   APPLY AFTER: 2026-08-11-telemetry-retention.sql (maintenance_log,
--   maintenance_alerts, hr_cron_health). §0 fails closed on each.
--   No new cron schedule: the existing hourly `hr-cron-health` job
--   (`7 * * * *`, jobid 18) calls the same function under the same signature.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY (the b319 lesson, fixed for ONE table and left there)
-- ══════════════════════════════════════════════════════════════════════════
-- 2026-08-11-telemetry-retention.sql was written the morning `game_events`
-- reached 1,601,032 rows / 229 MB — 94% of the database — from SIX players in
-- 3.45 days, while the retention job that was supposed to prevent it had run 100
-- consecutive times and deleted 0 rows every time. Its §(c) is the check that
-- would have caught it, and its own comment says so.
--
-- §(c) alarms on `pg_total_relation_size('public.game_events') > 100 MB`.
-- That is the INCIDENT, not the CLASS. Four things it cannot see, every one of
-- which is live-reachable today:
--
--   1. ANY OTHER TABLE. `player_ledger` is already the largest table on this
--      database (6.2 MB / ~12k rows at six players, measured 2026-08-30) and it
--      is append-only by design. `hr_combat_xp_credit_log` (1.6 MB) and
--      `hr_kill_credit_log` (0.3 MB) are two-day journals that arrived in the
--      last week. Any of them can be the next game_events and none is watched.
--   2. GROWTH RATE. A table is dangerous long before it is large: b319's rate
--      was ~57 MB/day, so a rate alarm at 50 MB/day would have fired on DAY ONE
--      instead of on day four at 229 MB. Size alone tells you after the fact.
--   3. CONNECTION HEADROOM. Measured on this project: `max_connections` = 60,
--      17 in use at six players. docs/design/server-authority.md §2a-ii names
--      this "the first thing that will break at 10×", and the failure mode is
--      TOTAL — nobody connects, the dashboard included. Nothing measured it.
--   4. A JOB THAT HAS NEVER RUN. §(b) already catches a job that STOPPED, but a
--      job that has NEVER succeeded is reported `info` — forever, once a day,
--      unescalated, because `any_run = 0` is its own excuse. Live example:
--      `hr-kill-credit-prune` was scheduled 2026-08-29 and filed
--      `cron-stale:hr-kill-credit-prune` at info on the 29th AND the 30th. It
--      did fire at 04:40 on the 30th (checked — this is not an open incident),
--      but had it been mis-scheduled, the alarm would have looked identical for
--      a month. "New" is only an excuse for the first day.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES
-- ══════════════════════════════════════════════════════════════════════════
--   §1  public.hr_db_samples — one row per hourly run: database bytes,
--       connection headroom, and the top-N tables by size (bytes + estimated
--       live rows). Self-pruning at 30 days. This is the memory a RATE needs;
--       without it every "is it growing" question is unanswerable.
--   §2  public.hr_db_sample() — takes one sample. Privileged, revoked from
--       everyone.
--   §3  public.hr_cron_health_ex(interval, numeric) — the detector. Keeps
--       (a) failed runs and (b) stale jobs verbatim; (c) game_events becomes a
--       special case of the new (e); adds (d) database size + 24h growth,
--       (e) per-table size + growth + row delta, (f) connection headroom,
--       (g) the never-ran escalation; and prunes maintenance_log / acked
--       maintenance_alerts at 180 days — the gap and the retention docs/design/
--       restore-runbook.md's audit already ruled on, which nothing implemented. The second parameter is a
--       sensitivity scale CLAMPED TO (0, 1] — it can only make an alarm fire
--       sooner, never later — and exists so every arm can be EXERCISED by a
--       test against a 16 MB replay instead of shipping never having fired.
--   §3b public.hr_cron_health(interval) — same name, same signature, same
--       schedule, same ACL, now a one-line wrapper at scale 1.0. The scheduled
--       command `select public.hr_cron_health()` is untouched and unambiguous.
--
-- ── THE THRESHOLDS, AND WHY THEY ARE THESE NUMBERS ────────────────────────
-- Every one is a FUSE, not a budget — the same rule the daily-budget migration
-- states. It should be unreachable by healthy operation and reachable well
-- before anything is on fire. Measured baseline, 2026-08-30, six players:
-- database 34 MB, largest table 6.2 MB, 17/60 connections.
--
--   database size        warn  400 MB   critical  800 MB
--       Brackets the 500 MB Supabase free-tier ceiling from both sides, which is
--       the only ceiling that could bite silently. On a larger plan this fires
--       early rather than never; early is the correct direction for an alarm
--       that costs one deduped row per day. 12× today's size.
--   database growth/24h  warn   50 MB   critical  150 MB
--       b319 ran at ~57 MB/day, so warn catches that class on day one.
--   table size           warn   50 MB   critical  100 MB
--       The critical is EXACTLY the old game_events threshold, so §(c) is
--       subsumed rather than dropped — nothing that used to alarm stops
--       alarming.
--   table growth/24h     warn   25 MB
--   table rows/24h       warn  250,000  critical 1,000,000
--       b319 wrote ~460k rows/day. player_ledger writes ~600/day at six
--       players; 250k/day is ~400× that and still catches b319 on day one.
--   connections          warn  70% of max_connections   critical 85%
--       At 60 max that is 42 and 51. Measured today: 17.
--
-- Changing one of these is a one-line edit to a `constant` in §3 with a comment
-- saying what was measured. They are NOT read from a GUC on purpose: a threshold
-- an operator can set from a session is a threshold an incident can turn off.
--
-- ── WHAT IT COSTS (rule 6: journal aggregates, never per-tick) ────────────
--   ONE row per hour, ~1 KB (the top-10 table map), pruned at 30 days: ~720 rows
--   and well under 1 MB, forever, at any player count. The per-run work is one
--   pg_class scan (a few hundred rows), one pg_stat_all_tables read, one
--   pg_stat_activity count and one insert — the same order of magnitude as the
--   `pg_total_relation_size` call it replaces. Alerts are deduped per day per
--   class per object by `maintenance_alerts.ref`, so a table that is over the
--   fuse for a month costs 30 rows, not 720.
--
-- ── REVERSIBILITY ─────────────────────────────────────────────────────────
--   Re-apply 2026-08-11-telemetry-retention.sql (which create-or-replaces
--   hr_cron_health(interval) back to the old body — the signature the cron job
--   names never changed, so the job keeps working across the reversal), then
--     drop function if exists public.hr_cron_health_ex(interval, numeric);
--     drop function if exists public.hr_db_sample(int);
--     drop table    if exists public.hr_db_samples;
--   Nothing else is touched: no player table, no policy, no grant, no schedule.
-- ══════════════════════════════════════════════════════════════════════════


-- ── §0. FAIL CLOSED ────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.maintenance_alerts') is null
     or to_regclass('public.maintenance_log') is null then
    raise exception 'maintenance_alerts / maintenance_log are absent — apply '
                    '2026-08-11-telemetry-retention.sql first. Without them this '
                    'file would install a detector with nowhere to report.';
  end if;
  if to_regprocedure('public.hr_cron_health(interval)') is null then
    raise exception 'hr_cron_health(interval) is absent — apply '
                    '2026-08-11-telemetry-retention.sql first. This file REPLACES that '
                    'body; installing it standalone would leave the hourly cron job '
                    'calling a signature nobody scheduled.';
  end if;
end $$;


-- ── §1. THE SAMPLE TABLE — the memory a rate needs ────────────────────────
-- Operator-only, exactly like maintenance_log: RLS on, NO policy, and no grant
-- to any client role. A sample carries no player data (relation names and byte
-- counts), but "it is only telemetry" is how game_events ended up world-readable
-- in the first place.
create table if not exists public.hr_db_samples (
  at         timestamptz primary key default now(),
  db_bytes   bigint      not null,
  max_conns  int         not null default 0,
  used_conns int         not null default 0,
  -- {relname: {"b": total_bytes, "r": estimated_live_rows}} for the top-N by size.
  tables     jsonb       not null default '{}'::jsonb,
  -- The set of ACTIVE cron job names seen at this instant. `min(at) where jobs ?
  -- name` is what makes "known for more than 48 hours" answerable for a job that
  -- has NEVER produced a run row — cron.job has no created_at.
  jobs       jsonb       not null default '{}'::jsonb
);
alter table public.hr_db_samples enable row level security;
-- No policies on purpose: operator-only (service_role / SECURITY DEFINER).
revoke all on table public.hr_db_samples from anon, authenticated;


-- ── §2. TAKE ONE SAMPLE ───────────────────────────────────────────────────
-- Cheap by construction: estimates (pg_class / pg_stat_all_tables), never
-- count(*). An exact row count on the table this is watching is the one query
-- guaranteed to hurt when the table is already too big.
create or replace function public.hr_db_sample(p_top int default 10)
returns public.hr_db_samples
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_row public.hr_db_samples%rowtype;
  v_tables jsonb;
  v_jobs   jsonb := '{}'::jsonb;
begin
  select coalesce(jsonb_object_agg(t.relname, jsonb_build_object('b', t.bytes, 'r', t.rows)), '{}'::jsonb)
    into v_tables
  from (
    select c.relname::text as relname,
           pg_total_relation_size(c.oid) as bytes,
           coalesce(s.n_live_tup, 0)     as rows
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_all_tables s on s.relid = c.oid
     where n.nspname = 'public' and c.relkind in ('r', 'm', 'p')
     order by pg_total_relation_size(c.oid) desc
     limit greatest(1, coalesce(p_top, 10))
  ) t;

  -- pg_cron is not installed everywhere this chain replays (PGlite has a shim
  -- with no job_run_details, a fresh project has none at all). An absent
  -- scheduler must degrade to "no jobs observed", never to a failed sample.
  if to_regclass('cron.job') is not null then
    begin
      execute $q$select coalesce(jsonb_object_agg(j.jobname, true), '{}'::jsonb)
                   from cron.job j where j.active$q$ into v_jobs;
    exception when others then v_jobs := '{}'::jsonb;
    end;
  end if;

  insert into public.hr_db_samples (at, db_bytes, max_conns, used_conns, tables, jobs)
  values (
    now(),
    pg_database_size(current_database()),
    coalesce((select setting::int from pg_settings where name = 'max_connections'), 0),
    coalesce((select count(*)::int from pg_stat_activity), 0),
    v_tables,
    coalesce(v_jobs, '{}'::jsonb))
  -- One sample per instant. Two runs in the same microsecond is not a thing to
  -- fail a maintenance job over.
  on conflict (at) do update set db_bytes = excluded.db_bytes
  returning * into v_row;

  -- RETENTION, HERE, so the table cannot outlive its own usefulness the way
  -- game_events did. 30 days is ~720 rows; the rate window only needs 24 hours.
  delete from public.hr_db_samples where at < now() - interval '30 days';

  return v_row;
end;
$fn$;

-- Operator/cron only. A new SECURITY DEFINER function is anon-callable on
-- Supabase until it is revoked, and this one reads pg_stat_activity.
revoke execute on function public.hr_db_sample(int) from public;
revoke execute on function public.hr_db_sample(int) from anon, authenticated, service_role;


-- ── §3. THE DETECTOR ──────────────────────────────────────────────────────
-- (a) and (b) are carried over verbatim — they work, and rewriting a working
-- detector is how you lose one.
--
-- ⚠ WHY THERE ARE NOW TWO FUNCTIONS, AND WHY `p_scale` EXISTS.
--   b319's own migration says it plainly: "a policy that cannot fire is worse
--   than no policy, because the dashboard reads as covered." That applies to
--   this file's own alarms. A fuse set at 400 MB cannot be exercised by a test
--   against a 16 MB replay database, so without a seam every new arm here would
--   ship never having fired once — which is exactly the defect being fixed.
--   `p_scale` multiplies every byte/row/ratio fuse and is CLAMPED TO (0, 1], so
--   it can only ever make the detector MORE sensitive. It cannot raise a
--   threshold, cannot suppress an alert, and is reachable by no client role.
--
--   It lives on a SECOND function rather than as a second parameter of
--   hr_cron_health because adding a defaulted parameter would create the
--   overload `hr_cron_health(interval, numeric)` beside the existing
--   `hr_cron_health(interval)`, and the live cron command — `select
--   public.hr_cron_health()` — would then be AMBIGUOUS and the job would start
--   failing. Dropping the old signature to avoid that would silently reset its
--   ACL. A wrapper keeps the scheduled name, signature and ACL exactly where
--   they are.
create or replace function public.hr_cron_health_ex(
  p_window interval default interval '25 hours',
  p_scale  numeric  default 1.0)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  -- ── THE SENSITIVITY SEAM. Clamped to (0, 1] so it can only ever make an
  --    alarm fire SOONER. `least(1.0, …)` is the half that matters: without it
  --    this parameter would be an off switch.
  c_scale constant numeric := least(1.0, greatest(0.000000001, coalesce(p_scale, 1.0)));

  -- ── THE FUSES. See the file header for what each one was measured against.
  c_db_warn        constant bigint := (400 * 1024 * 1024 * c_scale)::bigint;
  c_db_crit        constant bigint := (800 * 1024 * 1024 * c_scale)::bigint;
  c_db_growth_warn constant bigint := ( 50 * 1024 * 1024 * c_scale)::bigint;   -- per 24h
  c_db_growth_crit constant bigint := (150 * 1024 * 1024 * c_scale)::bigint;
  c_tbl_warn       constant bigint := ( 50 * 1024 * 1024 * c_scale)::bigint;
  c_tbl_crit       constant bigint := (100 * 1024 * 1024 * c_scale)::bigint;   -- the old game_events threshold
  c_tbl_growth     constant bigint := ( 25 * 1024 * 1024 * c_scale)::bigint;   -- per 24h
  c_rows_warn      constant bigint := (    250000 * c_scale)::bigint;          -- per 24h
  c_rows_crit      constant bigint := (   1000000 * c_scale)::bigint;
  c_conn_warn      constant numeric := 0.70 * c_scale;
  c_conn_crit      constant numeric := 0.85 * c_scale;
  c_never_ran_grace constant interval := interval '48 hours';

  v_alerts int := 0;
  r record;
  v_sev text; v_msg text;
  v_now  public.hr_db_samples%rowtype;
  v_prev public.hr_db_samples%rowtype;
  v_day  text := to_char(now(), 'YYYY-MM-DD');
  v_bytes bigint; v_rows bigint; v_delta bigint;
  v_first timestamptz;
begin
  -- ── (a) FAILED RUNS. Unchanged. ────────────────────────────────────────
  if to_regclass('cron.job_run_details') is not null then
    for r in
      select d.runid, d.jobid, j.jobname, d.status, d.return_message, d.start_time
        from cron.job_run_details d left join cron.job j on j.jobid = d.jobid
       where d.status = 'failed' and d.start_time > now() - p_window
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

    -- ── (b) STOPPED vs NEVER STARTED, with (g) THE NEVER-RAN ESCALATION ──
    -- `any_run` is still the discriminator between the two. What is new is that
    -- "never ran" stops being a permanent excuse: once this database has SEEN
    -- the job for longer than the grace window (hr_db_samples.jobs is the only
    -- record of when — cron.job has no created_at), a job with no run history
    -- is not new, it is broken, and it escalates to 'warn' like any other.
    for r in
      select j.jobid, j.jobname,
             max(d.start_time) filter (where d.status = 'succeeded') as last_success,
             count(d.runid)                                          as any_run
        from cron.job j
        left join cron.job_run_details d on d.jobid = j.jobid
       where j.active group by j.jobid, j.jobname
      having coalesce(max(d.start_time) filter (where d.status = 'succeeded'),
                      'epoch'::timestamptz) < now() - interval '48 hours'
    loop
      if r.any_run = 0 then
        select min(s.at) into v_first from public.hr_db_samples s where s.jobs ? r.jobname;
        if v_first is not null and v_first < now() - c_never_ran_grace then
          v_sev := 'warn';
          v_msg := format('cron job %s has NEVER run, and has been scheduled since %s — '
                          'it is not new, it is not firing', r.jobname, v_first);
        else
          v_sev := 'info';
          v_msg := format('cron job %s has no run history yet (new, or it has never fired)', r.jobname);
        end if;
      else
        v_sev := 'warn';
        v_msg := format('cron job %s has not succeeded since %s', r.jobname,
                        coalesce(r.last_success::text, 'never'));
      end if;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('cron', 'cron-stale:' || r.jobname || ':' || v_day, v_sev, v_msg,
              jsonb_build_object('jobid', r.jobid, 'jobname', r.jobname,
                                 'last_success', r.last_success, 'runs_seen', r.any_run,
                                 'first_seen', v_first))
      on conflict (ref) do nothing;
      if found then
        v_alerts := v_alerts + 1;
        if v_sev = 'warn' then raise warning '[cron-health] %', v_msg; else raise notice '[cron-health] %', v_msg; end if;
      end if;
    end loop;
  else
    raise notice 'hr_cron_health: cron.job_run_details not readable — failure detection is INERT here';
  end if;

  -- ── THE SAMPLE. Taken BEFORE the size checks so this run's own numbers are
  --    the ones compared, and so a growth rate exists from the second run on.
  v_now := public.hr_db_sample(10);
  -- The nearest sample at least 24h old. `order by at desc limit 1` over an
  -- indexed primary key; NULL on a database younger than a day, which simply
  -- means no rate is reported yet (never a rate of "everything is new").
  select * into v_prev from public.hr_db_samples
   where at <= now() - interval '24 hours' order by at desc limit 1;

  -- ── (d) DATABASE SIZE AND GROWTH ───────────────────────────────────────
  if v_now.db_bytes > c_db_warn then
    v_sev := case when v_now.db_bytes > c_db_crit then 'critical' else 'warn' end;
    insert into public.maintenance_alerts (source, ref, severity, message, detail)
    values ('telemetry', 'db-size:' || v_day, v_sev,
            format('database is %s (fuse %s) — see the threshold table in 2026-09-03-cron-health-generalized.sql',
                   pg_size_pretty(v_now.db_bytes), pg_size_pretty(c_db_warn)),
            jsonb_build_object('bytes', v_now.db_bytes, 'warn', c_db_warn, 'crit', c_db_crit))
    on conflict (ref) do nothing;
    if found then v_alerts := v_alerts + 1;
      raise warning '[cron-health] database is %', pg_size_pretty(v_now.db_bytes); end if;
  end if;

  if v_prev.at is not null then
    v_delta := v_now.db_bytes - v_prev.db_bytes;
    if v_delta > c_db_growth_warn then
      v_sev := case when v_delta > c_db_growth_crit then 'critical' else 'warn' end;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('telemetry', 'db-growth:' || v_day, v_sev,
              format('database grew %s in 24h (now %s) — b319 ran at ~57 MB/day from six players',
                     pg_size_pretty(v_delta), pg_size_pretty(v_now.db_bytes)),
              jsonb_build_object('delta', v_delta, 'bytes', v_now.db_bytes,
                                 'since', v_prev.at, 'warn', c_db_growth_warn))
      on conflict (ref) do nothing;
      if found then v_alerts := v_alerts + 1;
        raise warning '[cron-health] database grew % in 24h', pg_size_pretty(v_delta); end if;
    end if;
  end if;

  -- ── (e) PER TABLE: SIZE, GROWTH, ROW DELTA ─────────────────────────────
  -- (c) — the old hardcoded game_events check — is exactly this loop's
  -- `c_tbl_crit` arm, at exactly the same 100 MB, for every table rather than
  -- for the one that already burned us.
  for r in select key as relname, value as v from jsonb_each(v_now.tables)
  loop
    v_bytes := coalesce((r.v ->> 'b')::bigint, 0);
    v_rows  := coalesce((r.v ->> 'r')::bigint, 0);

    if v_bytes > c_tbl_warn then
      v_sev := case when v_bytes > c_tbl_crit then 'critical' else 'warn' end;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('telemetry', 'table-size:' || r.relname || ':' || v_day, v_sev,
              format('public.%s is %s (%s rows) — retention is not keeping up (see b319)',
                     r.relname, pg_size_pretty(v_bytes), v_rows),
              jsonb_build_object('table', r.relname, 'bytes', v_bytes, 'rows', v_rows,
                                 'warn', c_tbl_warn, 'crit', c_tbl_crit))
      on conflict (ref) do nothing;
      if found then v_alerts := v_alerts + 1;
        raise warning '[cron-health] public.% is %', r.relname, pg_size_pretty(v_bytes); end if;
    end if;

    if v_prev.at is not null and v_prev.tables ? r.relname then
      v_delta := v_bytes - coalesce((v_prev.tables -> r.relname ->> 'b')::bigint, 0);
      if v_delta > c_tbl_growth then
        insert into public.maintenance_alerts (source, ref, severity, message, detail)
        values ('telemetry', 'table-growth:' || r.relname || ':' || v_day, 'warn',
                format('public.%s grew %s in 24h (now %s)', r.relname,
                       pg_size_pretty(v_delta), pg_size_pretty(v_bytes)),
                jsonb_build_object('table', r.relname, 'delta', v_delta, 'bytes', v_bytes,
                                   'since', v_prev.at, 'warn', c_tbl_growth))
        on conflict (ref) do nothing;
        if found then v_alerts := v_alerts + 1;
          raise warning '[cron-health] public.% grew % in 24h', r.relname, pg_size_pretty(v_delta); end if;
      end if;

      v_delta := v_rows - coalesce((v_prev.tables -> r.relname ->> 'r')::bigint, 0);
      if v_delta > c_rows_warn then
        v_sev := case when v_delta > c_rows_crit then 'critical' else 'warn' end;
        insert into public.maintenance_alerts (source, ref, severity, message, detail)
        values ('telemetry', 'table-rows:' || r.relname || ':' || v_day, v_sev,
                format('public.%s gained %s rows in 24h (now ~%s) — b319 wrote ~460k/day',
                       r.relname, v_delta, v_rows),
                jsonb_build_object('table', r.relname, 'row_delta', v_delta, 'rows', v_rows,
                                   'since', v_prev.at, 'warn', c_rows_warn))
        on conflict (ref) do nothing;
        if found then v_alerts := v_alerts + 1;
          raise warning '[cron-health] public.% gained % rows in 24h', r.relname, v_delta; end if;
      end if;
    end if;
  end loop;

  -- ── (f) CONNECTION HEADROOM ────────────────────────────────────────────
  -- The failure this watches for is TOTAL and takes the dashboard with it, so
  -- it alarms on the ratio rather than on a count: max_connections is a plan
  -- property and can change under us.
  if v_now.max_conns > 0
     and v_now.used_conns::numeric / v_now.max_conns::numeric > c_conn_warn then
    v_sev := case when v_now.used_conns::numeric / v_now.max_conns::numeric > c_conn_crit
                  then 'critical' else 'warn' end;
    insert into public.maintenance_alerts (source, ref, severity, message, detail)
    values ('telemetry', 'connections:' || v_day, v_sev,
            format('%s of %s connections in use (%s%%) — every Edge Function call must go '
                   'through the transaction pooler on 6543 (server-authority.md 2a-ii)',
                   v_now.used_conns, v_now.max_conns,
                   round(100.0 * v_now.used_conns / v_now.max_conns)),
            jsonb_build_object('used', v_now.used_conns, 'max', v_now.max_conns))
    on conflict (ref) do nothing;
    if found then v_alerts := v_alerts + 1;
      raise warning '[cron-health] % of % connections in use', v_now.used_conns, v_now.max_conns; end if;
  end if;

  -- ── RETENTION FOR THE DETECTOR'S OWN TABLES ────────────────────────────
  -- Nothing pruned these. 471 maintenance_log rows since 2026-08-11 is small,
  -- but "small and unbounded" is precisely what game_events was on day one, and
  -- a monitoring table that outgrows the thing it monitors is a bad joke.
  --
  -- 180 DAYS, AND THE NUMBER IS NOT MINE: docs/design/restore-runbook.md's
  -- retention audit already ruled on this gap — "one hr_maintenance_prune()
  -- retaining 180 days of maintenance_log and acked maintenance_alerts" — and a
  -- second author quietly picking 90 is how two policies for one table start.
  -- What DOES differ from that recommendation is the location: it lands inside
  -- the hourly detector rather than as a new function on a new cron slot,
  -- because it is two DELETEs against tables holding hundreds of rows and a
  -- scheduled job is a thing that can silently stop (which is check (b) of this
  -- very function). Same policy, one fewer moving part.
  --
  -- ⚠ ACKED ALERTS ONLY. An OPEN alert is never deleted by a timer — ageing out
  --   an alarm nobody has acknowledged is deleting the evidence of the thing you
  --   are watching for. bug_reports is deliberately untouched (player-reported
  --   evidence: curated, never aged out — the runbook's call, and it is right).
  delete from public.maintenance_log where ran_at < now() - interval '180 days';
  delete from public.maintenance_alerts
   where acked_at is not null and created_at < now() - interval '180 days';

  insert into public.maintenance_log (job, detail)
  values ('cron-health', jsonb_build_object(
    'alerts_raised', v_alerts, 'window', p_window::text,
    'db_bytes', v_now.db_bytes, 'conns', v_now.used_conns, 'max_conns', v_now.max_conns,
    'rate_window', v_prev.at,
    -- Recorded so a scaled PROBE run is never mistaken for a real one in the log.
    'scale', case when c_scale = 1.0 then null else c_scale end));
  return v_alerts;
end;
$fn$;

revoke execute on function public.hr_cron_health_ex(interval, numeric) from public;
revoke execute on function public.hr_cron_health_ex(interval, numeric) from anon, authenticated, service_role;

-- ── §3b. THE SCHEDULED NAME, UNCHANGED ────────────────────────────────────
-- Same name, same signature, same hourly cron command, same ACL. Its body is
-- now one line, which is the point: `select public.hr_cron_health()` — the
-- literal text in cron.job — keeps resolving to exactly one function and keeps
-- running at full sensitivity, because the wrapper never passes a scale.
create or replace function public.hr_cron_health(p_window interval default interval '25 hours')
returns int
language sql
security definer
set search_path = public, pg_catalog
as $fn$ select public.hr_cron_health_ex(p_window, 1.0) $fn$;

-- ⚠ ALL FOUR ROLES, restated. `create or replace` PRESERVES an ACL, so this is
--   not strictly required — and that is exactly why it is here: a restatement
--   that omits its revoke block silently keeps whatever was there, and this
--   function writes two maintenance tables.
revoke execute on function public.hr_cron_health(interval) from public;
revoke execute on function public.hr_cron_health(interval) from anon, authenticated, service_role;


-- ── §4. SELF-VERIFICATION ─────────────────────────────────────────────────
do $$
declare
  v_alerts int;
  v_n bigint;
  r record;
begin
  -- (1) IT RUNS, and it takes a sample. A detector that errors is a detector
  --     that is off, and the hourly job swallows nothing.
  select public.hr_cron_health() into v_alerts;
  select count(*) into v_n from public.hr_db_samples;
  if v_n < 1 then
    raise exception 'hr_cron_health ran but hr_db_samples is empty — the sample is the memory '
                    'every rate check depends on.';
  end if;
  if (select db_bytes from public.hr_db_samples order by at desc limit 1) <= 0 then
    raise exception 'the sample recorded a database size of 0 — pg_database_size is not readable here.';
  end if;

  -- (2) NEITHER FUNCTION REACHES A CLIENT. A NULL proacl is the DEFAULT acl,
  --     i.e. PUBLIC=EXECUTE, so "no acl" is the failure and not the pass.
  if has_function_privilege('anon', 'public.hr_db_sample(int)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_db_sample(int)', 'execute')
     or has_function_privilege('service_role', 'public.hr_db_sample(int)', 'execute') then
    raise exception 'hr_db_sample is executable by a client role';
  end if;
  if has_function_privilege('anon', 'public.hr_cron_health(interval)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_cron_health(interval)', 'execute')
     or has_function_privilege('service_role', 'public.hr_cron_health(interval)', 'execute')
     or has_function_privilege('anon', 'public.hr_cron_health_ex(interval,numeric)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_cron_health_ex(interval,numeric)', 'execute')
     or has_function_privilege('service_role', 'public.hr_cron_health_ex(interval,numeric)', 'execute') then
    raise exception 'hr_cron_health / hr_cron_health_ex is executable by a client role';
  end if;
  for r in
    select p.oid::regprocedure::text as fn, p.proacl as acl from pg_proc p
     where p.oid in ('public.hr_db_sample(int)'::regprocedure,
                     'public.hr_cron_health(interval)'::regprocedure,
                     'public.hr_cron_health_ex(interval,numeric)'::regprocedure)
  loop
    if r.acl is null then
      raise exception '% carries the DEFAULT acl, which grants EXECUTE to PUBLIC', r.fn;
    end if;
    if exists (select 1 from aclexplode(r.acl) a where a.grantee = 0) then
      raise exception '% still carries a PUBLIC execute grant (acl %)', r.fn, r.acl::text;
    end if;
  end loop;

  -- (3) THE SAMPLE TABLE IS NOT CLIENT-READABLE. It names every table in the
  --     database and how fast each is growing — an enumeration surface, and
  --     RLS with no policy is only half the answer if a grant exists.
  if not (select relrowsecurity from pg_class where oid = 'public.hr_db_samples'::regclass) then
    raise exception 'hr_db_samples does not have RLS enabled';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_db_samples') then
    raise exception 'hr_db_samples has a policy — it is operator-only and must have none';
  end if;
  if has_table_privilege('anon', 'public.hr_db_samples', 'select')
     or has_table_privilege('authenticated', 'public.hr_db_samples', 'select') then
    raise exception 'hr_db_samples is readable by a client role';
  end if;

  raise notice 'cron-health generalized: ran (% alert(s)), % sample(s), no client reach',
    v_alerts, v_n;
end $$;


-- ── §5. THE ALARMS CAN ACTUALLY FIRE — PROVEN, IN A ROLLED-BACK BLOCK ─────
-- b319's own migration: "a policy that cannot fire is worse than no policy,
-- because the dashboard reads as covered." So prove it here rather than trust
-- it, and prove it on the database this is being applied to.
--
-- Every write below is discarded: the block raises the HR822 sentinel and
-- catches it, which rolls the sub-transaction back. No probe alert survives.
do $$
declare
  v_before bigint; v_after bigint; v_db bigint;
begin
  begin
    v_db := pg_database_size(current_database());

    -- (1) A SCALE ABOVE 1 IS CLAMPED. If p_scale could RAISE a fuse it would be
    --     an off switch for the whole detector, which is the one thing it must
    --     never be. Only assertable while the database is under the real fuse —
    --     on a database that is genuinely over 400 MB the alert is correct and
    --     this half is skipped rather than made into a false failure.
    if v_db < 400 * 1024 * 1024 then
      select count(*) into v_before from public.maintenance_alerts where ref like 'db-size:%';
      perform public.hr_cron_health_ex(interval '25 hours', 1000000);
      select count(*) into v_after  from public.maintenance_alerts where ref like 'db-size:%';
      if v_after > v_before then
        raise exception 'p_scale > 1 RAISED a fuse — the clamp in c_scale is not holding, and the '
                        'sensitivity seam has become a way to switch the detector off.';
      end if;
    end if;

    -- (2) AND THE ARM FIRES. Same body, same database, a scale small enough that
    --     any non-empty database exceeds the size fuse. If this produces no
    --     alert the check is decoration.
    select count(*) into v_before from public.maintenance_alerts where ref like 'db-size:%';
    perform public.hr_cron_health_ex(interval '25 hours', 0.0000001);
    select count(*) into v_after  from public.maintenance_alerts where ref like 'db-size:%';
    if v_after <= v_before then
      raise exception 'the database-size alarm did not fire even at minimum fuse — this detector '
                      'cannot report the condition it exists for.';
    end if;

    raise exception using errcode = 'HR822', message = 'probe complete — rolling back';
  exception
    when sqlstate 'HR822' then
      raise notice 'cron-health: fuses proven (clamped above 1, firing at minimum), probe rolled back';
  end;
end $$;
