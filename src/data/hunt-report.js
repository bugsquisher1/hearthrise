// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-report.js — THE HUNT REPORT'S LINES (GR-66, free to every player; build plan FB-7).
//
// The report says, after every hunt, how close it came to a death and what each rule on the bar did
// (docs/design/overhaul/08-player-experience.md section 2.3). It reads counters the settle keeps
// (src/core/hunt/report.js, folded into hunt_session_tally.report by the member applier); these rows are
// the lines it draws and the one word it ends on. Thresholds are TARGETS (GR-66 PROVISIONAL): a change
// is a data row, and the balance matrix reads the same counter (`lowHpP10`).
//
//   closeCallPm  a close call: a blow takes a hero from at least this share of its health (permille) to under it
//   closePm      the word is Close when a hero fell under this share
//   nearPm       the word is Near death when a hero fell under this share ...
//   nearCalls    ... or the hunt held this many close calls or more
//   barMax       the bar's slots one report keeps (the rules block's lines)
//   rulesShown   the rules block's lines on the end card (fired first, then never fired)
//
// PURE ESM. Data only, and its validator.
// ════════════════════════════════════════════════════════════════════════

export const HUNT_REPORT = Object.freeze({
  closeCallPm: 250,
  closePm: 500,
  nearPm: 100,
  nearCalls: 3,
  barMax: 16,
  rulesShown: 6,
});

/** The one word for a hunt, safest first (the end card reads `report.word_<id>`). */
export const RISK_WORDS = Object.freeze(['safe', 'close', 'near']);

/** Why a slot whose conditions held could not fire (src/core/hunt/events.js rule_wait `why`), and the never-fired reason a slot with
    no wait at all reads (its condition was never true). The end card reads `report.why_<id>`. */
export const WAIT_REASONS = Object.freeze(['mana', 'cooldown', 'no_stock', 'no_target', 'out_of_range', 'gold_short', 'level']);
export const NEVER_TRUE = 'never_true';

/** Every problem with the table, as strings. Empty = valid. */
export function validateReport(T = HUNT_REPORT) {
  const out = [];
  const pm = (k) => { if (!Number.isInteger(T[k]) || T[k] <= 0 || T[k] >= 1000) out.push(k + ' must be a permille between 1 and 999, got ' + T[k]); };
  for (const k of ['closeCallPm', 'closePm', 'nearPm']) pm(k);
  if (!(T.nearPm < T.closeCallPm && T.closeCallPm < T.closePm)) out.push('nearPm < closeCallPm < closePm must hold (a tenth, a quarter, a half)');
  for (const k of ['nearCalls', 'barMax', 'rulesShown']) if (!Number.isInteger(T[k]) || T[k] < 1) out.push(k + ' must be a whole number of at least 1');
  if (T.rulesShown > T.barMax) out.push('rulesShown is more than the bar a report keeps');
  return out;
}
