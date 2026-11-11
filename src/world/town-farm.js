// ════════════════════════════════════════════════════════════════════════
// src/world/town-farm.js — THE FARM'S CROPS ON THE MAP (display only).
//
// world-boot.js calls this every town frame with the account's field as the server last said it (src/session/farm-sections.js farmFieldOf:
// the `farm_land` section the Farm window reads). Plot `i` of the field is the i-th tilled plot of the town (stations.js FARM_PLOTS:
// [x, y, width] in plan coordinates, two rows deep; the map column is plan x + WEST); every tile of a planted plot shows the crop's plant at the growth stage the SERVER's numbers give:
//   ready              stage 3, ripe (the server's own `ready`, never a client clock)
//   otherwise          the share of the growing time already gone, from `ready_in_s` against the crop's hours (data/gathering.js CROPS):
//                      under a third sprout (0), under two thirds young (1), the rest ripening (2).
// The sprites are crop_<crop>_<stage> (art/world/yard, class decal: flat on the soil, under everyone). Nothing here can be spent or
// read by a gate; a new envelope replaces the whole answer (the result is memoised per field object, so a frame costs nothing).
// PURE: no DOM, no window, no clock.
// ════════════════════════════════════════════════════════════════════════
import { CROPS } from '../data/gathering.js?v=0.2.123';
import { FARM_PLOTS } from '../data/world/stations.js?v=0.2.123';
import { WEST } from '../data/world/town/plan.js?v=0.2.123';

const MEMO = new WeakMap();
const NONE = Object.freeze([]);

/** The growth stage 0-3 of a plot as the server described it (null: not a crop this map draws). */
export function cropStage(plot) {
  const c = plot && CROPS[plot.crop];
  if (!c) return null;
  if (plot.ready) return 3;
  const total = c.hours * 3600;
  const gone = total > 0 ? 1 - Math.min(1, Math.max(0, plot.readyInS) / total) : 1;
  return gone < 1 / 3 ? 0 : gone < 2 / 3 ? 1 : 2;
}

/**
 * The map props of the field: [{ id, x, y }] for every tile of every planted town plot.
 * @param {{plots: Map<number, {crop: string, ready: boolean, readyInS: number, extra: boolean}>}|null} field  farmFieldOf(character)
 */
export function farmCropProps(field) {
  if (!field || !field.plots || field.plots.size === 0) return NONE;
  const had = MEMO.get(field);
  if (had) return had;
  const out = [];
  for (const [i, p] of field.plots) {
    const at = FARM_PLOTS[i];
    const stage = cropStage(p);
    if (!at || p.extra || stage === null) continue;
    const id = 'crop_' + p.crop + '_' + stage;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < at[2]; dx++) out.push(Object.freeze({ id, x: at[0] + WEST + dx, y: at[1] + dy }));
  }
  const list = Object.freeze(out);
  MEMO.set(field, list);
  return list;
}
