# Systems Map — where content lives and how to add it

**Read this before building an item / recipe / drop / node / progression change.**
The golden rule (from `CLAUDE.md`): **grow by adding *data*, not code.** Items,
recipes, gear, drops, nodes, mobs and skills are all declarative data that
existing engines consume. Most "new content" is a new row in `src/data/*.js` —
no new system required. Write new code only for a genuinely new *mechanic*.

---

## The one thing that trips everyone up: data is authored ONCE, then merged

`src/legacy.js` (the classic-script engine) declares `const ITEMS / MONSTERS / …`
at top level and publishes them as `window.__LEGACY_INLINE`. `src/main.js` then
**merges the ESM `src/data/*` modules into those exact objects** via
`unifyObject` / `unifyArray` (main.js:51–72), so both sides are one identity.

- **Author content in `src/data/*.js`.** Hand-authored entries there win over
  generated ones (they're spread first; later same-id entries override).
- A change to an ESM module needs a `?v=` bump to load (module cache) — just run
  `./bump-version.sh <N>` (see `CLAUDE.md` → Build + ship).
- Never re-declare content inside `legacy.js` — that shadows the merge and is the
  historical "data double-copy" trap (fixed b215; a guard test asserts identity).

---

## The systems (reuse these — don't rebuild)

### 1. Gear + gear-recipes — GENERATED from curves
`src/data/gear-tiers.js` → `GEAR_ITEMS` + `GEAR_RECIPES`.
- `MATERIAL_TIERS` (7: bronze→dawn, each with `tier/smith/craft/value/bar/plank/wood/rarity`)
  × `ARMOUR_SLOTS` × `WEAPON_FAMILIES` (sword/warhammer/bow/staff) → ~70 items **and their recipes**.
- **To add a whole new tier or weapon family:** add one row to `MATERIAL_TIERS`
  or `WEAPON_FAMILIES`. Items, stats, recipes, values and wield-levels generate.
- **To hand-tune one generated piece:** author an entry with the same id in
  `items.js` — it overrides the generated stats/value.

### 2. Items — hand-authored data
`src/data/items.js` (`ITEMS`). One entry per item id: `{ n, icon, v, ... }`.
- Equippable: `type:'weapon'|'armor'|'jewelry'|'companion'|'ammo'`, `slot`,
  `weaponType`, stat bonuses (`atkB/strB/defB/critB/spdB/magicAtkB/…`),
  `reqSkill`+`reqLv` — the wield gate, enforced client-side by
  `gearWieldReq`/`canWield` and server-side by `hr_apply` against
  `hr_items.req_skill`/`req_lv`. **Every equippable carries the pair**; `reqLv 1`
  restricts nobody and is the data form of "belongs to this skill", which is what
  keeps the server column non-NULL so there is one shape to read. A NULL pair is
  a gate that exists only in the browser — see `EQUIP-REQLV-1`.
- `bop:true` = bind-on-pickup (untradeable — market + sell both block it).
- Consumable/material: `heals`, `buff*`, `tag`, `tier`, `rarity`.
- **Icons:** emoji `icon` is the last-resort fallback; real art is mapped in
  `legacy.js` `LOCAL_ITEM_ICON` (painted PNGs). New items are art-backlog targets.

### 3. Recipes (cooking / smithing / crafting / prayer / runecrafting / stonemason) — data
`src/data/recipes.js` → `ARTISAN_RECIPES[skill]` (array of `{id, name, input,
secondary?, output, xp, req, ms, gated?}`). One engine runs them all
(`doArtisanAction` in legacy.js). Category lanes derive automatically via
`recipeCategory()` — you don't hand-tag lanes.
- **To add a recipe:** add a row; ensure its `input`/`secondary` are obtainable
  (the reachability guard, below, enforces this). Then run
  `node tools/gen-catalogues.mjs` — every recipe emits an `hr_activities` row,
  and until that row is APPLIED the server answers `unknown_activity`. `xp`/`ms`
  are not in that table; they reach the server through the edge payload, so
  `hr-accrue` is redeployed at the same cut.
- **`output: null` = a pure XP sink.** No engine code is needed for one:
  `recipeInputs` (src/core/artisan.js) reads the singular `input` and `produced`
  is null when `output` is falsy.

⚠ **THE SELF-SUPPLY RULE (game-designer ruling, 2026-09-13; `DEEPSEAM-5` asserts
it at ZERO, and it is a red build).** *A material is made where its tier opens,
and no rung may ask for a tier the player cannot yet open* — for every recipe and
every input, `req(recipe) ≥ the cheapest req at which that input is MADE`. A new
rung that breaks it is fixed in this precedence, so the fix never takes content
away: (1) move the SUPPLY rung down to its tier's gate (`MATERIAL_TIERS.smith` /
`.craft`) — bars and planks sit exactly there; (2) if the rung names a material
from a tier above its own band, change the MATERIAL, not the level; (3) only when
the item's identity IS the higher tier does the level rise to that tier's gate.
Never raise a level if doing so opens a hole in `b343` availability (max of wield
and craft gate, 20 levels) or reverses a `b348` gear lane — **the player's ladder
outranks the material's flavour.** Two neighbouring rules bind at the same time:
a rung reachable before coal is minable may never demand coal (`b525`), and the
gathering ladders' paced xp/s (`b226`/`b390`) are not a lever for fixing a recipe.

#### The Prayer bench (`ARTISAN_RECIPES.prayer`) — 13 rungs, 1 → 99
Every row is `output: null` (XP only) and consumes one monster drop.

| req | id | name | input | xp | ms |
|---:|---|---|---|---:|---:|
| 1 | `bury_bones` | Bury Bones | `bones` | 4.5 | 1200 |
| 15 | `bury_big` | Bury Big Bones | `big_bones` | 15 | 1500 |
| 35 | `bury_dragon` | Bury Dragon Bones | `dragon_bones` | 72 | 2000 |
| 40 | `bury_bone_chips` | Sift Bone Chips | `bone_chips` | 105 | 2200 |
| 46 | `consecrate_grave_dust` | Consecrate Grave Dust | `grave_dust` | 155 | 2400 |
| 52 | `offer_razor_claw` | Offer Razor Claw | `razor_claw` | 212 | 2500 |
| 58 | `scatter_vamp_dust` | Scatter Vampire Dust | `vamp_dust` | 295 | 2600 |
| 65 | `banish_demon_shard` | Banish Demon Shard | `demon_shard` | 420 | 2800 |
| 72 | `unbind_wraith_veil` | Unbind Wraith Veil | `wraith_veil` | 600 | 3000 |
| 79 | `consecrate_dragon_scale` | Consecrate Dragon Scale | `dragon_scale` | 855 | 3200 |
| 86 | `release_lich_soul` | Release Lich Soul | `lich_soul` | 1210 | 3400 |
| 92 | `offer_ancient_claw` | Offer Ancient Claw | `ancient_claw` | 1700 | 3600 |
| 99 | `purge_void_chitin` | Purge Void Chitin | `void_chitin` | 2400 | 3800 |

Rungs 40–99 are the 2026-09-12 ruling; before it the bench stopped at 35 and had
no action for 64 levels. The ladder is asserted strictly increasing and
reaching 99 by `PRAYER-LADDER-1` in the in-page suite.

### 4. Gathering nodes — data
`src/data/gathering.js` → `TREES` / `ROCKS` / `FISH_SPOTS` (arrays of
`{id,name,icon,req,xp,ms,prod,qty}`) and `CROPS` (farming). Add a row = a new
node. `prod` must be a real item id.

A new node's `xp`/`ms` are not free: two standing in-page guards measure the
whole table. `b226: every gathering rung is strictly faster XP/sec` forbids a
rung that is slower than the one below it, and `b390: a full-tier gathering
unlock is a CLEAR upgrade` requires ≥ +6% xp/sec whenever the `req` gap to the
previous rung is ≥ 10. Measure before you author.

**Fishing (b544 "Reed & Tide", 2026-09-13)** — the Trout(20) → Lobster(40) band:

| req | node id | name | prod | xp | ms |
|---|---|---|---|---|---|
| 24 | `pikeperch_s` | Reed Pike Pool | `pikeperch` | 38 | 5400 |
| 28 | `copper_crab_s` | Tidepool Crabs | `copper_crab` | 46 | 5900 |
| 32 | `silverfin_s` | Silverfin Shoal | `silverfin` | 56 | 6500 |
| 36 | `goldgill_s` | Goldgill Eddy | `goldgill` | 68 | 7200 |

and their cooking half (`ARTISAN_RECIPES.cooking`), where the last two are the
multi-input shape:

| req | recipe id | inputs | output | heals | xp |
|---|---|---|---|---|---|
| 18 | `cook_pikeperch` | `pikeperch` | `cooked_pikeperch` | 16 | 57 |
| 21 | `cook_copper_crab` | `copper_crab` | `cooked_copper_crab` | 18 | 66 |
| 24 | `cook_silverfin` | `silverfin` | `cooked_silverfin` | 21 | 76 |
| 27 | `cook_goldgill` | `goldgill` | `cooked_goldgill` | 23 | 88 |
| 52 | `cook_river_chowder` | silverfin 2 + potato 2 + carrot 1 | `river_chowder` | 30 | 198 |
| 56 | `cook_fishers_pie` | goldgill 2 + wheat 3 + potato 1 | `fishers_pie` | 34 (Feast) | 218 |

⚠ **A NEW COOKED FOOD IS THREE SERVER ROWS, NOT ONE.** `hr_activities` (the
tile can be started), `hr_items.heals` + `auto_eatable` (the AUTO-EAT POOL —
a food that exists only client-side heals nothing away) and `hr_feast_foods`
(the Tavern's heal). The first two come from `tools/gen-catalogues.mjs`; the
third is a hand seed kept honest by `tests/clan-feast-catalogue-drift.mjs`,
which reads EVERY migration that seeds the table in apply order — so add the
rows in a NEW migration, never by editing an applied one. Played end to end by
`REEDTIDE-1` in the in-page suite.

**Mining (b545 "Deep Seam", 2026-09-13)** — the Mining 15 → 60 ore silence (coal
is a reagent, Rich Coal is more coal and Gold makes jewellery only, so nothing
mined between Iron and Mithril became ARMOUR):

| req | node id | name | prod | qty | xp | ms |
|---|---|---|---|---|---|---|
| 36 | `verdite_seam` | Verdite Seam | `verdite_ore` | 1 | 65 | 6200 |
| 40 | `fluxsalt_pocket` | Fluxsalt Pocket | `flux_salt` | 1–2 | 72 | 6800 |
| 48 | `deep_verdite_seam` | Deep Verdite Seam | `verdite_ore` | 2–3 | 85 | 7600 |
| 56 | `heartgarnet_geode` | Heartgarnet Geode | `heartgarnet` | 1 | 103 | 8700 |

and their smithing half (`ARTISAN_RECIPES.smithing`) — the Steel(35) → Mithril(55)
bar silence and the Defence 30 → 45 WIELD hole:

| req | recipe id | inputs | output | wield | xp |
|---|---|---|---|---|---|
| 42 | `smelt_verdite` | verdite_ore 2 + flux_salt 1 | `verdite_bar` | — | 95 |
| 45 | `forge_verdite_helm` | verdite_bar 2 | `verdite_helm` (13 def) | Def 38 | 160 |
| 46 | `forge_verdite_blade` | verdite_bar 3 + willow_plank 1 | `verdite_blade` (15/12) | Atk 38 | 210 |
| 47 | `forge_verdite_platelegs` | verdite_bar 4 | `verdite_platelegs` (19 def) | Def 38 | 320 |
| 50 | `forge_verdite_platebody` | verdite_bar 5 + flux_salt 2 | `verdite_platebody` (28 def) | Def 38 | 400 |
| 52 | `forge_heartgarnet_maul` | verdite_bar 3 + heartgarnet 1 + willow_plank 2 | `heartgarnet_maul` (11/23) | Atk 42 | 480 |

⚠ **A NEW EQUIPPABLE IS THREE SERVER FACTS, NOT ONE.** `hr_activities` (the tile
can be started), `hr_items.req_skill` + `req_lv` (the EQUIP gate hr_apply
re-checks — a tradeable piece with a NULL gate is the market selling power to a
level-1 account) and `hr_item_slots` (a piece with no pair cannot be worn at
all). All three come from `tools/gen-catalogues.mjs`, plus the patch migration
`2026-09-13-deep-seam.sql`. Played end to end by `DEEPSEAM-1..6`.

⚠ **A BRIDGE TIER IS HAND-AUTHORED, NEVER AN EIGHTH `MATERIAL_TIERS` ROW.** A new
tier there generates 18 armour pieces × 3 archetype lines + 4 weapon families and
re-indexes every per-tier stat array in `src/data/gear-tiers.js`. Verdite (and
the Watchknight's deathsteel before it) is five pieces in `src/data/items.js`
with explicit `reqSkill`/`reqLv`, each stat, wield level and price strictly
between its steel and mithril twin — asserted by `DEEPSEAM-3`.

### 5. Monsters + drops — data
`src/data/monsters.js` → `MONSTERS`. Drops live inline:
`drops:[{id, ch}]` (ch = 0..1 chance). Add a drop = add to the array; the id must
exist in `ITEMS`.

⚠ **A drop row is a SERVER FAUCET** (hr-accrue mints it into a tradeable
inventory), so it ships in lane C order: **Security GO → hr-accrue edge deploy →
then the client**. The client must never show a drop the deployed engine cannot
roll. **Lucky finds** (`{id, ch, lucky:true}`, always the LAST row) are announced
by the SERVER only — the settle's `away.events` `rare_drop` — never by the
client's own dice (`src/features/lucky-finds.js`); their rules (item, faucet cap,
4-30 measured hours, tier) are `tests/lucky-finds.mjs`.

### 6. Dungeon / boss loot — data
`src/dungeons.js` → `DUNGEONS[id].loot:[{id, qty:[min,max], chance}]`, plus
`.boss:{name,title}`. Signature gear = `bop:true` in items.js; the loot row is
just data. (See b268 boss ecosystem for the pattern.)

### 7. Shops / other faucets — data
Seed shop (`SEED_SHOP`), store traits, board tasks, etc. are data tables in
`legacy.js` / feature files. A drop that has **no** faucet will fail the
reachability guard — wire it into a drop table, recipe, or shop.

---

## Free infrastructure you get automatically

| You get… | From | So you don't have to… |
|---|---|---|
| Rarity band + frame CSS class | `window.itemRarity(id)` / `RARITY.classFor(id)` (`src/features/rarity.js`) | label items by hand |
| Bonus fusion / power budget | `getBonus()` + `src/features/power-budget.js` | balance stacked % bonuses |
| Safe id renames / removals | `window.ITEM_ALIAS` + `remapItemIds` (legacy.js:728) | migrate saves manually |
| Save schema migrations | `src/save-migrations.js` (`MIGRATIONS` + `CURRENT_SCHEMA_VERSION`) | hand-patch old saves |
| Item → source / used-in | `src/features/item-index.js` | write reverse lookups |

---

## The guards that verify your content (smoke suite: `node tests/run-smoke.mjs`)

- **Progression reachability** (`b243: PROGRESSION IS REACHABLE`, smoke-test.js) —
  seeds obtainable roots, closes over recipes, and **fails if any non-exempt item
  has no source or a broken recipe chain.** This is your safety net: add a recipe
  whose input is unobtainable and the suite goes red.
- **Data identity** — asserts ESM data actually reached the engine (no double-copy).
- **Currency-leak guards** — assert no drop/recipe/shop mints `hearth_token` or
  `muster_seal`.
- **Every fix/feature ships with its own test** (`CLAUDE.md` → Testing discipline).

---

## Cookbook — the fast path for common asks

- **New craftable gear set** → add a `MATERIAL_TIERS` row (gear-tiers.js). Done.
- **One special weapon/armour** → an `items.js` entry (+ a recipe row or a drop row).
- **New recipe** → an `ARTISAN_RECIPES[skill]` row; make sure inputs are obtainable.
- **New gathering resource** → a `TREES/ROCKS/FISH_SPOTS` row + its product item.
- **New monster drop / boss loot** → a `drops`/`loot` row referencing an existing item id.
- **Route an orphan drop into gear** → give it a recipe or a use; the reachability
  guard confirms it's no longer a dead end (see wave3-uniques.js for the pattern).
- **Genuinely new mechanic** (not items/recipes) → *then* write a feature module in
  `src/features/`, wire it in `main.js`, and ship it with a smoke test.

---

*If a system moved, fix the anchor here in the same change — a stale map is worse
than none.*
