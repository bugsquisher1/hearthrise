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
// (8 h free stamina, 4 heroes at once, all 4 slots free from the start); copy only. The armor
// weights' words and numbers are read from src/data/armour-weights.js, the
// death's share and hours from src/data/hunt-sessions.js DEATH_XP_LOSS and DEATH_HOURS, the Blessing's free Level from
// src/data/blessings.js BLESSING (lane/level-costs: one Blessing).
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { ITEMS } from './items.js';
import { HUNT_ROLES, roleForWeapon, roleKeyOf } from './hunt-roles.js';
import { STARTER_SETS, START_CURRENCY } from './start-kit.js';
import { WEIGHT_ORDER, weightSentence } from './armour-weights.js';
import { DEATH_XP_LOSS, DEATH_HOURS } from './hunt-sessions.js';
import { BLESSING } from './blessings.js';
import { STAMINA_MAX_MS } from './hunt-sessions.js';
import { RULED } from './time-blocks.js';
import { DEPTHS } from './danger.js';
import { TALENT_RULES } from './talents.js';
import { RECRUITS } from './recruits.js';

const style = (id, role, weapons, name, does, uses) => Object.freeze({ id, role, weapons: Object.freeze(weapons), name, does, uses });

/* The lead line above the rows: the rule itself. The sword and shield are WORN, not in the bag (start-kit.js
   START_EQUIPMENT). Every sentence ends: the line under it is the account's hero slots, the SERVER'S line (hero-create.js; QA audit
   2026-11-18 N8: "Switch any time in town Hero slots: 1, buy 3 more, all 4 play at once" ran on, and its numbers were typed here). */
export const HOW_YOU_FIGHT_LEAD = 'No classes. Every weapon is yours. The one in hand sets how this hero fights. Switch any time in town.';

/* ── THE WEAPON PICK AT CREATION (GR-24; designer ruling D-1, review/05-designer-rulings.md sections 1.2 and 1.5) ──
   One card for each STARTER_SETS row (a new way to fight is one more row there and here). `does` and `uses` say what the way
   does and what it spends. `mark`: the Club is the "Good first hero". `tag`: the honest line from the start-kit cell of check C1;
   a STUB until FB-3's C1 reads on the fixed engine: Sword and shield and Staff carry it (the tank's slow lone pace is RULED
   2026-11-19), the other four none. `cost`: the D-1 cost line. The wand's {gold} is C1's net gold to Level 5, rounded to 25,
   100 until C1 reads (PLAYED once: 251 gold spent on runes and drinks against 146 earned), and {purse} the account kit's gold. */
const SLOW_ALONE = 'Best in a party. Slow alone.';
/* THE KIT IS CRAFTED (Tyler's supplies ruling, 20-v030-the-roads.md 1.4; lane/first-hour-rewrite): runes are made in town, and the store's are
   the fallback a hunt buys as it casts. No price is typed here: the store prices at the buyer's step (src/data/store-kit.js). */
const RUNE_STORE = 'Uses runes. Make them in town, or the store sells them as you cast.';
/** @param {string} set @param {string} name @param {string} does @param {string} uses @param {{ tag?: string, mark?: string, cost?: string }} [more] */
const pick = (set, name, does, uses, more = {}) => Object.freeze({ set, name, does, uses, tag: more.tag || null, mark: more.mark || null, cost: more.cost || null });
export const STARTER_PICKS = Object.freeze([
  pick('tank', 'Sword and shield', 'Holds monsters off the party', 'Uses food', { tag: SLOW_ALONE }),
  pick('dual_axes', 'Hatchets', 'Hits hardest, up close', 'Uses food', { cost: RUNE_STORE }),
  pick('club', 'Club', 'Hits hardest, up close', 'Uses food', { mark: 'Good first hero' }),
  pick('ranger', 'Bow and crossbow', 'Shoots from range', 'Free Bronze Arrows, uses food'),
  /* the old line's "costs about 100 gold more than it earns" was a stub never measured on the wage (kit 0.2 to 0.3 of pay, 12-targets); no
     number is said until one is measured */
  pick('mage', 'Wand and spellbook', 'Casts spells', 'Uses mana and drinks', {
    cost: 'Each Fireball uses 1 rune and some mana. Make runes in town, or the store sells them as you cast. You start with ' + START_CURRENCY.gold + ' gold.' }),
  pick('healer', 'Staff', 'Heals the party', 'Uses mana and drinks', { tag: SLOW_ALONE, cost: RUNE_STORE }),
]);
/* Heroes two to four are RECRUITS (Tyler RD-Q6 a, 2026-11-22): their jobs are src/data/recruits.js RECRUITS.jobs, the server's to pick. */

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
    'Hunting: one minute of stamina a minute\nOutside a hunt: refills minute for minute, even offline\nMax: ' + STAMINA_MAX_MS.free / 3600000
    + ' hours, ' + STAMINA_MAX_MS.premium / 3600000 + ' with premium\nMore: buy a hunting block, ' + RULED.hunt.blockMin / 60 + ' hours, '
    + RULED.hunt.perDay + ' a day'),
  /* THE DANGER SCALE (02 package 3, 12-targets 2.6; lane/first-hour-rewrite) */
  note('depth', 'Depth and Risk',
    'Depth: how hard a hunt is, from 1 to ' + DEPTHS + '\nThe party climbs while pulls go well and falls back before a death\nDeeper: more XP, gold and loot a kill\n'
    + 'Risk: Careful, Steady or Bold, set once a ground\nSteady: the default\nBold: deeper and better pay, the only Risk that can die'),
  /* THE ROADS (17-talent-tree.md; the Talents tab while the server offers it) */
  note('talents', 'Talents',
    'A Talent point every Level from ' + TALENT_RULES.opensAt + '\nCharacter → Talents → Spend as suggested\nA fork: pick one of its options, or keep the suggested one'),
  note('weapon', 'Weapons and styles',
    'No classes: the weapon sets the style\nSword and shield: hold monsters\nAxes or hammer: hit hard\nBow or crossbow: shoot from range\nWand and spellbook: cast spells\nStaff: heal\nSwitch: equip another weapon from the bag'),
  note('supplies', 'Food and drink',
    'Food heals, drink restores mana\nCarried supplies: used first, free\nStore supplies: gold each use, the hunt ends when gold runs out\nRaw meat and fish: Bag → Cook all'),
  note('bar', 'Action bar',
    'Each slot: one spell, food or drink, up to 3 conditions\nThe first slot that can fire, fires\nPut the most important slot first'),
  note('loot', 'Selling and keeping loot',
    'Loot lands in the bag as it drops\nMaterials: used by recipes, the House or Tempering\nJunk: Shop → Sell all junk\nSell spare gear: outgrown armor and weapons, never worn or Rare\nPlans: set Sell or Deposit once in an item\'s menu\nDispatch loot: every plan in one press, in town'),
  note('gold', 'Gold',
    'Store supplies: gold as they are used\nShop: gloves, belts, jewelry and tools\nServices: stamina and Blessings'),
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
    'All 4 hero slots are yours from the start\nLevel ' + RECRUITS.atLevel + ': ' + RECRUITS.count + ' recruits join in one press\nAll 4 heroes play at once\nOwn heroes join the party at once'),
  note('death', 'Death',
    'Only on Bold: Careful and Steady fall back first\nThe hunt ends, the hero returns to town\nCost: ' + Math.round(DEATH_XP_LOSS * 100) + '% of Level XP, at most ' + DEATH_HOURS + ' hours of progress, can take a Level\nBlessing: Shop → Services, free below Level ' + BLESSING.freeUntilLevel),
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
  /* the pick: one card for each starter set and no other, every pre-filled pick a card, and one healer among them */
  const picks = STARTER_PICKS.map((r) => r.set);
  if (picks.slice().sort().join() !== Object.keys(STARTER_SETS).sort().join()) out.push('the weapon pick cards are not the STARTER_SETS rows: ' + picks.join(', '));
  for (const r of STARTER_PICKS) if (!r.name || !r.does || !r.uses) out.push('pick ' + r.set + ': a card needs a name, what it does and what it uses');
  const ids = new Set();
  for (const n of HELP_NOTES) {
    if (ids.has(n.id)) out.push('help note ' + n.id + ': duplicate');
    ids.add(n.id);
    if (!n.label || !n.text) out.push('help note ' + n.id + ': needs a label and a text');
  }
  return out;
}
