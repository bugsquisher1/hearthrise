-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-deep-seam.sql
--
-- ONE DATA CLOSURE, NO FUNCTION BODY, NO GRANT, NO NEW OBJECT, NO VALUE MOVED:
--
--   §1(a) NINE new `hr_items` rows — three mined materials (verdite_ore,
--         flux_salt, heartgarnet), one bar (verdite_bar) and the FIVE
--         EQUIPPABLE pieces it forges, each carrying its wield gate
--         (req_skill/req_lv) in the columns hr_apply re-checks.
--   §1(b) FIVE new `hr_item_slots` rows — helmet / body / pants / weapon ×2.
--   §1(c) TEN new `hr_activities` rows — four `gather`/mining nodes at req
--         36/40/48/56 and six `artisan`/smithing rows at req 42/45/46/47/50/52.
--
-- "Deep Seam" — game-designer ruling, 2026-09-13.
--
-- ── THE HOLE THIS CLOSES (three measurements, not an opinion) ──────────────
--   1. THE SMITH'S ORE SUPPLY DID NOT CHANGE FROM MINING 15 TO MINING 60.
--      `ROCKS` ran copper(1) iron(15) coal(30) gold(45) richcoal(52)
--      mithril(60). Coal is a reagent, Rich Coal is more coal and Gold makes
--      jewellery only (there is no gold armour tier) — so a player crossing
--      Mining 36→56 mined nothing that became a piece of ARMOUR, and the one
--      15-level silence on the table (30→45) sat in the middle of it.
--   2. SMITHING HAD NO BAR BETWEEN STEEL (35) AND MITHRIL (55).
--      Twenty levels, and the rungs in between are forges for bars the player
--      cannot yet smelt (see the note at the end of this header).
--   3. THE WIELD LADDER JUMPED DEFENCE 30 → 45. Every armour piece in the game
--      gates on `defense` at a MATERIAL_TIERS level (1/15/30/45/60/75/88), so
--      between Steel and Mithril there was NOTHING to put on — measured across
--      all six armour slots and both weapon families.
--   VERDITE closes all three with four nodes, one bar, five pieces: the three
--   plate pieces gate at DEFENCE 38, the blade at ATTACK 38 and the maul at
--   ATTACK 42 (armour reads `defense`, a weapon reads its own style — the rows
--   always said so, an earlier draft of this line did not), and every forge
--   rung is makeable at its own level.
--
-- ⚠ THE BAND IS DELIBERATELY NOT A FULL SET. Helm, platebody, platelegs, a
--   sword and a maul; boots, gauntlets and belt stay Steel or Mithril. A
--   complete eighth tier would mean a new `MATERIAL_TIERS` row, which generates
--   18 armour pieces × 3 archetype lines + 4 weapon families and RE-INDEXES
--   every per-tier stat array in src/data/gear-tiers.js. Verdite is
--   hand-authored for the same reason the Watchknight's deathsteel is: a bridge
--   is a handful of pieces, and a mix-and-match decision is better content than
--   a free full-set upgrade.
--
-- ── WHAT THE SERVER NEEDS, AND WHAT IT DOES NOT ────────────────────────────
--   hr_activities   hr_apply's activity arm (2026-08-11-apply-engine.sql §4a)
--                   refuses an id with no row (`unknown_activity`) and
--                   re-checks req_skill/req_lv against SERVER xp
--                   (`activity_locked`). These ten rows ARE the server half of
--                   "the tile can be started".
--   hr_items        `req_skill`/`req_lv` are the EQUIP gate hr_apply re-checks
--                   (2026-09-12-equippable-req-lv.sql). Five tradeable pieces
--                   with a NULL gate would let the market sell 28 defence and
--                   a 15/12 sword to a level-1 account, which is the exact
--                   defect that file was written for. `value` is what the
--                   vendor and the market read.
--   hr_item_slots   hr_apply refuses an equip into a slot the item does not
--                   declare. A piece with no pair CANNOT be worn at all.
--   (NOT hr_feast_foods — nothing in this batch is food. `heals` is NULL and
--    `auto_eatable` is FALSE on all nine rows, asserted in §2(a2): a material
--    or a plate leg in the auto-eat pool would be eaten to heal.)
--
-- ⚠ `xp`, `ms`, YIELD AND THE RECIPE INPUT MAPS ARE NOT IN THIS DATABASE, AND
--   ARE NOT ASSERTED HERE. `hr_activities` holds (kind, activity_id, req_skill,
--   req_lv, max_hp, is_boss) — no yield columns and no input list; a node's
--   XP/action time and a recipe's inputs reach the server through the EDGE
--   PAYLOAD, which imports src/data/{gathering,recipes}.js directly
--   (supabase/functions/hr-accrue/catalogue.js). §2 asserts the columns the
--   DATABASE owns, exactly. The xp/ms half is pinned by the in-page ladder
--   guards (b226 strictly-increasing paced xp/sec, b390 the ≥6% full-tier
--   margin) and by DEEPSEAM-1..5 in src/features/smoke-test.js. Do NOT
--   "improve" this file by hand-copying the XP numbers into SQL: that is the
--   data double-copy this repo has been burned by twice, and here the copy
--   would be a FAUCET.
--
--   MEASURED PACING, FOR THE REVIEWER (the guards read the PACED series, which
--   is floor(xp × PACE.xp) ÷ pacedActionMs(ms) and therefore differs from the
--   book xp÷ms — quoting only one of them reads as arithmetic that does not
--   reproduce):
--     PACED  coal 2.5000 → 2.5202 → 2.5735 → gold 2.6786 → 2.7138
--            → richcoal 2.7861 → 2.8736 → mithril 2.9688     (strictly up)
--     BOOK   coal 10.36 → 10.48 → 10.59 → gold 11.29 → 11.18 → 11.69 → 11.84
--   Every new req gap is ≤ 6, so none owes the full-tier margin; the 15-level
--   30→45 jump that DID owe it is now three short steps with the same product.
--
--   CONSEQUENCE FOR THE CUT: hr-accrue MUST be redeployed with the client push
--   that carries these rows, or an away window on a new node/recipe resolves
--   against a payload that has never heard of it (`unknown_node` /
--   `unknown_recipe`, REFUSED — it fails closed, which is why this is a
--   deploy-order note and not a P0).
--
-- ── THE ECONOMY HALF, MEASURED (no new faucet) ─────────────────────────────
-- All three mined materials are RAW (src/data/items.js derives `raw` from
-- ROCKS[*].prod), so the vendor bids 20% and the gold-per-minute of the new
-- rungs is seated inside the existing curve rather than above it. ⚠ MEASURED ON
-- pacedActionMs FOR EVERY ROW — an earlier draft of this line quoted rich coal
-- on BOOK ms (144) while the other six were paced, which made the series read
-- as arithmetic that does not reproduce:
--     coal(30) 55 · VERDITE(36) 67 · fluxsalt(40) 74 · richcoal(52) 90
--     · gold(45) 107 · DEEP VERDITE(48) 136 · HEARTGARNET(56) 172
--     · mithril(60) 188  g/min
-- STATED PLAINLY, because the corrected number changes the ranking rather than
-- a decimal: DEEP VERDITE (Mining 48) is the BEST gold/min mining node in the
-- game until Heartgarnet at 56, and it pays more than both the Rich Coal Seam
-- (52) and Gold Rock (45) that sit around it. That is deliberate on both sides —
-- rich coal is a cheap REAGENT node bought for throughput (2-3 coal a swing at
-- 8 g each), not a gold rung, and it stays the fastest coal in the game; and the
-- deep seam's gold is the same 20% raw bid on an ore worth 55, i.e. it is paid
-- for by the ore the armour set needs 10 of. The rung it must not beat is
-- Mithril (60), and it does not: 136 against 188.
-- The bar turns 31 g of bid material into a 320 g good (10.3×), between the
-- gold bar's 7.8× and the mithril bar's 16.3×. Gear values are the slot's own
-- vmul × 9, the midpoint of Steel's (5) and Mithril's (15) economic multiplier,
-- so every piece prices strictly between its steel and mithril twin.
--
-- ── A DEFECT THIS FILE DOES *NOT* FIX, AND WHY ─────────────────────────────
-- Measured while pacing this band: 57 SHIPPED rungs (34 of them smithing)
-- require a material their own level cannot MAKE — steel_gauntlets 31 vs the
-- steel bar at 35; twelve mithril rungs 46-54 vs the mithril bar at 55; the
-- same shape at rune, ember and dawn, plus the arrow and jewellery lanes. The
-- cause is structural: the generated curve gates gear at
-- `MATERIAL_TIERS[t].smith + slot.lvOff` while the bar rows sit 5-10 levels
-- above their tier's gate. NOT "unobtainable" — steel/mithril/rune bars are
-- also shop stock and monster drops, so the rung is craftable with bought or
-- looted stock; what is broken is SELF-SUPPLY, the thing the smithing screen
-- teaches. The mithril half cannot be fixed by lowering `smelt_mithril`
-- either, because mithril ORE needs Mining 60 regardless. Re-cutting the gear
-- curve is a balance program with an economy review, not a content batch: it
-- is filed in DISCOVERIES.md with the full list, and the new in-page guard
-- DEEPSEAM-5 FREEZES the count at 57 so the class can only shrink. Every rung
-- in THIS file has the self-supply property the other 57 do not.
--
-- ── WHY A PATCH FILE AND NOT JUST THE REGENERATED CATALOGUE ────────────────
-- 2026-08-11-catalogue.generated.sql (same branch, regenerated: digest
-- 095fdff0…, 538 items was 529, 280 item-slot pairs was 275, 503 activities was
-- 493) carries all three sections durably — it DELETEs and re-INSERTs those
-- tables wholesale. But it moves 538 item rows and the start kit with them and
-- is re-applied on its own cadence. This file moves exactly 24 rows, is
-- idempotent, and can be applied on its own at the cut. Apply either and the
-- three tables land in the same state; §2 asserts the ruled values from
-- RESTATED literals, so the two records cannot drift apart in silence.
--
-- ⚠ ORDER: apply this BEFORE the client push that offers the tiles. Applied
--   first it is invisible — nothing declares an activity id the client does not
--   render, and an item nobody owns is inert. Pushed first, a player who clicks
--   Verdite Seam is refused `unknown_activity` by the realm: no corruption, but
--   a visible dead button.
--
-- REVERSIBILITY (net-zero, no value to claw back):
--   delete from public.hr_activities where (kind, activity_id) in
--     (('gather','verdite_seam'),('gather','fluxsalt_pocket'),
--      ('gather','deep_verdite_seam'),('gather','heartgarnet_geode'),
--      ('artisan','smelt_verdite'),('artisan','forge_verdite_helm'),
--      ('artisan','forge_verdite_blade'),('artisan','forge_verdite_platelegs'),
--      ('artisan','forge_verdite_platebody'),('artisan','forge_heartgarnet_maul'));
--   delete from public.hr_item_slots where item_id in
--     ('verdite_helm','verdite_platebody','verdite_platelegs','verdite_blade',
--      'heartgarnet_maul');
--   delete from public.hr_items where item_id in
--     ('verdite_ore','flux_salt','heartgarnet','verdite_bar','verdite_helm',
--      'verdite_platebody','verdite_platelegs','verdite_blade','heartgarnet_maul');
-- The hr_items delete is the one with a caveat and it is deliberate: once a
-- player HAS mined a verdite ore, `player_inventory` holds a row the catalogue
-- no longer names, and the vendor/market readers all join hr_items — they would
-- stop seeing it rather than mis-price it. Worse for the gear: deleting an
-- hr_item_slots pair for a piece somebody is WEARING leaves a worn item the
-- equip gate no longer recognises. So the honest rollback after any play is the
-- activity delete only (the tiles disappear, the stacks sit inert), exactly as
-- re-applying the catalogue from a commit before this branch would leave it. A
-- character left pointing at a deleted activity is NOT stranded: hr_apply
-- refuses the next declaration and accrual refuses to pay rather than throwing.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. THE RULED ROWS ──────────────────────────────────────────────────────
-- Three statements, all idempotent, all preceded by EXISTENCE checks. No
-- begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends the file as one
-- batch).
do $$
declare
  v_missing text;
  v_rows    int;
  -- (a) item_id · name · kind · value · req_skill · req_lv.
  --     `tradeable` is TRUE for all nine (the ruling: no bop — a bridge tier a
  --     clan can outfit a new fighter with is the point) and `heals` is NULL
  --     with `auto_eatable` FALSE on every row: nothing here is food.
  --     The four materials carry a NULL kind and a NULL gate; the five pieces
  --     carry BOTH halves of their gate, because req_lv without req_skill (or
  --     the reverse) short-circuits the equip check into "no requirement".
  v_items constant jsonb := '[
    ["verdite_ore",       "Verdite Ore",        null,      55,  null,      null],
    ["flux_salt",         "Fluxsalt",           null,      45,  null,      null],
    ["heartgarnet",       "Heartgarnet",        null,     200,  null,      null],
    ["verdite_bar",       "Verdite Bar",        null,     320,  null,      null],
    ["verdite_helm",      "Verdite Helm",       "armor",  1080, "defense",   38],
    ["verdite_platebody", "Verdite Platebody",  "armor",  2700, "defense",   38],
    ["verdite_platelegs", "Verdite Platelegs",  "armor",  1980, "defense",   38],
    ["verdite_blade",     "Verdite Blade",      "weapon",  900, "attack",    38],
    ["heartgarnet_maul",  "Heartgarnet Maul",   "weapon",  990, "attack",    42]
  ]'::jsonb;
  -- (b) item_id · equip_slot. The pair a piece needs to be wearable at all.
  v_slots constant jsonb := '[
    ["verdite_helm",      "helmet"],
    ["verdite_platebody", "body"],
    ["verdite_platelegs", "pants"],
    ["verdite_blade",     "weapon"],
    ["heartgarnet_maul",  "weapon"]
  ]'::jsonb;
  -- (c) kind · activity_id · req_skill · req_lv.
  v_acts constant jsonb := '[
    ["gather", "verdite_seam",            "mining",   36],
    ["gather", "fluxsalt_pocket",         "mining",   40],
    ["gather", "deep_verdite_seam",       "mining",   48],
    ["gather", "heartgarnet_geode",       "mining",   56],
    ["artisan","smelt_verdite",           "smithing", 42],
    ["artisan","forge_verdite_helm",      "smithing", 45],
    ["artisan","forge_verdite_blade",     "smithing", 46],
    ["artisan","forge_verdite_platelegs", "smithing", 47],
    ["artisan","forge_verdite_platebody", "smithing", 50],
    ["artisan","forge_heartgarnet_maul",  "smithing", 52]
  ]'::jsonb;
  -- What the five forges consume beyond this file's own rows. NOT a server rule
  -- (the engine reads the input map from the edge payload) but every id must be
  -- a catalogue item or the inventory debit has nothing to name.
  v_inputs constant text[] := array['willow_plank'];
begin
  if jsonb_array_length(v_items) <> 9 or jsonb_array_length(v_slots) <> 5
     or jsonb_array_length(v_acts) <> 10 then
    raise exception '§1: the rule holds %/%/% rows, the ruling names 9 items, 5 slot pairs and 10 activities',
      jsonb_array_length(v_items), jsonb_array_length(v_slots), jsonb_array_length(v_acts);
  end if;

  -- PRECONDITIONS. `mining` and `smithing` must be real skills, and `defense`
  -- and `attack` must be too — a gate naming a skill with no hr_skills row can
  -- never be satisfied, so the piece would be unwearable forever.
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(array['mining','smithing','defense','attack']) x
   where not exists (select 1 from public.hr_skills where skill_id = x);
  if v_missing is not null then
    raise exception '§1: hr_skills has no `%` row — apply '
                    '2026-08-11-catalogue.generated.sql first', v_missing;
  end if;
  if to_regclass('public.hr_item_slots') is null then
    raise exception '§1: public.hr_item_slots is missing — apply '
                    '2026-08-11-catalogue.generated.sql first';
  end if;
  -- Every equip_slot named must be a REAL slot on the doll, or the pair is a
  -- row hr_apply will never match.
  select string_agg(distinct e->>1, ', ') into v_missing
    from jsonb_array_elements(v_slots) e
   where not exists (select 1 from public.hr_equip_slots s where s.equip_slot = e->>1);
  if v_missing is not null then
    raise exception '§1: equip slot(s) % are not in hr_equip_slots — the pair could never match', v_missing;
  end if;
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(v_inputs) x
   where not exists (select 1 from public.hr_items i where i.item_id = x);
  if v_missing is not null then
    raise exception '§1: a Deep Seam forge consumes %, which is not a catalogue item and is '
                    'not created by this file — the debit would have nothing to name', v_missing;
  end if;

  -- (a) NINE ITEM ROWS. `on conflict do update` rather than a plain insert so a
  --     re-apply after a re-value lands the new number instead of failing on
  --     the primary key.
  insert into public.hr_items
      (item_id, name, tradeable, kind, value, req_skill, req_lv, heals, auto_eatable)
  select r.item_id, r.name, true, r.kind, r.value, r.req_skill, r.req_lv, null, false
    from jsonb_array_elements(v_items) e
    cross join lateral (select e->>0 as item_id, e->>1 as name, e->>2 as kind,
                               (e->>3)::bigint as value, e->>4 as req_skill,
                               (e->>5)::int as req_lv) r
      on conflict (item_id) do update
         set name = excluded.name, tradeable = excluded.tradeable, kind = excluded.kind,
             value = excluded.value, req_skill = excluded.req_skill,
             req_lv = excluded.req_lv, heals = excluded.heals,
             auto_eatable = excluded.auto_eatable
       where public.hr_items.name      is distinct from excluded.name
          or public.hr_items.kind      is distinct from excluded.kind
          or public.hr_items.value     is distinct from excluded.value
          or public.hr_items.req_skill is distinct from excluded.req_skill
          or public.hr_items.req_lv    is distinct from excluded.req_lv
          or public.hr_items.heals     is distinct from excluded.heals
          or public.hr_items.tradeable is distinct from excluded.tradeable
          or public.hr_items.auto_eatable is distinct from excluded.auto_eatable;
  get diagnostics v_rows = row_count;
  raise notice 'deep-seam §1(a): % of 9 item rows moved (0 on a re-apply)', v_rows;

  -- (b) FIVE SLOT PAIRS. The table is (item_id, equip_slot) primary key with no
  --     other column, so the conflict clause is a plain do-nothing.
  insert into public.hr_item_slots (item_id, equip_slot)
  select e->>0, e->>1 from jsonb_array_elements(v_slots) e
      on conflict (item_id, equip_slot) do nothing;
  get diagnostics v_rows = row_count;
  raise notice 'deep-seam §1(b): % of 5 slot pairs moved (0 on a re-apply)', v_rows;

  -- (c) TEN ACTIVITY ROWS. max_hp/is_boss are RESTATED (not defaulted) because
  --     the catalogue's own self-check asserts a non-combat row carries neither.
  insert into public.hr_activities (kind, activity_id, req_skill, req_lv, max_hp, is_boss)
  select r.kind, r.activity_id, r.req_skill, r.req_lv, null, false
    from jsonb_array_elements(v_acts) e
    cross join lateral (select e->>0 as kind, e->>1 as activity_id,
                               e->>2 as req_skill, (e->>3)::int as req_lv) r
      on conflict (kind, activity_id) do update
         set req_skill = excluded.req_skill, req_lv = excluded.req_lv,
             max_hp = excluded.max_hp, is_boss = excluded.is_boss
       where public.hr_activities.req_skill is distinct from excluded.req_skill
          or public.hr_activities.req_lv    is distinct from excluded.req_lv
          or public.hr_activities.max_hp    is distinct from excluded.max_hp
          or public.hr_activities.is_boss   is distinct from excluded.is_boss;
  get diagnostics v_rows = row_count;
  raise notice 'deep-seam §1(c): % of 10 activity rows moved (0 on a re-apply)', v_rows;
end $$;

-- ── 2. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Every claim is proved by EXECUTING it, never by a marker or a string match on
-- a body. The apply is atomic, so a raise here reverts §1. The row-writing
-- probes run in a subtransaction discarded by the HR812 sentinel, so this block
-- is net-zero on production and §2 of CLAUDE.md ("player state is never
-- fabricated") holds: no probe row survives.
do $$
declare
  v_bad     text;
  v_r       jsonb;
  v_ver     bigint;
  v_n       int;
  v_xp35    bigint;
  v_xp36    bigint;
  v_xp37    bigint;
  v_xp38    bigint;
  v_uid     constant uuid := '00000000-0000-4000-8000-0000b5450003';
  c_j       constant jsonb := '{"kind":"admin","intent":"b545:deep-seam-probe"}'::jsonb;
begin
  -- (a) THE NINE ITEMS EXIST WITH THE RULED NAME, KIND, VALUE AND WIELD GATE.
  --     The literal is RESTATED here (not read from §1) so a hand-edit that
  --     dropped a row from §1 cannot also silence its own check. The count is
  --     the CONTROL: the join is INNER, so a MISSING row would pass the value
  --     filter in silence.
  select count(*),
         string_agg(i.item_id || '=' || i.name || '/' || coalesce(i.kind,'NULL') || '/' || i.value
                      || '/' || coalesce(i.req_skill,'NULL') || ' ' || coalesce(i.req_lv::text,'NULL')
                      || ' (want ' || x.name || '/' || coalesce(x.kind,'NULL') || '/' || x.value
                      || '/' || coalesce(x.req_skill,'NULL') || ' ' || coalesce(x.req_lv::text,'NULL') || ')',
                    ', ' order by i.item_id)
           filter (where i.name      is distinct from x.name
                      or i.kind      is distinct from x.kind
                      or i.value     is distinct from x.value
                      or i.req_skill is distinct from x.req_skill
                      or i.req_lv    is distinct from x.req_lv
                      or not i.tradeable)
    into v_n, v_bad
    from (values
      ('verdite_ore',      'Verdite Ore',       null::text, 55::bigint,   null::text, null::int),
      ('flux_salt',        'Fluxsalt',          null,       45,           null,       null),
      ('heartgarnet',      'Heartgarnet',       null,       200,          null,       null),
      ('verdite_bar',      'Verdite Bar',       null,       320,          null,       null),
      ('verdite_helm',     'Verdite Helm',      'armor',    1080,         'defense',  38),
      ('verdite_platebody','Verdite Platebody', 'armor',    2700,         'defense',  38),
      ('verdite_platelegs','Verdite Platelegs', 'armor',    1980,         'defense',  38),
      ('verdite_blade',    'Verdite Blade',     'weapon',   900,          'attack',   38),
      ('heartgarnet_maul', 'Heartgarnet Maul',  'weapon',   990,          'attack',   42)
    ) as x(item_id, name, kind, value, req_skill, req_lv)
    join public.hr_items i on i.item_id = x.item_id;
  if v_n <> 9 then
    raise exception 'GATE(a) CONTROL: hr_items holds % of the 9 Deep Seam ids — every missing one '
                    'is an item the client can put in a bag that the vendor, the market and the '
                    'equip gate all join hr_items to read, and therefore cannot see', v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(a): a Deep Seam item did not land as ruled: %', v_bad;
  end if;

  -- (a2) NOTHING IN THIS BATCH IS FOOD. `heals` NULL and `auto_eatable` false on
  --      all nine: a material or a plate leg with a heal is something the
  --      auto-eat loop would spend in a fight, and the pool is read by hr_rest
  --      and the recovery arm as `auto_eatable and heals > 0`.
  select string_agg(item_id || ' heals=' || coalesce(heals::text,'NULL')
                      || ' auto=' || auto_eatable, ', ' order by item_id)
    into v_bad
    from public.hr_items
   where item_id in ('verdite_ore','flux_salt','heartgarnet','verdite_bar','verdite_helm',
                     'verdite_platebody','verdite_platelegs','verdite_blade','heartgarnet_maul')
     and (heals is not null or auto_eatable);
  if v_bad is not null then
    raise exception 'GATE(a2): a Deep Seam row is in the auto-eat pool (%) — nothing in this batch '
                    'is food', v_bad;
  end if;

  -- (a3) THE FIVE PIECES DECLARE EXACTLY THEIR OWN SLOT. A piece with no pair
  --      cannot be equipped at all; a piece with an EXTRA pair can be worn in a
  --      slot it was never balanced for (two weapons, or a helm in the belt).
  select count(*), string_agg(s.item_id || '→' || s.equip_slot, ', ' order by s.item_id)
    into v_n, v_bad
    from public.hr_item_slots s
   where s.item_id in ('verdite_helm','verdite_platebody','verdite_platelegs',
                       'verdite_blade','heartgarnet_maul');
  if v_n <> 5 then
    raise exception 'GATE(a3): the five pieces hold % slot pairs, the ruling names exactly 5 '
                    '(got: %) — a missing pair is an unwearable item, an extra one is a piece '
                    'wearable in a slot it was never balanced for', v_n, v_bad;
  end if;
  select string_agg(x.item_id, ', ' order by x.item_id) into v_bad
    from (values
      ('verdite_helm','helmet'),('verdite_platebody','body'),('verdite_platelegs','pants'),
      ('verdite_blade','weapon'),('heartgarnet_maul','weapon')
    ) as x(item_id, equip_slot)
   where not exists (select 1 from public.hr_item_slots s
                      where s.item_id = x.item_id and s.equip_slot = x.equip_slot);
  if v_bad is not null then
    raise exception 'GATE(a3): pair(s) missing for %', v_bad;
  end if;

  -- (b) THE TEN ACTIVITY ROWS, restated literally for the same reason.
  select count(*),
         string_agg(a.activity_id || '=' || coalesce(a.req_skill,'NULL') || '/'
                      || coalesce(a.req_lv::text,'NULL')
                      || ' (want ' || x.req_skill || '/' || x.req_lv || ')', ', '
                    order by a.activity_id)
           filter (where a.req_skill is distinct from x.req_skill
                      or a.req_lv is distinct from x.req_lv
                      or a.max_hp is not null or a.is_boss)
    into v_n, v_bad
    from (values
      ('gather','verdite_seam','mining',36),('gather','fluxsalt_pocket','mining',40),
      ('gather','deep_verdite_seam','mining',48),('gather','heartgarnet_geode','mining',56),
      ('artisan','smelt_verdite','smithing',42),('artisan','forge_verdite_helm','smithing',45),
      ('artisan','forge_verdite_blade','smithing',46),
      ('artisan','forge_verdite_platelegs','smithing',47),
      ('artisan','forge_verdite_platebody','smithing',50),
      ('artisan','forge_heartgarnet_maul','smithing',52)
    ) as x(kind, activity_id, req_skill, req_lv)
    join public.hr_activities a on a.kind = x.kind and a.activity_id = x.activity_id;
  if v_n <> 10 then
    raise exception 'GATE(b) CONTROL: hr_activities holds % of the 10 new rows — every missing '
                    'one is a tile the client offers and the realm answers unknown_activity for',
                    v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(b): a Deep Seam activity did not land as ruled: %', v_bad;
  end if;

  -- (b2) THE MINING BENCH IS STILL ONE RUNG PER LEVEL AND NONE OF THEM IS
  --      UNGATED. A NULL req_lv short-circuits hr_apply's whole gate, and two
  --      rungs on the same level is the b348 defect class (the client renders a
  --      locked tile above an unlocked one). Asserted over the WHOLE bench, old
  --      rows included, because this file inserts into the middle of it.
  select string_agg(activity_id, ', ' order by activity_id) into v_bad
    from public.hr_activities
   where kind = 'gather' and req_skill = 'mining' and req_lv is null;
  if v_bad is not null then
    raise exception 'GATE(b2): a mining node has a NULL req_lv (%) — hr_apply short-circuits '
                    'its gate on NULL, so that node is ungated', v_bad;
  end if;
  select count(*) into v_n from (
    select req_lv from public.hr_activities
     where kind = 'gather' and req_skill = 'mining'
     group by req_lv having count(*) > 1) d;
  if v_n > 0 then
    raise exception 'GATE(b2): % mining level(s) carry more than one node — the bench ladder is '
                    'no longer one rung per level', v_n;
  end if;
  select count(*) into v_n from public.hr_activities
   where kind = 'gather' and req_skill = 'mining';
  if v_n <> 12 then
    raise exception 'GATE(b3): the mining bench holds % nodes, the ruling leaves 12 (8 shipped + '
                    '4 new). A 13th means a node was added without the ladder being re-read', v_n;
  end if;
  select count(*) into v_n from public.hr_activities
   where kind = 'artisan' and req_skill = 'smithing';
  if v_n <> 115 then
    raise exception 'GATE(b3): the smithing bench holds % rows, the ruling leaves 115 (109 '
                    'shipped + 6 new — counted off the regenerated catalogue, which includes the '
                    'generated gear ladders, not only BASE_RECIPES.smithing)', v_n;
  end if;

  -- (c) THE WIELD GATES ARE SEATED BETWEEN THE RUNGS THEY BRIDGE. This is the
  --     design property of the whole batch and it is checkable in SQL from the
  --     catalogue alone: every verdite piece must gate ABOVE its steel twin and
  --     BELOW its mithril twin, or the bridge is not a bridge.
  select string_agg(x.new_id || ' ' || n.req_lv || ' vs steel ' || s.req_lv
                      || ' / mithril ' || m.req_lv, ', ' order by x.new_id)
    into v_bad
    from (values
      ('verdite_helm','steel_helm','mithril_helm'),
      ('verdite_platebody','steel_platebody','mithril_platebody'),
      ('verdite_platelegs','steel_platelegs','mithril_platelegs'),
      ('verdite_blade','steel_sword','mithril_sword')
    ) as x(new_id, steel_id, mithril_id)
    join public.hr_items n on n.item_id = x.new_id
    join public.hr_items s on s.item_id = x.steel_id
    join public.hr_items m on m.item_id = x.mithril_id
   where n.req_lv is null or s.req_lv is null or m.req_lv is null
      or n.req_lv <= s.req_lv or n.req_lv >= m.req_lv;
  if v_bad is not null then
    raise exception 'GATE(c): a verdite piece is not seated between its steel and mithril twin '
                    '(%) — the bridge tier either duplicates a rung the player already has or '
                    'sits at/above the tier it is meant to precede', v_bad;
  end if;

  -- (d) EXECUTED: hr_apply REFUSES A MINING-35 CHARACTER `verdite_seam` (req
  --     36) AND ACCEPTS IT AT 36. This is the property the four gather rows
  --     exist for and the one the catalogue alone cannot prove — before §1 the
  --     same call answers `unknown_activity`, which is a refusal for the WRONG
  --     reason, and after a mis-typed req_lv it would answer `ok` at 35.
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(d) CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  select xp into v_xp35 from public.hr_xp_table where level = 35;
  select xp into v_xp36 from public.hr_xp_table where level = 36;
  select xp into v_xp37 from public.hr_xp_table where level = 37;
  select xp into v_xp38 from public.hr_xp_table where level = 38;
  if v_xp35 is null or v_xp36 is null or v_xp37 is null or v_xp38 is null
     or v_xp36 <= v_xp35 or v_xp38 <= v_xp37 then
    raise exception 'GATE(d) CANNOT RUN: hr_xp_table has no usable 35/36/37/38 rungs (%/%/%/%)',
      v_xp35, v_xp36, v_xp37, v_xp38;
  end if;
  begin  -- ── SUBTRANSACTION ────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then
      raise exception 'GATE(d): no probe character: %', v_r; end if;

    -- Mining 35: one level short of the first new rung.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, 'mining', v_xp35)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    if public.hr_level_from_xp(v_xp35) <> 35 then
      raise exception 'GATE(d) CANNOT RUN: % xp is level %, not 35',
        v_xp35, public.hr_level_from_xp(v_xp35);
    end if;

    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','gather','id','verdite_seam','restart',true),
               'journal', c_j));
    if v_r->>'error' is distinct from 'activity_locked' then
      raise exception 'GATE(d): Mining 35 declaring verdite_seam answered % — it must be '
                      'activity_locked. `unknown_activity` means §1(c) did not land; `ok` means '
                      'the node is off its ruled level and the rung is free', v_r;
    end if;
    if (select active_kind from public.player_state where user_id = v_uid and slot = 0) <> 'idle' then
      raise exception 'GATE(d): the refused declaration still moved player_state.active_kind';
    end if;

    -- POSITIVE CONTROL #1 — the SAME character, the SAME verb, the OLD rung it
    -- HAS the level for (`coal_rock`, req 30). Without this a build that broke
    -- gather declarations outright would "pass" the refusal above and prove
    -- nothing about the level.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','gather','id','coal_rock','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(d) CONTROL: Mining 35 was refused coal_rock (req 30) — % — so gather '
                      'declarations are broken and the refusal above measured nothing', v_r;
    end if;

    -- POSITIVE CONTROL #2 — ONE level of Mining is the whole difference. Same
    -- character, same id, xp raised to the level-36 rung.
    update public.player_skills set xp = v_xp36
     where user_id = v_uid and slot = 0 and skill_id = 'mining';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','gather','id','verdite_seam','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(d) CONTROL: Mining 36 was still refused verdite_seam (%) — the node '
                      'is gated ABOVE its ruled level and the rung is unreachable', v_r;
    end if;
    if (select active_id from public.player_state where user_id = v_uid and slot = 0)
         is distinct from 'verdite_seam' then
      raise exception 'GATE(d) CONTROL: the accepted declaration did not become the live pointer';
    end if;

    -- (e) EXECUTED: THE WIELD GATE BITES AT DEFENCE 37 AND OPENS AT 38. The
    --     five pieces are TRADEABLE, so without the req_skill/req_lv columns
    --     landing in hr_items the market sells 28 defence and a 15/12 sword to
    --     a level-1 account (the 2026-09-12-equippable-req-lv.sql defect). The
    --     character OWNS the piece, so a refusal can only be the requirement
    --     and never `insufficient_item`.
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, 'verdite_platebody', 1), (v_uid, 0, 'steel_platebody', 1)
      on conflict (user_id, slot, item_id) do update set qty = 1;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, 'defense', v_xp37)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('equip', jsonb_build_object('body','verdite_platebody'),
                                'journal', c_j));
    if v_r->>'error' is distinct from 'requirement_not_met'
       or v_r->>'item_id' is distinct from 'verdite_platebody' then
      raise exception 'GATE(e): a Defence 37 character equipping verdite_platebody answered % — '
                      'it must be requirement_not_met/verdite_platebody, or the 28-defence '
                      'bridge piece is wearable by anyone who can buy one', v_r;
    end if;
    if exists (select 1 from public.player_equipment
                where user_id = v_uid and slot = 0 and equip_slot = 'body') then
      raise exception 'GATE(e): the refused equip still wrote player_equipment';
    end if;

    -- POSITIVE CONTROL — the STEEL piece the same character HAS the level for
    -- (Defence 30) equips right now. Without it a build that broke equipping
    -- outright would "pass" the refusal above.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('equip', jsonb_build_object('body','steel_platebody'),
                                'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(e) CONTROL: Defence 37 was refused steel_platebody (req 30) — % — so '
                      'equipping is broken and the refusal above measured nothing', v_r;
    end if;

    -- POSITIVE CONTROL — ONE level of Defence is the whole difference.
    update public.player_skills set xp = v_xp38
     where user_id = v_uid and slot = 0 and skill_id = 'defense';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('equip', jsonb_build_object('body','verdite_platebody'),
                                'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(e) CONTROL: Defence 38 was still refused verdite_platebody (%) — the '
                      'piece is gated above its ruled level and the bridge is unreachable', v_r;
    end if;
    if not exists (select 1 from public.player_equipment
                    where user_id = v_uid and slot = 0 and equip_slot = 'body'
                      and item_id = 'verdite_platebody') then
      raise exception 'GATE(e) CONTROL: the accepted equip did not land in player_equipment — the '
                      'hr_item_slots pair from §1(b) is what makes the slot legal';
    end if;

    raise exception using errcode = 'HR812',
      message = 'deep-seam §2 complete — rolling back';
  exception when sqlstate 'HR812' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF. Without this the file seeds a character into production as a
  -- side effect of verifying itself, which CLAUDE.md §2 forbids outright.
  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from auth.users              where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row';
  end if;

  raise notice 'deep-seam: 9 items (none food, none auto-eatable), 5 slot pairs, 10 activities '
               '(mining 12 rungs one per level, smithing 115 rows), every verdite wield gate '
               'seated between its steel and mithril twin, hr_apply refuses Mining 35 the '
               'level-36 node and accepts it at 36, and refuses Defence 37 the Verdite Platebody '
               'while equipping it at 38 — all green';
end $$;
