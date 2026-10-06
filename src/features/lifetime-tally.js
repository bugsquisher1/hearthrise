// src/features/lifetime-tally.js — THE REALM'S LIFETIME COUNTS, OBSERVED.
//
// The server keeps a permanent `stat` row per lifetime count (hr_state_of
// `progress`, kind 'stat', period '') and sends them on every envelope, plus
// `state.deaths_lifetime` and the claimed quest rows. This module folds them
// into ONE module cache and publishes window.HearthriseLifetime, which the Hero
// card, the Account grid, Lifetime Stats, the welcome card and the combat bar
// read. It writes nothing into G and nothing into the residue (CLAUDE.md §6):
// a count the realm has not stated yet is UNKNOWN and renders the pending dash,
// never 0.
//
// Fed by src/net/accrue.js (every applied envelope) and src/net/record.js (the
// boot hydrate). Guarded by tests/lifetime-tally.mjs (TALLY-6 folds fixtures
// through `fold`, the only export) and the TALLY-A/B in-page tests.

import { LIFETIME_KEYS, LIFETIME_LORE } from '../data/lifetime-tally.js?v=563';
import { isCompleteProgressStatement } from '../net/property-record.js?v=563';
import { MONSTER_CLASSES } from '../core/bane.js?v=563';

const fin = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/**
 * ONE ENVELOPE OVER THE LAST VIEW, pure. A view is
 * `{slot, version, counts: {key: {n, exact}}, quests: {n, exact} | null}`; an
 * absent key is UNKNOWN. `exact:false` is a floor: a truncated statement that
 * did not carry the row cannot say the count is lower than what was seen.
 */
export function fold(prev, res, questIds) {
  if (!res || typeof res !== 'object') return prev;
  const st = (res.state && typeof res.state === 'object') ? res.state : null;
  let base = prev || null;
  if (base && st && fin(st.slot) && fin(base.slot) && Number(st.slot) !== Number(base.slot)) base = null;
  if (base && fin(res.version) && fin(base.version) && Number(res.version) < Number(base.version)) return base;
  const hasProgress = Array.isArray(res.progress);
  const deaths = (st && own(st, 'deaths_lifetime') && fin(st.deaths_lifetime)) ? Math.floor(Number(st.deaths_lifetime)) : null;
  if (!hasProgress && deaths === null) return base;

  const next = {
    slot: (st && fin(st.slot)) ? Number(st.slot) : (base ? base.slot : null),
    version: fin(res.version) ? Number(res.version) : (base ? base.version : null),
    counts: Object.assign({}, base && base.counts),
    quests: base ? base.quests : null,
  };
  if (hasProgress) {
    const complete = isCompleteProgressStatement(res);
    const rows = new Map();
    const ids = new Set(Array.isArray(questIds) ? questIds : []);
    let claimed = 0;
    for (const r of res.progress) {
      if (!r || r.period !== '') continue;
      if (r.kind === 'quest' && r.state === 'claimed' && ids.has(r.key)) claimed++;
      if (r.kind !== 'stat' || !fin(r.value) || Number(r.value) < 0) continue;
      rows.set(r.key, Math.floor(Number(r.value)));
    }
    for (const key of LIFETIME_KEYS) {
      const was = next.counts[key];
      if (rows.has(key)) {
        const v = rows.get(key);
        next.counts[key] = complete ? { n: v, exact: true }
          : { n: Math.max(was ? was.n : 0, v), exact: v >= (was ? was.n : 0) };
      } else if (complete) next.counts[key] = { n: 0, exact: true };
      else if (was) next.counts[key] = { n: was.n, exact: false };
    }
    const q = next.quests;
    next.quests = complete ? { n: claimed, exact: true } : { n: Math.max(q ? q.n : 0, claimed), exact: false };
  }
  if (deaths !== null) next.counts.deaths = { n: deaths, exact: true };
  return next;
}

let view = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pending = () => {
  const B = window.HearthriseBalance;
  return (B && typeof B.countMarkup === 'function') ? B.countMarkup(null) : '—';
};
const questDefs = () => (Array.isArray(window.QUEST_DEFS) ? window.QUEST_DEFS : []);

function noteEnvelope(res) {
  try {
    const next = fold(view, res, questDefs().map((q) => q && q.id));
    const mode = next === view ? 'absent' : (isCompleteProgressStatement(res) ? 'complete' : 'partial');
    view = next;
    return { mode, keys: view ? Object.keys(view.counts).length : 0 };
  } catch (e) {
    return { mode: 'error', keys: 0 };
  }
}

function count(key, from) {
  const v = from === undefined ? view : from;
  const c = v && v.counts && v.counts[key];
  return c ? { n: c.n, exact: c.exact } : null;
}

function quests(from) {
  const v = from === undefined ? view : from;
  return (v && v.quests) ? { n: v.quests.n, exact: v.quests.exact, of: questDefs().length } : null;
}

/** A count as markup: the figure, a floor with '+', or the pending dash. */
function markup(key, fmt, from) {
  const f = typeof fmt === 'function' ? fmt : (n) => n.toLocaleString();
  const c = count(key, from);
  if (!c) return pending();
  if (c.exact) return esc(f(c.n));
  return '<span title="At least this many; the full count is still on its way" aria-label="at least '
    + esc(f(c.n)) + '">' + esc(f(c.n)) + '+</span>';
}

/** Test seam: park the module view (null = the realm has not answered) and
 *  get the previous one back, so a test can restore exactly what it found. */
function __swapView(v) { const was = view; view = v || null; return was; }

if (typeof window !== 'undefined') {
  window.HearthriseLifetime = {
    noteEnvelope, count, quests, markup, __swapView,
    kindsTotal: MONSTER_CLASSES.length, lore: LIFETIME_LORE,
  };
}
