// ════════════════════════════════════════════════════════════════════════
// src/data/shields.js — THE SHIELDS (Tyler 2026-10-23: "add all 3" from Andy's
// reports; the designer's first five, approved; numbers PROVISIONAL)
//
// THE SHIELD MAKES THE TANK (Tyler 2026-10-23, SHIELDS): a one-hand melee
// weapon and a shield play the tank (src/data/hunt-roles.js ROLE_KEYS: the
// worn set's key turns `shield`); a sword alone plays Melee damage; a bow
// fills both hands (items.js / gear-tiers.js `twoHanded`), so it never wears
// one; a crossbow and a shield play a Ranger WITH GUARD, never a tank.
//
// GUARD is a shield's `defB`: the to-hit defence of gear outside the armour
// weights (src/core/combat.js equipmentStats guardB, ruling K7), so each guard
// point takes COMBAT_BALANCE.monsterAccuracyPerPoint (2%) off every monster's
// chance to land (monsterAccuracy). A heavy shield's ATTACK penalty is the
// same number off every style's attack roll (atkB, rangeAtkB, magicAtkB:
// playerCombatRolls reads the one its weapon's profile names), so the trade
// holds for a crossbow or a wand behind it too.
// A WORN SHIELD COUNTS AS ARMOUR for Defense XP (src/core/vitals.js
// wearsArmour), and a blow it turns aside (a miss on a shield-holder) trains
// Defense COMBAT_XP.blockMult times over (src/core/hunt-rewards.js; Tyler
// 2026-10-18: "shield blocks count extra").
//
// SOURCES (Tyler 2026-10-23: a basic shield at the Shop outfitter, better ones
// made at Smithing, and some drops):
//   Bronze-Rimmed  the Shop's Gear tab, 140 g (supply-basics.js SUPPLY_SHOP_OFFERS)
//   Ironbound      Smithing 15
//   Kingsgrate     the Rat King, RARE band 1.7%, after his Crown Shard (monsters.js)
//   Coppercap      Smithing 30
//   Steelgrate     Smithing 30, reforged from a Kingsgrate
// Book value (`v`): a made shield is worth no more than the book of what goes
// in (the bench is never a gold faucet: tests/style-gear.mjs SG-4's rule), the
// Shop's at SHOP_PREMIUM x its book. Icons are placeholders until the Asset
// Director's style-1 art lands (item-art.js).
//
// PURE ESM, data only. Spread into ITEMS (items.js) and ARTISAN_RECIPES.smithing
// (recipes.js).
// ════════════════════════════════════════════════════════════════════════

/** Is `item` a shield (an off-hand that guards, never a spellbook)? */
export const isShield = (item) => !!item && item.slot === 'shield' && item.offhand === 'shield';

/* guard = defB; atk = the attack penalty on every style's roll; wear = the hero's Level (gear-tiers.js LEVEL_REQ). */
const shield = (n, v, tier, wear, guard, atk, rarity) => Object.freeze({ n, icon: '🛡️', v, type: 'offhand', slot: 'shield', offhand: 'shield',
  defB: guard, ...(atk ? { atkB: -atk, rangeAtkB: -atk, magicAtkB: -atk } : {}), tier, rarity, reqSkill: 'level', reqLv: wear });

export const SHIELD_ITEMS = Object.freeze({
  bronze_rimmed_shield: shield('Bronze-Rimmed Shield', 70, 1, 1, 3, 0, 'common'),
  ironbound_shield: shield('Ironbound Shield', 200, 2, 15, 5, 0, 'common'),
  kingsgrate: shield('Kingsgrate', 300, 2, 15, 7, 4, 'rare'),
  coppercap_shield: shield('Coppercap Shield', 600, 3, 30, 7, 0, 'common'),
  steelgrate: shield('Steelgrate', 750, 3, 30, 9, 5, 'rare'),
});

/* THE MADE SHIELDS' RECIPES (Smithing; the levels they are worn at). */
const r = (id, name, inputs, output, xp, req, ms) => Object.freeze({ id, name, icon: '🛡️', inputs: Object.freeze(inputs), output, xp, req, ms });
export const SHIELD_RECIPES = Object.freeze([
  r('forge_ironbound_shield', 'Forge Ironbound Shield', { iron_bar: 2, normal_plank: 2 }, 'ironbound_shield', 130, 15, 3400),
  r('forge_coppercap_shield', 'Forge Coppercap Shield', { steel_bar: 3, copper_bar: 4, normal_plank: 1 }, 'coppercap_shield', 300, 30, 4200),
  r('reforge_steelgrate', 'Reforge the Kingsgrate as Steelgrate', { kingsgrate: 1, steel_bar: 3 }, 'steelgrate', 320, 30, 4400),
]);

/* Each shield's flavour line (item-descriptions.js spreads them). */
export const SHIELD_DESC = Object.freeze({
  bronze_rimmed_shield: 'A plank round with a hammered bronze rim, the outfitter\'s answer to a first bite',
  ironbound_shield: 'Two iron bands across oak boards, heavy enough to turn a cellar rat\'s lunge',
  kingsgrate: 'The Rat King\'s drain grate, bent into a buckler: it stops a blow and drags at your swing',
  coppercap_shield: 'Steel faced and copper capped in the Warrens\' fashion, the goblin chief\'s own pattern',
  steelgrate: 'The Kingsgrate reforged on a steel frame: it stops more and still drags at your swing',
});
