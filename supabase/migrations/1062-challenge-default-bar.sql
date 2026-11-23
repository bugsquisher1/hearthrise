-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1062-challenge-default-bar.sql — THE TANK'S DEFAULT CHALLENGE WAITS FOR "my HP is at least 60%"
-- (lane/moves-pass-1, systems-engineer, 2026-11-22; docs/design/redesign/23-spell-audit.md section 3 and section 9 step 1).
--
-- STATUS: supabase/migration-notes/1062-challenge-default-bar.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- hr_hunt_settings_view projects hr_hunt_role_rules as the bar of a hero whose bar holds no move of its own discipline. The move audit
-- (23 section 3, MEASURED on the real engine, Muster Barrows, Level 60, Steady, 6 paired seeds) found the Challenge fired every time it
-- could held the tank's four 63 steps shallower than no Challenge at all: it pulls every blow onto one hero, and the fall back reads the
-- lowest HP any hero reached. On "my HP is at least 60%" it kept 62% of that depth for a sixth of the supply bill. The row's suggested
-- condition is now that (src/data/abilities.js `trigger`), so a new tank's bar starts on it: the default slot carries it.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_hunt_role_rules   ⟦role-rules⟧ full replace from src/data/rule-subjects.js ROLE_RULES (pinned by
--                        tests/hunt-core/conditions.mjs sql-rows; 18 -> 18 rows, 5 roles): the tank's Challenge slot starts on
--                        self_hp_pct >= 60. Every other set is unchanged.
-- No function body, grant, signature, table or player row moves. A stored bar is the player's and is untouched.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None new. A default slot's condition, checked by the existing hr_hunt_slot_check.
--
-- REVERSIBILITY: re-apply §2 of 1027-spell-rule-default-bar.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_role_rules') is null or to_regclass('public.hr_hunt_abilities') is null
     or to_regprocedure('public.hr_hunt_slot_check(jsonb)') is null then
    raise exception 'PRECONDITION: hr_hunt_role_rules, hr_hunt_abilities and hr_hunt_slot_check must exist'; end if;
  if not exists (select 1 from public.hr_hunt_abilities where active and ability_id = 'challenge' and 'shield' = any (disciplines)) then
    raise exception 'PRECONDITION: hr_hunt_abilities lacks the shield''s active challenge'; end if;
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
  ('melee_dps', 1, '{"id":"d_turning_cut","action":{"type":"ability","id":"turning_cut"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":2}],"join":"and"}'::jsonb),
  ('melee_dps', 2, '{"id":"d_rend","action":{"type":"ability","id":"rend","store":"plain_rupture_rune"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 0, '{"id":"d_hunters_mark","action":{"type":"ability","id":"hunters_mark"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 1, '{"id":"d_precision_shot","action":{"type":"ability","id":"precision_shot"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 2, '{"id":"d_raking_shot","action":{"type":"ability","id":"raking_shot"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":3}],"join":"and"}'::jsonb),
  ('ranger', 3, '{"id":"d_flame_volley","action":{"type":"ability","id":"flame_volley","store":"plain_fire_rune"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":2}],"join":"and"}'::jsonb),
  ('tank', 0, '{"id":"d_challenge","action":{"type":"ability","id":"challenge"},"conditions":[{"metric":"self_hp_pct","op":"gte","value":60}],"join":"and"}'::jsonb),
  ('tank', 1, '{"id":"d_power_strike","action":{"type":"ability","id":"power_strike"},"conditions":[],"join":"and"}'::jsonb)
-- ⟦/role-rules⟧
;

-- ── §3 SELF-CHECK: the properties, by executing them ─────────────────────────
do $$
declare v jsonb; r record;
begin
  -- (a) every default slot passes the slot validator
  for r in select role, ord, slot from public.hr_hunt_role_rules order by role, ord loop
    v := public.hr_hunt_slot_check(r.slot);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the % default slot % is refused: %', r.role, r.ord, v; end if;
  end loop;
  -- (b) the rows are the data's: 18, 5 roles
  if (select count(*) from public.hr_hunt_role_rules) <> 18 then
    raise exception 'VERIFY(b): % default slots, wanted 18', (select count(*) from public.hr_hunt_role_rules); end if;
  if (select count(distinct role) from public.hr_hunt_role_rules) <> 5 then raise exception 'VERIFY(b): a role lost its default set'; end if;
  -- (c) THE CHALLENGE WAITS FOR THE TANK'S OWN HEALTH: the tank's set opens on the Challenge, and its slot fires only at 60% HP or more
  if (select string_agg(slot->'action'->>'id', ',' order by ord) from public.hr_hunt_role_rules where role = 'tank') <> 'challenge,power_strike' then
    raise exception 'VERIFY(c): the tank set is not Challenge, Power Strike'; end if;
  if (select slot->'conditions' from public.hr_hunt_role_rules where role = 'tank' and slot->'action'->>'id' = 'challenge')
     <> '[{"metric":"self_hp_pct","op":"gte","value":60}]'::jsonb then
    raise exception 'VERIFY(c): the Challenge''s default slot does not wait for 60%% HP'; end if;
end $$;
