// ============================================================
// src/core/talent-route.js — THE ROADS' GRAPH FOR THE MAP: every node's state on a build, and the ROUTE to any node with its cost
// (systems, lane/r-ui-roads, 2026-11-26; docs/design/redesign/18-roads-review-ux.md sections 4 and 5, 17-talent-tree.md v3 section 2).
//
// DISPLAY ONLY. The map previews where a point can go and what a far node costs, from catalogue data, with no server call (18 section 9:
// "the node graph with edges, shortest path and gates as data"). Nothing here spends: every spend is one server intent
// (src/session/talent-intents.js), checked by hr_talent_spend against the same catalogue. The build read here is always the server's
// (the `talents` section), so a state shown is the server's state.
//
//   nodeStates(nodes, level)       { id: 'owned' | 'open' | 'locked' } for every node (18 section 4's states; 'route' is the view's)
//   routeTo(nodes, level, id, left) the cheapest set of unowned nodes that makes `id` buyable and buys it, in buying order, with its cost,
//                                   the Level it is reached at, what lies on the way and what it still needs
//   nextSuggested(nodes, disc, plan) the first node of the suggested road the build does not own (where the map opens)
//
// THE GRAPH IS A TREE GROWN OUT OF THE START (src/data/talents.js validate: every `after` names an earlier row), so one forward pass over
// TALENT_NODES finds every node's cheapest way in. A border town touches two roads (ANY owned one opens it), and a hybrid needs a
// crossroads in both of its countries (`needs.crossroadsIn`): its route adds the cheapest crossroads of a country it lacks.
//
// PURE ESM. No DOM, no clock.
// ============================================================

import { TALENT_NODES, NODE_INDEX, PICK_KINDS, TALENT_RULES } from '../data/talents.js';
import { spendProblem, optionsOf, suggestedOrder, normalize, vowSlotsAt } from './talents.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const owns = (nodes, id) => id === 'hearth' || own(nodes, id);

/* the problems that do not stop a node being the frontier: it is where the next point can go once there is one */
const FRONTIER_OK = new Set([null, 'no_points']);

/**
 * WHY a node cannot be bought now, the points aside: the first option's problem that is not `no_points`, or null when some option
 * (a plain node: the node) passes. `owned` for an owned node (an open road is never `owned`: it takes more).
 */
function frontierProblem(nodes, id, level) {
  const n = own(NODE_INDEX, id) ? NODE_INDEX[id] : null;
  if (!n) return 'unknown_node';
  if (n.kind === 'start') return 'owned';
  const picks = PICK_KINDS.includes(n.kind) ? optionsOf(n).map((o) => o.id) : [null];
  let first = null;
  for (const p of picks) {
    const why = spendProblem(nodes, id, p, level);
    if (FRONTIER_OK.has(why)) return null;
    if (first === null) first = why;
  }
  return first || 'bad_pick';
}

/**
 * EVERY NODE'S STATE on build `nodes` (the server's) at Level `level` (18 section 4): 'owned' (held; the start always, an open road
 * with a point), 'open' (touches an owned node and no rule but the points refuses it: the frontier), 'locked' (everything else).
 * @returns {Record<string, 'owned'|'open'|'locked'>}
 */
export function nodeStates(nodesIn, level) {
  const nodes = normalize(nodesIn);
  /** @type {Record<string, 'owned'|'open'|'locked'>} */
  const out = {};
  for (const n of TALENT_NODES) {
    if (owns(nodes, n.id)) { out[n.id] = 'owned'; continue; }
    out[n.id] = frontierProblem(nodes, n.id, level) === null ? 'open' : 'locked';
  }
  return out;
}

/* the cheapest way into every node from what the build owns: cost[id] (0 owned) and the parent it came through */
function ways(nodes) {
  const cost = {}, via = {};
  for (const n of TALENT_NODES) {
    if (owns(nodes, n.id)) { cost[n.id] = 0; via[n.id] = null; continue; }
    let best = Infinity, from = null;
    for (const a of n.after) if (own(cost, a) && cost[a] < best) { best = cost[a]; from = a; }
    cost[n.id] = best + 1;
    via[n.id] = from;
  }
  return { cost, via };
}
/* the unowned nodes from the build out to `id`, in buying order */
function pathTo(w, nodes, id) {
  const out = [];
  for (let k = id; k && !owns(nodes, k); k = w.via[k]) out.unshift(k);
  return out;
}
/* a node every option of which lends a move (a border town, the crossing), and the moves a build borrows */
const lendsMove = (o) => !!o && o.effects.some((e) => e.kind === 'borrow');
const lends = (n) => optionsOf(n).length > 0 && optionsOf(n).every(lendsMove);
const borrowsHeld = (nodes) => Object.entries(nodes).filter(([k, v]) => own(NODE_INDEX, k) && lendsMove(optionsOf(NODE_INDEX[k]).find((o) => o.id === v))).length;
const crossroadsIn = (nodes, country) => Object.keys(nodes).some((k) => own(NODE_INDEX, k) && NODE_INDEX[k].kind === 'crossroads' && NODE_INDEX[k].country === country);

/**
 * THE ROUTE to node `id` on build `nodes` (the server's) at Level `level` with `left` points unspent (18 section 5): the cheapest set
 * of unowned nodes that ends with `id` bought, null for an unknown node or the start.
 *   path      node ids in buying order (`id` last); a needed crossroads' road first
 *   cost      points (an open road the build holds already: 1, its next point)
 *   reachAt   the Level it is all bought at: the points the route needs past `left` are one a Level, and a vow waits for its slot
 *   ranks / picks / ways   the rank stones, the choices (crossroads, towns, hybrids) and the waystones on the way, `id` not counted
 *   needs     [{ country, owned, cost }] a hybrid's crossroads in each of its countries
 *   gate      why `id` stays shut past the points and the path: 'vow_slots' (every vow slot is held), 'borrow_max', or null
 */
export function routeTo(nodesIn, level, id, left) {
  const n = own(NODE_INDEX, id) ? NODE_INDEX[id] : null;
  if (!n || n.kind === 'start') return null;
  const nodes = normalize(nodesIn);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const pts = Math.max(0, Math.floor(Number(left) || 0));
  if (n.kind === 'open' && own(nodes, id)) return { id, path: [id], cost: 1, reachAt: lv + Math.max(0, 1 - pts), ranks: 0, picks: 0, ways: 0, needs: [], gate: null };
  if (owns(nodes, id)) return { id, path: [], cost: 0, reachAt: lv, ranks: 0, picks: 0, ways: 0, needs: [], gate: null };
  const w = ways(nodes);
  const path = [];
  const needs = [];
  for (const c of (n.needs && n.needs.crossroadsIn) || []) {
    if (crossroadsIn(nodes, c)) { needs.push({ country: c, owned: true, cost: 0 }); continue; }
    let best = null;
    for (const k of TALENT_NODES) if (k.kind === 'crossroads' && k.country === c && (!best || w.cost[k.id] < w.cost[best])) best = k.id;
    const sub = best ? pathTo(w, nodes, best) : [];
    for (const k of sub) if (!path.includes(k)) path.push(k);
    needs.push({ country: c, owned: false, cost: sub.length });
  }
  for (const k of pathTo(w, nodes, id)) if (!path.includes(k)) path.push(k);
  const on = path.slice(0, -1).map((k) => NODE_INDEX[k].kind);
  const vows = Object.keys(nodes).filter((k) => own(NODE_INDEX, k) && NODE_INDEX[k].kind === 'vow').length + path.filter((k) => NODE_INDEX[k].kind === 'vow').length;
  let reachAt = lv + Math.max(0, path.length - pts);
  let gate = null;
  if (vows) {
    const slotAt = TALENT_RULES.vowSlots[vows - 1];
    if (slotAt === undefined) gate = 'vow_slots';
    else reachAt = Math.max(reachAt, slotAt);
  }
  /* a third borrowed move is refused whatever the Level: the card says so instead of a Level */
  if (!gate && lends(n) && borrowsHeld(nodes) >= TALENT_RULES.maxBorrowed) gate = 'borrow_max';
  return { id, path, cost: path.length, reachAt, ranks: on.filter((k) => k === 'rank').length,
    picks: on.filter((k) => PICK_KINDS.includes(k)).length, ways: on.filter((k) => k === 'waystone').length, needs, gate };
}

/** THE FIRST NODE OF THE SUGGESTED ROAD the build does not own (the map opens on it, 18 section 5: "open on where you are"), or null. */
export function nextSuggested(nodesIn, discipline, plan) {
  if (typeof discipline !== 'string') return null;
  const nodes = normalize(nodesIn);
  for (const [id] of suggestedOrder(discipline, plan)) if (!own(nodes, id)) return id;
  return null;
}

/** The vow slots open at `level` and the vows build `nodes` holds: { held, open }. */
export function vowsOf(nodesIn, level) {
  const nodes = normalize(nodesIn);
  return { held: Object.keys(nodes).filter((k) => own(NODE_INDEX, k) && NODE_INDEX[k].kind === 'vow').length, open: vowSlotsAt(level) };
}
