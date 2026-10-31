// ════════════════════════════════════════════════════════════════════════
// src/data/world/sandbox.js — THE 64 PX SANDBOX: A LOOK-AND-WALK TOWN ON THE hd64 GRID.
//
// Tyler wants to judge a higher-detail world before the real one moves to it:
// a small town drawn with 64 px tiles at x1 (src/data/world/art-budget.js
// GRIDS.hd64), so its tile is the Common's size on screen. A signpost in the
// Common takes you in, a sign in the sandbox brings you back; one monster
// idles and wanders there. Nothing in it is a server number: no intent, no
// write, nothing tradeable; the hero's town presence stays parked on the
// entry sign while you are inside (src/world/sandbox-scene.js).
//
// THE ONE SWITCH. The game is closed to the allowlist today, which is all the
// gating the sandbox has. BEFORE THE GAME REOPENS (CLAUDE.md §3.5, half-built
// features stay hidden): set `open: false` (the sign goes, the scene refuses),
// or delete the sandbox: this file, src/world/sandbox-scene.js,
// maps/sandbox_hd64.js and its rows in maps/index.js, GRID_SETS.hd64 in
// atlas-sets.js, art/world/sandbox64 and assets/world/atlas-sandbox64.*.
// tests/world-sandbox.mjs prints a reminder while it is open.
// ════════════════════════════════════════════════════════════════════════

import { at, TOWN_MAP, TOWN_NAME } from './town/plan.js?v=0.2.75';

export const SANDBOX = Object.freeze({
  open: true,
  map: 'sandbox_hd64',
  /* the way in: the Common's own signpost art on an open tile of the Common, never blocking a step */
  /* (in Hearth Square's forecourt, plan 102,58: town/plan.js) */
  entry: Object.freeze({ map: TOWN_MAP, at: at(102, 58), sprite: 'signpost', plate: 'To the sandbox' }),
  /* the way out, beside the sandbox's start */
  exit: Object.freeze({ at: Object.freeze([13, 12]), sprite: 'sandbox_sign', plate: 'Back to ' + TOWN_NAME }),
  /* the hero there: the 64 px hero (the 32 px outfits are not on this grid) */
  hero: 'sandbox_hero',
  /* the one monster, display only: it wanders to an open tile within `leash` tiles of `at`
     after resting restMs[0]..restMs[1] ms, at `speed` tiles per second */
  monster: Object.freeze({ id: 'sandbox_beast', at: Object.freeze([22, 14]), leash: 4, speed: 1.6, restMs: Object.freeze([2000, 5000]) }),
});
