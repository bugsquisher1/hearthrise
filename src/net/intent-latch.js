// ============================================================================
// src/net/intent-latch.js — ONE IN-FLIGHT LATCH PER VALUE GESTURE.
//
// A real mouse double-click on House > Plot "Upgrade · 500" sent TWO
// hr_farm_upgrade_plot calls with two different idempotency keys. That verb is
// RELATIVE (`plot_level + 1` under the row lock), so a player levelled for two
// tiers was charged for both — and when gold ran short the second paid in
// tradeable Farmer's Deeds. Two keys are two intents; the server is right to
// honour both. The defect is the client sending a second intent the player
// never meant.
//
// THE RULE: a gesture whose server effect is relative or spends value holds a
// latch from the moment it sends until its answer (or its deadline). A second
// call under the same key while the first is on the wire sends NOTHING and
// resolves to a held answer `{ok:false, error:'in_flight', inFlight:true}` —
// which every caller treats as silence (the first call answers for both), never
// as a refusal to toast or a prediction to revert.
//
// The latch is released when the sent promise settles (either way) or when
// `holdMs` passes, whichever is first — a request that never answers must not
// lock the button for the rest of the session. A release is generation-checked,
// so a late settle of an expired hold never frees a newer one.
//
// Several sibling modules grew their own booleans for this (homestead.js
// `_upgradeInFlight`, renown.js `_claimInFlight`, legacy.js buyBankSpaceGold
// `_inflight[offer]`). New sites use THIS helper; it is pure (no DOM, no
// network) and published on window for the classic-script callers.
// ============================================================================

export const IN_FLIGHT = 'in_flight';

/** Long enough to outlast every transport deadline that feeds it (farm/gold:
 *  15 s), short enough that a lost answer frees the control within a breath. */
export const DEFAULT_HOLD_MS = 20000;

/** True for the answer a latched second call resolves to. */
export function isInFlightAnswer(ans) {
  return !!(ans && typeof ans === 'object' && ans.inFlight === true && ans.error === IN_FLIGHT);
}

/**
 * A latch keyed by gesture (e.g. 'upgrade:0', 'water:0:3'). Each instance is
 * one module's private set of holds.
 *   run(key, fire, {holdMs})  → fire() once and return its promise, or, while
 *                               `key` is held, a resolved held answer.
 *   held(key) / size() / reset() — reads and the test teardown.
 */
export function createIntentLatch() {
  const holds = new Map();   // key → token (one object per hold)
  function release(k, token) {
    const h = holds.get(k);
    if (h !== token) return;            // an expired hold's late settle: not ours
    holds.delete(k);
    if (token.timer) clearTimeout(token.timer);
  }
  return {
    run(key, fire, opts) {
      const k = String(key);
      if (holds.has(k)) return Promise.resolve({ ok: false, error: IN_FLIGHT, inFlight: true, key: k });
      const ms = (opts && Number(opts.holdMs) > 0) ? Number(opts.holdMs) : DEFAULT_HOLD_MS;
      const token = { timer: null };
      holds.set(k, token);
      token.timer = setTimeout(() => release(k, token), ms);
      let p;
      try { p = Promise.resolve(fire()); }
      catch (e) { release(k, token); return Promise.reject(e); }
      /* Registered BEFORE the caller's own .then, so the latch is open again by
         the time the caller renders the answer (a follow-up tap works). */
      p.then(() => release(k, token), () => release(k, token));
      return p;
    },
    held(key) { return holds.has(String(key)); },
    size() { return holds.size; },
    reset() { for (const t of holds.values()) if (t.timer) clearTimeout(t.timer); holds.clear(); },
  };
}

if (typeof window !== 'undefined') {
  window.HearthriseIntentLatch = { IN_FLIGHT, DEFAULT_HOLD_MS, isInFlightAnswer, createIntentLatch };
}
