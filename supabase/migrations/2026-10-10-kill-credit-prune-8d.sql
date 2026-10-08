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
-- Re-run §1 of 2026-09-01-kill-daily-credit.sql (the 2-day body), then
-- `drop function public.hr_kill_credit_prune_cutoff(interval);`. Nothing is
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
-- The cutoff is its own function so §4 can EXECUTE the floor without running a
-- table-wide delete on production (tests/selfcheck-no-global-dml.mjs): the
-- prune deletes exactly `created_at < hr_kill_credit_prune_cutoff(p_older)`.
create or replace function public.hr_kill_credit_prune_cutoff(p_older interval default interval '8 days')
returns timestamptz language sql stable set search_path = public as $$
  -- The floor is 8 days: the Lone Hunt gate (2026-10-10-lone-hunt-weekly-chest.sql)
  -- subtracts a whole hunt week of bounty-free credits read from this log.
  select now() - greatest(interval '8 days', coalesce(p_older, interval '8 days'))
$$;
revoke execute on function public.hr_kill_credit_prune_cutoff(interval) from public, anon, authenticated, service_role;

create or replace function public.hr_kill_credit_prune(p_older interval default interval '8 days')
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.hr_kill_credit_log
   where created_at < public.hr_kill_credit_prune_cutoff(p_older);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.hr_kill_credit_prune(interval) from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK — executed, no DML (the prune itself is never run here) ───
do $$
declare
  v_body text;
begin
  if has_function_privilege('authenticated', 'public.hr_kill_credit_prune(interval)', 'execute')
     or has_function_privilege('anon', 'public.hr_kill_credit_prune(interval)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_kill_credit_prune_cutoff(interval)', 'execute')
     or has_function_privilege('anon', 'public.hr_kill_credit_prune_cutoff(interval)', 'execute') then
    raise exception 'VERIFY: the kill-credit prune or its cutoff is client-executable';
  end if;
  -- (a) the scheduled call's window keeps a whole hunt week: a 7-day-old row
  --     survives, a 9-day-old row does not.
  if not (now() - interval '7 days' >= public.hr_kill_credit_prune_cutoff())
     or not (now() - interval '9 days' < public.hr_kill_credit_prune_cutoff()) then
    raise exception 'VERIFY(a): the default cutoff % does not keep 7 days and drop 9', public.hr_kill_credit_prune_cutoff();
  end if;
  -- (b) a caller asking for a SHORTER window, or NULL, cannot go under the floor.
  if public.hr_kill_credit_prune_cutoff(interval '1 hour') <> public.hr_kill_credit_prune_cutoff()
     or public.hr_kill_credit_prune_cutoff(null) <> public.hr_kill_credit_prune_cutoff() then
    raise exception 'VERIFY(b): a 1-hour or NULL request moved the cutoff under the 8-day floor';
  end if;
  -- (c) the prune deletes by THAT cutoff and nothing else.
  select regexp_replace(prosrc, '\s+', ' ', 'g') into v_body from pg_proc
   where oid = 'public.hr_kill_credit_prune(interval)'::regprocedure;
  if strpos(v_body, 'where created_at < public.hr_kill_credit_prune_cutoff(p_older)') = 0 then
    raise exception 'VERIFY(c): hr_kill_credit_prune does not delete by hr_kill_credit_prune_cutoff(p_older)';
  end if;
  raise notice 'kill-credit-prune-8d: the cutoff keeps 8 days, a shorter or NULL request cannot go under it, the prune deletes by it, owner-only - all green';
end $$;
