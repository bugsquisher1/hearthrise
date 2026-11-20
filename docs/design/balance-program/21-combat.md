# Balance program 21: combat and progression

Phase-2 dive, game-designer, `lane/d-balance-combat`, 2026-11-20, on `set/v0.2.143` (c4750e78e and later). 23 systems. Labels as in `01-model.md`: REAL, MEASURED (with the command), CITED, RULED, READ FROM DATA, ASSUMED, PROPOSED. Nothing in the game was changed. Two measuring tools were added: `tools/balance-sim/staged/tohit-ratio.mjs` (the to-hit ratio and the tier dials, played on a planted copy beside today's engine, the same dice) and `tools/balance-sim/staged/spell-ratios.mjs` (what a cast is worth against the monster of its Level, no play).

**Inventory:** no missing system found. One note for the registry: `tank-runes` and `necrotic-storm` both rest on the `replaces` shared cooldown, which is a bar rule, not a spell rule (section B4).

**Played** (`node tools/qa/local-world.mjs serve --port 8795`, a new account, the screen only): sign-up, hero creation, the Mill Cellar to its end at Level 5 (18 minutes with the weekend bonus on), the end card, Blessings, the Thicket on Deadly as a Level 5 tank (dead inside the first minutes, the death popup read). What the play showed is in the cards. **Not played:** an own four (a new account has one hero slot and no gold for a second), so the restart press count in the `hunts` card is counted from the screens and text, and is marked so.

---

## A. Summary

### Verdicts

| Verdict | Count | Systems |
|---|---|---|
| KEEP | 7 | hunts, level, weapon-roles, elements, monster-spells, stamina, action-bar |
| FIX | 9 | combat-engine, combat-skills, inner-flame, spells-runes, tank-runes, monsters, difficulty-tiers, grounds-live, death-blessings |
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
2. **How hard a same-Level monster lands on the ratio.** Recommend: 70% on the career hero, as the formula has always said. It makes a lone hero on Normal take 15 to 22% less than today at Levels 50 to 105 (today everyone is on the 85% clamp), which puts Normal back inside its own ruled band (low point 60 to 80%) and makes the Morrow grounds pay. Alternative: 78 to 80%, which keeps today's damage on Normal and loses those two things.
3. **The harder tiers bite.** Recommend: Deadly's blow 1330 to about 1750 and Dangerous 1170 to 1400, sized so an in-band four holds Deadly at a 35 to 50% low point with no steady deaths and a four 10 Levels under dies about once in two to four hours. Alternative: leave the tiers and add a Level door to each ground (band floor minus 5), which is simpler and goes against "the band is a guide, nothing more".
4. **Which pace the game is built to.** Recommend: keep the 2026-11-16 ruling (a mixed four on Deadly at 2.0 to 2.5 times the contract, still the best way to level), make the model's cap 2.5 and not 2.0, and count the whole program in the four's hours (Level 50 at about 75 h, not 165). Alternative: hold the four to 2.0 and re-fit the Level curve from Level 16 so the four reaches 50 in about 110 h, which slows the real player by a third again after three XP cuts in a fortnight.
5. **Every cast as a share of the caster's own blow.** Recommend: yes, one rule for damage casts, heals and shells, the five versions kept as the step between rune tiers (section B5). Alternative: add versions VI to X at skills 75 to 135, which moves the cliff from Level 110 to about Level 300 and keeps a second growth law to balance for ever.
6. **The bar budget.** Recommend: a family's offense rows fill at most 0.85 of the one offense lane and every new offense row names the row it shares a cooldown with. Necrotic and Storm then ship as a choice of element, at +5% for one and +10% for both at most. Alternative: let new spells add to the bar and cut kill XP each time, as on 11-19 (twice).
7. **Training past the career line.** Recommend: leave the flat rate you ruled, and say plainly what it is for: bringing a new or neglected skill up (a back-row Defense, a hero that changed weapon), never a power buy past skill 50. One skill level at 82 costs 83 yard hours for +0.6% damage. Alternative: a rate that grows with the skill, which turns the yard into the cheapest gold-for-power offer in the game.
8. **Blessings.** Recommend: all three cost about three hours of a lone hero's net gold at its Level (about 34,000 at 50 and 63,000 at 105, against 2,250 at 70 today), free under 30 as now, so a player on Normal can skip them and a player on Deadly pays. Alternative: keep today's price and accept that Blessings are a tax nobody notices (6,345 gold spent by all real players, ever).
9. **Inner Flame.** Recommend: keep the skill and the lore, remove the bench hours: bones burn by a loot rule set once ("burn at the Hearth", beside "sell" and "keep"), no hero time, same XP a bone. Alternative: cut the skill and fold bones into Hearth Cinders.
10. **Fists and the sword ways.** Recommend: fists ship only after change 5 (their strikes are already "a share of own blow" rows and their heal is a share of max HP, so they are the one family that needs no rework), on the scoped promise already ruled. No change to the sword ways (slow alone on purpose, 0.85 to 0.96 of the hammer, measured). Alternative: none offered.

---

## B. The nine questions

### B1. The pace, the Deadly four, and where "struggle or pay" shows up

**What was asked.** The reference table shows a Deadly four at 1.8 to 2.6 times the pace contract with no death from Level 30 to 118, real players measure 2.9 to 3.0, and Level 50 comes in 72 hunted hours against the table's 165. Which is wrong, and which lever gives way?

**What is ruled** (the model's 2.0 cap is PROPOSED; these are RULED and newer): a mixed four on Deadly lands about 2.0 to 2.5 times the pace contract and is "still the best way to level" (2026-11-16); Normal "isn't meant for parties"; one difficulty for every group (11-08); outside your weight class "you're gonna waste money but get more exp and possibly die a few times" (11-06); no Level penalty and no Level read in a blow (11-04, 11-18); "they should be struggling more than they are, if they aren't dying at all they should likely be wasting money" (11-19, a direction).

**The rerun** (MEASURED, `node tools/balance-program/measure.mjs what --at slake|pyre|hold --seat four --patch '{"level":N}' --hours 2 --seeds 2`, and `tohit-ratio.mjs play --seat four --at ford --level 40 --hours 2`). The real four did not stand where the reference points are. It hunted the Slake at 47 to 63, Pyre Field at 60 to 72 and Krell's Hold at 69 to 79: 5 to 31 Levels under the point, and 6 to 16 under the ground's own band floor.

| Ground | Four at the reference Level | x contract | Four at the real Level | Level XP an hour | x contract at its OWN Level | Damage taken | Deaths (8 hero-hours) | Low HP p10 | Real players |
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

**Fists** (dark; RULED identity 11-18: the self-sufficient all-rounder, within 15% XP, comfortable alone). Their two mechanics are the two that already scale: the strikes are shares of the wraps' own blow at half a weakness, and the own heal is 0.8% of max HP a second. So fists are the one family the spell rule does not have to rework, and the right family to ship first after it. Their XP gap on pack grounds (the Sewer -27%) is a missing area row, not a number. BUILD, phase 12 as planned, after change 5, so tiers 3 to 7 are sized once.

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
