# 04. The economy and Crowns

Chapter 04 of "Hearthrise: the game we are building". Game designer, 2026-11-21, on `lane/d-book-economy`. Design only. No game code, data or migration is touched.

**How to read the status marks.** Every design statement carries one of three marks.

- **RULED** with a date or a call id. Tyler has decided it.
- **RECOMMENDED** with the open call that decides it (GR-x from the game review, MM-x from the MMO layer study). The chapter writes the recommended design as the design, so it reads as the whole game if Tyler takes the recommendations.
- **OPEN** with what decides it. Nobody has a recommendation yet, or the recommendation waits on a measurement.

**How to read the number labels.** TARGET is a number the design aims at. COMPUTED is arithmetic on a formula or on stated inputs, with the method beside it. MEASURED is a matrix run of a proposed change, and it is evidence about that proposal only. SIMULATOR marks a reading whose only use is to say how far the measuring tool can be trusted.

**The frame every number sits in.** An account runs four heroes from its first day (RULED 2026-11-21). Each hero hunts 12 hours a day and works in town for the other 12 (RULED 2026-11-21). Numbers are read at low, mid and best gear from Level 1 to 400 (RULED 2026-11-21). The four hunting together earn more XP and more gold a head than the same four split up, and no band or target is built around party size (RULED 2026-11-21).

---

## 1. The experience

**Minute 5.** Your four heroes are in their first hunt and gold is ticking into one purse that all four share. Food and arrows are being used up and you never bought any. The store charges you a little each time a hero eats or shoots, and the hunt card shows what the hunt earned and what it spent. You have made no shopping trip and you never will have to.

**Hour 1.** The first choices about gold arrive, and each is a choice between heroes. One purse, four heroes. Does the tank get the first Tempering rung or does the hammer? Do the heroes train at the yard in their rested hours, which costs gold, or work a bench, which makes goods? The market is open. You set a loot rule once ("sell these") and from then on your drops go to whichever buyer pays most, a player's standing order or the Shop.

**Hour 20.** You are a few bands in and you cannot afford everything, on purpose. A band's upgrades cost a bit more than the band earns, so your four do not look like anyone else's four. You have a spending budget on your hard hunts, so you never wake to an empty purse. Your supply refill quietly buys a crafter's cooked fish because it was cheaper than the store's. You have seen the Crowns book. Premium for a month costs about three days of your four's gold, and you are deciding whether your idle gold is worth it.

**Hour 2,000.** Gold still matters. Every band you enter has its own Tempering, Hallmarks and linings, priced as a share of what that band pays, so there is always something worth more than you hold. The yard never stops being useful because combat skills never cap. Your clan's castle takes gold and pays buffs. Boss and arena pieces trade on the market, and players who buy Crowns are your best customers. If you pay, you sit at the ceiling all the time: about 60% more Levels an hour than a plain four, no band ahead of anyone. If you do not pay, you reach the same ceiling with gold you hunted. Nobody is past it.

---

## 2. The design

### 2.1 Gold: one currency, one purse, one ledger

| Rule | Status |
|---|---|
| Gold is the only soft currency. No system gets a second one | RECOMMENDED, GR-51 (55 row 1). The single purse is RULED 2026-10-23 |
| One purse for the account, shared by all four heroes. Items stay in each hero's bag and move only through Storage or trade | RULED 2026-10-23 |
| Every gold movement is a journal row written by the server. The player sees a history by hero, by kind and by day, summed by hunt and by purchase | RULED 2026-10-23, CLAUDE.md section 1 |
| The old gem rows, their RPC and the tradeable bond item are removed | RULED 2026-11-20 (24-5) |
| No bound gear. Everything worn trades | RULED 2026-10-23 |

**The decision the shared purse creates.** Four heroes and one purse means every purchase is also "which hero". That choice exists from the first hour, and it is why sinks are sized above what a band earns (section 2.6).

### 2.2 Gold in

**The coin line.** Formula step R9, knobs `coinLine` and `coinPerKill`.

`coin a kill = coinPerHp(monster Level) x monster health x role share x group share`

| Rule | Number | Status |
|---|---|---|
| Coin is paid by monster health removed, on one line that is a function of monster Level only. There are no per-ground coin dials | `coinPerKill` 0.30 gold a health point as the base of the line. TARGET | RECOMMENDED, GR-51 and GR-85 (44 call 4, R9) |
| A new ground never pays a hero on Normal less than the ground before it | Band G-1: net gold never falls from one checkpoint to the next | RULED 2026-11-20 (24-2) |
| Tiers move XP and difficulty. They never move coin | Dangerous and Deadly pay the same coin a kill as Normal | RULED 2026-11-07 |
| No buff ever raises coin from kills | The coin row of the buff caps is "none" | RECOMMENDED, MM-25 |
| The four together earn more gold a head than the same four split up | No target or band. The party table and party buffs carry it | RULED 2026-11-21 |
| Coin is split evenly across the party with a moving remainder | | Built rule carried. RECOMMENDED to keep, GR-85 |

**Why coin follows health.** Kill speed is income, so every combat upgrade is also a gold upgrade, and one number (`coinPerKill`) moves all gold in at once. MEASURED on the matrix for this proposal: moving `coinPerKill` moved gold bands and no combat, pace or survival band, which is what a clean coefficient should do (55 run 3).

**Loot sold.**

| Rule | Status |
|---|---|
| The Shop buys anything, without limit, at one sale formula: `bid = book value x saleShare(tier) x raw rate`. It works at tier 8 and past. Knob `saleStep`, step R17 | RECOMMENDED, GR-87 |
| Gear sells to the Shop for about a quarter of a tier's coin | RULED 2026-11-20 (23-10) |
| The Shop's bid is the floor under every market price | RECOMMENDED, GR-50 |
| Salvage is a choice on the loot plan beside Sell, with both numbers shown and a starting plan so no new player meets a wall of dropdowns. Salvage pays Luck materials, which are account-bound | RULED 2026-11-20 (Luck v3.1). The starting plan is RECOMMENDED, GR-46 |
| Drops are written in hours, and the chance is derived from the ground's kill rate. Knob `bandHours`, step R18 | RECOMMENDED, GR-87 |

MEASURED on the matrix for the rejected alternative (salvage by default, modeled as 15% less gold in): 40 gold band rows got worse and none got better. That is why salvage stays a choice.

**Smaller sources.** Tamsin's tasks pay small gold on purpose and are a new account's first goal. Crafted goods sell at the Shop floor or to players. Both RECOMMENDED to keep, GR-51 (55 rows 9 and 7).

**What never makes gold.** Crowns, the store, buffs, events, world bosses and arenas mint no gold (RECOMMENDED, MM-25 and MM-29). Money moves gold between players. It never creates it.

### 2.3 The wage curve, and prices measured in hours

Formula step R15, knob `wageShare`. RECOMMENDED, GR-51.

**The wage.** `wage(L)` is the gold one hero nets in one hunted hour at Level L. The server computes it. No simulator sits in the path of a price.

`wage(L) = coinPerHp(L) x reference monster health(L) x killRateRef(L) x group share x (1 - supply share)`

It uses the same reference kill rate the kill reward uses (knob `killRateRef`, step R12). The balance matrix checks the formula against played net gold within 10%.

**The seat the wage is read on.** RECOMMENDED, inside GR-51: one hero-hour of a mid-geared four on Normal. Study 44 wrote the wage on a lone hero. Tyler's 11-21 rulings make the own four the frame and drop every lone target, and study 51 found a lone seat cannot be calibrated, so the four is the only seat that can carry a price. This is a designer change to 44's wording and it rides GR-51.

**Units.** These three are used through the rest of the chapter.

| Unit | Meaning |
|---|---|
| A hero-hour | `wage(L)` |
| A hero-day | 12 hero-hours |
| An account-day | 4 heroes x 12 hours = 48 hero-hours |

**The price rule.** Every price that repeats is a row holding hours. The gold is `hours x wage(L)`. The screen can say "about 3 hours of hunting" beside any price.

| Kind of price | Read at | Why |
|---|---|---|
| A thing one hero uses (a refill, a Blessing, a Tempering rung, a Hallmark, a lining, an hour at the yard) | That hero's Level, in hero-hours | It follows the hero who benefits |
| A thing the account owns (Storage, curing slots, the House dummy, a rename) | The account's highest hero Level, in account-hours | The whole four pays for it and uses it |

That table is the answer to "early prices sized for an account of four". RECOMMENDED, GR-8 and GR-51. It is new in this chapter.

**The size bands every price is judged by.** Band G-8 of the standards. TARGET.

| Kind of buy | Cost in days of the buyer's own gold |
|---|---|
| A small buy | Under 1 day |
| A band goal | 3 to 10 days |
| A long goal | 20 to 60 days |
| Anything that carries power | Never over 90 days |

**Every price surface.**

| Price | Rule | Number | Status |
|---|---|---|---|
| Stamina refill | Six a day. Each costs more than the last: x1, 1.5, 2, 2.5, 3, 3.5. Gold only, never Crowns | The steps are RULED. The base hours of the first refill are OPEN | Steps RULED 2026-11-20 (24-1). Base on the wage curve RECOMMENDED, GR-51. The number waits for the store bill to be measured right, GR-58 |
| Blessings | A set is priced as a share of the hunted hours it saves, in the buyer's own gold. A death costs 6% of Level XP flat with no cap, and the three Blessings cut that by 25, 50 and 75% | The share is a knob. OPEN until GR-7 is ruled | Death cost RULED 2026-11-21. The price rule RECOMMENDED, GR-51 (44 call 14). The ladder past the third Blessing is GR-7, chapter 05 |
| The yard fee | 100 gold for each level of the skill trained, each hour | 100 x skill level | RULED 2026-11-20 (24-8) |
| The yard's rate | The XP an hour follows a share of the skill level's cost and never passes half of what hunting pays that skill. The fee follows the rate, so a point of XP never gets cheaper | TARGET: at most half of hunting | RECOMMENDED, GR-54. It re-opens 11-14 and two rulings of 11-20 |
| The House dummy | It ends the yard fee for one skill. It is sold in rungs by skill band, and each rung costs 25 to 50 hours of the yard fee at that band | 25 to 50 hours. TARGET | "No fee" RULED 2026-11-08. Payback RULED 2026-11-20 (26-5). The rungs RECOMMENDED, GR-53 |
| Training items | Double the yard's rate for their hours. Sold for gold and tradeable, or for Crowns and bound | | RULED 2026-11-14 |
| Bench tax | 15% of the output's Shop bid on each job, until the House room for that bench is bought | 15% | RULED 2026-11-01. Onto the wage curve RECOMMENDED, GR-56b |
| A scaled hunt hour | An hourly fee to hunt an old ground at your own Level, on the wage curve | OPEN. Free or a fee is ruled after players have used it | RECOMMENDED, GR-9 (chapter 02) |
| Setup slots | Free. A saved setup is a remembered decision and is never sold | 0 | RECOMMENDED, GR-56a. It re-opens 11-05 |
| Rename, hero colors | Hours on the wage curve | Small buys, under 1 account-day. TARGET | RECOMMENDED, GR-51 |
| The Town Crier, a Round, flame powders, titles | Being seen in town. Price rows that climb with each use in a day | | RULED 2026-11-04. Their merge into one Great Hearth is GR-82, chapter 06 |
| Bag rungs, Storage chests, the Key Ring | Room. Typed ladders, judged by band G-8 | | RULED 2026-10-22 (Storage grows with gold) |
| The House and its rooms | Typed content, judged by the same bands. Rooms are things, not a curve | | RECOMMENDED, GR-51 (44 section 5.3) |
| Hero slots | None. All four heroes are free from the start | 0 | RULED 2026-11-21 |

**Why hours.** Levels never end. A price typed in gold is wrong one region later. A price in hours is right at Level 20 and at Level 2,000, the formulas are meant to be public, and "hours of your own hunting" is the one price a player can reason about.

### 2.4 Supplies and the store

**The rules.**

| Rule | Status |
|---|---|
| A hero uses its own stock first, then the store. Every spent supply (food, drinks, arrows, runes, whetstones) has a store partner, charged each time it is used, with the browser open or closed | RULED 2026-10-23 |
| Running out of a supply never ends a hunt. Running out of gold does | RULED 2026-10-16 and 2026-10-23 |
| The store's copy of a supply works at 75% of the crafted one. Knob `storeSupplyShare` | RECOMMENDED to keep, GR-50 (55 row 17). It is the ceiling a crafter sells under |
| The Ranger pays for its basic attack with ammunition. That cost is its identity | RULED 2026-10-23 |
| Runes fuel spells only. A caster's basic attack runs on mana | RULED 2026-10-23 |
| One press refills a hero's supplies and shows the total first | RULED 2026-10-18 |
| A hunting hero can carry supplies from the bag into a running hunt with one press | RULED 2026-11-02 |

**What the store is for.** It is the price of pace. A player who prepares stock pays less, and a player who does not is never stopped. It asks for zero repeated decisions, which is the first principle of the whole game.

**The store bill by tier.** Band G-2 of the standards. TARGET.

| Tier | Store bill as a share of coin earned, mid gear, in band |
|---|---|
| Normal | Under 15% |
| Dangerous | 25 to 40% |
| Deadly | 45 to 65% |

Tyler's direction on what a hard tier costs: fight outside your weight class and "you're gonna waste money but get more exp and possibly die a few times" (RULED 2026-11-06). Low gear on Deadly loses money (band G-5, RULED direction 2026-11-19). A mid-geared four on Deadly nets 3,000 to 8,000 a hero-hour at Levels 50 to 110 and never under zero with a quarter of its stock home-made (band G-4, RULED 30-5).

**A party's bill is runes and ammunition.** MEASURED for the heal price proposal: the four's store bill did not move by 0.1% when food prices changed, because a party's healer heals on mana. So the size of a party's bill is set by the store's rune and ammunition prices, and no formula step owns those yet. See section 5.

**The hunt budget.** RECOMMENDED, GR-57. Each hunt carries "spend at most N at the store". It is remembered for each ground and tier, shown on the hunt picker beside the tier, and set with a sane default. When the budget is spent the hunt ends the way a hunt ends when gold runs out. It replaces a fixed gold floor. The reason is safety for a game that spends while you sleep. COMPUTED from matrix cells for this design: a lone mid hero on Deadly can spend over 100,000 gold an hour at the store.

**Food and drink rows.**

| Rule | Status |
|---|---|
| Cooked healing food is one ladder of about eight rows. Meats that a fish of the same tier beats become party meal ingredients | RECOMMENDED, GR-51 (55 rows 13 and 14). Chapter 03 owns the rows |
| The eight buff foods become the four party meals | RULED 2026-11-20 (plan lane L39) |
| Drinks are one clean ladder, crafted and store | RECOMMENDED to keep |
| Store runes are sold at five depths. Storm and Bone runes open at Runecrafting 25 and 40 | Rune tiers RULED 2026-10-23. Storm and Bone RULED 2026-11-21 |

### 2.5 The heal price line

Formula step R14, knob `healPrice`. RECOMMENDED, GR-52. It lands after the store bill is measured right (GR-58).

**The formula.**

`store price of a heal = hit points healed x goldPerHp(tier)`

`hit points healed = a fixed share of the reference hero health of the item's tier`

| Part | Number | Label |
|---|---|---|
| `goldPerHp` at the bottom of the ladder | 0.19 gold a hit point | TARGET |
| `goldPerHp` at the top of the ladder | 0.60 gold a hit point, about two to three times the coin coefficient | TARGET |
| Heal size | A share of reference health, on the same curve as gear, so a heal is worth the same slice of a hero at Level 30 and Level 1,000 | TARGET. The share is a knob |
| Store drinks | The same formula, 0.14 to 0.49 gold a point of mana | TARGET |

**Why a line.** Coin a kill is a formula, so the price of healing must be one too, or net gold on every hard tier is set by a hand table. The price of healing is a tax on how fast a hero must heal. The slope of the line is the dial for "struggle or pay".

**Why the second half.** Hero health keeps growing with Level. A food ladder with a fixed top means forty bites a fight at high Level, and it also means a cheaper top row is simply a smaller bill for ever. Heal size on reference health removes both.

**Evidence.** MEASURED on the matrix for this proposal (55 run 1, 207 cells): a lone mid hero on Deadly pays 49% less at the store at every Level from 60 up, and no combat, pace or survival number moves in any cell. Zero unintended bands. The same run showed the regressions past Level 400 that the second half of the formula removes. SIMULATOR caveat: the matrix reads a party's store bill at 1.7 to 2.2 times real (fault F5), so no party gold number can size the line yet.

**What it does not do.** It does not change a party's bill. See 2.4.

**A healer's worth in gold** is the gap between the food price and the mana price of a hit point. The line keeps mana cheaper than food at every tier, so a healer always saves the party gold. TARGET, checked on the matrix.

### 2.6 Sinks: a share of band gold, and the hole the hero slots left

**Tyler's rule.** "I actually dont want everyone to be able to easily unlock everything and upgrade everything. otherwise its not really a gold sink it's just a natural line of progression. I want people to make choices on what is important to them, so each character isn't exactly the same." (RULED 2026-11-18.)

**Standing sinks.** Formula step R16, knob `sinkShare`. RECOMMENDED, GR-8.

`price of a band's standing upgrades = sinkShare x the band's net gold`

| Rule | Number | Status |
|---|---|---|
| A band's standing upgrades together (both Tempering tracks, six crafted pieces kept Hallmarked, linings kept up) cost more than the band earns | 1.2 to 1.4 of the band's net gold. Bands G-10 and E4 | RULED 2026-11-18 for the size. As a formula RECOMMENDED, GR-8 |
| Going up a tier costs only the difference. No purchase is wasted | | RULED 2026-11-20 (23-2) |
| The share is sized on a hero who pays only the difference at every tier, so the 1.2 to 1.4 holds for a careful hero | COMPUTED from the item plan's own table: without this rider a careful hero pays 0.5 to 0.9 of a band at tiers 4 to 6 | RECOMMENDED, GR-8 (47 C2). It re-opens "Tempering stays as built" of 11-18 |
| The share is read on a hero-day of the four, so an account of four heroes faces four heroes' worth of sinks from one purse | | RECOMMENDED, GR-8 |
| A hero that spends everything reaches 70 to 80% of the band's pool | Band E4 | RULED direction 2026-11-18 |
| Every band has its sinks by construction. No ladder ends | | RECOMMENDED, GR-8 |
| No gold-for-power offer is cheaper than Tempering's cheapest rung | At least 1 hero-hour of gold for each 1%. Band E8 | RECOMMENDED |

**The standing sinks, by name.** Chapter 03 owns what each does. This chapter owns what each costs.

| Sink | What the player buys | Shape | Status |
|---|---|---|---|
| Tempering | Permanent rungs on blows or armor. Gold plus crafted salts. Rung prices double, so the last rung is half the track and most heroes stop short | A share of band gold | Crafted salts RULED 2026-11-05. Carries up a tier RULED 2026-11-20 |
| Hallmarks and reforges | Perks on crafted pieces, carried up a tier for the fee difference | A share of band gold | Fees RULED 2026-11-18. Onto `sinkShare` RECOMMENDED, GR-8 |
| Linings | One monster part plus gold. Cured in a House slot. 12 hunted hours, stacking to 48. The first repeating sink that buys power | A share of band gold a week | RULED 2026-11-18. Onto `sinkShare` RECOMMENDED, GR-8 |
| Curing slots | House slots bought with climbing gold, and a gold fee on each cure | Account-hours | RULED 2026-11-18. Built last as a standing order, GR-47 |
| Chest reforging | Its own action, with keys | Chapter 03 | RULED 2026-11-18 |
| The House | Rooms sell kept materials, never speed | Typed | RECOMMENDED, GR-76 |

**Repeating sinks.** Band G-9. TARGET: repeating sinks take 35 to 50% of gold in, every day, at every checkpoint from Level 30.

| Repeating sink | Who it reaches | Grows with |
|---|---|---|
| Store supplies | Everyone, most of all on hard tiers | The tier chosen |
| The yard fee | Every hero in its rested hours, if the player picks training over town work | Skill level, which has no cap |
| Linings | Every hero that wants an element guard or a leech on a ground that asks for one | Band gold |
| Stamina refills | Players who hunt past 12 hours | The wage |
| Blessings | Every hero on a tier that can kill it | The hours a death costs |
| Scaled hunt hours | Players at the frontier, if the fee stays (GR-9) | The wage |
| The market's 5% | Traders | Trade |
| The Crowns book's 5% | Players who buy Crowns with gold | The Crown's gold price |
| Clan castle gifts | Clan members who want the room buffs | Member count (MM-9, chapter 06) |

**The yard is the keystone.** Combat skills have no cap, so the yard is the one sink that never ends. COMPUTED from the ruled fee: a hero that trains all 12 rested hours pays `1,200 x skill level` gold a day, and four heroes pay `4,800 x skill level`. Each rested hour is then a real choice between training, which costs gold, and town work, which makes goods. Tyler's ruling that the every-idle-hour training reading is "a number we watch, never a gate" stands (RULED 2026-11-21).

**The hole the hero slots left.** RULED 2026-11-21: all four heroes are free. A slot ladder would have taken about 5.5M gold from an account in its first weeks (COMPUTED from the retired ladder, used here only to size the hole). That gold needs homes that ask for a choice, or the first weeks have nothing to buy.

RECOMMENDED, GR-8 and MM-22, in the order the gold should meet them:

| # | Home for the gold | When a new account meets it | Why it fits |
|---|---|---|---|
| 1 | The yard fee | Day 1, as soon as a hero rests | Four heroes resting 12 hours each is 48 hours a day that can be trained. It scales with skill, so it starts near zero and never ends |
| 2 | Tempering and Hallmarks, sized on four heroes from one purse | The first gear band, from about Level 15 | The share rule already makes one band's sinks exceed one band's gold. Four heroes make it four times the choice |
| 3 | Linings | The first band whose ground has an element to guard against. TARGET: the second gear band | The first repeating gold-for-power. Sized inside the ruled 48 hour cap |
| 4 | The House dummy rungs | When the yard fee starts to bite, by skill band | It converts a repeating fee into one large purchase, priced at 25 to 50 hours of the fee it ends |
| 5 | The clan castle | When clans open (chapter 06) | Shared work, standing buffs under one cap. Its shape is being revised with study 49, so its size is OPEN |
| 6 | Boss and arena upgrade materials, bought from players | When the first world boss stands | The gold moves to the player who earned the material, and 5% burns on the way |

The yard fee ships before linings (RULED 2026-11-20, 24-12). The numbers for the first week are OPEN. See section 5.

### 2.7 The market

The market is the Weighhouse. RECOMMENDED, GR-50. It is a big bet and it rests on a HYPOTHESIS that standing orders fill.

**The principle.** The whole game is "decide once, it runs while you are away". A market that needs a player standing at a window is the one system that would break that. So the market has no required window. Three set-once decisions do the trading.

| Part | Rule | Status |
|---|---|---|
| Standing buy orders | "I pay 300 each for up to 500 Cooked Shark." The gold is held by the server. The order fills when any seller's goods arrive, with neither player present | RECOMMENDED, GR-50 |
| The Sell loot rule | When a hero's loot is dispatched, each item marked Sell goes to the highest standing order if that beats the Shop's bid after the cut, and to the Shop otherwise | RECOMMENDED, GR-50. Loot rules Keep, Store and Sell are RULED 2026-10-23 |
| The supply refill buys player stock | Own stock first, then player listings priced under the store, then the store. One press, total shown first. Charging inside a hunt stays the store's | RECOMMENDED, GR-50 |
| One book for each piece | Grade and perks are filters on the book, not separate books. An order for a rolled piece names the item and may name perks | RECOMMENDED, GR-50 (item plan section 10, 47 M9) |
| A suggested price | Shown on every book from a reference value the server computes from drop rows, kill rates and recipes. It carries thin books | RECOMMENDED, GR-50 (item plan section 10) |
| List for a friend | A listing can name one friend. Normal fee and caps. There is no trade window | RULED 2026-11-20 (24-6) |
| Open on day one | The market is open from the first loot. The town's first shared project builds something else | RECOMMENDED, GR-55. It re-opens 24-7 |
| The fee and the cut | 1% to list and 4% of each sale, both burned | RECOMMENDED to keep, GR-50 |
| Limits for each account | 50 open listings and 7 day listings. 200 listings a day. 2,000,000 gold spent and 2,000,000 received a day. A Level door, a same-network guard and a price ceiling on every item | RECOMMENDED to keep. All inside the one Security review before Early Access |
| One laundering route closed | The price ceiling on a stackable has no minimum per unit, so junk cannot carry gold between accounts | RECOMMENDED, GR-59b |
| Relisting | An expired listing has "list again", and "always list these at the suggested price" is a loot rule | RECOMMENDED, GR-50. It removes a repeated decision |

**What trades and what does not.**

| Trades | Does not trade |
|---|---|
| All gear, chest pieces, crafted pieces, boss and arena pieces, gems, chips, patterns, materials, unfitted linings, training items bought with gold (RULED 2026-10-23, item plan section 10. Boss and arena gear RECOMMENDED, MM-27) | Chest keys, fitted linings, Lucky Rivets and anything else that feeds Luck, anything bought with Crowns (RULED 2026-11-14 and 2026-11-20) |

**The price box on supplies.** For a supply, the Shop's bid is the floor and the store's price is the ceiling. That is wide. A cooked top-tier fish replaces store food worth many times what the Shop pays its maker, and that gap is the room a crafting economy lives in. Because both ends are NPC prices, the supply side of the market cannot be used to pass gold between accounts.

**What is scarce enough to trade.** Not labor. An account of four heroes with 48 rested hours a day makes its own staples. What it cannot make in a day is hunted hours, rare drops, a high crafting level, and parts that only one ground or one boss drops. The market is designed around those four.

**The order of work, and its rider.**

1. The order book and rare pieces first. RECOMMENDED, GR-50.
2. Supplies through the refill second, and only after the harder tiers are sized on full-effect supplies. RECOMMENDED, GR-50. MEASURED on the matrix for this proposal, as the most the market can move combat (55 run 2, every supply at full effect): a four gains about 6% damage and Level XP, takes about 16% less damage, and on Deadly gains up to 10% XP. That is free power for anyone who trades. So tiers are sized on the real kit first. If Deadly proves too soft with a working market, the answer is the one knob `storeSupplyShare`, never a change to a ground.
3. Single commissions (one Hallmark or one reforge on a piece the owner keeps, held by the server throughout) ship with jewelry tiers 5 to 7. RECOMMENDED, GR-44.
4. Bulk orders and craft orders ("I bring materials and a fee, your level 90 smith makes it") come after orders are proven to fill. Built later and hidden until they work. Nothing planned is cut (RULED 2026-11-21).

**Server rule.** A fill is one batched call at loot dispatch or at a refill. Nothing about the market runs on the hunt's settle, and an account that never trades costs nothing (band C6). PENDING study 48 for the measured cost.

### 2.8 The Crowns engine

**Tyler's rule.** "This game needs a model where buying crowns and selling for gold WILL provide advantages. Just not broken af ones." (RULED 2026-11-21.) And the intent behind it: "I plan on making money in this game by people buying premium, and people buying crowns to sell to other players for gold. I don't want to cripple people so that the only way they can progress is by paying to win, however, I do want whales to pay for gold so they can have an 'edge'." (RULED 2026-11-18.)

**The rule of the design.** RECOMMENDED, MM-28. Paying gives a real edge that can be felt, and the edge has a ceiling written in numbers. A player who pays reaches the ceiling sooner and stays there all the time. A player who does not pay can reach the same ceiling with gold. Nobody can go past it.

**When it comes.** The Crowns engine runs on its own book and does not wait for the market, because Crowns buy Premium and boosts and those need no market (MM-28 to MM-37, which supersede GR-60).

**The loop.**

1. A player buys Crowns with money.
2. That player spends them in the store, or lists them on the Crowns book for gold.
3. A player with gold buys those Crowns and spends them in the store. A Crown bought with gold is bound to that account and cannot be listed again.
4. The first player now holds gold that other players hunted. It buys gear and upgrade materials from players and pays the sinks of section 2.6.
5. The sinks destroy the gold. The gear and materials were dropped by someone's heroes, and that someone is paid for playing.

No gold is created by money and no gear is created by the store.

**What Crowns buy.** RECOMMENDED, MM-29 and MM-30.

| The advantage | How a payer gets it | How a non-payer gets it | Bounded by |
|---|---|---|---|
| Timed boosts on damage, damage taken, Level XP and drop chance | The store, for Crowns, in 1 day and 7 day sizes | Earned from bosses, the clan, events and arenas. Or Crowns bought with gold | The timed caps below. A bought boost and an earned buff are the same row and fill the same cap. One bought boost on a knob at a time |
| Premium | Crowns | Crowns bought with gold | One for each account (section 2.9) |
| Gear sooner | Gold from Crowns buys pieces on the market | Drops, bosses, arenas, and hunted gold | The Level a piece needs. A hero wears only its own band |
| Upgrades sooner | Gold from Crowns pays the sinks and buys the materials | The same sinks with hunted gold | Each sink's ladder ends at its band's top rung |
| Clan rooms sooner | Gold from Crowns given to the castle | Hunted gold given | The standing caps |
| Comfort | Crowns: more market listings, more banked arena tickets | Crowns bought with gold | No power |
| Looks | Crowns: outfits, dye sets, a rename | Crowns bought with gold | No power |
| Training items | Crowns, and bound to the account | Gold, and tradeable | RULED 2026-11-14 |

**Never sold for Crowns.** Gear, upgrade materials, gold, Levels, skill levels, boss chests, arena rating, Luck, stamina or stamina refills, hero slots, any roll of any kind. RECOMMENDED, MM-29. Luck is RULED 2026-11-20 and stamina is RULED 2026-10-18. Crowns are never earned in play (RULED 2026-10-13). Everything bought with Crowns is account-bound and only Crowns themselves trade (RULED 2026-11-14).

**One conflict Tyler must see before he rules MM-29.** Two older lines say power is never sold for Crowns directly. On 11-04 the recorded advice was "no direct Crowns-for-power sale without his explicit word", and the 11-18 intent says power reaches a payer "only through player trade for gold". A timed boost on damage or Level XP sold for Crowns is a direct sale. The 11-21 ruling asks for real advantages under a ceiling and does not name boosts. So MM-29 needs Tyler's explicit yes on that one row, and the decision book does not flag it. My recommendation is to say yes. A boost that is also earned in play, sits under the same cap, and can be bought with gold through the book is the mildest direct sale there is, and it gives Crowns the weekly sink a traded currency needs. The alternative is to sell boosts for gold only, which keeps both older lines and leaves Premium as the only repeating use of a Crown.

**One overlap resolved.** Study 49 lists "more saved setups" and "more bag and storage" as Crowns comfort. Saved setups are free (GR-56a), because a remembered decision is never sold. Bag rungs and Storage chests are gold sinks (RULED 2026-10-22) and stay gold. Crowns comfort is market listings and banked tickets only.

**The buff caps the boosts live under.** RECOMMENDED, MM-24 and MM-25. Chapter 06 owns the table. It is repeated here because it is the ceiling of everything bought.

| Knob | Standing cap (clan rooms) | Timed cap (earned buffs and bought boosts together) |
|---|---|---|
| Damage dealt | +5% | +10% |
| Damage taken | 5% less | 5% less |
| Level XP | +5% | +25% |
| Drop chance | none | +10% |
| Coin from kills | none | none |
| Town work speed | +10% | none |

**The paid ceiling.** All TARGET. RECOMMENDED, MM-31 to MM-33.

| Ceiling | Number | How it is held | Status |
|---|---|---|---|
| Pace | A fully Crowns-boosted four gains **at most 60% more Levels an hour** than the same four in mid gear with no buffs, playing the same hours. COMPUTED: best gear 1.15 x timed damage 1.10 x timed Level XP 1.25 = 1.58 | The timed caps and the band's best gear | RECOMMENDED, MM-31. It re-opens 50-11 |
| Pace, against a non-payer who plays the shared world and holds earned buffs about half the time | About 35%. COMPUTED: 1.58 over (1.05 x 1.125) | The same caps. Playing closes the gap | RECOMMENDED, MM-31 |
| Pace, against a non-payer who reached the ceiling with gold | 0% | It is one ceiling | RECOMMENDED, MM-31 |
| Gear | **0 bands ahead** at any Level. Inside the band at most best gear over mid gear: about two weapon steps, 10 to 20% faster kills | A piece needs its band's Level. Best gear is about 15% faster and takes about 15% less damage than mid (RULED 2026-11-21) | RECOMMENDED, MM-32 |
| Gold | Paying **at most about doubles** an account's gold in a week. The weekly cap on Crowns sold is worth about one account-week of hunting gold | Clamps 1 and 2 below | RECOMMENDED, MM-33 |
| On the pace line | A band that takes a plain four 10 days takes the fully boosted payer a little over 6. Every Level and every band is still walked | Nothing sold grants a Level | COMPUTED: 10 over 1.58 |

**MM-31 against the ruling it replaces.** On 11-21 Tyler ruled 50-11: "no limit on how much sooner" bought gold reaches best gear, only a limit on what can be bought. MM-31 and MM-33 put numbers on how much. Until Tyler rules them, 50-11 stands. The two fit together better than they look. MM-29 is the "what" limit that 50-11 asked for, and the 60% is what the "what" limit adds up to. Only MM-33, the weekly gold cap, is a true limit on "how much sooner", and it is also the size of a clamp that 24-5 already ruled must exist.

**A rider on the gold ceiling.** RECOMMENDED inside MM-33, new in this chapter. The cap is counted in Crowns, and the Crown's gold price floats. On an aging server a Crown buys more gold every month, so a cap fixed in Crowns stops meaning "one week of gold". So the server re-derives the cap each week: `weekly cap in Crowns = one account-week of wage at the seller's highest hero Level / the 7 day median gold price of a Crown`. Then "about double" holds at Level 20 and Level 300, on day 10 and day 600.

**Where paying gives no edge.** RECOMMENDED, MM-37.

| Place | Edge from paying |
|---|---|
| The even arena | None. Nothing bought is read |
| Events | None. An event's buff reaches everyone and fills the same cap |
| Levels, grounds, drops, tiers | None are sold. A free player reaches every one |
| The open arena | Yes, inside the ceiling. Matching is by gear band |
| World bosses | Yes, inside the ceiling. The chest pays by your own points, so a payer takes nothing from anyone |
| Clans | A payer's gold raises rooms sooner, and every member who gives holds the buff, so a payer lifts the whole clan |

**The path for players who do not pay.** RECOMMENDED, MM-34. Everything sold for Crowns can be had with gold through the book. These are TARGET prices at the book's reference price. Players set the real price inside the price band, so each is a HYPOTHESIS until the book has run.

| What | TARGET cost |
|---|---|
| Premium for a month | About 3 account-days of gold, a tenth of the month |
| The full set of timed boosts kept up for a week, with no earned buffs at all | About 1.5 account-days. Each buff earned in play is that much saved |
| Best gear for a band from mid gear, bought and upgraded | 100 to 140% of the band's net gold for a hero (band E4) |
| A comfort unlock | Half an account-day to 2 account-days, once |

Boost rows in the store scale by the buyer's band, so the cost in hours of play stays about the same at Level 20 and Level 300.

**The Crowns book.** RECOMMENDED, MM-35. It builds 24-5 (RULED 2026-11-20: Crowns are a number on the account, never an item).

| Part | Design |
|---|---|
| What a Crown is | A number on the account, with its own append-only ledger and reason codes. Written only by the server, on the server clock |
| Where Crowns come from | The payment provider's signed message. Nothing in play |
| The book | One server-owned book, Crowns only, in fixed lots. The seller's Crowns are held by the server. The buyer pays gold |
| The cut | 1% to list and 4% of the gold, both burned, as on the market. So every Crown sold for gold is also a gold sink |

**The eight clamps.** RECOMMENDED, MM-36. Five are RULED in outline (24-5, 2026-11-20). Three are added. All eight are inside the one Security review before Early Access.

| # | Clamp | Rule |
|---|---|---|
| 1 | A weekly cap | Crowns sold and Crowns bought a week for each account. Sized so a week's sales are worth about one account-week of hunting gold (MM-33, with the rider above) |
| 2 | A price band | A lot's gold price sits between half and twice the 7 day median of real sales. Before a median exists, a band from a row. Without it one Crown sold for 50M is a gold transfer between two accounts |
| 3 | One trade | A Crown bought with gold is bound. It can be spent and never listed again. No speculation and no wash loop |
| 4 | A hold | Crowns bought with money cannot be listed for a set number of days, by the payment provider's chargeback window. An account in arrears is shut out of the book |
| 5 | Who | A Level door on the book, the same-network guard, and the market's daily spend and proceeds caps |
| 6 | Boosts | A server catalog of boosts with server prices and a server clock. One bought boost on a knob at a time. The cap is applied by the server in the one modifier table |
| 7 | The store | The store has no row for gear, materials, gold, Levels or rating, and a test proves it |
| 8 | The journal | Every Crown bought, listed, sold, bound and spent is a journal row |

**Why this shape.** Study 49 section 3.1 read ten games with a bought currency that players trade for gold. The accepted form is the same in all of them: money becomes gold only through another player, at a price players set, and the bought thing trades once. Every one of them limits it by a count, a rising price, a fee or a trade lock. Players accept buying time, membership, capped boosts and looks. They revolt when the store mints power, or the item that makes power, straight into the economy. A bought currency also needs a repeating sink or its buyers run out, which is what Premium each month and boosts each week are.

**Test Crowns in the playtest. THIS IS A GRANT.** MM-43. To test the loop before money exists, every playtest account would get the same weekly allowance of test Crowns through one server switch. It is equal for all and wiped. It is still a grant, and the rules are that Crowns are never earned in play and player state is never fabricated. It needs Tyler's explicit yes. Nothing in this chapter assumes it.

### 2.9 Premium

| Rule | Status |
|---|---|
| One Premium for each account. It covers all four heroes | RULED 2026-11-21 and 2026-11-20 (24-3) |
| Premium is a server column, never held by the client | RULED 2026-10-17 |
| Bought with Crowns. So it can be bought with money, or with gold through the Crowns book | RULED 2026-10-14 |
| Premium never adds power | RULED 2026-11-20 (24-4) |
| Every character is Premium during the closed beta through one server switch, off at the Early Access wipe | RULED 2026-10-23 |

**What it gives.**

| Perk | Across four heroes | Status |
|---|---|---|
| A 12 hour stamina bar | On every hero. The free bar is 8 hours | RULED 2026-11-20 (24-4) |
| The full hunt analyzer | For the account | RULED 2026-11-20 (24-4) |
| Premium looks and one free color change a day | For the account | RULED 2026-11-20 (24-4) |
| A daily 1 hour training item, the player picking Melee, Ranged, Magic or Defense | One for each hero each day | RULED 2026-11-20 (24-4, amendment declined, the item stays). "For each hero" is RECOMMENDED and is part of the open money call |
| The daily claim | Granted to every hero on the first visit of the day, with no press | RECOMMENDED, GR-84 |
| 100 market listings and 14 day listings | For the account | RULED 2026-11-20 (24-4) |
| Timed buffs last a quarter longer, and arena tickets bank to 30 | For the account | RECOMMENDED, MM-21 |

**What is never Premium.** The risk reading. Every player sees, free, how close a hunt came to a death and the deaths per 100 hours of that ground and tier. Selling the warning would read as selling safety. RECOMMENDED, GR-66. The deeper per-rule bar report may sit in the Premium analyzer.

**What the 12 hour bar is really worth.** Stamina refills one for one while a hero is not hunting, and two visits a day is the free game (RULED 2026-11-21). A player who visits twice a day gets 12 hunted hours on the free 8 hour bar. The 12 hour bar gives the same 12 hours to the player who visits once. So Premium sells one saved visit a day, plus information, looks, a gift and room. It is comfort, clearly nice, and weak on purpose.

**Who buys it.** Mostly players with idle gold, through the Crowns book. That trade, a saver's gold for a payer's Crowns, is the one the whole money model rests on. So Premium does not need to be strong. It needs to cost a saver nothing it misses, which is why it is one for each account and about three account-days of gold a month.

**The price.** OPEN. It is Tyler's money call.

### 2.10 The early economy for an account of four heroes

This section is new design. No source covered it. RECOMMENDED, GR-8, and its first-week numbers are OPEN (section 5).

**What changes with four heroes from day 1.**

| Fact | Consequence for the design |
|---|---|
| Gold in is four heroes' coin from the first hunt | Early prices for account goods are read in account-hours, not hero-hours (section 2.3) |
| Rested hours are 48 a day from the first day | Town work makes a real share of an account's own staples at once. The store bill is lower than one hero's would be, and the yard has 48 hours a day to sell |
| One purse, four heroes | "Which hero gets it" is the first economic decision, at hour 1 |
| No slot to save for | The first large goals must be something else (section 2.6) |

**The first week, in the order a player meets each spend.**

| When | What gold is for | Kind | Size. TARGET, by the bands of section 2.3 |
|---|---|---|---|
| Minute 5 | Store supplies, charged as used | Repeating | Normal under 15% of coin |
| Hour 1 | Bag rungs for four heroes. The first Storage chest | Room | Each a small buy, under 1 account-day |
| Hour 1 | The yard, in rested hours | Repeating | `100 x skill level` an hour for each hero. Near zero at first |
| Day 1 | The market. A first standing order, a first loot rule | Trade | The 5% only |
| Days 1 to 3 | The first Tempering rungs and the first Hallmark, from about Level 15 | Standing | The band's set is 1.2 to 1.4 of the band's gold, across four heroes |
| Days 2 to 5 | The first House deed and the first bench room | Long goal | The first deed is a band goal, 3 to 10 account-days |
| Week 1 | Blessings, once a hero hunts a tier that can kill it | Repeating | A share of the hours a death costs |
| Weeks 1 to 2 | Linings and the first curing slot | Repeating | A share of band gold a week |
| Week 2 on | Premium through the Crowns book | Monthly | About 3 account-days |
| Week 2 on | The House dummy's first rung | Long goal | 25 to 50 hours of the yard fee it ends |

**The shape this is meant to have.** A new account is never broke, because Normal costs almost nothing at the store and the yard starts near zero. A new account is never done either, because by the first gear band four heroes are asking one purse for more than it holds. The first week teaches the two habits the whole economy runs on: spend on the hero that matters most, and set a rule once.

**A reading to size against, not a target.** SIMULATOR, harness cells for a mid-geared four at 12 hours with full store prices (43 section 7): about 220,000 gold in an account-day at Level 10 and about 280,000 at Level 50. The harness reads a party's store bill at 1.7 to 2.2 times real, so its net gold is direction only. COMPUTED against that reading: four heroes training every rested hour at skill 10 pay 48,000 a day, about a fifth of gold in. At skill 45 they pay 216,000, most of a day's gold. So by mid game an account trains some hours and works the rest, which is the choice the fee is meant to create.

### 2.11 Inflation over a long-lived server

**The problem by design.** Gold comes in by the hour for ever. A server stays healthy only if gold leaves at nearly the same rate, and if the things gold buys keep their worth.

**The targets.**

| Band | Target | Label |
|---|---|---|
| G-11 | Gold destroyed over gold created, server-wide, a day: 0.85 to 1.00 from the second month. Red under 0.7 for a week | TARGET. RECOMMENDED |
| G-9 | Repeating sinks over gold in, a day: 35 to 50% from Level 30 | TARGET. RECOMMENDED |
| X14 | Gold held by an account at day 30, 90 and 180 stays under 20 days of its own income | TARGET. RECOMMENDED |
| X14 | A tier's gear floor on the market stays over its Shop price at 10, 1,000 and 10,000 players | TARGET. RECOMMENDED |

**The five things that hold it.**

1. **Prices follow the wage, not the calendar.** Every repeating price is hours of `wage(L)`, and every standing sink is a share of band gold. A hero at Level 300 pays Level 300 prices. No sink is ever "finished" because no ladder ends. RECOMMENDED, GR-51 and GR-8.
2. **One sink has no end at all.** The yard, because combat skills have no cap. RULED fee, 2026-11-20.
3. **Power that wears off.** Linings last 12 hunted hours. Boosts last a day or a week. Blessings are spent by a death. These take gold every week from every band.
4. **Trade burns gold.** 5% of every market sale and of every Crown sold for gold. The busier the server, the larger the sink.
5. **Shared works take surplus.** The town's monthly project sized to the server (RULED 2026-11-20, 24-10) and the clan castle sized by member count (MM-9). Both scale with population by construction.

**No coin buff, ever.** RECOMMENDED, MM-25. A buff that mints gold for the buffed raises prices for everyone else, and it would let money mint gold.

**The gauge.** RECOMMENDED, GR-59a. One daily line printed from the journal: gold created, destroyed and held, by source and by sink, by day and by account age. Nobody can steer what nobody reads. The Crown's gold price is on the same page, because every player will watch it.

**What a floating Crown price does, and why that is acceptable.** Gold prices set by players (market goods and the Crown) drift with the amount of gold on the server. Prices set by formula do not. On an old server a Crown buys more gold than on a new one. That would let a payer's edge grow with server age if anything were priced in fixed gold. Nothing that carries power is. Sinks are shares of band gold, and the weekly cap is re-derived from the Crown's own price (the rider in 2.8). So a Crown buys the same number of hours of play in month 1 and month 20.

**Newcomers on an old server.** Inflation hurts a newcomer only if veterans need nothing a newcomer makes. The design gives veterans reasons to buy from low bands: linings need one monster part from the ground that drops it, old grounds can be hunted at your own Level and still drop their parts (GR-9), and salts and staples are wanted at every tier. A rich server then pays its newcomers.

**The self-raising sink, built later.** One scarce, visible, shared thing whose price is a bid of burned gold, such as castle tenure for a month. A bid is the only price that rises by itself as a server gets richer. It needs hundreds of players. It stays in the plan, hidden until the population exists (RULED 2026-11-21: nothing planned is cut). OPEN until the castle is ruled (MM-9).

**At 10 players and at 10,000.** At 10 there is no market depth, so the Shop is floor and ceiling, and standing orders are the only trade that works between two players who are never on together. At 10,000 there are several hundred thin books carried by the suggested price, the daily caps bind real traders, and the Crowns book's 5% becomes the largest trade sink. HYPOTHESIS at both sizes until the gauge reads a live server.

### 2.12 Server cost of this chapter

PENDING study 48 (`48-platform-cost.md` has not landed on the set).

| What is known | Label |
|---|---|
| A player may cost at most $0.15 an account a month at 1,000 accounts, and no more at 10,000 | RULED 2026-11-21 |
| That is about 60 database-seconds an account-day at 1,000 accounts and 24 at 10,000 | COMPUTED in study 50 from assumed list prices. Best case |
| No economy feature adds a statement to the hunt's settle, runs a poll, or grows with players times players | Band C6. RECOMMENDED |
| A market fill is one batched call at loot dispatch or at a refill. An account that never trades costs nothing | RECOMMENDED, GR-50 |
| The Crowns book is one wallet row, one ledger row a movement, and one more book | ESTIMATED close to nothing (study 24) |
| Bought boosts are read with a hero's other modifiers at the settle, so they add no statement | ESTIMATED (study 49) |
| Town work in closed form, which is what makes 48 rested hours a day affordable | RECOMMENDED, GR-1 (chapter 07) |

What 48 must add for this chapter: the measured cost of order matching, of the gauge's daily roll-up, and of the journal rows that four heroes spending by the use write at 12 hours a day.

---

## 3. How it connects

| Chapter | This chapter reads from it | This chapter feeds it |
|---|---|---|
| 00, the game and index | The frame: four heroes, 12 hours, three gear states, formula layer | The money model in one paragraph |
| 01, core and combat | Monster health and the reference kill rate (the wage). Hero health (heal size). The 2 second shared food cooldown, which is why heal price is a tax on speed. Rune tiers | The store bill bands for each tier. `storeSupplyShare`. The hunt budget as an end reason |
| 02, world | Grounds, bands and tiers. Scaled hunts at your own Level (GR-9) | The scaled hour's price. Demand for old grounds' parts |
| 03, items and crafting | What Tempering, Hallmarks, linings, salvage, Luck and commissions do. Reference values of items. Food and rune rows | What each costs (`sinkShare`). The Shop's sale formula. The market those goods trade on. Crafters' customers |
| 05, progression | The Level law (the length of a band). The death cost and the Blessing ladder (GR-7). The yard's rate and the skill curve | Blessing, refill and yard prices. The paid pace ceiling, which moves the days of the Level law for a boosted four |
| 06, the MMO layer | The modifier table and the buff caps (MM-24, MM-25). Boss and arena gear and materials. The clan castle | Bought boosts as rows in that table. Gold for castle gifts. Buyers for boss and arena gear. The Crowns engine as the demand side |
| 07, home, features and platform | The House, its rooms, curing slots and the dummy. The Great Hearth. Closed-form town work. Server cost (study 48) | Prices of rooms and rungs by band G-8. The gauge. The journal load |

---

## 4. Open calls in this chapter

In decision-book order. Each line is the recommendation.

**Decide first**

| Id | The call | Recommendation |
|---|---|---|
| GR-85 | Formula clean-up steps that move no number | Approve. For this chapter it is the four coin dials folded into one coin line (R9) |
| GR-1 | How the server reaches its budget | Town work in closed form now. The away hunt's save waits for study 48 |
| GR-8 | Sinks that follow the gear, and the hole the slots left | Tempering, Hallmarks and linings cost 1.2 to 1.4 of a band's gold, sized on a hero who pays the difference, read on an account of four. The yard fee and linings come forward as the first repeating sinks. It re-opens 11-18 |
| MM-24 | How rewards are sized | Every buff and bought boost is a row in one modifier table |
| MM-25 | The buff caps | As in section 2.8. No coin buff, ever |
| MM-28 | The paid advantage | Paying gives a real edge under a written ceiling |
| MM-29 | What the store sells for Crowns | Premium, timed boosts, comfort, looks, bound training items. Never gear, materials, gold, Levels, skill levels, chests or rating. Needs an explicit yes on boosts, which are a direct sale of timed power (section 2.8) |
| MM-30 | Bought boosts and earned buffs | The same rows, the same caps, one bought boost on a knob at a time |
| MM-31 | The pace ceiling | At most 60% more Levels an hour. It re-opens 50-11 |
| MM-32 | The gear ceiling | 0 bands ahead. Inside a band, at most best gear over mid gear |
| MM-33 | The gold ceiling | At most about double a week, with the cap re-derived weekly from the Crown's price |
| MM-34 | The path for players who do not pay | Everything sold for Crowns can be had with gold. Premium about 3 account-days a month. A week of boosts about 1.5 |
| MM-35 | How Crowns trade | A number on the account, on a server-owned book. One trade, then bound. 5% burned |
| MM-36 | The clamps | Eight, all in the Security review before Early Access |
| MM-37 | Where paying gives no edge | The even arena, events, and access to every Level, ground, drop and tier |

**Needs Tyler's eye**

| Id | The call | Recommendation |
|---|---|---|
| GR-44 | Commissions | Single jobs ship with jewelry tiers 5 to 7. Bulk orders wait for the idle market |
| GR-50 | The market | Runs itself: standing orders, the Sell rule routes to them, the refill buys player stock. Order book and rare pieces first |
| GR-51 | Prices | Every repeating price is hours of one wage curve the server computes, read on a hero of a mid-geared four. The House stays typed |
| GR-54 | The yard's rate | Follows the skill curve, never past half of hunting, and the fee follows the rate. It re-opens 11-14 and two rulings of 11-20 |
| GR-55 | When the market opens | Day one. It re-opens 24-7 |
| GR-56a | Setup slots | Free. It re-opens 11-05 |
| GR-66 | The risk reading | Free for everyone, never Premium |
| MM-21 | Premium and the shared world | Everything is open to all. Premium makes timed buffs last a quarter longer and banks arena tickets to 30 |
| MM-22 | Where the slot gold goes | The six homes of section 2.6, in that order |
| MM-27 | Boss and arena gear trades | Yes, like all gear |
| MM-43 | Test Crowns in the playtest | A GRANT. Tyler's explicit yes only. Recommended yes, for the wiped playtest only, because the loop cannot be tested without it |

**Safe to accept**

| Id | The call | Recommendation |
|---|---|---|
| GR-46 | Salvage and the Shop | Salvage is a choice beside Sell with both numbers shown and a starting plan. The Shop keeps its ruled price |
| GR-52 | The store's healing | One gold-a-hit-point line topping near 0.60, and heal size as a share of reference health |
| GR-53 | The House dummy | It ends the yard fee. Rungs by skill band at 25 to 50 hours of the fee |
| GR-56b | The bench tax | It stays and moves onto the wage curve |
| GR-57 | Spending while you sleep | A hunt budget, remembered for each ground and tier |
| GR-58 | The refill price | Set after the store bill is measured right |
| GR-59a | The gauge | A daily line of gold made, destroyed and held |
| GR-59b | One laundering route | Remove the per-unit minimum on the stackable price ceiling |
| GR-84 | Small presses | The Premium claim needs no press |
| GR-87 | Drops and sales | Drops in hours, and one sale formula for every tier |

**Superseded.** GR-60 ("Crowns come after the market") is replaced by MM-28 to MM-37.

---

## 5. Still missing

Decisions or designs nobody has made yet in this area.

| # | What is missing | Who answers | Note |
|---|---|---|---|
| 1 | **The first week's numbers.** Section 2.10 gives the order and the size bands. No hour value is set for any early price | The game designer, then Tyler | Decision book, "what the first week's gold is spent on". Needs the wage formula (R15) to exist first |
| 2 | **Early prices re-read for four heroes.** The first deed, bag rungs, Blessings under Level 30 and the first Tempering rungs, each as hours on the two-row rule of section 2.3 | The game designer | Decision book, "early prices sized for an account of four" |
| 3 | **The Premium price, and the daily item across four heroes** | Tyler. A money call | Decision book |
| 4 | **The real-money price of a Crown, lot sizes, and the Crown price of each store row** | Tyler. A money call | Not in any source |
| 5 | **The boost catalog.** The rows, their sizes inside each timed cap, and how a 1 day and a 7 day boost combine with an earned buff that is already filling the cap | The game designer, with chapter 06 | Study 49 names the knobs and the caps, not the rows |
| 6 | **A price line for store runes and ammunition.** A party's store bill is runes and arrows, and no formula step owns their price. R14 covers healing only | The game designer, inside GR-52, GR-51 and GR-50, with the instrument's rune rule (fault F5) | Decision book, "which rune tier the simulated kit buys" |
| 7 | **The base hours of a stamina refill** | GR-58, after fault F5 closes | |
| 8 | **The Blessing share, and the ladder past the third Blessing** | GR-7, chapter 05 | |
| 9 | **The wage for a four of mixed Levels.** Section 2.3 reads each hero's own Level for hero prices and the highest for account prices. The group share inside the wage for a mixed four follows the two thirds line (MM-19) and is not written | The game designer, after MM-19 | |
| 10 | **The castle's cost.** Its rooms, stages and gift sizes are being revised, so the largest new home for gold has no number | Study 49 revised, then Tyler (MM-9) | |
| 11 | **Whether the Level law is the clock of a plain four or a buffed one.** A payer at the ceiling levels 60% faster, and a fully buffed four 72% faster, so content computed to last 120 days on the table ends sooner for them | The game designer, with GR-6, MM-26 and MM-31 | Decision book |
| 12 | **Security questions on the Crowns book.** Whether gold paid for Crowns counts against the market's daily caps (it should). What a refund does to Premium time already used. The number of hold days. Steam's wallet rules for a currency players trade | The security engineer, then Tyler | Study 24 Q8 |
| 13 | **The daily caps against dear items.** A piece priced over the daily spend cap can never be bought. Either the caps rise with the buyer's Level or no ceiling may pass the cap | The security engineer | Study 24 Q9 |
| 14 | **The server gold model.** Gold created, destroyed and held a day by server age and population, as a tool. Bands G-11 and X14 have no reader without it | The balance tools lane | Study 50 X14 |
| 15 | **The player-facing name of the Crowns book** | The game designer | A genre-standard label, by the 11-14 rule |
| 16 | **Server cost of the market, the gauge and per-use spending for four heroes** | Study 48 | PENDING |
| 17 | **A ceiling on gold find.** The stat adds with no cap in its formula. It is safe only while sources are few | The game designer, with chapter 03 | Study 43, a HYPOTHESIS |
| 18 | **The dates for the beta and Early Access**, which set when the Security review of every surface here must be done | Tyler, after the build plan | Decision book |

---

## 6. How we will know it works

**The matrix.** Every change in this chapter is proven on the balance matrix as one of three kinds (study 60 section 7.1).

| Step | Kind | What must be true |
|---|---|---|
| R9, one coin line | Identity in total | Coin a hero-hour is the same on every ground. G-1 and G-4 hold. No XP band moves |
| R14, heal price and size | Coefficient | Only G-2, G-4 and G-5 move. No pace band moves. Already MEASURED once for the price half: 0 unintended |
| R15, the wage curve | Derivation | The typed price lines are deleted and G-8, G-9 and S10 stay in tolerance. The wage formula reads within 10% of played net gold |
| R16, sinks as band gold | Derivation | G-10, E3 and E4 hold on every band, with no typed ladder left |
| R17 and R18, the sale formula and drops in hours | Derivation | G-1, D1, D2, E2 and E5 hold. The market floor and bench tax are unchanged at tiers 1 to 7 |

**The bands.** Read on the four, a hero-hour at a time. With no party-size targets (RULED 2026-11-21), a lone row may be printed and is never judged.

| Band | Target |
|---|---|
| G-1 | Net gold on Normal never falls from one checkpoint to the next |
| G-2 | Store bill over coin: Normal under 15%, Dangerous 25 to 40%, Deadly 45 to 65% |
| G-3 | Low gear nets 0.6 to 0.85 of mid on Normal, never under zero |
| G-4 | The four on Deadly, mid gear: 3,000 to 8,000 a hero-hour at Levels 50 to 110 |
| G-5 | Low gear on Deadly nets under zero |
| G-6 | Best gear on Deadly nets at least what mid nets on Dangerous |
| G-8 | Every price in days of the buyer's own gold, by the sizes of section 2.3 |
| G-9 | Repeating sinks 35 to 50% of gold in from Level 30 |
| G-10, E4 | A band's standing prices are 1.2 to 1.4 of the band's net gold |
| G-11 | Server-wide gold destroyed over created: 0.85 to 1.00 from the second month |
| G-12 | Gold bought with Crowns makes a thing sooner, never makes it possible (RULED 2026-11-18) |
| E8 | No gold-for-power offer cheaper than Tempering's cheapest rung |
| X14 | Gold held stays under 20 days of income at day 30, 90 and 180 |

**The instrument is not yet true for gold.** SIMULATOR, study 51: the matrix reads a party's store bill at 1.7 to 2.2 times real because its kit buys the Level's own rune tier (fault F5). Every band stays in report mode. A four's pace can carry a decision. A four's gold and survival are direction only. No party gold number should set a price until F5 closes, which is why GR-58 holds the refill.

**Checks before any build** (study 49 section 7.1).

| Check | Read | Decides |
|---|---|---|
| G, the power budget | A mid-geared four with no buffs against a best-geared four with every cap full, at Levels 20, 60 and 110. TARGET: kill speed within 1.25 to 1.40, Level pace within 1.6 to 1.8, and no cell where the buffed four holds a tier the plain four cannot enter | MM-25, MM-26, MM-31 |
| H, is a 60% edge felt and is it resented | The two heaviest testers, shown the ceiling table. Their own words | Direction only for MM-31 |
| The store test | A test proves the Crowns store has no row for gear, materials, gold, Levels or rating | Clamp 7 |

**Playtests. Only real players can settle these.**

| Question | Playtest | Read |
|---|---|---|
| Do standing orders fill when nobody visits a market? | 30 or more accounts for two weeks with the gauge on | Orders posted and filled a day. Share of refills that bought player stock |
| Do players with idle gold pay the yard? | The same playtest | Rested hours trained against worked, by purse size |
| Is a hunt budget set and understood? | Five recorded first sessions on a hard tier | Did the player set it. Did anyone wake to an empty purse |
| Do players pick Luck over gold when both numbers show? | The loot plan's own counts after salvage ships | By item kind |
| Does Deadly at the new heal line feel like a struggle or a tax? | The beta, hard-tier hunters | Their words. Share of hunted hours by tier |
| Does the Crowns loop turn? Needs MM-43 | 20 to 30 strangers, 14 days, equal test Crowns | Accounts that sell Crowns for gold and accounts that buy them: each over a fifth. A bad sign is no buyers |
| Does the Crown's price hold inside its band? | The same | Inside half to twice the reference. A bad sign is a price pinned at an edge |
| Does the ceiling leak? | The same | Level pace of the top tenth of accounts over the median at the same hours: under 1.6. Over 1.7 means a cap is leaking and the book does not open |
| Are buffs earned as well as bought? | The same | Share of the timed cap filled by earned buffs and by bought boosts: both above a quarter |
| Is it worth it, and is it fair? | Five players asked | Most say worth it and most say fair. A bad sign is "not worth it" or "pay to win" from most |
| Is the server's gold healthy? | The gauge, live, from the second month | G-11 and X14 |

**How much a playtest can show.** With 30 accounts a measured share of 50% could really be anywhere from about 32% to 68%. So these reads are behaviors and counts with targets set in advance, never fine comparisons.

**What would change the design.** If the top accounts' pace runs past the ceiling, the Crowns book stays shut until check G is green. If nobody with gold buys Crowns, the store is missing something players want and the boost and Premium lists are re-cut. If orders do not fill, the market stays on rare pieces and the refill never sources from players.

---

## 7. Superseded

What this chapter dropped from its sources, and why.

| Dropped | From | Why |
|---|---|---|
| Hero slot prices as a sink, "do not raise slots again", and every week count built on saving for a slot | 55, 24, 43, 44 section 5.3 | RULED 2026-11-21: all four heroes from the start |
| "Lone hunts out-earn parties in gold. Keep it as a real choice between gold and XP" | 55 row 43, 43 finding 4 | RULED 2026-11-21: the four together earn more XP and gold a head than the same four split up, with no party-size targets |
| The wage defined on a lone mid hero on Normal | 44 section 5.3, 55 section 4.2 | The frame is the own four, lone targets are gone, and study 51 cannot calibrate a lone seat. The wage is read on a hero of a mid-geared four |
| The wage read from the matrix | 55 phase A | 44 beat it: no simulator in the path of a server price. The server computes the wage and the matrix checks it |
| Salvage by default with a token Shop price | 55 phase A, 46 | MEASURED worse on 40 gold bands. 47 C3: it breaks three rulings. Salvage is a choice |
| The heal table as "the cause of the Deadly bills" | 55 phase A | MEASURED: it is a lone hero's bill only. A party's bill is runes and ammunition |
| The House dummy halves the yard fee | 55, 58 | The cold audit (61) and 60: the fault is a price that does not grow with skill. Rungs by skill band keep both rulings |
| Remove the bench tax | 55 | The cold audit (61): it is a ruling, and the first rung of every House room stands on it |
| The market shut until a town goal is met | 24-7 | RECOMMENDED open on day one (GR-55). 24-7 stands until Tyler rules GR-55 |
| "Refocus the market on rare pieces and stop designing for bars and fish" | 46 | Kept as the order of work (rare pieces first), not as the whole design. Supplies trade through the refill with no window |
| "Crowns come after the market has something scarce to price" | GR-60, 55 row 3, 24 crowns card | Superseded by MM-28 to MM-37. Crowns buy Premium and boosts and trade on their own book |
| Crowns never buy a boost of any kind. Crowns buy only Premium, looks, bound training items and a rename | 24 Q8 | MM-29 adds timed boosts and comfort, under the 11-21 ruling. Flagged in 2.8 as needing an explicit yes |
| Five clamps | 24-5 | MM-36 keeps the five and adds three: the boost catalog, no power rows in the store, the journal |
| The weekly Crowns cap sized to "about one Premium month and a few looks" | 24 Q8 | MM-33 sizes it to one account-week of gold, which is what makes the gold ceiling a number |
| "At most 2 times faster to best gear" | 50 call 11 as first written | Tyler ruled the alternative. MM-31 to MM-33 are the new proposal |
| Premium for each hero | Ruling of 10-17 | RULED 2026-11-21 and 24-3: one for each account |
| "More saved setups" and "more bag and storage" as Crowns comfort | 49 section 5.9 | A remembered decision is never sold (GR-56a), and room is a gold sink (RULED 2026-10-22) |
| MMO rewards as honors only, with nothing for Premium and no hero power from clans | 49 first issue | RULED 2026-11-21: rewards are buffs and gear |
| Every number that compared a proposal with the live game, and every week count at 3.3 hunted hours a day | 24, 43, 55 | RULED 2026-11-21: the current game is irrelevant, and every player hunts 12 hours a day |
| Gold bands judged on a lone mid hero | 50 G-1, G-10, E4 as written | No party-size targets. The bands keep their numbers and are read on a hero of the four |

---

## 8. Source map

The documents and sections this chapter replaces.

| Source | Sections | Used for |
|---|---|---|
| `55-review-economy.md` | All, with phase B (section 10) over phase A | The market, the wage curve, the heal line, the sinks, the gauge, the hunt budget, the three matrix runs |
| `43-formulas-economy.md` | Summary, 1.3, 1.5, 1.6, 5, 7 | The coin, sale, sink and price formulas. Where each misbehaves by Level |
| `24-economy.md` | Q4, Q7, Q8, Q9 and the cards. Its 12 ruled calls (24-1 to 24-12) | Refills, Premium's list, the five clamps, market limits |
| `49-mmo-layer.md` | 3.1, 5.8, 5.9, 6.2 (MM-24 to MM-43), 7 | The Crowns engine, the paid ceiling, the buff caps, the playtests |
| `44-formula-architecture.md` | 5.3, 5.5, 6.3, steps R9 and R14 to R18, calls 4, 14, 15, 17, 18 | The formula ids, the knobs, which bands judge each step |
| `47-itemization-fit.md` | C2, C3, C17, M9 | Tempering pays the difference, salvage as a choice, commissions, one book a piece |
| `60-game-review.md` | 1.4, 2.6, 7, 8.5, 8.13, 10 | The verdicts, GR-50 to GR-60, GR-8, the MM calls, the missing decisions |
| `62-decision-book.md` and `.json` | All | Call ids, order, what is ruled |
| `61-review-audit.md` | G-53, G-56 | The dummy and the bench tax |
| `50-standards.md` | 2.4, 2.5, 2.8, 9 to 11 | The gold, gear and cost bands. The 17 standards rulings |
| `51-baseline.md` | 2.1, fault F5 | How far a gold number can be trusted |
| `docs/design/itemization-plan.md` | Section 10, and the commissions part of section 4 | Sinks above a band on purpose, what trades, reference values |
| Rulings of record | CROWNS MUST GIVE REAL ADVANTAGES (11-21), MMO REWARDS ARE BUFFS AND GEAR (11-21), ALL FOUR HEROES, ONE PREMIUM (11-21), THE FOUR TOGETHER (11-21), SERVER BUDGET 15 CENTS (11-21), STANDARDS CALLS (11-21), MONETIZATION INTENT (11-18), and the dated economy rulings named in the text | Every RULED mark |
| `48-platform-cost.md` | Not landed | Section 2.12 is PENDING |
