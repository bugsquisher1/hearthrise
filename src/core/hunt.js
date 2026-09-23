// ============================================================================
// src/core/hunt.js — THE HUNT, AS ARITHMETIC. Pure, dual-runtime, no clock.
//
// docs/design/HUNTS_AND_ANALYZER.md §0: "A hunt is the activity pointer we
// already have, plus a stance and a set of stop rules." This file is the whole
// of "plus": the stance table, the stop predicate and the Vigour arithmetic.
// Nothing else in the repo may state any of the three.
//
// ── WHY A FILE AND NOT THREE PLACES ────────────────────────────────────────
// Every one of these three rules is read by BOTH runtimes — the live tick and
// the away replay — through the one engine (`AWAY-1`, CLAUDE.md §6). A stance
// preset spelled in `accrual.js` and again in a renderer is the shape that made
// `processOfflineCombat` drift from `combatTick`: two copies that agreed
// on the day they were written. The stop predicate is worse, because its two
// copies would disagree about when a player's night ENDED.
//
// ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
//  · No clock. Every function takes the instants it needs as arguments; the
//    server clock is the caller's to supply (CLAUDE.md §1).
//  · No prices. The Vigour refill ladder is a SERVER CATALOGUE TABLE
//    (`hr_vigour_prices`), not a constant here, because it is money and money
//    is tuned by data under a Security GO. What lives here is the SHAPE.
//  · No multipliers on a stance. See STANCES.
// ============================================================================

import { DEFAULT_THRESHOLD } from './auto-eat.js?v=551';
import { AMMO_DRY_MULT } from './ammo.js?v=551';

/* ── THE STANCE TABLE ───────────────────────────────────────────────────────
   ⚠ THE RULE THAT OUTRANKS EVERY OTHER LINE IN THIS FILE (design §2.2):
     A STANCE MAY NEVER INTRODUCE A MULTIPLIER, A RATE OR A BONUS.
   A stance is a standing order over three decisions the engine already makes,
   and supplies only VALUES for knobs that already shipped:

     eatAt     src/core/auto-eat.js DEFAULT_THRESHOLD — the auto-eat trigger
     ammoDry   'stop' | 'swing'    — what to do when the quiver runs out;
                                     'swing' is today's behaviour, which pays
                                     src/core/ammo.js AMMO_DRY_MULT
     falls     int | null          — consecutive falls that end the hunt; null
                                     leaves the Recovery Rule's own Retreat
                                     ladder (src/core/away.js) untouched

   The moment a stance pays damage it is a balance surface, a thing to sell, and
   a second combat path to keep at AWAY-1 parity. `assertNoStanceMultiplier`
   below is the executable form of that sentence, and tests/hunt-stance-stop.mjs
   mutates a multiplier in to prove it bites.

   A fourth stance is a row in this table the day a fourth question exists
   (design §2.2). It is not one today. */
export const STANCES = Object.freeze({
  careful:  Object.freeze({ id: 'careful',  eatAt: 0.75, ammoDry: 'stop',  falls: 2 }),
  steady:   Object.freeze({ id: 'steady',   eatAt: DEFAULT_THRESHOLD, ammoDry: 'swing', falls: null }),
  reckless: Object.freeze({ id: 'reckless', eatAt: 0.25, ammoDry: 'swing', falls: null }),
});

/** Today's behaviour, which is why nobody is opted into a change (design §2.2). */
export const DEFAULT_STANCE = 'steady';

/** Every legal stance id, for the request parser and the SQL catalogue check.
    DERIVED from the table, never typed twice. */
export const STANCE_IDS = Object.freeze(Object.keys(STANCES));

/**
 * The preset, FAIL-SAFE. An unknown, absent or malformed id reads as the
 * default — never as "no auto-eat" and never as a throw, because this runs
 * inside a settle that has already collected a window: a hunt whose stance
 * column holds something this build does not know must still pay the night.
 *
 * ⚠ `Object.prototype.hasOwnProperty`, NOT `STANCES[id]`. The id shape admits
 *   `constructor` and `__proto__`, both truthy on any object literal — the same
 *   trap `catalogueHas` exists for in set-activity.js.
 */
export function stanceOf(id) {
  if (typeof id !== 'string'
      || !Object.prototype.hasOwnProperty.call(STANCES, id)) return STANCES[DEFAULT_STANCE];
  return STANCES[id];
}

/* ── THE NO-MULTIPLIER PROPERTY, AS CODE ────────────────────────────────────
   A stance preset may carry ONLY the three knob keys. A guard that has never
   been red is not a guard (CLAUDE.md §4), so this is called at module load AND
   mutated by tests/hunt-stance-stop.mjs. It THROWS rather than warns, for the
   reason set-activity.js's §1b self-check throws: a stance table that quietly
   grew a damage bonus is a balance surface nobody reviewed. */
export const STANCE_KEYS = Object.freeze(['id', 'eatAt', 'ammoDry', 'falls']);

export function assertNoStanceMultiplier(table) {
  const t = table || STANCES;
  for (const id of Object.keys(t)) {
    const s = t[id];
    for (const k of Object.keys(s)) {
      if (!STANCE_KEYS.includes(k)) {
        throw new Error(`hunt §2.2: stance '${id}' carries '${k}', which is not one of the three shipped knobs — a stance may never introduce a multiplier, a rate or a bonus`);
      }
    }
    if (typeof s.eatAt !== 'number' || !(s.eatAt >= 0 && s.eatAt <= 1)) {
      throw new Error(`hunt §2.2: stance '${id}' eatAt is not a 0..1 threshold`);
    }
    if (s.ammoDry !== 'stop' && s.ammoDry !== 'swing') {
      throw new Error(`hunt §2.2: stance '${id}' ammoDry must be 'stop' or 'swing'`);
    }
    if (s.falls !== null && !(Number.isInteger(s.falls) && s.falls >= 1)) {
      throw new Error(`hunt §2.2: stance '${id}' falls must be null or a positive integer`);
    }
  }
  return true;
}
assertNoStanceMultiplier(STANCES);

/* ── THE STOP RULES ─────────────────────────────────────────────────────────
   A FLOOR, NEVER AN ESCROW (design §2.3). A reservation would be a second copy
   of an inventory quantity, which is the exact shape of a dupe, and the server
   owns anything tradeable (CLAUDE.md §1).

   Every field is optional; an absent field is no rule. A value OUTSIDE its
   bounds is a REFUSAL, never a clamp — a clamp lets a client discover a hidden
   maximum by pushing at one, which is how a bound becomes a catalogue. */
export const STOP_BOUNDS = Object.freeze({
  hours:      Object.freeze({ min: 1, max: 24, int: true }),
  food_floor: Object.freeze({ min: 0, max: 10000, int: true }),
  ammo_floor: Object.freeze({ min: 0, max: 100000, int: true }),
  falls:      Object.freeze({ min: 1, max: 10, int: true }),
  bag_full:   Object.freeze({ bool: true }),
});
export const STOP_FIELDS = Object.freeze(Object.keys(STOP_BOUNDS));

/** `bag_full` defaults TRUE (design §2.3): the silent loss it prevents — eight
    hours of a hunt whose loot stopped fitting after ninety minutes — is the one
    thing that makes a player feel the game cheated them. */
export const STOP_DEFAULT = Object.freeze({ bag_full: true });

/**
 * Validate a client-sent stop object. PURE, and the ONLY definition of the
 * bounds — the request parser, the intent, the RPC's CHECK and the engine all
 * ask this one function or the table above.
 *
 * @returns { ok:true, stop }  the NORMALISED object (own-property, no prototype)
 *        | { ok:false, error, field }
 */
export function validateStop(raw) {
  if (raw === null || typeof raw === 'undefined') return { ok: true, stop: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'bad_stop', field: null };
  }
  const out = Object.create(null);
  for (const k of Object.keys(raw)) {
    if (!STOP_FIELDS.includes(k)) return { ok: false, error: 'unknown_stop_field', field: k };
    const b = STOP_BOUNDS[k];
    const v = raw[k];
    if (b.bool) {
      if (typeof v !== 'boolean') return { ok: false, error: 'bad_stop_value', field: k };
      out[k] = v;
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
      return { ok: false, error: 'bad_stop_value', field: k };
    }
    /* REFUSED, NOT CLAMPED. See the block above STOP_BOUNDS. */
    if (v < b.min || v > b.max) return { ok: false, error: 'stop_out_of_range', field: k };
    out[k] = v;
  }
  return { ok: true, stop: out };
}

/* THE ORDER, DECIDED ONCE so two lanes cannot answer it differently
   (design §2.4): deaths first, because a character who is dying should stop
   before we ask whether their bag is tidy; the time cap last, because it is the
   only rule that is not about something going wrong. */
export const STOP_ORDER = Object.freeze(['falls', 'bag_full', 'food_floor', 'ammo_floor', 'hours']);

/**
 * WHICH RULE ENDS THIS HUNT, if any. PURE — and it is the ONE definition, so
 * the live tick and the away replay cannot answer it differently (`AWAY-1`).
 *
 * ⚠ IT TAKES THE STATE THE SETTLE IS ALREADY HOLDING and nothing else. There is
 *   no scheduler, no timer row and no second writer: the whole feature is a
 *   predicate the simulation already had the inputs for (design §2.4).
 *
 * @param o.stop        the validated stop object, or null
 * @param o.stance      the resolved stance preset (its `falls` is a FLOOR under
 *                      the player's own rule — the stricter of the two wins)
 * @param o.consecFalls consecutive falls AT THE END of this window
 * @param o.bagFree     free stack slots in the bag AT THE END of this window
 * @param o.foodStack   units of the nominated/eaten food left in the bag
 * @param o.ammoStock   units of equipped ammo left
 * @param o.paidMs      PAID ms this hunt has accrued since `active_since`,
 *                      INCLUDING this window — the same `ms` the ledger records
 * @returns the rule name that fired, or null
 */
export function evaluateStop(o) {
  const c = o || {};
  const stop = (c.stop && typeof c.stop === 'object') ? c.stop : {};
  const stance = c.stance || STANCES[DEFAULT_STANCE];

  for (const rule of STOP_ORDER) {
    switch (rule) {
      case 'falls': {
        /* THE STRICTER OF THE TWO. The stance's `falls` is a standing order
           ("careful means two"); the player's own `stop.falls` is this hunt's
           instruction. Neither may LOOSEN the other — and neither touches the
           Recovery Rule's own Retreat ladder (away.js `retreatAtFall`), which
           continues to fire underneath both. */
        const limits = [];
        if (Number.isInteger(stance.falls) && stance.falls >= 1) limits.push(stance.falls);
        if (Number.isInteger(stop.falls) && stop.falls >= 1) limits.push(stop.falls);
        if (!limits.length) break;
        const n = Math.floor(Number(c.consecFalls));
        /* `>=`, never `===` — a counter that arrives already past the rung must
           still stop, exactly as retreatAtFall states. */
        if (Number.isFinite(n) && n >= Math.min.apply(null, limits)) return 'falls';
        break;
      }
      case 'bag_full': {
        if (stop.bag_full !== true) break;
        /* ⚠ `null` AND `undefined` ARE CHECKED BEFORE THE CAST, AND THAT IS THE
             WHOLE FAIL-SAFE. `Number(null)` is 0 and 0 is finite, so a
             `Number.isFinite` test alone reads "I do not know how many free
             slots there are" as "there are none" and ends the night. This game
             has NO bag capacity today (there is no slot limit anywhere in
             src/core or src/data), so the engine passes `null` on every call —
             which under the earlier form stopped every hunt that set the rule,
             immediately, for a reason that does not exist.
             Caught by tests/hunt-stance-stop.mjs S7, which is why that arm
             exists rather than trusting this comment. */
        if (c.bagFree === null || typeof c.bagFree === 'undefined') break;
        const free = Math.floor(Number(c.bagFree));
        /* FAIL-SAFE IS "DO NOT STOP". An unreadable bag count must not end a
           night that was going fine; a bag that is genuinely full re-asserts
           itself on the next window, which costs one window and never a hunt. */
        if (Number.isFinite(free) && free <= 0) return 'bag_full';
        break;
      }
      case 'food_floor': {
        if (!Number.isInteger(stop.food_floor)) break;
        /* The same null-is-not-zero rule as bag_full above. */
        if (c.foodStack === null || typeof c.foodStack === 'undefined') break;
        const have = Math.floor(Number(c.foodStack));
        if (Number.isFinite(have) && have < stop.food_floor) return 'food_floor';
        break;
      }
      case 'ammo_floor': {
        if (!Number.isInteger(stop.ammo_floor)) break;
        /* The same null-is-not-zero rule as bag_full above. */
        if (c.ammoStock === null || typeof c.ammoStock === 'undefined') break;
        const have = Math.floor(Number(c.ammoStock));
        if (Number.isFinite(have) && have < stop.ammo_floor) return 'ammo_floor';
        break;
      }
      case 'hours': {
        if (!Number.isInteger(stop.hours)) break;
        const paid = Math.floor(Number(c.paidMs));
        if (Number.isFinite(paid) && paid >= stop.hours * 3600000) return 'hours';
        break;
      }
      default: break;
    }
  }
  return null;
}

/* ── VIGOUR ─────────────────────────────────────────────────────────────────
   A DAILY BUDGET OF PAID HUNTING MINUTES (design §4). Not a bar that blocks
   play: the line past which a hunt stops paying full rate.

   ⚠ THE UNIT IS MINUTES OF PAID COMBAT TIME — the same `ms` the ledger already
     records, so a window cannot pay and not charge: there is one number
     (design §5). Gather and artisan do NOT charge Vigour (design §4.1).

   ⚠ `VIGOUR_DRY_MULT` IS `AMMO_DRY_MULT`, DERIVED AND NOT RETYPED. The designer
     chose it precisely so that "dry means a quarter" is learned once and true
     twice (design §4.3). Importing it rather than writing 0.25 is what stops
     the two drifting the day one is retuned.
     TYLER (design §4.6) may set this to 0.00; it is a DERIVATION, so the change
     is one edit in ammo.js or one override here, never a hunt for copies. */
export const VIGOUR_DRY_MULT = AMMO_DRY_MULT;

/** The free daily grant's FLOOR, in minutes (design §4.1). 720 = 12 h, which is
    `offlineCapHours()`'s base for everybody, so nobody can lose time they can
    already earn today. */
export const VIGOUR_FLOOR_MIN = 720;

/** The hard ceiling on PAID minutes in one UTC day, however large the grant and
    however many refills are bought (design §4.4). Two hours a day that gold
    cannot buy is what keeps "richest player hunts most" from becoming "richest
    player hunts always". */
export const VIGOUR_CEILING_MIN = 22 * 60;

/** Minutes one refill adds (design §4.4). The PRICE is not here — it is a row
    in the server catalogue, because it is money. */
export const VIGOUR_REFILL_MIN = 120;

/** At most this many refills per UTC day (design §4.4). */
export const VIGOUR_MAX_REFILLS = 5;

/**
 * THE FREE DAILY GRANT, DERIVED — never a stored number and never a second
 * ladder (design §4.1). It is the character's own offline cap in minutes,
 * floored at VIGOUR_FLOOR_MIN, so the renown and property perks that extend
 * offline time extend the hunt budget too.
 *
 * @param offlineCapMs `hr_offline_cap_ms(user, slot)` — the SERVER's number
 */
export function vigourGrantMin(offlineCapMs) {
  const ms = Number(offlineCapMs);
  const fromCap = (Number.isFinite(ms) && ms > 0) ? Math.floor(ms / 60000) : 0;
  return Math.max(VIGOUR_FLOOR_MIN, fromCap);
}

/**
 * THE BUDGET a character may spend today: the derived grant plus what they have
 * BOUGHT, capped by the ceiling gold cannot pass.
 *
 * @param o.offlineCapMs the server's offline cap
 * @param o.refills      refills bought today (clamped to VIGOUR_MAX_REFILLS)
 */
export function vigourBudgetMin(o) {
  const c = o || {};
  const bought = Math.max(0, Math.min(VIGOUR_MAX_REFILLS,
    Math.floor(Number(c.refills) || 0))) * VIGOUR_REFILL_MIN;
  return Math.min(VIGOUR_CEILING_MIN, vigourGrantMin(c.offlineCapMs) + bought);
}

/**
 * SPLIT a window's paid time at the budget line.
 *
 * ⚠ RUNNING OUT DOES NOT STOP YOU (design §4.3). A hard stop means a player who
 *   set an eight-hour hunt before bed gets six paid hours and two hours of a
 *   character standing still, which reads as a punishment for sleeping — and
 *   this game has already charged a player for sleeping once.
 *
 * @param o.spentMin  paid minutes ALREADY charged today (before this window)
 * @param o.budgetMin today's budget, from vigourBudgetMin
 * @param o.windowMs  this window's paid ms
 * @returns { fullMs, dryMs } — both floors, and they sum to windowMs
 */
export function vigourSplit(o) {
  const c = o || {};
  const windowMs = Math.max(0, Math.floor(Number(c.windowMs) || 0));
  const budget = Math.max(0, Math.floor(Number(c.budgetMin) || 0));
  const spent = Math.max(0, Math.floor(Number(c.spentMin) || 0));
  const headroomMs = Math.max(0, budget - spent) * 60000;
  const fullMs = Math.min(windowMs, headroomMs);
  return { fullMs, dryMs: windowMs - fullMs };
}

/**
 * THE WINDOW'S PAY MULTIPLIER — the time-weighted blend of the full and dry
 * halves. 1 when the whole window is inside the budget, VIGOUR_DRY_MULT when
 * none of it is.
 *
 * ⚠ ONE MULTIPLIER FOR THE WHOLE WINDOW, and that is a stated approximation
 *   rather than an accident. The exact form would re-simulate the span twice at
 *   two rates, which is a SECOND combat path (`AWAY-12` forbids one). A blend is
 *   identical in expectation, is the same number attended and away, and errs in
 *   neither direction. A window is bounded by the settle cadence, so the
 *   in-window error is bounded with it.
 */
export function vigourMult(o) {
  const { fullMs, dryMs } = vigourSplit(o);
  const total = fullMs + dryMs;
  if (total <= 0) return 1;
  return (fullMs + dryMs * VIGOUR_DRY_MULT) / total;
}

/** The daily counter's `player_progress` key. ONE spelling, imported by the
    engine and asserted by the migration, so the row the engine writes and the
    row `hr_vigour_of` reads cannot be two rows (design §4.2). */
export const VIGOUR_PROGRESS_KEY = 'ev:vigour_min';
/** The SUB-MINUTE REMAINDER's key — same row family, same day period, same
    writer. See `vigourCharge`: the pair is ONE number in two columns, and
    `hr_vigour_of` is the only thing that ever adds them back together. */
export const VIGOUR_REMAINDER_KEY = 'ev:vigour_rem_ms';
/** The refill counter's key, same row family, same day period. */
export const VIGOUR_REFILL_KEY = 'ev:vigour_refills';

/** Minutes are 60,000 ms, and the remainder row is by construction under one. */
const MS_PER_MIN = 60000;

/**
 * THE VIGOUR CHARGE FOR ONE SETTLED WINDOW — and it CONSERVES UNDER
 * SUBDIVISION, which is the whole point of this function's shape.
 *
 * ⚠ THIS USED TO BE `vigourChargeMin(windowMs) = floor(ms / 60000)`, PER
 *   WINDOW, WITH THE REMAINDER DISCARDED, and that was finding S-1 of
 *   docs/planning/SEC_HUNTS_M6_2026-09-22.md — a P0 BLOCK on both vigour files.
 *   A floor per window makes the daily limiter a function of how often a player
 *   settles: 40 minutes charged for an hour at an ordinary 90 s poll cadence
 *   (no privilege, nothing forged), and ZERO for an hour of sub-minute
 *   `set_activity` collects, which are exempt from ACCRUE_MIN_MS by design.
 *   Design §5 states the law this must obey in its own italics —
 *   "Vigour is charged from the same `ms` the payout is computed from … BECAUSE
 *   THERE IS ONE NUMBER" — and accrual.js states the payout half of it as
 *   "time is conserved: switching twice pays the same total as switching once".
 *
 * ⚠ A FLOOR IN ANY UNIT HAS THE SAME DEFECT, which is why this is not "the same
 *   bug in seconds". For a floor of granularity U, windows of just under 2U
 *   charge U — a 50% discount at whatever cadence the attacker picks. The
 *   remainder must be KEPT, not made smaller.
 *
 * ── WHY TWO ROWS AND NOT ONE, AND WHY NOT A CARRY COLUMN (the review offered
 *    both; this is option (b), and the file says so) ──────────────────────────
 * The review's option (b) — "charge in the ledger's own unit and let
 * `hr_vigour_of` do the division" — cannot be spent as raw ms in ONE row:
 * `hr_apply`'s `c_max_progress_add` is 1,000,000 and a capped 24 h window is
 * 86,400,000 ms, so the delta would be REFUSED and the player would lose their
 * night. So the same number is written as a quotient and a remainder:
 *
 *     addMin = floor(windowMs / 60000)          ≤ 1,440   per window
 *     remMs  = windowMs - addMin * 60000        <  60,000 per window
 *
 * and `hr_vigour_of` reads `spent_min = minutes + floor(remainder_ms / 60000)`.
 * That is EXACT, not merely finer, and the proof is one line of arithmetic:
 * for any partition {wᵢ} of a span, Σwᵢ = 60000·Σqᵢ + Σrᵢ, so
 * floor(Σwᵢ/60000) = Σqᵢ + floor(Σrᵢ/60000) — the right-hand side is precisely
 * what the two counters hold. The total charged for a span is therefore a
 * function of the ELAPSED TIME ALONE and not of how the span was cut up.
 *
 * Option (a), a `vigour_carry_ms` column on `player_state`, would have been a
 * new column, a new `hr_apply` delta key and a new piece of engine state that
 * the attended, away and tick paths would each have to thread identically.
 * This is stateless: the same pure function of `windowMs`, called once, in the
 * one engine all three callers share (AWAY-1, AWAY-12).
 *
 * @param windowMs this window's PAID ms — the same `grantMs` the payout used
 * @returns { addMin, remMs } — both non-negative, and
 *          `addMin * 60000 + remMs === floor(windowMs)` exactly
 */
export function vigourCharge(windowMs) {
  const ms = Math.max(0, Math.floor(Number(windowMs) || 0));
  const addMin = Math.floor(ms / MS_PER_MIN);
  return { addMin, remMs: ms - (addMin * MS_PER_MIN) };
}
