# Balance program 61: the cold audit of the game review

Lane `lane/d-review-audit` (cold auditor, 2026-11-21), cut from `set/v0.2.144`. Under audit: `60-game-review.md`. The auditor wrote none of it. No game code, data or migration was changed.

Read for this audit: briefs 45 (with the addendum) and 40 in full. 60 in full. The rulings of record (the 11-18 to 11-21 entries in full, older entries by search). `30-decisions.json` (67 calls printed and compared). The phase B sections and call lists of 52, 53, 55, 56, 57 and 59. The summaries and call lists of 44 and 47, with 47's conflicts and MISSED list. 50 sections 2.4, 2.7 and 2.8. `10-real-players.md` and `11-krell-hunt` by search. Not read in full: 41, 43, 46 past its tables, 54 and 58 past the lines the review quotes. Nothing was re-measured. Every "audit arithmetic" line below is a ratio worked from numbers on the page and says so.

---

## 1. Verdict

**YES WITH FIXES. The calls must not go to the Rulings page until the 5 Critical and 14 High fixes below are in.**

The answer in section 0 stands. So do most of the 88 recommendations. What fails is the information wrapped around them, and that is the part Tyler rules on:

1. **The Ruling column is wrong or incomplete on 22 of 88 calls.** Seven calls name an old ruling and leave out a newer one on the same subject. Two are marked "New" for things Tyler ruled himself.
2. **Every "on the Level law" number comes from a trial curve that the progression review withdrew.** It is not the curve call G-6 recommends.
3. **Four top-10 items carry MEASURED on a number that was computed, assumed, or read from a harness the review itself says cannot be trusted for that reading.**
4. **Seven of the 15 convergence rows are not independent**, including the row that carries the second hero.
5. **Eight of the 13 MISSED items from the itemization fit are gone.**
6. **Brief 45 section 7 is not delivered.** There is no Critical, High, Medium, Low, Remove, Defer list and no expected benefit on any item.

| Severity | Count | Meaning |
|---|---|---|
| Critical | 5 | Tyler would rule on wrong information |
| High | 14 | A label, a number or a ruling cite is wrong in a way that changes how much weight a call deserves |
| Medium | 13 | Incomplete, inconsistent or unclear |
| Low | 8 | Wording and counts |
| Calls I would change | 6 | G-1, G-2, G-27, G-53, G-56, G-68 |

---

## 2. The fix list

### 2.1 Critical

| # | Where | What is wrong | The source that proves it | The exact fix |
|---|---|---|---|---|
| C1 | 4.1, 4.2, 4.3, 5.1 (progression-1), 5.2 row 1, 5.3, top 10 item 6, G-6, G-7, 0.3 item 2 | **Every "on the Level law" number is from a withdrawn curve.** The patch that was played is a power law at 2.0 times the contract. On the full grid it gives Level 100 at 416 hours (ruled 600), Level 200 at 1,960 (ruled 1,680), Level 300 at 3,754 (ruled 3,120) and Level 400 at 5,962 (ruled 4,580). The review then recommends a different curve, the ruled table itself (G-6), and quotes the trial curve's days and death hours as that curve's results | 56 section 0.2: "A law fitted at 2.0 is therefore 31% fast at Level 100 and 30% slow at 400 on the grid", "both are PROVISIONAL there", and item 3: "I withdraw my power law and take 44's form" | Relabel every such number "on phase B's trial curve (withdrawn, 31% fast at Level 100 and 30% slow at 400)". Remove "MEASURED: the law meets the ruled hours at 300 and 400" from top 10 item 6 and from 5.1. It is true only on the six-point subset and the 31-point grid contradicts it. State what the ruled table fixes by definition for the four: Level 100 on day 50, Level 200 on day 140, Level 400 on day 382. Say that Krell, Level 110 and Level 185 have no day on the ruled table until 44's joined curve is run. Audit arithmetic, direction only: on the ruled table a lone hero's Level 100 is nearer day 98 than day 68, Level 200 nearer day 210 than 245, and an unblessed death at Level 400 nearer 160 hours than 208. Ask the progression lane to re-run `review-progression.mjs law` on 44's form before G-6 and G-7 are ruled |
| C2 | 0 item 4, 0.1 row 8, 0.3 item 2, 3 row 6, 4.2, top 10 item 6, G-7 | **"MEASURED: Deadly pays less than Normal from Level 145" is not measured.** It is measured XP rates multiplied by an assumed death count, the ruled band of 50 to 100 deaths in 1,000 hours. The harness recorded 0 deaths in all but three Deadly cells. Real play recorded 1 death in 449 party hours past Level 45. Level 145 is the top of the band. At the bottom it is Level 185 | 56 section 0.3: "the grid's own Deadly cells read 0 deaths a 1,000 hours in all but three", "The derived table (MEASURED XP an hour from the cached grid, the RULED death counts of S6)". `10-real-players.md` line 403 | Label it COMPUTED everywhere: "if Deadly is tuned to the ruled death count, then from Level 145 (at 100 deaths) to 185 (at 50)". Add one sentence to 0.3 item 2: "At the death rate real fours had, 2 in 1,000 hours, Deadly never switches off. The problem appears only once the harder tiers lane makes Deadly as deadly as you ruled." |
| C3 | G-53 | **The newest ruling is left out and it says the opposite.** The call re-opens 11-08 only. On 11-20 Tyler approved 26-5: "The dummy keeps its price and pays for itself in 25 to 50 hours." The review's reason is "it pays back in 2.8 days". At 12 rested hours a day that is 34 hours, inside what he approved two days ago | `30-decisions.json` 26-5 (approved 2026-11-20). 55 section 10.4 | Ruling column: "**RE-OPEN** 11-08 and 26-5 (11-20)". Add to the reason: "You approved a payback of 25 to 50 hours on 11-20. This call asks you to reverse that." See section 3 for the recommendation I would make |
| C4 | G-56, 1.4, 2.6 | **The bench tax is marked "New". It is Tyler's own ruling.** 11-01: "a new work bench tax on all bench skills in the public area". And 26-1 (11-20) made "the bench with no fee" the first rung of every House room. With the tax gone that rung sells nothing. With G-76 also taking the speed rungs, a room's first purchase is empty | Rulings of record line 335 (2026-11-01). `30-decisions.json` 26-1. 55 row 139 argues "rooms sell themselves on speed", which 26-1 already cut | Split the call in two. G-56a, setup slots 4 and 5 free: RE-OPEN 11-05. G-56b, the bench tax: **RE-OPEN** 11-01 and 26-1, with the consequence stated. See section 3 |
| C5 | 2.3, 3, 5.2, 8.4 | **Eight of the 13 MISSED items of the itemization fit are dropped.** M2 the Fine order. M3 stirred grounds. M4 reference values, the no-mint guard and the rivet allowance, which 47 makes a gate on salvage (G-46) and commissions (G-44). M5 the late chest shape (two-attribute pieces from the Level 200 key, fusing). M7 staples by region material and reforging into a band. M8 region tables. M9 one market book a piece, which the idle market (G-50) has no answer for. M11 the placed-or-cut table for 22 old accessory rows | 47 section 4, rows M1 to M13. Tyler 2026-11-21: the plan is a source of record. A search of 60 finds no line for any of the eight | Add a table "From the itemization plan, still owed" to section 2.3 with all 13 rows and 47's lane for each. Add M4 as a condition on G-46 and G-44. Add M9 as a condition on G-50. Add M11 to the REMOVE row of 2.3 |

### 2.2 High

| # | Where | What is wrong | The source that proves it | The exact fix |
|---|---|---|---|---|
| H1 | 0.1 row 1, top 10 item 3, G-2 | **The second hero's convergence is circular.** In phase A the features review wrote "Level 10, price unstated, two people and a confound". In phase B it took the Game Director's number and wrote "confidence raised by convergence". The review then counts that as two lanes agreeing. The economy review said only that slots must not rise | 59 section 0.5, row C2. 55 as quoted in 0.1 | Row 1 reads: "46 alone proposed 10,000 gold. 59 saw the quit point in phase A, called it a confound, and adopted 46's number in phase B." Drop 55 from the row. Drop "with three lanes converging" from top 10 item 3 |
| H2 | 0 item 1, 0.3 item 1, 9.3, G-2 | **The size of the quit-point evidence is not stated.** The two light players are 18 of 1,334 hours between them, 1.4%. One of the two already had a second hero and left anyway. The baseline says the two causes "cannot be separated yet". Two other causes for the same two players are on record: Levels 7 to 10 are the slowest in the game (ruled fix 27-2, not built) and the coach opened the whole town at Level 7 | `10-real-players.md` lines 15 and 107. 30-plan row 2 ("Both light players quit here", 27-2). 59 section 4.2 | In 9.3 write: "The two light players are 18 hours in total. One had two heroes." In G-2 add: "The same two players are the evidence for the ruled fix 27-2 and for the Path. The test must ship 27-2 to both groups or it cannot tell the three causes apart." |
| H3 | 0.3 item 1 | **A stale time frame is used to argue against a ruling.** "At the 3.3 hours people really played it is over two weeks." Tyler ruled on 11-21 that every time number is on the 12 hour frame and real data calibrates rates, not hours | Rulings of record, "EVERY PLAYER HUNTS 12 HOURS A DAY" | Delete the sentence. The 12 hour number, about five days, is the only one that may stand |
| H4 | 0.1 row 10, 0 item 2, top 10 item 2, G-3 | **"Deadly needs no roles" is two phase B runs on the same faulty instrument, not two independent findings.** Both lanes used the harness whose healer takes 0.5% of the damage where the real one takes 28.5%. The review's own caveat says "no party survival number is trustworthy". The sizes also disagree: 52 read four mages at +2% and +7% kills, 57 at 8 to 15% | 52 section 10 (944 and 1,614 against 925 and 1,506). 57 line 17. 60 section 9.5 item 2 | Row 10: remove "measured separately", write "two phase B runs, one harness, direction only". Give both sizes. In top 10 item 2 the evidence cell says "MEASURED on the uncalibrated harness. Party survival is direction only until V4" |
| H5 | 0.1 header and rows 2, 6, 7, 11, 12, 13 | **"Each row was reached by at least two lanes on their own" is false for these rows.** Row 2: one side is ruling 25-1. Rows 6 and 7 count 47, which read every other document. Row 11: the speed rungs were already ruled cut on 11-20 (26-1). Row 12: the lowest-health tally is in plan lane L16, which every review read. Row 13: 44 is the merge of 41. Every lane also read the same four-player baseline, the same rulings and the same plan | 47 header ("What was read"). `30-decisions.json` 26-1, 25-1. 30-plan row L16. 44 header | Add a column "Independent?" with yes, partly or no. Rows 3, 4, 5, 9, 14 and 15 are yes. Row 1 is no (H1). Row 10 is no (H4). Rows 2, 6, 7, 8 are partly. Rows 11, 12, 13 are no. Change the sentence above the table to "Nine documents read one baseline of four players. Agreement on what that baseline shows is one reading, not nine." |
| H6 | G-27, 0.3 item 3, top 10 item 2 | **Rulings left out, and one sentence reads backwards.** (a) 21-3 (11-20) ruled the harder tiers "hit harder, and no softer than planned", and lane L16 raises Dangerous to 1400. Five was measured at today's dial, one seed, one hour a cell. Nobody has played five at the ruled dial. (b) 11-06 "tiers carry real risk alone" is not named. (c) "for 35 to 65% more XP and most of the hour's gold" reads as a gain. The hero loses gold in five of seven cells, from 4,900 to 39,300 an hour | `30-decisions.json` 21-3. 30-plan L16. Rulings line 90. 53 section 0.3 table | Ruling column: "**RE-OPEN** 11-16. Bears on 21-3 (11-20) and 11-06." Reword: "35 to 65% more XP than Normal, and it costs most or all of the hour's gold." Add: "Measured at today's dial, one seed and one hour a cell. Not yet played at the dial you ruled for L16." Add row to 5.2: "Dangerous on five with L16's dial, measured together" |
| H7 | G-3 | **Marked "New". It is ruled.** 21-3 (11-20): "Size it on a party that plays like the real one, with a healer and monsters that shoot the back row. A party at the right Level holds Deadly at a third to half health." Only the lineup test is new. The ruled order 31-9 (spells first, then Deadly) is not named either | `30-decisions.json` 21-3. Rulings, 31-9 (11-21) | Ruling column: "Builds 21-3 (11-20) and 31-9 (11-21). New: the two lineups that must fail. Keeps 10-31." Add L17 to "Depends on" in top 10 item 2 |
| H8 | G-54 | **The newest ruling is left out.** The call re-opens 11-14. On 11-20 Tyler ruled A-5 and 21-7: the flat rate stays, the yard is a catch-up system and the screen says what an hour buys | `30-decisions.json` A-5, 21-7 | Ruling column: "**RE-OPEN** 11-14, A-5 and 21-7 (11-20)" |
| H9 | G-68, 1.6, 2.6 | **A roadmap item is retired on the evidence that nobody used it, and four rulings are hidden under "Re-shapes the clan plan".** 25-3: the castle comes once clans have ten accounts. 25-4 and 31-3 (11-21): castle goods keep their built prices. 25-5: the treasury. No clan has existed, so "nobody used it" is the unbuilt-so-cut reasoning Tyler ruled out on 11-21 | `30-decisions.json` 25-3, 25-4, 25-5. Rulings, 31-3 and "NO CUTTING WHAT IS PLANNED FOR LATER" | Ruling column: "**RE-OPEN** 25-3, 25-4, 25-5 (11-20) and 31-3 (11-21)". Verdict in 1.6 changes from "REMOVE the old build" to "REDESIGN, build later". See section 3 |
| H10 | Top 10 item 5, G-5 | **"MEASURED for the cause" is wrong.** world-1 measured what the cause is not. It refuted phase A. That the missing kill-rate term is the cause is 44's analysis, and section 7.1 of the review says the derivation proof is "not yet run for any step". The "about a third" is COMPUTED in 53. Also, a typed "a third lower" on three grounds is the kind of hand number the kill reward exists to delete. The call asks for both in one step | 53 section 0.2 ("REFUTED", "COMPUTED"). 60 section 7.1 | Evidence cell: "MEASURED that the party fit is not the cause. The kill-rate term as the cause is 44's analysis, not yet proven by a derivation run. The third is COMPUTED." In G-5 replace "comes down about a third" with "is an output of the kill reward. 53 computes it lands about a third lower" |
| H11 | Top 10 item 7, 0.1 row 5, 3 row 4 | **"EVIDENCE: a four is out of open ground on day 27" is a projection.** No real account has passed about Level 79. And "0 real uses of scaled hunts" needs its own check: 22-9 (11-20) says scaled hunts "turn on" once their XP share is set, and the baseline shows one use in total. If the door was shut or the heavy players never outgrew a ground, zero uses proves nothing | 50 section 2.7 (a table of computed days). `10-real-players.md` line 287. `30-decisions.json` 22-9 | Label day 27 COMPUTED. State whether scaled hunts were open to the four players, and at what Level. If not, drop "0 uses" as evidence |
| H12 | G-9 | **Three rulings left out.** The call re-opens 11-07. It also changes 11-18 (linings stay reachable through scaled hunts, "starting in the 3rd region"), 22-9 (11-20) and 44's own recommendation to keep scaled hunts with derived shares | Rulings line 39. `30-decisions.json` 22-9. 44 section 8.1 row E-X11 | Ruling column: "**RE-OPEN** 11-07, 22-9 (11-20). Bears on 11-18 (lining parts from old grounds)". Add one line saying how a lining part still drops from an old ground |
| H13 | G-7, G-65, G-71, G-73, G-81, G-82, and the cites of G-10, G-44, G-75, G-76 | **Six calls change a ruling under a softer word, and four more cite the wrong thing.** The legend defines four words. These calls use "Amends", "Re-shapes", "Softens", "Pulls forward", "Reads" and "Changes". G-71 changes 25-10 (one press joins the whole account). G-81 changes 27-1 ("No hunt ever starts by itself", 11-20) and cites no id or date. G-10 changes 11-08 and re-orders 25-3, and its on-call cite should be 25-1. G-7 gives a paying player a blessed death of about five hours, tighter than the 12 hour cap Tyler turned down on 11-21 (50-4), and adds to the three Blessings of 11-10. G-65 changes 11-09. G-73 changes 26-6. G-82 changes 24-10. Wrong cites: G-75 changes 26-3 (a map for each deed) as well as 26-11. G-76 builds 26-1, not 26-2. G-44 changes a designer's call, not a ruling, and should say "New" | `30-decisions.json` 25-10, 27-1, 25-1, 26-6, 26-3, 26-1, 24-10. Rulings line 17 (50-4) | Use only the four legend words. Mark each of the six **RE-OPEN** with the id and date. Re-count 8.11. With G-68 (H9) and G-69 (M8) the number of calls that re-open a ruling is 23 of 88, not 15: the 15 counted, plus G-7, G-65, G-68, G-69, G-71, G-73, G-81 and G-82. Social and Features each read 0 in 8.11 and hold 3 and 2 |
| H14 | Section 6 as a whole | **Brief 45 section 7 is not delivered.** There is no list by Critical, High, Medium, Low, Remove or simplify, Defer. Only item 1 is called Critical. No item states its expected benefit, which is the first thing the ranking claims to sort by. Section 9.6 admits the eight-criteria sections of the reviews were not read, and no call shows the eight criteria of brief 45 section 4 | Brief 45 sections 4 and 7 | Add a "Priority" column to every table in section 8 with one of the six words. Add an "Expected benefit" column to the top 10, in player terms. Say which of the ten are Critical |

### 2.3 Medium

| # | Where | What is wrong | The source | The exact fix |
|---|---|---|---|---|
| M1 | 8 (all ids), 5.2 rows 1 and 8 | **Call ids collide with the standards' bands.** 50 already uses G-1 to G-12 for gold bands and G20 for a guard. The review itself writes "(G-10 from 0.39 to 0.19)" meaning the band, in a document where G-10 is "Playing together while away" | 50 section 2.4. 60 line 525 | Rename the calls (for example R60-1 to R60-88) before they reach the Rulings page, or write "band G-10 of the standards" at line 525 |
| M2 | 6 and 8.1 | **"The ten that matter most" is not the top 10.** Top 10 items 8 (bosses) and 10 (the return) have no call in 8.1. Dangerous on five, half of item 2, sits in 8.3 as G-27 | 60 sections 6 and 8.1 | Add a column to the top 10 naming every call each item needs: 1 is G-1. 2 is G-3, G-27. 3 is G-2, G-24, G-80. 4 is G-4, G-38. 5 is G-5. 6 is G-6, G-7, G-8. 7 is G-9. 8 is G-28, G-29, G-40. 9 is G-10. 10 is G-56, G-57, G-66, G-78, G-79 |
| M3 | 4.5, G-1, top 10 item 1 | **60 database-seconds is presented as the ruled number.** Tyler ruled $0.15. The 60 is COMPUTED from list prices that 50 marks ASSUMED, on shared cores, "so 60 is the best case". The 6 minute flush is a HYPOTHESIS in 59 and has a second option there (a 20 ms commit at today's pace). Neither label is on G-1 | 50 section 2.8. 59 section 0.2 item 3 | Write "60, COMPUTED from $0.15 and assumed list prices, best case". Label the flush HYPOTHESIS in G-1 and in the top 10 |
| M4 | Top 10 item 4, 4.4, G-4 | **"The game ends near Level 300 without it" overstates.** The source reads 0.91 of the pace at Level 400. Staged content ends at Level 185. The number is also from the engine probe, so it is MEASURED on stand-in grounds, not COMPUTED. G-4's Ruling column leaves out the 11-20 Luck numbers it re-keys | 42 line 15 and its table. 47 section 6 row C20 | Write "a hero in today's gear is 9% slow at Level 400 and cannot hunt at 2,000". Say the urgency is that the kill reward (item 5) needs it first. Add "and the 11-20 Luck numbers keyed by band" to the Ruling column |
| M5 | 0.1 row 12, 3 row 9, top 10 item 10 | **"Separates every death cell from every safe cell" is false.** Eight of the 17 cells under 50% had no death. Under Level 185 there are two death cells. The source calls it "EVIDENCE that the reading carries signal. PROVISIONAL" | 59 section 0.3 | Write "all 9 death cells read under 50%. So did 8 cells with no death. One seed, one hour, 115 of 207 cells at Level 185 or over" |
| M6 | G-18, 2.1 | **Quarry Blow is the strike Tyler chose on 11-21** (32-5, his own alternative: a hammer-only strike that spends an Earth rune). The call re-opens it hours later and names only 10-23 | `src/data/abilities.js` line 199. Rulings, 32-5 | Ruling column: "**RE-OPEN** 10-23 in a narrow form. Changes 32-5 (11-21): it keeps the Earth rune and gains the break" |
| M7 | Top 10 item 8, 0.1 row 6 | **"19 keys and no Hall fought" is one four in one measured hunt window of about ten hours.** The keys went to Storage during a hunt run for the Krell reading | `11-krell-hunt-2026-11-20.md` lines 88, 120, 197 | Write "one four, one ten hour window. THIN" |
| M8 | G-69, 1.6, 1.7 | **Removing the Local tab removes the ruled home of the town criers.** 11-11: NPCs call out tips "in local chat". The review keeps the Town Crier in 1.7 and removes its channel in 1.6 | Rulings line 393 | Add to G-69: "Changes 11-11. The criers' lines move to the town itself or to Global." Mark it RE-OPEN |
| M9 | 2.3 (REMOVE row), G-34 | **The 11-21 limit on the cut list is dropped.** The review removes "the wave 3 uniques (ruled 23-7)". Tyler's 11-21 ruling says each orphan is checked against the roadmap first (L36). The items review kept that limit. Also 80 "awaiting roster" items wait on monsters. If the 103 monster rows go first, those items lose their source and then fail the check | Rulings, "NO CUTTING WHAT IS PLANNED FOR LATER". 54 line 205 | Add "after L36 checks each against the roadmap" to the REMOVE row. Add to 5.2: "L36's item check before the 103 monster rows are deleted" |
| M10 | 0 item 4, 4.4 against 3 row 11 | **Two statements disagree on the 12 hour frame.** "From Level 110 gold only piles up" (a four passes Level 110 on day 27) and "an own four buys the whole shelf to Krell in about 14 weeks". On day 27 the four still has ten weeks of shelf to buy | 55 lines 24 and 96 | Write "No new sink appears past Level 110. The shelf is bought out in about 14 weeks, and gold piles up from then." |
| M11 | Section 6, "When" column | **Five items are added to the 0.2.144 beta with no word on scope.** Tyler ruled the beta scope as waves 1 and 2 (30-7) and one big release. Items 3, 8, 9 and 10 and the closed-form half of item 1 are new to it. "All of it fits the beta" has no estimate behind it | `30-decisions.json` 30-7. Rulings, "ONE BIG RELEASE" | Add one line under the table: which of these are already in waves 1 and 2, which are added, and what the addition costs in lanes |
| M12 | 7.3 row 1, G-2 | **The test cannot decide.** 20 to 30 strangers in two groups is 10 to 15 a group. A day 7 return gap of 30 points is inside the noise at that size. "Let day 7 return decide" promises a verdict the sample cannot give | Arithmetic on the review's own numbers | State the smallest gap the test can see, or call it a first look and name the wave size that decides |
| M13 | G-25, G-48, G-59, G-84, G-43, G-10 | **Bundled calls.** One answer cannot cover them. G-10 holds a build, a re-order and a change to 11-08. G-59 holds a gauge and a Security item. G-25 says nine rules and lists six (the other three are in G-5 and G-36) | 60 section 8 | Split G-10 in three and G-59 in two. In G-25 write "six rules here, the party fit and the pull floor are in G-5, the Tower table is in G-36" |

### 2.4 Low

| # | Where | What is wrong | The exact fix |
|---|---|---|---|
| L1 | Whole document | About 85 uses of "a" for "for each": "a saved kit a ground", "one verdict a system", "a number a kind", "a trace a blow", "remembered a ground", "XP a kill". Each has to be read twice | Write "for each ground", "per kill" |
| L2 | Lines 211, 344, 752, 272 | British spelling: "labour" three times, "catalogue" once | "labor", "catalog" |
| L3 | 4.1 onward | "The pace seat", "the contract", "MID", "BiS", R7, R12, V1 to V5, L16, P6 and P7 are used and never explained in this document | One line each in the labels paragraph |
| L4 | 1.8 | The features row sums to 48, not 46 (21, 8, 2, 5, 7, 5). The error is in 59 and was copied. The total is 441 | Fix the row or say which two rows are double counted |
| L5 | 5.2 row 12 | "+9 to +11% XP and 20 to 29% less damage for a four". The XP number is a lone hero's | "+9 to +11% XP for a lone hero. A four takes 20 to 29% less damage" |
| L6 | 3 row 13 | "Deadly can burn 121,000 an hour" is labeled EVIDENCE. It is one harness cell, a lone hero at Level 50, and caveat 3 says lone harder-tier losses are overstated up to 1.9 times | "MEASURED on the harness, lone, overstated by up to half" |
| L7 | 0.1 row 7 | "Nothing on any bar changes after hunted hour 254" is labeled EVIDENCE. It is read from the spell rows | COMPUTED from the spell data (32, B3) |
| L8 | G-16, G-17, G-61 | Two "strongest alternatives" in one cell. G-17 is marked "Keeps 11-18" while it changes the plan's six fist rows to two, which 47 lists as a conflict (C5). G-63 cites 27-3, which is the Bestiary ruling | One alternative each. G-17: "Keeps the 11-18 identity. Changes plan section 7". G-63: name the rested bank's own ruling or write New |

---

## 3. Calls whose recommendation I would change

One alternative each.

| Call | The review recommends | I would recommend | Why |
|---|---|---|---|
| **G-1** | Closed-form town work and an away flush near 6 minutes, in one call | **Rule closed-form town work now. Hold the flush until `48-platform-cost.md` lands** | Closed form extends a ruling (28-11), is necessary on every path and saves 34 seconds. The flush is a HYPOTHESIS, has a second option in its own source (a 20 ms commit), touches the settle path every hunt stands on, and the document that sizes it does not exist yet. A ruling today would be on a number nobody has measured at 12 hours |
| **G-2** | The second hero at about 10,000 gold, proven by two invite waves | **Keep 400,000 for the first wave. Ship the ruled fix 27-2 and the Path to everyone first. Test the cheap second hero on a second wave only if strangers still stop before Level 10** | The evidence is 18 hours from two people, and one of them had two heroes. Tyler ruled this price three times in two days. Two cheaper, already ruled fixes aim at the same quit point and are not built. A test of 10 to 15 a group cannot separate three causes. It belongs outside the top 10 until the first wave has been read. On the stated order (benefit, then confidence, then cost) its confidence is the lowest of the ten |
| **G-27** | Dangerous brings five monsters on every ground | **Rule the shape, not the number: one pull number for each tier, no per-ground overrides. Lane L16 sets the number from its own sample** | Removing six per-ground overrides is the formula-layer fix and is right. "Five" was read at today's dial on one seed and one hour, before the harder hit Tyler ruled in 21-3. Five at the ruled dial has not been played. L16 already runs 4 seeds by 8 hours with lone, pair and three cells |
| **G-53** | The dummy halves the yard fee, forever | **The dummy still ends the fee, as ruled. Its unlocks become rungs by skill band, each priced at 25 to 50 hours of the yard fee at that band, on the wage curve of G-51** | Tyler's 11-08 words are "wildly expensive" with "multiple unlocks for each combat skill", and on 11-20 he approved a payback of 25 to 50 hours. The fault is that the fee grows with skill and the price does not. That is a formula fault. Fix the price formula and both rulings hold, the sink keeps growing and no re-open is needed |
| **G-56** | Remove the bench tax and free the setup slots | **Free the setup slots. Keep the bench tax and move it onto the wage curve** | The tax is Tyler's 11-01 ruling. 26-1 (11-20) makes "the bench with no fee" the first rung of every room, and G-76 removes the speed rungs. With the tax gone the first rung of eight rooms sells nothing. "Under 0.1% of gold out" is a reason to size it, not to delete what the room ladder stands on |
| **G-68** | Retire the old castle code and rebuild it later as Town Works projects | **Leave the castle hidden and unbuilt as ruled (25-3). Decide its shape when the first clan reaches ten accounts** | It costs nothing to leave. No player can see it. Retiring it now re-opens four rulings, one of them from 11-21, on the evidence of a system nobody could reach. That is the cut Tyler ruled out on 11-21. The Town Works idea can go on the board as the leading design for that later decision |

---

## 4. The top 10, judged

| # | Item | Is the rank justified? | Evidence as labeled | Evidence as it is |
|---|---|---|---|---|
| Not ranked | Make the instrument true | **No. It should be item 1.** Every MEASURED label below it depends on it, and it is the only item with no unknowns | none given | Four named faults, each with a done-when |
| 1 | Server cost | Yes as Critical. The numbers are softer than shown | COMPUTED | COMPUTED from 3.3 hour means stretched to 12. The 60 is from assumed list prices (M3). The flush is a HYPOTHESIS. Two inputs pending |
| 2 | Deadly a fight | Yes, but most of it is already ruled and planned (21-3, L16). Only the lineup test and the pull are new | MEASURED | Harness only, one seed, one hour, on the reading the caveats say not to trust (H4). Real fours with a tank and healer had near zero deaths |
| 3 | The second hero | **No. Too high.** Lowest confidence of the ten, highest risk of the ten, reverses three rulings | EVIDENCE, thin, "three lanes converging" | 18 hours, two people, one with two heroes, one lane (H1, H2) |
| 4 | The gear curve | Yes, on dependency (item 5 needs it), not on urgency | COMPUTED and MEASURED | Sound to Level 5,000 on stand-in gear. "Ends near Level 300" overstates (M4). The band size is a HYPOTHESIS and says so |
| 5 | The kill reward | Yes | MEASURED for the cause | The cause is analysis. The derivation proof has not been run (H10) |
| 6 | The Level law, Blessings 4 to 7, sinks | Yes as one release. The numbers need re-running | MEASURED | From a withdrawn curve (C1) and an assumed death count (C2) |
| 7 | Risen grounds | Rank is fair for a HYPOTHESIS that says it is one | EVIDENCE | Day 27 is COMPUTED. "0 uses" may prove nothing (H11) |
| 8 | Bosses pay what grounds never drop | Yes | EVIDENCE and MEASURED | 19 keys is one window (M7). The 9% is one subset run |
| 9 | On-call heroes | Yes. Already ruled | EVIDENCE and HYPOTHESIS | Honest as labeled |
| 10 | The return made readable | Yes | MEASURED | Overstated (M5) |

**Missing from the ten.** Nothing Critical is missing as a topic. What is missing is the word: the review never says which items are Critical beyond item 1. By the brief's own definition, the instrument, the gear curve and the kill reward are Critical too, because each is an architectural fault the rest stands on.

**Formula-layer rule.** No call patches one ground, weapon or monster in the way brief 40 forbids. G-30 (leave Krell alone) is the rule applied correctly. Two calls sit close to the line and should say so: G-5's typed "a third lower" on three grounds (H10), and G-14, which raises one spell's share until one weapon reads 0.95 of another without first asking whether 32-3 (the axes lost Power Strike on 11-21) is why the axes read last.

---

## 5. The number spot-check

42 numbers traced. "OK" means the number and its label match the source.

| # | Number in 60 | Where | Source | Result |
|---|---|---|---|---|
| 1 | 1,334 hours, 0 with another person | 0 | 10 lines 11, 22 | OK |
| 2 | 86% sold, 0.9% worn, 34,756 and 298 | 0, 0.1 | 10 lines 252, 260 | OK |
| 3 | Nobody with one or two heroes passed Level 9 | 0 | 10 line 107 | OK, but 18 hours (H2) |
| 4 | 91% of hunt hours in a party, 76% a four | 0.1, 3 | 10 line 22 | OK |
| 5 | Hammer and three mages fastest at Level 60, +22% | 0, 4.6 | 52 line 662 | OK. +1% at Level 110, not said |
| 6 | Four mages 8 to 15% faster | 0.1 row 10 | 57 line 17. 52 reads +2% and +7% | Two sizes, one quoted (H4) |
| 7 | Shield tank 0.84 to 0.92 of the hammer | 0.1, 4.6 | 52 line 641 | OK |
| 8 | Wand 20 to 31% faster | 4.6 | 52 line 650 | OK |
| 9 | A second melee hero costs 8 to 13% | 3, G-18 | 52 line 22 | OK |
| 10 | 28% of a four's damage on the healer | 3, G-19 | 52 line 140 | OK, one real four |
| 11 | Level 100 in 257 hours against 600 | 4.1 | 56 line 51 | OK |
| 12 | 2.83, 2.05, about 1.45 | 4.1 | 56 grid | OK |
| 13 | Krell day 16 to 27, open content day 26 to 42, staged day 79 to 143 | 4.1, 4.3, 5.3 | 56 line 59 | Number copied right. Wrong curve (C1) |
| 14 | Lone Level 100 day 42 to 68, Level 200 day 136 to 245 | 4.1, G-6 | 56 line 66 | Wrong curve (C1) |
| 15 | Death hours 10.6, 36, 60, 102 and 18, 68, 133, 208 | 4.2 | 56 line 102 | First set OK. Second set wrong curve (C1). Tyler was told 148 at Level 400 when he ruled 50-4 |
| 16 | Deadly breaks at Level 145 to 185, and Level 100 on the law | 4.2, 0.3 | 56 section 0.3 | Not MEASURED (C2), and wrong curve for 100 (C1) |
| 17 | A blessed death "near five hours at every Level" | 1.1 | 56: at most 6.0, one checkpoint reads 11.2 | Overstated |
| 18 | Sinks 0.39, 0.66, 0.38 against 1.2 to 1.4 | 4.4 | 56 line 41 | OK |
| 19 | 4.1 times at Level 5, 1.9 at 10 and 16 | 4.1 | 44 summary | OK |
| 20 | 129 exceptions, 57 accidental, 56 removed | 1.8 | 44 summary | OK |
| 21 | 0.91 of pace at Level 400, 0.47 at 1,000 | 3, 4.4 | 42 line 15 | OK. Label should be MEASURED on the probe |
| 22 | Pace holds 200 to 5,000 on a gear curve | 3, 4.4 | 42 line 15 | OK |
| 23 | 645, 532, 270, 195, 180, 147 against 60 | 4.5 | 59 section 0.2 | OK. 60 is not "ruled" (M3) |
| 24 | 34 of 60 seconds for town work, 11 for 100 presses | 4.5 | 59 section 0.2 | OK |
| 25 | 10 commits a hero-hour against 36, a flush near 6 minutes | 4.5 | 59 item 3 | OK. HYPOTHESIS, not labeled |
| 26 | Party a head 0.91 to 1.11 of lone | 4.6 | 57 line 15 | OK |
| 27 | Lone on Dangerous 1.5 to 2.6 times the contract | 4.6 | 57 line 17 | OK |
| 28 | A Level 5 behind a Level 37 party earns 6 times | 0.2, 5.2 | 57 line 24 | OK |
| 29 | Lone on five: 35 to 65% more XP, near 40% health, no deaths | 0.3, G-27 | 53 section 0.3 | 35 to 49% low point. No deaths from the Glade to Krell only. One death in 1,000 hours on the Ox Road and the Catacombs. Gold sentence reads backwards (H6) |
| 30 | A four keeps 2.1 to 2.5 on five | G-27 | 53: 2.39, 2.49, 2.12 | OK |
| 31 | Hask's Ford four 2.12 against lone 2.65 | 5.2 | 53 line 69 | OK |
| 32 | Lone Deadly bill falls 49% | 5.1, G-52 | 55 line 23 | OK |
| 33 | 15% less gold in, 40 bands worse | 0.2, G-46 | 55 line 452 | OK |
| 34 | Full-effect supplies: up to 12% faster, 30% safer | 5.1 | 55 run 2 | Not re-traced |
| 35 | 33.5 days in a band of 17.5, 9% slower | 2.3 | 54 lines 27, 100 | OK. The band is 17.5 to 21 |
| 36 | A Rare reveal every 7 minutes on the Warrens | 2.3, G-42 | 54 line 121 | OK |
| 37 | Accessories 15% at Level 30, 0.5% at 400 | 4.4 | 54 line 23 | OK |
| 38 | 14 weeks to buy the shelf to Krell | 3 | 55 line 96 | OK, and it contradicts 0 item 4 (M10) |
| 39 | Dummy pays back in 2.8 days | 5.2, G-53 | 55 line 472 | OK, and it is the payback Tyler approved (C3) |
| 40 | 19 Hall Keys, no Hall fought | 0.1, top 10 | 11 line 120 | One window (M7) |
| 41 | Day 18 for a four, day 39 lone | Labels | 50 section 2.7 | OK. No "month 4" anywhere in 60 |
| 42 | 69 Levels a month past 110 | 4.3 | 50 line 236 | From 50's faster reading. 56's grid gives about 42 on the same stretch. Say which |

Time frame: no superseded ruling is quoted and no "month 4" number appears. The one stale frame is H3.

---

## 6. What this audit did not do

It did not re-run any tool. It did not read 46, 54 and 58 in full, so a wrong number quoted from the body of those three could have passed. It did not check the 88 calls against every ruling before 11-01 one by one. Older cites (10-22, 10-23, 10-25, 11-05, 11-07, 11-14) were checked by search only, and G-83's "Extends 10-22" was not found in the rulings file at all and should be checked by its author. The corrected re-open count in H13 is a count of the Ruling column after these fixes, not a new reading of every call.
