// ════════════════════════════════════════════════════════════════════════
// src/data/skill-guide.js — WHAT EACH SKILL IS FOR, AND WHERE IT IS TRAINED.
//
// One row per SKILLS_DEF skill and per shipping trade (src/data/trades.js TRADES, the company's: the bench cut, 09-crafting 4.17),
// read by the Skills window's ledger (src/shell/windows/skills.js): the glyph on its line, what raising it does for the
// player, and where it is trained. Player-facing copy in plain words
// (DESIGN_STANDARDS §3); the Game Designer owns the wording and may retune any
// line. A skill with no row here shows its name and level only, and
// tests/alpha-windows.mjs fails when a SKILLS_DEF skill has no row.
// `window`: the shell window a trade is also trained in beside the Work window's
// jobs (Farming is grown in the Farm's plots, audit 2026-11-18 A4); the row
// opens that window instead.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

const row = (glyph, use, where, window) => Object.freeze({ glyph, use, where, window: window || null });

export const SKILL_GUIDE = Object.freeze({
  melee: row('uiSword', 'Melee blows land more often and hit harder', 'Deal damage with a sword, hatchets, a hammer or a club.'),
  ranged: row('uiBow', 'Shots land more often and hit harder', 'Deal damage with a bow or crossbow.'),
  magic: row('uiStaff', 'Spells land more often and hit harder', 'Spend mana on spells.'),
  defense: row('uiShield', 'Monsters hit less often', 'Take blows in armor, a shield block counts double'),
  inner_flame: row('uiCamp', 'Faster health and mana recovery', 'Fuel the Great Hearth in Havora with bones and other fuel.'),
  /* the trades (src/data/trades.js TRADES that ship): every one is worked as jobs in the Work window */
  mining: row('uiPickaxe', 'Ore for Smithing and essence for Runecutting', 'Mine jobs in the Work window.'),
  woodcutting: row('uiAxe', 'Logs for Woodcrafting', 'Chop jobs in the Work window.'),
  fishing: row('uiRod', 'Raw fish for Cooking', 'Catch jobs in the Work window.'),
  farming: row('uiSprout', 'Crops for Cooking and for drinks', 'Plant seeds in the plots, or Pull jobs in the Work window.', 'farm'),
  cooking: row('uiPot', 'Food that heals and drinks that restore mana on a hunt', 'Cook and Press jobs in the Work window.'),
  smithing: row('uiAnvil', 'Bars, arrowheads, whetstones and tempering salts', 'Smelt, Forge, Grind and Mix jobs in the Work window.'),
  woodcrafting: row('uiHammer', 'Planks, arrows and bolts', 'Saw and Fletch jobs in the Work window.'),
  runecutting: row('uiGem', 'Runes for spells, better than the store’s', 'Cut jobs in the Work window.'),
  artificing: row('uiRing', 'Imbuements for your gear', 'Imbuement jobs in the Work window.'),
});
