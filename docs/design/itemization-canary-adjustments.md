# Itemization plan: Canary second look and adjustments (Fable designer, 2026-11-18)

Reading and design only: nothing built, run or measured. Every new number is proposed and unmeasured. The Canary clone folder was empty when read; the designer worked from four extracted text files beside it (items.xml.txt, player.cpp.txt, monster.cpp.txt, wheel.cpp.txt), read as data only. Canary's item class/tier table was not among them (that part rests on the first research pass). The saved plan was re-read first; necklaces at Smithing is kept.

**Short version:** the first pass looked at Canary's systems; the itemization ideas are in its item attributes. Seven give uniques real properties instead of bigger numbers, and one (spell changes on gear) fixes a gap the plan left open: Krell's caster weapons had no property that measured.

## 1. Adjustments table

| # | Idea | Source | Call | Where it lands | Replaces or merges with | Phase |
|---|---|---|---|---|---|---|
| 1 | Gear that changes one spell (more damage, shorter cooldown, cheaper) | Canary item data, 84 items | Adopt | Section 3, the property catalogue | Fills "caster uniques need a property that measures" | 11 |
| 2 | A weapon that deals part of its damage as an element | Canary, 213 items | Adapt | Section 3, property catalogue. Uniques only | Gives melee and bows an element answer; the fist line keeps "pick your element" as its own | 11 |
| 3 | Sockets: each piece takes a set number of linings and names the kinds it accepts | Canary, 584 items with 1 to 3 | Adapt | Section 5, linings | Extends linings. Standard gear 1 socket, uniques may have 2 | 6 |
| 4 | Linings that wear out by hunting time | Canary imbuements | Adopt | Section 5 | Matches Tyler's 10-15 ruling ("until expiry"). A steady sink, not a one-off | 6 |
| 5 | Leech as a lining kind (HP or mana back from your own blows) | Canary, about 350 items | Adapt | Section 5 | The sustain the fist prototype lacked. Linings own it, so no leech perk on jewelry | 6 |
| 6 | Thorns: attackers take damage back | Canary reflect | Adopt, shields past tier 7 | Section 3 catalogue | A tank property that isn't more armor | 11 |
| 7 | Sweet spot: a bow hits harder at one exact distance | Canary "perfect shot" | Adopt | Section 3 catalogue | Makes the bar's Distance setting a gear choice | 11 |
| 8 | Quiver as the bow's off-hand | Canary quivers | Adapt, uniques only | Section 3, wildcard cell | Fills the bow's empty off-hand. No new slot | 11 |
| 9 | Status wards (shrug off a chill or sickness sooner) | Canary, 47 items | Adapt, later | Section 3 catalogue | Waits until monster spells use statuses as the tier wall | Later |
| 10 | Salvage: any gear breaks into fixed materials | Veloren | Adopt | Section 5, and a fourth loot destination | Replaces melting. One system for plain jewelry and unwanted drops | 3 |
| 11 | Reference value for every item, and a guard that no craft path mints gold | Veloren | Adopt | Section 10 | Protects salvage, good batch and commissions | 3 |
| 12 | Region tables and one-of rows for authoring drops | ultraloot's data model | Adopt | Section 3, ground template | Chips and stock written once a region, not once a ground | With the ground pack |
| 13 | Weekly orders on Tamsin's Tally: deliver drops and crafted goods | Canary task board | Adapt | Section 10 | Extends the Tally. Pays chips and salts, never gold or gear | 9 |
| 14 | Stirred grounds: the server marks a few grounds each hour, their elites drop extra chips | Canary influenced creatures | Adapt | Section 4, gems and chips | Extends chips and live events. No new currency | 9 |
| 15 | One pattern teaches a set, with guard checks | Veloren | Already in | | The belt pattern | |
| 16 | Escrow details for commissions (timeout, resolves once) | Veloren | Adopt as the commission's rules | Section 4 | | 5 |
| 17 | One market book per piece with perk filters | Canary market | Adapt | Section 10 | Answers the thin order books from 530 graded rows | With the market |
| 18 | Tempering carryover to the next tier | Canary forge transfer | Skip | | See question 10 | |
| 19 | One signature effect per slot that grows with upgrade tier | Canary | Skip | | Duplicates perks and Tempering | |
| 20 | Rings on a timer, amulets with charges | Canary, 126 items | Skip as items, idea merged into #4 | | A used-up jewel in a permanent slot means swapping by hand | |
| 21 | Set bonuses, outfit stat bonuses | Canary | Skip | | No set bonuses (11-14). Outfits are cosmetic (ruled) | |
| 22 | Crit damage, cleave share, regen, speed, carry weight on gear | Canary | Skip | | Covered by Keen and Follow-through, Inner Flame, the closed speed ladder. No weight system | |
| 23 | Wheel gems, forge fusion, paid re-rolls, lining success chances | Canary | Skip | | Gambling, or the skill tree Tyler put on hold | |
| 24 | Boss loot by contribution | Canary | Skip | | Conflicts with the ruled party rare roll. Hall bosses already pay a personal roll | |
| 25 | Weapon mastery perks from kills per family | Canary | Skip for now | | Overlaps skills and the Bestiary deep dive Tyler queued | |
| 26 | Crafted pieces as form x material | Veloren | Skip | | Would double the 530 graded rows | |

**Effect on the 75% budget:** none of the shares move. Timed linings turn the 5% from a one-off into upkeep, sized at 5% of hourly income. Salvage lowers banked gold if a hero salvages instead of sells; the budget is a share of banked gold, so prices follow. Sold gear as a share of income is not measured and must be before salvage ships.

## 2. New Canary itemization findings (counts = item rows carrying the attribute)

| What Canary does | Count | What makes it interesting | Hearthrise today | Fits the rulings? |
|---|---|---|---|---|
| A piece changes one named spell: base damage, cooldown, crit bonus, or leech on that spell | 84 | Late gear chosen for what it does to your bar | Nothing | Yes. Fixed numbers, server-side |
| A weapon converts part of its damage to an element | 213 | The same weapon is good or bad depending on the ground | Only spells carry elements | Yes |
| Sockets: 1, 2 or 3 per piece; each piece lists which effects fit | 584 (241 / 258 / 85) | Better pieces have more sockets, not more armor | Linings designed with no socket count | Yes |
| Socket effects wear out with fighting time | All of the above | A steady sink that never inflates power | Linings designed; 10-15 ruling says "until expiry" | Yes, with no success roll |
| Leech on gear: HP or mana back from your damage | About 350 each | Sustain as a build choice | Nothing; the fist prototype failed for lack of it | Yes |
| Element protection per element | About 115 each | Gear for a place | Built (resistPm, 40% cap) | Already ours |
| Skill bonuses on gear | About 90 a skill | | Built (Tower, special attributes) | Already ours |
| Magic level bonus for one element only | About 50 | A caster specialises | +Magic measured as nothing for a wand | Covered by spell changes |
| Reflect damage | 5 | A tank that hurts what hits it | Nothing | Yes |
| Bonus damage at one exact range | 4 | Positioning becomes a gear choice | A Distance setting nothing rewards | Yes |
| Quivers: a second ranged slot holding ammo | A handful | The bow user gets an off-hand | A bow's off-hand is empty | Yes, as an off-hand piece |
| Status deflection | 47 | Counter to one monster trick | Nothing | Yes, later |
| Rings on a timer, amulets with charges | 126 with charges | Cheap burst power you top up | Nothing | Fits, but repeats a decision by hand |
| Crit chance and crit damage as separate stats | 36 / 42 | Two dials | One crit stat and the Keen perk | Not needed |
| Speed, carry weight | 43 / 46 | | Speed ladder closed, no weight | No |
| Upgrade tiers capped by item class, one effect per slot | Not in the files read | Rarer classes hold more upgrades | Tempering, one ladder a tier | Duplicate |
| Rolled wheel gems, fusion with a failure chance | | | | No: gambling |

How their endgame gear differs: past a point the armor and attack numbers barely move, and pieces are told apart by sockets, which spell they change, which element they hit with or guard against, and which skill they raise. Same direction as Tyler's ruling for uniques past tier 7, with a concrete list.

## 3. Revised sections of docs/design/itemization-plan.md (full text of each section that changes)

### Section 1, add these rows to "Each system and its purpose"

| System | Player problem | Decision it gives | Status |
|---|---|---|---|
| Salvage | A hero picks up 9 to 31 gear pieces an hour and can only sell them | Sell for gold or break down for crafting stock, set once per item | Proposed |
| Weekly orders | Crafted staples have no buyer but the shop | Which orders to fill this week | Proposed |
| Stirred grounds | No reason to pick one ground over another today | Hunt where the chips are, or stay on your route | Proposed |

The Linings row changes to: "Group spells can't be dodged, and a lone hero has no sustain but food. Decision: which element, or which leech, for this ground. Designed 11-13, widened here."

### Section 3, "Past tier 7: uniques" (replaces that subsection and the sidegrade subsection)

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
| +Skill | Counts as more of one combat skill | Armor. On weapons it is the chest's | Built | 2 to 3 |
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
| Boss or ground unique | The band's plain numbers with no skill bonus, plus one property from the catalogue | Clearly best in the case its property is for. Slightly behind elsewhere |

Krell's weapons become the first of these. Sample of five (proposed, unmeasured):

| Krell's piece | Property | Wins | Loses to the Gold Tower weapon |
|---|---|---|---|
| His sword | Bane: the Undead, 10% | The Ox Road, the Night Shift, the Catacombs | On living things, by about the skill bonus |
| His warhammer | Bane: Humanoids, 10% | Carter's Rest, Krell's Hold | On the Undead |
| His bow | Sweet spot: +8% at distance 5 | A hero who can hold range. Most bosses | When the pack closes in |
| His wand | Spell change: Fireball +15% | Big pulls on Dangerous and Deadly | On single targets |
| His staff | Spell change: Greater Mend costs 20% less | A healer in a four | Hunting alone |

### Section 3, "The ground template" (two rows change, one paragraph added)

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

### Section 4, "Gems and chips" (full text)

| Need | Six pieces carried up use 6 gems a band. A fresh Hallmark uses 1 more |
|---|---|
| Whole gem | A Rare, about 11 hours on its carrier (built for the Carnelian) |
| Chips | Drop from every monster on the tier's grounds. 10 chips make a gem at the forge |
| Chip pace | Sized so chips alone give a gem about every band-hours divided by 8: every 5 hours at tier 2, every 15 later |
| Stirred grounds | Each hour the server marks a few open grounds as stirred. Their elites are a little tougher and drop extra chips while it lasts. Monster stats and drops only, shown on the Hunts page, the same for every group size |
| Weekly orders | Tamsin posts orders for drops and crafted staples. They pay chips and salts |
| Old Rare prizes | Alpha Fang, Rook's Whistle and Crown Shard each cut into one gem of their tier. War Crown is left out because the House uses it |

Stirred grounds and weekly orders are extra chip sources on top of the base pace, sized so a hero who ignores both still meets the six gems a band.

### Section 4, "The Fine chase, as one order" (full text)

A standing order at the bench: "Make until Fine with one of these perks, salvage the rest, stop after this many bars." Salvaging a plain piece returns half its metal and no XP (section 5). Chasing a first perk is one decision, not sixty presses, and it can't be farmed for XP.

### Section 5, "Making gear better" (full text)

| System | Rule | Numbers | Label |
|---|---|---|---|
| Tempering | Gold and salts, five rungs a track, one ladder a tier, on the hero | Blows +3 to +4.7% XP, Armor 2 to 10% less damage | Built, measured |
| Tempering past tier 6 | A Dawnsteel ladder for 88 to 110, then one a band, 2 to 3% a track | | Ruled in principle |
| Salts | One a tier, either bench | 310 a track | Built |
| Linings | Below | | Designed 11-13, widened here |
| Salvage | Below | | Proposed |
| Patterns | A Rare that unlocks a recipe for the account | Eight a region | Proposed |
| Good batch | A consumable job sometimes makes double | 2% at level 1 to 10% at 99 | Ruled yes |
| Named reforging | Kingsgrate to Steelgrate, Klappa's Klub | | Built |

Good batch adds a little gold through sold food, up to about a tenth of a cook's shop income (estimate).

**Linings.**

| Rule | Value | Label |
|---|---|---|
| What it is | A crafted lining fitted into a piece of worn gear | Designed |
| Made from | A monster's own part plus runes, at Crafting | Designed |
| Sockets | Standard gear has one. A unique may have two (its property) | Proposed |
| Which kinds fit where | Element guards in armor and shields. Leech in weapons and off-hands | Proposed |
| Element guard | Stitched 20%, Corded 25%, Sealed 30% less of fire, ice or poison. Capped at 40% with worn pieces | Designed and measured 11-13 |
| Life leech | A share of your damage comes back as HP | Proposed, unmeasured |
| Mana leech | A share comes back as mana | Proposed, unmeasured |
| How long it lasts | 20 hours of hunting, counted by the server only while the hero is in a hunt | Proposed. Tyler 10-15: linings last "until expiry" |
| Fitting it | Always works. No chance to fail | Decided |
| Each kind counts once a hero | The strongest worn | Ruled 10-15 |
| Trade | A lining trades until it is fitted | Ruled 10-15 |
| Cost | Sized so keeping linings up takes about 5% of a hero's hourly income | The budget's 5% |

Critical-hit linings are not on the list: crit belongs to the Keen perk and weapon properties. Leech is where a lone hero's sustain comes from without food; the fist prototype failed its solo test for lack of exactly this, so the fist line's own heal and a leech lining are two answers to measure against each other before either is sized.

**Linings by region.** Strengths never grow. A region names the wall element on each ground and supplies the part. Barrow March: fire. Morrow Hills: ice on the Ox Road and the Old Guard, poison on the Night Shift, fire at the Bellows. Catacombs: poison and ice. Later regions: at least two elements each, and a ground's wall never matches its faction pair's.

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

### Section 10, "Gold in, gold out, and trade" (full text)

| Gold in | Gold out |
|---|---|
| Coin, loot sold, Tamsin's tasks | Hallmark and reforge fees, Tempering, lining upkeep, chest reforging |
| Crafted goods at the shop floor | Commission fees, bench fee, hero slots, the House, training, refills, Blessings, store supplies, market fee and cut |
| Good batch on food (small) | |

Weekly orders pay chips and salts, not gold. Salvage takes gold out indirectly (a salvaged piece is a piece not sold); sold gear as a share of income has not been measured, and the budget's prices follow whatever it turns out to be.

| Trades | Doesn't |
|---|---|
| All gear, chest pieces, crafted pieces, gems, chips, patterns, materials, unfitted linings, gold-bought training items | Chest keys (Storage only), fitted linings, anything bought with Crowns |

**Reference values.** A tool works out a value for every item from its drop rows, kill rates and recipes. One guard proves that no chain of craft, salvage, good batch or commission ends in more shop gold than went in. It also feeds the market's suggested price.

**The market.** About 530 graded rows would mean 530 thin order books. The Weighhouse shows one book per piece, with the grade and perks as filters. The Hallmark step and commissions still let a player finish a piece with no market at all. Rolls, tradeable gems and tradeable patterns go in the Steam and legal review.

### Section 11, "Build order" (full text)

| Phase | What | Size | Money or server surface | Depends on |
|---|---|---|---|---|
| 0 | Drop homes and recipe cuts. Bench stats. Defense fix and Tower raise | | Yes | In flight |
| 1 | Fist engine pieces, then wraps at tiers 1 and 2 and two spells, measured | M | Yes | Phase 0 |
| 2 | Jewelry sample: Seam Jasper Band (rolls), Fang Studs with Steady and Focus hooked, a plain necklace and cloak, one pattern, the per-piece skill field, one reforge | M | Yes | Phase 0 |
| 3 | Gem chips. Re-price Tempering. Set the fee rows. Salvage and the fourth loot destination. Reference values and the no-mint guard | M | Yes | Phase 2 |
| 4 | The other seven first-wave perk hooks. The Fine order | M | Engine | Phase 2 |
| 5 | Commissions, on the escrow rules (held by the server, a timeout, resolves once) | M | Yes | Phase 2 |
| 6 | Linings: sockets, element guards, leech, wear by hunting time | L | Yes | The 11-13 spec |
| 7 | Belts to crafting, with buckles | M | Yes | Phase 4 |
| 8 | Ladders for tiers 4 to 7, 20 rows a batch, each measured as a full set | L | Yes | Phases 3, 4, 7 |
| 9 | Good batch. Patterns. Weekly orders. Stirred grounds | M | Yes | Phases 2 and 3 |
| 10 | Chest reforging, fusing, the glove wing | M | Yes | The Catacombs build |
| 11 | The property hooks, spell change first. Krell's weapons as sidegrades. Morrow grounds to the grid, authored with region tables | L | Yes | Phases 0 and 6 |
| 12 | Fist tiers 3 to 7 and its Tower rows | L | Yes | Phase 1 measured |

Every "Yes" is on the pre-EA Security list.

### Section 13, add these questions

| # | Question | Recommendation |
|---|---|---|
| 9 | Linings wear out after about 20 hours of hunting and are re-made. Your 10-15 ruling says "until expiry". Is a recurring lining what you meant? | Yes. A lining that never wears out is bought once and stops being a sink or a crafter's income |
| 10 | Tempering carryover (move rungs to your next tier, minus one) was on the shortlist you saw. Leaving it out. OK? | Leave it out. The next tier's bare set already beats a fully tempered old one (measured on the board, 1.8 to 18.9%), so nobody is trapped on old gear; rungs 1 to 4 are 48% of a ladder's gold, so carrying them would cut the main gold sink by about half |
| 11 | Salvage means a hero who breaks down drops instead of selling them banks less gold. Fine? | Yes. It works with the income cut you chose on 11-16, and the material goes to crafters |
| 12 | A quiver as the bow's off-hand, on uniques past tier 7 only? | Yes, late and rare. It gives the bow what the wand has in the spellbook |

## 4. Not checked

| Item | State |
|---|---|
| Canary's item class and tier table | Not in the files available; taken from the first research pass |
| Whether the 11-13 linings spec already sets a duration or socket count | Spec read in summary only; if it does, its numbers win |
| Sold gear as a share of hunting income | Not measured; needed before salvage is sized |
| Every proposed size in the property catalogue and the leech linings | Unmeasured |
| Proposed names | Not checked free |
