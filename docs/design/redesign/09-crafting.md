# 09. The crafting ecosystem, from first principles

Written 2026-11-21 on `lane/rd-crafting`, from `set/v0.2.144`. Docs only. It answers the owner's crafting brief of 2026-11-21, point by point. Read `01-identity.md`, `02-architecture.md` (package 5, package 2, sections 2b and 2c) and `04-math-strategy.md` first. Nothing here is built, nothing here is final, and every number is a starting value for the Balance Lab to settle.

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
| **Smithing** | Make | Honing stones, arrowheads, Temper kits, fittings | Melee heroes every hour. Every arrow. Every piece of gear at every tier |
| **Woodcrafting** | Make | Arrows and bolts, ward charms, timber and furniture | Ranged heroes every shot. Front heroes every hour. The hall and the castle every week |
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

**What I most want you to rule on.** Company-owned trades with a cap of three Masteries (section 2.6). Alchemy that never heals (2.2). Remains that trade, so gold can buy luck (7.3). A daily cap on town work for each hero (5.3). Whether Temper costs a share again at each new tier (2.4).

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
| Focus, a daily pool that refills, spent to craft better (from memory: tied to the paid tier) | It caps each account's best output, so many small crafters matter and no one account floods a market | **The cap, yes. The pool, no.** Our heroes already have a work day in hours. A second pool is one more bar to watch. Whether a paid tier lengthens the work day is the owner's call |
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
| Production chains with level and tool gates | An item's price holds the work of several skills | **Chains yes, at most three stages. Tools no.** A tool with no durability is bought once and then is not an economy. The bench in the hall takes that job (section 2.9) |

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

With that rule Cooking is the largest steady market in the game, and the only buyer for Fishing. Without it one of the two is redundant. This keeps the spirit of the old "no potions" ruling without keeping the ruling.

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

Five standing demands, none of which destroys a piece a player wants to keep. (JUDGMENT)

| Demand | What is used up | How often | Why it never ends |
|---|---|---|---|
| **The kit** | Meals, charges, draughts | Every hunted hour | Heroes hunt every day |
| **Imbuements** | Rare parts and a fee | Every 20 hunted hours for each imbued piece | The timer counts hunted time |
| **The tier treadmill** | Temper kits, scrap, a fee | Every gear tier, about every 20 Levels, for every slot | Levels have no cap, so tiers have no end |
| **Trait work** | The old piece, matching parts, a fee | Each time a kept Trait moves to a new base | The same: a new base every tier |
| **Upkeep of benefits** | Timber, fittings, wax | Weekly, for the hall's bench bonuses and the castle | A lapsed room stops helping. It is never lost |

**The treadmill, and the one change it needs.** `02-architecture.md` says Temper carries up when a piece is replaced. If it carries for free, Temper is paid once and then never again. I recommend that the Temper rank carries, so the choice is remembered, and that seating it on the new base costs a share of its full price (`temperCarry`, start 0.35) in materials of the new band. COMPUTED: 14 slots, a full Temper of 3 hours of wage a piece, a carry of 0.35, and a tier about every 320 hunted hours (20 Levels at the 16 hour ceiling of `04` section 5) is 0.046 hours of wage for each hunted hour, about 4.6% of a hero's coin, forever.

**What I refuse.** Durability, repair bills, and gear lost on death. They work in games built on loss. Here they would tax the one thing the redesign makes exciting, a rare drop that stays with a hero for life.

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

**Why trades stay company-owned.** `02-architecture.md` moved trades from each hero to the company, and `06-comparison.md` asked whether that cuts too much content. With the Mastery cap I think it does not: the grind is cut by up to four, and the choice (which three) is added. The alternative, trades on each hero with a cap of two a hero, is in section 7.2. This is the first call I want the owner to make.

**How long 99 takes.** `tradeHoursTo99` starts at 1,000 hours of work for a trade. COMPUTED, with each Level costing 4.5% more than the last: Level 50 at 104 hours, Level 70 at 269, Level 90 at 669, and the last Level alone takes 44 hours. An account working all four heroes a full work day (25.6 hours of work, section 5.3) reaches 99 in one trade in 39 days if it does nothing else, and in all ten in about 13 months.

### 2.7 Automated hunting without flooding the market

Six rules, in the order they bite. (JUDGMENT for the rules. COMPUTED for the sizes, section 5.)

1. **Drops are authored in hours, not in kills.** `04` section 11 already says a drop row is "one in about N hunted hours". So a stronger company does not drop more units. It drops a higher band. The number of parts made on a server in a day is its hunted hero-hours times a constant.
2. **Every burn is authored in the same hours.** The kit is sized as one hunted hour of effect. So supply and demand are two constants times the same count of hours, and population cancels out.
3. **The cover rule.** For each stream that hunting drops, a hero who uses its sinks fully must burn more than that hero drops. The ratio is the stream's cover, and it is at least 1. Users then buy from non-users, and the price cannot rest at zero.
4. **Hunters do not gather.** Fish, ore, logs and herbs come only from town labor. Creature parts, remains and gear come only from hunting. So more hunting never floods gathered goods, and labor never floods creature goods. Every recipe needs both kinds.
5. **Labor has a daily cap.** A hero can work `workDay` hours a day. Automated work with no cap would be free and endless, and the price of everything made would fall to nothing.
6. **Surplus has somewhere to go that mints no gold.** The flame burns remains. The Weighhouse takes surplus goods for standing. The store buys at a low floor, inside a daily budget.

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
| Hand tools as items (axes, pickaxes) | **Remove.** The hall's bench rung does the tool's job | With no durability a tool is bought once |
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

### 3.5 How crafting plugs into the rest

| System | The plug |
|---|---|
| **Rolled Traits** | Crafted jewelry and cloaks roll one Trait. The pool is the Trait pool of the creature family whose rare part went into the craft, so a crafter aims by choosing a part, and a part's price follows its pool. The rank rolls on the quality cascade of section 4.4, so a master's ring is more often rank 2 or 3. Carry-over moves one Trait and burns the old piece, matching parts and a fee |
| **The luck flame** | Remains burn as dropped, by the stoke rule in the plan. Runecutting also wants bone as a binder, so the flame, the rune trade and the market bid for the same remains. Crafted Trait rolls do not read the flame. A crafter's luck is their Level and Mastery |
| **Creature parts** | Common parts go to draughts by the hour. Rare parts go to imbuements, jewelry and carry-over. Beast meat goes to the camp pot. Every part has an hourly or a tier burn |
| **The hall** | Each maker has a room. A room's rung is that trade's bench bonus to yield, kept up weekly in timber and fittings. A lapsed room falls to the plain bench and loses nothing else. Plots for Farming. Storage for stock. A trophy wall for Master work |
| **The castle** | A clan picks two trades as the castle's works. Members get a yield bonus in those two, so clans specialise and trade with each other. The castle's stages and upkeep are paid in crafted goods and in labor hours, which makes it the largest absorber of spare labor |
| **The party** | Each hero pays for their own kit. One camp pot serves the party. A hired hero's kit is an open question (section 7.3) |
| **The market** | Stacks by kind, band and quality. Standing orders from the stock rules. Trait pieces as single listings |

### 3.6 The Weighhouse orders

Each week the town posts orders for goods the server has too much of, sized by the count of active accounts. The server already counts weekly actives for the Weighhouse's goal (SOURCE: `src/data/town-works.js`, `perActive`). Filling an order pays standing: looks for the hall, a plaque, patterns. It pays no gold and no power. It turns idle labor and surplus stock into something worth having without minting a coin. (JUDGMENT. It is the collectable idea of section 0.5, pointed at whatever is in surplus.)

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

About sixteen global levers, counting pairs as one. `04`'s `supplyShare` becomes derived, so the net is about fifteen. Content tables beside them: the line shares, the stage shares, and the kind rows. A balance number keyed by a recipe, an item or a ground has nowhere to live, the same rule as `04` section 12.

---

## 5. The supply and demand lifecycle

**What this model is.** Arithmetic on stated inputs. Nothing in this section was run on the engine. The inputs that only the engine or live play can give are named in section 5.8.

### 5.1 The inputs

| Input | Value | Label |
|---|---|---|
| Heroes for each account | 4 | SOURCE: `CLAUDE.md` section 6 |
| Player mix | 20% hunt 12 hours a hero each day, 50% hunt 6, 30% hunt 2. The mean is 6.0 | SPECULATIVE. No reading exists for a healthy server |
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
| Remains | The flame, and bone for runes | `flameCover` 1.5 | The flame's first fuel adds the most, so every company burns some. A full flame needs more than a company drops, so drop chasers buy from the rest |
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

1. **Crafting's sinks are 19 to 34% of the faucet.** `04` section 11 wants gold destroyed over gold created near 0.85 to 1.0. Crafting does not get there, at any lever value I would call sane. At least half of the faucet has to be destroyed by wealth sinks outside this page: the hall's rooms, the castle, hero slots, the first climb up the Temper ladder, Blessings, and whatever the owner decides about Crowns. Each must be priced in hours of wage or it fades.
2. **The sinks fall as the economy improves.** At 20% on crafted the store burns 5.76. At 100% it burns nothing. A fee on the job is the only crafting sink that grows as players supply each other, which is why `jobFee` starts as high as a quarter of a good's value.

### 5.7 The controls, judged

| Control | Use it? | Where |
|---|---|---|
| **Sinks sized to the flow** | Yes. The main control | The kit, the covers |
| **Return rates** | Yes | The yield curve. Yield over 1 is a return |
| **Soft caps** | Yes | The work day, the store's daily budget and falling bid, buy limits by 4 hour window, Farming's plots, three Masteries |
| **Binding** | Almost none | Store basics are never items. Everything a player makes or finds trades, in line with the owner's "no bound gear" (the rulings record, 2026-10-23) |
| **Decay** | No | Spoilage punishes being away, in a game built on being away. Timed effects count hunted hours only |
| **A valve that mints nothing** | Yes | The flame and the Weighhouse |

### 5.8 What the Balance Lab must simulate

This belongs to the economy phase of `07-balance-lab.md` (phase 6, the account day and its ledger). The Lab confirms or breaks each line below.

| # | What to run | What it settles | Proves this page wrong if |
|---|---|---|---|
| 1 | **Kit burn on the engine.** Meals, drinks and charges used for each hunted hour, by seat, style and stance, on the new sustain model | The real size of a kit-hour, and whether the bill can be the same for every style | Burn differs between styles by more than a stated tolerance after the line is sized. Then parity needs a different unit than "the hour" |
| 2 | **The kit's worth in depth.** The reference company on store basics, on Plain crafted and on Master crafted | `kitWeight`, `storeLag`, `qualitySteps`. Whether the gap can be felt | A store-fed company cannot hold its ground on Careful. Or the best kit is worth under 4% of pace at any allowed value |
| 3 | **The account day with town work.** Engine cells for the hunt, the closed form for town jobs, the stock rules | The labor an account's kits need against what it has, for the three account kinds | The composed day and the same day played on `tools/qa/local-world.mjs` disagree past the tolerance |
| 4 | **The server day.** Account days of a few kinds, summed, with the mix as a swept input | The labor ratio and each stream's surplus across mean hunted hours of 3 to 12 | No value of `kitWork` and `workDay` keeps the ratio inside 0.6 to 1.2 across that range. Then the labor cap needs to follow hunting, not the clock |
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
| **A job** | One row: the hero, the recipe, the count asked, the start time on the server's clock, and a seed. The intent is "start this recipe, this many, with this hero". Inputs are debited at the start. The result is one calculation at the end or at a stop: attempts from elapsed time, yield and quality from the seeded dice. Three writes a job, the closed form the cost study requires |
| **Stock rules** | Rows in the company plan. The server builds the job list from them. The client sends targets and price limits, never jobs it has decided were finished |
| **Enhancement** | One request each for imbue, Temper, carry-over and salvage. Each names pieces the server already owns. The server checks ownership, reads the price from the catalogue, rolls anything that rolls, and writes the piece |
| **The store** | Ask and bid are computed on the server from the catalogue value and the hero's own band. The bid's daily budget is a counter on the account |
| **The market** | Orders are rows. Matching, fees, buy limits and the guide price are the server's. Price and quantity from a client are bounded against the catalogue value before they can reach another player |
| **The journal** | Every movement is a ledger row with a reason: inputs debited, outputs credited, XP, each fee, each store sale, each burn. The gold ledger of section 5.6 is a query, not an estimate |
| **Clamps** | Each request has a limit for the call and for the day. Recipes are sized in hunted hours of effect, so a full work day moves small numbers and sits far under the per-item clamp that the old arrow rows broke (section 0.7) |
| **One roller** | Yield and quality dice live in one pure function in `src/core`, called by the server and by the Lab. A second copy would be a second engine |
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
| **Company trades remove a hero's identity** | A hero is no longer "the smith" | Any hero can be shown at the bench the player assigns. Whether a hero should have a best trade is `02`'s open question, and I leave it open |

### 7.2 Alternatives considered

| Alternative | For | Against | Verdict |
|---|---|---|---|
| Merge Smithing and Woodcrafting | One fewer ladder | Loses the arrow join and leaves one raw stream without its maker | Rejected |
| Six makers folded to four (Cooking with Alchemy, Smithing with Artificing) | Fewer to learn | Each fold joins a floor line to a decision line, and joins two streams that are better sold apart | Rejected. Worth a second look if a played first week shows ten trades is too many |
| Trades on each hero, at most two a hero | Each hero has an identity. The reference study's forced-trade pattern | Four heroes cover eight of ten trades, so little trade is forced, and the grind is four times as long | Rejected in favor of three Masteries for the account. The owner's call |
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

### 7.3 Open questions for the direction review

1. **Company trades with three Masteries, or trades on each hero?** Section 2.6. Everything else here works with either.
2. **Alchemy never heals.** Is the owner content with draughts as answers and never as health? Section 2.2.
3. **May gold buy luck?** Remains trade in this design, so a rich company can keep a full flame. `06-comparison.md` already lists it as the owner's question. The alternative is remains bound to the account, which removes the flame as a market.
4. **A work day for town labor.** Section 5.3 needs a cap. Is 8 hours right, and may a paid tier lengthen it? That second half is a money call.
5. **Temper costs a share again at each tier.** Section 2.4. It is what makes the Level treadmill a crafting demand. The cost is that "it carries up" becomes "it carries up for a price".
6. **Hunters no longer gather.** Mining and Woodcutting between pulls was an owner ruling of 2026-10-14. Section 2.7 removes it.
7. **Runecutting.** The name, or Graving, or another.
8. **A death spills part of the kit.** Section 2.4. A small loss that never touches gear.
9. **Hall upkeep.** `02` asks whether the hall needs upkeep or only build costs. I recommend upkeep for bench bonuses only, with nothing ever lost.
10. **Who feeds a hired hero?** The hirer, the owner, or the store. Not designed here.
11. **How many trades should a new player meet in the first week?** I would open Cooking, Fishing, Mining and Smithing on day one and the rest by the company's first depth records. That is a first-hour question for `02` package 8.
12. **The size of the mix.** How many hours a day should a hero be able to hunt? Every number in section 5 turns on it, and `06-comparison.md` section 5 item 5 already holds it open.

### 7.4 What I did not check

- I ran no engine cell. Kit burn by style, the kit's worth in depth, and every share in section 5.6 are inputs I assumed.
- The player mix of section 5.1 is a guess. The only real reading is 15 heroes on 4 accounts, under an older hunting limit.
- Albion's focus and gear loss, EVE's research limits, and Wakfu's replanting and player-run regions are from memory. I read the pages linked in section 0 today and nothing else. Two wiki pages refused an automated read.
- Whether Runecutting or Artificing collides with another game's name.
- The server cost of job rows and banded stacks against the monthly budget. Closed form keeps a job at three writes, but nobody has counted the rows.
- How Crowns, premium and the paid edge meet any of this. Those are the owner's calls and this page assumes nothing about them.
