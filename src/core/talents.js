// ============================================================
// src/core/talents.js — THE ROADS' RULES: what a set of owned nodes is, whether a spend is legal, the suggested road, and what a build
// GRANTS a hero as the engine reads it (systems, lane/roads-sample, 2026-11-23; docs/design/redesign/17-talent-tree.md v3, 19 sections 1-2).
//
// A BUILD is the hero's owned nodes, { nodeId: value }, as the server holds them (hero_talents.nodes, hr_talents_view):
//   value true            a rank stone, a waystone, a vow (and the start, which every hero owns for free and is never stored)
//   value '<option id>'   a crossroads, hybrid, border town or the crossing: the picked option
//   value n (an integer)  an open road: n points on it
// Every value costs one point (an open road n). points(L) = max(0, L - pointFrom + 1): one a Level from Level 2.
//
// WHAT A BUILD GRANTS at Level L (grantsOf), read by the settle at every boundary (src/core/combat-sim.js syncUnit):
//   ledger   POWER LEDGER ROWS that hold always (src/core/power-ledger.js clampLedger): the build slice's step rows (x ramp(L) there, the
//            net clamped at buildStepsMax x ramp) and the idle points' cost in the `ranks` slice (pointSharePm of a step each, offense and
//            defense, never ramped, never clamped: an unspent point, or a rank stone on a move the hero never casts)
//   when     the step rows that hold on a condition, read per blow (src/core/hunt/talent-rows.js)
//   mods     { moveId: { cdMs, mana, outPm, ... } } THE MOVE MODIFIERS, numbers already x ramp(L) and rounded to the engine's grid; whole rules
//            (tiles, solo) whole from the start; a borrowed move's penalty (`penaltyPm`) whole (a price, not a talent number)
//   borrowed the moves of another weapon the hero may slot, open at L (17 section 3: by value), at most maxBorrowed
//   held     the rule ids the build names that the engine cannot play yet (data/talents.js `rule`): 0 in the engine, listed for the report
//   reacts   the build's reactions (src/core/hunt/reactions.js), pm x ramp(L); healIn its healing-received rows, pm x ramp(L); unit its
//            unit rules (UNIT_FIELDS: pm fields x ramp(L), the rest whole). A mod's flags whole and its words as written (MOD_FLAGS,
//            MOD_WORDS); its pieces ride the modded row as `fx` (src/core/hunt/talent-rows.js moddedRow)
// A vow counts only on a hero wielding its country's weapon (17 section 7: "Requires Level 30 and its weapon").
//
// PURE ESM, dual-runtime (the edge imports it through combat-sim.js). No DOM, no clock, no Math.random.
// ============================================================

import { TALENT_RULES, TALENT_NODES, NODE_INDEX, BORROW_BANDS, BORROW_OPEN, BORROW_VALUES, COUNTRY_ROADS, HEARTH, MOD_WHOLE, MOD_NUMBERS, MOD_FLAGS, MOD_WORDS, UNIT_FIELDS, PICK_KINDS } from '../data/talents.js';
import { ABILITIES, heals, abilitySkill } from '../data/abilities.js';
import { POWER_LEDGER, ramp } from '../data/power-ledger.js';
import { HUNT_TUNING } from '../data/hunt-tuning.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const NONE = Object.freeze([]);

/** The points a hero of Level `level` has had (one a Level from TALENT_RULES.pointFrom). */
export const pointsAt = (level) => Math.max(0, Math.floor(Number(level) || 0) - TALENT_RULES.pointFrom + 1);
/** The vow slots open at Level `level` (17 section 2: 1 at 30, 2 at 50, 3 at 200). */
export const vowSlotsAt = (level) => TALENT_RULES.vowSlots.filter((l) => (Number(level) || 0) >= l).length;

/** THE HAVORA CROSSING'S OPTIONS (17 section 3): every measured move with a Havora band, as an option row { id, n, tip, effects }. */
export const CROSSING_OPTIONS = Object.freeze(Object.keys(BORROW_VALUES).filter((m) => borrowBand(m, 'havora') && own(ABILITIES, m)).map((m) => Object.freeze({
  id: 'use_' + m, n: 'Use ' + ABILITIES[m].n, tip: 'Use ' + ABILITIES[m].n + ' with any weapon', effects: Object.freeze([Object.freeze({ kind: 'borrow', move: m })]),
})));

/** The options of `node` (the crossing's are CROSSING_OPTIONS). */
export const optionsOf = (node) => (node && node.kind === 'crossing' ? CROSSING_OPTIONS : (node && node.options) || NONE);
/** Option `pick` of `node`, or null. */
export const optionOf = (node, pick) => optionsOf(node).find((o) => o.id === pick) || null;

/**
 * THE BORROW BAND of move `move` taken at a border town ('border') or the Havora crossing ('havora') (17 section 3): { penaltyPm, value,
 * opensAt } with `value` its V0 after the penalty and `opensAt` the Level it opens at, or null when it is not offered there (no measured
 * V0, a band with no Havora price, or past the last band).
 */
export function borrowBand(move, where) {
  const v0 = own(BORROW_VALUES, move) ? BORROW_VALUES[move] : null;
  if (!Number.isFinite(v0) || v0 < 0) return null;
  const band = BORROW_BANDS.find((b) => v0 <= b.upTo);
  if (!band) return null;
  const penaltyPm = where === 'havora' ? band.havoraPm : band.borderPm;
  if (!Number.isInteger(penaltyPm)) return null;
  const value = (v0 * (1000 - penaltyPm)) / 1000;
  const raw = (BORROW_OPEN.openLevel * value) / POWER_LEDGER.buildStepsMax;
  const opensAt = Math.max(BORROW_OPEN.openFloor, Math.ceil(raw / BORROW_OPEN.openRound - 1e-9) * BORROW_OPEN.openRound);
  return { penaltyPm, value, opensAt };
}

/** A build as a plain { id: value } of known nodes only (an unknown id, a bad value or the start dropped): the one shape every reader takes. */
export function normalize(nodes) {
  const out = {};
  if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) return out;
  for (const [id, v] of Object.entries(nodes)) {
    const n = own(NODE_INDEX, id) ? NODE_INDEX[id] : null;
    if (!n || n.kind === 'start') continue;
    if (n.kind === 'open') { if (Number.isInteger(v) && v >= 1) out[id] = v; continue; }
    if (PICK_KINDS.includes(n.kind)) { if (typeof v === 'string' && optionOf(n, v)) out[id] = v; continue; }
    if (v === true) out[id] = true;
  }
  return out;
}

/** The points a build has spent (an open road its count, every other node one). */
export function pointsSpent(nodes) {
  let n = 0;
  for (const [id, v] of Object.entries(nodes || {})) n += own(NODE_INDEX, id) && NODE_INDEX[id].kind === 'open' ? (Number.isInteger(v) ? v : 0) : 1;
  return n;
}

const owns = (nodes, id) => id === 'hearth' || own(nodes, id);
const countryOf = (n) => (n.country !== undefined ? n.country : null);
/* a crossroads in `country` the build owns */
const crossroadsIn = (nodes, country) => Object.keys(nodes).some((id) => own(NODE_INDEX, id) && NODE_INDEX[id].kind === 'crossroads' && NODE_INDEX[id].country === country);
const borrowOf = (node, pick) => { const o = optionOf(node, pick); const b = o && o.effects.find((e) => e.kind === 'borrow'); return b ? b.move : null; };
/* a pick that lends a move lends it only where the move has a band (a measured V0 inside the bands): a pick that lends nothing is never
   bought, so no point is spent on a town that buys nothing (lane/roads-borrow-values). Every other pick is offered. */
const offered = (node, pick) => { const m = borrowOf(node, pick); return !m || !!borrowBand(m, node.kind === 'crossing' ? 'havora' : 'border'); };
const isVow = (n) => n.kind === 'vow';

/**
 * WHY `id` (with option `pick`) CANNOT BE BOUGHT NOW on build `nodes` by a hero of Level `level`, or null when it can (17 section 2 and 3):
 *   unknown_node · owned (a node already held; an open road takes more) · not_reachable (touches nothing owned) · bad_pick ·
 *   not_offered (a town's or the crossing's pick whose move has no band there: a point that would lend nothing) · no_points ·
 *   vow_level (under the first vow slot) · vow_slots (every open slot holds a vow) · needs_crossroads (a hybrid: one in each country) ·
 *   borrow_max (a third borrowed move). The server's hr_talent_spend asks the same questions of the same catalogue.
 */
export function spendProblem(nodes, id, pick, level) {
  const n = own(NODE_INDEX, id) ? NODE_INDEX[id] : null;
  if (!n || n.kind === 'start') return 'unknown_node';
  if (n.kind !== 'open' && own(nodes, id)) return 'owned';
  if (!n.after.some((a) => owns(nodes, a))) return 'not_reachable';
  if (PICK_KINDS.includes(n.kind) ? !optionOf(n, pick) : pick !== null && pick !== undefined) return 'bad_pick';
  if (!offered(n, pick)) return 'not_offered';
  if (pointsSpent(nodes) + 1 > pointsAt(level)) return 'no_points';
  if (isVow(n)) {
    if ((Number(level) || 0) < TALENT_RULES.vowSlots[0]) return 'vow_level';
    if (Object.keys(nodes).filter((k) => own(NODE_INDEX, k) && isVow(NODE_INDEX[k])).length + 1 > vowSlotsAt(level)) return 'vow_slots';
  }
  if (n.needs && Array.isArray(n.needs.crossroadsIn) && !n.needs.crossroadsIn.every((c) => crossroadsIn(nodes, c))) return 'needs_crossroads';
  if (borrowOf(n, pick) && Object.entries(nodes).filter(([k, v]) => own(NODE_INDEX, k) && borrowOf(NODE_INDEX[k], v)).length + 1 > TALENT_RULES.maxBorrowed) return 'borrow_max';
  return null;
}

/** Build `nodes` with `id` bought (an open road one more point). The caller checked spendProblem. */
export function spend(nodes, id, pick) {
  const n = NODE_INDEX[id];
  if (n.kind === 'open') return { ...nodes, [id]: (Number.isInteger(nodes[id]) ? nodes[id] : 0) + 1 };
  return { ...nodes, [id]: PICK_KINDS.includes(n.kind) ? pick : true };
}

/**
 * EVERY PROBLEM WITH A WHOLE BUILD (a saved build for a ground, a pasted code: 17 section 11), as { node, why } rows. With `level` the
 * points, the vow slots and Level 30 are checked too (a plan may run past the hero's Level without it: "draft a whole build past your Level").
 */
export function buildProblems(nodes, level) {
  const out = [];
  const norm = normalize(nodes);
  for (const id of Object.keys(nodes || {})) if (!own(norm, id) && id !== 'hearth') out.push({ node: id, why: own(NODE_INDEX, id) ? 'bad_pick' : 'unknown_node' });
  for (const [id, v] of Object.entries(norm)) {
    const n = NODE_INDEX[id];
    if (!n.after.some((a) => owns(norm, a))) out.push({ node: id, why: 'not_reachable' });
    if (!offered(n, v)) out.push({ node: id, why: 'not_offered' });
    if (n.needs && Array.isArray(n.needs.crossroadsIn) && !n.needs.crossroadsIn.every((c) => crossroadsIn(norm, c))) out.push({ node: id, why: 'needs_crossroads' });
  }
  const borrows = Object.entries(norm).filter(([k, v]) => borrowOf(NODE_INDEX[k], v)).length;
  if (borrows > TALENT_RULES.maxBorrowed) out.push({ node: null, why: 'borrow_max' });
  const vows = Object.keys(norm).filter((k) => isVow(NODE_INDEX[k])).length;
  if (vows > TALENT_RULES.vowSlots.length) out.push({ node: null, why: 'vow_slots' });
  if (level !== undefined) {
    if (pointsSpent(norm) > pointsAt(level)) out.push({ node: null, why: 'no_points' });
    if (vows > vowSlotsAt(level)) out.push({ node: null, why: vowSlotsAt(level) ? 'vow_slots' : 'vow_level' });
  }
  return out;
}

/* ── THE SUGGESTED ROAD (17 section 2 and the section 13 walk-through) ── */

/** The option "Spend as suggested" takes at `node` on plan `plan` ('party' | 'solo'): the one suggested for the plan, else for any plan,
    else the first. */
export function suggestedPick(node, plan) {
  const list = optionsOf(node);
  return (list.find((o) => o.suggested === plan) || list.find((o) => o.suggested === true) || list[0] || {}).id || null;
}

/* a road's nodes in walking order: 3 stones, crossroads I, its waystone, 2 stones, crossroads II, its waystone */
const ROAD_ORDER = ['r1', 'r2', 'r3', 'x1', 'w1', 'r4', 'r5', 'x2', 'w2'];
const roadNodes = (move) => ROAD_ORDER.map((s) => move + '.' + s).filter((id) => own(NODE_INDEX, id));

/** The roads a hero of discipline `discipline` walks: its own country's, then the roads in other countries of moves its weapon casts too
    (17 section 1: a shared move lives where its weapons meet, so a Shield hero walks Power Strike's road in Sword; section 13 Level 29), each
    country's in its map order, then the Great Hearth's. */
export function roadsFor(discipline) {
  const shared = Object.keys(COUNTRY_ROADS).filter((c) => c !== discipline && c !== HEARTH)
    .flatMap((c) => COUNTRY_ROADS[c].filter((m) => own(ABILITIES, m) && ABILITIES[m].disciplines.includes(discipline)));
  return [...(own(COUNTRY_ROADS, discipline) ? COUNTRY_ROADS[discipline] : NONE), ...shared, ...COUNTRY_ROADS[HEARTH]];
}

/**
 * THE SUGGESTED ORDER for a hero of `discipline` on plan `plan`: [[nodeId, pick]] over its country's roads in map order and then Mend's,
 * every crossroads at its suggested pick, NEVER a vow (R8: the vow goes on the return card) and never a borrow (a choice). Past it every
 * point goes to the open road of the first road (its main move).
 */
export function suggestedOrder(discipline, plan) {
  const out = [];
  for (const m of roadsFor(discipline)) for (const id of roadNodes(m)) {
    const n = NODE_INDEX[id];
    out.push([id, PICK_KINDS.includes(n.kind) ? suggestedPick(n, plan) : true]);
  }
  return out;
}
/** The open road the suggested rule spends into once the order is walked: its first road's. */
export const suggestedOpen = (discipline) => roadsFor(discipline)[0] + '.open';

/** `nodes` with every point a hero of Level `level` has left spent along `order` (then into `open` forever), skipping what it owns and
    anything spendProblem refuses. The suggested rule, and the Lab's allocations, are this with their own order. */
export function spendAlong(nodes, order, open, level) {
  let b = { ...normalize(nodes) };
  for (const [id, pick] of order) {
    if (pointsSpent(b) >= pointsAt(level)) return b;
    const p = pick === true ? null : pick;
    if (NODE_INDEX[id] && NODE_INDEX[id].kind !== 'open' && own(b, id)) continue;
    if (!spendProblem(b, id, p, level)) b = spend(b, id, p);
  }
  if (open && own(NODE_INDEX, open)) while (pointsSpent(b) < pointsAt(level) && !spendProblem(b, open, null, level)) b = spend(b, open, null);
  return b;
}

/** "SPEND AS SUGGESTED": every point a hero of `discipline` at Level `level` has left, on plan `plan` (never a vow). */
export function spendSuggested(nodes, discipline, plan, level) {
  return spendAlong(nodes, suggestedOrder(discipline, plan), suggestedOpen(discipline), level);
}

/** THE NEXT FORK on the suggested road: the first crossroads (or hybrid) of the order the build does not own, with its cost in points from
    here (the nodes still to buy on the way, itself included), or null. The card reads it. */
export function nextFork(nodes, discipline, plan) {
  const b = normalize(nodes);
  let cost = 0;
  for (const [id] of suggestedOrder(discipline, plan)) {
    if (own(b, id)) continue;
    cost++;
    const n = NODE_INDEX[id];
    if (n.kind === 'crossroads' || n.kind === 'hybrid') return { id, n: n.n, move: n.move || null, cost, options: optionsOf(n).map((o) => ({ id: o.id, n: o.n, tip: o.tip, suggested: o.id === suggestedPick(n, plan) })) };
  }
  return null;
}

/* ── WHAT A BUILD GRANTS ── */

const STEP = HUNT_TUNING.stepMs;
const MEMO = new Map();
const keyOf = (nodes) => Object.keys(nodes).sort().map((k) => k + '=' + nodes[k]).join(',');

/** The moves a hero of `discipline` casts: its discipline's (Mend included) and its borrowed ones. */
/* (read off the rows' own disciplines: the bar's list is hunt-spawn.js heroSetup's to read, the engine's one reader of it) */
const nativeMoves = (discipline) => Object.keys(ABILITIES).filter((id) => ABILITIES[id].disciplines.includes(discipline));
const castable = (discipline, borrowed) => new Set([...nativeMoves(discipline), ...borrowed]);
const groupOf = (g, moves) => [...moves].filter((m) => own(ABILITIES, m) && (g === '*heal' ? heals(ABILITIES[m]) : g === '*spell' ? abilitySkill(ABILITIES[m]) === 'magic' && ABILITIES[m].mana > 0 : m === g));

/**
 * WHAT BUILD `nodes` GRANTS a hero of `discipline` at Level `level` (the header): { ledger, when, mods, borrowed, held, idle }. Memoized
 * by (build, discipline, Level): a settle asks the same few a window. A build the catalogue refuses counts only its legal part.
 */
export function grantsOf(nodesIn, discipline, level) {
  const nodes = normalize(nodesIn);
  const L = Math.max(1, Math.floor(Number(level) || 1));
  const memo = keyOf(nodes) + '|' + discipline + '|' + L;
  const hit = MEMO.get(memo);
  if (hit) return hit;
  const k = ramp(L);
  /* THE BORROWED MOVES open at L: each town or crossing pick, at its band's opening Level, at most maxBorrowed, never a native one */
  const native = new Set(nativeMoves(discipline));
  const borrowed = [], penalty = {};
  for (const [id, v] of Object.entries(nodes)) {
    const n = NODE_INDEX[id], m = borrowOf(n, v);
    if (!m || native.has(m) || borrowed.includes(m) || borrowed.length >= TALENT_RULES.maxBorrowed) continue;
    const band = borrowBand(m, n.kind === 'crossing' ? 'havora' : 'border');
    if (!band || L < band.opensAt) continue;
    borrowed.push(m);
    penalty[m] = band.penaltyPm;
  }
  const moves = castable(discipline, borrowed);
  const ledger = [], when = [], held = [], raw = {}, reacts = [], healIn = [], unitRaw = {};
  /* a vow counts only on its weapon: its country is the hero's, or one of a hybrid vow's two */
  const wields = (n) => !isVow(n) || (n.countries ? n.countries.includes(discipline) : countryOf(n) === discipline);
  const apply = (fx) => {
    for (const e of fx || NONE) {
      if (e.kind === 'step') (e.when ? when : ledger).push({ slice: 'build', raises: e.raises, steps: e.steps, key: e.key, ...(e.when ? { when: e.when } : {}) });
      else if (e.kind === 'rule') { if (!held.includes(e.id)) held.push(e.id); }
      /* THE PIECES (lane/talent-effects): a reaction, the healing received, a unit rule; their pm numbers x ramp(L) below */
      else if (e.kind === 'react') reacts.push(e);
      else if (e.kind === 'heal_in') healIn.push(e);
      else if (e.kind === 'unit') { for (const f of Object.keys(e)) if (f !== 'kind') unitRaw[f] = UNIT_FIELDS[f] === 'flag' ? true : (unitRaw[f] || 0) + e[f]; }
      else if (e.kind === 'mod') for (const m of groupOf(e.move, moves)) {
        const r = raw[m] || (raw[m] = {});
        for (const f of Object.keys(e)) if (f !== 'kind' && f !== 'move') r[f] = MOD_FLAGS.includes(f) ? true : own(MOD_WORDS, f) ? e[f] : (r[f] || 0) + e[f];
      }
    }
  };
  let idleRanks = 0;
  for (const [id, v] of Object.entries(nodes)) {
    const n = NODE_INDEX[id];
    if (!n.after.some((a) => owns(nodes, a))) continue;
    if (n.kind === 'rank' || n.kind === 'open') { if (!moves.has(n.move)) idleRanks += n.kind === 'open' ? v : 1; continue; }
    if (!wields(n)) continue;
    if (n.needs && Array.isArray(n.needs.crossroadsIn) && !n.needs.crossroadsIn.every((c) => crossroadsIn(nodes, c))) continue;
    apply(PICK_KINDS.includes(n.kind) ? (optionOf(n, v) || {}).effects : n.effects);
  }
  /* THE IDLE POINTS (19 row 2): unspent, or a rank on a move never cast; each a third of a step off, offense and defense, never ramped */
  const idle = Math.max(0, pointsAt(L) - pointsSpent(nodes)) + idleRanks;
  if (idle > 0) {
    const steps = -(idle * TALENT_RULES.pointSharePm) / 1000;
    ledger.push({ slice: 'ranks', raises: 'offense', steps, key: 'idle' }, { slice: 'ranks', raises: 'defense', steps, key: 'idle' });
  }
  /* THE MODS, x ramp(L) on the numbers, whole on the rules, on the engine's grid */
  const mods = {};
  for (const m of new Set([...Object.keys(raw), ...Object.keys(penalty)])) {
    const r = raw[m] || {}, o = {};
    for (const f of MOD_NUMBERS) {
      if (!Number.isInteger(r[f]) || r[f] === 0) continue;
      const v = MOD_WHOLE.includes(f) ? r[f] : r[f] * k;
      const g = f === 'cdMs' || f === 'statusMs' || f === 'holdMs' ? Math.round(v / STEP) * STEP : Math.round(v);
      if (g) o[f] = g;
    }
    for (const f of MOD_FLAGS) if (r[f]) o[f] = true;
    for (const f of Object.keys(MOD_WORDS)) if (typeof r[f] === 'string') o[f] = r[f];
    if (penalty[m]) o.penaltyPm = penalty[m];
    if (Object.keys(o).length) mods[m] = Object.freeze(o);
  }
  /* THE PIECES' NUMBERS x ramp(L): a reaction's and a healing-received row's pm, a unit rule's pm fields (at least 1 point while any is held) */
  const rampPm = (n) => (n > 0 ? Math.max(1, Math.round(n * k)) : n < 0 ? Math.min(-1, Math.round(n * k)) : 0);
  const unit = {};
  for (const [f, v] of Object.entries(unitRaw)) unit[f] = UNIT_FIELDS[f] === 'pm' ? rampPm(v) : v;
  const out = Object.freeze({ ledger: Object.freeze(ledger), when: Object.freeze(when), mods: Object.freeze(mods), borrowed: Object.freeze(borrowed), held: Object.freeze(held), idle,
    reacts: Object.freeze(reacts.map((e) => Object.freeze(Number.isInteger(e.pm) ? { ...e, pm: rampPm(e.pm) } : { ...e }))),
    healIn: Object.freeze(healIn.map((e) => Object.freeze({ ...e, pm: rampPm(e.pm) }))), unit: Object.freeze(unit) });
  if (MEMO.size < 2048) MEMO.set(memo, out);
  return out;
}

/** Every rule id the whole map names that the engine holds at 0 (the report's "not live yet" list). */
export function heldRules(nodes = TALENT_NODES) {
  const s = new Set();
  for (const n of nodes) for (const e of [...(n.effects || NONE), ...optionsOf(n).flatMap((o) => o.effects)]) if (e.kind === 'rule') s.add(e.id);
  return [...s].sort();
}

/** THE ENVELOPE SECTION `talents` as the client reads it (hr_talents_view): { live, level, points, spent, nodes, borrowed, vowSlots },
    normalized; null for none. Display only: every spend is a server intent. */
export function talentsSectionOf(sec) {
  if (!sec || typeof sec !== 'object' || sec.live !== true) return null;
  const nodes = normalize(sec.nodes);
  const level = Number.isInteger(sec.level) ? sec.level : 1;
  return {
    live: true, level, nodes,
    points: Number.isInteger(sec.points) ? sec.points : pointsAt(level),
    spent: Number.isInteger(sec.spent) ? sec.spent : pointsSpent(nodes),
    borrowed: Array.isArray(sec.borrowed) ? sec.borrowed.filter((m) => typeof m === 'string') : [],
    vowSlots: Number.isInteger(sec.vow_slots) ? sec.vow_slots : vowSlotsAt(level),
  };
}
