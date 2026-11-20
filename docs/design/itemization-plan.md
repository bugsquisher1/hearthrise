# HEARTHRISE ITEMIZATION: THE COMPLETE PLAN

Game designer (Fable), 2026-11-18. One document. It replaces `itemization-system.md` and `itemization-roadmap.md`. Appendix A holds the answers to Tyler's five roadmap findings, with their tables. Merged 11-18 late: the Canary/Veloren/ultraloot adjustments (`itemization-canary-adjustments.md` holds the reasoning, the 26-idea table and the Canary item-attribute findings) Tyler's two rulings: necklaces at Smithing, Klappa's Klub; and his §13 answers (no budget: sinks exceed a band on purpose; linings 12 h that stack).

Measuring tools (commit a0ca48be9 on `lane/d-itemization-audit`): `tools/balance-sim/fist-proto.mjs`, `tools/balance-sim/chest-odds.mjs`, `tools/balance-sim/itemization-table.mjs`, `tools/qa/itemization-audit.mjs`.

**Prices are the ruled ones** (Tyler 11-18 said no to a budget that fits everything): gear upgrades cost more than a band's gold on purpose, so heroes choose what matters and end up different (section 10). The income figures behind section 10 predate the 11-16 income cut; they must be re-measured on the current build.

**How to read the labels.** Built: in the game's data today. Ruled: Tyler said so. Measured: run on the real engine (lone hero, Normal, 3 seeds x 3 h unless stated). Proposed: a design number nobody has measured. Estimate: arithmetic from other numbers.

## 0. One-page summary

**The six rules**

| # | Rule | Meaning |
|---|---|---|
| 1 | What you fight in drops | Helmet, body, legs, boots, gloves, weapon, shield |
| 2 | What you finish it with is made | Two rings, earrings, necklace, cloak, belt, with rolled perks |
| 3 | What you use up is made | Food, drinks, arrows, bolts, whetstones, runes. The store sells a weaker copy |
| 4 | What makes gear better is made | Tempering salts, linings, reforging |
| 5 | Special pieces are won | Bosses, the Hearth Chest, each ground's Rares |
| 6 | Crafters need hunters, hunters need crafters | Gems, hides, parts, ore and patterns come from hunts. Jewelry, cloaks, belts, linings and salts come from benches |

**The 14 slots**

| Group | Slots | Count |
|---|---|---|
| Dropped | Helmet, body, legs, boots, gloves, weapon, shield | 7 |
| Crafted | Ring, ring, earrings, necklace, cloak, belt | 6 pieces, 12 perk seats |
| Used up | Ammo | 1 |

**The numbers that hold it together**

| Thing | Number | Label |
|---|---|---|
| A weapon tier | +5 to +9% Level XP an hour | Measured |
| An armor tier, all slots | 13 to 26% less damage early, 5 to 10% late | Measured |
| An accessory set, one tier up | At most one weapon step | Rule, checked against today's rows |
| All gear upgrades in a band | Cost more than a hero banks there, on purpose: about 1.0 to 1.4 times, before linings (section 10) | Ruled 11-18 |
| Perk pool | 22 perks for 12 seats, in slot pools, growing at tiers 4 and 6 | Proposed |
| A region past 110 | About 55 Levels, six grounds, two bosses, 46 uniques | Proposed, Morrow gridded |
| Chest base chance late | 2%, never lower | Decided here from the wait table |
| Levels 110 to 400 | About 4,200 hunting hours | Estimate from the pace ruling |

## 1. Each system and its purpose

| System | Player problem | Decision it gives | Status |
|---|---|---|---|
| Drops | "What do I get for hunting here?" | Which ground for which slot | Built |
| Jewelry, cloaks, belts | Six thin or empty slots. Crafting has no identity | Which perks. Wear or sell | One ring built |
| Jewel reforging | Re-buying a set every tier | Carry it up, or chase a new pair | Proposed |
| Commission | A hunter can't use a crafter without giving the piece away, and a crafter with no materials has nothing to make | Pay a crafter or raise your own. For a crafter: which jobs to take | Proposed |
| Worn in | A unique is worn for hundreds of hours and never changes | Deepen what the piece does, or widen it | Proposed. Sample of five first |
| Consumables | Hunts burn supplies | Make better or pay the store | Built |
| Tempering | Gold piles up | Blows or Armor first | Built, tiers 2 to 6 |
| Linings | Group spells can't be dodged, and a lone hero has no sustain but food | Which of five elements, or which leech, for this ground | Designed 11-13, widened 11-18 |
| Elements | Every ground asks the same thing of a hero: more armor | Which element to guard against, and which of your spells the monsters here are weak to | Three built. Necrotic and Storm ruled 11-18 (Appendix B) |
| Patterns | Crafting has no chase | Which ground for which recipe | Proposed |
| Good batch | Levels between unlocks do nothing | None. A moment | Ruled yes, not built |
| Chest gear | A long weekly chase | Which family of key, stoke or save, reforge or roll | Tower built |
| Uniques | Standard gear is all alike | Which piece for which ground | Sample hidden |
| Training | Skills lag | Train or craft | Built. Defense being fixed |
| Salvage | A hero picks up 9 to 31 gear pieces an hour and can only sell them | Sell for gold or break down for crafting stock, set once per item | Proposed |
| Weekly orders | Crafted staples have no buyer but the shop | Which orders to fill this week | Proposed |
| Stirred grounds | No reason to pick one ground over another today | Hunt where the chips are, or stay on your route | Proposed |

## 2. Tiers, bands and regions, Levels 1 to 400

| Levels | Region | Grounds | Gear | Elements its monsters use | State |
|---|---|---|---|---|---|
| 1 to 50 | Greenhaven | Six | Tiers 1 to 3 | Fire, ice, poison | Built |
| 45 to 110 | The Barrow March | Five, Krell's Hall | Tiers 4 to 6, tier 7 from Krell | Fire | Built |
| 110 to 165 | The Morrow Hills | Six, the Roost Mother, Father Gault | Finishes tier 7. Bands 8 and 9 | Fire, ice, poison. **Necrotic arrives on the Ox Road. Storm arrives on the Old Guard** | Designed, one ground staged |
| 165 to 185 | The Unmarked Catacombs | One ground, plus the descent at any Level | Band 10 | **Necrotic's home**, with poison and ice | Ground staged with no gear |
| 185 to 240 | Region 4 | Six, two bosses | Bands 11, 12 | At least two, to be set | Structure only |
| 240 to 295 | Region 5 | Same | Bands 13, 14 | **Storm's home** | Structure only |
| 295 to 350 | Region 6 | Same | Bands 15, 16 | At least two | Structure only |
| 350 to 400+ | Region 7 | Same | Bands 17, 18 | At least two | Structure only |

| | Levels 1 to 110 | Past 110 |
|---|---|---|
| Step | A tier every 15 Levels: 1, 15, 30, 45, 60, 75, 88 | A band about every 27 Levels, two a region |
| What it is | A full standard set, three weights, seven weapon families | A power budget for named uniques |
| Power | The tier's numbers | The budget line by the Level worn (ruled 11-16, about Dawnsteel times Level over 110, no tier 8) |
| Hours a step (estimate) | 60 to 110 | 290, then 390, then 490 |

Hours (estimate from the pace ruling): 110 to 165 about 590, 165 to 200 about 380, 200 to 300 1,440, 300 to 400 about 1,800.

Rules every region follows (all ruled): equal First Flame and Last Ember grounds. The last boss is a keyed hall with a daily personal roll. Earlier bosses are call series. No ground is best at everything. No bound gear. Gear is worn by Level only.

## 3. Dropped gear

### Tiers 1 to 7 (built, with lane/d-drop-homes finishing the weapon and shield homes)

| Slot | Source | Pace | Worth |
|---|---|---|---|
| Helmet, body, legs, boots | Scarce, three weights | About hourly in your weight | A full tier: 13 to 26% less damage at tiers 2 to 4, 5 to 10% at 5 to 6 (measured) |
| Gloves | Shop pair at 1, then Rares | 10 to 20 h. Slow on purpose, plus the Catacombs glove wing | |
| Weapon, seven families | Start kit, then a drop home for every family at every tier | Scarce or Rare | +5 to +9% XP a tier (measured) |
| Shield, spellbook | Shop shield at 1, then drops at every tier (ruled) | Rare | |
| Belt | Rares today | | Moves to crafting in the belt phase |

A hero sees 9 to 31 gear pieces an hour and a Rare every 0.3 to 3 hours (measured).

### Past tier 7: uniques

A unique sits inside its band's budget, has its own stat mix and one property, wins somewhere and gives something up. No set bonuses. Ruled 11-14 and 11-16.

**The hourly drop past tier 7.** Standard gear ends at about Level 128. From there the hourly drop is crafting stock (the region's ore, hide, cloth) and gem chips. Uniques stay Rares. With seven or so Rares a ground at 10 to 20 hours each, a hero sees a unique about every two hours and one for their style every six to ten (estimate).

**The property catalogue.** A unique's one property comes from this list. Past tier 7 the plain numbers follow the band's budget and barely separate two pieces; the property is what a player chooses between.

| Property | What it does | Slots | Engine today | Sample size (proposed) |
|---|---|---|---|---|
| Element guard | Less damage from one element | Any armor, shield | Built (40% cap, shared with linings) | 10% |
| Physical guard | Less from blows with no element | Legs, boots, shield | Built | 2 to 3% |
| Steady | A flat cut off every hit | Boots, cloak | Built | 1 to 3% |
| Crit | More critical basic blows | Weapon | Built | 6 to 10% |
| Bane | Hits one monster class harder | Weapon | Built | 10% |
| +Skill | Counts as more of one combat skill (the engine's `meleePlus` / `rangedPlus` / `magicPlus` / `defensePlus`) | Armor. On weapons it is the chest's | Built | 2 to 3 |
| **Spell change** | One named ability hits harder, comes back sooner, or costs less | Weapon, spellbook, helmet, gloves | New hook | +15% damage, or -15% cooldown, or -20% mana, on one ability |
| **Element edge** | A share of the weapon's basic damage lands as fire, ice or poison | Weapon | New hook | 20% |
| **Second socket** | The piece takes two linings | Armor, weapon | With linings | |
| **Thorns** | Whatever hits you takes a share back | Shield | New hook | 8% |
| **Sweet spot** | A bow hits harder at one exact distance | Bow, crossbow | New hook | +8% at distance 5 |
| **Status ward** | A chill or sickness on you ends sooner | Helmet, cloak | Later | |

Rules: one property a piece (two only on late chest pieces). A new kind needs its engine hook and a measured sample before any piece carries it. Spell change is the first new hook to build: it is the only one that gives a caster's weapon a property that measures.

**Quivers.** A bow fills both hands and its off-hand is empty. Past tier 7 a quiver may be a region's wildcard unique: an off-hand piece only a bow can wear, with a property about its shots (such as getting one arrow in five back). An off-hand piece, not a new slot. A bow's numbers assume an empty off-hand today, so a quiver's worth comes out of the band's budget for that bow.

**Uniques and chest weapons: the sidegrade rule (Tyler 11-18).**

| Kind | What it is | Best where |
|---|---|---|
| Chest weapon | The plain numbers of the next step up, plus +1 to +4 of its skill. Built in lane/d-defense-tower: +3 to +10% at its own Level, 1.00 to 1.03 times the next tier's drop | Everywhere a little. The best all-rounder |
| Boss or ground unique | Past tier 7 (worn from past 110): its own stat mix inside the band's budget, never the line's own numbers (the line is a ceiling, not a template: Tyler 11-16, tests/weapon-line.mjs and armor-line.mjs WL4/AL4), no skill bonus, plus one property from the catalogue. At tier 7 and below: the standard piece of its slot and tier plus one attribute (Tyler 11-14, special-attribute gear; the Banded Legguards, and Krell's five, follow it; tests/special-attributes.mjs SA2) | Clearly best in the case its property is for. Slightly behind elsewhere |

Krell's weapons become the first of these. Sample of five (proposed, unmeasured):

| Krell's piece | Property | Wins | Loses to the Gold Tower weapon |
|---|---|---|---|
| His sword | Bane: the Undead, 10% | The Ox Road, the Night Shift, the Catacombs | On living things, by about the skill bonus |
| His warhammer | Bane: Humanoids, 10% | Carter's Rest, Krell's Hold | On the Undead |
| His bow | Sweet spot: +8% at distance 5 | A hero who can hold range. Most bosses | When the pack closes in |
| His wand | Spell change: Fireball +15% | Big pulls on Dangerous and Deadly | On single targets |
| His staff | Spell change: Greater Mend costs 20% less | A healer in a four | Hunting alone |

### Worn in (sample first)

A unique gets better at its own job the longer one hero wears it. From the second research pass, adapted.

| Rule | Value | Label |
|---|---|---|
| What earns it | Hours of hunting with the piece worn, counted by the server | Proposed. Hours, not kills, so a lone hero and a four earn it at the same pace |
| Ranks | Three, at 10, 40 and 120 hours worn | Proposed |
| Each rank | Pick one of two fixed options for that piece. Nothing is rolled | Proposed |
| What the options are | One deepens the piece's property. The other widens it | Proposed |
| Size | Small. Every worn-in piece a hero has, added together, is worth less than half a weapon step | Proposed limit, unmeasured |
| Where it's kept | On the hero, for that piece. The item itself never changes | Proposed |
| Trading | The piece trades as it always did. The new owner starts at rank 0. If the old owner gets another, their ranks are still there | Fits "no bound gear" |
| Changing a pick | Gold, priced by the piece's tier or band. Never by Level | Proposed: 50,000 at tier 7 |
| Which pieces | Named uniques and chest pieces. Standard tier gear has none | Proposed |
| On screen | The item card shows "Worn in: 2 of 3" and the picks. A rank earned shows once on the hunt's end card: "Krell's sword is worn in. Pick one." | Proposed |

One worked example, Krell's sword (its property: hits the Undead 10% harder):

| Rank | Deepen | Widen |
|---|---|---|
| 1, at 10 h | The Undead: 10% becomes 12% | Also hits Constructs 4% harder |
| 2, at 40 h | Critical hits on the Undead do a little more | The Undead bonus also applies to Flame Strike |
| 3, at 120 h | The Undead: 12% becomes 14% | Also hits Humanoids 4% harder |

A hero who deepens every rank has a sword for undead grounds only. A hero who widens has one that is decent in three kinds of place. Same item, two heroes, two swords. That is the difference Tyler asked for on 11-18.

How it sits beside what's already here:

| System | Paid with | What you get | Where |
|---|---|---|---|
| Tempering | Gold and salts | A flat gain | On the hero, per tier or band |
| Perks | Gems and fees | Two picked perks a piece | Crafted pieces |
| Worn in | Time worn | A choice of direction | Dropped uniques and chest pieces |

**The sample:** Krell's five sidegrade weapons, three ranks each. Measured with all five ranked both ways before any other piece gets ranks. If the gain can't be kept under the limit and still be felt, it is dropped.

### The ground template (past tier 7)

Five monsters, the fifth an elite.

| Rows | How many | Band | Purpose |
|---|---|---|---|
| Bones or a Hearth fuel | One a monster | Common | Inner Flame |
| Crafting stock: region ore, hide, cloth | One region table, named once by every ground in the region | Common and hourly | Rule 6 |
| The monster's own part | Five | Uncommon | Linings |
| Gem chips | The same region table | About hourly | Gems |
| Unique armor | Three, one a weight, three slots | Rare | |
| Unique weapons | Two. Three on a region's last two grounds | Rare | |
| A wildcard unique | One: shield, spellbook, gloves, a quiver or an open cell | Rare | |
| A pattern | One | Rare | A crafted recipe |
| A whole gem | One, on every second ground | Rare | |
| A named Hearth fuel | One | Rare | Ruled 10-25 |
| A trophy | Boss grounds | 100 to 150 h | Ruled |

Region tables are an authoring shape only: a pack compiles to the flat per-monster rows the engine already rolls, so no roll changes and the Hunts page still shows a plain percent per kill. With stock and chips written once a region, a ground adds about 14 to 16 new rows, down from 18 to 20. The rest of the template (bosses, the check before a ground is reported) is unchanged.

Around it: the region's ore or wood node on two grounds, one named wall element with its lining part, a faction, a Tamsin task, monster stat cards.

| Boss | Ships with |
|---|---|
| Call-out boss | Three armor pieces, two weapons, one call-only piece, a pattern |
| Final boss | A key on the last ground's elite. Four armor pieces in four slots. The region's main gem. A hide for the top cloak. A trophy. A pattern. A daily personal roll |

**The check before a ground is reported:** every unique is inside the budget, the region's 17 armor cells and its weapon families are still coverable, every part has a use, and a hero in the last band's gear can hunt it on Normal. The Morrow Hills grid in Appendix A, Finding 1, is this template filled in.

## 4. Crafted gear

### Who makes what (ruled)

| Skill | Worn pieces | Also |
|---|---|---|
| Smithing | All jewelry: rings, earrings, necklaces (Tyler 11-18: "necklace might as well go to smithing since its also jewelry"). Belt buckles, clasps, chains | Bars, whetstones, salts, reforging metal pieces |
| Crafting | Cloaks, belts | Planks, arrows, linings, salts, reforging hide, cloth and wood pieces |

The jewel skill becomes a field on each piece. A gem is set at the piece's own bench.

### The rules

| Rule | Value | Label |
|---|---|---|
| Grades | Plain, Fine (one perk), Hallmarked (two) | Built |
| Base job | Mostly Plain. Fine 5% at skill 15 to 12% at 99 | Built |
| Gem job | A plain piece and a gem. Never Plain. Hallmarked 10% at 15 to 25% at 99 | Built |
| Hallmark step | A Fine piece, a gem, the fee. The player picks the second perk. Nothing fails | Built |
| Hallmark level | The next tier's skill level: 30, 45, 60, 75, 88, 99 | 30 and 45 built |
| Gems | One gem a tier. It works in any slot and forces no perk | Decided |
| Each perk counts once a hero | The larger worn | Built |
| Plain stats | Help all three styles | Decided, from the mage's +0.9% |
| Re-rolls for gold | Never | Ruled |
| Trade | Everything | Ruled |

### The power budget

| Rule | Number |
|---|---|
| The whole set, one tier up, fully Hallmarked | At most one weapon step (5 to 9% XP) and half an armor step |
| Split | About half plain stats, half perks |
| One perk, in an ordinary hunt | About 1% XP or 2% less damage |
| One perk, in the case it's built for | About 3% XP, measured in that case (not 3x the same hero's ordinary hunt: Steady at 20% reads 2.9% for a melee hero 10 skill levels under and 1.3% across all ways at the Level, lane/d-jewelry-2b) |
| Check | Every tier's full set is measured with all six pieces worn before it ships |

Perk sizes on paper (tiers 2 and 3 built, 4 to 7 proposed):

| Perk | T2 | T3 | T4 | T5 | T6 | T7 |
|---|---|---|---|---|---|---|
| Keen, Follow-through | 4% | 6% | 7% | 8% | 9% | 10% |
| Surge | 6.7% | 10% | 11.5% | 13% | 14.5% | 16% |

Past tier 7, sizes stop. New regions bring new perks.

### The perk pool: 22 perks, 12 seats

The pool grows with tier, so upper tiers hold perks a carried piece can't have.

| Slot | From tier 2 | Added at tier 4 | Added at tier 6 |
|---|---|---|---|
| Ring | Keen, Follow-through, Surge (all live), Thrift | Opener: your first blow on a fresh monster hits harder | Finisher: more damage under a quarter HP |
| Earrings | Steady: basic blows miss less. Focus: mana back on a kill | Echo: your heals and shields are stronger | Giantsbane: more damage to a ground's boss |
| Necklace | Deflect: a blow is turned aside. Second Wind: HP back on a kill | Reserve: more max mana | Vigor: more max HP |
| Cloak | Slip: the first blow of a pull at you misses. Stride: you walk faster between pulls | Windbreak: less damage from ranged blows | Thick: less damage from marked heavy hits |
| Belt | Hearty: food heals more. Quench: drinks restore more | Brace: less damage under 30% HP | Stockpile: some food and drink costs nothing |

Cloaks carry no element perks; elements belong to linings. Forager is cut: nothing in the data backs it. A fully Hallmarked hero plays 12 of 22: four of six on the rings, two of four in each other slot. Hooks: three exist; the first wave is nine more (Thrift and two for each of the other four slots), enough for tiers 2 and 3.

### The ladders

| Tier, Level | Metal | Gem | Hallmark fee, each | Reforge to this tier, each (the fee difference) | Ceiling, Fine / Hallmarked |
|---|---|---|---|---|---|
| 2, 15 | Bronze | Road Carnelian (built, the Turncoat) | 25,000 (built) | | 100k / 300k (built) |
| 3, 30 | Steel | Seam Jasper (new row, a Warrens Rare) | 100,000 (built) | 75,000 | 300k / 1M (built) |
| 4, 45 | Gold | New, the Slake's Color Sergeant | 150,000 (ruled) | 50,000 | 10x the fee |
| 5, 60 | Rune | Ruby (row exists, no source), Captain Hask | 250,000 (ruled) | 100,000 | 10x |
| 6, 75 | Emberforged | New, the Provost | 400,000 (ruled) | 150,000 | 10x |
| 7, 88 | Dawnsteel | Krell's daily roll | 600,000 (ruled) | 200,000 | 10x |

Cloak and belt materials are common drops: pelts, Bear Pelt, Silk Thread and coal tar, Grave Dust-cured cloth, Wraith Veil and Razor Claw, Troll Hide.

### Gems and chips

| Need | Six pieces carried up use 6 gems a band. A fresh Hallmark uses 1 more |
|---|---|
| Whole gem | A Rare, about 11 hours on its carrier (built for the Carnelian) |
| Chips | Drop from every monster on the tier's grounds. 10 chips make a gem at the forge |
| Chip pace | Sized so chips alone give a gem about every band-hours divided by 8: every 5 hours at tier 2, every 15 later |
| Stirred grounds | Each hour the server marks a few open grounds as stirred. Their elites are a little tougher and drop extra chips while it lasts. Monster stats and drops only, shown on the Hunts page, the same for every group size |
| Weekly orders | Tamsin posts orders for drops and crafted staples. They pay chips and salts |
| Old Rare prizes | Alpha Fang, Rook's Whistle and Crown Shard each cut into one gem of their tier. War Crown is left out because the House uses it. The Crown Shard KEEPS its second use (designer 2026-11-18): set in a Banded Signet in place of the Road Carnelian it would cut into, it guarantees Follow-through, so the guarantee costs exactly the gem the cut would make. Its card names both uses as labels |

Stirred grounds and weekly orders are extra chip sources on top of the base pace, sized so a hero who ignores both still meets the six gems a band.

### Jewel reforging (ruled yes; the gem and skill gate and the price decided here)

**The decision Tyler left to the designer: yes, tier 7 work needs tier 7 things.** A reforge takes the new tier's metal, the new tier's gem, the new tier's Hallmark skill level, and gold. Without that, the best play is to Hallmark once at tier 2 and carry it for life, which kills every gem above the Carnelian, Krell's gem, and the skill 99 capstone. With it, a crafter at 99 and Krell's gem are what finish a tier 7 set, and a hunter without the skill uses a commission. What a reforge saves against a fresh Hallmark: the Fine chase, and the part of the fee the piece already paid. A reforge may also swap one perk for a perk of the new tier's pool, since the gem is there to set it; that is how a carried piece reaches the tier 4 and tier 6 perks.

**On screen**

| Step | What the player sees |
|---|---|
| 1 | The bench has a Reforge tab. Smithing lists rings, earrings and necklaces, Crafting lists cloaks and belts |
| 2 | Every crafted piece you hold that has a next tier, with an arrow to what it becomes |
| 3 | Two cards side by side, now and after, changed numbers marked. "Perks stay. Keen 4% becomes 6%." A row under it: "Keep both perks" or "Swap one", with the new tier's perks listed |
| 4 | One cost line: "6 Steel Bars (you have 9), 1 Seam Jasper (you have 1), 75,000 gp." Then "Requires Smithing 45. Worn from Level 30." A missing part is named |
| 5 | Press Reforge. Nothing rolls, nothing fails. The old piece is used up, the new one is in your bag, worn if it was worn and your Level allows |

### The Fine chase, as one order

A standing order at the bench: "Make until Fine with one of these perks, salvage the rest, stop after this many bars." Salvaging a plain piece returns half its metal and no XP (section 5). Chasing a first perk is one decision, not sixty presses, and it can't be farmed for XP.

### Commissions

Two kinds of job, one board, one set of safety rules.

**A single job** is one Hallmark or one reforge on a piece the owner keeps.

| Step | Rule |
|---|---|
| Post | The owner puts the piece, the materials, the gem, the fee and a tip into the board, and picks the perk |
| Hold | The server holds all of it. The crafter never has the piece |
| Complete | Any crafter with the skill presses Complete. They get the craft XP and the tip |
| Return | The finished piece goes back to the owner |

**A bulk order** is many of the same staple: salts, linings, arrows, bars. From the second research pass, adapted.

| Step | Rule |
|---|---|
| Post | The owner puts in the inputs for a number of crafts and a price per craft |
| Hold | The server holds the inputs, the pay and everything made |
| Work | Any crafter with the skill takes it as their bench job. Several can work the same order at once. Each craft is one unit |
| Pay | Each crafter earns the craft XP and the price for every unit they made |
| Return | Everything made goes to the owner. Unused inputs and unspent pay go back when the order is done, cancelled or times out |
| What it costs a crafter | Their town hours. A hero does one thing in town, so working an order is time not spent on their own crafts or training |

**Safety, both kinds:** server-owned and journalled. A time limit on every job. A job resolves once. A daily limit per account. The bench fee applies as on any craft. Nothing a crafter does can take the owner's piece or inputs. A money surface, on the pre-EA Security list.

Why the bulk order earns its place: it gives a crafter with skill and no materials something to do, and it gives a hunter 620 salts without 5 hours at a bench. It is not a second system. It is the same board with the work split into units.

The XP a crafter earns on an order is paid for by the owner's materials, which are used up. So one player can fund another's skill, at full material cost. That is ordinary trade and is allowed.

Raising your own smith and crafter on one account stays allowed. Commissions are for everyone who doesn't.

### Samples for the first build

| Piece | Slot, tier | Bench | Made from |
|---|---|---|---|
| Seam Jasper Band | Ring, 3 | Smithing 30 | Steel Bars, a Seam Jasper to set |
| Fang Studs | Earrings, 2 | Smithing 15 | Small Fangs, Bronze Bars |
| Wolfbone Necklace | Necklace, 2 | Smithing 15 | Small Fangs, Silk Thread, a bronze chain |
| Warband Bulwark | Cloak, 3 | Crafting 30 | Bear Pelts, a steel clasp |
| Pattern: Kingsgrate Rivets | A Rat King Rare | | Unlocks the Steelgrate reforge |

Rings roll in this build. Earrings roll once Steady and Focus are hooked in the same phase. The necklace and cloak ship plain until their hooks land. No belt yet.

### Old rows, placed or cut

| Row | Call |
|---|---|
| Gold Ring, Gold Amulet | Tier 4 plain ring and necklace |
| Ruby Signet, Rubyfire Studs | Tier 5 ring and earrings |
| Wraithglass Drops, Spellstone Ring | Tier 6 |
| Dawnforged Signet, Dawnbound Amulet, Dawnlit Mantle | Tier 7 plain ring, necklace, cloak |
| Warband Bulwark, Barrowking Mantle | Tier 3 and 5 cloaks |
| Trollhide Cape | Re-tiered from 4 to 7 |
| Houndskin Cloak | Its recipe moves from Crafting 1 to 15 with the ladder |
| Hollow Sigil Ring, Panther's Eye Pendant | Pattern pieces, names kept (ruled) |
| Dragon Gem Earrings, Wyrmgilt Mantle | Past tier 7 |
| Tusker Charm | Stays Old Tusker's champion relic. Not on the crafted ladder |
| Packlord Band, Spider-Eye Studs, Mirewort Drops, Spidersilk Choker, Warlord's Torc, Jarl's Rimetorc, Woolen Cloak, Alpha Cloak, Shadowsilk Cape, Chitinweave Cloak | Cut |
| The other champion relics | Not read. They go to the special-attribute audit |

## 5. Making gear better

| System | Rule | Numbers | Label |
|---|---|---|---|
| Tempering | Gold and salts, five rungs a track, one ladder a tier, on the hero | Blows +3 to +4.7% XP, Armor 2 to 10% less damage | Built, measured |
| Tempering past tier 6 | A Dawnsteel ladder for 88 to 110, then one a band, 2 to 3% a track | | Ruled in principle |
| Salts | One a tier, either bench | 310 a track | Built |
| Linings | Below | | Designed 11-13, widened here |
| Salvage | Below | | Proposed |
| Patterns | A Rare that unlocks the recipe for the hero who reads it (designer 2026-11-18: per hero, the built hr_recipe_learn) | Eight a region | Ruled |
| Good batch | A consumable job sometimes makes double | 2% at level 1 to 10% at 99 | Ruled yes |
| Named reforging | Kingsgrate to Steelgrate, Klappa's Klub | | Built |

Good batch adds a little gold through sold food, up to about a tenth of a cook's shop income (estimate).

**Linings.**

| Rule | Value | Label |
|---|---|---|
| What it is | A crafted lining fitted into a piece of worn gear | Designed |
| Made from | ONE monster part plus gold, at Crafting. Nothing else (Tyler 11-18: "only one item + gold should be required for a lining") | Ruled 11-18 |
| Sockets | Standard gear has one. A unique may have two (its property) | Proposed |
| Which kinds fit where | Element guards in armor and shields. Leech in weapons and off-hands | Proposed |
| Element guard | Stitched 20%, Corded 25%, Sealed 30% less of fire, ice, poison, necrotic or storm. Each element capped at 40% with worn pieces | Fire, ice and poison designed and measured 11-13. Necrotic and Storm proposed |
| What a Necrotic guard does | Lowers the necrotic damage and the healing cut by the same percent | Proposed |
| What a Storm guard does | Lowers the storm damage and the mana burned by the same percent | Proposed |
| Life leech | A share of your damage comes back as HP. Cut by Withered like any healing | Proposed, unmeasured |
| Mana leech | A share comes back as mana. The other answer to Storm | Proposed, unmeasured |
| How long one lasts | 12 hours of hunting. The server counts it only while the hero is in a hunt with the piece worn | Ruled 11-18 |
| Stacking hours | Fitting another lining of the same kind and grade adds 12 hours | Ruled 11-18 |
| The cap | 48 hours in one socket, four linings | Proposed |
| At the cap | A lining fits only if it won't go over. With 37 hours or more left, the Fit button is off | Proposed |
| A different kind or grade | Replaces what's there. The hours left are lost, after a confirm that says how many | Proposed |
| Taking the piece off | The hours wait. They don't run down in Storage or in the bag | Proposed |
| Running out mid-hunt | The hunt goes on without it | Proposed |
| Fitting it | Always works. No chance to fail | Decided |
| Each kind counts once a hero | The strongest worn | Ruled 10-15 |
| Trade | A lining trades until it is fitted. A piece with hours left in it can't be traded until they run out or the lining is taken out for a fee | Ruled 10-15 |
| Cost | The part and gold. Sized so that 12 hours of one lining costs about a tenth of what 12 hours of hunting earns there | Proposed, unmeasured |

Why 48 hours: it is four days at 12 hours of stamina. That is long enough that a player tops up twice a week, and short enough that nobody pre-pays a whole band and forgets linings exist.

**How it reads on screen**

| Where | Text |
|---|---|
| The item card | "Fire guard, Stitched. 31 h left (max 48 h)" |
| The Fit button | "Fit: +12 h" |
| The button at the cap | "Full. Fits at 36 h or less" |
| Replacing | "Replace Fire guard? 31 h will be lost." |
| Hunt prep and the hunt's end card, under 2 hours | "Fire guard runs out in 1 h 40 m" |
| One press in town | "Top up linings": fits what the bag and Storage hold, up to the cap, after showing what it will use |
| The analyzer, when one ran out | "Fire guard ran out at 3 h 10 m" |

Top up is one press and uses only linings the player already owns. It buys nothing.

Critical-hit linings are not on the list. Crit belongs to the Keen perk and to weapon properties.

Leech is where a lone hero's sustain comes from without food. The fist prototype failed its solo test for lack of exactly this, so the fist line's own heal and a leech lining are two answers to measure against each other before either is sized.

**Old grounds stay useful through scaled hunts** (Tyler 11-18): a scaled early hunt raises its monsters, so their lining parts keep dropping for higher heroes, likely from the third region on. Linings never ask for parts from earlier grounds.

**House curing** (Tyler 11-18: kept, as a gold sink).

| Rule | Value | Label |
|---|---|---|
| What it is | A room slot in the House where a lining or a batch of salts cures while the hero is away hunting. The account's House, so every hero shares the slots | Proposed |
| What can cure | Linings and Tempering salts only. Gear, jewelry and food stay at the bench | Proposed |
| Time | The same craft time as at the bench, counted on the server clock. No skill XP: the hero isn't working it | Proposed |
| Slots | Bought with gold, each dearer than the last: 100,000, then 250,000, then 500,000. Three at most | Proposed, unmeasured |
| Each cure | A gold fee on top of the materials, about a tenth of the item's reference value | Proposed, unmeasured |
| Skill | The recipe's own skill level is still required | Proposed |

It saves bench hours, never skill: a hero still needs the skill to set a cure, and a hero who cures instead of crafting earns no XP for it. It is a sink by design, so the slot and fee prices are measured against band income before it ships.

**Linings by region.** Strengths never grow. A region names the wall element on each ground and supplies the part. Barrow March: fire. Morrow Hills: fire at Carter's Rest, Wyvern Roost and the Bellows, necrotic on the Ox Road (the Ox Shoe), poison on the Night Shift, ice and storm on the Old Guard. Catacombs: necrotic (the Owing Tag), poison and ice. Region 5: storm. Later regions: at least two elements each, and a ground's wall never matches its faction pair's.

**Salvage.**

| Rule | Value |
|---|---|
| What it is | Any gear breaks down at a bench into a fixed material and count. Nothing is rolled |
| Yields | A standard piece gives its tier's ore, hide or cloth. A plain crafted piece gives half its metal. A unique gives gem chips |
| No XP | Salvage pays no skill XP |
| Where the choice is made | A fourth loot destination beside Keep, Deposit and Sell: set once per item or per kind, then applied on Dispatch |
| Guard | A piece's salvage is never worth more than the shop pays for it, checked by the reference-value guard (section 10) |
| Metal pieces | Smithing. Hide, cloth and wood: Crafting |

Salvage replaces "melting". It also makes rule 6 true for the hourly gear drop: the armor a hero doesn't wear becomes the next ring or belt.

## 6. Chest gear

| Chest line | Gives | Keys | Status |
|---|---|---|---|
| Tower | Weapons, one a family a key tier | Bronze, Silver, Gold, Platinum at landings 10, 40, 70, 100. Then one a band | Built. Power raised in lane/d-defense-tower |
| Catacombs, Bone Wing | Leans helmets | The same four tiers | Designed |
| Catacombs, Flooded Wing | Leans boots | Same | Designed |
| Catacombs, third wing | Leans gloves 70%, helmets and boots 15% each. Twelve rows | Same family, same 6 opens | Proposed |

Ruled: chest gear stays rare. It may beat the next tier's drop and should go about that far. It is never bound. Deeper content is rarer and stronger, some with two attributes.

**The late shape**

| Dial | 15 to 110 | 110 to 200 | 200 to 300 | 300 to 400 |
|---|---|---|---|---|
| Power | The next tier's numbers plus skill | The next band's budget plus skill | Same | Same |
| Base chance | 16 / 8 / 4.5 / 2% (ruled) | 2% | 2% | 2% |
| Two-attribute share of paid pieces | None | None | 1 in 4 | Half |
| Fusing | | | Yes | Yes |

**Waits** (Appendix A, Finding 2): any piece 4 weeks median, your piece 7, your two-attribute piece 8 to 9 by fusing, all with a 90th percentile under 20 weeks.

**Chest reforging** (ruled: yes, and it uses one of the 6 weekly opens). The piece, 6 keys of the next tier, that tier's metal or hide, gold, and one open make the next tier's piece with the same attribute. Six keys is about a week of climbing at that depth; at one key a step a hero goes from a Bronze piece to Platinum in three opens, which stops the piece being rare at all.

**What weapon drops are still for,** given a Tower weapon equals the next tier's drop: the other six families, every hero before their first chest piece, alts, the market, and the boss uniques that beat it in their own case.

**The Bronze and Silver problem** (a Level 15 piece takes weeks, a hero outgrows it in days) is answered by reforging: a low piece is the start of a line you carry. The 165 to 185 Catacombs ground needs its own uniques before it opens.

## 7. The fist line

**Tyler's identity statement:** "Fist weapons are Hearthrise's self-sufficient all-rounder. They offer steady single-target damage, elemental flexibility, and enough personal sustain to make solo hunting comfortable. In a four-player party, they can fill a gap, while dedicated damage dealers, tanks, and healers remain stronger in their roles."

**What the prototype showed** (Appendix A, Finding 5): with today's pieces it fills a gap and specialists stay ahead, but it is not comfortable alone.

| Dial | Target | Label |
|---|---|---|
| The promise | Within 15% of the best lone XP. Best net gold of any lone melee from Level 40, where supply bills decide gold; under 40, where gold is kill speed, within 15% on gold too. Graded on the grounds the Hunts advice sends a hero alone to (the Sewer is a pack ground, where every one-target way reads 27 to 33% under the hammer) | Changed from "within 5% on XP". Scoped by the designer 2026-11-18 from the phase 1 measure (board "2026-11-18 Designer rulings", row 3) |
| Damage | One target only. No area | |
| Sustain | Its own heal, about 0.8% of max HP a second while hurt | Proposed from the food it ate |
| Cost | Elemental strikes on mana. A rune is the optional stronger cast | |
| Element | Fire, ice or poison by choice through Charged Hands. Storm and Necrotic through its own two spells | Ruled 11-18: every weapon family has one of each |
| Storm spell | Live Hand: the next three blows are storm and each gives 2 mana back | Proposed |
| Necrotic spell | Draw: one strike, 40% of the damage back as HP | Proposed |
| Armor | Any weight | |
| Party | Counts as Melee | |
| Source | Drops, as the eighth family | |

Draw and Live Hand are the fist line's sustain in spell form. They are measured against its own heal and against a leech lining before any of the three is sized, so the style doesn't end up with three stacked answers to one problem.

Order: the two engine pieces (an ability naming its own skill, the sized heal), then wraps at tiers 1 and 2 and two spells, measured against this table, then the rest.

## 8. The skills, 1 to 99 and after

E means it exists.

| Band | Smithing | Crafting | Cooking | Runecrafting |
|---|---|---|---|---|
| 1 to 14 | Bars, whetstones, tools, Klappa's Klub (E). Copper Ring, Copper Studs, Bronze Buckle | Planks, bronze arrows, Graypelt Cloak (E) | Shrimp, herring, turnip (E) | Blank and Chalked runes (E) |
| 15 to 29 | Tier 2 rings, earrings and necklace. Iron, salts, fittings (E) | Tier 2 cloak, belt. Arrows, bolts (E). Stitched linings | Trout, bread, juices (E) | Scored (E) |
| 30 to 44 | Tier 3. Hallmark tier 2. Steelgrate (E). Chest reforging | Tier 3. Hallmark tier 2 | Lobster, soup (E) | Etched (E) |
| 45 to 59 | Tier 4, gold. Hallmark tier 3 | Tier 4. Hallmark tier 3. Corded linings | Swordfish, stews (E) | Carved (E) |
| 60 to 74 | Tier 5. Hallmark tier 4 | Same | Shark, pies (E) | Graven (E) |
| 75 to 87 | Tier 6. Hallmark tier 5 | Tier 6. Hallmark tier 5. Sealed linings | Frostfin, Ember Tart (E) | Sealing Rune: for tier 6 and 7 Hallmarks |
| 88 to 99 | Tier 7. Hallmark tier 6 at 88, tier 7 at 99 | Same | Moonfish, Moonbloom Elixir (E) | Good batch tops out |

**After 99: 99 is the license.**

| Layer | How |
|---|---|
| Patterns | Every worn recipe past tier 7. Eight a region unlock ten recipes (Appendix A, Finding 4) |
| Staples | Bars, buckles, salts, ammo, linings, food open for the hero at 99 who brings that region's ore or hide |
| Region materials | Only from that region's kills and nodes |
| Maker's mark | Make a set number of a region's pieces and the account's Fine chance for that region rises a little, capped |
| Reforging | Carries Hallmarked work into the next band |

## 9. A hero's day

A hero hunts up to 12 hours on stamina and does one thing in town: gather, bench, or train. Hunting is measured; town plans are proposed, and the Level 10 and 40 rows must be re-run after the Defense fix.

| Level | An hour of hunting | Town hours | What crafting gives |
|---|---|---|---|
| 10 | 20k to 41k Level XP, 2.7k to 4.4k gold | Train. Smith a Copper Ring and Studs. Sew a Graypelt Cloak | The first pieces no hunt drops |
| 40 | 143k to 223k, -4k to +7k | Salts. Tier 3 rings, earrings and necklace at the forge, cloak and belt at the workbench. A lining | Six slots, a gem to set, a first reforge |
| 70 | 230k to 580k, up to 26k | Reforge the set to tier 5. Corded linings. A chest reforge | The band that had nothing in town |
| 100 | 443k to 760k, 15k to 26k | Tier 7 with Krell's gem at skill 99. Sealed linings. Commissions for others | Best in slot for 6 of 14 slots is only made |

Training: +10 of a main skill takes 12 hours at Level 24 and about 960 at 80, so it rules town early and fades late (measured).

## 10. Economy

### Gear costs more than a hero earns, on purpose

Tyler, 11-18: "I actually dont want everyone to be able to easily unlock everything and upgrade everything. otherwise its not really a gold sink it's just a natural line of progression. I want people to make choices on what is important to them, so each character isn't exactly the same."

**How the game makes money (Tyler 11-18):** "I plan on making money in this game by people buying premium, and people buying crowns to sell to other players for gold. I don't want to cripple people so that the only way they can progress is by paying to win, however, I do want whales to pay for gold so they can have an 'edge'." So every progression path (Levels, drops, grounds, gear tiers, skills) is fully reachable without paying, and the gold sinks below are where bought gold becomes an edge: a player who buys gold with Crowns from another player affords more of them. Power is never sold for Crowns directly.

So there is no budget that fits everything. The prices are the ruled ones, and a hero who wants every upgrade in a band can't pay for it from that band's hunting.

**The ruled prices**

| Tier, Levels | Tempering, one track (built) | Hallmark fee, each piece | Reforge to this tier, each piece (the fee difference) |
|---|---|---|---|
| 2, 15 to 30 | 62,000 | 25,000 | |
| 3, 30 to 45 | 217,000 | 100,000 | 75,000 |
| 4, 45 to 60 | 248,000 | 150,000 | 50,000 |
| 5, 60 to 75 | 372,000 | 250,000 | 100,000 |
| 6, 75 to 90 | 496,000 | 400,000 | 150,000 |
| 7, 88 to 110 | No ladder yet | 600,000 | 200,000 |

**How much more than a band's gold.** "Everything" here is both Tempering tracks and all six crafted pieces kept Hallmarked. It leaves out linings, the House, hero slots, training and refills, which all come out of the same purse.

| Band | Gold banked, measured before the income cut | After the cut (estimate, x0.7) | Tempering, both tracks | Six pieces, carried up by reforging | Everything | Against measured | Against the estimate | Six fresh Hallmarks in place of reforging |
|---|---|---|---|---|---|---|---|---|
| 15 to 30 | about 310k (estimate) | 217k | 124k | 150k (fresh, nothing to carry yet) | 274k | 0.9x | 1.3x | |
| 30 to 45 | about 965k (estimate) | 675k | 434k | 450k | 884k | 0.9x | 1.3x | 1.03M, 1.5x |
| 45 to 60 | 1.10M | 770k | 496k | 300k | 796k | 0.7x | 1.0x | 1.40M, 1.8x |
| 60 to 75 | 1.77M | 1.24M | 744k | 600k | 1.34M | 0.8x | 1.1x | 2.24M, 1.8x |
| 75 to 90 | 1.89M | 1.32M | 992k | 900k | 1.89M | 1.0x | 1.4x | 3.39M, 2.6x |
| 88 to 110 | not measured | about 3M (rough) | none yet | 1.2M | 1.2M | | 0.4x | 3.6M, 1.2x |

What the table says:

- With the income cut in place, gear alone asks 1.0 to 1.4 times a band's gold. Linings, the House and hero slots push every band well past that.
- If the cut is not live yet, three bands sit under 1.0 and a hero could buy everything there. The measured income needs re-running on the current build before anyone trusts either column.
- Tier 4 is the soft spot: 1.0 times. Its reforge step is only 50,000 because the tier 3 fee was set high. Leave it. Linings start mattering in that band and take up the slack.
- Tier 7 has no Tempering ladder, so it is the cheapest band until the Dawnsteel ladder is built.
- The labels: 1.10M, 1.77M and 1.89M are the board's measured figures. 310k and 965k are worked back from the Tempering shares and are estimates. The whole "after the cut" column is an estimate. The 3M is rough.

**The choices it forces.** Measured values are from the Slake at Level 57 and the Glade at Level 24.

| Choice | What it buys | Price at tier 4 |
|---|---|---|
| Tempering, Blows, 5 of 5 | +3.1 to +3.8% Level XP an hour (measured) | 248,000 |
| Tempering, Armor, 5 of 5 | 3.9 to 5.9% less damage (measured) | 248,000 |
| Stop a track at rung 3 | About three fifths of the gain for under a quarter of the gold | 56,000 |
| Carry all six pieces up | Keeps twelve perks at the new tier's size | 300,000 |
| Carry three, let three fall behind | Half the set stays current | 150,000 |
| A fresh Hallmark for one of the new tier's perks | A perk a carried piece can't have without a swap | 150,000 |
| Keep a guard lining up | 20 to 30% less of one element (measured 11-13) | Section 5 |
| Keep a leech lining up | Sustain without food (unmeasured) | Section 5 |

The rung prices double each step (8k, 16k, 32k, 64k, 128k at tier 4), so the last rung is half the track. That is where most heroes will stop short, and it is the cheapest place to save.

**Two heroes at Level 60, same gold.** Both banked about 770,000 in the 45 to 60 band (estimate). Neither can afford the 796,000 for everything, let alone linings.

| | The hammer who wants kills | The tank who wants to live |
|---|---|---|
| Tempering, Blows | 5 of 5: 248,000 | 3 of 5: 56,000 |
| Tempering, Armor | 2 of 5: 24,000 | 5 of 5: 248,000 |
| Crafted pieces | All six reforged: 300,000 | Three reforged: 150,000. One fresh Hallmark for a tier 4 perk: 150,000 |
| Linings | A leech lining kept up | A guard lining and a leech lining kept up |
| Left over | About 120,000 after the lining | About 15,000 after both |
| What it feels like | Hits about 3% harder, twelve current perks, eats more food | Takes about 5% less, shrugs off the ground's group spell, three perks a tier behind |

Two more things make heroes differ. The purse is shared by the whole account, so a player with four heroes decides which hero gets the gold. And every one of these can be bought later, so a hero who hunts a band longer than it needs ends up with more of it.

### Gold in, gold out, and trade

| Gold in | Gold out |
|---|---|
| Coin, loot sold, Tamsin's tasks | Hallmark and reforge fees, Tempering, lining fees, chest reforging |
| Crafted goods at the shop floor | Commission fees, bench fee, hero slots, the House, training, refills, Blessings, store supplies, market fee and cut |
| Good batch on food (small) | |

Weekly orders pay chips and salts, not gold. Salvage takes gold out indirectly, because a salvaged piece is a piece not sold. Sold gear as a share of income has not been measured.

| Trades | Doesn't |
|---|---|
| All gear, chest pieces, crafted pieces, gems, chips, patterns, materials, unfitted linings, gold-bought training items | Chest keys (Storage only), fitted linings, anything bought with Crowns |

**Reference values.** A tool works out a value for every item from its drop rows, kill rates and recipes. One guard proves that no chain of craft, salvage, good batch or commission ends in more shop gold than went in. It also feeds the market's suggested price.

**The market.** About 530 graded rows would mean 530 thin order books. The Weighhouse shows one book per piece, with the grade and perks as filters. The Hallmark step and commissions still let a player finish a piece with no market at all. Rolls, tradeable gems and tradeable patterns go in the Steam and legal review.

## 11. Build order

| Phase | What | Size | Money or server surface | Depends on |
|---|---|---|---|---|
| 0 | Drop homes and recipe cuts. Bench stats. Defense fix and Tower raise | | Yes | In flight |
| 1 | Fist engine pieces, then wraps at tiers 1 and 2 and two spells, measured | M | Yes | Phase 0 |
| 2 | Jewelry sample: Seam Jasper Band (rolls), Fang Studs with Steady and Focus hooked, a plain necklace and cloak, one pattern, the per-piece skill field, one reforge | M | Yes | Phase 0 |
| 3 | Gem chips. Set the fee rows. Salvage and the fourth loot destination. Reference values and the no-mint guard | M | Yes | Phase 2 |
| 4 | The other seven first-wave perk hooks. The Fine order | M | Engine | Phase 2 |
| 5 | Commissions: single jobs first, then bulk orders, on the escrow rules (held by the server, a time limit, resolves once) | M | Yes | Phase 2 |
| 6 | Linings: sockets, element guards, leech, wear by hunting time | L | Yes | The 11-13 spec |
| 6b | Necrotic and Storm in the engine: the two elements and their fixed rules, the Withered status, the Bone rune family, Air shown as Storm, the two guard linings. Then a sample of four spells, measured: the sword's pair and the wand's pair | M | Yes: runes, catalogues | Phase 6 |
| 6c | The other ten spells for the seven shipped families, one batch, measured against the sample. Bow and crossbow split | M | Yes | Phase 6b measured |
| 7 | Belts to crafting, with buckles | M | Yes | Phase 4 |
| 8 | Ladders for tiers 4 to 7, 20 rows a batch, each measured as a full set | L | Yes | Phases 3, 4, 7 |
| 9 | Good batch. Patterns. Weekly orders. Stirred grounds. House curing slots | M | Yes | Phases 2 and 3 |
| 10 | Chest reforging, fusing, the glove wing | M | Yes | The Catacombs build |
| 11 | The property hooks, spell change first. Krell's weapons as sidegrades. **Worn in, as a sample on those five weapons, measured before anything else gets ranks.** Morrow grounds to the grid, authored with region tables. The Ox Road's wall set to necrotic and the Old Guard's storm spell, as those grounds are built | L | Yes | Phases 0, 6 and 6b |
| 12 | Fist tiers 3 to 7 and its Tower rows, **and its two spells, Live Hand and Draw** | L | Yes | Phase 1 measured, phase 6b |

Every "Yes" is on the pre-EA Security list.

## 12. Every audit finding and its resolution

### Tyler's five roadmap findings

| # | Finding | Resolution |
|---|---|---|
| 1 | Weapon coverage doesn't fit | Three weapons on the last two grounds, two on the call-out boss. 16 weapons, 30 armor pieces, gridded |
| 2 | Late chest odds too long | Base stays 2%. Fusing added. Waits tabled |
| 3 | Accessory cap against the measured ring | The cap is the step between tiers. Belt is crafted |
| 4 | Recipes against patterns | Eight patterns for ten worn recipes, one belt pattern for three weights, 14 staples open by material |
| 5 | Fist benchmark | Measured alone and in a four. Fails solo, passes fill. New targets set |

### The first review (C1 to C11 and its holes)

| # | Finding | Resolution |
|---|---|---|
| C1 | 12 slots, crafting owns 4 | 14 slots, 6 crafted |
| C2 | A ten-perk pool fixes nothing | 22 perks for 12 seats, slot pools |
| C3 | Gems that force perks slots can't hold | No gem forces a perk |
| C4 | All jewelry at Crafting | Rings and earrings at Smithing |
| C5 | Hallmark at 30 | The next tier's skill level |
| C6 | Tier 3 ring from gold | Steel at tier 3, gold at tier 4 |
| C7 | Fists in phase 8 | Phase 1 |
| C8 | Tower at 0 to +2.7% | Raised in lane/d-defense-tower |
| C9 | Eight families | Seven. Fists would be the eighth |
| C10 | Good batch moves no gold | It adds a little through food. Stated |
| C11 | Two Trollhide cloaks | One, at tier 7 |
| Hole | Gloves and belt are Rares only | Belt crafted. Gloves get the Catacombs wing |
| Hole | About 25 unplaced rows | Section 4 table |
| Hole | Seam Jasper has no rows | First row of the phase 2 build |
| Hole | Warrens parts used twice | Cloaks use common drops, linings use parts |
| Hole | Smithing and Runecrafting dead stretches | Section 8 |
| Hole | Piles of plain rings | The Fine order, and melting |

### The second audit (P0 to P3)

| # | Finding | Resolution |
|---|---|---|
| P0 | Reforging kills upper gems and skill gates | A reforge needs the new tier's gem and Hallmark skill. Perks gated at tiers 4 and 6 |
| P0 | Fees over 100% of a band | Tyler 11-18: the over-ask is intended. Prices stay as ruled. Section 10 shows the size of it and the choices it forces |
| P0 | The 8% limit against the measured ring | The cap is the step. Sizes for tiers 2 to 7 written down |
| P1 | Gem supply | Chips, 10 to a gem, paced to the band. Three old prizes cut into gems. War Crown left out |
| P1 | No commission | Section 4 |
| P1 | Build order and hooks | Phase 2 is rings plus earrings with their hooks. Nine hooks in the first wave |
| P1 | Tower weapons retire drops | The sidegrade rule. Six keys a reforge. What drops are still for, stated |
| P2 | The Fine chase and the melt loop | One standing order. Melting gives no XP |
| P2 | Three answers to the cloak problem. Forager | Linings own elements. Four new cloak perks. Forager cut |
| P2 | Tusker Charm, Houndskin, bars dropping | Tusker Charm off the ladder. Houndskin to Crafting 15. Rule 6 now names ore, and common bars may keep dropping on old grounds |
| P3 | The fist budget doesn't add up | The promise is gold and comfort, with XP within 15% |

### Ideas from the second research pass (11-18)

| Idea | Call | Why |
|---|---|---|
| Worn in uniques | Sample of five in phase 11 | A choice on dropped gear that costs time, not gold. Small by rule |
| Shared-work commissions | Merged into Commissions as the bulk order | The same board with the work split into units |
| Studies: Bestiary points pin a bonus to one monster | Parked for the Bestiary deep dive | The Bestiary's reward is undecided (Tyler 11-11) and nothing is built on it until then. Limit to carry over: common and uncommon rows only, never a Rare, gem or trophy. Moving one costs gold by ground tier |
| House curing slots | Kept as a gold sink (Tyler 11-18: "We can do this, just make it a gold sink") | Section 5, House curing. The town choice stays because the hero still spends its own town hours on everything else, and every slot and every cure costs gold |
| Wanted and unwanted lists on weekly orders, loot-line bonus reasons, tool wear, Town Works recipe unlocks | Rejected by Tyler 11-18 | |

## 13. Questions for Tyler, and his answers (2026-11-18)

| # | Question | Answer | What it changes |
|---|---|---|---|
| 1 | The 75% budget and its three price cuts. OK? | **No.** "I actually dont want everyone to be able to easily unlock everything and upgrade everything. otherwise its not really a gold sink it's just a natural line of progression. I want people to make choices on what is important to them, so each character isn't exactly the same." | The budget is gone. Tempering stays as built. Hallmark fees 150k / 250k / 400k / 600k. Reforging at the fee difference. Section 10 rewritten |
| 2 | Past tier 7 the hourly drop becomes crafting stock and gem chips | **Yes** | As written |
| 3 | After 99: a maker's mark per region, or lift the cap? | **The mark** | As written |
| 4 | Two-attribute chest pieces from the Level 200 key, 1 in 4, then half from 300 | **Yes** | As written |
| 5 | A fourth element, and when? | **Two: "I want to add Necrotic and Storm and i want each weapon type to have a spell for both."** | Storm burns mana, as designed. Necrotic cuts healing. Chains stay a boss trick. 16 spells, one of each for all eight families. Necrotic arrives on the Ox Road and lives in the Catacombs. Storm arrives on the Old Guard and lives in region 5 |
| 6 | A chest reforge burns 6 keys and one open | **Yes** | As written |
| 7 | The fist promise: best lone gold, comfortable, within 15% on XP | **Yes** | As written |
| 8 | About 55 Levels and six grounds a region, to 400 | **Yes** | As written |
| 9 | Do linings wear out? | **Yes, 12 hours of hunting, "but they can stack hours"** | Section 5: 12 hours each, same kind adds hours, cap 48 |
| 10 | Leave out Tempering carryover | **"Sure"** | Left out |
| 11 | Salvage lowers banked gold | **Yes** | As written |
| 12 | A quiver as the bow's off-hand, uniques past tier 7 | **Yes** | As written |

Nothing is open. Tyler confirmed the 48-hour lining cap on 11-18. Still his to name: the rune families (Air shown as Storm, an eighth family, Bone), Appendix B.

## 14. What is measured and what isn't

| Kind | What |
|---|---|
| Measured | A hunting hour on every open ground. Weapon, armor, Tempering, skill and ring steps. The whole accessory loadout on five grounds. The fist proxy alone and in a four |
| Counted | Chest waits (20,000 trials a cell). The Morrow grid. Pattern and recipe counts |
| Built, read from data | 14 slots, roll odds, perk sizes and fees at tiers 2 and 3, Hallmark levels 30 and 45, Tempering prices, the chest's luck rules, Gold Rock at Mining 45 |
| From other lanes | Banked gold per band, linings strengths, the Tower's new power rule and its +3 to +10% |
| Estimates | Post-cut gold (x 0.7), the 88 to 110 band's gold, hours past Level 200, the row count, uniques a hero sees |
| Proposed, unmeasured | 19 of 22 perks, sizes at tiers 4 to 7, every new piece and gem, chips, commissions, reforging, fusing, the glove wing, Krell's sidegrades, the fist's new numbers, everything about regions 4 to 7, worn in (ranks, hours, sizes, the re-pick fee), bulk orders |
| Runs thrown out | The first Pyre Field Tempering rows (wrong tier, re-run). The Hold's Tower row (wrong tier compared) |
| Not played by hand | A jewelry roll, a Tempering purchase, a mid-game craft |
| Not checked | Proposed names aren't checked free. lane/d-drop-homes and lane/d-defense-tower weren't opened. Four of the five champion relics weren't read. The linings spec was read in summary only |

---

## 15. Luck (PROPOSAL v3, designer 2026-11-20 after Tyler's "almost exactly like gw2's"; awaiting Tyler; nothing built)

Asked by Tyler 2026-11-19 ("permanent magic find buffs"). 11-20: "the bestiary only counts per account" and "a similar system that luck I gained from other sinks like salvaging instead of selling (like gw2)". 11-20, newest: "for salvaging, i was considering a system almost exactly like gw2's where i dont think there is a cap". The staged rule is `tools/balance-sim/staged/luck.js`. It is measured with `tools/balance-sim/staged/luck-measure.mjs`. v2 is in git (3a5e9a95d), v1 at 5db6a058.

**A fact check on GW2.** GW2 does stop. Account magic find from luck ends at 300%. The first percent costs about 100 luck, a percent costs 30,000 from step 218 on, and the whole bar is about 4.3 million luck. It is so far out that it plays as uncapped, which is the part worth copying. v3 does the same: one far stop that no measured life gets near.

**Pitch.** Your account has one Luck bar that only fills. Salvage gear your hunts dropped instead of selling it and the bar fills. Reach a Bestiary stage and it fills. Every time it fills, your Magic Find goes up 1% and the next percent costs more. Magic Find makes Rare drops come more often, on every ground, for every hero you have. Nothing sells it.

**Purpose.** Problem: hour 2,000 on a ground plays like hour 2, the Bestiary pays nothing (undecided since 11-11), and gear you don't wear is only shop gold. Decision: per item, gold now or Luck forever, set once in the loot plan. Later, per unique: wear it, sell it to a player, or salvage it. Plugs into kill counters, loot bands, the loot plan and Dispatch, salvage, the sheet and the return card. Tradeoff: an account that salvages everything gives up about a fifth of its hunting gold. Hour 1,000: the next percent is always there and always dearer.

**What changed from v2**

| | v2 | v3 |
|---|---|---|
| Ceiling | +25%, shared by both feeds | No near ceiling. A far stop at +100% that no measured life comes close to |
| Shape | 25% x Luck / (Luck + 150) | Whole percents. Percent n costs 100 x n x n Luck |
| Salvage pays | The shop's price of the piece, as progress | Luck by the piece's tier and band (the table below) |
| The Bestiary | +1 Luck a stage, its own line | A lump of Luck a stage, into the same bar |
| Trophy rows | Same +25% as Rares | Their own lower ceiling, +25%, approached and never reached |
| In a party | The killer's Luck | The party's average Magic Find |
| Player's name for it | Luck | Luck is what you earn. Magic Find is what it gives |

**The formula**

| | |
|---|---|
| Luck | One total per account. Raise-only. Salvage Luck plus Bestiary Luck |
| Magic Find | Whole percents. You hold percent n once Luck reaches 100 x (1 + 4 + 9 + ... + n x n) |
| On a Rare row | Chance x (1 + Magic Find / 100) |
| On a Trophy row | Chance x (1 + 0.25 x MF / (MF + 25)). At Magic Find 25 that is +12.5%. It never reaches +25% |
| Far stop | Magic Find 100, at 33.84 million Luck |
| Never moves | Commons, Uncommons, Scarce gear, keys, chips, Krell's daily prize, the Hearth Chest, Hearthfinds, coin, XP. No Luck gear, perk, food, event, premium perk or store item |
| In a party | The roll uses the average Magic Find of the heroes there. Four heroes of one account all have the same number |

**What salvaging gives (the essence table)**

| Piece | Tier 1 | 2 | 3 | 4 | 5 | 6 | 7 | Unique past tier 7 |
|---|---|---|---|---|---|---|---|---|
| Standard (the hourly drop) | 2 | 4 | 6 | 8 | 10 | 12 | 14 | |
| Rare | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 50 x its band: 400 at band 8, 900 at band 18 |

- Two Luck a tier keeps the price of Luck flat. A standard piece sells for about 30 / 60 / 105 / 137 / 173 gold at tiers 1 / 2 / 4 / 5 / 6 (measured), so a point of Luck costs 13 to 15 gold of shop money at every tier. No tier is the cheap one to farm.
- A Rare is worth five standard pieces. A Rare nobody wants has a floor, its Luck, and every one salvaged leaves the market.
- Past tier 7 the hourly drop is stock and chips (ruled 11-18), so uniques are the only gear and the only salvage feed. That is why one is worth so much.
- No essence item. GW2 hands you essences to click. Here the Luck goes straight on the bar, because an item that can't be traded and has one use is a click with no decision in it.
- Salvage still pays the plan's crafting stock (section 5). Luck is on top.

**What the Bestiary gives**

| Account kills of one creature | 100 | 500 | 2,500 | 10,000 | 40,000 | 160,000 |
|---|---|---|---|---|---|---|
| Luck, paid once | 50 | 150 | 500 | 1,500 | 5,000 | 15,000 |

Merged into the one bar, and that is the designer's call. One number is easier to read than two, and the Bestiary is already limited by how many creatures exist. It is the feed for a player who sells everything: Magic Find 8 at 500 hours on kills alone (measured). The counts stay per account, one count a kill whichever heroes were there (ruled 11-20).

**The curve**

| Magic Find | This percent costs | Luck so far | A 10 h Rare comes every | A 125 h Trophy comes every |
|---|---|---|---|---|
| 1 | 100 | 100 | 9.9 h | 124 h |
| 5 | 2,500 | 5,500 | 9.5 h | 120 h |
| 10 | 10,000 | 38,500 | 9.1 h | 117 h |
| 15 | 22,500 | 124,000 | 8.7 h | 114 h |
| 20 | 40,000 | 287,000 | 8.3 h | 113 h |
| 25 | 62,500 | 552,500 | 8.0 h | 111 h |
| 30 | 90,000 | 945,500 | 7.7 h | 110 h |
| 40 | 160,000 | 2.21M | 7.1 h | 108 h |
| 50 | 250,000 | 4.29M | 6.7 h | 107 h |
| 100 | 1,000,000 | 33.84M | 5.0 h | 104 h |

Eight times the Luck is twice the Magic Find. That is what keeps four heroes from being four times as lucky.

Why a far stop at all: a guard has to prove that no row ever passes its bound, and it can only prove that against a finite top. Where it sits: the hardest-playing account modeled (four heroes, 5,000 hours each, salvaging everything) holds 8.5 million Luck of the 33.84 million. At that pace the stop is about three more years of all four heroes hunting 12 hours a day. Nobody will see it. A Trophy keeps Tyler's 10-19 promise at any Luck: never faster than every 100 hours.

**The safeguard**

| Rule | Value |
|---|---|
| The allowance | Salvage pays Luck on at most as many of an item as the account's own hunts have dropped: found minus already salvaged for Luck, kept by the server per account and item |
| What adds to found | Only a hunt's settle, when it pays a gear piece to one of the account's heroes |
| What doesn't | Bought, traded, crafted, store and chest pieces. They still salvage for stock, with no Luck |
| The invariant | Luck from salvage can never be more than the Luck of the pieces your own hunts dropped. Gold and Crowns can swap which copy you salvage. They can't raise the total |
| The amount | The server reads the Luck from its own table. The client sends an item and a count, never Luck |
| Deleting a hero | Never lowers Luck, kills or found |
| Scaled hunts | A scaled early hunt drops more low-tier pieces for a fee. Low tiers pay little Luck. To be measured before scaled hunts and Luck are both live: Luck an hour there must stay under the advised ground's |
| Stamina refills and premium | They buy hunting time, and time earns Luck the way it earns XP. Nothing buys Luck itself |

**On screen** (labels, not sentences)

| Where | Text |
|---|---|
| Sheet | "Magic Find +16%" and under it the bar "Luck 12,400 / 28,900" |
| Its tooltip | "Rare drops come 16% more often. Salvage gear your hunts dropped or reach Bestiary stages to earn Luck." |
| Loot plan, per item | Keep / Deposit / Sell / Salvage. Beside Salvage: "+12 Luck". Beside Sell: "173 gp" |
| Loot plan, one switch | "Salvage all standard gear" so a new tier's pieces need no new choices |
| A piece past the allowance | "No Luck: bought or crafted" |
| Dispatch result | "Salvaged 41. +492 Luck" |
| Return card | "Magic Find 15% to 16%" |
| Bestiary stage | "Stage 3: +500 Luck" |
| A Rare that Magic Find caused | "Lucky find" on the reveal |

**Walk-through** (each step against what exists)

| Step | The player has | Needs | Exists today |
|---|---|---|---|
| 1. Hunt | A hero on any ground | Gear drops | Yes: 164 Scarce and 89 Rare gear rows on the 11 open grounds |
| 2. Set the plan | A dropped piece in the bag | A Salvage choice in the loot plan | The plan exists (`hr_loot_rule_set`: keep, deposit, sell, ignore). Salvage is new |
| 3. Dispatch in town | Planned pieces | Dispatch applies the plan | Dispatch exists (tests/loot-dispatch.mjs). The salvage arm is new |
| 4. Luck is paid | Found count for that item | Server counts found at the settle | New |
| 5. Read it | | Sheet line and bar | New |
| 6. Next hunt rolls with it | Magic Find 1 or more | drops.js reads it | New, inside `effectiveDropChance` |

Bench salvage (section 5) is not built either. The Luck half can ship before stock exists: Salvage then pays Luck only.

**Measured.** Played lives on advised grounds, real engine. The built game ends at Krell's Hold, so a long life stays there and standard tier 6 gear keeps dropping. Hours are hours each hero has hunted. Rares and gold are one hero's share.

One hero, a lone hammer. Played to 5,000 hours.

| Hours | 50 | 500 | 2,000 | 5,000 |
|---|---|---|---|---|
| Level | 30 | 95 | 192 | 295 |
| Luck: Bestiary + salvage | 4k + 5k | 23k + 130k | 56k + 755k | 101k + 2.08M |
| Magic Find, selling everything | 4 | 8 | 11 | 13 |
| Magic Find, salvaging half | 5 | 13 | 22 | 31 |
| Magic Find, salvaging everything | 6 | 16 | 28 | 39 |
| Rares an hour: today / selling / salvaging all | 0.99 / 1.03 / 1.04 | 0.88 / 0.95 / 1.01 | 0.95 / 1.06 / 1.21 | 0.98 / 1.11 / 1.36 |
| Rares so far: today / selling / salvaging all | 44 / 45 / 46 | 561 / 597 / 623 | 1,959 / 2,132 / 2,341 | 4,876 / 5,427 / 6,261 |
| Gear found an hour | 33 | 28 | 31 | 32 |
| Its shop gold an hour (share of coin and sold loot) | 1,962 (20%) | 4,819 (22%) | 5,223 (22%) | 5,397 (22%) |
| Gold given up so far, salvaging everything | 75k | 1.48M | 9.14M | 25.1M |
| The next percent costs, in Luck | 4,900 | 28,900 | 84,100 | 160,000 |

Four heroes of one account in one hunt, on Deadly (tank, hammer, mage, healer). Played to 2,028 hours. The 5,000 column is projected: the life's last 200 hours lived again.

| Hours | 50 | 500 | 2,000 | 5,000 (projected) |
|---|---|---|---|---|
| Level | 42 | 130 | 245 | |
| Luck: Bestiary + salvage | 8k + 31k | 62k + 677k | 127k + 3.05M | 142k + 8.02M |
| Magic Find, selling everything | 5 | 11 | 15 | 15 |
| Magic Find, salvaging half | 8 | 22 | 36 | 49 |
| Magic Find, salvaging everything | 10 | 27 | 45 | 62 |
| Rares an hour a hero: today / selling / salvaging all | 2.64 / 2.77 / 2.88 | 0.97 / 1.08 / 1.23 | 1.03 / 1.18 / 1.48 | 1.03 / 1.18 / 1.65 |
| Rares so far a hero: today / selling / salvaging all | 60 / 63 / 65 | 551 / 598 / 654 | 2,067 / 2,329 / 2,736 | 5,152 / 5,877 / 7,487 |
| Gear found an hour a hero | 35 | 26 | 28 | 28 |
| Its shop gold an hour a hero (share of coin and sold loot) | 2,635 (25%) | 4,178 (20%) | 4,414 (20%) | 4,414 (20%) |
| Gold given up so far a hero, salvaging everything | 95k | 1.88M | 8.39M | 21.6M |
| The next percent costs, in Luck | 12,100 | 78,400 | 211,600 | 396,900 |

Four heroes hunting apart (projected: the lone life counted four times): Magic Find 9 / 25 / 45 / 63 salvaging everything, 6 / 12 / 16 / 16 selling.

- Rolled check, measured: the lone life to 1,000 hours with Luck in the real roll dropped 1,217 Rares against 1,065 today. Income and Level were identical.
- Four heroes hold four times the Luck and about 1.5 times the Magic Find (62 against 39 at 5,000 hours).
- Lifetime supply: an account that salvages everything from day one has found 28% more Rares by 5,000 hours (6,261 against 4,876). One that sells everything, 11% more.
- Room: the lone life reaches the last Bestiary stage on 3 of 52 creatures, and only because it sat on one ground for 4,000 hours.

**What it does to the economy**

| Question | Answer | Label |
|---|---|---|
| What salvaging costs | Gear is 20 to 22% of a lone hero's coin and sold loot. Salvaging all of it gives that up: 5,400 gold an hour late, 25.1M over 5,000 hours | Measured. An upper bound: salvage's stock is counted as worth nothing |
| What it costs a four on Deadly | Their store bill is about three quarters of what they earn (79M of 105.7M a hero over the life) and gear is a fifth. Salvage all of it and about 5% is left | Measured |
| Gold an hour from Magic Find | Almost none through the shop. Rares are 0.4% of sold value (446k of 116.9M). Magic Find 39 adds about 0.15% | Measured |
| So what is a percent worth | Whatever players pay each other for Rares and uniques. At Magic Find 16 the next percent costs 28,900 Luck, about 415k gold of gear, for one more Rare every 100 hours or so | Measured cost. Market prices unknown |
| Market supply of Rares | Up by each account's Magic Find, weighted by hours. If the average hunting hour on a server is at Magic Find 15, there are 15% more Rares | Projected. No population model |
| What pulls supply back | Salvaged Rares leave the market. An account at Magic Find 39 that salvages 28% of its Rares adds nothing to supply | Computed |
| Faucet | Salvage is a gold sink by choice: up to a fifth of hunting income never gets minted | Measured |
| Rares stay rare | The highest case (63, four heroes apart, projected) turns a 10 to 20 hour Rare into a 6 to 12 hour one, after 20,000 hero-hours. A lone all-in player at 500 hours sees 8.6 to 17 hours | Measured |
| Trophies stay moments | 125 h becomes 108 h at Magic Find 40. Never under 100 h | Computed from the formula |

**The planned game past tier 7 (assumed, not measured).** From about 800 hours the hourly gear ends and uniques are the feed. Using the plan's own estimates (a unique every 2 hours a hero, a new band every 364 hours, a quarter of uniques kept), a lone hero who salvages the rest holds Magic Find 25 at 2,000 hours and 36 at 5,000. Salvaging half of the rest: 20 and 29. Four heroes apart: 40 and 60. About the same as the built game, which is the point of the 50 x band number. Re-measure when the Morrow Hills pack is played.

**What the references say** (public repos, formulas and structure only, nothing copied)

| Game | Source | What it does | Taken |
|---|---|---|---|
| Guild Wars 2 | Physe-0/GW2_Magic_Find_Leveling_Cost_GUI, `Magic_Find_Req_Luck.py` | 300 steps of 1%. A step costs 100 luck early, 30,000 from step 218. 4.33M in all by that file | One account bar, salvage feeds it, each percent dearer. Not the flat tail |
| Diablo II | yqlu/d2r-dropplot, `src/engine/rarity.ts` | Effective MF = MF x F / (MF + F). F is 250 for uniques, 500 for sets, 600 for rares. The rarer the class, the lower its ceiling | The Trophy formula |
| Path of Exile | PathOfBuildingCommunity/PathOfBuilding, `src/Modules/CalcPerform.lua` | Rarity and quantity are separate stats. Every source adds into one sum | Luck is rarity only. Both feeds are one total |
| rAthena | rathena/rathena, `src/map/mob.cpp`, `mob_getdroprate` | One function owns the final rate. Bonuses add, the cap comes last, and the killer's stats are used | One home in `effectiveDropChance`, under its 0.95 bound. Not the killer rule: last-hit Luck makes parties arrange who lands the kill |

**The cuts, kept.**
- The class charm ladder. `charmDropMultFor`, `trophyDropMultFor`, `memoryDropMult` and `member.relicMult` have no caller. Cut `bestiary-charms.js`, `charms.js` and those four. Luck is the Bestiary's reward now.
- The four foods' drop buffs: Cooked Lobster 3%, Goldgill Steak 2%, Tomato Soup 2%, Wheat Bread 1%. A food is bought with gold, so a drop buff on a food is gold turned into drop rate, which is the one thing the safeguard exists to stop. It would also multiply with Magic Find. Give the four another buff.

**Changes to this plan**

| Section | Change |
|---|---|
| 1 | New row: Luck and Magic Find, the Bestiary's and salvage's reward |
| 3 | Rare paces are quoted at Magic Find 0. `loot-bands.js` trophy `boostMax 1.25` becomes the Trophy ceiling |
| 5, Salvage | Add the Luck table, the allowance and the fifth loot plan choice. Stock must stay worth less than the shop price |
| 6 | The chest ignores Luck |
| 10 | Luck doesn't trade. Salvage is a measured sink: up to 22% of hunting income, by choice |
| 11 | Bestiary half: phase 2b. Salvage half: with phase 3, or sooner as Luck only |
| 12 | "Studies" (parked) is closed by this |

**Build** (for a systems lane, after Tyler's word)

| Lane | Files | Work | Tests |
|---|---|---|---|
| C, backend. One migration | `supabase/migrations/<date>-luck.sql` | Tables `account_kills (user, monster, kills)`, `account_found (user, item, found, salvaged)`, `account_luck (user, luck, from_kills, from_salvage)`, all raise-only, RLS per user. The settle (`hr_hunt_apply_instance` / `hr_hunt_apply_member`) writes one count a kill per account, pays stage Luck when a count crosses, and adds to found when it pays a gear piece. `hr_loot_rule_set` takes `salvage`. Dispatch pays Luck on min(count, found minus salvaged) from the server's own Luck table. `hr_state_of` projects luck, magic find and the next cost. Every Luck movement in `player_ledger` | Section 4 self-check: a forged count or item pays nothing extra, a bought piece pays 0, totals never drop, a deleted hero changes nothing, only the settle writes kills and found. `schema-drift` replay. `restore-census` re-pin. Client RPC baseline unchanged except the rule value |
| Engine, systems | `src/data/luck.js` (from the staged file), `src/core/luck.js`, `src/core/drops.js`, `src/core/hunt-rewards.js`, `src/core/member.js`, generated catalogue for the edge | `effectiveDropChance` takes `mods.magicFind` and applies it to Rare and Trophy rows only. `payDrops` passes the party's average, frozen per settle from the server's own rows, and flags `lucky` when the draw landed between the base chance and the raised one. One draw a row as today, so seeded replays match at Magic Find 0 | `tests/luck.mjs` with mutants: curve, rank math, Trophy never under 100 h, far stop. `drop-tables` at Magic Find 0 and 100. `settle-drop-bounds` at 100. Both paths: a hunt at Magic Find above 0 viewed, and the same seed with the browser closed, must pay the same drops. Stage Luck paid by a hunt that ends with the browser closed. Edge deploy |
| The cuts | `src/data/bestiary-charms.js`, `src/core/charms.js`, `src/core/trophies.js`, `src/core/member.js`, `src/data/items.js` (four buffs) | Remove the dead ladder and its four functions. Swap the four food buffs | `bestiary-ladder`, `bestiary-trophy`, `catalogue-coherence`, `dead-exports` |
| B, client and Art Director | Sheet, loot plan, Dispatch result, return card, Bestiary window, reveal tag, text home | The lines in "On screen". Every number from the envelope. Buttons off until the server confirms | `loot-dispatch` salvage arm, `text-home`, visual gate |

Security: Luck is a ranked, account-wide surface. It goes in the one pre-EA review with the allowance as its main target.

**For Tyler**
1. The size. One dial, the 100 in "percent n costs 100 x n x n". As staged: a lone all-in player is at +16% after 500 hours and +39% after 5,000. A four-hero account is at +27% and +62% (the 5,000 hour figure is projected). Say if that is too fast or too slow.
2. The price. Salvaging everything costs about a fifth of hunting gold, and a Deadly four keeps about 5% of its income if it salvages everything. That makes it a real choice and a real sink. Say if you want it cheaper (more Luck a piece).
3. Premium. Its 12 hour stamina means half again the hunting time, so half again the Luck a day. Nothing sells Luck itself and nothing in the Crowns store should. Your call, it's money.
4. The cuts: the dead charm ladder and the four foods' drop buffs.
5. The far stop at +100% and the Trophy ceiling at +25% are the designer's calls. Move either with one number.

**Was (v2, measured 11-20, one +25% pool).** Lone hammer at 500 h: Luck 88 from kills + 139 from salvage, +15.0% (kills only +9.2%), 1.48M gold of gear given up. Four in one hunt at 500 h: 120 + 318, +18.6%. Rolled lone life: 596 Rares became 667. v3 at the same 500 hours gives +16% and +27%. A lone hero's first 500 hours play the same. A four gets more, and the gap grows after.

**Measured, projected, assumed.**
- Measured: the lone life to 5,000 hours (kills by creature, gear found, shop prices, income, store bill). The four-hero life to 2,028 hours. The rolled lone check to 1,000 hours.
- Projected: The four-hero life from 2,028 to 5,000 hours (its last 200 hours lived again). The four-apart row (the lone life counted four times). The half-salvage row (the same life, half the gear).
- Assumed: salvage's stock is worth nothing, so gold given up is an upper bound. The planned game past tier 7 (unique pace, band pace, a quarter kept). Rare and unique market prices. No population model behind market supply. Scaled hunts not played. A player farming old grounds for cheap stages not played. Past Level 110 the measured lives sit on Krell's Hold, which no real player would for 4,000 hours. No screen exists.

# APPENDIX A. Answers to Tyler's five roadmap findings

## Finding 1. Weapon coverage in the Morrow Hills

The template was wrong: two weapons a ground gives 12, and two appearances per family needs 14 (16 with fists). Fix: the two late grounds carry three weapons each, and the call-out boss carries two.

**Weapon grid** (S sword, H hammer, A hatchets, B bow, X crossbow, St staff, W wand, F fists)

| Ground, Levels | Weapons | Count |
|---|---|---|
| Carter's Rest, 110 to 125 | H (Brewer's Ladle, designed), S | 2 |
| The Ox Road, 112 to 128 | A, X | 2 |
| The Night Shift, 122 to 140 | F, W | 2 |
| Wyvern Roost, 125 to 142 | B, St | 2 |
| The Roost Mother (call-out boss, at the Roost) | B, F | 2 |
| The Old Guard, 138 to 155 | W, St, X | 3 |
| The Bellows, 145 to 165 | S, H, A | 3 |
| Father Gault (final boss) | None | 0 |
| **Total** | | **16** |

| Check | Result |
|---|---|
| Every family appears twice | Yes, 8 x 2 = 16. Without fists 14: drop F from the Night Shift and the Roost Mother |
| Every family has a first unique by Level | 125 |
| Every family has its second unique before Gault | Yes. Gault carries no weapon |
| Longest wait between a family's two uniques | Sword and hammer, 110 to 145. The Tower's key at 130 sits in that gap |
| Which boss drops count | The Roost Mother counts (a call series, repeatable, mid-region). Gault's pieces never count as a first appearance |

**Armor and off-hand grid.** 15 armor cells (helmet, body, legs, boots, gloves in plate, leather, cloth) plus shield and spellbook: 17 cells.

| Source | Pieces |
|---|---|
| Carter's Rest | Legs plate, gloves leather (Slater's Mitts), boots cloth (Carter's Boots), shield (Stable Door) |
| The Ox Road | Helmet plate, body leather, legs cloth, spellbook |
| The Night Shift | Body plate, boots leather, gloves cloth, gloves plate |
| Wyvern Roost | Boots plate, legs plate (Burnt Crag Leg Plates, fire: the Roost's wall answer), helmet cloth |
| The Roost Mother | Helmet leather (Eggshell Cap), legs leather (Roost Mother's Hide), body cloth |
| The Old Guard | Helmet plate, boots leather, body cloth, spellbook |
| The Bellows | Body plate, helmet leather, legs cloth, shield |
| Father Gault | Gloves cloth (Furnace Mitts), boots plate, body leather, legs leather |

| Check | Result |
|---|---|
| Pieces | 30 |
| All 17 cells covered once, by Level | 142 |
| Cells with a second piece | 13 of 17 |
| Cells with one piece only | Helmet cloth, boots cloth, gloves plate, gloves leather. The Catacombs chest covers helmets, boots and gloves |
| Region total | 46 uniques: 16 weapons, 30 armor and off-hand |
| Rows a ground | 5 to 7 uniques, still under 20 new rows a ground |

Template change: two weapons a ground, three on a region's last two grounds, two on the call-out boss, none required on the final boss.

## Finding 2. Late chest odds

`node tools/balance-sim/chest-odds.mjs`, 20,000 trials a cell, the chest's built rules: 6 opens a week, warmth +4% of base per dry key up to 3x, a stoke of x1.7 for three keys' worth of Cinders. Weeks, **median / 90th percentile**.

| Key | Base | Any piece, no stoke | Any, stoking | THE piece, lone, stoking | THE piece, four heroes | THE two-attribute piece, lone | Same, four heroes | Two-attribute by fusing, lone | Same, four heroes |
|---|---|---|---|---|---|---|---|---|---|
| Bronze (built) | 16% | 1 / 2 | 1 / 2 | 2 / 4 | 1 / 1 | | | | |
| Silver (built) | 8% | 2 / 4 | 2 / 3 | 3 / 6 | 1 / 2 | | | | |
| Gold (built) | 4.5% | 3 / 6 | 2 / 5 | 4 / 10 | 1 / 3 | | | | |
| Platinum (built) | 2% | 4 / 10 | 4 / 8 | 7 / 18 | 3 / 6 | | | | |
| Roadmap as written, 200 to 300 | 1.5%, 1 in 5 two-attribute | 5 / 12 | 5 / 10 | 8 / 21 | 3 / 7 | **35 / 114** | 10 / 31 | 11 / 22 | 4 / 7 |
| Roadmap as written, 300 to 400 | 1%, half two-attribute | 7 / 16 | 6 / 14 | 10 / 29 | 4 / 9 | 19 / 59 | 7 / 17 | 13 / 30 | 5 / 10 |
| **New proposal, 200 to 300** | 2%, 1 in 4 | 4 / 10 | 4 / 8 | 7 / 17 | 3 / 6 | 23 / 73 | 7 / 20 | **9 / 18** | 3 / 6 |
| **New proposal, 300 to 400** | 2%, half | 4 / 10 | 4 / 8 | 7 / 17 | 3 / 6 | 12 / 36 | 4 / 11 | **8 / 18** | 3 / 6 |
| Catacombs armor, proposal, 200 to 300 | 2%, 1 in 4 | 4 / 10 | 4 / 9 | 9 / 26 | 3 / 8 | 32 / 103 | 10 / 29 | 10 / 25 | 4 / 8 |

"THE piece" is your weapon family (half of paid weapons) or, in the Catacombs, your wing's slot in your weight (35%). "Four heroes" is one account with four heroes at that depth, their Cinders passed to one; it also stands in for buying from other players.

| Dial | Roadmap v1 | Now | Why |
|---|---|---|---|
| Base chance late | Falls to 1.5%, then 1% | Stays 2% forever | At 1% the wanted two-attribute piece was 35 weeks median, 114 at the 90th |
| Two-attribute share | 1 in 5, then half | 1 in 4, then half | |
| Fusing (new) | | Two one-attribute pieces of the same band, one of them the kind you want, plus one open, make the two-attribute piece | Turns duplicates into progress. Median 8 to 9 weeks lone, 18 at the 90th |
| Reforging | 1 open | 1 open, 6 keys of the new tier, gold | Sets the floor: with last band's piece in hand, this band's is about a week away. From nothing, Bronze to Platinum is about 2 weeks for the Bronze piece plus 3 weeks of steps, against 7 median and 18 at the 90th by luck |

## Finding 3. The accessory power target, and the belt

`itemization-table.mjs sets`, 3 seeds x 3 h, lone on Normal. "Bare" = no ring, necklace, earrings or cloak.

| Level, way | Weapon one tier behind | One Hallmarked ring | Two Hallmarked rings | The five buildable today | The catalogue's plain five of this tier | Step from last tier's plain five |
|---|---|---|---|---|---|---|
| 24 hammer | -9.3% | +3.9% | +6.4% | +8.7% XP, 12% less damage | +6.9% | |
| 24 tank | -5.9% | +9.3% | +13.8% | +18.3%, 12% less | +15.2% | |
| 24 mage | -6.8% | +3.4% | +7.2% | +7.6%, 17% less | +4.8% | |
| 42 hammer | -8.4% | +5.3% | +7.8% | +10.7%, 9% less | +16.5%, 15% less | +7.3% |
| 42 tank | -8.0% | +6.1% | +15.7% | +17.0%, 8% less | +23.7%, 13% less | +9.2% |
| 42 mage | -9.1% | | | +10.5% | +0.9% | |
| 57 hammer | -3.4% | | | +6.1%, 8% less | +12.0%, 14% less | +4.5% |
| 57 tank | -5.9% | | | +8.5%, 11% less | +19.5%, 18% less | +6.0% |
| 57 mage | -5.4% | | | +5.3%, 17% less | +0.8% | |
| 80 hammer | -7.2% | | | +4.9% | +8.7% | 0 |
| 80 tank | -6.5% | | | +8.3% | +16.3% | 0 |

**Decision:** the cap is on the step between tiers, not the whole loadout. Moving the whole accessory set up one tier, fully Hallmarked, is worth at most one weapon step (5-9% XP) and half an armor step; the whole loadout against nothing may reach 15-20% like weapons and armor; perks carry about half a piece's worth (two perks on a tier 2 ring add 1.3-1.7 points over the plain ring). The roadmap's "whole set worth less than one weapon step" is withdrawn; today's rows already land on the new rule (+4.5 to +9.2% a step). Also found: the catalogue's plain jewelry is melee-only (a mage got +0.9% from a set that gave a tank +23.7%), so every crafted piece's plain stats must help all three styles; tier 5 and 6 rows are no better than each other (step 0 at Level 80) and get re-sized when built.

**The belt's home:** crafted, the sixth crafted piece; one belt pattern covers all three weights; belts keep dropping as Rares until the belt phase ships.

## Finding 4. Recipes after 99 against pattern drops

A region has 8 pattern drops: six grounds, the call-out boss, the final boss. Worn pieces need a pattern; staples don't.

| Recipe | Count | How it unlocks |
|---|---|---|
| Ring | 1 | Pattern, from a ground |
| Earrings | 1 | Pattern, from a ground |
| Necklace | 1 | Pattern, from a ground |
| Cloak | 1 | Pattern, from a ground |
| Belt, all three weights | 3 recipes, 1 pattern | Pattern, from a ground |
| A named boss piece | 1 | Pattern, from the final boss |
| A named piece from the call-out boss | 1 | Pattern, from the call-out boss |
| The region's top lining or feast | 1 | Pattern, from the sixth ground |
| **Pattern recipes** | **10 recipes, 8 patterns** | |
| The region's bar, buckle, clasp, chain | 4 | Staple |
| Salt, at either bench | 2 | Staple |
| Arrows, bolts, whetstone | 3 | Staple |
| Stitched, Corded, Sealed linings for the region's parts | 3 | Staple |
| Food and drink | 2 | Staple |
| **Staple recipes** | **14** | |

A staple opens for the hero at 99 who brings that region's ore or hide to a bench. For the Morrow Hills: Carter's Rest belt (the Landlord's Apron), the Ox Road ring, the Night Shift earrings, Wyvern Roost cloak, the Old Guard necklace, the Bellows the top lining, the Roost Mother her named piece, Gault the Bellows Key Ring.

## Finding 5. The fist benchmark, measured as a solo experience

What could be built with no engine change: a two-handed melee weapon on the "sword alone" list, in leather, with a one-target bar: Flame Strike (fire, a rune, mana), Power Strike, and Mend (the self-heal every hero has, levels on Magic). No area moves. Weapon rows in the harness's memory only; it can't show ice or poison, a Magic-levelling strike, or new spells. Equal training time: each style holds the skills a hunting-only hero of that style would have at that Level (a hammer at 24 holds Melee 34; the fist Melee 34 and Magic 16).

**Alone on Normal** (3 seeds x 3 h). "Cheap" = Flame Strike on the 1 gold rune, "dear" = the rune of its tier.

| Ground, Level | Fist, cheap: XP vs the best style | Fist, dear | Fist store bill/h, cheap / dear | Hammer's bill | Fist net gold, cheap | Hammer net | Fist lowest typical HP | Hammer | Fist food/h | Hammer |
|---|---|---|---|---|---|---|---|---|---|---|
| Thicket 10 | -14.8% | -6.0% | 639 / 3,033 | 253 | 2,835 | 3,701 | 89% | 95% | 0 | 0 |
| Wickstead 13 | -16.5% | -7.6% | 547 / 2,924 | 164 | 3,817 | 4,536 | 91% | 96% | 0 | 0 |
| Sewer 18 | -34.3% | -23.6% | 1,237 / 5,561 | 496 | 6,654 | 11,271 | 50% | 61% | 41 | 12 |
| Glade 24 | -11.8% | 0% | 3,221 / 6,803 | 572 | 4,100 | 7,810 | 52% | 69% | 68 | 12 |
| Warrens 42 | -13.1% | 0% | 18,565 / 30,665 | 12,658 | -10,714 | -3,613 | 45% | 55% | 101 | 70 |
| Ford 52 | -17.4% | -4.6% | 15,603 / 19,558 | 1,940 | -5,941 | 8,886 | 50% | 70% | 85 | 11 |
| Slake 57 | -14.7% | -2.4% | 19,449 / 24,448 | 2,000 | -8,781 | 9,213 | 49% | 67% | 106 | 11 |

No deaths in any row. In plate (2 seeds x 2 h) the proxy's HP and food match the hammer's, but it is still 13-17% behind on XP with about twice the bill.

**In a four** (Dangerous and Deadly, Glade 24 and Slake 57, 3 seeds x 2 h, cheap bar)

| Lineup | XP a hero vs tank, healer, mage, hammer | Deaths | Store bill a hero |
|---|---|---|---|
| Fist as the fourth | -5.7 to -11.2% | 0 | A little higher |
| Fist in the tank's seat | -2.2 to +5.7% | 12 to 139 | 2 to 5 times higher |
| Fist in the healer's seat | -3.6 to +1.1% | 0 | 2 to 4 times higher |

| Tyler's test | Result | Evidence |
|---|---|---|
| Comfortable solo | **Fails** | Sits near half HP, eats 40 to 106 food an hour from the Sewer up, loses gold from Level 42 |
| Useful as a fill | Passes | In the healer's seat a four doesn't die and loses under 4% XP, at a higher bill |
| Specialists still win | Passes | A real tank: 0 deaths against 12 to 139. A real healer: a third of the bill. A hammer as the fourth: 6-11% more XP |

**Why it fails, and what the fist line needs:** today's Mend is far too small to be a style's sustain, and every elemental strike costs a rune. Needs (proposed, unmeasured): its own heal replacing about 95 store foods an hour at Level 57 (about 20,000 HP an hour, near 0.8% of max HP a second while hurt); strikes that cost mana, not runes (a rune as the optional stronger cast); any armor weight (the proxy in plate was as safe as a hammer); the promise "best net gold of any lone melee and within 15% of the best lone XP", not "within 5% on XP" (no proxy reached that with a cheap bar). The next prototype needs two small engine pieces first, an ability that names its own skill and a heal sized as above: a Systems job and the first step of the fist phase.

---

# APPENDIX B. Necrotic and Storm (designer, 11-18)


Design only. Nothing built, nothing measured. Every number below is proposed and unmeasured, and every new name is unchecked.

The designer read the live ability, rune, element and status data first (`src/data/abilities.js`, `runes.js`, `elements.js`, `statuses.js`), so costs and unlock levels sit on the real ladder. Three facts from that reading shape the design:
- **Bow and crossbow share one ability list today** (`ranged`). Giving them different spells needs a small data change so a spell can name the weapon it needs.
- **The hidden Air rune family can carry Storm.** Necrotic has no rune family, so it needs an eighth.
- **Weapon spells unlock at skill 1, 10, 14 and 20 today, and spell versions step up at 15, 30, 45 and 60.** Storm goes at 25 and Necrotic at 40, so each lands between version steps as its own moment.

---

## B1. Necrotic: what it is

**A necrotic hit cuts the healing you receive.** For 6 seconds after a necrotic hit lands, everything that heals the hero heals 30% less: food, spells, leech, a healer's casts. It does not stack. A new hit restarts the 6 seconds.

| Question | Answer |
|---|---|
| Alone | Your food and your own heal do less while you're being hit, so you eat earlier, carry better food, or kill the caster first |
| In a party | The healer's casts land weaker on whoever was hit, so the healer has to work harder or the party has to spread the damage |
| How it differs from poison | Poison is plain damage. Necrotic's damage is ordinary, and the healing cut is the threat |
| How it differs from Storm | Storm goes after your mana, Necrotic goes after your healing. One empties the bar, the other weakens your recovery |
| What the player can do about it | A Necrotic guard lining. Bigger food. Kill order (the first-target control). A healer who shields instead of heals |

**Checked against the rulings**

| Ruling | Fits? | Why |
|---|---|---|
| One difficulty for every group size | Yes | The cut is a fixed rule of the element, the same for one hero or four. A lone hero meets it in full |
| One monster number | Yes | A monster's necrotic spell carries only its damage. The 30% and the 6 seconds belong to the element, not the monster |
| No Level in combat | Yes | Nothing reads a Level |
| No immunities, percentages only | Yes | A guard lowers the damage and the cut by the same percent, capped at 40% like every element. A hero at the cap still loses 18% of healing |
| Whole-group monster spells | Yes | A necrotic group spell cuts everyone's healing at once, which is the hardest version of it and the reason to bring the lining |
| Every hit visible and attributable | Needs a mark on the hero and a line in the analyzer: "Healing cut for 6 s" | |

Storm, as already agreed: a storm hit takes HP and also burns mana equal to half the damage. One monster number, a fixed rule of the element, the guard cuts both.

**Monster weak and resist, by kind (starting values on the standard +15% and 25% steps)**

| Monster kind | Necrotic | Storm |
|---|---|---|
| Undead | Takes 25% less | Normal |
| Living beasts and people | Takes 15% more | Normal |
| Constructs | Normal | Takes 15% more |
| Elementals | Normal | Takes 25% less |
| Slimes | Takes 50% less, as with every element today | Same |

---

## B2. Where each element arrives

| Element | First met | Its home | Lining part |
|---|---|---|---|
| Necrotic | The Ox Road, 112 to 128 (staged). Its wall changes from ice to necrotic. The Morrow Hills had two ice walls, so this costs nothing | The Unmarked Catacombs, 165 to 185, and the Bone Wing of the descent | The Ox Road: Ox Shoe (the Yoke Ox). The Catacombs: Owing Tag (the Shrouded Pauper). Both rows exist on the staged packs |
| Storm | The Old Guard, 138 to 155, from the wind that lives in the pass. It sits beside that ground's ice wall as a second spell | Region 5, 240 to 295 | The Old Guard's wind creature has no rows yet. Its part is named when that ground is built |

The Morrow Hills then reads: Carter's Rest fire, the Ox Road necrotic, the Night Shift poison, Wyvern Roost fire, the Old Guard ice and storm, the Bellows fire. Five elements across six grounds.

Not proposed: adding either element to a ground that is live today. The Pyre Wraith at the Pyre Field would be a natural early taste of Necrotic at Level 70, but it means re-grading a balanced ground. That is a separate call.

Heroes get the spells by skill level, not by region, so a hero casts Storm and Necrotic on old grounds long before a monster casts them back.

---

## B3. The spells: 2 x 8

**What makes a hero's spell Storm or Necrotic.** Monsters have no mana and rarely heal, so the hero's side is a mirror, not a copy.

| Element | A hero's spells of that element |
|---|---|
| Storm | Fast, and they pay you back in mana or jump to a second monster |
| Necrotic | They drain: part of the damage comes back as HP. Or they leave the monster Withered: it heals half as much for 6 seconds, which matters against anything that mends its pack |

**Unlocks and costs**

| Rule | Value |
|---|---|
| Storm unlocks | Skill 25, on the weapon's own skill (Melee, Ranged or Magic) |
| Necrotic unlocks | Skill 40 |
| Runes | Storm spells spend the hidden Air family, shown to players as Storm Runes. Necrotic spells spend a new eighth family, Bone Runes |
| Rune tiers | The built five: Chalked, Scored, Etched, Carved, Graven, at skill 1, 15, 30, 45, 60. A spell unlocked at 25 starts on the Scored rune |
| Mana | The numbers below are the first version's. Each later version costs 1.2 times the one before, as built |
| Magic XP | Weapon families pay Magic at a quarter, as Flame Strike does. Wand and staff pay in full |
| Store | Each rune has a store copy bought per cast, as built |

| Family | Storm spell (skill 25) | What it does | Mana, cooldown | Necrotic spell (skill 40) | What it does | Mana, cooldown |
|---|---|---|---|---|---|---|
| Sword (alone, and with a shield) | **Brand** | One target, storm damage. A kill gives 4 mana back | 10, 8 s | **Reave** | One target. 30% of the damage comes back as HP | 12, 10 s |
| Hammer | **Anvil Ring** | Every monster beside you, storm damage, a share of your biggest blow | 12, 10 s | **Toll** | One heavy hit. Leaves the target Withered | 12, 10 s |
| Dual axes | **Crossarc** | Up to three monsters in front, storm damage | 10, 8 s | **Fester** | One target. Half again as hard if it's bleeding | 10, 8 s |
| Bow | **Fork Shot** | Hits the target and jumps to one more for 60%. One arrow | 12, 8 s | **Pall Arrow** | One target. Necrotic damage over 6 seconds, and Withered. One arrow | 12, 10 s |
| Crossbow | **Live Bolt** | One heavy shot. A critical hit gives its mana back. One bolt | 14, 10 s | **Leech Bolt** | One target. 30% of the damage comes back as HP. One bolt | 14, 10 s |
| Wand (Mage) | **Updraft** | An area. Lower damage than Fireball, and 3 mana back for each monster hit | 22, 10 s | **Blight** | An area. Everything hit is Withered | 25, 10 s |
| Staff (Healer) | **Static Ward** | A shield on an ally. Whatever hits it takes storm damage | 25, 12 s | **Tithe** | Drains one monster and heals the weakest ally for the damage. Alone, it heals you | 20, 10 s |
| Fists | **Live Hand** | Your next three blows are storm, and each gives 2 mana back | 8, 12 s | **Draw** | One strike. 40% of the damage comes back as HP | 10, 8 s |

**Why these aren't 16 copies.** Each family's pair follows what that weapon already is:

| Family | Its job today | So its pair |
|---|---|---|
| Sword | Steady, one target, the tank's weapon | Pays for itself, and keeps the tank up |
| Hammer | Crush, sweeps | The game's first storm sweep, and the answer to a monster that heals |
| Dual axes | Bleed | Builds on bleeding |
| Bow | Many targets at range | A second target, and damage that keeps ticking |
| Crossbow | One heavy shot, wears a shield | Big single hits that refund or heal |
| Wand | Area damage, mana hungry | Area that feeds mana, area that stops healing |
| Staff | Heals and shields | A shield that hits back, a heal that comes from damage |
| Fists | Self-sufficient | Mana back and HP back, its two needs |

The sword's two go on the tank's list as well, the way Flame Strike does.

**What the engine needs for these (all new, all small)**

| Piece | Used by |
|---|---|
| Two elements added to the element list, each with its fixed rule | Everything |
| A Withered status: healing halved on a monster, 30% on a hero | Toll, Pall Arrow, Blight, and monster necrotic |
| A spell that returns part of its damage as HP | Reave, Leech Bolt, Tithe, Draw |
| A spell that returns mana | Brand, Live Bolt, Updraft, Live Hand |
| A shield that hits back | Static Ward |
| A spell that names the weapon it needs | Splitting bow from crossbow |
| The Bone rune family, and Air shown as Storm | Runecrafting and the store |

No number in the spell table has been run. They are placed beside the built spells of the same shape (Flame Strike 10 mana, Power Strike 6, Cleave 8, Fireball 25, Greater Mend 25) so they start in the right range.


## B5. Two things for Tyler

| Item | Why it matters |
|---|---|
| The rune names | Tyler ruled the seven rune family names final on 10-23, with Air hidden. Proposed: Air shown as Storm, and an eighth family, Bone. Both are his to name |
| Spell leech and lining leech | Four hero spells heal from damage and so does the leech lining. They don't share a number, so they stack. Fine if both are small. Needs measuring together before either ships |
