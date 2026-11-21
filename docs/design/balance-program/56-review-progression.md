# Balance program 56: design review, progression, skills and endgame

Review of `lane/d-review-progression` (game-designer, 2026-11-21), cut from `set/v0.2.144`. PHASE A was reading and analysis only. No game code, data or migration was changed in either phase. Briefs of record: `45-design-brief.md` (main) and `40-formula-brief.md` (every change below names its LAYER: formula, coefficient, curve or content row).

Labels. EVIDENCE names its source: REAL (`10-real-players.md`), MEASURED (an older dive's engine run, cited by file), READ FROM DATA (a file in `src/`), RULED (rulings-of-record, with the date), COMPUTED (arithmetic in this file on the game's own rows, not played). HYPOTHESIS is a design claim phase B or a playtest must test. Nothing here was measured by this lane.

**PHASE B (2026-11-21, section 0 below).** Merged `set/v0.2.144` at 358417cb0 and read 44 (sections 5, 7, 8), 46 and 47. Three patches were played through `balance-matrix.mjs --diff --subset --workers 2`, and two derived tables were read off the cached full grid with `tools/balance-program/review-progression.mjs` (new, this lane, no play). Sections 1 and 7 are updated to the measured result. Sections 2 to 6 are phase A as written, and section 0 says where the numbers changed them. `51-baseline.md` had not landed when this was finished, so every cell from Level 185 up is PROVISIONAL (skills still run in a straight line there).

---

## 0. Phase B: layers, measurements, what changed

### 0.1 Every top proposal at its layer

| # | Proposal | Layer | 44's ids | Patch or tool | Measured? |
|---|---|---|---|---|---|
| 1 | The Level law | **curve**, derived from a content table (the ruled hours) and one coefficient (the pace seat's multiple) | formula P01, exceptions P-X01 to P-X03, roadmap **R13** (after R12) | `patches/progression-1-level-law.json`, `review-progression.mjs law` | yes, matrix and grid |
| 2 | Blessings 4 to 7 | **content rows** on the Blessing ladder. No formula moves: P28 stays 6% | P28, P-X18, P-X20, call 14 of 44 section 8.2, roadmap R15 for the price | `patches/progression-2-fourth-blessing.json`, `review-progression.mjs deaths` and `cost` | grid yes. The matrix cannot see it (0.3) |
| 3 | Deaths per 100 hours and XP after deaths on the hunt card | none. A display of a server-held rate | reads S6 and P28 | none | HYPOTHESIS. Playtest in section 6 |
| 4 | Remove the rested bank | **formula** (delete P30 and its argument on P05) | P30, P-X26, roadmap R5 | `patches/progression-3-rested-off.json` | yes, an identity patch |
| 5 | Remove the two old kill ladders | **formula** (two multipliers leave the kill path) | with Luck v3.1, lane L20 | none: the harness heroes hold no kill counts, so the matrix cannot reach them | HYPOTHESIS that nothing moves. The check is a fixture with 20,000 kills |
| 6 | Honors | **content rows**, derived on read | none | none | HYPOTHESIS about use. Playtest in section 6 |
| 7 | Kindlings on Inner Flame | **content rows** on existing channels, inside one budget | 47 conflict C10. The 2% Add budget of 23-5 | none until a sample of five exists | HYPOTHESIS |
| 8 | Rune tiers respaced | content rows | 44 call 9, 47 C12, roadmap R22 | none | **Withdrawn** (0.5) |
| 9 | Crafting's late product | content rows | 47 row 4a, C13, lane L32 | none | HYPOTHESIS about the chain |

### 0.2 Patch 1: the Level law. Flags: IMPROVED 4, REGRESSED 1, UNINTENDED 7

The patch leaves Levels 1 to 50 alone, ramps 50 to 100, and carries `H = 0.643 x L^1.485` at 2.0 times the contract from Level 100. No fight moves (every DPS, damage, kill, gold and death cell reads +0.0%). Hours for a Level rise 60 to 123% from Level 60.

**The matrix (MEASURED, subset, 207 cells, same dice).**

| Flag | Band | Where | Before | After | Trace |
|---|---|---|---|---|---|
| IMPROVED | P1, hours to the ruled Level over the ruled hours | Level 100, the pace seat | 0.417 RED | 0.651 RED | Still fast: Levels 1 to 50 are untouched and the four does them in 62 hours against 168 |
| IMPROVED | P1 | Level 200 | 0.490 RED | 0.876 off | |
| IMPROVED | P1 | Level 300 | 0.464 RED | 0.950 ok | |
| IMPROVED | P1 | Level 400 | 0.497 RED | 1.002 ok | |
| REGRESSED | P12.to300, hours for a Level, at most 12 | Level 185 | 5.9 ok | 12.4 off | **The band is wrong, not the law.** P12 is PROPOSED ("a Level a day"). The RULED table itself needs 14.4 hours a Level from 200 to 300. P12.to300 should end at about Level 150 or read 15 |
| UNINTENDED, toward | R2, days of open content | the pace seat reaches Level 110 | day 25 RED | day 39 RED | Wanted, and the band group name did not match my target. Open content alone cannot reach 120 days on any curve. Staged content does (below) |
| UNINTENDED, away | G-10, standing prices of a band over the band's net gold (ruled 1.2 to 1.4) | Levels 60, 110, 185 | 0.39, 0.66, 0.38 RED | 0.19, 0.40, 0.18 RED | A band now lasts about twice as long, so it earns twice the gold against the same typed prices. This is trace 1's economy row, now measured |
| UNINTENDED, away | E4, MID to BiS gold over the band's net gold (ruled 1.0 to 1.4) | Levels 60, 110, 185 | the same three numbers | the same | The same cause |

The six UNINTENDED gold rows are one finding: **the Level law cannot ship before prices are a share of band gold (44's R16).** 47 says the same from the item plan's side (its R13 row). The roadmap order R12, R13, then R16 leaves a release where every sink is half price. R16 should land with R13.

**The full grid (MEASURED rates, derived hours; `review-progression.mjs law`).** The subset has six checkpoints and the grid has 31, so this is the finer read, and the two disagree past Level 200.

| Level | The pace seat's XP an hour over the contract | Hours today | Hours on the law | Ruled | Lone MID on Normal: day today | day on the law |
|---|---|---|---|---|---|---|
| 50 | 2.83 | 62 | 62 | 168 | 12 | 12 |
| 100 | 2.05 | 257 | 416 | 600 | 42 | 68 |
| 110 | 1.85 | 315 | 509 | | 51 | 82 |
| 185 | 1.43 | 953 | 1,715 | | 122 | 215 |
| 200 | 1.57 | 1,068 | 1,960 | 1,680 | 136 | 245 |
| 300 | 1.49 | 1,817 | 3,754 | 3,120 | 225 | 456 |
| 400 | 1.45 | 2,948 | 5,962 | 4,580 | 352 | 704 |

Doors for the pace seat, day at 12 hours, today and on the law: Krell's Hold 16 and 27. End of open content 26 and 42. End of staged content 79 and 143. Level 200 on day 89 and 163.

What this changes:

1. **The pace seat has no single multiple today.** It earns 2.8 times the contract at Level 50, 2.05 at 100 and about 1.45 from 185 on. Phase A assumed one number (2.3). A law fitted at 2.0 is therefore 31% fast at Level 100 and 30% slow at 400 on the grid. The matrix subset reads Level 400 as exact, so the two reads of Level 400 differ by 30%, and both are PROVISIONAL there.
2. **So the law cannot be fitted now, by anyone.** The multiple becomes one number only after the kill reward is derived (44's R12) and Deadly's dials land (L16). Until then any curve is a fit to grounds that are about to move, which is the habit this proposal exists to end. This confirms the order in 44's roadmap.
3. **I withdraw my power law and take 44's form** (its call 13): the ruled table of hours is the law, joined on a log scale, and the curve is derived from it and the contract. It is exact at every ruled point, where mine ran 11% and 22% fast at Levels 750 and 1,000. Same idea, better statement.
4. **The runway.** Staged content lasts to day 143 on the law, against the ruled 120. Open content lasts to day 42. So the curve plus opening what is built meets the target, as phase A said.
5. **A lone hero pays for it.** Level 100 moves from day 42 to day 68 and Level 200 from day 136 to day 245. REGRESSED for "solo viable", and it is the direct result of the 11-21 ruling that the table is the four's clock. Section 7, call 1.

### 0.3 Patch 2 and the death tables. Matrix flags: 0, 0, 0

**The matrix cannot see a death's cost.** Halving the death share (`deathLoss` x0.5) moved no cell and no band. Two reasons: the subset's two-hour cells record almost no deaths (the grid's own Deadly cells read 0 deaths a 1,000 hours in all but three), and no band reads XP after deaths (S8 and S9 are a printed table by ruling 50-4). So today a change to the death rule, in either direction, passes the matrix silently. For the baseline lane: one band, "the hardest tier a kit holds pays more a head after deaths than the same heroes alone on Normal", read at the ruled counts.

**The derived table (MEASURED XP an hour from the cached grid, the RULED death counts of S6, `review-progression.mjs deaths`).** XP an hour a head after deaths, in thousands. "Alone" is the same four heroes each hunting alone on Normal. Low and high are the two ends of the ruled count (MID Deadly 50 and 100, MID Dangerous 10 and 30, BiS Deadly 10 and 30).

| Level, gear | Alone on Normal | Deadly gross | Deadly, 3 Blessings, today's curve (low..high) | Deadly, 3 Blessings, on the law | Deadly, the ladder, on the law |
|---|---|---|---|---|---|
| 100 MID | 576 | 1,004 | 871..739 | 776..548 | 890..776 |
| 145 MID | 686 | 1,321 | 943..565 | 673..24 | 997..673 |
| 200 MID | 1,272 | 2,059 | 1,220..380 | 472..under zero | 1,663..1,266 |
| 300 MID | 2,147 | 3,237 | 1,030..under zero | under zero | 2,627..2,016 |
| 400 MID | 3,114 | 4,534 | under zero | under zero | 3,858..3,182 |
| 200 BiS | 1,327 | 2,154 | 1,987..1,651 | 1,837..1,202 | 2,075..1,916 |
| 400 BiS | 3,259 | 4,764 | 3,707..1,594 | 2,600..under zero | 4,628..4,358 |

The first checkpoint where the four earns less a head than the same heroes alone on Normal ("none" means never, to Level 400):

| Curve | Kit and tier | 3 Blessings, low count | 3 Blessings, high count | The ladder, low | The ladder, high |
|---|---|---|---|---|---|
| Today | MID Deadly | 185 | 145 | none | none |
| Today | MID Dangerous | 400 | 225 | none | none |
| Today | BiS Deadly | none | 300 | none | none |
| The law | MID Deadly | 145 | **100** | none | 145, then level with it (below) |
| The law | MID Dangerous | 300 | 165 | none | none |
| The law | BiS Deadly | 325 | 185 | none | none |

What this changes:

1. **Phase A's finding is confirmed for Deadly and was too strong for Dangerous.** On today's curve a blessed MID four leaves Deadly at Level 145 to 185. Dangerous at the low end of its count holds to Level 400. So the game does not collapse to hunting alone at Level 200. It collapses tier by tier: Deadly first, then Dangerous at 225 to 400.
2. **The Level law makes the death rule worse, and the two must ship together.** The law raises total XP 1.7 to 2.2 times, so every death costs that much more. On the law with three Blessings, MID Deadly is under alone-on-Normal at Level 100 at the top of its count, and BiS Deadly at 185. That is inside content that is built today.
3. **The ladder works, re-timed.** Phase A placed the rungs at Levels 160, 255, 410 and 650 from arithmetic. On the measured rates they belong at **100, 185, 275 and 400**. With them a fully blessed death costs the pace seat at most 6.0 hours at every checkpoint but one (Level 165 reads 11.2, a weak cell). Every tier stays over alone-on-Normal at the low end of its count. MID Deadly at the TOP of its count (100 deaths a 1,000 hours) sits level with alone-on-Normal from Level 145: 2% under at 145, under 1% at 200, 6% under at 300, 2% over at 400. That is the right place for it. A mid-geared party at the top of the Deadly count should be at break-even, and one at the bottom should be well ahead (+31% at Level 200).
4. **The rule should be stated by hours, not by Level.** "A new Blessing opens when a fully blessed death would cost over about five of the pace seat's hours." The Levels are then rows the generator writes from the curve, and they move with it.

One death, in the pace seat's hunted hours (`review-progression.mjs cost`): today unblessed 10.6 at Level 100, 36 at 200, 60 at 300, 102 at 400. On the law 18, 68, 133 and 208. On the law with the ladder 2.3, 4.3, 4.1 and 3.3.

### 0.4 Patch 3: the rested bank off. Flags: 0, 0, 0. The identity holds

Capping the rested quantum at zero moved no number in 207 cells and no band. The patch is `kind: identity` and the diff exited 0. Removing the bank is free. This agrees with 44 (P-X26, CONFIRMED, roadmap R5).

### 0.5 What changed since phase A

| Phase A | Now | Why |
|---|---|---|
| Top 1: a fitted power law, fitted "after L16" | **The ruled table of hours is the law (44's form). It lands at R13, after R12, and with R16** | The pace seat's multiple is 2.8 to 1.45 today. The gold bands halve without R16 |
| Top 2: Blessings at Levels 160, 255, 410, 650 | **At 100, 185, 275, 400, stated as a rule in hours. It ships with the Level law, not after** | Measured rates. The law brings the break to Level 100 |
| "Past Level 200 four heroes alone on Normal is best" | **Deadly by 145 to 185, Dangerous by 225 to 400 (today's curve)** | The derived table |
| Call 5: rune tiers at 1, 20, 40, 60, 80 | **Withdrawn.** I agree with 47 C12: the Sealing Rune at Runecrafting 75 and 88 now, rune tiers at 75 and 90 with R22 | Respacing moves a number ruled on 10-23, and the plan already had a product for the gap that I had not read |
| Crafting: take the three salts out | **Take them out in the linings lane (L32), not before** | 47 C13: until linings ship they are all Crafting makes at 45, 60 and 75 |
| Kindlings capped at one weapon-tier step | **Capped at the 2% that 23-5 gave to worn in. No Kindling touches drops or Magic Find or copies a jewelry perk** | 47 C10's three fences. I accept all three. Kindlings also take over the job worn in was designed for (47 M12): two heroes with the same sword end up different |
| HYPOTHESIS: gear bands compound and outrun HP past 400 | **Answered by 44.** The code's projector is linear. The standard's words compound. Rule the step by its size (44 call 19) | 44 section 5.2 |
| Honors | Unchanged. It gains the items review's find list (47 C19) and is the content of the Hall of Firsts (58) | |
| Rested bank: REMOVE | Unchanged, now MEASURED | Patch 3 |

Verdict counts after phase B: KEEP 31 (the rune ladder returns to KEEP as ruled), REDESIGN 3, MERGE 4, REMOVE 4, ADD 3, DEFER 2.

### 0.6 Where the other documents decided something here

| Source | What it says | My position |
|---|---|---|
| 44 call 13, R13 | The ruled hours are the law, the curve is derived, Level 400 stays 4,580 | **Agree.** Adopted in place of my power law |
| 44 call 14 | Keep 6% flat. Price the Blessing set at a share of the hours it saves | **Agree, and it is not enough alone.** A fair price does not stop Deadly paying less than Normal. The price rule and the ladder are two halves: the ladder holds the hours a death costs, the price rule charges for them |
| 44 P-X18 | Take Inner Flame off the list of skills a death takes progress from | **Agree.** It is trained at the Hearth |
| 44 call 15 | Let the yard's rate follow the skill level's cost | **Disagree for now.** The flat rate is ruled (11-14), and it only fails near Level 1,000. Decide it when a hero is past Level 300 |
| 44 call 10 | Skill keeps its worth through what it unlocks, not by multiplying gear | **Agree.** It is why rune tiers past 60 matter more than I gave them credit for |
| 44 call 19 | Rule a gear step by its size | **Agree.** It answers my compounding hypothesis |
| 47 C10 | Lift the tree hold for a Kindlings spec only, three fences | **Agree** |
| 47 C12, C13 | Sealing Rune, not a respacing. Salts leave with linings | **Agree.** Both of mine withdrawn |
| 47 C19 | Luck keeps two feeds. No luck track in a build system | **Agree** |
| 46 change 5 | A mark every five Levels into six tracks | **Same hole, found independently. That is evidence the hole is real.** I recommend Kindlings over marks: marks put a build choice on Level, which the game has kept out of the blow twice, and add a system where Kindlings reuse one |
| 46 change 3, seam 9 | Inner Flame is a dead end and should fold into one Great Hearth | **Same conclusion about the skill, found independently.** The two fixes fit: one Hearth, and what a hero gets from it is its Kindlings |
| 46 section 7, item 9 | Take the capped death rule | **Same problem, different fix.** The Director and I both say 6% with three cheap Blessings is a fee and not a risk. The ladder keeps the ruling's words and gets the cap's effect, paid in gold |
| 46 change 3 | The Tower and the Catacomb descent become one mode | **Disagree, as 47 does.** 46 was written without ruling 22-4 (fight on what you carried down). Judge the merge after the descent has been played with it |
| 46 change 4 | Ground that deepens past its band | For the world review. It is a better answer to the day-42 end of open content than new Levels of curve, and it fits the soft wall of section 2.1 |
| 57 (social) | Party XP for size alone | Not mine. Either way the party table decides the pace seat's multiple, so R13 waits for it too |

---

## 1. One screen for Tyler

**Verdict on the area.** The skills are sound. The long game is not. Hearthrise has thirteen skills and most of them earn their place, because players really do send resting heroes to the rocks and the benches. What does not hold together is everything a player is meant to chase after the first month. Levels come more than twice as fast as you ruled. The Level table is a hand-fitted patchwork that gets re-cut every time a ground changes. The death rule and the Deadly death count you ruled on 11-21 cannot both stand beside "a four on Deadly is the best way to level". And the things to collect are spread over six tiny systems that no player has ever used.

If we were designing this area from scratch today, we would keep the skills, the uncapped Level, the Tower, the Bestiary and Luck. We would not build the Level table the way it is built, we would not have a regen skill nobody decides anything about, and we would have one book of honors, not six.

**The five changes that matter most.**

1. **Your table of hours becomes the Level law, and the grounds are fitted to it.** The table you ruled (600 hours to Level 100, 1,680 to 200, 4,580 to 400) is the law. The XP a Level costs is worked out from it and never typed. Today the four reaches Level 100 in 257 hours against your 600, and the table has been re-fitted nine times in four weeks because it chases the grounds. Measured: a law of this shape moves the end of built content from day 79 to day 143. It has to land together with prices as a share of a band's gold, or every sink halves. It cannot be fitted until the kill reward and Deadly are settled, because today the four earns 2.8 times the contract at Level 50 and 1.45 times at Level 200.
2. **Blessings 4 to 7.** Keep 6% flat with no cap. Add a new Blessing whenever a fully blessed death would cost more than about five hunted hours. Measured, that is Levels 100, 185, 275 and 400. Each one halves what a death still takes and each costs more gold. Without this, measured on today's game, a blessed mid four on Deadly earns less than the same four heroes hunting alone on Normal from Level 145 to 185, and Dangerous follows from Level 225. The Level law makes it worse, because a death costs a share of a bigger total. On the law Deadly breaks at Level 100. So these two changes ship together.
3. **Inner Flame becomes the hero's build.** Today it is a regen number that 9 of 12 real heroes parked at 17 to 24. Bones, Tower Cinders and the rare named fuels already feed it. Every ten Flame levels the hero lights one of three Kindlings, a small permanent choice. This is the skill tree you put on hold, built out of a skill we already have and paid for with drops we already have. Build it after the combat laws land.
4. **One page of Honors.** Titles, boss Trophies, the Hearthfinds, Trophy room mounts, Tower and boss firsts and round Levels become one list with one rule. Level 100, 200, 300 and 400 each give a title and a line to the whole server. You ruled that Level 200 is a big deal. Today nothing in the game marks it.
5. **Remove three dead ladders and give Crafting a product.** Rested XP pays zero on every path, and switching it off moved no number in 207 measured cells. Two old kill ladders still sit in the code beside the new Bestiary. Crafting is 86% sawing planks and gets the linings step. I have withdrawn my change to the rune tiers. The item plan already had a better answer for Runecrafting 61 to 99.

**Actively harming the game today.**

- The pace. Levels at 2.3 times the ruled speed are why content runs out on day 26.
- The Level table chasing the grounds. Every ground tune moves every player's Level cost.
- 6% of total XP with a flat death count. Together they switch Deadly off as Levels rise, and they make parties worse than hunting alone. That is the opposite of what both rulings were for.
- Six collection systems with two to five rows each. Zero real uses on five of them.

**What I would add.** Blessings 4 to 7, the Honors page and Kindlings. Nothing else. I looked at a new skill, a prestige or rebirth loop, and Level-up stat points. None of them fits. The game does not need more systems in this area. It needs the ones it has to lead somewhere.

**Where I think you are wrong.** You ruled 6% flat with no cap and a flat Deadly death count on the same day. I am not asking you to reverse either. Measured, the two together break your 11-16 ruling that a four on Deadly is the best way to level, from Level 145. Blessings 4 to 7 is the way to keep all three. The Game Director reached the same problem on his own and would take the cap instead.

**One thing the measuring found that nobody asked.** The balance matrix cannot see what a death costs. I halved the death rule and not one band moved. Until a band reads XP after deaths, a change to the death rule passes every check silently.

---

## 2. Systems review

### 2.1 Level and the Level curve

**What it is for.** The score, the gate to gear tiers (1, 15, 30, 45, 60, 75, 88, then bands at 110, 125, 145, 165) and to grounds. A Level gives +10 HP and +10 mana and nothing else (READ FROM DATA, `core-model.js` VITALS). No blow reads a Level (RULED 11-04, 11-18).

**Does it earn its place.** Yes. Uncapped Level is the identity. Keep it exactly as a score that power does not read directly.

**What is wrong is the table, in three ways.**

1. **It is 2.3 times too fast for the seat it is ruled on.** RULED 11-21 (call 1): the table is the clock of a MID four on the hardest tier it holds. EVIDENCE (the brief's known evidence, the baseline): that four reaches Level 100 in 257 hunted hours against 600, and Level 400 on day 245 against 382.
2. **It is not a formula.** `LEVEL_CURVE` is sixteen hand-fitted brackets. Its own header records nine re-fits or hand re-cuts between 10-27 and 11-20 (READ FROM DATA, the comment block: Wickstead, walk-on, ground formula, one difficulty, the Brook Bear, the x0.88 kill, Levels 1 to 9, Levels 7 to 9, past the ceiling). Each was caused by a ground or kill-XP change. This is the brief's "fixing balance problems individually" in its purest form: a ground's XP fit and the Level curve are two knobs on one target, and both get turned.
3. **Its shape past Level 100 is an accident of the fit.** COMPUTED from `xp.js` and the contract `1385 x L^1.274`: a Level costs 11.2 lone hours at 100, then 11.5, 11.5, 11.6 and 11.8 at 150, 200, 250 and 300, then 20.7 at 400 and 25.6 at 500. Two hundred Levels in a row cost the same, then the cost nearly doubles inside one hundred. Level 200 is ruled "a big deal" (RULED 10-14) and on this table it is the same day as Level 199 and Level 150.

**Recommendation (curve layer).** One law from Level 100: cumulative pace hours `H(L) = 0.643 x L^1.485`, and the XP a Level costs is `H'(L) x contract(L) x the pace seat's multiple`. COMPUTED against the ruled table:

| Level | Ruled hours (10-25, on the four per 11-21) | The law | Off by | Hours for this Level, law | Hours for this Level, today's table |
|---|---|---|---|---|---|
| 100 | 600 | 600 | 0 | 8.9 | 11.2 |
| 200 | 1,680 | 1,683 | 0% | 12.5 | 11.5 |
| 300 | 3,120 | 3,067 | -2% | 15.2 | 11.8 |
| 400 | 4,580 | 4,703 | +3% | 17.5 | 20.7 |
| 500 | 6,720 | 6,551 | -3% | 19.5 | 25.6 |
| 750 | 13,440 | 11,960 | -11% | 23.6 | 31.6 |
| 1,000 | 23,520 | 18,330 | -22% | 27.2 | 34.5 |

Two coefficients replace six brackets, every Level costs a little more than the last, and the ruled table holds inside 3% to Level 500. It runs fast at 750 and 1,000, which are three and four years out at 12 hours a day. Under Level 100 the early table stays as ruled (6, 36, 168, 600 hours) and the new-player contract of 11-20 stays (no Level under 10 over 2 hours).

**And the dependency is turned round.** The curve is the law and never chases a ground again. A ground is fitted to the contract with the one XP-fit dial it already has (MEASURED 21 B8: an XP fit on 14 of 15 grounds). A ground that pays over the contract is a ground number, fixed on the ground. Under this rule the nine re-fits above would have been zero.

**Do unlimited Levels need diminishing returns, and where.** Reviewed lever by lever:

| Lever | Growth today | Diminishing already? | Verdict |
|---|---|---|---|
| Level to HP and mana | +10 flat | Yes, relative: +0.47% at Level 200, +0.24% at 400 | Keep. No new rule |
| Level cost in hours | Flat 100 to 300, then a step | No, lumpy | The one law above. This is the only place Levels themselves need a diminishing rule |
| Level cost past the last ground | XP an hour stops rising at the top ground while the cost keeps rising | Yes, by itself: a Level at 250 on a Level 185 ground costs about 1.5 times the table (COMPUTED, (250/185)^1.274) | Keep. This is the right soft wall and needs no code. RULED 10-14: over-levelled hunting is fine |
| Combat skill | Cost x1.04 a level for ever. A level is worth 2% damage at Level 10 and 0.5% from 110 (MEASURED 21 B3). Skill 129 at Level 400 | Yes, strongly. "Uncapped" is true in name only past about 130 | Keep. Say so on the yard screen (ruled 21-7) |
| Gear bands past 185 | +5 to 8% a band every 20 Levels, compounding (50-standards 1.4, PROJECTED) | **No. It is the one exponential in the hero.** 1.065^(L/20) is x3.5 at Level 400 and x23 at Level 1,000, while HP grows x3.3 and x8 | HYPOTHESIS, handed to the formula audit: a band's step should shrink as bands stack (a power law of Level), or gear outruns every other lever past about 400 |
| Luck | 100 x n^2 a rank | Yes, a square root | Keep (RULED 11-20) |
| Inner Flame regen | P / (P + 50) | Yes | Keep |
| Death cost | 6% of total XP: grows with every hour ever hunted | **The reverse. It is the one cost in the game that accelerates** | Section 2.3 |

### 2.2 The thirteen skills

READ FROM DATA: `skills.js`, `recipes.js`, `gathering.js`. REAL use: `10-real-players.md` sections 6 and 7. Skill pace is the brief's known evidence (12 rested hours a day, 1 to 99: Smithing 44.5 days, Inner Flame 37.6, the rest 68 to 89, inside the T1 band of 60 to 120 except Smithing).

| Skill | What it is for | Consumer | Real use | Earns its place? |
|---|---|---|---|---|
| Melee, Ranged, Magic | What a hero IS. They do not move with the weapon, so a style is an investment without a vocation | to-hit and max hit | every hunt | Yes. This is "distinct styles without rigid vocations" done properly. 4 of 12 real heroes changed weapon and paid for it in skill, which is the system working |
| Defense | Who the tank is. Trained by being aimed at | to-hit against the hero | Two populations: front row within 2 of main skill, back row 13 to 30 at Level 60 (REAL) | Yes. The back row's low Defense is the reason a party needs a front row. The to-hit ratio (RULED 21-1) repairs its value curve |
| Inner Flame | "What are bones for." HP and mana regen, +29% at 20, +50% at 50 | about 6% of a food bill at Level 60 (MEASURED 21 B7) | 16 bench hours ever. 9 of 12 heroes parked at 17 to 24. Zero use for 15 to 25 days | **Not as a skill.** After the ruled fix (bones burn by a loot rule, 21-9) it is a passive that rises by itself and asks for no decision, ever. Section 4.1 gives it a job |
| Woodcutting, Mining, Fishing | What a resting hero does. Three identical engines, three chains (logs to planks, ore to bars, fish to food) | Crafting, Smithing, Cooking, the House | 1,582 hero-hours, more than hunting (1,334) | Yes. I looked at merging the three into one "Gathering" skill. I would not: an account has four heroes and three chains, so "my miner, my fisher" is a real once-made choice, and all three are used |
| Farming | The timed chain: crops to drinks and meals | Cooking | The one town system all four real people use | Yes |
| Cooking | Food and drink for every hunt | every hero | 133 bench hours. Plain fish gets eaten. Meals were made once and never again | Yes. The buff meals are the items review's (already FIX in 23) |
| Smithing | Tools, whetstones, salts, metal jewelry. No armor or weapons (RULED 11-18) | gatherers, melee, Tempering | 117 hours. 34 axes and 34 picks | Yes |
| Crafting | Planks, arrows and bolts, two cloaks, a shield, beams | the House, bow heroes | 187 hours, 86% of them sawing. 7.5 hours of arrows | **Weakly.** 24 recipes. Three of them are temper salts that Smithing also makes at the same levels (READ FROM DATA: `mithril_temper_salts`, `rune_temper_salts`, `ember_temper_salts` sit in both lists). It has no product a player talks about |
| Runecrafting | A caster's supply | Magic, and now hammers and tanks (RULED 32-5, 11-19) | 33 hours | Yes, but **its ladder stops at level 60.** Five rune tiers at 1, 15, 30, 45, 60 and then nothing to 99 (READ FROM DATA). Storm and Bone at 25 and 40 (RULED 32-1) do not reach the gap. Thirty-nine levels with no product breaks band A7 |

**Is any skill missing.** No. I tested five candidates against the identity. A hide or leather skill: Crafting needs that work more than the game needs a fourteenth bar. Alchemy: Cooking already makes drinks, and one supply bench is cleaner than two. Enchanting: linings and curing are ruled and need no skill. Construction: the House is a gold and materials sink and a skill would only delay it. A trade skill: prices are the trade skill. Every one fails "do not add it because other MMORPGs have it".

**Should any be merged or removed.** None removed. Inner Flame and Crafting are redesigned (4.1 and section 3). The count of thirteen is right. What is thin is the top third of the capped ladders: from level 75 to 99 Cooking has 4 recipes, Crafting 5, Runecrafting 0 (READ FROM DATA). The ruled good batch (+2% to +10% yield by level) and the maker's mark at 99 are the right repairs and they are already in the plan.

**First principle.** Town skills are per hero. That is fine because Storage is the account's, so one crafter serves four heroes and nobody must level a skill four times. Flag: nothing on the screen says so, and a new four-hero account can easily level Mining on all four.

### 2.3 Death and Blessings

RULED: 6% of total Level XP and 6% of each combat skill's progress, no cap (11-09, 11-21 call 4). Blessings cut 25, 50, 75% (11-10). Deadly is judged by a flat death count at every Level (11-21 call 5; the October table is 50 to 100 deaths in 1,000 hours for a mid-geared party).

**The law underneath (COMPUTED).** On any Level curve shaped like the ruled table, 6% of total XP is worth about **3.2% of every hour the hero has ever hunted**. Fully blessed it is 0.8%. Check against 50-standards: Level 200 (1,680 h) gives 54 and 14 hours, Level 400 (4,580 h) gives 148 and 37. They match. So the cost of one death grows in a straight line with lifetime hours, for ever, while what a tier pays over Normal is a fixed multiple.

**What that does to tiers (COMPUTED from the law, to be measured in phase B).** A blessed four dying 100 times in 1,000 hours loses `0.1 x 0.008 x H` of each hour hunted:

| Level | Lifetime hours | Blessed death costs | Share of Deadly's earnings lost at 100 deaths / 1,000 h | at 50 / 1,000 h | at 25 (BiS, half of MID) |
|---|---|---|---|---|---|
| 50 | 168 | 1.4 h | 14% | 7% | 3% |
| 100 | 600 | 4.9 h | 49% | 24% | 12% |
| 145 | 1,040 | 8.4 h | 84% | 42% | 21% |
| 200 | 1,680 | 14 h | over 100% | 68% | 34% |
| 300 | 3,070 | 25 h | | over 100% | 62% |
| 400 | 4,580 | 37 h | | | 93% |

This reproduces the baseline's measured finding (EVIDENCE, the brief: a MID four's XP after deaths drops below Normal from Level 145 blessed and 75 unblessed). It adds the part the baseline does not say: **no flat death count survives this law.** Halving the count only doubles the lifetime hours at which the tier dies. Deadly ends for MID between Level 145 and 205, for BiS near 330, and Dangerous follows it a few hundred Levels later.

**The knock-on that matters most (HYPOTHESIS, COMPUTED).** When the harder tiers stop paying, a four moves to Normal. But Normal "isn't meant for parties" (RULED 11-16): a four a head on Normal earns 0.54 to 0.72 of a lone hero (MEASURED 21). So the best play past about Level 200 becomes four heroes hunting four grounds alone on Normal. That undoes "rewarding fours", drops the pace to the lone clock (2.3 times slower than the table you ruled) and empties every party ground at the top of the game. Three rulings (6% flat, the flat count, Deadly as the best way to level) cannot all hold.

**And in an idle game the death is not seen.** In Tibia a death is your mistake, made at the keyboard. Here it is a dice roll while you are asleep, read on a card in the morning: "You died. You lost two Levels." At Level 400 fully blessed that card says three days of play are gone. HYPOTHESIS: this is a quit moment. Only real players can say. The playtest is in section 6.

**Recommendation (content rows on the existing Blessing ladder, no formula change).** Keep 6% flat and uncapped, exactly as ruled. Add Blessings 4, 5, 6 and 7. One opens each time lifetime hours double: about Levels 160, 255, 410 and 650. Each halves what is left. Each costs more than the one before, on the same price rule already ruled for the first three (21-8: about three hours of a lone hero's net gold for the set).

| Level | Blessings a hero can hold | Fully blessed, a death costs | Unblessed |
|---|---|---|---|
| 100 | 3 | 4.9 h | 19 h |
| 160 | 4 | 4.9 h | 39 h |
| 255 | 5 | 4.8 h | 77 h |
| 410 | 6 | 4.9 h | 156 h |
| 650 | 7 | 4.8 h | 309 h |

Why this and not the cap you declined: the cap was free, and this is paid for. It is "struggle or pay" in gold. It is a gold sink that grows with Level, which the economy needs (the heaviest real account sits on 2.09M with nothing to want, REAL). The unblessed death keeps every bit of the fear you asked for. And it is how I remember Tibia doing it (seven blessings; from memory, to be verified before it is quoted to players). Blessings are used up by a death (RULED), so the bill follows the death count and therefore the tier.

### 2.4 Training

The yard pays one flat rate (RULED 11-14) and is for catching a skill up, not for buying power (RULED 21-7). KEEP. It is also the respec path of a classless game: a hero that changes weapon reaches skill 50 in 89 yard hours (MEASURED 21 B3). That is a real, priced decision and it should stay the only way to re-spec a style.

### 2.5 Rested XP

READ FROM DATA: `src/core/rested.js` holds a charge bank, a cap, a library road and a clan road. Every caller passes `restedQuantum: 0` (`src/core/member.js` 220 and 230, the note in `src/core/perks.js` 271). The clan grant is cut (RULED 11-20). The Library is runecrafting speed now (`perks.js`). So the mechanism is carried on every XP grant and can never pay. REMOVE. It is the formula brief's class 4, accidental complexity, and it sits inside the one XP formula.

### 2.6 The Tower, the Catacombs and the chest

22-endgame measured them and Tyler ruled all ten of its calls (11-20). I do not re-open any. My Game Director read:

- **"Thirty minutes a week" is not the Tower's failure.** An idle game's endgame should not ask for hours at the screen. The failure was that the top floor did not move for months (the heat wall) and the prize did not matter (+1%). Both are ruled fixed. After them the Tower is the one place a build is scored on something other than XP an hour, and it moves with every Level. That is enough. **Do not grow it into a daily mode.**
- **The six opens a week stay (RULED 50-6), so the second climb of a week still pays nothing.** That is acceptable once the board is weekly (RULED 27-4) and a new landing is a first worth having (section 4.2). A second climb is then for rank and for the next landing, and it is a choice.
- **The Catacombs on what you carried down (RULED 22-4)** is the right call and the best new decision in the endgame. HYPOTHESIS: a pack is a preset, so the packing decision is made in the first three descents and then repeats unchanged. It stays a decision only if deeper doors change what the right pack is. Only play can tell.
- **Would we build two modes from scratch.** No. One mode with two doors. That is already the ruled fallback if the carry-down rule does not play differently.

### 2.7 The Bestiary and Luck

Luck v3.1 and the stage ladder are ruled (11-20) and are the best-designed long chase in the game: sources that already exist, a bar that only fills, a square-root curve that cannot run away, nothing sold. KEEP, BUILD as ruled.

Two things to finish with it:

- **Three kill ladders exist and one is ruled.** `src/data/bestiary.js` and `src/core/trophies.js` (2,500 to 20,000 kills a monster for hidden drop and damage multipliers, a claim press, the damage arm switched off by `TROPHY_DAMAGE_ARM_ENABLED = false`) and `src/data/bestiary-charms.js` with `src/core/charms.js` (25 to 2,000 kills a class). Both are ruled cut (27-3). REMOVE them in the same lane that builds v3.1, or the game ships three answers to "how many wolves have I killed".
- **The curve re-fit helps it.** On today's pace a four passes a band in 100 to 130 hours and the 10,000-kill stage takes 50 to 85 (MEASURED 27 Q4), so it lands as the party leaves. On the ruled pace a band lasts about 2.3 times longer and the fourth stage lands in the middle of it. HYPOTHESIS for phase B.

### 2.8 Collections, trophies, titles

READ FROM DATA and REAL:

| System | Rows | Real uses | What it gives |
|---|---|---|---|
| Titles (`titles.js`) | 5 | 0 | words beside a name, a gold price after the kills |
| Boss Trophies | 2 (none past Level 50) | 6 dropped, 2 held | an item for a mount |
| Trophy room mounts | off sale (RULED 11-20), to be rebuilt | | display |
| The four Hearthfinds (`hearthfind.js`) | 4 items, 4 titles, a set title | 0 | bound item, title |
| Named Hearth fuels | one a ground or boss | 3 burns | colored flame, Flame XP |
| The Chronicle | 13 pages | | story |
| Collection log | cut (RULED 27-7) | | |
| Earned outfits | Key Warden and a few | | looks |

Each of these is a reasonable small idea. Together they are Tyler's worry exactly: several individually sensible systems that do not add up. Five catalogues, five server paths, four places on the screen, and no player has enough rows in any one of them to feel a collection. Section 4.2 merges them.

The Chronicle is different (it is story, it opens by place) and stays its own tab. Tamsin's Tally stays too: it is the one repeatable kill job, all four real people use it (85 taken, 176 paid, REAL), "Keep this task" already obeys the first principle, and its purpose (a named gear piece you are missing) is not the Bestiary's.

### 2.9 Customization that lasts

Today a hero's build is its weapon family, armor weight, bar and gear. All of it is swapped in a minute except the combat skills. There is no small permanent choice a player makes about a hero and remembers. RULED: the skill tree is on hold (11-05). Faction skills are ruled to matter (31-8) and are one bar ability a side. Companions are held (10-24). So the "long-term character customization" line of the identity has one ruled piece (the faction ability) and nothing else. Section 4.1.

---

## 3. Content rationalization

Verdicts: KEEP, REMOVE, MERGE, REDESIGN, ADD, DEFER. The eight criteria are given in full for every significant row in section 3.1.

| # | Thing | Verdict | One-line reason |
|---|---|---|---|
| 1 | Level, uncapped, +10 HP and mana | KEEP | the identity, and already diminishing in relative terms |
| 2 | The Level table (`LEVEL_CURVE`, 16 brackets) | REDESIGN | one law past 100, the curve is canonical, grounds are fitted to it |
| 3 | The capped XP table (99) | KEEP | genre-standard, understood, in the T1 band |
| 4 | The combat skill curve (15 x s^2 x 1.04^(s-1)) | KEEP | its own diminishing rule, Tibia's shape |
| 5 | Melee | KEEP | |
| 6 | Ranged | KEEP | |
| 7 | Magic | KEEP | |
| 8 | Defense | KEEP | makes the front row |
| 9 | Inner Flame | REDESIGN | ruled loot rule now, the build layer later (4.1) |
| 10 | Woodcutting | KEEP | not merged: three chains for four heroes |
| 11 | Mining | KEEP | |
| 12 | Fishing | KEEP | |
| 13 | Farming | KEEP | the one town system every real player uses |
| 14 | Cooking | KEEP | meals are the items review's |
| 15 | Smithing | KEEP | 44.5 days is fast but inside the red line |
| 16 | Crafting | REDESIGN | give it the linings cut-and-stitch step as its late product. The items review checks whether the three salts it shares with Smithing are a second recipe on purpose |
| 17 | Runecrafting ladder | REDESIGN | tiers at 1, 20, 40, 60, 80 so 61 to 99 is not empty |
| 18 | Death at 6% flat, no cap | KEEP | ruled twice |
| 19 | Blessings 1 to 3 at the ruled new price | KEEP | |
| 20 | Blessings 4 to 7 | ADD | section 2.3 |
| 21 | Net-of-death XP and deaths per 100 hours on the hunt card | ADD | makes risk a preparation decision. Extends ruled 21 "the card reads the server's measured line" |
| 22 | The yard, the House dummy, training items | KEEP | the respec path |
| 23 | Rested XP | REMOVE | pays zero on every path |
| 24 | The skill tree (held) | MERGE | into Inner Flame. Not a second system |
| 25 | The Burning Tower | KEEP | as ruled 11-20. Do not make it daily |
| 26 | The Catacombs descent | KEEP | as ruled (carry-down). One mode, two doors if it does not play differently |
| 27 | The Hearth Chest and reforging | KEEP | as ruled |
| 28 | Bestiary stage ladder (Luck v3.1) | KEEP | build as ruled, first |
| 29 | The per-monster trophy ladder (`bestiary.js`, `core/trophies.js`) | REMOVE | ruled cut, hidden multipliers, a press with no decision |
| 30 | The class charm ladder (`bestiary-charms.js`, `core/charms.js`) | REMOVE | ruled cut |
| 31 | The Luck account bar | KEEP | |
| 32 | Titles | MERGE | into Honors |
| 33 | Boss Trophy display | MERGE | into Honors. The drops stay drops |
| 34 | Trophy room mounts | MERGE | into Honors: a mount is how an honor is shown at home (matches RULED 11-20) |
| 35 | The four Hearthfinds | KEEP | ruled to stay. Listed on the Honors page |
| 36 | Named Hearth fuels | KEEP | they gain a real use with 4.1 |
| 37 | Earned outfits | KEEP | the prize an honor gives |
| 38 | Honors page with Level milestones | ADD | section 4.2. A merge of five, not a sixth |
| 39 | The collection log | REMOVE | ruled 27-7 |
| 40 | The Chronicle | KEEP | story, its own tab |
| 41 | Tamsin's Tally | KEEP | |
| 42 | Leaderboards, six weekly | KEEP | as ruled 27-4 |
| 43 | Scaled hunts | KEEP | as ruled. The consumer of old-ground Bestiary stages |
| 44 | Faction skills | KEEP | as ruled 31-8. Build layer one of two |
| 45 | Companions | DEFER | held by ruling. If built, it does not fight |
| 46 | Game modes (Ironman, Hardcore) | DEFER | after launch, per account (ruled 27-9) |
| 47 | Prestige, rebirth, Level-up stat points | do not add | an uncapped Level already is the prestige loop. Stat points would put Level into the blow, which is ruled out |

**Counts.** KEEP 30. REDESIGN 4. MERGE 4. REMOVE 4. ADD 3. DEFER 2. Rejected ideas 1 row.

### 3.1 The eight criteria for the significant rows

**Row 2. The Level law (REDESIGN).**
1. Player value: every Level is a little further than the last, so round numbers mean something. A ground patch never moves your Level bar.
2. Depth: none added. It is a score.
3. Uniqueness: it replaces a patchwork, it duplicates nothing.
4. Interaction: section 5, trace 1. It touches everything timed in Levels.
5. Balance: this IS the framework fix. Two coefficients, one multiple, no brackets past 100.
6. Complexity: lower than today. One generated server table, as now.
7. Long-term: valid to Level 1,000 and past it.
8. REDESIGN.

**Row 9 and 24. Inner Flame as the build layer (REDESIGN, MERGE).** Section 4.1.

**Row 16. Crafting (REDESIGN).**
1. Player value: the bench has a product worth naming. Today its answer to "what do you make" is planks.
2. Depth: which lining to cut for which ground.
3. Uniqueness: each fighting style then has a bench (Smithing whets melee, Crafting feeds bows, Runecrafting feeds casters, Cooking feeds everyone). Crafting is the only one without a late product.
4. Interaction: linings are ruled and cured in the Cellar (RULED 11-20). The cut-and-stitch step before curing becomes a Crafting recipe, so hides have a bench and Crafting has a Level 80+ job. HYPOTHESIS until the items review confirms the linings chain has room for it.
5. Balance: content rows only.
6. Complexity: small.
7. Long-term: linings last 12 hours of hunting (RULED), so the demand never ends.
8. REDESIGN, handed to the items review.

**Row 17. The rune ladder (REDESIGN).**
1. Player value: a Runecrafter has something new at 80 instead of nothing after 60.
2. Depth: none.
3. Uniqueness: none.
4. Interaction: the store sells every tier (CITED 23: a lone Graven Mage pays 29.6k an hour at the store), so who may CAST a tier does not change. Self-made deep runes arrive later, so the store sink and the rune market grow a little between Runecrafting 45 and 80. HYPOTHESIS: no combat effect. Phase B checks that no cast reads the Runecrafting level.
5. Balance: five row edits.
6. Complexity: trivial.
7. Long-term: closes A7 for this skill.
8. REDESIGN.

**Row 20. Blessings 4 to 7 (ADD).**
1. Player value: a death at Level 300 is a bad morning, not a lost week.
2. Depth: how many Blessings to carry on which tier is a real, remembered choice ("keep me blessed: all, the first three, none").
3. Uniqueness: extends a ladder, adds no system.
4. Interaction: section 5, trace 2.
5. Balance: one rule ("each Blessing past the third halves what is left, and one opens each time lifetime hours double"). No exception, no Level threshold in a formula: the unlock Levels are content rows.
6. Complexity: four rows and their prices.
7. Long-term: it is the only version of the death rule that still works at Level 650.
8. ADD.

**Row 21. Net-of-death on the hunt card (ADD).**
1. Player value: the player sees what a tier really pays before pressing.
2. Depth: this is the risk decision of the whole game, and today it is invisible.
3. Uniqueness: none duplicates it.
4. Interaction: steers ground and tier choice, raises the worth of BiS and of a healer.
5. Balance: it reads the server's measured line. No formula.
6. Complexity: medium. The server must hold a death rate a ground, tier and party shape. Server cost to the platform review.
7. Long-term: grows more useful as stakes grow.
8. ADD, as an extension of the already ruled card line.

**Row 23. Rested XP (REMOVE).** Player value lost: none, it has never paid. Complexity removed: one module, one edge file, one argument on every XP grant. REMOVE.

**Rows 29, 30. The old kill ladders (REMOVE).** Ruled. Player value lost: none, no screen shows them. They hold a hidden +3% drop lever outside every budget. REMOVE with the v3.1 build.

**Rows 32 to 34 and 38. Honors (MERGE, ADD).** Section 4.2.

---

## 4. Missing opportunities

From brief 45 section 5. Three, and only three.

### 4.1 Long-term character customization: Kindlings on Inner Flame

**The idea.** Every ten Inner Flame levels a hero lights one **Kindling**: a small permanent passive picked from three. The pick is made at the Great Hearth, remembered, and changed by burning Cinders. Regen stays as the skill's base effect.

**Why Hearthrise specifically.**
- The game is named for the Hearth, and the Hearth's skill is a 6% discount on food. The namesake should be where a hero is shaped.
- Every input already exists and already drops in every hunt: bones and the family fuels (every kill), Hearth Cinders (the Tower chest: 3,600 a hero a week at Platinum, MEASURED 22), named fuels (one super-rare a ground or boss). None of them has a use a player cares about today.
- The skill is uncapped on the x1.04 curve, so Kindlings come quickly early and ever more slowly for ever. That is a diminishing, endless customization track with no new curve.
- It is the "skill tree later, as its own system" that Tyler held on 11-05, without building a system. The combat dive already wrote the rules any tree must obey (21 B9): it may swap which row fills a lane, move a rating inside the Add pool capped at one weapon-tier step in all, or change town work. It may never multiply. Kindlings are sized inside exactly that.
- It works with automated hunting because it is pure preparation. It is chosen in town, saved with the setup and copied to another hero.

**What a rung looks like (a sample shape only, not rows; the sample of five is authored and played before any batch, CLAUDE.md §10).** Each rung offers one choice from each of the three jobs a hero can do: hold, kill, keep alive. For example a rung might offer "regen counts double under 30% HP", "the first blow on a fresh monster cannot miss", or "food heals a tenth more". Each is a rating or a permille on an existing channel.

**The eight criteria.**
1. Player value: a hero becomes yours. Two hammer tanks at Level 150 are no longer the same hero.
2. Depth: a real build choice every few days early and every few weeks late, with a cost to change.
3. Uniqueness: nothing else in the game is a permanent small choice. The faction ability is the other build layer, and two layers is the limit.
4. Interaction: section 5, trace 3.
5. Balance: every Kindling is a row on a channel the engine already has. The whole track is capped at one weapon-tier step. No new formula.
6. Complexity: high for this area. A catalogue, a pick RPC, a Hearth screen, the stack table of the plan (30 section B) gains one lever, and every rung needs a played sample. It must not start before the to-hit ratio and the spell rule are live, or it is balanced twice.
7. Long-term: uncapped by construction. A Level 400 hero still has a next Kindling.
8. ADD by redesign of Inner Flame. Build after waves 1 and 2.

**Only players can tell** whether the picks feel like a build or like a tax form. The test: author five rungs, give them to the beta, and read (a) the share of heroes whose picks differ from the most common set, and (b) whether anyone re-lights. If over 80% of heroes of a weapon family hold the same picks, the choices are false and the design is wrong.

### 4.2 Meaningful milestones between upgrades: one page of Honors

**The idea.** One list in the Book. An honor is one row: a condition the server already counts (kills of a creature, a boss felled, a landing reached first, a Level, a Hearthfind held, a named fuel burned) and a prize that is never power (a title, a mount for the House, an outfit piece, a line to the server). Titles keep their gold price after the kills (RULED 11-04), so the sink survives. Level 100, 200, 300 and 400 are honors with a server line.

**Why Hearthrise specifically.**
- Past Level 88 a mid four gains about a Level a day on the ruled pace and a gear band comes every 15 to 20 Levels. Between them the game names nothing (MEASURED 27 Q2: the day and week cells at 110 and 150 are EMPTY). Honors land in those gaps without any new content, because they are counted from kills, floors and Levels that already happen.
- Towns are shared, so a title and a House mount are seen. A solo idle game cannot use that. This one can.
- It removes four small systems' worth of catalogue, server path and screen, and it gives the rebuilt Trophy room (RULED 11-20) its content.

**The eight criteria.**
1. Player value: there is always a named thing about to land, and Level 200 is an event.
2. Depth: little. "Which honor do I go for" and "which title do I wear". This is accomplishment, not strategy, and I am not claiming more.
3. Uniqueness: it replaces titles, the trophy display, mounts and firsts. It adds no sixth list.
4. Interaction: scaled hunts gain a consumer (old-ground honors). The Bestiary page and the Honors page read the same counters. No power, so combat, gear and parties are untouched.
5. Balance: no lever. Derived on read like a Bestiary stage, so nothing is stored that can drift.
6. Complexity: medium. One catalogue shape and one page replace four. The claim presses go (stages claim themselves, as 23 already asked).
7. Long-term: grows a row with every creature, boss and landing.
8. ADD as a MERGE. Start with a sample of five (the two Trophies, one title, Level 100, a first Platinum landing), play it, then expand.

**Risk, said plainly.** A list of achievements is the most generic system in games. It is worth building only if every prize is worn or mounted where other players see it. If it becomes a checklist in a menu, cut it.

### 4.3 Risk as a preparation decision: the death line on the hunt card

Rows 20 and 21 together. Hearthrise's fights are automated, so the only interesting question about danger is the one asked before the hunt: what does this ground, on this tier, with this party, cost me in deaths, and is it worth it. Today the card says "Monsters hit much harder" on every ground (PLAYED by 21). With the measured deaths per 100 hours and the XP after deaths on the card, and a Blessing ladder that keeps the answer from being "never" at high Levels, the tier pick becomes the deepest standing decision in the game. No active-combat mechanic is involved.

### 4.4 Looked at and rejected

- **A fourteenth skill.** Section 2.2.
- **Prestige or rebirth.** Uncapped Levels are the prestige loop already. A reset would fight "Level 200 is a big deal".
- **Stat points a Level.** Puts Level into the blow (ruled out twice) and adds a second build layer beside Kindlings.
- **A daily Tower.** Section 2.6.
- **A catch-up boost for later heroes on an account.** The second real account reached Level 50 in half the time with no help (REAL). Knowledge is the catch-up. A boost would be a paid-feeling XP lever.

---

## 5. Interaction traces

All HYPOTHESIS until phase B runs them through the matrix diff. Each names what should be flagged IMPROVED, REGRESSED or UNINTENDED.

### Trace 1. The Level law, timed on the four (rows 2)

| Touches | Expected effect | Watch for |
|---|---|---|
| Progression | Level 100 at 600 four-hours, not 257. End of open content from day 26 to about day 60, end of staged content to about day 131 (50-standards 2.7 lone MID column becomes the four's). The 120-day runway (RULED) is met by opening what is already staged, with no new region | IMPROVED: R2. REGRESSED: a lone hero is 2.3 times slower than the table past 50. Check "solo viable" still reads as viable at 12 h |
| Combat | Skills are earned by the hour, Levels now come slower, so a party hero's skill catches the career line (REAL: 7 to 10 under at Level 60 today) and a lone hero runs ahead of it | UNINTENDED: monsters authored on the career hero get easier for lone heroes and for late fours. The to-hit ratio's reference hero must be re-read after the re-fit |
| Gear | A band lasts 2.3 times longer in hours. Chest pieces under Level 88 stop being outgrown before they drop (22 finding 4), with the weekly limit unchanged (RULED 50-6). BiS-in-a-band (B1) gets easier | IMPROVED: B1, E5. Check that Tempering's rungs do not all finish in the first third of a band |
| Economy | Gold earned a Level rises 2.3 times past 50. The second to fourth hero arrive at lower Levels. Every sink priced "per Level" (Blessings, the yard fee) is paid for longer at each price | UNINTENDED: purses pile up per Level. The economy review must re-read G-bands in gold a Level, not gold an hour |
| Crafting | A town skill takes the same days, so 99 arrives near Level 110, not near 185. Top-tier home supplies are available earlier relative to Level | Check T3 (home-made share on Deadly) does not pass 80% |
| Parties | The pair and three bands (1.2 to 1.5, 1.5 to 2.0, RULED) now decide real days. The pull toward owning four heroes gets stronger | Check the lone-to-four gap does not read as "you must buy slots" before Level 33 |
| Endgame | Bestiary fourth stage lands mid-band. Luck's +16% at 500 h arrives near Level 90. Tower landings come every 20 Levels, about three weeks | IMPROVED: 27 Q2 cells at 110 |
| Order | Deadly's new dials (ruled 21-3, lane L16) change the multiple of the pace seat. Fit the law AFTER L16, or it is fitted twice | dependency |

### Trace 2. Blessings 4 to 7 and the death line (rows 20, 21)

| Touches | Expected effect | Watch for |
|---|---|---|
| Progression | A fully blessed death holds near 5 hours from Level 100 to 650. Deadly stays positive for a blessed MID four at the bottom of the death count and marginal at the top, at every Level | Measure XP after deaths by tier at 100, 145, 200, 300, 400 with and without the ladder. REGRESSED if Deadly is under Dangerous for blessed BiS anywhere |
| Combat | No formula moves. Death rate is whatever the tier dials give | none |
| Economy | A new sink that scales with Level and with the tier a player picks. Sized by the ruled rule: a death on Deadly at Level 255 costs five Blessings | Check the full set never costs more than the death it saves is worth in hunted gold, or nobody buys it and the tier collapses anyway |
| Gear | BiS halves deaths, so BiS saves Blessing gold as well as XP. Demand and price for BiS pieces rise | Bought gold (Crowns for gold) buys safety. Allowed by RULED 50-11 (only WHAT is limited), but say it on the legal list |
| Parties | A healer cuts deaths, so its seat is worth more at high Levels. Hunting alone on Normal stops being the best high-Level play | IMPROVED: P9, B9. UNINTENDED if every four must carry a healer past 200 |
| Crafting | none | |

### Trace 3. Kindlings (rows 9, 24)

| Touches | Expected effect | Watch for |
|---|---|---|
| Combat | One more Add-pool lever, capped at one weapon-tier step for the whole track | The plan's stack table (30 B) must still close under its cap at 60, 110, 185, 400 |
| Economy | Bones stop being vendor trash and get a market price. Sold-bones income falls a little. Cinders gain a second sink, so "stoke or burn" (RULED 11-14) becomes a real choice | The Tower's Cinder supply (140k Flame XP a hero a week at Platinum, 22) may outrun bones. Size the track on both |
| Gear | A Kindling may make one attribute better for one hero, which is what makes two tanks choose different sidegrades | Must never be worth more than a Tempering rung in gold terms |
| Crafting | none planned | |
| Parties | Hold, kill and keep-alive picks let a hero lean into its seat | UNINTENDED: a fixed best trio that cements one party shape. The 80% test in 4.1 |
| Progression | A reward clock on the Flame bar, fastest early, never ending | Re-light cost must make a pick matter without trapping a new player in a bad one. Free to change under Flame 30 |

### Trace 4. Honors (rows 32 to 34, 38)

No power, so the trace is short. Gold: titles' prices stay a sink. Server: derived on read from existing counters, one world line for a Level honor (rate-limited as Trophy lines are). Scaled hunts gain demand. UNINTENDED to watch: a Level-milestone server line at 10,000 players is thousands of lines for Level 100. Keep the line for 200 and above, and show 100 to friends and clan only.

### Trace 5. Ladder repairs and removals (rows 16, 17, 23, 29, 30)

Rune tiers respaced: store rune spend rises between Runecrafting 45 and 80, the rune market gets a wider gap to fill, no cast changes. Crafting takes the lining cut: hides need a price floor, and the Cellar's curing queue (RULED 11-20) gets its input from a bench, not from the bag. Rested XP and the old ladders leave: no player-visible change. Phase B proves "no change" by diffing the matrix with the hidden +3% drop arm removed.

---

## 6. Priority

| # | Change | Class | Complexity | Risk | Expected benefit | Depends on | Evidence or hypothesis |
|---|---|---|---|---|---|---|---|
| 1 | The Level law: one formula past 100, canonical, on the four's clock | **Critical** | M. One curve file, one generated table, the pace guard re-pinned | Medium. It slows every real player past 50 by about 2.3 times. No live hero survives the wipe, so no migration | The ruled pace holds, the runway target is met with staged content, the re-fit churn ends | After the Deadly dials (L16) and the spell rule (L17), so the pace seat's multiple is final | EVIDENCE: 257 h against 600, day 26 against 120, nine re-fits in the file's own header. The law's fit is COMPUTED |
| 2 | Blessings 4 to 7 | **Critical** | S. Four rows, prices, the bless-again preset | Low to build. Medium to rule: it softens a thing Tyler ruled hard | Deadly and parties survive past Level 145. A Level-scaled gold sink | Blessings re-price (ruled 21-8). Measure after change 1 | EVIDENCE for the problem (baseline: 145 blessed, 75 unblessed). The law and the fours-go-solo consequence are COMPUTED. The fix is HYPOTHESIS |
| 3 | Deaths per 100 hours and XP after deaths on the hunt card | **High** | M. A server-held rate a ground, tier and party shape | Low | The tier pick becomes an informed decision | The tally that records lowest health (ruled, Krell update 2) | HYPOTHESIS that players use it. REAL that the card's words are the same on every ground |
| 4 | Remove rested XP and the two old kill ladders | **Remove or simplify** | S to M. Module deletes and one chain-retire | Low. Nothing pays today | Less code inside the one XP formula. One hidden drop lever gone | With the Luck v3.1 build | EVIDENCE: `restedQuantum: 0` on every caller. Ruled 27-3 |
| 5 | Rune tiers at 1, 20, 40, 60, 80 | **Medium** | S. Five rows | Low | Closes 39 empty levels | The spell rule keeps five versions (ruled 21-5) | EVIDENCE: READ FROM DATA |
| 6 | Honors: one page, one rule, Level milestones | **High** | M. One catalogue, one page, four small systems retired | Low. No power, no ledger | A named thing between every gear band. Level 200 becomes an event | The Bestiary page (same counters). The Trophy room rebuild | REAL: zero uses on titles and Hearthfinds. HYPOTHESIS that one list is used where five were not |
| 7 | Crafting: linings cut-and-stitch, duplicate salts out | **Medium** | S to M, in the items lane | Low | The fourth bench has a late product | Linings (ruled, after combat) | REAL: 86% sawing. The chain fit is HYPOTHESIS |
| 8 | Kindlings on Inner Flame | **High**, built late | L | High. A new power lever and a new screen | The game's one permanent build choice, fed by drops that have no use today | Bones by loot rule (ruled 21-9), the to-hit ratio, the spell rule, the stack table | REAL: Inner Flame is unused. Everything about the fun is HYPOTHESIS |
| 9 | Gear band steps past 185 as a power law, not a compounding percent | **Medium**, for the formula audit | S once decided | Low now, high if left to Level 400 | Hero power terms grow on one family of curve | The formula audit (41 to 44) | HYPOTHESIS, COMPUTED from the projected band rule |
| 10 | The Tower stays weekly. No daily mode | **Low** (a decision not to build) | none | none | Keeps the endgame idle | Ruled 22 changes | Design judgment |
| | Companions, game modes | **Defer** | | | | Held by rulings | |

### Where only real players can tell, and the playtest

| Question | Why the engine cannot answer | The test |
|---|---|---|
| Is a death read on the morning card a quit moment at high Level? | The engine counts deaths. It does not count who logs in the next day | Beta telemetry: for every death costing over one Level, did the account press anything within 48 hours, against the same account's normal return rate. Red if returns drop by a third |
| Does the slower table past 50 feel like progress or like a wall? | Pace is measured. Patience is not | The two heavy real players have already felt Levels 50 to 75 at today's speed. Ask them after a week on the new table. Also read sessions a day from Level 50 to 60 before and after |
| Are Kindlings a build or a formality? | Needs many heroes choosing | The 80% sameness test in 4.1, on five sample rungs |
| Is one Honors page used where five lists were not? | Zero uses today is partly zero players | Titles worn per hundred heroes past Level 30, weekly. Under 10 after a month means cut the page |
| Do Levels 7 to 10 hold new players now? | The 11-20 re-cut is fitted on the engine | First-week cohort: share of new accounts that reach Level 10. The only two light real players quit at 7 to 9 |
| Does the Catacombs pack stay a decision? | A solver packs perfectly on day one | Count distinct packs a hero uses over four weeks of descents |

---

## 7. Tyler decides

Each is one recommendation with its reason, and the strongest alternative in one line.

1. **Your table of hours is the Level law, and the law never chases a ground.** Recommend: approve 44's roadmap step R13 as written (the ruled hours joined on a log scale, the XP a Level costs derived from them, the contract and the pace seat's multiple), with two conditions from the measurement. It lands in the same release as prices as a share of band gold (R16), because alone it halves every sink against a band's gold. And you accept what it does to a hero alone: Level 100 on day 68, not day 42, and Level 200 on day 245. That is your 11-21 ruling that the table is the four's clock, now with its price shown. *Alternative: time the table on the lone hero again, and accept that fours finish built content on day 79.*

2. **Blessings 4 to 7, in the same release as the Level law.** Recommend: keep 6% flat with no cap, and open a new Blessing whenever a fully blessed death would cost over about five hunted hours (measured: Levels 100, 185, 275, 400). Each halves what is left. Each is priced by 44's rule, a share of the hours it saves. An unblessed death keeps the full bite. Reason, measured: with three Blessings a mid four on Deadly earns less than the same heroes alone on Normal from Level 145 to 185 today, and from Level 100 on the new Level law. With the ladder a party at the bottom of the Deadly count is 31% ahead at Level 200 and a party at the top is at break-even. *Alternative: the cap you declined on 11-21, which the Game Director also recommends.*

3. **Inner Flame is the skill tree.** Recommend: lift the 11-05 hold for a spec and a paper sample of five rungs only, as 47 (C10) also recommends. No wheel, no new system. Every ten Inner Flame levels a hero lights one of three Kindlings. The whole track spends the 2% that was set aside for worn in, touches no drop and no Magic Find, and copies no jewelry perk. Built after the to-hit and spell lanes. Three reviews found this hole independently. Reason: the game has no lasting build choice, and this skill already has every source and no purpose. *Alternative: keep Inner Flame as regen with the ruled loot rule, and leave the game without a permanent build layer until after Early Access.*

4. **One page of Honors.** Recommend: titles, Trophy display, Trophy room mounts, boss and Tower firsts and round Levels become one list with one rule, no power, prizes that other players see. Level 200 and above get a line to the whole server. Reason: five systems with two to five rows each have had almost no real use, and nothing marks the Level you called a big deal. *Alternative: leave them apart and only add the Level milestones as four titles.*

5. **Runecrafting 61 to 99.** Withdrawn as a call. I recommended respacing the five rune tiers. 47 (C12) is right that it moves a number you ruled on 10-23 and that the item plan already fills the gap: a Sealing Rune at Runecrafting 75 and 88 now, and rune tiers at 75 and 90 later. I agree with that recommendation.

6. **Crafting keeps its place and gets a product.** Recommend: do not merge Crafting away. Give it the cut-and-stitch step of linings, and take out the three temper salts it shares with Smithing in that same lane (L32), not before. Reason: each fighting style should have a bench, and Crafting is the bow's. *Alternative: merge Crafting into Smithing as one "Workshop" skill of twelve.*

7. **The Tower stays a weekly beat.** Recommend: build the ruled fixes and stop there. Reason: an idle game's endgame should score your preparation, not your hours at the screen. *Alternative: lift the six opens a week so more climbs pay, which you kept on 11-21.*

8. **No new skill, no prestige, no stat points.** Recommend: none of the three. Reason: section 4.4. *Alternative: none offered.*

---

## 8. For other areas

| To | What |
|---|---|
| Formula audit (41 to 44) | (a) The Level curve as a formula: `H'(L) x contract(L) x pace multiple`, with the early table and the new-player contract as its only content rows. (b) Rested XP is class 4, accidental complexity, inside `grantXp`. (c) The gear band step past 185 compounds while HP is linear: one family of growth curve for every hero power term. (d) 6% of total XP is 3.2% of lifetime hours on any power-law curve: put that identity in the formula inventory so nobody tunes death rate without it. (e) The curve and each ground's XP fit are two knobs on one target: name the curve as the law |
| Combat review | The pace seat's multiple must be final before the Level law is fitted. After the re-fit, party heroes' skills catch the career line and lone heroes pass it: re-read the reference hero. Kindlings need a line in the bar budget and the Add pool |
| Items review | Crafting's late product (linings cut). The three duplicate salts rows. Twelve Hearth fuel rows (`Dragon Bones`, `Vampire Dust`, `Demon Shard`, `Lich Soul`, `Void Chitin`, `Ancient Claw` and the rest) and `void_banquet` are named for creatures that no open ground places and break the naming rule: on the orphan list, or renamed when their creature ships. BiS gains value from fewer deaths: price it |
| Economy review | Blessings 4 to 7 as a Level-scaled sink: size the price so the set is always worth buying. Gold a Level rises 2.3 times after the re-fit: re-read every band that is "per Level". Bones get a use and lose their Shop income |
| Party review | COMPUTED: past about Level 200 on today's rulings, four heroes alone on Normal out-earn a four on any harder tier. Confirm or kill it in the matrix. A healer's seat is worth more as death cost grows |
| Endgame, home | Trophy room mounts are the Honors display. Tower and Catacomb landing firsts are honors and pay a Cinder lump (a Kindling's fuel). The Great Hearth screen is where Kindlings are lit |
| Retention review | Honors is the "named thing about to land" for the EMPTY cells at 110 and 150. The death card is a suspected quit moment: add it to the launch dashboard |
| Platform review | A held death rate a ground, tier and party shape for the hunt card. Honors derived on read, no stored state |
| Game Director lane | My answer to the from-scratch question for this area: same skills, same uncapped Level, same Tower, Bestiary and Luck. A different Level table, a death rule with a paid way out, one honors list, and the Hearth as the place a hero is built |

---

## 9. Evidence and hypotheses

**EVIDENCE**

| Claim | Source |
|---|---|
| The MID four reaches Level 100 in 257 h against 600, Level 400 on day 245 against 382. Open content ends on day 26 | the brief's known evidence (baseline grid) |
| Net of deaths, a MID four on Deadly falls under Normal from Level 145 blessed and 75 unblessed at the top of the death count | the brief's known evidence |
| Skill pace at 12 h: Smithing 44.5 days, Inner Flame 37.6, the rest 68 to 89 | the brief's known evidence |
| `LEVEL_CURVE` is 16 brackets and was re-fitted or re-cut nine times from 10-27 to 11-20 | READ FROM DATA, `src/data/core-model.js` header |
| A Level costs 11.2 to 11.8 lone hours from 100 to 300, then 20.7 at 400 | COMPUTED from `src/core/xp.js` and the contract, this lane, `charXpForLevel` |
| Runecrafting recipes stop at level 60. Crafting has 24 recipes, three of them salts also in Smithing | READ FROM DATA, `src/data/recipes.js` |
| Rested XP pays zero on every path | READ FROM DATA, `src/core/member.js` 220, 230 |
| Two older kill ladders exist beside the ruled one. The damage arm is off | READ FROM DATA, `bestiary.js`, `bestiary-charms.js`, `core/trophies.js` 79 |
| Titles 5 rows, Trophies 2, Hearthfinds 4. Real uses 0, 6 drops, 0 | READ FROM DATA and REAL (`10-real-players.md` section 6) |
| Inner Flame: 16 bench hours, 9 of 12 heroes at 17 to 24 | REAL |
| Town work is 1.57 times hunting hours. Crafting is 86% sawing | REAL |
| Both light real players quit at Levels 7 to 9 | REAL |
| The Tower is one climb a week and its floors stop at about Level 80 | MEASURED, `22-endgame.md` |
| A four a head on Normal earns 0.54 to 0.72 of a lone hero | MEASURED, `21-combat.md` |

**COMPUTED here, to be measured in phase B**

- The law `0.643 x L^1.485` and its fit to the ruled table.
- 6% of total XP is 3.2% of lifetime hunted hours (0.8% fully blessed). Checked against 50-standards at Levels 200 and 400.
- The share of Deadly's earnings lost to deaths by Level and death count (table in 2.3).
- Blessing unlock Levels 160, 255, 410, 650 and the resulting cost of about five hours.
- Gear compounding against linear HP past Level 400.

**HYPOTHESIS**

- Past about Level 200 the best play on today's rulings is four heroes alone on Normal.
- The re-fit puts chest pieces, the fourth Bestiary stage and BiS inside their bands.
- After the re-fit a lone hero's skill runs ahead of the career line.
- Respacing rune tiers changes no cast.
- Linings have room for a Crafting step.
- Kindlings read as a build. One Honors page is used. A morning death card makes players quit. The Catacombs pack stops being a decision after three runs. Each has its playtest in section 6.

**Not done, and why.** No grid, matrix or browser run (phase A rule, the PC is loaded). `51-baseline.md` had not landed on the set when this was written, so its red list is quoted only through the brief's known evidence. Tibia's blessing count is from memory and is marked so. Nothing was played by this lane; every PLAYED fact is cited from dives 21, 22 and 27.
