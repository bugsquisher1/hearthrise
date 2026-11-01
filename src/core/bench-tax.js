// ============================================================
// src/core/bench-tax.js — THE WORK BENCH TAX'S ARITHMETIC. ONE COPY FOR THE ENGINE AND THE WORK WINDOW.
//
// Tyler 2026-11-01; the designer's rule: a public bench takes a share of what a job's output sells for at the shop, as each
// action settles. The fee of the hero's running job, its carried remainder and the gold it keeps all arrive in the server's
// `bench_tax` section (hr_bench_tax_view, supabase/migrations/2027-02-19-bench-tax.sql); nothing here holds a number and no
// request field reaches one.
//
// THE RULE. Fees are milligold, exact. A craft adds its fee to the carry; each whole gold the carry passes is charged at that
// craft, the rest stays on the hero. So 0.75 g a craft is 3 gold every 4 crafts however the run is cut into settles, and a
// craft whose whole gold cannot be paid out of the purse above what the hero keeps does not run.
// Postgres re-derives every number under the character lock (hr_bench_tax_settle): this is the proposal, not the authority.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

const whole = (n) => (Number.isSafeInteger(n) && n > 0 ? n : 0);

/** One job's fee in milligold, from the data rows and the shop's bid. Generators and guards only: a running job reads the server's. */
export function feeMgOf(permille, bid, qty, freeUnderMg) {
  const mg = whole(permille) * whole(bid) * Math.max(1, whole(qty));
  return mg < whole(freeUnderMg) ? 0 : mg;
}

/**
 * The tax a bench run owes, as a live object the span spends, or null when none is due.
 * @param section the envelope's `bench_tax` (absent on a database before the tax)
 * @param mg      this job's fee in milligold, the server's
 * @param purse   the account's gold, the server's number
 */
export function taxFor(section, mg, purse) {
  if (!section || !(whole(mg) > 0)) return null;
  return { mg, carry: whole(section.carry_mg), purse: whole(purse), keep: whole(section.keep), paid: 0 };
}

/** The whole gold the next craft charges (0 while the carry stays under one gold). */
export function dueNext(tax) { return Math.floor((tax.carry + tax.mg) / 1000); }

/** May the next craft run? A craft that charges nothing always may: it adds to the carry and the next whole gold is checked. */
export function canPayNext(tax) {
  const due = dueNext(tax);
  return due === 0 || tax.purse - due >= tax.keep;
}

/** One craft ran: the carry moves, and the purse pays its whole gold. MUTATES `tax`. */
export function payCraft(tax) {
  const due = dueNext(tax);
  tax.carry = (tax.carry + tax.mg) % 1000;
  tax.purse -= due;
  tax.paid += due;
  return due;
}

/** How many crafts the purse above what the hero keeps covers, from here. */
export function craftsCovered(tax) {
  const spend = Math.max(0, tax.purse - tax.keep);
  return Math.max(0, Math.floor(((spend + 1) * 1000 - 1 - tax.carry) / tax.mg));
}
