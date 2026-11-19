-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — FLAME VOLLEY ON THE BOW'S DEFAULT BAR (lane/d-audit-fixes-sim,
-- systems-engineer, 2026-11-19; the balance audit's fix 7, PRIORITY_BOARD
-- "2026-11-19 Balance audit (real hunts)": every recorded Ranger casts it, no
-- default bar did). STAGED, NOT APPLIED. Pre-EA (CLAUDE.md §2): applies on its passing §3.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- hr_hunt_settings_view projects hr_hunt_role_rules as the bar of a hero whose bar
-- holds no move of its own discipline. The bow's set held no rune spell (off since
-- 10-29 for a fifth of net gold). Re-measured on set v0.2.141 (src/data/rule-subjects.js,
-- the comment above ROLE_RULES): a plain bow buying every use, alone at Level 1-31,
-- +11.6% Level XP for 148 casts and 366 g an hour, its net gold up 5.3%; in a four
-- the bow's own net falls 10.2% for +2.6% XP. The player still picks every supply on
-- the bar (Tyler 2026-10-21): this is the default an untouched bar plays.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_hunt_role_rules   ⟦role-rules⟧ full replace from src/data/rule-subjects.js
--                        ROLE_RULES (pinned by tests/hunt-core/conditions.mjs
--                        sql-rows; 17 -> 18 rows, 5 roles): ranger d_flame_volley
--                        LAST (after Raking Shot), its Plain Fire Rune (1 g a cast,
--                        own runes first), its suggested trigger (2+ in its area).
--                        The tank's and the sword's sets are untouched (Tyler 2026-11-19:
--                        no rune spell speeds up a tank way alone).
-- No function body, grant, signature, table or player row moves. A stored bar is
-- the player's and is untouched.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None new. A default slot; the store rune is bought per cast at the server's
-- price through the existing path (hr_hunt_basic_supplies, the settle's bill).
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- Any time after 2027-04-18-area-moves-bar.sql (the full replace it supersedes). The
-- live engine already casts Flame Volley from a stored slot; the client half (the same
-- ROLE_RULES row, read by the bar's defaults) rides the next release.
-- REVERSIBILITY: re-apply §2 of 2027-04-18-area-moves-bar.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_role_rules') is null or to_regclass('public.hr_hunt_abilities') is null
     or to_regclass('public.hr_hunt_basic_supplies') is null or to_regprocedure('public.hr_hunt_slot_check(jsonb)') is null
     or to_regprocedure('public.hr_hunt_rune_spells()') is null then
    raise exception 'PRECONDITION: hr_hunt_role_rules, hr_hunt_abilities, hr_hunt_basic_supplies, hr_hunt_slot_check and hr_hunt_rune_spells must exist'; end if;
  if not exists (select 1 from public.hr_hunt_abilities where active and ability_id = 'flame_volley') then
    raise exception 'PRECONDITION: hr_hunt_abilities lacks an active flame_volley'; end if;
  if public.hr_hunt_rune_spells()->'flame_volley'->'store' is null then
    raise exception 'PRECONDITION: hr_hunt_rune_spells() sells no store rune for Flame Volley'; end if;
end $mig$;

-- ── §2 THE ROLE DEFAULT SLOTS ────────────────────────────────────────────────
delete from public.hr_hunt_role_rules;
insert into public.hr_hunt_role_rules (role, ord, slot) values
-- ⟦role-rules⟧
  ('healer', 0, '{"id":"d_greater_mend","action":{"type":"ability","id":"greater_mend","store":"plain_water_rune"},"conditions":[{"metric":"ally_hp_pct","op":"lt","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('healer', 1, '{"id":"d_circle_of_renewal","action":{"type":"ability","id":"circle_of_renewal","store":"plain_water_rune"},"conditions":[{"metric":"allies_below","op":"gte","value":2,"subject":"under_80"}],"join":"and"}'::jsonb),
  ('healer', 2, '{"id":"d_green_sickness","action":{"type":"ability","id":"green_sickness","store":"plain_poison_rune"},"conditions":[{"metric":"ally_hp_pct","op":"gte","value":70,"subject":"lowest"},{"metric":"self_mana_pct","op":"gte","value":78}],"join":"and"}'::jsonb),
  ('healer', 3, '{"id":"d_undertow","action":{"type":"ability","id":"undertow","store":"plain_water_rune"},"conditions":[{"metric":"ally_hp_pct","op":"gte","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('healer', 4, '{"id":"d_spring_tide","action":{"type":"ability","id":"spring_tide","store":"plain_water_rune"},"conditions":[{"metric":"party_hp_pct","op":"lt","value":85},{"metric":"in_fight","op":"eq","value":true},{"metric":"self_mana_pct","op":"gte","value":50}],"join":"and"}'::jsonb),
  ('mage', 0, '{"id":"d_fireball","action":{"type":"ability","id":"fireball","store":"plain_fire_rune"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":2}],"join":"and"}'::jsonb),
  ('mage', 1, '{"id":"d_frost_lance","action":{"type":"ability","id":"frost_lance","store":"plain_ice_rune"},"conditions":[{"metric":"self_mana_pct","op":"gte","value":70}],"join":"and"}'::jsonb),
  ('mage', 2, '{"id":"d_arcane_barrier","action":{"type":"ability","id":"arcane_barrier","store":"plain_earth_rune"},"conditions":[{"metric":"self_hp_pct","op":"lt","value":85}],"join":"and"}'::jsonb),
  ('mage', 3, '{"id":"d_hoarfrost","action":{"type":"ability","id":"hoarfrost","store":"plain_ice_rune"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":2},{"metric":"self_mana_pct","op":"gte","value":70}],"join":"and"}'::jsonb),
  ('melee_dps', 0, '{"id":"d_power_strike","action":{"type":"ability","id":"power_strike"},"conditions":[],"join":"and"}'::jsonb),
  ('melee_dps', 1, '{"id":"d_cleave","action":{"type":"ability","id":"cleave"},"conditions":[],"join":"and"}'::jsonb),
  ('melee_dps', 2, '{"id":"d_turning_cut","action":{"type":"ability","id":"turning_cut"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":3}],"join":"and"}'::jsonb),
  ('ranger', 0, '{"id":"d_hunters_mark","action":{"type":"ability","id":"hunters_mark"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 1, '{"id":"d_precision_shot","action":{"type":"ability","id":"precision_shot"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 2, '{"id":"d_raking_shot","action":{"type":"ability","id":"raking_shot"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":3}],"join":"and"}'::jsonb),
  ('ranger', 3, '{"id":"d_flame_volley","action":{"type":"ability","id":"flame_volley","store":"plain_fire_rune"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":2}],"join":"and"}'::jsonb),
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
  -- (b) no rune spell without a store row of its own family
  select h.role, h.ord, h.slot into r from public.hr_hunt_role_rules h
    join public.hr_hunt_abilities a on a.ability_id = h.slot->'action'->>'id'
   where a.rune is not null and not exists (
     select 1 from public.hr_hunt_basic_supplies q where q.basic_id = h.slot->'action'->>'store' and q.partner = a.rune) limit 1;
  if found then raise exception 'VERIFY(b): the % default slot % is a rune spell with no store rune of its family: %', r.role, r.ord, r.slot; end if;
  -- (c) every default slot's move is one its role's disciplines can use
  select count(*) into v_n from public.hr_hunt_role_rules h
    join public.hr_hunt_abilities a on a.ability_id = h.slot->'action'->>'id'
   where not exists (select 1 from public.hr_hunt_weapon_roles w where h.role = any (w.roles) and w.discipline = any (a.disciplines));
  if v_n <> 0 then raise exception 'VERIFY(c): % default slots name a move no discipline of their role can use', v_n; end if;
  -- (d) the rows are the data's: 18, 5 roles; the area moves on their sets; the bow's set ends Raking Shot, Flame Volley
  if (select count(*) from public.hr_hunt_role_rules) <> 18 then
    raise exception 'VERIFY(d): % default slots, wanted 18', (select count(*) from public.hr_hunt_role_rules); end if;
  if (select count(distinct role) from public.hr_hunt_role_rules) <> 5 then raise exception 'VERIFY(d): a role lost its default set'; end if;
  for r in select * from (values ('melee_dps', 'turning_cut'), ('mage', 'hoarfrost'), ('healer', 'spring_tide')) x(role, id) loop
    if (select count(*) from public.hr_hunt_role_rules where slot->'action'->>'id' = r.id) <> 1
       or (select slot->'action'->>'id' from public.hr_hunt_role_rules where role = r.role order by ord desc limit 1) <> r.id then
      raise exception 'VERIFY(d): % is not the last slot of the % set', r.id, r.role; end if;
  end loop;
  if (select string_agg(slot->'action'->>'id', ',' order by ord) from (select slot, ord from public.hr_hunt_role_rules where role = 'ranger' order by ord desc limit 2) t)
     <> 'raking_shot,flame_volley' then
    raise exception 'VERIFY(d): the bow''s set does not end Raking Shot, Flame Volley'; end if;
  if (select count(*) from public.hr_hunt_role_rules where slot->'action'->>'id' = 'flame_volley') <> 1
     or (select slot->'action'->>'store' from public.hr_hunt_role_rules where role = 'ranger' and slot->'action'->>'id' = 'flame_volley') <> 'plain_fire_rune' then
    raise exception 'VERIFY(d): Flame Volley is not once on the bow''s set with the Plain Fire Rune'; end if;
  -- (e) no tank or sword-alone way casts a rune spell by default (Tyler 2026-11-19), and Rend stays the player's pick
  if exists (select 1 from public.hr_hunt_role_rules where slot->'action'->>'id' in ('flame_strike', 'rend')) then
    raise exception 'VERIFY(e): a default set holds Flame Strike or Rend'; end if;
end $$;
