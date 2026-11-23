# 17. Talents as a map: the Roads

An alternative to the move-ranks design (`02-architecture.md` 1b, `16-talent-branches.md`) for Tyler to compare. Only mechanics are taken from the genre's big talent trees. No names, layout, look or text are taken from any game. Every number is a starting value for the Balance Lab, not a measured one.

**The headline goal is build variety** (Tyler, 2026-11-22: "having a lot of options for unique builds is what will keep people hooked", and "Theory crafting is fun"). Many real paths for each weapon, real hybrids, and no single best build.

Sketch: `17-talent-tree-sketch.html` (desktop window and phone sheet, Charcoal & Gold tokens).

---

## 1. The name and the shape

**The window is called Talents.** That's the genre word and it stays. What it shows is **the Roads**: a map of the country around Havora, with the Great Hearth in the middle of town and roads leading out of it.

- **The Great Hearth is the start.** Every hero starts there, whatever they wield. It's the one node you own for free.
- **Seven countries, one per weapon:** Shield, Sword, Dual Axe, Club, Ranged, Destruction and Restoration (the seven `DISCIPLINES` in `src/data/abilities.js`). They're uneven map regions with dashed borders, not slices of a circle. Big ways (Restoration, with six moves) cover more ground than small ones (Club and Dual Axe, with one move each today).
- **Neighbors share a border road.** Melee ways sit together in the west, magic in the east, Ranged across the north, and Restoration in the south next to Shield. Moves that several weapons use sit near the borders they share, so Power Strike lies where Shield, Sword and Club meet.
- **Three kinds of node, named for things on a road:**
  - **Milestone** (small square stone): one small stat. The roads are made of them.
  - **Crossroads** (diamond): the road forks and you pick one option. These are the branches from `16-talent-branches.md`.
  - **Vow** (red standing stone): a rule that changes how you play, and asks something back.
- **Open road** (three dots): past a move's last crossroads the road keeps going. Each point there is one more rank of that move, forever.

Why roads: Hearthrise is a game of towns and roads (Havora, the Ox Road, Carter's Rest, the hearth everyone comes home to). A gold road map on charcoal, with a lit hearth in the middle, reads as ours from a screenshot. It isn't a starfield or a circle cut into parts.

## 2. How it plays

- **You get 1 point every Level,** starting at Level 2. Spend it on any node that touches a node you own.
- **Walking a move's road ranks it up.** The first four milestones on Challenge's road are Challenge ranks 1 to 4. Then the road forks, and you pick Wide, Hard or Guarding Challenge.
- **Go where you like.** Most heroes stay in their weapon's country, but nothing stops a healer from taking the border road into Shield country for armor and a Shield vow.
- **Vows change the rules.** Each has a cost. You can hold 1 vow at Level 30, 2 at Level 80 and 3 at Level 200.
- **Level 200 is a big deal.** It opens your third vow slot and one final form, a third crossroads at the end of one move's road (that's the 1b final form).
- **The rest is from 1b, unchanged:** drafts are free, applying a draft costs gold by Level, "Spend as suggested" can stay on, saved builds can be set per ground, and death takes your last spends off first.

## 3. Node counts per region

Each move's road has 4 milestones, crossroads I (pick 1 of 3), 8 milestones, crossroads II (pick 1 of 2), then the open road. Connecting roads cost 3 milestones from Havora, 2 between moves and 3 to each vow.

| Region | Moves | Milestones | Crossroads (options) | Vows | Points to own all |
|---|---|---|---|---|---|
| The Hearth (Mend) | 1 | 12 | 2 (5) | 0 | 14 |
| Shield | 3 | 52 | 6 (15) | 3 | 61 |
| Sword | 3 | 52 | 6 (15) | 3 | 61 |
| Dual Axe | 1 | 21 | 2 (5) | 2 | 25 |
| Club | 1 | 21 | 2 (5) | 2 | 25 |
| Ranged | 4 | 66 | 8 (20) | 3 | 77 |
| Destruction | 4 | 66 | 8 (20) | 3 | 77 |
| Restoration | 6 | 97 | 12 (30) | 4 | 113 |
| Border roads (8 x 2) | | 16 | | | 16 |
| **Total** | **23** | **403** | **46 (115)** | **20** | **469** |

Plus 23 open roads and 23 final forms (a hero takes one final form).

What this means (COMPUTED): the first crossroads comes at Level 9 and the second at about Level 18. A Level 200 hero has 199 points, about 42% of the map. A pure healer owns all of Restoration and Mend by about Level 128, then spends into neighbors. Club and Dual Axe are small until Brand, Reave and the fist line go live, so a club or axe hero is a natural Sword hybrid for now. They share Power Strike and Turning Cut, which is honest, not a trap. Past about Level 450 a hero owns every milestone, and three things still make them unique: their crossroads picks, their three vows and their final form. Their open-road spread is a fourth.

**Hybrids follow one rule.** Milestones and most vows work with any weapon. A move's ranks and crossroads only do anything while that move is on your bar, and your bar comes from your weapon. So a hybrid either borrows a shared move (Power Strike, Turning Cut, Flame Strike, Mend), or takes a neighbor's stats and vows, or swaps weapons by ground with one saved build per ground. Vows that only work with one weapon say so ("Requires: staff").

## 4. Two regions laid out

Tooltip voice throughout. Crossroads I text is from `16-talent-branches.md`, unchanged. Crossroads II is new here. In 16, rank 15 depended on the rank 5 pick. On a map that would split every road into six ends, so here the second fork doesn't depend on the first. Challenge's second fork reuses 1b's sample (Answering, Mended).

### Shield

| Road | Node | Tooltip |
|---|---|---|
| Havora to Shield | Milestone x3 | +2% max health / +2% armor / +2% max health |
| **Challenge** (known from Level 1) | Milestone x4 | +1 Challenge rank. Taunts last longer |
| | Crossroads I | **Wide Challenge** (Suggested): Taunts up to 3 nearby enemies, −50% taunt duration · **Hard Challenge**: Taunted enemy deals 15% less damage to you while taunted · **Guarding Challenge**: Casts on its own when an enemy attacks a back-row ally, and taunts that enemy (party only) |
| | Milestone x8 | +1 Challenge rank |
| | Crossroads II | **Answering**: After Challenge, your next block staggers the attacker · **Mended** (Suggested): +10% healing on you while an enemy is taunted by you |
| | Open road | +1 Challenge rank per point |
| To Frost Slam | Milestone x2 | +2% armor / +2% ward |
| **Frost Slam** (learned at Level 12, party only) | Milestone x4 | +1 Frost Slam rank. More damage and a stronger Chill |
| | Crossroads I | **Long Frost** (Suggested): Chill lasts 6 s (from 4 s), +2 s cooldown · **Pinning Frost**: Hits your target only, +50% chill · **Slowing Frost**: Chill slows spell wind-ups 2x as much and attacks 50% less |
| | Milestone x8 | +1 Frost Slam rank |
| | Crossroads II | **Cold Ground** (Suggested): Leaves frozen ground for 4 s. Enemies on it are Chilled · **Quick Slam**: −3 s cooldown, −20% damage |
| | Open road | +1 Frost Slam rank per point |
| To Shelter | Milestone x2 | +2% max health / +2% ward |
| **Shelter** (learned at Level 20, party only) | Milestone x4 | +1 Shelter rank. Bigger shields |
| | Crossroads I | **Steady Shelter** (Suggested): −40% shield, −15 s cooldown · **Deep Shelter**: Shields only the 2 lowest-health allies, +80% shield · **Stone Wall**: +100% shield on you, −30% shield on allies |
| | Milestone x8 | +1 Shelter rank |
| | Crossroads II | **Ready Shelter**: Casts on its own when an ally drops below 30% health, +10 s cooldown · **Long Shelter** (Suggested): Shields last 4 s longer |
| | Open road | +1 Shelter rank per point |
| To Hold Fast (after Challenge's first fork) | Milestone x3 | +2% max health / +2% max health / +2% armor |
| | **Vow: Hold Fast** | Requires Level 30. Enemies attacking you can't switch targets. You deal 25% less damage. Best for: keeping a pack off your back row |
| To Bodyguard (from Shelter) | Milestone x3 | +2% armor / +2% ward / +2% max health |
| | **Vow: Bodyguard** | Requires Level 30. 30% of the damage dealt to allies within 2 tiles is dealt to you instead. You can't be healed above 80% health. Best for: parties whose damage dealers can't take a hit |
| To Cold Iron (from Frost Slam) | Milestone x3 | +2% ward / +2% armor / +2% ward |
| | **Vow: Cold Iron** | Requires Level 30. Enemies that hit you are Chilled for 2 s. You deal 15% less damage. Best for: packs that stay on you, melee-heavy grounds |

Shield borders Sword (Flame Strike and Power Strike lie just over it), Club, and Restoration.

### Restoration

| Road | Node | Tooltip |
|---|---|---|
| Havora to Restoration | Milestone x3 | +2% max mana / +2% healing done / +2% mana regeneration |
| **Greater Mend** | Milestone x4 | +1 Greater Mend rank. Heals more |
| | Crossroads I | **Quick Mending**: −50% healing, 1 s cooldown · **Deep Mending**: Only casts on allies below 40% health, +60% healing · **Split Mending** (Suggested): 30% of the heal also lands on the next lowest-health ally |
| | Milestone x8 | +1 Greater Mend rank |
| | Crossroads II | **Thrifty Mending** (Suggested): Returns 50% of the mana if the target was below 25% health · **Lingering Mending**: 25% of the heal lands again over 4 s |
| | Open road | +1 Greater Mend rank per point |
| **Circle of Renewal** (2 milestones in) | Milestone x2, then x4 | +2% healing done / +2% max mana, then +1 Circle of Renewal rank |
| | Crossroads I | **Lasting Circle** (Suggested): Heals over 6 s instead of at once, +30% healing · **Tight Circle**: Only allies within 3 tiles, +40% healing · **Light Circle**: −40% mana, −25% healing |
| | Milestone x8 | +1 Circle of Renewal rank |
| | Crossroads II | **Wide Circle**: +3 tiles reach, −15% healing · **Mana Circle** (Suggested): Also restores 2% mana to each ally healed |
| **Spring Tide** (learned at Level 20) | Milestone x2, then x4 | +2% mana regeneration / +2% max health, then +1 Spring Tide rank |
| | Crossroads I | **Ebb Tide**: −50% healing, −50% cooldown, −50% mana · **High Tide** (Suggested): Healing past full health stays as a shield · **Turning Tide**: +50% healing on allies below 30% health, −25% on the rest |
| | Milestone x8 | +1 Spring Tide rank |
| | Crossroads II | **Rising Tide** (Suggested): −15 s cooldown · **Clearing Tide**: Removes 1 harmful effect from each ally healed |
| **Green Sickness** | Milestone x2, then x4 | +2% ward / +2% max mana, then +1 Green Sickness rank |
| | Crossroads I | **Lingering Sickness** (Suggested): Sickness lasts 10 s (from 6 s), −30% damage · **Single Dose**: Hits the target only, Sickness 20% (from 10%) · **Draining Sickness**: Heals the lowest-health ally for 20% of damage dealt |
| | Milestone x8 | +1 Green Sickness rank |
| | Crossroads II | **Weakening Sickness** (Suggested): Sick enemies deal 10% less damage · **Wide Sickness**: Also hits enemies next to the target, −20% damage |
| **Protective Ward** | Milestone x2, then x4 | +2% healing done / +2% ward, then +1 Protective Ward rank |
| | Crossroads I | **Tank Ward** (Suggested): +40% shield, only on the ally with the most enemies on them · **Twin Ward**: Shields 2 allies, −40% shield each · **Lasting Ward**: Unused shield returns as mana when recast, −20% shield |
| | Milestone x8 | +1 Protective Ward rank |
| | Crossroads II | **Quick Ward** (Suggested): −30% cooldown, −20% shield · **Mending Ward**: +10% healing received while the ward holds |
| **Undertow** (solo only) | Milestone x2, then x4 | +2% max health / +2% mana regeneration, then +1 Undertow rank |
| | Crossroads I | **Heavy Undertow** (Suggested): Target deals 20% less damage for 4 s, −20% damage · **Riptide**: Also hits enemies next to the target, −40% damage · **Drowning Pull**: 30% of damage dealt heals you, −20% damage |
| | Milestone x8 | +1 Undertow rank |
| | Crossroads II | **Cold Undertow**: Applies Chill for 2 s · **Deep Pull** (Suggested): +30% damage vs enemies below 50% health |
| (each move above) | Open road | +1 rank of that move per point |
| To Watchful Healing (from Greater Mend) | Milestone x3 | +2% healing done x2 / +2% max mana |
| | **Vow: Watchful Healing** | Requires Level 30. Requires: staff. Heals cast while an enemy winds up heal 40% more. Heals cast at any other time heal 15% less. Best for: grounds full of casters and big wind-ups |
| To Still Mind (from Protective Ward) | Milestone x3 | +2% mana regeneration x2 / +2% max mana |
| | **Vow: Still Mind** | Requires Level 30. If you haven't cast for 3 s, +100% mana regeneration. Your spells cost 30% more mana. Best for: long hunts with quiet gaps between pulls |
| To Fast Renewal (from Circle of Renewal) | Milestone x3 | +2% healing done / +2% max mana / +2% healing done |
| | **Vow: Fast Renewal** | Requires Level 30. Requires: staff. Your heals over time tick twice as fast. Your instant heals cost 40% more mana. Best for: steady area damage |
| To Battle Healer (from Green Sickness) | Milestone x3 | +2% max health / +2% ward / +2% max mana |
| | **Vow: Battle Healer** | Requires Level 30. Requires: staff. Undertow works in a party. Undertow and Green Sickness deal 30% more damage. Your heals cost 25% more mana. Best for: parties that need more damage than healing |

Restoration borders Shield (the road to Bodyguard and Shelter) and Destruction (the road to Arcane Barrier).

**Crossroads II checked against `15-signature-candidates.md`.** Three first ideas repeated a Signature and were replaced: a damage cut on a Greater Mend target (#17 Bargeman's Pole), Sickness jumping on death (#28 Vault Leech Ring), and a ward that hits back (#21 Drover's Hat). Also cut: "less damage from chilled enemies" on Frost Slam, which is Trait #25 Numbed.

## 5. Six more vows, from other regions

Each region gets 2 to 4 vows, 20 in all. These six are examples. The other seven get written after the Shield and Restoration sample has been played.

| Vow | Region | Tooltip | Cost | Best on | Weak on |
|---|---|---|---|---|---|
| **Single Combat** | Sword | Your single-target attacks deal 20% more damage | Attacks that hit more than one enemy deal 40% less | Bosses, Brutes | Swarms |
| **Open Wounds** | Dual Axe | Requires: axes. Bleed can stack to 10 | Each Bleed stack deals 40% less damage | Long fights, bosses | Fast pulls where Bleed never builds up |
| **Crushing Blows** | Club | Your attacks ignore 30% of armor | Your cooldowns are 25% longer | High-armor Brutes | Swarms, low-armor enemies |
| **Long Range** | Ranged | Requires: bow or crossbow. You attack from 2 tiles farther back | Enemies that reach you deal 25% more damage to you | Parties with a tank, Shooters | Solo vs Stalkers |
| **Marked Prey** | Ranged | Requires: bow or crossbow. Hunter's Mark lasts until the target dies | You deal 30% less damage to unmarked enemies | Bosses, one big target at a time | Packs |
| **Cold Focus** | Destruction | Requires: wand. Your frost spells deal 20% more damage and Chill lasts 2 s longer | You can't cast fire spells | Caster grounds, protecting a party | Fire-weak grounds, big packs (no Fireball) |

**Stacking.** Vows follow the stacking keys in `15-signature-candidates.md`. Open Wounds sets the Bleed cap to 10, and Signature #29 doesn't add to it. Cold Focus's Chill is the one Chill key, so it restarts the Chill and doesn't add a second one. No vow repeats a branch, a Trait or a Signature (checked against 14, 15 and 16 on 2026-11-22).

## 6. Builds: the map, Traits and Signatures together

A build is four layers: **the map** (crossroads, vows, final form), **Traits** (up to one gear tier of them, `14-trait-candidates.md`), **one Signature** (`15-signature-candidates.md`), and **the bar** (which moves, in what order). Each layer reads a different thing: the map changes your moves, Traits pay off when a condition is met, and the Signature links two things. A strong build makes all four point the same way. That's the theorycraft.

How much room there is (COMPUTED): Shield alone has 6 x 6 x 6 = 216 ways to pick its six crossroads before any vow. With 20 vows and 3 slots there are 1,140 sets of vows. Most won't be good. The point is that the good ones aren't all the same.

### Five example builds

| Build | Weapon | Key nodes | Vows | Traits | Signature |
|---|---|---|---|---|---|
| **Bleed Axe** | Axes, Sword border | Rend: Deep Cuts, then +20% damage vs 5+ Bleed stacks. Turning Cut: Bleeding Turn | Open Wounds, then Cold Iron at Level 80 | #4 Worrier, #21 Scorched Grip, #30 Lime Pit | #7 Floodwater Hatchets (Rend also poisons, so Lime Pit works) |
| **Frost Lock Mage** | Wand | Hoarfrost: Deep Hoarfrost. Frost Lance: Shatter. Arcane Barrier: Thick Barrier | Cold Focus, then Still Mind (Restoration border) | #5 Snuffed, #18 Floodmark, #16 Full Wick | #15 Catacomb Shroud (chilled enemies can't start a spell) |
| **Shield-Heal** | Staff, Shield border | Greater Mend: Split Mending. Protective Ward: Twin Ward. Border road to Shield for armor and health | Bodyguard, then Still Mind | #23 Behind the Bar, #29 Crag Shelter, #6 Last File | #36 Cairn Belt |
| **Mark Sniper** | Bow | Hunter's Mark: Long Mark. Precision Shot: Aimed Shot | Long Range, then Marked Prey | #22 Slate Hand, #34 Lookout's Promise, #2 Soft Scale | #9 Lurcher's Collar (the mark moves on when the target dies) |
| **Armor Breaker** | Club, Sword border | Quarry Blow: Breaking Blow. Power Strike: Heavy Strike | Crushing Blows, then Single Combat | #3 Ram's Head, #37 Hask's Bargain, #27 Captain's Due | #8 Stable Troll's Maul |

There's a second way to build Shield-Heal: a sword-and-shield tank who walks the Mend road (Shared Mend) and takes Bodyguard and Hold Fast, wearing #3 Grave Guard's Mail. Same idea, different weapon, different grounds.

### Each build is best somewhere and on none of them all

| Build | Swarms | Brutes | Casters, Shooters | Bosses | Solo | Party of 4 | Bold stance |
|---|---|---|---|---|---|---|---|
| Bleed Axe | Weak | Good | OK | **Best** | Good | OK | OK |
| Frost Lock Mage | Weak | OK | **Best** | Good | OK | Good | Good |
| Shield-Heal | OK | Good | OK | OK | **Best** (duo, no tank) | Weak (overlaps a real tank) | OK |
| Mark Sniper | Weak | OK | Good | **Best** | Weak | Good | OK |
| Armor Breaker | Weak | **Best** | Weak | Good | OK | OK | Good |

These marks are design intent (JUDGMENT), not measurements. The Lab check that holds them is in section 7. No build here is good on Swarms on purpose. A sixth sample build for packs (Wide Fireball with File Breaker #1, or Wide Turn with #6 Barrow Knight's Blade) goes in once a pack vow is written.

## 7. The balance rule

One step is one Level of rating (`04-math-strategy.md` section 1). At `payStep` 0.7%, a step held is about 0.7% pace (COMPUTED there). Everything below is sized in those steps.

| Node | Size | Why |
|---|---|---|
| Milestone | `pointShare` of a Level's step, starting at 1/3 step (about 0.23% pace). Every milestone is the same size, rank or stat | It's the 1b point. It puts a hero on the curve, not above it. It can't be felt alone, and that's fine. It's the road, not the reason |
| Crossroads | Costs 1 point and carries a milestone's share. The options are budget-neutral across the ground mix. On any one ground, the best and worst option are at most 3 steps apart (about 2%) | 1b rule 4: options differ by what they're good against, not by size |
| Vow | Costs 1 point and carries no milestone share. Up to +3 to +4 steps where it fits, at least −3 steps where it doesn't. Its mean across the ground mix is between −1 and +1 step | It's a trade, not an upgrade. Slots at Level 30, 80 and 200 keep the count small |
| Final form | Sized like a crossroads | Level 200 should be a big change in how a move plays, not a big number |

- **The ceiling.** With Traits and a Signature worn, the best build the Lab can find beats the suggested path by at most 5 to 10% pace (7 to 14 steps) at the edge of a step on a mix of grounds. That's the 1b ceiling, the 14 Trait cap (one gear tier) and the 15 Signature size, all on one ledger. The suggested path holds its own suggested vows, so the gap is only "chose well" against "chose the default".
- **No single best build.** The Lab keeps a library of named builds (section 6, then more). Its cells are a ground's monster mix x party size x stance. Targets, as a hypothesis: every build in the library is top 3 in at least one cell, and no build is top in more than 25% of cells. A build that fails either one gets rewritten, not buffed.
- **Hybrids aren't traps.** A border milestone is the same size as any milestone, so walking into a neighbor costs no power, only depth in your own moves. The Lab reads at least one hybrid for each border (8 in all) with the same top-3 test.
- **Vows on one key don't pile up.** A vow is a rule row on a stacking key. Two vows on the same key follow that key's rule (the largest counts, or add up to the key's cap).

## 8. Theorycrafting tools

| Tool | What it does | Server work |
|---|---|---|
| **Build planner** | Draft a whole build (map, Traits, Signature, bar) without spending points, even past your Level, and save it as a plan. A plan can be applied later, cut to your points | Yes. Drafting is display only, in the browser. Saving a plan is a server write: the server checks every node id, road link, crossroads pick, vow count and Trait or Signature id against its own catalogue, and caps its size and the number of plans |
| **Share codes** | A short code for a build to copy and paste. Ladder entries get a **Copy build** button | Yes. Codes are made by the server from a build it holds, never by the browser. When a code is pasted, the server decodes and checks it like a saved plan and refuses anything it doesn't recognize. A code holds node ids and picks only. It never holds points, gold or items, and applying it is still a normal reset, cut to your points |
| **Test on the dummy** | Run a drafted build on the house training dummy (`src/data/gold-sinks.js`) and read the analyzer: damage, healing, mana per minute | Yes. The server runs the one combat engine on the draft for a short fight. No XP, gold or loot. Limited runs per hour so it can't run up server cost |
| **Details** | A toggle on tooltips that shows exact numbers and stacking keys. Cards stay short when it's off | No. It reads the same catalogue numbers the tooltip already uses |

## 9. This against the move-ranks design

| | Move ranks and branches (1b, 16) | The Roads (this doc) |
|---|---|---|
| Where the build lives | On the bar. Each move's card shows its rank and branch | On a map screen. The bar card still shows rank and branch, read from the same rows |
| What a point buys | One rank of a move you know | A rank, a small stat, a crossroads or a vow, next to what you own |
| Build-defining choices | Branch picks only | Crossroads picks plus up to 3 vows |
| Hybrids | A second weapon's moves, if you train them | Border roads, shared moves, and vows that work with any weapon |
| Long chase | Ranks with no top. Level 200 final form | The map fills up. Vow slots at 30, 80 and 200. Final form at 200. Open roads past that |
| What you see | A list of move cards | A map that fills with gold as you level |
| New player | Easy. "Raise this move" | Harder. Mitigated by "Spend as suggested" and a gold suggested road |
| Phone | One card, fits easily | Pan and zoom map plus a side card. Fits (see the sketch), but takes more work to read |
| Writing cost | About 8 branch rows a move | The same branch rows, plus 20 vows and the map layout |
| Engine and server cost | Rank and branch rows | The same rows, plus road links, vow slots and a map catalogue the server checks |
| Risk of one best path | Low. Branches are sidegrades | Higher, because vows are strong. Held by the vow budget and the Lab's top-3 test |
| Looks like ours | No screen of its own | A road map out of Havora |

## 10. Recommendation

**Build the Roads, with three conditions.**

1. **One set of data, two views.** The map is the move ranks and branches from 1b, laid out as roads, plus stat milestones and vows. The bar card keeps showing rank and branch. That answers 1b's reason for rejecting a separate tree ("a second place for a build to live"), because there's still one build. The map is just how you shape it.
2. **Sample first.** Shield, Restoration and the Hearth (Mend), played on a phone at 922 x 423 with "Spend as suggested" on and off, before the other five regions are laid out (`DESIGN_STANDARDS.md` section 9).
3. **Vows are the point.** The milestones are the measured 2% that can't be felt, so the fun lives in the crossroads and vows. If the sample shows vows that are always right or never worth it, fix the vows before adding milestones.

Why the Roads beat move ranks for this goal: move ranks give a choice every few Levels, but only one kind of choice. The Roads add rule-changing vows, real hybrids and a picture of your build that grows. That's what makes theorycrafting fun and gives people builds to share. Move ranks stay the fallback if the phone sample can't be read.

## 11. Repeated decisions (the first principle)

| Where a player could repeat a choice | How it's removed |
|---|---|
| Spending a point every Level | "Spend as suggested", or a saved plan's order, as a standing rule |
| The same build on a second hero | Copy build from another hero or a ladder entry, or a share code |
| Changing builds for a hall | A saved build per ground in the company plan, applied at the Start |
| A death takes a Level | The last spend comes off, and the standing rule puts it back on the next Level |
| New regions add roads | The standing rule follows the suggested road into them |

## 12. Walk-through: a new Shield hero on the suggested road

Wielding a sword and shield, with "Spend as suggested" on. Move unlock Levels are from `src/data/abilities.js` (Challenge has no unlock, Frost Slam unlocks at 12, Shelter at 20). Every node is one in section 4.

| Level | Point | Owned before this step | Spends on | Doable because |
|---|---|---|---|---|
| 1 | none | The Great Hearth | nothing | 1 point per Level gained |
| 2 to 4 | 1 to 3 | Hearth | Havora to Shield milestones (+2% max health, +2% armor, +2% max health) | Each touches the last |
| 5 to 8 | 4 to 7 | Entry road | Challenge ranks 1 to 4 | Challenge is known from Level 1 |
| 9 | 8 | Challenge rank 4 | Challenge crossroads I: Wide Challenge | Next to rank 4. Guarding is party only, so the suggestion skips it |
| 10 to 17 | 9 to 16 | Crossroads I | Challenge ranks 5 to 12 | Road continues |
| 18 | 17 | Rank 12 | Challenge crossroads II: Mended | Next to rank 12 |
| 19 to 21 | 18 to 20 | Challenge crossroads I | Road to Hold Fast, 3 milestones | It branches off after crossroads I. The vow itself needs Level 30 |
| 22 to 23 | 21 to 22 | Entry road junction | Road to Frost Slam (+2% armor, +2% ward) | Next to the junction |
| 24 to 27 | 23 to 26 | Frost Slam road start | Frost Slam ranks 1 to 4 | Frost Slam learned at Level 12 |
| 28 | 27 | Frost Slam rank 4 | Frost Slam crossroads I: Long Frost | Next to rank 4 |
| 29 | 28 | Shield junction | Shield to Restoration border road, milestone 1 | Next to the junction |
| 30 | 29 | Hold Fast's road | **Vow: Hold Fast** | Requires Level 30, and its road is owned |

That's the gold build in the sketch at Level 30. The sketch shows the same hero at Level 34 with a few more points spent and 3 unspent.

## 13. Open questions

- Is 4 + 8 milestones a road right, or should the second fork come sooner? A played week decides.
- Vow slots at 30, 80 and 200: is 80 too late for a second identity?
- Should border roads cost more than 2 milestones so hybrids are a choice and not a default?
- Does the map need a "Restoration only" filter on phones, or is region jumping (the chips in the sketch) enough?
