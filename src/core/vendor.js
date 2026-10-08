// ============================================================
// src/core/vendor.js — WHAT THE NPC VENDOR BIDS. One formula, two engines.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
//
// Consumers (the SAME function, never a mirror):
//   • supabase/functions/hr-accrue/catalogue.js `vendorPriceOf` — the price
//     vendor-sell.js credits. This is the authority.
//   • src/screens/shop-counter.js `vendorPrice` via window.HearthriseCore.vendor
//     — the number the bag, the context menu and every Sell button show.
// Before this module the formula existed twice (catalogue.js and the shop
// counter) held together by a regex guard; now it exists once (CLAUDE.md §6:
// the browser never says one thing while the server says another).
//
// ── THE RULE (Game Designer ruling, econ-sim lane, 2026-10-08) ─────────────
//   base(id)   = raw ? max(1, floor(v × VENDOR_RAW_RATE)) : v
//   anchor(r)  = floor( Σ qty × bid(input) × CRAFT_ANCHOR_BP / (BP × outputQty) )
//   bid(id)    = min( base(id), min over every recipe r that outputs id of anchor(r) )
//
// Crafted items used to bid 100% of book value while their raw inputs bid 20%,
// so every bench was a ×5 gold multiplier on gathering: tools/econ-sim.mjs had a
// casual player at 125M by day 90 and a grinder on the 25M/day cap from day 2.
// The anchor caps what a craft can ADD at +50% over what its inputs fetch.
//
// Decisions, stated so a reviewer can disagree with a sentence, not a diff:
//   1. RECURSIVE. `bid(input)` is itself anchored, so a bar anchors a platebody
//      and ore anchors the bar. Computed as the GREATEST FIXED POINT of the rule
//      over the whole catalogue (iterate from base bids, lower until nothing
//      moves), which is order-independent — client and server cannot disagree
//      about iteration order because the answer does not depend on it.
//   2. SEVERAL RECIPES → the CHEAPEST input path wins (min over recipes).
//   3. NO RECIPE → base bid, unchanged. A recipe with NO INPUTS (quarrying) is
//      a GATHER (Game Designer ruling, craft-anchor follow-up): its output bids
//      like a raw item — VENDOR_RAW_RATE x book — whether or not items.js flags
//      it raw, so a new quarry rung cannot become a book-value faucet.
//   4. CYCLES are safe by construction: bids only ever decrease, are integers
//      and are floored at 0, so the iteration terminates; MAX_ROUNDS is a
//      belt on top, and every value it could leave is still ≤ base (≤ book).
//   5. DROPPED-AND-CRAFTED: the anchor is a property of the ITEM, not of how
//      it was obtained. A monster-dropped Dawnsteel Platebody sells at the
//      same anchored bid as a forged one — a vendor cannot tell them apart, and
//      provenance is not something the server tracks per stack.
//   6. ROUNDING is integer floor of a basis-point product (no float markup), so
//      a craft never sells for more than 1.5× its inputs. An anchor that floors
//      to 0 (e.g. 10 whetstones out of a cheap block) bids 0 — "the vendor does
//      not buy it" — rather than a floor-at-1 that would pay outputQty× more
//      than the inputs fetch.
//   7. FAIL CLOSED. A recipe input missing from the catalogue is worth 0, so a
//      data typo makes an output cheaper, never dearer.
//   8. SCRIP STOCK (Game Designer ruling, Security wave-1 review): a
//      bind-on-pickup item the Quartermaster sells for dungeon scrip bids 0,
//      wherever it came from — otherwise the vendor converts scrip to gold (up
//      to 162 g/scrip on dragonfang_pike). Derived from QM_STOCK + `bop`, never
//      a hand list; tradeable QM stock (blueprints) is unaffected.
//   9. THE CACHE IS VALIDATED, NOT TRUSTED. Bids are memoised per catalogue
//      identity AND a fingerprint of every field the rule reads (item ids, v,
//      raw, bop; recipe outputs, outputQty, inputs), so a catalogue mutated in
//      place is re-priced on the next call rather than answered from stale bids.
//
// The two rates are BALANCE numbers owned by the Game Designer.
// ============================================================

import { recipeInputs } from './artisan.js?v=564';
import { QM_STOCK } from '../data/dungeons.js?v=564';

/** Item ids the Quartermaster sells for scrip (decision 8). */
const SCRIP_STOCK = Object.freeze(Object.fromEntries((QM_STOCK || []).map((o) => [o.id, true])));
/** Does the vendor refuse this item record as scrip-bought, bind-on-pickup stock? */
export function scripOnlyItem(id, item) {
  return !!(item && item.bop && hasOwn(SCRIP_STOCK, id));
}

/** Raw materials vendor at this share of book value (pacing overhaul §6.1). */
export const VENDOR_RAW_RATE = 0.20;
/** A crafted item vendors at most this many basis points of its inputs' bids. 15000 = 1.5×. */
export const CRAFT_ANCHOR_BP = 15000;
const BP = 10000;
/** A belt over a loop that provably terminates; see decision 4. */
export const MAX_ROUNDS = 4096;

const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/** The pre-anchor bid of one item record: raw rate, or book value. 0 = not bought. */
export function baseVendorBid(item) {
  if (!item || typeof item !== 'object') return 0;
  const v = Number(item.v) || 0;
  if (!(v > 0)) return 0;
  /* Floored at 1: a raw worth anything at all is still worth something. */
  return item.raw ? Math.max(1, Math.floor(v * VENDOR_RAW_RATE)) : Math.floor(v);
}

/**
 * `{ [outputId]: [{ id, inputs, outQty }] }` over every authored recipe that
 * has an output AND at least one input. Null-prototype (ids match
 * /^[a-z0-9_]+$/, which spells `constructor`).
 */
export function anchorPaths(sources) {
  const out = Object.create(null);
  const src = sources || {};
  for (const skill of Object.keys(src)) {
    const list = src[skill];
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      if (!r || typeof r.output !== 'string' || !r.output) continue;
      const ins = recipeInputs(r);
      const keys = Object.keys(ins || {});
      if (keys.length === 0) continue;                       // decision 3: a gather
      const outQty = r.outputQty == null ? 1 : Number(r.outputQty);
      if (!(Number.isFinite(outQty) && outQty > 0)) continue; // no output, no path
      const inputs = keys.map((k) => [k, Math.max(0, Number(ins[k]) || 0)]);
      (out[r.output] || (out[r.output] = [])).push({ id: r.id, inputs, outQty });
    }
  }
  return out;
}

/** Null-prototype `{ [outputId]: true }` for every recipe with NO inputs — a
    gather wearing a bench (decision 3). */
export function gatheredOutputs(sources) {
  const out = Object.create(null);
  const src = sources || {};
  for (const skill of Object.keys(src)) {
    const list = src[skill];
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      if (!r || typeof r.output !== 'string' || !r.output) continue;
      if (Object.keys(recipeInputs(r) || {}).length === 0) out[r.output] = true;
    }
  }
  return out;
}

/**
 * Every item's vendor bid, as a null-prototype `{ [id]: gold }`.
 * Pure in (items, sources); see the header for the rule.
 */
export function computeVendorBids(items, sources) {
  const bids = Object.create(null);
  if (!items || typeof items !== 'object') return bids;
  const gathered = gatheredOutputs(sources);
  for (const id of Object.keys(items)) {
    const it = items[id];
    if (scripOnlyItem(id, it)) { bids[id] = 0; continue; }   // decision 8
    bids[id] = baseVendorBid(gathered[id] === true && it && typeof it === 'object' ? { v: it.v, raw: true } : it);
  }
  const paths = anchorPaths(sources);
  const outs = Object.keys(paths).filter((id) => hasOwn(bids, id));
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let moved = false;
    for (const id of outs) {
      let best = bids[id];
      if (best === 0) continue;
      for (const p of paths[id]) {
        let sum = 0;
        for (const [k, q] of p.inputs) sum += q * (hasOwn(bids, k) ? bids[k] : 0); // decision 7
        const anchored = Math.floor((sum * CRAFT_ANCHOR_BP) / (BP * p.outQty));
        if (anchored < best) best = anchored;
      }
      if (best < bids[id]) { bids[id] = best; moved = true; }
    }
    if (!moved) break;
  }
  return bids;
}

/**
 * A fingerprint of every catalogue field the rule reads (decision 9): two
 * independent 32-bit mixes plus the counts, so an in-place edit — an item
 * added, a `v`/`raw`/`bop` changed, a recipe input or outputQty moved —
 * changes it. ~0.1 ms over the shipped catalogue, against ~1.7 ms to re-price.
 */
export function catalogueFingerprint(items, sources) {
  let a = 0x811c9dc5, b = 0x9e3779b9, n = 0;
  const num = (x) => {
    const c = (Number(x) * 1000) | 0;
    a ^= c; a = Math.imul(a, 0x01000193);
    b = Math.imul(b + c, 0x85ebca6b) ^ (b >>> 13);
  };
  /* Every character of every id: an id renamed in place must move it. */
  const mix = (s) => {
    const t = typeof s === 'string' ? s : String(s);
    for (let i = 0; i < t.length; i++) num(t.charCodeAt(i));
    num(-1);
  };
  for (const id of Object.keys(items || {})) {
    const it = items[id];
    n++;
    mix(id);
    if (it && typeof it === 'object') { num(it.v); num(it.raw ? 1 : 0); num(it.bop ? 1 : 0); } else num(-2);
  }
  for (const skill of Object.keys(sources || {})) {
    const list = sources[skill];
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      if (!r || typeof r.output !== 'string') continue;
      n++;
      mix(r.output); num(r.outputQty == null ? 1 : r.outputQty);
      const ins = recipeInputs(r) || {};
      for (const k of Object.keys(ins)) { mix(k); num(ins[k]); }
    }
  }
  return `${n}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}

/* Memoised on the two catalogue IDENTITIES and validated by the fingerprint
   (decision 9). A copy passed by a test is a new identity; an in-place edit
   (econ-sim --selftest plants an item in the live ITEMS) is a new fingerprint. */
const memo = new WeakMap();
function bidsFor(items, sources) {
  let inner = memo.get(items);
  if (!inner) { inner = new WeakMap(); memo.set(items, inner); }
  const key = sources && typeof sources === 'object' ? sources : NO_SOURCES;
  const fp = catalogueFingerprint(items, key);
  let hit = inner.get(key);
  if (!hit || hit.fp !== fp) { hit = { fp, bids: Object.freeze(computeVendorBids(items, key)) }; inner.set(key, hit); }
  return hit.bids;
}
const NO_SOURCES = Object.freeze({});

/**
 * The whole validated bid table (frozen, null-prototype) — for a caller that
 * prices MANY items in one pass (the bag render), so it pays the fingerprint
 * once instead of per item. Same rule, same cache as vendorBidOf.
 */
export function vendorBids(items, sources) {
  if (!items || typeof items !== 'object') return Object.freeze(Object.create(null));
  return bidsFor(items, sources);
}

/**
 * What the NPC vendor pays for ONE `id`. 0 means "the vendor does not buy it",
 * which is a refusal, not a free sale. Own keys only: `constructor` is 0.
 */
export function vendorBidOf(items, sources, id) {
  if (!items || typeof items !== 'object' || typeof id !== 'string') return 0;
  if (!hasOwn(items, id)) return 0;
  const bids = bidsFor(items, sources);
  return hasOwn(bids, id) ? bids[id] : 0;
}
