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
// THE RULE: a gesture whose server effect is relative, escalating or spends
// value holds a latch from the moment it sends until BOTH its answer has come
// back AND MIN_HOLD_MS has passed since the send. A
// second call under the same key while the latch is held sends NOTHING and
// resolves to the held answer `{ok:false, error:'in_flight', inFlight:true}`,
// which every caller treats as silence (the first call answers for both),
// never as a refusal to toast or a prediction to revert.
//
// WHY A FLOOR, NOT JUST THE ANSWER: a fast server answers in 40-120 ms and the
// second press of a double-click lands 100-500 ms after the first. Releasing on
// the answer alone let the second press through as a fresh intent (measured in
// review: 3 of 4 answer/gap pairs). The floor outlasts an OS double-click window.
//
// SAME LOGICAL INTENT, SAME KEY: `fire(idem)` is handed the idempotency key to
// send. When the last answer under this latch key was AMBIGUOUS — the client
// gave up (timeout / transport / http / unreadable body) without a server
// verdict, so the server may have committed — the NEXT run under the same key
// (within RETRY_KEY_TTL_MS) is handed the SAME idem, and the server's intent
// cache replays the committed answer instead of buying again. Any server
// verdict (ok or a named refusal) retires the key.
//
// The latch is released at the later of answer/floor, or when `holdMs` passes,
// whichever is first — a request that never answers must not lock the button
// for the rest of the session. A release is generation-checked, so a late
// settle of an expired hold never frees a newer one. Every transport that feeds
// a latch carries its own deadline BELOW the hold it runs under.
//
// Pure (no DOM, no network); published on window for the classic-script
// callers. New value gestures use THIS helper, not a module boolean: a boolean
// released on the answer lets a fast answer's second click buy the NEXT rung
// (property tier, bank rung), which is the class the floor exists to close.
//
// EVERY LATCH IS REGISTERED. A held floor outlives the gesture by up to 600 ms,
// so a test that ends inside one hands its hold to the next test's first tap.
// `resetAllIntentLatches()` is the ONE teardown the in-page harness calls
// after every test; a new latch is covered by construction, not by a new line
// in someone's finally. A reset also retires late settles of the holds it
// dropped (epoch check), so an abandoned call cannot plant a retry key later.
// ============================================================================

export const IN_FLIGHT = 'in_flight';

/** The default cap: outlasts the 15 s transport deadline of one call (farm,
 *  gold, workers, clan seat, goal-claim). A CHAIN of calls passes its own. */
export const DEFAULT_HOLD_MS = 20000;

/** The floor under every hold: longer than an OS double-click window (500 ms
 *  default), so the second press of one gesture always lands on a held latch. */
export const MIN_HOLD_MS = 600;

/** How long an ambiguous answer's key is kept for the retry of that intent. */
export const RETRY_KEY_TTL_MS = 120000;

/** True for the answer a latched second call resolves to. */
export function isInFlightAnswer(ans) {
  return !!(ans && typeof ans === 'object' && ans.inFlight === true && ans.error === IN_FLIGHT);
}

const NO_VERDICT = /^(timeout|transport|network|bad_response|http_|no_fetch|no_config)/;
/* gold.js answers {outcome, reason} with no `error`: these four carry no
   verdict (UNANSWERED_OUTCOMES + the answered-but-not-unwritten pair). */
const NO_VERDICT_OUTCOMES = ['timeout', 'unreachable', 'unavailable', 'malformed'];
/** True when the answer carries no server verdict — the intent may or may not
 *  have committed, so a retry must carry the same key. */
export function isAmbiguousAnswer(ans) {
  if (!ans || typeof ans !== 'object') return true;
  if (typeof ans.outcome === 'string' && NO_VERDICT_OUTCOMES.indexOf(ans.outcome) !== -1) return true;
  return typeof ans.error === 'string' && NO_VERDICT.test(ans.error);
}

function uuid() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const REGISTRY = new Set();   // every latch ever made (a handful per session)

/**
 * A latch keyed by gesture (e.g. 'upgrade:0', 'water:0:3'). Each instance is
 * one module's private set of holds.
 *   run(key, fire, {holdMs, scope}) → fire(idem) once and return its
 *       promise, or, while `key` is held, a resolved held answer. `scope`
 *       names WHAT the gesture buys (an offer id): a retry key is reused only
 *       for the same scope, so a replayed answer is never read as the next rung.
 *   held(key) / reset() — the read and the test teardown.
 */
export function createIntentLatch() {
  const holds = new Map();   // key → token (one object per hold)
  const retry = new Map();   // key → { idem, at } of an ambiguous answer
  let epoch = 0;             // bumped by reset(): a dropped hold's late settle is inert
  function release(k, token) {
    if (holds.get(k) !== token) return;   // an expired hold's late settle: not ours
    holds.delete(k);
    if (token.timer) clearTimeout(token.timer);
  }
  function idemFor(k, scope) {
    const r = retry.get(k);
    if (r && r.scope === scope && Date.now() - r.at < RETRY_KEY_TTL_MS) return r.idem;
    retry.delete(k);
    return uuid();
  }
  const api = {
    run(key, fire, opts) {
      const k = String(key);
      if (holds.has(k)) return Promise.resolve({ ok: false, error: IN_FLIGHT, inFlight: true, key: k });
      const o = opts || {};
      const cap = Number(o.holdMs) > 0 ? Number(o.holdMs) : DEFAULT_HOLD_MS;
      const sentAt = Date.now();
      const token = { timer: null };
      holds.set(k, token);
      token.timer = setTimeout(() => release(k, token), cap);
      const scope = o.scope === undefined ? undefined : String(o.scope);
      const idem = idemFor(k, scope);
      const born = epoch;
      const settle = (ans, rejected) => {
        if (born !== epoch) return;            // reset() dropped this hold: not ours
        if (rejected || isAmbiguousAnswer(ans)) retry.set(k, { idem, scope, at: Date.now() });
        else if (retry.has(k) && retry.get(k).idem === idem) retry.delete(k);
        const left = sentAt + MIN_HOLD_MS - Date.now();
        if (left <= 0) { release(k, token); return; }
        if (holds.get(k) !== token) return;
        clearTimeout(token.timer);
        token.timer = setTimeout(() => release(k, token), left);
      };
      let p;
      try { p = Promise.resolve(fire(idem)); }
      catch (e) { settle(null, true); return Promise.reject(e); }
      /* Registered BEFORE the caller's own .then, so a follow-up tap after the
         floor works the moment the caller renders the answer. */
      p.then((a) => settle(a, false), () => settle(null, true));
      return p;
    },
    held(key) { return holds.has(String(key)); },
    size() { return holds.size; },
    reset() {
      epoch++;
      for (const t of holds.values()) if (t.timer) clearTimeout(t.timer);
      holds.clear(); retry.clear();
    },
  };
  REGISTRY.add(api);
  return api;
}

/** One latch per NAME for the whole page (classic-script callers share it with
 *  no module state of their own): namedLatch('homestead'), namedLatch('bank'). */
const NAMED = new Map();
function namedLatch(name) {
  const n = String(name);
  if (!NAMED.has(n)) NAMED.set(n, createIntentLatch());
  return NAMED.get(n);
}

/** Test teardown: drop every hold and retry key of every latch. Returns how
 *  many holds were live (the harness can name a test that left one). */
function resetAllIntentLatches() {
  let live = 0;
  for (const l of REGISTRY) { live += l.size(); l.reset(); }
  return live;
}

if (typeof window !== 'undefined') {
  window.HearthriseIntentLatch = {
    IN_FLIGHT, DEFAULT_HOLD_MS, MIN_HOLD_MS, isInFlightAnswer, isAmbiguousAnswer, createIntentLatch,
    namedLatch,
    /* A lock that is not a latch (a row boolean) joins the teardown: {size, reset}. */
    register(lock) { if (lock && typeof lock.size === 'function' && typeof lock.reset === 'function') REGISTRY.add(lock); },
    /* Test teardown only (smoke-test.js, after EVERY test). */
    __resetAll: resetAllIntentLatches,
  };
}
