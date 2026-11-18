# Second review of the itemization plan (Fable, 2026-11-18)

Independent, read-only review of `docs/design/itemization-system.md` against Tyler's rulings and today's answers. Tags: [D] read in src/data, [R] rulings, [P] the plan's own numbers, [G] estimate.

**Verdict:** the six rules are a sound, learnable spine and match the 11-18 rulings. Not ready to build as written: it counts the worn slots wrong, which breaks the perk-pool answer, the fee sizing and the "4 of 12" pitch.

## Contradictions
| # | Plan says | Found | Tag |
|---|---|---|---|
| C1 | 12 worn slots, crafting owns 4 | 14 slots: two rings (ring1, ring2) plus ammo. Crafting owns 5 worn sockets plus ammo; with cloaks rolling, 5 rolling sockets = 10 perk seats | D |
| C2 | Grow the pool to ~10 so pieces "pick six of ten" | 5 sockets x 2 = 10 seats; a fully Hallmarked hero wears all ten again. The fix doesn't fix it | D+R |
| C3 | Tier 5 gem guarantees Deflect, tier 6 Surge | Rings can't carry Deflect; earrings and cloak can't carry Surge. Fights "player chooses the second perk" | D |
| C4 | All jewelry at Crafting | Tyler: rings and earrings go to Smithing; the jewel skill is one constant today | R+D |
| C5 | Hallmark opens at 30 | Tier 3 Hallmark needs Crafting 45 in data | D |
| C6 | Tier 3 ring from Gold Bars (Level 30) | Gold Rock needs Mining 45 | D |
| C7 | Fist weapons phase 8 | Tyler: ASAP | R |
| C8 | Tower weapon "0 to +2.7%" | Tyler: "pretty major upgrades" | R |
| C9 | Eight ways to fight | Seven weapon families in data | D |
| C10 | Good batch: "no gold moves" | Doubled food sells to the shop: a small faucet (up to +10% of a cook's shop gold) | G |
| C11 | Tier 7 cloak from Troll Hide | A Trollhide Cape already exists at tier 4 | D |

## Holes
- Gloves and belt: Rares only to Level 88 (two slots filled every 10-20 h each).
- ~25 old jewelry/cape rows the plan doesn't place (Gold Ring, Gold Amulet, Ruby Signet, Spider-Eye Studs, Dawnlit Mantle, five champion relics, wave-3 pieces).
- Seam Jasper has no item row or drop row.
- The Warrens parts are used for both cloaks and linings: pick one.
- Smithing 1-14 and 88-99 and Runecrafting 75-99 have no new worn product or a named use.
- Plain rings: a base roll is Plain 88-95% of the time, so chasing a Fine makes piles of shop-floor rings.

## Economy
| Risk | Numbers | Tag |
|---|---|---|
| Fees vs gold banked | Banked per band (before the x0.7 income cut): 1.10M / 1.77M / 1.89M at 45-60 / 60-75 / 75-90. Tempering both tracks 496k / 744k / 992k + Hallmarking 5 sockets 750k / 1.25M / 2.0M = 113% / 113% / 158% of the band's gold BEFORE the cut (~1.5-2.2x after) | D+G |
| Effect | Rational play: Hallmark at tiers 2-3, skip 4-6, buy at 7. Three tiers of ladder nobody Hallmarks | G |
| Hallmark value | Plain ring +1 to +8%, Hallmarked +2 to +9%: two perks add ~+1% for the fee and two gems (~22 hunting hours) | P |
| Gem supply | 5-10 gems per Hallmarked tier, 10-20 h each, one carrier. Needs a market; with few players it won't clear | R+G |
| Row count | Grades are separate item rows: ~24 pieces = ~500 rows and 500 market ceilings, thin order books | D+G |
| Legal | Patterns and gems are tradeable random drops: same Steam review as rolls | R |

## Balance
| Topic | Risk | Proposed limit (unmeasured) |
|---|---|---|
| Perk pool | Ten perks, ten seats: no build | Cap played perks at 6 per hero (player picks), or grow to 14+ with exclusive pools. Cap is cheaper and makes the pick a decision |
| Perk size | Ten perks stacked never run | Whole jewelry set under one weapon tier (~+8%) at every tier, measured with all five worn |
| Tower weapons | Major + reforging up a tier lets one weapon line outrun drops from 15 to 88, gutting rule 1 | About half a tier over its own tier's drop and under the next tier's drop; re-check the L50 = 168 h pace |
| Chest reforging | Keys stockpile (held 30) while only opens are capped at 6/week: a second uncapped road to Platinum | Each reforge counts against the weekly 6 |
| Defense | Town plans at 10 and 40 lean on training | Re-run after the Defense fix |
| Fist hybrid | Element on demand always hits the weak side; two skills train at once; a self-heal makes it a Healer | See budget below |

**Fist weapon budget ("good at everything, great at nothing"):** single-target damage 85-90% of a two-handed melee; no area damage (falls 20%+ behind on big Dangerous/Deadly pulls, so it isn't in every four); self-only sustain and the lowest supply bill of any lone hero; counts as Melee for the party XP rule (never a new class); the element swap gives half the weak-side bonus; Tower +skill applies to Melee only. Target: lone Normal XP within 5% of the best lone style, bottom half in every four.

## Smithing and Crafting after the split
| Band | Smithing | Crafting |
|---|---|---|
| 1-14 | Bars, whetstones, tools, Klappa's reforge, a tier 1 ring | Planks, bronze arrows, Graypelt Cloak, a tier 1 necklace |
| 15-29 | Tier 2 rings and earrings, salts, fittings | Tier 2 necklace and cloak, arrows/bolts, Stitched linings |
| 30-44 | Tier 3 rings and earrings, Fine salts, Steelgrate, first chest reforge | Tier 3 necklace and cloak |
| 45-59 | Tier 4, Mithril salts, reforges | Tier 4 necklace and cloak, Corded linings |
| 60-74 | Tier 5, Rune salts, reforges | Tier 5 necklace and cloak |
| 75-87 | Tier 6, Ember salts, reforges | Tier 6 necklace and cloak, Sealed linings |
| 88-99 | Tier 7, Dawnsteel whetstones, pattern recipes | Tier 7 necklace and cloak, pattern recipes |
Smithing holds 3 of 5 rolling sockets (two rings + earrings) plus reforging; Crafting holds 2 plus linings and ammo. Settle: the gem is set at the piece's own skill; salts makeable at either bench; tier 3 ring metal moves off Gold, or Gold Rock drops to Mining 30.

## Fun
- A craft is only partly exciting: one roll in 8-20 is Fine; the Hallmark step is a purchase. Give the gem roll the reveal, and make the base roll a queue set once.
- Level 40 is the best band (salts, jewelry, lining, training all compete). Level 70 reads as "can't afford any of it" (fees). Level 100 depends on a market with players.
- Re-buying a full Hallmarked set every tier is the same decision six times: let a Hallmarked jewel reforge up a tier.

## Build order
| # | Phase | Depends on |
|---|---|---|
| 0 | In flight: drop homes, bench stats, Defense fix, Tower raise | Nothing |
| 1 | Fix the plan: 14 slots, perk cap, Smithing split, gem rules (paper) | Tyler's answers |
| 2 | Fist sample: wraps at tiers 1-2, two spells, engine type, measured against the budget | Phase 0 drop tables |
| 3 | Jewelry sample of five across both benches, Seam Jasper, the three missing perk hooks | Phase 1 |
| 4 | Linings | 11-13 spec; beside 3 |
| 5 | Fist tiers 3-7 + four Tower rows | Phase 2 measured |
| 6 | Jewelry and cloak tiers 4-7, 20 rows a batch | Phase 3 measured, fees re-sized |
| 7 | Good batch, patterns sample of three | Phase 3 |
| 8 | Chest reforging | Catacombs build, key arithmetic |

## Top 10 fixes
1. Recount to 14 slots and 5 rolling sockets everywhere.
2. Cap played perks per hero (6 of ~10), or the bigger pool changes nothing.
3. Drop "guarantees X" from tier 5 and 6 gems; a main gem lets the player pick.
4. Rewrite the skills, jewelry and day sections for the Smithing split; the jewel skill becomes a per-piece field.
5. Re-size Hallmark fees against post-cut banked gold with Tempering included.
6. Let a Hallmarked jewel reforge up a tier so tiers 4-6 aren't skipped.
7. Move fist weapons to a sample right after phase 0, with the budget written in.
8. Bound Tower weapons under the next tier's drop; reforges count against the weekly 6.
9. Give gloves and belts a Scarce home, or state they're slow on purpose.
10. Place or cut the ~25 orphan jewelry/cape rows; fix Gold Rock at Mining 45.

## Only Tyler can answer
| Question | Recommendation |
|---|---|
| A fully Hallmarked hero wears every perk even at ten. Cap how many play, or accept no build choice? | Cap at 6, player picks |
| 150k-600k per piece is 750k-3M for five sockets a tier, on top of Tempering. Keep per piece? | Keep per piece, add jewel reforging at the fee difference |
| Does a chest reforge use one of the 6 weekly opens? | Yes |

Not checked: lane/d-drop-homes and lane/d-defense-tower contents, the linings spec, the Tower design board; neither itemization tool was run. [G] numbers are guesses.
