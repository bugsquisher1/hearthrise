// ════════════════════════════════════════════════════════════════════════
// src/features/spine-reveal.js — THE PROGRESSIVE REVEAL (window.HearthriseReveal).
//
// A new character sees four doors, not nine. Each door, card and skill comes
// into view when its spine step arrives or when the server says the player
// already uses it (src/data/reveals.js, decided by src/core/spine-progress.js).
//
// ── WHERE THE FACTS COME FROM ───────────────────────────────────────────────
// Only from what the server sent. `noteEnvelope(res)` is called beside the
// lifetime tally at both envelope sites (src/net/accrue.js, the boot hydrate
// in src/net/record.js) and folds the permanent `stat` rows, the property
// rung, the crew and the bag into a module view; skill XP is read through the
// record accessor, holding the server's last statement (record.js
// recordLastKnown) while the record cannot vouch for the map — never a client
// write. Nothing here reads a G field the client writes, so a client-only flag
// cannot reveal anything (SPINE-REVEAL-3 proves it).
//
// Every fact only grows within a character, so the view only ratchets up and
// a reveal is never taken away. A slot change starts a fresh view.
//
// ── CONSUMERS ───────────────────────────────────────────────────────────────
// `shows(id)` is the one question. Consumers ask it at paint time and repaint
// on the `hearthrise:reveal` window event, fired when the shown set changes.
// A consumer that finds no HearthriseReveal (the boot window before main.js)
// shows everything: a menu that fails to load must fail open.
//
// ── THE HARNESS ─────────────────────────────────────────────────────────────
// The headless harness has no server, so every fact is unknown and the game
// would boot as a fresh character. It is pinned to FULL instead (the same
// "its fixtures are its record" rule as record.js isRecordPending), so the
// rest of the suite renders what a seasoned account renders. Tests drive the
// other states through `__pin(facts | null)`.
// ════════════════════════════════════════════════════════════════════════

import { SPINE_STEPS } from '../data/spine.js?v=590';
import { REVEALS, DUNGEON_KEYS } from '../data/reveals.js?v=590';
import { SKILLS_DEF } from '../data/skills.js?v=590';
import { QUEST_REWARDS } from '../data/goal-catalogue.js?v=590';
import { START_SKILL_XP, START_INVENTORY } from '../data/start-kit.js?v=590';
import { reveal, warWindow, combatLevelOf, lockReasonOf } from '../core/spine-progress.js?v=590';
import { pickPropertyTier, isCompleteProgressStatement } from '../net/property-record.js?v=590';
import { recordValue, recordLastKnown } from '../net/record.js?v=590';

const fin = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const CTX = Object.freeze({ startXp: START_SKILL_XP });

/**
 * ONE ENVELOPE OVER THE LAST VIEW, pure. Counts and the property rung take the
 * max (a truncated statement is a floor); the crew is stated whole when the
 * envelope carries it; the bag is replaced by a complete statement and only
 * added to by a partial one.
 */
export function fold(prev, res) {
  if (!res || typeof res !== 'object') return prev;
  const st = (res.state && typeof res.state === 'object') ? res.state : null;
  let base = prev || null;
  if (base && st && fin(st.slot) && fin(base.slot) && Number(st.slot) !== Number(base.slot)) base = null;
  const next = {
    slot: (st && fin(st.slot)) ? Number(st.slot) : (base ? base.slot : null),
    counts: Object.assign({}, base && base.counts),
    countsComplete: !!(base && base.countsComplete),
    property: base ? base.property : null,
    workers: base ? base.workers : null,
    companions: base ? base.companions : null,
    bag: base && base.bag ? Object.assign({}, base.bag) : null,
    claimed: base && base.claimed ? Object.assign({}, base.claimed) : null,
  };
  if (Array.isArray(res.progress)) {
    for (const r of res.progress) {
      if (!r || r.kind !== 'stat' || r.period !== '' || typeof r.key !== 'string') continue;
      if (!fin(r.value) || Number(r.value) < 0) continue;
      const v = Math.floor(Number(r.value));
      if (!(next.counts[r.key] >= v)) next.counts[r.key] = v;
    }
    /* Claimed quest rows (hr_claim_quest's once-guard) only grow; a complete
       statement makes an absent quest a real "not paid yet". */
    for (const r of res.progress) {
      if (r && r.kind === 'quest' && r.period === '' && r.state === 'claimed' && typeof r.key === 'string') {
        next.claimed = Object.assign(next.claimed || {}, { [r.key]: true });
      }
    }
    if (isCompleteProgressStatement(res)) { next.countsComplete = true; next.claimed = next.claimed || {}; }
    const tier = pickPropertyTier(res);
    if (tier !== null && !(next.property >= tier)) next.property = tier;
  }
  if (Array.isArray(res.workers)) next.workers = res.workers.length;
  /* `owned` omits the starter fox (it is owned by grammar), so its length is
     the companions actually earned. */
  const comp = res.companions;
  if (comp && typeof comp === 'object' && Array.isArray(comp.owned)) {
    const n = comp.owned.filter((id) => typeof id === 'string' && id && id !== 'fox').length;
    if (!(next.companions >= n)) next.companions = n;
  }
  const inv = res.inventory;
  if (inv && typeof inv === 'object' && !Array.isArray(inv)) {
    const bag = res.inventory_complete === true ? {} : (next.bag || {});
    for (const [id, q] of Object.entries(inv)) if (fin(q) && Number(q) > 0) bag[id] = Number(q);
    next.bag = bag;
  }
  return next;
}

/* FULL: every step done, every use confirmed — a maxed account. FRESH: what
   the server projects for a brand-new character. Both are test fixtures and
   documentation of the two ends of the spine. */
const MAX_XP = 13034431;
const COUNT_KEYS = (() => {
  const keys = new Set();
  const add = (n) => { if (n && n.fact === 'count') keys.add(n.key); };
  SPINE_STEPS.forEach((s) => s.need.forEach(add));
  REVEALS.forEach((r) => r.uses.forEach(add));
  return [...keys].sort();
})();
export const FULL = Object.freeze({
  counts: Object.freeze(Object.fromEntries(COUNT_KEYS.map((k) => [k, 1e9]))), countsComplete: true,
  skills: Object.freeze(Object.fromEntries(Object.keys(SKILLS_DEF).map((id) => [id, MAX_XP]))),
  property: 6, workers: 6, companions: 6,
  bag: Object.freeze(Object.fromEntries(DUNGEON_KEYS.map((k) => [k, 1]))),
  products: Object.freeze({ clans: true, world: true }),
  gold: 1e9, equipment: Object.freeze({ boots: 'leather_boots' }),
  claimed: Object.freeze(Object.fromEntries(Object.keys(QUEST_REWARDS).map((q) => [q, true]))),
});
export const FRESH = Object.freeze({
  counts: Object.freeze({}), countsComplete: true,
  skills: START_SKILL_XP, property: 0, workers: 0, companions: 0, bag: START_INVENTORY,
  products: Object.freeze({}),
  gold: 0, equipment: Object.freeze({}), claimed: Object.freeze({}),
});

let view = null;
let pinned = null;
let lastSig = null;

function harness() { return typeof window !== 'undefined' && !!window.__HR_TEST_HARNESS__; }

/** A record field (skills, equipment) as the server last stated it, or null.
 *  The vouched value first; while the record cannot vouch for it (an answer
 *  that did not restate the field, or a write between settles), the copy
 *  applyRecord took of the last server statement. Never a G field the client
 *  writes, so SPINE-REVEAL-3 still holds. Only a field the server has never
 *  stated this session is unknown — the fresh-character view is for that alone,
 *  not for a Combat-56 hero between two envelopes (the flipping hunt grid). */
function serverRecord(field) {
  const G = typeof window !== 'undefined' ? window.G : null;
  const rv = recordValue(G, field);
  if (rv.known && rv.value && typeof rv.value === 'object') return rv.value;
  const last = recordLastKnown(G, field);
  return (last && typeof last === 'object') ? last : null;
}
function serverGold() {
  const G = typeof window !== 'undefined' ? window.G : null;
  const rv = recordValue(G, 'gold');
  if (rv.known && fin(rv.value)) return Number(rv.value);
  const last = recordLastKnown(G, 'gold');
  return fin(last) ? Number(last) : null;
}

/** Which unreleased features are live: shipping switches, not player state. */
function liveProducts() {
  const C = typeof window !== 'undefined' ? window.HearthriseClans : null;
  const W = typeof window !== 'undefined' ? window.HearthriseWorld : null;
  return {
    clans: !!(C && typeof C.clanLaunched === 'function' && C.clanLaunched()),
    world: !!(W && typeof W.launched === 'function' && W.launched()),
  };
}

/** THE FACTS the reveal is decided from right now. */
export function facts() {
  const pin = pinned !== null ? pinned : (harness() ? FULL : null);
  if (pin && pin !== 'live') return pin;
  const v = view || {};
  return {
    counts: v.counts || {}, countsComplete: !!v.countsComplete,
    skills: serverRecord('skills'), property: fin(v.property) ? v.property : null,
    workers: fin(v.workers) ? v.workers : null, bag: v.bag || null,
    companions: fin(v.companions) ? v.companions : null, products: liveProducts(),
    gold: serverGold(), equipment: serverRecord('equipment'), claimed: v.claimed || null,
  };
}

/** The full answer: progress along the spine and the shown set. */
export function state() { return reveal(facts(), SPINE_STEPS, REVEALS, CTX); }

/** THE ONE QUESTION: does this door / card / skill show? */
export function shows(id) { return state().shows(id); }

/** The player's combat level as the server states it, or null. */
export function combatLevel() { return combatLevelOf(facts()); }

/** The ten-level window over war cards (see core warWindow). */
export function warCards(cards) {
  return warWindow(combatLevel(), cards, 10, shows('war:next'));
}

/** Is a quest destination (HearthriseQuestNav `{tab, skillId}`) an open door? */
export function routeOpen(dest) {
  if (!dest || !dest.tab) return false;
  const st = state();
  return st.shows('pane:' + dest.tab) && (!dest.skillId || st.shows('skill:' + dest.skillId));
}

/**
 * "The Combat door opens when you win five fights." — for a door that is shut,
 * named from the earliest of its rows and the step before it; null when the
 * door is open or no step opens it (a product that has not shipped).
 * @param {string} label  the door's own name, as the rail prints it
 * @param {string[]} ids  the door's reveal ids (its panes)
 */
export function opensWhen(label, ids) {
  const st = state();
  if (ids.some((id) => st.shows(id))) return null;
  const rows = REVEALS.filter((r) => ids.indexOf(r.id) >= 0 && !r.product);
  if (!rows.length) return null;
  const first = Math.min(...rows.map((r) => r.step));
  const before = SPINE_STEPS.find((s) => s.step === first - 1);
  return before ? 'The ' + label + ' door opens when you ' + before.whenDone + '.' : null;
}

/**
 * WHY A ROW IS STILL LOCKED, in one plain line, or null when it is open.
 * "Opens when you catch and cook five fish (Step 2)": the step whose goal opens
 * it. A row with no step to wait for (an unreleased product) is "Coming in a
 * later update." Every row has one (tests/reveal-coverage.mjs R7).
 */
export function reasonFor(row) { return lockReasonOf(row, SPINE_STEPS); }

/** The lock line for one reveal id right now: null when it is open. */
export function lockReason(id) {
  if (state().shows(id)) return null;
  return reasonFor(REVEALS.find((r) => r.id === id)) || 'Opens as you play.';
}

/** The lock line for a door made of several ids: its EARLIEST opening, null when any is open. */
export function lockReasonAny(ids) {
  const st = state();
  if (ids.some((id) => st.shows(id))) return null;
  const rows = REVEALS.filter((r) => ids.indexOf(r.id) >= 0);
  const stepped = rows.filter((r) => !r.product).sort((a, b) => a.step - b.step);
  return reasonFor(stepped[0] || rows[0]) || 'Opens as you play.';
}

function signature() { return [...state().shown].sort().join(','); }

/** Fire `hearthrise:reveal` when the shown set changed. Returns whether it did. */
export function check() {
  const sig = signature();
  if (sig === lastSig) return false;
  lastSig = sig;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try { window.dispatchEvent(new CustomEvent('hearthrise:reveal')); } catch (e) {}
  }
  return true;
}

export function noteEnvelope(res) {
  try { view = fold(view, res); } catch (e) { return false; }
  return check();
}

/** Test seam: pin the facts. `'live'` reads the server view even in the
    harness; null restores the default (live, or FULL in the harness).
    Returns the previous pin. */
export function __pin(f) {
  const was = pinned;
  pinned = (f === 'live' || (f && typeof f === 'object')) ? f : null;
  check();
  return was;
}
/** Test seam: park the envelope view and get the previous one back. */
export function __swapView(v) { const was = view; view = v || null; check(); return was; }

if (typeof window !== 'undefined') {
  window.HearthriseReveal = Object.freeze({
    shows, state, facts, combatLevel, warCards, noteEnvelope, check, fold, routeOpen, opensWhen, lockReason, lockReasonAny, reasonFor,
    steps: SPINE_STEPS, rows: REVEALS, FULL, FRESH, __pin, __swapView,
  });
  /* Skill XP reaches G through the record, not through noteEnvelope, and a
     poll cannot miss a writer added later. One compare a second. */
  setInterval(check, 1000);
  check();
}
