// ════════════════════════════════════════════════════════════════════════
// src/data/text/luck.js — LUCK'S WORDS (src/data/luck.js; docs/design/itemization-plan.md §15 "On screen"): the character sheet's Magic
// Find line and Luck bar (src/shell/windows/character/sheet.js) and the reveal's "Lucky find" (src/hunt-view/combat-log.js).
//
// One row per label, read by t('luck.<key>'). Labels, not sentences (Tyler 2026-11-14), except the tooltip. Every number is the server's.
// The loot plan's and Dispatch's Luck words are the shop table's (shop.plan_salvage ...), the Lucky job's the jeweler's (jewel.lucky_*).
// ════════════════════════════════════════════════════════════════════════

export const LUCK_TEXT = Object.freeze({
  head: 'Magic Find +{pct}%',
  tip: 'Rare drops come that much more often. Salvage gear your hunts dropped or reach Bestiary stages to earn Luck.',
  bar: 'Luck {luck} / {next}',
  full: 'Luck {luck}, the bar is full',
  /* the reveal of a Rare that Magic Find caused (src/core/drops.js rollDropTable `lucky`) */
  lucky_find: 'Lucky find',
});
