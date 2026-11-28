# 09. The crafting ecosystem, from first principles

Written 2026-11-21 on `lane/rd-crafting`, from `set/v0.2.144`. Docs only. It answers the owner's crafting brief of 2026-11-21, point by point. Read `01-identity.md`, `02-architecture.md` (package 5, package 2, sections 2b and 2c) and `04-math-strategy.md` first. **Approved.** The owner said go to this design on 2026-11-22 and answered its first four questions (section 7.3). Nothing here is built, and every number is a starting value for the Balance Lab to settle. Tools that wear out (section 3.7) were added on 2026-11-22 on `lane/rd-premium`, from the owner's idea of that day.

**Labels.** SOURCE is a public page or a file in this repo, with its link or path. COMPUTED is arithmetic on inputs named beside it. MEASURED is real play or a real engine run, with its file. JUDGMENT is a design opinion of mine. SPECULATIVE is a guess worth a test. I ran no engine cell for this page, so every MEASURED line is somebody else's reading and says whose.

**Names.** Band, kit, line, Mastery, work party, draught, ward charm, camp pot and Runecutting are working names. Honing stone, Smithing, Woodcrafting, Alchemy, Artificing and Cooking are the owner's words. No name, item, text or table of another game is used. Mechanics only.

**Order.** Section 1 is the one screen. Section 0 is the research behind it and sits second so the answer comes first. Sections 2 to 7 follow the brief's list.

**Old rulings.** Every older crafting ruling is treated as history, as the brief asks. Where this page drops one, section 2.9 lists it.

---

## 1. One screen for Tyler

**The idea in one line.** Crafting sells hunted hours. Gear is never destroyed, so crafting cannot live on replacing gear. It lives on the one thing this game burns without end: four heroes an account, hunting for hours every day.

**The structure I recommend.** Ten trades, owned by the company, capped at 99.

| Trade | Kind | Its purpose | Who burns the output, and how fast |
|---|---|---|---|
| Mining | Gather | Ore and rune stone | Smithing and Runecutting |
| Woodcutting | Gather | Logs | Woodcrafting |
| Fishing | Gather | Fish | Cooking |
| Farming | Gather, on plots | Grain and herbs | Cooking and Alchemy |
| **Cooking** | Make | Meals and drinks. The sustain that sets how deep a company can hold | Every hero, every hunted minute. The largest burn in the game |
| **Smithing** | Make | Honing stones, arrowheads, Temper kits, fittings, and every trade's tools | Melee heroes every hour. Every arrow. Every piece of gear at every tier. Every working hero, a tool every 12 work-hours |
| **Woodcrafting** | Make | Arrows and bolts, ward charms, timber and furniture, tool hafts | Ranged heroes every shot. Front heroes every hour. The hall and the castle every week. Every tool |
| **Runecutting** (new name for the rune trade) | Make | Runes for damage and healing spells | Casters and healers, every cast |
| **Alchemy** (new) | Make | Draughts. One per hero, picked for the ground. Never a heal | Every hero who wants the ground's answer, every hunted hour |
| **Artificing** (replaces the old Crafting bench) | Make | Imbuements, crafted jewelry and cloaks that roll Traits, carry-over, salvage | Every 20 hunted hours for each imbued piece. Every Trait worth keeping |

**Why this shape.**

1. **Smithing and Woodcrafting stay separate.** They have different raw streams (ore, logs) and different burners (melee, ranged and front heroes). They meet in one product, the arrow, which needs a smithed head and a cut shaft. That one join is what makes two accounts trade. Merged, they are one long ladder with no join. (JUDGMENT, section 2.1)
2. **Two new trades, each with an input no other trade eats.** Alchemy is the standing burn for creature parts. Artificing is the standing burn for Trait gear, old gear and rare parts. (JUDGMENT, section 2.2)
3. **Cooking is certain, not uncertain, on one condition.** Food must be the only supply that restores health and mana, and Alchemy must never heal. Then Cooking is the largest market in the game and the only buyer for Fishing and most of Farming. (JUDGMENT, with the reference study's warning, section 2.2)
4. **Every hero carries a kit of four lines.** A meal, a charge for their style, a draught, and imbuements. Two are the floor and two are decisions. That is the whole consumable game. No fifth small percent is ever added. (JUDGMENT, section 3.2)
5. **The store sells the floor forever, and only the floor.** Its basics are unlimited, a set number of steps weaker than crafted, and dearer. A hunt never stops for stock. Crafted goods are better and cheaper, and they run out. (JUDGMENT, section 2.5)
6. **One number sits behind every recipe: hours of work.** A recipe is a share of the work behind one hunted hour. Prices, XP, time and materials all come from that one number and the wage of `04-math-strategy.md`. No recipe has its own numbers. (JUDGMENT, section 4)

**The economic consequences.**

| Consequence | Size | Label |
|---|---|---|
| Supply and demand both scale with hunted hours, so the balance does not change with population. 1,000 accounts and 10,000 accounts sit at the same ratios. Population changes only how deep each market is | Section 5.2 | COMPUTED |
| The balance does change with how long players hunt. With the starting values, a server whose heroes hunt 6 hours a day has a quarter of its town labor idle. At 8 hours it is balanced. At 12 hours a third of all supplies must come from the store | Section 5.3 | COMPUTED on assumed levers |
| Accounts that hunt little have spare labor, and accounts that hunt all day have a labor deficit. So the light player earns gold by working, and the heavy player buys. That is a real reason for two kinds of player to trade | Section 5.3 | COMPUTED |
| The vendor floor is a small faucet. If all idle labor were sold to the store at the floor it would add under 3% to the gold the hunts mint | Section 5.5 | COMPUTED |
| **Crafting cannot close the gold ledger alone.** Its recurring sinks destroy about 19 to 34% of the coin a company earns, against a wanted 85 to 100%. And the better the player economy works, the less the store takes. The rest must come from wealth sinks priced in hours of wage | Section 5.6 | COMPUTED on assumed levers |
| Crafted supplies cannot be one row for every Level, as `04` section 3 has it. A traded good must carry the step of its materials. Otherwise a new account's hour of work sells at a far player's wage, 33 times its own | Section 4.2 | COMPUTED |

**What the owner ruled, 2026-11-22.** Company-owned trades with a cap of three Masteries (section 2.6). Alchemy never heals, so only food restores health and mana (2.2). Remains trade and bought remains burn, so gold can buy luck (7.3, and `02` section 2b). Each hero's town work has a daily cap, Premium makes it longer, and more can be bought at a pricey rate (5.3). Tools break after 12 hours of use, and the Crowns store sells tools that never break (3.7). The hunting day is 10 hours, 12 with Premium, and more can be bought the same way (`04` section 11). Still open: whether Temper costs a share again at each new tier (2.4).

---

## 0. What the five games do, and what fits us

Our context, used in every "fits us" line: hunting is automated and runs for hours. An account runs four heroes. Rare gear comes from monsters. Gear has no durability and is never routinely destroyed. Levels have no cap. Thousands of heroes hunt up to 12 hours a day.

What I read today is marked SOURCE with its link. What I know from study and did not re-read today is marked "from memory", and the Lab or a later lane should check it before a number rests on it.

### 0.1 Albion Online

| Mechanic | Why it works there | Fits us? |
|---|---|---|
| Players make every item, and gear is lost and partly destroyed on death in open zones | Loss is the demand. Every death is an order for a crafter | **No.** Our gear is found and kept. We take the lesson and not the rule: demand must come from a flow. Our flow is hunted hours |
| Refining chains: raw material, then a refined material that also needs the tier below | One trunk feeds many products, so a refined good has a deep market | **Partly.** A refine step where one raw feeds several products (bars, shaft stock, cut stone). Not the "needs the tier below" rule, which multiplies stock for no decision |
| A return rate: a share of materials comes back on each job. It rises with the place and with spent focus. SOURCE: the rate is `1 - 1/(1 + bonus/100)`, a city's base bonus of 18 returns 15.3%, and focus adds a flat 59 to the bonus, <https://wiki.albiononline.com/wiki/Resource_return_rate> | Where and how you craft matters more than whether you can. It makes hauling and specialising pay | **Yes, as the yield curve.** One yield number that rises with trade Level, Mastery and the bench. Section 4.4 |
| Focus, a daily pool that refills, spent to craft better (from memory: tied to the paid tier) | It caps each account's best output, so many small crafters matter and no one account floods a market | **The cap, yes. The pool, no.** Our heroes already have a work day in hours. A second pool is one more bar to watch. The owner ruled that Premium lengthens the work day, inside the bounds of section 5.3 |
| Specialising: mastery in one item line makes that line cheaper to craft | Nobody is best at everything, so crafters need each other | **Yes, as Mastery.** Three of ten trades for an account. Section 2.6 |
| Regional markets with no shared stock, and cities with a bonus for one material | Hauling is play there, with risk | **No.** We have no travel risk, and split markets would thin an already thin market. The castle takes the "place with a specialty" idea instead (section 3.5) |

### 0.2 Old School RuneScape

The owner's direction is to take this model and make it ours. I do, in section 4.

| Mechanic | Why it works there | Fits us? |
|---|---|---|
| Skill by action. Each action gives XP, and a capped table to 99 | Every minute of work shows on a bar. 99 is a known, respected goal | **Yes.** Trades stay capped at 99. XP is counted in hours of work (section 4.5) |
| Success chance that climbs with Level between a low and a high value for each action. SOURCE: <https://oldschool.runescape.wiki/w/Skilling_success_rate>, and the reference study section 0 | Every Level is worth something, not only the Levels that unlock | **Yes, as one shared curve.** One global pair, not a pair for each recipe (section 4.4) |
| Cascading outcomes: roll the best result first, then the next | Rare good results come from the same action with no second system | **Yes.** It is how Fine and Master quality roll (section 4.4) |
| A level where a recipe stops failing | A goal between unlocks. Early attempts cost materials | **Yes.** `noFailSpan` |
| Fast costly XP against slow profitable XP | The player chooses between a Level sooner and gold now | **Yes, from the curve alone.** The newest recipe gives the most XP and wastes the most material |
| The alchemy price floor: any item can be destroyed for a fixed share of a catalogue value. SOURCE: 60% of the item's value, <https://oldschool.runescape.wiki/w/High_Level_Alchemy> | Nothing falls to zero, so every drop is worth picking up | **Yes, with a cap.** A catalogue value for every item and a store bid under it. But a floor paid in gold is a faucet, so ours has a daily budget, and the flame and the Weighhouse take surplus with no gold minted (section 5.5) |
| The exchange: a tax on sales, part of it used to buy and delete items, and buy limits that reset every 4 hours. SOURCE: a 2% tax capped for each item, <https://oldschool.runescape.wiki/w/Grand_Exchange>, and limits by 4 hour window, <https://oldschool.runescape.wiki/w/Grand_Exchange/Buying_limits> | The tax is a sink that grows with trade. The limits stop one rich buyer cornering a good | **Yes.** A fee and a cut, both burned. Buy limits stated in hunted hours of supply. The 4 hour window matches how often our players return |
| Production chains with level and tool gates | An item's price holds the work of several skills | **Chains yes, at most three stages. Tools yes, because they wear out.** A tool with no wear is bought once and then is not an economy. One that wears by the work-hour is bought again (section 3.7). The hall's bench rung keeps the yield bonus |

### 0.3 EVE Online

| Mechanic | Why it works there | Fits us? |
|---|---|---|
| Industry jobs: a job is started, takes real time, and uses a slot | Production is a plan made once, not a click repeated | **Yes. It is our natural shape.** A job is a server row settled in closed form. A resting hero is the slot. Section 6 |
| A job fee that is a share of the item's estimated value. SOURCE: total job cost is estimated value times a cost index and taxes, and the index rises with the work done in that place, <https://wiki.eveuniversity.org/Manufacturing> | A sink that scales with the value made and cannot be dodged | **Yes.** `jobFee`, a share of catalogue value, burned. It is the one crafting sink that grows as the player economy grows. Not the index by place |
| Blueprints with material and time research (from memory: up to 10% less material and 20% less time) | A long investment that makes one maker cheaper than another | **Yes, as trade Level and Mastery.** Yield is our material research and speed is our time research. No blueprint items for common goods |
| Invention: turn a common blueprint into a limited copy of a better one, with a chance to fail. SOURCE: <https://wiki.eveuniversity.org/Invention> | The best goods need a second, riskier craft | **Partly.** Patterns: a rare drop that teaches the company one new kind (a draught, an imbuement, a camp pot). Found, tradeable, used once |
| Destruction is the sink. Ships are lost every day | The whole economy drains through the fight | **In our own form.** We destroy the kit, not the gear. A hunted hour is our lost ship, and it is lost on schedule |
| Supply chains from mining to hull, many stages deep | Depth gives every corner a specialist | **No, past three stages.** Deep chains mean many stacks on a phone and many thin markets |

### 0.4 Wakfu

| Mechanic | Why it works there | Fits us? |
|---|---|---|
| Gathering that must be replanted. A harvested plant is gone unless someone plants | The world's stock is a shared thing players keep or strip | **No, as a rule on players.** Our heroes work while the player is away. A shared stock that others can strip overnight is a chore and a grief tool |
| Ecosystem balance. SOURCE: each territory shows its plant and monster counts, and a keeper wants them inside a range, <https://wakfu.fandom.com/wiki/Clan_Member> | Players are citizens of a place, with a duty to it | **The idea, turned around.** The Weighhouse posts what the town is short of each week, and filling it pays standing. Players balance the economy by wanting to, not by a law (section 3.6) |
| Regions run by players, with laws and taxes (from memory) | Politics as content | **No, for now.** The clan castle is our player-run place. It gets a specialty, not laws |
| Profession mastery by making, with recipes that need other professions' goods (from memory) | Professions lean on each other | **Yes.** The arrow, the rune and the draught each need two streams |

### 0.5 Final Fantasy XIV

This is the closest case to ours: gear is found, it is never lost, and crafting still matters.

| Mechanic | Why it works there | Fits us? |
|---|---|---|
| A quality and progress minigame for each craft | Crafting is play in its own right for a player who sits and does it | **No.** Nobody sits at our bench. A craft that needs the player's hands repeats a decision, which the first principle forbids. We keep its result, a quality roll, and drop the hands |
| High quality outputs | The same recipe has a better result for a better crafter | **Yes.** Plain, Fine and Master, counted in steps (section 4.4) |
| Collectables. SOURCE: goods made to hand in for rewards, which cannot be sold to players or stores, <https://ffxiv.consolegameswiki.com/wiki/Collectables> | Crafters have steady work even when no player needs their goods, and it mints no gold | **Yes, as Weighhouse orders.** The town buys surplus for standing and looks. It is our safety valve for idle labor |
| Melding. SOURCE: old gear is turned into stones that are set into new gear, and pushing past the safe slots can fail and lose the stone, <https://ffxiv.consolegameswiki.com/wiki/Materia> | Old gear is always worth something, and the best set is a costly project | **Yes, twice.** Salvage turns plain gear into scrap for Temper. Carry-over burns an old piece to keep its Trait. No gamble that loses a stone: the redesign already refuses rerolls for gold |
| How it stays relevant with almost no gear loss: every new tier resets what is best, consumables are used in every hard fight, and housing and looks soak up the rest | Demand comes from a treadmill and from flow, not from loss | **Yes, and we have more of both.** Our Levels never stop, so the treadmill never stops. Our heroes fight for hours a day, so the flow is far larger |

### 0.6 What the reference study adds

The economy and crafting reference study of 2026-11-21 (the Coordinator's compact copy) is folded in as follows.

| Its finding | Where it lands here |
|---|---|
| Price every recurring sink in hours of wage, because sinks that grow in a straight line fade at unlimited Levels | Every fee and price in section 4 is hours of wage. No exception |
| Cap the vendor faucet, not the hunt | `storeBudget`, a daily limit on what the store buys from an account, and a bid that falls as its stock rises (section 5.5) |
| Every drop needs a floor value paired with a sized sink | The cover rule of section 5.4: no stream may drop more than its sinks can burn |
| A fixed catalogue value anchors fees, deposits and burn values, never a player's price | Section 4.3 |
| Timed buffs count hunted time only | Imbuements and draughts (section 3.2) |
| A cap on crafting skills for each hero forces trade | Taken as the Mastery cap for the account (section 2.6). The per-hero form is the alternative in section 7.2 |
| Tag-weighted pools where the base changes what can roll | Crafted jewelry and cloaks roll from the Trait pool of the creature family whose part was used (section 3.3) |
| An upgrade gamble with a safety token | Refused. A failed gamble that costs a tier is a reroll with pain (section 7.2) |
| A reroll that burns parts of the matching creature family | Refused as a reroll. Kept as the cost of carry-over, which burns matching parts |
| Food has demand only if it has no substitute | The rule that Alchemy never heals (section 2.2) |
| Test market rules with price-belief agents before players arrive | Section 5.8 |

### 0.7 Our own evidence

- Real heroes spent 1.57 town hours for each hunted hour: 1,649 hours gathering and 526 crafting against 1,382 hunting, across 15 heroes on 4 accounts. (MEASURED, real play, `tools/balance-program/calibration/c4.json`.) So town work is already most of what heroes do. It also shows a ratio of three gathering hours to one bench hour.
- The rune trade had 37 hero-hours and the hearth 16, while runes were the strongest supply. The store sold every rune tier by the cast. (MEASURED for the hours, same file. JUDGMENT that the store is why.) Lesson: a store that sells the good grades deletes the trade.
- Those heroes had a 12 hour hunting limit, so some town time was simply what was left. `06-comparison.md` section 2.5 says so, and I agree. It proves the hours exist, not that players love them.
- The old ammunition rows made 500 to 1,000 arrows a job and broke the server's clamp on one item. (SOURCE: `src/data/stonecraft.js`, header.) Lesson: size recipes in hunted hours of effect, not in units.
- Today's fuel, mine and bench rows each carry typed XP, time and price, with hand corrections for each skill. (SOURCE: `src/data/gathering.js` and `src/data/recipes.js`.) The registry lists 23 of 26 economy levers as unplayable by the simulator. (SOURCE: `06-comparison.md` section 2.5.) Lesson: numbers must be generated from a few levers or they can never be tuned.

---

## 2. The nine points

### 2.1 Smithing and Woodcrafting: separate or merged

**Separate.** (JUDGMENT)

| Test | Smithing | Woodcrafting |
|---|---|---|
| Raw stream | Ore, from Mining | Logs, from Woodcutting |
| The burn it owns | Honing stones, for melee heroes | Arrows and bolts for ranged heroes, ward charms for front heroes |
| Its durable work | Temper kits for every gear piece at every tier | Timber and furniture for the hall and the castle |
| The join | Arrowheads | Shafts, and the finished arrow |

Three reasons.

1. **Two raw streams need two refiners.** Mining and Woodcutting were the two most worked skills in real play (769 and 444 hero-hours, MEASURED, `c4.json`). Each needs a maker that eats its output.
2. **The arrow is the join.** A head from one trade and a shaft from the other. An account with Mastery in one and not the other buys or sells the half it lacks. Merged, that trade between players is gone.
3. **Each has a different second job, so neither dies with one fighting style.** If ranged heroes fall out of favor, Woodcrafting still has the front hero's charms and the hall. If melee does, Smithing still has every arrowhead and all of Temper.

**What merging would buy, and why I pass.** One fewer ladder for a new player to meet. But company-owned trades already cut the ladders from one for each hero to one for the account, and that is the larger saving.

### 2.2 New professions

A new trade passes only if it has an input no other trade eats, a burner who keeps needing it, and a decision. (JUDGMENT, the purpose test of `01-identity.md` section 7.)

| Proposed | Input only it eats | Standing burner | Decision it adds | Verdict |
|---|---|---|---|---|
| **Alchemy** | Common creature parts, with herbs | Every hero, one draught a hunted hour | Which draught answers this ground | **Add** |
| **Artificing** | Rare parts, old gear, Trait pieces | Imbuements every 20 hunted hours. Trait work on every kept rare | Which imbuement to hold. Burn this piece to keep its Trait or sell it | **Add.** It takes over the old Crafting bench |
| **The rune trade** | Rune stone, with a bone binder | Casters and healers, every cast | Which rune family for this ground | **Keep, and rename** |
| **Cooking** | Fish, grain | Every hero, always | How good a table to keep | **Keep. Certain, on one condition** |
| A separate enchanting or gem trade | None. It would share Artificing's inputs | The same pieces | None new | **No** |
| A separate building trade for the hall | None. Timber and fittings | The hall | None new | **No.** Woodcrafting and Smithing make hall goods |

**Alchemy, and the rule that makes Cooking certain.** The owner marks Cooking "uncertain" and the reference study says why: if food is a small bonus beside potions, it has no demand. So the split is by job, and it is strict.

- **Cooking restores.** Meals restore health and drinks restore mana. Nothing else a player can make or buy does. It is the supply part of sustain in `04` section 3.
- **Alchemy answers.** A draught is one rule from the rule table that lasts a hunted hour: a ward against the ground's damage type, a guard against its condition, an edge against a monster role. It never restores health or mana.

With that rule Cooking is the largest steady market in the game, and the only buyer for Fishing. Without it one of the two is redundant. This keeps the spirit of the old "no potions" ruling without keeping the ruling. The owner approved the rule on 2026-11-22 (CR-Q2 a): only food heals.

**Why Alchemy earns its place: it is the burn for creature parts.** Automated hunting pours out parts every hour. Imbuements use parts once in 20 hours. A draught uses them every hour. Alchemy is the trade that keeps parts from piling up (section 5.4).

**The name of the rune trade.** "Runecrafting" is another game's skill name. I propose **Runecutting**. Our rune tiers are already cutting words in the game's own data: Chalked, Scored, Etched, Carved, Graven (SOURCE: the rulings record, rune tiers of 2026-10-23). The trade that cuts them is Runecutting. A second choice is Graving, from the top tier. To my knowledge no well known game uses Runecutting as a skill name, and that claim needs a check in the naming pass.

**Artificing as a name.** It is the owner's word and plain English. Two well known games use close words for a profession, so the naming pass should look at it once.

### 2.3 The focus mix

Crafting is all four things in the brief, in a fixed order of size. (JUDGMENT for the shares. They are the line shares of section 4.3 and the Lab confirms them.)

| Focus | Share of all town work | Its job |
|---|---|---|
| **Consumables** | About two thirds | The engine. Predictable, endless, tied to hunted hours |
| **Enhancement** | About a fifth | The value. Temper, imbuements, carry-over, crafted Trait pieces. Where a crafter's best work sells high |
| **Housing and the castle** | About a tenth, and elastic | The absorber. It takes spare labor and surplus goods, and gives a place to show them |
| **Manufacturing of gear** | None for weapons and armor. Jewelry and cloaks only | Drops own gear. A crafter makes the two slot families where a rolled Trait is the whole point |

Why consumables lead: only a flow can be sized against a flow. Why enhancement comes second: it is where one craft can matter for a hundred hours. Why housing is third: a stock fills up, so it can absorb but cannot be the engine. Why no gear: `02-architecture.md` package 5's law stands. Drops give the item. Trades improve it and keep it running.

### 2.4 Relevance with no durability

Six standing demands, none of which destroys a piece a player wants to keep. (JUDGMENT)

| Demand | What is used up | How often | Why it never ends |
|---|---|---|---|
| **The kit** | Meals, charges, draughts | Every hunted hour | Heroes hunt every day |
| **Imbuements** | Rare parts and a fee | Every 20 hunted hours for each imbued piece | The timer counts hunted time |
| **The tier treadmill** | Temper kits, scrap, a fee | Every gear tier, about every 20 Levels, for every slot | Levels have no cap, so tiers have no end |
| **Trait work** | The old piece, matching parts, a fee | Each time a kept Trait moves to a new base | The same: a new base every tier |
| **Upkeep of benefits** | Timber, fittings, wax | Weekly, for the hall's bench bonuses and the castle | A lapsed room stops helping. It is never lost |
| **Tools** | A tool for each working hero's trade | Every 12 work-hours (`toolHours`) | Heroes work every day. Wear counts work, never the clock (section 3.7) |

**The treadmill, and the one change it needs.** `02-architecture.md` says Temper carries up when a piece is replaced. If it carries for free, Temper is paid once and then never again. I recommend that the Temper rank carries, so the choice is remembered, and that seating it on the new base costs a share of its full price (`temperCarry`, start 0.35) in materials of the new band. COMPUTED: 14 slots, a full Temper of 3 hours of wage a piece, a carry of 0.35, and a tier about every 320 hunted hours (20 Levels at the 16 hour ceiling of `04` section 5) is 0.046 hours of wage for each hunted hour, about 4.6% of a hero's coin, forever.

**What I refuse.** Durability, repair bills, and gear lost on death. They work in games built on loss. Here they would tax the one thing the redesign makes exciting, a rare drop that stays with a hero for life. Tools are the one thing that wears, because a tool is the kit of town work and not a keepsake.

**One small option.** A death could spill part of the carried kit (`deathSpill`, a share of the supplies in the hunt bag). It is our gentle form of loss: it costs crafted goods, never gear, and only where the player chose risk. (SPECULATIVE. Deaths are meant to be rare once a company falls back first, so this is a small sink.)

### 2.5 Unlimited basic supplies beside valuable crafted ones

The basic system stays exactly as the player knows it: a hero uses carried stock first, then buys from the store by the use, and the hunt never stops. Three rules make crafted goods valuable beside it. (JUDGMENT)

| | Store basics | Crafted |
|---|---|---|
| Supply | Unlimited. Bought by the use | Finite. Made or bought, carried, used first |
| Lines | Meals, drinks and charges only | All four lines. Draughts and imbuements are never sold by the store |
| Strength | `storeLag` steps behind the hero's own band (start 20 steps, one gear tier) | At the band of its materials, plus up to two quality rungs |
| Price | `storeCeiling` times the reference price of the crafted good of that strength (start 1.5) | Whatever players ask. In practice between the floor and the ceiling |
| Trade | Never an item. It cannot be resold | Trades freely |

So the store is a price ceiling and a safety net. It is not a supplier of anything good. A crafted kit wins twice, on price and on strength, and the two wins are separate levers.

**How large the strength gap is.** A Master kit against a store kit is `storeLag` plus two quality rungs: 30 item steps at the starting values. The kit is one part of a hero's rating at weight `kitWeight` (start 0.15), so that is 4.5 hero steps. COMPUTED on `04`'s example ratios: about 3.2% more XP and 1.6% more coin an hour. I think that is too small to be felt, and the Lab should search `kitWeight` and `storeLag` until the gap is 6 to 10 hero steps, 4 to 7% of pace. It must stay small enough that a company on store basics still holds its ground one stance lower.

**The supply bill.** The crafted kit at its reference price costs `kitWork` times `townWageShare` hours of wage for each hunted hour. At the starting values that is 0.8 times 0.25, or 20% of a hero's coin on the Steady stance. The store kit costs 30%. (COMPUTED.) So `supplyShare` in `04` section 11 stops being a lever of its own. It is derived.

**Why the store's good grades had to go.** In real play the rune trade had 37 hero-hours while the store sold every rune tier (section 0.7). Any grade the store sells has no maker.

### 2.6 How XP, specialization, recipes, time and resources scale

The formulas are in section 4. The design in words:

- **Trade XP is hours of work.** A trade's Level is a capped table to 99, and an hour of work on a recipe near your Level is an hour of XP. Old recipes pay less XP. So the newest recipe trains fastest and wastes the most material, and an old recipe is safe profit and slow XP. That is the OSRS choice, from one curve.
- **Trade Level does four things.** It opens kinds (a product line, a camp pot, a new draught family). It raises yield from a losing rate to no-fail. It raises the chance of Fine and Master quality. It raises speed. It does not gate which Level of hero you can supply. That comes from the materials.
- **Materials set the band.** Every material carries the step of the place it came from, in bands of one gear tier. A meal made from band 12 fish is a band 12 meal. Bands have no top, so supplies follow heroes to any Level with no new recipe.
- **Specialization is Mastery.** Any account can take every trade to 99. But it holds at most `masteryCap` Masteries at once (start three of ten). A Mastery opens the Master quality rung in that trade and adds `masteryReturn` to its yield. Changing one costs hours of wage. So no account is best at everything and every account has something to sell.
- **Recipes are generated.** A recipe row holds a kind, its line, the Level that opens it and the roles of its inputs. Amounts, time, XP and catalogue value are computed.
- **Time is hours of work.** A job takes its hours of work, divided by speed. A resting hero is one job slot. Jobs run on the server while the player is away.

**Why trades stay company-owned.** `02-architecture.md` moved trades from each hero to the company, and `06-comparison.md` asked whether that cuts too much content. With the Mastery cap I think it does not: the grind is cut by up to four, and the choice (which three) is added. The alternative, trades on each hero with a cap of two a hero, is in section 7.2. The owner chose company trades with three Masteries on 2026-11-22 (CR-Q1 a).

**How long 99 takes.** `tradeHoursTo99` starts at 1,000 hours of work for a trade. COMPUTED, with each Level costing 4.5% more than the last: Level 50 at 104 hours, Level 70 at 269, Level 90 at 669, and the last Level alone takes 44 hours. An account working all four heroes a full work day (25.6 hours of work, section 5.3) reaches 99 in one trade in 39 days if it does nothing else, and in all ten in about 13 months.

### 2.7 Automated hunting without flooding the market

Six rules, in the order they bite. (JUDGMENT for the rules. COMPUTED for the sizes, section 5.)

1. **Drops are authored in hours, not in kills.** `04` section 11 already says a drop row is "one in about N hunted hours". So a stronger company does not drop more units. It drops a higher band. The number of parts made on a server in a day is its hunted hero-hours times a constant.
2. **Every burn is authored in the same hours.** The kit is sized as one hunted hour of effect. So supply and demand are two constants times the same count of hours, and population cancels out.
3. **The cover rule.** For each stream that hunting drops, a hero who uses its sinks fully must burn more than that hero drops. The ratio is the stream's cover, and it is at least 1. Users then buy from non-users, and the price cannot rest at zero.
4. **Hunters do not gather.** Fish, ore, logs and herbs come only from town labor. Creature parts, remains and gear come only from hunting. So more hunting never floods gathered goods, and labor never floods creature goods. Every recipe needs both kinds.
5. **Labor has a daily cap.** A hero can work `workDay` hours a day, Premium adds `premiumWorkExtra`, and more can be bought in pricey blocks (section 5.3). Automated work with no cap would be free and endless, and the price of everything made would fall to nothing.
6. **Surplus has somewhere to go that mints no gold.** The flame burns remains, hunted or bought. The Weighhouse takes surplus goods for standing. The store buys at a low floor, inside a daily budget.

No decay and no spoilage. A meal that rots while its owner sleeps is a chore, and the first principle forbids it.

### 2.8 Production cost, demand, sinks and trading

One chain of reasoning ties them. (COMPUTED where it gives a number. JUDGMENT for the shape.)

- **Cost.** A crafted good's cost is its hours of work times what a town hour is worth, plus the job fee. A town hour's reference worth is `townWageShare` of a hunted hour's coin.
- **Demand.** Demand is hunted hours times the share of heroes who use crafted goods. It is the most predictable number in the game.
- **Price.** The store's bid is the floor and the store's basics are the ceiling. Players set the price between them. Where it sits depends on one ratio: the labor the server's hunting asks for, over the labor its heroes can give (section 5.3).
- **Gold between players is not a sink.** A hunter paying a crafter moves gold. Only fees destroy it. So the crafting sinks are the job fee, the market fee and cut, the imbuement, Temper and carry-over fees, hall upkeep, and what the store sells.
- **The trap.** The store is the largest sink only while players fail to supply each other. A working player economy starves it. So the fee on the job, which grows with the player economy, has to carry weight. Section 5.6 shows that even then, crafting's sinks are about a fifth to a third of the faucet, and wealth sinks must do the rest.
- **Trading.** One market for everything that stacks, with standing buy and sell orders set once. Single listings for Trait pieces, as `02` has it. A fee to list and a cut on sale, both burned. Buy limits by 4 hour window, stated in hunted hours of supply. A server guide price that is the catalogue value, used for fees and limits and never set by a player.

### 2.9 What to remove, merge or redesign

Judged against today's game. (SOURCE for what exists: `src/data/recipes.js`, `gathering.js`, `stonecraft.js`, `bench-tax.js`, `town-works.js`, and `docs/design/overhaul/03-items-and-crafting.md` section 2.10. JUDGMENT for each verdict.)

| Today | Verdict | Why |
|---|---|---|
| Trade skills on each hero | **Redesign.** One Level for the company, three Masteries | Four grinds for one decision |
| The Crafting bench (arrows, planks, cloaks, belts, linings) | **Split and remove.** Arrows and planks go to Woodcrafting. Cloaks and linings go to Artificing | It was a drawer of unrelated things |
| Jewelry at Smithing | **Move** to Artificing | Smithing works the base. Artificing works the Trait |
| Store rune tiers, store ammunition tiers, blank runes at the shop | **Remove** | A grade the store sells has no maker |
| Typed XP, time and price on every gather and bench row, and the hand corrections for each skill | **Remove.** Generated from hours of work | Section 4 |
| Good batch, burnt food, and the 15% yield cap as three rules | **Merge** into the one yield curve | One formula |
| The bench tax as a share of the shop bid, waived by owning a room | **Redesign** as the job fee on catalogue value, paid by everyone | A sink that a room removes is not a sink. The room gives yield in its place |
| Hand tools as items (axes, pickaxes) | **Redesign.** One tool for each trade, worn out by 12 work-hours, made by Smithing with a cut haft (section 3.7) | With no wear a tool is bought once. With wear it is a steady buyer |
| Mining and Woodcutting between pulls on a hunt | **Remove.** Work parties in town hours | Rule 4 of section 2.7 |
| Linings, curing slots and tempering salts as three loops | **Merge.** Linings and curing become imbuements. Salts become Temper kits | Two systems where there were five |
| Hallmarks, gem jobs, chest reforging, the Lucky ring job, Luck rivets | **Remove** | Folded into Traits, Temper and the flame by `02-architecture.md` |
| Prayer by burying bones, and Inner Flame as a regeneration skill | **Remove.** Remains feed the flame | Section 2b of `02` |
| Hearth fuels as bench recipes | **Remove.** Remains burn as they drop | One less step |
| Patterns that teach worn recipes | **Redesign** as patterns that teach a kind | A crafter's rare drop |
| The Weighhouse as a gold gift project | **Redesign** as weekly orders for goods | It becomes the valve for surplus |
| Party meals | **Keep** as the camp pot, one for a party | Cooking's best product |
| Farming on shared plots | **Keep** | Slots give each account a natural cap |
| Whetstones | **Keep** as honing stones | The melee charge |
| Town work paid in closed form | **Keep** | The server budget needs it (SOURCE: `docs/design/overhaul/07-home-and-town.md` section 2.11) |
| Pressing "cook all" and "make N" by hand each day | **Remove.** Stock rules in the company plan | A repeated decision. Section 3.4 |

---

## 3. The architecture

### 3.1 The streams

Two kinds of hour make two kinds of goods, and they never cross.

```
HUNTED HOURS make                     TOWN HOURS make
  coin                                  ore, rune stone     (Mining)
  common parts   (by creature family)   logs                (Woodcutting)
  rare parts     (one carrier a ground) fish                (Fishing)
  remains                               grain, herbs        (Farming, on plots)
  plain gear, Trait gear, seed stock
```

Every maker's recipe takes at least one input from each side, except Cooking's plain meals and Smithing's bars, which are the first things a new company makes.

### 3.2 The kit: four lines for a hero, two things for a company

| Line | What it is | Made by | Burned | Kind of power |
|---|---|---|---|---|
| **Meal** | A meal and a drink. Restores health and mana | Cooking | Always, by need | The floor. Part of the rating at `kitWeight` |
| **Charge** | What the hero's style spends: honing stones (Melee), arrows or bolts (Ranged), runes (Magic), ward charms (Defense, for the front hero) | Smithing, Woodcrafting with smithed heads, Runecutting, Woodcrafting | By the swing, shot, cast or blow taken | The floor. Part of the rating at `kitWeight` |
| **Draught** | One rule for a hunted hour, picked for the ground | Alchemy | One an hour while its rule is wanted | A decision. Conditional steps |
| **Imbuement** | One rule on a gear piece for 20 hunted hours, at most three on a hero | Artificing | One for each imbued piece every 20 hunted hours | A decision. Conditional steps |
| **Camp pot** | One shared meal rule for the whole party. It does not stack | Cooking, from beast meat and grain | One a party for each hunted hour | A decision. Conditional steps |
| **The flame** | Luck, as `02` section 2b has it | Nobody. Remains burn as dropped | While the company hunts | Luck, not steps |

Two rules hold the kit together.

- **The bill is the same for every style.** A charge line costs the same hours of work for each hunted hour whether it is stones, arrows, runes or charms. No style is the expensive one. (JUDGMENT. The old game had a store-fed ranged hero spending about half its coin on shots, per the rulings record of 2026-10-23.)
- **The list is closed.** Meal and charge are the floor, like a gear base. Draught, imbuement and camp pot are decisions, like a Trait. A new consumable must replace one of these or be refused. Identity question 10 names stacks of small percents as the main waste, and a sixth line would be one.

### 3.3 The chains

At most three stages: gather, refine, make. A refine step exists only where one raw material feeds several products.

**Chain 1, ammunition. Two trades and one join.**

```
Mining   -> ore   -> [Smithing: refine]  bars        -> [Smithing: make]  arrowheads --+
Woodcut. -> logs  -> [Woodcrafting: refine] shaft stock ------------------------------+--> [Woodcrafting: make] arrows
                                                                                           one bundle = one hunted hour of shots
```

Burner: a ranged hero, by the shot. An account with a Woodcrafting Mastery and no Smithing Mastery buys heads. The same bars also make honing stones, Temper kits and fittings, so bars have a deep market.

**Chain 2, a draught. A creature part crosses grounds.**

```
Farming (plots, from seed stock found on hunts) -> herbs  --+
Hunting on ground A                             -> common parts of family A --+--> [Alchemy: make] a draught wanted on ground B
```

Burner: any hero on ground B, one a hunted hour. The part comes from a different ground than the one the draught is for, so a company hunting A sells to a company hunting B. This is "monster parts cross grounds" from `02` package 5, with an hourly burn behind it.

**Chain 3, a Trait kept for life. Enhancement, three trades.**

```
Hunting -> a Rare piece with a Trait, later outgrown --+
Hunting -> rare parts of the Trait's creature family --+--> [Artificing: carry-over] the Trait on a new base (the old piece is destroyed)
Hunting -> plain gear -> [Artificing: salvage] scrap --+
Mining  -> ore -> [Smithing: refine] bars -------------+--> [Smithing: make] Temper kit --> the new base, tempered
```

Burner: every hero, once a tier for each slot they care about.

**Walk-through of a first day, against the real starting point.** Kinds only. Each material named here exists in today's data and was checked in the file shown. The new products (bundle, band) are this design's and do not exist yet.

| Step | The company does | It holds, from earlier steps | Doable because |
|---|---|---|---|
| 1 | Hunts the first ground on store basics | Starting gold | The store sells basics by the use and a hunt never stops for stock (the rulings record, 2026-10-16) |
| 2 | Rests. One hero fishes | Nothing needed | Shrimp is a Level 1 catch feeding a Level 1 recipe (`src/data/recipes.js`, `cook_shrimp`, req 1) |
| 3 | Cooks the catch into meals | Shrimp from step 2 | Cooking opens plain meals at Level 1 |
| 4 | Mines copper, smelts bars, makes honing stones | Nothing needed | Copper is a Level 1 rock (`src/data/gathering.js`, `copper_rock`, req 1). Whetstones are smithed today (`src/data/stonecraft.js`, header) |
| 5 | Sets a stock rule: keep 12 hours of meals and stones | Meals and stones from steps 3 and 4 | The rule is new. It needs only the two kinds already made |
| 6 | Hunts again on its own meals and stones, with the store behind them | Stock from step 5 | Own stock is used first, then the store |

Draughts, arrows and runes need a part or a second trade, so they come after the first day. That is on purpose: the first kit a player makes needs one trade and one stream.

### 3.4 Work without repeated decisions

The first principle applied to the bench. (JUDGMENT)

- **Stock rules.** The company plan holds a target for each kit line, in hunted hours: "keep 24 hours of meals for each hero". It also holds what the company may buy, and at what price at most.
- **The server plans the work.** From the targets it builds the job list back through the chain: make meals, and if fish is short, fish first. Resting heroes take jobs from that list.
- **The player decides once.** Which trades, which targets, which Masteries, what to sell. The return card shows what was made, what ran short and what it cost.
- **A job is hours.** One press, or one rule, covers a whole work day. Nobody presses "make 50" again tomorrow.
- **Tools too.** The same plan keeps spares for each trade the company works, and the server swaps one in at a break (section 3.7).

### 3.5 How crafting plugs into the rest

| System | The plug |
|---|---|
| **Rolled Traits** | Crafted jewelry and cloaks roll one Trait. The pool is the Trait pool of the creature family whose rare part went into the craft, so a crafter aims by choosing a part, and a part's price follows its pool. The rank rolls on the quality cascade of section 4.4, so a master's ring is more often rank 2 or 3. Carry-over moves one Trait and burns the old piece, matching parts and a fee |
| **The luck flame** | Remains burn as dropped, by the stoke rule in the plan, and remains bought on the market burn too (the owner's answer, 2026-11-22). Runecutting also wants bone as a binder, so the flame, the rune trade and the market bid for the same remains. Drop chasers are the new buyers. Every remains sale pays the market tax, a gold sink, and every burn destroys the goods. The flame's room caps how much bought fuel can do, as `02` section 2b has it. Crafted Trait rolls do not read the flame. A crafter's luck is their Level and Mastery |
| **Creature parts** | Common parts go to draughts by the hour. Rare parts go to imbuements, jewelry and carry-over. Beast meat goes to the camp pot. Every part has an hourly or a tier burn |
| **The hall** | Each maker has a room. A room's rung is that trade's bench bonus to yield, kept up weekly in timber and fittings. A lapsed room falls to the plain bench and loses nothing else. Plots for Farming. Storage for stock. A trophy wall for Master work |
| **The castle** | A clan picks two trades as the castle's works. Members get a yield bonus in those two, so clans specialise and trade with each other. The castle's stages and upkeep are paid in crafted goods and in labor hours, which makes it the largest absorber of spare labor |
| **The party** | Each hero pays for their own kit. One camp pot serves the party. A hired hero's kit is an open question (section 7.3) |
| **The market** | Stacks by kind, band and quality. Standing orders from the stock rules. Trait pieces as single listings |

### 3.6 The Weighhouse orders

Each week the town posts orders for goods the server has too much of, sized by the count of active accounts. The server already counts weekly actives for the Weighhouse's goal (SOURCE: `src/data/town-works.js`, `perActive`). Filling an order pays standing: looks for the hall, a plaque, patterns. It pays no gold and no power. It turns idle labor and surplus stock into something worth having without minting a coin. (JUDGMENT. It is the collectable idea of section 0.5, pointed at whatever is in surplus.)

### 3.7 Tools that wear out

The owner's idea of 2026-11-22: a tool breaks after 12 hours of use, and the Crowns store sells tools that never break, with their own look and work animation. Taken, with three choices of mine: wear counts work, quality sets life and not speed, and the Crowns tool is bound. (JUDGMENT unless a line says otherwise.)

- **One tool for each trade.** Pick, axe, rod, hoe, knife, hammer, saw, chisel, mortar and graver, for Mining, Woodcutting, Fishing, Farming, Cooking, Smithing, Woodcrafting, Runecutting, Alchemy and Artificing. Working names. A hero working a trade holds its tool. Salvage is an Artificing job, so the graver is the salvage tool. Gear never wears. Tools are not gear: they are the kit of town work, as meals are the kit of a hunt.
- **It wears by the work-hour, never by the clock.** A Plain tool lasts `toolHours` work-hours (12, the owner's number). Bought work wears it like any work. Being away costs nothing.
- **Smithing makes it, with a cut haft.** Every tool is a smithed head on a haft from Woodcrafting. It is the arrow turned around: the arrow is Woodcrafting's with a smithed head, the tool is Smithing's with a cut haft. Each trade needs the other, so accounts trade.
- **The band sets where it works. Quality sets how long.** A tool carries the band of its materials, like every made good. At or above the job's band it works at full speed. Behind it, the job slows by the contest curve of section 4.2: 93% speed 20 steps behind, 71% at 100. So a far company gets nothing from a new player's cheap tools. Quality adds life and never speed: Fine lasts 15 work-hours and Master 18 (`toolLifeRung` 0.25). Every tool at the job's band works the same, and a Master smith sells a tool that is cheaper by the hour.
- **The plan swaps it.** A stock rule, set once: keep this many spares for each trade the company works, made or bought at no more than this price. At a break the server puts a spare in the hero's hand inside the same write. With none in stock the hero rents the store's tool by the work-hour, Plain, `storeLag` behind and at `storeCeiling`, as with store basics: about 7% slower and 40% dearer an hour. Work never stops for a tool. The return card says in one line what broke and what is left.

**What it costs.** A tool holds `toolWork` work-hours (start 1.0) on the stage shares of section 4.3, so a Plain tool's catalogue value is 0.25 hours of wage at its band. That is 0.021 hours of wage for each work-hour, a twelfth of what the hour makes. An account on the mix works about 21 hours a day and wears about 1.75 tools: 0.44 hours of wage a day, 1.8% of the coin it mints. Small and steady, on purpose. (COMPUTED.)

**What it gives Smithing and Woodcrafting.** Tools ask for one work-hour in every twelve, half of it in Mining and Woodcutting and half at the two benches. Every working hero is a buyer, whatever their fighting style, so the two trades no longer lean only on melee and ranged heroes (the style risk of section 7.1). It also lifts the labor ratio by 12/11: on the mix from 0.75 to 0.82, and in `04` section 11's what-if with Premium and bought blocks from 0.84 to 0.92. Both sit inside the 0.8 to 1.0 this page wants. (COMPUTED: tool labor is all labor x `toolWork` / `toolHours`, so it is an eleventh of kit labor.)

**The Crowns tool.** It never breaks. It has its own look and work animation in our pixel style, seen by everyone in town while the hero works. On any job of its trade it works exactly like a crafted tool at the job's band: never faster, never a better yield. The plan hands it to whichever hero works its trade, so a company working Mining on two heroes at once wants two. It is bound to the account and never trades. A tradeable one would be a second road from money to gold, outside the Crowns book's weekly cap, price band and hold, and it would add no demand the book does not carry already: a player with gold who wants one buys Crowns on the book. It saves about 0.17 hours of wage a working day for one hero (COMPUTED: 8 work-hours / 12 x 0.25), so it sells a look and never thinking about spares, not gold. Each one takes one hero's tools off the market, and the Lab reads Crowns tools as a share of tool demand. `10-premium.md` section 4 ranks it among the Crowns sinks.

**Refused.** Wear by the clock, which punishes being away. Quality as speed, which would make the Crowns tool weaker than the best crafted tool or better than most. Wear on gear (section 2.4).

---

## 4. The shared mathematical framework

Everything below is in the units of `04-math-strategy.md`: the step, the wage, and hours. No recipe, ground or item has a number of its own.

### 4.1 The units

```
W(s)        the wage: coin for one reference hunted hero-hour at step s
            W(s) = wageBase x payStepCoin ^ s                       (04, section 11)
work-hour   one hour of one resting hero's town work at the reference bench
kit-hour    the supplies one hero burns in one hunted hour on Steady
band        a material's step, in blocks of tierSteps (one gear tier)
```

### 4.2 The band: why a traded supply must carry a step

`04` section 3 says food and drink are "one row for each quality, not a ladder for each tier", priced in seconds of the wage. That works for the store, where the server sets the price at the buyer's own step. It cannot work for a good one player makes and another buys.

COMPUTED, on `04`'s example `payStepCoin` of 0.35%: a Level 1,000 hero earns 32.9 times the coin of a Level 1 hero. If one meal served both, the far hero would bid for a new account's work at 33 times that account's own wage. New players could not afford their own food, and the best gold in the game would be a fresh account cooking.

So a crafted good carries the step of its materials, and its effect runs through the same contest as everything else:

```
effect on a hero = base share x powerStep ^ (item step - hero step)
item step        = band step of its materials + quality steps
```

held to at most `wearAhead` above the hero, as gear is. A meal 20 steps behind its eater restores 93% as much. One 100 steps behind restores 71%. One 900 steps behind restores 4%. (COMPUTED at a 0.35% step.) Neighboring bands are close substitutes, which keeps the band markets joined into one price curve. Far bands are useless to each other, which keeps a far player out of a new player's market.

Because the makers of band b goods are companies near step b, their time is worth about W(b). So gold prices climb with the band by themselves, at the rate of the wage. Nobody types a price for a band.

**Where bands come from.** A creature part has the band of the Danger step it dropped at. A gathered material has the band of the ground the work party went to, and a company may send work parties only to grounds where it holds a depth record. Past the last hand-made region a band is a number on the item.

### 4.3 Production cost and material requirements

One lever sets the size of all crafting:

```
kitWork = work-hours behind one kit-hour, all four lines, at no-fail yield      (start 0.8)
```

Two content tables split it. Both sum to one.

| Line share | Start | | Stage share | Start |
|---|---|---|---|---|
| Meal | 0.35 | | Gather | 0.50 |
| Charge | 0.35 | | Refine | 0.20 |
| Draught | 0.20 | | Make | 0.30 |
| Imbuement | 0.10 | | | |

A recipe row holds only: its kind, its line, the trade Level that opens it, and the roles of its inputs with a share for each role. Then:

```
work(recipe)        = kitWork x line share x stage share x hours of effect in one output
amount of input i   = work behind the recipe's inputs x role share i / work behind one unit of i
job time            = work(recipe) / speed(L)
catalogue value V   = total work-hours in the good x townWageShare x W(band step) x quality factor
job fee             = jobFee x V, burned
```

`townWageShare` is the reference worth of a work-hour as a share of a hunted hour's coin (start 0.25). The catalogue value is the server's own number for a good. It anchors the job fee, the store's bid and ask, market fees, buy limits and the flame's burn value. A player's price never anchors anything.

Durable and timed work is priced the same way, in hours of wage at the piece's step:

```
imbuement      imbueWork work-hours of goods + imbueFee hours of wage, for imbueHours hunted hours
Temper rank    temperHours hours of wage, half in Temper kits and scrap, half as a fee
Temper carry   temperCarry x the full Temper price at the new tier
carry-over     the old piece + matching rare parts + carryHours hours of wage
Mastery change masteryHours hours of wage
hall upkeep    a weekly basket of timber and fittings worth hallUpkeep hours of wage
tool           toolWork work-hours of goods, lasting toolHours x (1 + toolLifeRung x rung) work-hours
tool speed     1 at or above the job's band, powerStep ^ (tool band step - job band step) below it
```

### 4.4 Yield, quality and speed: one curve from the OSRS model

OSRS gives each action its own low and high value. We keep the shape and make the pair global. For a recipe that opens at trade Level R, worked at Level L:

```
t          = clamp((L - R) / noFailSpan, 0, 1)
yield      = yieldAtReq + (1 - yieldAtReq) x t                      0.75 at R, 1.00 at R + 15
           + masteryReturn                 if the company holds the Mastery        (+0.10)
           + bench bonus                   from the hall room or castle works      (up to +0.10)
           capped at yieldCap                                                     (1.25)

P(Master)  = masterTop x (L - R) / (99 - R)       only with the Mastery           (top 0.50)
P(Fine)    = fineBase + (fineTop - fineBase) x (L - R) / (99 - R)                 (0.10 to 0.60)
roll Master first, then Fine, else Plain                                          (the cascade)

item step  = band step + qualitySteps x (0 Plain, 1 Fine, 2 Master)               (5 steps a rung)
speed      = 1 + (speedAt99 - 1) x L / 99                                         (up to 1.25)
```

Yield under 1 means some inputs are lost. Yield over 1 means some come back. That one number is the failed attempt, the burnt food, the good batch and the return rate.

A job of many attempts is settled in one calculation: attempts are the job's hours over the recipe's time, the dice are seeded when the job starts, and the server writes at the start and at the end.

### 4.5 Crafting XP and progression

```
hours for trade Level n     h(n) = h1 x tradeCurve ^ (n - 1),  summing to tradeHoursTo99
XP for a job, in hours      = work-hours done x xpFactor
xpFactor                    = 1 inside xpWindow Levels of the recipe's R, falling to xpFloor below it
```

With `tradeHoursTo99` of 1,000 and `tradeCurve` of 1.045 (COMPUTED): 6.6 hours to Level 10, 35 to 30, 104 to 50, 269 to 70, 669 to 90, 1,000 to 99. The cost of a Level doubles about every 16 Levels.

**The training choice, as arithmetic.** A company that always works its newest recipe has a mean yield of about 0.875 across each 15 Level window, so it uses about 14% more material for the same output and trains at full speed. A company that works recipes it has mastered loses nothing and trains at `xpFloor`. (COMPUTED from the curve.)

Gathering uses the same three formulas. A work party's recipe has no inputs, and its yield is units an hour.

### 4.6 What the store does, in the same units

```
store ask   = storeCeiling x V of the Plain good at (hero band step - storeLag)     by the use, never an item
store bid   = floorShare x V, falling a fixed step for each unit the store already holds, inside
              storeBudget hours of wage for an account each day
```

### 4.7 The levers this adds

| Lever | Start | Search | What it sets |
|---|---|---|---|
| `kitWork` | 0.8 | 0.5 to 1.2 | Town work behind a hunted hour. The size of the crafting economy |
| `workDay` | 8 h | 6 to 12 | A hero's daily town work. The size of the labor supply |
| `premiumWorkExtra` | 2 h | 1 to 2, at most a quarter of `workDay` | What Premium adds to the work day. Half of the payer gap (section 5.3) |
| Bought work: block, price, growth, clamp | 2 h, 0.5, 1.5, 4 | 1 to 3, 0.4 to 0.6, 1.3 to 1.8, 3 to 6 | Town work bought past the cap. The one price rule of `04` section 11 |
| `townWageShare` | 0.25 | 0.15 to 0.35 | What a work-hour is worth beside a hunted hour |
| `kitWeight` | 0.15 | 0.10 to 0.25 | The kit's share of a hero's rating. Taken from the other weights of `04` section 1 |
| `storeLag` | 20 steps | 10 to 30 | How far the store's basics sit behind |
| `storeCeiling` | 1.5 | 1.25 to 2.0 | How much dearer the store is |
| `floorShare`, `storeBudget` | 0.4, 1 h of wage | 0.2 to 0.5, 0.5 to 2 | The vendor floor and its daily cap |
| `qualitySteps` | 5 | 3 to 8 | Steps for each quality rung |
| `yieldAtReq`, `noFailSpan`, `yieldCap` | 0.75, 15, 1.25 | | The yield curve |
| `fineBase`, `fineTop`, `masterTop` | 0.10, 0.60, 0.50 | | The quality cascade |
| `tradeHoursTo99`, `tradeCurve` | 1,000 h, 1.045 | 600 to 1,500 | The trade table |
| `masteryCap`, `masteryReturn` | 3, 0.10 | 2 to 4 | Specialization |
| `jobFee` | 0.25 of V | 0.10 to 0.35 | The crafting sink that grows with the player economy |
| `partCover`, `flameCover`, `scrapCover` | 1.25, 1.5, 1.2 | 1.0 to 2.0 | The cover of each hunting stream |
| `imbueHours`, `temperHours`, `temperCarry`, `carryHours` | 20, 3, 0.35, 10 | | The enhancement prices |
| `toolHours`, `toolLifeRung` | 12 h, 0.25 | 8 to 24, 0.15 to 0.35 | How long a Plain tool lasts, and the life each quality rung adds. 12 is the owner's number |
| `toolWork` | 1.0 | 0.5 to 1.5 | Work-hours in a tool. Its price, and the share of labor tools ask for |
| `storageBase` | Set by the Lab | Room for three bands of every kind the company works | Stacks a company stores before the hall's rung and Crowns tabs (section 6) |

About nineteen global levers, counting pairs as one. `04`'s `supplyShare` becomes derived, so the net is about fifteen. Content tables beside them: the line shares, the stage shares, and the kind rows. A balance number keyed by a recipe, an item or a ground has nowhere to live, the same rule as `04` section 12.

### 4.8 Built (lane/trade-formulas, 2026-11-22)

**How it plays:** players never see this section. It is the one rule every town-work number comes from, so a new good is a data row and a new band is a number.

**What exists.** `src/core/trades.js` is the rule and `src/data/trades.js` holds the levers of 4.7 that had no home and the kind rows. The levers this page shares stay where they were: `kitWork`, `townWageShare`, `storeCeiling` and the meal and charge shares in `src/data/store-kit.js`, one band in `GEAR_STEPS.tierSteps`, the contest curve's `powerStep` in `src/data/danger.js`, the wage in `src/data/wage.js`, the work day in `src/data/work-day.js`. `tools/gen-trades.mjs` writes `1063-trade-formulas-catalogue.generated.sql` (STAGED): the server's copy and 16 internal twins, each pinned to the JS. `tests/trade-formulas.mjs` holds the rule to this page's numbers and sweeps the twins on the replayed chain (36 mutants). `tools/balance-program/redesign/trades/measure.mjs` prices the engine's measured burn and plays the job.

**The formula table, as built.** L is the company's trade Level, R the recipe's, b the band, q the quality rung (0 Plain, 1 Fine, 2 Master). Every number is whole (permille, micro-hours, milliseconds) and every price is one rounding of an exact product, so the server's twins land on the same gold.

| Quantity | Formula | At the starting values |
|---|---|---|
| A kit kind's work | `kitWork` x line share x its split x its kit-hours | a meal or a drink 0.14 work-hours, any charge 0.28, an imbuement 0.53 (21's 20 hours over its 3 slots) |
| Stage split | gather 0.5, refine 0.2, make 0.3; a chain with no refine step gives its share to the make | |
| A raw unit | the gathering behind one meal | 0.07 work-hours, 14.3 an hour at yield 1 and speed 1 |
| Materials | round(the material work the stage shares give / one unit's work), at least 1; V follows the counts | a meal is 1 fish, a honing stone 2 bars, a bar 1 ore, an arrow an arrowhead and a shaft, a Temper kit 3 bars |
| A part | its share of a host kind's work, made in its own trade | an arrowhead is half an arrow (Smithing), a haft half a tool (Woodcrafting) |
| Hunted inputs | cover x share x kit-hours, in hour-units (13-market 3.2) | a draught 1.25 hour-units of common parts, a rune 0.15 of remains, an imbuement 6.67 of rare parts and 1.0 of remains |
| A recipe | (kind, rung); rung r opens at Level 1 + 10 (r - 1); its band is the job's | 37 kinds, 350 recipes, every band |
| Yield | 750 + 250 x min(L - R, 15) / 15, + 100 with the Mastery, + the bench up to 100, at most 1250 | 750 on a new rung, 1000 fifteen Levels on, 1200 with both |
| Fine, Master | Master first: 500 x (L - R) / (99 - R), Mastery only; then Fine: 100 + 500 x (L - R) / (99 - R) | |
| Speed | 1000 + 250 x L / 99 | 1002 at Level 1, 1126 at 50, 1250 at 99 |
| Trade XP | worked ms x the XP factor / 10^6 (XP is seconds of work); full within 20 Levels of R, then down in a straight line to 250 over 20 more | |
| The trade table | h(n) = h1 x 1.045^(n - 1), 1,000 hours to 99 | 6.6 hours to Level 10, 104 to 50, 669 to 90, the last Level 44 |
| V | floor(work x `townWageShare` x wage(item step) x life), item step = 20 b + 5 q; a tool's and an imbuement's quality is life (+25% a rung: 09 3.7, 21 D-7), not step | a meal at band 3 is 572 / 584 / 596 gold, a charge 1,145 |
| Job fee | ceil(0.25 x the Plain V x count), finished goods only | a chain pays it once, on its whole V |
| Store ask | ceil(`storeCeiling` x V of the Plain good at (the hero's band step - 20)), meals, drinks and charges only | a meal 794 and a charge 1,587 for a Level 60 hero |
| Store bid | floor(0.4 x V), at most 1 hour of wage an account a day | |
| Behind a band | floor(1000 / 1.0035^steps) | 932 a band (20 steps) behind, 705 at 100 |
| Tools | life 12 x (1 + 0.25 q) work-hours; speed full at or above the job's band, the contest curve behind it; the store rents one a tier behind at `storeCeiling` | 12 / 15 / 18 hours, 0.023 hours of wage a work-hour |
| The job's bound | attempts = min(count, floor(elapsed x speed x tool / own work)); units at most the attempts (twice for gathering over 1000); sets back at most the attempts over 1000; XP exact | what the server re-checks a proposed settle against |
| The settle | one seeded pass (`src/core/rng.js`): gathering makes a unit with the yield's chance under 1000 and a second with (yield - 1000)'s over it; making loses the set on a miss under 1000 and hands it back with chance 1 - 1000 / yield over it; then Master, Fine, Plain | the same seed lands the same goods |

**Choices this page left open, made here (JUDGMENT, each a lever the Lab can move).** Ten rungs ten Levels apart, an XP window of 20 and a floor of 0.25. The raw unit read off the meal, so no unit size is typed. The job fee on finished goods only: charged at every stage it came to 55% of an arrow's V (bar, arrowhead, shaft and arrow each paid), against section 5.6's arithmetic, which charges `jobFee` once on the kit's value. Quality as item steps for a good and as life for a tool and an imbuement (3.7, 21 D-7). A Temper kit is 21's `kitHoursPm` (0.1 hours of wage) of Smithing, 0.4 work-hours, and an imbuement's life and rung are 21's `IMBUE`, read through `BORROWED` and never typed twice. The meal line split half food, half drink. The camp pot as four draught kit-hours, opening at rung 5. Hunted inputs in hour-units: how many physical parts an hour-unit is belongs to the drop formulas, not to this page.

**Measured.** The burn is the real engine's: v1-climb on Muster Barrows, the mixed MID four from step 0, 6 seeds x 8 h at Levels 60, 63 and 70 and each stance (`tools/balance-program/redesign/trades/lab-muster.json`), priced on these formulas by `measure.mjs` (`measured.txt`). The job is played: `settleJob` over 100 seeds of an 8 h day a stage, every stage of a chain at the company's Level.

| Reading | Careful | Steady | Bold | Against |
|---|---|---|---|---|
| Kit-hours a hero-hour at Level 60, meal line / charge line | 0.74 / 0.96 | 1.14 / 1.07 | 1.35 / 1.12 | 1.0 / 1.0 by definition (`refRestore`, `refCharges`) |
| Crafted bill at V, hours of wage a hunted hour (share of gross) | 0.139 (0.166) | 0.175 (0.172) | 0.193 (0.176) | 0.16 at the reference on v0.3.0's three lines (2.5) |
| Store bill, a tier behind at 1.5x (share of gross) | 0.165 (0.197) | 0.215 (0.211) | 0.240 (0.219) | 0.194 at the reference; the live store takes 0.273 / 0.278 / 0.282 of gross |
| The same at Level 70, Steady | | 0.162 crafted, 0.198 store | | the band's goods cost the same while the hero's wage grows through the band |

| A work-hour's value, hours of wage at the goods' band (the whole chain) | Level 1 | Level 50 | Level 99 |
|---|---|---|---|
| Ore, gathered | 0.19 | 0.25 newest rung, 0.28 first | 0.31 first, 0.37 with a Mastery and a bench |
| Meal (fish, cooked) | 0.16 | 0.24 / 0.28 | 0.31, 0.38 |
| Honing stone or rune (gather, refine, make) | 0.13 | 0.22 / 0.28 | 0.32, 0.42 |
| Arrow (two trades and a part) | 0.11 | 0.21 / 0.28 | 0.32, 0.46 |
| After the job fee | 0.75 of each, gathering untouched | 0.21 on the first rung | 0.24, 0.35 at most |

Against `townWageShare` 0.25: a work-hour is worth it on the first rung from about Level 15, under it on the XP route (the newest rung wastes material, 4.5's choice), and up to 1.85 times it at the top. The labor ratio on the measured burn is 1.09 for a hero who hunts the full 10 h day (1.18 with tools) and 0.66 on 5.1's 6 h mix (0.71 with tools), against 1.0 and 0.6 at the reference. The store's floor sells 8.8 idle work-hours an account-day on the mix for 0.88 hours of wage, 3.6% of the coin it mints, inside the 1 hour budget. A Steady charge kit-hour is 3,344 shots for the bow and 1,314 casts for a caster. Four findings sit in `CONFLICTS.md` (2026-11-22, trade-formulas): the stale reference burn, the live store's strength, bought work at the top, and the imbuement's two units.

**Not built: the job slice (section 6).** No verb, engine or client reads the catalogue yet, and the live town work (`src/data/recipes.js`, `gathering.js`, `hr_activities`) is untouched until the slice replaces it. The slice's contract, so it is plumbing: a `trade_jobs` row (account, hero, kind, rung, band, count, start on the server's clock, a seed drawn by the server, the fee paid, the inputs held, the tool's band, quality and wear, and the milliseconds of an unfinished attempt carried across a stop, or a stop at the work day's end loses up to one attempt: 32 minutes on an imbuement). `hr_trade_job_start(slot, kind, rung, band, count, price, idem)` under the hero lock and the trade key: refuses `bad_kind`, `rung_locked` (the company's Level under R), `band_locked` (no depth record at that band), `work_cap`, `quote_changed` (the fee re-quoted by `hr_trade_job_fee`), `short_inputs`; debits the inputs and burns the fee through `hr_apply`. The settle runs `settleJob` from the stored seed and `hr_apply` admits it only inside `hr_trade_job_bound` (attempts and XP exact, units and sets back at most). Banded stacks keyed (kind, band, quality); the store's good a tier behind in strength and price at once, inside the hunt; Mastery verbs; the tool swap; Weighhouse orders. All of it is money: `13-security-list.md` S-10.

### 4.9 The kit trades' recipes, banded by step (2026-11-26, game designer, lane/k1-kit-trades-sample)

**How it plays:** each metal is a new recipe. On day one your company cooks shrimp and fletches bronze arrows. When your heroes start wearing iron, Cooking 11 and Woodcrafting 11 open the iron band's food and arrows. One crafted good feeds or arms a hero for one hunted hour, so your stock reads in hours. The store always sells the same thing one band behind for half again the price. It keeps you hunting and never beats your own goods.

**The rule.**

1. **A recipe is one kind at one band.** The band is its materials' band, one gear tier and one metal (`12-targets.md` 8.3). It opens at trade Level 1 + 10 x band: rung band + 1, band 9 and every band past it at Level 91, never before the kind's own rung (`src/core/trades.js bandRung`). Its good stands at step 20 x band, plus 5 for Fine and 10 for Master.
2. **One finished good is one hunted hour of its line for one hero** (section 3.3's bundle). Its work is `kitWork` x its line share x its split: a meal or a drink 0.14 work-hours, any charge 0.28. That work runs down its chain at gather 0.5, refine 0.2, make 0.3, and its inputs are the same band's goods by those shares: a meal is 1 fish, an arrow 1 arrowhead and 1 shaft, a rune 2 cut stones and 0.15 hour-units of remains. V is its work x `townWageShare` x wage(its step), as in 4.8.
3. **The store sells the same kind, Plain, one band behind the hero's band** (band 0 sells band 0), at `storeCeiling` 1.5 x its V there, by the use. Per hour of effect that is 1.49 to 1.50 times the crafted good at the hero's band, and 1.50 times the crafted good one band behind, at every band from 0 to 8. The store is the floor and never the best buy.

**Calls made here.**

- **The trade Level gates the band.** Under 4.8 alone the band was the job's and the rung was only an XP choice, so a company at Cooking 16 cooked every band at full yield. Levels 16 to 99 bought quality and speed and nothing else, which is a skill nobody needs to level. Now each metal is ten Levels on. That is the OSRS shape: a new product as you level. The training choice is the newest band (full XP, yield 0.75 to 0.92, the strongest good) or the band behind (yield 1.0, 7% weaker, 7% cheaper).
- **Band 0 needs no depth record.** The first band is open to every company, so a new account's first visit to town can work every recipe in the sample. Every other band keeps 4.2's rule: a depth record at that band or deeper (ruled 2026-11-27, lane/designer-kit-band1: bands 1 to 3 have one or two grounds each, so an exact match would leave a company that skipped the Glade without iron; built in `hr_trade_band_open`, lane/k1-server-fixes). A band 0 record would cost one kill, so it never bounded an idle alt's labor. The store floor's daily budget does that (5.5), and an alt earns far more by hunting.
- **The good is the bundle, counted in hours.** The band 0 goods keep the live items the first hour already names (`20` section 3.2: Cooked Shrimp, Bronze Arrows, Copper Ore), and the job slice re-cuts each to one hunted hour. A good with no live item yet (the arrowhead) becomes an item with the verb that makes it, never before (the W0 rule).
- **Own stock first, never two bands behind.** The plan spends the company's own goods at the heroes' band or one behind, then the store. A good two or more bands behind is weaker than the store's, so the plan sells it to the store floor or leaves it in storage.
- **The work day is planned whole.** The server plans every work-hour from the stock rules (3.4), so a company that has something to make uses its whole day. The pace table below is why: at 0.8 of the day used, the kit lags its heroes by a band or more on 76 days of 140.

**The sample** (`src/data/trades.js` `KIT_RECIPES`, resolved by `tradeCatalogue()` as `named`, five rows, one a trade, CLAUDE.md section 10). Each row holds only its kind, its band and a label: the id, the trade Level, the inputs, the hours and every price are derived. Read on `src/core/trades.js` at band 0, a Level 1 company.

| Recipe | Trade | Kind, band | Opens at | Inputs (band 0 items) | Work in one good | One attempt at Level 1 | V | Job fee | Store ask, Level 1 / Level 60 |
|---|---|---|---|---|---|---|---|---|---|
| Mine Copper Ore | Mining | ore, 0 | 1 | none | 0.07 h | 4.2 min | 226 | none (raw) | none |
| Forge Bronze Arrowheads | Smithing | arrowhead, 0 | 1 | 1 Bronze Bar | 0.14 h | 2.5 min | 452 | none (a part) | none |
| Fletch Bronze Arrows | Woodcrafting | arrow, 0 | 1 | 1 Bronze Arrowheads, 1 Normal Plank | 0.28 h | 2.5 min | 905 | 227 | 1,358 / 1,587 |
| Cook Shrimp | Cooking | meal, 0 | 1 | 1 Shrimp | 0.14 h | 4.2 min | 452 | 113 | 679 / 794 |
| Cut Chalked Fire Runes | Runecutting | rune_fire, 0 | 1 | 2 Blank Runes, 0.15 hour-units of Bones | 0.28 h | 5.0 min | 905 | 227 | 1,358 / 1,587 |

The arrowhead and the arrow are chain 1 of 3.3, two trades and one join, so the sample plays the one recipe that needs another trade's part. Bronze Arrowheads is the sample's one new good: made by one row and used by another. `tests/kit-recipes.mjs` holds all of this: one row a trade, rung by band (swept over every kind and bands 0 to 12), every input a door and every output a use (read from `catalogue-coherence.js`), the store the dearest option at every band, and a good one hunted hour (13 mutants, each caught by its own arm).

**Walk-through: the first day, on real data.** What the company holds at each step comes only from the steps before it and the real starting kit (`src/data/start-kit.js`: 500 gold, 10 Shrimp, 20 Cooked Shrimp, 50 Bronze Arrows, 10 Coarse Whetstone). Every item, node and monster below was grepped on the set. "Job slice" means the verb that plays it is the backend lane in HANDOFFS (2026-11-26, K1), and the step is doable once it lands.

| # | Step | Holds and can reach | Real source | Doable |
|---|---|---|---|---|
| 0 | Hunt the Mill Cellar | The starting kit | `hunts.js mill_cellar` spawns `rat` (Giant Rat), which drops `bones` (ch 0.21, `monsters.js`) | Yes |
| 1 | Mine Copper Ore, Mining 1 | Nothing needed. Band 0 needs no depth record | `gathering.js copper_rock` (req 1, makes `copper_ore`). Kind `ore`, rung 1 | Job slice |
| 2 | Smelt bars, Smithing 1 (the catalogue's refine) | Copper Ore from step 1 | Kind `bar` from 1 ore. Item `bronze_bar` | Job slice |
| 3 | Forge Bronze Arrowheads, Smithing 1 | Bronze Bar from step 2 | Kind `arrowhead`, 1 bar. New good `bronze_arrowheads` | Job slice |
| 4 | Chop logs and saw planks, Woodcutting 1 and Woodcrafting 1 | Nothing needed | `gathering.js normal_tree` (req 1, `normal_log`). Kind `shaft`, item `normal_plank` | Job slice |
| 5 | Fletch Bronze Arrows, Woodcrafting 1 | Arrowheads from step 3, planks from step 4 | Kind `arrow`, 1 arrowhead and 1 shaft. Item `bronze_arrows` | Job slice |
| 6 | Cook Shrimp, Cooking 1 | The kit's 10 Shrimp, or more from the Shrimp Spot | `start-kit.js` shrimp 10. `gathering.js shrimp_s` (req 1). Kind `meal`, item `cooked_shrimp` | Job slice |
| 7 | Mine Rune Essence and cut Blank Runes, Mining 1 and Runecutting 1 | Nothing needed | `gathering.js essence_rock` (req 1, `rune_essence`). Kind `cut_stone`, item `rune_blank` | Job slice |
| 8 | Cut Chalked Fire Runes, Runecutting 1 | 2 Blank Runes from step 7, bones from step 0 | Kind `rune_fire`. Item `chalked_fire_rune`. Remains as bones | Job slice |

No step needs a trade Level above 1, a depth record, the market or a second day. The walk found one gap, now ruled: under 4.2's depth-record rule a brand-new company could not gather anything, so band 0 is open to all.

**The labor ratio at 10, 12 and 14 hours,** MEASURED: the tuning pass's burn (`tools/balance-program/redesign/tuning/final/c0-muster-ref.json`, the Steady four at Level 60 on Muster Barrows, 8 seeds x 10 h) priced by `node tools/balance-program/redesign/trades/measure.mjs --from tools/balance-program/redesign/tuning/final/c0-muster-ref.json`. The kit trades' two lines ask 0.56 work-hours a hunted hour (0.64 with imbuements, which are Artificing's). A company of four alike makes the share of its kit its labor covers and the store fills the rest, since v0.3.0 has no market.

| Hunting a hero a day | Free work day 8 h, 0.8 used | Free, whole day used | Premium work day 10 h, 0.8 used | Kit made at home / from the store (free, 0.8) | Gold the kit costs, share of gross (free, 0.8) |
|---|---|---|---|---|---|
| 10 h | 0.875 (1.00 with imbuements) | 0.70 | 0.70 | 100% / 0% | 0.034 |
| 12 h | 1.05 (1.20) | 0.84 | 0.84 | 95% / 5% | 0.041 |
| 14 h | 1.225 (1.40) | 0.98 | 0.98 | 82% / 18% | 0.062 |

At V the same kit is 0.135 of gross and from the store 0.187. So a 10 h day sits inside the 0.8 to 1.0 this page wants, 12 h tips just over 1 and the store fills a twentieth, and 14 h (two bought hunting blocks) leans on the store for a fifth of its kit. Every day here fits one clock (hunting plus work at most 24 h).

**The pace: do trade Levels keep up with the heroes?** Played day by day in the same tool: a company of four (a hammer, a bow, two casters) hunting each day, its kit's own work is that trade's XP, and the spare hours go to the trade furthest behind the band its heroes wear. A chain's band is the lowest band its trades open.

| Hunting, work day, share used | Days the worst kit line is at the heroes' band / one behind / two or more (of 140) | At band 8 (day 107 on the 10 h day, Level 150) |
|---|---|---|
| 10 h, 8 h, whole day | 122 / 18 / 0 | every line one behind |
| 10 h, 8 h, 0.8 | 64 / 57 / 19 | arrows and honing stones two behind |
| 10 h, Premium 10 h, 0.8 | 122 / 18 / 0 | every line one behind |
| 12 h, 8 h, whole day | 67 / 73 / 0 | every line one behind |
| 14 h, 8 h, whole day | 1 / 21 / 118 | arrows four behind |
| What-if: 10 h, 8 h, 0.8, ten Levels a band cut to eight | 139 / 1 / 0 | at band |

- **The band span stays 10.** A planned day keeps the kit at its heroes' band 87% of days and never two behind. A span of 8 keeps pace even at 0.8, but every band past the eighth would then open at Level 73, and Levels 74 to 99 would open nothing. The span is the lever if a played week shows lag (`TRADE_LEVERS.rungs.span`, search 8 to 10).
- **What lags is the low-demand trade.** One bow in four burns a quarter of the charge line, so Woodcrafting and Woodcutting get 0.7 work-hours a day of kit work against Cooking's 5.6. The plan's spare hours are what carry them, which is why the day is planned whole.
- **At 14 h the store is the floor, as it should be.** The arrow line is four bands behind only in the company's own stock. The plan buys the store's arrows a band behind in its place, so the hero hunts at store strength and pays the store's price. Hunting all day and working only the free day is a choice with a gold cost, never a dead end.
- **Premium's work hours keep the kit at band like a planned free day.** That is hours, never rate (5.3), it is inside the kit's `kitWeight`, and a free company matches it by planning its whole day or buying one work block.

**Not built here (the backend lane, HANDOFFS 2026-11-26, K1):** the job verb and its settle, the face items and the bundle unit in the hunt engine, the band 0 open rule, the store a band behind in strength as well as price (W1's remainder), and the rest of the recipes. The rest land in batches of 20 or fewer once the sample is read: band 0's other kinds first (the drink, the honing stone, the bolt, the ward charm, the other five rune families and the gather and refine rows), then a band a batch.

### 4.10 Built: the job slice (lane/k1-job-slice, 2026-11-26, backend architect)

**How it plays:** in the Work window a resting hero picks a recipe and presses Start. The server quotes a whole work day of it (as many as the bag and Storage feed, its fee). The hero works it with the page open or the browser closed; at the end Collect, or the server a minute later, puts the goods in Storage (Fine and Master in the company's stock) and the XP on the company. Stop lands what is done and hands the rest of the materials back.

**The contract** is the header of `supabase/migrations/1073-k1-job-slice.sql`; Security rows S-10 and S-27. Sixteen recipes: the eleven named rows and one job an imbuement (`src/data/trades.js IMBUE_JOBS`, imbueRecipe's 5 parts and 4 Remains). `hr_trade_job_start` refuses in the spec's order (bad_recipe, busy, rung_locked, band_locked, work_cap, count_cap, quote_changed, short_inputs); `hr_trade_job_end` collects (not_due before the server's end) or stops. The settle is `hr_trade_roll`, the generated twin of `settleJob`, on the seed the server drew at the start, re-checked inside `hr_trade_job_bound`. Both doors run the same function at the same instant (the job's true end), so `tests/trade-jobs.mjs` TJ-BOTH lands identical goods viewed and closed.

**Calls made here (each in CONFLICTS 2026-11-26 k1-job-slice for the designer):**
- **The server rolls the dice itself.** Section 6's one roller is kept as one rule: `hr_trade_roll` is generated from `src/core/trades.js` and pinned to it exactly (every sample and every recipe's own job, plus a sweep in the guard), so no engine call, no proposal to bound and no edge change; a job keeps running with nothing awake but the database.
- **Trade XP has its own store**, `company_trade_xp`, on this page's table (seconds of work). `company_trades` is the live skills' XP on their old curve; one number read on two curves would let a job's hours open the live bench and back. The two meet when the slice replaces the live town work.
- **An hour-unit of a stream is what 21's imbuement takes of it:** 4 Remains, 0.75 rare parts. So an imbuement is exactly imbueRecipe's set and a rune's 0.15 hour-units of Remains is one bone (rounded, never under one).
- **Remains a band:** Bones at bands 0 and 2, Razor Claw at band 3 (`STREAM_FACES.remains`).
- **Imbuements open at Artificing 1**, not at their band's rung: none sits under band 2, so a Level-21 gate would leave the trade untrainable.
- **A stop burns the fee** (the spec's): the materials of every unattempted set come back, the fee does not.

**Not built (handed on):** the bundle unit in the hunt engine (a kit good opening into its hour of uses, Systems); Fine and Master goods spent by the hunt and by `hr_imbue_apply` (they wait in `company_stock`); the stock rules and the planned day (3.4); the standing work-block rule buying for a job (its sweep reads the pointer); Mastery, the bench bonus and tools (the roller takes them, nothing passes them yet).

### 4.11 One town work: the job slice's six calls, ruled (2026-11-27, game designer, lane/designer-calls-1127)

**How it plays:** your company has one list of trades, and each trade has one Level. A resting hero opens the Work window, picks a recipe and works it for the day. That is the only town work in the game. Every company starts every trade at Level 1.

**The ruling, one rule a line.**

| # | Call (CONFLICTS 2026-11-26, k1-job-slice) | Ruling | Why |
|---|---|---|---|
| 1 | Two XP stores for one trade name | **The job slice is the town work. The live bench is cut in the release that lights `trade_jobs`, and nothing converts.** Cut together: the gather and artisan windows (`hr_activities`' town kinds, `gathering.js` nodes as town work, the `recipes.js` bench), the trade rows of `player_skills`, `company_trades` and its sync trigger (1059), the old curve for trades, and the skills Crafting and Runecrafting. **One store:** `company_trade_xp`, on 4.5's table (seconds of work, 1,000 hours to 99). Every writer of trade XP writes it in seconds of work: a job its worked time (built), a farm harvest one raw unit of work a crop (4.8's raw unit, 252 s). The switch is never lit beside the live bench | One number read on two curves gives two Mining Levels, so one curve has to go, and the redesign's is 4.5's. Converting the old XP is pointless: v0.3.0 starts new accounts (`20` "No hero conversion"), and CLAUDE.md section 1 has no back-compat. The farm stays because a harvest is already one press for a day of growing (the first principle at work). Only its XP unit moves |
| 1a | What the player sees | **One Skills list.** The combat skills read as now. The trade lines read the `trade_jobs` section's `trades` (xp, level): Mining, Woodcutting, Fishing, Farming, Cooking, Smithing, Woodcrafting, Runecutting, Artificing. Alchemy shows no line until it ships. The Work window is the only place town work starts. The release note says every trade starts at Level 1 | A trade with no recipe on its list is a half-built feature, and those stay hidden (CLAUDE.md 3.5) |
| 1b | What the cut needs first | **Band 0's second batch, so the job list makes every good the first day needs.** Today it does not: an arrow needs a Bronze Bar and a Normal Plank, a rune needs a Blank Rune, and only the live bench makes them (`KIT_RECIPES` has no gather or refine row, and `validateKitRecipes` refuses a refine row in the sample). The batch: the gather rows (Normal Log, Shrimp, Rune Essence, the grain), the refine rows (Bronze Bar, Normal Plank, Blank Rune), the honing stone and the drink. The sample's cap becomes "band 0 whole". It is built after the sample of five is played on `tools/qa/local-world.mjs` with `trade_jobs` lit (CLAUDE.md section 10), and the cut ships with it | The walk-through below is doable only with these rows. Without them the cut would leave Fletch Bronze Arrows and Cut Chalked Fire Runes with no way to make their inputs |
| 2 | An hour-unit of a hunted stream, in goods | **Kept: 4 Remains an hour-unit, 0.75 rare parts. A rune takes one bone a set, never a fraction, with no carried remainder** | 21's imbuement recipe is the one count anybody authored, so it defines the unit. A carried remainder is state a player can't see. A rune's bone costs 1.67x its share of the cover, but that is one bone for an hour of runes against the dozen or more bones a Cellar hour drops (the Giant Rat's 0.21 a kill), so it never binds |
| 3 | Remains a band | **Kept** (Bones at bands 0 and 2, Razor Claw at band 3, `STREAM_FACES.remains`) | Each band's Remains face drops where that band's parts drop, so the binder comes from the grounds the band hunts |
| 4 | The imbuement's band and rung | **Kept: imbuements open at Artificing 1**, their band from their part's entry Level | Gating the first imbuement at Artificing 21 with nothing under it would leave the trade untrainable. The band still keeps a far company's parts out of a new player's market |
| 5 | A stop burns the fee | **Overruled: a stop refunds the fee of every set it never attempted.** Kept: `fee - ceil(fee x attempted / count)` comes back, through one `hr_apply` gold credit journalled `trade_fee_refund`, the same instant the materials come back | The fee is the sink on goods made (4.3). Charging it on goods never made taxes changing your mind, and a misclicked whole-day job would cost a day's fee for nothing. No exploit: the refund is at most the fee the same job burned, and the attempted sets keep theirs. A gold credit, so Security's (S-10, S-27) |
| 6 | Fine and Master goods with nothing that spends them | **Quality is dark until something spends it: in v0.3.0 every job lands Plain.** The cascade's numbers stay in `TRADE_LEVERS.quality`, and a switch there (off) zeroes Fine and Master for the roller and its twin. Quality lights with its first consumer: the hunt's bundle unit reading a meal's item step, or `hr_imbue_apply` reading an imbuement's life. `company_stock` stays, empty until then | A Fine meal the hunt can't read is the same meal. A pile the player can't spend is a dead reward, and the return card would say 40 made with 32 in Storage. Half-built features stay hidden (CLAUDE.md 3.5) |
| 7 | The work-block rule doesn't buy blocks for a job | **The standing work rule buys for the job.** When a hero's open job would stop at the day's cap with sets left, the rule buys the next work block (up to its count a day) and the job runs on. 1073 already raises `ends_at` when bought work lengthens the day. The pointer the sweep reads leaves with the live bench | With one town work, the job is what bought work is for. A rule that buys for nothing would be a decision with no effect |

**Walk-through: the first day after the cut, on real data.** The starting kit is `src/data/start-kit.js`: 3,200 gold, 10 Shrimp, 20 Cooked Shrimp, 50 Bronze Arrows, 10 Coarse Whetstone, 8 Turnip Seed. "Sample" is a row in `KIT_RECIPES` today, and "batch 2" is row 1b's, which ships with the cut. Every id below was grepped on the set (`items.js`, `gathering.js`, `trades.js KIT_FACES`).

| # | Step | Holds and can reach (steps before only, plus the kit) | Real source | Doable |
|---|---|---|---|---|
| 0 | Hunt the Mill Cellar | The kit | `hunts.js mill_cellar`, the Giant Rat drops `bones` | Yes |
| 1 | Cook Shrimp, Cooking 1 | The kit's 10 Shrimp. The fee is 113 a meal, 1,130 for ten, from 3,200 gold | `meal_b0` (sample), `shrimp` to `cooked_shrimp` | Yes once lit |
| 2 | Mine Copper Ore, Mining 1 | Nothing needed, band 0 is open to all | `ore_b0` (sample), `copper_ore` | Yes once lit |
| 3 | Smelt Bronze Bars, Smithing 1 | Ore from step 2 | `bar` at band 0, `bronze_bar` | Batch 2 |
| 4 | Forge Bronze Arrowheads, Smithing 1 | Bars from step 3 | `arrowhead_b0` (sample), `bronze_arrowheads` | Batch 2 (its input) |
| 5 | Chop logs, saw planks, Woodcutting 1 and Woodcrafting 1 | Nothing needed | `log` and `shaft` at band 0, `normal_log`, `normal_plank` | Batch 2 |
| 6 | Fletch Bronze Arrows, Woodcrafting 1 | Arrowheads from step 4, planks from step 5 | `arrow_b0` (sample), `bronze_arrows` | Batch 2 (its inputs) |
| 7 | Mine Rune Essence, cut Blank Runes | Nothing needed | `rune_stone`, `cut_stone` at band 0, `rune_essence`, `rune_blank` | Batch 2 |
| 8 | Cut Chalked Fire Runes, Runecutting 1 | Blank Runes from step 7, bones from step 0 | `rune_fire_b0` (sample), `chalked_fire_rune` | Batch 2 (its input) |
| 9 | Read the trades | Steps 1 to 8 each paid XP into `company_trade_xp` | The `trade_jobs` section's `trades`, one Level each | Yes once lit |

The walk found the gap in row 1b: with the sample alone, steps 4, 6 and 8 have inputs only the live bench makes. So the cut and batch 2 are one release.

**Built here:** `src/data/trades.js` `TRADES.was` now says what it is for (the live skill the trade replaces, which the cut deletes; nothing carries over). Everything else above is the backend's cut slice and the batch-2 data lane (HANDOFFS 2026-11-27, designer-calls-1127). No new migration from this lane.

### 4.12 Built: band 0 whole and the slice's three calls; the cut's contract (lane/one-town-work, 2026-11-27, backend architect)

**How it plays:** on the first day every good the band 0 jobs need is itself a band 0 job: chop logs, saw planks, mine ore, smelt bars, catch shrimp, mine rune essence and cut blank runes, pull turnips and press juice, grind whetstones. A job you stop gives back the fee of every set it never got to. A job the day would cut short is kept going by your work-block rule, if you set one. Everything a job makes is Plain until something in the game reads quality.

**Built (STAGED, dark with `trade_jobs`):**
- **Batch 2 of band 0 (row 1b).** Nine `KIT_RECIPES` rows: `log_b0`, `fish_b0`, `rune_stone_b0`, `grain_b0` (Turnip), `bar_b0`, `shaft_b0`, `cut_stone_b0`, `honing_stone_b0` (Coarse Whetstone, 2 bars), `drink_b0` (Turnip Juice). Twenty named rows in all, 25 job recipes with the imbuements. The validator's cap is "band 0 whole": one row a kind a band, a refine row allowed. `tests/kit-recipes.mjs` KR-CLOSED holds the cut's precondition: every town input of a band 0 job is made by another band 0 job, never only by the bench, the store or the kit (17 mutants).
- **Quality dark (row 6).** `TRADE_LEVERS.quality.live` false; `settleJob` and its twin `hr_trade_roll` read it (`hr_trade_levers.quality_live`) and roll no quality at all. 1063's VERIFY(m) pins the lit cascade with the row lit for the probe and put back, so the day it lights the twin is already the JS.
- **The fee back (row 5).** `hr_trade_job_close` credits `fee - ceil(fee x attempted / count)` through one `hr_apply`, journalled `trade_fee_refund`, keyed by the job. Security S-28.
- **The rule buys for a job (row 7).** `hr_time_auto_buy` and `hr_time_auto_sweep` restated in 1073 (pinned to 1071): a hero whose open job would stop at the cap with sets left is working for the rule.
- **The farm's unit.** `cropXp()` (252) and `hr_trade_levers.crop_xp`, for the cut's farm writer.

**Calls made here (CONFLICTS 2026-11-27 one-town-work):** the fee comes back at the day's cap as well as at a stop (the same goods never made); `grain_b0` is a Farming job beside the plots (the farm grows with no work-day cost, the job spends the day); the hearth's fuel runs stay the one bench run (they train Inner Flame, a combat skill, lane/f1-inner-flame's).

**Not built: the cut (row 1).** It cannot land alone. Counted on this set (the items by `catalogue-coherence`, the guards by search, the cut not run): 61 replay guards name a gathering or bench pointer in their fixtures, the cut retires the edge's gather and artisan channels, the Work window's gather and bench rows and the first hour's "Cook 10 Shrimp" through the bench, and 145 live items lose their every door (43 ammo, 37 foods and drinks, 27 jewelry, 18 materials, 12 gathering tools, 6 armor, 2 more; `dawn_bar`, the Dawnsteel Temper kit's input, among them). So the cut is one landing of four lanes, and its server half is this contract.

| Layer | What the cut does | Owner |
|---|---|---|
| Data | `SKILLS_DEF` combat only; `hr_activities` keeps only the hearth's `fuel_*` rows, and only until F1 lights the company flame (4.13 row 3) (regenerated `1065` by `tools/gen-catalogues.mjs`); the 145 doorless items (listed below) get a band's `KIT_RECIPES` batch (bands 1 to 8, 20 or fewer a batch: `KIT_BATCH_MAX` is a batch cap since 4.13) or a cut | Designer |
| Server | One file `NNNN-one-town-work-cut.sql` after `1073` and the regenerated `1065`: drop `hr_trade_row_sync` (trigger and function), `company_trades`, and `hr_trade_lock` / `hr_trade_is` once nothing calls them; delete every `player_skills` row whose skill left `hr_skills`, one `admin` ledger row an account (`one_town_work_cut`, the XP removed by skill; nothing converts); every pointer, errand and last activity naming a cut activity to idle; the farm's XP writers credit `company_trade_xp` farming `crop_xp` a crop and its gates read `hr_trade_level_of`; restate the readers that name trade skills (`hr_lb_skills`, `hr_market_eligible`'s artisan door, `hr_players_online*`, `hr_unlock_buy` / `hr_unlock_guard`, `hr_hunt_after_job`, `hr_resume_plan`, `hr_work_day_view` without `trades`); the `bench_run` and `bench_tax` sections and the bench's client verbs (`hr_recipe_learn`) leave the envelope and the baseline. ITS LAST STATEMENT LIGHTS `trade_jobs`, so no apply leaves the bench live beside the switch or the bench gone with it dark. §self-check: no trade row in `player_skills` or `hr_skills`, no cut pointer, a farm harvest credits 252 a crop, every bench verb gone, grant hygiene | Backend |
| Edge | `set-activity.js` refuses `gather`; `artisan` only for the hearth; `accrue-gather.js`, `tick-gather.js` and the bench half of `accrue-artisan.js` / `tick-artisan.js` retire; `catalogue.js` loses the bench | Reliability (one deploy, the release's) |
| Client | The Work window is the Jobs list, the work blocks and the hearth; the Skills window's trade lines read `trade_jobs.trades`; `town-work.js`, `bench-fee.js`, `bench-output.js`, `station-sort.js`, `town-ticker.js` retire; the bag's Cook all, the first hour's coach and the item tips' "Made by" lines point at jobs | Systems |
| Guards | The 61 replay guards: a guard whose subject was the bench retires with that said (CLAUDE.md 3.6); a unique catch (the world tick's token and writer checks, conservation, the settle budget) is re-aimed at the hunt channel or a job | Each layer's lane |

The four land as one merge on the set, after the designer's item batches, in the release that ships `trade_jobs`.

**The 145 the cut would orphan, by band and kind** (game designer, lane/designer-kit-band1, 2026-11-27). Counted from the data by `node tools/balance-program/redesign/trades/cut-orphans.mjs` (its `--check` holds `cut-orphans.json`), on set/v0.2.144 before band 1 landed. An item is orphaned when every door it has is the bench (every skill but the hearth's fuel runs, which make no item) or a gathering node, and no job makes it. The farm, drops, the store, the kit and the chests stay doors. Its band is its item Level over 20, else the metal or wood in its name (bronze and copper 0, iron and oak 1, steel and willow 2, mithril and maple 3, rune and yew 4, ember 5, dawn 6, cobalt 7, wolfram 8), else its bench or node Level read on the job ladder (band = (Level - 1) / 10, rounded down). Kind: ammo (arrows, bolts, whetstones, runes), food, drink (mana), jewelry, tool, armor (cloaks and a shield), weapon, material.

| Band | Ammo | Food | Drink | Jewelry | Tool | Armor | Weapon | Material | All |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 6 | 6 | 0 | 0 | 0 | 1 | 1 | 1 | 15 |
| 1 | 10 | 3 | 1 | 9 | 2 | 0 | 0 | 1 | 26 |
| 2 | 8 | 6 | 1 | 6 | 2 | 2 | 0 | 2 | 27 |
| 3 | 2 | 5 | 0 | 0 | 2 | 0 | 0 | 3 | 12 |
| 4 | 8 | 3 | 1 | 0 | 2 | 0 | 0 | 2 | 16 |
| 5 | 6 | 6 | 1 | 3 | 2 | 1 | 0 | 1 | 20 |
| 6 | 1 | 3 | 0 | 3 | 2 | 1 | 0 | 1 | 11 |
| 7 | 1 | 1 | 1 | 3 | 0 | 1 | 0 | 1 | 8 |
| 8 | 0 | 2 | 0 | 3 | 0 | 1 | 0 | 1 | 7 |
| 9 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| All | 43 | 37 | 5 | 27 | 12 | 7 | 1 | 13 | 145 |

| Band | The items |
|---|---|
| 0 | Ammo: `chalked_earth_rune`, `chalked_ice_rune`, `chalked_poison_rune`, `chalked_rupture_rune`, `chalked_water_rune`, `copper_whetstone`. Food: `cooked_copper_crab`, `cooked_herring`, `cooked_wolf_meat`, `copper_crab`, `roasted_carrot`, `turnip_mash`. Armor: `graypelt_cloak`. Weapon: `klappas_club`. Material: `copper_bar` |
| 1 | Ammo: `barbed_arrows`, `iron_arrows`, `iron_bolts`, `iron_whetstone`, `scored_earth_rune`, `scored_fire_rune`, `scored_ice_rune`, `scored_poison_rune`, `scored_rupture_rune`, `scored_water_rune`. Food: `cooked_pikeperch`, `cooked_trout`, `wheat_bread`. Drink: `carrot_juice`. Jewelry: `banded_signet_follow`, `banded_signet_keen`, `banded_signet_keen_follow`, `banded_signet_keen_surge`, `banded_signet_surge`, `banded_signet_surge_follow`, `fang_studs_focus`, `fang_studs_steady`, `fang_studs_steady_focus`. Tool: `iron_axe`, `iron_pickaxe`. Material: `oak_plank` |
| 2 | Ammo: `etched_earth_rune`, `etched_fire_rune`, `etched_ice_rune`, `etched_poison_rune`, `etched_rupture_rune`, `etched_water_rune`, `steel_arrows`, `steel_whetstone`. Food: `baked_potato`, `cooked_goldgill`, `cooked_lobster`, `cooked_panther_meat`, `cooked_silverfin`, `pikeperch`. Drink: `tomato_juice`. Jewelry: the six `seam_jasper_band_*`. Tool: `steel_axe`, `steel_pickaxe`. Armor: `steelgrate`, `warband_bulwark`. Material: `field_ration`, `willow_plank` |
| 3 | Ammo: `mithril_arrows`, `mithril_whetstone`. Food: `cooked_bear_meat`, `goldgill`, `roasted_pumpkin`, `silverfin`, `tomato_soup`. Tool: `mithril_axe`, `mithril_pickaxe`. Material: `flux_salt`, `maple_plank`, `verdite_ore` |
| 4 | Ammo: the six `carved_*_rune`, `rune_arrows`, `rune_whetstone`. Food: `carrot_stew`, `cooked_swordfish`, `vegetable_stew`. Drink: `pumpkin_cider`. Tool: `rune_axe`, `rune_pickaxe`. Material: `verdite_bar`, `yew_plank` |
| 5 | Ammo: the six `graven_*_rune`. Food: `cooked_shark`, `ember_tart`, `fishers_pie`, `pumpkin_pie`, `river_chowder`, `swordfish`. Drink: `goldenroot_tea`. Jewelry: `ember_earrings`, `ember_necklace`, `ember_ring`. Tool: `ember_axe`, `ember_pickaxe`. Armor: `archmage_cloak`. Material: `heartgarnet` |
| 6 | Ammo: `dawn_whetstone`. Food: `bear_claw_pie`, `cooked_frostfin`, `goldenroot_roast`. Jewelry: `dawn_earrings`, `dawn_necklace`, `dawn_ring`. Tool: `dawn_axe`, `dawn_pickaxe`. Armor: `duskweave_cloak`. Material: `dawn_bar` |
| 7 | Ammo: `emberhead_arrows`. Food: `shark`. Drink: `emberfruit_cordial`. Jewelry: `cobalt_earrings`, `cobalt_necklace`, `cobalt_ring`. Armor: `samite_cloak`. Material: `runewood_plank` |
| 8 | Food: `cooked_moonfish`, `moonfish`. Jewelry: `wolfram_earrings`, `wolfram_necklace`, `wolfram_ring`. Armor: `cerecloth_cloak`. Material: `duskwood_plank` |
| 9 | Ammo: `dawnpoint_arrows`. Food: `moonbloom_elixir`, `void_banquet` |

**What each becomes (the designer's rule for the batches to come).**

- **A band's kit face, in its band's batch:** the band's arrow, honing stone, rune tier (all six families), one meal, one drink, its plank and its bar, and the bolt at iron only (4.14). Bands 1 to 5 are built (4.13 to 4.15), band 5 with no rune or stone, whose ladders end a band earlier (4.15). `dawn_bar` is band 6's bar and lands with band 6 (or as a one-row batch before the cut, since the Dawnsteel Temper kit spends it).
- **A second good of one kind at one band is cut with the bench** (4.9 rule 1: a recipe is one kind at one band, so two meals a band are the same hour of food twice): the extra foods and drinks at each band once its batch has picked its one meal and one drink, the raw fish no batch picks and no monster drops, `barbed_arrows`, `copper_whetstone`, `copper_bar`, and the Deep Seam bridge (`verdite_ore`, `verdite_bar`, `flux_salt`: one bar a band). A band's arrow is its metal's, so the two named arrows are their metals' arrows: `emberhead_arrows` is band 5's and `dawnpoint_arrows` band 6's (4.15 re-ruled the cut this list once made).
- **Jewelry (27), the cloaks and `heartgarnet` are Artificing's Trait crafts** (section 2: crafted jewelry and cloaks roll Traits from the part used). They need kinds `KINDS` does not have yet. Ruled at the end of 4.13: the kinds for the Trait craft (after v0.3.0), and each piece's fate at the cut.
- **The gathering tools (12) are cut with the bench.** They speed the gathering nodes the cut removes. The `tool_*` kinds bring tools back as job tools when they ship (20 section 1.4).
- **The named-piece reforges** (`klappas_club`, `steelgrate`) are gear, and gear drops (section 2): each becomes a drop of its named source in `28-named-pieces.md` or is cut.
- **Uses that outlive their source** are re-pointed by the cut's data lane to the band's face: the room and property costs on `cooked_trout`, `cooked_lobster`, `cooked_shark`, `wheat_bread`, `field_ration`, `goldenroot_roast`, `moonbloom_elixir` and the oak, willow, maple, runewood and duskwood planks, and the Hallmark and reforge offers on the crafted jewelry.

### 4.13 The cut's four calls, ruled, and band 1 (2026-11-27, game designer, lane/designer-kit-band1)

**How it plays:** a job you start and never finish costs you nothing for the sets it never got to, whatever ended it. Farming has a job like every other gathering trade, and the plots keep growing on their own beside it. The Great Hearth is fed from the Hearth panel and by your stoke rule while you hunt, never by a hero standing at it. Each new metal arrives as one batch of jobs.

| # | Call (CONFLICTS 2026-11-27, one-town-work) | Ruling | Why |
|---|---|---|---|
| 1 | The fee back when the day's cap ends a job, not only at a stop | **Kept as built: the fee of every set never attempted comes back, however the job ends** (a stop, the day's cap, Collect at the end). One rule, `fee - ceil(fee x attempted / count)`, journalled `trade_fee_refund` | 4.11 row 5's reason covers it word for word: the fee is the sink on goods made. The quote's count is a whole day's attempts whatever is left of the day, so without it a job started at noon always pays for sets the clock never allowed. If the standing work rule buys a block (4.11 row 7) the job runs on, and only the sets still unattempted at its true end come back. No exploit: the refund is at most what the same job burned, and gold parked in a fee earns nothing |
| 2 | `grain_b0` (Pull Turnips), a Farming job beside the plots | **Kept, and every band gets its crop the same way** (band 1 Pull Carrots). The plots stay the passive door | Two doors, two different costs: the plots cost seeds and no work hours, the job costs work hours and no seeds. A company with spare hours pulls, a company whose hours are spoken for plants. That is a real choice, never the same choice twice. Cutting it would leave Farming the one gathering trade with no job, so its Level would read on the Skills list with nothing in the Work window (4.11 row 1a: hidden is the rule for that). Merging the plots into a job would make the farm cost work hours it never did and lose the one town door that runs on no clock |
| 3 | The hearth's fuel runs kept as the one bench run (they train Inner Flame) | **Overruled: there is no bench run in the target.** The flame is the company's (21 section 1): Remains go on it through the stoke rule and the Burn press (`hr_flame_burn`), and Flame Level is what burns down while heroes hunt. The `fuel_*` rows and the old Inner Flame skill XP retire with F1 (21 section 1, build step 5; lane/f1-inner-flame). Bridge only: if the cut ships before F1 lights the company flame, the cut keeps the `fuel_*` rows and the artisan channel for the hearth alone, and F1's lighting removes both. Nothing new is built on them | A hero standing at a fire to train a skill is the old bench in a new coat: a press repeated every day for a number. 21's flame is set once (the stoke rule) and then runs on what you hunt, which is the first principle. Keeping the run would also leave two ways to raise one flame, a bench Level and a Flame Level |
| 4 | `KIT_BATCH_MAX` counts every named row (20), so band 1 cannot be added | **Built: a cap a batch.** `src/data/trades.js` `KIT_BATCHES` holds the named rows as batches (`band0-sample` 5, `band0-whole` 9, `temper-kits` 6, then a band a batch), `KIT_RECIPES` is the batches end to end, and `validateKitRecipes` refuses a batch past 20 | CLAUDE.md section 10's 20 is an authoring pace (play a batch, read it for repetition, then the next), never a ceiling on the game. A per-band cap would bite a correct band once Alchemy ships its draughts. `tests/kit-recipes.mjs` KR-BATCH proves it on synthetic faces: two batches of 15 pass, one of 21 is refused, two mutants (the cap counts the whole list again, no cap) |

Found on the way and fixed: `validateKitRecipes` read the shipped faces whatever faces it was handed, so a caller passing its own table was checked against the wrong one. It reads its `faces` argument now.

**Band 1, iron: built (STAGED, dark with `trade_jobs`).** Two batches, each read for repetition (CLAUDE.md section 10).

*How it plays:* once a hero has a depth record on the Mosslight Glade and a trade reaches Level 11, the Work window offers that trade's iron job. Iron ore smelts to Iron Bars, which forge Iron Arrowheads and grind Iron Whetstones. Oak logs saw to Oak Planks. An arrowhead and a plank make an Iron Arrow or an Iron Bolt. Trout cooks to Cooked Trout, carrots press to Carrot Juice, and two Blank Runes and a bone cut any of the six Scored runes. A band 0 caster can now cut every family of Chalked rune, not only fire.

| Batch | Rows | What |
|---|---|---|
| `band0-runes` | 5 | Cut Chalked Earth, Water, Ice, Poison and Rupture Runes. The sample cut only fire, so a caster on any other family had only the store on the first day |
| `band1-iron` | 18 | Mine Iron Ore, Chop Oak Logs, Catch Trout, Pull Carrots, Smelt Iron Bars, Saw Oak Planks, Cook Trout, Press Carrot Juice, Grind Iron Whetstones, Forge Iron Arrowheads, Fletch Iron Arrows, Fletch Iron Bolts, and Cut Scored Earth, Water, Fire, Ice, Poison and Rupture Runes |

43 named rows in five batches (5, 9, 6, 5, 18), 48 job recipes with the imbuements. Every band 1 row opens at its trade's Level 11 (rung 2, `bandRung`), and the Tempering Salts (band 1's Temper kit, already named) at Smithing 21, the kind's own rung.

*Calls made here.*

- **The rune's stone has no metal.** Rune Essence and Blank Runes are every band's goods, made by band 0's two jobs alone, so a band's rune is its tier (Scored at band 1) and its binder. A stone a band would be eight new goods with no decision in them, and a second Cut Blank Runes job behind Level 11 would be the same good at the same work behind a gate. The validator now refuses any good made by two rows ("one good, one recipe"), and `KIT_FACES` names the shared face at each band so a rune's inputs still read its own band.
- **Band 1's Remains are Bones** (`STREAM_FACES.remains[1]`). Band 1 has no imbuement, but its runes bind with Remains. The Mosslight Glade, the band 1 ground (gear Level 20), drops Bones from the Glade Poacher, the Goblin Sluicer and Rook the Poacher, so bands 0 to 2 bind with one good, and the binder changes where the imbuement's does.
- **The first bolt is band 1's.** The bolt opens at Woodcrafting's second rung, so band 0 has none. Iron Bolts take the Iron Arrowhead and an Oak Plank, the arrow's own chain, so a ranged company makes both from one forge.
- **One new good: Iron Arrowheads** (`iron_arrowheads`, booked at 25 under the Iron Bar's 30 like the bronze head under its bar, a placeholder icon re-dyed from the Barrow Nail by `tools/world-art/job-face-icons.mjs` for the Art Director to judge).
- **Band 1's meal is Cooked Trout and its drink Carrot Juice.** The other band 1 foods (`cooked_pikeperch`, `wheat_bread`) and `barbed_arrows` are second goods of one kind at one band, cut with the bench (4.12). Kitchen 1's Cooked Trout keeps its source, and Kitchen 3's Wheat Bread is the cut's data lane's to re-point.

*Every input has a source and every output a use* (`tests/kit-recipes.mjs` KR-SOURCE and KR-CLOSED, read from `catalogue-coherence`). Every town input of every band 0 and band 1 job is made by a job at its band or below. The bones are a monster drop. Every output is worn, eaten, drunk or spent by another job. After band 1 the cut orphans **128** live items, not 145 (`cut-orphans.mjs`): 17 gained a job (the five Chalked runes, the six Scored runes, Iron Arrows, Iron Bolts, Iron Whetstones, Cooked Trout, Carrot Juice and Oak Planks). Band 1's last five are the cut's (`barbed_arrows`, `cooked_pikeperch`, `wheat_bread`, the iron axe and pickaxe), and its nine rings and studs are Artificing's.

**Walk-through: a company's first iron day, on real data.** It holds what the band 0 walk-through (4.11) ends with: band 0 goods and every trade trained on band 0 jobs. Each trade needs 7.5 work-hours of its own XP to reach Level 11 (`tradeXpTable`), about a quarter of one free day of a company of four. Every id was grepped on the set (`items.js`, `monsters.js`, `hunt-grounds.js`, `danger.js`, `trades.js`).

| # | Step | Holds and can reach (steps before only, plus band 0) | Real source | Doable |
|---|---|---|---|---|
| 0 | Hunt the Mosslight Glade to a depth record | Band 0 gear and kit. The Glade opens at Level 16 | `hunt-grounds.js mosslight_glade`, `DANGER_GROUNDS.mosslight_glade` gear Level 20 (band 1, `hr_trade_band_open`). Drops `bones` (`glade_poacher`, `goblin_sluicer`, `rook_poacher`) | Yes |
| 1 | Mine Iron Ore, Mining 11 | The band 1 record from step 0. No input | `ore_b1`, face `iron_ore` | Yes once lit |
| 2 | Smelt Iron Bars, Smithing 11 | Ore from step 1 | `bar_b1`, 1 `iron_ore` to `iron_bar` | Yes once lit |
| 3 | Forge Iron Arrowheads, Smithing 11 | Bars from step 2 | `arrowhead_b1`, 1 `iron_bar` to `iron_arrowheads` (new) | Yes once lit |
| 4 | Chop Oak Logs and Saw Oak Planks, Woodcutting 11 and Woodcrafting 11 | Nothing needed for the logs | `log_b1` (`oak_log`), `shaft_b1` (1 `oak_log` to `oak_plank`) | Yes once lit |
| 5 | Fletch Iron Arrows or Iron Bolts, Woodcrafting 11 | Arrowheads from step 3, planks from step 4 | `arrow_b1`, `bolt_b1`: 1 `iron_arrowheads` and 1 `oak_plank` each | Yes once lit |
| 6 | Grind Iron Whetstones, Smithing 11 | Bars from step 2 | `honing_stone_b1`, 2 `iron_bar` to `iron_whetstone` | Yes once lit |
| 7 | Catch Trout and Cook Trout, Fishing 11 and Cooking 11 | Nothing needed for the fish | `fish_b1` (`trout`), `meal_b1` (1 `trout` to `cooked_trout`) | Yes once lit |
| 8 | Pull Carrots and Press Carrot Juice, Farming 11 and Cooking 11 | Nothing needed for the crop (or the plots' carrots, `carrot_seed` from the shop) | `grain_b1` (`carrot`), `drink_b1` (1 `carrot` to `carrot_juice`) | Yes once lit |
| 9 | Cut Scored runes, Runecutting 11 | Blank Runes from band 0's Mine Rune Essence and Cut Blank Runes, bones from step 0 | `rune_<family>_b1`: 2 `rune_blank` and 1 `bones` to `scored_<family>_rune`, six families | Yes once lit |
| 10 | Mix Tempering Salts, Smithing 21 | Bars from step 2 | `temper_kit_b1`, 3 `iron_bar` to `temper_salts` | Yes once lit |

No step needs a good only the bench, the store or the start kit makes. The walk found one gap, now ruled: band 1's runes had no Remains face (`STREAM_FACES` had none at band 1), so the server would have refused to sell all six.

**The labor ratio at 10, 12 and 14 hours, at band 1,** MEASURED. The burn is the real engine's: the Steady four (hammer, bow, mage, healer) at the Glade's reference Level 23, mid kit, nothing over item Level 39, 8 seeds x 10 h (`node tools/balance-program/redesign/v1-climb.mjs --ground mosslight_glade --level 23 --only base:steady --seeds 8 --hours 10 --max-il 39`, saved as `k1-band1-glade.json`), priced by the K1 tool (`measure.mjs --from tools/balance-program/redesign/trades/k1-band1-glade.json --days 10,12,14`, saved as `k1-band1-measured.txt`). The Glade's casters drink far more than Muster's four (the drink line is 2,862 g of the kit an hour), so the kit asks 0.66 work-hours a hunted hour (0.74 with imbuements), against Muster's 0.56.

| Hunting a hero a day | Free 8 h, whole day planned | Free 8 h, 0.8 used | Premium 10 h, whole day | Kit made at home / from the store (free, whole day) | Gold the kit costs, share of gross (free, whole day) |
|---|---|---|---|---|---|
| 10 h | 0.82 | 1.03 | 0.66 | 100% / 0% | 0.042 |
| 12 h | 0.99 | 1.23 | 0.79 | 100% / 0% | 0.042 |
| 14 h | 1.15 | 1.44 | 0.92 | 87% / 13% | 0.068 |

So the band 1 kit sits inside the 0.8 to 1.0 this page wants at 10 and 12 hours on a planned day, and 14 hours leans on the store for an eighth of its kit. In band, so no lever moves (CLAUDE.md 3.5).

**The store a band behind stays the fallback** (the same tool, a hero at band 1's first step, gold an hour of effect): the meal line is 729 at the store against 488 crafted at band 1 and 485 crafted at band 0, the charge line 1,457 against 976 and 971. The store is 1.49 times the crafted good at the band and 1.50 times the one a band behind, as at every band 0 to 8 (KR-STORE).

*Read with care:* the K1 tool's pace table applies one measured burn to the whole career, so the Glade's heavier mana bill read as a career-long rate overstates the lag past band 2. The pace of 4.9 (the Muster burn) is unchanged by this batch: no kind's work moved.

**Artificing's Trait crafts, ruled (game designer, lane/kit-bands-2-3, 2026-11-27).** For the backend lane that builds them after v0.3.0 (20 section 1.4 puts crafted jewelry and cloaks in a later patch), and for the cut's data lane now.

*How it plays:* an Artificing hero picks a slot (a ring, earrings, a necklace or a cloak) and a ground. The ground's rare parts go into the piece, and the piece rolls one Trait from that ground's pool for that slot. You aim a Trait by choosing whose parts you spend. A better Artificer rolls a higher rank more often.

| Good | Job, trade | Kind | Band | Inputs | Rolls |
|---|---|---|---|---|---|
| Ring, earrings, necklace | Set a Ring (Earrings, Necklace), Artificing | one kind a slot: `jewel_ring`, `jewel_earrings`, `jewel_necklace` | The setting's band. A row exists at a band only where an open ground's Trait pool names the slot at or under it: rings from band 2 (Hask's Ford), earrings and necklaces once the Catacombs or the Ox Road open | 1 Setting (a new Smithing part kind, `setting`, 1 bar of the band, sized like the arrowhead: `budget { of: 'jewel', share: 0.5 }`), `craftParts` rare parts of the one ground the player picks, the job's work and fee | One Trait of that (ground, slot) cell (`traits.js traitPool`, `GEAR_STEPS.traitRoll`), its rank on the quality cascade (4.4), capped by the ground's entry Level as a drop is |
| Cloak | Stitch a Cloak, Artificing | `cloak` | The hides' band. Capes roll at Muster Barrows (band 3) and Krell's Hold (band 4) on open grounds | Hides as the `common_part` stream of the band (beast parts, by the cover rule, so cloaks bid against Alchemy's draughts for the same parts), `craftParts` rare parts of the one ground picked, the job's work and fee | As above, the cape cell |

- **Two levers, both borrowed from carry-over** (21 section 2): `craftParts` starts at carry-over's rank-I count (3), and the job's work is `carryWork`. Working a Trait onto a new piece and moving one onto a base are the same act, so they cost the same.
- **The pool sits at or under the piece's band.** A Trait from a ground deeper than the setting or the hides is refused, as carry-over refuses a lower tier. A deep Trait never sits on a cheap base.
- **They do not fit `KIT_RECIPES` as it is, so no row is built here.** A Trait craft lands a Trait piece (one row with its base, Trait, rank and escrow, T1's), not a stack. Its rare part is the player's pick among grounds, not one face a band. No `budget` for a worn piece exists in `KINDS` or `src/core/trades.js`. The roller is dark (`traitsLive` false). And `validateKitRecipes` refuses a kind that does not ship in v0.3.0. The kinds, the budget and the pick are the backend lane's, on this table.

**The cut's fates for the 27 jewelry pieces, the cloaks, `heartgarnet` and the two armor pieces** (v0.3.0, where no Trait craft ships):

| Items | Fate | Why |
|---|---|---|
| The 15 perk grades (`banded_signet_*` 6, `fang_studs_*` 3, `seam_jasper_band_*` 6) | **Cut with the bench**, with their Hallmark and reforge offers (`gen-jewelry`'s `hr_hallmark_offers`, `hr_jewel_reforge_offers`) | Perks fold into Traits (02 package 2, point 3). A Trait piece is one row, never an item id for each combination |
| The 12 metal pieces (ember, dawn, cobalt and wolfram rings, earrings and necklaces, item Level 100 to 160) and the four high cloaks (`archmage_cloak`, `duskweave_cloak`, `samite_cloak`, `cerecloth_cloak`) | **Kept as the Trait craft's bases at bands 5 to 8**, held sourceless under a new bucket (a) fate whose door is the Trait craft (catalogue-coherence `UNREACHABLE_FATES`, the cut's data lane adds it with C11's proof) | Every open ground in v0.3.0 is band 4 or under (the Pyre Field and Krell's Hold at gear Level 80), so no hero needs them before the craft ships |
| `graypelt_cloak` (the cape ladder's tier 1, the first hour's cloak) and `warband_bulwark` (tier 3) | **A drop of their tier's open ground**: the Graypelt Cloak on the Thicket's gray wolves (gray pelts), the Warband Bulwark on Hask's Ford's banded pikemen. Sized by the drop formula, authored by the cut's data lane. The first hour's "Stitch Graypelt Cloak" coach step (`hunt-tutorial.js`) and the Path row (`the-path.js`) point at the drop | Gear drops and a bench makes none (02 package 2, kept). A plain cloak made at a bench with no Trait is the one thing 09's rule ("jewelry and cloaks only, where a rolled Trait is the whole point") does not allow |
| `heartgarnet` | **Cut with the bench** | It has no consumer (vendor trash since 2026-10-14, "a dead end awaiting a designer ruling"). The Trait craft aims with the rare part, so a gem would be a second aiming input with no decision of its own |
| `steelgrate` | As 4.12: a drop of its named source or cut | A named-piece reforge is gear, and gear drops |

### 4.14 Bands 2 and 3, steel and mithril (2026-11-27, game designer, lane/kit-bands-2-3)

**How it plays:** once a hero holds a depth record on a steel ground (the Coppercap Warrens, Hask's Ford or the Slake) and a trade reaches Level 21, the Work window offers that trade's steel job. Coal smelts to Steel Bars, which forge Steel Arrowheads and grind Steel Whetstones. Willow saws to planks, and a head and a plank make a Steel Arrow. Pikeperch cooks, tomatoes press to juice, and two Blank Runes and a bone cut any Etched rune. Ten Levels on, a mithril record (the Muster Barrows) opens Mithril Ore, maple, Goldgill, pumpkins and the Carved runes, which bind with Grave Dust.

**Built (STAGED, dark with `trade_jobs`).** Two batches, each read for repetition (CLAUDE.md section 10).

| Batch | Rows | What |
|---|---|---|
| `band2-steel` | 17 | Mine Coal, Chop Willow Logs, Catch Pikeperch, Pull Tomatoes, Smelt Steel Bars, Saw Willow Planks, Cook Pikeperch, Press Tomato Juice, Grind Steel Whetstones, Forge Steel Arrowheads, Fletch Steel Arrows, and Cut Etched Earth, Water, Fire, Ice, Poison and Rupture Runes |
| `band3-mithril` | 17 | Mine Mithril Ore, Chop Maple Logs, Catch Goldgill, Pull Pumpkins, Smelt Mithril Bars, Saw Maple Planks, Cook Goldgill, Brew Pumpkin Cider, Grind Mithril Whetstones, Forge Mithril Arrowheads, Fletch Mithril Arrows, and Cut Carved Earth, Water, Fire, Ice, Poison and Rupture Runes |

77 named rows in seven batches (5, 9, 6, 5, 18, 17, 17), 82 job recipes with the imbuements. Every band 2 row opens at its trade's Level 21, every band 3 row at Level 31 (`bandRung`). The Temper kits at bands 2 and 3 (already named) now have bars a job makes.

*The repetition read.* Each batch is band 1's kinds at a new metal, by rule (4.9 rule 1), so the shape repeats and the goods do not: one new rock a band (copper, iron, coal, mithril), one new head a band, one rune tier a band (Chalked, Scored, Etched, Carved), and every name is a live item but the two arrowheads.

*Calls made here.*

- **Steel's ore is Coal.** A kind takes one material at every band, so the rock that is new at steel is the coal steel needs. Mining opens a new rock every band. Coal also drops on the Warrens (Goblin Digger, Hobgoblin Foreman) and the Slake (Bargeman), the band's own grounds. `steel_bar`'s description now reads "smelted hot with coal".
- **No bolt past iron.** A crossbow shoots any Ranged ammo (`hunt-roles.js shootsItem`), so past iron it shoots its band's arrows. No steel or mithril bolt is an item, and two would be the same hour of arrows under a new name (4.12's second-good rule). 4.12's "a band's arrow, bolt" line reads "the bolt at iron only".
- **Fish, crop and wood climb in their node and press order.** The fish leave one for each of bands 4 to 8 (Lobster, Swordfish, Frostfin, Shark, Moonfish). The crops and woods take the next in the same order (Goldenroot and Emberfruit, Yew, Runewood and Duskwood), and a band past them gets a new good with its batch. `cooked_pikeperch`, which 4.13 cut as band 1's second meal, is band 2's meal now.
- **Band 3's Remains are Grave Dust, not Razor Claw** (`STREAM_FACES`, re-ruling 4.11 row 3 by its own reason). Razor Claw drops only on the Pyre Field (entry Level 70, band 4 by its gear), so a company hunting the Muster Barrows could never bind a Carved rune. Grave Dust drops on the Muster Barrows (Cairn Wight, Captain Hask) and on the Pyre Field (Pyre Wraith, Provost), the home of both band 3 imbuement parts, so the binder still comes from where the band's parts drop. Make Fire Edge and Make Brute Edge now take 4 Grave Dust, and their book value falls from 2,180 and 2,140 to 1,120 and 1,080 (the set's book). Their descriptions say grave dust. KR-CLOSED now holds that every hunted input of a whole band drops on an open ground of that band (a mutant planting Razor Claw back is caught).
- **Two new goods: Steel and Mithril Arrowheads** (booked at 100 and 200, under their bars' 125 and 250, as the bronze and iron heads are; placeholder icons re-dyed by `tools/world-art/job-face-icons.mjs` for the Art Director).

*Every input has a source and every output a use* (KR-SOURCE, KR-CLOSED). After bands 2 and 3 the cut orphans **104** live items, not 128 (`cut-orphans.mjs`, by band 0 to 9: 10 / 13 / 15 / 8 / 9 / 20 / 11 / 8 / 7 / 3). 24 gained a job: the six Etched and six Carved runes, the steel and mithril arrows and whetstones, Willow and Maple Planks, Pikeperch and Goldgill raw and cooked, Tomato Juice and Pumpkin Cider. What bands 2 and 3 still hold is ruled already: second foods and the Deep Seam bridge cut with the bench (4.12), the axes and pickaxes cut, the jewelry grades cut and the Warband Bulwark a drop (4.13), `steelgrate` a drop or a cut, and the room costs on `field_ration` (Kitchen 4, Cellar 4) and Cooked Lobster (Kitchen 2) re-pointed by the cut's data lane, Cooked Lobster's to Cooked Pikeperch.

**Walk-through: a company's first steel day, on real data.** It holds what the iron walk-through (4.13) ends with: band 0 and band 1 goods and every trade at Level 11. Each trade needs 12.2 work-hours of its own XP from Level 11 to 21 (`tradeXpTable`: 30,419 to 74,246 seconds of work), so the eight kit trades take about three planned free days of a company of four. Every id was grepped on the set (`items.js`, `monsters.js`, `hunt-grounds.js`, `danger.js`, `trades.js`, `catalogue-coherence` doors).

| # | Step | Holds and can reach (steps before only, plus bands 0 and 1) | Real source | Doable |
|---|---|---|---|---|
| 0 | Hunt the Coppercap Warrens to a depth record | Band 1 gear and kit. The Warrens open at Level 32 | `hunt-grounds.js coppercap_warrens`, `DANGER_GROUNDS.coppercap_warrens` gear Level 40 (band 2, `hr_trade_ground_bands`). Drops `bones` (`goblin_scavenger`, `goblin_skulker`, `goblin_digger`) and `coal` (`goblin_digger`, `hobgoblin_foreman`) | Yes |
| 1 | Mine Coal, Mining 21 | The band 2 record from step 0. No input | `ore_b2`, face `coal` | Yes once lit |
| 2 | Smelt Steel Bars, Smithing 21 | Coal from step 1 (or step 0's drops) | `bar_b2`, 1 `coal` to `steel_bar` | Yes once lit |
| 3 | Forge Steel Arrowheads, Smithing 21 | Bars from step 2 | `arrowhead_b2`, 1 `steel_bar` to `steel_arrowheads` (new) | Yes once lit |
| 4 | Chop Willow Logs and Saw Willow Planks, Woodcutting 21 and Woodcrafting 21 | Nothing needed for the logs | `log_b2` (`willow_log`), `shaft_b2` (1 `willow_log` to `willow_plank`) | Yes once lit |
| 5 | Fletch Steel Arrows, Woodcrafting 21 | Arrowheads from step 3, planks from step 4 | `arrow_b2`, 1 `steel_arrowheads` and 1 `willow_plank` to `steel_arrows` | Yes once lit |
| 6 | Grind Steel Whetstones, Smithing 21 | Bars from step 2 | `honing_stone_b2`, 2 `steel_bar` to `steel_whetstone` | Yes once lit |
| 7 | Catch Pikeperch and Cook Pikeperch, Fishing 21 and Cooking 21 | Nothing needed for the fish | `fish_b2` (`pikeperch`), `meal_b2` (1 `pikeperch` to `cooked_pikeperch`) | Yes once lit |
| 8 | Pull Tomatoes and Press Tomato Juice, Farming 21 and Cooking 21 | Nothing needed for the crop (or the plots' tomatoes, `tomato_seed` from the shop) | `grain_b2` (`tomato`), `drink_b2` (1 `tomato` to `tomato_juice`) | Yes once lit |
| 9 | Cut Etched runes, Runecutting 21 | Blank Runes from band 0's Mine Rune Essence and Cut Blank Runes, bones from step 0 | `rune_<family>_b2`: 2 `rune_blank` and 1 `bones` to `etched_<family>_rune`, six families | Yes once lit |
| 10 | Mix Fine Tempering Salts, Smithing 21 | Bars from step 2 | `temper_kit_b2`, 3 `steel_bar` to `fine_temper_salts` | Yes once lit |

No step needs a good only the bench, the store or the start kit makes. Band 3 walks the same way from a Muster Barrows record (gear Level 60), with Mithril Ore, Maple, Goldgill, pumpkins and Carved runes bound with the Muster's Grave Dust. The walk found one gap, now ruled: band 3's binder dropped only a band deeper.

**The labor ratio at 10, 12 and 14 hours,** MEASURED. Each burn is the real engine's: the Steady four (hammer, bow, mage, healer), 8 seeds x 10 h, at the band's first ground and reference Level, nothing worn over the band's top item Level (`node tools/balance-program/redesign/v1-climb.mjs --ground coppercap_warrens --level 41 --only base:steady --seeds 8 --hours 10 --max-il 59`, saved as `k1-band2-warrens.json`; the same on `muster_barrows --level 60 --max-il 79`, `k1-band3-muster.json`), priced by the K1 tool (`measure.mjs --from <burn> --days 10,12,14`, saved as `k1-band2-measured.txt` and `k1-band3-measured.txt`). The Warrens four's kit asks 0.67 work-hours a hunted hour (0.75 with imbuements), the Muster four's 0.54 (0.62).

| Hunting a hero a day | Band 2: free 8 h whole day / 0.8 used / Premium 10 h whole | Band 2 made at home, gold share of gross (free, whole) | Band 3: free 8 h whole day / 0.8 used / Premium 10 h whole | Band 3 made at home, gold share (free, whole) |
|---|---|---|---|---|
| 10 h | 0.84 / 1.05 / 0.67 | 100%, 0.042 | 0.67 / 0.84 / 0.54 | 100%, 0.034 |
| 12 h | 1.01 / 1.26 / 0.81 | 99%, 0.044 | 0.81 / 1.01 / 0.65 | 100%, 0.034 |
| 14 h | 1.18 / 1.47 / 0.94 | 85%, 0.071 | 0.94 / 1.18 / 0.75 | 100%, 0.034 |

So band 2 sits in the 0.8 to 1.0 this page wants at 10 h and on its top edge at 12 h (the store fills 1%), and leans on the store for 15% of its kit at 14 h. Band 3's lighter burn puts the 10 h day under the band (0.67, 0.77 with its imbuements), a surplus of about 2.6 work-hours a hero that goes to the trade furthest behind, the hall and the castle, as 5.3 has it. At the reference 12 h day both bands are in band. In band, so no lever moves (CLAUDE.md 3.5). This batch moves no kind's work, so these ratios are the burns', not the recipes'.

**The store a band behind stays the fallback** (the same tool, a hero at the band's first step, gold an hour of effect): band 2's meal line is 786 at the store against 528 crafted at the band and 524 a band behind, its charge line 1,572 against 1,057 and 1,047. Band 3's are 852 against 572 and 567, and 1,703 against 1,145 and 1,134. The store is 1.49 times the crafted good at the band and 1.50 times the one a band behind (KR-STORE, every band 0 to 8).

*Read with care.* The pace table again applies one burn to the whole career: on the Warrens burn a planned free 10 h day keeps the worst kit line at the band 95 days of 140 and one behind on the rest, never two (on the Muster burn, 125 and 15). The store's named rows (Salted Lobster beside a crafted Cooked Pikeperch) are priced by the buyer's step, so they play correctly, but their names follow the old ladder. Naming them for the band's face is W1's remainder (4.9).

### 4.15 Bands 4 and 5, rune and Emberforged (2026-11-27, game designer, lane/kit-bands-4-5)

**How it plays:** once a hero holds a depth record on the Pyre Field or Krell's Hold and a trade reaches Level 41, the Work window offers that trade's rune job. Rune Ore smelts to Rune Bars, which forge Rune Arrowheads and grind Rune Whetstones. Yew saws to planks, and a head and a plank make a Rune Arrow. Lobster cooks, Goldenroot brews to tea, and two Blank Runes and a Big Bone cut any Graven rune. Ten Levels on, an Emberforged record opens Emberstone Ore, Runewood, Swordfish, Emberfruit Cordial and Emberhead Arrows. No v0.3.0 ground is band 5 (Carter's Rest is staged), so those jobs open the day it does.

**Built (STAGED, dark with `trade_jobs`).** Two batches, each read for repetition (CLAUDE.md section 10). Band 4 was played through the guards and read first, then band 5.

| Batch | Rows | What |
|---|---|---|
| `band4-rune` | 17 | Mine Rune Ore, Chop Yew Logs, Catch Lobster, Pull Goldenroot, Smelt Rune Bars, Saw Yew Planks, Cook Lobster, Brew Goldenroot Tea, Grind Rune Whetstones, Forge Rune Arrowheads, Fletch Rune Arrows, and Cut Graven Earth, Water, Fire, Ice, Poison and Rupture Runes |
| `band5-ember` | 10 | Mine Emberstone Ore, Chop Runewood Logs, Catch Swordfish, Pull Emberfruit, Smelt Emberforged Bars, Saw Runewood Planks, Cook Swordfish, Brew Emberfruit Cordial, Forge Emberforged Arrowheads, Fletch Emberhead Arrows |

104 named rows in nine batches (5, 9, 6, 5, 18, 17, 17, 17, 10), 109 job recipes with the imbuements. Every band 4 row opens at its trade's Level 41, every band 5 row at Level 51 (`bandRung`). The Rune and Ember Temper kits (already named) now have bars a job makes.

*The repetition read.* Band 4 is band 3's kinds at rune and yew: one new rock, one new head, the last rune tier. Band 5 is band 4's kinds at ember and runewood, short the rune and the stone. Every name is a live item but Rune Ore and the two heads.

*Calls made here.*

- **Rune's rock is Rune Ore, a new good** (`rune_ore`, booked at 50, between Mithril Ore's 40 and Emberstone Ore's 55). The bench smelted Rune Bars from three goods (a Mithril Bar, Magic Essence and coal), and a kind takes one material, so Mining opens a new rock at rune as it did at every band before. "Rune" already names the metal (the Rune Sword, the Rune Bar), so the ore reads as its bar's. Its placeholder icon is the Mithril Ore re-dyed in the Rune Bar's colours.
- **Band 4's Remains are Big Bones** (`STREAM_FACES.remains[4]`). Both band 4 grounds drop them: Krell's Hold (Grave Guard, Gatekeeper) and the Pyre Field (Stoker, Provost). Razor Claw drops on the Pyre Field alone, so a Krell's Hold company could never bind with it. Big Bones also drop on Carter's Rest, so they can carry band 5 when a band 5 rune exists.
- **The ladders end, so band 5 has no rune and no honing stone.** The runes stop at Graven (`runes.js RUNE_TIERS`, five tiers, one a band from 0 to 4). The honing stones go from Rune to Dawnsteel (`stonecraft.js`), with no ember stone between them. A rune or a stone for band 5 would be a new rung on a combat ladder (its stats, its gate and its spell version), which is that ladder's owner's call, not a job's. Until it lands, a band 5 caster cuts Graven runes and a melee hero grinds Rune Whetstones, a band behind, like the store's lag. No v0.3.0 hero meets it, since no band 5 ground is open. KR-ROWS holds Runecutting to a job at every band a rune tier is left for, read from `RUNE_TIERS`, so the day a sixth tier lands its row is owed.
- **Emberhead is ember's arrow, re-ruling 4.12 by its own rule** ("a band's arrow is its metal's"). Emberhead Arrows are the arrow ladder's tier 6, between Rune and Dawnpoint, with ember heads. So they are band 5's arrow, made from Emberforged Arrowheads and a Runewood Plank. Dawnpoint Arrows (tier 7, dawn) are band 6's by the same reading, for its batch.
- **Fish, crop and wood keep their order.** Lobster and Swordfish, Goldenroot and Emberfruit, Yew and Runewood. Cooked Lobster gains a job at band 4, and 4.14's re-point of its Kitchen 2 cost to Cooked Pikeperch stands (a tier 2 room asks for a band 2 good). Runewood Planks gain a job at band 5, so their room and castle costs keep their good.
- **Three new goods: Rune Ore, Rune Arrowheads and Emberforged Arrowheads** (the heads booked at 400 under their bars' 500, as every head is; placeholder icons re-dyed by `tools/world-art/job-face-icons.mjs` for the Art Director).

*Every input has a source and every output a use* (KR-SOURCE, KR-CLOSED; `tests/kit-recipes.mjs --mutate` 36 of 36 caught, seven of them new for bands 4 and 5). Every town input of every band 4 and band 5 job is made by a job at its band or below. Big Bones drop on both open band 4 grounds, and a mutant binding band 4 with Troll Hide (a Carter's Rest drop) is caught. Band 5 has no hunted input.

**What bands 4 and 5 still orphan, each ruled.** After this batch the cut orphans **88** live items, not 104 (`cut-orphans.mjs`, by band 0 to 9: 10 / 13 / 14 / 8 / 5 / 12 / 11 / 5 / 7 / 3). 16 gained a job: the six Graven runes, Rune Arrows, Rune Whetstones, Yew and Runewood Planks, Goldenroot Tea, Cooked Lobster, Cooked Swordfish, Emberfruit Cordial, Emberhead Arrows and Raw Swordfish.

| Band | Item | Fate | Why |
|---|---|---|---|
| 4 | `carrot_stew`, `vegetable_stew` | Cut with the bench | A second food at band 4, whose meal is Cooked Lobster (4.12) |
| 4 | `rune_axe`, `rune_pickaxe` | Cut with the bench | Gathering tools for nodes the cut removes (4.12). The `tool_*` kinds bring tools back as job tools |
| 4 | `verdite_bar` | Cut with the bench | The Deep Seam bridge, one bar a band (4.12) |
| 5 | `ember_tart`, `fishers_pie`, `pumpkin_pie`, `river_chowder` | Cut with the bench | Second foods at band 5, whose meal is Cooked Swordfish |
| 5 | `cooked_shark` | Band 7's meal, with its batch | Shark is band 7's fish in the order 4.14 set (Lobster, Swordfish, Frostfin, Shark, Moonfish). Its Kitchen 5 cost re-points to Cooked Swordfish, the cut's data lane's |
| 5 | `ember_earrings`, `ember_necklace`, `ember_ring`, `archmage_cloak` | Held as the Trait craft's bases (4.13) | Artificing's Trait craft ships after v0.3.0 and no band 5 ground is open before it |
| 5 | `ember_axe`, `ember_pickaxe` | Cut with the bench | Gathering tools (4.12) |
| 5 | `heartgarnet` | Cut with the bench | Ruled at the end of 4.13 |

**Walk-through: a company's first rune day, on real data.** It holds what the steel walk-through (4.14) ends with, walked on through band 3: bands 0 to 3 goods and every kit trade at Level 31. Each trade needs 28.1 work-hours of its own XP from Level 31 to 41 (`tradeXpTable`: 134,076 to 235,222 seconds of work, read as the XP at which `tradeLevel` first returns each Level), so the eight kit trades take about seven planned free days of a company of four. Every id was grepped on the set (`items.js`, `monsters.js`, `hunt-grounds.js OPEN_GROUNDS`, `danger.js`, `trades.js` through `jobRecipes`, `catalogue-coherence` doors).

| # | Step | Holds and can reach (steps before only, plus bands 0 to 3) | Real source | Doable |
|---|---|---|---|---|
| 0 | Hunt the Pyre Field to a depth record | Band 3 gear and kit. The Pyre Field opens at Level 70 | `OPEN_GROUNDS.pyre_field`, `DANGER_GROUNDS.pyre_field` gear Level 80 (band 4, `hr_trade_band_open` reads band 4 or deeper). Drops `big_bones` (`stoker`, `provost`). Krell's Hold does too (`grave_guard`, `gatekeeper`) | Yes |
| 1 | Mine Rune Ore, Mining 41 | The band 4 record from step 0. No input | `ore_b4`, face `rune_ore` (new) | Yes once lit |
| 2 | Smelt Rune Bars, Smithing 41 | Ore from step 1 | `bar_b4`, 1 `rune_ore` to `rune_bar` | Yes once lit |
| 3 | Forge Rune Arrowheads, Smithing 41 | Bars from step 2 | `arrowhead_b4`, 1 `rune_bar` to `rune_arrowheads` (new) | Yes once lit |
| 4 | Chop Yew Logs and Saw Yew Planks, Woodcutting 41 and Woodcrafting 41 | Nothing needed for the logs | `log_b4` (`yew_log`), `shaft_b4` (1 `yew_log` to `yew_plank`) | Yes once lit |
| 5 | Fletch Rune Arrows, Woodcrafting 41 | Arrowheads from step 3, planks from step 4 | `arrow_b4`, 1 `rune_arrowheads` and 1 `yew_plank` to `rune_arrows` | Yes once lit |
| 6 | Grind Rune Whetstones, Smithing 41 | Bars from step 2 | `honing_stone_b4`, 2 `rune_bar` to `rune_whetstone` | Yes once lit |
| 7 | Catch Lobster and Cook Lobster, Fishing 41 and Cooking 41 | Nothing needed for the fish | `fish_b4` (`lobster`), `meal_b4` (1 `lobster` to `cooked_lobster`) | Yes once lit |
| 8 | Pull Goldenroot and Brew Goldenroot Tea, Farming 41 and Cooking 41 | Nothing needed for the crop (or the plots' goldenroot, `goldenroot_seed` from the shop) | `grain_b4` (`goldenroot`), `drink_b4` (1 `goldenroot` to `goldenroot_tea`) | Yes once lit |
| 9 | Cut Graven runes, Runecutting 41 | Blank Runes from band 0's Mine Rune Essence and Cut Blank Runes, Big Bones from step 0 | `rune_<family>_b4`: 2 `rune_blank` and 1 `big_bones` to `graven_<family>_rune`, six families | Yes once lit |
| 10 | Mix Rune Tempering Salts, Smithing 41 | Bars from step 2 | `temper_kit_b4`, 3 `rune_bar` to `rune_temper_salts` | Yes once lit |

No step needs a good only the bench, the store or the start kit makes. The walk found one gap, ruled above: band 4 had no Remains face, so the server would have refused all six Graven runes. Band 5 walks the same way from a Carter's Rest record (gear Level 100) once that ground opens, with Emberstone Ore, Runewood, Swordfish and Emberfruit, and no rune or stone row.

**The labor ratio at 10, 12 and 14 hours,** MEASURED. Each burn is the real engine's: the Steady four (hammer, bow, mage, healer), 8 seeds x 10 h, at the band's first ground and reference Level, nothing worn over the band's top item Level (`node tools/balance-program/redesign/v1-climb.mjs --ground pyre_field --level 80 --only base:steady --seeds 8 --hours 10 --max-il 99`, saved as `k1-band4-pyre.json`; the same on `carters_rest --level 117 --max-il 119`, `k1-band5-carters.json`), priced by the K1 tool (`measure.mjs --from <burn> --days 10,12,14`, saved as `k1-band4-measured.txt` and `k1-band5-measured.txt`). The Pyre Field four's kit asks 0.64 work-hours a hunted hour (0.72 with imbuements), the Carter's Rest four's 0.44 (0.52). Neither four died.

| Hunting a hero a day | Band 4: free 8 h whole day / 0.8 used / Premium 10 h whole | Band 4 made at home, gold share of gross (free, whole) | Band 5: free 8 h whole day / 0.8 used / Premium 10 h whole | Band 5 made at home, gold share (free, whole) |
|---|---|---|---|---|
| 10 h | 0.80 / 1.00 / 0.64 | 100%, 0.040 | 0.55 / 0.69 / 0.44 | 100%, 0.029 |
| 12 h | 0.96 / 1.20 / 0.77 | 100%, 0.040 | 0.66 / 0.82 / 0.53 | 100%, 0.029 |
| 14 h | 1.12 / 1.40 / 0.90 | 89%, 0.060 | 0.77 / 0.96 / 0.62 | 100%, 0.029 |

Band 4 sits in the 0.8 to 1.0 this page wants at 10 and 12 hours on a planned day, and leans on the store for 11% of its kit at 14 hours. In band, so no lever moves (CLAUDE.md 3.5).

Band 5 falls under the band on a planned day (0.66 at 12 hours) and sits in it only on the 0.8 used day (0.82 and 0.96 at 12 and 14 hours). That is the burn, not the recipes: this batch moves no kind's work, and the Carter's Rest four burns about half the Pyre Field four's restore (kit share 0.25 of the hour against 0.31, a drink line of 1,079 gold an hour against 2,321). **The dial that owns it is the ground's own tuning, and no trade lever is it.** Carter's Rest is staged and untuned: its four holds step 44 against its `refStep` 60. The one trade dial that moves every band's ratio, `kitWork`, would need about 1.21 times to lift band 5 to 0.8 at 12 hours, and that puts bands 1, 2 and 4 at 1.20, 1.22 and 1.16. So nothing moves here. `tools/new-ground.mjs` measures the ground's kit share (EL-KIT) when it opens, and the lane that opens it re-runs this burn. Until then a band 5 company's spare labor goes to the trade furthest behind, the hall and the castle, as 5.3 has it.

**The store a band behind stays the fallback** (the same tool, a hero at the band's first step, gold an hour of effect): band 4's meal line is 923 at the store against 620 crafted at the band and 614 a band behind, its charge line 1,844 against 1,240 and 1,229. Band 5's are 999 against 671 and 665, and 1,998 against 1,343 and 1,330. The store is 1.49 times the crafted good at the band and 1.50 times the one a band behind (KR-STORE, every band 0 to 8).

*Read with care.* The pace table applies one burn to the whole career, and the Pyre Field's drink bill read as a career-long rate is heavy: on the 0.8 used free 10 hour day the worst kit line sits two or more bands behind 123 days of 140, while the whole planned day keeps it at the band 111 days and one behind the rest. That is the 0.8 used day's zero spare labor on the heaviest burn, not band 4's recipes.

*Found on the way, for the stone ladder's owner (CONFLICTS 2026-11-27 kit-bands-4-5).* The honing stone faces sit one combat tier above the arrows at the same band, since the stone ladder keeps the cut Copper Whetstone's rung. So a band's stone is gated a band later than its arrow (`SUPPLY_GATES.melee`): the Mithril Whetstone wants Level 73 against the Muster Barrows' reference 60, and the Rune Whetstone 115 against the Pyre Field's 80. A melee hero there can make the band's stone and not use it yet. The fix belongs with the faces' re-cut to the one hunted hour unit (the job slice, 4.9) and the ladder's gates, measured on the bands, not in a job batch. (Ruled and fixed as data in 4.16.)

### 4.16 Bands 6 to 9, Dawnsteel, Cobalt, Wolfram and the top band; the supply ladders ruled (2026-11-28, game designer, lane/kit-bands-6-9)

**How it plays:** once a hero holds a depth record on the Ox Road and a trade reaches Level 61, the Work window offers that trade's Dawnsteel job. Dawnstone smelts to Dawnsteel Bars, which forge Dawnsteel Arrowheads, grind Dawnsteel Whetstones and mix Dawnsteel Tempering Salts. Duskwood saws to planks, and a head and a plank make a Dawnpoint Arrow. Frostfin cooks. A caster still drinks Emberfruit Cordial, a band behind, until a new drink can be a server row. A melee hero's stone now opens with the archer's arrow, so a company never makes a stone its fighter can't use yet, and band 5 grinds its own Emberforged Whetstone. Past Dawnsteel, a Wyvern Roost or Catacomb record opens Cobalt and Wolfram: mine the ore, smelt the bars, mix the salts that temper that gear, and cook Shark and Moonfish. Their arrows, stones, runes, wood and drink come with the next rung of each supply ladder.

**Built (STAGED, dark with `trade_jobs`).** Four batches, each read for repetition (CLAUDE.md section 10). Band 6 was played through the guards and read first, then the stone and bands 7 and 8.

| Batch | Rows | What |
|---|---|---|
| `band5-stone` | 1 | Grind Emberforged Whetstones (the stone ladder's rung 6, below) |
| `band6-dawn` | 9 | Mine Dawnstone Ore, Chop Duskwood Logs, Catch Frostfin, Smelt Dawnsteel Bars, Saw Duskwood Planks, Cook Frostfin, Grind Dawnsteel Whetstones, Forge Dawnsteel Arrowheads, Fletch Dawnpoint Arrows |
| `band7-cobalt` | 5 | Mine Cobalt Ore, Smelt Cobalt Bars, Mix Cobalt Tempering Salts, Catch Shark, Cook Shark |
| `band8-wolfram` | 5 | Mine Wolfram Ore, Smelt Wolfram Bars, Mix Wolfram Tempering Salts, Catch Moonfish, Cook Moonfish |

124 named rows in thirteen batches, 129 job recipes with the imbuements. Every band 6 row opens at its trade's Level 61, band 7 at 71 and band 8 at 81 (`bandRung`). The Dawnsteel Temper kit (already named) now has a bar a job makes.

*The repetition read.* Band 6 is band 5's kinds at dawnsteel and duskwood, plus the stone and less the crop and drink (call 8): one new head, every other name a live item. Bands 7 and 8 are the same five kinds twice, one new metal each (ore, bar, salts), and the fish and meal the order named in 4.14.

*Calls made here.*

| # | Call | Ruling | Why |
|---|---|---|---|
| 1 | Each band's whetstone was gated a band later than its arrow (CONFLICTS 2026-11-27) | **Fixed as data: each metal's stone sits on its metal's arrow's rung** (`stonecraft.js`: Iron 2, Steel 3, Mithril 4, Rune 5, Emberforged 6, Dawnsteel 7). The Mithril Whetstone opens at Melee 45 (the Muster Barrows' reference 60), the Rune Whetstone at 73 (the Pyre Field's 80). A rung's stats and gate stay the rung's, so no rung's power moves, only which metal names it. The Copper Whetstone shares rung 2 until the bench cut removes it | The ladder kept the cut Copper rung, which pushed every metal's stone a rung up. A stone and an arrow are one slot on one curve (R7), so a band's two should open together. The store sells no whetstone, so no price moves. `tests/bands.mjs` BD-10 now holds each stone on its arrow's rung |
| 2 | Band 5 had no stone | **Built: the Emberforged Whetstone** (`ember_whetstone`, rung 6, two Emberforged Bars, book 30) and its job | Rung 1 freed rung 6, so the stone ladder has an ember rung with no combat change: the rung's stats were already on the curve |
| 3 | Rungs 6 and 7 were gated past their own bands (the careers' Levels 105 and 115, 142 and 168, against Carter's Rest's entry 110 and the whole Ox Road) | **A rung opens by its band's gear item Level at the latest**: `SUPPLY_GATES` rung r is min(the career's Level, 20 x (r - 1)). Ranged and Melee rung 6 at 100 and rung 7 at 120. Rungs 1 to 5 sit under the cap and keep the careers' Levels | A band's own arrow must work on its own ground. Every open ground's reference reads rungs 1 to 5 only, so no measured band moves; rung 6 opens five to fifteen Levels sooner for a hero over Level 100 on Krell's Hold, a few heroes' choice of a deeper arrow. BD-10 re-derives every gate and a mutant planting 142 back is caught |
| 4 | Band 5 has no sixth rune tier, and every ladder ends (arrows and stones at Dawnsteel, runes at Graven) | **The supply ladders run one rung a band, like gear. Engine work, specced for Systems (HANDOFFS 2026-11-28 kit-bands-6-9, item 2)**: a new rung is one row (its stat a step up the curve, its gate its band's gear item Level, a store row), and a rune tier also adds a mana to every spell's `versions` and a row to every status tier table | Unlimited Levels must keep meaning something past Level 140, and a band whose supplies stop is a band with no reason to make anything. But a sixth spell version, or a Cobalt Arrow, is combat power on the Wyvern Roost and the Catacomb wings, whose references were measured on rung 7 kits. So it rides a combat batch with those grounds re-read. KR-ROWS owes the rows the day each rung lands |
| 5 | Bands 7 and 8 have no supply rung, no crop and no wood | **Built the chains that close without one: the rock, the bar, the Temper kit, the fish and the meal.** The rest lands with each ladder's next rung (the juniper and rowan woods `gear-tiers.js` already names come with the arrows, their only use) and with the farm's next crop, the designer's next batch | Cobalt and Wolfram gear exists (`STEP_TIERS`) and a Temper rank on it was owed a kit nobody could make (`kits_owed`). The bars' one use today is that kit. A plank with no arrow to fletch would be a good with no use |
| 6 | Band 9 (the top band in the orphan count) | **No batch.** Band 9 has no gear tier and no ground, so no record can open it | `STEP_TIERS` ends at Wolfram (item Level 160). Its three orphans are fated below |
| 7 | The binder past band 4 | **Named for every band with a ground** (`job-faces.js`): band 5 and 6 Big Bones (Carter's Rest and the Ox Road), band 7 Dragon Bones (the Wyvern Roost's only Remains), band 8 Big Bones (both Catacomb wings). New arm KR-BINDER holds that a ground of each band drops its binder, staged grounds counted | No row spends them yet, but the rune rungs of item 4 will, and they should land owing nothing |
| 8 | Band 6's crop and drink | **They wait, and the drink is Moonbloom's when it lands.** Moonbloom is the last crop in the farm's order and already has a seed and a plot, and its only press is the Moonbloom Elixir, a buff food (the draught line's), so band 6's drink is a new good pressed from it. But a new drink is a new `consume` row in `hr_hunt_action_ids`, whose catalogue block sits in an APPLIED file (`2027-01-13-slot-truth.sql`, pinned by `tests/hunt-core/conditions.mjs` sql-rows). Moving that block into a staged generated catalogue is the backend's (HANDOFFS 2026-11-28 kit-bands-6-9, item 7). Until it lands a band 6 caster drinks Emberfruit Cordial, a band behind, as band 5 cuts Graven runes | A drink nobody can put on a bar is a good with no use, and no consumable has been added since that file was applied, so the gap is the catalogue's home, not this batch. Farming keeps a job at every band a mana drink has (KR-ROWS), so the crop lands with its drink |
| 9 | The Dawnsteel Whetstone's book | **40, was 100** | Once a job smelts Dawnsteel Bars the vendor bids a bar its inputs plus its work (the job-goods cap, S-33), so the bench's ten stones from one Dawnsteel and one Rune Bar sold for 7.4 times their inputs (`tests/recipe-yield-guard.mjs` holds 5). Rune 20, Emberforged 30, Dawnsteel 40 is a whetstone worth about what went into it |

**New goods (eight), each with placeholder art for the Art Director (`dawn_arrowheads` in `tools/world-art/arrowhead-icons.mjs`'s family with a plain Dawnsteel ramp, the rest re-dyed by `job-face-icons.mjs`):** `ember_whetstone`, `dawn_arrowheads` (booked 800 under the bar's 1,050), and `cobalt_ore`, `cobalt_bar`, `cobalt_temper_salts`, `wolfram_ore`, `wolfram_bar`, `wolfram_temper_salts`, each Dawnsteel's ore, bar and salts carried up the wage curve to its item Level (x1.083 at 140, x1.173 at 160), as the step tiers' gear is booked.

*Every input has a source and every output a use* (KR-SOURCE, KR-CLOSED, KR-BINDER; `tests/kit-recipes.mjs --mutate` 48 of 48 caught, twelve of them new). Every town input of every band 5 to 8 job is made by a job at its band or below. No band 6 to 8 job takes a hunted input. The cut's other guards moved with the rows: `tests/temper-steps.mjs` TS-6 reads Cobalt's and Wolfram's kits at item Levels 140 and 160.

**What bands 6 to 9 still orphan, each ruled.** After these batches the cut orphans **79** live items, not 88 (`cut-orphans.mjs`, by band 0 to 9: 10 / 13 / 14 / 8 / 5 / 11 / 8 / 4 / 4 / 2). Nine gained a job: the Dawnsteel Whetstone, Bar and Dawnpoint Arrows, Cooked Frostfin, Duskwood Planks, Raw and Cooked Shark, Raw and Cooked Moonfish.

| Band | Item | Fate | Why |
|---|---|---|---|
| 6 | `bear_claw_pie`, `goldenroot_roast` | Cut with the bench | Buff foods, the draught line's (Alchemy, after v0.3.0), and second foods at band 6, whose meal is Cooked Frostfin (4.12). The Cask Room's Goldenroot Roast re-points to Pumpkin Cider (a cask holds a drink, at its rung's band) |
| 6 | `dawn_earrings`, `dawn_necklace`, `dawn_ring`, `duskweave_cloak` | Held as the Trait craft's bases (4.13) | Artificing's Trait craft ships after v0.3.0 |
| 6 | `dawn_axe`, `dawn_pickaxe` | Cut with the bench | Gathering tools (4.12) |
| 7 | `cobalt_earrings`, `cobalt_necklace`, `cobalt_ring`, `samite_cloak` | Held as the Trait craft's bases | As band 6 |
| 8 | `wolfram_earrings`, `wolfram_necklace`, `wolfram_ring`, `cerecloth_cloak` | Held as the Trait craft's bases | As band 6 |
| 9 | `moonbloom_elixir` | Cut with the bench | A buff food (the draught line's). The Deep Cellar's re-points to Emberfruit Cordial, its rung's band |
| 9 | `void_banquet` | Cut with the bench | A buff food, and "Void" is a banned filler name (DESIGN_STANDARDS 2) |

Re-pointed by the cut's data lane besides: the Master's Shop's Duskwood Planks to Yew Planks (its Rune Bars' band: a band 4 workshop should not need an Ox Road record). Cooked Shark is band 7's meal now, and 4.15's re-point of the Great Hearth's to Cooked Swordfish stands for the same reason.

**Walk-through: a company's first Dawnsteel day, on real data.** It holds what the rune walk-through (4.15) ends with, walked on through band 5 once Carter's Rest opens: bands 0 to 5 goods and every kit trade at Level 51. Each trade needs 67.8 work-hours of its own XP from Level 51 to 61 (`tradeXpTable`: 392,298 to 636,233 seconds of work), so the six trades with a band 6 job take about thirteen planned free days of a company of four. Every id was grepped on the set (`items.js`, `hunt-grounds.js HUNT_GROUNDS`, `hunts.js` staged, `danger.js`, `trades.js` through `jobRecipes`, `catalogue-coherence` doors).

| # | Step | Holds and can reach (steps before only, plus bands 0 to 5) | Real source | Doable |
|---|---|---|---|---|
| 0 | Hunt the Ox Road to a depth record | Band 5 gear and kit. The Ox Road opens at Level 112 | `HUNT_GROUNDS.ox_road` (staged), `DANGER_GROUNDS.ox_road` gear Level 120 (band 6, `hr_trade_band_open` reads band 6 or deeper). Drops `dawnstone_ore` (`drover`, `wagonmaster`) and `big_bones` (`yoke_ox`, `wagonmaster`) | Once the Ox Road opens |
| 1 | Mine Dawnstone Ore, Mining 61 | The band 6 record from step 0. No input | `ore_b6`, face `dawnstone_ore` | Yes once lit |
| 2 | Smelt Dawnsteel Bars, Smithing 61 | Ore from step 1 (or step 0's drops) | `bar_b6`, 1 `dawnstone_ore` to `dawn_bar` | Yes once lit |
| 3 | Forge Dawnsteel Arrowheads, Smithing 61 | Bars from step 2 | `arrowhead_b6`, 1 `dawn_bar` to `dawn_arrowheads` (new) | Yes once lit |
| 4 | Chop Duskwood Logs and Saw Duskwood Planks, Woodcutting 61 and Woodcrafting 61 | Nothing needed for the logs | `log_b6` (`duskwood_log`), `shaft_b6` (1 `duskwood_log` to `duskwood_plank`) | Yes once lit |
| 5 | Fletch Dawnpoint Arrows, Woodcrafting 61 | Arrowheads from step 3, planks from step 4 | `arrow_b6`, 1 `dawn_arrowheads` and 1 `duskwood_plank` to `dawnpoint_arrows` (Ranged 120, the Ox Road's reference) | Yes once lit |
| 6 | Grind Dawnsteel Whetstones, Smithing 61 | Bars from step 2 | `honing_stone_b6`, 2 `dawn_bar` to `dawn_whetstone` (Melee 120, the arrow's rung) | Yes once lit |
| 7 | Catch Frostfin and Cook Frostfin, Fishing 61 and Cooking 61 | Nothing needed for the fish | `fish_b6` (`frostfin`), `meal_b6` (1 `frostfin` to `cooked_frostfin`) | Yes once lit |
| 8 | Pull Emberfruit and Brew Emberfruit Cordial for the caster, Farming 51 and Cooking 51 | Nothing needed for the crop (or the plots' emberfruit, `emberfruit_seed` from the shop) | `grain_b5` (`emberfruit`), `drink_b5` (1 `emberfruit` to `emberfruit_cordial`). Band 6 has no drink of its own until its consume row can land (call 8) | Yes once lit |
| 9 | Mix Dawnsteel Tempering Salts, Smithing 61 | Bars from step 2 | `temper_kit_b6`, 3 `dawn_bar` to `dawn_temper_salts`, what a rank on Dawnsteel gear takes (rank 3 opens at Level 120) | Yes once lit |
| 10 | Cut Graven runes for the caster, Runecutting 41 | Blank Runes from band 0's Mine Rune Essence and Cut Blank Runes, Big Bones from step 0 | `rune_<family>_b4`: 2 `rune_blank` and 1 `big_bones` to `graven_<family>_rune` (Magic 71). Band 6 cuts no rune of its own until the rune ladder's next rung (call 4) | Yes once lit |

No step needs a good only the bench, the store or the start kit makes. The walk found two gaps, both ruled above: the Dawnsteel Whetstone wanted Melee 168, so a band 6 company ground a stone its fighter could not use for fifty Levels (call 3), and the band had no drink, which waits on a server catalogue (call 8). Bands 7 and 8 walk the same way from a Wyvern Roost or Catacomb record (gear Levels 140 and 160) for the ore, bar, salts, fish and meal, and spend band 6's arrows and stones, band 5's cordial and band 4's runes.

**The labor ratio at 10, 12 and 14 hours, at band 6,** MEASURED. The burn is the real engine's: the Steady four (hammer, bow, mage, healer) at the Ox Road's reference Level 120, mid kit, nothing over item Level 139, 8 seeds x 10 h (`node tools/balance-program/redesign/v1-climb.mjs --ground ox_road --level 120 --only base:steady --seeds 8 --hours 10 --max-il 139`, saved as `k1-band6-oxroad.json`), priced by the K1 tool (`measure.mjs --from <burn> --days 10,12,14`, saved as `k1-band6-measured.txt`). The four held step 96.2 against the Ox Road's `refStep` 100 (depth 10), paid 0.97 of the hours table and never died. Its kit asks 0.48 work-hours a hunted hour (0.56 with imbuements). The drink is band 5's cordial for now, and a kind's work is the same at every band (KR-HOURS), so the ratio stands.

| Hunting a hero a day | Free 8 h, whole day planned | Free 8 h, 0.8 used | Premium 10 h, whole day | Kit made at home / from the store (free, whole day) | Gold the kit costs, share of gross (free, whole day) |
|---|---|---|---|---|---|
| 10 h | 0.60 | 0.75 | 0.48 | 100% / 0% | 0.030 |
| 12 h | 0.72 | 0.90 | 0.58 | 100% / 0% | 0.030 |
| 14 h | 0.84 | 1.05 | 0.67 | 100% / 0% | 0.030 |

Band 6 sits under the 0.8 to 1.0 this page wants on a planned 12 hour day (0.72) and in it on the 0.8 used day (0.90), the shape band 5 had. That is the burn, not the recipes: the meal line's restore falls past band 4 (1.21 kit-hours of it a hunted hour on the Pyre Field, 0.65 on Carter's Rest, 0.66 on the Ox Road), because the healer covers 86% of what the four takes there. The four's kit share is 0.25, inside EL-KIT's band. **No trade lever owns it:** `kitWork` would need 1.11 times to lift band 6 to 0.8 at 12 hours, and that puts bands 1 and 2 at 1.10 and 1.12. The Ox Road is staged but reads close to its reference, so this ratio may be close to its final shape: a Dawnsteel company has about two spare work-hours a hero on a planned day, which go to the trade furthest behind, the hall and the castle (5.3). **Bands 7 and 8 wait:** their charge line and drink are band 6's goods until their rungs land (call 4), so a ratio read now would price a kit the band can't make. The lane that lands the rungs re-runs the Wyvern Roost's and a Catacomb wing's burn.

**The store a band behind stays the fallback** (the same tool, a hero at the band's first step, gold an hour of effect): band 6's meal line is 1,082 at the store against 727 crafted at the band and 720 a band behind, its charge line 2,163 against 1,455 and 1,441. Band 7's are 1,172 against 788 and 780, and 2,343 against 1,576 and 1,561; band 8's 1,269 against 853 and 845, and 2,538 against 1,707 and 1,691. The store is 1.49 times the crafted good at the band and 1.50 times the one a band behind (KR-STORE, every band 0 to 8). At bands 7 and 8 the crafted charge is band 6's Dawnpoint Arrows and Dawnsteel Whetstones, so the store's Plain Dawnpoint (three quarters of the arrow) is still the weaker and dearer buy.

*Read with care.* The pace table again applies one burn to the whole career. The first principle holds: nothing here asks a player to repeat a choice. A job runs on its count and the work-block rule, a new band's rows appear in the Work window with the record, and a stone is picked on the bar once like an arrow.

### 4.17 The cut's plan: four lanes, one merge (2026-11-28, backend architect, lane/bench-cut-server)

**How it plays:** the Work window's Jobs list is the town work. A hero's trade Levels are its company's, and every trade starts at Level 1 the day the cut lights. The Great Hearth's fuel runs stay until the company flame lights (4.13 row 3). There is no recipe to learn, no bench fee and no bench queue.

**The order.**

1. This plan lands alone on the set. The Coordinator starts the other three lanes from that one tip.
2. The four lanes work in parallel on the files the table gives each, and no file is in two rows. Each lane runs its own touched guards on its own branch. A guard that can only be green with another lane's half is named in that lane's `LANE DONE` as "needs <lane>", never weakened (CLAUDE.md 2).
3. The Coordinator merges data, then server, then edge, then client onto the set in one sitting, re-renders every generated output on the merged tree with its own tool (any `*.generated.sql`, `tests/*baseline*.json`, `levers.json`, `graph.json`, `ci-shape`: CLAUDE.md 3.3), runs the union of the four lanes' touched guards, and pushes one run to `next`.
4. At release the cut file applies after every catalogue it reads, and its last statement lights `trade_jobs`. The hr-accrue deploy follows the apply. An old edge on the cut database finds no town pointer to accrue but a hearth run, and a gather or bench start it proposes is refused by hr_apply's own catalogue check, since `hr_activities` then holds no such row.

**Who owns what.** A lane commits its own render of a generated file it moves; the merged render is the Coordinator's.

| Lane | Agent | Owns (only these) | Deletes | Adds or changes |
|---|---|---|---|---|
| Data | game designer | `src/data/**`; `tools/balance-program/**`; the data-only guards (`kit-recipes`, `catalogue-coherence`, `bands`, `temper-steps`, `recipe-yield-guard`, `cut-orphans --check`) | the bench in `recipes.js` (every recipe but the hearth's `fuel_*` runs), `gathering.js`'s nodes as town work, the eight trade skills (Crafting and Runecrafting among them) from `SKILLS_DEF`, the gathering tools, every orphan `cut-orphans.mjs` fates "cut" | the fates 4.12 to 4.16 rule: the drops (`graypelt_cloak`, `warband_bulwark`, `steelgrate`, `klappas_club` or its cut), the held Trait bases under `UNREACHABLE_FATES` bucket (a), every re-point (rooms, properties, the castle, the Great Hearth, the Cask Room, the Deep Cellar, the Master's Shop); the crops' `req_lv` on the job ladder's rungs (`bandRung`, since the plots then gate on 4.5's curve); `hunt-tutorial.js` and `the-path.js` off the bench; the staged catalogues its rows move (1063 by `gen-trades`, 1065 by `gen-catalogues`, the three 1069 files, 1070 by `gen-farm-catalogues`, every other by its `--check`) |
| Server | backend architect | `supabase/migrations/1079-one-town-work-cut.sql` and its sidecar; the staged server files whose retry pins it amends; `tools/gen-catalogues.mjs`, `tools/gen-bench-tax.mjs`, `tools/gen-hunt-sessions.mjs`, `tools/pack/sql.mjs`; `tests/hunt-core/conditions.mjs` (sql-rows' source only); the DB guards whose subject is the bench, a job, company trades or the farm's XP; `tests/run-sql-tests.mjs`, `tests/chain-removals/1079-*`; the schema-drift and restore-census pins; `13-security-list.md` | `hr_bench_inputs()` and its generator section; `hr_bench_makes`; the bench tax (`hr_bench_tax_rates`, `hr_bench_tax_fees`, its five functions, the `bench_tax` section, hr_apply's branch, `gen-bench-tax.mjs`); the `bench_run` section; the recipe verbs (`hr_recipe_learn`, `hr_recipes_of`, the envelope's `recipes`); `company_trades`, `hr_trade_row_sync`, `hr_trade_lock`, `hr_trade_is`; every pin a generator wrote on a bench row | the held trade skill rows and every held item the catalogue no longer has, removed and journalled (`one_town_work_cut`, one `admin` row an account, nothing converts); every gather pointer and every artisan pointer that is no hearth run, to idle; the farm credits `company_trade_xp` (`crop_xp` a crop) and gates on `hr_trade_level_of`; the trade-skill readers restated (the list is the file's header); `hr_hunt_action_ids` rendered by `gen-hunt-sessions`; the last statement lights `trade_jobs` |
| Edge | reliability engineer | `supabase/functions/**`; `src/core/artisan.js`, `src/core/artisan-sim.js` and the gather half of `src/core`; the edge guards; `tests/edge-bundle.baseline.json` | `accrue-gather.js`, `tick-gather.js`, the bench half of `accrue-artisan.js` and `tick-artisan.js`, `catalogue.js`'s bench and gather rows, the bench tax proposal | `set-activity.js` refuses `gather` and allows `artisan` only for a `fuel_*` run; the envelope and tick readers without `bench_run`, `bench_tax`, `recipes` and `work_day.trades` |
| Client | systems engineer | `src/session/**`, `src/shell/**`, `src/app/**`, `src/world/**`, `src/hunt-view/**`, `src/render/**`; the client guards and their baselines (layering, module size, dead exports, module preload) | `town-work.js`, `bench-fee.js`, `bench-output.js`, `station-sort.js`, `town-ticker.js`, `bench-sections.js`, `recipe-intents.js`, the Work window's gather and bench rows | the Work window as the Jobs list, the work blocks and the hearth; the Skills window's trade lines from `trade_jobs.trades`; the bag's Cook all, the first hour's coach and the item tips' "Made by" lines point at jobs |

A test belongs to the layer of the thing it proves. The replay guards with a gather or bench fixture (61 counted in 4.12): a guard whose subject was the bench retires with that said in its commit (CLAUDE.md 3.6), and a unique catch is re-aimed at a job or the hunt channel by its layer's lane.

**What lights `trade_jobs`:** the last statement of `1079-one-town-work-cut.sql`, after its self-check: `update public.hr_flags set enabled = true where key = 'trade_jobs'`. One transaction, so no apply leaves the bench beside the switch, or the switch dark with the bench gone.

**The HANDOFFS items it folds in.**

- *kit-bands-2-3 item 5* (a job good sells to the vendor for at most its inputs plus its work): done by lane/job-goods-vendor (S-33). The cut adds nothing: the cap reads `jobRecipes`, so every row the data lane keeps is capped.
- *kit-bands-6-9 item 3* (bands 6 to 9's fates and re-points): the data lane's, as the table says.
- *kit-bands-6-9 item 7* (the `consume` block of `hr_hunt_action_ids` lives in the APPLIED `2027-01-13-slot-truth.sql`): the server lane's. `gen-hunt-sessions` renders the whole `hr_hunt_action_ids` block into its staged catalogue, and `tests/hunt-core/conditions.mjs` sql-rows reads it there, so a new drink is a data row again. Band 6's Moonbloom drink is the designer's next batch, not this cut.
- *The Artificing kinds* (`jewel_ring`, `jewel_earrings`, `jewel_necklace`, `cloak` and the `setting` part, 4.13's end) stay after v0.3.0 (20 section 1.4). The cut builds none of them. The 12 metal pieces and the four high cloaks are held as the Trait craft's bases.

**The bridge, and the debt named.** The hearth's fuel runs keep the artisan channel (4.13 row 3). hr_apply takes a fuel run's one input from the bag, then Storage, by its id (`fuel_<item>` burns `<item>`), and F1's lighting retires that channel, the `fuel_*` rows and hr_apply's town-window path together. The `gather` branches left in bodies the cut does not restate (the world tick, the rally, the online counts) are inert once no `gather` row exists, and they leave in that same F1 pass.

**Release note facts.** Every trade starts at Level 1, and nothing of the old Mining, Woodcutting, Fishing, Farming, Cooking, Smithing, Crafting or Runecrafting carries over. The public bench and its fee are gone; a job's fee is the only one. Items the cut removes leave bags, Storage and the market. Gathering tools are gone. A hero who was gathering or at a bench when it lands is idle in town.

---

## 5. The supply and demand lifecycle

**What this model is.** Arithmetic on stated inputs. Nothing in this section was run on the engine. The inputs that only the engine or live play can give are named in section 5.8.

### 5.1 The inputs

| Input | Value | Label |
|---|---|---|
| Heroes for each account | 4 | SOURCE: `CLAUDE.md` section 6 |
| Player mix | 20% hunt 12 hours a hero each day, 50% hunt 6, 30% hunt 2. The mean is 6.0. Under the 10 hour day, 12 hours means Premium or a bought block | SPECULATIVE. No reading exists for a healthy server |
| Work day, and the share of it used | 8 hours, 0.8 | Lever, and SPECULATIVE |
| `kitWork`, `townWageShare`, `storeCeiling`, `jobFee` | 0.8, 0.25, 1.5, 0.25 | Levers at their starting values |
| Gold unit | Hours of wage, so the tables hold at every Level | From `04` section 11 |

### 5.2 Generation and burn at 1,000 and 10,000 accounts

| A day on the server | 1,000 accounts | 10,000 accounts |
|---|---|---|
| Hunted hero-hours, on the mix | 24,000 | 240,000 |
| Hunted hero-hours, if every hero hunted 12 hours | 48,000 | 480,000 |
| Coin minted, in hours of wage | 24,000 | 240,000 |
| Town labor, work-hours | 25,600 | 256,000 |
| Labor the kits ask for, if every hero used crafted goods, on the mix | 19,200 | 192,000 |
| The same, if every hero hunted 12 hours | 38,400 | 384,000 |
| Creature parts, remains and scrap dropped | 24,000 hour-units of each | 240,000 hour-units of each |

(COMPUTED. An hour-unit is what one hunted hero-hour drops.)

Every row scales by ten. That is the first result: **the size of the server does not move the balance.** What it moves is depth. With heroes spread over about ten bands, 1,000 accounts put about 100 accounts in a band's market, and 10,000 put about 1,000. Thin markets are the risk at small size, and the store's floor and ceiling are what cover it.

### 5.3 The labor ratio, the number that sets prices

```
labor ratio = (mean hunted hours x kitWork x share using crafted) / (workDay x share of it used)
```

| Mean hunted hours a hero each day | Labor ratio, all using crafted | Idle labor | Supplies the store must fill |
|---|---|---|---|
| 3 | 0.38 | 63% | 0 |
| 4 | 0.50 | 50% | 0 |
| 6 (the mix) | 0.75 | 25% | 0 |
| 8 | 1.00 | 0 | 0 |
| 9 | 1.13 | 0 | 11% |
| 12 | 1.50 | 0 | 33% |

(COMPUTED.)

Under 1, labor is in surplus and crafted prices sink toward the floor. Over 1, labor is short, prices rise to the store's ceiling, and the store fills the gap. Near 1 the price sits near its reference and a work-hour earns its `townWageShare`. The design wants the ratio between about 0.8 and 1.0, with hall, castle and Weighhouse work taking up the slack.

**The same sum for one account** shows who trades with whom:

| Account | Hunted hero-hours | Labor its kits need | Labor it has | Net |
|---|---|---|---|---|
| Hunts 12 hours | 48 | 38.4 | 25.6 | Buys 12.8 work-hours of goods a day |
| Hunts 6 hours | 24 | 19.2 | 25.6 | 6.4 spare |
| Hunts 2 hours | 8 | 6.4 | 25.6 | 19.2 spare |

(COMPUTED.) The account that hunts all day cannot feed itself, and the account that barely hunts has three quarters of its labor free. Gold flows from the first to the second. That is the player-to-player economy, and it comes from the cap on the work day.

**The work day, and what Premium sells.** The owner's rulings of 2026-11-22. Each hero's town work has a daily cap, `workDay`, and Premium makes it longer by `premiumWorkExtra` (start 2 hours, band 1 to 2, never more than a quarter of `workDay`) (CR-Q3 b). Premium also adds 2 hours to the hunting day: "so 10 without premium 12 with". So Premium sells time of both kinds, and the payer gap now covers hunting hours too.

**The payer gap, said plainly.** For a hero who uses every hour of the day, Premium is 20% more hunting time: 12 hours against 10. That is 20% more XP, coin, drops and remains a day. In coin it is 2 more hours of wage before the kit and 1.5 after it, for each hero. With the town-work hours, a full-day account of four earns about 44 hours of wage a day on Premium against about 36 without, about a fifth more. A Level comes in about 17% fewer days. (COMPUTED: 4 heroes x (10 or 12 hunted hours x 0.75 net, plus 8 or 10 work-hours x 0.8 used x 0.25).) That is a paid edge in XP a day, and the owner ruled it on 2026-11-22 ("Premium should also buy 2 hours of stamina, so 10 without premium 12 with"). What keeps it small:

| Bound | What it holds |
|---|---|
| **Hours, never rate** | Nothing per hour changes. The depth a company holds, the XP and coin of a hunted hour, the drop chance, the flame, the yield, quality and speed of a work-hour, the recipes a trade opens and the Mastery cap are the same for every hero. A payer's hour is worth exactly a free hero's |
| **Only a full day sees it** | A hero who hunts under 10 hours a day gets nothing from Premium's hunting hours. On the mix, with a mean of 6 hunted hours, most heroes never reach the free cap |
| **Gold can match it** | A free hero who buys one hunting block hunts what a Premium hero hunts, for 4.0 hours of wage (2.5 net), a third of a full day's net coin (`04` section 11). So the hunting half of Premium is worth that much a day, and no more |
| **No power** | Town work makes the kit, which counts at `kitWeight` inside the kit spread limit. A free account can already make its own kit, since an account hunting 6 hours has 6.4 work-hours spare. Premium buys more of everything a day, not a stronger hero at any hour |
| **No new gold from the store** | The store floor's daily budget, `storeBudget`, is for the account and Premium does not raise it. Extra labor reaches gold only by selling to players, which moves gold and mints none |
| **Faster, never higher** | Trade XP comes about 25% faster at 2 extra work hours: one trade to 99 in about 31 days of full work in place of 39 (COMPUTED). The cap at 99 and the three Masteries are the same, so a payer gets there sooner and holds nothing a free account cannot |

**Premium and the labor ratio.** Its two halves cancel. 2 more hunted hours ask for 1.6 work-hours of kit (2 x `kitWork`), and 2 more work hours give 1.6 (2 x 0.8 used). If a third of heroes pay and use both, the ratio on the mix moves from 0.75 to about 0.77. (COMPUTED. SPECULATIVE on who pays.) Premium is a money surface and goes to the pre-launch Security review with both caps: the server alone reads Premium from its own column and sets each hero's hunting day and work day.

**Labor can be bought past the cap.** The owner's ruling of 2026-11-22: "Let's do the same thing with stamina that we are for labor, it can be bought, but it scales and pretty pricey." A hero buys town work in blocks on top of `workDay` and Premium's hours, by the one price rule of `04` section 11: 2 hours a block, 0.5 hours of wage an hour to start (band 0.4 to 0.6), 1.5 times dearer for each block that day, at most 4 blocks. What bounds it:

| Bound | What it holds |
|---|---|
| **The clamp and the growth** | At most 4 blocks a day. Four cost 8.1 hours of wage, 6.1 net of the goods they make, 82% of a free hero's full day of net coin |
| **Pricey from the first block** | A work-hour makes goods worth 0.25 hours of wage at reference, so the starting price is twice that. The floor of 0.4 sits above what a work-hour's goods fetch even at the store's ceiling (0.375), so bought labor never prints gold, even when labor is short |
| **No power** | A bought work-hour makes goods at the same yield, quality and speed as any other |
| **Faster, never higher** | Bought work trains a trade sooner. The cap at 99 and the three Masteries hold |
| **One clock** | A hero cannot hunt and work at once, so hunted, worked and bought hours fit inside one server day |

**What bought labor does to the labor ratio and market depth.** It adds supply, so it lowers the ratio and leans crafted prices toward the floor. At its price nobody buys labor to sell the goods, since they fetch less than the labor cost even at the ceiling. It is bought where a stock rule cannot be met, a band's market is thin, or a player wants trade XP sooner. That is where it helps: it deepens thin band markets at small population, one of the risks in section 7.1. If a tenth of heroes buy one block a day, labor rises about 3% and the ratio on the mix moves by about 0.02. With bought hunting and Premium in as well, `04` section 11's what-if puts the ratio near 0.84. The owner's cap of 2 hunting blocks a day does not move that, since the what-if already bought two. Tools add a twelfth to the labor asked for, near 0.92 (section 3.7). The Lab reads all three together (section 5.8). (COMPUTED. SPECULATIVE on who buys.)

**The steady state for crafted prices.** Two things bend toward balance. As the price falls, more heroes switch from store basics to crafted goods, which raises demand. As it rises, more accounts put idle heroes to work, which raises supply. The price is held inside the band from `floorShare` to `storeCeiling`, 0.4 to 1.5 times reference at the starting values. Where it rests inside that band depends on how players behave, and a model of people is the only thing that can estimate it (section 5.8).

### 5.4 The hunting streams and the cover rule

A stream floods when its drops outrun its burn. With a cover c and a share a of heroes using the sink:

```
net surplus for each hour-unit dropped = 1 - a x c
```

| Cover | 40% use it | 60% | 80% | 100% | Floods below |
|---|---|---|---|---|---|
| 1.0 | +0.60 | +0.40 | +0.20 | 0 | Always, until everyone uses it |
| 1.25 (`partCover`) | +0.50 | +0.25 | 0 | -0.25 | 80% use |
| 1.5 (`flameCover`) | +0.40 | +0.10 | -0.20 | -0.50 | 67% use |

(COMPUTED. A plus is surplus and a minus is shortage.)

| Stream | Its sinks | Cover | What happens to surplus |
|---|---|---|---|
| Common parts | Draughts by the hour | `partCover` 1.25 | Price falls, more heroes drink draughts, the rest goes to Weighhouse orders or the store floor |
| Rare parts | Imbuements, jewelry, carry-over | Authored by hours for each rarity, as `04` section 10 has it | They are rare by construction |
| Remains | The flame, and bone for runes | `flameCover` 1.5 | The flame's first fuel adds the most, so every company burns some. A full flame needs more than a company drops, so drop chasers buy from the rest. Bought remains burn (`02` section 2b), so this demand is real, and the market tax on it is a gold sink |
| Plain gear | Salvage to scrap, then Temper | `scrapCover` 1.2 | The store floor |
| Trait pieces | Worn, traded, or burned by carry-over | None needed | Their stock only grows, as `04` section 10 notes. Carry-over is their only burn |

At 1,000 accounts on the mix, with 60% of heroes using draughts at a cover of 1.25, a quarter of the 24,000 hour-units of common parts dropped each day are surplus: 6,000. At 10,000 accounts it is 60,000. (COMPUTED.) That is the stream the Weighhouse and the floor must be sized to take.

### 5.5 The floor is a small faucet

If every idle work-hour on the mix server were spent gathering and the goods sold to the store at the floor: 6,400 work-hours, times 0.25, times 0.4, is 640 hours of wage a day at 1,000 accounts, against 24,000 minted by hunting. That is 2.7%. The daily budget of one hour of wage for an account caps it at 1,000 in any case. At 10,000 accounts both numbers are ten times larger and the share is the same. (COMPUTED.)

So the floor can exist without becoming an inflation engine, as long as it has the budget. The risk of flooding in this design is not gold. It is a crafter's hour falling to 40% of its reference worth.

### 5.6 The gold ledger, and what crafting cannot do

One account on the mix, 24 hunted hero-hours a day, in hours of wage. The share of heroes on crafted goods is the row.

| Share on crafted | Store basics | Job fees | Market fee and cut | Imbuement fees | Temper | Carry-over | All crafting sinks | Share of coin minted |
|---|---|---|---|---|---|---|---|---|
| 20% | 5.76 | 0.24 | 0.02 | 0.29 | 0.55 | 1.20 | 8.06 | 34% |
| 60% | 2.88 | 0.72 | 0.06 | 0.86 | 0.55 | 1.20 | 6.27 | 26% |
| 100% | 0 | 1.20 | 0.10 | 1.44 | 0.55 | 1.20 | 4.49 | 19% |

(COMPUTED. Inputs beyond the levers of 4.7: half of crafted supplies change hands on the market at a 4% fee and cut, an imbuement fee of 0.06 hours of wage for each hunted hour across three pieces, half of Temper's price as a fee, a Trait piece every 40 hunted hero-hours of which one in five is carried at 10 hours of wage. Each of those is SPECULATIVE.)

Two findings.

1. **Crafting's sinks are 19 to 34% of the faucet.** `04` section 11 wants gold destroyed over gold created near 0.85 to 1.0. Crafting does not get there, at any lever value I would call sane. At least half of the faucet has to be destroyed by wealth sinks outside this page: the hall's rooms, the castle, hero slots, the first climb up the Temper ladder, Blessings, bought hunting and bought town work (`04` section 11, the owner's rules of 2026-11-22), the market tax on remains bought for the flame, and whatever the owner decides about Crowns. Each must be priced in hours of wage or it fades.
2. **The sinks fall as the economy improves.** At 20% on crafted the store burns 5.76. At 100% it burns nothing. A fee on the job is the only crafting sink that grows as players supply each other, which is why `jobFee` starts as high as a quarter of a good's value.

### 5.7 The controls, judged

| Control | Use it? | Where |
|---|---|---|
| **Sinks sized to the flow** | Yes. The main control | The kit, the covers |
| **Return rates** | Yes | The yield curve. Yield over 1 is a return |
| **Soft caps** | Yes | The work day, the store's daily budget and falling bid, buy limits by 4 hour window, Farming's plots, three Masteries |
| **Binding** | Almost none | Store basics are never items. Everything a player makes or finds trades, in line with the owner's "no bound gear" (the rulings record, 2026-10-23) |
| **Decay** | No | Spoilage punishes being away, in a game built on being away. Timed effects count hunted hours only. Tools wear by the work-hour, never by the clock (section 3.7) |
| **A valve that mints nothing** | Yes | The flame and the Weighhouse |

### 5.8 What the Balance Lab must simulate

This belongs to the economy phase of `07-balance-lab.md` (phase 6, the account day and its ledger). The Lab confirms or breaks each line below.

| # | What to run | What it settles | Proves this page wrong if |
|---|---|---|---|
| 1 | **Kit burn on the engine.** Meals, drinks and charges used for each hunted hour, by seat, style and stance, on the new sustain model | The real size of a kit-hour, and whether the bill can be the same for every style | Burn differs between styles by more than a stated tolerance after the line is sized. Then parity needs a different unit than "the hour" |
| 2 | **The kit's worth in depth.** The reference company on store basics, on Plain crafted and on Master crafted | `kitWeight`, `storeLag`, `qualitySteps`. Whether the gap can be felt | A store-fed company cannot hold its ground on Careful. Or the best kit is worth under 4% of pace at any allowed value |
| 3 | **The account day with town work.** Engine cells for the hunt, the closed form for town jobs, the stock rules | The labor an account's kits need against what it has, for the three account kinds | The composed day and the same day played on `tools/qa/local-world.mjs` disagree past the tolerance |
| 4 | **The server day.** Account days of a few kinds, summed, with the mix, the bought hunting and work blocks and the share on Premium as swept inputs | The labor ratio and each stream's surplus across mean hunted hours of 3 to 12 | No value of `kitWork` and `workDay` keeps the ratio inside 0.6 to 1.2 across that range. Then the labor cap needs to follow hunting, not the clock |
| 5 | **The cover sweep.** Each hunting stream at use shares of 20 to 100% | `partCover`, `flameCover`, `scrapCover`, and the size of Weighhouse orders | A stream's surplus exceeds what the floor budget and the orders take at a 40% use share |
| 6 | **The gold ledger.** Faucets and sinks for a server at day 30 and day 180, with every wealth sink in hours of wage | Whether sinks over faucets reaches 0.85 to 1.0, and how much of that crafting carries | Gold held for each account grows without limit in days of income |
| 7 | **The band markets.** Accounts in each band at 300, 1,000 and 10,000 accounts, on a Level spread from career runs | Whether a band's market is deep enough, and so how wide a band must be | Fewer than a stated number of sellers in most bands at 1,000 accounts. Then bands widen or orders match across neighbors |
| 8 | **The market model, last.** Price-belief agents (the reference study's test bed) on the fee, cut, buy limit, floor and ceiling | Where the crafted price rests, and whether any rule lets it run away | A price pinned at the floor or the ceiling for most of a simulated month. Its output is a model of people and is labelled so |

Items 1 and 2 need the engine batch of `04` section 12 (sustain counters, ratings). Until it lands they can only be sketched, under the SKETCH fence of `07-balance-lab.md` section 3.3.

---

## 6. The server shape

Every craft is a request the server answers. The client never names an output, a quantity made, a roll, a price or an XP amount. (This is `CLAUDE.md` section 1 applied. JUDGMENT for the shape below.)

| Piece | Shape |
|---|---|
| **The catalogue** | Generated on the server from the kind rows and the levers: every recipe's inputs, time, XP and catalogue value. The client reads it. A recipe id the server does not know is refused |
| **Trade state** | One row for the company and trade: XP as a Level and a share, and the Mastery flag. Masteries are counted on the server against `masteryCap` |
| **Stacks** | Keyed by item kind, band and quality. A stack exists only in bands the account has touched, so storage grows with a company's own range and not with the world's |
| **Storage** | Counted in stacks, not in units: an existing stack always grows, and only a new kind, band or quality needs room. Base room (`storageBase`) is sized by the Lab so a company working all its trades in its nearest three bands never fills it. The hall's storage rung adds room, and Crowns tabs add room for good (`10-premium.md` section 4). A full store refuses only a new stack, and the loot rule then lists or sells it. Nothing is ever deleted, and the return card says what happened |
| **A job** | One row: the hero, the recipe, the count asked, the start time on the server's clock, and a seed. The intent is "start this recipe, this many, with this hero". Inputs are debited at the start. The result is one calculation at the end or at a stop: attempts from elapsed time, yield and quality from the seeded dice. Three writes a job, the closed form the cost study requires |
| **Stock rules** | Rows in the company plan. The server builds the job list from them. The client sends targets and price limits, never jobs it has decided were finished |
| **Enhancement** | One request each for imbue, Temper, carry-over and salvage. Each names pieces the server already owns. The server checks ownership, reads the price from the catalogue, rolls anything that rolls, and writes the piece |
| **The store** | Ask and bid are computed on the server from the catalogue value and the hero's own band. The bid's daily budget is a counter on the account |
| **The market** | Orders are rows. Matching, fees, buy limits and the guide price are the server's. Price and quantity from a client are bounded against the catalogue value before they can reach another player |
| **The journal** | Every movement is a ledger row with a reason: inputs debited, outputs credited, XP, each fee, each store sale, each burn. The gold ledger of section 5.6 is a query, not an estimate |
| **Clamps** | Each request has a limit for the call and for the day. Recipes are sized in hunted hours of effect, so a full work day moves small numbers and sits far under the per-item clamp that the old arrow rows broke (section 0.7) |
| **One roller** | Yield and quality dice live in one pure function in `src/core`, called by the server and by the Lab. A second copy would be a second engine |
| **Tools** | A tool is a stack row with a band, a quality and the work-hours left. The closed-form job counts wear from the work it settles and swaps a spare from stock inside its own write, so wear adds no statement. A Crowns tool is a catalogue row the count skips, bound to the account. The client never names a tool's life |
| **Both paths** | A job gives the same result with the page open or the browser closed. The screen may show a moving bar as a prediction. Nothing can spend a predicted item |

Every piece here touches inventory, gold or trade, so the whole surface is inside the one adversarial security review before Early Access. The points I would hand that review first: seeded dice that cannot be re-rolled by stopping a job, the band on an item that cannot be raised by any request, catalogue value as the only anchor for a fee, and the Mastery count.

---

## 7. Risks, alternatives and open questions

### 7.1 Risks

| Risk | Why it is real | What limits it |
|---|---|---|
| **The labor ratio depends on how long players hunt** | It runs from 0.38 to 1.5 across plausible play (section 5.3), and no reading of a healthy server exists | The floor and ceiling bound the damage. The Weighhouse and the castle absorb slack. `kitWork` is one lever to move after launch |
| **Thin band markets at small population** | About 100 accounts a band at 1,000 accounts, far fewer in a playtest | Store basics always work. Self-supply covers the floor lines. Neighboring bands substitute at a known discount |
| **Free accounts as labor farms** | A work day is free gold for every extra account | Work parties need a depth record, so labor needs real hunting. Beyond that it is an account policy question for the owner |
| **The kit is a chore, or cannot be felt** | Four lines for four heroes is sixteen things to keep stocked. And the gap between store and best may be too small to notice | Stock rules make it one decision. The Lab sizes the gap (section 5.8, item 2). If it cannot be felt at a safe size, cut the draught line before adding anything |
| **Bands multiply stacks** | Kind times band times quality | An account touches two or three bands at a time. Quality folds into the item's step, so a listing is a kind and a step |
| **A style falls out of favor and takes a trade with it** | Charges follow styles | Every maker has a second burner (section 2.1). Bill parity removes the price reason to avoid a style |
| **Gold piles up** | Crafting covers a fifth to a third of the faucet | Named plainly in section 5.6. It needs the wealth sinks, in hours of wage |
| **The store ceiling is wrong** | Too low and nobody crafts. Too high and a thin market punishes new players | One lever. The Lab reads the store's share of all supplies used as its health check |
| **Tool wear reads as upkeep** | One more thing that runs out, in ten trades | The plan swaps tools and the store rents one when stock is out, so work never stops and nobody presses anything. If a played week shows players watching tool counts, raise `toolHours` first |
| **Company trades remove a hero's identity** | A hero is no longer "the smith" | Any hero can be shown at the bench the player assigns. The owner chose company trades (CR-Q1 a), so a hero has no best trade of its own |

### 7.2 Alternatives considered

| Alternative | For | Against | Verdict |
|---|---|---|---|
| Merge Smithing and Woodcrafting | One fewer ladder | Loses the arrow join and leaves one raw stream without its maker | Rejected |
| Six makers folded to four (Cooking with Alchemy, Smithing with Artificing) | Fewer to learn | Each fold joins a floor line to a decision line, and joins two streams that are better sold apart | Rejected. Worth a second look if a played first week shows ten trades is too many |
| Trades on each hero, at most two a hero | Each hero has an identity. The reference study's forced-trade pattern | Four heroes cover eight of ten trades, so little trade is forced, and the grind is four times as long | Rejected. The owner chose three Masteries for the account (2026-11-22) |
| Crafted weapons and armor | Crafters at the center, as in Albion | It takes the drop out of the hunt, against the brief's own premise | Rejected |
| Durability and repair | A proven sink | It taxes the rare drop the redesign is built around | Rejected |
| Healing potions from Alchemy | Familiar | Cooking loses its only job | Rejected |
| An upgrade gamble with a safety token | A deep gold and parts sink | A failure that costs a tier is a reroll with pain, and `02` refuses rerolls. It also sells safety, which is a money question | Rejected. Temper is a steady climb priced in hours of wage |
| A daily focus pool | Caps each account's best output | The work day already does that. A second pool is a second bar | Rejected |
| Supplies with no band, one row for every Level | Fewest items | A new account's labor sells at a far player's wage (section 4.2) | Rejected for traded goods. Kept for the store's basics |
| Spoilage | A classic flood control | It punishes being away | Rejected |
| A floor paid in gold with no cap | Simple, familiar | An open faucet under automated labor | Rejected. Capped, with the flame and Weighhouse beside it |
| A crafting minigame | Crafting as play | It needs the player's hands every time | Rejected. Its result, quality, is kept |
| Hunters gather between pulls | Already built | It ties gathered supply to hunted hours and floods with them | Rejected |
| Tools that never wear (this page's first draft) | Nothing to restock | Bought once, so no economy, and the Crowns tool would have nothing to spare the player | Replaced by section 3.7 |
| Tool quality as speed | A reason to buy Master tools | The Crowns tool would be weaker than the best crafted tool or better than most | Rejected. Quality is life |

### 7.3 Questions for the direction review, and the owner's answers

The first four are answered (2026-11-22). The rest stay open.

1. **Company trades with three Masteries, or trades on each hero?** Answered: company trades with three Masteries (CR-Q1 a). Section 2.6.
2. **Alchemy never heals.** Answered: yes, only food heals (CR-Q2 a). Section 2.2.
3. **May gold buy luck?** Answered: yes. Remains trade and bought remains burn (RD-Q1 b). The flame's room and its burn only while hunting bound it (`02` section 2b).
4. **A work day for town labor.** Answered: each hero has a daily cap, Premium makes it longer (CR-Q3 b), and more can be bought in pricey blocks (2026-11-22). Section 5.3 has the hours and what bounds the payer gap. Whether 8 hours is right stays a lever.
5. **Temper costs a share again at each tier.** Section 2.4. It is what makes the Level treadmill a crafting demand. The cost is that "it carries up" becomes "it carries up for a price".
6. **Hunters no longer gather.** Mining and Woodcutting between pulls was an owner ruling of 2026-10-14. Section 2.7 removes it.
7. **Runecutting.** The name, or Graving, or another.
8. **A death spills part of the kit.** Section 2.4. A small loss that never touches gear.
9. **Hall upkeep.** `02` asks whether the hall needs upkeep or only build costs. I recommend upkeep for bench bonuses only, with nothing ever lost.
10. **Who feeds a hired hero?** The hirer, the owner, or the store. Not designed here.
11. **How many trades should a new player meet in the first week?** I would open Cooking, Fishing, Mining and Smithing on day one and the rest by the company's first depth records. That is a first-hour question for `02` package 8.
12. **The size of the mix.** How many hours a day should a hero be able to hunt? Every number in section 5 turns on it. The owner settled it on 2026-11-22: the hunting day is 10 hours, 12 with Premium, and a hero can buy more with gold (`04` section 11). How long players really hunt inside that is still the mix, and only live play reads it.

### 7.4 What I did not check

- I ran no engine cell. Kit burn by style, the kit's worth in depth, and every share in section 5.6 are inputs I assumed.
- The player mix of section 5.1 is a guess. The only real reading is 15 heroes on 4 accounts, under an older hunting limit.
- Albion's focus and gear loss, EVE's research limits, and Wakfu's replanting and player-run regions are from memory. I read the pages linked in section 0 today and nothing else. Two wiki pages refused an automated read.
- Whether Runecutting or Artificing collides with another game's name.
- The server cost of job rows and banded stacks against the monthly budget. Closed form keeps a job at three writes, but nobody has counted the rows.
- How Crowns and the paid edge meet any of this beyond the owner's answers: Premium adds 2 hunting hours and lengthens the work day (section 5.3), Crowns sold for gold can buy remains for the flame, and gold buys hunting and work blocks. `10-premium.md` has Premium's contents, the Crowns store and the Crowns tool. All go to the pre-launch Security review.
