-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SPELL CONTENT'S SLOT VOCABULARY (lane b-spell-content,
-- systems-engineer, 2026-10-23). STAGED, NOT APPLIED. Game CLOSED: applies on
-- its passing §3; the slot vocabulary is part of the reopen Security review.
--
-- Tyler 2026-10-23 (COMBAT AUDIT ANSWERS, RUNE FAMILIES; roadmap p20-p23): the
-- rune spells spend their family's runes and, with none in the bag, the store's
-- (gold per cast, like food and drink); Nature's Wrath is Green Sickness, a
-- Poison rune spell whose hit leaves a short vulnerability; a heal can be aimed at
-- yourself.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_hunt_condition_metrics  ⟦metrics⟧ (src/data/condition-metrics.js): the
--                              effect ids a condition may name gain `sickness`
--                              (src/data/statuses.js, Green Sickness's mark).
--   hr_hunt_role_rules         ⟦role-rules⟧ (src/data/rule-subjects.js ROLE_RULES):
--                              each role default RUNE spell slot names its family's
--                              store rune (`action.store`, written on the slot, so a
--                              hero with no runes still casts it and its own runes go
--                              first); the Healer's attack-when-safe slot is
--                              d_green_sickness (was d_natures_wrath).
-- Both are full replaces from src/data, pinned equal by tests/hunt-core/conditions.mjs
-- sql-rows (`node tests/hunt-core/conditions.mjs --print`). No function body moves:
-- hr_hunt_slot_check (2026-12-21-slot-truth.sql) already validates a store rune
-- against its ability's rune (hr_hunt_abilities.rune = the store row's partner).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None to value. A default slot's store row is a server catalogue row the settle
-- re-prices from (hr_hunt_basic_supplies); the metric rows only widen what a
-- condition may test. No table, grant, signature or player row moves; seeded rows
-- move in hr_hunt_condition_metrics (same rows, new vals) and hr_hunt_role_rules
-- (same count, new slots).
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- After 2026-12-22-hunt-sessions-catalogue.generated.sql: §3 checks every default
-- slot through hr_hunt_slot_check, which needs green_sickness in hr_hunt_abilities
-- and the family store rows in hr_hunt_basic_supplies. The hr-accrue edge of this
-- lane carries the same ROLE_RULES; deploy it after this file.
-- REVERSIBILITY: re-apply the two blocks from 2026-12-21-slot-truth.sql (role rules)
-- and 2026-10-25-action-conditions.sql (metrics). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_condition_metrics') is null or to_regclass('public.hr_hunt_role_rules') is null
     or to_regprocedure('public.hr_hunt_slot_check(jsonb)') is null then
    raise exception 'PRECONDITION: the action-conditions catalogue and hr_hunt_slot_check must exist'; end if;
  if not exists (select 1 from public.hr_hunt_abilities where ability_id = 'green_sickness')
     or not exists (select 1 from public.hr_hunt_basic_supplies b join public.hr_hunt_abilities a on a.rune = b.partner
                     where a.ability_id = 'green_sickness') then
    raise exception 'PRECONDITION: apply 2026-12-22-hunt-sessions-catalogue.generated.sql first (green_sickness and the family store runes)'; end if;
end $mig$;

-- ── §1 THE CONDITION METRICS ─────────────────────────────────────────────────
delete from public.hr_hunt_condition_metrics;
insert into public.hr_hunt_condition_metrics (metric, kind, ops, lo, hi, subjects, slot_only, vals) values
-- ⟦metrics⟧
  ('self_hp_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, '{}'::text[], false, '{}'::text[]),
  ('self_mana_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, '{}'::text[], false, '{}'::text[]),
  ('ally_hp_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, array['lowest', 'tank', 'melee_dps', 'ranger', 'mage', 'healer']::text[], false, '{}'::text[]),
  ('ally_mana_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, array['lowest', 'tank', 'melee_dps', 'ranger', 'mage', 'healer']::text[], false, '{}'::text[]),
  ('allies_below', 'count', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 5, array['under_50', 'under_60', 'under_70', 'under_80', 'under_90']::text[], false, '{}'::text[]),
  ('enemies_in_aoe', 'count', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 25, '{}'::text[], true, '{}'::text[]),
  ('target_is_boss', 'bool', array['eq']::text[], null, null, '{}'::text[], false, '{}'::text[]),
  ('item_qty', 'count', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100000, array['item', 'food', 'drink', 'ammo']::text[], false, '{}'::text[]),
  ('effect_missing', 'effect', array['has_effect', 'lacks_effect']::text[], null, null, array['target', 'self', 'ally']::text[], false, array['bleed', 'sickness']::text[])
-- ⟦/metrics⟧
;

-- ── §2 THE ROLE DEFAULT SLOTS ────────────────────────────────────────────────
delete from public.hr_hunt_role_rules;
insert into public.hr_hunt_role_rules (role, ord, slot) values
-- ⟦role-rules⟧
  ('healer', 0, '{"id":"d_greater_mend","action":{"type":"ability","id":"greater_mend"},"conditions":[{"metric":"ally_hp_pct","op":"lt","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('healer', 1, '{"id":"d_circle_of_renewal","action":{"type":"ability","id":"circle_of_renewal"},"conditions":[{"metric":"allies_below","op":"gte","value":2,"subject":"under_80"}],"join":"and"}'::jsonb),
  ('healer', 2, '{"id":"d_green_sickness","action":{"type":"ability","id":"green_sickness"},"conditions":[{"metric":"ally_hp_pct","op":"gte","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('mage', 0, '{"id":"d_fireball","action":{"type":"ability","id":"fireball","store":"plain_fire_rune"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":2}],"join":"and"}'::jsonb),
  ('mage', 1, '{"id":"d_frost_lance","action":{"type":"ability","id":"frost_lance"},"conditions":[{"metric":"self_mana_pct","op":"gte","value":50}],"join":"and"}'::jsonb),
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

-- ── §3 SELF-CHECK: the properties, by executing them ─────────────────────────
do $$
declare v jsonb; r record; n int;
begin
  -- (a) the effect a condition may name includes Green Sickness's mark; an unknown one is refused
  if not exists (select 1 from public.hr_hunt_condition_metrics where metric = 'effect_missing' and 'sickness' = any(vals)) then
    raise exception 'VERIFY(a): effect_missing does not offer sickness'; end if;
  v := public.hr_hunt_conds_check('[{"metric":"effect_missing","op":"has_effect","value":"sickness","subject":"target"}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(a): a sickness condition was refused: %', v; end if;
  v := public.hr_hunt_conds_check('[{"metric":"effect_missing","op":"has_effect","value":"plague","subject":"target"}]'::jsonb, '"and"'::jsonb, false);
  if v is null then raise exception 'VERIFY(a): an unknown effect was accepted'; end if;
  -- (b) every role default slot passes the slot validator, and a rune spell's keeps its store rune
  n := 0;
  for r in select role, ord, slot from public.hr_hunt_role_rules order by role, ord loop
    v := public.hr_hunt_slot_check(r.slot);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the % default slot % is refused: %', r.role, r.ord, v; end if;
    if r.slot->'action' ? 'store' then
      n := n + 1;
      if (v->'slot'->'action'->>'store') is distinct from (r.slot->'action'->>'store') then
        raise exception 'VERIFY(b): the % default slot % lost its store rune: %', r.role, r.ord, v; end if;
    end if;
  end loop;
  if n < 1 then raise exception 'VERIFY(b): no default rune spell slot names a store rune'; end if;
  if exists (select 1 from public.hr_hunt_role_rules where slot->'action'->>'id' = 'natures_wrath') then
    raise exception 'VERIFY(b): a default slot still names natures_wrath'; end if;
  -- (c) a default rune spell slot naming ANOTHER family's store rune is refused (the validator's partner rule)
  v := public.hr_hunt_slot_check('{"action":{"type":"ability","id":"green_sickness","store":"plain_fire_rune"},"conditions":[],"join":"and"}'::jsonb);
  if coalesce(v->>'error', '') <> 'bad_store' then raise exception 'VERIFY(c): a Fire store rune on Green Sickness answered %', v; end if;
end $$;
