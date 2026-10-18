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
  attack: row('uiSword', 'Lands more of your melee blows.', 'Hunt with a melee weapon.'),
  strength: row('strength', 'Raises your biggest melee hit.', 'Hunt with a melee weapon.'),
  defense: row('uiShield', 'Monsters hit you less often.', 'Hunt; every fight trains it.'),
  hitpoints: row('uiHeart', 'Raises your health.', 'Hunt; every fight trains it.'),
  prayer: row('uiStar', 'Some monster blows glance off you, more at every tier.', 'Offer bones with Prayer.'),
  magic: row('uiStaff', 'Your spells land more often and hit harder.', 'Hunt with a staff.'),
  ranged: row('uiBow', 'Your shots land more often and hit harder.', 'Hunt with a bow.'),
  woodcutting: row('uiAxe', 'Logs for Crafting and for building your home.', 'Chop trees.'),
  mining: row('uiPickaxe', 'Ore for Smithing and essence for Runecrafting.', 'Mine rocks.'),
  fishing: row('uiRod', 'Raw fish for Cooking.', 'Fish at a fishing spot.'),
  farming: row('uiSprout', 'Crops for Cooking and for drinks.', 'Plant seeds in your plots.'),
  cooking: row('uiPot', 'Food that heals and drinks that restore mana on a hunt.', 'Cook what you fish and grow.'),
  crafting: row('uiHammer', 'Planks, leather gear and the parts other skills need.', 'Craft at the workbench.'),
  smithing: row('uiAnvil', 'Metal bars, weapons and armour.', 'Smith at the forge.'),
  runecrafting: row('uiGem', 'Runes your spells spend, better than the shop’s.', 'Bind essence into runes.'),
});
