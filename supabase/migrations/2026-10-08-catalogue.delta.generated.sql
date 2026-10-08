-- ════════════════════════════════════════════════════════════════════════
-- GENERATED DELTA of 2026-08-11-catalogue.generated.sql — DO NOT EDIT BY HAND.
--
-- 2026-08-11-catalogue.generated.sql is applied history and FROZEN (tests/generated-frozen.json).
-- These are the rows the data in src/** now wants that differ from it (plus
-- any deltas already applied on top), as idempotent upserts and keyed deletes.
-- Written by tools/generated-freeze.mjs on behalf of the gen-* tool that owns
-- the base; that tool's --check fails if this file is stale. Apply AFTER every
-- other migration (it is last in tests/schema-apply-order.json); once applied,
-- the Coordinator pins it in tests/generated-frozen.json with deltaOf.
-- ════════════════════════════════════════════════════════════════════════

delete from public.hr_start_inventory where (item_id) in (
  ('carrot_seed')
);

insert into public.hr_items (item_id, name, tradeable, kind, value, req_skill, req_lv, heals, auto_eatable) values
  ('alpha_cloak', 'Alpha Cloak', true, 'armor', 9000, 'defense', 60, null, false),
  ('boarhide_mantle', 'Boarhide Mantle', true, 'armor', 1200, 'defense', 38, null, false),
  ('bronze_kiteshield', 'Bronze Kiteshield', true, 'armor', 55, 'defense', 1, null, false),
  ('captains_ribblade', 'Captain''s Ribblade', true, 'weapon', 5000, 'attack', 60, null, false),
  ('chief_blade', 'Chief''s Blade', true, 'weapon', 1600, 'attack', 45, null, false),
  ('copper_whetstone', 'Iron Whetstone', true, 'ammo', 15, 'attack', 15, null, false),
  ('dawn_kiteshield', 'Dawnsteel Kiteshield', true, 'armor', 32400, 'defense', 88, null, false),
  ('dawnbloom', 'Dawnbloom', true, null, 1250, null, null, 24, true),
  ('dawnbloom_seed', 'Dawnbloom Seed', true, null, 420, null, null, null, false),
  ('dragon_egg', 'Dragon Egg', true, null, 6000, null, null, null, false),
  ('elderscale_aegis', 'Elderscale Aegis', false, 'armor', 70000, 'defense', 95, null, false),
  ('ember_kiteshield', 'Emberforged Kiteshield', true, 'armor', 11700, 'defense', 75, null, false),
  ('iron_kiteshield', 'Iron Kiteshield', true, 'armor', 115, 'defense', 15, null, false),
  ('iron_whetstone', 'Steel Whetstone', true, 'ammo', 48, 'attack', 30, null, false),
  ('marrowbone_maul', 'Marrowbone Maul', false, 'weapon', 2500, 'attack', 25, null, false),
  ('mithril_kiteshield', 'Mithril Kiteshield', true, 'armor', 1350, 'defense', 45, null, false),
  ('mithril_whetstone', 'Rune Whetstone', true, 'ammo', 190, 'attack', 60, null, false),
  ('riftmaw_aegis', 'Riftmaw Aegis', false, 'armor', 30000, 'defense', 80, null, false),
  ('rune_kiteshield', 'Rune Kiteshield', true, 'armor', 4050, 'defense', 60, null, false),
  ('rune_whetstone', 'Emberforged Whetstone', true, 'ammo', 365, 'attack', 75, null, false),
  ('steel_kiteshield', 'Steel Kiteshield', true, 'armor', 450, 'defense', 30, null, false),
  ('steel_whetstone', 'Mithril Whetstone', true, 'ammo', 108, 'attack', 45, null, false)
on conflict (item_id) do update set name = excluded.name, tradeable = excluded.tradeable, kind = excluded.kind, value = excluded.value, req_skill = excluded.req_skill, req_lv = excluded.req_lv, heals = excluded.heals, auto_eatable = excluded.auto_eatable;

insert into public.hr_item_slots (item_id, equip_slot) values
  ('boarhide_mantle', 'cape'),
  ('bronze_kiteshield', 'shield'),
  ('dawn_kiteshield', 'shield'),
  ('elderscale_aegis', 'shield'),
  ('ember_kiteshield', 'shield'),
  ('iron_kiteshield', 'shield'),
  ('marrowbone_maul', 'weapon'),
  ('mithril_kiteshield', 'shield'),
  ('riftmaw_aegis', 'shield'),
  ('rune_kiteshield', 'shield'),
  ('steel_kiteshield', 'shield')
on conflict (item_id, equip_slot) do nothing;

insert into public.hr_crops (crop_id, seed_item, prod_item, base_hours, req_lv, yield_min, yield_max, xp, regrows) values
  ('dawnbloom', 'dawnbloom_seed', 'dawnbloom', 24, 95, 1, 2, 3100, false)
on conflict (crop_id) do update set seed_item = excluded.seed_item, prod_item = excluded.prod_item, base_hours = excluded.base_hours, req_lv = excluded.req_lv, yield_min = excluded.yield_min, yield_max = excluded.yield_max, xp = excluded.xp, regrows = excluded.regrows;

insert into public.hr_activities (kind, activity_id, req_skill, req_lv, max_hp, is_boss) values
  ('artisan', 'carve_oak_staff', 'crafting', 21, null, false),
  ('artisan', 'consecrate_night_fang', 'prayer', 29, null, false),
  ('artisan', 'deepbind_air', 'runecrafting', 8, null, false),
  ('artisan', 'deepbind_death', 'runecrafting', 81, null, false),
  ('artisan', 'deepbind_fire', 'runecrafting', 52, null, false),
  ('artisan', 'forge_bronze_kiteshield', 'smithing', 5, null, false),
  ('artisan', 'forge_bronze_masons_rule', 'smithing', 5, null, false),
  ('artisan', 'forge_captain_blade', 'smithing', 66, null, false),
  ('artisan', 'forge_chief_blade', 'smithing', 48, null, false),
  ('artisan', 'forge_dawn_kiteshield', 'smithing', 92, null, false),
  ('artisan', 'forge_dawn_masons_rule', 'smithing', 90, null, false),
  ('artisan', 'forge_elderscale_aegis', 'smithing', 95, null, false),
  ('artisan', 'forge_ember_kiteshield', 'smithing', 79, null, false),
  ('artisan', 'forge_iron_kiteshield', 'smithing', 19, null, false),
  ('artisan', 'forge_iron_warhammer', 'smithing', 23, null, false),
  ('artisan', 'forge_mithril_kiteshield', 'smithing', 49, null, false),
  ('artisan', 'forge_riftmaw_aegis', 'smithing', 82, null, false),
  ('artisan', 'forge_rune_kiteshield', 'smithing', 64, null, false),
  ('artisan', 'forge_rune_sword', 'smithing', 65, null, false),
  ('artisan', 'forge_steel_kiteshield', 'smithing', 34, null, false),
  ('artisan', 'forge_steel_masons_rule', 'smithing', 35, null, false),
  ('artisan', 'forge_steel_sword', 'smithing', 35, null, false),
  ('artisan', 'offer_rat_tail', 'prayer', 8, null, false),
  ('artisan', 'offer_small_fang', 'prayer', 22, null, false),
  ('artisan', 'split_deep_blanks', 'stonemason', 84, null, false),
  ('artisan', 'split_fine_blanks', 'stonemason', 53, null, false),
  ('artisan', 'tailor_boarhide_mantle', 'crafting', 38, null, false),
  ('artisan', 'tailor_leather_gloves', 'crafting', 2, null, false)
on conflict (kind, activity_id) do update set req_skill = excluded.req_skill, req_lv = excluded.req_lv, max_hp = excluded.max_hp, is_boss = excluded.is_boss;

insert into public.hr_start_kit (only_row, gold, gems, hearth_tokens, hp, max_hp, bank_cap, farm_plots)
  values (true, 500, 0, 0, 10, 10, 100, 2)
  on conflict (only_row) do update set
    gold = excluded.gold, gems = excluded.gems, hearth_tokens = excluded.hearth_tokens,
    hp = excluded.hp, max_hp = excluded.max_hp, bank_cap = excluded.bank_cap,
    farm_plots = excluded.farm_plots;

insert into public.hr_start_inventory (item_id, qty) values
  ('turnip_seed', 8)
on conflict (item_id) do update set qty = excluded.qty;

insert into public.hr_catalogue_meta (only_row, digest, generated_at)
  values (true, '731a4babe5af33f07fcfae651568f3732036a3aa9332397145d1ab18bc0fc708', now())
  on conflict (only_row) do update set digest = excluded.digest, generated_at = excluded.generated_at;

-- ── SELF-CHECK (executed): every row landed, every delete held, owned
--    tables hold exactly the catalogue's row count. ─────────────────────
do $$
declare v_n bigint;
begin
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'alpha_cloak' and name is not distinct from 'Alpha Cloak' and tradeable is not distinct from true and kind is not distinct from 'armor' and value is not distinct from 9000 and req_skill is not distinct from 'defense' and req_lv is not distinct from 60 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row alpha_cloak did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'boarhide_mantle' and name is not distinct from 'Boarhide Mantle' and tradeable is not distinct from true and kind is not distinct from 'armor' and value is not distinct from 1200 and req_skill is not distinct from 'defense' and req_lv is not distinct from 38 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row boarhide_mantle did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'bronze_kiteshield' and name is not distinct from 'Bronze Kiteshield' and tradeable is not distinct from true and kind is not distinct from 'armor' and value is not distinct from 55 and req_skill is not distinct from 'defense' and req_lv is not distinct from 1 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row bronze_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'captains_ribblade' and name is not distinct from 'Captain''s Ribblade' and tradeable is not distinct from true and kind is not distinct from 'weapon' and value is not distinct from 5000 and req_skill is not distinct from 'attack' and req_lv is not distinct from 60 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row captains_ribblade did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'chief_blade' and name is not distinct from 'Chief''s Blade' and tradeable is not distinct from true and kind is not distinct from 'weapon' and value is not distinct from 1600 and req_skill is not distinct from 'attack' and req_lv is not distinct from 45 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row chief_blade did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'copper_whetstone' and name is not distinct from 'Iron Whetstone' and tradeable is not distinct from true and kind is not distinct from 'ammo' and value is not distinct from 15 and req_skill is not distinct from 'attack' and req_lv is not distinct from 15 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row copper_whetstone did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'dawn_kiteshield' and name is not distinct from 'Dawnsteel Kiteshield' and tradeable is not distinct from true and kind is not distinct from 'armor' and value is not distinct from 32400 and req_skill is not distinct from 'defense' and req_lv is not distinct from 88 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row dawn_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'dawnbloom' and name is not distinct from 'Dawnbloom' and tradeable is not distinct from true and kind is not distinct from null and value is not distinct from 1250 and req_skill is not distinct from null and req_lv is not distinct from null and heals is not distinct from 24 and auto_eatable is not distinct from true) then raise exception 'delta: hr_items row dawnbloom did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'dawnbloom_seed' and name is not distinct from 'Dawnbloom Seed' and tradeable is not distinct from true and kind is not distinct from null and value is not distinct from 420 and req_skill is not distinct from null and req_lv is not distinct from null and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row dawnbloom_seed did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'dragon_egg' and name is not distinct from 'Dragon Egg' and tradeable is not distinct from true and kind is not distinct from null and value is not distinct from 6000 and req_skill is not distinct from null and req_lv is not distinct from null and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row dragon_egg did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'elderscale_aegis' and name is not distinct from 'Elderscale Aegis' and tradeable is not distinct from false and kind is not distinct from 'armor' and value is not distinct from 70000 and req_skill is not distinct from 'defense' and req_lv is not distinct from 95 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row elderscale_aegis did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'ember_kiteshield' and name is not distinct from 'Emberforged Kiteshield' and tradeable is not distinct from true and kind is not distinct from 'armor' and value is not distinct from 11700 and req_skill is not distinct from 'defense' and req_lv is not distinct from 75 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row ember_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'iron_kiteshield' and name is not distinct from 'Iron Kiteshield' and tradeable is not distinct from true and kind is not distinct from 'armor' and value is not distinct from 115 and req_skill is not distinct from 'defense' and req_lv is not distinct from 15 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row iron_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'iron_whetstone' and name is not distinct from 'Steel Whetstone' and tradeable is not distinct from true and kind is not distinct from 'ammo' and value is not distinct from 48 and req_skill is not distinct from 'attack' and req_lv is not distinct from 30 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row iron_whetstone did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'marrowbone_maul' and name is not distinct from 'Marrowbone Maul' and tradeable is not distinct from false and kind is not distinct from 'weapon' and value is not distinct from 2500 and req_skill is not distinct from 'attack' and req_lv is not distinct from 25 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row marrowbone_maul did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'mithril_kiteshield' and name is not distinct from 'Mithril Kiteshield' and tradeable is not distinct from true and kind is not distinct from 'armor' and value is not distinct from 1350 and req_skill is not distinct from 'defense' and req_lv is not distinct from 45 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row mithril_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'mithril_whetstone' and name is not distinct from 'Rune Whetstone' and tradeable is not distinct from true and kind is not distinct from 'ammo' and value is not distinct from 190 and req_skill is not distinct from 'attack' and req_lv is not distinct from 60 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row mithril_whetstone did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'riftmaw_aegis' and name is not distinct from 'Riftmaw Aegis' and tradeable is not distinct from false and kind is not distinct from 'armor' and value is not distinct from 30000 and req_skill is not distinct from 'defense' and req_lv is not distinct from 80 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row riftmaw_aegis did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'rune_kiteshield' and name is not distinct from 'Rune Kiteshield' and tradeable is not distinct from true and kind is not distinct from 'armor' and value is not distinct from 4050 and req_skill is not distinct from 'defense' and req_lv is not distinct from 60 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row rune_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'rune_whetstone' and name is not distinct from 'Emberforged Whetstone' and tradeable is not distinct from true and kind is not distinct from 'ammo' and value is not distinct from 365 and req_skill is not distinct from 'attack' and req_lv is not distinct from 75 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row rune_whetstone did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'steel_kiteshield' and name is not distinct from 'Steel Kiteshield' and tradeable is not distinct from true and kind is not distinct from 'armor' and value is not distinct from 450 and req_skill is not distinct from 'defense' and req_lv is not distinct from 30 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row steel_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_items where item_id is not distinct from 'steel_whetstone' and name is not distinct from 'Mithril Whetstone' and tradeable is not distinct from true and kind is not distinct from 'ammo' and value is not distinct from 108 and req_skill is not distinct from 'attack' and req_lv is not distinct from 45 and heals is not distinct from null and auto_eatable is not distinct from false) then raise exception 'delta: hr_items row steel_whetstone did not land'; end if;
  if not exists (select 1 from public.hr_item_slots where item_id is not distinct from 'boarhide_mantle' and equip_slot is not distinct from 'cape') then raise exception 'delta: hr_item_slots row boarhide_mantle did not land'; end if;
  if not exists (select 1 from public.hr_item_slots where item_id is not distinct from 'bronze_kiteshield' and equip_slot is not distinct from 'shield') then raise exception 'delta: hr_item_slots row bronze_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_item_slots where item_id is not distinct from 'dawn_kiteshield' and equip_slot is not distinct from 'shield') then raise exception 'delta: hr_item_slots row dawn_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_item_slots where item_id is not distinct from 'elderscale_aegis' and equip_slot is not distinct from 'shield') then raise exception 'delta: hr_item_slots row elderscale_aegis did not land'; end if;
  if not exists (select 1 from public.hr_item_slots where item_id is not distinct from 'ember_kiteshield' and equip_slot is not distinct from 'shield') then raise exception 'delta: hr_item_slots row ember_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_item_slots where item_id is not distinct from 'iron_kiteshield' and equip_slot is not distinct from 'shield') then raise exception 'delta: hr_item_slots row iron_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_item_slots where item_id is not distinct from 'marrowbone_maul' and equip_slot is not distinct from 'weapon') then raise exception 'delta: hr_item_slots row marrowbone_maul did not land'; end if;
  if not exists (select 1 from public.hr_item_slots where item_id is not distinct from 'mithril_kiteshield' and equip_slot is not distinct from 'shield') then raise exception 'delta: hr_item_slots row mithril_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_item_slots where item_id is not distinct from 'riftmaw_aegis' and equip_slot is not distinct from 'shield') then raise exception 'delta: hr_item_slots row riftmaw_aegis did not land'; end if;
  if not exists (select 1 from public.hr_item_slots where item_id is not distinct from 'rune_kiteshield' and equip_slot is not distinct from 'shield') then raise exception 'delta: hr_item_slots row rune_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_item_slots where item_id is not distinct from 'steel_kiteshield' and equip_slot is not distinct from 'shield') then raise exception 'delta: hr_item_slots row steel_kiteshield did not land'; end if;
  if not exists (select 1 from public.hr_crops where crop_id is not distinct from 'dawnbloom' and seed_item is not distinct from 'dawnbloom_seed' and prod_item is not distinct from 'dawnbloom' and base_hours is not distinct from 24 and req_lv is not distinct from 95 and yield_min is not distinct from 1 and yield_max is not distinct from 2 and xp is not distinct from 3100 and regrows is not distinct from false) then raise exception 'delta: hr_crops row dawnbloom did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'carve_oak_staff' and req_skill is not distinct from 'crafting' and req_lv is not distinct from 21 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'consecrate_night_fang' and req_skill is not distinct from 'prayer' and req_lv is not distinct from 29 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'deepbind_air' and req_skill is not distinct from 'runecrafting' and req_lv is not distinct from 8 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'deepbind_death' and req_skill is not distinct from 'runecrafting' and req_lv is not distinct from 81 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'deepbind_fire' and req_skill is not distinct from 'runecrafting' and req_lv is not distinct from 52 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_bronze_kiteshield' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 5 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_bronze_masons_rule' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 5 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_captain_blade' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 66 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_chief_blade' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 48 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_dawn_kiteshield' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 92 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_dawn_masons_rule' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 90 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_elderscale_aegis' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 95 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_ember_kiteshield' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 79 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_iron_kiteshield' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 19 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_iron_warhammer' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 23 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_mithril_kiteshield' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 49 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_riftmaw_aegis' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 82 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_rune_kiteshield' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 64 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_rune_sword' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 65 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_steel_kiteshield' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 34 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_steel_masons_rule' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 35 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'forge_steel_sword' and req_skill is not distinct from 'smithing' and req_lv is not distinct from 35 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'offer_rat_tail' and req_skill is not distinct from 'prayer' and req_lv is not distinct from 8 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'offer_small_fang' and req_skill is not distinct from 'prayer' and req_lv is not distinct from 22 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'split_deep_blanks' and req_skill is not distinct from 'stonemason' and req_lv is not distinct from 84 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'split_fine_blanks' and req_skill is not distinct from 'stonemason' and req_lv is not distinct from 53 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'tailor_boarhide_mantle' and req_skill is not distinct from 'crafting' and req_lv is not distinct from 38 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_activities where kind is not distinct from 'artisan' and activity_id is not distinct from 'tailor_leather_gloves' and req_skill is not distinct from 'crafting' and req_lv is not distinct from 2 and max_hp is not distinct from null and is_boss is not distinct from false) then raise exception 'delta: hr_activities row artisan did not land'; end if;
  if not exists (select 1 from public.hr_start_kit where only_row is not distinct from true and gold is not distinct from 500 and gems is not distinct from 0 and hearth_tokens is not distinct from 0 and hp is not distinct from 10 and max_hp is not distinct from 10 and bank_cap is not distinct from 100 and farm_plots is not distinct from 2) then raise exception 'delta: hr_start_kit row true did not land'; end if;
  if exists (select 1 from public.hr_start_inventory where (item_id) = ('carrot_seed')) then raise exception 'delta: hr_start_inventory row carrot_seed was not deleted'; end if;
  if not exists (select 1 from public.hr_start_inventory where item_id is not distinct from 'turnip_seed' and qty is not distinct from 8) then raise exception 'delta: hr_start_inventory row turnip_seed did not land'; end if;
  if not exists (select 1 from public.hr_catalogue_meta where only_row is not distinct from true and digest is not distinct from '731a4babe5af33f07fcfae651568f3732036a3aa9332397145d1ab18bc0fc708') then raise exception 'delta: hr_catalogue_meta row true did not land'; end if;
  select count(*) into v_n from public.hr_items;
  if v_n <> 552 then raise exception 'delta: hr_items holds % rows, the catalogue has 552', v_n; end if;
  select count(*) into v_n from public.hr_item_slots;
  if v_n <> 291 then raise exception 'delta: hr_item_slots holds % rows, the catalogue has 291', v_n; end if;
  select count(*) into v_n from public.hr_crops;
  if v_n <> 10 then raise exception 'delta: hr_crops holds % rows, the catalogue has 10', v_n; end if;
  select count(*) into v_n from public.hr_activities;
  if v_n <> 535 then raise exception 'delta: hr_activities holds % rows, the catalogue has 535', v_n; end if;
  select count(*) into v_n from public.hr_start_inventory;
  if v_n <> 3 then raise exception 'delta: hr_start_inventory holds % rows, the catalogue has 3', v_n; end if;
end $$;
