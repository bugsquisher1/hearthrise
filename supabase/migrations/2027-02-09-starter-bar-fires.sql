-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — NO DEAD BUTTON ON THE STARTER BAR (lane/a-first-hour-leftovers,
-- systems-engineer, 2026-10-29). STAGED, NOT APPLIED. Pre-EA (CLAUDE.md §2):
-- applies on its passing §3; no value moves.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Playtest 2026-10-29 #9 (and 10-24 #4): every new hero's bar showed Flame
-- Strike struck "no Fire runes left" from minute one. The start kit carries no
-- rune (Tyler 2026-10-23) and Flame Strike's default slot named no store rune,
-- so the sword's default sets held a spell the hero could not cast. A store rune
-- on the default slot was measured and moves balance (rule-subjects.js), so the
-- spell leaves the default sets; the player adds it with the store rune on.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_hunt_role_rules   ⟦role-rules⟧ full replace from src/data/rule-subjects.js
--                        ROLE_RULES (pinned by tests/hunt-core/conditions.mjs
--                        sql-rows): d_flame_strike leaves the tank and Melee
--                        damage sets (16 -> 14 rows; ords re-packed).
-- No function body, grant, signature, table or player row moves. A stored bar is
-- the player's and is untouched; the settings view projects these rows only
-- for a bar that holds no ability of its own.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None. A catalogue of default slots the settings view and the settle read;
-- one slot fewer can only cast less (and the removed one never fired: no rune).
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- After 2027-02-08-unsourced-level-curve.generated.sql (the newest APPLIED).
-- EDGE: hr-accrue carries the same ROLE_RULES (src/data/rule-subjects.js rides
-- the payload); deploy it right after this file. Between the two the only
-- difference is a struck Flame Strike slot the settle never fires (no rune).
-- REVERSIBILITY: re-apply §2 of 2027-01-13-spell-roles.sql. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_role_rules') is null or to_regclass('public.hr_hunt_abilities') is null
     or to_regprocedure('public.hr_hunt_slot_check(jsonb)') is null then
    raise exception 'PRECONDITION: hr_hunt_role_rules, hr_hunt_abilities and hr_hunt_slot_check must exist'; end if;
  if not exists (select 1 from public.hr_hunt_abilities where ability_id = 'flame_strike' and rune is not null) then
    raise exception 'PRECONDITION: flame_strike is not a rune spell in hr_hunt_abilities (re-judge this file)'; end if;
end $mig$;

-- ── §2 THE ROLE DEFAULT SLOTS ────────────────────────────────────────────────
delete from public.hr_hunt_role_rules;
insert into public.hr_hunt_role_rules (role, ord, slot) values
-- ⟦role-rules⟧
  ('healer', 0, '{"id":"d_greater_mend","action":{"type":"ability","id":"greater_mend","store":"plain_water_rune"},"conditions":[{"metric":"ally_hp_pct","op":"lt","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
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
  -- (b) the start kit's set (sword and shield: the tank) holds no rune spell without a store rune
  -- (a sword alone plays the Melee set's sword slot, Power Strike: (c))
  select h.role, h.ord, h.slot into r from public.hr_hunt_role_rules h
    join public.hr_hunt_abilities a on a.ability_id = h.slot->'action'->>'id'
   where h.role = 'tank' and a.rune is not null and not (h.slot->'action' ? 'store') limit 1;
  if found then raise exception 'VERIFY(b): the % default slot % is a rune spell with no store rune: %', r.role, r.ord, r.slot; end if;
  -- (c) the rows are the data's: 14, Flame Strike in no default set, every role still holds a set
  if (select count(*) from public.hr_hunt_role_rules) <> 14 then
    raise exception 'VERIFY(c): % default slots, wanted 14', (select count(*) from public.hr_hunt_role_rules); end if;
  if exists (select 1 from public.hr_hunt_role_rules where slot->'action'->>'id' = 'flame_strike') then
    raise exception 'VERIFY(c): a default set still holds flame_strike'; end if;
  if (select count(distinct role) from public.hr_hunt_role_rules) <> 5 then raise exception 'VERIFY(c): a role lost its default set'; end if;
end $$;
