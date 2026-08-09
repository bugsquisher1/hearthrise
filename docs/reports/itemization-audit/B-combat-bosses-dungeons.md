# Itemization Audit · Slice B — Combat, Monsters, Bosses, Dungeons, Raids/Hunt, Bounties, Drop Tables

**Auditor:** Systems Engineer · **Date:** 2026-08-09 · **Build:** b228 · **Status:** READ-ONLY (no game code changed)
**Scope:** `src/data/monsters.js`, `src/dungeons.js`, `src/dungeon-scavenger.js`, `src/features/raids.js`, the bounty system in `src/legacy.js`, the core combat formulas, and every drop table.

---

## 0. Verdicts up front

- **Real bosses today: 8 data-modeled + a handful of implicit dungeon "bosses".** 6 in the Hunt (`raids.js`), 2 monsters flagged `boss:true` (`lich`, `dragon` in `monsters.js`). Dungeon "bosses" exist only as loot tables + a mini-game HP number, not as stat-bearing entities.
- **Boss framework: PARTIAL and SPLIT-BRAIN.** The Hunt has a genuinely data-driven boss array — you *can* add a Hunt boss by editing data. But that framework is welded to the weekly-clan-raid economy and does not describe an ordinary encounterable boss. The regular monster roster has no boss shape beyond a bare `boss:true` boolean with no behavior attached.
- **Dungeon itemization: architecturally present, thin and leaky.** Dungeons drop crafting mats, blueprints (BoP), and dungeon *keys* — but there is **no dungeon-native item identity** (no dungeon set, no dungeon currency/tokens, no dungeon-only gear). Several dungeon/Hunt **reward** materials are consumed by *nothing* (dead-end loot).
- **Drop tables: NOT standardized.** No rarity bands. Rates are raw floats scattered across four different files in three different shapes. "Rare" is inferred at runtime by a magic `ch <= 0.05` threshold.
- **Combat-effect hooks for unique boss effects (Emberfang "apply Burning"): MUST BE BUILT.** The combat loop reads accuracy + max-hit + weakness-match only. Crit is displayed but never applied. There is no status/DoT/elemental system.

---

## 1. What exists (with counts)

### 1.1 Monsters (`src/data/monsters.js`, 48 lines, 30 monsters)
30 monsters across 6 tiers, 5 families (`Vermin`, `Goblinoid`, `Beast`, `Undead`, `Arcane`/`Mythic`). Data shape (line 5):
```js
slime:{name,icon,tier,family,weaponWeak,hp,atk,def,xp,gp:[min,max],drops:[{id,ch}]}
```
- **`weaponWeak`** is the one combat-flavor field — `sword|hammer|ranged|magic|neutral`. Matching your weapon type grants the weakness bonus (§4).
- **`boss:true`** appears on exactly **2** monsters: `lich` (L46) and `dragon` (L47). The flag is **decorative** — nothing in the combat loop reads it (grep: no consumer in `legacy.js`/`combat-render.js`). It does not change HP scaling, phase behavior, drop banding, or UI treatment beyond whatever a renderer might key off it.
- Drops are a flat `{id, ch}` list; `ch >= 1` = guaranteed, else a probability.

### 1.2 The Hunt — the real boss content (`src/features/raids.js`, 1369 lines)
The weekly clan boss event. **6 bosses** in the `BOSSES` array (L79-104), original IP, each with:
```js
{ id, name, glyph, desc, def, weak, tiers:[..], sig:'<signature material>', reward:{gold,gems,items:{}} }
```
The six: **Emberclad Tyrant** (T1-2, hammer), **Hollow Regent** (T1-2, magic), **Maw Below** (T2-3, ranged), **Sunken Choir** (T3-4, magic), **Warden of the Long Dark** (T4-5, hammer), **Crownless Wyrm** (T5, ranged). Painted portraits wired (L113-128), degrade to the typographic `glyph`.

This is the **best-built system in the slice**: 5-tier ladder (`HUNT_TIERS` L152-163), server-authoritative economy, self-scaling pools (`pool = base + perMember × members`, L253), self-scaling damage clamp (L260), median-based reward bands (L198-202), a Lone Hunt solo variant (L169-176), 24h grace window (L481-489), and three-generations-of-server feature detection. The b219 hardening (server owns pool/clamp/claim; client is a mirror) is thorough and the exploit history (flat 250k pool that was never downed; client-computed chests) is documented in-file.

**Signature materials are the payoff that works:** each boss's `sig` (`slagheart_core`, `hollow_sigil`, `abyssal_pearl`, `choirbone`, `warden_seal`, `wyrm_gilding`) is consumed by a real tier-8 `rarity:'unique'` forge/craft recipe (`recipes.js` L128-131, L178; items `items.js` L460-465). This is the ONE place boss loot → unique gear actually closes the loop.

### 1.3 Dungeons (`src/dungeons.js` 803 lines + `src/dungeon-scavenger.js` 587 lines)
**7 instances** in `DUNGEONS` (L30-153): 3 "Dungeon" (crypt_of_bones, goblin_warcamp, haunted_archive), 2 "Raid" (obsidian_keep, voidbringer), 2 "World Boss" (ancient_wyrm... only 1 + obsidian_keep counted as raid). All are **solo** — the "4-player"/"24-player" party sizes were de-advertised in b213 (L266-270) because there is no party code.

Three run paths, unevenly implemented:
| Dungeon | Auto-run | Phase mini-game (`phases`) | Scavenger (`SCAVENGER_CONFIGS`) |
|---|---|---|---|
| crypt_of_bones | ✅ | ✅ | ✅ (only one configured) |
| goblin_warcamp | ✅ | ✅ | ❌ |
| haunted_archive | ✅ | ✅ | ❌ |
| obsidian_keep | ✅ | ✅ | ❌ |
| voidbringer | ✅ | ❌ (auto-only) | ❌ |
| ancient_wyrm | ✅ | ❌ (auto-only) | ❌ |

- **Auto-run** (`runDungeon` L190): pay key, roll loot once, apply cooldown. Instant.
- **Phase mini-game** (`startManualRun` L703): a 3-phase reaction/puzzle modal (gather/fight/dodge/puzzle), reward multiplier 0.4×-2.0× by phases passed, **no cooldown**. Genuinely interactive and decent.
- **Scavenger** (`dungeon-scavenger.js`): the richest content in the slice — start naked, gather/smith/cook throwaway kit across 5 rooms scaling to your *real* skill levels, then a boss fight granting 1 loot roll per 10% boss HP removed. **Only `crypt_of_bones` has a config** (L24-25; `Object.keys(SCAVENGER_CONFIGS).length` = 1, confirmed L587). The other six never get this experience.
- **Dungeon keys** (`dungeons.js` L745-802): BoP keys drop from theme-matched mobs (undead → `bone_key`, etc.), gating each dungeon. This is a real gather→spend loop.

### 1.4 Bounties (`src/legacy.js`)
Data at L596-611. A board of 3 bounties (`generateBountyBoard` L1986), types **cull/proof/streak/weapon** actually generated; **`boss` and `chain` types are defined in `BOUNTY_TYPE_MULT` (L607, 3×/4× rewards) but never generated** — dead branches. Rewards scale by tier×type×difficulty (L1960). Pays gold + **Bounty Marks** + Bounty-Hunter XP. Marks are spent in two places: `TRAITS.auto_eat` (100 marks, L4239) and `BOUNTY_SHOP` (L5537: reroll, auto-accept, +reroll/day, +10% turn-in gold, cosmetic cloak). Auto-eat is the only *gameplay* mark sink; everything else is QoL/cosmetic.

---

## 2. Boss-framework readiness vs the brief

Brief target: 5-10 progression bosses, 7+ daily/rotating, 4-8 weekly, dungeon bosses, a raid — all **data-driven** (add a boss by editing data).

| Brief bucket | Exists today | Gap |
|---|---|---|
| 5-10 progression bosses | **2** (`lich`, `dragon`, `boss:true` only) | No progression-boss framework. They're just tier-6 monsters with a cosmetic flag. |
| 7+ daily/rotating bosses | **0** | No daily boss and no daily rotation mechanism at all. |
| 4-8 weekly bosses | **6** (the Hunt) | Met numerically, but all 6 are *clan-raid* bosses, not solo weekly encounters. Solo players get a scaled-down Lone Hunt of the *same* boss. |
| Dungeon bosses | ~6 (implicit) | Not modeled as entities — just an HP number + loot table. Only 1 (`Bone Lord`) has real stats via a scavenger config. |
| Raid | **1 system** (the Hunt) | Present and strong; but it IS the weekly-boss system, so weekly + raid are the same feature. |

**Data-driven verdict: HALF.** You can add a **Hunt** boss by pushing one object into `BOSSES` (`raids.js` L79) + one tier row + one recipe for its `sig`. That is genuinely data-driven. But there is **no framework for an ordinary encounterable boss** — no boss table with phases, enrolment (daily/weekly), unique-effect declarations, or scaled drop bands. `boss:true` on a monster does nothing. To hit the brief you must **build a boss-definition schema** (id, tier, stats, phase/effect hooks, rotation cadence, banded drop table) and a rotation engine; the Hunt's tier/rotation code (`bossOfWeek` FNV1a-per-week, L345) is a reusable pattern but is tangled into the clan-raid transport.

---

## 3. Daily / weekly cadence gap

What exists:
- **Weekly Hunt** — declared once per UTC week, boss rotates weekly within its tier via `bossOfWeek(weekKey, tier)` (`raids.js` L345, hash `hr-hunt-<tier>-<week>`). Real, working weekly cadence.
- **Muster/Rally** (`src/features/muster.js`) — 2×/day clan events (referenced in DECISIONS; not a boss).
- **Rotating blessings** — daily/weekly presence-gated buffs (b227), a rotation calendar keyed off `utcWeekKey`/`utcDayKey` from `HearthriseWorldEvents` (the shared clock, `raids.js` L211-238).

What's missing vs the brief's "rotating daily-boss + weekly-boss vision":
- **No daily boss.** Nothing spawns or rotates a boss on a daily key.
- **The rotation mechanism to reuse EXISTS and is clean:** `HearthriseWorldEvents.utcDayKey()/utcWeekKey()` + `_hash()` (FNV1a) already deterministically pick content per period without server state. A daily-boss rotation is `BOSS_POOL[hash('hr-daily-boss-' + dayKey()) % n]` — the exact pattern `bossOfWeek` already uses. **Reuse this; do not reinvent a scheduler.**

---

## 4. Combat stats that matter (what the loop actually reads)

`combatTick` (`legacy.js` L2367) is the whole player-vs-monster loop. Per tick it reads **only**:
```
pDmg = random < accuracy ? rand(1, maxHit) : 0          // L2374
```
- **accuracy** (`getPlayerCombatRolls` L1286): `0.55 + ((accSkill+accBonus) − mob.def)×0.01`, ×styleMod ×weaknessMod, clamped 0.15-0.95.
- **maxHit** (L1291): `floor(dmgSkill×0.35 + strBonus×0.6 + 2)`, minus `def×0.03`, ×styleMod ×weaknessMod.
- **weakness match** (`getWeaknessInfo` L1310): weapon type == `mob.weaponWeak` → `WEAKNESS_BONUS` to damage+accuracy, plus a `dropMult` (neutral-weakness mobs give a drop bonus).
- **combat style** (`getActiveCombatStyle`): accuracy/damage/defense/speed mods + XP routing (staff→magic, bow→ranged).

**What combat does NOT read:**
- **Crit** — `critB` is summed into equipment stats (L1307) and *displayed* (L3320, L7647, L10164) but **never applied to damage**. The visual "crit" class on floating numbers (L5810, L6248) is faked from `dmg >= 8`. Crit is a **dead stat** in the core loop.
- **Elemental / damage types** — none. The only "type" system is `weaponWeak` (weapon-category matching), not elements.
- **Status effects / DoT** — no burning/poison/bleed/stun infrastructure anywhere in combat.
- **Passives / on-hit procs** — the only proc system is `rollProc` (L11410), a **companion economy proc** (gold / doubleDrop / doubleYield / instant / refund) that never touches HP or applies combat status.

**Verdict for boss unique-effects (Emberfang-style "chance to apply Burning"): the hooks DO NOT EXIST and must be built.** Required: (1) a combat-effect/status subsystem (apply, tick, expire, stack) that `combatTick` consults on hit and per tick; (2) a data channel on the boss/monster (and on gear) declaring effects like `{onHit:{effect:'burning', chance:.15, dps, dur}}`; (3) activating `critB` so crit is a real build lever. The companion `rollProc` switch (L11420) is a reusable **dispatcher pattern** (trigger → chance → effect switch) but its effects are reward-side, not combat-side — model on it, don't extend it.

---

## 5. Drop-table architecture assessment

**Not standardized. Four tables, three shapes, no rarity bands, one file each:**

| Source | File / line | Shape | Rate model |
|---|---|---|---|
| Monster kills | `monsters.js` L5+ | `drops:[{id, ch}]` | raw float per item |
| Dungeon loot | `dungeons.js` L38+ | `loot:[{id, qty:[lo,hi], chance}]` | raw float per item |
| Dungeon keys | `dungeons.js` L746 | `{monsterId:{keyId, chance}}` | raw float, separate map |
| Hunt chest | `raids.js` L361 `chestFor` | tier gold/gems + boss `reward.items` scaled by band×partial | derived, server-rolled |
| Bounty | `legacy.js` L601-609 | base×typeMult×diffMult | formula |

Problems:
- **No rarity bands** (common/uncommon/rare/very-rare/unique). "Rare" is inferred at the *consumer* by a magic threshold: `const rare = d.ch <= 0.05` (`killMonster` L2431). Change the threshold and every "✨ RARE" notification silently shifts. Items *mostly* lack rarity metadata — only ~26 of hundreds carry a `rarity:` key and ~16 a `tier:` key (`items.js`), concentrated on the Hunt-forged uniques and signature mats.
- **Rates are tuning-scattered:** to rebalance drops you edit `monsters.js`, `dungeons.js` (two maps), `raids.js`, and the bounty tables — five places, no single tunable source of truth. This is the "no single place to tune" problem the brief flags.
- **Weakness `dropMult` mutates rates at runtime** (`killMonster` L2426: `chance = ch×dropMult` capped .95), so the declared number isn't the effective number — a hidden multiplier on top of an already-scattered table.
- **Economy-exploit-relevant:** the Hunt's client-computed chest (b209) and the manual-run key-not-consumed bug (`dungeons.js` L713 fix) both trace to reward math living in multiple places. A standardized, server-echoed drop schema would have prevented both.

---

## 6. Boss loot identity — unique/exciting vs vendor trash

**Mixed. The Hunt gets it right; everything else is trash or dead-ends.**

- **Hunt (right):** each boss's `sig` material feeds a named tier-8 unique piece (Slagheart Platebody, Hollow Regent Helm, Abyssal Greaves, Choirbone Gauntlets, Warden's Girdle, Wyrmgilt Mantle — `items.js` L460-465). Boss → signature drop → unique gear. This is exactly the brief's "Emberfang, not Iron Sword +7" — for 6 bosses only.
- **Monster bosses (trash):** `lich` drops `lich_soul` (→ `lich_soul_soup` buff food) + `hollow_sigil` (a Hunt sig, oddly also a rare monster drop) + `soul_recipe` scroll. `dragon` drops `dragon_bones`/`dragon_scale` (mats), `dragon_gem` (2%), `ancient_claw`, `marrow_cookbook`. Modest identity, no unique boss weapon/armor.
- **Dungeon bosses (dead-ends):** `voidbringer` and `ancient_wyrm` hand out `void_chitin`, `void_core`, `dragon_scale`, `death_steel` — several of which **nothing consumes** (see below). Blueprints (BoP) are the real reward, but they're homestead items, not combat gear.

### The recipe-less / orphan drops (the "~34" from the program brief)
Cross-referenced every monster + Hunt-sig drop id against all recipe inputs (`recipes.js` + `gear-tiers.js`) and against intrinsic item identity (equipment/food/recipe-scroll flags in `items.js`). **73 distinct drop ids; 29 consumed by recipes; ~29 orphans** with no recipe use and no equipment/food/scroll identity:

```
alpha_fang, ancient_claw, bat_wing, brute_plate, dark_sigil, death_steel,
demon_shard, dire_fang, dragon_gem, goblin_ear, goblin_totem, grave_dust,
hell_ember, night_fang, plague_ichor, rat_tail, razor_claw, ruby, rune_frag,
shadow_pelt, shadow_thread, small_fang, spider_eye, sticky_core, swarm_heart,
venom_sac, void_chitin, war_crown, wraith_veil
```
(The program memo's "~34" likely also counts a few dungeon-only reward mats and near-misses like `dragon_gem`/`ruby` whose intended jewelry recipes — `dragon_gem_earrings` via `gemcutter_note` — are pointed at by a scroll but **the recipe body appears in no data file**, so they are de-facto orphans too.)

**Worst offenders are the loudest rewards:** `death_steel`, `void_chitin`, `hell_ember`, `war_crown`, `ruby`, `dragon_gem` are dangled as *boss/Hunt/dungeon* payouts yet are consumed by nothing — the game's most exciting-sounding drops are literal vendor filler. This is the single clearest itemization failure in the slice.

---

## 7. What works · what's confusing · dead-ends

**Works**
- The Hunt end-to-end: tiering, scaling, server authority, banded rewards, signature→unique-gear loop, grace window, multi-generation server tolerance. Model the whole boss program on its data+rotation approach.
- The scavenger dungeon (crypt_of_bones): skill-scaled throwaway-kit assembly + 10-roll boss fight is the most novel loop in the game.
- Dungeon-key gather→spend gating; bounty tier/type/difficulty reward formula.

**Confusing**
- `boss:true` implies a framework that doesn't exist.
- Crit is shown on 4 screens but does nothing — actively misleads build decisions.
- "Rare" flagged by a threshold, not by the data — the item doesn't know it's rare.
- Three dungeon run paths with wildly different depth; only 1 of 7 dungeons has the good one.

**Dead-ends**
- ~29 orphan drops (incl. marquee boss loot) consumed by nothing.
- `boss`/`chain` bounty types defined but never generated.
- Dungeon/Hunt reward mats (`death_steel`, `void_chitin`, `hell_ember`) with no consumer.
- No dungeon-native item identity (no set, no token/currency, no dungeon-only gear).

---

## 8. Top 5 highest-leverage changes

1. **Build a data-driven boss schema + rotation engine, and back-port the Hunt onto it.** One `BOSSES` table (id, tier, stats, `weak`, phase/effect hooks, banded drop table, `cadence: 'daily'|'weekly'|'progression'|'dungeon'`). Rotation = the existing `HearthriseWorldEvents` day/week key + FNV1a `_hash` pattern (`raids.js` L345) — reuse verbatim. This single change unlocks daily bosses (currently 0), a real progression-boss line (currently 2 cosmetic flags), and dungeon bosses as entities — and lets "add a boss = edit data" become true across the board.

2. **Standardize drop tables into one banded, tunable schema.** Rarity bands (common/uncommon/rare/very-rare/unique) with band→rate mapping in ONE constants file; every table (`monsters`, `dungeons`, keys, Hunt, bounty) references bands, not raw floats. Move the `rare` determination onto the item/band, delete the `ch <= 0.05` magic threshold, and make `dropMult` an explicit, visible band shift. Fixes tuning-scatter and closes the class of reward exploits.

3. **Retire the ~29 orphan drops — route each into a tier or delete it.** Every drop must answer "why does this exist?": either it feeds a recipe (add the recipe — the clan-overhaul "castle goods" plan already earmarks some), becomes gear/consumable, or is cut. Prioritize the marquee boss/Hunt/dungeon reward mats (`death_steel`, `void_chitin`, `hell_ember`, `war_crown`, `dragon_gem`, `ruby`) so boss loot stops being vendor trash.

4. **Build the combat-effect/status subsystem so boss unique-effects are wireable, and activate crit.** Add an effect engine (`burning`/`poison`/`bleed`/`stun`: apply/tick/expire/stack) that `combatTick` consults on hit and per tick, driven by a data channel on bosses and gear (`onHit:{effect,chance,...}`). Make `critB` actually roll and multiply damage. Model the dispatch on the companion `rollProc` switch (L11420) but on the combat side. This is the prerequisite for "Emberfang applies Burning" and for horizontal build variety.

5. **Give dungeons their own item identity (placeholders OK per Tyler).** Add a dungeon material/token per dungeon and at least one dungeon-native gear line or set bonus, so dungeons aren't just a mat/blueprint faucet; and finish the run experience — either give the other 6 dungeons scavenger configs or standardize on the phase mini-game. Architecture-first: define the schema now even if items are placeholders.

---

*Method note: counts and orphan set verified by script against the live data files at b228 (73 drop ids, 29 recipe-consumed, ~29 orphan). Combat-loop reads confirmed by reading `combatTick`/`getPlayerCombatRolls`/`killMonster`. Read-only audit — no game code modified.*
