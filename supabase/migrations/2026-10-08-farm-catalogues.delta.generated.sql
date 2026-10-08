-- ════════════════════════════════════════════════════════════════════════
-- GENERATED DELTA of 2026-08-22-farm-catalogues.generated.sql — DO NOT EDIT BY HAND.
--
-- 2026-08-22-farm-catalogues.generated.sql is applied history and FROZEN (tests/generated-frozen.json).
-- These are the rows the data in src/** now wants that differ from it (plus
-- any deltas already applied on top), as idempotent upserts and keyed deletes.
-- Written by tools/generated-freeze.mjs on behalf of the gen-* tool that owns
-- the base; that tool's --check fails if this file is stale. Apply AFTER every
-- other migration (it is last in tests/schema-apply-order.json); once applied,
-- the Coordinator pins it in tests/generated-frozen.json with deltaOf.
-- ════════════════════════════════════════════════════════════════════════

update public.hr_crops as k set regrow_limit = v.lim
  from (values
  ('dawnbloom', 0)
  ) as v(crop_id, lim)
 where k.crop_id = v.crop_id and k.regrow_limit is distinct from v.lim;

insert into public.hr_crop_plot_tier (crop_id, plot_tier) values
  ('dawnbloom', 5)
on conflict (crop_id) do update set plot_tier = excluded.plot_tier;

-- ── SELF-CHECK (executed): every row landed, every delete held, owned
--    tables hold exactly the catalogue's row count. ─────────────────────
do $$
declare v_n bigint;
begin
  if not exists (select 1 from public.hr_crop_plot_tier where crop_id is not distinct from 'dawnbloom' and plot_tier is not distinct from 5) then raise exception 'delta: hr_crop_plot_tier row dawnbloom did not land'; end if;
  select count(*) into v_n from public.hr_crop_plot_tier;
  if v_n <> 10 then raise exception 'delta: hr_crop_plot_tier holds % rows, the catalogue has 10', v_n; end if;
end $$;
