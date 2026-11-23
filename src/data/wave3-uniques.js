// Wave 3 uniques (b247) — the ~30 orphan boss/mid drops routed into a curated set
// of 14 named unique items (design team + curation pass). Boss loot with identity:
// crit/speed hooks, gated by source-monster tier, original IP. Merged into ITEMS
// and ITEM_DESC; the recipes were deleted with crafted gear (demolition, 2026-10-14). The Warband Bulwark left for the crafted cloak
// ladder (src/data/slot-ladders.js, lane/d-jewelry-sample 2026-11-18). Twelve more were CUT (the designer, lane/named-pieces
// 2026-11-23, docs/design/redesign/28-named-pieces.md (d)): each was its tier's piece plus a stat bump, from a creature the plan
// no longer has. Demoncaller stays: its future is its special-attribute twin (src/data/special-attributes.js, the Provost). The Chitinweave
// Cloak stays as the cape ladder's tier-6 rung: a cloak's rule is its Steady armor, which it keeps.

import { withGearStats } from './gear-profiles.js';

export const WAVE3_ITEMS = withGearStats({
  demoncaller_staff: {n:'Demoncaller',icon:'🪄',v:13600,type:'weapon',slot:'weapon',weaponType:'magic',discipline:'restoration',twoHanded:true,rarity:'epic',tier:6,reqSkill:'level',reqLv:68},
  chitinweave_cloak: {n:'Chitinweave Cloak',icon:'🧥',v:15200,type:'armor',slot:'cape',steadyPm: 220,rarity:'epic',tier:6,reqSkill:'level',reqLv:76},
});

export const WAVE3_DESC = {
  'demoncaller_staff': 'A runewood staff with an underworld coal on top that never goes out. Every spell you cast throws demon fire.',
  'chitinweave_cloak': 'Plates of chitin shell sewn onto spider silk. It weighs almost nothing and softens every hit you take',
};
