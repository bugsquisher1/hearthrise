// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/talents/find.js — THE ROADS' WAYS TO A STONE: FIND TALENT, THE FILTERS, AND THE KEYS (lane/r-ui-roads-2, 2026-11-26).
//
// docs/design/redesign/18-roads-review-ux.md section 3: "Find talent searches node, option and vow names, then pans to the result and
// selects it"; "Filters (Vows, Crossroads, Towns) brighten their kind and dim everything else to 35%, at any tier". And the keys: an
// arrow picks the nearest stone that way, Enter takes the picked stone when its Take is on, Escape lets go of it, + and - change the
// tier. All of it is display scratch: none of these is a server intent (a Take by Enter is the card's own press).
//   findTalents(q)         up to FIND_MAX rows { id, label, sub } for the words typed, best first
//   FILTERS                the filters and the node kinds each brightens
//   stoneToward(pos, from, dx, dy)   the nearest stone from `from` in screen direction (dx, dy), or null
// PURE but for the words (src/render/player-text.js): no DOM.
// ════════════════════════════════════════════════════════════════════════
import { TALENT_NODES, PICK_KINDS, COUNTRY_ROADS } from '../../../data/talents.js';
import { ABILITIES } from '../../../data/abilities.js';
import { optionsOf } from '../../../core/talents.js';
import { t } from '../../../render/player-text.js';

export const FIND_MAX = 8;

/** The filters, each brightening its kinds (a crossroads, its hybrid and the Havora crossing are all choices; a town is a border town). */
export const FILTERS = Object.freeze({
  vow: Object.freeze(['vow']),
  crossroads: Object.freeze(['crossroads', 'hybrid', 'crossing']),
  town: Object.freeze(['border']),
});

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/* THE INDEX, built once: each move's road (found at its first stone), each named stone (a rank stone and an open road are named by their
   move, so its road row stands for them), and each choice's options (found at their stone) */
let INDEX = null;
function indexOf() {
  if (INDEX) return INDEX;
  const out = [];
  for (const moves of Object.values(COUNTRY_ROADS)) for (const m of moves) {
    if (own(ABILITIES, m) && TALENT_NODES.some((n) => n.id === m + '.r1')) out.push({ id: m + '.r1', label: ABILITIES[m].n, sub: t('talents.find_road') });
  }
  /* a stone on a move's road is said with its move ("Crossroads I", Challenge), any other with its kind */
  const whose = (n) => (n.move && own(ABILITIES, n.move) ? ABILITIES[n.move].n : t('talents.kind_' + n.kind));
  for (const n of TALENT_NODES) {
    if (n.kind === 'start' || n.kind === 'rank' || n.kind === 'open') continue;
    out.push({ id: n.id, label: n.n, sub: whose(n) });
    if (PICK_KINDS.includes(n.kind) && n.kind !== 'crossing') for (const o of optionsOf(n)) out.push({ id: n.id, label: o.n, sub: n.move && own(ABILITIES, n.move) ? ABILITIES[n.move].n : n.n });
  }
  INDEX = out.map((r) => ({ ...r, low: String(r.label).toLowerCase() }));
  return INDEX;
}

/** The rows for the words `q`: a name that starts with them, then one with a word that does, then one that holds them; shorter first. */
export function findTalents(q) {
  const s = String(q || '').trim().toLowerCase();
  if (s.length < 2) return [];
  const scored = [];
  const seen = new Set();
  for (const r of indexOf()) {
    const at = r.low.indexOf(s);
    if (at < 0) continue;
    const key = r.id + '|' + r.low;
    if (seen.has(key)) continue;
    seen.add(key);
    const score = at === 0 ? 0 : /\s|-/.test(r.low.charAt(at - 1)) ? 1 : 2;
    scored.push({ r, score });
  }
  scored.sort((a, b) => a.score - b.score || a.r.label.length - b.r.label.length || (a.r.label < b.r.label ? -1 : a.r.label > b.r.label ? 1 : 0));
  return scored.slice(0, FIND_MAX).map(({ r }) => ({ id: r.id, label: r.label, sub: r.sub }));
}

/**
 * THE NEAREST STONE FROM `from` TOWARD (dx, dy) (an arrow key's way, in screen and so in map axes: the map scales evenly): inside a cone
 * of about 50 degrees either side, the one nearest along the way with a sideways step costing double; null when there is none.
 */
export function stoneToward(pos, from, dx, dy) {
  const p = pos[from];
  if (!p) return null;
  let best = null, bs = Infinity;
  for (const n of TALENT_NODES) {
    if (n.id === from) continue;
    const q = pos[n.id];
    if (!q) continue;
    const vx = q.x - p.x, vy = q.y - p.y;
    const along = vx * dx + vy * dy;
    if (along <= 0) continue;
    const across = Math.abs(vx * dy - vy * dx);
    if (across > along * 1.2) continue;
    const s = along + across * 2;
    if (s < bs) { bs = s; best = n.id; }
  }
  return best;
}
