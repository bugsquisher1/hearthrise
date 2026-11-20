# Balance program 21: combat and progression

Phase-2 dive, game-designer, `lane/d-balance-combat`, 2026-11-20, on `set/v0.2.143` (c4750e78e and later). 23 systems. Labels as in `01-model.md`: REAL, MEASURED (with the command), CITED, RULED, READ FROM DATA, ASSUMED, PROPOSED. Nothing in the game was changed. Two measuring tools were added: `tools/balance-sim/staged/tohit-ratio.mjs` (the to-hit ratio and the tier dials, played on a planted copy beside today's engine, the same dice) and `tools/balance-sim/staged/spell-ratios.mjs` (what a cast is worth against the monster of its Level, no play).

**Inventory:** no missing system found. One note for the registry: `tank-runes` and `necrotic-storm` both rest on the `replaces` shared cooldown, which is a bar rule, not a spell rule (section B4).

**Played** (`node tools/qa/local-world.mjs serve --port 8795`, a new account, the screen only): sign-up, hero creation, the Mill Cellar to its end at Level 5 (18 minutes with the weekend bonus on), the end card, Blessings, the Thicket on Deadly as a Level 5 tank (dead inside the first minutes, the death popup read). What the play showed is in the cards. **Not played:** an own four (a new account has one hero slot and no gold for a second), so the restart press count in the `hunts` card is counted from the screens and text, and is marked so.

---

## A. Summary

### Verdicts

| Verdict | Count | Systems |
|---|---|---|
| KEEP | 6 | level, weapon-roles, elements, monster-spells, stamina, action-bar |
| FIX | 10 | hunts (the own four's restart only), combat-engine, combat-skills, inner-flame, spells-runes, tank-runes, monsters, difficulty-tiers, grounds-live, death-blessings |
| BUILD | 3 | necrotic-storm (after the spell rule), fists (after the spell rule), grounds-staged |
| HOLD | 4 | regions-4-7, skill-tree, companions, pvp-ctf |
| MERGE, CUT | 0 | |

### The five changes that matter most

| # | Change | Why, in one line | Evidence |
|---|---|---|---|
| 1 | **To-hit becomes a ratio of two ratings**, and monsters are authored against the measured career hero (section B2) | Today the monster sits on its 85% clamp from Level 60 and the hero falls to 55% at 165 and 15% at 240. Defense is worth -29% at Level 10 and 0 from 110. On the ratio every Level from 10 to 400 reads the same 85% and 70%, +10 Defense is worth -14% falling smoothly to -3%, and the staged grounds stop losing gold | MEASURED, `tohit-ratio.mjs formula` and `play` at all eight points |
| 2 | **Every cast is a share of the caster's own blow** (section B5) | A cast is a fixed number times a version that stops at skill 60, and the monster's defense is taken off BEFORE the version multiplies. Frost Lance is 128% of a monster at Level 10, 63% at 60, 32% at 110, 4% at 400. Power Strike, Cleave and Precision Shot are dead buttons by Level 60 (9% of a monster against the hero's own 15 to 20% swing). Greater Mend heals 31% of a hero at 60 and 6% at 400. Two rows already use the right form (Turning Cut, Raking Shot) and hold | MEASURED, `spell-ratios.mjs` |
| 3 | **The harder tiers bite: Deadly's blow dial 1330 to about 1750, Dangerous 1170 to 1400** (section B1) | An in-band four on Deadly never drops under 63 to 70% HP and never dies, so a four 10 to 30 Levels under the ground holds it too and earns 2.4 to 3.3 times the contract at its own Level. That is the whole gap between the harness and real players. With the dial and change 1 the in-band four holds at a 35 to 50% low point and a bigger food bill, and the under-Level four dies | MEASURED, `tohit-ratio.mjs play --deadly-dmg` |
| 4 | **The pace of record for the program is the four's: the lone table divided by 2.3 from Level 10** (section B1) | Tyler ruled the mixed four on Deadly at 2.0 to 2.5 times the contract (2026-11-16) and it measures 1.8 to 2.6 in band. The table (Level 50 in 165 h) is the lone hero on Normal, 9% of real hours. Every other dive should count weeks and prices on Level 50 at about 75 hunted hours, 110 at about 310, 185 at about 665 | RULED + MEASURED + REAL |
| 5 | **A bar budget: one offense lane, a family's rows fill at most 0.85 of it, a new row replaces one** (section B4) | The sword has 0.83 of its lane filled, the tank 0.58, two axes 1.25. That spare lane is exactly why Brand and Reave measured +13 and +29% for a sword and +3 to +9% for a wand | READ FROM DATA + CITED |

### Answers to the Coordinator's two asks

**The pace (question 1 and the 72 against 165 hours).** Neither the table nor the four is wrong. They are two different players, and the gap between "1.8 to 2.6" and "2.9 to 3.0" is three things, each measured: section B1.

**The Morrow Hills pack gate (`four-xp` 0.83 and `feel-seat-below-solo` on NORMAL at Carter's Rest and the Ox Road).** **The fix is the party rule in the gate, not the grounds' numbers.** Both lines grade a four on Normal against `party.fourVsSolo` 1.15 to 1.25 (RULED 2026-10-25), and Tyler replaced that on Normal on 2026-11-16: "normal isn't meant for parties anyway", parties are "not restricted, but it's not necessarily meant for them", a party seat may earn under solo there, and "the every seat above solo rule applies on Dangerous/Deadly only". The grader still reads the old line (`tools/balance-sim/grade-sheet.mjs:25` `tiers: ['normal']`, `grade.mjs:345` "a party seat on Normal"). MEASURED here, a four a head on Normal against the lone hammer on Normal: Glade 0.54, Hask's Ford 0.62, Pyre Field 0.72, Krell's Hold 0.68, Carter's Rest 1.03 (0.65 of the lone Mage). Carter's Rest is the kindest ground in the game to a Normal four, not the worst, so tuning it up to 1.15 would make the Morrow Hills the one place Normal is a party tier and would lift its Dangerous and Deadly (already 1.66 and 1.84 times the contract) with it. The change: `four-xp` and `feel-seat-below-solo` move to Dangerous and Deadly ("a mixed four a head is at or over the same four heroes alone on that tier", which `party-tier-xp.mjs` already measures), with one ceiling, at most 2.5 times the contract at the hero's own Level. On Normal both become report lines. Not verified by me: that the two Morrow grounds pass the moved lines on Dangerous (the Coordinator's run says Deadly passes; my numbers above agree for Carter's Rest). If the live grounds pass `four-xp` on Normal today I could not see why from my numbers, and that is worth one look for a waiver.

### Tyler rules on

1. **To-hit as a ratio.** Recommend: yes, as section B2 (stats against stats, monsters authored against the measured career hero, a base rating of 20 so early Defense is not a doubling). Alternative: keep the straight line and move the clamps again, which is the patch we have already made four times.
2. **How hard a same-Level monster lands on the ratio.** Recommend: 70% on the career hero, as the formula has always said. It makes a lone hero on Normal take 15 to 22% less than today at Levels 50 to 105 (today everyone is on the 85% clamp), which puts Normal back inside its own ruled band (low point 60 to 80%) and makes the Morrow grounds pay. Alternative: 78 to 80% (not measured), which keeps about today's damage on Normal and loses those two things.
3. **The harder tiers bite.** Recommend: Deadly's blow 1330 to about 1750 and Dangerous 1170 to 1400, sized so an in-band four holds Deadly at a 35 to 50% low point with no steady deaths and a four 10 Levels under dies about once in two to four hours. Alternative: leave the tiers and add a Level door to each ground (band floor minus 5), which is simpler and goes against "the band is a guide, nothing more".
4. **Which pace the game is built to.** Recommend: keep the 2026-11-16 ruling (a mixed four on Deadly at 2.0 to 2.5 times the contract, still the best way to level), make the model's cap 2.5 and not 2.0, and count the whole program in the four's hours (Level 50 at about 75 h, not 165). Alternative: hold the four to 2.0 and re-fit the Level curve from Level 16 so the four reaches 50 in about 110 h, which slows the real player by a third again after three XP cuts in a fortnight.
5. **Every cast as a share of the caster's own blow.** Recommend: yes, one rule for damage casts, heals and shells, the five versions kept as the step between rune tiers (section B5). Alternative: add versions VI to X at skills 75 to 135, which moves the cliff from Level 110 to about Level 300 and keeps a second growth law to balance for ever.
6. **The bar budget.** Recommend: a family's offense rows fill at most 0.85 of the one offense lane and every new offense row names the row it shares a cooldown with. Necrotic and Storm then ship as a choice of element, at +5% for one and +10% for both at most. Alternative: let new spells add to the bar and cut kill XP each time, as on 11-19 (twice).
7. **Training past the career line.** Recommend: leave the flat rate you ruled, and say plainly what it is for: bringing a new or neglected skill up (a back-row Defense, a hero that changed weapon), never a power buy past skill 50. One skill level at 82 costs 83 yard hours for +0.6% damage. Alternative: a rate that grows with the skill, which turns the yard into the cheapest gold-for-power offer in the game.
8. **Blessings.** Recommend: all three cost about three hours of a lone hero's net gold at its Level (about 34,000 at 50 and 63,000 at 105, against 2,250 at 70 today), free under 30 as now, so a player on Normal can skip them and a player on Deadly pays. Alternative: keep today's price and accept that Blessings are a tax nobody notices (6,345 gold spent by all real players, ever).
9. **Inner Flame.** Recommend: keep the skill and the lore, remove the bench hours: bones burn by a loot rule set once ("burn at the Hearth", beside "sell" and "keep"), no hero time, same XP a bone. Alternative: cut the skill and fold bones into Hearth Cinders.
10. **Fists and the sword ways.** Recommend: fists ship only after the spell rule of item 5 (their strikes are already "a share of own blow" rows and their heal is a share of max HP, so they are the one family that needs no rework), on the scoped promise already ruled. No change to the sword ways (slow alone on purpose, 0.85 to 0.96 of the hammer, measured). Alternative: none offered.

---

## B. The nine questions

### B1. The pace, the Deadly four, and where "struggle or pay" shows up

**What was asked.** The reference table shows a Deadly four at 1.8 to 2.6 times the pace contract with no death from Level 30 to 118, real players measure 2.9 to 3.0, and Level 50 comes in 72 hunted hours against the table's 165. Which is wrong, and which lever gives way?

**What is ruled** (the model's 2.0 cap is PROPOSED; these are RULED and newer): a mixed four on Deadly lands about 2.0 to 2.5 times the pace contract and is "still the best way to level" (2026-11-16); Normal "isn't meant for parties"; one difficulty for every group (11-08); outside your weight class "you're gonna waste money but get more exp and possibly die a few times" (11-06); no Level penalty and no Level read in a blow (11-04, 11-18); "they should be struggling more than they are, if they aren't dying at all they should likely be wasting money" (11-19, a direction).

**The rerun** (MEASURED, `node tools/balance-program/measure.mjs what --at slake|pyre|hold --seat four --patch '{"level":N}' --hours 2 --seeds 2`, and `tohit-ratio.mjs play --seat four --at ford --level 40 --hours 2`). The real four did not stand where the reference points are. It hunted the Slake at 47 to 63, Pyre Field at 60 to 72 and Krell's Hold at 69 to 79: 5 to 31 Levels under the point, and 6 to 16 under the ground's own band floor.

| Ground | Four at the reference Level | x contract | Four at the real Level | Level XP an hour | x contract at its OWN Level | Damage taken | Deaths (16 hero-hours) | Low HP p10 | Real players |
|---|---|---|---|---|---|---|---|---|---|
| Hask's Ford | 50 | 2.62 | 40 | 500,079 (0.94 of the Level 50 four) | **3.29** | x1.56 | 0 | 45% | hardly played |
| The Slake | 60 | 2.33 | 55 | 560,767 (0.95) | **2.46** | x1.34 | 0 | 63% | 4.89 (52 h, tier not recorded, THIN) |
| Pyre Field | 80 | 1.87 | 66 | 622,758 (0.90) | **2.16** | x1.23 | 0 | 50% | 2.96 |
| Krell's Hold | 105 | 1.80 | 74 | 810,246 (0.86) | **2.43** | x1.30 | 0 | 41% | 3.09 |

So the answer to "which is wrong":

1. **The table is right for what it is**: one hero, alone, on Normal. Real lone play sits at 0.9 to 1.4 of it (REAL). It describes 9% of real hours.
2. **The four in band is where Tyler ruled it**: 1.76 to 2.62 (MEASURED) against "about 2.0 to 2.5". Hask's Ford is the one ground over (2.62 on Deadly, 2.46 on Dangerous, and a lone Mage on its Dangerous reads 3.97): its XP fit is high, a ground number.
3. **The real four is over the ruling for three measured reasons.** (a) It hunts 10 to 30 Levels under the ground on Deadly, loses only 5 to 14% of the XP, and is then measured against a smaller contract: 2.2 to 3.3 on today's engine. (b) Its hours were played before 2026-11-19, when a kill's XP was cut twice (x0.96, x0.88): x1.18 on everything older. 2.43 x 1.18 = 2.87 against the real 3.09 on Krell's Hold; 2.16 x 1.18 = 2.55 against 2.96 on Pyre Field. (c) The Slake's 4.89 is not reproduced (2.46): 52 hours, one person, tier not recorded, before the 11-16 and 11-17 HP dials. THIN, and I would not tune to it.

**Why hunting under Level costs nothing.** A hero's power barely reads its Level: 10 Levels are +100 HP, about +5 skill and sometimes one gear tier. A monster's blow is 22% of a same-Level hero's HP, so to a hero 10 Levels under it is 26%. Today's to-hit hides even that (both heroes are on the 85% clamp). And the in-band four on Deadly has twice the room it needs: its low point is 63 to 70%. So the same four holds Deadly a whole ground early. "Much higher risk" is what the hunt card says at 31 Levels under (read in play); the risk is not there.

**Which lever gives way.** Not XP: it has been cut three times in two weeks, and each cut slowed the lone hero on Normal as much as the four. The lever is the danger of the two harder tiers, sized on the party that actually plays them.

MEASURED (`tohit-ratio.mjs play --seat four --at <point> --level N --hours 2 --deadly-dmg D`, 2 seeds x 2 h = 16 hero-hours a cell; "ratio" = change 1 planted):

| Deadly blow dial | Engine | Ford, four at 50: low point / deaths / store bill | Ford, four at 40 | Krell, four at 105 | Krell, four at 74 |
|---|---|---|---|---|---|
| 1330 (today) | today | 68% / 0 / 13,612 | 45% / 0 / 12,786 | 63% / 0 / 26,240 | 41% / 0 / 31,169 |
| 1330 | ratio | 66% / 0 / 14,426 | 45% / 0 / 13,044 | 61% / 0 / 27,481 | 36% / 0 / 33,530 |
| 1600 | today | 56% / 0 / 16,028 | 34% / 0 / 16,342 | 52% / 0 / 28,890 | 25% / 4 / 39,841 |
| 1600 | ratio | 50% / 0 / 16,994 | 30% / 2 / 19,066 | 49% / 0 / 30,428 | 17% / 13 / 44,441 |
| 1900 | today | 40% / 0 / 18,288 | 20% / 14 / 22,968 | 39% / 0 / 33,521 | dead (92) |
| 1900 | ratio | 37% / 0 / 20,031 | 12% / 30 / 27,491 | 35% / 0 / 36,918 | dead (165) |
| 2200 | ratio | 26% / 1 / 25,235 | dead (173) | | |

Level XP an hour does not move with the dial for a four that holds (Ford 522k to 535k in every row): the dial is pure danger and food.

Dangerous leaks the same way (MEASURED, `--tier dangerous`): a four at 40 on Hask's Ford's Dangerous earns 2.98 to 3.05 times its contract with a 61% low point and +3,800 gold an hour. At a dial of 1400 on the ratio its low point is 42%, still no death in 16 hero-hours, +1,400 gold.

**The proposal** (PROPOSED), and the 1750 dial played on the ratio (MEASURED, `tohit-ratio.mjs play --seat four --engines ratio --deadly-dmg 1750 --at <point> --level N --hours 3`, 24 hero-hours a cell):

| Four on Deadly at 1750, ratio | Level XP an hour | x contract at its own Level | Low HP p10 | Deaths in 24 hero-hours | Store bill a head (today) |
|---|---|---|---|---|---|
| Ford, at 50 | 522,026 | 2.58 | 42% | 0 | 18,142 (13,612) |
| Ford, at 40 | 487,895 | 3.21 | 22% | **9** | 23,353 (12,786) |
| Slake, at 60 | 588,214 | 2.31 | 49% | 0 | 20,346 (15,221) |
| Pyre Field, at 80 | 678,890 | 1.84 | 44% | 0 | 30,044 (24,009) |
| Krell, at 105 | 927,165 | 1.78 | 40% | 0 | 33,129 (26,240) |
| Krell, at 74 | 799,489 | 2.40 | under 0 | **101** | 50,343 |

In band: a 40 to 49% low point, no death in 24 hero-hours, a store bill 25 to 33% higher. Ten under on Hask's Ford: a death every 2.7 hero-hours. Thirty-one under on Krell's Hold: not playable. That is the target. A death rate for the in-band four (about one in 30 to 100 hours is the aim) needs a longer sample than this before the build, 4 seeds x 8 h.


- Deadly's blow dial 1330 to **about 1750**, Dangerous 1170 to **1400**, with change 1. Three sheet lines replace `tiers.deadly.fourDeathsPer16hMax: 9`: an in-band well-built four on Deadly has a low point (p10) of 35 to 50% and its store bill is at least its coin; the same four 10 Levels under the band floor dies at least once in 16 hero-hours on Deadly; on Dangerous its low point is 45% or less.
- Hask's Ford's XP fit comes down so its harder tiers read 2.2 or less (a ground number, section C `grounds-live`).
- The hunt card's risk words read the server's measured line for the party's Level, not a fixed sentence.
- What is deliberately left: a four that goes under Level on **Dangerous** still earns more than its own ground pays (about 2.3 times at Krell's Hold, about 3.0 at Hask's Ford until its fit moves) at a thin profit and a low point near 40%. That is the 11-06 ruling as written (more XP, wasted money, a death now and then) and it is now a struggle. Closing it completely needs a Level door or a Level read in XP, and both are ruled out.

**Where "struggle or pay" shows up, after:** the in-band four on Deadly pays 25 to 40% more at the store (Ford 13.6k to about 19k, Krell 26k to about 34k a head an hour) and spends its hunts between a third and a half of its HP, where an unlucky pull kills; the under-Level four dies on Deadly and scrapes on Dangerous; the lone hero on Normal is easier than today (change 1), which is where the New player dies 8.9 times in 100 hours.

**The pace of record for every other dive** (PROPOSED, from RULED 2.0 to 2.5 and MEASURED 1.8 to 2.6: the lone table from Level 10, divided by 2.3):

| Level | Lone table, hunted hours | **The four, hunted hours a hero** | Real median | Own four, 3.3 h a day | Heavy four, 8.4 h a day | Ceiling, 24 h a day |
|---|---|---|---|---|---|---|
| 10 | 6 | 6 | 5.6 | day 2 | day 1 | day 1 |
| 25 | 36 | 19 | 24 | day 6 | day 3 | day 1 |
| 50 | 168 | **76** | 72 | day 23 | day 9 | day 4 |
| 75 | 384 | **170** | 113 (under Level on Deadly, old kill XP) | day 52 | day 21 | day 8 |
| 110 (end of live content) | 708 | **311** | none | day 94 | day 37 | day 13 |
| 185 (end of staged content) | 1,518 | **663** | none | day 201 | day 79 | day 28 |
| 200 | 1,680 | **734** | none | day 222 | day 87 | day 31 |

Read with it: the real player past Level 50 has been about a third faster than this line, and change 3 is what brings it onto the line. The Bonus XP weekend (+25%, 3 days in 14) sits on top of everything and takes a four to about 3.1 on those days: for the retention dive.

### B2. To-hit as a ratio

**Today** (`src/core/combat.js`): a hero lands `0.55 + (skill + worn accuracy - monster defense) x 0.01`, held to 15 to 95%. A monster lands `baseAcc + (atk - Defense - guard) x 0.02`, held to 5 to 85%. `STAT_FORMULA` writes a monster against a hero whose every skill equals its Level. No hero has that: the career hammer holds Melee 60 and Defense 45 at Level 60, 82 and 67 at 110, about 97 and 82 at 165 (the skill cost multiplies by 1.04 a level, so skill is roughly the logarithm of hours). A straight line in points therefore runs off both ends.

**The form** (PROPOSED; the shape Old School RuneScape and Melvor Idle use for their accuracy rolls, mechanics only):

```
chance(attack, defense) = attack >= defense ?  1 - defense / (2 x attack)  :  attack / (2 x defense)

a hero's blow      attack  = 20 + its weapon skill + worn accuracy        defense = the monster's WARD
a monster's blow   attack  = the monster's AIM                            defense = 20 + Defense + guard
```

- **Stats against stats.** Nothing reads the hero's Level. The 20 is a flat rating every body has, so +10 Defense at Level 10 is not a doubling.
- **A monster's two ratings are authored**, like its HP, from its own Level against the reference hero of that Level: `aim = (20 + refDefense(L)) / (2 x (1 - hit))`, `ward = 0.30 x (20 + refMain(L) + refAccuracy(L)) x its role's armor`. `hit` is what `STAT_FORMULA.hit` already says (0.40 on a gentle ground to 0.70 on a full one, times the role), and 0.30 makes the reference hero land 85%. A tier's harder blow raises the aim exactly as it raises `atk` today.
- **The reference hero is the measured career line** (`tools/balance-sim/skill-lines.json`, the lone hammer), written into `core-model.js` as a generated table with a guard, and re-measured when the pace moves. Because the form is a ratio, a reference that is 5% off moves a chance by about 1.5 points. It degrades; it never hits a wall.
- **Spells still always land.** Their price is mana and runes. The caster gap is a matter for the ways (B5), not for a second roll.
- No clamp is reached anywhere from Level 10 to 400. The 5 and 97% rails stay as safety.

**By the formulas** (MEASURED, `node tools/balance-sim/staged/tohit-ratio.mjs formula`; a same-Level regular on a full ground; "9 under" is a real own-four hero, `10-real-players.md` section 3; the back row holds Defense 15):

| Level | Career Melee / Defense | Hero to-hit today: career / 9 under | On the ratio | Monster to-hit today: career / front 9 under / back row | On the ratio | +10 Defense, damage taken: today / ratio | +10 main skill, to-hit points: today / ratio |
|---|---|---|---|---|---|---|---|
| 10 | 21 / 11 | 78% / 69% | 85% / 81% | 68% / 85% / 60% | 70% / 79% / 66% | -29% / -14% | 10.0 / 2.8 |
| 30 | 40 / 26 | 95% / 88% | 85% / 83% | 78% / 85% / 85% | 70% / 76% / 77% | -26% / -9% | 0 / 1.9 |
| 60 | 60 / 45 | 95% / 93% | 85% / 84% | **85%** / 85% / 85% | 70% / 74% / 84% | -6% / -7% | 0 / 1.4 |
| 110 | 82 / 67 | 88% / 79% | 85% / 84% | 85% / 85% / 85% | 70% / 73% / 88% | **0** / -5% | 7.0 / 1.0 |
| 165 | 97 / 82 | **55%** / 46% | 85% / 84% | 85% / 85% / 85% | 70% / 73% / 90% | 0 / -4% | 10.0 / 0.9 |
| 240 | 110 / 95 | **15%** / 15% | 85% / 84% | 85% / 85% / 85% | 70% / 72% / 91% | 0 / -4% | 0 / 0.9 |
| 400 | 129 / 113 | 15% / 15% | 85% / 84% | 85% / 85% / 85% | 70% / 72% / 92% | 0 / -3% | 0 / 0.8 |

Both populations of `10-real-players.md` are in the table: the front seat (Defense about its main skill, a few under the line) is hit 72 to 79%, and the back row (Defense 15) 66% at Level 10 rising to 92% at 400. Today both are simply 85% from Level 30.

**In play, before and after, all eight points** (MEASURED, `node tools/balance-sim/staged/tohit-ratio.mjs play --seat lone` and `--seat four`, 2 seeds x 1 h, paired dice, an hour a head; the tier dials as today):

| Point | Lone hammer, Normal: Level XP today / ratio | Damage taken | Net gold | Low HP p10 | Four on the hardest tier: Level XP today / ratio | Front seat taken | Low HP p10 | Deaths |
|---|---|---|---|---|---|---|---|---|
| thicket 10 | 29,312 / 29,533 | 2,783 / 2,688 | 4,260 / 3,942 | 94 / 94% | 15,121 / 15,121 | 2,674 / 2,937 | 89 / 89% | 0 / 0 |
| glade 30 | 104,610 / 101,590 | 14,976 / 17,038 | 10,512 / 10,037 | 83 / 80% | 185,301 / 182,470 | 13,624 / 23,009 | 86 / 76% | 0 / 0 |
| ford 50 | 245,472 / 244,410 | 33,633 / 27,436 | 11,342 / 11,730 | 70 / 76% | 530,145 / 523,247 | 67,216 / 78,596 | 68 / 66% | 0 / 0 |
| slake 60 | 264,803 / 258,370 | 40,254 / 34,850 | 12,504 / 12,436 | 73 / 75% | 593,257 / 586,153 | 74,693 / 95,185 | 70 / 67% | 0 / 0 |
| pyre 80 | 432,580 / 424,018 | 66,186 / 53,975 | 23,425 / 22,329 | 61 / 66% | 687,998 / 675,808 | 121,719 / 139,564 | 64 / 60% | 0 / 0 |
| hold 105 | 551,118 / 543,542 | 73,186 / 57,374 | 21,085 / 22,166 | 59 / 68% | 938,150 / 920,033 | 148,795 / 163,917 | 63 / 61% | 0 / 0 |
| rest 118 (staged) | 530,075 / 573,888 | 112,792 / 85,353 | **-2,989 / +14,364** | 40 / 46% | 1,108,041 / 1,112,996 | 205,896 / 228,364 | 54 / 49% | 0 / 0 |
| catacombs 175 (staged) | 822,471 / 936,658 | 166,886 / 118,612 | **-25,788 / +18,624** | 36 / 47% | 1,383,744 / 1,413,252 | 382,574 / 405,453 | 33 / 30% | 0 / 1 |

What it does, in words:

- **Level XP moves by 3% or less on every live ground**, alone and in a four. No pace re-fit is needed for the change itself.
- **Alone on Normal a hero takes 15 to 22% less from Level 50 to 105**, because today it is on the 85% clamp and the formula always meant 70%. Its low point returns to 66 to 76%, inside the ruled Normal band of 60 to 80% (today 59 to 61% at Pyre Field and Krell's Hold, under the band).
- **The staged grounds turn from a loss to a profit for melee**: Carter's Rest -3.0k to +14.4k an hour, the Catacombs -25.8k to +18.6k, and the Catacombs' lone hammer goes from 0.82 to 0.94 of the contract. This is the first audit's "the Morrow door stops paying melee", closed by the form and by no hand dial.
- **A four's front seat takes 10 to 69% more on the harder tiers** (the tier's harder blow raises the aim past where today's clamp stopped it). That is the direction of change 3 and is counted inside it.
- **Training Defense stops being the best buy in the game** (MEASURED, `--bump 10 --seat lone`): +10 main skill and +10 Defense cut damage taken by 36% at the Glade, 24% at the Slake and 0% at Krell's Hold today; on the ratio 13%, 11% and 3.5%. That is the 11-18 "definitely NOT intended" fixed with stats against stats and nothing on the training side.

**What the endgame and home dives should re-measure on it:** the Tower's curve (its heat was carrying what the clamp broke; expect to delete most of it), the yard's value (+10 Defense is now worth 14% at Level 10 and 5% at 110), the Catacombs four on Deadly (at a 1600 blow dial it dies 17 to 33 times in 8 hero-hours: its own tier row needs sizing against this, it is already at a 33% low point).

**What it retires** (CITED, the first audit's change 1, confirmed): `def.past`, `ACC_DEF_MUL`, `monsterDamageScaleByTier`'s role as a to-hit patch, the held Defense rework, the next "Mage at N" row, most of the Tower's heat.

**Cost to build:** one function in `src/core/combat.js`, two generated fields a monster row (`tools/gen-ground-stats.mjs`), the reference table and its guard, the catalogue apply and the edge deploy (Lane C, a combat-engine change: batched by the world-tick parity rule). No new statement, write or ledger row. Every ground is re-graded once.

### B3. What a combat skill level is worth, and training past the career line

The skill curve is `15 x s^2 x 1.04^(s-1)` XP for level s (READ FROM DATA, `SKILL_CURVE`). The yard pays a flat 30,000 skill XP an hour for a fee of 50 + 6 x the skill's level, and a training item doubles it for 12 or 24 hours at 250,000 or 450,000 gold (RULED 2026-11-14: one flat rate, never stamina).

| Level | Career main skill | One more level costs (XP) | Hours of hunting for it (main skill XP an hour, MEASURED ref) | Hours at the yard | Yard gold for it | What it gives: damage (max hit) | To-hit points, today / ratio | A Defense level, damage taken, today / ratio |
|---|---|---|---|---|---|---|---|---|
| 10 | 21 | 14,500 | 0.9 | 0.5 | 85 | +1.9% | 1.0 / 0.3 | -3.4% / -1.5% |
| 60 | 60 | 546,000 | 11 | 18 | 7,400 | +0.8% | 0 / 0.14 | -0.6% / -0.7% |
| 110 | 82 | 2.5M | 33 | 83 | 45,000 | +0.5% | 0.7 / 0.10 | 0 / -0.5% |
| 240 | 110 FORMULA | 13.0M | about 130 | 435 | 310,000 | +0.46% | 0 / 0.09 | 0 / -0.4% |
| 400 | 129 FORMULA | 37.9M | about 300 | 1,260 | 1.0M | +0.45% | 0 / 0.08 | 0 / -0.3% |

(MEASURED: `measure.mjs curves`, `tohit-ratio.mjs formula`, `xp.js skillXpForLevel`. The hunting hours past 105 are ASSUMED at 100k to 125k main skill XP an hour.)

**Answers.**

- A skill level is worth about 2% of a hero's damage at Level 10 and half a percent from 110 on, and costs 0.9 hunted hours at 10, 33 at 110 and about 300 at 400. Past about skill 85 a hero gains a skill level less often than five Levels. That is Tibia's shape and it is fine: the skill becomes a slow second number a veteran is proud of. It is NOT a power source to budget past Level 110, and the grounds past Krell's Hold must not be authored as if it were (that is what change 1's reference hero fixes).
- **Is there a reason to train past the career line? As a power buy, no, from about skill 50.** Ten yard hours at skill 60 buy half a level. A 250,000 gold training item buys 1.3 levels at skill 60 (+1.0% damage) and 0.3 at 82. Tempering's five rungs are +3% for less.
- **What training is for** (and it does this well): (a) a skill a hero never trained. A back-row Defense from 15 to 40 is 33 yard hours; a hero that changes weapon (4 of 12 real heroes did) reaches skill 50 in a new way in 89 yard hours, or 44 with an item. (b) Idle hero life: 59% of real hero hours are idle, and "Train Melee at the yard" is already a remembered after-hunt plan (read in play), so it costs no press.
- On the ratio the yard's early value stops being broken: 12 yard hours of Defense at Level 24 take a lone hero from about 26 to 33, which is -18% damage today and about -6% after.
- **Recommendation:** keep the flat rate and the curve. Say on the yard's own screen what a level costs at the hero's skill ("next level: 18 h here, 11 h hunting"), so nobody buys a 250,000 gold item at skill 70 expecting power. For the economy dive: the yard's gold-for-power rate is 7,400 gold and 18 town hours for +0.8% damage at skill 60, far worse than Tempering, which is the right way round.

### B4. The bar budget

Twenty slots, three ability lanes and a supply lane (READ FROM DATA, `abilities.js ABILITY_LANES`): offense 2 s, support 2 s, heal 1 s, food and drink 2 s. A basic blow swings every 2 s beside them. So in any 2 seconds a hero lands at most one swing, one offense cast, one support cast, two heals and one supply. The slots are not the budget. **The offense lane is.**

A family's offense rows fill its lane by the sum of 2 s over each cooldown (READ FROM DATA):

| Family | Offense rows (cooldown, s) | Lane filled | Note |
|---|---|---|---|
| Sword and shield (tank) | Flame Strike 8, Power Strike 6 | 0.58 | low on purpose (RULED 11-19) |
| Sword alone | + Turning Cut 8 | 0.83 | |
| Two axes | Power Strike 6, Turning Cut 8, Cleave 6, Rend 6 | **1.25** | already more rows than lane |
| Club or hammer | Power Strike 6, Turning Cut 8, Cleave 6 | 0.92 | |
| Bow, crossbow | Flame Volley 10, Precision Shot 6, Raking Shot 8 | 0.78 | |
| Wand | Fireball 8, Frost Lance 6, Hoarfrost 10 | 0.78 | |
| Staff | Green Sickness 10, Undertow 20 | 0.30 | low on purpose (the Healer) |

This is exactly the 6b sample's result (CITED, `lane/d-elements-6b`): Brand and Reave gave a lone sword +12.8% and +29.2% because a sword has spare lane and the tank more; a wand got +2.7% and +8.5% because it has little.

**The budget** (PROPOSED):

1. A family's offense rows fill at most **0.85** of the lane (the tank 0.6 and the Healer 0.3 by ruling). Two axes come down to it: one of their four rows leaves the list. They cannot fire all four on one lane today, so nothing is lost in play.
2. A new offense row names the row it **replaces** (shares its cooldown with; the engine already has `replaces` for Brand and Reave). On a neutral monster it lands within 5% of the row it replaces; on a weak one up to +15%; on a resistant one down to -25% (CITED, the first audit's change 3).
3. Support and heal rows are budgeted by what they prevent, in monster blows a minute (B5), never by kill speed. A tank spell that raises a lone tank's kills is out by rule (RULED 11-19).
4. A gear perk that adds a cast is an offense row and obeys 1 and 2.

So "what does a new spell replace": the same family's row of the same shape (single target for single target, area for area). The decision a player gets is which element to slot for this ground, once, kept in the ground's remembered setup.

### B5. Spells, spell ratios, the eight ways and fists

**How a cast is priced today** (READ FROM DATA, `src/core/hunt/abilities.js`, `damage.js hurt`): the row's roll (Frost Lance 12 to 18), minus the monster's defense reduction (3% of its defense), THEN times the version (I to V at skill 1 / 15 / 30 / 45 / 60: x1.00, 1.74, 2.52, 3.31, 4.10) plus 1% a skill level. A store rune lands 75%. Gear does not touch it. Two rows instead take a share of the hero's own largest blow (Turning Cut 60%, Raking Shot 80%).

**What that does from Level 10 to 400** (MEASURED, `node tools/balance-sim/staged/spell-ratios.mjs`; one cast as a share of a same-Level regular's HP; heals and shells as a share of the caster's HP / of one monster blow):

| Cast | 10 | 30 | 60 | 110 | 165 | 240 | 400 |
|---|---|---|---|---|---|---|---|
| The hammer's own swing (average, landed) | 32% | 25% | 20% | 15% | 7% | 1% | 1% |
| The wand's own bolt | 36% | 29% | 26% | 20% | 14% | 10% | 3% |
| Frost Lance (wand, 6 s) | 128% | 76% | 63% | 32% | 20% | 12% | 4% |
| Fireball (wand, area, 8 s) | 81% | 48% | 40% | 18% | 11% | 5% | 1% |
| Flame Strike (sword, 8 s) | 93% | 55% | 46% | 22% | 14% | 7% | 2% |
| Flame Volley (bow, area, 10 s) | 59% | 35% | 30% | 12% | 7% | 2% | 1% |
| Power Strike (every melee, 6 s, no versions) | 43% | 17% | **9%** | 4% | 2% | 1% | 0% |
| Cleave, Precision Shot (no versions) | 37 to 41% | 15 to 16% | **8 to 9%** | 3 to 4% | 2% | 1% | 0% |
| Rend's hit (axes) | 25% | 15% | 13% | **2%** | 2% | 1% | 1% |
| Turning Cut (60% of own blow) | 20% | 17% | 14% | 10% | 7% | 5% | 2% |
| Raking Shot (80% of own blow) | 30% | 23% | 19% | 14% | 10% | 7% | 4% |
| Greater Mend (staff) | 39% / 182% | 33% / 147% | 31% / 142% | 20% / 89% | 14% / 63% | 10% / 46% | 6% / 29% |
| Circle of Renewal (party) | 20% / 91% | 16% / 74% | 16% / 71% | 10% / 44% | 7% / 32% | 5% / 23% | 3% / 15% |
| Shelter (tank, party shell) | 23% / 108% | 19% / 87% | 19% / 85% | 12% / 54% | 8% / 38% | 6% / 28% | 4% / 18% |
| Mend (everyone, no versions) | 11% / 50% | 7% / 30% | 4% / 19% | 3% / 13% | 2% / 9% | 2% / 7% | 1% / 5% |

Four findings:

1. **Every fixed-number cast is strongest at Level 10 and decays from there.** The spell ratio is not a ratio: it is a number, against a monster whose HP grows 1.76 a Level for ever. Version V at skill 60 is the last step, so the whole kit is frozen at Level 60 while the monster grows 6.4 times to Level 400.
2. **The defense reduction is taken off before the multiplier.** At Level 110 it is 2 points off a base of 7 to 18, at 240 it is 5, at 400 it is 9: Fireball's 7 to 12 becomes 1 to 3 before anything multiplies. That alone removes a third of a caster's damage by 165 and nearly all of it by 400.
3. **Rows without versions are dead by Level 60.** Power Strike is the first skill every melee hero is given (slot 2 of the start bar, read in play) and it is worth less than half a swing at 60 for 6 mana.
4. **Heals and shells fall the same way.** A monster's blow is 22% of a hero's HP at every Level; Greater Mend covers 1.4 blows at 60, 0.9 at 110, 0.3 at 400. The Healer stops being able to hold a tank somewhere past 165 whatever it wears.

The melee swing's own collapse (20% to 1%) is the to-hit clamp (B2) and the missing weapon line past tier 7 (RULED 11-16: weapons past Dawnsteel grow about x Level / 110; staged, the items dive's).

**The rule** (PROPOSED): **a cast is a share of its caster's own blow.**

- Every damage row becomes `hitPm`, a share of the caster's largest blow with the weapon in hand, the form Turning Cut and Raking Shot already use. The defense reduction is taken once, off the blow, as for a swing. The five versions stay as the step a rune tier buys (x1.0, 1.15, 1.3, 1.45, 1.6, PROPOSED), so runes still matter and Magic still gates them.
- Heals and shells read the caster's blow the same way (Greater Mend about 4.5 blows of the staff, sized to today's Level 60).
- The opening sizes are today's Level 30 to 60 values, so nothing live moves much on the day: Frost Lance 2.4 swings, Fireball 1.5 a target, Flame Strike 3.0, Power Strike 1.2 (up from 0.45: it becomes a button again), Cleave 1.0 a target, Precision Shot 1.2, Flame Volley 1.1 a target.
- Then ONE thing grows a hero's output: its max hit, which is its skill and its weapon. The items dive owns the only growth law past Level 110 (the weapon line), and the caster, the bow and the hammer all ride it. The Level 10 one-shot goes too (Frost Lance is 128% of a wolf).

**The eight ways** (MEASURED, `measure.mjs what --at <point> --seat lone --patch-file tools/balance-sim/staged/ways.patch.json`, Normal, 2 seeds x 1 h; x the lone hammer; net gold with every supply bought at the store):

| Way | Level XP x hammer: 10 / 30 / 60 / 105 | Damage taken x hammer | Net gold an hour: 10 / 30 / 60 / 105 | Verdict |
|---|---|---|---|---|
| Hammer (the unit) | 1.00 | 1.00 | 4,260 / 10,512 / 12,504 / 21,085 | |
| Sword and shield | 0.85 / 0.90 / 0.96 / 0.85 | 0.63 / 0.69 / 0.67 / 0.99 | 3,002 / 6,544 / 9,684 / 11,447 | slow on purpose (RULED 11-19). At 105 its shield stops paying (taken 0.99): the clamp |
| Sword alone | 0.86 / 0.93 / 0.96 / 0.85 | 0.95 / 1.04 / 1.04 / 1.08 | 2,979 / 6,703 / 10,031 / 10,806 | slow early on purpose; "speeds up later" does not happen (0.85 at 105). Fixed by the spell rule: its Turning Cut already scales, its strikes do not |
| Two axes | 0.97 / 0.97 / 0.92 / **0.82** | 0.97 / 1.05 / 1.08 / 1.10 | 3,661 / 9,889 / 11,879 / 14,436 | falls out of the band at 105: Rend's hit and Cleave are dead rows by then |
| Bow | 0.99 / 1.08 / 1.16 / 1.09 | 0.67 / 0.76 / 0.71 / 0.69 | 1,362 / 6,766 / **-1,350** / -413 | in band on XP; pays for it in arrows and runes |
| Crossbow | 0.99 / 1.08 / 1.13 / 1.04 | 0.51 / 0.52 / 0.59 / 0.68 | 3,232 / 9,113 / 13,014 / 18,077 | the best all-round lone way today: the bow's XP, half the damage, the hammer's gold |
| Wand (Mage) | **1.19 / 1.32 / 1.52 / 1.36** | 0.44 / 0.57 / 0.47 / 0.46 | 333 / 4,396 / **-10,144** / -1,896 | out of the band on XP (1.3 is the bar the weapon line holds), paid for in gold |
| Staff (Healer) | 0.92 / 0.96 / 1.07 / 1.05 | 0.27 / 0.32 / 0.30 / 0.33 | 229 / 3,563 / **-11,624** / -2,056 | in band; a third of the damage |
| Fists (dark) | 0.89 / 0.92 / 0.84 / not built (CITED, `fist-table.mjs solo --proxies`, against the best lone way at 10 / 24 / 57) | low point at or above the hammer's | 3,412 / 7,607 / 10,220 / - | inside 15% at four of seven grounds; the Sewer -27% |

Inside a 0.85 to 1.15 band: sword and shield, sword alone, crossbow, staff, bow (1.16 at 60). Outside: the wand (1.19 to 1.52: it buys XP with gold and nets zero or less from Level 10 on) and the axes at 105 (0.82). The wand gap is the fixed-number casts at their Level 30 to 60 peak, plus never missing. The spell rule sizes Frost Lance and Fireball in swings, and the gap becomes a number we choose (PROPOSED: 1.25 at every Level).

**Fists** (dark; RULED identity 11-18: the self-sufficient all-rounder, within 15% XP, comfortable alone). Their two mechanics are the two that already scale: the strikes are shares of the wraps' own blow at half a weakness, and the own heal is 0.8% of max HP a second. So fists are the one family the spell rule does not have to rework, and the right family to ship first after it. Their XP gap on pack grounds (the Sewer -27%) is a missing area row, not a number. BUILD, phase 12 as planned, after the spell rule (change 2), so tiers 3 to 7 are sized once.

**Training**: B3.

**The 6b sample (Necrotic and Storm, dark) and the tank spells (live since 0.2.142).** The element design holds from 1 to 400 (fixed steps, one 40% cap; CITED and confirmed: nothing in it grows with Level). Its four spells are fixed-number rows and inherit finding 1, so they are sized after the spell rule, under the bar budget (B4), at +5% for one and +10% for both at most. Shelter is the one live row I would resize with the rule: 85% of a blow at Level 60 on a 30 s cooldown is a good button; 54% at 110 is not, and the Tower is where it is used. Frost Slam is a status with no number and holds at every Level.

### B6. Death and Blessings

A death costs 6% of total Level XP and 6% of each combat skill's progress; three Blessings cut it to 1.5% and are used up (RULED 11-09, 11-10). In REF hours (READ FROM DATA `xp.js`, the lone contract):

| Level | 6% of total XP | Lone REF hours | Levels lost | With three Blessings, lone hours | For a four at 2.3 times, blessed | Three Blessings cost | That is, of a lone hero's net gold |
|---|---|---|---|---|---|---|---|
| 10 | 11,900 | 0.5 | 0.14 | 0.1 | | free | |
| 30 | 209,000 | 2.0 | 0.6 | 0.5 | 0.2 | free | |
| 50 | 1.02M | 5.1 | 0.9 | 1.3 | 0.6 | 1,350 | 7 minutes |
| 75 | 4.19M | 12.4 | 1.3 | 3.1 | 1.3 | 2,475 | 8 minutes |
| 110 | 14.1M | 25.6 | 2.2 | 6.4 | 2.8 | 4,050 | 12 minutes |
| 240 FORMULA | 104M | 69.6 | 6.0 | 17.4 | 7.6 | 9,900 | |
| 400 FORMULA | 423M | 147.7 | 7.1 | 36.9 | 16 | 17,100 | |

- **Is 6% right?** At 30 (two hours, or half an hour blessed, and the Blessings are free): yes, it stings and teaches. At 110 (a day of play unblessed, 6.4 hours blessed): yes, for a death that is the player's own choice of tier. At 240 and 400 an unblessed death is 70 and 148 hours and six to seven Levels: that is Tibia's bite, and nobody will ever be unblessed there, so the real price is 17 and 37 lone hours. Keep 6%. It is a share, it scales by itself, and with change 3 it finally has something to price.
- **Where it is wrong is the New player**, not the veteran. 8.9 deaths in 100 lone hours under Level 16 (REAL), and in my own play a Level 5 tank who pressed Deadly on the Thicket was dead inside the first minutes. The price there is tiny (63 XP with Blessings). The harm is the hunt ending while the player is away: a New player comes back to a hero standing in town. The fix is not the price. The harder tiers should not be one press away at Level 5 with words that are true of every ground ("Monsters hit much harder"). For the retention dive: the first-week death is a teaching problem.
- **Do Blessings leave a decision? No.** 2,475 gold at 75 against 9.3 lone hours saved; 18 of 22 real deaths were blessed, and every real player together has spent 6,345 gold on them. It is a button pressed after every death (one press takes all three, read in play: good).
- **PROPOSED:** all three together cost about three hours of a lone hero's net gold at its Level (about 34,000 at 50, 70,000 at 80, 63,000 at 105; `measure.mjs price 63000 --at hold`: 1.6 days of the Own four's gold, 0.6 of the Heavy four's), free under 30 as now. Then on Normal (a death in 1,000 hours by its sheet) a careful player buys one or none, and on Deadly after change 3 (a death every 30 to 100 hours) the three are a real line in the hunt's cost: about 600 to 2,000 gold an hour a hero. That is "struggle or pay" in gold. And "Bless again" becomes a remembered choice (keep me blessed: all, the first only, never), bought on return, so it is decided once. The first audit's fix 5 owns the price; this is my number for it.

### B7. Inner Flame

16 recorded bench hours, Prayer unused for 25 days, 9 of 12 heroes parked at 17 to 24 (REAL). READ FROM DATA: regen is x (1 + P / (P + 50)) on a base of 0.3% of max HP a second in a fight and 25% of max mana a minute, so Flame 20 is +29% and Flame 50 +50%. At Level 60 that is about 2,350 HP an hour against 40,254 taken (6% of the food) and about 4,100 mana an hour for a caster. It is a share of max, so it scales to Level 400 without a dial.

**Reason:** it is worth having. It is a small Add-class lever on the supply bill, it is the one thing bones are for, and the Great Hearth's lore is the game's own. **Why nobody uses it:** fuelling is a bench job. It takes the hero's town hours, which are worth planks and bars, to earn 6% off a food bill that is 8 to 48% of coin; and it is a visit to the Hearth for each of four heroes. The player decided once to burn bones and is asked to act on it for ever.

**FIX, not merge or cut** (PROPOSED): bones and the named fuels burn by a loot rule, set once for the account, beside "sell" and "keep" ("burn at the Great Hearth"), when the hero is back in town. No bench time, the same XP a bone. The Hearth's fire on the town map shows the account's flame color so it is seen. Tower Cinders keep competing for the same bones (RULED 11-14), which is the standing choice. If two weeks after that it is still unused, the alternative stands: cut the skill, and bones become Cinders.

### B8. Grounds

READ FROM DATA (`hunts.js` bands): Cellar 1-4, Thicket 5-15, Sewer 5-25, Wickstead 8-18, Glade 16-31, Warrens 32-50, Hask's Ford 45-60, the Slake 50-65, Muster Barrows 55-75, Pyre Field 70-90, Krell's Hold 85-110; staged Carter's Rest 110-125, Ox Road 112-128, Wyvern Roost 125-142, the Catacombs 165-185.

- **What does a lone hero do at 16 to 44 and 85 to 110?** At 16 to 31 it has the Glade and nothing else on Normal; at 32 to 44 the Warrens, a party ground whose Chief kills lone heroes (5 of 22 real deaths); at 85 to 110 Krell's Hold alone, 25 Levels, about 320 lone hours on one map. That is the longest single-ground stretch in the game. Real players answer it by being a four on Deadly on the Warrens for 32% of all their hours.
- **142 to 165: nothing is drafted.** 23 Levels, about 250 lone hours or 110 for a four. A four clears the staged Morrow Hills (110 to 142) in about 135 hunted hours: 16 days for the Heavy four.
- **What a ground costs us in hand dials** (MEASURED, `measure.mjs fits`): 51 dials on 15 grounds, 3.4 a ground: an XP fit on 14, the x0.7 gold fit on 11, a tier rule on 11, two named monster exceptions. Most tier rules exist to hold the ladder ("ground N's Deadly must not out-earn ground N+1's Normal") or to pull a four under 2.5 by HP ("Groups of four were killing them too fast for the XP they give", four grounds).
- **PROPOSED, with changes 1 and 3:** the x0.7 gold fit goes into the formula (11 dials); the per-ground HP dials that slowed fours go, because the harder tiers now cost danger and food and not time (6 dials, to be re-measured); the ladder rule becomes a printed line and not a gate, as the first audit ruled (about 10 more). That leaves an XP fit a ground and one honest exception where a map needs it: about 1.3 dials a ground.
- **What a ground must be** (DESIGN_STANDARDS §5: no ground best on every axis): after change 3 the choice between two grounds in a band is real, because a four can no longer treat the higher one as a free upgrade.
- Hask's Ford is the one live ground I would re-fit now: 2.62 on Deadly, 2.46 on Dangerous, a lone Mage 3.97 on Dangerous. Its XP fit of 1.02 should be about 0.85.

### B9. Companions, the skill tree and PvP

Nothing here should be designed until these are true of the model:

| System | Must be true first |
|---|---|
| **Skill tree** (ruled, no spec) | Changes 1, 2 and 5 are built, so there is one growth law for output (max hit), one for survival (the ratio) and a bar budget. Then a tree may do only three things: change WHICH row fills a lane (a sidegrade), move a rating inside the Add pool (capped at one weapon tier step in all), or change what a hero does in town. It may never add a multiply lever. If it cannot be interesting inside that, it is the wrong system. The weapon families already are a tree a player re-specs by changing weapon |
| **Companions** (dark, held by ruling 10-24) | A companion that fights is a fifth seat: it is in the party table or it is a multiply lever. So either it does not fight (it carries, sells, burns bones, gathers: an attention saver, and attention is the scarce ledger) or the party table is re-cut for five. The first is the one worth designing, after the loot rules cover what a pet would otherwise do |
| **PvP capture the flag** (idea) | A population (1,000 online is the floor for a queue that fills), the to-hit ratio (hero against hero on a straight line is one-sided inside 20 points of skill), and gear and skill normalized inside the match. Otherwise it is the Heavy four's ladder. Not before Early Access |

---

## C. The cards, in registry order

Each card answers the thirteen requirements of `02-requirements.md` by number: 1 purpose, 2 first principle, 3 ledgers, 4 power and reward budget to Level 400, 5 the seven players, 6 server cost, 7 population, 8 server age, 9 exploits, 10 teaching, 11 content throughput, 12 monetization, 13 telemetry. Then fun, rulings and the verdict. Every FIX and BUILD points at its row in the change table at the end of this section. Server cost: no proposal in this dive adds a statement, a row write or a ledger row to the settle path (`measure.mjs cost --add statements=0,ledger=0,writes=0`: inside the allowance); where a card says "6. none new" that is what it means, on today's 5 statements a settle alone and 8 for a four (MEASURED, `tests/per-player-cost.baseline.json`).

### `hunts` (live): idle instanced hunts. FIX (the own four's restart; everything else KEEP)

1. The core loop: choose a ground, a tier and a bar once, and the hero hunts with the game closed. Decision: where, how hard, with whom, and what happens after. Useful at every hour.
2. **Played alone:** end card to the next hunt is two presses (Go to the next ground, Enter); Bless is one press for all three; the after-hunt plan (wait, or train a skill) is chosen on the hunt card and kept for the ground. Good. **The own four, not played (one hero slot on a new account):** 99 of 249 kept real hunts ended because another of the player's own heroes left, and 68% have no after-hunt plan (REAL). "Hunt again" is off for a party member ("Party leader picks the hunt", READ FROM DATA `text/summary.js`), so a four's restart is the leader's presses plus whatever each member needs (re-supply, Bless, equip): ASSUMED 8 to 16 presses a restart, four times what one hero needs. What should remember it: one "Hunt again, all four" on the leader's end card that re-enters the same ground, tier and bars for every own hero in the party and reports only what blocks one of them. For QA: count it on a four-hero local world.
3. Source of Level XP, skill XP, gold, items, bestiary kills; sink of stamina (1:1) and supplies. Rates: the reference table.
4. The hunt itself is no lever. Its end reasons are: REAL, no kept hunt has ever ended on supplies or gold, 42 on stamina, 24 on a death.
5. New: 2 h a day alone; the dead moment is coming back to a hero in town after a death (B6). Own four: 3.3 h a hero a day in two visits; the restart is its whole attended cost. Heavy four: six visits. Ceiling: nothing limits it but stamina and refills. Buyer: nothing to buy here. Four friends: zero real hours.
6. Today's baseline; none new.
7. Works at 10 online (instanced). At 10,000 the settle is per instance; nothing is contended.
8. A new player on an old server hunts the same empty low grounds as on day 1. Nothing inflates here.
9. A script that restarts hunts is the player's own four doing what the game should do for them; the clamp is stamina. OPEN: nothing new.
10. First contact at minute one (the Hunts window, "Recommended", read in play). The end card names the next ground and the next buy: the best screen in the game for "what do I do now".
11. Not content.
12. Premium's analyzer. No pay-to-win line here.
13. `hunt_sessions` end reasons weekly: the share ended by "a party member left" (40% today) should fall under 10% after a four's restart exists; the share with an after-hunt plan (32%) should pass 70%.

Fun: the return ("While you were away") is the game for a player whose visit is 2 to 5 minutes. Rulings: hunts keep running offline (10-18) COMPLIES; after-hunt resume (10-14) COMPLIES; first principle (10-18) BREAKS for the own four's restart. Change row 9.

### `combat-engine` (live): damage, to-hit, mitigation, movement, targeting. FIX

1. Turns two stat blocks into kills an hour, damage taken and deaths. Decision: every gear, skill and bar choice is read here. 2. No presses. 3. Converts power to every reward. 4. Section B2: both to-hit rules leave their range inside live content (the monster at Level 60, the hero from 105) and nothing a hero does in a fight grows past skill 60 and tier 7 (B5). FORMULA at 240 and 400: a career hero cannot kill a same-Level monster (15% to-hit, 74 to 120 blows). 5. Every player meets it the same way; the New player as early lone deaths, the fours as no deaths at all. 6. None new: a ratio is the same arithmetic cost as today's line; two more fields a monster row in the catalogue. 7, 8. Not population or age bound. 9. The settle is the server's; the 32 s seed horizon is unchanged by this. OPEN: none new. 10. A player reads two numbers on a monster card ("aim 77, ward 31") against its own two: the wiki line becomes "your rating against theirs". Today no screen can explain 85%. 11. One function, generated rows: no content cost; it REMOVES a patch about every 30 Levels of new content (CITED, the first audit). 12. None. 13. The analyzer's landed share of blows by Level band, dealt and taken: target 80 to 88% dealt, 65 to 78% taken on Normal in band; red at any band on a clamp.

Fun: "either they are strong enough or they aren't" (Tyler 11-08) becomes literally true. Rulings: NO LEVEL IN COMBAT (11-18) COMPLIES; Defense training not intended (11-18) BREAKS today, COMPLIES after; one engine online and offline COMPLIES. Change rows 1 and 2.

### `level` (live): Level, uncapped, and the pace contract. KEEP

1. The long chase and the gate to gear and grounds. Decision: none inside it; it is the score. 2. None. 3. Source: kills. Sink: death. Converters: none, and none may exist (RULED 11-04). 4. Level gives +10 HP and +10 mana: a Replace-free, linear lever. Contract `1385 x L^1.274` XP an hour; a Level takes 3.2 lone hours at 10, 5.6 at 50, 11.7 at 110, 11.5 at 240, 20.7 at 400 (READ FROM DATA). The curve past 110 is fitted by hand to the contract with no hero there. 5. Section B1's table: the Own four reaches 50 on day 23 and 110 on day 94; the Heavy four 110 on day 37; the Ceiling on day 13. 6. None. 7. None. 8. A newcomer at month 6 is 100+ Levels behind the Heavy four and can never party with it in band: scaled hunts (80% XP) are the only bridge, never used (REAL 0). 9. Level XP is server-minted; the Bonus weekend is the only global multiplier. 10. The medallion at the bar's center; the end card's "Level 1 to 5". 11. **This is the throughput number for the whole program:** a four uses a 25-Level band in about 100 to 130 hunted hours past Level 85, so the Heavy four needs a new ground about every 12 to 15 days and the Own four every 30 to 40. 12. Never sold (RULED). 13. Median hunted hours to Levels 10, 25, 50, 75 by account size, weekly: target the B1 line within 15%; red if the four's 50 is under 60 h again.

Fun: Level 200 as "a big deal" holds only if the pace of record is the four's (B1), or it is a three-month number for the Heavy four. Rulings: uncapped (10-14) COMPLIES; pace targets (10-25) COMPLY for the lone hero; the four at 2.0 to 2.5 (11-16) COMPLIES in band, BREAKS under Level (2.2 to 3.3). No change of its own: change 3 brings the real pace onto the ruled line.

### `combat-skills` (live): Melee, Ranged, Magic, Defense. FIX

1. The second progression, earned by doing: it says what a hero IS. Decision: which weapon to live with, since skills do not move with it. 2. None in hunts; training is a remembered after-hunt plan. 3. Source: blows landed, mana spent, hits taken, the yard. Sink: death (6% of progress). Converter: gold and town hours to skill XP at the yard, 30,000 an hour flat. 4. Add class through to-hit and max hit: section B3. Worth 2% a level at 10 and 0.5% from 110. The cost multiplies by 1.04 for ever: not a lever to budget past 110. 5. New: skills run ahead of Level (21 at 10), which feels great. Own four: 7 to 10 under the lone line by 60, back row Defense 13 to 30; on the ratio that costs it 1 to 4 points of to-hit and its back row is hit 84% at 60 where the front is hit 74%. Buyer: the training item, 250,000 gold for 1.3 levels at skill 60: a bad buy, and that is correct. 6. None new. 7. None. 8. Skills cannot be traded or caught up; the yard is the catch-up and it is sized for it. 9. AFK Defense training is closed by "scales with attacker level" (10-18); the dummy pays XP only; OPEN: none. 10. Skill XP shows only in a premium analyzer tab (RULED 10-22), so a free player never sees why a skill moved: the yard's screen should carry "next level: N hours here, M hunting" (B3). 11. None. 12. Crowns training items are ruled in ("a bit pay to win but i dont really care", 11-14) and account-bound; at these values the Buyer gains under 1% past skill 60. 13. Main skill and Defense at Levels 30, 60, 90 by seat, weekly, against the reference table: red if the front seat falls more than 12 under the line (then the reference hero is wrong and monsters are authored too hard).

Rulings: uncapped (10-14) COMPLIES; Defense training "definitely NOT" intended (11-18) BREAKS today; flat training rate (11-14) COMPLIES. Change row 1 (the ratio is the fix; nothing moves on the training side).

### `inner-flame` (live): Inner Flame and the Great Hearth. FIX

Section B7 is the card. 1. Solves "what are bones for" and trims the supply bill; the decision is burn, sell or Cinders. 2. BREAKS: a bench visit a hero for a decision made once. 3. Sink of bones and town hours; source of regen (+29% at Flame 20, +50% at 50, a share of max so it never needs a dial). 4. Add class, about 6% of a food bill at Level 60; capped by its own curve at +100%. 5. 16 bench hours in all (REAL); the Own four will never spend four heroes' town hours on it. 6. A loot rule adds no statement (it rides the return-to-town dispatch that already runs for "sell"). 7, 8. None. 9. Bones are tradeable: a Buyer could buy bones for regen; capped by the curve. 10. Nothing tells a player what the flame does in numbers. 11. None. 12. None. 13. Bones burned a hero-hour hunted: target over half of bones dropped; red at zero for two days (it is at zero for 25 days on Prayer today, a standing P1 by §3.4).

Rulings: Prayer a combat skill, regen only (10-14) COMPLIES; "feed the Hearth" (10-25) COMPLIES; Cinders compete (11-14) kept. Change row 7.

### `weapon-roles` (live): seven families, stances, armor weights. KEEP

1. No class pick: the weapon in hand is the role. Decision: how this hero fights and what it is in a party; switchable in town. 2. A setup a weapon is remembered (presets); none repeated. 3. Converter of power into different mixes of XP, damage taken and gold. 4. Multiply class, section B5's table: 0.82 to 1.52 of the hammer. Band PROPOSED 0.85 to 1.25 at every Level, the tank and the sword alone low on purpose. Armor weights: heavy up to +28% HP, light up to +35% mana (RULED), a share, scales. 5. New: the creation screen names five styles in one line each (read in play; the sword alone is missing from it). Own four: tank, Healer, bow, Mage is what the party table pays most (1.70 a kill for four classes). 6. None. 7. A four of friends needs the roles; an own four supplies them itself. 8. A newcomer's first weapon choice is free to change, which is right. 9. Same-class fours never out-earn solo (0.97): holds. 10. Hero creation, then nothing until a weapon drops. 11. A new family is a full kit (rows, art, a party class): the most expensive combat content there is, so fists are the last for a long time. 12. None. 13. Share of hunted hours by family, weekly: red if any family is under 3% (it is not a real choice) or the wand over 40%.

Rulings: sword and shield slow alone (11-19) COMPLIES (0.85 to 0.96); sword alone "should speed up later" (11-19) BREAKS (0.85 at 105), fixed by change 2; party XP only for mixed classes (10-31) COMPLIES.

### `action-bar` (live): the bar, conditions, setups, presets, hunt prep. KEEP

1. This IS the first principle: every fight decision made once and kept. 2. Kept per ground ("Kept for this ground", read in play), per preset, copyable. The one repeat: a new spell or element means editing four heroes' bars; after change 5 it is one slot's row swapped, and a "copy this bar to my other hero of this weapon" covers it. 3. No ledger of its own; it decides how much of the lanes fire. 4. Section B4: the offense lane is the budget. 5. The New player gets a start bar of five slots that works untouched (played: Level 1 to 5 with no bar edit). 18 free setups saved across 5 real accounts, 0 bought slots (REAL). 6. None. 7, 8. None. 9. None: the server fires the bar. 10. The tutorial must teach it in combat (RULED 10-25): retention dive. 11. None. 12. Paid setup slots: never bought. 13. Share of heroes past Level 20 with an edited bar: target over 60%.

Rulings: 20 slots, 3 conditions COMPLIES; lanes offense, support, heal (10-19, 10-23) COMPLIES. Change row 5 is a rule on content, not on the bar.

### `spells-runes` (live): spells and rune families. FIX

Section B5 is the card. 1. Gives every family its buttons and gives runes (a town product) a consumer. Decision: which casts, which rune tier, which element. 2. Kept in the bar. 3. Sink of mana and runes (runes are 55% of the real store bill); source of damage, heals and Magic XP (2.40 a mana, one ratio for every caster, RULED 11-05, holds). 4. Fixed numbers: every cast peaks at Level 10 and is 4% of a monster or less at 400. Outside every stacking class today because its size changes with Level. After the rule: a share of max hit, so it sits wherever the weapon sits. 5. The caster's bill: a lone Mage nets 333 gold at 10 and -10,144 at 60 at store prices (MEASURED); a third of real supplies are home-made, which is what makes casters affordable. Buyer: runes at any price, no edge beyond gold. 6. None new. 7. Rune families need Runecrafting or the store: works at 10 online. 8. Old rune tiers stay useful only if versions are steps and not eras: under the rule tier I still casts at 1.0. 9. Mana back and Magic XP on net mana (6b ruling) closes free Magic XP. 10. The "new spell" prompt at each unlock. 11. A spell is a row and an icon; sixteen are coming, each a balance event today and a sidegrade after changes 2 and 5. 12. None direct. 13. Share of a hero's damage from casts by Level band: target flat within 10 points from 30 to 110 (today it falls by more than half).

Rulings: versions at 1 / 15 / 30 / 45 / 60 (10-23) COMPLIES and is kept; Magic XP ratio (11-05) COMPLIES; seven then eight rune families (10-23, 11-18) COMPLIES. Change row 2.

### `tank-runes` (live): Frost Slam and Shelter. FIX (inside the spell rule)

1. Gives the tank a reason to carry runes and a party a reason to want this tank. Decision: slot them, and on what trigger. 2. Kept; Shelter starts on "an enemy is casting", a good default. 3. Sink of Ice and Earth runes; source of party survival. 4. Frost Slam: a status of 30 to 50% by rune tier, no number to decay: holds to 400. Shelter: a shell of 141 at Melee 60, 85% of one blow, falling to 54% at 110 and 18% at 400: FIX with the rule. 5. Party only (RULED), so the New player never sees them and the Own four's tank does. Not on the default bar. 6. None. 7. Useless alone by design. 8, 9. None. 10. The new-spell prompt at Melee 12 and 20. 11. Two rows. 12. None. 13. Share of party tanks past Melee 20 with either slotted: red under 20% (then they are not worth their rune).

Rulings: tank spells hold and protect, never a lone tank's kill speed, party only (11-19) COMPLIES. Change row 2.

### `elements` (live): resistance and weakness. KEEP

1. Makes the ground decide the loadout. 2. One remembered setup a ground; linings will need the same (CITED, the first audit's change 13). 3. Converter: the right element is +20% damage and +15% to-hit on a weak monster (READ FROM DATA `WEAKNESS_BONUS`), a resisted one down to -50%; never immunity. 4. Fixed steps and one shared 40% cap on what a hero resists: nothing grows with Level. The one system that is already scale-proof. On the ratio the +15% to-hit becomes x1.15 on a chance that is never clamped, so it is worth the same everywhere (today it is worth nothing at 95%). 5. The New player meets none before the Glade. 6. None. 7, 8. None. 9. None. 10. The monster card's weakness line. 11. Free with each ground. 12. None. 13. Share of casts by element on each ground against that ground's weakness mix: red if a ground's weak element is under a third of casts (players are not reading it).

Rulings: percentages, never immunity (10-15) COMPLIES.

### `necrotic-storm` (dark): two elements, sixteen spells. BUILD, after changes 2 and 5

Not played (dark); judged on its data, its switch and its measured sample. 1. A fourth and fifth answer to "which element here", and two new threats (Withered cuts heals, Storm burns mana) that make a guard a decision. 2. One slot swapped a ground, kept. 3. Sink of Bone and Storm runes. 4. As measured it is a multiply lever (+12.8% and +29.2% for a sword; CITED) because it adds to a lane with room. Under the bar budget it is a sidegrade: +5% and +10% at most. 5. Nobody has it. The Own four would re-slot four bars once. 6. None new (the engine pieces already run). 7, 8. None. 9. Mana back capped at the cast's cost (ruled in the audit). 10. Ships with the Ox Road and the Old Guard, whose monsters teach it by hitting with it. 11. Sixteen spells: under the rule each is a row with a share and an element, sized by the grader, no pace re-fit. 12. None. 13. After launch: the pace on the two grounds within 3% of before.

Rulings: Necrotic and Storm, a spell for each family (11-18) to be met; rune families Storm and Bone (11-18) COMPLIES in data. Change row 6.

### `fists` (dark): the eighth family. BUILD, after change 2

Not played (dark). 1. The comfortable lone way: low bill, own heal, any element. Decision: comfort against speed. 2. One bar. 3. Lower store bill (0 to 21 foods an hour against the hammer's 0 to 70, CITED). 4. Multiply class at 0.84 to 0.92 of the best lone way (CITED); its heal is 0.8% of max HP a second and its strikes are shares of its own blow, so both scale to 400 with no dial. 5. The New player's best first weapon if it existed at Level 1 (it dies least); the Own four's gap filler. 6. None. 7, 8. None. 9. A self-heal that works out of a fight is free HP: it replaces food, not Blessings; fine. 10. A new line on the creation screen. 11. Seven tiers of wraps and their strikes. 12. None. 13. Lone deaths under Level 16 by family.

Rulings: Tyler's identity statement (11-18) and "best lone gold, comfortable, within 15% XP" as scoped on the board COMPLIES at four of seven grounds. Change row 10.

### `monsters` (live): the roster and the one stat formula. FIX

1. The other stat block. Decision for the player: none directly; for us it is the whole authoring cost of a ground. 2. None. 3. Source of XP, coin and drops a kill. 4. HP 4.95 + 1.76 a Level, blow 22% of a same-Level hero's HP, XP `1.436 x L^0.4` a point of HP (READ FROM DATA): all three hold to 400 by construction. To-hit and defense do not (B2): written against a hero with every skill at its Level. 5. The New player dies to the cistern spider and the culvert bat (REAL): two rows worth a look by name. 6. Two generated fields a row. 7, 8. None. 9. None. 10. The monster card: Level and rarity today; aim and ward after. 11. A monster is a row from its Level and role; the formula is why a ground costs data and not tuning. 12. None. 13. Deaths by killer, weekly: red if one row is over a quarter of a band's deaths (the spider is 5 of 13 under Level 16).

Rulings: monsters a little harder (11-19) COMPLIES; one formula for every hunt (11-07) COMPLIES; no Level penalty (11-04) COMPLIES. Change row 1.

### `monster-spells` (live): spells, shooters, mends, boss phases. KEEP

1. The reason for guards, bar rules and Shelter. 2. A bar rule set once ("when an enemy is casting"). 3. Damage by element. 4. A spell is a multiple of the monster's own blow, held under 35% of a floor hero (READ FROM DATA): a share, scales. 5. The back row's only real danger. 6. None. 7, 8, 9. None. 10. The hunt card names each caster and its spell (read in play, the Warrens: "Goblin Digger casts Blasting Charge"): good. 11. One or two a ground. 12. None. 13. The share of damage taken that is a spell, by ground: the grader has it and should print it (CITED); an element only matters where this is over a fifth.

Rulings: bosses get the special animations (10-15) COMPLIES.

### `difficulty-tiers` (live): Normal, Dangerous, Deadly. FIX

Section B1 is the card. 1. One choice a ground: safe, or more for more risk. 2. Kept for the ground (read in play). 3. Multiply class on Level XP: for whoever holds it, 1.5 to 2.6 times the contract (a four) and 2.0 to 4.0 (a lone Mage on Dangerous, at a loss of 14,000 to 94,000 gold an hour) (MEASURED). 4. The dials are shares (blow x1.33, HP x1.15, XP x1.25, a pull of 6 to 8), the same at every Level: scales. What does not hold is the danger: a four has twice the room it needs, at every Level from 30 to 118. 5. New: Deadly is one press away at Level 5 and kills in minutes (played). Own four: on Deadly for 79 of 99 recorded party hunts with 2 deaths in 359 hero-hours (REAL). 6. None. 7. None. 8. None. 9. Under-Level Deadly is the standing exploit of the pace (B1): closed by danger, not by a rule. 10. The tier's words are the same on every ground and for every party; they should read the measured line for THIS party ("your four would hold this", "expect deaths"). 11. No content: three rows a ground from one table. 12. None. 13. Deaths a 100 hero-hours by tier and by Levels under the band floor: target on Deadly in band 1 to 3, ten under over 12; red at 0 in band (today's reading).

Rulings: a mixed four on Deadly at 2.0 to 2.5 (11-16) COMPLIES in band; one difficulty for every group (11-08) COMPLIES; struggle or pay (11-19) BREAKS; outside your weight class (11-06) BREAKS (no waste, no deaths). Change row 3.

### `grounds-live` (live): Greenhaven and the Barrow March, Levels 1 to 110. FIX

Section B8 is the card. 1. A place for every Level band with its own drops and story. Decision: which of the grounds my Level can hold. 2. Kept setups a ground. 3. The reference table. 4. 51 hand dials, 3.4 a ground. 5. Real players live on the Warrens (32%) and the Glade; Wickstead, Hask's Ford and the Muster Barrows are 45 hours together; the Cellar is parked in to Level 61 (REAL). The advised route is not the route played because the higher ground on Deadly was always the better answer. 6. None. 7. Empty grounds cost nothing. 8. Low grounds are empty at month 6 for a newcomer either way (instanced). 9. None. 10. "Recommended" and "Next step up" in the list (read in play). 11. A ground is art first; its numbers are a pack of rows. 12. None. 13. Share of hunted hours by ground against the advised route: red if a ground in the advised route is under 3% of its band's hours.

Rulings: Sewer opens at 5 (11-18) COMPLIES; no profit molds (11-13) COMPLIES; balance the grounds against one formula (11-16): the per-ground HP dials are the opposite, removed by change 3. Change rows 3, 4 and 8.

### `grounds-staged` (staged): the Morrow Hills and the Catacombs ground, 110 to 185. BUILD

Not played (staged); measured with its own drops opened. 1. The first content past Krell and the home of the factions. 2. As live. 3. MEASURED today: Carter's Rest a lone hammer at 0.88 of the contract and -2,989 gold an hour, the Catacombs 0.82 and -25,788; on the ratio 0.95 and +14,364, 0.94 and +18,624. 4. These grounds are where the to-hit clamps bite first, so they should not be tuned before change 1: every dial put on them now is a dial to remove. 5. Only the Heavy four is near (Level 79). 6. None. 7, 8. None. 9. None. 10. As live. 11. Three grounds for 110 to 142 last a four about 135 hunted hours; 142 to 165 is not drafted. 12. None. 13. As live.

The pack gate: answered in the summary (the party rule, not the grounds). The Catacombs four on Deadly is at a 33% low point today and dies at a 1600 blow dial: its tier row is sized after change 3. Rulings: generous to Krell, rare after (11-20): items dive. Change row 4.

### `regions-4-7` (idea): Levels 185 to 400. HOLD

1. to 13. Not built, so: the only requirement this dive puts on it is that changes 1 and 2 land first. On today's formulas a career hero at 240 lands 15% of its blows and its casts take 1 to 12% of a monster, so nothing drafted there could be measured. After them the formulas hold flat to 400 (B2's table) and a region is art, rows and properties. Throughput: 215 Levels is about 2,400 hunted hours for a four, and at one ground a 25 Levels a four needs about nine regions' worth of maps: the first audit's change 4 (properties carry up, fewer new pieces a region) is the only way that is drawable. HOLD until the Morrow Hills are live and measured.

### `death-blessings` (live): death and Blessings. FIX

Section B6 is the card. 1. The stake. Decision today: none (always bless). 2. One press takes all three (played); it is still a press after every death: a remembered "keep me blessed" removes it. 3. Sink of Level XP and skill progress; Blessings a gold sink of 6,345 gold in all (REAL). 4. A share of total XP: scales by itself (0.5 lone hours at 10, 25.6 at 110, 148 at 400 unblessed). 5. New: dies 8.9 times in 100 hours, free Blessings, loses minutes; the harm is the ended hunt. Own four: 1 death in 449 hours past Level 45. Buyer: Blessings at any price. 6. None. 7, 8. None. 9. A death ends the hunt and costs XP: nothing to farm. 10. The death popup is good (played: who, where, what it cost, what the Blessings saved, a tip, Bless again). 11. None. 12. None. 13. Blessing gold a hunted hour by tier: target 600 to 2,000 on Deadly; deaths a 100 hours by Level band.

Rulings: 6%, can take a Level (11-09) COMPLIES; Blessings 25 / 50 / 75% (11-10) COMPLIES; free under 30 (10-18) kept. Change row 11.

### `stamina` (live): 8 h free, 12 h Premium, 1:1 rest. KEEP

1. Paces a day and makes a return. 2. The refill is a press a hero; the Heavy four made 81 (REAL). 3. Time class: hunt hours a day. 4. Never touches a hero's rate. 5. REAL: heroes hunt 3.1 to 3.5 hours a day on an 8 hour bar. **Stamina does not bind for anyone but the one player who refills**, so Premium's 12 hour bar gives the real player nothing. Ceiling: 24 hours a day with refills, which is what puts Level 110 on day 13. 6. None. 7, 8. None. 9. Six refills a day (RULED) is the clamp. 10. The timer under the medallion and the gold "+". 11. None. 12. For the economy and retention dives: Premium's headline perk is unused by the real player. 13. Hunted hours a hero a day by account; share of hunts ended on stamina (17% today).

Rulings: 1:1, 8 and 12 hours (10-18) COMPLIES; six refills a day (10-19) COMPLIES.

### `skill-tree` (ruled, no spec): HOLD

Section B9. Not built, so: every one of the thirteen answers depends on what it would be allowed to move, and the model's answer is "a sidegrade, the Add pool, or the town; never a multiply lever". HOLD until changes 1, 2 and 5 are built.

### `companions` (dark): HOLD

Section B9. Not played (hidden; RULED 10-22 keep hidden, 10-24 no pet work until the core is solid). Not built as a design, so: if it fights it is a fifth seat and belongs in the party table; if it does not, it is an attention saver, and attention is the scarce ledger. `pets_xp` at zero is expected. HOLD.

### `pvp-ctf` (idea): HOLD

Section B9. Needs a population, the ratio and normalized stats inside the match. HOLD past Early Access.

### The change rows

| # | Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | To-hit as a ratio of two ratings; monsters authored against the measured career hero; two generated fields a monster row; the reference table and its guard | combat-engine, combat-skills, monsters, grounds-staged | power; gold (melee paid again past 110) | M | yes: engine, catalogue apply, edge deploy, every ground re-graded once | first-week (Defense training) and long-chase (everything past 105) | B2, MEASURED |
| 2 | Every cast a share of the caster's own blow; versions as rune-tier steps; defense taken once | spells-runes, tank-runes, weapon-roles | power; gold (rune use) | M | yes: engine and the abilities table | long-chase from Level 60; first-hour (Power Strike is a button again) | B5, MEASURED |
| 3 | Deadly's blow dial 1330 to about 1750, Dangerous 1170 to 1400; three new sheet lines; the per-ground HP dials re-measured and removed; the card's risk words from the measured line | difficulty-tiers, grounds-live | Level XP (the real pace onto the ruled line); gold (food, Blessings) | S | data rows and the catalogue; no engine | first-week for the own four | B1, MEASURED |
| 4 | The program's pace of record is the four's (lone table / 2.3); the model's multiply cap is 2.5; the grader's `four-xp` and `feel-seat-below-solo` move to Dangerous and Deadly | level, grounds-staged, the grader | none (a reading) | S | no | unblocks the Morrow pack gate | summary, B1 |
| 5 | The bar budget: 0.85 of the offense lane a family, a new row replaces one; two axes drop one row | action-bar, spells-runes, necrotic-storm | power | S | data and one guard | long-chase: content stops moving the pace | B4 |
| 6 | Necrotic and Storm sized under changes 2 and 5 (+5% one, +10% both), then live with the Ox Road | necrotic-storm | power, runes | M | the lane already planned | long-chase | CITED + B4 |
| 7 | Bones burn by a loot rule, no bench hours | inner-flame | town hours given back; items (bones) | S | one loot-rule action on the existing dispatch | first-week | B7 |
| 8 | Hask's Ford's XP fit from 1.02 to about 0.85; the x0.7 gold fit into the formula; the ladder rule a printed line | grounds-live, monsters | Level XP, gold | S | data rows | none for the player; 20 or more dials removed | B8, MEASURED |
| 9 | "Hunt again, all four": the leader's end card re-enters every own hero | hunts | attention | M | one RPC over the existing restart | first-week for the own four, every visit | REAL (99 of 249 hunts) |
| 10 | Fists, phase 12, after change 2 | fists | power | L | the planned lane | first-hour (the comfortable lone start) | CITED |
| 11 | Blessings priced at about three hours of lone net gold for all three; a remembered "keep me blessed" | death-blessings | gold | S | price rows; one setting | long-chase | B6 |

## D. For other dives

| Dive | System | What this dive found |
|---|---|---|
| 22 Endgame | tower, catacombs | Re-measure both on the ratio. The Tower's heat was carrying the hero's to-hit collapse; expect to remove most of it. The Catacombs four on Deadly dies at a 1600 blow dial (17 to 33 deaths in 8 hero-hours) and sits at a 33% low point today: its tier row is sized after change 3. Shelter is 54% of a blow at 110 and is the Tower tank's button |
| 22 Endgame, 26 Home | every week and price | Count in the four's hours (B1's table): Level 50 at 76 h, 110 at 311 h. The Heavy four ends live content on day 37 |
| 23 Items | weapon line, gear tiers | Combat's requirement on the weapon line past tier 7: a hero's max hit must grow about with the monster's HP (1.76 a Level), for every family including wand and staff, because after change 2 it is the ONLY growth law for output, heals and shells. Today a career hammer's max hit is 69 at 110 and 78 at 400 against HP 199 and 709. Shields: at 105 the shield's guard stops paying on today's clamp (sword and shield takes 0.99 of the hammer); it pays again on the ratio |
| 26 Home | the yard and the dummy (its "re-measure after 21") | On the ratio +10 main skill and +10 Defense are worth -13% damage taken at the Glade (30), -11% at the Slake (60), -3.5% at Krell (105), and 0 to +3% Level XP (MEASURED, `tohit-ratio.mjs play --seat lone --bump 10`); today -36%, -24%, 0%. So its "a third less damage taken at 30" becomes about an eighth, and its fee of 100 gold x the skill level prices a catch-up, not a power buy. I agree with that fee; my B3 gold column uses today's 50 + 6 a level |
| 23 Items | training items | 250,000 gold buys 1.3 skill levels at skill 60 and 0.3 at 82: say so on the item, or it is a trap |
| 24 Economy | blessings, yard, store bill | Blessings: my price is about three lone hours of net gold for all three (B6). After change 3 a four on Deadly pays 25 to 33% more at the store (Ford 13.6k to 18.1k, Krell 26.2k to 33.1k a head an hour, MEASURED): re-run the gold table for the four. The yard's gold-for-power rate is in B3 |
| 24 Economy, 27 Retention | stamina, premium | Stamina binds for one real player. Premium's 12 hour bar gives the other four accounts nothing |
| 27 Retention | first week | The New player's deaths (8.9 in 100 hours) are a teaching problem, not a price problem: Deadly is one press away at Level 5 with words true of every ground, and the harm is coming back to a hero in town. The creation screen lists five styles and leaves out the sword alone. The Bonus XP weekend takes a four to about 3.1 times the contract |
| 27 Retention | hero slots | A new account has one hero slot on the creation screen ("Hero slots: 1"), where the rulings of record say two to start. Either is fine; they should agree |
| 28 Platform | all | Nothing in this dive adds settle cost. Changes 1 and 2 are combat-engine deploys and fall under the world-tick parity rule |
| All | the model | The multiply cap should read 2.5 (RULED 11-16), measured at the hero's own Level, not 2.0 |

## E. Measured, cited, assumed

**MEASURED here** (commit c4750e78e and later of `lane/d-balance-combat`, on `set/v0.2.143`; the real settle through `tools/balance-sim/cell.mjs`, played profile, career-line skills, store supplies, paired seeds):

- The four at real Levels: `node tools/balance-program/measure.mjs what --at slake|pyre|hold --seat four --patch '{"level":55|66|74}' --hours 2 --seeds 2`; `node tools/balance-sim/staged/tohit-ratio.mjs play --seat four --at ford --level 40 --hours 2`.
- To-hit by formula: `node tools/balance-sim/staged/tohit-ratio.mjs formula`.
- To-hit in play, all eight points, both seats: `tohit-ratio.mjs play --seat lone`, `--seat four` (2 seeds x 1 h). The staged points were re-run after a tool fault (a second gear loader dressed the Level 175 kit differently); the table holds the corrected rows, which match `measure.mjs ref --at catacombs`.
- The tier dials: `tohit-ratio.mjs play --seat four --at ford|hold --level N --hours 2 --deadly-dmg 1600|1900|2200`; `--engines ratio --deadly-dmg 1750 --hours 3` at Ford 50 and 40, the Slake 60, Pyre Field 80, Krell 105, 80 and 74 (Krell at 80, five under the floor: 6 deaths in 16 hero-hours, low point 23%); `--tier dangerous [--dangerous-dmg 1400]` at Ford 50 and 40 and Krell 105 and 74 (Krell at 74 on Dangerous 1400: 2.18 times its contract, no death, low point 32%, -17,462 gold an hour).
- Seat by tier: `tohit-ratio.mjs play --engines today --seat lone|mage|four --tier normal|dangerous|deadly --at glade,ford,hold` and `--at rest,pyre`.
- +10 skills: `tohit-ratio.mjs play --seat lone --bump 10 --at glade,slake,hold`.
- The ways: `measure.mjs what --at thicket|glade|slake|hold --seat lone --patch-file tools/balance-sim/staged/ways.patch.json`.
- Spell ratios: `node tools/balance-sim/staged/spell-ratios.mjs`. Curves and dials: `measure.mjs curves`, `measure.mjs fits`. Prices: `measure.mjs price`.

**Limits of these measurements.** Two seeds by one to three hours a cell: enough to compare a lever on paired dice, too little to read a death rate under about one in ten hero-hours. Every "0 deaths" above is "none in 8 to 24 hero-hours". The 1750 dial is one point between two measured ones and needs 4 seeds x 8 h before it is built. The ratio is played with the monster ratings derived from each row at fight time (its own Level, its written hit, its defense against a regular's), which is what generated row fields would hold; the role term is clamped to 0.6 to 1.8. The harness four's net gold is not a finding (it buys every supply; real fours make a third of theirs).

**READ FROM DATA:** `src/core/combat.js` (both to-hit rules, the clamps), `src/data/core-model.js` (LEVEL_PACE, SKILL_CURVE, FLAME_REGEN, VITALS), `src/data/balance-sheet.js` (STAT_FORMULA, TIER_DIALS and the per-ground overrides), `src/data/abilities.js` (lanes, cooldowns, versions), `src/core/hunt/abilities.js` and `damage.js` (how a cast is priced), `src/data/blessings.js`, `src/data/training.js`, `src/data/party-class-xp.js`, `src/data/hunts.js` (bands), `tools/balance-sim/grade-sheet.mjs` and `grade.mjs` (the gate's two party lines).

**CITED:** `10-real-players.md` (every REAL number); `whole-game-audit-2026-11-20.md` sections 3, 4 and 6 (changes 1 to 3, the 6b rulings); `lane/d-elements-6b` (+12.8%, +29.2%, +2.7%, +8.5%); the board's "2026-11-19 Complete balance look" row 3 (the fist table); the Coordinator's pack gate run on Carter's Rest and the Ox Road.

**PLAYED** (the shared browser pane, before the Coordinator's notice to stop using it; my own world on port 8795, since stopped): sign-up, hero creation, Mill Cellar 1 to 5, the end card, Bless, the hunt cards for the Warrens (31 Levels under, Enter offered) and the Thicket, the tier words, a death on the Thicket's Deadly and its popup.

**ASSUMED:** the presses for an own four's restart (not played); skill XP an hour past Level 105; the projection of the career line past Level 100 (the same one `measure.mjs curves` uses); the opening sizes of casts in swings and the version steps under the spell rule (PROPOSED, not played: the rule itself is measured only as "the two rows that already use it hold"); the in-band death rate on Deadly after change 3.

**Not done.** The spell rule was not planted and played. The own four's restart was not played. The Morrow grounds were not run through `tools/pack.mjs check` with the moved party lines. The Tower and the yard were not re-measured on the ratio (handed to dives 22 and 26). Monster spells' share of damage by ground was not measured.
