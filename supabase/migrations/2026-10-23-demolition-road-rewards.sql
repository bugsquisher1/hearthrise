-- ==========================================================================
-- 2026-10-23-demolition-road-rewards.sql — THE JOURNEYMAN'S ROAD, RE-REWARDED
-- STAGED (lane/demo-data, demolition 2026-10-14). Security GO required: this
-- moves quest ITEM credits (a money surface). NOT APPLIED.
--
-- Designer ruling 2026-10-14 §6: the road quests that paid a tool or the bone
-- key are re-rewarded at the same value; gold does not move.
--     road_forge   {"iron_pickaxe": 1} -> {"iron_bar": 3}
--     road_craft   {"iron_axe": 1}     -> {"oak_plank": 5}
--     road_cook    {"oak_rod": 1}      -> {"lobster": 3}
--     road_hunt    {"bone_key": 1}     -> {"cooked_lobster": 2}
-- The other four item rows are restated byte-identical so this file is the
-- chain-end seed tests/quest-reward-parity.mjs binds to goal-catalogue.js
-- QUEST_REWARDS and legacy.js QUEST_DEFS.
--
-- OWNERSHIP: hr_quest_rewards.items of the eight item-bearing rows, by UPSERT.
-- Nothing is deleted, so the xp column (2026-10-10-quest-xp-absence-pay.sql) and
-- the hundred_kills row are untouched. No function body moves.
--
-- ORDER: apply BEFORE 2026-10-23-demolition-catalogue.generated.sql, which
-- deletes bone_key from hr_items.
--
-- WHAT AN EXISTING CHARACTER SEES: nothing is taken back; an unclaimed road
-- quest pays the new items through the same once-guarded claim. (Wipe at EA.)
--
-- REVERSIBILITY: restate the four rows' old items, and revert goal-catalogue.js
-- / legacy.js QUEST_DEFS / spine-pointer.js in lockstep.
-- RE-RUNNABLE: §0 accepts the pre-state OR the post-state.
-- ==========================================================================

-- ── 0. PRECONDITIONS - FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_n int;
begin
  if to_regclass('public.hr_quest_rewards') is null
     or to_regprocedure('public.hr_quest_rewards_items_ok(jsonb)') is null then
    raise exception 'PRECONDITION: hr_quest_rewards / its shape predicate is missing';
  end if;
  if to_regprocedure('public.hr_claim_quest__ungated(text,integer)') is null
     or to_regprocedure('public.hr_create_character(integer)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: hr_claim_quest__ungated / hr_create_character / hr_assert_grant_hygiene is absent';
  end if;
  -- Each road row is EXACTLY its 2026-10-16 value or EXACTLY this file's.
  select count(*) into v_n from public.hr_quest_rewards q
    join (values ('road_forge', '{"iron_pickaxe": 1}'::jsonb, '{"iron_bar": 3}'::jsonb),
                 ('road_craft', '{"iron_axe": 1}'::jsonb,     '{"oak_plank": 5}'::jsonb),
                 ('road_cook',  '{"oak_rod": 1}'::jsonb,      '{"lobster": 3}'::jsonb),
                 ('road_hunt',  '{"bone_key": 1}'::jsonb,     '{"cooked_lobster": 2}'::jsonb)) k(id, old_items, new_items)
      on k.id = q.quest_id and q.items in (k.old_items, k.new_items);
  if v_n <> 4 then
    raise exception 'PRECONDITION: only % of the 4 road rows hold the reviewed old or new items', v_n;
  end if;
  select count(*) into v_n from unnest(array['iron_bar','oak_plank','lobster','cooked_lobster']) s
   where not exists (select 1 from public.hr_items i where i.item_id = s);
  if v_n > 0 then
    raise exception 'PRECONDITION: % of the new reward ids are not in hr_items', v_n;
  end if;
end $$;

-- ── 1. hr_quest_rewards.items - the eight item rows, upserted ──────────────
insert into public.hr_quest_rewards (quest_id, items) values
  ('first_cook',  '{"shrimp": 30}'),
  ('first_blood', '{"turnip_seed": 5}'),
  ('farmhand',    '{"carrot_seed": 5}'),
  ('road_forge',   '{"iron_bar": 3}'),
  ('road_craft',   '{"oak_plank": 5}'),
  ('road_cook',    '{"lobster": 3}'),
  ('road_hunt',    '{"cooked_lobster": 2}'),
  ('road_harvest', '{"potato_seed": 10}')
on conflict (quest_id) do update set items = excluded.items;

-- ── 4. SELF-CHECK - properties asserted by EXECUTING the claim ─────────────
do $$
declare
  v_uid  constant uuid := '000000c0-0000-0000-0000-0000d3a01d2a';
  v_slot constant int  := 0;
  v      jsonb;
  v_n    int;
  v_inv0 jsonb;
  v_inv1 jsonb;
  v_g0   bigint;
  v_g1   bigint;
begin
  -- (a) the eight item rows are exact, every id is real, the shape holds.
  select count(*) into v_n from public.hr_quest_rewards q
    join (values ('first_cook',   '{"shrimp": 30}'::jsonb),
                 ('first_blood',  '{"turnip_seed": 5}'::jsonb),
                 ('farmhand',     '{"carrot_seed": 5}'::jsonb),
                 ('road_forge',   '{"iron_bar": 3}'::jsonb),
                 ('road_craft',   '{"oak_plank": 5}'::jsonb),
                 ('road_cook',    '{"lobster": 3}'::jsonb),
                 ('road_hunt',    '{"cooked_lobster": 2}'::jsonb),
                 ('road_harvest', '{"potato_seed": 10}'::jsonb)) k(id, items)
      on k.id = q.quest_id and k.items = q.items;
  if v_n <> 8 then
    raise exception 'VERIFY(a): % of the 8 item rows match', v_n;
  end if;
  select count(*) into v_n
    from public.hr_quest_rewards q, lateral jsonb_each_text(q.items) e
   where not exists (select 1 from public.hr_items i where i.item_id = e.key);
  if v_n > 0 then raise exception 'VERIFY(a): % reward id(s) are not in hr_items', v_n; end if;
  select count(*) into v_n from public.hr_quest_rewards where not public.hr_quest_rewards_items_ok(items);
  if v_n > 0 then raise exception 'VERIFY(a): % row(s) fail the items shape check', v_n; end if;
  select count(*) into v_n from public.hr_quest_rewards
   where items ?| array['iron_pickaxe','iron_axe','oak_rod','bone_key'];
  if v_n > 0 then raise exception 'VERIFY(a): % row(s) still pay a retired reward', v_n; end if;

  -- (b) EXECUTED, inside a subtransaction that is always rolled back:
  --     road_forge refuses at goal-1, pays exactly 3 iron bars + 700 gold at
  --     goal, and a replay pays nothing.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    -- closed mode (2026-10-21-closed-mode.sql): the probe is admitted for this rolled-back block only.
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'demolition §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(v_slot);
    if coalesce(v->>'ok', '') <> 'true' then
      raise exception 'VERIFY(b): hr_create_character refused the probe: %', v;
    end if;
    select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) into v_inv0
      from public.player_inventory where user_id = v_uid and slot = v_slot;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:smithed', 59, '', 'active')
      on conflict (user_id, slot, kind, key, period_key) do update set value = 59;
    v := public.hr_claim_quest__ungated('road_forge', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' then
      raise exception 'VERIFY(b): road_forge at goal-1 was not refused incomplete: %', v;
    end if;
    update public.player_progress set value = 60
     where user_id = v_uid and slot = v_slot and kind = 'stat' and key = 'ev:smithed' and period_key = '';
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_quest__ungated('road_forge', v_slot);
    if coalesce(v->>'ok', '') <> 'true' or v->>'credited' <> 'true' then
      raise exception 'VERIFY(b): road_forge at goal did not credit: %', v;
    end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> 700 then
      raise exception 'VERIFY(b): road_forge credited % gold; its 700 must not move in this file', v_g1 - v_g0;
    end if;
    select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) into v_inv1
      from public.player_inventory where user_id = v_uid and slot = v_slot;
    if coalesce((v_inv1->>'iron_bar')::bigint, 0) - coalesce((v_inv0->>'iron_bar')::bigint, 0) <> 3
       or (v->'items') is distinct from '{"iron_bar": 3}'::jsonb then
      raise exception 'VERIFY(b): road_forge paid % (receipt %), expected exactly 3 iron bars', v_inv1, v->'items';
    end if;
    v := public.hr_claim_quest__ungated('road_forge', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'VERIFY(b): a road_forge replay was not refused already_claimed: %', v;
    end if;
    raise exception using errcode = 'HR854', message = 'demolition-road-rewards §4 complete - rolling back';
  exception when sqlstate 'HR854' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (c) ZERO LEAK, then grant hygiene.
  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(c): §4 LEAKED a probe row';
  end if;
  declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
  begin
    if jsonb_array_length(coalesce(v_gh->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_gh->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
      raise exception 'VERIFY(c): grant-hygiene is not clean: %', v_gh;
    end if;
  end;
  raise notice 'demolition-road-rewards: 8 item rows exact, no retired reward left; road_forge refuses at '
               'goal-1, pays exactly 3 iron bars + 700 gold at goal, replay refused; zero leak, hygiene clean.';
end $$;
