# Balance program 27: Retention, live ops and teaching

Dive of `lane/d-balance-retention` (game-designer, 2026-11-20), cut from `set/v0.2.143`. Fourteen systems: first-hours, what-next, wiki, lore, away-return, analyzer, bestiary, leaderboards, live-events, rare-moments, game-modes, settings, old-server-leftovers, discord-gift. No game code, data or migration was changed. Labels as in `01-model.md`: REAL, MEASURED, CITED, RULED, READ FROM DATA, ASSUMED, PROPOSED, plus PLAYED (what I pressed and read on a private headless local world today, `openWorld({ liveCalendar: true })` + `world.play()`, 1440x900, a brand-new account from the sign-in screen, learning only from the screen).

**Played.** One hero, Wren, sword and shield (the default look), alone. Sign-up, creation, Tamsin's first task, the Mill Cellar twice (9 and 8 minutes) to its own end at Level 5, the end card, Shop buy and sell, the bag, the Thicket for 20 minutes, then "Hunt again" and the page CLOSED for 8 hours (`world.wait(480, { away: true })`), the return, the loot plan and Dispatch, then a mining job and the page closed for 8 more hours, and the second return. Then every retention surface: What next, the Book's four tabs, Leaderboards, the Character sheet's five tabs. About 9 hunted hours and 8 gathered. **Not played:** an own four (one slot, 300,000 gold for the second), a death, Settings, a party. Where a count is for four heroes it is one hero's count times four and says so.

**One disclosure.** I ran `node tools/vitals.mjs --help` expecting usage text. The tool has no help flag and ran its read-only production query (four days of the vitals table). Nothing was written. The shared block says a dive never reads production, so it is said here; the four rows it printed agree with the brief's zero list and are cited once below as REAL.

**The inventory needs four changes.**
1. `discord-gift` is listed live. The rebuilt client has no caller (`grep -r discord_gift src` is empty), the RPC is still granted, and it pays 25 gems, a currency the economy dive lists as dead (`2026-10-18-discord-gift.sql:333`). It is dark.
2. `bestiary` is listed live. What a player can reach is one line on the Character sheet ("8 of 55 creatures slain", PLAYED). The kill counters are live; the stage ladder has no screen and its claim has no client.
3. `what-next` names `src/core/goals.js` as its code. That file is the kill and loot counter contract. The What next lines live in `src/data/text/coach.js`, `src/shell/hunt-list.js` and `src/shell/upgrade-plan.js`.
4. **A system with no row: the Hunt summary (the end card).** It is the screen a returning player lands on, it holds Equip, Bless, Next ground, Next buy and Hunt again, and three dives now put changes on it. It needs its own row (retention), or to be named in `away-return`.

## Summary

### Verdicts

| Verdict | Count | Systems |
|---|---|---|
| KEEP | 3 | wiki, analyzer, settings |
| FIX | 7 | first-hours, what-next, lore, away-return, leaderboards, live-events, rare-moments |
| BUILD | 1 | bestiary (as the Luck stage ladder with a page, ahead of the rest of Luck) |
| HOLD | 1 | game-modes |
| CUT | 2 | old-server-leftovers, discord-gift (Tyler approves cuts) |

### What the dive found

**The first twenty minutes are the best in the game, and the game loses its new players in the next ten hours for three reasons that all land between Level 7 and Level 10.** Both real players who are not the two heavy ones stopped there (REAL). I walked into each reason on the screen.

1. **The Level clock.** Levels 1 to 5 took 17 minutes. Then each Level takes about twice the one before, nine times in a row, by design (`src/data/core-model.js` LEVEL_CURVE, the smooth rule "no Level more than 2x the one before"). PLAYED in the Thicket on Normal with the start kit: Level 5 to 6 in about 20 minutes, 6 to 9 in 8 hours away, 9 still 12% short. Level 8 costs 68,087 XP and Level 9 costs 83,477 against 17,200 Level XP an hour without the weekend bonus (the analyzer's own "no party, solo or event bonus" line): **3.8 and 4.7 hours a Level.** Then the curve goes flat (83,478 at Level 10, 99,903 at 15) while grounds pay more, so a Level falls back to about 3 hours at 10 to 15 and 1.5 to 2 hours at 16 to 20. **Levels 8 and 9 are the two slowest Levels of the first fifty for the hero a new player actually is**, and the only pattern that player has seen is "each Level takes twice as long as the last". Level 10 projects to about 11 hunted hours on my path without the event (9.1 with it; I stopped at Level 9 and 89% after 8.7); the ruled target is 6 (RULED 10-25); the real quitter was Level 9 at 12 hours.
2. **The reward stream stops at the same Level.** At Level 9 Wren wore full bronze from drops, held 14,206 gold and 10,014 gold of unsold loot, and the end card's "Next buy" was a Bronze Belt for 220 gold. The next gear What next named was "Level 12: Grayjaw's Ruff" (two were already in the bag). The next thing gold can buy is the second hero slot at 300,000, which Tyler ruled today should cost more. Between 220 and 300,000 the screen names nothing.
3. **The loop does not close.** At Level 7 the coach's day-one cards open ("Build your home: Gather Copper Ore: 0 of 20", "Make your own runes": `hunt-tutorial.js` DAY_ONE_LEVEL = 7). The account has one hero, so gathering takes it out of the hunt. The job has no count and nothing sends the hero back: PLAYED, 8 hours later the card read "Wren mined the Copper Rock. +6,001 Copper Ore, Mining 1 to 42. Still mining." with two presses, "Open your inventory" and "OK". Stamina was full. The other way round is the same: a hunt that ends leaves the hero waiting ("Waits in town (no job to resume)", PLAYED), and "Hunt again" is the only press that is always offered.

Those are the two real players. One pressed Hunt again six times, never sold (the end card shows "Unsold loot value" with no press beside it), found nothing to spend on (60 gold in 12 hours) and stopped at Level 9 where a Level costs four hours. The other followed the Level 7 card to the rocks and stayed 101 hours.

**Past the first week the game's retention systems are dark or one line long.** The Bestiary is a count. The Chronicle's second page cannot open on the normal path. Sixteen leaderboards hold the same names. Rare-band "reveals" fire every half hour to two hours for heroes nobody is watching. The away card is good at saying what happened and says nothing about what is waiting.

### The five changes that matter most

| # | Change | Why first | Size |
|---|---|---|---|
| 1 | **"Carry on", one press for the account, and an away card that lists what is waiting.** The card's first press does again what each hero did last time (same ground, tier, setup, party, Tamsin's Repeat, Blessings, loot by plan). Under it, only what needs a decision: better gear found, a ground that opened, a full bag, stamina full on a hero that is gathering | A visit is 2 to 5 minutes (REAL). Today one hero's return is 8 to 10 presses that never change; four heroes is 32 to 40. A gathering hero's card has no way back to the hunt at all | M, one server intent, client |
| 2 | **Levels 7 to 10 are re-cut for the hero a new player is, and held there.** "Level 10 in 6 hours" is measured on the start kit, the start bar, Normal, the recommended ground, no event, and no Level under 10 takes more than 2 hours | The slowest Levels of the first fifty sit exactly where both light players quit, where a lone hero dies most (8.9 per 100 hours, REAL) and where the slot ruling keeps players alone for 58 to 88 more hours | S data, owned by dive 21 |
| 3 | **Every job has an end, and the coach stops sending the only hero away from the hunt.** A gathering job takes a count ("20, then wait"). The Level 7 cards say when to do it ("when stamina runs out") and are not offered before the first stamina end. "Got it" on a card the server finishes means later, not never | The second quitter. Also the default starting style's "Try a rune spell" card names a spell the hero cannot cast (Frost Slam, Melee 12, party only): a broken step in the first hour | S each |
| 4 | **Build the Bestiary now as the Luck stage ladder, with a page in the Book.** The first stage (100 kills of a creature) lands 20 to 60 minutes into the Thicket, the second at 2 to 5 hours, the third at 10 to 25 | It puts a second reward clock under Levels 5 to 30, the stretch where the Level clock goes quiet. It is ruled already (Luck v3.1), the counters exist, and it costs the server nothing new | M |
| 5 | **Moments are rare again: the reveal is for Trophy and Very Rare only, and it waits on the away card.** A Rare-band drop is a gold loot line and "Best find". Leaderboards open on "this week". The world XP weekend goes monthly and the fortnight between becomes a party ground's weekend | An Own four gets 7 to 26 "reveals" a day while away. The boards cannot be entered at month 6. A +25% weekend on a server of 10 is only faster pace | S each |

### The eleven questions, in one line each (full answers below)

1. First 30 minutes: 17 good minutes, five dead moments, one broken card.
2. The chase: 8 of 52 cells are empty and 7 are thin. The empty ones are the day at Level 17 alone, and nearly everything at 110 and 150.
3. Away and return: the card shows the past. One press carries on only after a hunt ends. Redone by hand: 8 to 10 presses a hero.
4. Bestiary: a ground's first three stages fit inside its band (10 to 25 lone hours for the common creature); the 10,000 stage on its rare creature is 220 to 390 lone hours, 50 to 85 for a four.
5. Leaderboards: 16 become 6, every one opens on "this week", Level and Total level keep an all-time hall.
6. Live events: Multiply class, held to +25%, never stacked on a first day, the fortnightly world weekend becomes monthly.
7. Rare moments at month 1: New 0, Own four about 1, Heavy four about 4, on today's bands.
8. Teaching: the one table, 84 live systems, below.
9. Telemetry: the launch dashboard and the daily ten, below.
10. Old leftovers: nothing feeds renown. Five cuts, one of them a granted RPC.
11. Game modes: six things the model must not do.

### Tyler rules on

1. **What carries a hero on while you are away.** *Recommend: one "Carry on" press for the whole account on the return card, and no hunt ever starts by itself.* It keeps your 10-18 ruling (a session starts a hunt), keeps the stamina bar as the reason to come back, and keeps Premium's longer bar worth something. Alternative: a standing plan that loops (hunt, job, hunt again when stamina is full). It is the purer reading of the first principle and it would take the Own four from 3.3 hunted hours a day to about 12, so every "weeks" number in the other dives shrinks 3.6 times and Premium's bar buys nothing.
2. **The pace of Levels 5 to 10.** *Recommend: hold "Level 10 in 6 hours" on the start-kit hero a new player really plays (I measured about 11), by re-cutting Levels 7 to 9 so none takes more than 2 hours; Levels 10 to 15 take the XP back.* Alternative: keep the curve and only teach it ("Levels 10 to 15 cost about the same as this one"), which is cheaper and leaves the four-hour Levels where the quitters are.
3. **The Bestiary ships before the rest of Luck.** *Recommend: yes. Stages pay Luck onto the account bar as v3.1 says, the page goes in the Book, and the charm ladder, the hidden trophy multipliers (+1 to +3% drops, +1% damage at 20,000 kills) and the claim are cut.* Alternative: wait and ship it with salvage and the Lucky ring, which leaves Levels 5 to 30 with one reward clock until then.
4. **Leaderboards.** *Recommend: six boards (Level, Total level, Combat skills, Trades, Tower, Gold Given), each opening on "this week" with the all-time roll one press away, and no prize beyond a line of text.* Alternative: keep the sixteen all-time boards and add Level brackets (1 to 30, 31 to 60, and so on).
5. **The Bonus XP weekend.** *Recommend: the world weekend once a month; in the fortnight between, one party ground pays the +25% for a weekend (the Sewer, the Warrens, the Barrows in turn). Never above +25%, and never two XP events at once.* Alternative: keep +25% on every hunt three days in fourteen, which is +5.4% pace for everyone and, at 10 online, nothing else.
6. **The big reveal.** *Recommend: Trophy and Very Rare only; a Rare-band drop is a gold line in the loot and "Best find" on the card; the server line to everyone stays for Trophy only.* Alternative: keep the reveal on every Rare-band drop (every half hour to two hours of hunting).
7. **The cut list.** *Recommend: cut bounties, workers, the collection log, renown, traits (with its granted `hr_trait_buy`) and the Discord gift code as built.* Alternative for the gift: rebuild it as a code that unlocks a title or an outfit color, never gold or gems.
8. **The "zero for two days is a P1" rule.** *Recommend: three classes. A loop system (hunt, sell, buy, after-hunt plan, tally, farm) at zero for two days is a P1. A shelf system (a one-time buy) is read as "accounts that could afford it for 7 days and did not". A social or crowd system (the Crier, the market, the finder) is not read under 50 accounts a day.* Alternative: keep the rule literal, which today marks 20 systems P1 on a server of two people a day.
9. **Game modes are per account.** *Recommend: when Ironman, Hardcore and Group come, a mode is an account's, because the purse, Storage, the House, the Farm, Luck and the Bestiary are the account's.* Alternative: a mode per hero, which needs every shared table split first.

---

## The eleven questions

### 1. The first 30 minutes, blind (PLAYED)

Wall-clock minutes of play; the Bonus XP weekend was on (the local world's live calendar), which is worth about a quarter of the pace.

| Min | Level | What the player holds | What the screen says | What makes them do the next thing | Mark |
|---|---|---|---|---|---|
| 0 | - | Nothing | "Create your hero. No classes, nothing to pick. Every weapon below is yours, the one in hand sets the style." Five styles, each with what it does and what it uses. Sixteen colors for four regions, free | "Enter town" | Good. The 10-22 ruling (explain styles and how they are chosen) is met on one screen |
| 0.5 | 1 | 500 gold, 20 Cooked Shrimp, a weapon of every style, 8 turnip seeds | Coach: "Tamsin's rats. Open Tamsin's tally, Take Giant Rats." The Town icon is ringed | The ring | The Town menu opens ten lines: Shop, Market, Storage, Tamsin's tally, Havora, Farm, House, Training, Burning Tower, Hearth Chest. Only one matters for ten Levels. **Thin** |
| 1 | 1 | The task: 25 Giant Rats, 25 gold and a Bronze Helm | Tamsin, in her own voice, and her whole board: eleven tasks from Level 1 to Level 85 | Take, then the ring moves to Hunts | Good. The board is the first map of the game |
| 1.5 | 1 | | Hunts: eleven grounds with their Levels, the Cellar "Recommended", enemies, drop odds, supplies before entering, "When the hunt ends" | "Press the Mill Cellar, then Enter" | Good, dense |
| 2 to 3 | 1 to 2 | | Coach cards in turn: Fights on its own, Level up, Action bar, Tamsin's count, Out to the brook ("Hunt here to Level 5 for Meadowbrook Thicket") | Watching kills. Level 2 at about 1:30, 14 of 25 rats at 3:00 | **Dead moment A.** "Got it" walks the whole queue: seven presses in twenty seconds took a Level 1 hero through "Cash in: leave the hunt" and "Into the Thicket" to "What next: Buy the Hearthside Homestead in the House". A player who clears cards by habit is told to buy a house in minute two |
| 10 | 4 | 25 of 25 rats | "Rats done. Leave the hunt and collect from Tamsin in town" | Leave hunt | "Leaving now..." sat until the next settle (up to 10 seconds live) |
| 10.5 | 4 | 587 gold, 198 gold of loot, a Bronze Helm | Hunt summary: Level 1 to 4, Melee 1 to 5, top loot. "Back in town": Equip (Bronze Helm, +3 Defense), Bless I, II and III "Free until Level 30", Next buy: Copper Studs (120 gp). "Unsold loot value 198 gp". Hunt again, Open bag | Equip, Bless, Show: one press each | **Dead moment B.** "Bless" says what it costs and never what it does. **Dead moment C.** Unsold loot is a number with no press. This is the real player who never sold |
| 11 | 4 | Studs, in the bag | Shop, Buy tab. After buying: "1 in the bag". The Sell tab lists the studs I just bought (30 gp) and my food. "Sell all junk for 48 gp. Keeps 8 Material stacks (60 gp), sell them by hand." Wheat (90 gp) is neither | The bag's "Equip upgrades" button | **Dead moment D.** A bought piece is not worn and the buy does not say so. "Junk" and "Material" are never explained; I could not tell what I would need later |
| 12 | 4 | | Town coach queue at Level 4: Plant your land, Back for Level 5, Out to the brook ("Safe to close the game: your hero keeps hunting"), Sell junk, Tamsin's wolves, Into the Thicket | Hunts, the Cellar, Enter | "Plant your land" comes before "Sell junk". "Into the Thicket" shows at Level 4; the Thicket is Level 5 |
| 18 | 5 | 730 gold, 222 gold of loot | The Cellar ends itself: "Ground outgrown at Level 5." The card's main press is "Go to Meadowbrook Thicket" | That press | **The best moment.** The promise ("Level 5 in about a quarter of an hour") lands and the next ground is one press |
| 19 | 5 | | The Thicket's page: Normal, Dangerous, Deadly, "Low risk". Nothing offers Tamsin's wolves here; her card was three cards back in the queue | Enter | Thin: a task taken once per ground by hand |
| 20 | 5 | | In the hunt: "Try a rune spell. Press slot 6, Spells, Frost Slam, Plain Ice Rune" | I pressed slot 6 and Spells | **Dead moment E, a broken step.** Frost Slam is locked ("Melee 12"; Wren had Melee 6) and it is a party-only tank spell. Root cause: `hunt-tutorial.js` SAY.first_spell picks the first rune spell of the worn weapon and reads neither `unlock` nor `party`; Frost Slam joined the shield's list on 11-19. Every sword and shield hero, the default look, meets it |
| 28 | 5 | 16 food | "Food eaten. Cook more Cooked Shrimp before it runs out", then "Eat on time: press slot 3 and slot 4, set both to 50% HP" | Nothing; the hunt goes on | Thin: "cook more" names no window |
| 38 | 6 | 1,030 gold | Summary: +7,439 Level XP, 21,773 an hour, +489 gold. Next buy: Leather Gloves (160 gp). Hunt again | Hunt again | The loop from here is one press, forever |

**Walk-through check of the coach's chain against the start kit** (each step doable from the steps before it):

| Step | Needs | Has it | Doable |
|---|---|---|---|
| Take Giant Rats | Tamsin's board, slot free | yes | yes |
| Mill Cellar, Enter | Level 1, stamina, food | 12 h, 20 Cooked Shrimp | yes |
| Leave, collect | 25 rats | yes at minute 10 | yes |
| Equip, Bless | a Bronze Helm, free Blessings | Tamsin paid the helm; free to Level 30 | yes |
| Sell all junk | the Shop, junk stacks | yes | yes |
| Plant your land | Turnip Seed, an empty plot | 8 seeds | yes (not pressed in this play) |
| Into the Thicket | Level 5 | at minute 18 | yes; the card shows one Level early |
| **Try a rune spell: Frost Slam** | Melee 12, a party | Melee 6, alone | **no** |
| Eat on time | slots 3 and 4 hold food | yes | yes (not pressed) |
| Decide once (loot plan) | loot in "This hunt" | after the first long hunt | yes |
| Build your home | 20 Copper Ore, 30 Normal Log, 400 gold | none, none, yes | yes, by leaving the hunt; no count, no way back |

### 2. The chase by horizon

Rows are who is at that Level. On today's slot prices an account is one hero to about Level 31, and on the economy dive's ladder A about 33, so **the New player and the Own four are the same player until then**. Premium own four reads as Own four everywhere (Premium adds nothing to a chase today). Buyer and Ceiling read as Heavy four unless said. EMPTY means the screen named nothing; THIN means one thing, weak.

| Level | Who is here | This session | This day | This week | This month |
|---|---|---|---|---|---|
| 5 (hour 0.3) | Everyone, alone | The Thicket, a Level in 20 minutes, Tamsin's 200 wolves | Level 7 or 8: Wickstead opens, the first Dangerous offer, the Graypelt Cloak | Level 10: the Tower's door. THIN: the Level clock is 4 hours a Level by then | The second hero (300,000 and rising). Named on the Characters screen. 280,000 away |
| 5 | Four friends | The same, and the Party window says a same-weapon four earns less (CITED 25) | The Sewer as a four (RULED from Level 5) | The Rat King, his Hall | A four from day one for nothing |
| 17 (hour 13 to 25) | New and Own four, alone | A Level every 1.5 to 2 hours on the Glade | **EMPTY.** One ground for fifteen Levels (16 to 31). Tamsin has one Glade task. The Tower alone stops near floor 20 to 40 | THIN: the Leaderboards card (Level 16) and Level 25. Gear: tier 3 from drops, no named step | The second hero at about Level 31 to 33. That is 40 to 50 more lone hours |
| 17 | Heavy four, Buyer, Ceiling (bought slots early) | The Warrens as a four from Level 10 (REAL: 32% of all hours) | Chief Coppercap, keys | The Tower to Silver and Gold landings | Level 50 |
| 17 | Four friends | The Sewer or the Glade's harder tiers | The Rat King's Hall, Call out at 10 wins | Level 25 to 30 together. THIN: needs four people online at once (CITED 25) | The Warrens |
| 30 | New and Own four, alone | The Glade's last Level, 3.3 hours | THIN: the Warrens says "party" until 36 | The second hero. The first real gold decision | A pair, then a third |
| 30 | Heavy four | A Level in about 2 hours | The Warrens on Deadly | Tempering at tier 3, House rooms | Level 50 to 60, the Platinum landing |
| 30 | Four friends | As the Heavy four, slower | | A second hero each, or stay four | |
| 60 | Own four (a four from about Level 50) | A Level in about 3 hours, the Slake or the Barrows | The weekly Tower climb (30 minutes, CITED 22) | Tempering at tier 5, a room rung | Krell at 85. The Castle (2.5M). THIN for this player: it holds 2.09M and wants nothing (REAL) |
| 60 | Heavy four, Buyer | The same in a third of the days | Refills | The chest's six opens | Krell's Hold |
| 60 | Four friends | The Barrows as people | | THIN: nothing a four of people can do that an own four cannot (CITED 25) | |
| 110 | Heavy four, Ceiling, Buyer (the only ones here by month 1) | A Level in about 6.5 hours on Krell's Hold | **EMPTY.** The Tower is walled near floor 160 (CITED 22) | THIN: a 2% chest roll for +1 to +2.6% (CITED 22) | **EMPTY.** The open game ends at 110. The Morrow Hills are staged |
| 110 | Own four (month 4 to 6) | The same | EMPTY | Tempering's last rungs | EMPTY |
| 150 | Nobody (FORMULA) | Staged grounds only | EMPTY | EMPTY | EMPTY: Luck and the Bestiary are the only chase designed for here, and neither is built |

**Reading it.** Level 5 is full. The known nothing-to-chase point at Level 17 is real and it is a *day and week* problem for a lone hero: the session works, the month has a name (the second hero), and nothing sits between. That is where the Bestiary's stages (change 4) and Tamsin's board should carry the day, and where the home dive's re-spaced deeds (25,000 and 150,000) give gold a week. At 110 and past it, everything is empty for the players who get there first, which is the endgame and items dives' ground; what retention adds there is Luck, the weekly boards and the Trophy reveal.

### 3. Away and return (PLAYED twice)

**A hunt left running for 8 hours.** The Characters screen first: "Wren. Level 9, hunting in Meadowbrook Thicket. Play". Then the card:

> While you were away. Away 8 h 0 min. Wren, Meadowbrook Thicket. Level 6 to 9. Level XP +178,424. Gold +13,138 gp (13,482 gp in coins, 344 gp on supplies). Kills 3,118. Best find: Grayjaw's Ruff. Still hunting, 3 h 57 min of stamina left. [See the hunt] [OK]

It is true, it is short, and it is the best-written screen in the game. What it does not say: four better pieces were in the bag, 10,014 gold of loot was unsold, the bag was at 44 of 100, Wickstead had opened at Level 8 and the hero was still in the Thicket, and Tamsin's wolves had never been taken (3,251 wolves killed for nothing she would have paid for).

**The one press that carries on.** While the hunt is still running: none is needed. After it has ended: "Hunt again" on the card and on the summary, one press, straight back in (PLAYED). That part is right.

**What I redid by hand, one hero, one return:**

| Press | Count | Decided before? |
|---|---|---|
| Leave hunt (and a countdown of up to 12 s in a fight) | 1 | yes |
| Equip (4 better pieces) | 1 | yes: "wear what is better" never changes |
| Open bag, This hunt, set each item's plan | 24 dropdowns the first time, 0 after | decided once, good. Twenty-four separate decisions with nothing saying what any item is for |
| Back to the Bag tab, Dispatch loot | 2 | yes |
| Sell what the plan keeps "by hand" | 1 to 8 | yes |
| Tamsin's tally: open, Repeat or Take | 2 to 3 | yes |
| Hunt again (or Hunts, the new ground, Enter) | 1 to 3 | only a new ground is a decision |
| After a death: Shop, Services, Bless | 3 | yes |
| **A normal return** | **8 to 10** | **one of them is a decision** |

For the real player that is 32 to 40 presses across four heroes plus four hero switches, inside a visit of 2 to 5 minutes (ASSUMED: one hero's count times four). REAL agrees from the other side: 68% of hunts had no after-hunt choice set, and 59% of every hero's life is idle.

**A gathering job left running for 8 hours.** "Wren mined the Copper Rock. +6,001 Copper Ore, Mining 1 to 42. Still mining. [Open your inventory] [OK]". The job was started for 20 ore. Stamina was full the whole time. At Mining 42 four better rocks had opened and the hero was still on copper. The card has no press that goes back to the hunt, and What next said "Next step up: Mosslight Glade, Level 16" to a Level 9 hero.

**So the first principle fails in four named places:** the return's presses (change 1), a job with no count, a gatherer that never moves to the rock it has unlocked, and the loot plan as one dropdown an item (the 11-11 re-read's "sell gear worse than what you wear" is still not there: for dive 23).

### 4. The Bestiary

`node tools/balance-program/bestiary-hours.mjs` (new, this lane: party kills an hour from `ref.json` times each creature's spawn share from `src/data/hunts.js`; MEASURED x READ FROM DATA, an estimate because packs are authored). Stages are Luck v3.1's (RULED 11-20; counts per account).

| Point, seat | Kills an hour | The common creature: hours to 100 / 500 / 2,500 / 10,000 | The rarest spawn: hours to 100 / 2,500 / 10,000 | Whole ground to 10,000 on every creature | Luck that pays |
|---|---|---|---|---|---|
| Thicket 10, lone | 584 (PLAYED at Levels 6 to 9: 389) | 0.4 / 2.0 / 9.8 / 39 | 3.9 / 98 / 394 | 394 h | 8,800 |
| Thicket 10, four | 758 | 0.3 / 1.5 / 7.6 / 30 | 3.0 / 76 / 303 | 303 h | 8,800 |
| Glade 30, lone | 516 | 0.4 / 2.2 / 11 / 45 | 2.2 / 56 / 223 | 223 h | 11,000 |
| Glade 30, four | 2,336 | 0.1 / 0.5 / 2.5 / 9.8 | 0.5 / 12 / 49 | 49 h | 11,000 |
| Ford 50, lone | 350 | 0.6 / 2.9 / 14 / 57 | 3.4 / 86 / 343 | 343 h | 8,800 |
| Ford 50, four | 1,588 | 0.1 / 0.6 / 3.1 / 13 | 0.8 / 19 / 76 | 76 h | 8,800 |
| Hold 105, lone | 307 | 0.9 / 4.7 / 23 / 93 | 3.3 / 81 / 326 | 326 h | 11,000 |
| Hold 105, four | 1,174 | 0.2 / 1.2 / 6.1 / 24 | 0.9 / 21 / 85 | 85 h | 11,000 |

- **How many hours is a ground's Bestiary?** Three answers. Its first three stages on its common creatures fit inside the hours a hero spends in the band anyway (10 to 25 lone hours; a band is 30 to 60). The 10,000 stage on every creature is 220 to 390 lone hours or 50 to 85 for a four, long after the ground is outgrown, so its consumer is scaled hunts (switched off today, CITED 22). The last two stages (40,000 and 160,000) are 900 to 6,300 lone hours for a rare spawn: a forever line, and fine as one.
- **What does finishing give?** Today: nothing a player can see. One line on the sheet counts creatures met. `src/data/bestiary.js` holds a second, older ladder (2,500 to 20,000 kills for +1 to +3% drops and +1% damage against that monster) that the server derives and no screen shows; the home dive found the Trophy room sells mounts for it. On v3.1: about 8,800 to 11,000 Luck a ground to the fourth stage, which is Magic Find 5 to 6 from one ground and about 14 from all eleven (the bar costs 100 x n squared). All six stages on all 55 creatures is 1.22M Luck, about Magic Find 32 (FORMULA).
- **Why build it first.** The first stage of the first creature lands in the first Thicket hunt. Stages then come at 0.4, 0.5, 1, 2, 2.5, 4, 5, 10, 12 hours: a reward clock that speeds up exactly where the Level clock slows down. It is the cheapest fix for the Level 7 to 10 stretch that needs no new content.
- **Per character or per account.** RULED 10-22 "per character" and RULED 11-20 "counts per account"; the newer wins. The sheet's line is per hero today.

### 5. The Roll of Honor

READ FROM DATA (`src/data/honor-roll.js`): 16 boards, top 25 shown. Level, Total level, five fighting skills, four gathering, four crafting, Gold Given (accounts, resets monthly). PLAYED: "1 hero on this board. Rank: 1st of 1."

| Board today | Ruling | Why |
|---|---|---|
| Level | **Keep, two views:** "this week" (Level XP gained since Monday 00:00 UTC) is the default, "all time" is the hall | The all-time roll is closed to a newcomer by month 1 (the Heavy four is Level 75 in 14 days). XP gained this week can be won by anyone who plays the week |
| Total level | **Keep, all time only** | It is breadth, it moves slowly, and it is the semi-idle side's one board |
| Melee, Ranged, Magic, Defense, Inner Flame | **Merge into one "Combat skills" board**, weekly, with the skill as a filter | Five boards rank the same heroes in the same order as Level |
| Woodcutting, Mining, Fishing, Farming, Cooking, Crafting, Smithing, Runecrafting | **Merge into one "Trades" board**, weekly, skill XP gained, the skill as a filter | Eight boards capped at 99 are full for ever once 25 heroes reach 99. Weekly XP gained is the only form that stays open |
| Gold Given | **Keep** as built (monthly, accounts) | Already resets. The economy dive holds its merge with the Town Works |
| (new) Tower | **Add**, weekly best floor, when the endgame dive's curve lands | CITED 22: "the board moves with every Level" |
| (later) Clans | Weekly standing per active member (CITED 25) | A race a new clan can enter |

Rules for all of them (PROPOSED): no prize that is gold, an item or power (a ranked surface with alts and four heroes is a faucet the day it pays); the reward is the line, and at most a title for a week's first place. At 10 online a board with one name on it shows the hero against its own last week ("this week 178,424 Level XP, last week 0") so it says something to a player alone. Server: one snapshot of the ranked table a week, and weekly is today's value less the snapshot; nothing on the settle path. Brackets by Level are the alternative and cost more boards, not fewer.

### 6. Live events

READ FROM DATA (`src/data/live-events.js`): the Bonus XP weekend is +25% Level XP a kill on every ground, 72 hours every 14 days, from 2026-11-20 12:00 UTC. Open Halls waives a Call out's gold fee for 12 hours every 7 days. The dial's range is 1000 to 1500 and two live rows add.

- **Class: Multiply.** It multiplies with tier, party and the solo boost. On the combat dive's numbers a Deadly mixed four is 1.8 to 2.6 times the contract in the harness and about 3.0 in real play; the weekend makes that 2.3 to 3.3 and 3.75. The model's cap (2.0 proposed, 2.5 on the combat dive's recommendation) is broken before the event and further with it.
- **The cap (for dive 21 to hold with me).** Three lines. (a) The dial's range becomes 1000 to 1250: an XP event is never above +25%, one row or several. (b) The amortized value of all XP events stays at or under 5% of pace, half the curve's 10% tolerance: today 72 of 336 hours at +25% is +5.4% for a player who plays evenly, already over; monthly it is +2.5%. (c) An event never carries a tier's or a party's share: it applies to the kill's base XP beside them, so Deadly's +20% and the weekend's +25% read +45%, not +50%. Refills are the Time class times this lever: an account that saves its six refills a day for the weekend moves 44% of its fortnight's hours under the bonus (ASSUMED 8.4 h a day normally). The economy dive's refill step prices that.
- **What an event is for on a server of 10.** A date. A known day on which the few people there are all online, on one ground. A world-wide +25% does not do that; it pays everyone, wherever they are, including the four heroes of one person. So the fortnightly slot becomes a **ground's weekend** (the type's scope already takes ground ids): the Sewer, then the Warrens, then the Barrows pay +25% for 72 hours. It is the party finder's one busy moment and the natural home of the social dive's standing parties. The world weekend stays, monthly.
- **On a server of 10,000.** A shared beat and a load spike. Everyone hunts the same 72 hours; the platform dive should size the settle shards for the weekend's concurrency, not the average's. A ground-scoped event also spreads players onto a named ground on purpose, which is what a crowded server needs.
- **Played.** A new account made during the weekend reaches Level 5 in 17 minutes with it and reads "Experience bonuses: None right now" on the Character sheet in town while the plate says "+25% Level XP". The first-day pace must be measured and promised without an event.

### 7. Rare moments at month 1

READ FROM DATA (`src/data/loot-bands.js`): the server reveals the `rare` and `trophy` bands. A Rare item is tuned to 10 to 20 hours each and a ground holds 8 to 11 of them, so a Rare-band drop comes every 0.5 to 2 hero-hours (REAL agrees). A Trophy is 100 to 150 hours a hero on its boss. The Very Rare band (60 to 90 hours) is RULED 11-20 for grounds past Krell and not built. Hours are the reference players' of `01-model.md`; the boss share of hours is ASSUMED.

| Player | Hunted hero-hours in month 1 | Rare-band "reveals" (today) | Trophy drops | Very Rare (once built) | What the player actually sees |
|---|---|---|---|---|---|
| New (2 h a day, alone) | 60 | 30 to 120 | 0: no boss a lone hero is sent to | 0 | A float over a hero nobody is watching, then "Best find" on the card |
| Own four (3.3 h a hero) | 396 | 200 to 800, 7 to 26 a day | about 1 (a third of hours on a boss ground, ASSUMED) | 0: under Krell | Twenty "reveals" a day unseen; the one Trophy is one of them |
| Heavy four (8.4 h) | 1,008 | 500 to 2,000 | about 4 | 0 to 2 (it reaches Krell near day 20) | The same, more often |
| Premium own four | 396 | as Own four | about 1 | 0 | |
| Ceiling (24 h) | 2,880 | 1,400 to 5,800 | about 11 | 6 to 10 | |
| Buyer | 1,008 | as Heavy four | about 4; buys the rest | 0 to 2 | Nothing a drop can be bought into except by trade |
| Four friends (3.3 h each) | 99 each | 50 to 200 each | about 1 between the four | 0 | The party's rare roll decides whose it is: the one watched moment today |

A thing that happens twenty times a day while the player is away is not a moment. With the reveal kept for Trophy and Very Rare (the audit's change 6), the Own four sees about one a month and the Heavy four about one a week, and **the reveal has to wait for the player**: the first thing on the return card, before the numbers, with the share card one press away. The server line to everyone stays for Trophy only (today's rule is 3 a hero a day for any Rare).

### 8. Teaching: where a blind player first meets every live system

Level and screen of first contact. PLAYED rows were met in this play; READ rows come from the coach's own rows (`src/data/hunt-tutorial.js`) or a window not reached; "never" means nine hunted hours did not surface it. The other dives fill requirement 10 from this.

| Domain | System | First met | Screen and words | Dead moment |
|---|---|---|---|---|
| combat | hunts | L1, min 1 (PLAYED) | Hunts, "Press the Mill Cellar, then Enter" | "Leaving now..." up to a settle |
| combat | combat-engine | L1 (PLAYED) | "Fights on its own" | none |
| combat | level | L1 (PLAYED) | "Kill monsters to fill the ring around your Level" | Levels 8 and 9 at four hours each, never explained |
| combat | combat-skills | L4 (PLAYED) | Summary: "Melee 1 to 5, Defense 1 to 3"; Book, Skills | none |
| combat | inner-flame | L9 (PLAYED, sheet only) | Sheet: "Inner Flame 1. Recovery +1.9%". Coach card once a hero carries 10 fuel (READ; I had 8 after the Cellar) | The loot plan lists Bones with Keep, Deposit, Sell and no word that they are fuel. I sold 1,461 before the card could show |
| combat | weapon-roles | L0 (PLAYED) | Creation screen; bag card "Weapon sets the style" | none |
| combat | action-bar | L1 (PLAYED) | "Press a slot to change what it does" | The Configure window lists 23 spells of every weapon to a new hero |
| combat | spells-runes | L5 (PLAYED) | "Try a rune spell" | **Broken for sword and shield** |
| combat | tank-runes | L5 (PLAYED) | The same card offers Frost Slam to a lone hero | Party only, Melee 12 |
| combat | elements | never | Not on any screen I reached | Unmet in 9 hours |
| combat | monsters | L1 (PLAYED) | Hunts page, Enemies, with Level and how common | none |
| combat | monster-spells | never | | Unmet |
| combat | difficulty-tiers | L5 (PLAYED) | Thicket page: Normal, Dangerous, Deadly, "Low risk". Coach "Try Dangerous" at Level 8 | none |
| combat | grounds-live | L1 (PLAYED) | Hunts list, eleven grounds with bands and "Above level" | What next and the end card name different next grounds at Level 9 |
| combat | death-blessings | L4 (PLAYED) | Summary: "Bless I, II and III. Free until Level 30" | What a Blessing does is not said there |
| combat | stamina | L4 (PLAYED) | "Safe to close the game: your hero keeps hunting", the clock ringed | none |
| endgame | tower | L1 in the Town menu (PLAYED); coach at Level 10 (READ) | Menu line "Burning Tower" | Shown nine Levels early with no word |
| endgame | hearth-chest | L1 in the Town menu (PLAYED) | Menu line "Hearth Chest" | The same |
| endgame | bosses-halls | L1 (PLAYED) | Tamsin's board: "The Rat King, 5 times. The Sewer, Level 5, party" | none |
| endgame | boss-calls | L5 (READ) | The Sewer's page: Call out, "Requires 10 Rat King wins" | not reached alone |
| endgame | scaled-hunts | L1 (PLAYED) | Cellar page: "Scaled hunt. Unlocks at Level 9" | Switched off (CITED 22): a promise on the first page that does not open |
| items | items-catalogue | L4 (PLAYED) | Summary, Top loot | Items never say what they are for in the loot plan |
| items | gear-tiers | L4 (PLAYED) | "Equip 1 better piece" | none: the best-taught system after hunts |
| items | loot | L9 (PLAYED) | "Decide once: press This hunt, then set one item to Sell" | 24 dropdowns; Dispatch is on another tab |
| items | tempering | never | Shop, Services (CITED 24: one real person found it) | Unmet |
| items | jewelry | L4 (PLAYED) | Shop gear list: Copper Ring, Banded Signet | none |
| items | trophies | never | | Unmet |
| items | patterns | never | | Unmet |
| items | bag-equipment | L4 (PLAYED) | Inventory, "Equip upgrades" | A bought piece is not worn |
| items | gathering | L1 icon; coach at Level 7 (PLAYED) | "Build your home: Gather Copper Ore: 0 of 20" | No count, no way back to the hunt |
| items | cooking | L5 (PLAYED) | "Food eaten: cook more"; "Cook your catch" in town | The first names no window |
| items | smithing | L9 (PLAYED, Skills list) | "Smithing 1. Lv 3: Bronze Axe" | Never pointed at |
| items | crafting | L8 (PLAYED at 9) | "Stitch a cloak" | none |
| items | runecrafting | L7 (READ) | "Make your own runes" | Same as gathering |
| items | artisan-engine | L9 (PLAYED) | Skills window: "4.8 s, 8 XP, about 750 an hour. Runs offline until stopped or a hunt starts" | none; a clear screen |
| economy | purse-ledger | L1 (PLAYED) | "Gold: 500 gp" in every window | Gold history never met |
| economy | income | L4 (PLAYED) | Summary: "72 gp in coins, 10 gp on supplies" | none |
| economy | store-supplies | L1 (PLAYED) | Hunt prep: "Food: 20 Cooked Shrimp, then Salted Shrimp (14 gp)" | none |
| economy | shop | L4 (PLAYED) | "Next buy", Show | Unsold loot has no press on the card |
| economy | market | L1 in the Town menu (PLAYED); card at Level 10 (READ) | Menu line | Closed on a new server (CITED 24) |
| economy | gold-sinks (Crier, rounds, powders, titles, setups) | L9 for titles (PLAYED) | Character, Titles: "Ratcatcher. Rats: 79 of 2,500" | The first title is 2,500 rats in a ground that ends at Level 5; a title's price is hidden until the kills are done |
| economy | hero-slots | L6, on return (PLAYED) | Characters screen: "Second hero slot: 300,000 gold. Need 298,970 more" | What next says "Invite a friend or create a second hero" at Level 4 |
| economy | tally | L1, the first press (PLAYED) | Tamsin's board | A new ground's task is taken by hand each time |
| economy | town-works | never | | Unmet |
| economy | stamina-refill | L1 (PLAYED) | The "+" beside the stamina clock | none |
| economy | premium | L1 (PLAYED) | Analyzer tabs marked Premium; outfits "Premium" | Everyone is Premium in the beta, so it is never met as a choice |
| economy | outfits | L0 (PLAYED) | Creation colors; Character, Outfit | none |
| social | parties | L6 (PLAYED) | Characters screen: "Group with other players: Party, Find a party" | CITED 25: the first party is told it earns 55% less |
| social | chat | L1 (PLAYED) | "0 online" in the town's corner | Closed for a new account (CITED 25) |
| social | friends | L1 menu (PLAYED) | Social menu | never pointed at |
| social | town | L1 (PLAYED) | The first screen: Havora, the Hearth, Tamsin's board | Nobody else in it |
| home | house | L4 (PLAYED) | What next: "Buy the Hearthside Homestead in the House" | No price on that line; it shows in minute two if cards are cleared |
| home | rooms (eight) and room-perks | L9 (PLAYED) | House window: "Opens with the Hearthside Homestead" | none yet |
| home | benches | L9 (PLAYED, Skills) | Skills window | none |
| home | storage | L9 (PLAYED, House) | "Millrace Crate, +20 stacks, 1,500 gp". Coach when the bag is 80% full (READ) | none |
| home | farming | L4 (PLAYED) | "Plant your land. Town, Farm, Plant Turnip Seeds" | Offered before Sell junk |
| home | training | L1 (PLAYED) | Hunts page, "When the hunt ends": four "Train ... at the yard" lines | Four paid choices on the first hunt page, unexplained |
| retention | first-hours | L0 | this dive | |
| retention | what-next | L1 if cards are cleared, else about L4 (PLAYED) | "What next" with "More" | Only speaks with every window shut |
| retention | wiki | L1 icon (PLAYED) | Book: Chronicle, Skills, Hunting grounds, Formulas | Never pointed at in 9 hours |
| retention | lore | L1 icon (PLAYED) | Book, Chronicle: "2 of 13 pages found" | The Cellar's page stayed shut |
| retention | away-return | L6, first return (PLAYED) | "While you were away" | Shows the past only |
| retention | analyzer | L1, second 6 (PLAYED) | Hunt analyzer, "Per hour: after 10 min" | none |
| retention | bestiary | L9 (PLAYED) | Sheet: "8 of 55 creatures slain" | A count that opens nothing |
| retention | leaderboards | L1 menu; card at Level 16 (READ) | "Rank: 1st of 1" | |
| retention | live-events | L1, first second (PLAYED) | Plate: "+25% Level XP, ends Mon 6:00 AM" | Sheet says "None right now" |
| retention | rare-moments | L9 (PLAYED) | Away card: "Best find: Grayjaw's Ruff" | The reveal itself was never seen |
| retention | settings | L1 menu (PLAYED, not opened) | Menu, Settings | |
| retention | discord-gift | never | No screen | Dark |
| platform | accounts | L0 (PLAYED) | Sign-up, the Characters screen | none |
| platform | moderation | L1 menu (PLAYED) | Menu, "Report a problem" | |
| platform | settle-engine, envelope, access, operations, content-tooling | no player surface | | |

**What the game should teach sooner** (REAL: the same person's second account was twice as fast). The knowledge is four facts, and each has a named place:
1. *You can go under-Level and it pays.* The Glade five Levels under paid three times the Thicket (CITED 11-11 re-read). Teach at Level 8 with the Dangerous card, which exists.
2. *Sell and wear every time.* One press on the card (change 1).
3. *A hero that is not hunting should be doing something, and come back.* Changes 1 and 3.
4. *Your second hero changes the game.* It is 300,000 and rising; the Characters screen says so honestly. Until then the party is other people, and the social dive holds that.

### 9. Telemetry: the launch dashboard and the daily ten

One number a system. Rows for dives 22, 24, 25 and 26 are copied from their requirement 13 (CITED from each branch); dives 21, 23 and 28 had not pushed a finished file when this was written and are left for synthesis.

| Dive | System | The number | Target, red line |
|---|---|---|---|
| 27 | first-hours | Hunted hours to Level 10 for a new account's first hero | 6 (RULED); red over 9 |
| 27 | first-hours | New heroes that sold anything by their second hunt | over 80%; red under 50% |
| 27 | what-next | Accounts whose purse is over 20 times their largest buy of the week | under 10%; red over 30% (gold with nowhere to go) |
| 27 | wiki | Book opens a new account in its first day | read only; no target |
| 27 | lore | Chronicle pages open a hero by Level 10 | 3 or more; red at 2 (the Cellar bug) |
| 27 | away-return | Idle hero-hours as a share of hero life | under 30%; today 59% (REAL) |
| 27 | away-return | Returns that end with every hero hunting or on a job, within 2 minutes | over 70% |
| 27 | analyzer | Personal bests beaten a hero a week | at least 1 under Level 50 |
| 27 | bestiary | Stages reached an account a week | 3 or more under Level 30; red at 0 for a hunting account |
| 27 | leaderboards | Distinct heroes in a weekly top 25 over four weeks | over 60 at 1,000 online; red if under 30 (the same names) |
| 27 | live-events | Level XP earned under an event as a share of all Level XP | 5% or less; red over 10% |
| 27 | rare-moments | Reveals a hunting hero a week | 0.2 to 1; red over 3 (it is noise again) |
| 27 | settings | Accounts with tips switched off before Level 5 | under 15%; red over 30% (the coach is in the way) |
| 27 | old-server-leftovers | Rows in the five tables after the cut | 0 |
| 22 | tower | Heroes with a climb over heroes past Level 10, weekly | over 50%, red under 20% |
| 22 | hearth-chest | Share of opened pieces ever worn | red under 20% |
| 22 | bosses-halls | Halls opened a week by heroes past 85 | red at 0 for a week |
| 22 | boss-calls | Calls by boss a week | a boss at 0 for two weeks |
| 22 | scaled-hunts | Scaled hours bought a week | red at 0 once the switch is on |
| 24 | purse-ledger | Repeating sinks as a share of gold in | 35 to 50%; red if purses grow 5% a week for four weeks |
| 24 | income, loot | Accounts with a loot rule by hour 2 | over 80% |
| 24 | store-supplies | Store bill as a share of coin on Deadly | red under 30% |
| 24 | shop (Tempering) | Tempering buyers over accounts past Level 30 | over half |
| 24 | market | Sales a day to real accounts | red at 0 once open |
| 24 | hero-slots | Hunted hours to the first slot; share that quit before it | 60 to 75 on ladder A; red if over half stop |
| 24 | tally | Pays a hero a day | 0.4 of 3 today |
| 24 | town-works | Weekly active accounts that gave | 4 to 10% |
| 24 | stamina-refill | Refills 5 and 6 as a share of all refills | red over a quarter |
| 24 | premium, crowns | Premium accounts over weekly actives; gold paid a Crown | after the beta switch is off |
| 25 | parties | Hunt hours with two or more accounts over all party hours | 25% under Level 30; red under 5% |
| 25 | chat | Accounts with a line a day over accounts online | 30%; red 10% |
| 25 | friends | Friend links an account at day 7 | 1.0; today 0.2 |
| 25 | clans | Accounts in a clan at day 7 | red under 20% |
| 26 | house | Each deed bought by half the accounts that reach its Level within two weeks | red: a tier nobody buys for 14 days |
| 26 | farming | Accounts past Level 10 that harvest 5 days of 7 | red: beds owned and no harvest for 2 days |
| 26 | storage | `bag_full` refusals a day | red: an account at 100% of the depot |
| 26 | training | Training hero-hours a day | a tenth of idle hours; red at 0 for a week |
| 21, 23, 28 | | to be added from each dive's requirement 13 | |

**The daily ten** (the vitals page a person reads every morning; each is one query on the journal):

1. New accounts, and the share that reached Level 5, sold something, and came back on day 2.
2. Hunted hours to Level 10, the median of this week's new heroes.
3. Where heroes stopped: the Level histogram of accounts with no press in 3 days.
4. Hunted hours a hero a day, and idle hero-hours as a share of hero life.
5. Returns that needed more than 10 presses before every hero was busy.
6. Deaths per 100 hunted hours, alone and in a party, under and over Level 16.
7. Gold in and gold out an account-day, and purses over 20 times their largest weekly buy.
8. Hunt hours shared by two or more accounts.
9. Stages, Trophy reveals and personal bests a hunting hero (the reward clocks other than Level).
10. Refused intents by verb, and any loop system at zero for two days (question 8 of the rulings).

### The zero list (CLAUDE.md §3.4), with a ruling for each

REAL: `10-real-players.md` section 6, and the vitals rows of 2026-11-17 to 11-20 (two to four accounts a day).

| System at zero for two days or more | Days | Class | Ruling |
|---|---|---|---|
| **Town Crier (cries)** | never | crowd | **KEEP, and not a P1 under 50 accounts a day.** A paid line to the whole server has no reader at two online. Read it when there is a town |
| **Action bar setup slots (paid)** | never | shelf | **KEEP. Fix the vital, not the feature.** Eighteen free setups are saved across five accounts; three are free; nobody needs a fourth with one to four heroes. The vital should count setups saved and switched, which is the feature |
| **Titles** | never | shelf | **FIX.** PLAYED: the first title is 2,500 rats, and the whole Cellar is 79. The price is hidden until the kills are done. Give each ground's first title a count a hero reaches while the ground is in band (the Thicket's at about 1,000 wolves, three hours) and show the gold price beside the count from the start. Owned by dive 24's gold-sinks card |
| **Hero colors (paid change)** | never | shelf | **KEEP.** Sixteen colors for four regions are free at creation (PLAYED), so a paid change is for a player who has changed their mind. Read weekly at 1,000 accounts |
| Shop: buying | 0 on three of the last four days | loop | **P1, and it is this dive's finding.** Nothing between 220 gold and 300,000 is named. Economy change 2 and my what-next card |
| After-hunt plan | 68% of hunts unset | loop | **P1.** Change 1 |
| The Hearth's fuel, bones | 15 and 25 | loop | **P1 for dive 21** (it recommends bones burn by a loot rule; I agree: the loot plan never says bones are fuel, and I sold 1,461 of them through it) |
| House rooms, deeds | 3, 10 | shelf | For dive 26: both far accounts are at rung 4; the shelf is bought out, not ignored |
| Hero slots | 13 | shelf | Bought out by the two who buy; out of reach for the two who quit. The slot ruling is Tyler's (11-20) |
| Farm plot upgrades, Storage chests, the dummy, Blessings | 5, 11, 4, 3 | shelf | Not P1: one-time buys on accounts that hold them |
| Boss called out (paid) | 11 | shelf | For dive 22 |
| Market buying, renames, Hallmark fees, training items, scaled hunts | never | crowd, shelf | Market: crowd. Scaled hunts: the switch is off (CITED 22). Hallmark fees: for dive 23 (150,000 has never been paid) |
| Parties with another person, the finder, whispers, friends | never | crowd | For dive 25. The one real zero that is a design finding and not a population one |
| Meals (pies, chowder, soup) | 19 to 27 | loop | For dive 23: plain fish is what gets eaten |

### 10. The old server leftovers

Read from the replayed chain and the engine. **Is anything feeding renown? No.** `src/core/perks.js:318` records its removal on 2026-10-14 ("renownAllXp ... deleted. normalisePerkState no longer reads the three fields, so an hr_perks_of that still returns them pays nothing"). The `allXP` channel in `src/core/progression.js:160` still lists renown in a comment, and `tick.js:1122` still reasons about `hr_renown_of`; both are stale words over a function that pays nothing.

| Leftover | What is still there | What it costs today | Cut |
|---|---|---|---|
| Bounties | `active_bounty`, `hr_bounty_board_monsters`, `hr_bounty_monsters`, nine `hr_bounty_*` functions | Nothing runs. Tamsin's tally replaced them | Yes |
| Workers | `player_workers` | Nothing runs. Hired gatherers would also sell town hours, which the model books as a hero's own | Yes |
| The collection log | `hr_collection_of`, the switch `collection_log`, the `ev:loot:<item>` counters, and a counted read of `hr_collection_of` in a savepoint on the engine's request path (`hr-accrue/index.ts:742`) | **A read on the request path and counter rows written for a screen that does not exist.** For dive 28 to size | Yes, unless Luck's found-only safeguard needs the counters (dive 23 says) |
| Renown | `hr_renown_of`, three stale comments | Nothing | Yes |
| Traits | `hr_traits`, the unlocks `trait:auto_eat` and `trait:auto_eat_2`, and **`hr_trait_buy`, a client RPC still granted with no screen** | A callable purchase on a dead feature. Goes on the pre-EA Security list until cut | Yes, the grant first |

### 11. Game modes: what the model must not do now

Ironman, Hardcore and Group are after launch (RULED). Six things that would close them off:

1. **No step of progression may need another account.** A Level, a ground, a gear tier or a recipe that can only come through the market, a trade, a clan store or a commission cannot be played self-found. Crafted jewelry is fine because a hero can train the bench itself. The castle's goods and any market-only item are where this breaks first.
2. **Death stays one rule read from the hunt's mode.** The Tower already takes nothing for a death through `session-modes.js`. Hardcore is another row there. Do not write 6% or the Blessing shares anywhere else.
3. **Do not assume a mode is a hero's.** The purse, Storage, the House, the Farm, the Luck bar and the Bestiary are the account's. A mode hero on a normal account would be fed through all six. Either modes are per account (my recommendation, ruling 9), or every one of those tables needs a mode in its key before any of them grows.
4. **One predicate for "may this account trade".** The market, the Crowns book, player trade, parties' loot rolls and the clan treasury should all ask the same server function. The walled Game Master account already needs it; build modes on that wall, not on five separate checks.
5. **Boards carry a mode.** `leaderboard_ranked` should take a mode column when the weekly snapshot is added, so a Hardcore roll is a filter and not a second system.
6. **Group mode is a fixed set of accounts with one store.** That is the clan's roster and depot at size four. Whatever the social dive builds for a clan's shared store should not assume more than one store a player.

---

## The cards

Each card answers the thirteen requirements of `02-requirements.md` in order.

### first-hours: FIX

| # | Answer |
|---|---|
| 1 Purpose | Problem: a player who has never played an idle MMO does not know the loop. Decision: none of its own; it makes the first real ones (style, ground, what to sell) informed. Plugs into every live system. At hour 100 it is silent (cards stop at Level 26, `WANT_BELOW`), which is right |
| 2 First principle | A second hero is not asked the lessons again (`knowledge` cards, KNOWN_LEVEL 5): good. Repeated by hand: "Got it" on every card; Tamsin's task on every new ground |
| 3 Ledgers | Attention: roughly 35 to 45 presses in the first 30 minutes (counted from the walk, not logged). Gold: 500 a new hero, once. Items: the start kit, worth 314 gold at the Shop (PLAYED, "Worth: 314 gp") |
| 4 Power budget | None beyond the kit. Blessings free to Level 30 cut a death from 6% to 1.5% for the players who die most (RULED) |
| 5 Seven players | New: all of it, once. Own four and Heavy four: heroes 2 to 4 skip the lessons. Four friends: the party cards. REAL: 5 accounts made a hero; all came back on day 2; two stopped at Levels 7 to 9. Presses: none a day after the first week |
| 6 Server cost | `hr_mark_seen` on a read card; the facts ride the envelope the client already has. Nothing on the settle path (READ FROM DATA, `tutorial-sections.js`) |
| 7 Population | Works with nobody online. The "Hunt together" and Weighhouse cards point at systems that are empty at 10 |
| 8 Server age | The same on day 1 and month 6. At month 6 the Weighhouse card is finally true |
| 9 Exploits | OPEN for Security: is the 500 gold and the kit granted once a slot or on every creation? If a hero can be deleted and made again, it is a faucet of about 800 gold a cycle. Not tested here |
| 10 Teaching | Question 1 and the table of question 8 |
| 11 Throughput | 53 cards, hand-written, each proven by `tests/hunt-core/sewer.mjs tutorial-walk-through`. About an hour a card. The walk-through did not catch Frost Slam because the card's spell is picked at run time |
| 12 Monetization | None. Premium is not explained in the first hours and every hero is Premium in the beta |
| 13 Telemetry | Hunted hours to Level 10 (target 6); new heroes that sold by their second hunt (target over 80%); tips switched off before Level 5 |

Uniqueness and fun: the first 18 minutes are a thing a player would describe ("it plays itself and then the cellar kicks you out because you outgrew it"). Rulings: 10-22 styles on the creation screen COMPLIES; 10-25 teach the bar during combat COMPLIES except the rune spell card BREAKS; 10-25 "the whole loop: selling loot" OPEN (the card can be cleared and the summary has no sell press).

| Change | Systems | Ledgers moved | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| The rune spell card skips a spell that is party only or above the hero's skill | first-hours, tank-runes | attention | S | no | first hour | PLAYED; `hunt-tutorial.js:967` |
| The Level 7 home and rune cards wait for the first stamina end and say "when stamina runs out"; a gathering card names its count | first-hours, gathering | hunt hours, town hours | S | no | first week | PLAYED; REAL P4 |
| "Got it" on a card the server finishes means later (it returns next visit); a card never shows before its ground's Level | first-hours | attention | S | no | first hour | PLAYED, dead moment A |
| The summary says what a Blessing does, and holds a "Sell junk for N gp" press (with dive 24) | first-hours, shop | gold | S | no | first hour | PLAYED; REAL P3 |
| The Town menu shows what the hero can use; the Tower, the Chest, the market and Training appear at their Levels (to the Art Director) | first-hours | attention | S | no | first hour | PLAYED |

### what-next: FIX

| # | Answer |
|---|---|
| 1 Purpose | Problem: "what do I do now?" Decision: which of the open goals to take. Plugs into grounds, gear, the House, Tamsin, skills. It matters more at hour 100 than at hour 1 |
| 2 First principle | Nothing repeated. It only speaks with every window shut and no card up, so a player who lands on the Hunt summary never sees it |
| 3 Ledgers | None. It points at gold sinks and hunt hours |
| 4 Power budget | None |
| 5 Seven players | PLAYED at Level 4: "Take a task on Tamsin's tally. Buy the Hearthside Homestead in the House. Next gear at Level 8: Graypelt Cloak, made in Crafting. Next ground: The Sewer, Level 5+ with a party. Invite a friend or create a second hero. Plant a seed on the Farm. Next at Melee 15: Copper Whetstone." At Level 9 its first line was "Next step up: Mosslight Glade, Level 16" while the summary said Wickstead. The Own four with 2.09M and nothing it wants (REAL) is this system failing at Level 60 |
| 6 Server cost | None: client lines over envelope facts. `hr_goal_week_days` is a read |
| 7 Population | "Find a party for The Sewer" and "Invite a friend" need people |
| 8 Server age | Unchanged |
| 9 Exploits | None |
| 10 Teaching | Level 1 if cards are cleared, else about Level 4 |
| 11 Throughput | A line a goal kind. Every new sink needs a line or nobody finds it (Tempering: one buyer) |
| 12 Monetization | It should never name a Crowns purchase as the next thing |
| 13 Telemetry | Purses over 20 times the account's largest buy of the week |

Uniqueness: none needed; it is a signpost. Rulings: clarity-first COMPLIES in the first hour, OPEN after.

| Change | Systems | Ledgers moved | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| One line a lane, always the nearest reachable: the ground to be on now, the next gear step, the next thing gold buys (dive 24's shelf), the long goal. Never a ground more than three Levels away while a nearer one exists; never a second hero without its price | what-next | gold, hunt hours | S to M | no | first week, long chase | PLAYED at Levels 4 and 9 |
| The same four lines sit at the foot of the Hunt summary and the away card | what-next, away-return | attention | S | no | first week | PLAYED |

### wiki: KEEP

| # | Answer |
|---|---|
| 1 Purpose | Problem: "why did that happen?" Decision: none; it makes the bar, the tier and the gear decisions arguable. RULED 11-08, formulas are public |
| 2 First principle | Nothing repeated |
| 3 Ledgers | None |
| 4 Power budget | None. It binds every number the program changes: a formula that cannot be written in two lines here is a finding for its dive |
| 5 Seven players | PLAYED: four tabs. Formulas gives hit chance, max hit, monster hit chance, the Level table to 300, the skill table, the cost of a death, each with a worked example. Real use unknown: opens are not journalled |
| 6 Server cost | None; it renders data the client holds |
| 7 Population | Works alone |
| 8 Server age | Unchanged |
| 9 Exploits | None |
| 10 Teaching | The icon from minute 1; never pointed at in 9 hours. The coach's Help card points at Settings |
| 11 Throughput | Rendered from data, so a new formula costs a row of words |
| 12 Monetization | None |
| 13 Telemetry | Book opens a new account in its first day |

Uniqueness: an idle game that prints its own Level table and worked examples is rare and worth keeping exactly as plain as it is. Rulings: FORMULAS ARE PUBLIC 11-08 COMPLIES, with one break: the Book says the Mill Cellar is "Levels 1-8" and Hunts says "Levels 1-4" (two sources). One small fix, no verdict change: the band reads from the row Hunts reads.

### lore: FIX

| # | Answer |
|---|---|
| 1 Purpose | Problem: eleven grounds are a list. Decision: none. Plugs into grounds, bosses, Tamsin, the Hearth. A reason the places connect, and a reason to reach the next one |
| 2 First principle | Nothing repeated |
| 3 Ledgers | None |
| 4 Power budget | None, and it should stay none |
| 5 Seven players | PLAYED: 13 pages, a teaser for each shut one ("Something down in the Sewer wears a crown"). The voice is a person's. After nine hours Wren had "2 of 13 pages found" |
| 6 Server cost | None; pages open on facts the envelope carries |
| 7 Population | Works alone |
| 8 Server age | Unchanged |
| 9 Exploits | None |
| 10 Teaching | Never pointed at |
| 11 Throughput | A page a ground, written by hand in Tyler's voice (11-11). About an hour a page |
| 12 Monetization | None |
| 13 Telemetry | Chronicle pages open a hero by Level 10 (3 or more) |

Uniqueness: the teasers are the best "next ground" pull the game has, and they are on a tab nobody is sent to. Rulings: 11-11 "tell it like a story" COMPLIES; 11-16 "build the chronicle" COMPLIES.

| Change | Systems | Ledgers moved | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| A page opens when the server has seen the hero on the ground at all. Today it needs a personal best (a hunt of 10 minutes or more) or the latest session, and the Cellar ends itself in two short hunts, so its page never opens | lore | none | S | no | first hour | PLAYED; `chronicle.js` header |
| The summary's "Next ground" row carries the shut page's teaser line | lore, what-next | none | S | no | first week | PLAYED |

### away-return: FIX

| # | Answer |
|---|---|
| 1 Purpose | Problem: the game is played in visits of 2 to 5 minutes around absences of 2 to 11 hours (REAL). Decision: what each hero does next, and what to do with what it brought back. It is the semi-idle promise, and for the Own four it is most of the game |
| 2 First principle | Question 3. 8 to 10 presses a hero a return, one of them a decision. Four named failures: the return's presses, a job with no count, a gatherer that stays on the first rock, the loot plan an item at a time |
| 3 Ledgers | Attention: the system exists to give it back. Hunt hours and town hours: it decides how much of a hero's day is used; today 16% hunting, 25% jobs, 59% idle (REAL) |
| 4 Power budget | None directly. As a Time lever it is the largest in the game: an Own four hunts 3.3 hours a day against a 12-hour beta bar |
| 5 Seven players | New: the first return is the make or break (PLAYED: Level 6 to 9, 13,138 gold). Own four: two visits a day, 32 to 40 presses for four heroes. Heavy four: six visits. Ceiling: this is its whole job. REAL: loot plan dispatch 110 uses by one person; after-hunt set on 32% of hunts |
| 6 Server cost | Today: `hr_hunt_after_*` and one cron, off the settle path. "Carry on" is one intent that starts up to four hunts the server already knows how to start: about four statements a visit, no ledger row of its own (ASSUMED until Systems sizes it) |
| 7 Population | Works alone; at 10,000 the cron's sweep is per hero that ended, not per player online |
| 8 Server age | Unchanged |
| 9 Exploits | A job count and "Carry on" start nothing a session could not start by hand. A plan that starts hunts with no session (the alternative of ruling 1) is a new server path: it must pay the same door (`hr_hunt_admit`), the same supplies rule and the same gold floor |
| 10 Teaching | First met at the first return. The after-hunt choice is on the hunt's page from Level 1 with four yard lines before anything explains the yard |
| 11 Throughput | A new place to go after a hunt is a data row (`hunt-after.js`): cheap. "Climb the Tower" (CITED 22) and "burn bones" (CITED 21) are both rows here |
| 12 Monetization | Attention is never sold: no Crowns or Premium feature may be "fewer presses". The longer Premium bar is hours, not presses, and stays |
| 13 Telemetry | Idle hero-hours over hero life (59% today, target under 30%); returns with more than 10 presses |

Uniqueness: the card's plain sentence about the night is the game's signature screen. Rulings: 10-18 hunts keep running COMPLIES; 10-18 a session starts or changes a hunt COMPLIES (and is why ruling 1 is asked); 11-15 the itinerary COMPLIES for hunt to job, and has no job to hunt; 10-14 "returns to town and resumes the last non-hunt activity" COMPLIES.

| Change | Systems | Ledgers moved | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| "Carry on" for the account: every hero does again what it did last (ground, tier, setup, party, Tamsin's Repeat, Blessings, loot by plan), after one line of what that is | away-return, hunts, tally, loot | attention, hunt hours | M | yes, one intent | first week, long chase | PLAYED; REAL 59% idle |
| The card lists what is waiting, most valuable first: better gear (press), loot by plan (press), a ground that opened, a full bag, a gatherer with full stamina ("Hunt again: Wickstead") | away-return | attention | S to M | no | first week | PLAYED twice |
| A gathering or bench job takes a count and a "then": wait, or the best node the hero can now work | away-return, gathering | town hours | M | yes, rows in `hr_hunt_after_choices` and the job | first week | PLAYED: 6,001 ore for 20 |
| The yard lines on the hunt page fold into one "Train at the yard" with the skill picked inside | away-return, training | attention | S | no | first hour | PLAYED |

### analyzer: KEEP

| # | Answer |
|---|---|
| 1 Purpose | Problem: "is this hunt good for me?" Decision: ground, tier, bar and supplies, judged on XP and gold an hour with own and store supplies apart. Plugs into every hunt choice |
| 2 First principle | Nothing repeated. Its place and fold are kept per viewer (RULED 10-25) |
| 3 Ledgers | None; it reads Level XP, skill XP, gold and items |
| 4 Power budget | None. Knowledge is the largest lever in the game (REAL: twice as fast the second time) and this is where it is earned |
| 5 Seven players | PLAYED: Session, Per hour (after 10 minutes), Supplies used, Loot collected, "Next level in 00:08:26". Training, Taken and Dealt are Premium tabs. Personal bests need a 10-minute hunt, so the Cellar never sets one |
| 6 Server cost | `hr_hunt_analyzer` on open and `hunt_bests` folded at a hunt's end: off the settle path (READ FROM DATA; not measured here) |
| 7 Population | Works alone. Party scope splits income evenly and costs per hero (RULED 10-16) |
| 8 Server age | Unchanged |
| 9 Exploits | None; display |
| 10 Teaching | In view from the sixth second of the first hunt, never explained, and it does not need to be |
| 11 Throughput | None needed |
| 12 Monetization | The full analyzer is a Premium grant (RULED 10-17). It sells knowledge of your own play, not power. Keep the free view able to answer "am I profitable and how fast do I level" |
| 13 Telemetry | Personal bests beaten a hero a week |

Uniqueness: the weekend bonus and the "no party, solo or event bonus" rate on separate lines is honest in a way players notice. Rulings: 10-14 bests Solo and Party apart COMPLIES; 10-16 own against store COMPLIES; 10-22 skill XP in a Premium tab COMPLIES.

### bestiary: BUILD

| # | Answer |
|---|---|
| 1 Purpose | Problem: hour 200 on a ground plays like hour 2, and Levels 5 to 30 have one reward clock. Decision: stay for the next stage or move on; which creature to finish. Plugs into kills, Luck, scaled hunts, the Book |
| 2 First principle | Nothing to press: stages pay when reached. The built ladder's claim act is a press with no decision and is cut |
| 3 Ledgers | A source of Luck (an Add-class lever inside the 104 Magic Find budget a hero, RULED 11-20): 50 / 150 / 500 / 1,500 / 5,000 / 15,000 a stage, once an account. Rates: question 4 |
| 4 Power budget | To stage four on all eleven grounds: about Magic Find 14. All six stages on 55 creatures: about 32 (FORMULA). It grows with content, not with Level, and each stage pays once: capped by construction. The built ladder's hidden +3% drops and +1% damage are outside any class and are cut |
| 5 Seven players | New: 3 to 5 stages in the first two hours. Own four: counts once a kill for the account, so a four finishes a ground's fourth stage in 50 to 85 hours. Heavy four: the same in a third of the days. Buyer: nothing to buy (Luck is bound, RULED). Four friends: each account counts its own kills. REAL: no one has ever seen a stage; there is no screen |
| 6 Server cost | The counters already ride the settle transaction (`ev:kill_monster:<id>`). A stage is derived on read. Luck paid is one ledger row a stage: under 1 a hero-hour after the first day |
| 7 Population | Works alone |
| 8 Server age | A newcomer at month 6 starts at zero and is not racing anyone: it is the account's own book. Veterans keep the last two stages for years |
| 9 Exploits | Killing the weakest creature fastest: capped by respawn (the Cellar is two packs every 32 s). Four heroes on four grounds: four times the stages, which is hours, not a break. Stage rewards are once, so no loop. Scaled hunts count the same creature: intended |
| 10 Teaching | The first stage is its own teacher if it says what it paid: "Gray Wolf, stage 1: +50 Luck". A page in the Book's Hunting grounds tab, a count and the next stage beside each creature |
| 11 Throughput | Free with every creature added. 55 today |
| 12 Monetization | Luck is never sold (RULED 11-20) |
| 13 Telemetry | Stages reached an account a week (3 or more under Level 30) |

Uniqueness: a kill book is genre-standard; paying it into one account bar that only fills is this game's own. Rulings: Luck v3.1 11-20 COMPLIES once built; 10-22 "per character" SUPERSEDED by 11-20 "counts per account"; 10-19 a full Bestiary multiplies a boss's relic chance by up to 1.25 (`loot-bands.js` boostMax) is OPEN against v3.1's "never cut Trophy rows": dive 23 to say which holds.

| Change | Systems | Ledgers moved | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Build v3.1's stage ladder and its page; counts per account | bestiary, luck | items (Luck) | M | yes, a stage payout | first week, long chase | `bestiary-hours.mjs`; itemization plan section 15 |
| Cut `bestiary-charms.js`, `src/core/charms.js`, the trophy multipliers and the claim | bestiary, trophies | power | S | yes | none; removes a hidden lever | READ FROM DATA |

### leaderboards: FIX

| # | Answer |
|---|---|
| 1 Purpose | Problem: "how am I doing against others?" Decision: which climb to make mine this week. Plugs into Level, every skill, the Tower, Gold Given. All-time boards answer it for 25 heroes and nobody else |
| 2 First principle | Nothing repeated |
| 3 Ledgers | None, and it must stay none: no gold, item or power for a rank |
| 4 Power budget | None |
| 5 Seven players | New: "1st of 1" today; at month 6 never on any all-time board. Own four: four rows of one person. Heavy four: the top of everything by week 2. Ceiling: owns the weekly XP boards unless they are per hunted hour (they should not be: hours are the game). Four friends: the first people who would compare |
| 6 Server cost | A refresh job and a read on open. Weekly adds one snapshot a week. Nothing a settle |
| 7 Population | At 10: every board is the same five names. At 10,000: top 25 of 40,000 heroes is a board 99.9% of players are not on, so "your rank" and a weekly bracket matter more than the top |
| 8 Server age | The whole problem. Question 5 |
| 9 Exploits | Rank for power or gold would be farmed by four-hero accounts and alts; with no prize there is nothing to farm. Gold Given counts only capped sinks (built). Names on a public board need the moderation tools' rename |
| 10 Teaching | A card at Level 16; the menu from Level 1 |
| 11 Throughput | A board is a data row |
| 12 Monetization | Gold Given is the one board bought gold moves; Tyler kept it (11-05) |
| 13 Telemetry | Distinct heroes in a weekly top 25 over four weeks |

Uniqueness: none today. A weekly Trades board a pure gatherer can win is a thing the crafting-only player the 11-04 ruling wants would talk about. Rulings: 11-04 Gold Given COMPLIES; 10-31 the purpose test per board: the eight trade boards fail it once 25 heroes reach 99.

| Change | Systems | Ledgers moved | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Sixteen boards become six; each opens on "this week"; Level and Total level keep the all-time roll; a lone name is shown against its own last week | leaderboards | none | M | yes, a weekly snapshot | long chase | question 5; PLAYED |

### live-events: FIX

| # | Answer |
|---|---|
| 1 Purpose | Problem: nothing happens on a date. Decision: when to play, where, and with whom. Plugs into Level XP, Call out, the party finder |
| 2 First principle | Nothing to press: it is on or off |
| 3 Ledgers | Level XP: +25% a kill for 72 hours in 336, +5.4% amortized. Gold: Open Halls waives a fee (a sink skipped, not gold made) |
| 4 Power budget | Multiply class. Question 6: range cut to +25%, amortized value at or under 5%, added beside tier and party, never multiplied through them |
| 5 Seven players | New: a first day inside a weekend is a quarter faster than the tutorial promises and then the next day is slower. Own four: +5.4% a fortnight for nothing. Heavy four, Buyer, Ceiling: saves refills for the weekend (up to 44% of its hours under the bonus). Four friends: the one player a ground's weekend is for |
| 6 Server cost | `hr_live_xp_windows` is read by the settle through the plan cache (READ FROM DATA); the announcer is a cron. No per-kill statement |
| 7 Population | At 10: a pace bonus and nothing else. At 10,000: a load spike on a known date; for dive 28 |
| 8 Server age | The same bonus for a newcomer and a veteran, which is fair; in absolute XP it pays the veteran 30 times more |
| 9 Exploits | Timing refills and long hunts into the window (priced by the refill step). An event row with a wrong scope is caught by the generator's check |
| 10 Teaching | The plate from the first second: "+25% Level XP, ends Mon 6:00 AM". The sheet contradicts it in town |
| 11 Throughput | An event is a data row and a generated file: minutes. The limit is the rule that an event may only move XP a kill or a fee |
| 12 Monetization | Never a paid event and never an XP buff bought with gold (RULED 11-04 avoid list) |
| 13 Telemetry | Level XP earned under an event over all Level XP (5% or less) |

Uniqueness: a weekend when one ground pays and everyone is there is a small-server event a player would tell a friend about; a global XP weekend is every game's. Rulings: 11-07 live events from data COMPLIES; 11-04 no gold-funded XP buffs COMPLIES; 10-22 world events get a deliberate redesign: this is part of it.

| Change | Systems | Ledgers moved | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| World XP weekend monthly; a party ground's weekend in the fortnight between; dial range 1000 to 1250; added beside tier and party | live-events, level | Level XP | S | a generated catalogue | first week for friends, long chase | question 6; READ FROM DATA |
| The first-day pace is measured and promised with no event; the sheet's bonus line reads the same windows as the plate | live-events, first-hours | Level XP | S | no | first hour | PLAYED |

### rare-moments: FIX

| # | Answer |
|---|---|
| 1 Purpose | Problem: an idle game's best luck happens while nobody is looking. Decision: wear, sell or show. Plugs into loot bands, the away card, chat, the share card |
| 2 First principle | Nothing repeated |
| 3 Ledgers | None; it reads Items. A world line is rate-limited (3 a hero a day) |
| 4 Power budget | None |
| 5 Seven players | Question 7. Today 7 to 26 reveals a day for the Own four, none watched. After the change: about one a month for the Own four, one a week for the Heavy four |
| 6 Server cost | One `hr_world_notices` row a broadcast; with Trophy only, a few a day at 1,000 online |
| 7 Population | At 10: a line in a chat one person reads. At 10,000: at 3 a hero a day for any Rare it would be thousands of lines an hour; Trophy only is tens |
| 8 Server age | A Trophy is as rare at month 6 as on day 1 |
| 9 Exploits | None new; the row is written by the settle. The share card renders from the server's event |
| 10 Teaching | PLAYED: met as "Best find" on the away card. The float and the card were never seen |
| 11 Throughput | Free with every Trophy and Very Rare row |
| 12 Monetization | Steam will ask whether a reveal sells a roll. It does not: nothing here is bought |
| 13 Telemetry | Reveals a hunting hero a week (0.2 to 1) |

Uniqueness: "the reveal waits for you" is the idle-game form of a drop moment and I have not seen it done well elsewhere. Rulings: super-rare drop moments (low rates, a real reveal, broadcast, shareable card) COMPLIES in parts and fails on "low rates"; 11-20 generous to Krell, rare after COMPLIES once the Very Rare band exists.

| Change | Systems | Ledgers moved | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| The reveal and the world line are for Trophy and Very Rare; a Rare-band drop is a gold loot line and "Best find" | rare-moments, loot | none | S | a rule row | long chase | question 7; `loot-bands.js` REVEAL_BANDS |
| A Trophy or Very Rare found while away is the first thing on the return card, with Share | rare-moments, away-return | attention | S to M | no | long chase | PLAYED |

### game-modes: HOLD

Not built, so the card is against the idea. 1 Purpose: replay for players who have finished a road, and a self-found game for players who want no market. 2 First principle: a mode is chosen once at creation. 3 Ledgers: none new; a mode removes transfers (trade) or raises a sink (death). 4 Power: none; a mode must never pay more XP or drops, or it becomes the best way to play. 5 Seven players: the Heavy four and the Ceiling, at month 3 and later. 6 Server cost: a column and a predicate. 7 Population: Ironman works at 10; Group needs four people. 8 Server age: a mode board is a fresh race, which is its retention value. 9 Exploits: feeding a mode account from a normal one through anything shared (question 11). 10 Teaching: creation screen. 11 Throughput: none; it is the same content. 12 Monetization: Premium applies as elsewhere; Crowns trade is off for Ironman by definition. 13 Telemetry: mode accounts as a share of new accounts. Rulings: game modes after launch COMPLIES by holding. Verdict HOLD until the open game has an end worth replaying; question 11 is what to protect meanwhile.

### settings: KEEP

| # | Answer |
|---|---|
| 1 Purpose | Problem: a screen arranged once should stay arranged. Decision: how much the game shows (tips, effects, widgets). It is the first principle applied to the interface |
| 2 First principle | Widget places and folds are kept per viewer (PLAYED: the Tally and the analyzer fold and drag). What the browser holds is lost on a new device by design (CLAUDE.md section 6); `hr_settings` holds what must follow the account |
| 3 Ledgers | Attention only |
| 4 Power budget | None. The 13 data files booked here are the text home and art manifests |
| 5 Seven players | Everyone, once. The Own four arranges one screen for four heroes |
| 6 Server cost | `hr_settings_touch` on a change |
| 7 Population | Works alone |
| 8 Server age | Unchanged |
| 9 Exploits | None; nothing here gates or spends (the tips row says so) |
| 10 Teaching | Menu, Settings. Not opened in this play; READ FROM DATA |
| 11 Throughput | A setting is a row |
| 12 Monetization | None |
| 13 Telemetry | Tips switched off before Level 5 |

Rulings: 11-08 opacity sliders for effects COMPLIES (the bar's effects button, PLAYED as a control, not opened); 10-25 movable, foldable analyzer and Tally COMPLIES.

### old-server-leftovers: CUT

Dark, judged from the chain and the engine, not played. 1 Purpose: none; each was replaced (bounties by the tally, the collection log by nothing, renown and traits deleted with the old client). 2 First principle: nothing. 3 Ledgers: none paid. Renown pays nothing (question 10). 4 Power: `trait:auto_eat` would be a bar feature sold once; the bar's conditions do it for free. 5 Seven players: nobody can reach any of it. 6 Server cost: the collection read and the loot counters, for dive 28. 7, 8: nothing. 9 Exploits: `hr_trait_buy` is a granted client RPC on a dead feature. 10 Teaching: none. 11 Throughput: none. 12 Monetization: traits were priced in the old currency. 13 Telemetry: rows in the five tables after the cut, zero. Rulings: 10-22 "cut every old-client reward table the rebuilt client cannot claim" covers all five. Verdict CUT; the list is question 10.

| Change | Systems | Ledgers moved | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Drop the five leftovers through `chain-retire`, the `hr_trait_buy` grant first; remove the stale renown words | old-server-leftovers | server cost | S to M | yes | none for a player; cost and attack surface | question 10 |

### discord-gift: CUT (as built)

1 Purpose: a reason to join the Discord. 2 First principle: one code, once. 3 Ledgers: 25 gems an account, a dead currency; zero gold. 4 Power: none. 5 Seven players: nobody; no screen calls it. 6 Server cost: none until called. 7, 8: nothing. 9 Exploits: once an account by primary key, six tries a minute, the amount is a server constant (READ FROM DATA); the open question is that a granted RPC pays into a wallet the economy dive is cutting. 10 Teaching: none. 11 Throughput: none. 12 Monetization: gems were the old premium currency; a free grant of one is the wrong shape beside Crowns. 13 Telemetry: claims a week, if rebuilt. Rulings: none names it. Verdict CUT as built; if a Discord reward is wanted for the playtest it is a title or a color, never gold, gems or Crowns (ruling 7).

---

## Every change, for the synthesis

| # | Change | Systems | Size | Server | Value |
|---|---|---|---|---|---|
| R1 | "Carry on" for the account; the away card lists what is waiting | away-return, hunts, tally, loot | M | one intent | first week, long chase |
| R2 | Levels 7 to 9 re-cut; Level 10 in 6 hours on the start-kit hero, no event | level (dive 21), first-hours | S | a generated curve | first week |
| R3 | A job takes a count and a "then"; the Level 7 cards wait for the first stamina end | away-return, gathering, first-hours | M | rows | first week |
| R4 | The rune spell card never names a locked or party-only spell | first-hours | S | no | first hour |
| R5 | "Got it" means later for server-finished cards; no card before its Level | first-hours | S | no | first hour |
| R6 | The summary explains Blessings and holds "Sell junk for N gp" | first-hours, shop | S | no | first hour |
| R7 | What next: one line a lane, the nearest reachable; shown on the summary and the away card | what-next | S to M | no | first week |
| R8 | The Bestiary as Luck's stage ladder with a page; charms, trophy multipliers and the claim cut | bestiary, luck, trophies | M | a stage payout | first week, long chase |
| R9 | Six boards, weekly first | leaderboards | M | a weekly snapshot | long chase |
| R10 | World XP weekend monthly, a party ground's weekend between, +25% at most, added beside tier and party | live-events | S | a catalogue | long chase |
| R11 | The reveal for Trophy and Very Rare only, waiting on the return card | rare-moments | S to M | a rule row | long chase |
| R12 | Chronicle pages open on a visit; the teaser on "Next ground" | lore | S | no | first hour |
| R13 | The Book's bands read the Hunts rows | wiki | S | no | none |
| R14 | The Town menu shows what the hero can use | first-hours | S | no | first hour |
| R15 | Cut the five leftovers and the Discord gift | old-server-leftovers, discord-gift | S to M | yes | cost, surface |
| R16 | The zero rule in three classes; the daily ten on the vitals | all | S | a query | operations |

## For other dives

| Dive | System | Finding |
|---|---|---|
| 21 combat | `level` | Levels 8 and 9 cost 68,087 and 83,477 XP against 17,200 an hour for a start-kit hero on the Thicket's Normal (PLAYED): 3.8 and 4.7 hours, the slowest Levels before 50. The curve doubles nine times and then goes flat. "Level 10 in 6 hours" holds for the career hero and not for the hero a new player is (about 11 hours on my path with no event; the 11-19 first-day table said 7.7 before the two XP cuts). Please measure the target on `life.mjs --policy idle` with the start kit |
| 21 combat | `tank-runes`, `action-bar` | The coach offers Frost Slam to a lone Level 5 shield hero. The Configure window lists every weapon's 23 spells to a hero that can cast four |
| 21 combat | `hunts` | REAL: 99 of 249 hunts ended because another hero of the same account left. "Leave if anyone leaves" is on by default and one hero's stamina ends four hunts. An account's own heroes should end together only when the player says so |
| 21 combat | `stamina` | The bar does not bind (3.3 hunted hours a day against 12). What binds is the return. Ruling 1 here decides whether that stays true |
| 21 combat | `inner-flame` | The loot plan lists Bones with no word that they are the Hearth's fuel; I set them to Sell and Dispatch sold 1,461. I agree with "bones burn by a loot rule" |
| 22 endgame | `tower`, `hearth-chest` | Both are lines in the Town menu at Level 1 with no word; the coach's card is at Level 10. "Climb the Tower" as an after-hunt row fits R1's "Carry on" |
| 22 endgame | `scaled-hunts` | The Cellar's page promises "Scaled hunt. Unlocks at Level 9" in the first two minutes while the switch is off. Scaled hunts are also the Bestiary's late consumer (stage four on an outgrown ground) |
| 23 items | `loot` | The loot plan is one dropdown an item (24 on the Thicket alone) with nothing saying what an item is for; "Dispatch" is on a different tab from the plan; the Sell tab offers the player's food and the piece just bought; Wheat is neither junk nor kept. A rule by kind ("sell gear worse than worn", "keep what a bench I have uses") is the first-principle form |
| 23 items | `trophies`, `luck` | `bestiary.js` TROPHY_STAGES pays +1 to +3% drops and +1% damage against a monster at 2,500 to 20,000 kills, derived on the server, on no screen and in no stacking class. v3.1's stages replace it. `loot-bands.js` still gives a boss's relic a 1.25 Bestiary boost: say which holds |
| 23 items | `gathering` | A job has no count and never moves to a better node. At Mining 42 the hero was on the Level 1 rock |
| 24 economy | `shop`, `gold-sinks` | At Level 9 with 14,206 gold the card's next buy was 220 gold. The first title is 2,500 rats (79 after the whole Cellar) and a title's price is hidden until the kills are done |
| 24 economy | `hero-slots` | What next says "Invite a friend or create a second hero" at Level 4. The Characters screen's own line ("300,000 gold. Need 298,970 more") is honest and should be the only place it is said until the purse is in sight of it |
| 24 economy | `crowns` | The Discord gift pays gems through `hr_wallet_credit`; it belongs on the gem cut list |
| 25 social | `parties` | A ground's weekend (question 6) is the finder's one busy moment and wants the standing party to exist first |
| 26 home | `house`, `training` | The Homestead's 20 ore and 30 logs are what pull a one-hero account out of the hunt at Level 7. Four yard lines sit on the first hunt page before the yard is explained |
| 28 platform | `settle-engine` | `hr_collection_of` is counted in a savepoint on the engine's request path and `ev:loot:<item>` counters are written for a screen that does not exist. Size it; the cut is R15 |
| 28 platform | `moderation`, `operations` | `hr_trait_buy` is granted with no caller. `tools/vitals.mjs` has no help flag and runs its production read on any argument it does not know; a `--help` that prints usage would have stopped my mistake. The weekly board snapshot is one job |

## Measured, cited, assumed

**Played (the local world, this lane, 2026-11-20):** every line marked PLAYED; the minutes of question 1; Level 6 to 9 and 13,138 gold in 8 hours away (3,118 kills, 178,424 Level XP, 22,219 an hour with the weekend bonus, 17,203 without party, solo or event bonus); 6,001 Copper Ore and Mining 1 to 42 in 8 hours; the press counts of question 3 for one hero; "2 of 13 pages found"; the What next lines at Levels 4 and 9; the Frost Slam card.

**Measured:** `node tools/balance-program/bestiary-hours.mjs` (question 4), over `tools/balance-program/ref.json` (commit a5e092248, 2 seeds x 1 h). Hours a Level in question 2 and the summary are the Book's own Level table (PLAYED, equal to `LEVEL_CURVE`) over the played Thicket rate and the reference table's rates at Levels 10 to 50.

**Read from data:** `src/data/hunt-tutorial.js` (53 cards, DAY_ONE_LEVEL 7, DANGER_LEVEL 8, TOWER_LEVEL 10, ROLL_LEVEL 16, the first_spell picker), `src/data/core-model.js` (LEVEL_CURVE, LEVEL_PACE), `src/data/live-events.js`, `src/data/honor-roll.js`, `src/data/hunt-after.js`, `src/data/chronicle.js`, `src/data/bestiary.js`, `src/data/loot-bands.js`, `src/data/abilities.js:166`, `src/core/perks.js:318`, `supabase/functions/hr-accrue/index.ts:731-744`, `2026-10-18-discord-gift.sql`, `2026-11-24-rare-broadcast.sql`.

**Real:** `10-real-players.md` (4 people, 1,334 hunted hours; the two light players are 18 hours together, so every first-week number is two people); the vitals rows of 2026-11-17 to 11-20 (see the disclosure at the top).

**Cited:** `24-economy.md` (the slot ladders and "hero slots cost more", Tyler 11-20; "Next buy walks the shelf"), `25-social.md` (the first party, chat closed, standing parties), `22-endgame.md` (the Tower's weekly errand, scaled hunts off), `26-home.md` (the deed ladder, the Trophy room), `21-combat.md` as pushed WIP (the pace of record, tiers, bones), the 2026-11-11 designer re-read and the 2026-11-19 first-day path on the priority board, the itemization plan section 15 (Luck v3.1).

**Assumed:** four heroes cost four times one hero's presses (no own four was played); a third of a four's hours are on a boss ground (question 7); the Heavy four's refill timing in question 6; the statement count of "Carry on"; the start kit's grant rule (requirement 9, first-hours). None of these should be tuned to before it is measured.

**Not done:** a death, a party, Settings and the Tower were not played. No guard was added because nothing in the game changed; the one tool added writes nothing.
