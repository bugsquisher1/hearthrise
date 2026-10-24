-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE HOURLY HEALTH JOB READS ONLY THE RUNS IT LOOKS AT
-- (cron jobid 18, hr-cron-health, '7 * * * *').
-- STAGED. Game CLOSED: applies on its passing §4. Moves no value; operational
-- telemetry only (no client role can execute the detector).
--
-- ── MEASURED (production, read-only, 2026-10-24 17:00-17:30 UTC) ─────────────
-- maintenance_log 'cron-health' phase_ms, the last 8 runs: total 2,886-3,666 ms,
-- of which a_failed 2,657-3,479 ms; b_stale ~55, sample ~110, retention ~19.
-- cron.job_run_details: 109,937 rows (7 days, 2027-01-01's prune), 16,790 in
-- the 25 h window, 3 failed; heap 68 MB = 8,729 pages (79 MB with its only
-- index, the runid pkey) for ~14 MB of live rows (avg 129 B): the space the
-- 494,738-row prune freed stays in the file. Owner supabase_admin, so no index
-- can be added by a migration.
-- (a)'s query is a Seq Scan of all 8,729 pages. Hot it takes 31 ms (EXPLAIN
-- ANALYZE, shared hit=8729); hourly it runs COLD (nothing else reads the old
-- pages; shared_buffers 256 MB), so the scan is ~68 MB of disk read at the
-- compute's throughput — the 3.5 s — and (b) then reads the same pages warm
-- (55 ms). The hourly read also spends the instance's disk throughput while
-- the 10 s world tick is settling hunts.
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_cron_health_ex  restated whole from 2027-01-01-server-perf.sql §3 (§0 pins
--                      that image, a217db06, = live) with three anchored edits:
--     1. v_run_lo: the newest run that started an hour before the longest
--        look-back (greatest(p_window, 48 h) + 1 h), by a backward walk of the
--        runid index (EXPLAIN on live: Index Scan Backward, 979 buffers,
--        10.9 ms hot). runid order is start order to within seconds (largest
--        start-before-a-lower-runid on live: 3.4 s over 110k runs), so every
--        run inside either look-back has a higher runid; §4 s2 re-proves that
--        on the live history at apply time. No such run = 0 = the whole table.
--     2. (a) failed runs: `d.runid > v_run_lo and` + the unchanged predicate
--        (Index Scan on the pkey, 889 buffers, 8.6 ms hot).
--     3. (b) stale jobs: an active job with no success in 48 h, found by NOT
--        EXISTS from v_run_lo up (Hash Anti Join over a pkey range scan, 893
--        buffers, 21 ms hot); only such a job — the alarm path, normally none
--        — reads its full history for last_success and runs_seen, so every
--        alert's text and detail are exactly what they were.
--     + the run's maintenance_log detail names cron_run_lo (after-apply check).
--   phase_ms keys, alert refs, severities, thresholds, the retention (h), the
--   signature, SECURITY DEFINER, search_path and the grants are unchanged.
-- EXPECTED AFTER: ~1,000 pages (8 MB, mostly the recent, hot ones) per run
-- instead of 8,729 cold; a_failed + b_stale ~40 ms hot. MEASURE: the next
-- runs' phase_ms (a_failed, b_stale) and cron.job_run_details end-start for
-- jobid 18; detail.cron_run_lo > 0.
-- ── COST (10x / 100x players) ────────────────────────────────────────────────
-- None: pg_cron's run history grows with jobs and their cadence, not players
-- (~16k runs/day). The read is now bounded by the look-back (~33k runs), not by
-- the history kept, so a longer retention would not slow it either.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None new. SECURITY DEFINER, revoked from public, anon, authenticated and
-- service_role (restated below); reads pg_cron's tables, writes only
-- maintenance_alerts / maintenance_log / hr_db_samples and prunes run history
-- older than 7 days exactly as before. No player row, no value.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the hr_cron_health_ex body from 2027-01-01-server-perf.sql §3 (and
-- its two revokes). Nothing else moves; no data to restore. ORDER: after
-- 2027-01-15-social-resolve-character-names.sql (independent of it). No
-- begin/commit (CLAUDE.md §2). No edge deploy.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.maintenance_alerts') is null or to_regclass('public.maintenance_log') is null
     or to_regclass('public.hr_db_samples') is null or to_regprocedure('public.hr_db_sample(integer)') is null
     or to_regclass('cron.job') is null then
    raise exception 'PRECONDITION: maintenance_alerts / maintenance_log / hr_db_samples / hr_db_sample / cron.job missing'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_cron_health_ex(interval,numeric)');
  -- a217db06… is 2027-01-01-server-perf.sql §3 (the replay chain and live, measured 2026-10-24);
  -- f5e680af912909c6a45d1401cbab3903 is this file's image (a re-apply).
  if v_md5 is distinct from 'a217db065aa65cf71aea1186f50f82f0' and v_md5 is distinct from 'f5e680af912909c6a45d1401cbab3903' then
    raise exception 'PIN: hr_cron_health_ex moved (md5 %): another file restated it; re-pin', v_md5; end if;
end $mig$;

-- ── §1 hr_cron_health_ex: (a) AND (b) READ FROM v_run_lo UP ─────────────────
create or replace function public.hr_cron_health_ex(p_window interval default '25:00:00'::interval, p_scale numeric default 1.0)
returns integer
language plpgsql security definer set search_path to 'public', 'pg_catalog' as $function$
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
  -- SERVER-PERF (2027-01-01-server-perf.sql): pg_cron's run history is kept this long (every check above
  -- reads at most 48 h of it) and pruned at most this many rows a run, by runid range (its only index).
  c_cron_keep      constant interval := interval '7 days';
  c_cron_prune_max constant bigint := 100000;

  v_alerts int := 0;
  r record;
  v_sev text; v_msg text;
  v_now  public.hr_db_samples%rowtype;
  v_prev public.hr_db_samples%rowtype;
  v_day  text := to_char(now(), 'YYYY-MM-DD');
  v_bytes bigint; v_rows bigint; v_delta bigint;
  v_first timestamptz;
  -- SERVER-PERF: every phase's wall time (ms) and the retention's count land in this run's maintenance_log row.
  v_t0 timestamptz := clock_timestamp();
  v_t  timestamptz := clock_timestamp();
  v_ph jsonb := '{}'::jsonb;
  v_lo bigint; v_hi bigint;
  v_pruned bigint := 0;
  v_prune_err text;
  -- CRON-HEALTH-FAST (2027-01-16-cron-health-fast.sql): (a) and (b) read the run history from this runid up.
  v_run_lo bigint;
  v_last_ok timestamptz;
  v_any bigint;
begin
  -- ── (a) FAILED RUNS ─────────────────────────────────────────────────────
  -- CRON-HEALTH-FAST (2027-01-16-cron-health-fast.sql): (a) and (b) look back at most the window or 48 h,
  -- so they read the run history from v_run_lo up through pg_cron's only index (runid) instead of
  -- seq-scanning all of it: after the 7-day prune the heap is still 68 MB (8,729 pages for 110k runs),
  -- read cold once an hour (a_failed 2.7-3.5 s of a 2.9-3.7 s run, 2026-10-24). v_run_lo is the newest
  -- run that STARTED an hour before the longest look-back. runid is pg_cron's insert order and a run
  -- starts within seconds of its insert (largest start-before-a-lower-runid 3.4 s over 110k runs,
  -- measured 2026-10-24), so every run that started inside the look-back has a higher runid. No run
  -- that old (a young history) = 0 = the whole table, as before.
  if to_regclass('cron.job_run_details') is not null then
    select max(d.runid) into v_run_lo from cron.job_run_details d
     where d.start_time <= now() - greatest(p_window, interval '48 hours') - interval '1 hour';
    v_run_lo := coalesce(v_run_lo, 0);
    for r in
      select d.runid, d.jobid, j.jobname, d.status, d.return_message, d.start_time
        from cron.job_run_details d left join cron.job j on j.jobid = d.jobid
       where d.runid > v_run_lo and d.status = 'failed' and d.start_time > now() - p_window
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
    v_ph := v_ph || jsonb_build_object('a_failed', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
    v_t := clock_timestamp();

    -- ── (b) STOPPED vs NEVER STARTED, with (g) THE NEVER-RAN ESCALATION ──
    -- `any_run` is still the discriminator between the two. What is new is that
    -- "never ran" stops being a permanent excuse: once this database has SEEN
    -- the job for longer than the grace window (hr_db_samples.jobs is the only
    -- record of when — cron.job has no created_at), a job with no run history
    -- is not new, it is broken, and it escalates to 'warn' like any other.
    -- CRON-HEALTH-FAST: an active job with no success in the last 48 h is found from v_run_lo up; only
    -- such a job (the alarm path, normally none) reads its whole history for last_success and runs_seen,
    -- so its alert says exactly what it said before.
    for r in
      select j.jobid, j.jobname
        from cron.job j
       where j.active
         and not exists (select 1 from cron.job_run_details d
                          where d.runid > v_run_lo and d.jobid = j.jobid and d.status = 'succeeded'
                            and d.start_time >= now() - interval '48 hours')
    loop
      select max(d.start_time) filter (where d.status = 'succeeded'), count(d.runid)
        into v_last_ok, v_any
        from cron.job_run_details d where d.jobid = r.jobid;
      if v_any = 0 then
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
                        coalesce(v_last_ok::text, 'never'));
      end if;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('cron', 'cron-stale:' || r.jobname || ':' || v_day, v_sev, v_msg,
              jsonb_build_object('jobid', r.jobid, 'jobname', r.jobname,
                                 'last_success', v_last_ok, 'runs_seen', v_any,
                                 'first_seen', v_first))
      on conflict (ref) do nothing;
      if found then
        v_alerts := v_alerts + 1;
        if v_sev = 'warn' then raise warning '[cron-health] %', v_msg; else raise notice '[cron-health] %', v_msg; end if;
      end if;
    end loop;
    v_ph := v_ph || jsonb_build_object('b_stale', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
    v_t := clock_timestamp();
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
  v_ph := v_ph || jsonb_build_object('sample', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
  v_t := clock_timestamp();

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
  v_ph := v_ph || jsonb_build_object('checks', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
  v_t := clock_timestamp();

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

  -- ── (h) THE SCHEDULER'S OWN RUN HISTORY (SERVER-PERF, 2027-01-01-server-perf.sql) ──
  -- pg_cron writes a row per run and prunes none: 494,460 rows / 79 MB since May (2026-10-24), every one
  -- of them seq-scanned by (a) and (b) every hour. Kept 7 days; deleted by runid range strictly below the
  -- oldest run that STARTED inside the window (runid is pg_cron's insert order and its only index), at most
  -- c_cron_prune_max a run. A new or running job's row is always above that floor. No run inside the window
  -- (the scheduler dead a week) = nothing pruned: the evidence stays. A failure here is an alert, never a
  -- failed detector.
  if to_regclass('cron.job_run_details') is not null then
    begin
      select min(d.runid) into v_lo from cron.job_run_details d;
      select d.runid into v_hi from cron.job_run_details d
       where d.start_time >= now() - c_cron_keep order by d.runid limit 1;
      if v_lo is not null and v_hi is not null and v_hi > v_lo then
        delete from cron.job_run_details d
         where d.runid >= v_lo and d.runid < least(v_hi, v_lo + c_cron_prune_max);
        get diagnostics v_pruned = row_count;
      end if;
    exception when insufficient_privilege then
      v_prune_err := left(sqlerrm, 300);
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('cron', 'cron-retention:' || v_day, 'warn',
              format('cron.job_run_details retention could not run (%s): the run history grows without '
                     'bound and this detector''s scans with it', v_prune_err),
              jsonb_build_object('error', v_prune_err, 'keep', c_cron_keep::text))
      on conflict (ref) do nothing;
      if found then v_alerts := v_alerts + 1;
        raise warning '[cron-health] cron.job_run_details retention could not run: %', v_prune_err; end if;
    end;
  end if;
  v_ph := v_ph || jsonb_build_object('retention', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int,
                                     'total', round(extract(epoch from clock_timestamp() - v_t0) * 1000)::int);

  insert into public.maintenance_log (job, detail)
  values ('cron-health', jsonb_build_object(
    'alerts_raised', v_alerts, 'window', p_window::text,
    'db_bytes', v_now.db_bytes, 'conns', v_now.used_conns, 'max_conns', v_now.max_conns,
    'rate_window', v_prev.at,
    -- Recorded so a scaled PROBE run is never mistaken for a real one in the log.
    'scale', case when c_scale = 1.0 then null else c_scale end,
    -- SERVER-PERF: where this run's time went, and what (h) pruned.
    'phase_ms', v_ph, 'cron_pruned', v_pruned, 'cron_prune_error', v_prune_err,
    -- CRON-HEALTH-FAST: the runid (a) and (b) read from (0 = the whole history).
    'cron_run_lo', v_run_lo));
  return v_alerts;
end;
$function$;
revoke execute on function public.hr_cron_health_ex(interval, numeric) from public;
revoke execute on function public.hr_cron_health_ex(interval, numeric) from anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- PROBE ROWS ONLY: run-history rows for probe jobids from 9116001 up (no pg_cron job has one) and, where
-- cron.job is writable (the PGlite replay's shim; on production it is not), probe jobs named hr-cronfast-*.
-- Where pg_cron's run history is ABSENT (the replay) a probe table with its real column shape is installed.
-- The sentinel rolls every row, alert, sample and log line back.
--   s0  no client role can execute the detector; SECURITY DEFINER and the search_path are unchanged
--   s1  ★ (a) a run that failed inside the window is raised; one that failed outside it is not; one that
--       started inside it but sits BELOW v_run_lo is not read — the scan is runid-bounded (the old full
--       scan raises it: the mutation proof)
--   s2  on the history this database holds, every run that started inside the 48 h look-back sits above
--       v_run_lo (the runid-order assumption, re-proved on production at apply time)
--   s3  ★ (b), where cron.job is writable: a job whose only success is older than 48 h and below v_run_lo
--       is raised with its FULL history (runs_seen 2, last_success that old run); one that succeeded 2 h
--       ago is not
--   s4  the run's maintenance_log row carries the complete phase_ms and the cron_run_lo it used; the body
--       landed as §0's post pin
do $$
declare
  c_job constant bigint := 9116001;
  v_env text := 'live';
  v_lo0 bigint; v_runlo bigint; v_f1 bigint; v_f2 bigint; v_f3 bigint; v_low bigint;
  v_ok bigint; v_stale bigint; v_old_ok timestamptz := now() - interval '3 days';
  v_n bigint; v_log jsonb; v_a jsonb; v_md5 text; v_jobs boolean := false;
begin
  -- ── s0: THE GRANTS AND THE SHAPE ─────────────────────────────────────────
  if has_function_privilege('anon', 'public.hr_cron_health_ex(interval,numeric)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.hr_cron_health_ex(interval,numeric)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.hr_cron_health_ex(interval,numeric)', 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where p.oid = 'public.hr_cron_health_ex(interval,numeric)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'cron-health-fast s0a: a client role can execute hr_cron_health_ex'; end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.hr_cron_health_ex(interval,numeric)'::regprocedure
                  and p.prosecdef and p.proconfig @> array['search_path=public, pg_catalog']) then
    raise exception 'cron-health-fast s0b: hr_cron_health_ex lost SECURITY DEFINER or its search_path'; end if;

  begin
    if to_regclass('cron.job_run_details') is null then
      create table cron.job_run_details (
        jobid bigint, runid bigserial primary key, job_pid integer, database text, username text, command text,
        status text, return_message text, start_time timestamptz, end_time timestamptz);
      -- an old history the bound lands in: 24 hourly runs of a probe job, 73-96 h old (runids 1000-1023)
      insert into cron.job_run_details (runid, jobid, status, return_message, start_time, end_time)
      select 1000 + g, c_job + 9, 'succeeded', '1 row', now() - interval '96 hours' + g * interval '1 hour',
             now() - interval '96 hours' + g * interval '1 hour'
        from generate_series(0, 23) g;
      perform setval(pg_get_serial_sequence('cron.job_run_details', 'runid'), 5000);
      v_env := 'probe';
    end if;
    select min(runid) into v_lo0 from cron.job_run_details;
    -- the bound the detector computes for a 25 h window: greatest(25 h, 48 h) + 1 h
    select coalesce(max(runid), 0) into v_runlo from cron.job_run_details where start_time <= now() - interval '49 hours';
    if v_lo0 is null or v_lo0 <= 2 or v_runlo = 0 then
      raise exception 'cron-health-fast s1-fixture: no run history below the bound (min runid %, bound %)', v_lo0, v_runlo; end if;
    -- Two free runids below the oldest run, neither ever alerted: the "started late, numbered early" rows.
    v_f3 := v_lo0 - 1;
    while exists (select 1 from cron.job_run_details where runid = v_f3)
       or exists (select 1 from public.maintenance_alerts where ref = 'cron-run:' || v_f3) loop v_f3 := v_f3 - 1; end loop;
    v_low := v_f3 - 1;
    while exists (select 1 from cron.job_run_details where runid = v_low) loop v_low := v_low - 1; end loop;
    if v_low < 1 then raise exception 'cron-health-fast s1-fixture: no free runid below %', v_lo0; end if;

    -- F1 failed 2 h ago, F2 failed 30 h ago (outside the window), both at pg_cron's next runids;
    -- F3 failed 1 h ago at a runid BELOW the bound.
    insert into cron.job_run_details (jobid, status, return_message, start_time, end_time)
      values (c_job, 'failed', 'cron-health-fast probe F1', now() - interval '2 hours', now() - interval '2 hours')
      returning runid into v_f1;
    insert into cron.job_run_details (jobid, status, return_message, start_time, end_time)
      values (c_job + 1, 'failed', 'cron-health-fast probe F2', now() - interval '30 hours', now() - interval '30 hours')
      returning runid into v_f2;
    insert into cron.job_run_details (runid, jobid, status, return_message, start_time, end_time)
      values (v_f3, c_job + 2, 'failed', 'cron-health-fast probe F3', now() - interval '1 hour', now() - interval '1 hour');
    if v_f1 <= v_runlo or v_f2 <= v_runlo or v_f3 >= v_runlo then
      raise exception 'cron-health-fast s1-fixture: probe runids % / % / % against the bound %', v_f1, v_f2, v_f3, v_runlo; end if;

    -- s3 fixture (b): two active probe jobs where cron.job takes rows (the replay's shim)
    if has_table_privilege(current_user, 'cron.job', 'INSERT') then
      v_jobs := true;
      insert into cron.job (jobname, schedule, command, active) values ('hr-cronfast-ok', '0 * * * *', 'select 1', true)
        returning jobid into v_ok;
      insert into cron.job (jobname, schedule, command, active) values ('hr-cronfast-stale', '0 * * * *', 'select 1', true)
        returning jobid into v_stale;
      insert into cron.job_run_details (jobid, status, return_message, start_time, end_time)
        values (v_ok, 'succeeded', '1 row', now() - interval '2 hours', now() - interval '2 hours');
      -- the stale job's only success: 3 days ago at a runid below the bound; its one later run failed 30 h ago
      insert into cron.job_run_details (runid, jobid, status, return_message, start_time, end_time)
        values (v_low, v_stale, 'succeeded', '1 row', v_old_ok, v_old_ok);
      insert into cron.job_run_details (jobid, status, return_message, start_time, end_time)
        values (v_stale, 'failed', 'cron-health-fast probe S', now() - interval '30 hours', now() - interval '30 hours');
    end if;

    -- ── s2: THE RUNID-ORDER ASSUMPTION, ON THE HISTORY THIS DATABASE HOLDS ──
    select count(*) into v_n from cron.job_run_details
     where start_time > now() - interval '48 hours' and runid <= v_runlo and runid <> v_f3 and runid <> v_low;
    if v_n > 0 then
      raise exception 'cron-health-fast s2: % run(s) started inside the 48 h look-back at or below v_run_lo %: runid is not start order here, the bounded scans would miss them', v_n, v_runlo; end if;

    perform public.hr_cron_health_ex(interval '25 hours', 1.0);

    -- ── s1: ★ (a) FAILED RUNS, RUNID-BOUNDED ───────────────────────────────
    if not exists (select 1 from public.maintenance_alerts where ref = 'cron-run:' || v_f1 and severity = 'critical'
                    and (detail->>'jobid')::bigint = c_job) then
      raise exception 'cron-health-fast s1a: a run that failed 2 h ago (runid %) raised no critical alert', v_f1; end if;
    if exists (select 1 from public.maintenance_alerts where ref = 'cron-run:' || v_f2) then
      raise exception 'cron-health-fast s1b: a run that failed 30 h ago (outside the 25 h window) raised an alert'; end if;
    if exists (select 1 from public.maintenance_alerts where ref = 'cron-run:' || v_f3) then
      raise exception 'cron-health-fast s1c: a run below v_run_lo (runid % < %) was read: the failed-run scan is not runid-bounded (it reads the whole history)', v_f3, v_runlo; end if;

    -- ── s3: ★ (b) STALE JOBS, FULL HISTORY ON THE ALARM PATH ───────────────
    if v_jobs then
      select detail into v_a from public.maintenance_alerts
       where ref = 'cron-stale:hr-cronfast-stale:' || to_char(now(), 'YYYY-MM-DD') and severity = 'warn';
      if v_a is null then raise exception 'cron-health-fast s3a: a job with no success in 48 h raised no warn alert'; end if;
      if (v_a->>'runs_seen')::bigint is distinct from 2 or (v_a->>'last_success')::timestamptz is distinct from v_old_ok then
        raise exception 'cron-health-fast s3b: the stale alert read only the bounded history (runs_seen %, last_success %; want 2, %)',
          v_a->>'runs_seen', v_a->>'last_success', v_old_ok; end if;
      if exists (select 1 from public.maintenance_alerts where ref like 'cron-stale:hr-cronfast-ok:%') then
        raise exception 'cron-health-fast s3c: a job that succeeded 2 h ago was raised as stale'; end if;
    end if;

    -- ── s4: THE LOG AND THE PIN ───────────────────────────────────────────────
    select detail into v_log from public.maintenance_log where job = 'cron-health' order by id desc limit 1;
    if v_log is null or jsonb_typeof(v_log->'phase_ms') is distinct from 'object'
       or not (v_log->'phase_ms' ?& array['a_failed', 'b_stale', 'sample', 'checks', 'retention', 'total']) then
      raise exception 'cron-health-fast s4a: the run''s maintenance_log row carries no complete phase_ms (got %)', v_log->'phase_ms'; end if;
    if (v_log->>'cron_run_lo')::bigint is distinct from v_runlo then
      raise exception 'cron-health-fast s4b: the run logged cron_run_lo %, the bound is %', v_log->>'cron_run_lo', v_runlo; end if;
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_cron_health_ex(interval,numeric)');
    if v_md5 is distinct from 'f5e680af912909c6a45d1401cbab3903' then
      raise exception 'cron-health-fast s4c: hr_cron_health_ex landed as %, not this file''s f5e680af912909c6a45d1401cbab3903', v_md5; end if;

    raise exception 'hr0116-selfcheck-ok';
  exception when others then
    if sqlerrm <> 'hr0116-selfcheck-ok' then raise; end if;
  end;
  raise notice 'cron-health-fast: self-check passed (cron history %), every probe rolled back', v_env;
end $$;
