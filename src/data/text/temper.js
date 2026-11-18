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
  way_smith: '{name}: Smithing {req}, made from {inputs}, shared in Storage',
  way_smith_short: '{name}: requires Smithing {req} (now {level}), made from {inputs}',
  /* Where an input of those only a hunt gets drops: {where} names the creatures and the ground, or the pull that brings them. */
  drop_from: '{stack} drop from {where}.',
  drop_pulled: '{where}, and it drops {stack}.',
  /* Gear above every ladder the server sells (temper-pane.js rowWords; the playthrough audit's F17): {from} and {to} are the server's span. */
  no_rungs: 'Not temperable yet, rungs only for Level {from} to {to} gear',
  /* A ladder with smaller rungs than the tiers before it (Dawnsteel, src/data/temper.js TEMPER_TIER_RUNG_PM): {step} is a rung's worth, "0.4%". */
  small_rungs: 'Smaller rungs: {step} each',
  /* Said only for what the Weighhouse lists (item-lore saleWords). */
  way_weighhouse: 'Also sold at the Weighhouse',
});
