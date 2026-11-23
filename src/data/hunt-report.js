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
//   fallsMax     the Danger scale's fall backs one report keeps, the last ones (src/core/hunt/report.js `falls`); the server's
//                hr_hunt_limits.report_falls_max is generated from this row and bounds the shape and the fold (1057-danger-falls.sql)
//   supStep      THE LEDGER (19-power-ledger L7): the Danger steps one supplies bucket spans (src/core/hunt/report.js `sup`, keyed by the
//                bucket's first step); a depth on a band is about 12 steps, so a bucket reads as one depth
//   ledgerShown  the healing sources the Healing line names (the largest first; the rest are left out of the line, not of the shares)
//   supShown     the depths the Supplies/hr lines name (those held longest), each held at least supMinMs
//
// PURE ESM. Data only (tests/hunt-core/tally.mjs report-word reads every threshold through the one word).
// ════════════════════════════════════════════════════════════════════════

export const HUNT_REPORT = Object.freeze({
  closeCallPm: 250,
  closePm: 500,
  nearPm: 100,
  nearCalls: 3,
  barMax: 16,
  rulesShown: 6,
  fallsMax: 12,
  supStep: 10,
  ledgerShown: 3,
  supShown: 2,
  supMinMs: 900000,
});

/** Why a slot whose conditions held could not fire (src/core/hunt/events.js rule_wait `why`), and the never-fired reason a slot with
    no wait at all reads (its condition was never true). The end card reads `report.why_<id>`. */
export const WAIT_REASONS = Object.freeze(['mana', 'cooldown', 'no_stock', 'no_target', 'out_of_range', 'gold_short', 'level']);
export const NEVER_TRUE = 'never_true';
