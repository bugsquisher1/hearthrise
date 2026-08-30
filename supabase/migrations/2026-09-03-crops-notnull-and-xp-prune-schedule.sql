-- ============================================================================
-- 2026-09-03 — TWO CLOSURES FROM THE SCHEMA-DRIFT AUDIT (REVIEW ONLY).
--
-- (1) hr_crops.xp / yield_min / yield_max are bare-nullable on PRODUCTION —
--     a hand-patch authored by no file (the audit's single class-(b) finding).
--     Every repo statement declares them `int not null default …`, and every
--     repo path that could fix them is `add column if not exists` = a
--     permanent no-op. This sets prod to what the repo replay already builds.
--     On a replayed chain the ALTERs are no-ops (already not null) — that is
--     the point: after this file, repo and prod agree by construction.
--     9 rows, 0 nulls measured; ACCESS EXCLUSIVE for sub-milliseconds.
--     Rollback: drop not null / drop default.
--
-- (2) hr_combat_xp_credit_prune() was created by 2026-08-31-combat-xp-credit
--     and NEVER SCHEDULED — the game_events class reforming (~1,050 rows/
--     player/day; ~61 MB/day at 100×). Scheduled daily 04:35 UTC (between the
--     kill-credit prune 04:40 and progress prune 04:25), default window.
--     Rollback: cron.unschedule('hr-combat-xp-credit-prune').
-- ============================================================================

do $$
begin
  -- §0 preconditions, fail closed
  if (select count(*) from information_schema.columns
        where table_schema='public' and table_name='hr_crops'
          and column_name in ('xp','yield_min','yield_max')) <> 3 then
    raise exception 'hr_crops is missing one of xp/yield_min/yield_max — wrong database?';
  end if;
  if exists (select 1 from public.hr_crops where xp is null or yield_min is null or yield_max is null) then
    raise exception 'hr_crops holds NULLs in xp/yield_min/yield_max — backfill before constraining';
  end if;
  if to_regprocedure('public.hr_combat_xp_credit_prune(interval)') is null
     and to_regprocedure('public.hr_combat_xp_credit_prune()') is null then
    raise exception 'hr_combat_xp_credit_prune not found — apply 2026-08-31-combat-xp-credit.sql first';
  end if;
end $$;

-- §1 constrain the hand-patched columns to the repo's declared shape
alter table public.hr_crops alter column xp        set default 0;
alter table public.hr_crops alter column yield_min set default 1;
alter table public.hr_crops alter column yield_max set default 1;
alter table public.hr_crops alter column xp        set not null;
alter table public.hr_crops alter column yield_min set not null;
alter table public.hr_crops alter column yield_max set not null;

-- §2 schedule the missing prune (idempotent: unschedule-if-present first)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'hr-combat-xp-credit-prune') then
    perform cron.unschedule('hr-combat-xp-credit-prune');
  end if;
  if to_regprocedure('public.hr_combat_xp_credit_prune(interval)') is not null then
    perform cron.schedule('hr-combat-xp-credit-prune', '35 4 * * *',
      $cron$select public.hr_combat_xp_credit_prune(interval '1 day')$cron$);
  else
    perform cron.schedule('hr-combat-xp-credit-prune', '35 4 * * *',
      $cron$select public.hr_combat_xp_credit_prune()$cron$);
  end if;
end $$;

-- §3 verify, fail closed
do $$
declare v_nullable int; v_job int;
begin
  select count(*) into v_nullable from information_schema.columns
    where table_schema='public' and table_name='hr_crops'
      and column_name in ('xp','yield_min','yield_max') and is_nullable = 'YES';
  if v_nullable <> 0 then
    raise exception 'VERIFY FAILED: % hr_crops column(s) still nullable', v_nullable;
  end if;
  select count(*) into v_job from cron.job where jobname = 'hr-combat-xp-credit-prune';
  if v_job <> 1 then
    raise exception 'VERIFY FAILED: hr-combat-xp-credit-prune job count = %', v_job;
  end if;
  raise notice 'crops-notnull + xp-prune-schedule — all green';
end $$;
