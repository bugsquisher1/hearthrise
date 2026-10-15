// ============================================================================
// tests/hunt-fixture.mjs — A FIGHT IS A HUNT SESSION: ONE FIXTURE SHAPE FOR IT.
//
// Not a guard: a helper the guards import. Since the closed rebuild (lane C2)
// the away combat span is deleted outright — `simulateSpan` prices a fight only
// when `state.huntSession` is set, and `computeAccrual` refuses a combat pointer
// without one (`hunt_required`). Guards that MEASURE a fight (kill rates, drop
// reach, consumption, goal counters) therefore put it on a hunt session, and
// they all do it the same way, here, rather than each hand-rolling a session.
//
// The session is the server's own shape (src/core/action-rules.js
// newHuntSession) and the swing seed is the edge's own keyed seeder
// (supabase/functions/hr-accrue/hunt-seed.js swingSeederFor): nothing here is a
// second engine, it only fills the inputs the one engine reads.
//
//   huntOn(state, ctx, opts)       a direct simulateSpan caller: attaches the
//                                  session to `state` and the seeder to `ctx`
//   huntAccrualInput(inp, opts)    a computeAccrual caller: the same input with
//                                  the session, its window and its secret
//
// opts: { seed, fromMs, food, foodQty, bag, slots, fallsLimit, hoursLimit, pull }
//   food/foodQty   loaded into the bag behind the default preset's heal slot
//                  (heal at <= 50%), which is how a hunt eats
//   pull           { size, respawnMs }; default ONE foe back after the
//                  training respawn (src/data/hunts.js TRAINING_RESPAWN_MS) —
//                  the real pace of a training fight, never an instant respawn
//
// NO ?v= on the imports (tests/**, not a browser module — b332).
// ============================================================================

import { newHuntSession } from '../src/core/action-rules.js';
import { DEFAULT_PRESET } from '../src/data/rule-subjects.js';
import { SESSION_LIMITS } from '../src/data/hunt-sessions.js';
import { TRAINING_RESPAWN_MS } from '../src/data/hunts.js';
import { swingSeederFor } from '../supabase/functions/hr-accrue/hunt-seed.js';

/** hr_seed's text shape (a signed 64-bit integer), from any integer seed. */
export const secretOf = (seed) => String(BigInt.asIntN(64, BigInt(Math.floor(Number(seed) || 0)) * 2654435761n + 1n));

/** A hunt session as the server stores it, for a fixture. */
export function huntSessionFor(opts) {
  const o = opts || {};
  const fromMs = Math.floor(Number(o.fromMs) || 0);
  const bag = o.bag || (o.food ? { [o.food]: { loaded: Math.floor(Number(o.foodQty) || 0) } } : {});
  const pull = o.pull || {};
  return newHuntSession({
    id: o.id || 'fixture-hunt',
    huntFromMs: fromMs,
    nextSwingAtMs: fromMs,
    bag,
    slots: o.slots || DEFAULT_PRESET.slots,
    fallsLimit: o.fallsLimit ?? SESSION_LIMITS.falls.max,
    hoursLimit: o.hoursLimit ?? null,
    pull: {
      size: Math.max(1, Math.floor(Number(pull.size) || 1)),
      respawnMs: pull.respawnMs ?? TRAINING_RESPAWN_MS,
      left: 0,
      respawnAtMs: fromMs,
    },
  });
}

/** Put a direct `simulateSpan` caller's fight on a hunt session. */
export function huntOn(state, ctx, opts) {
  const o = opts || {};
  const fromMs = Math.floor(Number(o.fromMs ?? ctx.fromMs) || 0);
  const hs = huntSessionFor({ ...o, fromMs });
  state.huntSession = hs;
  ctx.swingSeed = swingSeederFor(secretOf(o.seed ?? 1), hs.id);
  return hs;
}

/** A `computeAccrual` input with the session, its window and its secret. */
export function huntAccrualInput(inp, opts) {
  const o = opts || {};
  const fromMs = Math.floor(Number(inp.accruedToMs) || 0);
  const hs = huntSessionFor({ ...o, fromMs });
  return {
    ...inp,
    huntSession: hs,
    huntWindow: { fromMs, toMs: Math.floor(Number(inp.nowMs) || 0) },
    huntSecret: secretOf(o.seed ?? inp.seed ?? 1),
  };
}
