// Artisan recipes (cooking/smithing/crafting/prayer)

export const ARTISAN_RECIPES = {
  cooking: [
    {id:'cook_shrimp',  name:'Cook Shrimp',  icon:'🦐', input:'shrimp',  output:'cooked_shrimp',  xp:30,  req:1,  ms:2400},
    {id:'cook_trout',   name:'Cook Trout',   icon:'🐟', input:'trout',   output:'cooked_trout',   xp:50,  req:15, ms:3000},
    {id:'cook_lobster', name:'Cook Lobster', icon:'🦞', input:'lobster', output:'cooked_lobster', xp:100, req:30, ms:3600},
    {id:'cook_shark',   name:'Cook Shark',   icon:'🦈', input:'shark',   output:'cooked_shark',   xp:200, req:60, ms:5000},
  ],
  smithing: [
    {id:'smelt_copper',  name:'Copper Bar',  icon:'🟤', input:'copper_ore',  output:'copper_bar',  xp:15,  req:1,  ms:2400},
    {id:'smelt_iron',    name:'Iron Bar',    icon:'⬜', input:'iron_ore',    output:'iron_bar',    xp:30,  req:15, ms:3000, secondary:{coal:1}},
    {id:'smelt_gold',    name:'Gold Bar',    icon:'🟡', input:'gold_ore',    output:'gold_bar',    xp:60,  req:40, ms:4000, secondary:{coal:2}},
    {id:'smelt_mithril', name:'Mithril Bar', icon:'🔵', input:'mithril_ore', output:'mithril_bar', xp:120, req:55, ms:5000, secondary:{coal:3}},
    // Forge weapons (bar + plank → sword/hammer)
    {id:'forge_bronze_sword',    name:'Forge Bronze Sword',    icon:'⚔️', input:'copper_bar',  output:'bronze_sword',    xp:55,  req:5,  ms:4000, secondary:{copper_bar:1, normal_plank:1}},
    {id:'forge_iron_sword',      name:'Forge Iron Sword',      icon:'⚔️', input:'iron_bar',    output:'iron_sword',      xp:120, req:30, ms:5000, secondary:{iron_bar:1, oak_plank:1}},
    {id:'forge_steel_sword',     name:'Forge Steel Sword',     icon:'⚔️', input:'iron_bar',    output:'steel_sword',     xp:240, req:55, ms:6000, secondary:{iron_bar:2, willow_plank:1, coal:2}},
    {id:'forge_rune_sword',      name:'Forge Rune Sword',      icon:'⚔️', input:'mithril_bar', output:'rune_sword',      xp:520, req:80, ms:7500, secondary:{mithril_bar:2, maple_plank:1, gold_bar:1}},
    // Forge armor
    {id:'forge_iron_helm',       name:'Forge Iron Helm',       icon:'⛑️', input:'iron_bar',    output:'iron_helm',       xp:80,  req:25, ms:4500, secondary:{iron_bar:1}},
    {id:'forge_iron_platebody',  name:'Forge Iron Platebody',  icon:'🦺', input:'iron_bar',    output:'iron_platebody',  xp:200, req:35, ms:5500, secondary:{iron_bar:3}},
    {id:'forge_steel_helm',      name:'Forge Steel Helm',      icon:'⛑️', input:'iron_bar',    output:'steel_helm',      xp:160, req:50, ms:5500, secondary:{iron_bar:2, coal:1}},
    {id:'forge_steel_platebody', name:'Forge Steel Plate',     icon:'🦺', input:'iron_bar',    output:'steel_platebody', xp:380, req:65, ms:6500, secondary:{iron_bar:5, coal:3}},
    {id:'forge_iron_warhammer',  name:'Forge Iron Warhammer',  icon:'🔨', input:'iron_bar',    output:'iron_warhammer',  xp:140, req:35, ms:5500, secondary:{iron_bar:2, oak_plank:1}},
  ],
  crafting: [
    {id:'saw_normal', name:'Normal Plank', icon:'🪵', input:'normal_log', output:'normal_plank', xp:10,  req:1,  ms:2400},
    {id:'saw_oak',    name:'Oak Plank',    icon:'🪵', input:'oak_log',    output:'oak_plank',    xp:25,  req:15, ms:3000},
    {id:'saw_willow', name:'Willow Plank', icon:'🪵', input:'willow_log', output:'willow_plank', xp:50,  req:30, ms:3600},
    {id:'saw_maple',  name:'Maple Plank',  icon:'🍁', input:'maple_log',  output:'maple_plank',  xp:90,  req:45, ms:4500},
    {id:'saw_yew',    name:'Yew Plank',    icon:'🌲', input:'yew_log',    output:'yew_plank',    xp:160, req:60, ms:6000},
    // Plank + thread → bows
    {id:'craft_shortbow',         name:'Craft Shortbow',         icon:'🏹', input:'normal_plank', output:'shortbow',         xp:50,  req:5,  ms:4000, secondary:{silk_thread:1}},
    {id:'craft_longbow',          name:'Craft Longbow',          icon:'🏹', input:'oak_plank',    output:'longbow',          xp:120, req:30, ms:5000, secondary:{silk_thread:2}},
    // Plank + magic essence → staves
    {id:'craft_apprentice_staff', name:'Craft Apprentice Staff', icon:'🪄', input:'oak_plank',    output:'apprentice_staff', xp:75,  req:15, ms:4500, secondary:{magic_essence:1}},
    {id:'craft_oak_staff',        name:'Craft Oak Staff',        icon:'🪄', input:'maple_plank',  output:'oak_staff',        xp:180, req:35, ms:5500, secondary:{magic_essence:3, silk_thread:1}},
    // Iron + plank → arrows
    {id:'craft_iron_arrows',      name:'Craft Iron Arrows',      icon:'🏹', input:'iron_bar',     output:'iron_arrows',      xp:60,  req:25, ms:4000, secondary:{willow_plank:1}},
    // Plank + pelt/thread → light armor & accessories
    {id:'craft_traveler_cape',    name:'Craft Traveler Cape',    icon:'🦸', input:'willow_plank', output:'traveler_cape',    xp:100, req:20, ms:4500, secondary:{wolf_pelt:1, silk_thread:1}},
    {id:'craft_leather_boots',    name:'Craft Leather Boots',    icon:'🥾', input:'normal_plank', output:'leather_boots',    xp:65,  req:8,  ms:3500, secondary:{wolf_pelt:1}},
    {id:'craft_leather_gloves',   name:'Craft Leather Gloves',   icon:'🧤', input:'normal_plank', output:'leather_gloves',   xp:55,  req:6,  ms:3500, secondary:{wolf_pelt:1}},
    {id:'craft_bronze_belt',      name:'Craft Bronze Belt',      icon:'🟫', input:'normal_plank', output:'bronze_belt',      xp:75,  req:12, ms:3800, secondary:{copper_bar:1, silk_thread:1}},
  ],
  prayer: [
    {id:'bury_bones',     name:'Bury Bones',         icon:'🦴', input:'bones',         output:null, xp:4.5, req:1,  ms:1200},
    {id:'bury_big',       name:'Bury Big Bones',     icon:'🦴', input:'big_bones',     output:null, xp:15,  req:15, ms:1500},
    {id:'bury_dragon',    name:'Bury Dragon Bones',  icon:'🦴', input:'dragon_bones',  output:null, xp:72,  req:35, ms:2000},
  ]
};
