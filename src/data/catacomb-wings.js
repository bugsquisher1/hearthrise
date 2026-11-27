// ════════════════════════════════════════════════════════════════════════
// src/data/catacomb-wings.js — THE CATACOMBS' TWO WINGS AS HUNTING GROUNDS ON THE DANGER SCALE (lane/r10-more-grounds, 2026-11-22).
//
// docs/design/redesign/12-targets.md section 7 (the designer's ruling on Tyler's "catacombs and tower are super similar"): the Catacombs stop
// being a second Tower and become two hunting grounds deep under Havora, the Bone Wing and the Flooded Wing, hunted like any other ground on
// the Danger scale, and the 24 named helmets and boots (src/data/catacomb-armor.js) become their drop rows. Section 3.3's gear rule holds: the
// ground fixes the base (src/data/danger.js DANGER_GROUNDS gearLevel, every piece's item Level), depth raises only the Rare odds and the
// Trait's rank (the roller's, wave 4).
//
// EACH WING IS HALF OF THE UNMARKED CATACOMBS' OWN MAP AND ROWS (src/data/grounds/unmarked_catacombs: its rooms, monsters and spells, read
// here by pocket index, never copied), so a room re-drawn there moves both:
//   catacomb_bone_wing     in down the Night Carters' tunnel: the Carters' Cut, the Long Gallery, the Bone Room (the walls get up)
//   catacomb_flooded_wing  down the hoist shaft: the Loading Vault, the Keepers' Room (Keeper Dunn), over the plank bridge to the Flooded Vault
//
// ONE BASE A KIND A SLOT, AT THE WING'S TIER (the designer, 12-targets 8.6.1, built by lane/refhero-recut 2026-11-27): a wing drops its
// tier's plain base as every home does (src/data/base-drops.js: Wolfram 160, a piece a slot a weight), so a Rare found there lands on a
// Wolfram piece of the kind its finder wears. The 24 Hearth Chest helmets and boots (src/data/catacomb-armor.js) are no wing drop rows any
// more: each is its key tier's twin (defense 2 to 50 on a Wolfram ground), and the wings' helmets and boots read 15 bases a slot with them.
// Their one door is the Hearth Chest (chests.js), until section 7 retires the descent; what they become then is the designer's.
// THE TRAITS STAY HIDDEN (gear-steps.js): each wing's pool is danger.js DANGER_GROUNDS `traits`, and nothing rolls them until wave 4.
//
// STAGED with the Catacombs (CLAUDE.md section 3.5: half-built features stay hidden): the map is unpainted past its floor (map.js), so no
// list, picker or server catalogue serves either wing until the pack opens. The descent (tower.js CATACOMB_WINGS, hr_catacomb_start) is
// what 12-targets section 7 retires; it is not touched here.
// OWED BEFORE THEY OPEN: the bands are measured (danger.js DANGER_GROUNDS), and a Steady four still died there (the Flooded Wing's LOW and
// BIS fours 2 and 3 times in 4 days, the Bone Wing's LOW once), against 12-targets C-3's none.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { GROUND_PACKS } from './grounds/index.js';

/* the whole ground through the packs' index, never by path: a generator's whole view (tools/pack/whole.mjs) may leave it out, then no wings */
const catacombs = GROUND_PACKS.find((p) => p.id === 'unmarked_catacombs') || null;

/* `pockets` are indexes into the Unmarked Catacombs' own route, walked in this order */
const WINGS = Object.freeze([
  Object.freeze({ id: 'catacomb_bone_wing', name: 'Bone Wing', pockets: Object.freeze([0, 1, 2]), valueToday: 12989,
    theme: 'The Keepers stacked the old bones down here to make room. Now the walls get up.',
    /* in down the Night Carters' tunnel, as the whole ground starts */
    start: Object.freeze([[3, 1], [2, 1], [4, 1], [3, 2]]) }),
  /* the Flooded Wing opens first (12-targets 8.4 row 3): Levels 150-170, reference 160, where Wolfram is worn and the Roost hands over */
  Object.freeze({ id: 'catacomb_flooded_wing', name: 'Flooded Wing', pockets: Object.freeze([5, 4, 3]), valueToday: 14496, band: Object.freeze([150, 170]),
    theme: 'The river seeps into the lowest vaults. Keeper Dunn still reads the names out down there.',
    /* down the hoist shaft into the Carters' yard */
    start: Object.freeze([[4, 17], [3, 17], [5, 17], [4, 18]]) }),
]);

const g = catacombs ? catacombs.ground : null;
const LIVE = catacombs ? WINGS : [];
/* spawn weights the pack's way: each pocket's head-count at a pull of 4 (the first four of its box) */
const weightsOf = (pockets) => {
  const n = {};
  for (const p of pockets) for (const s of (g.pockets[p].pack || g.pockets[p].spawns).slice(0, 4)) n[s.monster] = (n[s.monster] || 0) + 1;
  return n;
};
const rarityOf = (id) => (catacombs.hunt.spawns.find((s) => s.monster === id) || { rarity: 'common' }).rarity;

/** The wings' hunt rows (src/data/hunts.js HUNTS), staged with the pack: the pack's place and family, its own spawn weights. */
export const CATACOMB_WING_HUNTS = Object.freeze(LIVE.map((w) => Object.freeze({
  id: w.id, region: catacombs.hunt.region, name: catacombs.hunt.name + ', ' + w.name, theme: w.theme, band: 'band' in w ? w.band : catacombs.hunt.band,
  spawns: Object.freeze(Object.entries(weightsOf(w.pockets)).map(([monster, n]) => Object.freeze({ monster, w: n, rarity: rarityOf(monster) }))),
  family: catacombs.hunt.family, art: catacombs.hunt.art, travelS: 0, pull: catacombs.hunt.pull, respawnMs: g.respawnMs,
  ...(catacombs.status === 'staged' ? { staged: true } : {}),
})));

/** The wings' ground rows (src/data/hunt-grounds.js HUNT_GROUNDS): the pack's map and rooms, the wing's route. Its own drop rows are its
    tier's base, joined by hunt-grounds.js from base-drops.js like every home's. */
export const CATACOMB_WING_GROUNDS = Object.freeze(Object.fromEntries(LIVE.map((w) => [w.id, Object.freeze({
  id: w.id, hunt: w.id, map: g.map, start: w.start,
  pockets: Object.freeze(w.pockets.map((p) => g.pockets[p])),
  route: Object.freeze(w.pockets.map((_, i) => i)),
  respawnMs: g.respawnMs, pullDist: g.pullDist, groupFit: g.groupFit, densityMax: g.densityMax,
  /* the guards' facts, as a pack states them (shape.js `checks`): the drop pace's reference group is the pack's, the value pin each wing's
     own floor hour, MEASURED (tests/hunt-core/drop-tables.mjs floor-hour) */
  checks: Object.freeze({ dropRef: catacombs.checks.dropRef, valueToday: w.valueToday }),
  /* built for the Danger scale alone: it plays a stance */
  scaleOnly: true,
  /* its roles: the whole ground's GROUND_ROSTER row, read, never copied (tools/pack.mjs lints the wing on it) */
  rosterGround: catacombs.id,
  /* the Party window's line (party-class-xp.js PARTY_VS_ALONE): the whole ground's Normal, CARRIED (the same monster rows), owed a measure
     on the wing before it opens */
  partyVsAlone: Object.freeze({ normal: catacombs.partyVsAlone.normal }),
  /* the suggested bag (supplies.js BAG_GUIDE_BY_HUNT): the whole ground's, CARRIED (the same monster rows and spells) */
  bagGuide: catacombs.bagGuide,
})])));
