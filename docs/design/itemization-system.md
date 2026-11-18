# Hearthrise itemization: the long-term system (version 2)

Game designer (Fable), 2026-11-18. "Measured" = the real engine (11-18 audit runs: lone hero, Normal, 3 seeds x 3 h). "Built" = in the game's data today. "Proposed" = a design number nobody has measured. Review of v1: `docs/design/itemization-system-review.md`.

## One-page summary

**The six rules a player learns**

| # | Rule | In one line |
|---|---|---|
| 1 | What you fight in drops | Helmet, body, legs, boots, gloves, weapon and shield come off monsters |
| 2 | What you finish it with is made | Two rings, earrings, necklace, cloak and belt come from crafters, with rolled perks |
| 3 | What you use up is made | Food, drinks, arrows, bolts, whetstones, runes. The store sells a weaker copy |
| 4 | What makes gear better is made | Tempering salts, linings, reforging |
| 5 | Special pieces are won | Bosses, the Hearth Chest (Tower and Catacombs) and each ground's Rares |
| 6 | Crafters need hunters, hunters need crafters | Gems, hides, parts and patterns only drop. Jewelry, cloaks, belts, linings and salts are only made |

**The slot count.** A hero has 14 slots.

| Group | Slots | Count |
|---|---|---|
| Dropped | Helmet, body, legs, boots, gloves, weapon, shield | 7 |
| Crafted, with perks | Ring, ring, earrings, necklace, cloak, belt | 6 pieces, 12 perk seats |
| Used up | Ammo (arrows, bolts, whetstones, runes) | 1 |

**Who makes what**

| Skill | Worn pieces | Also |
|---|---|---|
| Smithing | Rings, earrings (metal jewelry), belt buckles | Bars, whetstones, salts, reforging metal pieces |
| Crafting | Necklaces, cloaks, belts | Planks, arrows, linings, salts, reforging hide, cloth and wood pieces |
| Cooking | | Food and drinks |
| Runecrafting | | Runes, and the runes linings and top Hallmarks need |

**What changed from version 1**

| # | Change | Why |
|---|---|---|
| 1 | 14 slots, 6 crafted pieces, 12 perk seats | Two rings; belts move to crafting |
| 2 | Perk pool is 22, in slot pools, no cap | Tyler: no cap, grow well past the seats |
| 3 | Rings and earrings at Smithing; necklaces, cloaks, belts at Crafting | Tyler |
| 4 | Jewel reforging up a tier at the fee difference, perks kept | Tyler. Fixes "skip tiers 4 to 6" for tiers 4 and 5 |
| 5 | Gems no longer guarantee a perk; the player picks | Tyler, and a ring can't hold Deflect |
| 6 | Tier 3 ring is steel; gold moves to tier 4 | Gold Rock needs Mining 45 |
| 7 | Hallmarking a tier needs the NEXT tier's skill level (30, 45, 60, 75, 88, 99) | Matches the built 30 and 45 |
| 8 | Chest reforging uses one of the 6 weekly opens | Tyler |
| 9 | Tower weapons are major upgrades, keep +skill, never bound (always tradeable) | Tyler |
| 10 | Gloves get a third Catacombs wing | Tyler |
| 11 | Fist sample moves to right after phase 0 | Tyler: asap |
| 12 | Seven weapon families today; fists would be the eighth | Data |
| 13 | Cloaks use common hides and cloth; linings use each monster's own part | The review: one use each |
| 14 | The old jewelry and cape rows are each placed or cut | The review |
| 15 | Good batch is a small faucet on food, said plainly | The review |

---

## 1. Each system and its purpose

| System | Player problem it solves | Decision it gives | Status |
|---|---|---|---|
| Drops | "What do I get for hunting here?" | Which ground for which slot | Built |
| Jewelry, cloaks, belts | Six empty or thin slots. Crafting has no identity | Which perks. Wear or sell. Hallmark or not | One ring built |
| Jewel reforging | Re-buying a set every tier is the same decision six times | Carry this piece up, or roll for better perks | Proposed |
| Consumables | Hunts burn supplies | Make better ones or pay the store | Built |
| Tempering | Gold piles up | Blows or Armor first | Built, tiers 2 to 6 |
| Linings | Group spells can't be dodged | Which element for this ground | Designed 11-13 |
| Named and chest reforging | A won piece dies at the next tier | Spend an open on a sure step or on a new roll | Two recipes built, rest proposed |
| Patterns | Crafting has no chase | Which ground to hunt for a recipe | Proposed |
| Good batch | Levels between unlocks do nothing | None. A moment | Approved, not built |
| Special pieces | Standard gear is all alike | Mix pieces for the ground ahead | Partly built |
| Training | Skills lag | Train or craft | Built. Defense being fixed |

---

## 2. Every slot, by band

Tier Levels: 1 / 15 / 30 / 45 / 60 / 75 / 88.

### Dropped slots

| Slot | Levels 1 to 87 | 88 to 110 | Past tier 7 | Worth (measured) |
|---|---|---|---|---|
| Helmet, body, legs, boots | About one an hour in your weight on every ground | Krell (body, helm), Carter's Rest staged (boots, legs) | Named uniques | A full armor tier: 13 to 26% less damage at tiers 2 to 4, 5 to 10% at 5 to 6 |
| Gloves | Shop pair at 1. Rares after (10 to 20 h). Slow on purpose | Carter's Rest staged | Uniques | Plus the Catacombs glove wing (section 6) |
| Weapon, seven families | Start kit, then drops for every family (lane/d-drop-homes) | Krell, the Ox Road staged | Uniques | A tier: +5 to +9% Level XP an hour |
| Shield, spellbook | Shop shield at 1, then drops at every tier | Krell | Uniques | Not measured alone |

### Crafted slots (all proposed except the tier 2 ring)

| Slot | Level 1 | Tiers 2 to 7 | Past tier 7 | Worth |
|---|---|---|---|---|
| Ring x2 | Copper Ring, shop or Smithing | Smithing, rolled | New gems with new perks | Measured, one ring: plain +1 to +8%, Hallmarked +2 to +9% |
| Earrings | Copper Studs, shop or Smithing | Smithing, rolled | Same | Unmeasured |
| Necklace | Hunter Necklace in the shop, Tusker Charm at Crafting | Crafting, rolled | Same | Unmeasured |
| Cloak | Traveler Cape in the shop | Crafting, rolled | Boss-hide cloaks | Measured: Houndskin 5 to 10% less damage early, 1 to 2% late |
| Belt | Bronze Belt in the shop | Crafting, a strap plus a smith's buckle, three weights, rolled | Same | Unmeasured |

**Hard limit (unmeasured until the set exists):** a full six-piece Hallmarked set is worth less than one weapon tier, about +8% Level XP an hour, at every tier.

---

## 3. The skills, level 1 to 99

E = exists today. Everything else is proposed.

| Band | Smithing | Crafting | Cooking | Runecrafting |
|---|---|---|---|---|
| 1 to 14 | Bars, whetstones, tools, Klappa's Club reforge (E). Copper Ring at 5, Copper Studs at 8, Bronze Buckle at 10 | Planks, bronze arrows, Graypelt Cloak (E). Tusker Charm at 8 | Shrimp, herring, turnip (E) | Blank and Chalked runes (E) |
| 15 to 29 | Tier 2 rings and earrings. Iron bars, salts, fittings (E). Iron Buckle | Tier 2 necklace, cloak, belt. Arrows, bolts (E). Stitched linings | Trout, bread, juices (E) | Scored runes (E) |
| 30 to 44 | Tier 3 rings and earrings. Hallmark tier 2. Steelgrate (E). First chest reforge | Tier 3 necklace, cloak, belt. Hallmark tier 2 | Lobster, soup (E) | Etched runes (E) |
| 45 to 59 | Tier 4 (gold). Hallmark tier 3. Mithril salts (E) | Tier 4. Hallmark tier 3. Corded linings | Swordfish, stews (E) | Carved runes (E) |
| 60 to 74 | Tier 5. Hallmark tier 4. Rune salts (E) | Tier 5. Hallmark tier 4 | Shark, pies (E) | Graven runes (E) |
| 75 to 87 | Tier 6. Hallmark tier 5. Ember salts (E) | Tier 6. Hallmark tier 5. Sealed linings | Frostfin, Ember Tart (E) | Sealing Rune at 75: an input to Sealed linings and tier 6-7 Hallmarks |
| 88 to 99 | Tier 7. Hallmark tier 6 at 88, tier 7 at 99. Pattern recipes at 92 and 96 | Same shape | Moonfish, Moonbloom Elixir (E). Pattern feasts | Good batch tops out at 99. Pattern runes |

Runecrafting past 60 is thin because of the five-rune-tier ruling; the Sealing Rune and the good batch are what it gets without a sixth tier.

**How they feed each other**

| From | To |
|---|---|
| Mining | Smithing, Runecrafting |
| Woodcutting | Crafting |
| Fishing, Farming | Cooking |
| Smithing | Crafting: the metal chain for a necklace, the buckle for a belt, the clasp for a cloak |
| Runecrafting | Linings, top Hallmarks, every spell |
| Hunters | Gems, hides, monster parts, patterns, pieces to reforge |

---

## 4. Jewelry, cloaks and belts

### The rules

| Rule | Value | Status |
|---|---|---|
| Grades | Plain, Fine (one perk), Hallmarked (two) | Built |
| Base job | Metal or hide makes a piece. Plain most of the time. Fine 5% at skill 15 rising to 12% at 99 | Built |
| Gem job | A plain piece and a gem. Never Plain. Hallmarked 10% at 15 rising to 25% at 99 | Built. This is the reveal |
| Hallmark step | A Fine piece, a gem and the fee. The player PICKS the second perk. Nothing fails | Built |
| Which skill | The piece's own: Smithing for rings and earrings, Crafting for the rest. A field on each piece | Proposed (one constant today) |
| Hallmark level | The next tier's skill level: 30 / 45 / 60 / 75 / 88 / 99 | 30 and 45 built |
| Gems | Any gem of the tier works in any slot. No gem forces a perk | Changed in v2 |
| Each perk counts once a hero | The larger worn | Built |
| Spare plain pieces | Melt one back for half its metal | Proposed, so a Fine chase doesn't leave piles |
| Re-rolls | Never for gold | Tyler 11-05 |
| Trade | Everything trades | Tyler 10-23 |

### The perk pool: 22 perks, 12 seats

Each slot has its own pool, so a fully Hallmarked hero still chooses in every slot: 4 of 6 on the two rings, 2 of 4 everywhere else. Only Keen, Follow-through and Surge play in the engine today; every other row needs a hook and is unmeasured.

| Slot | Perk | What it's for |
|---|---|---|
| Ring | Keen | More critical basic blows |
| Ring | Follow-through | A basic blow also hits one more monster |
| Ring | Surge | A cast lands half again as hard, sometimes |
| Ring | Thrift | A cast or shot costs nothing, sometimes |
| Ring | Opener | Your first blow on a fresh monster hits harder |
| Ring | Finisher | More damage to a monster under a quarter HP |
| Earrings | Steady | Basic blows miss less |
| Earrings | Focus | Mana back on each kill |
| Earrings | Echo | Your heals and shields land a little stronger |
| Earrings | Giantsbane | More damage to a ground's boss |
| Necklace | Deflect | A blow at you is turned aside, sometimes |
| Necklace | Second Wind | HP back on each kill |
| Necklace | Reserve | More max mana |
| Necklace | Vigor | More max HP |
| Cloak | Lined, Fire | 10% less fire. Shares the 40% cap |
| Cloak | Lined, Ice | 10% less ice |
| Cloak | Lined, Poison | 10% less poison |
| Cloak | Shroud | Less damage from group spells |
| Belt | Hearty | Food heals more |
| Belt | Quench | Drinks restore more |
| Belt | Brace | Less damage while under 30% HP |
| Belt | Forager | Ore and wood picked up during a hunt yield more |

Without belts it would be 18 perks and 10 seats.

**The cost, stated plainly.** Grades are separate item rows. A piece with a pool of 4 has 10 graded rows, a ring has 21. The whole ladder is about 530 generated rows and as many market ceilings. They're generated from tables, never typed, but it is the system's biggest structural cost.

### The ladders

| Tier, Level | Metal (rings, earrings, buckles) | Gem and its source | Hallmark fee, each piece | Reforge up to this tier | Ceiling, Fine / Hallmarked |
|---|---|---|---|---|---|
| 2, 15 | Bronze | Road Carnelian, the Turncoat at Wickstead (built). Also Alpha Fang, Rook's Whistle, Crown Shard | 25,000 (built) | | 100k / 300k (built) |
| 3, 30 | Steel | Seam Jasper, a new Rare on the Warrens. Also War Crown | 100,000 (built) | 75,000 | 300k / 1M (built) |
| 4, 45 | Gold | A new Rare on the Slake's Color Sergeant | 150,000 (Tyler) | 50,000 | about 10x the fee |
| 5, 60 | Rune | Ruby, a new Rare on Captain Hask (the item row exists with no source) | 250,000 (Tyler) | 100,000 | about 10x |
| 6, 75 | Emberforged | A new Rare on the Provost | 400,000 (Tyler) | 150,000 | about 10x |
| 7, 88 | Dawnsteel | Krell's daily roll | 600,000 (Tyler) | 200,000 | about 10x |

Tiers 2 and 3 have several gem carriers (answers the supply worry there). Tiers 4 to 7 have one carrier each and will need a second as the ladder is built.

### Jewel reforging, as the player sees it

| Step | What's on screen |
|---|---|
| 1 | The bench has a tab, Reforge. Smithing shows rings and earrings. Crafting shows necklaces, cloaks and belts |
| 2 | It lists every crafted piece you hold (worn, bag, Storage) that has a next tier. A row reads "Hallmarked Banded Signet (Keen, Surge)" with an arrow to the next tier's piece |
| 3 | Pick a row. Two cards side by side: the piece now, and the piece after. Changed numbers are marked. Under them: "Perks stay. Keen 4% becomes 6%. Surge 6.7% becomes 10%." |
| 4 | One cost line: "6 Steel Bars (you have 9) and 75,000 gp". Under it: "Requires Smithing 30. Worn from Level 30." If you can't, it says which part you're missing |
| 5 | Press Reforge. Nothing rolls and nothing can fail. The old piece is used up and the new one is in your bag. If you were wearing it and your Level allows, it's worn |

Plain and Fine pieces reforge too, for the metal alone. Only a Hallmarked piece pays gold, and it pays the difference between the two tiers' fees, so nobody pays the same Hallmark twice.

### Do the fees fit?

Banked gold per band is the board's measured figure; "after the cut" is that times 0.7, an estimate. Six pieces.

| Band | Banked, measured / after the cut (est.) | Tempering, both tracks | Six fresh Hallmarks | Six reforges | Tempering + reforges, share of post-cut gold |
|---|---|---|---|---|---|
| 45 to 60 | 1.10M / 0.77M | 496k | 900k | 300k | 103% |
| 60 to 75 | 1.77M / 1.24M | 744k | 1.5M | 600k | 108% |
| 75 to 90 | 1.89M / 1.32M | 992k | 2.4M | 900k | 143% |

- Reforging fixes the skip at tiers 4 and 5: jewelry alone falls from 117-121% of the band's gold to 39-48%.
- It doesn't fully fix tier 6: jewelry alone is 68%, with full Tempering 143%. A hero picks one, or carries four or five pieces up instead of six.
- Recommendation: leave the fees as accepted, re-measure when the income cut is live; if tier 6 still reads "can't afford any of it", move the tier 6 fee, not the rule.
- Levels 30 to 45 are unchecked (no banked figure for that band).

### Samples

| Piece | Slot, tier | Bench | Made from |
|---|---|---|---|
| Seam Jasper Band | Ring, 3 | Smithing 30 | Steel Bars, then a Seam Jasper to set |
| Fang Studs | Earrings, 2 | Smithing 15 | Small Fangs, Bronze Bars. Its Wickstead drop row goes |
| Wolfbone Necklace | Necklace, 2 | Crafting 15 | Small Fangs, Silk Thread, a bronze chain. Its drop row goes |
| Warband Bulwark | Cloak, 3 | Crafting 30 | Bear Pelts, a Goblin Totem, a steel clasp. The row exists with no source |
| Studded Belt | Belt, 2, leather | Crafting 15 | Wolf Pelt and an Iron Buckle. Its Rare drop row goes |

**Cloak and belt materials** are common drops, never a monster's own part (those belong to linings): pelts at tier 2, Bear Pelt at 3, Silk Thread and coal tar at 4, Grave Dust-cured cloth at 5, Wraith Veil and Razor Claw at 6, Troll Hide at 7.

### The old rows, placed or cut

| Row | Call |
|---|---|
| Gold Ring, Gold Amulet | The tier 4 plain ring and necklace |
| Ruby Signet, Rubyfire Studs | Tier 5 ring and earrings, with Ruby as that tier's gem |
| Wraithglass Drops | Tier 6 earrings (Wraith Veil drops on the Pyre Field) |
| Spellstone Ring | Tier 6 ring, renamed when built |
| Dawnforged Signet, Dawnbound Amulet, Dawnlit Mantle | The tier 7 plain ring, necklace and cloak |
| Warband Bulwark, Barrowking Mantle | Tier 3 and tier 5 cloaks |
| Trollhide Cape | Re-tiered from 4 to 7 (Troll Hide only drops at 110+), so there is one Trollhide cloak, not two |
| Tusker Charm | Tier 1 necklace from Orchard Boar Tusks |
| Hollow Sigil Ring, Panther's Eye Pendant | Pattern pieces, names kept (Tyler 11-14) |
| Dragon Gem Earrings, Wyrmgilt Mantle | Past tier 7, at Wyvern Roost |
| Packlord Band, Spider-Eye Studs, Mirewort Drops, Spidersilk Choker, Warlord's Torc, Jarl's Rimetorc, Woolen Cloak, Alpha Cloak, Shadowsilk Cape, Chitinweave Cloak | Cut. Their creatures have no home, and "Shadow" is a banned filler word |
| The five champion relics | Not read. They go to the special-attribute audit |

---

## 5. Patterns, linings, good batch, Tempering, salts

| System | The rule | Numbers | Status |
|---|---|---|---|
| Patterns | A Rare drop that unlocks one recipe for the account. Spares trade | One or two a ground | Proposed |
| Linings | Made from a monster's own part plus runes. Cuts one element | 20 / 25 / 30%, capped at 40% with worn pieces | Designed and measured 11-13. Not built |
| Good batch | A consumable job sometimes makes double | 2% at level 1 to 10% at 99 | Approved. Not built |
| Tempering | Gold and salts, five rungs a track, a ladder per tier, on the hero | Measured: Blows +3 to +4.7% XP, Armor 2 to 10% less damage | Built, tiers 2 to 6 |
| Salts | One a tier, at either bench | 310 a track | Built |
| Named reforging | Kingsgrate into Steelgrate, Klappa's Club | | Built |

Good batch does create a little gold: doubled food can be sold to the shop (up to about +10% of a cook's shop income). Runes, arrows and whetstones can't be sold, so they add none.

---

## 6. Special pieces

| Source | What it gives | Status |
|---|---|---|
| Ground Rares | Next-tier pieces and one-attribute pieces | Standard built. Attribute sample: two shipped, three hidden |
| Boss calls | The boss's table plus one call-only piece | Built |
| Lord Krell | Tier 7 weapons, body, helm, the Tollgate, the Banded Legguards | Built |
| Tower chest | Weapons, one a family a key tier. Major upgrades, +1 to +4 skill, always tradeable | Built at standard numbers. Being raised in lane/d-defense-tower |
| Catacombs chest | Helmets and boots, the tier's piece plus one attribute | Designed, 24 rows hidden |
| Catacombs gloves | A third wing | Proposed below |
| Past tier 7 | Named uniques per ground and boss | Sample drafted for Carter's Rest |

**Chest reforging (Tyler: yes, and it uses an open).** A chest piece plus the next key tier's key, that tier's metal or hide, and gold becomes the next tier's piece with the same attribute. Each reforge uses one of the hero's 6 weekly opens for that family. Smithing does metal pieces, Crafting does hide, cloth and wood. This is what makes Bronze and Silver worth opening. The risk: a sure step is faster than luck (one key a step would take a hero from Bronze to Platinum in about three more opens, against about 9.5 weeks by luck), so the number of keys a step burns is the dial, sized with the Tower lane's arithmetic before it's built. Unmeasured.

**The gloves wing (proposed).** A third wing in the same Catacomb key family, with its own key that leans gloves 70%, helmets and boots 15% each. Same 6 opens a week, shared with the other two wings. Twelve rows: four key tiers by three weights, the tier's standard gloves plus one attribute per weight. A wing rather than a slot lean on the existing keys, because "pick the wing, pick the slot" is already how the mode reads. Wing name, key name and attributes are for the Catacombs lane.

The 165 to 185 Catacombs hunting ground still has no gear of its own on main.

---

## 7. Fist weapons

**Tyler's identity statement (2026-11-18):** "Fist weapons are Hearthrise's self-sufficient all-rounder. They offer steady single-target damage, elemental flexibility, and enough personal sustain to make solo hunting comfortable. In a four-player party, they can fill a gap, while dedicated damage dealers, tanks, and healers remain stronger in their roles."

**The budget (all unmeasured targets)**

| Dial | Limit |
|---|---|
| Single-target damage | 85 to 90% of a two-handed melee |
| Area damage | None. So it falls 20% or more behind on big Dangerous and Deadly pulls |
| Sustain | Self only. The lowest supply bill of any lone hero |
| Element | Swapping to a monster's weak side gives half the usual bonus |
| Party | Counts as Melee for party XP. Never a new class |
| Tower +skill | Applies to Melee only |
| Target | Alone on Normal: within 5% of the best lone style. In a four: bottom half |

| Point | Call |
|---|---|
| What it is | Two-handed wraps on Melee. Blows read Melee. Its spells spend mana and runes and level on Magic |
| Source | Drops. It becomes the eighth weapon family |
| Engine | A weapon type, a discipline, and an ability naming its own skill. Systems to confirm |
| Bare hands | Stay as the no-weapon state, on the fist list without its rune spells |

**The sample, built right after phase 0:** Practice Wraps (tier 1, start kit), Sluicer's Knuckles (tier 2, a Glade drop), and two spells: Charged Hands (your next three blows carry the element of the rune you chose) and Second Breath (heals you when you're under half HP, costs mana, levels on Magic). Measured against the budget before any more tiers are made.

---

## 8. The day, after the changes

Hunting numbers are measured. Town plans are proposed; the Level 10 and 40 plans lean on training and must be re-run after the Defense fix.

| Level | An hour of hunting (measured) | Town hours | What crafting gives here |
|---|---|---|---|
| 10 | 20k to 41k Level XP, 2.7k to 4.4k gold | Train. Smith a Copper Ring and Studs. Sew a Graypelt Cloak. Reforge Klappa's Club | The first pieces no hunt drops |
| 40 | 143k to 223k Level XP, -4k to +7k gold | Salts for Tempering. Tier 3 rings and earrings at the forge, necklace, cloak and belt at the workbench. A lining for Dangerous | Six slots, a gem to set, a first reforge from tier 2 |
| 70 | 230k to 580k Level XP, up to 26k gold | Reforge the set to tier 5. Corded linings. Reforge a chest piece. Training has faded | Today this band has nothing in town. Now it has the set to carry up, and not enough gold for all of it |
| 100 | 443k to 760k Level XP, 15k to 26k gold | Tier 7 pieces with Krell's gem. Hallmark tier 7 at skill 99. Sealed linings. Pattern recipes. Sell to hunters | Best in slot for 6 of 14 slots is only made |

Two benches now matter, so an account with several heroes has a reason to raise a smith and a crafter.

---

## 9. Economy

| Gold in | Gold out |
|---|---|
| Coin, loot sold, Tamsin's tasks | Hallmark and reforge fees |
| Crafted goods sold to the shop (a floor) | Tempering, linings, chest reforging |
| Good batch on food (small) | Bench fee, hero slots, the House, training, refills, Blessings, store supplies, market fee and cut |

| Trades | Doesn't |
|---|---|
| All gear, Tower and Catacomb pieces, crafted pieces, gems, patterns, materials, gold-bought training items | Chest keys (Storage only), anything bought with Crowns |

**The market.** Hunters sell gems, hides, parts, spare gear and spare patterns. Smiths sell rings, earrings and buckles. Crafters sell necklaces, cloaks, belts and linings. With about 530 graded rows, order books will be thin until there are players, so the Hallmark step (pick your perk, no market needed) has to carry a solo player. Rolls, tradeable gems and tradeable patterns all go in the Steam and legal review.

---

## 10. Build order

| Phase | What | Size | Server or money surface | Depends on |
|---|---|---|---|---|
| 0 | Drop homes and recipe cuts. Bench stats. Defense fix and Tower raise | | Yes | In flight |
| 1 | Fist sample: wraps at tiers 1 and 2, two spells, the engine type, measured against the budget | M | Yes | Phase 0 drop tables |
| 2 | Jewelry sample of five across both benches, Seam Jasper, the per-piece skill field, one reforge (tier 2 ring to tier 3) | M | Yes, rolls and fees | Phase 0 catalogues |
| 3 | Perk hooks, to four a slot | M | Engine | Phase 2 |
| 4 | Linings | L | Yes | The 11-13 spec. Can run beside 3 |
| 5 | Belts to crafting, with buckles | M | Yes | Phase 2 |
| 6 | Ladders for tiers 4 to 7, 20 rows a batch, each measured, fees re-checked | L | Yes | Phases 3 and 5, the income cut live |
| 7 | Good batch. Patterns, sample of three | M | Yes | Phase 2 |
| 8 | Chest reforging and the gloves wing | M | Yes | The Catacombs build, key arithmetic |
| 9 | Fist tiers 3 to 7 and its Tower rows | L | Yes | Phase 1 measured |

Every "Yes" is on the pre-EA Security list.

---

## 11. Open questions for Tyler

| # | Question | Recommendation |
|---|---|---|
| 1 | Tower weapon ceiling | **RULED by Tyler 11-18:** chest items stay rare, so no hard ceiling. They may be stronger than the next tier's drop, "but that's probably about as far as they should go". Not a hard rule: some randomization and best-in-slot theorycrafting is wanted, and later content's chest gear gets rarer and more powerful (some with 2 perks). The designer proposes the later-game shape |
| 2 | Belts to crafting? | Yes. A hunter, smith and crafter chain and a sixth piece; about 200 more generated rows |
| 3 | 22 perks is 19 new engine hooks. Build all, or open with four a slot and add? | Open with the three built plus enough for four a slot, then add in waves |
| 4 | Tier 6 costs more than a hero banks if it also Tempers fully | Leave it, re-measure after the income cut, then move the tier 6 fee if needed |
| 5 | How many keys does a chest reforge burn? | Sized so Platinum keeps roughly its approved wait; arithmetic comes with the Catacombs build |
| 6 | Runecrafting has nothing new past 60 except the Sealing Rune and good batch | Accept it. A sixth rune tier would undo the five-tier ruling |

---

## What is measured and what isn't

| Kind | What |
|---|---|
| Measured (11-18) | Hunting an hour on every open ground. A weapon tier, an armor tier, Tempering, +10 skill, the Banded Signet plain and Hallmarked, shop jewelry, the Houndskin Cloak, the Tower weapon at today's numbers |
| Built, read from data | 14 slots, roll odds, perk sizes at tiers 2 and 3, fees and ceilings at tiers 2 and 3, Hallmark levels 30 and 45, Tempering prices, Gold Rock at Mining 45 |
| From other lanes, not re-measured | Banked gold per band, linings strengths, Tower and Catacombs weeks |
| Estimates | Post-cut gold (x0.7). The good batch faucet size. The row count |
| Proposed, unmeasured | 19 of the 22 perks, tiers 4 to 7 sizes, every new piece and gem, jewel and chest reforging, the gloves wing, the fist budget, the town plans |
| Not played | A jewelry roll, a Tempering purchase, a mid-game craft |
| Not checked | Proposed names are not checked free. lane/d-drop-homes and lane/d-defense-tower were not opened. The five champion relics were not read |
