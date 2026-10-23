// ════════════════════════════════════════════════════════════════════════
// src/data/runes.js — RUNES ARE SPELL REAGENTS (Tyler 2026-10-23: COMBAT AUDIT
// ANSWERS and RUNE FAMILIES in the rulings of record)
//
// A rune fuels a SPELL, never a basic attack (caster basics cost mana). Every
// rune item names its FAMILY and its TIER on its own row (src/data/stonecraft.js):
//   family   one of RUNE_FAMILIES (Air is hidden until a spell spends it)
//   runeTier 1..5, one of RUNE_TIERS ("Chalked" .. "Graven"). The item's own
//            `tier` is its catalogue tier (hr_items) and is not this.
// A spell casts the VERSION of the rune it spends: a tier-N rune casts version
// N, which needs level RUNE_TIERS[N-1].level in the spell's skill (Magic for a
// spell, the weapon's own skill for a weapon ability: designer d3-weaponskill,
// Tyler 10-23), the same ladder Runecrafting crafts the tiers on. A store rune
// is the basic version: version I at the store's share (supply-basics.js
// BASIC_EFFECT_SHARE). What each version does is the ability row's
// (src/data/abilities.js `versions`); a version changes numbers only.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* The seven families (Tyler 2026-10-23, final). `hidden`: no spell spends it yet, so no screen offers it. */
export const RUNE_FAMILIES = Object.freeze({
  air: Object.freeze({ label: 'Air', hidden: true }),
  earth: Object.freeze({ label: 'Earth' }),
  water: Object.freeze({ label: 'Water' }),
  fire: Object.freeze({ label: 'Fire' }),
  ice: Object.freeze({ label: 'Ice' }),
  poison: Object.freeze({ label: 'Poison' }),
  rupture: Object.freeze({ label: 'Rupture' }),
});

/* The five tiers, each craftable and castable from `level` (Runecrafting to make, the spell's skill to cast). */
export const RUNE_TIERS = Object.freeze([
  Object.freeze({ tier: 1, name: 'Chalked', level: 1 }),
  Object.freeze({ tier: 2, name: 'Scored', level: 15 }),
  Object.freeze({ tier: 3, name: 'Etched', level: 30 }),
  Object.freeze({ tier: 4, name: 'Carved', level: 45 }),
  Object.freeze({ tier: 5, name: 'Graven', level: 60 }),
]);

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** The item id of `family`'s tier-`tier` rune ("graven_rupture_rune"), derived from the two names so an id can
    never disagree with what it is called. */
export function runeId(family, tier) {
  const t = RUNE_TIERS[tier - 1];
  return t && own(RUNE_FAMILIES, family) ? t.name.toLowerCase() + '_' + family + '_rune' : null;
}

/** A rune's player name ("Graven Rupture Rune"). */
export function runeName(family, tier) {
  const t = RUNE_TIERS[tier - 1];
  return t && own(RUNE_FAMILIES, family) ? t.name + ' ' + RUNE_FAMILIES[family].label + ' Rune' : null;
}

/** A RUNE: an item that names a rune family. Its tier is `runeTier`. */
export function isRune(item) {
  return !!item && typeof item.family === 'string' && own(RUNE_FAMILIES, item.family);
}

/** The tier a rune casts at (1..5), or 0 for an item that is no rune. */
export function runeTierOf(item) {
  return isRune(item) && Number.isInteger(item.runeTier) && item.runeTier >= 1 && item.runeTier <= RUNE_TIERS.length ? item.runeTier : 0;
}

/** The skill level version `tier` of a spell needs (and Runecrafting crafts that tier at). */
export function versionLevel(tier) {
  const row = RUNE_TIERS[tier - 1];
  return row ? row.level : Infinity;
}

/** Every problem with the vocabulary and the rune rows of `items`, as strings. Empty = valid. */
export function validate(items) {
  const out = [];
  RUNE_TIERS.forEach((t, i) => {
    if (t.tier !== i + 1) out.push('tier ' + t.name + ' is not number ' + (i + 1));
    if (!Number.isInteger(t.level) || t.level < 1 || (i && t.level <= RUNE_TIERS[i - 1].level)) out.push('tier ' + t.name + ': its level must rise');
  });
  if (RUNE_TIERS[0].level !== 1) out.push('version I must cast at level 1');
  for (const [id, it] of Object.entries(items || {})) {
    if (!it || (it.family === undefined && it.runeTier === undefined)) continue;
    if (!isRune(it)) out.push(id + ': unknown rune family ' + it.family);
    else if (!runeTierOf(it)) out.push(id + ': runeTier ' + it.runeTier + ' is not 1..' + RUNE_TIERS.length);
    if (it.slot !== 'ammo' || it.reqSkill !== 'magic') out.push(id + ': a rune is a carried magic supply (slot ammo, reqSkill magic)');
  }
  return out;
}
