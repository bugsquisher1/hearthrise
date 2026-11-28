// ════════════════════════════════════════════════════════════════════════
// src/session/trade-sections.js — THE KIT TRADES' JOBS AS THE SERVER HOLDS THEM (lane/k1-job-slice, supabase/migrations/1073-k1-job-slice.sql;
//   the `trade_jobs` section, docs/design/redesign/09-crafting.md sections 4.9 and 6).
//
//   trade_jobs.trades   { <trade>: { xp, level } }   the company's trade Levels on 09's table
//   trade_jobs.job      the hero's open job: { id, recipe, name, face, trade, band, count, fee, level, started_at, ends_at, attempt_ms, due }
//   trade_jobs.last     the newest settled job: { id, recipe, name, face, settled_at, result { end, attempts, plain, fine, master, ... } }
//   trade_jobs.recipes  [ { id, name, trade, kind, band, face, r_level, inputs, quote } ], quote the server's whole-day job
//                       { ok, count, fee, ends_at } or the refusal the start would answer { ok: false, error, ... }
//   trade_jobs.stock    { <item>: { fine, master } }  the company's Fine and Master goods
// And the hero's work day (the `work_day` section, 1059-company-trades.sql: workDayOf), the Work window's line over the Jobs list.
// Display only: every envelope replaces these, every press re-reads, and the server decides every job. The seed never reaches here.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const id = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,64}$/.test(v) ? v : null);
const ms = (v) => { const n = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(n) ? n : null; };
const read = (cs, key) => (cs && typeof cs.read === 'function' ? cs.read(key) : undefined);

function inputsOf(o) {
  const out = {};
  if (isObj(o)) for (const [k, v] of Object.entries(o)) if (id(k) && count(v)) out[k] = v;
  return out;
}

function quoteOf(q) {
  if (!isObj(q)) return null;
  if (q.ok === true) {
    if (!count(q.count) || count(q.fee) === null) return null;
    return { ok: true, count: q.count, countCap: count(q.count_cap), fee: q.fee, endsAt: ms(q.ends_at), level: count(q.level) };
  }
  return { ok: false, error: typeof q.error === 'string' ? q.error : 'refused', level: count(q.level), need: count(q.need), band: count(q.band),
    itemId: id(q.item_id), countCap: count(q.count_cap) };
}

function jobOf(j) {
  if (!isObj(j) || typeof j.id !== 'string' || !id(j.recipe) || !count(j.count)) return null;
  const startedAt = ms(j.started_at), endsAt = ms(j.ends_at);
  if (startedAt === null || endsAt === null) return null;
  return { id: j.id, recipe: j.recipe, name: typeof j.name === 'string' ? j.name : j.recipe, face: id(j.face), trade: id(j.trade), band: count(j.band),
    count: j.count, fee: count(j.fee), startedAt, endsAt, attemptMs: count(j.attempt_ms), due: j.due === true };
}

function lastOf(l) {
  const r = isObj(l) && isObj(l.result) ? l.result : null;
  if (!r || !id(l.recipe)) return null;
  return { recipe: l.recipe, name: typeof l.name === 'string' ? l.name : l.recipe, face: id(l.face), settledAt: ms(l.settled_at),
    end: typeof r.end === 'string' ? r.end : null, attempts: count(r.attempts) ?? 0, plain: count(r.plain) ?? 0, fine: count(r.fine) ?? 0,
    master: count(r.master) ?? 0, returned: count(r.returned) ?? 0, refunded: count(r.refunded) ?? 0, xp: count(r.xp) ?? 0 };
}

/**
 * THE HERO'S WORK DAY, as the server holds it (1059-company-trades.sql, the `work_day` section; Tyler 2026-11-22 CR-Q3 b): today's town
 * work cap, what is used and what is left (as of the last settle) and whether Premium lengthens it. { capMs, usedMs, leftMs, premium } or
 * null on a database before the work day. Display only: every envelope replaces it, and the server stops the work, never this.
 */
export function workDayOf(cs) {
  const s = read(cs, 'work_day');
  if (!isObj(s) || !Number.isSafeInteger(s.cap_ms) || !Number.isSafeInteger(s.left_ms)) return null;
  const n = (v) => count(v) ?? 0;
  return { capMs: n(s.cap_ms), usedMs: n(s.today_ms), leftMs: n(s.left_ms), premium: s.premium === true };
}

/** The hero's kit-trade jobs as the server holds them, or null (the switch is off, or a server without the job slice: the pane hides). */
export function tradeJobsOf(cs) {
  const s = read(cs, 'trade_jobs');
  if (!isObj(s) || !Array.isArray(s.recipes)) return null;
  const trades = {};
  if (isObj(s.trades)) for (const [k, v] of Object.entries(s.trades)) if (id(k) && isObj(v) && count(v.level)) trades[k] = { xp: count(v.xp) ?? 0, level: v.level };
  const recipes = [];
  for (const r of s.recipes) {
    if (!isObj(r) || !id(r.id) || !id(r.face) || !id(r.trade)) continue;
    recipes.push({ id: r.id, name: typeof r.name === 'string' ? r.name : r.id, trade: r.trade, kind: id(r.kind), band: count(r.band) ?? 0, face: r.face,
      rLevel: count(r.r_level) ?? 1, inputs: inputsOf(r.inputs), quote: quoteOf(r.quote) });
  }
  const stock = {};
  if (isObj(s.stock)) for (const [k, v] of Object.entries(s.stock)) if (id(k) && isObj(v)) stock[k] = { fine: count(v.fine) ?? 0, master: count(v.master) ?? 0 };
  return { trades, job: jobOf(s.job), last: lastOf(s.last), recipes, stock };
}
