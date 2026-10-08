-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-08-content-holes.sql            STAGED — REVIEW ONLY, NOT APPLIED
--
-- TWO CATALOGUE ROWS, NO FUNCTION BODY, NO GRANT, NO NEW OBJECT:
--
--   §1(a) hr_quest_rewards — `farmhand` pays 5 carrot_seed, was 5 wheat_seed.
--   §1(b) hr_goal_rewards  — `wk_harvest` target 120 → 40. Gold, gems, xp and
--         items are UNTOUCHED.
--   §1(c) the START KIT — hr_start_inventory carrot_seed 3 → gone, turnip_seed
--         5 → 8; hr_start_kit.farm_plots 4 → 2. Only NEW characters read these.
--
-- (c) carrots need Farming 10, so a brand-new farmer opened the bag to three
--     seeds they could not plant. And hr_farm_plant caps a plot index at
--     (property tier + 1) x 2 = 2 at the camp, so the two extra player_farm
--     rows the kit seeded were plots the server refuses — the client drew four
--     plots and two of them answered `plot_cap`. Plots past the cap are created
--     on demand by the plant upsert when the property tier allows them. The
--     regenerated 2026-08-11-catalogue.generated.sql carries the same kit; this
--     moves only these rows so it can apply on its own at the cut.
--
-- ── WHY (game-designer, content-holes lane, 2026-10-08) ────────────────────
-- (a) farmhand completes after SIX harvests — around Farming 8 on the starting
--     camp's two plots — and paid wheat seed, which needs Farming 20. The
--     reward sat unplantable in the bag for days. Carrot (Farming 10) is the
--     next crop that player can actually sow; the start kit's three carrot
--     seeds (also unplantable on day one) became turnips in the same lane.
-- (b) "Harvest 120 crops" in a week is 60 harvests per plot on the camp's two
--     plots — a harvest every ~2.8 hours, day and night, for seven days. 40 is
--     roughly three harvest rounds a day, the cadence of a player who checks in
--     morning, noon and evening. The reward is unchanged, so the gold-per-week
--     a farmer can earn goes UP by exactly the difference between "never
--     finishes" and "finishes"; it is still one weekly, once per week.
--
-- ── WHAT CANNOT BE MINTED (for the Security review) ────────────────────────
-- Neither row adds a faucet. (a) swaps the item of a ONCE-EVER quest reward for
-- one of the same quantity and a LOWER book value (carrot_seed 10 g vs
-- wheat_seed's), behind the unchanged once-guard in hr_claim_quest__ungated.
-- (b) lowers a weekly GATE; the payout is the catalogued amount and the
-- once-per-week guard in hr_claim_goal__ungated is unchanged, so a forged
-- counter is still a gate and never a multiplier. No client value is read.
--
-- ── OWNERSHIP ──────────────────────────────────────────────────────────────
-- hr_quest_rewards: THIS FILE becomes the chain-end seed (delete + refill all
-- eight rows, the 2026-09-28-journeymans-road.sql shape, byte-identical except
-- the farmhand tuple), because tests/quest-reward-parity.mjs reads the LAST
-- file in schema-apply-order.json that seeds the table.
-- hr_goal_rewards: one row BY ID, accepting exactly the known-live (120) or the
-- ruled (40) target and RAISING on a third, the 2026-09-04-goal-gold-retune.sql
-- idiom. NEVER re-apply 2026-08-23-modal-goal-claims.sql to move it.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
--   update public.hr_quest_rewards set items = '{"wheat_seed": 5}' where quest_id = 'farmhand';
--   update public.hr_goal_rewards  set target = 120 where goal_id = 'wk_harvest';
--   update public.hr_start_kit set farm_plots = 4;
--   update public.hr_start_inventory set qty = 5 where item_id = 'turnip_seed';
--   insert into public.hr_start_inventory (item_id, qty) values ('carrot_seed', 3);
-- Already-credited carrot seeds are ordinary player rows and are left alone.
--
-- ⚠ ORDER: apply BEFORE the client push (legacy.js QUEST_DEFS / WEEKLY_GOAL_POOL
--   and src/data/goal-catalogue.js carry the ruled numbers). Pushed first, the
--   weekly bar would read 40 against a server still grading 120.
-- No begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends one batch).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS - FAIL CLOSED ─────────────────────────────────────────
do $$
declare
  v_n int;
  v_items jsonb;
begin
  if to_regclass('public.hr_quest_rewards') is null then
    raise exception 'PRECONDITION: hr_quest_rewards missing - apply 2026-09-28-journeymans-road.sql first';
  end if;
  if to_regclass('public.hr_goal_rewards') is null then
    raise exception 'PRECONDITION: hr_goal_rewards missing - apply 2026-08-23-modal-goal-claims.sql first';
  end if;
  select count(*) into v_n from public.hr_quest_rewards;
  if v_n <> 8 then
    raise exception 'PRECONDITION: hr_quest_rewards holds % row(s), expected the 8 of journeymans-road', v_n;
  end if;
  select items into v_items from public.hr_quest_rewards where quest_id = 'farmhand';
  if v_items is distinct from '{"wheat_seed": 5}'::jsonb and v_items is distinct from '{"carrot_seed": 5}'::jsonb then
    raise exception 'PRECONDITION: farmhand pays % - neither the known-live wheat nor the ruled carrot. '
                    'Production drifted; re-author rather than overwrite.', v_items;
  end if;
  if (select string_agg(item_id || ':' || qty::text, ',' order by item_id) from public.hr_start_inventory)
     not in ('carrot_seed:3,cooked_shrimp:20,shrimp:10,turnip_seed:5', 'cooked_shrimp:20,shrimp:10,turnip_seed:8') then
    raise exception 'PRECONDITION: hr_start_inventory is neither the known-live kit nor the ruled one - re-author';
  end if;
  if (select farm_plots from public.hr_start_kit) not in (4, 2) then
    raise exception 'PRECONDITION: hr_start_kit.farm_plots is neither 4 (live) nor 2 (ruled) - re-author';
  end if;
  if not exists (select 1 from public.hr_items where item_id = 'carrot_seed') then
    raise exception 'PRECONDITION: carrot_seed is not in hr_items - apply the catalogue first';
  end if;
  select count(*) into v_n from public.hr_goal_rewards
   where goal_id = 'wk_harvest' and target in (120, 40) and gold = 2000 and gems = 0
     and xp = '{"farming":600}'::jsonb and items = '{}'::jsonb;
  if v_n <> 1 then
    raise exception 'PRECONDITION: wk_harvest is not the known-live (120) or ruled (40) row with '
                    '2000 gold / farming 600 - production drifted; re-author rather than overwrite';
  end if;
end $$;

-- ── 1(a). hr_quest_rewards - THIS FILE NOW OWNS THE ROWS ────────────────────
delete from public.hr_quest_rewards;
insert into public.hr_quest_rewards (quest_id, items) values
  ('first_cook',  '{"shrimp": 30}'),
  ('first_blood', '{"turnip_seed": 5}'),
  ('farmhand',    '{"carrot_seed": 5}'),
  ('road_forge',   '{"iron_pickaxe": 1}'),
  ('road_craft',   '{"iron_axe": 1}'),
  ('road_cook',    '{"oak_rod": 1}'),
  ('road_hunt',    '{"bone_key": 1}'),
  ('road_harvest', '{"potato_seed": 10}');

-- ── 1(b). hr_goal_rewards - ONE ROW BY ID ──────────────────────────────────
update public.hr_goal_rewards
   set target = 40
 where goal_id = 'wk_harvest' and target is distinct from 40;

-- ── 1(c). THE START KIT ────────────────────────────────────────────────────
delete from public.hr_start_inventory where item_id = 'carrot_seed';
update public.hr_start_inventory set qty = 8 where item_id = 'turnip_seed' and qty is distinct from 8;
update public.hr_start_kit set farm_plots = 2 where farm_plots is distinct from 2;

-- ── 4. SELF-VERIFYING COMMIT GATE (executed, not markers) ──────────────────
do $$
declare
  v_n int;
begin
  -- (a) the eight rows, exactly, and every granted id real.
  select count(*) into v_n from public.hr_quest_rewards;
  if v_n <> 8 then raise exception '§4(a): hr_quest_rewards holds % rows, expected 8', v_n; end if;
  if (select items from public.hr_quest_rewards where quest_id = 'farmhand') is distinct from '{"carrot_seed": 5}'::jsonb then
    raise exception '§4(a): farmhand does not pay 5 carrot_seed';
  end if;
  select count(*) into v_n from public.hr_quest_rewards q, jsonb_each_text(q.items) e
   where not exists (select 1 from public.hr_items i where i.item_id = e.key);
  if v_n > 0 then raise exception '§4(a): % granted id(s) are not in hr_items', v_n; end if;
  select count(*) into v_n from public.hr_quest_rewards q where not public.hr_quest_rewards_items_ok(q.items);
  if v_n > 0 then raise exception '§4(a): % row(s) fail the items shape check', v_n; end if;
  -- (b) wk_harvest moved ONLY its target.
  select count(*) into v_n from public.hr_goal_rewards
   where goal_id = 'wk_harvest' and target = 40 and gold = 2000 and gems = 0 and weekly
     and counter_key = 'ev:harvest' and xp = '{"farming":600}'::jsonb and items = '{}'::jsonb;
  if v_n <> 1 then raise exception '§4(b): wk_harvest is not target 40 with its payout untouched'; end if;
  -- (c) the kit landed, every kit id is an item, and every kit seed is plantable
  --     at Farming 1 on a plot index the camp allows.
  if (select string_agg(item_id || ':' || qty::text, ',' order by item_id) from public.hr_start_inventory)
     <> 'cooked_shrimp:20,shrimp:10,turnip_seed:8' then
    raise exception '§4(c): the start inventory did not land';
  end if;
  if (select farm_plots from public.hr_start_kit) <> 2 then raise exception '§4(c): farm_plots is not 2'; end if;
  select count(*) into v_n from public.hr_start_inventory s
    join public.hr_crops c on c.seed_item = s.item_id
   where c.req_lv > 1;
  if v_n > 0 then raise exception '§4(c): the start kit carries % seed stack(s) a level-1 farmer cannot plant', v_n; end if;
  -- (d) the catalogue tables stay client-unwritable.
  if has_table_privilege('authenticated', 'public.hr_quest_rewards', 'INSERT,UPDATE,DELETE,TRUNCATE')
     or has_table_privilege('authenticated', 'public.hr_goal_rewards', 'INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception '§4(c): a client role can write a reward catalogue';
  end if;
  raise notice 'content-holes §4: farmhand -> 5 carrot_seed, wk_harvest -> 40, 8 quest rows, grants clean';
end $$;
