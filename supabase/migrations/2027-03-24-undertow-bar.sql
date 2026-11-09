-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — UNDERTOW ON THE HEALER'S DEFAULT BAR (lane/b-one-difficulty,
-- systems-engineer, 2026-11-09; Tyler 2026-11-09, answer d: "Give the healer a
-- little more damage by giving it a new spell that can only be used when not in
-- a party. Make that callout clear to the player.").
-- STAGED, NOT APPLIED. Pre-EA (CLAUDE.md §2): applies on its passing §3.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- A lone Healer killed slowest of every way to fight: at the Thicket's floor 0.48
-- and at Wickstead's 0.46 of the pace of record (tests/hunt-core/first-week-bands
-- asks half). Undertow (src/data/abilities.js, `alone`) is its own strike, cast
-- only while no other living hero shares its world; the engine reads that at each
-- cast (src/core/hunt/abilities.js aloneIn). Measured on the real settle, 2 seeds
-- x 1 h, practice set: the Thicket 14,063 Level XP an hour (0.63), Wickstead 19,035
-- (0.57). A party never casts it, so no party moves.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_hunt_role_rules   ⟦role-rules⟧ full replace from src/data/rule-subjects.js
--                        ROLE_RULES (pinned by tests/hunt-core/conditions.mjs
--                        sql-rows; 12 -> 13 rows, 5 roles): the Healer's set gains
--                        d_undertow, after Green Sickness, on the Plain Water Rune,
--                        waiting while the Healer's lowest ally is under 70%.
-- No function body, grant, signature, table or player row moves. A stored bar is
-- the player's and is untouched; the settings view projects these rows only for a
-- bar that holds no ability of its own.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None new. A catalogue of default slots. The store rune is bought per cast
-- through the engine's existing path at the server's price (1 g), paid from the
-- hero's own gold; nothing here takes a value from a client or crosses to
-- another player.
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- After 2027-03-23-one-difficulty-hunt-sessions-catalogue.generated.sql (hr_hunt_abilities
-- carries undertow) and 2027-03-24-undertow-rune-spells.generated.sql (hr_hunt_slot_check
-- reads its store rows from hr_hunt_rune_spells()); §0 refuses without either.
-- EDGE: hr-accrue carries the same ROLE_RULES and the engine's alone gate (src/data and
-- src/core ride the payload): apply, deploy at once, then the client. Between the two the
-- only difference is a slot the view shows that the engine doesn't fire yet.
-- REVERSIBILITY: re-apply §2 of 2027-03-09-caster-starter-bars.sql. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_role_rules') is null or to_regclass('public.hr_hunt_abilities') is null
     or to_regclass('public.hr_hunt_basic_supplies') is null or to_regprocedure('public.hr_hunt_slot_check(jsonb)') is null
     or to_regprocedure('public.hr_hunt_rune_spells()') is null then
    raise exception 'PRECONDITION: hr_hunt_role_rules, hr_hunt_abilities, hr_hunt_basic_supplies, hr_hunt_slot_check and hr_hunt_rune_spells must exist'; end if;
  if not exists (select 1 from public.hr_hunt_abilities where ability_id = 'undertow' and rune = 'chalked_water_rune' and active) then
    raise exception 'PRECONDITION: hr_hunt_abilities has no Undertow: apply 2027-03-23-one-difficulty-hunt-sessions-catalogue.generated.sql first'; end if;
  if public.hr_hunt_rune_spells()->'undertow'->'store' is null then
    raise exception 'PRECONDITION: hr_hunt_rune_spells() has no Undertow: apply 2027-03-24-undertow-rune-spells.generated.sql first'; end if;
end $mig$;

-- ── §2 THE ROLE DEFAULT SLOTS ────────────────────────────────────────────────
delete from public.hr_hunt_role_rules;
insert into public.hr_hunt_role_rules (role, ord, slot) values
-- ⟦role-rules⟧
  ('healer', 0, '{"id":"d_greater_mend","action":{"type":"ability","id":"greater_mend","store":"plain_water_rune"},"conditions":[{"metric":"ally_hp_pct","op":"lt","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('healer', 1, '{"id":"d_circle_of_renewal","action":{"type":"ability","id":"circle_of_renewal","store":"plain_water_rune"},"conditions":[{"metric":"allies_below","op":"gte","value":2,"subject":"under_80"}],"join":"and"}'::jsonb),
  ('healer', 2, '{"id":"d_green_sickness","action":{"type":"ability","id":"green_sickness","store":"plain_poison_rune"},"conditions":[{"metric":"ally_hp_pct","op":"gte","value":70,"subject":"lowest"},{"metric":"self_mana_pct","op":"gte","value":78}],"join":"and"}'::jsonb),
  ('healer', 3, '{"id":"d_undertow","action":{"type":"ability","id":"undertow","store":"plain_water_rune"},"conditions":[{"metric":"ally_hp_pct","op":"gte","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('mage', 0, '{"id":"d_fireball","action":{"type":"ability","id":"fireball","store":"plain_fire_rune"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":2}],"join":"and"}'::jsonb),
  ('mage', 1, '{"id":"d_frost_lance","action":{"type":"ability","id":"frost_lance","store":"plain_ice_rune"},"conditions":[{"metric":"self_mana_pct","op":"gte","value":70}],"join":"and"}'::jsonb),
  ('mage', 2, '{"id":"d_arcane_barrier","action":{"type":"ability","id":"arcane_barrier","store":"plain_earth_rune"},"conditions":[{"metric":"self_hp_pct","op":"lt","value":85}],"join":"and"}'::jsonb),
  ('melee_dps', 0, '{"id":"d_power_strike","action":{"type":"ability","id":"power_strike"},"conditions":[],"join":"and"}'::jsonb),
  ('melee_dps', 1, '{"id":"d_cleave","action":{"type":"ability","id":"cleave"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 0, '{"id":"d_hunters_mark","action":{"type":"ability","id":"hunters_mark"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 1, '{"id":"d_precision_shot","action":{"type":"ability","id":"precision_shot"},"conditions":[],"join":"and"}'::jsonb),
  ('tank', 0, '{"id":"d_challenge","action":{"type":"ability","id":"challenge"},"conditions":[],"join":"and"}'::jsonb),
  ('tank', 1, '{"id":"d_power_strike","action":{"type":"ability","id":"power_strike"},"conditions":[],"join":"and"}'::jsonb)
-- ⟦/role-rules⟧
;

-- ── §3 SELF-CHECK: the properties, by executing them ─────────────────────────
do $$
declare v jsonb; r record; v_n bigint;
begin
  -- (a) every default slot passes the slot validator
  for r in select role, ord, slot from public.hr_hunt_role_rules order by role, ord loop
    v := public.hr_hunt_slot_check(r.slot);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the % default slot % is refused: %', r.role, r.ord, v; end if;
  end loop;
  -- (b) EVERY role: no rune spell without a store row of its own family, the settings view's own test (hr_hunt_settings_view `usable`),
  -- so no default slot is struck for a hero who carries no rune
  select h.role, h.ord, h.slot into r from public.hr_hunt_role_rules h
    join public.hr_hunt_abilities a on a.ability_id = h.slot->'action'->>'id'
   where a.rune is not null and not exists (
     select 1 from public.hr_hunt_basic_supplies q where q.basic_id = h.slot->'action'->>'store' and q.partner = a.rune) limit 1;
  if found then raise exception 'VERIFY(b): the % default slot % is a rune spell with no store rune of its family: %', r.role, r.ord, r.slot; end if;
  -- (c) every store rune a default slot names costs what the bar says it costs: a positive whole price from the store's own row
  select count(*) into v_n from public.hr_hunt_role_rules h
    join public.hr_hunt_basic_supplies q on q.basic_id = h.slot->'action'->>'store' where q.price < 1;
  if v_n <> 0 then raise exception 'VERIFY(c): % default slots name a store rune with no price', v_n; end if;
  -- (d) the rows are the data's: 13, 5 roles, no weapon hero's rune spell on a default set
  if (select count(*) from public.hr_hunt_role_rules) <> 13 then
    raise exception 'VERIFY(d): % default slots, wanted 13', (select count(*) from public.hr_hunt_role_rules); end if;
  if (select count(distinct role) from public.hr_hunt_role_rules) <> 5 then raise exception 'VERIFY(d): a role lost its default set'; end if;
  if exists (select 1 from public.hr_hunt_role_rules where slot->'action'->>'id' in ('flame_strike', 'flame_volley', 'rend')) then
    raise exception 'VERIFY(d): a default set still holds a weapon hero''s rune spell'; end if;
  -- (e) the mana gates: a store-fed spell behind a core one fires only at the top of a fight (rule-subjects.js, measured)
  if not exists (select 1 from public.hr_hunt_role_rules where role = 'mage' and slot->'action'->>'id' = 'frost_lance'
       and slot->'conditions' @> '[{"metric":"self_mana_pct","op":"gte","value":70}]'::jsonb) then raise exception 'VERIFY(e): Frost Lance lost its mana gate'; end if;
  if not exists (select 1 from public.hr_hunt_role_rules where role = 'healer' and slot->'action'->>'id' = 'green_sickness'
       and slot->'conditions' @> '[{"metric":"self_mana_pct","op":"gte","value":78},{"metric":"ally_hp_pct","op":"gte","value":70}]'::jsonb) then raise exception 'VERIFY(e): Green Sickness lost its gates'; end if;
  -- (f) Undertow: on the Healer's set only, fourth (after Green Sickness), on the Plain Water Rune, waiting while the lowest ally is under 70%
  if (select count(*) from public.hr_hunt_role_rules where slot->'action'->>'id' = 'undertow') <> 1
     or not exists (select 1 from public.hr_hunt_role_rules where role = 'healer' and ord = 3 and slot->'action'->>'id' = 'undertow'
       and slot->'action'->>'store' = 'plain_water_rune'
       and slot->'conditions' @> '[{"metric":"ally_hp_pct","op":"gte","value":70,"subject":"lowest"}]'::jsonb) then
    raise exception 'VERIFY(f): Undertow is not the Healer''s fourth default slot on the Plain Water Rune'; end if;
end $$;
