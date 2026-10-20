-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — RETIRE hr_hunt_party_create (lane b-live-hunt, systems-engineer,
-- 2026-10-20; CONFLICTS 2026-10-19 "the one-way party flow", character-session
-- follow-up). STAGED. Game CLOSED: applies on its passing §2; part of the
-- reopen gate's Security review (a door removed, nothing added).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- PARTY_SPEC §2 deleted "Make a party": the FIRST INVITE makes the party
-- (hr_hunt_party_invite / hr_hunt_party_invite_own, 2026-10-28-party-flow.sql,
-- restated by 2026-10-29-party-security.sql). The client's createParty went
-- with the Party window rebuild (lane/b-party-system) and the CharacterSession
-- method with lane/b-live-hunt, so the RPC has no caller. It is dropped with its
-- grant and its hr_client_rpc_baseline row. hr_hunt_party_join STAYS (the
-- finder's Join, party-finder.js).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- One authenticated door fewer: a party could be opened bound to a ground
-- before anyone was in it (the backwards flow PARTY_SPEC removed). Moves no
-- value; no table, row or other body changes.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_party_create, its grant and its baseline row from
-- 2026-10-23-hunt-party.sql (§ the verbs, § grants).
-- ORDER: after 2026-10-29-party-security.sql (last in the chain). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_hunt_party_list(integer,boolean,uuid)') is null
     or to_regprocedure('public.hr_party_join_for(uuid,integer,uuid,boolean)') is null then
    raise exception 'PRECONDITION: apply 2026-10-29-party-security.sql first (the invite makes the party)'; end if;
  if to_regprocedure('public.hr_hunt_party_invite(integer,text,uuid)') is null
     or to_regprocedure('public.hr_hunt_party_invite_own(integer,integer,uuid)') is null then
    raise exception 'PRECONDITION: the invite verbs that make a party are missing'; end if;
end $mig$;

-- ── §1 THE DOOR GOES ─────────────────────────────────────────────────────────
drop function if exists public.hr_hunt_party_create(integer, text, uuid);
delete from public.hr_client_rpc_baseline where proname = 'hr_hunt_party_create';

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED ───────────────────────────────────
do $$
declare v_role text;
begin
  -- (a) gone from the catalogue and the baseline, every overload.
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'hr_hunt_party_create') then
    raise exception 'VERIFY(a): hr_hunt_party_create is still installed'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_hunt_party_create') then
    raise exception 'VERIFY(a): hr_hunt_party_create is still baselined'; end if;
  -- (b) the doors that replace it are still the client's (and only the client's).
  foreach v_role in array array['anon'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_party_invite(integer,text,uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_party_join(integer,uuid,uuid)', 'execute') then
      raise exception 'VERIFY(b): % reaches a party verb', v_role; end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_hunt_party_invite(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_party_invite_own(integer,integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_party_join(integer,uuid,uuid)', 'execute') then
    raise exception 'VERIFY(b): a party verb the client calls lost its grant'; end if;
  -- (c) the client RPC surface still matches its baseline.
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-create-retire: hr_hunt_party_create and its baseline row are gone; invite / join keep their grants; grant hygiene green';
end $$;
