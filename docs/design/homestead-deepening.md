# The Homestead, Deepened — the personal half of the twin pillars

_Game Designer · 2026-08-08 · Wave 3c input_

**Directive this answers (DECISIONS 2026-08-08, Tyler, vision-level):** *"The clan castle and the personal homestead [are] the ultimate points of progression in this game, outside of the obvious maxing skills."* Both pillars get the same depth arc and the **same interaction language** — clickable rooms → per-room themed modals with upgrade ladders. Tyler's own example: *"the kitchen should have the different stove upgrades."*

`clan-overhaul.md` v2 specs the castle. This specs the homestead, on the same seam, inside one shared power budget.

---

## 0. Ground truth — what the homestead actually is today

Read from source, not from memory (`src/features/homestead.js`, `src/features/workers.js`, `src/features/farm-progression.js`, `ROOMS` / `renderHouse` / `upgradeRoom` / `getBonus` in `src/legacy.js`).

**Six property tiers** (`homestead.js TIERS`), each a real gold + material sink:

| # | Tier | Plots | Workers | Offline | Unlocks rooms | Cost |
|---|---|---|---|---|---|---|
| 0 | Wanderer's Camp | 2 | 0 | +0h | — | — |
| 1 | Hearthside Homestead | 4 | 1 | +0h | Kitchen, Garden | 400g · 30 Normal Log · 20 Copper Ore |
| 2 | Fieldworth Farmstead | 6 | 2 | +1h | Workshop, Cellar | 2,500g · 40 Oak Log · 25 Copper Ore · 4 Wolf Pelt · 10 Cooked Shrimp |
| 3 | Stonecross Manor | 8 | 3 | +2h | Forge, Library | 10,000g · 35 Willow Plank · 40 Iron Ore · 8 Silk Thread |
| 4 | Ironvale Keep | 10 | 4 | +3h | Shrine, Trophy Room | 40,000g · 50 Maple Plank · 35 Steel Bar · 20 Big Bones · 5 Bear Pelt |
| 5 | Hearthrise Castle | 12 | 6 | +4h | **nothing** | 150,000g · 70 Yew Plank · 40 Mithril Bar · 8 Rune Bar · 4 Dragon Scale |

**Eight rooms**, three levels each, and **rooms ARE the workbenches** — Kitchen gates Cooking, Forge gates Smithing, Workshop gates Crafting, Shrine gates Prayer (`homestead.js WORKBENCH` + `startArtisan`). A fresh player literally cannot cook until they build a kitchen. This is the homestead's best idea and everything below preserves it.

| Room | Tier | L1 / L2 / L3 | Key |
|---|---|---|---|
| Kitchen | 1 | Cook +10 / +25 / +50% | `cookSpeed` |
| Garden | 1 | Yield +1 / +2 / +4 | `farmYield` |
| Workshop | 2 | Craft +10 / +25 / +50% | `craftSpeed` |
| Cellar | 2 | +500 / +1500 / +5000 storage | `storage` — **reads nothing** |
| Forge | 3 | Smith +10 / +25 / +50% | `smithSpeed` |
| Library | 3 | All XP +5 / +10 / +20% | `allXP` |
| Shrine | 4 | Prayer +10 / +25 / +50% | `prayerSpeed` |
| Trophy Room | 4 | Combat XP +5 / +12 / +25% | `combatXP` |

**Workers** (`workers.js`): 0-6 slots from the property tier, hired for 500 → 200,000g, assigned to any woodcutting/mining/fishing action you have personally unlocked, producing at 25% → 52% of your rate with lazy accrual capped at 24h.

**Four things that are broken or missing, found while reading:**

1. **The Cellar's whole ladder is inert.** `getBonus('storage')` is called by nothing. There is no inventory cap anywhere in the game. A player has spent up to 17,200 gold and 170 logs on three rungs of literally nothing. *(Standing backlog item — ruled in §4.)*
2. **Six more ghost bonus keys.** `noBurn`, `craftSave`, `kitDrop`, `farmYieldPct`, `hearthXP` and `storage` are all listed in the House bonus display (`legacy.js:5092`) and produced by nothing. The display is honest only because they are all zero.
3. **The Castle tier unlocks no room.** The game's final property tier — 150,000 gold and Dragon Scale — adds two plots, two workers, an hour of offline cap and a `+5%` line on a card. The end of the ladder is its flattest rung. *(Ruled in §5.)*
4. **P1, unrelated to this spec but blocking part of it:** `farm-progression.js TIERS` stops unlocking crops at Pumpkin, including at MAX plot level — but b215 added **Goldenroot (farming 62), Emberfruit (75) and Moonbloom (88)** to `CROPS`. `canPlantCrop()` is a hard gate in `plantCrop`, the seed picker and auto-replant, so **three crops, three seeds and two cooking recipes (Goldenroot Roast, Moonbloom Elixir) are unreachable at every plot level.** Farming's last 37 levels have nothing to plant. Raised separately; §3 depends on it.

---

## 1. The design law

> **A homestead room is a workbench first and a bonus second. Every rung must change what you can DO, how fast you do it, or how much comes out — never just a number on a card the player never opens.**

Three corollaries that constrain everything below:

- **Rooms stay workbenches.** No rung may gate a skill the room does not already gate. The Kitchen gating Cooking is the tutorial; the Library gating nothing is correct.
- **The b213 deadlock rule is absolute.** No rung may require a good that is only craftable at a bench the player cannot yet own. Proof for every cost in this spec is in §7.
- **Nothing already bought is ever devalued.** Rungs 1-3 of every room keep their exact live costs and effects. A player at Kitchen 3 wakes up at Kitchen 3, with the same +50%, having lost nothing.

---

## 2. The five-rung shape, and why the ladder is gated by the property

Every room becomes **five rungs**:

- **L1-L3** — today's rungs, verbatim. Cheap, early, and the reason the room exists.
- **L4, the *fitted* rung** — requires **property tier ≥ 3 (Stonecross Manor)**. Costs include a **castle good** (Timber Beam / Iron Fitting / Field Ration), so the two pillars speak one material language and a solo player has a reason to refine.
- **L5, the *named* rung** — requires **property tier ≥ 4 (Ironvale Keep)**, and the Kitchen/Library/Cellar flagships require **tier 5 (Hearthrise Castle)**. Costs include a **Keystone**.

This is the fix for the ladder's dead end. Today, property tiers exist to unlock rooms — so tier 4 unlocks two rooms and tier 5 unlocks none, and a player who has built all eight rooms has no reason to want a castle beyond +2 plots. With rung gating, **every property tier feeds every room**, and the castle is the only thing that opens the top rung of the Kitchen. That is what makes the property ladder a spine rather than a prologue.

---

## 3. The rooms

Each entry is the modal's contents: **identity → what it does now → the ladder → the actions.**

### 3.1 Kitchen — *the fire you cook on* · property tier 1 · gates Cooking

**Identity.** The first room anyone builds and the only one that is also a meal. Warm light, a pot, and a bench that gets heavier every rung. Tyler's stove example is the reference ladder for the whole spec.

**Now.** Gates the Cooking skill entirely. Grants `cookSpeed`, applied as `ms × (1 − speed)` in `doArtisanAction`'s interval.

| Rung | Name | Effect | Cost |
|---|---|---|---|
| 1 | **Hearthstone** | Cook +10% | 500g · 20 Normal Log *(live)* |
| 2 | **Iron Stove** | Cook +25% | 2,000g · 50 Normal Log *(live)* |
| 3 | **Cast-Iron Range** | Cook +50% | 8,000g · 30 Oak Log *(live)* |
| 4 | **Twin Range** — a second pot on the same fire | Cook +50%, **12% of cooks yield an extra portion** | 45,000g · 12 Timber Beam · 40 Willow Log · 25 Field Ration · *(tier ≥ 3)* |
| 5 | **The Great Hearth** | Cook **+60%**, **25% extra portion** | 250,000g · 2 Keystone · 30 Duskwood Plank · 8 Dragon Scale · *(tier ≥ 5)* |

**Why this ladder and not a bigger percentage.** `ms × (1 − speed)` breaks at 1.0. Homestead 0.60 + clan Lv6 0.05 + castle Smeltery/Sawmill 0.05 = **0.70**, which is the ceiling this spec will allow (§6, H3). So the top rungs pay in **yield**, not speed — and yield is the better reward anyway: an extra Cooked Shark is a thing you can see in the bag, where "+15% faster" is a thing you have to believe.

**Actions.** `[Upgrade]` · `[Go to Cooking]` (the room is a bench — the modal should hand you the bench) · `[What this unlocks]` when locked.

### 3.2 Garden — *the ground you work* · property tier 1

**Identity.** Rows, a watering can, and the smell of turned earth. The Garden is the only room whose bonus a player watches land, one harvest at a time.

**Now.** `farmYield`, a **flat** bonus added to every harvest's roll (`harvestPlot`: `rand(lo,hi) + floor(getBonus('farmYield'))`). Stacks with the Scarecrow plot-building (+0.1, which floors to 0 — a second inert perk, flagged).

| Rung | Name | Effect | Cost |
|---|---|---|---|
| 1 | **Kitchen Garden** | Yield +1 | 600g · 20 Wheat *(live)* |
| 2 | **Walled Garden** | Yield +2 | 2,500g · 60 Wheat *(live)* |
| 3 | **The Beds** | Yield +4 | 9,000g · 5 Pumpkin *(live)* |
| 4 | **The Glasshouse** | Yield **+6**, and a watering window lasts **3h instead of 2h** | 60,000g · 10 Timber Beam · 20 Silk Thread · 15 Goldenroot · *(tier ≥ 3)* |
| 5 | **The Orchard** | Yield **+8**, and **15% of harvests return one of the crop's own seeds** | 300,000g · 2 Keystone · 40 Duskwood Plank · 12 Moonbloom · *(tier ≥ 4)* |

**Two deliberate choices.** The L4 watering extension is a direct hook into `farming-watering.md` (#13) — one number in `growthHours()`, and it makes the Garden the room that owns *time* as well as *quantity*. The L5 seed return is the honest late-game farming sink: `crop.seed` already exists on every entry, `harvestPlot` is one seam, and a seed economy with no return path is what makes high-tier farming feel like a leak.

**Hard dependency.** Goldenroot and Moonbloom in the costs above are the point, not decoration — they force the Garden's top rungs to be *farmed*, not bought. They are currently **unplantable** (§0.4). **The Garden ladder cannot ship until `farm-progression.js TIERS` unlocks the three b215 crops.** That fix is a five-line data change and it should land first regardless, because it is a live P1 on its own.

**Actions.** `[Upgrade]` · `[Go to the Farm]` · `[Seeds you can plant]`.

### 3.3 Workshop — *the bench* · property tier 2 · gates Crafting

**Identity.** Sawdust, a vice, and every plank in the game. The Workshop is the room the rest of the homestead is built out of — its planks pay for three other rooms' rungs.

**Now.** Gates Crafting. `craftSpeed`.

| Rung | Name | Effect | Cost |
|---|---|---|---|
| 1 | **Work Bench** | Craft +10% | 700g · 15 Normal Plank *(live)* |
| 2 | **Joiner's Bench** | Craft +25% | 2,800g · 25 Oak Plank *(live)* |
| 3 | **The Sawpit** | Craft +50% | 11,000g · 30 Willow Plank *(live)* |
| 4 | **The Lathe** | Craft +50%, **`craftSave` 10%** — one craft in ten consumes no materials | 50,000g · 12 Iron Fitting · 30 Maple Plank · 10 Silk Thread · *(tier ≥ 3)* |
| 5 | **The Master's Shop** | Craft **+60%**, **`craftSave` 20%** | 260,000g · 2 Keystone · 25 Duskwood Plank · 6 Rune Bar · *(tier ≥ 4)* |

`craftSave` is a **declared-but-unread key that already exists** in the House bonus display. Reviving it costs one line at `consumeInputs(r)` and retires a ghost. That is the pattern this spec prefers everywhere: consume the seams that were built, before inventing new ones.

**Actions.** `[Upgrade]` · `[Go to Crafting]`.

### 3.4 Cellar — *the ruling* · property tier 2

> **Designer ruling, 2026-08-08 — the Cellar's `+500 storage` perk is REPURPOSED, not enforced.**
>
> **Why not enforce storage.** There is no inventory cap in Hearthrise, anywhere. Building one would mean (a) inventing a limit every existing save is already over, (b) shipping a *restriction* as the payoff of a feature wave, and (c) adding inventory management — the most-hated chore genre in idle games — to a game whose core promise is that it plays while you are away. Enforcing storage would make the game worse and cost more than repurposing.
>
> **Why repurposing is free.** `getBonus('storage')` has never been read. **There is no player who can be worse off** — nobody has ever received the thing being taken away. The three rungs keep their exact live costs, so a player who bought them gets a real effect for the first time. This is the only backlog item in the game that can be fixed with zero migration and zero regret.
>
> **What the Cellar becomes: the room where things keep.** It is the home of the *Feasts & Draughts* half of cooking (`crafting-cooking-taxonomy.md` §4) — the buff line that auto-eat is forbidden to touch and that consequently has no room of its own. A cellar full of casks is what the art already implies.

**Identity.** Cold stone, low light, shelves of stoppered bottles and one cask you are saving.

**Now.** Nothing. It is the one room in the game that does not work.

| Rung | Name | Effect | Cost |
|---|---|---|---|
| 1 | **Root Cellar** | Food buffs last **+20%** longer | 1,200g · 60 Normal Log *(live cost, kept)* |
| 2 | **Stone Cellar** | Buffs last **+40%** longer | 4,000g · 60 Oak Log *(live cost, kept)* |
| 3 | **The Vault** | Buffs last **+60%** longer | 12,000g · 50 Willow Log *(live cost, kept)* |
| 4 | **The Cask Room** | **+80%**, and Draughts (`foodClass:'buff'` recipes) yield **one extra portion in five** | 70,000g · 12 Timber Beam · 20 Field Ration · 6 Goldenroot Roast · *(tier ≥ 3)* |
| 5 | **The Deep Cellar** | **+100%**, and **one draught a day is kept on tap** — re-apply your last buff once per UTC day at no material cost | 320,000g · 2 Keystone · 4 Moonbloom Elixir · 20 Duskwood Plank · *(tier ≥ 5)* |

**Zero new machinery.** `registerBuffScaler(name, fn)` already exists (b222 SEAM 2), built for the castle Tavern's Hearth and explicitly designed so a second consumer registers rather than edits call sites. The Cellar registers `'homestead.cellar'` returning `{duration: 1 + cellarBonus}`. Composition is multiplicative across scalers, scaling happens at application time, and re-registration replaces rather than compounds. This ruling requires **no seam at all**.

**Actions.** `[Upgrade]` · `[Feasts & Draughts]` (jumps to the cooking sub-tab) · `[Keep on tap]` at L5.

### 3.5 Forge — *the anvil* · property tier 3 · gates Smithing

**Identity.** Heat, a bellows, and the ringing that means someone is home.

**Now.** Gates Smithing. `smithSpeed`.

| Rung | Name | Effect | Cost |
|---|---|---|---|
| 1 | **Field Forge** | Smith +10% | 800g · 30 Copper Ore *(live)* |
| 2 | **Stone Forge** | Smith +25% | 3,000g · 50 Iron Ore *(live)* |
| 3 | **Double Bellows** | Smith +50% | 12,000g · 100 Iron Ore *(live)* |
| 4 | **The Great Bellows** | Smith +50%, **10% chance of an extra bar when smelting** | 55,000g · 15 Iron Fitting · 60 Steel Bar · 20 Coal · *(tier ≥ 3)* |
| 5 | **The Deep Forge** | Smith **+60%**, **20% extra bar** | 280,000g · 2 Keystone · 20 Mithril Bar · 6 Dragon Scale · *(tier ≥ 4)* |

> **The material-only yield law (hard rule).** `yield_*` and `craftSave` may fire **only** on a recipe whose output has no `type` — i.e. a material, never a weapon, armour or jewel. One predicate: `!ITEMS[r.output].type`. Without it, a 20% extra-output roll on a Slagheart Platebody prints 270,000 gold at the vendor (which pays full item `v`), and the Forge becomes the largest gold faucet in the game. With it, the Forge doubles *bars* — inputs, not outputs — which is exactly what a better forge should do.

**Actions.** `[Upgrade]` · `[Go to Smithing]`.

### 3.6 Library — *the quiet room* · property tier 3

**Identity.** The one room with no bench: shelves, a desk, a candle. It is where the homestead stops being a workshop and starts being a house.

**Now.** `allXP` +5 / +10 / **+20%** — the single largest permanent bonus any player can hold.

| Rung | Name | Effect | Cost |
|---|---|---|---|
| 1 | **Shelf** | All XP +5% | 1,000g · 50 Normal Log *(live)* |
| 2 | **Reading Room** | All XP +10% | 4,000g · 50 Oak Log *(live)* |
| 3 | **The Library** | All XP **+20%** | 15,000g · 30 Maple Log *(live)* |
| 4 | **The Scriptorium** | All XP +20% *(unchanged)*, **Rested XP potency 25%** | 65,000g · 12 Timber Beam · 25 Silk Thread · 10 Magic Essence · *(tier ≥ 3)* |
| 5 | **The Great Library** | All XP +20% *(unchanged)*, **Rested potency 50%**, **Rested cap 80 → 100 charges (10h)** | 300,000g · 2 Keystone · 30 Duskwood Plank · 12 Ancient Rune · *(tier ≥ 5)* |

**The Library's ladder deliberately stops raising `allXP` at L3, and this is the most important number in the spec.** Post-re-scope the `allXP` ceiling is Library 20 + property capstone 5 + renown 22 + castle Great Hall 5 = **+52%**, against the recommended `allXP ≤ 0.60` fuse. Eight points of headroom is not room for two more rungs — it is the fuse doing its job. So the Library's top rungs pay in a different currency entirely.

**And the currency is already built.** `G.restedXp` (b222 SEAM 3) banks one charge per 6 minutes offline, capped at 80, spent one charge per XP grant, multiplied by `getBonus('restedXp')` — **which is 0 today, so the entire bank is inert.** `clan-overhaul.md` §9.4 hangs the castle Tavern's Common Room on it and calls it *"the one mechanic that pays a player for the time they weren't playing."* The Library is the solo player's Common Room. Consuming this seam is the single highest-value rung in the spec: it costs one number, it adds nothing to the XP ceiling, and it turns eight hours of being offline into a reason to come back.

> **New cross-pillar conflict, raised here:** if both the Library and the castle Common Room grant `restedXp`, `getBonus` **sums** them and potency could reach 100% — double XP on 80 banked charges. **Ruling: `restedXp` is clamped at 0.50 aggregate inside `getBonus`. The two rooms are alternate routes to one ceiling, never additive rungs.** A clanless maxed homestead and a clanned castle reach the same Rested cap by different roads, which is exactly what "twin pillars" is supposed to mean.

**Actions.** `[Upgrade]` · `[Rested: N charges]` (shows the bank and what it is worth) · `[Skills]`.

### 3.7 Shrine — *the still place* · property tier 4 · gates Prayer

**Identity.** A small altar, an offering, and the game's most tedious action.

**Now.** Gates Prayer. `prayerSpeed`. Burying bones is a one-at-a-time artisan action.

| Rung | Name | Effect | Cost |
|---|---|---|---|
| 1 | **Wayside Shrine** | Prayer +10% | 900g · 40 Bones *(live)* |
| 2 | **Stone Altar** | Prayer +25% | 3,500g · 25 Big Bones *(live)* |
| 3 | **The Chapel** | Prayer +50% | 13,000g · 8 Dragon Bones *(live)* |
| 4 | **The Reliquary** | Prayer +50%, **one action buries 5 bones** | 55,000g · 10 Iron Fitting · 60 Big Bones · 20 Grave Dust · *(tier ≥ 3)* |
| 5 | **The Ossuary** | Prayer **+60%**, **one action buries 10** | 270,000g · 2 Keystone · 30 Dragon Bones · 4 War Crown · *(tier ≥ 4)* |

**The bulk-bury unlock is the whole rung, and it costs no power budget.** Burying 400 dragon bones one at a time is the least defensible ten minutes in Hearthrise. Batching is a capacity change, not a multiplier: it touches no `getBonus` key, it cannot stack with anything, and it makes the thinnest skill in the game playable. `War Crown` at L5 routes one of the three Great Hall capstone trophies (`clan-seat.js SPOILS_ROUTES`) into a solo sink as well — a drop with two homes is health, not conflict.

**Actions.** `[Upgrade]` · `[Bury bones]` · `[Go to Prayer]`.

### 3.8 Trophy Room — *what you killed* · property tier 4

**Identity.** Mounted heads, a rack of banners, and the only room that is purely about what you have already done.

**Now.** `combatXP` +5 / +12 / +25%. Stacks with the Watchtower plot-building (+2%).

| Rung | Name | Effect | Cost |
|---|---|---|---|
| 1 | **Trophy Wall** | Combat XP +5% | 2,000g · 5 Wolf Pelt *(live)* |
| 2 | **The Hall** | Combat XP +12% | 8,000g · 3 Troll Hide *(live)* |
| 3 | **Hall of Heads** | Combat XP +25% | 25,000g · 2 Dragon Scale *(live)* |
| 4 | **Hall of Banners** | Combat XP **+30%**, and the room **displays your three rarest kills** (Collection Log) | 60,000g · 12 Iron Fitting · 6 Bear Pelt · 3 Ancient Claw · *(tier ≥ 3)* |
| 5 | **The Long Gallery** | Combat XP **+35%** | 290,000g · 2 Keystone · 6 Dragon Scale · 1 Dragon Gem · *(tier ≥ 4)* |

The display at L4 is not decoration: the Collection Log is one of the three retention pillars and currently has no *place*. The Trophy Room is its place, which is the difference between a log and a trophy.

**Actions.** `[Upgrade]` · `[Collection Log]` · `[Combat]`.

---

## 4. Phase 3 — the three rooms the ladder promises and never delivers

### 4.1 Workers' Quarters · property tier 1 · new

The property tier grants worker slots from tier 1, but workers have no room — they live in a strip inside the Property card, which is why most players never find them. Give them a door.

| Rung | Name | Effect | Cost |
|---|---|---|---|
| 1 | **Bunkhouse** | Workers accrue for **30h** without direction (from 24h) | 3,000g · 40 Normal Log · 10 Wolf Pelt |
| 2 | **The Long House** | **36h** accrual | 12,000g · 40 Oak Plank · 20 Silk Thread |
| 3 | **Quarters** | **48h** accrual | 45,000g · 30 Willow Plank · 30 Field Ration |
| 4 | **The Steward's Office** | 48h, **worker efficiency +5%** | 90,000g · 12 Timber Beam · 40 Field Ration · *(tier ≥ 3)* |
| 5 | **The Household** | 48h, **+10% efficiency**, and workers may be assigned to **farming** (auto-harvest one plot) | 340,000g · 2 Keystone · 30 Duskwood Plank · *(tier ≥ 4)* |

The accrual ladder is the point: 24h is a punishing cap for a player with a weekend, and extending it is the cheapest retention win in the homestead (`ACCRUE_CAP_MS`, one constant). Efficiency stays modest because workers are a **converter of your unlocked actions**, never a faucet — the same rule that killed the castle's Grounds district (`clan-overhaul.md` §14.10).

### 4.2 Stables · property tier 4 · new

Companions have definitions, procs, a shop, pet rolls and **one equip slot**. They have no home.

| Rung | Name | Effect | Cost |
|---|---|---|---|
| 1 | **Paddock** | Your companion's stat bonus **+10%** | 20,000g · 40 Maple Plank · 20 Wheat |
| 2 | **Stables** | **+20%**, and companion procs fire **+2pp** more often | 80,000g · 12 Iron Fitting · 30 Silk Thread |
| 3 | **The Menagerie** | **+30%**, and a **second companion slot** | 350,000g · 2 Keystone · 8 Dragon Scale · *(tier ≥ 5)* |

Three rungs, not five — a room with one mechanic should not pretend to have five. The second slot at L3 is the whole ladder's payoff and needs an `EQUIP_SLOTS` addition, so it is deliberately last and deliberately Phase 3.

### 4.3 The Great Hall · property tier 5 · new, and auto-built

**The Castle tier currently unlocks nothing.** 150,000 gold, 70 Yew Plank, 40 Mithril Bar, 8 Rune Bar, 4 Dragon Scale — and the reward is two plots and a `+5% All XP` line on a stat strip. The end of the game's personal spine is its flattest rung.

The Great Hall is where that +5% moves to, so it reads as a *place* instead of a footnote — and so the homestead's final room is the mirror of the castle's first one.

**It is granted at L1, free, the instant a player reaches Hearthrise Castle.** No existing castle owner is asked to re-buy a bonus they already hold. L2 and L3 are new.

| Rung | Name | Effect | Cost |
|---|---|---|---|
| 1 | **The Great Hall** | All XP **+5%** *(the existing castle capstone, moved here)* | free at Castle |
| 2 | **The Banner Hall** | +5% All XP, and your **renown rank banner** hangs here with its perks summarised | 400,000g · 3 Keystone · 40 Duskwood Plank |
| 3 | **The Seat** | +5% All XP, **+2h offline cap**, and the household ledger: lifetime gold, kills, harvests, rooms | 1,000,000g · 5 Keystone · 12 Dragon Scale · 1 War Crown |

The million-gold rung is deliberate. The homestead needs one goal that outlasts everything else in the solo game, in the same way the castle's 8,000,000-gold treasury does for a clan. `allXP` does **not** move at any rung — the +2h offline cap at L3 is the reward, because offline cap is the one currency this game can still afford to spend (§6).

---

## 5. The interaction seam — one modal, two pillars, zero new machinery

The castle panel is building the room-modal machinery now. The homestead **consumes it unchanged**. To make that literally true, the seam is a **pure-data descriptor** — no DOM, no strings of HTML, no pillar-specific fields — produced by each pillar's own reducers and rendered by one shared renderer.

```js
// window.HearthriseRoomModal.open(descriptor)
{
  id:        'kitchen',                    // stable key, used for the art lookup
  pillar:    'homestead' | 'castle',       // theming hook ONLY — never branches logic
  title:     'Kitchen',
  kicker:    'Hearthside Homestead · Tier 1 room',
  flavour:   'The first room anyone builds, and the only one that is also a meal.',
  art:       { glyph: 'uiKitchen', img: 'assets/…/kitchen.png', lit: true },

  state:     'locked' | 'unbuilt' | 'built' | 'max',
  lockReason:'Requires Fieldworth Farmstead',      // null unless locked

  now: [                                   // what it does RIGHT NOW — never a promise
    { label: 'Cook speed', value: '+50%' },
    { label: 'Gates',      value: 'Cooking' }
  ],

  ladder: [                                // every rung, always, including owned ones
    { rung: 1, name: 'Hearthstone', effects: ['Cook +10%'],
      cost: [{ id:'gold', need:500, have:12400 }, { id:'normal_log', need:20, have:31 }],
      state: 'owned' },
    { rung: 4, name: 'Twin Range', effects: ['Cook +50%', '12% extra portion'],
      cost: [...], state: 'gated', gateReason: 'Requires Stonecross Manor' },
    …
  ],

  actions: [                               // 1 primary, then ghosts; disabled carries a reason
    { key:'upgrade', label:'Build Twin Range', kind:'primary',
      disabled:true, disabledReason:'Missing 12 Timber Beam', run:fn },
    { key:'goto',    label:'Go to Cooking',    kind:'ghost',  run:fn }
  ],

  footer: 'Rooms are workbenches — no kitchen, no cooking.'   // optional
}
```

**Six rules that make it a seam rather than a shape.**

1. **The scrim is the existing one.** `hr-rn-scrim` / `hr-dl-scrim` / `hr-mu-scrim` are five instances of one pattern already; the room modal is the sixth and it does not invent a seventh. One class family, `hr-room-*`.
2. **The renderer never branches on `pillar`.** It is a data attribute for CSS. The moment a renderer says `if (pillar === 'castle')`, the seam has failed and there are two modals again.
3. **The full ladder always renders**, owned rungs included and struck through as owned. A ladder that only shows the next rung is a shop row, which is what the House screen is today and the reason the rooms read as a list instead of a house.
4. **Costs are `{id, need, have}` triples**, so the checklist renderer from b217's `fmtCostRow` is reused verbatim — one row per requirement, the material's own art, a met/unmet state readable at a glance.
5. **A disabled action always carries `disabledReason`.** The b213 lesson (*"Missing: 12 gold, Normal Log ×17"* beats *"Not enough resources"*) is a rule, not a one-off.
6. **Descriptors are produced by pure functions and are directly testable.** `HearthriseHomestead.roomDescriptor('kitchen')` returns the object above with no DOM in the process, the same way `clan-seat.js` publishes reducers rather than renderers.

**What changes on the House screen.** The Rooms tab stops being eight `shop-row`s and becomes a grid of room cards — built ones lit, unbuilt ghosted, locked ones dimmed with their tier name — that open the modal on click. This is the same *lit vs ghosted* language `clan-overhaul.md` §13 specifies for the castle view, which is the point: a player who has learned one pillar's screen has learned the other's.

---

## 6. The power budget — the homestead's half of the cap discipline

`clan-overhaul.md` §8 set the castle's discipline. The homestead's is stated here in the same form, and the two are audited **together** because `getBonus` sums them.

### H1 — Aggregate

**Permanent homestead-derived bonuses may not exceed +45% aggregate effective throughput at maximum build** (Hearthrise Castle, every room at its top rung). Higher than the castle's +25% and deliberately so: the homestead is the **solo** pillar, and a clanless player must be able to reach a complete build that stands on its own. Every homestead perk is throughput, never access — except the four workbench gates, which are the tutorial, not a wall.

### H2 — Per-key ceilings

| Key | Homestead ceiling | Where |
|---|---|---|
| `allXP` | **+20%** | Library L3 — **does not move again, at any rung** |
| `combatXP` | +35% | Trophy Room L5 |
| `cookSpeed` / `smithSpeed` / `craftSpeed` / `prayerSpeed` | +60% each | the four benches at L5 |
| `farmYield` | +8 flat | Garden L5 |
| `restedXp` | +50% | Library L5 |
| `craftSave`, `yield_*` | +20% each | Workshop / Forge / Kitchen L5 |
| `goldFind` | **0** — left entirely to the castle Treasury, so the pillars do not duplicate |

### H3 — The artisan-speed fuse

`actualMs = ms × (1 − speed)` divides by zero in spirit at 1.0. Total per key: homestead 0.60 + clan Lv6 0.05 + castle 0.05 = **0.70**. **Clamp each speed key at 0.85 inside `getBonus`.** It does not bind today — that is what makes it a fuse and not a nerf.

### H4 — The `allXP` ceiling, recomputed honestly

`clan-overhaul.md` §8.3 computes the post-re-scope ceiling as **+47%**. That number omits the homestead **property capstone** (`getBonus` adds +5% when `isCastle()`). The true figure is:

| Source | allXP |
|---|---|
| Homestead Library L3 | +20% |
| Homestead property capstone / Great Hall | +5% |
| Renown (Squire → High King, six ranks) | +22% |
| Castle Great Hall T5 | +5% |
| **Total** | **+52%** |

Against the recommended `allXP ≤ 0.60` fuse that is **eight points of headroom, for the whole game, forever**. Therefore: **no system in either pillar may add a new `allXP` source, and no existing one may be raised.** The Library's L4/L5, the Great Hall's L2/L3 and the Stables' whole ladder are all designed around this constraint rather than against it. Correct §8.3's arithmetic when it is next touched.

### H5 — `restedXp` is one ceiling with two roads

Clamp `restedXp` at **0.50 aggregate**. The homestead Library and the castle Tavern's Common Room are alternate routes to it, never additive rungs. Without the clamp a clanned player with a maxed Library banks 80 charges at double XP.

### H6 — The material-only yield law

`yield_*` and `craftSave` fire only when `!ITEMS[recipe.output].type`. Materials, never equipment. Rationale in §3.5; the short version is that the vendor pays full item `v`, so an extra-output roll on endgame armour is a six-figure gold faucet.

### H7 — Temporary power, budgeted separately

The Cellar lengthens buffs; it does not strengthen them. `buffScaleFor` returns `{duration, magnitude}` and the Cellar touches **only `duration`** — magnitude is the castle Tavern Hearth's lane (`clan-overhaul.md` §9.1). Longest possible food buff: base × castle Hearth 1.40 × Cellar 2.00 = **2.8×**. On a Cooked Shark's 6 minutes that is 16m48s of +12% damage, which is a good cellar, not a second character.

---

## 7. Deadlock proof — every cost in this spec is reachable

The b213 rule: *no tier may require goods only craftable at a bench the player has not unlocked.* This spec introduces two new dependencies — castle goods at L4 and Keystones at L5 — so the proof must be explicit.

- **Timber Beam** — Crafting 25, needs the **Workshop** (property tier 2).
- **Iron Fitting** — Smithing 25, needs the **Forge** (property tier 3).
- **Field Ration** — Cooking 22, needs the **Kitchen** (property tier 1).
- **Keystone** — Crafting 60, consumes Timber Beam + Iron Fitting + Ancient Fragment + Cracked Spellstone (both drops).

Every **L4** rung requires property tier ≥ 3. Reaching tier 3 costs `35 Willow Plank` — a Workshop good — so **any player who can build an L4 rung already has a Workshop**, and therefore Timber Beams and Keystones. ✔

Every **L5** rung requires property tier ≥ 4. Reaching tier 4 costs `35 Steel Bar` — a Forge good — so **any player who can build an L5 rung already has a Forge**, and therefore Iron Fittings. ✔

Kitchen L5, Cellar L5, Library L5 and Stables L3 require tier 5, whose cost (`40 Mithril Bar`, `70 Yew Plank`) is strictly downstream of both benches. ✔

**No rung in this spec can be reached before the bench that makes its cost.** The one exception to watch: the Kitchen is a tier-1 room whose L4 needs a Workshop good — which is safe *only* because L4 is tier-gated at 3. If a future edit lowers a rung's tier gate, re-run this proof.

---

## 8. Phasing

### Phase 1 — next wave, buildable, and it is a complete thing on its own

1. **The room-modal seam, consumed by the House screen.** Rooms tab → clickable room grid (lit / ghosted / locked) → per-room themed modal showing the room's identity, what it does now, its **full** ladder including owned rungs, and its actions. Honest about today's three rungs; the modal is the machinery, not the content.
2. **The Cellar ruling** — three rungs of buff duration, costs unchanged, via `registerBuffScaler`. **Kills the oldest item on the design backlog and needs no seam at all.**
3. **Kitchen L4 + L5** — Tyler's own example, and the flagship. Needs the one new seam.
4. **Library L4 + L5** — Rested XP, consuming a seam that is already built and currently inert. The single highest-value rung in the spec.

**Seams Phase 1 needs, in full — three, all one-liners:**

| Seam | Where | Shape |
|---|---|---|
| `getBonus('yield_' + skillId)` | `doArtisanAction`, at `addItem(r.output, …)` | `qty += Math.random() < b ? 1 : 0`, **only if `!ITEMS[r.output].type`** |
| `restedXp` clamp | `getBonus` | `if (key === 'restedXp') t = Math.min(0.5, t)` |
| speed clamp | `getBonus` | `if (SPEED_KEYS.has(key)) t = Math.min(0.85, t)` |

The Cellar needs **zero** — `registerBuffScaler` already exists and was built for exactly this second consumer.

**Blocking dependency:** the Garden ladder is *not* in Phase 1 because §0.4's crop gate must be fixed first. That fix should ship regardless.

### Phase 2 — the rest of the ladders

Garden, Workshop, Forge, Shrine and Trophy Room L4/L5; property-tier rung gating applied across all eight rooms; the `craftSave` revival; the bulk-bury unlock; the seed-return; the watering-window extension.

### Phase 3 — the new rooms

Workers' Quarters (tier 1), Stables (tier 4), **the Great Hall (tier 5, auto-granted)**. The Great Hall is the one that matters most: it is the only thing that makes the property ladder's final rung feel like an arrival, and it is the homestead's answer to the castle's Great Hall — the same room, the same name, one built by a person and one by a clan. That symmetry is the twin-pillar directive made literal, and it is worth building last precisely because it is the payoff.

---

## 9. Conflicts and dependencies (for `CONFLICTS.md`)

1. **`restedXp` is now claimed by both pillars.** Homestead Library L4/L5 and castle Tavern Common Room. Ruled in §6/H5 as one clamped ceiling with two roads. Whichever ships first must land the clamp.
2. **`clan-overhaul.md` §8.3's allXP arithmetic is four points low** (+47% stated, **+52%** actual — the homestead property capstone was omitted). Correct it when §8.3 is next touched. The `≤0.60` fuse still holds; the headroom is thinner than the castle spec believes.
3. **P1, live, independent of this spec:** `farm-progression.js TIERS` never unlocks Goldenroot / Emberfruit / Moonbloom, so three crops (farming 62/75/88), three seed items and two cooking recipes are unreachable at MAX plot level. Blocks §3.2; should be fixed on its own schedule regardless.
4. **The material-only yield law (H6) is a rule the *castle* also needs.** Any future castle building that grants extra output must carry the same `!ITEMS[out].type` predicate, or it becomes the faucet H6 exists to prevent.
5. **The Scarecrow plot-building grants `farmYield: 0.1`**, and `harvestPlot` floors the total — so it has contributed exactly nothing since launch whenever the Garden's own bonus is an integer. Same class as the Cellar. Small, but it is a purchased perk that does not work.
6. **Six ghost keys in the House bonus display** (`noBurn`, `craftSave`, `kitDrop`, `farmYieldPct`, `hearthXP`, `storage`). This spec retires two of them properly (`craftSave` revived at Workshop L4; `storage` deleted with the Cellar repurpose). The other four should be **deleted from the display list**, not invented into mechanics — a bonus row that can only ever read zero is a promise the UI is making on the game's behalf.
7. **Art dependency:** eight room illustrations in lit / ghosted / locked states, plus three Phase-3 rooms. Same "Forge & Stone" language as the castle view, and the two must be produced together or the twin pillars will not look like twins.
