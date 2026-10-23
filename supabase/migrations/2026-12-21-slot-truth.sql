-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A SLOT DOES EXACTLY WHAT THE SCREEN SAYS (lane b-spell-core,
-- systems-engineer, 2026-10-23). STAGED, NOT APPLIED. Game CLOSED: applies on
-- its passing §3; the slot validator is part of the reopen Security review.
--
-- Tyler 2026-10-23 (combat audit c21, c23, c24; p13): a slot with no conditions
-- fires whenever it is ready, as the Configure action says (no hidden default
-- trigger stands behind it); the old eat-at / drink-at settings are retired (one
-- source: the slot's own conditions); every slot can be switched Off and can
-- ignore chosen monsters (Tyler 2026-10-19, the Configure action: "Ignored
-- monsters", "Enabled"). And (Tyler 2026-10-23) runes fuel SPELLS only: no attack
-- slot may name a rune.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_hunt_slot_check        a slot may carry `enabled` (a boolean; false = Off,
--                             true is the default and is not stored) and `ignore`
--                             (unique monster ids of hr_hunt_kill_bounds, at most
--                             max_ignored, stored sorted): refused `bad_enabled`,
--                             `bad_ignore`, `too_many_ignored` (the engine's
--                             src/core/hunt/conditions.js slotProblem, mirrored in
--                             its order). The stable rule id hashes the ignore list
--                             (it is the rule's content), never `enabled` (an Off and
--                             On keeps the id). A slot with neither keeps its id.
--   hr_hunt_condition_limits  + max_ignored (⟦limits⟧, condition-metrics.js MAX_IGNORED).
--   hr_hunt_action_ids        no rune is an attack item (⟦action-ids⟧: conditions.js
--                             attackItem); a stored rune attack slot reads as an
--                             empty tablet (no back-compat: the wipe is at EA).
--   hr_hunt_role_rules        each role default slot carries its trigger as REAL
--                             conditions (⟦role-rules⟧: rule-subjects.js ROLE_RULES
--                             over abilities.js suggestedTrigger), the conditions the
--                             engine applied behind them until now: same behaviour,
--                             now on the screen.
-- RESTATED WHOLE: hr_hunt_slot_check from 2026-11-07-store-by-slot.sql (§0 pins
-- that image by its STORE-BY-SLOT marker, or this file's SLOT-TRUTH), byte-for-byte
-- but its SLOT-TRUTH lines. The three catalogue tables are full replaces from
-- src/data (pinned equal by tests/hunt-core/conditions.mjs sql-rows; `--print`).
-- The retired eat-at / drink-at option rows (hr_hunt_set_options) and their
-- threshold limits leave with 2026-12-21-hunt-sessions-catalogue.generated.sql.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None to value. `enabled` and `ignore` only ever STOP a slot from firing; a slot
-- names no price, amount or item a store sells. `ignore` is bounded (max_ignored,
-- unique, known ids) so a stored bar cannot grow; the settle reads the stored,
-- canonical slots. No table, grant, signature or player row moves; seeded rows move
-- in hr_hunt_condition_limits (+1), hr_hunt_action_ids (-7 runes) and
-- hr_hunt_role_rules (same 15 rows, new conditions): restore-census re-pinned.
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- After 2026-12-21-hunt-sessions-catalogue.generated.sql (no object in common; the
-- same lane) and after 2026-12-17-beta-premium.sql (the newest applied). The
-- hr-accrue edge of this lane (it reads enabled / ignore, retires runes from
-- basics and the eat-at / drink-at options) may deploy before or after: an old
-- edge ignores the two keys (a slot Off still fires until it lands), the new edge
-- reads an old slot as On with nothing ignored.
-- REVERSIBILITY: re-apply hr_hunt_slot_check from 2026-11-07-store-by-slot.sql and
-- the three blocks from it / 2026-10-26-bar-three-conditions.sql /
-- 2026-10-25-action-conditions.sql. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regclass('public.hr_hunt_condition_limits') is null or to_regclass('public.hr_hunt_action_ids') is null
     or to_regclass('public.hr_hunt_role_rules') is null or to_regclass('public.hr_hunt_kill_bounds') is null then
    raise exception 'PRECONDITION: the action-conditions catalogue and hr_hunt_kill_bounds must exist'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_slot_check(jsonb)'::regprocedure;
  if strpos(v_src, 'SLOT-TRUTH') = 0 and strpos(v_src, 'STORE-BY-SLOT (2026-11-04)') = 0 then
    raise exception 'PIN: hr_hunt_slot_check is neither the store-by-slot image nor this file''s'; end if;
end $mig$;

-- ── §1 THE CATALOGUE THE VALIDATOR AND THE DEFAULT BAR READ ──────────────────
delete from public.hr_hunt_condition_limits;
insert into public.hr_hunt_condition_limits (key, value) values
-- ⟦limits⟧
  ('max_conditions', 3),
  ('max_stop_rules', 3),
  ('stop_hold_max_ms', 600000),
  ('stop_hold_step_ms', 100),
  ('max_ignored', 8)
-- ⟦/limits⟧
;
delete from public.hr_hunt_action_ids;
insert into public.hr_hunt_action_ids (type, id) values
-- ⟦action-ids⟧
  ('attack_with_item', 'barbed_arrows'),
  ('attack_with_item', 'bronze_arrows'),
  ('attack_with_item', 'coarse_whetstone'),
  ('attack_with_item', 'copper_whetstone'),
  ('attack_with_item', 'dawn_whetstone'),
  ('attack_with_item', 'dawnpoint_arrows'),
  ('attack_with_item', 'emberhead_arrows'),
  ('attack_with_item', 'iron_arrows'),
  ('attack_with_item', 'iron_bolts'),
  ('attack_with_item', 'iron_whetstone'),
  ('attack_with_item', 'loaded'),
  ('attack_with_item', 'mithril_arrows'),
  ('attack_with_item', 'mithril_whetstone'),
  ('attack_with_item', 'rune_arrows'),
  ('attack_with_item', 'rune_whetstone'),
  ('attack_with_item', 'steel_arrows'),
  ('attack_with_item', 'steel_whetstone'),
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
  ('consume', 'emberfruit_cordial'),
  ('consume', 'goldenroot_tea'),
  ('consume', 'pumpkin_cider'),
  ('consume', 'river_chowder'),
  ('consume', 'salted_lobster'),
  ('consume', 'salted_shark'),
  ('consume', 'salted_shrimp'),
  ('consume', 'salted_swordfish'),
  ('consume', 'salted_trout'),
  ('consume', 'thin_carrot_juice'),
  ('consume', 'thin_emberfruit_cordial'),
  ('consume', 'thin_goldenroot_tea'),
  ('consume', 'thin_pumpkin_cider'),
  ('consume', 'thin_tomato_juice'),
  ('consume', 'thin_turnip_juice'),
  ('consume', 'tomato_juice'),
  ('consume', 'turnip_juice'),
  ('consume', 'turnip_mash'),
  ('consume', 'wheat_bread')
-- ⟦/action-ids⟧
;
delete from public.hr_hunt_role_rules;
insert into public.hr_hunt_role_rules (role, ord, slot) values
-- ⟦role-rules⟧
  ('healer', 0, '{"id":"d_greater_mend","action":{"type":"ability","id":"greater_mend"},"conditions":[{"metric":"ally_hp_pct","op":"lt","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('healer', 1, '{"id":"d_circle_of_renewal","action":{"type":"ability","id":"circle_of_renewal"},"conditions":[{"metric":"allies_below","op":"gte","value":2,"subject":"under_80"}],"join":"and"}'::jsonb),
  ('healer', 2, '{"id":"d_natures_wrath","action":{"type":"ability","id":"natures_wrath"},"conditions":[{"metric":"ally_hp_pct","op":"gte","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('mage', 0, '{"id":"d_fireball","action":{"type":"ability","id":"fireball"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":2}],"join":"and"}'::jsonb),
  ('mage', 1, '{"id":"d_frost_lance","action":{"type":"ability","id":"frost_lance"},"conditions":[],"join":"and"}'::jsonb),
  ('mage', 2, '{"id":"d_arcane_barrier","action":{"type":"ability","id":"arcane_barrier"},"conditions":[{"metric":"self_hp_pct","op":"lt","value":85}],"join":"and"}'::jsonb),
  ('melee_dps', 0, '{"id":"d_power_strike","action":{"type":"ability","id":"power_strike"},"conditions":[],"join":"and"}'::jsonb),
  ('melee_dps', 1, '{"id":"d_cleave","action":{"type":"ability","id":"cleave"},"conditions":[],"join":"and"}'::jsonb),
  ('melee_dps', 2, '{"id":"d_rend","action":{"type":"ability","id":"rend"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 0, '{"id":"d_hunters_mark","action":{"type":"ability","id":"hunters_mark"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 1, '{"id":"d_flame_volley","action":{"type":"ability","id":"flame_volley"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":2}],"join":"and"}'::jsonb),
  ('ranger', 2, '{"id":"d_precision_shot","action":{"type":"ability","id":"precision_shot"},"conditions":[],"join":"and"}'::jsonb),
  ('tank', 0, '{"id":"d_challenge","action":{"type":"ability","id":"challenge"},"conditions":[],"join":"and"}'::jsonb),
  ('tank', 1, '{"id":"d_flame_strike","action":{"type":"ability","id":"flame_strike"},"conditions":[],"join":"and"}'::jsonb),
  ('tank', 2, '{"id":"d_power_strike","action":{"type":"ability","id":"power_strike"},"conditions":[],"join":"and"}'::jsonb)
-- ⟦/role-rules⟧
;

-- ── §2 THE SLOT VALIDATOR, RESTATED ──────────────────────────────────────────
create or replace function public.hr_hunt_slot_check(p_s jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  -- STORE-BY-SLOT (2026-11-04): a slot names ONE item; a rune spell may name its store rune (action.store).
  -- SLOT-TRUTH (2026-12-21): a slot may be switched Off (enabled) and may ignore monsters (ignore).
  v_type text; v_id text; v_r jsonb; v_store text; v_ign jsonb; v_max int;
begin
  if p_s is null or jsonb_typeof(p_s) = 'null' then return jsonb_build_object('ok', true, 'slot', 'null'::jsonb); end if;
  if jsonb_typeof(p_s) = 'string' then
    if not exists (select 1 from public.hr_hunt_abilities a where a.ability_id = p_s #>> '{}') then
      return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
    v_r := jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', p_s #>> '{}'), 'conditions', '[]'::jsonb, 'join', 'and');
    return jsonb_build_object('ok', true, 'slot', v_r || jsonb_build_object('id', 'r' || substr(md5(v_r::text), 1, 8)));
  end if;
  if jsonb_typeof(p_s) <> 'object' or jsonb_typeof(p_s->'action') is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  if exists (select 1 from jsonb_object_keys(p_s) k where k not in ('id', 'action', 'conditions', 'join', 'enabled', 'ignore')) then
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  -- SLOT-TRUTH: ON / OFF, a boolean (false = Off: the slot never fires).
  if p_s ? 'enabled' and jsonb_typeof(p_s->'enabled') is distinct from 'boolean' then
    return jsonb_build_object('ok', false, 'error', 'bad_enabled'); end if;
  -- SLOT-TRUTH: the monsters it ignores: unique ids of the catalogue's monsters, at most max_ignored, stored sorted.
  if p_s ? 'ignore' then
    v_max := (select value from public.hr_hunt_condition_limits where key = 'max_ignored');
    if v_max is null then return jsonb_build_object('ok', false, 'error', 'bad_slot', 'why', 'catalogue_missing'); end if;
    if jsonb_typeof(p_s->'ignore') <> 'array' then return jsonb_build_object('ok', false, 'error', 'bad_ignore'); end if;
    if jsonb_array_length(p_s->'ignore') > v_max then
      return jsonb_build_object('ok', false, 'error', 'too_many_ignored', 'max', v_max); end if;
    if exists (select 1 from jsonb_array_elements(p_s->'ignore') e
                where jsonb_typeof(e) <> 'string'
                   or not exists (select 1 from public.hr_hunt_kill_bounds b where b.monster_id = e #>> '{}'))
       or (select count(distinct e #>> '{}') from jsonb_array_elements(p_s->'ignore') e) <> jsonb_array_length(p_s->'ignore') then
      return jsonb_build_object('ok', false, 'error', 'bad_ignore'); end if;
    select coalesce(jsonb_agg(to_jsonb(x) order by x), '[]'::jsonb) into v_ign from jsonb_array_elements_text(p_s->'ignore') x;
  end if;
  v_type := p_s->'action'->>'type'; v_id := p_s->'action'->>'id';
  -- THE RETIRED "ANY FOOD" / "ANY DRINK" (Tyler 2026-10-21: the game never picks a supply): refused in words.
  if v_type = 'consume' and v_id in ('food', 'drink') then
    return jsonb_build_object('ok', false, 'error', 'choose_item'); end if;
  if jsonb_typeof(p_s->'action'->'id') is distinct from 'string' or v_type is null
     or not coalesce(case v_type
          when 'ability' then exists (select 1 from public.hr_hunt_abilities a where a.ability_id = v_id)
          when 'consume' then exists (select 1 from public.hr_hunt_action_ids x where x.type = 'consume' and x.id = v_id)
          when 'attack_with_item' then exists (select 1 from public.hr_hunt_action_ids x where x.type = 'attack_with_item' and x.id = v_id)
          else false end, false) then
    return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  if exists (select 1 from jsonb_object_keys(p_s->'action') k where k not in ('type', 'id', 'store')) then
    return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  -- THE STORE RUNE (designer 2026-10-21): only a spell that spends a rune may name a store row, and
  -- only that rune's (its partner). A food or drink slot names its one item and nothing else.
  if p_s->'action' ? 'store' then
    v_store := case when jsonb_typeof(p_s->'action'->'store') = 'string' then p_s->'action'->>'store' end;
    if v_store is null or v_type <> 'ability' or not exists (
         select 1 from public.hr_hunt_basic_supplies q join public.hr_hunt_abilities a on a.rune = q.partner
          where q.basic_id = v_store and a.ability_id = v_id) then
      return jsonb_build_object('ok', false, 'error', 'bad_store'); end if;
  end if;
  v_r := public.hr_hunt_conds_check(p_s->'conditions', p_s->'join', false);
  if v_r is not null then return jsonb_build_object('ok', false) || v_r; end if;
  -- THE STABLE RULE ID is the server's, from the slot's CONTENT (never the client's value,
  -- never its position): a reorder or a copy keeps it, an edit changes it. SLOT-TRUTH: the
  -- ignored monsters are content; Off is not (the id survives an Off and On).
  v_r := jsonb_build_object('action', jsonb_build_object('type', v_type, 'id', v_id)
                                     || case when v_store is null then '{}'::jsonb else jsonb_build_object('store', v_store) end,
    'conditions', coalesce(p_s->'conditions', '[]'::jsonb), 'join', coalesce(p_s->>'join', 'and'))
    || case when v_ign is null or jsonb_array_length(v_ign) = 0 then '{}'::jsonb else jsonb_build_object('ignore', v_ign) end;
  return jsonb_build_object('ok', true, 'slot', v_r || jsonb_build_object('id', 'r' || substr(md5(v_r::text), 1, 8))
    || case when p_s->'enabled' = 'false'::jsonb then jsonb_build_object('enabled', false) else '{}'::jsonb end);
end $$;
revoke execute on function public.hr_hunt_slot_check(jsonb) from public, anon, authenticated, service_role;

-- ── §3 SELF-CHECK: the properties, by executing them ─────────────────────────
do $$
declare
  c jsonb := '{"metric":"self_hp_pct","op":"lt","value":50}'::jsonb;
  v jsonb; v0 jsonb; v_f text;
begin
  -- (a) the catalogue rows
  if (select value from public.hr_hunt_condition_limits where key = 'max_ignored') is distinct from 8 then
    raise exception 'VERIFY(a): max_ignored is not 8'; end if;
  if exists (select 1 from public.hr_hunt_action_ids where type = 'attack_with_item' and id like '%\_rune')
     or not exists (select 1 from public.hr_hunt_action_ids where type = 'attack_with_item' and id = 'iron_arrows') then
    raise exception 'VERIFY(a): a rune is still an attack item, or the arrows are gone'; end if;
  if (select slot->'conditions' from public.hr_hunt_role_rules where role = 'mage' and ord = 2)
       is distinct from '[{"metric":"self_hp_pct","op":"lt","value":85}]'::jsonb
     or (select slot->'conditions' from public.hr_hunt_role_rules where role = 'healer' and ord = 0)
       is distinct from '[{"metric":"ally_hp_pct","op":"lt","value":70,"subject":"lowest"}]'::jsonb
     or (select count(*) from public.hr_hunt_role_rules) <> 15 then
    raise exception 'VERIFY(a): the role rule sets do not carry their triggers as conditions'; end if;
  -- (b) a plain slot keeps the id it had; Off is stored and keeps the id; On is not stored
  v0 := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', 'cooked_shrimp'), 'conditions', jsonb_build_array(c)));
  v := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', 'cooked_shrimp'), 'conditions', jsonb_build_array(c), 'enabled', false));
  if coalesce(v->>'ok', '') <> 'true' or v->'slot'->'enabled' is distinct from 'false'::jsonb or v->'slot'->>'id' is distinct from v0->'slot'->>'id'
     or v0->'slot' ? 'enabled' or v0->'slot' ? 'ignore' then
    raise exception 'VERIFY(b): an Off slot reads % beside the plain %', v, v0; end if;
  v := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', 'cooked_shrimp'), 'conditions', jsonb_build_array(c), 'enabled', true));
  if v->'slot' ? 'enabled' or v->'slot'->>'id' is distinct from v0->'slot'->>'id' then raise exception 'VERIFY(b): an On slot reads %', v; end if;
  -- (c) the ignored monsters: stored sorted, part of the id; refused by name
  v := public.hr_hunt_slot_check('{"action": {"type": "ability", "id": "fireball"}, "ignore": ["slime", "rat"]}'::jsonb);
  if coalesce(v->>'ok', '') <> 'true' or v->'slot'->'ignore' is distinct from '["rat", "slime"]'::jsonb then
    raise exception 'VERIFY(c): an ignore list reads %', v; end if;
  if v->'slot'->>'id' = (public.hr_hunt_slot_check('{"action": {"type": "ability", "id": "fireball"}}'::jsonb))->'slot'->>'id' then
    raise exception 'VERIFY(c): the ignore list is not part of the rule id'; end if;
  foreach v_f in array array[
      '{"action": {"type": "ability", "id": "fireball"}, "ignore": ["rat", "rat"]}',
      '{"action": {"type": "ability", "id": "fireball"}, "ignore": ["no_such_monster"]}',
      '{"action": {"type": "ability", "id": "fireball"}, "ignore": "rat"}',
      '{"action": {"type": "ability", "id": "fireball"}, "ignore": [7]}'] loop
    v := public.hr_hunt_slot_check(v_f::jsonb);
    if v->>'error' is distinct from 'bad_ignore' then raise exception 'VERIFY(c): % answered %', v_f, v; end if;
  end loop;
  v := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'fireball'),
         'ignore', (select jsonb_agg(monster_id order by monster_id) from (select monster_id from public.hr_hunt_kill_bounds order by monster_id limit 9) m)));
  if v->>'error' is distinct from 'too_many_ignored' then raise exception 'VERIFY(c): nine ignored monsters answered %', v; end if;
  v := public.hr_hunt_slot_check('{"action": {"type": "ability", "id": "fireball"}, "enabled": "no"}'::jsonb);
  if v->>'error' is distinct from 'bad_enabled' then raise exception 'VERIFY(c): a non-boolean Off answered %', v; end if;
  v := public.hr_hunt_slot_check('{"action": {"type": "ability", "id": "fireball"}, "colour": "red"}'::jsonb);
  if v->>'error' is distinct from 'bad_slot' then raise exception 'VERIFY(c): an unknown slot key answered %', v; end if;
  -- (d) no rune attack slot; a bar keeps an Off slot and an ignore list through hr_hunt_bar_check
  v := public.hr_hunt_slot_check('{"action": {"type": "attack_with_item", "id": "fire_rune"}}'::jsonb);
  if v->>'error' is distinct from 'bad_action' then raise exception 'VERIFY(d): a Fire Rune attack slot answered %', v; end if;
  v := public.hr_hunt_bar_check('[{"action": {"type": "ability", "id": "fireball"}, "enabled": false}, {"action": {"type": "ability", "id": "fireball"}, "ignore": ["rat"]}, null]'::jsonb);
  if coalesce(v->>'ok', '') <> 'true' or v->'slots'->0->'enabled' is distinct from 'false'::jsonb
     or v->'slots'->1->'ignore' is distinct from '["rat"]'::jsonb or v->'slots'->0->>'id' = v->'slots'->1->>'id' then
    raise exception 'VERIFY(d): the bar check reads %', v; end if;
  -- (e) the old shapes are unchanged: three conditions still pass, "Any food" is still refused in words
  v := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', 'cooked_shrimp'), 'conditions', jsonb_build_array(c, c, c)));
  if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): three conditions answered %', v; end if;
  v := public.hr_hunt_slot_check('{"action": {"type": "consume", "id": "food"}}'::jsonb);
  if v->>'error' is distinct from 'choose_item' then raise exception 'VERIFY(e): Any food answered %', v; end if;
  -- (f) no client role reaches the validator
  if has_function_privilege('anon', 'public.hr_hunt_slot_check(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_slot_check(jsonb)', 'execute') then
    raise exception 'VERIFY(f): a client role reaches hr_hunt_slot_check'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'slot-truth: a slot does what it says; Off and ignored monsters stored and validated; no rune attack slot';
end $$;
