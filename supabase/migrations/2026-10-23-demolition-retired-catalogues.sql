-- ==========================================================================
-- 2026-10-23-demolition-retired-catalogues.sql — THE DUNGEON LOOT AND THE
-- QUARTERMASTER STOCK LEAVE WITH THEIR SYSTEMS
-- STAGED (lane/demo-data, demolition 2026-10-14). Security GO required: this
-- removes item grant sources (a money surface). NOT APPLIED.
--
-- The dungeons and the Quartermaster were cut (designer ruling 2026-10-14);
-- their catalogue generators (tools/gen-dungeon-catalogue.mjs, the QM stock in
-- src/data/dungeons.js) were deleted with them. Their rows still name items the
-- demolition removes from hr_items (bone_key, the room blueprints, farm_deed,
-- goblin_seal, the dungeon keys...). Security R2 (2026-10-15): no catalogue row
-- may name an item missing from hr_items, so these rows go.
--
-- OWNERSHIP: every row of hr_dungeon_loot and hr_qm_offers. The tables and the
-- RPCs that read them stay until their own retirement (C2); with no rows,
-- hr_dungeon_settle pays no loot and hr_quartermaster_buy finds no offer, so both
-- fail closed.
--
-- ORDER: apply BEFORE 2026-10-23-demolition-catalogue.generated.sql, whose §4
-- refuses a row in either table naming an item missing from hr_items.
-- RE-RUNNABLE: deleting nothing twice is a no-op.
-- ==========================================================================

-- ── 0. PRECONDITIONS - FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_dungeon_loot') is null or to_regclass('public.hr_qm_offers') is null then
    raise exception 'PRECONDITION: hr_dungeon_loot / hr_qm_offers is absent - this file retires their rows, nothing else';
  end if;
end $$;

-- ── 1. THE RETIREMENT ──────────────────────────────────────────────────────
delete from public.hr_dungeon_loot;
delete from public.hr_qm_offers;

-- ── 4. SELF-CHECK (executed, not asserted by markers) ──────────────────────
do $$
begin
  if exists (select 1 from public.hr_dungeon_loot) then
    raise exception 'demolition-retired-catalogues self-check (a): hr_dungeon_loot still pays loot'; end if;
  if exists (select 1 from public.hr_qm_offers) then
    raise exception 'demolition-retired-catalogues self-check (a): hr_qm_offers still sells stock'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('hr_dungeon_loot', 'hr_qm_offers') and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'demolition-retired-catalogues self-check (b): a client write policy exists on a retired catalogue'; end if;
  raise notice 'demolition-retired-catalogues: no dungeon loot and no Quartermaster stock remain - all green';
end $$;
