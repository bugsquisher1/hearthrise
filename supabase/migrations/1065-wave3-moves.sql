-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1065-wave3-moves.sql — WAVE 3'S BAR TEST AND MOVES (lane/moves-wave-3, Systems 2026-11-23).
--
-- STATUS: supabase/migration-notes/1065-wave3-moves.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- WHY (docs/design/redesign/23-spell-audit.md sections 4 and 7, wave 3): the hammer's Stagger (Quarry Blow reworked) ends a monster's
-- wind-up, the sword's Parry nulls its next blow, and the axes' Gash cuts every monster beside them. Stagger and Parry start on one new
-- bar test, "my target is winding up". src/data/condition-metrics.js gains the row and the moves follow the ability table; this file
-- restates the server's copy:
--   hr_hunt_condition_metrics  ⟦metrics⟧, a full replace (generated: `node tests/hunt-core/conditions.mjs --print`, pinned equal by its
--                              sql-rows case):
--     target_winding_up  bool  my own target is winding up a spell or a heavy blow (its persisted `cast`, src/core/hunt/conditions.js)
--     last_move          move  its vals follow the ability table: quarry_blow out, stagger, parry and gash in
--     effect_missing     effect its vals gain parried (statuses.js: Parry's status, met by players, so a bar may test it)
--   No kind word, function body, table, grant or signature moves: a bool, a move and an effect are kinds 1061 already reads.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None to value. A condition decides only WHEN a bar slot fires inside the one settle; the action, its cost and its effect are the
-- engine's. Every value is bounded (a bool, a move one of the catalogue's ability ids, an effect one of the player-met statuses).
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- Any time after 1061-bar-metrics.sql (the last full replace of these rows). It must apply BEFORE the client that offers the three
-- moves (the bar check would refuse a slot on the new test, or a last move naming them), and with or before the hr-accrue deploy whose
-- engine evaluates target_winding_up (an older engine drops a slot naming a metric it lacks: conditions.js heroSlots keeps only valid
-- slots). Beside 1065-wave3-moves-rune-spells.generated.sql, independent of it.
-- REVERSIBILITY: re-apply the ⟦metrics⟧ block of 1061-bar-metrics.sql.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_condition_metrics') is null
     or to_regprocedure('public.hr_hunt_conds_check(jsonb,jsonb,boolean)') is null
     or to_regprocedure('public.hr_hunt_cond_check(jsonb,boolean)') is null then
    raise exception 'PRECONDITION: the action-conditions catalogue and its checks must exist (2026-10-25-action-conditions.sql)'; end if;
  if not exists (select 1 from public.hr_hunt_condition_metrics where metric = 'last_move') then
    raise exception 'PRECONDITION: apply 1061-bar-metrics.sql first (the Roads'' four, the move kind)'; end if;
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
  ('effect_missing', 'effect', array['has_effect', 'lacks_effect']::text[], null, null, array['target', 'self', 'ally']::text[], false, array['bleed', 'sickness', 'parried', 'chill']::text[]),
  ('target_hp_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, '{}'::text[], false, '{}'::text[]),
  ('target_marked', 'bool', array['eq']::text[], null, null, '{}'::text[], false, '{}'::text[]),
  ('target_winding_up', 'bool', array['eq']::text[], null, null, '{}'::text[], false, '{}'::text[]),
  ('target_stacks', 'count', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 5, array['bleed']::text[], false, '{}'::text[]),
  ('last_move', 'move', array['eq', 'ne']::text[], null, null, '{}'::text[], false, array['challenge', 'frost_slam', 'shelter', 'flame_strike', 'power_strike', 'parry', 'turning_cut', 'rend', 'gash', 'stagger', 'hunters_mark', 'flame_volley', 'precision_shot', 'raking_shot', 'fireball', 'frost_lance', 'hoarfrost', 'arcane_barrier', 'greater_mend', 'circle_of_renewal', 'spring_tide', 'green_sickness', 'protective_ward', 'undertow', 'mend']::text[])
-- ⟦/metrics⟧
;

-- ── §2 SELF-CHECK: the properties, by executing them ─────────────────────────
do $$
declare v jsonb; t text;
begin
  -- (a) Stagger's and Parry's starting rule, as Configure action writes it, is accepted on a bar slot and in a stop rule
  v := public.hr_hunt_conds_check('[{"metric":"target_winding_up","op":"eq","value":true}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(a): my target winding up was refused: %', v; end if;
  v := public.hr_hunt_conds_check('[{"metric":"target_winding_up","op":"eq","value":false}]'::jsonb, '"or"'::jsonb, true);
  if v is not null then raise exception 'VERIFY(a): a stop rule on a wind-up was refused: %', v; end if;
  -- (b) the moves follow the table: the three new ones are last moves, Quarry Blow no longer is; Parried is an effect a bar may test
  v := public.hr_hunt_conds_check('[{"metric":"last_move","op":"eq","value":"stagger"},{"metric":"last_move","op":"ne","value":"parry"},{"metric":"last_move","op":"ne","value":"gash"}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(b): a wave-3 last move was refused: %', v; end if;
  t := public.hr_hunt_cond_check('{"metric":"last_move","op":"eq","value":"quarry_blow"}'::jsonb, false);
  if t is distinct from 'bad_value' then raise exception 'VERIFY(b): Quarry Blow, reworked into Stagger, still answered %', t; end if;
  v := public.hr_hunt_conds_check('[{"metric":"effect_missing","op":"lacks_effect","value":"parried","subject":"target"}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(b): Parried as an effect was refused: %', v; end if;
  -- (c) the bounds bite: a wind-up written as a number, an operator a bool lacks
  t := public.hr_hunt_cond_check('{"metric":"target_winding_up","op":"eq","value":1}'::jsonb, false);
  if t is distinct from 'bad_value' then raise exception 'VERIFY(c): a wind-up as a number answered %', t; end if;
  t := public.hr_hunt_cond_check('{"metric":"target_winding_up","op":"ne","value":true}'::jsonb, false);
  if t is distinct from 'bad_op' then raise exception 'VERIFY(c): target_winding_up ne answered %', t; end if;
  -- (d) the eighteen rows before stand (nineteen in all), and every move the catalogue holds is a last move
  if (select count(*) from public.hr_hunt_condition_metrics) <> 19 then
    raise exception 'VERIFY(d): % metric rows, want 19', (select count(*) from public.hr_hunt_condition_metrics); end if;
  select string_agg(a.ability_id, ', ') into t from public.hr_hunt_abilities a
   where not (a.ability_id = any ((select m.vals from public.hr_hunt_condition_metrics m where m.metric = 'last_move')::text[]));
  if t is not null then raise exception 'VERIFY(d): catalogue moves that are no last move: %', t; end if;
  v := public.hr_hunt_conds_check('[{"metric":"target_marked","op":"eq","value":true},{"metric":"enemy_casting","op":"gte","value":1,"subject":"any"}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(d): an old condition was refused: %', v; end if;
  raise notice 'wave-3 bar test OK: % metric rows', (select count(*) from public.hr_hunt_condition_metrics);
end $$;
