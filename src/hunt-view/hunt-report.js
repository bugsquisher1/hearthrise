// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/hunt-report.js — THE HUNT REPORT'S FACTS, FROM SERVER COUNTERS (GR-66, free; build plan FB-7).
//
// PURE (no DOM, no clock, no names). After every hunt the end card says how close it came to a death and what each rule on the bar
// did (docs/design/overhaul/08-player-experience.md section 2.3). Every fact here is a server number: the session's report counters
// (src/session/report-sections.js, folded by the settle the same for a hunt viewed and closed), the death log's rows for the session
// (Level XP lost, what Blessings saved), the analyzer's Level XP an hour and the session's end. Nothing is predicted and nothing
// here can be spent; the words are the shell's (src/shell/hunt-report.js).
//
//   reportFacts(rep, o)   the compact facts one summary keeps (the residue's `report`, bounded by src/session/hunt-summaries.js):
//                         { word, low [pm, monster, blow] | null, close, dry [[item, ms into the hunt]], ranOut reason | null,
//                           deaths [[xp, saved, blessings]], rules [[rule, uses, place, fired, why, kind, sharePm]] }
//   changedSlot(cur, prev) the change line's facts: the first bar slot of `cur` whose rule the last hunt on this ground did not play,
//                         with its share now and then (when the old hunt had one for the same thing), or null
//   CAUSE_SLOT            where the cause line goes (package 9: "names the cause in plain words and the one change most likely to
//                         help"). It needs the sustain counters in the server tally, which this lane does not store: null until then.
// ════════════════════════════════════════════════════════════════════════
import { riskWord } from '../core/hunt/report.js';
import { NEVER_TRUE, WAIT_REASONS } from '../data/hunt-report.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
/* The END_ORDER reasons that mean a thing ran out (src/data/hunt-sessions.js), said beside the stacks that ran dry. */
const RAN_OUT = Object.freeze(['gold_out', 'heals_out', 'ammo_out', 'runes_out']);

/** The cause line's slot (see the header): filled once the server stores the sustain counters. */
export const CAUSE_SLOT = null;

/* The reason a rule that never fired waited most (a tie to the first in WAIT_REASONS), else its condition was never true. */
function whyNever(w) {
  let best = null;
  for (const why of WAIT_REASONS) if (isObj(w) && nat(w[why]) > 0 && (best === null || w[why] > w[best])) best = why;
  return best || NEVER_TRUE;
}

/* A slot's share of the hero's damage (`d`) or healing (`h`) in permille, by what it uses; ['', -1] when it did neither. */
function shareOf(uses, dealt, healed) {
  const sum = (m) => Object.values(m || {}).reduce((n, x) => n + (nat(x) || 0), 0);
  if (nat(dealt[uses]) > 0) return ['d', Math.round((dealt[uses] * 1000) / Math.max(1, sum(dealt)))];
  if (nat(healed[uses]) > 0) return ['h', Math.round((healed[uses] * 1000) / Math.max(1, sum(healed)))];
  return ['', -1];
}

/**
 * The facts one summary keeps.
 * @param {ReturnType<typeof import('../session/report-sections.js').reportFrom>} rep  the session's report, or null
 * @param {{ deaths?: object[], reason?: string|null, enteredMs?: number|null }} o
 *   deaths: the death log's rows of this session (character-sections.js deathLogOf), reason: the session's end, enteredMs: its start
 * @returns {object|null}
 */
export function reportFacts(rep, o = {}) {
  if (!rep) return null;
  const start = Number.isFinite(o.enteredMs) ? o.enteredMs : null;
  const dry = Object.entries(rep.dry || {}).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 8)
    .map(([item, at]) => [item, start !== null ? Math.max(0, at - start) : -1]);
  const deaths = (Array.isArray(o.deaths) ? o.deaths : []).slice(0, 2).map((d) => [nat(d.xp) || 0,
    isObj(d.saved) ? nat(d.saved.level) || 0 : 0, nat(d.blessings) || 0]);
  const rules = (rep.bar || []).map(([rule, uses, place]) => {
    const fired = nat(rep.fired[rule]) || 0;
    const [kind, sharePm] = shareOf(uses, rep.dealt || {}, rep.healed || {});
    return [rule, uses, place, fired, fired > 0 ? '' : whyNever(rep.waits[rule]), kind, sharePm];
  });
  const low = rep.low ? [rep.low.pm, rep.low.by, rep.low.blow] : null;
  return { word: riskWord(rep.low ? rep.low.pm : null, rep.close), low, close: rep.close, dry,
    ranOut: RAN_OUT.includes(o.reason) ? o.reason : null, deaths, rules };
}

/**
 * THE CHANGE LINE'S FACTS: `cur` and `prev` are two summaries' report facts on the same ground, `prev` the hunt before. The first slot
 * of `cur` (in bar order) whose rule `prev` did not play is the change; its share now, and the share the same thing had then.
 * @returns {{ place: number, uses: string, kind: string, nowPm: number, wasPm: number }|null}
 */
export function changedSlot(cur, prev) {
  if (!cur || !prev || !Array.isArray(cur.rules) || !Array.isArray(prev.rules) || !prev.rules.length) return null;
  const old = new Set(prev.rules.map((r) => r[0]));
  const c = cur.rules.slice().sort((a, b) => a[2] - b[2]).find((r) => !old.has(r[0]));
  if (!c) return null;
  const then = prev.rules.find((r) => r[1] === c[1] && r[5] === c[5]);
  return { place: c[2], uses: c[1], kind: c[5], nowPm: c[6], wasPm: then ? then[6] : -1 };
}
