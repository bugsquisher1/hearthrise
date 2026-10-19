# Core numbers ruling, 2026-10-19 (Game Designer)

Answers the open balance questions Q1, Q2, Q3, Q4, Q5, Q6 and Q9 of `docs/design/CORE_MODEL.md` (branch `lane/c-core-rebuild`). The Coordinator answered Q7, Q8, Q10 and Q11. Tyler approves through the tracker. Numbers marked **est.** come from arithmetic on the 10-19 play (`node tests/hunt-core/forest-cave.mjs --play` on origin/main 211b60d39) and have not been played under the new model. The guards named below are the arbiters once the rebuild lands.

## Q1 Level curve: keep the cubic, guard against a fixed XP/h line
- **Curve:** `XP(L) = 20(L-1)^3 + 50(L-1)`, endless (ruling U). It does not miss 920 h. It lands there once the XP/h assumption is fixed.
- **In-range XP/h per hero (the guard's line):** `r(L) = 1,300 x L`. Reason: Tibia-shaped (XP/h grows with level), and it sums to **910 h** to L200 (-1.1%, inside the guard's ±5%). The exact fit is 1,285. 1,300 is the round number.
- **Guard** (`tests/level-curve.mjs`): sum over L = 1..199 of (XP(L+1) - XP(L)) / r(L) must fall in 874–966 h. Per ground, the measured in-range kill XP per hero-hour must sit within ±20% of `r(band midpoint)`.
- **What this asks of content:** today's kill XP is 2–3x under the line (est.). Multiply monster `xp` by about ×2 (Mill Cellar, Thicket), about ×2.8 (Sewer) and about ×3 (Warrens), then let the per-ground guard settle the exact factors.
- **Death check** (Q7 as answered: 2% of total, floored): a death costs 0.02 h of hunting at L10, 0.7 h at L50, 3 h at L100 and 12 h at L200, before Blessings.

| Level | total XP | in-range XP/h | hours from L1 |
|---|---|---|---|
| 5 | 1,480 | 6,500 | 0.4 |
| 10 | 15,030 | 13,000 | 1.8 |
| 25 | 277,680 | 32,500 | 12.9 |
| 50 | 2,355,430 | 65,000 | 54.5 |
| 100 | 19,410,930 | 130,000 | 224 |
| 200 | 157,621,930 | 260,000 | 910 |

## Q2 Uncapped skill curve: replace 60 x 1.08^(s-1)
- **Rejected:** `60 x 1.08^(s-1)`. Damage per hour grows with Level, so a pure exponential is far too fast. It reaches skill 60 at 3.8 h, 120 at 86 h, and skill 165 at L200, so a Level-10 hero would one-shot the Thicket.
- **Ruled:** XP to go from skill s to s+1 = **`25 x s^2 x 1.02^(s-1)`** (25, 102, 234 for the first three steps). Reason: the s^2 term keeps skill about equal to Level through L25, which is what today's monster rows were balanced on (the play gave heroes skill = Level). The 1.02 term then makes skills lag: 44 at L50, 75 at L100, **120 at L200**. Skill 120 marks L200.
- **Normal hunting** (the guard's assumption): a hero deals `500 x L` damage per hour in range (measured 350–760 x L across the four grounds), all of it into one skill at 1.5 XP per HP (Q4).

| skill | 30 | 60 | 90 | 120 |
|---|---|---|---|---|
| hours (Level then) | 21 h (L31) | 117 h (L72) | 366 h (L127) | 904 h (L199) |

## Q3 HP and mana (classless, the same for every hero)
- **`maxHp = (150 + 10 x (L-1)) x (1 + 0.28 x heavyShare)`; `maxMana = (100 + 20 x (L-1)) x (1 + 0.35 x lightShare)`.**
- **Reason, mana:** a full-cloth caster's regen (25%/min = 15 x max per hour) then covers about 85–100% of the spend that Magic parity needs (Q4). Drinks top it up and Prayer replaces drinks. Mana is 20 a Level against HP's 10 because every hero's bar spends mana, and armour weight is what makes a hero a mage.
- **Reason, HP:** 150 at L1 is the scale the abilities already use (Greater Mend 40–60, Barrier 40, today's role pools of 120–200). To match it, **monster damage and food heals move together by ×12**: `COMBAT_BALANCE.monsterAttackDamageScale` goes from 0.45 to 5.4, and every food/basic `heals` value is multiplied by 12 (Salted Shrimp 6 → 72, Cooked Shrimp 8 → 96). **Prices per use do not change**, so uses per hour and the economy stay where they are. Against the measured play, heroes are 2x safer at L10, 1.1x at L40 and even at L50, which softens only the first hour.
- **L5 sanity check** (est., expected values, bronze plate share 0.4, HP 211):
  - Mill Cellar: a Giant Rat lands 1.05 HP/s and a Hive Wasp (the worst) 2.3 HP/s. In-fight regen (Q6) gives back 0.63 HP/s, and a kill takes 10–11 s, so a kill costs 5–17 HP. The ground holds one foe at a time and resting regen (6%/s) refills between pulls. **0 deaths, food about 0.**
  - Solo healer (cloth, 190 HP, 243 mana): about 15 s per kill and at most 26 HP a kill. Greater Mend (25 mana) and 61 mana/min of regen cover it. **0 deaths.**
  - Millrace Sewer is a party ground. At the new floor (L8) a Drain Rat's blow is 27 of 220 HP (12%), against 2 of 10 (20%) in the play that fell 6 times at L5.

| L | HP | HP, full heavy | mana | mana, full light |
|---|---|---|---|---|
| 1 | 150 | 192 | 100 | 135 |
| 5 | 190 | 243 | 180 | 243 |
| 10 | 240 | 307 | 280 | 378 |
| 25 | 390 | 499 | 580 | 783 |
| 50 | 640 | 819 | 1,080 | 1,458 |
| 100 | 1,140 | 1,459 | 2,080 | 2,808 |
| 200 | 2,140 | 2,739 | 4,080 | 5,508 |

## Q4 Melee and Ranged XP
- **1.5 XP per HP dealt** (not 4), for Melee and for Ranged. Magic stays at mana spent x 1.5 x ability multiplier (ruled). Reason: the spells give about 1 damage per mana (Fireball 25 mana for about 28 across 3 targets), so 1.5 per HP puts Magic XP/h equal to Melee XP/h. At 4 per HP, Magic trained at about a third of Melee's pace (the sim measured this). The 1.5 is built into the Q2 fit.
- **Parity guard (U7):** at the reference loadout and Level, Magic XP/h must be within ±15% of Melee XP/h. Staff basics and ability mana costs are tuned to about 1 mana per HP of damage (heals about 0.5 mana per HP healed) to stay inside it.

## Q5 Defense, plus a `level` on every monster
- **Defense XP = 0.2 x the attacker's `level` for every blow aimed at a hero wearing at least one armour piece** (hit, miss, dodge or block). **A shield block pays x2.** Reason: a front-liner facing 2 attackers in range earns about 720 x L per hour, level with Melee's 750 x L. Misses count so that better Defense never trains Defense slower. A Giant Rat (level 2) pays 0.4 a blow, so trap-training on low monsters is worthless. Fractions carry through the existing `xp_frac`.
- **Monster `level`** (new field, placed where the monster is in range on its ground):

| ground | monsters (level) |
|---|---|
| Mill Cellar | rat 2, slime 2, hive_wasp 4 |
| Meadowbrook Thicket | gray_whelp 5, gray_wolf 8, briarcoat_wolf 10, dire_gray 13, grayjaw 15 |
| Millrace Sewer | drain_rat 10, sump_slime 10, kobold_tosher 13, culvert_bat 15, cistern_spider 20, rat_king 25 |
| Coppercap Warrens | goblin_scavenger 34, goblin_skulker 38, goblin_digger 40, hobgoblin_foreman 46, chief_coppercap 52 |
| unplaced rows (until a ground holds them) | by tier: T1 5, T2 15, T3 35, T4 60, T5 90, T6 130 |

## Q6 Prayer
- **`regenMult = 1 + 1.0 x P / (P + 50)`** (MAX 1.0, k 50): P10 +17%, P25 +33%, P50 +50%, P100 +67%, P200 +80%. It never reaches double. Reason: k 50 rather than 60 so that early burying is felt (+17% at P10).
- **Regen ticks during fights, as in Tibia.** Mana regen (25%/min) already does. Add an **in-fight HP regen of 0.3% of max per second** (`inFightRegenPermillePerS: 3`) beside the resting 6%/s. Prayer multiplies all three rates.
- **Food is never obsolete:** at the asymptote, in-fight regen is 0.6%/s against 5–8%/s of max HP coming in on an in-range front line, so it covers 12% at most. Only an out-levelled hero stops eating, which is the ruled "profit, low XP" case.

## Q9 Hunt bands as Level (band[0] is the warning floor; hard block at floor - 15)

| ground | band | hours in band | note |
|---|---|---|---|
| Mill Cellar | 1–8 | 0–1.1 h | the tutorial; from L8 it is profit with low XP |
| Meadowbrook Thicket | 5–15 | 0.4–4.4 h | floor 5 kept (a fresh kit hero fell 3 times; measured) |
| Millrace Sewer | 8–25 | 1.1–13 h | first party ground, Rat King level 25; old 4–40 was too wide |
| Old Mill Road (H-002, unbuilt) | 12–24 | 2.7–12 h | workbook 6–25 |
| Mosslight Glade (H-003, unbuilt) | 18–32 | 6.5–22 h | workbook 15–33 |
| Pebblebrook Bank (H-004, unbuilt) | 25–40 | 13–34 h | workbook 23–42 |
| Coppercap Warrens | 32–50 | 22–55 h | kept; skill lags Level by 10% here, and the softer HP scale offsets it |
| H-006 (rename "Forgotten Rootcellar", §10) | 40–55 | 34–66 h | workbook 40–50 |

Greenhaven therefore spans about the first 66 hunting hours (L1–55).

## New-hero walk-through (ids checked in src/data/hunts.js, hunt-grounds.js, monsters.js)
| step | the hero has / can reach | doable? |
|---|---|---|
| 1 Enter Mill Cellar at L1 | start kit, `mill_cellar` band 1–8 | yes: 150 HP, worst foe `hive_wasp` costs about 30 HP a kill, resting refills |
| 2 L5 at 0.4 h | the Cellar, `meadowbrook_thicket` floor 5 opens | yes: in band |
| 3 L8 at 1.1 h | Cellar XP falls off; `millrace_sewer` floor 8 (party) | yes: solo Thicket or a Sewer party |
| 4 L15–25 (4–13 h) | Thicket tops out; Sewer to `rat_king` (25) | yes |
| 5 L32 at 22 h | `coppercap_warrens` floor 32 | gap: H-002–H-004 are unbuilt, so L25–32 has only an over-levelled Sewer |

## Handoffs and limits
- **Systems:** `level.js` and `vitals.js` constants as above; `monsterAttackDamageScale` 5.4; `heals` x12; `inFightRegenPermillePerS` 3; `PRAYER_REGEN {max: 1.0, k: 50}`; `HIT_XP_PER_DAMAGE` 1.5; Defense per blow; monster `level` rows; per-ground `xp` factors through the guard.
- **Content:** bone burying XP is still on the OSRS scale (4.5 a bone). P30 would take about 300 h of bones. The target is Prayer ≈ 0.6 x Level for a player who buries everything, and that needs its own retune lane. Ability heals and shields are flat: rule them as % of max HP + Magic in the abilities pass. Drinks above tier 3 restore too little for pools above L60. Neither blocks EA.
- **Not played:** every number here comes from arithmetic. The per-ground guard and one `--play` per ground on the rebuilt engine are the evidence before release.
