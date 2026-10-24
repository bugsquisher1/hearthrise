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
// (8 h free stamina, 4 heroes at once, 2 starting slots); copy only.
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { ITEMS } from './items.js?v=0.2.39';
import { HUNT_ROLES, roleForWeapon, roleWeaponOf } from './hunt-roles.js?v=0.2.39';
import { STARTER_SETS } from './start-kit.js?v=0.2.39';

const style = (id, role, weapons, name, does, uses) => Object.freeze({ id, role, weapons: Object.freeze(weapons), name, does, uses });

/* The lead line above the rows: the rule itself. */
export const HOW_YOU_FIGHT_LEAD = 'There is no class to pick. The weapon you hold is how you fight, and all six starter weapons are in your bag. To switch, equip another in town.';

export const HOW_YOU_FIGHT = Object.freeze([
  style('hold', 'tank', ['practice_sword', 'practice_shield'], 'Sword and shield',
    'Holds the monsters on you, so your party is not hit.', 'Uses food.'),
  style('hit', 'melee_dps', ['practice_hatchets', 'practice_club'], 'Two axes or a club',
    'Hits hardest, up close.', 'Uses food.'),
  style('shoot', 'ranger', ['practice_bow', 'practice_crossbow'], 'Bow or crossbow',
    'Shoots from a distance.', 'Uses arrows or bolts, and food.'),
  style('cast', 'mage', ['practice_wand', 'practice_spellbook'], 'Wand and spellbook',
    'Casts spells at the monsters.', 'Spells cost mana: drinks bring it back.'),
  style('heal', 'healer', ['practice_staff'], 'Staff',
    'Heals you and your party.', 'Heals cost mana: drinks bring it back.'),
]);

const note = (id, label, text) => Object.freeze({ id, label, text });

export const HELP_NOTES = Object.freeze([
  note('idle', 'Your hero fights by itself',
    'Pick a hunt and your hero walks, fights and loots on its own. You never click to attack: you choose where it hunts, and the action bar tells it what to use and when.'),
  note('away', 'It keeps hunting with the game closed',
    'Hunts run on our server, so you can close the game and come back to what your hero earned. A hunt stops when stamina runs out, when your hero dies, when it cannot pay for supplies, or when you press Leave hunt.'),
  note('stamina', 'Stamina is hunting time',
    'Every minute of hunting uses a minute of stamina, and every minute out of a hunt gives one back, even with the game closed. A free hero holds up to 8 hours.'),
  note('weapon', 'Your weapon is how you fight',
    'There is no class. A sword and shield hold monsters on you, two axes or a club hit hard, a bow or crossbow shoots from a distance, a wand and spellbook cast spells, and a staff heals. Equip another from your bag to switch.'),
  note('supplies', 'Food and drink',
    'Food heals and drink brings back mana. What you carry is used first, for free. Store supplies cost gold each time your hero uses one, and if the gold runs out the hunt ends. Raw meat and fish cook into food: pick them in your bag and choose Cook all.'),
  note('bar', 'The action bar',
    'Each slot is one spell, food or drink, with up to three conditions such as My HP % below 60. The first slot that can fire, fires, so put the most important one first.'),
  note('gold', 'What gold is for',
    'Store supplies cost gold as your hero uses them. In town the Shop sells gloves, belts, jewellery and tools, and Services sells extra stamina and Blessings. Save up and you can buy another hero slot.'),
  note('armour', 'Armour and Defense',
    'Defense rises only while your hero wears armour and takes blows. Monsters drop helmets, bodies, legs and boots; gloves and belts are armour too, and the Shop sells them. Heavy pieces add health, light pieces add mana.'),
  note('farm', 'Your farm',
    'Open the Farm (J) and plant a seed in an empty plot; your bag starts with turnip seeds. A crop grows while you hunt or play away, and watering makes it grow twice as fast for 2 hours. Harvest puts the same crop back in, from your own seeds or one bought at the Shop\'s price.'),
  note('levels', 'Level and skills',
    'Every kill pays Level XP, and each Level raises your health and mana. Melee, Ranged, Magic and Defense rise by doing them: fighting with that weapon, or taking blows in armour. Level has no cap.'),
  note('town', 'Work in town',
    'Between hunts your hero can chop, mine, fish, cook, smith, craft and bind runes. Open Gathering and crafting (G), press a skill and choose what to do. Gathering keeps going with the game closed; making something uses what is in your bag. A hunt stops either one.'),
  note('heroes', 'Several heroes at once',
    'Your account starts with two hero slots, and up to four heroes can play at the same time. Your own heroes join your party straight away, so one can hold the monsters while another heals.'),
  note('death', 'If your hero dies',
    'The hunt ends and your hero wakes in town, losing a little Level XP. Blessings from Services cut that loss, and they are free below Level 30.'),
]);

/** Every problem with the tables, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const roles = new Set();
  const named = new Set();
  for (const r of HOW_YOU_FIGHT) {
    if (!HUNT_ROLES[r.role]) out.push(r.id + ': role ' + r.role + ' is not in hunt-roles.js');
    roles.add(r.role);
    for (const w of r.weapons) {
      named.add(w);
      const it = ITEMS[w];
      if (!it) { out.push(r.id + ': ' + w + ' is not in items.js'); continue; }
      /* The row's weapon plays the row's role, by the ONE weapon -> role table. */
      if (it.slot === 'weapon' && roleForWeapon(roleWeaponOf(it)) !== r.role) out.push(r.id + ': ' + w + ' plays ' + roleForWeapon(roleWeaponOf(it)) + ', not ' + r.role);
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
