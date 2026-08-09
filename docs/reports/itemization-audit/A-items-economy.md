# Itemization Audit — Slice A: Items · Data Architecture · Economy

**Auditor:** Systems Engineer · **Build:** b228 · **Date:** 2026-08-09 · **Scope:** READ-ONLY
**Sources cited:** `src/data/items.js`, `src/data/gear-tiers.js`, `src/data/recipes.js`, `src/legacy.js`, `src/features/rarity.js`, `src/market.js`, `src/save-migrations.js`.

---

## 0. Headline numbers (counted, not estimated)

**281 items total** (`Object.keys(ITEMS).length` against the merged runtime table).

| Category | Count | Notes |
|---|---:|---|
| Materials (no `type`, no food/seed/currency) | 92 | the largest bucket; 34 of these are dead (see §3) |
| Armour (`type:'armor'`) | 52 | 42 generated + 10 hand-authored |
| Consumables / food (`heals`/`foodClass`/`buff`) | 44 | 27 cooked + raws + meats |
| Weapons (`type:'weapon'`) | 30 | 28 generated + bespoke boss blades |
| Tools (`type:'tool'`) | 21 | 3 skills × 7 tiers |
| Blueprints + dungeon keys (`unlocks`) | 14 | all `bop:true` |
| Recipe scrolls (`recipe`) | 9 | `v:0`, single-use unlocks |
| Seeds (`seed`) | 9 | |
| Castle stores (`tag:'castle'`) | 4 | timber_beam, iron_fitting, field_ration, keystone |
| Currency (`premium`/`rarity:'currency'`) | 2 | hearth_token, muster_seal (Rally Seal) |
| Jewelry | 2 | copper_ring, hunter_necklace |
| Ammo | 1 | iron_arrows |
| Companion | 1 | fox_companion |

**156 recipes** — cooking 28, **smithing 87**, crafting 38, prayer 3 (`ARTISAN_RECIPES`).

**Rarity coverage:** 186 of 281 items carry **no rarity at all**. Rarity is only meaningful on the 5 gear types; every material, food, seed, key and currency is border-less by design (`GEAR_TYPES` gate in `rarity.js:40`).

---

## 1. Item DB architecture as-is

**Three tiers of definition, one of them generated, two of them duplicated.**

1. **`src/data/gear-tiers.js` — the generated spine (good).** A single `MATERIAL_TIERS × ARMOUR_SLOTS × WEAPON_FAMILIES` table produces **70 gear items** (6 armour slots × 7 tiers = 42; 4 weapon families × 7 tiers = 28) plus their **70 recipes**, from stat *curves* rather than hand-authored rows (`gear-tiers.js:99-142`, `146-194`). This is the healthiest part of the item system — add a tier or slot to the table and items + recipes + rarity + value all follow. It is exactly the model the rest of the DB should converge on.

2. **`src/data/items.js` — the canonical hand-authored table.** Spreads `GEAR_ITEMS` first so hand entries win (`items.js:8`), then ~200 bespoke entries. This is what `main.js` ultimately assigns to `window.ITEMS`, so it is the runtime authority.

3. **`src/legacy.js` — TWO stale inline copies.** `const ITEMS={…}` at `legacy.js:149` and `NEW_ITEMS` at `legacy.js:8694` (merged gap-fill at `8733`). These predate the ESM extraction and are overwritten at boot by the ESM table — but they are **drifted, not just redundant** (see §5, Dead/Broken). This is the single worst data-architecture liability in the slice.

### Field schema actually present
Every item is a terse object literal. Fields observed across the table:
`n` (name), `icon` (emoji last-resort glyph), `v` (book value), `type`, `slot`, `weaponType`, stat bonuses (`atkB/strB/defB/critB/xpB/spdB/rangeAtkB/rangeStrB/magicAtkB/magicStrB`), `heals`, `foodClass`, `foodTier`, `buff{type,magnitude,durationMs}`, `cookedFrom`, `seed`, `buryXp`, `toolSkill/toolTier/toolSpeed`, `rarity`, `tier`, `tag`, `bop`, `premium`, `musterOnly`, `unlocks`, `recipe`, `raw`, `note`.

### Hardcoded vs data-driven
- **Data-driven:** the gear ladder (tiers/stats/values/recipes/rarity), the raw-material flag (`RAW_MATERIAL_IDS` derived from gathering `prod` fields, `items.js:548-570`), food classification (`foodClassOf`/`foodKindOf`, `items.js:512-602`), artisan categories (`recipeCategory`, `recipes.js:284-319`).
- **Hardcoded/scattered:** every non-gear item is a literal; **level requirement lives only on the recipe, never on the item** (`req` on the recipe, no `level_req` on the item); **drop sources live only on `MONSTERS[x].drops`**, never on the item; the vendor rule is a runtime function, not data (`vendorPrice`, `legacy.js:5032`).

---

## 2. Bloat check

- **The 70 generated gear pieces are a legitimate ladder, NOT "+1/+2/+3" filler.** Each rung has a distinct stat off its curve (helm def `[3,5,10,16,24,33,44]`) and a real level gate. They are *ladder rungs*, not padding. **BUT** they are visually indistinguishable: all 42 armour pieces share `icon:'🛡️'`, all swords `⚔️`, differentiated only by the rarity border + a number. A player scanning the bag sees 42 shields. That is presentation bloat, not content bloat.
- **The four weapon families are near-duplicates.** Sword/warhammer/bow/staff run identical 7-rung ladders differing only by an atk/str split and a `weaponType` used for one mechanic (weakness matching, `getWeaknessInfo`, `legacy.js:1310`). There is no combat identity beyond the weakness tag — no attack speed, no range, no special. Four families × 7 = 28 weapons deliver roughly one weapon's worth of decisions.
- **Worst bloat = the 34 recipe-less monster drops (§3).** These are the genuine dead weight: pure inventory noise that exists only to be vendored.
- **Cape slot is starved** — only 2 non-unique entries in the whole game (`traveler_cape` defB 1, `alpha_cloak` defB 5); the Hunt kit deliberately doesn't fix it (`items.js:433-437`).

---

## 3. The 34 orphan drops (recipe-less tier-3–6 materials)

Confirmed by cross-referencing every recipe input against the material set: **34 materials are consumed by no recipe.** The b222 comment claims "the live orphan set was recounted at 34… and routed into castle demand" — but only **4** were actually routed (slime_gel, bone_chips, ancient_fragment, cracked_spellstone via keystone/timber_beam/iron_fitting). **The 34 orphans still exist.**

```
goblin_ear, bat_wing, vamp_dust, demon_shard, rune_frag, dragon_gem, ruby,
sticky_core, rat_tail, small_fang, goblin_totem, night_fang, dark_sigil,
venom_sac, spider_eye, brute_plate, dire_fang, alpha_fang, grave_dust,
plague_ichor, swarm_heart, wraith_veil, hell_ember, shadow_thread,
void_chitin, shadow_pelt, razor_claw, death_steel, war_crown, ancient_claw,
burnt_food, farm_deed, dragon_relic, void_essence
```

Two are intentional (`burnt_food` v1 trash; `farm_deed`/`dragon_relic`/`void_essence` are spendable elsewhere). The other **~30 are combat drops whose only use is the vendor** — the exact "boss loot is meaningless" failure the b223 comment warns against, still live for the whole low/mid drop table.

**Economy tail on this:** ~13 of the orphans are NOT in `RAW_DROPS`, so they vendor at **full `v`** (dragon_gem 2000, war_crown 2500, ancient_claw 1600, swarm_heart 650, hell_ember 600). A monster that drops these mints full gold on kill — an unintended gold faucet riding on drops that were never meant to be a gold path.

---

## 4. Stat system — live vs dead

**Combat is driven by a minimal set.** Damage: `maxHit = floor(dmgLvl*0.35 + strBonus*0.6 + 2)` (`legacy.js:1290-1291`); accuracy from atk-vs-defence. The style profile (`legacy.js:1275`) dynamically picks `atkB/strB`, `rangeAtkB/rangeStrB`, or `magicAtkB/magicStrB` per active style, so **all six weapon stats are read.** `defB` reads in `playerDefense` (`legacy.js:1299`). `xpB` is consumed (`legacy.js:1673, 1863`). `goldFind` is consumed at one choke-point (`applyGoldFind`, `legacy.js:1453`).

**Declared-but-dead item stats:**
| Field | Status | Evidence |
|---|---|---|
| `critB` (crit chance) | **DEAD** — summed and displayed everywhere, never rolled into damage. The visual "crit" class is just `dmg>=8` (`legacy.js:5833, 6248`), unrelated to `critB`. Only `iron_arrows` carries it. |
| `spdB` (gear speed) | **DEAD** — summed and displayed (`getEquipmentStats`, `getEquipmentTotals`), consumed by no action-timer. Only `leather_boots` carries it (.02). |
| `rareDrop` | **DEAD** as a bonus — `G.stats.rareDrops` is only a counter; no drop roll reads a rareDrop multiplier. Drop rolls use only weakness `dropMult` (`legacy.js:1020-1027`). |

**Dead BUFF types** (declared in `BUFFS_DEF` `legacy.js:12195-12208`, no engine reader):
| Buff type → bonusKey | Status |
|---|---|
| `drop_rate` → `dropRate` | **DEAD** — no `getBonus('dropRate')` reader. Broken on Cooked Lobster, Wheat Bread, Tomato Soup. |
| `monster_respawn` → `monsterRespawn` | **DEAD** — no reader. Broken on Hunter's Feast (+15% respawn), Tomato Soup. |
| `damage_crit` → `crit` | **DEAD** — feeds the dead crit path. Broken on Void Banquet (the game's top food). |

Live buff types: `all_xp`, `combat_xp`, `damage`, `gather_speed`, `gold_find`, `farm_yield` (the last two were themselves broken until b222/b228). So of the game's premium buff foods, several deliver **nothing** — a player eats a 2,400g Void Banquet and 1,100g Lich Soul Soup for effects the engine ignores or that were only wired years late.

---

## 5. Rarity / tier — and where the UI shows progression

- **Tier IS declared in data** for all gear (generated pieces carry `tier`, hand pieces backfilled at `items.js:483-489`). Non-gear materials mostly carry `tier` only where the castle contribution formula needs it (2/5/6/7); most materials have no tier.
- **Rarity is data-first, value-fallback:** `itemRarity()` (`rarity.js:52`) resolves explicit `rarity` → named-unique list → **value thresholds** (`<150 common … ≥8000 mythic`). This means a hand-authored gear piece with no rarity silently inherits a band from its gold value — coupling two unrelated axes (rarity should signal source/scarcity, `v` signals economy). A cheap-but-rare drop can never read as rare.
- **UI shows the border, not the ladder.** The rarity border renders (`.rr-frame`), and stat panels show equipped bonuses — but **nothing tells a player "this is rung 4 of 7" or "this is best-in-slot until Mithril."** Tier is invisible in the tooltip. Progression legibility is a real gap versus the "simple to understand" goal.

---

## 6. Economy — faucets, sinks, risks

### The single vendor rule
`vendorPrice(id)` (`legacy.js:5032`) is the only raw sink: `raw` items get `v × 0.20` (`VENDOR_RAW_RATE`, b226), everything else full `v`. This is applied at one choke-point wired through every sell path — architecturally clean. But **"raw" is a hand-maintained list for monster drops** (`RAW_DROPS`, `items.js:559-567`); the 13 orphan drops NOT on that list vendor at full value (§3).

### Faucets & sinks

| Type | Source | Notes / risk |
|---|---|---|
| **Gold faucet** | Monster gold drops (`applyGoldFind`, `legacy.js:1014`) | Scales with goldFind buff/perk; primary combat income |
| Gold faucet | Full-`v` vendor of non-raw drops | **RISK** — ~13 orphan drops (§3) are unintended full-value income |
| Gold faucet | Daily tasks, quest/bounty rewards, chests (`legacy.js:2272, 2331`) | Designed payouts |
| Gold faucet | Artisan output sold to vendor at full `v` | **Intended primary gold path** (b226 design) |
| **Material faucet** | Gathering (~flat ~300/h all tiers) | b226 fix: raws vendor at 20% so market becomes the real price |
| Material faucet | Monster drops | 34 of them route nowhere (§3) |
| **Gold sink** | Shops: `SEED_SHOP` (`legacy.js:523`), homestead/castle room upgrades (gold + materials, `legacy.js:3769, 3818`), theme purchases | Room ladders are the deepest sink (Great Hearth 250,000g + keystone×2) |
| Gold sink | Market house tax 1.5% (`market.js:29`) | Small, tunable |
| **Gem faucet** | Hearth Token redeem → 150 gems (`legacy.js:3965`); IAP; daily/reward grants (`legacy.js:1214, 13492`) | Token is IAP-only mint → server-authoritative bond, correct |
| **Premium currency** | hearth_token (IAP-only, tradable), muster_seal (play-only, `bop`, capped 1/day) | Deliberately split so the sold currency can't be farmed |

### Arbitrage / infinite-loop check
- **No infinite gold loop found.** Recipes cost materials whose `v` sums below/near the output `v`, but gathering is the rate limiter and raws now vendor at 20%, so crafting-to-vendor is a *time* faucet, not a mint. No recipe observed produces an item worth more than its inputs' full `v` in a way that closes a loop with buyable inputs.
- **Watch:** SEED_SHOP sells seeds at fixed gold; if any crop's harvest `v` (full, not raw — crops ARE raw so 20%) ever exceeds seed cost per cycle including yield buffs, farming becomes a gold printer. Currently crops are `raw:true` so they vendor at 20% — safe, but this is load-bearing and undocumented at the seed shop.
- **Rare items are scarce but often worthless** — the mid-tier orphan drops are scarce *and* have no sink beyond vendor, so they read as worthless. Scarcity without utility is the core itemization failure here.

---

## 7. Save / migration fragility

**The migration system is mature for SHAPE changes and absent for ITEM-IDENTITY changes.** `applyMigrations` (`save-migrations.js:447`) walks a versioned registry (currently v10), each step idempotent, wrapped in try/catch with a pre-migration backup and rollback. Good.

**But the itemization rework will rename/remove item ids, and there is NO item-id migration mechanism anywhere.** Every store keys on the raw id:
- `G.inventory[id]` (bag), `G.equipment[slot]=id` (worn) — `snapshotG` copies both (`legacy.js:10909`).
- `G.collection[id]` (collection log / achievement counters).
- Market listings store `itemId` (`market.js`).
- `G.autoActions.eat.foodId`, drop-log keys, blueprint `unlocks` strings.

Failure modes when an id is renamed/removed with no migration:
- **`addItem` guards** `if(!ITEMS[id])return` (`legacy.js:1903`) — a drop of a removed id silently vanishes.
- **Existing inventory/equipment entries do NOT guard on render** — an equipped item whose id no longer exists resolves `ITEMS[id]` to `undefined` in `getEquipmentStats` (guarded with `if(!it)return`, so stats drop silently) but can blank/NaN in several render sites that read `.n`/`.v` without a guard.
- Market listings for a removed id become unsellable/undisplayable ghosts.
- Collection-log and achievement counters keyed on the old id freeze.

**No `ITEM_ALIAS` / rename map exists.** The registry's own example stub (`save-migrations.js:387-397`) shows a field rename pattern but nothing analogous for the item table. **Any rename/removal in the rework MUST ship with (a) an id-alias map applied at load across inventory/equipment/collection/market/autoActions, or (b) a migration step per rename.** This is the single highest-risk dependency for the whole program.

---

## 8. Target-schema gap (current → brief's target)

| Brief target field | Present today? | Gap |
|---|---|---|
| `id` | ✅ object key | fine |
| `name` | ✅ `n` | naming only |
| `desc` | ⚠️ `note` on 1 item | **missing** for ~280 items |
| `category` | ❌ derived ad-hoc from `type`/`heals`/etc | **no explicit category field** — every consumer re-derives |
| `rarity` | ⚠️ 95/281 explicit, rest value-derived or null | inconsistent; coupled to `v` |
| `tier` | ⚠️ all gear, few materials | **missing** on most non-gear |
| `level_req` | ❌ only on the recipe | **not on the item** |
| `stats` | ✅ flat `atkB…` keys | works but flat, not a `stats:{}` block |
| `passives` | ❌ | none — closest is `buff`, and 3 buff types are dead |
| `crafting_req` | ⚠️ on recipe (`inputs`,`req`,`gated`) | not linked from the item |
| `upgrade_req` | ❌ | no upgrade system exists |
| `source` / `drop_sources` | ❌ | lives only on `MONSTERS.drops`; item can't answer "where do I get this" |
| `sell_value` | ⚠️ `v` = book value; vendor bid is a runtime fn | one field doing double duty |
| `tradeable` | ⚠️ inverse `bop:true` on some | not universal |
| `unique` | ✅ `rarity:'unique'` + named list | fine |
| `boss_exclusive` / `dungeon_exclusive` | ❌ | not modelled; keys use `unlocks` strings |

**Headline:** the current schema is a terse render-payload, not a content model. It has stats and value but is **missing `desc`, `category`, `level_req`-on-item, `source`/`drop_sources`, `passives`, and any upgrade linkage** — the exact fields the rework needs to make items self-describing and progression legible. The gear-tiers generator proves the team can drive a rich schema from data; the rework should extend that generator's approach to the whole table rather than hand-author 281 richer literals.

---

## 9. Top 5 highest-leverage changes for this slice

1. **Collapse the item table to one source and add an id-alias/migration layer BEFORE any rename.** Delete the two stale inline blocks in `legacy.js` (`const ITEMS@149`, `NEW_ITEMS@8694` — already dead and drifted), and land an `ITEM_ALIAS` map + load-time remap across inventory/equipment/collection/market/autoActions. This is the prerequisite that makes the entire rework save-safe (§7).

2. **Delete or repurpose the 34 orphan drops, and make every drop answer "what am I for."** Either give each a sink (recipe/turn-in) or cut it. Simultaneously fix the full-`v` vendor leak by making "raw/vendor-trash" a **derived** property, not a hand-list, so a new drop can't skip it (§3, §6).

3. **Kill or wire the dead stats/buffs.** `critB`, `spdB`, `rareDrop`, and the `drop_rate`/`monster_respawn`/`damage_crit` buff types are declared, summed, displayed, and ignored — the game shows players numbers that do nothing, including on its most expensive foods. Decide per stat: implement the reader or remove the field + UI (§4).

4. **Extend the gear-tiers generator into a full content schema** carrying `desc`, `category`, `level_req` (on the item), `source`/`drop_sources`, and a `stats:{}` block — and make `rarity` independent of `v`. Generate, don't hand-author, so 10× content stays consistent (§1, §8).

5. **Make progression legible in the UI.** Surface tier/rung ("Steel — rung 3 of 7"), level_req, and source on the item tooltip/detail card, and give gear per-slot/per-family iconography so the bag isn't 42 identical shields. This is the cheapest win against the "simple to understand" goal (§2, §5).

---

*End of Slice A. Slices B–D (combat/bosses/dungeons, crafting/gathering, rewards/progression) should reconcile with §7 (migration is program-blocking) and §4 (dead buffs cross into combat).*
