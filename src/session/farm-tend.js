// ════════════════════════════════════════════════════════════════════════
// src/session/farm-tend.js — "TEND THE FIELD": THE SERVER'S BILL, READ SAFELY, AND THE ONE PRESS.
//
// supabase/migrations/1017-tend-the-field.sql. One press harvests every ready plot, plants it again (its own crop, or the
// crop the player chose for every plot it plants) and waters the field, all decided and done by the SERVER:
//   farmTendOf(cs)    the `farm_tend` section (hr_farm_tend_view), or null (no section yet: the press stays off):
//                     { harvest:[i], plant:[{i,crop}], water:[i], empty:[{i,crop,why,need,seed,price}],
//                       seeds:[{seed,crop,use,bag,storage,buy,price,gold}], gold,
//                       choices: Map<crop, {crop,plant,water,bag,storage,buy,gold,price,empty:[i],why}> }
//                     `gold` is what the press will charge, whole, by the server's own plan; `empty` the plots it leaves
//                     empty and why (unplanted, level_too_low, plot_tier_locked, no_seed_for_sale, cannot_afford).
//   tendField(account, cs, crop, gold)   ONE hr_farm_tend(p_slot, p_crop, p_gold, p_idem): crop null = each plot its own
//                     crop; gold = the bill's gold AS THIS READER GAVE IT, never a sum made on the client. The server plans
//                     again under its locks and refuses quote_changed rather than charge another sum; a refusal re-reads
//                     the hero once (quoted-ask.js A20), so the bill on screen is the server's again before it is said.
// Refused settle_first (a hunt still being caught up): the hunter's own settle ONCE, then ONE ask under a NEW key (the
// first wrote nothing; src/session/catch-up.js's rule). On ok the hero is RE-READ and the account told (`onShared('farm')`:
// the field is every hero's), so the field, the bag and the purse change only from the server's envelope.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';
import { catchingUp, newIdem } from './catch-up.js';

const VERB = 'farm_tend';
const ID = /^[a-z_]{1,32}$/;
const ITEM = /^[a-z0-9_]{1,64}$/;
const MAX_PLOTS = 128;   // the server's index fuse (account_farm_plots.plot_idx 0..127)
const WHY = new Set(['unplanted', 'level_too_low', 'plot_tier_locked', 'no_seed_for_sale', 'cannot_afford']);
const STEPS = new Set(['harvest', 'plant', 'water']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const plotOk = (i) => Number.isInteger(i) && i >= 0 && i < MAX_PLOTS;
const list = (v) => (Array.isArray(v) ? v.slice(0, MAX_PLOTS) : []);
const plots = (v) => list(v).filter(plotOk);
const read = (cs, key) => (cs && typeof cs.read === 'function' ? cs.read(key) : undefined);

/* One parse per envelope: the section object is frozen and replaced whole by each envelope. */
const PARSED = new WeakMap();

function emptyOf(e) {
  if (!isObj(e) || !plotOk(e.i) || !WHY.has(e.why)) return null;
  return Object.freeze({ i: e.i, crop: ID.test(String(e.crop)) ? e.crop : null, why: e.why,
    need: count(e.need), seed: ITEM.test(String(e.seed)) ? e.seed : null, price: count(e.price) });
}

function seedOf(l) {
  if (!isObj(l) || !ITEM.test(String(l.seed)) || !ID.test(String(l.crop))) return null;
  const n = ['use', 'bag', 'storage', 'buy', 'gold'].map((k) => count(l[k]));
  if (n.includes(null)) return null;
  return Object.freeze({ seed: l.seed, crop: l.crop, use: n[0], bag: n[1], storage: n[2], buy: n[3], gold: n[4], price: count(l.price) });
}

function choiceOf(c) {
  if (!isObj(c) || !ID.test(String(c.crop))) return null;
  const n = ['plant', 'water', 'bag', 'storage', 'buy', 'gold'].map((k) => count(c[k]));
  if (n.includes(null)) return null;
  return Object.freeze({ crop: c.crop, plant: n[0], water: n[1], bag: n[2], storage: n[3], buy: n[4], gold: n[5],
    empty: Object.freeze(plots(c.empty)), price: count(c.price), why: WHY.has(c.why) ? c.why : null });
}

/** The server's bill for "Tend the field", or null (no section: nothing is offered). */
export function farmTendOf(cs) {
  const raw = read(cs, 'farm_tend');
  if (!isObj(raw)) return null;
  if (PARSED.has(raw)) return PARSED.get(raw);
  const gold = count(raw.gold);
  const out = gold === null ? null : Object.freeze({
    harvest: Object.freeze(plots(raw.harvest)),
    plant: Object.freeze(list(raw.plant).filter((p) => isObj(p) && plotOk(p.i) && ID.test(String(p.crop))).map((p) => Object.freeze({ i: p.i, crop: p.crop }))),
    water: Object.freeze(plots(raw.water)),
    empty: Object.freeze(list(raw.empty).map(emptyOf).filter(Boolean)),
    seeds: Object.freeze(list(raw.seeds).map(seedOf).filter(Boolean)),
    gold,
    choices: new Map(list(raw.choices).map(choiceOf).filter(Boolean).map((c) => [c.crop, c])),
  });
  PARSED.set(raw, out);
  return out;
}

/** True when the bill has something to do: a plot to harvest, plant or water. */
export function tendHasWork(bill) {
  return !!bill && (Number(bill.harvest && bill.harvest.length) + Number(bill.plant && bill.plant.length) + Number(bill.water && bill.water.length)) > 0;
}

/* The answer's own facts, bounded: what the window words ("Harvested 5 Turnip ..."), never the record. */
function answerOf(b) {
  const harvested = list(b.harvested).filter((h) => isObj(h) && plotOk(h.i) && ITEM.test(String(h.produce)) && count(h.qty) !== null)
    .map((h) => ({ i: h.i, produce: h.produce, qty: h.qty, extra: h.extra === true, withered: h.withered === true, regrew: h.regrew === true }));
  return {
    harvested,
    planted: list(b.planted).filter((p) => isObj(p) && plotOk(p.i) && ID.test(String(p.crop))).map((p) => ({ i: p.i, crop: p.crop })),
    watered: plots(b.watered),
    bought: list(b.bought).filter((x) => isObj(x) && ITEM.test(String(x.seed)) && count(x.qty) !== null && count(x.gold) !== null)
      .map((x) => ({ seed: x.seed, qty: x.qty, gold: x.gold })),
    gold: count(b.gold) || 0,
    xp: count(b.xp) || 0,
    empty: list(b.empty).map(emptyOf).filter(Boolean),
    failed: list(b.failed).filter((f) => isObj(f) && plotOk(f.i) && STEPS.has(f.step) && typeof f.error === 'string')
      .map((f) => ({ i: f.i, step: f.step, error: f.error.slice(0, 48) })),
  };
}

/**
 * ONE press of "Tend the field". `crop`: null (each plot its own crop) or a crop id; `gold`: the bill's gold from farmTendOf.
 * @returns {Promise<{ok:true, body:object}|{ok:false, error:string, gold:number|null}>}
 */
export function tendField(account, cs, crop, gold) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot)
    || !(crop === null || ID.test(String(crop))) || !Number.isSafeInteger(gold) || gold < 0) return Promise.resolve({ ok: false, error: 'bad_intent', gold: null });
  const send = () => account.server.rpc('hr_farm_tend', { p_slot: cs.slot, p_crop: crop, p_gold: gold, p_idem: newIdem() });
  return askVia(cs, VERB, async () => {
    let ans = await send();
    if (catchingUp(ans) && typeof cs.hello === 'function') {
      try { await cs.hello(); } catch (e) { /* the second ask's own answer says what the server holds */ }
      ans = await send();
    }
    const b = ans && isObj(ans.body) ? ans.body : {};
    if (!(ans && ans.ok && b.ok === true)) {
      await afterRefusal(cs, ans);   // the screen was behind the server: re-read once (A20)
      return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', gold: count(b.gold) };
    }
    if (typeof cs.load === 'function') await cs.load();
    if (typeof cs.onShared === 'function') cs.onShared('farm', cs.slot);
    return { ok: true, body: answerOf(b) };
  });
}
