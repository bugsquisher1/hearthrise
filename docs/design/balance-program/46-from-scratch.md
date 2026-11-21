# Balance program 46: would we build Hearthrise the same way from scratch?

Game Director review, 2026-11-21. This is the top-down read Tyler asked for in brief 45's addendum. It was written without reading the eight bottom-up reviews, the old dives (2N), the plan (30) or its audit (31), so the two can be compared.

What it rests on: briefs 45 and 40, the rulings of record, the inventory (00), the real-player baseline (10), the Krell hunt (11), the design standards, the data in `src/data`, and one played first hour as a brand-new account on set/v0.2.144 (section 0).

Labels used all the way through. **EVIDENCE** is something counted from real players or seen on the screen in my session. **HYPOTHESIS** is my design judgment and needs a playtest. **THIN** is evidence that rests on one or two people. Nearly all real-player evidence is THIN, because four people have played. I say so once here and do not repeat it on every line.

Nothing here is built. Every change is a recommendation for Tyler to rule on.

---

## 0. What I played

One session, a fresh account, the real client and the real engine on a local world, with time skips for waiting. The Bonus XP weekend and beta Premium were on, so my pace numbers run a little high.

| Game time | What I did | What the screen showed | How it felt |
|---|---|---|---|
| 0:00 | Made an account and a hero | "No classes, nothing to pick." Colors only. I start as sword and shield | Clean. But my first minute has no choice in it about who I am |
| 0:01 | Landed in Havora | The Great Hearth, a tip pointing at the Town icon | Delighted. It looks like a place, not a dashboard |
| 0:01 | Opened the Town menu | Ten doors at Level 1: Shop, Market, Storage, Tamsin's tally, Havora, Farm, House, Training, Burning Tower, Hearth Chest | Confused. The tip saved me. Without it this is a wall |
| 0:02 | Took Giant Rats from Tamsin | Her voice, tally marks, the whole road to Level 85 on one board | Delighted. Best writing in the game |
| 0:02 | Entered the Mill Cellar | A living room of rats, kills in seconds | Delighted. I was hunting 2 minutes after the sign-in screen |
| 0:03 | Pressed a bar slot | "Cast Power Strike when my HP is below 50%", built as a sentence, 14 things a rule can read | Delighted. This is the real game and it is good |
| 0:13 | Left at Level 4 | Hunt summary with Equip, Sell, "Always sell these", Bless, Next buy | Delighted. The return card is the second best thing here |
| 0:13 | Pressed Bless | One press blessed one of three. Two more presses for a free thing | A repeated decision |
| 0:17 | Level 5, the Cellar ended itself | "Ground outgrown. Go to Meadowbrook Thicket" | Clear. I always knew the next step |
| 0:17 to 0:42 | Hunted the Thicket on Normal | 141 wolves, never under 75% HP, 10 food eaten, 40 gp of supplies | Bored from about minute 20. Nothing to decide, nothing at risk, the next Level 28 minutes off |
| 0:42 | Opened Skills in town | Eight town skills at Level 1. Fishing has "when it is done, go hunting again" | Fine. Familiar. The chain to the hunt is a nice touch |
| 0:43 to 0:53 | Fished 100 shrimp | Fishing 1 to 5 in ten minutes | Pleasant, quick early levels |
| 0:53 | Looked at Cooking and the House | Wolf meat from my hunt can be cooked. The Homestead costs 400 gp, 20 copper ore and 30 logs | Good. The first goal that ties hunting, gold and two town skills together |
| 0:55 | Opened the Sewer card | "Levels 5 to 25. In range" in green. Monsters are Level 10 to 15 | Nothing says this is the party ground where lone heroes die most |
| 0:55 to 1:10 | Hunted the Sewer alone at Level 6 | 28,900 Level XP an hour against about 21,100 in the Thicket, both with the weekend bonus (20,100 against 17,400 without it). 613 gp of coin, 576 gp of store food. A shield and platelegs dropped | Delighted. A real trade I found myself: the Thicket pays gold, the Sewer pays XP and eats the gold |

The short version. The first 17 minutes are excellent and I was never lost. From minute 20 to minute 55 I had one hero, two spells, no danger and nothing to decide. The game got interesting again only when I ignored its recommendation and walked into the Sewer.

---

## 1. The answer up front

**Mostly the same, but not in the same order and not around the same unit.** The hunt you prepare and do not play, the action bar's rules, the ground and tier choice, and the return card are the best things in Hearthrise, and I would build them again almost line for line. What I would change is what they hang on: I would build the game around the account's own party of four from the first evening instead of one hero for the first fifty hours, I would make gear something you keep instead of something you sell, and I would build about half as many systems around that core.

On your worry. The systems do form one game for the two players who run four heroes on Deadly. For them the hunt eats supplies, the town makes supplies, and gold flows into the House and Tempering. They do not form one game for a new player with one hero, because nothing connects until about hour 50, and both players who never got there quit at Levels 7 to 9. And they do not connect players to each other at all: zero hours of two people in one hunt, zero market purchases, one friend link.

---

## 2. The game I would build from scratch

### One sentence

You run a small company of heroes that hunts on its own, and you win by preparing it better than the ground expects: who is in it, what they wear, what their bars do, where you send them, and what your town makes for them.

Everything in brief 45 section 3 fits inside that sentence. The interesting decisions are all preparation. The reward for a good decision is something you can read on the return card.

### What the player does and wants

| Moment | What they do | What they want next | Today |
|---|---|---|---|
| Minute 5 | Watch their hero win fights on its own. Take a task. Read a loot line | To see what happens if they change one rule on the bar | Same, and it works. Hunting at minute 2 |
| Hour 1 | Have written one bar rule that visibly saved the hero. Have chosen between a safe ground and a risky one and seen the difference on the summary. Have seen one named piece on a hunt card that they want | A second hero, which is one evening away. A home | The rule builder is there but nothing forces its use, because Normal is safe. The safe-or-risky choice exists but I only found it by ignoring "Recommended". There is no piece to want. The second hero is 400,000 gold away |
| Hour 20 | Run two or three heroes with real roles. One holds, one heals or kills. Have died once from greed and understood why. Own a Homestead that makes their food. Have killed the Rat King | The third seat. A named piece from the ground they are on. The next tier of difficulty | One hero, about Level 17 to 20, on Normal or Dangerous. The Sewer and the Rat King are a party ground they cannot staff. The two real light players had already left by Level 9 |
| Hour 200 | Run a full four on Deadly, each hero a build. Push the Tower for a place on the board. Trade a rare find. Belong to a clan | A specific set. A Tower landing. Krell | For the heavy players this is close to what exists and it holds them. The builds are thin: two tanks at Level 60 are the same hero |
| Hour 2,000 | Perfect four builds. Hunt the hardest version of their favorite grounds. Chase one-in-a-thousand-hours pieces. Lend heroes to newer players. Climb boards | The next region, the next Tower landing, the piece that finishes the set | Not built. Live ground ends at Level 110 and the heavy four reached 80 in 15 days |

### The ten systems that deliver it

Judged against the identity in brief 45 section 3. If a system is not on this list, it has to plug into one that is, or it does not get built.

| # | System | Why Hearthrise needs it |
|---|---|---|
| 1 | **The hunt.** Automated, instanced, server-run, with difficulty tiers. Every ground scales past its band by the one stat formula | "Automated hunting" and "server-authoritative". Scaling by formula is what makes "unlimited progression" true with a small team |
| 2 | **The bar.** Slots in priority order, conditions, saved setups | "Idle does not mean shallow." This is where a player outsmarts a hunt. It is the one system no other idle game has this well |
| 3 | **The company.** Up to four of your own heroes, roles by weapon, one purse, one Start. Empty seats can be filled by other players' heroes | "Solo viability alongside rewarding four-character parties." Real players already play this game. It should be the design, not a discovery |
| 4 | **Growth.** Level without a cap, four combat skills trained by use, and one small choice every few Levels | "Unlimited character progression" and "styles without vocations". The choice is what keeps Level 137 from being plus 10 HP |
| 5 | **Gear.** Tier pieces that drop often, a few named pieces per ground that change how a hero hunts, and one way to improve a piece | "Deep equipment progression and rare drops." Named pieces are also what the market, Luck, the Bestiary and Crowns all need to mean anything |
| 6 | **Supplies and the four trades.** Cooking, Smithing, Crafting, Runecrafting, fed by gathering. The store as the expensive fallback | "Meaningful character preparation" and "crafting". Each trade serves a fighting style, so the town is part of the hunt |
| 7 | **The home and the Hearth.** One House per account that grows, and one Great Hearth the whole server feeds | "Housing" and the game's own name. The Hearth is the shared world in one object |
| 8 | **The push.** One endless climb with a board and a chest, and one way to fight a boss | "Long-term goals" and "meaningful over thousands of hours". A climb is the purest test of preparation |
| 9 | **The exchange.** A market for rare things, and clans that lend heroes and build together | "Persistent, player-driven economy" and "social systems". Built around what an account cannot make for itself |
| 10 | **The return.** The away card, the summary with its one-press actions, loot rules, the after-hunt plan, the analyzer | Real visits are 2 to 5 minutes. For these players the return is the game |

---

## 3. Side by side with today

Eight criteria from brief 45 section 4, in short form. "Formula fit" is criterion 5: can it live in the shared math without exceptions. "Hour 1,000" is criterion 7.

### 3a. Built today and I would build it the same

| System today | Player value | Depth | Unique | Plugs into | Formula fit | Cost | Hour 1,000 | Call |
|---|---|---|---|---|---|---|---|---|
| Idle instanced hunts, hunts run with the game closed | The whole promise | Where and how hard | Yes | Everything | One engine already | Paid | Yes | **Keep** |
| Action bar, conditions, setups, hunt prep | Outsmarting a hunt | Highest in the game | Yes. The signature | Spells, supplies, party | Rules are data | Paid | Yes | **Keep.** Protect it |
| Difficulty tiers as percent dials | Risk you choose | Push or play safe | Yes | XP, supplies, death | Pure dials | Low | Yes | **Keep**, and extend upward (section 5, change 4) |
| Store supplies paid per use, own stock first | A hunt never stalls | Which supply in which slot | Yes | Gold, the trades | Prices are data | Paid | Yes | **Keep** |
| Roles by weapon, Level-only gear requirements | Freedom to try | Which way to fight | Yes | Skills, party | Clean | Paid | Yes | **Keep** |
| Hunt summary, away card, after-hunt plan, loot rules | The 3-minute visit works | What to do with the haul | Yes | Bag, shop, jobs | None needed | Paid | Yes | **Keep.** "Always sell these" at the first sale is exactly right |
| Hunt analyzer and personal bests | You can read your own choices | Compare grounds and setups | Yes | Every balance choice | Reads the engine | Paid | Yes | **Keep** |
| Tamsin's tally | A reason to try the next ground | Light | Yes | Grounds, gear | Data rows | Paid | Fades | **Keep** as the new-player spine |
| Account purse, Storage, the ledger | One economy per account | None, and that is right | Yes | All gold | Clean | Paid | Yes | **Keep** |
| The four trades and three gathering skills | Cheaper, better supplies | What the rest hours make | Each serves a style | Supplies, House, Tempering | Recipes are data | Paid | Supplies yes, gear no | **Keep the shape.** See 3b for what changes inside |
| The House property ladder and Storage chests | A visible home that grows | What to buy first | Yes | Gold, trades | Rows | Paid | Sink ends at the Castle | **Keep** |
| Tempering | Gear power for gold and craft | Which piece first | Overlaps (see 3b) | Gold, Smithing | A capped percent | Paid | Re-bought each tier | **Keep** as the one improvement system |
| The Burning Tower and the Hearth Chest | A test of preparation | Build and bar against a wall | Yes | Keys, weapons, a board | Floors come from the stat formula. This is the model for everything | Paid | Yes, endless | **Keep.** It is the best formula-driven content in the game |
| Chat, friends, the shared town | The world has people | None | Yes | Social | None | Paid | Yes | **Keep** |
| Death and Blessings as a mechanic | Greed has a price | Push or hold | Yes | Tiers, gold | One flat share | Paid | Size is a question (section 7) | **Keep the mechanic** |
| The wiki of formulas, monster cards | Honest numbers | Informed choices | Yes | The formula program | Renders from data | Low | Yes | **Keep** |

### 3b. Built today and I would build it differently

| System today | Player value | Depth | Unique | Plugs into | Formula fit | Cost of changing | Hour 1,000 | Call |
|---|---|---|---|---|---|---|---|---|
| **Hero slots at 400k, 1.5M and 4M** | Today: a wall in front of the real game | The best decision space is locked for weeks | n/a | Party, town labor, income | A price row | Low | n/a | **Redesign.** Second hero in the first evening. Change 1 |
| **Parties built around other people** (finder, invites, ready checks) | 0 hours with another person in 1,334 | None in practice | Own heroes already fill it | XP table | Fine | Medium | Only if seats can be lent | **Redesign** around your own company plus lent seats. Change 1 |
| **Dropped gear, the five loot bands** | 26 pieces a hero-hour. 86% sold, 0.9% worn | "Sell" | Rare rows are stat sticks | Shop gold | Fine | High (content) | No. Past tier 7 nothing is built | **Redesign.** Fewer rare rows, each a named piece with a property. Change 2 |
| **The Shop buying all gear** | Easy gold | Removes the keep-or-sell choice | Competes with the market and wins | Income, market | A sale rule | Medium | No | **Redesign.** Gear salvages, the Shop pays a token. Change 2 |
| **The market** | 7 listings, 0 real purchases | None yet | Yes | Needs scarce goods | Fine | Low | Only with rare goods | **Refocus** on rare pieces and Crowns. Stop designing for bars and fish |
| **Party XP by class mix** | Tells the player which four to bring | Removes the comp decision | Combat already rewards roles | Party XP | A table outside the combat math | Low | No | **Simplify** to size only. Let the fight reward the roles (section 7) |
| **Tower plus Catacomb descent** as two modes | Same climb, same chest, same key tiers | The second adds none | Duplicate | Chest | Same formula twice | Low now, it is still dark | One is enough | **Merge.** One mode, wings inside it |
| **Hall keys plus Call out** | Two doors to one boss. 19 keys sat unused in one hunt | One | Duplicate | Bosses | Fine | Low | Yes as one | **Merge.** A key is a banked fight, spent from the after-hunt plan |
| **Scaled hunts, bought by the hour** | 0 real uses | Pay gold to earn 0.8x XP | The idea is right, the door is wrong | Old grounds | Uses the stat formula | Medium | Yes if free | **Redesign** as free depth tiers. Change 4 |
| **Inner Flame, Town Works, the Hearthrise event, flame powders** | Four small systems around one landmark. Inner Flame unused 15 to 25 days | Little | Each overlaps | The Hearth | Fine | Medium | Yes as one | **Merge** into one Great Hearth. Change 3 |
| **House rooms: eight ladders of plus 10% speed** | A sink two players finished | Which percent first | Eight copies of one idea | Trades | Rows | Low | Ends at rung 5 | **Simplify.** A room should open something (the Kitchen ends the bench fee, the Cellar cures) and not sell speed |
| **Training: yard, dummy, items, the Premium daily item** | Skills keep up with fast Levels | Train or gather in the rest hours | Four forms of one thing | Skills, gold | Flat rate, clean | Low | Yes | **Simplify** to the yard and the dummy as play. Items stay as the store's product |
| **Elements: seven rune families, two more ruled** | Pick the right spell for a ground | Made once per ground | Each new one is rows, not a decision | Spells, runes, guards | Percentages, clean | Low | Thin | **Hold at today's count** until an element does something besides plus 15% |
| **The starting hero** | Sword and shield, the way that is slow alone on purpose | The default is the worst lone pick | n/a | First hours | n/a | Low | n/a | **Fix.** Let the player pick a starting weapon at creation. Everyone keeps all six sets |
| **Farming** | The one town system all four people use | What to plant | Yes | Cooking | Rows | Low | Yes | **Keep, fix the pressing.** 1,361 waterings by hand is a repeated decision |
| **Bestiary** | A kill count with no ruled reward | None today | Yes | Luck, later | Stages are rows | Low | Yes, once it pays | **Keep, decide the reward** (Luck is the right home) |

### 3c. Exists or is planned, and from scratch I would not build it

"From scratch" is the question you asked. Your ruling that planned things are not cut stands, so the last column is my call for today, which is usually "later" or "smaller" and rarely "remove".

| System | Why not, from scratch | Today's call |
|---|---|---|
| **Fists**, the all-rounder for players alone | Its promise is "good at everything, great at nothing". In a game of own fours that is the seat nobody fills. A pair makes lone comfort unnecessary | **Defer** until change 1 is played. I expect it will not be missed |
| **Factions as a source of power** (aligned grounds, a faction skill that matters) | A side you pick for the story becomes a side you pick from a spreadsheet, and then it needs balancing forever. Clans already give belonging | **Build the story and the outfits. Leave the power out** (section 7) |
| **Necrotic and Storm, sixteen spells** | More rows for a decision players make once a ground | **Defer** behind changes 1 and 2 |
| **Clan castle, castle board, treasury, feasts** (4 systems, 9 tables, dark) | Four systems of upkeep for clans that do not exist | **Later**, as you ruled. Open the roster, chat and lending first and build the castle only when ten real clans ask |
| **Commissions, weekly orders, the crafter's chase** | They assume players trade bars, planks and food. Every account makes its own with free rest hours, so that trade will not happen | **Defer.** Revisit only if the market moves common goods |
| **Companions** | A second progression track beside four heroes | **Stay hidden**, as ruled |
| **Idle PvP capture the flag** | Needs a population the game is a year from | **Backlog**, as ruled |
| **Worn in, chest reforging, linings, curing slots** as four more ways to add a few percent to a piece | With Tempering and Hallmarks that makes six. Six small percents is not six decisions | **Build linings** (they answer monster spells, a real decision) **and fold the rest into Tempering** |
| **The small vanity sinks** (crier, tavern round, powders, paid setup slots, rename) | Zero or near zero use. Harmless | **Keep, stop adding** |
| **Old server leftovers, old dungeons, gem rows** | No caller | **Remove**, already ruled |

### 3d. Missing

| Missing | Why Hearthrise specifically | Value | Depth | Unique | Plugs into | Formula fit | Cost | Hour 1,000 | Call |
|---|---|---|---|---|---|---|---|---|---|
| **The company as one thing**: one Start, one plan, one return card for your heroes | 76% of hunt hours are one person's own four. 99 of 249 kept hunts ended because the player's own other hero left | High | Frees attention for real choices | Yes | Party, away, bag | None | Medium | Yes | **Add.** Change 1 |
| **Lent seats**: another player's resting hero fills your empty seat while they are away | The idle-native way to play together. Nobody has to be online at the same time. New players get a party from other people, which is what "alts take longer" was for | High | Who to bring | Yes | Clans, friends, party XP | Same engine, a hero is a stat block | Medium to high | Yes | **Add.** Change 1 |
| **Named pieces from the Sewer on** | You ruled this on 11-14 ("sprinkle items like this throughout the game"). It is still dark | High | Builds, ground choice, trade | Yes | Loot, market, Luck, Crowns | A catalogue of standard attributes, no special code | High (content, sample first) | Yes | **Add.** Change 2 |
| **A choice when you Level** | Unlimited Levels with nothing to pick is the longest dead stretch in the game | High | Builds differ | Yes | Combat stats, a respec sink | Coefficients with diminishing returns | Medium | Yes. It is the only system that feeds on Level forever | **Add.** Change 5 |
| **Ground that never ends** | Live ground stops at 110. The heavy four hit 80 in 15 days | High late | Which ground to deepen | Yes | Tiers, drops, Luck | The stat formula at a higher Level, as the Tower does | Medium | It is the hour 1,000 system | **Add.** Change 4 |
| **A job queue**: fish, then cook, then hunt | I could chain one job to a hunt but not two jobs | Medium | None, it removes presses | Yes | After-hunt plan | None | Low | Yes | **Add** to the after-hunt plan |

---

## 4. The seams

Where today's systems fail to form one game.

**Seam 1. The game the screen teaches is not the game players play.** The screen teaches one hero on Normal. Real play is one person's four heroes on Deadly from about Level 10 (91% of hunt hours in a party, every party one account). The bridge between the two is 400,000 gold, then 1.5M, then 4M. Nobody who stayed on the first side of the bridge passed Level 9. EVIDENCE, THIN.

**Seam 2. A multiplayer-only game with no reason to meet.** Your own four never log off, share one purse and need no ready check. Your own town makes your supplies in free rest hours. The Shop buys every piece of gear in one press and the store sells every supply forever. An account is a closed economy by design. So: 0 hours with another person, 0 market purchases, 0 party finder uses, 1 friend link. EVIDENCE. The two heavy players are both friends of yours, played in the same weeks, and each built their own four instead of hunting together.

**Seam 3. Gear is coin.** The identity says deep equipment hunting. Players sold 86% of what dropped and wore 0.9%. A slot is solved within an hour of entering a band, tiers are gated by Level, stats are fixed, and then nothing changes for fifteen Levels. An own four on the Warrens sees a Rare reveal about every 7 minutes, so the reveal is not a moment. One player holds 2.09M gold and has nothing to want. EVIDENCE.

**Seam 4. Everything competes with Level for the same stamina, and loses.** The Tower paid 0.26 of Krell's XP. Scaled hunts pay 0.8 and cost gold. The Catacombs will pay 0.375. Level is the chase, stamina is the limit, so every side door is a tax unless its loot is worth it. One Tower climb, one paid boss call, zero scaled hunts. EVIDENCE.

**Seam 5. The same decision offered twice.**
- Tower and Catacomb descent: same climb, same chest, same key tiers.
- Hall keys and Call out: two doors to one boss.
- Yard, dummy, training items, the Premium daily item: four ways to buy skill XP.
- Tempering, Hallmarks, linings, worn in, chest reforging, curing: six ways to add a few percent to a piece.
- Inner Flame, Town Works, the Hearthrise event, flame powders: four systems on one Hearth.
- Clans and factions: two homes for belonging before there is one clan.

**Seam 6. Systems that undermine each other.**
- The healer undoes "struggle or pay". On Krell 85% of healing was one spell cast on a rune that costs 1 gold at the store. Harder monsters cost that party about 400 gold a head, not thousands. It also undoes store food and most of Cooking for a party (meals were cooked once and never again). EVIDENCE.
- The store and the Shop undo the market. A crafter cannot sell a rune for more than the store's price, and a hunter gets paid for gear instantly without a buyer.
- The class-mix XP table undoes "styles without vocations". It tells every account which four to bring.
- The starting hero is sword and shield, the one way ruled slow alone on purpose, and its next spells (Frost Slam, Shelter) only work in a party. The new player is handed the party tank and no party.
- The hunt list said "Recommended" for the Thicket and "In range" for the Sewer. The Sewer paid me about 1.2 to 1.4 times the XP and took all my gold. That is a good discovery. But the Sewer is also where lone heroes die most (10.4 deaths per 100 hours) and the card cannot say it is a party ground.

**Seam 7. The ground ladder on paper is not the ladder played.** Real players entered Coppercap Warrens (band 32 to 50) at Level 10 and lived there for 32% of all hours. Wickstead, Hask's Ford and the Muster Barrows together got 45 hours of 1,334. With "harder pays more and nothing refuses a Level", the best ground is always the hardest one your four survives, so three of eleven grounds are scenery. A ground needs a reason to visit that is not its XP rate. Named pieces are that reason.

**Seam 8. Long stretches with no decision or milestone.**
- Minutes 20 to 55 of my session.
- Levels 5 to 10 for a lone hero: about five hours, two grounds, two spells, no danger on Normal. Both light players stopped here.
- Level 10 to about 32 with one hero, until 400k is banked.
- Past Level 45, a Level is hours of play for plus 10 HP. The next gear tier is fifteen Levels off and the slot fills in an hour.
- Past Level 110, nothing is live.

**Seam 9. Dead ends.** Inner Flame (unused 15 to 25 days). Meals (made once). Crafted gear (under 2 hero-hours against 34,756 drops). The Trophy room (off sale). Bestiary stages (no ruled reward). Titles, dyes, the crier (zero). Scaled hunts (zero). 19 Hall Keys from one hunt with no fight.

**Seam 10. Decisions repeated by hand** (the first principle). 1,361 crop waterings. Each Hall Key is a fight started by hand. Bless takes one press per Blessing while they are free. A four is started and stopped hero by hero. On the hunt card, the tier and the after-hunt plan sit about 900 pixels under the drop list, so a new player may never see the two choices that matter most on that screen.

---

## 5. The structural changes

Five changes. Ranked by benefit, then confidence, then cost. Each names its layer from brief 40 (formula, coefficient, curve, content data).

### Change 1. Make the company the game

**What.** Three parts that only work together.
1. The second hero comes in the first evening, at about what one hero banks by Level 8 to 10 (around 10,000 gold, a data row). The third and fourth keep your prices, 1.5M and 4M.
2. Your heroes act as one company: one Start, one after-hunt plan, one return card, one loot dispatch.
3. An empty seat can be filled by another player's resting hero. The lender's hero earns its normal share and its owner gets a small cut. Nobody needs to be online together.

**Why this is first.** The pair is where roles, Challenge, heal rules and the Sewer start to mean something, and it gives hour 1 something to want that hour 3 can deliver. Lent seats give a new player a full party from other people in the first week, which is the purpose behind "alts take longer", without the 50-hour wait that the two light players did not survive.

| | |
|---|---|
| Benefit | Critical. It moves the best part of the game from about hour 50 to about hour 3 |
| Confidence | High that the problem is real. Medium that the pair alone holds new players (one quitter did have two heroes) |
| Cost | Part 1 is a price row. Part 2 is client and intent work, medium. Part 3 is a server system, medium to high, and a trade surface for the Security review |
| Complexity | Parts 1 and 2 low. Part 3 real: whose supplies, what happens on death, a daily cap |
| Risk | Doubles early account income and town labor (measure it). Weakens "main character identity". Lent seats need a population to work |
| Depends on | Nothing for parts 1 and 2. Part 3 wants clans or friends first |
| Layer | Content data (a price), no combat math. A lent hero is a stat block like any other |
| EVIDENCE | 91% of hunt hours are parties and all are own heroes. Nobody with one or two heroes passed Level 9. 0 hours of two people in a hunt across 65 parties. 99 of 249 hunts ended by the player's own hero leaving. A second account that knew to rush slots leveled twice as fast |
| HYPOTHESIS | That a pair in hour 3 keeps a stranger past hour 20. That players will lend heroes. That identity survives a second hero |

### Change 2. Make gear worth keeping

**What.** Build the special-attribute pieces you ruled on 11-14, starting at the Sewer and not after Krell. Each ground gets two or three named pieces with a property that changes how a hero hunts, visible on the hunt card. Cut the Rare rows that are only a stronger stat stick, so a reveal is hours apart again. Turn on Salvage, and let the Shop pay a token for gear so the keep, salvage or sell choice is real. Aim the market at these pieces.

**Why this is second.** One missing thing is holding back five systems. The market has nothing scarce to trade. Luck has nothing worth multiplying. The Bestiary has nothing to boost. Crowns have nothing to buy from players. Three grounds have no reason to be visited. Named pieces from early on fix all five.

| | |
|---|---|
| Benefit | Critical for the identity ("deep equipment progression and rare drops") and for your revenue plan (whales buy gold to buy things players found) |
| Confidence | High that gear is coin today. Medium on the exact rarity |
| Cost | High. It is authored content: a sample of 5, played, then batches of 20 or fewer |
| Complexity | Medium. The attribute catalogue must be standard attributes read by the shared formulas, never per-item code |
| Risk | Power creep. A dominant piece. Lowering Shop pay cuts 26% of income, so coin per kill has to be re-read in the same pass |
| Depends on | The attribute catalogue (`special-attributes.js` is the start). Salvage. The formula audit for which attributes exist |
| Layer | Content data plus one catalogue. No new formulas |
| EVIDENCE | 34,756 pieces dropped, 29,949 sold, 298 ever worn. 1 market listing of gear. 1,568 Rare reveals to four people. One purse at 2.09M with 17% spent |
| HYPOTHESIS | That players will keep, wear and trade named pieces. That 20 to 40 lone hours is the right wait for an early one |

### Change 3. One of each

**What.** Merge the duplicated doors before any more open.
- The Tower and the Catacomb descent become one climb mode with wings. The Unmarked Catacombs ground, the part you love for its rooms and mood, stays a ground.
- A Hall Key becomes a banked boss fight, and the after-hunt plan can spend them. Call out folds into it.
- Inner Flame, Town Works, the Hearthrise event and flame powders become one Great Hearth: every hunt drops fuel, everyone feeds one fire, your own standing with it is your regen, and the server's fire level is the shared event.
- Tempering is the one way to improve a piece. Linings stay because they answer monster spells. Worn in, chest reforging and curing fold in.
- Hold every dark or designed system closed until a stranger stays twenty hours.

| | |
|---|---|
| Benefit | High. Fewer screens, fewer currencies, fewer things to balance, and the Hearth finally does what the name says |
| Confidence | High. The duplicates are visible in the inventory |
| Cost | Low to medium. Most of the merged halves are dark or designed, so this is mostly not building |
| Complexity | Low |
| Risk | You like several of these as their own thing. The Hearth merge touches a live skill with death loss |
| Depends on | Nothing |
| Layer | Removes exceptions. Each merge is one fewer rule set |
| EVIDENCE | 14 systems dark, 8 designed, 4 real players. The Tower: one climb. Call out: one use. Inner Flame: 16 bench hours in total. 19 keys unused |
| HYPOTHESIS | That one Great Hearth is more fun than its four parts |

### Change 4. Ground that never runs out

**What.** Past a ground's band, the tier ladder keeps going. Each step fields the same monsters from the one stat formula at a higher Level, the way Tower floors already work, with the ground's drops moved up to match. It is free. It replaces scaled hunts by the hour. New regions stay the best XP and the only source of new named pieces, so they still matter.

| | |
|---|---|
| Benefit | High, and it grows with time. It turns "unlimited Levels" from a content debt into a formula |
| Confidence | High on the problem. Medium on whether a deeper Warrens feels like content |
| Cost | Medium. The scaled-hunt tables and kill bounds exist |
| Complexity | Medium. Drop bands at depth need one rule |
| Risk | Players settle in one ground forever. Regions feel optional |
| Depends on | The formula audit's stat formula. Change 2, so each ground has its own reason to deepen |
| Layer | Formula. No per-ground numbers |
| EVIDENCE | Live ground ends at 110, staged at 185, nothing to 400. One player went from 0 to Level 80 in 15 days. Art is the critical path for every region. Your standard asks for 120 days of ground at Early Access |
| HYPOTHESIS | That depth plus named pieces is enough between regions |

### Change 5. A choice when you Level

**What.** Every five Levels a hero gets one mark to put into one of about six tracks (for example hitting harder, taking less, healing more, mana, luck, town work). Each track has diminishing returns, so it never runs away and never ends. Marks can be moved for gold. This is the smallest build system that fits unlimited Levels and a public formula.

| | |
|---|---|
| Benefit | High. A decision every few hours for the whole life of a hero, two tanks that differ, a respec gold sink that never ends |
| Confidence | Medium. It is the standard answer, and standard answers can feel generic |
| Cost | Medium |
| Complexity | Medium. Every track is a coefficient the Balance Lab must sweep |
| Risk | One best split that everyone copies. Power creep on top of gear |
| Depends on | The formula audit (which stats exist). After changes 1 and 2 |
| Layer | Coefficient, with a curve for the diminishing return. It never reads Level inside a blow |
| EVIDENCE | For the gap only: a Level past 45 is hours for plus 10 HP and 10 mana. Two same-weapon heroes at one Level differ only by jewelry |
| HYPOTHESIS | That it is fun and not a tax. Sample it on paper with the simulator before anything is built |

### The ranking

| Rank | Change | Benefit | Confidence | Cost | Build when |
|---|---|---|---|---|---|
| 1 | The company is the game | Critical | High on the problem | Low, medium, then high by part | Parts 1 and 2 before the beta |
| 2 | Gear worth keeping | Critical | High on the problem | High | Sample of 5 before the beta, the rest after |
| 3 | One of each | High | High | Low | Now. It is mostly not building |
| 4 | Ground that never runs out | High, later | Medium | Medium | Before Early Access |
| 5 | A choice when you Level | High | Medium | Medium | Design now, build after 1 and 2 are played |

---

## 6. What only real players can tell us

A simulator can tell us pace, gold and deaths. It cannot tell us any of these.

| Question | Why play is the only answer |
|---|---|
| Does a stranger with a pair stay past hour 5 and hour 20? | The only first-week sample is two people, and one of them had two heroes |
| Do players lend heroes, and do new players take them? | No system like it has been live |
| Is the bar fun to tune, or do players copy a setup and never open it again? | 18 setups saved across 5 accounts says little either way |
| Do players wear and trade a named piece, or sell it too? | Nothing scarce has ever dropped below Krell |
| Does a mark feel like a choice? | Fun is not in a spreadsheet |
| Is watching the hunt the game or wallpaper? | The heavy player watched 87% of a ten-hour hunt and never pressed a key |
| What makes a light player close the tab at Level 7 to 9? | Both who did left in opposite ways |

**The playtest that would tell.** Twenty to thirty strangers, not friends, for fourteen days, in two groups.
- Group A plays today's ladder: one hero until 400k.
- Group B gets the second hero at about 10,000 gold.

Measure with the PostHog funnel you already approved: reached Level 10, owned a second hero, first hunt on Dangerous or Deadly, first death, first bar slot changed, first item sold to a player, back on day 2 and day 7. Record five first sessions with the player talking aloud. The call is simple. If group B's day-7 return is not clearly better than A's, change 1 part 1 is wrong and your ladder stands. Run the named-piece sample (change 2) in both groups from the Sewer, and count worn against sold.

---

## 7. Where I disagree with a ruling

Plainly, in order of how much I think it matters.

**1. Hero slots at 400k, 1.5M and 4M, and "alts take longer" (11-09, 11-20, 11-21).** I disagree with the first price only. Your reason was main-character identity and room for friends and guilds. What happened: zero hours of two people hunting together, by two friends of yours who each built their own four instead. And nobody who stayed at one or two heroes passed Level 9. At the 3.3 hours a day people really hunt, 400k is about two weeks alone on Normal with a two-spell bar. I would price the second hero at an evening and leave the third and fourth where you put them. You keep 5.5M of a 5.9M sink. Lent seats then do the job "alts take longer" was meant to do. If the playtest in section 6 says the pair does not help, I am wrong and the ladder stands.

**2. "Generous to Krell, rare after" (11-20).** Generous tier gear is right and I would keep it. But the pieces that change a build should start at the Sewer, which is what your own 11-14 ruling said ("sprinkle items like this throughout the game"). Generous drops are not what hooks a player. Twenty-six pieces an hour taught players to sell on sight. Krell is at least 100 hunted hours away for the fastest player alive, and most players will decide whether to stay in the first twenty.

**3. The big reveal on every Rare drop (27-6).** I would keep your ruling and change what sits under it. The problem is not the reveal. It is that an own four gets a Rare row every 7 minutes. With two or three Rare rows a ground in place of eight to eleven, every reveal is a moment again and the ruling stands as written.

**4. The Catacombs as their own game mode (11-16).** It is the Tower again with armor in the chest: same climb, same key tiers, same chest, the same six opens a week. The Tower has had one real climb. I would keep the Unmarked Catacombs as the ground you love and make the descent a wing of the one climb mode.

**5. Scaled hunts bought by the hour (11-07).** Zero real uses. Paying gold to earn less XP on an old ground is a hard sell. The machinery is worth much more as free depth on every ground (change 4).

**6. The skill tree on hold (11-05).** Holding the big wheel was right. But the game has no choice at a Level-up at all, and with no Level cap that is the longest empty stretch there is. I would take it off hold as the smallest thing that works (change 5), sized on the simulator first.

**7. Party XP is better only with different classes (10-31).** The fight already pays for roles: without a healer a party buys health at about twenty times the price. A table that also pays for the mix means every account brings the same four. I would pay by party size only and let players find their own comps. Lower confidence: I have no measurement of a same-class four on today's rules.

**8. Faction skills that matter (31-8), Necrotic and Storm for every weapon (11-18), fists (11-18).** I have no evidence against any of them, because none is live. My objection is order and weight. Each adds rows and balance work to a core that has not yet held a stranger for twenty hours. For factions in particular: the moment the skill matters, the side stops being a story choice. I would ship the story and the outfits and leave the power out.

**9. Death at 6% flat with no limit (50-4).** One line. On a game played mostly while away, a death worth up to 148 hunted hours means every late player keeps three Blessings on forever, which makes death a fee and not a risk. Eighteen of 22 real deaths were Blessed and Blessings were 0.06% of gold spent. I would take the capped version you were offered. Nobody reaches the Levels where this bites for a year, so it can wait.

Rulings I looked hard at and agree with: no Level penalty, the store fallback for every supply, the player picks every supply, tiers as percent dials with no gold, no profit molds, formulas in a public wiki, no bound gear, Krell's Hall needing a four, and the formula brief in full. The Tower is already the proof that formula-driven content works here.

---

## Appendix. Handoffs seen in play (not design, for the art director and the Coordinator)

- Hunt card: the tier choice and the after-hunt plan sit under the whole drop list. They are the two decisions on that screen and should be above it.
- Hunt summary at a 1024 by 768 window: the Sell row sat under the sticky "Hunt again" bar until I scrolled.
- Bless: one press blesses one Blessing. One press should take all three while they are free.
- The tip said "collect from Tamsin in town" but she had already paid when I arrived.
- Cooking's last recipe is "Void Banquet". "Void" is on the banned filler list.
- The Sewer card says "In range" in green for a lone Level 6. Your ruling is no fit labels, and I am not asking for one. The monster Levels (10 to 15) are on the card and that is enough for a careful reader. It is worth one line in the first-hours coach.
