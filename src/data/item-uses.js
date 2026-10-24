// ════════════════════════════════════════════════════════════════════════
// src/data/item-uses.js — WHAT A THING IS FOR, IN TWO OR THREE WORDS.
//
// The one label helper behind "Next at level 3: Bronze Axe (woodcutting tool),
// Bronze Pickaxe (mining tool)" (Tyler 10-18: "and 1 more" hid that the unlock
// was a tool, not a weapon). Everything is derived from the item's own row in
// src/data/items.js, so a new item is labelled the day it is added:
//   tool       its toolSkill:              "woodcutting tool"
//   ammo       the last word of its name and the weapon that shoots it
//                                          "arrows for bows", "bolts for crossbows"
//   weapon     its weapon family:          "sword", "bow", "wand", "staff" (a magic
//              weapon by its discipline, hunt-roles.js roleWeaponOf)
//   spellbook  an off-hand with a magic discipline: "spellbook"
//   worn gear  its slot:                   "helmet", "body armour", "ring"
//   food       what it heals:              "food, heals 8"
//   anything else with a source or use     "material"
// A gathering node or crop is not an item: nodeUse(skill) names its kind.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { ITEMS } from './items.js?v=0.2.38';
import { roleWeaponOf } from './hunt-roles.js?v=0.2.38';
import { isShield } from './shields.js?v=0.2.38';

/* The ammo noun (the last word of the item's name) and what fires it. */
const AMMO_FOR = Object.freeze({ arrows: 'bows', bolts: 'crossbows', rune: 'staves', runes: 'staves', whetstone: 'blades', whetstones: 'blades' });
/* items.js weaponType → the weapon in words. */
const WEAPON_WORD = Object.freeze({ sword: 'sword', hammer: 'hammer', ranged: 'bow', wand: 'wand', staff: 'staff', neutral: 'weapon' });
/* items.js slot → the worn piece in words. */
const SLOT_WORD = Object.freeze({ helmet: 'helmet', body: 'body armour', pants: 'leg armour', boots: 'boots', gloves: 'gloves',
  cape: 'cape', shield: 'offhand', necklace: 'amulet', earrings: 'earrings', ring: 'ring', ring1: 'ring', ring2: 'ring', belt: 'belt' });
/* A gathering skill's nodes, by kind. */
const NODE_WORD = Object.freeze({ woodcutting: 'tree to chop', mining: 'rock to mine', fishing: 'fishing spot', farming: 'crop to grow' });

/** What item `id` is for, in a few words, or '' when its row says nothing useful. */
export function itemUse(id) {
  const it = ITEMS[id];
  if (!it) return '';
  if (it.type === 'tool' && it.toolSkill) return it.toolSkill + ' tool';
  if (it.type === 'ammo' || it.slot === 'ammo') {
    const noun = String(it.n || '').trim().split(/\s+/).pop().toLowerCase();
    return AMMO_FOR[noun] ? noun + ' for ' + AMMO_FOR[noun] : 'ammo';
  }
  if (it.type === 'weapon') return WEAPON_WORD[roleWeaponOf(it)] || 'weapon';
  /* Tyler 2026-10-19: a Mage holds a wand and a spellbook; the book is an off-hand with a discipline. */
  if (it.slot === 'shield' && it.discipline) return 'spellbook';
  /* Tyler 2026-10-23: the shield makes the tank (src/data/shields.js) */
  if (isShield(it)) return 'shield';
  if (it.slot) return SLOT_WORD[it.slot] || 'gear';
  if (Number(it.heals) > 0) return 'food, heals ' + it.heals;
  return 'material';
}

/** What a gathering skill's node is: "tree to chop", or ''. */
export function nodeUse(skill) {
  return NODE_WORD[skill] || '';
}
