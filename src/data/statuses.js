// ════════════════════════════════════════════════════════════════════════
// src/data/statuses.js — STATUS ROWS (HUNT_SCREEN_SPEC §3.3, parity ST-01..06)
//
// One row per status. The pure engine (src/core/hunt/status.js) is generic:
// it knows stacks, ticks, refresh and expiry, never a status by name. A new
// status (poison, burn) is a row here, not code.
//
// ROW SHAPE: a status either TICKS (a damage over time), MARKS its unit (it takes more
// damage while the status lasts) or SLOWS it (its swings and its spell windups take longer).
//   { id, name, tick, everyMs, durationMs, maxStacks, scalesWith,
//     skillPermillePerLevel, tierPermille, damageType }        a ticking status
//   { id, name, durationMs, maxStacks, takenPm }                  a marking status
//   { id, name, durationMs, maxStacks, slowPm }                   a slowing status
//     slowPm                 permille LONGER its unit's next swing interval and its next spell
//                            windup run, fixed as each one starts (damage.js slowed: the swing
//                            clock; monster-spells.js: the windup), so a mark never fills on a
//                            clock that moves after it is drawn; never scaled, never stacked
//                            past its maxStacks (the strongest live stack's counts)
//     takenPm                permille MORE damage its unit takes from every blow while
//                            it lasts (damage.js landHit, beside Hunter's Mark); fixed:
//                            never scaled by skill or rune tier (Bible §17), never
//                            stacked past its maxStacks
//     tick                   [min, max] base damage of one tick, inclusive
//     everyMs                one tick every this long (a whole number of sub-steps)
//     durationMs             a stack lasts this long; reapplying refreshes EVERY stack
//     maxStacks              stacks one unit may carry at once (any sources)
//     scalesWith             the discipline whose level the SOURCE brings (the
//                            caller resolves it; the engine reads source.skillLv)
//     skillPermillePerLevel  +permille of the tick per level of that discipline
//     tierPermille           multiplier by rune tier, permille, index 0 = tier 1;
//                            a source with no rune is tier 1
//     damageType             the element each tick is dealt as
//   A stack's scale is FIXED when it lands (spec §3.3 #6):
//     scale = (1000 + skillLv x skillPermillePerLevel) x tierPermille[tier-1] / 1000
//     tick  = round(roll(tick) x scale / 1000)
//
// Numbers: stacks 5 and 6 s are DECIDED (week plan item 6); tick 1-3, the
// 0.004 skill factor and the 1.00/1.10/1.20 tiers are ASSUMED (spec §5 #9).
// Bleed is generic (Tyler 10-16): heroes and monsters both carry it, and it is
// physical damage (Tyler 10-16).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.128';
import { PHYSICAL, isElement } from './elements.js?v=0.2.128';

/* The five rune tiers (src/data/runes.js): Rend's bleed lands +10% a tier above Chalked (ASSUMED, the designer
   re-tunes in the balance phase), so a Graven Rupture Rune's bleed ticks 1.4x a Chalked one's. */
export const STATUSES = Object.freeze({
  bleed: Object.freeze({
    id: 'bleed', name: 'Bleed',
    tick: Object.freeze([1, 3]), everyMs: 1000, durationMs: 6000, maxStacks: 5,
    scalesWith: 'melee', skillPermillePerLevel: 4,
    tierPermille: Object.freeze([1000, 1100, 1200, 1300, 1400]),
    damageType: 'physical',
  }),
  /* GREEN SICKNESS's mark (Bible §17 Restoration: "lower-power AoE plus a fixed, non-stacking ~10% damage-taken
     vulnerability for a short duration"; lane b-spell-content, PROVISIONAL): one stack, 6 s, +10% from every blow. */
  sickness: Object.freeze({ id: 'sickness', name: 'Sickness', durationMs: 6000, maxStacks: 1, takenPm: 100 }),
  /* CHILL (Tyler 2026-11-08, the area-spells design: Hoarfrost's frost; PROVISIONAL, the designer's numbers): its unit's
     swings and spell windups run 30% longer for 4 s, one stack. */
  chill: Object.freeze({ id: 'chill', name: 'Chill', durationMs: 4000, maxStacks: 1, slowPm: 300 }),
});

const ID = /^[a-z0-9_]{1,32}$/;
const DISCIPLINES = Object.freeze(['melee', 'ranged', 'magic']);

/** Every problem with one status row, as strings. Empty = valid. */
export function validateStatus(row) {
  if (!row || typeof row !== 'object') return ['status row is not an object'];
  const out = [];
  const at = 'status ' + row.id + ': ';
  const posInt = (k) => { if (!Number.isInteger(row[k]) || row[k] <= 0) out.push(at + k + ' must be a positive integer, got ' + row[k]); };
  if (typeof row.id !== 'string' || !ID.test(row.id)) out.push('status id ' + row.id + ' is not [a-z0-9_]');
  if (typeof row.name !== 'string' || !row.name) out.push(at + 'needs a name');
  if (row.takenPm !== undefined || row.slowPm !== undefined) {
    /* A MARKING status (how much more its unit takes) or a SLOWING one (how much longer its swings and windups run):
       how much, how long, how many; one or the other, and nothing that ticks or scales. */
    const kind = row.takenPm !== undefined ? 'takenPm' : 'slowPm';
    if (row.takenPm !== undefined && row.slowPm !== undefined) out.push(at + 'a status marks or slows, never both');
    if (!Number.isInteger(row[kind]) || row[kind] <= 0 || row[kind] > 1000) out.push(at + kind + ' must be an integer 1..1000');
    for (const k of ['durationMs', 'maxStacks']) posInt(k);
    if (Number.isInteger(row.durationMs) && row.durationMs % HUNT_TUNING.stepMs !== 0) out.push(at + 'durationMs ' + row.durationMs + ' is not a whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps');
    for (const k of ['tick', 'everyMs', 'scalesWith', 'skillPermillePerLevel', 'tierPermille', 'damageType']) if (row[k] !== undefined) out.push(at + 'a ' + (kind === 'takenPm' ? 'marking' : 'slowing') + ' status has no ' + k);
    return out;
  }
  if (!Array.isArray(row.tick) || row.tick.length !== 2 || !row.tick.every((n) => Number.isInteger(n) && n >= 1) || row.tick[0] > row.tick[1]) {
    out.push(at + 'tick must be [min, max], integers >= 1, min <= max');
  }
  for (const k of ['everyMs', 'durationMs', 'maxStacks']) posInt(k);
  for (const k of ['everyMs', 'durationMs']) {
    if (Number.isInteger(row[k]) && row[k] % HUNT_TUNING.stepMs !== 0) out.push(at + k + ' ' + row[k] + ' is not a whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps');
  }
  if (!DISCIPLINES.includes(row.scalesWith)) out.push(at + 'scalesWith must be one of ' + DISCIPLINES.join('/'));
  if (!Number.isInteger(row.skillPermillePerLevel) || row.skillPermillePerLevel < 0) out.push(at + 'skillPermillePerLevel must be an integer >= 0');
  if (!Array.isArray(row.tierPermille) || !row.tierPermille.length || !row.tierPermille.every((n) => Number.isInteger(n) && n >= 1000)) {
    out.push(at + 'tierPermille must be a non-empty list of integers >= 1000');
  } else {
    for (let i = 1; i < row.tierPermille.length; i++) if (row.tierPermille[i] < row.tierPermille[i - 1]) out.push(at + 'tierPermille must not fall with tier');
  }
  /* 'physical' or an element id from the one vocabulary (src/data/elements.js, contract §1.5). */
  if (row.damageType !== PHYSICAL && !isElement(row.damageType)) out.push(at + 'damageType must be physical or an element id, got ' + row.damageType);
  return out;
}

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  for (const [key, row] of Object.entries(STATUSES)) {
    if (!row || row.id !== key) out.push('status key ' + key + ' must equal its row id');
    out.push(...validateStatus(row));
  }
  return out;
}
