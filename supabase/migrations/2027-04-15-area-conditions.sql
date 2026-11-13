-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE AREA SPELLS' CONDITIONS (lane/b-area-engine, systems-engineer,
-- 2026-11-08; re-dated 2026-11-10 from 2027-03-22 and 2026-11-12 from 2027-03-28 by lane/b-area-set so it sorts
-- after main's 2027-04-14 files, nothing else changed). STAGED, NOT APPLIED. Pre-EA:
-- applies on its passing §2; the slot vocabulary is on the EA Security list with
-- the rest of the bar.
--
-- Tyler 2026-11-08: "make sure the conditions are available that make sense" (the
-- party heal and the monsters' area spells; design: the board's "2026-11-08 Area
-- spells" §2b). The engine (src/core/hunt/conditions.js) evaluates five new
-- metrics; the server's bar check must accept a slot that names them, or the bar a
-- player saves is refused while the screen offered it (CLAUDE.md §6).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_hunt_condition_metrics  ⟦metrics⟧ (src/data/condition-metrics.js), a full
--                              replace: party_hp_pct (the party's pooled HP %),
--                              enemy_casting (monsters winding up a spell whose
--                              mark covers me / anyone, subjects self | any, 0..8),
--                              in_fight (the fight is on), target_weak and
--                              target_resists (slot only: the slot's element against
--                              its aim); effect_missing's effect ids gain `chill`
--                              (src/data/statuses.js, Hoarfrost's slow). The other
--                              nine rows are unchanged.
-- Pinned equal to src/data by tests/hunt-core/conditions.mjs sql-rows (`node
-- tests/hunt-core/conditions.mjs --print`). No function body moves:
-- hr_hunt_cond_check reads every rule from these rows.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None to value. A condition only decides WHEN a bar slot fires inside the one
-- settle; the action, its cost and its effect are the engine's. The rows widen what
-- a condition may test, bounded (counts 0..8, bools eq only, two slot-only tests a
-- stop rule may not use). No table, grant, signature or player row moves.
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- Any time after 2027-01-13-spell-content.sql (the last full replace of this table).
-- It must apply BEFORE the client that offers the five conditions ships (the bar
-- check would refuse them), and with or before the hr-accrue deploy carrying the
-- engine that evaluates them (an older engine reads an unknown metric as false, so a
-- slot naming one would never fire). It ships in the area-spells combat batch,
-- FIRST of its three server files (rows only, and it pauses nothing):
--   1. 2027-04-15-area-conditions.sql                                   (this file)
--   2. 2027-04-15-area-spells-hunt-sessions-catalogue.generated.sql     (the four hero
--      abilities, the world's shape, the least spell windup: the shape MOVES)
--   3. 2027-04-15-area-spells-rune-spells.generated.sql                 (Hoarfrost, Spring Tide)
--   then the hr-accrue deploy AT ONCE, then the client that draws the warning marks.
-- REVERSIBILITY: re-apply the ⟦metrics⟧ block of 2027-01-13-spell-content.sql.
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_condition_metrics') is null
     or to_regprocedure('public.hr_hunt_conds_check(jsonb,jsonb,boolean)') is null
     or to_regprocedure('public.hr_hunt_cond_check(jsonb,boolean)') is null then
    raise exception 'PRECONDITION: the action-conditions catalogue and its checks must exist (2026-10-25-action-conditions.sql)'; end if;
  if not exists (select 1 from public.hr_hunt_condition_metrics where metric = 'effect_missing' and 'sickness' = any(vals)) then
    raise exception 'PRECONDITION: apply 2027-01-13-spell-content.sql first (effect_missing offers sickness)'; end if;
end $mig$;

-- ── §1 THE CONDITION METRICS ─────────────────────────────────────────────────
delete from public.hr_hunt_condition_metrics;
insert into public.hr_hunt_condition_metrics (metric, kind, ops, lo, hi, subjects, slot_only, vals) values
-- ⟦metrics⟧
  ('self_hp_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, '{}'::text[], false, '{}'::text[]),
  ('self_mana_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, '{}'::text[], false, '{}'::text[]),
  ('ally_hp_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, array['lowest', 'self', 'tank', 'melee_dps', 'ranger', 'mage', 'healer']::text[], false, '{}'::text[]),
  ('ally_mana_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, array['lowest', 'self', 'tank', 'melee_dps', 'ranger', 'mage', 'healer']::text[], false, '{}'::text[]),
  ('allies_below', 'count', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 5, array['under_50', 'under_60', 'under_70', 'under_80', 'under_90']::text[], false, '{}'::text[]),
  ('enemies_in_aoe', 'count', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 25, '{}'::text[], true, '{}'::text[]),
  ('party_hp_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, '{}'::text[], false, '{}'::text[]),
  ('enemy_casting', 'count', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 8, array['self', 'any']::text[], false, '{}'::text[]),
  ('in_fight', 'bool', array['eq']::text[], null, null, '{}'::text[], false, '{}'::text[]),
  ('target_weak', 'bool', array['eq']::text[], null, null, '{}'::text[], true, '{}'::text[]),
  ('target_resists', 'bool', array['eq']::text[], null, null, '{}'::text[], true, '{}'::text[]),
  ('target_is_boss', 'bool', array['eq']::text[], null, null, '{}'::text[], false, '{}'::text[]),
  ('item_qty', 'count', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100000, array['item', 'food', 'drink', 'ammo']::text[], false, '{}'::text[]),
  ('effect_missing', 'effect', array['has_effect', 'lacks_effect']::text[], null, null, array['target', 'self', 'ally']::text[], false, array['bleed', 'sickness', 'chill']::text[])
-- ⟦/metrics⟧
;

-- ── §2 SELF-CHECK: the properties, by executing them ─────────────────────────
do $$
declare v jsonb; t text;
begin
  -- (a) every new condition, as Configure action writes it, is accepted on a bar slot
  v := public.hr_hunt_conds_check('[{"metric":"party_hp_pct","op":"lt","value":60},{"metric":"enemy_casting","op":"gte","value":1,"subject":"self"},{"metric":"in_fight","op":"eq","value":true}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(a): the party, a cast at me and the fight were refused: %', v; end if;
  v := public.hr_hunt_conds_check('[{"metric":"enemy_casting","op":"gte","value":1,"subject":"any"},{"metric":"target_weak","op":"eq","value":true},{"metric":"target_resists","op":"eq","value":false}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(a): a cast at anyone or the element tests were refused: %', v; end if;
  -- (b) a Chill condition is accepted; an effect nobody has is not
  v := public.hr_hunt_conds_check('[{"metric":"effect_missing","op":"lacks_effect","value":"chill","subject":"target"}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(b): a Chill condition was refused: %', v; end if;
  t := public.hr_hunt_cond_check('{"metric":"effect_missing","op":"has_effect","value":"frostbite","subject":"target"}'::jsonb, false);
  if t is distinct from 'bad_value' then raise exception 'VERIFY(b): an unknown effect answered %', t; end if;
  -- (c) a stop rule may test the party, a cast and the fight, never a slot-only element test
  v := public.hr_hunt_conds_check('[{"metric":"party_hp_pct","op":"lt","value":30},{"metric":"enemy_casting","op":"gte","value":2,"subject":"any"},{"metric":"in_fight","op":"eq","value":false}]'::jsonb, '"or"'::jsonb, true);
  if v is not null then raise exception 'VERIFY(c): a stop rule on the party, a cast or the fight was refused: %', v; end if;
  t := public.hr_hunt_cond_check('{"metric":"target_weak","op":"eq","value":true}'::jsonb, true);
  if t is distinct from 'bad_metric' then raise exception 'VERIFY(c): a stop rule on target_weak answered %', t; end if;
  -- (d) the bounds bite: a count past 8, a subject nobody is, a bool written as a number, an operator a bool lacks
  t := public.hr_hunt_cond_check('{"metric":"enemy_casting","op":"gte","value":9,"subject":"self"}'::jsonb, false);
  if t is distinct from 'bad_value' then raise exception 'VERIFY(d): enemy_casting 9 answered %', t; end if;
  t := public.hr_hunt_cond_check('{"metric":"enemy_casting","op":"gte","value":1,"subject":"everyone"}'::jsonb, false);
  if t is distinct from 'bad_subject' then raise exception 'VERIFY(d): an unknown subject answered %', t; end if;
  t := public.hr_hunt_cond_check('{"metric":"in_fight","op":"eq","value":1}'::jsonb, false);
  if t is distinct from 'bad_value' then raise exception 'VERIFY(d): in_fight 1 answered %', t; end if;
  t := public.hr_hunt_cond_check('{"metric":"in_fight","op":"ne","value":true}'::jsonb, false);
  if t is distinct from 'bad_op' then raise exception 'VERIFY(d): in_fight ne answered %', t; end if;
  t := public.hr_hunt_cond_check('{"metric":"party_hp_pct","op":"lt","value":101}'::jsonb, false);
  if t is distinct from 'bad_value' then raise exception 'VERIFY(d): party_hp_pct 101 answered %', t; end if;
  -- (e) the nine rows before stand as they were (fourteen in all), and the old bleed test still passes
  if (select count(*) from public.hr_hunt_condition_metrics) <> 14 then
    raise exception 'VERIFY(e): % metric rows, want 14', (select count(*) from public.hr_hunt_condition_metrics); end if;
  v := public.hr_hunt_conds_check('[{"metric":"effect_missing","op":"has_effect","value":"bleed","subject":"target"},{"metric":"ally_hp_pct","op":"lt","value":70,"subject":"self"}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(e): an old condition was refused: %', v; end if;
end $$;
