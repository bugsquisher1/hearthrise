// ════════════════════════════════════════════════════════════════════════
// src/session/bench-sections.js — THE WORK BENCH TAX AS THE SERVER STATES IT.
//
// Reads the envelope's `bench_tax` section (hr_bench_tax_view, 2027-02-19-bench-tax.sql): what each recipe this hero's level
// opens takes at a public bench, in milligold; per skill the share, the room and whether the account owns it; the carried
// remainder; the gold the hero set to keep; its latest bench run. Every envelope replaces it and nothing here computes a fee.
// ════════════════════════════════════════════════════════════════════════
const whole = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : 0);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** The section ({ rooms, fees, carry, keep, run }), or null on a database before the tax. */
export function benchTaxOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('bench_tax') : null;
  if (!isObj(s)) return null;
  return { rooms: isObj(s.rooms) ? s.rooms : {}, fees: isObj(s.fees) ? s.fees : {}, carry: whole(s.carry_mg), keep: whole(s.keep), run: isObj(s.run) ? s.run : null };
}

/** This recipe's fee in milligold at this account's benches, or 0 (no fee, the room is owned, or not sent yet). */
export function benchFeeMg(cs, recipeId) {
  const t = benchTaxOf(cs);
  return t && Object.prototype.hasOwnProperty.call(t.fees, recipeId) ? whole(t.fees[recipeId]) : 0;
}

/** The hero's latest bench run: { recipe, since (ms), crafts, gold, end (the server's stop reason, or null), at (ms) }, or null. */
export function benchRunOf(cs) {
  const t = benchTaxOf(cs);
  const r = t && t.run;
  if (!r || typeof r.r !== 'string') return null;
  return { recipe: r.r, since: Date.parse(r.s), crafts: whole(r.c), gold: whole(r.g), end: typeof r.e === 'string' ? r.e : null, at: Date.parse(r.at) };
}
