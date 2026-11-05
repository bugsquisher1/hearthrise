// ════════════════════════════════════════════════════════════════════════
// src/session/bench-sections.js — THE WORK BENCH TAX AS THE SERVER STATES IT.
//
// Reads the envelope's `bench_tax` section (hr_bench_tax_view, 2027-02-19-bench-tax.sql): what each recipe this hero's level
// opens takes at a public bench, in milligold; per skill the share, the room and whether the account owns it; the carried
// remainder; the gold the hero set to keep; its latest bench run. Every envelope replaces it and nothing here computes a fee.
// ════════════════════════════════════════════════════════════════════════
import { ARTISAN_RECIPES } from '../data/recipes.js?v=0.2.97';
import { ITEMS } from '../data/items.js?v=0.2.97';
import { indexArtisanRecipes, artisanIntervalMs } from '../core/artisan-sim.js?v=0.2.97';
import { recipeInputs } from '../core/artisan.js?v=0.2.97';
import { heldOf } from './item-sections.js?v=0.2.97';

const BENCH = indexArtisanRecipes(ARTISAN_RECIPES);
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

/**
 * HAS THE BENCH JOB THIS READ NAMES RUN OUT? A closed page's job is settled only when the hero next opens, so a roster read still says "artisan" for
 * a job long done (crafter's panel 2026-11-01: "working on Oak Plank" with every log planked, then "idle" after Play). True once the time since the
 * server's watermark covers every craft the read's supply (and the run's count) still allows, at the tool-only pace: perks only make it shorter, so
 * this errs towards "working". `cs`: anything with read(section). `nowMs`: the server's clock. Display only; nothing gates on it.
 */
export function benchJobOver(cs, nowMs) {
  const st = cs.read('state');
  const b = isObj(st) && st.active_kind === 'artisan' && Object.prototype.hasOwnProperty.call(BENCH, st.active_id) ? BENCH[st.active_id] : null;
  const since = isObj(st) ? Date.parse(st.accrued_to) : NaN;
  if (!b || !Number.isFinite(since) || !Number.isFinite(nowMs)) return false;
  const held = heldOf(cs);
  let runs = Infinity;
  for (const [id, need] of Object.entries(recipeInputs(b.recipe))) runs = Math.min(runs, Math.floor((held[id] || 0) / Math.max(1, need)));
  const run = cs.read('bench_run');
  if (isObj(run) && Number.isInteger(run.left) && run.left > 0) runs = Math.min(runs, run.left);
  if (runs === Infinity) return false;
  const inv = cs.read('inventory'), eq = cs.read('equipment');
  const each = artisanIntervalMs({ inventory: isObj(inv) ? inv : {}, equipment: isObj(eq) ? eq : {} }, b.skill, b.recipe, { items: ITEMS });
  return nowMs - since >= runs * each;
}
