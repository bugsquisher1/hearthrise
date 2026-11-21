# Chapter 08: the player's day and the first hours

Part of "Hearthrise: the game we are building", the combined design of record. Written 2026-11-21 on `lane/d-book-experience`. Design only. No game code, data or migration is touched.

**What this chapter covers.** The first hour of an account with four heroes. The company as one thing: one Start, one plan, one return card and a job queue. The hunt report. The away-and-return moment and the two-visit day. The Path, which is the one table that says when every system opens. Teaching and the coach. The chase by day, week and month with no dailies. What Premium's comfort means across four heroes. And every feature in this area with a verdict.

**Status words.** RULED is Tyler's decision, with its date or call id. DECIDED carries the call id and "Fable 2026-11-21": the game designer decided the call and an adversarial check corrected it, and its row is in `decisions/all.json`. DECIDED (reversal, Tyler may veto) changes one of Tyler's rulings, names it at the first tag, and stands unless he vetoes it. TYLER CONFIRMS is a money call or a grant with the one recommendation. CUT (Tyler approves) is a removal that waits for his yes. OPEN has no decision yet and names what decides it.

**Number words.** TARGET is a number the design aims at. COMPUTED is arithmetic from ruled rows. MEASURED and PLAYED are evidence about this proposed design or about the simulator, and each says which.

**Words used here.** The *company* is the account's four heroes. It is design vocabulary. The player-facing label follows the genre-words rule (11-14) and is DECIDED (no call id, Fable 2026-11-21) as "Heroes" for the account screen and "Party" for the group inside a hunt.

---

**The status words, re-issued 2026-11-21.** Tyler adopted the critical review (`review/00-critical-review.md`), and the book now uses three honest words. They replace the list above. **DECIDED** means evidence and rulings support it. Where Tyler also said yes on the page, the tag says so. **PROVISIONAL** means a reasonable plan that has not been tested, and the first tag in a chapter names what it waits on. **OPEN** means it waits on Tyler. **RULED** is kept only for what Tyler ruled knowing what it was: his typed words, his own executive decisions, and a pick where he wrote a note, and his answers at the sitting of 2026-11-21, where he saw every option's cost. A quick pick on the page is a real yes and reads "Tyler said yes on the page", never RULED. **PROPOSAL** marks a design made in the fold of 2026-11-21 that Tyler has not seen. CUT and KEPT record his picks on the cut list. The record is `decisions/all.json` and `00-the-game.md`.

## 1. The experience

**Minute 5.** You made one hero and picked how it fights. You are in the Mill Cellar and your hero is winning fights by itself. You opened one slot on its bar, read a rule written as a sentence and changed one number in it. You have not been asked to make a second hero yet, and nothing on the screen is locked in a way that confuses you. You know the next thing: Level 5.

**Hour 1.** You run four heroes. The first one outgrew the Cellar at about minute 17, and that moment handed you the other three. Each of them leveled in its own Cellar hunt while the first hunted wolves, and then all four went into the Sewer together with a shield in front and a healer behind. You pressed Start once for all of them. You saw a hunt report that told you how close the party came to dying and what each rule on a bar did. Before you closed the game you saw the plan your heroes will follow when their stamina runs out: fish, cook, mine and chop. You close the game knowing they keep hunting.

**Hour 20 (day 2).** You visit twice a day for two to four minutes. Each visit opens on one card for the whole account. It tells the night in three lines, lists at most three things that need a decision and offers one press that sends all four back to what they were doing. You built the Hearthside Homestead from what two heroes gathered on the first night. You have tried Dangerous once because the report said the last hunt was Safe, and the report after it said Close. Every Level so far has named the next thing that opens.

**Hour 2,000 (about day 167).** The visit is the same two to four minutes and the same card. What changed is what the card is about: a four deep in the regions past Krell's Hold, four builds, a find list, a world boss weekend on the calendar, an arena season ending and a Week card that compares this week with your last one. You have never done a daily quest, because the game has none. You have never repeated a decision you already made, because the game remembers all of them.

---

## 2. The design

### 2.1 The first hour with four heroes

**The shape, in one paragraph.** The account owns four hero slots from its first second (RULED 2026-11-21). The first hour introduces them in two beats, not all at once. Beat one is one hero, alone, for about 17 minutes, because one hero is the only way to teach the bar and the loop without a wall of four names and four bars. Beat two is the company: three more heroes created in one short flow, each sent through the Cellar in its own lone hunt on one Start while the first hero hunts next door, and then one party of four in the Sewer by about minute 36. Nothing blocks a player who already knows the game from creating all four at second zero. The Path only decides when the coach offers it.

**Why this order.** Three alternatives were weighed.

| Option | What it does | Why not |
|---|---|---|
| Create all four before the first hunt | One Level track and no catch-up | Four name screens before a single kill. Every teaching card is about one hero while three others act. It gives up "hunting two minutes after sign-in", which is the best thing the opening has (PLAYED, 46 and 27, on the one-hero opening this design keeps) |
| Add one hero at a time across the hour | Gentle | Four different Levels in one party, and the Sewer's monsters are Level 10 to 25. The weakest hero dies or a catch-up rule is needed, and a catch-up rule is special-case math |
| **One hero to Level 5, then three at once (this design)** | Two beats, each with a reason on screen | The three recruits repeat the Cellar. They do it by themselves, each in its own lone hunt begun by one Start, while the player does something new, so no decision is repeated. MEASURED by the adversarial check: three together in the Cellar earn 0.53 times what one earns alone, because the Cellar is spawn-limited, so the recruits do not share one hunt |

#### The starting weapon pick (GR-24)

| Rule | Detail | Status |
|---|---|---|
| The player picks how each hero fights when the hero is created | One card for each row of the starter sets: Sword and shield, Hatchets, Club, Bow and crossbow, Wand and spellbook, Staff. The list reads the starter set rows, so a new way to fight (fists, the crossbow's own list) is one more row | PROVISIONAL (GR-24, waits on being built and played past minute 17 by real new players) |
| The pick sets what is in hand and nothing else | Every hero still owns the whole practice kit and can switch in town at any time. No hero is locked to a way | RULED 2026-10-14 (classless), 2026-10-20 (the practice kit) |
| Each card says what the way does, what it uses, and one honest tag | "Good alone" or "Best in a party". Sword and shield and Staff carry "Best in a party. Slow alone." | PROVISIONAL (GR-24). The tank's slow lone pace is RULED 2026-11-19 |
| The tag is measured, never believed | Each way's tag comes from its start-kit cell on the balance matrix (section 6) | PROVISIONAL (GR-24, GR-88) |
| The first hero has no preselected card | "Enter town" lights when a card is picked. It is the first choice a player ever makes and the screen does not make it for them. The Club card (the hammer way) carries a "Good first hero" mark | PROVISIONAL (GR-24) |
| Heroes two to four come pre-filled | Sword and shield, Staff, and Bow and crossbow. One press accepts all three and any pick can be changed. The pre-filled company always holds one healer, and the screen says so before a player changes it | PROVISIONAL (GR-24, GR-79). MEASURED by the adversarial check: this company held the Sewer with 0 deaths in 64 hero-hours. A four with no healer and no shield died once in 16 party-hours |
| Look | Sixteen colors on four regions, free. Heroes two to four offer "same colors as [first hero]" as one press | RULED 2026-10-15 (four regions), 2026-10-19 (a name and colors step). The copy press is PROVISIONAL (GR-80) |

#### The starting kit for an account of four

| Row | Value | Status |
|---|---|---|
| Each hero, at creation | 20 Cooked Shrimp, 50 Bronze Arrows, 10 Coarse Whetstones, and a practice set for every way to fight with the picked one in hand | RULED (the practice kit, 2026-10-20). Quantities are the kit rows |
| The account, once, with the first hero | 500 gold, 8 Turnip Seeds, 10 Raw Shrimp, 2 farm plots | PROVISIONAL (CE-10). The purse, the farm and Storage belong to the account, so a grant for each hero would pay four times. Chapter 04 owns the number |
| A hero remade in a used slot | The hero kit above is granted once for each of the account's four slots. A hero deleted and made again gets the practice weapons only, which have no sale value | PROVISIONAL (CE-10). HYPOTHESIS. It closes a mint: the kit's food sells. Security reads it with the rest |
| The starting bar | Slot 1 eats the hero's own Cooked Shrimp under 60% health. Slot 2 buys Salted Shrimp from the store at 14 gold once the hero's own food is gone. Slot 3 drinks Thin Turnip Juice at 10 gold under 30% mana. A bar left empty plays the role's own moves in order | RULED 2026-10-21 (the starter bar) |
| No rune in the kit | A rune spell casts on the store's Plain rune at 1 gold a cast, bought by its slot | RULED 2026-10-23, 2026-11-05 |
| The starting loot plan | Sell gear worse than what is worn. Keep what a bench the hero can use takes. Never sell a Rare or better. The player edits it and never builds it | PROVISIONAL (GR-80, with the loot plan by kind in chapter 03) |
| The starting rest plan | Section 2.2, the job queue | PROVISIONAL (GR-80) |
| Blessings | All three are free under Level 30. "Keep my company blessed" is one standing choice, set once, applied to every hero on every Start | The free band is RULED 2026-10-18. The standing choice is PROVISIONAL (GR-80) |

#### The first hour, minute by minute

Minutes are TARGETS for a new player who follows the coach. The first 17 minutes of this sequence were PLAYED twice on the real engine as a one-hero opening (27 and 46), which is evidence about this design: hunting at minute 2, the first return to town at minute 10, Level 5 at minutes 17 and 18, with an XP event running in both plays. The steps from minute 17 on are designed here and have not been played, because they are not built.

| Minute | The player does | The screen says | What it teaches | Status |
|---|---|---|---|---|
| 0:00 | Signs in. Creates the first hero: a name, a way to fight, a look | "Create your hero. No classes. Every weapon is yours. The one in hand sets how this hero fights." | Who my hero is. The first real choice | PROVISIONAL (GR-24) |
| 0:01 | Lands in Havora beside the Great Hearth | The Town menu shows two lines, Shop and Tamsin's tally, and the next locked line with its opener. The coach rings Hunts | The town is a place. One next step | PROVISIONAL (GR-79) |
| 0:02 | Opens Hunts, presses the Mill Cellar, presses Enter | The Cellar is marked Recommended. Tamsin's Giant Rats task is taken on entry with no press | A hunt is one press. Hunting inside two minutes | DECIDED (GR-78, GR-79, Fable 2026-11-21, with GR-79 PROVISIONAL) |
| 0:03 | Watches kills. Opens one bar slot | The slot's rule as a sentence, for the hero's own first move (table below). The coach asks for one change to one number | The bar is where I outsmart a hunt. A rule is a sentence | PROVISIONAL (GR-79) |
| 0:04 to 0:10 | Watches, or looks around. Levels 2, 3 and 4 arrive | One coach card at a time, each fired by an event: first Level, first loot line, Tamsin's count | Fights run themselves. Levels come fast | PROVISIONAL (GR-79) |
| 0:10 | 25 rats. Presses Leave | "Rats done. Tamsin has a helm for you." | Leaving is safe and is how I cash in | DECIDED (GR-78, Fable 2026-11-21) |
| 0:10 | Reads the first end card | The first hunt report: lowest health and what did it, and what the changed rule did. Under it at most three presses: Wear the helm, Keep my company blessed, Carry on. Loot was sold by the starting plan and the card says what was sold | The report. Equip. Blessings as one standing choice. Carry on | DECIDED (GR-66, GR-78, GR-80, Fable 2026-11-21, with GR-66 and GR-80 PROVISIONAL, waits on the playtest or measurement its own row names, Tyler said yes on the page) |
| 0:11 to 0:17 | Carries on in the Cellar | Level 5 lands and the Cellar ends itself: "Ground outgrown" | Grounds are outgrown. The game tells me when | Content row (the Cellar ends at Level 5) |
| 0:17 | Reads the end card | "[Name] has outgrown the Mill Cellar. You have three more places in your company, and the Sewer under the mill wants a full party." Main press: Raise your company. Second press: Go on alone to Meadowbrook Thicket | I run four heroes. Alone stays allowed | PROVISIONAL (GR-79). Lone play allowed is RULED 2026-11-21 |
| 0:17 to 0:20 | Creates three heroes in one flow | The three come pre-filled as Sword and shield, Staff, and Bow and crossbow. One press accepts them, or each screen is a name, a way to fight and the look copy press. The screen says the company holds one healer | Roles come from weapons. A party wants a shield and a healer | PROVISIONAL (GR-24, GR-79) |
| 0:20 | Reads the first company plan and presses Start once | Four rows, filled in. The three recruits: Mill Cellar, each in its own hunt. The first hero: Meadowbrook Thicket, Normal. One Start begins all four hunts | One plan and one Start for the account | PROVISIONAL (GR-79, GR-80). HYPOTHESIS: the three lone hunts on one Start were not played |
| 0:20 to 0:36 | Watches the first hero in the Thicket. Presses a portrait on the hero strip to look at the recruits | Tamsin's Gray Wolves taken on entry. The strip shows each recruit's Level rising. Two optional lessons, each fired by the player's own act: press a portrait to watch that hero, and "Copy this rule to every hero" on the rule changed at minute 3 | Heroes run in parallel and I watch one. A decision made once can be copied | PROVISIONAL (GR-79, GR-80) |
| 0:36 | The recruits reach Level 5 and the Cellar ends for each of them | "Your company is ready for the Sewer." Main press: Gather and go. The first hero leaves the Thicket and the party forms with no invites | The first party | PROVISIONAL (GR-80) |
| 0:37 | Reads the Sewer's prep page and presses Enter | Seats, with the shield in front and the healer behind. The note that the Rat King's room is built for a party. Normal | Where heroes stand. A boss has a room | PROVISIONAL (GR-79). The party note is RULED 2026-11-08 |
| 0:38 to 0:55 | Watches the four fight | Two event lines, each shown once: the first time Challenge pulls a monster off another hero, and the first time a heal lands on an ally. Gear drops and "Equip upgrades for all four" is one press | Roles in action. Gear moves between my heroes | PROVISIONAL (GR-79, GR-80) |
| 0:50 | Reads the rest plan | "When stamina runs out your heroes go to work. Here is their plan." Two fish and cook, one mines 20 Copper Ore, one chops 30 Normal Logs. "This builds your first home." One press plants both farm beds with Turnip Seeds | Heroes work while they rest. Each hero takes a different trade. The first town goal | PROVISIONAL (GR-80, GR-79) |
| 0:55 | Reads the last card of the hour | "It is safe to close the game. Your company hunts for about 7 more hours, then goes to work. Come back in about 8 hours." | The idle promise, with a time on it | PROVISIONAL (GR-79) |
| 1:00 | Closes the game | The four are Level 6 to 7 in the Sewer | | TARGET |

**The first move each way reads at minute 3.** Every name below is a row of the ability data.

| Way to fight | First move on the bar at Level 1 | Costs | Status |
|---|---|---|---|
| Sword and shield | Challenge, then Power Strike | Mana only | RULED rows |
| Club | Power Strike. The hammer's Earth rune strike (Quarry Blow) sits beside it | Mana. One Plain Earth Rune a cast | RULED 2026-11-21 (32-5) |
| Hatchets | Rend, and Turning Cut from Level 1 | One Plain Rupture Rune a cast. Mana | Rend is RULED (32-3). Turning Cut at Level 1 is DECIDED (GR-15, Fable 2026-11-21, chapter 01) |
| Bow and crossbow | Hunter's Mark, then Precision Shot | Mana. Bronze Arrows never run out | RULED rows |
| Wand and spellbook | Fireball | One Plain Fire Rune a cast. Mana | RULED rows |
| Staff | Greater Mend. Mend needs no rune | One Plain Water Rune a cast. Mana | RULED rows. Mend at about 11% of max health is RULED 2026-11-21 (32-4) |

**Default bars.** A new hero's bar is left empty except for the starting food and drink slots, and an empty bar plays its role's own moves in order. That answers chapter 01's question on default bars: there is no second list to keep true.

A coach card that names a spell reads that spell's unlock level and its party-only mark from the data, so a card can never name a move the hero cannot cast (PROVISIONAL, GR-79).

#### The walk-through against real data

Each step is checked against what the player holds from the steps before it and the real starting kit. Every name was looked up in `src/data` on this branch.

| # | Step | Needs | The player holds, from steps before | Data checked | Doable |
|---|---|---|---|---|---|
| 1 | Create the first hero and pick a way | A starter set for each card | Nothing | `start-kit.js` STARTER_SETS: six rows, every practice item in `items.js` at Level 1 | Yes |
| 2 | Enter the Mill Cellar | Level 1, stamina, food | 8 hours of stamina, 20 Cooked Shrimp | `hunts.js` Mill Cellar band 1 to 8, Normal only. `hunt-sessions.js` free bar 8 h | Yes |
| 3 | Giant Rats taken on entry | A task for this ground | Nothing needed | `tally-tasks.js` cellar_giant_rats: 25 Giant Rats, 25 gold. Giant Rat is Level 2 in `monsters.js` | Yes, once the take is automatic (GR-78) |
| 4 | Change one rule on the bar | A move the hero can cast at Level 1 | The picked weapon | `abilities.js`: every way has a move with no unlock. `supply-basics.js`: Plain Fire, Water, Earth and Rupture Runes at 1 gold | Yes. A rune way spends purse gold from the first cast, and the account holds 500 |
| 5 | Leave at 25 rats and wear the helm | The reward piece | 25 kills at about minute 10 (PLAYED) | Bronze Helm in `items.js`, Level 1, for a heavy hero. A light or medium hero is paid its own weight's helm by the tally's piece rule | Yes |
| 6 | Keep my company blessed | Free Blessings | Level 4 | `blessings.js` freeUntilLevel 30 | Yes |
| 7 | Level 5, the Cellar ends | An end Level on the ground | Level 5 at about minute 17 (PLAYED) | `hunt-grounds.js` mill_cellar endsAtLevel 5 | Yes |
| 8 | Create three more heroes | Three free slots | One hero | RULED 2026-11-21: four from the start. Up to four heroes play at once (RULED 2026-10-17) | Yes |
| 9 | Each recruit enters the Cellar alone, and one Start begins the three hunts | A ground that takes a lone hero at Level 1, and one Start for several hunts | Three Level 1 heroes, each with 20 Cooked Shrimp and 8 hours of stamina | mill_cellar groupFit "both", so a lone hero is allowed. Up to four heroes play at once (RULED 2026-10-17). One Start for the account is GR-80, not built | Yes for the hunts. The one Start is designed, not built. MEASURED by the adversarial check: a lone new hero earns 8,095 to 8,998 Level XP an hour in the Cellar, the first hero's pace, so minute 36 stands. Three together earned 0.53 times that (check C2, failed) |
| 10 | First hero enters Meadowbrook Thicket | Level 5 | Level 5 | Thicket band 5 to 15. thicket_gray_wolves: 200 Gray Wolves, 480 gold. Gray Wolf Level 8, Gray Wolf Pup Level 5 | Yes. PLAYED alone on Normal: never under 75% health |
| 11 | Copy a rule to every hero | A copy action | The rule from step 4 | Not built. Part of GR-80 | Designed, not built |
| 12 | The four enter the Sewer | Every hero at the floor | Four heroes at Level 5 to 6 | Sewer band 5 to 25 (RULED 2026-11-18), groupFit "both", four start seats | Yes |
| 13 | The four walk the Sewer on Normal | To survive the route, the Rat King's room included | Practice weapons, a helm each, 20 Cooked Shrimp each, a purse of about 1,300 to 1,600 gold (COMPUTED from the PLAYED 730 at minute 18 plus the recruits' Cellar coin) | Drain Rat 10, Sump Slime 10, Sewer Kobold 13, Culvert Bat 15, Cistern Spider 20, Rat King 25. His room carries forParty 2 | Yes. MEASURED (check C3): a start-kit four of shield, staff, bow and wand at Level 5 on Normal had 0 deaths in 128 hero-hours, with Level XP a head 1.75 times the same four split in the Thicket. The default company (Club, Sword and shield, Staff, Bow and crossbow) had 0 deaths in 64 hero-hours and 1.71 times. The harness reads a healer's damage taken low, so the margin is wide and not exact |
| 14 | The rest plan: fish, cook, mine, chop | Level 1 nodes and a Level 1 recipe | 10 Raw Shrimp on the account | `gathering.js`: Shrimp Spot, Copper Rock and Normal Tree all need level 1. `recipes.js`: Cook Shrimp needs level 1. `hunt-after.js`: a gathering job takes a count, and 20 and 100 are offered | Yes, once a hero's plan can hold two steps (the job queue, GR-80) |
| 15 | Plant both beds | Seeds and beds | 8 Turnip Seeds, 2 beds | `gathering.js`: Turnip needs Farming 1 and takes 4 hours. `start-kit.js`: 2 farm plots | Yes. Ready before the first return. Chapter 07 walks the rest of the farm loop |
| 16 | Build the Hearthside Homestead on the first return | 400 gold, 20 Copper Ore, 30 Normal Logs | Purse over 400. Ore and logs from step 14 | `shops.js` property.homestead cost row | Yes |

Steps 9, 11 and 14 need features this chapter designs, and step 15 needs one press that plants every empty bed. Step 13 is measured and holds. Every other step is doable from the kit and the data as they stand.

**If check C3 ever fails.** C3 is a standing cell on the balance matrix, run on the default company with the four that has no healer printed beside it, so a later change cannot break the first hour quietly. If it fails, the four's first hunt together is Meadowbrook Thicket and the Sewer card moves to the Level where C3 passes. The fix is made at the formula or data layer: the Sewer's floor, or the gentle first grounds rule that GR-25 puts on record. The tutorial never gets its own monsters or its own math (RULED 2026-11-21, formula layer).

### 2.2 The company as one thing (GR-80)

A party is most often the account's own four heroes, so nothing here waits on another player. An on-call hero from another account can join (MM-18, ruled at the sitting, `11-on-call-and-clan-xp.md`, being written). Starting and stopping four heroes one at a time is a decision repeated by hand, and the first principle calls that a design bug.

| Part | Rule | Status |
|---|---|---|
| **One plan** | Each hero has a plan: where it hunts (ground, tier, setup, bag lines), with whom, what it does when the hunt ends (its rest plan), and its standing choices (blessed, loot plan, spending budget). The company plan is the four plans on one card | PROVISIONAL (GR-80) |
| | Any line can be set once and applied to all four. A new hero copies the plan of the hero it stands beside | PROVISIONAL (GR-80) |
| | A ground remembers the Setup, tier and seats last used there, so nothing is picked twice. A Setup holds the weapon, the worn set, the linings, the bar and the target mode. A hero has three free Setup slots, then two more at 15,000 and 40,000 gold (RULED, GR-56a, the sitting). It is saved once and can be copied to another hero or ground | DECIDED (GR-84, GR-48, Fable 2026-11-21, with GR-84 PROVISIONAL) |
| **One Start** | Carry on is one press for the account. Every hero does again what it did last time: same ground, tier, setup, party, bag lines, Blessings, Tamsin's task and loot by plan | RULED 2026-11-20 (27-1) |
| | No hunt ever starts by itself. A hunt starts on a press made in a server-authorized session | RULED 2026-11-20 (27-1), 2026-10-18 |
| | Own heroes form a party with no invite and no accept. The plan names the leader, and the leader's hunt settings are the party's | PROVISIONAL (GR-80). The leader rule is RULED 2026-10-20 |
| | "If one falls" is one plan line, chosen once: the rest hunt on, or all come home. For an account's own heroes the default is that the rest hunt on. They end together only if the player says so | RULED 27-1 as amended 2026-11-21: own heroes end together only if you say so. The plan line itself is PROVISIONAL (GR-80). The 2026-10-22 default of leaving together is for a party of different accounts |
| **One return card** | One card for the account on every return. Section 2.4 | PROVISIONAL (GR-80) |
| **The job queue** | A hero's rest plan is an ordered list of up to three steps (TARGET, a data row). Each step is a job with a count. A gathering step always takes a count. A bench step may run until its inputs are gone | PROVISIONAL (GR-80) |
| | The list ends in "wait in town" or "hunt again, once". A plan never loops | RULED 2026-11-20 (27-1) |
| | A gathering step may say "the best I can": the highest node of that line the hero's skill opens. It is a choice, because a player may want copper | PROVISIONAL (GR-80) |
| | The rest plan runs when a hunt ends for any reason, with the browser open or closed | PROVISIONAL (GR-80). Both paths is RULED (CLAUDE.md section 4) |
| | The starting rest plan gives a new company: two heroes fish 100 at the Shrimp Spot and then Cook Shrimp, one mines 20 Copper Ore, one chops 30 Normal Logs | PROVISIONAL (GR-80) |
| **Next ground when outgrown** | Refused. No hunt ever starts by itself (27-1 is kept whole). When a ground is outgrown the hero goes to its rest plan and works in town. The return card puts "outgrown, go to the next ground" first under Needs you, as one press for the whole party | DECIDED (GR-81, Fable 2026-11-21) |
| **Tamsin's task takes itself** | The task for a ground is taken when a hero enters it. Its pay is collected on the end card or by Carry on | DECIDED (GR-78, Fable 2026-11-21) |
| **Refills** | "Keep me topped up to N" is one line of the plan, run by Carry on. Its price and limits are chapter 04's | PROVISIONAL (GR-80, GR-58) |

**How the server sees it.** One Start is one intent that the server expands into the same per-hero starts a player could press by hand, through the same door and the same checks. It adds no authority to the client. Town work is paid in closed form (GR-1, chapter 09), so a job step costs a statement at its start, at its count and at its stop.

### 2.3 The hunt report (GR-66)

A death costs 6% of all Level XP, flat, with no cap (RULED 2026-11-21, knob `deathLoss`, formula P28), and the player is not watching. So the report answers two questions after every hunt: how close did this come to a death, and what did each rule on the bar do. It sits on the end card and on the return card.

**The risk block. Free to every player.**

| Line | What it reads | Status |
|---|---|---|
| Lowest health | For each hero: the lowest share of health it reached, and the monster and blow that did it | PROVISIONAL (GR-66, Tyler said yes on the page) |
| Close calls | How many times each hero fell under a quarter of its health | PROVISIONAL (GR-66, Tyler said yes on the page) |
| What ran out | Food, drink, runes or gold that hit zero, and when | PROVISIONAL (GR-66, Tyler said yes on the page) |
| Deaths | Each death, what it cost in Level XP and in hunted hours, and what the Blessings saved | PROVISIONAL (GR-66, Tyler said yes on the page) |
| One word for the hunt | **Safe**: no hero under 50%. **Close**: a hero under 50%. **Near death**: a hero under 10%, or three or more close calls | PROVISIONAL (GR-66, Tyler said yes on the page). Thresholds are TARGETS |
| The tier's own line | On the Hunts page before Enter: the deaths in 1,000 hunted hours the balance matrix reads for a mid-geared party on this ground and tier, and the reading from this party's last hunt here | PROVISIONAL (GR-66, GR-88, Tyler said yes on the page). Formulas are public (RULED 2026-11-08) |
| The risk block is never sold | Selling the warning would read as selling safety | PROVISIONAL (GR-66, Tyler said yes on the page) |

The report prints what happened. It does not predict a death rate from one hunt. Evidence about this design, from the matrix of the proposed game (59 section 0.3, as corrected by the cold audit): all 9 cells with a death read under 50% lowest health, so did 8 cells with no death, and none of the 190 cells at 50% or over held a death. That supports 50% as the line for Safe. It is PROVISIONAL: one seed and one hour a cell, and 115 of the 207 cells sit at Level 185 or over.

**The rules block.**

| Line | What it reads | Free or Premium | Status |
|---|---|---|---|
| Fired | For each bar slot: how many times it fired | Free | PROVISIONAL (GR-66, Tyler said yes on the page) |
| Never fired | One line for a slot that never fired, with the reason: its condition was never true, no mana, no rune, on cooldown, or still locked | Free | PROVISIONAL (GR-66, Tyler said yes on the page) |
| The change line | When the bar changed since the last hunt on this ground: "You changed slot 2. Power Strike did 22% of damage. It was 14%." | Free | PROVISIONAL (GR-66, Tyler said yes on the page) |
| Share | Each slot's share of the hero's damage or healing | Free | PROVISIONAL (GR-66, Tyler said yes on the page) |
| The full breakdown | By monster, over time, damage taken by source, and a comparison with any saved hunt | Premium analyzer | PROVISIONAL (GR-66, Tyler said yes on the page). The full analyzer in Premium is RULED 2026-10-17 |

**Rules for the build.**

| Rule | Status |
|---|---|
| The report is a screen over counters the engine already computes. It adds no formula and no knob | PROVISIONAL (GR-66, Tyler said yes on the page) |
| The counters live in the session row the settle already writes. No added statement a kill or a settle, and no journal row | PROVISIONAL (GR-66, Tyler said yes on the page). HYPOTHESIS until the systems engineer confirms the counters fit |
| The player and the balance matrix read the same counter (`lowHpP10` on the matrix) | PROVISIONAL (GR-66, GR-88, Tyler said yes on the page) |
| The report is identical for a watched hunt and a hunt with the browser closed | RULED (one engine, CLAUDE.md section 6) |

### 2.4 Away and return, and two visits a day

**The stamina day.**

| Player | Bar | Visits for 12 hunted hours a hero | How | Status |
|---|---|---|---|---|
| Free | 8 hours | Two, about 12 hours apart | Hunt 8, rest 4 while working, hunt 4, rest 8 | RULED 2026-11-21 (50-12). The bar is `STAMINA_MAX_MS.free` |
| Premium | 12 hours | One | Hunt 12, rest 12 | RULED 2026-10-17. `STAMINA_MAX_MS.premium` |
| The ceiling | Either | Refills | Six refills of 4 hours make 24 hunted hours. Each hour past 12 costs 2 refill hours, because the hero stops resting | RULED rows (COMPUTED in 50 section 1.1) |

Stamina drains one for one while hunting and rests one for one at every other instant. A resting hero is always working: every town system is sized for a hero that fills all 12 rested hours (RULED 2026-11-21, 50-13). The stamina bar says so in words: "8 hours of hunting. It refills while your hero is in town. Two visits a day keeps a hero hunting 12 hours." (RULED 50-12, wording DECIDED, no call id, Fable 2026-11-21).

**The return card.** One card for the account, in this order.

| # | Block | Content | Status |
|---|---|---|---|
| 1 | The header | Time away. The company's totals: Levels gained, net gold with coin and supplies shown apart, kills | PROVISIONAL (GR-80) |
| 2 | The night in three lines | The closest call. What ran out. The best find | PROVISIONAL (GR-66, GR-80, Tyler said yes on the page) |
| 3 | One row for each hero | Level before and after, where it is, what it is doing now and for how long, and the hunt's one word | PROVISIONAL (GR-80) |
| 4 | Needs you | At most three things that need a decision, ranked. Anything that stops a hero from hunting comes first, then anything that costs progress, then gains | PROVISIONAL (GR-80) |
| 5 | Carry on | One press. Under it, "Change the plan" | RULED 2026-11-20 (27-1) |
| 6 | The Rare reveal | Every Rare found while away rolls through on the card | RULED 2026-11-20 (27-6) |

What can appear in "Needs you": a death and a hero left unblessed. Better gear found, with "Equip upgrades for all four" as one press. A ground outgrown or opened. A full bag or full Storage. A job queue that ended with stamina full. A hunt that ended on its spending budget (GR-57). Everything else is done by Carry on and reported as one line.

**Bands for being away.** These are standard X9, as TARGETS.

| Away | What is lost | What the card does |
|---|---|---|
| 8 hours | Nothing | Carry on |
| 24 hours | At most half a day of hunting | Says so in one line |
| 7 days | No placement, no stock and no streak. Streaks never reset (RULED 2026-10-17) | Adds what opened or changed while away |
| 30 days | The same | The same, with the calendar's next weekend |

| Band | Target | Status |
|---|---|---|
| Visits a day for the 12 hour day | At most 2 free and 1 Premium | RULED 2026-11-21 (50-12) |
| Length of a visit for four heroes | Under 4 minutes | TARGET (standard X10) |
| Presses in a visit that repeat a decision already made | Zero | RULED 2026-10-18 (the first principle) |
| Time from opening the game to all four hunting | Under 3 minutes after any gap | TARGET (standard X9) |
| A normal return | One press, plus one for each real decision | TARGET (GR-80) |

**A return notice** ("all your heroes are rested") waits for the mobile build and is opt-in only. Steam has no push channel and a notice nobody asked for costs goodwill. BUILD-LATER, PROVISIONAL (GR-80).

### 2.5 The Path (GR-79)

One table says what opens every system. Each row has an opener, the line that announces it and the window it lives in. The Town menu, the coach, What next, the end card, the return card and the Book all read that table and nothing else. A new system costs one row.

**The three kinds of opener.**

| Kind | Example | Status |
|---|---|---|
| A Level | The Burning Tower at Level 10 | PROVISIONAL (GR-79) |
| A first event on the account | The first Level 5. The first stamina end. The first Rat King kill | PROVISIONAL (GR-79) |
| A count of active accounts on the server | The Town Crier at 50 accounts a day | PROVISIONAL (GR-79). The server already counts weekly active accounts for the Town Works goal |

**Rules of the table.**

| Rule | Status |
|---|---|
| The Path announces. It never takes away something ruled. A player who knows the game can create all four heroes at second zero | PROVISIONAL (GR-79). Four from the start is RULED |
| The Town menu shows the lines that are open and the next two locked lines with their openers ("Burning Tower, Level 10"). The rest are absent | PROVISIONAL (GR-79). HYPOTHESIS that a locked line keeps the promise without the clutter. Playtest 14 decides |
| Every Level from 1 to 30 names a next thing within 3 Levels. A guard asserts it from the table | PROVISIONAL (GR-79). It makes standards X11 and X28 checkable |
| A system that is planned and not finished stays off the table and stays hidden | RULED 2026-11-21 (nothing planned is cut, hidden until it works) |
| No hidden system is opened to players before a stranger has stayed twenty hunted hours in a playtest | PROVISIONAL (GR-79) |
| A room that is shut is not polled. A feature's section of the state read is fetched when its window opens | PROVISIONAL (GR-79), with chapter 09 |
| An opener owned by another chapter is read from that chapter's data. The Path holds no second copy of a Level | PROVISIONAL (GR-79) |

**The table.** Levels are the content rows on this branch unless marked. Where another chapter owns the opener, the row says so.

| Opener | What opens | Announced by | Status |
|---|---|---|---|
| The start | Hunts, Inventory, Character, the Book, the Mill Cellar, Shop, Tamsin's tally | The coach's first ring | PROVISIONAL (GR-79) |
| First kill | The action bar | One card, minute 3 | PROVISIONAL (GR-79) |
| First Leave | The end card, the hunt report, Blessings, the loot plan | The end card itself | PROVISIONAL (GR-79) |
| First Level 5 on the account | The company: heroes two to four, the hero strip, the company plan, Storage | The Cellar's end card | PROVISIONAL (GR-79) |
| Level 5 | Meadowbrook Thicket. The Sewer for a party | "Ground outgrown" | RULED 2026-11-18 (the Sewer at 5) |
| First company hunt, ten minutes in | Skills, the job queue, the Farm, the House as a goal | The rest plan card | PROVISIONAL (GR-79). The farm loop of chapter 07 needs only Level 1, so the later opener is the Path's choice: the first ten minutes hold one lesson at a time |
| First stamina end | The return card. The Hearthside Homestead, if the materials are in Storage | The return card | PROVISIONAL (GR-79) |
| Level 8, with a helm and body armor worn | Wickstead. The first Dangerous offer, with the risk reading beside it | The Hunts page | PROVISIONAL (GR-79). Risk as a warned choice is RULED 2026-11-04 |
| First Rat King kill | The Rat King's Hall, as the first boss door and key | The loot line | PROVISIONAL (GR-79, GR-28, reversal of 2026-11-14 and 22-8, let stand on the page) |
| Level 10 | The Burning Tower and the Hearth Chest. The Weighhouse | One card each | The Tower's Level is RULED 2026-11-18. The market is open on day one: PROVISIONAL (GR-55, waits on the store-bill fault fixed and a wage formula that exists, Tyler said yes on the page, reversal of 24-7, let stand on the page, chapter 04). The Weighhouse card moves to the first return |
| Level 16 | Mosslight Glade. The Honors page | "Ground opened" | PROVISIONAL (GR-79, GR-62) |
| Level 30 | Blessings cost gold. "Keep my company blessed" shows its price | The end card, two Levels ahead | RULED 2026-10-18 (free under 30) |
| Level 32 | Coppercap Warrens | "Ground opened" | Content row |
| Levels 45 to 85 | Hask's Ford, the Slake, the Muster Barrows, the Pyre Field, Krell's Hold | "Ground opened", with the Chronicle's teaser | Content rows |
| Set by chapter 03 | Tempering, Hallmarks, linings, jewelry tiers, salvage and Luck, the find list | One card each at its opener | OPEN. Chapter 03 sets each opener |
| Level 10 | Talents. The panel opens with two points. One line on the return card, for the account and never four. Setups carry the talent plan and the unlock switches. Order at Level 10: Talents on the first return after Level 10, then the Burning Tower after the first spend, then the Hearth Chest | One coach card, then a second after the first spend | PROVISIONAL (TAL-1, `10-level-choices.md`). The rhythm is RULED 2026-11-21. The order is chapter 10's and is PROVISIONAL. The first hour is unchanged |
| Set by chapter 05 | Honors lines at Level 100, 200, 300 and 400 | The Level card | PROVISIONAL there (GR-62) |
| Set by chapter 02 | Old grounds at your Level. Each region. The Catacombs | "Region opened" | PROVISIONAL there (GR-9, GR-33, GR-36) |
| The start | Chat and the presence strip | No card. They are on screen | DECIDED in chapter 06 (Fable 2026-11-21) |
| The first day | Clans: the roster and its chat tab | One line on the first return card | DECIDED in chapter 06 (Fable 2026-11-21) |
| Level 13, 20 and 30 | The world boss opens at Level 13 for each hero sent. The Even Arena at Level 20. The Open Arena at Level 30. The clan board when the account is in a clan. The calendar banner after the first stamina end | The System tab and a town banner | PROVISIONAL (GR-79) |
| 50 active accounts a day | The Town Crier, Rounds for the Tavern, flame powders, rank numbers on the boards | A town line | PROVISIONAL (GR-79). TARGET count |

### 2.6 Teaching and the coach

The coach teaches the loop and then gets out of the way. It is two things: a short loop deck, and one card for each row of the Path.

| Rule | Detail | Status |
|---|---|---|
| The loop deck is about fifteen cards | Hunt, Level, the bar, loot, leave, the report, wear, Blessings, Carry on, the company, the hero strip, copy a rule, roles, the rest plan, close the game | PROVISIONAL (GR-79). TARGET count |
| Every other card is a Path row | It fires when its opener happens and never before | PROVISIONAL (GR-79) |
| One card at a time | Dismissing a card never shows the next one. The next card waits for its own opener | PROVISIONAL (GR-79) |
| A card the server can finish is finished by the server | Dismissing it means later, not done | PROVISIONAL (GR-79) |
| A card names only what the hero can do now | It reads unlock levels, party-only marks, Levels and stock from the data | PROVISIONAL (GR-79) |
| No card sends a hero with stamina left away from its hunt | Town goals are offered at a stamina end or through the rest plan | PROVISIONAL (GR-79) |
| An account lesson is taught once | A card seen on one hero is seen for the account. Only a card about a weapon's own first move is per hero | PROVISIONAL (GR-79, the first principle) |
| Every card ships with its walk-through test | The step is proven doable from the steps before it | RULED (CLAUDE.md section 3.5) |
| What next is the Path's next row | On the end card, the return card and the Character window, always the same answer | PROVISIONAL (GR-79) |
| The end card shows at most three things that need a decision | Everything else is one press | PROVISIONAL (GR-79, GR-80) |
| Every line is plain English in Tyler's voice | No semicolons, no clipped fragments | RULED 2026-11-06, 2026-11-09 |
| Teaching is checked by a blind reader | Every system a player meets under Level 30 is named on screen before it is needed | PROVISIONAL (GR-79). The band is standard X28 |

### 2.7 The chase by day, week and month, with no dailies

**The standing rule.** Hearthrise has no daily quests, no login calendar and no season pass. With four heroes a daily is four chores, and a visit is two to four minutes. The beats of the game are the visit, the stamina bar, the weekly turn, the weekend and the monthly cycle. PROVISIONAL (MM-11, which answers GR-83). Daily goals were cut on 2026-10-22 (RULED). Premium's daily claim is not a daily in this sense, because its streak never resets and it needs no press.

| Beat | What it is | What it pays or shows | Status |
|---|---|---|---|
| **The visit** | Twice a day free, once with Premium | The return card: the night in three lines, up to three decisions, Carry on | RULED 50-12. The card is PROVISIONAL (GR-80) |
| **The day** | 12 hunted hours a hero | At least one Level for the pace seat in every 15 hunted hours to Level 300 (standard P12, chapter 05). Tamsin's tasks. Bestiary stages that pay Luck. Rare reveals | The 12 hour day is RULED. The reveal on every Rare is RULED 27-6 |
| **The longest dry spell** | Hunted hours with no reward of any kind | At most 30 minutes under Level 10, 2 hours to Level 50, 6 hours to Level 110, 12 hours after | RULED direction 2026-10-25. Bands are standard X12 |
| **The weekly turn** | One instant for everything weekly | The Hearth Chest's opens reset. The Tower's weekly climb. The six boards open on "this week". The Week card | The limits are RULED 2026-11-21. The Tower weekly is RULED (GR-3, Tyler 2026-11-21, the sitting7, waits on Deadly sized, and the system built). Six boards is RULED 27-4 |
| **The Week card** | Shown on the first return after the turn | This week against your last week for the account: Levels, hours hunted, best find, Bestiary stages, Tower floor, rank moves and what just reset. It pays nothing, ever | PROVISIONAL (GR-84) |
| **The weekend** | A four-weekend rotation written a year ahead as rows | The Hearthrise, a world boss, one ground's weekend, the arena season end with clan honors. Never over +25%, one at a time | PROVISIONAL (MM-11, MM-3). The +25% cap is RULED 27-5 |
| **The month** | One turn of the rotation | Each of the four weekends once. The Great Hearth's shared project | The Hearth merge is PROVISIONAL (GR-82, Tyler said yes on the page, reversal of 2026-10-25, let stand on the page), a HYPOTHESIS |
| **The long chase** | Past any one month | Krell's Hold on day 31 for a plain four, and day 18 to 24 with best gear and buffs. Level 400 on day 373. The Luck bar at +16% by 500 hours and +39% by 5,000. Honors lines at Level 100, 200, 300 and 400. Late Bestiary stages. Rare finds past Krell | The Luck bar is RULED 2026-11-21. Krell's day and Level 400's day are PROVISIONAL (GR-6b and GR-6, waits on the kill reward and the tiers, because the seat's multiple is not one number until then, Tyler said yes on the page, reversals of "day 18 for a four" and "Level 400 is day 382", let stand on the page). Honors is PROVISIONAL (GR-62) |

**What a company can see ahead of it.** Every row names one goal the player can read on screen (standard X11). Days are at 12 hunted hours.

| When | Named on screen | Status |
|---|---|---|
| Minute 5 | Level 5 and the end of the Cellar | RULED row |
| Hour 1 | The Sewer as a four. The Homestead from the first night's work | PROVISIONAL (GR-79) |
| Day 1 | Level 10 by 6 hunted hours, with no Level under 10 over 2 hours. The Tower, the Chest, Wickstead and the first Dangerous run | RULED (27-2, standard P11) |
| Week 1 | The Rat King's Hall. Mosslight Glade and the Honors page. The first sinks sized for an account of four | The order of the sinks is PROVISIONAL (CE-4, chapter 04) and their sizes are a HYPOTHESIS (CE-5). The Levels reached are set by the Level law (GR-6, chapter 05) |
| Day 31 | Krell's Hold, for a plain four. Day 18 to 24 with best gear and buffs | PROVISIONAL (GR-6b, Tyler said yes on the page, reversal, let stand on the page) |
| Month 6 and after | A region open 30 days before the first fours arrive. Old grounds at your Level | RULED 2026-11-21 (runway). GR-9 is PROVISIONAL in chapter 02 |

### 2.8 Premium's comfort and convenience across four heroes

There is one Premium for each account and it covers every hero (RULED 2026-11-20 and 2026-11-21). Its price, its full list of perks and everything Crowns buy are in chapter 04 (section 2.9 there). This section says only what Premium does to the player's day.

| Benefit | Across four heroes | Status |
|---|---|---|
| The 12 hour stamina bar | Every hero. The 12 hour day takes one visit in place of two | RULED 2026-10-17 (the bar), 2026-11-21 (the account) |
| The full hunt analyzer | Every hero and the party view | RULED 2026-10-17 |
| The daily training item (the 1 hour tier) | Granted into Storage on the first visit of the day with no press. The streak never resets | Kept: RULED 2026-11-20 (24-4). No press is PROVISIONAL (GR-84) |
| How many items a day | One for each hero, so four a day | DECIDED (PREM-1, Tyler said yes on the page 2026-11-21), chapter 04. It is four hours of training a day for one price, so the yard's rate (GR-54) sizes it |
| Premium outfits | Every hero | RULED 2026-10-17 |
| In the MMO layer | Arena tickets bank to 30. Premium does not make timed buffs last longer | DECIDED (MM-21, Tyler said yes on the page 2026-11-21, chapter 06) |

| What Premium never is | Status |
|---|---|
| The risk block of the hunt report | PROVISIONAL (GR-66, Tyler said yes on the page) |
| Carry on, the company plan, the job queue, the return card, the copy actions and the first three saved Setups. The fourth and fifth are priced in gold (GR-56a). A feature that removes a repeated decision is the game, not a comfort | PROVISIONAL (GR-80, GR-56a, with GR-56a RULED at the sitting) |
| A Level, a ground, a drop or a gear tier | RULED 2026-11-18 (monetization intent) |
| More hunted hours than a free player can reach. Both reach 12 without a refill | RULED 2026-11-21 (50-12) |

Premium must still feel like a real advantage (RULED 2026-11-21, "real advantages, not broken ones"). In this chapter the advantage is time: half the visits, the full analyzer on every hero and a free hour of training each day. The size of the edge and its ceiling are chapter 04's.

### 2.9 Features kept, merged or removed

The eight criteria in short form: player value, depth, uniqueness, what it plugs into, balance impact, complexity cost, long-term value, and the verdict.

| Feature | Value | Depth | Unique | Plugs into | Balance | Cost | Hour 1,000 | Verdict | Status |
|---|---|---|---|---|---|---|---|---|---|
| The return card, the end card, the after-hunt plan | High. A visit is the game | Medium | Yes | Everything | None | Low | Yes | KEEP. The end card becomes a named system with the three-decision rule | PROVISIONAL (GR-80) |
| Carry on, one press for the account | High | Low. It frees attention | Yes | Party, bag, tally, Blessings | None | Low | Yes | KEEP | RULED 27-1 |
| The company plan and the job queue | High | Medium | Yes | Skills, the House, the hunt | None on rates | Medium | Yes | ADD | PROVISIONAL (GR-80) |
| The hunt report | High | High. Feedback for ground, tier and bar | Yes | Tiers, Blessings, the bar | None on numbers. Players may avoid Deadly, which a ruled band cannot see | Medium | Rises with Level | ADD | PROVISIONAL (GR-66, Tyler said yes on the page) |
| The analyzer and personal bests | Medium | Medium | Yes | The report | None | Low | Yes | KEEP. Gains the report's full breakdown | RULED 2026-10-17 |
| The Path and the population gate | High early | Low. It makes real decisions findable | Replaces four partial copies | Every system | None | Medium. One file and its readers | Yes | ADD | PROVISIONAL (GR-79) |
| The coach | High in hour 1 | Low | Folded into the Path | The Path | None | Shrinks over time | No | REDESIGN onto the Path | PROVISIONAL (GR-79) |
| What next | High at hour 100 | Low | Folded into the Path | The Path | None | Low | Yes | MERGE into the Path | PROVISIONAL (GR-79) |
| Tamsin's tally | High. The one side feature everyone uses | Low | Yes. A gear piece you are missing | Gear, gold | Small | Low | Fades | KEEP. The task takes itself | DECIDED (GR-78, Fable 2026-11-21) |
| The Bestiary | Medium | Low | Yes. It pays Luck | Luck | Inside the Magic Find budget | Low | Yes | KEEP as ruled | RULED 2026-11-20 |
| Titles | Low alone | None | A fourth kill count | Honors | None | Low | Some | MERGE into the Honors page | PROVISIONAL (GR-62) |
| Leaderboards | Medium | Low | Yes | The weekly turn | None | Low | Yes | KEEP as six weekly boards | RULED 27-4 |
| The Week card | Medium | Low. A mirror | Yes | The weekly snapshot | None. It must never pay | Low | Yes | ADD | PROVISIONAL (GR-84) |
| The event calendar | Medium | Low | Yes | The MMO layer | Capped at +25% | Low. Rows, never run by hand | Yes | KEEP as a four-weekend rotation | PROVISIONAL (MM-11) |
| The Rare reveal | High | None | Yes | Loot, the return card | None | Low | Yes | KEEP on every Rare | RULED 27-6 |
| Setups, action sets and hunt presets | High. The identity feature | High | Three nouns for one idea | The bar, grounds | None | Medium | Yes | MERGE into one noun, "Setup", remembered for each ground. It holds the weapon, worn set, linings, bar and target mode, so the saved kit of GR-48 is the same thing | DECIDED (GR-84, GR-48, Fable 2026-11-21, with GR-84 PROVISIONAL) |
| Paid setup slots 4 and 5 | Low | None | A gold sink | The bar, grounds | 55,000 gold a hero | Low | Yes | KEEP the price | RULED (GR-56a, Tyler 2026-11-21, the sitting): three free, then 15,000 and 40,000 gold |
| A starting loot plan and a starting rest plan | High in hour 1 | None. They remove presses | Yes | The loot plan, the job queue | None | Low | No | ADD | PROVISIONAL (GR-80) |
| Next ground when outgrown, started by itself | High for 20 hours | Low | Yes | The after-hunt plan | None | Low | No | REFUSE. One press on the return card does it for the whole party | DECIDED (GR-81, Fable 2026-11-21) |
| The Premium daily claim as a press | None | None | No | Premium | None | Low | No | REDESIGN. Granted with no press | PROVISIONAL (GR-84) |
| The rested bank | None. It pays nothing on any path | None | No | Nothing | MEASURED: switching it off moved no band in 207 cells of the proposed matrix | Negative | No | REMOVE | CUT. RULED (GR-63, Tyler 2026-11-21, the sitting) |
| Old server leftovers, the gift code, Open Halls | None | None | No | Nothing | None | Negative | No | REMOVE | RULED (27-7, the cut list) |
| The Town Crier, Rounds, flame powders | Medium in a crowd | Low | Yes | Gold sinks | Small | Built | Yes | KEEP, shut by the population gate | PROVISIONAL (GR-79) |
| One Great Hearth | Medium | Low | Merges three rooms | Town Works, the event, powders | Small | Medium | Yes | MERGE | PROVISIONAL (GR-82, Tyler said yes on the page, reversal, let stand on the page). HYPOTHESIS |
| The Book of formulas and the Chronicle | Medium | Low | Yes. The honesty feature | The Path | None | Low | Yes | KEEP. The Book reads the engine's own constants | RULED 2026-11-08 |
| Settings and widgets | Medium | None | Yes | Everything | None | Low | Yes | KEEP | DECIDED (no call id, Fable 2026-11-21) |
| Account deletion | Required | None | Yes | Accounts | None | Low | Yes | ADD before Early Access | DECIDED (no call id, Fable 2026-11-21, chapter 09) |
| A return notice | Medium on phones | None | Yes | The stamina day | None | Medium | Yes | BUILD-LATER, opt-in, with the mobile build | PROVISIONAL (GR-80) |
| Companions | None until redesigned | Low | No | A seventh power lever | Risky | Built, hidden | Maybe, as a collection | BUILD-LATER, hidden | RULED 2026-10-22 |
| A skill tree | Covered by Kindlings | High | No | Combat | Risky | High | Yes | ON HOLD | RULED 2026-11-05 |
| Game modes | Medium | Medium | Yes | Accounts | Own ladders | High | Yes | After launch, for each account | RULED 27-9 |
| Weekly orders | Medium | Low | Yes | Crafting | Small | Medium | Yes | BUILD-LATER, judged against the ground weekend and the Week card | RULED 2026-11-21 (nothing planned is cut) |
| Daily quests, a login calendar, a season pass | Negative across four heroes | None | No | Nothing | A chore faucet | Medium | No | NEVER | PROVISIONAL (MM-11) |
| A loop that restarts hunts when stamina is full | It makes the free game zero visits | None | No | Stamina | It would end the stamina day | Low | No | NEVER | RULED 27-1 |

---

## 3. How it connects

| This chapter reads from | What |
|---|---|
| Chapter 01 | Each way's first moves and unlocks (GR-15, 32-3, 32-5). The party XP table that makes the four together beat the four split, paid by size alone (knob `partyXp`, formula P21, RULED 2026-11-21, GR-3). The tiers and their death band, which the report prints |
| Chapter 05 | The Level law and day numbers (GR-6, knob `levelCurve`, formula P01). The fix to Levels 7 to 10 (27-2). The death cost (knob `deathLoss`, P28) and the Blessing ladder (GR-7). Kindlings and Honors as Path rows |
| Chapter 02 | Each ground's band, floor and party note. GR-25's gentle first grounds. Old grounds at your Level (GR-9) |
| Chapter 03 | The loot plan by kind. The tally's piece rule. Every item opener on the Path |
| Chapter 04 | The first week's sinks for an account of four (GR-8). The hunt's spending budget (GR-57). The refill price (GR-58). The Weighhouse's opening (GR-55). Premium's price and what Crowns buy |
| Chapter 06 | The event calendar (MM-11), the boss window (MM-3), Premium inside the layer (MM-21), and every MMO row of the Path |
| Chapter 09 | Town work in closed form and the away hunt's 10 minute save (GR-1, on study 48). Sections of the state read fetched on open |

| This chapter feeds | What |
|---|---|
| Every chapter | The Path. Each system gets one row and announces itself through it |
| The balance matrix | The start-kit cells and the report's counters (section 6) |
| Chapters 01 and 05 | The risk reading, which changes which tier players pick |
| Chapter 04 | Press counts and standing plan lines, which raise the use of refills and Blessings |
| Chapter 09 | The intent count of a visit, which is a line of the server budget |

---

## 4. The calls in this chapter, as decided

In decision-book order.

| Id | The call | The decision | Status |
|---|---|---|---|
| GR-79 | The Path, and a first hour that teaches four heroes | One table opens every system. The first hour is one hero to Level 5, then three recruits who each run their own Mill Cellar hunt on one Start, then the Sewer as a four at about minute 36. The company always holds one healer. HYPOTHESIS | PROVISIONAL. Waits on being built and played past minute 17 by real new players |
| GR-8 | The first week's sinks, sized for an account of four | Tempering, Hallmarks and linings cost a share of a band's gold, 1.2 to 1.4 of what the band earns. The slot gold follows the order of CE-4 first, then the castle | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists. Tyler said yes on the page 2026-11-21. It changes The typed prices kept on 2026-11-18 (Hallmarks 150k, 250k, 400k, 600k), which he let stand on the page |
| GR-24 | The starting weapon | The player picks for each hero at creation. No card is preselected. Each card carries a measured tag and the hammer a "Good first hero" mark. Heroes two to four come pre-filled as shield, staff and bow | PROVISIONAL. Waits on being built and played past minute 17 by real new players |
| GR-66 | The risk reading | The risk block is free to every player. The rules block is free in short form and the full breakdown sits in the Premium analyzer | PROVISIONAL. Waits on the playtest or measurement its own row names. Tyler said yes on the page 2026-11-21 |
| GR-78 | Tamsin's task | Taken when a hero enters the ground, with no press | DECIDED (Fable 2026-11-21) |
| GR-84 | Small presses | The Premium claim needs no press. One noun, Setup, holds weapon, worn set, linings, bar and target mode for each ground. A Week card that pays nothing | PROVISIONAL. Waits on the playtest or measurement its own row names |
| GR-80 | The company as one thing | One Start, one plan, one return card and a job queue of up to three steps | PROVISIONAL. Waits on being built and played past minute 17 by real new players |
| GR-81 | Next ground when outgrown | No. 27-1 is kept whole. The return card offers the next ground as one press for the party | DECIDED (Fable 2026-11-21) |
| GR-82 | One Great Hearth | Merge Town Works, the Hearthrise event and flame powders. A HYPOTHESIS | PROVISIONAL. Waits on the playtest or measurement its own row names. Tyler said yes on the page 2026-11-21. It changes 2026-10-25, which he let stand on the page |
| MM-11 | Events and no dailies | A four-weekend rotation written a year ahead. No daily quests, login calendar or season pass, as a standing rule | PROVISIONAL. Waits on the playtest or measurement its own row names |
| MM-21 | Premium inside the MMO layer | Everything is open to all. Premium banks arena tickets to 30 and does not make timed buffs last longer (chapters 04 and 06) | DECIDED. Tyler said yes on the page 2026-11-21 |

---

**Cuts in this chapter, after the sitting.** CUT, RULED at the sitting (S-9), cut list 7: the rested bank (GR-63). KEPT, RULED at the sitting (S-3), cut list 14: the priced setup slots. KEPT, RULED at the sitting (S-1), cut list 2: on-call heroes. CUT, RULED at the sitting (S-2), cut list 3: the live party finder.

## 5. Still missing

| # | Missing | Who decides | Note |
|---|---|---|---|
| 1 | Closed. A start-kit four holds the Sewer on Normal at Level 5, the Rat King's room included | MEASURED, check C3, and re-run by the adversarial check on the default company | It is a standing matrix cell now |
| 2 | Closed. Three heroes together in the Cellar do not keep pace with one | MEASURED, check C2, failed at 0.53 times | The recruits run three lone hunts on one Start (section 2.1) |
| 3 | A measured tag for each starting way | The balance matrix (check C1). Owner: the core decider | Six start-kit cells. Still owed |
| 4 | What the first week's gold buys, and early prices for an account of four | Closed. CE-4 gives the order and CE-5 the sizes, as a HYPOTHESIS | The decision book lists both as missing |
| 5 | Premium's daily item: one an account or one a hero. And Premium's price | Closed for now. Tyler said yes on the page (PREM-1 and PREM-2): one item for each hero, and 8 to 10 dollars a month as a number to react to | A money call |
| 6 | The Path's rows for Levels 17 to 19, 21 to 24 and 26 to 29 | Chapter 03 | The content rows on this branch name nothing there except skill unlocks at 20 and 25. Gear tier rows should fill them, or the guard in section 6 fails |
| 7 | The Level doors for the world boss, both arenas and the clan board | Closed. GR-79: Level 13, 20 and 30, and the clan board when the account is in a clan | Chapter 06 asks this chapter for them. They cannot be set before the boss pool and arena tiers have numbers |
| 7b | How the thirteen skills are spread across four heroes past the first night | The game designer, inside GR-79, with chapter 05 (its item 16) | The starting rest plan gives each hero a different trade on night one. Nothing yet says who should train what after that, or whether the game should say it at all |
| 8 | The player-facing word for the account's four | Closed. "Heroes" for the account screen and "Party" inside a hunt, by the genre-words rule | "Heroes" and "Party" are recommended. "Company" is design vocabulary |
| 9 | Whether kit items can be turned into gold by deleting and remaking a hero | Closed. CE-10: the hero kit is granted once for each of the four slots and a remade hero gets practice weapons only. Security reads it with the rest | The kit's food sells for a little. Account deletion is staged, and hero deletion has no design here |
| 10 | Whether the report's counters fit the session row with no added statement | The systems engineer | HYPOTHESIS until confirmed |
| 11 | Closed. An away hunt is saved every 10 minutes, or at 1.2 seconds of engine time for a heavy party, which is every 4 to 5 minutes | PROVISIONAL (GR-1, waits on a town-hour fixture and a load test, Tyler said yes on the page, on study 48). MEASURED: the result is identical at every cadence | The return card is never stale. Opening the game settles the window to now on the first hello, so the card shows the saved state and then the present. A hunt that ended while away is filed back in town up to 10 minutes after its true end, and the next planned hunt starts from that true end |
| 12 | A blind play of the whole first hour | A fresh reader, after it is built | The sequence from minute 17 has never been played |
| 13 | What a player who refuses heroes two to four is shown, and for how long | The designer, after playtest 1 | Recommended: one quiet line on the return card, once a visit |

---

## 6. How we will know it works

**Matrix checks, on the proposed game.** Each is a cell or a small set of cells on the balance matrix (GR-88), at the sample size standard X26 asks.

| Check | Cell | Passes when | Label |
|---|---|---|---|
| C1 | Each of the six ways, one hero, start kit, Mill Cellar, Normal | Level 5 in 15 to 20 minutes, no death, net gold at or over zero. A way outside the band carries "Slow alone" on its card or is fixed at the formula layer | TARGET |
| C2 | Three start-kit heroes together, Mill Cellar | Level 5 in no more hunted minutes than one hero alone | FAILED when the adversarial check ran it: 4,589 Level XP a head an hour against 8,095 to 8,998 alone. The Cellar is spawn-limited and three heroes kill only 18% more rats than one. The design no longer leans on it |
| C3 | The default company (Club, Sword and shield, Staff, Bow and crossbow) at Level 5, the Sewer, Normal, the whole route. The four with no healer is printed beside it | No death in 4 seeds of 8 hours. XP a head at or over the same four split. Net gold at or over zero | PASSED, MEASURED: 0 deaths, XP a head 1.71 to 1.75 times, net gold a head 1.18 times. A standing cell |
| C4 | The first day | Level 10 by 6 hunted hours. No Level under 10 over 2 hours | RULED (27-2, standard P11) |
| C5 | The stamina day on the server | A free hero hunts 8 hours and then 4 on two starts 12 hours apart, a Premium hero 12 on one, and both read 12.0 hunted hours a day | RULED frame (50 section 5.2, step 0) |
| C6 | The report on both paths | The same hunt replayed watched and with the browser closed prints the same report | RULED (both paths) |

**Bands read from a played life.** From standards X9 to X12 and X28.

| Band | Reads |
|---|---|
| X9, away and back | Hours lost, presses and minutes to full hunting after 8 hours, 24 hours, 7 days and 30 days |
| X10, session shape | Visits a day and presses a visit, counted from the intent list. Repeated-decision presses must be zero |
| X11, the chase | The reward log of a played life against the horizon table in section 2.7 |
| X12, the dry spell | The longest gap in the reward log, by checkpoint |
| X28, teaching | A blind first hour by a fresh reader. Every system met under Level 30 was named before it was needed |

**Guards.** A Path guard: every Level from 1 to 30 has a named next thing within 3 Levels, and every opener points at a real row. A coach guard: every card's step passes its walk-through test. A first-hour run on the local world: the whole section 2.1 sequence from the sign-in screen, as a test that plays it.

**Playtests only real players can settle** (60 section 7.3).

| # | Question | Reads as |
|---|---|---|
| 1 | Does a stranger with four heroes from the start stay? | Five first sessions recorded with the player talking aloud. Share reaching Level 10, 16 and 32. Return on day 2 and day 7. How many heroes each account really runs. Is four heroes in the first hour a party or a wall |
| 8 | Is a death read on the morning card a quit moment? | Any press within 48 hours of a death that cost over one Level. Red if returns drop by a third |
| 9 | Does the risk reading change the tier a player picks? | Share of hunted hours by tier, and deaths in 1,000 hours on Deadly, before and after the report |
| 14 | Does hiding systems until their opener help, or hide depth? | A blind first hour with locked lines shown and with them absent |
| 15 | Is the bar fun to tune, or copied once and never opened? | Slots changed a hero a week with the rules block live for two weeks |
| New | Does the Week card bring people back? | Accounts whose first press of a week falls within a day of the turn |

Playtests 1 and 9 fit the first invite wave. There is no comparison group for playtest 1, so it reads the four-hero decision and cannot test it.

---

## 7. Superseded

| Dropped | From | Why |
|---|---|---|
| The second hero on the first evening for about 10,000 gold. The slot ladder, its guard and "the first hero slot" as the week 1 goal | 46 change 1, 59 decision 5, 27, 50 standard X11 | RULED 2026-11-21: all four heroes from the start, no slot prices |
| A first hour, a coach and a fix to Levels 7 to 10 sized on one hero | 27 question 1, 59 section 2.3, 60 section 4.7 | Re-designed on an account of four (section 2.1). The fix 27-2 itself stands |
| One hero's return as the unit: one card and 8 to 10 presses a hero | 27 question 3 | One card and one press for the account (GR-80) |
| Lent seats and on-call heroes as the early party | 46 change 1 part 3, 57 | The early party is the account's own four. On-call heroes are kept for later play (RULED, MM-18, the sitting, chapter 06) |
| "Krell at month 4 to 6" and every week counted at 3.3 hours a day | 27 question 2, 30 | RULED 2026-11-21: 12 hunted hours a day, and Krell in weeks, not months. Day 31 for a plain four (GR-6b) |
| One kill ladder that merges the tally, the Bestiary, titles and trophies | 59 phase A, row 7 | Withdrawn in 59 phase B and by 47 C19. The tally takes itself, the Bestiary keeps its six Luck payments, titles go to Honors |
| Removing the built companions | 59 phase A, row 15 | RULED 2026-10-22 and 2026-11-21: hidden, built later |
| The reveal on Trophy and Very Rare only | 27 change 5 | RULED 27-6: the reveal stays on every Rare |
| A three-class "zero for two days" alarm | 27 call 8 | Deferred by Tyler (27-8). The population gate is the rule the game itself follows |
| "On this hunt you would die about once in 30 hours" as a line of the report | 59 section 4.1 | The cold audit (61 M5): the reading carries signal and is not a clean line. The report prints facts and the tier's matrix line |
| The whole hunt report in the Premium analyzer | 59 decision 3, alternative | Selling the warning reads as selling safety. The risk block is free |
| "Weekly orders were cut" | 59 phase A, section 4.8 | A misreading, corrected by 47 C23. Weekly orders are built later |
| The market card behind the population gate | 59 row 24 and section 3 | GR-55 recommends the market open on day one. Chapter 04 decides, and the crowd gate keeps the Crier, Rounds, powders and rank numbers |
| Premium for each hero | Rulings of 2026-10-17 | RULED 2026-11-20 and 2026-11-21: one Premium for each account |
| A standing plan that loops and restarts hunts when stamina is full | 27 call 1, alternative | RULED 27-1 |
| "60 database-seconds is the ruled budget" | 59 section 0.2 | The cold audit (61 M3): Tyler ruled $0.15 an account a month. 60 is COMPUTED from it. Chapter 09 carries the number |
| Every comparison with the game as it stood, and every count of presses or cards taken from it | 27, 46, 59 | RULED 2026-11-21: the current game is irrelevant. Played logs are kept only as evidence about the opening this design keeps |

---

## 8. Source map

| This chapter replaces | Sections |
|---|---|
| `27-retention.md` | Questions 1, 2, 3 and 8. The cards for first-hours, what-next, away-return and analyzer. Changes 1 to 3. Calls 1, 2 and 8 |
| `46-from-scratch.md` | Section 0 (the played first hour). Section 2's moments table. Section 3d's rows for the company and the job queue. Change 1, parts 1 and 2 |
| `59-review-features.md` | Sections 0.3 to 0.5, 1, 2.3, 3 (rows 3 to 8, 15 to 26, 31 to 37), 4, 5 (traces 2, 3, 5 and 6), 6 and 7 for this area. Town work and server cost stay with chapter 09 |
| `60-game-review.md` | Section 1.7 for this area. Section 3 rows 2, 9, 12 and 13. Section 4.7. Section 7.3 playtests 1, 8, 9, 14 and 15. Section 8.9. Section 10.3 rows 3 and 4 |
| `62-decision-book.json` | The Features area. GR-24 and GR-66 as they bear on this area. In `waiting`: how the first hour teaches four heroes, and what one Premium gives across four heroes |
| `50-standards.md` | Section 1.1 (the clock) and standards X6, X9, X10, X11, X12 and X28 as this area's bands |
| `49-mmo-layer.md` | Section 5.3 (events and no dailies) and call 21 as they bear on the player's day. Chapter 06 owns the rest |
| Rulings of record | Four heroes from the start, one Premium, decisions first, the 12 hour day, two visits a day, the first principle |
