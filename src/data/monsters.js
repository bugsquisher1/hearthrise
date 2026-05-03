// MONSTERS — extracted from hearthrise-phaseA.html

export const MONSTERS={
  /* Tier 1 — local threats */
  slime:{name:'Slime',icon:'🟢',tier:1,family:'Vermin',weaponWeak:'sword',hp:8,atk:2,def:0,xp:5,gp:[1,3],drops:[{id:'slime_gel',ch:.8},{id:'bones',ch:.25},{id:'sticky_core',ch:.02}]},
  rat:{name:'Field Rat',icon:'🐀',tier:1,family:'Vermin',weaponWeak:'hammer',hp:9,atk:2,def:0,xp:6,gp:[1,4],drops:[{id:'rat_tail',ch:.65},{id:'small_fang',ch:.12},{id:'bones',ch:.35}]},
  goblin:{name:'Goblin',icon:'👺',tier:1,family:'Goblinoid',weaponWeak:'ranged',hp:15,atk:4,def:1,xp:13,gp:[2,8],drops:[{id:'goblin_ear',ch:.5},{id:'bones',ch:1},{id:'bronze_sword',ch:.03},{id:'goblin_totem',ch:.01}]},
  weak_skeleton:{name:'Weak Skeleton',icon:'💀',tier:1,family:'Undead',weaponWeak:'magic',hp:14,atk:3,def:2,xp:12,gp:[2,7],drops:[{id:'bones',ch:1},{id:'bone_chips',ch:.45},{id:'ancient_fragment',ch:.015}]},
  small_wolf:{name:'Small Wolf',icon:'🐺',tier:1,family:'Beast',weaponWeak:'neutral',hp:16,atk:5,def:1,xp:14,gp:[3,9],drops:[{id:'wolf_pelt',ch:.32},{id:'small_fang',ch:.18},{id:'bones',ch:1}]},

  /* Tier 2 — wilderness threats */
  giant_bat:{name:'Giant Bat',icon:'🦇',tier:2,family:'Vermin',weaponWeak:'ranged',hp:24,atk:7,def:1,xp:24,gp:[4,12],drops:[{id:'bat_wing',ch:.7},{id:'night_fang',ch:.025},{id:'bones',ch:.5}]},
  hobgoblin:{name:'Hobgoblin',icon:'👹',tier:2,family:'Goblinoid',weaponWeak:'sword',hp:34,atk:9,def:4,xp:38,gp:[8,22],drops:[{id:'goblin_ear',ch:.65},{id:'iron_ore',ch:.12},{id:'iron_sword',ch:.012},{id:'goblin_totem',ch:.02}]},
  wolf:{name:'Wolf',icon:'🐺',tier:2,family:'Beast',weaponWeak:'hammer',hp:30,atk:8,def:3,xp:30,gp:[5,15],drops:[{id:'wolf_pelt',ch:.7},{id:'small_fang',ch:.35},{id:'bones',ch:1}]},
  skeleton:{name:'Skeleton',icon:'💀',tier:2,family:'Undead',weaponWeak:'magic',hp:35,atk:10,def:2,xp:45,gp:[8,20],drops:[{id:'bones',ch:1},{id:'bone_chips',ch:.6},{id:'iron_ore',ch:.15},{id:'ancient_fragment',ch:.025}]},
  dark_wizard:{name:'Dark Wizard',icon:'🧙',tier:2,family:'Arcane',weaponWeak:'neutral',hp:28,atk:12,def:1,xp:55,gp:[10,25],drops:[{id:'magic_essence',ch:.4},{id:'rune_frag',ch:.2},{id:'dark_sigil',ch:.015}]},

  /* Tier 3 — dangerous creatures */
  venom_spider:{name:'Venom Spider',icon:'🕷️',tier:3,family:'Vermin',weaponWeak:'hammer',hp:52,atk:15,def:6,xp:82,gp:[14,34],drops:[{id:'venom_sac',ch:.55},{id:'silk_thread',ch:.3},{id:'spider_eye',ch:.035}]},
  goblin_brute:{name:'Goblin Brute',icon:'👺',tier:3,family:'Goblinoid',weaponWeak:'sword',hp:68,atk:17,def:9,xp:105,gp:[18,42],drops:[{id:'goblin_ear',ch:.8},{id:'brute_plate',ch:.22},{id:'steel_sword',ch:.01},{id:'goblin_totem',ch:.04}]},
  dire_wolf:{name:'Dire Wolf',icon:'🐺',tier:3,family:'Beast',weaponWeak:'ranged',hp:62,atk:19,def:7,xp:100,gp:[16,40],drops:[{id:'wolf_pelt',ch:.9},{id:'dire_fang',ch:.35},{id:'alpha_fang',ch:.015}]},
  zombie:{name:'Zombie',icon:'🧟',tier:3,family:'Undead',weaponWeak:'magic',hp:78,atk:14,def:12,xp:115,gp:[18,45],drops:[{id:'grave_dust',ch:.65},{id:'big_bones',ch:.5},{id:'ancient_fragment',ch:.04}]},
  warlock:{name:'Warlock',icon:'🧙',tier:3,family:'Arcane',weaponWeak:'neutral',hp:58,atk:24,def:5,xp:135,gp:[24,60],drops:[{id:'magic_essence',ch:.55},{id:'rune_frag',ch:.35},{id:'cracked_spellstone',ch:.025}]},

  /* Tier 4 — elite monsters */
  plague_swarm:{name:'Plague Swarm',icon:'🪰',tier:4,family:'Vermin',weaponWeak:'hammer',hp:100,atk:26,def:13,xp:210,gp:[38,82],drops:[{id:'plague_ichor',ch:.6},{id:'venom_sac',ch:.25},{id:'swarm_heart',ch:.018}]},
  goblin_warlord:{name:'Goblin Warlord',icon:'👺',tier:4,family:'Goblinoid',weaponWeak:'sword',hp:125,atk:30,def:18,xp:250,gp:[45,100],drops:[{id:'brute_plate',ch:.5},{id:'warlord_badge',ch:.16},{id:'steel_helm',ch:.015}]},
  bear:{name:'Bear',icon:'🐻',tier:4,family:'Beast',weaponWeak:'ranged',hp:140,atk:34,def:16,xp:275,gp:[42,95],drops:[{id:'bear_pelt',ch:.75},{id:'bear_claw',ch:.35},{id:'big_bones',ch:1}]},
  wraith:{name:'Wraith',icon:'👻',tier:4,family:'Undead',weaponWeak:'magic',hp:112,atk:38,def:20,xp:310,gp:[55,115],drops:[{id:'grave_dust',ch:.7},{id:'wraith_veil',ch:.2},{id:'ancient_rune',ch:.04}]},
  lesser_demon:{name:'Lesser Demon',icon:'😈',tier:4,family:'Mythic',weaponWeak:'neutral',hp:150,atk:40,def:18,xp:340,gp:[60,140],drops:[{id:'demon_shard',ch:.4},{id:'rune_frag',ch:.3},{id:'hell_ember',ch:.025}]},

  /* Tier 5 — mythic threats */
  shadow_creeper:{name:'Shadow Creeper',icon:'🕸️',tier:5,family:'Vermin',weaponWeak:'magic',hp:190,atk:48,def:26,xp:475,gp:[90,190],drops:[{id:'shadow_thread',ch:.45},{id:'silk_thread',ch:.6},{id:'void_chitin',ch:.018}]},
  warband_captain:{name:'Warband Captain',icon:'🛡️',tier:5,family:'Goblinoid',weaponWeak:'sword',hp:230,atk:54,def:34,xp:540,gp:[110,225],drops:[{id:'warlord_badge',ch:.4},{id:'captain_medal',ch:.12},{id:'rune_sword',ch:.006}]},
  panther:{name:'Night Panther',icon:'🐈‍⬛',tier:5,family:'Beast',weaponWeak:'ranged',hp:205,atk:60,def:25,xp:520,gp:[100,210],drops:[{id:'shadow_pelt',ch:.65},{id:'razor_claw',ch:.3},{id:'ruby',ch:.03}]},
  death_knight:{name:'Death Knight',icon:'☠️',tier:5,family:'Undead',weaponWeak:'hammer',hp:260,atk:58,def:40,xp:620,gp:[125,260],drops:[{id:'big_bones',ch:1},{id:'death_steel',ch:.25},{id:'captains_ribblade',ch:.012}]},
  archmage:{name:'Archmage',icon:'🧙‍♂️',tier:5,family:'Arcane',weaponWeak:'neutral',hp:215,atk:72,def:22,xp:680,gp:[145,310],drops:[{id:'magic_essence',ch:.8},{id:'ancient_rune',ch:.22},{id:'hollow_sigil',ch:.018}]},

  /* Tier 6 — legendary enemies */
  void_parasite:{name:'Void Parasite',icon:'🪱',tier:6,family:'Vermin',weaponWeak:'hammer',hp:340,atk:82,def:42,xp:900,gp:[210,420],drops:[{id:'void_chitin',ch:.55},{id:'plague_ichor',ch:.35},{id:'void_core',ch:.015}]},
  war_king:{name:'War King',icon:'👑',tier:6,family:'Goblinoid',weaponWeak:'sword',hp:420,atk:88,def:58,xp:1050,gp:[260,520],drops:[{id:'captain_medal',ch:.35},{id:'war_crown',ch:.08},{id:'chief_blade',ch:.012}]},
  ancient_bear:{name:'Ancient Bear',icon:'🐻',tier:6,family:'Beast',weaponWeak:'ranged',hp:460,atk:94,def:54,xp:1100,gp:[250,500],drops:[{id:'bear_pelt',ch:1},{id:'ancient_claw',ch:.25},{id:'alpha_cloak',ch:.01}]},
  lich:{name:'Ancient Lich',icon:'☠️',tier:6,family:'Undead',weaponWeak:'magic',hp:350,atk:55,def:30,xp:800,gp:[200,500],drops:[{id:'lich_soul',ch:.8},{id:'ancient_rune',ch:.3},{id:'hollow_sigil',ch:.025}],boss:true},
  dragon:{name:'Green Dragon',icon:'🐲',tier:6,family:'Mythic',weaponWeak:'neutral',hp:520,atk:105,def:62,xp:1250,gp:[320,700],drops:[{id:'dragon_bones',ch:1},{id:'dragon_scale',ch:.5},{id:'dragon_gem',ch:.02},{id:'ancient_claw',ch:.08}],boss:true},
};
