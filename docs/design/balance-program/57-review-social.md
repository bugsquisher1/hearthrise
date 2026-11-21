# Balance program 57: design review, social play and parties

Review of `lane/d-review-social` (game-designer, 2026-11-21). Phase A: reading and analysis only. No game code, data or migration was changed. No grid, matrix or browser run was made. Numbers come from the cached files on the set (`progression-grid.json` 07c836bfd, `ground-rates.json` 9486e873e, `paths.json` 8b03c56aa), from `10-real-players.md`, from `25-social.md` and from the code and data named beside each. Every claim in section 9 is marked EVIDENCE or HYPOTHESIS.

Briefs of record: `45-design-brief.md` (main) and `40-formula-brief.md`. Each proposed change names its LAYER: formula, coefficient, curve or content row.

Scope: party play (a player's own four and parties across accounts), party XP, clans and clan castles, factions, chat, friends, cooperation and social progression, and the open question of what a shared live world is for in an idle game.

## 1. One screen for Tyler

*Updated after phase B (measured on the real engine, section 11). Two of my phase A calls did not survive my own measurements and are withdrawn below.*

**Verdict.** The social half of Hearthrise was built for a different game. We built what an MMO you sit in front of needs: live invites, a live party finder, a Local chat room, a clan castle with five buildings, labour, votes, upkeep and a treasury. Hearthrise players visit for two to five minutes and their heroes play while they are away. So nobody has used any of it. Real players logged 0 hours with another person, 0 finder searches, 0 clans, 1 friend link.

The party has one clear law in the numbers. A party does not make a hero faster. It lets a hero stand on a tier it could not survive alone. On the same tier every party size earns about the same Level XP a head (measured again in phase B: 0.91 to 1.11 of a lone hero on Deadly at Levels 30, 60 and 110).

Phase B found the law is weaker than it should be, in two ways. A lone hero in mid gear held Dangerous with no deaths at Levels 30, 60 and 110 and earned 1.5 to 2.6 times the pace contract there. And four Mages hold Deadly and kill 8 to 15% faster than the mixed four. So today the fight does not ask for a party, and it does not ask for roles. Both are the harder-tier work already planned (L16). Until that lands, the party XP table is the only thing holding the mixed four in place.

If we designed this area from scratch today we would not build it the same way. We would build it around heroes that play while their owner is away. The Game Director's review (46) reached the same conclusion on its own: lent seats first, the castle later.

**The five changes that matter most**

1. **On-call heroes and standing parties go first, ahead of clans.** You already ruled them. They are the only thing in this area that lets two real people's heroes hunt together when the people are never online in the same minute. The Game Director put the same change first without seeing mine.
2. **Swap the hidden Level cut on party XP for a visible, gentler one in the same step. Do not just delete it.** Measured: with no cut, a Level 5 hero behind a Level 37 party on the Glade survives and earns 6 times its own pace, and a Level 10 earns 4 times. That is your own alts as well as lent heroes, and you ruled alts should take longer. Today's hidden cut is too hard the other way: that Level 5 earns a fifth of what it would alone.
3. **Keep the party XP class table for now.** I asked to remove it in phase A. My own measurement says no: without it four Mages would out-earn the mixed four by 8 to 15% with no deaths. Ask again after Deadly is a real fight.
4. **Leave the size row alone until the harder tiers are fixed.** I tried it both ways. Lowering the pair broke the ruled same-tier band on 16 rows. Raising the three and four pushes the four to 3.7 times the contract at Level 60. The two ruled bands pull against each other, and the cause is the tier, not the table.
5. **Do not finish the old clan castle. Rebuild it later as rows on the Town Works engine.** Not measurable. Unchanged from phase A.

**Actively harming the game today**

- The first thing the game says to two new friends is "about -55% vs solo". It is true, and it is the wrong first sentence. Since the table stays, the fix is the words: the Party window names the Sewer and the weapon to change (already in lane L04).
- A lone hero holds Dangerous at the top of a ground's band and earns as much a head as a four on Deadly (Level 110: 1.23M against 1.20M), with far more gold. "Rewarding fours" is not true in those cells today.
- The Local chat tab holds one of only five live connections a player may have, and the clan tab needs one.

**What I would add**

- The town shows heroes at work whether or not their owner is online.
- A friend link at sign-up, with no reward.
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

Verdict counts after phase B: KEEP 25, REMOVE 6, MERGE 5, REDESIGN 4, ADD 2, DEFER 5. Total 47. (Phase A read KEEP 24, REMOVE 7, MERGE 5, REDESIGN 5, ADD 2, DEFER 4. Section 11.8 lists what changed.)

| # | Item | Verdict | One-line reason |
|---|---|---|---|
| P1 | Party cap of four | KEEP | Everything is sized for it |
| P2 | Own four through hero slots | KEEP | It is the real party system |
| P3 | Party XP size row | DEFER (was REDESIGN) | Pay a head should rise with size, but both patches regress a ruled band until the tiers are fixed (11.4). Layer: coefficient, P21 |
| P4 | Party XP class-count term | KEEP until L16 (was REMOVE) | Measured: without it four Mages are the best four (11.3). Layer: formula, P21 |
| P5 | Solo +15% as its own constant | MERGE | Fold into the base so "lone is 1000" is the reference. No player number moves. Layer: coefficient |
| P6 | Level share cut | REDESIGN | One visible, gentler Level range rule in place of the hidden ground-keyed one (R2, measured in 11.5). Layer: formula, P23 |
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
| Weekly clan tasks or tallies | A clan project and its plaque are already the weekly reason. (Corrected in phase B: on 11-18 you turned down wanted and unwanted lists on weekly orders, not weekly orders themselves. See 47, C23.) |
| Public on-call to strangers | It gives every new account a free four and guts the slot ladder. Friends and clan only, as ruled |
| More chat rooms | One Global is ruled. The clan tab is the only room worth adding |

## 5. Interaction traces

*These are the phase A hypotheses. Section 11 holds what was measured: R1 was measured against, R2 was resized, R3 was deferred.*

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

*Phase B moves three rows: row 3 (the Level range) stays High and is resized, row 4 (size-only party XP) is withdrawn, row 5 (the size ladder) moves to Defer behind L16 and R12. Row 1 is done in part: the caches are one source now, and whether a lone hero holds Dangerous is the open number (11.6).*

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

*Updated after phase B. Call 2 of phase A (party XP by size only) is withdrawn. Call 1 is resized.*

1. **Replace the hidden Level cut on party XP with one visible, gentler rule, in the same step that removes it.** Rule: a hero under two thirds of the party's top Level keeps a share equal to its Level over that line (a straight line, not the square used today, and no ground floor in it). One sentence in the Party window. Reason, measured: with no rule a Level 5 hero behind a Level 37 party survives the Glade on Deadly and earns 6.1 times its own pace, a Level 10 earns 4.1 times, and the carriers lose 12 to 17%. That covers a player's own alts, which you ruled should take longer (11-09). Today's hidden rule pays that Level 5 a fifth of what it earns alone, which is too hard. The straight line pays it about 1.2 times its own pace. Strongest alternative: remove it now as you ruled on 11-08 (the architecture review's pick) and add a rule only when lending ships.
2. **Keep the party XP class table until Deadly is a real fight, then measure again.** This reverses my phase A call. Reason, measured: four Mages hold Deadly with no deaths at Levels 30, 60 and 110 and kill 8 to 15% faster than the mixed four. Only the one-class cell keeps them under it. Strongest alternative: size-only now (the Game Director's pick, made without a measurement), and accept four Mages as the best four.
3. **On-call heroes, standing parties and shared supply cost ship in the beta. Clans wait for 50 accounts a day.** Reason: on-call works at 10 online, and a clan at 10 online is a second empty chat room. Strongest alternative: all of L40 in the beta as ruled on 25-3.
4. **The clan castle is rebuilt later as projects on the Town Works engine. The old castle code is retired.** One project at a time, stages, gifts of gold and goods, a weekly pace, a plaque. No building levels, no labour, no upkeep, no votes. Rations stay, as you ruled. Reason: the old code cannot complete, trusts a number from the browser, and duplicates an engine that already works. Strongest alternative: the 25 re-shape as ruled, which re-finishes the bespoke functions.
5. **Remove the Local chat tab.** Reason: hunts are instanced, so "here" is your party or a near-empty town, and Local holds the connection the clan tab needs. Strongest alternative: keep Local as town talk and carry the clan tab on a shared social topic.
6. **Remove the live party finder. Its job moves to the on-call board.** Reason: 0 uses, and a list of who is online this minute is the wrong shape for 2 to 5 minute visits. Strongest alternative: keep it dark until 1,000 players are online.
7. **The town draws heroes at work whether or not their owner is online.** Reason: the online count already includes them, and the town is empty without them. Strongest alternative: draw only live players and accept an empty town until the game is big.
8. **A faction side is chosen per hero, and one press joins them all.** This amends 25-10. Reason: you ruled on 31-8 that the skills must matter, and then a four that wants both Bulwark and Reap should be able to have them at the price of slower standing. The Game Director disagrees with 31-8 itself and would ship factions with no power. I keep your ruling. Strongest alternative: account-wide as ruled, and every four carries one skill.
9. **A friend link at sign-up, with no reward.** Reason: your players arrive as friends, and the game does nothing with that. Strongest alternative: nothing, and rely on Discord.
10. **New from phase B: the two party bands you ruled cannot both be met today.** P6 (10-25) wants a four at 1.15 to 1.25 of a lone hero on the same tier. P7 (11-16 and 50-8) wants a four at 1.8 to 2.5 of the pace contract. A lone hero on Deadly already reads 1.9 to 2.8 of the contract, so any four that meets P6 breaks P7. Recommendation: keep P7 as the ruling that counts, fix the harder tiers first (L16 and the kill reward step R12) so a lone hero cannot hold them, and only then set the size row as a rising step of about 5% a hero. Strongest alternative: drop P6 and judge parties only against the contract.

Not a call, because it only carries out rulings you made: shared supply cost (10-25), chat open by default (10-22), striking "maybe 5 later" (25-11), folding the solo +15% into the party table (the architecture review's R8, which I agree with).

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

## 11. Phase B: layers, measurements, and what changed

Phase B, 2026-11-21, with `set/v0.2.144` (132552fe9) merged into this lane. Read first: `44-formula-architecture.md` (sections 5, 7, 8), `46-from-scratch.md`, `47-itemization-fit.md` (its rows for this area), `52-review-combat.md` section 10.

### 11.1 How it was measured

- **The matrix diff.** `node tools/balance-program/balance-matrix.mjs --diff tools/balance-program/patches/social-<n>.json --blocks parties,ways --only 30,60,110 --seeds 1 --hours 1 --workers 2`. The real engine on a scratch copy, the same dice before and after. The subset has no pair and no three, so I played the full run's `parties` and `ways` blocks at three Levels (324 cells for social-1). social-2 was played on `parties` alone (108 cells) and the tool could not judge it (see 11.4).
- **Lineups and mixed-Level parties.** The matrix plays one four at one Level. Like the combat review, I played other parties through the matrix's own exports (`loadGridData`, `loadKits`, `buildCell`, `playJobs`, `slimSeed`) from one-off read-only scripts on the tree as it stands: MID gear, Deadly, two seeds, one hour. A mixed-Level party is the harness's own `cell.level` as a list, with the low seat in its own Level's kit and skills. No patch.
- **Sample.** One seed and one hour for the diff cells, two seeds and one hour for the lineups. That is thin. Read every number here as direction and size. Deaths are rare events and are under-sampled.
- **Calibration caveats, as printed on every run.** The harness four kills 11% more than the real one. Its tank takes 96% of the damage where the real front takes 69%, and its healer 0.5% where the real one takes 28.5%. Its store bill is 1.9 times the real one. So party gold is a lower bound, and **every survival result for a back-row seat is PROVISIONAL and optimistic**: in real play a low hero in the back row is hit far more than here.
- `pc-load` read 98 to 100% CPU before every run. I used 2 workers throughout.

### 11.2 Every top proposal, with its layer

Formula and step ids are `44-formula-architecture.md`'s.

| # | Proposal | Layer | Formula id | Roadmap step | Patch or run | Status after phase B |
|---|---|---|---|---|---|---|
| R1 | Party XP by size only | formula | P21 | none (44 keeps the table and folds solo into it) | lineups, no patch | **WITHDRAWN.** Measured against it |
| R2 | A visible Level range in place of the hidden cut | formula | P23, exception P-X06 | R8 | mixed-Level lineups, no patch | **KEPT, resized.** 3 to 6 times, not 21 |
| R3 | The size ladder | coefficient | P21 (exception P-X08, hand-fitted cells) | after L16 and R12 | social-1, social-2 | **DEFERRED.** Both directions regress a ruled band |
| P5 | Solo +15% folded into the table | coefficient (identity) | P-X07 | R8 | none needed: 44 proves it with the empty diff | Agreed with 44 |
| P13 | Shared supply cost | formula | a new line beside E25 (the coin split) | none yet | not measurable: the harness store bill is 1.9x real | HYPOTHESIS, backed by the real Krell hunt |
| P14 | On-call heroes and standing parties | content and system, no formula | reads P20 to P23 and stamina | L40 | not measurable | HYPOTHESIS. Playtest in section 6 |
| P15 | The Tower's own party table | formula | P22, exception P-X09 | R8, later | not measured here | 44 folds it into the one table. I agree in principle. The endgame review should measure it, because the Tower's row pays a four 0.325 of a kill a head against 0.425 on a ground |
| R4 to R8, A1, A2 | Local tab, finder, castle on Town Works, clan order, faction side, town bodies, friend link | content or platform | none | L40, L46, L50, L53, L25 | not measurable | HYPOTHESIS, each with its playtest in section 6 |

### 11.3 R1, measured: same-style fours on Deadly

MEASURED, two seeds, one hour, MID, Deadly, the grid's ground for a four at that Level (the Glade at 30, the Muster Barrows at 60, Krell's Hold at 110).

| Four | Level 30: kills an hour, XP a head | Deaths, lowest HP | Level 60 | Deaths, lowest HP | Level 110 | Deaths, lowest HP |
|---|---|---|---|---|---|---|
| tank, healer, bow, mage (mixed, cell 1700) | 2,456, 194,800 | 0, 68% | 923, 796,800 | 0, 64% | 1,500, 1,198,700 | 0, 69% |
| mage x4 (cell 970) | 2,688, 121,400 | 0, 78% | 1,060, 523,000 | 0, 39% | 1,617, 737,300 | 0, 51% |
| bow x4 (cell 970) | 2,604, 117,500 | 0, 61% | 1,095, 535,300 | 4 in one seed | 1,552, 706,700 | 0, 25% |
| tank and three mages (cell 1580) | 2,624, 193,500 | 0, 61% | 1,154, 927,000 | 0, 25% | 1,611, 1,195,800 | 0, 55% |
| **mage x4 at the mixed cell (COMPUTED, x1700/970)** | 212,800, **+9%** | | 916,600, **+15%** | | 1,292,100, **+8%** | |

Net gold a head: four Mages 5,900, -200 and 8,600 against the mixed four's 5,000, 1,400 and 7,300. The rune bill is not a brake.

What this settles:

1. **My phase A condition is met, so R1 is withdrawn.** I wrote that I would withdraw size-only XP if four Mages held Deadly and out-earned a mixed four. They hold it with no deaths at all three Levels and would out-earn it by 8 to 15%. This agrees with the combat review's one-seed lineups (52 section 10.4) on two seeds, and adds Level 30 and the bows.
2. **The class table is doing real work today.** It is the only thing between the game and a four-Mage best party. That is a patch over the fight (brief 40 would call it a compensating multiplier), and it should be removed when the fight itself asks for a front and a healer. That is L16 (the tiers bite) and V4 (the harness sends damage to the back row).
3. **The table already leaks.** A tank and three Mages (two classes, cell 1580) is 16% over the mixed four at Level 60 today. The mix bonus is nearly flat from two classes up, so "bring one of each" is not what the table says. Combat found the same with a hammer and three Mages (+22%).
4. **Convergence, and what it is worth.** The Game Director (46, section 7 and its challenge 7) and I both proposed size-only XP independently, both on the belief that the fight already pays for roles. 46 marked it lower confidence for want of a measurement. Two separate measurements now say the belief is wrong on today's dials. The convergence was two reviewers sharing one untested assumption.
5. **The conflict with 52 is resolved for 52.** Keep the class table until L16 lands, then re-run these four lineups. If four Mages then fall behind the mixed four at cell 1700, remove the class term.

The first-hour harm stays (two friends on the starting sword read "-55%"). With the table kept, the fix is text: lane L04 already has the Party window naming the Sewer and the weapon change.

### 11.4 R3, measured: the size ladder, both ways

**Before (the tree as it stands).** One seed, one hour, MID. Level XP a head, and in brackets the same figure over the lone hammer on the same tier (band P6) and over the pace contract (band P7).

| Cell | Lone hammer | Pair (tank, mage) | Three | Four |
|---|---|---|---|---|
| Level 30, Normal | 113,600 (contract 1.08) | 96,400 (0.85, 0.91) | 74,200 (0.65, 0.70) | 56,300 (0.50, 0.53) |
| Level 30, Dangerous | 163,100 (1.55), 0 deaths | 161,000 (0.99, 1.53) | 141,500 (0.87, 1.34) | 132,700 (0.81, 1.26) |
| Level 30, Deadly | 200,300 (1.90), 0 deaths | 213,100 (1.06, 2.02) | 204,900 (1.02, 1.94) | 194,800 (0.97, 1.85) |
| Level 60, Dangerous | 666,200 (2.61), 0 deaths | 712,400 (1.07, 2.79) | 706,000 (1.06, 2.77) | 728,800 (1.09, 2.86) |
| Level 60, Deadly | 718,700 (2.82), 8 deaths in the hour | 783,400 (1.09, 3.07) | 776,400 (1.08, 3.04) | 797,900 (1.11, 3.13) |
| Level 110, Dangerous | 1,225,000 (2.22), 0 deaths | 1,241,400 (1.01, 2.25) | 1,175,500 (0.96, 2.13) | 1,076,000 (0.88, 1.95) |
| Level 110, Deadly | 1,324,000 (2.40), 2 deaths in the hour | 1,398,000 (1.06, 2.53) | 1,284,900 (0.97, 2.33) | 1,203,700 (0.91, 2.18) |

Three findings before any patch:

- **The party law holds on the one source of rates.** On one tier a party's pay a head is 0.81 to 1.11 of the lone hero's.
- **A lone hero holds Dangerous.** No deaths in the hour at Levels 30, 60 and 110, at 1.5 to 2.6 times the contract. At Level 110 a lone hero on Dangerous earns 1.23M an hour and a four on Deadly earns 1.20M a head. The single-source ground rates (2 seeds) show deaths on Dangerous at the low end of a band and none at the top. So solo is more than viable at the top of a band, and the four is not rewarded there.
- **The four is over its cap at Level 60** (3.13 against a red line of 2.6) and under its same-tier band everywhere (0.91 to 1.11 against 1.15 to 1.25).

**social-1** (`patches/social-1.json`): every pair cell x0.77, every three cell x0.85, the four held. Targets P6 and B9. 324 cells.

| Flags | Count | Rows |
|---|---|---|
| IMPROVED | 2 | P6.2 and P6.3 at Level 60 on Normal (1.82 to 1.39, 1.76 to 1.50): both were far over on a party ground |
| REGRESSED | 16 | P6.2 on 8 rows (for example Level 30 Deadly 1.06 ok to 0.82 off, Level 110 Deadly 1.06 ok to 0.81 off). P6.3 on 8 rows (Level 60 Deadly 1.08 to 0.92) |
| UNINTENDED | 5 | P7.2 on 3 rows and P7.3 on 2, all TOWARD the band (Level 30 pair 2.02 RED to 1.55, Level 110 three 2.33 RED to 1.99 ok). Traced: P7 is the 50-8 band I meant to hit. I named the wrong band id in the patch's targets. It is the patch's intended effect, not a side effect |
| Everything else | 0 | Pair XP -23.4%, three -14.7%, hours a Level +30.5% and +17.2%. No lone cell, no four cell, no kill, damage, gold or death number moved: the table is a pure multiplier on Level XP |

**social-2** (`patches/social-2.json`): the pair held, every three cell x1.10, every four cell x1.20. Target P6. 108 cells (`parties` only). **The tool printed 0 flags because P6 needs the lone cells and I left the `ways` block out. That was my mistake in the run, and I did not re-run it at 98% CPU.** The run did measure the effect: three +10.0% XP, four +20.0%, nothing else moved. Applied to the before table (COMPUTED from MEASURED cells):

| Band | Before (Levels 30, 60, 110 on Deadly) | After social-2 | Reading |
|---|---|---|---|
| P6.3 (1.10 to 1.20) | 1.02, 1.08, 0.97 | 1.12, 1.19, 1.07 | toward, in band at two of three |
| P6.4 (1.15 to 1.25) | 0.97, 1.11, 0.91 | 1.16, 1.33, 1.09 | toward at 30 and 110, over at 60 |
| P7.3 (1.5 to 2.0, red over 2.2) | 1.94, 3.04, 2.33 | 2.13, 3.35, 2.56 | away, red at two of three |
| P7.4 (1.8 to 2.5, red over 2.6) | 1.85, 3.13, 2.18 | 2.22, 3.75, 2.62 | away, red at two of three |

**What this settles.** Phase A said "lower the pair and three, hold the four". Measured, that regresses the ruled same-tier band on 16 rows. The opposite patch repairs the same-tier band and breaks the contract cap. **The two ruled bands cannot both be met by the size row**, because a lone hero on Deadly already reads 1.9 to 2.8 of the contract: P7's ceiling for a four (2.5) sits below P6's floor for a four (1.15 x 1.9 to 2.8 = 2.2 to 3.2). The cause is at the tier layer (C-TIER and C-PULL: what Dangerous and Deadly pay and how hard they hit), which is L16 and roadmap step R12. R3 is deferred to after them. The shape to set then is the one P6 names: about 5% a head for each added hero.

Phase A's "the ladder is upside down" stands as measured (pair 1.06, three 1.02, four 0.97 at Level 30 on Deadly, and the same order at 110). What was wrong was my fix.

### 11.5 R2, measured: a low hero behind a higher party

MEASURED, two seeds, one hour, MID, Deadly. The mixed four with its Mage seat at a lower Level, in that Level's own kit and skills. "Uncut" is what the seat would be paid with the rule removed, which is the other seats' pay (the rule is a pure multiplier on one seat's share).

| Party, ground | Low seat | Its deaths an hour | Paid today (the hidden cut) | Uncut | Its own pace alone (Normal) | Uncut over its own pace | The carriers' XP against a full-Level four |
|---|---|---|---|---|---|---|---|
| Level 37, the Glade | Level 5 | 0, lowest HP 61% | 6,100 | 165,200 | 27,200 | **6.1x** | -17% |
| Level 37, the Glade | Level 10 | 0 | 27,200 | 173,900 | 42,800 | **4.1x** (3.3x its own Level's four) | -12% |
| Level 37, the Glade | Level 20 (in the ground's band) | 0 | 187,400 (no cut) | 187,400 | 120,100 | 1.6x | -6% |
| Level 65, the Slake | Level 20 | 1 in each seed | 130,800 | 619,400 | 120,100 | 5.2x, and it dies | n/a |
| Level 65, the Slake | Level 35 | 0, lowest HP 48% | 425,200 | 654,100 | about 179,000 (phase A grid) | 3.7x | n/a |
| Level 110, Krell's Hold | Level 10 | **12.5** | 15,900 | 922,900 | 42,800 | it cannot stay alive | -23% |
| Level 110, Krell's Hold | Level 60 | 0 | 748,100 | 1,120,500 | 796,800 in its own Level's four | 1.4x its own four | -7% |
| Level 110, Krell's Hold | Level 75 (over two thirds) | 0 | 1,164,600 (no cut) | 1,164,600 | about 750,000 in its own four | 1.5x | -3% |

What this settles:

1. **My "21 times" was wrong.** I wrote it assuming the Level 10 hero survives Krell's Hold. It dies 12.5 times an hour, on a harness that sends the back row almost nothing. Late in the game the ruled gate (risk and death) does the job.
2. **The gate does not hold early.** On the Glade a Level 5 hero survives a Level 37 party's Deadly pull and would be paid 6.1 times its own pace. A Level 10 would be paid 4.1 times. This matches the architecture review's own note (a Level 1 behind three Level 37s at 190,000 an hour). Levels 1 to 40 are the weeks when friends and lent heroes matter most, and they are every alt's first weeks.
3. **Today's hidden cut is too hard.** The Level 5 is paid 6,100 against 27,200 alone, and the Level 10 27,200 against 42,800. Being carried is worse than hunting alone, and nothing on screen says so.
4. **A straight line fits between them (COMPUTED from the uncut column).** Share = Level over two thirds of the top Level, capped at 1. The Level 5 would be paid about 33,500 (1.2x its own pace), the Level 10 about 70,500 (1.6x), the Level 35 about 527,000, the Level 60 about 917,000. Carried is always a little better than alone and never several times better.
5. **PROVISIONAL.** Every survival number here is from a fight that sends 0.5% of the damage to the healer's row. With the real spread the low seat dies more, so the early-game window where a carry survives is narrower than this table shows. Re-run these eight cells when V4 lands.

**Against 44.** The architecture review recommends removing the cut now, as ruled, and adding a visible rule when lending ships (its section 8, row 3, and R8). I agree with removing the hidden, ground-keyed rule and with the fold. I disagree with the gap between the two steps: for the weeks in between, a player's own second hero levels at 4 to 6 times its pace behind the first, which is the opposite of "alts take longer". One recommendation: do both in R8.

### 11.6 What the matrix could not measure

| Proposal | Why not | The run or playtest that would settle it |
|---|---|---|
| On-call heroes, standing parties | No formula. The question is whether people use it and like it | Two to four real accounts on different schedules for a week. Hunt hours with another account in them |
| Shared supply cost | The harness store bill is 1.9x real and its damage lands on one seat | The real Krell hunt already shows the gap (tank +20,100, healer +4,800). After V4, read net gold a seat in the matrix four |
| The party's gold against a lone hero's | The same caveat. Party gold cells are lower bounds | After the store-bill calibration |
| Heroes at work in town, the Local tab, the finder, the castle on Town Works rows, the friend link, clans at 50 accounts | Platform, UI and population questions | Section 6's playtest table. Platform sizes A1 |
| Faction side per hero | The skills do not exist yet | Cell G4 when L53 builds them |
| Whether a lone hero really holds Dangerous | One seed, one hour. Deaths are rare | The nightly full matrix (2 seeds x 2 h) and the deaths run. This is the most important open number in my area |

### 11.7 Where the other docs decided, and whether I agree

| Doc | What it decided | My position |
|---|---|---|
| 44, R8 and P-X07 | The solo +15% becomes the first cell of the one party table | Agree. I proposed the same in phase A, and 44 cites it. Convergent |
| 44, section 8 row 3 | Remove the hidden Level cut now, a visible rule with lending | Agree on the removal, disagree on the gap (11.5) |
| 44, P-X09 | The Tower takes the one party table | Agree in principle. Hand to endgame to measure |
| 44, V4 | The harness seats take about 1% of the damage | Agree it must land before any party survival number is trusted. It gates my R1 re-test and R2's table |
| 44, class-3 list, X-PARTY-FIT | "Built for a party" kept as one encounter type | No position. Note for it: the Level 60 cells here are on a party ground, and a lone hero's Normal there is the weakest lone cell (0.55 of the pair) |
| 46, change 1 | Lent seats first. The company as one thing | Agree. Convergent with my top change, reached independently |
| 46, challenge 7 | Party XP by size only | I proposed the same and now withdraw it on measurement (11.3) |
| 46, challenge 1 | A cheaper second hero | Not my call. On-call heroes do part of the same job without touching the price you ruled |
| 46, challenge 8 | Factions with no power | I keep ruling 31-8. If the skills ship, the side should be per hero (call 8) |
| 46, section 3 | Town Works merged into one Great Hearth | Compatible with my R6 as long as the staged-gift engine survives the merge. A clan project is rows on that engine either way |
| 46, the castle | Later, when ten real clans ask | Agree. Convergent |
| 47, C23 and M3 | I misread your 11-18 answer: you turned down wanted and unwanted lists on weekly orders, not weekly orders | Accepted and corrected in section 4. My reason against weekly clan tasks is now only that a clan project already is the weekly reason |
| 47, row 2d and L53 | Equal faction grounds a region | Agree. No conflict |
| 52, section 10.4 | Keep the class table until L16 | Agree. Measured the same on two seeds (11.3) |

### 11.8 Verdicts that changed since phase A

| Item | Phase A | Now | Why |
|---|---|---|---|
| P4, the class-count term | REMOVE | **KEEP until L16, then re-measure** | Four Mages hold Deadly and would out-earn the mixed four by 8 to 15% |
| P3, the size row | REDESIGN now | **DEFER to after L16 and R12** | social-1 regressed P6 on 16 rows. The opposite patch breaks P7. The cause is the tier |
| P6, the Level share cut | REDESIGN, "21 times" | **REDESIGN, resized**: 3 to 6 times early, and death gates it late. A straight line, not the square | The Level 10 at Krell's Hold dies 12.5 times an hour. The Level 5 on the Glade survives |
| Reading "solo is viable on Normal" | Normal only from about Level 45 | **A lone hero holds Dangerous at the top of a band** (one seed, thin) | Before cells at Levels 30, 60, 110 |
| Reading "the four is 1.06 to 2.53 of a lone hero" | From the old grid | **About 0.97 to 1.20 of a lone hero's best held tier at Levels 30, 60, 110** | The single source of rates plays the tier's pull for a lone hero too |
| The weekly clan tasks row | "You turned down weekly order lists" | Corrected | 47 C23 |

Verdict counts now: KEEP 25, REMOVE 6, MERGE 5, REDESIGN 4, ADD 2, DEFER 5. Total 47.
