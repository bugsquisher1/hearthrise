// ════════════════════════════════════════════════════════════════════════
// src/data/how-to-play.js — WHAT A NEWCOMER MUST BE TOLD, IN PLAIN WORDS.
//
// Tyler 2026-10-22: "Assume they've never played Tibia, Huntera, or any other
// AFK game" and "the new player experience should explain the different combat
// styles ... and how they are chosen", and that a player can run several heroes
// and party them. The designer's fresh-hero play (PRIORITY_BOARD 2026-10-22)
// found a newcomer learns the weapon rule only by hovering a bow 13 minutes in,
// and is never told the hero keeps hunting with the game closed.
//
// HOW_YOU_FIGHT  the five ways to fight, one row each, in the order the hero
//                creation step shows them (src/app/hero-create.js). No class is
//                picked: the WEAPON held sets the role (src/data/hunt-roles.js
//                WEAPON_ROLES, the one weapon -> role source; validate() holds
//                every row to it), so the row names the starter weapons that play it.
// HELP_NOTES     the Settings > Help page (src/data/settings.js, type 'note'):
//                one short heading and one or two sentences each, searchable.
//
// No number is restated that the game holds elsewhere except the ruled ones
// (8 h free stamina, 4 heroes at once, 1 starting slot); copy only. The armor
// weights' words and numbers are read from src/data/armour-weights.js, the
// death's share from src/data/hunt-sessions.js DEATH_XP_LOSS.
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { ITEMS } from './items.js?v=0.2.137';
import { HUNT_ROLES, roleForWeapon, roleKeyOf } from './hunt-roles.js?v=0.2.137';
import { STARTER_SETS } from './start-kit.js?v=0.2.137';
import { WEIGHT_ORDER, weightSentence } from './armour-weights.js?v=0.2.137';
import { DEATH_XP_LOSS } from './hunt-sessions.js?v=0.2.137';

const style = (id, role, weapons, name, does, uses) => Object.freeze({ id, role, weapons: Object.freeze(weapons), name, does, uses });

/* The lead line above the rows: the rule itself. The sword and shield are WORN, not in the bag (start-kit.js
   START_EQUIPMENT). Every sentence ends: the line under it is the account's hero slots, the SERVER'S line (hero-create.js; QA audit
   2026-11-18 N8: "Switch any time in town Hero slots: 1, buy 3 more, all 4 play at once" ran on, and its numbers were typed here). */
export const HOW_YOU_FIGHT_LEAD = 'No classes, nothing to pick. Every weapon below is yours, the one in hand sets the style. Switch any time in town.';

export const HOW_YOU_FIGHT = Object.freeze([
  style('hold', 'tank', ['practice_sword', 'practice_shield'], 'Sword and shield',
    'Holds monsters off the party', 'Uses food'),
  /* Each name says the weapons the hero holds, by their item names (fresh-account play 11-13: this said "Two axes or a hammer"
     while the bag tip said "Hatchets or a club" over Practice Hatchets and a Practice Club). Ruling 4 (10-24) names the crush
     family Hammer; the starter item is still a Club, so the item's name wins here until the item is renamed. */
  style('hit', 'melee_dps', ['practice_hatchets', 'practice_club'], 'Hatchets or a club',
    'Hits hardest, up close', 'Uses food'),
  style('shoot', 'ranger', ['practice_bow', 'practice_crossbow'], 'Bow or crossbow',
    'Shoots from range', 'Free Bronze Arrows, uses food'),
  style('cast', 'mage', ['practice_wand', 'practice_spellbook'], 'Wand and spellbook',
    'Casts spells', 'Uses mana and drinks'),
  style('heal', 'healer', ['practice_staff'], 'Staff',
    'Heals the party', 'Uses mana and drinks'),
]);

const note = (id, label, text) => Object.freeze({ id, label, text });

export const HELP_NOTES = Object.freeze([
  note('idle', 'Auto-fight',
    'Pick a hunt: the hero walks, fights and loots on its own\nAction bar: what to use and when'),
  note('away', 'Offline hunting',
    'Hunts keep running with the game closed\nEnds on: no stamina, death, no gold for supplies, Leave hunt'),
  note('stamina', 'Stamina',
    'Hunting: one minute of stamina a minute\nOutside a hunt: refills minute for minute, even offline\nMax: 8 hours, 12 with premium\nBeta: every hero has premium'),
  note('weapon', 'Weapons and styles',
    'No classes: the weapon sets the style\nSword and shield: hold monsters\nAxes or hammer: hit hard\nBow or crossbow: shoot from range\nWand and spellbook: cast spells\nStaff: heal\nSwitch: equip another weapon from the bag'),
  note('supplies', 'Food and drink',
    'Food heals, drink restores mana\nCarried supplies: used first, free\nStore supplies: gold each use, the hunt ends when gold runs out\nRaw meat and fish: Bag → Cook all'),
  note('bar', 'Action bar',
    'Each slot: one spell, food or drink, up to 3 conditions\nThe first slot that can fire, fires\nPut the most important slot first'),
  note('loot', 'Selling and keeping loot',
    'Loot lands in the bag as it drops\nMaterials: used by recipes, the House or Tempering\nJunk: Shop → Sell all junk\nSell spare gear: outgrown armor and weapons, never worn or Rare\nPlans: set Sell or Deposit once in an item\'s menu\nDispatch loot: every plan in one press, in town'),
  note('gold', 'Gold',
    'Store supplies: gold as they are used\nShop: gloves, belts, jewelry and tools\nServices: stamina and Blessings\nCharacters: another hero slot'),
  note('armour', 'Armor and Defense',
    'Defense: rises only in armor, from blows taken\nMonster drops: helmets, bodies, legs and boots\nGloves and belts: the Shop\n'
    + WEIGHT_ORDER.map(weightSentence).join('\n') + '\nWeights mix freely, any piece at its Level'),
  note('farm', 'Farm',
    'Farm (J): plant a seed in an empty plot\nStarting kit: turnip seeds\nCrops grow while hunting or offline\nWatering: twice as fast for 2 hours\nHarvest and replant: the same crop again\nHarvest only: the plot is left empty\nSome crops grow back after a harvest'),
  note('levels', 'Level and skills',
    'Every kill earns Level XP\nEach Level: more health and mana\nGear: worn by Level\nOwn skill: arrows, whetstones and runes\nCombat skills: rise with use\nLevel: no cap'),
  note('town', 'Work in town',
    'Between hunts: chop, mine, fish, cook, smith, craft and bind runes\nGathering and crafting (G): press a skill, then a job\nGathering: keeps going offline\nCrafting: uses the bag\nStarting a hunt stops the job\nAfter the hunt: back to the job, wait or train'),
  note('heroes', 'Several heroes',
    'Hero slots: 1 to start, gold buys up to 3 more\nAll 4 heroes play at once\nOwn heroes join the party at once'),
  note('death', 'Death',
    'The hunt ends, the hero returns to town\nCost: ' + Math.round(DEATH_XP_LOSS * 100) + '% of Level XP, can take a Level\nBlessings: Shop → Services, free below Level 30'),
]);

/** Every problem with the tables, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const roles = new Set();
  const named = new Set();
  for (const r of HOW_YOU_FIGHT) {
    if (!HUNT_ROLES[r.role]) out.push(r.id + ': role ' + r.role + ' is not in hunt-roles.js');
    roles.add(r.role);
    /* the row's off-hand (a shield or a spellbook), worn beside each of its weapons: the SHIELD makes the tank */
    const off = r.weapons.map((w) => ITEMS[w]).find((it) => it && it.slot === 'shield') || null;
    for (const w of r.weapons) {
      named.add(w);
      const it = ITEMS[w];
      if (!it) { out.push(r.id + ': ' + w + ' is not in items.js'); continue; }
      /* The row's weapon, with the row's off-hand, plays the row's role, by the ONE weapon -> role table. */
      const plays = roleForWeapon(roleKeyOf(it, off));
      if (it.slot === 'weapon' && plays !== r.role) out.push(r.id + ': ' + w + ' plays ' + plays + ', not ' + r.role);
    }
    if (!r.name || !r.does || !r.uses) out.push(r.id + ': a style needs a name, what it does and what it uses');
  }
  for (const role of Object.keys(HUNT_ROLES)) if (!roles.has(role)) out.push('role ' + role + ' has no how-you-fight row');
  /* Every starter weapon the kit hands out is explained by some row. */
  for (const ids of Object.values(STARTER_SETS)) for (const id of ids) if (!named.has(id)) out.push('starter weapon ' + id + ' is in no how-you-fight row');
  const ids = new Set();
  for (const n of HELP_NOTES) {
    if (ids.has(n.id)) out.push('help note ' + n.id + ': duplicate');
    ids.add(n.id);
    if (!n.label || !n.text) out.push('help note ' + n.id + ': needs a label and a text');
  }
  return out;
}
