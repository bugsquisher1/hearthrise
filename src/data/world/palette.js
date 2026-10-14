// src/data/world/palette.js — how generated colour is mapped onto the world palette.
//
// The colours themselves are an art asset (art/world/palette.json, read by
// tools/world-art/palette.mjs): material ramps, dark to light. Every opaque pixel of
// every world atlas is one of them (tests/world-assets.mjs). A sprite is graded ONCE
// by its material class (GRADE) and then snapped to the nearest ramp colour
// (tools/world-art/lock.mjs). After that, runtime lighting is the only colour
// change: no per-sprite tint, no per-call variant.

// The one grade per material class: saturation multiplier (and an optional hue turn
// in degrees), then value multiplier, applied before the nearest-colour snap. A
// sidecar names its class; it never carries its own numbers.
export const GRADE = Object.freeze({
  unit: Object.freeze({ sat: 0.85, dk: 1.0 }),
  monster: Object.freeze({ sat: 0.85, dk: 0.95 }),
  wood: Object.freeze({ sat: 0.8, dk: 0.92 }),
  stone: Object.freeze({ sat: 0.7, dk: 0.92 }),
  foliage: Object.freeze({ sat: 0.75, dk: 0.85 }),
  terrain: Object.freeze({ sat: 0.7, dk: 0.9 }),
  light: Object.freeze({ sat: 1.0, dk: 1.0 }),
  // drawn in the palette by hand: the snap is the identity
  native: Object.freeze({ sat: 1.0, dk: 1.0 }),
});

// Alpha below this is transparent, at or above it opaque: the world has no
// partial alpha in its art, so a soft, baked shadow cannot survive the lock.
export const ALPHA_CUT = 128;
