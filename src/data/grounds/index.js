// ════════════════════════════════════════════════════════════════════════
// src/data/grounds/index.js — EVERY GROUND PACK, ONE IMPORT AND ONE ROW EACH (lane/b-ground-pack). Nothing globs: a pack is
// served only once it is named here. Written by `node tools/pack.mjs new <id>` (and checked by tests/ground-pack.mjs):
// the rows are in id order, so two lanes adding two packs merge as two lines.
//
// The data files fold these in (hunts.js, hunt-grounds.js, monsters.js, items.js, item-descriptions.js, world/maps/index.js,
// balance-sheet.js); see ./shape.js for a pack's shape.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
/* pack imports (tools/pack.mjs index) */
import pack_hasks_ford from './hasks_ford/pack.js?v=0.2.123';
import pack_krells_hold from './krells_hold/pack.js?v=0.2.123';
import pack_muster_barrows from './muster_barrows/pack.js?v=0.2.123';
import pack_pyre_field from './pyre_field/pack.js?v=0.2.123';
import pack_the_slake from './the_slake/pack.js?v=0.2.123';

export const GROUND_PACKS = Object.freeze([
  /* pack rows (tools/pack.mjs index) */
  pack_hasks_ford,
  pack_krells_hold,
  pack_muster_barrows,
  pack_pyre_field,
  pack_the_slake,
]);
