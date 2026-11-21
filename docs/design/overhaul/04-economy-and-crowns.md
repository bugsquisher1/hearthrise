# 04. The economy and Crowns

Chapter 04 of "Hearthrise: the game we are building". Game designer, 2026-11-21, on `lane/d-book-economy`. Design only. No game code, data or migration is touched.

**How to read the status marks.** Every design statement carries one of three marks.

- **RULED** with a date or a call id. Tyler has decided it.
- **DECIDED** with the call id and "Fable 2026-11-21". The game designer decided the call and an adversarial check corrected it. Its row is in `decisions/all.json`.
- **DECIDED (reversal, Tyler may veto)** changes one of Tyler's rulings. The first tag in the chapter names the ruling. It stands unless he vetoes it.
- **TYLER CONFIRMS** is a money call or a grant, with the one recommendation.
- **CUT (Tyler approves)** is a removal that waits for his yes.
- **OPEN** with what decides it. Nobody has a recommendation yet, or the recommendation waits on a measurement.

**How to read the number labels.** TARGET is a number the design aims at. COMPUTED is arithmetic on a formula or on stated inputs, with the method beside it. MEASURED is a matrix run of a proposed change, and it is evidence about that proposal only. SIMULATOR marks a reading whose only use is to say how far the measuring tool can be trusted.

**The frame every number sits in.** An account runs four heroes from its first day (RULED 2026-11-21). Each hero hunts 12 hours a day and works in town for the other 12 (RULED 2026-11-21). Numbers are read at low, mid and best gear from Level 1 to 400 (RULED 2026-11-21). The four hunting together earn more XP and more gold a head than the same four split up, and no band or target is built around party size (RULED 2026-11-21).

---

**The status words, re-issued 2026-11-21.** Tyler adopted the critical review (`review/00-critical-review.md`), and the book now uses three honest words. They replace the list above. **DECIDED** means evidence and rulings support it. Where Tyler also said yes on the page, the tag says so. **PROVISIONAL** means a reasonable plan that has not been tested, and the first tag in a chapter names what it waits on. **OPEN** means it waits on Tyler. **RULED** is kept only for what Tyler ruled knowing what it was: his typed words, his own executive decisions, and a pick where he wrote a note, and his answers at the sitting of 2026-11-21, where he saw every option's cost. A quick pick on the page is a real yes and reads "Tyler said yes on the page", never RULED. **PROPOSAL** marks a design made in the fold of 2026-11-21 that Tyler has not seen. CUT and KEPT record his picks on the cut list. The record is `decisions/all.json` and `00-the-game.md`.

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
| Gold is the only soft currency. No system gets a second one | PROVISIONAL, GR-51, waits on the store-bill fault fixed and a wage formula that exists (55 row 1). The single purse is RULED 2026-10-23 |
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
| Coin is paid by monster health removed, on one line that is a function of monster Level only. There are no per-ground coin dials | `coinPerKill` 0.30 gold a health point as the base of the line. TARGET | DECIDED, GR-51 and GR-85, Tyler said yes on the page 2026-11-21, with GR-51 PROVISIONAL (44 call 4, R9) |
| A new ground never pays a hero on Normal less than the ground before it | Band G-1: net gold never falls from one checkpoint to the next | RULED 2026-11-20 (24-2) |
| Tiers move XP and difficulty. They never move coin | Dangerous and Deadly pay the same coin a kill as Normal | RULED 2026-11-07 |
| No buff ever raises coin from kills | The coin row of the buff caps is "none" | PROVISIONAL, MM-25, waits on one buff played in a cell |
| The four together earn more gold a head than the same four split up | No target or band. The party table and party buffs carry it | RULED 2026-11-21 |
| Coin is split evenly across the party with a moving remainder | | Built rule carried. DECIDED to keep, GR-85, Tyler said yes on the page 2026-11-21 |

**Why coin follows health.** Kill speed is income, so every combat upgrade is also a gold upgrade, and one number (`coinPerKill`) moves all gold in at once. MEASURED on the matrix for this proposal: moving `coinPerKill` moved gold bands and no combat, pace or survival band, which is what a clean coefficient should do (55 run 3).

**Loot sold.**

| Rule | Status |
|---|---|
| The Shop buys anything, without limit, at one sale formula: `bid = book value x saleShare(tier) x raw rate`. It works at tier 8 and past. Knob `saleStep`, step R17 | DECIDED, GR-87, Fable 2026-11-21 |
| Gear sells to the Shop for about a quarter of a tier's coin | RULED 2026-11-20 (23-10) |
| The Shop's bid is the floor under every market price | PROVISIONAL, GR-50 |
| Salvage is a choice on the loot plan beside Sell, with both numbers shown and a starting plan so no new player meets a wall of dropdowns. Salvage pays Luck materials, which are account-bound | RULED 2026-11-20 (Luck v3.1). The starting plan is DECIDED, GR-46, Fable 2026-11-21 |
| Drops are written in hours, and the chance is derived from the ground's kill rate. Knob `bandHours`, step R18 | DECIDED, GR-87, Fable 2026-11-21 |

MEASURED on the matrix for the rejected alternative (salvage by default, modeled as 15% less gold in): 40 gold band rows got worse and none got better. That is why salvage stays a choice.

**Smaller sources.** Tamsin's tasks pay small gold on purpose and are a new account's first goal. Crafted goods sell at the Shop floor or to players. Both PROVISIONAL to keep, GR-51 (55 rows 9 and 7).

**What never makes gold.** Crowns, the store, buffs, events, world bosses and arenas mint no gold (PROVISIONAL, MM-25 and MM-29). Money moves gold between players. It never creates it.

### 2.3 The wage curve, and prices measured in hours

Formula step R15, knob `wageShare`. PROVISIONAL, GR-51.

**The wage.** `wage(L)` is the gold one hero nets in one hunted hour at Level L. The server computes it. No simulator sits in the path of a price.

`wage(L) = coinPerHp(L) x reference monster health(L) x killRateRef(L) x group share x (1 - supply share)`

It uses the same reference kill rate the kill reward uses (knob `killRateRef`, step R12). The balance matrix checks the formula against played net gold within 10%.

**The seat the wage is read on.** PROVISIONAL, inside GR-51: one hero-hour of a mid-geared four on Normal. Study 44 wrote the wage on a lone hero. Tyler's 11-21 rulings make the own four the frame and drop every lone target, and study 51 found a lone seat cannot be calibrated, so the four is the only seat that can carry a price. This is a designer change to 44's wording and it rides GR-51.

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

That table is the answer to "early prices sized for an account of four". PROVISIONAL, GR-8 and GR-51, Tyler said yes on the page, reversal of the typed prices kept on 2026-11-18, let stand on the page. It is new in this chapter.

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
| Stamina refill | Six a day. Each costs more than the last: x1, 1.5, 2, 2.5, 3, 3.5. Gold only, never Crowns | The steps are RULED. The first full refill of a day costs 2 hours of the hero's wage (D-5). Refills 1 and 2 pay for themselves, 3 breaks even and 4 to 6 are gold for XP at every Level | Steps RULED 2026-11-20 (24-1). The base is RULED by the designer 2026-11-21 (D-5), `review/06-designer-rulings-w1.md` section 4.2, PROVISIONAL, and OPEN for Tyler's veto as reversal 28: "Veto R-1" sets 1.33 hours |
| Blessings | A set is priced as a share of the hunted hours it saves, in the buyer's own gold. A death costs 6% of Level XP flat with no cap, and the three Blessings cut that by 25, 50 and 75% | The share is a knob, sized with GR-7: Blessings 1, 2 and 3 cost 0.4, 0.6 and 1.0 hours of the hero's wage, so the set is 2 hours. Each rung past the third costs a fifth of the hours it saves on one death (D-5) | Death cost RULED 2026-11-21. The price rule PROVISIONAL, GR-51 (44 call 14). The ladder past the third Blessing is GR-7, chapter 05 |
| The yard fee | 100 gold for each level of the skill trained, each hour | 100 x skill level | RULED 2026-11-20 (24-8) |
| The yard's rate | The XP an hour follows a share of the skill level's cost and never passes half of what hunting pays that skill. The fee follows the rate, so a point of XP never gets cheaper | TARGET: at most half of hunting | PROVISIONAL, GR-54, Tyler said yes on the page, reversal of 2026-11-14, 21-7 and A-5, let stand on the page. It re-opens 11-14 and two rulings of 11-20 |
| The House dummy | It ends the yard fee for one skill. It is sold in rungs by skill band, and each rung costs 25 to 50 hours of the yard fee at that band | 25 to 50 hours. TARGET | "No fee" RULED 2026-11-08. Payback RULED 2026-11-20 (26-5). The rungs DECIDED, GR-53, Fable 2026-11-21 |
| Training items | Double the yard's rate for their hours. Sold for gold and tradeable, or for Crowns and bound | | RULED 2026-11-14 |
| Bench tax | 15% of the output's Shop bid on each job, until the House room for that bench is bought | 15% | RULED 2026-11-01. DECIDED, GR-56b, Fable 2026-11-21: it stays exactly as ruled and gets no wage row. The Shop bid already comes from the one sale formula. The screen may show it in hours |
| A scaled hunt hour | An hourly fee to hunt an old ground at your own Level, on the wage curve | The fee is one data row and can go to zero. Frontier use is read for two weeks. Buying hours is a standing rule ("keep N hours banked for this ground"), never a purchase repeated by hand | PROVISIONAL, GR-9, waits on the playtest or measurement its own row names (chapter 02) |
| Setup slots | Three free for a hero, then 15,000 and 40,000 gold | 55,000 a hero, 220,000 for four | RULED (GR-56a, Tyler 2026-11-21, the sitting): priced, as he ruled on 2026-11-05 |
| Rename, hero colors | Rename is 8 hours of the hero's wage. Colors are 1 hour, once their art ships | Small buys. The talent reset is 3 hours, free under Level 30 | RULED by the designer 2026-11-21 (D-5). PROVISIONAL, GR-51 |

**Three kinds of price.** RULED by the designer 2026-11-21 (D-5), `review/06-designer-rulings-w1.md` section 4.1. A price is in exactly one. **Rows of hours**, read live at the buyer's Level: the refill, Blessings, the talent reset, rename and colors. **Set once from the wage curve**, by a generator with a drift guard: the deeds, and every sellable room rung and Storage chest. **Typed as ruled**, with no wage row in the first build: the yard fee, Tempering, Hallmarks and linings, Setup slots, the bench tax, the market's fees, the Town Crier, Works gifts, bag rungs and founding a clan. `wageShare` opens at 0.80, because the tool over-reads the one real four by about 1.25, and it is re-fitted when the playtest holds 200 hunted hero-hours in a Level band.

| The Town Crier, a Round, flame powders, titles | Being seen in town. Price rows that climb with each use in a day | | RULED 2026-11-04. Their merge into one Great Hearth is GR-82, chapter 07 |
| Bag rungs, Storage chests, the Key Ring | Room. Typed ladders, judged by band G-8 | | RULED 2026-10-22 (Storage grows with gold) |
| The House and its rooms | Typed content, judged by the same bands. Rooms are things, not a curve | | PROVISIONAL, GR-51 (44 section 5.3) |
| Hero slots | None. All four heroes are free from the start | 0 | RULED 2026-11-21 |

**Why hours.** Levels never end. A price typed in gold is wrong one region later. A price in hours is right at Level 20 and at Level 2,000, the formulas are meant to be public, and "hours of your own hunting" is the one price a player can reason about.

### 2.4 Supplies and the store

**The rules.**

| Rule | Status |
|---|---|
| A hero uses its own stock first, then the store. Every spent supply (food, drinks, arrows, runes, whetstones) has a store partner, charged each time it is used, with the browser open or closed | RULED 2026-10-23 |
| Running out of a supply never ends a hunt. Running out of gold does | RULED 2026-10-16 and 2026-10-23 |
| The store's copy of a supply works at 75% of the crafted one. Knob `storeSupplyShare` | PROVISIONAL to keep, GR-50 (55 row 17). It is the ceiling a crafter sells under |
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

**The hunt budget.** DECIDED, GR-57, Fable 2026-11-21. Each hunt carries "spend at most N at the store". It is remembered for each ground and tier, shown on the hunt picker beside the tier, and set with a sane default. When the budget is spent the hunt ends the way a hunt ends when gold runs out. It replaces a fixed gold floor. The reason is safety for a game that spends while you sleep. COMPUTED from matrix cells for this design: a lone mid hero on Deadly can spend over 100,000 gold an hour at the store.

**Food and drink rows.**

| Rule | Status |
|---|---|
| Cooked healing food is one ladder of about eight rows. Meats that a fish of the same tier beats become party meal ingredients | PROVISIONAL, GR-51 (55 rows 13 and 14). Chapter 03 owns the rows |
| The eight buff foods become the four party meals | RULED 2026-11-20 (plan lane L39) |
| Drinks are one clean ladder, crafted and store | DECIDED to keep (no call id, Fable 2026-11-21) |
| Store runes are sold at five depths. Storm and Bone runes open at Runecrafting 25 and 40 | Rune tiers RULED 2026-10-23. Storm and Bone RULED 2026-11-21 |

### 2.5 The heal price line

Formula step R14, knob `healPrice`. DECIDED, GR-52, Fable 2026-11-21. It lands after the store bill is measured right (GR-58).

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

**Standing sinks.** Formula step R16, knob `sinkShare`. PROVISIONAL, GR-8, Tyler said yes on the page, reversal, let stand on the page.

`price of a band's standing upgrades = sinkShare x the band's net gold`

| Rule | Number | Status |
|---|---|---|
| A band's standing upgrades together (both Tempering tracks, six crafted pieces kept Hallmarked, linings kept up) cost more than the band earns | 1.2 to 1.4 of the band's net gold. Bands G-10 and E4 | RULED 2026-11-18 for the size. As a formula PROVISIONAL, GR-8, Tyler said yes on the page, reversal, let stand on the page |
| Going up a tier costs only the difference. No purchase is wasted | | RULED 2026-11-20 (23-2) |
| The share is sized on a hero who pays only the difference at every tier, so the 1.2 to 1.4 holds for a careful hero | COMPUTED from the item plan's own table: without this rider a careful hero pays 0.5 to 0.9 of a band at tiers 4 to 6 | PROVISIONAL, GR-8, Tyler said yes on the page, reversal, let stand on the page (47 C2). It re-opens "Tempering stays as built" of 11-18 |
| The share is read on a hero-day of the four, so an account of four heroes faces four heroes' worth of sinks from one purse | | PROVISIONAL, GR-8, Tyler said yes on the page, reversal, let stand on the page |
| A hero that spends everything reaches 70 to 80% of the band's pool | Band E4 | RULED direction 2026-11-18 |
| Every band has its sinks by construction. No ladder ends | | PROVISIONAL, GR-8, Tyler said yes on the page, reversal, let stand on the page |
| No gold-for-power offer is cheaper than Tempering's cheapest rung | At least 1 hero-hour of gold for each 1%. Band E8 | DECIDED (no call id, Fable 2026-11-21) |

**The standing sinks, by name.** Chapter 03 owns what each does. This chapter owns what each costs.

| Sink | What the player buys | Shape | Status |
|---|---|---|---|
| Tempering | Permanent rungs on blows or armor. Gold plus crafted salts. Rung prices double, so the last rung is half the track and most heroes stop short | A share of band gold | Crafted salts RULED 2026-11-05. Carries up a tier RULED 2026-11-20 |
| Hallmarks and reforges | Perks on crafted pieces, carried up a tier for the fee difference | A share of band gold | Fees RULED 2026-11-18. Onto `sinkShare` PROVISIONAL, GR-8, Tyler said yes on the page, reversal, let stand on the page |
| Linings | One monster part plus gold. Cured in a House slot. 12 hunted hours, stacking to 48. The first repeating sink that buys power | A share of band gold a week | RULED 2026-11-18. Onto `sinkShare` PROVISIONAL, GR-8, Tyler said yes on the page, reversal, let stand on the page |
| Curing slots | House slots bought with climbing gold, and a gold fee on each cure | Account-hours | RULED 2026-11-18. Built last as a standing order, GR-47 |
| Chest reforging | Its own action, with keys | Chapter 03 | RULED 2026-11-18 |
| The House | Rooms sell kept materials, never speed | Typed | PROVISIONAL, GR-76 |

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
| Clan castle gifts and the weekly clan share | Clan members who want the room buffs | Member count and the wage (MM-9, `docs/design/overhaul/06-mmo-layer.md`) |

**The yard is the keystone.** Combat skills have no cap, so the yard is the one sink that never ends. COMPUTED from the ruled fee: a hero that trains all 12 rested hours pays `1,200 x skill level` gold a day, and four heroes pay `4,800 x skill level`. Each rested hour is then a real choice between training, which costs gold, and town work, which makes goods. Tyler's ruling that the every-idle-hour training reading is "a number we watch, never a gate" stands (RULED 2026-11-21).

**The hole the hero slots left.** RULED 2026-11-21: all four heroes are free. A slot ladder would have taken about 5.5M gold from an account in its first weeks (COMPUTED from the retired ladder, used here only to size the hole). That gold needs homes that ask for a choice, or the first weeks have nothing to buy.

PROVISIONAL, GR-8, CE-4 and MM-22, Tyler said yes on the page, reversal, let stand on the page, in the order the gold should meet them. A first-week account cannot reach rows 5 and 6, so its gold follows the order of section 2.10. The castle is the long home for the slot gold once an account is in a clan, and boss and arena materials are a small home:

| # | Home for the gold | When a new account meets it | Why it fits |
|---|---|---|---|
| 1 | The yard fee | Day 1, as soon as a hero rests | Four heroes resting 12 hours each is 48 hours a day that can be trained. It scales with skill, so it starts near zero and never ends |
| 2 | Tempering and Hallmarks, sized on four heroes from one purse | The first gear band, from about Level 15 | The share rule already makes one band's sinks exceed one band's gold. Four heroes make it four times the choice |
| 3 | Linings | The first band whose ground has an element to guard against. TARGET: the second gear band | The first repeating gold-for-power. Sized inside the ruled 48 hour cap |
| 4 | The House dummy rungs | When the yard fee starts to bite, by skill band | It converts a repeating fee into one large purchase, priced at 25 to 50 hours of the fee it ends |
| 5 | The clan castle | When clans open (chapter 06) | Shared work, standing buffs under one cap. Sized below |
| 8 | On call | Never | On call moves no gold to the hero's owner and is not a Crowns surface. The caller pays a guest's supplies. Castle labor covers an account's weekly share before gold does (PROVISIONAL (CH11-1 and CH11-3, `11-on-call-and-clan-xp.md`)). Nothing sells hire stamina, and the stamina refill does not touch it |
| 7 | The talent reset | Level 30, when a reset stops being free | PROVISIONAL (TAL-1, `10-level-choices.md`). Priced in hours of the hero's own wage (`talentResetHours`, opening at 3), with no gold number until the wage formula of R15 exists. It is not a Crowns surface. Premium gives nothing here, and the store sells no points and no resets |
| 6 | Boss and arena upgrade materials, bought from players | When the first world boss stands | The gold moves to the player who earned the material, and 5% burns on the way |

The yard fee ships before linings (RULED 2026-11-20, 24-12). The first week's order is PROVISIONAL (CE-4) in section 2.10. Its sizes are PROVISIONAL (CE-5, Tyler said yes on the page, reversal of the gold numbers of 26-3 and 26-1, let stand on the page) and are a HYPOTHESIS.

**The two clan prices chapter 06 hands to this chapter.** PROVISIONAL, MM-9 and MM-22, reversal of 25-4, the castle gate of 25-3 and 31-3, let stand on the page, with MM-9 PROPOSAL, made in the fold 2026-11-21, not yet seen by Tyler, with GR-8 and GR-51. Both are new rows on formulas this chapter already owns, so neither is a special case.

| Knob | Rule | Size. TARGET | Why |
|---|---|---|---|
| `clanWeeklyShare` | What a member gives each week to hold the room buffs. Hours of the wage curve at the account's highest hero Level (R15) | 4 to 8 account-hours a week, which is 1 to 2% of an account-week of gold | A standing buff of +5% must cost something a player notices and never something a new member cannot pay |
| `castleStagePerMember` | What one stage of the castle costs for each member. A share of band gold at the members' average band (R16) | Sized so a stage takes 1 to 1.3 weeks at the weekly share and never under a week, for a clan of 3 and a clan of 60. Twenty stages are then 20 to 26 weeks. The price is for each member, with a floor of five members | The stage scales with the roster, so no clan size is the cheap one |

Both numbers are TARGET with no measurement behind them, and they wait on the wage formula and on MM-9.

### 2.7 The market

The market is the Weighhouse. PROVISIONAL, GR-50. It is a big bet and it rests on a HYPOTHESIS that standing orders fill.

**The principle.** The whole game is "decide once, it runs while you are away". A market that needs a player standing at a window is the one system that would break that. So the market has no required window. Three set-once decisions do the trading.

| Part | Rule | Status |
|---|---|---|
| Standing buy orders | "I pay 300 each for up to 500 Cooked Shark." The gold is held by the server. The order fills when any seller's goods arrive, with neither player present | PROVISIONAL, GR-50 |
| The Sell loot rule | When a hero's loot is dispatched, each item marked Sell goes to the highest standing order if that beats the Shop's bid after the cut, and to the Shop otherwise | PROVISIONAL, GR-50. Loot rules Keep, Store and Sell are RULED 2026-10-23 |
| The supply refill buys player stock | Own stock first, then player listings priced under the store, then the store. One press, total shown first. Charging inside a hunt stays the store's | PROVISIONAL, GR-50 |
| One book for each piece | Grade and perks are filters on the book, not separate books. An order for a rolled piece names the item and may name perks | PROVISIONAL, GR-50 (item plan section 10, 47 M9) |
| A suggested price | Shown on every book from a reference value the server computes from drop rows, kill rates and recipes. It carries thin books | PROVISIONAL, GR-50 (item plan section 10) |
| List for a friend | A listing can name one friend. Normal fee and caps. There is no trade window | RULED 2026-11-20 (24-6) |
| Open on day one | The market is open from the first loot. The Weighhouse stays the town's first project as a building only, and the market trades while it goes up | PROVISIONAL, GR-55, Tyler said yes on the page, reversal of 24-7, let stand on the page. "Builds something else" is read as "opens nothing else" (RULED by the designer 2026-11-21 (D-5), `review/06-designer-rulings-w1.md` section 4.5). Staged 1013 and 1014 stand |
| The fee and the cut | 1% to list and 4% of each sale, both burned | PROVISIONAL to keep, GR-50 |
| Limits for each account | 50 open listings and 7 day listings. 200 listings a day. 2,000,000 gold spent and 2,000,000 received a day. A Level door, a same-network guard and a price ceiling on every item | PROVISIONAL to keep (GR-50). All inside the one Security review before Early Access |
| One laundering route closed | The price ceiling on a stackable has no minimum per unit, so junk cannot carry gold between accounts | DECIDED, GR-59b, Fable 2026-11-21 |
| Relisting | An expired listing has "list again", and "always list these at the suggested price" is a loot rule | PROVISIONAL, GR-50. It removes a repeated decision |

**What trades and what does not.**

| Trades | Does not trade |
|---|---|
| All gear, chest pieces, crafted pieces, boss and arena pieces, gems, chips, patterns, materials, unfitted linings, training items bought with gold (RULED 2026-10-23, item plan section 10. Boss and arena gear DECIDED, MM-27, Fable 2026-11-21) | Chest keys, fitted linings, Lucky Rivets and anything else that feeds Luck, anything bought with Crowns (RULED 2026-11-14 and 2026-11-20) |

**The price box on supplies.** For a supply, the Shop's bid is the floor and the store's price is the ceiling. That is wide. A cooked top-tier fish replaces store food worth many times what the Shop pays its maker, and that gap is the room a crafting economy lives in. Because both ends are NPC prices, the supply side of the market cannot be used to pass gold between accounts.

**What is scarce enough to trade.** Not labor. An account of four heroes with 48 rested hours a day makes its own staples. What it cannot make in a day is hunted hours, rare drops, a high crafting level, and parts that only one ground or one boss drops. The market is designed around those four.

**The order of work, and its rider.**

1. The order book and rare pieces first. PROVISIONAL, GR-50.
2. Supplies through the refill second, and only after the harder tiers are sized on full-effect supplies. PROVISIONAL, GR-50. MEASURED on the matrix for this proposal, as the most the market can move combat (55 run 2, every supply at full effect): a four gains about 6% damage and Level XP, takes about 16% less damage, and on Deadly gains up to 10% XP. That is free power for anyone who trades. So tiers are sized on the real kit first. If Deadly proves too soft with a working market, the answer is the one knob `storeSupplyShare`, never a change to a ground.
3. Single commissions (one Hallmark or one reforge on a piece the owner keeps, held by the server throughout) ship with jewelry tiers 5 to 7. DECIDED, GR-44, Fable 2026-11-21.
4. Bulk orders and craft orders ("I bring materials and a fee, your level 90 smith makes it") come after orders are proven to fill. Built later and hidden until they work. Nothing planned is cut (RULED 2026-11-21).

**Server rule.** A fill is one batched call at loot dispatch or at a refill. Nothing about the market runs on the hunt's settle, and an account that never trades costs nothing (band C6). Study 48 did not measure the market, so its cost is OPEN after 48, for the reliability engineer.

### 2.8 The Crowns engine

**Tyler's rule.** "This game needs a model where buying crowns and selling for gold WILL provide advantages. Just not broken af ones." (RULED 2026-11-21.) And the intent behind it: "I plan on making money in this game by people buying premium, and people buying crowns to sell to other players for gold. I don't want to cripple people so that the only way they can progress is by paying to win, however, I do want whales to pay for gold so they can have an 'edge'." (RULED 2026-11-18.)

**The rule of the design.** MM-28, in Tyler's own words on MM-32: "paying can put a hero way ahead, it depends on what is on the player market". Paying gives a real edge that can be felt. There is no ceiling that nobody passes. A player who does not pay can reach the same things with gold, as far as the market holds them. RULED (MM-28 and MM-32, Tyler 2026-11-21, the sitting): the game promises no ceiling on gear or gold bought through other players. The limits that remain are structural: gear is worn by Level, the store sells no gear, and an account may sell only so many Crowns a week. The buff caps stay.

**When it comes.** The Crowns engine runs on its own book and does not wait for the market, because Crowns buy Premium, looks and comfort and those need no market (MM-28 to MM-37, which supersede GR-60).

**The loop.**

1. A player buys Crowns with money.
2. That player spends them in the store, or lists them on the Crowns book for gold.
3. A player with gold buys those Crowns and spends them in the store. A Crown bought with gold is bound to that account and cannot be listed again.
4. The first player now holds gold that other players hunted. It buys gear and upgrade materials from players and pays the sinks of section 2.6.
5. The sinks destroy the gold. The gear and materials were dropped by someone's heroes, and that someone is paid for playing.

No gold is created by money and no gear is created by the store.

**What Crowns buy.** PROVISIONAL, MM-29 and MM-30, Tyler said yes on the page.

| The advantage | How a payer gets it | How a non-payer gets it | Bounded by |
|---|---|---|---|
| Two timed boosts: damage +6%, and protection written on the Defense rating and sized so a mid-geared four takes about 3% less damage an hour. No Level XP boost and no drop or material boost is sold. HYPOTHESIS | The store, for gold, in 1 day and 7 day sizes, priced on the wage curve and burned. A payer sells Crowns for that gold | Earned from bosses, the clan and arenas. Or bought with hunted gold | The timed caps below. A bought boost and an earned buff are the same row and fill the same cap. One bought boost on a knob at a time |
| Premium | Crowns | Crowns bought with gold | One for each account (section 2.9) |
| Gear sooner, and better gear | Gold from Crowns buys pieces on the market | Drops, bosses, arenas, and hunted gold | What the player market holds (RULED, MM-32, Tyler 2026-11-21, his own note). A piece still needs the hero Level it is gated on |
| Upgrades sooner | Gold from Crowns pays the sinks and buys the materials | The same sinks with hunted gold | Each sink's ladder ends at its band's top rung |
| Clan rooms sooner | Gold from Crowns given to the castle | Hunted gold given | The standing caps |
| Comfort | Crowns: more market listings. Premium banks arena tickets to 30 | Crowns bought with gold | No power |
| Looks | Crowns: outfits, dye sets, a rename | Crowns bought with gold | No power |
| Training items | Crowns, and bound to the account. They join the Crowns store only after the yard fee and to-hit changes are live (RULED 2026-11-20, 26-10) | Gold, and tradeable | RULED 2026-11-14 |

**Never sold for Crowns.** Gear, upgrade materials, gold, Levels, skill levels, a Level XP boost, boss chests, arena rating, Luck, drop chance or material find, a saved Setup, bag or Storage room, stamina or stamina refills, hero slots, any roll of any kind. PROVISIONAL, MM-29, Tyler said yes on the page. Luck is RULED 2026-11-20 and stamina is RULED 2026-10-18. Crowns are never earned in play (RULED 2026-10-13). Everything bought with Crowns is account-bound and only Crowns themselves trade (RULED 2026-11-14).

**The one place the check overruled the deciders.** Both deciders sold timed boosts for Crowns, and one of them sold a Level XP boost. Two older lines say power is never sold for Crowns directly. On 11-04 the recorded advice was "no direct Crowns-for-power sale without his explicit word", and the 11-18 intent says power reaches a payer "only through player trade for gold". The adversarial check keeps both lines. The two boosts are sold for gold. A payer still feels them, because gold bought with Crowns keeps them running, and the economy gains the weekly burned sink it lost with the hero slot prices. The cost is that a Crown's repeating uses are Premium and looks. If Tyler wants stronger Crown demand, the same two boosts could be sold for Crowns at the same sizes. Tyler confirmed the boosts sold for gold. PROVISIONAL, MM-29, Tyler said yes on the page. HYPOTHESIS for the sizes: the gold-priced boosts were not played.

**No Level XP boost is sold, for Crowns or for gold.** DECIDED, MM-29-XP, Tyler said yes on the page 2026-11-21. Level is the score the Honors page ranks, and Tyler's words on 11-04, 11-18 and 11-21 all describe Crowns to gold to an edge. Timed Level XP comes only from the Hearthrise weekend.

**The drop chance boost is not sold.** DECIDED (CE-3, Fable 2026-11-21). Study 49 put a drop chance boost in the store. Tyler bound Luck on 2026-11-20 ("Ok nvm let's bind it") for one reason: so that neither gold nor Crowns could buy Magic Find. A boost that raises drop chance for Crowns is the same thing by another door, and because Crowns trade for gold it would let gold buy it too. So the store sells no drop chance boost. The +10% timed row of the buff caps stays in the game as material find (CE-2). It adds to rows tagged as materials and never touches a Rare, a gear row, a key or a seed. It is earned only, from bosses, clans, arenas and events (`06-mmo-layer.md`, section 2.2). The paid ceiling does not move, because the pace number never used the drop row. The cost is one less thing to sell. The gain is that the gear chase cannot be bought at either end.

**One overlap resolved.** Study 49 lists "more saved setups" and "more bag and storage" as Crowns comfort. Saved setups are sold for gold and never for Crowns: three free, then 15,000 and 40,000 gold (RULED, GR-56a, Tyler 2026-11-21, the sitting). That is 55,000 gold a hero and 220,000 for four, and no number changes. Slots four and five sell a fourth and a fifth kit, never the memory of a ground. Bag rungs and Storage chests are gold sinks (RULED 2026-10-22) and stay gold. Crowns comfort is market listings only, and Premium banks arena tickets.

**The buff caps the boosts live under.** PROVISIONAL, MM-24 and MM-25. Chapter 06 owns the table. It is repeated here because it is the ceiling of everything bought.

| Knob | Standing cap (clan rooms) | Timed cap (earned buffs and bought boosts together) |
|---|---|---|
| Damage dealt | +5% | +10% |
| Protection, as Defense rating rows (CORE-4) | about 5% less damage an hour | about 5% less damage an hour |
| Level XP | A clan room pays a standing bonus (RULED at the sitting, which reverses 25-2). Its size is PROVISIONAL and owed by the design lane | +25%, from the Hearthrise weekend only. Never sold |
| Material find (CE-2) | none | +10%, earned only. Never sold |
| Coin from kills | none | none |
| Town work speed | +10% | none |

**Is the advantage real, and is it not broken?** Tyler ruled both halves on 2026-11-21, and two of his answers went against the designer.

On gear (MM-32): "paying can put a hero way ahead, it depends on what is on the player market".

On the price of Premium in gold (MM-34): "this depends on the crown price, we don't set it, the players do".

So the design has no gear ceiling and no gold price target. What keeps the advantage from being broken is four things, and at the sitting he ruled the promise: no ceiling, only structural limits. The table below lists them. The buff reading in it stays PROVISIONAL until one buff is played in a cell.

| Guard | What it bounds | How | Status |
|---|---|---|---|
| Market supply | Gear | Every piece a payer buys was dropped or made by a player. The store has no row for gear, materials, gold, Levels or rating. A payer can be way ahead of a player who buys nothing, and never ahead of what players have found. A piece still needs the hero Level it is gated on (RULED 2026-10-24) | RULED, MM-32, Tyler 2026-11-21, his own note |
| The buff caps | Pace from buffs and boosts | With every cap full a four gains at most 65% more Levels an hour than the same four in mid gear with no buffs, and 32% more kills an hour. COMPUTED: best gear 1.15 x both damage caps 1.15 x timed Level XP 1.25 = 1.65. Nobody holds it outside a Hearthrise weekend, because no Level XP boost is sold. It is one reading held by a test, never a new limit, and chapter 06 quotes the same numbers (MM-26). With a clan Level XP room it rises, to about 1.73 at +5%, which is PROVISIONAL and waits on the clan XP size | PROVISIONAL, MM-31, waits on one buff played in a cell, Tyler said yes on the page. It keeps 50-11 |
| The eight clamps | Gold moved by Crowns | The weekly cap, the price band, one trade then bound, the hold, the Level door and the daily caps, the boost catalog, the store with no power rows, and the journal | PROVISIONAL, MM-36 and MM-33, Tyler said yes on the page |
| Where paying gives no edge | Fair places | The Even Arena, events, and access to any Level, ground, drop or tier | PROVISIONAL, MM-37, waits on test Crowns run in a playtest, and the Security review, Tyler said yes on the page |

**The paying-alone reading, re-derived.** PROVISIONAL (MM-31, re-derived in the fold 2026-11-21, not yet seen by Tyler). Cells have now held a buff. MEASURED in `12-balance-pass.md` (R1 and R2): paying alone reads about 1.06 to 1.08 in Level pace, and every cap full reads 1.29 to 1.48 against the 1.65 Tyler said yes to on the page. His yes to 1.65 and about 1.22 stands as written, and the measured readings sit beside it for him (chapter 12 section 7, item 4). What a payer really gets is a step: the next tier some Levels sooner, worth 20 to 29%. It stays about 22% against a plain mid-geared four in the same band: best gear 1.15 x the +6% damage boost 1.06. It now says what it is. It is the pace of a four in the best gear state with the boost, it is reached only when the market holds the pieces, and it is not a limit on gear. A band that takes a plain four 10 days takes that four a little over 8 (COMPUTED, 10 over 1.22), and every Level and every band is still walked. If a set bought on the market ever reads more than the ruled 15% over mid gear, the fix is at the formula layer, in the best-gear definition or the gear curve, and never a cap on buying.

**The weekly cap, re-worded.** PROVISIONAL, MM-33, Tyler said yes on the page, with the wording re-derived in the fold 2026-11-21 and not yet seen by Tyler. The cap stays and it is a clamp, not a ceiling on gear. It is a weekly count of Crowns an account may sell and buy on the book, as ruling 24-5 requires. It opens as a fixed count of Crowns from a data row. Once the book has seven days of sales the server re-derives the count each week: `weekly cap in Crowns = one account-week of wage at the seller's highest hero Level / the 7 day median gold price of a Crown`. It reads the price players made and never sets one. Its job is to stop laundering and floods.

**MM-31 beside ruling 50-11.** On 11-21 Tyler ruled 50-11: "no limit on how much sooner" bought gold reaches best gear, only a limit on what can be bought. MM-29 is that "what" limit. 1.65 and 1.22 are readings of what the buff caps and the best gear state add up to, held by a test. Nothing in the design limits how far bought gear can put a hero ahead.


**Where paying gives no edge.** PROVISIONAL, MM-37, Tyler said yes on the page.

| Place | Edge from paying |
|---|---|
| The even arena | None. Nothing bought is read |
| Events | None. An event's buff reaches everyone and fills the same cap |
| Levels, grounds, drops, tiers | None are sold. A free player reaches every one |
| The open arena | Yes. Matching is by gear band, so a bought set meets other strong sets |
| World bosses | Yes. The chest pays by your own points, so a payer takes nothing from anyone |
| Clans | A payer's gold raises rooms sooner, and every member who gives holds the buff, so a payer lifts the whole clan |

**The path for players who do not pay.** RULED, MM-34, Tyler 2026-11-21, his own note. Everything sold for Crowns can be had with gold through the book. There is no gold target for Premium or for anything else on the book, because the Crown's price is the players' and not ours. The two store boosts are priced in gold directly, on the wage curve, and scale by the buyer's band so they cost about the same hours of play at Level 20 and Level 300. Best gear for a band, bought and upgraded from mid gear, is sized by the sinks at 100 to 140% of the band's net gold for a hero (band E4), and the market sets the price of the pieces.


**The Crowns book.** PROVISIONAL, MM-35, Tyler said yes on the page. It builds 24-5 (RULED 2026-11-20: Crowns are a number on the account, never an item).

| Part | Design |
|---|---|
| What a Crown is | A number on the account, with its own append-only ledger and reason codes. Written only by the server, on the server clock |
| Where Crowns come from | The payment provider's signed message. Nothing in play |
| The book | One server-owned book, Crowns only, in fixed lots. The seller's Crowns are held by the server. The buyer pays gold |
| The cut | 1% to list and 4% of the gold, both burned, as on the market. So every Crown sold for gold is also a gold sink |

**The eight clamps.** PROVISIONAL, MM-36, Tyler said yes on the page. Five are RULED in outline (24-5, 2026-11-20). Three are added. All eight are inside the one Security review before Early Access.

| # | Clamp | Rule |
|---|---|---|
| 1 | A weekly cap | Crowns sold and Crowns bought a week for each account. A fixed count from a data row at opening, then re-derived each week from the players' own 7 day median, aimed at about one account-week of hunting gold (MM-33) |
| 2 | A price band | A lot's gold price sits between half and twice the 7 day median of real sales. Before a median exists, a wide floor and ceiling from a data row, with no seeded target price (PROVISIONAL, re-derived in the fold 2026-11-21, not yet seen by Tyler). Without it one Crown sold for 50M is a gold transfer between two accounts |
| 3 | One trade | A Crown bought with gold is bound. It can be spent and never listed again. No speculation and no wash loop |
| 4 | A hold | Crowns bought with money cannot be listed for a set number of days, by the payment provider's chargeback window. An account in arrears is shut out of the book |
| 5 | Who | A Level door on the book, the same-network guard, and the market's daily spend and proceeds caps |
| 6 | Boosts | A server catalog of boosts with server prices and a server clock. One bought boost on a knob at a time. The cap is applied by the server in the one modifier table |
| 7 | The store | The store has no row for gear, materials, gold, Levels or rating, and a test proves it |
| 8 | The journal | Every Crown bought, listed, sold, bound and spent is a journal row |

**Why this shape.** Study 49 section 3.1 read ten games with a bought currency that players trade for gold. The accepted form is the same in all of them: money becomes gold only through another player, at a price players set, and the bought thing trades once. Every one of them limits it by a count, a rising price, a fee or a trade lock. Players accept buying time, membership, capped boosts and looks. They revolt when the store mints power, or the item that makes power, straight into the economy. A bought currency also needs a repeating sink or its buyers run out, which is what Premium each month and boosts each week are.

**Test Crowns in the playtest.** DECIDED (MM-43, Tyler said yes on the page 2026-11-21, an explicit yes). Test Crowns are granted for the wiped Discord playtest only. Every account gets the same amount. One server switch does it, off by default and removed before Early Access, and every grant is journalled. Outside that playtest the rules stand: Crowns are never earned in play and player state is never fabricated.

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
| A daily 1 hour training item, the player picking Melee, Ranged, Magic or Defense | One for each hero each day | RULED 2026-11-20 (24-4, amendment declined, the item stays). "For each hero" is DECIDED (PREM-1, Tyler said yes on the page 2026-11-21) |
| The daily claim | Granted to every hero on the first visit of the day, with no press | PROVISIONAL, GR-84 |
| 100 market listings and 14 day listings | For the account | RULED 2026-11-20 (24-4) |
| Arena tickets bank to 30. Premium does not make buffs last longer | For the account | DECIDED, MM-21, Tyler said yes on the page 2026-11-21 |

**What is never Premium.** The risk reading. Every player sees, free, how close a hunt came to a death and the deaths per 100 hours of that ground and tier. Selling the warning would read as selling safety. PROVISIONAL, GR-66, Tyler said yes on the page. The deeper per-rule bar report may sit in the Premium analyzer.

**What the 12 hour bar is really worth.** Stamina refills one for one while a hero is not hunting, and two visits a day is the free game (RULED 2026-11-21). A player who visits twice a day gets 12 hunted hours on the free 8 hour bar. The 12 hour bar gives the same 12 hours to the player who visits once. So Premium sells one saved visit a day, plus information, looks, a gift and room. It is comfort, clearly nice, and weak on purpose.

**Who buys it.** Mostly players with idle gold, through the Crowns book. That trade, a saver's gold for a payer's Crowns, is the one the whole money model rests on. So Premium does not need to be strong. It needs to cost a saver nothing it misses, which is why it is one for each account. What it costs in gold is whatever the Crown costs on the book, and players set that (RULED, MM-34).

**The price.** PROVISIONAL (PREM-2, Tyler said yes on the page): 30 days, priced in Crowns, at 8 to 10 dollars a month as a number to react to. The lot-size clause is PROVISIONAL, re-derived in the fold 2026-11-21 and not yet seen by Tyler: a lot is a fixed count of Crowns, 30 days of Premium costs a whole number of the smallest lot, and the book opens with no seeded gold price. The first asks set it.

### 2.10 The early economy for an account of four heroes

This section is new design. No source covered it. The order is PROVISIONAL (CE-4). The sizes are PROVISIONAL (CE-5, Tyler said yes on the page, reversal, let stand on the page) and are a HYPOTHESIS. The test of the week: a played account of four must end week 1 having wanted more than it could buy.

**The deed sizes are rows of account-days.** RULED by the designer 2026-11-21 (D-5), `review/06-designer-rulings-w1.md` section 4.1. The Hearthside Homestead stays 400 gold. The Fieldworth Farmstead is 1 account-day at Level 20, the Stonecross Manor 3 at Level 60, the Ironvale Keep 6 at Level 90 and the Hearthrise Castle 20 at Level 110. An account-day is 48 hero-hours of wage. Every sellable room rung and Storage chest moves by one factor, the geometric mean of the four deeds' moves, so a Homestead room and a Farmstead room move together. Everything owned stays owned at the price paid. PROVISIONAL (CE-5).

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
| Hour 1 | The Hearthside Homestead | Errand | 400 gold and the goods the first rest plan gathers |
| Day 1 | The market. A first standing order, a first loot rule | Trade | The 5% only |
| Days 1 to 3 | The first Tempering rungs and the first Hallmark, from about Level 15 | Standing | The band's set is 1.2 to 1.4 of the band's gold, across four heroes |
| Days 2 to 4 | The Farmstead as the first band goal, and the first bench room | Long goal | The Farmstead is about 1 account-day. After it the Manor is about 3, the Keep about 6 and the Castle about 20. HYPOTHESIS (CE-5) |
| Week 1 on | Blessings, from Level 30, once a hero hunts a tier that can kill it | Repeating | A share of the hours a death costs. Free under Level 30 |
| Weeks 1 to 2 | Linings and the first curing slot | Repeating | A share of band gold a week |
| Week 2 on | Premium through the Crowns book | Monthly | Whatever the Crown costs on the book. Players set it (MM-34) |
| Week 2 on | The House dummy's first rung | Long goal | 25 to 50 hours of the yard fee it ends |

**The shape this is meant to have.** A new account is never broke, because Normal costs almost nothing at the store and the yard starts near zero. A new account is never done either, because by the first gear band four heroes are asking one purse for more than it holds. The first week teaches the two habits the whole economy runs on: spend on the hero that matters most, and set a rule once.

**A reading to size against, not a target.** SIMULATOR, harness cells for a mid-geared four at 12 hours with full store prices (43 section 7): about 220,000 gold in an account-day at Level 10 and about 280,000 at Level 50. The harness reads a party's store bill at 1.7 to 2.2 times real, so its net gold is direction only. COMPUTED against that reading: four heroes training every rested hour at skill 10 pay 48,000 a day, about a fifth of gold in. At skill 45 they pay 216,000, most of a day's gold. So by mid game an account trains some hours and works the rest, which is the choice the fee is meant to create.

**Measured: what an account of four earns, and how far the typed deeds sit under it.** From `12-balance-pass.md` section 3.7 (MEASURED, R0, the mid four on Dangerous, net gold after the store). Gold in the tool is still an upper bound, so these are sizes and not prices. Every price stays PROVISIONAL until the wage formula of GR-51 exists.

| Levels | Net gold a hero-hour | An account-day |
|---|---|---|
| 16 to 31 | 6,000 to 7,100 | 290,000 to 340,000 |
| 45 to 65 | 10,700 to 13,500 | 510,000 to 650,000 |
| 70 to 110 | 17,600 to 21,500 | 845,000 to 1,030,000 |
| 110 to 185 | 18,000 to 22,600 | 860,000 to 1,090,000 |

COMPUTED on those account-days: the typed deeds sit 7 to 12 times under the sizes of CE-5. The Farmstead at 25,000 gold is 0.08 of an account-day against about 1. The Manor at 150,000 is 0.25 against about 3. The Keep at 600,000 is 0.6 against about 6. The Castle at 2,500,000 is 2.8 against about 20. So CE-5's direction is right and its factor is about ten.

### 2.11 Inflation over a long-lived server

**The problem by design.** Gold comes in by the hour for ever. A server stays healthy only if gold leaves at nearly the same rate, and if the things gold buys keep their worth.

**The targets.**

| Band | Target | Label |
|---|---|---|
| G-11 | Gold destroyed over gold created, server-wide, a day: 0.85 to 1.00 from the second month. Red under 0.7 for a week | TARGET. DECIDED (no call id, Fable 2026-11-21) |
| G-9 | Repeating sinks over gold in, a day: 35 to 50% from Level 30 | TARGET. DECIDED (no call id, Fable 2026-11-21) |
| X14 | Gold held by an account at day 30, 90 and 180 stays under 20 days of its own income | TARGET. DECIDED (no call id, Fable 2026-11-21) |
| X14 | A tier's gear floor on the market stays over its Shop price at 10, 1,000 and 10,000 players | TARGET. DECIDED (no call id, Fable 2026-11-21) |

**The five things that hold it.**

1. **Prices follow the wage, not the calendar.** Every repeating price is hours of `wage(L)`, and every standing sink is a share of band gold. A hero at Level 300 pays Level 300 prices. No sink is ever "finished" because no ladder ends. PROVISIONAL, GR-51 and GR-8, reversal, let stand on the page.
2. **One sink has no end at all.** The yard, because combat skills have no cap. RULED fee, 2026-11-20.
3. **Power that wears off.** Linings last 12 hunted hours. Boosts last a day or a week. Blessings are spent by a death. These take gold every week from every band.
4. **Trade burns gold.** 5% of every market sale and of every Crown sold for gold. The busier the server, the larger the sink.
5. **Shared works take surplus.** The town's monthly project sized to the server (RULED 2026-11-20, 24-10) and the clan castle sized by member count (MM-9). Both scale with population by construction.

**No coin buff, ever.** PROVISIONAL, MM-25. A buff that mints gold for the buffed raises prices for everyone else, and it would let money mint gold.

**The gauge.** DECIDED, GR-59a, Fable 2026-11-21. One daily line printed from the journal: gold created, destroyed and held, by source and by sink, by day and by account age. Nobody can steer what nobody reads. The Crown's gold price is on the same page, because every player will watch it.

**What a floating Crown price does, and why that is acceptable.** Gold prices set by players (market goods and the Crown) drift with the amount of gold on the server. Prices set by formula do not. On an old server a Crown buys more gold than on a new one. That would let a payer's edge grow with server age if anything were priced in fixed gold. Nothing that carries power is. Sinks are shares of band gold, and the weekly cap is re-derived from the Crown's own price (the rider in 2.8). So a Crown buys the same number of hours of play in month 1 and month 20.

**Newcomers on an old server.** Inflation hurts a newcomer only if veterans need nothing a newcomer makes. The design gives veterans reasons to buy from low bands: linings need one monster part from the ground that drops it, old grounds can be hunted at your own Level and still drop their parts (GR-9), and salts and staples are wanted at every tier. A rich server then pays its newcomers.

**The self-raising sink, built later.** One scarce, visible, shared thing whose price is a bid of burned gold, such as castle tenure for a month. A bid is the only price that rises by itself as a server gets richer. It needs hundreds of players. It stays in the plan, hidden until the population exists (RULED 2026-11-21: nothing planned is cut). It waits for the castle (RULED in direction, MM-9, Tyler 2026-11-21, the sitting, with every size PROVISIONAL).

**At 10 players and at 10,000.** At 10 there is no market depth, so the Shop is floor and ceiling, and standing orders are the only trade that works between two players who are never on together. At 10,000 there are several hundred thin books carried by the suggested price, the daily caps bind real traders, and the Crowns book's 5% becomes the largest trade sink. HYPOTHESIS at both sizes until the gauge reads a live server.

### 2.12 Server cost of this chapter

Study 48 (`docs/design/balance-program/48-platform-cost.md`) has landed. It priced the account-day and did not price this chapter's own parts.

| What is known | Label |
|---|---|
| A player may cost at most $0.15 an account a month at 1,000 accounts, and no more at 10,000 | RULED 2026-11-21 |
| That is about 60 database-seconds an account-day at 1,000 accounts and 24 at 10,000 | COMPUTED in study 50 from assumed list prices. Best case |
| No economy feature adds a statement to the hunt's settle, runs a poll, or grows with players times players | Band C6. DECIDED (no call id, Fable 2026-11-21) |
| A market fill is one batched call at loot dispatch or at a refill. An account that never trades costs nothing | PROVISIONAL, GR-50 |
| The Crowns book is one wallet row, one ledger row a movement, and one more book | ESTIMATED close to nothing (study 24) |
| Bought boosts are read with a hero's other modifiers at the settle, so they add no statement | ESTIMATED (study 49) |
| Town work in closed form, which is what makes 48 rested hours a day affordable. It is worth 109 database-seconds an account-day | PROVISIONAL, GR-1, waits on a town-hour fixture and a load test, Tyler said yes on the page (chapter 09). ESTIMATED by study 48 |
| The target account-day is about 11 database-seconds with the browser closed and about 31 with a tab open 3.5 hours. Both meet 60 at 1,000 accounts. At 10,000 the tab day misses 24 by about a third on the edge | ESTIMATED by study 48 |
| A press costs 107 ms, and 71 when its answer carries changed sections only. Twenty presses a day are 1.4 database-seconds | REAL for the press, ESTIMATED for the day |
| Spending by the use writes one journal row a hero an hour an activity, about 3 rows a hunted hero-hour. A save's cost rises 4 ms from 0 to 4,500 journal rows a hero that day | The hourly journal is RULED 2026-11-20 (28-2). The 4 ms is MEASURED |

What study 48 left open for this chapter: the measured cost of order matching and of the gauge's daily roll-up. Owner: the reliability engineer, with a fixture before the market is built.

---

## 3. How it connects

| Chapter | This chapter reads from it | This chapter feeds it |
|---|---|---|
| 00, the game and index | The frame: four heroes, 12 hours, three gear states, formula layer | The money model in one paragraph |
| 01, core and combat | Monster health and the reference kill rate (the wage). Hero health (heal size). The 2 second shared food cooldown, which is why heal price is a tax on speed. Rune tiers | The store bill bands for each tier. `storeSupplyShare`. The hunt budget as an end reason |
| 02, world | Grounds, bands and tiers. Scaled hunts at your own Level (GR-9) | The scaled hour's price. Demand for old grounds' parts |
| 03, items and crafting | What Tempering, Hallmarks, linings, salvage, Luck and commissions do. Reference values of items. Food and rune rows | What each costs (`sinkShare`). The Shop's sale formula. The market those goods trade on. Crafters' customers |
| 05, progression | The Level law (the length of a band). The death cost and the Blessing ladder (GR-7). The yard's rate and the skill curve | Blessing, refill and yard prices. The paid pace ceiling, which moves the days of the Level law for a boosted four |
| 06, the MMO layer (`docs/design/overhaul/06-mmo-layer.md`) | The modifier table and the buff caps (MM-24, MM-25). Boss and arena gear and materials. The clan castle | Bought boosts as rows in that table, with no drop chance boost. The sizes of `clanWeeklyShare` and `castleStagePerMember`. Gold for castle gifts. Buyers for boss and arena gear. The Crowns engine as the demand side |
| 07, home and town | The House, its rooms, curing slots and the dummy. The town project and the Great Hearth | Prices of rooms and rungs by band G-8. The dummy's rungs |
| 08, player experience | The Path and the first hour for four heroes (GR-79). The loot plan and the return card | The order a new account meets each spend (section 2.10). The hunt budget on the picker. "About N hours of hunting" beside every price |
| 09, platform and measurement | Closed-form town work and the away hunt's save (GR-1, on study 48). The matrix and its faults | The gauge. The journal load of per-use spending. The bands of section 6 |

---

## 4. The calls in this chapter, as decided

In decision-book order. Each line is the decision.

**Decide first**

| Id | The call | The decision | Status |
|---|---|---|---|
| GR-85 | Formula clean-up steps that move no number | Approve. For this chapter it is the four coin dials folded into one coin line (R9) | DECIDED. Tyler said yes on the page 2026-11-21 |
| GR-1 | How the server reaches its budget | Town work paid in closed form. A closed hunt saved every 10 minutes or at 1.2 seconds of engine time. The engine server is a later spend for Tyler | PROVISIONAL. Waits on a town-hour fixture and a load test. Tyler said yes on the page 2026-11-21 |
| GR-8 | Sinks that follow the gear, and the hole the slots left | Tempering, Hallmarks and linings cost a share of a band's gold, 1.2 to 1.4 of what the band earns. The slot gold follows the order of CE-4 first, then the castle | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists. Tyler said yes on the page 2026-11-21. It changes The typed prices kept on 2026-11-18 (Hallmarks 150k, 250k, 400k, 600k), which he let stand on the page |
| MM-24 | How rewards are sized | Every buff and bought boost is a row in one modifier table | PROVISIONAL. Waits on one buff played in a cell |
| MM-25 | The buff caps | Damage +5% standing and +10% timed. Protection as Defense rating rows worth about 5% and 5% less damage an hour. Level XP +25% timed only, from the Hearthrise weekend. Material find +10% timed, earned only. Town work +10%. No coin buff | PROVISIONAL. Waits on one buff played in a cell |
| MM-28 | The paid advantage | Paying gives a real edge. No ceiling on gear or gold bought through other players. Only structural limits remain, and the buff caps stay | RULED (Tyler, 2026-11-21, the sitting) |
| MM-29 | What the store sells for Crowns | Crowns buy Premium, looks and comfort. Two timed boosts, damage +6% and protection of about 3%, are sold for gold in 1 day and 7 day sizes, priced on the wage curve and burned. HYPOTHESIS. Sold for Crowns they would be reversal 24 | PROVISIONAL. Waits on one buff played in a cell. Tyler said yes on the page 2026-11-21 |
| MM-30 | Bought boosts and earned buffs | The same rows, the same caps, one bought boost on a knob at a time | PROVISIONAL. Waits on one buff played in a cell. Tyler said yes on the page 2026-11-21 |
| MM-31 | The pace ceiling | Keep ruling 50-11. Record the same reading as MM-26: 1.65 with every cap full, about 1.22 from paying alone | PROVISIONAL. Waits on one buff played in a cell. The clause re-derived after his two "no" answers was never put to him.. Tyler said yes on the page 2026-11-21 |
| MM-32 | The gear ceiling | There is none. Paying can put a hero way ahead, and what the player market holds is the bound | RULED (Tyler, 2026-11-21, his own note) |
| MM-33 | The gold ceiling | At most about double a week, with the cap re-derived weekly from the Crown's price | PROVISIONAL. Waits on test Crowns run in a playtest, and the Security review. Money stays Tyler's. The clause re-derived after his two "no" answers was never put to him.. Tyler said yes on the page 2026-11-21 |
| MM-34 | The path for players who do not pay | Everything sold for Crowns can be had with gold through the book. No gold target for Premium. Players set the Crown's price | RULED (Tyler, 2026-11-21, his own note) |
| MM-35 | How Crowns trade | A number on the account, on a server-owned book. One trade, then bound. 5% burned | PROVISIONAL. Waits on test Crowns run in a playtest, and the Security review. Money stays Tyler's. Tyler said yes on the page 2026-11-21 |
| MM-36 | The clamps | Eight, all in the Security review before Early Access | PROVISIONAL. Waits on test Crowns run in a playtest, and the Security review. Money stays Tyler's. The clause re-derived after his two "no" answers was never put to him.. Tyler said yes on the page 2026-11-21 |
| MM-37 | Where paying gives no edge | The even arena, events, and access to every Level, ground, drop and tier | PROVISIONAL. Waits on test Crowns run in a playtest, and the Security review. Money stays Tyler's. Tyler said yes on the page 2026-11-21 |

**Needs Tyler's eye**

| Id | The call | The decision | Status |
|---|---|---|---|
| GR-44 | Commissions | Single jobs ship with jewelry tiers 5 to 7. Bulk orders wait for the idle market | DECIDED (Fable 2026-11-21) |
| GR-50 | The market | Runs itself: standing orders, the Sell rule routes to them, the refill buys player stock. Order book and rare pieces first | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists |
| GR-51 | Prices | Every repeating price is hours of one wage curve the server computes, read on a hero of a mid-geared four. The House stays typed | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists |
| GR-54 | The yard's rate | Follows the skill curve, never past half of hunting, and the fee follows the rate. It re-opens 11-14 and two rulings of 11-20 | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists. Tyler said yes on the page 2026-11-21. It changes 2026-11-14, and 21-7 and A-5 of 2026-11-20, which he let stand on the page |
| GR-55 | When the market opens | Day one. It re-opens 24-7 | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists. Tyler said yes on the page 2026-11-21. It changes 24-7 of 2026-11-20, which he let stand on the page |
| GR-56a | Setup slots | Priced as ruled on 2026-11-05: three free, then 15,000 and 40,000 gold | RULED (Tyler, 2026-11-21, the sitting) |
| GR-66 | The risk reading | Free for everyone, never Premium | PROVISIONAL. Waits on the playtest or measurement its own row names. Tyler said yes on the page 2026-11-21 |
| MM-21 | Premium and the shared world | Everything is open to all. Premium banks arena tickets to 30. It does not make timed buffs last longer | DECIDED. Tyler said yes on the page 2026-11-21 |
| MM-22 | Where the slot gold goes | The slot gold follows the order of CE-4 in the first weeks. The castle is its long home. Boss and arena materials are a small home | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists |
| MM-27 | Boss and arena gear trades | Yes, like all gear | DECIDED (Fable 2026-11-21) |
| MM-43 | Test Crowns in the playtest | Yes, for the wiped Discord playtest only. The same amount for every account, one switch off by default and removed before Early Access, every grant journalled | DECIDED. Tyler said yes on the page 2026-11-21 |

**Safe to accept**

| Id | The call | The decision | Status |
|---|---|---|---|
| GR-46 | Salvage and the Shop | Salvage is a choice beside Sell with both numbers shown and a starting plan. The Shop keeps its ruled price | DECIDED (Fable 2026-11-21) |
| GR-52 | The store's healing | One gold-a-hit-point line with its top near 0.60. The simulated kit casts one rune tier under what its Magic allows, and a healer uses the cheapest water rune | DECIDED (Fable 2026-11-21) |
| GR-53 | The House dummy | It ends the yard fee. Rungs by skill band at 25 to 50 hours of the fee | DECIDED (Fable 2026-11-21) |
| GR-56b | The bench tax | It stays exactly as ruled, with no wage row. The screen may show it in hours | DECIDED (Fable 2026-11-21) |
| GR-57 | Spending while you sleep | A hunt budget, remembered for each ground and tier | DECIDED (Fable 2026-11-21) |
| GR-58 | The refill price | Set after the store bill is measured right | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists |
| GR-59a | The gauge | A daily line of gold made, destroyed and held | DECIDED (Fable 2026-11-21) |
| GR-59b | One laundering route | Remove the per-unit minimum on the stackable price ceiling | DECIDED (Fable 2026-11-21) |
| GR-84 | Small presses | The Premium claim needs no press. One noun, Setup, holds weapon, worn set, linings, bar and target mode for each ground. A Week card that pays nothing | PROVISIONAL. Waits on the playtest or measurement its own row names |
| GR-87 | Drops and sales | Drops in hours, and one sale formula for every tier | DECIDED (Fable 2026-11-21) |

**Superseded.** GR-60 ("Crowns come after the market") is replaced by MM-28 to MM-37.

---

**Cuts in this chapter.** KEPT, RULED at the sitting, cut list 14: the priced setup slots stay (GR-56a). KEPT (Tyler's pick on the page 2026-11-21), cut list 8: the farm's soil tiers and water button stay, so the built sink of 130,500 gold stays, re-read in account-days (GR-74, chapter 07).

## 5. Still missing

Decisions or designs nobody has made yet in this area.

| # | What is missing | Who answers | Note |
|---|---|---|---|
| 1 | **The first week's numbers.** Section 2.10 gives the order and the size bands. No hour value is set for any early price | Closed for the order (CE-4) and the size bands (CE-5, a HYPOTHESIS). Still owed: the gold numbers, typed once the wage formula (R15) exists | Decision book, "what the first week's gold is spent on". Needs the wage formula (R15) to exist first |
| 2 | **Early prices re-read for four heroes.** The first deed, bag rungs, Blessings under Level 30 and the first Tempering rungs, each as hours on the two-row rule of section 2.3 | Closed. CE-5 | Decision book, "early prices sized for an account of four" |
| 3 | **The Premium price, and the daily item across four heroes** | Closed for now. Tyler said yes on the page (PREM-1 and PREM-2): 30 days at 8 to 10 dollars a month as a number to react to, and one training item for each hero | Decision book |
| 4 | **The real-money price of a Crown, lot sizes, and the Crown price of each store row** | PREM-2 is PROVISIONAL, and Tyler said yes on the page. Still owed: the lot count and the Crown price of each store row. The game designer drafts them and the money stays Tyler's | Not in any source |
| 5 | **The boost catalog.** The rows, their sizes inside each timed cap, and how a 1 day and a 7 day boost combine with an earned buff that is already filling the cap | PROVISIONAL (MM-29 and MM-30, Tyler said yes on the page): two boosts sold for gold, damage +6% and protection of about 3%, in 1 day and 7 day sizes, one bought boost on a knob at a time. Still owed: their gold prices on the wage curve, by the game designer | Study 49 names the knobs and the caps, not the rows |
| 6 | **A price line for store runes and ammunition.** A party's store bill is runes and arrows, and no formula step owns their price. R14 covers healing only | Closed. GR-52: one price line each for store runes and ammunition, read on the wage curve, and the kit rule for fault F5 | Decision book, "which rune tier the simulated kit buys" |
| 7 | **The base hours of a stamina refill** | GR-58, after fault F5 closes | |
| 8 | **The Blessing share, and the ladder past the third Blessing** | GR-7 is RULED (Tyler 2026-11-21, the sitting). A rung past the third costs a fifth of the hours it saves (D-5) |
| 9 | **The wage for a four of mixed Levels.** Section 2.3 reads each hero's own Level for hero prices and the highest for account prices. The group share inside the wage for a mixed four follows the two thirds line (MM-19) and is not written | The game designer, after MM-19 | |
| 10 | **The castle's cost.** Section 2.6 gives TARGET sizes for the weekly share and a stage. Neither has a measurement, and the rooms and stages wait on MM-9 | MM-9 is RULED in direction at the sitting, the full castle. Still owed: the sizes of `castleStagePerMember` and `clanWeeklyShare`, and of upkeep and labor, by the game designer |
| 11 | **Whether the Level law is the clock of a plain four or a buffed one.** A payer at the ceiling levels 60% faster, and a fully buffed four 72% faster, so content computed to last 120 days on the table ends sooner for them | Closed. GR-6a: the plain four. One ceiling of 1.65 with every cap full, and about 1.22 from paying alone | Decision book |
| 12 | **Security questions on the Crowns book.** Whether gold paid for Crowns counts against the market's daily caps (it should). What a refund does to Premium time already used. The number of hold days. Steam's wallet rules for a currency players trade | The security engineer, then Tyler | Study 24 Q8 |
| 13 | **The daily caps against dear items.** A piece priced over the daily spend cap can never be bought. Either the caps rise with the buyer's Level or no ceiling may pass the cap | The security engineer | Study 24 Q9 |
| 14 | **The server gold model.** Gold created, destroyed and held a day by server age and population, as a tool. Bands G-11 and X14 have no reader without it | The balance tools lane | Study 50 X14 |
| 15 | **The player-facing name of the Crowns book** | Closed. MM-35: "Crown Exchange" | A genre-standard label, by the 11-14 rule |
| 16 | **Server cost of the market and the gauge.** Per-use spending is closed: the hourly journal carries it at about 3 rows a hunted hero-hour, and the whole account-day fits at 1,000 accounts (section 2.12) | The reliability engineer, with a fixture | Study 48 priced the account-day and not order matching or the gauge's roll-up |
| 17 | **A ceiling on gold find.** The stat adds with no cap in its formula. It is safe only while sources are few | The game designer, with the perk lane | Study 43, a HYPOTHESIS |
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
| G, the power budget | A mid-geared four with no buffs against a best-geared four with every cap full, at Levels 20, 60 and 110. TARGET: kill speed within 1.25 to 1.40, Level pace within 1.6 to 1.8, and no cell where the buffed four holds a tier the plain four cannot enter (this last clause fails by design on a cliff, `12-balance-pass.md` section 3.8, and is for Tyler, 12 section 7 item 4) | MM-25, MM-26, MM-31 |
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
| Are buffs earned as well as bought? Damage, damage taken and Level XP only | The same | Share of the timed cap filled by earned buffs and by bought boosts: both above a quarter |
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
| The market shut until a town goal is met | 24-7 | PROVISIONAL open on day one (GR-55, Tyler said yes on the page, reversal, let stand on the page). 24-7 stands until Tyler rules GR-55 |
| "Refocus the market on rare pieces and stop designing for bars and fish" | 46 | Kept as the order of work (rare pieces first), not as the whole design. Supplies trade through the refill with no window |
| "Crowns come after the market has something scarce to price" | GR-60, 55 row 3, 24 crowns card | Superseded by MM-28 to MM-37. Crowns buy Premium, looks and comfort and trade on their own book |
| Crowns never buy a boost of any kind. Crowns buy only Premium, looks, bound training items and a rename | 24 Q8 | MM-29 adds comfort for Crowns and two timed boosts sold for gold (section 2.8). PROVISIONAL. Tyler said yes on the page |
| Five clamps | 24-5 | MM-36 keeps the five and adds three: the boost catalog, no power rows in the store, the journal |
| The weekly Crowns cap sized to "about one Premium month and a few looks" | 24 Q8 | MM-33 sizes it to one account-week of gold, which is what makes the gold ceiling a number |
| "At most 2 times faster to best gear" | 50 call 11 as first written | Tyler ruled the alternative. MM-31 to MM-33 are the new proposal |
| Premium for each hero | Ruling of 10-17 | RULED 2026-11-21 and 24-3: one for each account |
| A drop chance boost sold in the Crowns store | 49 section 5.9, MM-29 as written | RULED 2026-11-20: Luck is bound so gold and Crowns cannot buy Magic Find. The drop row is earned only. Chapter 06 recommends the same |
| "More saved setups" and "more bag and storage" as Crowns comfort | 49 section 5.9 | Setups are a gold sink, three free and then priced (GR-56a, ruled at the sitting), and room is a gold sink (RULED 2026-10-22) |
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
| `48-platform-cost.md` | Landed, read in full | Section 2.12 |
