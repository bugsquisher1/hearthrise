-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE HOURLY HEALTH JOB READS ONLY THE RUNS IT LOOKS AT
-- (cron jobid 18, hr-cron-health, '7 * * * *').
-- STAGED. Game CLOSED: applies on its passing §4. Moves no value; operational
-- telemetry only (no client role can execute the detector or its readers).
--
-- ── MEASURED (production, read-only, 2026-10-24 17:00-18:30 UTC) ─────────────
-- maintenance_log 'cron-health' phase_ms, the last 8 runs: total 2,886-3,666 ms,
-- of which a_failed 2,657-3,479 ms; b_stale ~55, sample ~110, retention ~19.
-- cron.job_run_details: 109,937 rows (7 days, 2027-01-01's prune), 16,790 in
-- the 25 h window, 3 failed; heap 68 MB = 8,729 pages (79 MB with its only
-- index, the runid pkey) for ~14 MB of live rows (avg 129 B): the space the
-- 494,738-row prune freed stays in the file. Owner supabase_admin, so no index
-- can be added by a migration, and the apply role cannot write it (below).
-- (a)'s query is a Seq Scan of all 8,729 pages. Warm it takes 31 ms (EXPLAIN
-- ANALYZE, shared hit=8729); hourly it runs COLD (nothing else reads the old
-- pages; shared_buffers 256 MB), so the scan is ~68 MB of disk read — the
-- 3.5 s — and (b) then reads the same pages warm (55 ms). The hourly read also
-- spends the instance's disk throughput while the 10 s world tick settles hunts.
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_cron_run_floor    NEW reader: the newest run that STARTED at least
--                        greatest(window, 48 h) + 1 h ago, by a backward walk
--                        of the runid index (EXPLAIN on live: Index Scan
--                        Backward, 980 buffers). runid order is start order to
--                        within seconds (largest start-before-a-lower-runid on
--                        live: 3.4 s over 110k runs), so every run inside either
--                        look-back has a higher runid; §4 s2 re-proves that on
--                        the live history at apply time. No such run = 0.
--   hr_cron_failed_runs  NEW reader: (a)'s rows, `runid > floor and` + the
--                        unchanged predicate (Index Scan on the pkey, 889
--                        buffers, 8.6 ms warm).
--   hr_cron_stale_jobs   NEW reader: (b)'s rows — an active job with no success
--                        in 48 h, found by NOT EXISTS from the floor up (Hash
--                        Anti Join over a pkey range scan, 893 buffers); only
--                        such a job (the alarm path; none on live, 23 active
--                        jobs all succeeded within 24 h) reads its full history
--                        for last_success and any_run, in a MATERIALIZED step
--                        so it never runs for a healthy job (EXPLAIN: "never
--                        executed"). So every alert's text and detail are what
--                        they were.
--   hr_cron_health_ex    restated whole from 2027-01-01-server-perf.sql §3 (§0
--                        pins that image, a217db06, = live); (a) and (b) loop
--                        over the readers on pg_cron's tables; the run's
--                        maintenance_log detail names cron_run_lo.
--   The readers take the run and job tables as regclass arguments so §4 can
--   prove them on its own TEMP probe tables: the first apply (2026-10-24) was
--   refused at §4 by 42501 "permission denied for sequence runid_seq" — the
--   apply role cannot write pg_cron's tables, and a self-check must not.
--   tests/selfcheck-no-global-dml.mjs now refuses any INSERT / UPDATE / DELETE
--   on cron.* that a self-check block executes.
--   phase_ms keys, alert refs, severities, thresholds, the retention (h), the
--   signature, SECURITY DEFINER, search_path and the grants are unchanged.
-- EXPECTED AFTER: ~1,000 pages (8 MB, mostly the recent, warm ones) per run
-- instead of 8,729 cold. MEASURE: the next runs' phase_ms (a_failed, b_stale),
-- cron.job_run_details end-start for jobid 18, detail.cron_run_lo > 0.
-- ── COST (10x / 100x players) ────────────────────────────────────────────────
-- None: pg_cron's run history grows with jobs and their cadence, not players
-- (~16k runs/day). The read is now bounded by the look-back (~33k runs), not by
-- the history kept, so a longer retention would not slow it either.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None new. The detector stays SECURITY DEFINER; the three readers are
-- SECURITY INVOKER, stable, read-only, and revoked from public, anon,
-- authenticated and service_role like the detector, so only their owner (the
-- detector's) runs them. Their regclass arguments are formatted with %s, which
-- quotes and qualifies a relation name; no text reaches the SQL. No player
-- row, no value.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the hr_cron_health_ex body from 2027-01-01-server-perf.sql §3 (and
-- its two revokes); the three readers may stay (nothing else calls them) or be
-- dropped. No data to restore. ORDER: after the APPLIED
-- 2027-01-17-social-pass.sql (independent of it: no shared object). No
-- begin/commit (CLAUDE.md §2). No edge deploy.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regclass('public.maintenance_alerts') is null or to_regclass('public.maintenance_log') is null
     or to_regclass('public.hr_db_samples') is null or to_regprocedure('public.hr_db_sample(integer)') is null
     or to_regclass('cron.job') is null then
    raise exception 'PRECONDITION: maintenance_alerts / maintenance_log / hr_db_samples / hr_db_sample / cron.job missing'; end if;
  -- The detector is 2027-01-01-server-perf.sql §3's image (a217db06…, the replay chain and live,
  -- measured 2026-10-24) or this file's; each reader is absent (a first apply) or this file's.
  for r in select * from (values
    ('public.hr_cron_health_ex(interval,numeric)', 'a217db065aa65cf71aea1186f50f82f0', '1bffd34fa30b95ec4b07f531516eb62c'),
    ('public.hr_cron_run_floor(regclass,interval)', null, '5962edaa7f82a382ecde20a292301e73'),
    ('public.hr_cron_failed_runs(regclass,regclass,bigint,interval)', null, '3c18cb3143d6eee13051d6be807e3dbb'),
    ('public.hr_cron_stale_jobs(regclass,regclass,bigint)', null, '3e8f30f10e46bdb2bb6ceb0537e4af4e')
  ) p(sig, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is % (want % or this file''s %): another file moved it; re-pin',
        r.sig, coalesce(v_md5, 'absent'), coalesce(left(r.pre, 8), 'absent'), left(r.post, 8); end if;
  end loop;
end $mig$;

-- ── §1 THE THREE READERS (internal: no client role, invoker, read-only) ──────
create or replace function public.hr_cron_run_floor(p_runs regclass, p_window interval)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $function$
declare v bigint;
begin
  -- The newest run that STARTED at least an hour before the longer look-back ((a)'s window, (b)'s 48 h):
  -- every run that started inside either has a higher runid (pg_cron numbers a run as it starts it).
  -- max() over the pkey with this filter is a backward index walk that stops at the first match.
  execute format('select max(d.runid) from %s d where d.start_time <= now() - greatest($1, interval ''48 hours'') - interval ''1 hour''', p_runs)
    into v using p_window;
  return coalesce(v, 0);
end $function$;

create or replace function public.hr_cron_failed_runs(p_runs regclass, p_jobs regclass, p_lo bigint, p_window interval)
returns table (runid bigint, jobid bigint, jobname text, status text, return_message text, start_time timestamptz)
language plpgsql stable set search_path = public, pg_catalog as $function$
begin
  -- (a): the runs that FAILED inside the window, read from the floor up.
  return query execute format(
    'select d.runid::bigint, d.jobid::bigint, j.jobname::text, d.status::text, d.return_message::text, d.start_time
       from %s d left join %s j on j.jobid = d.jobid
      where d.runid > $1 and d.status = ''failed'' and d.start_time > now() - $2', p_runs, p_jobs)
    using p_lo, p_window;
end $function$;

create or replace function public.hr_cron_stale_jobs(p_runs regclass, p_jobs regclass, p_lo bigint)
returns table (jobid bigint, jobname text, last_success timestamptz, any_run bigint)
language plpgsql stable set search_path = public, pg_catalog as $function$
begin
  -- (b): an active job with no success in 48 h (from the floor up), then — for those jobs alone, the
  -- MATERIALIZED step runs first — its whole history: the last success ever and how many runs it has.
  return query execute format(
    'with flagged as materialized (
       select j.jobid, j.jobname from %1$s j
        where j.active
          and not exists (select 1 from %2$s d
                           where d.runid > $1 and d.jobid = j.jobid and d.status = ''succeeded''
                             and d.start_time >= now() - interval ''48 hours''))
     select f.jobid::bigint, f.jobname::text, h.last_success, h.any_run
       from flagged f
       cross join lateral (select max(d.start_time) filter (where d.status = ''succeeded'') as last_success,
                                  count(d.runid)::bigint as any_run
                             from %2$s d where d.jobid = f.jobid) h', p_jobs, p_runs)
    using p_lo;
end $function$;

revoke execute on function public.hr_cron_run_floor(regclass, interval) from public, anon, authenticated, service_role;
revoke execute on function public.hr_cron_failed_runs(regclass, regclass, bigint, interval) from public, anon, authenticated, service_role;
revoke execute on function public.hr_cron_stale_jobs(regclass, regclass, bigint) from public, anon, authenticated, service_role;

-- ── §2 hr_cron_health_ex: (a) AND (b) READ FROM THE FLOOR UP ─────────────────
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
begin
  -- ── (a) FAILED RUNS ─────────────────────────────────────────────────────
  -- CRON-HEALTH-FAST (2027-01-16-cron-health-fast.sql): (a) and (b) are read by hr_cron_failed_runs and
  -- hr_cron_stale_jobs from v_run_lo (hr_cron_run_floor) up, through pg_cron's only index (runid),
  -- instead of a seq scan of the whole history: after the 7-day prune the heap is still 68 MB (8,729
  -- pages for 110k runs), read cold once an hour (a_failed 2.7-3.5 s of a 2.9-3.7 s run, 2026-10-24).
  -- The readers take the two tables as arguments only so §4 can prove them on its own probe tables
  -- without writing pg_cron's (supabase_admin's); here they are always pg_cron's.
  if to_regclass('cron.job_run_details') is not null then
    v_run_lo := public.hr_cron_run_floor(to_regclass('cron.job_run_details'), p_window);
    for r in
      select * from public.hr_cron_failed_runs(to_regclass('cron.job_run_details'), to_regclass('cron.job'), v_run_lo, p_window)
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
    -- CRON-HEALTH-FAST: the same rows as the old group-by (an active job with no success in 48 h, its
    -- whole-history last_success and run count), found from v_run_lo up (hr_cron_stale_jobs).
    for r in
      select * from public.hr_cron_stale_jobs(to_regclass('cron.job_run_details'), to_regclass('cron.job'), v_run_lo)
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
    -- CRON-HEALTH-FAST: the runid (a) and (b) read from (0 = the whole history; null = no run history here).
    'cron_run_lo', v_run_lo));
  return v_alerts;
end;
$function$;
revoke execute on function public.hr_cron_health_ex(interval, numeric) from public;
revoke execute on function public.hr_cron_health_ex(interval, numeric) from anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- NOTHING IN cron.* IS WRITTEN, here or on production: the readers are proved on two session TEMP
-- tables in pg_cron's column shape; pg_cron's own history is only READ (s2, s4). The sentinel rolls the
-- temp tables, the detector's alert / sample / log rows and its retention back.
--   s0  no client role can execute the detector or a reader; the detector is SECURITY DEFINER, the
--       readers invoker and stable, all with the pinned search_path
--   s1  ★ (a) on the probe history: the floor is the newest run 49 h old or more; the failed runs read
--       are exactly the one inside the window — not the one outside it, and not the one that started
--       inside it but sits BELOW the floor (the scan is runid-bounded: the old full scan returns it);
--       a history with nothing that old has floor 0 (the whole table)
--   s2  on the history this database holds, every run that started inside the 48 h look-back sits
--       above its floor (the runid-order assumption, re-proved on production at apply time, read-only)
--   s3  ★ (b) on the probe history: exactly the active jobs with no success in 48 h, each with its FULL
--       history (a success 3 days old below the floor counts: any_run 2, last_success that run); a job
--       that succeeded 2 h ago and an inactive one are not
--   s4  the detector end to end: its maintenance_log row carries the complete phase_ms (a_failed and
--       b_stale where pg_cron's history exists) and the floor it used (s2's, or null where there is no
--       history); on that history every failed run its reader returns holds an alert; every body
--       landed as §0's post pin
do $$
declare
  v_env text := 'no run history';
  v_lo bigint; v_real_lo bigint; v_n bigint; v_ids bigint[]; v_txt text; v_log jsonb;
  v_old_ok timestamptz := now() - interval '3 days';
begin
  -- ── s0: THE GRANTS AND THE SHAPE ─────────────────────────────────────────
  select string_agg(f, ', ') into v_txt from (values ('public.hr_cron_health_ex(interval,numeric)'),
    ('public.hr_cron_run_floor(regclass,interval)'), ('public.hr_cron_failed_runs(regclass,regclass,bigint,interval)'),
    ('public.hr_cron_stale_jobs(regclass,regclass,bigint)')) v(f)
   where has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
      or has_function_privilege('service_role', f, 'EXECUTE')
      or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where p.oid = to_regprocedure(f) and a.grantee = 0 and a.privilege_type = 'EXECUTE');
  if v_txt is not null then raise exception 'cron-health-fast s0a: a client role can execute %', v_txt; end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.hr_cron_health_ex(interval,numeric)'::regprocedure
                  and p.prosecdef and p.proconfig @> array['search_path=public, pg_catalog']) then
    raise exception 'cron-health-fast s0b: hr_cron_health_ex lost SECURITY DEFINER or its search_path'; end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt from pg_proc p
   where p.oid in ('public.hr_cron_run_floor(regclass,interval)'::regprocedure,
                   'public.hr_cron_failed_runs(regclass,regclass,bigint,interval)'::regprocedure,
                   'public.hr_cron_stale_jobs(regclass,regclass,bigint)'::regprocedure)
     and (p.prosecdef or p.provolatile <> 's' or not (p.proconfig @> array['search_path=public, pg_catalog']));
  if v_txt is not null then raise exception 'cron-health-fast s0c: % is not an invoker, stable reader with the pinned search_path', v_txt; end if;

  begin
    -- ── THE PROBE HISTORY: session temp tables in pg_cron's column shape ──
    create temp table hr_cf_runs (jobid bigint, runid bigint primary key, job_pid integer, database text, username text,
      command text, status text, return_message text, start_time timestamptz, end_time timestamptz);
    create temp table hr_cf_jobs (jobid bigint primary key, jobname text, schedule text, command text, active boolean not null);
    insert into hr_cf_jobs (jobid, jobname, schedule, command, active) values
      (1, 'cf-old', '0 * * * *', 'select 1', false),    -- inactive: its failures still count for (a), never stale for (b)
      (2, 'cf-ok', '0 * * * *', 'select 1', true),      -- succeeded 2 h ago
      (3, 'cf-stale', '0 * * * *', 'select 1', true),   -- its only success 3 days ago, numbered below the floor; failed 30 h ago
      (4, 'cf-never', '0 * * * *', 'select 1', true);   -- active, no run at all
    -- the old history the floor lands in: 24 hourly successes of job 1, 73-96 h old (runids 1000-1023)
    insert into hr_cf_runs (runid, jobid, status, return_message, start_time, end_time)
    select 1000 + g, 1, 'succeeded', '1 row', now() - interval '96 hours' + g * interval '1 hour',
           now() - interval '96 hours' + g * interval '1 hour'
      from generate_series(0, 23) g;
    insert into hr_cf_runs (runid, jobid, status, return_message, start_time, end_time) values
      (5001, 1, 'failed', 'F1', now() - interval '2 hours', now() - interval '2 hours'),     -- inside the 25 h window
      (5002, 1, 'failed', 'F2', now() - interval '30 hours', now() - interval '30 hours'),   -- outside it
      (999, 1, 'failed', 'F3', now() - interval '1 hour', now() - interval '1 hour'),        -- inside it, numbered BELOW the floor
      (5003, 2, 'succeeded', '1 row', now() - interval '2 hours', now() - interval '2 hours'),
      (998, 3, 'succeeded', '1 row', v_old_ok, v_old_ok),
      (5004, 3, 'failed', 'S', now() - interval '30 hours', now() - interval '30 hours');

    -- ── s1: ★ (a) FAILED RUNS, FROM THE FLOOR UP ────────────────────────────
    v_lo := public.hr_cron_run_floor('hr_cf_runs'::regclass, interval '25 hours');
    if v_lo is distinct from 1023 then
      raise exception 'cron-health-fast s1a: the floor is % (want 1023, the newest run that started 49 h ago or more)', v_lo; end if;
    select array_agg(f.runid order by f.runid) into v_ids
      from public.hr_cron_failed_runs('hr_cf_runs'::regclass, 'hr_cf_jobs'::regclass, v_lo, interval '25 hours') f;
    if v_ids is distinct from array[5001]::bigint[] then
      raise exception 'cron-health-fast s1b: the failed runs read are % (want {5001}; 5002 failed outside the window, 999 sits below the floor: a reader that returns it scans the whole history)', v_ids; end if;
    if (select f.jobname from public.hr_cron_failed_runs('hr_cf_runs'::regclass, 'hr_cf_jobs'::regclass, v_lo, interval '25 hours') f)
       is distinct from 'cf-old' then
      raise exception 'cron-health-fast s1c: the failed run lost its job''s name'; end if;

    -- ── s3: ★ (b) STALE JOBS, WITH THEIR FULL HISTORY ───────────────────────
    select string_agg(s.jobname || ':' || s.any_run || ':' || coalesce(s.last_success::text, 'never'), ', ' order by s.jobname) into v_txt
      from public.hr_cron_stale_jobs('hr_cf_runs'::regclass, 'hr_cf_jobs'::regclass, v_lo) s;
    if (select count(*) from public.hr_cron_stale_jobs('hr_cf_runs'::regclass, 'hr_cf_jobs'::regclass, v_lo)) <> 2
       or not exists (select 1 from public.hr_cron_stale_jobs('hr_cf_runs'::regclass, 'hr_cf_jobs'::regclass, v_lo) s
                       where s.jobname = 'cf-never' and s.any_run = 0 and s.last_success is null)
       or not exists (select 1 from public.hr_cron_stale_jobs('hr_cf_runs'::regclass, 'hr_cf_jobs'::regclass, v_lo) s
                       where s.jobname = 'cf-stale' and s.any_run = 2 and s.last_success = v_old_ok) then
      raise exception 'cron-health-fast s3: the stale jobs are [%] (want cf-never with 0 runs and cf-stale with 2 runs, last success %: only the stale jobs, each with its FULL history)', v_txt, v_old_ok; end if;

    -- s1d: a history with nothing 49 h old has floor 0, so the readers read the whole table
    delete from hr_cf_runs where start_time <= now() - interval '49 hours';
    if public.hr_cron_run_floor('hr_cf_runs'::regclass, interval '25 hours') is distinct from 0 then
      raise exception 'cron-health-fast s1d: a history with no run 49 h old has floor % (want 0: the whole table)',
        public.hr_cron_run_floor('hr_cf_runs'::regclass, interval '25 hours'); end if;

    -- ── s2: THE RUNID-ORDER ASSUMPTION, ON THE HISTORY THIS DATABASE HOLDS (read-only) ──
    if to_regclass('cron.job_run_details') is not null then
      v_env := 'pg_cron history';
      v_real_lo := public.hr_cron_run_floor(to_regclass('cron.job_run_details'), interval '25 hours');
      select count(*) into v_n from cron.job_run_details where start_time > now() - interval '48 hours' and runid <= v_real_lo;
      if v_n > 0 then
        raise exception 'cron-health-fast s2: % run(s) started inside the 48 h look-back at or below the floor %: runid is not start order here, the bounded reads would miss them', v_n, v_real_lo; end if;
    end if;

    -- ── s4: THE DETECTOR END TO END, AND THE PINS ─────────────────────────────
    perform public.hr_cron_health_ex(interval '25 hours', 1.0);
    select detail into v_log from public.maintenance_log where job = 'cron-health' order by id desc limit 1;
    -- (a) and (b) are timed where pg_cron's history exists (production); without it (the replay) the
    -- detector skips them, as it always has.
    if v_log is null or jsonb_typeof(v_log->'phase_ms') is distinct from 'object'
       or not (v_log->'phase_ms' ?& array['sample', 'checks', 'retention', 'total'])
       or (v_real_lo is not null and not (v_log->'phase_ms' ?& array['a_failed', 'b_stale'])) then
      raise exception 'cron-health-fast s4a: the run''s maintenance_log row carries no complete phase_ms (got %)', v_log->'phase_ms'; end if;
    if (v_log->>'cron_run_lo')::bigint is distinct from v_real_lo then
      raise exception 'cron-health-fast s4b: the run logged cron_run_lo %, the floor is %', v_log->>'cron_run_lo', v_real_lo; end if;
    -- the detector raised (or already held) an alert for every failed run its reader returns on pg_cron's history
    if v_real_lo is not null and exists (
         select 1 from public.hr_cron_failed_runs(to_regclass('cron.job_run_details'), to_regclass('cron.job'), v_real_lo, interval '25 hours') f
          where not exists (select 1 from public.maintenance_alerts a where a.ref = 'cron-run:' || f.runid)) then
      raise exception 'cron-health-fast s4d: a run that failed inside the window has no alert after the detector ran'; end if;
    select string_agg(p.sig || ' landed as ' || coalesce(md5(replace(x.prosrc, chr(13), '')), 'nothing'), '; ') into v_txt
      from (values ('public.hr_cron_health_ex(interval,numeric)', '1bffd34fa30b95ec4b07f531516eb62c'),
                   ('public.hr_cron_run_floor(regclass,interval)', '5962edaa7f82a382ecde20a292301e73'),
                   ('public.hr_cron_failed_runs(regclass,regclass,bigint,interval)', '3c18cb3143d6eee13051d6be807e3dbb'),
                   ('public.hr_cron_stale_jobs(regclass,regclass,bigint)', '3e8f30f10e46bdb2bb6ceb0537e4af4e')) p(sig, post)
      left join pg_proc x on x.oid = to_regprocedure(p.sig)
     where md5(replace(x.prosrc, chr(13), '')) is distinct from p.post;
    if v_txt is not null then raise exception 'cron-health-fast s4c: not this file''s image: %', v_txt; end if;

    raise exception 'hr0116-selfcheck-ok';
  exception when others then
    if sqlerrm <> 'hr0116-selfcheck-ok' then raise; end if;
  end;
  raise notice 'cron-health-fast: self-check passed (%), every probe rolled back, nothing in cron.* written', v_env;
end $$;
