-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-14-client-state-projection-denylist.sql — THE PURGED KEYS BECOME
-- AUTHORITY KEYS.
--
-- ⚠ STAGED, NOT APPLIED. Security review REQUIRED, and there is a TIMING
--   CONDITION below that is part of the review, not a footnote.
--
-- THE SERVER HALF of the 2026-09-14 projection purge (src/net/client-state.js).
-- Nine fields in RESIDUE_FIELDS were SECOND COPIES of values hr_state_of already
-- projects. Each was measured disagreeing with its column on a live account:
--   · streak            vs state.streak_days      — flame chip 1, column 3
--   · autoEatPct        vs state.auto_eat_pct     — panel 50%, column 25
--   · foodSlot          vs state.auto_eat_food    — HUD cooked_shrimp, column turnip
--   · renownHigh        vs renown_high            — client 1193, column 1058
--   · combatStyle       vs state.combat_style     — "only Attack saves"
--   · toolCarry         vs state.tool_carry       — two fractional carries
--   · heroSlotsUnlocked vs hero_slots             — the b371 dupe's store
--   · ownedThemes       vs gem_unlocks            — ditto, premium entitlement
--   · ownedCosmetics    vs gem_unlocks            — ditto
-- The client half DELETED all nine (allowlist entry, hydrate path, every reader,
-- and the residue PUT stops sending them); tests/arm-homing-guard.mjs fails if a
-- name is re-added or re-written, and the in-page RESIDUE-PURGE-1 proves the
-- reader answers the SERVER for each one.
--
-- WHAT THIS FILE ADDS: the second, independent control. RESIDUE_FIELDS protects
-- against a field being FORGOTTEN; the deny-list protects against one being
-- RE-ADDED — by a future author, or by a crafted PUT from a modified client. A
-- patch naming any of these nine is refused WHOLE with
-- {ok:false, error:'forbidden_field', field:'<name>'}. Same mechanism, same
-- wording and the same re-entrant anchor patch as
-- 2026-09-13-client-state-buffs-denylist.sql.
--
-- ⚠⚠ THE TIMING CONDITION — WHY THIS FILE IS NOT APPLIED WITH ITS CLIENT HALF.
--   The server refuses the ENTIRE patch on a forbidden key, so any client that
--   still SENDS one of these names loses every residue save (lootFilter,
--   achievements, bestiary, the lot) until it reloads. The buffs file could ship
--   with its client half because `buffs` had been in RESIDUE_FIELDS for months
--   and no OTHER build was live. Here, the previous build — the one still running
--   in every tab that has not been reloaded since the cut — sends all nine on
--   every save. So:
--       APPLY THIS ONE FULL RELEASE CYCLE (≥24h) AFTER THE CLIENT HALF IS LIVE,
--       not in the same window.
--   That is the whole risk of this file, and it decays to zero with time. The
--   security property it adds is latent, not live: none of the nine keys is read
--   by any server body today (hr_put_client_state stores client_state verbatim
--   and no engine reads it for authority), so a forged one buys nothing while we
--   wait — exactly the situation `buffs` was in.
--
-- RESTATEMENT-DEBT-ACK: hr_put_client_state__ungated is now 3 anchored patches
-- deep since 2026-08-22-client-state-denylist.sql, and the honest reason not to
-- restate it HERE is that the live body is not readable from an agent's seat: a
-- restatement would install the REPO's idea of the function over production's,
-- silently reverting anything the two differ by — on the one function that
-- decides what a player may store about themselves, and on a body that IS
-- live-hash-tracked precisely because that difference is not assumed to be zero.
-- The debt is real and it is sized: the paydown is a Coordinator-side restatement
-- authored FROM the live body (read it with pg_get_functiondef during the apply
-- window, diff it against tests/schema-drift's replay, then author the whole
-- function in one file), which is a lane of its own and must not ride a
-- deny-list addition. This file adds nine string literals to one array.
--
-- ⚠ THE RULE THIS FILE LEARNED, FOR WHOEVER GROWS THE LIST NEXT: A DENY-LIST
--   GROWTH MUST KEEP EVERY EARLIER HONEST-PUT FIXTURE HONEST. Each deny-list
--   migration's §4 proves "an honest residue put still saves" by naming keys it
--   expects to be ALLOWED, and those fixtures re-run on every chain replay. Adding
--   a name here can therefore turn an ALREADY-APPLIED file's own self-check red —
--   it did: 2026-09-13-client-state-buffs-denylist.sql §2(d) used `combatStyle`,
--   which this file denies, and tests/buff-queue.mjs arm [14] went red on the
--   replay. The payload of an applied file is frozen, but a §4 fixture is NOT
--   prosrc and no live body changes when it is corrected, so the fix is to point
--   that fixture at a key that can never be denied (`lootFilter`, `lockedItems` —
--   client-only preferences that gate nothing server-side). Before adding a name
--   here, grep the migrations for it in an honest-put fixture.
--
-- ── PATCHED, NOT RESTATED ─────────────────────────────────────────────────
-- hr_put_client_state__ungated's live body is whatever its last toucher left
-- (2026-09-13-client-state-buffs-denylist.sql in the repo chain). The array
-- literal is patched at an anchor asserted to appear EXACTLY ONCE, and the patch
-- is re-entrant: a second apply is a notice and a return. A restatement would
-- silently revert whichever file patched last — the b484–b487 class — on the one
-- function that decides what a player may store about themselves.
--
-- ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
-- It moves no value, touches no player row, and changes nothing else about the
-- residue contract (the 256 KiB cap, the idempotency claim and the advisory lock
-- are untouched). Stale copies of these keys already sitting in players' bags are
-- left alone and are INERT: hydrateInto writes only RESIDUE_FIELDS, which no
-- longer lists them, so they are dead bytes rather than state. (Deleting them
-- would be a write to live player rows to tidy keys nothing reads — CLAUDE.md §2.)
-- ⚠ NOT `unlockedRecipes`. It is STILL RESIDUE and still the only record that a
--   scroll was read: hr_state_of projects `unlocked_recipes` as of
--   2026-09-14-recipe-learn.sql, but the client half that SENDS hr_recipe_learn
--   is not built, so denying the key would un-learn every recipe whose scroll is
--   already consumed. It joins this list in the lane that wires the intent.
--
-- REVERSIBILITY: re-apply 2026-09-13-client-state-buffs-denylist.sql (it restates
-- the list as of that date) to drop these nine. Nothing is destroyed either way.
--
-- ⚠ hr_put_client_state__ungated is a LIVE-HASH-TRACKED body. This file patches
--   it PROGRAMMATICALLY, so the Coordinator re-seeds tests/live-hash-drift
--   .baseline.json with `--live --write` after the apply and writes the whys from
--   `--codediff`. It carries no literal `create or replace function
--   public.hr_put_client_state__ungated(` header and takes over no last-toucher
--   role in the derivation tools.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $mig$
declare v_def text; v_n int; v_missing text;
  c_anchor constant text := $anc$    'buffs'$anc$;
  c_needed constant text[] := array['streak_days','auto_eat_pct','auto_eat_food','combat_style',
                                    'tool_carry','renown_high'];
begin
  if to_regprocedure('public.hr_put_client_state__ungated(int,jsonb,uuid)') is null then
    raise exception 'hr_put_client_state__ungated is missing — apply 2026-08-28-client-state.sql, '
                    '2026-08-22-client-state-denylist.sql and 2026-09-13-client-state-buffs-denylist.sql first';
  end if;
  v_def := replace(pg_get_functiondef(
    'public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, 'forbidden_field') = 0 or strpos(v_def, 'v_deny') = 0 then
    raise exception 'hr_put_client_state__ungated carries no deny-list — apply '
                    '2026-08-22-client-state-denylist.sql first, or this file adds keys nothing reads';
  end if;
  v_n := (length(v_def) - length(replace(v_def, c_anchor, ''))) / length(c_anchor);
  if v_n <> 1 then
    raise exception 'the `buffs` tail anchor appears % time(s), expected exactly 1 — the live body is '
                    'not the one this file was derived against. Do NOT patch a body you cannot account '
                    'for; diff it against the repo chain first.', v_n;
  end if;
  -- ⚠ REFUSE TO TAKE A COPY AWAY BEFORE THE SERVER HOLDS THE REAL ONE. Every
  -- column below is the authority the matching key is being denied IN FAVOUR OF;
  -- if one is missing, this file would delete a fact rather than secure it.
  select string_agg(c, ', ') into v_missing
    from unnest(c_needed) c
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'player_state'
                        and column_name = c);
  if v_missing is not null then
    raise exception 'player_state is missing %, so the client copy is still the only one — apply the '
                    'projection migrations first (streak-state / auto-eat / combat-style / tool-carry / '
                    'renown-high-projection)', v_missing;
  end if;
  -- The two ENTITLEMENT readers, which live in functions rather than columns.
  if to_regprocedure('public.hr_hero_slots_of(uuid)') is null then
    raise exception 'hr_hero_slots_of is missing — apply 2026-09-08-hero-slot-buy.sql first, or '
                    'denying heroSlotsUnlocked removes the only record of a paid slot';
  end if;
  if to_regprocedure('public.hr_gem_unlocks_of(uuid,int)') is null then
    raise exception 'hr_gem_unlocks_of is missing — apply 2026-09-14-gem-unlock-buy.sql first, or '
                    'denying ownedThemes/ownedCosmetics removes the only record of a gem purchase';
  end if;
end $mig$;

-- ── 1. THE PATCH ───────────────────────────────────────────────────────────
do $mig$
declare
  v_def text;
  c_anchor constant text := $anc$    'buffs'$anc$;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'renownHigh'$q$) > 0 then
    raise notice 'hr_put_client_state already denies the projection keys — patch skipped'; return; end if;
  v_def := replace(v_def, c_anchor, c_anchor || $new$,
    -- 2026-09-14 — THE PROJECTION PURGE. Nine names that were RESIDUE and are now
    -- read from hr_state_of instead. Each is refused BY NAME because the server
    -- holds the fact: streak_days, auto_eat_pct, auto_eat_food, combat_style,
    -- tool_carry, renown_high, hr_hero_slots_of and hr_gem_unlocks_of. A patch
    -- naming one is a client trying to keep a second copy of a value it does not
    -- own — the residue-ahead class, CLAUDE.md §6.
    'streak','autoEatPct','foodSlot','combatStyle','toolCarry','renownHigh',
    'heroSlotsUnlocked','ownedThemes','ownedCosmetics'$new$);
  execute v_def;
  raise notice 'hr_put_client_state: the nine projection keys added to the authority deny-list';
end $mig$;
-- create-or-replace preserves an ACL; re-state the lockdown anyway (the repo
-- convention and the grant-hygiene lint). __ungated is called only by the
-- SECURITY DEFINER wrapper; no client role may execute it.
revoke execute on function public.hr_put_client_state__ungated(int, jsonb, uuid) from public;
revoke execute on function public.hr_put_client_state__ungated(int, jsonb, uuid)
  from anon, authenticated, service_role;

-- ── 2. SELF-CHECK (§4) — BY EXECUTION ──────────────────────────────────────
-- Proven by CALLING the function as a real signed-in player and reading the
-- refusals, not by finding the words in the source. Net-zero: the probe character
-- is created and removed inside a subtransaction discarded by a sentinel raise
-- (HR844).
do $mig$
declare
  v_def text; v_r jsonb; v_key text;
  v_uid  constant uuid := '000000b4-0000-0000-0000-0000000000b4';
  c_keys constant text[] := array['streak','autoEatPct','foodSlot','combatStyle','toolCarry',
                                  'renownHigh','heroSlotsUnlocked','ownedThemes','ownedCosmetics'];
begin
  v_def := pg_get_functiondef('public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure);
  -- (a) EVERY key installed, and every PRE-EXISTING authority key SURVIVED. A
  --     patch that replaced the array instead of extending it passes a check that
  --     only looks for the new names.
  foreach v_key in array c_keys loop
    if strpos(v_def, '''' || v_key || '''') = 0 then
      raise exception 'projection deny-list (a): % did not install', v_key; end if;
  end loop;
  foreach v_key in array array['gold','gems','skills','inventory','bank','equipment','rooms',
                               'marks','farmPlots','companions','offlineBudget','buffs'] loop
    if strpos(v_def, '''' || v_key || '''') = 0 then
      raise exception 'projection deny-list (a): the patch ATE the existing authority key %', v_key; end if;
  end loop;
  -- (b) GRANTS UNCHANGED: the wrapper stays client-callable, __ungated does not.
  if not has_function_privilege('authenticated', 'public.hr_put_client_state(int,jsonb,uuid)', 'execute') then
    raise exception 'projection deny-list (b): authenticated LOST execute on hr_put_client_state — '
                    'every residue save would fail'; end if;
  if has_function_privilege('authenticated', 'public.hr_put_client_state__ungated(int,jsonb,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_put_client_state__ungated(int,jsonb,uuid)', 'execute') then
    raise exception 'projection deny-list (b): __ungated is client-executable'; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version)
      values (v_uid, 0, 0, 0, 10, 10, 1)
      on conflict (user_id, slot) do update set client_state = '{}'::jsonb;

    -- (c) EACH key is refused ON ITS OWN, WHOLE, and nothing is stored — including
    --     the honest key that travelled with it. Looped: a deny-list that only
    --     bites on the first name is the failure this loop exists to catch.
    foreach v_key in array c_keys loop
      v_r := public.hr_put_client_state__ungated(0,
        jsonb_build_object(v_key, 'forged', 'lootFilter', jsonb_build_array('junk')),
        gen_random_uuid());
      if coalesce(v_r->>'ok', 'true') <> 'false' or v_r->>'error' <> 'forbidden_field'
         or v_r->>'field' <> v_key then
        raise exception 'projection deny-list (c): a PUT carrying % was NOT refused as '
                        'forbidden_field/% — got %', v_key, v_key, v_r;
      end if;
      if coalesce((select client_state from public.player_state
                    where user_id = v_uid and slot = 0), '{}'::jsonb) <> '{}'::jsonb then
        raise exception 'projection deny-list (c): the refused % patch still wrote client_state', v_key;
      end if;
    end loop;

    -- (d) AN HONEST RESIDUE PUT STILL WORKS. A deny-list that refused everything
    --     would pass (c) and silently stop every player's preferences from saving
    --     — the failure mode this family is most dangerous for. `houseTheme` and
    --     `lootFilter` are deliberate: both are still RESIDUE_FIELDS after the
    --     purge, and houseTheme is the EQUIPPED pointer whose OWNERSHIP half
    --     (ownedThemes) is denied two lines up, so this also pins that the purge
    --     split those two facts rather than deleting both.
    v_r := public.hr_put_client_state__ungated(0,
      jsonb_build_object('lootFilter', jsonb_build_array('junk'), 'houseTheme', 'forest',
                         'autoActions', jsonb_build_object('farmReplant',
                           jsonb_build_object('enabled', true, 'cropId', 'carrot'))),
      gen_random_uuid());
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'projection deny-list (d): an HONEST residue put was refused (%) — the '
                      'deny-list is eating legitimate patches', v_r;
    end if;
    if (select client_state->>'houseTheme' from public.player_state
         where user_id = v_uid and slot = 0) is distinct from 'forest' then
      raise exception 'projection deny-list (d): the honest put answered ok but stored nothing';
    end if;
    -- …and `unlockedRecipes` is DELIBERATELY still allowed (see the header): the
    -- client half that sends hr_recipe_learn is not built, so this bag is still
    -- the only record that a scroll was read.
    v_r := public.hr_put_client_state__ungated(0,
      jsonb_build_object('unlockedRecipes', jsonb_build_object('shrimp_recipe', true)),
      gen_random_uuid());
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'projection deny-list (d): `unlockedRecipes` was refused (%) — it is still the '
                      'only record of a consumed scroll until the learn intent is wired', v_r;
    end if;

    raise exception using errcode = 'HR844', message = 'projection deny-list §2 complete — rolling back';
  exception when sqlstate 'HR844' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'projection deny-list: §2 LEAKED a probe row'; end if;

  raise notice 'projection deny-list PASSED: all nine purged keys are refused as forbidden_field with '
               'the whole patch rolled back, every pre-existing authority key survived the patch, an '
               'honest residue put (including unlockedRecipes) still saves, and no grant moved';
end $mig$;
