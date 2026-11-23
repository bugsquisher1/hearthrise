// ════════════════════════════════════════════════════════════════════════
// src/data/fists.js — THE FIST LINE, PHASE 1: THE SAMPLE (docs/design/itemization-plan.md §7 and §11 phase 1)
//
// Tyler 2026-11-18: "Fist weapons are Hearthrise's self-sufficient all-rounder. They offer steady single-target damage,
// elemental flexibility, and enough personal sustain to make solo hunting comfortable. In a four-player party, they can fill
// a gap, while dedicated damage dealers, tanks, and healers remain stronger in their roles." Q7 (same day): the promise is
// "best lone gold of any lone melee, comfortable, within 15% of the best lone XP".
//
// THE EIGHTH WEAPON FAMILY, `fists`: two-handed wraps whose blows read Melee (skills.js FAMILY_SKILL), played as a Melee seat
// (hunt-roles.js ROLE_KEYS `fists`: melee_dps, so a party counts it as Melee), on its own ability list (abilities.js
// DISCIPLINES `fists`): one target only, elemental strikes on mana that level on MAGIC (an ability naming its own skill,
// abilities.js `skill`), the rune as the optional stronger cast, and its OWN HEAL: the wraps' `selfHealPm`, a share of max HP
// back every second while hurt (src/core/hunt/pull-cycle.js tickHeroes), never a leech (linings own leech, plan §5).
//
// HIDDEN (FIST_LINE.live false). The two engine pieces it stands on are real and play for any row that names them; the
// SAMPLE (these two wraps, the discipline, its role key, its family skill and its six strikes) is merged into the shipped
// tables (items.js, abilities.js, hunt-roles.js, skills.js) only while `live` is true. While it is false no table, no
// generated catalogue, no icon and no wiki row moves: no player can see, slot, buy or be dropped one (DESIGN_STANDARDS §9:
// sample, measure, then expand; the special-attribute sample's precedent). The measuring tool and the fist test play a
// planted copy with `live` true (tools/balance-sim/fist-table.mjs, tests/hunt-core/fist-play.mjs). Going live is the drop
// homes, the icons, the descriptions and the catalogue files in one lane (plan §11 phase 12).
//
// Every number here is PROPOSED (designer's to retune), the heal measured against the plan's table (fist-table.mjs).
//
// PURE ESM. Data only. Imports only src/data/gear-profiles.js (the wraps' derived stats).
// ════════════════════════════════════════════════════════════════════════

import { withGearStats } from './gear-profiles.js';

export const FIST_LINE = Object.freeze({
  /* THE SWITCH: false = the sample is in no shipped table (see the header). */
  live: false,
  /* the weapon family (items' weaponType), the role key and the ability discipline, one id */
  family: 'fists',
  /* THE OWN HEAL (plan §7 "Sustain"), permille of max HP regained every second while hurt, in a fight or out of one, on top of
     everyone's regeneration and never multiplied by it. 8 (0.8%/s), proposed from the food the prototype ate (about 95 store foods an
     hour at Level 57, about 20,000 HP an hour), MEASURED (tools/balance-sim/fist-table.mjs, lane/d-fists-phase1; plate, alone on Normal,
     3 seeds x 3 h): at 8 the fist's lowest typical HP is at or above the hammer's and it eats less, from the Thicket (10) to the Slake
     (57): 0 to 21 foods an hour where the hammer eats 0 to 70. At 0 it eats 13 to 67 from the Sewer up; 12 adds gold from Level 42
     and nothing the promise needs. In leather it is not enough at any size tried (40 to 60 foods an hour from the Glade up at 12). */
  selfHealPm: 8,
});

/* THE WRAPS, tiers 1 and 2. Two-handed (no shield beside them: the fist line is no tank), Melee's numbers, the own heal.
   Stats PROPOSED from the prototype's proxy (lane/d-itemization-audit fist-proto.mjs: the tier's sword with its strength
   x1.45): between the Practice Sword's 4/3 and the Practice Club's 3/7 at tier 1, under the Iron Hatchets' 9/11 at tier 2,
   because the fist's strikes add Magic's damage on top. Names: the designer's (itemization-system.md §7). The numbers are now the
   `fists` profile's (src/data/gear-profiles.js, lane/gear-catalogue-steps: 4/5 and 8/9 at item Levels 1 and 15, the shape above). */
export const FIST_ITEMS = Object.freeze(withGearStats({
  practice_wraps: Object.freeze({ n: 'Practice Wraps', icon: '✊', v: 0, type: 'weapon', slot: 'weapon', weaponType: FIST_LINE.family,
    twoHanded: true, selfHealPm: FIST_LINE.selfHealPm, tier: 1, rarity: 'common', reqSkill: 'level', reqLv: 1 }),
  sluicers_knuckles: Object.freeze({ n: "Sluicer's Knuckles", icon: '✊', v: 130, type: 'weapon', slot: 'weapon', weaponType: FIST_LINE.family,
    twoHanded: true, selfHealPm: FIST_LINE.selfHealPm, tier: 2, rarity: 'uncommon', reqSkill: 'level', reqLv: 15 }),
}));

/* THE STRIKES' ELEMENTS, by choice (plan §7 "Element"): one row of each strike per element, so the choice is which one a bar
   slots (configuration, as every bar choice is). [rune family, element id, the word a name starts with] */
export const FIST_ELEMENTS = Object.freeze([
  Object.freeze(['fire', 'ember', 'Fire']),
  Object.freeze(['ice', 'frost', 'Ice']),
  Object.freeze(['poison', 'poison', 'Poison']),
]);
