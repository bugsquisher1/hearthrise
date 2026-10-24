// ════════════════════════════════════════════════════════════════════════
// src/data/statuses.js — STATUS ROWS (HUNT_SCREEN_SPEC §3.3, parity ST-01..06)
//
// One row per status. The pure engine (src/core/hunt/status.js) is generic:
// it knows stacks, ticks, refresh and expiry, never a status by name. A new
// status (poison, burn) is a row here, not code.
//
// ROW SHAPE
//   { id, name, tick, everyMs, durationMs, maxStacks, scalesWith,
//     skillPermillePerLevel, tierPermille, damageType }
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

import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.41';
import { PHYSICAL, isElement } from './elements.js?v=0.2.41';

export const STATUSES = Object.freeze({
  bleed: Object.freeze({
    id: 'bleed', name: 'Bleed',
    tick: Object.freeze([1, 3]), everyMs: 1000, durationMs: 6000, maxStacks: 5,
    scalesWith: 'melee', skillPermillePerLevel: 4,
    tierPermille: Object.freeze([1000, 1100, 1200]),
    damageType: 'physical',
  }),
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
