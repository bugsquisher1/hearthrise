-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-20-bestiary.sql — THE PER-MONSTER KILL-COUNT READ PROJECTION.
-- Slice 1 of the live-progress programme (docs/design/live-settlement.md).
--
-- Backend Architect, 2026-08-20. STAGED, NOT APPLIED (the Coordinator applies).
--
-- ── WHAT SHIPS, AND WHAT DOES NOT ────────────────────────────────────────
-- The bestiary WRITE needs NO migration: the accrual engine folds one
-- `{kind:'stat', key:'ev:kill_monster:<id>', period:'', add:n, state:'active'}`
-- op into the combat delta, and 'stat' is already in hr_apply's six-kind
-- allowlist, the key is ≤64 chars, period='' passes hr_unlock_guard, and the
-- add is clamped against c_max_progress_add. So the rows land the day the Edge
-- payload deploys, with no schema change (asserted end-to-end in
-- tests/goal-counters.mjs against the real hr_apply).
--
-- This file ships ONLY the READ: `hr_bestiary_of(user, slot)`, a dedicated
-- projection that pulls the `ev:kill_monster:%` population out on its OWN read
-- rather than through hr_state_of's shared, LIMIT-1000, `progress_truncated`
-- envelope. This is the exact call hr_perks_of made for the artisan model
-- (2026-08-16-artisan-progress-model.sql §5, "WHY hr_perks_of AND NOT
-- hr_state_of"): a projection that depends on an incidental ORDER BY for
-- correctness is a projection that silently loses a monster to a player with
-- many dailies. The bestiary is 108 permanent rows per character TODAY — well
-- under 1000 — but it is a population that GROWS with the roster, and the
-- collection log (next slice) shares that envelope, so it gets its own door now.
--
-- ⚠ WHAT THIS FILE DELIBERATELY DOES NOT DO: it does NOT modify hr_state_of to
--   EXCLUDE `ev:kill_monster:%` from the generic envelope. hr_state_of is the
--   highest-risk `create or replace` in the repo (its own migrations say so),
--   and 108 rows do not breach the 1000 cap, so the exclusion is a FOLLOW-UP
--   gated on the collection log landing — at which point the two populations
--   together approach the cap and hr_state_of should drop BOTH prefixes in one
--   reviewed change. Until then hr_state_of still returns bestiary rows; that is
--   redundant with this projection, not wrong.
--
-- ── SECURITY POSTURE — MIRRORS hr_state_of EXACTLY ───────────────────────
-- SECURITY DEFINER, executable by `hr_engine` ONLY (the Edge role that verifies
-- the JWT and passes the verified id as p_user), revoked from public / anon /
-- authenticated / service_role. There is no direct-client RPC in this
-- architecture — every read is Edge-mediated — so a grant to `authenticated`
-- would only open a second, unfiltered read path over every character's kills.
-- The client wiring (a verb or an envelope key that surfaces this) is the
-- Systems Engineer's follow-up and is out of Slice 1's scope.
--
-- REVERSIBILITY: `drop function public.hr_bestiary_of(uuid, int);`. Additive,
-- reads only, holds no state.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress is missing — apply 2026-08-11-player-state.sql first';
  end if;
end $$;

-- ── THE PROJECTION ───────────────────────────────────────────────────────
-- Returns table(monster_id text, kills bigint), one row per monster the
-- character has ever killed, read by the `ev:kill_monster:` prefix. The id is
-- the key with the 16-char prefix stripped (`substring(key from 17)`), which is
-- the exact inverse of src/core/goals.js `bestiaryKey`. Permanent rows only
-- (period_key=''), value>0 — a zero row is not written by the engine and would
-- be a monster never killed.
create or replace function public.hr_bestiary_of(p_user uuid, p_slot int)
returns table(monster_id text, kills bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $body$
  select substring(pp.key from 17) as monster_id,
         pp.value                  as kills
    from public.player_progress pp
   where pp.user_id    = p_user
     and pp.slot       = coalesce(p_slot, 0)
     and pp.kind       = 'stat'
     and pp.period_key = ''
     and pp.value      > 0
     and pp.key like 'ev:kill_monster:%'
$body$;

revoke execute on function public.hr_bestiary_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_bestiary_of(uuid, int) to hr_engine;

-- ── SELF-VERIFYING BLOCK ─────────────────────────────────────────────────
-- Each load-bearing property, executed. A projection that reads the wrong
-- prefix, a client that can execute it, a client that can WRITE the key space,
-- or an hr_apply a client can call — every one is a way the bestiary becomes
-- forgeable, so every one is asserted with a control.
do $$
declare
  v_uid uuid := '00000000-0000-4000-c000-b3571a1c0000';
  v_n   int;
  v_kills bigint;
begin
  -- (a) THE PROJECTION IS NOT CLIENT-EXECUTABLE. hr_engine only, like hr_state_of.
  if has_function_privilege('authenticated', to_regprocedure('public.hr_bestiary_of(uuid, int)'), 'execute')
     or has_function_privilege('anon', to_regprocedure('public.hr_bestiary_of(uuid, int)'), 'execute')
     or has_function_privilege('service_role', to_regprocedure('public.hr_bestiary_of(uuid, int)'), 'execute') then
    raise exception 'hr_bestiary_of is client-executable — a second unfiltered read over every player''s kills';
  end if;
  if not has_function_privilege('hr_engine', to_regprocedure('public.hr_bestiary_of(uuid, int)'), 'execute') then
    raise exception 'hr_bestiary_of is not executable by hr_engine — the Edge read path cannot call it';
  end if;

  -- (b) hr_apply IS STILL NOT CLIENT-EXECUTABLE. The write side of the key
  --     space is a SECURITY DEFINER RPC no client may call — re-asserted here
  --     because this file adds a reader over the same rows.
  if has_function_privilege('authenticated', to_regprocedure('public.hr_apply(uuid, int, bigint, uuid, jsonb)'), 'execute')
     or has_function_privilege('anon', to_regprocedure('public.hr_apply(uuid, int, bigint, uuid, jsonb)'), 'execute') then
    raise exception 'hr_apply is client-executable — the whole key space is client-writable';
  end if;

  -- (c) NO CLIENT WRITE SURFACE ON THE KEY SPACE. A client that could INSERT a
  --     player_progress row could forge any bestiary count. (Inherited from
  --     player-state; asserted because this file makes the rows readable.)
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema='public' and table_name='player_progress'
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_n > 0 then raise exception '% client write grants on player_progress', v_n; end if;
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='player_progress' and cmd <> 'SELECT') then
    raise exception 'player_progress grew a non-SELECT policy — a client-writable bestiary count';
  end if;

  -- (d) BEHAVIOUR — the prefix read is CORRECT and DISCRIMINATING. Seed two
  --     bestiary rows and one NON-bestiary stat row, then prove the projection
  --     returns exactly the two, strips the prefix, and excludes the decoy.
  insert into auth.users (id) values (v_uid) on conflict do nothing;
  -- player_progress has an FK to player_state(user_id, slot); a character must
  -- exist before a progress row can. Create one AS this user (hr_create_character
  -- reads auth.uid()), then tear it down at the end.
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  perform public.hr_create_character(0);
  delete from public.player_progress where user_id = v_uid;   -- idempotent re-run
  insert into public.player_progress (user_id, slot, kind, key, period_key, value, state) values
    (v_uid, 0, 'stat', 'ev:kill_monster:slime',  '', 7,  'active'),
    (v_uid, 0, 'stat', 'ev:kill_monster:goblin', '', 3,  'active'),
    (v_uid, 0, 'stat', 'ev:kill_any',            '', 10, 'active'),   -- the aggregate, MUST be excluded
    (v_uid, 0, 'stat', 'kills',                  '', 10, 'active');   -- the Hero-screen counter, MUST be excluded

  select count(*) into v_n from public.hr_bestiary_of(v_uid, 0);
  if v_n <> 2 then
    raise exception 'hr_bestiary_of returned % rows, expected 2 — the prefix read is wrong (a decoy leaked or a real row was dropped)', v_n;
  end if;
  select kills into v_kills from public.hr_bestiary_of(v_uid, 0) where monster_id = 'slime';
  if v_kills is distinct from 7 then
    raise exception 'hr_bestiary_of read slime kills = %, expected 7 (the prefix strip is wrong)', v_kills;
  end if;
  if exists (select 1 from public.hr_bestiary_of(v_uid, 0) where monster_id = 'ev:kill_any' or monster_id = '') then
    raise exception 'hr_bestiary_of leaked a non-bestiary stat row into the bestiary';
  end if;

  delete from public.player_progress where user_id = v_uid;
  delete from public.player_state where user_id = v_uid;
  delete from auth.users where id = v_uid;
  raise notice 'bestiary §self-check PASSED: hr_engine-only projection, no client write surface, prefix read correct and discriminating.';
end $$;
