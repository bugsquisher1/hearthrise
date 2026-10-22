// ════════════════════════════════════════════════════════════════════════
// src/data/hero-rename.js — CHANGING A HERO'S NAME (Tyler 2026-10-22: "Name
// change should cost a lot of gold (first choice is free)").
//
// The first name is chosen free when the hero is made (hr_create_hero). Every
// later change is ONE server purchase, hr_hero_rename, paid in gold by the hero
// being renamed: a gold sink. The server prices it from this table
// (supabase/migrations/2026-12-04-hero-rename.sql hr_hero_rename_rule;
// tests/hero-rename.mjs holds the two equal); the client only shows the price.
//
// THE PRICE, integer only:   price = base + perLevel x Level
// Level is the hero's own Level at the moment of the purchase (hr_level_of).
//
// WHY THESE NUMBERS ("a lot" = many hours of the income at the first party floors).
// Measured on the real settle (docs/planning/PRIORITY_BOARD.md, play-ground.mjs):
// a Level-15 hero in the Sewer nets about 2,200-6,100 g an hour solo by style and
// 3,100-4,000 g an hour per hero in a party of four; a lone Level-32 Melee at the
// Coppercap Warrens floor takes in about 3,069 g an hour. Call both floors about
// 3,500 g an hour.
//   Level 15 (Sewer floor):    20,000 + 7,500  = 27,500 g, about 8 hours of hunting.
//   Level 32 (Warrens floor):  20,000 + 16,000 = 36,000 g, about 10-12 hours.
//   Level 100:                 70,000 g.
// For scale: the third hero slot is 15,000 g and the fourth 40,000 g, so a new
// name costs about as much as a new hero. The Level term keeps it "a lot" as
// income grows; a flat price would be small change by Level 60.
// One change per hero per server (UTC) day: the price already stops churn; the
// day limit stops a name being passed back and forth between two of one
// player's heroes to dodge a block or confuse a party.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const HERO_RENAME = Object.freeze({
  /* Gold of a name change before the Level term. */
  base: 20000,
  /* Gold per Level of the hero being renamed. */
  perLevel: 500,
  /* Name changes per hero per server (UTC) day. */
  perDay: 1,
});

/** The gold a name change costs a hero of this Level. Integers in, integer out. */
export function renamePrice(level) {
  return HERO_RENAME.base + HERO_RENAME.perLevel * Math.max(1, Math.floor(Number(level) || 1));
}
