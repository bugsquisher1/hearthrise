// Artisan recipes (cooking/smithing/crafting/prayer)
//
// b139 (QA sweep §1.1): consolidated from legacy.js's Phase A.1 NEW_RECIPES
// IIFE. Now uses the modern multi-input schema (`inputs: {id: qty}`) for
// new recipes; legacy single-input recipes (`input: id, secondary: {...}`)
// stay in their original form because the runtime helper
// `getInputs(recipe)` in legacy.js handles BOTH shapes.
//
// Why this consolidation matters: legacy.js's `add(skill, recipe)` calls
// pushed into `window.ARTISAN_RECIPES` BEFORE main.js ran its
// `Object.assign(window, { ARTISAN_RECIPES })` overwrite. So Phase A.1
// recipes were silently dropped on every boot. Cooked-meat / buff-food /
// new-bar / gated-recipe chains were all dead. This module is now the
// single source of truth.

import { GEAR_RECIPES } from './gear-tiers.js?v=223';
import { ITEMS, foodClassOf } from './items.js?v=223';

const BASE_RECIPES = {
  cooking: [
    // Fish — original starter chain
    {id:'cook_shrimp',  name:'Cook Shrimp',  icon:'🦐', input:'shrimp',  output:'cooked_shrimp',  xp:30,  req:1,  ms:2400},
    {id:'cook_trout',   name:'Cook Trout',   icon:'🐟', input:'trout',   output:'cooked_trout',   xp:50,  req:15, ms:3000},
    {id:'cook_lobster', name:'Cook Lobster', icon:'🦞', input:'lobster', output:'cooked_lobster', xp:100, req:30, ms:3600},
    {id:'cook_shark',   name:'Cook Shark',   icon:'🦈', input:'shark',   output:'cooked_shark',   xp:200, req:60, ms:5000},
    /* b215: new fish + late crops so cooking has a rung every ~10 levels to 99 */
    {id:'cook_herring',   name:'Cook Herring',   icon:'🐟', input:'herring',   output:'cooked_herring',   xp:40,  req:8,  ms:2600},
    {id:'cook_frostfin',  name:'Cook Frostfin',  icon:'❄️', input:'frostfin',  output:'cooked_frostfin',  xp:260, req:70, ms:5400},
    {id:'cook_swordfish', name:'Cook Swordfish', icon:'🐠', input:'swordfish', output:'cooked_swordfish', xp:150, req:45, ms:4200},
    {id:'cook_moonfish',  name:'Cook Moonfish',  icon:'🌙', input:'moonfish',  output:'cooked_moonfish',  xp:420, req:88, ms:6000},
    // Combat-meat chain (Phase A.1 — needs raw_*_meat drops from beasts)
    {id:'cook_wolf_meat',    name:'Cook Wolf Meat',    icon:'🥩', inputs:{raw_wolf_meat:1},    output:'cooked_wolf_meat',    xp:35,  req:5,  ms:2400},
    {id:'cook_panther_meat', name:'Cook Panther Meat', icon:'🥩', inputs:{raw_panther_meat:1}, output:'cooked_panther_meat', xp:60,  req:25, ms:2800},
    {id:'cook_bear_meat',    name:'Cook Bear Meat',    icon:'🥩', inputs:{raw_bear_meat:1},    output:'cooked_bear_meat',    xp:120, req:40, ms:3400},
    // Tier 2 buff foods
    {id:'cook_carrot',      name:'Roast Carrot',     icon:'🥕', inputs:{carrot:1},                       output:'roasted_carrot', xp:20,  req:5,  ms:1500},
    {id:'cook_wheat_bread', name:'Bake Wheat Bread', icon:'🍞', inputs:{wheat:3},                        output:'wheat_bread',    xp:55,  req:20, ms:3000},
    {id:'cook_tomato_soup', name:'Tomato Soup',      icon:'🥣', inputs:{tomato:3, carrot:1},             output:'tomato_soup',    xp:120, req:35, ms:3600},
    {id:'cook_pumpkin',     name:'Roast Pumpkin',    icon:'🎃', inputs:{pumpkin:1},                      output:'roasted_pumpkin',xp:140, req:40, ms:4000},
    {id:'cook_veg_stew',    name:'Vegetable Stew',   icon:'🍲', inputs:{potato:2, carrot:2, tomato:1},   output:'vegetable_stew', xp:180, req:50, ms:4500},
    // Farm-crop intermediates — fill the mid-cooking gap so vegetable XP gain isn't a dead end
    {id:'cook_baked_potato', name:'Baked Potato',    icon:'🥔', inputs:{potato:2},                       output:'baked_potato',   xp:90,  req:25, ms:3200},
    {id:'cook_carrot_stew',  name:'Carrot Stew',     icon:'🍲', inputs:{carrot:3, potato:1},             output:'carrot_stew',    xp:150, req:45, ms:4000},
    {id:'cook_pumpkin_pie',  name:'Pumpkin Pie',     icon:'🥧', inputs:{pumpkin:1, wheat:2},             output:'pumpkin_pie',    xp:240, req:60, ms:4800},
    // Tier 3 — unlocked by recipe scrolls (gated check at runtime)
    {id:'cook_bear_pie',     name:'Bear Claw Pie',   icon:'🥧', inputs:{bear_claw:1, wheat:3}, output:'bear_claw_pie',  xp:280, req:70, ms:5000},
    {id:'cook_hunters_feast',name:"Hunter's Feast",  icon:'🍱', inputs:{troll_hide:1, bear_pelt:1, cooked_trout:2}, output:'hunters_feast', xp:320, req:75, ms:5500, gated:'field_cookbook'},
    {id:'cook_dragon_stew',  name:'Dragon Stew',     icon:'🍜', inputs:{dragon_scale:1, carrot:1, tomato:1, pumpkin:1, potato:1}, output:'dragon_stew', xp:450, req:85, ms:6000, gated:'marrow_cookbook'},
    {id:'cook_lich_soup',    name:'Lich Soul Soup',  icon:'🥣', inputs:{lich_soul:1, wheat:1}, output:'lich_soul_soup', xp:600, req:90, ms:6500, gated:'soul_recipe'},
    {id:'cook_void_banquet', name:'Void Banquet',    icon:'🎂', inputs:{void_core:1, dragon_bones:1, cooked_shark:3}, output:'void_banquet', xp:900, req:99, ms:7000},
    /* b215: sinks for the three late-game crops */
    {id:'cook_goldenroot',  name:'Goldenroot Roast',  icon:'🍠', inputs:{goldenroot:2},                 output:'goldenroot_roast', xp:300, req:65, ms:5000},
    {id:'cook_ember_tart',  name:'Ember Tart',        icon:'🥧', inputs:{emberfruit:2, wheat:2},        output:'ember_tart',       xp:520, req:78, ms:5600},
    {id:'cook_moon_elixir', name:'Moonbloom Elixir',  icon:'🍶', inputs:{moonbloom:2, magic_essence:1}, output:'moonbloom_elixir', xp:780, req:92, ms:6400},
    /* b222 — Castle Stores (clan-overhaul v2 §4.3). The hold marches on
       rations, not on banquets: this is the only cooking output with no
       `heals` and no `buff`, because it is stores, not a meal. */
    {id:'cook_field_ration', name:'Field Rations ×4', icon:'🥖', inputs:{wheat:4, cooked_wolf_meat:2, carrot:2}, output:'field_ration', outputQty:4, xp:160, req:22, ms:3800},
  ],
  smithing: [
    // Bar smelting — full chain so steel_bar + rune_bar exist as ingredients for forging.
    {id:'smelt_copper',  name:'Copper Bar',  icon:'🟤', input:'copper_ore',  output:'copper_bar',  xp:15,  req:1,  ms:2400},
    {id:'smelt_bronze',  name:'Bronze Bar',  icon:'🟫', inputs:{copper_ore:2, coal:1},                        output:'bronze_bar',  xp:20,  req:8,  ms:2600},
    {id:'smelt_iron',    name:'Iron Bar',    icon:'⬜', input:'iron_ore',    output:'iron_bar',    xp:30,  req:15, ms:3000, secondary:{coal:1}},
    {id:'smelt_steel',   name:'Steel Bar',   icon:'⬜', inputs:{iron_bar:1, coal:2},                          output:'steel_bar',   xp:70,  req:35, ms:3600},
    {id:'smelt_gold',    name:'Gold Bar',    icon:'🟡', input:'gold_ore',    output:'gold_bar',    xp:60,  req:40, ms:4000, secondary:{coal:2}},
    {id:'smelt_mithril', name:'Mithril Bar', icon:'🔵', input:'mithril_ore', output:'mithril_bar', xp:120, req:55, ms:5000, secondary:{coal:3}},
    {id:'smelt_rune',    name:'Rune Bar',    icon:'🔷', inputs:{mithril_bar:1, magic_essence:1, coal:4},      output:'rune_bar',    xp:240, req:75, ms:6000},
    /* b215: the last two bars — smithing had nothing new between 75 and 99. */
    {id:'smelt_ember',   name:'Emberforged Bar', icon:'🟧', inputs:{emberstone_ore:1, coal:4},                output:'ember_bar',   xp:340, req:82, ms:6400},
    {id:'smelt_dawn',    name:'Dawnsteel Bar',   icon:'🟪', inputs:{dawnstone_ore:1, ember_bar:1, coal:5},    output:'dawn_bar',    xp:480, req:92, ms:7000},
    /* b215: tool ladder tiers 6-7 (best owned tool auto-applies) */
    {id:'forge_ember_axe',     name:'Forge Emberforged Axe',     icon:'🪓', inputs:{ember_bar:2, runewood_plank:1}, output:'ember_axe',     xp:2600, req:80, ms:5800},
    {id:'forge_dawn_axe',      name:'Forge Dawnsteel Axe',       icon:'🪓', inputs:{dawn_bar:2, duskwood_plank:1},  output:'dawn_axe',      xp:4200, req:92, ms:6400},
    {id:'forge_ember_pickaxe', name:'Forge Emberforged Pickaxe', icon:'⛏️', inputs:{ember_bar:2, runewood_plank:1}, output:'ember_pickaxe', xp:2600, req:80, ms:5800},
    {id:'forge_dawn_pickaxe',  name:'Forge Dawnsteel Pickaxe',   icon:'⛏️', inputs:{dawn_bar:2, duskwood_plank:1},  output:'dawn_pickaxe',  xp:4200, req:92, ms:6400},
    // Forge weapons — use the new bars now that they exist
    {id:'forge_bronze_sword',  name:'Forge Bronze Sword',  icon:'⚔️', inputs:{bronze_bar:2, normal_plank:1},                output:'bronze_sword',  xp:60,    req:5,  ms:2500},
    {id:'forge_iron_sword',    name:'Forge Iron Sword',    icon:'⚔️', inputs:{iron_bar:3, oak_plank:1},                     output:'iron_sword',    xp:180,   req:20, ms:3000},
    {id:'forge_steel_sword',   name:'Forge Steel Sword',   icon:'⚔️', inputs:{steel_bar:3, willow_plank:1},                 output:'steel_sword',   xp:400,   req:40, ms:3800},
    {id:'forge_rune_sword',    name:'Forge Rune Sword',    icon:'⚔️', inputs:{rune_bar:3, magic_essence:2, maple_plank:1},  output:'rune_sword',    xp:1200,  req:75, ms:5500},
    {id:'forge_stone_maul',    name:'Forge Stone Maul',    icon:'🔨', inputs:{normal_plank:2, copper_ore:4},                output:'stone_maul',    xp:100,   req:10, ms:2700},
    {id:'forge_iron_warhammer',name:'Forge Iron Warhammer',icon:'🔨', inputs:{iron_bar:4, oak_plank:2},                     output:'iron_warhammer',xp:350,   req:35, ms:3800},
    // Forge armor
    {id:'forge_iron_helm',     name:'Forge Iron Helm',     icon:'⛑️', inputs:{iron_bar:2},  output:'iron_helm',      xp:200, req:25, ms:3000},
    {id:'forge_iron_platebody',name:'Forge Iron Platebody',icon:'🦺', inputs:{iron_bar:5},  output:'iron_platebody', xp:350, req:35, ms:3800},
    {id:'forge_steel_helm',    name:'Forge Steel Helm',    icon:'⛑️', inputs:{steel_bar:3}, output:'steel_helm',     xp:600, req:50, ms:4500},
    {id:'forge_steel_platebody',name:'Forge Steel Platebody',icon:'🦺',inputs:{steel_bar:7},output:'steel_platebody',xp:900, req:60, ms:5000},
    {id:'forge_bronze_belt',   name:'Forge Bronze Belt',   icon:'🟫', inputs:{bronze_bar:2, wolf_pelt:1}, output:'bronze_belt', xp:120, req:18, ms:2800},
    // Gated forges (single-use recipe scrolls flip G.unlockedRecipes)
    {id:'forge_chief_blade',   name:"Chief's Blade",       icon:'🗡️', inputs:{warlord_badge:1, iron_bar:4, oak_plank:2},    output:'chief_blade',       xp:600,  req:50, ms:5000, gated:'chief_blade_recipe'},
    {id:'forge_captain_blade', name:"Captain's Ribblade",  icon:'🗡️', inputs:{captain_medal:1, steel_bar:4, maple_plank:2},output:'captains_ribblade', xp:1100, req:70, ms:6000, gated:'captain_recipe'},
    // Gathering tools (b201, SYS-3) — the OSRS tool ladder. Each tier speeds
    // its gathering skill (see items.js toolSpeed + features/tools.js).
    {id:'forge_bronze_axe',     name:'Forge Bronze Axe',      icon:'🪓', inputs:{bronze_bar:1, normal_plank:1},   output:'bronze_axe',      xp:40,   req:3,  ms:2500},
    {id:'forge_iron_axe',       name:'Forge Iron Axe',        icon:'🪓', inputs:{iron_bar:2, oak_plank:1},        output:'iron_axe',        xp:140,  req:18, ms:3000},
    {id:'forge_steel_axe',      name:'Forge Steel Axe',       icon:'🪓', inputs:{steel_bar:2, willow_plank:1},    output:'steel_axe',       xp:320,  req:38, ms:3800},
    {id:'forge_mithril_axe',    name:'Forge Mithril Axe',     icon:'🪓', inputs:{mithril_bar:2, maple_plank:1},   output:'mithril_axe',     xp:700,  req:58, ms:4500},
    {id:'forge_rune_axe',       name:'Forge Rune Axe',        icon:'🪓', inputs:{rune_bar:2, yew_plank:1},        output:'rune_axe',        xp:1500, req:78, ms:5500},
    {id:'forge_bronze_pickaxe', name:'Forge Bronze Pickaxe',  icon:'⛏️', inputs:{bronze_bar:1, normal_plank:1},   output:'bronze_pickaxe',  xp:40,   req:3,  ms:2500},
    {id:'forge_iron_pickaxe',   name:'Forge Iron Pickaxe',    icon:'⛏️', inputs:{iron_bar:2, oak_plank:1},        output:'iron_pickaxe',    xp:140,  req:18, ms:3000},
    {id:'forge_steel_pickaxe',  name:'Forge Steel Pickaxe',   icon:'⛏️', inputs:{steel_bar:2, willow_plank:1},    output:'steel_pickaxe',   xp:320,  req:38, ms:3800},
    {id:'forge_mithril_pickaxe',name:'Forge Mithril Pickaxe', icon:'⛏️', inputs:{mithril_bar:2, maple_plank:1},   output:'mithril_pickaxe', xp:700,  req:58, ms:4500},
    {id:'forge_rune_pickaxe',   name:'Forge Rune Pickaxe',    icon:'⛏️', inputs:{rune_bar:2, yew_plank:1},        output:'rune_pickaxe',    xp:1500, req:78, ms:5500},
    /* b222 — Castle Stores (clan-overhaul v2 §4.3). Bone Chips are the
       hardener: bone ash for case-hardening is real metallurgy, and it gives
       the 45-60% drop from Weak Skeleton / Skeleton its first ever use. */
    {id:'smith_iron_fitting', name:'Iron Fitting', icon:'🔩', inputs:{iron_bar:3, copper_bar:2, bone_chips:2}, output:'iron_fitting', xp:210, req:25, ms:4200},
    /* b223 — THE HUNT-FORGED KIT (clan-boss-events.md §3.4).
       Five of the six Hunt signature materials are smithed here; the sixth
       (Wyrm Gilding) is tailored under crafting. These recipes are the reason
       the six boss materials are allowed to exist: a signature drop with no
       recipe is vendor trash, and the spec calls that a hard requirement, not
       a nice-to-have. They sit above Dawnsteel and each one needs a material
       that ONLY the clan Hunt drops — the single piece of gear in the game
       that solo play cannot EARN at any level (it can still be bought on the
       market, at a price a clan sets: clan-boss-events.md §3.4a).

       b223 Designer ruling (§3.4a): the level gates were INVERTED. Generated
       Dawnsteel recipes require `88 + slot.lvOff` — gauntlets 89, boots 90,
       belt 91, helm 93, legs 96, body 98 — so a Hunt-forged helm at 92 and a
       platebody at 95 unlocked BELOW the Dawnsteel rung they replace, and the
       girdle tied. Each piece now sits strictly one level above the rung
       beneath it. The band is therefore Smithing 90-99, and the best armour
       piece in the game asks for a maxed Smithing AND a clan that kills Hunt
       bosses — which is the two north-star pillars meeting, on purpose. */
    {id:'forge_regent_helm',         name:'Forge Hollow Regent Helm', icon:'⛑️', inputs:{dawn_bar:3, hollow_sigil:3},   output:'regent_helm',         xp:3600, req:94, ms:6600},
    {id:'forge_slagheart_platebody', name:'Forge Slagheart Platebody',icon:'🦺', inputs:{dawn_bar:6, slagheart_core:3}, output:'slagheart_platebody', xp:6000, req:99, ms:7200},
    {id:'forge_abyssal_greaves',     name:'Forge Abyssal Greaves',    icon:'🦿', inputs:{dawn_bar:5, abyssal_pearl:3},  output:'abyssal_greaves',     xp:5000, req:97, ms:7000},
    {id:'forge_choirbone_gauntlets', name:'Forge Choirbone Gauntlets',icon:'🧤', inputs:{dawn_bar:2, choirbone:2},      output:'choirbone_gauntlets', xp:2400, req:90, ms:6000},
    {id:'forge_warden_girdle',       name:"Forge Warden's Girdle",    icon:'🟫', inputs:{dawn_bar:2, warden_seal:2},    output:'warden_girdle',       xp:2600, req:92, ms:6200},
  ],
  crafting: [
    // Plank sawing
    {id:'saw_normal', name:'Normal Plank', icon:'🪵', input:'normal_log', output:'normal_plank', xp:10,  req:1,  ms:2400},
    {id:'saw_oak',    name:'Oak Plank',    icon:'🪵', input:'oak_log',    output:'oak_plank',    xp:25,  req:15, ms:3000},
    {id:'saw_willow', name:'Willow Plank', icon:'🪵', input:'willow_log', output:'willow_plank', xp:50,  req:30, ms:3600},
    {id:'saw_maple',  name:'Maple Plank',  icon:'🍁', input:'maple_log',  output:'maple_plank',  xp:90,  req:45, ms:4500},
    {id:'saw_yew',    name:'Yew Plank',    icon:'🌲', input:'yew_log',    output:'yew_plank',    xp:160, req:60, ms:6000},
    // Carved weapons
    {id:'carve_shortbow',         name:'Carve Shortbow',          icon:'🏹', inputs:{normal_plank:2, silk_thread:1},       output:'shortbow',         xp:60,  req:5,  ms:2400},
    {id:'carve_longbow',          name:'Carve Longbow',           icon:'🏹', inputs:{willow_plank:3, silk_thread:2},       output:'longbow',          xp:240, req:25, ms:3600},
    {id:'carve_apprentice_staff', name:'Carve Apprentice Staff',  icon:'🪄', inputs:{oak_plank:2, magic_essence:1},        output:'apprentice_staff', xp:120, req:12, ms:2800},
    {id:'carve_oak_staff',        name:'Carve Oak Staff',         icon:'🪄', inputs:{willow_plank:3, magic_essence:2, ancient_rune:1}, output:'oak_staff', xp:300, req:30, ms:4000},
    {id:'craft_iron_arrows',      name:'Craft Iron Arrows ×50',   icon:'🏹', inputs:{iron_bar:1, normal_plank:5},          output:'iron_arrows', outputQty:50, xp:120, req:20, ms:3500},
    // Tailoring
    {id:'tailor_leather_boots',   name:'Tailor Leather Boots',    icon:'🥾', inputs:{wolf_pelt:2},                          output:'leather_boots',  xp:80,  req:8,  ms:2400},
    {id:'tailor_leather_gloves',  name:'Tailor Leather Gloves',   icon:'🧤', inputs:{wolf_pelt:1, silk_thread:1},           output:'leather_gloves', xp:120, req:12, ms:2800},
    {id:'tailor_traveler_cape',   name:'Tailor Traveler Cape',    icon:'🦸', inputs:{silk_thread:3, wolf_pelt:2},           output:'traveler_cape',  xp:140, req:15, ms:3000},
    // Jewelry
    {id:'jewel_copper_ring',      name:'Set Copper Ring',         icon:'💍', inputs:{copper_bar:1, magic_essence:1},        output:'copper_ring',     xp:180, req:20, ms:3000},
    {id:'jewel_hunter_necklace',  name:'String Hunter Necklace',  icon:'📿', inputs:{gold_bar:1, wolf_pelt:1},              output:'hunter_necklace', xp:240, req:25, ms:3500},
    // Gated crafts
    {id:'craft_alpha_cloak',      name:'Craft Alpha Cloak',       icon:'🦸', inputs:{bear_pelt:2, silk_thread:3},           output:'alpha_cloak',     xp:1200, req:60, ms:5500, gated:'alpha_pattern'},
    // Fishing rods (b201, SYS-3 tool ladder — crafted from planks + thread)
    {id:'carve_willow_rod',   name:'Carve Willow Rod',   icon:'🎣', inputs:{normal_plank:2, silk_thread:1},  output:'willow_rod',   xp:50,   req:3,  ms:2400},
    {id:'carve_oak_rod',      name:'Carve Oak Rod',      icon:'🎣', inputs:{oak_plank:2, silk_thread:1},     output:'oak_rod',      xp:150,  req:18, ms:3000},
    {id:'carve_maple_rod',    name:'Carve Maple Rod',    icon:'🎣', inputs:{willow_plank:2, silk_thread:2},  output:'maple_rod',    xp:340,  req:38, ms:3800},
    {id:'carve_yew_rod',      name:'Carve Yew Rod',      icon:'🎣', inputs:{maple_plank:2, silk_thread:3},   output:'yew_rod',      xp:750,  req:58, ms:4500},
    {id:'carve_runewood_rod', name:'Carve Runewood Rod', icon:'🎣', inputs:{yew_plank:3, silk_thread:4, magic_essence:2}, output:'runewood_rod', xp:1600, req:78, ms:5500},
    /* b215: the last two planks + rods — crafting stopped at 78 before this. */
    {id:'saw_runewood', name:'Runewood Plank', icon:'🪵', input:'runewood_log', output:'runewood_plank', xp:260, req:75, ms:6500},
    {id:'saw_duskwood', name:'Duskwood Plank', icon:'🪵', input:'duskwood_log', output:'duskwood_plank', xp:380, req:90, ms:7200},
    {id:'carve_duskwood_rod',  name:'Carve Duskwood Rod',  icon:'🎣', inputs:{runewood_plank:3, silk_thread:5, magic_essence:3}, output:'duskwood_rod',  xp:2600, req:84, ms:6000},
    {id:'carve_dawnsteel_rod', name:'Carve Dawnsteel Rod', icon:'🎣', inputs:{duskwood_plank:3, dawn_bar:1, silk_thread:6},      output:'dawnsteel_rod', xp:4200, req:94, ms:6600},
    /* b222 — Castle Stores (clan-overhaul v2 §4.3). Slime Gel is the binder:
       it is a resin, it is an 80% drop from tier-1 Slimes, it was worth 5g and
       used by NOTHING — and it is now the thing that holds the castle
       together, so a level-3 player farming slimes is materially useful on
       build day. That is the "every level matters" pillar, made structural. */
    {id:'craft_timber_beam', name:'Timber Beam', icon:'🪵', inputs:{normal_plank:5, oak_plank:2, slime_gel:2}, output:'timber_beam', xp:200, req:25, ms:4200},
    /* The top of the ladder: two castle goods plus two of the rarest orphan
       drops in the game (Ancient Fragment, Cracked Spellstone). */
    {id:'craft_keystone', name:'Keystone', icon:'🧱', inputs:{timber_beam:3, iron_fitting:3, ancient_fragment:2, cracked_spellstone:1}, output:'keystone', xp:900, req:60, ms:6500},
    /* b223 — the sixth Hunt-forged piece. The Crownless Wyrm's gilding is
       worked into cloth rather than steel, which is what gives the cape slot
       its first endgame rung (it has had exactly two entries since launch). */
    {id:'craft_wyrmgilt_mantle', name:'Tailor Wyrmgilt Mantle', icon:'🦸', inputs:{duskwood_plank:3, silk_thread:6, wyrm_gilding:3}, output:'wyrmgilt_mantle', xp:5200, req:95, ms:7000},
  ],
  prayer: [
    {id:'bury_bones',     name:'Bury Bones',         icon:'🦴', input:'bones',         output:null, xp:4.5, req:1,  ms:1200},
    {id:'bury_big',       name:'Bury Big Bones',     icon:'🦴', input:'big_bones',     output:null, xp:15,  req:15, ms:1500},
    {id:'bury_dragon',    name:'Bury Dragon Bones',  icon:'🦴', input:'dragon_bones',  output:null, xp:72,  req:35, ms:2000},
  ]
};

/* ══════════════════════════════════════════════════════════════════════
   b215 — fold in the generated tier ladder (src/data/gear-tiers.js).

   A hand-authored recipe always wins: we skip a generated one if either its
   id OR its output already exists above. That keeps historical recipes (e.g.
   forge_bronze_sword, which uses a bespoke bar+plank cost) authoritative
   while the generator fills in every rung nobody wrote by hand.

   Recipes are then sorted by required level so each artisan panel reads as a
   clean ladder instead of "original chain, then a pile of new stuff".
   ══════════════════════════════════════════════════════════════════════ */
function mergeGenerated(base, generated) {
  const seenIds = new Set(base.map((r) => r.id));
  const seenOutputs = new Set(base.map((r) => r.output).filter(Boolean));
  const additions = (generated || []).filter(
    (r) => !seenIds.has(r.id) && !seenOutputs.has(r.output)
  );
  return base.concat(additions).sort((a, b) => (a.req || 0) - (b.req || 0));
}

export const ARTISAN_RECIPES = {
  cooking:  BASE_RECIPES.cooking.slice().sort((a, b) => (a.req || 0) - (b.req || 0)),
  smithing: mergeGenerated(BASE_RECIPES.smithing, GEAR_RECIPES.smithing),
  crafting: mergeGenerated(BASE_RECIPES.crafting, GEAR_RECIPES.crafting),
  prayer:   BASE_RECIPES.prayer,
};

/* ══════════════════════════════════════════════════════════════════════
   b220 — ARTISAN CATEGORIES (crafting-cooking-taxonomy §§3-5)

   Smithing carries ~81 recipes and crafting ~46. As one level-sorted column
   that is not a ladder, it is a haystack: a player at Smithing 45 hunting
   "the next platebody" scrolls past bars, axes, swords and five other slots.

   The categories below are DERIVED, never authored. There are ~150 recipes;
   a hand-written `category:` field on each is a drift generator (the exact
   problem gear-tiers.js was built to remove — the ladder is generated, so a
   tag would have to be generated too, and then it isn't data, it's a copy).
   Everything here reads fields the recipe and its output item already carry:
   `output.type`, the `_bar` / `_plank` id suffix, and `foodClass`.

   Consequence that matters: a NEW recipe lands in the right tab the moment
   it is written, with nothing else to remember.

   Prayer is deliberately absent — three bury actions are a list, not a
   taxonomy, and it has no output item to derive from.

   b222 — the "Castle Stores" lane (clan-overhaul v2 §15 conflict 2). Keyed on
   `ITEMS[out].tag === 'castle'`, it lands in the SAME commit as the four goods
   it categorises, because `uncategorized` being empty is a regression test and
   adding the items alone would break it.

   It is the LAST claim in every skill, deliberately. A derived taxonomy must
   never *steal* a recipe from a more specific lane: a Phase-B Cellar ale
   (`foodClass:'buff'` AND `tag:'castle'`, §4.5) belongs in Feasts & Draughts
   where the player drinks it, and a hypothetical castle-tagged weapon belongs
   in Weapons. Castle Stores claims exactly what nothing else wants — which
   today is precisely the four typeless, foodClass-less goods.
   ══════════════════════════════════════════════════════════════════════ */
export const ARTISAN_CATEGORIES = {
  smithing: [
    { key: 'smelting', label: 'Smelting' },
    { key: 'weapons',  label: 'Weapons' },
    { key: 'armour',   label: 'Armour' },
    { key: 'tools',    label: 'Tools' },
    { key: 'castle',   label: 'Castle Stores' },
  ],
  crafting: [
    { key: 'sawmill',    label: 'Sawmill' },
    { key: 'weapons',    label: 'Weapons' },
    { key: 'armour',     label: 'Armour' },
    { key: 'jewellery',  label: 'Jewellery' },
    { key: 'tools',      label: 'Tools' },
    { key: 'ammunition', label: 'Ammunition' },
    { key: 'castle',     label: 'Castle Stores' },
  ],
  cooking: [
    { key: 'provisions', label: 'Provisions' },
    { key: 'feasts',     label: 'Feasts & Draughts' },
    { key: 'castle',     label: 'Castle Stores' },
  ],
};

/* isCastleGood(item) — the single predicate behind the lane AND the Storehouse
   deposit filter. One reader today, two once the Storehouse modal lands; it is
   a function rather than an inline `.tag === 'castle'` so the two can never
   drift apart. */
export function isCastleGood(item) {
  return !!(item && item.tag === 'castle');
}

/* recipeCategory(skillId, recipe) → category key, or null.
   Pure: pass `items` explicitly to classify against a different item table
   (the engine passes window.ITEMS, which is the same object post-merge).
   null means "this skill has no categories" OR "nothing claimed this recipe";
   callers must surface an unclaimed recipe rather than hide it — see
   categorizeRecipes(). */
export function recipeCategory(skillId, recipe, items = ITEMS) {
  if (!recipe) return null;
  const outId = recipe.output || '';
  const out = outId && items ? items[outId] : null;
  const type = out ? out.type : null;

  if (skillId === 'smithing') {
    if (type === 'tool') return 'tools';          // axes + pickaxes
    if (/_bar$/.test(outId)) return 'smelting';   // ore → bar
    if (type === 'weapon') return 'weapons';
    if (type === 'armor') return 'armour';
    if (isCastleGood(out)) return 'castle';       // b222 — Iron Fitting
    return null;
  }

  if (skillId === 'crafting') {
    if (/_plank$/.test(outId)) return 'sawmill';  // log → plank
    if (type === 'tool') return 'tools';          // fishing rods
    if (type === 'ammo') return 'ammunition';
    if (type === 'jewelry') return 'jewellery';
    if (type === 'weapon') return 'weapons';      // bows + staves
    if (type === 'armor') return 'armour';        // leather + cloth
    if (isCastleGood(out)) return 'castle';       // b222 — Timber Beam, Keystone
    return null;
  }

  if (skillId === 'cooking') {
    const fc = foodClassOf(out);
    if (fc === 'buff') return 'feasts';
    if (fc === 'healing') return 'provisions';
    if (isCastleGood(out)) return 'castle';       // b222 — Field Ration
    return null;
  }

  return null;
}

/* categorizeRecipes(skillId, recipes?, items?) →
     { groups: [{key, label, recipes[]}], uncategorized: [recipe], total }

   `groups` keeps ARTISAN_CATEGORIES order and only includes categories that
   actually hold something, so an empty lane never becomes a dead tab.
   `uncategorized` must always be empty (a regression test asserts it) — but
   it is returned rather than swallowed so a renderer can show the strays
   instead of making content unreachable. Silence is how content goes missing. */
export function categorizeRecipes(skillId, recipes = ARTISAN_RECIPES[skillId], items = ITEMS) {
  const defs = ARTISAN_CATEGORIES[skillId];
  const list = Array.isArray(recipes) ? recipes : [];
  if (!defs) return { groups: [], uncategorized: [], total: list.length };

  const byKey = new Map(defs.map((d) => [d.key, []]));
  const uncategorized = [];
  list.forEach((r) => {
    const key = recipeCategory(skillId, r, items);
    if (key && byKey.has(key)) byKey.get(key).push(r);
    else uncategorized.push(r);
  });

  const groups = defs
    .filter((d) => byKey.get(d.key).length > 0)
    .map((d) => ({ key: d.key, label: d.label, recipes: byKey.get(d.key) }));

  return { groups, uncategorized, total: list.length };
}
