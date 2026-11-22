// tools/balance-program/levers/index.mjs — THE LEVER REGISTRY'S VOCABULARY AND ITS ROWS (lane BL-2; tools/balance-program/levers.mjs reads it).
// The rows are split by area: combat.mjs (Tyler's categories 1 to 11), world.mjs (12 to 14 and 19), gear-economy.mjs (15 to 18 and 20).
// not-levers.mjs names every binding that holds a typed number and is NOT a lever, each with its reason.
import { COMBAT } from './combat.mjs';
import { WORLD } from './world.mjs';
import { GEAR_ECONOMY } from './gear-economy.mjs';
export { NOT_LEVERS } from './not-levers.mjs';

/* Tyler's twenty categories (2026-11-21 directive, Phase 2), in his order */
export const CATEGORIES = Object.freeze({
  'base-damage': 'Base damage coefficients',
  'skill-scaling': 'Skill scaling',
  'level-scaling': 'Level scaling',
  'weapon-power': 'Weapon power and attack frequency',
  spells: 'Spell coefficients, costs, cooldowns and areas',
  'healing-shielding': 'Healing and shielding',
  'armor-mitigation': 'Armor and mitigation',
  resistances: 'Resistances',
  crit: 'Critical chance and damage',
  leech: 'Life and mana leech',
  regen: 'Regeneration',
  'monster-stats': 'Monster HP, damage, armor, resistances and behavior',
  spawn: 'Spawn pacing and encounter composition',
  'monster-rewards': 'Monster XP and loot values',
  equipment: 'Equipment stats and progression',
  imbuements: 'Imbuement effects',
  consumables: 'Consumable costs and effectiveness',
  party: 'Party bonuses and interactions',
  'rare-drops': 'Rare-drop probabilities',
  economy: 'Economy sources and sinks',
});

/* Field 5 (Tyler's four classes; an exception carries 44-formula-architecture.md's call on whether it was meant) */
export const CLASSES = Object.freeze({
  global: 'global coefficient: one number every hero, monster or ground reads',
  archetype: 'archetype parameter: one row a role, way, weapon family, armor weight, monster role, tier or party size',
  content: 'content attribute: a field every row of a content table carries (one lever, its rows counted)',
  'exception-intentional': 'intentional exception: a special rule on purpose (44 class 3)',
  'exception-accidental': 'accidental exception: a number that patches another number (44 class 4)',
});

/* Field 8 */
export const PERTURB_KINDS = Object.freeze(['knob', 'patch', 'variant', 'not-playable']);
export const GAPS = Object.freeze({
  'sql-only': 'the value lives in a SQL function or table; the engine the matrix runs never reads it',
  'outside-hunt': 'a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House',
  'not-in-runs': 'the engine reads it and cell.mjs could play it, but no matrix RUN plays that mode (the Tower, the Catacombs, scaled hunts, boss halls and calls, the yard, live events)',
  'harness-fixed': 'the harness sets this itself (skills from tools/balance-sim/skill-lines.mjs, kits from grid-kit.mjs), so a patch to the game number does not reach a cell',
  'player-policy': 'a player choice (stance, rotation, food thresholds, party mix past the lineups): the matrix plays one default',
  'no-seam': 'the engine has no seam to switch it on in a cell (Talent unlocks and Linger until R20\'s "when" column)',
  'not-built': 'ruled or staged but not in the engine (fists, PvP, linings, the Luck bar, the hall number)',
  dead: 'nothing on the hunt path reads it: a perturbation changes no outcome',
});

export const LEVERS = Object.freeze([...COMBAT, ...WORLD, ...GEAR_ECONOMY]);
