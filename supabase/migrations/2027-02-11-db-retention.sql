-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-11-db-retention.sql — WHAT THE DATABASE KEEPS THAT NOBODY READS, CUT DOWN
--   (lane/c-beta-capacity, reliability-engineer, 2026-10-31).
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside
-- begin/commit, never 00:00-00:10 UTC). No money surface, no player row, no client RPC.
-- EDGE: none. CLIENT: none.
--
-- ── MEASURED ON PRODUCTION, 2026-10-31 03:41-03:53 UTC (834 MB) ─────────────
--   table                     MB   grows with       kept today           after this file
--   realtime.messages        377   watched players  ~3-4 days (Realtime) 1 hour (frames only)
--   net._http_response       202   flat             6 h, vacuumed hourly unchanged (see below)
--   player_ledger            124   players, 90 d    the §6 journal       unchanged
--   cron.job_run_details      83   flat             7 days               3 days
--   hr_tick_cron_log          29   flat             7 days               3 days
-- `realtime.messages` is the largest and the only one here that grows with players, and it is
-- 45 % of the database: each viewed hero's frame stores ~29 KB (67 KB of JSON, TOASTed). Realtime
-- reads the WAL, never the table: once sent, the row is a dead copy of a fact player_state holds.
-- It sits on disk until Realtime's own janitor (72 h + partition age; partitions 10-28..10-31
-- present). At 40 players x 600 frames/h x 4.5 h a day that is ~11 GB, past the 8 GB disk.
--
-- ── WHAT POSTGRES MAY TOUCH (checked before staging, has_table_privilege + pg_roles) ──
--   realtime.messages (and its partitions): owner supabase_realtime_admin; postgres holds DELETE and
--     MAINTAIN; postgres has BYPASSRLS. Realtime deletes its own aged rows the same way (the 10-28
--     partition: n_tup_ins 2,050, 1,202 live), so a DELETE there is already what happens to these rows.
--   cron.job_run_details: owner supabase_admin; postgres holds DELETE (hr_cron_health_ex's (h) has pruned
--     it hourly since 2027-01-01).
--   net._http_response: owner supabase_admin; postgres holds DELETE and MAINTAIN. pg_net.ttl is a sighup
--     GUC postgres cannot set, so a shorter TTL would be a job of our own, and it is NOT needed:
--     2027-02-10-pg-net-vacuum.sql IS keeping up. Heap 208,781,312 B (10-30 02:27) -> 208,887,808 B
--     (10-31 03:41): +106 KB over ~8,600 requests, 20 of 20 runs `VACUUM`, last_vacuum under 1 h old.
--
-- ── WHAT IT DOES ────────────────────────────────────────────────────────────
-- §1 hr_realtime_frame_prune(p_limit): deletes `frame` rows older than 1 hour, at most p_limit a call
--    (chat lines keep Realtime's own retention: they are not this file's call). The job
--    hr-realtime-frame-prune runs it every 10 minutes at :03, limit 20,000: 120,000 rows/h, ten times
--    the 40-player worst case. Nothing else reads the table: the client holds no replay
--    (src/session/character-session.js joins the topic live; a missed frame is healed by the poll).
-- §2 hr_tick_cron_log_prune: 7 days -> 3 days. Its readers look back at most 48 h
--    (hr_tick_stall_status's clamp) or 24 h (tools/vitals.mjs).
-- §3 hr_cron_health_ex's c_cron_keep: 7 days -> 3 days (one anchored edit). Every job runs at least
--    daily, so one missed daily run is still visible; the detector's own scan gets shorter.
--
-- ── DISK ────────────────────────────────────────────────────────────────────
-- A DELETE hands space to autovacuum for re-use; it does not shrink a file. realtime.messages shrinks
-- by itself (a day's partition empties, vacuum truncates it, Realtime drops it). The other two stop at
-- their new live size and re-use their pages. OPTIONAL one-off, Coordinator's call, not a migration
-- (VACUUM refuses a transaction): `vacuum full` on net._http_response (-205 MB),
-- cron.job_run_details (-50 MB), hr_tick_cron_log (-15 MB): ~1 s of ACCESS EXCLUSIVE each. Nothing
-- breaks without it.
--
-- ── LOCKS / COST ────────────────────────────────────────────────────────────
-- ROW EXCLUSIVE only. Idle: one index probe on (inserted_at desc, topic) per partition, six runs an
-- hour. 40 players at peak: ~4,000 rows a run, TOAST included, under a second; autovacuum follows.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   select public.hr_cron_drop('hr-realtime-frame-prune');   -- frames fall back to Realtime's 72 h
--   §2, §3: put '7 days' back the same way. Nothing a player owns is touched by any of it.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise exception 'PRECONDITION: hr_cron_ensure is absent'; end if;
  if to_regprocedure('public.hr_tick_cron_log_prune(integer)') is null then
    raise exception 'PRECONDITION: hr_tick_cron_log_prune is absent'; end if;
  if to_regprocedure('public.hr_cron_health_ex(interval,numeric)') is null then
    raise exception 'PRECONDITION: hr_cron_health_ex is absent'; end if;
end $mig$;

-- ── §1 THE FRAMES ───────────────────────────────────────────────────────────
-- Not SECURITY DEFINER: the cron job runs as postgres, which holds DELETE. Realtime absent (the PGlite replay, a
-- rebuilt database before Realtime's first boot) answers 0. p_limit 0 deletes nothing and still reaches the table,
-- which is how §4 proves the privilege without touching a row.
create or replace function public.hr_realtime_frame_prune(p_limit int default 20000)
returns bigint language plpgsql set search_path = public, pg_catalog as $$
declare v_n bigint;
begin
  if to_regclass('realtime.messages') is null then return 0; end if;
  -- `extension` and `private` are the partial index's predicate: the walk is an index range, oldest first.
  with doomed as (
    select m.id, m.inserted_at from realtime.messages m
     where m.inserted_at < (now() at time zone 'utc') - interval '1 hour'
       and m.extension = 'broadcast' and m.private is true
       and m.event = 'frame'
     order by m.inserted_at
     limit greatest(0, least(coalesce(p_limit, 20000), 100000))
  )
  delete from realtime.messages m using doomed d where m.id = d.id and m.inserted_at = d.inserted_at;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.hr_realtime_frame_prune(int)
  from public, anon, authenticated, service_role, hr_engine, hr_tick;

do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'db-retention §1: pg_cron absent here; hr-realtime-frame-prune is not scheduled';
    return;
  end if;
  perform public.hr_cron_ensure('hr-realtime-frame-prune', '3-59/10 * * * *',
    'select public.hr_realtime_frame_prune(20000)');
end $mig$;

-- ── §2 THE TICK'S FIRE LOG: 7 DAYS -> 3 ─────────────────────────────────────
create or replace function public.hr_tick_cron_log_prune(p_limit int default 20000)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_n bigint;
begin
  with doomed as (
    select id from public.hr_tick_cron_log
     where at < now() - interval '3 days'
     order by id limit greatest(1, least(coalesce(p_limit, 20000), 200000))
  )
  delete from public.hr_tick_cron_log l using doomed d where l.id = d.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.hr_tick_cron_log_prune(int)
  from public, anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §3 THE SCHEDULER'S RUN HISTORY: 7 DAYS -> 3 (one anchored edit) ─────────
do $mig$
declare
  v_def text; v_n int;
  a constant text := $a$c_cron_keep      constant interval := interval '7 days';$a$;
  r constant text := $a$c_cron_keep      constant interval := interval '3 days';$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_cron_health_ex(interval,numeric)'::regprocedure), chr(13), '');
  if position(r in v_def) > 0 then
    raise notice 'db-retention §3: hr_cron_health_ex already keeps 3 days - patch skipped'; return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_n <> 1 then raise exception 'db-retention §3: hr_cron_health_ex anchor matched % times', v_n; end if;
  execute replace(v_def, a, r);
end $mig$;
revoke execute on function public.hr_cron_health_ex(interval, numeric) from public;
revoke execute on function public.hr_cron_health_ex(interval, numeric) from anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED; reads the catalogs, deletes no row ──
do $mig$
declare
  v_job record;
begin
  -- v1 the retention numbers are the ones this file states.
  if position($q$interval '3 days'$q$ in (select prosrc from pg_proc where oid = 'public.hr_tick_cron_log_prune(integer)'::regprocedure)) = 0 then
    raise exception 'db-retention §4 v1: hr_tick_cron_log_prune does not keep 3 days'; end if;
  if position($q$c_cron_keep      constant interval := interval '3 days'$q$ in
       (select prosrc from pg_proc where oid = 'public.hr_cron_health_ex(interval,numeric)'::regprocedure)) = 0 then
    raise exception 'db-retention §4 v1: hr_cron_health_ex does not keep 3 days'; end if;
  -- v2 hr_tick_stall_status's window (at most 48 h) still fits inside what is kept.
  if position('least(greatest(coalesce(p_hours, 2), 1), 48)' in
       (select prosrc from pg_proc where oid = to_regprocedure('public.hr_tick_stall_status(timestamp with time zone,integer,integer)'))) = 0 then
    raise exception 'db-retention §4 v2: hr_tick_stall_status no longer clamps its window to 48 h: re-measure the 3 day retention'; end if;
  -- v3 the prune reaches no client.
  if has_function_privilege('authenticated', 'public.hr_realtime_frame_prune(integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_realtime_frame_prune(integer)', 'execute') then
    raise exception 'db-retention §4 v3: a client role can execute hr_realtime_frame_prune'; end if;

  -- Realtime or pg_cron absent (PGlite): the rest is not testable here (tests/db-retention.mjs stubs both).
  if to_regclass('realtime.messages') is null or to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'db-retention §4: skipped v4-v6 (no realtime.messages / pg_cron here)';
    return;
  end if;

  -- v4 one active job, in this database, exactly §1's schedule and command.
  select jobid, schedule, command, database, username, active into v_job from cron.job where jobname = 'hr-realtime-frame-prune';
  if not found or not v_job.active or v_job.database is distinct from current_database() then
    raise exception 'db-retention §4 v4: hr-realtime-frame-prune is missing, inactive or in another database'; end if;
  if v_job.schedule <> '3-59/10 * * * *' or v_job.command <> 'select public.hr_realtime_frame_prune(20000)' then
    raise exception 'db-retention §4 v4: the job reads % / %', v_job.schedule, v_job.command; end if;
  -- v5 its role may delete there (a refusal in the cron log is an hour-a-day nobody reads).
  if not has_table_privilege(v_job.username, 'realtime.messages', 'DELETE') then
    raise exception 'db-retention §4 v5: % lacks DELETE on realtime.messages', v_job.username; end if;
  -- v6 the statement runs against the real table: limit 0 touches no row.
  if public.hr_realtime_frame_prune(0) <> 0 then
    raise exception 'db-retention §4 v6: a prune of limit 0 deleted rows'; end if;
end $mig$;
