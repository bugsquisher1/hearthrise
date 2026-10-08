// ============================================================
// src/core/progression.js — the two mixed functions from design §4.3,
// with their arithmetic separated from their side effects.
//
// THE EXTRACTION PATTERN (design §4.3): the free variable `G` becomes a
// passed-in state object, and every notify()/render() call becomes a push
// onto `events[]`. The caller decides what an event MEANS — the client
// turns it into a toast, the server puts it in the intent envelope. Core
// never knows either exists.
//
// These functions DO mutate the state object they are handed (skills,
// restedXp, toolCarry). That is deliberate: the alternative is copying a
// whole character on every 500 ms tick. They mutate nothing else, read no
// free variables, and perform no I/O — which is the property that lets
// them run in Deno.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { levelFromXp } from './xp.js?v=564';
import { pacedXp } from './pacing.js?v=564';
import { spendRestedCharge } from './rested.js?v=564';
import { advanceToolCarry } from './tools.js?v=564';

/* b228 P1 (bonus-rebase.md §5.4): this list used to name four styles and
   silently skip RANGED and MAGIC, so two of the seven combat skills were paid
   nothing by the Trophy Room, the Watchtower, War Drums or Hunter's Moon —
   and nothing on any screen said so. ONE list, read by both the XP grant and
   the hint the player sees, so they can never disagree again. */
export const COMBAT_XP_SKILLS = ['attack', 'strength', 'defense', 'hitpoints', 'ranged', 'magic'];

/* ── FRACTIONAL XP IS CARRIED, NEVER FLOORED AWAY (game-designer ruling,
   2026-10-07, final) ─────────────────────────────────────────────────────────
   XP is paid on damage DEALT, so an 8-HP kill pays ~10 XP per skill and
   a per-grant floor swallowed every small multiplier whole: Trophy rung 2
   (+2%) paid NOTHING against any monster of 12 HP or less, because
   floor(10.6 x 1.02) = 10. The ruling: keep a per-skill REMAINDER in [0,1),
   apply every multiplier to the exact value ONCE, credit floor(frac + grant)
   and carry the rest. No RNG — the remainder is arithmetic, so every seeded
   draw is unchanged.

   FIXED POINT, so batching cannot move a unit. The remainder and each grant
   are held as integers of 1/XP_FRAC_SCALE XP; the carry is integer addition
   and one integer division. Over any N grants the credit is exactly
   floor((frac0 + sum of grants) / SCALE) whether they arrive one per swing
   (the live tick), in one 12-hour span (away) or in 10-second windows chained
   through hr_apply (the world tick). A float accumulator would agree only
   "almost always", which is not a property a ranked surface can rest on.

   SERVER-OWNED. `player_skills.xp_frac` (2026-10-09-xp-frac-carry.sql) is
   written only by hr_apply from the engine's delta and projected by
   hr_state_of; the client renders the integer and never sends the fraction. */
export const XP_FRAC_SCALE = 1000000;

/** A remainder (a number in [0,1)) as integer units, CLAMPED to [0, SCALE-1].
    Garbage, negatives and NaN are 0 — the never-mint direction. */
export function xpFracUnits(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(XP_FRAC_SCALE - 1, Math.round(n * XP_FRAC_SCALE));
}

/** The server's per-skill remainder map, normalised. `null` when the input is
    not an object — PRESENCE OF KEY, the toolCarry idiom: a database with no
    `xp_frac` column projects nothing, and the engine must then propose no
    `xp_frac` key hr_apply would refuse as unknown. */
export function normaliseXpFrac(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const k of Object.keys(raw)) {
    const u = xpFracUnits(raw[k]);
    if (u > 0) out[k] = u / XP_FRAC_SCALE;
  }
  return out;
}

/** The remainders that MOVED between two maps, as the delta's `xp_frac`
    (absolute per skill, the tool_carry shape). Compared in units, so a
    projection round trip (numeric -> JSON -> Number) never reads as a move. */
export function xpFracChanges(before, after) {
  const out = {};
  const b = before || {};
  const a = after || {};
  for (const k of Object.keys(a)) {
    const u = xpFracUnits(a[k]);
    if (u !== xpFracUnits(b[k])) out[k] = u / XP_FRAC_SCALE;
  }
  return out;
}

/**
 * The whole of addXp's maths.
 *
 * @param state  { skills, xpFrac, restedXp }  — MUTATED
 * @param ctx    { bonus, xpB, restedQuantum, authored }
 * @returns { gain, base, rested, oldLevel, newLevel, events }
 *
 * Ordering is load-bearing:
 *   PACE first, then the additive perk block, applied to the EXACT value
 *   once, then ONE floor of (carried remainder + grant), the rest carried in
 *   `state.xpFrac[skillId]`; then the rested quantum ADDED OUTSIDE the floor
 *   and outside the multiplier. A rested charge is capacity, not throughput —
 *   letting +15% allXP scale it would quietly turn the bank back into
 *   throughput, which is the exact thing the b228 conversion exists to stop.
 *   With a carry there is no "a positive grant never rounds to zero" floor:
 *   the 0.5 XP a 1-damage hit is worth is carried and paid on the next hit,
 *   which is exact where the old max(1, …) over-paid the low end and
 *   under-paid every multiplier. Without one (no `state.xpFrac`, a database
 *   that has no column yet) the pre-ruling per-grant floor stands.
 */
export function grantXp(state, skillId, amt, ctx) {
  const c = ctx || {};
  const bonusFn = typeof c.bonus === 'function' ? c.bonus : () => 0;
  const perk = (bonusFn('allXP') || 0) + (c.xpB || 0);
  const combat = COMBAT_XP_SKILLS.indexOf(skillId) >= 0 ? (bonusFn('combatXP') || 0) : 0;

  const rested = amt > 0 ? spendRestedCharge(state, c.restedQuantum || 0) : 0;
  const base = c.authored ? (Number(amt) || 0) : pacedXp(skillId, amt);
  const raw = base * (1 + perk + combat);

  /* PRESENCE OF KEY, the toolCarry idiom. A state that carries an `xpFrac` map
     is a state whose server owns the column (the engine builds it from the
     projection), and there the remainder is carried. A state WITHOUT one — a
     database with no column yet, or legacy.js addXp's display-only prediction
     shadow (no new client prediction since 2026-09-16; the server pays) —
     keeps the pre-ruling per-grant floor, so an
     edge deployed before 2026-10-09-xp-frac-carry.sql applies does not start
     dropping each window's remainder on the floor — a 10 s world-tick gather
     chain would lose ~6% of its XP that way (tests/world-tick-parity P-G1).
     DEBT, bounded: once the column is live everywhere this branch is dead and
     goes, with the fixtures that still omit the map. */
  let whole = 0;
  if (state.xpFrac && typeof state.xpFrac === 'object') {
    if (raw > 0) {
      const total = xpFracUnits(state.xpFrac[skillId]) + Math.round(raw * XP_FRAC_SCALE);
      whole = Math.floor(total / XP_FRAC_SCALE);
      state.xpFrac[skillId] = (total - whole * XP_FRAC_SCALE) / XP_FRAC_SCALE;
    }
  } else {
    whole = raw > 0 ? Math.max(1, Math.floor(raw)) : 0;
  }
  const gain = whole + rested;

  if (!state.skills) state.skills = {};
  const oldLevel = levelFromXp(state.skills[skillId] || 0);
  state.skills[skillId] = (state.skills[skillId] || 0) + gain;
  const newLevel = levelFromXp(state.skills[skillId]);

  const events = [];
  if (newLevel > oldLevel) events.push({ type: 'levelup', skill: skillId, from: oldLevel, to: newLevel });

  return { gain, base, rested, oldLevel, newLevel, events };
}

/**
 * The whole of doSkillAction's maths — node lookup, level gate, yield roll,
 * the deterministic tool carry.
 *
 * @param action  the TREES/ROCKS/FISH_SPOTS row
 * @param ctx     { skillId, level, toolCarry, toolDouble, toolXpB, rng }
 * @returns { ok, reason?, qty, toolDoubles, product, xpAmount }
 *
 * `ok:false, reason:'level'` is the seam that stops the activity — core
 * states the fact, the caller decides whether that means stopSkill() (client)
 * or a `not_unlocked` error code (server).
 */
export function resolveGatherAction(action, ctx) {
  const c = ctx || {};
  if (!action) return { ok: false, reason: 'no_action', qty: 0, toolDoubles: 0, product: null, xpAmount: 0 };
  if ((c.level || 0) < (action.req || 0)) {
    return { ok: false, reason: 'level', qty: 0, toolDoubles: 0, product: action.prod, xpAmount: 0 };
  }
  let qty = c.rng.int(action.qty[0], action.qty[1]);
  /* Wave 3: extra tool yield is a DETERMINISTIC fractional carry, never an
     RNG roll, specifically so the offline replay is byte-identical. */
  let toolDoubles = 0;
  const dbl = c.toolDouble || 0;
  if (dbl > 0 && c.toolCarry) {
    toolDoubles = advanceToolCarry(c.toolCarry, c.skillId, qty, dbl);
    qty += toolDoubles;
  }
  const toolXp = c.toolXpB || 0;
  const xpAmount = toolXp > 0 ? (action.xp * (1 + toolXp)) : action.xp;
  return { ok: true, qty, toolDoubles, product: action.prod, xpAmount };
}
