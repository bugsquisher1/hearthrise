-- ============================================================================
-- 2026-08-13-beta-invite-check-volatile.sql
--
-- APPLIED TO PRODUCTION 2026-08-13, immediately after
-- 2026-08-13-anon-rate-gate.sql + A11's §3b. This file exists so db == repo.
--
-- WHAT HAPPENED — a live sign-up outage, caused by closing A11, found by the
-- post-apply check rather than by a player.
--
-- `beta_invite_check(text)` was declared STABLE. That was TRUE for as long as
-- hr_rpc_gate short-circuited anonymous callers with
--
--     if v_uid is null then return true; end if;
--
-- because an anon call then reached no counter and wrote nothing.
-- 2026-08-13-anon-rate-gate.sql deletes that line — which is its entire point —
-- so an anonymous call now goes down the hr_rate_ok path and INSERTs into
-- hr_rate_counters. STABLE became a false declaration the instant that landed,
-- and PostgREST honours the declaration by running STABLE functions in a
-- READ-ONLY transaction. Every anonymous call therefore returned
--
--     {"code":"25006","message":"cannot execute INSERT in a read-only transaction"}
--
-- and beta_invite_check is what the sign-up modal calls BEFORE an account
-- exists. New-player sign-up was dead. Measured, both before and after.
--
-- THE LESSON, which is the reason this file carries a header at all:
-- A VOLATILITY DECLARATION IS A CLAIM ABOUT THE WHOLE CALL TREE, NOT ABOUT THE
-- BODY YOU ARE LOOKING AT. Nothing in beta_invite_check changed. A function it
-- calls, two levels down, gained a write — and that silently converted a
-- correct declaration into a lie that PostgREST enforces. Sibling case already
-- recorded in this repo: apply-engine §6(f) asserts hr_state_of's volatility
-- structurally, and daily-budget asserts `provolatile = 'v'` on
-- hr_day_budget_used, both for exactly this reason.
--
-- WHY THIS AND NOT "MAKE THE GATE NOT WRITE FOR ANON": the write IS the rate
-- limit. Not writing means not counting, which is the hole 2026-08-13-anon-
-- rate-gate.sql was written to close. The honest declaration is VOLATILE.
--
-- COST: PostgREST will now run beta_invite_check in a read-write transaction.
-- That is correct and unavoidable for a function that counts calls, and it is
-- the same posture hr_leaderboard already had (verified: provolatile = 'v',
-- which is why IT did not break).
--
-- ONLY the volatility changes. `alter function ... volatile` does not touch the
-- body, the ACL, or the search_path pin.
-- ============================================================================

alter function public.beta_invite_check(text) volatile;

-- ── SELF-CHECK — the commit gate ────────────────────────────────────────────
do $$
declare v_vol char;
begin
  select provolatile into v_vol
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'beta_invite_check';

  if v_vol is null then
    raise exception 'SELF-CHECK INVALID: beta_invite_check(text) does not exist, so this file asserted nothing';
  end if;
  if v_vol <> 'v' then
    raise exception 'SELF-CHECK FAILED: beta_invite_check is still % — anonymous sign-up stays broken', v_vol;
  end if;

  -- The point of the whole exercise: anon must still be able to CALL it. A
  -- lockdown that also removes the replacement read is not a lockdown, it is
  -- an outage.
  if not has_function_privilege('anon', 'public.beta_invite_check(text)', 'execute') then
    raise exception 'SELF-CHECK FAILED: anon cannot execute beta_invite_check — sign-up is dead';
  end if;

  -- A11 must still be closed. If a later file re-opens the table this fires.
  if has_table_privilege('anon', 'public.beta_invites', 'select') then
    raise exception 'SELF-CHECK FAILED: anon regained SELECT on beta_invites — A11 re-opened';
  end if;

  raise notice 'beta_invite_check is VOLATILE, anon-executable, and beta_invites stays closed.';
end $$;
