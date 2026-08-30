-- ============================================================================
-- 2026-09-04 — MOVE hr-combat-xp-credit-prune OFF THE 04:35 SLOT (REVIEW ONLY).
--
-- 2026-09-03-crops-notnull-and-xp-prune-schedule.sql scheduled the combat-XP
-- prune at '35 4 * * *' — a slot already held by hr-rejections-prune, so two
-- DELETE jobs fire together on Micro compute (drift-audit finding, 2026-08-30).
-- Collisions are pre-existing practice here (*/5 has two, 7 * * * * has two),
-- but this one is free to fix: 04:33 sits inside the same quiet window,
-- between the progress prune (04:25) and the rejections prune (04:35).
--
-- Rollback: cron.unschedule + cron.schedule back to '35 4 * * *'.
-- ============================================================================

do $$
declare v_cmd text;
begin
  -- §0 preconditions, fail closed
  select command into v_cmd from cron.job where jobname = 'hr-combat-xp-credit-prune';
  if v_cmd is null then
    raise exception 'hr-combat-xp-credit-prune not scheduled — apply 2026-09-03-crops-notnull-and-xp-prune-schedule.sql first';
  end if;
  if exists (select 1 from cron.job
              where schedule = '33 4 * * *'
                and jobname <> 'hr-combat-xp-credit-prune') then
    raise exception 'target slot 04:33 is already occupied by another job — pick a different slot';
  end if;

  -- §1 reschedule, carrying the command verbatim (never restate it — the
  --    b487 stale-template class)
  perform cron.unschedule('hr-combat-xp-credit-prune');
  perform cron.schedule('hr-combat-xp-credit-prune', '33 4 * * *', v_cmd);
end $$;

-- §2 verify, fail closed
do $$
declare v_n int;
begin
  select count(*) into v_n from cron.job
    where jobname = 'hr-combat-xp-credit-prune' and schedule = '33 4 * * *';
  if v_n <> 1 then
    raise exception 'VERIFY FAILED: hr-combat-xp-credit-prune at 04:33 count = %', v_n;
  end if;
  select count(*) into v_n from cron.job where schedule = '33 4 * * *';
  if v_n <> 1 then
    raise exception 'VERIFY FAILED: 04:33 slot holds % job(s), want exactly ours', v_n;
  end if;
  select count(*) into v_n from cron.job
    where jobname = 'hr-combat-xp-credit-prune' and schedule = '35 4 * * *';
  if v_n <> 0 then
    raise exception 'VERIFY FAILED: old 04:35 entry still present';
  end if;
  raise notice 'xp-prune-slot-shift — all green (04:35 collision cleared)';
end $$;
