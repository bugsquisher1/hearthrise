-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-14-recipe-learn.sql — hr_recipe_learn: READING A RECIPE SCROLL
--                               BECOMES A SERVER FACT, AND THE ENVELOPE
--                               FINALLY CARRIES THE ARTISAN GATE.
--
-- ⚠⚠⚠ REVIEW ONLY — STAGED, NOT APPLIED. The Coordinator applies this by hand
--     (node tools/apply-migration.mjs, one file). It CONSUMES AN INVENTORY ITEM
--     and grants a permanent capability, so it is an economy surface: Security
--     review required before authority moves.
--
--   Companion guard:  tests/recipe-learn.mjs (PGlite replay + mutation arms)
--   Client half (NOT in this file, systems-engineer's lane): src/legacy.js's
--     `addItem` wrapper currently flips G.unlockedRecipes and deletes the scroll
--     locally; it must send this intent and render the returned set instead.
--
-- RESTATEMENT-DEBT-ACK: hr_state_of and hr_rpc_gate are PATCHED at anchors, not
-- restated. hr_state_of is 21 anchored edits deep and 27 KB; its live body
-- exists in NO FILE (tests/patch-chain-guard.mjs records the depth by name) and
-- an agent cannot read production, so a restatement authored from the repo
-- replay would blind-overwrite every other lane's edit to the envelope the whole
-- game boots from — the b484–b487 class. Both patches assert their anchor
-- matched EXACTLY ONCE and are re-entrant. The paydown — restate each body ONCE
-- from pg_get_functiondef of the LIVE body, then re-pin live-hash-drift — stays
-- the Coordinator's scheduled work.
--
-- ⚠ AFTER APPLYING: hr_state_of AND hr_rpc_gate are LIVE-HASH-TRACKED BODIES.
--   Re-seed with `node tests/live-hash-drift.mjs --live --write` and write the
--   whys from `--codediff`, or the next drift run reports two false divergences.
--
-- ── THE DEFECT, MEASURED IN THE ENGINE RATHER THAN GUESSED ─────────────────
-- 2026-08-16-artisan-progress-model.sql built the STORAGE for a learned recipe —
-- public.player_progress kind='flag', key='recipe:<scroll_id>', catalogued in
-- public.hr_unlocks (9 rows, namespace 'recipe') and read back by hr_perks_of as
-- `unlockedRecipes` — and said, in its own §9, that the WRITE was left for a
-- later author. That author never arrived. Nothing in this database has ever
-- written a recipe flag, for anybody.
--
-- What actually happens today, both sides:
--   ATTENDED: src/legacy.js wraps window.addItem — picking up a scroll sets
--     `G.unlockedRecipes[id] = true` (RESIDUE, src/net/client-state.js) and
--     deletes the item from the local bag. The recipe unlocks. Nothing is sent.
--   AWAY: supabase/functions/hr-accrue/index.ts reads
--     `perkEnv.unlockedRecipes` out of hr_perks_of and hands it to
--     src/core/artisan-sim.js, whose `gateOk(recipe, state.unlockedRecipes)`
--     STOPS the span at tick 0 with STOP_REASON.GATE. The server's set is `{}`
--     for every character alive, so all eight gated recipes pay NOTHING away.
-- That is CLAUDE.md §6's 2026-09-14 rule exactly: the browser says the recipe is
-- learned and the server says it is not, and the player only finds out by
-- leaving the tab and coming back to an empty night. It also survives nothing —
-- the flag lives in a residue bag a cloud restore can rewind, so a restore
-- un-learns a recipe whose scroll was consumed and is not coming back.
--
-- ⚠ CORRECTION TO A STANDING BRIEF, WRITTEN DOWN SO IT IS NOT RE-DERIVED:
--   `artisan` IS ALREADY in PAYABLE_KINDS (supabase/functions/hr-accrue/
--   accrual.js) and has been. This file does NOT need it removed and must not
--   remove it — accrual.js's own header explains that kind-level coarseness
--   would take the other 261 recipes down with the 8 gated ones. The gate is
--   PER-RECIPE and fails closed, which is why this has been a silent hole rather
--   than an outage.
--
-- ── THE VERB: READING A SCROLL IS A PLAYER ACTION WITH A PRICE ──────────────
-- The price is the SCROLL, and the scroll is a real server-held item
-- (player_inventory, dropped by hr_apply's own combat roll). So the verb is:
-- consume one, write the flag, journal it, return the whole set. There is no
-- currency on the wire and none in the function.
--
--   hr_recipe_learn(p_item text, p_slot int default 0, p_idem uuid default null)
--     → { ok:true, item, recipe, qty, unlocked_recipes, version, slot }
--     → { ok:false, error: not_signed_in | bad_slot | bad_item | unknown_recipe
--                        | no_character | already_learned | insufficient_item
--                        | recipe_daily_cap | rate_limited | intent_mismatch }
--
-- `already_learned` is refused BEFORE the consume and is the one refusal that
-- matters most: a second scroll of a recipe you know must not be eaten for
-- nothing. It is returned with the owned set so the client can heal a stale view
-- in the same round trip instead of asking again.
--
-- ── WHY NO NEW CATALOGUE TABLE ─────────────────────────────────────────────
-- public.hr_unlocks ALREADY carries the nine `recipe:*` ids, generated by
-- tools/gen-unlocks.mjs from src/data/{shops,recipes,items,perks}.js, and
-- hr_perks_of already JOINs through it so a mis-filed row is invisible as well
-- as refused. A second list here would be the data double-copy this repo was
-- burned by. The verb reads the same catalogue the reader does, plus hr_items,
-- so a scroll that is not a real item cannot be "learned" from a bag that could
-- never contain it.
--
-- ── WHY hr_recipes_of EXISTS RATHER THAN A SECOND INLINE SELECT ─────────────
-- hr_perks_of holds this query INLINE (it predates any need for a second
-- reader). This file does NOT restate hr_perks_of — that body is a chain too,
-- and replacing it to factor out four lines would risk the perk stack the whole
-- engine prices from for a refactor nobody asked for. Instead the new reader is
-- named ONCE, and §5(b) ASSERTS THE TWO AGREE by executing both against a real
-- probe character. So the duplication is real, bounded, and guarded rather than
-- hidden; folding hr_perks_of onto hr_recipes_of is a one-line paydown for
-- whoever next restates that body, and is filed as such rather than smuggled in
-- here.
--
-- ── THE WIRE SHAPE IS THE CLIENT'S OWN ─────────────────────────────────────
-- `{ "<scroll_id>": true }`, the shape src/core/artisan.js `gateOk` already
-- consumes for BOTH G.unlockedRecipes and the server's answer — so the client
-- needs no translation layer and cannot drift into one, and the engine's away
-- path and the browser's attended path read the identical object.
--
-- ── JOURNAL ────────────────────────────────────────────────────────────────
-- player_ledger gains kind='recipe' (inserted at an anchor, removing nothing).
-- ONE row per scroll read — at most nine in the lifetime of a character, not a
-- row per tick. `qty_in` is 0 and written explicitly: this transaction
-- CONSUMED an item and minted none.
--
-- REVERSIBILITY
--   drop function public.hr_recipe_learn(text, int, uuid);
--   drop function public.hr_recipe_learn__ungated(text, int, uuid);
--   drop function public.hr_recipes_of(uuid, int);
--   -- then patch `'unlocked_recipes', public.hr_recipes_of(...)` back out of
--   -- hr_state_of and the bucket out of hr_rpc_gate. Flags already written stay
--   -- written and keep being read by hr_perks_of; no scroll can be handed back,
--   -- which is why the consume is refused for an already-learned recipe.
--
-- APPLY ORDER: LAST, after 2026-09-14-gem-unlock-buy.sql (the two do not touch
--   the same rows; both splice hr_state_of at the same anchor and compose,
--   because each appends AFTER the anchor text and asserts its own key is absent
--   first). It FAILS CLOSED without 2026-08-16-unlocks.generated.sql and
--   2026-08-16-artisan-progress-model.sql.
--
-- SAFE TO RE-RUN. Every step is guarded and the §5 probes roll themselves back.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_n int;
begin
  if to_regclass('public.hr_unlocks') is null then
    raise exception 'hr_unlocks is missing — apply 2026-08-16-unlocks.generated.sql first'; end if;
  select count(*) into v_n from public.hr_unlocks
   where namespace = 'recipe' and progress_kind = 'flag' and merge = 'flag';
  if v_n = 0 then
    raise exception 'the recipe namespace has no flag-shaped rows — this verb would answer '
                    'unknown_recipe for every scroll in the game';
  end if;
  if to_regclass('public.hr_items') is null then
    raise exception 'hr_items is missing — apply 2026-08-11-catalogue.generated.sql first'; end if;
  if to_regclass('public.player_inventory') is null then
    raise exception 'player_inventory is missing — there would be nothing to consume'; end if;
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress is missing — apply the player-state chain first'; end if;
  if to_regclass('public.player_ledger') is null then
    raise exception 'player_ledger is missing'; end if;
  if to_regprocedure('public.hr_perks_of(uuid,int)') is null then
    raise exception 'hr_perks_of is missing — apply 2026-08-16-artisan-progress-model.sql first; '
                    'without it the flag this verb writes has no reader and the engine still pays '
                    'nothing'; end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing'; end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate is missing — an ungated client verb is not shippable'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,int,uuid,text)') is null then
    raise exception 'hr_intent_replay is missing — replays would eat a second scroll'; end if;
  if to_regprocedure('public.hr_note_rejection(text,int,jsonb)') is null then
    raise exception 'hr_note_rejection is missing (tests/rejections-journal.mjs P6)'; end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_record_rejection is missing'; end if;
  -- Every catalogued scroll must be a real ITEM, or the verb would hold an id
  -- the bag can never contain — a control that reads as present and fires for
  -- nobody.
  if exists (select 1 from public.hr_unlocks u
              where u.namespace = 'recipe'
                and not exists (select 1 from public.hr_items i
                                 where i.item_id = substring(u.unlock_id from 8))) then
    raise exception 'a catalogued recipe scroll is not an item in hr_items — the learn verb could '
                    'never be satisfied for it';
  end if;
end $$;

-- ── 1. player_ledger.kind must admit 'recipe' — PROGRAMMATIC, ADDITIVE ────
do $$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check';
  if v_def is null then
    raise exception 'player_ledger_kind_check is absent — this verb''s journal row would be '
                    'unconstrained, and every other writer assumes the constraint exists';
  end if;
  if position('''recipe''::text' in v_def) > 0 then
    raise notice 'player_ledger.kind already admits ''recipe'' — widen skipped';
    return;
  end if;
  if position('''accrue''::text' in v_def) = 0 then
    raise exception 'player_ledger_kind_check has no ''accrue''::text anchor (%) — refusing to '
                    'rewrite a constraint whose shape this file cannot account for', v_def;
  end if;
  v_new := replace(v_def, '''accrue''::text', '''recipe''::text, ''accrue''::text');
  execute 'alter table public.player_ledger drop constraint player_ledger_kind_check';
  execute 'alter table public.player_ledger add constraint player_ledger_kind_check ' || v_new;
  raise notice 'player_ledger.kind widened to admit ''recipe'' (insertion, nothing removed)';
end $$;

-- ── 2. THE READER — hr_recipes_of ─────────────────────────────────────────
-- The learned set for ONE character, in the CLIENT'S OWN wire shape
-- `{ "<scroll_id>": true }` (src/core/artisan.js gateOk reads exactly this for
-- both G.unlockedRecipes and the server's answer). Joined through hr_unlocks so
-- that a row filed under the wrong kind, or under an id the catalogue does not
-- carry, is INVISIBLE as well as refused — the same join hr_perks_of uses, on
-- purpose, because a second reader with a looser predicate is how a forged row
-- would have become a capability.
--
-- FAIL-CLOSED BY SHAPE, not by a branch somebody wrote: no row → no key →
-- gateOk false → the span stops at tick 0 and pays only the time actually
-- worked. There is no code path in which an absent row opens a recipe.
create or replace function public.hr_recipes_of(p_user uuid, p_slot int)
returns jsonb language sql stable security invoker set search_path = public as $fn$
  select coalesce(jsonb_object_agg(substring(pp.key from 8), true), '{}'::jsonb)
    from public.player_progress pp
    join public.hr_unlocks u
      on  u.unlock_id = pp.key
      and u.namespace = 'recipe'
      and u.progress_kind = pp.kind
   where pp.user_id = p_user
     and pp.slot    = coalesce(p_slot, 0)
     and pp.period_key = ''
     and pp.value  > 0
     and p_user is not null;
$fn$;
-- Takes an ARBITRARY uuid. No browser role may call it; the client receives its
-- answer through the envelope, for its own character.
revoke execute on function public.hr_recipes_of(uuid, int) from public;
revoke execute on function public.hr_recipes_of(uuid, int)
  from anon, authenticated, service_role;

-- ── 3. hr_recipe_learn__ungated — verify, consume, grant, journal ──────────
create or replace function public.hr_recipe_learn__ungated(
  p_item text, p_slot int, p_idem uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  -- BLAST RADIUS, not balance. Nine scrolls exist and each is once per character
  -- forever, so a character learning twenty-five recipes in a day is not play
  -- whatever the catalogue grows to. Read from the APPEND-ONLY LEDGER, never
  -- from a counter this function maintains (the clan_deposit pattern).
  c_max_per_day constant int := 25;
  c_max_id_len  constant int := 64;

  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_key    text;
  v_name   text;
  v_st     public.player_state%rowtype;
  v_cached jsonb;
  v_have   bigint;
  v_today  int;
  v_intent text;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;
  if p_item is null or length(p_item) = 0 or length(p_item) > c_max_id_len then
    return jsonb_build_object('ok', false, 'error', 'bad_item');
  end if;
  v_key := 'recipe:' || p_item;

  -- ── (1) THE CATALOGUE, BEFORE ANY LOCK. A refusal that is a fact about the
  --        CATALOGUE needs no character, no lock and no row, so a client looping
  --        on a bad id cannot contend on a real player's state row. BOTH halves
  --        are required: the unlock must be catalogued AND the scroll must be a
  --        real item, or a forged id could name a flag with no possible scroll.
  select u.unlock_id into v_name from public.hr_unlocks u
   where u.unlock_id = v_key and u.namespace = 'recipe' and u.progress_kind = 'flag';
  if v_name is null
     or not exists (select 1 from public.hr_items i where i.item_id = p_item) then
    perform public.hr_record_rejection(v_uid, v_slot, 'recipe_learn', 'unknown_recipe',
      jsonb_build_object('item', p_item), 1);
    return jsonb_build_object('ok', false, 'error', 'unknown_recipe', 'item', p_item);
  end if;
  v_intent := 'recipe_learn:' || p_item;

  -- ── (2) SERIALISE on the character. Byte-identical to the key hr_apply takes,
  --        so this also serialises against an accrual settling the same
  --        character — which matters here because the accrual is what DROPS the
  --        scroll. Transaction-scoped (safe under the transaction pooler).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (3) IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY, and is read
  --        INSIDE the lock so two simultaneous retries of one gesture cannot
  --        both miss the cache and eat two scrolls. ONLY SUCCESSES ARE CACHED
  --        (see (8)), so "you have no scroll" stays retryable once one drops.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, v_intent) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then
    return v_cached || jsonb_build_object('replayed', true);
  end if;

  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── (4) ALREADY LEARNED — REFUSED ABOVE THE CONSUME. This is the ordering that
  --        protects the player: a second Field Cookbook must not be eaten to
  --        re-learn something you know. The owned set rides the refusal so a
  --        stale client heals in the same round trip instead of asking twice.
  if (public.hr_recipes_of(v_uid, v_slot)) ? p_item then
    return jsonb_build_object('ok', false, 'error', 'already_learned',
      'item', p_item, 'unlocked_recipes', public.hr_recipes_of(v_uid, v_slot));
  end if;

  -- ── (5) THE PER-DAY CLAMP, from the append-only ledger, on the SERVER clock.
  select count(*) into v_today from public.player_ledger
   where user_id = v_uid and slot = v_slot and kind = 'recipe'
     and at >= ((date_trunc('day', (now() at time zone 'utc'))) at time zone 'utc');
  if v_today >= c_max_per_day then
    perform public.hr_record_rejection(v_uid, v_slot, 'recipe_learn', 'recipe_daily_cap',
      jsonb_build_object('used', v_today, 'limit', c_max_per_day), 1);
    return jsonb_build_object('ok', false, 'error', 'recipe_daily_cap',
      'used', v_today, 'limit', c_max_per_day);
  end if;

  -- ── (6) THE PRICE: ONE SCROLL, HELD BY THE SERVER, consumed under the row
  --        lock. `for update` on the inventory row as well as the character row,
  --        because the accrual engine credits drops into this same table.
  select qty into v_have from public.player_inventory
   where user_id = v_uid and slot = v_slot and item_id = p_item for update;
  v_have := coalesce(v_have, 0);
  if v_have < 1 then
    perform public.hr_record_rejection(v_uid, v_slot, 'recipe_learn', 'insufficient_item',
      jsonb_build_object('item', p_item, 'have', v_have, 'need', 1), 1);
    return jsonb_build_object('ok', false, 'error', 'insufficient_item',
      'item', p_item, 'have', v_have, 'need', 1);
  end if;
  if v_have = 1 then
    delete from public.player_inventory
     where user_id = v_uid and slot = v_slot and item_id = p_item;
  else
    update public.player_inventory set qty = v_have - 1
     where user_id = v_uid and slot = v_slot and item_id = p_item;
  end if;

  -- ── (7) THE GRANT. kind='flag', period_key='' — the shape hr_unlocks
  --        catalogues and player_progress_unlock_guard independently polices.
  --        `greatest` is the STORAGE rule; (4) is the PURCHASE decision, and the
  --        two deliberately do not depend on each other.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'flag', v_key, 1, '', null, now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = greatest(pp.value, excluded.value), updated_at = now();

  update public.player_state
     set version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;
  -- ⚠ accrued_to IS NOT TOUCHED. Reading a scroll is not an activity change, so
  --   the unpaid accrual window survives it; stamping it here would confiscate
  --   the reader's elapsed time, silently.

  -- ── (8) THE JOURNAL. ONE row per scroll read. Every mint counter is ZERO and
  --        written explicitly: this transaction CONSUMED an item and minted
  --        none, which is a different fact from "unstamped".
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, v_slot, 'recipe', v_intent,
     0, 0, 0, 0, 0,
     jsonb_build_object('item', p_item, 'key', v_key, 'consumed', 1, 'idem', p_idem));

  select * into v_st from public.player_state where user_id = v_uid and slot = v_slot;
  select coalesce(qty, 0) into v_have from public.player_inventory
   where user_id = v_uid and slot = v_slot and item_id = p_item;
  v_result := jsonb_build_object(
    'ok', true, 'item', p_item, 'recipe', v_key,
    'qty', coalesce(v_have, 0), 'version', v_st.version, 'slot', v_slot,
    -- THE WHOLE SET, never a delta the client has to merge upward (CLAUDE.md §6,
    -- 2026-09-14). One answer hydrates the gate.
    'unlocked_recipes', public.hr_recipes_of(v_uid, v_slot));

  if p_idem is not null then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, v_slot, v_intent, v_result, now())
      on conflict (user_id, intent_id) do nothing;
  end if;

  return v_result;
end $$;

-- ── 4. The gated wrapper ───────────────────────────────────────────────────
-- ⚠ p_slot AND p_idem CARRY DEFAULTS (PostgREST resolves on the named arguments
--   in the POST body; without them a {p_item} post answers PGRST202, a 404
--   nobody can tell from an unapplied migration). §5(c) asserts it.
-- ⚠ THE hr_note_rejection SEAM IS WRITTEN HERE, NOT INHERITED —
--   2026-09-12-hr-rejections-journal.sql decorated the wrappers that existed
--   WHEN IT RAN; a wrapper created later carries its own or
--   tests/rejections-journal.mjs P6 fails at chain end. Exactly one call.
create or replace function public.hr_recipe_learn(
  p_item text, p_slot int default 0, p_idem uuid default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_recipe_learn') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_note_rejection('hr_recipe_learn', p_slot,
           public.hr_recipe_learn__ungated($1, $2, $3));
end $w$;

revoke execute on function public.hr_recipe_learn__ungated(text, int, uuid) from public;
revoke execute on function public.hr_recipe_learn__ungated(text, int, uuid)
  from anon, authenticated, service_role;
revoke execute on function public.hr_recipe_learn(text, int, uuid) from public;
revoke execute on function public.hr_recipe_learn(text, int, uuid)
  from anon, authenticated, service_role;
grant  execute on function public.hr_recipe_learn(text, int, uuid) to authenticated;

-- ── 4b. hr_rpc_gate — PROGRAMMATIC additive patch (one bucket) ─────────────
-- An UNKNOWN bucket fails CLOSED (`else return false`), so without this the RPC
-- answers rate_limited forever and the feature deploys green and dead.
-- 12/min: nine scrolls exist and each is read once in the life of a character.
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');   -- CR-tolerant (CRLF working copies)
  if position('''hr_recipe_learn''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits hr_recipe_learn — patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, 'else return false;' || chr(10) || '  end case;', '')))
     <> length('else return false;' || chr(10) || '  end case;') then
    raise exception 'hr_rpc_gate case terminator anchor did not match exactly once — refusing to '
                    'patch blind';
  end if;
  v_new := replace(v_src,
    'else return false;' || chr(10) || '  end case;',
    'when ''hr_recipe_learn'' then v_limit := 12;' || chr(10) ||
    '    else return false;' || chr(10) || '  end case;');
  execute v_new;
  raise notice 'hr_rpc_gate patched: hr_recipe_learn admitted at 12/min';
end $$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 4c. hr_state_of — PROJECT the learned set (programmatic, additive) ─────
-- WHY THE ENVELOPE: the gate the client renders (src/features/recipe-book.js
-- `gatedLocked`, src/legacy.js gateOk, the Collection Log's "learned" tick) reads
-- G.unlockedRecipes, which is RESIDUE. Projecting the server's set is what lets
-- the client stop authoring it — and until it does, this key is what makes the
-- disagreement VISIBLE instead of silent.
--
-- ⚠ CHARACTER-SCOPED (v_st.slot): a recipe is learned by the character that read
--   the scroll, which is the scope hr_perks_of already reads it at. Any other
--   scope here would make the envelope and the engine disagree.
--
-- ⚠ READ UNFILTERED, as `traits`/`hero_slots`/`gem_unlocks` are: the generic
--   `progress` array is LIMIT 1000, and a gate that truncates is a gate that can
--   silently re-lock a recipe somebody spent a scroll on.
--
-- Patched at the `total_level` anchor, which survives insertion because every
-- patcher appends AFTER the anchor text. NO-OP on re-apply.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'total_level', public.hr_total_level(p_user, v_st.slot),$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'unlocked_recipes', public.hr_recipes_of$q$) > 0 then
    raise notice 'hr_state_of already projects unlocked_recipes — patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of total_level anchor did not match exactly once — its shape '
                    'is not the one this file was derived against. Do NOT patch a body you cannot '
                    'account for.';
  end if;
  v_def := replace(v_def, c_anchor, c_anchor || $new$
    -- recipe-learn (2026-09-14): the gated recipes THIS CHARACTER has learned,
    -- in the client's own `{ "<scroll_id>": true }` shape. Written only by
    -- hr_recipe_learn (there is no client write policy and no client write grant
    -- on player_progress); the SAME rows hr_perks_of hands the away engine, so
    -- the attended screen and the night finally read one set. `{}` on a fresh
    -- character is a known state, not an error: no row is a LOCKED recipe.
    'unlocked_recipes', public.hr_recipes_of(p_user, v_st.slot),$new$);
  execute v_def;
  raise notice 'hr_state_of patched: the envelope projects the character''s learned recipes';
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 4d. Grant-hygiene baseline (if present) ────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied; nothing to update';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_recipe_learn' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_recipe_learn', 'p_item text, p_slot integer, p_idem uuid', 'authenticated',
     'added 2026-09-14: reading a recipe scroll becomes a server fact — consumes ONE scroll from '
     'the caller''s own player_inventory and writes the kind=''flag'' recipe:<id> row '
     'hr_perks_of/hr_recipes_of read. The catalogue is public.hr_unlocks (namespace ''recipe''), '
     'generated from src/data; the caller sends an item id, one of its own slots and an '
     'idempotency key. already_learned is refused BEFORE the consume.');
end $$;

-- ── 5. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. The apply is atomic, so
-- a raise here reverts every section above it. Row-writing probes live in a
-- subtransaction discarded by a sentinel raise (HR843), so this block is
-- NET-ZERO on production — asserted by the leak check at the end.
do $$
declare
  v_uid   constant uuid := '00000000-0000-4000-8000-0000b5470001';
  v_n     int;
  v_bad   text;
  v_r     jsonb;
  v_env   jsonb;
  v_perks jsonb;
  v_item  text;
  v_ver   bigint;
begin
  -- (a) THE PROJECTION IS TOP-LEVEL AND IT IS THIS READER'S ANSWER. Not "the
  --     body mentions unlocked_recipes" — the exact spliced expression, because
  --     a key projected inside `state`, or filled from a different source, is
  --     the shipped bug under a new name.
  select p.prosrc into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  if position($q$'unlocked_recipes', public.hr_recipes_of(p_user, v_st.slot)$q$ in v_bad) = 0 then
    raise exception 'GATE(a): hr_state_of does not project unlocked_recipes from hr_recipes_of';
  end if;
  -- AND THE NEIGHBOURS SURVIVED. This body is 21 anchored edits deep; the way
  -- this file could hurt somebody is by dropping one of them.
  if position($q$'renown_high'$q$ in v_bad) = 0
     or position($q$'hero_slots'$q$ in v_bad) = 0
     or position($q$'traits'$q$ in v_bad) = 0
     or position($q$'inventory_complete'$q$ in v_bad) = 0 then
    raise exception 'GATE(a): a pre-existing hr_state_of projection was LOST by this splice';
  end if;

  -- (b) THE CLIENT SURFACE. Wrapper callable by `authenticated`; the ungated twin
  --     and the reader callable by NOBODY; two defaults so PostgREST resolves a
  --     one-argument post; exactly one rejection seam (P6).
  if not has_function_privilege('authenticated', 'public.hr_recipe_learn(text,int,uuid)', 'execute') then
    raise exception 'GATE(b): hr_recipe_learn is not callable by authenticated — a dead verb';
  end if;
  if has_function_privilege('authenticated', 'public.hr_recipe_learn__ungated(text,int,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_recipe_learn__ungated(text,int,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_recipe_learn__ungated(text,int,uuid)', 'execute') then
    raise exception 'GATE(b): the UNGATED verb is client-executable — the rate gate is bypassable';
  end if;
  if has_function_privilege('anon', 'public.hr_recipe_learn(text,int,uuid)', 'execute') then
    raise exception 'GATE(b): anon may learn a recipe';
  end if;
  if has_function_privilege('authenticated', 'public.hr_recipes_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_recipes_of(uuid,int)', 'execute') then
    raise exception 'GATE(b): hr_recipes_of is client-executable — it takes an ARBITRARY uuid';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_recipe_learn' and p.pronargdefaults = 2;
  if v_n <> 1 then
    raise exception 'GATE(b): hr_recipe_learn does not carry two argument defaults — PostgREST '
                    'would answer PGRST202 to a {p_item} post';
  end if;
  select (select count(*) from regexp_matches(p.prosrc, 'hr_note_rejection\(', 'g')) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_recipe_learn';
  if v_n <> 1 then
    raise exception 'GATE(b): the wrapper carries % hr_note_rejection calls (need exactly 1)', v_n;
  end if;
  -- No client write policy on the table the capability lives in.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'player_progress'
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_n > 0 then
    raise exception 'GATE(b): player_progress has % client write policies — the gate this verb '
                    'sells could be written by the browser', v_n;
  end if;

  -- (c) EXECUTED, END TO END, on a synthetic account inside a discarded
  --     subtransaction. Everything above is text and catalogue.
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(c) CANNOT RUN: hr_create_character missing';
  end if;
  select substring(u.unlock_id from 8) into v_item from public.hr_unlocks u
   where u.namespace = 'recipe' and u.progress_kind = 'flag'
     and exists (select 1 from public.hr_items i where i.item_id = substring(u.unlock_id from 8))
   order by u.unlock_id limit 1;
  if v_item is null then
    raise exception 'GATE(c) CANNOT RUN: no catalogued recipe scroll is also a real item';
  end if;
  begin  -- ── SUBTRANSACTION ────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then
      raise exception 'GATE(c): no probe character: %', v_r; end if;

    -- (c1) FAIL-CLOSED BY DEFAULT. A fresh character has learned nothing, and
    --      the envelope says so as an EMPTY OBJECT rather than an absent key —
    --      the difference between "locked" and "the server has no opinion".
    v_env := public.hr_state_of(v_uid, 0);
    if v_env->'unlocked_recipes' is null then
      raise exception 'GATE(c1): the envelope carries no unlocked_recipes key at all';
    end if;
    if (v_env->'unlocked_recipes') <> '{}'::jsonb then
      raise exception 'GATE(c1): a fresh character already knows %', v_env->'unlocked_recipes';
    end if;

    -- (c2) NO SCROLL, NO LEARN. Run BEFORE any scroll is placed, so the refusal
    --      is the shipped default rather than something this probe arranged.
    v_r := public.hr_recipe_learn__ungated(v_item, 0, gen_random_uuid());
    if v_r->>'error' is distinct from 'insufficient_item' then
      raise exception 'GATE(c2): learning % with an empty bag answered % — it must be '
                      'insufficient_item', v_item, v_r;
    end if;
    if (public.hr_recipes_of(v_uid, 0)) ? v_item then
      raise exception 'GATE(c2): the REFUSED learn granted the recipe anyway';
    end if;

    -- (c3) A FORGED ID BUYS NOTHING AND EATS NOTHING.
    v_r := public.hr_recipe_learn__ungated('recipe_for_infinite_gold', 0, gen_random_uuid());
    if v_r->>'error' is distinct from 'unknown_recipe' then
      raise exception 'GATE(c3): an uncatalogued id answered %', v_r;
    end if;

    -- (c4) THE HAPPY PATH. TWO scrolls are placed so the consume is MEASURABLE
    --      (one would only prove the row vanished, which a delete-everything bug
    --      also produces). Exactly one must be eaten.
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, v_item, 2)
      on conflict (user_id, slot, item_id) do update set qty = 2;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_recipe_learn__ungated(v_item, 0, '00000000-0000-4000-8000-0000b5470aa1');
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(c4): learning % with a scroll in the bag was refused: %', v_item, v_r;
    end if;
    if (select coalesce(qty,0) from public.player_inventory
         where user_id = v_uid and slot = 0 and item_id = v_item) <> 1 then
      raise exception 'GATE(c4): the consume took % scrolls, not exactly 1',
        2 - coalesce((select qty from public.player_inventory
                       where user_id = v_uid and slot = 0 and item_id = v_item), 0);
    end if;
    if not ((v_r->'unlocked_recipes') ? v_item) then
      raise exception 'GATE(c4): the verb''s own answer does not carry the recipe just learned';
    end if;
    if (select version from public.player_state where user_id = v_uid and slot = 0) <= v_ver then
      raise exception 'GATE(c4): the version did not advance — a client holding the old one would '
                      'never reconcile';
    end if;

    -- (c5) THE THREE READERS AGREE. This is the assertion that matters most: the
    --      ENVELOPE (what the browser renders), hr_recipes_of (what this verb
    --      answers) and hr_perks_of (what the AWAY engine prices the night from)
    --      must all carry the same set. A projection the engine does not honour
    --      is worse than no projection — the player would see it learned and the
    --      night would still stop at tick 0.
    v_env   := public.hr_state_of(v_uid, 0);
    v_perks := public.hr_perks_of(v_uid, 0);
    if (v_env->'unlocked_recipes') is distinct from (v_r->'unlocked_recipes') then
      raise exception 'GATE(c5): hr_state_of (%) and the learn verdict (%) disagree',
        v_env->'unlocked_recipes', v_r->'unlocked_recipes';
    end if;
    if coalesce(v_perks->>'ok','false') <> 'true' then
      raise exception 'GATE(c5) CANNOT RUN: hr_perks_of answered % for the probe character', v_perks;
    end if;
    if (v_perks->'unlockedRecipes') is distinct from (v_env->'unlocked_recipes') then
      raise exception 'GATE(c5): the AWAY engine''s set (%) and the envelope''s (%) disagree — the '
                      'browser would show a recipe the night refuses to craft',
        v_perks->'unlockedRecipes', v_env->'unlocked_recipes';
    end if;

    -- (c6) A SECOND SCROLL IS NOT EATEN FOR NOTHING. Fresh key, same recipe:
    --      already_learned, and the remaining scroll is still there.
    v_r := public.hr_recipe_learn__ungated(v_item, 0, gen_random_uuid());
    if v_r->>'error' is distinct from 'already_learned' then
      raise exception 'GATE(c6): re-learning answered % — it must be already_learned', v_r;
    end if;
    if (select coalesce(qty,0) from public.player_inventory
         where user_id = v_uid and slot = 0 and item_id = v_item) <> 1 then
      raise exception 'GATE(c6): the refused re-learn ATE THE SECOND SCROLL';
    end if;

    -- (c7) THE REPLAY. The SAME idempotency key answers from the cache and
    --      consumes nothing — the property a retrying client depends on.
    v_r := public.hr_recipe_learn__ungated(v_item, 0, '00000000-0000-4000-8000-0000b5470aa1');
    if coalesce(v_r->>'replayed','false') <> 'true' then
      raise exception 'GATE(c7): the replayed key was not answered from the cache: %', v_r;
    end if;
    if (select coalesce(qty,0) from public.player_inventory
         where user_id = v_uid and slot = 0 and item_id = v_item) <> 1 then
      raise exception 'GATE(c7): the replay CONSUMED a second scroll';
    end if;

    -- (c8) ONE journal row, naming what was consumed.
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and kind = 'recipe';
    if v_n <> 1 then raise exception 'GATE(c8): % ledger rows for one scroll read', v_n; end if;

    raise exception using errcode = 'HR843',
      message = 'recipe-learn §5 complete — rolling back';
  exception when sqlstate 'HR843' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF. Without this the file seeds a character into production as a
  -- side effect of verifying itself, which CLAUDE.md §2 forbids outright.
  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from auth.users             where id = v_uid) then
    raise exception 'GATE: §5 LEAKED a probe row';
  end if;

  raise notice 'recipe-learn: hr_state_of projects unlocked_recipes top-level beside its 21 '
               'neighbours, the reader and the ungated verb are callable by nobody, the wrapper is '
               'gated + seamed + defaulted, and EXECUTED: a fresh character knows nothing, an empty '
               'bag is refused, a forged id is refused, one scroll of two is consumed exactly once, '
               'the envelope / the verdict / hr_perks_of all agree, a re-learn eats nothing and a '
               'replay eats nothing — all green, net zero';
end $$;
