# Balance program 57: design review, social play and parties

Review of `lane/d-review-social` (game-designer, 2026-11-21). Phase A: reading and analysis only. No game code, data or migration was changed. No grid, matrix or browser run was made. Numbers come from the cached files on the set (`progression-grid.json` 07c836bfd, `ground-rates.json` 9486e873e, `paths.json` 8b03c56aa), from `10-real-players.md`, from `25-social.md` and from the code and data named beside each. Every claim in section 9 is marked EVIDENCE or HYPOTHESIS.

Briefs of record: `45-design-brief.md` (main) and `40-formula-brief.md`. Each proposed change names its LAYER: formula, coefficient, curve or content row.

Scope: party play (a player's own four and parties across accounts), party XP, clans and clan castles, factions, chat, friends, cooperation and social progression, and the open question of what a shared live world is for in an idle game.

## 1. One screen for Tyler

**Verdict.** The social half of Hearthrise was built for a different game. We built what an MMO you sit in front of needs: live invites, a live party finder, a Local chat room, a clan castle with five buildings, labour, votes, upkeep and a treasury. Hearthrise players visit for two to five minutes and their heroes play while they are away. So nobody has used any of it. Real players logged 0 hours with another person, 0 finder searches, 0 clans, 1 friend link.

The party itself is in better shape than the old dives said, and it has one clear law hiding in the numbers. A party does not make a hero faster. It lets a hero stand on a tier it could not survive alone. On the same tier, every party size earns about the same Level XP a head. That is a good law. The game should say it out loud and stop fighting it with extra multipliers.

If we designed this area from scratch today we would not build it the same way. We would build it around heroes that play while their owner is away. That means standing parties, heroes on call, one chat, a town that shows heroes at work, and one way to build things together at two sizes (the whole server and a clan).

**The five changes that matter most**

1. **On-call heroes and standing parties go first, ahead of clans.** You already ruled them. They are the only thing in this area that lets two real people's heroes hunt together when the people are never online in the same minute. Split the big lane so this ships in the beta on its own and clans follow when there are people to fill them.
2. **Keep a Level range on party XP, and show it.** You ruled the hidden cut should go. Once heroes can be lent across accounts, a Level 10 hero carried through Krell's Hold would earn about 21 times its own pace. Every early ground would become something you skip. Keep one visible rule in the Party window instead of a hidden one.
3. **Make the party XP table read party size only.** Today two friends who both like the starting sword are told they earn 55% less together. The class count in the table is a vocation rule in a game whose pitch is no vocations. Phase B measures the one thing that could sink this (a party of four Mages on Deadly).
4. **Fix the size ladder.** A pair earns as much a head as a four, or more, at every checkpoint from Level 5 to Level 145. The third and fourth hero add nothing a head. Your ruling says each step should be worth feeling.
5. **Do not finish the old clan castle. Rebuild it as rows on the Town Works engine.** The castle is 13 tables and 47 functions, half of them dropped, with labour the browser reports. Town Works already does staged building by donation with a plaque, on the server, safely. A clan castle is the same thing at clan size.

**Actively harming the game today**

- The first thing the game says to two new friends is "about -55% vs solo". It is true, and it is the wrong first sentence.
- The two measured files this program relies on disagree about whether a lone hero can hold Deadly. One says yes with no deaths. The other says it dies 104 to 219 times in four hours. The red line "parties are slower than a lone hero at Level 15" comes from the first file. No party number should move until that is settled.
- The Local chat tab holds one of only five live connections a player may have, and the clan tab needs one.

**What I would add**

- The town shows heroes at work whether or not their owner is online. Most heroes in an idle game are playing while the player is away. Show them.
- A friend link at sign-up. Your real players arrive with friends from Discord. One link makes two accounts friends and sets up their standing party.
- Nothing else. This area needs fewer systems, not more.

## 2. Systems review

### 2.1 The party as the numbers describe it

**The table.** `src/data/party-class-xp.js`: a kill's Level XP is split evenly over the living heroes, then multiplied by one cell read from party size and how many of four classes the party holds. A lone hero is paid x1.15 (`SOLO_XP_PM`).

| Size | 1 class | 2 classes | 3 classes | 4 classes | Kills needed to match a lone hero a head (best cell) |
|---|---|---|---|---|---|
| 1 | 1150 | | | | 1.00x |
| 2 | 880 | 1500 | | | 1.53x the lone hero's kills |
| 3 | 990 | 1600 | 1700 | | 2.03x |
| 4 | 970 | 1580 | 1670 | 1700 | 2.71x |

The last column is arithmetic from the table (size x 1150 / cell). The three and the four share one top cell (1700), so a fourth hero must add 33% more kills just to keep each hero's pay where the three had it.

**What the grid measured** (`progression-grid.json`, MID gear, 2 seeds x 2 h a cell, one ground a Level).

Gross Level XP a head an hour, same ground, same tier:

| Cell | Lone | Pair | Three | Four |
|---|---|---|---|---|
| Level 50, the Slake, Normal | 246k | 249k to 282k | 224k | 171k |
| Level 50, the Slake, Deadly | 507k, and it died 219 times in 4 hero-hours | 592k to 682k | 636k | 573k |
| Level 100, Krell's Hold, Normal | 576k | 554k to 612k | 489k | 375k |
| Level 100, Krell's Hold, Deadly | 1.11M, and it died 104 times | 1.07M to 1.11M | 1.08M | 1.00M |

So on one tier a hero's pay is nearly flat in party size. The table almost exactly cancels the split. The whole advantage of a party is that it survives the harder tier, where each kill pays about twice as much. I call this the party law in the rest of this file: **a party buys reach, not rate.**

Best cell a head against the lone hero's best cell (the lone hero's best is Normal from about Level 45, because it dies on the harder tiers):

| Levels | Pair | Three | Four | Lone net gold an hour | Four net gold a head an hour |
|---|---|---|---|---|---|
| 5 to 15 | 1.50 to 1.88 | 1.36 to 1.76 | 1.24 to 1.65 | 3.0k to 5.2k | 1.0k to 1.9k |
| 20 to 40 | 1.22 to 2.14 | 1.18 to 2.13 | 1.06 to 2.13 | 2.1k to 11.4k | -0.3k to 5.8k |
| 45 to 110 | 1.77 to 2.54 | 1.76 to 2.59 | 1.62 to 2.53 | 11.8k to 23.8k | 1.8k to 5.5k |
| 125 to 145 | 2.03 to 2.07 | 2.07 | 1.91 to 1.93 | 13.0k to 18.2k | -2.2k to -1.6k |
| 165 to 400 | 1.01 to 1.08 (Normal only) | 0.88 to 1.67 | 1.32 to 1.62 | 22.8k to 48.2k | -3.2k to 11.2k |

Five readings:

1. **Solo is viable on Normal at every Level to 400** (0.87 to 1.9 of the pace contract from Level 7) and is the gold seat: a lone hero nets about 2 to 7 times the gold a head of a four where the four makes gold at all, and from Level 125 to 350 the best four cells lose gold.
2. **The four is the XP seat**: 1.06 to 2.53 times the lone hero a head. It is inside the ruled 1.8 to 2.5 only from Level 35 to 60 and at 125 to 145. It is under it from Level 5 to 30, from 75 to 110 and from 165 on. Real play read higher than the harness (2.9 to 3.0 times the contract at Levels 45 to 84, `10-real-players.md`).
3. **The ladder is upside down.** The pair is at or above the four at all 18 checkpoints from Level 5 to 145. The three is too. Ruling 50-8 wants a pair at 1.2 to 1.5, a three at 1.5 to 2.0 and a four at 1.8 to 2.5.
4. **The four's edge shrinks at the top**: 1.5 to 1.6 from Level 165 to 300, and 1.3 to 1.5 from 325 to 400. The cell is flat while the lone hero's Normal keeps growing. That is the "solo and party diverging at high Levels" check in brief 40, section 7, and here they converge.
5. **XP against gold is a real decision for an account with four heroes**: one Deadly four for Levels, or four lone Normal hunts for gold. It is the best decision in this area and no screen states it.

**The two caches disagree.** `ground-rates.json` (1 h x 2 seeds) has a lone MID hero holding Deadly with 0 deaths on 25 of 26 party-ground cells, so the four reads 0.43 to 1.18 of the lone hero a head, and the solver built on it (`paths.json`) has the four slower than a lone hero at every Level from 11: 1.43 times the days to Level 15, 1.12 to Level 50, 1.08 to Level 185. The pair is the fastest path from Level 30. That is measure B9. The grid (2 h x 2 seeds, a later commit) has the lone hero dying 104 to 219 times in 4 hero-hours on the same Deadly cells. Both cannot be right. Real players died 6.7 times per 100 hours alone. Phase B must reconcile them before any party coefficient is touched. My reading: B9's red at Level 15 is partly real (Levels 1 to 5 in the Cellar and the Thicket punish a party) and partly the short sample.

**The seats.** In the best four cell at Krell's Hold the tank takes 108,808 damage an hour, the healer 1,093, the bow 1,072 and the mage 2,758. Every seat is paid the same. In the real Krell hunt 28% of the damage landed on the healer. So in the harness three of four seats are passengers. Whether each style gives a party something is the combat review's question. I hand it over in section 8.

### 2.2 Party systems, one by one

| # | System or part | What it is for | Plugs into | Earns its place? |
|---|---|---|---|---|
| P1 | Party of four (cap 4) | The unit every ground, tier and hall is sized for | grounds, tiers, halls, Tower | Yes |
| P2 | A player's own four (hero slots 400k, 1.5M, 4M) | The party most players will ever have. 91% of real hunt hours are in a party and every one is one account's own heroes | gold sinks, every ground | Yes. It is also why nothing else social is used, and that is fine once on-call exists |
| P3 | Party XP table, size term | Pays back the even split so a party is worth forming | `xp-share.js` | Yes, but the row is mis-shaped (pair at or over four) |
| P4 | Party XP table, class-count term | Tyler 10-31: a party is only better with different classes | `PARTY_CLASSES`, the Party window | No. See R1 |
| P5 | Solo +15% (`SOLO_XP_PM` 1150) | Paid a lone hero for taking the whole pull | every cell was rescaled by 1150/1050 when it moved | No as a separate number. It is a unit shift. Fold it into the base (formula audit) |
| P6 | The Level share cut (`underFloorSharePm`, 667) | A seat under the ground's floor and under two thirds of the party's top Level keeps (ratio squared) of its share | `xp-share.js` | The mechanic yes. Hidden and ground-keyed, no. Ruled cut on 11-08 and still in the code. See R2 |
| P7 | Even gold split, round-robin commons | Nothing minted, no seat favoured | `party-split.js` | Yes |
| P8 | The Rare Roll (1 to 100, winner waits until all have won) | A fair, visible moment for the drop that matters | `party-split.js`, reveal | Yes. It gets better with lent heroes: "my hero won the roll while I slept" |
| P9 | One drop a kill for the party | A four sees a quarter of the drops a head | loot, the gear path | Yes as a law, but it is why the party gear path is slow. Economy and items own it |
| P10 | Live invites | Form a party | Party window, chat | Only as the first step of a standing party. Alone it fails at 2 to 5 minute visits |
| P11 | Live party finder (weapon filter) and the unused seeker half | Find strangers online now | `hr_hunt_party_finder`, `party_seekers` | No. 0 real uses. See R5 |
| P12 | "Leave if anyone leaves or dies" box | One decision, remembered | hunt end reasons | Yes. 99 of 249 real hunts ended because a party member left, so the box matters and Carry on (L07) must cover the restart |
| P13 | Shared supply cost (ruled 10-25, unbuilt) | Stops the tank profiting while the healer pays | store bill, purse | Yes, for parties of more than one account. Real Krell hunt: tank +20,100 an hour, healer +4,800 |
| P14 | On-call heroes and standing parties (ruled 25-1, 2 h a day by default, 4 at most) | A party that does not need two people online at once | friends, clans, stamina, slots | Yes. The keystone of the area |
| P15 | The Tower's own party table (1000, 1100, 1200, 1300) | In the Tower a party's edge is floors, not XP | `tower.js` | A second party formula. Classify with the formula audit as an intentional special mechanic or fold it |
| P16 | Scaled hunts for a party leader (idea 11-07, held) | Lets a veteran hunt beside a newcomer on the newcomer's ground | grounds, on-call | Defer. It is the honest answer to carried leveling, so it gains value if R2 is taken |
| P17 | A fifth seat ("maybe 5 later", 10-15) | none | every ground would need re-measuring | No. Ruled out in 25-11. Strike the "maybe" |
| P18 | Party chat tab | Talk inside a party | the inbox topic | Yes, free |

### 2.3 Chat, friends, town

| # | System or part | What it is for | Earns its place? |
|---|---|---|---|
| C1 | Global chat (one room, ruled 28-6 and 31-1) | Presence. The one social system real people used (374 lines, 4 people) | Yes |
| C2 | Local tab ("Message everyone here") | A room for the place you stand in | No. Hunts are instanced, so "here" is your own party (which has its tab) or a town of 0 to 60. It holds one of five Realtime bindings (`CHAT_LIMITS.realtimeBindingsMax`). See R4 |
| C3 | System tab (server notices, rare drops) | The world's news | Yes. This is where a shared world is felt for free. Give it more to say: clan and Town Works stages, firsts |
| C4 | Combat tab | The hunt's log | Yes. Not social |
| C5 | Whispers | One to one | Yes. 0 real uses, near zero cost, and "list for a friend" and on-call need a way to talk |
| C6 | Blocks, mutes, word filter, name moderation | Safety | Yes. Required |
| C7 | The paid Town Crier line | Be noticed in a busy Global, a small gold sink | Yes, low. Pointless at 10 online, harmless |
| C8 | Rare drop broadcast (3 a hero a day) | Other people see your luck | Yes |
| C9 | Chat open by default (ruled 10-22, breaks as played, no lane in the plan) | A new player sees that other people exist | Yes. An orphan in the plan |
| F1 | Friends list and requests | Find the same person again | Only as the roster for on-call heroes and "list for a friend". Alone it has no job (1 link) |
| F2 | Inspect gear (worn items only) | Gear needs an audience | Yes. Cheap, and it is how a newcomer learns what to want |
| F3 | Players online, counted by activity, heroes of closed browsers included (11-18) | An honest population number for an idle game | Yes. It already counts heroes, not browsers. The town should do the same (A1) |
| F4 | Quiet presence | Privacy | Yes |
| T1 | The shared town (instances of 60, live positions) | One place where others are seen | Yes, but it shows browsers, and browsers are rarely there. See A1 |
| T2 | Town Works (the whole server builds one project by gifts, a plaque) | A shared goal that works at any population | Yes. The best shared-world mechanic we have. Reuse its engine (R6) |

### 2.4 Clans

No player, real or test, has ever made a clan row. Everything here is read from data and from `25-social.md` section 0.

| # | System or part | What it is for | Earns its place? |
|---|---|---|---|
| K1 | Clan roster, join and invite, kick and ban, browser (step 1, ruled 25-3) | A named list of people, and a pool of on-call heroes wider than a friends list | Yes, when there are people. At 10 online it is a second empty chat room |
| K2 | Clan chat tab | A room of people you know | Yes. Takes the binding Local frees |
| K3 | Membership per account (ruled 25-7), founding fee 100,000 (ruled 25-6) | One seat a person, a name worth something | Yes |
| K4 | Ranks | Who may invite and kick | Yes, three at most: leader, officer, member. Add succession (a leader 14 days away passes it on) |
| K5 | Votes (`clan_votes`, choose the next work order) | A say in the queue | No. One low-stakes choice does not need a voting system. The leader or an officer queues |
| K6 | Castle tiers (5) and member cap 10 to 60 | A long shared climb, a bigger roster | Yes as a destination. Not as built. See R6 |
| K7 | Five buildings, each level 1 to 10 at x1.58 a level | 50 more rungs | No. Fifty rungs that give nothing the game reads. The 25 re-shape renamed them. I would not have them at all |
| K8 | The board: work orders, supply, labour | The castle's build queue | Merge into the castle (ruled). Labour goes entirely: the weekly pace already paces it |
| K9 | The treasury (one-way, ruled 25-5) | The castle's purse | Merge. On the Town Works engine a gift is already one-way and journalled |
| K10 | Clan Standing (35% of deposit value) | A gate and a score | Merge into the plaque of givers |
| K11 | Upkeep (250 gold and 2 rations a building level a week) | Detects a dead clan | No. It is a weekly bill, and "no repair bills" is on your avoid list. Detect a dead clan by "no member hunted in 30 days" |
| K12 | Feast as bound rations (ruled 25-2), carried into the Catacombs under a weekly cap (ruled 30-8) | Cooks feed their clan, cooking gets a second consumer | Yes, later, with the castle. It is the one clan mechanic where a member helps a member |
| K13 | The rested grant | none | No. Ruled cut |
| K14 | The clan hunt of eight seats (held) | A reason for a clan to play together | Defer. Needs population |

### 2.5 Factions

| # | System or part | What it is for | Earns its place? |
|---|---|---|---|
| X1 | Two sides, joined after the first Krell kill (First Flame, Last Ember) | An identity after the story's first ending, visible in town | Yes. Ruled, built, dark until the Morrow pair opens |
| X2 | Standing (one point a hunted minute on a ground that pays your side) | A reason to favour half the grounds of a region | Yes, as a light pull on ground choice. It has a source and no sink after 300 hours |
| X3 | Outfit pieces at 25, 100 and 300 standing hours | A six-month look to earn | Yes. Earned, never sold |
| X4 | Swap (600 hunted minutes, 7 days) | Both looks reachable, no regret | Yes |
| X5 | Equal grounds a side in every later region (a guard) | Fairness | Yes, and note the price: it binds every future region's ground list for good |
| X6 | Faction skills Bulwark and Reap (ruled 31-8: make them matter) | A side you can feel in a hunt | Yes under 31-8. It becomes the first lasting build choice that is not gear. Sizing is combat's. The social question is per hero or per account (R8) |
| X7 | The weekly side tally and a side-against-side event (off until 20 heroes a side) | The sides as teams | Defer. Population |

## 3. Content rationalization

Verdict counts: KEEP 24, REMOVE 7, MERGE 5, REDESIGN 5, ADD 2, DEFER 4. Total 47.

| # | Item | Verdict | One-line reason |
|---|---|---|---|
| P1 | Party cap of four | KEEP | Everything is sized for it |
| P2 | Own four through hero slots | KEEP | It is the real party system |
| P3 | Party XP size row | REDESIGN | Pay a head must rise with size (R3). Layer: coefficient |
| P4 | Party XP class-count term | REMOVE | A vocation rule by another door (R1). Layer: formula |
| P5 | Solo +15% as its own constant | MERGE | Fold into the base so "lone is 1000" is the reference. No player number moves. Layer: coefficient |
| P6 | Level share cut | REDESIGN | One visible Level range rule, not a hidden ground-keyed one (R2). Layer: formula |
| P7 | Even gold split, round-robin commons | KEEP | |
| P8 | Rare Roll | KEEP | |
| P9 | One drop a kill | KEEP | Trace to items and economy |
| P10 | Live invites | MERGE | Into standing parties (ruled, L40) |
| P11 | Live party finder and seeker half | REMOVE | Merge its one job into the on-call board (R5) |
| P12 | Leave together box | KEEP | |
| P13 | Shared supply cost | KEEP (ruled, build) | State it as one rule: coin and the store bill both split evenly. Layer: formula |
| P14 | On-call heroes, standing parties | KEEP (ruled, build first) | |
| P15 | Tower party table | KEEP | Hand to the formula audit to classify |
| P16 | Scaled hunts for a leader | DEFER | |
| P17 | Fifth seat | REMOVE | Strike "maybe 5 later" from the rulings |
| P18 | Party chat tab | KEEP | |
| C1 | Global chat | KEEP | |
| C2 | Local tab | REMOVE | Frees a binding for the clan tab (R4) |
| C3 | System tab | KEEP | More world news in it |
| C4 | Combat tab | KEEP | |
| C5 | Whispers | KEEP | |
| C6 | Blocks, mutes, filter, moderation | KEEP | |
| C7 | Paid Town Crier line | KEEP | |
| C8 | Rare drop broadcast | KEEP | |
| C9 | Chat open by default | KEEP (ruled, give it a lane) | |
| F1 | Friends list | REDESIGN | Becomes the on-call roster and the "list for a friend" target |
| F2 | Inspect | KEEP | |
| F3 | Players online by activity | KEEP | |
| F4 | Quiet presence | KEEP | |
| T1 | Shared town | REDESIGN | Show heroes at work, owner online or not (A1) |
| T2 | Town Works | KEEP | Reuse the engine for clans |
| K1 to K4 | Clans step 1 | KEEP (ruled) | Ship after on-call, when there are people (R7) |
| K5 | Clan votes | REMOVE | |
| K6 | Castle tiers | DEFER | And rebuild on Town Works rows (R6) |
| K7 | Five buildings x 10 levels | REMOVE | Stages of one project replace them |
| K8 | Board, work orders, labour | MERGE | Into the one project. Labour removed |
| K9 | Treasury | MERGE | A gift is the purse |
| K10 | Clan Standing | MERGE | Into the plaque |
| K11 | Upkeep | REMOVE | |
| K12 | Rations | DEFER | With the castle. Rations are the four party meals (plan C6), bound |
| X1 to X5 | Factions, standing, outfits, swap, even grounds | KEEP | |
| X6 | Faction skills | REDESIGN | Per 31-8. Per hero, with a "join all" default (R8) |
| X7 | Side tally and side event | DEFER | |
| A1 | Heroes at work in town | ADD | Section 4 |
| A2 | Friend link at sign-up | ADD | Section 4 |

(K1 to K4 and X1 to X5 are counted as one KEEP each. The rested grant is already ruled cut and is not counted.)

### The eight criteria for each significant proposal

| | R1 Size-only party XP | R2 Visible Level range | R3 Size ladder | R5 Finder into the on-call board | R6 Castle on Town Works rows |
|---|---|---|---|---|---|
| 1 Player value | Two friends on the same weapon are no longer told they are wrong. Any four is a legal four | A carried hero cannot skip the game. A newcomer still gains beside a friend near its Level | A third and a fourth hero each feel like a gain | One list of heroes you can take along, friends and clan first | A clan builds something visible without bills, labour claims or votes |
| 2 Strategic depth | More. Composition becomes a real choice judged by the fight (who holds Deadly, at what food bill), not by a table | Adds "bring them up with you" as a real project. Makes scaled hunts worth building | Pair, three or four becomes a choice with a price in gold | None lost. The filter by weapon stays | The one decision that matters stays: what to build next |
| 3 Uniqueness | Removes a duplicate. The fight already punishes a party with no tank or healer on Deadly (HYPOTHESIS, phase B) | Replaces a hidden rule with a stated one | Fixes a row | Removes a duplicate surface | Removes a duplicate engine |
| 4 System interaction | Combat (which fours hold Deadly), economy (rune bills brake Mage parties), first hour (the Party window line) | On-call, alts, clans, early grounds, slot value | XP pace of pairs and fours, the 2.5 cap, the Level table's clock (ruled on the four) | Party window, friends, clans | Gold sinks, castle goods, the House, cooking, Security review size |
| 5 Balance impact | One row by size replaces a 9-cell table. Fewer exceptions | One formula of two Levels. Drops the ground floor from the condition | Three coefficients | None | None on combat. One sink moves engine |
| 6 Complexity cost | Low: data and the Party window's lines re-measured | Low: one function, one line of text | Low: data, then the whole matrix re-read | Low: delete a surface | Lower than the alternative. Rows and a goods list on a built engine against re-finishing dropped functions |
| 7 Long-term value | Holds as styles are added (the crossbow list, a sixth style). A class bucket table needs a ruling for each new style | Needed for as long as Levels are unlimited and heroes can be lent | Needed at every Level | Grows with clans | Same engine serves every later shared project |
| 8 Recommendation | REDESIGN (remove the class term) | REDESIGN | REDESIGN | REMOVE and MERGE | MERGE and DEFER |

| | R4 Local tab removed | R7 On-call first, clans second | R8 Faction side per hero | A1 Heroes at work in town | A2 Friend link at sign-up |
|---|---|---|---|---|---|
| 1 Player value | One less empty tab | The social feature that works at 10 online arrives first | A four can mix Bulwark and Reap | The town looks alive at any population, honestly | Two friends are a standing party in their first minute |
| 2 Strategic depth | None lost | None lost | A real trade: mixed skills against standing speed (a ground pays one side) | Where you leave a hero to work is seen | None. It is plumbing |
| 3 Uniqueness | Removes a duplicate of Global and Party | n/a | Without it the skill is one choice for four heroes | New. Matches the online count, which already counts closed browsers | New |
| 4 System interaction | Frees the Realtime binding the clan tab needs | Splits lane L40 | Faction skills (combat), standing | Server cost (platform), cosmetics, clan and faction marks | Friends, standing parties, hero creation |
| 5 Balance impact | None | None | Sized in combat's cell G4 | None | None. No reward is attached, so nothing to farm |
| 6 Complexity cost | Negative | Negative for the beta | Low. The build is already per hero | Medium. A standing body needs no position stream, so it may cost less than live presence a body | Low |
| 7 Long-term value | n/a | n/a | Lasts as long as factions do | Grows with population | First-week only, and that is when it counts |
| 8 Recommendation | REMOVE | Re-order | REDESIGN | ADD | ADD |

## 4. Missing opportunities

Brief 45 section 5 asks about "player cooperation and social progression" and "features that make hunting more engaging without requiring constant attention". I looked for more than two additions and turned the rest down. This area is short of use, not of systems.

**A1. The town shows heroes at work, whether or not their owner is online.** Why Hearthrise specifically: it is an idle game, so at any moment most heroes are fishing, smithing or training with nobody at the keyboard. The server already counts them as online (Tyler 11-18, "for the sake of transparency"). The town draws only bodies with a browser behind them, so at 10 players it is empty, and the town is the game's screenshot. A hero standing at the pier because it really is fishing is honest and costs no position stream. Seat friends and clan first, cap the bodies drawn. Layer: content rows and platform. The eight criteria are in the table above. Only the platform review can size the cost against 15 cents an account a month.

**A2. A friend link at sign-up.** Why Hearthrise specifically: the playtest population is friends arriving together from Discord, hero slots are priced so that friends are the fast way to a four (ruled 11-09 for exactly this), and today nothing connects two people until one right-clicks the other in a chat that is closed by default. A link or code makes two accounts friends, suggests different styles on the creation screen, and creates their standing party. No reward of any kind, so there is nothing to farm with a second account.

**Considered and turned down**

| Idea | Why not |
|---|---|
| A bonus for parties of more than one account | It pays people to open second accounts. Standards already hold own four and four friends within 10% a head |
| Lending heroes for a gold fee (mercenaries) | A boosting market with real-money pressure. Revisit only after on-call has a month of real use |
| A mentor system | On-call heroes, "list for a friend" and a Level range rule already cover what a veteran can do for a newcomer |
| Weekly clan tasks or tallies | You turned down weekly order lists on 11-18. A clan project and its plaque are the weekly reason |
| Public on-call to strangers | It gives every new account a free four and guts the slot ladder. Friends and clan only, as ruled |
| More chat rooms | One Global is ruled. The clan tab is the only room worth adding |

## 5. Interaction traces

Each is a HYPOTHESIS to measure in phase B unless marked otherwise.

**R1. Size-only party XP (remove the class term).**
- Combat: mono-style fours become legal. Four Mages kill fastest. If they also hold Deadly with no tank, they become the best four and the fix belongs in combat (cloth survival, monster reach to the back row), not in an XP table. Measure: fours of one style and of two styles on Deadly at Levels 15, 50 and 100 at the size-only cell. EVIDENCE that the risk is bounded on Normal: at the Thicket a one-class four reads -60 to -70% of its heroes alone at cell 970, which is about -39% at 1700, the same as a mixed four's -35%. So on Normal the class term is the whole difference and the fight itself does not prefer a mix.
- Economy: rune and potion bills are the brake on caster parties (a pair with a Mage nets -10k to -17k gold an hour from Level 35). A four of Mages should lose gold fast. Measure net gold a head.
- Progression: the pace of the best four must not move (the mixed four's cell is unchanged).
- First hour: the Party window's "-55%" line for two shields becomes the Cellar's honest size line (about -30%), and the Sewer line turns positive for any pair.
- Gear and crafting: none expected.

**R2. A visible Level range on party XP.**
- Today's code: a seat under the ground's floor and under two thirds of the top Level keeps (ratio squared). The 11-08 ruling removes it. Without it a Level 10 hero in a Level 100 four at Krell's Hold is paid about 1.0M XP an hour against 47k at its own best ground (EVIDENCE, grid cells). That is 21 times.
- Parties and on-call: with heroes lent across accounts, the fastest way to level any hero becomes "sit in a friend's Deadly four". Every ground under the party's Level is skipped, and a market in carries appears.
- Progression: with the rule kept and shown, a new hero levels on grounds near its Level. Alts take as long as you ruled they should (11-09).
- Risk said plainly: the harness says the back row takes about 1% of the damage, so a low hero would survive there. Real play says 28% lands on the healer, so it might die. The ruled gate (risk and death) depends on which is true.
- Proposed formula: share = min(1, (Level / (0.667 x top Level)) squared). No ground term. One line in the Party window.

**R3. The size ladder.**
- Moving the pair down (1500 toward about 1350) and the four up (1700 toward about 1900) changes who is fastest. The four's top is bound by the ruled 2.5 cap, and the grid reads 2.53 at Level 60 already, so the room is in the pair and the three, not the four. Likely shape: lower the pair and three, hold the four.
- Economy: a pair is where most accounts sit for weeks (the second hero arrives about day 20). Slowing the pair slows the mid-game by up to a fifth. The Level table's clock is ruled on the four, so that is allowed, and it must be seen in the matrix before it is chosen.
- Unintended: the three-hero account (weeks 6 to 15) must not read as worse than its pair was.

**On-call heroes (ruled, traced here because the plan's row is thin).**
- Hours: an on-call hour spends the lent hero's own stamina. So lending only pays when the borrowed party is better than what the hero would do alone. For a one-hero account that is nearly always true (a four's seat pays 1.2 to 2.5 times lone XP). For an account with its own four it is false. So on-call is naturally the tool of the first 4 to 15 weeks, which is the window slot prices create.
- Economy: borrowed heroes are free seats, so they soften the 5.9M slot ladder. The 2 hour default cap bounds it. Watch slot purchases a week after on-call opens.
- Gold: a lent hero in a Deadly four earns less gold than it would alone on Normal (four 1k to 5k a head, lone 8k to 24k). The owner must see that before saying yes, and shared supply cost must ship in the same patch or a lent Mage pays for someone else's hunt.
- Death: a lent hero that dies loses 6% of its total Level XP, uncapped (ruled 50-4). The owner's limits (grounds, tier) are the only guard. This is the one place a stranger's choice can cost a player days. It must be on the consent screen in plain words.
- Server: no new settle statement (25, card 1).

**R6. The clan castle as Town Works rows.**
- Economy: the castle stays a one-way sink for gold and castle goods. Its size is a set of rows (the built 8.67M gold and the goods list can be kept as stage totals, per ruling 31-3). Dropping the 50 building levels drops about 4.6M gold and 28,000 beams of sink. Re-size the five stages to hold the total if the economy review wants the sink kept.
- Crafting: castle goods keep two consumers (the House and the clan). Slime Gel and the Keystone still need fixing (ruled 31-3).
- Security: one engine to review at Early Access, not two.
- Unintended: Town Works has a per-account daily gift cap (25,000). A clan project needs its own cap row and the weekly pace, or a buyer finishes it in a day.

**A1. Heroes at work in town.**
- Platform: one row a working hero, changed only when its job changes, against today's 2 to 6 second polling. Could lower the town's cost. Must be measured against the 15 cent budget.
- Money: outfits and faction looks gain an audience at every hour, which is what cosmetics need.
- Unintended: a town full of statues. Cap bodies an instance and prefer friends and clan.

**R8. Faction side per hero.**
- Combat: a four may carry both skills. If one skill is better on every seat, every hero takes it and the side split collapses, so "equal in value" must hold a seat (cell G4).
- Standing: a mixed four earns standing on half its heroes on any ground. That is the price of mixing, and it is a fair one.

## 6. Priority list

| # | Change | Class | Complexity | Risk | Expected benefit | Depends on | Evidence or hypothesis |
|---|---|---|---|---|---|---|---|
| 1 | Reconcile the two caches on whether a lone hero holds Deadly, then re-read B9 | Critical | S | Low | Every party number rests on it | The matrix lane | EVIDENCE of the conflict |
| 2 | On-call heroes, standing parties and shared supply cost ship in the beta as their own lane (split L40) | Critical | L | Medium: death and gold on a lent hero | The first hours with another person the game has ever logged | Carry on (L07) | EVIDENCE: 0 hours, visits of 2 to 5 minutes. Fun is a HYPOTHESIS: playtest |
| 3 | A visible Level range rule on party XP (R2) | High | S | Low | Stops carried leveling before on-call opens it across accounts | Tyler's call | EVIDENCE 21x. Abuse is a HYPOTHESIS |
| 4 | Size-only party XP (R1) | High | S | Medium: a Mage four | The first social act stops being punished. One row replaces nine cells | Phase B measure, Tyler's call | HYPOTHESIS, bounded by EVIDENCE on Normal |
| 5 | The size ladder (R3) | High | S | Medium: slows pairs | Each added hero is worth feeling, as ruled 50-8 | Item 1, the matrix diff | EVIDENCE: pair at or over four at 18 of 18 checkpoints |
| 6 | The Party window states the party law and the gold trade ("a party earns Levels, alone earns gold") and names the Sewer | High | S | None | The best decision in the area becomes visible | L04 | EVIDENCE: lone gold about 2 to 7x a head |
| 7 | Friend link at sign-up (A2) | Medium | S | Low | Friends are a party in minute one | Item 2 | HYPOTHESIS |
| 8 | Heroes at work in town (A1) | Medium | M | Server cost | A town that is alive at 10 online | Platform sizing (L25) | HYPOTHESIS |
| 9 | Clans step 1, after the beta shows 50 accounts a day | Medium | M | Low | A room and a wider on-call pool | Item 2 | HYPOTHESIS: nobody has ever used a clan |
| 10 | Faction side per hero with a "join all" default, skills sized to matter (R8) | Medium | S | Low | The side becomes a build choice a four can mix | Combat sizes the skills (L53) | Ruled 31-8 |
| 11 | Chat open by default with System lines gets a lane | Low | S | None | A new player sees other people exist | none | EVIDENCE: played in 25, orphan in the audit |
| 12 | Remove the Local tab (R4) | Remove or simplify | S | None | A free binding for the clan tab | none | EVIDENCE: binding count in `chat-channels.js` |
| 13 | Remove the live finder, merge into the on-call board (R5) | Remove or simplify | S | None | One list where there were two | Item 2 | EVIDENCE: 0 uses |
| 14 | Fold solo +15% into the base | Remove or simplify | S | None, if the matrix reads identical | One less constant | Formula audit | EVIDENCE: cells were rescaled by 1150/1050 |
| 15 | Remove clan votes, upkeep, labour and the 50 building levels | Remove or simplify | S (they are dark) | None today | The castle that is built later is small | Item 16 | EVIDENCE: 25 section 0 |
| 16 | The clan castle on Town Works rows, with rations (R6) | Defer | M | Low | A clan goal without a bespoke engine | Clans with 10 or more accounts | HYPOTHESIS |
| 17 | Scaled hunts for a leader, the eight-seat clan hunt, the side tally and side event | Defer | L | n/a | Veteran beside newcomer, clans and sides as teams | Population | HYPOTHESIS |

**Where only real players can tell.**

| Question | Playtest that answers it |
|---|---|
| Is it fun to find your hero came back from a friend's hunt? | Two to four real accounts on different schedules for a week with on-call live. Read hunt hours with another account in them, and ask them |
| Do friends actually group in the first week? | The share of hunt hours under Level 33 with two or more accounts. Target 10% (the plan's line) |
| Does anyone talk in a clan tab? | Lines a member a week, once 50 accounts a day play |
| Does a town of working heroes feel alive or dead? | Show both to five playtesters. Ask which game has more players |
| Does a visible Level range rule feel fair to a veteran with a new friend? | Ask the pair. If it reads as a wall, scaled hunts move up the list |

## 7. Tyler decides

1. **Keep a Level range on party XP, shown in the Party window.** A hero far below the party's top Level keeps a smaller share: under two thirds of the top Level, its share falls with the square of the gap. Reason: your 11-08 ruling removes the hidden cut, and with lent heroes a Level 10 hero carried at Krell's Hold would earn 21 times its own pace, so every early ground becomes skippable. Strongest alternative: cut it as ruled and accept carried leveling as how alts and friends are raised.
2. **Party XP reads party size only. The class count goes.** Reason: "about -55% vs solo" is the first thing two friends are told, there are no vocations in this game, and on Normal the class cell is the whole difference between a mixed four and a same-style four, which means it is an XP patch for something the fight should decide. Phase B measures same-style fours on Deadly first. If four Mages hold Deadly and out-earn a mixed four, I withdraw this and send the finding to combat. Strongest alternative: keep the table and soften the one-class cells to about 10% under the mixed ones.
3. **On-call heroes, standing parties and shared supply cost ship in the beta. Clans wait for 50 accounts a day.** Reason: on-call works at 10 online, and a clan at 10 online is a second empty chat room. Lane L40 bundles four things and is the largest social build. Strongest alternative: all of L40 in the beta as ruled on 25-3.
4. **The clan castle is rebuilt later as projects on the Town Works engine. The old castle code is retired.** One project at a time, stages, gifts of gold and goods, a weekly pace, a plaque. No building levels, no labour, no upkeep, no votes. Rations stay, as you ruled. Reason: the old code cannot complete, trusts a number from the browser, and duplicates an engine that already works. Strongest alternative: the 25 re-shape as ruled, which re-finishes the bespoke functions.
5. **Remove the Local chat tab.** Reason: hunts are instanced, so "here" is your party or a near-empty town, and Local holds the connection the clan tab needs. Strongest alternative: keep Local as town talk and carry the clan tab on a shared social topic.
6. **Remove the live party finder. Its job moves to the on-call board.** Reason: 0 uses, and a list of who is online this minute is the wrong shape for 2 to 5 minute visits. Strongest alternative: keep it dark until 1,000 players are online.
7. **The town draws heroes at work whether or not their owner is online.** Reason: the online count already includes them, and the town is empty without them. Strongest alternative: draw only live players and accept an empty town until the game is big.
8. **A faction side is chosen per hero, and one press joins them all.** This amends 25-10. Reason: you ruled on 31-8 that the skills must matter, and then a four that wants both Bulwark and Reap should be able to have them at the price of slower standing. Strongest alternative: account-wide as ruled, and every four carries one skill.
9. **A friend link at sign-up, with no reward.** Reason: your players arrive as friends, and the game does nothing with that. Strongest alternative: nothing, and rely on Discord.

Not a call, because it only carries out rulings you made: the size ladder (50-8), shared supply cost (10-25), chat open by default (10-22), striking "maybe 5 later" (25-11).

## 8. For other areas

| For | Finding |
|---|---|
| Formula audit (41 to 44) | Three party formulas live in `xp-share.js`: the size and class table, the Tower's own table (1000, 1100, 1200, 1300), and the Level share cut (`underFloorSharePm`, keyed to a ground's floor). `SOLO_XP_PM` 1150 is a unit shift that every party cell was rescaled for. Classify each. My proposals: one size row, one Level range formula with no ground term, solo folded into the base |
| Formula audit, matrix lane | `ground-rates.json` and `progression-grid.json` disagree on a lone MID hero on Deadly (0 deaths against 104 to 219 in 4 hero-hours). B9 and the solver's level paths read the first. Settle which is right before B9 is called red |
| Combat review | In the harness three of four seats take about 1% of the party's damage and all four are paid the same. In real play 28% landed on the healer. Does each style give a party something a fight can feel? Also: can a same-style four hold Deadly (my R1 depends on it)? Faction skills sized to matter, equal a seat |
| Combat review | The four's edge over a lone hero falls from about 2.5 at Level 60 to about 1.33 at Level 400. Is that intended? |
| Economy review | A party is the XP seat and a lone hero the gold seat (about 2 to 7 times the gold a head). The best four cells lose gold from Level 125 to 350. An account with four heroes chooses between one Deadly four and four lone hunts. Is that the intended gold engine? On-call heroes are free seats against a 5.9M slot ladder |
| Economy review | The castle on Town Works rows changes the size and shape of the clan sink. Rations are the four party meals, bound |
| Items review | One drop a kill for the party means a four sees a quarter of the drops a head. With R3 slowing pairs, check the gear path of a pair and a four |
| Endgame review | The Tower's party table and whether on-call heroes may climb. A clan's best floor on its page needs nothing new |
| Home review | The House and the clan castle want the same goods and the same fantasy (Manor, Keep, Castle against Palisade, Hold, Keep). On one engine they can share art stages |
| Retention review | The Party window and the Hunts page should state the party law and the gold trade. Chat open by default has no lane. System lines for clan and Town Works stages |
| Platform review | Size A1 (a row a working hero against live polling). The Local tab's binding can go to the clan tab |
| Game Director lane | My answer to the open question is section 10 |

## 9. Evidence and hypotheses

| Label | Claim | Source |
|---|---|---|
| EVIDENCE | 0 hours with another person, 0 finder uses, 0 clan rows, 1 friend link, 0 whispers, 374 chat lines from 4 people, 91% of hunt hours in a party, all one account's own heroes, 99 of 249 hunts ended by a party member leaving | `10-real-players.md` |
| EVIDENCE | The party table, the solo constant, the Level share cut and the Tower table | `src/data/party-class-xp.js`, `src/core/hunt/xp-share.js`, `src/data/hunt-grounds.js` line 536, `src/data/hunt-tuning.js` line 56, `src/data/tower.js` line 60 |
| EVIDENCE | Gross XP a head is nearly flat in party size on one tier. Best-cell ratios by size. Pair at or over four at 18 of 18 checkpoints from Level 5 to 145. Lone gold about 2 to 7 times a four's a head where the four is positive. Seat damage split | `progression-grid.json` 07c836bfd, MID, 2 seeds x 2 h, read with a script. One ground a Level, so a ground effect cannot be told from a Level effect |
| EVIDENCE | The solver's four is slower than its lone hero at every Level (1.43 at Level 15, 1.08 at 185), the pair is fastest from Level 30 | `paths.json` 8b03c56aa, `level-1` to `level-4` |
| EVIDENCE | The two caches conflict on lone Deadly deaths | `ground-rates.json` rows against grid cells at Levels 50 and 100 |
| EVIDENCE | A carried Level 10 seat at Krell's Hold would be paid about 1.0M an hour against 47k | grid cells: four at Level 100, lone at Level 10. Assumes the low hero survives |
| EVIDENCE | Local takes one of five Realtime bindings | `src/data/chat-channels.js`, `CHAT_LIMITS` |
| EVIDENCE | The castle cannot complete, labour is client-sent, no building gives anything the game reads | `25-social.md` section 0 (not re-read from the migrations in this review) |
| EVIDENCE | Real tank +20,100 an hour, healer +4,800 from the same kills | `11-krell-hunt-2026-11-20.md` |
| HYPOTHESIS | The fight itself keeps a same-style four from beating a mixed four on Deadly | Phase B: same-style and two-style fours at Levels 15, 50, 100 |
| HYPOTHESIS | Lowering the pair and three fixes the ladder inside the 2.5 cap without making a three feel worse than a pair | Phase B: matrix diff on the size row |
| HYPOTHESIS | Carried leveling would become the main way to level once heroes can be lent | Not measurable in the engine. A playtest with on-call live and the rule off would show it in a week |
| HYPOTHESIS | On-call heroes get real people hunting together, and it is fun | Playtest only |
| HYPOTHESIS | Heroes at work in town cost less than live presence a body | Platform sizing |
| HYPOTHESIS | A clan at 10 online is not worth its build yet | No real data either way. The beta tells |
| ASSUMED | Slot timing (second hero about day 20, the four about week 15), the 2 hour on-call cap, founding fee | `30-plan.md`, rulings of 11-20 and 11-21 |
| Not checked | The clan migrations themselves, the faction tables, any screen. Nothing was played in this phase | |

## 10. The open question: what makes a shared live world matter in an idle game

Other people cannot matter by being beside you, because nobody is at the screen. In Hearthrise they can matter in four ways, and each one works while both players are away.

1. **Borrowed hands.** Their heroes hunt with yours while they sleep. This is on-call heroes and standing parties, and it is the only form of playing together an idle game can honestly offer.
2. **A counterparty.** Someone wants what your heroes make, and sells what you need. This is the market and "list for a friend". It belongs to the economy review, and it is probably the strongest of the four in the long run.
3. **An audience.** Your rare drop, your gear, your outfit, your hero at the forge are seen. This is the System tab, inspect, the boards and a town that shows heroes at work.
4. **A shared work.** Something larger than one account gets built from everyone's surplus. This is Town Works for the server and the same engine for a clan.

Everything in this review follows from that list. The systems I would remove or merge are the ones that need two people at the screen in the same minute. The two I would add put more heroes in front of more eyes and connect friends on day one. The test for any future social feature is one question: does it still work when both players are asleep?
