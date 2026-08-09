# Itemization & Progression Rework — Master Spec

**Author:** Systems + Game Design · **Date:** 2026-08-09 · **Status:** APPROVED DIRECTION, building
**Inputs:** the 4 read-only audits in `docs/reports/itemization-audit/{A,B,C,D}.md` (build b228).
**Tyler's decisions (2026-08-09):** (1) **wire crit + speed** into real levers; (2) **defer** the combat status-effect engine — bosses get stat/loot identity now, DoTs later; (3) **real Prayer** payoff (prayer-points → blessings).
**Philosophy:** *Simple to understand, deep to master.* Every item answers **what / where / why**. Horizontal **and** vertical progression (builds, not just bigger numbers). Rare means rare. No dead systems.

This spec is the spine for a multi-build program and the **art brief source**: every boss, dungeon, unique item, and set named here is a scenario-artwork target.

---

## 0. Design pillars (Tyler, refined 2026-08-09) — non-negotiable

The item system must be **robust, synthesising, and fun** — one interconnected web, not a list. Five pillars govern every wave:

1. **Synthesising & interconnected.** Items reference each other on purpose — a drop feeds a recipe feeds a set feeds a boss. Nothing exists in isolation; every item has a *reason* and a *place in the web* (§6 cross-system, §7 orphans).
2. **Unique, custom aspects.** Beyond stat ladders — signature materials, set bonuses, boss-only effects/procs (`passives[]`), horizontal build levers (crit/speed now, status later). Marquee items are *characters*, not "+1" rungs. **No generic filler.**
3. **Simple to understand, deep to master.** A newcomer reads a tile and knows what to do; a veteran finds builds. Achieved by clarity surfaces, not by dumbing down.
4. **Explain everything on hover/tap.** Every item's detail answers **what it is · what it does · where it comes from · is it an upgrade · what it's used for / crafts into**. Rich, always-present, and identical on desktop hover and mobile tap (§5). The `desc` field + the source index + the "used in" reverse-recipe index power this.
5. **A Recipe Book — every combination, always visible.** A browsable book of **all** recipes in the game. A recipe you can't make yet shows as a **locked, grayscale** entry that *still lists the exact inputs + the level/station it needs* — so a player can see the whole crafting tree and plan toward it, never blocked by not-knowing. (Recipe Book = a Wave-2 deliverable, §9.)

**And the meta-pillar — SAFE TO EXTEND.** Adding an item must be *editing data*, never surgery, and must not create an exploit or a balance hole. This is enforced structurally, not by discipline:
- **Generate from curves** where a ladder exists (`gear-tiers.js` model) so a new tier is one table row.
- **Derived economy props** — vendor-trash/`sellValue`, rarity band → drop rate — are *computed from the item*, never hand-listed, so a new drop can't skip the vendor rule or mint gold (§7 vendor leak).
- **Server-authoritative** for anything an exploit could touch (drops, currency, market) — client requests, server validates.
- **Guard tests as the contract.** Every structural rule ships a smoke guard that FAILS if a future item violates it — e.g. the b238 guard "no food may declare a buff type absent from `BUFFS_DEF`", the item-DB identity guard, the migration round-trip. Add the guard *with* the rule so the rule can't rot.
- **The migration/alias layer** (§4) means a rename/removal is safe, so the DB can be refactored without fear.

---

## 1. What the audits found (the short version)

**Healthy — protect & extend:** the generated gear ladder (`gear-tiers.js`, 7 tiers from stat curves); the enforced two-stage refine spine (ore→bar→item, log→plank→item); the castle-goods Stage-3/4 chain; the Hunt (6 clan bosses) as the one place boss→signature-drop→unique-gear closes.

**The rot (all four slices agreed):**
1. **The game lies.** `critB`, `spdB`, `rareDrop` are shown everywhere and read by nothing; buff types `drop_rate`, `monster_respawn`, `damage_crit`, and the `defense` buff on Frostfin are shown but discarded; the displayed gear `reqLv` is a phantom gate (`equipItem` equips anything).
2. **~30 orphan drops** — incl. the loudest boss/dungeon loot (`death_steel`, `void_chitin`, `hell_ember`, `war_crown`, `dragon_gem`, `ruby`) — feed nothing; ~13 vendor at full value (an unintended gold faucet).
3. **Clarity holes.** Items can't say *where they came from* (monster-only, post-discovery, Collection-Log only); the "is it an upgrade?" compare is desktop-hover only; boss/dungeon loot is hidden until *after* you commit.
4. **Dead systems.** Prayer produces nothing; armour is a mono-skill sink (bars only); the Rally Seal is earned/capped/BoP/`v:0` and spendable on nothing.
5. **No boss framework** beyond a decorative `boss:true`; **0 daily bosses**; drop tables are 4 files / 3 shapes / no rarity bands.
6. **Program-blocking prerequisite:** there is **no item-id migration layer** — any rename/removal silently vaporizes inventory/equipment/market/collection.

---

## 2. The item content model (target schema)

Extend the `gear-tiers.js` generator philosophy to the whole table: **author once, as data; generate where a ladder exists.** Every item resolves to:

| Field | Meaning | Today |
|---|---|---|
| `id` | stable key | ✅ |
| `n` / `name` | display | ✅ |
| `desc` | one line: what it is / why you'd keep it | ❌ missing (~280) |
| `category` | explicit: material / weapon / armour / consumable / tool / key / currency / quest | ❌ derived ad-hoc |
| `rarity` | source/scarcity signal — **decoupled from `v`** | ⚠️ value-derived |
| `tier` | ladder rung 1..N | ⚠️ gear only |
| `levelReq` | **on the item**, enforced at equip | ❌ recipe-only, phantom |
| `stats{}` | atk/str/def/crit/spd/… (keep flat keys, add crit+spd as real) | ✅ flat |
| `passives[]` | on-equip effects (future status hooks land here) | ❌ |
| `source` | reverse index: drop / gather / craft / shop / boss / dungeon / rally | ❌ (§5) |
| `sellValue` | vendor bid; `raw`/trash is **derived**, not hand-listed | ⚠️ one field, hand-list |
| `tradeable` | market-eligible (inverse of `bop`) | ⚠️ |
| `unique` / `bossExclusive` / `dungeonExclusive` | identity flags | ⚠️ partial |
| `art` | painted icon key + tier tint + (boss/dungeon) scene ref | ⚠️ **← the artwork hook** |

---

## 3. Combat & stats — the decisions, made concrete

- **Crit is real.** On a landed hit, roll `crit = clamp(critB + getBonus('crit'), 0, CAP≈0.60)`; on crit, damage `×= CRIT_MULT (1.5)`, flagged in the log + floating number (replaces the fake `dmg>=8` visual). This also **activates the `damage_crit` buff** (Void Banquet finally works). Future gear/boss loot grants meaningful crit — the horizontal lever.
- **Speed is real (attack speed).** `spdB` (+ buff/gear) shortens the combat tick via a self-scheduling timeout, capped (~20%) to protect the pacing curve. Currently tiny (leather_boots .02) so live balance is safe; the mechanic exists for future gear.
- **`defense` buff** gets a real key wired into `playerDefense` (fixes Frostfin's lie). `drop_rate` → wired into the kill drop roll; `monster_respawn` → removed (this engine re-attacks instantly; repoint the 2 foods that use it).
- **`reqLv` enforced** at `equipItem` — with a grandfather so already-equipped over-level gear isn't stripped from live saves.
- **Status-effect engine (burning/poison/bleed): DEFERRED.** `passives[]`/`onHit{}` schema channel is reserved so it drops in later without a re-model.

---

## 4. Migration architecture (the prerequisite — Wave 1)

`ITEM_ALIAS = { oldId: newId, ... }` applied **at load**, remapping every store that keys on an item id: `G.inventory`, `G.equipment`, `G.collection`, `G.autoActions.eat.foodId`, market listings, drop-log, blueprint `unlocks`. Removed ids with no alias are dropped safely (not NaN-rendered). One versioned migration step + a **round-trip smoke test** (rename an id, load, assert inventory/equipment/collection all followed). **No content rename ships without going through this.**

---

## 5. Clarity — the reverse index (Wave 2)

One new data structure: **item → source index**, built by scanning `MONSTERS.drops`, `recipes`, `gathering`, shops, `dungeons.loot`, `raids` sig drops. Surfaced as a **"Source:" line** on the item flyout + tooltip, and to power **locked-item Collection previews** (see a rare thing + where it drops *before* you own it). Plus: promote `compareToEquipped()` into the tap flyout (mobile parity), render `chestFor()` on the Hunt card + drop-chance on dungeon rows (loot preview before commit).

---

## 6. Boss & dungeon ecosystem (Waves 4–5)

- **Data-driven boss schema + rotation.** One `BOSSES` table: `{id, tier, stats, weak, cadence: 'daily'|'weekly'|'progression'|'dungeon', drops: banded, sig}`. Rotation reuses `HearthriseWorldEvents.utcDayKey/utcWeekKey + _hash` (FNV1a) — the pattern `bossOfWeek` already uses. Unlocks: **daily bosses (0→7+)**, real **progression bosses** (lich/dragon become entities, not flags), the Hunt back-ported onto the schema. Boss loot = signature material → named unique piece (extend the Hunt model): *Emberfang, not Iron Sword +7.*
- **Dungeon identity.** A dungeon token/material per dungeon + at least one **dungeon-native gear line / set bonus** (placeholders OK per Tyler — architecture first), and finish the run experience (scavenger config or the phase mini-game for all, not 1 of 7).
- **Drop tables standardized** into rarity bands (common→unique) with band→rate in ONE constants file; delete the `ch<=0.05` magic "rare" threshold.

---

## 7. Orphans, economy, consumables (Wave 3)

Route each of the ~30 orphan drops into a recipe/gear line or cut it — prioritize the marquee boss/Hunt/dungeon mats so boss loot stops being vendor filler. Make **vendor-trash a derived property** (closes the full-value leak). **Armour cross-system:** add a wood/leather/thread secondary to armour recipes (6 slots stop being a mono-mining sink). **Bridge the refine spine into gear** (one mid-tier piece needs a `timber_beam`/`iron_fitting`). **Rally Seal sink:** a seal exchange/vendor. **Consumables:** fix the dead `defense` buff, resolve the fuzzy Provision/Feast split, re-tune 1–5% magnitudes so a Feast is worth cooking.

---

## 8. Prayer payoff (Wave 6)

Bones (the universal 100% drop) → prayer charges spent on activatable **blessings** (damage / protection / drop-rate). Closes bones→prayer→combat and kills the loudest dead-end. Its own wave; touches `skills.js`, the prayer recipe block, and the combat formula.

---

## 9. Wave plan (each wave is shippable + tested)

1. **Foundation & Honesty** — migration/alias layer + round-trip test; wire crit + speed; fix dead buffs (`defense`, `drop_rate`, `monster_respawn`); enforce+grandfather `reqLv`. *No renames beyond what the alias covers.*
2. **Clarity & Sources** — reverse item→source index + Source line + "used in" reverse-recipe index + rich always-present hover/tap detail (pillar 4) + the **Recipe Book** (pillar 5: every recipe, locked ones grayscale with their inputs + level/station shown) + mobile flyout compare + boss/dungeon loot preview + locked-item Collection preview.
3. **Orphans & Economy** — route/cut the ~30 orphans; derive vendor-trash; armour cross-system; refine-spine→gear bridge; Rally Seal sink; consumable re-tune.
4. **Boss ecosystem** — data-driven boss schema + daily/weekly rotation + progression bosses + Hunt back-port + banded drops.
5. **Dungeon identity** — dungeon tokens + a dungeon gear line/set + finish run experiences.
6. **Prayer payoff** — prayer-points → blessings.

**Artwork handoff:** after Wave 4–5 the content roster (bosses, dungeons, unique sets, tiered gear) is fixed and named — that named roster **is** the scenario-AI artwork backlog (each entry = one art target, with tier tint + scene ref from the `art` field).

---

## 10. Testing & safety

Every wave ships regression tests in `smoke-test.js`. The non-negotiable one is the **item-id migration round-trip** (Wave 1) — it is what makes every later rename safe. Server-authoritative economy is preserved (client requests, server validates; no new client-trusted drops/currency). Priority order on conflict stays: stability > functionality > progression > data integrity > server authority > economy > loop > UI > social > endgame > monetization.
