// Wave 3 uniques (b247) — the ~30 orphan boss/mid drops routed into a curated set
// of 14 named unique items (design team + curation pass). Boss loot with identity:
// crit/speed hooks, gated by source-monster tier, original IP. Merged into ITEMS
// and ITEM_DESC; the recipes were deleted with crafted gear (demolition, 2026-10-14).

export const WAVE3_ITEMS = {
  dragonrend_greatblade: {n:'Dragonrend',icon:'🗡️',v:17600,type:'weapon',slot:'weapon',weaponType:'sword',atkB:42,strB:42,critB:0.02,rarity:'unique',tier:8,reqSkill:'melee',reqLv:88},
  crown_of_the_fallen_king: {n:'Crown of the Fallen King',icon:'🛡️',v:17000,type:'armor',slot:'helmet',armourClass:'plate',defB:36,strB:6,rarity:'unique',tier:7,reqSkill:'defense',reqLv:85},
  emberfang_blade: {n:'Emberfang',icon:'🗡️',v:14400,type:'weapon',slot:'weapon',weaponType:'sword',atkB:24,strB:15,critB:0.06,rarity:'epic',tier:6,reqSkill:'melee',reqLv:72},
  demoncaller_staff: {n:'Demoncaller',icon:'🪄',v:13600,type:'weapon',slot:'weapon',weaponType:'magic',discipline:'restoration',twoHanded:true,magicAtkB:24,magicStrB:31,atkB:24,strB:31,critB:0.05,rarity:'epic',tier:6,reqSkill:'magic',reqLv:68},
  panthers_eye_pendant: {n:'Panther\'s Eye Pendant',icon:'📿',v:13600,type:'jewelry',slot:'necklace',critB:0.05,atkB:2,rarity:'rare',tier:5,reqSkill:'melee',reqLv:68},
  wraithsilk_shroud: {n:'Wraithsilk Shroud',icon:'🛡️',v:10400,type:'armor',slot:'body',armourClass:'cloth',defB:20,magicAtkB:8,rarity:'epic',tier:5,reqSkill:'defense',reqLv:52},
  widows_fang: {n:'Widow\'s Fang',icon:'🗡️',v:7600,type:'weapon',slot:'weapon',weaponType:'sword',atkB:16,strB:12,critB:0.06,rarity:'rare',tier:3,reqSkill:'melee',reqLv:38},
  plaguewarden_greaves: {n:'Plaguewarden Greaves',icon:'🛡️',v:10800,type:'armor',slot:'pants',armourClass:'plate',defB:26,strB:4,rarity:'rare',tier:5,reqSkill:'defense',reqLv:54},
  hollow_sigil_ring: {n:'Hollow Sigil Ring',icon:'💍',v:7000,type:'jewelry',slot:'ring',magicAtkB:5,magicStrB:3,rarity:'rare',tier:3,reqSkill:'magic',reqLv:35},
  fangdart_recurve: {n:'Fangdart Recurve',icon:'🏹',v:7200,type:'weapon',slot:'weapon',weaponType:'ranged',rangeAtkB:15,rangeStrB:10,critB:0.04,rarity:'rare',tier:3,reqSkill:'ranged',reqLv:36},
  alphaheart_longbow: {n:'Alphaheart Longbow',icon:'🏹',v:10000,type:'weapon',slot:'weapon',weaponType:'ranged',rangeAtkB:24,rangeStrB:18,critB:0.05,rarity:'epic',tier:4,reqSkill:'ranged',reqLv:50},
  nightstalker_pelt: {n:'Nightstalker\'s Pelt',icon:'🛡️',v:12400,type:'armor',slot:'body',armourClass:'leather',defB:18,rangeAtkB:8,rangeStrB:6,critB:0.02,rarity:'unique',tier:5,reqSkill:'defense',reqLv:62},
  warband_bulwark: {n:'Warband Bulwark',icon:'🛡️',v:7000,type:'armor',slot:'cape',defB:14,strB:3,rarity:'rare',tier:3,reqSkill:'defense',reqLv:35},
  chitinweave_cloak: {n:'Chitinweave Cloak',icon:'🧥',v:15200,type:'armor',slot:'cape',defB:8,critB:0.02,rarity:'epic',tier:6,reqSkill:'defense',reqLv:76},
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
