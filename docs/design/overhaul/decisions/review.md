# The adversarial check of the 157 design decisions

Checked 2026-11-21 on `lane/d-decide-review`, from `set/v0.2.144`. The checker decided none of these rows. It read `core.json` (45 rows), `content-economy.json` (62 rows) and `mmo-experience.json` (50 rows) against Tyler's rulings, his three briefs and the book in `docs/design/overhaul/01` to `09`. Nothing here is judged against today's game. No game code, data or migration was changed.

## 1. Verdict

**ACCEPT WITH FIXES.**

The three files agree on most of the game and most labels are honest. They cannot go to the build plan as they stand, for five reasons.

1. Two deciders give opposite answers on the bought Level XP boost, and the paid ceiling is written as three different numbers (1.58, 1.60 and 1.65).
2. One decision (GR-65) re-proposes something Tyler was asked directly and refused, and cites the wrong ruling for it.
3. The first hour (GR-79) stands on a check nobody ran (C2). I ran it and it fails.
4. Five changes to Tyler's numbers or words are not on any reversal list.
5. The cut list holds one row. The decisions cut at least fourteen things.

There are 31 fixes below. None of them needs a decider to start again.

## 2. What I re-ran and re-derived

Every run used the matrix's own cell builder (`progression-grid.mjs buildCell`), its engine worker pool and its `cellRates`, with 2 workers. `node tools/pc-load.local.mjs` read CPU 8% before the runs. The scripts are not committed. They sit in the session scratchpad as `review/c3.mjs` and `review/law.mjs`.

| # | Claim | Who made it | My result | Verdict |
|---|---|---|---|---|
| 1 | C3: a start-kit four (shield, staff, bow, wand) at Level 5 in the Millrace Sewer on Normal, 4 seeds of 8 hours: 0 deaths in 128 hero-hours | core | 0 deaths in 128 hero-hours. Tank's typical lowest health 84%, worst tenth 65%. The Rat King killed 21.5 times an hour | REPRODUCED |
| 2 | C3: Level XP a head 1.75 times the same four split in the Thicket (38,769 against 22,150), net gold a head 1.18 times (1,915 against 1,629) | core | 38,769 against 22,150 is 1.750. 1,915 against 1,629 is 1.176 | REPRODUCED to the digit |
| 3 | C3: a hammer in front also holds, 0 deaths, lowest health 77% | core | 0 deaths in 128 hero-hours, 77.4% | REPRODUCED |
| 4 | C3 at Level 6 reads the same | core | 0 deaths, 39,556 XP a head, tank 85% | REPRODUCED |
| 5 | The log join of the Level table makes a Level cheaper at 100 (11.0 hours, then 8.9), at 300 (15.9, then 13.9) and at 500 (23.1, then 23.0), and jumps 29% in one Level at 400 | core | The same three dips and a 28.9% jump at Level 401 | REPRODUCED |
| 6 | The convex cut passes every ruled point and has no cheaper Level | core | The hours a Level in each ruled stretch are 8.64, 10.80, 14.40, 14.60, 21.40, 26.88 and 40.32. They never fall, so such a line exists. Core's four readings (9.7, 12.8, 14.5, 18.0) sit inside what is possible | TRUE. One gap, see fix 10 |
| 7 | "Its largest step between two Levels is 8%" | core | A line through the same points with no step over 2% exists (my search found one under 1%). So 8% is one cut out of many, not the cut | TRUE BUT NOT UNIQUE, fix 10 |
| 8 | Krell's Hold is day 31 on the law from Level 50 | core | Level 50 at 62 hours and a flat 8.64 hours a Level gives 390 hours, day 32.5. A line that starts cheaper gives day 31. Day 18 exact would leave 278 hours for Levels 88 to 100, which is 23 hours a Level against 10.8 for the next hundred | PLAUSIBLE. The two rulings cannot both be exact |
| 9 | The default first company of core's GR-24 (hammer, shield, staff, bow) holds the Sewer | nobody measured it | 0 deaths in 64 hero-hours (4 seeds of 4 hours), 36,322 XP a head, 1.71 times the same four split | NEW, it holds |
| 10 | "Any front weapon holds, so the first hour does not force the shield" | core | True with a healer. A four with no healer and no shield (hammer, bow, bow, wand) died once in 16 party-hours, front hero's worst tenth 27% health | OVERSTATED, fix 6 |
| 11 | C2: three new heroes in the Mill Cellar reach Level 5 no slower than one alone | mmo (GR-79 leans on it and handed it to core, who did not run it) | Three together earn 4,589 Level XP a head an hour at Level 1 and 4,580 at Level 3. One alone earns 8,095 to 8,998. That is 0.53 times. The Cellar is spawn-limited: three heroes kill only 18% more rats than one | FAILS, fix 6 |

Caveat on every row: the harness still reads a healer's damage taken at about 0.01 of real play and a four's store bill at 1.7 to 2.2 times real (study 51). Rows 1 to 4 and 9 have a wide margin. Row 10 is one death and is direction only.

## 3. The fix list

Each fix names the decision, what is wrong, the evidence and the corrected decision.

### Contradictions between deciders

**Fix 1. MM-29-XP, MM-29, MM-25: the bought Level XP boost.**
Wrong: core says no bought Level XP boost. Content-economy says yes at about +15%. The MMO decider's MM-25 is written as if the answer is yes ("Level XP is the weekend for everyone and the thing Crowns buy").
Evidence: Tyler's words on 2026-11-04, 2026-11-18 and twice on 2026-11-21 all describe one chain. A payer buys Crowns, sells them for gold, and the gold is the edge. None of them asks for XP to be sold. The game designer's standing rule in this repo is "no paid XP boosts". Level is the score the Honors page ranks (GR-62 gives a server line to the first 100 heroes at Level 100). GR-6a shows a bought XP boost moves the next region's door from about day 53 to day 37 to 42, and no lane says who draws regions.
Corrected decision: no Level XP boost is sold, for Crowns or for gold. The timed Level XP cap of +25% is filled only by the Hearthrise weekend. MM-25's last line becomes "Timed Level XP comes only from the Hearthrise weekend". It stays on the money list as Tyler's call with this one recommendation.

**Fix 2. MM-26, MM-31, MM-29: three numbers for one ceiling.**
Wrong: MM-26 says 1.65. MM-31 says 1.58 and the book says 1.60. MM-29 says a payer with earned buffs on top reads 58%.
Evidence: MM-31 multiplies 1.15 gear by 1.10 timed damage by 1.25 XP and leaves out the +5% standing damage of MM-25. With it the product is 1.15 x 1.15 x 1.25 = 1.65. MM-29's 58% has the same miss.
Corrected decision: there is one ceiling and it is a reading held by a test, never a new limit (this keeps ruling 50-11). With every cap full a four reads 1.65 times a plain mid-geared four in Levels an hour and 1.32 in kills an hour. Under fix 1 nobody holds 1.65 outside a Hearthrise weekend. Paying alone, with best gear sooner and a +6% damage boost, reads about 1.22. MM-31 and MM-26 quote these same three numbers.

**Fix 3. CE-2 against MM-25, MM-42, MM-8 and MM-14: the timed drop buff.**
Wrong: CE-2 makes the timed drop row a material buff that never touches a Rare, a gear row, a key or a seed. MM-25 still calls it drop chance. MM-42 spends that same cap on a ground's named pieces, which are Rare rows. MM-8 and MM-14 pay "+5% drop chance".
Evidence: Luck is ruled at two feeds (2026-11-20). More hourly gear means more salvage and more rivets, which is a third feed. Chapter 03 rule 9 says a layer buff never moves a Rare row.
Corrected decision: the MM-25 row is named material find, +10% timed, earned only, never sold, with the scope of CE-2. MM-8 and MM-14 pay material find. MM-42's ground weekend uses its own event row on that ground's named pieces for that weekend. That row is outside the MM-25 cap, is never sold and never stacks with a second event. The rivet allowance is computed with neither.

**Fix 4. CORE-4 against MM-25, MM-9, MM-10, MM-26 and MM-29: defensive buffs and the 60% cap.**
Wrong: core rules that anything taking a share off a blow stops at the 60% cap, so the MMO layer must write its defensive buff on the Defense rating. The MMO rows still say "damage taken 5% less" for the Ward and the clan board, and MM-29 sells "3% less damage taken".
Evidence: core computed that plate of its Level sits at the cap from Level 110 to 5,000. A mitigation row would give a tank nothing from Level 110 on.
Corrected decision: the Ward, the clan board marks and any bought protection boost are Defense rating rows. Each is sized on the matrix so a mid-geared four takes about 5% less damage an hour (3% for the bought row). MM-26's "takes 10% less" is read on damage taken an hour. One check is owed before it is final: the to-hit formula needs its own floor so rating rows cannot stack into a second way past the cap.

**Fix 5. MM-7 (decided twice): a death in the boss room.**
Wrong: nothing between the two rows. Both say the normal death. The conditions differ slightly.
Corrected decision, merged: a death in a boss room costs the normal death. One death a send at most. Carry on never sends a hero into a boss room. The first send defaults to Normal. Blessings, the ladder and "keep me blessed" apply. The card shows the risk reading and what a death would cost this hero. It is one row on the mode table and never a rule for one room. It is built with GR-7 and never before it. Fix 12 must land with it.

**Fix 6. GR-79, C2 and C3: the first hour.**
Wrong: GR-79 says yes to "three more heroes who run the Cellar together" and to the four entering the Sewer at about minute 36. That rests on check C2, which no decider ran. Core's C3 also measured a four (shield, staff, bow, wand) that is not the company core's own GR-24 pre-fills (hammer, shield, staff, bow).
Evidence: section 2 rows 9 to 11. Three in the Cellar level at 0.53 times the pace of one alone, so the recruits would reach Level 5 near minute 49 and not minute 36. The ruling of 2026-11-18 already recorded that Cellar fours earn 0.42 to 0.66 times alone. The default company holds the Sewer. A four with no healer does not hold it cleanly.
Corrected decision: the three recruits each run their own Mill Cellar hunt, alone, and one Start begins all three (GR-80). Minute 36 then stands, because each recruit levels at the first hero's pace (8,095 to 8,998 against 8,844 XP an hour). The pre-filled company always holds one healer, and the creation screen says so before a player changes it. The standing C3 cell on the matrix is the default company (hammer, shield, staff, bow), with the no-healer four printed beside it. C1 (a measured tag for each starting way) is still owed and is owned by the core decider.

**Fix 7. GR-24 (decided twice): the starting weapon.**
Wrong: core says the first hero's highlighted pick is the hammer. The MMO row says no card is preselected.
Corrected decision, merged: no card is preselected. Each card carries its measured tag from check C1 ("Good alone" or "Best in a party. Slow alone."). The hammer card carries a "Good first hero" mark. Heroes two to four come pre-filled as shield, staff and bow, one press accepts them and any pick can be changed. Core owns the row.

**Fix 8. GR-8, MM-22, CE-4 and CE-1: where the slot gold goes.**
Wrong: core's GR-8 and the MMO's MM-22 send the slot gold to the clan castle and to boss materials first. CE-4 says a first-week account cannot reach either, and CE-1 makes boss materials a small home.
Corrected decision: CE-4's order rules the first weeks (supplies, the yard, the House ladder re-read for four, bag rungs, Tempering, Hallmarks, Blessings, linings). The castle is the long home for that gold once an account is in a clan. Boss and arena materials are a small home. GR-8 and MM-22 quote this.

**Fix 9. CE-1 against MM-6: how many boss pieces a weekend.**
Wrong: CE-1 caps an account at one line piece a boss weekend. MM-6 adds "one extra roll on the boss line" when the server fells the boss, which can be a second piece.
Corrected decision: one line piece a boss weekend at most. The fall bonus is the 7 day buff plus a re-roll of which piece the account receives, toward its own heroes' styles. It never adds a second piece.

### Ruling compliance

**Fix 10. GR-6d: the convex cut has no rule that makes it one line.**
Wrong: the row says a generator writes the law and nobody types a point. Many lines pass every ruled point without falling. Core's has an 8% step. A smoother one exists.
Corrected decision: the generator's rule is written into the row. The law is the non-falling line through every ruled total that has the smallest largest step between two Levels. The ramp at Level 50 is the first piece of the same line.

**Fix 11. GR-6: two changes to ruled numbers are not listed.**
Wrong: the row says it replaces nothing. On the law the four runs 106 hours ahead of the ruled table at every point. Level 100 lands at 494 hours and not 600, which is 18% early and past the standards' own red line of 15% (`PACE_TABLE.redTolerance`). Level 400 lands on day 373 and not the ruled day 382. Staged content ends on day 116 against the ruled 120 days of grounds.
Corrected decision: all three go on the reversal list (section 5, rows 3 and 4). The four days are closed with a content row and no new ground: the top staged ground's band runs to Level 189, which is where the plain four stands at 1,440 hours.

**Fix 12. GR-30, MM-5 and MM-7: a hall that is lost is a death.**
Wrong: GR-30 sizes the hall number so a mid-geared four wins 80 to 90% and the weakest lineup loses. Chapter 02 says a death ends a hall. MM-5 gives the world boss room the same hall number. Core's MM-7 says the boss room's Normal is "safe by formula". Those cannot all hold. A hall lost one time in five or ten, at 6% of all Level XP with no cap, is the most expensive button in the game, and GR-28 lets a player press it for N keys at once.
Corrected decision: the hall number acts on the boss's health and so on the 10 minute clock, never on his blows. A hall lost on Normal by a mid-geared four in band is lost to the clock. Deaths in a hall and in a boss room sit inside the same death band as the tier chosen. "Fight with N keys" stops at the first death, as every hunt does. The world boss room does not take the 80 to 90% target, because its boss never dies. This is a HYPOTHESIS until the hall grader plays it at Levels 25, 52 and 75.

**Fix 13. GR-65: Inner Flame and death. WITHDRAW.**
Wrong: the row calls this a small reversal of 2026-11-09, "by how it was built". The real ruling is 2026-10-25. Tyler was asked directly and said Prayer keeps its death loss, and the record says "do not re-propose an exemption". Inner Flame is that skill renamed. The row offers no new evidence.
Corrected decision: a death takes Inner Flame progress like every combat skill, as ruled. GR-65 is refused. GR-61's paper sample does not lean on it.

**Fix 14. CORE-1: Dangerous is sized on a lone hero.**
Wrong: the row calls Dangerous "the lone hero's hard tier" and sizes it on a lone hero at 35 to 49% health. Ruling 21-3 (2026-11-20) sizes the harder tiers on a party with a healer. The ruling of 2026-11-21 says no solo or group targets.
Corrected decision: both tiers are sized on the mid-geared four in band. Dangerous is read against S3 (typical lowest health 35 to 60%) and Deadly against S4 (15 to 40%). A lone hero's reading prints and judges nothing. The opening numbers in the row stay as hypotheses for the sample.

**Fix 15. GR-4: the opening step breaks the row's own rider.**
Wrong: the row opens the band step at +24% and adds "every region must hold at least one band edge". Its own arithmetic shows the Level 330 to 385 region holds none at +24%. At the top a plain band then lasts 75 to 95 days. The item plan, a source of record, says two bands a region.
Corrected decision: the knob opens at the largest step that keeps the rider, which is about +17% on today's region edges (bands at 110, 129, 151, 176, 206, 241, 282, 330 and 386). That is eight bands to Level 400, about one and a half a region. +24% stays a hypothesis for the one-band play and can ship only if region edges move with it.

**Fix 16. MM-9: the castle.**
Wrong, three things. It is a real reversal and is listed, but it also changes 31-3 of 2026-11-21 (castle goods keep their built prices) while saying it keeps it. Tyler was offered "price it by members" as the alternative on 25-4 and declined it. And its "twenty stages is about six months" disagrees with chapter 04, which sizes a stage at 2 to 4 weeks, which is 9 to 18 months.
Corrected decision: the reversal row names 25-4, the castle gate in 25-3 and 31-3, and says plainly that this is the option Tyler declined. The one new fact that justifies asking again is his ruling of 2026-11-21 that clans pay buffs: a fixed price now locks a clan of three out of hero power. `castleStagePerMember` is sized so a stage takes 1 to 1.3 weeks at the weekly share, which gives 20 to 26 weeks. If Tyler vetoes, the castle keeps built prices and one work order a week for each slot, and only the ten-account gate goes.

**Fix 17. MM-29: selling timed power for Crowns is an unlisted reversal.**
Wrong: content-economy says in the row that a boost sold for Crowns is a direct sale of power that the 2026-11-04 and 2026-11-18 records said would not happen without Tyler's word. It is on the money list and on no reversal list. Core's recommendation also sells boosts for Crowns.
Corrected decision: see the money list, MM-29. My recommendation sells the two boosts for gold and so reverses nothing. If Tyler prefers Crowns, the row goes on the reversal list.

**Fix 18. GR-16: a design call is pushed to Tyler.**
Wrong: "the element numbers are OPEN and need Tyler's yes before the elements switch on". That is not money, a grant or a reversal.
Corrected decision: the game designer sizes the mana burn share and the healing cut with the first seven spells, on the matrix, and reports them as decided.

**Fix 19. The reversal lists carry two wrong entries.**
GR-73 is not a reversal. Ruling 26-6 says take the Trophy room off sale and rebuild it as mounts for real Trophy drops and firsts, and GR-73 builds that. GR-56a reverses 2026-11-05 and also the 2026-11-04 sinks list, where Tyler asked for paid action-bar setups beyond a free couple. The second ruling is added.

### Evidence honesty

**Fix 20. GR-24 (core) and C3: "any front weapon holds".** The claim was measured only with a healer. See fix 6. The label MEASURED is true for what was run and the sentence is wider than the run.

**Fix 21. GR-6a: the fastest seat is stale.** The row's 1.39 uses a +5% standing Level XP buff that MM-25 cut. Without it the fastest seat held all the time is 1.15 x 1.15 x 1.027 = about 1.36. Staged content then ends near day 85 for that seat and the next region's door is near day 55, not day 53.

**Fix 22. CE-5: the rule and the sizes disagree.** The row says an account price is "four times its one-hero size" and then lists sizes that are not (the Farmstead about 2.2 times the rule, the Castle about 0.55 times). Corrected decision: the listed sizes are the decision and they are a HYPOTHESIS. The sentence about four times is struck.

**Fix 23. MM-4 and MM-6: what happens after the boss falls.** The pool is 6 Normal party-hours an account and the chest marks are 2, 8 and 20. If accounts send early the boss falls on day one, and nothing says what a player whose visits come later can earn. That breaks rule 0. Corrected decision: the room stays open to the end of the window. An account's own marks still pay after the fall. The fall bonus is paid at the window's end to every account past the first mark, whenever it got there.

**Fix 24. The reasons are written as Tyler.** Almost every reason field says "I ruled", "I want" or "I think". Some of these are his words. Many are the decider's argument ("I think about drops in hours"). A later reader will quote them as rulings. Corrected: each file's head says that "I" in a reason is the decider, and that only the `replaces` field and a ruling id cite Tyler. The build plan cites ruling ids only.

**Fix 25. Labels that held.** I spot-checked 28 rows. These labels are true as written: C3, CORE-2, GR-6d (dips), GR-6b, GR-4 (band edges, 27 Levels as +25% and +8%), MM-26 (1.65 and 1.31), MM-18 (one pair in six), CE-1 (26 against 52), GR-42, GR-53 (34 hours), GR-32, GR-33, GR-81 (one ground ends itself), GR-24 mmo (six starter rows), GR-40 (three pieces in the data), GR-57 (floor of 300), GR-78 (task rows), CORE-3 (Mark at 20), MM-9 (20 to 26 weeks as arithmetic). These are wrong or wider than their run: MM-31 and MM-29 (fix 2), GR-6a (fix 21), CE-5 (fix 22), GR-24 core (fix 20), GR-79 (fix 6), GR-6 (fix 11), GR-65 (fix 13), GR-73 (fix 19), GR-6d's 8% (fix 10), GR-4's rider (fix 15), MM-9's six months (fix 16).

### Tyler's principles

**Fix 26. MM-13 and MM-14: the Open Arena feeds itself.** The Open Arena pays +5% damage for the next season and also reads damage buffs. Last season's winners start the next one 5% stronger. Corrected decision: the Open Arena reads gear, upgrades and standing buffs. It never reads a timed buff that an arena paid.

**Fix 27. CE-10: the hero kit can be minted.** The account kit is granted once. The hero kit (weapon, worn pieces, bar supplies) is granted again each time a hero is deleted and remade, and the kit's food sells. Corrected decision: the hero kit is granted once for each of the account's four slots. A hero remade in a used slot gets the practice weapons only, which have no sale value. Security reads it with the rest.

**Fix 28. GR-48 and GR-84: two saved things for one decision.** GR-48 saves the worn set, linings and unique for a ground. GR-84 saves the bar as a Setup for a ground. Chapter 01 asks for the weapon, the bar and the target mode to travel together, or the weak-side weapon is a chore. Corrected decision: one Setup for each ground holds the weapon, the worn set, the linings, the bar and the target mode. It is saved once and can be copied to another hero or ground.

**Fix 29. GR-52: the rune rule goes round in a circle.** The baseline lane waits on the designer for which rune tier the simulated kit buys. GR-52 sends it back to the baseline lane. Corrected decision: take chapter 09's rule. A mid-geared hero casts one rune tier under what its Magic allows. A healer's heals use the cheapest water rune. Best gear casts the tier its Magic allows. Then the grid is played once.

**Fix 30. CORE-2: the name.** "The Company bonus" is design vocabulary. The 2026-11-14 rule says labels outside lore are genre words. Corrected: "Party bonus". It is not a call for Tyler.

### Completeness

**Fix 31. Items the book lists as missing that no decider took and that have no working owner.**

| Item | Where | Corrected owner |
|---|---|---|
| What it costs to reforge a unique up a band | chapter 03, item 3 | The game designer, inside GR-4 and GR-8, before the build plan |
| A ceiling on gold find | chapter 04, item 17 | The game designer, with the perk lane |
| The Bestiary's stage bonus, listed as "Tyler" | chapter 02, item 10 | The game designer. It is a design call |
| Rolls, tradeable gems and patterns in the Steam and legal review | chapter 03, item 17 | The security engineer, in the one review before Early Access |
| Whether the three armor weights are a live choice | chapter 03, item 18 | The matrix lane, one run |
| A guard for heals at high Level, and whether weapon accuracy stays a stat | chapter 01, items 8 and 9 | The matrix lane, with the core decider |
| A walk-through of a Level 20 four's first boss weekend | chapter 05, item 8. MM-7 names it as the thing that overturns the row | The MMO decider, before MM-7 is final |
| Checks C1 and C2 | chapter 08 | Core decider. C2 is run here and fails (fix 6) |
| Regions 4 to 7 sketches, ruled "now" on 2026-11-20 (A-10) | chapter 02, item 2 | The game designer |
| Keys and prizes for the Rat King, Chief Coppercap and Captain Hask halls | chapter 02, item 6 | The game designer. GR-28 must also say the Rat King is one monster row used on the Sewer route and in his hall, so no copy row returns |
| How thirteen skills spread across four heroes after night one | chapter 05, item 16 | The game designer, inside GR-79 |
| What a player who refuses heroes two to four is shown | chapter 08, item 13 | The game designer, after playtest 1 |
| Whether measuring may go ahead before the build plan, listed as "Tyler" | chapter 09, item 3 | Already ruled. The 2026-11-21 ruling lets studies, calibration and audits run |

Every GR and MM call in book 62 is decided. GR-2 and GR-67 are ruled. GR-10a, GR-10b, GR-10c, GR-60, GR-68 and GR-83 are closed by the MM calls that replaced them. MM-7 and GR-24 are each decided twice and are merged in fixes 5 and 7. No call is missing.

## 4. The resolved contradictions, in one table

| # | Rows | One decision | Why |
|---|---|---|---|
| 1 | MM-29-XP, MM-29, MM-25 | No Level XP boost is sold | Tyler's own chain is Crowns to gold to an edge. Level is the ranked score. It keeps the region door near day 55 |
| 2 | MM-26, MM-31, MM-29 | One ceiling as a reading: 1.65 with every cap full, about 1.22 from paying alone | MM-31 left out the standing damage row |
| 3 | CE-2, MM-25, MM-42, MM-8, MM-14 | The timed drop row is material find. The ground weekend has its own event row | Luck has two feeds |
| 4 | CORE-4, MM-25, MM-9, MM-10, MM-26 | Defensive buffs are Defense rating rows inside the caps | The 60% cap stays the real armor number |
| 5 | MM-7 twice | The normal death, as one mode-table row, with the merged conditions | One rule for every fight |
| 6 | GR-79, C2, GR-24 | The recruits run three lone Cellar hunts on one Start. The company keeps a healer | Measured here |
| 7 | GR-24 twice | No preselect, measured tags, a pre-filled company | Both rows wanted the choice to be the player's |
| 8 | GR-8, MM-22, CE-4, CE-1 | CE-4's order for the first weeks, the castle as the long home | A new account cannot reach the castle |
| 9 | CE-1, MM-6 | One line piece a boss weekend, the fall bonus re-rolls it | The pace cap is what keeps grounds the main chase |
| 10 | GR-30, MM-5, MM-7 | The hall number acts on health and the clock. Deaths stay in the tier's death band | A lost hall must not be a 6% death by design |
| 11 | GR-33 quotes Krell on day 18, GR-6b says day 31 | Day 31 for the plain four if Tyler accepts reversal 2. Every chapter quotes one day | The table and day 18 cannot both be exact |
| 12 | MM-21, PREM-1 | Premium does not make buffs last longer | Both deciders agree. Premium adds no power (24-4) |
| 13 | CE-8, GR-82 | One Hearthrise on the calendar weekend, +10% to +25% by fuel | The two rows already agree. Listed once |

## 5. The final reversal list for Tyler

Deduped and checked against the rulings file and `30-decisions.json`. Tyler may veto any row. "Checked" says whether the ruling and its date are right.

| # | Decision | What changes | The ruling it changes | Checked |
|---|---|---|---|---|
| 1 | GR-7 | Past the third Blessing a new one opens whenever a fully blessed death would cost over five hunted hours. An unblessed death is untouched | 50-4 of 2026-11-21 (6% flat, no cap, and the 12 hour blessed cap turned down), and the three Blessings of 2026-11-10 | Right |
| 2 | GR-6b | Krell's Hold is day 31 for the plain mid-geared four | "Day 18 for a four" of 2026-11-21 | Right. The Level table of the same day forces it |
| 3 | GR-6 | The four runs 106 hours ahead of the table. Level 100 at 494 hours, Level 400 on day 373 | The table of 2026-10-25, and "Level 400 is day 382" of 2026-11-21 | ADDED by this check. The decider listed nothing |
| 4 | GR-6a | Staged content ends on day 116 | "120 days of grounds at Early Access" of 2026-11-21 | ADDED. Not a reversal if the top staged band runs to Level 189 (fix 11) |
| 5 | GR-4 | A gear band is a fixed step of the curve, opening at about +17% after fix 15. Luck's two numbers are keyed by Level | The item plan section 2 (two bands a region, 2026-11-18), a major upgrade every 15 to 25 Levels (2026-10-25), the Luck step of 2026-11-20 | Right |
| 6 | GR-8 | Tempering, Hallmark and lining prices are a share of a band's gold | The typed prices kept on 2026-11-18 (Hallmarks 150k, 250k, 400k, 600k) | Right. The size asked for that day is kept |
| 7 | GR-18 | The hammer's Earth rune strike breaks a monster's spell windup | "No stagger" of 2026-10-23 | Right |
| 8 | GR-61 | A written spec and five sample Kindling rungs. Nothing is built | The skill tree hold of 2026-11-05 ("do not spec or build it until he raises it") | Right |
| 9 | GR-28 | The boss call and the daily roll fold into keyed halls | 2026-11-14 and 22-8 of 2026-11-20 | Right |
| 10 | GR-39 | The 4% is the total of always-on perks. A matched hero gains at most 8% | 23-5 of 2026-11-20 | Right |
| 11 | GR-54 | The yard's rate follows the skill curve, capped at half of hunting | 2026-11-14, and 21-7 and A-5 of 2026-11-20. Tyler kept the flat rate both times | Right. This is close to the alternative he passed over |
| 12 | GR-55 | The market is open on day one | 24-7 of 2026-11-20 | Right |
| 13 | GR-56a | Setup slots are free | 2026-11-05, and the sinks list of 2026-11-04 | Second ruling ADDED |
| 14 | GR-75 | Three home looks, and visiting opens from the Homestead | 26-3 and 26-11 of 2026-11-20 | Right |
| 15 | CE-5 | Deeds, room rungs and chests are re-priced for an account of four | The gold numbers of 26-3 and 26-1 of 2026-11-20 | Right |
| 16 | CE-7 | Town work moves on screen in real time and the server writes three times a job | 2026-10-22 | Right |
| 17 | CE-8 and GR-82 | The Hearthrise lights on the calendar's weekend, sized by the fire | 2026-10-25 | Right. One row, two deciders |
| 18 | MM-18 | No hired, lent or on-call heroes | 25-1 (an amendment Tyler took himself) and the on-call board of 25-3, 2026-11-20 | Right |
| 19 | MM-9 | The castle is priced for each member with a floor of five, one project at a time, open at any size | 25-4 and the castle gate of 25-3 (2026-11-20), and 31-3 (2026-11-21) | 31-3 ADDED. Tyler declined this option once |
| 20 | MM-42 | The in-between ground weekend features named pieces in place of XP | The second half of 27-5, 2026-11-20 | Right |
| 21 | GR-69 | No Local chat tab and no live party finder | 2026-11-11 (criers in local chat), 2026-10-15/16 (the finder) | Right |
| 22 | MM-19 | One visible two thirds line for mixed Levels | The party XP rulings of 2026-11-08 | Technical. The ruled parts are untouched |
| 23 | MM-48 | A clan hunt is two rooms on one pool | The second half of 25-11, 2026-11-20 | Right |

Removed from the lists:

- **GR-65** (Inner Flame and death). Withdrawn in fix 13. The ruling of 2026-10-25 stands.
- **GR-73** (the Hall of Firsts). It builds 26-6 and reverses nothing.
- **MM-29** as a reversal, only if Tyler takes the money recommendation below. If he wants boosts sold for Crowns it returns as row 24, against the 2026-11-18 line that power is never sold directly for Crowns.

## 6. The final money list for Tyler

Each item carries one recommendation.

| Id | The call | The one recommendation |
|---|---|---|
| MM-28 | The paid advantage | Yes. Paying gives a real edge under one ceiling written in numbers. A player who does not pay reaches the same ceiling with gold |
| MM-29 | What the store sells | Crowns buy Premium, looks and comfort (more market listings). Two timed boosts, damage +6% and protection of about 3%, are sold **for gold** at the store in 1 day and 7 day sizes, priced on the wage curve and burned. Never a drop or material boost, a saved Setup, bag or Storage room, gear, materials, gold, Levels, chests, rating, Luck or stamina. Bound training items join the Crowns store only after the yard fee and to-hit changes are live (ruled 26-10). **The deciders both sold boosts for Crowns. I disagree.** Tyler's four statements all run Crowns to gold to an edge. Sold for gold the boosts reverse no ruling, they are the weekly burned sink the economy lost with the slot prices, and a payer still feels them because bought gold keeps them running. The cost is that a Crown's repeating uses are Premium and looks, which is the bond model other games run on. If Tyler wants stronger Crown demand, the same two rows are sold for Crowns at the same sizes and it becomes reversal 24 |
| MM-29-XP | A bought Level XP boost | No. Core's answer. See fix 1 |
| MM-30 | Bought boosts and earned buffs | Yes. The same rows and the same caps. One bought boost on a knob at a time |
| MM-31 | The pace ceiling | Keep ruling 50-11. Record one reading held by a test: 1.65 with every cap full, about 1.22 from paying alone. The same numbers as MM-26 |
| MM-32 | The gear ceiling | Yes. Paying puts a hero 0 bands ahead, and inside a band at most best gear over mid gear |
| MM-33 | The gold ceiling | Yes. The weekly cap on Crowns an account sells is worth about one account-week of hunting gold, re-derived each week from the 7 day median price |
| MM-34 | The path for players who do not pay | Yes. Everything sold for Crowns can be had with gold through the book. Premium for a month targets about 3 account-days of gold. Boosts are priced in gold directly |
| MM-35 | How Crowns trade | Yes. A number on the account, one server-owned book, fixed lots, one trade then bound, 1% to list and 4% of the gold, both burned. Named "Crown Exchange" |
| MM-36 | The clamps | Yes. The eight clamps, with gold paid for Crowns counted against the market's daily spend cap, all inside the one Security review before Early Access |
| MM-37 | Where paying gives no edge | Yes. The Even Arena, events, and access to any Level, ground, drop or tier. The Open Arena reads bought boosts on purpose |
| MM-21 | Premium and the MMO layer | Everything in the layer is open to every account. Premium banks arena tickets to 30. Premium does not make buffs last longer |
| PREM-1 | What one Premium gives four heroes | The ruled list (12 hour bar on every hero, the full analyzer, looks and a free color change a day, 100 listings for 14 days), the daily claim with no press, one daily 1 hour training item for each hero, tickets to 30 |
| PREM-2 | The price of Premium and a Crown | 30 days, priced in Crowns, at 8 to 10 dollars a month as a number to react to. Lot sizes are set so MM-34's target holds at the opening reference price |
| GR-66 | The risk reading | Free for everyone: how close a hunt came to a death and deaths per 100 hours for the ground and tier. Premium keeps the full analyzer, as ruled in 24-4 |
| MM-43 | Test Crowns in the playtest. THIS IS A GRANT | Yes, for the wiped Discord playtest only. The same amount for every account, one server switch that is off by default and removed before Early Access, every grant journalled. It needs Tyler's explicit yes |

The list is complete. It covers MM-28 to MM-37, PREM-1, PREM-2, MM-43, MM-21, MM-29-XP and GR-66.

## 7. The final cut list for Tyler

Content-economy's list held one row. These are every removal I found in the three files. Rows marked RULED are already his and are here only so the list is whole. Nothing is deleted before he has seen it.

| # | What goes | From | Planned for later? | Note |
|---|---|---|---|---|
| 1 | 103 monster rows no hunt uses, three hunts with no ground, four called boss copies | GR-34 | No. The item check runs first and anything with a planned home stays hidden | The only row on the decider's list |
| 2 | On-call, hired and lent heroes, and the on-call board | MM-18 | YES, ruled 25-1 | Also reversal 18. It is the one large cut of a planned thing |
| 3 | The live party finder | GR-69 | YES, ruled 2026-10-15/16 | Also reversal 21 |
| 4 | The Local chat tab, and "maybe a fifth seat later" | GR-69 | No | The fifth seat is already ruled out by 25-11 |
| 5 | The castle's labor, votes, upkeep, treasury balance, Clan Standing and five buildings of ten levels | MM-9 | Built or planned in the social inventory | Rides reversal 19 |
| 6 | The clan library and any Level XP room | MM-9, MM-25 | No | It keeps ruling 25-2 |
| 7 | The rested bank and two old kill ladders | GR-63 | No | Measured as moving no number in 207 cells |
| 8 | The farm's soil tiers and the water button on a bed | GR-74 | No | A built sink of 130,500 gold goes |
| 9 | Potato, if it finds no hunt consumer | GR-74 | No | |
| 10 | The Crafting bench's three salt recipes | GR-43 | No | Salts stay on the other bench |
| 11 | The Cellar's five food rungs, off sale | GR-47 | No | The Cellar is ruled to become the curing room |
| 12 | The Trophy room's five mount rungs | GR-73 | No | Off sale is RULED (26-6) |
| 13 | The sixteen House speed rungs | GR-76 | No | RULED (26-1) |
| 14 | The priced setup slots | GR-56a | Ruled 2026-11-05 and 2026-11-04 | Also reversal 13 |
| 15 | The unused "resists a weapon" column, the per-ground tier dials and the "no bigger pulls under floor 16" rule | GR-14, GR-5, GR-27 | No | Formula clean-up |
| 16 | The Moonbloom seed in the Shop | GR-77 | No | It becomes a drop |

Not cuts, kept hidden for later: capture the flag (MM-46), the clan's shared hunt (MM-48), the status pairs of GR-20 (paper only), Kindlings (GR-61, paper only), the other 36 Catacombs pieces (GR-36), the second dropped seed (GR-77), bulk commissions (GR-44), side against side (GR-71).

## 8. Tyler's principles, checked

| Principle | Result |
|---|---|
| Formula layer, no special-case code | Holds in the decisions. Three places needed a fix so they stay that way: the hall number (fix 12), defensive buffs as rating rows (fix 4), the ground weekend as an event row (fix 3) |
| Nothing planned is cut | Two planned things are cut: on-call heroes and the party finder. Both are on the reversal list and the cut list |
| The itemization plan as source of record | Content-economy cites it throughout. GR-4 moves off its two bands a region, and fix 15 moves it back toward the plan |
| Buffs and gear as rewards | Holds. The Even Arena's top reward becomes +5% material find after fix 3, which is thin. It is a HYPOTHESIS for the playtest (MM-40's read) |
| Crowns give a real advantage that is not broken | Holds under one ceiling after fixes 1 and 2 |
| Two arenas | Holds (MM-13). One loop closed in fix 26 |
| Four heroes from day 1 | Holds (GR-79). The first hour is repaired in fix 6 |
| No solo or group targets | GR-88 keeps pair cells out of the gate. CORE-1 sized a tier on a lone hero, fix 14 |
| Krell's day | Day 31 is a real reversal, listed as row 2 |

## 9. What I did not check

- I did not re-run the lineup cells (the tier dial at 1.5, 2.0 and 2.5 times) behind GR-3 and CORE-1. Core labels them direction only.
- I did not re-derive GR-8's price shares (0.19, 0.40, 0.18), GR-7's rung Levels (97, 140, 257), GR-23's skill shares or any number quoted from studies 44, 47, 49, 51, 53, 54, 55 and 58. I read those as quoted.
- I did not read chapters 01 to 09 in full. I read every "still missing" section and the passages the fixes cite.
- I did not read `docs/design/itemization-plan.md` in full, only section 2's band rule.
- The harness is not calibrated for survival or gold. Every measured row here is as strong as the harness and no stronger.
- C1 (a tag for each starting way) is not run. My C2 run is steady pace at Levels 1 and 3, not a played climb from Level 1 to 5.
- My smoothest convex cut is a grid search, not a proof of the smallest step. It shows a line under 2% exists.
- I checked 23 reversal rows against the rulings file. I did not search the whole file for rulings that some decision bends without saying so, beyond the ones found here.
- Server cost, the Security scope and anything that waits on study 48 are untouched.
- The fixes that are design changes of mine (fixes 6, 9, 12, 23, 26, 27 and the gold-priced boosts) are HYPOTHESES. None was played.
- The three decision files were not edited. The fixes above are for their owners or the integrator to apply.
