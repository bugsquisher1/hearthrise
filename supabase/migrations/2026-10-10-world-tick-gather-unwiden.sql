-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-world-tick-gather-unwiden.sql — KILL, COHORT HALF: back to the
-- operator-owned M2 cohort.
--
-- STAGED — apply ONLY on a runbook kill trigger
-- (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, "Gather widen" §Kill),
-- via   node tools/apply-migration.mjs 2026-10-10-world-tick-gather-unwiden.sql
-- Normally AFTER 2026-10-07-world-tick-disarm.sql (money stops first); on its
-- own it is also safe while armed: every unenrolled character becomes
-- ACCRUE-OWNED from wherever the tick left accrued_to, and nothing is paid.
-- What it does: hr_tick_cohort.permille -> 0 for gather (nothing re-enrols),
-- every ownership row whose latest hr_tick_enrolment event is 'enrol' is
-- deleted and journalled 'unenrol'; operator rows (QA slot 2) are untouched.
-- No preconditions beyond the function existing: a kill must always land.
-- EXCLUDED from the replay chain (a rebuilt database has nothing enrolled).
-- Re-widening = a new staged file that sets permille again, with its own GO.
-- ════════════════════════════════════════════════════════════════════════

select public.hr_tick_unenrol('gather');

do $kill$
begin
  if (select permille from public.hr_tick_cohort where channel = 'gather') <> 0 then
    raise exception 'UNWIDEN: hr_tick_cohort.permille did not read back 0';
  end if;
  if exists (select 1 from public.hr_tick_ownership o
              where o.channel = 'gather'
                and (select e.event from public.hr_tick_enrolment e
                      where e.user_id = o.user_id and e.slot = o.slot and e.channel = o.channel
                      order by e.id desc limit 1) = 'enrol') then
    raise exception 'UNWIDEN: a journal-enrolled gather ownership row survived';
  end if;
  raise notice 'UNWIDENED at %: gather cohort back to the operator rows', now();
end $kill$;
