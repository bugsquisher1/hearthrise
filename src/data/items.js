// ITEMS — extracted from hearthrise-phaseA.html

export const ITEMS={
  bones:{n:'Bones',icon:'🦴',v:1,buryXp:4.5},big_bones:{n:'Big Bones',icon:'🦴',v:3,buryXp:15},
  dragon_bones:{n:'Dragon Bones',icon:'🦴',v:10,buryXp:72},
  slime_gel:{n:'Slime Gel',icon:'🟢',v:5},goblin_ear:{n:'Goblin Ear',icon:'👂',v:8},
  bat_wing:{n:'Bat Wing',icon:'🦇',v:12},wolf_pelt:{n:'Wolf Pelt',icon:'🐺',v:35},
  troll_hide:{n:'Troll Hide',icon:'🟤',v:80},vamp_dust:{n:'Vampire Dust',icon:'💜',v:120},
  demon_shard:{n:'Demon Shard',icon:'🔴',v:200},dragon_scale:{n:'Dragon Scale',icon:'🐲',v:500},
  lich_soul:{n:'Lich Soul',icon:'☠️',v:800},magic_essence:{n:'Magic Essence',icon:'✨',v:50},
  rune_frag:{n:'Rune Fragment',icon:'🔷',v:30},ancient_rune:{n:'Ancient Rune',icon:'🔮',v:300},
  dragon_gem:{n:'Dragon Gem',icon:'💎',v:2000},ruby:{n:'Ruby',icon:'❤️',v:400},
  sticky_core:{n:'Sticky Core',icon:'🟢',v:35},rat_tail:{n:'Rat Tail',icon:'🐀',v:6},small_fang:{n:'Small Fang',icon:'🦷',v:15},
  bone_chips:{n:'Bone Chips',icon:'🦴',v:10},ancient_fragment:{n:'Ancient Fragment',icon:'🏺',v:85},goblin_totem:{n:'Goblin Totem',icon:'🗿',v:120},
  night_fang:{n:'Night Fang',icon:'🦇',v:90},dark_sigil:{n:'Dark Sigil',icon:'🔯',v:180},venom_sac:{n:'Venom Sac',icon:'🟣',v:75},
  silk_thread:{n:'Silk Thread',icon:'🧵',v:55},spider_eye:{n:'Spider Eye',icon:'👁️',v:220},brute_plate:{n:'Brute Plate',icon:'🛡️',v:130},
  dire_fang:{n:'Dire Fang',icon:'🦷',v:150},alpha_fang:{n:'Alpha Fang',icon:'🦷',v:450},grave_dust:{n:'Grave Dust',icon:'⚱️',v:95},
  cracked_spellstone:{n:'Cracked Spellstone',icon:'🔮',v:260},plague_ichor:{n:'Plague Ichor',icon:'🧪',v:180},swarm_heart:{n:'Swarm Heart',icon:'💚',v:650},
  warlord_badge:{n:'Warlord Badge',icon:'🎖️',v:350},bear_pelt:{n:'Bear Pelt',icon:'🐻',v:260},bear_claw:{n:'Bear Claw',icon:'爪',v:180},
  wraith_veil:{n:'Wraith Veil',icon:'👻',v:420},hell_ember:{n:'Hell Ember',icon:'🔥',v:600},shadow_thread:{n:'Shadow Thread',icon:'🧵',v:320},
  void_chitin:{n:'Void Chitin',icon:'🪲',v:800},captain_medal:{n:'Captain Medal',icon:'🏅',v:700},shadow_pelt:{n:'Shadow Pelt',icon:'🐈‍⬛',v:480},
  razor_claw:{n:'Razor Claw',icon:'爪',v:360},death_steel:{n:'Death Steel',icon:'⚙️',v:550},captains_ribblade:{n:"Captain's Ribblade",icon:'🗡️',v:1800,type:'weapon',slot:'weapon',weaponType:'sword',atkB:19,strB:15},
  hollow_sigil:{n:'Hollow Sigil',icon:'🔯',v:1400},void_core:{n:'Void Core',icon:'⚫',v:2200},war_crown:{n:'War Crown',icon:'👑',v:2500},
  ancient_claw:{n:'Ancient Claw',icon:'爪',v:1600},chief_blade:{n:"Chief's Blade",icon:'🗡️',v:900,type:'weapon',slot:'weapon',weaponType:'sword',atkB:13,strB:11},alpha_cloak:{n:'Alpha Cloak',icon:'🦸',v:1500,type:'armor',slot:'cape',defB:5,atkB:2},
  leather_boots:{n:'Leather Boots',icon:'🥾',v:90,type:'armor',slot:'boots',defB:2,spdB:.02},
  traveler_cape:{n:'Traveler Cape',icon:'🦸',v:150,type:'armor',slot:'cape',defB:1,xpB:.01},
  copper_ring:{n:'Copper Ring',icon:'💍',v:120,type:'jewelry',slot:'ring',atkB:1,strB:1},
  hunter_necklace:{n:'Hunter Necklace',icon:'📿',v:180,type:'jewelry',slot:'necklace',atkB:2},
  leather_gloves:{n:'Leather Gloves',icon:'🧤',v:80,type:'armor',slot:'gloves',atkB:1,defB:1},
  bronze_belt:{n:'Bronze Belt',icon:'🟫',v:110,type:'armor',slot:'belt',defB:2},
  iron_arrows:{n:'Iron Arrows',icon:'🏹',v:60,type:'ammo',slot:'ammo',atkB:2,critB:.01},
  fox_companion:{n:'Fox Companion',icon:'🦊',v:600,type:'companion',slot:'companion',strB:2,xpB:.02},
  iron_ore:{n:'Iron Ore',icon:'⬜',v:25},
  normal_log:{n:'Normal Log',icon:'🪵',v:8},oak_log:{n:'Oak Log',icon:'🪵',v:20},
  willow_log:{n:'Willow Log',icon:'🪵',v:40},maple_log:{n:'Maple Log',icon:'🪵',v:80},
  yew_log:{n:'Yew Log',icon:'🪵',v:200},
  copper_ore:{n:'Copper Ore',icon:'🟤',v:10},coal:{n:'Coal',icon:'⬛',v:40},
  gold_ore:{n:'Gold Ore',icon:'🟡',v:100},mithril_ore:{n:'Mithril Ore',icon:'🔵',v:200},
  shrimp:{n:'Raw Shrimp',icon:'🦐',v:5,heals:3},trout:{n:'Raw Trout',icon:'🐟',v:20,heals:7},
  lobster:{n:'Raw Lobster',icon:'🦞',v:100,heals:12},shark:{n:'Raw Shark',icon:'🦈',v:400,heals:20},
  turnip:{n:'Turnip',icon:'🥕',v:20,heals:2},carrot:{n:'Carrot',icon:'🥕',v:35,heals:3},
  wheat:{n:'Wheat',icon:'🌾',v:50,heals:1},potato:{n:'Potato',icon:'🥔',v:65,heals:5},
  tomato:{n:'Tomato',icon:'🍅',v:90,heals:4},pumpkin:{n:'Pumpkin',icon:'🎃',v:150,heals:8},
  turnip_seed:{n:'Turnip Seed',icon:'🌱',v:5,seed:'turnip'},carrot_seed:{n:'Carrot Seed',icon:'🌱',v:10,seed:'carrot'},
  wheat_seed:{n:'Wheat Seed',icon:'🌱',v:15,seed:'wheat'},potato_seed:{n:'Potato Seed',icon:'🌱',v:20,seed:'potato'},
  tomato_seed:{n:'Tomato Seed',icon:'🌱',v:30,seed:'tomato'},pumpkin_seed:{n:'Pumpkin Seed',icon:'🌱',v:50,seed:'pumpkin'},
  bronze_sword:{n:'Bronze Sword',icon:'⚔️',v:50,type:'weapon',slot:'weapon',weaponType:'sword',atkB:4,strB:3},
  iron_sword:{n:'Iron Sword',icon:'⚔️',v:200,type:'weapon',slot:'weapon',weaponType:'sword',atkB:7,strB:6},
  steel_sword:{n:'Steel Sword',icon:'⚔️',v:800,type:'weapon',slot:'weapon',weaponType:'sword',atkB:12,strB:10},
  rune_sword:{n:'Rune Sword',icon:'⚔️',v:5000,type:'weapon',slot:'weapon',weaponType:'sword',atkB:25,strB:20},
  apprentice_staff:{n:'Apprentice Staff',icon:'🔮',v:80,type:'weapon',slot:'weapon',weaponType:'magic',atkB:3,strB:5,magicAtkB:3,magicStrB:5},
  oak_staff:{n:'Oak Staff',icon:'🪄',v:300,type:'weapon',slot:'weapon',weaponType:'magic',atkB:6,strB:9,magicAtkB:6,magicStrB:9},
  shortbow:{n:'Shortbow',icon:'🏹',v:90,type:'weapon',slot:'weapon',weaponType:'ranged',atkB:5,strB:3,rangeAtkB:5,rangeStrB:3},
  longbow:{n:'Longbow',icon:'🏹',v:400,type:'weapon',slot:'weapon',weaponType:'ranged',atkB:9,strB:6,rangeAtkB:9,rangeStrB:6},
  stone_maul:{n:'Stone Maul',icon:'🔨',v:110,type:'weapon',slot:'weapon',weaponType:'hammer',atkB:3,strB:7},
  iron_warhammer:{n:'Iron Warhammer',icon:'🔨',v:550,type:'weapon',slot:'weapon',weaponType:'hammer',atkB:7,strB:12},
  iron_helm:{n:'Iron Helm',icon:'⛑️',v:150,type:'armor',slot:'helmet',defB:5},
  steel_helm:{n:'Steel Helm',icon:'⛑️',v:600,type:'armor',slot:'helmet',defB:10},
  iron_platebody:{n:'Iron Platebody',icon:'🦺',v:400,type:'armor',slot:'body',defB:12},
  steel_platebody:{n:'Steel Platebody',icon:'🦺',v:1500,type:'armor',slot:'body',defB:22},

  /* ── Recipe outputs: cooking ──
     Each cooked food heals more than its raw form AND grants a stacking buff
     when eaten via the Eat Now flow. Buff durations scale with tier so the
     player invests cooking XP for longer effects. */
  cooked_shrimp: {
    n:'Cooked Shrimp', icon:'🍤', v:18, heals:8, foodTier:1,
    buff:{type:'gather_speed', magnitude:5,  durationMs:120000},
  },
  cooked_trout: {
    n:'Cooked Trout', icon:'🐠', v:55, heals:14, foodTier:2,
    buff:{type:'all_xp', magnitude:5,  durationMs:180000},
  },
  cooked_lobster: {
    n:'Cooked Lobster', icon:'🦞', v:240, heals:25, foodTier:3,
    buff:{type:'drop_rate', magnitude:8,  durationMs:300000},
  },
  cooked_shark: {
    n:'Cooked Shark', icon:'🍣', v:900, heals:42, foodTier:4,
    buff:{type:'damage', magnitude:12, durationMs:360000},
  },

  /* ── Recipe outputs: smithing (bars) ── */
  copper_bar:  {n:'Copper Bar',  icon:'🟫', v:35},
  iron_bar:    {n:'Iron Bar',    icon:'⬛', v:90},
  gold_bar:    {n:'Gold Bar',    icon:'🟨', v:280},
  mithril_bar: {n:'Mithril Bar', icon:'🟦', v:650},

  /* ── Recipe outputs: crafting (planks) ── */
  normal_plank: {n:'Normal Plank', icon:'🪵', v:18},
  oak_plank:    {n:'Oak Plank',    icon:'🪵', v:55},
  willow_plank: {n:'Willow Plank', icon:'🪵', v:120},
  maple_plank:  {n:'Maple Plank',  icon:'🍁', v:240},
  yew_plank:    {n:'Yew Plank',    icon:'🌲', v:520},

  /* ── Cooked crops (farm → cooking) — extension hooks for upcoming
     pumpkin pie / carrot stew recipes. Defined with placeholder buffs
     so that even a partial cooking unlock has working buff foods. */
  baked_potato: {
    n:'Baked Potato', icon:'🥔', v:150, heals:20, foodTier:2,
    buff:{type:'gather_speed', magnitude:10, durationMs:240000},
  },
  pumpkin_pie: {
    n:'Pumpkin Pie', icon:'🥧', v:420, heals:35, foodTier:3,
    buff:{type:'all_xp', magnitude:10, durationMs:300000},
  },
  carrot_stew: {
    n:'Carrot Stew', icon:'🍲', v:200, heals:24, foodTier:2,
    buff:{type:'farm_yield', magnitude:15, durationMs:360000},
  },
  tomato_soup: {
    n:'Tomato Soup', icon:'🍅', v:260, heals:28, foodTier:2,
    buff:{type:'monster_respawn', magnitude:10, durationMs:240000},
  },
  wheat_bread: {
    n:'Wheat Bread', icon:'🍞', v:120, heals:18, foodTier:1,
    buff:{type:'drop_rate', magnitude:5, durationMs:180000},
  },

  /* ── Farmer's Deed (b136 — Batch C) ────────────────────────────
     Drops from Tier-2+ kills (0.1%) and bounty completions (0.5%).
     Spent at House → Plot tab to upgrade Farm Plot tier and unlock crops.
     Explicitly NOT bind-on-pickup — tradable on the player market.
     Drop hooks live in src/features/farm-progression.js. Keep this in sync
     with the inline ITEMS const in src/legacy.js. */
  farm_deed: {n:"Farmer's Deed", icon:'📜', v:250, rarity:'rare', tag:'housing'},

  /* ── Phase A.1 items mirrored from legacy.js (b139 — QA sweep §1.1)
     These were defined in legacy.js's NEW_ITEMS block but missing from
     this ESM module. Because main.js does `Object.assign(window, {ITEMS})`
     AFTER legacy.js runs, the ESM ITEMS overwrote the legacy version and
     these were silently undefined at runtime — breaking every recipe that
     produced one of them (smelt_bronze, smelt_steel, smelt_rune, all
     cooked meats, all buff foods, all gated recipe scrolls). The
     data-integrity check (src/utils/data-integrity.js) flagged this on
     every boot once the b137 fix made the check actually work. Now in
     sync. Keep both this file and legacy.js's NEW_ITEMS aligned until
     legacy.js's block is deleted. */
  raw_wolf_meat:    {n:'Raw Wolf Meat',    icon:'🍖', v:5,  cookedFrom:null},
  raw_panther_meat: {n:'Raw Panther Meat', icon:'🍖', v:8,  cookedFrom:null},
  raw_bear_meat:    {n:'Raw Bear Meat',    icon:'🍖', v:15, cookedFrom:null},
  cooked_wolf_meat:    {n:'Cooked Wolf Meat',    icon:'🥩', v:12, heals:6,  cookedFrom:'raw_wolf_meat'},
  cooked_panther_meat: {n:'Cooked Panther Meat', icon:'🥩', v:22, heals:9,  cookedFrom:'raw_panther_meat'},
  cooked_bear_meat:    {n:'Cooked Bear Meat',    icon:'🥩', v:42, heals:13, cookedFrom:'raw_bear_meat'},
  // Tier 2 buff foods
  roasted_carrot:  {n:'Roasted Carrot', icon:'🥕', v:12,  heals:5,  buff:{type:'gather_speed', magnitude:1,  durationMs:180000}},
  roasted_pumpkin: {n:'Roasted Pumpkin',icon:'🎃', v:90,  heals:22, buff:{type:'farm_yield',   magnitude:5,  durationMs:600000}},
  vegetable_stew:  {n:'Vegetable Stew', icon:'🍲', v:140, heals:24, buff:{type:'all_xp',       magnitude:3,  durationMs:900000}},
  // Tier 3 buff foods
  bear_claw_pie:  {n:'Bear Claw Pie',  icon:'🥧', v:280, heals:32, buff:{type:'damage',          magnitude:5,  durationMs:600000}},
  hunters_feast:  {n:"Hunter's Feast", icon:'🍱', v:420, heals:35, buff:{type:'monster_respawn', magnitude:15, durationMs:900000}},
  dragon_stew:    {n:'Dragon Stew',    icon:'🍜', v:780, heals:45, buff:{type:'combat_xp',       magnitude:10, durationMs:1200000}},
  lich_soul_soup: {n:'Lich Soul Soup', icon:'🥣', v:1100,heals:50, buff:{type:'gold_find',       magnitude:50, durationMs:300000}},
  void_banquet:   {n:'Void Banquet',   icon:'🎂', v:2400,heals:60, buff:{type:'damage_crit',     magnitude:5,  durationMs:900000}},
  // New bars (Phase A.1 progression — required by smelt_* and forge_* recipes below)
  bronze_bar: {n:'Bronze Bar', icon:'🟫', v:32},
  steel_bar:  {n:'Steel Bar',  icon:'⬜', v:150},
  rune_bar:   {n:'Rune Bar',   icon:'🔷', v:1200},
  // Recipe scrolls — drop from named bosses, single-use unlocks for gated recipes
  chief_blade_recipe:   {n:"Chief's Blade Recipe",      icon:'📜', v:0, recipe:'chief_blade'},
  captain_recipe:       {n:"Captain's Ribblade Recipe", icon:'📜', v:0, recipe:'captains_ribblade'},
  alpha_pattern:        {n:'Alpha Cloak Pattern',       icon:'📜', v:0, recipe:'alpha_cloak'},
  spellstone_diagram:   {n:'Spellstone Diagram',        icon:'📜', v:0, recipe:'spellstone_ring'},
  dragon_marrow_recipe: {n:'Dragon Marrow Recipe',      icon:'📜', v:0, recipe:'dragonbone_spear'},
  gemcutter_note:       {n:"Gemcutter's Note",          icon:'📜', v:0, recipe:'dragon_gem_earrings'},
  soul_recipe:          {n:'Soul Recipe Scroll',        icon:'📜', v:0, recipe:'lich_soul_soup'},
  marrow_cookbook:      {n:'Marrow Cookbook',           icon:'📜', v:0, recipe:'dragon_stew'},
  field_cookbook:       {n:'Field Cookbook',            icon:'📜', v:0, recipe:'hunters_feast'},

  /* ── Bind-on-Pickup housing blueprints ─────────────────────────
     These drop from daily quests / monster drops / dungeons / raids.
     They unlock the corresponding room upgrade tier when consumed.
     Untradeable so the economy can't bypass progression. */
  kitchen_blueprint_t2: {
    n:'Kitchen Blueprint II', icon:'📜', v:500, bop:true,
    rarity:'rare', tag:'housing', unlocks:'kitchen.2',
  },
  kitchen_blueprint_t3: {
    n:'Kitchen Blueprint III', icon:'📜', v:2000, bop:true,
    rarity:'epic', tag:'housing', unlocks:'kitchen.3',
  },
  forge_blueprint_t2: {
    n:'Forge Blueprint II', icon:'📜', v:500, bop:true,
    rarity:'rare', tag:'housing', unlocks:'forge.2',
  },
  forge_blueprint_t3: {
    n:'Forge Blueprint III', icon:'📜', v:2000, bop:true,
    rarity:'epic', tag:'housing', unlocks:'forge.3',
  },
  library_blueprint_t2: {
    n:'Library Blueprint II', icon:'📜', v:500, bop:true,
    rarity:'rare', tag:'housing', unlocks:'library.2',
  },
  library_blueprint_t3: {
    n:'Library Blueprint III', icon:'📜', v:2000, bop:true,
    rarity:'epic', tag:'housing', unlocks:'library.3',
  },
  trophy_blueprint_t2: {
    n:'Trophy Blueprint II', icon:'📜', v:500, bop:true,
    rarity:'rare', tag:'housing', unlocks:'trophy.2',
  },
  trophy_blueprint_t3: {
    n:'Trophy Blueprint III', icon:'📜', v:2000, bop:true,
    rarity:'epic', tag:'housing', unlocks:'trophy.3',
  },

  /* ── Bind-on-Pickup high-tier rewards ──────────────────────────
     These come from raids / world bosses and gate cosmetic / power
     content. Cannot be flipped on the player market. */
  dragon_relic: {
    n:'Dragon Relic', icon:'🐲', v:5000, bop:true,
    rarity:'legendary', tag:'cosmetic',
  },
  void_essence: {
    n:'Void Essence', icon:'🌌', v:3000, bop:true,
    rarity:'epic', tag:'crafting-mat',
  },
  hearth_token: {
    n:'Hearth Token', icon:'🪙', v:0, bop:true,
    rarity:'currency', tag:'currency',
  },

  /* ── Bind-on-Pickup dungeon keys ──
     Replace gold entry costs. Drop from monsters whose family/tier match
     the dungeon (set in MONSTERS.drops). Untradeable. */
  bone_key:        {n:'Bone Key',        icon:'🦴', v:0, bop:true, rarity:'uncommon',  tag:'key', unlocks:'crypt_of_bones'},
  goblin_seal:     {n:'Goblin Seal',     icon:'🗝️', v:0, bop:true, rarity:'uncommon',  tag:'key', unlocks:'goblin_warcamp'},
  arcane_tome:     {n:'Arcane Tome',     icon:'📕', v:0, bop:true, rarity:'rare',      tag:'key', unlocks:'haunted_archive'},
  obsidian_sigil:  {n:'Obsidian Sigil',  icon:'⬛', v:0, bop:true, rarity:'epic',      tag:'key', unlocks:'obsidian_keep'},
  void_fragment:   {n:'Void Fragment',   icon:'🌑', v:0, bop:true, rarity:'epic',      tag:'key', unlocks:'voidbringer'},
  dragonsbane_key: {n:'Dragonsbane Key', icon:'🗡️', v:0, bop:true, rarity:'legendary', tag:'key', unlocks:'ancient_wyrm'},
};
