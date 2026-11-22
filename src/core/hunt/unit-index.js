// ============================================================
// src/core/hunt/unit-index.js — THE SUB-STEP'S UNIT LISTS, READ ONCE (lane/r-engine-profile part 2, 2026-11-11)
//
// The bar, targeting and positioning ask the same questions of the whole unit list
// many times a sub-step: which monsters are engaged, which are alive, which heroes
// stand. Each was a filter over every unit: the heroes, a monster of every pack (six
// packs at density 8) and every corpse, about 17 a sub-step for a party of four (the
// 2026-11-11 count; tools/qa/engine-profile). Here they are answered from one pass,
// kept until something changes them. (A lookup by id stays movement.js unitById's
// find: a hero is near the front of the list, and a map a sub-step cost more.)
//
// TWO KINDS OF QUESTION (sides.js, the side seam). BY SIDE, relative to a side: who
// stands on it (livingOf, alliesByIdOf) and who stands against it (foesOf, and its
// engaged and targeted foes): every target, area, heal and condition list. BY KIND,
// for the machinery only a hero or only a monster runs: the monsters' own AI
// (engagedMonstersOf, livingMonstersOf) and the heroes' (livingHeroesOf, heroUnitsOf,
// heroesByIdOf). In a hunt every unit stands on its kind's side, so a side's list and
// its kind's list hold the same units in the same order: build reads the side groups
// off the kind lists then, and scans by sideOf only once a unit is placed on a side.
//
// WHAT AN ANSWER DEPENDS ON, AND WHO MAY CHANGE IT. A unit's `side`, `team` and `id`
// never change. Its `alive`, a monster's `target`, and the list itself change only at
// these writers, and each calls staleIndex(inst) as it writes:
//   pull-cycle.js  placeRow (a spawn joins the list), spawnAdds (an add's target),
//                  fallen (alive, target), startPull (the pack's target),
//                  clearCorpses (the list is replaced)
//   leash.js       resetPack (the pack's target)
//   targeting.js   retarget (a monster's target)
// A hero's own `target` (targeting.js chooseTargets, roles.js closeIn, pull-cycle.js
// fallen's regroup) is written without one, so NO KEPT ANSWER READS IT: a side's
// engaged and targeted lists are kept only while no hero stands in it, and read fresh
// otherwise (in a hunt the heroes' side is never asked for them). A list replaced or
// grown under the index is caught on the next read as well (its identity and its
// length are kept).
// tests/hunt-core/engine-parity.mjs plants an audit that checks every answer against
// a fresh scan for whole hunts, and pins the writers above (a new writer of `alive`,
// `target` or the list fails it until it calls staleIndex or says why it needn't).
//
// ONLY A SWING INDEXES (world-step.js stepWorld sets `inst.indexed` and drops the
// index at every sub-step). Any other caller (a test's hand-built inst, a settle's
// read between swings) gets the plain scan, every time. Either way an answer is a
// FROZEN array: it may be shared, so a caller that wants it in another order copies
// it first (a sort in place throws).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { SIDE, sideOf, isPlaced, isHero, isMonster } from './sides.js';

const EMPTY = Object.freeze([]);
const engagedIn = (list) => list.filter((u) => Number.isInteger(u.target));
const targetedIn = (list) => list.filter((u) => u.target !== null && u.target !== undefined);
/* A group: some living units (one side, or one side's foes) in list order, with their engaged and targeted lists, which are KEPT
   only while no hero is among them (header): `add` each unit, then `seal`. */
const openGroup = () => ({ living: [], engaged: [], targeted: [], byId: null, heroIn: false });
function add(g, u) {
  g.living.push(u);
  if (isHero(u)) g.heroIn = true;
  if (Number.isInteger(u.target)) g.engaged.push(u);
  if (u.target !== null && u.target !== undefined) g.targeted.push(u);
}
function seal(g) {
  Object.freeze(g.living);
  g.engaged = g.heroIn ? null : Object.freeze(g.engaged);
  g.targeted = g.heroIn ? null : Object.freeze(g.targeted);
  return g;
}
const NONE = Object.freeze({ living: EMPTY, engaged: EMPTY, targeted: EMPTY, byId: EMPTY, heroIn: false });

/* ONE PASS. The kind lists always; the side groups by kind while every unit stands on its kind's side (no unit `placed`, sides.js:
   every hunt), when a side's living units ARE its kind's (the company's the living heroes, the ground's the living monsters, in list
   order), so a hunt's index costs what it cost before the seam; one group a side, by sideOf, once any unit is placed. */
function build(units) {
  const engaged = []; const targeted = []; const mons = []; const heroes = []; const heroUnits = []; let placed = false;
  for (const u of units) {
    if (isPlaced(u)) placed = true;
    const hero = isHero(u);
    if (hero) heroUnits.push(u);
    if (!u.alive) continue;
    if (isMonster(u)) {
      mons.push(u);
      if (Number.isInteger(u.target)) engaged.push(u);
      if (u.target !== null && u.target !== undefined) targeted.push(u);
    } else if (hero) heroes.push(u);
  }
  const ix = { units, n: units.length, engaged: Object.freeze(engaged), mons: Object.freeze(mons), heroes: Object.freeze(heroes),
    heroUnits: Object.freeze(heroUnits), heroesById: null, placed, company: null, ground: null, sides: null, foes: null };
  if (!placed) {
    ix.company = { living: ix.heroes, engaged: null, targeted: null, byId: null, heroIn: true };
    ix.ground = { living: ix.mons, engaged: ix.engaged, targeted: Object.freeze(targeted), byId: null, heroIn: false };
    return ix;
  }
  ix.sides = new Map();
  for (const u of units) {
    if (!u.alive) continue;
    const s = sideOf(u);
    let g = ix.sides.get(s);
    if (!g) ix.sides.set(s, (g = openGroup()));
    add(g, u);
  }
  for (const g of ix.sides.values()) seal(g);
  return ix;
}

/* The index for this sub-step: kept while its list is the world's (the same array, the same length), rebuilt otherwise. */
function current(inst) {
  const units = inst.world.units;
  let ix = inst.ix;
  if (!ix || ix.units !== units || ix.n !== units.length) ix = inst.ix = build(units);
  return ix;
}

/** A writer of a unit's `alive`, a monster's `target` or the unit list calls this as it writes (see the header). */
export function staleIndex(inst) {
  if (inst && inst.ix) inst.ix = null;
}

/* ── BY SIDE ─────────────────────────────────────────────────────────── */

/* The living units on `side` / against `side`, as a group (indexed). With no unit placed, a hunt's two sides are its kind groups,
   each the other's foes. Once one is placed: against a side, with two sides standing, the other one's group (the same units in list
   order); otherwise a scan of the list, kept for the sub-step. */
function sideGroup(ix, side) {
  if (!ix.placed) return side === SIDE.company ? ix.company : side === SIDE.ground ? ix.ground : NONE;
  return ix.sides.get(side) || NONE;
}
function foeGroup(ix, side) {
  if (!ix.placed && side === SIDE.company) return ix.ground;
  if (!ix.placed && side === SIDE.ground) return ix.company;
  if (!ix.foes) ix.foes = new Map();
  let g = ix.foes.get(side);
  if (g) return g;
  const n = ix.placed ? ix.sides.size : 0; const mine = ix.placed && ix.sides.has(side);
  if (ix.placed && (n === 0 || (n === 1 && mine))) g = NONE;
  else if (ix.placed && ((n === 2 && mine) || (n === 1 && !mine))) { for (const [s, o] of ix.sides) if (s !== side) g = o; }
  else {
    g = openGroup();
    for (const u of ix.units) if (u.alive && sideOf(u) !== side) add(g, u);
    seal(g);
  }
  ix.foes.set(side, g);
  return g;
}

/** The living units on `side` (sides.js), in list order. */
export function livingOf(inst, side) {
  if (inst.indexed === true) return sideGroup(current(inst), side).living;
  return Object.freeze(inst.world.units.filter((u) => u.alive && sideOf(u) === side));
}

/** The living units on `side`, by unit id (a stable sort: equal ids keep list order). */
export function alliesByIdOf(inst, side) {
  if (inst.indexed === true) {
    const g = sideGroup(current(inst), side);
    /* (a side joins in seat or spawn order with rising ids, so its list is nearly always in id order already) */
    if (!g.byId) g.byId = g.living.every((u, i) => i === 0 || g.living[i - 1].id <= u.id) ? g.living : Object.freeze(g.living.slice().sort((a, b) => a.id - b.id));
    return g.byId;
  }
  return Object.freeze(inst.world.units.filter((u) => u.alive && sideOf(u) === side).sort((a, b) => a.id - b.id));
}

/** The living units NOT on `side`, in list order. */
export function foesOf(inst, side) {
  if (inst.indexed === true) return foeGroup(current(inst), side).living;
  return Object.freeze(inst.world.units.filter((u) => u.alive && sideOf(u) !== side));
}

/** The living units not on `side` that hold a target (Number.isInteger), in list order: what `side` can fight now. */
export function engagedFoesOf(inst, side) {
  if (inst.indexed === true) { const g = foeGroup(current(inst), side); return g.engaged || Object.freeze(engagedIn(g.living)); }
  return Object.freeze(inst.world.units.filter((u) => u.alive && sideOf(u) !== side && Number.isInteger(u.target)));
}

/** The living units not on `side` whose target is set at all (neither null nor undefined), in list order. */
export function targetedFoesOf(inst, side) {
  if (inst.indexed === true) { const g = foeGroup(current(inst), side); return g.targeted || Object.freeze(targetedIn(g.living)); }
  return Object.freeze(inst.world.units.filter((u) => u.alive && sideOf(u) !== side && u.target !== null && u.target !== undefined));
}

/* ── BY KIND (the machinery only one kind runs) ──────────────────────── */

/** The living monsters that hold a target (Number.isInteger), in list order: the monsters' own AI. */
export function engagedMonstersOf(inst) {
  if (inst.indexed === true) return current(inst).engaged;
  return Object.freeze(inst.world.units.filter((u) => isMonster(u) && u.alive && Number.isInteger(u.target)));
}

/** The living monsters, in list order. */
export function livingMonstersOf(inst) {
  if (inst.indexed === true) return current(inst).mons;
  return Object.freeze(inst.world.units.filter((u) => isMonster(u) && u.alive));
}

/** The living heroes, in list order. */
export function livingHeroesOf(inst) {
  if (inst.indexed === true) return current(inst).heroes;
  return Object.freeze(inst.world.units.filter((u) => isHero(u) && u.alive));
}

/** Every hero unit, standing or fallen, in list order. */
export function heroUnitsOf(inst) {
  if (inst.indexed === true) return current(inst).heroUnits;
  return Object.freeze(inst.world.units.filter((u) => isHero(u)));
}

/** The living heroes by unit id (a stable sort: equal ids keep list order). */
export function heroesByIdOf(inst) {
  if (inst.indexed === true) {
    const ix = current(inst);
    /* (heroes join in seat order with rising ids, so the list is nearly always in id order already: a stable sort of it is itself) */
    if (!ix.heroesById) ix.heroesById = ix.heroes.every((u, i) => i === 0 || ix.heroes[i - 1].id <= u.id) ? ix.heroes : Object.freeze(ix.heroes.slice().sort((a, b) => a.id - b.id));
    return ix.heroesById;
  }
  return Object.freeze(inst.world.units.filter((x) => isHero(x) && x.alive).sort((a, b) => a.id - b.id));
}
