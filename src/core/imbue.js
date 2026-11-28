// ════════════════════════════════════════════════════════════════════════
// src/core/imbue.js — IMBUEMENTS' RULES: life, the apply fee, the recipe, and the ledger rows a worn set writes (systems, lane/flame-temper-build,
// 2026-11-22; the worn set, its steps and its rows by the game designer, lane/tp-im-steps, 2026-11-26; docs/design/redesign/21-flame-temper-
// imbue-loot.md section 3, rulings D-1, D-11 and D-12; the rows are src/data/imbue-rules.js).
//
// THE SERVER OWNS THE TIMER. hero_worn_imbue (user, hero slot, equip slot, imbue, band, quality, ms_left) is written by hr_imbue_apply and
// counted down by the settle's hunted milliseconds only (never in town). The browser shows ms_left; it never runs a clock on it.
// THE WORN SET the fight reads is the hero's `wornImbues` ([{ id, band, msLeft }], hr_worn_imbues_of through hr_hunt_instance_read,
// 1077-worn-imbues.sql): wornImbuesOf keeps one a kind and turns msLeft into the instant it runs out, imbuesAt drops it there, and
// imbueStepsAt counts one past wearAhead 0. So a forged list never stacks, and a run-out lands at one instant on both doors.
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
import { GEAR_STEPS, DANGER } from '../data/danger.js';
import { wagePrice, powSquare } from '../data/wage.js';

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

/** THE APPLY FEE (hr_imbue_fee's twin), whole gold, burned: feeHoursPm of wage at the imbuement's band, no ramp (21 D-19). */
export function applyFee(band) {
  return wagePrice(IMBUE.feeHoursPm, Math.max(1, Math.floor(Number(band) || 1)));
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

/** THE WORN SET AS THE FIGHT PLAYS IT, from the server's list [{ id, band, msLeft }] read at `fromMs` (the hero's settled_to): an unknown
    id, a band no whole number, a spent one and a second of one kind are dropped. Frozen [{ id, band, kind, untilMs }], or null with none.
    untilMs = fromMs + msLeft: the timer takes each settled ms off ms_left, so it is ONE instant however the windows are cut (null with no
    fromMs: a Lab hero, it lasts the span). An entry with its own untilMs keeps it (the engine re-reads its output); no msLeft rides on,
    so a peer's frozen row (member.js frozenKey) holds still from window to window. */
export function wornImbuesOf(list, fromMs) {
  if (!Array.isArray(list) || !list.length) return null;
  const from = Number.isSafeInteger(fromMs) ? fromMs : null;
  const byKind = new Map();
  for (const x of list) {
    const id = x && x.id;
    if (!own(IMBUE_RULES, id) || !whole(x.band)) continue;
    const untilMs = own(x, 'untilMs') ? (Number.isSafeInteger(x.untilMs) ? x.untilMs : null)
      : whole(x.msLeft) ? (from === null ? null : from + whole(x.msLeft)) : undefined;
    if (untilMs === undefined) continue;
    const kind = IMBUE_RULES[id].kind;
    if (!byKind.has(kind)) byKind.set(kind, Object.freeze({ id, band: whole(x.band), kind, untilMs }));
  }
  return byKind.size ? Object.freeze([...byKind.values()]) : null;
}

/** The worn set standing at boundary `atMs` (combat-sim.js syncUnit): less each one whose untilMs is at or before it (the timer deletes
    that row in the window holding the instant). Null with none; the whole set when atMs is no number. */
export function imbuesAt(worn, atMs) {
  const set = wornImbuesOf(worn);
  if (!set || !Number.isFinite(atMs)) return set;
  const left = set.filter((w) => w.untilMs === null || w.untilMs > atMs);
  return left.length === set.length ? set : left.length ? Object.freeze(left) : null;
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
