-- ============================================================================
-- 2026-08-24-inventory-complete.sql — the SERVER-STAMPED `inventory_complete`
-- signal (inventory-flip Step B1). hr_state_of gains ONE additive top-level
-- boolean; NOTHING ELSE in the database changes.
--
-- Governing rule: CLAUDE.md "Server authority (locked 2026-08-10)".
-- docs/design/live-settlement.md, src/net/accrue.js:863 (the dormant flip).
--
-- ⚠ GENERATED. The restated hr_state_of below is produced by
--   `node tools/derive-inventory-complete.mjs --write` from the CURRENT last
--   toucher (2026-08-21-streak-state.sql) and patched at ONE named anchor. Do
--   NOT hand-edit; `--check` runs in the suite and will fail. Retyping the body
--   is how a load-bearing invariant silently disappears.
--
-- ── WHAT SHIPS ───────────────────────────────────────────────────────────────
--   hr_state_of — a top-level `inventory_complete` boolean. TRUE only when the
--   accrual settle loop has no pending, un-drained window that could still grant
--   OWNABLE items, computed from ALREADY-SERVER-STAMPED columns (active_kind /
--   active_id / active_since / accrued_to). No new column, no new grant, no
--   change to hr_apply or the accrual engine's WRITES.
--
-- ── WHY NO hr_apply / NO NEW COLUMN ──────────────────────────────────────────
-- Completeness is a pure function of state the settle loop ALREADY stamps:
-- accrued_to IS the engine's completeness watermark (advanced to now() only by a
-- full settle), and the pointer columns say whether a window is open. Adding a
-- separate stamped column would be a SECOND completeness record that could
-- disagree with accrued_to — precisely the drift this design avoids. If a future
-- engine introduces genuine partial/multi-pointer settlement (so a settle can
-- advance accrued_to while leaving inventory inconsistent), THIS is where an
-- explicit engine-stamped column must be added; see the tool header.
--
-- ── APPLY ORDER ──────────────────────────────────────────────────────────────
--   ... -> 2026-08-21-streak-state.sql (predecessor of the hr_state_of body)
--       -> THIS FILE   (new last toucher of hr_state_of)
--   §0 fails closed if the live body is not the streak-state one.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Additive and non-destructive. Reverting means re-applying
-- 2026-08-21-streak-state.sql (restores the prior body); the field simply stops
-- being emitted, and the dormant client flip fails closed to MERGE — exactly its
-- behaviour today. No data is touched in either direction.
--
-- ⚠ THIS FILE IS NOW THE LAST TOUCHER OF hr_state_of.
-- ============================================================================

-- ── 0. PRECONDITIONS + LAST-TOUCHER SELF-CHECK — FAIL CLOSED ─────────────
do $$
declare v_state text;
begin
  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  if v_state is null then raise exception 'hr_state_of does not exist — apply the player-state chain first'; end if;

  -- The body we are about to REPLACE must be the streak-state one (its two
  -- distinctive markers: the streak projection AND the collection exclusion).
  if position('''streak_days'', v_st.streak_days' in v_state) = 0 then
    raise exception 'the LIVE hr_state_of is not the streak-state body (no streak projection) — apply 2026-08-21-streak-state.sql first';
  end if;
  if position('not like ''ev:loot:%''' in v_state) = 0 then
    raise exception 'the LIVE hr_state_of is not the streak-state body (no ev:loot exclusion) — apply 2026-08-21-streak-state.sql first';
  end if;

  if position('inventory_complete' in v_state) > 0 then
    raise notice 'inventory_complete is already present — this apply is a no-op replace';
  end if;
end $$;

-- ── 1. hr_state_of — GENERATED. Do not hand-edit; see the header. ────────
create or replace function public.hr_state_of(p_user uuid, p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_st public.player_state%rowtype;
begin
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  return jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'now', now(),
    'state', jsonb_build_object(
      'slot', v_st.slot, 'gold', v_st.gold, 'gems', v_st.gems,
      'hearth_tokens', v_st.hearth_tokens,
      'hp', v_st.hp, 'max_hp', v_st.max_hp, 'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      -- AUTO-EAT. Flat keys rather than a nested object because the accrual
      -- shell reads them field by field off `st` and a nested bag would be one
      -- more place a `?? {}` could quietly turn a missing column into a
      -- default. `auto_eat_enabled` is the purchased-trait receipt.
      'auto_eat_enabled', v_st.auto_eat_enabled,
      'auto_eat_food', v_st.auto_eat_food,
      'auto_eat_pct', v_st.auto_eat_pct,
      -- b348: THE GATHERING TOOL CARRY. Its presence here is what tells the
      -- accrual engine the server owns the carry — `st.tool_carry ?? null`, and
      -- the null branch omits the delta key. Never nested, for the same reason
      -- the auto-eat keys are flat.
      'tool_carry', v_st.tool_carry,
      -- Phase 0: THE IN-FLIGHT FIGHT. Its presence here is what tells the
      -- accrual engine the server owns the fight — `st.fight ?? null`, and the
      -- null branch omits the delta key, exactly as tool_carry does. Never
      -- nested, for the same reason the auto-eat keys are flat.
      'fight', v_st.fight,
      -- Slice 3: the daily settle STREAK, server-owned, advanced only inside
      -- hr_apply from now(). Projected so the client can render it; never read
      -- for authority, and there is no present:true field anywhere.
      'streak_days', v_st.streak_days,
      'streak_day_key', v_st.streak_day_key),
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_level_from_xp(xp)))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ELEMENTS/ENCHANTING v1: the server-owned weapon enchant,
    -- `{ <equip_slot>: <element> }`. Read here so the client renders it and the
    -- accrual shell builds `eq` from equipment + this (accrual.js weakness()),
    -- never from a client value. `{}` when nothing is enchanted.
    'enchant', coalesce(v_st.enchant, '{}'::jsonb),
    'farm', coalesce((
      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,
                                          'planted_at', planted_at, 'watered_at', watered_at)
                       order by plot_idx)
        from public.player_farm where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value,
                                          'period', period_key, 'state', state))
        from (select kind, key, value, period_key, state
                from public.player_progress
               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
                 -- Slices 1+2: the bestiary (ev:kill_monster:%) and collection
                 -- (ev:loot:%) populations are served by hr_bestiary_of /
                 -- hr_collection_of; together they approach the 1000-row cap, so
                 -- they are kept OUT of the generic envelope in one reviewed change.
                 and key not like 'ev:kill_monster:%'
                 and key not like 'ev:loot:%'
               order by period_key, kind, key
               limit 1000) p), '[]'::jsonb),
    'progress_truncated', (
      select count(*) > 1000 from (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
           and key not like 'ev:kill_monster:%'
           and key not like 'ev:loot:%'
         limit 1001) t),
    'total_level', public.hr_total_level(p_user, v_st.slot),
    -- ── inventory-flip Step B1: THE SERVER-STAMPED COMPLETENESS SIGNAL ───────
    -- TRUE only when the accrual settle loop has NO pending, un-drained window
    -- that could still grant OWNABLE items — i.e. player_inventory is a complete
    -- statement of the owned set and the dormant absolute-replace flip
    -- (src/net/accrue.js envelopeBaselineComplete) may safely fire. Read
    -- src/net/accrue.js:863 and tools/derive-inventory-complete.mjs's header for
    -- why a false negative merely defers the flip (safe) and a false positive
    -- would DELETE a legit crafted stack (the one irreversible mistake).
    --
    -- SINGLE SOURCE OF TRUTH: this reads the engine's OWN completeness watermark,
    -- accrued_to (advanced to now() by, and only by, a full settle), against the
    -- engine's OWN min-span ACCRUE_MIN_MS = 60000 ms (accrual.js). Below that
    -- span the engine settles nothing (SKIP.TOO_SOON) so no grant is pending;
    -- at/above it there is an un-settled payable window → INCOMPLETE. The 60s
    -- literal is pinned to ACCRUE_MIN_MS by tests/inventory-complete-probe.mjs.
    --
    -- FAIL-CLOSED and CHAINED-CRAFT-SAFE (see the tool header): idle/unknown
    -- pointer → no accrual → complete; a payable pointer with a drained window
    -- (< 60s) → complete, because each settle is atomic and collect-before-switch
    -- leaves no cross-pointer chain mid-flight; a payable pointer with an open
    -- window (>= 60s) OR an inconsistent payable row with no active_since →
    -- INCOMPLETE.
    'inventory_complete', (
      case
        when v_st.active_kind is null
          or v_st.active_kind not in ('combat', 'gather', 'artisan')
          or v_st.active_id is null
          then true
        when v_st.active_since is null
          then false
        else now() - greatest(v_st.accrued_to, v_st.active_since) < interval '60 seconds'
      end)
  );
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 2. SELF-VERIFICATION — THE COMMIT GATE (STRUCTURAL ONLY) ──────────────
-- ⚠ NO DRIVEN CHARACTER HERE, and that is deliberate — the same ruling
--   2026-08-21-streak-state.sql §3(g) states: this block runs on APPLY, which
--   COMMITS, so hr_create_character would leave a synthetic character (and
--   immutable player_ledger rows) in PRODUCTION. The field's BEHAVIOUR — TRUE
--   idle, FALSE open-window, TRUE drained, FALSE no-active_since — is driven
--   against the throwaway replay database by tests/inventory-complete-probe.mjs,
--   where teardown is free. Here we assert only the STRUCTURE of the body and
--   the grants, which cannot pollute anything.
do $$
declare v_state text; v_bad text; v_missing text; v_n int;
begin
  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';

  -- (a) EVERYTHING THE STREAK BODY HAD IS STILL HERE, plus the new field. A
  --     control set spanning every prior link of HR_STATE_OF_CHAIN.
  foreach v_bad in array array[
    'tool_carry', '''enchant'', coalesce(v_st.enchant', '''fight'', v_st.fight',
    '''streak_days'', v_st.streak_days', 'not like ''ev:kill_monster:%''',
    'not like ''ev:loot:%''', 'hr_total_level(p_user, v_st.slot)',
    -- this file's change:
    '''inventory_complete''', 'active_kind not in (''combat'', ''gather'', ''artisan'')',
    'interval ''60 seconds''']
  loop
    if position(v_bad in v_state) = 0 then
      raise exception 'the hr_state_of that landed does not contain "%" — the restatement in §1 is wrong', v_bad;
    end if;
  end loop;

  -- (b) THE TWO PREFIX EXCLUSIONS STILL APPEAR TWICE EACH (agg + truncated
  --     count) — this file did not disturb the progress subquery.
  select count(*) into v_n from regexp_matches(v_state, 'not like ''ev:kill_monster:%''', 'g');
  if v_n <> 2 then raise exception 'ev:kill_monster:%% excluded % times, expected 2', v_n; end if;
  select count(*) into v_n from regexp_matches(v_state, 'not like ''ev:loot:%''', 'g');
  if v_n <> 2 then raise exception 'ev:loot:%% excluded % times, expected 2', v_n; end if;

  -- (c) THE FLAG READS ONLY SERVER-STAMPED STATE, never a client value. The
  --     completeness watermark is accrued_to; there is no 'present'/'complete'
  --     delta key anywhere, and the pointer columns are the only inputs.
  if position('greatest(v_st.accrued_to, v_st.active_since)' in v_state) = 0 then
    raise exception 'inventory_complete does not gate on the accrued_to/active_since watermarks — it may not read the settle loop''s truth';
  end if;

  -- (d) THE RPC IS NOT CLIENT-EXECUTABLE — the whole game if it were.
  for v_missing in select unnest(array['anon', 'authenticated', 'service_role', 'public']) loop
    if has_function_privilege(v_missing, 'public.hr_state_of(uuid,integer)', 'execute') then
      raise exception 'hr_state_of is EXECUTABLE by %', v_missing;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_state_of(uuid,integer)', 'execute') then
    raise exception 'hr_engine cannot execute hr_state_of — every load would 500';
  end if;

  raise notice 'INVENTORY-COMPLETE OK (structural) — field present, gates on accrued_to/active_since, streak/enchant/fight/exclusions intact, RPC not client-executable. Behaviour driven by tests/inventory-complete-probe.mjs.';
end $$;
