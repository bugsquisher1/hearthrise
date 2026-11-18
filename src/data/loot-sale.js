// ════════════════════════════════════════════════════════════════════════
// src/data/loot-sale.js — WHAT A GROUND'S LOOT SELLS FOR, AT ITS INCOME DIAL
// (designer 2026-11-16, lane/d-supply-prices; Tyler 2026-11-16 chose "cut income instead")
//
// A ground's income dial (balance-sheet.js GROUND_GP_FIT, a pack's `gpFit`) is x the coin its kills pay and x what the loot it drops
// sells for. An item has ONE sale price wherever it is sold (the shop's bid, Dispatch loot, the Weighhouse floor, the bench tax all
// read catalogue.js vendorPriceOf), but many items drop on more than one ground (bones everywhere, the iron pieces from the Sewer to
// the Glade). So an item sells at the HIGHEST dial of the grounds that drop it, staged ones and keyed halls included: a ground with no
// dial (x1) never sees its own loot sell for less because a deeper ground drops it too. Published as one sentence: "Loot sells at its
// ground's income dial; an item more than one ground drops sells at the highest of their dials." A drop that is ALSO gathered, farmed or made at a
// bench (coal and copper ore today) is not only a hunt's: it keeps its whole sale, so the dial never cuts a gatherer's or a crafter's pay.
//
// The dial moves the SALE, never the book value (`v`): book is what an item is worth to a crafter (a bench row's inputs against its
// output, tests/craft-wages.mjs, tests/style-gear.mjs SG-4), the House's and the Weighhouse ceiling's measure, and none of those is the
// faucet. A lower bid never opens a buy-then-sell loop (the vendor already pays under the shop: tests/vendor-shop-arbitrage.mjs).
//
// PURE ESM, dual-runtime (the edge prices every sale with it). Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_GROUNDS, HALL_GROUNDS } from './hunt-grounds.js?v=0.2.140';
import { MONSTERS } from './monsters.js?v=0.2.140';
import { GROUND_GP_FIT } from './balance-sheet.js?v=0.2.140';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from './gathering.js?v=0.2.140';
import { ARTISAN_RECIPES } from './recipes.js?v=0.2.140';
import { recipeOutcomes } from './jewelry.js?v=0.2.140';
import { GEAR_LADDERS } from './gear-tiers.js?v=0.2.140';

/** The monsters a ground places: its pockets' packs, spawns and a hall's adds. */
const placed = (g) => (g.pockets || []).flatMap((p) => [...(p.pack || []), ...(p.spawns || []), ...(p.adds || [])].map((s) => s.monster));

/** A ground's dial, permille (a keyed hall reads its pack's). */
const dialPmOf = (gid, g) => Math.round(1000 * (GROUND_GP_FIT[g.hall || gid] || 1));

/** Every id a gathering node, a crop or a bench row produces: their sale is a skill's pay too, so no dial reaches it. */
export function producedIds(recipes = ARTISAN_RECIPES) {
  const s = new Set();
  for (const n of [].concat(TREES || [], ROCKS || [], FISH_SPOTS || [])) if (n && n.prod) s.add(n.prod);
  for (const c of Object.values(CROPS || {})) if (c && c.prod) s.add(c.prod);
  for (const rows of Object.values(recipes || {})) for (const r of rows || []) for (const id of recipeOutcomes(r)) s.add(id);
  return s;
}

/** `{ itemId: permille }` for every item some ground drops whose sale is dialed (under 1000); an item missing here sells at 1000. */
export function saleFitPm(grounds = { ...HUNT_GROUNDS, ...HALL_GROUNDS }, monsters = MONSTERS, produced = producedIds()) {
  const best = Object.create(null);
  for (const [gid, g] of Object.entries(grounds)) {
    const pm = dialPmOf(gid, g);
    for (const m of new Set(placed(g))) for (const d of (monsters[m] && monsters[m].drops) || []) {
      if (d && typeof d.id === 'string') best[d.id] = Math.max(best[d.id] || 0, pm);
    }
  }
  const out = Object.create(null);
  for (const [id, pm] of Object.entries(best)) if (pm < 1000 && !produced.has(id)) out[id] = pm;
  return Object.freeze(out);
}

export const SALE_FIT_PM = saleFitPm();

/** The sale of one item at its dial: whole gold, never under 1 when there was a sale at all. */
export function dialedSale(bid, id) {
  const pm = Object.prototype.hasOwnProperty.call(SALE_FIT_PM, id) ? SALE_FIT_PM[id] : 1000;
  return pm >= 1000 || !(bid > 0) ? bid : Math.max(1, Math.floor((bid * pm) / 1000));
}

/* THE SALE LADDER HOLDS UNDER THE DIAL (designer 2026-10-23: a better piece never sells for less than its lower-tier twin; tests/hunt-core/drop-tables.mjs
   sale-ladder). The iron pieces also drop on undialed grounds and keep their whole bid, so a Steel piece the Glade and the Warrens drop could sell under
   its Iron twin at the dial. `{ itemId: the piece a tier under it in its line }` (gear-tiers.js GEAR_LADDERS); catalogue.js vendorPriceOf floors a dialed
   piece's sale at its twin's. Only a dialed piece is floored, and only where the dial put it under. */
export const LOWER_TWIN = Object.freeze(GEAR_LADDERS.reduce((acc, l) => {
  let prev = null;
  for (const id of l.ids) { if (!id) continue; if (prev) acc[id] = prev; prev = id; }
  return acc;
}, Object.create(null)));
