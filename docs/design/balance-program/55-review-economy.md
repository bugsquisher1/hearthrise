# Balance program 55: Design review, the economy (phase A)

Review of `lane/d-review-economy` (game designer, 2026-11-21), under Tyler's briefs 45 (design) and 40 (formulas). Phase A is reading and analysis only. No game code, data or migration was changed, and no grid, matrix or browser run was made. Numbers come from the cached grid (`tools/balance-program/progression-grid.json`, commit 07c836bfd), `node tools/balance-program/gold-model.mjs --shelf` (a join of JSON, no engine), the data rows under `src/data/`, and `10-real-players.md`. `51-baseline.md` had not landed on the set when this was written, so the red list is read from the grid directly.

Every claim is labeled **EVIDENCE** (with its source) or **HYPOTHESIS** (to be measured in phase B or by real players).

---

## 1. Summary for Tyler

**Verdict.** The gold side of the game is well built and honest. It is not yet an economy. It is one account earning from monsters and paying a store, with a shelf of one-time buys beside it. The identity says "player-driven". Today no player needs another player for anything, and the market that would connect them is closed, manual and unused. That is the one thing I would not build the same way again.

If we started today I would keep the gold formula, the per-use store, stamina, the slot ladder, Tempering and Premium. I would build the market differently, I would make every price come from one wage curve, and I would not have let gear drops become a gold faucet.

**The 5 changes that matter most**

| # | Change | Why | Layer | Size |
|---|---|---|---|---|
| 1 | **Make the market idle, like the hunting.** Standing buy orders. The "Sell" loot rule sells to the best order when it beats the Shop. The one-tap refill buys player-made stock when it is cheaper than the store. Nobody has to open a market window for trade to happen. | Real players made 7 listings and 0 real purchases. A cooked shark saves a Deadly hunter 924 gold at the store and the Shop pays its maker 24. The trade is there. Nothing carries it. | new mechanic (one framework for orders), then data | L |
| 2 | **One wage curve, and every price is hours of it. The store's healing price becomes a formula.** | Coin is a formula (0.30 gold a monster hit point). The price of healing is a hand table that climbs 9 times a hit point from shrimp to shark. That gap, not Deadly's damage, is why a lone hero on Deadly pays 5 to 12 times its coin. Refills, Blessings, the yard, renames and colors are each their own straight line in Level. | formula + coefficient | M |
| 3 | **Size the repeating sinks before the beta grows, and stop the house dummy from deleting the biggest one.** Linings first, then the yard fee, then refills. The dummy halves the yard fee instead of ending it. | At 12 hours a day an own four buys the whole shelf to Krell (53M) in about 14 weeks. After that nothing takes gold out. The yard fee at 100 gold a skill level is the one sink that grows forever, and a 150k dummy pays itself back in a few days and ends it. | coefficient + content rows | M |
| 4 | **Gear stops being gold. Salvage is where gear goes by default, and the Shop buys junk.** | 86% of gear drops are sold to the Shop and 0.9% are ever worn. Sold loot is 26% of all gold created. A drop that is always sold is a coin with extra presses. | content rule + one coefficient | M |
| 5 | **Cut the fees nobody feels.** Bench tax gone. Setup slots 4 and 5 free. The market open on day one. Dead Shop rows deleted. | Each one is a concept a new player must learn, a guard, and a generator, for under 0.1% of gold out. Two of them sell back a decision the player already made. | content rows | S |

**Actively harming the game today**

- The market is shut behind a 1,000,000 gold town project on a new server. The first thing a player learns about trade is "Not open yet".
- The house dummy and the yard fee are two rulings that cancel each other (see 3 above).
- A hunt on a hard tier can spend a whole purse while the player sleeps. The only guard is a gold floor that defaults to 300 and cannot be set above 100,000.
- The store's food prices punish exactly the content that needs the most healing, by a factor nobody chose.

**What I would add.** The idle market (change 1). A daily "gold made against gold destroyed" line from the journal, because nobody can steer what nobody reads. A spending budget for each hunt, remembered for each ground. Later, on a big server only, one prestige thing that clans bid burned gold for, because a bid is the only price that rises by itself as the server gets richer.

**Where I think you are wrong.** Hero slots should not rise again. A higher price does not make the four an achievement for the player who pays with Crowns, and it makes the lone game from Level 1 to 33 longer for everyone else, which is the weakest stretch we have. The slots already do their job as the first big thing bought gold buys.

---

## 2. Systems review

### 2.1 What gold is for, in one picture

| Flow | Today | Label |
|---|---|---|
| Gold in: coin | 0.30 gold a monster hit point, times a line (0.5 to 1.4 over ground floors 1 to 16), times a role number, times a party fit (1.17 or 0.53), times 0.7 on nine grounds | EVIDENCE: `src/data/balance-sheet.js` STAT_FORMULA.gp, GROUND_GP_FIT |
| Gold in: loot sold to the Shop | The Shop buys anything at half book value, without limit. 26% of all real gold in. 86% of gear drops end here | EVIDENCE: `catalogue.js` SHOP_BUYBACK_RATE 0.5; `10-real-players.md` sections 4 and 6 |
| Gold in: the tally | 2% of gold in | EVIDENCE: real players |
| Gold out, repeating | Store supplies charged per use (33% of real gold out). Stamina refills (7%, one person). Nothing else of size | EVIDENCE: real players |
| Gold out, once | 53.26M of shelf for a four-hero account by Krell (slots, House, Tempering, Hallmarks, dummy). Nothing new past Krell | EVIDENCE: `gold-model.mjs --shelf` |
| Gold between players | 3 sales ever, all to a test account | EVIDENCE: real players |

**The two coefficients that decide everybody's profit.** A hero's net gold an hour is close to:

`damage dealt an hour x gold a monster hit point  -  damage taken an hour x gold a hit point healed`

The first coefficient is a formula: 0.30, or 0.21 on the dialed grounds. The second is a hand table (`src/data/supply-basics.js`):

| Store food | Heals | Price | Gold a hit point |
|---|---|---|---|
| Salted Shrimp | 72 | 14 | 0.19 |
| Salted Trout | 120 | 40 | 0.33 |
| Salted Lobster | 216 | 180 | 0.83 |
| Salted Swordfish | 288 | 432 | 1.50 |
| Salted Shark | 396 | 693 | 1.75 |

Store drinks run 0.14 to 0.49 gold a point of mana. EVIDENCE: the rows.

So at the top of the ladder a hero breaks even only when it takes under an eighth of the damage it deals (0.21 / 1.75). On shrimp it breaks even taking as much as it deals. The need for the big food comes from the 2 second shared cooldown: a hero with 1,030 hit points at Level 88 that is being hit hard cannot keep up on 72 a bite. **So the store's price a hit point is a tax on how fast you must heal, and it rises 9 times across five rows.** Nobody ruled that slope. It is the biggest single reason for the G-2 red, and it is a coefficient, not a ground. This is the finding brief 40 asks for: the hard tier is not too dangerous, the healing is mispriced against the coin.

**What the cached grid says (MID gear, a hero-hour, EVIDENCE: grid 07c836bfd; the four is the harness four, which buys more at the store than the real four does):**

| Level | Lone, Normal: net | store / coin | Lone, Deadly: net | store / coin | Four, Normal: net | store / coin | Four, Deadly: net | store / coin |
|---|---|---|---|---|---|---|---|---|
| 30 | 10.1k | 0.00 | -6.2k | 2.6 | 2.4k | 0.70 | 5.8k | 0.89 |
| 50 | 11.4k | 0.01 | -121k | 12.4 | 1.7k | 1.30 | 3.2k | 1.51 |
| 88 | 22.3k | 0.03 | -99.8k | 7.4 | 3.4k | 1.31 | 4.7k | 1.52 |
| 110 | 23.1k | 0.00 | -80.3k | 5.9 | 3.0k | 1.38 | 5.3k | 1.47 |
| 200 (projected) | 26.3k | 0.10 | -88.6k | 8.3 | 1.9k | 1.30 | -2.3k | 1.61 |
| 400 (projected) | 48.2k | 0.03 | -67.7k | 3.7 | 10.6k | 0.85 | 0.7k | 1.38 |

A MID pair on Normal at Level 40 (Coppercap Warrens) pays 1.87 times its coin and nets 1.5k, with its worst composition at 3 gold an hour. EVIDENCE: grid. The real Deadly four pays 48% of coin and nets +9.1k, with a third of its supplies home-made. EVIDENCE: real players, one person, thin.

Three readings:

1. **A lone hero on Normal pays the store nothing and earns the most gold in the game.** Four heroes of one account in four separate lone Normal hunts make about 89k an hour at Level 88. The same four as one party on Deadly make about 19k (harness) to 36k (real). So gold says "hunt alone" and XP says "hunt together". That is a real decision and by the 11-13 ruling it is the players' to discover. It is also four hunt instances instead of one. HYPOTHESIS: that is close to four times the server cost for the account, against a budget of 60 database-seconds a day. For the platform review.
2. **Repeating sinks touch only the player who chooses a hard tier.** Standard G-9 wants repeating sinks at 35 to 50% of gold in. A lone farmer reads 0 to 3%. A harness four on Deadly reads about 78%. The real four reads about 41%. The band is met by one kind of player and missed by the one who creates the most gold.
3. **The unlimited-Level end is stable on the earning side.** Lone net gold rises smoothly to 48k at Level 400 and never falls after Level 125 on Normal. The danger at high Level is not runaway income. It is that prices do not follow it.

### 2.2 Is the economy sustainable? Day 1 against day 180, 10 against 10,000

| Question | Answer | Label |
|---|---|---|
| How long does the shelf last at 12 hours a day? | The own four frees 1.8M a week at Level 10 and the shelf of each band is 0.2, 1.7, 3.4, 5.0 and 3.5 weeks of it. About 14 weeks to buy everything through Krell | EVIDENCE: `gold-model.mjs --shelf` |
| What takes gold out on day 180? | The store, for those on hard tiers. Refills, for those who buy them. Nothing else that is built | EVIDENCE: data |
| Gold made a day by one farming account past Krell | About 1.07M (four lone heroes, 12 h, 22.3k) | EVIDENCE: grid arithmetic |
| Gold made a day at 10,000 accounts | 2 to 10 billion, depending on the mix of fours and farmers | HYPOTHESIS: arithmetic on harness cells |
| Server-wide destroyed over created (standard G-11 wants 0.85 to 1.00) | 0.02 for a farmer, 0.41 for the real four, 0.78 for the harness four. No mix of those reaches 0.85 once the shelf is bought | EVIDENCE for the three cells, HYPOTHESIS for the server |
| What does that do? | Three things. Gold stops being a reward anybody notices (the real 2.09M purse, for everyone). Crowns cost more gold every month, so one bought Crown buys more of the fixed-price shelf every month: the paying player's edge grows with server age without anyone choosing that. And any player-set price drifts away from every NPC price | HYPOTHESIS, standard for a faucet with one-time sinks |
| Is inflation bad for the newcomer on an old server? | Only because veterans need nothing a newcomer makes. If old grounds' drops were wanted (linings are designed to need them), inflation would pay newcomers | HYPOTHESIS |
| 10 players | No market depth, so the Shop is both floor and ceiling. Standing orders are the only form of trade that works when two players are never on together | HYPOTHESIS |
| 10,000 players | 530 thin books. The 2M a day caps bind real traders. The Crown book becomes the largest sink through its 5% | EVIDENCE for the caps (`2027-01-12-market-account.sql`), HYPOTHESIS for the rest |

**Verdict on the core question.** Coherent: yes, on the gold side. Sustainable: not past month four of a server, because the faucet runs by the hour forever and nearly every sink is bought once. Player-driven: no.

### 2.3 Why it is not player-driven, and what would make it so

1. **Every account is self-sufficient.** Four heroes with 12 rested hours each is 48 hero-hours of free labor a day, and standard 13 has them work in town for all of it. Real players made a third of their own supplies with no effort. Labor is not scarce, so nobody buys labor. EVIDENCE: real players, 50-standards call 13.
2. **The store is automatic and the market is manual.** A supply from the store costs zero presses and is charged per use, even with the browser closed. A supply from another player costs a walk to a window that is closed. In an idle game the automatic path always wins. EVIDENCE: `supply-basics.js`, PLAYED in dive 24.
3. **The price band for trade is very wide and nothing shows it.** Cooked Shark: book 48, Shop bid 24, heals 528. The store's Salted Shark heals 396 for 693. A maker's shark replaces about 924 gold of store food. So a fair trade price is anywhere from 25 to 900. EVIDENCE: `items.js`, `supply-basics.js`. That gap is the whole room a crafting economy needs, and it is already in the data. Nothing connects the two ends.
4. **What is actually scarce** is hunted hours, rare drops, a high crafting level (it cannot be bought in a day), and parts that only one ground drops. A real player economy here trades those four. It does not need to trade labor.

So the fix is not more tradeable things. It is a market that works the way the rest of the game works: set once, runs while you are away.

### 2.4 Every system in the area

| System | What it is for | How it plugs in | Earns its place? |
|---|---|---|---|
| Gold, the account purse, the ledger | The one currency. One purse an account, every movement journaled | Everything | Yes. One currency is right. Do not add a second soft currency for any system |
| Crowns (ruled, not built) | Real money in. Buys Premium and looks, sells to players for gold | Market, Premium, every sink (it is how bought gold arrives) | Yes, as ruled, and last. It needs a working market and gold that is worth wanting |
| Gems, the bond item | Old client's premium currency | Nothing | No. Cut is ruled (L10) |
| Stamina | The time currency: 8 h bar, 12 h Premium, refills 1:1 while not hunting | Visits a day, town work, server cost, Premium's value | Yes. It is the best fit in the area for an idle game: it makes the return visit and it frees hours for crafting |
| Coin a kill | Gold in, tied to damage dealt | Combat speed is income | Yes. Tying coin to hit points removed is the right formula. The four stacked dials on top of it are the problem |
| The Shop buying loot | A floor price for everything, and a place to empty the bag | 26% of gold in | Half. As a floor it is needed. As the destination of 86% of gear it turns the drop system into coin |
| Tamsin's tally | First goal a new player is given | Tutorial, gear | Yes |
| Store supplies, per use | The price of pace. The ceiling on what a crafter can charge | Combat, crafting, every hard tier | Yes for the mechanic. The price table needs to become a formula |
| Food (19 cooked heals, 5 store heals, 8 buff foods) | Healing | Fishing, Cooking, Farming | Too many rows for one job. Several are beaten on both heal and value by a fish of the same tier |
| Drinks (6 and 6) | Mana | Farming, Cooking, Magic | Yes. One clean ladder |
| Runes (7 families, 5 depths, crafted and store) | The cost of spells and of pace | Runecrafting, Magic, every weapon's spell | Yes. The store copy at 75% effect is the right ceiling |
| Ammo | The Ranger's cost | Smithing, Crafting | Yes. The Ranger paying for its basic attack is ruled and is its identity |
| Whetstones (7) | Melee's optional cost for a higher ceiling | Smithing | Yes, small |
| Stamina refills | Gold for hours | The 24 h day | Yes. The only built sink that grows with Level |
| Blessings | Insurance on a death | Death cost (6% flat, no cap) | Yes. 0.06% of gold out today; the re-price is ruled (L23) |
| The yard fee | Gold for skill XP in rested hours | Combat skills, town hours | Yes. It is the keystone: the only sink that never ends, because combat skills have no cap |
| Training items (250k, 450k) | Double yard rate | The yard | Yes for gold. It is pure NPC-sold power with no depth limit, which is where bought gold lands first |
| House dummy (150k to 600k a skill) | The yard with no fee | The yard | No, as priced. It ends the keystone sink for a few days of its fee |
| Bench tax (150 gold a job until a room) | Push toward buying rooms | Crafting, House | No. Rooms sell themselves on speed and yield |
| Hero slots (400k, 1.5M, 4M) | The door from one hero to a party | Everything | Yes. The best buy in the game and it should be |
| Tempering, Hallmarks | "Choose what matters": sinks above a band's gold | Gear, crafting (salts) | Yes. Tempering needing crafted salts is the model for every gold-for-power sink |
| Bag rungs, Storage, Key Ring | Room | Loot | Yes |
| Setup slots 4 and 5 (15k, 40k) | More saved action bars | The action bar | The feature yes, the price no. It charges for a remembered decision |
| Crier, Round, powders, colors, rename, titles | Being seen | Town | Yes, as built, with no more work until there is a town with people in it |
| Town Works | A shared goal and a plaque | The market's door today | Yes as a monthly project (ruled). Not as the lock on the market |
| The Weighhouse market | Trade between players | Should be everything. Is nothing | Not as built. See 2.3 |
| "List for a friend" | Private trade | Market | Yes (ruled) |
| Premium | Comfort for money | Stamina, analyzer, looks | Yes, account-wide (ruled). Keep it weak and clearly nice |
| The gold floor (default 300, most 100,000) | Stops a hunt before the purse is empty | Per-use charging | The idea yes. The shape no: it protects 300 gold of a 2M purse |
| Scaled hunt hours | Gold for hours in an old ground | Old grounds, linings | Yes. A good repeating sink that also keeps old grounds alive |

---

## 3. Content rationalization

| # | Thing | Verdict | One-line reason |
|---|---|---|---|
| 1 | Gold as the one currency, purse and ledger | KEEP | One currency, journaled, server-owned |
| 2 | Stamina as the time currency | KEEP | Makes the visit, frees crafting hours, bounds server cost |
| 3 | Crowns, with the five clamps | DEFER | Right design, wrong time. It needs the market and a reason to want gold first |
| 4 | Gems, `hearth_token`, the gem RPC | REMOVE | Dead currency with a live RPC (ruled, L10) |
| 5 | Coin = gold a monster hit point | KEEP | The right formula |
| 6 | The four dials on coin (floor line 0.5 to 1.4, role, party 1.17 / 0.53, ground 0.7) | MERGE | Into one wage curve by monster Level. Four compensating multipliers is brief 40's "accidental complexity" |
| 7 | The Shop as buyer of last resort at half book | KEEP | A floor is needed and the market's floor rests on it |
| 8 | Gear drops sold to the Shop as income | REDESIGN | Salvage by default, Shop price for gear cut to a token. Gear becomes Luck and materials, not coin |
| 9 | Tamsin's tally | KEEP | First goal, small gold on purpose |
| 10 | Store supplies charged per use | KEEP | The price of pace, and zero repeated decisions |
| 11 | The store's heal prices (5 rows, 0.19 to 1.75 gold a hit point) | REDESIGN | `price = heals x gold-a-hit-point(tier)`, the curve chosen against the coin coefficient |
| 12 | The store's drink prices (0.14 to 0.49 a point) | KEEP | Gentle slope, same formula once 11 exists |
| 13 | 19 cooked heal foods | MERGE | One ladder of about 8. Wolf, panther and bear meat, bread, potato and mash are beaten by a fish of their tier. Meats become party meal ingredients |
| 14 | 8 buff foods | MERGE | Into the four party meals (ruled, L39) |
| 15 | 6 drinks and 6 thin drinks | KEEP | One clean ladder |
| 16 | Rune families and 5 depths, crafted | KEEP | The element system's cost, and Runecrafting's reason |
| 17 | Store runes at 75% effect (1, 8, 12, 28, 44) | KEEP | The ceiling a crafter sells under. Without it a server of ten has no deep runes |
| 18 | Arrows, bolts, the free Bronze Arrow | KEEP | The Ranger's cost is its identity |
| 19 | Whetstones | KEEP | Melee's optional supply |
| 20 | Stamina refills, steps x1 to x3.5 | KEEP | Ruled. Re-base on the wage curve (row 34) |
| 21 | Blessings | KEEP | Ruled re-price (L23). Re-base on the wage curve |
| 22 | The yard fee, 100 gold a skill level an hour | KEEP | The keystone repeating sink |
| 23 | Training items for gold | KEEP | Ruled. Watch it as the first place bought gold becomes power |
| 24 | House dummy: no fee | REDESIGN | Half the fee, forever. Today it deletes row 22 |
| 25 | Bench tax | REMOVE | Under 0.1% of gold out, a generator, a guard, and a first-hour text fix to explain it |
| 26 | Hero slots 400k / 1.5M / 4M | KEEP | Ruled. No further raise |
| 27 | Tempering and Hallmark prices | KEEP | Above a band on purpose (ruled 11-18) |
| 28 | Bag rungs, Storage chests, Key Ring | KEEP | Room |
| 29 | Setup slots 4 and 5: the price | REMOVE | Free. 0 paid, and it sells a remembered decision |
| 30 | Crier, Round, powders, colors, rename, titles | KEEP | Built, cheap, waits for a town |
| 31 | Gold Given board | MERGE | Into the Works plaque (ruled) |
| 32 | Town Works, a project a month | KEEP | Ruled. The small server's prestige sink |
| 33 | The market shut until the Works goal | REMOVE | Open on day one. The first project builds something else |
| 34 | Six hand price lines (refill 1,000 + 250 a Level, Blessing 100 + 10, yard, rename 20k + 500, colors 1,500 + 50, Tempering tier tables) | REDESIGN | Each becomes `hours x wage(Level or tier)`. One curve, one coefficient a price |
| 35 | The Weighhouse: listings only | REDESIGN | Standing orders, routing from loot rules, sourcing from the refill |
| 36 | Market fee 1% and cut 4%, burned | KEEP | A sink that grows with trade |
| 37 | The market's 1,000 gold a unit ceiling floor on stackables | REMOVE | A laundering route (dive 24 Q9). For Security |
| 38 | "List for a friend" | KEEP | Ruled |
| 39 | Premium, account-wide, comfort only | KEEP | Ruled |
| 40 | The gold floor | REDESIGN | A budget for the hunt, remembered a ground, with a sane default |
| 41 | `SUPPLY_SHOP_OFFERS` (40 Shop rows for supplies the Shop no longer sells) | REMOVE | HYPOTHESIS: dead since the 10-20 ruling. The formula audit confirms and deletes |
| 42 | Scaled hunt hours for gold | KEEP | Repeating sink that revives old grounds |
| 43 | Lone hunts out-earning parties in gold | KEEP | Ruled 11-13. A real choice between gold and XP |
| 44 | Linings (designed) | ADD | The first repeating sink that buys power. Build before any other sink |
| 45 | A daily gold made / destroyed / held line | ADD | The economy has no gauge |
| 46 | Clan castle tenure by burned bid | DEFER | The self-indexing sink. Needs hundreds of players |
| 47 | Craft orders (I bring materials and a fee, your level 90 smith makes it) | DEFER | The second market after orders work. Skill level is the one thing an account cannot make in a day |

**Counts (47 rows).** KEEP 26. REMOVE 6. MERGE 4. REDESIGN 6. ADD 2. DEFER 3. One more ADD (standing orders) is counted inside row 35.

### The 8 criteria for each significant one

| Proposal | Player value | Strategic depth | Uniqueness | System interaction | Balance impact | Complexity cost | Long-term value | Recommendation |
|---|---|---|---|---|---|---|---|---|
| Idle market (35) | Loot and crafts sell for more than the Shop pays without a visit. Supplies cost less than the store without a visit | What to make, what to bid, when to hold. A crafter has a customer | No idle game we borrow from routes trade through its automation. Fits "set once" exactly | Crafting gets a consumer. Old grounds' drops get buyers. Store bill falls for buyers. Shop faucet shrinks | One order framework, prices bounded by Shop bid and store price for supplies. No per-item rules | L. A money surface: escrow on bids, caps, Security review. One new table and three verbs on the built market | Grows with population and with every new item | REDESIGN |
| Wage curve and price formula (34, 6) | Every price can say "about N hours of hunting at your Level" | Makes "is this worth it" answerable | Replaces six lines and four dials | Every sink and the coin move together when one number moves | This is the framework itself. Removes exceptions | M. Data and generators, no engine change. Every price re-derived once | Holds to Level 400 and past by construction | REDESIGN |
| Heal price formula (11) | Hard tiers cost what was chosen, not what a table fell into | The food slot becomes a real choice of speed against cost | None lost | Deadly bill, healer's worth (mana is cheaper a point than food), Cooking's margin | One coefficient curve. Moves G-2 and G-4 everywhere at once | S in data. Needs the matrix to pick the curve | Yes | REDESIGN |
| Gear leaves the faucet (8) | A drop is a decision (wear, sell to a player, salvage) and not a coin | Luck against gold | Removes a duplicate: coin already pays the hunt | Gold in falls about a fifth. Luck bar fills faster. Market gets gear listed above a low Shop bid | One coefficient (the Shop's gear rate). Every "weeks" number moves | M. Depends on salvage (L34) and loot rules (L21) | Yes. It is what keeps drops meaning something at Level 300 | REDESIGN |
| Dummy halves the fee (24) | Still the big house trophy, still saves real gold forever | Buy it or keep paying: a real payback question | n/a | Keeps the yard sink alive for rich accounts | One coefficient | S | Yes | REDESIGN |
| Hunt budget (40) | Never wake to an empty purse | "How much is this hunt worth to me" is preparation | Replaces the floor | A new end reason is not needed: `gold_floor` exists | None on rates | S. One limit re-expressed, text | Yes | REDESIGN |
| Bench tax removed (25) | One less thing to learn in hour one | None lost | It duplicates the room's own pull | None of size | None | Negative: deletes a generator and a guard | n/a | REMOVE |
| Market open day one (33) | Trade exists from the first loot | n/a | n/a | Town Works needs a new first project | None | S | Yes | REMOVE |
| Economy gauge (45) | None directly | None | No tool prints it | Tells us when to add a sink | It is the measurement | S once the hourly journal (L13) lands | Yes | ADD |
| Linings first (44) | Power that wears off, chosen by ground | Which element, which ground | The only repeating gold-for-power | Old grounds, crafting, the store bill | Inside the ruled 48 h cap | L (ruled lane L32) | Yes | ADD |

---

## 4. Missing opportunities

**4.1 The idle market.** *Why Hearthrise specifically.* The whole game is "decide once, it runs while you are away". The market is the one system that still asks the player to stand at a window. Three parts, all on the built Weighhouse:

- **Standing buy orders.** "I pay 300 each for up to 500 Cooked Shark." Gold is held in escrow. It fills when any seller's goods arrive.
- **The "Sell" loot rule sells to the best order.** When a hero's loot is dispatched, each item marked Sell goes to the highest standing order if that beats the Shop's bid after the cut, and to the Shop otherwise. The player made that decision once.
- **The one-tap refill buys the cheapest stock.** Own stock first (ruled), then player listings priced under the store, then the store. Still one press, still shows the total first (ruled 10-18). In-hunt per-use charging stays the store's.

For supplies the price is boxed in on both sides by NPC prices, so this part of the market cannot be used to launder gold. For gear and rares the existing ceiling and caps apply. It works at 10 players, because an order waits. It does not conflict with automated hunting. It is the automation.

**4.2 One wage curve.** `wage(L)` is the gold a lone MID hero nets in an hour on Normal at Level L, read from the matrix. Every price row holds hours, not gold. The screen can say "about 3 hours of hunting". *Why Hearthrise.* Unlimited Levels. A hand price in gold is wrong one region later. The formulas are meant to be public (ruled 11-08), and "hours of your own hunting" is the only price a wiki can explain.

**4.3 A hunt budget.** "Spend at most N at the store on this hunt", remembered for each ground and tier, shown on the picker beside the tier. *Why Hearthrise.* Hunts run with the browser closed and the store charges by the use. Brief 45 names resource management as where decisions should live. Today the decision is hidden and its default (keep 300) is unsafe.

**4.4 The gauge.** One daily line: gold created, destroyed and held, by source and sink, a day and an account-age bucket. *Why Hearthrise.* A long-lived server with a real-money link to gold. The Crown price in gold is going to be watched by every player. We should see it coming.

**4.5 A self-indexing sink, later.** One scarce, visible, shared thing whose price is a bid of burned gold. Clan castles are already in the plan and are the natural one: tenure for a month to the clan that burns the most. *Why Hearthrise.* Every other sink has a price we set, and every price we set goes stale as the server ages. A bid does not. Not before clans have people in them.

**4.6 Craft orders, later.** A hunter posts materials and a fee. A crafter with the level fills it. *Why Hearthrise.* An account can make its own labor but not its own level 90 smith. Level is the scarce input, so it is the thing to trade. Tyler did not object to shared-work commissions on 11-18. This is that, on the order book.

Not proposed, on purpose: a second soft currency, daily login gold, repair bills (ruled out), any random gold spend (ruled out), auction-house bots or price history charts beyond the suggested price.

---

## 5. Interaction traces (hypotheses for phase B)

**5.1 The idle market**

| Touches | Expected | Risk |
|---|---|---|
| Combat | Deadly parties' store bill falls as player food and runes fill refills. Full-effect crafted supplies become normal on hard tiers, so kills speed up a little | Deadly gets cheaper than "struggle or pay" intends. The heal price formula (5.2) is the dial for that |
| Progression | Pace on hard tiers rises a few percent from better runes. Crafting levels gain a reason past self-supply | A crafter's wage must stay under hunting's, or everyone crafts. `tests/craft-wages.mjs` already guards this |
| Economy | Gold that was destroyed at the store now moves to crafters, with 5% burned. So the store sink shrinks. G-9 and G-11 get worse unless 5.3 lands first | This is the main unintended effect. The store sink is replaced by the yard and linings, not by the cut |
| Crafting | Cooking, Runecrafting and fletching get customers. Fishing gets a price | Autarky still holds for accounts that do not care. That is fine |
| Gear | Drops listed above the Shop's bid find buyers. Rolled jewelry gets a book | Thin books. The suggested price carries them |
| Parties | A party can run on one member's orders | None |
| Server | A fill is one batched RPC at dispatch or refill, never per kill | Order matching must not run on the settle. Budget it at 0 database-seconds for an account that never trades |

**5.2 Heal price as a formula**

| Touches | Expected | Risk |
|---|---|---|
| Combat | No change to who lives or dies. Only the bill moves | None |
| Economy | If the top of the curve comes down from 1.75 toward about 0.6 gold a hit point, a lone hero on Deadly reads about 2 to 4 times coin instead of 5 to 12, and the four moves toward the 45 to 65% band | Too gentle and Deadly is free again (the 11-16 lesson with Carved runes) |
| Crafting | The room between the Shop's bid and the store's price narrows for high food. Cooking's top margin falls | Check `craft-wages` |
| Parties | A healer's worth is the gap between food gold and mana gold a hit point. A flatter food curve makes the healer worth less in gold | Keep the healer ahead at every tier |
| Progression | Cheaper hard tiers pull players up a tier sooner, so XP pace rises | Read against the Level table |

**5.3 Repeating sinks: yard fee, dummy at half, linings, refills on the wage curve**

| Touches | Expected | Risk |
|---|---|---|
| Economy | At skill 80 a hero training 12 rested hours pays 96k a day. Four heroes, 384k, against 0.2M to 1.1M earned. That alone can put a rich account inside G-9 | Too dear for the new player. The fee is by skill level, so it starts near zero |
| Crafting | Every rested hour is now a choice: train (costs gold) or work (makes goods). Fewer hours crafting, so less autarky, so more reason to buy | This is intended. Measure hours of each |
| Combat | Skills ahead of the career line. To-hit as a ratio (L15) has to land first, as ruled | Buyers train every hour. Ruled as accepted |
| Gear | Linings add element choice by ground | L32's own trace |
| Parties | None directly | None |

**5.4 Gear leaves the faucet**

| Touches | Expected | Risk |
|---|---|---|
| Economy | Gold in falls 15 to 25%. The slot ladder and every band's shelf are that much further away | The lone game to the first slot gets longer. The slot guard (first slot at or under what one hero banks by Level 32) would go red and the first slot would have to follow |
| Progression | The Luck bar fills from every hunt, so the long chase moves for everybody | The Luck curve was sized on chosen salvage, not default salvage. Its hours must be re-read (standard 9 says the bar keeps its hours) |
| Gear | Each drop asks one set-once question for its kind | None |
| Crafting | If salvage also returns materials, bars and cloth get a second source | Keep salvage to Luck only unless the crafting review wants it |
| New players | P3 sold nothing in 12 hours. A default that does the right thing without a visit helps exactly that player | The first hour needs gold. Keep Shop prices for tier 1 and 2 gear as they are |

---

## 6. Priority list

| # | Item | Class | Complexity | Risk | Expected benefit | Depends on | Evidence or hypothesis | Needs real players? |
|---|---|---|---|---|---|---|---|---|
| 1 | Idle market: orders, loot-rule routing, refill sourcing | **Critical** | L | Medium (money surface) | The identity line "player-driven economy" becomes true | Market open; loot plan (L21); Security | EVIDENCE that the market is unused and the margin exists. HYPOTHESIS that routing creates trade | Yes. Only a playtest of 30 or more shows whether orders fill |
| 2 | Wage curve, prices as hours of it, coin dials folded | **Critical** | M | Low | One number moves the whole economy. Prices hold to Level 400 | The matrix (wage read from it); formula audit | EVIDENCE: six lines and four dials in data | No |
| 3 | Heal price as a formula | **High** | S | Medium | G-2 fixed at its cause | 2; matrix diff | EVIDENCE: the table. HYPOTHESIS: the right slope | Partly. "Struggle or pay" is a feel |
| 4 | Linings built first, yard fee live, dummy at half fee | **High** | L (linings), S (rest) | Low | Repeating sinks reach the G-9 band for rich accounts | L15, L19, L32 | EVIDENCE: shelf lasts 14 weeks. HYPOTHESIS: players choose to train | Yes: do players set "train" in the after-hunt plan |
| 5 | The economy gauge | **High** | S | None | We can see inflation before players do | L13 | n/a | No |
| 6 | Gear salvaged by default, Shop gear rate cut past tier 2 | **High** | M | Medium (moves every gold number) | Drops mean something. Faucet down a fifth | L34, L21 | EVIDENCE: 86% sold, 0.9% worn. HYPOTHESIS: players prefer Luck | Yes |
| 7 | Hunt budget in place of the gold floor | **Medium** | S | None | No overnight empty purse | None | EVIDENCE: floor default 300, max 100,000; lone Deadly burns up to 121k an hour | No |
| 8 | Market open on day one | **Medium** | S | None | First contact with trade is a market, not a locked door | A new first Works project | EVIDENCE: PLAYED in dive 24 | No |
| 9 | Food rows merged to one ladder | **Medium** | S | Low | Fewer dominated rows, clearer Cooking | Crafting review | EVIDENCE: rows | No |
| 10 | Bench tax removed, setup slots free, dead Shop supply rows deleted, stackable ceiling floor removed | **Remove or simplify** | S | None | Less to learn, less to maintain | None | EVIDENCE: 0 paid, under 0.1% of gold out | No |
| 11 | Crowns | **Defer** | L | High | The money model | 1, 4, Premium (L27) | Ruled | Yes |
| 12 | Castle tenure by burned bid; craft orders | **Defer** | M each | Medium | The sink that indexes itself; the skill market | Population; 1 | HYPOTHESIS | Yes |
| 13 | Further raise of hero slots | **Do not do** | n/a | n/a | Negative for new players | n/a | EVIDENCE: lone deaths 6.7 a 100 h against 1.2 in a party; two players quit at Levels 7 to 9 | n/a |

**What only real players can tell.** Whether anyone posts an order. Whether a player with 2M wants skills enough to pay the yard. Whether Luck from salvage feels better than gold from the Shop. Whether Deadly at half coin feels like a struggle or like a tax. Playtest: 30 accounts for two weeks with the market open and the gauge on, and read orders filled a day, hours trained against hours worked, and the purse curve at day 14.

---

## 7. Tyler decides

1. **Build the idle market before Crowns and before any new sink beyond the ruled ones.** Reason: it is the only missing piece of the stated identity, and Crowns cannot have a price without it. *Strongest alternative:* leave the market as listings and accept that Hearthrise is a self-sufficient game with a Crown exchange.
2. **Every price becomes hours of one wage curve, and the coin dials fold into that curve.** Reason: unlimited Levels, public formulas, and one number to steer. *Alternative:* the ruled band index past Krell only (24-11), leaving Levels 1 to 110 hand-priced.
3. **The store's healing price becomes a formula, with its top near 3 times the coin coefficient instead of 8.** Reason: it is the cause of the Deadly bills, and it is one curve. *Alternative:* leave the table and re-tune Deadly's damage, which is the ground-by-ground patching brief 40 forbids.
4. **The house dummy halves the yard fee and does not end it.** Reason: at the ruled fee it pays back in a few days and removes the one sink that never ends. This changes your 11-08 wording ("you don't have to pay per hour"). *Alternative:* keep "no fee" and price each skill at about 60 days of the fee it removes, which is tens of millions.
5. **Gear is salvaged by default and the Shop's price for gear past tier 2 drops to a token.** Reason: gear is 26% of gold in and almost none is worn. *Alternative:* keep the Shop price and let the loot plan offer salvage as a choice (the plan as ruled).
6. **Open the market on day one. Town Works' first project builds something else.** Reason: a locked market teaches that there is no market. This changes 24-7. *Alternative:* the ruled goal sized to the server, which opens it in about a week.
7. **Remove the bench tax and make setup slots 4 and 5 free.** Reason: two fees nobody feels, one of which charges for a remembered decision. The second changes your 11-05 ruling. *Alternative:* keep both as built. Neither moves a ledger.
8. **Do not raise hero slots again.** Reason above. *Alternative:* raise only slot 4, which no new player meets.
9. **A hunt budget replaces the gold floor.** Reason: safety for a game that spends while you sleep. *Alternative:* raise the floor's maximum and default, which is one row and half the benefit.

---

## 8. For other areas

| To | What |
|---|---|
| Formula audit (41 to 44) | Coin has four stacked dials (floor line, role, party fit, ground 0.7). The store heal table is a hand curve that sets every net-gold cell. Six price lines are each linear in Level against a wage that is not. `SUPPLY_SHOP_OFFERS` looks dead. `GOLD_FLOOR.max` 100,000 is an unexplained cap. `ceiling_min` 1,000 on the market is an unexplained floor |
| Combat review | The 2 second shared food cooldown is what forces the expensive food. Any change to hero hit points, heal sizes or the cooldown moves every gold cell. A healer's gold worth is food price less mana price a hit point |
| Crafting and items reviews | The margin for every supply sits between the Shop's bid and the store's price (shark: 24 to 924). Is a maker's hourly wage on that margin under hunting's? Which of the 19 heal foods survive. Whether each region's materials come only from that region, so that no account makes everything at once |
| Social review | Castle tenure as a burned-gold bid. On-call heroes and shared supply cost should pay through the same order book, not a second money surface |
| Platform review | Four lone Normal hunts are the best gold an account can make and are four instances. Does that fit 60 database-seconds a day? An order fill must be one RPC at dispatch, never work on the settle |
| Retention review | The yard as the thing gold is for in rested hours. The purse with nothing to want arrives for everyone at about week 14 at 12 hours a day |
| Game Director (60) | The economy is the area where the identity and the build disagree most. If one identity line had to be dropped rather than built, it is this one. I recommend building it |

---

## 9. Evidence and hypotheses

**Evidence**

| Claim | Source |
|---|---|
| Coin is 0.30 gold a monster hit point with four multipliers | `src/data/balance-sheet.js` lines 175 to 219, 311 to 319, 390 to 393 |
| Store heal prices 0.19 to 1.75 gold a hit point; drinks 0.14 to 0.49 | `src/data/supply-basics.js` BASIC_SUPPLIES |
| Cooked Shark: book 48, heals 528; Shop buys at half book | `src/data/items.js`, `catalogue.js` SHOP_BUYBACK_RATE |
| Lone, pair and four net gold and store share by Level | `progression-grid.json`, commit 07c836bfd, MID gear. Levels 125 to 185 are staged grounds, 200 and up projected |
| The real four: +9,078 a hero-hour, store 48% of coin on Deadly, a third of supplies home-made | `10-real-players.md` sections 1 and 4. One person. Thin |
| 26% of gold in is sold loot; 86% of gear sold, 0.9% worn; 7 listings, 0 real buys | `10-real-players.md` sections 4, 6, 7 |
| The shelf to Krell is 53.26M and about 14 weeks of an own four at 12 h | `gold-model.mjs --shelf`, run 2026-11-21 |
| Yard fee ruled at 100 gold a skill level an hour; dummy 150k to 600k | rulings 11-20 (24-8); `src/data/gold-sinks.js` |
| Gold floor default 300, most 100,000 | `src/data/hunt-sessions.js` GOLD_FLOOR |
| Market: 1% fee, 4% cut, 2M a day caps, no buy orders | `2027-01-12-market-account.sql`, `hr-accrue/market.js` |

**Hypotheses, and how phase B or a playtest settles each**

| Hypothesis | Settled by |
|---|---|
| A heal price curve topping near 0.6 gold a hit point puts the Deadly four at 45 to 65% of coin | matrix diff with the five food prices patched |
| Folding the coin dials into one curve by monster Level leaves G-1 green | matrix diff |
| Default salvage cuts gold in by 15 to 25% and breaks the first-slot guard | matrix diff with the Shop's gear rate patched, then `gold-model --slots` |
| The yard at the ruled fee, 12 rested hours, puts a rich account inside G-9 | `gold-model` with a yard row; no engine needed |
| Four lone hunts cost about four times one party hunt on the server | the cost fixtures (L11) |
| Routing through loot rules and the refill creates trade without visits | playtest only |
| Players with idle gold will pay to train | playtest only |
| Server-wide destroyed over created stays under 0.5 after the shelf is bought | the gauge, on a live server |

**Not checked in phase A.** The harness four over-buys at the store against the real four (known as K1), so every four-hero store share above is an upper bound. The Level 40 pair cell is one ground. No production read was made for this review.
