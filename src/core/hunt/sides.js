// ============================================================
// src/core/hunt/sides.js — WHO FIGHTS WHOM: THE SIDE SEAM (redesign 02-architecture §7b, wave 1's first engine batch)
//
// The engine asks two different questions of a unit, and each goes through ONE door here:
//
//   ITS KIND, what it IS (isHero / isMonster). A hero runs its role, its bar and its gear (mitigation, resistances, regen,
//     stop rules); a monster runs its MONSTERS row (stats, leash, pack, spells, phases, corpse). The persisted unit field
//     `side` has always held this, 'hero' or 'mon': world-state.js, the browser's scene and every fixture read it so.
//   ITS SIDE, whom it fights (sideOf / isEnemy / isAlly). "Enemy" is "not my side" and "ally" is "my side", everywhere the
//     engine picks a target, lands an area, heals or shields, takes threat, reads a bar condition about enemies or allies,
//     casts a monster's spell at someone or pays a kill. unit-index.js answers its lists by side the same way.
//
// In a hunt the two coincide: the company stands on SIDE.company and the ground's monsters on SIDE.ground, so every unit's
// side is its kind's and every hunt plays exactly as it did when the engine read the kind (tests/hunt-core/engine-parity.mjs
// holds its pins). What is NOT routed here is hunt structure, which stays kind by construction: the pull cycle's packs and
// pockets, the party's leader, formation, regroup and regen, corpses, solidity (a monster stops everyone; a hero stops
// monsters), the tally's roster and the rewards' members. An arena (heroes on both sides) is its own mode over the same fight.
//
// WHERE A SIDE COMES FROM. A unit stands on its kind's side unless it carries `team`, the label of the side it was placed
// on. Nothing in a hunt places one, so no hunt carries it. It is NOT persisted yet (a world's field list is the server's
// hr_hunt_world_shape, a catalogue move): the batch that first plays a mixed fight across a settle cut adds `team` to the
// world's fields. Until then a `team` lives one span; tests/hunt-core/side-seam.mjs plays a mixed fight inside one.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Imports nothing.
// ============================================================

/* The kind field's two values (world-state.js validate holds every unit to one). A hunt's two sides are labelled by them, so a unit
   with no `team` stands on its kind's side by the label it already carries. */
const HERO = 'hero'; const MON = 'mon';

/** The two sides of a hunt, by label: the company that entered it and the ground it hunts. */
export const SIDE = Object.freeze({ company: HERO, ground: MON });

/** The side unit `u` fights on: the side it was placed on (`team`), else its kind's. */
export const sideOf = (u) => (u.team !== undefined ? u.team : u.side);

/** Was `u` placed on a side (it carries `team`)? With none placed, every unit stands on its kind's side (unit-index.js reads its
    side lists off its kind lists then). */
export const isPlaced = (u) => u.team !== undefined;

/** Do `a` and `b` fight each other? (Not the same side. A unit is never its own enemy.) */
export const isEnemy = (a, b) => sideOf(a) !== sideOf(b);

/** Do `a` and `b` fight beside each other? (The same side; a unit is its own ally.) */
export const isAlly = (a, b) => sideOf(a) === sideOf(b);

/** Is `u` a hero (a company member's unit: a role, a bar, gear), whatever side it stands on? */
export const isHero = (u) => !!u && u.side === HERO;

/** Is `u` a monster (a MONSTERS row), whatever side it stands on? */
export const isMonster = (u) => !!u && u.side === MON;
