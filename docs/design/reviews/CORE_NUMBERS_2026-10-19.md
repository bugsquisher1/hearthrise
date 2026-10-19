# Core numbers ruling, 2026-10-19 (Game Designer)

Answers the open balance questions Q1, Q2, Q3, Q4, Q5, Q6 and Q9 of `docs/design/CORE_MODEL.md` (branch `lane/c-core-rebuild`). The Coordinator answered Q7, Q8, Q10 and Q11. Tyler approves through the tracker. Numbers marked **est.** come from arithmetic on the 10-19 play (`node tests/hunt-core/forest-cave.mjs --play` on origin/main 211b60d39) and have not been played under the new model. The guards named below are the arbiters once the rebuild lands.

## Q1 Level curve: slower, sized for players who hunt every day (re-ruled after Tyler's review, 10-19)
- **Tyler, 10-19:** 920 h is too fast, because people can hunt all day, every day. That replaces the 10-14 "about 920 hunting hours".
- **Target: L100 ≈ 540 h, L200 ≈ 4,000 in-range hunting hours.** Reason: stamina caps sustainable hunting at about 12 h a day (premium cap, 1:1 drain and refill). A dedicated premium player hunting about 10 h a day reaches L100 in about 2 months and **L200 in about 13 months**. A 3 h/day player takes about 3.7 years. The server's first L200 lands about a year after EA, which keeps "L200 is a big deal".
- **Curve:** `XP(L) = (L-1)^4 + 20(L-1)^3 + 50(L-1)`, endless and all integers. It is ruling U's cubic plus a quartic term. The quartic barely touches the early levels (L10 needs 21,591 XP, against 15,030 before) and dominates past L50, which is where the slowdown belongs.
- **In-range XP/h per hero (the guard's line):** `r(L) = 2,900 x L`. Reason: XP/h still grows with Level, so out-levelled grounds stay "profit, low XP". The line sums to **4,018 h** to L200.
- **First hour:** L5 at 12 min, L8 at 36 min, L10 at 66 min. That is inside "L5–10 in the first 1–2 h".
- **Guard** (`tests/level-curve.mjs`): the sum over L = 1..199 of (XP(L+1) - XP(L)) / r(L) must fall in 3,800–4,200 h, and L10 must take 0.75–2 h. Per ground, measured in-range kill XP per hero-hour must sit within ±20% of `r(band midpoint)`.
- **What this asks of content (est.):** multiply monster `xp` by about ×4.5 (Mill Cellar), ×4.7 (Thicket), ×6.4 (Sewer) and ×6.6 (Warrens). The per-ground guard settles the exact factors.
- **Flag on Q7 (the Coordinator's):** on this curve, 2% of TOTAL XP costs 1.1 h of hunting at L50, 8 h at L100 and **60 h at L200** (a full level). I recommend Q7 be re-ruled to 2% of the current level's span: 0.3 h at L200, about 6% of a level.

| Level | total XP | in-range XP/h | hours from L1 | at 10 h/day |
|---|---|---|---|---|
| 5 | 1,736 | 14,500 | 0.2 | first session |
| 10 | 21,591 | 29,000 | 1.1 | first session |
| 25 | 609,456 | 72,500 | 12 | day 2 |
| 50 | 8,120,231 | 145,000 | 78 | week 1 |
| 100 | 115,470,531 | 290,000 | 543 | about 2 months |
| 200 | 1,725,861,131 | 580,000 | 4,018 | about 13 months |

## Q2 Uncapped skill curve (re-fitted to the slower Level)
- **Rejected:** `60 x 1.08^(s-1)`. Damage per hour grows with Level, so a pure exponential races ahead. It gives skill 165 at L200, and a Level-10 hero would one-shot the Thicket.
- **Ruled:** XP to go from skill s to s+1 = **`15 x s^2 x 1.04^(s-1)`** (15, 62, 146 for the first three steps). Reason: the s^2 term keeps skill about equal to Level through L25, which today's monster rows were balanced on. The 1.04 term makes skills lag behind Level: 47 at L50, 80 at L100, **122 at L200**. Skill 120 is the L200 badge.
- **Normal hunting** (the guard's assumption): a hero deals `500 x L` damage per hour in range (measured 350–760 x L on the four grounds), all of it into one skill at 1.5 XP per HP (Q4).

| skill | 10 | 30 | 60 | 90 | 120 |
|---|---|---|---|---|---|
| hours (Level then) | 1 h (L9) | 19 h (L29) | 175 h (L66) | 885 h (L118) | 3,550 h (L191) |

## Q3 HP and mana (classless, the same for every hero)
- **`maxHp = (150 + 10 x (L-1)) x (1 + 0.28 x heavyShare)`; `maxMana = (100 + 10 x (L-1)) x (1 + 0.35 x lightShare)`.**
- **Reason, mana (Tyler, 10-19: +10 a Level, the same as HP):** one per-Level number for both pools. Armour weight is what makes a hero a mage. A full-cloth caster's regen (25%/min = 15 x max per hour) covers about 60% of the reference spend at L20. Drinks and Prayer cover the rest, and Q4's parity guard sets the ability multipliers.
- **Reason, HP:** 150 at L1 is the scale the abilities already use (Greater Mend 40–60, Barrier 40, today's role pools of 120–200). To match it, **monster damage and food heals move together by ×12**: `COMBAT_BALANCE.monsterAttackDamageScale` goes from 0.45 to 5.4, and every food/basic `heals` value is multiplied by 12 (Salted Shrimp 6 → 72, Cooked Shrimp 8 → 96). **Prices per use do not change**, so uses per hour and the economy stay where they are. Against the measured play, heroes are 2x safer at L10, 1.1x at L40 and even at L50, which softens only the first hour.
- **L5 sanity check** (est., expected values, bronze plate share 0.4, HP 211):
  - Mill Cellar: a Giant Rat lands 1.05 HP/s and a Hive Wasp (the worst) 2.3 HP/s. In-fight regen (Q6) gives back 0.63 HP/s, and a kill takes 10–11 s, so a kill costs 5–17 HP. The ground holds one foe at a time and resting regen (6%/s) refills between pulls. **0 deaths, food about 0.**
  - Solo healer (cloth, 190 HP, **189 mana** at +10/Level): about 15 s per kill and at most 26 HP a kill. That is 7 Greater Mends (25 mana each) banked, plus 47 mana/min of regen, which is about 2 more casts a minute. A kill needs at most one Mend, and resting refills HP between pulls. **0 deaths.**
  - Millrace Sewer is a party ground. At the new floor (L8) a Drain Rat's blow is 27 of 220 HP (12%), against 2 of 10 (20%) in the play that fell 6 times at L5.

| L | HP | HP, full heavy | mana | mana, full light |
|---|---|---|---|---|
| 1 | 150 | 192 | 100 | 135 |
| 5 | 190 | 243 | 140 | 189 |
| 10 | 240 | 307 | 190 | 256 |
| 25 | 390 | 499 | 340 | 459 |
| 50 | 640 | 819 | 590 | 796 |
| 100 | 1,140 | 1,459 | 1,090 | 1,471 |
| 200 | 2,140 | 2,739 | 2,090 | 2,821 |

## Q4 Melee and Ranged XP
- **1.5 XP per HP dealt** (not 4), for Melee and for Ranged. Magic stays at mana spent x 1.5 x ability multiplier (ruled). Reason: the spells give about 1 damage per mana (Fireball 25 mana for about 28 across 3 targets), so 1.5 per HP puts Magic XP/h equal to Melee XP/h. At 4 per HP, Magic trained at about a third of Melee's pace (the sim measured this). The 1.5 is built into the Q2 fit.
- **Parity guard (U7):** at the reference loadout and Level, Magic XP/h must be within ±15% of Melee XP/h. With mana at +10 a Level, a caster spends about 0.6 of its damage in mana. Parity therefore comes through the abilities' `magicXpMult`: about 1,600 permille on staff basics and spells (data, not the ruled 1.5). The guard fixes the exact value.

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
| Mill Cellar | 1–8 | 0–0.6 h | the tutorial; from L8 it is profit with low XP |
| Meadowbrook Thicket | 5–15 | 0.2–3.2 h | floor 5 kept (a fresh kit hero fell 3 times; measured) |
| Millrace Sewer | 8–25 | 0.6–12 h | first party ground, Rat King level 25; old 4–40 was too wide |
| Old Mill Road (H-002, unbuilt) | 12–24 | 1.8–11 h | workbook 6–25 |
| Mosslight Glade (H-003, unbuilt) | 18–32 | 5–23 h | workbook 15–33 |
| Pebblebrook Bank (H-004, unbuilt) | 25–40 | 12–42 h | workbook 23–42 |
| Coppercap Warrens | 32–50 | 23–78 h | kept; skill lags Level by about 5% here, and the softer HP scale offsets it |
| H-006 (rename "Forgotten Rootcellar", §10) | 40–55 | 42–101 h | workbook 40–50 |

The bands do not move: skill still tracks Level through these levels, so a ground's difficulty sits at the same Level. Only the hours stretch. Greenhaven now spans about the first 100 hunting hours (L1–55), about 10 days for a dedicated player.

## New-hero walk-through (ids checked in src/data/hunts.js, hunt-grounds.js, monsters.js)
| step | the hero has / can reach | doable? |
|---|---|---|
| 1 Enter Mill Cellar at L1 | start kit, `mill_cellar` band 1–8 | yes: 150 HP, worst foe `hive_wasp` costs about 30 HP a kill, resting refills |
| 2 L5 at 0.2 h | the Cellar, `meadowbrook_thicket` floor 5 opens | yes: in band |
| 3 L8 at 0.6 h | Cellar XP falls off; `millrace_sewer` floor 8 (party) | yes: solo Thicket or a Sewer party |
| 4 L15–25 (3–12 h) | Thicket tops out; Sewer to `rat_king` (25) | yes |
| 5 L32 at 23 h | `coppercap_warrens` floor 32 | gap: H-002–H-004 are unbuilt, so L25–32 has only an over-levelled Sewer |

## Handoffs and limits
- **Systems:** `level.js` and `vitals.js` constants as above; `monsterAttackDamageScale` 5.4; `heals` x12; `inFightRegenPermillePerS` 3; `PRAYER_REGEN {max: 1.0, k: 50}`; `HIT_XP_PER_DAMAGE` 1.5; Defense per blow; monster `level` rows; per-ground `xp` factors through the guard.
- **Content:** bone burying XP is still on the OSRS scale (4.5 a bone). P30 would take about 300 h of bones. The target is Prayer ≈ 0.6 x Level for a player who buries everything, and that needs its own retune lane. Ability heals and shields are flat: rule them as % of max HP + Magic in the abilities pass. Drinks above tier 3 restore too little for pools above L60. The re-ruled curve also stretches every rare-drop clock in hours-to-level terms, so loot hours bands are unchanged but are now a smaller share of a level. Neither blocks EA.
- **Not played:** every number here comes from arithmetic. The per-ground guard and one `--play` per ground on the rebuilt engine are the evidence before release.

## Addendum, 2026-10-19 (core-rebuild guards; branch design/core-data-tunes off lane/c-core-rebuild)
- **Monster damage per tier.** HP grows 10 a Level while monster atk grows about 1 a Level, so the flat ×5.4 put a tier-6 blow at about 50% of an in-band hero's HP, and the Level-90 boss-rate hero died. New `COMBAT_BALANCE.monsterDamageScaleByTier = {4: 4.0, 5: 3.0, 6: 2.2}`; tiers 1–3 (the EA grounds) keep 5.4. This only changes damage; accuracy still reads `atk`. With it, an in-band blow is about 20–30% of max HP. Elk King, Grim Reaper and Dragon now take 0 deaths in the hour; kill rates are re-pinned at 110/138/98, and the hours stay as ruled.
- **Drop pacing on the flat 2.0 s swing.** Five tier-1/2 lucky finds were landing at 3.2–3.8 h, against Tyler's ruling of about 10–20 h for a rare. They are retuned to **about 10 h**. Seven field-salvage rows were landing at 0.41–0.50 h and are retuned to 0.61 h, above the guard's 0.5 h floor.
- **Mage = wand + spellbook, Healer = staff (Tyler).** Wands T1–T6 and off-hand spellbooks T1–T6 carry `discipline: destruction`. Staffs carry `discipline: restoration` and `twoHanded`. The T1 pair is sold in the shop; T2–T6 drop from tier casters inside the gear-value caps. Wiring the role to `discipline` is the core lane's job (`hunt-roles.js roleForWeapon` and the equip rule).
