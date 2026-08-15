-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE PERMANENT PERK CHANNEL GETS A SERVER SOURCE  (b349)
--
-- ⚠ REVIEW ONLY — STAGED, NOT APPLIED. The Coordinator applies.
--
-- Companion code: src/core/perks.js (the arithmetic, run by BOTH sides),
-- src/data/perks.js + tools/gen-perks.mjs (the room rung table, generated out
-- of src/legacy.js with a drift guard), src/legacy.js `getBonus` +
-- `clientPerkState` (layer 0 now delegates), supabase/functions/hr-accrue/
-- {index.ts,accrual.js} (`zeroBonus` → `bonusFor(inp.perks)`).
-- Companion tests: tests/perk-channel.mjs, tests/accrual-engine.mjs.
--
-- ── WHAT THIS IS FOR, IN ONE PARAGRAPH ──────────────────────────────────
-- The accrual engine passes `zeroBonus()`, so every permanent bonus a player
-- has bought reads 0 server-side. Two consequences of different kinds. (a)
-- ARTISAN IS UNSHIPPABLE: `noBurn` is the Kitchen rung, and at the recipe's
-- required level `burnChance` is 0.25 with noBurn 0 against 0.12 / 0.06 /
-- 0.00 at Kitchen rungs 1 / 2 / 3+ — a server that cooked would DESTROY a
-- quarter of the input the player's Cast-Iron Range protects, which is why
-- src/core/skill-sim.js refuses `artisan` in writing. (b) COMBAT ALREADY
-- UNDER-PAYS, silently, every night: Trophy Room + Watchtower is +7%
-- combatXP and Great Library + capstone is +7% allXP, and away nights have
-- paid neither since accrual shipped.
--
-- ── WHAT THIS FILE IS *NOT* ─────────────────────────────────────────────
-- It is NOT a copy of the room table. `hr_perks_of` returns BOOKKEEPING —
-- which room at which rung, how many plot buildings, which property tier —
-- and src/core/perks.js turns that into magnitudes from the generated
-- catalogue. That split is the 2026-08-15 architecture decision ("if an
-- operation needs the game's RULES it is JavaScript; if it is pure
-- bookkeeping it is a database function"), and it is what keeps 40 rung
-- payloads out of SQL. A second copy of game data in the database is the
-- failure src/main.js `unifyObject` was written about.
--
-- It also does NOT touch hr_apply. Nothing here replaces a function that
-- exists; §2's only `create or replace` is on a function this file
-- introduces. 2026-08-15-tool-carry.sql remains the last file that may
-- replace hr_apply, and this one may sit before or after it.
--
-- ── ⚠ THE UNLOCK SEAM — READ THIS BEFORE CHANGING EITHER SIDE ───────────
-- Rooms, plot buildings and the property tier are `unlock` grants
-- (src/data/shops.js: `room:<id>` amount = rung, `plot:<id>` amount = 1 per
-- purchase and repeatable, `property:<id>` amount = tier index). WHERE those
-- grants are STORED is owned by the unlock work, not by this file.
--
-- So §1 declares ONE seam — `public.hr_unlock_levels(uuid, int)` — and
-- creates it **ONLY IF IT DOES NOT ALREADY EXIST**. That is deliberate and
-- it makes the apply order not matter:
--
--   · unlock storage lands FIRST  → its definition is authoritative and this
--     file leaves it alone.
--   · this file lands FIRST       → it installs the default body below, and
--     the unlock migration replaces it.
--
-- The alternative — an unconditional `create or replace` — is the exact
-- defect that nearly shipped in the clan work, where three migrations each
-- defined `clan_members "join as self"` and filename order would have
-- installed the wrong one with every self-check still passing. §4 therefore
-- asserts the seam EXISTS AND ANSWERS, never that it has this file's body.
--
-- THE DEFAULT BODY reads `player_progress` with `kind='flag'`, which is the
-- only unlock-shaped storage that exists today ('flag' is already a legal
-- kind on that table and nothing writes these keys yet). If the unlock model
-- lands somewhere else, repoint §1 and NOTHING ELSE CHANGES — not
-- hr_perks_of, not the Edge Function, not the core module, not a test.
--
-- ── THE SELF-CONFIGURING SWITCH ─────────────────────────────────────────
-- No unlock rows → the seam returns nothing → hr_perks_of returns empty maps
-- → src/core/perks.js computes 0 for every key → the engine behaves EXACTLY
-- as it did with `zeroBonus`. There is no flag to forget to flip. And on the
-- other side, a database WITHOUT hr_perks_of makes index.ts's read fail with
-- 42883, which it catches — and only 42883 — before re-running the seed read
-- without the column. So applying this file before or after the Edge deploy
-- is safe in either order, in both directions.
--
-- SAFE TO RE-RUN. Additive and idempotent: one conditional `create function`,
-- one `create or replace function`, one revoke/grant set, and self-checks
-- that roll themselves back.
-- REVERSIBLE: `drop function public.hr_perks_of(uuid,int)` — index.ts then
-- takes its 42883 branch and pays exactly what it paid before b349. Dropping
-- `hr_unlock_levels` is only correct if nothing else has claimed it.
--
-- ── WHAT IT DELIBERATELY DOES NOT CARRY, each with a named blocker ──────
--   renown      no server renown score. src/features/renown.js scores from
--               ~10 terms; quests, collection, the daily streak and lifetime
--               gold have NO server progress model. A partial derivation
--               would produce a DIFFERENT RANK from the client's, and a rank
--               is a visible title. Worth +4% allXP at High King.
--   castle      server-owned (hr_castle_buildings + the clan seat tables) but
--               its perk ladder and its upkeep scale (strained x0.6, dormant
--               x0) live in src/features/clan-seat-ui.js, a classic script on
--               a surface another agent holds. Contract shape is settled
--               (`castle` in the perk state, currently null).
--   companions  no server model for the equipped pet at all, and it is a
--               wrapper LAYER, not part of layer 0.
--   clan perks  derivable now and worth exactly zero: every rung of
--               src/features/clans.js PERKS grants `offlineHours` or a
--               cosmetic, and offline hours are already server-side in
--               hr_offline_cap_ms. Carried in the contract, left unread.
-- Every one of those is an UNDER-payment, which is the correct direction to
-- be wrong in. src/core/perks.js §5 states each in full.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — fail CLOSED, never install half a channel ─────────
do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'player_state is missing — apply 2026-08-11-player-state.sql first';
  end if;
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress is missing — apply 2026-08-11-player-state.sql first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_engine') then
    raise exception 'the hr_engine role is missing — apply 2026-08-11-accrual.sql first';
  end if;
  -- The engine must already hold ZERO table privileges. If that has stopped
  -- being true, this file is not the place to find out, but it IS the place
  -- to refuse: everything below hands the engine a new read path.
  if exists (
    select 1 from information_schema.role_table_grants
     where grantee = 'hr_engine' and table_schema = 'public'
  ) then
    raise exception 'hr_engine already holds table privileges in public — the capability pin is '
                    'broken and a new read path must not be added on top of it';
  end if;
end $$;

-- ── 1. THE UNLOCK SEAM — created ONLY IF ABSENT (see the header) ─────────
--
-- CONTRACT, which any replacement must honour:
--   public.hr_unlock_levels(p_user uuid, p_slot int)
--     returns table(unlock_id text, level int)
--
--   `unlock_id`  the id src/data/shops.js grants — 'room:kitchen',
--                'plot:toolshed', 'property:castle'.
--   `level`      the RESOLVED current value for that id under whatever
--                accumulation rule the unlock model uses. Rooms and property
--                are ABSOLUTE (a rung replaces the rung below); plot
--                buildings are REPEATABLE, so their resolved value is the
--                COUNT owned (Scarecrow's max is 2, and getBonus pays per
--                instance — a "one each" reading would silently halve a
--                two-Scarecrow farm).
--                Accumulation is the seam's business precisely because it is
--                the one thing that differs by unlock kind, and the caller
--                should never have to know which.
--
-- ⚠ NOT GRANTED TO ANY ROLE, not even hr_engine. hr_perks_of is SECURITY
--   DEFINER and owned by the migration role, so it can call this regardless;
--   granting it to the engine as well would create a second, wider read path
--   (unfiltered by the ok/no_character envelope) for no benefit.
do $$
begin
  if to_regprocedure('public.hr_unlock_levels(uuid,int)') is null then
    execute $ddl$
      create function public.hr_unlock_levels(p_user uuid, p_slot int)
      returns table(unlock_id text, level int)
      language sql
      stable
      security definer
      set search_path = public, pg_temp
      as $body$
        select pp.key,
               /* bigint -> int, clamped rather than cast. player_progress.value
                  is a bigint with no upper CHECK, and an int overflow here
                  would be an exception thrown inside an accrual — i.e. a whole
                  night lost — rather than a bonus that reads too high. The
                  magnitude is never taken from this number anyway: core clamps
                  the level to the rung count that actually exists. */
               greatest(0, least(pp.value, 2147483647))::int
          from public.player_progress pp
         where pp.user_id = p_user
           and pp.slot    = p_slot
           and pp.kind    = 'flag'
           and pp.value   > 0
           and (pp.key like 'room:%' or pp.key like 'plot:%' or pp.key like 'property:%')
      $body$;
    $ddl$;
    raise notice 'b349 §1: installed the DEFAULT hr_unlock_levels (player_progress kind=flag).';
  else
    raise notice 'b349 §1: hr_unlock_levels already exists — left untouched, as designed.';
  end if;
end $$;

revoke execute on function public.hr_unlock_levels(uuid, int) from public;
revoke execute on function public.hr_unlock_levels(uuid, int)
  from anon, authenticated, service_role;

-- ── 2. hr_perks_of — the perk STATE, as bookkeeping ──────────────────────
--
-- ⚠ THE JSON KEYS ARE THE JAVASCRIPT FIELD NAMES, deliberately, including
--   the camelCase `propertyTier`. This envelope is consumed by exactly one
--   thing — `normalisePerkState` in src/core/perks.js — and it crosses the
--   wire untranslated. A snake_case spelling here would need a mapping layer
--   in index.ts, and a mapping layer is where a field gets silently dropped
--   and reads as "the player owns nothing". One name, no translation.
--
-- STABLE, not VOLATILE: it writes nothing and is called once per accrual
-- inside the same read transaction as hr_seed. (The volatility lesson from
-- beta_invite_check is about a function that GAINED a write two levels down;
-- if hr_unlock_levels is ever replaced by something that writes, this marker
-- must move with it. §4 asserts the seam is STABLE for that reason.)
create or replace function public.hr_perks_of(p_user uuid, p_slot int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rooms jsonb;
  v_plots jsonb;
  v_tier  int;
begin
  if p_user is null or p_slot is null then
    return jsonb_build_object('ok', false, 'error', 'bad_args');
  end if;

  -- A character that does not exist gets a refusal, not an empty stack. The
  -- two are different facts and the engine treats them differently: `ok:false`
  -- means "do not price a perk stack for this row at all", while an empty
  -- stack means "priced, and this player has bought nothing".
  if not exists (
    select 1 from public.player_state ps
     where ps.user_id = p_user and ps.slot = p_slot
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  select
    coalesce(jsonb_object_agg(substring(u.unlock_id from 6), u.level)
               filter (where u.unlock_id like 'room:%'), '{}'::jsonb),
    coalesce(jsonb_object_agg(substring(u.unlock_id from 6), u.level)
               filter (where u.unlock_id like 'plot:%'), '{}'::jsonb),
    coalesce(max(u.level) filter (where u.unlock_id like 'property:%'), 0)
    into v_rooms, v_plots, v_tier
    from public.hr_unlock_levels(p_user, p_slot) u;

  return jsonb_build_object(
    'ok', true,
    'rooms', coalesce(v_rooms, '{}'::jsonb),
    'plots', coalesce(v_plots, '{}'::jsonb),
    -- The property TIER, not the property id: 'property:castle' grants 5 and
    -- the capstone fires at >= CASTLE_TIER. `max` because a player who bought
    -- the Manor and then the Castle holds both rows.
    'propertyTier', coalesce(v_tier, 0),
    -- Named zeroes, not omissions. An absent key and a key that is honestly
    -- zero are indistinguishable to the reader, and one of them is a bug.
    'renownAllXp', 0,
    'clanPerks', '{}'::jsonb,
    'castle', null,
    -- ⚠ THE HONESTY FIELD. Which channels this answer actually covers. The
    --   Edge Function forwards it into the away card (`away.perkChannel`), so
    --   "the night was priced at zero perks because nothing is unlocked" can
    --   be told apart from "because the channel is not wired" — from the
    --   outside, without reading the source. Every historical away bug in this
    --   codebase was a reward that silently vanished.
    'sources', jsonb_build_object(
      'rooms',      'hr_unlock_levels',
      'plots',      'hr_unlock_levels',
      'property',   'hr_unlock_levels',
      'renown',     'blocked:no_server_renown_score',
      'clan',       'derivable:contributes_zero',
      'castle',     'blocked:perk_table_client_side',
      'companions', 'blocked:no_server_pet_model')
  );
end $$;

-- ── 3. GRANTS — revoke from PUBLIC first, then grant ─────────────────────
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's
-- default ACL additionally grants it to anon, authenticated and service_role.
-- `create or replace` PRESERVES an existing ACL, so a wrong one would survive
-- a re-apply — which is why these are restated unconditionally rather than
-- trusted from the first apply.
--
-- hr_perks_of is a per-character read, so a client-executable copy would be a
-- cross-player enumeration of who owns which room: an information leak rather
-- than a mint, but the posture is the same posture for both.
revoke execute on function public.hr_perks_of(uuid, int) from public;
revoke execute on function public.hr_perks_of(uuid, int)
  from anon, authenticated, service_role;
grant execute on function public.hr_perks_of(uuid, int) to hr_engine;

-- ── 4. SELF-VERIFICATION — the commit gate ───────────────────────────────
-- Every claim above, EXECUTED. A migration that asserts nothing is a
-- migration that has not been tested.

-- (a) Capability surface, volatility, and the seam's contract.
do $$
declare v_p oid; v_bad text; v_name text; v_cols text;
begin
  -- THE SEAM EXISTS AND HAS THE RIGHT SHAPE. Asserted as a CONTRACT, never as
  -- "it has my body" — the whole point of §1's create-if-absent is that
  -- somebody else's body is the right answer.
  v_p := to_regprocedure('public.hr_unlock_levels(uuid,int)');
  if v_p is null then
    raise exception 'hr_unlock_levels(uuid,int) is missing after §1 — the seam did not install';
  end if;
  -- `pg_get_function_result` is used rather than a walk of proallargtypes: the
  -- walk is the shape that produced this repo's own always-null probe (a
  -- pg_get_function_identity_arguments() reading that returns parameter NAMES,
  -- so every to_regprocedure built from it was NULL on every database). This
  -- one returns a literal string and is compared to a literal string.
  v_cols := pg_get_function_result(v_p);
  if lower(replace(coalesce(v_cols, ''), ' ', ''))
     is distinct from 'table(unlock_idtext,levelinteger)' then
    raise exception 'hr_unlock_levels returns "%" — the contract is '
                    'TABLE(unlock_id text, level integer). A replacement that changes the shape '
                    'silently zeroes every perk in the game.', coalesce(v_cols, 'NOTHING');
  end if;
  if (select provolatile from pg_proc where oid = v_p) not in ('s', 'i') then
    raise exception 'hr_unlock_levels is VOLATILE. hr_perks_of is declared STABLE and PostgREST '
                    'honours a STABLE declaration by running in a READ-ONLY transaction — the exact '
                    'shape that took new-player sign-up down on 2026-08-13. If the seam now writes, '
                    'hr_perks_of must become VOLATILE in the same commit.';
  end if;

  -- NEITHER FUNCTION IS CLIENT-EXECUTABLE, and the seam is not executable by
  -- ANYTHING but its owner.
  foreach v_bad in array array['public','anon','authenticated','service_role','hr_engine'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_unlock_levels is EXECUTABLE BY % — it is an unfiltered read path over '
                      'every character''s unlocks and must be reachable only through hr_perks_of', v_bad;
    end if;
  end loop;

  v_p := to_regprocedure('public.hr_perks_of(uuid,int)');
  if v_p is null then raise exception 'hr_perks_of vanished'; end if;
  foreach v_bad in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_perks_of is EXECUTABLE BY % — that is a cross-player read of who owns '
                      'which room', v_bad;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', v_p, 'execute') then
    raise exception 'hr_perks_of is not executable by hr_engine — the accrual engine cannot read it, '
                    'and index.ts would take its 42883 branch and pay every night at zero perks';
  end if;
  if (select prosecdef from pg_proc where oid = v_p) is not true then
    raise exception 'hr_perks_of is not SECURITY DEFINER — hr_engine holds no table grants, so it '
                    'would fail at the first read';
  end if;
  if (select proconfig from pg_proc where oid = v_p) is null
     or not exists (select 1 from unnest((select proconfig from pg_proc where oid = v_p)) c
                     where c like 'search_path=%') then
    raise exception 'hr_perks_of has no pinned search_path — a SECURITY DEFINER function without one '
                    'is a search_path hijack';
  end if;

  -- STILL NO TABLE GRANTS TO THE ENGINE. §0 asserted the pre-state; this
  -- asserts the post-state, because the whole file is about giving the engine
  -- a new READ and the wrong way to do that is a grant.
  select string_agg(table_name || ':' || privilege_type, ', ') into v_name
    from information_schema.role_table_grants
   where grantee = 'hr_engine' and table_schema = 'public';
  if v_name is not null then
    raise exception 'hr_engine gained table privileges (%) — the capability pin is broken', v_name;
  end if;

  -- NO CLIENT WRITE POLICY on the table the default seam reads. If the client
  -- could INSERT a `flag` row it could grant itself a Great Hearth, and the
  -- server would price every future night at Kitchen 5.
  select string_agg(policyname || ':' || cmd, ', ') into v_bad from pg_policies
   where schemaname='public' and tablename='player_progress' and cmd <> 'SELECT';
  if v_bad is not null then
    raise exception 'player_progress grew a non-SELECT policy (%) — a client-writable unlock row is '
                    'a client-authored perk stack', v_bad;
  end if;

  raise notice 'b349 §4(a) PASSED: the seam''s contract, both ACLs, the search_path pin, the engine '
               'capability pin and the player_progress write posture.';
end $$;

-- (b) THE BEHAVIOUR, on a real character, in a subtransaction rolled back to
--     zero effect. "It returns the rooms" and "it refuses a character that is
--     not there" are claims about executable behaviour; neither is provable by
--     reading the source, and this repo has recorded fifteen instances of an
--     assertion that asserted nothing.
do $$
declare
  v_uid uuid := '00000000-0000-4000-8000-0000b3490001';
  v_r   jsonb;
  v_c   jsonb;
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception '§4(b) CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;

  begin  -- ── SUBTRANSACTION ──────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if auth.uid() is distinct from v_uid then
      raise exception '§4(b) HARNESS: auth.uid() did not pick up the probe identity';
    end if;

    -- (i) NO CHARACTER → a refusal, before any character exists. Run FIRST so
    --     the negative is proven against a genuinely empty slot rather than
    --     against a slot number nobody looked at.
    v_r := public.hr_perks_of(v_uid, 3);
    if coalesce(v_r->>'ok', '') <> 'false' or v_r->>'error' <> 'no_character' then
      raise exception '§4(b)(i): an empty slot returned % — expected no_character', v_r;
    end if;

    v_c := public.hr_create_character(0);
    if v_c->>'created' <> 'true' then raise exception '§4(b): no probe character: %', v_c; end if;

    -- (ii) A FRESH CHARACTER → ok, and EMPTY. This is the degrade path the
    --      whole design rests on: empty maps make src/core/perks.js return 0
    --      for every key, which is byte-for-byte the zeroBonus behaviour that
    --      shipped before b349.
    v_r := public.hr_perks_of(v_uid, 0);
    if v_r->>'ok' <> 'true' then raise exception '§4(b)(ii): % ', v_r; end if;
    if v_r->'rooms' is distinct from '{}'::jsonb or v_r->'plots' is distinct from '{}'::jsonb
       or (v_r->>'propertyTier')::int is distinct from 0 then
      raise exception '§4(b)(ii): a fresh character reads rooms=% plots=% tier=% — expected empty. '
                      'A non-empty default would pay a perk nobody bought.',
                      v_r->'rooms', v_r->'plots', v_r->>'propertyTier';
    end if;

    -- (iii) THE ONE THAT MATTERS: a Kitchen rung reaches the envelope.
    --       0.25 noBurn at Kitchen 3 is the difference between a server that
    --       cooks burn-proof and one that destroys a quarter of the input.
    insert into public.player_progress (user_id, slot, kind, key, value)
    values (v_uid, 0, 'flag', 'room:kitchen', 3),
           (v_uid, 0, 'flag', 'room:library', 5),
           (v_uid, 0, 'flag', 'plot:scarecrow', 2),
           (v_uid, 0, 'flag', 'plot:toolshed', 1),
           (v_uid, 0, 'flag', 'property:manor', 3),
           (v_uid, 0, 'flag', 'property:castle', 5);
    v_r := public.hr_perks_of(v_uid, 0);
    -- ⚠ `is distinct from`, NOT `<>`, at every one of these. A missing key
    --   yields NULL, `NULL <> 3` is NULL, and `if NULL then` does not raise —
    --   so the tempting spelling passes on exactly the failure it is written to
    --   catch. Found by tests/perk-channel.mjs --mutate: mutations M1 and M2
    --   empty the room map, and the first draft of this block sailed past both.
    if (v_r->'rooms'->>'kitchen')::int is distinct from 3 then
      raise exception '§4(b)(iii): rooms.kitchen reads % — expected 3. noBurn does not reach the '
                      'engine and artisan accrual stays blocked.',
                      coalesce(v_r->'rooms'->>'kitchen', 'ABSENT');
    end if;
    if (v_r->'rooms'->>'library')::int is distinct from 5 then
      raise exception '§4(b)(iii): rooms.library reads %',
                      coalesce(v_r->'rooms'->>'library', 'ABSENT');
    end if;
    -- PER INSTANCE, not per id. Two Scarecrows are +2 farmYield.
    if (v_r->'plots'->>'scarecrow')::int is distinct from 2
       or (v_r->'plots'->>'toolshed')::int is distinct from 1 then
      raise exception '§4(b)(iii): plots read % — expected scarecrow 2, toolshed 1', v_r->'plots';
    end if;
    -- MAX over property rows, not the last one inserted.
    if (v_r->>'propertyTier')::int is distinct from 5 then
      raise exception '§4(b)(iii): propertyTier reads % with manor(3) AND castle(5) held — expected '
                      '5. A player who upgraded would lose the capstone.', v_r->>'propertyTier';
    end if;

    -- (iv) NON-UNLOCK FLAG ROWS ARE NOT PERKS. `flag` is a shared kind on
    --      player_progress; a prefix-blind seam would forward every quest flag
    --      into the room map, where core drops it silently — so the bug would
    --      be invisible until a quest key collided with a room id.
    insert into public.player_progress (user_id, slot, kind, key, value)
    values (v_uid, 0, 'flag', 'tutorial_done', 1),
           (v_uid, 0, 'flag', 'recipe:moonbloom_elixir', 1);
    v_r := public.hr_perks_of(v_uid, 0);
    if v_r->'rooms' ? 'tutorial_done' or v_r->'rooms' ? 'recipe:moonbloom_elixir'
       or jsonb_typeof(v_r->'rooms') <> 'object'
       or (select count(*) from jsonb_object_keys(v_r->'rooms')) <> 2 then
      raise exception '§4(b)(iv): unrelated flag rows leaked into rooms: %', v_r->'rooms';
    end if;

    -- (v) A ZERO OR NEGATIVE VALUE IS NOT AN UNLOCK. A `room:forge` at 0 must
    --     not appear at all — core clamps a 0 to no bonus, but an id present
    --     with level 0 in the envelope would make "absent" and "owned at rung
    --     zero" the same wire shape, and one of them is a bug.
    insert into public.player_progress (user_id, slot, kind, key, value)
    values (v_uid, 0, 'flag', 'room:forge', 0);
    v_r := public.hr_perks_of(v_uid, 0);
    if v_r->'rooms' ? 'forge' then
      raise exception '§4(b)(v): a level-0 unlock reached the envelope: %', v_r->'rooms';
    end if;

    -- (vi) ANOTHER PLAYER'S SLOT IS ANOTHER PLAYER'S. The function takes a
    --      user id as an argument and is SECURITY DEFINER, so the filter is
    --      the ONLY thing standing between it and a cross-character read.
    --      CONTROL: slot 0 still answers, so this is not passing by accident.
    v_r := public.hr_perks_of(v_uid, 2);
    if coalesce(v_r->>'ok','') <> 'false' then
      raise exception '§4(b)(vi): slot 2 (no character) returned % — the slot filter is not binding',
                      v_r;
    end if;
    v_r := public.hr_perks_of(v_uid, 0);
    if (v_r->'rooms'->>'kitchen')::int is distinct from 3 then
      raise exception '§4(b)(vi) CONTROL: slot 0 stopped answering — (vi) proves nothing';
    end if;

    -- (vii) THE HONESTY FIELD IS POPULATED. It is what the away card reports;
    --       an empty `sources` would make a zero-perk night unexplainable.
    if v_r->'sources'->>'rooms' is null or v_r->'sources'->>'renown' not like 'blocked:%' then
      raise exception '§4(b)(vii): sources reads % — the channel census is missing', v_r->'sources';
    end if;

    raise exception using errcode = 'HR349', message = 'b349 §4(b) complete — rolling back';
  exception when sqlstate 'HR349' then
    null;   -- the subtransaction is discarded; nothing above it survives
  end;

  -- The rollback is ASSERTED, not assumed.
  if exists (select 1 from public.player_state where user_id = v_uid) then
    raise exception '§4(b) LEAKED a player_state row';
  end if;
  if exists (select 1 from public.player_progress where user_id = v_uid) then
    raise exception '§4(b) LEAKED a player_progress row';
  end if;
  if exists (select 1 from auth.users where id = v_uid) then
    raise exception '§4(b) LEAKED the probe auth.users row';
  end if;

  raise notice 'b349 §4(b) PASSED: no_character refused, a fresh character reads EMPTY, a Kitchen '
               'rung + two Scarecrows + the castle tier all reach the envelope, unrelated flag rows '
               'and level-0 unlocks do not, and the slot filter binds with a control.';
end $$;
