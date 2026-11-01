-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-20-market-wipe-resume.sql — THE EXPIRY SWEEP COMES BACK AFTER A DECLARED WIPE
--   (lane/c-beta-server, backend-architect, 2026-11-01; step 5 of 2027-02-20-market-wipe.sql's procedure).
--
-- STATUS: STAGED. Apply ONLY after 2027-02-20-market-wipe.sql AND the character wipe. In
-- tests/schema-apply-order.json `excluded`. tools/apply-migration.mjs, one file, never inside
-- begin/commit, never 00:00–00:10 UTC. Safe to re-apply: the schedule upserts by name.
-- Until this runs, 2027-02-14-market-on.sql refuses (its §0 reads the job).
-- ════════════════════════════════════════════════════════════════════════
do $mig$
declare v_was jsonb; v_job record;
begin
  -- Only a wipe's pause is resumed: on a database that never ran the wipe this file has nothing to do.
  select removed->'sweep_paused' into v_was from public.hr_wipe_log where wipe_key = 'market-first-wipe';
  if not found then
    raise exception 'PRECONDITION: 2027-02-20-market-wipe.sql has not run: nothing is paused'; end if;
  if jsonb_typeof(v_was) is distinct from 'object' then
    raise exception 'PRECONDITION: the wipe journalled no sweep (%): schedule it by hand, deliberately', v_was; end if;

  -- The job exactly as the wipe found it, read from its journal rather than retyped.
  perform public.hr_cron_ensure(v_was->>'jobname', v_was->>'schedule', v_was->>'command');

  select * into v_job from cron.job where jobname = 'hr-market-expire';
  if not found or not v_job.active or v_job.schedule is distinct from v_was->>'schedule'
     or v_job.command is distinct from v_was->>'command' then
    raise exception 'market-wipe-resume: the sweep is not back as it was: %', v_was; end if;
  raise notice 'market-wipe-resume: hr-market-expire is scheduled again (%); 2027-02-14-market-on.sql may run on its release', v_was->>'schedule';
end $mig$;
