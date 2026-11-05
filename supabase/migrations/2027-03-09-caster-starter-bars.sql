-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A NEW CASTER'S FIRST FIGHTS (lane/c-caster-starter-bars,
-- systems-engineer, 2026-11-05; designer's ruling lane/d-caster-first-fights).
-- STAGED, NOT APPLIED. Pre-EA (CLAUDE.md §2): applies on its passing §3.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- A new Mage on a lone monster cast nothing for five minutes: Fireball waits for
-- two monsters, and Frost Lance and Arcane Barrier sat struck "no runes". A new
-- Healer cast nothing on a lone monster and one Greater Mend in its first five
-- minutes on the Cellar as built. The kit carries no rune (Tyler 2026-10-23), and
-- only Fireball's and Greater Mend's default slots named a store rune.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_hunt_role_rules   ⟦role-rules⟧ full replace from src/data/rule-subjects.js
--                        ROLE_RULES (pinned by tests/hunt-core/conditions.mjs
--                        sql-rows; 14 -> 12 rows, 5 roles):
--     every default rune slot names its family's store rune;
--     Frost Lance's mana gate 50% -> 70%; Green Sickness also needs mana 80%;
--     d_flame_volley leaves the Ranger's set and d_rend the Melee damage set:
--     "A spell costs runes" offers each, as it offers a sword hero Flame Strike.
-- No function body, grant, signature, table or player row moves. A stored bar is
-- the player's and is untouched; the settings view projects these rows only
-- for a bar that holds no ability of its own.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None new. A catalogue of default slots. The store buys per cast through the
-- engine's existing path at the server's price (1 g), paid from the hero's own
-- gold; nothing here takes a value from a client or crosses to another player.
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- After 2027-02-28-sink-price-plan.sql.
-- EDGE: hr-accrue carries the same ROLE_RULES (src/data/rule-subjects.js rides the
-- payload): apply this file, deploy at once, then the client. Between the two the
-- only difference is a slot the view shows live that the engine doesn't fire yet.
-- REVERSIBILITY: re-apply §2 of 2027-02-09-starter-bar-fires.sql. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_role_rules') is null or to_regclass('public.hr_hunt_abilities') is null
     or to_regclass('public.hr_hunt_basic_supplies') is null or to_regprocedure('public.hr_hunt_slot_check(jsonb)') is null then
    raise exception 'PRECONDITION: hr_hunt_role_rules, hr_hunt_abilities, hr_hunt_basic_supplies and hr_hunt_slot_check must exist'; end if;
end $mig$;

-- ── §2 THE ROLE DEFAULT SLOTS ────────────────────────────────────────────────
delete from public.hr_hunt_role_rules;
insert into public.hr_hunt_role_rules (role, ord, slot) values
-- ⟦role-rules⟧
  ('healer', 0, '{"id":"d_greater_mend","action":{"type":"ability","id":"greater_mend","store":"plain_water_rune"},"conditions":[{"metric":"ally_hp_pct","op":"lt","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('healer', 1, '{"id":"d_circle_of_renewal","action":{"type":"ability","id":"circle_of_renewal","store":"plain_water_rune"},"conditions":[{"metric":"allies_below","op":"gte","value":2,"subject":"under_80"}],"join":"and"}'::jsonb),
  ('healer', 2, '{"id":"d_green_sickness","action":{"type":"ability","id":"green_sickness","store":"plain_poison_rune"},"conditions":[{"metric":"ally_hp_pct","op":"gte","value":70,"subject":"lowest"},{"metric":"self_mana_pct","op":"gte","value":80}],"join":"and"}'::jsonb),
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
  -- (d) the rows are the data's: 12, 5 roles, no weapon hero's rune spell on a default set
  if (select count(*) from public.hr_hunt_role_rules) <> 12 then
    raise exception 'VERIFY(d): % default slots, wanted 12', (select count(*) from public.hr_hunt_role_rules); end if;
  if (select count(distinct role) from public.hr_hunt_role_rules) <> 5 then raise exception 'VERIFY(d): a role lost its default set'; end if;
  if exists (select 1 from public.hr_hunt_role_rules where slot->'action'->>'id' in ('flame_strike', 'flame_volley', 'rend')) then
    raise exception 'VERIFY(d): a default set still holds a weapon hero''s rune spell'; end if;
  -- (e) the mana gates: a store-fed spell behind a core one fires only at the top of a fight (rule-subjects.js, measured)
  if not exists (select 1 from public.hr_hunt_role_rules where role = 'mage' and slot->'action'->>'id' = 'frost_lance'
       and slot->'conditions' @> '[{"metric":"self_mana_pct","op":"gte","value":70}]'::jsonb) then raise exception 'VERIFY(e): Frost Lance lost its mana gate'; end if;
  if not exists (select 1 from public.hr_hunt_role_rules where role = 'healer' and slot->'action'->>'id' = 'green_sickness'
       and slot->'conditions' @> '[{"metric":"self_mana_pct","op":"gte","value":80},{"metric":"ally_hp_pct","op":"gte","value":70}]'::jsonb) then raise exception 'VERIFY(e): Green Sickness lost its gates'; end if;
end $$;
