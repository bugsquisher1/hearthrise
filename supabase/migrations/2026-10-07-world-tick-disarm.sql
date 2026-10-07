-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-07-world-tick-disarm.sql — MASTER KILL: no channel pays.
--
-- STAGED — KILL SWITCH, apply ONLY on a runbook kill trigger
-- (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md), via
--   node tools/apply-migration.mjs 2026-10-07-world-tick-disarm.sql
-- No preconditions: a kill must always land. Shadow keeps measuring, so the
-- channel can re-earn its arm. EXCLUDED from the replay chain (a rebuilt
-- database is already disarmed; the arm file is excluded too).
-- A settle that read "armed" before this commits may finish that ONE window
-- (version-CAS'd); none after it can (2026-10-06-world-tick-channel-arm.sql).
-- ════════════════════════════════════════════════════════════════════════

update public.hr_tick_config set armed_channels = '{}'::text[] where id;

do $kill$
begin
  if (select armed_channels from public.hr_tick_config where id) <> '{}'::text[] then
    raise exception 'KILL: armed_channels did not read back empty';
  end if;
  raise notice 'DISARMED at %', now();
end $kill$;
