# 28. The named pieces: what each one becomes when nothing carries a stat offset

2026-11-23, `lane/named-pieces`, game designer, on `set/v0.2.144` with `lane/gear-catalogue-steps` merged. Owed by `27-formula-overhaul.md` section 2.3, phase A item 3: "a rule that changes how a move plays goes to Signatures. A conditional number goes to the Trait pool. A flat number on top of the base is cut." The gear catalogue lane left every named or unique piece on the formula plus a hand-typed offset (`statPlus`). This file rules each one and the lane applies it as data.

**How it plays:** a named piece is the same piece as any other of its slot and item Level. A Barrow-King's Mantle guards like any cape of its Level. What makes it worth hunting is its name and story, a rule it already had (Kingstooth still bites vermin harder, the Cauldron Lid still turns fire), or a Trait it always carries. No piece is just "the normal one, but bigger".

Read with `14-trait-candidates.md`, `15-signature-candidates.md`, `19-power-ledger.md` (the gear slice) and `12-targets.md` section 7.

## 1. The rule

| Outcome | When | What the row becomes |
|---|---|---|
| **(a) Signature** | Its rule changes how a move plays, it has a living home, and it drops at Level 40 or later (`19` section 2: no Trait or Signature drops before the ramp opens) | A Signature row (15), one per hero |
| **(b) Fixed Trait** | Its identity is a conditional number, it has a home the redesign keeps (or will), and it drops at Level 40 or later | Its slot's plain piece plus one Trait of the 40, at a fixed rank. Hidden on the row as `fixedTrait` until the roller is live |
| **(c) Named plain piece** | It is a ladder rung, or it already carries a real rule (a bane, a resistance, a cloak's Steady armor), or it drops before Level 40 | Name, lore and any rule it carries. Its numbers are the formula's |
| **(d) Cut** | Its home left the plan and its one mark was a stat bump on its tier's piece | Listed for deletion. The rows leave ITEMS with the catalogue lane that deletes them |

What this does NOT do: invent a home for a piece whose creature is gone. The 46 Signatures in `15` already have names and homes written for the new world. Bolting an old name onto one of them would give a Signature two stories.

## 2. The rulings, all 96 rows

81 rows typed an offset by hand, plus 15 crafted jewel grades that copied their plain row's. Counts: **(a) 0, (b) 1, (c) 65, (d) 30.** (Second pass the same day: the Trollhide Cape and the Dragonrib Bow had no home at their Level and were cut; the Chitinweave Cloak and the Wyrmgilt Mantle went back to (c), since they are the cape ladder's tier-6 and tier-8 rungs and a cloak's rule is its Steady armor (tests/hunt-core/temper.mjs holds eight cape tiers); two names were changed; every (d) row is now deleted, section 5.)

"Source today" is `src/data/catalogue-coherence.js`: a reachable door, `greenhaven` or `later` (a source on paper, no open ground), or `none` (AWAITING_ROSTER).

### 2.1 Jewelry: the ladders and the shop (c)

Every jewel is the same piece for every way to fight. The offsets were the old hand-cut ladder. They are now the `jewel` curve (section 3), so a ring at Level 1, 15 and 30 still gives 1, 2 and 3 points of each stat.

| # | Row | Name | Slot, item Level | Source today | Ruling | Becomes |
|---|---|---|---|---|---|---|
| 1 | `copper_ring` | Copper Ring | ring, 1 | shop | (c) | Plain ring, 1 each |
| 2 | `hunter_necklace` | Hunter Necklace | necklace, 1 | shop | (c) | Plain necklace, 1 each (was 2 aim to each style, no damage) |
| 3 | `copper_studs` | Copper Studs | earrings, 1 | shop | (c) | Plain earrings, 1 each |
| 4 | `fang_studs` | Fang Studs | earrings, 15 | shop, Smithing | (c) | Plain earrings, 2 each |
| 5 | `spidereye_studs` | Spider-Eye Studs | earrings, 34 | none | (c) | Plain earrings, 3 each. Its crit is cut |
| 6 | `wraithglass_drops` | Wraithglass Drops | earrings, 40 | later | (c) | Plain earrings, 3 each. Its crit is cut |
| 7 | `rubyfire_studs` | Rubyfire Studs | earrings, 60 | none | (c) | Plain earrings, 4 each. Its crit is cut |
| 8 | `dragon_gem_earrings` | Dragon Gem Earrings | earrings, 82 | none | (c) | The earring capstone, 5 each. Its crit is cut |
| 9 | `wolfbone_torc` | Wolfbone Necklace | necklace, 15 | shop, Smithing | (c) | Plain necklace, 3 each |
| 10 | `spidersilk_choker` | Spidersilk Choker | necklace, 34 | greenhaven | (c) | Plain necklace, 5 each |
| 11 | `warlords_torc` | Warlord's Necklace | necklace, 40 | later | (c) | Plain necklace, 5 each |
| 12 | `dawnbound_amulet` | Dawnbound Amulet | necklace, 86 | none | (c) | The necklace capstone, 10 each |
| 13 | `banded_signet` | Banded Signet | ring, 15 | shop, Smithing | (c) | Plain ring, 2 each |
| 14 | `seam_jasper_band` | Seam Jasper Band | ring, 30 | shop, Smithing | (c) | Plain ring, 3 each |
| 15 | `ruby_signet` | Ruby Signet | ring, 60 | none | (c) | Plain ring, 5 each. Its crit is cut |
| 16 | `spellstone_ring` | Spellstone Ring | ring, 68 | none | (c) | Plain ring, 6 each. Its Magic lean and crit are cut |
| 17 | `dawnforged_signet` | Dawnforged Signet | ring, 84 | none | (c) | The ring capstone, 7 each |
| 18-23 | `banded_signet_keen` and its five other grades | Banded Signet (Keen, Surge, Follow-through, and the three Hallmarked pairs) | ring, 15 | Smithing | (c) | Copies of the Banded Signet's numbers. Their perks are untouched (section 5) |
| 24-29 | `seam_jasper_band_keen` and its five other grades | Seam Jasper Band grades | ring, 30 | Smithing | (c) | Copies of the Seam Jasper Band's numbers |
| 30-32 | `fang_studs_steady`, `fang_studs_focus`, `fang_studs_steady_focus` | Fang Studs grades | earrings, 15 | Smithing | (c) | Copies of the Fang Studs' numbers |

### 2.2 Champion relics (b, c)

A champion's relic is the rare-find moment. Below Level 40 it can't carry a Trait (the ramp), so it's a named find, not more power. The one past 40 whose home fits the new world gets a Trait.

| # | Row | Name | Slot, item Level | Source today | Ruling | Becomes |
|---|---|---|---|---|---|---|
| 33 | `tusker_charm` | Tusker's Charm | necklace, 8 | greenhaven (Old Tusker) | (c) | Plain necklace with its name |
| 34 | `packlord_band` | Packlord's Band | ring, 22 | greenhaven (Gnoll Packlord) | (c) | Plain ring with its name |
| 35 | `mirewort_drops` | Mirewort Drops | earrings, 38 | greenhaven (Mire Witch) | (c) | Plain earrings with its name |
| 36 | `barrowking_mantle` | Barrow-King's Mantle | cape, 52 | later (Barrow King) | (b) | Captain's Due, rank 1. Keeps its Steady armor. Its home moves to Muster Barrows when the Barrow King joins its roster: a dead king's cloak, worn against the barrows' captains |
| 37 | `jarls_rimetorc` | Jarl's Collar | necklace, 66 | later (Frost Jarl) | (c) | Plain necklace with its name. No necklace Trait is about cold, so it waits for its region and is ruled again there |

### 2.3 Capes (c)

A cape's own rule is its Steady armor (`steadyPm`), which every cape keeps. The stat offsets were one or two points.

| # | Row | Name | Slot, item Level | Source today | Ruling | Becomes |
|---|---|---|---|---|---|---|
| 38 | `graypelt_cloak` | Graypelt Cloak | cape, 8 | Crafting 1 | (c) | Plain cape, Steady 30. Its half point of crit is cut |
| 39 | `grayjaws_ruff` | Grayjaw's Ruff | cape, 12 | Old Grayjaw | (c) | Steady 50 against the Woollen Cloak's 30 at the same Level, so it stays the better cape. Its crit is cut |
| 40 | `houndskin_cloak` | Houndskin Cloak | cape, 22 | Glade Poacher, Crafting | (c) | Plain cape, Steady 70 |
| 41 | `warband_bulwark` | Warband Bulwark | cape, 30 | Crafting 30 | (c) | Plain cape, Steady 110 |
| 42 | `trollhide_cape` | Trollhide Cape | cape, 40 | later (Mountain Troll) | (d) | Cut. Its one lore home, Carter's Rest, opens at Level 88, so a Level 50 cape there drops outgrown. The tier-4 cape rung has no source either way |
| 43 | `shadowsilk_cape` | Spidersilk Cape (was Shadowsilk) | cape, 60 | later | (c) | Plain cape, Steady 185. Renamed: "Shadow" is a filler word, and its own text says it is spider silk off a loom, like the Spidersilk Choker |
| 44 | `dawnlit_mantle` | Dawnlit Mantle | cape, 88 | none | (c) | The cape capstone, Steady 255 |

### 2.4 Shields (c)

The offsets were the shield ladder's old guards (3 to 13, +2 a tier). The `guard` curve now gives those guards itself, and Krell's Tollgate's 15 at 88. The two grates keep their trade as a weight of shield, not an offset.

| # | Row | Name | Slot, item Level | Source today | Ruling | Becomes |
|---|---|---|---|---|---|---|
| 45 | `practice_shield` | Practice Shield | shield, 1 | start kit | (c) | Guard 3 (was 2) |
| 46 | `bronze_rimmed_shield` | Bronze-Rimmed Shield | shield, 1 | shop | (c) | Guard 3. The shield a hero who didn't start as a tank buys |
| 47 | `ironbound_shield` | Ironbound Shield | shield, 15 | Drain Rat | (c) | Guard 5 |
| 48 | `kingsgrate` | Kingsgrate | shield, 15 | Rat King | (c) | A grate (`gearProfile: 'grate'`): guard 7, every style's aim 4 under. Same as before |
| 49 | `coppercap_shield` | Coppercap Shield | shield, 30 | Coppercap Warrens | (c) | Guard 7 |
| 50 | `steelgrate` | Steelgrate | shield, 30 | Smithing 30 | (c) | A grate: guard 10 (was 9), aim 5 under |
| 51 | `cauldron_lid` | Cauldron Lid | shield, 30 | the called Chief Coppercap | (c) | Guard 7 (was 6) and its 10% less fire. A boss's drop is allowed to beat the plain one |
| 52 | `mithril_faced_shield` | Mithril-Faced Shield | shield, 40 | Bannerman | (c) | Guard 8 (was 9) |
| 53 | `runebound_shield` | Runebound Shield | shield, 60 | Barrow Pikeman, Lurcher | (c) | Guard 11 |
| 54 | `ember_tower_shield` | Emberforged Tower Shield | shield, 75 | Grave Guard, Provost | (c) | Guard 13 |

### 2.5 Weapons with a bane, and the rest kept (c)

A bane ("10% more to vermin") is a matchup rule: it says which ground a weapon suits. That is a real decision, so these keep it. Their offsets were a point or two either way.

| # | Row | Name | Slot, item Level | Source today | Ruling | Becomes |
|---|---|---|---|---|---|---|
| 55 | `kingstooth` | Kingstooth | sword, 15 | the called Rat King | (c) | The Iron Sword's numbers and 10% more to vermin |
| 56 | `bramble_blade` | Bramble Blade | sword, 15 | Turncoat | (c) | The Iron Sword's numbers and its plant bane |
| 57 | `rat_stick` | Rat Stick | hammer, 30 | greenhaven | (c) | The tier's warhammer and its vermin bane |
| 58 | `lazlos_maul` | Lazlo's Maul | hammer, 45 | later | (c) | The tier's warhammer and its undead bane |
| 59 | `void_censer` | Banishing Censer (was Void Censer) | staff, 60 | later | (c) | The tier's staff and its bane against things from outside (extra-dimensional). Renamed: "Void" is a filler word, and a censer that drives those things off banishes them |
| 60 | `dragonrib_bow` | Dragonrib Bow | bow, 75 | later (Draconia) | (d) | Cut. Its one lore home, Wyvern Roost, opens at Level 125, past the bow's tier, and its creature left the plan |
| 61 | `demoncaller_staff` | Demoncaller | staff, 68 | none | (c) | Plain staff. Its future is its special-attribute twin (the Provost, Pyre Field, undead bane) |
| 62 | `klappas_club` | Klappa's Klub | hammer, 5 | Smithing 1 (reforge) | (c) | The formula's club at its own Level 5: 4 aim and 8 damage, between the Practice Club's 3 / 6 and the Iron Warhammer's 6 / 13. It was the Iron Warhammer's damage with its aim cut, a stat bump with a trade. Andy's club keeps its name, its reforge and its tutorial card |
| 63 | `oak_practice_blade` | Oak Practice Blade | sword, 1 | premium login reward | (c) | The practice sword's numbers (it was 2 under). A login keepsake, not power. Premium is Tyler's |
| 64 | `verdite_blade` | Verdite Blade | sword, 38 | none | (c) | The tier's sword |
| 65 | `verdite_platelegs` | Verdite Platelegs | legs, 38 | none | (c) | The tier's plate legs |
| 66 | `heartgarnet_maul` | Heartgarnet Maul | hammer, 42 | none | (c) | The tier's warhammer |

### 2.6 Cut (d)

Each of these was its tier's piece plus a bump, and the creature, dungeon or system that dropped it is gone. Five were the deleted dungeons' boss weapons (2026-10-14). Five were the tier-8 "hunt-forged" kit with a third more armor than Dawnsteel and no plate penalty (its cape stays, a ladder rung), which is exactly the flat number the redesign cuts. Two names use filler words (Void, Fallen).

| # | Row | Name | Slot, item Level | Source today | Ruling | Becomes |
|---|---|---|---|---|---|---|
| 67 | `dragonrend_greatblade` | Dragonrend | sword, 88 | none | (d) | Cut. +7 damage and 2% crit on Dawnsteel |
| 68 | `crown_of_the_fallen_king` | Crown of the Fallen King | helmet, 85 | none | (d) | Cut. A plate helm with the plate penalty bought off |
| 69 | `emberfang_blade` | Emberfang | sword, 72 | later (Elder Cinder) | (d) | Cut. Crit for damage |
| 70 | `panthers_eye_pendant` | Panther's Eye Pendant | necklace, 68 | later (Panther) | (d) | Cut. Crit |
| 71 | `wraithsilk_shroud` | Wraithsilk Shroud | body, 52 | later (Grave Banshee) | (d) | Cut. Cloth that fought like leather |
| 72 | `widows_fang` | Widow's Fang | sword, 38 | none | (d) | Cut. Crit |
| 73 | `special:widows_fang` | Widow's Fang (the special sample) | sword, 15 | hidden sample | (d) | Cut. Crit is a flat number. The crit attribute kind stays only for the staged weapon line past Dawnsteel, whose sort is owed (section 5) |
| 74 | `plaguewarden_greaves` | Plaguewarden Leg Plates | legs, 54 | none | (d) | Cut. Plate penalty bought off |
| 75 | `hollow_sigil_ring` | Hollow Sigil Ring | ring, 35 | none | (d) | Cut. A Magic-leaning ring |
| 76 | `fangdart_recurve` | Fangdart Recurve | bow, 36 | none | (d) | Cut. Crit for damage |
| 77 | `alphaheart_longbow` | Alphaheart Longbow | bow, 50 | none | (d) | Cut. Crit |
| 78 | `nightstalker_pelt` | Nightstalker's Pelt | body, 62 | none | (d) | Cut. Leather that fought like cloth |
| 79 | `chitinweave_cloak` | Chitinweave Cloak | cape, 76 | later (Broodmother) | (c) | The cape ladder's tier-6 rung, Steady 220. Its crit is cut (it was (d) in the first pass) |
| 80 | `gold_ring` | Gold Ring | ring, 30 | none | (d) | Cut. A melee-leaning copy of the Seam Jasper Band |
| 81 | `gold_amulet` | Gold Amulet | necklace, 30 | none | (d) | Cut. Same |
| 82 | `captains_ribblade` | Captain's Ribblade | sword, 30 | later (Death Knight) | (d) | Cut. A tier's sword plus 5 / 4 |
| 83 | `chief_blade` | Chief's Blade | sword, 15 | later (War King) | (d) | Cut. Same |
| 84 | `alpha_cloak` | Alpha Cloak | cape, 30 | later (Ancient Bear) | (d) | Cut. A cape plus 2 aim |
| 85 | `quiet_coat` | Quiet Coat | body, 75 | none | (d) | Cut. +19 Magic damage, and its "first strike" rule never had an engine |
| 86 | `regent_helm` | Hollow Regent Helm | helmet, 88 | none | (d) | Cut. Tier-8 kit |
| 87 | `slagheart_platebody` | Slagheart Platebody | body, 88 | none | (d) | Cut. Tier-8 kit |
| 88 | `abyssal_greaves` | Abyssal Leg Plates | legs, 88 | none | (d) | Cut. Tier-8 kit |
| 89 | `choirbone_gauntlets` | Choirbone Gauntlets | gloves, 88 | none | (d) | Cut. Tier-8 kit |
| 90 | `warden_girdle` | Warden's Girdle | belt, 88 | none | (d) | Cut. Tier-8 kit |
| 91 | `wyrmgilt_mantle` | Wyrmgilt Mantle | cape, 88 | none | (c) | The cape ladder's tier-8 rung, Steady 285. Its aim bonus is cut (it was (d) in the first pass) |
| 92 | `wartusk_cleaver` | Wartusk Cleaver | sword, 35 | none (Grimtusk's dungeon) | (d) | Cut |
| 93 | `whispering_codex` | Whispering Codex | wand, 45 | none (the Pale Archivist's dungeon) | (d) | Cut |
| 94 | `ashcrown_greatsword` | Ashcrown Greatsword | sword, 65 | none (the Ashen King's dungeon) | (d) | Cut |
| 95 | `voidmaw_scepter` | Voidmaw Scepter | wand, 80 | none (the Riftmaw's dungeon) | (d) | Cut |
| 96 | `dragonfang_pike` | Dragonfang Pike | sword, 95 | none (Elderscale's dungeon) | (d) | Cut. The Tower already holds the top weapons (`12` section 7) |

**Why no Signatures (a).** None of the 96 passes all three tests. The pieces with a living home drop under Level 40 (Kingstooth, the Cauldron Lid, Grayjaw's Ruff) or are ladder rungs (the shields from Hask's Ford, Muster Barrows and Krell's Hold, whose monsters already own their Signatures in `15`: the Bannerman's Pavise, the Pikeman's Gauntlets, the Grave Guard's Mail). The ones with a strong name and no home are the five dungeon weapons, and the Tower's weapons already carry the top chase with their own story. The Tower weapons and the 24 Catacomb pieces carry no offset, so this file doesn't touch them.

## 3. The two straight curves and the grate

Applied in `src/data/gear-profiles.js`:

- **`guard`**, `35.9 + 1.667 x iL`, the shield profile at 1000. Guards at item Levels 1 / 15 / 30 / 40 / 60 / 75 / 88: 3 / 5 / 7 / 8 / 11 / 13 / 15. The old ladder was 3 / 5 / 7 / 9 / 11 / 13 and Krell's Tollgate 15. On the `defense` curve a Level 15 shield guarded 2.
- **`jewel`**, `18.6 + 1.38 x iL`, the jewel profile at 1000 for each of the six stats. A ring at 1 / 15 / 30 / 60 / 84: 1 / 2 / 3 / 5 / 7. Necklaces carry 1.4 times a ring and earrings 0.8 (the slot shares). On the `offense` curve at 200, every jewel under Level 22 gave nothing, so the shop's Copper Ring and the Smithing 15 Banded Signet would have been empty.
- **`grate`**, the shield's guard at 1400 and every style's aim at -800. A grate guards 1.4 times a plain shield and costs aim: the tank's choice, the way plate is a choice for armor.

Verified by `node tools/gen-gear.mjs` (the table above is its output, rounded) and the guards in section 6.

## 4. Walk-through, against today's data

**The club hero's first reforge** (Klappa's Klub, the only kept piece whose numbers a new player meets in the first hour):

| Step | What the player holds or can reach (steps before only, and the start kit) | Doable? |
|---|---|---|
| 1. Pick the club at creation | `src/data/start-kit.js` gives the club style the Practice Club (`practice_club`, aim 3, damage 6) | Yes |
| 2. Reach Level 5 | The Mill Cellar and the Thicket, the first grounds | Yes |
| 3. Gather 6 Bronze Bars and 3 Small Fangs | `tests/style-gear.mjs` SG-7 proves each has a first-hour door (a Cellar monster, a Level 1 rock or a Level 1 bench) | Yes |
| 4. Smithing, Reforge Klappa's Klub | `reforge_klappas_club`, Smithing 1, spends the Practice Club | Yes |
| 5. Wear it | Klappa's Klub, Level 5: aim 4, damage 8 (`src/data/gear-stats.generated.js`) | Yes, a third more damage |
| 6. Next rung | Iron Warhammer at Level 15: aim 6, damage 13 | Yes |

**The Barrow-King's Mantle** (the one fixed Trait):

| Step | What the player holds or can reach | Doable? |
|---|---|---|
| 1. Hunt the Barrow King | `barrow_king` is a champion with no open ground (`later`) | Owed: Muster Barrows' roster |
| 2. The mantle drops | `src/data/monsters.js` row, 0.43% a champion kill | Data yes, home owed |
| 3. It carries Captain's Due, rank 1 | `fixedTrait` on the row, Captain's Due a cape Trait in `src/data/traits.js` | Data yes, the roller reads it in wave 4 |
| 4. Rank 1 is allowed | Muster Barrows' entry Level 55 rolls rank 1 only (`19` section 2) | Yes |

## 5. Owed, not done here

- **Done in the second pass (2026-11-23):** the 29 cut ITEMS rows (the (d) rows above but the special sample, already gone) left ITEMS, their monsters' drop rows, descriptions, art lists and the coherence lists, and `hr_items` loses them in the lane's catalogue migration. Nobody can hold one: every one was sourceless or on a ground that never opened. The hearthfind kill-rate guard keeps the four tier-8 pieces it measured with as a test-local kit. Five cut pieces were lucky finds on old-roster creatures (no open ground spawns any of them), and the lucky-find guard holds four a tier, so four sourceless pieces with art and lore took the rows: the Panther's Ruby Signet (it already drops rubies), Elder Cinder's Dawnlit Mantle (it drops Dawnstone), Draconia's Dawnbound Amulet (dragon gem and dawnsteel), and the Mountain Troll's Rubyfire Studs. Two pieces were renamed: Spidersilk Cape and Banishing Censer.
- **Jewel perks** (Keen, Surge, Follow-through, Steady, Focus, `src/data/jewelry.js`) are the other half of phase A item 3. They are chances and shares, not stat offsets, so this lane didn't touch them. They belong with the Trait pool's ring and earring rows.
- **Homes:** the Barrow King's champion goes onto Muster Barrows for its mantle's Trait to drop.
- **The staged weapon line past Dawnsteel** (`tools/balance-sim/staged/weapon-line.js`) carries crit and bane uniques built on the special-attribute plan. They hold no offset, so they aren't in this table, but their crit is the same flat number and goes in the same sort.
- **Bane size.** A bane today is up to +40% (`MAX_BANE_MULT`), far past a Trait's 3.5%. It needs its size in the power ledger with the rest of the conditional numbers (`27` G-3).

## 6. Guards

- `tests/gear-stats.mjs` GSF-2: no item module states a `statPlus` and no loaded row carries one. `src/core/gear-stats.js` refuses a row that does, and `tools/gen-gear.mjs --selftest` proves the refusal.
- `tests/gear-stats.mjs` GSF-8: a `fixedTrait` names a real Trait made for its row's slot, at rank 1 to 3, and this table's (b) rows and the rows that carry one are the same.
- `tests/style-gear.mjs` SG-7: Klappa's Klub sits between the Practice Club and the Iron Warhammer.
