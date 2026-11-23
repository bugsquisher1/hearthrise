// Wave 3 uniques (b247) — the ~30 orphan boss/mid drops routed into a curated set
// of 14 named unique items (design team + curation pass). Boss loot with identity:
// crit/speed hooks, gated by source-monster tier, original IP. Merged into ITEMS
// and ITEM_DESC; the recipes were deleted with crafted gear (demolition, 2026-10-14). The Warband Bulwark left for the crafted cloak
// ladder (src/data/slot-ladders.js, lane/d-jewelry-sample 2026-11-18).

import { withGearStats } from './gear-profiles.js';

export const WAVE3_ITEMS = withGearStats({
  dragonrend_greatblade: {n:'Dragonrend',icon:'🗡️',v:17600,type:'weapon',slot:'weapon',weaponType:'sword',statPlus: { strB: 7, critB: 0.02 }, rarity:'unique',tier:8,reqSkill:'level',reqLv:88},
  crown_of_the_fallen_king: {n:'Crown of the Fallen King',icon:'🛡️',v:17000,type:'armor',slot:'helmet',armourClass:'plate',statPlus: { defB: -5, strB: 6, rangeAtkB: 10, magicAtkB: 21 }, rarity:'unique',tier:7,reqSkill:'level',reqLv:85},
  emberfang_blade: {n:'Emberfang',icon:'🗡️',v:14400,type:'weapon',slot:'weapon',weaponType:'sword',statPlus: { atkB: -9, strB: -13, critB: 0.06 }, rarity:'epic',tier:6,reqSkill:'level',reqLv:72},
  demoncaller_staff: {n:'Demoncaller',icon:'🪄',v:13600,type:'weapon',slot:'weapon',weaponType:'magic',discipline:'restoration',twoHanded:true,statPlus: { magicAtkB: -2, magicStrB: -5, critB: 0.05 }, rarity:'epic',tier:6,reqSkill:'level',reqLv:68},
  panthers_eye_pendant: {n:'Panther\'s Eye Pendant',icon:'📿',v:13600,type:'jewelry',slot:'necklace',statPlus: { strB: -2, rangeAtkB: -2, rangeStrB: -2, magicAtkB: -2, magicStrB: -2, critB: 0.05 }, rarity:'rare',tier:5,reqSkill:'level',reqLv:68},
  wraithsilk_shroud: {n:'Wraithsilk Shroud',icon:'🛡️',v:10400,type:'armor',slot:'body',armourClass:'cloth',statPlus: { defB: 7, atkB: 10, rangeAtkB: 8, magicAtkB: -17, magicStrB: -5 }, rarity:'epic',tier:5,reqSkill:'level',reqLv:52},
  widows_fang: {n:'Widow\'s Fang',icon:'🗡️',v:7600,type:'weapon',slot:'weapon',weaponType:'sword',statPlus: { atkB: -1, strB: -2, critB: 0.06 }, rarity:'rare',tier:3,reqSkill:'level',reqLv:38},
  plaguewarden_greaves: {n:'Plaguewarden Leg Plates',icon:'🛡️',v:10800,type:'armor',slot:'pants',armourClass:'plate',statPlus: { defB: -5, strB: 4, rangeAtkB: 8, magicAtkB: 15 }, rarity:'rare',tier:5,reqSkill:'level',reqLv:54},
  hollow_sigil_ring: {n:'Hollow Sigil Ring',icon:'💍',v:7000,type:'jewelry',slot:'ring',statPlus: { atkB: -1, strB: -1, rangeAtkB: -1, rangeStrB: -1, magicAtkB: 4, magicStrB: 2 }, rarity:'rare',tier:3,reqSkill:'level',reqLv:35},
  fangdart_recurve: {n:'Fangdart Recurve',icon:'🏹',v:7200,type:'weapon',slot:'weapon',weaponType:'ranged',twoHanded:true,statPlus: { rangeAtkB: -2, rangeStrB: -4, critB: 0.04 }, rarity:'rare',tier:3,reqSkill:'level',reqLv:36},
  alphaheart_longbow: {n:'Alphaheart Longbow',icon:'🏹',v:10000,type:'weapon',slot:'weapon',weaponType:'ranged',twoHanded:true,statPlus: { rangeStrB: -1, critB: 0.05 }, rarity:'epic',tier:4,reqSkill:'level',reqLv:50},
  nightstalker_pelt: {n:'Nightstalker\'s Pelt',icon:'🛡️',v:12400,type:'armor',slot:'body',armourClass:'leather',statPlus: { defB: -11, rangeAtkB: -18, rangeStrB: 6, magicAtkB: 8, critB: 0.004 }, rarity:'unique',tier:5,reqSkill:'level',reqLv:62},
  chitinweave_cloak: {n:'Chitinweave Cloak',icon:'🧥',v:15200,type:'armor',slot:'cape',steadyPm: 220,statPlus: { strB: -1, rangeStrB: -1, magicStrB: -1, critB: 0.02 }, rarity:'epic',tier:6,reqSkill:'level',reqLv:76},
});

export const WAVE3_DESC = {
  'dragonrend_greatblade': 'A huge death-steel sword with a bear\'s claw and a dragon\'s heart-gem worked into it. It cuts right through dragon scale.',
  'crown_of_the_fallen_king': 'The War King\'s crown, remade in dawnsteel. It\'s heavy to wear, but it\'s worth it.',
  'emberfang_blade': 'A blade made from a demon\'s ember, cooled in a plague swarm\'s heart. It runs hot and swings faster than plain steel.',
  'demoncaller_staff': 'A runewood staff with an underworld coal on top that never goes out. Every spell you cast throws demon fire.',
  'panthers_eye_pendant': 'A night panther\'s ruby eye on a cord of shadow silk. It makes your hits crit more often.',
  'wraithsilk_shroud': 'A hooded robe woven from a wraith\'s fading edges. It soaks up the light around you and helps your spells land.',
  'widows_fang': 'A thin poisoned blade with a spider\'s eye set in the hilt. It\'s quick, and it crits a lot.',
  'plaguewarden_greaves': 'Mithril leg plates soaked in swarm ichor. The rot made them tougher instead of eating through them.',
  'hollow_sigil_ring': 'A ring of used-up runes wrapped around a dark wizard\'s sigil. Mages wear it for stronger spells.',
  'fangdart_recurve': 'A light bow strung with dire wolf sinew and hung with fangs. It\'s quick to shoot, and it crits more than most.',
  'alphaheart_longbow': 'A longbow built around one big fang from a wolf pack\'s leader. It hits hard and crits often.',
  'nightstalker_pelt': 'Panther hide stitched with shadow silk, with claws for clasps. It\'s made for archers who\'d rather not be seen.',
  'chitinweave_cloak': 'Plates of void shell sewn onto shadow cloth. It weighs almost nothing and softens every hit you take.',
};
