# Balance program 49: the MMO layer

Game director study, 2026-11-21, on `lane/d-party-model`. Design only. No game code, data or migration is touched. The file was asked for as `49-party-model.md` and is named `49-mmo-layer.md` because Tyler settled the party model while the study ran and gave it this subject.

**The frame, as ruled by Tyler on 2026-11-21.**

- Every account runs four heroes from the start.
- The same party buffs apply to everyone, and hunting your four together is the obvious choice. There are no balance targets by party size, and this file proposes none.
- One Premium covers the account.
- The MMO part of the game is clans, world bosses, events and PvP arenas.

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

**The recommendation: the Standing World.** One design in five parts.

1. **World bosses with one shared health pool.** A boss stands for a weekend. Each account sends its four into its own boss room. Every party's damage comes off one pool that the whole server shares. The pool is sized to the number of active accounts.
2. **Clans as a shared work, a team and a room.** A roster, a chat tab, a castle the clan builds from its surplus, rations from its cooks, and a weekly clan board. A clan gives no hero power.
3. **A calendar written a year ahead.** Four weekend types in rotation. No daily quests, no login calendar, no season pass.
4. **An arena where your four fights another account's saved four.** The server plays the fight. Stats are normalized, so the party you built and the bars you wrote decide it. Rewards are titles, banners and rank.
5. **A presence strip.** On every ground and boss you see who else is there, by party and clan.

**What the target game does not have.** Hired or on-call heroes. Hunting grounds where several accounts fight the same monsters. A raid of many heroes in one fight. PvP on the hunting grounds. Dailies.

**Why.** Every part obeys rule 0. Every part works at 10 accounts and at 10,000. The whole layer is estimated at under 2 of the 60 database-seconds an account-day the server budget allows. Every part has a comparable game behind it, with sources in section 3.

**Confidence.** High on the shape, because it follows from how idle players behave and from the engine's own limits. Medium on build size, because the arena needs heroes on both sides of a fight and that has never been run. Low on fun: every claim that players will enjoy these is a HYPOTHESIS until the playtests in section 7.

**Strongest alternative, in one line.** Hired heroes as the centerpiece, so every party holds other people's heroes, which is the strongest togetherness an idle game can offer and fails when Levels do not match or the server is small.

---

## 2. The parts compared

| Part | Player value | What you see of other people | At 10 accounts | At 1,000 and up | Server cost (budget 60 DB-s an account-day) | Build size | Main risk | Evidence |
|---|---|---|---|---|---|---|---|---|
| World boss, shared pool | A reason to tune your party and bars for a weekend. A chest | One health bar the server moves while you are away. Names of the parties fighting now. Your clan's share | Works. The pool is sized to active accounts, with a floor one account can fell | Works. Nothing is shared but one row | About 0 added. The fight spends stamina like a hunt. One cron statement a minute (ESTIMATED) | L | Reward size. Too low and it is skipped, too high and it is a duty | EVIDENCE [15]. HYPOTHESIS: fun |
| Clans | A shared goal for surplus gold and goods. A team to belong to | Clan chat. Clan mates on the boss and the board. A castle that grew while you slept | Roster, chat, castle and rations work. The board needs about 5 clans | Works. The browser needs search | About 0 (ESTIMATED) | M for the roster and chat. M to L for the castle | An empty clan is an empty room. Alt accounts padding a roster | EVIDENCE [9][19]. HYPOTHESIS: use |
| Calendar | Something different each weekend with no daily chore | One line and one banner the whole server sees at once | Works | Works | 0. An event is a row | S | Live ops run by hand | HYPOTHESIS that events bring people together |
| Arena, async, normalized | Your build tested against a person's build | A ladder of names. A replay of your four against a rival. Clan standing | Works. Opponents are saved setups and house teams | Works. Rating bands, seasons | Under 1 DB-s an account-day at 5 fights a day (ESTIMATED) | L | Heroes on both sides of the engine is unproven. Style balance in PvP is unknown | EVIDENCE [25][26][27]. No idle MMO arena found. HYPOTHESIS: fun |
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

**Rewards that stay off the gear curve.**

| Reward | Rule | Reason |
|---|---|---|
| A chest at point thresholds | Paid by your own points, on the pattern of [15] | A full server does not dilute you and an empty one does not starve you |
| Chest contents | Goods the gold sinks consume (tempering goods, lining parts, hall keys), by the hero's own band | Nothing enters the gear ladder. No piece above what the hero's Level drops |
| One account trophy for each boss | Not tradeable, no shop value | A record of having been there |
| Names on a plaque | First blow, last blow, top clan | The strongest "others matter" line, and free |
| Level XP | About what the same stamina earns on a Normal hunt | Never a loss and never the best XP in the game |
| Coin | None | Keeps the boss out of the gold model |
| Death | A death in the boss room costs what a death costs anywhere | One rule set. Risk is what makes the tier choice real |

**Server cost.** A boss fight is an ordinary four in an ordinary instance and spends stamina, so it takes the place of hunted hours. The fold of new damage into the pool is one statement a minute while a boss stands, about 4,300 runs a weekend. ESTIMATED at about 10 ms a run, that is under a minute of database time for the whole server in a weekend. The rule that keeps it there: nothing is added to the settle path. Damage is counted in the row the settle writes for the hunt.

**Population.** 10 accounts: a weekly boss with a few names on it. 100: the plaque and the clan line are a contest. 1,000 and up: the same, because nothing is shared but one row.

**Build size.** L. The parts are a boss room, scaling to the party, a server-sized goal with stages, a plaque, a points rule, a chest claim and a page. The chest claim is a reward surface and goes through Security.

**HYPOTHESIS.** That players spend stamina on it. That watching a shared bar fall feels like company.

### 5.2 Clans

**The rule.** A clan is a shared work, a team and a room. It never fills a party seat and it never gives a hero power.

| Piece | Rule | Reason |
|---|---|---|
| Roster | One clan an account. Leader, officer, member. A leader away 14 days passes it on. A browser to find one | A name and a list of people |
| Chat tab | One room for the clan | The room |
| The castle | One project at a time. Members give gold and castle goods. Each stage changes how the castle looks and opens one thing, such as a bigger ration store. Gifts are one-way | The shared work. It is the same engine as the server's town project, so there is one engine to secure |
| Sized by members | A stage costs a fixed amount for each member. TARGET: a stage takes 2 to 4 weeks for a clan of 3 and for a clan of 60 | A small clan must be able to finish |
| Rations | The clan's cooks make bound meals for the clan store. Members draw them under a weekly cap | The one place a member directly helps a member, and a second use for cooking |
| The weekly clan board | Three lines: world boss points, arena standing, best Tower floor. Scored as the average of the clan's top members. Resets weekly, with all-time records. Pattern from [9] | A team to cheer for. Average scoring lets a small clan win |
| The tag | The clan's tag beside a name on plaques, the System tab, the presence strip and the ladder | The audience |

**Why no hero power.** Idle Clans gives 2% XP for each member in an event [9]. Accounts are free, so a power bonus for member count would be farmed with extra accounts, and each one costs server money. A clan pays in a castle, rations, rank and names.

**What the player experiences.** You join from the browser in a minute. Your visits now open on clan chat, the castle's progress and who gave. Your cook's surplus becomes rations someone else's four eats. On Sunday the board says where your clan finished.

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

| Weekend | Event |
|---|---|
| 1 | World bonus weekend: +25% Level XP |
| 2 | A world boss stands |
| 3 | One ground's weekend |
| 4 | Arena season end, clan board honors, and a push on the town or castle project |

**The reason.** Every weekend has one thing the whole server shares, and no two in a row ask for the same thing. A one-person team cannot run live ops by attention, so the calendar must not need any.

**No dailies, no login calendar, no season pass.** With four heroes a daily is four chores, and a visit is 2 to 5 minutes. The beats of the game are the visit, the stamina bar, the weekend and the monthly project. The Premium login reward is not a daily in this sense as long as its streak never resets.

**What the player experiences.** One line in the System tab and one banner in town on Friday. Something to aim the four at that is different from last weekend.

**Server cost.** 0. **Build size.** S. **HYPOTHESIS.** That an event brings anyone to the screen. TARGET for the playtest: more ten-minute windows with two people pressing on an event weekend than on weekdays.

### 5.4 PvP arenas

**What PvP is when combat runs itself.** A test of preparation. You choose the four, what they wear and what their bars do. The server then plays the fight with the same combat engine as a hunt, and you watch what your rules did against a person's rules.

**The rule.** Your four fights another account's saved four. The server simulates it. Stats are normalized. It pays rank and looks, and nothing else.

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

**Fairness.**

| Way | What decides a fight | At 10 accounts |
|---|---|---|
| Real stats, open ladder | Hours played and gold spent | The highest account wins forever |
| Real stats in Level and gear bands | Hours and gold inside the band | Most bands hold one account or none |
| **Normalized (recommended)** | The four you chose and the bars you wrote | Everyone can fight everyone |

In the normalized arena every hero fights at one reference Level, with reference skills and a reference kit of its own weapon type and armor weight. What stays yours: which four, their styles, spells, bar rules, stance and distance. Guild Wars 2 does this [27]. More arenas at higher reference Levels can follow when late spells need a place.

**The money call inside it.** Tyler's stated intent is that players who buy gold get an edge through the gold sinks. In hunting they do. I recommend the one head to head mode stays clean of it. "Pay to win" is said about PvP first, and normalization is the only form that has opponents on a small server.

**Rewards.** Titles, a banner on the name, an arena dye, the season plaque, clan board points. No gear, gold or goods, and nothing tradeable. With nothing of value paid there is little reason to cheat and nothing for the economy to absorb.

**What the player experiences.** You open the arena on a visit, see three named rivals, pick one, and watch a 90 second fight or skip to the result. Your rank moves. Next visit a line says who attacked your four and how it went.

**Matchmaking by population.**

| Accounts | Opponents | Ladder |
|---|---|---|
| 1 | House teams | None |
| 10 | Nine saved fours and the house teams. You meet the same names, which at this size is the point | One list |
| 100 | Three offered near your rating | A real ladder. Clan standing means something |
| 1,000 and up | Rating bands | Top 100, your own neighborhood, the clan league |

**Server cost.** A fight reads two saved setups, simulates in the edge, and writes one result. ESTIMATED at 0.13 to 0.2 database-seconds a fight from the measured cost of one settle read and one press (`48-platform-cost.md`, a work in progress). Five fights a day is under 1 of the 60. The simulation is edge CPU, not database time, and a 90 second fight of eight units must be timed before it is trusted.

**Anti-cheat.**

| Threat | Answer |
|---|---|
| A forged result | The client sends one intent: fight offered opponent 1, 2 or 3. The server builds both sides from its own tables, picks the seed, runs the fight and writes the result |
| A forged setup | Setups are saved by the server from server tables. No stat crosses from a browser |
| Win trading and feeding from a second account | You cannot choose who you fight, defense does not move rating, and rewards are worth nothing outside the ladder |
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

---

## 6. The recommendation, and the calls

### 6.1 Order

Tyler wants every decision made before any build plan. This is the order I recommend ruling on, not a plan.

| # | Piece | Size | Why here |
|---|---|---|---|
| 1 | The calendar | S | The frame the rest hangs on |
| 2 | Clans: roster, ranks, browser, chat, tag | M | Gives every later piece a team to credit |
| 3 | The two thirds line | S | One formula, and it must exist before any mixed party |
| 4 | The engine check for the arena: heroes on both sides | A measurement | The one unknown that could change this order |
| 5 | World boss | L | Works at any size. The first place other accounts move a number you care about |
| 6 | The clan castle and rations | M to L | The shared work, and a home for gold |
| 7 | The arena | L | The largest unknown, after two smaller wins |
| 8 | The weekly clan board | S to M | Reads what 5 and 7 count |
| 9 | The presence strip | S | Cheap. Can move earlier |

**Server cost of the whole layer.** ESTIMATED under 2 database-seconds an account-day of the 60: the arena under 1, the presence strip about 0.5, the rest close to nothing.

### 6.2 The calls Tyler must rule on

| # | Call | Recommendation | Rulings it would replace |
|---|---|---|---|
| 1 | Rule 0: every shared feature works while both players are asleep | Yes, as a standing rule | |
| 2 | World boss form | One shared pool, fought in own rooms | The 2026-10-22 note that live world events get a redesign: this is it |
| 3 | World boss timing | A window of about 72 hours, never a set hour | |
| 4 | World boss size | A fixed amount for each weekly active account, with a floor one account can fell | |
| 5 | World boss contribution | Counted against your own Level, in a room scaled to your party. Harder tiers pay more | |
| 6 | World boss pay | A chest by your own points with goods the sinks use, one account trophy, plaque names, Level XP near a Normal hunt, no coin, nothing above your band's gear | |
| 7 | A death in the boss room | Costs the normal death | |
| 8 | What a clan is | A shared work, a team and a room. No hero power | |
| 9 | The castle | One project at a time on the town project's engine, sized by member count, one-way gifts, with rations | 25-4 of 2026-11-20 (built prices and work orders) |
| 10 | The clan board | Weekly, three lines, average of top members, honors only | |
| 11 | Events | The four-weekend rotation, written a year ahead. No dailies, no login calendar, no season pass, as a standing rule | |
| 12 | Arena opponents | Saved setups and house teams, never live | |
| 13 | Arena fairness | Normalized stats. Bought gold gives no arena edge | Narrows the 2026-11-18 intent to hunting |
| 14 | Arena rewards | Titles, banners, dyes, rank. No gear, gold, goods, XP or death | |
| 15 | Arena fights | Tickets that bank, 5 a day up to 20 | |
| 16 | Arena matching | Three offered by the server. Being attacked costs nothing. Defense is your last attack party | |
| 17 | PvP on the hunting grounds | Never | |
| 18 | Hired and on-call heroes | Not in the game | 25-1 of 2026-11-20, and the on-call board in 25-3 |
| 19 | Mixed Levels in one fight (GR-10b) | The two thirds line, visible, one rule for every party | The hidden Level cut |
| 20 | Shared hunting grounds | Seen through a presence strip, never fought over | |
| 21 | Premium and the layer | Nothing in the layer is Premium only, because shared content behind a payment splits a small population | |
| 22 | Where the gold for hero slots goes | Hand to the economy review with the castle as first candidate | |
| 23 | The order in 6.1 | Approve as the order for planning | |

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

**What would change the recommendation.**

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

**In the repository.** `10-real-players.md`, `57-review-social.md` (sections 5, 10 and 11.5), `59-review-features.md`, `50-standards.md` (C2 and C4), `30-decisions.json` (25-1 to 25-7), and `48-platform-cost.md` on `lane/d-platform-cost` at 29648393e, which is a work in progress and whose numbers may still move.

**Not done.** Nothing was played. No replay or grid was run. No idle MMO with an arena was found. The Idle Clans pages were read only as search summaries. Melvor Idle and SimpleMMO were not sourced. Every statement that players will enjoy a part of this design is a HYPOTHESIS.
