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
- Equippable: `type:'weapon'|'armor'|'jewelry'`, `slot`, `weaponType`, stat
  bonuses (`atkB/strB/defB/critB/spdB/magicAtkB/…`), optional `reqSkill`+`reqLv`
  (wield gate, enforced by `gearWieldReq`/`canWield`).
- `bop:true` = bind-on-pickup (untradeable — market + sell both block it).
- Consumable/material: `heals`, `buff*`, `tag`, `tier`, `rarity`.
- **Icons:** emoji `icon` is the last-resort fallback; real art is mapped in
  `legacy.js` `LOCAL_ITEM_ICON` (painted PNGs). New items are art-backlog targets.

### 3. Recipes (cooking / smithing / crafting) — data
`src/data/recipes.js` → `ARTISAN_RECIPES[skill]` (array of `{id, name, input,
secondary?, output, xp, req, ms, gated?}`). One engine runs them all
(`doArtisanAction` in legacy.js). Category lanes derive automatically via
`recipeCategory()` — you don't hand-tag lanes.
- **To add a recipe:** add a row; ensure its `input`/`secondary` are obtainable
  (the reachability guard, below, enforces this).

### 4. Gathering nodes — data
`src/data/gathering.js` → `TREES` / `ROCKS` / `FISH_SPOTS` (arrays of
`{id,name,icon,req,xp,ms,prod,qty}`) and `CROPS` (farming). Add a row = a new
node. `prod` must be a real item id.

### 5. Monsters + drops — data
`src/data/monsters.js` → `MONSTERS`. Drops live inline:
`drops:[{id, ch}]` (ch = 0..1 chance). Add a drop = add to the array; the id must
exist in `ITEMS`.

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
