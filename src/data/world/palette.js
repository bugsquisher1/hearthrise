// src/data/world/palette.js — the locked colour set of the pixel world.
//
// Every opaque pixel of every world atlas is one of these colours
// (tests/world-assets.mjs). Colours live in material ramps, dark to light, and a
// sprite is graded ONCE by its material class (GRADE) before it is snapped to the
// nearest ramp colour (tools/world-art/lock.mjs). After that, runtime lighting is
// the only colour change: no per-sprite tint, no per-call variant.
//
// Accent ramps (torch, blood, frost, venom, gold) are for light, magic, loot and
// blood only, never a large fill. Widening a ramp is a deliberate act: bump
// PALETTE_ID and rebuild every set (`node tools/world-art/build.mjs`).

export const PALETTE_ID = 'hr-world-40-v1';

export const RAMPS = Object.freeze({
  shadow: Object.freeze(['#0b0a0c', '#17141a', '#231d1f', '#2f2723']),
  stone: Object.freeze(['#3a3a3e', '#4f4e52', '#6a6865', '#8a867d', '#aaa49a']),
  earth: Object.freeze(['#2a1c14', '#3d2a1d', '#553a26', '#6e4c30', '#8a6440', '#a88457', '#c49a5c']),
  leaf: Object.freeze(['#16241a', '#1f3322', '#2c4a2c', '#3d6234', '#557a3e', '#73944c']),
  moss: Object.freeze(['#4a5a2a', '#6b7a38']),
  bone: Object.freeze(['#c9bfa0', '#e6dcbc']),
  water: Object.freeze(['#1a2c44', '#2b4a6a']),
  cloth: Object.freeze(['#3e1216', '#5e1a1f']),
  skin: Object.freeze(['#b5835f', '#dcae86']),
  torch: Object.freeze(['#f2a03a', '#ffd36a']),
  blood: Object.freeze(['#8e1f1f', '#c23a2a']),
  frost: Object.freeze(['#4fa8e8', '#a8e4ff']),
  venom: Object.freeze(['#7ccf4a']),
  gold: Object.freeze(['#e8c547']),
});

/** Every colour, in ramp order. */
export const PALETTE = Object.freeze(Object.values(RAMPS).flat());

// The one grade per material class: saturation multiplier, then value multiplier,
// applied before the nearest-colour snap. A sidecar names its class; it never
// carries its own numbers.
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
// partial alpha in its art, so a soft baked shadow cannot survive the lock.
export const ALPHA_CUT = 128;
