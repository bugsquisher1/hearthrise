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
// THE ROWS (imbueRows), one a worn imbuement on every blow or heal, in the consumable slice, each read at its band's contest curve
// c = imbueStepsAt(band, L) / IMBUE.steps (1 at or under its band, less past it):
//   it fires   { slice: 'consumable', raises, steps: fire x c, room: IMBUE.steps x c, key }   its channel, and its condition holds on this
//              blow: its measured fire size (the row's `fire`, a rule row with none its rated steps), counted OVER its rated room (21 D-17)
//   it waits   { slice: 'consumable', raises, steps: IMBUE.steps x c, key, holds: false }       any other blow: it takes its room (21 D-11)
//   converts   { slice: 'consumable', raises: 'offense', steps: n x c, key }                   a conversion (Fire Edge) on a hero's blow at
//              a monster, n = stepsOf(1 + sharePm / 1000 x (the target's percent for its element / the blow's - 1)) (21 D-21): a gain
//              the clamp holds, a cost whole (21 D-18); n 0 (a target neutral to its element, a blow already of it) waits (21 D-22)
// so the slice's clamp (src/core/power-ledger.js: the cap of 6, the rated rooms reserved, the firing steps over them) holds three
// imbuements, a draught and a damage meal together, and a draught on top of three imbuements adds nothing (21 D-1, D-11).
// THE LEECH (leechOf, leechPay; played by src/core/hunt/imbue-leech.js on every blow its wearer lands): leech.pm x c permille of the HP the
// blow took (rounded whole, at least 1: a band 50 Life Leech heals 20 to Level 50, 19 at 60, 17 at 97, 12 at 200; 21 D-21), the remainder
// carried on the unit to the next blow (21 D-18). It takes its room on every channel and writes no steps.
// THE CARDS' {pct} is the hero's own number (21 11.6.3): a Leech leechOf(...).pm / 10, a conversion sharePm / 10 x c.
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

/** A CONVERSION'S MULTIPLIER on one blow (21 D-18): `sharePm` of the blow resolved at `toPm` (the target's percent for the converted
    element, permille) in place of `blowPm` (the blow's own): 1 + sharePm / 1000 x (toPm / blowPm - 1). 1 for a blow already of that
    element, or for a percent that is no positive number. The amount pipeline turns it into whole steps (src/core/hunt/amount.js stepsOf). */
export function convertMult(convert, toPm, blowPm) {
  if (!convert || !(toPm > 0) || !(blowPm > 0) || toPm === blowPm) return 1;
  return 1 + (convert.sharePm / 1000) * (toPm / blowPm - 1);
}

/**
 * THE LEDGER ROWS a worn set writes on one blow or heal in `channel` ('offense', 'defense', 'heal'), for a hero of Level `heroLevel`.
 * `ctx`: { role (the role id of the monster struck, or striking), element (the blow's element id), convert? (on a hero's blow at a monster:
 * convert row -> its whole steps, the amount pipeline's) }. One row a worn imbuement: it fires when its channel is this one and its
 * condition holds (its fire size over its rated room), a conversion on a blow ctx can price it on writes its steps x c when they are not
 * 0, else it waits (holds: false) and takes its room. [] with none.
 */
export function imbueRows(worn, channel, ctx, heroLevel) {
  const set = Array.isArray(worn) ? worn : null;
  if (!set || !set.length) return [];
  const out = [];
  for (const w of set) {
    const r = own(IMBUE_RULES, w.id) ? IMBUE_RULES[w.id] : null;
    const steps = r ? imbueStepsAt(w.band, heroLevel) : 0;
    if (!steps) continue;
    if (r.convert && r.raises === channel && ctx && typeof ctx.convert === 'function') {
      const n = ctx.convert(r.convert);
      if (n) out.push({ slice: 'consumable', raises: channel, steps: (n * steps) / IMBUE.steps, key: r.key });
      else out.push({ slice: 'consumable', raises: channel, steps, key: r.key, holds: false });
      continue;
    }
    if (r.raises === channel && holdsOn(r, ctx)) {
      /* fire x c: the measured fire size at the band's contest curve (c = steps / IMBUE.steps), its room the rated steps (D-17) */
      const fire = Number.isInteger(r.fire) ? r.fire : IMBUE.steps;
      out.push({ slice: 'consumable', raises: channel, steps: (steps * fire) / IMBUE.steps, room: steps, key: r.key });
    } else out.push({ slice: 'consumable', raises: channel, steps, key: r.key, holds: false });
  }
  return out;
}

/** THE LEECH a worn set plays (21 D-18): { id, of ('hp' | 'mana'), pm } of its first imbuement with a leech the hero can wear at Level
    `heroLevel` (imbueStepsAt: no more than wearAhead under its band), or null. One a kind is worn (wornImbuesOf), so there is one.
    pm: leech.pm x c, rounded whole, at least 1 (21 D-21). */
export function leechOf(worn, heroLevel) {
  if (!Array.isArray(worn)) return null;
  for (const w of worn) {
    const r = w && own(IMBUE_RULES, w.id) ? IMBUE_RULES[w.id] : null;
    const steps = r && r.leech && whole(r.leech.pm) ? imbueStepsAt(w.band, heroLevel) : 0;
    if (steps > 0) return { id: w.id, of: r.leech.of, pm: Math.max(1, Math.round((whole(r.leech.pm) * steps) / IMBUE.steps)) };
  }
  return null;
}

/** ONE BLOW'S LEECH (21 D-18): the whole HP (or mana) back from a blow that took `took`, at `pm` permille, with `carry` thousandths
    left from the blows before: back = floor((took x pm + carry) / 1000), and the remainder carried on (0 to 999). Integers only. */
export function leechPay(took, pm, carry) {
  const t = whole(took), p = whole(pm), c = Math.min(999, whole(carry));
  const milli = t * p + c;
  return { back: Math.floor(milli / 1000), carry: milli % 1000 };
}
