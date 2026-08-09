// Wave 3 uniques (b247) — the ~30 orphan boss/mid drops routed into a curated set
// of 14 named unique items (design team + curation pass). Boss loot with identity:
// crit/speed hooks, gated by source-monster tier, original IP. Merged into ITEMS,
// ARTISAN_RECIPES and ITEM_DESC. SAFE TO EXTEND: pure data, no logic.

export const WAVE3_ITEMS = {
  dragonrend_greatblade: {n:'Dragonrend',icon:'🗡️',v:17600,type:'weapon',slot:'weapon',weaponType:'sword',atkB:42,strB:42,critB:0.02,rarity:'unique',tier:8,reqSkill:'attack',reqLv:88},
  crown_of_the_fallen_king: {n:'Crown of the Fallen King',icon:'🛡️',v:17000,type:'armor',slot:'helmet',defB:36,strB:6,xpB:0.03,rarity:'unique',tier:7,reqSkill:'defense',reqLv:85},
  emberfang_blade: {n:'Emberfang',icon:'🗡️',v:14400,type:'weapon',slot:'weapon',weaponType:'sword',atkB:24,strB:15,critB:0.06,spdB:0.03,rarity:'epic',tier:6,reqSkill:'attack',reqLv:72},
  demoncaller_staff: {n:'Demoncaller',icon:'🪄',v:13600,type:'weapon',slot:'weapon',weaponType:'magic',magicAtkB:24,magicStrB:31,atkB:24,strB:31,critB:0.05,rarity:'epic',tier:6,reqSkill:'magic',reqLv:68},
  panthers_eye_pendant: {n:'Panther\'s Eye Pendant',icon:'📿',v:13600,type:'jewelry',slot:'necklace',critB:0.05,spdB:0.02,atkB:2,rarity:'rare',tier:5,reqSkill:'attack',reqLv:68},
  wraithsilk_shroud: {n:'Wraithsilk Shroud',icon:'🛡️',v:10400,type:'armor',slot:'body',defB:20,magicAtkB:8,spdB:0.03,rarity:'epic',tier:5,reqSkill:'defense',reqLv:52},
  widows_fang: {n:'Widow\'s Fang',icon:'🗡️',v:7600,type:'weapon',slot:'weapon',weaponType:'sword',atkB:16,strB:12,critB:0.06,spdB:0.02,rarity:'rare',tier:3,reqSkill:'attack',reqLv:38},
  plaguewarden_greaves: {n:'Plaguewarden Greaves',icon:'🛡️',v:10800,type:'armor',slot:'pants',defB:26,strB:4,spdB:0.02,rarity:'rare',tier:5,reqSkill:'defense',reqLv:54},
  hollow_sigil_ring: {n:'Hollow Sigil Ring',icon:'💍',v:7000,type:'jewelry',slot:'ring',magicAtkB:5,magicStrB:3,xpB:0.02,rarity:'rare',tier:3,reqSkill:'magic',reqLv:35},
  fangdart_recurve: {n:'Fangdart Recurve',icon:'🏹',v:7200,type:'weapon',slot:'weapon',weaponType:'ranged',rangeAtkB:15,rangeStrB:10,critB:0.04,spdB:0.02,rarity:'rare',tier:3,reqSkill:'ranged',reqLv:36},
  alphaheart_longbow: {n:'Alphaheart Longbow',icon:'🏹',v:10000,type:'weapon',slot:'weapon',weaponType:'ranged',rangeAtkB:24,rangeStrB:18,critB:0.05,rarity:'epic',tier:4,reqSkill:'ranged',reqLv:50},
  nightstalker_pelt: {n:'Nightstalker\'s Pelt',icon:'🛡️',v:12400,type:'armor',slot:'body',defB:18,rangeAtkB:8,rangeStrB:6,spdB:0.04,critB:0.02,rarity:'unique',tier:5,reqSkill:'defense',reqLv:62},
  warband_bulwark: {n:'Warband Bulwark',icon:'🛡️',v:7000,type:'armor',slot:'cape',defB:14,strB:3,rarity:'rare',tier:3,reqSkill:'defense',reqLv:35},
  chitinweave_cloak: {n:'Chitinweave Cloak',icon:'🧥',v:15200,type:'armor',slot:'cape',defB:8,spdB:0.03,critB:0.02,xpB:0.01,rarity:'epic',tier:6,reqSkill:'defense',reqLv:76},
};

export const WAVE3_RECIPES = {
  smithing: [
    {id:'forge_dragonrend_greatblade',name:'Forge Dragonrend',icon:'🗡️',inputs:{ancient_claw:1,death_steel:2,dragon_gem:1,dawn_bar:3},output:'dragonrend_greatblade',xp:3872,req:88,ms:6520},
    {id:'forge_crown_of_the_fallen_king',name:'Forge Crown of the Fallen King',icon:'🛡️',inputs:{war_crown:1,dawn_bar:2},output:'crown_of_the_fallen_king',xp:3613,req:85,ms:6400},
    {id:'forge_emberfang_blade',name:'Forge Emberfang',icon:'🗡️',inputs:{hell_ember:1,swarm_heart:1,rune_bar:3},output:'emberfang_blade',xp:2592,req:72,ms:5880},
    {id:'forge_widows_fang',name:'Forge Widow\'s Fang',icon:'🗡️',inputs:{steel_bar:2,spider_eye:1,venom_sac:4},output:'widows_fang',xp:722,req:38,ms:4520},
    {id:'forge_plaguewarden_greaves',name:'Forge Plaguewarden Greaves',icon:'🛡️',inputs:{mithril_bar:4,plague_ichor:3,venom_sac:3},output:'plaguewarden_greaves',xp:1458,req:54,ms:5160},
    {id:'forge_warband_bulwark',name:'Forge Warband Bulwark',icon:'🛡️',inputs:{brute_plate:2,steel_bar:3},output:'warband_bulwark',xp:613,req:35,ms:4400},
  ],
  crafting: [
    {id:'craft_demoncaller_staff',name:'Craft Demoncaller',icon:'🪄',inputs:{hell_ember:1,demon_shard:3,runewood_plank:2,magic_essence:2},output:'demoncaller_staff',xp:2312,req:68,ms:5720},
    {id:'craft_panthers_eye_pendant',name:'Craft Panther\'s Eye Pendant',icon:'📿',inputs:{ruby:1,shadow_pelt:1,silk_thread:3},output:'panthers_eye_pendant',xp:2312,req:68,ms:5720},
    {id:'craft_wraithsilk_shroud',name:'Craft Wraithsilk Shroud',icon:'🛡️',inputs:{shadow_thread:3,wraith_veil:1,grave_dust:6,vamp_dust:2},output:'wraithsilk_shroud',xp:1352,req:52,ms:5080},
    {id:'craft_hollow_sigil_ring',name:'Craft Hollow Sigil Ring',icon:'💍',inputs:{steel_bar:1,dark_sigil:1,rune_frag:8,magic_essence:2},output:'hollow_sigil_ring',xp:613,req:35,ms:4400},
    {id:'craft_fangdart_recurve',name:'Craft Fangdart Recurve',icon:'🏹',inputs:{small_fang:3,bat_wing:3,dire_fang:2,night_fang:2,willow_plank:2,silk_thread:2},output:'fangdart_recurve',xp:648,req:36,ms:4440},
    {id:'craft_alphaheart_longbow',name:'Craft Alphaheart Longbow',icon:'🏹',inputs:{alpha_fang:1,maple_plank:3,silk_thread:3},output:'alphaheart_longbow',xp:1250,req:50,ms:5000},
    {id:'craft_nightstalker_pelt',name:'Craft Nightstalker\'s Pelt',icon:'🛡️',inputs:{shadow_pelt:2,shadow_thread:2,razor_claw:1,silk_thread:3},output:'nightstalker_pelt',xp:1922,req:62,ms:5480},
    {id:'craft_chitinweave_cloak',name:'Craft Chitinweave Cloak',icon:'🧥',inputs:{void_chitin:2,silk_thread:4,shadow_pelt:1},output:'chitinweave_cloak',xp:2888,req:76,ms:6040},
  ],
};

export const WAVE3_DESC = {
  'dragonrend_greatblade': 'An ancient bear\'s claw and a dragon\'s heart-gem bound in death-steel — a greatblade so heavy it splits scale, plate, and bone alike.',
  'crown_of_the_fallen_king': 'The War King\'s own circlet, reforged onto dawnsteel — it weighs like a burden and rewards like a throne.',
  'emberfang_blade': 'A demon-ember quenched in a plague-swarm\'s heart — a blade that runs hot and hungry, biting faster than steel has any right to.',
  'demoncaller_staff': 'A runewood haft crowned with a coal from the underworld that will not die — every cast spits demonfire.',
  'panthers_eye_pendant': 'A night panther\'s ruby eye strung on shadow-silk — it sharpens every strike to a killing edge.',
  'wraithsilk_shroud': 'A cowl woven from a wraith\'s own fading edge — it drinks the light and hurries the wearer through it.',
  'widows_fang': 'A slim envenomed blade set with a spider\'s unblinking eye — it strikes fast and finds the gap.',
  'plaguewarden_greaves': 'Mithril plate cured in swarm-ichor until the rot works for you, not against you.',
  'hollow_sigil_ring': 'A band of spent runes bound around a dark wizard\'s sigil — it whispers the next spell before you cast it.',
  'fangdart_recurve': 'Strung with dire-wolf sinew and tipped in torn fangs and night-bone shot — light, quick, and it finds the soft place between ribs.',
  'alphaheart_longbow': 'Carved around the single fang of a pack-alpha; the bow remembers what it means to lead the hunt.',
  'nightstalker_pelt': 'Panther-hide stitched with shadow-silk and clawed clasps — armour that would rather you were never seen.',
  'warband_bulwark': 'A brute\'s shed bone-plating hammered over a steel frame — it hits back as hard as it holds.',
  'chitinweave_cloak': 'Overlapping void-carapace plates sewn onto a panther\'s shadow — weightless armour that seems to shrug the world off your shoulders.',
};
