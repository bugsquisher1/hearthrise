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

import { levelFromXp } from './xp.js?v=446';
import { pacedXp } from './pacing.js?v=446';
import { spendRestedCharge } from './rested.js?v=446';
import { advanceToolCarry } from './tools.js?v=446';

/* b228 P1 (bonus-rebase.md §5.4): this list used to name four styles and
   silently skip RANGED and MAGIC, so two of the seven combat skills were paid
   nothing by the Trophy Room, the Watchtower, War Drums or Hunter's Moon —
   and nothing on any screen said so. ONE list, read by both the XP grant and
   the hint the player sees, so they can never disagree again. */
export const COMBAT_XP_SKILLS = ['attack', 'strength', 'defense', 'hitpoints', 'ranged', 'magic'];

/**
 * The whole of addXp's maths.
 *
 * @param state  { skills, restedXp }  — MUTATED
 * @param ctx    { bonus, xpB, restedQuantum, authored }
 * @returns { gain, base, rested, oldLevel, newLevel, events }
 *
 * Ordering is load-bearing and unchanged from legacy.js:
 *   PACE first, then the additive perk block, then ONE floor, then the
 *   rested quantum ADDED OUTSIDE the floor and outside the multiplier.
 *   A rested charge is capacity, not throughput — letting +15% allXP scale
 *   it would quietly turn the bank back into throughput, which is the exact
 *   thing the b228 conversion exists to stop. And a positive grant never
 *   rounds to zero: a 1-damage hit must still be worth 1 Hitpoints XP or the
 *   low end of combat goes dead.
 */
export function grantXp(state, skillId, amt, ctx) {
  const c = ctx || {};
  const bonusFn = typeof c.bonus === 'function' ? c.bonus : () => 0;
  const perk = (bonusFn('allXP') || 0) + (c.xpB || 0);
  const combat = COMBAT_XP_SKILLS.indexOf(skillId) >= 0 ? (bonusFn('combatXP') || 0) : 0;

  const rested = amt > 0 ? spendRestedCharge(state, c.restedQuantum || 0) : 0;
  const base = c.authored ? (Number(amt) || 0) : pacedXp(skillId, amt);
  const raw = base * (1 + perk + combat);
  const gain = (raw > 0 ? Math.max(1, Math.floor(raw)) : 0) + rested;

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
