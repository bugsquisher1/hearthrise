# Balance baseline 05: the Interaction Analysis

Lane BL-4 (systems engineer, 2026-11-21 and 22). Deliverable 5 of Tyler's directive of 2026-11-21, Phase 5. It stands on `04-sensitivity.md`: the same 68 cells, the same four seeds, the same engine, the same reading of an effect. Read section 1 of that page first.

**The baseline.** `set/v0.2.144` at `861ae52e3` (branch `baseline/overhaul-start`). No gameplay number was changed. Every point is a patch on a scratch copy.

**What this is for.** Evidence of how today's formulas couple, for the lane that picks the new math. Nothing here is graded against an old ruling.

**Labels.** MEASURED (run, seeds, hours), COMPUTED, JUDGMENT, UNKNOWN.

## 0. One screen

**What was run.** Nine structured experiments, full grids over two or three levers at large steps: 129 points, each 68 scenarios and 4 seeds on the real engine, the same dice as the base. Runs 44969087150, 44972398698 and 44976040886.

**The answer in one line.** Every reward lever is clean and can be tuned alone. Every lever on the fight is tangled with at least four others, and one-at-a-time readings of those are wrong by 13% to 54% at the steps a designer would take.

| Coupled set | What the grid found | How far one-at-a-time is off |
|---|---|---|
| Monster health with respawn (section 2) | Three caps in a row hold kills: the fight, the dead time and the respawn. Only the slowest counts, and it differs by seat | 36% on kills |
| Spell cost with mana regeneration (section 3) | A rotation is never unsustainable here. A hero drinks and casts on. The two levers set a drink bill, not a cast rate | 54% on drinks |
| The attack clock with the stair clock (section 4) | The engine refuses a slower attack unless the Tower's stair clock moves too | cannot be played apart |
| Hero damage with monster health (section 5) | One lever on the fight. Moved together they change nothing but XP, which doubles or halves | 24% on kills and XP |
| Party XP with tier XP (section 6) | No interaction at all. A four's tier choice has one answer, the hardest, with a factor of 1.3 to 2.8 to spare | none |
| The armor curve with the tier dial and coin (section 7) | On the lone melee hero the curve and the tier dial are one lever. On the four neither can cause a death | deaths 15,400 against 4,300 predicted |
| The Level curve with the death price and monster damage (section 8) | The seat the pace is timed on never dies, so the death price does not reach it | none on the seat |
| Hero damage with healing and its cost (section 9) | There is no life leech in the engine. Damage still cuts healing bought, by shortening fights | 24% on net gold |
| Monster damage with hero health (section 10) | Hero health is a monster damage knob. The four's first deaths appear only when both double | deaths 78 against 0 predicted |

**The feedback loops (section 11).**

- Progression, gear, tier, death, XP is a positive loop with a gate. The gate is a wall of deaths. It is open on every tier for the four and the lone Mage, and shut one tier up for the lone melee hero. A tier step is worth x1.6 to x3.5 XP and a gear step 4% to 10%.
- Gold, supplies, survival, gold is two loops. For a caster it is a tax that grows with success: best gear costs the Mage gold at every Level. For a melee hero it is nothing, then a cliff: the lone hammer on Dangerous eats three and a half times what it earns.
- Monster health pays XP, so every "harder monsters" change has also been a pace change.
- Four pairs of numbers are defined by each other, and that is where one-lever fixes have cascaded.

**What is not known.** Whether best gear carries a lone melee hero over the wall (not played). What an empty purse does (the harness never runs out of gold). Anything a player changes in response (every cell plays the default bar and the advised ground).

---

## 1. How an interaction is read

An experiment is a full grid over two or three levers, each at two or three levels, large ones included. Every point plays the 68 cells on the base's dice.

For a point that moves several levers, the one-at-a-time reading is what you would predict from the points that move each lever alone: for a rate, the product of the single ratios. The GAP is the measured joint ratio over that product, less one. A gap of zero means the levers can be tuned one at a time. A resolved gap means they cannot: the single readings mislead by that much. The gap is computed seed by seed, so it carries its own error, and it is called resolved by the same rule as an effect (3.18 standard errors at four seeds, and more than 1%).

Each table shows the groups and outcomes its text reads. `node tools/balance-program/sensitivity/analyze.mjs --exp <id>` prints the largest gaps for every outcome and group, and every table between `<!-- GEN -->` marks is written by `--write-docs` from the committed data. In a table, `~` marks a reading not resolved from noise, and "single" marks a point that moves one lever.

---

## 2. Monster health with respawn time: the caps on kills

Tyler's example: "Monster HP and spawn rate may both limit kill throughput." The grid is monster health at x0.5, x0.75, x1, x1.5, x2 against respawn time at x0.5, x1, x2. MEASURED, run 44972398698, 14 points, 4 seeds.

<!-- GEN: exp id=hp-spawn groups=party:1,party:4 outcomes=killsPerH,levelXpPerH -->
hp-spawn, killsPerH, lone heroes (MID, Normal) (ratio to the base)

| monsterHp | respawn | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x1.335 | x1.283 | +4.0% +/- 0.0% |
| x0.5 | x1 | x1.281 | single |  |
| x0.5 | x2 | x0.699 | x0.857 | -18.4% +/- 0.0% |
| x0.75 | x0.5 | x1.149 | x1.141 | within noise |
| x0.75 | x1 | x1.138 | single |  |
| x0.75 | x2 | x0.683 | x0.761 | -10.3% +/- 0.0% |
| x1 | x0.5 | x1.002~ | single |  |
| x1 | x2 | x0.669 | single |  |
| x1.5 | x0.5 | x0.801 | x0.802 | within noise |
| x1.5 | x1 | x0.801 | single |  |
| x1.5 | x2 | x0.641 | x0.536 | +19.7% +/- 0.1% |
| x2 | x0.5 | x0.667 | x0.668 | within noise |
| x2 | x1 | x0.667 | single |  |
| x2 | x2 | x0.606 | x0.446 | +35.9% +/- 0.1% |

hp-spawn, levelXpPerH, lone heroes (MID, Normal) (ratio to the base)

| monsterHp | respawn | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x0.661 | x0.636 | +4.0% +/- 0.0% |
| x0.5 | x1 | x0.634 | single |  |
| x0.5 | x2 | x0.346 | x0.424 | -18.4% +/- 0.0% |
| x0.75 | x0.5 | x0.859 | x0.852 | within noise |
| x0.75 | x1 | x0.851 | single |  |
| x0.75 | x2 | x0.510 | x0.569 | -10.3% +/- 0.0% |
| x1 | x0.5 | x1.002~ | single |  |
| x1 | x2 | x0.669 | single |  |
| x1.5 | x0.5 | x1.202 | x1.205 | within noise |
| x1.5 | x1 | x1.202 | single |  |
| x1.5 | x2 | x0.963 | x0.804 | +19.8% +/- 0.0% |
| x2 | x0.5 | x1.332 | x1.335 | within noise |
| x2 | x1 | x1.332 | single |  |
| x2 | x2 | x1.211 | x0.891 | +36.0% +/- 0.1% |

hp-spawn, killsPerH, the four (MID, Normal) (ratio to the base)

| monsterHp | respawn | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x1.355 | x1.260 | +7.6% +/- 0.0% |
| x0.5 | x1 | x1.095 | single |  |
| x0.5 | x2 | x0.574 | x0.606 | -5.3% +/- 0.1% |
| x0.75 | x0.5 | x1.258 | x1.213 | +3.6% +/- 0.1% |
| x0.75 | x1 | x1.054 | single |  |
| x0.75 | x2 | x0.564 | x0.584 | -3.4% +/- 0.1% |
| x1 | x0.5 | x1.151 | single |  |
| x1 | x2 | x0.554 | single |  |
| x1.5 | x0.5 | x0.981 | x1.029 | -4.7% +/- 0.0% |
| x1.5 | x1 | x0.894 | single |  |
| x1.5 | x2 | x0.533 | x0.495 | +7.8% +/- 0.1% |
| x2 | x0.5 | x0.871 | x0.935 | -6.8% +/- 0.1% |
| x2 | x1 | x0.812 | single |  |
| x2 | x2 | x0.515 | x0.450 | +14.5% +/- 0.1% |

hp-spawn, levelXpPerH, the four (MID, Normal) (ratio to the base)

| monsterHp | respawn | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x0.679 | x0.630 | +7.7% +/- 0.1% |
| x0.5 | x1 | x0.548 | single |  |
| x0.5 | x2 | x0.287 | x0.303 | -5.1% +/- 0.0% |
| x0.75 | x0.5 | x0.943 | x0.910 | +3.7% +/- 0.1% |
| x0.75 | x1 | x0.790 | single |  |
| x0.75 | x2 | x0.422 | x0.437 | -3.4% +/- 0.1% |
| x1 | x0.5 | x1.151 | single |  |
| x1 | x2 | x0.553 | single |  |
| x1.5 | x0.5 | x1.475 | x1.547 | -4.6% +/- 0.0% |
| x1.5 | x1 | x1.344 | single |  |
| x1.5 | x2 | x0.801 | x0.743 | +7.9% +/- 0.1% |
| x2 | x0.5 | x1.746 | x1.873 | -6.8% +/- 0.0% |
| x2 | x1 | x1.628 | single |  |
| x2 | x2 | x1.031 | x0.900 | +14.6% +/- 0.1% |
<!-- /GEN -->

What it shows.

- **Three caps stand in a row, and only the slowest one counts.** A hunt's pace is set by the kill time, by the dead time between pulls (the walk and the regroup), and by the respawn. A lone hero is held by the first two: halving the respawn changes its kills by a factor of 1.002, which is nothing. The four on Normal is held by the respawn: halving it gives 1.15 times the kills, and doubling it cuts them to 0.55.
- **The single readings mislead by up to 36%.** Double the health and double the respawn, and the two single readings predict a lone hero at 0.45 of its kills. It measures 0.61. Slow kills hide a slow respawn, because the packs are back before the hero is. The other way, halve the health and double the respawn: predicted 0.86, measured 0.70. Fast kills are wasted when there is nothing to kill.
- **Monster health pays XP. It is a reward lever with a difficulty name.** XP is paid per point of monster health, and kills are held by the other two caps. So doubling health raises XP an hour by 1.33 times for a lone hero, 1.63 times for the four on Normal and 1.27 times for the four on Deadly. Halving it cuts XP to 0.63, 0.55 and 0.64. Every earlier pass that made monsters "a little harder" through health also made every seat level faster, and had to take the XP back somewhere else.
- **Neither lever can be tuned alone.** Any respawn change must be read at the health it will ship with, and on the four as well as alone, because the same number is slack for one and binding for the other.

---

## 3. Spell cost with mana regeneration: is a rotation sustainable

Tyler's example: "Spell cost and mana regeneration may jointly determine whether a combat rotation is sustainable." The grid is spell mana cost at x0.5, x1, x2 against mana regeneration at x0.5, x1, x2. MEASURED, run 44972398698, 8 points, 4 seeds.

<!-- GEN: exp id=cost-regen groups=way:mage outcomes=castsPerH,manaPotionsPerH,netPerH -->
cost-regen, castsPerH, mage alone (ratio to the base)

| spellCost | manaRegen | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x1.004~ | x1.004 | within noise |
| x0.5 | x1 | x1.004~ | single |  |
| x0.5 | x2 | x1.004~ | x1.004 | within noise |
| x1 | x0.5 | x1.000~ | single |  |
| x1 | x2 | x1.000~ | single |  |
| x2 | x0.5 | x0.997~ | x0.997 | within noise |
| x2 | x1 | x0.997~ | single |  |
| x2 | x2 | x0.997~ | x0.997 | within noise |

cost-regen, manaPotionsPerH, mage alone (ratio to the base)

| spellCost | manaRegen | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x0.544 | x0.380 | +44.0% +/- 5.8% |
| x0.5 | x1 | x0.124 | single |  |
| x0.5 | x2 | x0.001 | no single reading to compare (a lever alone was refused, or its base is zero here) | |
| x1 | x0.5 | x3.055 | single |  |
| x1 | x2 | x0.201 | single |  |
| x2 | x0.5 | x9.173 | x20.030 | -54.2% +/- 0.0% |
| x2 | x1 | x6.557 | single |  |
| x2 | x2 | x1.896 | x1.315 | +44.6% +/- 4.7% |

cost-regen, netPerH, mage alone (change from the base)

| spellCost | manaRegen | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | +566.800 | +112.600 | +454.500 +/- 2.968 |
| x0.5 | x1 | +1030.000 | single |  |
| x0.5 | x2 | +1210.000 | +1943.000 | -732.400 +/- 5.206 |
| x1 | x0.5 | -917.400 | single |  |
| x1 | x2 | +912.500 | single |  |
| x2 | x0.5 | -4422.000 | -4169.000 | -252.700 +/- 3.737 |
| x2 | x1 | -3252.000 | single |  |
| x2 | x2 | -1123.000 | -2340.000 | +1216.000 +/- 5.325 |
<!-- /GEN -->

What it shows.

- **In this build a rotation is never unsustainable. It is only more or less expensive.** Casts an hour stay within half a percent of the base at all eight points, for every seat. A hero who runs out of mana drinks a store drink, the store never runs dry, and the next cast goes out. Spell cost and regeneration do not decide whether a hero can cast. They decide how many drinks it buys.
- **On drinks, the two levers interact hard.** For the Mage alone, cost x2 means 6.6 times the drinks and regeneration x0.5 means 3.1 times. Together the single readings predict 20 times. It measures 9.2 times. With cost x2 and regeneration x2 they predict 1.3 times and it measures 1.9 times. Drinks are the gap between mana spent and mana regenerated, cut off at zero, so the result follows a difference and the single readings assume a product.
- **There is a threshold where the bill vanishes.** At cost x0.5 with regeneration x2 the Mage buys a thousandth of its drinks. Below that line regeneration covers the whole rotation, and either lever stops mattering.
- **The gold reading is the real one.** Cost x2 takes 3,250 gold an hour from a lone Mage and 725 from each hero of the four. The same change takes 240 from a lone hammer. This is the supply tax of section 3.4 of the sensitivity page: three ways pay it and five do not.
- **Mana pool size is a third lever on the same thing.** One at a time, hero mana x2 cuts drinks by 87% and x0.5 raises them about sixteen times, and casts do not move at all (`04-sensitivity.md`, section 6). Pool, cost and regeneration are three dials on one number, the drink bill.

UNKNOWN: whether this holds for a real player. The harness never runs out of gold and always carries the drink. A player with an empty purse, or who does not slot a drink, would feel cost and regeneration as lost casts. The simulator has one cell that starts broke (the `binds` variant) and this pass did not play it.

---

## 4. The attack clock and the stair clock: a lever the engine will not let you move alone

Not one of Tyler's examples. It was found because the pass tried it. The one basic attack interval, 2,000 ms, cannot be raised by itself: `src/core/hunt/tower.js` refuses any tree where the Tower's and the Catacombs' stair clock (4,000 ms) is under two attack intervals. So every step above x1 was refused by the engine, and the slow side was read by moving the two together. MEASURED, run 44976040886, 5 points, 4 seeds.

<!-- GEN: exp id=clock groups=party:1,four:deadly outcomes=killsPerH,takenPerH -->
clock, killsPerH, lone heroes (MID, Normal) (ratio to the base)

| attackInterval | stairClock | measured | singles predict | gap |
|---|---|---|---|---|
| x1 | x2 | x1.000~ | single |  |
| x1.5 | x1 | refused by the engine | | |
| x1.5 | x2 | x0.903 | no single reading to compare (a lever alone was refused, or its base is zero here) | |
| x2 | x1 | refused by the engine | | |
| x2 | x2 | x0.846 | no single reading to compare (a lever alone was refused, or its base is zero here) | |

clock, takenPerH, lone heroes (MID, Normal) (ratio to the base)

| attackInterval | stairClock | measured | singles predict | gap |
|---|---|---|---|---|
| x1 | x2 | x1.000~ | single |  |
| x1.5 | x1 | refused by the engine | | |
| x1.5 | x2 | x0.818 | no single reading to compare (a lever alone was refused, or its base is zero here) | |
| x2 | x1 | refused by the engine | | |
| x2 | x2 | x0.728 | no single reading to compare (a lever alone was refused, or its base is zero here) | |

clock, killsPerH, the four on deadly (ratio to the base)

| attackInterval | stairClock | measured | singles predict | gap |
|---|---|---|---|---|
| x1 | x2 | x1.000~ | single |  |
| x1.5 | x1 | refused by the engine | | |
| x1.5 | x2 | x0.921 | no single reading to compare (a lever alone was refused, or its base is zero here) | |
| x2 | x1 | refused by the engine | | |
| x2 | x2 | x0.863 | no single reading to compare (a lever alone was refused, or its base is zero here) | |

clock, takenPerH, the four on deadly (ratio to the base)

| attackInterval | stairClock | measured | singles predict | gap |
|---|---|---|---|---|
| x1 | x2 | x1.000~ | single |  |
| x1.5 | x1 | refused by the engine | | |
| x1.5 | x2 | x0.745 | no single reading to compare (a lever alone was refused, or its base is zero here) | |
| x2 | x1 | refused by the engine | | |
| x2 | x2 | x0.620 | no single reading to compare (a lever alone was refused, or its base is zero here) | |
<!-- /GEN -->

- The stair clock alone moves nothing, because no cell of the pass plays a run ground.
- A coupling held by a validator is the safest kind, because it cannot be broken by accident. It is also invisible in every list of levers. The registry lists the attack interval as one global knob. It is really one knob on the fast side and two on the slow side.
- The attack interval is far from proportional. Halving it (twice the swings, for heroes and monsters alike) raises a lone hero's kills by 19% and its damage taken by 26%. Doubling it cuts kills by 15% and damage taken by 27%. Most of an hour is not swinging.

---

## 5. Hero damage with monster health: one lever for difficulty, and a hidden one for XP

Kill time is damage over health, so the two should be one lever. The grid is each at x0.5, x1, x2. MEASURED, run 44969087150, 8 points, 4 seeds.

<!-- GEN: exp id=damage-hp groups=party:1,four:deadly outcomes=killsPerH,levelXpPerH,takenPerH -->
damage-hp, killsPerH, lone heroes (MID, Normal) (ratio to the base)

| playerAttack | monsterHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x1.020 | x0.879 | +15.9% +/- 0.1% |
| x0.5 | x1 | x0.687 | single |  |
| x0.5 | x2 | x0.425 | x0.458 | -7.2% +/- 0.1% |
| x1 | x0.5 | x1.281 | single |  |
| x1 | x2 | x0.667 | single |  |
| x2 | x0.5 | x1.375 | x1.644 | -16.3% +/- 0.1% |
| x2 | x1 | x1.284 | single |  |
| x2 | x2 | x1.008 | x0.856 | +17.8% +/- 0.1% |

damage-hp, levelXpPerH, lone heroes (MID, Normal) (ratio to the base)

| playerAttack | monsterHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x0.505 | x0.436 | +15.8% +/- 0.0% |
| x0.5 | x1 | x0.687 | single |  |
| x0.5 | x2 | x0.849 | x0.915 | -7.2% +/- 0.1% |
| x1 | x0.5 | x0.634 | single |  |
| x1 | x2 | x1.332 | single |  |
| x2 | x0.5 | x0.681 | x0.814 | -16.3% +/- 0.1% |
| x2 | x1 | x1.284 | single |  |
| x2 | x2 | x2.016 | x1.710 | +17.9% +/- 0.1% |

damage-hp, takenPerH, lone heroes (MID, Normal) (ratio to the base)

| playerAttack | monsterHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x1.022 | x0.924 | +10.7% +/- 0.3% |
| x0.5 | x1 | x1.308 | single |  |
| x0.5 | x2 | x1.611 | x1.678 | -4.0% +/- 0.1% |
| x1 | x0.5 | x0.706 | single |  |
| x1 | x2 | x1.282 | single |  |
| x2 | x0.5 | x0.481 | x0.473 | +1.6% +/- 0.4% |
| x2 | x1 | x0.671 | single |  |
| x2 | x2 | x0.931 | x0.860 | +8.3% +/- 0.3% |

damage-hp, killsPerH, the four on deadly (ratio to the base)

| playerAttack | monsterHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x0.977 | x0.788 | +24.0% +/- 0.1% |
| x0.5 | x1 | x0.613 | single |  |
| x0.5 | x2 | x0.356 | x0.387 | -7.9% +/- 0.1% |
| x1 | x0.5 | x1.286 | single |  |
| x1 | x2 | x0.632 | single |  |
| x2 | x0.5 | x1.445 | x1.672 | -13.5% +/- 0.0% |
| x2 | x1 | x1.299 | single |  |
| x2 | x2 | x1.011 | x0.821 | +23.2% +/- 0.0% |

damage-hp, levelXpPerH, the four on deadly (ratio to the base)

| playerAttack | monsterHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x0.489 | x0.394 | +24.0% +/- 0.1% |
| x0.5 | x1 | x0.613 | single |  |
| x0.5 | x2 | x0.714 | x0.776 | -7.9% +/- 0.0% |
| x1 | x0.5 | x0.643 | single |  |
| x1 | x2 | x1.266 | single |  |
| x2 | x0.5 | x0.723 | x0.836 | -13.5% +/- 0.0% |
| x2 | x1 | x1.300 | single |  |
| x2 | x2 | x2.028 | x1.645 | +23.2% +/- 0.0% |

damage-hp, takenPerH, the four on deadly (ratio to the base)

| playerAttack | monsterHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x1.268 | x1.059 | +19.8% +/- 0.5% |
| x0.5 | x1 | x2.045 | single |  |
| x0.5 | x2 | x2.666 | x3.588 | -25.7% +/- 0.4% |
| x1 | x0.5 | x0.518 | single |  |
| x1 | x2 | x1.755 | single |  |
| x2 | x0.5 | x0.191 | x0.169 | +12.5% +/- 1.1% |
| x2 | x1 | x0.327 | single |  |
| x2 | x2 | x0.653 | x0.574 | +13.8% +/- 0.4% |
<!-- /GEN -->

- **On kills they are one lever.** Double both and kills an hour come back to 1.01 times the base, alone, in the four and on Deadly. Halve both and they come back to 1.02. Whatever the ratio is, the fight is the same fight.
- **On XP they are not.** The same two points pay 2.02 times and 0.50 times the XP, because XP follows monster health. "Scale damage and health together" is a pure XP multiplier that changes nothing about the fight. It is the cleanest pace lever in the build, and nothing names it as one.
- **The single readings are wrong by 13% to 24% at these points,** and by sign as well as size. Read one at a time, damage x2 is worth +28% kills alone and health x2 costs 33%, so together they "should" cost 14%. They cost nothing. This is the dead time again: one-at-a-time readings of a kill time lever are taken against a hunt that is mostly not killing.
- **Damage taken does not come back.** With both doubled a lone hero takes 0.93 of the base, the four 0.70, the four on Deadly 0.65. Fights are the same length, but spells and area damage clear a pull differently when every blow is twice as large against twice the health.

---

## 6. Party XP with tier XP, and the tier a four chooses

The grid is party XP at x0.8, x1, x1.2 against tier XP at x0.8, x1, x1.2. MEASURED, run 44969087150, 8 points, 4 seeds.

<!-- GEN: exp id=party-tier groups=four:normal,four:deadly outcomes=netLevelXpPerH -->
party-tier, netLevelXpPerH, the four on normal (ratio to the base)

| partyXp | tierXp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.8 | x0.8 | x0.800 | x0.800 | within noise |
| x0.8 | x1 | x0.800 | single |  |
| x0.8 | x1.2 | x0.800 | x0.800 | within noise |
| x1 | x0.8 | x1.000~ | single |  |
| x1 | x1.2 | x1.000~ | single |  |
| x1.2 | x0.8 | x1.201 | x1.201 | within noise |
| x1.2 | x1 | x1.201 | single |  |
| x1.2 | x1.2 | x1.201 | x1.201 | within noise |

party-tier, netLevelXpPerH, the four on deadly (ratio to the base)

| partyXp | tierXp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.8 | x0.8 | x0.640 | x0.638 | within noise |
| x0.8 | x1 | x0.799 | single |  |
| x0.8 | x1.2 | x0.961 | x0.960 | within noise |
| x1 | x0.8 | x0.799 | single |  |
| x1 | x1.2 | x1.202 | single |  |
| x1.2 | x0.8 | x0.960 | x0.959 | within noise |
| x1.2 | x1 | x1.201 | single |  |
| x1.2 | x1.2 | x1.444 | x1.443 | within noise |
<!-- /GEN -->

- **Inside the engine these two do not interact at all.** Every joint point is the product of its two single readings, within noise. Each has an elasticity of exactly 1 on the cells it touches and exactly 0 on the rest: party XP does nothing for a lone hero, and tier XP does nothing on Normal. They are the two cleanest levers in the pass.
- **So the coupling is all in the player's choice, and that choice has enormous slack.** COMPUTED from section 3.3 of the sensitivity page: a four earns 1.6 to 3.5 times as much on Deadly as on Normal and does not die there. Tier XP is worth 25% of that step. Take it away whole and Deadly still pays 1.3 to 2.8 times Normal. No value of tier XP inside this grid, and none down to zero bonus, moves the four off the hardest tier. The four's tier is decided by the pull size and by the fact that it cannot die, not by the XP dial.
- **The same slack means party XP cannot fix the four on Normal.** At Levels 30 and 110 the four earns 0.48 and 0.51 of what its heroes earn alone. Party XP would need x2 to close that, and x2 would also double the four on Deadly, where a head already earns 3.3 to 3.5 times what it earns on Normal. The gap is a spawn ceiling, and an XP multiplier is the wrong shape to close it.
- JUDGMENT: "which four runs which tier" is not a balance question in this build. It has one answer. It becomes a question only if the four can die on the hardest tier, and section 7 shows how far away that is.

---

## 7. The armor curve with the tier blow dial and the coin line

The last balance pass proposed the armor curve at x2.4 and found the first-week bands, the drop tables and a lone tank's supply bill moved with it. The grid is the armor curve at x1, x1.5, x2.4 against the tier blow dial at x0.9, x1, x1.25 and coin a kill at x0.75, x1, x1.25. MEASURED, run 44969087150, 26 points, 4 seeds. The slices below hold coin at x1.

<!-- GEN: exp id=armor-tier-coin fix=coinPerKill:1 groups=hammer:dangerous,four:deadly outcomes=takenPerH,deathsPer1000h,storePerH -->
armor-tier-coin, takenPerH, the hammer alone on dangerous (MID, Levels 30 to 110) (ratio to the base)

| armorCurve | tierDanger | coinPerKill | measured | singles predict | gap |
|---|---|---|---|---|---|
| x1 | x0.9 | x1 | x0.851 | single |  |
| x1 | x1.25 | x1 | x1.376 | single |  |
| x1.5 | x0.9 | x1 | x0.856 | x0.865 | within noise |
| x1.5 | x1 | x1 | x1.016 | single |  |
| x1.5 | x1.25 | x1 | x1.502 | x1.398 | within noise |
| x2.4 | x0.9 | x1 | x0.968 | x1.004 | within noise |
| x2.4 | x1 | x1 | x1.180 | single |  |
| x2.4 | x1.25 | x1 | x1.705 | x1.623 | within noise |

armor-tier-coin, deathsPer1000h, the hammer alone on dangerous (MID, Levels 30 to 110) (deaths in 1,000 hours, base 94.09)

| armorCurve | tierDanger | coinPerKill | measured | singles predict | gap |
|---|---|---|---|---|---|
| x1 | x0.9 | x1 | 0 | single |  |
| x1 | x1.25 | x1 | 4013 | single |  |
| x1.5 | x0.9 | x1 | 13.52~ | 13.6 | within noise |
| x1.5 | x1 | x1 | 107.6~ | single |  |
| x1.5 | x1.25 | x1 | 5825 | 4027.0 | within noise |
| x2.4 | x0.9 | x1 | 67.43~ | 279.7 | within noise |
| x2.4 | x1 | x1 | 373.8 | single |  |
| x2.4 | x1.25 | x1 | 15380 | 4293.0 | +11090.0 +/- 4592 |

armor-tier-coin, storePerH, the hammer alone on dangerous (MID, Levels 30 to 110) (ratio to the base)

| armorCurve | tierDanger | coinPerKill | measured | singles predict | gap |
|---|---|---|---|---|---|
| x1 | x0.9 | x1 | x0.618 | single |  |
| x1 | x1.25 | x1 | x2.224 | single |  |
| x1.5 | x0.9 | x1 | x0.635 | x0.650 | -2.3% +/- 0.5% |
| x1.5 | x1 | x1 | x1.052 | single |  |
| x1.5 | x1.25 | x1 | x2.307 | x2.339 | within noise |
| x2.4 | x0.9 | x1 | x0.921 | x0.914 | within noise |
| x2.4 | x1 | x1 | x1.480 | single |  |
| x2.4 | x1.25 | x1 | x2.867 | x3.291 | -12.9% +/- 2.4% |

armor-tier-coin, takenPerH, the four on deadly (ratio to the base)

| armorCurve | tierDanger | coinPerKill | measured | singles predict | gap |
|---|---|---|---|---|---|
| x1 | x0.9 | x1 | x0.786 | single |  |
| x1 | x1.25 | x1 | x1.615 | single |  |
| x1.5 | x0.9 | x1 | x0.827 | x0.849 | -2.6% +/- 0.8% |
| x1.5 | x1 | x1 | x1.081 | single |  |
| x1.5 | x1.25 | x1 | x1.835 | x1.745 | +5.2% +/- 0.8% |
| x2.4 | x0.9 | x1 | x0.985 | x1.013 | -2.7% +/- 0.3% |
| x2.4 | x1 | x1 | x1.289 | single |  |
| x2.4 | x1.25 | x1 | x2.169 | x2.081 | +4.2% +/- 0.7% |

armor-tier-coin, deathsPer1000h, the four on deadly (deaths in 1,000 hours, base 0)

| armorCurve | tierDanger | coinPerKill | measured | singles predict | gap |
|---|---|---|---|---|---|
| x1 | x0.9 | x1 | 0~ | single |  |
| x1 | x1.25 | x1 | 0~ | single |  |
| x1.5 | x0.9 | x1 | 0~ | 0.0 | within noise |
| x1.5 | x1 | x1 | 0~ | single |  |
| x1.5 | x1.25 | x1 | 0~ | 0.0 | within noise |
| x2.4 | x0.9 | x1 | 0~ | 0.0 | within noise |
| x2.4 | x1 | x1 | 0~ | single |  |
| x2.4 | x1.25 | x1 | 0~ | 0.0 | within noise |

armor-tier-coin, storePerH, the four on deadly (ratio to the base)

| armorCurve | tierDanger | coinPerKill | measured | singles predict | gap |
|---|---|---|---|---|---|
| x1 | x0.9 | x1 | x0.983 | single |  |
| x1 | x1.25 | x1 | x1.044 | single |  |
| x1.5 | x0.9 | x1 | x0.985 | x0.989 | within noise |
| x1.5 | x1 | x1 | x1.005 | single |  |
| x1.5 | x1.25 | x1 | x1.063 | x1.050 | +1.2% +/- 0.0% |
| x2.4 | x0.9 | x1 | x0.996~ | x1.002 | within noise |
| x2.4 | x1 | x1 | x1.019 | single |  |
| x2.4 | x1.25 | x1 | x1.099 | x1.065 | +3.2% +/- 0.1% |
<!-- /GEN -->

- **The armor curve is a tier dial for one seat.** For the lone hammer on Dangerous, the curve at x2.4 raises damage taken by 18%, the store bill by 48% and deaths from 94 to 374 in 1,000 hours. Pairing it with the tier dial at x0.9 brings damage taken back to 0.97 of the base. So on this seat "armor curve x2.4" and "tier blows x1.1" are nearly the same change, written in two different files.
- **On the cliff, the two do not add.** The curve at x2.4 with the tier dial at x1.25: the single readings predict about 4,300 deaths in 1,000 hours and the joint point measures 15,400. Both readings mean "dead inside the hour", so the number matters less than the lesson: next to a cliff, two changes that each look survivable are not survivable together.
- **For the four it is a different lever.** The same x2.4 raises the four's damage taken on Deadly by 29%, its store bill by 2%, and its deaths not at all. With the tier dial at x1.25 on top, the four takes 2.17 times the damage and still does not die. The seat the Level pace is timed on does not feel this lever. The seat that feels it is the lone melee hero one tier up.
- **Why the curve reaches so little at home.** On Normal at its own Level a MID hero's armor already sits at the 60% mitigation cap (sensitivity page, section 7.3), so the curve has nothing to cut until the attacker is well above the hero's Level. A harder tier raises the attacker's Level, which is why the curve only bites there.
- **Coin does not interact with either.** Coin a kill moves gold in and nothing else, at every point of the grid. The joint readings are the sums of the singles to within half a percent. It can pay for the supply bill the curve creates, but only on average: the bill lands on the lone melee hero on a harder tier (minus 37,600 gold an hour at x2.4), and a coin line pays every seat the same.

---

## 8. The Level curve with the death price and monster damage

The seat the Level pace is timed on is the MID four on Dangerous, after its deaths (candidate PACE-1 in `03-targets.md`). The worry was that the seat moves whenever a death dial moves, since it was refitted twice. The grid is the Level curve at x0.75, x1, x1.5 against the death price at x0.5, x1, x2 and monster damage at x1, x1.25, x1.5. MEASURED, run 44969087150, 26 points, 4 seeds. The slices below hold the Level curve at x1.

<!-- GEN: exp id=level-death fix=levelCurve:1 groups=four:dangerous,hammer:dangerous outcomes=netLevelXpPerH,deathsPer1000h -->
level-death, netLevelXpPerH, the four on dangerous (ratio to the base)

| levelCurve | deathLoss | monsterDamage | measured | singles predict | gap |
|---|---|---|---|---|---|
| x1 | x0.5 | x1 | x1.000~ | single |  |
| x1 | x0.5 | x1.25 | x1.001~ | x1.001 | within noise |
| x1 | x0.5 | x1.5 | x1.001~ | x1.001 | within noise |
| x1 | x1 | x1.25 | x1.001~ | single |  |
| x1 | x1 | x1.5 | x1.001~ | single |  |
| x1 | x2 | x1 | x1.000~ | single |  |
| x1 | x2 | x1.25 | x1.001~ | x1.001 | within noise |
| x1 | x2 | x1.5 | x1.001~ | x1.001 | within noise |

level-death, deathsPer1000h, the four on dangerous (deaths in 1,000 hours, base 0)

| levelCurve | deathLoss | monsterDamage | measured | singles predict | gap |
|---|---|---|---|---|---|
| x1 | x0.5 | x1 | 0~ | single |  |
| x1 | x0.5 | x1.25 | 0~ | 0.0 | within noise |
| x1 | x0.5 | x1.5 | 0~ | 0.0 | within noise |
| x1 | x1 | x1.25 | 0~ | single |  |
| x1 | x1 | x1.5 | 0~ | single |  |
| x1 | x2 | x1 | 0~ | single |  |
| x1 | x2 | x1.25 | 0~ | 0.0 | within noise |
| x1 | x2 | x1.5 | 0~ | 0.0 | within noise |

level-death, netLevelXpPerH, the hammer alone on dangerous (MID, Levels 30 to 110) (ratio to the base)

| levelCurve | deathLoss | monsterDamage | measured | singles predict | gap |
|---|---|---|---|---|---|
| x1 | x0.5 | x1 | x1.107 | single |  |
| x1 | x0.5 | x1.25 | x0.061 | no single reading to compare (a lever alone was refused, or its base is zero here) | |
| x1 | x0.5 | x1.5 | x-0.125 | no single reading to compare (a lever alone was refused, or its base is zero here) | |
| x1 | x1 | x1.25 | x-0.079 | single |  |
| x1 | x1 | x1.5 | x-0.267 | single |  |
| x1 | x2 | x1 | x0.785 | single |  |
| x1 | x2 | x1.25 | x-0.359 | no single reading to compare (a lever alone was refused, or its base is zero here) | |
| x1 | x2 | x1.5 | x-0.552 | no single reading to compare (a lever alone was refused, or its base is zero here) | |

level-death, deathsPer1000h, the hammer alone on dangerous (MID, Levels 30 to 110) (deaths in 1,000 hours, base 94.09)

| levelCurve | deathLoss | monsterDamage | measured | singles predict | gap |
|---|---|---|---|---|---|
| x1 | x0.5 | x1 | 94.09~ | single |  |
| x1 | x0.5 | x1.25 | 1120 | 1120.0 | within noise |
| x1 | x0.5 | x1.5 | 13330 | 13330.0 | within noise |
| x1 | x1 | x1.25 | 1120 | single |  |
| x1 | x1 | x1.5 | 13330 | single |  |
| x1 | x2 | x1 | 94.09~ | single |  |
| x1 | x2 | x1.25 | 1120 | 1120.0 | within noise |
| x1 | x2 | x1.5 | 13330 | 13330.0 | within noise |
<!-- /GEN -->

- **The seat does not feel death at all.** The four on Dangerous has no deaths at monster damage x1.5, so its XP after deaths is the base to a tenth of a percent at every point of the grid, at any death price. On the seat the pace is timed on, the death price is a dead lever and monster damage is nearly one. The refits were not caused by death. They follow kills an hour, which on this seat follows the pull and the respawn (section 2).
- **The Level curve is exactly what it says.** Hours for a Level move in proportion to it for every seat that does not die, with no interaction with the other two.
- **Where there are deaths, the death price is a multiplier on a loss that monster damage has already decided.** For the lone hammer on Dangerous at today's damage, the death price at x0.5 lifts XP after deaths by 11% and x2 cuts it by 21%. At monster damage x1.25 the hero dies about every hour, and XP after deaths is 0.06 of the base at half price, below zero at full price, and further below at double. Past the cliff the death price only chooses how negative.
- **So the death rate and the death price are not a pair that trade off smoothly.** There is a narrow band of monster damage, about 10% wide for this seat, where a hero dies now and then and the price matters as a tax. Under it the price is unread. Over it the hero cannot progress at any price. JUDGMENT: a design that wants death to be a tax needs the death rate to rise gently with danger. Today it rises as a wall.

---

## 9. Hero damage with healing and its cost

Tyler's example: "increased damage may also increase life leech, which increases survivability and reduces healing costs." The grid is hero damage at x0.75, x1, x1.5 against heal spell size at x0.5, x1, x2 and store food price at x0.5, x1, x2. MEASURED, run 44969087150, 26 points, 4 seeds. The slices below hold the food price at x1.

**First, the leech itself.** There is no life leech to increase. The only leech the engine reads is on the Necrotic drain spells, which sit behind a switch that is off (`src/data/necrotic-storm.js`). The life leech and mana leech imbuement rows are data that no engine code reads. One at a time, spell leech at x0.25 to x3 moved no outcome in any cell (MEASURED, `oat:spellLeech`). So the experiment plays the path that does exist: damage shortens fights, shorter fights mean less damage taken, and less damage taken means less healing bought.

<!-- GEN: exp id=damage-heal fix=foodPrice:1 groups=four:deadly,hammer:dangerous outcomes=takenPerH,healInPerH,storePerH,netPerH -->
damage-heal, takenPerH, the four on deadly (ratio to the base)

| playerAttack | healPower | foodPrice | measured | singles predict | gap |
|---|---|---|---|---|---|
| x0.75 | x0.5 | x1 | x1.415 | x1.408 | within noise |
| x0.75 | x1 | x1 | x1.419 | single |  |
| x0.75 | x2 | x1 | x1.436 | x1.462 | -1.8% +/- 0.4% |
| x1 | x0.5 | x1 | x0.992 | single |  |
| x1 | x2 | x1 | x1.030 | single |  |
| x1.5 | x0.5 | x1 | x0.509 | x0.512 | within noise |
| x1.5 | x1 | x1 | x0.517 | single |  |
| x1.5 | x2 | x1 | x0.523 | x0.532 | within noise |

damage-heal, healInPerH, the four on deadly (ratio to the base)

| playerAttack | healPower | foodPrice | measured | singles predict | gap |
|---|---|---|---|---|---|
| x0.75 | x0.5 | x1 | x1.475 | x1.345 | +9.7% +/- 1.4% |
| x0.75 | x1 | x1 | x1.860 | single |  |
| x0.75 | x2 | x1 | x2.397 | x2.491 | within noise |
| x1 | x0.5 | x1 | x0.724 | single |  |
| x1 | x2 | x1 | x1.340 | single |  |
| x1.5 | x0.5 | x1 | x0.188 | x0.203 | -7.3% +/- 2.1% |
| x1.5 | x1 | x1 | x0.281 | single |  |
| x1.5 | x2 | x1 | x0.311 | x0.376 | -17.4% +/- 1.6% |

damage-heal, storePerH, the four on deadly (ratio to the base)

| playerAttack | healPower | foodPrice | measured | singles predict | gap |
|---|---|---|---|---|---|
| x0.75 | x0.5 | x1 | x1.151 | x1.120 | +2.8% +/- 0.2% |
| x0.75 | x1 | x1 | x1.104 | single |  |
| x0.75 | x2 | x1 | x1.076 | x1.089 | -1.2% +/- 0.2% |
| x1 | x0.5 | x1 | x1.015 | single |  |
| x1 | x2 | x1 | x0.986 | single |  |
| x1.5 | x0.5 | x1 | x0.747 | x0.752 | within noise |
| x1.5 | x1 | x1 | x0.741 | single |  |
| x1.5 | x2 | x1 | x0.740 | x0.731 | +1.3% +/- 0.1% |

damage-heal, netPerH, the four on deadly (change from the base)

| playerAttack | healPower | foodPrice | measured | singles predict | gap |
|---|---|---|---|---|---|
| x0.75 | x0.5 | x1 | -4254.000 | -3938.000 | -316.300 +/- 65.72 |
| x0.75 | x1 | x1 | -3849.000 | single |  |
| x0.75 | x2 | x1 | -3594.000 | -3636.000 | within noise |
| x1 | x0.5 | x1 | -89.220~ | single |  |
| x1 | x2 | x1 | +213.500~ | single |  |
| x1.5 | x0.5 | x1 | +5145.000 | +5079.000 | within noise |
| x1.5 | x1 | x1 | +5168.000 | single |  |
| x1.5 | x2 | x1 | +5089.000 | +5382.000 | within noise |

damage-heal, takenPerH, the hammer alone on dangerous (MID, Levels 30 to 110) (ratio to the base)

| playerAttack | healPower | foodPrice | measured | singles predict | gap |
|---|---|---|---|---|---|
| x0.75 | x0.5 | x1 | x1.104 | x1.086 | within noise |
| x0.75 | x1 | x1 | x1.085 | single |  |
| x0.75 | x2 | x1 | x1.080 | x1.082 | within noise |
| x1 | x0.5 | x1 | x1.001~ | single |  |
| x1 | x2 | x1 | x0.997~ | single |  |
| x1.5 | x0.5 | x1 | x0.875 | x0.871 | within noise |
| x1.5 | x1 | x1 | x0.871 | single |  |
| x1.5 | x2 | x1 | x0.872 | x0.868 | within noise |

damage-heal, healInPerH, the hammer alone on dangerous (MID, Levels 30 to 110) (ratio to the base)

| playerAttack | healPower | foodPrice | measured | singles predict | gap |
|---|---|---|---|---|---|
| x0.75 | x0.5 | x1 | x1.225 | x1.224 | within noise |
| x0.75 | x1 | x1 | x1.255 | single |  |
| x0.75 | x2 | x1 | x1.311 | x1.331 | within noise |
| x1 | x0.5 | x1 | x0.976 | single |  |
| x1 | x2 | x1 | x1.061 | single |  |
| x1.5 | x0.5 | x1 | x0.572 | x0.575 | within noise |
| x1.5 | x1 | x1 | x0.589 | single |  |
| x1.5 | x2 | x1 | x0.666 | x0.625 | +6.4% +/- 0.2% |

damage-heal, storePerH, the hammer alone on dangerous (MID, Levels 30 to 110) (ratio to the base)

| playerAttack | healPower | foodPrice | measured | singles predict | gap |
|---|---|---|---|---|---|
| x0.75 | x0.5 | x1 | x1.811 | x1.866 | within noise |
| x0.75 | x1 | x1 | x1.379 | single |  |
| x0.75 | x2 | x1 | x0.710 | x0.697 | within noise |
| x1 | x0.5 | x1 | x1.353 | single |  |
| x1 | x2 | x1 | x0.505 | single |  |
| x1.5 | x0.5 | x1 | x0.695 | x0.656 | +6.0% +/- 1.7% |
| x1.5 | x1 | x1 | x0.485 | single |  |
| x1.5 | x2 | x1 | x0.232 | x0.245 | -5.3% +/- 1.3% |

damage-heal, netPerH, the hammer alone on dangerous (MID, Levels 30 to 110) (change from the base)

| playerAttack | healPower | foodPrice | measured | singles predict | gap |
|---|---|---|---|---|---|
| x0.75 | x0.5 | x1 | -57300.000 | -44950.000 | within noise |
| x0.75 | x1 | x1 | -26540.000 | single |  |
| x0.75 | x2 | x1 | +10920.000 | +880.000 | +10040.000 +/- 3081 |
| x1 | x0.5 | x1 | -18410.000 | single |  |
| x1 | x2 | x1 | +27420.000 | single |  |
| x1.5 | x0.5 | x1 | +24210.000 | +18340.000 | +5869.000 +/- 1287 |
| x1.5 | x1 | x1 | +36750.000 | single |  |
| x1.5 | x2 | x1 | +51780.000 | +64170.000 | -12400.000 +/- 687.6 |
<!-- /GEN -->

- **The loop Tyler describes is real and strong, without leech.** For the four on Deadly, damage x1.5 cuts damage taken to 0.52, healing received to 0.28 and the store bill to 0.74, and adds 5,170 gold an hour a hero. Damage x0.75 raises damage taken to 1.42 and healing to 1.86. Hero damage is as strong a survival lever as the mitigation cap, the strongest armor lever (sensitivity page, section 4), and unlike the cap it also pays. A dead monster deals nothing.
- **Heal size is the weak lever of the pair.** For the four, heal spells at x2 change damage taken by 3% and the store bill by 1%. Healing received follows the damage that needs healing. A bigger heal means fewer casts, not more health.
- **For a hero with no Healer, heal size is a gold lever.** For the lone hammer on Dangerous, the one self heal at x2 halves the store bill (0.51) and is worth 27,400 gold an hour, close to what damage x1.5 is worth (36,750).
- **The two savings overlap.** Damage x1.5 with heals x2 is worth 51,800 to the lone hammer where the single readings add to 64,200. Each saves food the other would have saved. One-at-a-time overstates the pair by a quarter.
- **Food price only scales the result.** It moves the store bill and net gold and nothing else, so it is the one lever of the three that can be read alone.

---

## 10. Monster damage with hero health: two names for one number, and where the four finally dies

A monster's blow is written as a share of a same-Level hero's health. So hero health and monster damage should cancel. The grid is each at x0.5, x1, x2. MEASURED, run 44969087150, 8 points, 4 seeds.

<!-- GEN: exp id=danger-hp groups=party:1,four:deadly,hammer:dangerous outcomes=takenPerH,deathsPer1000h -->
danger-hp, takenPerH, lone heroes (MID, Normal) (ratio to the base)

| monsterDamage | heroHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x0.288 | x0.238 | +21.1% +/- 0.2% |
| x0.5 | x1 | x0.508 | single |  |
| x0.5 | x2 | x1.078 | x1.099 | -1.9% +/- 0.2% |
| x1 | x0.5 | x0.469 | single |  |
| x1 | x2 | x2.162 | single |  |
| x2 | x0.5 | x0.936 | x0.984 | -4.9% +/- 0.3% |
| x2 | x1 | x2.101 | single |  |
| x2 | x2 | x4.887 | x4.542 | +7.6% +/- 0.5% |

danger-hp, deathsPer1000h, lone heroes (MID, Normal) (deaths in 1,000 hours, base 0)

| monsterDamage | heroHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | 0~ | 0.0 | within noise |
| x0.5 | x1 | 0~ | single |  |
| x0.5 | x2 | 0~ | 0.0 | within noise |
| x1 | x0.5 | 0~ | single |  |
| x1 | x2 | 0~ | single |  |
| x2 | x0.5 | 10.42 | 13.5 | within noise |
| x2 | x1 | 13.54 | single |  |
| x2 | x2 | 21.76 | 13.5 | within noise |

danger-hp, takenPerH, the four on deadly (ratio to the base)

| monsterDamage | heroHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x0.181 | x0.163 | +11.3% +/- 0.2% |
| x0.5 | x1 | x0.420 | single |  |
| x0.5 | x2 | x1.051 | x0.984 | +6.8% +/- 0.2% |
| x1 | x0.5 | x0.388 | single |  |
| x1 | x2 | x2.342 | single |  |
| x2 | x0.5 | x1.008~ | x0.886 | +13.8% +/- 0.8% |
| x2 | x1 | x2.285 | single |  |
| x2 | x2 | x5.104 | x5.351 | -4.6% +/- 0.6% |

danger-hp, deathsPer1000h, the four on deadly (deaths in 1,000 hours, base 0)

| monsterDamage | heroHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | 0~ | 0.0 | within noise |
| x0.5 | x1 | 0~ | single |  |
| x0.5 | x2 | 0~ | 0.0 | within noise |
| x1 | x0.5 | 0~ | single |  |
| x1 | x2 | 0~ | single |  |
| x2 | x0.5 | 0~ | 0.0 | within noise |
| x2 | x1 | 0~ | single |  |
| x2 | x2 | 77.96 | 0.0 | +78.0 +/- 20.11 |

danger-hp, takenPerH, the hammer alone on dangerous (MID, Levels 30 to 110) (ratio to the base)

| monsterDamage | heroHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | x0.292 | x0.268 | +9.2% +/- 0.2% |
| x0.5 | x1 | x0.518 | single |  |
| x0.5 | x2 | x0.995~ | x0.983 | within noise |
| x1 | x0.5 | x0.517 | single |  |
| x1 | x2 | x1.899 | single |  |
| x2 | x0.5 | x1.085~ | no single reading to compare (a lever alone was refused, or its base is zero here) | |
| x2 | x1 | n/a | single |  |
| x2 | x2 | n/a | no single reading to compare (a lever alone was refused, or its base is zero here) | |

danger-hp, deathsPer1000h, the hammer alone on dangerous (MID, Levels 30 to 110) (deaths in 1,000 hours, base 94.09)

| monsterDamage | heroHp | measured | singles predict | gap |
|---|---|---|---|---|
| x0.5 | x0.5 | 0 | -80.8 | within noise |
| x0.5 | x1 | 0 | single |  |
| x0.5 | x2 | 0 | 445.2 | -445.2 +/- 194.4 |
| x1 | x0.5 | 13.25~ | single |  |
| x1 | x2 | 539.2 | single |  |
| x2 | x0.5 | 12500 | 92220.0 | -79720.0 +/- 26890 |
| x2 | x1 | 92310 | single |  |
| x2 | x2 | 120000 | 92750.0 | within noise |
<!-- /GEN -->

- **Hero health is a monster damage knob.** Alone on Normal, hero health x2 raises damage taken to 2.16 times the base, and monster damage x2 raises it to 2.10. Health x2 with monster damage x0.5 lands at 1.08. In absolute damage the two are the same lever, because the blow is derived from the health.
- **In share of health they are not the same, and health is the worse one.** On Normal, twice the health leaves the worst low points where they were (minus 0.003). On Dangerous, twice the health takes the lone hammer's low point down by 0.11 and its deaths from 94 to 539 in 1,000 hours. The blows grew with the health, and a piece of food heals what it always healed. More health makes a hero easier to kill.
- **The four's cliff exists, and it is far.** Monster damage x2 alone: no deaths in 320 hero-hours. Hero health x2 alone: none. Both together, 5.1 times the damage taken: 78 deaths in 1,000 hours, and a store bill 1.5 times the base where the singles predict 1.15. Neither single step reaches this edge. One at a time, only the tier blow dial at x2 kills the four at all.
- **Lower health with lower damage is not a way back either.** Halve both and a lone hero takes 0.29 of the damage, not the 0.24 the singles predict, and the lone hammer on Dangerous stops dying.

---

## 11. The feedback loops

Each loop is drawn from measured links. The base numbers are sections 3.2 to 3.4 of the sensitivity page. A link no cell plays is marked UNKNOWN.

### 11.1 Progression, gear, tier, death, XP

```
 hours hunted -> Level and gear -> can the seat stand a harder tier? -> XP an hour -> hours to the next Level
                                         |
                                         no -> it dies there -> XP after deaths at or under zero
```

| Link | Size | Evidence |
|---|---|---|
| A gear state up | Best gear over MID: +4% to +10% XP. MID over LOW: +4% to +27%, largest at Level 30 | MEASURED, base, gear axis |
| A tier up, for a seat that lives | x1.6 to x3.5 XP | MEASURED, base, tier axis |
| A tier up, for the lone hammer | XP before deaths x2.2. XP after deaths x0.33 on Dangerous at Level 60, below zero on Deadly | MEASURED, base |
| Does the seat live | A wall. Lone hammer on Dangerous: 0, 94, 1,120 deaths in 1,000 hours at monster damage x0.9, x1, x1.25 | MEASURED, `oat:monsterDamage` |
| What carries a seat over the wall | Hero damage x1.25: deaths 94 to 13. Mitigation cap x1.1: 94 to 0. Self heal x2: 94 to 14 | MEASURED, `oat:playerAttack`, `oat:mitigationCap`, `fx:damage-heal` |
| Does best gear carry it over | UNKNOWN. The gear axis was played on Normal only | |
| The death price | Scales a loss the wall has already decided (section 8) | MEASURED, `fx:level-death` |

The loop is a positive one with a gate. Power buys a tier, a tier multiplies XP, XP buys power. The gate is the wall, and it stands in a different place for each seat.

- For the four and for the lone Mage the gate is open on every tier today. They run straight to the hardest tier and stay. Their pace is then set by the spawn ceiling and by XP a point of monster health, which are content numbers, not by anything the player owns. Hero damage x2 gives the four on Normal 10% more XP.
- For the lone melee hero the gate is shut one tier up, and the things that open it are small: a tenth more mitigation, a quarter more damage. JUDGMENT: this is where gear ought to matter most, and it is the one place the pass did not play gear. It is the first cell to add.
- The loop has no brake between the gate and the ceiling. Nothing makes the second tier step harder to hold than the first for a seat that holds the first. That is why the four's tier choice has one answer (section 6).

### 11.2 Gold, supplies, survival, gold

```
 gold in (coin and loot a kill) -> supplies bought (food, drinks, runes, arrows) -> the seat survives and casts -> kills -> gold in
            ^                                                                                |
            +------------------------- the store bill comes out here <---------------------+
```

| Link | Size | Evidence |
|---|---|---|
| Who pays | Bow, Mage and Healer pay 35% to 90% of their gold in. The other five ways pay 0% to 13% | MEASURED, base |
| Kills to gold in | In proportion: every lever that moves kills moves gold in by the same share | MEASURED, the matrix |
| Kills to the bill, casters | The bill grows faster than the gold. Best gear costs the Mage gold at every Level: 6,868 to minus 1,569 an hour at Level 30 | MEASURED, base, gear axis |
| Danger to the bill, melee | A wall again. Monster damage x2 raises the lone heroes' store bill by 97%, where x1.1 raises it by under 1% | MEASURED, `oat:monsterDamage` |
| The bill on a harder tier, lone hammer | 104,400 gold an hour of food against about 29,000 of gold in, on Dangerous at Level 60 | MEASURED, base |
| An empty purse ends the hunt | UNKNOWN. The harness never runs out of gold, so this brake is not played | |
| Mana to casts | None. Casts do not move with cost, regeneration or pool (section 3) | MEASURED, `fx:cost-regen`, `oat:heroMana` |

Two different loops share this picture.

- **For a caster it is a tax that grows with success.** More power means more casts, more drinks and runes, and less gold. The sign is the wrong way round for a reward: the Mage is the fastest leveller and the poorest seat, and every upgrade makes both more true. Mana is not the limit on its rotation. Gold is.
- **For a melee hero it is nothing, then a cliff.** On Normal the bill is zero to 13% of gold in. One tier up, the lone hammer eats three and a half times what it earns. In the real game that purse empties and the hunt ends, which is a brake. The simulator does not play that brake, so every net gold number for a seat on the wrong side of the wall is a floor that the real game would not reach. UNKNOWN how soon.
- **The two loops meet at one seat.** The lone melee hero on a harder tier is where the death wall and the gold wall stand, a few percent of monster damage apart. Every lever that touched it in this pass (the armor curve, the tier dial, monster damage, hero health, the mitigation cap) moved deaths and gold together.

### 11.3 Monster health and the pace

Not a loop a player drives. It is one the designers have driven. Monsters were made harder through health. XP is paid per point of health, and kills are held by dead time and respawn, so XP an hour rose (section 2: health x2 is x1.33 to x1.63 XP). The pace then ran ahead of its line and XP a point was cut to give it back. COMPUTED from the source: the comment on `STAT_FORMULA.xp` in `src/data/balance-sheet.js` records that step (health x1.1, levels 4% to 6% faster, XP a point x0.96). The measured elasticity says it will happen again on every health change, in both directions, and by different amounts for a lone hero and a four.

### 11.4 Numbers defined by each other

Four pairs in this build are written so that one is derived from the other. Moving one silently moves, cancels or disables its partner.

| Pair | What happens | Evidence |
|---|---|---|
| Hero health and monster blows | The blow is a share of hero health, so health x2 is damage taken x2.2 | MEASURED, section 10 |
| Armor points, the armor curve and the 60% cap | At home on Normal a MID hero is at the cap, so points and curve do nothing until the cap moves or the attacker out-levels the hero | MEASURED, sensitivity page section 7.3 |
| Hero damage and monster health | One lever on the fight, two on XP | MEASURED, section 5 |
| The attack interval and the stair clock | The engine refuses one without the other | MEASURED, section 4 |

JUDGMENT: these four are the main reason one-lever fixes have cascaded. A lever was moved for its name, and its partner answered.

---

## 12. Which levers cannot be tuned alone

Drawn from sections 2 to 10. "Read together" means the joint reading differs from the single readings by more than noise at steps a designer might take.

| Set | Why | Largest gap measured |
|---|---|---|
| Monster health, respawn, the wait between pulls, hero damage, the attack interval | They are caps in a row on kills an hour. Only the slowest binds, and which one binds differs by seat | 36% on kills |
| Hero damage, monster health | One lever on the fight. Together they are a pure XP multiplier | 24% on kills and XP |
| Hero health, monster damage, the tier blow dial, the armor curve, the mitigation cap | All five move damage taken on the one seat that stands at the death wall | Deaths: 15,400 measured against 4,300 predicted |
| Spell cost, mana regeneration, mana pool | Three dials on the drink bill, which is a difference cut off at zero | 54% on drinks |
| Hero damage, heal size | Their savings overlap | 24% on net gold |
| The attack interval, the stair clock | Refused by the engine | cannot be played apart |

And the ones that can.

| Lever | Why it is safe alone |
|---|---|
| Party XP, tier XP, lone XP, XP a kill | Exact multipliers on XP for the cells they touch. No gap in any grid |
| The Level curve | Moves hours for a Level in proportion and nothing else |
| Coin a kill, what dropped gear sells for | Move gold in and nothing else |
| Store prices (food, drinks, runes) | Move the store bill and nothing else, because the harness buys what it needs at any price. UNKNOWN for a real purse |
| The death price | Moves XP after deaths in proportion to the deaths already there |

The pattern is plain. Every reward lever is clean. Every lever on the fight is tangled with at least four others.
