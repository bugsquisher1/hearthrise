-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-client-state-buffs-denylist.sql — `buffs` BECOMES AN AUTHORITY KEY.
--
-- THE OTHER HALF of 2026-09-13-consumable-buffs.sql, and Security's condition on
-- it: now that the SERVER owns the buff clock (player_state.buffs, written only by
-- hr_apply's buff_apply block from hr_item_buffs + now()), the forgeable SHADOW
-- COPY must not survive. Until today `buffs` was in src/net/client-state.js
-- RESIDUE_FIELDS — a bag the PLAYER writes through hr_put_client_state, hydrated
-- straight into G, and G feeds the client's getBonus chain. A client could store
-- `{buffs:[{type:'damage',magnitude:9999,remainingMs:9e9}]}` and read it back
-- for ever. It bought nothing server-side (no engine read it), which is exactly
-- what made it a LATENT hole rather than a live one — the class
-- 2026-08-22-client-state-denylist.sql was written to close, in the costume of a
-- display preference.
--
-- WHAT: add 'buffs' to hr_put_client_state__ungated's authority deny-list, so a
-- PUT naming it is refused WHOLE with {ok:false, error:'forbidden_field'}.
--
-- ⚠ THIS FILE AND ITS CLIENT HALF SHIP TOGETHER OR NEITHER SHIPS. The server
--   refuses the ENTIRE patch on a forbidden key, so a build in which `buffs` is
--   BOTH in RESIDUE_FIELDS and on this list stops EVERY residue field from saving
--   for EVERY player (lootFilter, achievements, bestiary, the lot). The client
--   half — `buffs` removed from RESIDUE_FIELDS and declared in NO_SYNC in
--   src/net/events.js — is in the same commit, and tests/arm-homing-guard.mjs
--   asserts the collision across BOTH deny-list migrations (it read only the
--   2026-08-22 file until this lane taught it the union).
--
-- ── PATCHED, NOT RESTATED ─────────────────────────────────────────────────
-- hr_put_client_state__ungated's live body is whatever its last toucher left
-- (2026-08-22-client-state-denylist.sql in the repo chain, and the LIVE body is
-- not readable from an agent's seat). So the array literal is patched at an
-- anchor asserted to appear EXACTLY ONCE, and the patch is re-entrant: a second
-- apply is a notice and a return. A restatement here would silently revert
-- whichever file patched last — the b484–b487 class — on the one function that
-- decides what a player may store about themselves.
--
-- ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
-- It does not change the residue contract for any other field, does not touch the
-- 256 KiB cap, the idempotency claim or the advisory lock, and moves no value. A
-- stale `buffs` key already sitting in some player's client_state bag is left
-- alone and is INERT: hydrateInto writes only RESIDUE_FIELDS, which no longer
-- lists it, so it is dead bytes rather than state. (Deleting it would be a write
-- to live player rows to tidy a key nothing reads — CLAUDE.md §2.)
--
-- REVERSIBILITY: re-apply 2026-08-22-client-state-denylist.sql to drop the key
-- from the list. Nothing is destroyed and no data moves either way.
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
declare v_def text; v_n int;
  c_anchor constant text := $anc$    'farmPlots','farm','companions','offlineBudget'$anc$;
begin
  if to_regprocedure('public.hr_put_client_state__ungated(int,jsonb,uuid)') is null then
    raise exception 'hr_put_client_state__ungated is missing — apply 2026-08-28-client-state.sql and '
                    '2026-08-22-client-state-denylist.sql first'; end if;
  v_def := replace(pg_get_functiondef(
    'public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure), chr(13), '');
  -- The deny-list must already EXIST. Adding a key to a list that is not there
  -- would install a lonely literal in a body that never reads it.
  if strpos(v_def, 'forbidden_field') = 0 or strpos(v_def, 'v_deny') = 0 then
    raise exception 'hr_put_client_state__ungated carries no deny-list — apply '
                    '2026-08-22-client-state-denylist.sql first, or this file adds a key nothing reads';
  end if;
  v_n := (length(v_def) - length(replace(v_def, c_anchor, ''))) / length(c_anchor);
  if v_n <> 1 then
    raise exception 'the deny-list tail anchor appears % time(s), expected exactly 1 — the live body is '
                    'not the one this file was derived against. Do NOT patch a body you cannot account '
                    'for; diff it against the repo chain first.', v_n;
  end if;
  -- The server half this key becomes authority FOR. Refuse to take the residue's
  -- copy away before the server owns the real one, or a buff would live nowhere.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'player_state'
         and column_name = 'buffs') <> 1 then
    raise exception 'player_state.buffs does not exist — apply 2026-09-13-consumable-buffs.sql FIRST. '
                    'Denying the residue copy before the server owns the buff would delete the feature '
                    'rather than secure it.';
  end if;
end $mig$;

-- ── 1. THE PATCH ───────────────────────────────────────────────────────────
do $mig$
declare
  v_def text;
  c_anchor constant text := $anc$    'farmPlots','farm','companions','offlineBudget'$anc$;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'buffs'$q$) > 0 then
    raise notice 'hr_put_client_state already denies buffs — patch skipped'; return; end if;
  v_def := replace(v_def, c_anchor, c_anchor || $new$,
    -- 2026-09-13: the CONSUMABLE BUFF QUEUE. player_state.buffs is the authority
    -- (written only by hr_apply's buff_apply block, from hr_item_buffs + now()),
    -- and hr_state_of projects it, so a client copy in this bag would be a second
    -- source for one quantity — and a forgeable one, because the player writes
    -- this table. Refused by NAME, like every other authority key here.
    'buffs'$new$);
  execute v_def;
  raise notice 'hr_put_client_state: `buffs` added to the authority deny-list';
end $mig$;
-- create-or-replace preserves an ACL; re-state the lockdown anyway (the repo
-- convention and the grant-hygiene lint). __ungated is called only by the
-- SECURITY DEFINER wrapper; no client role may execute it.
revoke execute on function public.hr_put_client_state__ungated(int, jsonb, uuid) from public;
revoke execute on function public.hr_put_client_state__ungated(int, jsonb, uuid)
  from anon, authenticated, service_role;

-- ── 2. SELF-CHECK (§4) — BY EXECUTION ──────────────────────────────────────
-- The deny-list is proven by CALLING the function as a real signed-in player and
-- reading the refusal, not by finding the word 'buffs' in the source. A marker in
-- a branch that never runs is the shape twelve of this repo's vacuous guards had.
-- Net-zero: the probe character is created and removed inside a subtransaction
-- discarded by a sentinel raise (HR825).
do $mig$
declare
  v_def text; v_r jsonb; v_cnt int;
  v_uid  constant uuid := '000000b1-0000-0000-0000-0000000000b1';
begin
  v_def := pg_get_functiondef('public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure);
  if strpos(v_def, $q$'buffs'$q$) = 0 then
    raise exception 'client-state buffs deny-list (a): the key did not install'; end if;
  -- …and the keys that were already there SURVIVED. A patch that replaced the
  -- array instead of extending it would pass the check above.
  if strpos(v_def, $q$'gold'$q$) = 0 or strpos(v_def, $q$'skills'$q$) = 0
     or strpos(v_def, $q$'inventory'$q$) = 0 or strpos(v_def, $q$'offlineBudget'$q$) = 0 then
    raise exception 'client-state buffs deny-list (a): the patch ATE existing authority keys';
  end if;
  -- GRANTS UNCHANGED: the wrapper stays client-callable, __ungated does not.
  if not has_function_privilege('authenticated', 'public.hr_put_client_state(int,jsonb,uuid)', 'execute') then
    raise exception 'client-state buffs deny-list (b): authenticated LOST execute on '
                    'hr_put_client_state — every residue save would fail'; end if;
  if has_function_privilege('authenticated', 'public.hr_put_client_state__ungated(int,jsonb,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_put_client_state__ungated(int,jsonb,uuid)', 'execute') then
    raise exception 'client-state buffs deny-list (b): __ungated is client-executable'; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version)
      values (v_uid, 0, 0, 0, 10, 10, 1)
      on conflict (user_id, slot) do update set client_state = '{}'::jsonb;

    -- (c) A PUT CARRYING `buffs` IS REFUSED, WHOLE.
    v_r := public.hr_put_client_state__ungated(0,
      jsonb_build_object('buffs', jsonb_build_array(
        jsonb_build_object('type', 'damage', 'magnitude', 9999, 'remainingMs', 9000000000)),
        'lootFilter', jsonb_build_array('junk')),
      gen_random_uuid());
    if coalesce(v_r->>'ok', 'true') <> 'false' or v_r->>'error' <> 'forbidden_field'
       or v_r->>'field' <> 'buffs' then
      raise exception 'client-state buffs deny-list (c): a PUT carrying a forged buff queue was NOT '
                      'refused as forbidden_field/buffs — got %', v_r;
    end if;
    -- …and NOTHING was stored, including the honest key that travelled with it.
    if coalesce((select client_state from public.player_state
                  where user_id = v_uid and slot = 0), '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'client-state buffs deny-list (c): the refused patch still wrote client_state';
    end if;

    -- (d) AN HONEST RESIDUE PUT STILL WORKS. A deny-list that refused everything
    --     would pass (c) and silently stop every player's preferences from saving
    --     — the failure mode this whole family is most dangerous for.
    -- ⚠ THE FIXTURE'S HONEST KEYS MUST BE KEYS THAT CAN NEVER BE DENIED. This put
    --   named `combatStyle`, which BECAME an authority key on 2026-09-14
    --   (2026-09-14-client-state-projection-denylist.sql: the style is
    --   player_state.combat_style, and the client copy was deleted) — so a replay
    --   of the chain ran this file's own check against a later file's deny-list and
    --   failed it. The FILE'S PAYLOAD IS FROZEN; a §4 fixture is not prosrc, and a
    --   fixture that asserts "this key is allowed" is a standing claim about a list
    --   that is designed to grow. `lootFilter` and `lockedItems` are the two keys
    --   that cannot join it: both are client-only display/UX preferences that gate
    --   NOTHING server-side (client-state.js says so at each entry), so there is no
    --   server fact for either to shadow.
    v_r := public.hr_put_client_state__ungated(0,
      jsonb_build_object('lootFilter', jsonb_build_array('junk'),
                         'lockedItems', jsonb_build_object('bronze_sword', true)),
      gen_random_uuid());
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'client-state buffs deny-list (d): an HONEST residue put was refused (%) — the '
                      'deny-list is eating legitimate patches', v_r;
    end if;
    if (select client_state->'lootFilter' from public.player_state
         where user_id = v_uid and slot = 0) is null then
      raise exception 'client-state buffs deny-list (d): the honest put answered ok but stored nothing';
    end if;

    raise exception using errcode = 'HR825', message = 'client-state buffs deny-list §2 complete — rolling back';
  exception when sqlstate 'HR825' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'client-state buffs deny-list: §2 LEAKED a probe row'; end if;

  raise notice 'client-state buffs deny-list PASSED: `buffs` is refused as forbidden_field with the '
               'whole patch rolled back, every pre-existing authority key survived the patch, an '
               'honest residue put still saves, and no grant moved';
end $mig$;
