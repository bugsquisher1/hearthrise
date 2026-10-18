-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE CONDITIONAL ACTION ENGINE'S SERVER HALF (lane action-engine;
-- Tyler 2026-10-18: the conditional action engine, stop rules, an action set
-- per hunting ground, copy settings, monster density and the gathering share).
-- STAGED. Game CLOSED: applies on its passing §9; Security reviews it with the
-- S1 surfaces at the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- A bar slot is now { action: { type, id }, conditions: [≤3 { metric, op,
-- value, subject? }], join } (src/data/condition-metrics.js). This file:
--   §1 the CATALOGUES the validator reads, generated from src/data (pinned equal
--      by tests/hunt-core/conditions.mjs sql-rows; `--print` re-renders them):
--      hr_hunt_condition_metrics, hr_hunt_action_ids, hr_hunt_role_rules,
--      hr_hunt_condition_limits.
--   §2 THE VALIDATOR: hr_hunt_cond_check / hr_hunt_slot_check, hr_hunt_bar_check
--      RESTATED (a stored slot is a slot object, an ability id as shorthand, or
--      null = an empty tablet; refused by name: bad_metric, bad_op, bad_value,
--      bad_subject, bad_action, bad_slot, bad_join, too_many_conditions,
--      too_many_slots), hr_hunt_stop_rules_check, hr_hunt_grounds_check.
--      hr_action_set_put inherits the new check unchanged.
--   §3 hr_action_set_options RESTATED: three keys that are not option rows —
--      `slots` (the bar, written to player_action_sets.slots), `stop_rules` and
--      `grounds` (written to options) — each through its own check; the rest
--      as before. `density` and `gather_share` are option ROWS (the regenerated
--      2026-10-25-action-conditions-catalogue.generated.sql), validated in their
--      generated range (density 0..16: the pack size, 0 = as built); the SETTLE clamps
--      it to the ground for the party (every ground allows at least the full box of 8)
--      (src/data/hunt-grounds.js densityFor); gather_share is stored and INERT
--      until the gathering engine lands.
--   §4 hr_action_set_copy (NEW client verb): copy every action set of one of
--      the caller's characters onto another of the caller's characters.
--   §5 hr_hunt_open_session RESTATED: entering with preset 0 takes the
--      character's preset whose `grounds` names the hunt (an action set per
--      hunting ground, chosen on entry).
--   §6 hr_hunt_settle_session RESTATED WHOLE (2026-10-23-hunt-supply-ledger.sql
--      §1) with ONE new end arm: `rule` is proven when the session's preset
--      carries at least one stop rule (the end only stops value).
--   §7 hr_hunt_settings_view RESTATED (2026-10-23-hunt-world-state.sql): the
--      stored slots as stored, each empty lane's defaults placed like the
--      engine places them (conditions.js placeDefaults), plus density,
--      gather_share (+ gather_inert), stop_rules and grounds.
-- The `rule` end reason itself (hr_hunt_end_reasons, the end_reason CHECK) is
-- END_ORDER's, in 2026-10-25-action-conditions-catalogue.generated.sql (the
-- forward catalogue, applied first); §0 requires it.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Nothing here moves gold, items or XP. A slot names catalogue rows only; a
-- condition's metric, operator, value and subject are catalogue-bounded and
-- REFUSED, never clamped. A stop rule can only END a hunt early. The copy
-- writes only the caller's own rows (auth.uid()), slot to slot, refused while
-- the target hunts with unsettled time; the per-ground preset is the caller's
-- own row. The settle reads every value it uses from these rows.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_bar_check / hr_action_set_options from
-- 2026-10-23-hunt-settings-options.sql, hr_hunt_open_session from
-- 2026-10-23-hunt-party.sql, hr_hunt_settle_session from
-- 2026-10-23-hunt-supply-ledger.sql, hr_hunt_settings_view from
-- 2026-10-23-hunt-world-state.sql; drop hr_action_set_copy (+ its baseline
-- row), the four catalogue tables and the five new checkers.
-- ORDER: after 2026-10-25-action-conditions-catalogue.generated.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_hunt_bar_check(jsonb)') is null or to_regprocedure('public.hr_hunt_open_session(uuid,integer,text,uuid,integer,integer,integer,uuid,timestamp with time zone,integer)') is null then
    raise exception 'PRECONDITION: apply 2026-10-23-hunt-settings-options.sql and 2026-10-23-hunt-party.sql first';
  end if;
  if not exists (select 1 from public.hr_hunt_end_reasons where reason = 'rule')
     or not exists (select 1 from public.hr_hunt_set_options where opt = 'density' and kind = 'limit')
     or not exists (select 1 from public.hr_hunt_set_options where opt = 'gather_share' and kind = 'limit') then
    raise exception 'PRECONDITION: apply 2026-10-25-action-conditions-catalogue.generated.sql first (end reason rule, the density and gather_share options)';
  end if;
end $mig$;

-- ── §1 THE CATALOGUES (generated rows: tests/hunt-core/conditions.mjs --print) ─
create table if not exists public.hr_hunt_condition_metrics (
  metric    text primary key check (metric ~ '^[a-z_]{1,32}$'),
  kind      text not null check (kind in ('pct', 'count', 'bool', 'effect')),
  ops       text[] not null check (cardinality(ops) between 1 and 8),
  lo        int, hi int,
  subjects  text[] not null,
  slot_only boolean not null,
  vals      text[] not null,
  check ((kind in ('pct', 'count')) = (lo is not null and hi is not null and lo <= hi))
);
create table if not exists public.hr_hunt_action_ids (
  type text not null check (type in ('consume', 'attack_with_item')),
  id   text not null check (id ~ '^[a-z0-9_]{1,64}$'),
  primary key (type, id)
);
create table if not exists public.hr_hunt_role_rules (
  role text not null check (role ~ '^[a-z_]{1,32}$'),
  ord  int  not null check (ord >= 0),
  slot jsonb not null check (jsonb_typeof(slot) = 'object'),
  primary key (role, ord)
);
create table if not exists public.hr_hunt_condition_limits (
  key   text primary key,
  value int  not null
);
do $$
declare v_t text;
begin
  foreach v_t in array array['hr_hunt_condition_metrics', 'hr_hunt_action_ids', 'hr_hunt_role_rules', 'hr_hunt_condition_limits'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
  end loop;
end $$;

delete from public.hr_hunt_condition_metrics;
insert into public.hr_hunt_condition_metrics (metric, kind, ops, lo, hi, subjects, slot_only, vals) values
-- ⟦metrics⟧
  ('self_hp_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, '{}'::text[], false, '{}'::text[]),
  ('self_mana_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, '{}'::text[], false, '{}'::text[]),
  ('ally_hp_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, array['lowest', 'tank', 'melee_dps', 'ranger', 'mage', 'healer']::text[], false, '{}'::text[]),
  ('ally_mana_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, array['lowest', 'tank', 'melee_dps', 'ranger', 'mage', 'healer']::text[], false, '{}'::text[]),
  ('enemies_in_aoe', 'count', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 25, '{}'::text[], true, '{}'::text[]),
  ('target_is_boss', 'bool', array['eq']::text[], null, null, '{}'::text[], false, '{}'::text[]),
  ('item_qty', 'count', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100000, array['item', 'food', 'drink', 'ammo']::text[], false, '{}'::text[]),
  ('effect_missing', 'effect', array['has_effect', 'lacks_effect']::text[], null, null, array['target', 'self']::text[], false, array['bleed']::text[])
-- ⟦/metrics⟧
;
delete from public.hr_hunt_action_ids;
insert into public.hr_hunt_action_ids (type, id) values
-- ⟦action-ids⟧
  ('attack_with_item', 'air_rune'),
  ('attack_with_item', 'barbed_arrows'),
  ('attack_with_item', 'blood_rune'),
  ('attack_with_item', 'bronze_arrows'),
  ('attack_with_item', 'chaos_rune'),
  ('attack_with_item', 'coarse_whetstone'),
  ('attack_with_item', 'copper_whetstone'),
  ('attack_with_item', 'dawn_whetstone'),
  ('attack_with_item', 'dawnpoint_arrows'),
  ('attack_with_item', 'death_rune'),
  ('attack_with_item', 'earth_rune'),
  ('attack_with_item', 'emberhead_arrows'),
  ('attack_with_item', 'fire_rune'),
  ('attack_with_item', 'iron_arrows'),
  ('attack_with_item', 'iron_bolts'),
  ('attack_with_item', 'iron_whetstone'),
  ('attack_with_item', 'mithril_arrows'),
  ('attack_with_item', 'mithril_whetstone'),
  ('attack_with_item', 'rune_arrows'),
  ('attack_with_item', 'rune_whetstone'),
  ('attack_with_item', 'steel_arrows'),
  ('attack_with_item', 'steel_whetstone'),
  ('attack_with_item', 'water_rune'),
  ('consume', 'baked_potato'),
  ('consume', 'carrot_juice'),
  ('consume', 'cooked_bear_meat'),
  ('consume', 'cooked_copper_crab'),
  ('consume', 'cooked_frostfin'),
  ('consume', 'cooked_goldgill'),
  ('consume', 'cooked_herring'),
  ('consume', 'cooked_lobster'),
  ('consume', 'cooked_moonfish'),
  ('consume', 'cooked_panther_meat'),
  ('consume', 'cooked_pikeperch'),
  ('consume', 'cooked_shark'),
  ('consume', 'cooked_shrimp'),
  ('consume', 'cooked_silverfin'),
  ('consume', 'cooked_swordfish'),
  ('consume', 'cooked_trout'),
  ('consume', 'cooked_wolf_meat'),
  ('consume', 'drink'),
  ('consume', 'emberfruit_cordial'),
  ('consume', 'food'),
  ('consume', 'goldenroot_tea'),
  ('consume', 'pumpkin_cider'),
  ('consume', 'river_chowder'),
  ('consume', 'tomato_juice'),
  ('consume', 'turnip_juice'),
  ('consume', 'turnip_mash'),
  ('consume', 'wheat_bread')
-- ⟦/action-ids⟧
;
delete from public.hr_hunt_role_rules;
insert into public.hr_hunt_role_rules (role, ord, slot) values
-- ⟦role-rules⟧
  ('healer', 0, '{"action":{"type":"ability","id":"greater_mend"},"conditions":[],"join":"and"}'::jsonb),
  ('healer', 1, '{"action":{"type":"ability","id":"circle_of_renewal"},"conditions":[],"join":"and"}'::jsonb),
  ('healer', 2, '{"action":{"type":"ability","id":"natures_wrath"},"conditions":[{"metric":"ally_hp_pct","op":"gte","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('mage', 0, '{"action":{"type":"ability","id":"fireball"},"conditions":[],"join":"and"}'::jsonb),
  ('mage', 1, '{"action":{"type":"ability","id":"frost_lance"},"conditions":[],"join":"and"}'::jsonb),
  ('mage', 2, '{"action":{"type":"ability","id":"arcane_barrier"},"conditions":[],"join":"and"}'::jsonb),
  ('melee_dps', 0, '{"action":{"type":"ability","id":"power_strike"},"conditions":[],"join":"and"}'::jsonb),
  ('melee_dps', 1, '{"action":{"type":"ability","id":"cleave"},"conditions":[],"join":"and"}'::jsonb),
  ('melee_dps', 2, '{"action":{"type":"ability","id":"rend"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 0, '{"action":{"type":"ability","id":"hunters_mark"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 1, '{"action":{"type":"ability","id":"flame_volley"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 2, '{"action":{"type":"ability","id":"precision_shot"},"conditions":[],"join":"and"}'::jsonb),
  ('tank', 0, '{"action":{"type":"ability","id":"challenge"},"conditions":[],"join":"and"}'::jsonb),
  ('tank', 1, '{"action":{"type":"ability","id":"flame_strike"},"conditions":[],"join":"and"}'::jsonb),
  ('tank', 2, '{"action":{"type":"ability","id":"power_strike"},"conditions":[],"join":"and"}'::jsonb)
-- ⟦/role-rules⟧
;
-- condition-metrics.js MAX_CONDITIONS / MAX_STOP_RULES / STOP_HOLD_MS (pinned by the same test).
delete from public.hr_hunt_condition_limits;
insert into public.hr_hunt_condition_limits (key, value) values
-- ⟦limits⟧
  ('max_conditions', 3),
  ('max_stop_rules', 3),
  ('stop_hold_max_ms', 600000),
  ('stop_hold_step_ms', 100)
-- ⟦/limits⟧
;

-- ── §2 THE VALIDATOR (src/core/hunt/conditions.js, mirrored) ──────────────────
-- One condition: null = accepted, else the refusal code.
create or replace function public.hr_hunt_cond_check(p_c jsonb, p_stop boolean)
returns text language plpgsql stable set search_path = public, pg_catalog as $$
declare
  m public.hr_hunt_condition_metrics%rowtype;
  v jsonb;
begin
  if p_c is null or jsonb_typeof(p_c) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_c) k where k not in ('metric', 'op', 'value', 'subject')) then
    return 'bad_condition'; end if;
  select * into m from public.hr_hunt_condition_metrics x where x.metric = p_c->>'metric';
  if not found or (p_stop and m.slot_only) then return 'bad_metric'; end if;
  if jsonb_typeof(p_c->'op') is distinct from 'string' or not ((p_c->>'op') = any (m.ops)) then return 'bad_op'; end if;
  v := p_c->'value';
  if m.kind in ('pct', 'count') then
    if jsonb_typeof(v) is distinct from 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
       or (v #>> '{}')::numeric < m.lo or (v #>> '{}')::numeric > m.hi then return 'bad_value'; end if;
  elsif m.kind = 'bool' then
    if jsonb_typeof(v) is distinct from 'boolean' then return 'bad_value'; end if;
  else
    if jsonb_typeof(v) is distinct from 'string' or not ((v #>> '{}') = any (m.vals)) then return 'bad_value'; end if;
  end if;
  if p_c ? 'subject' then
    if jsonb_typeof(p_c->'subject') is distinct from 'string' or not ((p_c->>'subject') = any (m.subjects))
       or (p_stop and p_c->>'subject' = 'item') then return 'bad_subject'; end if;
  end if;
  return null;
end $$;

-- A condition list and its join: null = accepted, else { error, condition? }.
create or replace function public.hr_hunt_conds_check(p_conds jsonb, p_join jsonb, p_stop boolean)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_e jsonb; v_i int := 0; v_why text;
  v_max int := (select value from public.hr_hunt_condition_limits where key = 'max_conditions');
begin
  if v_max is null then return jsonb_build_object('error', 'catalogue_missing'); end if;
  if p_conds is not null and jsonb_typeof(p_conds) <> 'array' then return jsonb_build_object('error', 'bad_condition'); end if;
  if p_conds is not null and jsonb_array_length(p_conds) > v_max then return jsonb_build_object('error', 'too_many_conditions', 'max', v_max); end if;
  if p_join is not null and (jsonb_typeof(p_join) <> 'string' or (p_join #>> '{}') not in ('and', 'or')) then
    return jsonb_build_object('error', 'bad_join'); end if;
  for v_e in select value from jsonb_array_elements(coalesce(p_conds, '[]'::jsonb)) loop
    v_why := public.hr_hunt_cond_check(v_e, p_stop);
    if v_why is not null then return jsonb_build_object('error', v_why, 'condition', v_i); end if;
    v_i := v_i + 1;
  end loop;
  return null;
end $$;

-- One stored slot: { ok, slot } with the slot in canonical form (null stays null), or { ok:false, error, cond? }.
create or replace function public.hr_hunt_slot_check(p_s jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_type text; v_id text; v_r jsonb;
begin
  if p_s is null or jsonb_typeof(p_s) = 'null' then return jsonb_build_object('ok', true, 'slot', 'null'::jsonb); end if;
  if jsonb_typeof(p_s) = 'string' then
    if not exists (select 1 from public.hr_hunt_abilities a where a.ability_id = p_s #>> '{}') then
      return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
    return jsonb_build_object('ok', true, 'slot', jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', p_s #>> '{}'),
      'conditions', '[]'::jsonb, 'join', 'and'));
  end if;
  if jsonb_typeof(p_s) <> 'object' or jsonb_typeof(p_s->'action') is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  if exists (select 1 from jsonb_object_keys(p_s) k where k not in ('action', 'conditions', 'join')) then
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  v_type := p_s->'action'->>'type'; v_id := p_s->'action'->>'id';
  if jsonb_typeof(p_s->'action'->'id') is distinct from 'string' or v_type is null
     or not coalesce(case v_type
          when 'ability' then exists (select 1 from public.hr_hunt_abilities a where a.ability_id = v_id)
          when 'consume' then exists (select 1 from public.hr_hunt_action_ids x where x.type = 'consume' and x.id = v_id)
          when 'attack_with_item' then exists (select 1 from public.hr_hunt_action_ids x where x.type = 'attack_with_item' and x.id = v_id)
          else false end, false) then
    return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  v_r := public.hr_hunt_conds_check(p_s->'conditions', p_s->'join', false);
  if v_r is not null then return jsonb_build_object('ok', false) || v_r; end if;
  return jsonb_build_object('ok', true, 'slot', jsonb_build_object('action', jsonb_build_object('type', v_type, 'id', v_id),
    'conditions', coalesce(p_s->'conditions', '[]'::jsonb), 'join', coalesce(p_s->>'join', 'and')));
end $$;

-- THE BAR CHECK, RESTATED: {ok:true, slots} (canonical, empty tablets kept as null), or
-- {ok:false, error, slot | rule, condition?}. Read by hr_action_set_put and hr_action_set_options.
create or replace function public.hr_hunt_bar_check(p_slots jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_max int := public.hr_hunt_limit('slots');
  v_out jsonb := '[]'::jsonb; v_e jsonb; v_i int := 0; v_r jsonb;
begin
  if v_max is null then return jsonb_build_object('ok', false, 'error', 'bad_slots', 'why', 'catalogue_missing'); end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_slots', 'why', 'not_an_array'); end if;
  if jsonb_array_length(p_slots) > v_max then
    return jsonb_build_object('ok', false, 'error', 'too_many_slots', 'max', v_max); end if;
  for v_e in select value from jsonb_array_elements(p_slots) loop
    v_r := public.hr_hunt_slot_check(v_e);
    if not (v_r->>'ok')::boolean then return v_r || jsonb_build_object('slot', v_i); end if;
    v_out := v_out || jsonb_build_array(v_r->'slot');
    v_i := v_i + 1;
  end loop;
  return jsonb_build_object('ok', true, 'slots', v_out);
end $$;

-- STOP RULES: {ok:true, rules} canonical ({ conditions, join, forMs }), or {ok:false, error, slot | rule, condition?}.
create or replace function public.hr_hunt_stop_rules_check(p_rules jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_max  int := (select value from public.hr_hunt_condition_limits where key = 'max_stop_rules');
  v_hmax int := (select value from public.hr_hunt_condition_limits where key = 'stop_hold_max_ms');
  v_step int := (select value from public.hr_hunt_condition_limits where key = 'stop_hold_step_ms');
  v_out jsonb := '[]'::jsonb; v_e jsonb; v_i int := 0; v_r jsonb; v_f numeric;
begin
  if v_max is null or v_hmax is null or v_step is null then return jsonb_build_object('ok', false, 'error', 'catalogue_missing'); end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then return jsonb_build_object('ok', false, 'error', 'bad_stop_rules'); end if;
  if jsonb_array_length(p_rules) > v_max then return jsonb_build_object('ok', false, 'error', 'too_many_stop_rules', 'max', v_max); end if;
  for v_e in select value from jsonb_array_elements(p_rules) loop
    if jsonb_typeof(v_e) <> 'object' or exists (select 1 from jsonb_object_keys(v_e) k where k not in ('conditions', 'join', 'forMs'))
       or jsonb_typeof(v_e->'conditions') is distinct from 'array' or jsonb_array_length(v_e->'conditions') = 0 then
      return jsonb_build_object('ok', false, 'error', 'bad_stop_rule', 'rule', v_i); end if;
    v_f := case when v_e ? 'forMs' and jsonb_typeof(v_e->'forMs') = 'number' then (v_e->>'forMs')::numeric
                when v_e ? 'forMs' then -1 else 0 end;
    if v_f < 0 or v_f > v_hmax or v_f <> trunc(v_f) or mod(v_f, v_step) <> 0 then
      return jsonb_build_object('ok', false, 'error', 'bad_hold', 'rule', v_i); end if;
    v_r := public.hr_hunt_conds_check(v_e->'conditions', v_e->'join', true);
    if v_r is not null then return jsonb_build_object('ok', false, 'rule', v_i) || v_r; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('conditions', v_e->'conditions',
      'join', coalesce(v_e->>'join', 'and'), 'forMs', v_f::bigint));
    v_i := v_i + 1;
  end loop;
  return jsonb_build_object('ok', true, 'rules', v_out);
end $$;

-- GROUNDS: the hunts an action set is for (distinct hr_hunts ids), or a refusal.
create or replace function public.hr_hunt_grounds_check(p_g jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare v_out jsonb := '[]'::jsonb; v_e jsonb;
begin
  if p_g is null or jsonb_typeof(p_g) <> 'array' or jsonb_array_length(p_g) > 32 then
    return jsonb_build_object('ok', false, 'error', 'bad_grounds'); end if;
  for v_e in select value from jsonb_array_elements(p_g) loop
    if jsonb_typeof(v_e) <> 'string' or not exists (select 1 from public.hr_hunts h where h.hunt_id = v_e #>> '{}') then
      return jsonb_build_object('ok', false, 'error', 'bad_grounds', 'hunt', left(coalesce(v_e #>> '{}', ''), 64)); end if;
    if not v_out @> jsonb_build_array(v_e) then v_out := v_out || jsonb_build_array(v_e); end if;
  end loop;
  return jsonb_build_object('ok', true, 'grounds', v_out);
end $$;
revoke execute on function public.hr_hunt_cond_check(jsonb, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.hr_hunt_conds_check(jsonb, jsonb, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.hr_hunt_slot_check(jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.hr_hunt_bar_check(jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.hr_hunt_stop_rules_check(jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.hr_hunt_grounds_check(jsonb) from public, anon, authenticated, service_role;

-- ── §3 hr_action_set_options, RESTATED ───────────────────────────────────────
create or replace function public.hr_action_set_options(p_slot int, p_preset int, p_opts jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'action_set_options';
  c_slack_ms constant bigint := 20000;
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_k    text;
  v_v    jsonb;
  v_o    public.hr_hunt_set_options%rowtype;
  v_set  jsonb := '{}'::jsonb;
  v_del  text[] := '{}';
  v_bar  jsonb := null;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  if p_opts is null or jsonb_typeof(p_opts) <> 'object' or p_opts = '{}'::jsonb then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_options')); end if;
  for v_k in select jsonb_object_keys(p_opts) loop
    v_v := p_opts->v_k;
    -- THE THREE KEYS THAT ARE NOT OPTION ROWS, each through its own check.
    if v_k = 'slots' then
      v_r := public.hr_hunt_bar_check(case when jsonb_typeof(v_v) = 'null' then '[]'::jsonb else v_v end);
      if not (v_r->>'ok')::boolean then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
      v_bar := v_r->'slots';
      continue;
    elsif v_k = 'stop_rules' or v_k = 'grounds' then
      if jsonb_typeof(v_v) = 'null' then v_del := v_del || v_k; continue; end if;
      v_r := case v_k when 'stop_rules' then public.hr_hunt_stop_rules_check(v_v) else public.hr_hunt_grounds_check(v_v) end;
      if not (v_r->>'ok')::boolean then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
      v_set := v_set || jsonb_build_object(v_k, case v_k when 'stop_rules' then v_r->'rules' else v_r->'grounds' end);
      continue;
    end if;
    select * into v_o from public.hr_hunt_set_options o where o.opt = v_k;
    if not found then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_option',
        'option', left(v_k, 64))); end if;
    if jsonb_typeof(v_v) = 'null' then v_del := v_del || v_k; continue; end if;
    if v_o.kind = 'target' then
      if jsonb_typeof(v_v) <> 'string' or not exists (select 1 from public.hr_hunt_target_modes m where m.mode = v_v #>> '{}') then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_target_mode')); end if;
    elsif v_o.kind = 'limit' then
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}')::numeric <> trunc((v_v #>> '{}')::numeric)
         or (v_v #>> '{}')::numeric < public.hr_hunt_limit(v_o.limit_key || '_min')
         or (v_v #>> '{}')::numeric > public.hr_hunt_limit(v_o.limit_key || '_max') then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k,
          'min', public.hr_hunt_limit(v_o.limit_key || '_min'), 'max', public.hr_hunt_limit(v_o.limit_key || '_max'))); end if;
      v_v := to_jsonb((v_v #>> '{}')::numeric::bigint);
    elsif v_o.kind = 'bool' then
      if jsonb_typeof(v_v) <> 'boolean' then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k)); end if;
    else
      if jsonb_typeof(v_v) <> 'string' or not ((v_v #>> '{}') = any (v_o.vals)) then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k,
          'allowed', to_jsonb(v_o.vals))); end if;
    end if;
    v_set := v_set || jsonb_build_object(v_k, v_v);
  end loop;
  if octet_length(v_set::text) > 2048 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_options', 'why', 'too_large')); end if;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null and v_s.preset = p_preset and public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
    values (v_uid, p_slot, p_preset, 'Preset ' || (p_preset + 1), coalesce(v_bar, '[]'::jsonb), (v_set - v_del), now())
    on conflict (user_id, slot, preset) do update
      set options = (a.options - v_del) || v_set, slots = coalesce(v_bar, a.slots), updated_at = now();
  select jsonb_build_object('ok', true, 'preset', p_preset, 'options', a.options, 'slots', a.slots) into v_r
    from public.player_action_sets a where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_action_set_options(int, int, jsonb, uuid) from public;
revoke execute on function public.hr_action_set_options(int, int, jsonb, uuid) from anon, service_role;
grant  execute on function public.hr_action_set_options(int, int, jsonb, uuid) to authenticated;
update public.hr_client_rpc_baseline
   set note = 'restated 2026-10-25 (lane action-engine): the hero''s settings as ONE options jsonb (option rows, refused not clamped; null removes a key) plus three checked keys: slots (the conditional bar, to player_action_sets.slots), stop_rules, grounds'
 where proname = 'hr_action_set_options' and grantee = 'authenticated';
update public.hr_client_rpc_baseline
   set note = 'restated 2026-10-25 (lane action-engine) through hr_hunt_bar_check: the bar is up to `slots` slot objects { action, conditions, join } (an ability id as shorthand, null = an empty tablet), every value a catalogue row'
 where proname = 'hr_action_set_put' and grantee = 'authenticated';

-- ── §4 COPY SETTINGS TO ANOTHER CHARACTER ────────────────────────────────────
-- Every action set of the caller's character `p_from` replaces those of the
-- caller's character `p_to` (name, bar, options). Both are the caller's own
-- (auth.uid()); refused while `p_to` hunts with unsettled time.
create or replace function public.hr_action_set_copy(p_from int, p_to int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'action_set_copy';
  c_slack_ms constant bigint := 20000;
  v_uid uuid := auth.uid();
  v_r   jsonb;
  v_s   public.hunt_sessions%rowtype;
  v_n   int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_to is null or p_to < 0 or p_to > 5 then
    return public.hr_note_rejection(c_verb, p_to, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_from is null or p_from < 0 or p_from > 5 or p_from = p_to then
    return public.hr_note_rejection(c_verb, p_to, jsonb_build_object('ok', false, 'error', 'bad_from')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_to, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_to, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_to, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_to);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_to)
     or not exists (select 1 from public.player_state where user_id = v_uid and slot = p_from) then
    return public.hr_note_rejection(c_verb, p_to, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null and public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_to, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  delete from public.player_action_sets where user_id = v_uid and slot = p_to;
  insert into public.player_action_sets (user_id, slot, preset, name, slots, options, updated_at)
    select v_uid, p_to, a.preset, a.name, a.slots, a.options, now()
      from public.player_action_sets a where a.user_id = v_uid and a.slot = p_from;
  get diagnostics v_n = row_count;
  v_r := jsonb_build_object('ok', true, 'from', p_from, 'to', p_to, 'presets', v_n);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_to, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_action_set_copy(int, int, uuid) from public;
revoke execute on function public.hr_action_set_copy(int, int, uuid) from anon, service_role;
grant  execute on function public.hr_action_set_copy(int, int, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_action_set_copy';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_action_set_copy', 'p_from integer, p_to integer, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane action-engine): copy every action set of one of the caller''s characters onto another of the caller''s; moves no value');

-- ── §5 ENTERING: AN ACTION SET PER HUNTING GROUND ─────────────────────────────
-- 2026-10-23-hunt-party.sql's session inserter, restated: preset 0 (the
-- default) becomes the character's lowest preset whose `grounds` names this
-- hunt, if any. An explicit preset is kept as asked.
create or replace function public.hr_hunt_open_session(p_user uuid, p_slot int, p_hunt text, p_prev uuid,
  p_preset int, p_falls int, p_hours int, p_instance uuid, p_from timestamptz, p_seat int)
returns uuid language plpgsql set search_path = public, pg_catalog as $$
declare
  v_id   uuid := gen_random_uuid();
  v_keep int := coalesce(public.hr_hunt_limit('sessions_kept'), 20);
  v_preset int := p_preset;
begin
  if coalesce(p_preset, 0) = 0 then
    v_preset := coalesce((select a.preset from public.player_action_sets a
                           where a.user_id = p_user and a.slot = p_slot and jsonb_typeof(a.options->'grounds') = 'array'
                             and a.options->'grounds' @> jsonb_build_array(p_hunt)
                           order by a.preset limit 1), 0);
  end if;
  -- RETENTION: the character keeps its last `sessions_kept` hunts, this one included.
  delete from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is not null
     and h.id not in (select x.id from public.hunt_sessions x
                       where x.user_id = p_user and x.slot = p_slot and x.ended_at is not null
                       order by x.entered_at desc, x.id limit greatest(0, v_keep - 1));
  insert into public.hunt_sessions (id, user_id, slot, hunt_id, prev_session_id, preset, falls_limit, hours_limit,
                                    entered_at, hunt_from, settled_to, next_swing_at, instance_id, seat)
  values (v_id, p_user, p_slot, p_hunt, p_prev, v_preset, p_falls, p_hours, now(), p_from, p_from, p_from, p_instance, p_seat);
  insert into public.hunt_session_tally (session_id, user_id, slot) values (v_id, p_user, p_slot);
  insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
  values (v_id, p_user, p_slot, 'entered', now(), jsonb_build_object('hunt', p_hunt, 'preset', v_preset));
  return v_id;
end $$;
revoke execute on function public.hr_hunt_open_session(uuid, int, text, uuid, int, int, int, uuid, timestamptz, int) from public, anon, authenticated, service_role;

-- ── §6 hr_hunt_settle_session, RESTATED WHOLE (+ the `rule` end arm) ──────────
create or replace function public.hr_hunt_settle_session(p_user uuid, p_slot int, p_session uuid, p_delta jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_skew       constant interval := interval '60 seconds';
  c_max_window constant bigint   := 24 * 3600000;   -- the outage fuse, never a gameplay cap
  c_min_swing_ms constant bigint := 500;            -- fuse on the swing count, not a balance figure
  c_keys constant text[] := array['swing_from', 'swing_to', 'to', 'next_swing_at', 'uses', 'falls', 'down',
                                  'down_ms', 'paid_ms', 'raw_xp', 'hints', 'ended'];
  v_s      public.hunt_sessions%rowtype;
  v_to     timestamptz; v_next timestamptz;
  v_win    bigint;
  v_from_i bigint; v_to_i bigint;
  v_k text; v_v jsonb; v_kind text; v_left bigint; v_n bigint;
  v_deaths int; v_falls int;
  v_end text; v_end_at timestamptz;
  v_hwm bigint; v_new_hwm bigint;
  v_coins bigint; v_kills bigint;
  v_xp jsonb; v_loot jsonb; v_sup jsonb;
  v_ev int := 0; v_r record; v_hint jsonb; v_at timestamptz; v_i int;
  v_next_id uuid;
  v_raw jsonb;
  v_used   jsonb := '{}'::jsonb;
  v_used_n bigint := 0;
  v_supply jsonb;
  v_store  boolean;
  v_tier   int;
  -- THE FOLD'S TIME BOUND: every row this folds was stamped in the transaction
  -- of a settle, and a window is at most c_max_window.
  v_fold_from timestamptz := now() - interval '25 hours';
begin
  -- ── VALIDATE (no writes) ───────────────────────────────────────────────
  if p_user is null or p_slot is null or p_session is null or p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  if exists (select 1 from jsonb_object_keys(p_delta) k where k <> all (c_keys)) then
    perform public.hr_reject('unknown_delta_key'); end if;
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session then perform public.hr_reject('no_hunt'); end if;

  if jsonb_typeof(p_delta->'swing_from') is distinct from 'number' or jsonb_typeof(p_delta->'swing_to') is distinct from 'number'
     or (p_delta->>'swing_from') !~ '^[0-9]{1,15}$' or (p_delta->>'swing_to') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  v_from_i := (p_delta->>'swing_from')::bigint; v_to_i := (p_delta->>'swing_to')::bigint;
  if v_from_i <> v_s.swing_index then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  begin
    v_to := (p_delta->>'to')::timestamptz;
    v_next := (p_delta->>'next_swing_at')::timestamptz;
  exception when others then
    perform public.hr_reject('bad_window');
  end;
  if v_to is null or v_next is null or v_to <= v_s.settled_to then
    perform public.hr_reject('bad_window', jsonb_build_object('settled_to', v_s.settled_to)); end if;
  if v_to > now() + c_skew then perform public.hr_reject('window_in_future'); end if;
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  if v_win > c_max_window then perform public.hr_reject('window_too_long'); end if;
  if v_next < v_to or v_next > v_to + c_skew then perform public.hr_reject('bad_next_swing'); end if;
  if v_to_i < v_from_i or v_to_i - v_from_i > v_win / c_min_swing_ms + 1 then
    perform public.hr_reject('bad_swing'); end if;

  -- OWN USES: packed bag lines only, of a kind a hunt spends, never more than is left.
  if p_delta ? 'uses' then
    if jsonb_typeof(p_delta->'uses') <> 'object' or (select count(*) from jsonb_object_keys(p_delta->'uses')) > 10 then
      perform public.hr_reject('bad_uses'); end if;
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') loop
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,9}$' then
        perform public.hr_reject('bad_uses', jsonb_build_object('item', left(v_k, 64))); end if;
      v_n := (v_v #>> '{}')::bigint;
      select b.qty_left, p.kind into v_left, v_kind
        from public.hunt_bag b left join public.hr_hunt_supplies p on p.item_id = b.item_id
       where b.session_id = p_session and b.item_id = v_k;
      if v_left is null then perform public.hr_reject('not_in_bag', jsonb_build_object('item', left(v_k, 64))); end if;
      if v_n > v_left then perform public.hr_reject('bag_short', jsonb_build_object('item', v_k, 'left', v_left)); end if;
      if v_n > 0 and v_kind is distinct from 'heal' and v_kind is distinct from 'ammo' then
        perform public.hr_reject('kind_not_used', jsonb_build_object('item', v_k, 'kind', v_kind)); end if;
      v_left := null; v_kind := null;
    end loop;
  end if;

  -- FALLS equal the death rows hr_apply stamped with this session since the last fold.
  select t.ledger_hwm into v_hwm from public.hunt_session_tally t where t.session_id = p_session;
  v_hwm := coalesce(v_hwm, 0);
  select count(*) into v_deaths from public.player_ledger l
   where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death';
  v_falls := v_s.falls + v_deaths;
  if (p_delta ? 'falls') and (jsonb_typeof(p_delta->'falls') <> 'number' or (p_delta->>'falls')::numeric <> v_falls) then
    perform public.hr_reject('falls_mismatch', jsonb_build_object('journalled', v_falls)); end if;
  if (p_delta ? 'down' and jsonb_typeof(p_delta->'down') <> 'boolean')
     or (p_delta ? 'down_ms' and (jsonb_typeof(p_delta->'down_ms') <> 'number' or (p_delta->>'down_ms')::numeric < 0
                                  or (p_delta->>'down_ms')::numeric > v_win))
     or (p_delta ? 'paid_ms' and (jsonb_typeof(p_delta->'paid_ms') <> 'number' or (p_delta->>'paid_ms')::numeric < 0
                                  or (p_delta->>'paid_ms')::numeric > v_win)) then
    perform public.hr_reject('bad_counts'); end if;
  v_raw := coalesce(p_delta->'raw_xp', '{}'::jsonb);
  if jsonb_typeof(v_raw) <> 'object' or (select count(*) from jsonb_object_keys(v_raw)) > 24
     or exists (select 1 from jsonb_each(v_raw) x where x.key !~ '^[a-zA-Z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number'
                   or (x.value #>> '{}')::numeric < 0 or (x.value #>> '{}')::numeric > 1e12) then
    perform public.hr_reject('bad_counts'); end if;

  -- THE END, re-proved from server state as it will stand after the uses.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_store := v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch';
  select t.tier into v_tier from public.hr_hunt_travel t where t.hunt_id = v_s.hunt_id;
  if p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') = 'object' then
    v_end := p_delta->'ended'->>'reason';
    begin v_end_at := (p_delta->'ended'->>'at')::timestamptz;
    exception when others then perform public.hr_reject('bad_end'); end;
    if v_end is null or not exists (select 1 from public.hr_hunt_end_reasons where reason = v_end)
       or v_end_at is null or v_end_at < v_s.settled_to or v_end_at > v_to then
      perform public.hr_reject('bad_end'); end if;
    if not coalesce(case v_end
      when 'falls' then v_falls >= v_s.falls_limit
      -- heals_out / ammo_out: every essential line of the kind empty after the
      -- uses, and the store closed to it (the hero's explicit `end`) or holding
      -- no row it could buy instead.
      when 'heals_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                         where b.session_id = p_session and p.kind = 'heal' and b.essential
                                           and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                        and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                     where b.session_id = p_session and p.kind = 'heal' and b.essential)
                        and not (v_store and exists (select 1 from public.hr_hunt_basic_supplies q
                                                      where q.kind = 'heal' and v_tier = any (q.tiers)))
      when 'ammo_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                        where b.session_id = p_session and p.kind = 'ammo' and b.essential
                                          and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                       and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                    where b.session_id = p_session and p.kind = 'ammo' and b.essential)
                       and not (v_store and exists (select 1 from public.hunt_bag b join public.hr_hunt_basic_supplies q
                                                     on q.kind = 'ammo' and q.partner = b.item_id
                                                    where b.session_id = p_session and b.essential))
      -- GOLD_OUT: the store was open to the hero, and the gold left over its floor
      -- (after this window's coins, cover and buys, written before this call) is
      -- below the dearest store row it could need.
      when 'gold_out' then v_store
                       and coalesce((select ps.gold from public.player_state ps
                                      where ps.user_id = p_user and ps.slot = p_slot), 0)
                           - (v_supply->>'gold_floor')::bigint
                         < coalesce((select max(q.price) from public.hr_hunt_basic_supplies q
                                      where ((q.kind in ('heal', 'mana')) and v_tier = any (q.tiers))
                                         or (q.kind = 'ammo' and (q.partner in (select b.item_id from public.hunt_bag b where b.session_id = p_session)
                                                                  or q.partner = (select pe.item_id from public.player_equipment pe
                                                                                   where pe.user_id = p_user and pe.slot = p_slot
                                                                                     and pe.equip_slot = 'ammo')))), 0)
      -- STAMINA: hr_hunt_apply_member wrote this window's end value at `to` before this call.
      when 'stamina' then coalesce((select ps.stamina_ms from public.player_state ps
                                     where ps.user_id = p_user and ps.slot = p_slot), 1) <= 0
      when 'hours' then v_s.hours_limit is not null and v_end_at >= v_s.hunt_from + make_interval(hours => v_s.hours_limit)
      when 'left' then v_s.leave_at is not null and v_end_at >= v_s.leave_at
      when 'changed' then v_s.change_at is not null and v_end_at >= v_s.change_at
      when 'server' then not coalesce((select enabled from public.hr_hunt_config where id), false)
      -- RULE (lane action-engine): one of the hero's own stop rules held (src/core/hunt/conditions.js);
      -- provable only as "the preset carries a stop rule": the end can only stop value, never mint it.
      when 'rule' then exists (select 1 from public.player_action_sets a where a.user_id = p_user and a.slot = p_slot
                                 and a.preset = v_s.preset and jsonb_typeof(a.options->'stop_rules') = 'array'
                                 and jsonb_array_length(a.options->'stop_rules') > 0)
      else false end, false) then
      perform public.hr_reject('end_not_proven', jsonb_build_object('reason', v_end));
    end if;
  elsif p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') <> 'null' then
    perform public.hr_reject('bad_end');
  else
    -- AN END THE ENGINE OWED: the falls limit reached, a leave/change/hours
    -- instant more than one skew behind the window end.
    if v_falls >= v_s.falls_limit
       or (v_s.leave_at is not null and v_to > v_s.leave_at + c_skew)
       or (v_s.change_at is not null and v_to > v_s.change_at + c_skew)
       or (v_s.hours_limit is not null and v_to > v_s.hunt_from + make_interval(hours => v_s.hours_limit) + c_skew) then
      perform public.hr_reject('end_missing'); end if;
  end if;
  v_hint := coalesce(p_delta->'hints', '{}'::jsonb);
  if jsonb_typeof(v_hint) <> 'object' then perform public.hr_reject('bad_hints'); end if;

  -- ── APPLY ──────────────────────────────────────────────────────────────
  -- (1) OWN USES: the bag, and ONE `supply_own` row per settle carrying every
  --     unit used in meta.items (qty = the units destroyed, negative, gold 0).
  if p_delta ? 'uses' then
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      update public.hunt_bag set qty_left = qty_left - v_n where session_id = p_session and item_id = v_k
        returning qty_left into v_left;
      v_used := v_used || jsonb_build_object(v_k, v_n);
      v_used_n := v_used_n + v_n;
      if v_left = 0 then
        v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'slot_dry'->v_k), v_to), v_s.settled_to), v_to);
        insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
          values (p_session, p_user, p_slot, 'slot_dry', v_at, jsonb_build_object('item', v_k));
        v_ev := v_ev + 1;
      end if;
    end loop;
    if v_used_n > 0 then
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
        values (p_user, p_slot, 'hunt', 'supply_own', 0, -v_used_n,
                jsonb_build_object('side', 'bag', 'source', 'own', 'items', v_used), p_session);
    end if;
  end if;

  -- (2) THE FOLD: every row stamped with this session since the high-water mark.
  select coalesce(sum(case when l.kind <> 'hunt' then coalesce(l.gold, 0) else 0 end), 0),
         coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then greatest(0, (l.meta->>'kills')::numeric) else 0 end), 0)::bigint,
         max(l.id)
    into v_coins, v_kills, v_new_hwm
    from public.player_ledger l where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_xp from (
    select x.key as k, sum(x.value::numeric) as v
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'x') = 'object'
                                                         then l.meta->'delta'->'x' else '{}'::jsonb end) x
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
     group by x.key) a;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_loot from (
    select k, sum(v) as v from (
      select i.key as k, i.value::numeric as v
        from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'i') = 'object'
                                                           then l.meta->'delta'->'i' else '{}'::jsonb end) i
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
      union all
      select '*', (l.meta->'delta'->>'i_sum')::numeric
        from public.player_ledger l
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
         and jsonb_typeof(l.meta->'delta'->'i_sum') = 'number') u
    group by k) a;
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_sup from (
    select i.key as k, sum(i.value::numeric) as n
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'items') = 'object'
                                                         then l.meta->'items' else '{}'::jsonb end) i
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'hunt' and l.intent = 'supply_own'
     group by i.key) a;
  update public.hunt_session_tally t
     set coins = t.coins + v_coins, kills = t.kills + v_kills, deaths = t.deaths + v_deaths,
         xp = public.hr_jsonb_add(t.xp, v_xp), loot = public.hr_jsonb_add(t.loot, v_loot),
         supplies = public.hr_jsonb_add(t.supplies, v_sup), raw_xp = public.hr_jsonb_add(t.raw_xp, v_raw),
         down_ms = t.down_ms + coalesce((p_delta->>'down_ms')::numeric, 0)::bigint,
         paid_ms = t.paid_ms + coalesce((p_delta->>'paid_ms')::numeric, 0)::bigint,
         ledger_hwm = greatest(t.ledger_hwm, coalesce(v_new_hwm, 0)), updated_at = now()
   where t.session_id = p_session;

  -- (3) DERIVED EVENTS. Falls from the death rows; level-ups from the xp the
  --     fold credited; rare drops only for items this fold looted.
  v_i := 0;
  for v_r in select l.at, l.meta->>'monster' as monster from public.player_ledger l
              where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death' order by l.id loop
    v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'fall'->v_i), v_r.at), v_s.settled_to), v_to);
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'fall', v_at, jsonb_build_object('monster', left(coalesce(v_r.monster, ''), 64)));
    v_i := v_i + 1; v_ev := v_ev + 1;
  end loop;
  for v_r in select x.key as skill, public.hr_level_from_xp(ps.xp) as lv_now,
                    public.hr_level_from_xp(greatest(0, ps.xp - floor(x.value::numeric)::bigint)) as lv_then
               from jsonb_each_text(v_xp) x
               join public.player_skills ps on ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = x.key
              where x.value::numeric > 0 loop
    if v_r.lv_now > v_r.lv_then then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'level_up', v_to, jsonb_build_object('skill', left(v_r.skill, 64), 'level', v_r.lv_now));
      v_ev := v_ev + 1;
    end if;
  end loop;
  if jsonb_typeof(v_hint->'rare_drop') = 'array' then
    for v_r in select distinct on (e.value->>'item') e.value->>'item' as item, e.value->'at' as at_ms
                 from jsonb_array_elements(v_hint->'rare_drop') with ordinality e(value, o)
                where jsonb_typeof(e.value) = 'object' and coalesce((v_loot->>(e.value->>'item'))::numeric, 0) > 0
                order by e.value->>'item', e.o limit 10 loop
      v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_r.at_ms), v_to), v_s.settled_to), v_to);
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'rare_drop', v_at, jsonb_build_object('item', left(v_r.item, 64)));
      v_ev := v_ev + 1;
    end loop;
  end if;

  -- (4) THE SESSION CLOCK.
  update public.hunt_sessions
     set swing_index = v_to_i, settled_to = v_to, next_swing_at = v_next,
         falls = v_falls, down = coalesce((p_delta->>'down')::boolean, down), version = version + 1
   where id = p_session;

  -- (5) THE END.
  if v_end = 'changed' then
    v_next_id := public.hr_hunt_swap(p_session, v_end_at);
  elsif v_end is not null then
    perform public.hr_hunt_close(p_session, v_end, v_end_at, true);
  end if;

  return jsonb_build_object('ok', true, 'session', p_session, 'swing_index', v_to_i, 'settled_to', v_to,
                            'ended', v_end, 'next_session', v_next_id, 'events', v_ev,
                            'version', (select version from public.hunt_sessions where id = p_session));
end $$;
revoke execute on function public.hr_hunt_settle_session(uuid, int, uuid, jsonb) from public;
revoke execute on function public.hr_hunt_settle_session(uuid, int, uuid, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §7 THE `hunt_settings` SECTION, RESTATED ─────────────────────────────────
-- The running preset's EFFECTIVE settings (the stored option, else the hero's
-- unit while hunting, else the option's default) and its BAR: the stored slots
-- as stored (null = an empty tablet), then each lane the bar leaves empty takes
-- its defaults where the engine places them (conditions.js placeDefaults: the
-- first empty tablet, else the end): the role's hr_hunt_role_rules, then drink
-- at drink_pct and eat at food_pct. Each slot carries its display fields (mana,
-- usable, count). Plus density, gather_share (gather_inert: true until the
-- gathering engine lands), stop_rules and grounds.
create or replace function public.hr_hunt_settings_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  s       public.hunt_sessions%rowtype;
  a       public.player_action_sets%rowtype;
  i       public.hunt_instances%rowtype;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_preset int;
  v_opt   jsonb;
  v_wj    jsonb;
  v_uf    jsonb;
  v_me    jsonb;
  v_unit  jsonb := '{}'::jsonb;
  v_role  text;
  v_disc  text;
  v_list  jsonb := '[]'::jsonb;
  v_def   jsonb;
  v_d     jsonb;
  v_pos   int;
  v_slots jsonb := '[]'::jsonb;
  v_e     jsonb;
  v_presets jsonb;
  v_eff   jsonb := '{}'::jsonb;
  v_o     record;
  v_val   jsonb;
  v_ab    public.hr_hunt_abilities%rowtype;
begin
  select * into s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
   order by h.entered_at desc limit 1;
  v_preset := coalesce(s.preset, 0);
  select * into a from public.player_action_sets x where x.user_id = p_user and x.slot = p_slot and x.preset = v_preset;
  v_opt := coalesce(a.options, '{}'::jsonb);
  -- The hunting hero's unit: its role and the settings the engine runs it on.
  if s.id is not null and s.unit_id is not null then
    select * into i from public.hunt_instances where id = s.instance_id;
    select * into v_shape from public.hr_hunt_world_shape where id;
    begin
      v_wj := i.world::jsonb;
    exception when others then
      v_wj := null;
    end;
    if v_wj is not null and jsonb_typeof(v_wj) = 'object' and v_shape.id and jsonb_typeof(v_wj->'u') = 'array'
       and (v_wj->>'v') = v_shape.version::text and (v_wj->>'s') = v_shape.shape::text then
      v_uf := v_shape.fields->'unit';
      select e into v_me from jsonb_array_elements(v_wj->'u') e
       where e->>((v_uf->>'side')::int) = 'hero' and (e->>((v_uf->>'id')::int))::int = s.unit_id limit 1;
      if v_me is not null then
        v_role := v_me->>((v_uf->>'role')::int);
        v_unit := jsonb_build_object('distance', v_me->((v_uf->>'dist')::int), 'chase', v_me->((v_uf->>'chase')::int),
                                     'target_mode', v_me->((v_uf->>'tmode')::int), 'stance', v_me->((v_uf->>'stance')::int));
      end if;
    end if;
  end if;
  -- Not hunting: the role the worn weapon gives (a staff's pick kept when it allows it).
  if v_role is null or v_role = '' then
    select case when v_opt->>'role' = any (w.roles) then v_opt->>'role' else w.roles[1] end into v_role
      from public.hr_hunt_weapon_roles w where w.weapon_type = public.hr_hunt_weapon_of(p_user, p_slot);
  end if;
  for v_o in select o.opt, o.dflt from public.hr_hunt_set_options o order by o.opt loop
    v_val := coalesce(v_opt->v_o.opt, v_unit->v_o.opt, v_o.dflt);
    v_eff := v_eff || jsonb_build_object(v_o.opt, v_val);
  end loop;
  select r.discipline into v_disc from public.hr_hunt_roles r where r.role = v_role;
  -- THE BAR: the stored slots (an invalid row reads as an empty tablet), then the defaults.
  for v_e in select value from jsonb_array_elements(case when jsonb_typeof(a.slots) = 'array' then a.slots else '[]'::jsonb end) loop
    v_d := public.hr_hunt_slot_check(v_e);
    v_list := v_list || jsonb_build_array(case when (v_d->>'ok')::boolean then v_d->'slot' else 'null'::jsonb end);
  end loop;
  v_def := '[]'::jsonb;
  if not exists (select 1 from jsonb_array_elements(v_list) e join public.hr_hunt_abilities ab on ab.ability_id = e->'action'->>'id'
                  where e->'action'->>'type' = 'ability' and v_disc = any (ab.disciplines)) then
    select coalesce(jsonb_agg(r.slot order by r.ord), '[]'::jsonb) into v_def from public.hr_hunt_role_rules r where r.role = v_role;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_list) e where e->'action'->>'type' = 'consume') then
    v_def := v_def || jsonb_build_array(
      jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', 'drink'), 'join', 'and',
        'conditions', jsonb_build_array(jsonb_build_object('metric', 'self_mana_pct', 'op', 'lt', 'value', v_eff->'drink_below_pct'))),
      jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', 'food'), 'join', 'and',
        'conditions', jsonb_build_array(jsonb_build_object('metric', 'self_hp_pct', 'op', 'lt', 'value', v_eff->'food_below_pct'))));
  end if;
  for v_d in select value from jsonb_array_elements(v_def) loop
    select min(n - 1) into v_pos from jsonb_array_elements(v_list) with ordinality x(e, n) where jsonb_typeof(x.e) = 'null';
    if v_pos is null then v_list := v_list || jsonb_build_array(v_d);
    else v_list := jsonb_set(v_list, array[v_pos::text], v_d); end if;
  end loop;
  -- The display fields: an ability's mana and whether it can fire (active, of the discipline,
  -- its rune held); an item's count in the inventory.
  for v_e in select value from jsonb_array_elements(v_list) loop
    if jsonb_typeof(v_e) = 'null' then v_slots := v_slots || jsonb_build_array(v_e); continue; end if;
    if v_e->'action'->>'type' = 'ability' then
      select * into v_ab from public.hr_hunt_abilities ab where ab.ability_id = v_e->'action'->>'id';
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('mana', v_ab.mana,
        'usable', coalesce(v_ab.active, false) and v_disc = any (v_ab.disciplines) and (v_ab.rune is null or exists (
          select 1 from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_ab.rune and pi.qty > 0))));
    else
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('usable', true,
        'count', (select coalesce(sum(pi.qty), 0) from public.player_inventory pi
                   where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_e->'action'->>'id')));
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('preset', x.preset, 'name', x.name, 'grounds', coalesce(x.options->'grounds', '[]'::jsonb))
           order by x.preset), '[]'::jsonb) into v_presets
    from public.player_action_sets x where x.user_id = p_user and x.slot = p_slot;
  if not exists (select 1 from jsonb_array_elements(v_presets) e where (e->>'preset')::int = v_preset) then
    v_presets := v_presets || jsonb_build_array(jsonb_build_object('preset', v_preset, 'name', 'Preset ' || (v_preset + 1), 'grounds', '[]'::jsonb));
  end if;
  return jsonb_build_object(
    'preset', v_preset, 'presets', v_presets, 'role', v_role,
    'target_mode', v_eff->'target_mode', 'stance', v_eff->'stance', 'distance', v_eff->'distance', 'chase', v_eff->'chase',
    'food_pct', v_eff->'food_below_pct', 'drink_pct', v_eff->'drink_below_pct',
    'supply_source', v_eff->'supply_source', 'on_empty', v_eff->'on_empty', 'action_set', v_eff->'action_set',
    'gold_floor', v_eff->'gold_floor',
    'density', v_eff->'density', 'gather_share', v_eff->'gather_share', 'gather_inert', true,
    'stop_rules', coalesce(v_opt->'stop_rules', '[]'::jsonb), 'grounds', coalesce(v_opt->'grounds', '[]'::jsonb),
    'slots', v_slots,
    'bar', coalesce(a.slots, '[]'::jsonb), 'options', v_opt);
end $$;
revoke execute on function public.hr_hunt_settings_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid constant uuid := '000000c0-0000-0000-0000-00005e1a0025';
  v     jsonb;
  v_n   int := 0;
  v_case record;
  v_role text;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'action-conditions §9 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- (a) a conditional bar through the options door: stored canonical, empty tablets kept.
    v := public.hr_action_set_options(0, 0, jsonb_build_object('slots', jsonb_build_array(
           jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'power_strike'),
             'conditions', jsonb_build_array(jsonb_build_object('metric', 'self_hp_pct', 'op', 'lt', 'value', 50)), 'join', 'and'),
           null, 'cleave',
           jsonb_build_object('action', jsonb_build_object('type', 'attack_with_item', 'id', 'iron_arrows'),
             'conditions', jsonb_build_array(jsonb_build_object('metric', 'enemies_in_aoe', 'op', 'gte', 'value', 3))),
           jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', 'food'),
             'conditions', jsonb_build_array(jsonb_build_object('metric', 'ally_hp_pct', 'op', 'lt', 'value', 40, 'subject', 'tank'))))),
           '000000c0-0000-4000-a000-00005e1a2501');
    if coalesce(v->>'ok', '') <> 'true' or jsonb_array_length(v->'slots') <> 5 or jsonb_typeof(v->'slots'->1) <> 'null'
       or v->'slots'->2->'action'->>'id' <> 'cleave' or v->'slots'->3->>'join' <> 'and' then
      raise exception 'VERIFY(a): a valid conditional bar answered %', v; end if;
    -- (b) refused by name, never clamped; the stored bar does not move.
    for v_case in select * from (values
        ('[{"action":{"type":"ability","id":"power_strike"},"conditions":[{"metric":"vibes","op":"lt","value":5}]}]'::jsonb, 'bad_metric'),
        ('[{"action":{"type":"ability","id":"power_strike"},"conditions":[{"metric":"self_hp_pct","op":"has_effect","value":5}]}]'::jsonb, 'bad_op'),
        ('[{"action":{"type":"ability","id":"power_strike"},"conditions":[{"metric":"self_hp_pct","op":"lt","value":101}]}]'::jsonb, 'bad_value'),
        ('[{"action":{"type":"ability","id":"power_strike"},"conditions":[{"metric":"self_hp_pct","op":"lt","value":5.5}]}]'::jsonb, 'bad_value'),
        ('[{"action":{"type":"ability","id":"power_strike"},"conditions":[{"metric":"ally_hp_pct","op":"lt","value":5,"subject":"boss"}]}]'::jsonb, 'bad_subject'),
        ('[{"action":{"type":"ability","id":"power_strike"},"conditions":[{"metric":"self_hp_pct","op":"lt","value":1},{"metric":"self_hp_pct","op":"lt","value":2},{"metric":"self_hp_pct","op":"lt","value":3},{"metric":"self_hp_pct","op":"lt","value":4}]}]'::jsonb, 'too_many_conditions'),
        ('[{"action":{"type":"consume","id":"iron_arrows"}}]'::jsonb, 'bad_action'),
        ('[{"action":{"type":"ability","id":"power_strike"},"join":"xor"}]'::jsonb, 'bad_join'),
        ('[{"action":{"type":"ability","id":"power_strike"},"when":1}]'::jsonb, 'bad_slot')) c(slots, err) loop
      v_n := v_n + 1;
      v := public.hr_action_set_options(0, 0, jsonb_build_object('slots', v_case.slots), ('000000c0-0000-4000-a000-00005e1a26' || lpad(v_n::text, 2, '0'))::uuid);
      if v->>'error' is distinct from v_case.err then raise exception 'VERIFY(b): % answered % (expected %)', v_case.slots, v, v_case.err; end if;
    end loop;
    if (select jsonb_array_length(slots) from public.player_action_sets where user_id = v_uid and slot = 0 and preset = 0) <> 5 then
      raise exception 'VERIFY(b): a refused bar moved the stored one'; end if;
    -- (c) stop rules, grounds, density and the gathering share.
    v := public.hr_action_set_options(0, 0, jsonb_build_object(
           'stop_rules', jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(
              jsonb_build_object('metric', 'ally_mana_pct', 'op', 'lt', 'value', 20, 'subject', 'healer')), 'forMs', 30000)),
           'grounds', jsonb_build_array('millrace_sewer'), 'density', 4, 'gather_share', 25),
           '000000c0-0000-4000-a000-00005e1a2701');
    if coalesce(v->>'ok', '') <> 'true' or v->'options'->>'density' <> '4' or v->'options'->>'gather_share' <> '25'
       or v->'options'->'stop_rules'->0->>'forMs' <> '30000' or v->'options'->'grounds' <> '["millrace_sewer"]'::jsonb then
      raise exception 'VERIFY(c): stop rules / grounds / density / gather share answered %', v; end if;
    for v_case in select * from (values
        ('{"density": 17}'::jsonb, 'bad_density'), ('{"density": -1}'::jsonb, 'bad_density'), ('{"gather_share": 101}'::jsonb, 'bad_gather_share'),
        ('{"stop_rules": [{"conditions": [{"metric": "enemies_in_aoe", "op": "gte", "value": 2}]}]}'::jsonb, 'bad_metric'),
        ('{"stop_rules": [{"conditions": [{"metric": "self_hp_pct", "op": "lt", "value": 2}], "forMs": 150}]}'::jsonb, 'bad_hold'),
        ('{"grounds": ["atlantis"]}'::jsonb, 'bad_grounds')) c(opts, err) loop
      v_n := v_n + 1;
      v := public.hr_action_set_options(0, 0, v_case.opts, ('000000c0-0000-4000-a000-00005e1a28' || lpad(v_n::text, 2, '0'))::uuid);
      if v->>'error' is distinct from v_case.err then raise exception 'VERIFY(c): % answered % (expected %)', v_case.opts, v, v_case.err; end if;
    end loop;
    -- (d) the section: stored slots in place, the consume lane kept (a food slot is stored), density + share + stop rules.
    v := public.hr_state_of(v_uid, 0);
    if v->'hunt_settings'->'slots'->0->'action'->>'id' <> 'power_strike' or jsonb_typeof(v->'hunt_settings'->'slots'->1) <> 'null'
       or v->'hunt_settings'->>'density' <> '4' or v->'hunt_settings'->>'gather_share' <> '25'
       or v->'hunt_settings'->'gather_inert' <> 'true'::jsonb or jsonb_array_length(v->'hunt_settings'->'stop_rules') <> 1 then
      raise exception 'VERIFY(d): the hunt_settings section is %', v->'hunt_settings'; end if;
    -- (e) an empty bar shows the role's rules and the drink-at / eat-at defaults.
    v := public.hr_action_set_options(0, 0, jsonb_build_object('slots', '[]'::jsonb, 'food_below_pct', 45), '000000c0-0000-4000-a000-00005e1a2901');
    if coalesce(v->>'ok', '') <> 'true' or v->'slots' <> '[]'::jsonb then raise exception 'VERIFY(e): clearing the bar answered %', v; end if;
    v := public.hr_hunt_settings_view(v_uid, 0);
    if not exists (select 1 from jsonb_array_elements(v->'slots') e where e->'action'->>'type' = 'ability')
       or not exists (select 1 from jsonb_array_elements(v->'slots') e
                       where e->'action'->>'id' = 'food' and (e->'conditions'->0->>'value')::int = 45) then
      raise exception 'VERIFY(e): an empty bar projected %', v->'slots'; end if;
    -- (f) copy: the caller's own rows only, refused onto a character that does not exist.
    v := public.hr_action_set_copy(0, 1, '000000c0-0000-4000-a000-00005e1a2a01');
    if v->>'error' is distinct from 'no_character' then raise exception 'VERIFY(f): a copy onto no character answered %', v; end if;
    v := public.hr_action_set_copy(0, 0, '000000c0-0000-4000-a000-00005e1a2a02');
    if v->>'error' is distinct from 'bad_from' then raise exception 'VERIFY(f): a copy onto itself answered %', v; end if;
    raise exception using errcode = 'HR859', message = 'action-conditions §9 complete - rolling back';
  exception when sqlstate 'HR859' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) then raise exception 'VERIFY(g): §9 LEAKED a probe row'; end if;
  -- (h) the end arm and the per-ground preset are in the bodies; nothing internal is callable.
  if position('when ''rule'' then' in (select p.prosrc from pg_proc p where p.oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure)) = 0
     or position('options->''grounds''' in (select p.prosrc from pg_proc p where p.oid = 'public.hr_hunt_open_session(uuid,integer,text,uuid,integer,integer,integer,uuid,timestamp with time zone,integer)'::regprocedure)) = 0 then
    raise exception 'VERIFY(h): a restated body lost its new arm'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, 'public.hr_hunt_bar_check(jsonb)', 'execute')
         or has_function_privilege(v_role, 'public.hr_hunt_slot_check(jsonb)', 'execute')
         or has_function_privilege(v_role, 'public.hr_hunt_stop_rules_check(jsonb)', 'execute')
         or has_table_privilege(v_role, 'public.hr_hunt_condition_metrics', 'select') then
        raise exception 'VERIFY(h): % can reach a validator internal', v_role; end if;
    end loop;
    if has_function_privilege('anon', 'public.hr_action_set_copy(integer,integer,uuid)', 'execute') then
      raise exception 'VERIFY(h): anon can copy action sets'; end if;
  end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'action-conditions: the conditional bar validated by catalogue rows (refused by name), stop rules end `rule`, a preset per ground, copy, density + gather share stored; all green';
end $$;
