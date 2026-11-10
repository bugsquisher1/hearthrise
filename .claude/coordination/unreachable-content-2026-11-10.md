# Unreachable content, 2026-11-10 (for the designer's cut list; nothing here is deleted)

Systems engineer, `lane/b-client-debt`, on main 18c34c8e7 (v0.2.114). Architecture audit 2026-11-09 part 3, S5.
Built from the catalogue's own functions, not typed: `reachableSources()`, `itemSources()`, `AWAITING_ROSTER` and `UNREACHABLE`
(src/data/catalogue-coherence.js), and the open grounds' pockets (src/data/hunt-grounds.js). "Staged pack" is a whole-word
match of the id in the lines each branch ADDS under `src/` against main (origin/lane/b-slake-and-ford, b-muster-barrows,
b-pyre-field, b-phase0-tier4), and of the id or name in the Krell's Hold section of the board (lane/d-krells-hold is design
only and already on main). A match means the branch names it, not that it sources it: read the branch before relying on it.

| | Total | Reachable | Unreachable | Named by a staged pack | Filler-named (Shadow, Void, Dark, Ancient, Abyssal ...) |
|---|---|---|---|---|---|
| Items | 582 | 335 | 247 | 106 | 13 |
| Monsters | 144 | 34 | 110 | 4 | 6 |

## Items

### Items with no source at all (AWAITING_ROSTER): 142

| id | name | kind | why unreachable | staged pack that names it |
|---|---|---|---|---|
| `abyssal_greaves` | Abyssal Greaves (filler name) | armor t8 | as the heading | none |
| `archmage_belt` | Archmage Sash | armor t6 | as the heading | none |
| `archmage_body` | Archmage Robe Top | armor t6 | as the heading | d-krells-hold (design, on the board) |
| `archmage_helmet` | Archmage Hat | armor t6 | as the heading | d-krells-hold (design, on the board) |
| `archmage_pants` | Archmage Robe Bottom | armor t6 | as the heading | d-krells-hold (design, on the board) |
| `chitin_belt` | Chitin Belt | armor t4 | as the heading | none |
| `chitin_body` | Chitin Body | armor t4 | as the heading | none |
| `chitin_boots` | Chitin Boots | armor t4 | as the heading | none |
| `chitin_gloves` | Chitin Vambraces | armor t4 | as the heading | none |
| `chitin_helmet` | Chitin Coif | armor t4 | as the heading | none |
| `chitin_pants` | Chitin Chaps | armor t4 | as the heading | none |
| `choirbone_gauntlets` | Choirbone Gauntlets | armor t8 | as the heading | none |
| `crown_of_the_fallen_king` | Crown of the Fallen King | armor t7 | as the heading | none |
| `dawn_belt` | Dawnsteel Belt | armor t7 | as the heading | none |
| `dawn_boots` | Dawnsteel Boots | armor t7 | as the heading | none |
| `dawn_gauntlets` | Dawnsteel Gauntlets | armor t7 | as the heading | none |
| `dawn_helm` | Dawnsteel Helm | armor t7 | as the heading | none |
| `dawn_platebody` | Dawnsteel Platebody | armor t7 | as the heading | none |
| `dawn_platelegs` | Dawnsteel Platelegs | armor t7 | as the heading | none |
| `dawnlit_mantle` | Dawnlit Mantle | armor t7 | as the heading | none |
| `dragonhide_belt` | Dragonhide Belt | armor t6 | as the heading | none |
| `dragonhide_body` | Dragonhide Body | armor t6 | as the heading | d-krells-hold (design, on the board) |
| `dragonhide_boots` | Dragonhide Boots | armor t6 | as the heading | d-krells-hold (design, on the board) |
| `dragonhide_gloves` | Dragonhide Vambraces | armor t6 | as the heading | none |
| `dragonhide_helmet` | Dragonhide Coif | armor t6 | as the heading | d-krells-hold (design, on the board) |
| `dragonhide_pants` | Dragonhide Chaps | armor t6 | as the heading | d-krells-hold (design, on the board) |
| `elderscale_platebody` | Elderscale Platebody | armor | as the heading | none |
| `ember_belt` | Emberforged Belt | armor t6 | as the heading | none |
| `ember_boots` | Emberforged Boots | armor t6 | as the heading | d-krells-hold (design, on the board) |
| `ember_helm` | Emberforged Helm | armor t6 | as the heading | d-krells-hold (design, on the board) |
| `ember_platebody` | Emberforged Platebody | armor t6 | as the heading | d-krells-hold (design, on the board) |
| `ember_platelegs` | Emberforged Platelegs | armor t6 | as the heading | b-pyre-field, d-krells-hold (design, on the board) |
| `mithril_helm` | Mithril Helm | armor t4 | as the heading | b-slake-and-ford, b-pyre-field |
| `mithril_platebody` | Mithril Platebody | armor t4 | as the heading | b-slake-and-ford, b-pyre-field |
| `mithril_platelegs` | Mithril Platelegs | armor t4 | as the heading | b-slake-and-ford, b-pyre-field |
| `nightstalker_pelt` | Nightstalker's Pelt | armor t5 | as the heading | none |
| `plaguewarden_greaves` | Plaguewarden Greaves | armor t5 | as the heading | none |
| `quiet_coat` | Quiet Coat | armor t6 | as the heading | none |
| `regent_helm` | Hollow Regent Helm | armor t8 | as the heading | none |
| `riftmaw_carapace` | Riftmaw Carapace | armor | as the heading | none |
| `rune_helm` | Rune Helm | armor t5 | as the heading | b-muster-barrows, b-pyre-field |
| `rune_platebody` | Rune Platebody | armor t5 | as the heading | b-muster-barrows, b-pyre-field |
| `rune_platelegs` | Rune Platelegs | armor t5 | as the heading | b-muster-barrows, b-pyre-field |
| `slagheart_platebody` | Slagheart Platebody | armor t8 | as the heading | b-slake-and-ford, b-pyre-field |
| `snakeskin_body` | Snakeskin Body | armor t4 | as the heading | b-slake-and-ford, b-pyre-field |
| `snakeskin_helmet` | Snakeskin Coif | armor t4 | as the heading | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `snakeskin_pants` | Snakeskin Chaps | armor t4 | as the heading | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `sorcerer_body` | Sorcerer Robe Top | armor t5 | as the heading | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `sorcerer_helmet` | Sorcerer Hat | armor t5 | as the heading | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `sorcerer_pants` | Sorcerer Robe Bottom | armor t5 | as the heading | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `verdite_helm` | Verdite Helm | armor t4 | as the heading | none |
| `verdite_platebody` | Verdite Platebody | armor t4 | as the heading | none |
| `verdite_platelegs` | Verdite Platelegs | armor t4 | as the heading | none |
| `voidheart_robe` | Voidheart Robe | armor | as the heading | none |
| `voidhide_belt` | Voidhide Belt | armor t7 | as the heading | none |
| `voidhide_body` | Voidhide Body | armor t7 | as the heading | none |
| `voidhide_boots` | Voidhide Boots | armor t7 | as the heading | none |
| `voidhide_gloves` | Voidhide Vambraces | armor t7 | as the heading | none |
| `voidhide_helmet` | Voidhide Coif | armor t7 | as the heading | none |
| `voidhide_pants` | Voidhide Chaps | armor t7 | as the heading | none |
| `voidweave_belt` | Voidweave Sash | armor t7 | as the heading | none |
| `voidweave_body` | Voidweave Robe Top | armor t7 | as the heading | none |
| `voidweave_boots` | Voidweave Slippers | armor t7 | as the heading | none |
| `voidweave_gloves` | Voidweave Gloves | armor t7 | as the heading | none |
| `voidweave_helmet` | Voidweave Hat | armor t7 | as the heading | none |
| `voidweave_pants` | Voidweave Robe Bottom | armor t7 | as the heading | none |
| `warband_bulwark` | Warband Bulwark | armor t3 | as the heading | none |
| `warden_girdle` | Warden's Girdle | armor t8 | as the heading | b-slake-and-ford, b-pyre-field |
| `warlock_body` | Warlock Robe Top | armor t4 | as the heading | b-slake-and-ford, b-pyre-field |
| `warlock_pants` | Warlock Robe Bottom | armor t4 | as the heading | b-slake-and-ford, b-pyre-field |
| `watchknight_belt` | Watchknight Belt | armor t5 | as the heading | none |
| `watchknight_body` | Watchknight Cuirass | armor t5 | as the heading | none |
| `watchknight_boots` | Watchknight Boots | armor t5 | as the heading | none |
| `watchknight_gloves` | Watchknight Gauntlets | armor t5 | as the heading | none |
| `watchknight_helmet` | Watchknight Helm | armor t5 | as the heading | none |
| `watchknight_pants` | Watchknight Greaves | armor t5 | as the heading | none |
| `woolen_cloak` | Woollen Cloak | armor t1 | as the heading | none |
| `wyrmgilt_mantle` | Wyrmgilt Mantle | armor t8 | as the heading | none |
| `wyvernhide_body` | Wyvernhide Body | armor t5 | as the heading | b-muster-barrows, b-pyre-field |
| `wyvernhide_helmet` | Wyvernhide Coif | armor t5 | as the heading | b-muster-barrows, b-pyre-field |
| `wyvernhide_pants` | Wyvernhide Chaps | armor t5 | as the heading | b-muster-barrows, b-pyre-field |
| `dawnbound_amulet` | Dawnbound Amulet | jewelry t7 | as the heading | none |
| `dawnforged_signet` | Dawnforged Signet | jewelry t7 | as the heading | none |
| `dragon_gem_earrings` | Dragon Gem Earrings | jewelry t8 | as the heading | none |
| `gold_amulet` | Gold Amulet | jewelry | as the heading | b-pyre-field |
| `gold_ring` | Gold Ring | jewelry | as the heading | none |
| `hollow_sigil_ring` | Hollow Sigil Ring | jewelry t3 | as the heading | none |
| `ruby_signet` | Ruby Signet | jewelry t5 | as the heading | none |
| `rubyfire_studs` | Rubyfire Studs | jewelry t5 | as the heading | none |
| `spellstone_ring` | Spellstone Ring | jewelry t6 | as the heading | b-pyre-field |
| `spidereye_studs` | Spider-Eye Studs | jewelry t3 | as the heading | b-pyre-field |
| `choirbone` | Choirbone | material t6 | as the heading | none |
| `dragon_relic` | Dragon Relic | material | as the heading | none |
| `elderscale_heart` | Elderscale Heart | material | as the heading | none |
| `hearth_token` | Hearth Token | material | as the heading | none |
| `riftmaw_husk` | Riftmaw Husk | material | as the heading | none |
| `slagheart_core` | Slagheart Core | material t6 | as the heading | b-slake-and-ford, b-pyre-field |
| `void_essence` | Void Essence (filler name) | material | as the heading | none |
| `warden_seal` | Warden's Seal | material t7 | as the heading | b-slake-and-ford, b-pyre-field |
| `wyrm_gilding` | Wyrm Gilding | material t7 | as the heading | none |
| `bone_needle` | Bone Needle | tool | as the heading | none |
| `bronze_hammer` | Bronze Hammer | tool | as the heading | none |
| `bronze_knife` | Bronze Knife | tool | as the heading | none |
| `dawnsteel_rod` | Dawnsteel Rod | tool | as the heading | none |
| `duskwood_rod` | Duskwood Rod | tool | as the heading | none |
| `maple_rod` | Maple Rod | tool | as the heading | b-slake-and-ford, b-pyre-field |
| `oak_rod` | Oak Rod | tool | as the heading | none |
| `rune_hammer` | Rune Hammer | tool | as the heading | b-muster-barrows, b-pyre-field |
| `rune_knife` | Rune Knife | tool | as the heading | b-muster-barrows, b-pyre-field |
| `rune_needle` | Rune Needle | tool | as the heading | b-muster-barrows, b-pyre-field |
| `runewood_rod` | Runewood Rod | tool | as the heading | b-muster-barrows, b-pyre-field |
| `steel_hammer` | Steel Hammer | tool | as the heading | b-pyre-field |
| `steel_knife` | Steel Knife | tool | as the heading | b-pyre-field |
| `steel_needle` | Steel Needle | tool | as the heading | none |
| `willow_rod` | Willow Rod | tool | as the heading | none |
| `yew_rod` | Yew Rod | tool | as the heading | b-muster-barrows, b-pyre-field |
| `lexarch_seal` | Archivist Seal | trophy | as the heading | none |
| `voidwoven_sigil` | Voidwoven Sigil | trophy | as the heading | none |
| `warboss_standard` | Warboss Standard | trophy | as the heading | b-slake-and-ford, b-pyre-field |
| `alphaheart_longbow` | Alphaheart Longbow | weapon t4 | as the heading | none |
| `ashcrown_greatsword` | Ashcrown Greatsword | weapon | as the heading | none |
| `dawn_sword` | Dawnsteel Sword | weapon t7 | as the heading | d-krells-hold (design, on the board) |
| `dawn_warhammer` | Dawnsteel Warhammer | weapon t7 | as the heading | d-krells-hold (design, on the board) |
| `demoncaller_staff` | Demoncaller | weapon t6 | as the heading | none |
| `dragonfang_pike` | Dragonfang Pike | weapon | as the heading | none |
| `dragonrend_greatblade` | Dragonrend | weapon t8 | as the heading | none |
| `duskwood_bow` | Duskwood Bow | weapon t7 | as the heading | d-krells-hold (design, on the board) |
| `duskwood_staff` | Duskwood Staff | weapon t7 | as the heading | d-krells-hold (design, on the board) |
| `ember_sword` | Emberforged Sword | weapon t6 | as the heading | b-pyre-field, d-krells-hold (design, on the board) |
| `ember_warhammer` | Emberforged Warhammer | weapon t6 | as the heading | b-pyre-field, d-krells-hold (design, on the board) |
| `fangdart_recurve` | Fangdart Recurve | weapon t3 | as the heading | b-pyre-field |
| `heartgarnet_maul` | Heartgarnet Maul | weapon t4 | as the heading | none |
| `maple_staff` | Maple Staff | weapon t4 | as the heading | b-slake-and-ford, b-pyre-field |
| `mithril_sword` | Mithril Sword | weapon t4 | as the heading | b-slake-and-ford, b-pyre-field |
| `mithril_warhammer` | Mithril Warhammer | weapon t4 | as the heading | b-slake-and-ford, b-pyre-field |
| `rune_warhammer` | Rune Warhammer | weapon t5 | as the heading | b-muster-barrows, b-pyre-field |
| `runewood_bow` | Runewood Bow | weapon t6 | as the heading | b-muster-barrows, b-pyre-field, d-krells-hold (design, on the board) |
| `verdite_blade` | Verdite Blade | weapon t4 | as the heading | none |
| `voidmaw_scepter` | Voidmaw Scepter | weapon | as the heading | none |
| `wartusk_cleaver` | Wartusk Cleaver | weapon | as the heading | none |
| `whispering_codex` | Whispering Codex | weapon | as the heading | none |
| `widows_fang` | Widow's Fang | weapon t3 | as the heading | none |

Why, for every row above: NO source of any kind (held since the 2026-10-14 demolition "for the roster").

### Items already tagged for a cut: 18

| id | name | kind | why unreachable | staged pack that names it |
|---|---|---|---|---|
| `abyssal_pearl` | Abyssal Pearl (filler name) | material t6 | as the heading | none |
| `brute_plate` | Brute Plate | material | as the heading | none |
| `captain_medal` | Captain Medal | material | as the heading | none |
| `dark_sigil` | Dark Sigil (filler name) | material | as the heading | none |
| `death_steel` | Death Steel | material | as the heading | none |
| `dire_fang` | Dire Fang | material | as the heading | none |
| `hell_ember` | Hell Ember | material | as the heading | none |
| `hollow_sigil` | Hollow Sigil | material | as the heading | none |
| `night_fang` | Night Fang | material | as the heading | none |
| `plague_ichor` | Plague Ichor | material | as the heading | none |
| `ruby` | Ruby | material | as the heading | none |
| `rune_frag` | Rune Fragment | material | as the heading | none |
| `shadow_pelt` | Shadow Pelt (filler name) | material | as the heading | none |
| `shadow_thread` | Shadow Thread (filler name) | material | as the heading | none |
| `spider_eye` | Spider Eye | material | as the heading | none |
| `swarm_heart` | Swarm Heart | material | as the heading | none |
| `warlord_badge` | Warlord Badge | material | as the heading | none |
| `bronze_sword` | Bronze Sword | weapon t1 | as the heading | none |

Why, for every row above: vendor trash of a creature with no ground; tagged for a cut (Tyler approves) [monster drop].

### Items tagged "a later region, or cut": 72

| id | name | kind | why unreachable | staged pack that names it |
|---|---|---|---|---|
| `alpha_cloak` | Alpha Cloak | armor | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `archmage_boots` | Archmage Slippers | armor t6 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field, d-krells-hold (design, on the board) |
| `archmage_gloves` | Archmage Gloves | armor t6 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `barrowking_mantle` | Barrow-King's Mantle | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-muster-barrows |
| `chitinweave_cloak` | Chitinweave Cloak | armor t6 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-pyre-field |
| `ember_gauntlets` | Emberforged Gauntlets | armor t6 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `mithril_belt` | Mithril Belt | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `mithril_boots` | Mithril Boots | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `mithril_gauntlets` | Mithril Gauntlets | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `rune_belt` | Rune Belt | armor t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `rune_boots` | Rune Boots | armor t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `rune_gauntlets` | Rune Gauntlets | armor t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `shadowsilk_cape` | Shadowsilk Cape | armor t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `snakeskin_belt` | Snakeskin Belt | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `snakeskin_boots` | Snakeskin Boots | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `snakeskin_gloves` | Snakeskin Vambraces | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `sorcerer_belt` | Sorcerer Sash | armor t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `sorcerer_boots` | Sorcerer Slippers | armor t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `sorcerer_gloves` | Sorcerer Gloves | armor t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `trollhide_cape` | Trollhide Cape | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `warlock_belt` | Warlock Sash | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `warlock_boots` | Warlock Slippers | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `warlock_gloves` | Warlock Gloves | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `warlock_helmet` | Warlock Hat | armor t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `wraithsilk_shroud` | Wraithsilk Shroud | armor t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-pyre-field |
| `wyvernhide_belt` | Wyvernhide Belt | armor t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `wyvernhide_boots` | Wyvernhide Boots | armor t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `wyvernhide_gloves` | Wyvernhide Vambraces | armor t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `jarls_rimetorc` | Jarl's Rimetorc | jewelry t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `panthers_eye_pendant` | Panther's Eye Pendant | jewelry t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-pyre-field |
| `warlords_torc` | Warlord's Torc | jewelry t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `wraithglass_drops` | Wraithglass Drops | jewelry t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `ancient_claw` | Ancient Claw (filler name) | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-pyre-field |
| `ancient_rune` | Ancient Rune (filler name) | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `cooked_panther_meat` | Cooked Panther Meat | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [made by cooking] | b-pyre-field |
| `demon_shard` | Demon Shard | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `dragon_bones` | Dragon Bones | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `dragon_gem` | Dragon Gem | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-pyre-field |
| `dragon_scale` | Dragon Scale | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `dragon_stew` | Dragon Stew | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [made by cooking] | none |
| `field_cookbook` | Field Cookbook | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `hunters_feast` | Hunter's Feast | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [made by cooking] | none |
| `keystone` | Keystone | material t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop; made by crafting] | none |
| `lich_soul` | Lich Soul | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `lich_soul_soup` | Lich Soul Soup | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [made by cooking] | none |
| `marrow_cookbook` | Marrow Cookbook | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `raw_panther_meat` | Raw Panther Meat | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-pyre-field |
| `soul_recipe` | Soul Recipe Scroll | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `troll_hide` | Troll Hide | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `vamp_dust` | Vampire Dust | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `void_banquet` | Void Banquet (filler name) | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [made by cooking] | none |
| `void_chitin` | Void Chitin (filler name) | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-pyre-field |
| `void_core` | Void Core (filler name) | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-pyre-field |
| `wraith_veil` | Wraith Veil | material | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-pyre-field |
| `maple_spellbook` | Maplebound Spellbook | offhand t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `runewood_codex` | Runewood Codex | offhand t6 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-pyre-field, d-krells-hold (design, on the board) |
| `yew_spellbook` | Yewclasp Spellbook | offhand t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `emberheart` | Emberheart | trophy | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [hearthfind] | none |
| `captains_ribblade` | Captain's Ribblade | weapon | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `chief_blade` | Chief's Blade | weapon | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `dragonrib_bow` | Dragonrib Bow | weapon t6 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `emberfang_blade` | Emberfang | weapon t6 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-pyre-field |
| `lazlos_maul` | Lazlo's Maul | weapon t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `maple_bow` | Maple Bow | weapon t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `maple_wand` | Maple Wand | weapon t4 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `rune_sword` | Rune Sword | weapon t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `runewood_staff` | Runewood Staff | weapon t6 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field, d-krells-hold (design, on the board) |
| `runewood_wand` | Runewood Wand | weapon t6 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field, d-krells-hold (design, on the board) |
| `void_censer` | Void Censer (filler name) | weapon t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | none |
| `yew_bow` | Yew Bow | weapon t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `yew_staff` | Yew Staff | weapon t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `yew_wand` | Yew Wand | weapon t5 | drops or is made only from creatures and materials no open ground has; tagged "a later region, or cut" [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |

### Items tagged for a Greenhaven ground not yet built: 9

| id | name | kind | why unreachable | staged pack that names it |
|---|---|---|---|---|
| `mirewort_drops` | Mirewort Drops | jewelry t3 | drops only from a creature no open ground spawns; tagged for a Greenhaven ground not yet built [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `packlord_band` | Packlord's Band | jewelry t2 | drops only from a creature no open ground spawns; tagged for a Greenhaven ground not yet built [monster drop] | none |
| `spidersilk_choker` | Spidersilk Choker | jewelry t3 | drops only from a creature no open ground spawns; tagged for a Greenhaven ground not yet built [monster drop] | none |
| `tusker_charm` | Tusker's Charm | jewelry t1 | drops only from a creature no open ground spawns; tagged for a Greenhaven ground not yet built [monster drop] | none |
| `ancient_fragment` | Ancient Fragment (filler name) | material | drops only from a creature no open ground spawns; tagged for a Greenhaven ground not yet built [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `cracked_spellstone` | Cracked Spellstone | material | drops only from a creature no open ground spawns; tagged for a Greenhaven ground not yet built [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `grave_dust` | Grave Dust | material | drops only from a creature no open ground spawns; tagged for a Greenhaven ground not yet built [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field, d-krells-hold (design, on the board) |
| `razor_claw` | Razor Claw | material | drops only from a creature no open ground spawns; tagged for a Greenhaven ground not yet built [monster drop] | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `rat_stick` | Rat Stick | weapon t3 | drops only from a creature no open ground spawns; tagged for a Greenhaven ground not yet built [monster drop] | none |

### Items behind the premium door: 1

| id | name | kind | why unreachable | staged pack that names it |
|---|---|---|---|---|
| `oak_practice_blade` | Oak Practice Blade | weapon | its only door is the premium daily login claim, which is switched off [premium login reward] | none |

### Items with no source and a pending-cut row (tests/catalogue-coherence.mjs PENDING_SOURCE: stat copies of the practice kit): 5

| id | name | kind | why unreachable | staged pack that names it |
|---|---|---|---|---|
| `apprentice_primer` | Apprentice Primer | offhand t1 | no source; a stat copy of its practice-kit piece, already ruled a cut (designer 2026-10-22) | none |
| `apprentice_staff` | Apprentice Staff | weapon t1 | no source; a stat copy of its practice-kit piece, already ruled a cut (designer 2026-10-22) | none |
| `apprentice_wand` | Apprentice Wand | weapon t1 | no source; a stat copy of its practice-kit piece, already ruled a cut (designer 2026-10-22) | none |
| `shortbow` | Shortbow | weapon t1 | no source; a stat copy of its practice-kit piece, already ruled a cut (designer 2026-10-22) | none |
| `stone_maul` | Stone Maul | weapon t1 | no source; a stat copy of its practice-kit piece, already ruled a cut (designer 2026-10-22) | none |

## Monsters: 110 on no open ground

| id | name | tier / level | family | why unreachable | staged pack that names it |
|---|---|---|---|---|---|
| `adept` | Adept | t4 /  | Human | on no ground and in no hunt (the August roster) | none |
| `air_elemental` | Air Elemental | t2 /  | Elemental | on no ground and in no hunt (the August roster) | none |
| `ancient_bear` | Ancient Bear (filler name) | t6 /  | Mammal | on no ground and in no hunt (the August roster) | none |
| `archmage` | Archmage | t5 /  | Human | on no ground and in no hunt (the August roster) | none |
| `ashwing` | Ashwing | t6 /  | Dragon | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `astrologer` | Astrologer | t5 /  | Human | on no ground and in no hunt (the August roster) | none |
| `bandit_lord` | Bandit Lord | t5 /  | Human | on no ground and in no hunt (the August roster) | none |
| `barrow_king` | The Barrow King | t4 /  | Undead | on no ground and in no hunt (the August roster) | none |
| `barrow_knight` | Barrow Knight | t4 /  | Undead | on no ground and in no hunt (the August roster) | b-muster-barrows |
| `bear` | Bear | t4 /  | Mammal | on no ground and in no hunt (the August roster) | b-muster-barrows |
| `bog_vine` | Bog Vine | t3 /  | Plant | on no ground and in no hunt (the August roster) | none |
| `broodmother` | Broodmother | t6 /  | Vermin | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `carnivorous_plant` | Carnivorous Plant | t4 /  | Plant | on no ground and in no hunt (the August roster) | none |
| `carrion_swarm` | Carrion Swarm | t5 /  | Vermin | on no ground and in no hunt (the August roster) | none |
| `cave_wyrm` | Cave Wyrm | t4 /  | Dragon | on no ground and in no hunt (the August roster) | none |
| `centipede` | Centipede | t3 /  | Vermin | on no ground and in no hunt (the August roster) | none |
| `chained_demon` | Chained Demon | t5 /  | Demon | on no ground and in no hunt (the August roster) | none |
| `clay_golem` | Clay Golem | t3 /  | Construct | on no ground and in no hunt (the August roster) | none |
| `conjurer` | Conjurer | t4 /  | Human | on no ground and in no hunt (the August roster) | none |
| `cutpurse` | Cutpurse | t1 /  | Human | on no ground and in no hunt (the August roster) | none |
| `cyclops` | Cyclops | t5 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `dark_wizard` | Dark Wizard (filler name) | t2 /  | Human | on no ground and in no hunt (the August roster) | none |
| `death_knight` | Death Knight | t5 /  | Undead | on no ground and in no hunt (the August roster) | none |
| `deserter` | Deserter | t3 /  | Human | on no ground and in no hunt (the August roster) | b-pyre-field |
| `dire_wolf` | Dire Wolf | t3 /  | Mammal | on no ground and in no hunt (the August roster) | none |
| `draconia` | Draconia | t6 /  | Dragon | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `dragon` | Green Dragon | t6 /  | Dragon | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `drake` | Drake | t5 /  | Dragon | on no ground and in no hunt (the August roster) | none |
| `drowned_dead` | Drowned Dead | t4 /  | Undead | on no ground and in no hunt (the August roster) | none |
| `dryad` | Dryad | t5 /  | Plant | on no ground and in no hunt (the August roster) | none |
| `earth_elemental` | Earth Elemental | t3 /  | Elemental | on no ground and in no hunt (the August roster) | none |
| `elder_cinder` | Elder Cinder | t6 /  | Elemental | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `elk_king` | Elk King | t6 /  | Mammal | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `fire_devil` | Fire Devil | t3 /  | Demon | on no ground and in no hunt (the August roster) | none |
| `fire_elemental` | Fire Elemental | t1 /  | Elemental | on no ground and in no hunt (the August roster) | none |
| `frost_giant` | Frost Giant | t5 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `frost_jarl` | The Frost Jarl | t5 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `fury` | Fury | t5 /  | Demon | on no ground and in no hunt (the August roster) | none |
| `gargoyle` | Gargoyle | t5 /  | Construct | on no ground and in no hunt (the August roster) | none |
| `ghoul` | Ghoul | t3 /  | Undead | on no ground and in no hunt (the August roster) | none |
| `giant_bat` | Giant Bat | t2 /  | Vermin | on no ground and in no hunt (the August roster) | none |
| `giant_boar` | Giant Boar | t5 /  | Mammal | on no ground and in no hunt (the August roster) | none |
| `giant_spider` | Giant Spider | t4 /  | Vermin | on no ground and in no hunt (the August roster) | none |
| `gnoll` | Gnoll | t2 /  | Humanoid | spawns only in the hunt `ridge_camp`, which has no ground (the server refuses its session: no_ground) | none |
| `gnoll_packlord` | Gnoll Packlord | t2 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `goblin` | Goblin | t1 /  | Humanoid | spawns only in the hunt `goblin_warren`, which has no ground (the server refuses its session: no_ground) | none |
| `goblin_brute` | Goblin Brute | t3 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `goblin_warlord` | Goblin Warlord | t4 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `grave_banshee` | Grave Banshee | t5 /  | Undead | on no ground and in no hunt (the August roster) | none |
| `grim_reaper` | Grim Reaper | t6 /  | Undead | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `hellhound` | Hellhound | t4 /  | Demon | on no ground and in no hunt (the August roster) | none |
| `hobgoblin` | Hobgoblin | t2 /  | Humanoid | spawns only in the hunt `ridge_camp`, which has no ground (the server refuses its session: no_ground) | none |
| `ice_elemental` | Ice Elemental | t4 /  | Elemental | on no ground and in no hunt (the August roster) | none |
| `imp` | Imp | t1 /  | Demon | on no ground and in no hunt (the August roster) | none |
| `iron_colossus` | Iron Colossus | t6 /  | Construct | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `kobold` | Kobold | t1 /  | Humanoid | spawns only in the hunt `goblin_warren`, which has no ground (the server refuses its session: no_ground) | none |
| `lesser_demon` | Horned Demon | t4 /  | Demon | on no ground and in no hunt (the August roster) | none |
| `lich` | Ancient Lich (filler name) | t6 /  | Undead | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `locust_swarm` | Locust Swarm | t2 /  | Vermin | on no ground and in no hunt (the August roster) | none |
| `lynx` | Lynx | t3 /  | Mammal | on no ground and in no hunt (the August roster) | none |
| `magma_elemental` | Magma Elemental | t5 /  | Elemental | on no ground and in no hunt (the August roster) | none |
| `mammoth` | Mammoth | t5 /  | Mammal | on no ground and in no hunt (the August roster) | none |
| `mandrake` | Mandrake | t1 /  | Plant | spawns only in the hunt `bramble_edge`, which has no ground (the server refuses its session: no_ground) | none |
| `minotaur` | Minotaur | t4 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `mire_witch` | The Mire Witch | t3 /  | Human | on no ground and in no hunt (the August roster) | none |
| `mountain_ram` | Mountain Ram | t3 /  | Mammal | on no ground and in no hunt (the August roster) | none |
| `mountain_troll` | Mountain Troll | t4 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `necromancer` | Necromancer | t6 /  | Human | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `nightmare` | Nightmare | t2 /  | Demon | on no ground and in no hunt (the August roster) | none |
| `ogre` | Ogre | t4 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `old_tusker` | Old Tusker | t1 /  | Mammal | on no ground and in no hunt (the August roster) | none |
| `ooze` | Ooze | t2 /  | Vermin | on no ground and in no hunt (the August roster) | none |
| `panther` | Night Panther | t5 /  | Mammal | on no ground and in no hunt (the August roster) | none |
| `plague_swarm` | Plague Swarm | t4 /  | Vermin | on no ground and in no hunt (the August roster) | none |
| `revenant` | Revenant | t6 /  | Undead | on no ground and in no hunt (the August roster) | none |
| `rock_troll` | Rock Troll | t3 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `salamander` | Salamander | t2 /  | Dragon | on no ground and in no hunt (the August roster) | none |
| `scarecrow` | Scarecrow | t1 /  | Construct | on no ground and in no hunt (the August roster) | none |
| `shadow_creeper` | Shadow Creeper (filler name) | t5 /  | Extra Dimensional | on no ground and in no hunt (the August roster) | none |
| `shrieker` | Shrieker | t2 /  | Plant | on no ground and in no hunt (the August roster) | none |
| `skeleton` | Skeleton | t2 /  | Undead | on no ground and in no hunt (the August roster) | none |
| `small_wolf` | Wolf Cub | t1 /  | Mammal | spawns only in the hunt `bramble_edge`, which has no ground (the server refuses its session: no_ground) | none |
| `stag` | Stag | t2 /  | Mammal | spawns only in the hunt `ridge_camp`, which has no ground (the server refuses its session: no_ground) | none |
| `starhusk` | Starhusk | t5 /  | Extra Dimensional | on no ground and in no hunt (the August roster) | none |
| `stone_golem` | Stone Golem | t2 /  | Construct | on no ground and in no hunt (the August roster) | none |
| `stonejaw` | Stonejaw | t6 /  | Humanoid | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `storm_elemental` | Storm Elemental | t6 /  | Elemental | on no ground and in no hunt (the August roster) | none |
| `the_silence` | The Silence | t6 /  | Extra Dimensional | on no ground and in no hunt (the August roster) | none |
| `the_unlit` | The Unlit | t6 /  | Extra Dimensional | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `treant` | Treant | t6 /  | Plant | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `vampire_bride` | Vampire Bride | t6 /  | Undead | on no ground and in no hunt (the August roster) | none |
| `venom_spider` | Venom Spider | t3 /  | Vermin | on no ground and in no hunt (the August roster) | none |
| `vharek` | Vharek | t6 /  | Demon | a dungeon boss; dungeons are paused (Tyler 2026-10-14) | none |
| `void_mote` | Void Mote (filler name) | t4 /  | Extra Dimensional | on no ground and in no hunt (the August roster) | none |
| `void_parasite` | Void Parasite (filler name) | t6 /  | Extra Dimensional | on no ground and in no hunt (the August roster) | none |
| `war_king` | War King | t6 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `warband_captain` | Warband Captain | t5 /  | Humanoid | on no ground and in no hunt (the August roster) | none |
| `warlock` | Warlock | t3 /  | Human | on no ground and in no hunt (the August roster) | none |
| `watchknight` | Watchknight | t4 /  | Construct | on no ground and in no hunt (the August roster) | none |
| `water_elemental` | Water Elemental | t2 /  | Elemental | on no ground and in no hunt (the August roster) | none |
| `weak_skeleton` | Brittle Skeleton | t1 /  | Undead | on no ground and in no hunt (the August roster) | none |
| `wight` | Wight | t2 /  | Undead | on no ground and in no hunt (the August roster) | b-slake-and-ford, b-muster-barrows, b-pyre-field |
| `wild_boar` | Wild Boar | t1 /  | Mammal | spawns only in the hunt `bramble_edge`, which has no ground (the server refuses its session: no_ground) | none |
| `winter_wolf` | Winter Wolf | t4 /  | Mammal | on no ground and in no hunt (the August roster) | none |
| `witchs_apprentice` | Witch's Apprentice | t1 /  | Human | on no ground and in no hunt (the August roster) | none |
| `wolf` | Wolf | t2 /  | Mammal | on no ground and in no hunt (the August roster) | none |
| `wraith` | Wraith | t4 /  | Undead | on no ground and in no hunt (the August roster) | none |
| `wyrmling` | Wyrmling | t3 /  | Dragon | on no ground and in no hunt (the August roster) | none |
| `wyvern` | Wyvern | t4 /  | Dragon | on no ground and in no hunt (the August roster) | none |
| `zombie` | Zombie | t3 /  | Undead | on no ground and in no hunt (the August roster) | none |

## Hunts with no ground

- `bramble_edge` (Bramble Edge, Level 0-15, staged: false): small_wolf, wild_boar, mandrake. It is in OPEN_HUNTS, so `gen-hunts` writes it into `hr_hunts` as open. Closing it is a catalogue apply (server lane).
- `goblin_warren` (Goblin Warren, Level 0-15, staged: false): goblin, kobold. It is in OPEN_HUNTS, so `gen-hunts` writes it into `hr_hunts` as open. Closing it is a catalogue apply (server lane).
- `ridge_camp` (Ridge Camp, Level 15-99, staged: false): hobgoblin, gnoll, stag. It is in OPEN_HUNTS, so `gen-hunts` writes it into `hr_hunts` as open. Closing it is a catalogue apply (server lane).

## Data fields nothing reads (audit S6), checked 2026-11-10 against src, the edge, tools, tests, the four staged branches and the board

| Field | Rows | Verdict | Why |
|---|---|---|---|
| `foodTier` (items.js) | 22 | REMOVED in this lane | no reader anywhere; `gen-catalogues --check` exit 0 after |
| `cookedFrom` (items.js) | 6 | REMOVED in this lane | no reader anywhere; the recipe row already says what cooks into what |
| `icon:` emoji on item, monster, recipe, gathering, skill and companion rows | 633 in 16 files (items 212, monsters 144, recipes 80, gathering 58, slot-ladders 36, companions 22, others 81) | LEFT, one sweep later | no client, edge or generator reads them (the readers of `.icon` are the tutorial's anchors and the share card's own objects). Removing them rewrites almost every data row, and the four staged ground branches edit monsters.js, style-gear.js and gear-tiers.js: do it in one commit after they land. The Professional Standard says no emoji as art, and one renderer would put these on screen |
| `lvOff`, `craftMat` (gear-tiers.js) | 11, 3 | LEFT | no reader (the recipe half left in the 2026-10-14 demolition), but lane/b-phase0-tier4 and b-slake-and-ford edit the lines beside them. Same sweep |
| `weaponResist` (monster-classes.js, monsters.js) | 28 | LEFT, designer's call | wire it through the damage expression as a percent (Tyler 2026-11-06: no immunities, only percentages) or delete it |
| `resist`, `mechanic` (bosses.js) | 6 bosses | LEFT, designer's call | dungeon bosses are paused; the rows go or stay with the monsters above |
| `gpLo`, `gpHi` (monster-classes.js) | 10 | KEEP: the audit was wrong | `validate()` reads them through `inFormationBand(m.tier, 'gpLo', ...)` (monster-classes.js:411, :431) |
