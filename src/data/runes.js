// ════════════════════════════════════════════════════════════════════════
// src/data/runes.js — RUNES ARE SPELL REAGENTS (Tyler 2026-10-23: COMBAT AUDIT
// ANSWERS and RUNE FAMILIES in the rulings of record)
//
// A rune fuels a SPELL, never a basic attack (caster basics cost mana). Every
// rune item names its FAMILY and its TIER on its own row (src/data/stonecraft.js):
//   family   one of RUNE_FAMILIES (Storm, the old Air, is hidden and Bone absent until their switch is on)
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

import { NECROTIC_STORM } from './necrotic-storm.js';

/* The families (Tyler 2026-10-23, final, seven with Air hidden; 2026-11-18 "Yes storm and bone": the hidden Air family is shown as
   STORM, and an eighth, BONE, for Necrotic). `hidden`: no spell spends it yet, so no screen offers it, and it has no rune row
   (stonecraft.js CRAFTED_RUNE_FAMILIES). STORM IS THE AIR FAMILY: its id is `storm` so a rune's id says what it is called
   ("chalked_storm_rune", "Chalked Storm Rune": runeId's rule below); it was hidden with no row, so nothing held its old id. Storm
   stays hidden and Bone stays out of the table until their switch (src/data/necrotic-storm.js) is on. */
export const RUNE_FAMILIES = Object.freeze({
  storm: Object.freeze({ label: 'Storm', ...(NECROTIC_STORM.live ? {} : { hidden: true }) }),
  earth: Object.freeze({ label: 'Earth' }),
  water: Object.freeze({ label: 'Water' }),
  fire: Object.freeze({ label: 'Fire' }),
  ice: Object.freeze({ label: 'Ice' }),
  poison: Object.freeze({ label: 'Poison' }),
  rupture: Object.freeze({ label: 'Rupture' }),
  ...(NECROTIC_STORM.live ? { bone: Object.freeze({ label: 'Bone' }) } : {}),
});

/* The five tiers, each craftable and castable from `level` (Runecrafting to make, the spell's skill to cast).
   stepPm: what a cast of the tier's VERSION lands, permille of the spell's share of its caster's blow (THE SPELL RULE, Tyler
   2026-11-21, calls 21-5 and 32-8, plan lane L17: every cast is a share of the caster's own blow; the versions stay as the step
   a rune tier buys). One ladder for every rune spell: +10% a tier, the step Rend's bleed already took (statuses.js bleed
   tierPermille). Fitted at Level 10 and Level 60 (tools/balance-sim/staged/spell-audit.mjs section 3): every cast lands today's
   Level 60 worth at version V, and a deeper step would cut the first hours' casts further (a hero casts version II at Level 10,
   x1.10 of x1.40; at the B5 proposal's x1.15 of x1.60 a heal at Level 10 lost 45% of today's, here 41%). */
export const RUNE_TIERS = Object.freeze([
  Object.freeze({ tier: 1, name: 'Chalked', level: 1, stepPm: 1000 }),
  Object.freeze({ tier: 2, name: 'Scored', level: 15, stepPm: 1100 }),
  Object.freeze({ tier: 3, name: 'Etched', level: 30, stepPm: 1200 }),
  Object.freeze({ tier: 4, name: 'Carved', level: 45, stepPm: 1300 }),
  Object.freeze({ tier: 5, name: 'Graven', level: 60, stepPm: 1400 }),
]);

/* WHEN A SPELL SLOT'S RUNES RUN OUT (Tyler 2026-11-08, RUNE SUPPLY PER SLOT): a spell's slot spends only the carried runes
   the player ticked on it (`action.own`, best ticked tier first), then does what its `action.onEmpty` says:
     store   buy the store rune the slot names (`action.store`) per cast, at the store's share
     leave   end the hunt `runes_out` (src/data/hunt-sessions.js END_ORDER)
   A slot that says nothing ticks every rune of its family and buys its store rune when it names one, else leaves
   (src/core/hunt/conditions.js runeSupplyOf; the server's hr_hunt_slot_check fills the same). */
export const RUNE_ON_EMPTY = Object.freeze(['store', 'leave']);

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

/** What version `tier` of a spell lands, permille of the spell's share (RUNE_TIERS stepPm); 1000 for a tier that is no tier. */
export function versionStep(tier) {
  const row = RUNE_TIERS[tier - 1];
  return row ? row.stepPm : 1000;
}

/** Every problem with the vocabulary and the rune rows of `items`, as strings. Empty = valid. */
export function validate(items) {
  const out = [];
  RUNE_TIERS.forEach((t, i) => {
    if (t.tier !== i + 1) out.push('tier ' + t.name + ' is not number ' + (i + 1));
    if (!Number.isInteger(t.level) || t.level < 1 || (i && t.level <= RUNE_TIERS[i - 1].level)) out.push('tier ' + t.name + ': its level must rise');
    if (!Number.isInteger(t.stepPm) || (i && t.stepPm <= RUNE_TIERS[i - 1].stepPm)) out.push('tier ' + t.name + ': its step must rise');
  });
  if (RUNE_TIERS[0].level !== 1) out.push('version I must cast at level 1');
  if (RUNE_TIERS[0].stepPm !== 1000) out.push('version I lands the spell\'s own share (stepPm 1000)');
  for (const [id, it] of Object.entries(items || {})) {
    if (!it || (it.family === undefined && it.runeTier === undefined)) continue;
    if (!isRune(it)) out.push(id + ': unknown rune family ' + it.family);
    else if (!runeTierOf(it)) out.push(id + ': runeTier ' + it.runeTier + ' is not 1..' + RUNE_TIERS.length);
    if (it.slot !== 'ammo' || it.reqSkill !== 'magic') out.push(id + ': a rune is a carried magic supply (slot ammo, reqSkill magic)');
  }
  return out;
}
