# The second sitting: seven questions for Tyler

Written 2026-11-21 on `lane/d-build-plan`, with the build plan (`../13-build-plan.md`). Step 4 of the critical review. Docs only.

Each question is a place where the first build would bend one of your rulings, or where only you can choose. No option is recommended. Each says what it costs. Labels: MEASURED is a run on the real engine with its GitHub run id, COMPUTED is arithmetic on named inputs, JUDGMENT is an opinion, UNKNOWN means nobody knows. The same text is in `03-sitting-2.json` for the Rulings page.

## S-11. Which four is the Level table's clock

You ruled the Level table as the clock of a four on the hardest tier it holds. At the sitting you ruled that Deadly is a tier you watch or gamble on, and that idle players mostly use Dangerous (S-6). The balance pass timed the table on the four on Dangerous. Which four is the clock?

- **A. The Dangerous four.** The table is timed on a mid-geared four on Dangerous, the tier an idle four keeps. COMPUTED on the rates of run 44920906999: that four reaches Krell's Hold on day 33, Level 100 at 516 hunted hours and Level 400 on day 400. MEASURED on run 44928035806: Levels 100 to 300 land inside the table's band and Level 400 reads 11% slow. Cost: a four that farms Deadly safely runs 18% ahead of the table, reaching Krell on day 24 and Level 400 on day 326, so the next region must be ready sooner.
- **B. The Deadly four.** The table stays timed on a mid-geared four on Deadly that never dies, as the book had it. COMPUTED on the same rates: the four on Dangerous, which most idle players will be, runs 24% behind the table, reaching Krell on day 39 and Level 400 on day 472. A watched four that dies on Deadly is behind it too. Cost: almost nobody is on the clock, and the content runway is planned for a pace few players hold.
- **C. Dangerous now, look again.** Build a, then read the seat again from the playtest's real XP an hour for the fours players run, before Early Access. MEASURED on run 44920906999: the tool's four reads 1.26 times the kills of the one real four on the proposed game, so the real seat may differ. Cost: the same as a for now, and if the seat moves later every live hero's Level moves with it, told in the changelog as you ruled on 2026-11-09. JUDGMENT.

## S-12. What the ruled death count means

You ruled that a mid-geared four dies 10 to 30 times in 1,000 hours on Dangerous and 50 to 100 times on Deadly, at every Level. The engine gives a cliff: a four is safe or it wipes, and your count is the thin line between. The balance pass sized Deadly so a four meets that line when it arrives in a band and is safe by the band's top. What should the count mean?

- **A. The count on arrival.** The ruled counts describe a four that has just arrived in a band. Each ground becomes a ladder: Dangerous on arrival, Deadly once the four grows past the edge, then the next ground. MEASURED on runs 44925664434 and 44928035806, 4 seeds of 8 hours on 14 grounds: all Deadly cells together read 41 deaths in 1,000 hours and all Dangerous cells 4. Cost: for the upper part of each band Deadly is safe XP for a mid four, worth 20 to 29% over Dangerous (MEASURED, run 44920906999), and Dangerous rarely kills a mid four inside its band from about Level 10.
- **B. Dangerous hits harder.** Raise Dangerous's blows over Deadly's until its deaths read 10 to 30. MEASURED on run 44925664434: at 3.0 times Normal the pool read 29, seven band floors went over the red line, and on two grounds Dangerous killed more than Deadly (the Coppercap Warrens, 657 deaths in 1,000 hours against 138). Cost: the tiers turn upside down on grounds with shooters, because a back hero dies to the size of one blow and not to the pull.
- **C. A steady count.** Hold both counts at every Level, as written. COMPUTED by the balance pass: one table of blow and pull cannot do it on the measured cliff. It needs party-wide damage built into the tiers (S-13), then a new death sample. Cost: new engine work and one more sizing pass before the playtest. UNKNOWN whether the counts then hold.

## S-13. Party-wide damage as part of a tier

On 2026-11-08 you asked that more monsters mean more area damage, so the whole party takes some and resistance becomes the wall. Today a tier scales the blow and the pull, and the front hero takes 92 to 100% of a four's damage on nine of 14 grounds (MEASURED, run 44920906999). A tier row could send a share of each pull's damage to the whole party. It is a new mechanic. Is it in the first build?

- **A. In the first build.** One row on the tier table and one engine step, sized on a new death sample before the playtest. JUDGMENT from the balance pass: it softens the cliff, gives the back seats a reason to wear armor and take Footing or Grit, and lets a dial hold a death count. Cost: one more change in the second engine batch, a new death sample of 4 seeds of 8 hours on 14 grounds, and the tier numbers of S-12 sized again. UNKNOWN how far it moves the release.
- **B. Waits.** The first build ships the cliff. Party-wide damage is designed after the playtest gives real death rates. MEASURED on run 44920906999: group damage is 0 to 8% of what a four takes on nine grounds, so back-seat armor and the defensive Talent tracks do little there. Cost: nothing to build now. The playtest plays the cliff, and the defensive Talent tracks are judged on a fight that will change.
- **C. Built at zero.** The engine step and the tier row ship with the share set to zero, so nothing a player sees changes. The balance tool sizes it during the playtest, and turning it on later is one data row. Cost: engine work now with no visible change, and one more number to measure before it turns on. JUDGMENT.

## S-14. When one of your own four falls

On 2026-11-21 you set the default for an account's own heroes: when one falls, the rest hunt on. The balance pass measured that when the front hero fell, the other three died in the same hunt every time. Which default?

- **A. The rest hunt on.** Your ruling stands. MEASURED on runs 44925664434 and 44928035806: a front death became four deaths in every sampled wipe, so a wipe costs four death penalties, each 6% of that hero's Level XP before Blessings. The hunting time lost is the same either way. A player can still choose all come home as one plan line.
- **B. All come home.** For an account's own four the default is that all come home when one falls. MEASURED on the same runs: a front death cost one death in every sampled wipe. COMPUTED: the XP cost of Deadly falls by about three quarters. It reverses your 2026-11-21 amendment. A player can still choose the rest hunt on.
- **C. Home when the front falls.** The default reads the seat. If the hero in front falls, all come home. If a back hero falls, the rest hunt on. MEASURED on the same runs: the one other kind of death in the sample was the bow on Wyvern Roost, killed alone by shooters. Cost: a rule keyed on a seat, one more line to explain, and a special rule that the formula brief asks you to approve. JUDGMENT.

## S-15. Five special rules never put to you

Your formula brief says a deliberate special rule needs your explicit yes. Five built rules were never put to you, and the book is written with all five kept. (1) Gentle first grounds: on a ground whose floor is Level 8 or under, monsters land 40% of blows and hit for 13.2% of a same-Level hero's health, rising to 70% and 22% at floor 16. It is the only Level threshold in monster stats. (2) The boss blow cap: a boss's largest blow is held to a third of the health of the hero his ground is written for. (3) Three training bases: Melee and Ranged train on damage dealt, Magic on mana spent, Defense on blows taken. (4) The roll rule: a swing rolls 1 to its max, a spell hit 50 to 100%, and a heal does not roll. (5) The tier flag: a ground or mode may leave a tier out, so the Mill Cellar is Normal only and a scaled hunt has no Deadly. Do you approve them?

- **A. Yes, as GR-25 reads.** Keep 1 to 3 as written and on record. Fold 4 into one roll rule with a spread number for each kind of amount, and 5 into one content flag, both with no change in play. Cost: nothing changes for a player. The formula steps lane does the two folds, and the guard that fails an unapproved special rule can go green.
- **B. Yes, no gentle grounds.** As a, but remove the gentle first grounds, so every ground follows one monster line from Level 1. Cost: the first hour gets harder. MEASURED on run 44920906999 and the balance pass's local probes: a four in the arrival kit already takes 2.2 times the mid kit's damage under Level 45. The start-kit four in the Sewer (check C3) must be measured again, and the first hour's safety is UNKNOWN until it is.
- **C. Not yet.** Build with all five as they stand and decide after the playtest. Cost: the guard that fails a special rule with no yes (GR-88) cannot be green, so the matrix diff cannot gate this build, and the formula steps lane leaves the two folds undone. JUDGMENT.

## S-16. A standing job at the end of a rest plan

On 2026-11-20 you ruled that a rest plan ends in "wait in town" or "hunt again, once", and never loops. Chapter 11 makes a standing job, one job with no count such as Gather the best I can or Train, the usual ending, so a resting hero never stands idle. It was never put to you. Which ending?

- **A. A standing job.** The usual ending is one job with no count. It does not loop and starts no hunt. JUDGMENT: it is the only plain way a hero works all 12 rested hours, as you ruled on 2026-11-21. The default is Gather, which spends nothing. Cost: if a player sets Train, a hero spends gold while they sleep, at 100 gold times the skill level an hour (2026-11-20).
- **B. Wait in town.** Your 2026-11-20 ruling stands. A hero that finishes its queue waits in town. COMPUTED by the solver in chapter 11: a party hero's queued jobs fill 2.1 to 4.4 of its 12 rested hours, so most of the rest is idle unless the player queues long counts. Cost: idle heroes on the town screen and the return card, and your 12 rested hours ruling met only by long counts.
- **C. Standing job by choice.** Wait in town stays the default ending. A standing job is offered as an ending a player picks once, for all four if they like. Cost: a new company idles after its queue until the player finds the line. About the same to build as a.

## S-17. Premium and test Crowns in the first playtest

On 2026-10-23 you ruled that every character is Premium during the closed beta, through one server switch. On 2026-11-21 you said yes to test Crowns for the wiped Discord playtest only, and the book says the Crowns model waits until test Crowns have run. With the switch on, every hero has the 12 hour bar and Crowns have little to buy. What does the first build's playtest run?

- **A. Premium for all.** The switch stays on, as ruled on 2026-10-23. Every hero hunts 12 hours on one visit. Test Crowns wait for a later playtest and nothing on money is built now. Cost: the free day of two visits (ruled 2026-11-21) is not played, Deadly's lost hours on the 8 hour bar are not measured, and the Crowns loop stays untested.
- **B. Free bars, test Crowns.** The switch is off. Each account gets the same weekly test Crowns, and can buy Premium for all four heroes with them or sell them to other players for gold on the Crown Exchange. It reads your grant as covering this build's playtest. Cost: one money lane in the last wave (the exchange, its eight clamps, Premium for each account) and a new surface in the Security review before Early Access. It measures whether players with gold want Crowns, which the critical review calls the trade the money model rests on.
- **C. Free bars only.** The switch is off and no Crowns are built. Everyone plays the free 8 hour day with two visits. Cost: the free day is measured, but Premium cannot be had, so its 12 hour bar is not played and the Crowns loop waits for a later playtest.

## Where each question comes from

| Question | Source |
|---|---|
| S-11, S-12, S-14 | `../12-balance-pass.md` section 7, items 1 to 3. Item 4 needs no answer and is a note in the build plan |
| S-13 | `../12-balance-pass.md` section 4.1, point 3, and the ruling of 2026-11-08 |
| S-15 | GR-25, the one item still open in `../00-the-game.md` section 5.5 |
| S-16 | Reversal row 27 in `../00-the-game.md` section 5.3, and `../11-on-call-and-clan-xp.md` section 3.6 |
| S-17 | The rulings of 2026-10-23 and 2026-11-21 (MM-43), against the measurements the playtest is meant to make |
