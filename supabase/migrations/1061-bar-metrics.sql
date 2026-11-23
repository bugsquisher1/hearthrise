-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1061-bar-metrics.sql — THE ROADS' FOUR BAR TESTS (lane/bar-metrics, Systems 2026-11-22).
--
-- STATUS: supabase/migration-notes/1061-bar-metrics.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- WHY (docs/design/redesign/18-roads-review.md §3 item 4, §9 step 1): the action bar could not test a target's
-- health, a Hunter's Mark, Bleed stacks or the last move cast, which left 11+ talent nodes with nothing to build
-- a bar around. src/data/condition-metrics.js gains four rows; this file restates the server's copy:
--   hr_hunt_condition_metrics  ⟦metrics⟧, a full replace (generated: `node tests/hunt-core/conditions.mjs --print`,
--                              pinned equal by its sql-rows case):
--     target_hp_pct   pct 0..100   my target's HP
--     target_marked   bool         my target carries a running Hunter's Mark
--     target_stacks   count 0..5   stacks of a stacking status on my target (subjects: the stacking statuses, Bleed)
--     last_move       move         my last move on the slot's lane (eq / ne an ability id; vals: every ability id)
--   its `kind` check widens by one word, 'move' (a named value: hr_hunt_cond_check's last branch already reads any
--   kind that is not pct, count or bool as "one of vals", so no function body moves).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None to value. A condition decides only WHEN a bar slot fires inside the one settle; the action, its cost and its
-- effect are the engine's. Every value is bounded (a percent 0..100, stacks 0..5, a move one of the catalogue's
-- ability ids). No table, grant, signature or player row moves.
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- Any time after 2027-04-15-area-conditions.sql (the last full replace of these rows). It must apply BEFORE the client
-- that offers the four ships (the bar check would refuse them), and with or before the hr-accrue deploy whose engine
-- evaluates them (an older engine drops a slot naming an unknown metric: conditions.js heroSlots keeps only valid slots).
-- That engine also persists a unit's `lastMove` (the world's shape moves): the shape row is folded into the STAGED
-- 1058-hunting-blocks-hunt-sessions-catalogue.generated.sql, which applies with that deploy (hunts pause world_shape_pending
-- between the two, as at every shape move).
-- REVERSIBILITY: re-apply the ⟦metrics⟧ block of 2027-04-15-area-conditions.sql (the 'move' word may stay).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_condition_metrics') is null
     or to_regprocedure('public.hr_hunt_conds_check(jsonb,jsonb,boolean)') is null
     or to_regprocedure('public.hr_hunt_cond_check(jsonb,boolean)') is null then
    raise exception 'PRECONDITION: the action-conditions catalogue and its checks must exist (2026-10-25-action-conditions.sql)'; end if;
  if not exists (select 1 from public.hr_hunt_condition_metrics where metric = 'enemy_casting') then
    raise exception 'PRECONDITION: apply 2027-04-15-area-conditions.sql first (the area conditions)'; end if;
end $mig$;

-- ── §1 THE KIND WORD 'move' ──────────────────────────────────────────────────
-- (the column check was written inline: dropped by what it reads, re-added under the name Postgres gave it)
do $mig$
declare v_c text;
begin
  for v_c in select c.conname from pg_constraint c
             where c.conrelid = 'public.hr_hunt_condition_metrics'::regclass and c.contype = 'c'
               and pg_get_constraintdef(c.oid) like '%kind = ANY%' and pg_get_constraintdef(c.oid) not like '%lo IS NOT NULL%' loop
    execute format('alter table public.hr_hunt_condition_metrics drop constraint %I', v_c);
  end loop;
end $mig$;
alter table public.hr_hunt_condition_metrics add constraint hr_hunt_condition_metrics_kind_check
  check (kind in ('pct', 'count', 'bool', 'effect', 'move'));

-- ── §2 THE CONDITION METRICS ─────────────────────────────────────────────────
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
  ('effect_missing', 'effect', array['has_effect', 'lacks_effect']::text[], null, null, array['target', 'self', 'ally']::text[], false, array['bleed', 'sickness', 'chill']::text[]),
  ('target_hp_pct', 'pct', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 100, '{}'::text[], false, '{}'::text[]),
  ('target_marked', 'bool', array['eq']::text[], null, null, '{}'::text[], false, '{}'::text[]),
  ('target_stacks', 'count', array['lt', 'lte', 'gt', 'gte', 'eq', 'ne']::text[], 0, 5, array['bleed']::text[], false, '{}'::text[]),
  ('last_move', 'move', array['eq', 'ne']::text[], null, null, '{}'::text[], false, array['challenge', 'frost_slam', 'shelter', 'flame_strike', 'power_strike', 'turning_cut', 'rend', 'quarry_blow', 'hunters_mark', 'flame_volley', 'precision_shot', 'raking_shot', 'fireball', 'frost_lance', 'hoarfrost', 'arcane_barrier', 'greater_mend', 'circle_of_renewal', 'spring_tide', 'green_sickness', 'protective_ward', 'undertow', 'mend']::text[])
-- ⟦/metrics⟧
;

-- ── §3 SELF-CHECK: the properties, by executing them ─────────────────────────
do $$
declare v jsonb; t text;
begin
  -- (a) the four, as Configure action writes them, are accepted on a bar slot
  v := public.hr_hunt_conds_check('[{"metric":"target_hp_pct","op":"lt","value":30},{"metric":"target_marked","op":"eq","value":true},{"metric":"target_stacks","op":"gte","value":3,"subject":"bleed"}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(a): target health, a Mark or Bleed stacks were refused: %', v; end if;
  v := public.hr_hunt_conds_check('[{"metric":"last_move","op":"eq","value":"quarry_blow"},{"metric":"last_move","op":"ne","value":"rend"}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(a): a last move was refused: %', v; end if;
  -- (b) a stop rule may read them (none is slot only)
  v := public.hr_hunt_conds_check('[{"metric":"target_hp_pct","op":"lte","value":10},{"metric":"last_move","op":"eq","value":"mend"}]'::jsonb, '"or"'::jsonb, true);
  if v is not null then raise exception 'VERIFY(b): a stop rule on target health or a last move was refused: %', v; end if;
  -- (c) the bounds bite: a move nobody has, a move written as a number, an operator a move lacks, stacks past 5,
  --     a status that does not stack, a percent past 100, a Mark written as a number
  t := public.hr_hunt_cond_check('{"metric":"last_move","op":"eq","value":"meteor"}'::jsonb, false);
  if t is distinct from 'bad_value' then raise exception 'VERIFY(c): an unknown move answered %', t; end if;
  t := public.hr_hunt_cond_check('{"metric":"last_move","op":"eq","value":1}'::jsonb, false);
  if t is distinct from 'bad_value' then raise exception 'VERIFY(c): a move as a number answered %', t; end if;
  t := public.hr_hunt_cond_check('{"metric":"last_move","op":"gt","value":"rend"}'::jsonb, false);
  if t is distinct from 'bad_op' then raise exception 'VERIFY(c): last_move gt answered %', t; end if;
  t := public.hr_hunt_cond_check('{"metric":"target_stacks","op":"gte","value":6,"subject":"bleed"}'::jsonb, false);
  if t is distinct from 'bad_value' then raise exception 'VERIFY(c): 6 stacks answered %', t; end if;
  t := public.hr_hunt_cond_check('{"metric":"target_stacks","op":"gte","value":1,"subject":"chill"}'::jsonb, false);
  if t is distinct from 'bad_subject' then raise exception 'VERIFY(c): Chill stacks answered %', t; end if;
  t := public.hr_hunt_cond_check('{"metric":"target_hp_pct","op":"lt","value":101}'::jsonb, false);
  if t is distinct from 'bad_value' then raise exception 'VERIFY(c): target health 101 answered %', t; end if;
  t := public.hr_hunt_cond_check('{"metric":"target_marked","op":"eq","value":1}'::jsonb, false);
  if t is distinct from 'bad_value' then raise exception 'VERIFY(c): a Mark as a number answered %', t; end if;
  -- (d) the fourteen rows before stand (eighteen in all), and an old condition still passes; the kind check holds
  if (select count(*) from public.hr_hunt_condition_metrics) <> 18 then
    raise exception 'VERIFY(d): % metric rows, want 18', (select count(*) from public.hr_hunt_condition_metrics); end if;
  v := public.hr_hunt_conds_check('[{"metric":"effect_missing","op":"has_effect","value":"bleed","subject":"target"},{"metric":"enemy_casting","op":"gte","value":1,"subject":"any"}]'::jsonb, '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(d): an old condition was refused: %', v; end if;
  begin
    insert into public.hr_hunt_condition_metrics (metric, kind, ops, lo, hi, subjects, slot_only, vals)
      values ('zz_probe', 'colour', array['eq']::text[], null, null, '{}'::text[], false, '{}'::text[]);
    raise exception 'VERIFY(d): a kind outside the five words was stored';
  exception when check_violation then null;
  end;
end $$;
