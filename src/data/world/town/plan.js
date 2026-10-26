// ════════════════════════════════════════════════════════════════════════
// src/data/world/town/plan.js — HAVORA'S NAME, ITS GRID AND ITS DISTRICTS.
//
// The real town (Tyler 2026-10-25, approved; docs/planning/PRIORITY_BOARD.md
// "Real town plan (2026-10-25)", rev 2 for 60 players): Town Blueprint v0.5
// (docs/design/refs/TOWN-BLUEPRINT-v0.5-2026-10-15.png) scaled x2, one
// blueprint square = 2 x 2 tiles, plus the 24-tile Westwood strip west of the
// shack wall: 192 x 116 tiles.
//
// PLAN COORDINATES. Every place in the plan is written on the blueprint grid,
// x -24..167 (the Westwood is x < 0) and y 0..115. The map's columns start at
// the Westwood's west edge, so map column = plan x + WEST. The town's data
// files (sites.js, ../stations.js) are authored in plan coordinates and turned
// into map tiles with at(), so they read exactly like the plan.
//
// TOWN_NAME is the one place the city's player-facing name lives (Tyler
// 2026-10-25: "Havora", for now): a rename is this one line. The map id stays
// `town_common` (server rows and saved positions key on it).
// PURE ESM. Display data only: nothing here is a server number.
// ════════════════════════════════════════════════════════════════════════

export const TOWN_NAME = 'Havora';
export const TOWN_MAP = 'town_common';

/** The Westwood's width: plan x -24 is map column 0 (the map is 192 x 116: town/ground.js). */
export const WEST = 24;

/** Plan coordinates → the map tile [column, row]. */
export const at = (x, y) => Object.freeze([x + WEST, y]);

/**
 * THE DISTRICTS: where each part of the town is, in plan coordinates [x, y, w, h]. A station's
 * stands must lie inside its district (tests/town-stations.mjs), so a stand list can never wander
 * into the next district's road or yard.
 */
export const DISTRICTS = Object.freeze({
  westwood: Object.freeze({ name: 'The Westwood', rect: Object.freeze([-24, 10, 24, 86]) }),
  gatehouse: Object.freeze({ name: 'The Gatehouse', rect: Object.freeze([70, 8, 24, 24]) }),
  tavern: Object.freeze({ name: 'The Tavern', rect: Object.freeze([58, 18, 18, 18]) }),
  mill: Object.freeze({ name: 'The Mill', rect: Object.freeze([84, 20, 18, 18]) }),
  smithy: Object.freeze({ name: 'The Smithy Yard', rect: Object.freeze([52, 36, 32, 12]) }),
  hearth_square: Object.freeze({ name: 'Hearth Square', rect: Object.freeze([100, 36, 32, 24]) }),
  barracks: Object.freeze({ name: 'The Barracks', rect: Object.freeze([106, 60, 26, 16]) }),
  mine: Object.freeze({ name: 'The Mine', rect: Object.freeze([128, 30, 36, 24]) }),
  training: Object.freeze({ name: 'The Training Yard', rect: Object.freeze([58, 60, 22, 18]) }),
  sewer: Object.freeze({ name: 'The Sewer Works', rect: Object.freeze([40, 54, 20, 20]) }),
  river: Object.freeze({ name: 'The River Bank', rect: Object.freeze([84, 54, 6, 10]) }),
  farm: Object.freeze({ name: 'The Farm Plots', rect: Object.freeze([18, 80, 40, 10]) }),
  shore: Object.freeze({ name: 'The Shore', rect: Object.freeze([40, 90, 56, 4]) }),
});
