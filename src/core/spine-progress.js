// ════════════════════════════════════════════════════════════════════════
// src/core/spine-progress.js — HOW FAR ALONG THE SPINE, FROM SERVER FACTS ONLY.
//
// The step-reached predicate for the one-spine design, shared by the
// progressive reveal (src/features/spine-reveal.js) and the pointer bar (lane
// L1). Pure: the caller hands in a FACTS object built from the server's
// projection and gets answers; nothing here reads G, the DOM or a clock.
//
// ── FACTS ───────────────────────────────────────────────────────────────────
//   {
//     counts:         { key: n }   permanent `stat` progress rows (period '')
//     countsComplete: bool         the statement was complete, so an absent
//                                  key is a real 0 rather than unknown
//     skills:   { id: xp } | null  the server's skill XP map (null = unknown;
//                                  a known map's absent skill is 0 XP)
//     property: n | null           the server's property rung
//     workers:  n | null           hired hands
//     bag:      { id: qty } | null the server's bag
//   }
// Any field may be missing; missing is UNKNOWN, and an unknown fact is never
// true. So unknown never reveals, and a fact the server confirms always does:
// a row's `uses` are OR-ed, so one confirmed use outweighs any number of
// unknowns.
//
// ── WHERE THE PLAYER IS ─────────────────────────────────────────────────────
// `reachedThrough` is one past the highest DONE step (1 on a fresh character,
// steps.length + 1 when every step is done). Using the highest done step
// rather than the first open one means an out-of-order player is never held
// behind a step they skipped, and since every fact only grows it never falls.
// `current` is the first open step: what L1 points at.
// ════════════════════════════════════════════════════════════════════════

import { combatLevel } from './xp.js?v=567';

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/** A count, or null when the server has not stated it. */
function countOf(facts, key) {
  const c = facts && facts.counts;
  if (own(c, key) && fin(c[key])) return c[key];
  return (facts && facts.countsComplete === true) ? 0 : null;
}

function skillsOf(facts) {
  const s = facts && facts.skills;
  return (s && typeof s === 'object') ? s : null;
}

/** Combat level from the server's XP map, or null while it is unknown. */
export function combatLevelOf(facts) {
  const s = skillsOf(facts);
  return s ? combatLevel(s) : null;
}

const ge = (v, min) => (v === null || v === undefined || !fin(v)) ? null : v >= min;

/* THE CLOSED VOCABULARY. Each answers true, false or null (unknown). A fact
   kind not listed here is unknown, so an authoring typo can never reveal. */
export const FACTS = Object.freeze({
  count: (f, n) => ge(countOf(f, n.key), n.min),
  combat: (f, n) => ge(combatLevelOf(f), n.min),
  property: (f, n) => ge(f && f.property, n.min),
  workers: (f, n) => ge(f && f.workers, n.min),
  skill: (f, n, ctx) => {
    const s = skillsOf(f);
    if (!s) return null;
    const xp = own(s, n.id) ? Number(s[n.id]) : 0;
    if (!fin(xp)) return null;
    const start = (ctx && ctx.startXp && fin(ctx.startXp[n.id])) ? ctx.startXp[n.id] : 0;
    return xp > start;
  },
  holds: (f, n) => {
    const b = f && f.bag;
    if (!b || typeof b !== 'object') return null;
    return (n.ids || []).some((id) => fin(b[id]) && b[id] > 0);
  },
});

/** One need against the facts: true, false or null (unknown). */
export function factHolds(facts, need, ctx) {
  const fn = need && own(FACTS, need.fact) ? FACTS[need.fact] : null;
  if (!fn) return null;
  const v = fn(facts || {}, need, ctx);
  return v === true ? true : v === false ? false : null;
}

/** A step is done only when every need is confirmed true. */
export function stepDone(facts, step, ctx) {
  const need = (step && step.need) || [];
  return need.length > 0 && need.every((n) => factHolds(facts, n, ctx) === true);
}

/**
 * Where the character stands on the spine.
 * @returns {{done: boolean[], highestDone: number, current: number|null, reachedThrough: number, total: number}}
 *   `highestDone` 0 when nothing is done; `current` null when all are done.
 */
export function spineProgress(facts, steps, ctx) {
  const list = Array.isArray(steps) ? steps : [];
  const done = list.map((s) => stepDone(facts, s, ctx));
  let highestDone = 0;
  let current = null;
  list.forEach((s, i) => {
    if (done[i]) highestDone = Math.max(highestDone, s.step);
    else if (current === null) current = s.step;
  });
  return { done, highestDone, current, reachedThrough: highestDone + 1, total: list.length };
}

/** Has step `n` arrived (it is the current step or behind the player)? */
export function stepReached(facts, steps, n, ctx) {
  return spineProgress(facts, steps, ctx).reachedThrough >= n;
}

/**
 * THE REVEAL: which rows show. A row shows when its step has arrived or any of
 * its `uses` is confirmed by the server.
 * @returns {{progress, shown: Set<string>, shows: (id: string) => boolean}}
 *   `shows` answers false for an id with no row (tests/reveal-coverage.mjs
 *   makes that unreachable for every surface it knows).
 */
export function reveal(facts, steps, rows, ctx) {
  const progress = spineProgress(facts, steps, ctx);
  const shown = new Set();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || !r.id) return;
    if (fin(r.step) && r.step <= progress.reachedThrough) { shown.add(r.id); return; }
    if ((r.uses || []).some((n) => factHolds(facts, n, ctx) === true)) shown.add(r.id);
  });
  return { progress, shown, shows: (id) => shown.has(id) };
}

/**
 * THE TEN-LEVEL WINDOW for war cards and tier chips. A card shows when its
 * level requirement is within `span` levels of the player's combat level, or
 * it is `pinned` (a key held, the tier being browsed). With `next`, the one
 * nearest card beyond the window shows too. Unknown level: only pinned cards
 * and requirement-0 cards.
 * @param {Array<{req: number, pinned?: boolean}>} cards
 * @returns {boolean[]} parallel to `cards`
 */
export function warWindow(level, cards, span, next) {
  const list = Array.isArray(cards) ? cards : [];
  const lv = fin(level) ? level : null;
  const reach = lv === null ? 0 : lv + (fin(span) ? span : 10);
  const out = list.map((c) => !!(c && (c.pinned || (fin(c.req) && c.req <= reach))));
  if (next && lv !== null) {
    let best = -1;
    list.forEach((c, i) => {
      if (out[i] || !c || !fin(c.req)) return;
      if (best < 0 || c.req < list[best].req) best = i;
    });
    if (best >= 0) out[best] = true;
  }
  return out;
}
