// ============================================================
// src/core/elements.js — ELEMENTAL WEAPON ENCHANTS ("runes")
//
// bane.js's TWIN. Read that file's header first — every rule it states about
// WHY a class multiplier lives inside `weaknessInfo` rather than in a
// `getBonus` key applies here verbatim, and for the same reason: the Edge
// accrual engine does NOT run the client's `getBonus` wrapper chain, so a
// bonus expressed there reads as a real number awake and as ZERO asleep. An
// element enchant that worked while you watched and stopped while you slept is
// the worst failure mode an idle game has, so this — like bane — is a factor
// inside the ONE damage expression both engines share (`weaknessInfo`), fed
// off the ONE object both engines take (`equipmentStats()` output).
//
// ── WHAT AN ENCHANT IS ──────────────────────────────────────────────────────
// A rune bound to the weapon slot stamps ONE element (ember | frost | poison)
// onto the loadout. Against a monster that takes MORE from that element (a
// negative value in its `elements` profile) the swing pays what the profile
// says, up to MAX_ELEMENT_MULT; against any other it pays nothing extra. v1 is
// PURE UPSIDE: there is no penalty axis, so a mismatched enchant is simply
// inert, never a punishment. A resisted element reads 1.00 here exactly like a
// neutral one.
//
// ── THE ONE ELEMENT READER ──────────────────────────────────────────────────
// `elementPermille` below is the only code that reads a monster's `elements`
// profile: the hunt's hurt() (via targeting.elementOn) and the enchant both ask
// it. No monster is immune to anything (Tyler 2026-11-06): the profile is a
// percentage per element, bounded by src/data/elements.js ELEMENT_PCT.
//
// ── THE CEILING IS AN INVARIANT OF THE EXPRESSION ───────────────────────────
// `MAX_ELEMENT_MULT` clamps the single factor; `MAX_TOTAL_DAMAGE_MULT` clamps
// the whole product (weapon-weakness × bane × element) inside `weaknessInfo`.
// Both live in the FORMULA, never in a data row — a magnitude an author can
// mistype is a magnitude that must not be trusted, exactly as bane.js argues.
// The intended best case is 1.20 (weapon) × 1.40 (bane) × 1.15 (element) =
// 1.932, clamped to 1.90.
//
// ── THE `element` FIELD ON A RUNE IS LOAD-BEARING ───────────────────────────
// A rune item carries `tag:'rune'` + `element:'ember'|'frost'|'poison'`. That
// field is the ONLY thing that maps a rune id to the element it binds — the
// server reads it to author `enchant.weapon`, the crafting UI reads it to lane
// the recipe, and `runeElement()` here reads it for both. There is no name
// parsing anywhere; the element is data.
//
// PURE ESM. No DOM, no window, no timers, no Math.random. Vendored into the
// hr-accrue Edge Function, so it must stay side-effect free.
// ============================================================

/* The vocabulary and its validity predicate (`isElement`, asked by the server,
   `equipmentStats` and this module, so a fourth "element" can never leak in from
   a forged enchant or a bad rune row) are src/data/elements.js's, the one copy;
   re-exported so existing callers keep their import. */
import { ELEMENTS, ELEMENT_PCT, isElement } from '../data/elements.js?v=0.2.109';
export { ELEMENTS, isElement };

/** The hard ceiling on the single enchant factor (damage only: the b343 ruling, an
    accuracy bonus pays melee and nobody else). Applied by `elementMultFor`. */
export const MAX_ELEMENT_MULT = 1.15;

/** The ceiling on weapon-weakness × bane × element combined. Applied inside
    `weaknessInfo`. 1.20 × 1.40 × 1.15 = 1.932 → clamped here to 1.90. */
export const MAX_TOTAL_DAMAGE_MULT = 1.90;

/**
 * The element a rune binds, or null if the id is not a rune.
 *
 * NULL PROTOTYPE lookup guard, exactly as baneIndex uses: the id comes from
 * player data and is used as a key, so `__proto__`/`constructor` must not read
 * as truthy items. Returns null (not undefined) for a non-rune so callers can
 * `if (!el) return`.
 */
export function runeElement(itemId, items) {
  if (!itemId || !items) return null;
  const it = Object.prototype.hasOwnProperty.call(items, itemId) ? items[itemId] : null;
  if (!it || it.tag !== 'rune') return null;
  return isElement(it.element) ? it.element : null;
}

/**
 * What one blow of `element` is worth against `monster`, in PERMILLE of the
 * rolled amount: 1000 less ten per percent in its `elements` profile, so 25 is
 * 750 and -15 is 1150. Not an element, or one the profile does not name: 1000.
 * `monster.elements` is the SEALED field (applyClassProfiles writes the class
 * default onto the row), so the client and the vendored server copy read the
 * same value. The value is clamped to ELEMENT_PCT here as well as in the roster
 * audit: the ceiling is the formula's, so no row can make a blow worth nothing.
 */
export function elementPermille(monster, element) {
  if (!monster || !isElement(element)) return 1000;
  const prof = monster.elements;
  const pct = prof && Object.prototype.hasOwnProperty.call(prof, element) && Number.isInteger(prof[element]) ? prof[element] : 0;
  return 1000 - Math.min(ELEMENT_PCT.max, Math.max(ELEMENT_PCT.min, pct)) * 10;
}

/**
 * The clamped multiplier a loadout enchanted with `element` earns against
 * `monster`. Always ≥ 1.
 *
 * PURE UPSIDE: a monster that takes more from the element pays its profile's
 * factor, at most MAX_ELEMENT_MULT; neutral and resisted elements pay 1.00.
 */
export function elementMultFor(monster, element) {
  const pm = elementPermille(monster, element);
  return pm > 1000 ? Math.min(MAX_ELEMENT_MULT, pm / 1000) : 1;
}
