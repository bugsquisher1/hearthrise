// ════════════════════════════════════════════════════════════════════════
// src/data/elements.js — THE ONE ELEMENT VOCABULARY (ARCHITECTURE_CONTRACTS §1.5)
//
// Every element name in the game is one of these ids: a monster's `elements`
// profile (monsters.js, monster-classes.js), an ability's `element`
// (abilities.js), a rune item's `element` (items), a status's `damageType`
// (statuses.js, or 'physical'), the hit-effect map (hunt-vfx.js) and the
// generated rune catalogue (tools/gen-catalogues.mjs). Each of those validators
// asks `isElement` here, so a name outside this list fails a test instead of
// silently matching nothing (the 2026-10-21 bug: the abilities said 'fire' /
// 'nature' while every monster said 'ember' / 'poison', so Fireball never met
// the Rat King's ember resist).
//
// NO IMMUNITIES, ONLY PERCENTAGES (Tyler 2026-11-06 ~21:51 UTC, Discord: "i meant
// to remove all 'immunity' and move it to %s"). A monster's `elements` profile
// says, per element, how much LESS damage it takes in percent: 25 takes 75% of
// the blow, -15 takes 115%. An element it does not name it takes in full. The
// values are the Game Designer's, set that day at weak -15, resist 25 and every
// former immunity 50. ELEMENT_PCT bounds every value, so no row can bring an
// immunity back. core/elements.js elementPermille is the one reader.
//
// NECROTIC AND STORM (Tyler 2026-11-18, itemization plan Appendix B) join the list only while their switch is on
// (src/data/necrotic-storm.js): while it is off the vocabulary is the three, so nothing may name them and no screen lists them.
//
// PURE ESM. Data only. Vendored into the hr-accrue Edge Function.
// ════════════════════════════════════════════════════════════════════════

import { NECROTIC_STORM } from './necrotic-storm.js?v=0.2.143';

/** The elements. `blight` was renamed POISON everywhere (DEC-ELEM-04). Necrotic and Storm only while their switch is on. */
export const ELEMENTS = Object.freeze(['ember', 'frost', 'poison', ...(NECROTIC_STORM.live ? ['necrotic', 'storm'] : [])]);

/* THE ELEMENTS' FIXED RULES ON A HERO (Appendix B1; Tyler 2026-11-18: "Storm burns mana, as designed. Necrotic cuts healing"): what a
   blow of the element does to a HERO beside its damage, the same whichever monster deals it ("one monster number": a monster's spell
   carries only its damage; the rule is the element's). Read where every blow lands (src/core/hunt/damage.js landHit), on a hero only
   (monsters have no mana, and a hero's spell Withers a monster through its own `status`, never through its element), and only when the
   blow took HP (a dodge, or a blow a shield swallowed whole, does neither). A wiki formula each:
     withers     a status id (statuses.js): the hero is put under it. Withered: every heal the hero takes is cut while it lasts
     manaBurnPm  the mana burned, permille of the HP the blow took: burn = floor(hpTaken x manaBurnPm / 1000), never below 0 mana
   A hero's guard against the element (its resistance) lowers both by the same percent: the burn because it is a share of the HP the
   guarded blow took, the cut through the status's `guard` (statuses.js). Empty while the switch is off. */
export const ELEMENT_ON_HERO = Object.freeze(NECROTIC_STORM.live
  ? { necrotic: Object.freeze({ withers: 'withered' }), storm: Object.freeze({ manaBurnPm: 500 }) } : {});

/** The fixed rule a blow of `element` brings a hero it strikes (ELEMENT_ON_HERO), or null: a plain element, a physical blow.
    @type {(element: string | null) => ({ withers?: string, manaBurnPm?: number } | null)} */
export const elementOnHeroOf = (element) => (typeof element === 'string' && Object.prototype.hasOwnProperty.call(ELEMENT_ON_HERO, element) ? ELEMENT_ON_HERO[element] : null);

/** The range of one `elements` value, in percent less damage taken: at most double
    from a weakness, and never so much off that a blow is close to nothing. */
export const ELEMENT_PCT = Object.freeze({ min: -100, max: 75 });

/** The non-element damage type (a basic swing, a bleed). */
export const PHYSICAL = 'physical';

/** A HERO'S RESISTANCE to one element, permille less taken (Tyler 2026-11-08: gear and imbuements answer a monster's group
    spell; design "2026-11-08 Area spells", next phase): from its worn gear, summed and capped at maxPm (40%: "No
    resistance goes above 40%, so nothing is ever immune"). Never below 0: no gear makes a hero weak to an element.
    PHYSICAL RESISTANCE (Tyler 2026-11-14: "maybe the legs have a % physical resistance"; the designer's "2026-11-15
    Special-attribute gear", the attribute catalogue's resist_physical) is the same profile's `physical` key: less taken from a
    blow that carries no element (a swing, a bite, an arrow, a bleed), under its own lower cap `physicalMax` (10%: most of
    what a tank takes is physical, so 10% there is worth more than 40% of one element). */
export const HERO_RESIST_PM = Object.freeze({ min: 0, max: 400, physicalMax: 100 });

/** The keys a hero's resistance profile may carry, in the order it is written: the elements, then PHYSICAL. */
export const HERO_RESIST_KEYS = Object.freeze([...ELEMENTS, PHYSICAL]);

/** The most a hero's worn gear takes off a blow of `key` (an element, or PHYSICAL), permille. */
export const heroResistCap = (key) => (key === PHYSICAL ? HERO_RESIST_PM.physicalMax : HERO_RESIST_PM.max);

const SET = new Set(ELEMENTS);

/** Is `e` one of the real elements? The single validity predicate. */
export function isElement(e) {
  return typeof e === 'string' && SET.has(e);
}

/** Every problem with one `elements` profile, as strings. Empty = valid. */
export function elementProfileProblems(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return ['elements must be a map of element to percent'];
  const out = [];
  for (const [e, pct] of Object.entries(profile)) {
    if (!isElement(e)) out.push('elements "' + e + '" is not an element');
    else if (!Number.isInteger(pct) || pct === 0 || pct < ELEMENT_PCT.min || pct > ELEMENT_PCT.max) {
      out.push('elements.' + e + ' = ' + pct + ' must be a non-zero integer in ' + ELEMENT_PCT.min + '..' + ELEMENT_PCT.max);
    }
  }
  return out;
}

/** Every problem with the vocabulary itself, as strings. Empty = valid. */
export function validate() {
  const out = [];
  if (SET.size !== ELEMENTS.length) out.push('ELEMENTS has a duplicate id');
  for (const e of ELEMENTS) if (!/^[a-z]{1,16}$/.test(e)) out.push('element id ' + e + ' is not [a-z]');
  if (SET.has(PHYSICAL)) out.push('physical is not an element');
  const p = ELEMENT_PCT;
  if (!(Number.isInteger(p.min) && Number.isInteger(p.max) && p.min >= -100 && p.min < 0 && p.max > 0 && p.max < 100)) {
    out.push('ELEMENT_PCT: integers, -100 <= min < 0 < max < 100');
  }
  const h = HERO_RESIST_PM;
  if (!(Number.isInteger(h.max) && Number.isInteger(h.physicalMax) && h.min === 0 && h.max > 0 && h.max < 1000 && h.physicalMax > 0 && h.physicalMax <= h.max)) {
    out.push('HERO_RESIST_PM must be whole permille with 0 = min < physicalMax <= max < 1000, so no resistance is ever an immunity');
  }
  /* A fixed rule belongs to a real element and does one of the two things; the status it names is statuses.js's to hold
     (tests/hunt-core/necrotic-storm.mjs sample-rows reads both tables). */
  for (const [e, row] of Object.entries(ELEMENT_ON_HERO)) {
    /** @type {{ withers?: string, manaBurnPm?: number }} */
    const r = row;
    if (!SET.has(e)) out.push('ELEMENT_ON_HERO.' + e + ' is not an element');
    const keys = Object.keys(r || {});
    if (keys.length !== 1 || !['withers', 'manaBurnPm'].includes(keys[0])) out.push('ELEMENT_ON_HERO.' + e + ' withers or burns mana, one of the two');
    else if (keys[0] === 'withers' && !/^[a-z0-9_]{1,32}$/.test(r.withers)) out.push('ELEMENT_ON_HERO.' + e + '.withers is a status id');
    else if (keys[0] === 'manaBurnPm' && !(Number.isInteger(r.manaBurnPm) && r.manaBurnPm > 0 && r.manaBurnPm <= 1000)) out.push('ELEMENT_ON_HERO.' + e + '.manaBurnPm is a whole permille 1..1000');
  }
  return out;
}
