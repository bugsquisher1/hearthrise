// ════════════════════════════════════════════════════════════════════════
// src/data/skill-guide.js — WHAT EACH SKILL IS FOR, AND WHERE IT IS TRAINED.
//
// One row per SKILLS_DEF skill, read by the Skills window's ledger (src/shell/
// windows/skills.js): the glyph on its line, what raising it does for the
// player, and where it is trained. Player-facing copy in plain words
// (DESIGN_STANDARDS §3); the Game Designer owns the wording and may retune any
// line. A skill with no row here shows its name and level only, and
// tests/alpha-windows.mjs fails when a SKILLS_DEF skill has no row.
// `window`: the shell window a skill is trained in when the Gathering and
// crafting window runs none of its work (Farming is grown in the Farm's plots,
// audit 2026-11-18 A4: its row was the only one that went nowhere); the row
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
  woodcutting: row('uiAxe', 'Logs for Crafting and the House', 'Chop trees.'),
  mining: row('uiPickaxe', 'Ore for Smithing and essence for Runecrafting.', 'Mine rocks.'),
  fishing: row('uiRod', 'Raw fish for Cooking.', 'Fish at a fishing spot.'),
  farming: row('uiSprout', 'Crops for Cooking and for drinks.', 'Plant seeds in the plots', 'farm'),
  cooking: row('uiPot', 'Food that heals and drinks that restore mana on a hunt.', 'Cook what you fish and grow.'),
  crafting: row('uiHammer', 'Planks, arrows, bolts and timber for the House', 'Saw logs and fletch at the workbench.'),
  smithing: row('uiAnvil', 'Bars, tools, whetstones, tempering salts and House fittings', 'Smelt ore and forge bars.'),
  runecrafting: row('uiGem', 'Runes for spells, better than the shop’s', 'Bind essence into runes.'),
});
