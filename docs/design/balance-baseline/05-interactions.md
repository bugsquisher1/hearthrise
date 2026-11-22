# Balance baseline 05: the Interaction Analysis

Lane BL-4 (systems engineer, 2026-11-21 and 22). Deliverable 5 of Tyler's directive of 2026-11-21, Phase 5. It stands on `04-sensitivity.md`: the same 68 cells, the same four seeds, the same engine, the same reading of an effect. Read section 1 of that page first.

**The baseline.** `set/v0.2.144` at `861ae52e3` (branch `baseline/overhaul-start`). No gameplay number was changed. Every point is a patch on a scratch copy.

**What this is for.** Evidence of how today's formulas couple, for the lane that picks the new math. Nothing here is graded against an old ruling.

**Labels.** MEASURED (run, seeds, hours), COMPUTED, JUDGMENT, UNKNOWN.

<<FILL:SUMMARY>>

---

## 1. How an interaction is read

An experiment is a full grid over two or three levers, each at two or three levels, large ones included. Every point plays the 68 cells on the base's dice.

For a point that moves several levers, the one-at-a-time reading is what you would predict from the points that move each lever alone: for a rate, the product of the single ratios. The GAP is the measured joint ratio over that product, less one. A gap of zero means the levers can be tuned one at a time. A resolved gap means they cannot: the single readings mislead by that much. The gap is computed seed by seed, so it carries its own error, and it is called resolved by the same rule as an effect (3.18 standard errors at four seeds, and more than 1%).

---

## 2. Monster health with respawn time: the caps on kills

Tyler's example: "Monster HP and spawn rate may both limit kill throughput." The grid is monster health at x0.5, x0.75, x1, x1.5, x2 against respawn time at x0.5, x1, x2. MEASURED, run 44972398698, 14 points, 4 seeds.

<!-- GEN: exp id=hp-spawn groups=party:1,party:4,four:deadly outcomes=killsPerH,levelXpPerH -->
<!-- /GEN -->

What it shows.

- **Three caps stand in a row, and only the slowest one counts.** A hunt's pace is set by the kill time, by the dead time between pulls (the walk and the regroup), and by the respawn. A lone hero is held by the first two: halving the respawn changes its kills by a factor of 1.002, which is nothing. The four on Normal is held by the respawn: halving it gives 1.15 times the kills, and doubling it cuts them to 0.55.
- **The single readings mislead by up to 36%.** Double the health and double the respawn, and the two single readings predict a lone hero at 0.45 of its kills. It measures 0.61. Slow kills hide a slow respawn, because the packs are back before the hero is. The other way, halve the health and double the respawn: predicted 0.86, measured 0.70. Fast kills are wasted when there is nothing to kill.
- **Monster health pays XP. It is a reward lever with a difficulty name.** XP is paid per point of monster health, and kills are held by the other two caps. So doubling health raises XP an hour by 1.33 times for a lone hero, 1.63 times for the four on Normal and 1.27 times for the four on Deadly. Halving it cuts XP to 0.63, 0.55 and 0.64. Every earlier pass that made monsters "a little harder" through health also made every seat level faster, and had to take the XP back somewhere else.
- **Neither lever can be tuned alone.** Any respawn change must be read at the health it will ship with, and on the four as well as alone, because the same number is slack for one and binding for the other.

---

## 3. Spell cost with mana regeneration: is a rotation sustainable

Tyler's example: "Spell cost and mana regeneration may jointly determine whether a combat rotation is sustainable." The grid is spell mana cost at x0.5, x1, x2 against mana regeneration at x0.5, x1, x2. MEASURED, run 44972398698, 8 points, 4 seeds.

<!-- GEN: exp id=cost-regen groups=way:mage,party:4 outcomes=castsPerH,manaPotionsPerH,storePerH,netPerH -->
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

<!-- GEN: exp id=clock groups=party:1,party:4,four:deadly outcomes=killsPerH,takenPerH -->
<!-- /GEN -->

- The stair clock alone moves nothing, because no cell of the pass plays a run ground.
- A coupling held by a validator is the safest kind, because it cannot be broken by accident. It is also invisible in every list of levers. The registry lists the attack interval as one global knob. It is really one knob on the fast side and two on the slow side.
- The attack interval is far from proportional. Halving it (twice the swings, for heroes and monsters alike) raises a lone hero's kills by 19% and its damage taken by 26%. Doubling it cuts kills by 15% and damage taken by 27%. Most of an hour is not swinging.

---

## 5. Hero damage with monster health: one lever for difficulty, and a hidden one for XP

Kill time is damage over health, so the two should be one lever. The grid is each at x0.5, x1, x2. MEASURED, run 44969087150, 8 points, 4 seeds.

<!-- GEN: exp id=damage-hp groups=party:1,party:4,four:deadly outcomes=killsPerH,levelXpPerH,takenPerH -->
<!-- /GEN -->

- **On kills they are one lever.** Double both and kills an hour come back to 1.01 times the base, alone, in the four and on Deadly. Halve both and they come back to 1.02. Whatever the ratio is, the fight is the same fight.
- **On XP they are not.** The same two points pay 2.02 times and 0.50 times the XP, because XP follows monster health. "Scale damage and health together" is a pure XP multiplier that changes nothing about the fight. It is the cleanest pace lever in the build, and nothing names it as one.
- **The single readings are wrong by 13% to 24% at these points,** and by sign as well as size. Read one at a time, damage x2 is worth +28% kills alone and health x2 costs 33%, so together they "should" cost 14%. They cost nothing. This is the dead time again: one-at-a-time readings of a kill time lever are taken against a hunt that is mostly not killing.
- **Damage taken does not come back.** With both doubled a lone hero takes 0.93 of the base, the four 0.70, the four on Deadly 0.65. Fights are the same length, but spells and area damage clear a pull differently when every blow is twice as large against twice the health.

---

## 6. Party XP with tier XP, and the tier a four chooses

The grid is party XP at x0.8, x1, x1.2 against tier XP at x0.8, x1, x1.2. MEASURED, run 44969087150, 8 points, 4 seeds.

<!-- GEN: exp id=party-tier groups=party:1,four:normal,four:dangerous,four:deadly outcomes=netLevelXpPerH -->
<!-- /GEN -->

- **Inside the engine these two do not interact at all.** Every joint point is the product of its two single readings, within noise. Each has an elasticity of exactly 1 on the cells it touches and exactly 0 on the rest: party XP does nothing for a lone hero, and tier XP does nothing on Normal. They are the two cleanest levers in the pass.
- **So the coupling is all in the player's choice, and that choice has enormous slack.** COMPUTED from section 3.3 of the sensitivity page: a four earns 1.6 to 3.5 times as much on Deadly as on Normal and does not die there. Tier XP is worth 25% of that step. Take it away whole and Deadly still pays 1.3 to 2.8 times Normal. No value of tier XP inside this grid, and none down to zero bonus, moves the four off the hardest tier. The four's tier is decided by the pull size and by the fact that it cannot die, not by the XP dial.
- **The same slack means party XP cannot fix the four on Normal.** At Levels 30 and 110 the four earns 0.48 and 0.51 of what its heroes earn alone. Party XP would need x2 to close that, and x2 would also double the four on Deadly, where a head already earns 3.3 to 3.5 times what it earns on Normal. The gap is a spawn ceiling, and an XP multiplier is the wrong shape to close it.
- JUDGMENT: "which four runs which tier" is not a balance question in this build. It has one answer. It becomes a question only if the four can die on the hardest tier, and section 7 shows how far away that is.

<<FILL:EXPERIMENTS>>

<<FILL:LOOPS>>
