// ════════════════════════════════════════════════════════════════════════
// src/session/farm-intents.js — THE FARM VERBS: PLANT, WATER, HARVEST, IMPROVE.
//
// Each is ONE intent naming only this character's slot, a plot index, a crop id
// (planting) or the plot tier it expects to buy — never a price, a count or a
// time. The server prices, gates, rolls and journals:
//   plantCrop(account, cs, plot, crop)    hr_farm_plant: one own seed into an empty plot
//   waterPlot(account, cs, plot)          hr_farm_water: a 2 h double-speed window
//   harvestPlot(account, cs, plot, again) again: hr_farm_harvest_replant (the same crop goes
//                                         back in, from an own seed or one bought at the
//                                         Shop's price); else hr_farm_harvest (plot left empty)
//   upgradePlot(account, cs, level)       hr_farm_upgrade_plot: the next plot tier, gold
//                                         first and Farmer's Deeds when gold is short
// On ok the character is RE-READ, so the field changes only from the server's
// envelope; the answer's body comes back for the window's one line ("Harvested 3
// Turnip"). Each is one ask in the account's intent ledger (askVia), so the
// pressed control waits on it.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.30';

const CROP = /^[a-z_]{1,32}$/;
const MAX_PLOT = 63;
const newIdem = () => globalThis.crypto.randomUUID();
const plotOk = (i) => Number.isInteger(i) && i >= 0 && i <= MAX_PLOT;
const usable = (account, cs) => !!account && !!account.server && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot);

/* The answer's own small facts, bounded (the window words them); never the record. */
function factsOf(b) {
  const out = {};
  for (const [k, v] of Object.entries(b || {})) {
    if (Number.isSafeInteger(v) || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 64) out[k] = v;
    else if (k === 'replant' && v && typeof v === 'object' && !Array.isArray(v)) out.replant = factsOf(v);
  }
  return out;
}

async function settled(ans, cs) {
  const b = ans && ans.body && typeof ans.body === 'object' && !Array.isArray(ans.body) ? ans.body : {};
  if (ans && ans.ok && b.ok === true) {
    if (typeof cs.load === 'function') await cs.load();
    return { ok: true, body: factsOf(b) };
  }
  return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', body: factsOf(b) };
}

const refuse = () => Promise.resolve({ ok: false, error: 'bad_intent', body: {} });

/** Plant one own seed of `crop` in empty plot `plot`. */
export function plantCrop(account, cs, plot, crop) {
  if (!usable(account, cs) || !plotOk(plot) || !CROP.test(String(crop))) return refuse();
  return askVia(cs, 'farm_plant', async () => settled(await account.server.rpc('hr_farm_plant', { p_slot: cs.slot, p_plot_idx: plot, p_crop: crop, p_idem: newIdem() }), cs));
}

/** Water plot `plot` (the server refuses while the last window is open). */
export function waterPlot(account, cs, plot) {
  if (!usable(account, cs) || !plotOk(plot)) return refuse();
  return askVia(cs, 'farm_water', async () => settled(await account.server.rpc('hr_farm_water', { p_slot: cs.slot, p_plot_idx: plot, p_idem: newIdem() }), cs));
}

/** Harvest plot `plot`; with `again` the same crop is planted back at once. */
export function harvestPlot(account, cs, plot, again) {
  if (!usable(account, cs) || !plotOk(plot) || typeof again !== 'boolean') return refuse();
  const args = { p_slot: cs.slot, p_plot_idx: plot, p_idem: newIdem() };
  return again
    ? askVia(cs, 'farm_replant', async () => settled(await account.server.rpc('hr_farm_harvest_replant', args), cs))
    : askVia(cs, 'farm_harvest', async () => settled(await account.server.rpc('hr_farm_harvest', args), cs));
}

/** Buy plot tier `level` (the server's next one; a second press for the same tier is refused stale_level). */
export function upgradePlot(account, cs, level) {
  if (!usable(account, cs) || !Number.isInteger(level) || level < 2 || level > 9) return refuse();
  return askVia(cs, 'farm_upgrade_plot', async () => settled(await account.server.rpc('hr_farm_upgrade_plot', { p_slot: cs.slot, p_idem: newIdem(), p_expect_level: level }), cs));
}
