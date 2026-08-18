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
// onto the loadout. Against a monster WEAK to that element the swing pays a
// flat +15%; against neutral / resistant / immune it pays nothing. v1 is PURE
// UPSIDE — there is no penalty axis, so a mismatched enchant is simply inert,
// never a punishment. (Resist/immune give no distinct combat number in v1;
// they read 1.00 exactly like neutral. The renderer communicates the
// difference so the player is not misled into thinking the enchant "worked".)
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

/** The three elements, mirrored from src/data/monster-classes.js ELEMENTS.
    Kept here as its own frozen set so core has no dependency on a data module
    (core is imported by the server, which vendors data separately). */
export const ELEMENTS = Object.freeze(['ember', 'frost', 'poison']);
const ELEMENT_SET = new Set(ELEMENTS);

/** The flat damage factor an element match pays. Damage only — accuracy is
    untouched (the b343 ruling: an accuracy bonus pays melee and nobody else). */
export const ELEMENT_BONUS = Object.freeze({ damage: 1.15 });

/** The hard ceiling on the single element factor. Applied by `elementMultFor`. */
export const MAX_ELEMENT_MULT = 1.15;

/** The ceiling on weapon-weakness × bane × element combined. Applied inside
    `weaknessInfo`. 1.20 × 1.40 × 1.15 = 1.932 → clamped here to 1.90. */
export const MAX_TOTAL_DAMAGE_MULT = 1.90;

/** Is `e` one of the three real elements? The single validity predicate — the
    server, `equipmentStats` and this module all ask it, so a fourth "element"
    can never leak in from a forged enchant or a bad rune row. */
export function isElement(e) {
  return typeof e === 'string' && ELEMENT_SET.has(e);
}

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
 * The clamped multiplier a loadout enchanted with `element` earns against
 * `monster`. Always ≥ 1.
 *
 * PURE UPSIDE: a monster weak to the element pays `ELEMENT_BONUS.damage`;
 * neutral, resistant and immune all pay 1.00. `monster.elementWeak` is the
 * SEALED field (applyClassProfiles writes the class default onto the row), so
 * this reads the same value the client and the vendored server copy see.
 */
export function elementMultFor(monster, element) {
  if (!isElement(element) || !monster) return 1;
  const weak = monster.elementWeak || null;
  const raw = weak === element ? ELEMENT_BONUS.damage : 1;
  return raw > MAX_ELEMENT_MULT ? MAX_ELEMENT_MULT : raw;
}
