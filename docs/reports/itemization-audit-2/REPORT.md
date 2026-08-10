# Hearthrise — Final Itemization & Progression Audit

*Lead Game Systems / Economy / Progression Designer synthesis of 10 domain audits. Design anchor: **Simple to understand, deep to master.** Operating contract: no placeholders, no fakes, fix don't document, decide autonomously, do not preserve bad systems merely because they exist.*

---

## 1. Current-State Audit — what exists, honestly

Hearthrise is structurally further along than it feels to play. The **data spine is genuinely excellent**; the **surfacing and reward layers are half-built and, in several flagship places, dishonest**.

**What is genuinely strong (keep and build on):**

- **One shared gather engine.** `doSkillAction` (legacy.js:2894) drives Woodcutting/Mining/Fishing off declarative `TREES`/`ROCKS`/`FISH_SPOTS` tables. Adding a node is one data row. Every ladder climbs 1→99 with a strictly-increasing xp/sec curve (verified per-rung after the b226/b215 retunes).
- **One generated gear ladder.** `gear-tiers.js` produces ~70 armour/weapon pieces + recipes + values + wield gates from a single `MATERIAL_TIERS × ARMOUR_SLOTS × WEAPON_FAMILIES` table. Drift is structurally impossible. Hand-authored uniques override cleanly (items.js:11). This is the model the rest of the codebase should aspire to.
- **Declarative, guarded recipes.** Recipes are data rows; categories are *derived* (recipes.js:285-348); `mergeGenerated` lets hand-authored recipes win (recipes.js:199-206); a b243 **reachability guard** structurally prevents orphan-*source* resources.
- **One authoritative combat engine.** `getPlayerCombatRolls` / `getMonsterCombatRolls` / `combatTick` share one `COMBAT_BALANCE` table. Crit (b235), weakness multipliers, combat styles, and drop-rate food buffs (b238) are real, capped, and read consistently.
- **A mature weekly-boss system already exists.** The clan/solo **Hunt** (raids.js, 1,373 lines) is server-authoritative and data-driven: `{def, weak, tiers, sig, reward}`, weekly rotation within tier bands (FNV-1a hash), size-scaling HP pools, banded chests, partial-credit grace, and **6 signature materials that each feed a real level-90+ recipe** (items.js:458-462 → recipes.js:128-179). This is the target pattern, already shipping — for one system.
- **Buff plumbing is correct.** `foodClass` splits Provisions from Feasts/Draughts; `applyBuff`/`getBuffBonuses` aggregate correctly; the power budget clamps temporary buffs to 15%/total 30%.

**What exists but is hollow, invisible, or dishonest:**

- **The artisan gate is invisible.** The live tile renderer `tileForArtisan` gates only on skill level — it never calls `hasWorkbench()` or `gateOk()`. Smithing/crafting recipes render fully-lit and clickable with no Forge built; the click fails with a *transient* toast that vanishes. This is the literal "I can only craft a fishing rod / the Forge gate is invisible" complaint.
- **Tools feel dead.** Gathering tools work mechanically end-to-end, but they are speed-ONLY, +5% at the entry tier (a 3000ms action → 2850ms, sub-perceptual), 100% optional, and **surfaced nowhere in the UI**. This is the literal "the fishing rod does nothing" complaint. Artisan skills have **no tools at all**.
- **The combat preview lies.** The monster-preview modal — the primary click-path into a fight — renders every drop as "1× · common" (reads wrong field names) and forecasts DPS/kills from a formula that does not match the engine.
- **Three flagship combat foods are inert.** The `damage` buff type has **zero engine readers**; Cooked Shark, Swordfish Steak, and Bear Claw Pie promise a damage buff the maxHit calc never reads.
- **The most common dungeon reward is dead.** Housing blueprints drop from dungeons but `upgradeRoom` never consumes them (P0).
- **Dungeons are a skeleton.** DUNGEONS is self-described as a "stub": 6 solo instances, cosmetic `{name,title}` bosses, no stats/weakness/mechanics/drop schema, no dungeon currency. The two endgame instances have no encounter at all — just an auto-run loot roll on a cooldown.
- **Itemization is purely vertical.** The entire crafted gear ladder carries zero crit/speed/passive stats; accuracy saturates at the 0.95 clamp so half of every weapon's stat budget is dead; Warhammer is strictly the best melee weapon at every tier because no family carries a speed penalty.

The one submitted "Player progression clarity" audit returned only placeholder text (`"Test"`); its findings are treated as unavailable and folded into the cohesion analysis rather than invented.

---

## 2. Problems Found — ranked

### P0 — Broken core loop (fix first, cheapest high-value fix in the game)

**P0.1 — Housing blueprints are dead.** `upgradeRoom` never consumes blueprints (legacy.js:4121-4145). The single most common dungeon reward is inert, breaking the dungeon→homestead progression link entirely.
*Impact:* Players collect the headline dungeon reward and can do nothing with it. The endgame's main sink is a no-op.

### P1 — Dishonesty & the named player complaints

**P1.1 — Artisan workbench gate is invisible.** `tileForArtisan` (legacy.js:11306-11348) gates only on level; never checks `hasWorkbench()`. Recipes render lit and clickable with no Forge; the click fails via a transient toast (legacy.js:9760). *This is the "Forge gate invisible / can only craft a fishing rod" complaint.*

**P1.2 — Recipe-scroll gate is invisible.** Same renderer ignores `gateOk()` (legacy.js:9562). Scroll-gated recipes (Chief's Blade, Hunter's Feast) look available and fail on click. The dead `renderArtisanActivities` *used* to show "📜 Recipe locked" — that indicator was lost when `tileForArtisan` became the live path.

**P1.3 — Tools are imperceptible and unsurfaced.** Entry tools are +5% (items.js:22,27,32) = 150ms on a 3s action, and no UI anywhere says a tool is equipped/applied (legacy.js:11268-11289). *This is the "tools do nothing" complaint.* Compounded: tools are fully optional (nothing requires a rod to fish) and carry no XP or double-yield axis.

**P1.4 — Artisan skills have no tools at all.** Every `type:'tool'` item is gathering-only (items.js:22-36). Half of the stated tool vision (tools improving cooking/smithing/crafting) does not exist.

**P1.5 — Combat preview shows every drop as "1× common."** `lootRowHtml` (legacy.js:7048-7061) reads `d.chance`/`d.qty` but monster drops use `d.ch` and carry no qty, so every drop falls through to the defaults. The entire rarity structure is invisible at the point of decision.

**P1.6 — Combat preview forecast uses the wrong formula.** `estimateCombat` (legacy.js:7022-7024) computes `maxHit = floor(str*0.18*weak+1)`; the engine uses `floor(dmgLvl*0.35 + strBonus*0.6 + 2)` (legacy.js:1372). Every DPS/kills-per-hour/XP number shown before a fight is fiction.

**P1.7 — The `damage` buff type has no reader.** Cooked Shark / Swordfish Steak / Bear Claw Pie promise damage the maxHit calc never reads (grep for `getBonus('damage')` = 0 matches). The flagship OSRS-heritage combat food delivers exactly nothing.

**P1.8 — No unified boss schema; bosses exist in three incompatible shapes.** DUNGEONS `{name,title}`, MONSTERS entries (Boss of the Day), and raids.js `BOSSES[]` share no fields. The boss-ecosystem plan (loot preview, weekly boss, prayer) cannot be built on a common shape.

**P1.9 — Same dungeon boss, two identities.** Crypt of Bones is "The Marrow King" in DUNGEONS but "The Bone Lord" in the scavenger config that actually runs (dungeons.js:37 vs dungeon-scavenger.js:42). Direct proof of no single source of truth.

**P1.10 — Weapon accuracy is a near-dead stat.** Player accuracy saturates at the 0.95 clamp against the low-DEF monsters that dominate the game (legacy.js:1367-1370). Bronze (atkB 4) and Dawnsteel (atkB 42) both round to ~0.79 vs a def-20 mob — a 38-point spread producing no perceptible effect. Weapon choice collapses to "most strB."

**P1.11 — Warhammer is strictly best melee at every tier.** ~2× the strB of the same-tier sword (gear-tiers.js:68-78) with no speed penalty anywhere — `speedMod` is threaded as default 1 and never varied (legacy.js:7600-7620). Melee family choice is a trap for uninformed players.

### P2 — Hollow loops, dead resources, drift traps, pacing

**P2.1 — Endgame dungeons are empty.** voidbringer (L80) and ancient_wyrm (L95) have neither phases nor scavenger config — pure auto-run loot rolls (dungeons.js:135-174). Only 1 of 6 dungeons has a full encounter.

**P2.2 — No dungeon currency/material ecosystem.** Keys are entry gates, not an earned currency; no dungeon-scrip, no dungeon-only crafting ladder. The Hunt's proven signature-material loop was never applied to dungeons.

**P2.3 — Auto-eat discards Provision buffs.** `maybeAutoEat` heals directly and skips `applyBuff` (auto-actions.js:196-210), so the "every food carries a buff" claim is only true on manual eating — which auto-eat exists to eliminate.

**P2.4 — Gold ore/bar tier is a near dead-end.** An entire mid-game mining rung (Mining 45) exists almost purely for XP; `gold_bar`'s only live consumer is one Crafting-25 necklace; no gold gear tier exists.

**P2.5 — Turnip is a dead-end crop.** The first crop a new player grows has no cooking recipe (gathering.js:81 vs recipes.js). New farmer/cooks can't cook their starter harvest.

**P2.6 — Combat mats are crafting dead-ends.** spider_eye, brute_plate, dire_fang, alpha_fang, razor_claw, death_steel, ancient_claw, hell_ember, war_crown, night_fang, and more are never recipe inputs. Kills produce vendor-trash. The reachability guard can't catch this — it verifies sources, not sinks.

**P2.7 — Drop tables have no rarity bands.** "RARE" is a hardcoded `0.05` magic number duplicated at legacy.js:2702, 6379, 1106. No standardized way to tune a band or drive pity/collection-log framing.

**P2.8 — Crafted ladder is 100% vertical.** All ~70 generated pieces carry only atk/str/def — zero crit/spd/passive (gear-tiers.js:99-150). Horizontal identity is a boss-loot-only privilege (~14 uniques). Buffs are currently a *stronger, more horizontal* power source than crafted gear, inverting the intended prestige.

**P2.9 — Armor defB only lowers hit chance, never damage-per-hit.** Monster `maxHit = floor(atk*0.45)` has no defense term (legacy.js:1382-1387). Defensive gear is dominated by HP + food; top-tier armor feels weak for its cost.

**P2.10 — Data double-copy traps.** Stale divergent duplicates that already drifted: inline `MONSTERS` (legacy.js:114-154, e.g. small_wolf missing raw_wolf_meat), inline ITEMS food twin (legacy.js:219-236, cooked_shark damage 12 vs 4), dead Phase A.1 recipe block (legacy.js:9421-9542, self-labelled "stale twin"), and two dead `renderArtisanActivities` copies. All shadowed by ESM at boot but each is a live trap for the next editor.

**P2.11 — Boss of the Day is not a boss.** It is a +50% drop / +25% XP buff on a normal MONSTERS entry (boss-of-the-day.js). The 7+ daily-boss target is essentially unmet.

**P2.12 — Redundant monster gear drops.** bronze_sword .03, rune_sword .006, etc. duplicate reliably-craftable gear at trivial, below-tier rates — table noise, a false hunt.

**P2.13 — farm_deed filler in all 6 dungeons.** A non-combat farming item is the most consistent "reward" of the entire combat ladder (dungeons.js:43,70,94,124,151,172).

### P3 — Polish, honesty comments, pacing valleys

- **P3.1** Coal chokepoint at Mining 30–52 only half-mitigated; mid-game Smithing pace gated on 1/swing coal.
- **P3.2** Fishing 20→40 dead zone (Trout→Lobster), the widest gap on any gather ladder.
- **P3.3** Hunt-forged clan capstone armor is plain defB sticks — the rarest gear in the game plays identically to a bigger Dawnsteel piece.
- **P3.4** Weakness is effectively binary and fights the progression system (swapping weapon type reroutes XP to an off-skill you lack levels in).
- **P3.5** Buffs are too shallow (2–5%) and can't be auto-consumed; no "drinks" system, so Feasts are collection items.
- **P3.6** Stale `power-budget.js:80-82` comment lists crit/dropRate as "no reader" when both were fixed; only `damage` is genuinely dead.
- **P3.7** Boss fight mechanics are generic — 4 phase types reused with cosmetic swaps; no per-boss identity.
- **P3.8** `xpB` on gear is surfaced but appears at 0.01–0.03 on a handful of items — noise, not a chaseable lever.

---

## 3. New Itemization Philosophy — "Simple to understand, deep to master"

Ten rules, each a direct answer to a problem above. These are the design constitution; every wave in Section 10 serves them.

1. **Every gate is visible before the click, never after.** Level, room, and scroll gates present one consistent locked-state vocabulary on the tile itself. A failure the player couldn't have foreseen is a bug. *(fixes P1.1, P1.2)*
2. **Every stat a player can see must do something they can feel.** No sub-perceptual nudges, no dead stat halves, no inert buffs. If a number renders, an engine reads it. *(fixes P1.3, P1.7, P1.10, P2.8)*
3. **Every resource has a real sink.** Every gathered mat, every dropped mat, every smelted bar feeds a recipe, a turn-in, or a defined purchase. We add a **sink-side reachability guard** so hollow loops fail the test suite. *(fixes P2.4, P2.5, P2.6)*
4. **One source of truth per fact.** No content lives in two files. Delete every stale twin; add divergence smoke tests. Data-first: content changes are data rows, not engine edits. *(fixes P1.9, P2.10)*
5. **Progression is vertical AND horizontal.** Tiers get bigger; families and slots get *different*. Crafted gear must carry a horizontal fingerprint, not just a bigger number — otherwise there is one dominant path and no build. *(fixes P1.11, P2.8)*
6. **Rewards have identity, not just magnitude.** Boss and dungeon loot plays differently — a passive, a set bonus, a signature material feeding a signature craft. "Bigger defB" is not a reward. *(fixes P2.13, P3.3)*
7. **Bands, not magic numbers.** Rarity, drop chance, and power are expressed as named bands derived from shared constants, so a whole tier can be tuned in one place and the UI can frame it. *(fixes P2.7)*
8. **Tools are felt.** A tool changes the loop in a way the player can name: a speed you notice, an XP line, a visible extra drop, or a gate whose absence you feel. And tools exist for artisan skills too. *(fixes P1.3, P1.4, P3.4)*
9. **The idle loop is the real game.** A buff, a tool, or a food that only works when manually clicked mid-fight does not exist for most players. Automate it or don't ship it. *(fixes P2.3, P3.5)*
10. **One schema per concept, consumed by every surface.** A boss is authored once and referenced by dungeon, daily, and weekly systems. A weapon family maps 1:1 to a weakness. Structure enables the ecosystem; private shapes kill it. *(fixes P1.8, and enables Sections 5–7)*

---

## 4. Equipment Progression — the tier framework

The crafted spine is the correct backbone (`gear-tiers.js`). We keep the 7 generated tiers, **add a horizontal fingerprint per family**, and cap the ladder with a distinct **signature/prestige band** that plays differently rather than just bigger. Tier names below use the shipping material ladder.

| Band | Tiers | Source | Role |
|---|---|---|---|
| **Early** | Bronze → Iron → Steel | Craft from Mining/Woodcutting mats via Forge + Workshop | Learn the loop; first felt tool; first wield gate |
| **Mid** | Mithril → Adamant/Rune | Craft; scroll-gated named pieces (Chief's Blade) from monster drops | First horizontal choices; weakness loadout begins to matter |
| **End (crafted)** | Ember → Dawnsteel | Craft from top ore/plank tiers; gated by high skill + late rooms | The vertical ceiling of the craft economy |
| **Signature (prestige)** | Hunt-forged set; dungeon signature weapons; boss uniques | Boss/dungeon signature materials → level-90+ recipes; bind-on-pickup | **Horizontal endgame** — passives, set bonuses, crit/speed identity, not bigger defB |

**Horizontal fingerprint to bake onto the generated ladder** (Rule 5), so build diversity starts at the craft bench, not only at boss loot:

- **Sword** — fast/balanced `speedMod`, small innate accuracy lean.
- **Warhammer** — slow/heavy `speedMod` that *pays for* its high strB (removes the strict-dominance bug P1.11).
- **Bow** — fast, small innate `critB`.
- **Staff** — slow, small innate magic passive.

**Weapon family ↔ weakness is a 1:1 map** (sword/warhammer/bow/staff → the 4 non-neutral weaknesses). This structure already exists; we make it a real loadout lever by giving matched-weakness kills off-type XP catch-up so swapping weapons is not a progression tax (P3.4).

**The "never more than ~15 levels from a visible upgrade" promise** is currently undercut because combat *level* dominates max hit, not the weapon (P2.14/finding). Rebalance the tier curves so the weapon contributes a larger share of max hit (steeper strB curve or lower level coefficient), so each craft is a felt jump.

**Signature/prestige band earns its rarity by playing differently** (Rule 6): Hunt-forged and dungeon-signature *armor* gain set bonuses or situational passives (the weapons already have identity via Whispering Codex, Dragonfang Pike, etc.). The rarest objects in the game must not be plain stat sticks.

---

## 5. Boss Ecosystem

**The single greatest structural opportunity in the game:** promote raids.js `BOSSES[]` into a shared **`src/data/bosses.js`** and have DUNGEONS, Boss of the Day, and the Hunt all reference boss records by id. One boss authored once, consumed by every surface (Rule 10). This is the prerequisite for the entire boss-ecosystem plan (loot preview, weekly boss, prayer).

### 5.1 The three axes

- **Progression bosses (5–10):** the dungeon bosses. Currently 6 skeletons; only 1 has a real encounter. Give each a full record + one signature mechanic + a signature material.
- **Daily boss (7+):** replace "buffed wandering monster" with a rotating **Boss/Dungeon of the Day** that features a *real* boss record and grants a bonus run — tying the daily surface to the progression and weekly surfaces (Rule 10).
- **Weekly bosses (4–8):** **already met** by the Hunt. This is the reference implementation; do not rebuild it — extend it and copy its loop.

### 5.2 Data-driven boss schema (`src/data/bosses.js`)

```
Boss {
  id:            string          // authored once, referenced everywhere
  name:          string          // single source of truth (kills the Marrow King / Bone Lord split)
  title:         string
  tier:          int             // 1..8, ties to gear/material band
  level:         int             // combat level gate
  style:         'melee'|'magic'|'ranged'
  weakness:      family-id       // 1:1 with a weapon family
  resistance:    family-id|null  // NEW field — raids.js lacks it
  hp:            int             // single authoritative pool (kills the enemyHp/bossHp duplication)
  def:           int             // higher than field mobs so weapon atkB regains meaning
  mechanics:     [ {type, trigger, effect} ]   // NEW — enrage / add-spawn / weakness-exploit
  dropTable:     [ {itemId, band} ]            // band-based, not raw floats
  signatureItem: itemId          // the identity reward
  signatureMat:  itemId          // feeds a signature recipe (Hunt pattern)
  surfaces:      ['dungeon'|'daily'|'weekly']  // where this record appears
}
```

### 5.3 Reward philosophy — identity, not bigger numbers

Every boss owns a **signature material → signature recipe** loop (the Hunt already proves this: slagheart_core → level-90 recipe). Rewards must satisfy Rule 6:

- **Signature material** that only this boss drops, feeding a craft only this material unlocks.
- **A passive or set bonus**, not a bigger defB stick — the prestige band plays differently.
- **Band-based drop tables** so odds are legible in the (now-fixed) loot preview and tunable per band.
- **No filler.** Replace `farm_deed` across all 6 dungeons with per-boss thematic guaranteed drops (P2.13).
- **Per-boss mechanic** (enrage timer / add phase / weakness-exploit bonus) so the 4 generic phase types become boss-specific and the fight *feels* like the reward's origin (P3.7).

---

## 6. Dungeon Ecosystem

Dungeons are the emptiest major system and the source of the P0. The fix is to **copy the Hunt's proven loop** rather than invent a parallel one.

### 6.1 Materials & currency (new)

- **Dungeon scrip** — a soft currency earned per clear, spent at a **dungeon quartermaster** for blueprints, mats, and cosmetics. Gives a reason-to-grind loop beyond the rare unique.
- **Per-dungeon signature materials** — mirror `slagheart_core`: each dungeon drops one signature mat feeding a dungeon-only recipe ladder. This is the sink dungeons currently lack (P2.2).
- Keys remain *entry gates* (thematically coherent: undead → bone_key), not the reward currency.

### 6.2 Equipment

- Keep the distinct bind-on-pickup signature weapons (Whispering Codex, Voidmaw Scepter, Dragonfang Pike — they already have identity).
- Give dungeon *armor* set bonuses (Rule 6). Route signature mats into the prestige band of Section 4.

### 6.3 Placeholder architecture — fix the P0 and the skeletons

- **P0: wire `upgradeRoom` to consume blueprints** (legacy.js:4121-4145). This alone reconnects dungeon→homestead, the most common reward's entire purpose.
- **Reconcile the two boss identities** (dungeons.js:37 vs dungeon-scavenger.js:42) by referencing `bosses.js` records.
- **Build real encounters for voidbringer (L80) and ancient_wyrm (L95)** — the marquee content is currently a cooldown button (P2.1).
- **Expand from 6 toward 8–10 progression dungeons** with distinct themes/mats once the schema and currency exist.
- **Honor or remove `partySize`** — advertised multiplayer is phantom (the run engine is solo). Until real party code lands, don't overpromise "raid."

---

## 7. Cross-System Dependency Matrix — THE interconnection loop *(paramount)*

This is where the game is won or lost. Individual systems are healthy; the **links between them** are where the breaks, dead-ends, and dishonesty live. The intended loop:

```
GATHER ──ores/logs──► REFINE (bars/planks) ──► CRAFT/SMITH (gear/tools) ──► COMBAT
   ▲                                                    │                       │
   │                                                    ▼                       ▼
FARMING ──crops──► COOKING (food/buffs) ──heals/buffs──► COMBAT           DROPS (mats,
   │                    ▲                                   │              scrolls, keys,
   │                    └──────── buffs feed back ──────────┘              blueprints)
   ▼                                                                            │
CASTLE/HOMESTEAD ◄──blueprints/mats──── DUNGEONS/BOSSES ◄──keys/gear─────────────┘
     (rooms = benches, buff scalers)          ▲
                                              └── signature mats ──► top-tier RECIPES
```

**Link status matrix** (✅ wired · ⚠️ weak/pacing · ❌ broken — the links to ADD/FIX):

| From → To | Status | Evidence / Action |
|---|---|---|
| Gather → Refine → Craft | ✅ | Core loop wired; ores→bars→gear, logs→planks→gear |
| Gather (Gold) → Craft | ❌ | Gold bar has one consumer. **ADD** jewelry/gem lane (P2.4) |
| Farming → Cooking | ⚠️ | 8/8 fish cook; **turnip has no recipe** — ADD cook_turnip (P2.5) |
| Mining (coal) → Smithing pace | ⚠️ | Coal 1/swing gates all mid bars 30–52 — pacing fix (P3.1) |
| Craft → **Bench gate** → Player | ❌ | `tileForArtisan` never surfaces `hasWorkbench`/`gateOk`. **ADD** the gate read to the renderer (P1.1/P1.2) — *the paramount UX link* |
| Tools → Gather loop | ⚠️ | Works but invisible + imperceptible. **ADD** UI label + XP/double axes (P1.3) |
| Tools → Artisan | ❌ | No artisan tools exist. **ADD** via the `d.artisan` branch at legacy.js:2772 (P1.4) |
| Combat → Preview → Player | ❌ | Preview reads wrong fields + wrong formula. **FIX** to `d.ch` + real engine (P1.5/P1.6) |
| Cooking → Combat (heal) | ✅ | Auto-eat heals correctly |
| Cooking → Combat (buff) | ❌ | `damage` has no reader; auto-eat skips buffs. **ADD** reader + auto-buff/drinks (P1.7/P2.3) |
| Drops → Craft (sink) | ⚠️ | Many mats dead-end. **ADD** recipes/turn-ins + **sink-side reachability guard** (P2.6) |
| Drops (blueprints) → **Homestead** | ❌ **P0** | `upgradeRoom` never consumes blueprints. **WIRE IT** (P0.1) |
| Dungeon/Boss → signature mat → Recipe | ⚠️ | **Only the Hunt does this.** Extend the pattern to all dungeons (P2.2) |
| Boss schema → all boss surfaces | ❌ | 3 private shapes. **ADD** `src/data/bosses.js` referenced by all (P1.8) |
| Farming → Castle rooms → Buff scalers | ✅ | goldenroot → Glasshouse/Cask; Cellar/Tavern scale buffs. Extend to more crops |
| Weakness ↔ Weapon family | ⚠️ | 1:1 structure exists but off-type XP taxes it. **ADD** catch-up (P3.4) |

**The through-line:** the codebase is a set of well-built rooms with several doors nailed shut. The highest-leverage work is not building new systems — it is **cutting the missing links** (bench-gate surfacing, blueprint consumption, damage reader, boss schema, sink guard). Every one is a data/seam change, not an engine rewrite.

---

## 8. Item Database Architecture

**What the data layer already supports (keep):** `type`, `toolSkill`, `toolSpeed`, `foodClass`, `buff:{type,magnitude}`, `heals`, wield gates, `atkB/strB/defB` + style twins, `critB/spdB/xpB`, tier/rarity bands (auto-backfilled items.js:529-535), and hand-authored-wins merge. `gear-tiers.js` proves the generator model works.

**Fields / flags to ADD (each maps to a philosophy rule):**

| Field / flag | On | Why | Rule |
|---|---|---|---|
| `toolXpB` | tools | Second felt tool axis; folded into addXp | 8 |
| `toolDoubleChance` | tools | Visible extra drop; mirror of craftSave | 8 |
| `toolSkill: cooking\|smithing\|crafting` | **new artisan tools** | Artisan tools don't exist yet | 8 |
| `critB` / `spdB` / passive on generated ladder | gear-tiers generator | Horizontal fingerprint per family | 5 |
| `speedMod` per weapon family | gear-tiers | Pays for Warhammer's strB; restores melee choice | 5 |
| `passive` / `setBonus` | signature/prestige gear | Identity reward, not bigger defB | 6 |
| `boss_exclusive` | boss loot | Marks signature drops; drives collection-log & preview framing | 6 |
| `signatureMat` / `signatureRecipe` link | dungeon mats | Extends Hunt loop to dungeons | 3 |
| `dropBand` (common/uncommon/rare/epic) | all drops | Replaces the 3 hardcoded `0.05` magic numbers | 7 |
| `upgrade_requirements` (blueprint + mats) | rooms/gear upgrades | Makes blueprints a real consumed input (fixes P0) | 3 |
| `damage` reader in maxHit | engine seam | Makes flagship foods honest | 2 |

**Guards to add:** a **sink-side reachability guard** (every non-exempt drop must feed a recipe/turn-in/defined vendor purpose) to complement the existing source-side guard; and **divergence smoke tests** asserting live data equals the ESM source (kills the double-copy trap permanently).

**Deletions (Rule 4):** the inline `MONSTERS` table (legacy.js:114-154), the inline ITEMS food twin (legacy.js:219-236), the dead Phase A.1 recipe block (legacy.js:9421-9542), and the two dead `renderArtisanActivities` copies (legacy.js:8960, 9780). Do not preserve them because they exist.

---

## 9. Economy Impact

**Faucets (gold/mats in):** gathering, combat drops, dungeon/boss loot, vendor sales of trash mats. The material-only yield law (legacy.js:9576) correctly prevents gear-forges from minting gold — keep it.

**Sinks (out):** crafting costs, room upgrades, dungeon entry (keys/gold/tokens), the new **dungeon quartermaster (scrip)**, and expanded jewelry/gem consumption for gold. Today the sink layer is thin and leaky.

**Scarcity levers:** rarity bands (Rule 7) make scarcity tunable per tier; signature mats are naturally scarce (one boss, one recipe). Coal is the cross-cutting throughput scarcity that gates mid-game Smithing (P3.1) — a pacing lever, not a gold lever.

**Exploit fixes / leaks to close:**
- **Vendor-trash leak:** 13+ combat mats with no sink become pure "sell for gold" faucets. Give them recipes/turn-ins or fold redundant mats together (P2.6). This is both an identity fix and a soft gold-faucet fix.
- **Dead reward = dead sink:** the P0 blueprint break means the biggest intended gold/mat sink (room upgrades) is bypassed. Fixing P0 restores a major sink.
- **Redundant gear drops (P2.12):** below-tier craftable gear at <3% adds nothing; convert to upgrade tokens/patterns or retire — reduces table noise and false value.
- **Buff budget underused:** buffs sit at 2–5% against a 15% temporary budget (P3.5) — raise magnitudes toward the ceiling so buff foods are worth the mats, giving cooking a real economic role.
- **Honesty note:** the b214 key-consumption exploit is already fixed and no dungeon path mints hearth_token illegitimately — the economy guards are respected; the leaks are structural sink-gaps, not mint bugs.

---

## 10. PRIORITIZED WAVE PLAN

Ordered so cohesion and the three named complaints ("tools do nothing," "can only craft a fishing rod," "Forge gate invisible") are addressed in the **first two waves**. Every wave is testable; each maps to the philosophy phases (P1–P4 = Visibility/Honesty, Repair, Depth, Ecosystem).

### NOW

**Wave 1 — Truth in UI (address the named complaints).**
*Goal: nothing lies to the player; every gate and tool is visible before the click.*
- Make `tileForArtisan` the single gate-surfacing point: compute `hasWorkbench()` + `gateOk()` alongside level, render persistent locked states ("🔨 Build the Forge" / "📜 Needs Chief's Blade Recipe") on disabled tiles. *(P1.1, P1.2)*
- Add a bench banner to the artisan header routing to House → build the Farmstead → Forge. *(P3, cohesion)*
- Surface the active tool on gather/artisan tiles ("Willow Rod +5%"). *(P1.3)*
- Fix the combat preview: read `d.ch` with real percentages; compute the forecast via `getPlayerCombatRolls`/`getMonsterCombatRolls`. *(P1.5, P1.6)*
- Smoke tests: a Forge-less save shows smithing tiles as locked; preview odds equal the drop table.

**Wave 2 — Repair the broken loops (P0 + honesty).**
*Goal: no dead rewards, no inert flagship items, one source of truth.*
- **Wire `upgradeRoom` to consume blueprints (P0).**
- Add a `damage` reader in maxHit so Cooked Shark/Swordfish/Bear Claw Pie are honest. *(P1.7)*
- Add `cook_turnip`; give gold_bar a real jewelry/gem sink. *(P2.5, P2.4)*
- Delete the four stale duplicate blocks; add divergence smoke tests. *(P2.10)*
- Fix the stale power-budget comment. *(P3.6)*

### NEXT

**Wave 3 — Tools become real (finish the "tools do nothing" fix).**
*Goal: a tool changes the loop in a way the player can name, for gathering AND artisan.*
- Add `toolXpB` and `toolDoubleChance`, routed through the single `activityIntervalMs`/produce path (no second copy). *(P1.3)*
- Bump the entry tier and/or make a basic tool a soft requirement so its absence is felt. *(P1.3)*
- Introduce artisan tools (smithing hammer, crafting chisel/needle, cooking knife) by extending the `d.artisan` branch at legacy.js:2772; plug into the existing craftSave/yield gating. *(P1.4)*

**Wave 4 — Standardize the reward layer.**
*Goal: bands not magic numbers; one boss schema; every mat has a sink.*
- Define rarity/drop bands as a shared constant; replace the three hardcoded `0.05` checks; author drop tables by band. *(P2.7)*
- Author `src/data/bosses.js` and refactor DUNGEONS + Boss of the Day + Hunt to reference boss records by id; reconcile the Marrow King/Bone Lord split. *(P1.8, P1.9)*
- Add the sink-side reachability guard; give every combat mat a recipe/turn-in; retire or convert redundant monster gear drops. *(P2.6, P2.12)*

### LATER

**Wave 5 — Gear identity & combat feel (make progression horizontal).**
*Goal: build diversity from crafted gear; every stat felt; prestige gear plays differently.*
- Give each weapon family a `speedMod` identity (Warhammer slow/heavy) — restores melee choice. *(P1.11)*
- Bake small crit/spd/passives onto the generated ladder per family. *(P2.8)*
- Add an armor damage-reduction term to monster maxHit. *(P2.9)*
- Rework the accuracy clamp / raise boss & dungeon DEF so weapon atkB regains meaning; steepen the weapon share of max hit. *(P1.10)*
- Give Hunt-forged and dungeon signature armor set bonuses/passives; add weakness off-type XP catch-up. *(P3.3, P3.4)*

**Wave 6 — Dungeon & boss ecosystem (build the endgame).**
*Goal: dungeons are a real grind loop with identity; daily axis met; idle buff loop closed.*
- Add dungeon scrip + quartermaster + per-dungeon signature mats → recipes (copy the Hunt loop). *(P2.2)*
- Give each dungeon boss one signature mechanic; build real encounters for voidbringer & ancient_wyrm; replace farm_deed filler. *(P2.1, P2.13, P3.7)*
- Rotate a real Boss/Dungeon of the Day roster toward the 7+ target. *(P2.11)*
- Build the deferred drinks/auto-buff consumer; raise buff magnitudes toward the 15% budget. *(P2.3, P3.5)*
- Pacing polish: break the fishing 20–40 dead zone; finish the coal 30–52 relief. *(P3.1, P3.2)*

---

*Cohesion note: Waves 1–2 alone retire the P0 and all three named complaints while touching only renderers, one engine seam, and data — no architectural rewrite. The generator and reachability-guard foundations mean everything downstream is data-first. Do not preserve the stale twins, the phantom partySize fields, the inert damage buff, or the below-tier gear drops because they exist; delete or wire them.*