// ════════════════════════════════════════════════════════════════════════
// src/core/imbue.js — IMBUEMENTS' ARITHMETIC: life, the apply fee, and the ledger rows a worn set writes (systems, lane/flame-temper-build,
// 2026-11-22; docs/design/redesign/21-flame-temper-imbue-loot.md section 3; the rows are src/data/imbue-rules.js).
//
// THE SERVER OWNS THE TIMER. hero_worn_imbue (user, hero slot, equip slot, imbue, band, quality, ms_left) is written by hr_imbue_apply and
// counted down by the settle's hunted milliseconds only (never in town). The browser shows ms_left; it never runs a clock on it.
// THE LEDGER ROWS are owed with the fight's conditions (21 section 3.9: target_role, hit_element, the conversion rule): a worn imbuement
// whose condition holds will write { slice: 'consumable', raises, steps: IMBUE.steps, key } at full size, and the clamp
// (src/core/power-ledger.js) applies ramp(Level) and the slice cap (6) once. A mana leech raises mana, which the ledger has no channel for
// (CONFLICTS.md 2026-11-22, the designer's call on how sustain counts in the slice).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ════════════════════════════════════════════════════════════════════════
import { IMBUE, IMBUE_RULES, IMBUE_SLOTS } from '../data/imbue-rules.js';
import { POWER_LEDGER } from '../data/power-ledger.js';
import { wage } from '../data/wage.js';

const HOUR_MS = 3600000;
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/** The hunted milliseconds an imbuement of `quality` lasts: hours x (1 + lifeRungPm x rung) (plain 20 h, fine 25 h, master 30 h, D-7). 0 for no quality. */
export function lifeMs(quality) {
  const rung = IMBUE.qualities.indexOf(quality);
  return rung < 0 ? 0 : (IMBUE.hours * HOUR_MS * (1000 + IMBUE.lifeRungPm * rung)) / 1000;
}

/** The equip slot an imbuement sits in (its kind's), or null for no such imbuement. */
export const imbueSlotOf = (id) => (own(IMBUE_RULES, id) ? IMBUE_SLOTS[IMBUE_RULES[id].kind] : null);

/** THE APPLY FEE (hr_imbue_apply's twin), whole gold, burned: feeHoursPm of wage at the piece's item Level, x ramp(hero Level). */
export function applyFee(itemLevel, heroLevel) {
  const L = Math.max(0, Math.min(POWER_LEDGER.rampLevel, Math.floor(Number(heroLevel) || 0)));
  const iL = Math.max(1, Math.floor(Number(itemLevel) || 1));
  return Math.ceil((IMBUE.feeHoursPm * wage(iL) * L) / (1000 * POWER_LEDGER.rampLevel));
}
