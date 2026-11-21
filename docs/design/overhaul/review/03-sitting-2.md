# The second sitting: questions for Tyler

Written 2026-11-21 on `lane/d-build-plan`, with the build plan (`../13-build-plan.md`). Step 4 of the critical review. Revised the same day for the audit before wave 1 (`04-pre-wave-audit.md`). Docs only.

Each question is a place where the first build would bend one of your rulings, or where only you can choose. No option is recommended. Each says what it costs. Labels: MEASURED is a run on the real engine with its GitHub run id, COMPUTED is arithmetic on named inputs, ESTIMATED is arithmetic on measured inputs, JUDGMENT is an opinion, UNKNOWN means nobody knows. The same text is in `03-sitting-2.json` for the Rulings page: the questions to answer now under `questions`, the held ones under `held`.

| Id | Status |
|---|---|
| S-15 | Answer now |
| S-17 | Answer now |
| S-18 | Answer now |
| S-11 | HELD until the replay |
| S-12 | HELD until the replay |
| S-14 | HELD until the replay |
| S-13 | Withdrawn. The designer rules it and reports it (D-10 in the plan) |
| S-16 | Withdrawn. The designer rules it and reports it (D-11 in the plan). It stays on the reversal list as row 27, for your veto |

S-13 (party-wide damage) and S-16 (a standing job at the end of a rest plan) are design calls, so the designer rules both and reports them (audit A-2 and A-3).

## Answer now

### S-15. Five special rules never put to you

Your formula brief says a deliberate special rule needs your explicit yes. Five built rules were never put to you, and the book is written with all five kept. (1) Gentle first grounds: on a ground whose floor is Level 8 or under, monsters land 40% of blows and hit for 13.2% of a same-Level hero's health, rising to 70% and 22% at floor 16. It is the only Level threshold in monster stats. (2) The boss blow cap: a boss's largest blow is held to a third of the health of the hero his ground is written for. (3) Three training bases: Melee and Ranged train on damage dealt, Magic on mana spent, Defense on blows taken. (4) The roll rule: a swing rolls 1 to its max, a spell hit 50 to 100%, and a heal does not roll. (5) The tier flag: a ground or mode may leave a tier out, so the Mill Cellar is Normal only and a scaled hunt has no Deadly. Do you approve them?

- **A. Yes, as GR-25 reads.** Keep 1 to 3 as written and on record. Fold 4 into one roll rule with a spread number for each kind of amount, and 5 into one content flag, both with no change in play. Cost: nothing changes for a player. The formula steps lane does the two folds, and the guard that fails an unapproved special rule can go green.
- **B. Yes, no gentle grounds.** As a, but remove the gentle first grounds, so every ground follows one monster line from Level 1. Cost: the first hour gets harder. MEASURED on run 44920906999 and the balance pass's local probes: a four in the arrival kit already takes 2.2 times the mid kit's damage under Level 45. The start-kit four in the Sewer (check C3) must be measured again, and the first hour's safety is UNKNOWN until it is.
- **C. Not yet.** Build with all five as they stand and decide after the playtest. Cost: the guard that fails a special rule with no yes (GR-88) cannot be green, so the matrix diff cannot gate this build, and the formula steps lane leaves the two folds undone. JUDGMENT.

### S-17. Premium and test Crowns in the first playtest

On 2026-10-23 you ruled that every character is Premium during the closed beta, through one server switch. On 2026-11-21 you said yes to test Crowns for the wiped Discord playtest only, and the book says the Crowns model waits until test Crowns have run. With the switch on, every hero has the 12 hour bar and Crowns have little to buy. What does the first build's playtest run?

- **A. Premium for all.** The switch stays on, as ruled on 2026-10-23. Every hero hunts 12 hours on one visit. Test Crowns wait for a later playtest and nothing on money is built now. Cost: the free day of two visits (ruled 2026-11-21) is not played, Deadly's lost hours on the 8 hour bar are not measured, and the Crowns loop stays untested.
- **B. Free bars, test Crowns.** The switch is off. Each account gets the same weekly test Crowns, and can buy Premium for all four heroes with them or sell them to other players for gold on the Crown Exchange. It reads your grant as covering this build's playtest. Cost: one money lane in the last wave (the exchange and its eight clamps, since Premium for the account is built in any case, as ruled) and a new surface in the Security review before Early Access. It measures whether players with gold want Crowns, which the critical review calls the trade the money model rests on. UNKNOWN whether a handful of accounts can answer it (S-18). The amount granted is yours to name.
- **C. Free bars only.** The switch is off and no Crowns are built. Everyone plays the free 8 hour day with two visits. Cost: the free day is measured, but Premium cannot be had, so its 12 hour bar is not played and the Crowns loop waits for a later playtest.

### S-18. Who plays the first build

The build plan lists nine things the playtest must measure before any number is called decided: a real death rate by ground and tier, real gold, which fours players run, the first hour played by strangers, Talents, on call, the world boss, Crowns and server cost. It never says how many accounts play. The game is closed to a short list of accounts today, and who is let in is yours. COMPUTED from the plan's own tests: the Talents test asks for 20 heroes on each of six ways to fight, which is about 30 accounts. The Crowns test asks whether over a fifth of accounts buy Crowns with gold. On call asks for two clans. No option here assumes a wipe. That date is yours to name. Who plays the first build?

- **A. The players already in.** The first build is played by the accounts on the list today. Cost: nothing new to run and nobody new sees an unproven first hour. COMPUTED against the plan's tests: the Talents, Crowns and on-call tests cannot be read on a handful of accounts, and the death rate comes from a few fours. Most first-build numbers then stay PROVISIONAL into the next phase, and the test Crowns of S-17 would run without being able to answer their own question.
- **B. A wider invited group.** The first build opens to about 30 accounts or more, invited by you. Cost: the first hour with four heroes has only been played by one reviewer, so its first strangers are also its first impression, and someone has to invite people and watch what they do. ESTIMATED by the server cost study: the load is far inside the budget of 15 cents an account a month. The one Security review still gates only Early Access, as you ruled on 2026-10-25. UNKNOWN whether 30 accounts can be found.
- **C. The players in now, then wider.** The accounts on the list play first, to catch what breaks. The wider group is invited once the play gate and one blind first-hour pass are clean. Cost: the playtest runs in two steps, so the measured death rate, the real gold and the Talents and Crowns tests arrive later, and every number that waits on them stays PROVISIONAL for longer. JUDGMENT: it spends fewer first impressions on a broken first hour. UNKNOWN how long the first step takes.

## HELD until the replay

FB-1 fixed two engine stalls at 02364f03a, after every balance run these three lean on. They are answered after the matrix lane replays the runs on the fixed engine, with the new readings and run id carried into them. The text below is kept as it stood.

### S-11. Which four is the Level table's clock (HELD)

**HELD.** Until the matrix lane replays the full matrix, the death sample at 2.5 and the lineup cells on the engine fixed at 02364f03a (audit A-0). The readings in the options were taken before that fix and are re-issued with the new run id before this is answered.

You ruled the Level table as the clock of a four on the hardest tier it holds. At the sitting you ruled that Deadly is a tier you watch or gamble on, and that idle players mostly use Dangerous (S-6). The law is now fitted at your ruled points, so whichever four is the clock lands on your table: Level 100 at 600 hunted hours and Level 400 on day 382. MEASURED on run 44931089433: the four on Dangerous reads 1.263 times the pace contract and a four on Deadly that never dies reads 1.579. Which four is the clock?

- **A. The Dangerous four.** The table is timed on a mid-geared four on Dangerous, the tier an idle four keeps. That four lands on your table. COMPUTED on the ratio of the two readings, 1.579 over 1.263, which is 1.25: a four that farms Deadly safely is about 25% ahead, reaching Level 100 at about 480 hours and Level 400 on about day 305, so the next region must be ready sooner. Chapter 12 found that a single Level can sit some points off that ratio. Cost: the fastest safe four outruns the content plan.
- **B. The Deadly four.** The table is timed on a mid-geared four on Deadly that never dies. That four lands on your table. COMPUTED on the same ratio: the four on Dangerous, which most idle players will be, needs about 25% longer for every Level, reaching Level 100 at about 750 hours and Level 400 on about day 477. A watched four that dies on Deadly is behind the table too. Cost: almost nobody is on the clock, and the content runway is planned for a pace few players hold.
- **C. Dangerous now, look again.** Build a, then read the seat again from the playtest's real XP an hour for the fours players run, before Early Access. MEASURED on run 44920906999: the tool's four reads 1.26 times the kills of the one real four on the proposed game, so the real seat may differ. Cost: the same as a for now, and if the seat moves later every live hero's Level moves with it, told in the changelog as you ruled on 2026-11-09. JUDGMENT.

### S-12. What the ruled death count means (HELD)

**HELD.** Until the matrix lane replays the full matrix, the death sample at 2.5 and the lineup cells on the engine fixed at 02364f03a (audit A-0). The readings in the options were taken before that fix and are re-issued with the new run id before this is answered.

You ruled that a mid-geared four dies 10 to 30 times in 1,000 hours on Dangerous and 50 to 100 times on Deadly, at every Level. The engine gives a cliff: a four is safe or it wipes, and your count is the thin line between. The balance pass sized Deadly so a four meets that line when it arrives in a band and is safe by the band's top. What should the count mean?

- **A. The count on arrival.** The ruled counts describe a four that has just arrived in a band. Each ground becomes a ladder: Dangerous on arrival, Deadly once the four grows past the edge, then the next ground. MEASURED on runs 44925664434 and 44928035806, 4 seeds of 8 hours on 14 grounds: all Deadly cells together read 41 deaths in 1,000 hours and all Dangerous cells 4. Cost: for the upper part of each band Deadly is safe XP for a mid four, worth 20 to 29% over Dangerous (MEASURED, run 44920906999), and Dangerous rarely kills a mid four inside its band from about Level 10.
- **B. Dangerous hits harder.** Raise Dangerous's blows over Deadly's until its deaths read 10 to 30. MEASURED on run 44925664434: at 3.0 times Normal the pool read 29, seven band floors went over the red line, and on two grounds Dangerous killed more than Deadly (the Coppercap Warrens, 657 deaths in 1,000 hours against 138). Cost: the tiers turn upside down on grounds with shooters, because a back hero dies to the size of one blow and not to the pull.
- **C. A steady count.** Hold both counts at every Level, as written. COMPUTED by the balance pass: one table of blow and pull cannot do it on the measured cliff. It needs party-wide damage built into the tiers (S-13), then a new death sample. Cost: new engine work and one more sizing pass before the playtest. UNKNOWN whether the counts then hold.

### S-14. When one of your own four falls (HELD)

**HELD.** Until the matrix lane replays the full matrix, the death sample at 2.5 and the lineup cells on the engine fixed at 02364f03a (audit A-0). The readings in the options were taken before that fix and are re-issued with the new run id before this is answered.

On 2026-11-21 you set the default for an account's own heroes: when one falls, the rest hunt on. The balance pass measured that when the front hero fell, the other three died in the same hunt every time. Which default?

- **A. The rest hunt on.** Your ruling stands. MEASURED on runs 44925664434 and 44928035806: a front death became four deaths in every sampled wipe, so a wipe costs four death penalties, each 6% of that hero's Level XP before Blessings. The hunting time lost is the same either way. A player can still choose all come home as one plan line.
- **B. All come home.** For an account's own four the default is that all come home when one falls. MEASURED on the same runs: a front death cost one death in every sampled wipe. COMPUTED: the XP cost of Deadly falls by about three quarters. It reverses your 2026-11-21 amendment. A player can still choose the rest hunt on.
- **C. Home when the front falls.** The default reads the seat. If the hero in front falls, all come home. If a back hero falls, the rest hunt on. MEASURED on the same runs: the one other kind of death in the sample was the bow on Wyvern Roost, killed alone by shooters. Cost: a rule keyed on a seat, one more line to explain, and a special rule that the formula brief asks you to approve. JUDGMENT.

## Where each question comes from

| Question | Source |
|---|---|
| S-11, S-12, S-14 | `../12-balance-pass.md` section 7, items 1 to 3, open items 12-7-1 to 12-7-3 in `../00-the-game.md` section 5.5. Item 4 (12-7-4) needs no answer and is a note in the build plan. S-11 reads the seats on run 44931089433, after the law was fitted at the ruled points. All three are held by audit A-0 |
| S-15 | GR-25, open in `../00-the-game.md` section 5.5 |
| S-17 | The rulings of 2026-10-23 and 2026-11-21 (MM-43), against the measurements the playtest is meant to make. Option B gains its last two sentences from audit A-5. Premium for the account is built in any case (Part C M-08) |
| S-18 | Audit A-5, verbatim from `04-sitting-additions.json` |
| S-13, S-16 (withdrawn) | Audit A-2 and A-3 |
