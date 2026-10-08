-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-12-retire-daily-tasks.sql       STAGED — REVIEW ONLY, NOT APPLIED
--
-- RETIRES THE SECOND DAILY SYSTEM'S CLAIM PATH (game-designer, lane
-- daily-board). Daily Tasks were Home's "Kill 25 monsters / Gather 50
-- resources" slate, paid by hr_claim_daily; the one daily board
-- (2026-10-11-daily-board.sql, hr_claim_goal) replaces them. The client half of
-- the lane removes the slate, its local counting and its claim call. This file
-- takes the RPC off the client surface:
--
--   §1 revoke execute on hr_claim_daily(text,int) from authenticated, and drop
--      its hr_client_rpc_baseline row so grant hygiene stays clean.
--
-- Nothing is dropped: the bodies, the catalogue CASE and the rate-gate bucket
-- stay as history, unreachable. Nothing a player earned is lost — every task
-- claim already paid is a ledger row, and the counters it read (player_progress
-- kind='daily' ev:<type>) are the same rows the board grades.
--
-- ⚠ ORDER: apply only AFTER the client half is live. Applied earlier, an open
--   tab on the old client would finish a task and be refused (permission
--   denied) — a day's task gold lost between the apply and the cut.
-- Reversibility: grant execute on function public.hr_claim_daily(text, int) to
--   authenticated; and restore the baseline row from 2026-08-20 §8b.
-- No begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends one batch).
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.hr_claim_daily(text,int)') is null then
    raise exception 'hr_claim_daily(text,int) missing — nothing to retire; is this the right database?';
  end if;
  if to_regprocedure('public.hr_goal_board(boolean,timestamptz)') is null then
    raise exception 'hr_goal_board missing — apply 2026-10-11-daily-board.sql first; retiring the '
                    'task claim before the board exists would leave a player with no daily at all';
  end if;
end $$;

-- ── 1. OFF THE CLIENT SURFACE ──────────────────────────────────────────────
revoke execute on function public.hr_claim_daily(text, int) from public, anon, authenticated, service_role;

do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — nothing to update'; return;
  end if;
  delete from public.hr_client_rpc_baseline where proname = 'hr_claim_daily';
end $$;

-- ── 2. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
do $$
begin
  if has_function_privilege('authenticated', 'public.hr_claim_daily(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_claim_daily(text,integer)', 'execute') then
    raise exception 'GATE(a): hr_claim_daily is still client-executable';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_goal(text,boolean,integer,uuid)', 'execute') then
    raise exception 'GATE(a): hr_claim_goal is not client-executable — the board would be dead too';
  end if;
  if to_regclass('public.hr_client_rpc_baseline') is not null
     and exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_claim_daily') then
    raise exception 'GATE(b): hr_claim_daily is still in hr_client_rpc_baseline';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0
         or jsonb_array_length(v_gh->'baseline_rows_no_longer_live') <> 0 then
        raise exception 'GATE(c): grant hygiene is not clean: %', v_gh;
      end if;
    end;
  end if;
  raise notice 'retire-daily-tasks: hr_claim_daily off the client surface, baseline and hygiene clean';
end $$;
