-- 2026-08-11 — clan member cap enforcement (Security pass 2, finding S-CAP)
--
-- FINDING (CONFIRMED by execution against production inside `begin … rollback`,
-- 2026-08-11):
--
--   `clan_members` has NO server-side join path at all. Nothing in `pg_proc`
--   inserts into it — the only writer is the RLS policy "join as self"
--   (INSERT, `auth.uid() = user_id AND contributed = 0 AND cp = 0 AND
--   charge IS NULL AND role = 'member'`). That policy pins the *columns* an
--   attacker may forge, which is correct and was the fix for the earlier clan
--   takeover — but it constrains nothing about WHICH clan is joined, and there
--   is no invite, no ban list, no rate limit, no journal, and no cap.
--
--   Consequently: any authenticated account can insert itself into any clan,
--   uninvited, and immediately act on that clan's shared surfaces. Proven:
--   an outsider joined a live 2-member clan (members 2 → 3) and then
--   successfully called `clan_board_roll` on it. Controls in the same
--   transaction fired correctly (a forged `role='leader'` row was refused
--   42501; a direct `UPDATE clans SET treasury` was invisible under RLS), so
--   the probe was demonstrably able to see failure.
--
--   `hr_castle_tiers.member_cap` (10 / 15 / 25 / 40 / 60) is authored, is
--   returned to the client by `clan_seat_read`, and is enforced NOWHERE — a
--   `pg_proc` scan finds it referenced only by `clan_seat_read__ungated` and
--   `clan_tier_up__ungated`, in both cases as display data. Proven: filling a
--   tier-1 clan to 15 members was accepted without complaint.
--
--   THE VALUE THAT CROSSES TO OTHER PLAYERS: `clan_hunt_declare` sizes the
--   week's boss as `hr_hunt_pool(tier, count(*) from clan_members)` and then
--   LOCKS it for the week (`on conflict (clan_id, week_key) do nothing`).
--   At tier 3 that is 30,000 + 12,500 × members — 55,000 HP at 2 members,
--   655,000 at 50 (11.9×), measured by executing the function. An attacker
--   with alt accounts joins a rival clan uninvited before its declaration and
--   makes that week's hunt unclearable. The victims cannot evict them
--   (`clan_set_role` / `clan_claim_leadership` are `service_role`-only; there
--   is no kick RPC).
--
-- WHAT THIS FILE DOES, AND WHAT IT DELIBERATELY DOES NOT DO:
--   It enforces `member_cap`, which is authored data already shown to players
--   as a cap. That is an implementation gap, not a design question, so it is
--   safe for Security to close. It bounds the amplification to the cap the
--   designer already wrote.
--
--   It does NOT decide whether clans are open-to-all or invite-only. That is a
--   Game Designer / Backend Architect call and it is the real fix; the cap only
--   bounds the blast radius. See the Security report: uninvited join, the
--   missing kick RPC, the unjournalled join, and the ungated join surface all
--   remain OPEN after this file.
--
-- The lock is an advisory xact lock rather than `SELECT … FOR UPDATE` on
-- `clans`, so this introduces no new table lock-ordering edge against
-- `clan_board_claim` / `clan_work_complete` / `clan_tier_up`, all of which
-- touch `clan_members` and `clans` in the opposite order.

create or replace function public.hr_clan_member_cap_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_tier int;
  v_cap  int;
  v_now  int;
begin
  -- Serialise concurrent joins to the same clan. Without this the count below
  -- is a read-modify-write and two simultaneous joins both see cap-1.
  perform pg_advisory_xact_lock(hashtext('hr_clan_join:' || new.clan_id::text));

  select greatest(1, coalesce(castle_tier, 1)) into v_tier
    from public.clans where id = new.clan_id;
  if v_tier is null then
    -- No such clan. Let the foreign key be the one to say so.
    return new;
  end if;

  select member_cap into v_cap from public.hr_castle_tiers where tier = v_tier;
  -- Fail CLOSED on an unknown tier: fall back to the lowest authored cap, not
  -- to "unlimited". An absent row must never widen a limit.
  v_cap := coalesce(v_cap, (select min(member_cap) from public.hr_castle_tiers), 10);

  select count(*) into v_now from public.clan_members where clan_id = new.clan_id;
  if v_now >= v_cap then
    raise exception 'clan_full'
      using errcode = 'HR409',
            detail  = format('clan %s holds %s of %s seats (castle_tier %s)',
                             new.clan_id, v_now, v_cap, v_tier);
  end if;

  return new;
end
$fn$;

revoke all on function public.hr_clan_member_cap_guard() from public;
revoke all on function public.hr_clan_member_cap_guard() from anon, authenticated;

drop trigger if exists hr_clan_member_cap on public.clan_members;
create trigger hr_clan_member_cap
  before insert on public.clan_members
  for each row execute function public.hr_clan_member_cap_guard();

-- ---------------------------------------------------------------------------
-- SELF-CHECK — this is the commit gate. `apply_migration` is atomic on this
-- project, so a raise here aborts the whole file.
--
-- It is mutation-proven: the "member_cap + 1 is refused" assertion was executed
-- against production BEFORE this file existed and the insert was ACCEPTED, so
-- the assertion is known to fail without the trigger rather than merely being
-- believed to. The paired control ("cap legal joins were accepted") exists so a
-- guard that refuses EVERYTHING cannot pass this block by refusing the probe.
--
-- The fixture rolls itself back through a sentinel SQLSTATE. PL/pgSQL variables
-- are not transactional, so the two booleans survive the subtransaction abort,
-- which is what lets the assertions run after the fixture is gone.
-- ---------------------------------------------------------------------------
do $$
declare
  c_instance constant uuid := '00000000-0000-0000-0000-000000000000';
  v_cap  int;
  v_clan uuid;
  v_u    uuid;
  i      int;
  v_at_cap_accepted boolean := false;   -- CONTROL
  v_over_refused    boolean := false;   -- the property under test
begin
  if to_regclass('public.clan_members') is null then
    raise exception 'SELF-CHECK: clan_members is missing; wrong database';
  end if;
  select member_cap into v_cap from public.hr_castle_tiers where tier = 1;
  if coalesce(v_cap, 0) < 1 then
    raise exception 'SELF-CHECK: hr_castle_tiers has no tier-1 member_cap to enforce';
  end if;

  begin
    v_u := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email)
      values (v_u, c_instance, 'authenticated', 'authenticated', 'capguard-owner@probe.invalid');
    insert into public.clans (name, created_by)
      values ('__capguard_probe__', v_u) returning id into v_clan;

    for i in 1..v_cap loop
      v_u := gen_random_uuid();
      insert into auth.users (id, instance_id, aud, role, email)
        values (v_u, c_instance, 'authenticated', 'authenticated',
                'capguard-' || i || '@probe.invalid');
      insert into public.clan_members (clan_id, user_id) values (v_clan, v_u);
    end loop;
    v_at_cap_accepted := true;

    begin
      v_u := gen_random_uuid();
      insert into auth.users (id, instance_id, aud, role, email)
        values (v_u, c_instance, 'authenticated', 'authenticated', 'capguard-over@probe.invalid');
      insert into public.clan_members (clan_id, user_id) values (v_clan, v_u);
    exception when sqlstate 'HR409' then
      v_over_refused := true;
    end;

    raise exception using errcode = 'HR999', message = 'capguard fixture rollback';
  exception when sqlstate 'HR999' then
    null;   -- fixture discarded; the booleans above survive
  end;

  if not v_at_cap_accepted then
    raise exception 'SELF-CHECK FAILED: the guard refused a LEGAL join below member_cap (%). A guard that refuses everything is not a guard.', v_cap;
  end if;
  if not v_over_refused then
    raise exception 'SELF-CHECK FAILED: joining a clan already at member_cap (%) was ACCEPTED. The trigger is not in effect.', v_cap;
  end if;

  raise notice 'hr_clan_member_cap: cap=% enforced; % legal joins accepted, cap+1 refused HR409', v_cap, v_cap;
end
$$;
