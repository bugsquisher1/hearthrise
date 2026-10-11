-- 2026-10-16-first-day-seeds.sql — W0 first hour: no dead seed on day one.
--
-- ⚠ LANE C. Security review BEFORE apply (it moves what a quest pays and what a
-- new character is granted). The Coordinator applies with
-- `node tools/apply-migration.mjs supabase/migrations/2026-10-16-first-day-seeds.sql`.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY (Game Designer, coherence audit 2026-10-09, Top-10 #4)
-- ══════════════════════════════════════════════════════════════════════════
-- The starting kit carried `carrot_seed: 3`. Carrots need Farming 10 and a plot
-- upgrade, so those seeds were a dead item on day one. And the first harvest step
-- (`farmhand`) paid 5 wheat seeds, which need Farming 20.
--     hr_start_inventory   carrot_seed 3 -> (gone);  turnip_seed 5 -> 8
--     hr_quest_rewards     farmhand {"wheat_seed": 5} -> {"carrot_seed": 5}
-- Every seed a fresh character holds is now plantable at Farming 1, and the first
-- harvest pays the NEXT crop on the ladder (carrots, Farming 10), not one two rungs up.
--
-- Authoring sources (the client never mints either):
--   kit     src/data/start-kit.js START_INVENTORY  (2026-08-11-catalogue.generated.sql
--           regenerated in the same commit, so a REBUILD lands the same rows; the
--           2026-09-03 food-bridge file accepts that rebuild shape as a no-op)
--   reward  src/data/goal-catalogue.js QUEST_REWARDS.farmhand.items, bound to
--           legacy.js QUEST_DEFS and to THIS seed by tests/quest-reward-parity.mjs.
--
-- Gold is untouched: no quest's gold changes, so hr_claim_quest__ungated's CASE
-- catalogue (2026-09-28-journeymans-road.sql) is NOT restated and no function body
-- moves. live-hash-drift wants nothing for this file.
--
-- ── OWNERSHIP ──────────────────────────────────────────────────────────────
--   This file now OWNS hr_quest_rewards' ROWS (delete + refill, all 8; the other 7
--   byte-identical to 2026-09-28) and the four hr_start_inventory rows' shape. It
--   does not touch either table's definition, constraint, RLS or grants.
--
-- ── WHAT AN EXISTING CHARACTER SEES ────────────────────────────────────────
--   Nothing is re-granted or taken back. hr_start_inventory is read once, at
--   creation. A character that already claimed farmhand keeps its wheat seeds;
--   one that has not will be paid carrot seeds by the same once-guarded claim.
--   (The beta is wiped at EA; this is correct-by-design, not a migration.)
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
--   update public.hr_quest_rewards set items = '{"wheat_seed": 5}' where quest_id = 'farmhand';
--   update public.hr_start_inventory set qty = 5 where item_id = 'turnip_seed';
--   insert into public.hr_start_inventory (item_id, qty) values ('carrot_seed', 3);
--   and revert start-kit.js / goal-catalogue.js / legacy.js QUEST_DEFS in lockstep.
--
-- RE-RUNNABLE: §0 accepts the pre-state OR the post-state of both tables, so a
-- second apply (or a rebuild, whose regenerated catalogue already holds the new
-- kit) is a no-op that still runs the §4 proof.
-- ==========================================================================

-- ── 0. PRECONDITIONS - FAIL CLOSED ─────────────────────────────────────────
do $$
declare
  v_now text;
  v_n   int;
begin
  if to_regclass('public.hr_quest_rewards') is null then
    raise exception 'PRECONDITION: hr_quest_rewards is absent - apply 2026-09-06-quest-item-rewards.sql first';
  end if;
  if to_regclass('public.hr_start_inventory') is null then
    raise exception 'PRECONDITION: hr_start_inventory is absent - apply 2026-08-11-catalogue.generated.sql first';
  end if;
  if to_regprocedure('public.hr_claim_quest__ungated(text,integer)') is null then
    raise exception 'PRECONDITION: hr_claim_quest__ungated(text,int) is absent';
  end if;
  if to_regprocedure('public.hr_create_character(integer)') is null then
    raise exception 'PRECONDITION: hr_create_character(int) is absent';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: hr_assert_grant_hygiene(boolean) is absent - the §4 hygiene proof cannot run';
  end if;

  -- (i) the kit is EXACTLY the 2026-09-03 food-bridge kit, or EXACTLY this file's.
  --     A third shape is someone else's change; stop rather than overwrite it.
  select coalesce(string_agg(item_id || ':' || qty::text, ',' order by item_id), '(empty)')
    into v_now from public.hr_start_inventory;
  -- COMBINED W0 SHAPE (lane w0e, 2026-10-10): the chain-end kit also carries the
  -- three free tier-1 ammo stacks (2026-10-16-w0e-ammo-runecraft.sql, applied
  -- AFTER this file). The regenerated catalogue replays first and carries it.
  if v_now not in ('carrot_seed:3,cooked_shrimp:20,shrimp:10,turnip_seed:5',
                   'cooked_shrimp:20,shrimp:10,turnip_seed:8',
                   'air_rune:50,bronze_arrows:50,coarse_whetstone:10,cooked_shrimp:20,shrimp:10,turnip_seed:8') then
    raise exception 'PRECONDITION: hr_start_inventory is "%" - neither the food-bridge kit nor the W0 kit. '
                    'Production has drifted from what this file was reviewed against.', v_now;
  end if;

  -- (ii) the reward catalogue is EXACTLY the 8 rows of 2026-09-28, farmhand either
  --      side of this change.
  select count(*) into v_n from public.hr_quest_rewards;
  if v_n <> 8 then
    raise exception 'PRECONDITION: hr_quest_rewards holds % row(s), expected the 8 of 2026-09-28', v_n;
  end if;
  select count(*) into v_n from public.hr_quest_rewards q
   join (values ('first_cook',   '{"shrimp": 30}'::jsonb),
                ('first_blood',  '{"turnip_seed": 5}'::jsonb),
                ('road_forge',   '{"iron_pickaxe": 1}'::jsonb),
                ('road_craft',   '{"iron_axe": 1}'::jsonb),
                ('road_cook',    '{"oak_rod": 1}'::jsonb),
                ('road_hunt',    '{"bone_key": 1}'::jsonb),
                ('road_harvest', '{"potato_seed": 10}'::jsonb)) k(id, items)
     on k.id = q.quest_id and k.items = q.items;
  if v_n <> 7 then
    raise exception 'PRECONDITION: only % of the 7 unchanged reward rows match 2026-09-28 byte-for-byte', v_n;
  end if;
  if not exists (select 1 from public.hr_quest_rewards
                  where quest_id = 'farmhand'
                    and items in ('{"wheat_seed": 5}'::jsonb, '{"carrot_seed": 5}'::jsonb)) then
    raise exception 'PRECONDITION: farmhand pays neither the old wheat seeds nor the new carrot seeds';
  end if;

  -- (iii) both seed ids are real items AND real crops (a seed hr_crops does not
  --       know could be granted and never planted - the defect this file fixes).
  select count(*) into v_n from unnest(array['turnip_seed','carrot_seed']) s
   where not exists (select 1 from public.hr_items i where i.item_id = s)
      or not exists (select 1 from public.hr_crops c where c.seed_item = s);
  if v_n > 0 then
    raise exception 'PRECONDITION: % of turnip_seed/carrot_seed is missing from hr_items or hr_crops', v_n;
  end if;
end $$;

-- ── 1. hr_quest_rewards - THIS FILE NOW OWNS THE ROWS ──────────────────────
-- Delete and refill, all 8: seven byte-identical to 2026-09-28, farmhand moved.
-- Kept in lockstep with goal-catalogue.js QUEST_REWARDS and legacy.js QUEST_DEFS
-- by tests/quest-reward-parity.mjs (this is now its chain-end seed).
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

-- ── 2. hr_start_inventory - the W0 kit ─────────────────────────────────────
delete from public.hr_start_inventory where item_id = 'carrot_seed';
insert into public.hr_start_inventory (item_id, qty) values ('turnip_seed', 8)
on conflict (item_id) do update set qty = excluded.qty;

-- ── 3/4. SELF-CHECK - properties asserted by EXECUTING the RPCs ────────────
do $$
declare
  v_uid   constant uuid := '000000c0-0000-0000-0000-00000010a016';
  v_slot  constant int  := 0;
  v       jsonb;
  v_n     int;
  v_now   text;
  v_heal  bigint;
  v_inv0  jsonb;
  v_inv1  jsonb;
  v_delta jsonb;
  v_g0    bigint;
  v_g1    bigint;
begin
  -- (a) THE CATALOGUE: exactly 8 rows, each exact, every id real, shape holds.
  select count(*) into v_n from public.hr_quest_rewards q
   join (values ('first_cook',   '{"shrimp": 30}'::jsonb),
                ('first_blood',  '{"turnip_seed": 5}'::jsonb),
                ('farmhand',     '{"carrot_seed": 5}'::jsonb),
                ('road_forge',   '{"iron_pickaxe": 1}'::jsonb),
                ('road_craft',   '{"iron_axe": 1}'::jsonb),
                ('road_cook',    '{"oak_rod": 1}'::jsonb),
                ('road_hunt',    '{"bone_key": 1}'::jsonb),
                ('road_harvest', '{"potato_seed": 10}'::jsonb)) k(id, items)
     on k.id = q.quest_id and k.items = q.items;
  if v_n <> 8 or (select count(*) from public.hr_quest_rewards) <> 8 then
    raise exception 'VERIFY(a): hr_quest_rewards is not exactly the 8 ruled rows (% match)', v_n;
  end if;
  select count(*) into v_n
    from public.hr_quest_rewards q, lateral jsonb_each_text(q.items) e
   where not exists (select 1 from public.hr_items i where i.item_id = e.key);
  if v_n > 0 then
    raise exception 'VERIFY(a): % reward id(s) are not in hr_items', v_n;
  end if;
  select count(*) into v_n from public.hr_quest_rewards where not public.hr_quest_rewards_items_ok(items);
  if v_n > 0 then
    raise exception 'VERIFY(a): % reward row(s) fail the items shape check', v_n;
  end if;

  -- (b) THE KIT: exact, still the food bridge, and NO DEAD SEED - every seed it
  --     grants is a crop a Farming-1 character can plant.
  select coalesce(string_agg(item_id || ':' || qty::text, ',' order by item_id), '(empty)')
    into v_now from public.hr_start_inventory;
  -- COMBINED W0 SHAPE (lane w0e): see §0 (i) — the only other accepted kit.
  if v_now not in ('cooked_shrimp:20,shrimp:10,turnip_seed:8',
                   'air_rune:50,bronze_arrows:50,coarse_whetstone:10,cooked_shrimp:20,shrimp:10,turnip_seed:8') then
    raise exception 'VERIFY(b): the starting kit is "%", not the W0 kit', v_now;
  end if;
  select count(*) into v_n from public.hr_start_inventory s
    join public.hr_crops c on c.seed_item = s.item_id
   where c.req_lv > 1;
  if v_n > 0 then
    raise exception 'VERIFY(b): the kit grants % seed(s) a fresh character cannot plant (req_lv > 1)', v_n;
  end if;
  select count(*) into v_n from public.hr_start_inventory s
    join public.hr_crops c on c.seed_item = s.item_id;
  if v_n < 1 then
    raise exception 'VERIFY(b): the kit grants no plantable seed at all - the dead-seed check above proves nothing';
  end if;
  select coalesce(sum(s.qty * i.heals), 0) into v_heal
    from public.hr_start_inventory s join public.hr_items i on i.item_id = s.item_id
   where coalesce(i.heals, 0) > 0 and i.auto_eatable;
  if v_heal < 120 then
    raise exception 'VERIFY(b): the kit carries only % HP of auto-eatable food; the food-bridge floor is 120', v_heal;
  end if;

  -- (c)+(d) EXECUTED, inside a subtransaction that is always rolled back.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;

    -- (c) A REAL CREATE grants exactly the kit: turnips, no carrots.
    v := public.hr_create_character(v_slot);
    if coalesce(v->>'ok', '') <> 'true' then
      raise exception 'VERIFY(c): hr_create_character refused the probe: %', v;
    end if;
    select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) into v_inv0
      from public.player_inventory where user_id = v_uid and slot = v_slot;
    -- COMBINED W0 SHAPE (lane w0e): the only other accepted bag adds the three
    -- free tier-1 ammo stacks (see §0 (i)).
    if v_inv0 <> '{"cooked_shrimp": 20, "shrimp": 10, "turnip_seed": 8}'::jsonb
       and v_inv0 <> '{"cooked_shrimp": 20, "shrimp": 10, "turnip_seed": 8, "air_rune": 50, "bronze_arrows": 50, "coarse_whetstone": 10}'::jsonb then
      raise exception 'VERIFY(c): a new character''s bag is %, not the W0 kit', v_inv0;
    end if;

    -- (d) farmhand: refused at goal-1 (nothing moves), paid carrot seeds at goal,
    --     a replay pays nothing. The RPC takes no count; only the server row grades.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:harvest', 5, '', 'active')
      on conflict (user_id, slot, kind, key, period_key) do update set value = 5;
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_quest__ungated('farmhand', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' then
      raise exception 'VERIFY(d): farmhand at goal-1 was not refused incomplete: %', v;
    end if;
    select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) into v_inv1
      from public.player_inventory where user_id = v_uid and slot = v_slot;
    if v_inv1 <> v_inv0 then
      raise exception 'VERIFY(d): a refused farmhand moved the bag % -> %', v_inv0, v_inv1;
    end if;

    update public.player_progress set value = 6
     where user_id = v_uid and slot = v_slot and kind = 'stat' and key = 'ev:harvest' and period_key = '';
    v := public.hr_claim_quest__ungated('farmhand', v_slot);
    if coalesce(v->>'ok', '') <> 'true' or v->>'credited' <> 'true' then
      raise exception 'VERIFY(d): farmhand at goal did not credit: %', v;
    end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> 500 then
      raise exception 'VERIFY(d): farmhand credited % gold; its gold (500) must not move in this file', v_g1 - v_g0;
    end if;
    select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) into v_inv1
      from public.player_inventory where user_id = v_uid and slot = v_slot;
    select coalesce(jsonb_object_agg(k, d), '{}'::jsonb) into v_delta
      from (select k, coalesce((v_inv1->>k)::bigint, 0) - coalesce((v_inv0->>k)::bigint, 0) as d
              from (select jsonb_object_keys(v_inv0) as k union select jsonb_object_keys(v_inv1)) ks) x
     where d <> 0;
    if v_delta <> '{"carrot_seed": 5}'::jsonb or (v->'items') is distinct from '{"carrot_seed": 5}'::jsonb then
      raise exception 'VERIFY(d): farmhand moved the bag by % (receipt %), expected exactly 5 carrot seeds',
        v_delta, v->'items';
    end if;
    v := public.hr_claim_quest__ungated('farmhand', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'VERIFY(d): a farmhand replay was not refused already_claimed: %', v;
    end if;
    select count(*) into v_n from public.player_inventory
     where user_id = v_uid and slot = v_slot and item_id = 'carrot_seed' and qty = 5;
    if v_n <> 1 then
      raise exception 'VERIFY(d): the farmhand replay moved the carrot seeds';
    end if;
    if not exists (select 1 from public.player_ledger
                    where user_id = v_uid and kind = 'quest' and intent = 'quest_claim:farmhand'
                      and meta->'items' = '{"carrot_seed": 5}'::jsonb) then
      raise exception 'VERIFY(d): the farmhand journal row does not carry meta.items = {"carrot_seed": 5}';
    end if;

    raise exception using errcode = 'HR853', message = 'first-day-seeds §4 complete - rolling back';
  exception when sqlstate 'HR853' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- (e) ZERO LEAK, then grant hygiene.
  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(e): §4 LEAKED a probe row';
  end if;
  declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
  begin
    if jsonb_array_length(coalesce(v_gh->'unapproved_client_rpcs', '[]'::jsonb)) <> 0 then
      raise exception 'VERIFY(e): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
    end if;
    if jsonb_array_length(coalesce(v_gh->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
      raise exception 'VERIFY(e): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
    end if;
  end;

  raise notice 'first-day-seeds: 8 reward rows exact (farmhand pays 5 carrot seeds), kit = 8 turnip seeds + '
               'the food bridge with no seed above Farming 1; a real create grants it, farmhand refuses at '
               'goal-1, pays exactly 5 carrot seeds + 500 gold at goal, replay pays nothing; zero leak, hygiene clean.';
end $$;
