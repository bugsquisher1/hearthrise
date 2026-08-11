-- ============================================================================
-- 2026-08-12-clan-members-rls-drop.sql   — STEP 2 OF 2. NOT APPLIED.
--
-- ⚠ DO NOT APPLY THIS FILE UNTIL THE PRECONDITION BELOW IS TRUE. Applying it
--   early takes clan joining, founding and leaving OFFLINE for every player
--   still running a cached build, with no client-side error anybody can read —
--   the REST call simply returns 401/42501.
--
-- PRECONDITION (all three, verified, not assumed):
--   1. A build containing the `src/features/clans.js` rewrite (createClan →
--      rpc/clan_create, joinById → rpc/clan_join, leave → rpc/clan_leave) is
--      DEPLOYED — not merged, deployed.
--   2. The cache-buster has been bumped and the service worker has rolled, so
--      no player is executing the previous module. The project's own note is
--      that a stale `?v=` runs old code for ~10 minutes after a deploy; wait
--      past that, and past any long-lived tab.
--   3. `select count(*) from public.clan_ledger where kind = 'member'` is
--      NON-ZERO, i.e. at least one real player has joined through the RPC. If
--      it is zero, either nobody has joined since the deploy or the client is
--      still on the raw path — find out which BEFORE dropping the policy.
--      §2 of this file asserts (3) and refuses to run without it.
--
-- WHAT IT CLOSES that 2026-08-11-clan-membership-authority.sql could not:
-- with the raw INSERT still legal for `join_policy='open'` clans, a client can
-- still join an open clan while bypassing the BAN LIST, the invite bookkeeping,
-- the `clan_ledger` journal and the rate limit. None of those is authority —
-- joining an open clan is the intended behaviour — but all four are the
-- accounting that makes abuse detectable, and the ban is the half of the S-KICK
-- remedy that stops an evicted alt walking straight back in.
--
-- It also removes the last two client table-writes in the clan domain:
--   · `leave as self`  (DELETE on clan_members) — a self-delete is unjournalled
--     and, for a leader, leaves a hold with no leadership at all, which is
--     S-KICK arriving by the front door. `clan_leave()` journals the forfeiture
--     and runs succession.
--   · `clans creatable` (INSERT on clans) — founding is a two-step in the old
--     client (POST /clans, then POST /clan_members) and a dropped second step
--     leaves a clan nobody can ever administer. `clan_create()` is one
--     transaction.
--
-- AFTER THIS FILE, `clan_members` and `clans` have NO client write policy of
-- any kind. Every write goes through a SECURITY DEFINER RPC. That is the end
-- state 2026-08-11-clan-write-policy-pin.sql recorded as "QUEUED, NOT DONE".
--
-- REVERSIBILITY: re-apply 2026-08-11-clan-membership-authority.sql §11 for the
-- narrowed `join as self`, and 2026-08-11-clan-write-policy-pin.sql for
-- `clans creatable`. `leave as self` is recreated by the one statement quoted
-- at the bottom of this file. Nothing here touches a row of player data.
-- ============================================================================

-- ── 1. THE DROPS ────────────────────────────────────────────────────────────
drop policy if exists "join as self"   on public.clan_members;
drop policy if exists "leave as self"  on public.clan_members;
drop policy if exists "clans creatable" on public.clans;

-- `memberships readable` / `clans readable` are KEPT. The roster and the clan
-- browser are public reads by design and no client can write through a SELECT.

-- ── 2. SELF-CHECK — the commit gate ─────────────────────────────────────────
do $$
declare
  c_inst constant uuid := '00000000-0000-0000-0000-000000000000';
  v_lead uuid := gen_random_uuid();
  v_atk  uuid := gen_random_uuid();
  v_open uuid;
  m_user text := '<never switched>'; m_bypass text := '<never switched>';
  a_raw_open   boolean := true;   -- PROPERTY: raw join now refused even when OPEN
  a_raw_leave  boolean := true;   -- PROPERTY: raw DELETE now refused
  a_raw_found  boolean := true;   -- PROPERTY: raw clan INSERT now refused
  a_rpc_join   jsonb;             -- CONTROL:  the RPC still works
  a_rpc_leave  jsonb;             -- CONTROL
  v_n bigint;
begin
  -- PRECONDITION 3, asserted rather than trusted.
  select count(*) into v_n from public.clan_ledger where kind = 'member';
  if v_n = 0 then
    raise exception 'REFUSING TO DROP: no clan_ledger row of kind=''member'' exists, so no player has yet joined through clan_join(). Either the client rewrite is not deployed or nobody has used it. Dropping the policy now would take clan joining offline. See the PRECONDITION at the top of this file.';
  end if;

  -- No client write policy may survive on either table.
  select string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ') into m_user
    from pg_policies
   where schemaname = 'public' and tablename in ('clan_members','clans') and cmd <> 'SELECT';
  if m_user is not null then
    raise exception 'a client write policy survived the drop: %', m_user;
  end if;
  m_user := '<never switched>';

  begin
    insert into auth.users (id, instance_id, aud, role, email) values
      (v_lead, c_inst,'authenticated','authenticated','rlsdrop-lead@probe.invalid'),
      (v_atk,  c_inst,'authenticated','authenticated','rlsdrop-atk@probe.invalid');
    insert into public.clans (name, created_by, join_policy)
      values ('__rlsdrop_open__', v_lead, 'open') returning id into v_open;
    insert into public.clan_members (clan_id, user_id, role) values (v_open, v_lead, 'leader');

    perform set_config('request.jwt.claim.sub', v_atk::text, true);
    set local role authenticated;
    m_user := current_user;
    select rolbypassrls::text into m_bypass from pg_roles where rolname = current_user;

    -- PROPERTY · the raw path is gone even for an OPEN clan
    begin
      insert into public.clan_members (clan_id, user_id) values (v_open, v_atk);
    exception when others then a_raw_open := false; end;
    -- PROPERTY · founding by raw INSERT is gone
    begin
      insert into public.clans (name, created_by) values ('__rlsdrop_forged__', v_atk);
    exception when others then a_raw_found := false; end;

    -- CONTROL · the RPC still admits a legitimate join
    a_rpc_join := public.clan_join(v_open);

    -- PROPERTY · leaving by raw DELETE is gone (the row is now really there)
    begin
      delete from public.clan_members where clan_id = v_open and user_id = v_atk;
      a_raw_leave := found;
    exception when others then a_raw_leave := false; end;

    -- CONTROL · the RPC still lets a member out
    a_rpc_leave := public.clan_leave();

    reset role;
    raise exception using errcode = 'HR999', message = 'rls-drop fixture rollback';
  exception when sqlstate 'HR999' then
    reset role;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  if m_user <> 'authenticated' or m_bypass <> 'false' then
    raise exception 'SELF-CHECK INVALID: the probe ran as % (bypassrls=%) — RLS was not in effect', m_user, m_bypass;
  end if;
  if a_raw_open then
    raise exception 'SELF-CHECK FAILED: a raw INSERT still joined an open clan — the policy drop did not take';
  end if;
  if a_raw_found then
    raise exception 'SELF-CHECK FAILED: a raw INSERT still founded a clan';
  end if;
  if a_raw_leave then
    raise exception 'SELF-CHECK FAILED: a raw DELETE still removed a membership row';
  end if;
  if (a_rpc_join->>'ok') is distinct from 'true' then
    raise exception 'SELF-CHECK FAILED: clan_join() no longer works — clan joining is now OFFLINE: %', a_rpc_join;
  end if;
  if (a_rpc_leave->>'ok') is distinct from 'true' then
    raise exception 'SELF-CHECK FAILED: clan_leave() no longer works — players cannot leave: %', a_rpc_leave;
  end if;

  raise notice 'CLAN MEMBERSHIP RLS DROP OK — clan_members and clans have no client write policy; the RPCs are the only door.';
end $$;

-- ── 3. TO UNDO `leave as self` ──────────────────────────────────────────────
--   create policy "leave as self" on public.clan_members
--     for delete to authenticated using (auth.uid() = user_id);
