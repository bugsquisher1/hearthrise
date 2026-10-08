-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-14-world-tick-disarm-combat.sql — M4 KILL: combat stops paying,
--                                           gather keeps paying.
--
-- STAGED — KILL SWITCH, apply ONLY on an M4 kill trigger
-- (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, "M4 — combat ARM"), via
--   node tools/apply-migration.mjs 2026-10-14-world-tick-disarm-combat.sql
-- No preconditions: a kill must always land. Combat drops back to SHADOW (the
-- probe keeps measuring, so combat can re-earn its arm); every other armed
-- channel is untouched. The MASTER kill (every channel) stays
-- 2026-10-07-world-tick-disarm.sql. EXCLUDED from the replay chain (a rebuilt
-- database is already disarmed; the arm file is excluded too).
-- A settle that read "armed" before this commits may finish that ONE window
-- (version-CAS'd); none after it can (2026-10-06-world-tick-channel-arm.sql).
-- Party hunts: hr_party_hunt_start refuses new hunts at once
-- (hunt_channel_disarmed); a live hunt is no longer paid and its members'
-- accrue stays held until Leave/Stop or the 24 h reaper — so the runbook's
-- kill step also reads `party_hunt where ended_at is null` (expected 0 at the
-- M4 stage: one owned combat character cannot form a 2-hunter hunt).
-- ════════════════════════════════════════════════════════════════════════

update public.hr_tick_config set armed_channels = array_remove(armed_channels, 'combat') where id;

do $kill$
begin
  if 'combat' = any ((select armed_channels from public.hr_tick_config where id)) then
    raise exception 'KILL: combat still armed after the disarm';
  end if;
  raise notice 'COMBAT DISARMED at %; armed now %', now(),
    (select armed_channels from public.hr_tick_config where id);
end $kill$;
