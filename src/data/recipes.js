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

export const ARTISAN_RECIPES = {
  cooking: [
    // Fish — original starter chain
    {id:'cook_shrimp',  name:'Cook Shrimp',  icon:'🦐', input:'shrimp',  output:'cooked_shrimp',  xp:30,  req:1,  ms:2400},
    {id:'cook_trout',   name:'Cook Trout',   icon:'🐟', input:'trout',   output:'cooked_trout',   xp:50,  req:15, ms:3000},
    {id:'cook_lobster', name:'Cook Lobster', icon:'🦞', input:'lobster', output:'cooked_lobster', xp:100, req:30, ms:3600},
    {id:'cook_shark',   name:'Cook Shark',   icon:'🦈', input:'shark',   output:'cooked_shark',   xp:200, req:60, ms:5000},
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
  ],
  prayer: [
    {id:'bury_bones',     name:'Bury Bones',         icon:'🦴', input:'bones',         output:null, xp:4.5, req:1,  ms:1200},
    {id:'bury_big',       name:'Bury Big Bones',     icon:'🦴', input:'big_bones',     output:null, xp:15,  req:15, ms:1500},
    {id:'bury_dragon',    name:'Bury Dragon Bones',  icon:'🦴', input:'dragon_bones',  output:null, xp:72,  req:35, ms:2000},
  ]
};
