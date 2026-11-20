# Balance program 31: the plan, audited cold

2026-11-20. An unanchored audit of `30-plan.md`, `30-decisions.json` and their inputs, on `set/v0.2.143`. I did not write the plan and was given no summary of it. No game code, data or migration was changed.

Labels: **MEASURED** (I ran the command named beside it, today's engine), **CITED** (a file and line, or another lane's measured baseline), **COMPUTED** (arithmetic here on cited or measured numbers), **ASSUMED**.

---

## A. One screen

**Is the plan safe to build? Yes, with fixes.** The direction is sound, every one of the 115 systems has a verdict, and 89 of the 104 decisions sit on a lane row (the other 15 are readings, duplicates or no-build calls). Nothing here says stop. But the plan was written at 10:49 and 12:21 local and Tyler ruled the 63 open calls at 18:11 to 18:25 UTC, so the plan has not absorbed his exceptions, and four of its own numbers do not survive being measured.

| | Count | The short of it |
|---|---|---|
| BLOCKER | 2 | The plan predates the rulings (nine lanes or numbers now contradict them). The first-hour pace fix (L05) is sized and guarded by a tool that reads twice what was played |
| MAJOR | 12 | Order of the two combat laws against the tier dials. The pair and the three are never measured. The harness reads 0.83 of the real four. The slot guard goes red on the ruled price. The Morrow Hills open before their item game. Guard gaps. No test column. One Global chat has a bill nobody showed Tyler. No dates, and the work does not fit mid-January |
| MINOR | 17 | Listed in section D |

**What is good and should not be touched.** The order "to-hit, then prices" is right. Putting Hask's Ford's and Krell's XP fits in the same lane as the tier dials is right. The guard exists already (`lane/c-balance-guard`, 18 lines plus K1, D1, D2, plain run 146 s MEASURED by that lane) and its calibration line K1 is the most valuable line in it. Carry on, the loot plan by kind and Tend the field are the first principle done properly.

**The three things I would fix before any lane is dispatched from this plan:**
1. Re-issue section D against the rulings (finding B1). Half a day, docs only.
2. Settle which is true for a new player, 6 hours to Level 10 or 11 (finding B2). One blind play and one tool fix.
3. Put the spell rule before the tier dials, or say in the plan that the dials are sized twice (finding M1).

---

## B. Blockers

### B1. The plan was written before the rulings. Nine lanes or numbers now contradict them

Evidence: `git log -- docs/design/balance-program/30-plan.md` (last commit 2026-11-20 12:21 -0600). `30-decisions.json` still carries 56 `open` rows (MEASURED, `node -e` count: open 56, ruled 41, amended 7). Rulings of record, first entry, 18:11 to 18:25 UTC.

| Ruling (Tyler 11-20) | What the plan still says | Where | Fix |
|---|---|---|---|
| 27-6: the reveal stays on EVERY Rare | "The reveal for Trophy and Very Rare only" | L26, top-ten row 5 of dive 27, horizon table | L26 keeps the reveal on every Rare. Design note: an Own four gets 7 to 26 a day while away (CITED 27-retention.md:47), so on the away card they play as ONE roll-through, best first. Otherwise it is a repeated press |
| 28-6: ONE Global chat | "Chat rooms of 250" | L46, validation row, 28-5's "built in rooms" | L46 drops rooms. See M8 for the bill |
| 30-8: clan rations MAY enter the Catacombs, capped by the week | "Rations cannot be carried into the Catacombs" | C6, L48 | L48 and L50 carry a weekly ration cap row. The designer sets the number (no number is ruled) |
| A-10: sketch regions 4 to 7 NOW | "Held, with no lane: regions 4 to 7" | Held list under wave 4 | New lane L56 (design only, no dependency): the four region sketches, each with its key row, weapon-line growth and unique count |
| 23-7: cut list yes, but LUCKY FINDS STAY | "the 24 lucky-find rows" are cut | L36, 23-7 | L36 cuts the rest. The 24 sourceless lucky-find rows each get a source on a placed monster |
| 23-9: Storm and Bone unlock levels WAIT on a spell audit | "Storm and Bone runes at Runecrafting 65 and 80" | L44 | New lane L57: the designer's audit of every current spell against the game's direction. It must land BEFORE L17, because L17 rewrites every cast (see M1). L44 waits on it |
| 24-4: Premium KEEPS the daily 1 hour training item | "The daily gift's training item held" | C9, L27 | L27 ships the gift as the training item. To keep 26-10 true (training for money waits for the yard fee and to-hit), L27 gains the dependency L15 + L19 |
| 26-10: the "train every idle hour" condition REJECTED | S5 "Training items stay off sale until it passes", C9 "a third condition", G11 "turns red in L19" | S5, C9, G11 | Training items go on sale when L15 and L19 are live, nothing more. G11 may stay as a REPORT line and never gate. Note for Tyler in section F: today it reads 66% less damage at Krell (CITED guard baseline G11 `hold dmg 0.339`), which is the thing to-hit is meant to fix |
| 27-8: the zero rule DEFERRED | "The zero rule in three classes" | L28 | L28 keeps the daily ten and the roll-up dashboards and drops the zero rule |
| 25-4: castle-goods amendment DECLINED | "goods at recipe value", C11 "Amends 25-4" | C11, L50 | L50 keeps the built prices. But 23-8 (recipe value 3.1M, ruled as recommended) now disagrees with 25-4. Tyler rules, section F item 3 |
| A-3: yes, with an unfinished note | L52 as written | L52 | Tyler finishes the sentence, section F item 4 |
| Hero slots 400k / 1.5M / 4M | Agrees | L06 | None in the plan. `src/data/shops.js:64,70,76` still reads 300k / 750k / 1.5M until L06 (MEASURED, grep) |

Also stale: every "Depends on: Tyler: NN-N" cell and the whole "What rides v0.2.144, and what waits" table. All calls are ruled, so L05, L07, L12, L13, L15, L20, L21, L35, L36, L39 and L46 are unblocked today.

Lane touched: L26, L27, L28, L36, L44, L46, L48, L50, L52, two new (L56, L57), sections B, C and E of the plan. **Smallest fix: one docs lane re-issues `30-plan.md` section D and flips the 63 rows in `30-decisions.json`.**

### B2. The first-hour pace fix (L05) is sized on a tool that disagrees with play by about two times, and its guard line is green before the fix

- CITED `27-retention.md:779`: PLAYED, a start-kit hero on the Thicket's Normal earned 17,200 Level XP an hour, Levels 8 and 9 took 3.8 and 4.7 hours, Level 10 was "about 11 hours on my path".
- CITED `10-real-players.md` through `24-economy.md` Q9: both real light players stopped at Levels 7 to 9 after 12 and 6 hunted hours.
- MEASURED `node tools/balance-sim/life.mjs --party hammer --policy idle --to 12 --max 16`: Level 10 at **6.12 h**, band 1 to 9 at 33k XP an hour.
- CITED guard baseline (`origin/lane/c-balance-guard:tests/balance-guard.baseline.json`): `G6 {"Level 10": 6.12, "longest under 10": 2.2}`. G6's red is "over 7 h, over 2.5 h".

So on today's game, before L05 changes a number, G6 reads inside its band. Either the tool is right and L05 is not needed (and would make the first ten Levels too fast), or the play is right and the guard cannot see the problem it was written for. The real players agree with the play. The likely cause is the path: the tool's idle hero moves to Wickstead and the played hero stayed in the Thicket (the tool prints "Level 10 at 6.12 h on wickstead"). That is itself a finding: the advised ground may not be where a blind player goes.

Smallest fix, before L05 merges: (1) one blind play to Level 10 on the local world with the clock read from the server, (2) `life.mjs --policy idle` made to follow what the screen really advises until it reproduces that play within 15%, (3) only then size the re-cut, and G6 must read RED on today's curve first (CLAUDE.md §4: a guard that has never been red is not a guard). Lane touched: L05, L14.

---

## C. Majors

### M1. The tier dials (L16) are sized before the spell rule (L17) changes the healer and the Mage

L16 sizes Deadly 1750 and Dangerous 1400 "on the real kit (a healer...)" (30-plan.md:55, 223). L17 then makes every cast, heal and shell a share of the caster's own blow (21-combat.md change 2: Greater Mend is 31% of a hero at Level 60 today). Three of the four seats in the reference four are casters or lean on casts. So G3, G5 and G8 turn red in L16 and are all moved by L17. The same holds for L18 (the Tower curve: Shelter is "the Tower tank's button", 21-combat.md:519) and for L22 and L23, which price off L16.

Smallest fix, pick one: **(a) recommended: order L15, L57 (spell audit), L17, then L16 + L18, then L22, L23.** It costs the tiers about a week and sizes each dial once. (b) Keep the order and write into L17 "re-run L16's 4 seed x 8 hour sample, re-write G3, G5, G8, re-size if out of band". The plan's hard-order list must say which. Lanes: L16, L17, L18, L22, L23.

### M2. The pair and the three are never measured, and the slot ladder makes them eight weeks of the real player's life

The pace of record (30-plan.md:29, C4) ASSUMES a pair at 1.2 and a three at 2.0 times the lone table. On ladder A the Own four is a pair from about Level 33 to 41 and a three from 41 to 51 (24-economy.md Q9: 3.4 + 4.8 weeks). No guard line plays either seat (G1 lone, G3 four).

MEASURED, today's engine, `node tools/balance-program/measure.mjs what --at glade|ford --seat four --patch-file pair.json --hours 1 --seeds 2` (x the four's own XP a head on Deadly):

| Party, Deadly | Glade (30) XP a head | low HP | net gold | Ford (50) XP a head | low HP | net gold a head |
|---|---|---|---|---|---|---|
| The reference four | 1.00 | 86% | 4.9k | 1.00 | 68% | 1.3k |
| Pair, hammer + Mage | **1.38** | 40% | 7.8k | **1.46** | 29% | -21.4k |
| Pair, tank + Mage | 1.13 | 48% | 7.1k | 1.20 | 27% | -22.7k |
| Three, tank + healer + Mage | 1.10 | 78% | 4.7k | 1.11 | 66% | -0.7k |
| Three, tank + bow + Mage | 1.20 | 66% | 7.0k | 1.21 | 37% | -0.4k |

The four reads 1.76 and 2.62 of the contract at those points (CITED guard baseline G3). So a pair on Deadly reads about **2.4** of the contract at the Glade and **3.8** at the Ford today, with no deaths in two seeded hours (COMPUTED: 1.76 x 1.38, 2.62 x 1.46). The plan assumed 1.2. After the dials move the pair may not hold Deadly at all, which nobody has measured either. Either way "Level 50 at about 140 hunted hours, day 43" rests on two numbers that are wrong by up to three times in one direction or unknown in the other.

Smallest fix: add the pair and the three to `guard-cells.mjs` as a new line G19 (Levels 30 to 50, hardest tier they hold, same 1.8 to 2.5 ceiling a head), add both to L16's sample, and recompute the pace of record from measured cells in the re-issued plan. Lanes: L14, L16.

### M3. The harness reads 0.83 of the real four on XP and 0.51 on gold, and the cap is judged on the harness

CITED guard baseline: `K1 {"Level XP": 0.829, "kills": 0.831, "net gold": 0.507}` (the harness four in the real Krell four's seats over the real hunt). K1's own target is 0.9 to 1.1 and its mode is "never red alone".

G3's red is 2.6 on the harness. At K1 = 0.83 that is 3.1 for a real party (COMPUTED). The plan corrects Krell by 12% for this, but not the Ford, the Slake or Pyre, where the same real kit plays. G8's "3k to 8k a hero-hour" is read on a harness that sees half the real gold.

Smallest fix: K1 gates. L16 may not flip G3, G5, G8 or D1 to red while K1 is outside 0.9 to 1.1 on XP and 0.8 to 1.2 on gold. The work is in the harness's four (the healer's cheap heals, the cheaper runes, a quarter of supplies home-made: the plan lists these at 30-plan.md:56 but gives them no lane). Put it in L14's follow-up, before L16. Lanes: L14, L16.

### M4. The slot guard goes red on the ruled price, and the bank it reads is typed, not played

- G9: "price / bank at Level 32, red over 1". CITED baseline `G9 {"slot 2": 0.808}` at today's 300k, so the bank it reads is 371k. At the ruled 400,000 it reads **1.08, red, on the day L06 lands** (COMPUTED from `gold-model.mjs` BANK `[30, 276000], [45, 991000]`).
- That BANK table is hand-typed from the 11-18 board. MEASURED `node tools/balance-sim/life.mjs --party hammer --policy rec --to 34 --max 110` on today's engine: a lone played hammer has netted **370k by Level 30 at 47.9 hunted hours**, and is Level 34 at 63.3 h, every drop sold and nothing bought. The typed table says 276k at 30.
- So the plan's "about Level 33 and 68 lone hours" reads about Level 31 and about 50 hours on the engine, if the player sells everything and buys nothing. A real New player spends 10% and one sold nothing in 12 hours (CITED 24-economy.md).

Smallest fix: G9 reads the bank from a played life (the command above, in the nightly twin), not a typed table. Then Tyler's 400k either passes honestly or the designer moves it, by the standing guard he already approved. Lane: L06, L14.

### M5. The weeks to the fourth hero were computed on income the plan itself halves

24-economy.md Q9 prices slots 3 and 4 in weeks "at Q1's free gold" with "every coin to the slot": 12.3k a hero-hour at Level 50 (MEASURED here, `gold-model.mjs`, Own four row). Stack S3 of the plan takes that to "about 6k (12k today)" on Deadly (30-plan.md:127), then adds Blessings, the yard fee and steeper refills. COMPUTED: slot 4 at 4,000,000 by three heroes x 3.3 h x 7 days x 6k is 9.6 weeks, not 4.8. The real spending share is 17%, not 100%.

So "your own four by about week 11" (30-plan.md:17) is nearer week 16 to 20 on the plan's own numbers, and the pace of record (which assumes the slot Levels 33, 41, 51) moves with it. This may be exactly what Tyler wants ("even more"). It must be a number someone reads, not a side effect.

Smallest fix: a report line G20, "weeks to the second, third and fourth hero for the Own four", from `gold-model.mjs --slots` on post-L16 income. Re-read at L16, L22, L23. Section F item 5 asks Tyler which week he wants. Lanes: L14, L22.

### M6. Levels 16 to 31 are one ground for a lone hero, and the slot ruling makes that stretch longer

CITED 27-retention.md:124: "EMPTY. One ground for fifteen Levels (16 to 31)" for the day, "THIN" for the week. MEASURED (the life above): Level 15 at 16.9 h, Level 30 at 47.9 h, so about **31 hunted hours, 23 of them on the Glade**. At the New player's 2 hours a day that is over two weeks on one ground, alone, where heroes die 6.7 times in 100 hours (CITED). The plan's answers are the Bestiary's Luck (L20) and the re-spaced deeds. Both are a clock, neither is a place to go or a decision. The only check is a dashboard line after the wipe ("red if more than half stop there").

Smallest fix: make the blind persona play "a lone account from Level 10 to its second hero" (already in section F) a GATE for the beta, not a validation after it. If it reads empty, the cheapest content is the scaled hunt (L31, already built, switch off): open one scaled lone ground in this band, which also gives the Bestiary's later stages a home. Lanes: L20, L31, section F.

### M7. The Morrow Hills open (L47) before their item game exists (L52)

Past tier 7 "standard upgrades stop and gear becomes a property a build is made of... the whole item game from Level 110" (CITED 23-items.md:338). L47's row lists the price index, Luck step 3 and Very Rares. Uniques are L52, which DEPENDS ON L47 and is "a sample of five". After the spell rule the weapon line is "the ONLY growth law for output, heals and shells" (CITED 21-combat.md:521), and a Platinum Tower weapon is x0.66 against it at Level 175 unless "every region has its key row in the same patch" (CITED 22-endgame.md:439). None of that is in L47's scope cell. The plan's own page says the Morrow Hills must be open six weeks after a wipe.

Smallest fix: L47's scope names the weapon line past tier 7, the region's key row and the first unique sample. L52 moves before L47 (it can be built dark against the staged grounds). Lanes: L47, L52, L29.

### M8. One Global chat was ruled without its cost on the page

`30-decisions.json` 28-6 alternative reads only "unreadable past a few hundred". The dive's number is not in the row: about **$1,080 a month at 1,000 listeners and over $30,000 at 10,000** on Realtime broadcast (CITED 28-platform.md:228, ASSUMED list prices). It is also the fifth and last Realtime topic a client holds once the clan tab ships (CITED 28-platform.md:232).

This is a money call and it is Tyler's. Smallest fix that keeps his ruling: one Global for everyone, carried on the single heartbeat of L25 as a batch of new lines every few seconds, with a server-wide slow mode that tightens as the room grows. No per-delivery bill. Section F item 1. Lanes: L46, L25, L40.

### M9. The guard covers about two thirds of what the plan promises

Promises in the plan or the rulings with NO line in section E:

| Promise | Source | Proposed line |
|---|---|---|
| The pair and the three | M2 | G19 |
| Weeks to each hero slot | M5 | G20 |
| The Tower: a set-up four tops out between its Level and Level + 25. No hero from 10 to 30 earns more in the Tower than hunting | 22-1, 22-7 | G21, `endgame.mjs climb` |
| Refills: the first two pay at every Level, six are gold-neutral at 80 | 24-1 | G22, `gold-model.mjs --refills` (the mutate list plants a refill step but no line reads it) |
| The bar budget: a family fills at most 0.85 of the offense lane | 21-6 ("data and one guard") | G23, a data scan |
| Scaled hunts never the best lone XP | 22-9 | G24 |
| Faction skills within 2% | 25-9 | joins G4's cell when built |
| Very Rares on the party's clock past Krell | 30-3 | a formula line with L47 |
| Event XP under 5% of all Level XP | S2 | dashboard only. Say so |
| Repeating sinks 35 to 50% of gold in | F | dashboard only. Say so |

Lane: L14 (a follow-up, report mode).

### M10. No lane row says what it is tested with, and the both-paths rule is not mentioned once

CLAUDE.md §4: anything touching combat, death, hunt sessions, stamina or supplies ships one test with the hunt viewed and one with the browser closed. Section D has no test column, and the words do not appear (MEASURED: `grep -c -i "both paths|browser closed|viewed" 30-plan.md` reads 0)\|browser closed" 30-plan.md` would read 0. The words do not appear). Lanes that need both paths: L06 (refills), L07, L08, L12, L15, L16, L17, L18, L19, L21 (run on return), L30, L31, L40 (a hero hunting in another account's party while its owner is offline), L43, L44, L48 (supplies end the run, an exception to a standing rule).

Smallest fix: one column in the re-issued section D. Lane: all of the above.

### M11. L12 is the riskiest lane in the plan and its failure case is not written down

"Confirm in the edge, commit at the 90 s flush" (CITED 28-platform.md:58) means a watched player sees up to 90 seconds of gold, supplies and loot the database does not hold yet. CLAUDE.md §6: the browser never says one thing while the server says another, and anything spendable renders from the projection. An Edge isolate can die between flushes. The dive says deaths, Levels, Leave, the end and rare drops commit at once. It does not say what a store buy, a carry-in, a refill, a market listing or a party member's own settle reads inside the window.

Also unlisted: L12, L13 and L24 rewrite the settle path while L15 and L17 rewrite combat. The parity proof for each engine batch needs a still settle path under it.

Smallest fix: L12's brief carries (1) every money or supply intent forces a flush first, (2) an isolate-kill test that proves the re-settle reproduces the same frames, viewed and closed, (3) a stated order: L12 lands and bakes one nightly before L15, or after L17, never between. Lanes: L11, L12, L15, L17.

### M12. There are no dates, and the work does not fit the launch plan as ruled

Section D sizes lanes S, M, L and gives no time. MEASURED by count: waves 1 and 2 are 28 lanes (10 S, 13 M, 3 L, 2 built or done), wave 3 is 18 (5 S, 9 M, 4 L), wave 4 is 9 (1 S, 4 M, 4 L) and 45 surfaces are marked for the one Security review.

ASSUMED: S 1 day, M 3, L 6 of lane time, 3.5 lanes at once, one engine batch at a time with a nightly between. COMPUTED:

| Stage | Lane-days | Calendar, best case | Realistic |
|---|---|---|---|
| Waves 1 and 2 (gate the beta) | about 67 | 4 weeks | 5 to 6 weeks. L15 is marked M and is an L (every monster re-authored, every ground re-graded, catalogue and edge). The chain L11, L15, L17, L16, L22, L23 is serial |
| Wave 3 (in the beta) | about 56 | 3.5 weeks | 5 weeks |
| Wave 4 and the Security review of 45 surfaces | about 40 plus the review | 3 weeks | 5 weeks |

So the beta opens about the end of December at the earliest. The ruled launch plan (rulings-of-record.md:249) is a closed beta of 2 weeks, an open beta of 6, then Early Access "earliest mid-January". On this plan Early Access is **late February to late March 2027** (COMPUTED). The same ruling says June is acceptable. Section F item 2. No lane touched. The plan should print the dates.

---

## D. Minors (17)

| # | What | Evidence | Fix | Lane |
|---|---|---|---|---|
| 1 | Card-level change rows with no lane: Shop buyback (RULED, not built), chat open by default with System lines, friend System lines, market ceiling floor for stackables, cloak and belt perks (Crafting has three worn rows and none past Level 30), `hr_trait_buy` granted with no caller, `vitals.mjs --help` | 24-economy.md card `shop`, 25-social.md cards 2 and 3, 23-items.md:706, 27-retention.md "For other dives" | One mechanical pass: every card's change row gets a lane or a "held" or "cut" word, checked like `inventory.mjs --check` | new docs lane |
| 2 | The loot plan sells by kind for the whole account with nobody watching, and buyback is not built | 23-1, row 1 above | L21 never sells a Rare or better by a kind rule unless the player ticks it, and buyback rides L21 | L21 |
| 3 | Growth with no prune and no lane: `cron.job_run_details` (1.9M rows a month), run boards, `chest_opens`, the one-row hunt summary for 90 days | 28-platform.md section 6 | Add to L28 or L54 | L28 |
| 4 | Not sized for 10,000: bodies packed by engine time, tick shards above 1, leaderboard rebuild at 40,000 heroes (UNMEASURED), Town Works hot row, market expire at 200 a pass | 28-platform.md sections 2 and 5 | Name each in L11's synthetic 1,000-account run as a read. Build before Early Access, not the beta | L11, L54 |
| 5 | The clan tab takes the fifth and last Realtime topic | 28-platform.md:232 | L40 multiplexes one social topic | L40 |
| 6 | L10 cuts the gem RPC in wave 1. The Discord gift pays gems and is cut in L36, wave 3 | 27-retention.md:789 | Move the Discord gift cut into L10 | L10, L36 |
| 7 | Open Halls waives Call out's gold fee. L06 removes the fee, so the event does nothing | `src/data/live-events.js:48`, 22-8 | Cut Open Halls in L06 or give it a new effect in L26 | L06, L26 |
| 8 | L32's dependency cell lists L17 only. The hard-order list also needs L16 and L22 (priced on income) and L31 (the lining part drops on old grounds through scaled hunts, Tyler 11-18) | 30-plan.md:254, 295 | Fix the cell | L32 |
| 9 | L29's "+4 to +8%" was measured before the spell rule, after which a weapon also scales every cast | 22-2, 21-5 | Re-measure in L29, G4 re-read is already planned | L29 |
| 10 | C5 says an Own four finds "about one Very Rare a band" to Krell. The Krell update says one every 8 to 11 hours of account hunting. That is 2 to 3 a band and about 40 by Krell (COMPUTED: 119 days x 3.3 h / 9.5 h) | 30-plan.md:160, decisions 23-3 update | Correct the sentence. It is inside the "generous to Krell" ruling. Check Very Rare prices at 1,000 players once the market opens | L47 |
| 11 | Ruled or approved items with no verdict anywhere in the program: quivers as late bow off-hands (11-18), Studies (pinned Bestiary bonuses, 11-18 "not objected", and it conflicts with "Luck is the Bestiary's reward"), scaled early hunts for a party leader (11-07 idea), jewel guarantees (dark lane) | grep count 0 across `2?-*.md` and the plan for "quiver", "Studies", "scaled early" | Add each to the held list with one word. Studies should be cut by name | docs |
| 12 | The parked `lane/c-ledger-fold` overlaps L13 | master backlog item 16, 24-economy.md:518 | L13 starts from it or retires it | L13 |
| 13 | L50 (the castle) is a wave 4 "before Early Access" lane gated on "clans with 10 or more accounts", which a wiped beta may never reach | 30-plan.md:277 | Move L50 after Early Access. It is the largest build that no real player has asked for | L50 |
| 14 | Faction skills are held to "within 2% or not shipped". A combat skill that may not matter fails the purpose test | 25-9, CLAUDE.md §10 | Ship factions as standing and looks. Cut the two skills, or make them a sidegrade with a cost | L53 |
| 15 | Curing and linings are a weekly chore of about 16 cures for an Own four unless they are a standing order | 23-items.md "For other dives", curing | L32 and L33: "keep these linings up" is a remembered line inside Carry on | L32, L33 |
| 16 | A real Tower climb ended `server` with six `value_over` refusals, "still unexplained" | 22-endgame.md:446 | A bug lane before L18 re-fits the curve on top of it | L18 |
| 17 | Names that are Tibia's own words, not just its mechanics: "depot" chests, and the trio Blessings, Bestiary, Premium together. Each alone is a genre word (11-14 ruling). "Depot" is not | 26-9, CLAUDE.md §10 identity | Rename the depot chests in L45. Leave the rest | L45 |

Out of the program's scope by the inventory's own rule, and still on the road to Early Access: sound (`lane/b-sound`, held), the Steam shell (`lane/b-steam-shell`, not on main), phone layout. They are not balance. They are "studio quality". The re-issued plan should name them once so nobody thinks they were weighed.

---

## E. Answers to the eight questions, in one line each

1. **Coverage.** 115 of 115 systems have a verdict card (MEASURED: headings of `21` to `28`, 23 + 8 + 22 + 14 + 11 + 15 + 14 + 8). 89 of 104 decisions are named on a lane row. The 15 that are not are readings or no-build calls (28-3, 28-8, 28-9, 30-5, 30-7, 27-9, 28-5, 25-11), duplicates (A-4, A-6, A-7), or carried inside another row (23-3, 25-2, 26-10, A-10). Lanes with no decision id: L01, L24, L34, L55, all correct. Gaps: card-level change rows (minor 1) and four ruled items (minor 11).
2. **Exceptions.** Not absorbed. Finding B1.
3. **Sequencing.** The listed hard order is right. Missing: L17 before L16 and L18 (M1), the spell audit before L17 (B1), L27 after L19, L12 placed against the engine batches (M11), L52 before L47 (M7), L10 with the Discord gift (minor 6).
4. **Balance together.** Four misses: the pair and three (M2), the harness against real (M3), slot weeks on halved income (M5), the lone stretch 16 to 31 (M6). S1 to S6 hold as written. Gold in against sinks holds by ruling (sinks are above income on purpose): the Own four frees about 1.1M a week from Level 50 today against a 50.6M shelf (MEASURED `gold-model.mjs`, `--shelf`).
5. **Scale.** The four server lanes are the right four. After them, still unbounded or unsized: one Global chat (M8), four tables (minor 3), five 10,000-player items (minor 4).
6. **Fun and identity.** The hour, day, week and six-month chases are named and real. The month is thin between Levels 16 and 31 alone (M6) and empty past 110 until L47 and L52 (M7). Cut or shrink: faction skills, the castle before Early Access, Studies.
7. **Testing and risk.** M9, M10, M11.
8. **Estimate.** M12.

---

## F. Tyler rules on

1. **One Global chat and its bill.** Sending every chat line to every player the fast way costs about $1,080 a month for each 1,000 players listening. That number was not on the ruling page. Recommended: keep one Global as you ruled, send lines in small batches every few seconds on the connection the game already has, and slow the chat down as it gets crowded. It costs nothing extra. Alternative: keep it instant and pay the bill as the game grows.
2. **The Early Access date.** The plan has no dates. Counting its lanes, the beta can open about the end of December and Early Access lands between late February and late March. Recommended: accept that and print the dates in the plan. Alternative: hold mid-January and move the castle, Crowns, the Catacombs and faction skills to after Early Access.
3. **The clan castle's goods.** You approved "price castle goods at what they cost to make, about 3.1M" in the items list and declined "show 3.1M" in the social list. Both cannot be true. Recommended: keep the built prices as you said, and only fix the two goods that cannot be made today (the Keystone and the Timber Beam's Slime Gel). Alternative: re-price all castle goods at 3.1M.
4. **Uniques moving up a band.** Your answer was cut off: "Yes, but i also want the next band to". Please finish it. Recommended reading until you do: a unique can be reforged up a band and keeps its property, and each new band also gets new uniques of its own.
5. **How long until a player has four heroes.** The plan says about week 11. With the gold changes in the same plan it is nearer week 16 to 20. Recommended: aim for week 14 to 16 and let the designer set the third and fourth slot prices to hit it after the gold changes land. Alternative: keep 1.5M and 4M whatever the week turns out to be.
6. **The first hero slot.** You approved a rule that the first slot never costs more than one hero alone has earned by Level 32. The typed table says that is 371,000, so 400,000 breaks the rule. A played run says the hero has 370,000 by Level 30 and more by 32, so 400,000 passes. Recommended: keep 400,000 and make the check read the played run. Alternative: drop the first slot to 370,000.
7. **The training check you rejected.** You said simulating a hero who trains every idle hour is stupid as a condition for selling training items. Agreed, it is gone as a condition. Recommended: keep the same reading as a number we look at and never as a gate, because today it shows trained Defense cutting damage by 66% at Krell and it is how we will know the to-hit fix worked. Alternative: delete the line.
8. **Faction skills.** The plan only ships them if they make a hero less than 2% faster. A skill that is not allowed to matter is not worth building. Recommended: factions give standing and looks, and the two skills are cut. Alternative: keep them as planned.
9. **The order of the two combat changes.** The plan makes Deadly harder before it changes how spells scale. The spell change moves the healer and the Mage, so Deadly would be sized twice. Recommended: spells first, then Deadly, about a week later than planned. Alternative: keep the order and re-size Deadly in the spell patch.

---

## G. Measured, cited, assumed

**Measured here (today's engine, `set/v0.2.143`):**
- `node tools/balance-program/measure.mjs what --at glade --seat four --patch-file <pair.json> --hours 1 --seeds 2`, and `--at ford` (M2's table).
- `node tools/balance-sim/life.mjs --party hammer --policy idle --to 12 --max 16` (Level 10 at 6.12 h). The same with `--to 34 --max 110` stalls at Level 16 with 2,956 deaths, because the idle hero never changes its start kit. It is not valid past about Level 15 and is not used above.
- `node tools/balance-sim/life.mjs --party hammer --policy rec --to 34 --max 110` (370k by Level 30 at 47.9 h, Level 34 at 63.3 h).
- `node tools/balance-program/gold-model.mjs`, `--shelf`, `--slots`.
- Counts by script: 56 lane rows, 45 Security surfaces, sizes by wave, decision ids on lane rows, decision statuses.

**Cited:** the guard baseline on `origin/lane/c-balance-guard` (G3, G6, G9, G11, K1). I did not re-run the guard. Every dive number, with its file and line.

**Computed:** the pair's multiple of the contract, G9 at 400k, slot 4 weeks at 6k, Very Rares to Krell, the calendar.

**Assumed:** lane-days a size (S 1, M 3, L 6), 3.5 lanes at once, Realtime list prices (the dive's).

**Not done:** no blind play in the browser pane (B2 asks for one). No measurement on the ratio engine or the 1750 dial with a pair or a three: `tohit-ratio.mjs play` takes only the three reference seats. No production read. The eight dives were read by summary, change rows, hand-off tables and targeted search, not line by line.
