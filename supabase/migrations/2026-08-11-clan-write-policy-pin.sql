-- ════════════════════════════════════════════════════════════════════════
-- A1 + A2 (P0, LIVE) — clan takeover and forged clan stats, via TABLE writes.
-- APPLIED TO PRODUCTION 2026-08-11.
--
-- Both INSERT policies checked ONLY the identity column and left every derived
-- column unconstrained, with no trigger behind them. Proven by execution against
-- production (Security Engineer audit, findings A1/A2):
--   * DELETE own clan_members row, then INSERT {clan_id:<any>, user_id:me,
--     role:'leader', cp:2e9, contributed:2e9}  -> accepted.
--     clan_set_role then LEGITIMATELY demoted the real leader.
--   * INSERT clans {treasury:999999999999, level:10, standing:999999999,
--     castle_tier:5, upgrades:{...}}           -> accepted verbatim.
--     `standing` feeds the clan_power leaderboard; `treasury` is withdrawable.
--
-- THE LESSON, worth keeping: a guarded RPC is only as strong as the write
-- privileges on the table it reads authority from. clan_set_role authorises
-- correctly — it just asked a row the attacker had written. Same rule the design
-- doc already states for profiles.display_name, applied to clan_members.role.
--
-- FIXED WITHOUT A CLIENT CHANGE. src/features/clans.js sends only
-- {name, created_by} for a clan (:122) and {clan_id, user_id, role} for
-- membership (:139), with role='leader' ONLY when founding, immediately after
-- creating the clan. So every other column is pinned to its default, and
-- 'leader' is narrowed to exactly the legitimate case: the creator of a clan
-- that still has no members.
--
-- QUEUED, NOT DONE: the durable form is clan_create(name) / clan_join(clan_id)
-- RPCs that server-set every derived column, plus revoking INSERT/UPDATE/DELETE
-- on both tables from anon+authenticated. That needs a client change.
--
-- VERIFIED ON PRODUCTION inside a rolled-back probe, with two real auth.users:
--   A2=CLOSED  A1_LEADER=CLOSED  A1_CP=CLOSED  FOUND=OK  JOIN=OK
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "clans creatable" on public.clans;
create policy "clans creatable" on public.clans
  for insert to authenticated
  with check (
    auth.uid() = created_by
    and level        = 1
    and treasury     = 0
    and standing     = 0
    and castle_tier  = 1
    and ration_debt  = 0
    and upgrades     = '{}'::jsonb
    and upkeep_state = 'active'
    and upkeep_settled_at is null
  );

-- ── OWNERSHIP CEDED (2026-08-11, Backend Architect) ────────────────────────
-- The `create policy "join as self"` that stood HERE has moved to
-- 2026-08-11-clan-membership-authority.sql §11, which is now its single owner.
--
-- THREE files ended up defining this one policy on 2026-08-11 — this one (A1,
-- the clan takeover), 2026-08-11-raid-claim-authority.sql (R4, the backdated
-- `joined_at`) and 2026-08-11-clan-membership-authority.sql (S-CAP-1, the
-- invite-only door). In filename order THIS file sorts LAST, so a replay of the
-- migrations would have installed the shortest of the three definitions and
-- silently deleted both the joined_at pin and the door — while every one of the
-- three self-checks still passed, because each only asserts its own terms.
-- Found by the new one-owner lint in tests/run-sql-tests.mjs, not by review.
--
-- NOTHING IS LOST. A1's pins (user_id, contributed, cp, charge, and `leader`
-- reachable only by the founder of an empty clan) survive verbatim in the
-- merged policy, and the ASSERTION below is kept exactly as written — it now
-- guards whatever definition is live rather than the one this file used to
-- install, which is strictly the better guard.
--
-- The `clans creatable` policy above is still owned HERE; only the
-- clan_members one moved.

do $$
declare v_clans text; v_mem text;
begin
  select pg_get_expr(polwithcheck, polrelid) into v_clans
    from pg_policy where polrelid='public.clans'::regclass and polname='clans creatable';
  select pg_get_expr(polwithcheck, polrelid) into v_mem
    from pg_policy where polrelid='public.clan_members'::regclass and polname='join as self';

  if v_clans is null or v_clans !~ 'treasury' or v_clans !~ 'standing' or v_clans !~ 'castle_tier' then
    raise exception 'clans INSERT policy does not pin the derived columns: %', coalesce(v_clans,'<none>');
  end if;
  if v_mem is null or v_mem !~ 'cp' or v_mem !~ 'contributed' or v_mem !~ 'leader' then
    raise exception 'clan_members INSERT policy does not pin role/cp/contributed: %', coalesce(v_mem,'<none>');
  end if;
  if exists (select 1 from pg_policy where polrelid='public.clans'::regclass and polcmd in ('w','*'))
  or exists (select 1 from pg_policy where polrelid='public.clan_members'::regclass and polcmd in ('w','*')) then
    raise exception 'an UPDATE/ALL policy exists on a clan table — derived columns would be mutable after insert';
  end if;

  raise notice 'CLAN WRITE POLICIES OK — derived columns pinned; leader reachable only by the founder of an empty clan';
end $$;
