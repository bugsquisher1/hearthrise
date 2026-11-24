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
// ceiling). The named shields are Rares and reforges. The Ironbound, Coppercap and Mithril-Faced recipes are cut.
//   tier 1  Bronze-Rimmed  the Shop's Gear tab, 140 g (supply-basics.js SUPPLY_SHOP_OFFERS; Tyler 10-23, the kit tier)
//   tier 2  Ironbound      the Sewer's Drain Rats            Kingsgrate: the Rat King, a RARE 1.6% (named)
//   tier 3  Coppercap      the Warrens' Chief's crew (the skulkers, foremen and Chief carry it, as they share the bodies)
//                          Steelgrate: Smithing 30, reforged from a Kingsgrate (named). Cauldron Lid: the called Chief (named)
//   tier 4  Mithril-Faced  Hask's Ford's Bannerman (still a Rare on the Slake's Color Sergeant)
//   tier 5  Runebound      the Pyre Field's Lurchers (still a Rare on the Muster Barrows' Pikeman)
//   tier 6  Emberforged    Krell's Hold's Grave Guards (still a Rare on the Pyre Field's Provost)
//   tier 7  Krell's Tollgate, Lord Krell's prize (named, the special-attribute plan below)
// THE BARROW MARCH'S RUNGS (designer 2026-11-15, lane/d-audit-balance-1; the playthrough audit's F8: no shield from Level 30 to
// 110 while the sword ran to 95 and the spellbook to 88). One plain shield a tier, guard +2 a tier as tiers 1 to 3 climb
// (3, 5, 7, then 9, 11, 13), no attack penalty.
// Tier 7 is Krell's Tollgate (guard 15, Tyler 2026-11-14) and the Muster's Bier Shield is the Runebound with one attribute
// (both in the special-attribute plan, src/data/special-attributes.js): neither is a row here.
// Book value (`v`): a reforged shield is worth no more than the book of what goes
// in (the bench is never a gold faucet: tests/style-gear.mjs SG-4's rule), the
// Shop's at the store's ask (store-kit.js storeAsk: storeCeiling x its book). Icons are placeholders until the Asset
// Director's style-1 art lands (item-art.js).
//
// PURE ESM, data only. Spread into ITEMS (items.js) and ARTISAN_RECIPES.smithing
// (recipes.js).
// ════════════════════════════════════════════════════════════════════════

import { withGearStats } from './gear-profiles.js';
import { STEP_MATERIALS, stepOf } from './gear-tiers.js';

/** Is `item` a shield (an off-hand that guards, never a spellbook)? */
export const isShield = (item) => !!item && item.slot === 'shield' && item.offhand === 'shield';

/* wear = the hero's Level (gear-tiers.js LEVEL_REQ). The guard (defB) and a grate's attack penalty (atkB, rangeAtkB, magicAtkB: every
   style's roll) are DERIVED (src/data/gear-profiles.js: the shield profile, or the grate's, on the guard curve at the piece's item Level,
   which lands the guards this table held, 3 to 13 at +2 a tier). No piece carries an offset (docs/design/redesign/28-named-pieces.md). */
const shield = (n, v, tier, wear, rarity, gearProfile) => Object.freeze({ n, icon: '🛡️', v, type: 'offhand', slot: 'shield', offhand: 'shield',
  ...(gearProfile ? { gearProfile } : {}), tier, rarity, reqSkill: 'level', reqLv: wear });

export const SHIELD_ITEMS = Object.freeze(withGearStats({
  bronze_rimmed_shield: shield('Bronze-Rimmed Shield', 70, 1, 1, 'common'),
  ironbound_shield: shield('Ironbound Shield', 200, 2, 15, 'common'),
  kingsgrate: shield('Kingsgrate', 300, 2, 15, 'rare', 'grate'),
  coppercap_shield: shield('Coppercap Shield', 600, 3, 30, 'common'),
  steelgrate: shield('Steelgrate', 750, 3, 30, 'rare', 'grate'),
  /* book: about 0.75 of the tier's sword, as the Coppercap is of the Steel Sword (600 / 800) */
  mithril_faced_shield: shield('Mithril-Faced Shield', 1100, 4, 45, 'epic'),
  runebound_shield: shield('Runebound Shield', 3750, 5, 60, 'legendary'),
  ember_tower_shield: shield('Emberforged Tower Shield', 9750, 6, 75, 'legendary'),
  /* THE LADDER ON STEPS (gear-tiers.js STEP_TIERS, lane/gear-phase-b): one plain shield a step tier, "<metal> Shield", no attack penalty,
     dropped on the tier's homes (base-drops.js); book about 0.75 of the tier's sword, as the Coppercap is of the Steel Sword */
  ...Object.fromEntries(STEP_MATERIALS.map((m) => [m.id + '_shield',
    Object.freeze({ ...shield(m.name + ' Shield', Math.max(1, Math.round((75 * m.value) / 5) * 5), m.tier, m.level, m.rarity), ...stepOf(m) })])),
}));

/* THE REFORGE (Smithing; Tyler 2026-11-18: a smith only reforges a named shield). The plain shields drop (SOURCES above). */
const r = (id, name, inputs, output, xp, req, ms) => Object.freeze({ id, name, icon: '🛡️', inputs: Object.freeze(inputs), output, xp, req, ms });
export const SHIELD_RECIPES = Object.freeze([
  r('reforge_steelgrate', 'Reforge the Kingsgrate as Steelgrate', { kingsgrate: 1, steel_bar: 3 }, 'steelgrate', 320, 30, 4400),
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
