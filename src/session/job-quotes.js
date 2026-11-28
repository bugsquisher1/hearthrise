// ════════════════════════════════════════════════════════════════════════
// src/session/job-quotes.js — THE JOBS LIST AND ITS QUOTES: THE ONE READER (docs/design/redesign/09-crafting.md 4.17).
//
// The Work window, its Start and everything else that shows a job's quote read it here and nowhere else, so where the quotes come from
// is this file's business alone. Today they ride the envelope (`trade_jobs.recipes[].quote`, 1073-k1-job-slice.sql); they are moving to a
// read the Work window makes when it opens (lane/bench-cut-quotes: 129 quotes in every envelope doubled a town hero's settle cost).
// `account` is taken for that read.
//   jobListOf(account, cs)   { loading, rows }   loading: the server has not sent the list yet (no row is shown, and none can be started)
//     a row   { id, name, trade, kind, band, face, rLevel, inputs, quote }
//     quote   the server's whole-day job { ok: true, count, countCap, fee, endsAt, level }, the refusal the start would answer
//             { ok: false, error, ... }, or null while this row's quote has not arrived
// Nothing here works a quote out: a row with no quote has none.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const id = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,64}$/.test(v) ? v : null);
const ms = (v) => { const n = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(n) ? n : null; };

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

/* WHERE THE LIST COMES FROM: the server's rows as it sent them, or null while it has not. The one line the quotes' own read replaces. */
function sentRows(account, cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('trade_jobs') : null;
  return isObj(s) && Array.isArray(s.recipes) ? s.recipes : null;
}

/** The Jobs list as the server sent it, or { loading: true, rows: [] } while it has not. */
export function jobListOf(account, cs) {
  const sent = sentRows(account, cs);
  if (!sent) return { loading: true, rows: [] };
  const rows = [];
  for (const r of sent) {
    if (!isObj(r) || !id(r.id) || !id(r.face) || !id(r.trade)) continue;
    rows.push({ id: r.id, name: typeof r.name === 'string' ? r.name : r.id, trade: r.trade, kind: id(r.kind), band: count(r.band) ?? 0, face: r.face,
      rLevel: count(r.r_level) ?? 1, inputs: inputsOf(r.inputs), quote: quoteOf(r.quote) });
  }
  return { loading: false, rows };
}
