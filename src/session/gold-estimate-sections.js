// ════════════════════════════════════════════════════════════════════════
// src/session/gold-estimate-sections.js — ABOUT THE GOLD AN HOUR EACH SCALE GROUND PAYS, AS THE SERVER SENDS IT (the `gold_estimate` section;
//   1060-gold-estimate-catalogue.generated.sql hr_gold_estimate_view, the rule src/core/gold-estimate.js; lane/gold-per-hour 2026-11-22).
//
//   goldEstimateOf(cs, hunt, risk)   whole gold an hour before supplies, the server's number for this hero's Level at `risk` on `hunt`, or
//                                    null (no section yet, off the scale, under the ground's floor, or a Risk the server sent none for)
//
// A read of the envelope only, REPLACED by each envelope (CLAUDE.md §6). Nothing here computes: the browser picks the plan's Risk and
// draws the number the server sent.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/** The server's estimate for `hunt` at `risk`, or null. */
export function goldEstimateOf(cs, hunt, risk) {
  const raw = cs && typeof cs.read === 'function' ? cs.read('gold_estimate') : undefined;
  const grounds = isObj(raw) && isObj(raw.grounds) ? raw.grounds : null;
  const g = grounds && own(grounds, hunt) && isObj(grounds[hunt]) ? grounds[hunt] : null;
  const n = g && own(g, risk) ? g[risk] : null;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
