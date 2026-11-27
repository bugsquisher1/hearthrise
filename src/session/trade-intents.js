// ════════════════════════════════════════════════════════════════════════
// src/session/trade-intents.js — THE KIT TRADES' JOB PRESSES (lane/k1-job-slice, supabase/migrations/1073-k1-job-slice.sql).
//
// Two presses, each ONE RPC under a fresh key, never a number the server does not set:
//   startTradeJob(account, cs, recipe, count, fee)  ONE hr_trade_job_start(p_slot, p_recipe, p_count, p_fee, p_idem): the recipe and the
//                                                   count the server's own quote named (trade_jobs.recipes[].quote), its fee echoed so a
//                                                   moved price is refused (quote_changed), never paid
//   endTradeJob(account, cs, early)                 ONE hr_trade_job_end(p_slot, p_early, p_idem): collect a finished job (early false: the
//                                                   server answers not_due until its own clock says it is done) or stop it now (early true)
// The goods, their quality, the XP and every time are the server's (its seed, its clock). On ok the hero is taken from the answer's
// envelope (rule 11); a refusal re-reads once (A20).
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';
import { newIdem } from './catch-up.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

async function press(cs, send) {
  const ans = await send();
  const b = ans && isObj(ans.body) ? ans.body : {};
  if (!(ans && ans.ok && b.ok === true)) {
    await afterRefusal(cs, ans);
    return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', body: b };
  }
  if (typeof cs.load === 'function') await cs.load(isObj(b.envelope) ? b.envelope : null);
  return { ok: true, body: b };
}

const ready = (account, cs) => !!(account && account.server && cs && cs.status !== 'closed' && Number.isInteger(cs.slot));
const RECIPE = /^[a-z][a-z0-9_]{1,63}$/;

/** Start the server's quoted job: `recipe` for `count` attempts at the quoted `fee`. */
export function startTradeJob(account, cs, recipe, count, fee) {
  if (!ready(account, cs) || typeof recipe !== 'string' || !RECIPE.test(recipe) || !Number.isSafeInteger(count) || count < 1
      || !Number.isSafeInteger(fee) || fee < 0) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'trade_job', () => press(cs, () => account.server.rpc('hr_trade_job_start',
    { p_slot: cs.slot, p_recipe: recipe, p_count: count, p_fee: fee, p_idem: newIdem() })));
}

/** Collect the hero's finished job (early false), or stop it now (early true). */
export function endTradeJob(account, cs, early) {
  if (!ready(account, cs) || typeof early !== 'boolean') return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'trade_job_end', () => press(cs, () => account.server.rpc('hr_trade_job_end',
    { p_slot: cs.slot, p_early: early, p_idem: newIdem() })));
}
