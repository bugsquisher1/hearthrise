-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-21-collection.sql — THE PER-ITEM LOOTED-QUANTITY READ PROJECTION.
-- Slice 2 of the live-progress programme (docs/design/live-settlement.md).
--
-- Backend Architect, 2026-08-21. STAGED, NOT APPLIED (the Coordinator applies).
--
-- ── WHAT SHIPS, AND WHAT DOES NOT ────────────────────────────────────────
-- The collection WRITE needs NO migration, exactly as the bestiary's did not:
-- the accrual engine folds one
-- `{kind:'stat', key:'ev:loot:<item_id>', period:'', add:qty, state:'active'}`
-- op per distinct dropped item into the combat delta, and 'stat' is already in
-- hr_apply's six-kind allowlist, the key is ≤64 chars, period='' passes
-- hr_unlock_guard, and the add is clamped against c_max_progress_add. So the
-- rows land the day the Edge payload deploys, with no schema change (asserted
-- end-to-end in tests/goal-counters.mjs against the real hr_apply).
--
-- This file ships ONLY the READ: `hr_collection_of(user, slot)`, a dedicated
-- projection that pulls the `ev:loot:%` population out on its OWN read rather
-- than through hr_state_of's shared, LIMIT-1000, `progress_truncated` envelope
-- — the exact call hr_bestiary_of / hr_perks_of make, and for the same reason:
-- a projection that depends on an incidental ORDER BY for correctness silently
-- loses an item to a player with many other progress rows. The collection is up
-- to 518 permanent rows per character (the whole ITEMS catalogue); together with
-- the bestiary (≤108) the two now APPROACH hr_state_of's 1000-row envelope cap,
-- which is why 2026-08-21-streak-state.sql EXCLUDES BOTH prefixes from the
-- generic progress read in one reviewed change — this file gives collection its
-- own door so that exclusion loses nothing.
--
-- ── SECURITY POSTURE — MIRRORS hr_state_of / hr_bestiary_of EXACTLY ───────
-- SECURITY DEFINER, executable by `hr_engine` ONLY (the Edge role that verifies
-- the JWT and passes the verified id as p_user), revoked from public / anon /
-- authenticated / service_role. There is no direct-client RPC in this
-- architecture — every read is Edge-mediated — so a grant to `authenticated`
-- would only open a second, unfiltered read path over every character's loot.
-- The client wiring (a verb or an envelope key that surfaces this) is the
-- Systems Engineer's follow-up and is out of Slice 2's scope.
--
-- REVERSIBILITY: `drop function public.hr_collection_of(uuid, int);`. Additive,
-- reads only, holds no state.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress is missing — apply 2026-08-11-player-state.sql first';
  end if;
end $$;

-- ── THE PROJECTION ───────────────────────────────────────────────────────
-- Returns table(item_id text, qty bigint), one row per item the character has
-- ever looted, read by the `ev:loot:` prefix. The id is the key with the 8-char
-- prefix stripped (`substring(key from 9)`), which is the exact inverse of
-- src/core/goals.js `lootKey`. Permanent rows only (period_key=''), value>0.
create or replace function public.hr_collection_of(p_user uuid, p_slot int)
returns table(item_id text, qty bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $body$
  select substring(pp.key from 9) as item_id,
         pp.value                 as qty
    from public.player_progress pp
   where pp.user_id    = p_user
     and pp.slot       = coalesce(p_slot, 0)
     and pp.kind       = 'stat'
     and pp.period_key = ''
     and pp.value      > 0
     and pp.key like 'ev:loot:%'
$body$;

revoke execute on function public.hr_collection_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_collection_of(uuid, int) to hr_engine;

-- ── SELF-VERIFYING BLOCK ─────────────────────────────────────────────────
-- Each load-bearing property, executed with a control. A projection that reads
-- the wrong prefix, a client that can execute it, a client that can WRITE the
-- key space, or an hr_apply a client can call — every one is a way the
-- collection becomes forgeable, so every one is asserted.
do $$
declare
  v_uid uuid := '00000000-0000-4000-c000-c0113c710000';
  v_n   int;
  v_qty bigint;
begin
  -- (a) THE PROJECTION IS NOT CLIENT-EXECUTABLE. hr_engine only, like hr_state_of.
  if has_function_privilege('authenticated', to_regprocedure('public.hr_collection_of(uuid, int)'), 'execute')
     or has_function_privilege('anon', to_regprocedure('public.hr_collection_of(uuid, int)'), 'execute')
     or has_function_privilege('service_role', to_regprocedure('public.hr_collection_of(uuid, int)'), 'execute') then
    raise exception 'hr_collection_of is client-executable — a second unfiltered read over every player''s loot';
  end if;
  if not has_function_privilege('hr_engine', to_regprocedure('public.hr_collection_of(uuid, int)'), 'execute') then
    raise exception 'hr_collection_of is not executable by hr_engine — the Edge read path cannot call it';
  end if;

  -- (b) hr_apply IS STILL NOT CLIENT-EXECUTABLE. The write side of the key
  --     space is a SECURITY DEFINER RPC no client may call.
  if has_function_privilege('authenticated', to_regprocedure('public.hr_apply(uuid, int, bigint, uuid, jsonb)'), 'execute')
     or has_function_privilege('anon', to_regprocedure('public.hr_apply(uuid, int, bigint, uuid, jsonb)'), 'execute') then
    raise exception 'hr_apply is client-executable — the whole key space is client-writable';
  end if;

  -- (c) NO CLIENT WRITE SURFACE ON THE KEY SPACE. A client that could INSERT a
  --     player_progress row could forge any collection count.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema='public' and table_name='player_progress'
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_n > 0 then raise exception '% client write grants on player_progress', v_n; end if;
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='player_progress' and cmd <> 'SELECT') then
    raise exception 'player_progress grew a non-SELECT policy — a client-writable collection count';
  end if;

  -- (d) BEHAVIOUR — the prefix read is CORRECT and DISCRIMINATING. Seed two
  --     collection rows and decoys (the bestiary key, the aggregate, a Hero
  --     stat), then prove the projection returns exactly the two, strips the
  --     prefix, and excludes every decoy.
  insert into auth.users (id) values (v_uid) on conflict do nothing;
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  perform public.hr_create_character(0);
  delete from public.player_progress where user_id = v_uid;   -- idempotent re-run
  insert into public.player_progress (user_id, slot, kind, key, period_key, value, state) values
    (v_uid, 0, 'stat', 'ev:loot:bones',           '', 42, 'active'),
    (v_uid, 0, 'stat', 'ev:loot:slime_gel',       '', 5,  'active'),
    (v_uid, 0, 'stat', 'ev:kill_monster:slime',   '', 7,  'active'),   -- bestiary, MUST be excluded
    (v_uid, 0, 'stat', 'ev:kill_any',             '', 10, 'active'),   -- the aggregate, MUST be excluded
    (v_uid, 0, 'stat', 'rare_drops',              '', 3,  'active');   -- a Hero stat, MUST be excluded

  select count(*) into v_n from public.hr_collection_of(v_uid, 0);
  if v_n <> 2 then
    raise exception 'hr_collection_of returned % rows, expected 2 — the prefix read is wrong (a decoy leaked or a real row was dropped)', v_n;
  end if;
  select qty into v_qty from public.hr_collection_of(v_uid, 0) where item_id = 'bones';
  if v_qty is distinct from 42 then
    raise exception 'hr_collection_of read bones qty = %, expected 42 (the prefix strip is wrong)', v_qty;
  end if;
  if exists (select 1 from public.hr_collection_of(v_uid, 0)
              where item_id like 'ev:%' or item_id like 'kill_monster:%' or item_id = '') then
    raise exception 'hr_collection_of leaked a non-collection stat row into the collection';
  end if;

  delete from public.player_progress where user_id = v_uid;
  delete from public.player_state where user_id = v_uid;
  delete from auth.users where id = v_uid;
  raise notice 'collection §self-check PASSED: hr_engine-only projection, no client write surface, prefix read correct and discriminating.';
end $$;
