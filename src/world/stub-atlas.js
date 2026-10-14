// ════════════════════════════════════════════════════════════════════════
// src/world/stub-atlas.js — WHAT A SPRITE LOOKS LIKE BEFORE ITS ART EXISTS.
//
// A map may name a sprite id that no shipped atlas carries yet (a new prop
// authored ahead of its art), and an atlas may fail to load on a bad
// connection. Neither may blank a scene: book.js gives such an id the
// STUB_SPRITE record (a 20 px box on one tile) and the canvas backend paints
// it here, in the --world-stub-* tokens. This file names tones, never colours.
// ════════════════════════════════════════════════════════════════════════

/** Paint a w x h stub box at (0, 0). `colour(name)` resolves a --world-<name> token. */
export function paintStub(ctx, w, h, colour) {
  ctx.fillStyle = colour('stub-missing');
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = colour('stub-line');
  ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, h - 1, w, 1);
  ctx.fillRect(0, 0, 1, h); ctx.fillRect(w - 1, 0, 1, h);
}
