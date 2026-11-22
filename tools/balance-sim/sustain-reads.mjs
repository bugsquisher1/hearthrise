// tools/balance-sim/sustain-reads.mjs — THE SUSTAIN READS OF ONE SETTLED WINDOW (Balance Lab phase 2; docs/design/redesign/07-balance-lab.md
// section 3.4: "most need counters the engine emits, not arithmetic in the tool").
//
// Shared by the cell runner (cell.mjs) and its browser twin (tools/balance-lab/lab-core.mjs), so the two read one source and the parity
// check holds them equal. Every number is the engine's own tally (src/core/hunt/tally.js, asked for its sustain block) on the settle's
// answer; this file only says which hero a number belongs to, where a window's HP anchors come from, and when a hero was short of mana
// at a party death.
//
//   sustainTotals(TALLY)                  a hero's running totals: the tally's sustain block (null on a tree from before the counters),
//                                         the hunted ms whose regeneration the answer cannot close, and shortAt { rule action: deaths }
//   noteSustainEvent(x, e)                a hero's mana waits and casts, kept for "short of mana at a death" (x: the hero's live state)
//   readSustainWindow(TALLY, out, c)      one window: the tally with each hero's HP anchors, folded into its totals; then each party death
//   sustainSummary(h)                     the hero's `sustain` field in the cell's answer (totals, so seeds add), or null
//
// HP ANCHORS. The unit book's HP at the window's start (out.units[id][2]) and the settle's HP at its end (delta.hp), 0 at a death. A hunt
// that ended another way this window leaves no end HP in the answer (the hero goes home whole), so that window's regeneration is not read
// and its hunted time is booked as unread (`regenUnreadH`).
// SHORT OF MANA AT A DEATH. A hero whose last word in the death explanation's window before a party death (src/data/hunt-tuning.js
// explainWindowMs, the window src/hunt-view/death-explain.js tells the player about) was a rule waiting for mana, with no cast of its own
// after that wait.
//
// PURE ESM. Bundled into the browser Lab (tools/balance-lab/build.mjs ALLOWED), so it imports only src/data.
import { HUNT_TUNING } from '../../src/data/hunt-tuning.js';

const EXPLAIN_WINDOW_MS = HUNT_TUNING.explainWindowMs;

/** Does this tree's tally count sustain? */
export const sustainOn = (TALLY) => !!(TALLY && typeof TALLY.emptyTally === 'function' && TALLY.emptyTally().sustain);

/** A hero's running sustain totals. */
export function sustainTotals(TALLY) {
  return { sus: sustainOn(TALLY) ? TALLY.emptyTally().sustain : null, regenUnreadMs: 0, shortAt: {} };
}

/** A hero's live state learns its mana waits and casts (call for each event `e` the hero acted in). */
export function noteSustainEvent(x, e) {
  if (!x.waits) { x.waits = []; x.casts = []; }
  if (e.type === 'rule_wait' && e.why === 'mana') x.waits.push([e.atMs, String(e.rule_label || e.rule)]);
  else if (e.type === 'cast') x.casts.push(e.atMs);
}

/**
 * One settled window. `c` = { heroes: [hero totals with .key], byKey: { key: totals }, live: { key: live state }, unitKey: { unit id: key },
 * winFrom (the window's first instant) }. Totals carry .sus, .regenUnreadMs and .shortAt (sustainTotals).
 */
export function readSustainWindow(TALLY, out, c) {
  if (!sustainOn(TALLY)) return;
  const roster = { heroes: [], kinds: {}, sustain: true, hp: {} };
  for (const [id, b] of Object.entries(out.units || {})) roster.kinds[id] = b[0];
  for (const p of out.members) {
    const id = p.summary && p.summary.unitIdEver;
    if (!Number.isInteger(id)) continue;
    roster.heroes.push(id);
    const from = out.units && out.units[id] ? out.units[id][2] : null, died = ((p.summary && p.summary.deathLog) || []).length > 0;
    const to = died ? 0 : p.hunt && p.hunt.ended ? null : p.delta && p.delta.hp;
    if (Number.isInteger(from) && Number.isInteger(to)) roster.hp[id] = [from, to];
    else if (c.byKey[p.key]) c.byKey[p.key].regenUnreadMs += (p.hunt && p.hunt.paid_ms) || 0;
  }
  const t = TALLY.tallyEvents(out.events || [], roster);
  for (const [id, s] of Object.entries(t.heroes)) { const k = c.unitKey[id]; if (k && c.byKey[k]) TALLY.addTally(c.byKey[k].sus, s.sustain); }
  for (const p of out.members) for (const dl of (p.summary && p.summary.deathLog) || []) {
    const at = Number.isInteger(dl.atMs) ? dl.atMs : c.winFrom;
    for (const h of c.heroes) {
      const x = c.live[h.key] || {};
      const w = (x.waits || []).filter(([a]) => a <= at && a >= at - EXPLAIN_WINDOW_MS).pop(), last = (x.casts || []).filter((a) => a <= at).pop();
      if (w && !(last >= w[0])) h.shortAt[w[1]] = (h.shortAt[w[1]] || 0) + 1;
    }
  }
  /* keep what a later window's death can still read: the waits inside its explanation window, and the last cast */
  for (const h of c.heroes) {
    const x = c.live[h.key];
    if (!x || !x.waits) continue;
    const keep = c.winFrom - EXPLAIN_WINDOW_MS;
    x.waits = x.waits.filter(([a]) => a >= keep);
    x.casts = x.casts.slice(-1);
  }
}

/** THE SUSTAIN METRICS of a list of cell answers (one a seed: { heroes: [{ hours, sustain }] }): healing received (food, spells,
    regeneration) over damage taken, regeneration's share of the healing received, and mana waits a hero-hour. Null when any hero carries no
    block (an answer from before the counters). The matrix (matrix-metrics.mjs cellMetrics) and the browser Lab (lab-v3.mjs liveMetrics) both
    read these, so the page and the matrix are one number. */
export function sustainMetrics(seeds) {
  const hs = seeds.flatMap((s) => s.heroes);
  if (!hs.length || hs.some((h) => !h.sustain)) return null;
  const add = (f) => hs.reduce((a, h) => a + f(h), 0);
  const r = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  const heal = add((h) => h.sustain.healIn.food + h.sustain.healIn.self + h.sustain.healIn.ally + h.sustain.healIn.regen);
  const taken = add((h) => h.sustain.takenBy.swing + h.sustain.takenBy.spell + h.sustain.takenBy.status), hours = add((h) => h.hours);
  return { sustainRatio: taken > 0 ? r(heal / taken, 3) : null, regenShare: heal > 0 ? r(add((h) => h.sustain.healIn.regen) / heal, 3) : null,
    manaWaitsPerH: hours > 0 ? r(add((h) => h.sustain.mana.waits) / hours, 2) : null };
}

/** The hero's `sustain` field: the tally's totals, the unread hours, the deaths it was short of mana at, its close calls (encounters under
    25% HP, the runner's count) and its encounters. Null on a tree from before the counters. */
export function sustainSummary(h, closeCalls, encounters) {
  if (!h.sus) return null;
  return { ...h.sus, regenUnreadH: Math.round((h.regenUnreadMs / 3600000) * 10000) / 10000, shortAt: h.shortAt, closeCalls, encounters };
}
