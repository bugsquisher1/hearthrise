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

// Entries of hr-world-56-v2 (art/world/palette.json) that runtime code pours with, as RGB integers (0xRRGGBB): the one place src/ names them.
// src/world/pour.js reads these; tools/world-art/tower-pours.mjs --check proves each is on the palette.
export const PALETTE_RGB = Object.freeze({
  outline: 0x0b0a0c,
  soot: Object.freeze([0x17141a, 0x231d1f, 0x2f2723, 0x2a1c14, 0x3d2a1d]),   // shadow 1-3, earth 0-1
  coal: Object.freeze([0x17141a, 0x3e1216, 0x5e1a1f, 0x8e1f1f]),             // shadow 1, cloth 0-1, blood 0
  glow: Object.freeze({ hot: 0xffd36a, flame: 0xf2a03a, ember: 0xc23a2a }),
  /* THE GREAT HEARTH'S SMOKE, BY THE FLAME THE SQUARE BURNS (2027-05-05-hearth-moods.sql; src/world/pour.js pours the flue's plume onto
     `smoke_<flame>`): three colours dark to light, the plume's own three greys by rank. The plain fire has no row: it smokes as drawn. */
  smoke: Object.freeze({
    chest: Object.freeze([0x17141a, 0x16241a, 0x2c4a2c]),       // shadow 1, leaf 0, leaf 2: black with dark green, the chest's green fire
    cinnabar: Object.freeze([0x5e1a1f, 0x8e1f1f, 0xc23a2a]),    // cloth 1, blood 0-1
    quicklime: Object.freeze([0xaaa49a, 0xc9bfa0, 0xe6dcbc]),   // stone 4, bone 0-1
    borax: Object.freeze([0x3d6234, 0x557a3e, 0x73944c]),       // leaf 3-5
    honey: Object.freeze([0xa88457, 0xc49a5c, 0xe8c547]),       // earth 5-6, gold
    amber: Object.freeze([0x7a4f26, 0xa8743a, 0xcfa25c]),       // bronze 1-3
    marsh: Object.freeze([0x5c6c7a, 0x8a9aa8, 0xa8e4ff]),       // steel 1-2, frost 1
    mosslight: Object.freeze([0x4f7a80, 0x86b4b4, 0xc8e6e0]),   // mithril 1-3
    verdigris: Object.freeze([0x2e4a52, 0x4f7a80, 0x7ccf4a]),   // mithril 0-1, venom
  }),
});
