// ════════════════════════════════════════════════════════════════════════
// src/core/gear-stats.js — THE ONE STAT FORMULA FOR EVERY PIECE OF GEAR (Systems, lane/gear-catalogue-steps, 2026-11-22).
//
// docs/design/redesign/04-math-strategy.md section 10 ("a base is an item Level ... no variance in the base"), 02-architecture.md package
// 2, src/data/gear-steps.js. The levers are src/data/gear-profiles.js; its header holds the formula in one line:
//
//   stat k  =  profile[k] x share(slot) x budget(curve, item Level) x rarityPm / 10^9   (a named piece too: no row carries an offset,
//                                                                                        docs/design/redesign/28-named-pieces.md)
//
// Whole numbers, rounded half away from zero; a critical chance (critB) to a thousandth. A stat that rounds to 0 is left off the row.
//
// THREE READERS:
//   tools/gen-gear.mjs   every piece's stats, written to src/data/gear-stats.generated.js (the data layer can't import this)
//   scaleItems                     the engine's view of the catalogue on a Danger-scale ground: every worn piece's stats near the ground's
//                                  base item Level (GEAR_SCALE_STAT_PM of the way to its own; src/data/danger.js DANGER_GROUNDS gearLevel),
//                                  so the power step carries the tier and the stats never stack a cliff on it
//   the tests                      tests/gear-stats.mjs
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ════════════════════════════════════════════════════════════════════════

import { GEAR_STAT_FIELDS, GEAR_CURVES, GEAR_PROFILES, GEAR_SLOT_PM, GEAR_EVEN_SHARE_PM, GEAR_CURVE_TOP, GEAR_SCALE_STAT_PM, RARITY_PM } from '../data/gear-profiles.js';
import { GEAR_STEPS, DANGER_GROUNDS } from '../data/danger.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const ARMOR_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']);
const JEWEL_SLOTS = Object.freeze(['necklace', 'ring', 'earrings']);

/** True for a row the formula sizes: a piece worn in an equipment slot (ammo is a supply, never sized here). */
export const isGearRow = (row) => !!row && typeof row.slot === 'string' && row.slot !== 'ammo' && row.type !== 'ammo';

/**
 * THE PROFILE A ROW IS MADE ON (src/data/gear-profiles.js GEAR_PROFILES): its own `gearProfile` if it names one, else read from what the
 * row already says it is: a weapon's kind, hands and discipline; an off-hand's kind; armor's weight; a cloak; a jewel. Null for a row the
 * table has no profile for (the generator refuses it).
 */
export function profileKeyOf(row) {
  if (!isGearRow(row)) return null;
  if (typeof row.gearProfile === 'string') return own(GEAR_PROFILES, row.gearProfile) ? row.gearProfile : null;
  const s = row.slot;
  if (s === 'weapon') {
    const t = row.weaponType;
    if (t === 'sword') return 'sword';
    if (t === 'hammer') return 'warhammer';
    if (t === 'axe') return 'hatchets';
    if (t === 'fists') return 'fists';
    if (t === 'ranged') return row.twoHanded === true ? 'bow' : 'crossbow';
    if (t === 'magic') return row.discipline === 'restoration' ? 'staff' : 'wand';
    return null;
  }
  if (s === 'shield') return row.offhand === 'spellbook' ? 'spellbook' : 'shield';
  if (ARMOR_SLOTS.includes(s)) return own(GEAR_PROFILES, row.armourClass) ? row.armourClass : null;
  if (s === 'cape') return 'cape';
  if (JEWEL_SLOTS.includes(s)) return 'jewel';
  return null;
}

/** The permille of a whole kit's stat budget a piece in `slot` carries (GEAR_SLOT_PM; two hands add GEAR_STEPS.twoHand's other slots). */
export function shareOf(slot, twoHanded) {
  const one = GEAR_SLOT_PM[slot];
  if (!Number.isInteger(one)) return 0;
  if (slot === 'weapon' && twoHanded === true) return GEAR_STEPS.twoHand.reduce((a, k) => a + (GEAR_SLOT_PM[k] || 0), 0);
  return one;
}

/** A whole kit's points of `curve` at item Level iL (GEAR_CURVES): the squared curve up to GEAR_CURVE_TOP, then in proportion to the item
    Level (src/data/gear-profiles.js header), so every item Level has a price and none is capped. */
export function budgetOf(curve, iL) {
  const c = GEAR_CURVES[curve];
  if (!c) return 0;
  const L = Math.max(0, Number(iL) || 0);
  const at = (x) => c.c0 + c.c1 * x + c.c2 * x * x;
  return L <= GEAR_CURVE_TOP ? at(L) : (at(GEAR_CURVE_TOP) * L) / GEAR_CURVE_TOP;
}

/** The item Level the formula reads: the row's `iL`, else its `reqLv` (the power step's own reading, danger.js itemLevelOf). */
export function itemLevelOfRow(row) {
  const n = Math.floor(Number(row && (Number.isInteger(row.iL) ? row.iL : row.reqLv)));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* half away from zero, so a penalty rounds as its bonus does; a critical chance to a thousandth */
const roundStat = (k, x) => {
  if (k === 'critB') return Math.sign(x) * Math.round(Math.abs(x) * 1000) / 1000;
  return Math.sign(x) * Math.round(Math.abs(x));
};

/**
 * THE FORMULA. `base` = { slot, iL, profile (a GEAR_PROFILES key), rarity, twoHanded }. Answers the base stats, in
 * GEAR_STAT_FIELDS order, each non-zero; throws on a profile or slot the tables don't know (a row the generator must not guess at).
 */
export function gearStats(base) {
  const p = GEAR_PROFILES[base && base.profile];
  if (!p) throw new Error('gear-stats: no profile ' + (base && base.profile));
  const share = shareOf(base.slot, base.twoHanded);
  if (!share) throw new Error('gear-stats: no share for slot ' + base.slot);
  const rarityPm = own(RARITY_PM, base.rarity) ? RARITY_PM[base.rarity] : 1000;
  const budget = budgetOf(p.curve, base.iL);
  const out = {};
  const even = p.even || {};
  for (const k of GEAR_STAT_FIELDS) {
    /* a field listed under `even` is the same on every piece of the profile (GEAR_EVEN_SHARE_PM in place of the slot's share) */
    const byEven = !Number.isFinite(p[k]) && Number.isFinite(even[k]);
    const pk = byEven ? even[k] : Number.isFinite(p[k]) ? p[k] : 0;
    const v = pk ? roundStat(k, (pk * (byEven ? GEAR_EVEN_SHARE_PM : share) * budget * rarityPm) / 1e9) : 0;
    if (v !== 0) out[k] = v;
  }
  return out;
}

/**
 * A catalogue row's formula input at item Level `iL` (its own when omitted), or null for a row with no profile. A row that says
 * `statsAs: <id>` (a second supply chain of a tier, a special piece on its standard piece) is that row of `items`: its profile, slot,
 * hands and item Level. A row that still says `statPlus` (an offset from the formula, retired by 28-named-pieces.md) is refused.
 */
export function baseOf(row, iL, items) {
  const as = row && typeof row.statsAs === 'string' ? (items && own(items, row.statsAs) ? items[row.statsAs] : undefined) : null;
  if (as === undefined) throw new Error('gear-stats: statsAs ' + row.statsAs + ' is not an item');
  if (row && row.statPlus !== undefined) throw new Error('gear-stats: ' + (row.n || 'a row') + ' carries statPlus; a named piece is its name, a rule, a Trait or a Signature (28-named-pieces.md)');
  const src = as || row;
  const profile = profileKeyOf(src);
  if (!profile) return null;
  return { slot: src.slot, iL: iL === undefined ? itemLevelOfRow(src) : iL, profile, rarity: row.rarity, twoHanded: src.twoHanded === true };
}

/** A row's stats by the formula (at item Level `iL`, its own when omitted; `items` resolves a statsAs), or null for a row with no profile. */
export function statsOfRow(row, iL, items) {
  const b = baseOf(row, iL, items);
  return b ? gearStats(b) : null;
}

/* ── THE SCALE VIEW ── */
/** The item Level a piece of item Level `own` is sized at on a ground whose base is `base`: GEAR_SCALE_STAT_PM of the way from the base, and
    never past GEAR_CURVE_TOP. On the scale a piece's power is its item Level (the power step and the amount pipeline read it, uncapped); the
    stats this view hands the old chain's last readers (the to-hit, a crit) are a bridge drawn on the seven-tier curve, and grown past its top
    they moved one style's hold, not every style's alike (lane/gear-phase-b, MEASURED: on the Bone Wing a mage four over the mixed four 1.18x with
    the view held, 1.30x grown, tests/lineup-v4.mjs). Off the scale a piece fights its own stats, which grow with its item Level. */
export const scaleStatLevel = (base, own) => Math.min(GEAR_CURVE_TOP, base + ((own - base) * GEAR_SCALE_STAT_PM) / 1000);
const VIEWS = new WeakMap();
/**
 * THE CATALOGUE AS A DANGER-SCALE GROUND FIGHTS IT: `items` with every gear row's base stats re-derived at the ground's base item Level
 * (DANGER_GROUNDS[ground.id].gearLevel) moved GEAR_SCALE_STAT_PM of the way to the piece's own (scaleStatLevel); every other field (its `iL`, read by the power step) as it was. `items` itself
 * on any other ground. Built once per catalogue and base item Level. One reader per world: hr-accrue's settle, the start point's frozen
 * peers and the browser's live view all fight through it (supabase/functions/hr-accrue/accrue-hunt.js, hunt-settle.js,
 * src/hunt-view/live-engine.js), so the three agree to the bit.
 */
export function scaleItems(items, ground) {
  const row = ground && own(DANGER_GROUNDS, ground.id) ? DANGER_GROUNDS[ground.id] : null;
  if (!items || !row || !Number.isInteger(row.gearLevel)) return items;
  let byLevel = VIEWS.get(items);
  if (!byLevel) { byLevel = new Map(); VIEWS.set(items, byLevel); }
  const hit = byLevel.get(row.gearLevel);
  if (hit) return hit;
  const view = {};
  for (const [id, it] of Object.entries(items)) {
    const s = isGearRow(it) && profileKeyOf(it) ? statsOfRow(it, scaleStatLevel(row.gearLevel, baseOf(it, undefined, items).iL), items) : null;
    if (!s) { view[id] = it; continue; }
    const r = {};
    for (const [k, v] of Object.entries(it)) if (!GEAR_STAT_FIELDS.includes(k)) r[k] = v;
    view[id] = Object.freeze(Object.assign(r, s));
  }
  Object.freeze(view);
  byLevel.set(row.gearLevel, view);
  return view;
}
