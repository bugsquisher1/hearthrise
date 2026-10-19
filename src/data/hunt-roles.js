// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-roles.js — WHAT A HERO DOES IN A HUNT (HUNT_SCREEN_SPEC §1.2, §3.2)
//
// Role comes from the equipped WEAPON TYPE, never the outfit (Tyler 2026-10-16;
// RO-18). No vocation names anywhere. A role row is a function, not a spec
// (RO-17): a shield makes a Melee tank (it pulls, holds and Challenges), two
// axes or a club a Melee DPS (stands by the tank's target), a bow or crossbow
// a Ranger, a staff a Mage or a Healer.
//
// UNITS (hunt-tuning.js): speed in millitiles per second, range in tiles,
// chances in permille, clocks in integer ms.
//
// The role NUMBERS live here (spec §1.2: peel chance, spot hysteresis, the
// Challenge radius and cooldown). World numbers stay in hunt-tuning.js. Every
// ASSUMED value is spec §5's.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* role id → row.
   melee     true = attacks only from an adjacent tile, and only standing on it (RO-19)
   range     tiles; a ranged role also needs line of sight (TG-02)
   tank      true = holds, and Challenges what is not on him (spec §3.2 #2, #14)
   peel      permille: a basic attack of this role draws a queued monster onto it (TG-07, ASSUMED)
   discipline the src/data/abilities.js discipline whose three abilities the role's bar holds
   A role sets no HP or mana: those come from the character's Level and armour
   (src/core/vitals.js, CORE_MODEL.md §3). */
export const HUNT_ROLES = Object.freeze({
  tank: Object.freeze({ label: 'Melee (shield)', discipline: 'shield', melee: true, range: 1, tank: true, speed: 3200, peel: 0 }),
  melee_dps: Object.freeze({ label: 'Melee', discipline: 'dual_axe', melee: true, range: 1, tank: false, speed: 3200, peel: 0 }),
  ranger: Object.freeze({ label: 'Ranger', discipline: 'ranged', melee: false, range: 7, tank: false, speed: 3200, peel: 0 }),
  mage: Object.freeze({ label: 'Mage', discipline: 'destruction', melee: false, range: 7, tank: false, speed: 3200, peel: 0 }),
  healer: Object.freeze({ label: 'Healer', discipline: 'restoration', melee: false, range: 7, tank: false, speed: 3200, peel: 180 }),
});

/* WHO LEADS THE PULL (spec §3.2 #3, ASSUMED): the first hero in this order, ties by unit id. */
export const ROLE_ORDER = Object.freeze(['tank', 'melee_dps', 'ranger', 'mage', 'healer']);

/* WEAPON TYPE → the roles it can play; the first is the default (a staff is a Mage
   unless the hero's settings pick Healer). */
export const WEAPON_ROLES = Object.freeze({
  shield: Object.freeze(['tank']),
  dual_axe: Object.freeze(['melee_dps']),
  club: Object.freeze(['melee_dps']),
  bow: Object.freeze(['ranger']),
  crossbow: Object.freeze(['ranger']),
  staff: Object.freeze(['mage', 'healer']),
  /* THE WEAPON TYPES src/data/items.js SHIPS (designer 2026-10-18). This table is
     the ONE weapon -> role source: the server (hr_hunt_weapon_roles, generated),
     hunt-spawn heroSetup and the client (import roleForWeapon, never a copy).
     items.js weaponType stays the COMBAT style (accuracy skill, weakness), so the
     rows are mapped here, not renamed. A sword is a one-hand blade with a shield
     arm: the anchor, Tank (the sewer lane's Bronze Sword ruling). A two-hand
     hammer crushes: the club's Melee DPS. Bows and crossbows ship as `ranged`
     until bow = AoE / crossbow = single target is ruled; magic weapons are
     staves (Mage, or Healer if picked). No weapon fights as Melee DPS. */
  sword: Object.freeze(['tank']),
  hammer: Object.freeze(['melee_dps']),
  neutral: Object.freeze(['melee_dps']),
  ranged: Object.freeze(['ranger']),
  magic: Object.freeze(['mage', 'healer']),
});

/* THE TANK'S AUTO-CHALLENGE (spec §3.2 #14, ASSUMED numbers): any engaged monster
   within `radius` tiles (Chebyshev, "on screen") that is not on the tank is pulled
   back onto him, at most once per `cooldownMs`. No player input. */
export const CHALLENGE = Object.freeze({ radius: 6, cooldownMs: 8000 });

/* THE RANGED SPOT (spec §3.1 #10, §5 #4, ASSUMED). A spot is valid while its
   distance d from the hero's own target is in [want - bandBelow, want + bandAbove]
   (tenths of a tile); a held spot is given up only for one scoring
   `hysteresis` better. `searchRadius` bounds the candidate square round the target.
   Score weights (lower is better): off-distance, walk, and a reward for room. */
export const SPOT = Object.freeze({
  bandBelowTenths: 10, bandAboveTenths: 12, searchRadius: 8, hysteresis: 0.5,
  weightOffDistance: 2, weightWalk: 0.35, weightRoomPerMonster: 0.15, roomCap: 6,
});

/* KITING (spec §3.2 #5, #8, #9; RO-10..12). A kiter looks for a retreat tile within
   `searchRadius`; a tile must lie at least `awayMin` farther from the pack centre than
   the hero stands now, and at least min(dist, `minGap`) from every monster. */
export const KITE = Object.freeze({ searchRadius: 5, awayMin: 0.5, minGap: 2, shortPenalty: 3, noSightPenalty: 4 });

/* How often a monster re-picks its surround slot, and the ring extras queue on (RO-02). */
export const SURROUND = Object.freeze({ repathMs: 500, queueRing: 2 });

/* How often the travelling leader / a positioning hero re-aims (RO-05, PC-03). */
export const AI_REPATH_MS = Object.freeze({ travel: 1500, ranged: 1000, melee: 500, kite: 600 });

/** The role a weapon type plays: `pick` when the weapon allows it, else its default; null for no row. */
export function roleForWeapon(weaponType, pick) {
  const roles = WEAPON_ROLES[weaponType];
  if (!roles) return null;
  return pick && roles.includes(pick) ? pick : roles[0];
}

/** Every problem with the tables, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const roleIds = Object.keys(HUNT_ROLES);
  if (ROLE_ORDER.length !== roleIds.length || !roleIds.every((r) => ROLE_ORDER.includes(r))) out.push('ROLE_ORDER must list every role once');
  for (const [id, r] of Object.entries(HUNT_ROLES)) {
    if (!/^[a-z_]{1,32}$/.test(id)) out.push(id + ': bad id');
    if (typeof r.melee !== 'boolean' || typeof r.tank !== 'boolean') out.push(id + ': melee and tank are booleans');
    if (!Number.isInteger(r.range) || r.range < 1 || r.range > 12) out.push(id + ': range must be 1..12 tiles');
    if (r.melee && r.range !== 1) out.push(id + ': a melee role has range 1');
    if (!Number.isInteger(r.speed) || r.speed <= 0) out.push(id + ': speed must be a positive integer');
    if (!Number.isInteger(r.peel) || r.peel < 0 || r.peel > 1000) out.push(id + ': peel is permille 0..1000');
    if (!['shield', 'dual_axe', 'ranged', 'destruction', 'restoration'].includes(r.discipline)) out.push(id + ': unknown discipline ' + r.discipline);
  }
  for (const [w, roles] of Object.entries(WEAPON_ROLES)) {
    if (!roles.length || !roles.every((r) => HUNT_ROLES[r])) out.push('weapon ' + w + ' names an unknown role');
  }
  if (!Number.isInteger(CHALLENGE.radius) || CHALLENGE.radius < 1) out.push('CHALLENGE.radius must be a positive integer');
  if (!Number.isInteger(CHALLENGE.cooldownMs) || CHALLENGE.cooldownMs <= 0 || CHALLENGE.cooldownMs % 100 !== 0) out.push('CHALLENGE.cooldownMs must be a whole number of 100 ms sub-steps');
  for (const [k, v] of Object.entries(AI_REPATH_MS)) if (!Number.isInteger(v) || v <= 0 || v % 100 !== 0) out.push('AI_REPATH_MS.' + k + ' must be a whole number of sub-steps');
  if (!Number.isInteger(SURROUND.repathMs) || SURROUND.repathMs % 100 !== 0) out.push('SURROUND.repathMs must be a whole number of sub-steps');
  if (!(SPOT.hysteresis >= 0)) out.push('SPOT.hysteresis must be >= 0');
  return out;
}
