# 13. The market: the Weighhouse as the game's social and economic heart

2026-11-22, `lane/m-market-design`, from `set/v0.2.144`. Game designer. Docs only. It answers the owner's ask of 2026-11-22: "I eventually want our market to be as popular as the Grand Exchange!" Read `09-crafting.md` (sections 2.8, 4, 5), `02-architecture.md` (packages 2, 2b, 5, 7), `04-math-strategy.md` (sections 10, 11) and `10-premium.md` first. Every design call here is mine and final. Every number is a starting value for the Balance Lab. Section 6 judges the owner's storefront idea, which the Coordinator passed on mid-lane.

**Labels.** SOURCE is a public page or a repo file. COMPUTED is arithmetic on named inputs. MEASURED is a real run, with its file. JUDGMENT is a design opinion. ASSUMED is a guess the number rests on. FROM MEMORY is study I did not re-read today. Another game's mechanics are used, never its names, screens or text (`CLAUDE.md` section 10).

**What exists today, and why this page does not inherit it.** The staged market (`supabase/migrations/2027-01-12-market-account.sql` and its follow-ups) is a storefront: sell listings only (buy offers were dropped by that file), keyed by `item_id`, a 1% listing fee and a 4% cut burned, per-account daily caps, a shop-bid floor and a ceiling, anonymity, a same-network flag, a Level-or-bench gate. Its tables are `market_listings` (the escrow), `market_sales` (append-only receipts with a conservation check) and `market_item_daily` (per item, per day). This page keeps its engineering: escrow as a debit under lock, the locked row as arbiter, the idempotency block, the lock order, the conservation constraint, anonymity, the same-network flag. It replaces the shape: one order book with buy and sell orders, keyed by kind, band and quality, plus single pieces.

---

## 0. One screen

**How it plays:** your plan buys what your heroes burn and sells what they drop, all day, through one book at the Weighhouse, while you are away. When you open the window you see what everything is worth, what sold, and who just sold a Very Rare for a fortune.

- **One book for the realm, buy and sell orders, matched by the server the moment they cross.** Nobody needs a counterparty online. That is the Grand Exchange's real secret, and the storefront we have staged lacks it.
- **The plan is the trader.** Stock rules become standing buy orders, loot rules become standing sell orders. A player sets them once. This is the first principle doing the market's job: in a semi-idle game the market is busiest when nobody is watching.
- **Stacks trade on the book. Trait pieces trade one by one, with wanted orders.** A buyer can post "any Rare ring with this Trait at rank 2 or better, up to this price" and it fills the moment a matching piece is listed. No other exchange I studied does this well for unique items. It is our answer to "unique gear kills liquidity".
- **Every hunted hour has something to sell and something to buy.** Remains to drop chasers, parts to alchemists and artificers, scrap to smiths, Trait pieces to other heroes. Kit, tools, remains and Temper kits come back.
- **The price guide is the server's, and everyone trusts it.** A clean median of real fills, washed of same-network trades, damped against pumps. The hunt card shows what an hour's drops sell for.
- **Fees are small and burned.** A 4% cut on sales, a 1% fee on what rests on the book. The market's own fees burn under 1% of the coin minted (section 2.6). Its job in the sink budget is to carry gold to the real sinks, and it says so plainly.
- **Cornering and RMT are bounded by rules, not watched by hand.** Buy limits per 4 hour window in hunted hours, price bands on the catalogue value, a proceeds cap that holds big payouts and releases them, and the sanctioned Crowns book that undercuts gold sellers.
- **The social moment is designed in.** Big sales are told in town. Signature sales always are. Flippers are a playstyle with a record of their own.
- **Server cost: about 2 database-seconds an account-day.** Matching happens inside the order's own write, never on a timer (section 3.5).

---

## 1. What makes a player-run exchange popular

**How it plays:** a market is popular when a player can always buy or sell right now, at a price they believe, without anyone else online. Everything else follows from that.

### 1.1 Four markets, mechanics only

| Market | Mechanic | Why it works there | Ours? |
|---|---|---|---|
| **Grand Exchange** (OSRS) | One exchange for the whole game. Buy and sell offers matched by the server. Offers persist offline. SOURCE: <https://oldschool.runescape.wiki/w/Grand_Exchange> | Liquidity. You never wait for a person. One place means every player's goods meet every player's coin | **Yes.** One book, buy and sell orders, matched on arrival |
| | A trade fills at the price of the offer that was there first. The newcomer gets the better side (FROM MEMORY, consistent with the wiki's examples) | Placing an offer far through the book is safe. "Insta-buy" and "insta-sell" become a way to read the margin | **Yes.** The resting order's price |
| | Buy limits a 4 hour window for each item. SOURCE: <https://oldschool.runescape.wiki/w/Grand_Exchange/Buying_limits> | One rich buyer cannot take a whole good off the market | **Yes,** in hunted hours of supply |
| | A 2% tax on sales, capped per item, with low-value items exempt (SOURCE as above) | A sink that scales with trade and barely touches small trades | **Yes, as a share.** No cap (section 2.6) |
| | A guide price everyone quotes, with history. Fan price sites grew around it (FROM MEMORY) | "What is it worth on the exchange" becomes how players talk about value. Items become investments | **Yes.** The server's guide, with a line |
| | Merching and flipping as a known playstyle (FROM MEMORY) | Flippers are the market makers. They shrink the spread for everyone else | **Yes,** bounded by limits and the tax |
| | A physical building where players stand and talk (FROM MEMORY) | The exchange is a place, not a menu. The busiest spot in the world | **Yes.** The Weighhouse on the town square |
| **EVE regional markets** | Buy orders with a range: this station, these systems, the region (FROM MEMORY) | A buyer accepts goods from a wider area and so gets filled sooner | **Yes, as a band range.** A buy order accepts up to three neighboring bands |
| | Broker fee to place, sales tax on fill, both reduced by skills (FROM MEMORY) | Two fees with two jobs: one on waiting, one on selling | **Yes, two fees.** No skill discounts. A Premium half-fee on placing only |
| | 0.01 undercut wars led to a modification fee and price tick rules (FROM MEMORY) | Without them the best-priced seller is whoever clicks last, which is a chore | **Yes.** Prices tick at three significant figures, and a price change is a new order with a new fee |
| | Regional split markets that make hauling a profession | Distance is content there | **No.** No travel risk here, and a split book thins a thin market (`09` section 0.1) |
| **Albion markets** | Buy and sell orders in each city, a setup fee and a sales tax, Premium halves the tax (FROM MEMORY) | Crafters and gatherers trade every session. Everything is player-made | **Orders yes. A Premium tax cut, no.** `10-premium.md` refused it |
| | Local markets and city specialties | Price gaps between cities reward hauling | **No.** One book. The castle takes "a place with a specialty" (`09` section 3.5) |
| | An NPC market that buys gear to feed loot to PvE (FROM MEMORY) | A sink for crafted goods with no gold minted to players directly | **Not as a buyer of gear.** Our store floor and town orders do the safety-valve job (`09` sections 3.6, 4.6) |
| **FFXIV market board** | Sell listings only, held by retainers while the player is offline, a small tax, the last sales shown (FROM MEMORY) | Offline selling, and a clear history of what sold | **History yes.** Sell-only, no |
| | No buy orders, so sellers undercut by one coin and re-check by hand (FROM MEMORY) | It works, and it is a daily chore | **The lesson.** A market without buy orders makes players repeat a decision. The first principle forbids it |
| | Cross-world shopping pooled liquidity (FROM MEMORY) | More sellers per good means fills | **Yes.** One book across every town shard of a realm |

### 1.2 The ten things that make one popular, and what we do with each

| # | What players feel | The mechanic | Ours |
|---|---|---|---|
| 1 | "I can always sell this" | Buy orders that rest, filled while the buyer sleeps | Standing buy orders from every company's plan (2.5) |
| 2 | "I can always get this" | Sell orders that rest, and a store ceiling for the basics | Standing sell orders, store basics as the ceiling (`09` 2.5) |
| 3 | "Right now" | Matching on arrival | Matched inside the order's own write (2.2) |
| 4 | "I trust the price" | A guide nobody can pump | Clean median, damped, labelled when trades are few (2.8) |
| 5 | "Nobody can corner it" | Buy limits | Per 4 hour window, in hunted hours (2.7) |
| 6 | "I trade while away" | Offline orders and automatic payout | Proceeds to the purse, goods to Storage, the return card reports (2.5) |
| 7 | "I can find it" | One search, and a reason to look | Search, "what my plan needs", "what sells", drop values on the hunt card (2.11) |
| 8 | "Something happened" | Big trades seen by the world | Town lines for big sales, always for Signatures (2.10) |
| 9 | "I can play the market" | Flipping with a margin | Allowed, with a record of its own (2.10) |
| 10 | "Everything I drop is worth something" | A floor under every good | Store floor inside its budget, town orders, the flame (`09` 5.5) |

**The one thing we add.** Unique items are where every exchange is weakest: the Grand Exchange will not take them at all (FROM MEMORY), and every board that does is a list of asks. Our gear is built on Traits, so the chase lives in unique pieces. Wanted orders (2.3) give pieces what buy offers give stacks.

---

## 2. Our design

### 2.1 The Weighhouse

**How it plays:** one building on every town square, one book behind all of them. Your heroes are seen at its counters when they trade.

- **The name stays the Weighhouse.** It is the market's player-facing name today (`src/data/alerts.js`, `src/data/hunt-tutorial.js`), it is a plain English word for a place where goods were weighed for trade, and it is ours. `09` section 3.6's town orders are posted at the same building and are called **town orders**. One place, two counters: the exchange, and the board of what the town wants.
- **One book for the realm.** Every town shard of a realm reads and writes the same book. A second realm, if it ever exists, has its own.
- **It is a place.** A hero whose plan just traded walks to the Weighhouse counter in town (a look, with no time cost), and the square's board shows the day's big sales.
- **Open from the first hunt.** No Level gate. The caps are counted in hours of wage at the account's own step, so a fresh account can trade normally and can funnel almost nothing (2.7). The box price is the bot defense (`10-premium.md` section 5).

### 2.2 Orders and the matching rule

**How it plays:** say what you want and the most you will pay, or what you have and the least you will take. If someone already agrees, it trades at once. If not, your order waits on the book until someone does, or until it expires.

**Two order types, two flags.**

| | Buy order | Sell order |
|---|---|---|
| Names | A kind, a quality floor, a band range of up to three neighboring bands, a count, a limit price each | A kind, one band, one quality, a count, an ask each. For a piece, the piece |
| Escrow | Gold: limit x count, debited from the purse at placement | Goods: debited from the bag or Storage at placement |
| Flag `now` | Fill what crosses, cancel the rest. No listing fee | Same |
| Flag `rest` (default) | Fill what crosses, the rest waits on the book | Same |

**The matching rule.**

1. **On arrival.** An order is matched inside the same transaction that places it, against the opposite side of its key. There is no matcher on a timer.
2. **Price, then quality, then time.** A buy order takes the lowest ask first. Among equal asks, the higher item step (band and quality, `09` section 4.4) first. Among equal steps, the oldest. A sell order takes the highest limit first, then the oldest.
3. **The resting price.** A fill trades at the price of the order that was already on the book. The arriving side keeps the difference: a buyer whose limit was above the ask gets the change back from escrow, a seller whose ask was below a resting bid gets the bid.
4. **Partial fills.** An order fills unit by unit across as many counter-orders as it needs, and the rest rests or cancels by its flag.
5. **Price tick.** Prices are whole gold with at most three significant figures (1,230 and 1,240, never 1,231). A one-coin undercut cannot exist.
6. **A change of price is a new order.** The old one is cancelled, the new one pays its listing fee on what rests. So repricing has a cost and the book is not a clicking race.
7. **Never with yourself.** An order never fills against an order of the same account. A fill between two accounts that share a network is allowed and flagged (section 3.4).
8. **Life.** An order rests `orderLifeH` hours (start 168, 336 with Premium), then the expiry sweep returns its escrow: gold to the purse, goods to Storage.

**One-press buying and selling.** The window's "Buy now" places a `now` buy at the best ask plus `nowSlip` (start 5%), capped at the guide's band, and shows the total before the press. "Sell now" mirrors it. That is the insta-buy and insta-sell that flippers use to read a margin.

**Why a band range on buy orders.** A meal 20 steps behind its eater restores 93% as much (`09` section 4.2), so neighboring bands are near substitutes. Letting one buy order take three bands triples the sellers it can meet. This is the "orders match across neighbors" fix that `09` section 5.8 item 7 holds in reserve, built in from the start because band markets are the thin-market risk at 1,000 accounts.

### 2.3 What trades, and how: stacks and single pieces

**How it plays:** a meal is a meal, so meals stack and trade on the book. A ring with a Trait is that ring, so it trades as itself, and buyers can post exactly what they are hunting for.

**The market key for stacks** is (kind, band, quality), the same key as the stack in Storage (`09` section 6). Everything that stacks trades this way: meals, drinks, charges, draughts, imbuements, tools, refined goods, gathered goods, common and rare parts, remains, scrap, seed stock, plain gear, patterns. A Plain, Fine or Master good of one band is three keys. The guide is kept per key.

**Single pieces** are the gear with a Trait: Rare, Very Rare and Signature. Each is one server row (`02` section 2). A piece is listed as a sell order of count one that names the piece. The buyer sees the base, tier, Trait or Traits with rank, Signature, where it was found and at what depth, and the comparables guide (2.8).

**Wanted orders: buy orders for pieces.** A wanted order names criteria and a limit:

| Criterion | Choices |
|---|---|
| Slot | One slot |
| Base | Any base in the slot, or one base |
| Tier | A lowest and a highest tier |
| Trait | Up to three Traits, any of which will do |
| Rank | A lowest rank |
| Rarity | Rare or better, Very Rare, or one Signature |

It escrows its limit in gold. When a piece is listed, the server checks resting wanted orders that the piece meets and fills the one with the highest limit, oldest first, at the wanted order's price (the resting price, rule 3). When a wanted order is placed, it takes the cheapest listed piece that meets it. A piece listed with no match rests as an ask.

**What travels with a sold piece, and what does not.** (JUDGMENT, ruled here, owed to lane G in section 8.)

| Part | Travels? | Why |
|---|---|---|
| Base, Traits and ranks, Signature, the find line ("Muster Barrows, depth 14") | Yes | That is the piece |
| The finder's company name on the find line | If the finder's plan allows it, on by default | A great find carries its story. A player can turn it off |
| Temper | **No.** It belongs to the hero's slot and is seated on whatever the hero wears (`09` 2.4's carry rule) | A sold piece is priced as itself, and Temper stays a company's own investment |
| Imbuement | **No.** It sits on the hero's slot, as Temper does, never on the piece (`21` D-20), so a listed piece carries none | Comparables stay clean. An imbuement is the kit of one company's ground choice |

**What never trades.** Anything bought with Crowns, the store's basics (never items), Crowns tools, and the escrowed copy of anything. Crowns trade only on the Crowns book (`10-premium.md` section 4), which runs on this engine with its own key and rules (section 5).

### 2.4 Remains for the flame

**How it plays:** your plan burns your own remains until the flame is as tall as its room allows and sells the rest. A company chasing drops keeps a standing order for fuel and its flame stays full while it hunts.

- **Common remains are one good a band.** Bones, Big Bones, Bone Chips and Grave Dust (today's commons on Muster Barrows, `src/data/grounds/muster_barrows/pack.js`) keep their names and looks on the drop line, but for the market, the flame and Runecutting they are one good, "Remains", graded by band. Four kinds per band would split one deep market into four thin ones for no decision. (JUDGMENT. Section 8 lists the edit owed to `02` 2b and `09`, whose binder becomes Remains.)
- **Named fuels stay separate.** A named fuel is a rare drop with its own row, its own key and a single burst. It trades like any rare stack.
- **The stoke rule writes the orders.** Set once in the plan: keep the flame at a height, burn own remains first, buy up to N band-steps of fuel a day at no more than a price, sell what is left at the going price or hold it. The server turns it into one standing buy order and one standing sell order for remains.
- **The bounds are the flame's own.** The room caps what any fuel does, and Flame Level grows only while the company hunts (`02` section 2b). The market adds a buy limit per 4 hour window (2.7) so one chaser cannot take a band's whole supply.
- **Two sinks in one trade.** The seller pays the cut, which burns gold. The flame burns the goods.

### 2.5 Offline and async trading

**How it plays:** you never sit and trade. The plan places, renews and reprices your orders at the moments the server already settles your company, and the return card tells you what happened.

| Plan rule (set once) | The orders the server keeps |
|---|---|
| Stock rule: "keep 24 hunted hours of meals for each hero, buy at no more than 1.2 x guide" (`09` section 3.4) | One buy order for each kit kind, for the company, with the band range read from its heroes' steps and the count to reach the target |
| Loot rule: "sell remains past the flame's room", "sell parts I do not use", "sell Trait pieces no hero would wear, at the comparables guide" | One sell order for each stack key, one for each piece |
| Stoke rule (2.4) | Fuel buy and remains sell |
| Tool spares (`09` section 3.7) | One buy order for each trade's tool |
| Wanted: "a ring with this Trait at rank 2 or better, up to this" | A wanted order, renewed when it expires |

**When the plan reconciles.** At points the server already writes: a hunt settle that changes stock, a town job's end, a fill, an expiry, and the player's own press. Never on a timer of its own. A reconcile changes an order only when its count or price would move by more than `reconcileStep` (start 10%), so the book is not churned.

**Relative prices with an absolute cap.** Plan prices are written relative to the guide ("guide minus 5%") and resolved when the order is placed. Every relative rule also holds an absolute cap in hours of wage, so a pumped guide cannot make a sleeping company overpay (section 3.4).

**Where things land.** Proceeds go straight to the account purse at fill time. Bought goods go to Storage, and the stock rule moves them to the heroes. Nothing waits to be collected.

**What the player sees.** The return card's market line: "Sold 340 Remains for 41,800. Bought 96 hours of meals for 30,200. Your wanted ring is still waiting." Each line opens the order.

### 2.6 The tax and the other sinks, sized with the wage

**How it plays:** you pay a little to leave an order waiting and a little more when something of yours sells. Both are burned.

| Fee | Size | Paid by | When |
|---|---|---|---|
| **Cut** | `cut` 4% of the gold of each fill (band 2 to 8%) | The seller, from proceeds | Every fill |
| **Listing fee** | `listFee` 1% of the part of an order that rests after its first match (0.5% with Premium), never below `listFeeMin` = 0.01 hours of wage at the order's band step | Whoever places a resting order | Once, at placement. Not refunded |
| **Nothing** | No fee on a `now` order or on the part of an order that fills on arrival | | |

**Why these shapes.** The cut scales with prices, and prices climb with the band at the rate of the wage (`09` section 4.2), so it needs no table by Level. The minimum listing fee is the one number written in hours of wage, so a spam of tiny orders costs the same at Level 20 and Level 2,000. No cap on the cut: a cap makes the richest trades the cheapest, and they are the ones a gold sink should touch.

**What the market burns, honestly.** One account on the mix, 24 hunted hero-hours a day, in hours of wage (inputs ASSUMED unless marked):

| Turnover a day | Hours of wage | Basis |
|---|---|---|
| Kit bought from other players | 1.44 | `09` 5.6: kit 0.2 an hour, 60% on crafted, half bought (COMPUTED on `09`'s inputs) |
| Tools | 0.22 | Half of `09` 3.7's 0.44 |
| Remains to drop chasers | 0.20 | A third of companies chase, buying a third of a full flame, remains worth 0.05 an hunted hour (ASSUMED) |
| Rare parts, Temper kits, scrap | 0.30 | ASSUMED |
| Trait pieces | 1.50 | 0.6 pieces a day (`09` 5.6's one per 40 hunted hours), half sold, at 5 hours of wage on average (ASSUMED) |
| **All** | **3.66** | |
| Cut at 4% | 0.15 | COMPUTED |
| Listing fees | 0.02 | Half the turnover rests, at 1% |
| **Burned** | **0.17, about 0.7% of the 24 minted** | COMPUTED |

**The finding.** The market's own fees cannot be a large sink at any tax players would accept. At 8% it is 1.4%. Every exchange I studied is the same. The market's work in the gold ledger is to carry gold to the sinks that do burn: the store's basics, job fees, Temper, carry-over, hall upkeep, bought hours and the Crowns book's fee (`09` 5.6, `04` 11). A company that sells remains for gold and spends it on a Temper rank has moved gold from a hunter to a sink through the market. So `sinkOverFaucet` counts the market's fees as a small line, and the Lab reads the market's real effect as **the share of minted gold that reaches a sink within 30 days** (section 4.2).

**Refused.** An item sink paid from the tax (the tax gold buys goods and deletes them). It recycles gold to sellers instead of burning it, and the redesign is short of gold sinks, not goods sinks: town orders and the flame already take surplus goods.

### 2.7 Buy limits and caps

**How it plays:** you can always buy what your heroes burn. You cannot buy a whole band's worth of anything.

| Limit | Size | What it stops |
|---|---|---|
| **Kit buy limit** | `buyLimitKit` 24 kit-hours of one kind and band, a 4 hour window, for the account | Cornering a band's meals, charges or draughts. An account of four burns at most about 11 kit-hours a window on a 16 hour day, so the limit is twice its need. At 1,000 accounts a band trades about 2,400 kit-hours a day, so one account can take at most 6% of it (COMPUTED on `09` 5.2, ten bands) |
| **Stream buy limit** | `buyLimitDrop` 48 hour-units of one stack key, a 4 hour window | Cornering remains, parts or scrap. 48 is what four heroes drop in 12 hours |
| **Pieces** | No count limit | They are unique. The proceeds cap and the piece price band bound them |
| **Order slots** | `orderSlots` 20 open orders (60 with Premium). Plan orders count | Book spam. A company's whole plan fits in about 10 to 16 |
| **Price band, stacks** | Every order between `bandLow` 0.25 and `bandHigh` 4 times the key's catalogue value V | Junk sold for a fortune, which is the RMT funnel's shape. For goods the store sells, the store's ask is the real ceiling anyway |
| **Price band, pieces** | Between 0.25 and `pieceHigh` 10 times the piece's catalogue value (section 3.2) | The same, with room for a great roll at ten times an average one |
| **Proceeds cap** | `proceedsCap` 60 hours of wage at the account's highest hero step a day, plus 1 for every 10 hunted hero-hours the account has ever hunted, up to 300 | A gold funnel into a fresh account. Proceeds past the cap are **held, not refused**, and released at the cap's rate on the next days. The return card says so |
| **Rate** | 60 writes and 120 reads a minute for an account (today's buckets) | Bots hammering the book |

**Why hold and not refuse.** A real player who finds a Very Rare worth 200 hours of wage must be able to sell it today. A gold seller who needs to move 2,000 hours into a buyer's account must wait weeks, in the open, with every held sale journalled. Holding is the difference between a rule that slows abuse and one that blocks the game's best moment.

### 2.8 The price guide

**How it plays:** every good shows a going price you can trust, a line of the last 30 days, and how many trades it rests on.

- **Stacks: the going price** of a key is the volume-weighted median price of the last 7 days' clean fills (section 3.4 removes flagged fills). It needs at least `guideMinFills` 5 fills from at least 3 different sellers. With fewer, it blends toward the catalogue value V and says "few trades".
- **Damped.** The published going price moves at most `guideStep` 10% a day. A pump has to hold for a week to move it 90%, in plain sight, paying the cut on every wash.
- **Pieces: the comparables guide** for (slot, tier, Trait, rank, rarity) is the median of the last 30 days' clean fills, shown as "from N sales". With none it says "no recent sales" and shows V.
- **What it anchors and what it never anchors.** The going price anchors the plan's relative prices and "Buy now". It never anchors a fee, a limit or a price band. Those read V, the server's catalogue value, which no player can move (`09` section 4.3).
- **The line.** 30 days for everyone, free. 1 year with Premium's company ledger (2.9).
- **Where it shows.** The window, the bag (a stack's worth at the going price), the hunt card ("an hour here drops about 3,100 at going prices"), the return card, the bestiary's Trait pool page (what each Trait sells for), and the Crowns book's gold price beside every Crowns price.

### 2.9 What the Premium market seat adds

**How it plays:** a trader with Premium keeps more orders open for longer and pays half to leave them waiting. Everyone sells at the same cut, and everyone gets every rule.

| | Free | Premium |
|---|---|---|
| Open orders | 20 | 60 |
| Order life | 7 days | 14 days |
| Listing fee | 1% | 0.5% |
| Cut on sales | 4% | 4% |
| Price line | 30 days | 1 year, plus the company's own trade history 90 days (`10-premium.md` section 2, row 3) |
| Plan rules, wanted orders, one-press buy and sell, buy limits, proceeds cap | All | The same |

**Pay-to-win check.** Nothing here changes a fill's price, a limit, a cap or who fills first. A free company's whole plan fits in 20 orders. The seat helps a flipper keep more orders out, and the identical proceeds cap bounds what that earns. The saving is the listing fee on resting orders, about 0.01 hours of wage an account-day on the mix (COMPUTED: half of 0.02). It sells convenience to traders, as `10-premium.md` intends. (JUDGMENT: mild, the same verdict as `10`.)

### 2.10 The social moment and flipping

**How it plays:** when someone sells a Signature, the whole town hears it. When you have bought low and sold high all week, the Weighhouse remembers.

- **Big sales are told in town.** A fill above `bigSale` 20 hours of wage at the item's band step gets a line on the square's board and in the town's chat: "A Very Rare ring with two Traits sold at the Weighhouse for 412,000." (Example only. Item and Trait names come from lane G.) The seller's company name shows if the seller's plan allows it (on by default). The buyer stays anonymous unless they choose. Signature sales are always told, whatever the price.
- **A shareable card** for a Signature sale or a Very Rare, the same card as the drop moment (`02` section 2), with "sold for".
- **The day's board** at the Weighhouse: the five biggest sales, the five biggest movers, the most traded good. Read once a day from the daily rows, not live.
- **Flipping is a playstyle.** Buying under the going price and selling over it is allowed and useful: flippers are the standing orders that make every "Sell now" fill. The cut (4%) means a flip pays only when the spread is wider than about 4%, so flippers narrow wide spreads and leave narrow ones alone. The buy limits and the proceeds cap stop one flipper from owning a good.
- **The trader's record.** The company's market record in the hall: gold traded, best sale, goods supplied to other companies. A ladder "most goods supplied" ranks companies inside Level bands (`02` package 7), counted in hours of wage of goods sold to other accounts, with flagged fills left out.
- **Reserved orders.** A sell order can be reserved for one named account or for the clan. Same fees, caps and journal. That is "list for a friend", and it means no second trade window exists outside the book.

### 2.11 How it plugs into hunting, crafting, the flame and Traits

**How it plays:** every hunted hour leaves something to sell, and every hunted hour burns something you can buy.

| A hunted hour makes | Who buys it on the book | A hunted hour burns | Who sells it |
|---|---|---|---|
| Coin | (it pays for everything on the right) | Meals and drinks | Cooks |
| Common parts by creature family | Alchemists, for draughts wanted on another ground | Charges: honing stones, arrows, runes, ward charms | Smiths, woodcrafters, runecutters |
| Rare parts | Artificers, for imbuements, jewelry, carry-over | Draughts | Alchemists |
| Remains | Drop chasers, for the flame. Runecutters, as binder | Imbuements, every 20 hunted hours | Artificers |
| Plain gear, and scrap after salvage | Smiths, for Temper kits | Tools, one every 12 work-hours | Smiths with woodcrafters' hafts |
| Trait pieces | Heroes who want that rule on that slot | Temper kits, a share at each tier | Smiths |
| Seed stock | Farmers | Remains past own drops, when chasing | Hunters who level or earn |

**Discovery in the window.** Four views, in this order: **My plan** (what the plan is buying and selling, and what is short), **Search** (any kind, any band, any Trait), **What sells** (the most traded and the biggest movers in the company's bands), **Wanted** (resting wanted orders the company's Storage could fill right now: "3 buyers want a piece you hold"). The last is the one no other exchange has, and it turns a forgotten piece in Storage into a sale.

**On the hunt card.** "Drops about 3,100 an hour at going prices" beside the coin, so "gold or levels tonight" includes what the drops are worth. A ground whose parts are in demand shows it.

### 2.12 Walk-through: a company's first trades

Against today's data where a name exists, and against this design where it is new. Each step uses only what the company holds from earlier steps.

| Step | The company does | It holds, from earlier steps | Doable because | Exists today? |
|---|---|---|---|---|
| 1 | Hunts Muster Barrows on Steady | A four and a plan | `muster_barrows` is the scale ground (`src/data/danger.js` `DANGER_GROUNDS`) | Yes (client half in R1) |
| 2 | Drops Bones, Big Bones, Bone Chips, Grave Dust, and now and then a Coffin Nail | Nothing needed | The pack's drop rows (`src/data/grounds/muster_barrows/pack.js` lines 135 to 172, `coffin_nail` at line 188) | Yes. As one good, "Remains" of band 29, it is new (2.4) |
| 3 | The default stoke rule burns its own Remains to the flame's room. The default loot rule lists the rest at the going price | Remains from step 2 | The default plan ships with both rules on. A new player never opens the window to sell | New, wave 4 (book) with wave 3's flame |
| 4 | A drop chaser's standing fuel order fills step 3's order. If none rests, the order waits, and the store floor bids inside `storeBudget` | A resting sell order | Matching on arrival (2.2). The store floor (`09` 4.6) | New, wave 4. Store floor wave 5 |
| 5 | Gold lands in the purse. The return card says "Sold 340 Remains for 41,800" | Proceeds from step 4 | Proceeds to the purse at fill (2.5) | New, wave 4 |
| 6 | The Coffin Nail (an imbuement item today, `imbue: { kind: 'ward', tier: 2 }`) is listed as a rare part, or kept by an Artificing company | The nail from step 2 | The loot rule "sell parts I do not use" | Item yes. Its market key and the rule, wave 4 |
| 7 | A Rare pair of Rune Boots with a Trait drops. No hero would wear it, so the plan lists it at the comparables guide, and a resting wanted order for that Trait fills it at once | The piece from the hunt | `rune_boots` is a scarce drop on the pack (line 136). Traits on it are wave 4 | Base yes. Trait and wanted order, wave 4 |
| 8 | With step 5's and 7's gold, the stock rule's buy order takes Plain meals of band 28 to 29 from a cook | Gold from steps 5 and 7 | A band-range buy order (2.2) | New, wave 5 (crafted goods carry bands) |

**What this proves.** A new company sells from its first hunt without opening the window, and the first moment it meets the market by choice is a return card line with gold in it. Steps 3 to 7 need only wave 4. Step 8 needs wave 5. Step 4 has a known gap before wave 5: with no buyer and no store floor, an order rests. That is acceptable, because the order keeps the goods safe in escrow and the card says "listed, waiting".

---

## 3. Server shape

**How it plays:** players never see this section. It is how the server keeps every trade honest, every coin journalled, and the book cheap enough to run for 10,000 accounts.

Every rule of `CLAUDE.md` section 1 holds: the server owns the catalogue, the clock, the clamps, the matching and the ledger. The client sends intents. No client value that crosses to another player (a price, a count, a name, a time) is trusted beyond the bounds the server checks against V.

### 3.1 Tables

| Table | One row is | Notes |
|---|---|---|
| `market_orders` | One resting order: id, account, side, kind or piece id, band (or band range for buys), quality (or floor), count left, count placed, price each, escrow held, fee paid, flags, placed at, expires at, plan rule id or null, reserved-for or null | Replaces `market_listings`. Immutable but for count (falls) and expiry (earlier), the trigger pattern of today's file. Indexes: (key, side, price, placed at) for matching; (account); (expires at) |
| `market_wanted` | The criteria of a wanted order, one row for each wanted `market_orders` row | Indexed by (slot, Trait) so a newly listed piece finds its wanted orders in one lookup |
| `market_fills` | One fill: buy order, sell order, both accounts, key or piece, count, price each, gross, cut, net, same-network flag, at | Append-only. `gross = net + cut` as a constraint, as `market_sales` has it today. No client role reads it |
| `market_key_daily` | One row a key and day: fills, units, gross, low, high, clean median inputs | Written in the fill's own transaction. The guide and the line read it, never the fills |
| `market_guide` | The published going price for each key, and the comparables guide for each piece class | Recomputed once a day by a cron step from `market_key_daily`, damped by `guideStep` |
| `market_held` | Proceeds held past the cap: account, amount, release schedule | Released by the daily cron, each release a ledger row |
| `market_counters` | For each account: buy-limit windows by key, proceeds today, held total | Read and written under the account lock |
| The catalogue | V for every key and every piece class, generated from the levers and the wage (section 3.2) | Server-owned. A key the catalogue does not know is refused |

Every movement of gold or goods also writes a `player_ledger` row with its reason: `market_escrow`, `market_fill_in`, `market_fill_out`, `market_cut`, `market_list_fee`, `market_refund`, `market_hold`, `market_release`, `market_expire`. Gold minted by the market is always zero, as today.

### 3.2 The catalogue value V

The one anchor for fees, bands, limits and the guide's fallback. Lane W owns the wage. This page needs, from the server and from `src/core` as one pure function:

```
crafted good     V = work-hours in the good x townWageShare x wage(band step) x quality factor     (09 section 4.3)
hunting stream   V = streamShare[stream] x wage(band step), for one hour-unit                     (new: remains, common parts, rare parts, scrap)
piece            V = pieceShare x rarityHours[rarity] x wage(item step) x (1 + traitRankValue x (rank - 1))
```

`rarityHours` is the authored "one in about N hunted hours" of `04` section 11. With `pieceShare` 0.1 a Rare found once in 40 hunted hours has V of 4 hours of wage, a Very Rare once in 400 has 40. The streams' shares are new levers for lane W (section 8).

### 3.3 RPCs

All `SECURITY DEFINER`, all behind the engine's identity seam, all idempotent on an intent id (the replay pre-check, claim under the lock, release on conflict), all answering the envelope plus a receipt.

| RPC | Does |
|---|---|
| `hr_market_order(intent, side, key or piece, band or range, quality, count, price, flags, reserved_for)` | Checks the key, the bands, the price band against V, the slots, the buy limit, the purse or the stock. Escrows. Matches on arrival, rule by rule (2.2). Writes fills, ledger rows, daily rows, counters. Charges the listing fee on what rests |
| `hr_market_wanted(intent, criteria, price)` | Places a wanted order and matches it against listed pieces |
| `hr_market_cancel(intent, order)` | Returns escrow. No fee back |
| `hr_market_plan_reconcile(account)` | Called by the settle points of 2.5, never by the client. Turns plan rules into order changes past `reconcileStep` |
| `hr_market_browse`, `hr_market_key`, `hr_market_mine`, `hr_market_wanted_fillable` | Reads: the depth by price (aggregated, no accounts), the guide and line, own orders, wanted orders the account could fill |
| `hr_market_expire(limit)` | Cron, every 5 minutes, skip-locked, returns escrow |
| `hr_market_guide_daily()` | Cron, daily: guide, board, held releases |

**Lock order** (today's file's order, extended): rate counter, the acting hero if a bag is touched, the account's Storage lock, the account's market counters, the counter-orders `FOR UPDATE SKIP LOCKED` in price order, the daily row, then the purses in account order, last. A counter-order skipped because it is locked is simply not matched this time. Nothing waits on another account's hunt.

### 3.4 Anti-manipulation and the RMT stance

| Threat | Rule |
|---|---|
| **Wash trades print a price** | A fill between accounts that shared a network in the last 30 days is flagged (today's `market-same-network` pattern) and left out of the guide, the board, the big-sale line and the ladder. Self-fills are refused |
| **Pumping the guide** | A median of 7 days, at least 3 sellers, moving at most 10% a day. Plan prices relative to the guide carry an absolute cap in hours of wage |
| **Spoofing with orders** | The guide reads fills, never orders. A price change is a new order with a new fee |
| **Cornering** | Buy limits per 4 hour window, stated in hunted hours (2.7). The store's basics cap kit prices. Lab agent check (4.3) |
| **Junk for a fortune (RMT into an account)** | Price bands on V. The proceeds cap holds the excess and releases it slowly, in the journal |
| **Treasure for nothing (RMT out of an account)** | A fill under half the guide is flagged for review. Rules cannot stop an item given away. The stance is detection, a ban that costs a box, and a sanctioned route that is cheaper than a gold seller: the Crowns book |
| **Alt funnels** | Caps in hours of wage at the account's own step, so a Level 1 alt can move almost nothing. The proceeds ladder grows with real hunted hours |
| **Duplication** | Escrow is a debit under the source's lock, the locked order row is the arbiter, every fill conserves gross = net + cut by constraint, and the idempotency block makes a replayed intent return the stored answer |
| **Front-running** | No order is shown before it rests. The depth view aggregates by price and names nobody |

**The RMT stance in one line.** Make the legal route easy (the Crowns book), make the illegal route slow and visible (bands, holds, flags), and make each banned account cost money (the box). No game in study 49 stopped RMT with rules alone, and none should be promised here.

### 3.5 Cost at 1,000 and 10,000 accounts

Inputs: a press costs 107 ms on production, 71 with changed sections only (REAL, `docs/design/balance-program/48-platform-cost.md` section 1). The budget is 60 database-seconds an account-day at 1,000 accounts and 24 at 10,000 (`48`).

| An account-day | Count | Each | Seconds |
|---|---|---|---|
| Order writes with their fills (plan reconciles past 10%, the player's own orders, takers' matches) | 10 | about 150 ms, a press and up to 5 fills (ESTIMATED) | 1.5 |
| Reads in the window | 20 | about 15 ms (ESTIMATED, the reads hit daily rows and indexes) | 0.3 |
| Expiry and the daily cron, shared | | | under 0.1 |
| **All** | | | **about 2, 3% of 60 and 8% of 24** |

| Rows | 1,000 accounts | 10,000 accounts |
|---|---|---|
| Open orders (at most 20 an account, about 12 in use) | about 12,000 | about 120,000 |
| Fills a day (about 10 an account) | 10,000 | 100,000 |
| Fills kept raw 90 days, then only in daily rows | 0.9 million | 9 million |
| Daily key rows (kinds x bands x qualities that traded) | a few thousand a day | the same order |
| Ledger rows a fill | 3 to 4 | |

**Why it is cheap.** Matching rides the order's own write, so cost grows with orders, not with time. The plan reconciles only at settle points that already run. The guide and board are a daily cron over daily rows. Big-sale lines go out on the town channel a handful of times an hour, not one message a trade. Hot keys are not a contention risk: a busy key at 10,000 accounts fills about once a minute (COMPUTED: 100,000 fills a day spread over hundreds of keys), and skip-locked matching never waits.

---

## 4. Levers, readers and Lab needs

### 4.1 Levers

| Lever | Start | Search | Sets |
|---|---|---|---|
| `cut` | 4% | 2 to 8% | The sink on sales, and the spread a flip needs |
| `listFee`, `listFeeMin` | 1% (0.5% Premium), 0.01 h of wage | 0.5 to 2% | The cost of waiting on the book |
| `orderLifeH` | 168 (336 Premium) | 72 to 336 | How long an order rests |
| `orderSlots` | 20 (60 Premium) | 12 to 30 | Room for a plan |
| `bandLow`, `bandHigh`, `pieceHigh` | 0.25, 4, 10 | | Price bands on V |
| `buyLimitKit`, `buyLimitDrop` | 24 kit-hours, 48 hour-units a 4 h window | | Cornering |
| `proceedsCap`, its ladder | 60 h of wage, +1 per 10 hunted hero-hours, max 300 | 40 to 120 base | The RMT funnel's speed |
| `guideStep`, `guideMinFills` | 10% a day, 5 fills from 3 sellers | | How fast the guide moves and when it trusts itself |
| `nowSlip` | 5% | | One-press buy and sell |
| `reconcileStep` | 10% | 5 to 25% | How often the plan touches its orders |
| `bigSale` | 20 h of wage at the band step | | What the town hears |
| `pieceShare`, `traitRankValue`, `streamShare` x4 | 0.1, 0.25, set by lane W | | V for pieces and streams |

About thirteen global levers, counting pairs as one. None is keyed by an item, a ground or a Level.

### 4.2 Readers (live and in the Lab)

| Reader | Healthy | Says what |
|---|---|---|
| **Fill time**: median hours from placement to full fill, by key class | Kit under 4 h, parts and remains under 12 h, pieces under 72 h | Liquidity. The number players feel |
| **Spread**: (best ask - best bid) / guide on keys with both sides | Under 10% on kit keys | Whether flippers and plans keep the book tight |
| **Sellers a band** for each kit kind | At least 10 at 1,000 accounts | `09` 5.8 item 7's depth check |
| **Store share of kit used** | 20 to 50% | Too high: crafted prices are wrong. Too low: the store floor and ceiling are idle |
| **Guide pinned** days at the floor or the store's ceiling | Under a third of a month for any key | `09` 5.8 item 8's failure line |
| **Turnover an account-day**, hours of wage | 2 to 6 | Section 2.6's model, tested |
| **Gold to sinks**: share of minted gold that reaches a burn within 30 days | Rising toward `sinkOverFaucet` | The market's real job in the ledger |
| **Drops reaching the market**: share of hunted hours whose drops sold or were burned within 7 days | Over 60% | "Every hunted hour has something to sell" |
| **Top 1% of accounts' share of a key's buys** | Under 15% on any key | Cornering |
| **Flagged fill share**, **held proceeds total** | Low and flat | Wash trading and RMT |
| **Wanted orders filled** within 7 days | Over a third | Whether wanted orders work |

### 4.3 What the Lab must run

The economy phase of `07-balance-lab.md`, after `09` 5.8's account and server days. Price-belief agents (`04` section 11's model) on the real rules, labelled as a model of people.

| # | Run | Settles | Proves this page wrong if |
|---|---|---|---|
| M1 | Band depth at 300, 1,000 and 10,000 accounts on a career Level spread, with buy orders spanning 1 and 3 bands | Whether a 3-band range is enough | Fill time for kit over 12 h in most bands at 1,000 accounts with 3 bands |
| M2 | Cut sweep 2 to 8% with flipper agents | `cut`. Spread against flip volume | No cut keeps kit spread under 10% |
| M3 | A cornering whale with 5 alts on a draught key with no store substitute | `buyLimitKit` | The whale moves the guide past 1.5 V for a week |
| M4 | A wash pair, a pump ring of 5 accounts on separate networks | `guideStep`, `guideMinFills` | The guide moves 30% in a week on less than 10% of real volume |
| M5 | An RMT funnel: 20 farm accounts paying one customer through junk at the band top | `proceedsCap`, the ladder | More than one account-week of wage reaches the customer in a week |
| M6 | Plan reconcile churn on a server day | `reconcileStep`, the cost line of 3.5 | Over 20 order writes an account-day |
| M7 | Piece market: drop rates from `04` 11, wanted orders from agents who value Traits by the dominance check's cells | `pieceShare`, `pieceHigh`, whether pieces clear | Most pieces never sell, or most sell at the band's floor |

M1, M6 and M7 can run as SKETCH before the engine batch of `04` section 12 lands. M2 to M5 need only agents and the rules.

---

## 5. The build plan

**How it plays:** the book lands once, in wave 4, with the right shape. Wave 5 fills it with crafted goods and prices from the wage. Nothing built in wave 4 is torn out in wave 5.

| Wave | Market work | Waits on |
|---|---|---|
| **4** (01-11 to 01-24) | The one engine: `market_orders`, `market_wanted`, `market_fills`, `market_key_daily`, `market_guide`, `market_held`, counters. Buy and sell orders for **hunting stacks** (Remains, parts, scrap, plain gear, named fuels) and **pieces** with wanted orders. Matching on arrival. Cut, listing fee, price bands on V, stream buy limits, proceeds cap and hold, the guide, same-network flags. Loot and stoke rules writing orders. The window's four views. Big-sale lines and the shareable card. The Security review of the whole surface | Wave 3's flame. Lane G's piece row. Lane W's `wage(step)` and stream V |
| **5** (01-25 to 02-07) | **Crafted goods** with bands and quality as keys. Stock rules and tool spares writing buy orders. Kit buy limits. V regenerated from `wage(L)` and `09` 4.3. The store's floor and ceiling beside the book. The Crowns book as a key on the same engine with `10`'s rules | `09`'s trades. Premium and Crowns |
| **6** (02-08 to 02-28) | The Weighhouse as a place in town, the day's board, the trader's record and ladder, reserved orders for the clan, the shop counter and the clan stall (section 6) | Ladders, clans, the castle's first building |

**Decided now, so wave 4 is not a storefront we redo.**

1. **Orders, not listings.** One `market_orders` table with a side. Wave 4 ships buy orders for stacks and wanted orders for pieces on day one. A sell-only wave 4 would teach players to undercut by hand, then change under them.
2. **The key is (kind, band, quality)** from wave 4. Goods that have no band yet carry the band of the ground step they dropped at, which every hunting drop already has.
3. **Gold escrow on buy orders.** Offline matching needs the buyer's gold held.
4. **Matching on arrival at the resting price**, in the placing transaction. No cron matcher is ever built.
5. **V is a catalogue column from day one,** generated from `wage(step)`. Wave 4 cannot wait for wave 5's "prices from the wage" for its bands and fees. Lane W lands the wage function first.
6. **Pieces are server rows with indexed criteria,** escrowed by a state on the row, never copied.
7. **Plan rules are relative prices with absolute caps,** reconciled at settle points, from the first loot rule.
8. **Proceeds to the purse, goods to Storage,** no collect step.
9. **Fees and caps in shares of V and hours of wage,** never typed gold.
10. **Remains are one good a band** before the flame's fuel rows are re-cut.
11. **The staged market files retire** through `node tools/chain-retire.mjs --retire` in the release-order pass (as `12` section 2.7 does for others), and wave 4 is authored fresh with `node tools/new-migration.mjs`, re-using their proven patterns.

---

## 6. The owner's storefront idea, judged

The owner, 2026-11-22: "storefronts could be cool later where you have a hireling that works in your home or farmhand on your farm depending on what mastery an account has and it constantly restocks its shelves", and "Maybe the storefront is castle only and clans can hire hands to help keep things stocked or something."

**How it plays (my version):** your hall has a shop counter that shows what your company is selling, with a shopkeeper who restocks it as your heroes make goods. Visitors can buy from it. Every sale is a fill on the Weighhouse book. Your clan's castle has a stall that sells what the clan's works make, for the treasury.

### 6.1 Do I like it?

**I like what it is reaching for, and I would not build it the way it is described.** It reaches for two things the market lacks: crafters' identity (the owner's 2026-11-04 wish that crafting have "identity across the board") and a reason to visit someone's home. Those are real. But a store with its own shelves, its own prices and a hireling who restocks it is a second market, and that fails twice:

- **It splits liquidity.** A meal on your shelf is a meal the book does not see. Every good spread across a thousand shelves is a good nobody can find, which is the thin-market risk of `09` 7.1 made worse. Popular exchanges won by pooling sellers, not by giving each one a booth (FFXIV's cross-world shopping, section 1.1).
- **"Constantly restocks its shelves" is already the plan.** A standing sell order fed by stock rules restocks itself as the company makes goods. A hireling who does that is the same mechanic with a sprite.
- **A hired hand that adds labor mints goods.** If hands are NPC labor beyond the work day, they break `09` 5.3's labor cap, the one rule that makes the light player and the heavy player trade.

**Purpose test, as described.** Problem: crafters are anonymous in an exchange. Decision added: little, since restocking is automatic and pricing is the plan's. Plugs into: the hall and the castle, weakly. It fails as a separate system. As a **view onto the book**, it passes: it solves the identity problem, adds one real decision (what to feature, for whom), and plugs into the hall, the castle, the market and the trades with no second economy.

### 6.2 Personal, castle, both or neither

**Both, as views onto the one book. Neither as its own store.**

| | **The shop counter** (personal, in the hall or on the farm) | **The clan stall** (in the castle) |
|---|---|---|
| What it is | A counter in the hall that shows up to 8 of the company's resting sell orders, chosen by the player or by default the company's Mastery goods | A stall that shows the treasury's sell orders: goods members give to the clan and goods the castle's two works make |
| The look follows the Masteries | A Smithing Mastery gets a forge counter, Cooking a kitchen hatch, Farming a farm cart on the plot (the owner's "depending on what mastery"). A shopkeeper sprite restocks it as orders fill and refill | The castle's two works set the stall's look |
| Who buys | Any visitor to the hall. A purchase takes that company's order at its price, on the book. The counter shows the going price beside it, so nobody is fooled | Any player in town. Members get no discount: the treasury sells at its price |
| Where the money goes | The company's purse, minus the cut, like any fill | The clan treasury, minus the cut, with a ledger row (`02` 7b's treasury rule) |
| The hands | A shopkeeper **look**, no labor. A Crowns shopkeeper look is a fine cosmetic sink (`10` section 4, row 2) | Members' resting heroes doing castle labor in their work day, as `02` package 7 already has it. No NPC labor |
| Decision it adds | What to feature, and to show the world what the company makes | What the clan makes together, and what to sell versus keep for the castle's own upkeep |

**Why the castle stall is the better half.** It gives the castle an income loop it lacks: members' work becomes goods, goods become treasury gold, gold pays the castle's upkeep and buildings. That is a reason to contribute every week, which is `02` 7's open question "what does a clan do together". The shop counter is identity and fun to visit, cheap, and nice but not essential.

**The better option, said plainly.** If only one thing gets built, build the **maker's record** rather than the counter: every crafted stack keeps a count of who supplied it to the book, and the hall and the ladder show "Ama's company has supplied 12,400 hours of meals to other companies" (section 2.10). It gives crafters the same identity with no new screen, and the counter can come later on top of it.

### 6.3 One exchange, one ledger

Nothing sold from a counter or a stall exists outside `market_orders`. A counter purchase is `hr_market_order` with the counter's order id as the only counter-order it may match. The cut, the price band, the buy limit, the proceeds cap, the same-network flag and the ledger rows are the same rows as any fill. A stall's orders are owned by the clan's treasury account and are placed only by an RPC that checks the clan role and journals the giver. No shelf stock, no shelf price, no second purse. So the storefront adds art, a place and a decision, and no new money surface beyond the treasury's, which `02` 7b already sends to Security.

### 6.4 Housing and the castle in the wider crafting market

| Place | What it buys on the book | What it sells | `09` / `02` hook |
|---|---|---|---|
| **The hall** | Timber and fittings for the weekly upkeep of bench rooms. Furniture. A crafted saddle per mount | Through the counter, the company's goods | `09` 3.5 (rooms as bench yield), 4.3 (`hallUpkeep` in hours of wage) |
| **The farm** | Seed stock found on hunts | Grain and herbs to cooks and alchemists | `09` 2.9 (plots) |
| **The castle** | The largest standing buyer: its stages and upkeep are paid in crafted goods and labor, so the treasury keeps buy orders for timber, bars and rations | Through the stall, the goods of its two works | `09` 3.5, `02` 7b's building costs and upkeep |
| **Town orders** | The town's own surplus orders, posted at the Weighhouse, paid in standing | Nothing. Mints no gold | `09` 3.6 |

The rule that holds them together: every place that needs goods buys them through a standing order on the book, and every place that makes goods sells through one. A clan or a hall is just another account on the exchange, which is how the market becomes the heart rather than one more screen.

### 6.5 When

**Wave 6**, with the castle's first building and clans (`12` section 4). The counter needs the book (wave 4), the crafted goods and stock rules (wave 5) and the hall as a visitable place. The stall needs the treasury, which arrives with clans. The maker's record can ride wave 5 at almost no cost, since the fills already name the seller. Art: one counter look per Mastery trade and one stall, sampled first (`CLAUDE.md` section 10), routed to the art director.

---

## 7. Open calls, decided

| # | Call | Decision | Why |
|---|---|---|---|
| 1 | Orders or listings | Buy and sell orders, matched on arrival | Section 1. The only shape that trades while players are away |
| 2 | One book or many | One a realm | Liquidity. No travel risk to make distance content |
| 3 | The trade price | The resting order's | Safe to cross the book. Flippers can read the margin |
| 4 | Pieces | Single sell orders plus wanted orders | Unique gear needs a buy side too |
| 5 | Auctions | **No** | They need a timed presence and a bidding chore. Wanted orders plus the comparables guide find the price |
| 6 | Cross-band buy orders | Yes, up to 3 bands | Depth. Neighbors substitute at a known discount |
| 7 | Remains | One good a band. Named fuels apart | One deep market instead of four thin ones |
| 8 | Temper on a sold piece | Stays with the hero's slot | Pieces price as themselves |
| 9 | Imbuement on a listed piece | None can be: it sits on the hero's slot (`21` D-20) | Clean comparables |
| 10 | Tax | 4% cut, 1% on what rests, no cap | Small, burned, scales with value |
| 11 | Item sink from the tax | No | We need gold burned, not recycled |
| 12 | Gate | None. Caps in hours of wage at the account's step | Sells from the first hunt, funnels nothing |
| 13 | Big proceeds | Held past the cap and released, never refused | Keeps the best moment, slows abuse |
| 14 | Anonymity | Anonymous trading. Sellers named on big sales by default, buyers only by choice | Social moment without exposure |
| 15 | Flipping | Allowed, recorded, ranked by goods supplied | Flippers are the liquidity |
| 16 | Premium seat | Slots, life, half the listing fee. Same cut and caps | `10`'s seat, checked here |
| 17 | The Crowns book | A key on the same engine, with `10`'s own fees, cap and hold | One engine, one ledger, one security review |
| 18 | The name | The Weighhouse. `09`'s orders become "town orders" at the Weighhouse | Already the player's word, plain, ours |
| 19 | Storefronts | Views onto the book, wave 6. Castle stall first. No NPC labor | Section 6 |
| 20 | Real-money calls | **None new for Tyler.** The Crowns book's fee and cap and the Premium price stay where `10` put them | |

---

## 8. What this changes elsewhere

| Where | Change | Owner |
|---|---|---|
| **Wave 4** | Gains: buy orders and wanted orders (not just single listings), the stacks book for hunting goods, the guide, caps and holds, plan loot and stoke rules writing orders | Coordinator's wave plan |
| **Wave 5** | "Prices from the wage" splits: V must exist in wave 4 (for bands and fees). Wave 5 regenerates V for crafted goods and adds kit buy limits, stock-rule orders, the store beside the book, and the Crowns key | Coordinator's wave plan |
| **Lane W (wage)** | Land `wage(step)` as one pure `src/core` function and one server function **before wave 4**. Add `streamShare` for Remains, common parts, rare parts and scrap, and `pieceShare` with `rarityHours`, so every tradeable key has a V. Expose the account's highest hero step for caps | Lane W |
| **Lane G (gear, Traits)** | A piece is one account-owned row with indexed columns (slot, base, tier, rarity, Traits, ranks, Signature, find line, finder shown or not) and an escrow state. Carry-over, Temper and imbuing refuse an escrowed piece. Temper and imbuements stay with the hero's slot (`21` D-20). V for a piece reads `rarityHours` and rank | Lane G |
| `02` section 2b | Common remains are one good a band. Named fuels stay their own. The stoke rule writes orders | Designer, next pass |
| `09` sections 3.3, 3.5, 3.6 | Runecutting's binder is Remains. The Weighhouse is the market, its surplus board is "town orders". The market row points here | Designer, next pass |
| `10-premium.md` section 2 | The seat is checked here and unchanged. The free price line is 30 days | None |
| Art director | The Weighhouse building and counters, a shopkeeper look, the big-sale board, a counter look for each Mastery and the clan stall, sampled first | Art director |
| Security | One review of the market, the Crowns key and the clan stall's treasury orders, before Early Access | Security |

---

## 9. What I did not check

- I ran nothing. Every turnover figure in 2.6 except `09`'s is ASSUMED, and the cost lines in 3.5 are ESTIMATED from one REAL press cost.
- The Grand Exchange's fill-price rule, EVE's fee and tick history, Albion's fees and black market, and FFXIV's retainers are FROM MEMORY. Only the two Grand Exchange pages cited were read for this page, through `09` section 0.2.
- Whether "Weighhouse" or "town orders" collide with another game's names, for the naming pass.
- Whether players will set wanted orders at all. M7 and the live reader "wanted orders filled" answer it.
- No blind play of a market exists for this design. The walk-through in 2.12 is against data, not a played build.
