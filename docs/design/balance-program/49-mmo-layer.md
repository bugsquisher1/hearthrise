# Balance program 49: the MMO layer

Game director study, 2026-11-21, on `lane/d-party-model`. Design only. No game code, data or migration is touched. The file was asked for as `49-party-model.md` and is named `49-mmo-layer.md` because Tyler settled the party model while the study ran and gave it this subject.

**The frame, as ruled by Tyler on 2026-11-21.**

- Every account runs four heroes from the start.
- The same party buffs apply to everyone, and hunting your four together is the obvious choice. There are no balance targets by party size, and this file proposes none.
- One Premium covers the account.
- The MMO part of the game is clans, world bosses, events and PvP arenas.
- Rewards are buffs and gear. Tyler, on reading the first issue of this file: "People like buffs and gear that's what drives them to buy crowns and sell them for gold. Also, 2 versions of PvP arena, normalized and gear." This issue is written around that.

**The question this file answers.** A four fills its own party, so no player needs another player to hunt. What rules make other players matter?

**Labels.** EVIDENCE is a fact with its source beside it. MEASURED is a number this lane read from player behavior (read-only, aggregates only, method in section 8). COMPUTED is arithmetic on evidence, with the method beside it. ESTIMATED is arithmetic that leans on a number nobody has measured for this design. TARGET is a number the design aims at. HYPOTHESIS is a belief about fun or behavior that only a playtest can settle. UNVERIFIED marks a fact about another game that I could not source.

---

## 1. Summary

**The one fact the design stands on.** In an idle game players are almost never at the screen together, and their heroes are almost always in the world together.

| How idle players behave (4 people, 33 days, 1,377 hunted hero-hours) | | Label |
|---|---|---|
| A visit | 2 to 5 minutes at the median | EVIDENCE, `10-real-players.md` section 7 |
| Ten-minute windows with any press in which two people pressed | 5 of 675 | MEASURED |
| Clock hours with any hunting in which two people's heroes hunted | 46 of 452 | MEASURED |

Four people is a thin sample, and the design does not need the numbers to be exact. It needs only the direction, which every idle game shares: the owner is away and the heroes are not. So the first rule of the layer is this.

**Rule 0. Every shared feature works while both players are asleep.** Heroes meet. Owners check in. A feature that needs two people at the screen in the same minute is not in the game.

**The recommendation: the Standing World.** One design in seven parts.

1. **World bosses with one shared health pool.** A boss stands for a weekend. Each account sends its four into its own boss room. Every party's damage comes off one pool that the whole server shares. Each boss has its own line of named gear, its own upgrade material and a buff for those who fought.
2. **Clans as a shared work that pays in buffs.** A roster, a chat tab, a castle whose rooms buff the members who gave to it, rations from its cooks, and a weekly clan board.
3. **A calendar written a year ahead.** Four weekend types in rotation, each paying a buff or featuring gear. No daily quests, no login calendar, no season pass.
4. **Two arenas where your four fights another account's saved four.** In the even arena stats are normalized and builds decide. In the open arena your real gear and buffs count. Each has its own matchmaking, ladder and rewards. Both pay buffs, and the open arena pays its own gear line.
5. **A presence strip.** On every ground and boss you see who else is there, by party and clan.
6. **One power budget for all of it.** Every buff is a timed or standing modifier on a knob the engine has, summed and capped in one table. Every piece of gear sits on the gear curve at its band. A fully buffed, boss-geared four kills about 32% faster than a plain four in mid gear (COMPUTED from the TARGET budget in section 5.8). That is wanted, and it is less than a band and a half of gear, so it skips nothing.
7. **The Crowns engine.** Players make all the gear and earn all the buffs. Crowns buy time, comfort, looks and the same timed boosts that play gives, under the same cap. Crowns trade to other players for gold through a server-owned book. Gold buys gear from players and feeds the upgrade sinks. So a player who pays gets there sooner and never gets anything play cannot give.

**What the target game does not have.** Hired or on-call heroes. Hunting grounds where several accounts fight the same monsters. A raid of many heroes in one fight. PvP on the hunting grounds. Dailies. Gear sold by the store.

**Why.** Every part obeys rule 0. Every part works at 10 accounts and at 10,000. The whole layer is estimated at under 3 of the 60 database-seconds an account-day the server budget allows. Every part has a comparable game behind it, with sources in section 3. And every reward is something a player chases, sized inside one budget.

**Confidence.** High on the shape, because it follows from how idle players behave and from the engine's own limits. Medium on build size, because the arena needs heroes on both sides of a fight and that has never been run. Low on fun: every claim that players will enjoy these is a HYPOTHESIS until the playtests in section 7.

**Strongest alternative, in one line.** Hired heroes as the centerpiece, so every party holds other people's heroes, which is the strongest togetherness an idle game can offer and fails when Levels do not match or the server is small.

---

## 2. The parts compared

| Part | Player value | What you see of other people | At 10 accounts | At 1,000 and up | Server cost (budget 60 DB-s an account-day) | Build size | Main risk | Evidence |
|---|---|---|---|---|---|---|---|---|
| World boss, shared pool | A reason to tune your party and bars for a weekend. The boss's own gear line, its upgrade material and a buff | One health bar the server moves while you are away. Names of the parties fighting now. Your clan's share | Works. The pool is sized to active accounts, with a floor one account can fell | Works. Nothing is shared but one row | About 0 added. The fight spends stamina like a hunt. One cron statement a minute (ESTIMATED) | L | Reward size. Too low and it is skipped, too high and it is a duty | EVIDENCE [15]. HYPOTHESIS: fun |
| Clans | Room buffs earned by giving. A shared goal for surplus gold and goods. A team to belong to | Clan chat. Clan mates on the boss and the board. A castle that grew while you slept | Roster, chat, castle and rations work. The board needs about 5 clans | Works. The browser needs search | About 0 (ESTIMATED) | M for the roster and chat. M to L for the castle | An empty clan is an empty room. Alt accounts padding a roster | EVIDENCE [9][19]. HYPOTHESIS: use |
| Calendar | Something different each weekend with no daily chore | One line and one banner the whole server sees at once | Works | Works | 0. An event is a row | S | Live ops run by hand | HYPOTHESIS that events bring people together |
| Two arenas, async: even and open | Your build tested against a person's build, and your gear tested against a person's gear. Season buffs, and an arena gear line in the open arena | Two ladders of names. A replay of your four against a rival. Clan standing | Works. Opponents are saved setups and house teams | Works. Rating bands, seasons | Under 2 DB-s an account-day at 5 fights a day in each (ESTIMATED) | L | Heroes on both sides of the engine is unproven. Style balance in PvP is unknown. Real rewards invite win trading | EVIDENCE [25][26][27]. No idle MMO arena found. HYPOTHESIS: fun |
| Presence strip | Small. It answers "is anyone else here?" | Other parties on your ground and boss, named | Often empty | Capped at a short list | About 0.5 DB-s an account-day, or 0 if it rides the hunt's own update (ESTIMATED) | S | None | EVIDENCE: Tyler on what felt like an MMO, section 3 |
| **Not in the game:** hired or on-call heroes | Low. Every seat is filled by an own hero | Other people's heroes in your party | Fails. Levels do not match | Works | Same as an own four | L, plus a trade surface | Carried leveling | COMPUTED, section 5.5 |
| **Not in the game:** shared combat grounds | Unknown | Strong when busy, nothing when empty | Fails | Needs channels | Higher, unmeasured | XL | Contested kills with nobody at the screen | EVIDENCE [3] |
| **Not in the game:** a raid of many heroes in one fight | Unknown | Strong for those present | Fails. Needs people at the screen | Works | Unmeasured | XL | Appointment play | Rule 0 |

---

## 3. Comparable games

Sources are numbered in section 9.

| Game | Characters and grouping | What other players are for | Lesson | Label |
|---|---|---|---|---|
| Tibia | A second account on a second machine is allowed [1]. Party XP is shared only if the lowest hero is at least two thirds of the highest, with a bonus for mixed vocations [2] | Parties, guilds, the market, wars | The two thirds line is a tested rule for mixed Levels. Its worlds come in PvP types. The first Optional PvP world is "one of the busiest" and many players moved to that type [3] | EVIDENCE. That one character an account is online at a time is UNVERIFIED |
| The browser hunting game Tyler plays | Automated hunts that run with the tab closed. He ran a party of four | A town where other players are seen | His words on what felt like an MMO: "the coolest part is having a living world in the town and seeing other players on the screen" | EVIDENCE, Coordinator notes of 2026-08-23 and 2026-09-16 |
| IdleOn | Ten or eleven characters an account, all working while away [4][5] | Party dungeons, chat | A player lists as a con that it is "advertised as an MMO" and all of it can be done alone [6]. It still peaks above 20,000 on Steam [7] | EVIDENCE. One thread, not a survey |
| IdleMMO | Five characters, three active at once. Multiple accounts are forbidden [8] | Guilds, a market | Several own characters at once with a ban on extra accounts is a working model | EVIDENCE [8] |
| Idle Clans | One character. Built around the clan | Clan events give 2% XP for each member taking part. Clan bosses drop upgrade materials. A weekly Clan Cup resets every Sunday and records the top 10 [9] | A clan layer on an idle base, with Very Positive recent reviews [10] | EVIDENCE |
| Milky Way Idle | One character. Party combat can be queued so a hero returns to it without the player present [11] | Market, guilds, party combat | Queued, not live. A review summary still calls its multiplayer "underdeveloped" [12] | EVIDENCE, weak |
| Old School RuneScape | Several accounts at once are allowed [13]. Group Ironman shares progress among 2 to 5 players [14] | Shared skilling bosses pay each player by their own points, not the group's total [15] | The contribution rule for the world boss chest | EVIDENCE |
| Albion Online | Premium is bought for one character at a time [17] | Guilds, territory, a player economy | One Premium an account avoids a known annoyance | EVIDENCE, one review |
| EVE Online | Three characters an account, one online. Training a second at once is a paid add-on [18] | Corporations, wars, the market | Running several at once can be a product | EVIDENCE |
| Torn | Factions share an armory, run organized crimes and fight wars and chains [19] | The faction is where long-term players live | Shared faction goals carry a browser game for years | EVIDENCE for the systems. Why players stay is opinion |
| Wakfu and Dofus | Wakfu lets one account control up to three own characters [20] | Guilds, nations | A forum post says many own characters make you "less dependent" on others [20] | EVIDENCE, weak |
| Granado Espada | One player controls three characters at once, praised for it [21] | Factions, wars | An MMO built on own parties | EVIDENCE |
| Dragon's Dogma 2 | You hire other players' pawns. The owner is paid when the pawn returns [22] | Borrowed hands | The game sends fake hires so unpopular pawns still earn [23]. A hire market needs the house to fill it | EVIDENCE |
| AFK Arena | Heroes are borrowed from friends and guild mates, with weekly caps [24]. The arena is fought against saved defense teams, by rank, in seasons [25] | Mercenaries, the ladder | Both social systems are asynchronous | EVIDENCE, fan guides |
| Super Auto Pets | Arena mode fights saved teams of other players with no timer and no waiting [26] | An opponent who is never online | The async arena is its casual mode | EVIDENCE |
| Guild Wars 2 | In structured PvP every character's attributes are normalized and gear stats do not count [27] | Fair fights | The model for a normalized arena | EVIDENCE |
| Melvor Idle, SimpleMMO | Not sourced | | | UNVERIFIED |

**What they say together.**

1. **Own parties and an MMO are not opposites.** IdleMMO, IdleOn, Granado Espada and Wakfu all run several own characters at once. The complaint they draw is that it can feel single-player. The ones that answer it do so with a layer on top.
2. **The layers that work in idle games are asynchronous.** Clan events and a weekly cup, saved defense teams, queued party combat. I found no idle game whose social layer needs people online in the same minute.
3. **Shared bosses pay by your own contribution.**
4. **Players of the inspiration chose consent in PvP.** That argues for an arena and against PvP on the hunting grounds.
5. **Hire markets need the house to fill them.**
6. **No idle MMO with an arena was found.** The arena evidence comes from auto-battlers and from Guild Wars 2. That gap is real.

### 3.1 Bought currency that players trade for gold, and how the edge is capped

Tibia and Huntera are the lead references, for mechanics only. Nothing of theirs is used in the game: no names, items, art or text. The wider set follows.

| Game | What paying buys, and how it reaches non-payers | Size of the edge, and the cap | What players accepted, and what they called pay to win | Label |
|---|---|---|---|---|
| **Tibia** (lead) | Tibia Coins are bought with money. Transferable coins can be sold to other players on the Market for gold, and a player with gold can buy them there [28]. The store sells XP boosts, mounts, outfits and decoration [28] | The XP boost is +50% for one hour. At most five a day, priced 30, 45, 90, 180 and 360 coins, so each is dearer than the last [29][30]. Coins from some payment methods cannot be traded for months, as fraud protection [28] | A press piece at the boost's launch noted some players dislike it and others want to buy it [39]. The coin market itself is an accepted part of the game | EVIDENCE, fan wiki and Q&A |
| **Huntera** (lead) | A browser hunting game with automated combat that follows the same systems, and sells for real money | Not sourced. Its store model was judged the part not to copy | Tyler plays it and names it and Tibia as "great examples" of the loop | EVIDENCE from Coordinator notes of 2026-08-23. No public source read |
| RuneScape and Old School RuneScape | A bond is bought with money, then redeemed for membership or sold to a player for gold [31] | A bond bought from a player can never be traded again [31] | Jagex reported real-world trading fell 61% and the coins moved by it fell 81% in the first week. A part of the community called bonds hypocritical gold selling [31] | EVIDENCE, wiki |
| World of Warcraft | The WoW Token is bought with money and sold on the auction house for gold. The buyer redeems it for game time [32] | Each token sells once and is then bound. Its gold price is set by supply and demand. The auction house takes no cut [32] | Widely copied. Not read as pay to win at launch in the sources found | EVIDENCE, official post and wiki, 2015 |
| EVE Online | PLEX is bought with money, traded on the market for ISK, and spent on subscription time and services [33] | Skill injectors give less the more skill a character has [33] | Forum opinion is split, with "pay to progress" the common middle position [33] | EVIDENCE, wiki and forums |
| Guild Wars 2 | Gems are bought with money and exchanged for gold. The rate moves with supply and demand [34] | A 15% fee on every exchange, in both directions [34]. Structured PvP reads no gear at all [27] | Its maker said of the model "everyone wins" [34] | EVIDENCE, wiki and press |
| Albion Online | Gold is bought with money and traded to players for silver. Premium can be bought with silver through the same market [35] | A 30% fee on buying gold through the exchange, aimed at gold sellers [35] | Critics say enough money buys any gear. A press review settles on "pay to progress", because skill and guild play still decide outcomes [35] | EVIDENCE, press and forums |
| Black Desert Online | Cash shop items can be listed on the in-game market for silver [36] | Five listings a week [36] | Players protested in game with picket signs, even with the cap. The items were power and came from the store [36] | EVIDENCE, press |
| Lost Ark | Bought crystals are exchanged with other players for gold [37] | Ten exchanges a day [37] | Called pay to win at launch, "but not more than a typical MMORPG" by one outlet [37] | EVIDENCE, press and guides |
| Milky Way Idle (an idle MMO) | Its bought currency was made tradeable to other players for coins [38] | The developer planned a membership partly to give the currency a steady sink and a price floor [38] | The developer wrote that making it tradeable raised purchases, and that a part of the players dislike the pay to win it allows [38] | EVIDENCE, a developer post |

**What they say together.**

1. **The accepted form is the same everywhere.** Money becomes gold only through another player, at a price players set, and the bought thing trades once.
2. **Every one of them puts a limit on it**, and the limits are of four kinds: a count a day or a week, a rising price, a fee on the exchange, or a trade lock.
3. **What players accept buying:** time, membership, boosts with a daily limit, looks.
4. **What they revolt over:** the store minting power, or the item that makes power, straight into the economy.
5. **A fair mode helps.** The game with the cleanest name for PvP is the one whose arena reads no gear.
6. **A bought currency needs a repeating sink**, or its buyers run out.

---

## 4. What makes other players matter when combat runs itself

Other people cannot matter minute to minute, because nobody is at the screen. They matter at the check-in. **TARGET: every visit of 2 to 5 minutes shows at least one thing another person did since the last visit.**

| Way | What it means | Where it lives | What a player sees on a normal day |
|---|---|---|---|
| A shared enemy | One target everybody's heroes wear down | The world boss | A health bar at 61% when you left and 38% when you came back, with the names that did it |
| A shared work | Something bigger than one account, built from surplus | The clan castle, the server's town project | "Your clan's hall rose overnight. 14 members gave." |
| A rival | A named person your build is measured against | The arena ladder, the weekly clan board | "Your four beat Aldric's four. You are 12th this season." |
| An audience | Your drops, rank and heroes are seen | The System tab, plaques, the presence strip | Your clan tag beside your name on the ground. "Rare drop: Brenna found a Cauldron Lid." |
| A counterparty | Somebody wants what your heroes make | The market, rations cooked for the clan | A cook's rations in the clan store |

---

## 5. The design, part by part

### 5.1 World bosses

**The rule.** A world boss is one health pool for the whole server, open for a weekend. An account sends its four into its own boss room, where the boss is scaled to that party. The damage the party does comes off the shared pool. When the pool is empty the boss falls for everyone.

**The reasons.**

- **A pool, not one big fight.** The combat engine runs a party of up to four in its own instance and settles every 10 seconds. A fight of forty heroes is a different engine. A shared pool puts the same sentence on the screen, "the server is killing this together", on the engine as it is.
- **A weekend, not an hour.** Heroes fight with the browser closed, on stamina, like a hunt. Nobody has to be anywhere at 8 pm. A boss that appears at a set hour breaks rule 0.
- **Sized to the server.** The pool is a fixed amount for each weekly active account, counted by the server, with a floor that one account fighting through the weekend can fell. TARGET: the boss falls in 36 to 60 hours on a server of 10 and on a server of 10,000.
- **Counted against your own Level.** Because each room is scaled to its party, a Level 20 four and a Level 300 four take the same share of the pool for the same quality of fight. Points come from time survived and from the tier chosen, and Deadly pays more than Normal. A new account matters on its first weekend. A veteran matters by daring a harder tier and living.

**What the player experiences.** On Friday a banner says the boss stands. You pick the tier, adjust your bars, and send the four. On your next visit the bar has dropped, the page shows which parties are in the fight now, and your clan's share is on it. When it falls, the plaque names the first blow, the last blow and the top clan, and your chest is waiting.

**Rewards: gear and buffs players chase, sized on the gear curve.**

| Reward | Rule | Reason |
|---|---|---|
| A chest at point thresholds | Paid by your own points, on the pattern of [15]. Higher thresholds roll more often on the boss's line | A full server does not dilute you and an empty one does not starve you |
| The boss's own gear line | Each boss has a named line of unique pieces, one for each style. A piece drops at the band of the hero who earned it. It spends the same budget as the best piece of that band and spends part of it on a property no other piece has. It reforges up a band and keeps its property | This is the piece players talk about. It is a best in slot candidate, never a piece from a higher band, so it rides the curve and skips nothing |
| It trades | A boss piece can be sold on the market like any gear | The seller earns gold. The buyer who sold Crowns for gold gets the piece sooner. This is the demand the Crowns engine runs on (section 5.9) |
| The boss's upgrade material | A material only this boss drops, used by the upgrade sinks (tempering, hallmarks, linings) for the band | Bosses feed the gold sinks, and the material trades |
| The boss's buff | Everyone who reached the first threshold carries a timed buff for 7 days, for example +5% damage dealt. It sits in the timed part of the power budget (section 5.8) | A reason to show up even when you have the gear |
| One account trophy and plaque names | First blow, last blow, top clan | The audience |
| Level XP | About what the same stamina earns on a Normal hunt | Never a loss and never the best XP in the game |
| Coin | None | Gold comes from selling what the boss dropped, to a player |
| Death | A death in the boss room costs what a death costs anywhere | One rule set. Risk is what makes the tier choice real |

**Server cost.** A boss fight is an ordinary four in an ordinary instance and spends stamina, so it takes the place of hunted hours. The fold of new damage into the pool is one statement a minute while a boss stands, about 4,300 runs a weekend. ESTIMATED at about 10 ms a run, that is under a minute of database time for the whole server in a weekend. The rule that keeps it there: nothing is added to the settle path. Damage is counted in the row the settle writes for the hunt.

**Population.** 10 accounts: a weekly boss with a few names on it. 100: the plaque and the clan line are a contest. 1,000 and up: the same, because nothing is shared but one row.

**Build size.** L. The parts are a boss room, scaling to the party, a server-sized goal with stages, a plaque, a points rule, a chest claim and a page. The chest claim is a reward surface and goes through Security.

**HYPOTHESIS.** That players spend stamina on it. That watching a shared bar fall feels like company.

### 5.2 Clans

**The rule.** A clan is a shared work, a team and a room, and its work pays its members in buffs. A member holds a room's buff by giving, never by the size of the roster. A clan never fills a party seat.

| Piece | Rule | Reason |
|---|---|---|
| Roster | One clan an account. Leader, officer, member. A leader away 14 days passes it on. A browser to find one | A name and a list of people |
| Chat tab | One room for the clan | The room |
| The castle | One project at a time. Members give gold and castle goods. Each stage changes how the castle looks and builds or raises one room. Gifts are one-way | The shared work. It is the same engine as the server's town project, so there is one engine to secure |
| Rooms that buff | Each room carries one standing buff on one knob: a war room for damage dealt, a ward for damage taken, a library for Level XP, a workshop for town work. A room's level sets the size, up to the standing cap of section 5.8 | The clan's work becomes something every member feels in every hunt |
| Earned by contribution | A member holds a room's buff in any week in which that member gave at least the week's share to the clan. The share is a fixed amount by the member's own band | Giving is what earns it. A second account padding the roster earns its owner nothing, and a member who stops giving loses the buff the next week |
| The clan's weekly buff | When the clan finishes its week's goal on the project, every member who gave carries one extra timed buff for 7 days, inside the timed cap | A reason to push together before Sunday |
| Sized by members | A stage costs a fixed amount for each member. TARGET: a stage takes 2 to 4 weeks for a clan of 3 and for a clan of 60 | A small clan must be able to finish |
| Rations | The clan's cooks make bound meals for the clan store. Members draw them under a weekly cap | The one place a member directly helps a member, and a second use for cooking |
| The weekly clan board | Three lines: world boss points, arena standing, best Tower floor. Scored as the average of the clan's top members. Resets weekly, with all-time records. Pattern from [9] | A team to cheer for. Average scoring lets a small clan win |
| The tag | The clan's tag beside a name on plaques, the System tab, the presence strip and the ladder | The audience |

**Why buffs follow giving and not head count.** Idle Clans gives 2% XP for each member taking part in an event [9], which shows clan buffs are wanted. Accounts are free, so a buff that grows with member count would be farmed with extra accounts, and each one costs server money. Here the size of a buff comes from the room's level and the right to hold it comes from the member's own gifts. Both are gold and goods leaving the economy.

**What the board pays.** The top clans of the week carry a small timed buff the next week and a banner. It sits inside the same timed cap, so a winning clan is ahead by a little and never out of reach.

**What the player experiences.** You join from the browser in a minute. Your visits now open on clan chat, the castle's progress and who gave. You give your week's share and your heroes hunt with the war room's +3% all week. Your cook's surplus becomes rations someone else's four eats. On Sunday the board says where your clan finished.

**Population.**

| Accounts | What a clan is | Note |
|---|---|---|
| 10 | One or two clans | Chat, castle, rations and the boss line all work. Under five clans the board shows your clan's week against its last week |
| 100 | Five to fifteen clans | The board is a real contest |
| 1,000 and up | A hundred or more | The browser needs search. The weekly reset keeps the top from freezing |

**The gold sink.** With four heroes free from the start, the castle is the first candidate for the gold that hero slots would have taken. Sizing it is the economy review's job.

**Server cost.** A gift is one press. The board is one weekly fold. ESTIMATED at about nothing against 60. **Build size.** M for the roster, chat and browser. M to L for the castle and rations. S to M for the board.

**HYPOTHESIS.** That players found clans. That a castle growing overnight is felt.

### 5.3 Events

**The rule.** The calendar is written as rows a year ahead and runs itself. An event may move a share of something the server already computes, never over +25%, and never puts gold into a purse.

| Weekend | Event | What it pays |
|---|---|---|
| 1 | World bonus weekend | A buff: +25% Level XP for everyone, which is the whole timed XP cap |
| 2 | A world boss stands | Gear and a buff: the boss's line, its material, its 7 day buff |
| 3 | One ground's weekend | Gear: that ground's named pieces are featured, so their drop chance is raised for the weekend. The drop formula has a featured term for this |
| 4 | Arena season end and clan honors | Buffs and gear: season buffs for both ladders, the open arena's gear line, the clan board's buff |

An event pays in the same two things as everything else, buffs under the cap and gear on the curve. It needs no code of its own: a buff is a row on a knob and a featured piece is a row on the drop formula.

**The reason.** Every weekend has one thing the whole server shares, and no two in a row ask for the same thing. A one-person team cannot run live ops by attention, so the calendar must not need any.

**No dailies, no login calendar, no season pass.** With four heroes a daily is four chores, and a visit is 2 to 5 minutes. The beats of the game are the visit, the stamina bar, the weekend and the monthly project. The Premium login reward is not a daily in this sense as long as its streak never resets.

**What the player experiences.** One line in the System tab and one banner in town on Friday. Something to aim the four at that is different from last weekend.

**Server cost.** 0. **Build size.** S. **HYPOTHESIS.** That an event brings anyone to the screen. TARGET for the playtest: more ten-minute windows with two people pressing on an event weekend than on weekdays.

### 5.4 PvP arenas

**What PvP is when combat runs itself.** A test of preparation. You choose the four, what they wear and what their bars do. The server then plays the fight with the same combat engine as a hunt, and you watch what your rules did against a person's rules.

**The rule.** Your four fights another account's saved four, and the server simulates it. There are two arenas. In the **even arena** stats are normalized and builds decide. In the **open arena** your real gear and buffs count. Each has its own matchmaking, its own ladder, its own tickets and its own rewards. The pieces in the first table below are shared by both.

| Piece | Rule | Reason |
|---|---|---|
| The opponent | A saved setup: another account's four as they stood when it last fought | Rule 0. It works with the opponent asleep and on an empty server. Pattern from [25] and [26] |
| House teams | A handful of fours written as data | The first account on a server has someone to fight |
| Who you fight | The server offers three opponents near your rating. You pick one | You cannot choose an account, so wins cannot be fed to a friend or a second account |
| Your defense | The four you last attacked with | Nobody can post a weak defense on purpose |
| Rating | Attacks move your rating. Being attacked while away costs nothing | An idle player is not punished for sleeping |
| Fights | Tickets that bank. TARGET: 5 a day, holding up to 20 | Bounds server cost. Banking keeps it from being a daily |
| Seasons | Four weeks, ending on weekend 4. A soft reset | A fresh ladder for new accounts |
| Stamina, death, XP, coin | None | It cannot be farmed and it cannot hurt |
| Modes | One at launch, the plain fight. Capture the flag is a later rule set on the same arena | One thing built well first |

**The two arenas side by side.**

| | The even arena | The open arena |
|---|---|---|
| What decides a fight | The four you chose and the bars you wrote | Those, and your real gear, upgrades and buffs |
| Stats | Every hero fights at one reference Level, with reference skills and a reference kit of its own weapon type and armor weight. Guild Wars 2 does this [27] | Your heroes as they stand: Level, skills, gear, tempering, hallmarks, clan rooms, timed buffs |
| What paying does here | Nothing. No gear, buff or boost is read | It shows, inside the ceiling of section 5.9: at most best in slot over mid gear in the same band, and the timed cap |
| Matchmaking | One ladder for everyone. Three opponents offered near your rating | By gear band first, then rating. Three opponents offered from your band. A band with too few saved setups borrows from the next band and the house teams of that band |
| At 10 accounts | Everyone can fight everyone | Thin. Most fights are against house teams of your band until the band fills. This is the arena that needs a population |
| Ladder and season | Its own. Four weeks | Its own, by band. Four weeks |
| Rewards at season end, by rating tier reached | A timed buff for the next season on a hunting knob, inside the timed cap. A title and a banner | A piece of the arena's own gear line at your band, with its own property, sized like a boss piece. The line's upgrade material. A timed buff. A title |
| Who it is for | The builder, the new account, the small server | The player who has invested in gear, and the player who buys an edge |

**Why both.** The even arena has opponents on any server and shows whose build is best. The open arena gives gear, upgrades and buffs a place to be tested against a person, which is one more reason to want them. Tyler ruled both.

**Rewards are paid by tier, not by rank.** Anyone who reaches a rating tier with at least a set number of fights earns that tier's reward. A reward that only the top ten can earn concentrates gear in the same hands every season. Arena gear trades like any gear.

**Buffs and boosts inside a fight.** XP and drop buffs do nothing in an arena. Damage and survival buffs count in the open arena under the same caps as in a hunt, and count for nothing in the even arena.

**One engine check for both.** Heroes on the enemy side running their bars is the same question for both arenas. The even arena then needs a reference kit as rows. The open arena needs nothing more.

**What the player experiences.** You open the arena on a visit, see three named rivals, pick one, and watch a 90 second fight or skip to the result. Your rank moves. Next visit a line says who attacked your four and how it went.

**Matchmaking by population, even arena.** The open arena follows the same steps one band at a time, so it fills later.

| Accounts | Opponents | Ladder |
|---|---|---|
| 1 | House teams | None |
| 10 | Nine saved fours and the house teams. You meet the same names, which at this size is the point | One list |
| 100 | Three offered near your rating | A real ladder. Clan standing means something |
| 1,000 and up | Rating bands | Top 100, your own neighborhood, the clan league |

**Server cost.** A fight reads two saved setups, simulates in the edge, and writes one result. ESTIMATED at 0.13 to 0.2 database-seconds a fight from the measured cost of one settle read and one press (`48-platform-cost.md`, a work in progress). Five fights a day in each arena is under 2 of the 60. The simulation is edge CPU, not database time, and a 90 second fight of eight units must be timed before it is trusted.

**Anti-cheat.**

| Threat | Answer |
|---|---|
| A forged result | The client sends one intent: fight offered opponent 1, 2 or 3. The server builds both sides from its own tables, picks the seed, runs the fight and writes the result |
| A forged setup | Setups are saved by the server from server tables. No stat crosses from a browser |
| Win trading and feeding from a second account | You cannot choose who you fight, and defense does not move rating. Rewards are real, so this matters: a tier needs a minimum number of fights against offered opponents, and two accounts on one network are never offered each other |
| A weak defense on purpose | Your defense is your last attack party |
| Flooding | Tickets, and a rate limit on the intent |
| Replays | The server keeps the seed and both setups. A replay is display only |

Every arena write is journalled, and the arena is in the Security review before Early Access.

**Two unknowns.** Heroes must be able to stand on the enemy side and run their bars there, and nobody has run that. And the four styles are balanced against monsters, so one may dominate against heroes. The reference kit is a set of rows tuned for the arena alone, so arena balance never touches a hunt.

**Build size.** L. **HYPOTHESIS.** That watching your bars fight a person's bars is fun. That a ladder of ten is worth opening.

### 5.5 Hired and on-call heroes: not in the game

**The rule.** A party is an account's own heroes. Two accounts may still form a party together by hand. No hero is lent, hired or put on call.

**The reasons.**

| Check | Result | Label |
|---|---|---|
| Who needs a seat filled? | Nobody. Every account has four | COMPUTED from the frame |
| Who has a hero to lend? | Nobody at 12 hunted hours a day. A lent hour spends the hero's own stamina (`57-review-social.md` section 5) | COMPUTED |
| Would Levels match? | Under a two thirds rule, one pair in six among four real players with top Levels 79, 46, 9 and 8 | COMPUTED from `10-real-players.md` |
| What did the largest game with hire need? | Fake hires from the house [23] | EVIDENCE |
| What it would cost | L, a trade surface for Security, and a market in carried leveling | `57-review-social.md` items 2 and 3 |

This asks Tyler to replace ruling 25-1 of 2026-11-20. It is the strongest alternative to this design, and the condition that would bring it back is in section 7.

### 5.6 Mixed Levels in one fight (GR-10b)

**The rule: the two thirds line.** When heroes share a party fight, each hero keeps its full share of the kill's Level XP if its Level is at least two thirds of the highest Level in the party. Below that, its share is its Level divided by two thirds of the top Level. The rule is shown in the party window before the hunt starts.

**The reasons.**

- **It is visible.** A player sees the number before sending a low hero behind a high party.
- **Carried is a little better than alone and never several times better.** COMPUTED in `57-review-social.md` section 11.5 from measured cells: a Level 5 behind a Level 37 party earns about 1.2 times its own pace and a Level 10 about 1.6 times. With no rule the same seats earn 6.1 and 4.1 times.
- **One rule for every case.** An account's own low hero, a friend's hero in a party formed by hand, and any later mode all read the same line.
- **It is tested.** Tibia shares party XP on the same two thirds line [2].

**Scope.** This is a rule for heroes of different Levels sharing a fight, above all across accounts. It is not a party-size target and it sets no pace number.

**Where it does not apply.** A world boss room is scaled to its own party and paid in points. The arena is normalized. Neither needs it.

**What the player experiences.** The party window says "Brenna is under the line and keeps 61% of her share." Nothing is hidden.

### 5.7 Shared hunting grounds: seen, never fought over

**The rule.** A ground is hunted by one party in its own instance. On the ground's page and in the hunt view, a strip shows the other parties hunting there now, by leader, clan tag and size.

**The reasons.**

| Reason | Detail | Label |
|---|---|---|
| Rule 0 | A contested spawn with both owners asleep is a tax, not a meeting | HYPOTHESIS, strong |
| Small servers | Two people's heroes were on the same ground in 5 of 452 hunting hours among four players | MEASURED |
| Large servers | TARGET population of 1,000 accounts puts about 55 parties on a ground at once (COMPUTED: half the accounts hunting, nine grounds), which needs channels, which is instancing again | COMPUTED |
| The engine | One party, one instance, one settle. A shared fight of eight is a new engine with unmeasured cost | EVIDENCE, CLAUDE.md section 6 |
| The inspiration's players | They moved to worlds where others cannot interfere [3] | EVIDENCE |

**What the player experiences.** "3 other parties are hunting the Warrens" with names and tags. If the strip is liked, other parties can later be drawn in the hunt view as display only.

**Server cost.** One small read a minute while a hunt is on screen. ESTIMATED at about 0.5 database-seconds an account-day, or 0 if it rides the hunt's own update. **Build size.** S.

### 5.8 The power budget: how much all of it adds

**The rule.** Every buff in the game is a row in one modifier table: a knob the engine has, a size, a clock, and how rows combine. Rows on one knob sum, then a cap applies. There are two caps a knob, one for standing buffs and one for timed buffs. Every piece of layer gear sits on the gear curve at the band of the hero who earned it and spends that band's best in slot budget. No reward has code of its own.

**The reasons.** A buff that is a row can be added, sized and retired without touching the engine. A cap on the sum means a new source of buffs gives players a new way to fill the same budget and never a bigger budget. Gear on the curve means a boss piece competes with the best piece of its band and never with the next band.

**The budget.** Every number here is a TARGET for the design. The sizes are chosen against the framework's own steps: a weapon upgrade is worth 5% to 8% hunting performance, best in slot over mid gear is 10% to 20% faster kills, and a gear band is about 24% (`50-standards.md` E1 and P4, `47-itemization-fit.md` C20).

| Knob | Standing cap: clan rooms | Timed cap: boss buff, clan weekly buff, board buff, arena season buff, bought boosts | Fully buffed |
|---|---|---|---|
| Damage dealt | +5% | +10% | +15% |
| Damage taken | 5% less | 5% less | 10% less |
| Level XP | +5% | +25%. The world bonus weekend fills this cap by itself | +30% |
| Drop chance | none | +10% | +10% |
| Coin from kills | none | none | none |
| Town work speed | +10% | none | +10% |

**What a fully buffed, boss-geared four gains over a plain four.** The plain four wears mid gear of its band and holds no buffs.

| Step | Kill speed | Level pace | Label |
|---|---|---|---|
| Plain four, mid gear, no buffs | 1.00 | 1.00 | the reference |
| Best in slot for the band, which a boss or arena piece is one way to reach | 1.15 | 1.15 | TARGET, the middle of the ruled 10% to 20% |
| Plus the damage caps, +15% | 1.32 | 1.32 | COMPUTED, 1.15 x 1.15 |
| Plus the Level XP caps, +30% | 1.32 | 1.72 | COMPUTED, 1.32 x 1.30 |

So the most the whole layer can add is about a third more kills an hour and about 72% more Levels an hour, with 10% less damage taken and 10% more drops. On the gear curve that kill speed is less than a band and a half (COMPUTED: 1.24 to the power 1.3 is 1.32). Two thirds of the pace gain is timed and lapses when the player stops earning or buying it. Nothing in it lets a hero wear a higher band, enter a ground sooner or skip a Level.

**Why no coin buff.** Gold comes into the world from kills and leaves through sinks. A buff that mints more gold for the buffed inflates prices for everyone else, and it would let money mint gold directly, which is what the Crowns book exists to prevent.

**What the player experiences.** One line on the hero sheet: "Buffs: damage +11% of 15, Level XP +30% of 30." A player always knows what is filled and what is left to chase.

### 5.9 The Crowns engine

**Tyler's rule.** "This game needs a model where buying crowns and selling for gold WILL provide advantages. Just not broken af ones."

**The rule of the design.** Paying gives a real edge that can be felt, and the edge has a ceiling written in numbers. **A player who pays reaches the ceiling sooner and stays there all the time. A player who does not pay can reach the same ceiling with gold. Nobody can go past it.**

**The loop.**

1. A player buys Crowns with money.
2. That player spends them in the store, or lists them on the Crowns book for gold.
3. A player with gold buys those Crowns and spends them in the store. A Crown bought with gold is bound to that account and cannot be listed again.
4. The first player now has gold made by other players' hunting. It buys gear from players on the market, upgrade materials from players, and the gold sinks: tempering, hallmarks, linings, clan gifts.
5. The sinks destroy the gold. The gear and materials were dropped by someone's heroes, most of all by bosses and arenas. The seller of that gear is paid for playing.

No gold is created by money and no gear is created by the store. Money moves gold and gear between players and pulls gold into sinks.

**What Crowns buy, directly or through gold.**

| The advantage | How a payer gets it | How a non-payer gets it | Bounded by |
|---|---|---|---|
| Timed boosts on damage, damage taken, Level XP and drop chance | Bought in the store for Crowns, in 1 day and 7 day sizes | Earned from bosses, the clan, events and arenas. Or bought with Crowns that were bought with gold | The timed caps of section 5.8. A bought boost and an earned buff fill the same cap, so earning one saves Crowns and buying one never stacks above it |
| Premium | Crowns | Crowns bought with gold | One an account. Comfort: stamina cap, the full analyzer, longer buff clocks (call MM-21) |
| Gear sooner | Gold from Crowns buys pieces on the market | Drops, bosses, arenas, and gold earned by hunting | The Level a piece needs. A hero wears only its own band, so the edge is at most best in slot over mid gear |
| Upgrades sooner | Gold from Crowns pays the sinks and buys the materials | The same sinks with earned gold | The sinks' own ladders, which end at each band's top rung |
| Clan rooms sooner | Gold from Crowns given to the castle | Earned gold given | The standing caps |
| Convenience | Crowns: more bag and storage, more saved setups, more banked arena tickets | Crowns bought with gold | No power |
| Looks | Crowns | Crowns bought with gold | No power |
| **Never sold** | Gear, upgrade materials, gold, Levels, skill levels, boss chests, arena rating | | The store mints no power that a player did not make |

**The line, in one sentence.** Crowns buy time, comfort, looks and the same boosts play gives. Gold buys power. Players make all of it.

**The ceiling, in numbers.** All TARGET, on the budget of section 5.8.

| Ceiling | Number | How it is held |
|---|---|---|
| **X, pace.** A fully Crowns-boosted four against the same four playing the same hours with mid gear and no buffs | **At most 60% more Levels an hour** (COMPUTED: best in slot 1.15 x timed damage 1.10 x timed Level XP 1.25 = 1.58) | The timed caps and the band's best in slot |
| The same payer against a non-payer who plays the layer and holds earned buffs about half the time | About 35% (COMPUTED: 1.58 over 1.05 x 1.125) | The same caps. Playing the layer closes the gap |
| The same payer against a non-payer who has reached the ceiling with gold | 0% | It is one ceiling |
| **Y, gear.** How far ahead a payer's gear can be at any Level | **0 bands. Inside the band, at most best in slot over mid gear: about two weapon steps, 10% to 20% faster kills** | A piece needs its band's Level. Uniques spend the band's budget |
| Gold. How much more gold a paying account can hold in a week | **At most about double**: the weekly cap on Crowns sold, at the book's reference price, is worth about one week of a four's hunting gold | Clamps 1 and 2 below |
| On the pace line | A band that takes the plain four 10 days takes the fully boosted payer a little over 6 (COMPUTED: 10 over 1.58). Every Level and every band is still walked | Nothing sold grants a Level |

**Why these numbers.** They sit inside what players of the comparable games accepted and outside what they revolted over (section 3.1).

- Tibia's store sells a boost of +50% XP for one hour, at most five a day, each dearer than the last [29][30]. At 12 hunted hours a day five such hours are +21% over the day (COMPUTED: 5 x 0.5 over 12). A bought Level XP cap of +25% is that size.
- Tibia Coins, RuneScape bonds, the WoW Token, PLEX and Guild Wars 2 gems all let money become gold only through another player [28][31][32][33][34]. The common word for these games in the sources is "pay to progress" and not "pay to win" [33][35].
- The revolts came where the store sold the power itself or the item that made it: Black Desert's cash shop items on its market drew in-game protests even with a cap of five listings a week [36], and Lost Ark's shop was called pay to win at launch [37].
- A bond, a WoW Token and a bound Tibia Coin each trade once and then bind [31][32][28]. The Crowns book does the same.

**Where paying gives no edge.**

| Place | Edge from paying |
|---|---|
| The even arena | None. Nothing bought is read |
| The open arena | Yes, inside the ceiling: best in slot over mid gear in the same band, and the timed damage and survival caps. Matching is by gear band, so a payer meets others of the same band |
| World boss | A stronger four can hold a harder tier and so earns points faster, inside the same ceiling. The chest pays by your own points, so a payer takes nothing from anyone. Boss pieces trade, so a payer can also buy one, and the gold goes to the player who earned it |
| Clans | A payer's gold raises rooms sooner and covers the weekly share easily. Room buffs stop at the standing caps, and every member who gives holds them, so a payer in a clan lifts the whole clan |
| Events | None. An event's buff reaches everyone and fills the same cap |
| Levels, grounds, drops, tiers | None are sold. A free player reaches every one |

**The non-payer's path, priced in play.** Everything a payer has is reachable with gold. These are TARGET prices at the book's reference price. The real price is set by players inside the price band, so they are a HYPOTHESIS until the book has run.

| What | TARGET cost in a four's own hunting gold |
|---|---|
| Premium for a month | About 3 days of a four's hunting gold in its band, which is a tenth of the month |
| The full set of timed boosts kept up for a week, with no earned buffs at all | About 1.5 days of the week's hunting gold. Each buff earned in play is that much saved |
| Best in slot for a band from mid gear, bought and upgraded | 100% to 140% of the band's net gold for a hero (`50-standards.md` E4, ruled direction) |
| A convenience unlock | Half a day to 2 days, once |

Crown prices in the store are written in Crowns, and the store's rows scale by the buyer's band where the thing is a boost, so the cost in hours of play stays about the same at Level 20 and Level 300.

**Money-surface rules.** Crowns are a number on the account, written only by the server. Every Crowns surface is server-owned, clamped, journalled and in the Security review before Early Access.

| Clamp | Rule |
|---|---|
| 1. A weekly cap | Crowns sold and Crowns bought a week an account. Sized so a week's sales are worth about one week of a four's hunting gold at the reference price |
| 2. A price band | A lot's gold price sits between half and twice the 7 day median of real sales. Before a median exists, a band from a row |
| 3. One trade | A Crown bought with gold is bound to that account. It can be spent and never listed again |
| 4. A hold | Crowns bought with money cannot be listed for a set number of days, by the payment provider's chargeback window. An account in arrears is shut out of the book |
| 5. Who | A Level door on the book, the same-network guard, and the per-day spend and proceeds caps of the market |
| 6. Boosts | A server catalogue of boosts with server prices and a server clock. One bought boost a knob at a time. The cap is applied by the server in the one modifier table |
| 7. The store | The store has no row for gear, materials, gold, Levels or rating, and a test proves it |
| 8. The journal | Every Crown bought, listed, sold, bound and spent is a journal row |

**How it keeps the economy and the chase healthy.**

- **Gold.** No coin buff and no gold in the store, so money never mints gold. Bought gold was hunted by someone and mostly ends in a sink.
- **Gear.** Every piece was dropped by a hero. Demand from payers raises what a boss piece sells for, which pays the players who fight bosses. That is the chase working for both kinds of player.
- **Crowns.** They have steady sinks: Premium each month and boosts each week. A currency with only one-time buys loses its buyers, which Milky Way Idle's developer found and wrote about [38].
- **Fair fights.** One arena reads nothing bought.

**HYPOTHESIS.** That players with gold want Crowns enough to make a market. That the reference prices land where the targets say. That a 60% ceiling is felt as an edge and not as a wall. Section 7 tests each.

---

## 6. The recommendation, and the calls

### 6.1 Order

Tyler wants every decision made before any build plan. This is the order I recommend ruling on, not a plan.

| # | Piece | Size | Why here |
|---|---|---|---|
| 1 | The calendar | S | The frame the rest hangs on |
| 2 | Clans: roster, ranks, browser, chat, tag | M | Gives every later piece a team to credit |
| 3 | The two thirds line | S | One formula, and it must exist before any mixed party |
| 4 | The modifier table and its caps | M | Every reward below is a row in it |
| 5 | The engine check for both arenas: heroes on both sides | A measurement | The one unknown that could change this order |
| 6 | World boss, with its gear line, material and buff | L | Works at any size. The first place other accounts move a number you care about, and the first chase gear |
| 7 | The clan castle, its rooms and rations | M to L | The shared work, the standing buffs, and a home for gold |
| 8 | The Crowns book, the boost catalogue and the store | L | The demand side. It needs the market, the caps and at least one source of chase gear to exist |
| 9 | The even arena | L | Opponents on any server |
| 10 | The open arena | M after 9 | The same engine, read with real stats. Needs a population in each band |
| 11 | The weekly clan board | S to M | Reads what 6, 9 and 10 count |
| 12 | The presence strip | S | Cheap. Can move earlier |

**Server cost of the whole layer.** ESTIMATED under 3 database-seconds an account-day of the 60: the two arenas under 2, the presence strip about 0.5, the rest close to nothing. Buffs are read with the hero's other modifiers at the settle, so they add no statement.

### 6.2 The calls Tyler must rule on

Calls are numbered MM-1 to MM-42. "Re-issued" marks a call whose recommendation changed after Tyler's ruling that rewards are buffs and gear.

| MM | Call | Recommendation | What it replaces |
|---|---|---|---|
| 1 | Rule 0: every shared feature works while both players are asleep | Yes, as a standing rule | |
| 2 | World boss form | One shared pool, fought in own rooms | The 2026-10-22 note that live world events get a redesign: this is it |
| 3 | World boss timing | A window of about 72 hours, never a set hour | |
| 4 | World boss size | A fixed amount for each weekly active account, with a floor one account can fell | |
| 5 | World boss contribution | Counted against your own Level, in a room scaled to your party. Harder tiers pay more | |
| 6 | World boss pay (re-issued) | A chest by your own points. Each boss has its own named gear line at the earner's band, spending that band's best in slot budget, tradeable, and reforging up a band. Its own upgrade material. A 7 day buff inside the timed cap. A trophy and plaque names. Level XP near a Normal hunt. No coin | Replaces the first issue's "goods only, nothing above your band" |
| 7 | A death in the boss room | Costs the normal death | |
| 8 | What a clan is (re-issued) | A shared work, a team and a room that pays members in buffs. A member holds a buff by giving that week's share, never by roster size | Replaces the first issue's "no hero power". Replaces "visual only, no buff" for the clan's project |
| 9 | The castle (re-issued) | One project at a time on the town project's engine, sized by member count, one-way gifts, with rations. Each stage builds or raises a room, and each room carries one standing buff up to the standing caps: damage +5%, damage taken 5% less, Level XP +5%, town work +10% | 25-4 of 2026-11-20 (built prices and work orders) |
| 10 | The clan board (re-issued) | Weekly, three lines, average of top members. The top clans carry a small timed buff the next week, inside the timed cap, and a banner | Replaces the first issue's "honors only" |
| 11 | Events | The four-weekend rotation, written a year ahead. No dailies, no login calendar, no season pass, as a standing rule | |
| 12 | Arena opponents | Saved setups and house teams, never live | |
| 13 | Arena fairness (re-issued) | Two arenas. The even arena normalizes every stat and reads nothing bought. The open arena reads real gear, upgrades and buffs | Replaces the first issue's single normalized arena |
| 14 | Arena rewards (re-issued) | Paid by rating tier reached, with a minimum number of fights. Even arena: a season buff inside the timed cap, a title, a banner. Open arena: a piece of the arena's own gear line at your band, its upgrade material, a season buff, a title. No coin, no XP, no death | Replaces the first issue's "titles and banners only" |
| 15 | Arena fights | Tickets that bank, 5 a day up to 20 | |
| 16 | Arena matching | Three offered by the server. Being attacked costs nothing. Defense is your last attack party | |
| 17 | PvP on the hunting grounds | Never | |
| 18 | Hired and on-call heroes | Not in the game | 25-1 of 2026-11-20, and the on-call board in 25-3 |
| 19 | Mixed Levels in one fight (GR-10b) | The two thirds line, visible, one rule for every party | The hidden Level cut |
| 20 | Shared hunting grounds | Seen through a presence strip, never fought over | |
| 21 | Premium and the layer (re-issued) | Every boss, clan, event and arena is open to all accounts. Premium adds comfort inside them: timed buffs last a quarter longer and arena tickets bank to 30 | Replaces the first issue's "nothing for Premium" |
| 22 | Where the gold for hero slots goes | Hand to the economy review with the castle and the boss and arena upgrade materials as first candidates | |
| 23 | The order in 6.1 | Approve as the order for planning | |
| 24 | How rewards are sized | Every buff is a row in one modifier table on a knob the engine has. Rows on a knob sum, then a standing cap and a timed cap apply. Every layer piece sits on the gear curve at the earner's band | New |
| 25 | The buff caps | Damage +5% standing and +10% timed. Damage taken 5% and 5% less. Level XP +5% and +25%. Drop chance +10% timed. Town work +10% standing. No coin buff, ever | New. Keeps the +25% event ceiling as the timed Level XP cap |
| 26 | The power budget | A fully buffed, boss-geared four gains at most about 32% kill speed and about 72% Level pace over a plain four in mid gear, with 10% less damage taken | New |
| 27 | Boss and arena gear trades | Yes, like all gear | New. Follows "no bound gear" of 2026-10-23 |
| 28 | The paid advantage | Paying gives a real edge: timed boosts, gear sooner, upgrades sooner, clan rooms sooner, Premium, comfort and looks | New. Builds the 2026-11-18 intent and the 2026-11-21 ruling "WILL provide advantages" |
| 29 | What the store sells for Crowns | Premium, timed boosts on damage, damage taken, Level XP and drop chance, comfort, looks. Never gear, materials, gold, Levels, skill levels, chests or rating | New |
| 30 | Bought boosts and earned buffs | They are the same rows and fill the same timed caps. One bought boost a knob at a time | New |
| 31 | The pace ceiling, X | A fully Crowns-boosted four gains at most 60% more Levels an hour than the same four in mid gear with no buffs, and nothing over a non-payer who has reached the ceiling with gold | New. Replaces "no limit on how much sooner" (call 50-11, 2026-11-21) |
| 32 | The gear ceiling, Y | 0 bands ahead at any Level. Inside the band at most best in slot over mid gear, about two weapon steps, 10% to 20% faster kills | New |
| 33 | The gold ceiling | The weekly cap on Crowns sold is worth about one week of a four's hunting gold at the reference price, so paying at most about doubles a week's gold | New. Sizes clamp 1 of ruling 24-5 |
| 34 | The non-payer's path | Everything sold for Crowns can be had with gold through the book. Target prices: Premium for a month about 3 days of a four's hunting gold. A full week of boosts about 1.5 days. Boost prices scale by band | New |
| 35 | How Crowns trade | A number on the account, sold to other players for gold on a server-owned book. One trade, then bound | Builds ruling 24-5 and lane L49 |
| 36 | The clamps | Eight: weekly cap, price band, one trade, a hold after purchase, who may use the book, the boost catalogue and its cap, no power rows in the store, the journal. All in the Security review before Early Access | Adds three clamps to the five of 24-5 |
| 37 | Where paying gives no edge | The even arena, events, and access to every Level, ground, drop and tier | New |
| 38 | Open arena matching | By gear band, then rating, three offered. Thin bands borrow from the next band and from house teams | New |
| 39 | Even arena matching | One ladder for everyone, three offered near your rating | New |
| 40 | Tickets | Each arena has its own, 5 a day banking to 20 | New |
| 41 | One engine check | Heroes on both sides of a fight is measured once, for both arenas, before either is planned | New |
| 42 | Events pay buffs and gear | The world weekend is the Level XP buff. A ground's weekend features that ground's named pieces. The boss and arena weekends pay their own lines | New |

---

## 7. Playtests and measurements

**How much a playtest can show.** With 30 accounts a measured share of 50% could really be anywhere from about 32% to 68% (COMPUTED, 95% interval). Seeing a 20 point difference between two groups takes about 97 accounts in each (COMPUTED, 40% against 60%, 80% power). So the reads below are behaviors and counts, and each has a target set in advance.

### 7.1 Before any build

| # | Question | Who, how many, how long | What to read | What it decides |
|---|---|---|---|---|
| A | Will players spend stamina on a shared target? | The 2 to 4 active testers, one weekend. A server-wide kill goal on one boss is posted in Discord. The tally is read from the journal, read-only. The prize is a line in Discord | Fights at that boss, chat lines a day, and hours in which two people press. TARGET: all three higher than the week before | If nobody moves, the chest (call 6) matters more than the form |
| B | Which part do committed players want first? | The two heaviest testers, ten minutes each | Their own words | Direction only. Two people |
| C | Can heroes fight heroes in the engine? | Systems, no players, about a day | A four against a four on the replay harness: does it run, how long in the edge, does one style win every time | Whether the arena is L or XL |
| D | What does the boss pool cost? | Reliability, no players | 1,000 synthetic boss rooms. TARGET: under 0.1 database-seconds an account-day added | Call 2 |
| E | What must the chest pay? | The balance grid, no players | Chest value and XP for each stamina hour beside a Normal hunt at Levels 20, 60 and 110. It should be neither a loss nor the best XP in the game | Call 6 |
| F | Does the two thirds line hold? | The balance grid, no players | The eight carried cells of `57-review-social.md` section 11.5 with the rule on. A carried seat should earn a little more than it does alone and never several times more | Call 19 |

| G | Does the power budget hold? | The balance grid, no players | A mid geared four with no buffs against a best in slot four with every cap full, at Levels 20, 60 and 110. TARGET: kill speed within 1.25 to 1.40, Level pace within 1.6 to 1.8, no cell where the buffed four holds a tier the plain four cannot enter | Calls MM-25 and MM-26 |
| H | Is a 60% edge felt, and is it resented? | The two heaviest testers, shown the ceiling table of section 5.9 | Their own words: would they pay for it, would they quit over it | Direction only for MM-31 |

### 7.2 In the Discord playtest

**Who.** 20 to 30 strangers, 14 days, two weekends. Clans from day 1. A world boss on both weekends. The arena in week two if check C passes.

| Read | TARGET | A bad sign |
|---|---|---|
| Share of active accounts that hit the boss at least once | Over half, on both weekends | Under a quarter, or a drop from the first weekend to the second |
| Share of weekend stamina spent on the boss | 10% to 35% | Near zero (skipped) or near all (a duty) |
| Hours for the boss to fall | 36 to 60 | Under 12 or never |
| Ten-minute windows with two or more people pressing, boss weekend against weekdays | Clearly higher on the weekend | The same |
| Accounts in a clan | Over a third by day 7 | Under a tenth |
| Clans with gifts from three or more members | Half of all clans | One giver a clan |
| Arena fights an account a day, and accounts with 10 or more fights | 2 or more a day. Over a third of accounts | Under a tenth of accounts |
| Arena win rate of each style pairing | Every pairing between 40% and 60% | One style above 65% |
| Five players asked "what did another player do that you noticed?" | Four of five can name something | Two or fewer |
| Day 7 and day 14 return, boss fighters against the rest | Direction only. People who stay also join more, so this cannot show cause | |

**Buffs, gear and the Crowns book in the playtest.** The playtest is free and is wiped, so no money changes hands. To test the loop, every account is given the same weekly allowance of test Crowns by one server switch, and the book and the store run as designed. This needs Tyler's yes, because it is a grant, even though it is equal for all and wiped.

| Read | TARGET | A bad sign |
|---|---|---|
| Share of accounts holding at least one earned buff in a week | Over two thirds | Under a third. The buffs are not being chased |
| Share of timed cap filled by earned buffs against bought boosts | Both above a quarter | All bought, or none bought |
| Boss pieces listed and sold on the market | Sales in every band that has 5 or more accounts | Listed and never bought |
| Accounts that sell test Crowns for gold, and accounts that buy them with gold | Each over a fifth of active accounts | No buyers. Players with gold do not want what Crowns buy |
| The gold price of a Crown against the reference price | Inside half to twice | Pinned at an edge of the band |
| Level pace of the top tenth of accounts against the median, same hours | Under 1.6 | Over 1.7, which means the ceiling leaks |
| Open arena fights against real setups, not house teams | Over half by week two in the busiest band | Nearly all house teams |
| Five players asked "is buying Crowns worth it, and is it fair?" | Most say worth it, most say fair | "Not worth it" or "pay to win" from most |

**What would change the recommendation.**

- If the pace of the top accounts runs past the ceiling, a cap is leaking and the Crowns book does not open until the grid check G is green.
- If nobody with gold buys Crowns, the store is missing something players want, and the boost and Premium lists are re-cut before launch.

- If check A and the first boss weekend both show almost nobody spends stamina on a shared target, the world boss moves down and the castle or the arena moves up.
- If check C shows heroes cannot stand on both sides without a rewrite, the arena becomes its own program after the beta.
- If friends in the playtest ask to lend heroes without being prompted, hired heroes come back to Tyler as a call.
- If nobody joins a clan in 14 days among 30 strangers, the castle waits and the board is not built.

---

## 8. How the behavior numbers were read

Read 2026-11-21, read-only, on the pattern of `tools/char-state.local.mjs`: SELECT inside `begin read only`, the token read from its file as bytes and never printed. Only aggregates left the query. No name, id or note was written anywhere. The script was a scratch file and is not committed. The window is the journal, 2026-10-19 to 2026-11-21, 784 hours.

| Read | Result |
|---|---|
| Real people and accounts (the rule of `tools/balance-program/real-players.local.mjs`) | 4 and 5 |
| Clock hours with any real hunting | 452 |
| with two or more people's heroes hunting | 46 |
| with three or more | 2 |
| with two people's heroes on the same ground | 5, on two grounds |
| Hunted hero-hours, and those hunted while another person's heroes also hunted | 1,377 and 267 |
| Clock hours with any press, and with two people pressing | 321 and 16 |
| Ten-minute windows with any press, and with two people pressing | 675 and 5 |
| Days with hunting: average people hunting, days with two or more, with three or more | 31 days: 1.48, 14, 1 |

**Limits.** Four people, and two of them are most of the hours. One person is two accounts and is counted once. A press is a floor on presence, because reading the screen without pressing is invisible. These testers hunted about 3 hours a hero a day. At 12 hours a day heroes would overlap more. Presses would not.

---

## 9. Sources

Web sources were found by search on 2026-11-21. Several are fan wikis, forum threads or guides and are marked so. Where only a search summary could be read, the claim is kept narrow.

1. TibiaQA, playing on more than one account (fan Q&A, 2018): https://www.tibiaqa.com/163/is-it-possible-and-legal-to-play-on-more-than-one-account-at-a-time
2. TibiaQA, shared experience (fan Q&A): https://www.tibiaqa.com/19668/how-does-shared-experience-in-a-party-work and https://tibiaqa.com/24960/what-if-the-shared-experience-level-is-not-exact
3. Tibia fan wiki, Optional PvP: https://tibia.fandom.com/wiki/Optional_PvP
4. IdleOn on Steam: https://store.steampowered.com/app/1476970/IdleOn/
5. IdleOn wiki, Tips and Tricks: https://idleon.wiki/wiki/Tips_and_Tricks
6. Steam discussion, IdleOn (one player's list of cons): https://steamcommunity.com/app/1476970/discussions/0/4365754042816455043
7. Steambase, IdleOn player counts (third-party tracker): https://steambase.io/games/idleon/steam-charts
8. IdleMMO wiki, introduction (may be out of date): https://wiki.idle-mmo.com/getting-started/introduction
9. Idle Clans wiki, Clan events, Clan Bosses, Clan cup (read as search summaries, the pages would not load): https://wiki.idleclans.com/index.php/Clan_events , https://wiki.idleclans.com/index.php/Clan_Bosses , https://wiki.idleclans.com/index.php/Clan_cup
10. Idle Clans on Steam: https://store.steampowered.com/app/2103530/Idle_Clans
11. Milky Way Idle, update note on queued party combat: https://www.incrementaldb.com/update/2dfb6aa1-62fc-4e4d-b85a-76cc92f0ca53
12. Milky Way Idle, review summary (automated, weak): https://vaporlens.app/app/3224420/milky_way_idle.md
13. Old School RuneScape wiki, Account (the Rules page reads differently, so check before relying on it): https://oldschool.runescape.wiki/w/Account
14. Old School RuneScape wiki, Group Ironman Mode: https://oldschool.runescape.wiki/w/Group_Ironman_Mode
15. Old School RuneScape wiki, Wintertodt points: https://oldschool.runescape.wiki/w/Wintertodt_points
16. Not used.
17. Albion Online review noting Premium for each character (one reviewer): https://requnix.com/albion-online-review/
18. EVE University wiki, Multiple Character Training: https://wiki.eveuniversity.org/Multiple_Character_Training
19. Torn wiki, War and Chain, and a player-run newspaper: https://wiki.torn.com/wiki/War , https://wiki.torn.com/wiki/Chain , https://torncitynewspaper.blogspot.com/2022/06/a-users-guide-to-tyranny.html
20. Massively Overpowered on Wakfu Heroes (about 2015) and a Steam forum post: https://massivelyop.com/tag/wakfu-heroes/ , https://steamcommunity.com/app/215080/discussions/1/7439433895938079156
21. Wikipedia and MMOs.com on Granado Espada: https://en.wikipedia.org/wiki/Granado_Espada , https://mmos.com/review/granado-espada
22. Fextralife wiki, Dragon's Dogma pawns: https://dragonsdogma.wiki.fextralife.com/Pawns
23. PC Gamer and Automaton on fake pawn hires in Dragon's Dogma 2: https://www.pcgamer.com/games/rpg/dragons-dogma-2-players-in-shambles-as-they-discover-capcom-might-be-pity-renting-their-unwanted-scraggly-pawns , https://automaton-media.com/en/news/dragons-dogma-2-has-fake-players-that-hire-less-desirable-pawns/
24. AFK Arena fan guide, mercenaries (numbers may be dated): https://afk.guide/?p=7146
25. AFK Arena fan guide, Arena of Heroes: https://afk.guide/arena-of-heroes
26. Super Auto Pets store page and community wiki: https://store.steampowered.com/app/1714040/Super_Auto_Pets/ , https://superautopets.wiki.gg/wiki/The_Basics
27. Guild Wars 2 wiki, Structured PvP and PvP Build: https://wiki.guildwars2.com/wiki/Structured_PvP , https://wiki.guildwars2.com/wiki/PvP_Build
28. TibiaQA, transferable and non-transferable Tibia Coins (fan Q&A): https://www.tibiaqa.com/19703/what-the-difference-what-you-with-transferable-transferable-tibia-coins and https://tibiaqa.com/33524/after-what-time-do-non-transferable-coins-become-transferable
29. TibiaQA, what XP boosts cost and the five a day limit (fan Q&A, may be dated): https://www.tibiaqa.com/18044/how-much-tibia-coins-do-xp-boosts-cost?show=18045
30. TibiaQA, store boost stacking (fan Q&A): https://www.tibiaqa.com/336/does-the-exp-boost-from-the-store-extend-stack-with-the-daily-reward-boost?show=390
31. RuneScape wiki, Bond and the announcement of bonds: https://runescape.fandom.com/wiki/Bond , https://runescape.wiki/w/Update:An_Important_Message_from_Mod_MMG
32. Blizzard, Introducing the WoW Token (2015), and the Warcraft wiki: https://worldofwarcraft.blizzard.com/en-gb/news/18141101/introducing-the-wow-token , https://warcraft.wiki.gg/wiki/WoW_Token
33. EVE University wiki, PLEX, and an EVE forum thread on pay to win: https://wiki.eveuniversity.org/PLEX , https://forums.eveonline.com/t/pay-to-win-or-not-a-pay-to-win/51305
34. Guild Wars 2 wiki, Currency Exchange, and PC Gamer on the model: https://wiki.guildwars2.com/wiki/Currency_exchange , https://pcgamer.com/guild-wars-2-microtransactions-work-like-eve-plex-claim-arenanet-everyone-wins
35. Dot Esports, "Is Albion Online pay to win", and Sportskeeda on the gold market's fee: https://dotesports.com/general/news/is-albion-online-pay-to-win , https://www.sportskeeda.com/mmo/gold-markets-albion-online-purchase-fees-trading
36. PC Gamer and MMOs.com on Black Desert Online's cash shop items on the market: https://www.pcgamer.com/black-desert-online-players-protest-pay-to-win-changes-with-in-game-picket-signs , https://mmos.com/news/black-desert-online-to-allow-pearl-items-on-in-game-marketplace-yesterdays-bans-explained
37. Amazon Games support on Lost Ark's currency exchange, and GameGrin on pay to win: https://amazongames.com/en-ca/support/lost-ark/articles/what-is-the-currency-exchange , https://www.gamegrin.com/articles/is-lost-ark-pay-to-win
38. Milky Way Idle, developer post on tradable cowbells and a membership (Steam discussion): https://steamcommunity.com/app/3224420/discussions/0/600776571073120773
39. Massively Overpowered on Tibia's XP boosts: https://massivelyop.com/?p=73580

**In the repository.** `10-real-players.md`, `57-review-social.md` (sections 5, 10 and 11.5), `59-review-features.md`, `50-standards.md` (C2, C4, E1, E4, P4), `44-formula-architecture.md` (steps R10 and R11, the one modifier table), `47-itemization-fit.md` (C20, a band is a tier's worth), `24-economy.md` (the five clamps), `30-decisions.json` (24-5, 25-1 to 25-7), and `48-platform-cost.md` on `lane/d-platform-cost` at 29648393e, which is a work in progress and whose numbers may still move.

**Not done.** Nothing was played. No replay or grid was run. No idle MMO with an arena was found. The Idle Clans pages were read only as search summaries. Melvor Idle and SimpleMMO were not sourced. Every statement that players will enjoy a part of this design is a HYPOTHESIS.
