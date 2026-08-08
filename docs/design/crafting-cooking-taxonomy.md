# Crafting / Cooking / Smithing Taxonomy

**Backlog #12 · P2 · Owner: Game Designer · (Art, Systems support) · Wave 2**
**Author: Game Designer · 2026-08-08 · Status: SPEC (buildable blueprint, no code changed)**

---

## 1. The problem

Every artisan skill renders as **one flat, sorted list**. `renderArtisanActivities(skillId)` (`legacy.js` ~6754) maps `ARTISAN_RECIPES[skillId]` — sorted only by required level — into a single column of buttons. With the b215 generated gear ladder folded in (`gear-tiers.js`), the counts are now big:

| Skill | Recipe count (approx) | Today |
|---|---|---|
| **Smithing** | ~60 (9 bars + 14 tools + ~13 weapons + ~28 armour) | one scroll |
| **Crafting** | ~45 (7 planks + ~17 weapons + 7 rods + arrows + 4 tailoring + 2 jewellery) | one scroll |
| **Cooking** | ~30 (fish, meat, crop dishes, feasts, elixirs) | one scroll, heal-food and buff-food jumbled together |

A player at Smithing 40 scrolling past 60 undifferentiated buttons to find "the next platebody" is doing archaeology, not playing. And in cooking, the food you eat to **heal** sits shoulder-to-shoulder with the food you eat for a **buff** with no signal which is which — the exact thing Tyler flagged.

**Fix:** group each artisan screen into **categories** (sub-tabs), and split cooking specifically into **healing food vs buff food/drink**.

---

## 2. Design principle: derive categories, don't hand-tag

There are ~135 recipes. Hand-tagging each with a `category` field guarantees drift (the same problem `gear-tiers.js` was built to kill). **Categories should be derived at render time from fields the items/recipes already carry.** The rules below classify every existing recipe correctly with zero per-recipe authoring — a new recipe lands in the right tab automatically.

The one exception is cooking's healing/buff split, which needs a single new item flag (`foodClass`) because the current data makes every cooked food both heal *and* buff (see §5).

---

## 3. Smithing categories

**Tabs: `Smelting` · `Weapons` · `Armour` · `Tools`**

Derivation (evaluate in order, per recipe `r` with output item `o = ITEMS[r.output]`):

| Rule | Category |
|---|---|
| `o.type === 'tool'` | **Tools** |
| output id ends in `_bar` (or `o` has no combat/tool type and is a bar) | **Smelting** |
| `o.type === 'weapon'` | **Weapons** |
| `o.type === 'armor'` | **Armour** |

### Mapping (smithing)

**Smelting (Bars)** — `smelt_copper, smelt_bronze, smelt_iron, smelt_steel, smelt_gold, smelt_mithril, smelt_rune, smelt_ember (Emberforged Bar), smelt_dawn (Dawnsteel Bar)`

**Tools** — axes: `forge_bronze_axe, forge_iron_axe, forge_steel_axe, forge_mithril_axe, forge_rune_axe, forge_ember_axe, forge_dawn_axe` · pickaxes: `forge_bronze_pickaxe … forge_dawn_pickaxe` (7) — every entry has `output.type==='tool'`.

**Weapons** — hand-authored: `forge_bronze_sword, forge_iron_sword, forge_steel_sword, forge_rune_sword, forge_stone_maul, forge_iron_warhammer, forge_chief_blade` (gated), `forge_captain_blade` (gated) · generated `make_*` swords & warhammers: `make_mithril_sword, make_ember_sword, make_dawn_sword, make_steel_warhammer, make_mithril_warhammer, make_rune_warhammer, make_ember_warhammer, make_dawn_warhammer`.

**Armour** — the generated `forge_<mat>_<slot>` ladder: 6 slots (helm, platebody, platelegs, boots, gauntlets, belt) × 7 tiers (bronze→dawnsteel), with hand-authored `forge_iron_helm, forge_steel_helm, forge_iron_platebody, forge_steel_platebody, forge_bronze_belt` overriding their generated twins. All carry `output.type==='armor'`.

**Optional sub-grouping inside Weapons/Armour:** since every gear item now has `o.weaponType` (sword/hammer/ranged/magic) and `o.slot`, the Weapons tab can further chip by family and Armour by slot **for free** — nice-to-have, not required for v1.

---

## 4. Crafting categories

**Tabs: `Sawmill` · `Weapons` · `Armour` · `Jewellery` · `Tools` · `Ammunition`**

Derivation (per recipe `r`, output `o`):

| Rule | Category |
|---|---|
| output id ends in `_plank` | **Sawmill** |
| `o.type === 'tool'` | **Tools** (fishing rods) |
| `o.type === 'ammo'` | **Ammunition** |
| `o.type === 'jewelry'` | **Jewellery** |
| `o.type === 'weapon'` | **Weapons** (bows & staves) |
| `o.type === 'armor'` | **Armour** (leather & cloth) |

### Mapping (crafting)

**Sawmill (Planks)** — `saw_normal, saw_oak, saw_willow, saw_maple, saw_yew, saw_runewood, saw_duskwood`

**Weapons (Bows & Staves)** — bows (hand): `carve_shortbow, carve_longbow` · bows (generated): `make_willow_longbow, make_maple_bow, make_yew_bow, make_runewood_bow, make_duskwood_bow` · staves (hand): `carve_apprentice_staff, carve_oak_staff` · staves (generated): `make_willow_staff, make_maple_staff, make_yew_staff, make_runewood_staff, make_duskwood_staff`

**Tools (Fishing Rods)** — `carve_willow_rod, carve_oak_rod, carve_maple_rod, carve_yew_rod, carve_runewood_rod, carve_duskwood_rod, carve_dawnsteel_rod`

**Armour (Leather & Cloth)** — `tailor_leather_boots, tailor_leather_gloves, tailor_traveler_cape, craft_alpha_cloak` (gated)

**Jewellery** — `jewel_copper_ring, jewel_hunter_necklace`

**Ammunition** — `craft_iron_arrows`

*(Prayer stays its own skill screen — `bury_bones, bury_big, bury_dragon`. Not a grid to sub-tab; leave as-is.)*

---

## 5. Cooking — the healing / buff split (the headline)

### 5.1 Why the data can't split as-is

Every cooked food in `items.js` currently has **both** `heals` **and** a `buff`. So there is no clean existing field to split on — `cooked_shrimp` heals 8 *and* gives gather_speed; `cooked_shark` heals 42 *and* gives +damage. Splitting by "has a buff" would put the entire fish line (your primary heal source) into the buff tab, which is wrong.

### 5.2 The rule: split by **role**, add one flag

Introduce a single item field **`foodClass: 'healing' | 'buff'`** and categorize by *what the player eats it for*:

- **Healing food** = the staples you eat to restore HP and that **auto-eat** draws from. These are the raw-caught/hunted lines whose value is the heal; any buff they carry is incidental utility (gather/xp), never combat power.
- **Buff food / drink** = prepared dishes and elixirs eaten deliberately for a **timed power buff** (damage, all-XP, combat-XP, drop rate, gold find, defense, etc.). These are *consumables you time*, like potions.

This directly implements the standing design note (project memory `auto-eat-and-drinks-design`): **auto-eat = heal only; buff items → a drinks/feasts category.** Auto-eat must only ever pull `foodClass:'healing'`, so a player never auto-burns a rare Void Banquet to tank a hit.

**Cooking tabs: `Provisions` (healing) · `Feasts & Draughts` (buff/drink)**

### 5.3 Full mapping — assign `foodClass` to every cooked item

| Output item | Heals | Buff | → foodClass | Rationale |
|---|---|---|---|---|
| `cooked_shrimp` | 8 | gather_speed | **healing** | fish staple |
| `cooked_herring` | 6 | gather_speed | **healing** | fish staple |
| `cooked_trout` | 14 | all_xp 5% | **healing** | fish staple (demote incidental buff, see §5.4) |
| `cooked_swordfish` | 22 | damage 8% | **healing** | fish staple |
| `cooked_lobster` | 25 | drop_rate | **healing** | fish staple |
| `cooked_frostfin` | 28 | defense | **healing** | fish staple |
| `cooked_shark` | 42 | damage 12% | **healing** | top heal — the combat food |
| `cooked_moonfish` | 38 | all_xp 8% | **healing** | top heal |
| `cooked_wolf_meat` | 6 | — | **healing** | hunted meat, pure heal |
| `cooked_panther_meat` | 9 | — | **healing** | hunted meat, pure heal |
| `cooked_bear_meat` | 13 | — | **healing** | hunted meat, pure heal |
| `baked_potato` | 20 | gather_speed | **healing** | cheap bulk heal |
| `wheat_bread` | 18 | drop_rate | **healing** | cheap bulk heal |
| `roasted_carrot` | 5 | gather_speed | **buff** | utility snack, eaten for gather |
| `roasted_pumpkin` | 22 | farm_yield | **buff** | eaten before farming |
| `vegetable_stew` | 24 | all_xp | **buff** | XP session food |
| `carrot_stew` | 24 | farm_yield | **buff** | farm buff |
| `tomato_soup` | 28 | monster_respawn | **buff** | combat-pacing buff |
| `pumpkin_pie` | 35 | all_xp 10% | **buff** | XP session food |
| `bear_claw_pie` | 32 | damage 5% | **buff** | combat buff |
| `hunters_feast` | 35 | monster_respawn 15% | **buff** | combat buff (gated) |
| `goldenroot_roast` | 26 | gather_speed 12% | **buff** | gather buff |
| `dragon_stew` | 45 | combat_xp 10% | **buff** | combat-XP buff (gated) |
| `ember_tart` | 30 | combat_xp 12% | **buff** | combat-XP buff |
| `lich_soul_soup` | 50 | gold_find 50% | **buff** | economy buff (gated) |
| `moonbloom_elixir` | 40 | all_xp 12% | **draught** (buff) | **name it a drink** — highest XP buff |
| `void_banquet` | 60 | damage_crit 5% | **buff** | endgame feast |

**Split result:** 13 **Provisions** (the fish + meat + bread/potato heal spine) · 14 **Feasts & Draughts** (crop dishes, gated feasts, the elixir). Clean, and it matches how the items are actually *used*.

Raw ingredients that heal but aren't cooked (`shrimp`, `trout`, crops with `heals`) are inventory items eaten directly — they implicitly behave as `healing` and don't appear on the cooking screen; no tab needed.

### 5.4 The fish-line edge cases — RULING (b220, Game Designer)

The open question was: the Provisions line carries incidental buffs (`cooked_trout` +5% all-XP, `cooked_shark` +12% damage, `cooked_frostfin` +10% defence…), so a "healing" food also silently grants combat power. Two options were on the table — strip those buffs, or keep them.

**Ruling: KEEP the buffs on the Provisions line. Draw the line at consumption, not at stats.**

Reasoning:

1. **Stripping is a combat-power change wearing a taxonomy costume.** Removing +12% damage from Cooked Shark re-tunes every fight a level-60+ player takes, and it does it as a side effect of a UI grouping task. If the fish line is over-rewarding, that is a combat-balance pass with its own evidence and its own test coverage — not a rider on a sub-tab feature.
2. **The stealth-buff worry does not survive contact with the code.** `maybeAutoEat()` heals and decrements; it never calls `applyBuff()`. Only the deliberate "Eat" button (`eatFood()`) applies a buff. So a player who auto-eats a Cooked Shark gets 42 HP and nothing else — the buff is only ever granted when they chose to spend the item. There is no hidden power being handed out.
3. **Stripping would make the top of the fishing ladder worse than the middle.** Cooked Shark and Moonfish Fillet are the payoff for 60–88 Fishing *and* Cooking. Reducing them to a bare number would flatten the reason to climb.
4. **What actually needed fixing was auto-eat's food *choice*, and that is now fixed.** The old selector preferred food with no `buff` field — which, since every cooked food has one, meant it preferred **raw ingredients**: it would eat Raw Shrimp (3 HP) ahead of Cooked Shark (42 HP), and once the raws ran out it would reach for a Void Banquet. That is the real bug the split exposes, and `foodClass` resolves it: the auto-eat pool is exactly Provisions, and inside it the pick is simply the best heal.

**So the boundary is:** `foodClass` decides *what auto-eat may spend*, not *what stats an item has*. Provisions = eaten for HP and safe for the engine to spend. Feasts & Draughts = spent deliberately, never by the engine. Fish keep their buffs; the Provisions tab simply presents heal-per-craft as the headline, with the buff as a secondary line on the tile.

Edge cases settled by the same rule:

- `baked_potato` / `wheat_bread` → **Provisions.** Cheap, high-volume, no combat effect (gather-speed and drop-rate). These are the bulk heal a mid-game player actually stocks.
- `roasted_carrot` → **Feast**, despite healing only 5. Nobody eats a Roasted Carrot for 5 HP; it is a gather snack. Role, not magnitude.
- `roasted_pumpkin` (22 HP) and `vegetable_stew` (24 HP) → **Feasts.** They out-heal Cooked Lobster, but they are farm/XP session food; letting auto-eat drain a stack of Vegetable Stew for HP is precisely the failure this split exists to prevent.
- `moonbloom_elixir` → **Feast**, and named a *draught* — hence the tab is "Feasts & **Draughts**". It is the drinks category the standing design note asked for, with one member; more drinks land in it for free.
- Raw ingredients (`shrimp`, `potato`, `goldenroot`…) carry no flag and are implicitly `healing`, so auto-eat may still use them. They never appear on the cooking screen, so tagging them would be authoring with no reader.

**Implemented (b220):** `foodClassOf()` in `src/data/items.js`, enforced in `HearthriseAuto.maybeAutoEat()`, and mirrored in both UI surfaces that let a player pick auto-eat food (the combat picker and inventory tap) so nothing can promise an auto-eat that will never fire.

---

## 6. UI grouping model (Art + Systems)

**Use sub-tabs (a category strip) inside each artisan screen, not collapsible accordions.** Rationale: the player picks a lane ("I'm here for armour") and stays; accordions make them manage open/closed state every visit. Sub-tabs match the existing pattern already used elsewhere (`data-lb` leaderboard modes, `data-house` house tabs — see `setLbMode`/`setHouseTab`) — reuse that exact pattern for consistency and zero new UI vocabulary.

- Render: a category strip at the top of the artisan panel; clicking a category filters the recipe list to that category. Default to the **lowest category containing an unlocked-and-craftable recipe**, so the screen opens on something you can actually do.
- Within a category, keep the existing **sort by required level** (the ladder reads cleanly once it's only ~8–12 rungs instead of 60).
- Show a small **count / "next unlock at Lv N"** hint per category tab so locked lanes still advertise the goal (retention: "Armour unlocks tier 4 at Lv 45").

### Implementation shape (single derivation function)

```js
// categoryOf(skillId, recipe) → tab key, using ONLY existing fields.
// smithing: 'smelting' | 'weapons' | 'armour' | 'tools'
// crafting: 'sawmill' | 'weapons' | 'armour' | 'jewellery' | 'tools' | 'ammunition'
// cooking:  ITEMS[recipe.output].foodClass  ('healing' → provisions | 'buff' → feasts)
```

`renderArtisanActivities(skillId)` gets a `categoryOf` pass + a category filter around its existing `.map`. No recipe data is rewritten (except adding `foodClass` to the ~27 cooked items). Categories for smithing/crafting are **100% derived** from `output.type` / id suffix — nothing to author.

---

## 7. Build order (Wave 2) & hand-offs
1. Add `categoryOf()` + the category strip to `renderArtisanActivities` for **smithing & crafting** (pure derivation, no data change) — ships the grid→tabs win immediately.
2. Add `foodClass` to the ~27 cooked items in `items.js`; add the **Provisions / Feasts & Draughts** tabs to cooking.
3. Wire the **auto-eat = healing-only** filter (Systems, §5.4).

- **Systems:** auto-eat filter, confirm `foodClass` doesn't clash with buff-consume flow, add smoke coverage (assert every recipe resolves to exactly one category; assert cooking tabs partition all cooked items).
- **Art:** style the category strip (reuse `data-lb`/`data-house` tab styling), category-count/next-unlock hints; no emoji.
- **Game Designer (me):** owns the `foodClass` assignments (§5.3) and the fish-line buff balance call (§5.4).
