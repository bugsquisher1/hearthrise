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
// WHAT AN ANSWER DEPENDS ON, AND WHO MAY CHANGE IT. A unit's `side` and `id` never
// change. Its `alive`, a monster's `target`, and the list itself change only at
// these writers, and each calls staleIndex(inst) as it writes:
//   pull-cycle.js  placeRow (a spawn joins the list), spawnAdds (an add's target),
//                  fallen (alive, target), startPull (the pack's target),
//                  clearCorpses (the list is replaced)
//   leash.js       resetPack (the pack's target)
//   targeting.js   retarget (a monster's target)
// A hero's own `target` (targeting.js chooseTargets, roles.js closeIn, pull-cycle.js
// fallen's regroup) is in no answer here. A list replaced or grown under the index
// is caught on the next read as well (its identity and its length are kept).
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

function build(units) {
  const engaged = []; const targeted = []; const mons = []; const heroes = []; const heroUnits = [];
  for (const u of units) {
    if (u.side === 'hero') heroUnits.push(u);
    if (u.side === 'mon' && u.alive) {
      mons.push(u);
      if (Number.isInteger(u.target)) engaged.push(u);
      if (u.target !== null && u.target !== undefined) targeted.push(u);
    } else if (u.side === 'hero' && u.alive) heroes.push(u);
  }
  return { units, n: units.length, engaged: Object.freeze(engaged), targeted: Object.freeze(targeted),
    mons: Object.freeze(mons), heroes: Object.freeze(heroes), heroUnits: Object.freeze(heroUnits), heroesById: null };
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

/** The living monsters that hold a target (Number.isInteger), in list order. */
export function engagedOf(inst) {
  if (inst.indexed === true) return current(inst).engaged;
  return Object.freeze(inst.world.units.filter((u) => u.side === 'mon' && u.alive && Number.isInteger(u.target)));
}

/** The living monsters whose target is set at all (neither null nor undefined), in list order. */
export function targetedOf(inst) {
  if (inst.indexed === true) return current(inst).targeted;
  return Object.freeze(inst.world.units.filter((u) => u.side === 'mon' && u.alive && u.target !== null && u.target !== undefined));
}

/** The living units of `side` ('mon' or 'hero'), in list order. */
export function livingOf(inst, side) {
  if (inst.indexed === true && (side === 'mon' || side === 'hero')) {
    const ix = current(inst);
    return side === 'mon' ? ix.mons : ix.heroes;
  }
  return Object.freeze(inst.world.units.filter((u) => u.side === side && u.alive));
}

/** Every hero unit, standing or fallen, in list order. */
export function heroUnitsOf(inst) {
  if (inst.indexed === true) return current(inst).heroUnits;
  return Object.freeze(inst.world.units.filter((u) => u.side === 'hero'));
}

/** The living heroes by unit id (a stable sort: equal ids keep list order). */
export function heroesByIdOf(inst) {
  if (inst.indexed === true) {
    const ix = current(inst);
    /* (heroes join in seat order with rising ids, so the list is nearly always in id order already: a stable sort of it is itself) */
    if (!ix.heroesById) ix.heroesById = ix.heroes.every((u, i) => i === 0 || ix.heroes[i - 1].id <= u.id) ? ix.heroes : Object.freeze(ix.heroes.slice().sort((a, b) => a.id - b.id));
    return ix.heroesById;
  }
  return Object.freeze(inst.world.units.filter((x) => x.side === 'hero' && x.alive).sort((a, b) => a.id - b.id));
}

