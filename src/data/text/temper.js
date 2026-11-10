// ════════════════════════════════════════════════════════════════════════
// src/data/text/temper.js — THE TEMPERING SECTION'S WORDS, inside the Shop's
// Services tab (src/shell/windows/temper-pane.js).
//
// One row per sentence, read by t('temper.<key>'). The rest of the section's
// words still sit in its code (tests/text-home.mjs ratchets them down); what is
// here moved first: the note under both rows that says where to get what a rung
// is short of (v0.2.108, Tyler 2026-11-07: "what drops the Fine Tempering Salts?").
// ════════════════════════════════════════════════════════════════════════

export const TEMPER_TEXT = Object.freeze({
  /* How the smith makes an input, and that every hero reads it from Storage. */
  way_smith: '{name}: Smithing {req} makes them from {inputs}, and any of your heroes can use them from Storage.',
  way_smith_short: '{name}: Smithing {req} (yours is {level}) makes them from {inputs}, and any of your heroes can use them from Storage.',
  /* Where an input of those only a hunt gets drops: {where} names the creatures and the ground, or the pull that brings them. */
  drop_from: '{stack} drop from {where}.',
  drop_pulled: '{where}, and it drops {stack}.',
  /* Said only for what the Weighhouse lists (item-lore saleWords). */
  way_weighhouse: 'Or buy them at the Weighhouse.',
});
