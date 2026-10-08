-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-kill-credit-prune-8d.sql — hr_kill_credit_log OUTLIVES A HUNT WEEK.
--
-- STAGED, NOT APPLIED - REVIEW ONLY. SECURITY GO REQUIRED BEFORE APPLY (lane C,
--   Security A1 condition on 2026-10-10-lone-hunt-weekly-chest.sql). The
--   Coordinator applies it with
--   `node tools/apply-migration.mjs supabase/migrations/2026-10-10-kill-credit-prune-8d.sql`
--   (one file, never inside begin/commit, never 00:00-00:10 UTC). No edge change.
--   Apply it BEFORE (or with) the lone-hunt file: the gate there subtracts the
--   week's bounty-free credits read from this log, and a log pruned at 2 days
--   would hand the discount back to a script on day 3 of the week.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────
-- hr_kill_credit_prune's retention floor goes from 2 days to 8 days (a hunt week
-- plus one UTC day of slack for the claim window). Restated in full (not an
-- anchored patch); the signature, owner-only grant and cron job are unchanged —
-- the scheduled call `select public.hr_kill_credit_prune()` takes the default,
-- and the floor is a `greatest(...)`, so no caller can pass a shorter window.
-- 2026-09-01-kill-daily-credit.sql is APPLIED history and is not edited.
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- The bounty-free branch writes at most one row per attended combat call (60/min
-- rate gate; in practice one per credit cadence). At ~120 rows per character
-- per active day, 8 days is ~1k rows per character: ~600k rows / ~100 MB with the
-- two indexes for 600 characters, versus ~240k at 2 days. Still pruned daily.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-run §1 of 2026-09-01-kill-daily-credit.sql (the 2-day body). Nothing is
-- written; rows simply live 6 days longer.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.hr_kill_credit_prune(interval)') is null
     or to_regclass('public.hr_kill_credit_log') is null then
    raise exception 'PRECONDITION: hr_kill_credit_prune(interval) / hr_kill_credit_log absent - '
                    'apply 2026-09-01-kill-daily-credit.sql first';
  end if;
end $$;

-- ── 1. THE PRUNE, 8-DAY FLOOR ───────────────────────────────────────────────
create or replace function public.hr_kill_credit_prune(p_older interval default interval '8 days')
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  -- The floor is 8 days: the Lone Hunt gate (2026-10-10-lone-hunt-weekly-chest.sql)
  -- subtracts a whole hunt week of bounty-free credits read from this log.
  delete from public.hr_kill_credit_log
   where created_at < now() - greatest(interval '8 days', coalesce(p_older, interval '8 days'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.hr_kill_credit_prune(interval) from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK — executed, net-zero (sentinel HR8A9) ─────────────────────
do $$
declare
  v_uid constant uuid := '000000c0-0000-0000-0000-00000000a109';
  v_n   int;
begin
  if has_function_privilege('authenticated', 'public.hr_kill_credit_prune(interval)', 'execute')
     or has_function_privilege('anon', 'public.hr_kill_credit_prune(interval)', 'execute') then
    raise exception 'VERIFY: hr_kill_credit_prune is client-executable';
  end if;
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_kill_credit_log (user_id, slot, idem, target, claimed, credit, cap, applied, free, created_at)
      values (v_uid, 0, 'prune-probe-3d', 'goblin', 1, 1, 1, 1, true, now() - interval '3 days'),
             (v_uid, 0, 'prune-probe-7d', 'goblin', 1, 1, 1, 1, true, now() - interval '7 days'),
             (v_uid, 0, 'prune-probe-9d', 'goblin', 1, 1, 1, 1, true, now() - interval '9 days');
    -- (a) the scheduled call (default) keeps a whole hunt week, drops older.
    perform public.hr_kill_credit_prune();
    select count(*) into v_n from public.hr_kill_credit_log where user_id = v_uid;
    if v_n <> 2 or exists (select 1 from public.hr_kill_credit_log where user_id = v_uid and idem = 'prune-probe-9d') then
      raise exception 'VERIFY(a): the default prune kept % probe rows (expected the 3d and 7d rows only)', v_n;
    end if;
    -- (b) a caller asking for a SHORTER window cannot go under the floor.
    perform public.hr_kill_credit_prune(interval '1 hour');
    select count(*) into v_n from public.hr_kill_credit_log where user_id = v_uid;
    if v_n <> 2 then
      raise exception 'VERIFY(b): a 1-hour prune went under the 8-day floor (% probe rows left)', v_n;
    end if;
    raise exception using errcode = 'HR8A9', message = 'kill-credit-prune-8d §4 complete - rolling back';
  exception when sqlstate 'HR8A9' then null;
  end;
  if exists (select 1 from public.hr_kill_credit_log where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY: §4 LEAKED a probe row';
  end if;
  raise notice 'kill-credit-prune-8d: default prune keeps 8 days, a shorter request cannot go under it, owner-only - all green';
end $$;
