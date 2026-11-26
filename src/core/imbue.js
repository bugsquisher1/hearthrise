// ════════════════════════════════════════════════════════════════════════
// src/core/imbue.js — IMBUEMENTS' RULES: life, the apply fee, the recipe, and the ledger rows a worn set writes (systems, lane/flame-temper-build,
// 2026-11-22; the worn set, its steps and its rows by the game designer, lane/tp-im-steps, 2026-11-26; docs/design/redesign/21-flame-temper-
// imbue-loot.md section 3, rulings D-1, D-11 and D-12; the rows are src/data/imbue-rules.js).
//
// THE SERVER OWNS THE TIMER. hero_worn_imbue (user, hero slot, equip slot, imbue, band, quality, ms_left) is written by hr_imbue_apply and
// counted down by the settle's hunted milliseconds only (never in town). The browser shows ms_left; it never runs a clock on it.
// THE WORN SET the fight reads is the hero's `wornImbues` ([{ id, band, msLeft }], the server's projection, owed): wornImbuesOf keeps one a
// kind (the slot's), drops an unknown id, a spent one and one more than wearAhead over the hero, so a forged list can never stack.
// THE ROWS (imbueRows), one a worn imbuement on every blow or heal, in the consumable slice at full size times its band's contest curve:
//   it fires   { slice: 'consumable', raises, steps, key }                its channel, and its condition holds on this blow
//   it waits   the same row with holds: false                               any other blow: it still takes its room (21 D-11)
// so the slice's clamp (src/core/power-ledger.js: ramp(Level) and the cap of 6, once) holds three imbuements, a draught and a damage meal
// together, and a draught on top of three imbuements adds nothing (21 D-1). A leech and a conversion only take room until their engine
// rules land (21 section 3.9 items 2 and 3).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ════════════════════════════════════════════════════════════════════════
import { IMBUE, IMBUE_RULES, IMBUE_SLOTS, imbueBandOf, imbueItemOf } from '../data/imbue-rules.js';
import { POWER_LEDGER } from '../data/power-ledger.js';
import { GEAR_STEPS, DANGER } from '../data/danger.js';
import { wage, powSquare } from '../data/wage.js';

const HOUR_MS = 3600000;
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const whole = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

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

/** THE RECIPE an Artificing hero makes (21 section 3.2): { item, band, inputs: { item: count }, remains, workPm }, or null for no such row.
    `inputs` holds the named part only; `remains` is a count of Remains of the part's band (the Remains good is one a band, 13-market 2.4,
    and the job slice names its face). */
export function imbueRecipe(id) {
  if (!own(IMBUE_RULES, id)) return null;
  const band = imbueBandOf(id);
  return band === null ? null : { item: imbueItemOf(id), band, inputs: { [IMBUE_RULES[id].part]: IMBUE.parts }, remains: IMBUE.remains, workPm: IMBUE.workPm };
}

/** An imbuement of `band` on a hero of Level `heroLevel`, in steps at full size (the clamp ramps it): IMBUE.steps at or under its band,
    the contest curve behind past it (09 4.2), and 0 when the band stands more than wearAhead over the hero (it cannot be worn). */
export function imbueStepsAt(band, heroLevel) {
  const b = whole(band), L = whole(heroLevel);
  if (!b || !L || b > L + GEAR_STEPS.wearAhead) return 0;
  /* the contest curve (src/core/trades.js behindPm's, the one power walk powSquare): a good n steps behind does 1 / (1 + powerStep)^n */
  return IMBUE.steps / powSquare(1 + DANGER.powerStep, Math.max(0, L - b));
}

/** THE WORN SET AS THE FIGHT PLAYS IT, from the server's list [{ id, band, msLeft }]: an unknown id, a band no whole number, a spent one
    (msLeft 0) and a second of one kind are dropped (the first of a kind stays). Frozen [{ id, band, kind }], or null with none. */
export function wornImbuesOf(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const byKind = new Map();
  for (const x of list) {
    const id = x && x.id;
    if (!own(IMBUE_RULES, id) || !whole(x.band) || !whole(x.msLeft)) continue;
    const kind = IMBUE_RULES[id].kind;
    if (!byKind.has(kind)) byKind.set(kind, Object.freeze({ id, band: whole(x.band), kind }));
  }
  return byKind.size ? Object.freeze([...byKind.values()]) : null;
}

/* a row's condition on this blow: the role of the monster struck (`role`) or the element of the blow taken (`element`) */
const holdsOn = (r, ctx) => (!r.when ? false
  : r.when.metric === 'target_role' ? !!ctx && ctx.role === r.when.eq
    : r.when.metric === 'hit_element' ? !!ctx && ctx.element === r.when.eq : false);

/**
 * THE LEDGER ROWS a worn set writes on one blow or heal in `channel` ('offense', 'defense', 'heal'), for a hero of Level `heroLevel`.
 * `ctx`: { role (the role id of the monster struck, or striking), element (the blow's element id) }. One row a worn imbuement: it fires
 * when its channel is this one and its condition holds, else it waits (holds: false) and takes its room. [] with none.
 */
export function imbueRows(worn, channel, ctx, heroLevel) {
  const set = Array.isArray(worn) ? worn : null;
  if (!set || !set.length) return [];
  const out = [];
  for (const w of set) {
    const r = own(IMBUE_RULES, w.id) ? IMBUE_RULES[w.id] : null;
    const steps = r ? imbueStepsAt(w.band, heroLevel) : 0;
    if (!steps) continue;
    const fires = r.raises === channel && holdsOn(r, ctx);
    out.push(fires ? { slice: 'consumable', raises: channel, steps, key: r.key } : { slice: 'consumable', raises: channel, steps, key: r.key, holds: false });
  }
  return out;
}
