-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-10-pg-net-vacuum.sql — pg_net's RESPONSE TABLE IS VACUUMED EVERY
--   HOUR, because autovacuum never will (lane/c-reliability-basics,
--   reliability-engineer, 2026-10-30).
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one
-- file, never inside begin/commit, never 00:00–00:10 UTC). EDGE: none.
-- CLIENT: none. Moves no value and no player row; touches no money surface.
-- APPLY ORDER: anywhere; registered after 2027-02-10-party-instance-reset.sql.
--
-- ── THE FINDING (measured on production, 2026-10-30 02:27 UTC) ──────────────
--   net._http_response: 208,781,312 bytes of heap holding 280 live rows (bodies
--   ~125 B). pg_stat_all_tables: n_tup_ins 0, n_tup_del 0, n_dead_tup 0,
--   last_autovacuum NULL, autovacuum_count 0, relpages 0 / reltuples -1 (never
--   vacuumed or analyzed) — while net.http_request_queue counts 127,819
--   requests since the postmaster started (2026-08-17). pg_net's background
--   worker inserts each response and deletes it after pg_net.ttl (6 hours)
--   WITHOUT reporting either to the statistics collector, so autovacuum, which
--   only acts on those counters, never sees a dead row there. Every response
--   the world tick has ever received is still on disk as dead space:
--   208.8 MB / 127,819 = ~1.6 KB a request, forever. It is 25 % of the
--   database (850 MB) and grows with every tick POST.
--
-- ── CAPACITY ────────────────────────────────────────────────────────────────
--   WITHOUT this file the heap grows by ~1.6 KB per pg_net request, unbounded:
--     today      ~500 tick POSTs/day                     ->  ~0.8 MB/day
--     playtest   <= 2 bodies a 10 s fire  (17,280/day)   ->  ~28 MB/day
--     100x       <= 9 bodies a fire       (77,760/day)   -> ~127 MB/day
--   WITH it the table holds at most pg_net.ttl (6 h) of responses: at the
--   playtest's worst case 4,320 rows x ~1.6 KB = ~7 MB, re-used hour after hour.
--   Plain VACUUM marks the dead space re-usable; it does not hand the 208 MB
--   already there back to the filesystem (the live rows sit at the heap's end,
--   so the tail cannot be truncated). That is a ONE-OFF, optional, Coordinator's
--   call: `vacuum full net._http_response;` rewrites ~300 rows under an ACCESS
--   EXCLUSIVE lock on that one table for about a second (pg_net's worker waits;
--   the tick's own INSERT into net.http_request_queue does not). Not done here:
--   VACUUM cannot run inside a migration, and nothing breaks without it.
--
-- ── WHAT IT DOES ────────────────────────────────────────────────────────────
--   §1 one pg_cron job, hr-net-response-vacuum, at minute 47 of every hour
--      (no other job runs at :47), command `vacuum (analyze) net._http_response`.
--      pg_cron runs a job's command as a top-level statement over its own
--      connection (cron.use_background_workers = off on production, read
--      2026-10-30), which is the one place VACUUM may run; the job's role is
--      postgres (hr_cron_ensure is SECURITY DEFINER, owned by postgres).
--   ANALYZE rides along so the planner stops guessing reltuples = -1 for
--   pg_net's own `delete ... where created < now() - ttl`.
--
-- ── LOCKS ───────────────────────────────────────────────────────────────────
--   Plain VACUUM takes SHARE UPDATE EXCLUSIVE on net._http_response only: it
--   does not block pg_net's INSERT/DELETE (ROW EXCLUSIVE) or any reader. A tail
--   truncation needs ACCESS EXCLUSIVE, which VACUUM takes only conditionally and
--   gives back as soon as anyone queues behind it (every 20 ms). No player table
--   is touched. The first run reads the 25,486 pages once (~2-3 s of IO on the
--   Micro's 87 MB/s baseline disk); later runs read ~a hundred.
--
-- ── §2 SELF-CHECK (executed; reads cron.job, writes nothing) ────────────────
--   v1 exactly one job named hr-net-response-vacuum, active, in this database.
--   v2 its schedule and command are exactly §1's (a job that VACUUMs some other
--      table, or none, is red).
--   v3 the job's role holds MAINTAIN on net._http_response. Without it VACUUM
--      does not fail: it prints "permission denied ... skipping" as a WARNING,
--      the run reads `succeeded`, and the heap keeps growing — the silent
--      failure this file exists to end. (Today postgres holds it through
--      PUBLIC's grant; a revoke of PUBLIC must grant postgres MAINTAIN back.)
--   Where pg_cron or pg_net is absent (the PGlite replay), §1 and §2 say so in
--   a NOTICE and move nothing, so the chain replays byte-identically.
--
-- ── AFTER APPLY (Coordinator) ───────────────────────────────────────────────
--   after the next :47 —
--     select d.status, d.return_message, d.end_time - d.start_time as took
--       from cron.job_run_details d join cron.job j using (jobid)
--      where j.jobname = 'hr-net-response-vacuum' order by d.runid desc limit 1;
--     -> succeeded, VACUUM
--     select last_vacuum, last_analyze from pg_stat_all_tables
--      where relid = 'net._http_response'::regclass;   -> both set
--   `node tools/load-probe.mjs --live` asserts last_vacuum is under 2 h old from
--   then on (a VACUUM refused for want of MAINTAIN WARNs, reads `succeeded` in
--   cron, and stamps nothing, so the stamp is the job's real proof).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   select public.hr_cron_drop('hr-net-response-vacuum');
--   (removes the job; nothing else was created, granted or changed)
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_cron_ensure(text,text,text)') is null
     or to_regprocedure('public.hr_cron_drop(text)') is null then
    raise exception 'PRECONDITION: hr_cron_ensure / hr_cron_drop absent (2026-08-11-player-state.sql)';
  end if;
end $mig$;

-- ── §1 THE JOB ──────────────────────────────────────────────────────────────
-- cron.schedule upserts on the job name: a second apply rewrites the same row
-- with the same schedule and command (same jobid), so it moves nothing.
do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regclass('net._http_response') is null then
    raise notice 'pg-net-vacuum §1: pg_cron or pg_net absent here; hr-net-response-vacuum is not scheduled';
    return;
  end if;
  perform public.hr_cron_ensure('hr-net-response-vacuum', '47 * * * *',
    'vacuum (analyze) net._http_response');
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED ──────────────────────────────────
do $mig$
declare
  v_n    int;
  v_job  record;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regclass('net._http_response') is null then
    raise notice 'pg-net-vacuum §2: skipped (no pg_cron / pg_net here)';
    return;
  end if;

  -- v1 one job, active, here.
  select count(*) into v_n from cron.job where jobname = 'hr-net-response-vacuum';
  if v_n <> 1 then
    raise exception 'pg-net-vacuum §2 v1: % jobs named hr-net-response-vacuum (want exactly 1)', v_n; end if;
  select jobid, schedule, command, database, username, active into v_job
    from cron.job where jobname = 'hr-net-response-vacuum';
  if not v_job.active then
    raise exception 'pg-net-vacuum §2 v1: hr-net-response-vacuum is inactive'; end if;
  if v_job.database is distinct from current_database() then
    raise exception 'pg-net-vacuum §2 v1: the job runs in database %, not %', v_job.database, current_database(); end if;

  -- v2 exactly §1's schedule and command.
  if v_job.schedule <> '47 * * * *' then
    raise exception 'pg-net-vacuum §2 v2: schedule is % (want 47 * * * *)', v_job.schedule; end if;
  if v_job.command <> 'vacuum (analyze) net._http_response' then
    raise exception 'pg-net-vacuum §2 v2: command is % (want vacuum (analyze) net._http_response)', v_job.command; end if;

  -- v3 the job's role may VACUUM the table (PG 17: the MAINTAIN privilege).
  if not has_table_privilege(v_job.username, 'net._http_response', 'MAINTAIN') then
    raise exception 'pg-net-vacuum §2 v3: % lacks MAINTAIN on net._http_response; VACUUM would skip it with a WARNING every hour and the heap would keep growing',
      v_job.username; end if;
end $mig$;
