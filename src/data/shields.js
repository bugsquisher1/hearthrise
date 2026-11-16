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
// THE BARROW MARCH'S RUNGS (designer 2026-11-15, lane/d-audit-balance-1; the playthrough audit's F8: no shield from Level 30 to
// 110 while the sword ran to 95 and the spellbook to 88). One plain shield a tier, guard +2 a tier as tiers 1 to 3 climb
// (3, 5, 7, then 9, 11, 13), no attack penalty. Each is a RARE on a body that carries a sword and a shield in its picture
// (the packs' rows, src/data/grounds/*/pack.js), and tier 4 is also forged, as the tier's hatchets are (style-gear.js):
//   Mithril-Faced           worn from 45: the Slake's Color Sergeant; Smithing 45
//   Runebound               worn from 60: the Muster Barrows' Barrow Pikeman, the Pyre Field's Charred Pikeman
//   Emberforged Tower       worn from 75: the Pyre Field's Provost, Krell's Hold's Grave Guard
// Tier 7 is Krell's Tollgate (guard 15, Tyler 2026-11-14) and the Muster's Bier Shield is the Runebound with one attribute
// (both in the special-attribute plan, the hidden attribute catalogue): neither is a row here.
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
  /* book: about 0.75 of the tier's sword, as the Coppercap is of the Steel Sword (600 / 800) */
  mithril_faced_shield: shield('Mithril-Faced Shield', 1100, 4, 45, 9, 0, 'epic'),
  runebound_shield: shield('Runebound Shield', 3750, 5, 60, 11, 0, 'legendary'),
  ember_tower_shield: shield('Emberforged Tower Shield', 9750, 6, 75, 13, 0, 'legendary'),
});

/* THE MADE SHIELDS' RECIPES (Smithing; the levels they are worn at). */
const r = (id, name, inputs, output, xp, req, ms) => Object.freeze({ id, name, icon: '🛡️', inputs: Object.freeze(inputs), output, xp, req, ms });
export const SHIELD_RECIPES = Object.freeze([
  r('forge_ironbound_shield', 'Forge Ironbound Shield', { iron_bar: 9, normal_plank: 3 }, 'ironbound_shield', 130, 15, 3400),
  r('forge_coppercap_shield', 'Forge Coppercap Shield', { steel_bar: 3, copper_bar: 4, normal_plank: 1 }, 'coppercap_shield', 300, 30, 4200),
  r('reforge_steelgrate', 'Reforge the Kingsgrate as Steelgrate', { kingsgrate: 1, steel_bar: 3 }, 'steelgrate', 320, 30, 4400),
  /* tier 4, made as the tier's hatchets are: four bars and two planks book 1,130 against the shield's 1,100 (never a gold faucet) */
  r('forge_mithril_faced_shield', 'Forge Mithril-Faced Shield', { mithril_bar: 4, maple_plank: 2 }, 'mithril_faced_shield', 450, 45, 4600),
]);

/* Each shield's flavour line (item-descriptions.js spreads them). */
export const SHIELD_DESC = Object.freeze({
  bronze_rimmed_shield: 'A round wooden shield with a bronze rim. It\'s what the outfitter sells you for your first fights',
  ironbound_shield: 'Two iron bands across oak boards, heavy enough to turn a cellar rat\'s lunge',
  kingsgrate: 'The Rat King\'s drain grate, bent into a small shield. It blocks hits but slows your swing a little',
  coppercap_shield: 'A steel shield with a copper cap, made the way the Warrens goblins make them. It\'s Chief Coppercap\'s own design',
  steelgrate: 'The Kingsgrate rebuilt on a steel frame. It blocks more and still slows your swing',
  mithril_faced_shield: 'A maple shield with a sheet of mithril over the front. The Banded Company\'s sergeants carried these, and the river never rusted them',
  runebound_shield: 'A rune-metal shield the Banded Company gave its front rank. The pikemen in the barrows were buried holding theirs',
  ember_tower_shield: 'A tall Emberforged shield from Krell\'s forges. It covers you from chin to knee, and it\'s still black from the pyres',
});
