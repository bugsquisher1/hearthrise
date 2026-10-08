-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-08-content-holes.sql            STAGED — REVIEW ONLY, NOT APPLIED
--
-- TWO CATALOGUE ROWS, NO FUNCTION BODY, NO GRANT, NO NEW OBJECT:
--
--   §1(a) hr_quest_rewards — `farmhand` pays 5 carrot_seed, was 5 wheat_seed.
--   §1(b) hr_goal_rewards  — `wk_harvest` target 120 → 40. Gold, gems, xp and
--         items are UNTOUCHED.
--
-- Everything else the content-holes lane moved on the server (new items and
-- activities, the start kit, three wield gates, crop/plot-tier and dungeon
-- rows) is DATA in a generated catalogue and ships in the three append-only
-- generated deltas that follow this file in the apply order
-- (2026-10-08-{catalogue,dungeon-catalogue,farm-catalogues}.delta.generated.sql).
-- These two rows live here because their tables are hand-authored, not
-- generated.
--
-- ── WHY (game-designer, content-holes lane, 2026-10-08) ────────────────────
-- (a) farmhand completes after SIX harvests — around Farming 8 on the starting
--     camp's two plots — and paid wheat seed, which needs Farming 20. The
--     reward sat unplantable in the bag for days. Carrot (Farming 10) is the
--     next crop that player can actually sow.
-- (b) "Harvest 120 crops" in a week is 60 harvests per plot on the camp's two
--     plots — one every ~2.8 hours, day and night, for seven days. 40 is about
--     three harvest rounds a day. The reward is unchanged; it is still one
--     weekly, once per week.
--
-- ── WHAT CANNOT BE MINTED (for the Security review) ────────────────────────
-- (a) swaps the item of a ONCE-EVER quest reward for one of the same quantity
--     and a LOWER book value, behind the unchanged once-guard in
--     hr_claim_quest__ungated. (b) lowers a weekly GATE; the payout is the
--     catalogued amount and the once-per-week guard in hr_claim_goal__ungated
--     is unchanged, so a forged counter is still a gate, never a multiplier.
--     No client value is read.
--
-- ── OWNERSHIP ──────────────────────────────────────────────────────────────
-- hr_quest_rewards: THIS FILE becomes the chain-end seed (delete + refill all
-- eight rows, the 2026-09-28-journeymans-road.sql shape, byte-identical except
-- the farmhand tuple) — tests/quest-reward-parity.mjs reads the LAST file in
-- tests/schema-apply-order.json that seeds the table.
-- hr_goal_rewards: one row BY ID, accepting exactly the known-live (120) or the
-- ruled (40) target and RAISING on a third, the 2026-09-04-goal-gold-retune.sql
-- idiom. NEVER re-apply 2026-08-23-modal-goal-claims.sql to move it.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
--   update public.hr_quest_rewards set items = '{"wheat_seed": 5}' where quest_id = 'farmhand';
--   update public.hr_goal_rewards  set target = 120 where goal_id = 'wk_harvest';
-- Already-credited carrot seeds are ordinary player rows and are left alone.
--
-- ⚠ ORDER: apply BEFORE the client push (legacy.js QUEST_DEFS / WEEKLY_GOAL_POOL
--   and src/data/goal-catalogue.js carry the ruled numbers).
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

-- ── 4. SELF-VERIFYING COMMIT GATE (executed, not markers) ──────────────────
do $$
declare
  v_n int;
begin
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
  select count(*) into v_n from public.hr_goal_rewards
   where goal_id = 'wk_harvest' and target = 40 and gold = 2000 and gems = 0 and weekly
     and counter_key = 'ev:harvest' and xp = '{"farming":600}'::jsonb and items = '{}'::jsonb;
  if v_n <> 1 then raise exception '§4(b): wk_harvest is not target 40 with its payout untouched'; end if;
  if has_table_privilege('authenticated', 'public.hr_quest_rewards', 'INSERT,UPDATE,DELETE,TRUNCATE')
     or has_table_privilege('authenticated', 'public.hr_goal_rewards', 'INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception '§4(c): a client role can write a reward catalogue';
  end if;
  raise notice 'content-holes §4: farmhand -> 5 carrot_seed, wk_harvest -> 40, 8 quest rows, grants clean';
end $$;
