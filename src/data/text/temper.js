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
  /* PAST DAWNSTEEL (lane/d-temper-uniques): said only when the server sells a unique band's rungs. {from} is the first band's Level, {bands}
     every band the server sells ("110, 125 and 145"). The smaller step and the span are what a player can't guess from "rung 1 of 5". */
  unique_row: 'Unique armor takes smaller rungs, half a step each, and gets a new ladder at Levels {bands}.',
  unique_row_one: 'Unique armor takes smaller rungs, half a step each, and gets its own ladder at Level {bands}.',
  unique_span: ' The smith also tempers unique armor worn from Level {from}.',
  /* DAWNSTEEL (lane/d-temper-dawnsteel): said only on a ladder the server sells whose rung is smaller than the tiers before it
     (src/data/temper.js TEMPER_TIER_RUNG_PM). {step} is a rung's worth ("0.4%"): the player sees "Next rung 0.8%" and needs the why. */
  small_row: 'The finest gear takes smaller rungs, {step} each.',
  /* SAY WHY (the playthrough audit's F17): gear past the server's ladders. {from} and {to} are the Levels the SERVER's ladders cover
     (temper-sections.js `span`), so the line is true before and after a new tier's rungs are sold. */
  cant_yet: ' yet. The smith only has rungs for gear worn from Level {from} to Level {to}.',
});
