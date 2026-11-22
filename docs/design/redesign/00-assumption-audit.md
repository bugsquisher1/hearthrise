# The overhaul assumption audit

Deliverable 1 of the design reset. Written 2026-11-21 on `lane/rd-audit`, from `set/v0.2.144` at 861ae52e3. Docs and one JSON file. No game code, data, guard or older document was changed, and nothing was deleted. The machine-readable copy is `assumptions.json` beside this file.

The question it answers is Tyler's: which previous decisions are currently constraining the new design?

## 0. One screen

**The short answer.** Almost all of them. The overhaul book opens with a list of 266 of Tyler's rulings and treats that list as its frame. Of its 159 decision rows, 39 carry an old ruling forward, 15 are written as a reversal that needed his veto, and 45 more name one. The standards file grades the game on 113 bands, and 48 of them are labelled RULED. 150 test files and 166 data and engine files cite a dated ruling in their comments. The book is a careful repair of the old game. It is not a design from first principles, and it could not have been one under the rules it was given.

**Counts by class.** 110 standing decisions (older rulings and rules, grouped) and the 159 rows of the overhaul.

| Class | Standing decisions | Overhaul rows | Total |
|---|---|---|---|
| Core vision | 13 | 0 | 13 |
| Existing implementation decision | 26 | 21 | 47 |
| Balance assumption | 21 | 43 | 64 |
| Content decision | 22 | 82 | 104 |
| Technical constraint | 10 | 2 | 12 |
| Unresolved preference | 18 | 11 | 29 |
| All | 110 | 159 | 269 |

Only 24 of the 110 standing decisions should keep authority. None of the 159 overhaul rows keeps authority: under the reset the book is one candidate design.

**What the overhaul's 159 rows rest on.** Measured on the engine: 24. Evidence from the code or data: 30. Designer judgment, which includes arithmetic on old targets: 64. Hypothesis: 14. An older ruling of Tyler's: 27. An approved new requirement: 0. 80 rows read as fact without a measurement behind them, and 57 rows are already in a first-build lane.

**The twelve assumptions that shape the design most**, in order. Section 3 gives each one in full.

1. The ruling ledger itself is the frame (book 00 section 3, the `replaces` field and the reversal list).
2. The Level table of hunted hours (LP-1).
3. The damage and defense formulas as built (CO-3).
4. An account of four heroes, from the first day, in a party of four (HE-1, HE-2, HE-5).
5. No solo or group targets (HE-3). The reset reverses it in plain words.
6. The skill list, the weapon ways and the spell set (CO-4, CO-7, CO-8).
7. Fixed stats and seven tiers on a flat percent curve (IT-1, IT-2, IT-3, LP-5). Superseded for fixed stats on 2026-11-21.
8. Three tiers as percent dials, with death counts and a 6% death (TD-1, TD-3, TD-4).
9. Standards before design: 113 bands and the matrix gate (PL-3).
10. Nothing planned is cut (PL-6).
11. The agent decides and there is no approval wait (PL-1). It is still written in CLAUDE.md.
12. The stamina bar and the 12 hour day (LP-10, LP-2).

**What keeps authority.** The mission lines of CLAUDE.md section 1. The identity lines the reset takes as given: automated hunting, endless Levels, distinct styles without vocations, a gear chase, an economy driven by players, solo play that is worthwhile, party play that is compelling, thousands of hours. One engine for every hunt. The formula-layer rule. The business model and the server budget. The IP rule, the safety lines, the creative standards and the look. And the twelve requirements of 2026-11-21 in section 2, which include the new one on gear randomization. Everything else is history: kept on record, read as evidence, and binding on nothing.

**Three things need Tyler's word**, because an agent cannot settle them (section 9): CLAUDE.md still makes the designer agent the final authority. The first-build lanes have already merged code built on PROVISIONAL rows. And his own typed rulings of the morning of 2026-11-21 (four heroes from the start, the MMO layer, Talents, on-call heroes) are classed here as unresolved preferences to confirm inside a package, not as requirements.

## 1. How to read it

**Classes.** Each decision has exactly one of Tyler's six classes.

| Class | The test used here |
|---|---|
| Core vision | The game would be a different game without it, and the reset takes it as given |
| Existing implementation decision | A choice about how the old game was built or run |
| Balance assumption | A number, a target or a coefficient |
| Content decision | A choice about a spell, item, monster, ground or feature |
| Technical constraint | A real limit that holds for any design: law, money, security, platform |
| Unresolved preference | A stance of Tyler's that may well be right and needs a fresh yes inside a package |

**Constraining** means the decision is treated as binding somewhere today. The table says where: a book chapter or a decision row, a guard that fails if it changes, a band in `tools/balance-program/standards.mjs`, a line of CLAUDE.md, or code.

**Labels.** Each claim carries one of the six labels of his section 8. The label names what the claim rests on. In this audit an older ruling of Tyler's is a historical preference. Only the reset and what it restates is an approved new requirement.

**Sources.** Tyler's rulings of record and the notes they link, read in full for the newest month and skimmed before that. His page picks and the three sittings. The book, chapters 00 to 14, with all 159 rows of `decisions/all.json`, the designer rulings in `review/05`, `06`, `08` and `10`, and the reversal list in chapter 00 section 5.3. `docs/design/balance-program/62-decision-book.json`. CLAUDE.md. The guards in `tests/`, the bands in `standards.mjs` and the tables in `src/data`.

**Privacy.** His private notes are cited by date and paraphrased. Quotes come only from files already in this repository, from the reset directive, and from one requirement the Coordinator relayed.

**Grouping.** Repeats are grouped. One line here can stand for a dozen rulings on the same thing. The 159 overhaul rows and the 113 bands are listed one by one, because they are the claims his section 8 asks to be separated.

## 2. What keeps authority

### 2.1 The current requirements, all of 2026-11-21

These are not past decisions. They are the brief. R-12 arrived during this audit.

| Id | The requirement | His words |
|---|---|---|
| R-1 | Old decisions inform the review and do not decide it. | "Previous decisions should inform the review, but they should not dictate its conclusions." |
| R-2 | Start from the player experience. | "Start with the intended player experience, not the current implementation." |
| R-3 | Old number targets are hypotheses. | "Old numerical balance targets are hypotheses, not binding requirements." |
| R-4 | A fresh math foundation, with model families compared. | "Do not begin with current damage formulas and simply adjust coefficients." |
| R-5 | Shared mechanics, no new hard-coded exceptions. | "Do not create new hardcoded exceptions to force isolated content into balance." |
| R-6 | Every system must earn its place. | "They must earn their place in the new design." |
| R-7 | Redesign before balancing. No detailed numbers before the systems are validated. | "Do not lock detailed numerical rulings before validating the systems that produce those numbers." |
| R-8 | Approval by design package. An agent choosing an option does not make it final. | "Do not mark design decisions finalized simply because an agent has selected an option." |
| R-9 | No gameplay changes until the seven deliverables are reviewed. | "Do not implement gameplay changes yet." |
| R-10 | Keep every old decision as a record. | "Preserve them as historical records. Do not delete them." |
| R-11 | A recommendation is not a fact because a document holds it. | "Do not let a previous recommendation become a fact simply because it appears in a design document." |
| R-12 | Gear may carry randomization where it adds decisions. Flat percent upgrades alone are not enough. This supersedes fixed stats for each item (IT-1). | "Im totally cool with adding bits of randomization to gear if it makes the game more dynamic/more decisions to be made. Everything just being +x percent stronger feels dull, we need something deeper and more exciting when rare drops occur" |

### 2.2 Past decisions that keep authority

Core vision, real constraints, and standards that hold for any design. 24 of 110.

| Id | What keeps authority | Class | His words | Date | Where the words are |
|---|---|---|---|---|---|
| FR-1 | Multiplayer only, online only and server-authoritative. The client sends intents and draws the state the server returns. | Core vision | "The client never authors anything." and "A server-authoritative simulation." | 2026-08-10, 2026-11-21 | CLAUDE.md section 1 and docs/design/balance-program/45-design-brief.md section 3 |
| FR-2 | No client-side solo progression tier. It was rejected three times. | Technical constraint | No quote. See the source. | 2026-08-10 | CLAUDE.md section 1 |
| FR-3 | Hunts keep running on the server after the browser closes. A session is needed only to start or change a hunt. | Core vision | "Hunts keep running on the server after the browser closes" | 2026-10-18 | CLAUDE.md section 1 |
| FR-4 | The server owns anything tradeable, rankable or contributable, with clamps, a server clock and an append-only ledger. Row security is per user. | Technical constraint | No quote. See the source. | 2026-08-10 | CLAUDE.md sections 1, 2 and 6 |
| FR-5 | No back-compat, no save migration, and a wipe at the Early Access launch. | Technical constraint | "Design correctly, not compatibly." | 2026-10-17 | CLAUDE.md section 1 |
| FR-6 | Steam and desktop first, built for mobile from one web core, with phones in landscape and windows as sheets. | Technical constraint | No quote. See the source. | 2026-10-14 | CLAUDE.md sections 1 and 7 |
| FR-7 | The north star: a large multiplayer semi-idle game with a shared live world, on clean code. | Core vision | "a large-scale multiplayer semi-idle game with a shared live world" | 2026-08-10 | CLAUDE.md section 1 |
| FR-8 | Balance is fixed at the formula layer. One framework for each kind of mechanic, and no ground, weapon or monster gets math of its own. | Core vision | "My goal is to build a mathematically consistent, formula-driven MMORPG, not a collection of individually balanced hunting grounds, spells, monsters, weapons, and exceptions." and "Use shared mechanics instead of arbitrary content-specific exceptions." | 2026-11-21 | docs/design/balance-program/40-formula-brief.md and Tyler's reset directive, 2026-11-21 |
| ID-1 | Automated hunting with meaningful character preparation. The decisions live in builds, gear, ground choice, bar rules, resources and plans. | Core vision | "Automated hunting with meaningful character preparation." and "What makes automated hunting strategically interesting?" | 2026-11-21 | docs/design/balance-program/45-design-brief.md section 3 and Tyler's reset directive, 2026-11-21 |
| ID-2 | Character Levels never end. | Core vision | "Unlimited character progression." and "What makes progression rewarding across unlimited levels?" | 2026-11-21 | docs/design/balance-program/45-design-brief.md section 3 and Tyler's reset directive, 2026-11-21 |
| ID-3 | Distinct combat styles with no rigid vocations. | Core vision | "Distinct combat styles without rigid vocations." and "What makes different combat styles meaningfully distinct?" | 2026-11-21 | docs/design/balance-program/45-design-brief.md section 3 and Tyler's reset directive, 2026-11-21 |
| ID-4 | A deep gear chase with rare finds. | Core vision | "Deep equipment progression and rare drops." and "What makes equipment acquisition exciting?" | 2026-11-21 | docs/design/balance-program/45-design-brief.md section 3 and Tyler's reset directive, 2026-11-21 |
| ID-5 | Solo play is worthwhile and party play is compelling. | Core vision | "Solo viability alongside rewarding four-character parties." and "What makes solo play worthwhile?" and "What makes party play compelling?" | 2026-11-21 | docs/design/balance-program/45-design-brief.md section 3 and Tyler's reset directive, 2026-11-21 |
| ID-6 | A persistent economy driven by players. | Core vision | "A persistent, player-driven economy." and "What creates a sustainable economy?" | 2026-11-21 | docs/design/balance-program/45-design-brief.md section 3 and Tyler's reset directive, 2026-11-21 |
| ID-8 | The game stays meaningful over thousands of hours. | Core vision | "Systems that remain meaningful over thousands of hours." and "What should make Hearthrise compelling for thousands of hours?" | 2026-11-21 | docs/design/balance-program/45-design-brief.md section 3 and Tyler's reset directive, 2026-11-21 |
| ID-9 | Tibia and Huntera inspire mechanics only. Never their names, sprites, maps, screens or text. | Technical constraint | "Tibia and Huntera inspire mechanics only, never names, sprites, maps, UI or text." | 2026-10-14 | CLAUDE.md section 10 |
| ID-10 | The creative standards: handcrafted, no filler names, every system passes the purpose test, every item has a source and a use. | Core vision | "More systems is not a better game." and "Do not mistake adding features for improving gameplay." | 2026-10-14, 2026-11-21 | CLAUDE.md section 10 and Tyler's reset directive, 2026-11-21 |
| CO-1 | One combat engine runs every hunt, viewed or not, and is the same online and offline. | Technical constraint | "Test complete gameplay scenarios, using a shared authoritative mathematical model." | 2026-11-21 | Tyler's reset directive, 2026-11-21 |
| WO-10 | Klappa's Klub stays in the game under that name. | Content decision | "it CANNOT be removed from the game" | 2026-11-18 | tests/catalogue-coherence.mjs |
| EC-4 | The server budget for each account for each month. | Technical constraint | No quote. See the source. | 2026-11-21 | book 00 section 3.1 |
| MO-1 | How the game earns: Premium, and Crowns bought with money and sold to other players for gold. No Level, ground, drop or tier is gated behind paying. Paying gives a real edge that does not break the game. | Technical constraint | "paying can put a hero way ahead, it depends on what is on the player market" | 2026-11-21 | docs/design/overhaul/00-the-game.md section 3.1 |
| PL-4 | Whatever the engine decides is sized in a simulation on the real engine, and the tool is calibrated against real hunts. | Technical constraint | "i dont understand why we have to wait on play testing when we can control the true simulation by doing it correctly" and "Use sensitivity analysis and representative simulations to evaluate those interactions." | 2026-11-21 | docs/design/overhaul/00-the-game.md section 3.1 and Tyler's reset directive, 2026-11-21 |
| PL-7 | The safety lines: secrets, no fabricated player state, Security review before Early Access, one path for production writes and no spend without approval. | Technical constraint | No quote. See the source. | 2026-08-10 | CLAUDE.md section 2 |
| TX-1 | The look and the voice: one top-down pixel style, Charcoal and Gold screens, plain American English, standard genre words for labels. | Core vision | "recognisable from a screenshot without its logo" | 2026-10-14 | CLAUDE.md section 10 |

### 2.3 What loses authority

Everything else in section 5, all 159 rows in section 6, and every band in section 7 except the two server budget bands. They stay on record as history and as evidence. The ones most likely to be mistaken for requirements are these.

- **His typed rulings of the morning of 2026-11-21.** Four heroes from the start (HE-2), no solo or group targets (HE-3), on-call heroes (HE-8), Talents (LP-8), and the MMO layer with its rewards (SO-1). They are recent and in his own words. They were also made inside the frame the reset throws out, each as a fix to the old design. They are the first inputs to the party, progression and social packages, and each needs a fresh yes there.
- **The ten answers of the sitting and the six of the second sitting.** They were informed answers, which is why the book marks them RULED. They answered questions the old frame asked: what to do about the hours a death costs, whether clans pay XP, whether setups are priced.
- **Every number.** The Level table, the death cost, the danger bands, the 15% for best gear, every typed price.
- **Every list of content.** The skills, the weapon ways, the spells, the seven tiers, the crafting trades, the Tower, the Catacombs, factions, housing rungs.
- **Fixed stats for each item (IT-1).** Superseded by R-12. It still binds in six places listed in the Items table.

## 3. The most constraining assumptions, ranked

Ranked by how much of the design each one fixes before any design work starts.

**1. The ledger of rulings is the frame.** Chapter 00 section 3 is titled "Every ruling" and lists 266 lines. Its status rule says a row is DECIDED when "evidence and rulings support it". Every row has a `replaces` field, so each change must be argued against an old ruling. A change that bends one goes on a reversal list of 31 rows for his veto. The effect is that the old game is the default and any departure carries the burden of proof. This is the mistake the reset names, and it is structural: it is in the row format.

**2. The Level table of hunted hours (LP-1).** One table from 2026-10-25, whose own text called it a goal to validate. It is held by `tests/level-curve.mjs`, by `LEVEL_PACE` in `src/data/core-model.js` and by bands P1, P2, P11, P12 and P13. The kill reward follows it (GR-5). Prices are hours on a wage curve read from it (GR-51). The death cost and the Blessing ladder are counted in its hours (GR-7, D-4). Content runway is its days (R1, R2). Four of the listed reversals are arguments about its second decimal. With it fixed, progression has one free variable left.

**3. The damage and defense formulas as built (CO-3).** Sixteen combat rows adjust this family and none compares another. The formula work was told to preserve approved design (FR-9), so it cleaned the math and moved no number (GR-85, built as lane FB-2). The reset asks for model families to be compared before coefficients are touched.

**4. An account of four heroes, from the first day, in a party of four (HE-1, HE-2, HE-5).** The first sentence of the book is "You run four heroes from your first day". The first hour, the start kit, every account price, the server cost and the pace seat are built on it. The engine fixes the party side in 93 places, and three MMO rows were shaped to keep every fight one party of four. Tyler asked on 2026-11-21 what the best party model is. A study answered inside the present engine and the answer became the frame within the hour.

**5. No solo or group targets (HE-3).** Six bands were dropped and the release gate was changed to match. The reset asks what makes solo play worthwhile and asks for targets across solo and party play. This is a direct conflict and the reset is newer.

**6. The skill list, the weapon ways and the spell set (CO-4, CO-7, CO-8).** Thirteen skills, seven ways to fight and the spell list were carried forward whole. GR-64 rules that there is no new skill. The reset says none of them is assumed to survive.

**7. Fixed stats, seven tiers and a flat percent curve (IT-1, IT-2, IT-3, LP-5).** A piece is one fixed row. A tier is a step. Best gear is worth 15%. A band past tier 7 is +17%. R-12 now says flat percent upgrades are dull and randomization is welcome where it adds decisions. The gear curve (GR-4), the gear states of the matrix and the drop cadence (IT-4) all assume one number a piece.

**8. Three tiers as percent dials, death counts, and a 6% death (TD-1, TD-3, TD-4).** The risk design is a three-step dial with a target number of deaths. The 6% is written into CLAUDE.md section 6 as a persistence invariant. The critical review found that nobody had counted the hours a death costs a party that is away.

**9. Standards before design (PL-3).** 113 bands were written before the design they grade. 55 of them are the designer's own proposals, sitting in the same table as the ruled ones. GR-88 makes the matrix the gate for every balance change. The reset puts targets third.

**10. Nothing planned is cut (PL-6).** Eight features are "kept hidden for later" and chapter 14 plans eighteen later lanes. The rule protected the old scope from the one question the reset insists on: does this earn its place?

**11. The agent decides, with no approval wait (PL-1).** 159 rows were decided by an agent in a day, and ten designer rulings were consumed by build lanes. CLAUDE.md sections 3.1 and 10 still say this. Requirement R-8 says the opposite.

**12. The stamina bar and the 12 hour day (LP-10, LP-2).** The session limit, the thing Premium sells, and the unit behind every day count. Nobody has asked whether a cap on hunting hours is the right limit for an idle game.

## 4. Where a recommendation became a fact

Each of these is a place where something reads as settled only because a document or a file says so.

1. **43 calls were printed as RULED after picks of about a second each.** The book found this itself (chapter 00 section 6.1 row 42) and changed the word to "said yes on the page". The rows still feed build lanes.
2. **The 23 listed reversals were let stand in 25 seconds.** The book then treats each as approved. Two of them were refused once he saw the cost at a sitting.
3. **The seventeen standards calls.** One short message kept the page picks. 21 bands carry that date and read RULED. On two of the seventeen he had first said he did not understand the question.
4. **The 63 balance calls of 2026-11-20** were answered in fourteen minutes, 47 as recommended. The book cites their ids (25-2, 27-1, 50-11 and so on) as "Tyler's rulings".
5. **The four domain dives** were approved with one sentence of general agreement. That turned about forty recommended options into rulings.
6. **55 PROPOSED bands** sit in the same table as the RULED ones and print red or green the same way.
7. **22 statements in the chapters read "DECIDED (no call id)".** A chapter recommended them and no call was ever raised.
8. **COMPUTED numbers written as facts.** Krell on day 31, Level 400 on day 373, bands at Levels 110, 129, 151 and on. Each is arithmetic on a table that is itself a hypothesis. 48 rows rest on arithmetic of this kind.
9. **MEASURED rows on a tool with known faults.** The critical review and the framework audit found faults in the death rule, the store bill and the seats. 24 rows cite a measurement, and `assumptions.json` carries each one's run text. Any run from before the tool was fixed should be re-read.
10. **Ten designer rulings (D-1 to D-11)** are marked "RULED by the designer" and were taken by lanes FB-5 to FB-14 as inputs.
11. **Tuning written into CLAUDE.md.** Section 6 states the 6% death and the 25, 50 and 75% Blessings among the persistence invariants.
12. **Hedged remarks printed as rulings.** The daily Krell kill, the move of belts to the Crafting bench (GR-43, DECIDED), tank spells for parties only. Each began with a maybe or an "I think" on the record.
13. **A sample of two.** The early Level targets (LP-4) cite two real players who quit. The guard header says so. It is a lead, held as a red line.
14. **A re-open refused by citing the ruling.** GR-81 keeps "no hunt starts by itself" because the ruling is clean, and calls its own cost a hypothesis.
15. **A study answered inside the old engine.** The party-model question (HE-5) was closed by MM-20 with the note that shared areas were "an option you asked about, not a ruling".
16. **Guards that outlive their ruling.** `tests/party-class-xp-line.mjs` still holds the rule that GR-3 removed. The build plan lists it as red by design.
17. **A document given authority whole.** The itemization plan is "a source of record" (IT-8). Its base, fixed stats, is now superseded.

## 5. The table, by system

110 standing decisions. The `Why` column is the one-line reason for the class and for the authority call.

### Frame and mission

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| FR-1 | 2026-08-10 | Multiplayer only, online only and server-authoritative. The client sends intents and draws the state the server returns. | Core vision | Yes. CLAUDE.md sections 1 and 6. guards no-client-xp-mint, client-intent-surface and session-core. every RPC and the hr-accrue engine | Historical preference | Yes | It makes the world shared and the economy unforgeable. The reset questions no part of it, and the design brief of the same day lists it as identity. |
| FR-2 | 2026-08-10 | No client-side solo progression tier. It was rejected three times. | Technical constraint | Yes. CLAUDE.md section 1 | Historical preference | Yes | It follows from FR-1. It is a rule about authority and offline play in the browser. It is not a ruling that solo play is second class, and it must not be read as one. |
| FR-3 | 2026-10-18 | Hunts keep running on the server after the browser closes. A session is needed only to start or change a hunt. | Core vision | Yes. CLAUDE.md sections 1, 4 and 6. the world tick and the settle. the both-paths test rule | Historical preference | Yes | This is the idle half of the game. The reset asks how to make automated hunting interesting, which takes it as given. |
| FR-4 | 2026-08-10 | The server owns anything tradeable, rankable or contributable, with clamps, a server clock and an append-only ledger. Row security is per user. | Technical constraint | Yes. CLAUDE.md sections 1, 2 and 6. every money surface. the Security review before Early Access | Historical preference | Yes | A genuine limit of a shared economy. It shapes how a system is built and never which system is chosen. |
| FR-5 | 2026-10-17 | No back-compat, no save migration, and a wipe at the Early Access launch. | Technical constraint | Yes. CLAUDE.md section 1 | Historical preference | Yes | It is what makes a ground-up redesign affordable. It removes a constraint and adds none. |
| FR-6 | 2026-10-14 | Steam and desktop first, built for mobile from one web core, with phones in landscape and windows as sheets. | Technical constraint | Yes. CLAUDE.md sections 1 and 7. tests/breakpoint-guard.mjs | Historical preference | Yes | A platform limit. It bounds screens and never systems. |
| FR-7 | 2026-08-10 | The north star: a large multiplayer semi-idle game with a shared live world, on clean code. | Core vision | Yes. CLAUDE.md section 1. book 00 section 1 | Historical preference | Yes | It is the one-line definition of the game and nothing in the reset moves it. |
| FR-8 | 2026-11-21 | Balance is fixed at the formula layer. One framework for each kind of mechanic, and no ground, weapon or monster gets math of its own. | Core vision | Yes. book 00 section 3.1. GR-85, GR-86 and GR-87. docs/design/balance-program/44-formula-architecture.md | Explicitly approved new design requirement | Yes | The reset says it again in its own words, so it is a current requirement. One part of the older brief does lose authority: its line that approved design is to be preserved. |
| FR-9 | 2026-11-21 | The formula audit was told to preserve approved design and flag conflicts to Tyler. | Existing implementation decision | Yes. docs/design/balance-program/41 to 44. GR-85 (steps that move no number). lane FB-2, built | Historical preference | No | This line is why the formula work cleaned the old math up and did not compare model families. The reset asks for the comparison. |

### Identity

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| ID-1 | 2026-11-21 | Automated hunting with meaningful character preparation. The decisions live in builds, gear, ground choice, bar rules, resources and plans. | Core vision | Yes. book 00 section 1. the conditional action engine | Explicitly approved new design requirement | Yes | Stated as identity on 2026-11-21 and taken as given by the reset. |
| ID-2 | 2026-10-14 | Character Levels never end. | Core vision | Yes. book 00 section 1. src/data/core-model.js. the grid to Level 400 | Explicitly approved new design requirement | Yes | Stated as identity and taken as given by the reset. The curve itself is LP-1 and keeps no authority. |
| ID-3 | 2026-10-14 | Distinct combat styles with no rigid vocations. | Core vision | Yes. book 00 section 3.3. src/data/hunt-roles.js. src/data/start-kit.js | Explicitly approved new design requirement | Yes | The reset asks what makes styles distinct, so styles stay. Which styles, weapons and skills exist is open (HE-4, CO-4, CO-7). |
| ID-4 | 2026-10-14 | A deep gear chase with rare finds. | Core vision | Yes. book 00 section 1. chapter 03 | Explicitly approved new design requirement | Yes | Taken as given by the reset. Tiers, rates and upgrade systems are open (IT-2 to IT-10). |
| ID-5 | 2026-11-21 | Solo play is worthwhile and party play is compelling. | Core vision | Yes. book 00 section 3.2, which reads the opposite way: no solo or group targets | Explicitly approved new design requirement | Yes | The reset asks both questions as equals. The overhaul treats a lone hero as the slower choice and drops every party-size target (HE-3). The two cannot both stand, and the reset is newer. |
| ID-6 | 2026-10-14 | A persistent economy driven by players. | Core vision | Yes. chapter 04. the market and trade surfaces | Explicitly approved new design requirement | Yes | Taken as given by the reset. Sinks, prices and the market shape are open. |
| ID-7 | 2026-11-21 | Crafting, housing, collections and long-term goals are part of the game. | Unresolved preference | Yes. chapters 03 and 07. tests/catalogue-coherence.mjs. 13 skills in src/data/core-model.js | Historical preference | No | The brief lists them as identity. The reset, later the same day, lists crafting professions, housing and the Bestiary among systems that must earn their place. Long-term goals stay. The named systems are open. |
| ID-8 | 2026-11-21 | The game stays meaningful over thousands of hours. | Core vision | Yes. book 00 section 1. the Level table to Level 400 | Explicitly approved new design requirement | Yes | Stated as identity and repeated by the reset. |
| ID-9 | 2026-10-14 | Tibia and Huntera inspire mechanics only. Never their names, sprites, maps, screens or text. | Technical constraint | Yes. CLAUDE.md section 10 | Historical preference | Yes | A legal limit. It applies to any design. |
| ID-10 | 2026-10-14 | The creative standards: handcrafted, no filler names, every system passes the purpose test, every item has a source and a use. | Core vision | Yes. CLAUDE.md sections 3.5 and 10. tests/catalogue-coherence.mjs | Historical preference | Yes | The purpose test is the same test the reset asks for. It is a standard for judging a design and it prescribes no system. |
| ID-11 | 2026-10-25 | Progress is deliberately slow and old-school, with frequent smaller rewards on the way. | Unresolved preference | Yes. the Level table (LP-1). bands P1, P2 and P11 | Historical preference | No | A feel he chose for the old game. It may well survive, but it is a preference to confirm, and the table built on it is a hypothesis. |

### Heroes, accounts and parties

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| HE-1 | 2026-10-17 | One account for each player, with up to four heroes playing at once in separate character sessions. | Existing implementation decision | Yes. CLAUDE.md section 6. src/session/character-session.js. the server cost model. every chapter of the book | Historical preference | No | The number four came from the old client rebuild. It now sets the unit of play for every system, and nobody has compared it with one hero or with another party model on equal terms. |
| HE-2 | 2026-11-21 | All four heroes from the first day, with no slot prices. | Unresolved preference | Yes. book 00 section 1, first sentence. lane FB-5, built, with staged migrations 1036 to 1039. tests/hero-slot-buy.mjs and tests/start-kits.mjs. CE-4, CE-5, CE-10, GR-79 and GR-80 | Historical preference | No | His own decision on the day of the reset, made to end an argument about slot prices inside the old design. It is the largest single shape in the book. Confirm it inside the party package before anything else rests on it. |
| HE-3 | 2026-11-21 | The four together beat the same four split up. No balance targets for solo or group play. Party XP is paid by size alone. | Unresolved preference | Yes. six dropped bands (P6.2 to P7.4) in tools/balance-program/standards.mjs. GR-3, GR-88, CORE-2. book 00 section 3.2 | Historical preference | No | The reset asks for targets across solo play and party play, and asks what makes solo play worthwhile. That reverses this ruling in plain words. |
| HE-4 | 2026-10-16 | The role comes from the weapon in hand. Six starter weapon sets, any hero can switch, and tank is a job of a melee hero with a shield. | Existing implementation decision | Yes. src/data/start-kit.js. src/data/hunt-roles.js. src/data/style-gear.js. GR-24. tests/start-kits.mjs | Historical preference | No | The idea of styles without vocations is identity (ID-3). This is one way to build it. Others exist, and none was compared. |
| HE-5 | 2026-10-15 | Hunting is instanced, alone or as a party of four at most. Towns, chat and trade are the shared part. | Existing implementation decision | Yes. the engine, where heroes cannot stand on the enemy side in 93 places across 22 modules (the MM-41 check). MM-2, MM-20 and MM-48, each shaped so every fight stays one party of four | Evidence from implementation | No | Tyler asked on 2026-11-21 about shared areas for eight. The study answered inside the present engine and MM-20 chose a presence strip. A fresh architecture should weigh it on design value first and engine cost second. |
| HE-6 | 2026-10-22 | Party rules: Level XP split evenly, the party leaves together, own heroes join at once, loot split by gold value and a rotating roll for a Rare. | Existing implementation decision | Yes. book 00 sections 3.2 and 3.6. tests/party-flow.mjs. tests/hunt-core/xp-share.mjs | Historical preference | No | Rules written for the old party model. They follow whatever party design is chosen. |
| HE-7 | 2026-10-31 | Party XP is one table by size and by how many weapon ways the party holds. A lone hero gets a bonus. | Balance assumption | Yes. src/data/party-class-xp.js. tests/party-class-xp-line.mjs, which still holds the rule the overhaul itself dropped. docs/design/overhaul/13-build-plan.md gate row T-13 | Historical preference | No | A guard still fails on a target that GR-3 already removed. It shows how an old ruling outlives its own reversal in code. |
| HE-8 | 2026-11-21 | On-call heroes: another account may hire a hero for a window, on a separate hire stamina pool, for a small cut of XP. | Unresolved preference | Yes. CH11-1. chapter 11. lane FB-14. D-8 | Historical preference | No | His own typed design, written as a fix to the old party model. It belongs in the party package as one option. |
| HE-9 | 2026-10-22 | The home, Storage, gold purse and farm are shared by the account. The Bestiary is kept for each hero. | Existing implementation decision | Yes. tests/account-gold.mjs. tests/shared-farm.mjs. book 00 sections 3.8 and 3.9 | Historical preference | No | Consequences of the four-hero account. They move with HE-1. |

### Combat model

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| CO-1 | 2026-10-18 | One combat engine runs every hunt, viewed or not, and is the same online and offline. | Technical constraint | Yes. CLAUDE.md section 6. the edge engine. the balance tools, which run the same engine | Explicitly approved new design requirement | Yes | It keeps offline hunts honest and makes a simulation true. The reset asks for one shared authoritative model, which is this rule. |
| CO-2 | 2026-10-18 | The engine as built: src/core/combat-sim.js, a 10 second settle and 100 millisecond steps. | Existing implementation decision | Yes. CLAUDE.md section 6. the world-tick parity rule in section 3.3b. the server cost study | Evidence from implementation | No | A fact about today's code written into the rules file as an invariant. A new math model may keep it, but it should be a result and not a premise. |
| CO-3 | 2026-10-18 | The damage and defense family as built: a hit is skill plus gear, a swing rolls 1 to Power, mitigation stops at 60%, and the order is dodge, absorb, resist, ward. | Existing implementation decision | Yes. GR-11, GR-12, GR-13, GR-23, CORE-3 and CORE-4. GR-85 and GR-86. lane FB-2, built. tests/hunt-core/damage.mjs and to-hit-ratio.mjs | Evidence from implementation | No | Every combat row of the overhaul adjusts this family and none compares another. The reset forbids starting from current formulas and adjusting coefficients. |
| CO-4 | 2026-10-14 | Four uncapped combat skills (Melee, Ranged, Magic, Defense) plus Inner Flame, and gathering and crafting skills capped at 99. | Existing implementation decision | Yes. src/data/core-model.js. tests/core-curves.mjs. GR-22 and GR-64 (no new skill). book 00 section 3.3 | Historical preference | No | The skill list was copied forward. The reset names skills among the things that must earn their place. |
| CO-5 | 2026-10-15 | A basic attack takes 2.0 seconds for every hero and every monster. | Balance assumption | Yes. book 00 section 3.3. the engine | Historical preference | No | One fixed number that removes attack speed as a lever. The reset wants every lever looked at. |
| CO-6 | 2026-10-16 | Armor weights: heavy absorbs and adds health, medium dodges, light wards and adds mana. Mixed sets blend with no penalty. | Existing implementation decision | Yes. src/data/core-model.js. D-3. chapter 01 | Historical preference | No | A defense design made for the old math. It is one candidate for the new one. |
| CO-7 | 2026-10-16 | The weapon ways and their jobs: sword and shield tanks and levels slowly alone on purpose, axes bleed, the hammer crushes, bow, crossbow, wand, staff, and fists as the all-rounder. | Content decision | Yes. GR-14 to GR-21. tests/hunt-core/first-week-bands.mjs (seven ways). tests/hunt-core/fist-play.mjs | Historical preference | No | Content of the old game. Each way must earn its place. |
| CO-8 | 2026-10-23 | The spell and rune set: runes fuel spells only, nine rune families, sixteen Necrotic and Storm spells planned, and a list of ruled spell details. | Content decision | Yes. src/data/abilities.js (29 dated citations). GR-11, GR-15, GR-16 and GR-45. tests/hunt-core/necrotic-storm.mjs | Historical preference | No | The reset says not to assume existing spells survive. This is the largest block of content carried forward by ruling alone. |
| CO-9 | 2026-10-15 | How skills train: Magic on mana spent, Melee and Ranged on damage, Defense on blows taken. A blow never reads the hero's own Level. | Existing implementation decision | Yes. book 00 section 3.3. src/data/training.js | Historical preference | No | Training rules of the old skill set. They move with CO-4. |
| CO-10 | 2026-11-06 | No immunities, only percentages. No stagger. Weakness and resistance sit in monster data. | Existing implementation decision | Yes. GR-12, GR-14 and GR-18. src/data/elements.js | Historical preference | No | Reasonable rules, each made to fix one report. Monster mechanics are on the reset's review list. |
| CO-11 | 2026-10-16 | The bar as built: two rows of ten slots, up to three conditions a slot, slot order is priority, and the tank casts Challenge by itself. | Existing implementation decision | Yes. the conditional action engine. GR-80. D-2. book 00 section 3.7 | Historical preference | No | That preparation is the play is identity (ID-1). This layout is one build of it. |
| CO-12 | 2026-11-08 | Every formula is public in an in-game wiki. | Unresolved preference | Yes. book 00 section 3.3 | Historical preference | No | It fits the reset's wish for simple shared math, but he has not said it again. Confirm it in the math package. |

### Tiers, difficulty and death

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| TD-1 | 2026-11-05 | Three tiers for each ground: Normal, Dangerous and Deadly. A tier is a percent dial on XP and difficulty, never on gold, and it sets the pull. | Existing implementation decision | Yes. src/data/hunt-tiers.js. tests/hunt-core/hunt-tiers.mjs. CORE-1 and GR-27. bands P9, S6 and G-2 | Historical preference | No | The whole risk design hangs on this three-step dial. Hunting ground mechanics are on the review list. |
| TD-2 | 2026-11-13 | One difficulty for every group size, the same monsters for everyone, and no hunt shaped for profit by party size. | Unresolved preference | Yes. tests/party-pull-bound.mjs. src/data/hunt-tiers.js. book 00 section 3.2 | Historical preference | No | He said this many times and with force. It is still a rule of the old game, so it is a strong preference to confirm. |
| TD-3 | 2026-10-25 | The danger bands: Normal kills at most once in 1,000 hours, and Deadly kills a mid-geared party 50 to 100 times in 1,000 hours at every Level. | Balance assumption | Yes. bands S1 to S7. tests/balance-grade.mjs. tests/hunt-core/first-week-bands.mjs. GR-3 and CORE-1 | Historical preference | No | Targets set before the systems that produce them. The reset calls these hypotheses. |
| TD-4 | 2026-11-09 | A death costs 6% of all Level XP and 6% of combat skill progress, can take a Level, and Blessings cut it by 25, 50 and 75%. A ladder of more Blessings opens at high Levels. | Balance assumption | Yes. CLAUDE.md section 6, as a persistence invariant. DEATH_COST and BLESSING_LADDER in standards.mjs. bands S10 and S11. tests/mode-death.mjs. GR-7 and D-4 | Historical preference | No | A tuning number written into the rules file. The critical review found nobody had counted the hours a death costs an idle party. |
| TD-5 | 2026-11-04 | Nothing refuses a Level. A ground's Level is a guide and a big risk shows a warning. | Unresolved preference | Yes. tests/hunt-floor-warning.mjs. book 00 section 3.3 | Historical preference | No | A clear player-freedom preference. Confirm it with the hunting package. |
| TD-6 | 2026-11-19 | Monster tuning calls: a little more health and damage everywhere, area spells as the wall of the harder tiers, and boss fights with phases. | Balance assumption | Yes. D-10. the staged harder-monsters migrations. book 00 section 3.3 | Historical preference | No | Single-lever fixes to the old numbers. The reset asks to stop solving problems with one variable. |
| TD-7 | 2026-10-18 | A death ends the hunt and sends the hero to town. No knockouts, no falls and no resume. | Existing implementation decision | Yes. CLAUDE.md section 6. tests/death-popup.mjs | Historical preference | No | A rule of the old death design, written into the rules file. It moves with TD-4. |

### Levels, pace and long progression

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| LP-1 | 2026-10-25 | The Level table of hunted hours is the law and XP is derived from it: Level 10 in 6 hours, 50 in 168, 100 in 600 and 400 in 4,580. | Balance assumption | Yes. src/data/core-model.js. tests/level-curve.mjs and tests/start-kit-pace.mjs. bands P1, P2, P11, P12 and P13. GR-5, GR-6, GR-6a, GR-6b and GR-6d. the wage curve of GR-51. bands R1 and R2 | Historical preference | No | The most binding number in the book. Kill pay, gear steps, prices, death cost and content runway are all counted in its hours. Its own source called it a goal to validate. |
| LP-2 | 2026-11-21 | Every time number assumes a player hunts 12 hours a hero a day, measured in low, mid and best gear at 31 Levels up to 400. | Balance assumption | Yes. CLOCK, CHECKPOINTS and GRID in standards.mjs. tests/balance-guard.baseline.json. every day count in the book | Historical preference | No | A measuring convention chosen for the old plan. A new plan may keep it, but as a choice. |
| LP-3 | 2026-11-21 | The pace seat is a mid-geared four on Dangerous. | Balance assumption | Yes. PACE_TABLE in standards.mjs. band P1 | Historical preference | No | It ties the Level clock to the four-hero party. It falls with HE-2 and HE-3 if those change. |
| LP-4 | 2026-11-20 | Levels 1 to 50 are timed on a lone new hero, with Level 10 in 6 hours and no early Level over 2 hours. | Balance assumption | Yes. bands P11.early, P11.ten and P11.smooth. tests/start-kit-pace.mjs | Historical preference | No | Its stated evidence is two real players who quit. That is a lead and not a measurement. |
| LP-5 | 2026-11-21 | Best gear is about 15% faster and takes about 15% less damage than mid gear. | Balance assumption | Yes. bands P4 and S5.bis. GR-4, whose band step of +17% is derived from it | Historical preference | No | It caps how much gear can matter. That is the very thing the reset wants reopened for an exciting gear chase. |
| LP-6 | 2026-11-21 | Early Access holds 120 days of grounds and each region opens 30 days before the first parties arrive. | Balance assumption | Yes. bands R1 and R2. GR-6a and GR-6b | Historical preference | No | A content budget derived from LP-1 and LP-2. |
| LP-7 | 2026-11-14 | The training yard pays a flat rate, costs gold and no stamina, and training items are sold for gold. | Balance assumption | Yes. src/data/training.js. tests/combat-training.mjs. GR-53 and GR-54. the open question S-20 | Historical preference | No | The book still holds a question open only because he kept the flat rate three times in the old game. |
| LP-8 | 2026-11-21 | A build choice every five Levels, called Talents, designed and built with the first build. | Unresolved preference | Yes. TAL-1 and chapter 10. bands TL1 to TL4. tools/balance-program/talents.mjs | Historical preference | No | He asked for it himself that morning. It is a new system added before the core it sits on is redesigned, so it belongs in the progression package. |
| LP-9 | 2026-11-21 | Two visits a day is the free game, and heroes work in town for all 12 rested hours. | Balance assumption | Yes. CLOCK in standards.mjs. CH11-3 | Historical preference | No | Page picks on a list of seventeen. Both follow from the stamina bar (LP-10). |
| LP-10 | 2026-10-18 | Stamina drains one for one while hunting and refills one for one. The free bar is 8 hours and Premium is 12. Gold refills step up in price, six a day. | Existing implementation decision | Yes. src/data/stamina-refill.js. CLOCK in standards.mjs. GR-58. src/data/premium.js | Historical preference | No | The session limit of the whole game and the main thing Premium sells. Nobody has asked whether a limit on hunting hours is the right limit. |
| LP-11 | 2026-10-20 | The Bestiary's kill stages and its bonus, and the Luck bar with its ruled hours. | Balance assumption | Yes. tests/bestiary-ladder.mjs. GR-48. tools/balance-program/bestiary-hours.mjs | Historical preference | No | He queued a Bestiary deep dive himself on 2026-11-11. The reset lists the Bestiary for review. |

### World, grounds, bosses and modes

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| WO-1 | 2026-10-15 | The first regions as built: the Mill Cellar start, the Sewer from Level 5, and the grounds up to Krell's Hold at Level 88 to 110. | Content decision | Yes. src/data/hunt-grounds.js. GR-32 and GR-79. the C3 cell. guard cells keyed by ground name in tests/balance-guard.baseline.json | Evidence from implementation | No | Existing content. The first hour of the new game is already scripted around these rooms. |
| WO-2 | 2026-11-18 | A region is about 55 Levels, six grounds and two bosses, with the last boss in a keyed hall. | Content decision | Yes. GR-33. chapter 02 | Historical preference | No | An authoring shape. It should follow the progression curve and not precede it. |
| WO-3 | 2026-11-14 | The Burning Tower: its own mode, about half of hunting XP, six keys a hero a week, chest odds, and weapons with plus skill. | Content decision | Yes. src/data/tower.js and chests.js. tests/tower-chest.mjs and four more tower tests. GR-37 | Historical preference | No | A built feature with many ruled details. It must earn its place as endgame. |
| WO-4 | 2026-11-16 | The Catacombs: its own mode with wings, key families and checkpoints. | Content decision | Yes. src/data/catacomb-armor.js. tests/catacombs.mjs. GR-36 | Historical preference | No | Mostly unbuilt. It was kept by the rule that nothing planned is cut (PL-6). |
| WO-5 | 2026-11-14 | Boss rules: a paid boss call that can drop an item, and Krell as a daily kill. The overhaul folds both into keyed halls. | Content decision | Yes. src/data/boss-calls.js and boss-halls.js. GR-28, GR-29 and GR-30. D-9 | Historical preference | No | The daily Krell kill began as a remark with a maybe in it and is printed in the book as a ruling. |
| WO-6 | 2026-11-07 | An old ground can be hunted at the leader's Level, bought by the hour. | Content decision | Yes. GR-9 | Historical preference | No | One answer to keeping old grounds useful. Others were not compared. |
| WO-7 | 2026-10-20 | How a ground is put together: uneven spawn mixes, one rare carrier, routes through real space, and passive mining and woodcutting between pulls. | Existing implementation decision | Yes. src/data/hunt-grounds.js. the ground pack format | Evidence from implementation | No | Authoring rules of the current engine. |
| WO-8 | 2026-11-14 | Two factions, mostly cosmetic, with aligned grounds and one faction skill each. | Content decision | Yes. src/data/factions.js. tests/faction-ground-balance.mjs. GR-71. the open veto D3-2 | Historical preference | No | A social system added late to the old game. It is on the reset's list as a social system. |
| WO-9 | 2026-11-09 | The story and its names: Havora, the Barrow March, Lord Krell and the named characters. | Content decision | No | Historical preference | No | The reset is about systems and math. Story and names fit any system design and nothing asks to redo them, but they bind no system either. |
| WO-10 | 2026-11-18 | Klappa's Klub stays in the game under that name. | Content decision | Yes. tests/catalogue-coherence.mjs | Historical preference | Yes | An owner's personal requirement in unconditional words. It costs the design nothing. Its stats and place are free. |

### Items, gear and crafting

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| IT-1 | 2026-10-14 | Gear has fixed stats and gets better only through upgrades. | Existing implementation decision | Yes. book 00 section 3.6, line dated 2026-10-14. src/data/imbuements.js header. src/data/items.js and gear-tiers.js, where every piece is one fixed row. chapter 03 (no re-rolls for gold, and a reforge where nothing rolls). GR-4, GR-26 and GR-41. the gear states and bands P4, S5.bis and E1 in standards.mjs, which assume one number a piece | Historical preference | No | SUPERSEDED by Tyler on 2026-11-21 (requirement R-12). He is open to randomized gear where it adds decisions, and calls flat percent upgrades dull. Every place that still assumes one fixed row a piece is now an old assumption. Crafted jewelry already rolls (IT-7), so the code is not uniform on this. |
| IT-2 | 2026-10-14 | Seven material tiers worn from Levels 1, 15, 30, 45, 60, 75 and 88. Past tier 7, unique pieces on a gear curve with bands about 17% apart. | Balance assumption | Yes. src/data/gear-tiers.js. POWER_SOURCES in standards.mjs. tests/armor-line.mjs and weapon-line.mjs. GR-4 and D-3 | Historical preference | No | The reset says item tiers must earn their place. The overhaul kept all seven and fitted a curve through them. |
| IT-3 | 2026-10-25 | A major gear upgrade comes every 15 to 25 Levels and is worth 5 to 8%. An armor upgrade is worth 3 to 5% less damage. | Balance assumption | Yes. bands E1.levels, E1.weapon and E1.armor. the open veto D3-1 | Historical preference | No | This is the flat percent step that the 2026-11-21 gear requirement calls dull. |
| IT-4 | 2026-10-14 | Drop cadence: a Rare about once in 10 to 20 hunted hours and a Very Rare far less often. Generous drops to Krell, rare and strong after. One base drop chance for everyone. | Balance assumption | Yes. bands D1, D2 and D4. src/data/loot-bands.js. tests/hunt-core/drop-tables.mjs and tests/settle-drop-bounds.mjs. GR-42 and GR-87 | Historical preference | No | Rates chosen for fixed gear. Randomized gear changes what a drop is worth, so the cadence must be found again. |
| IT-5 | 2026-10-23 | No bound gear, so every piece trades. Gear is gated by hero Level only. No gear for reaching a Level. | Unresolved preference | Yes. chapter 03 standing rules for gear. MM-27 and MM-32. book 00 section 3.6 | Historical preference | No | It defines the economy and the paid edge. A strong preference to confirm in the economy package. |
| IT-6 | 2026-11-18 | The upgrade stack: Tempering, Hallmarks at typed fees, linings and curing slots. The sinks are priced above what a band earns on purpose. | Balance assumption | Yes. src/data/temper.js and gold-sinks.js. tests/temper-buy.mjs and temper-uniques.mjs. GR-8 and GR-39. bands E7 and E8. the open question S-19 | Historical preference | No | Three stacked upgrade systems that each add a percent. The reset asks which features add complexity without enough value. |
| IT-7 | 2026-11-18 | The crafting trades and who makes what: Smithing makes all jewelry, Crafting makes cloaks and belts, with Runecrafting, Cooking, Farming and the gathering skills. | Content decision | Yes. src/data/jewelry.js. tests/jewelry-rolls.mjs. GR-38 and GR-43 to GR-47. tests/catalogue-coherence.mjs | Historical preference | No | The reset names crafting professions for review. The overhaul refined each trade and questioned none. |
| IT-8 | 2026-11-21 | The itemization plan of 2026-11-18 is a source of record for every review and plan. | Existing implementation decision | Yes. book 00 section 3.1. later lanes FR-6, FR-8 and FR-9. docs/design/itemization-plan.md | Historical preference | No | A document was given authority as a whole. Its fixed-stat base is now superseded (IT-1). |
| IT-9 | 2026-11-20 | Luck: an account bar fed by salvage and Bestiary stages, bound to the account, with a tradable Lucky ring. | Balance assumption | Yes. GR-48. later lane FR-2. the Luck hours in standards.mjs (page call 9) | Historical preference | No | A long chase designed on top of the old drop tables. |
| IT-10 | 2026-11-14 | Past tier 7 the chase is unique pieces with one extra property, boss pieces to mix, and Tower weapons as major upgrades. | Content decision | Yes. tests/armor-line.mjs and weapon-line.mjs. GR-40, GR-41 and CE-1 | Historical preference | No | His wish here points the same way as the new gear requirement. The built form (one fixed property a piece) is the old answer. |
| IT-11 | 2026-10-14 | Loot rules for each item (keep, store, sell, use as supply), with salvage as a fourth line. | Existing implementation decision | Yes. tests/loot-dispatch.mjs. GR-46 | Historical preference | No | Handling rules. They follow the item design. |

### Supplies, the bar and the hunt loop

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| SU-1 | 2026-10-16 | Food restores health and drink restores mana. No potions, ever. | Content decision | Yes. src/data/supplies.js. GR-52 | Historical preference | No | A flavor rule of the old game. Consumables are on the review list. |
| SU-2 | 2026-10-21 | The player picks every supply on the bar. Own stock is used first, then the store sells per use, and the hunt ends when gold runs out. | Existing implementation decision | Yes. src/data/supply-basics.js (13 dated citations). GR-57 | Historical preference | No | The supply bill is the main cost of a hunt and so the main gold sink. It was never weighed against other cost models. |
| SU-3 | 2026-11-20 | No hunt ever starts by itself. The player picks what a hero does when a hunt ends. | Unresolved preference | Yes. GR-81, which refused a re-open by citing the ruling. CH11-3. D-11 | Historical preference | No | GR-81 is the clearest case of a design question closed by an old ruling alone. Its own evidence calls the cost a hypothesis. |
| SU-4 | 2026-10-19 | The hunt analyzer is basic for free players and full for Premium. | Existing implementation decision | Yes. src/data/premium.js. GR-66 | Historical preference | No | A Premium perk of the old game. |

### Economy and gold

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| EC-1 | 2026-11-13 | Profit is reported and never used to tune a hunt. | Unresolved preference | Yes. book 00 section 6.1 row 40 | Historical preference | No | The reset asks for hunting efficiency and loot generation to be designed. That needs profit as a target again. |
| EC-2 | 2026-11-04 | The list of gold sinks and their typed prices: the bench tax, priced setup slots, rename fees, Town Works, colored fuels and more. | Balance assumption | Yes. src/data/gold-sinks.js and shops.js. tests/setup-slots.mjs. GR-56a and GR-56b | Historical preference | No | A list grown one sink at a time. The reset asks what creates a sustainable economy as a whole. |
| EC-3 | 2026-11-20 | The market: listings at the Weighhouse with a fee and caps. The overhaul adds standing buy orders and opens it on day one. | Content decision | Yes. tests/market-v2.mjs and four more market tests. GR-50, GR-55 and GR-59b | Historical preference | No | A built system. Its shape should follow the item and gold design. |
| EC-4 | 2026-11-21 | The server budget for each account for each month. | Technical constraint | Yes. bands C2 and C4. GR-1 and CE-7 (town work in closed form). line G16 of tests/balance-guard.mjs | Historical preference | Yes | A real limit set by the owner's money. It bounds how systems run and is honest to keep. |

### Money: Crowns and Premium

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| MO-1 | 2026-11-18 | How the game earns: Premium, and Crowns bought with money and sold to other players for gold. No Level, ground, drop or tier is gated behind paying. Paying gives a real edge that does not break the game. | Technical constraint | Yes. chapter 04. MM-28 to MM-37. sinks sized above band gold (IT-6) | Historical preference | Yes | A business requirement and not a mechanic. He said it again on 2026-11-21. The systems that carry it are open. |
| MO-2 | 2026-11-14 | Store rules: Crowns are never earned in play, nothing bought with Crowns trades, and no XP boost, gear or Luck is sold. | Unresolved preference | Yes. MM-29, MM-29-XP and CE-3 | Historical preference | No | Sensible guard rails. They are details of MO-1 to confirm in the economy package. |
| MO-3 | 2026-10-17 | What Premium holds: a 12 hour stamina bar, the full analyzer, looks and a daily training item, once for the account. | Content decision | Yes. src/data/premium.js. PREM-1 | Historical preference | No | A list tied to stamina and the yard, both open. |

### Home and town

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| HT-1 | 2026-11-20 | The property ladder from Camp to Castle with typed prices, rooms, the curing Cellar and Storage chests. | Content decision | Yes. tests/house-window.mjs and three more house tests. GR-73 to GR-76 and CE-5 | Historical preference | No | Housing is on the reset's review list. |
| HT-2 | 2026-10-19 | Farming is in the game at Early Access, on a farm shared by the account. | Content decision | Yes. tests/shared-farm.mjs and four more farm tests. GR-74 and GR-77 | Historical preference | No | A built skill whose consumers are thin. It must earn its place. |
| HT-3 | 2026-10-22 | Heroes work in town whenever they rest, and town work moves on screen in real time. | Existing implementation decision | Yes. GR-1 and CE-7. CH11-3 | Historical preference | No | The overhaul re-read this ruling so the server budget could be met. The need is real and the ruling is not. |
| HT-4 | 2026-10-25 | The Hearthrise fire, the Town Works and the colored fuels. The overhaul joins them as one Great Hearth. | Content decision | Yes. CE-8 and GR-82. D-7 | Historical preference | No | Three small features merged. Whether the merged one is worth having was not asked. |
| HT-5 | 2026-10-14 | The screen model: windows float over a live world, and every panel is one component shown as a window or a sheet. | Existing implementation decision | Yes. CLAUDE.md sections 1 and 7. src/shell | Evidence from implementation | No | How the client is built. It limits no system design. |

### Social and the MMO layer

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| SO-1 | 2026-11-21 | The MMO layer is clans, world bosses, events and two PvP arenas, and it pays buffs and gear. | Unresolved preference | Yes. chapter 06. rows MM-1 to MM-48. lanes FB-12 and FB-13, with staged migrations 1040 to 1045. bands MM26.G | Historical preference | No | His own direction on the day of the reset, given as a reaction to one study. Forty-eight rows were then decided on it in hours. The reset lists party, social and endgame systems for a fresh look. |
| SO-2 | 2026-11-20 | Clans: one for each account, a founding fee, a castle of five buildings with labor, upkeep and votes, and a Library that pays Level XP. | Content decision | Yes. MM-8 and MM-9. CH11-2. tests/clan-economy-sinks.mjs | Historical preference | No | He reversed himself on clan XP within a day. That is a sign the question was never framed as a whole. |
| SO-3 | 2026-11-20 | Events never pay over +25% and never two at once. No dailies, no login calendar and no season pass. | Unresolved preference | Yes. MM-11 and GR-83. D-7 | Historical preference | No | A clear stance against chore systems. It fits the reset's tone. Confirm it. |
| SO-4 | 2026-11-21 | One Global chat, no Local tab and no live party finder. | Content decision | Yes. GR-69. lane FB-12, built in part | Historical preference | No | Small content calls that follow the party model. |
| SO-5 | 2026-08-18 | Later modes: idle capture the flag, Ironman and Hardcore. | Content decision | Yes. MM-46 | Historical preference | No | Backlog ideas kept by the no-cut rule (PL-6). |

### Process, platform and measurement

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| PL-1 | 2026-11-21 | The game designer agent is the final design authority. Design calls are not queued on Tyler, and there is no approval wait. | Existing implementation decision | Yes. CLAUDE.md sections 3.1 and 10. 159 rows in decisions/all.json decided by an agent. the designer rulings D-1 to D-11 | Historical preference | No | The reset says the opposite: a design is not final because an agent chose it, and he reviews the direction first. CLAUDE.md still reads the old way and an agent may not edit it. |
| PL-2 | 2026-11-21 | The book is the design of record, the build plan is approved and wave 1 is running. | Existing implementation decision | Yes. docs/design/overhaul/13-build-plan.md. lanes FB-2, FB-5 and FB-12 merged on set/v0.2.144. staged migrations 1036 to 1045 | Historical preference | No | The reset makes the book one candidate and stops gameplay work. Code already built from PROVISIONAL rows is the costliest kind of assumption. |
| PL-3 | 2026-11-21 | Standards first: 113 bands set before the design, with the matrix as the release gate for every balance change. | Balance assumption | Yes. tools/balance-program/standards.mjs. GR-88. tests/balance-guard.mjs. the gate table of chapter 13 | Historical preference | No | The reset puts targets third, after the game and its architecture. Bands written first turn the old game's shape into a pass mark. |
| PL-4 | 2026-11-21 | Whatever the engine decides is sized in a simulation on the real engine, and the tool is calibrated against real hunts. | Technical constraint | Yes. tools/balance-sim. tools/balance-program. tests/balance-calibration.mjs | Explicitly approved new design requirement | Yes | The reset asks for simulations on one authoritative model. One caution: today's engine holds the old formulas, so a fresh model needs its own harness before it can run there. |
| PL-5 | 2026-11-21 | Measure a global balance baseline of the game as built before any balance change. | Unresolved preference | Yes. the baseline/overhaul-start branch. the lever registry work | Historical preference | No | Given half an hour before the reset. The tools stay useful as evidence. The order does not: the reset says redesign before balancing. |
| PL-6 | 2026-11-21 | Nothing planned for later is cut. Any cut goes to Tyler on one list. | Unresolved preference | Yes. book 00 section 5.4, with eight features kept hidden for later. chapter 14 | Historical preference | No | The reset says a feature does not deserve to exist because it has code or documentation, and asks for ruthlessness about complexity. This rule protected most of the old scope. |
| PL-7 | 2026-08-10 | The safety lines: secrets, no fabricated player state, Security review before Early Access, one path for production writes and no spend without approval. | Technical constraint | Yes. CLAUDE.md section 2. tools/hooks | Historical preference | Yes | Not design. They hold for any game. |
| PL-8 | 2026-11-21 | One big release for the beta scope, on printed dates. | Unresolved preference | Yes. chapter 13. scope calls such as which lane ships dark if the date slips | Historical preference | No | Dates set for the old plan. The reset asks for a new roadmap. |

### Look and text

| Id | Date | The decision, in short | Class | Constraining now, and where | Label | Keeps authority | Why |
|---|---|---|---|---|---|---|---|
| TX-1 | 2026-10-15 | The look and the voice: one top-down pixel style, Charcoal and Gold screens, plain American English, standard genre words for labels. | Core vision | No | Historical preference | Yes | Part of what makes the game recognisable. The reset does not touch it and it limits no system. |

## 6. The existing overhaul, row by row

All 159 rows of `docs/design/overhaul/decisions/all.json`. None keeps authority. **Rests on** is the section 8 label, with the row's own evidence word beside it. **Old ruling** says whether the row carries an old ruling forward, reverses one, or names one. **Reads as fact** is Yes when the row is DECIDED with no measurement behind it, or is PROVISIONAL and already in a first-build lane.

By status: PROVISIONAL 93, DECIDED 51, RULED 10, PROPOSAL 2, SUPERSEDED 2, WITHDRAWN 1. By old ruling: none named 60, names an old ruling 45, carries an old ruling forward 39, reverses an old ruling 15.

Every row's decision is a designer judgment. The label says what the judgment leans on, and for a measured row the JSON holds the run.

**Foundation**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| C3 | Check C3 of chapter 08: does a start-kit four hold the Sewer on Normal at Level 5? | PROVISIONAL | Measured simulation result (MEASURED) | Balance assumption | none named | Yes | Yes |
| CORE-1 | The raised tier dials and the two pull numbers (chapter 01, still missing 1). | PROVISIONAL | Measured simulation result (MEASURED) | Balance assumption | carries an old ruling forward | Yes | Yes |
| CORE-2 | The party buffs, named (chapter 01, still missing 2). | PROVISIONAL | Measured simulation result (MEASURED) | Existing implementation decision | names an old ruling | No | No |
| CORE-3 | The total cap on "takes more" effects (chapter 01, still missing 3). | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | none named | No | No |
| CORE-4 | Whether MMO layer buffs count inside the 60% mitigation cap (chapter 01, still missing 16). | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | carries an old ruling forward | Yes | Yes |
| GR-1 | How the server reaches its budget. | PROVISIONAL | Designer judgment (none stated) | Existing implementation decision | carries an old ruling forward | Yes | Yes |
| GR-3 | What Deadly must ask for. | RULED | Historical preference (MEASURED) | Balance assumption | carries an old ruling forward | Yes | No |
| GR-27 | What the harder tiers bring. | PROVISIONAL | Measured simulation result (MEASURED) | Balance assumption | carries an old ruling forward | Yes | Yes |
| GR-85 | The formula clean-up steps that move no number, and a tier's dial applied once. | DECIDED | Designer judgment (COMPUTED) | Existing implementation decision | carries an old ruling forward | Yes | Yes |
| GR-86 | The later engine steps: one amount pipeline, one modifier table, every monster on the formula. | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Existing implementation decision | none named | Yes | Yes |
| GR-87 | Drops authored in hours, and one sale formula. | DECIDED | Designer judgment (COMPUTED) | Existing implementation decision | none named | No | Yes |
| GR-88 | The matrix diff as the release gate for every balance change. | PROVISIONAL | Evidence from implementation (EVIDENCE) | Existing implementation decision | carries an old ruling forward | No | No |

**Collisions**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| CE-1 | Collision: world boss and arena gear lines against the gear curve and the unique counts… | PROVISIONAL | Designer judgment (COMPUTED) | Content decision | none named | No | No |
| CE-2 | Collision: the +10% timed drop buff (MM-25) | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | names an old ruling | No | No |
| CE-3 | Collision: a drop chance boost in the Crowns store (MM-29) against the Luck ruling | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | none named | No | Yes |
| CE-4 | Collision: what first-week gold buys, now that slot prices are gone | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Balance assumption | names an old ruling | Yes | Yes |
| CE-5 | Collision: early prices for an account of four | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | names an old ruling | Yes | Yes |
| CE-6 | Collision found here: 14 plain Dawnsteel pieces "as Rares" in Krell's Hold (GR-29) against… | DECIDED | Designer judgment (COMPUTED) | Content decision | none named | No | Yes |
| CE-7 | Chapter 07 flag: closed-form town work against the 2026-10-22 ruling "town work updates in… | PROVISIONAL | Designer judgment (COMPUTED) | Existing implementation decision | names an old ruling | Yes | Yes |
| CE-8 | Chapter 07 flag: the Hearthrise fire and MM-11's dated +25% weekend are one reward under two… | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Content decision | names an old ruling | Yes | Yes |
| CE-9 | Chapter 07 flag: the Kitchen's 25% burn relief does not fit inside the ruled 15% Yield pool | DECIDED | Designer judgment (COMPUTED) | Balance assumption | carries an old ruling forward | No | Yes |
| CE-10 | Chapter 08 flag: the start kit is granted once per account, decided under GR-8 | PROVISIONAL | Designer judgment (COMPUTED) | Content decision | none named | Yes | Yes |

**The MMO layer**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| CH11-1 | On-call heroes: the guest seat. | PROVISIONAL | Designer judgment (none stated) | Content decision | none named | Yes | Yes |
| CH11-2 | The clan XP room: the Library. | PROVISIONAL | Designer judgment (none stated) | Content decision | carries an old ruling forward | No | No |

**The player's day**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| CH11-3 | The town day, and what a ground remembers of a Setup. | PROVISIONAL | Designer judgment (none stated) | Content decision | carries an old ruling forward | No | No |

**Long game**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| GR-4 | A gear curve as a game formula. | PROVISIONAL | Measured simulation result (MEASURED) | Balance assumption | reverses an old ruling | Yes | Yes |
| GR-5 | What a kill pays. | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | carries an old ruling forward | Yes | Yes |
| GR-6 | The Level table. | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | reverses an old ruling | Yes | Yes |
| GR-6a | Collision (a): is the table the clock of a plain four or a buffed four, and what happens to… | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | reverses an old ruling | Yes | Yes |
| GR-6b | Collision (b): Krell's day. | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | reverses an old ruling | Yes | Yes |
| GR-6d | Collision (d): the log-scale kinks in the Level law at Level 100 and Level 300. | DECIDED | Designer judgment (COMPUTED) | Balance assumption | names an old ruling | Yes | Yes |
| GR-7 | Death once Deadly bites. | RULED | Historical preference (COMPUTED) | Balance assumption | reverses an old ruling | Yes | No |
| GR-8 | Sinks that follow the gear, and the hole the slot prices left. | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | reverses an old ruling | No | No |
| GR-9 | An old ground at your Level. | PROVISIONAL | Evidence from implementation (EVIDENCE) | Content decision | carries an old ruling forward | No | No |
| MM-7 | Collision (c): a death in a world boss room. / A death in the boss room costs the normal death. | PROVISIONAL | Designer judgment (none stated) | Balance assumption | names an old ruling | Yes | Yes |

**Combat**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| GR-11 | The beginner's floor on spells. | DECIDED | Measured simulation result (MEASURED) | Balance assumption | carries an old ruling forward | Yes | No |
| GR-12 | Whether spells miss, crit and read weakness. | DECIDED | Measured simulation result (MEASURED) | Existing implementation decision | none named | No | No |
| GR-13 | Three shapes of roll. | DECIDED | Designer judgment (COMPUTED) | Existing implementation decision | none named | Yes | Yes |
| GR-14 | Weapon weakness. | DECIDED | Measured simulation result (MEASURED) | Content decision | carries an old ruling forward | No | No |
| GR-15 | Turning Cut and Rend. | DECIDED | Measured simulation result (MEASURED) | Content decision | carries an old ruling forward | No | No |
| GR-16 | Necrotic and Storm. | PROVISIONAL | Evidence from implementation (EVIDENCE) | Content decision | carries an old ruling forward | No | No |
| GR-17 | Fists. | PROVISIONAL | Measured simulation result (MEASURED) | Content decision | carries an old ruling forward | No | No |
| GR-18 | Quarry Blow breaks a monster's spell windup. | PROVISIONAL | Measured simulation result (MEASURED) | Content decision | reverses an old ruling | No | No |
| GR-19 | "Shooters first". | DECIDED | Measured simulation result (MEASURED) | Existing implementation decision | none named | No | No |
| GR-20 | A status opens a monster to one kind of damage. | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Unresolved preference | none named | No | No |
| GR-21 | The crossbow. | DECIDED | Measured simulation result (MEASURED) | Content decision | carries an old ruling forward | No | No |
| GR-22 | Magic on a weapon hero. | DECIDED | Measured simulation result (MEASURED) | Balance assumption | none named | No | No |
| GR-23 | Skill at high Level, and endless ladders. | PROVISIONAL | Designer judgment (COMPUTED) | Existing implementation decision | carries an old ruling forward | No | No |
| GR-24 | The starting weapon. / The player picks starting weapons at creation (shared with combat, my… | PROVISIONAL | Designer judgment (none stated) | Content decision | names an old ruling | Yes | Yes |
| GR-25 | Special rules with no ruling on record. | RULED | Historical preference (EVIDENCE) | Existing implementation decision | none named | Yes | No |
| GR-26 | Plus skill on chest weapons. | DECIDED | Designer judgment (COMPUTED) | Balance assumption | carries an old ruling forward | No | Yes |

**World**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| GR-28 | One boss door | PROVISIONAL | Evidence from implementation (EVIDENCE) | Content decision | names an old ruling | No | No |
| GR-29 | What a hall's prize holds | DECIDED | Measured simulation result (MEASURED) | Content decision | carries an old ruling forward | No | No |
| GR-30 | The hall boss | PROVISIONAL | Measured simulation result (MEASURED) | Balance assumption | none named | Yes | Yes |
| GR-31 | Every ground asks one question | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Content decision | none named | No | No |
| GR-32 | Thin bands and uneven pairs | DECIDED | Designer judgment (COMPUTED) | Balance assumption | none named | No | Yes |
| GR-33 | The shape of a region | PROVISIONAL | Designer judgment (COMPUTED) | Content decision | carries an old ruling forward | No | No |
| GR-34 | Dead rows | PROPOSAL | Evidence from implementation (COUNTED) | Content decision | names an old ruling | No | No |
| GR-35 | The named rare of a ground | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | names an old ruling | No | Yes |
| GR-36 | The Catacombs | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Content decision | carries an old ruling forward | No | No |
| GR-37 | The Tower's beat | PROVISIONAL | Evidence from implementation (EVIDENCE) | Content decision | names an old ruling | No | No |

**Items and crafting**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| GR-38 | Jewelry and cloaks past Level 30 | PROVISIONAL | Measured simulation result (MEASURED) | Content decision | none named | No | No |
| GR-39 | Perk sizes | PROVISIONAL | Measured simulation result (MEASURED) | Balance assumption | names an old ruling | No | No |
| GR-40 | Build pieces before Krell | PROVISIONAL | Designer judgment (COMPUTED) | Content decision | carries an old ruling forward | No | No |
| GR-41 | What a unique's property may be | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | carries an old ruling forward | No | Yes |
| GR-42 | Rare rows for each ground | DECIDED | Designer judgment (COMPUTED) | Balance assumption | carries an old ruling forward | No | Yes |
| GR-43 | The Crafting bench | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | carries an old ruling forward | No | Yes |
| GR-44 | Six crafted slots past tier 7 | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | none named | No | Yes |
| GR-45 | Runecrafting 61 to 99 | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | carries an old ruling forward | No | Yes |
| GR-46 | Salvage and the Shop | DECIDED | Measured simulation result (MEASURED) | Content decision | carries an old ruling forward | No | No |
| GR-47 | Curing and the Cellar | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | names an old ruling | No | Yes |
| GR-48 | Luck's feeds, the find list, the saved kit | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | names an old ruling | Yes | Yes |
| GR-49 | Chest reforging | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | none named | No | Yes |

**Economy**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| GR-50 | The market | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Content decision | none named | No | No |
| GR-51 | Prices | PROVISIONAL | Designer judgment (COMPUTED) | Existing implementation decision | carries an old ruling forward | Yes | Yes |
| GR-52 | The store's healing | DECIDED | Measured simulation result (MEASURED) | Balance assumption | none named | No | No |
| GR-53 | The House dummy | DECIDED | Designer judgment (COMPUTED) | Balance assumption | carries an old ruling forward | No | Yes |
| GR-54 | The yard's rate | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | names an old ruling | Yes | Yes |
| GR-55 | When the market opens | PROVISIONAL | Evidence from implementation (EVIDENCE) | Content decision | names an old ruling | Yes | Yes |
| GR-56a | The price on setup slots | RULED | Historical preference (EVIDENCE) | Balance assumption | carries an old ruling forward | Yes | No |
| GR-56b | The bench tax | DECIDED | Designer judgment (COMPUTED) | Balance assumption | carries an old ruling forward | No | Yes |
| GR-57 | Spending while you sleep | DECIDED | Measured simulation result (MEASURED) | Content decision | none named | No | No |
| GR-58 | The refill price | PROVISIONAL | Evidence from implementation (EVIDENCE) | Balance assumption | none named | Yes | Yes |
| GR-59a | The gauge | DECIDED | Evidence from implementation (EVIDENCE) | Existing implementation decision | none named | No | Yes |
| GR-59b | One laundering route | DECIDED | Evidence from implementation (EVIDENCE) | Existing implementation decision | none named | Yes | Yes |
| GR-60 | When Crowns come | DECIDED | Evidence from implementation (EVIDENCE) | Existing implementation decision | none named | No | Yes |

**Progression**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| GR-61 | A permanent build choice. | SUPERSEDED | Designer judgment (COMPUTED) | Content decision | reverses an old ruling | No | No |
| GR-62 | Honors. | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Content decision | none named | No | No |
| GR-63 | Dead ladders. | RULED | Historical preference (MEASURED) | Content decision | none named | No | No |
| GR-64 | No new skill, prestige or stat points. | DECIDED | Evidence from implementation (EVIDENCE) | Unresolved preference | none named | No | Yes |
| GR-65 | Inner Flame and death. | WITHDRAWN | Evidence from implementation (EVIDENCE) | Balance assumption | carries an old ruling forward | No | No |
| GR-66 | The risk reading. | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Content decision | none named | Yes | Yes |
| TAL-1 | Talents: a build choice every five Levels. | PROVISIONAL | Designer judgment (none stated) | Content decision | names an old ruling | Yes | Yes |

**The MMO layer and the player's day**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| GR-69 | Remove the Local chat tab and the live party finder, and strike the fifth seat. | RULED | Historical preference (EVIDENCE) | Content decision | reverses an old ruling | Yes | No |
| GR-70 | The town shows heroes at work whether or not their owner is online. | PROVISIONAL | Historical preference (RULED) | Content decision | names an old ruling | Yes | Yes |
| GR-71 | A faction side is chosen for each hero. | DECIDED | Designer judgment (none stated) | Content decision | carries an old ruling forward | No | Yes |
| GR-72 | A friend link at sign-up, with no reward. | DECIDED | Designer judgment (none stated) | Content decision | none named | Yes | Yes |
| GR-78 | Tamsin's task for a ground is taken when a hero enters it. | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | none named | Yes | Yes |
| GR-79 | One table, the Path, says when every system opens, and the first hour teaches four heroes. | PROVISIONAL | Measured simulation result (PLAYED) | Content decision | none named | Yes | Yes |
| GR-80 | One Start, one plan and one return card for an account's four heroes, and a job queue. | PROVISIONAL | Historical preference (RULED) | Content decision | names an old ruling | Yes | Yes |
| GR-81 | A hero may move to the next ground when it outgrows this one, if you chose that. | DECIDED | Evidence from implementation (EVIDENCE) | Unresolved preference | carries an old ruling forward | Yes | Yes |
| GR-82 | Town Works, the Hearthrise event and flame powders become one Great Hearth. | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Content decision | reverses an old ruling | Yes | Yes |
| GR-83 | No dailies. | DECIDED | Designer judgment (none stated) | Unresolved preference | none named | No | Yes |
| GR-84 | The Premium claim needs no press, setups are one idea, and a Week card. | PROVISIONAL | Historical preference (RULED) | Content decision | names an old ruling | Yes | Yes |
| MM-1 | Rule 0: every shared feature works while both players are asleep. | PROVISIONAL | Evidence from implementation (EVIDENCE) | Unresolved preference | none named | No | No |
| MM-2 | A world boss is one health pool the whole server shares, fought by each account in its own… | PROVISIONAL | Designer judgment (COMPUTED) | Content decision | carries an old ruling forward | Yes | Yes |
| MM-3 | A world boss stands for a window of about 72 hours and never at a set hour. | PROVISIONAL | Historical preference (Follows) | Content decision | none named | Yes | Yes |
| MM-4 | A world boss is sized by weekly active accounts, with a floor one account can fell. | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | none named | Yes | Yes |
| MM-5 | Your share of a world boss is counted against your own Level in a room scaled to your party. | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | none named | Yes | Yes |
| MM-6 | A world boss pays a chest by your own points: its own named gear line at your band, its own… | PROVISIONAL | Historical preference (RULED) | Content decision | names an old ruling | Yes | Yes |
| MM-8 | A clan is a shared work, a team and a room that pays members in buffs, held by giving that… | PROVISIONAL | Historical preference (RULED) | Content decision | names an old ruling | Yes | Yes |
| MM-9 | The castle is one project at a time on the town project engine. Each room carries one… | RULED | Historical preference (COMPUTED) | Content decision | reverses an old ruling | No | No |
| MM-10 | A weekly clan board. The top clans carry a small timed buff the next week. | PROVISIONAL | Historical preference (Consistent) | Content decision | none named | No | No |
| MM-11 | Events are a four-weekend rotation written a year ahead, with no dailies, login calendar or… | PROVISIONAL | Historical preference (RULED) | Content decision | names an old ruling | Yes | Yes |
| MM-12 | Arena opponents are saved setups and house teams, never live players. | PROVISIONAL | Historical preference (Follows) | Content decision | none named | No | No |
| MM-13 | Two arenas: an even arena that normalizes every stat, and an open arena that reads real gear… | PROVISIONAL | Historical preference (RULED) | Content decision | names an old ruling | No | No |
| MM-14 | Arena rewards by rating tier: a season buff and title in the even arena, and the arena's own… | PROVISIONAL | Historical preference (RULED) | Content decision | none named | No | No |
| MM-15 | Arena fights use tickets that bank, 5 a day up to 20. | PROVISIONAL | Speculative hypothesis (TARGET) | Balance assumption | none named | No | No |
| MM-16 | The server offers three opponents, being attacked costs nothing, and your defense is your… | PROVISIONAL | Designer judgment (none stated) | Content decision | none named | No | No |
| MM-17 | No PvP on the hunting grounds, ever. | DECIDED | Historical preference (Follows) | Unresolved preference | none named | No | Yes |
| MM-18 | No hero is hired, lent or put on call. A party is your own heroes. | SUPERSEDED | Designer judgment (COMPUTED) | Content decision | reverses an old ruling | No | No |
| MM-19 | Mixed Levels in one fight follow one visible two thirds line. | PROVISIONAL | Measured simulation result (MEASURED) | Balance assumption | reverses an old ruling | Yes | Yes |
| MM-20 | Other players on a hunting ground are seen through a presence strip and never fought beside. | PROVISIONAL | Designer judgment (COMPUTED) | Content decision | names an old ruling | Yes | Yes |
| MM-21 | Every boss, clan, event and arena is open to all. Premium banks arena tickets to 30 and does… | DECIDED | Designer judgment (none stated) | Content decision | none named | No | Yes |
| MM-22 | The gold that hero slots took goes to the castle and to boss and arena upgrade materials first. | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | none named | No | No |
| MM-23 | Approve the order of study 49 section 6.1 as the order for planning. | DECIDED | Designer judgment (none stated) | Existing implementation decision | names an old ruling | No | Yes |
| MM-24 | Every buff is a row in one modifier table, and every MMO layer piece sits on the gear curve… | PROVISIONAL | Historical preference (RULED) | Existing implementation decision | names an old ruling | No | No |
| MM-25 | The buff caps: damage +5% standing and +10% timed, damage taken 5% and 5% less, Level XP +5%… | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | names an old ruling | No | No |
| MM-26 | The power budget: a fully buffed, boss-geared four gains at most about 32% kill speed and… | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | names an old ruling | No | No |
| MM-27 | Boss and arena gear trades like all gear. | DECIDED | Historical preference (RULED) | Content decision | names an old ruling | No | Yes |
| MM-38 | The open arena matches by gear band, then rating, and thin bands borrow from the next band… | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Content decision | none named | No | No |
| MM-39 | The even arena is one ladder for everyone, with three opponents offered near your rating. | PROVISIONAL | Historical preference (Follows) | Content decision | none named | No | No |
| MM-40 | Each arena has its own tickets. | PROVISIONAL | Designer judgment (none stated) | Content decision | none named | No | No |
| MM-41 | Measure once whether the engine can run heroes on both sides of a fight, before either arena… | DECIDED | Designer judgment (none stated) | Technical constraint | none named | Yes | Yes |
| MM-42 | Events pay buffs and gear: a Level XP weekend, a ground weekend that features its named… | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Content decision | reverses an old ruling | No | No |
| MM-43 | For the playtest only, every account gets the same weekly allowance of test Crowns through… | DECIDED | Designer judgment (none stated) | Existing implementation decision | none named | No | Yes |
| MM-44 | A standing clan gift (was N6-1). | PROVISIONAL | Designer judgment (none stated) | Content decision | names an old ruling | No | No |
| MM-45 | Spending banked arena tickets (was N6-2). | PROVISIONAL | Designer judgment (none stated) | Content decision | names an old ruling | No | No |
| MM-46 | Capture the flag and the arenas (was N6-3). | PROVISIONAL | Historical preference (RULED) | Content decision | names an old ruling | No | No |
| MM-47 | Friends (was N6-4). | DECIDED | Designer judgment (none stated) | Content decision | names an old ruling | Yes | Yes |
| MM-48 | The clan's own shared hunt (was N6-5). | PROVISIONAL | Historical preference (RULED) | Content decision | reverses an old ruling | No | No |

**Home**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| GR-73 | The Trophy room | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | names an old ruling | No | Yes |
| GR-74 | The farm's gates | PROPOSAL | Designer judgment (COMPUTED) | Content decision | names an old ruling | No | No |
| GR-75 | Home looks and visiting | DECIDED | Evidence from implementation (EVIDENCE) | Content decision | names an old ruling | No | Yes |
| GR-76 | House room rungs | PROVISIONAL | Measured simulation result (MEASURED) | Content decision | carries an old ruling forward | No | No |
| GR-77 | Seeds from monsters | PROVISIONAL | Evidence from implementation (EVIDENCE) | Content decision | none named | No | No |

**Money calls**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| MM-28 | The paid advantage | RULED | Historical preference (EVIDENCE) | Unresolved preference | none named | No | No |
| MM-29 | What the store sells for Crowns | PROVISIONAL | Designer judgment (COMPUTED) | Content decision | names an old ruling | No | No |
| MM-30 | Bought boosts and earned buffs | PROVISIONAL | Designer judgment (COMPUTED) | Existing implementation decision | none named | No | No |
| MM-31 | The pace ceiling | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | names an old ruling | No | No |
| MM-32 | The gear ceiling | RULED | Historical preference (COMPUTED) | Unresolved preference | names an old ruling | No | No |
| MM-33 | The gold ceiling | PROVISIONAL | Designer judgment (COMPUTED) | Balance assumption | carries an old ruling forward | No | No |
| MM-34 | The path for players who do not pay | RULED | Historical preference (HYPOTHESIS) | Unresolved preference | none named | No | No |
| MM-35 | How Crowns trade | PROVISIONAL | Evidence from implementation (EVIDENCE) | Existing implementation decision | none named | No | No |
| MM-36 | The clamps | PROVISIONAL | Evidence from implementation (EVIDENCE) | Technical constraint | names an old ruling | No | No |
| MM-37 | Where paying gives no edge | PROVISIONAL | Designer judgment (COMPUTED) | Unresolved preference | none named | No | No |
| PREM-1 | What one Premium gives across four heroes | DECIDED | Designer judgment (COMPUTED) | Content decision | names an old ruling | Yes | Yes |
| PREM-2 | The price of Premium and of a Crown | PROVISIONAL | Speculative hypothesis (HYPOTHESIS) | Balance assumption | none named | No | No |

**Money**

| Row | The call | Status | Rests on | Class | Old ruling | In a first-build lane | Reads as fact |
|---|---|---|---|---|---|---|---|
| MM-29-XP | May a bought timed boost fill the Level XP cap? (the 11-04 avoid list against Crowns giving… | DECIDED | Designer judgment (COMPUTED) | Unresolved preference | names an old ruling | No | Yes |

## 7. The bands in standards.mjs

`tools/balance-program/standards.mjs` holds 113 bands. All are balance assumptions. All standing bands constrain through the matrix gate.

| Label in the file | Count | Label here | Bands |
|---|---|---|---|
| RULED, standing | 48 | Historical preference | P1, P2, P4, P8, P10, P11.early, P11.ten, P11.smooth, P13, S1.mid, S2.mid, S3.mid, S4.mid, S4.bis, S5.bis, S6.dangerous.mid, S6.deadly.mid, S7.mid, G-1, G-4, G-5, G-10, E1.levels, E1.weapon, E1.armor, E4, E5.toKrell, E5.after, D1, D2, D4, R1, R2, C3, C4.1k, C4.10k, A1, A2, A4, A7, T4, T5, B1, B2, B4, B6, B7, B9 |
| RULED, dropped by GR-67 | 6 | Historical preference | P6.2, P6.3, P6.4, P7.2, P7.3, P7.4 |
| PROPOSED | 55 | Designer judgment | TL1, TL2, TL3, TL4, P3, P5, P9.dangerous, P9.deadly, P12.to300, P12.to400, S1.low, S1.bis, S2.low, S2.bis, S3.bis, S5.low, S6.dangerous.low, S6.dangerous.bis, S6.deadly.low, S6.deadly.bis, S7.low, S11.blessed, S11.unblessed, S10, G-2.normal, G-2.dangerous, G-2.deadly, G-3, G-6, G-8, G-9, G-11, E2.toKrell, E2.after, E3, E6.toKrell, E6.after, E7, E8, R3, MM26.G, C4b.1k, C4b.10k, A3, A5, A6, T1, T2, T3, T6, T7, B3, B5, B8, C5 |
| COMPUTED | 4 | Designer judgment | C1.1k, C1.10k, C2.1k, C2.10k |

Two keep authority, C4.1k and C4.10k, because they are the server budget (EC-4). The six dropped bands deserve a second look for the opposite reason: the reset asks for solo and party targets again, so the question they asked is open, though their numbers are not.

The file also holds the seventeen page calls as `TYLER_CALLS`, the pace table, the death cost and the Blessing ladder, each labelled RULED. They are the same history.

## 8. Guards and code that fail if an old decision changes

These are not faults. Each guard did its job for the old game. They are listed because each one turns red when a redesign moves the thing it holds, and a red guard reads as a broken build. None should be loosened or deleted. When a package replaces a target, the guard is re-pinned or retired by the lane that builds it, with its proof, as CLAUDE.md section 2 requires.

| Guard | The old target it holds | Assumption | Ruling date |
|---|---|---|---|
| tests/level-curve.mjs | the Level table of hours | LP-1 | 2026-10-25 |
| tests/start-kit-pace.mjs | Level 10 in 6 hours and no early Level over 2 hours | LP-4 | 2026-11-20 |
| tests/hunt-core/first-week-bands.mjs | the first-week danger and pace targets for seven ways to fight | TD-3, CO-7 | 2026-10-25 |
| tests/party-class-xp-line.mjs | a party of one weapon way never beats its heroes alone | HE-7 | 2026-10-31 |
| tests/party-pull-bound.mjs | one pack on Normal for every party size | TD-2 | 2026-11-11 |
| tests/hunt-floor-warning.mjs | a Level floor is only a warning | TD-5 | 2026-11-04 |
| tests/balance-grade.mjs | the target sheet: Normal is safe, a four beats solo, each tier pays more | TD-3, HE-3 | 2026-11-07 |
| tests/balance-guard.mjs and its baseline | about twenty lines of the old plan, on cells keyed by today's grounds | PL-3, WO-1 | 2026-11-20 |
| tests/mode-death.mjs | what a death takes in a hunt and in a mode | TD-4 | 2026-11-14 |
| tests/core-curves.mjs | the Level, skill, health and mana curves, in JS and Postgres | CO-4, LP-1 | 2026-10-19 |
| tests/hunt-core/damage.mjs and to-hit-ratio.mjs | the damage and to-hit formulas as built | CO-3 | 2026-10-18 |
| tests/hero-slot-buy.mjs and tests/start-kits.mjs | four heroes from the start and the account start kit | HE-2 | 2026-11-21 |
| tests/setup-slots.mjs | three free setups, then priced | EC-2 | 2026-11-04 |
| tests/temper-buy.mjs and temper-uniques.mjs | the Tempering ladder and its small cap past tier 7 | IT-6 | 2026-11-15 |
| tests/armor-line.mjs and weapon-line.mjs | unique pieces spend a fixed line budget | IT-2, IT-10, IT-1 | 2026-11-16 |
| tests/jewelry-rolls.mjs | the crafted jewelry odds table | IT-7 | 2026-11-14 |
| tests/tower-chest.mjs | six chest opens a family a week and the chest odds | WO-3 | 2026-11-14 |
| tests/faction-ground-balance.mjs | grounds past Krell pay each faction evenly | WO-8 | 2026-11-14 |
| tests/bestiary-ladder.mjs | every monster has a kill ladder with tiny bonuses | LP-11 | 2026-10-20 |
| tests/combat-training.mjs | the yard and its fixed rate | LP-7 | 2026-11-14 |
| tests/catalogue-coherence.mjs | every item has a source and a use, every skill a consumer, and the Klub stays | ID-10, WO-10 | 2026-10-10 |
| tests/hunt-core/drop-tables.mjs and tests/settle-drop-bounds.mjs | the drop tables as built | IT-4 | 2026-10-20 |

Across the repository, 150 test files and 166 files under `src/core` and `src/data` cite a dated ruling in a comment. The comments are a good record of why the code is the way it is. They also make each table look ruled when most are the designer's numbers under a ruled direction.

Staged and not applied: migrations 1036 to 1045 from the first-build lanes (four starter slots, the start kit, the account coach, the social layer). They are built on rows this audit classes as unresolved.

## 9. CLAUDE.md, and what needs Tyler

| Section | The line | Assumption | Keeps authority | Note |
|---|---|---|---|---|
| 1 | Server-authoritative, online only, hunts run on the server, the server owns shared value, no back-compat | FR-1 to FR-5 | Yes | Core vision and real technical limits. |
| 1 | Grow content by adding data rows, not code | FR-8 | Yes | The same rule as shared mechanics. |
| 3.1 and 10 | The game designer is the final design authority, and there is no approval wait | PL-1 | No | Conflicts with requirement R-8. It needs Tyler's word to change, because an agent may not edit this file. |
| 3.5 | The designer rules keep, fix, merge or cut for each system, and Tyler approves cuts | PL-1, PL-6 | No | The package review of R-8 replaces it for the redesign. |
| 3.3b | Combat-engine changes are batched by the world-tick parity rule | CO-2 | No | A release rule for today's engine. It is not a design limit. |
| 6 | One combat engine runs every hunt, the same online and offline | CO-1 | Yes | A real technical requirement. |
| 6 | The engine file, the 10 second settle and the 100 millisecond steps | CO-2 | No | Facts about today's code written as invariants. |
| 6 | A death costs 6% of Level XP and of combat skill progress, with Blessings at 25, 50 and 75% | TD-4, TD-7 | No | A balance number inside the persistence rules. It is the clearest case of tuning written in as law. |
| 6 | One account for each player, with up to four character sessions | HE-1 | No | An implementation choice that now sets the unit of play. |
| 7 | Prototypes are frozen and the game is the source of truth | PL-2 | No | True for code. For design, the reset makes the game as built one input and not the truth. |
| 10 | Identity, the purpose test, no mass generation, evidence and not self-praise, challenge Tyler | ID-9, ID-10 | Yes | Standards for judging any design. They match the reset. |

**For Tyler, three items.**

1. **CLAUDE.md sections 3.1, 3.5 and 10 against requirement R-8.** The file still says the designer agent is the final design authority with no approval wait. Agents must follow the file and may not edit it. Until he changes those lines, the two instructions conflict.
2. **The first-build code on the set.** Lanes FB-2, FB-5 and part of FB-12 are merged on `set/v0.2.144` and migrations 1036 to 1045 are staged. They were built from PROVISIONAL rows. R-9 stops new gameplay work. It does not say what happens to this work. Nothing here proposes deleting it.
3. **His own rulings of the morning of 2026-11-21.** This audit classes them as unresolved preferences and not as requirements (section 2.3). If he means any of them as a fixed requirement of the new game, as he did for gear randomization, it should be said so it can join section 2.1.

## 10. What I did not check

- Rulings before 2026-10-14 were read only through CLAUDE.md and the notes that summarise them.
- The rulings of 2026-10-14 to 2026-11-17 were skimmed at one line each. Small screen and wording rulings (window sizes, button labels, title names) are left out as not constraining any system.
- The 266 ruling lines of chapter 00 section 3 were grouped, not listed one by one. Every group in section 5 names the book section its lines sit in.
- The class of each overhaul row was assigned from its call and decision text, by hand, in one pass. A second reader may move some rows between balance assumption and content decision.
- "Reads as fact" and "old ruling" are computed from each row's status, evidence word and `replaces` text. They are a screen, not a verdict.
- No simulation was run or re-run. Which measured rows predate the tool fixes was not established row by row.
- The chapters 01 to 14 were read through their decision rows, chapter 00 and the review files, not line by line.
- The counts of files citing a ruling are a text search for a dated citation and say nothing about how hard each file binds.
