// ITEMS — extracted from hearthrise-phaseA.html

import { GEAR_ITEMS } from './gear-tiers.js?v=331';
import { WAVE3_ITEMS } from './wave3-uniques.js?v=331';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from './gathering.js?v=331';

export const ITEMS={
  /* b215: the generated tier ladder (7 material tiers × every armour slot ×
     four weapon families) is spread FIRST, so any hand-authored entry below
     with the same id wins and keeps its historical stats/values. */
  ...GEAR_ITEMS,

  /* b247 (Wave 3): 14 curated unique items that route ~26 orphan boss/mid
     drops into real gear. New ids only — no collision with hand entries. */
  ...WAVE3_ITEMS,

  /* ── Gathering tools (b201, SYS-3) — OSRS-style tool ladder. ──
     type:'tool' + toolSkill + toolTier + toolSpeed. The best owned tool
     auto-applies to its skill (Melvor-style, no equip juggling):
     see src/features/tools.js bestToolSpeed(). Crafted via smithing
     (axes/picks) and crafting (rods) — recipes in data/recipes.js. */
  bronze_axe:{n:'Bronze Axe',icon:'🪓',v:60,type:'tool',toolSkill:'woodcutting',toolTier:1,toolSpeed:.05},
  iron_axe:{n:'Iron Axe',icon:'🪓',v:250,type:'tool',toolSkill:'woodcutting',toolTier:2,toolSpeed:.10},
  steel_axe:{n:'Steel Axe',icon:'🪓',v:900,type:'tool',toolSkill:'woodcutting',toolTier:3,toolSpeed:.15},
  mithril_axe:{n:'Mithril Axe',icon:'🪓',v:3200,type:'tool',toolSkill:'woodcutting',toolTier:4,toolSpeed:.20},
  rune_axe:{n:'Rune Axe',icon:'🪓',v:9000,type:'tool',toolSkill:'woodcutting',toolTier:5,toolSpeed:.25},
  bronze_pickaxe:{n:'Bronze Pickaxe',icon:'⛏️',v:60,type:'tool',toolSkill:'mining',toolTier:1,toolSpeed:.05},
  iron_pickaxe:{n:'Iron Pickaxe',icon:'⛏️',v:250,type:'tool',toolSkill:'mining',toolTier:2,toolSpeed:.10},
  steel_pickaxe:{n:'Steel Pickaxe',icon:'⛏️',v:900,type:'tool',toolSkill:'mining',toolTier:3,toolSpeed:.15},
  mithril_pickaxe:{n:'Mithril Pickaxe',icon:'⛏️',v:3200,type:'tool',toolSkill:'mining',toolTier:4,toolSpeed:.20},
  rune_pickaxe:{n:'Rune Pickaxe',icon:'⛏️',v:9000,type:'tool',toolSkill:'mining',toolTier:5,toolSpeed:.25},
  willow_rod:{n:'Willow Rod',icon:'🎣',v:80,type:'tool',toolSkill:'fishing',toolTier:1,toolSpeed:.05},
  oak_rod:{n:'Oak Rod',icon:'🎣',v:300,type:'tool',toolSkill:'fishing',toolTier:2,toolSpeed:.10},
  maple_rod:{n:'Maple Rod',icon:'🎣',v:1000,type:'tool',toolSkill:'fishing',toolTier:3,toolSpeed:.15},
  yew_rod:{n:'Yew Rod',icon:'🎣',v:3500,type:'tool',toolSkill:'fishing',toolTier:4,toolSpeed:.20},
  runewood_rod:{n:'Runewood Rod',icon:'🎣',v:9500,type:'tool',toolSkill:'fishing',toolTier:5,toolSpeed:.25},
  /* Wave 3: ARTISAN tools — the counterpart to gathering tools, so tools improve
     crafting/smithing/cooking too (Tyler). Best owned auto-applies (tools.js);
     each grants speed + tier-derived XP + a double-craft chance. */
  bronze_hammer:{n:'Bronze Hammer',icon:'🔨',v:70,type:'tool',toolSkill:'smithing',toolTier:1,toolSpeed:.05},
  steel_hammer:{n:'Steel Hammer',icon:'🔨',v:950,type:'tool',toolSkill:'smithing',toolTier:3,toolSpeed:.15},
  rune_hammer:{n:'Rune Hammer',icon:'🔨',v:9200,type:'tool',toolSkill:'smithing',toolTier:5,toolSpeed:.25},
  bone_needle:{n:'Bone Needle',icon:'🪡',v:70,type:'tool',toolSkill:'crafting',toolTier:1,toolSpeed:.05},
  steel_needle:{n:'Steel Needle',icon:'🪡',v:950,type:'tool',toolSkill:'crafting',toolTier:3,toolSpeed:.15},
  rune_needle:{n:'Rune Needle',icon:'🪡',v:9200,type:'tool',toolSkill:'crafting',toolTier:5,toolSpeed:.25},
  bronze_knife:{n:'Bronze Knife',icon:'🔪',v:70,type:'tool',toolSkill:'cooking',toolTier:1,toolSpeed:.05},
  steel_knife:{n:'Steel Knife',icon:'🔪',v:950,type:'tool',toolSkill:'cooking',toolTier:3,toolSpeed:.15},
  rune_knife:{n:'Rune Knife',icon:'🔪',v:9200,type:'tool',toolSkill:'cooking',toolTier:5,toolSpeed:.25},
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
  /* Wave 4 (audit fix): Gold ore/bar was a near dead-end — an entire mining tier
     with one necklace as its only sink. These give gold_bar real demand and flesh
     out the thin jewelry lane. Stats are read by getEquipmentStats (real combat). */
  gold_ring:{n:'Gold Ring',icon:'💍',v:600,type:'jewelry',slot:'ring',atkB:3,strB:3},
  gold_amulet:{n:'Gold Amulet',icon:'📿',v:1100,type:'jewelry',slot:'necklace',atkB:4,defB:2},
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
     player invests cooking XP for longer effects.

     b220 — `foodClass` (crafting-cooking-taxonomy §5): every cooked food is
     either a PROVISION (`healing`) or a FEAST/DRAUGHT (`buff`). The split is by
     ROLE, not by "has a buff", because every cooked food carries one:
       • healing — the staple you eat to get HP back. This is the ONLY pool
         auto-eat may draw from (auto-eat = heal only, design law).
       • buff    — a prepared dish or drink you time deliberately, like a
         potion. Auto-eat must never burn one.
     Cooking's two sub-tabs (Provisions / Feasts & Draughts) are derived from
     this field — see foodClassOf() at the bottom of this file. */
  /* Wave 2 (audit fix): the FIRST crop a new player grows (Turnip) had no cooking
     recipe at all — every other crop feeds cooking, turnip was the lone dead end.
     Turnip Mash is the starter cook (Cooking 1), so a brand-new farmer/cook can
     actually cook their first harvest. */
  turnip_mash: {
    n:'Turnip Mash', icon:'🥣', v:14, heals:5, foodTier:1, foodClass:'healing',
  },
  cooked_shrimp: {
    n:'Cooked Shrimp', icon:'🍤', v:18, heals:8, foodTier:1, foodClass:'healing',
    buff:{type:'gather_speed', magnitude:1,  durationMs:120000},
  },
  cooked_trout: {
    n:'Cooked Trout', icon:'🐠', v:55, heals:14, foodTier:2, foodClass:'healing',
    buff:{type:'all_xp', magnitude:2,  durationMs:180000},
  },
  cooked_lobster: {
    n:'Cooked Lobster', icon:'🦞', v:240, heals:25, foodTier:3, foodClass:'healing',
    buff:{type:'drop_rate', magnitude:3,  durationMs:300000},
  },
  cooked_shark: {
    n:'Cooked Shark', icon:'🍣', v:900, heals:42, foodTier:4, foodClass:'healing',
    buff:{type:'damage', magnitude:4, durationMs:360000},
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

  /* ══════════════════════════════════════════════════════════════════
     b215 — LATE-GAME RESOURCE TIERS (levels 75-90)
     Every gathering skill used to stop dead around level 60 while the XP
     table runs to 99, so the last third of the game had nothing new to
     collect. These two tiers — Emberforged and Dawnsteel, plus the woods,
     waters and crops that feed them — carry every ladder to the cap.
     ══════════════════════════════════════════════════════════════════ */
  /* Mining (75 / 90) */
  emberstone_ore: {n:'Emberstone Ore', icon:'🔶', v:520},
  dawnstone_ore:  {n:'Dawnstone Ore',  icon:'🌟', v:1400},
  /* Smithing outputs */
  ember_bar: {n:'Emberforged Bar', icon:'🟧', v:1600},
  dawn_bar:  {n:'Dawnsteel Bar',   icon:'🟪', v:4200},
  /* Woodcutting (75 / 90) */
  runewood_log: {n:'Runewood Log', icon:'🪵', v:480},
  duskwood_log: {n:'Duskwood Log', icon:'🪵', v:1150},
  /* Crafting outputs */
  runewood_plank: {n:'Runewood Plank', icon:'🪵', v:1150},
  duskwood_plank: {n:'Duskwood Plank', icon:'🪵', v:2600},
  /* Fishing gap-fillers (10 / 66) */
  herring:         {n:'Raw Herring', icon:'🐟', v:14, heals:4},
  cooked_herring:  {n:'Cooked Herring', icon:'🐟', v:40, heals:6, foodTier:1, foodClass:'healing',
    buff:{type:'gather_speed', magnitude:1, durationMs:120000}},
  frostfin:        {n:'Raw Frostfin', icon:'❄️', v:520, heals:18},
  cooked_frostfin: {n:'Frostfin Supper', icon:'🍲', v:1300, heals:28, foodTier:4, foodClass:'healing',
    buff:{type:'defense', magnitude:4, durationMs:360000}},
  /* Fishing (55 / 90) — swordfish also fills the old 40→76 dead zone */
  swordfish:        {n:'Raw Swordfish', icon:'🐠', v:220, heals:14},
  cooked_swordfish: {n:'Swordfish Steak', icon:'🍥', v:560, heals:22, foodTier:3, foodClass:'healing',
    buff:{type:'damage', magnitude:3, durationMs:300000}},
  moonfish:         {n:'Raw Moonfish', icon:'🌙', v:900, heals:24},
  cooked_moonfish:  {n:'Moonfish Fillet', icon:'🍣', v:2100, heals:38, foodTier:4, foodClass:'healing',
    buff:{type:'all_xp', magnitude:3, durationMs:420000}},
  /* Farming (62 / 75 / 88) */
  goldenroot:      {n:'Goldenroot', icon:'🥕', v:260, heals:12},
  goldenroot_seed: {n:'Goldenroot Seed', icon:'🌱', v:90,  seed:'goldenroot'},
  emberfruit:      {n:'Emberfruit', icon:'🔥', v:480, heals:16},
  emberfruit_seed: {n:'Emberfruit Seed', icon:'🌱', v:160, seed:'emberfruit'},
  moonbloom:       {n:'Moonbloom', icon:'🌸', v:850, heals:20},
  moonbloom_seed:  {n:'Moonbloom Seed', icon:'🌱', v:280, seed:'moonbloom'},
  /* Late-game cooking — gives the new crops a real sink */
  goldenroot_roast: {n:'Goldenroot Roast', icon:'🍠', v:700, heals:26, foodTier:3, foodClass:'buff',
    buff:{type:'gather_speed', magnitude:4, durationMs:360000}},
  ember_tart:       {n:'Ember Tart', icon:'🥧', v:1300, heals:30, foodTier:4, foodClass:'buff',
    buff:{type:'combat_xp', magnitude:4, durationMs:360000}},
  moonbloom_elixir: {n:'Moonbloom Elixir', icon:'🍶', v:2600, heals:40, foodTier:5, foodClass:'buff',
    buff:{type:'all_xp', magnitude:5, durationMs:480000}},

  /* Tool ladder, tiers 6-7 — the best owned tool auto-applies, so these are
     the final gather-speed upgrades (+30% / +35%). */
  ember_axe:      {n:'Emberforged Axe', icon:'🪓', v:22000, type:'tool', toolSkill:'woodcutting', toolTier:6, toolSpeed:.30},
  dawn_axe:       {n:'Dawnsteel Axe',   icon:'🪓', v:55000, type:'tool', toolSkill:'woodcutting', toolTier:7, toolSpeed:.35},
  ember_pickaxe:  {n:'Emberforged Pickaxe', icon:'⛏️', v:22000, type:'tool', toolSkill:'mining', toolTier:6, toolSpeed:.30},
  dawn_pickaxe:   {n:'Dawnsteel Pickaxe',   icon:'⛏️', v:55000, type:'tool', toolSkill:'mining', toolTier:7, toolSpeed:.35},
  duskwood_rod:   {n:'Duskwood Rod',  icon:'🎣', v:23000, type:'tool', toolSkill:'fishing', toolTier:6, toolSpeed:.30},
  dawnsteel_rod:  {n:'Dawnsteel Rod', icon:'🎣', v:58000, type:'tool', toolSkill:'fishing', toolTier:7, toolSpeed:.35},

  /* ── Cooked crops (farm → cooking) — extension hooks for upcoming
     pumpkin pie / carrot stew recipes. Defined with placeholder buffs
     so that even a partial cooking unlock has working buff foods. */
  baked_potato: {
    n:'Baked Potato', icon:'🥔', v:150, heals:20, foodTier:2, foodClass:'healing',
    buff:{type:'gather_speed', magnitude:3, durationMs:240000},
  },
  pumpkin_pie: {
    n:'Pumpkin Pie', icon:'🥧', v:420, heals:35, foodTier:3, foodClass:'buff',
    buff:{type:'all_xp', magnitude:3, durationMs:300000},
  },
  carrot_stew: {
    n:'Carrot Stew', icon:'🍲', v:200, heals:24, foodTier:2, foodClass:'buff',
    buff:{type:'farm_yield', magnitude:1, durationMs:360000},
  },
  tomato_soup: {
    n:'Tomato Soup', icon:'🍅', v:260, heals:28, foodTier:2, foodClass:'buff',
    buff:{type:'drop_rate', magnitude:2, durationMs:240000}, // b238: was dead monster_respawn
  },
  wheat_bread: {
    n:'Wheat Bread', icon:'🍞', v:120, heals:18, foodTier:1, foodClass:'healing',
    buff:{type:'drop_rate', magnitude:1, durationMs:180000},
  },

  /* ══════════════════════════════════════════════════════════════════
     b225 — BURNT FOOD, the open fire's failure state.

     The campfire ruling (Tyler, 2026-08-08; homestead-deepening.md §2
     PRODUCT-OWNER AMENDMENT) makes cooking possible from the tier-1 camp
     with a burn chance. A burn consumes the ingredients honestly and hands
     back this, one generic item for every ruined dish.

     ONE item rather than 27 `burnt_<food>` variants, deliberately: a burnt
     shrimp and a burnt shark are the same object — carbon — and 27 of them
     would pad the bag, the Collection Log and the market with content that
     says nothing. If the Designer ever wants tier-graded ash, this id stays
     the fallback.

     Why the fields are exactly these:
       • no `heals`, no `foodClass` → foodClassOf() answers null, so auto-eat
         can NEVER spend one (auto-eat may only take 'healing'), it never
         appears in the combat food picker, and it never lands in the cooking
         screen's Provisions / Feasts sub-tabs.
       • no `buff`, no `type`  → nothing equips or drinks it.
       • `v:1` → vendor trash. It is worth carrying to town and nothing more;
         at 1g it can never become a gold strategy no matter how badly you
         cook.
       • `note` is read by the inventory detail modal (legacy.js), so the
         flavour has an actual reader rather than being a dead field.        */
  burnt_food: {
    n:'Burnt Food', icon:'🔥', v:1,
    note:'Charcoal with ambitions. Nobody will eat this — sell it and cook better.',
  },

  /* ── Farmer's Deed (b136 — Batch C) ────────────────────────────
     Drops from Tier-2+ kills (0.1%) and bounty completions (0.5%).
     Spent at House → Plot tab to upgrade Farm Plot tier and unlock crops.
     Explicitly NOT bind-on-pickup — tradable on the player market.
     Drop hooks live in src/features/farm-progression.js. Keep this in sync
     with the inline ITEMS const in src/legacy.js. */
  /* b268: Deeds are TRADEABLE (non-BoP) — Tyler's call: dungeon-runners farm
     them and sell to players who'd rather not run dungeons, so deeds become a
     market money source rather than a personal-only currency. Rarish. Faucets:
     dungeons (tier-scaled), the bounty trickle, and (b269) any-activity Scraps. */
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
  cooked_wolf_meat:    {n:'Cooked Wolf Meat',    icon:'🥩', v:12, heals:6,  foodClass:'healing', cookedFrom:'raw_wolf_meat'},
  cooked_panther_meat: {n:'Cooked Panther Meat', icon:'🥩', v:22, heals:9,  foodClass:'healing', cookedFrom:'raw_panther_meat'},
  cooked_bear_meat:    {n:'Cooked Bear Meat',    icon:'🥩', v:42, heals:13, foodClass:'healing', cookedFrom:'raw_bear_meat'},
  // Tier 2 buff foods
  roasted_carrot:  {n:'Roasted Carrot', icon:'🥕', v:12,  heals:5,  foodClass:'buff', buff:{type:'gather_speed', magnitude:1,  durationMs:180000}},
  roasted_pumpkin: {n:'Roasted Pumpkin',icon:'🎃', v:90,  heals:22, foodClass:'buff', buff:{type:'farm_yield',   magnitude:1,  durationMs:600000}},
  vegetable_stew:  {n:'Vegetable Stew', icon:'🍲', v:140, heals:24, foodClass:'buff', buff:{type:'all_xp',       magnitude:2,  durationMs:900000}},
  // Tier 3 buff foods
  bear_claw_pie:  {n:'Bear Claw Pie',  icon:'🥧', v:280, heals:32, foodClass:'buff', buff:{type:'damage',          magnitude:3,  durationMs:600000}},
  hunters_feast:  {n:"Hunter's Feast", icon:'🍱', v:420, heals:35, foodClass:'buff', buff:{type:'drop_rate', magnitude:5, durationMs:900000}}, // b238: was dead monster_respawn — a hunter's feast earns you more loot
  dragon_stew:    {n:'Dragon Stew',    icon:'🍜', v:780, heals:45, foodClass:'buff', buff:{type:'combat_xp',       magnitude:4, durationMs:1200000}},
  lich_soul_soup: {n:'Lich Soul Soup', icon:'🥣', v:1100,heals:50, foodClass:'buff', buff:{type:'gold_find',       magnitude:5, durationMs:300000}},
  void_banquet:   {n:'Void Banquet',   icon:'🎂', v:2400,heals:60, foodClass:'buff', buff:{type:'damage_crit',     magnitude:5,  durationMs:900000}},
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

  /* ── Housing blueprints ─────────────────────────────────────────
     These drop from daily quests / monster drops / dungeons / raids.
     They unlock the corresponding room upgrade tier when consumed.
     b268: now TRADEABLE (non-BoP) — Tyler's call. Dungeon-runners sell
     blueprints on the market to players who'd rather buy their castle
     progression than farm dungeons, making dungeon loot a money source. */
  kitchen_blueprint_t2: {
    n:'Kitchen Blueprint II', icon:'📜', v:500,
    rarity:'rare', tag:'housing', unlocks:'kitchen.2',
  },
  kitchen_blueprint_t3: {
    n:'Kitchen Blueprint III', icon:'📜', v:2000,
    rarity:'epic', tag:'housing', unlocks:'kitchen.3',
  },
  forge_blueprint_t2: {
    n:'Forge Blueprint II', icon:'📜', v:500,
    rarity:'rare', tag:'housing', unlocks:'forge.2',
  },
  forge_blueprint_t3: {
    n:'Forge Blueprint III', icon:'📜', v:2000,
    rarity:'epic', tag:'housing', unlocks:'forge.3',
  },
  library_blueprint_t2: {
    n:'Library Blueprint II', icon:'📜', v:500,
    rarity:'rare', tag:'housing', unlocks:'library.2',
  },
  library_blueprint_t3: {
    n:'Library Blueprint III', icon:'📜', v:2000,
    rarity:'epic', tag:'housing', unlocks:'library.3',
  },
  trophy_blueprint_t2: {
    n:'Trophy Blueprint II', icon:'📜', v:500,
    rarity:'rare', tag:'housing', unlocks:'trophy.2',
  },
  trophy_blueprint_t3: {
    n:'Trophy Blueprint III', icon:'📜', v:2000,
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
  /* b206 (SYS-10): the Hearth Token is the premium BOND — bought with real
     money via platform IAP only (never mintable client-side), TRADABLE on
     the player market for gold (the sanctioned gold↔premium bridge), also
     spendable as dungeon entry currency, or redeemed 1 → 150 gems. It was
     bop:true (untradeable) — that blocked the entire bond economy. */
  hearth_token: {
    n:'Hearth Token', icon:'🪙', v:25000, premium:true,
    rarity:'currency', tag:'currency',
  },
  /* b220 (#15): the Muster Seal is the world-event currency. It is the
     DELIBERATE opposite of the Hearth Token — earned only by playing, capped
     at one per UTC day by the muster's own join rule, and bind-on-pickup so it
     can never reach the player market and become a second gold bridge. The
     headline value of a world event lives here rather than in gems, so events
     stay desirable without inflating the currency that is also sold for money.
     Its ONLY source is HearthriseMuster's claim path (a guard test asserts no
     drop table, recipe, shop or chest can mint it). Never a Hearth Token. */
  muster_seal: {
    /* `icon` is the LAST-RESORT glyph for the handful of legacy render sites
       that build HTML from `ITEMS[id].icon` instead of `_itemPath` (the item
       detail card, the market row). Every other item answers those with an
       emoji; this one answers with its real art, because nothing in Hearthrise
       renders emoji as art. Same convention `window._itemSVG` already uses. */
    n:'Rally Seal',
    icon:'<img src="assets/icons-bundle/medieval/muster-seal.svg" alt="" draggable="false" style="width:100%;height:100%;max-width:38px;max-height:38px;object-fit:contain;display:inline-block;vertical-align:-.15em" />',
    v:0, bop:true,
    rarity:'currency', tag:'currency', musterOnly:true,
  },

  /* ══════════════════════════════════════════════════════════════════
     b222 — CASTLE STORES (clan-overhaul.md v2 §4.3)

     The four goods the Clan Seat's Storehouse accepts. They exist because of
     the spec's second pillar: **the castle refuses raw gathered materials.**
     Logs, ore, fish and crops are never accepted — they must be refined
     first, which means a gatherer permanently needs a crafter.

     `tag:'castle'` is the ONE field everything derives from:
       • the artisan taxonomy's "Castle Stores" lane (recipes.js
         recipeCategory) — derived, never authored per-recipe,
       • the Storehouse deposit filter (server-side, once the migration runs).

     `tier` is the material tier from gear-tiers.js MATERIAL_TIERS and is read
     by the contribution formula (§3.4: CP = ceil(v/10) × tier_mult × demand).
     It is NOT a gear tier — these carry no `type`, so nothing equips them.

     None of them heal or buff, so foodClassOf() returns null and they can
     never pollute Provisions / Feasts & Draughts or be eaten by auto-eat.

     No `rarity`: every other bulk material in Hearthrise (iron_bar, slime_gel,
     yew_plank) is border-less, and a legendary frame on a stack of 200
     building blocks would read as loot rather than as stores.

     Icons are the last-resort emoji glyph every item carries; the real art is
     an Art/Asset hand-off (assets/icons-bundle/), and until it lands
     itemGlyphKey() answers with a gilt uiChest/uiOre glyph, not the emoji.

     Asset pass (b224): three of the four got a genuinely fitting painted icon
     promoted from _archive/reserve-art (wired in LOCAL_ITEM_ICON, bottom of
     legacy.js) — a squared aged plank for the beam, a baked loaf for the
     ration, a cast-iron cog for the fitting. `keystone` stays on its gilt
     atlas glyph: nothing in reserve-art reads as a carved/cut masonry block
     (only raw ore-pile chunks and polished gems exist there) — a good glyph
     beats a wrong painting. */
  timber_beam:  {n:'Timber Beam',  icon:'🪵', v:300,  tier:2, tag:'castle'},
  iron_fitting: {n:'Iron Fitting', icon:'🔩', v:480,  tier:2, tag:'castle'},
  field_ration: {n:'Field Ration', icon:'🥖', v:90,   tier:1, tag:'castle'},
  keystone:     {n:'Keystone',     icon:'🧱', v:3000, tier:5, tag:'castle'},

  /* ══════════════════════════════════════════════════════════════════
     b223 — THE HUNT: SIGNATURE MATERIALS + THE HUNT-FORGED KIT
     (docs/design/clan-boss-events.md §3.4, §5.4; CONFLICTS 2026-08-08
     "six new boss signature materials need recipes at ship")

     Each of the six tiered Hunt bosses drops ONE signature material. The spec
     is blunt about why they cannot ship alone: "a boss material with no use is
     worse than no drop at all, because it teaches the player that boss loot is
     meaningless." The live orphan set was recounted at 34 in b222 and routed
     into castle demand; adding six unrouted boss drops would reopen, in one
     commit, the exact problem that work closed.

     So all six land WITH a recipe, and the recipes are one coherent thing —
     the HUNT-FORGED kit, six pieces sitting one rung above Dawnsteel (the top
     of gear-tiers.js). It is the only gear in Hearthrise that solo play cannot
     EARN at any level — the clan's combat pillar is the only road to making
     one. (Designer ruling, clan-boss-events.md §3.4a: the pieces are NOT
     bind-on-pickup, so a soloist may still buy one on the market at a price a
     clan sets. That is a deliberate gold sink and a reason for clans to hunt;
     the positioning is "cannot earn", never "cannot obtain".)

     Note the deliberate hole: there is no Hunt-forged BOOTS. Six signature
     materials buy six pieces and the sixth went to the cape, which had two
     entries in the whole game (defB 1 and 5). Dawnsteel Boots are therefore
     best-in-slot forever — the Hunt crowns your smithing, it does not replace
     it. Do not "complete the set" without re-reading §3.4a.

     `hollow_sigil` is the sixth signature material and already exists (it is
     also a castle tier-bundle spoil, clan-seat.js SPOILS_ROUTES) — two sinks
     for one drop is health, not conflict, so it is left at its historical value
     and simply gains a recipe below.

     Material tiers 6-7 feed the castle contribution curve if the Designer ever
     catalogues them; they carry no `type`, so nothing equips them and nothing
     eats them (foodClassOf → null).                                       */
  slagheart_core: {n:'Slagheart Core',  icon:'🔥', v:3200, tier:6},
  abyssal_pearl:  {n:'Abyssal Pearl',   icon:'🫧', v:3400, tier:6},
  choirbone:      {n:'Choirbone',       icon:'🦴', v:3800, tier:6},
  warden_seal:    {n:"Warden's Seal",   icon:'🔱', v:4400, tier:7},
  wyrm_gilding:   {n:'Wyrm Gilding',    icon:'✨', v:5200, tier:7},

  /* The Hunt-forged kit. Stats continue the ARMOUR_SLOTS curves in
     gear-tiers.js at the same ~1.33× step Dawnsteel takes over Emberforged, so
     the ladder stays one line rather than a bespoke spike. `rarity:'unique'` is
     the top band in rarity.js and is explicit, so it wins over value-derived
     mythic — these are the rarest objects in the game and should read that way.
     `tier: 8` is one above the seven-rung material ladder; nothing indexes gear
     tier as an array, and clan-seat's TIER_MULT clamps, so it is safe. */
  regent_helm:           {n:'Hollow Regent Helm',  icon:'⛑️', v:108000, type:'armor', slot:'helmet', defB:59, rarity:'unique', tier:8},
  slagheart_platebody:   {n:'Slagheart Platebody', icon:'🦺', v:270000, type:'armor', slot:'body',   defB:120,rarity:'unique', tier:8},
  abyssal_greaves:       {n:'Abyssal Greaves',     icon:'🦿', v:198000, type:'armor', slot:'pants',  defB:85, rarity:'unique', tier:8},
  choirbone_gauntlets:   {n:'Choirbone Gauntlets', icon:'🧤', v:63000,  type:'armor', slot:'gloves', defB:31, rarity:'unique', tier:8},
  warden_girdle:         {n:"Warden's Girdle",     icon:'🟫', v:72000,  type:'armor', slot:'belt',   defB:40, rarity:'unique', tier:8},
  wyrmgilt_mantle:       {n:'Wyrmgilt Mantle',     icon:'🦸', v:90000,  type:'armor', slot:'cape',   defB:14, atkB:6, rarity:'unique', tier:8},

  /* ── DUNGEON SIGNATURE LOOT (b268 — the boss ecosystem, increment 1) ──────
     Every solo dungeon has a named end-boss (see src/dungeons.js DUNGEONS[id].boss)
     and 1-2 original signature drops that only fall from that boss.

     Tyler's rule (2026-08-09): signature GEAR (weapons/armour) is BIND-ON-PICKUP
     — it is the prestige reward for clearing the fight yourself, not a market
     flip. Signature COSMETICS / trophies / materials stay TRADEABLE so the boss
     feeds the player economy without letting the best gear be bought. No
     signature item ever touches hearth_token / muster_seal (mint-leak guards).

     Weapon reqLv is set explicitly to the dungeon's combat-level gate (no `tier`,
     so gearWieldReq reads reqLv directly). Stats slot each weapon between the
     same-tier craftables and the next rung, with a distinct identity (Wartusk =
     strength, Codex = magic+crit, etc.) so they read as a reward, not a reskin. */

  // goblin_warcamp — Grimtusk, the Broken-Tusk Warlord (Lv 35)
  wartusk_cleaver:  {n:'Wartusk Cleaver',  icon:'🪓', v:4500,  bop:true, type:'weapon', slot:'weapon', weaponType:'sword', atkB:20, strB:24, critB:.02, reqSkill:'attack', reqLv:35, rarity:'unique'},
  warboss_standard: {n:'Warboss Standard', icon:'🚩', v:1200,  type:'trophy', tag:'cosmetic', rarity:'epic'},

  // haunted_archive — The Pale Archivist (Lv 45)
  whispering_codex: {n:'Whispering Codex', icon:'📖', v:6500,  bop:true, type:'weapon', slot:'weapon', weaponType:'magic', atkB:15, strB:14, magicAtkB:18, magicStrB:20, critB:.04, reqSkill:'magic', reqLv:45, rarity:'unique'},
  lexarch_seal:     {n:'Archivist Seal',   icon:'🔖', v:2200,  type:'trophy', tag:'cosmetic', rarity:'epic'},

  // obsidian_keep — The Ashen King (Lv 65)
  ashcrown_greatsword: {n:'Ashcrown Greatsword', icon:'🗡️', v:40000, bop:true, type:'weapon', slot:'weapon', weaponType:'sword', atkB:34, strB:40, critB:.03, reqSkill:'attack', reqLv:65, rarity:'unique'},

  // voidbringer — The Riftmaw (Lv 80)
  voidmaw_scepter:  {n:'Voidmaw Scepter',  icon:'🔱', v:65000, bop:true, type:'weapon', slot:'weapon', weaponType:'magic', atkB:32, strB:30, magicAtkB:40, magicStrB:46, critB:.06, reqSkill:'magic', reqLv:80, rarity:'unique'},
  voidwoven_sigil:  {n:'Voidwoven Sigil',  icon:'🕸️', v:5000,  type:'trophy', tag:'cosmetic', rarity:'legendary'},
  riftmaw_husk:     {n:'Riftmaw Husk',     icon:'🐚', v:4200,  tag:'crafting-mat', rarity:'epic'},

  /* b281 — DUNGEON SCRIP: the dungeon economy currency. Earned on every dungeon
     clear (scaled by the dungeon's level), spent at the Quartermaster for keys,
     blueprints and — the point — a DETERMINISTIC path to the signature boss
     weapons, so chasing a 3% drop isn't the only way. Bind-on-pickup (earned, not
     traded) and never touches hearth_token/muster_seal (mint-leak guards). */
  dungeon_scrip: {n:'Dungeon Scrip', icon:'🎟️', v:0, bop:true, tag:'currency', rarity:'uncommon', musterOnly:false},

  // ancient_wyrm — Elderscale, the Great Wyrm (Lv 95 capstone)
  dragonfang_pike:  {n:'Dragonfang Pike',  icon:'🐉', v:130000, bop:true, type:'weapon', slot:'weapon', weaponType:'sword', atkB:48, strB:46, critB:.06, spdB:.03, reqSkill:'attack', reqLv:95, rarity:'legendary'},
  elderscale_heart: {n:'Elderscale Heart', icon:'💠', v:9000,  tag:'crafting-mat', rarity:'legendary'},

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

/* b215: backfill tier + rarity onto the hand-authored pieces that sit on the
   generated ladder (bronze_sword, iron_warhammer, shortbow, oak_staff …).
   Those entries predate the tier system and override their generated twin
   wholesale, so without this they'd be the only rungs with no rarity border —
   a visibly inconsistent ladder. Their stats and values are left untouched. */
Object.keys(GEAR_ITEMS).forEach((id) => {
  const generated = GEAR_ITEMS[id];
  const live = ITEMS[id];
  if (!live || live === generated) return;
  if (live.tier == null) live.tier = generated.tier;
  if (live.rarity == null) live.rarity = generated.rarity;
});

/* ══════════════════════════════════════════════════════════════════════
   b220 — foodClassOf(item): the single answer to "what is this food FOR?"

   Pure, DOM-free, no globals. Two consumers depend on it:
     • the Cooking screen's Provisions / Feasts & Draughts sub-tabs,
     • auto-eat, which may consume ONLY 'healing' (design law: auto-eat
       heals, it never spends a timed buff).

   Derivation, in order:
     1. an explicit `foodClass` on the item wins (all 27 cooked foods carry
        one — see the cooking block above),
     2. anything else that heals is implicitly 'healing'. That covers the raw
        ingredients a player eats straight out of the bag (Raw Shrimp, Potato,
        Goldenroot…). They never appear on the cooking screen, so hand-tagging
        them would be authoring with no reader — but auto-eat must still be
        allowed to eat them, and an early player often has nothing else.
     3. everything else is not food at all → null.

   The rule that matters is therefore "auto-eat never touches a 'buff' item",
   expressed positively so a new buff food is safe the moment it is authored.
   ══════════════════════════════════════════════════════════════════════ */
export function foodClassOf(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.foodClass === 'healing' || item.foodClass === 'buff') return item.foodClass;
  return item.heals ? 'healing' : null;
}

/* Convenience for the engine: is this item legal for auto-eat? */
export function isAutoEatable(item) {
  return foodClassOf(item) === 'healing';
}

/* ══════════════════════════════════════════════════════════════════════
   b226 — `raw: true`: which items are UNPROCESSED MATERIAL.
   (docs/design/pacing-overhaul.md §6.1.)

   The NPC vendor pays VENDOR_RAW_RATE (0.20) × v for these and full v for
   everything else. `v` itself is untouched — it stays the book value that
   market listings, recipe costing, chest payouts and the collection log all
   read. Only what the vendor BIDS changes, and only for raws.

   Why it matters: gathering throughput is roughly flat (~300 items/h at
   every tier) while `v` climbs 2.77× per material tier, so a maxed miner
   selling Dawnstone out-earned the King renown reward — 300,000 gold, the
   eleventh of twelve ranks — every 32 minutes, while asleep. This puts the
   three systems back in their correct economic roles: gathering is the
   MATERIAL faucet, the artisan skills are the GOLD path, and the player
   market becomes the best price for raws, because another player will pay
   more than 20% for something they actually need.

   DERIVED, NOT HAND-TAGGED, for everything a gathering rung produces: the
   `prod` field of every tree/rock/fishing-spot and the `prod` of every crop
   IS the definition of "unprocessed". A future rung cannot be added without
   its output being raw, which is exactly the class of omission that makes an
   economy fix rot. Monster/boss materials are listed explicitly below
   because nothing structural marks them.
   ══════════════════════════════════════════════════════════════════════ */
const RAW_GATHERED = [
  ...TREES.map((t) => t.prod),
  ...ROCKS.map((r) => r.prod),
  ...FISH_SPOTS.map((f) => f.prod),
  ...Object.values(CROPS).map((c) => c.prod),
];

/* Unprocessed monster/boss drops — hide, bone, ore-in-the-rough, essence.
   NOT listed (and so NOT raw): anything a player crafted, cooked or smithed,
   every gear piece, seeds (a bought input, not a gathered output), gems and
   trophy curios that are authored payouts rather than throughput. */
const RAW_DROPS = [
  'bones', 'big_bones', 'dragon_bones', 'slime_gel', 'goblin_ear', 'bat_wing',
  'wolf_pelt', 'troll_hide', 'vamp_dust', 'demon_shard', 'dragon_scale',
  'lich_soul', 'magic_essence', 'rune_frag', 'rat_tail', 'small_fang',
  'bone_chips', 'venom_sac', 'silk_thread', 'grave_dust', 'plague_ichor',
  'bear_pelt', 'bear_claw', 'dire_fang', 'shadow_pelt', 'razor_claw',
  'shadow_thread', 'void_chitin', 'death_steel', 'brute_plate',
  'raw_wolf_meat', 'raw_panther_meat', 'raw_bear_meat',
];

export const RAW_MATERIAL_IDS = [...new Set([...RAW_GATHERED, ...RAW_DROPS])];
for (const id of RAW_MATERIAL_IDS) { if (ITEMS[id]) ITEMS[id].raw = true; }

/* ══════════════════════════════════════════════════════════════════════
   b224 — foodKindOf(item): how a food PRESENTS at the point of use.

   foodClassOf() answers the engine's question ("may auto-eat spend this?").
   It does not answer the player's question, which is "what is this and what
   verb do I press?" — and beta testers reported exactly that gap: a Void
   Banquet and a Cooked Shrimp were both an item called "food" with a heal
   number and an identical button.

   So this is the presentation twin of foodClassOf, derived from it plus the
   item's own name. Three kinds, three verbs:

     provision → "Eat"    healing staple; auto-eat draws from this pool
     feast     → "Use"    prepared dish eaten for a timed buff
     draught   → "Drink"  the same, but liquid — the drinks category the
                          standing design note asked for

   Provision/buff comes from foodClassOf so the split can never drift from
   the auto-eat rule. Draught-vs-feast is a naming read, because "is it a
   drink" is a fact about the noun and hand-tagging 27 items with a field
   that only picks a verb would be authoring with no reader (same argument
   §2 of the taxonomy makes for categories generally).
   ══════════════════════════════════════════════════════════════════════ */
const DRAUGHT_NAME_RE = /\b(elixir|draught|draft|potion|brew|tonic|cordial|tea)\b/i;

export function foodKindOf(item) {
  const cls = foodClassOf(item);
  if (!cls) return null;
  if (cls === 'healing') return 'provision';
  return DRAUGHT_NAME_RE.test(item.n || '') ? 'draught' : 'feast';
}

/* Plain-words presentation for each kind. The UI reads verb/label/blurb from
   here so the item modal, the combat picker and the hover tooltip cannot
   describe the same item three different ways. No emoji — these are labels,
   not art. */
export const FOOD_KIND_META = {
  provision: {
    label: 'Provision',
    verb: 'Eat',
    blurb: 'Healing food. Auto-eat can use this.',
  },
  feast: {
    label: 'Feast',
    verb: 'Use',
    blurb: 'Eaten for a timed buff. Auto-eat never spends it.',
  },
  draught: {
    label: 'Draught',
    verb: 'Drink',
    blurb: 'Drunk for a timed buff. Auto-eat never spends it.',
  },
};
