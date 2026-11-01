// ============================================================
// src/core/bench-tax.js — THE WORK BENCH TAX'S ARITHMETIC. ONE COPY FOR THE ENGINE AND THE WORK WINDOW.
//
// Tyler 2026-11-01. A public bench takes gold per craft, as each action settles. Rates, the room rule, the hero's carried
// remainder and the gold it must keep all arrive in the server's `bench_tax` section (hr_bench_tax_view,
// supabase/migrations/2027-02-19-bench-tax.sql); nothing here holds a number and no request field reaches one.
//
// THE RULE. Fees are milligold. A craft adds its fee to the carry; each whole gold the carry passes is charged at that
// craft, the rest stays on the hero. So 0.25 g a craft is 1 gold on every fourth craft however the run is cut into settles,
// and a craft whose whole gold cannot be paid out of the purse above what the hero keeps does not run.
// Postgres re-derives every number under the character lock (hr_bench_tax_settle): this is the proposal, not the authority.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

const whole = (n) => (Number.isSafeInteger(n) && n > 0 ? n : 0);

/** The fee of one craft of a recipe asking for level `req`, in milligold, from a server row. */
export function rateMg(row, req) {
  if (!row) return 0;
  return whole(row.base_mg) + whole(row.per_req_mg) * Math.max(1, whole(req));
}

/**
 * The tax a bench run owes, as a live object the span spends, or null when none is due: no section (a database before
 * the tax), no row for the skill, a free recipe, or the account owns the room (`free`).
 * @param section the envelope's `bench_tax`
 * @param purse   the account's gold, the server's number
 */
export function taxFor(section, skill, req, purse) {
  const row = section && section.rows && Object.prototype.hasOwnProperty.call(section.rows, skill) ? section.rows[skill] : null;
  const mg = rateMg(row, req);
  if (!row || row.free === true || mg <= 0) return null;
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
