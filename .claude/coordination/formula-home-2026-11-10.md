# Formula home, 2026-11-10 (lane/b-formula-home, base main 18c34c8e7 v0.2.114)

Audit S1 (P1), F2, F3, F11. Tyler 11-08: every formula is public, lives in ONE data source, no hidden cases, the wiki renders it from data.
Measured by reading and by `node` on the real modules (throwaway scripts). File:line is at 18c34c8e7.

## 1. Inventory

Kind: **data** = numbers in `src/data`, **code** = numbers typed in `src/core`, the edge, a tool or SQL. Copies = extra statements beyond the home.

| # | Formula | Home (kind) | Copies, and do they agree | Readers |
|---|---|---|---|---|
| 1 | Hero hit chance | `core/combat.js:42-45` COMBAT_BALANCE (code) | 1: the function types `0.55`, `0.01`, `0.15`, `0.95` again at `combat.js:338-340` and never reads its table. Agree | engine (`member.js` snapshot), client `shell/monster-facts.js`, balance sim |
| 2 | Hero max hit | `combat.js:46-48` (code) | 1: `combat.js:342` types `0.35`, `0.6`, `2` again. Agree | same |
| 3 | Monster defense off a blow, accuracy scaling | `combat.js:49`, `:89` ACC_DEF_MUL (code) | 0 | engine |
| 4 | Monster hit chance | `combat.js:50,58-60` (code) + row `baseAcc` | 1: `data/balance-sheet.js:263` ACC_PER_POINT "restated", test-pinned. Agree | engine, `gen-ground-stats` |
| 5 | Monster biggest blow | `combat.js:64,75` (code) | 1: `balance-sheet.js:261` DAMAGE_SCALE_BY_TIER "restated", test-pinned. Agree | engine, `gen-ground-stats`, scaled hunts |
| 6 | Crit | `combat.js:83-84`, set bonus `tier x 0.01` at `:220` (code) | 0 | engine |
| 7 | Attack speed | `combat.js:82` tickMs 2000 (code) | 0 (`swing_interval_ms` generated, `basic-attack-interval` proves it) | engine, edge, SQL limits |
| 8 | Weakness, bane, element | `combat.js:35,39`, `core/elements.js:57,61`, `core/bane.js:58,61` (code) + `data/elements.js:30` | 0, but three code files. `elements.js:32` says "never in a data row" (against the ruling) | engine, monster cards |
| 9 | Armor: dodge, absorb, ward, cap | `data/core-model.js:147-152` (data), `core/mitigation.js` | 0 | engine |
| 10 | Stance, spell and status multipliers | `data/rule-subjects.js`, `abilities.js`, `statuses.js` (data), `core/hunt/damage.js:84-94` | 0 (in flux on lane/b-area-set) | engine, Configure action |
| 11 | Max HP and mana from Level | `core-model.js:114-121` (data), `core/vitals.js:58-69` | 2: `balance-sheet.js:110` refHp and `tools/balance-sim/grade.mjs:250` type `150 + 10 x L`. **Disagree**: vitals is `150 + 10 x (L-1)`, 10 HP less | engine, edge sheet, `hr_vitals_of` (numbers generated), upgrade plan |
| 12 | HP and mana regen | `core-model.js:123`, `:175`, `data/hunt-tuning.js:38` (data), `vitals.js:72`, `core/hunt/pull-cycle.js:291` | 1: the client retypes the per-second expression at `session/hunt-sections.js:94-100`. Agree | engine, HUD |
| 13 | Level curve | `core-model.js:58-74` (data), `core/xp.js:123-172` | 0 (`hr_level_curve` generated) | engine, edge, SQL, client |
| 14 | Combat skill curve | `core-model.js:109` (data), `xp.js:68-109` | 0 | same |
| 15 | Gather and craft curve (99) | `core/xp.js:24-33` XP_TABLE (code) | 1: `hr_xp_table`, hand-written SQL in `2026-08-11-player-state.sql`, pinned by `core-curves`. Agree. No generator | town work, Skills window, SQL |
| 16 | Level XP a kill, tier XP | `balance-sheet.js:142` STAT_FORMULA.xp, `:255` GROUND_XP_FIT, `:358` TIER_DIALS (data) to `monsters.js` rows | 0 (rows generated, `gen-ground-stats --check`). F3: four per-ground fits and overrides | engine, Hunts window |
| 17 | Solo and party share | `data/party-class-xp.js:56,93`, `hunt-tuning.js:56` + `hunt-grounds.js:461` (data), `core/hunt/xp-share.js:65-71` | 0. `underFloorSharePm` is ruled CUT (Tyler 11-08) and still runs | engine, party panel |
| 18 | Combat skill XP | `core-model.js:165-169`, `data/hunt-xp.js:24` (data), `core/hunt-rewards.js:60,165` | 0 (SQL bound reads generated limits) | engine, SQL |
| 19 | Drop chance and bonuses | row `ch`, row `dropBonus`, `data/loot-bands.js:41`; cap `0.95` at `core/drops.js:64`, bands `:14`, relic cap `core/member.js:58` (code) | 0 | engine, Hunts and monster cards |
| 20 | Gold a kill | `balance-sheet.js:151` STAT_FORMULA.gp (data) to rows | 0 | engine |
| 21 | Sale price, tier sale ladder | function `supabase/functions/hr-accrue/catalogue.js:339-351` (edge only); rates `catalogue.js:306,323` (code) and `data/loot-bands.js:75,84,87` (data) | 2: `data/shops.js:554-557` types all four rates; `tests/vendor-shop-arbitrage.mjs:144-151` retypes the function **without the gear ladder**. Numbers agree | edge sell, `gen-hunt-sessions` (`hr_hunt_vendor_value`), 25 tests, 5 tools. Client shows server bids |
| 22 | Book value `v` (the sale price's input) | `data/items.js` + 11 feeders (data) | **Disagree, 22 rows**: 14 gear rows carry a ladder value and a hand value (iron_sword 130/200, steel_sword 500/800, bronze_belt 50/110, leather_gloves 30/80), 8 ids sit in both `library2-items.js` and `stonecraft.js` (iron_whetstone 55/3). Spread order picks | everything |
| 23 | Shop buy price | rows `data/supply-basics.js:200-242`, `:192` SHOP_PREMIUM (data). The RULE (premium x book, per-point supply rate) is code in a tool, `tools/gen-alpha-catalogue.mjs:87-126` | Edge GOLD_OFFERS is derived from the rows (no copy), `hr_shop_supply_offers` generated. 10 unlisted `equip.*`/`seed.*` price rows in `shops.js` (bronze_sword 100 g, book 50) no shop shows | edge buy, SQL shop view |
| 24 | Store supply and rune prices | `supply-basics.js:83,90` (data) | 0 (`hr_hunt_basic_supplies` generated) | engine, SQL, bar |
| 25 | Death share | `data/hunt-sessions.js:147` (data), `core/action-rules.js:306-320` | 0 (`death_xp_permille` generated) | engine, SQL |
| 26 | Blessings | `data/blessings.js:52-70` (data, price function in the data file) | 0 (`hr_blessing_tiers` generated) | SQL, Services |
| 27 | Stamina cap and refill | `hunt-sessions.js:174`, `data/stamina-refill.js:50-80` (data) | 0 (generated) | SQL, bar |
| 28 | Craft time, XP, burn | rows `recipes.js`; dials `core/pacing.js:17,33,40`, burn `core/artisan.js:36-44` (code) | 0 | edge town tick, Work window |
| 29 | Bench tax | `data/bench-tax.js:22-45`, `core/bench-tax.js` | 0 (generated) | edge, SQL, Work |
| 30 | Tempering | `data/temper.js:17-30`, `core/temper.js` | 0 (generated) | engine, SQL, Temper pane |
| 31 | Farm tiers, prices, regrow, water | `core/farm.js:30,72,116-121` (code); crops `gathering.js` | 2 SQL-typed: `c_max_waterings 8` (agrees with `farm.js:121`) and `c_plant_xp 28`, which exists only in `2027-01-24-skills-from-storage.sql:284` (F12) | SQL farm, Farm window |
| 32 | Scaled-hunt price | `data/scaled-hunts.js:61-88`, `:167-177` | 0 (generated) | SQL, Hunts |
| 33 | Rename, hero slots, sinks | `data/hero-rename.js:33`, `shops.js:58-79`, `gold-sinks.js` | Hand-typed SQL twins held by tests (S14) | SQL |
| 34 | Monster stats | `balance-sheet.js:107-170`, `:282` (data) | 0 | `gen-ground-stats`, scaled hunts, lab |
| 35 | Buffs, perk caps, dry ammo | `core/buffs.js:50`, `core/perks.js:95-97`, `core/ammo.js:64` (code) | 0 | engine |

**Totals.** 35 formulas. 17 have their numbers in data with one evaluator and generated SQL. 13 keep numbers in code (1-8, 15, 19, 28, 31, 35), 1 keeps its function in the edge (21), 1 keeps its rule in a tool (23). 11 extra copies in 8 formulas. Three disagreements: #11 (10 HP), #22 (22 item rows), #21's test copy (no gear ladder).
Not a copy: SQL bodies that read generated rows (`hr_vitals_of`, the death bound) restate the expression, which Postgres must do to re-prove; parity tests hold them.
For the designer: #15's table is RuneScape's XP table number for number (§10). #11's reference hero is one Level above its own Level. F3's per-ground fits need a wiki line each.
F11 is not a home problem: shop prices are already rows a generator reads. The gap is that `hr_apply` does not re-prove `shop_buy` and `vendor_sell` against `hr_shop_supply_offers` and `hr_hunt_vendor_value`. That is a patch on `hr_apply`, which lane/c-server-debt is restating, so it belongs there (after the restate), not in a 14th anchored patch from this lane. No migration is needed for the moves below.

## 2. Design

**One rule.** A formula's numbers live in exactly one `src/data` module. `src/core`, the edge, the tools and SQL hold none: core evaluates, the generators copy rows into SQL, the edge and the client import the same core function.

**Layout.**
- `src/data/formulas/registry.js`: THE REGISTRY, one row per published formula: `{ id, title, says, expr, params, where, evaluator }`. `params` are live references to the frozen data rows (never retyped), `expr` is the expression in the wiki's words, `where` names the one module that holds the numbers, `evaluator` names the core function.
- `src/data/formulas/<system>.js`: rows for formulas with no data home today (`sale.js` now, `combat.js` and `drops.js` after area spells).
- Systems that already have one data home keep it (`core-model.js`, `blessings.js`, `stamina-refill.js`, `scaled-hunts.js`, `temper.js`, `bench-tax.js`, `party-class-xp.js`, `balance-sheet.js`). The registry points at them. Moving twelve working modules would re-aim hundreds of imports and mutant anchors and change no number.
- `src/core/formulas/<system>.js`: evaluators that live in the wrong layer today (the edge's sale price, the tool's shop price rule, the client's regen line). `src/core/formulas/evaluators.js` binds each registry id to its function (`EVALUATORS`), so data never imports core.
- Both trees are dual-runtime: `?v=` imports under `src/`, none outside (`versionQueryGuard`), pure (`core-purity`), packed into the edge by `pack-edge`.

**Authority.** The server computes. The client calls an evaluator only to draw a number the envelope also carries or the server will re-prove. No evaluator output is ever sent as an intent value.

**The guard, `tests/formula-single-source.mjs`.** Reads the registry and fails when: a constant a row names is exported twice, or from outside `src/data` (one-home); anything in `src/`, the edge or `tools/` gives one of those constants, a `keys` name or a retired name a number (typed-again); a file under `src/core/formulas` types a number other than 0, 1 and 1000 (core-clean); a row has no evaluator, or an evaluator no row (bound); a listed reader stops calling the evaluator (reader); a row holds something a wiki cannot print or that is not frozen (shape). Known copies that wait for area spells sit in PENDING, which only shrinks and goes red when stale. `--selftest` plants 18 breaches, each caught by its rule.

**Same numbers.** `tools/qa/same-numbers.mjs` prints one digest per formula over a fixed grid (every item's sale price, vitals for Levels 1-300 x armor, curve totals, death and blessing and refill prices) plus a combat digest of real `accrueHunt` plays. A slice runs it before and after. Generated SQL must be byte-identical (`git diff --stat supabase/migrations` empty, each `--check` exit 0). The pack-edge hash is stated.

**The wiki.** It imports `src/data/formulas/registry.js` only. Each page is a row: `title`, `says`, `expr`, and a table of `params` read live, so a designer's edit shows up with no wiki edit. A calculator ("your hero") calls `EVALUATORS[id]`, the function the engine runs. Per-ground exceptions (F3) are rows too.

## 3. Slices

Each slice is one commit with the guard green and the digests equal.

**The digests** (`node tools/qa/same-numbers.mjs`; `--selftest` proves it sees a moved number, 5 plants, and runs in CI):
| Tree | Formulas (`--no-combat` ALL) | 18 combat plays | ALL |
|---|---|---|---|
| main 18c34c8e7 (v0.2.114), and this lane through slice 6 | 80dfdc0b | e9a2bc31 | c97cbb1a (with `--plays`) |
| lane/b-phase0-tier4 ea4416e74, and this lane with it merged and the ladder moved | dddde3b9 | e9a2bc31 | a7f60045 |
The 18 plays are this tool's (six open grounds x a lone tank, a lone mage, a mixed four, ten minutes at the floor), not the lost harness behind 342a5481.

**Built**
1. Registry, guard, same-numbers, and SALE: both rates and the function out of the edge (`data/formulas/sale.js`, `core/formulas/sale.js`). The edge keeps the lookup.
2. VITALS registered (max HP, max mana, regen). No move.
3. XP_TABLE is `core-model.js` CAPPED_CURVE; Level, combat skill and capped curves registered.
4. SHOP AND STORE PRICE RULES out of `tools/gen-alpha-catalogue.mjs` into `core/formulas/shop.js`; the generator calls them.
5. Death share, Blessings, stamina refill, scaled hunts, tempering, bench tax, rename registered.
6. PACING and BURN numbers out of `core/pacing.js` and `core/artisan.js` into `data/formulas/town-work.js`. **The farm tables are not moved** (see below).
9. (brought forward by the Phase 0 merge) THE GEAR LADDER `[0.5, 0.5, 0.14, 0.075, 0.033, 0.015]` is one row in `data/formulas/sale.js`; `gearSaleRate` is in `core/formulas/sale.js`; `shops.js` DERIVED_PRICES is deleted and the guard's PENDING list is empty. The edge's sell verbs and `gen-hunt-sessions` (which writes `hr_hunt_vendor_value`: Dispatch loot, Shop bids, the Weighhouse floor, the bench tax) price through the one `salePriceOf`. `gen-hunt-sessions --check` exit 0: Phase 0's generated SQL regenerates byte for byte from the moved row.
18 rows in the registry. Guard `--selftest`: 25 planted breaches, each caught by its rule.

**Not built**
- FARM TABLES (`core/farm.js` PLOT_TIERS, PLOT_TIER_PRICES, REGROW_LIMITS, WATER_*, MAX_WATERINGS): `tests/plot-tier-parity.mjs:98` parses that file's text and its `--mutate` moves it, `gen-farm-catalogues` and `catalogue-regrow-limit` import from it, and `c_plant_xp 28` lives only in SQL. One slice of its own, with a forward farm catalogue if plant XP becomes a row.
- 7 COMBAT, 8 DROPS, 10 REGEN and the XP share: after area spells (v0.2.116), as planned above.

**Book values (inventory #22).** lane/b-client-debt ac6be050d already made the data carry one value per item (ITEMS deep-equal before and after, 582 rows), so this lane does not touch those rows. The server uses the winning value: `hr_items.value` is generated from the joined ITEMS (`gen-catalogues`), which is the hand row for the 14 gear ids (iron_sword 200, steel_sword 800, bronze_belt 110) and `stonecraft.js` for the 8 whetstone and blank ids. No screen showed the other number: the losing tables (GEAR_ITEMS, LIB2_ITEMS, STONECRAFT_ITEMS) are imported by `items.js` only, and every reader, client and edge, reads ITEMS. No §6 bug.

**Other lanes.** F11 re-prove and plant XP: lane/c-server-debt. The capped curve's table and the rename and trophy SQL twins: a generator each, lane C. `refHp`: left for the designer's ruling.

## 4. Found while building

- **The edge bundle moved**: an edge deploy, and the one local `run-smoke` before it. Hash at the lane head: `pack-edge --hash` dda65b30.
- The generated `2027-03-27-phase0-tier4-hunt-sessions-catalogue` still says "src/data/loot-bands.js VENDOR_GEAR_RATES" in its SQL comment. Changing it would move the file's bytes; the next forward file corrects it (`tools/gen-hunt-sessions.mjs:742`).
- `ARMOUR_SLOTS` is exported twice: `core-model.js` (the six slot ids) and `gear-tiers.js` (the six armor lines). The guard caught it. Audit S2.
- `gearSaleRate` typed its tier (`t === 2`) in code; it is `VENDOR_HOURLY_ARMOR_TIER` now (core-clean caught it on the move).
- The HUD's HP regen is the plain product; the engine floors it every 100 ms step, so the HUD can read up to about 2% over what the fight adds. Display only. Decide with slice 10.
- A registry file named `index.js` made `tools/guards-for` pick about 150 tests for one edit (it matches by basename). Renamed.
- An anchor that holds a `?v=` goes stale at the next bump. None of this lane's anchors has one.
- The guard reads definitions only: `x ? NAME : 0` is not one, and neither is text inside a string (a mutation plant's `find`).
- Common key names are not policed (`tools/gen-scaled-hunts.mjs:233` plants `bankMaxHours: 12` in its own selftest); `keys` lists distinctive ones.
- The configured browser preview serves another checkout (it answered v0.2.48), so this worktree was checked by importing the client modules in Node, not in a browser.
