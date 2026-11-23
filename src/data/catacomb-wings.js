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
// THE DROP ROWS (`drops` on the ground row): every kill on the wing rolls them after its own monster's rows (src/core/combat-sim.js
// huntPlayOf, the instance's one door to a monster row). Each wing carries all 24 pieces, leaning to its slot the way its key did
// (catacomb-armor.js WING_LEAN: the Bone Wing 70% helmets, the Flooded Wing 70% boots), in the Rare band (loot-bands.js).
//   ARMOR_EVERY_HOURS 0.7  STATED (a lever for the Lab, not a ruling): one named piece, either slot, about every 0.7 hunted hours a hero of
//                      the reference party (src/data/drop-hours.js, lane/drop-formula 2026-11-22: drops authored in hours). Each row's chance
//                      is derived from the wing's own reference kills a head an hour (danger.js DANGER_GROUNDS refKillsHead), so a leaning piece
//                      comes about every 12 hours a hero and the other slot's about every 28 (the Rare band is 10 to 20: the other wing is
//                      where the other slot is farmed) at any kill rate. It was ARMOR_PM_KILL 12 a thousand kills, stated at PAY.refKillsHead's
//                      120: at the wings' measured 160 and 150 that read a leaning piece every 9 and 10 h, under the band
// THE TRAITS STAY HIDDEN (gear-steps.js): each wing's pool is danger.js DANGER_GROUNDS `traits`, and nothing rolls them until wave 4.
//
// STAGED with the Catacombs (CLAUDE.md section 3.5: half-built features stay hidden): the map is unpainted past its floor (map.js), so no
// list, picker or server catalogue serves either wing until the pack opens. The descent (tower.js CATACOMB_WINGS, hr_catacomb_start) is
// what 12-targets section 7 retires; it is not touched here.
// OWED BEFORE THEY OPEN: the bands are measured (danger.js DANGER_GROUNDS), and a Steady four still died there (the Flooded Wing's LOW and
// BIS fours 2 and 3 times in 4 days, the Bone Wing's LOW once), against 12-targets C-3's none; the named pieces' reqLv is their old key
// tier's twin (15 to 88), so each must be worn from its item Level less wearAhead (gear-steps.js) before a hero can drop one; and the
// server's kill bound counts a ground's own rows already (tools/gen-hunt-sessions.mjs dropNeeds), the hunt card does not show them yet.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { GROUND_PACKS } from './grounds/index.js';
import { CATACOMB_ARMOR, WING_LEAN } from './catacomb-armor.js';
import { DANGER_GROUNDS } from './danger.js';
import { DROP_HOURS, chanceOf, roundChance } from './drop-hours.js';

/* the whole ground through the packs' index, never by path: a generator's whole view (tools/pack/whole.mjs) may leave it out, then no wings */
const catacombs = GROUND_PACKS.find((p) => p.id === 'unmarked_catacombs') || null;

/* STATED: hunted hours a hero to one named piece on a wing, either slot (header) */
export const ARMOR_EVERY_HOURS = 0.7;

/* `pockets` are indexes into the Unmarked Catacombs' own route, walked in this order; `lean` the catacomb-armor.js WING_LEAN row */
const WINGS = Object.freeze([
  Object.freeze({ id: 'catacomb_bone_wing', name: 'Bone Wing', lean: 'bone', pockets: Object.freeze([0, 1, 2]), valueToday: 12989,
    theme: 'The Keepers stacked the old bones down here to make room. Now the walls get up.',
    /* in down the Night Carters' tunnel, as the whole ground starts */
    start: Object.freeze([[3, 1], [2, 1], [4, 1], [3, 2]]) }),
  Object.freeze({ id: 'catacomb_flooded_wing', name: 'Flooded Wing', lean: 'waterlogged', pockets: Object.freeze([5, 4, 3]), valueToday: 14496,
    theme: 'The river seeps into the lowest vaults. Keeper Dunn still reads the names out down there.',
    /* down the hoist shaft into the Carters' yard */
    start: Object.freeze([[4, 17], [3, 17], [5, 17], [4, 18]]) }),
]);

/* One wing's drop rows: all 24 pieces, each slot's share of ARMOR_EVERY_HOURS's pieces split evenly over that slot's pieces, as hours a
   piece (drop-hours.js: a ground row, so every kill on the wing rolls it), and the chance those hours give at the wing's reference kills
   (src/core/drop-rate.js rowChance reads the same). Rows in CATACOMB_ARMOR's order, so a piece added there never moves an earlier row's draw. */
function wingDrops(id, lean) {
  const w = WING_LEAN[lean];
  const count = (slot) => CATACOMB_ARMOR.filter((r) => r.slot === slot).length;
  return Object.freeze(CATACOMB_ARMOR.map((r) => {
    const everyHours = Number(((ARMOR_EVERY_HOURS * 1000 * count(r.slot)) / w[r.slot]).toPrecision(DROP_HOURS.chDigits));
    return Object.freeze({ id: r.id, everyHours, ch: roundChance(chanceOf(everyHours, DANGER_GROUNDS[id].refKillsHead)), band: 'rare' });
  }));
}

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
  id: w.id, region: catacombs.hunt.region, name: catacombs.hunt.name + ', ' + w.name, theme: w.theme, band: catacombs.hunt.band,
  spawns: Object.freeze(Object.entries(weightsOf(w.pockets)).map(([monster, n]) => Object.freeze({ monster, w: n, rarity: rarityOf(monster) }))),
  family: catacombs.hunt.family, art: catacombs.hunt.art, travelS: 0, pull: catacombs.hunt.pull, respawnMs: g.respawnMs,
  ...(catacombs.status === 'staged' ? { staged: true } : {}),
})));

/** The wings' ground rows (src/data/hunt-grounds.js HUNT_GROUNDS): the pack's map and rooms, the wing's route, its drop rows. */
export const CATACOMB_WING_GROUNDS = Object.freeze(Object.fromEntries(LIVE.map((w) => [w.id, Object.freeze({
  id: w.id, hunt: w.id, map: g.map, start: w.start,
  pockets: Object.freeze(w.pockets.map((p) => g.pockets[p])),
  route: Object.freeze(w.pockets.map((_, i) => i)),
  respawnMs: g.respawnMs, pullDist: g.pullDist, groupFit: g.groupFit, densityMax: g.densityMax,
  drops: wingDrops(w.id, w.lean),
  /* the guards' facts, as a pack states them (shape.js `checks`): the drop pace's reference group is the pack's, the value pin each wing's
     own floor hour, MEASURED (tests/hunt-core/drop-tables.mjs floor-hour) */
  checks: Object.freeze({ dropRef: catacombs.checks.dropRef, valueToday: w.valueToday }),
  /* built for the Danger scale alone: a stance, never a tier (hunt-tiers.js GROUND_TIERS skips it, so it offers Normal only) */
  scaleOnly: true,
  /* its roles: the whole ground's GROUND_ROSTER row, read, never copied (tools/pack.mjs lints the wing on it) */
  rosterGround: catacombs.id,
  /* the Party window's line (party-class-xp.js PARTY_VS_ALONE): the whole ground's Normal, CARRIED (the same monster rows), owed a measure
     on the wing before it opens */
  partyVsAlone: Object.freeze({ normal: catacombs.partyVsAlone.normal }),
  /* the suggested bag (supplies.js BAG_GUIDE_BY_HUNT): the whole ground's, CARRIED (the same monster rows and spells) */
  bagGuide: catacombs.bagGuide,
})])));
