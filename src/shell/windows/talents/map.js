// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/talents/map.js — THE ROADS MAP: ITS SVG, PAINTED FROM THE CAMERA AND THE SERVER'S BUILD (lane/r-ui-roads).
//
// docs/design/redesign/18-roads-review-ux.md sections 3 to 6. The geometry is src/render/roads-layout.js's; the states are
// src/core/talent-route.js's, read from the server's `talents` section; the camera is ./camera.js's. Built ONCE per opening as one
// markup string (every country, road, stone and label), then painted in place:
//   pan    one transform on the world group (nothing else moves)
//   zoom   every stone's and road's place at the new scale, and the labels placed again (their size never changes)
//   state  each stone's class (is-locked, is-open, is-route, is-owned), the route's roads and the cost badge
// The tier is the svg's data-tier: roads.css shows each tier's stones, and only that tier's labels are placed.
//
// GESTURES (one listener set on the stage, made once per opening): a drag pans; the wheel and a pinch zoom about the pointer, snapping
// between tiers (camera.js stepScale); a tap selects the stone within TAP_PX (Country view: the country, flown to at Road view); a
// double press zooms one tier in; a hover previews the route (desktop). None of these is a server intent.
// ════════════════════════════════════════════════════════════════════════
import { TALENT_NODES, NODE_INDEX, PICK_KINDS } from '../../../data/talents.js';
import { ABILITIES } from '../../../data/abilities.js';
import { roadsLayout } from '../../../render/roads-layout.js';
import { optionsOf } from '../../../core/talents.js';
import { attr, cls, text } from '../../../render/paint.js';
import { escapeHtml as esc } from '../../../utils/dom.js';
import { t } from '../../../render/player-text.js';
import { markOf, bracketsOf, placeLabels, beside, MARK_R, BLOCKS } from './marks.js';
import { tierOf } from './camera.js';
import { FILTERS } from './find.js';

const TAP_PX = 22;
const NO_SET = Object.freeze(new Set());
const DRAG_PX = 5;
const r1 = (v) => Math.round(v * 10) / 10;

/* the label rows the map can show, built once: [{ id, text, cls, at: node id | {x, y}, tiers, pri, block, node? }] */
function labelRows(L) {
  const out = [];
  for (const c of L.countries) out.push({ id: 'c:' + c.id, text: t('talents.country_' + c.id), cls: 'rdl-country', at: c.label, tiers: ['country', 'road'], pri: 0, country: c.id });
  out.push({ id: 'havora', text: t('talents.havora'), cls: 'rdl-place', node: 'hearth', tiers: ['country', 'road', 'node'], pri: 0 });
  for (const n of TALENT_NODES) {
    if (n.kind === 'rank' && /\.r2$/.test(n.id) && ABILITIES[n.move]) out.push({ id: 'm:' + n.move, text: ABILITIES[n.move].n, cls: 'rdl-move', node: n.id, tiers: ['road', 'node'], pri: 2, move: n.move });
    else if (n.kind === 'vow') out.push({ id: 'v:' + n.id, text: n.n, cls: 'rdl-vow', node: n.id, tiers: ['country', 'road', 'node'], pri: 3 });
    else if (n.kind === 'waystone') out.push({ id: 'w:' + n.id, text: n.n, cls: 'rdl-way', node: n.id, tiers: ['node'], pri: 4 });
  }
  return out;
}

/* a pick node's signpost (Node view): its options on spokes toward the most open side, from the layout once */
function signposts(L) {
  const out = {};
  const near = TALENT_NODES.map((n) => [n.id, L.pos[n.id]]);
  for (const n of TALENT_NODES) {
    if (!PICK_KINDS.includes(n.kind) || n.kind === 'crossing') continue;
    const p = L.pos[n.id];
    let best = 0, bestRoom = -1;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, qx = p.x + Math.cos(a) * L.D * 0.9, qy = p.y + Math.sin(a) * L.D * 0.9;
      let room = Infinity;
      for (const [id, q] of near) if (id !== n.id) room = Math.min(room, Math.hypot(q.x - qx, q.y - qy));
      if (room > bestRoom + 0.01) { bestRoom = room; best = a; }
    }
    out[n.id] = best;
  }
  return out;
}

/** The map's skeleton: the whole map as one markup string (built once per opening). */
export function mapHtml() {
  const L = roadsLayout();
  const nodes = TALENT_NODES.map((n) => '<g class="rdm-n is-' + n.kind + ' is-locked" data-rd-node="' + esc(n.id) + '">' + markOf(n) + '</g>').join('');
  const edges = L.edges.map((e, i) => '<line class="rdm-e is-' + e.kind + '" data-rd-edge="' + i + '"/>').join('');
  const regions = L.countries.map((c) => '<polygon class="rdm-rg" data-rd-country="' + esc(c.id) + '"/>').join('');
  const opts = TALENT_NODES.filter((n) => PICK_KINDS.includes(n.kind) && n.kind !== 'crossing').map((n) => '<g class="rdm-post" data-rd-post="' + esc(n.id) + '">'
    + optionsOf(n).map((o) => '<line class="rdm-spoke"/><circle class="rdm-opt" r="6" data-rd-opt="' + esc(o.id) + '"/>').join('') + '</g>').join('');
  const labels = labelRows(L).map((r) => '<text class="rdl ' + r.cls + '" data-rd-label="' + esc(r.id) + '">' + esc(r.text)
    + (r.country ? '<tspan class="rdl-count" dy="1.25em"></tspan>' : '') + '</text>').join('')
    + TALENT_NODES.filter((n) => PICK_KINDS.includes(n.kind) && n.kind !== 'crossing').flatMap((n) => optionsOf(n).map((o) => '<text class="rdl rdl-opt" data-rd-label="' + esc('o:' + n.id + ':' + o.id) + '">' + esc(o.n) + '</text>')).join('');
  /* the stage takes the keys (find.js): an arrow picks the nearest stone that way, Enter takes it, Escape lets go, + and - zoom */
  return '<div class="rdw-stage" data-rd-stage tabindex="0" data-hs-act="rd-keys">'
    + '<svg class="rdm" data-tier="road" role="img" aria-label="' + esc(t('talents.map')) + '"><g class="rdm-world">'
    + '<g class="rdm-regions"><circle class="rdm-heart" cx="0" cy="0"/>' + regions + '</g>'
    + '<g class="rdm-edges">' + edges + '</g><g class="rdm-nodes">' + nodes + '</g><g class="rdm-posts">' + opts + '</g>'
    + '<g class="rdm-sel" hidden>' + bracketsOf(11) + '</g>'
    + '<g class="rdm-labels">' + labels + '</g>'
    + '<g class="rdm-badge" hidden><rect x="0" y="-11" height="20" rx="0"/><text x="0" y="4"></text></g>'
    + '</g></svg></div>';
}

/* ── the painted map, found once per stage ── */
const MAPS = new WeakMap();
/** The map object of a stage built by mapHtml (its elements indexed once). */
export function mapOf(stage) {
  let M = MAPS.get(stage);
  if (M) return M;
  const L = roadsLayout();
  const svg = stage.querySelector('svg.rdm');
  M = { stage, svg, L, world: svg.querySelector('.rdm-world'), heart: svg.querySelector('.rdm-heart'), s: null, key: 0, labelKey: null, states: null, routeKey: null, pick: null,
    nodes: {}, edges: [], regions: {}, posts: {}, labels: {}, rows: labelRows(L), widths: {}, spoke: signposts(L),
    sel: svg.querySelector('.rdm-sel'), badge: svg.querySelector('.rdm-badge') };
  for (const g of svg.querySelectorAll('[data-rd-node]')) M.nodes[g.getAttribute('data-rd-node')] = g;
  for (const e of svg.querySelectorAll('[data-rd-edge]')) M.edges[Number(e.getAttribute('data-rd-edge'))] = e;
  for (const p of svg.querySelectorAll('[data-rd-country]')) M.regions[p.getAttribute('data-rd-country')] = p;
  for (const p of svg.querySelectorAll('[data-rd-post]')) M.posts[p.getAttribute('data-rd-post')] = p;
  for (const x of svg.querySelectorAll('[data-rd-label]')) M.labels[x.getAttribute('data-rd-label')] = x;
  MAPS.set(stage, M);
  return M;
}

/* a label's width in px, measured once (its size never changes with the zoom) */
function widthOf(M, id) {
  if (M.widths[id] !== undefined) return M.widths[id];
  const el = M.labels[id];
  let w = 0;
  try { w = el && typeof el.getComputedTextLength === 'function' ? el.getComputedTextLength() : 0; } catch (e) { w = 0; }
  if (!w) w = ((el && el.textContent) || '').length * 7.6;
  else if (!id.startsWith('c:')) M.widths[id] = w;   // a country's name changes size with the tier: measured each time
  return w;
}

/** Pan only: the world group's one transform. */
export function panMap(M, cam, w, h) {
  attr(M.world, 'transform', 'translate(' + r1(w / 2 - cam.cx * cam.s) + ',' + r1(h / 2 - cam.cy * cam.s) + ')');
}

/* every place at scale s (only when the scale moved) */
function placeAll(M, s) {
  const { L } = M;
  for (const [id, g] of Object.entries(M.nodes)) { const p = L.pos[id]; attr(g, 'transform', 'translate(' + r1(p.x * s) + ',' + r1(p.y * s) + ')'); }
  L.edges.forEach((e, i) => {
    const a = L.pos[e.from], b = L.pos[e.to], el = M.edges[i];
    attr(el, 'x1', r1(a.x * s)); attr(el, 'y1', r1(a.y * s)); attr(el, 'x2', r1(b.x * s)); attr(el, 'y2', r1(b.y * s));
  });
  for (const c of L.countries) attr(M.regions[c.id], 'points', c.poly.map(([x, y]) => r1(x * s) + ',' + r1(y * s)).join(' '));
  attr(M.heart, 'r', r1(L.heart.r * s));
  for (const [id, g] of Object.entries(M.posts)) {
    const p = L.pos[id], a0 = M.spoke[id];
    const opts = g.querySelectorAll('.rdm-opt'), spokes = g.querySelectorAll('.rdm-spoke');
    opts.forEach((o, k) => {
      const a = a0 + (k - (opts.length - 1) / 2) * 0.62, ox = p.x * s + Math.cos(a) * 40, oy = p.y * s + Math.sin(a) * 40;
      attr(o, 'cx', r1(ox)); attr(o, 'cy', r1(oy));
      const sp = spokes[k];
      attr(sp, 'x1', r1(p.x * s + Math.cos(a) * 11)); attr(sp, 'y1', r1(p.y * s + Math.sin(a) * 11)); attr(sp, 'x2', r1(ox - Math.cos(a) * 6)); attr(sp, 'y2', r1(oy - Math.sin(a) * 6));
    });
  }
}

/**
 * PAINT THE MAP. `v`: { cam, w, h, states: {id: state}, route: null | { path, cost, id }, sel: id | null, counts: {country: [owned, total]},
 * planned: Set of the plan's stones not held (plan.js), filters: Set of find.js FILTERS keys }.
 * Writes only what changed (src/render/paint.js).
 */
export function paintMap(M, v) {
  const { cam, w, h } = v;
  const tier = tierOf(cam.s);
  attr(M.svg, 'width', w); attr(M.svg, 'height', h); attr(M.svg, 'viewBox', '0 0 ' + w + ' ' + h);
  attr(M.svg, 'data-tier', tier);
  if (M.s !== cam.s) { placeAll(M, cam.s); M.s = cam.s; M.labelKey = null; }
  panMap(M, cam, w, h);
  const onRoute = new Set(v.route ? v.route.path : []);
  /* the states object is replaced whole by each server section (index.js memoOf), so its identity, the route's stones and the pick are
     the key: an unchanged display tick writes nothing and builds no string of 299 states */
  const routeKey = v.route ? v.route.path.join() : '';
  /* the filters (find.js FILTERS): the svg's classes, roads.css dims every other kind */
  const filters = v.filters || NO_SET;
  cls(M.svg, 'is-filtered', filters.size > 0);
  for (const f of Object.keys(FILTERS)) cls(M.svg, 'is-f-' + f, filters.has(f));
  /* the plan's stones (plan.js, the server's saved build) the hero does not hold: a stone on the route preview shows the preview */
  const planned = v.planned || NO_SET;
  if (v.states !== M.states || routeKey !== M.routeKey || v.sel !== M.pick || planned !== M.planned) {
    M.states = v.states; M.routeKey = routeKey; M.pick = v.sel; M.planned = planned; M.key = (M.key || 0) + 1; M.labelKey = null;
    for (const [id, g] of Object.entries(M.nodes)) {
      const st = onRoute.has(id) ? 'route' : (v.states[id] || 'locked');
      for (const s of ['locked', 'open', 'route', 'owned']) cls(g, 'is-' + s, s === st);
      cls(g, 'is-plan', planned.has(id) && st !== 'route');
      cls(g, 'is-sel', id === v.sel);
    }
    M.L.edges.forEach((e, i) => {
      const el = M.edges[i];
      const ownA = v.states[e.from] === 'owned', ownB = v.states[e.to] === 'owned';
      cls(el, 'is-owned', ownA && ownB);
      cls(el, 'is-route', onRoute.has(e.to) && (ownA || onRoute.has(e.from)));
      cls(el, 'is-plan', planned.has(e.to) && (ownA || planned.has(e.from)));
    });
    for (const [id, g] of Object.entries(M.posts)) {
      const pick = v.picks && v.picks[id];
      cls(g, 'is-sel', id === v.sel);
      for (const o of g.querySelectorAll('.rdm-opt')) { const oid = o.getAttribute('data-rd-opt'); cls(o, 'is-owned', pick === oid); cls(o, 'is-passed', !!pick && pick !== oid); }
    }
  }
  /* the selection's brackets and the route's cost badge, at the stone's screen place */
  const at = (id) => { const p = M.L.pos[id]; return { x: p.x * cam.s, y: p.y * cam.s }; };
  if (v.sel && M.L.pos[v.sel]) {
    const p = at(v.sel), r = MARK_R[NODE_INDEX[v.sel].kind] || 8;
    attr(M.sel, 'transform', 'translate(' + r1(p.x) + ',' + r1(p.y) + ') scale(' + r1((r + 5) / 16) + ')');
    attr(M.sel, 'hidden', null);
  } else attr(M.sel, 'hidden', '');
  const target = v.route && v.route.cost > 0 ? v.route.id : null;
  if (target) {
    const p = at(target), r = MARK_R[NODE_INDEX[target].kind] || 8;
    const label = String(v.route.cost);
    const bw = 10 + label.length * 9;
    attr(M.badge, 'transform', 'translate(' + r1(p.x + r + 4) + ',' + r1(p.y - r - 10) + ')');
    attr(M.badge.querySelector('rect'), 'width', bw);
    const tx = M.badge.querySelector('text');
    attr(tx, 'x', r1(bw / 2)); text(tx, label);
    attr(M.badge, 'hidden', null);
  } else attr(M.badge, 'hidden', '');
  paintLabels(M, v, tier);
}

function paintLabels(M, v, tier) {
  /* placed again when the scale, the tier or the states move (a pan moves the whole group); in Country view a pan too, since the
     countries' names are held on the stage */
  const key = tier + '|' + M.s + '|' + M.key + (tier === 'country' ? '|' + v.cam.cx + ',' + v.cam.cy + ',' + v.w + ',' + v.h : '');
  if (key === M.labelKey) return;
  M.labelKey = key;
  const s = M.s, L = M.L;
  const obstacles = [];
  for (const n of TALENT_NODES) {
    if (!BLOCKS.has(n.kind)) continue;
    if (tier === 'country' && n.kind === 'vow' && v.states[n.id] !== 'owned') continue;
    const p = L.pos[n.id], r = MARK_R[n.kind] + 2;
    obstacles.push([p.x * s - r, p.y * s - r, p.x * s + r, p.y * s + r]);
  }
  const want = [];
  for (const r of M.rows) {
    if (!r.tiers.includes(tier)) continue;
    if (tier === 'country' && r.id.startsWith('v:') && v.states[r.node] !== 'owned') continue;
    const el = M.labels[r.id];
    const owned = r.node ? v.states[r.node] === 'owned' || (r.move && v.states[r.move + '.r1'] === 'owned') : false;
    cls(el, 'is-owned', owned);
    cls(el, 'is-mark', tier !== 'country' && !!r.country);
    if (r.country) text(el.querySelector('.rdl-count'), tier === 'country' && v.counts ? t('talents.country_count', { owned: v.counts[r.country][0], total: v.counts[r.country][1] }) : '');
    /* a country's name stands mid-wedge: over its stones in Country view (the overview's one name), a faint watermark in Road view */
    const big = !!r.country && tier === 'country';
    const p = r.node ? L.pos[r.node] : r.at;
    const kr = r.node ? (MARK_R[NODE_INDEX[r.node].kind] || 6) : 0;
    const tries = r.country ? (big ? [0, 1, -1, 2, -2].map((k) => [0, k * 26, 'middle']) : [[0, 0, 'middle']])
      : r.id === 'havora' ? [[0, 44, 'middle']] : beside(kr);
    want.push({ id: r.id, x: p.x * s, y: p.y * s, w: widthOf(M, r.id), h: big ? 26 : 16, tries, pri: (owned ? r.pri - 0.5 : r.pri),
      block: !(r.country && !big), force: big || r.id === 'havora' });
  }
  if (tier === 'node') {
    for (const [id, g] of Object.entries(M.posts)) {
      for (const o of g.querySelectorAll('.rdm-opt')) {
        const lid = 'o:' + id + ':' + o.getAttribute('data-rd-opt');
        const cx = Number(o.getAttribute('cx')), cy = Number(o.getAttribute('cy'));
        obstacles.push([cx - 7, cy - 7, cx + 7, cy + 7]);
        want.push({ id: lid, x: cx, y: cy, w: widthOf(M, lid), h: 16, tries: beside(6), pri: id === v.sel ? 1 : 5 });
      }
    }
  }
  const got = placeLabels(want, obstacles);
  /* a country's name past the rim stays on the stage (Country view fits the stones, and a name is wider than the gap it stands in) */
  const tx = v.w / 2 - v.cam.cx * s, ty = v.h / 2 - v.cam.cy * s;
  for (const L of want) {
    const spot = got[L.id];
    if (!spot || !L.force || !L.id.startsWith('c:')) continue;
    const x0 = spot[2] === 'middle' ? spot[0] - L.w / 2 : spot[2] === 'end' ? spot[0] - L.w : spot[0];
    const dx = Math.max(0, 6 - (x0 + tx)) - Math.max(0, x0 + L.w + tx - (v.w - 6));
    const dy = Math.max(0, L.h + 2 - (spot[1] + ty)) - Math.max(0, spot[1] + 22 + ty - v.h);
    got[L.id] = [spot[0] + dx, spot[1] + dy, spot[2]];
  }
  for (const [id, el] of Object.entries(M.labels)) {
    const spot = got[id];
    if (!spot) { attr(el, 'hidden', ''); continue; }
    attr(el, 'hidden', null);
    attr(el, 'x', r1(spot[0])); attr(el, 'y', r1(spot[1])); attr(el, 'text-anchor', spot[2]);
    const sub = el.querySelector('.rdl-count');
    if (sub) attr(sub, 'x', r1(spot[0]));  }
}

/** The stone nearest screen point (sx, sy) within TAP_PX at this tier, or null (Country view: none, a tap there picks a country). */
export function nodeAt(M, cam, w, h, sx, sy) {
  const tier = tierOf(cam.s);
  if (tier === 'country') return null;
  let best = null, bd = TAP_PX;
  for (const n of TALENT_NODES) {
    const p = M.L.pos[n.id];
    const d = Math.hypot((p.x - cam.cx) * cam.s + w / 2 - sx, (p.y - cam.cy) * cam.s + h / 2 - sy);
    if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}

/** The country whose wedge holds map point (x, y), or null (the yard). */
export function countryAt(M, x, y) {
  if (Math.hypot(x, y) < M.L.heart.r) return null;
  const a = Math.atan2(y, x);
  for (const c of M.L.countries) {
    for (const k of [-1, 0, 1]) { const b = a + k * Math.PI * 2; if (b >= c.a0 && b < c.a1) return c; }
  }
  return null;
}

/**
 * THE GESTURES on `stage` (once per opening): `on` = { pan(dx, dy), zoom(factor, sx, sy), tap(sx, sy), dbl(sx, sy), hover(sx, sy | null) },
 * every point in stage px.
 */
export function bindGestures(stage, on) {
  if (stage.hasAttribute('data-rd-bound')) return;
  stage.setAttribute('data-rd-bound', '');
  const pts = new Map();
  let moved = false, lastTap = 0, pinch = null;
  const local = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    pts.set(e.pointerId, local(e));
    moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer has no capture */ }
  });
  stage.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') on.hover(p.x, p.y); return; }
    const was = pts.get(e.pointerId);
    pts.set(e.pointerId, p);
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0 && Math.abs(d - pinch) > 2) { on.zoom(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch = d; moved = true; }
      return;
    }
    if (!moved && Math.hypot(p.x - was.x, p.y - was.y) < DRAG_PX) { pts.set(e.pointerId, was); return; }
    moved = true;
    on.pan(p.x - was.x, p.y - was.y);
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (moved || e.type === 'pointercancel' || pts.size) return;
    const now = Date.now();
    if (now - lastTap < 320) { lastTap = 0; on.dbl(p.x, p.y); return; }
    lastTap = now;
    on.tap(p.x, p.y);
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pts.size) on.hover(null, null); });
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    on.zoom(Math.exp(-dy * 0.0015), p.x, p.y);
  }, { passive: false });
}
