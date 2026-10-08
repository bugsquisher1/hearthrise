-- ════════════════════════════════════════════════════════════════════════
-- GENERATED DELTA of 2026-09-10-dungeon-catalogue.generated.sql — DO NOT EDIT BY HAND.
--
-- 2026-09-10-dungeon-catalogue.generated.sql is applied history and FROZEN (tests/generated-frozen.json).
-- These are the rows the data in src/** now wants that differ from it (plus
-- any deltas already applied on top), as idempotent upserts and keyed deletes.
-- Written by tools/generated-freeze.mjs on behalf of the gen-* tool that owns
-- the base; that tool's --check fails if this file is stale. Apply AFTER every
-- other migration (it is last in tests/schema-apply-order.json); once applied,
-- the Coordinator pins it in tests/generated-frozen.json with deltaOf.
-- ════════════════════════════════════════════════════════════════════════

insert into public.hr_dungeon_loot (dungeon_id, ord, item_id, qty_min, qty_max, chance, bop) values
  ('crypt_of_bones', 3, 'marrowbone_maul', 1, 1, 0.06, true),
  ('crypt_of_bones', 4, 'farm_deed', 1, 1, 0.2, false)
on conflict (dungeon_id, item_id) do update set ord = excluded.ord, qty_min = excluded.qty_min, qty_max = excluded.qty_max, chance = excluded.chance, bop = excluded.bop;

insert into public.hr_qm_offers (offer_id, item_id, scrip_cost) values
  ('qm.marrowbone_maul', 'marrowbone_maul', 110)
on conflict (offer_id) do update set item_id = excluded.item_id, scrip_cost = excluded.scrip_cost;

-- ── SELF-CHECK (executed): every row landed, every delete held, owned
--    tables hold exactly the catalogue's row count. ─────────────────────
do $$
declare v_n bigint;
begin
  if not exists (select 1 from public.hr_dungeon_loot where dungeon_id is not distinct from 'crypt_of_bones' and ord is not distinct from 3 and item_id is not distinct from 'marrowbone_maul' and qty_min is not distinct from 1 and qty_max is not distinct from 1 and chance is not distinct from 0.06 and bop is not distinct from true) then raise exception 'delta: hr_dungeon_loot row crypt_of_bones did not land'; end if;
  if not exists (select 1 from public.hr_dungeon_loot where dungeon_id is not distinct from 'crypt_of_bones' and ord is not distinct from 4 and item_id is not distinct from 'farm_deed' and qty_min is not distinct from 1 and qty_max is not distinct from 1 and chance is not distinct from 0.2 and bop is not distinct from false) then raise exception 'delta: hr_dungeon_loot row crypt_of_bones did not land'; end if;
  if not exists (select 1 from public.hr_qm_offers where offer_id is not distinct from 'qm.marrowbone_maul' and item_id is not distinct from 'marrowbone_maul' and scrip_cost is not distinct from 110) then raise exception 'delta: hr_qm_offers row qm.marrowbone_maul did not land'; end if;
  select count(*) into v_n from public.hr_dungeon_loot;
  if v_n <> 39 then raise exception 'delta: hr_dungeon_loot holds % rows, the catalogue has 39', v_n; end if;
  select count(*) into v_n from public.hr_qm_offers;
  if v_n <> 20 then raise exception 'delta: hr_qm_offers holds % rows, the catalogue has 20', v_n; end if;
end $$;
