# 20. v0.3.0 "The Roads": the patch plan

2026-11-22, `lane/v030-plan`, game designer. Docs only. This file sets the cut line for the redesign's first release, what ships later and the share it keeps for itself now, the new first three hours walked against real data, every lane left in order, and the release gate.

**Tyler's rulings this plan builds to (2026-11-22).**
- The redesign ships as v0.3.0, "The Roads".
- Social systems (order book, hire board, clans, castle, arenas) can ship later "as long as we balance for it". Their power and sink share is reserved below.
- No hero conversion. Current players start new accounts.
- Premium, Crowns and the $15 EA box are not part of this patch.
- Art comes when it's ready, but every unique or rare item gets a standout icon.
- "Crank it out, fix as we go." No dates.

**Read on `origin/set/v0.2.144` at 7c6802f92.** Sources: `05`, `11`, `12`, `13-market`, `13-security-list`, `14` to `19`, and `.claude/coordination/HANDOFFS.md`. "Built" means merged on the set. Nothing on the set is applied or live yet (production is frozen).

**Status labels.** BUILT = merged on the set. IN FLIGHT = a lane has started. DESIGNED = written in a redesign doc and not built. NOT DESIGNED = no doc holds its numbers or rows yet.

---

## 1. IN v0.3.0: the cut line

### 1.1 Summary

| System | In v0.3.0 | Status | Notes |
|---|---|---|---|
| **Wave 1: side seam, Danger scale, power step, climb and fall back, causes, report** | Yes | **BUILT on Muster Barrows.** Not on any other ground | Missing: every other ground on the scale (R10) and the tier path removed. L10 (gold follows depth) is still open |
| **The 10 h day and bought hunting blocks** | Yes | BUILT (1058) | 2 blocks a day, ×1.5. Bought work blocks: DESIGNED |
| **Wave 2: monster roles and rows** | Yes | BUILT as a sample (Muster, Krell Lookout) | Every monster needs a role. Caster and Warder have no body yet |
| **Wave 2: depth pay** | Yes | BUILT on Muster | Goes to every ground with R10 |
| **Wave 2: personal loot** | Yes | DESIGNED (02 package 4) | Per-hero drop rates: NOT DESIGNED |
| **Wave 2: plan copying between players** | Yes, as a share code | DESIGNED | Copying between your own heroes is BUILT |
| **The Roads** (talent map, rank stones, crossroads, vows, borders, borrowing) | Yes, all seven weapon countries | DESIGNED (17 v3, 19) | Shield, Restoration, Club, Dual Axe laid out. Sword, Ranged, Destruction: NOT DESIGNED at node level |
| **Traits dropping** | Yes, on open grounds | Data BUILT and hidden (`traits.js`, 40 rows). Roll, engine and screens DESIGNED | 15 Traits roll in v0.3.0 (Muster 6, Pyre Field 4, Krell's Hold 5). The other 25 roll when their ground opens |
| **Very Rare (two Traits)** | **No**, next patch | DESIGNED | See section 2 |
| **Signatures** | Yes, **24 of 46** | DESIGNED (15) | Every Signature whose home is open in v0.3.0, except the loot hooks. List in 1.3 |
| **Wage and economy** | Yes | Wage, store prices and block prices BUILT. The rest DESIGNED | Still to do: store priced at the buyer's step, uses under 1 gold, an equal charge bill per style, bought work blocks, sinks priced in wage hours |
| **Crafted kit basics** | Yes: **the kit trades** | Company trades BUILT (R12 slice 1). Recipes on hours of work DESIGNED (09) | Decided in 1.4 |
| **Inner Flame as luck** | Yes | Fuels and the burn BUILT (old). Luck DESIGNED (02 2b). Room curve NOT DESIGNED | |
| **Temper** | Yes, rebuilt on steps | DESIGNED (19 L11). Today's `temper.js` is the old 1% rungs | Needs a Smithing Temper kit (Tyler 11-05) |
| **Carry-over** | Yes | DESIGNED (02 package 2) | Artificing. Without it, a Trait dies with its base |
| **Imbuements** | Yes, rebuilt on steps | DESIGNED (09 3.2, 19). Old `imbuements.js` exists | Artificing makes them from the imbuement parts monsters already drop |
| **The first-hour rewrite** | Yes | Recruits at 5 BUILT (1052, 1053). Kits STAGED (1036 to 1039). The Path BUILT. The rewrite is section 3 | |
| **Engine pieces** (Poison, timed buffs, shields, auras, heals over time, triggers, bar metrics, near fall-back, borrowing) | Yes, the ones the IN list needs | NOT BUILT. Listed in 18 section 4 and 15 | Section 4, lanes E1 to E5 |

### 1.2 Calls made here

- **Every open ground moves to the Danger scale, and the tier path is removed.** A first hour on tiers followed by a scale at Level 55 would teach two systems, and one would then be thrown away. Bramble Edge, Goblin Warren and Ridge Camp get kept or cut in R10. A ground that's kept goes on the scale.
- **Risk is taught at the first party ground, not before.** The Mill Cellar shows depth only, and plays Steady (`DEFAULT_RISK`, built).
- **The Roads ship whole for every live weapon.** A hero with no country would have no talents, which isn't a patch called The Roads. The Hearth is the center only. The support (the wraps, `22-fists-support.md`) waits for `FIST_LINE.live`, then ships as R-X3.
- **Traits roll only on grounds that are open.** The four staged grounds (Carter's Rest, Ox Road, Wyvern Roost, Unmarked Catacombs) bring their Traits and Signatures when their art lands. Their bands are designed now in R10, so they arrive with no rebalance.
- **No market in v0.3.0.** Trait pieces are kept, carried over or sold to the store. Remains burn or sell to the store. The book ships on its own (section 2).

### 1.3 The 24 Signatures in v0.3.0

| Home | Signatures (numbers from `15`) |
|---|---|
| Muster Barrows | 5 Pikeman's Gauntlets, 6 Barrow Knight's Blade, 36 Cairn Belt |
| Hask's Ford, Captain Hask | 1 Bannerman's Pavise, 23 Ferry Pennies, 27 Riverstone Earrings, 32 Ledger Ring, 38 Drowned Signet |
| The Slake | 17 Bargeman's Pole, 20 Greened Bracers, 22 Slake Waders, 34 Sergeant's Sash |
| Pyre Field | 4 Charred Sabre, 9 Lurcher's Collar, 11 Provost's Longbow, 24 Stoker's Ring |
| Krell's Hold, Lord Krell | 3 Grave Guard's Mail, 13 Hall Fire Wand, 35 Gatekeeper's Plate, 44 Pyre Priest's Hood |
| The Tower, Hearth Chest | 16 Lamplighter's Robe, 19 Passing Bell, 30 Raft Builder's Earrings, 37 Lychgate Leggings |

- **Sample of five first** (CLAUDE.md section 10): 1, 5, 6, 17, 36. Between them they cover Chill, a cooldown reset, a cooldown cut, a timed damage cut and a shield. They're played and read before the other 19 are built.
- **Out of v0.3.0:** 39 Tollman's Gloves and 40 Hearth Mason's Cloak (they change drops and need the market and Security), plus every Signature whose home is a staged ground. A Signature whose engine piece slips moves to v0.3.x. It doesn't hold the release.

### 1.4 Crafting: the kit trades are in, the rest of the professions wait

**How it plays:** your company gathers and makes the meal, the charge, the imbuements and the Temper kits your heroes burn. Draughts, crafted jewelry and Masteries come in a later patch.

| In v0.3.0 | Later |
|---|---|
| Gathering: Mining, Woodcutting, Fishing, Farming | Alchemy and draughts. The camp pot |
| Cooking: meals and drinks (the only heals, CR-Q2 a) | Crafted jewelry and cloaks that roll Traits |
| Smithing: honing stones, arrowheads, Temper kits | Salvage. Masteries (three an account) |
| Woodcrafting: arrows and bolts, ward charms | Tools that wear out after 12 h (they ship with the Crown tools) |
| Runecutting: runes | Weighhouse orders |
| Artificing: imbuements and carry-over only | |
| Store basics: unlimited, a tier behind, 1.5× the price | |

**Why:** Tyler's supplies ruling makes runes crafted, puts the store on basics only and makes imbuements crafted-only. Leaving out the kit trades would leave the store as the only supply, and every hunted hour would buy nothing from the company. Alchemy and crafted jewelry are their own systems with their own Lab runs. Their power share is reserved (section 2), so they can ship later.

---

## 2. OUT, shipping separately, and the share each keeps now

**How it works:** each thing below already has a fixed share of power, sinks or town hours. Every target in v0.3.0 is read with that share both on and off, so a system can arrive later without moving any other number.

| Ships separately | Reserved now, so it lands with no rebalance | Reader |
|---|---|---|
| **The market's order book**, single listings, storefronts | Every tradeable carries its catalogue value V from `wage(depth)` from day one (13-market decision 5). Traits bought on the book still sit inside the gear slice (20). The book's fees burn about 0.7% of minted gold (13-market 2.6), so the v0.3.0 gold ledger is balanced without them. Bought remains for the flame (RD-Q1 b) arrive with the book. The flame's room curve is sized so a flame fed to the top by bought fuel stays inside `kitSpreadMax` | V-column test on the catalogue. V10 kit sampler with the room at full |
| **Hire board and on-call heroes** | Hire pay is a cut of the hunt's own pay, never new gold. A hired hero uses its own hire stamina pool (S-1). C-6 and C-7 are read on seats, so a hired seat is just a seat. A hero's town hours are split three ways (own trades, hire, castle). The labor ratio (09 5.3) is read with hire and castle at zero and at their full share | Labor-ratio reader, both ways |
| **Clans and the clan Level XP room** | A new **clan slice of 4 steps** in `power-ledger.js`, zero until clans ship. The Level table is timed with the +5% XP room on and off, and the pace ceiling (about 1.73) covers it. "Everything at once" becomes 55 + 4 = 59, still under three tiers (60) | V8 and C-12 read twice |
| **The castle** | A named share of the sink budget: v0.3.0 is tuned so sinks burn **85 to 90%** of minted coin with no castle. The castle's buildings and upkeep take it to 95 to 100%. Its buffs come out of the clan slice | Gold ledger (09 5.6), read at castle 0 and full |
| **Arenas** (even and gear) | The side seam is BUILT. Gear arena rewards are gear inside the gear slice. No arena buff is outside the clan slice. V10 (the mirrored fight) runs before either arena ships | V10 |
| **Very Rare pieces with two Traits** | `conditionalStepsMax` 20 is already the cap for every conditional step on a hero, so a second Trait adds no headroom. `traitSlots` and `veryRareBanned` are BUILT as data | GS-5, V10 |
| **Alchemy (draughts) and the camp pot** | The consumable slice is 6 steps whether draughts exist or not. In v0.3.0, imbuements alone can fill it. Draughts later become a choice inside the same cap, not more on top | Slice clamp test (L1) |
| **Crafted jewelry and cloaks rolling Traits** | They roll inside the gear slice, from the same pools | GS tests |
| **Tool wear and Crown tools** | v0.3.0's Smithing demand is measured without tools. The spare labor sells to the store floor, a small faucet (09 5.5, under 3%) | Labor ratio |
| **Masteries, salvage, Weighhouse orders** | Trade Levels are already on the company (R12). Masteries add no steps | None needed |
| **Ratio defenses, the wider move list, jobs** | v0.3.0 keeps today's hit math. A later ratio change must hold every ground's held depth (C-2) on a parity run before it ships | V1 parity cell |
| **The four staged grounds** | Bands, gear Levels and Trait pools are written in R10 now. Their Traits and Signatures are already sized inside the slices | Band reader (C-10, C-11) |
| **Factions** (the First Flame and the Last Ember, `25-factions.md`) | 0 power steps: ledger row 17, no slice. Standing pays only on Morrow Hills grounds, which are staged, so nothing shows in v0.3.0. The `factions` switch stays off and `2027-05-27-arm-factions.sql` stays held. Join, standing and the quartermaster ship with the Morrow Hills. The side channel and the week on the Hills ship with ladders and chat. Their two gold lines are under 1% of minted coin, read on and off | Sink reader, on and off. FG guard |
| **World boss, halls as bar checks, ladders, events** | Rewards are gear inside the gear slice and buffs inside the clan slice. Ledger row 16: a new source takes a slice or is refused | Ledger |
| **The support (the wraps, the Hearth)** | Its auras and debuffs sit on stacking keys and count at their party sum inside the slices (`22-fists-support.md` 4.2), so it arrives with no rebalance. Recommended for v0.3.0 after E3 as R-X3. It slips to v0.3.1 without holding the release | V12 (22 run F7) |
| **Build preview and theorycrafting tools** | Display only. They don't move numbers | None |
| **Premium, Crowns, the $15 box** | Tyler's. The 12 h day is BUILT behind the Premium flag. The Roads' reset price and saved build slots have a Premium hook set to zero. No step comes from Premium | 04 section 12, read in days |

---

## 3. The first three hours on the new systems

### 3.1 What appears when

| Moment | Level (Path estimate) | What appears | What it replaces |
|---|---|---|---|
| Account made | 1 | One hero, a style card, the whole practice set worn | Unchanged (D-1) |
| First hunt | 1 | Mill Cellar. HUD: "Depth 1 of 20". Steady, not shown as a pick | The tier row on the Cellar |
| First Level | 2 | A Roads point, spent by "Spend as suggested". Card: "A Roads point. Spent on {move}'s road." [Change] | Nothing (Talents were at 10, and never shipped) |
| Back in town after the Cellar | 4 | End card: bones burned, flame height. Path card: "The Hearth. Your company's luck." Tamsin's gear. **First cook:** "Cook 10 Shrimp" | Today's end card only |
| Level 5 | 5 | **First crossroads** (3 options, suggested one pressed), then "{Name} has outgrown the Mill Cellar. Three recruits are ready." One press | The party finder (removed, R11) |
| First party hunt | 5 to 6 | The Sewer. **The Risk pick** (Careful, Steady, Bold). Steady is pressed. One line under each | The tier picker (Safe, Dangerous, Deadly) |
| First fall back | 5 to 6 | Report: "Fell back: {name} at {pct}% to a {monster}". "Held depth N of 20" | Nothing explained the edge before |
| 10 min into the party hunt | 6 | Rest plan: what the company works when stamina runs out (the trades) | Unchanged row, new trades |
| 15 min into the party hunt | 6 | "Safe to close. Your party hunts about 10 more hours" | Unchanged |
| Hour 2 to 3 | 7 to 9 | Depth climbing on the Sewer. Second crossroads at 9. Wickstead opens at 8 for a lone hero | The "try Dangerous" nudges |
| First return (after the 10 h day) | about 10 | Return card: trades made, flame burned, then **Hunting block** offered (2 a day, priced from the wage) | The 4 h stamina refill (L-1) |
| Later | 30 / 55 | First vow at 30. **First Trait** at Muster Barrows (55, rank I) | Not in the first three hours, by design: the ledger (19) holds early power to Levels and gear |

### 3.2 Walk-through against real data

For each step: what the player holds and can reach from earlier steps only, plus the real starting kit. Grepped on the set today. "NEW" means a lane in section 4 builds it, and the step can't be played until then.

| # | Step | Holds and can reach (steps before only) | Real source | Doable? |
|---|---|---|---|---|
| 1 | Make a hero, pick a style | Nothing yet. Six sets: `tank`, `dual_axes`, `club`, `mage`, `ranger`, `healer` | `start-kit.js STARTER_SETS`, `hr_create_hero p_set` | Yes, BUILT |
| 2 | Land in town with the kit | 500 gold, 8 Turnip Seed, 10 Shrimp, 20 Cooked Shrimp, 50 Bronze Arrows, 10 Coarse Whetstone, the picked set worn | `START_CURRENCY`, `ACCOUNT_KIT`, `HERO_KIT` (grant: 1038 STAGED) | Yes once 1038 applies |
| 3 | Hunt the Mill Cellar on the scale | Step 2's hero. Cellar band [1, 8]: Giant Rat, Slime, Hive Wasp | `hunts.js mill_cellar`. A `DANGER_GROUNDS` row: **NEW (R10)** | After R10 |
| 4 | Eat by itself | 20 Cooked Shrimp on the bar at 60% HP | `START_BAR d_food cooked_shrimp` | Yes |
| 5 | Level 2: a Roads point spent as suggested | Step 1's style decides the road | `17` section 13. `src/data/talents.js`: **NEW (L8, R-x)** | After the Roads lanes |
| 6 | Bones drop | Giant Rat drops `bones` at 0.21. Slime drops `lamp_jelly` (a family fuel). Hive Wasp drops `queens_comb` (named, 0.00078) | `monsters.js` rat, slime, hive_wasp. `hearth.js HEARTH_FUELS`, `NAMED_FUELS` | Yes (drops BUILT) |
| 7 | The flame burns them by the default stoke rule | Step 6's remains | The burn: BUILT. The flame as luck and the default stoke rule: **NEW (F1)** | After F1 |
| 8 | Back in town at about Level 4: end card, Tamsin, first cook | The 10 Shrimp from step 2. Recipe `cook_shrimp` (Shrimp → Cooked Shrimp, Cooking 1) | Path `first_leave`. `recipes.js cook_shrimp`. The first-cook card: **NEW (H1)** | After H1. The recipe exists |
| 9 | Level 5: first crossroads | 4 points from steps 5 and later. The first crossroads sits next to rank 3 | `17` section 13 (Level 5, point 4) | After the Roads lanes |
| 10 | "Outgrown the Mill Cellar", one press for 3 recruits | Hero at Level 5. Recruits at Level 5 (`levelsUnder` 0), jobs from `tank`, `healer`, `ranger`, `club` that the first hero doesn't play. Their Roads points are spent as suggested for their job | `recruits.js RECRUITS` (live, atLevel 5). Path `first_level_5`. 1053 STAGED. Recruits' points: **NEW (H1)** | Yes for the press. Points after H1 |
| 11 | Pick the Sewer, see the Risk pick | Four heroes at Level 5. Sewer band [5, 25]: Drain Rat, Culvert Bat, Sump Slime, Kobold Tosher, Cistern Spider | `hunts.js millrace_sewer`. `text/hunts.js stance_careful/steady/bold`. The R1 picker is BUILT on Muster. The Sewer on the scale: **NEW (R10)** | After R10 |
| 12 | Each monster plays a role | Step 11's monsters | `monster-roles.js` (BUILT, sample only). Sewer rows: **NEW (C2)** | After C2 |
| 13 | Personal loot | Each hero rolls its own drops | **NEW (P1)** | After P1 |
| 14 | First fall back, explained | Report `falls[]` with hero, pct, monster | 1057 STAGED, R5 cause line BUILT | Yes once applied |
| 15 | Rest plan set (10 min in) | The company's trades from R12. Shrimp and Turnip Seed from step 2 | Path `rest_plan` (`event party_hunt_10min`). `1059-company-trades` STAGED. The flag `FB6_REST` (`src/data/company.js`) **is missing**: the row is off today | **Blocked until H1 adds the flag export** |
| 16 | "Safe to close" (15 min in) | A running hunt | Path `safe_to_close` (always on) | Yes |
| 17 | Hours 2 to 3: depth climbs, crossroads II at 9, Wickstead at 8 | Step 11's party. Wickstead band [8, 18] | `hunts.js wickstead`. Path `wickstead` | After R10 |
| 18 | First return: trades made, Hunting block offered | Stamina out after 10 h (`STAMINA_MAX_MS.free`). Blocks: 120 min, 2 a day | `hunt-sessions.js`, `time-blocks.js RULED`. `text/summary.js buy_refill` ("Next buy: Hunting block ({price})"). 1058 STAGED | Yes once applied |
| 19 | When a ground tops out | Held depth 20 for an hour | `text/away.js needs_outgrown` / `needs_outgrown_go`. The trigger: **NEW (R10)** | After R10 |

**What the walk-through found:**
- Step 15 is off today. The Path's rest-plan row reads `src/data/company.js COMPANY_RULES.restPlan`, and that file doesn't exist. H1 adds it.
- Talents in the Path point at a `talents.js` that doesn't exist. The Roads lanes add it, and H1 moves "Level 10. Talents" to "Level 2. A Roads point".
- The Path's `harder_tiers` and `first_harder_tier` rows read `tier-risk.js`, which doesn't exist. They're off today and H1 deletes them.
- No step needs a Trait, a Signature, the market or a party finder. A new player meets everything above in the first three hours using the starting kit.
- **Level estimates are the Path's `expectLevel`s, not measured on the new curve.** H1 measures them on `node tools/qa/local-world.mjs` with a fresh account and a time skip.

### 3.3 Decisions a player makes once, and never again

| Decision | Made once, where | Remembered by |
|---|---|---|
| Spending Roads points | Default "Spend as suggested" | The standing rule. Recruits get it too |
| A crossroads | The card at that Level | The plan. A second hero can copy the build |
| Risk | The Hunts card for the first party ground | The plan, for every ground |
| Burn or keep remains | The default stoke rule | The plan |
| What the company works | The rest plan | The plan |
| Buying a Hunting block | Offered on the return card | A standing "buy up to N" rule in the plan (B1) |

---

## 4. Every lane left, in order

Sizes: S = under a day, M = 1 to 2 days, L = 3 to 5 days, XL = over a week of lane time. **At most 6 to 7 lanes at once** (build mode, Tyler 2026-11-22). Lanes in one band run in parallel. A lane starts once the lanes it depends on are merged.

### Band 1: now, in parallel

| # | Lane | Owner | Depends on | Size | Done when |
|---|---|---|---|---|---|
| L1 | Ramp and slices: `src/data/power-ledger.js` (`rampLevel` 200, build 14, consumable 6, Temper 5, **clan 4, zero**), `ramp()` and `sliceCap()` in core, the engine clamps each slice | Systems | Nothing | M | A hero at Levels 10, 30, 60, 200 reads 19's caps |
| L2 | DROPPED (Tyler 2026-11-22: "Gear scaling with level seems wrong right? I don't want to punish people who are theory crafting or getting lucky with drops"). `wearAhead` stays 10 at every Level | | | | |
| E1 | Bar metrics and near fall-back (19 L4, L5): `target_hp_pct`, `target_marked`, `target_bleed_stacks`, `last_cast`, `hp_near_fall` | Systems | Nothing | M | Each metric tested on all three stances |
| E2 | Statuses as data rows: **Poison**, hero deals more for N s, hero takes less for N s, monster deals less, heals over time, can't cast | Systems | Nothing | M | Each status ticks or applies on the dummy, viewed and closed |
| L10 | Gold follows depth: why +50 held steps moved gold by −4 ± 64 | Systems | Nothing | M | V13 passes, or the cause is written and fixed |
| R10 | **Every open ground on the scale, and the tier path removed:** bands (floor, middle, top) for all open grounds plus the four staged ones, `gearLevel`, Rare odds by depth, the next ground's floor just under this one's top, `needs_outgrown` trigger, first hunt starts at the floor. Bramble Edge, Goblin Warren and Ridge Camp kept or cut. Delete `hunt-tiers` reads, the tier picker and the tier text | Designer (data) + Systems + Backend | L10 for the coin column | XL | C-10 and C-11 read on 3 grounds. No tier row anywhere. A fresh Level 1 hero sees "Depth 1 of 20" in the Cellar |
| LAB | The Lab, continuously: V2, V4 (the heal rule), V13 now. V5, V7, V9 with the Roads sample. V6, V8, V10, V11 after R10 | Matrix | Each run's tool | M, standing | Each V reads pass or names its fix |
| A1 | **Art: rare and unique icons.** A standout frame for Rare and Signature pieces, then 24 Signature icons (sample 5 first: the 1.3 sample), then Trait-piece looks | Art Director + Asset Director | Nothing | L | The sample of 5 is read on the inventory screen before the rest are made |

### Band 2: after Band 1 merges

| # | Lane | Owner | Depends on | Size | Done when |
|---|---|---|---|---|---|
| E3 | Shields (one per hero, the bigger one replaces), auras (party scope, counted once), and the pair check stub | Systems | E2 | M | Two auras in a party count once. Shield replace rule tested |
| E4 | Triggers: cooldown reset or cut from another move, mana back on kill, hit or heal, a free cast that can't chain, a heal on a shield break | Systems | E1, E2 | M | "A free cast can't set off another" tested |
| C2 | Roles on every monster on open grounds, plus a Caster body and a Warder body | Designer | R10 | L | V3 on three role mixes |
| P1 | **Personal loot:** each hero rolls its own drops from the kills it took part in, drop rates set per hero, loot write per seat | Backend + Systems | R10 | L | A viewed and a closed four store the same loot per seat |
| W1 | Wage remainder: store priced at the buyer's step, uses under 1 gold (an accumulator), an equal charge bill per style (the hammer's charge row) | Systems + Backend | Nothing (wage BUILT) | M | Kit is 0.2 to 0.3 of pay for every style |
| B1 | Bought work blocks (`SOLD_KINDS` adds `work`, 4 a day) and a standing "buy up to N" rule in the plan | Backend | W1 | M | A hero buys 4 work blocks and a 5th is refused. The plan rule buys without a press |
| R-S | **The Roads sample:** `src/data/talents.js` with the Hearth, Shield, Restoration and Shield · Restoration; server spend, vow (never taken by the standing rule), reset priced in wage hours, a free reset on new content; "Spend as suggested" as a standing rule | Designer + Backend | L1, E1 | L | 17's Shield walk-through plays on the dummy. V5 and V7 pass |

### Band 3: gear and the flame

| # | Lane | Owner | Depends on | Size | Done when |
|---|---|---|---|---|---|
| T1 | **Traits drop:** the server roll inside the settle, a Trait piece as one row (base, Trait, rank, the kill that made it), rank by depth capped by the ground's entry Level, the engine reads Traits inside the gear slice, a return card line and the drop moment | Backend + Systems | L1, E1, P1, R10 | XL | A Muster hunt rolls rank I only. Viewed and closed roll the same. GS tests pass |
| F1 | **Inner Flame as luck:** the flame row on the account, height burns down in the settle, the drop roll reads it, the default stoke rule, the room curve, the flame on the return card | Backend + Systems + Designer (room curve) | T1 | L | Unfed drops stay at base rates. A full flame stays inside `kitSpreadMax` (V10) |
| K1 | **Kit trades:** recipes on hours of work for Cooking, Smithing, Woodcrafting, Runecutting and gathering, banded by step. Store basics a tier behind at 1.5×. Sample of 5 recipes first, then batches of 20 or fewer | Designer + Backend | W1, R12 (BUILT) | L | Labor ratio read at 10, 12 and 14 h days. The store kit stays the floor |
| TP | Temper on steps: ranks 1 to 5, a gear step a rank, slot-weighted, rank r opens at Level 40r (`21` D-2, never × ramp), priced in `temperHours`, needs a Smithing Temper kit. Carries up | Designer + Backend | L1, K1 | M | Temper cap 5 holds on a full kit. The old rungs are gone |
| CO | Carry-over (Artificing): one Trait moved to a new base of the same slot and the same or a higher tier, the old piece destroyed, priced in wage hours at depth | Backend | T1, K1 | M | Carry onto a lower tier is refused. Journalled |
| IM | Imbuements on steps (Artificing): 2 steps each, 3 a hero, 20 hunted hours, made from the imbuement parts monsters drop | Designer + Backend | L1, K1 | M | Consumable slice 6 clamps |
| SN | Sinks priced in wage hours: Talent resets, Blessings and the death cost at a Level step | Designer | W1 | S | Read on the gold ledger: sinks 85 to 90% of minted coin with no castle |

### Band 4: the Roads, whole

| # | Lane | Owner | Depends on | Size | Done when |
|---|---|---|---|---|---|
| E5 | Borrowing (19 L6): off-weapon rows from the server's borrow list, borrowed heals on Mend's clock, Magic at Mend's rate | Systems + Backend | V4 pass, R-S | L | Borrowed Greater Mend is 10 steps or less |
| R-X1 | Roads: Sword, Club, Dual Axe countries plus their borders | Designer | R-S, C2 | L | Library test (V6) on 3 role mixes |
| R-X2 | Roads: Ranged and Destruction countries plus the remaining borders (9 in total) | Designer | R-X1 | L | V6 on every country. No build tops more than 25% of cells |
| R-UI | The Roads screen: Country, Road and Node zoom with fixed labels, open on where you are, route preview with a cost badge, four node states, phone sheet, Restoration at about 2.5× the space | Systems (client) + Art Director | R-S | L | Desktop and 922×423 shots read by the art director |
| A2 | Art: the Roads map (countries, trunks, stones, towns, vows as standing stones) | Art Director | R-UI layout | L | Sample read before the full map |
| RP | Report readers (19 L7): healing by source, damage taken by seat, supplies by depth | Systems | E2 | M | Two different builds read differently |

### Band 5: Signatures and the first hour

| # | Lane | Owner | Depends on | Size | Done when |
|---|---|---|---|---|---|
| S1 | Signatures sample: 1, 5, 6, 17, 36, with their drop homes and the reveal | Designer + Systems | E2, E3, E4, T1, A1 sample | M | Played and read. Each inside 10 steps on its best cell |
| S2 | The other 19 Signatures from 1.3 | Designer + Systems | S1 read | L | V10 lucky against unlucky kit within 20 steps |
| H1 | **The first-hour rewrite:** Path rows re-cut (Roads point at 2, first crossroads at 5, the Hearth card, first cook, Risk at the Sewer, tier rows deleted), `src/data/company.js` flag export, recruits arrive with points spent as suggested, coach and What next text in Tyler's voice, Level estimates measured on `local-world` | Designer + Systems | R10, R-S, F1, K1 | L | Section 3.2 plays end to end on a fresh account |
| SH | Plan copying between players: a share code for a plan and a build | Systems | R-S | S | A code pasted on a second account rebuilds the plan |
| WN | In-game "What's new": one card on first sign-in to v0.3.0, plus a "you start fresh" line for returning players | Designer (text) + Systems | H1 | S | Shown once an account |

### Band 6: release

| # | Lane | Owner | Depends on | Size | Done when |
|---|---|---|---|---|---|
| RO | Release order: `release-plan --strict` over the whole chain, superseded staged files retired with `chain-retire`, edge points named | QA | Every lane with a migration | M | `--strict` exit 0 |
| SL | Security list current: every new drop, loot, flame, Temper, carry-over, block and reset surface written into `13-security-list.md` | QA | RO | S | Every flagged sidecar has a row |
| WP | The wipe: old heroes don't carry (no conversion). Run through the chain's char-wipe path | Backend + Coordinator | RO | S | `char-wipe` test green. A returning account lands on hero creation |
| RD | Restore drill on a copy of production with the full chain | Reliability | RO | M | Restore, re-apply, hash match |
| LT | Load test: synthetic 1,000 accounts × 4 heroes on the settle, with personal loot, Traits and the flame | Reliability | T1, F1, P1 | M | Settle lag stays under 32 s. `per-player-cost` inside its budget |
| BP | Blind playthrough: a fresh account through the first three hours, learning only from the screen, plus a Level 1 to 20 pass and a time skip to Muster | QA | H1, every band 5 lane | M | Every quit point and dead moment logged, then fixed |
| VG | Visual gate on the assembled set: Hunts, HUD, report, return card, Roads, inventory, recruit screens | Art Director | BP | M | Shots read, desktop first |
| PN | Patch notes: CHANGELOG entry, Discord note (2,000 characters), WN text final | Designer + Coordinator | VG | S | Dry run of `post-changelog` clean |

**Not lanes, but owed to every lane:** CLAUDE.md section 10 samples (5 first, then batches of 20 or fewer), each lane's own tests, and the Lab run named in its "Done when".

---

## 5. The release gate

v0.3.0 ships when every line below is true.

| # | Gate | Read by |
|---|---|---|
| 1 | Every lane in section 4 merged on the set, or moved to v0.3.x by the designer with its reservation written | This file, updated |
| 2 | GitHub green on `release/v0.3.0`, with no known red. T-02 and T-03 re-aimed or retired with proof | GitHub run |
| 3 | No tier row or tier picker left. Every open ground is on the scale with a band | `grep`, R10 tests |
| 4 | C-1 to C-5 measured on 3 or more grounds. C-6, C-7, C-10, C-11 and C-13 read in range | Lab V1, V2, V6, V8 |
| 5 | The ledger holds: choice ceiling within 14 steps, luck ceiling within 20, everything at once with the clan slice under 60 | Lab V6, V10 |
| 6 | No Trait and no Signature on top in more than 25% of cells. Every Roads build top 3 somewhere | Lab V6, V7 |
| 7 | Gold ledger: sinks burn 85 to 90% of minted coin with no castle. Kit is 0.2 to 0.3 of pay for every style | Economy reader, V9 |
| 8 | Section 3.2 plays on a fresh account, end to end, with no step blocked | BP |
| 9 | The blind playthrough's dead moments fixed or ruled acceptable by the designer | BP log |
| 10 | Release order exit 0. The restore drill passed on this chain. The load test is inside budget | RO, RD, LT |
| 11 | Every new money, drop and loot surface listed for the pre-EA Security review. **No Security GO is needed for v0.3.0** (CLAUDE.md section 2, until EA) | SL |
| 12 | Every Rare and Signature in v0.3.0 has a standout icon or the Rare frame. No placeholder emoji on a Signature | A1, VG |
| 13 | The visual gate is passed on the assembled set | VG |
| 14 | Patch notes and What's new ready. The wipe runs before players sign in | PN, WN, WP |
| 15 | The Coordinator plays the release on live before telling Tyler it's ready | Play gate |

**Known risks:**
- R10 is the widest lane and blocks most of the others, so it gets started first.
- T1 is the largest new server surface.
- V4 (the heal rule) decides whether borrowing heals ships at all. If it fails, Greater Mend stays unborrowable in v0.3.0, which is the ledger's own fallback.
