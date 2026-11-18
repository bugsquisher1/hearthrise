// ════════════════════════════════════════════════════════════════════════
// src/data/world/hearth-moods.js — THE GREAT HEARTH'S MOODS ON SCREEN: THE CHEST'S GREEN FIRE AND THE SMOKE THAT FOLLOWS EVERY FLAME
//   (display only; lane/c-hearth-moods, 2026-11-17. Tyler 2026-11-18: "When someone opens the chest for example I think the fire should turn
//   green and blow our dark green and black smoke.")
//
// The SERVER picks the one flame the square burns (2027-05-05-hearth-moods.sql hr_hearth_flame_of: the chest's window, else a named
// flame, else a bought powder, else the plain fire) and src/world/hearth-burn.js draws that answer. Nothing here picks, spends or gates.
//   CHEST_FLAMES  the chest's window as a flame row, drawn as src/data/hearth.js FLAMES are. Its art is the art lane's `chest` colour of
//                 tools/world-art/hearth-flames.mjs; until the atlas has it, the plain fire draws in its place (never a missing sprite).
//                 It stays out of src/data/hearth.js, which the edge bundles.
//   SMOKE_CLIP    the Great Hearth's flue plume (src/data/world/ambient-life.js EMITTERS great_hearth), the one life clip a flame tints:
//                 poured `smoke_<flame>` (src/world/pour.js, PALETTE_RGB.smoke); a flame with no ladder smokes as drawn
//   SMOKE_BURST   the chest's puff when a window opens: `plumes` extra plumes [dx, dy] art px from the flue, each rising one whole pixel a
//                 life beat (risePx over ms) and gone after `ms` (one turn of the plume's 24 frames at 8 fps). Once a window.
//   CHEST_FLASH   the Hearth Chest's locks when a window opens (lane/a-chest-glow-139, Tyler 2026-11-18: "have the lock flash warm gold when
//                 the special key turns"): its `anim` clip (tools/world-art/tower-art.mjs FLASH: warm gold fading back to green, 6 frames at
//                 8 fps) played once on each of its `layers` for `ms`, from the frame that first sees the window, as the puff is; a layer
//                 without the clip (its smoke) keeps its loop and never bumps meanwhile (src/world/core/compose.js state.ambientPlay)
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { CHEST_LAYERS } from './town/sites.js?v=0.2.137';

const flame = (id, words) => Object.freeze({ fire: 'hearth_fire_' + id, flare: 'hearth_flare_' + id, sparks: 'hearth_burn_sparks_' + id, words });
export const CHEST_FLAMES = Object.freeze({ chest: flame('chest', 'burns green') });

export const SMOKE_CLIP = 'hearth_smoke';

export const SMOKE_BURST = Object.freeze({
  ms: 3000,
  risePx: 24,
  plumes: Object.freeze([Object.freeze([-7, 0]), Object.freeze([7, -3]), Object.freeze([0, -6])]),
});

export const CHEST_FLASH = Object.freeze({ anim: 'flash', ms: 750, layers: CHEST_LAYERS });
