// ════════════════════════════════════════════════════════════════════════
// src/render/roads-layout.js — WHERE EVERY STONE OF THE ROADS STANDS ON THE MAP (systems, lane/r-ui-roads, 2026-11-26).
//
// docs/design/redesign/17-talent-tree.md section 1 (Havora in the middle, a country per weapon, roads out of the Great Hearth),
// 18-roads-review-ux.md sections 3, 4 and 9 (countries sized by node count: Restoration at about 2.5x the sketch's room, density held
// level across countries; trunks, move roads, side paths, vow roads and border roads). The art lane redraws the map over this
// geometry (20 section 4, A2); until then this is the map, and it is DERIVED from src/data/talents.js alone, so a new country, road
// or node is a data row and never a coordinate typed here (CLAUDE.md §1: grow content by adding rows).
//
// THE SHAPE (map units, D a road step):
//   Havora   the start at (0, 0), on a yard of radius HEART_R; the Great Hearth's own road (Mend) curls inside the yard in the widest gap
//            between two trunks, the Havora crossing beside the hearth in the second widest
//   country  a wedge round Havora, its angle in proportion to its nodes (plus PAD, so a small country still has room for its borders),
//            in COUNTRY_ROADS' order (the ring: each next country borders the one before, the last the first). Its roads run out from
//            the yard along the wedge's middle: road 0's 3 rank stones and crossroads I, then road 1's from that crossroads, and so on
//            (each road leaves the one before at its crossroads I, 17 section 2); each road's tail (2 rank stones, crossroads II and the
//            open road) bends off to one side, the sides alternating, its waystones beside it; the country's vows stand in a lane
//            beside its first road, on the side its first tail leaves free
//   border   a border town between its two countries' first crossroads, its hybrid crossroads and hybrid vow beyond it
//   then     a relaxation pass pushes apart any two stones nearer than MIN_GAP (deterministic, a fixed count of passes)
//
// roadsLayout() is computed once (memoized) and frozen: { D, pos, countries, edges, bounds, heart }.
//   pos[id]      { x, y }
//   countries[]  { id, a0, a1, mid, total, poly: [[x, y]...], label: { x, y } }   the wedge as a polygon, its name's place
//   edges[]      { from, to, kind: 'trunk' | 'road' | 'side' | 'vow' | 'border' }
//   bounds       { x0, y0, x1, y1 } every stone, padded
//   roadLabel[move]  { x, y, angle }   where a move's name sits: beside its road's second rank stone
// PURE: no DOM. Imported by the Talents window (src/shell/windows/talents/) and the layout test (tests/roads-window.mjs).
// ════════════════════════════════════════════════════════════════════════

import { TALENT_NODES, NODE_INDEX, COUNTRY_ROADS, HEARTH } from '../data/talents.js';

export const D = 44;
const HEART_R = 4.6 * D;
const ROAD_R0 = HEART_R + 0.9 * D;   // a country's first rank stone

const MIN_GAP = 0.68 * D;
const PASSES = 80;
const TAIL_LAT = 1.5 * D;
const VOW_LAT = 0.95 * D;

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const rot = (a, along, lat) => ({ x: Math.cos(a) * along - Math.sin(a) * lat, y: Math.sin(a) * along + Math.cos(a) * lat });
const TAU = Math.PI * 2;

/* the ring of countries, in COUNTRY_ROADS' order, the Great Hearth's own road kept for the yard */
const RING = Object.keys(COUNTRY_ROADS).filter((c) => c !== HEARTH);

/* A country's wedge is as wide as its nodes need at the density every country shares (18 P3: "a density of 4 to 6 nodes per 10k units
   for every country"): its area runs from the yard's rim out to its last road's end, which its roads' count sets (each road leaves the
   one before), so the angle is its nodes over that ring's area. No wedge is narrower than MIN_WEDGE, the room its two borders need. */
const MIN_WEDGE = (34 / 360) * Math.PI * 2;
const farOf = (c) => ROAD_R0 + 4 * D * Math.max(0, COUNTRY_ROADS[c].length - 1) + 7 * D;
function wedges() {
  const need = RING.map((c) => TALENT_NODES.filter((n) => n.country === c).length / (farOf(c) ** 2 - HEART_R ** 2));
  const sum = need.reduce((a, b) => a + b, 0);
  /* the floor first, the rest shared by need among the wedges above it */
  let share = need.map((v) => (v / sum) * TAU);
  for (let k = 0; k < RING.length; k++) {
    const low = share.map((s) => s < MIN_WEDGE);
    if (!low.some(Boolean)) break;
    const rest = TAU - low.filter(Boolean).length * MIN_WEDGE;
    const hi = need.reduce((a, v, i) => a + (low[i] ? 0 : v), 0);
    share = need.map((v, i) => (low[i] ? MIN_WEDGE : (v / hi) * rest));
  }
  const weight = share;
  const total = TAU;
  /* the ring starts at the top (12 o'clock) and runs clockwise (SVG y down) */
  let a = -Math.PI / 2 - (weight[0] / total) * Math.PI;
  return RING.map((c, i) => {
    const w = (weight[i] / total) * TAU;
    const out = { id: c, a0: a, a1: a + w, mid: a + w / 2, total: TALENT_NODES.filter((n) => n.country === c).length };
    a += w;
    return out;
  });
}

/* A move's road in its country's frame (angle `a`): its first stone at `along`, its tail to `side` (+1 / -1). */
function placeRoad(pos, move, a, along, side, step = D, scale = 1) {
  const at = (s, la, lt) => { const id = move + '.' + s; if (own(NODE_INDEX, id)) pos[id] = rot(a, along + la * step, lt * scale); };
  at('r1', 0, 0); at('r2', 1, 0); at('r3', 2, 0); at('x1', 3, 0);
  /* the tail bends off to `side`: two rank stones, crossroads II, the open road; its waystones beside it */
  const t = side * TAIL_LAT / D;
  at('r4', 3.85, t * 0.5 * D); at('r5', 4.7, t * D); at('x2', 5.55, t * D); at('open', 6.4, t * D);
  at('w1', 2.4, t * 0.55 * D); at('w2', 5.75, t * 0.5 * D);
  /* the axes' two more waystones (17 section 4): one by each crossroads, on the far side of the tail */
  at('w3', 1.6, t * 0.55 * D); at('w4', 5.55, t * 1.5 * D);
  return along + 3 * step;
}

function relax(pos, fixed) {
  const ids = Object.keys(pos);
  for (let p = 0; p < PASSES; p++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      const A = pos[ids[i]];
      for (let j = i + 1; j < ids.length; j++) {
        const B = pos[ids[j]];
        const dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy;
        if (d2 >= MIN_GAP * MIN_GAP) continue;
        const d = Math.sqrt(d2) || 0.01, push = (MIN_GAP - d) / 2 + 0.01;
        /* two stones on one spot part along a fixed direction (their order), so the pass is deterministic */
        const ux = d2 ? dx / d : 1, uy = d2 ? dy / d : 0;
        const fa = fixed.has(ids[i]), fb = fixed.has(ids[j]);
        if (!fa) { A.x -= ux * push * (fb ? 2 : 1); A.y -= uy * push * (fb ? 2 : 1); }
        if (!fb) { B.x += ux * push * (fa ? 2 : 1); B.y += uy * push * (fa ? 2 : 1); }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function edgeKind(n, parent) {
  if (n.kind === 'vow') return n.countries ? 'border' : 'vow';
  if (n.kind === 'border' || n.kind === 'hybrid') return 'border';
  if (n.kind === 'waystone' || n.kind === 'open') return 'side';
  if (parent === 'hearth' && n.country !== HEARTH) return 'trunk';
  return 'road';
}

function build() {
  const pos = { hearth: { x: 0, y: 0 } };
  const countries = wedges();
  /* the yard's gaps between trunks, widest first: Mend's road takes the widest, the crossing the next */
  const gaps = countries.map((c, i) => { const nx = countries[(i + 1) % countries.length]; let g = nx.mid - c.mid; if (g <= 0) g += TAU; return { at: c.mid + g / 2, g }; })
    .sort((a, b) => b.g - a.g || a.at - b.at);
  for (const m of COUNTRY_ROADS[HEARTH] || []) placeRoad(pos, m, gaps[0].at, 0.95 * D, 1, 0.58 * D, 0.5);
  if (own(NODE_INDEX, 'havora')) pos.havora = rot(gaps[1 % gaps.length].at, 1.5 * D, 0);
  for (const c of countries) {
    let along = ROAD_R0;
    const roads = COUNTRY_ROADS[c.id];
    roads.forEach((m, i) => { const next = placeRoad(pos, m, c.mid, along, i % 2 ? -1 : 1); along = next + D; });
    /* the vows of the country (beside its first crossroads): a lane by its first road, on the side its tail leaves free */
    const vows = TALENT_NODES.filter((n) => n.kind === 'vow' && n.country === c.id);
    vows.forEach((v, k) => { pos[v.id] = rot(c.mid, ROAD_R0 - 0.2 * D + k * 0.8 * D, -VOW_LAT); });
  }
  /* borders: the town between the two first crossroads, pushed out past them; the hybrid and the vow beyond */
  for (const n of TALENT_NODES) {
    if (n.kind !== 'border') continue;
    const [a, b] = n.after.map((k) => pos[k]);
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, r = Math.hypot(mx, my) || 1;
    const out = Math.max(Math.hypot(a.x, a.y), Math.hypot(b.x, b.y)) + 1.1 * D;
    const ux = mx / r, uy = my / r;
    const chain = [n.id, ...TALENT_NODES.filter((k) => k.countries && k.after.length === 1 && (k.after[0] === n.id || NODE_INDEX[k.after[0]].after[0] === n.id)).map((k) => k.id)];
    chain.forEach((id, k) => { pos[id] = { x: ux * (out + k * 0.95 * D), y: uy * (out + k * 0.95 * D) }; });
  }
  /* anything a new kind of row adds without a place here still stands: beside the node it leaves */
  for (const n of TALENT_NODES) if (!pos[n.id]) { const p = pos[n.after[0]] || { x: 0, y: 0 }; pos[n.id] = { x: p.x + 0.7 * D, y: p.y + 0.7 * D }; }
  relax(pos, new Set(['hearth']));
  for (const id of Object.keys(pos)) pos[id] = Object.freeze({ x: Math.round(pos[id].x * 10) / 10, y: Math.round(pos[id].y * 10) / 10 });

  const edges = [];
  for (const n of TALENT_NODES) for (const a of n.after) edges.push(Object.freeze({ from: a, to: n.id, kind: edgeKind(n, a) }));

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of Object.values(pos)) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const padB = 1.4 * D;
  const bounds = Object.freeze({ x0: x0 - padB, y0: y0 - padB, x1: x1 + padB, y1: y1 + padB });

  /* each country's wedge as a polygon from the yard's rim out past its farthest stone, and its name's place */
  const out = countries.map((c) => {
    const mine = TALENT_NODES.filter((n) => n.country === c.id || (n.countries && n.countries[0] === c.id)).map((n) => pos[n.id]);
    const far = Math.max(...mine.map((p) => Math.hypot(p.x, p.y))) + 1.2 * D;
    const poly = [];
    const steps = Math.max(4, Math.ceil((c.a1 - c.a0) / (TAU / 72)));
    for (let i = 0; i <= steps; i++) { const a = c.a0 + ((c.a1 - c.a0) * i) / steps; poly.push([Math.round(Math.cos(a) * HEART_R), Math.round(Math.sin(a) * HEART_R)]); }
    for (let i = steps; i >= 0; i--) { const a = c.a0 + ((c.a1 - c.a0) * i) / steps; poly.push([Math.round(Math.cos(a) * far), Math.round(Math.sin(a) * far)]); }
    const lr = (HEART_R + far) / 2;
    return Object.freeze({ ...c, far, poly: Object.freeze(poly), label: Object.freeze({ x: Math.round(Math.cos(c.mid) * lr), y: Math.round(Math.sin(c.mid) * lr) }) });
  });

  /* a move's name: beside its road's second rank stone, on the side away from its tail */
  const roadLabel = {};
  for (const n of TALENT_NODES) if (n.kind === 'rank' && /\.r2$/.test(n.id)) roadLabel[n.move] = Object.freeze({ x: pos[n.id].x, y: pos[n.id].y });

  return Object.freeze({ D, heart: Object.freeze({ r: HEART_R }), pos: Object.freeze(pos), countries: Object.freeze(out), edges: Object.freeze(edges),
    bounds, roadLabel: Object.freeze(roadLabel) });
}

let MEMO = null;
/** THE MAP (computed once). */
export function roadsLayout() { return MEMO || (MEMO = build()); }

/** Points a country's area holds per 10,000 square map units (18 section 1 P3: the density the layout keeps level). */
export function densityOf(country) {
  const p = country.poly;
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return (country.total / (Math.abs(a) / 2)) * 10000;
}
