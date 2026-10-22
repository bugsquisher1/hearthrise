// ════════════════════════════════════════════════════════════════════════
// src/data/skill-guide.js — WHAT EACH SKILL IS FOR, AND WHERE IT IS TRAINED.
//
// One row per SKILLS_DEF skill, read by the Skills window's ledger (src/shell/
// windows/skills.js): the glyph on its line, what raising it does for the
// player, and where it is trained. Player-facing copy in plain words
// (DESIGN_STANDARDS §3); the Game Designer owns the wording and may retune any
// line. A skill with no row here shows its name and level only, and
// tests/alpha-windows.mjs fails when a SKILLS_DEF skill has no row.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

const row = (glyph, use, where) => Object.freeze({ glyph, use, where });

export const SKILL_GUIDE = Object.freeze({
  melee: row('uiSword', 'Your melee blows land more often and hit harder.', 'Deal damage with a sword, axes or a club.'),
  ranged: row('uiBow', 'Your shots land more often and hit harder.', 'Deal damage with a bow or crossbow.'),
  magic: row('uiStaff', 'Your spells land more often and hit harder.', 'Spend mana on spells.'),
  defense: row('uiShield', 'Monsters hit you less often.', 'Take blows while wearing armour; a shield block counts double.'),
  prayer: row('uiStar', 'You recover health and mana faster.', 'Bury bones.'),
  woodcutting: row('uiAxe', 'Logs for Crafting and for building your home.', 'Chop trees.'),
  mining: row('uiPickaxe', 'Ore for Smithing and essence for Runecrafting.', 'Mine rocks.'),
  fishing: row('uiRod', 'Raw fish for Cooking.', 'Fish at a fishing spot.'),
  farming: row('uiSprout', 'Crops for Cooking and for drinks.', 'Plant seeds in your plots.'),
  cooking: row('uiPot', 'Food that heals and drinks that restore mana on a hunt.', 'Cook what you fish and grow.'),
  crafting: row('uiHammer', 'Planks, arrows and bolts, and timber for building your home.', 'Saw logs and fletch at the workbench.'),
  smithing: row('uiAnvil', 'Metal bars, axes and pickaxes, whetstones for melee, and fittings for your home.', 'Smelt ore and forge bars.'),
  runecrafting: row('uiGem', 'Runes your spells spend, better than the shop’s.', 'Bind essence into runes.'),
});
