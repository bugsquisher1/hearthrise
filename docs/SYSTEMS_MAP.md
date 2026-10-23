# Systems Map — where content lives and how to add it

**Read this before building an item / recipe / drop / node / progression change.**
The golden rule (from `CLAUDE.md`): **grow by adding *data*, not code.** Items,
recipes, gear, drops, nodes, mobs and skills are all declarative data that
existing engines consume. Most "new content" is a new row in `src/data/*.js` —
no new system required. Write new code only for a genuinely new *mechanic*.
Whether a system or content row *should* exist is `docs/DESIGN_STANDARDS.md` (the purpose test, and sample before expanding).

---

## Data is authored ONCE, in `src/data/*.js`

`src/data/*.js` is pure ESM, imported by the client, by `src/core/*` and by the
`hr-accrue` Edge Function. The server's SQL catalogues are GENERATED from it
(`node tools/gen-catalogues.mjs`, `tools/gen-hunts.mjs`, `tools/gen-hunt-sessions.mjs`)
and drift guards bind the copies. Never keep a second hand-written copy of game data.

- A change to an ESM module needs a `?v=` bump to load (module cache) — run
  `./bump-version.sh X.Y.Z` (see `CLAUDE.md` §5).
- A row the server pays or checks (drops, prices, items, hunts) is a lane C
  change: regenerate the catalogue, apply it, redeploy `hr-accrue` if the engine
  reads it (CLAUDE.md §3.3).
- Game rules (what a system does) are Tyler's rulings
  (`~/.claude/projects/R--the-game-the-game/memory/rulings-of-record.md`); this
  map says only where the rows live. Some tables below still carry pre-rebuild
  rows; the catalogue-coherence guard decides what is reachable.

### 0. Hunts — data
`src/data/hunts.js` (grounds: level floor, monster family and spawn weights,
density steps), `src/data/hunt-grounds.js` (pockets, route), `src/data/hunt-sessions.js`
and `hunt-tuning.js` (engine values), `src/data/monsters.js` (stats and drops).
Regenerate with `node tools/gen-hunts.mjs` and `node tools/gen-hunt-sessions.mjs`.

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
- `bop:true` = bind-on-pickup (untradeable — trade and sell both block it).
- Consumable/material: `heals`, `buff*`, `tag`, `tier`, `rarity`.
- **Icons:** emoji `icon` is the last-resort fallback; real art is mapped by
  `src/data/item-art.js`. New items are art-backlog targets.

### 3. Recipes (cooking / smithing / crafting / prayer / runecrafting / stonemason) — data
`src/data/recipes.js` → `ARTISAN_RECIPES[skill]` (array of `{id, name, input,
secondary?, output, xp, req, ms, gated?}`). One engine runs them all
(`src/core/artisan.js`). Category lanes derive automatically via
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

**Prayer wards (W0, 2026-10-10)** — `PRAYER_WARDS` in `src/data/skills.js`, read by
`src/core/combat.js`, cut monster hit chance. This CONTRADICTS the current ruling
(Prayer raises HP and mana regeneration rates only, Tyler 2026-10-14) and is owed
removal; do not build on it.

**Runecrafting supplies itself (W0).** `mine_rune_essence` (input-free,
`xpSkill: 'mining'`, the quarry pattern) → `cut_rune_blanks` / `split_rune_blanks`
(essence → blanks) → `bind_earth_runes` at level 1. Air runes (the free tier-1
rung) are starter kit + shop only.

### 4. Gathering nodes — data
`src/data/gathering.js` → `TREES` / `ROCKS` / `FISH_SPOTS` (arrays of
`{id,name,icon,req,xp,ms,prod,qty}`) and `CROPS`. Add a row = a new
node. Mining and Woodcutting are gathered passively during hunts (first tiers at
the town edge); the gathering engine is not shipped yet. `prod` must be a real item id.

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

⚠ **Food and drink are supplies used by action-bar slots** (food restores HP,
drink restores mana, 50% at once and 50% over 6 s; no potions). A new one is an
item row plus its consumable row (`src/data/consumables.js`, `drinks.js`) and the
regenerated catalogues; store-sold basics live in `src/data/shops.js`.

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
re-checks — a tradeable piece with a NULL gate is trade selling power to a
level-1 account) and `hr_item_slots` (a piece with no pair cannot be worn at
all). All three come from `tools/gen-catalogues.mjs`, plus the patch migration
`2026-09-13-deep-seam.sql`. Played end to end by `DEEPSEAM-1..6`.

⚠ **A BRIDGE TIER IS HAND-AUTHORED, NEVER AN EIGHTH `MATERIAL_TIERS` ROW.** A new
tier there generates 18 armour pieces × 3 archetype lines + 4 weapon families and
re-indexes every per-tier stat array in `src/data/gear-tiers.js`. Verdite (and
the Watchknight's deathsteel before it) is five pieces in `src/data/items.js`
with explicit `reqSkill`/`reqLv`, each stat, wield level and price strictly
between its steel and mithril twin — asserted by `DEEPSEAM-3`.

**Woodcutting (Timberline)** — a new stand every 7-8 levels (the tree ladder was
1/15/30/45/60/75/90). Each stand yields an EXISTING log: no item, recipe or art.

| req | node id | name | prod | qty | xp | ms |
|---|---|---|---|---|---|---|
| 22 | `hollow_oak_tree` | Hollow Oak | `oak_log` | 1 | 26 | 4200 |
| 38 | `weeping_willow_tree` | Weeping Willow | `willow_log` | 1–2 | 52 | 6800 |
| 52 | `maple_grove` | Maple Grove | `maple_log` | 2 | 78 | 8200 |
| 68 | `elder_yew_tree` | Elder Yew | `yew_log` | 1–2 | 124 | 10800 |
| 82 | `ancient_runewood_tree` | Ancient Runewood | `runewood_log` | 1–2 | 168 | 12200 |

Server half = the `hr_activities` rows (`2026-09-26-timberline.sql`; the level
gate for `hr_apply`); xp/ms/yield ride the edge payload.
Played by `TIMBERLINE-1..4` in-page and `TIMBERLINE-S1` in `tests/accrual-engine.mjs`.

**Fishing and Mining (Deep Waters)** — a new stand every 5-8 levels from 40 to
90. Each yields an EXISTING raw: no item, recipe or art. Fish stands stay 1 a
catch (cooked fish vend at full value); the veins pay 1–2.

| req | node id | name | prod | qty | xp | ms |
|---|---|---|---|---|---|---|
| 47 | `lobster_reef_s` | Lobster Reef | `lobster` | 1 | 98 | 9000 |
| 61 | `swordfish_deeps_s` | Swordfish Deeps | `swordfish` | 1 | 133 | 10600 |
| 71 | `frostfin_reach_s` | Frostfin Reach | `frostfin` | 1 | 166 | 12200 |
| 83 | `shark_shelf_s` | Shark Shelf | `shark` | 1 | 195 | 13600 |
| 67 | `deep_mithril_vein` | Deep Mithril Vein | `mithril_ore` | 1–2 | 118 | 9300 |
| 82 | `deep_ember_vein` | Deep Ember Vein | `emberstone_ore` | 1–2 | 157 | 11200 |

Heal climb (same number in `items.js` and `hr_items.heals`):
Cooked Lobster 25 < Swordfish 32 < Frostfin 38 < Shark 44 < Moonfish 50 (was
22/28/42/38).
Server half = `2026-09-26-deep-waters.sql` (6 activity rows + 4 heals in both
tables); xp/ms/yield ride the edge payload. Played by `DEEPWATERS-1..5` in-page
and `DEEPWATERS-S1`/`-S2` in `tests/accrual-engine.mjs`.

### 5. Monsters + drops — data
`src/data/monsters.js` → `MONSTERS`. Drops live inline:
`drops:[{id, ch}]` (ch = 0..1 chance). Add a drop = add to the array; the id must
exist in `ITEMS`.
**The loot bands** (Tyler 2026-10-23): on a converted ground every row is
`{id, ch, band}`, band common | uncommon | scarce | rare | trophy
(`src/data/loot-bands.js`, in that order on the row list). The roller reads the
band (`src/core/drops.js` bandOf); only Rare and Trophy reveal and go to the
party's rare roll. Each band is a promise in hours at the floor (Scarce about one
piece an hour, Rare 10-20 h per item, Trophy 100-150 h, bosses only), worn gear
sells at its tier's share of book (`VENDOR_GEAR_RATES`), and
`tests/hunt-core/drop-tables.mjs` measures pace, the gear faucet and total value on
the real settle, for a party ground's party and lone hero alike. Every walked
ground is banded; only the tutorial's seeded Giant Rat and Slime keep odds rows.
The server refuses a settle naming an item no spawn's kill bound lists, so a new
drop item ships with the regenerated hunt-sessions catalogue, applied right
before the edge deploy.
⚠ **A drop row is a SERVER FAUCET** (hr-accrue mints it into a tradeable
inventory), so it ships in lane C order: **Security GO → hr-accrue edge deploy →
then the client**. The client must never show a drop the deployed engine cannot
roll. **Lucky finds** (`{id, ch, lucky:true}`, always the LAST row) are announced
by the SERVER only — the hunt settle's `rare_drop` event — never by the
client's own dice; their rules (item, faucet cap,
4-30 measured hours, tier) are `tests/lucky-finds.mjs`.
**Field salvage** (`{id, ch, salvage:true}`, LAST row, at most one per monster,
never beside a lucky row) is the same server-revealed contract one band commoner:
an own-tier helm/boots/gloves/belt from `GEAR_ITEMS`, revealed as RARE (never
VERY RARE) by the same file. 46 rows T1-T6; their rules (item, tier rate, 4% per
row / 5% all-gear faucet caps, 0.5-10 measured hours, both paths) are
`tests/field-salvage.mjs`. A salvage-shaped row without the flag is a guard red,
because the flag is what silences the client's dice.

### 7. Shops / other faucets — data
The store (food, drink, runes, ammo, starter tools) is `src/data/shops.js`;
own stock is spent first, then the store at store price. A drop that has **no** faucet will fail the
reachability guard — wire it into a drop table, recipe, or shop.

---

## Free infrastructure you get automatically

| You get… | From | So you don't have to… |
|---|---|---|
| Where every item comes from / who uses it | `src/data/catalogue-coherence.js` (`itemSources`, `itemUses`, `obtainableItemIds`, `skillConsumers`) | hand-audit the catalogue |

---

## The guards that verify your content

- **Catalogue coherence** (`tests/catalogue-coherence.mjs`, W0.4) — every item has a
  source AND a use, every declared effect is live, and every skill has a consumer. Author an item with no faucet, or one nothing spends, and CI goes red.
- **Every fix/feature ships with its own test** (`CLAUDE.md` → Testing discipline).

---

## Cookbook — the fast path for common asks

- **New craftable gear set** → add a `MATERIAL_TIERS` row (gear-tiers.js). Done.
- **One special weapon/armour** → an `items.js` entry (+ a recipe row or a drop row).
- **New recipe** → an `ARTISAN_RECIPES[skill]` row; make sure inputs are obtainable.
- **New gathering resource** → a `TREES/ROCKS/FISH_SPOTS` row + its product item.
- **New monster drop** → a `drops` row referencing an existing item id (lane C: a server faucet).
- **New hunt** → a `hunts.js` row (+ `hunt-grounds.js` pockets/route, monsters), then regenerate.
- **Route an orphan drop into gear** → give it a recipe or a use; the reachability
  coherence guard confirms it's no longer a dead end.
- **Genuinely new mechanic** (not rows) → only for new state + rules + lifecycle: its
  own home after an architecture check (data in `src/data`, logic in `src/core`,
  server in an RPC/edge verb, client in `src/session` + `src/shell`), shipped with its test.

---

*If a system moved, fix the anchor here in the same change — a stale map is worse
than none.*
