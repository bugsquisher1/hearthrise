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
// point adds one to the hero's defense rating every monster's aim is rolled
// against (src/data/to-hit.js, monsterAccuracy). A heavy shield's ATTACK penalty is the
// same number off every style's attack roll (atkB, rangeAtkB, magicAtkB:
// playerCombatRolls reads the one its weapon's profile names), so the trade
// holds for a crossbow or a wand behind it too.
// A WORN SHIELD COUNTS AS ARMOUR for Defense XP (src/core/vitals.js
// wearsArmour), and a blow it turns aside (a miss on a shield-holder) trains
// Defense COMBAT_XP.blockMult times over (src/core/hunt-rewards.js; Tyler
// 2026-10-18: "shield blocks count extra").
//
// SOURCES. SHIELDS DROP AT EVERY TIER; A SMITH ONLY REFORGES A NAMED ONE (Tyler 2026-11-18, answering the
// itemization audit; it replaces his 10-23 "better shields made at Smithing, and some drops"). One rule from
// tier 2 up (lane/d-drop-homes, designer 2026-11-18): each tier's plain shield is a Scarce drop, about hourly,
// with ONE home, a weapon row like any other (src/data/loot-bands.js: one Scarce weapon a monster, the 5% row
// ceiling). The named shields are Rares (the bench and its reforges left with the bench cut, 09-crafting 4.17).
//   tier 1  Bronze-Rimmed  the Shop's Gear tab, 140 g (supply-basics.js SUPPLY_SHOP_OFFERS; Tyler 10-23, the kit tier)
//   tier 2  Ironbound      the Sewer's Drain Rats            Kingsgrate: the Rat King, a RARE 1.6% (named)
//   tier 3  Coppercap      the Warrens' Chief's crew (the skulkers, foremen and Chief carry it, as they share the bodies)
//                          Steelgrate: a Rare of Chief Coppercap (named). Cauldron Lid: the called Chief (named)
//   tier 4  Mithril-Faced  Hask's Ford's Bannerman (still a Rare on the Slake's Color Sergeant)
//   tier 5  Runebound      the Pyre Field's Lurchers (still a Rare on the Muster Barrows' Pikeman)
//   tier 6  Emberforged    Krell's Hold's Grave Guards (still a Rare on the Pyre Field's Provost)
//   tier 7  Krell's Tollgate, Lord Krell's prize (named, the special-attribute plan below)
// THE BARROW MARCH'S RUNGS (designer 2026-11-15, lane/d-audit-balance-1; the playthrough audit's F8: no shield from Level 30 to
// 110 while the sword ran to 95 and the spellbook to 88). One plain shield a tier, guard +2 a tier as tiers 1 to 3 climb
// (3, 5, 7, then 9, 11, 13), no attack penalty.
// Tier 7 is Krell's Tollgate (guard 15, Tyler 2026-11-14) and the Muster's Bier Shield is the Runebound with one attribute
// (both in the special-attribute plan, src/data/special-attributes.js): neither is a row here.
// Book value (`v`): the Shop's at the store's ask (store-kit.js storeAsk: storeCeiling x its book). Icons are placeholders until the
// Asset Director's style-1 art lands (item-art.js).
//
// PURE ESM, data only. Spread into ITEMS (items.js).
// ════════════════════════════════════════════════════════════════════════

import { withGearStats } from './gear-profiles.js';
import { MATERIAL_TIERS, STEP_MATERIALS, stepOf } from './gear-tiers.js';

/** Is `item` a shield (an off-hand that guards, never a spellbook)? */
export const isShield = (item) => !!item && item.slot === 'shield' && item.offhand === 'shield';

/* wear = the hero's Level (gear-tiers.js LEVEL_REQ). The guard (defB) and a grate's attack penalty (atkB, rangeAtkB, magicAtkB: every
   style's roll) are DERIVED (src/data/gear-profiles.js: the shield profile, or the grate's, on the guard curve at the piece's item Level,
   which lands the guards this table held, 3 to 13 at +2 a tier). No piece carries an offset (docs/design/redesign/28-named-pieces.md). */
/* ONE MATERIAL A TIER (12-targets 8.3): a shield of tier t is its material's item Level and worn from it less wearAhead, named or plain
   (gear-tiers.js MATERIAL_TIERS, stepOf); the hand Level each row once typed is gone */
const shield = (n, v, tier, rarity, gearProfile) => {
  const m = MATERIAL_TIERS[tier - 1];
  return Object.freeze({ n, icon: '🛡️', v, type: 'offhand', slot: 'shield', offhand: 'shield', ...(gearProfile ? { gearProfile } : {}), tier, rarity,
    reqSkill: 'level', reqLv: m.level, ...stepOf(m) });
};

export const SHIELD_ITEMS = Object.freeze(withGearStats({
  bronze_rimmed_shield: shield('Bronze-Rimmed Shield', 70, 1, 'common'),
  ironbound_shield: shield('Ironbound Shield', 200, 2, 'common'),
  kingsgrate: shield('Kingsgrate', 300, 1, 'rare', 'grate'),   // tier 1 (lane/scale-grounds-sweep): the Sewer's base is bronze (12-targets 8.3), so the King's grate is too
  coppercap_shield: shield('Coppercap Shield', 600, 3, 'common'),
  steelgrate: shield('Steelgrate', 750, 3, 'rare', 'grate'),
  /* book: about 0.75 of the tier's sword, as the Coppercap is of the Steel Sword (600 / 800) */
  mithril_faced_shield: shield('Mithril-Faced Shield', 1100, 4, 'epic'),
  runebound_shield: shield('Runebound Shield', 3750, 5, 'legendary'),
  ember_tower_shield: shield('Emberforged Tower Shield', 9750, 6, 'legendary'),
  /* THE TIERS WITH HOMES (gear-tiers.js STEP_MATERIALS, lane/gear-phase-b): a plain shield for each that has none above ("<metal> Shield", no
     attack penalty: Dawnsteel, Cobalt, Wolfram), dropped on the tier's homes (base-drops.js); book about 0.75 of the tier's sword, as the
     Coppercap is of the Steel Sword */
  ...Object.fromEntries(STEP_MATERIALS.filter((m) => m.tier > 6).map((m) => [m.id + '_shield',
    shield(m.name + ' Shield', Math.max(1, Math.round((75 * m.value) / 5) * 5), m.tier, m.rarity)])),
}));

/* THE SHIELD LADDER (systems, lane/no-named-trait-bases, 2026-11-27; 12-targets 8.9 item 8): each tier's ONE plain shield (SOURCES above),
   tier 1 up, null where a tier has none. It is the shield rung of a ground's plain base (src/data/base-drops.js PLAIN_PIECES): a home drops
   it (basePiecesOf) and a Trait piece may land on it. A named shield (Kingsgrate, Steelgrate, the Cauldron Lid) is never on it, so it is
   never a Trait base: its one door is its own row. A plain shield is the profile's (no gearProfile) and of its own tier, or this throws. */
const SHIPPED_PLAIN = ['bronze_rimmed_shield', 'ironbound_shield', 'coppercap_shield', 'mithril_faced_shield', 'runebound_shield', 'ember_tower_shield'];
export const SHIELD_LADDER = Object.freeze(MATERIAL_TIERS.map((m, i) => {
  const id = i < SHIPPED_PLAIN.length ? SHIPPED_PLAIN[i] : m.id + '_shield';
  const it = Object.prototype.hasOwnProperty.call(SHIELD_ITEMS, id) ? SHIELD_ITEMS[id] : null;
  if (!it) { if (i < SHIPPED_PLAIN.length) throw new Error('shields.js: the tier ' + m.tier + ' plain shield ' + id + ' is no shield row'); return null; }
  if (it.tier !== m.tier || it.gearProfile) throw new Error('shields.js: ' + id + ' is no plain tier ' + m.tier + ' shield');
  return id;
}));

/* Each shield's flavour line (item-descriptions.js spreads them). */
export const SHIELD_DESC = Object.freeze({
  bronze_rimmed_shield: 'A round wooden shield with a bronze rim. It\'s what the outfitter sells you for your first fights',
  ironbound_shield: 'Two iron bands across oak boards, heavy enough to turn a cellar rat\'s lunge',
  kingsgrate: 'The Rat King\'s drain grate, bent into a small shield. It blocks hits but slows your swing a little',
  coppercap_shield: 'A steel shield with a copper cap, made the way the Warrens goblins make them. It\'s Chief Coppercap\'s own design',
  steelgrate: 'Chief Coppercap\'s copy of the Rat King\'s grate, built on a steel frame. It blocks more and still slows your swing',
  mithril_faced_shield: 'A maple shield with a sheet of mithril over the front. The Banded Company\'s sergeants carried these, and the river never rusted them',
  runebound_shield: 'A rune-metal shield the Banded Company gave its front rank. The pikemen in the barrows were buried holding theirs',
  ember_tower_shield: 'A tall Emberforged shield from Krell\'s forges. It covers you from chin to knee, and it\'s still black from the pyres',
});
