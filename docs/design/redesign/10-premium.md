# 10. Premium and Crowns: what makes them worth buying

2026-11-22, `lane/rd-premium`, from `set/v0.2.144`. Docs only. It answers the owner's asks of 2026-11-22: "We also need to figure out what else makes premium worth buying otherwise we'll never make money", and "Crowns need to be desired or else no one will buy them to sell or off the real money shop". Prices and the business model are his calls. The rest is designed here, and every number is a starting value for the Balance Lab.

**Labels.** EVIDENCE has a source. COMPUTED is arithmetic on named inputs. JUDGMENT is a design opinion. ASSUMPTION is a guess the money model rests on. UNVERIFIED is from memory, with no source read in this lane.

## 0. One screen

- **Premium sells hours, flexibility, records and looks.** Never power per hour, never access, never the first principle.
- **Revenue is what Crowns are spent on.** Every Crown a payer sells ends in a sink a gold-rich player chose. So Crowns need sinks a rich player wants every week: Premium time, looks and mounts, and tools that never break.
- **Premium is the cheapest hours in the game.** Its hours would cost 20 hours of wage an account-day in bought blocks. That gives a Crown its gold value.
- **Pay-to-win, straight.** Nothing is sold per hour. Per day, money turned into gold buys up to 60% more hunting. Ranked boards read inside Level bands, so that buys pace and never a rank.
- **The business model (ruled 2026-11-22).** A one-time Early Access price of $15 with 30 days of Premium in the box.
- **Money, roughly.** Free to play, middle case, after Valve and servers: about $1,100 a month at 1,000 accounts and $11,000 at 10,000. A one-time price earns about three times that per active account, on fewer accounts.

## 1. What sells in games like this

Mechanics only. EVIDENCE rows cite study 49 section 3.1 (`docs/design/balance-program/49-mmo-layer.md`).

| Model | What the buyer gets | Why it converts | What we take |
|---|---|---|---|
| Tibia-style premium | Most of the map, more looks (UNVERIFIED). A store currency players sell for gold, and an XP boost dearer with each buy that day (EVIDENCE) | The free game is a corner. The rich pay in gold | The tradeable currency and the rising daily price |
| OSRS-style membership | The larger map, more skills (UNVERIFIED). A bond bought with money, sold once for gold, redeemed for membership (EVIDENCE) | The free game is a demo. A grinder plays for gold | The bond loop, as the Crowns book |
| Albion-style premium | More fame and silver, a crafting focus pool, a lower market tax (UNVERIFIED). Bought with silver on a player exchange (EVIDENCE) | Crafters and traders feel it every session | Crafting time and a market seat. Not more loot an hour |
| PoE-style sales | Looks and storage tabs, no power (UNVERIFIED) | Storage is friction met daily. Looks are seen in town | Looks and storage |
| GW2-style gem shop | Gems exchanged with gold at a moving rate, with a fee (EVIDENCE). Never-breaking tools with their own look, bank room, outfits, mounts (UNVERIFIED) | Many small comforts, all reachable with gold | The never-breaking tool and the comfort list |
| Idle-MMO tiers | A longer offline cap, loadouts, auto-sell (UNVERIFIED). One developer wrote that making the bought currency tradeable raised purchases (EVIDENCE) | Less friction coming back | The tradeable currency. Not loadouts or automation, which our first principle gives free |

The lessons: people pay most for what they meet every session, and a currency gold can buy turns free players' gold into payers' demand. The strongest converter, a locked map, is one we rule out, so the bundle must be felt daily without it. (JUDGMENT)

## 2. Premium

**Already in, the owner's rulings.** One Premium covers the company. Each hero hunts 12 hours a day instead of 10 and works 2 more town hours (`04` section 11, `09` section 5.3).

**Candidates, ranked by daily feel over build cost and risk.**

| # | Benefit | A free player still has | Felt every day because | Build | Pay-to-win |
|---|---|---|---|---|---|
| 1 | **Talent freedom.** Each hero's first Talent reset of the day is free, and each hero holds a second saved build (the owner's idea, `02` section 1b) | One saved build a hero beside the current one. Any reset for gold: 0.5 hours of wage, doubling with each reset that day | The plan switches builds by ground, so the right build runs everywhere at no cost | M | Mild. A free hero buys the same switch |
| 2 | **A market seat.** Three times the listings and buy orders, twice the listing life, half the listing fee. The sales tax is the same | Every rule that lists and buys, and room for its own goods | Traders relist daily | S | Mild. A small gold saving |
| 3 | **The company ledger.** 90 days of reports, trends by hero and ground, two plans side by side, price history | The cause line, the one fix, the risk reading, seven days | Every return opens with it | M | Mild. Information |
| 4 | **The wardrobe.** Premium looks for heroes, mounts and the hall's fire while Premium runs, and one piece kept each paid month | Every look earned in play | Seen in town and in the hall | M, mostly art | None |
| 5 | **Loyalty marks.** A mark by the company name at 3, 6, 12 and 24 paid months, gold-paid included, hideable | Nothing is missing | A reason to renew | S | None |
| 6 | Custom alerts: a Rare drop, a fall back, a sale | The "day is done" alert | Later, once push exists | M | None |

**Considered and refused:** storage only while Premium runs (a lapse locks goods away, so storage is sold as permanent tabs), a lower sales tax (it shrinks the main market sink, kept as a fallback if conversion runs low), a faster mount (it would sell hunting time), a fourth Mastery (one account best at more trades breaks the trade web), more flame room or a slower burn (drop chance), a fifth hero (a quarter more labor), more plans or auto-restart (the first principle, and a hunt needs a press), faster work or more XP or coin an hour, and Premium grounds, halls or Tower floors (access). All but the first two are strong pay-to-win.

**The recommended set:** the ruled hours, Talent freedom, the market seat, the company ledger, the wardrobe and loyalty marks. Alerts follow push.

## 3. Is anything pay-to-win?

**Yes, per day. No, per hour.** Ranked by strength, for a player who turns money into gold on the Crowns book:

| # | Path | What money buys at the limit | Per hour | Strength | Ranked surfaces it moves |
|---|---|---|---|---|---|
| 1 | Bought hunting, capped at 2 blocks a day (ruled) | 14 hunted hours against a free 10, 16 with Premium: 40 to 60% more XP, coin, drops and remains a day. Two blocks for four heroes cost 280 hours of wage a week, the same as the book's weekly cap, so a payer can buy both blocks for every hero every day (COMPUTED, `04` section 11) | Nothing | Strong per day | Depth ladders, Tower, first kills, world boss, through Level |
| 2 | Rare and Very Rare pieces from the market | A top kit weeks early. A 90th against a 10th percentile kit is about a tier, 20 steps, 15% of pace (`kitSpreadMax`, `04` section 10) | Yes | Strong, bounded by what players found and by Level | Depth ladders, Tower, gear arena, world boss |
| 3 | Premium's 2 hours (ruled) | 20% more a day. Worth one bought block, 4.0 hours of wage (2.5 net) a hero-day | Nothing | Moderate per day | As path 1 |
| 4 | Bought remains | The top third of a full flame. Own drops feed about two thirds (`09` section 5.4). If own fuel gives 80% of the luck, the bought top adds about 6% more Rares an hour on the old +39% ceiling (SPECULATIVE until the Lab sets the curve) | Yes, drops only | Mild | None directly |
| 5 | Bought town work, 4 blocks a day | Trade XP sooner, goods at a loss | No combat power | Weak | The castle, if its labor counted bought hours |

**The smallest bound on each ranked surface.** Hours still buy Levels, drops, goods and the next band, so every purchase stays worth making.

| Surface | Bound |
|---|---|
| Depth ladders, Tower floors, first kills | Ranked inside Level bands of 20, by the company's mean hero Level. Bought hours move a company into the next band sooner, never up its own. No board ranks raw Level or XP: Level 200 is a broadcast, not a race board. Gear counts here, as it should |
| Even arena | Reads nothing bought. The prestige board money cannot move |
| Gear arena | Matched and rated inside gear bands |
| World boss | Attempts counted a week, never by hunting hours. Pay by share against what a company of its band is expected to add, so no edge shrinks another company's pay |
| Castle | Labor counts the work day only, never bought blocks. Gold gifts count: they lift the whole clan inside the slice of `02` section 7b |

**How tradeable premium currencies are received** (EVIDENCE, study 49). Bonds sold once for gold were broadly accepted, though some called them gold selling. Currencies that buy training time, and a gold exchange with a 30% fee, read as "pay to progress". Stores that sold power directly drew protests and a "pay to win" launch. A daily-limited XP boost at rising prices draws mixed views. Ours sits nearest that boost and the bond, so with banded ladders and a clean even arena I expect "pay to progress". A board ranking raw Level would read as pay to win. (JUDGMENT)

**The line we hold.** Premium and Crowns never sell power per hour (XP, coin, drop chance, flame room, work rate, Mastery cap, combat numbers), stats on anything bought, access to any ground, hall, floor, arena, trade or recipe, or the first principle: plans, rules, copying, Carry on, the cause line, the risk reading and two Talent builds a hero stay free. Nothing is reachable only with money.

## 4. Crowns: the store and the demand

**Two buyers.** A payer buys Crowns with money, to spend or to sell for gold. A rich player buys Crowns with gold, to spend. If the rich player wants nothing Crowns buy, the book has no bids, payers stop buying Crowns to sell, and half the money model is gone. Revenue is set by Crown sinks, not by the cash shop. (JUDGMENT)

**What Crowns buy, ranked by how often a rich player wants it.**

| # | Sink | How often | Pay-to-win |
|---|---|---|---|
| 1 | Premium time, 30 days. The cheapest hours in the game | Every month | Section 3 |
| 2 | Hero and hall looks: outfits, work animations, hall fire colors, clan banners, a season's line with a few new each week | Every week | None |
| 3 | Mounts, with their own sprite and riding animation. Mount looks are among the best sellers in MMO shops (UNVERIFIED) | Each season | None |
| 4 | A tool that never breaks, with its own look and work animation (`09` section 3.7) | One a hero and trade, new looks each season | None. It works like a crafted tool at the job's band |
| 5 | A saved Talent build slot for one hero (`02` section 1b) | As a company takes on more grounds | Mild |
| 6 | Storage tabs, kept forever. Base room grows with the hall | As hoards grow | None |
| 7 | Premium as a gift to another account | Monthly, for clan leaders and friends | None |
| 8 | Renames and restyles | Rarely | None |

**Never for Crowns:** gear, materials, remains, gold, hunting or work hours, boosts, Mastery slots, plans, hunt bag room (a full bag can end a hunt), and anything random. A Crown trades for gold, so a paid random box would be gambling. Everything bought with Crowns binds to the account. Only Crowns trade.

**Mounts.** Every mount does the same thing: nothing to time. A hunt starts on its ground at the Start and ends in town, with no travel time, so a mount never touches the hunting day, and any travel added later sits outside it at one speed. A company earns its first mount with its first depth record. More are tamed from rare drops, a drop moment with a bestiary line, and the tame trades like any drop. Each new mount takes a crafted saddle, a small buyer for Woodcrafting. Crowns mounts are looks only and bound. A mount is seen riding through town, out at the Start and home at the return, on the return card and on a ladder entry. Art: the first is L, since the hero must be drawn riding in every facing through `tools/world-art`. Each after is M.

**The exchange.** A server-run book where players set the price. Every game in study 49 moves money to gold only through another player, with a limit (EVIDENCE).

| Part | Design |
|---|---|
| Book | Crowns only, in fixed lots. Asks and standing bids, held and matched by the server, which never mints Crowns or gold to fill an order |
| One trade | A Crown bought with gold binds to its buyer |
| Fees | 1% to list and 4% of the gold on a sale, both burned, so every Crown sold is a gold sink (band 3 to 10%) |
| Guide price | The 7 day median, shown on every order and in gold beside every Crowns price. A lot outside half to twice the guide is refused |
| Weekly cap | Crowns an account may buy and sell: about one account-week of wage at its highest hero's Level (280 hours of wage on a 10 hour day) over the guide price |
| Starter protection | Crowns bought with money wait out the refund window before listing. Selling needs the company's first depth record |
| Standing orders | A plan rule: "buy up to two lots a week at no more than this" |
| Journal | Every lot listed, matched, cancelled, bound and spent is a ledger row written only by the server (`CLAUDE.md` section 1) |

These are the overhaul's clamps (`docs/design/overhaul/04-economy-and-crowns.md` section 2.8) plus standing bids and starter protection. No separate Premium token: Crowns are the bond, and Premium shown in gold at the guide price gives its one price without a second currency splitting the book. (JUDGMENT)

**What feeds demand.** Premium's hours bought as first blocks would cost 4.0 hours of wage of hunting and 1.0 of work a hero-day: 20 an account-day, about 600 a month, against the 900 a free account nets in a month (COMPUTED on `04` section 11). A rich player who would buy those hours saves most of that by buying Premium on the book. That gap is why rich players bid for Crowns. The wage rises with Level and the Crown's price does not, so far players are the bidders, the bond's usual shape. Bought blocks and bought remains pull the same way: a payer sells Crowns to fund them, a rich player buys them with gold. (COMPUTED. JUDGMENT on behavior.)

## 5. Will we make money?

**Assumptions.** Accounts are accounts active in the month.
- Free to play, Premium holders: 6%, 12%, 20% of accounts (low, mid, high). Of their months 70%, 60%, 50% are paid in cash and the rest with gold, so a payer bought those Crowns to sell. ASSUMPTION: free games are often said to see a few percent of monthly players pay (UNVERIFIED), and Premium bought with gold adds holders beyond cash payers.
- Looks, mounts, tools, slots and services: $0.25, $0.60, $1.50 an account a month, half through the book. ASSUMPTION.
- Premium: $8, $10, $12 for 30 days. Genre subscriptions sit near $10 to $15 (UNVERIFIED), short idle visits read as worth less, and one Premium covers four heroes. Multi-month discounts cut churn.
- Valve takes 30% of a box and of in-game purchases, which on Steam go through Steam's own purchase system (25% and 20% only at large revenue). Phone stores take 15 to 30%, a web payment provider a few percent. All UNVERIFIED. The model takes 30% and leaves out sales tax.
- Servers: at most $0.15 an account a month (RULED 2026-11-21, `docs/design/overhaul/09-platform-and-measurement.md` C4). Study 48 puts the target account under it at 1,000 accounts and a watched day a third over at 10,000 unless the engine gets its own server.
- One-time price (not yet ruled): a band of $10 to $20, about $12 realized after regional prices and sales. Under $10 barely slows bots, and over $20 beside a subscription reads as paying three times (JUDGMENT). Box sales a month of 15%, 20%, 25% of active accounts at $10, $12, $16 realized, and a Premium share half again higher, since buyers are committed (ASSUMPTION).

| A month, after Valve and servers | Free to play: low / mid / high | One-time price: low / mid / high |
|---|---|---|
| Each active account | $0.36 / $1.11 / $2.58 | $1.58 / $3.21 / $6.22 |
| 1,000 accounts | $361 / $1,110 / $2,580 | $1,580 / $3,210 / $6,220 |
| 10,000 accounts | $3,610 / $11,100 / $25,800 | $15,800 / $32,100 / $62,200 |
| Mid revenue: cash Premium, Crowns sold for gold, cash looks, boxes | 40%, 43%, 17%, none | 23%, 21%, 6%, 50% |

(COMPUTED on the assumptions.)

| | Free to play | One-time price |
|---|---|---|
| Sign-ups | Several times more (UNVERIFIED). The shared world fills sooner | Fewer. A town may feel empty in Early Access |
| Conversion | A lower share, more holders by gold | Higher. 30 days of Premium in the box softens "paying twice" |
| The Crowns book | More players with money and no gold, so more sellers and a lower Crown price | Fewer, richer players and a steadier price |
| Bots | Every hero runs unattended, so behavior cannot tell a bot from a player. Free accounts farm gold for Crowns, and outside gold sellers undercut the book | Each banned bot costs a box, the main defense in a game like this |
| Steam reviews | A free game with a Crowns-for-gold book draws "pay to win" more often (EVIDENCE, one launch in study 49) | A price beside a subscription and a shop draws "paying three times" (UNVERIFIED) |

**Ruled (the owner, 2026-11-22): "Yes 15 with a month of premium".** Early Access is a one-time price of $15 with 30 days of Premium in the box (a founder look is the designer's suggestion beside it). Free to play gets a fresh look for full release on Early Access data. The bot argument decides it for me. Either way, at 1,000 accounts the game pays its servers and little more. The biggest lever is how many accounts stay, then the Premium share. The price inside $8 to $12 moves revenue a fifth either way. Every share is a guess until test Crowns run in a playtest. The first real numbers are the Premium share in week four and the Crown's gold price.

## 6. Top three recommendations

1. **Make rich players want Crowns.** Premium time, looks and mounts, and never-breaking tools are the weekly sinks. Show every Crowns price in gold at the guide price.
2. **Rank inside Level bands and keep the even arena clean.** Bought hours then buy pace and never a rank, and the read is "pay to progress".
3. **Sell hours, flexibility, records and looks, never the first principle.** Plans, rules and two Talent builds a hero stay free, so the free game is whole and Premium is wanted, not needed.

## 7. Edits made here, and edits owed

Made in this lane: `02` section 1b (resets, saved builds, the plan switching builds) and packages 5 and 9 (tools, the hunting cap, the plan's saved build), `04` section 11 (the hunting cap of 2, the cost table, 0.84 re-checked), `08` (the cap, a pointer here), and `09` sections 1, 2.4, 2.9, 3.4, 3.7, 4.3, 4.7, 5.3, 5.7, 6, 7.1, 7.2 and 7.4 (tools that wear out).

Owed, for the Coordinator to route:

| File | Edit |
|---|---|
| `02` section 2b | Premium's hours and bought hours grow Flame Level faster. Crowns reach the flame only inside the book's weekly cap |
| `02` package 7 | Ladders rank inside Level bands, and no board ranks raw Level or XP. World boss attempts are weekly, paid by share against the band. Castle labor counts the work day only. Mounts get a home here or in package 6 |
| `04` section 11 | The reset rule (`resetHours`, `resetGrowth`) beside the block rule. The book's 5% in `sinkOverFaucet`. Premium's hours at the block price as the Crown's value anchor |
| `04` section 12 | Premium has no row in the step ledger. The Lab reads days to a band with and without Premium and with two bought blocks |
| `05-roadmap.md` FB-15 | Point here, with prices and the business model left to the owner |
| `09` section 6 | Storage counted in stacks, base room from the hall, Crowns tabs on top |
| Art director | The riding system and the first mount, and work animations for the Crowns tools, sampled before any batch |
