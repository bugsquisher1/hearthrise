// ============================================================================
// src/net/accrue.js — THE CLIENT HALF OF SERVER-AUTHORITATIVE AWAY TIME (b337).
//
// Roadmap item 2 of the server-authority program, scoped to ONE vertical slice:
// away-time accrual. On return from an absence the client ASKS THE SERVER what
// it earned and renders the answer. It computes nothing.
//
// ── THE ONE PROPERTY THIS FILE EXISTS TO HOLD ───────────────────────────────
// **THERE IS NO FALLBACK TO LOCAL COMPUTATION. NONE.** A silent fallback is the
// single most dangerous thing that could be built here, because it looks exactly
// like success while the client quietly keeps authoring its own progression —
// and it would be discovered only by an economy that no longer balances. So:
//
//   • when the switch is OFF, this module is not consulted at all and
//     legacy.js's processOffline() behaves EXACTLY as it did in b336;
//   • when the switch is ON, processOffline() returns before it computes
//     anything, unconditionally — including when the server is unreachable,
//     rate-limited, 500ing, or says the character does not exist. The absence
//     is simply not credited, and the player is TOLD.
//
// That is deliberately the harsher of the two behaviours. "Credited nothing and
// said so" is recoverable; "credited a number this device invented" is not.
//
// ── THE CONTRACT, AS FOUND (not as guessed) ─────────────────────────────────
// Source: supabase/functions/hr-accrue/index.ts + request.js + accrual.js, and
// the envelope built by hr_state_of in
// supabase/migrations/2026-08-11-apply-engine.sql:205-259.
//
//   REQUEST   POST <SUPABASE_URL>/functions/v1/hr-accrue
//             Authorization: Bearer <user JWT>      (verified in-function
//                                                    against the project JWKS)
//             apikey: <anon key>                    (the gateway wants one)
//             Content-Type: application/json
//             body {"slot": N}                      — request.js reads NOTHING
//                                                     else, ever; `slot` is
//                                                     coerced to an integer in
//                                                     [0, MAX_SLOT=5].
//
//   RESPONSE  200 {ok:true, accrued:true,  ...envelope, levels, away:{…}}
//             200 {ok:true, accrued:false, reason, version, now}
//             200 {ok:true, accrued:false, reason:'replayed'|'clamped', …}
//             401 {ok:false, error:'not_signed_in'}
//             409 {ok:false, error:'no_character'}         (empty slot)
//             409 {ok:false, error:<hr_apply code>, detail}
//             429 {ok:false, error:'rate_limited'}
//             503 {ok:false, error:'engine_unconfigured'|'auth_unavailable'}
//             500 {ok:false, error:'server_error'}
//             GET  200 {ok:true, fn:'hr-accrue', payload_sha256}  — health only
//
//   ENVELOPE  {version, now, state:{slot,gold,gems,hearth_tokens,hp,max_hp,
//             bank_cap,active_kind,active_id,active_since,accrued_to},
//             skills:{<id>:{xp,level}}, inventory:{<id>:qty},
//             equipment:{<slot>:<item>}, farm:[…], progress:[…],
//             progress_truncated, total_level}
//
//   away:     {grantMs, capped, tickMs, kills, crits, died, blessed,
//              buffsPaused, featuredMs, featuredDropMult, gold, xp, items,
//              levelUps, events}   — the receipt, STATED by the simulation so
//              no renderer can invent a bonus that was not applied.
//
// ── WHAT ACTUALLY GATES THIS (b339 — the previous paragraph was FALSE) ──────
// This block used to say: "the DEPLOYED function has no CORS headers, so a
// browser preflight fails and every call here lands on `unreachable`." That was
// true when it was written and is NOT true now. Verified against production:
// a preflight from hearthrise.net returns 204 with the right
// `Access-Control-Allow-Origin`, a POST reaches the function's own body (it
// answers `not_signed_in`), and the deployed `payload_sha256` equals
// `node tools/pack-edge.mjs hr-accrue --hash`.
//
// ⚠ b353 — THE SAFETY ARGUMENT ABOVE HAS EXPIRED, BY DESIGN. Everything below
// used to read "this is dark; the switch defaults off". It does not any more:
// the switch DEFAULTS ON (see ACCRUE_KILL_KEY), which is the switch-on. There
// is no dark path left to reason about, and the only remaining gate is the one
// that was always real — a deployed function, applied migrations, and a signed-
// in player. The `2026-08-14-character-bootstrap.sql` gate named below is
// APPLIED and is therefore no longer a gate either.
//
// A stale safety argument is worse than no safety argument: it is believed —
// and unlike a stale assertion, no test can catch a stale sentence. What IS
// asserted, because it is behaviour: the switch defaults ON (B353-1), only the
// literal string `'off'` disables it (B353-1), and a pre-b338 server is refused
// rather than latched (B339-6).
// `tests/cors-preflight.mjs` C4 remains the live gate for the transport.
//
// ── WHY A KILL SWITCH AT ALL, NOW THAT IT DEFAULTS ON ──────────────────────
// Same shape as sync.js's event-log switch, and now the same polarity: a
// localStorage key plus a config override, readable and writable at runtime, so
// ONE player can be dropped back to the pre-cutover client during an incident
// without a redeploy. It shipped defaulting OFF while it was arming a new
// authority; it defaults ON now that it IS the authority.
//
// DOM-free except for one honesty sheet at the bottom, which is guarded on
// `typeof document` and is the ONLY thing in this file that touches the page.
// ============================================================================

/* ── The kill switch ────────────────────────────────────────────────────────
   ⚠ b353 — THE POLARITY IS INVERTED, AND THAT IS THE SWITCH-ON.

   It shipped as `'on' enables; anything else — including absent — is OFF`,
   which was right for arming a new authority on one tester's device without a
   redeploy. It is exactly wrong once the authority IS the game: with that
   polarity, "the flag failed to be written" and "the client owns the economy"
   are the same state, and every player who has never touched devtools is in it.

   So it is now b319's shape, for b319's reason: **the literal string 'off'
   disables; anything else — including absent, including a typo — is ON.** A
   corrupted or unreadable value now falls to the SERVER, not to the client, and
   the one value that can hand authority back is a value somebody had to type.

   Every consumer reads THIS function — `isActivityIntentEnabled`,
   `isGoldIntentEnabled`, `isCharacterIntentEnabled`, `isRecordActive`,
   `serverMarketActive` (through the gold one) and legacy.js's
   `serverAccrualActive` are all one-line delegations, so the polarity lives at
   one definition and cannot be half-flipped. B353-1 asserts that. */
export const ACCRUE_KILL_KEY = 'hr:serverAccrual';
/** The ONE value that turns it off. Exported so a test names the same string
 *  the implementation does rather than restating it. */
export const ACCRUE_OFF_VALUE = 'off';

let config = null;          // {url, apiKey, authToken, slot}
let override = null;        // in-memory switch state; null = consult storage

export function isServerAccrualEnabled() {
  if (override !== null) return override;
  /* THE CATCH FLIPPED WITH THE POLARITY, DELIBERATELY. It used to answer
     `false` when localStorage throws (Safari private mode, a locked-down
     embed) — fail-closed when "closed" meant "do not arm the new thing".
     "Closed" now means the SERVER owns the economy, so an unreadable storage
     must not be a way to become client-authoritative. */
  try { return localStorage.getItem(ACCRUE_KILL_KEY) !== ACCRUE_OFF_VALUE; } catch (e) { return true; }
}

/* ── THE WATERMARKS, AND WHY FLIPPING THE SWITCH MUST MOVE THEM (b339) ──────
   The server path deliberately never advances `G.offlineBudget.at` or
   `G.restedAt`. That is correct while the switch is ON — the server owns the
   accrued_to watermark, and having the client advance a watermark it does not
   own is how a real absence gets confiscated.

   But it makes the switch NOT SAFELY REVERSIBLE, which is the property it was
   sold on. Flip ON at t1, play for an hour, flip OFF at t2: the local watermark
   is still whatever it was before t1, so the first processOffline() after t2
   measures the whole span [t1, t2] — a span the SERVER has already been paying
   for — and pays it AGAIN, locally, capped only by offlineCapHours. A kill
   switch whose "off" position mints progress is not a kill switch.

   So both watermarks are stamped to now on every flip, IN BOTH DIRECTIONS.
   Symmetry is the point: ON hands the span to the server (nothing local may
   later claim it), OFF hands it back (nothing local may claim what the server
   already paid). One side alone leaves the other direction minting.

   THE COST, STATED: an UNCLAIMED local absence at the instant of a flip is
   confiscated. That is real, it is the safe direction, and the flip is a
   console/devtools action taken by a tester — not something a player does
   mid-session. Minting is unrecoverable; a confiscated test absence is not. */
export function stampAwayWatermarks(G, now) {
  if (!G || typeof G !== 'object') return null;
  const t = Number.isFinite(Number(now)) ? Number(now) : nowMs();
  if (!G.offlineBudget || typeof G.offlineBudget !== 'object') G.offlineBudget = {};
  G.offlineBudget.at = t;
  G.restedAt = t;
  return { offlineBudgetAt: t, restedAt: t };
}

/** Flip the switch. Persists, so a reload keeps the tester's choice.
 *
 *  ⚠ b353: ON is now the ABSENCE of the key and OFF is the literal string, which
 *    is the inverse of what this wrote before. Writing `'on'` instead would work
 *    (anything that is not `'off'` is on) and would be wrong: it would leave a
 *    key behind that looks like a decision, so a later reader could not tell a
 *    player who was deliberately armed from one who simply is. Pristine means
 *    pristine, and pristine is ON. */
export function setServerAccrualEnabled(on) {
  const was = isServerAccrualEnabled();
  override = !!on;
  try {
    if (on) localStorage.removeItem(ACCRUE_KILL_KEY);
    else localStorage.setItem(ACCRUE_KILL_KEY, ACCRUE_OFF_VALUE);
  } catch (e) {}
  const now = isServerAccrualEnabled();
  /* Only on an actual CHANGE. Re-asserting the current position (the suite does
     this constantly, and so does a reload) must not keep pushing the watermark
     forward, or a page that calls this on every boot would quietly become a
     permanent "you were never away". */
  if (now !== was) {
    try { stampAwayWatermarks(typeof window !== 'undefined' ? window.G : null, nowMs()); } catch (e) {}
  }
  return now;
}

/** Test seam: forget the in-memory override and go back to reading storage. */
export function __clearAccrualOverride() { override = null; }

/* ── MAY A CLIENT SITE WRITE THIS FIELD? (b347) ─────────────────────────────
   THE ONE IMPLEMENTATION, and it lives here rather than in record.js for the
   reason stripRecordFieldsForOverlay already established: **the switch is read
   from accrue.js and the field list from record.js, so neither module can vouch
   for the other's absence.** A version of this that lived entirely in record.js
   would answer "not moved, go ahead" by simply failing to load — which is the
   exact failure it exists to prevent, silently.

   It is here rather than copied into each caller because two copies of a
   fail-closed guard are two chances to get the closed direction wrong; this
   repo has paid for five copies of one hash and three copies of one renderer.
   legacy.js and auth.js both call THIS.

   FAILS CLOSED: with the switch ON and record.js missing, the answer is NO. The
   cost of a wrong "no" is a stale local number nothing reads for authority; the
   cost of a wrong "yes" is the record acquiring a second source. */
export function mayClientWrite(field, win) {
  if (!isServerAccrualEnabled()) return true;      // switch off → byte-for-byte b346
  const w = win || (typeof window !== 'undefined' ? window : null);
  const R = w && w.HearthriseRecord;
  if (!R || typeof R.clientMayWrite !== 'function') return false;
  try { return R.clientMayWrite(field) !== false; } catch (e) { return false; }
}

/* ── WHICH CHARACTER ARE WE TALKING ABOUT? (b339) ───────────────────────────
   `slot: 0`, hard-coded in auth.js, was wired at sign-in and never revisited —
   while `src/multi-character.js` gives every account up to 5 characters with a
   SELECTED one. So a player on slot 2 ensured and accrued against slot 0: the
   wrong character's away time, and (through applyEnvelope, which replaces G
   wholesale) slot 0's server state landing in slot 2's local save.

   Resolved AT CALL TIME, never captured — the same rule the auth token follows
   and for the same reason. The slot changes while the module stays configured
   (`switchSlot` rewrites the profile and reloads), and a value captured at
   sign-in is a value that is wrong by the time it is used.

   multi-character.js OWNS the answer and publishes it (`HearthriseProfile
   .activeSlot()`); this file does not parse the profile record or name its
   storage key, because a second reader of that record is a second thing to
   drift. If the profile module has not loaded, the fallback is 0 — which is
   exactly, and only, today's behaviour. */
export const MAX_SLOT = 5;

/* STRICT — no string coercion. The slot ends up in a request body the server
   re-validates, and a client that can send '2' is a client that can send
   something else; failing to the fallback is both safer and easier to see. */
export function clampSlot(v, fallback) {
  if (Number.isInteger(v) && v >= 0 && v <= MAX_SLOT) return v;
  if (Number.isInteger(fallback) && fallback >= 0 && fallback <= MAX_SLOT) return fallback;
  return 0;
}

export function resolveActiveSlot(pinned) {
  /* An explicitly pinned integer wins — that is the seam the suite drives, and
     the one a future "accrue for a specific slot" caller would use. */
  if (Number.isInteger(pinned)) return clampSlot(pinned, 0);
  try {
    const P = (typeof window !== 'undefined') && window.HearthriseProfile;
    if (P && typeof P.activeSlot === 'function') return clampSlot(P.activeSlot(), 0);
  } catch (e) {}
  return 0;
}

/**
 * Wire the endpoint. Called from auth.js's enableLiveSync() with the same
 * credentials sync.js gets, so there is ONE source of the url/key/token and no
 * second copy to drift.
 *
 * `slot` is OPTIONAL and means "pin to this slot". Absent — which is what
 * auth.js passes — the active slot is resolved live on every call.
 */
export function configureAccrual(cfg) {
  if (!cfg || !cfg.url) { config = null; return null; }
  config = {
    url: String(cfg.url).replace(/\/+$/, ''),
    apiKey: cfg.apiKey || '',
    authToken: cfg.authToken || null,
    slot: Number.isInteger(cfg.slot) ? cfg.slot : null,
  };
  return getAccrualConfig();
}

export function getAccrualConfig() {
  if (!config) return null;
  return { url: config.url, slot: resolveActiveSlot(config.slot), pinnedSlot: config.slot,
    endpoint: accrueEndpoint(config.url) };
}

/** The URL, derived once from the project URL. Never hand-copied. */
export function accrueEndpoint(base) {
  return String(base || '').replace(/\/+$/, '') + '/functions/v1/hr-accrue';
}

function tokenOf() {
  if (!config || !config.authToken) return null;
  try { return typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { return null; }
}

/* ── THE REQUEST, AS DATA ───────────────────────────────────────────────────
   PURE, and exported, so a test can assert the LITERAL bytes that go on the
   wire — method, headers, body — rather than asserting that some code exists
   which might build them. Twelve times this codebase has shipped an assertion
   that asserted nothing; a network test that cannot observe a request is the
   thirteenth waiting to happen. */
export function buildAccrueRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  /* The body is CONSTRUCTED, never a filtered copy of anything — the mirror of
     request.js's null-prototype rule on the server side. One integer. */
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= 5 ? o.slot : 0;
  return {
    url: accrueEndpoint(o.url),
    init: { method: 'POST', headers, body: JSON.stringify({ slot }) },
  };
}

/* ── THE ANSWER, AS A VERDICT ───────────────────────────────────────────────
   PURE. One outcome carries a grant — 'accrued' — and it is the only one this
   whole module can produce that changes a game value. Everything else changes
   nothing, by construction rather than by discipline. */
export const ACCRUE_OUTCOMES = [
  'accrued',        // the server paid, and the envelope is the new truth
  'nothing',        // the server answered, and there was nothing to pay
  'no-character',   // 409 — there is no character in this slot on the server
  'rate-limited',   // 429
  'not-signed-in',  // 401 — b331's business, not ours
  'unavailable',    // 500/503 — the engine is up but cannot answer
  'rejected',       // 409 with an hr_apply code — an incident, recorded server-side
  'malformed',      // a 200 we cannot trust: no envelope, no away receipt
  'unreachable',    // the request never got an answer (CORS, DNS, offline)
  'unconfigured',   // no endpoint / no token on this device
];

/** Does this envelope carry enough to BE the truth? Fail closed. */
export function isEnvelopeApplicable(res) {
  if (!res || res.ok !== true || res.accrued !== true) return false;
  if (!res.state || typeof res.state !== 'object') return false;
  if (!res.skills || typeof res.skills !== 'object') return false;
  if (!res.inventory || typeof res.inventory !== 'object') return false;
  if (!res.away || typeof res.away !== 'object') return false;
  if (!Number.isFinite(Number(res.version))) return false;
  return true;
}

export function classifyAccrueResponse(status, body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (status === 200) {
    if (!b || b.ok !== true) return { outcome: 'malformed', body: b };
    if (b.accrued === true) {
      return isEnvelopeApplicable(b)
        ? { outcome: 'accrued', body: b }
        : { outcome: 'malformed', body: b, reason: 'envelope_incomplete' };
    }
    /* accrued:false is the server saying "nothing to pay" — including the
       `replayed` and `clamped` receipts, both of which deliberately carry NO
       away block because this invocation's delta was not applied. */
    return { outcome: 'nothing', body: b, reason: b.reason || 'none' };
  }
  if (status === 401 || status === 403) return { outcome: 'not-signed-in', body: b };
  if (status === 429) return { outcome: 'rate-limited', body: b };
  if (status === 409) {
    const err = b && b.error;
    return err === 'no_character'
      ? { outcome: 'no-character', body: b }
      : { outcome: 'rejected', body: b, reason: err || 'apply_failed' };
  }
  if (status >= 500) return { outcome: 'unavailable', body: b, reason: (b && b.error) || 'server_error' };
  return { outcome: 'malformed', body: b, reason: 'http_' + status };
}

/* ── THE BREAKER (b331's posture, applied to a second endpoint) ─────────────
   sync.js's b331 block is the reference: never an unbounded loop against an
   endpoint that cannot answer, back off, and then TERMINATE into a state the
   player is told about exactly once. The difference in kind is that b331's
   terminal state stops WRITES; this one stops nothing, because nothing was ever
   being granted — it exists to stop the pretending. */
export const ACCRUE_BACKOFF_BASE_MS = 5000;
export const ACCRUE_BACKOFF_MAX_MS = 300000;
export const ACCRUE_HALT_AFTER_TRIES = 3;

/** Outcomes that mean "the server did not tell us what we earned". Pure. */
export function isAccrualFailure(outcome) {
  return outcome !== 'accrued' && outcome !== 'nothing';
}

export function newAccrualGate() {
  return { streak: 0, firstAt: 0, blockedUntil: 0, halted: false, lastOutcome: null, lastAt: 0, lastReason: null };
}

export function nextAccrualBackoffMs(streak) {
  const s = Math.max(1, Math.floor(Number(streak) || 1));
  return Math.min(ACCRUE_BACKOFF_MAX_MS, ACCRUE_BACKOFF_BASE_MS * Math.pow(2, Math.min(s, 20) - 1));
}

/** May we put an accrual request on the wire right now? Pure. */
export function decideAccrualGate(st, now) {
  if (!st) return { allow: true, reason: 'no-state' };
  if (st.blockedUntil > now) return { allow: false, reason: 'backoff' };
  return { allow: true, reason: 'ok' };
}

/**
 * The reducer. A success resets everything INCLUDING the halt — a server that
 * came back is a server that came back, and leaving the sheet's latch set would
 * mean a recovered player is told they are broken forever.
 *
 * 'rate-limited' backs off but does NOT count toward the halt: the server
 * working correctly and telling us to slow down is not an outage, and treating
 * it as one would put a scary sheet in front of a player whose only sin was
 * reloading four times.
 *
 * ⚠ b353 — 'unconfigured' JOINS IT, AND THE FLIP IS WHAT MADE THAT URGENT.
 *   `unconfigured` means this module has no endpoint or no token — i.e. nobody
 *   is signed in yet. It is not a server condition at all, and there is nothing
 *   for a player to retry. While the switch defaulted OFF it was unreachable in
 *   practice (a device that had armed the switch had also signed in). With the
 *   switch defaulting ON, EVERY signed-out boot walked straight into three
 *   `unconfigured` settles and a modal reading "This device is not wired to the
 *   progress server. Nothing has been credited for your time away" — over the
 *   account gate, which already owns that conversation, and covering the bottom
 *   of the screen (measured: it hid the shop's buy control and the arena's
 *   Recommended card in the suite).
 *
 *   Same rule as rate-limited, for a stronger reason: it backs off, it is
 *   recorded, and it never escalates. B353-4 is the regression.
 */
export function accrualGateStep(st, outcome, now, reason) {
  const s = st || newAccrualGate();
  if (!isAccrualFailure(outcome)) {
    return { ...newAccrualGate(), lastOutcome: outcome, lastAt: now, lastReason: reason || null };
  }
  const counts = outcome !== 'rate-limited' && outcome !== 'unconfigured';
  const streak = (s.streak || 0) + (counts ? 1 : 0);
  const firstAt = s.firstAt || now;
  const halted = !!s.halted || (counts && streak >= ACCRUE_HALT_AFTER_TRIES);
  return {
    streak, firstAt, halted,
    blockedUntil: now + nextAccrualBackoffMs((s.streak || 0) + 1),
    lastOutcome: outcome, lastAt: now, lastReason: reason || null,
  };
}

let gate = newAccrualGate();
let inFlight = null;
let haltAnnounced = false;

export function getAccrualState() {
  const now = nowMs();
  return {
    enabled: isServerAccrualEnabled(),
    configured: !!config,
    pending: !!inFlight,
    ...gate,
    ...decideAccrualGate(gate, now),
  };
}

export function resetAccrualGate(seed) {
  gate = seed ? { ...newAccrualGate(), ...seed } : newAccrualGate();
  haltAnnounced = false;
  return gate;
}

/* NO FETCH SEAM ON PURPOSE. The b331 battery swaps `window.fetch` itself and
   asserts on what actually went out; a private injection point would be one
   more thing that can be correct while the real call site is not. `fetch` is
   resolved at call time, so a test's override is the transport. */
function nowMs() { return Date.now(); }

/* Hooks the game layer wires. Kept as config rather than imports so this module
   stays DOM-free and Node-importable. */
let hooks = { onApplied: null, onOutcome: null, onHalt: null };
export function setAccrualHooks(h) { hooks = { ...hooks, ...(h || {}) }; }
function fire(name, arg) {
  const fn = hooks && hooks[name];
  if (typeof fn !== 'function') return;
  try { fn(arg); } catch (e) { console.warn('[accrue] hook ' + name + ' threw:', e && e.message); }
}

/**
 * ASK THE SERVER. Returns a verdict; NEVER a number this device computed.
 *
 * One request in flight at a time — two concurrent accruals would both be
 * answered correctly by the server's derived idempotency key, but they would
 * cost two rate-gate spends for one absence and the second would come back
 * `replayed`, which reads as "nothing to pay" and would confuse the receipt.
 */
export async function requestAccrual(opts) {
  const o = opts || {};
  if (inFlight) return inFlight;
  const now = nowMs();

  if (!config) return settle({ outcome: 'unconfigured', reason: 'no_endpoint' }, now);
  const token = tokenOf();
  if (!token) return settle({ outcome: 'unconfigured', reason: 'no_token' }, now);
  if (!o.force && !decideAccrualGate(gate, now).allow) {
    return { outcome: gate.lastOutcome || 'unreachable', throttled: true, applied: false };
  }

  const slot = resolveActiveSlot(Number.isInteger(o.slot) ? o.slot : config.slot);
  const { url, init } = buildAccrueRequest({ url: config.url, apiKey: config.apiKey, token, slot });

  inFlight = (async () => {
    let res = null;
    try {
      res = await fetch(url, init);
    } catch (e) {
      /* A CORS preflight failure, a DNS failure and a dead network are
         indistinguishable here BY DESIGN of the fetch spec. All three mean the
         same thing to us: we were not told what the player earned. */
      return settle({ outcome: 'unreachable', reason: String((e && e.message) || e) }, nowMs());
    }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return settle({ ...classifyAccrueResponse(res.status, body), status: res.status }, nowMs());
  })();

  try { return await inFlight; } finally { inFlight = null; }
}

/** The ONE place an outcome becomes state. Everything funnels here. */
function settle(verdict, now) {
  const wasHalted = gate.halted;
  /* PHASE 1: the cadence watermark follows EVERY answered accrual, not just the
     ones the timer started. A cold-load accrual, a retry from the halted sheet
     and an intent settle all close the same server span, so the interval must
     restart from here or the loop would immediately re-settle a span of
     milliseconds and earn a `below_min_span`. Guarded: this runs before
     `settleState` exists on no path, but the try costs nothing and a throw in
     the bookkeeping must never lose a grant. */
  try { if (settleState) settleState.lastSettleAt = now; } catch (e) {}
  gate = accrualGateStep(gate, verdict.outcome, now, verdict.reason);
  let applied = false;
  if (verdict.outcome === 'accrued') {
    fire('onApplied', verdict.body);
    applied = true;
  }
  fire('onOutcome', { outcome: verdict.outcome, reason: verdict.reason || null, status: verdict.status || 0 });
  /* ── b368: A RECOVERED SERVER TAKES ITS OWN SHEET DOWN ────────────────────
     The halted sheet used to be removable by exactly one actor: the player.
     Nothing else ever called `hideAccrualHaltedSheet`, so the sheet outlived
     the condition it reported for as long as the document did — and on a phone
     a document lives for DAYS. Tyler's report is that exact shape: yesterday a
     server-side `unknown_skill` put his phone in the halted state, the server
     was fixed, and this morning the app came back to the foreground still
     wearing "the progress server refused the result" — a sentence that had
     stopped being true overnight. His manual Try Again succeeded first go,
     which is the proof: the accrual was fine, the SHEET was stale.
     A statement about the server's health must be retracted by the server's
     health, not only by the player tapping Not now. */
  if (!isAccrualFailure(verdict.outcome)) hideAccrualHaltedSheet();
  if (gate.halted && !wasHalted && !haltAnnounced) {
    haltAnnounced = true;
    console.warn('[accrue] the server has not answered ' + gate.streak
      + ' times (' + verdict.outcome + ') — away time is NOT being credited, and this device will not guess.');
    fire('onHalt', { outcome: verdict.outcome, reason: verdict.reason || null, streak: gate.streak });
    showAccrualHaltedSheet(verdict.outcome);
  }
  if (!gate.halted) haltAnnounced = false;
  return { ...verdict, applied };
}

/* ── APPLYING THE SERVER'S ANSWER ───────────────────────────────────────────
   The envelope IS the truth. This is a whole-value replacement, not a merge:
   merging would mean the client's copy of a number survives contact with the
   server's, which is the exact property server authority removes. It runs ONLY
   on `accrued:true` with a complete envelope (isEnvelopeApplicable), so a
   half-parsed 200 can never blank a save.

   Pure in the sense that matters: it takes the target object explicitly and
   returns what it wrote, so the suite can drive it without a live G. */
/* ── THE REPLACEMENT IS DESTRUCTIVE, AND IT MUST BE SAID OUT LOUD (b339) ────
   `applyEnvelope` rebuilds `G.skills` and `G.inventory` from the envelope
   ALONE. `saveLocal()` then stamps `lastSeen`, and "newest wins" makes that the
   authoritative save — cloud included. The server character is DELIBERATELY
   fresh (`hr_create_character` never reads `game_saves.snapshot`; see the
   migration header for why importing a client-authored blob would launder the
   exploit the whole program exists to close). So the first successful accrual
   on a device holding real beta progress REPLACES IT WITH A STARTING KIT,
   permanently.

   THAT IS THE DESIGNED BEHAVIOUR AND IT IS NOT CHANGED HERE. A merge would put
   the client's numbers back in charge, which is the one thing server authority
   removes. The beta is being wiped at cutover, so the loss is already sunk.

   What is NOT acceptable is that it happens SILENTLY. So the first replacement
   that would actually destroy something asks, once, in words that name the
   consequence. Everything after the acknowledgement is silent, because by then
   the player has been told.

   Reachability, stated honestly: today this cannot fire, because accrual.js
   refuses any `activeKind !== 'combat'` and a fresh character is idle. That is
   an argument for building the confirmation NOW, while it costs nothing, not
   for leaving it out. */
export const ACCRUE_REPLACE_ACK_KEY = 'hr:serverAccrual:replaceAck';
export const ACCRUE_REPLACE_SHEET_ID = 'hr-accrual-replace-gate';

/**
 * b366 — is the cloud reconcile (pull → decideRestore) still unresolved? That is
 * exactly what sync.js's b314 snapshot hold means, so this asks it rather than
 * inventing a second notion of "not settled" that could disagree with the first.
 * Unknown/unwired → false: the deferral must never become a way for the envelope
 * to stop applying on a device where sync is not running at all.
 */
export function isReconcilePending() {
  try {
    const S = (typeof window !== 'undefined') ? window.HearthriseSync : null;
    return !!(S && typeof S.isSnapshotHeld === 'function' && S.isSnapshotHeld());
  } catch (e) { return false; }
}

export function isReplacementAcknowledged() {
  try { return localStorage.getItem(ACCRUE_REPLACE_ACK_KEY) === 'yes'; } catch (e) { return false; }
}

export function acknowledgeReplacement(on) {
  try {
    if (on === false) localStorage.removeItem(ACCRUE_REPLACE_ACK_KEY);
    else localStorage.setItem(ACCRUE_REPLACE_ACK_KEY, 'yes');
  } catch (e) {}
  return isReplacementAcknowledged();
}

/**
 * WHAT WOULD BE LOST. Pure, and it measures the ENVELOPE against the LOCAL save
 * rather than asking "does this save look big" — the question is not whether
 * the player has progress, it is whether this specific write would take any of
 * it away. A brand-new device (nothing local) is therefore not destructive and
 * never sees a sheet.
 */
export function describeReplacement(G, res) {
  const empty = { destructive: false, gold: 0, skillXp: 0, items: 0, skills: [] };
  if (!G || typeof G !== 'object' || !res || typeof res !== 'object') return empty;
  const st = res.state || {};
  const srvGold = Number(st.gold);
  /* ⚠ AN UNKNOWN LOCAL BALANCE IS NOT A LOSS OF ZERO — IT IS NO LOSS AT ALL,
     and the distinction is worth stating because the arithmetic happens to be
     the same and the REASON is not. This function asks "would applying the
     envelope take anything away from what is here". If `gold` is absent (the
     post-flip state between a load and the first envelope) there is nothing
     here to take, so the answer is genuinely zero rather than accidentally so.
     Deliberately NOT routed through the balance accessor: this module is
     imported BY record.js's dependency chain and must not depend back on it,
     and the local read here is a comparison against a save, not a display. */
  const localGold = Number(G.gold);
  const gold = (Number.isFinite(srvGold) && Number.isFinite(localGold))
    ? Math.max(0, localGold - srvGold) : 0;

  let skillXp = 0;
  const skills = [];
  const srvSkills = (res.skills && typeof res.skills === 'object') ? res.skills : {};
  const locSkills = (G.skills && typeof G.skills === 'object') ? G.skills : {};
  for (const k of Object.keys(locSkills)) {
    const have = Number(locSkills[k]) || 0;
    const get = Number(srvSkills[k] && srvSkills[k].xp) || 0;
    if (have > get) { skillXp += have - get; skills.push(k); }
  }

  let items = 0;
  const srvInv = (res.inventory && typeof res.inventory === 'object') ? res.inventory : {};
  const locInv = (G.inventory && typeof G.inventory === 'object') ? G.inventory : {};
  for (const k of Object.keys(locInv)) {
    /* ONLY a SERVER-OWNED id can be LOST to the envelope. An un-modeled id the
       envelope omits (a cooked food, a crop, a dungeon reward, a companion-proc
       bonus) is PRESERVED by the absolute carve-out above, so counting it as a
       loss would make the drift detector fire destructive on every settle for a
       player who has cooked a meal — a false alarm that would put the b366
       first-contact consent modal in front of them. See item-authority.js. */
    if (!serverOwnedItem(k)) continue;
    const have = Number(locInv[k]) || 0;
    const get = Number(srvInv[k]) || 0;
    if (have > get) items += have - get;
  }

  return { destructive: gold > 0 || skillXp > 0 || items > 0, gold, skillXp, items, skills };
}

/* ── "THE ENVELOPE IS THE TRUTH", WRITTEN ONCE (b347) ───────────────────────
   Split out of applyEnvelope because the activity intent (src/net/activity.js)
   applies the SAME envelope from a different verb, and the spec's instruction
   for its receipt is "route it through the SAME renderer the away card uses,
   not through a second one written for this call". A second copy of these
   twenty lines is how the two verbs' idea of "the server's state" drifts apart,
   and this program has already paid for five copies of one hash.
   applyEnvelope's own contract is UNCHANGED — it still gates, still writes the
   away receipt, still stamps `_serverAccrual`. */
/* ── THE PREDICTION SEAM (b354 / F4) ────────────────────────────────────────
   src/net/gold.js keeps a ledger of DISPLAY PREDICTIONS — local gold and gem
   movements whose server counterpart is still in flight — and it re-adds the
   outstanding ones on top of every arriving envelope, because an envelope
   produced before a gesture existed cannot describe it.

   That is only sound if EVERY envelope application goes through the same
   accounting. Two did not: `applyEnvelope` (the away grant) and
   `applyIntentEnvelope` (the activity switch collect) both write `G.gold`
   absolutely through this function and neither has ever heard of a prediction.
   An outstanding entry therefore survived their envelope untouched and was
   re-added on top of the NEXT gold envelope — the same permanent additive
   offset Security found in the unanswered-call path, reached from a module
   that does not import gold.js and never will.

   So the accounting is registered INTO the shared writer rather than copied
   into three callers. Direction matters: gold.js imports this file, so this
   file must not import gold.js — it holds a slot, and gold.js fills it at load.
   Unregistered (Node, a boot before gold.js) it is a no-op, which is exactly
   right: with no ledger there is nothing to reconcile. */
let predictionSeam = null;
export function registerPredictionSeam(fn) {
  predictionSeam = (typeof fn === 'function') ? fn : null;
  return predictionSeam;
}
export function getPredictionSeam() { return predictionSeam; }

/**
 * @param ownKey the intent key of the call this envelope answers, when there is
 *        one. Absent from the away and activity paths, which own no gold
 *        gesture — they still sweep, they just retire nothing.
 */
/** How many copies of `id` a slot map is wearing. Pure; ignores slot names. */
export function equippedCount(equipment, id) {
  if (!equipment || typeof equipment !== 'object' || !id) return 0;
  let n = 0;
  for (const slot of Object.keys(equipment)) if (equipment[slot] === id) n++;
  return n;
}

/**
 * b362 — copies worn on THIS client that the server's inventory figure has not
 * been told about. Pure. See the block in applyEnvelopeState for the proof.
 */
/* ⏳ RETIREMENT (live-settlement.md §8). This discount exists ONLY because no
   equip intent tells the server about a client equip, so the server's inventory
   figure is a stale view that still counts the worn copy. It retires on
   WHICHEVER COMES FIRST:
     • the equip intent landing (the server then knows, and its figure is
       already correct — the discount would become a double subtraction), or
     • the Phase 2 flip, when `applyEnvelopeState` reverts to absolute
       replacement and the client holds no rival copy to reconcile.
   It is NOT retired by Phase 1. Do not delete it alongside the max-merge
   without checking which of the two conditions actually fired — they are
   different dates and the b362 dupe comes straight back if this goes early.

   ✅ b366 — BOTH CONDITIONS FIRED, AND IT IS NO LONGER ON THE LIVE PATH. The
      equip verb landed AND the flip landed, in one commit, so the absolute
      branch in `applyEnvelopeState` never calls this: under absolute the
      server's figure already excludes the worn copy, and subtracting it again
      would DELETE a bag copy the player owns. It survives here, unchanged and
      still tested, solely to serve the merge branch the `hr:envelopeMerge`
      kill switch restores — deleting it would make the incident lever a
      REGRESSION lever. Delete it when the switch goes. */
export function unaccountedEquipped(G, res, id) {
  const local = equippedCount(G && G.equipment, id);
  if (!local) return 0;
  const server = equippedCount(res && res.equipment, id);
  return Math.max(0, local - server);
}

/**
 * b364 / live-settlement.md §5.2 — WHICH ITEM IDS DID THE SERVER *SPEND*?
 *
 * The away receipt (`res.away.items`) is the SIGNED delta the server actually
 * applied: positive for a drop it rolled, NEGATIVE for a unit it consumed
 * (auto-eat food today; artisan inputs and ammunition as those land). It is
 * produced by `accrual.js`'s item block — the same map the gains ride in,
 * because `hr_apply`'s item op is signed and re-checks `have + delta >= 0`
 * under the row lock.
 *
 * This is a POSITIVE STATEMENT by the server, which is what makes it usable
 * where an omission is not: b359's rule is "absent means unknown", and a key
 * named here is the opposite of absent.
 *
 * Pure. Returns a Set of ids, never null.
 */
export function consumedKeysOf(res) {
  const out = new Set();
  const items = res && res.away && res.away.items;
  if (!items || typeof items !== 'object') return out;
  for (const k of Object.keys(items)) {
    const n = Number(items[k]);
    if (Number.isFinite(n) && n < 0) out.add(k);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   PHASE 2 (b366) — THE FLIP TO ABSOLUTE. live-settlement.md §5.3, §8.

   THE PRECONDITION THAT WAS MISSING UNTIL NOW, and it is the whole reason this
   is a flag and not a rewrite: `hr_apply` owned equipment all along, but NO
   VERB COULD REACH IT. There was no equip intent anywhere in src/net, so the
   server's `player_inventory` row was a stale view that still counted the copy
   the player was wearing. Under ABSOLUTE that stale figure would be written
   straight into the bag — the b362 dupe, no longer merged in but ASSIGNED in.
   b366 ships the verb (supabase/functions/hr-accrue/equip.js), the server's
   figure becomes correct, and only then may the envelope be believed outright.

   ⚠ THE ORDER IS LOAD-BEARING AND IT IS NOT REVERSIBLE BY A REDEPLOY: the equip
     verb must be DEPLOYED before this constant is armed. Armed against an Edge
     payload with no equip verb, every equip a player performs is invisible to
     the server and the next settle assigns the worn copy back into the bag —
     which is the same dupe, running 320 times a day instead of once per
     gesture.

   THE KILL SWITCH IS AN OPT-BACK-IN, NOT AN OPT-OUT, because that is the shape
   that works in an incident: `localStorage['hr:envelopeMerge'] = 'on'` restores
   b359 merge semantics for ONE device, immediately, with no deploy. It is the
   `ACCRUE_KILL_KEY` pattern and it exists for the same reason.

   AN OLD CLIENT IS NOT AFFECTED AT ALL. This is client code: a player on a
   stale build runs their own copy of the merge and keeps merge semantics until
   they load the new one. There is no server flag to get wrong. */
export const ENVELOPE_MERGE_KEY = 'hr:envelopeMerge';

/* ── THE ARMING CONDITION IS A REGISTRATION, NOT A DATE ─────────────────────
   ⚠ THE MOST DANGEROUS THING IN THIS FILE, so it is a mechanism rather than a
     note. ABSOLUTE is only sound while the server actually knows about every
     equipment move. If the envelope is believed outright on a client whose
     equip gestures are still local, the server's `player_inventory` row still
     counts the worn copy and the settle ASSIGNS it back into the bag — the b362
     dupe, running 320 times a day instead of once per gesture. That is worse
     than the merge this replaces.

   "Remember to arm this after the equip gesture is wired" is exactly the shape
   of instruction this repo has been burned by. So the flip arms ITSELF, off the
   only fact that matters: has an equip TRANSPORT been registered on this
   client? `src/net/equip.js` calls `markEquipAuthorityLive()` when it is
   configured with a real endpoint, and the gesture wiring in the game loop is
   what causes that module to load. Until then every envelope keeps b359 merge
   semantics — the live beta stays exactly as green as it is today — and the
   flip lands the moment the last piece does, with no second deploy decision and
   nothing to forget.

   A player on a STALE BUILD is unaffected in either direction: this is client
   code and they run their own copy. */
let equipAuthorityLive = false;

/** Declare that this client sends equip INTENTS. Called by src/net/equip.js. */
export function markEquipAuthorityLive(v) {
  equipAuthorityLive = v !== false;
  return equipAuthorityLive;
}
export function isEquipAuthorityLive() { return equipAuthorityLive; }

/* ── INVENTORY AUTHORITY IS ITS OWN FLAG (P1 mitigation, 2026-08-17) ─────────
   THE BUG THIS DECOUPLES. `isEnvelopeAbsolute()` was armed by EQUIP authority
   (markEquipAuthorityLive, live today). But the general inventory bag is NOT
   yet server-owned: LIVE play still crafts and drops on the client, and the
   server settles craft chains out of order against an INCOMPLETE
   `player_inventory` (materials from a not-yet-settled prior chain are invisible
   to it). Under the absolute inventory branch below that stale, incomplete
   figure is ASSIGNED wholesale — so a freshly crafted signet the server's
   baseline cannot yet produce is DELETED. That deletion is irreversible.

   Equip authority being live says nothing about whether the *bag* is
   server-authoritative — that coupling is what turns settlement divergence into
   data loss. So inventory gets its OWN authority flag, defaulting OFF, gated on
   an inventory-baseline signal that does not exist yet. Until that signal is
   built and something calls `markInventoryAuthorityLive`, the bag is ALWAYS
   merge — Math.max on named keys, omitted keys survive, the b363
   `unaccountedEquipped` discount stays live. That converts the irreversible
   crafted-item DELETION into the (tolerable, pre-wipe) craft dupe.

   EQUIPMENT AND GOLD ARE UNTOUCHED: gold is still assigned absolutely, skills
   still follow `isEnvelopeAbsolute()`, and the b366 equip-dupe fix is intact —
   equipment stays absolute. Only the general inventory bag reverts to merge. */
let inventoryAuthorityLive = false;

/* ── THE INVENTORY-BASELINE-COMPLETE SIGNAL (inventory-flip Step 3) ──────────
   THE HAZARD THIS CLOSES (accrue.js:832-853, the security review's REAL
   blocker). The absolute-inventory branch believes the envelope's inventory map
   is a COMPLETE statement of the owned set — a named key is the quantity, an
   OMITTED owned key is a real zero. That equivalence only holds if the server's
   `player_inventory` baseline reflects EVERY settled owned mutation with no
   pending, not-yet-settled craft chain. It does not always: the interval loop
   settles the DECLARED pointer, and a chained craft (gather→smelt→forge) settles
   at different boundaries, so a freshly-crafted OWNED signet whose input chain the
   server has not finished settling is INVISIBLE to `hr_state_of`. Under an armed
   absolute replace, that legitimately-earned stack is DELETED — irreversibly.

   The client cannot itself tell "the server has not settled my legit craft yet"
   from "the client forged an item" — only the SERVER knows what it settled. So
   completeness is a SERVER-STATED fact carried on the envelope: `inventory_complete
   === true` means "this baseline reproduces every owned mutation up to the settled
   pointer; no chain is mid-flight". FAIL-CLOSED: anything other than literal true
   (absent, false, truthy-non-true) reads as INCOMPLETE. No server build stamps it
   yet, so it is false everywhere today — which keeps the flip dormant twice over.

   ⏳ SERVER-SIDE SCOPE (condition #1, honestly): the accrual engine
   (supabase/functions/hr-accrue/accrual.js + hr_state_of) must COMPUTE this flag —
   set it true only when the settle loop has fully drained the declared pointer and
   no artisan chain straddles a settle boundary — and stamp it on the envelope. That
   is Edge/SQL work this client change cannot do; it is scoped in the report. Until
   it lands, this client is READY to arm safely but the signal never asserts, so the
   arm gate below refuses. */
let baselineCompleteSeen = false;   // has ANY complete envelope ever been observed?
let lastEnvelopeComplete = false;   // was the most recently observed envelope complete?
let baselineCompleteCount = 0;      // how many complete envelopes observed this session

/** Does THIS envelope carry the server's baseline-complete assertion? Fail-closed:
 *  only a literal `inventory_complete === true` counts. The absolute-inventory
 *  branch consults this PER ENVELOPE, so even an armed client leaves the bag on
 *  merge for any envelope the server has not certified complete — an incomplete
 *  baseline can therefore never delete a legit crafted stack, armed or not. */
export function envelopeBaselineComplete(res) {
  return !!(res && res.inventory_complete === true);
}

/** Record the completeness signal off an arriving envelope. Called by
 *  applyEnvelope (the real path) and applyEnvelopeState, ARMED OR NOT — the
 *  signal is observed in merge mode too, which is exactly the real sequence: the
 *  server starts stamping complete envelopes, a merge-mode client observes them,
 *  and only THEN may a human arm. Returns the current latch. */
export function noteBaselineComplete(res) {
  const complete = envelopeBaselineComplete(res);
  lastEnvelopeComplete = complete;
  if (complete) { baselineCompleteSeen = true; baselineCompleteCount++; }
  return baselineCompleteSeen;
}
export function isBaselineCompleteSeen() { return baselineCompleteSeen; }

/** TEST-ONLY. Clear the session's baseline-complete latch so a test can prove the
 *  arm gate refuses when the signal has NOT been observed. Resetting can only ever
 *  make arming HARDER (it never grants authority), so exposing it is safe. */
export function __resetBaselineComplete() {
  baselineCompleteSeen = false;
  lastEnvelopeComplete = false;
  baselineCompleteCount = 0;
}

/** Declare that the SERVER owns the full inventory bag on this client. THE MANUAL
 *  ARM STEP — nothing auto-calls this; it is taken deliberately, once, after the
 *  restore drill + wipe. Arming (v !== false) enforces two guards and THROWS if
 *  either fails, because a silent-inert arm is exactly the failure mode this
 *  program has been burned by:
 *
 *   (a) DUNGEONS MUST BE LOADED. `serverOwnedItem` classifies an id that is BOTH a
 *       combat drop and dungeon loot (e.g. `magic_essence`) — an OVERLAP id — as
 *       EXCLUDED only once window.DUNGEONS is present; before boot it is
 *       classified OWNABLE, and an armed absolute envelope would DELETE a legit
 *       dungeon copy. So arming asserts DUNGEONS is present and rebuilds the
 *       partition against it (folding the loot tables into the excluded set).
 *   (b) THE BASELINE-COMPLETE SIGNAL MUST HAVE BEEN OBSERVED. If armed while the
 *       server does not stamp `inventory_complete`, an empty-{} envelope would be
 *       indistinguishable from a complete-but-empty baseline and could WIPE the
 *       bag. Requiring at least one observed complete envelope proves the server
 *       IS stamping the signal before authority is handed over.
 *
 *  Disarming (false) is always allowed and never throws — the incident direction
 *  must never be gated. */
export function markInventoryAuthorityLive(v) {
  const on = v !== false;
  if (on) {
    /* (c) NO UN-BACKED OWNABLE MINT MAY REMAIN (worker-settlement slice). The
       absolute replace treats every OWNABLE id as a complete server statement,
       so any OWNABLE id a CLIENT path still mints without a server write would be
       DELETED on the flip. `flipArmBlockers()` is the registry of such lanes
       (src/data/item-authority.js); it MUST be empty before authority moves. It
       held exactly one entry — hired-worker production — until this slice made it
       server-settled and flipped WORKER_PRODUCTION_SERVER_BACKED. Arming while it
       is non-empty is the landmine the whole program exists to avoid. */
    const blockers = flipArmBlockers();
    if (blockers.length) {
      throw new Error('[accrue] refusing to arm inventory authority: '
        + blockers.length + ' un-backed OWNABLE mint lane(s) remain — an absolute envelope would '
        + 'DELETE items a client path still mints without a server write. ' + blockers.join(' | '));
    }
    const D = (typeof globalThis !== 'undefined') ? globalThis.DUNGEONS : null;
    if (!D || typeof D !== 'object') {
      throw new Error('[accrue] refusing to arm inventory authority: window.DUNGEONS is not loaded. '
        + 'Overlap ids (dungeon loot that is also a combat drop) classify OWNABLE before boot, so an '
        + 'absolute envelope could delete a legit dungeon copy. Arm only after the game has booted.');
    }
    rebuildItemAuthority({ dungeons: D });   // fold loot tables into the excluded set
    if (!baselineCompleteSeen) {
      throw new Error('[accrue] refusing to arm inventory authority: no baseline-complete envelope has '
        + 'been observed (server is not stamping inventory_complete). An incomplete baseline could not '
        + 'be told from a truly-empty one, so an empty-{} envelope might wipe the bag. Arm only after '
        + 'the server signal is live and observed.');
    }
  }
  inventoryAuthorityLive = on;
  /* A DELIBERATE DISARM LATCHES FOR THE SESSION. Once anything disarms (an
     operator kill-switch, an incident response), the boot auto-arm must NOT
     silently re-arm on the next envelope — a disarm is a decision, not a
     transient. maybeAutoArm honours this latch; only a manual re-arm (a direct
     markInventoryAuthorityLive(true)) or __resetAutoArm (tests) clears it. */
  if (!on) autoArmDisarmed = true;
  return inventoryAuthorityLive;
}
export function isInventoryAuthorityLive() { return inventoryAuthorityLive; }

/* ── THE BOOT AUTO-ARM (inventory-flip LIVE-ARM wiring, 2026-08-20) ──────────
   THE ONLY THING IN PROD THAT EVER CALLS markInventoryAuthorityLive(true). It is
   called from applyEnvelopeState on EVERY envelope (right after the baseline
   signal is noted) and is a SILENT NO-OP until every guard is met AND the build-
   level enable flag INVENTORY_ARM_ENABLED (src/data/item-authority.js) is true.
   Default: that flag is false, so this never arms — the flip stays dormant.

   Turning it live is a COUPLED TWO-FLAG rollout done in one commit:
     WORKER_PRODUCTION_SERVER_BACKED = true  AND  INVENTORY_ARM_ENABLED = true
   (see the flag's header). The workers-backed half is enforced here anyway:
   flipArmBlockers() is non-empty while workers are un-backed, so even with the
   enable flag alone this refuses.

   PROPERTIES THE SECURITY REVIEW MUST BE ABLE TO TRUST:
     · IMPOSSIBLE TO ARM ACCIDENTALLY — five independent conditions must ALL hold
       (enable flag, baseline signal observed, DUNGEONS loaded, no un-backed mint
       lane, not already armed, not disarmed this session). Any one false ⇒ no-op.
     · NEVER THROWS INTO THE ENVELOPE PATH — the whole body is wrapped; a refusal
       or an arm-gate throw is caught, logged, and retried on the NEXT envelope.
       A boot envelope can never crash the accrual apply because of this.
     · IDEMPOTENT — once armed it returns immediately (guard 1); it can arm at
       most once per session, and never re-arms after a deliberate disarm. */
let autoArmDisarmed = false;
let inventoryArmEnabled = INVENTORY_ARM_ENABLED === true;

/** TEST-ONLY. Overlay the build-level enable flag so the suite can prove both the
 *  OFF (never-arms) and the ON (arms-once) behaviour without editing the const.
 *  In prod the const is the sole gate — nothing calls this. Returns the effective
 *  value. Clearing (undefined) restores the build-flag value. */
export function __setInventoryArmEnabledForTest(v) {
  inventoryArmEnabled = (v === undefined) ? (INVENTORY_ARM_ENABLED === true) : (v === true);
  return inventoryArmEnabled;
}
/** TEST-ONLY. Clear the session disarm latch (and re-read the enable flag) so an
 *  auto-arm test starts from a pristine, un-disarmed state. Never grants
 *  authority by itself, so exposing it is safe. */
export function __resetAutoArm() {
  autoArmDisarmed = false;
  inventoryArmEnabled = INVENTORY_ARM_ENABLED === true;
  return { autoArmDisarmed, inventoryArmEnabled };
}
export function isInventoryArmEnabled() { return inventoryArmEnabled; }

export function maybeAutoArm() {
  try {
    if (inventoryAuthorityLive) return false;   // (1) already armed — idempotent
    if (autoArmDisarmed) return false;          // (2) deliberately disarmed this session
    if (!inventoryArmEnabled) return false;     // (3) BUILD GATE — false in prod today
    if (!baselineCompleteSeen) return false;    // (4) server not yet observed stamping complete
    const D = (typeof globalThis !== 'undefined') ? globalThis.DUNGEONS : null;
    if (!D || typeof D !== 'object') return false;   // (5) DUNGEONS not loaded (overlap-id safety)
    if (flipArmBlockers().length) return false;      // (6) an un-backed OWNABLE mint lane remains
    /* Every precondition holds — throw the switch. markInventoryAuthorityLive
       re-checks the same guards and only throws if one regressed between here and
       there (a race), which the catch swallows and the next envelope retries. */
    markInventoryAuthorityLive(true);
    return isInventoryAuthorityLive();
  } catch (e) {
    try { console.warn('[accrue] inventory auto-arm deferred (guards not yet met):', e && e.message); } catch (_) {}
    return false;
  }
}

/** Is the general inventory BAG absolute on this device?
 *  Two independent conditions, BOTH fail-closed toward merge (the direction
 *  that can only ever over-credit — never delete a crafted item):
 *    1. inventory authority must be live (it is not — no baseline signal yet),
 *    2. and the shared envelope-merge kill switch must not be forcing merge.
 *  Because (1) is false today, this is ALWAYS false today — the bag is merge. */
export function isInventoryAbsolute() {
  if (!inventoryAuthorityLive) return false;
  return isEnvelopeAbsolute();
}

/** Is the envelope ABSOLUTE on this device?
 *  Two conditions, and BOTH are fail-closed toward the merge — the direction
 *  that can only ever over-credit, never delete and never duplicate. */
export function isEnvelopeAbsolute() {
  if (!equipAuthorityLive) return false;
  try {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(ENVELOPE_MERGE_KEY) !== 'on';
  } catch (e) { return true; }
}

/* ── THE DRIFT COUNTER (§8 — `describeReplacement` REPURPOSED) ──────────────
   §5.3 made the flip conditional on a MEASUREMENT ("no envelope names a key
   whose client value exceeds it, for a full day"). The measurement does not
   stop mattering once the flip lands — it becomes the permanent detector for
   the client and the server disagreeing, and it is the only thing that would
   notice the equip verb regressing. A counter, never a ledger row: journal
   rule 6, and the `game_events` receipt behind it. */
export const envelopeDrift = { applied: 0, destructive: 0, lastAt: 0, lastLoss: null, since: 0 };

export function noteEnvelopeDrift(loss) {
  if (!envelopeDrift.since) envelopeDrift.since = nowMs();   // start of the current soak window
  envelopeDrift.applied++;
  if (loss && loss.destructive) {
    envelopeDrift.destructive++;
    envelopeDrift.lastAt = nowMs();
    envelopeDrift.lastLoss = loss;
  }
  return envelopeDrift;
}

/** Begin a fresh drift-soak measurement window. The eventual (manual) arm
 *  decision requires `destructive === 0` across a SUSTAINED window; resetting
 *  starts the clock on a clean measurement (e.g. right after a deploy that could
 *  otherwise carry stale counts). Does not touch the authority flags. */
export function resetEnvelopeDrift() {
  envelopeDrift.applied = 0;
  envelopeDrift.destructive = 0;
  envelopeDrift.lastAt = 0;
  envelopeDrift.lastLoss = null;
  envelopeDrift.since = nowMs();
  return envelopeDrift;
}

/* ── THE INVENTORY-FLIP READINESS READOUT (Step 3, condition #3) ─────────────
   The arm decision must read REAL DATA, not a guess. describeReplacement already
   counts destructive omissions FOR THE OWNED SET ONLY (an un-modeled id the
   envelope omits is preserved by the carve-out and is never counted — see line
   ~658), so `envelopeDrift.destructive` IS the destructive-owned-omission count
   over the soak window. This accessor exposes it, plus the two arm preconditions,
   as one queryable object so the eventual arm gate (and a status readout / bug
   report) can require: DUNGEONS loaded, the server stamping complete envelopes,
   and destructive === 0 for a sustained window BEFORE anyone calls
   markInventoryAuthorityLive(true). Pure read — no side effects. */
export function inventoryFlipReadiness() {
  const D = (typeof globalThis !== 'undefined') ? globalThis.DUNGEONS : null;
  const soakMs = envelopeDrift.since ? Math.max(0, nowMs() - envelopeDrift.since) : 0;
  return {
    armed: inventoryAuthorityLive,
    absolute: isInventoryAbsolute(),
    dungeonsLoaded: !!(D && typeof D === 'object'),
    baselineCompleteSeen,
    lastEnvelopeComplete,
    completeEnvelopes: baselineCompleteCount,
    destructiveOwnedOmissions: envelopeDrift.destructive,
    envelopesApplied: envelopeDrift.applied,
    lastDestructiveAt: envelopeDrift.lastAt,
    lastLoss: envelopeDrift.lastLoss,
    soakSince: envelopeDrift.since,
    soakMs,
    /* The arm PRECONDITIONS as a single boolean — true only when every guard the
       arm gate enforces is satisfied AND the soak is clean. NOT an auto-arm: it
       reports readiness; a human still throws the switch. `minSoakMs`/`minSamples`
       are the caller's policy (default: any observed clean window). */
    ready: !!(D && typeof D === 'object') && baselineCompleteSeen && envelopeDrift.destructive === 0,
  };
}

/* ── THE DRIFT TELEMETRY REPORTER (inventory-flip soak, CENTRALLY aggregatable) ──
   inventoryFlipReadiness() is computed live in every client but reported NOWHERE,
   so "what fraction of live sessions would see a destructive omission if inventory
   armed" was answerable only by eyeballing one device — which is exactly why the
   inventory arm's soak condition was unverifiable across the playerbase.

   This closes the gap through the EXISTING observability channel
   (window.trackEvent → the analytics buffer in src/observability.js →
   game_events), emitting ONE small AGGREGATE summary per session on a low cadence
   — NEVER a row per envelope (journal rule 6, and the game_events 1.6M-row
   lesson). The summary is a bounded snapshot of the soak counters, so server-side
   aggregation answers the arm-safety question by counting sessions whose
   `destructiveOwnedOmissions > 0`. Client-only; reads state, ARMS NOTHING. */

/** The small bounded drift summary — one flat object of counters, no arrays,
 *  no per-envelope detail. Safe to emit as a single analytics event. */
export function flipDriftSummary() {
  const r = inventoryFlipReadiness();
  const L = r.lastLoss || null;
  /* Worst-observed omission magnitude collapsed to ONE number (gold + xp + item
     units) — a scalar the server can bucket, never the full loss object. */
  const lastLossMag = L
    ? (Math.max(0, Number(L.gold) || 0) + Math.max(0, Number(L.skillXp) || 0) + Math.max(0, Number(L.items) || 0))
    : 0;
  return {
    destructiveOwnedOmissions: r.destructiveOwnedOmissions | 0,
    envelopesApplied: r.envelopesApplied | 0,
    completeEnvelopes: r.completeEnvelopes | 0,
    lastLossMag,
    soakMinutes: Math.round((r.soakMs || 0) / 60000),
    ready: !!r.ready,
    armed: !!r.armed,
    dungeonsLoaded: !!r.dungeonsLoaded,
    baselineCompleteSeen: !!r.baselineCompleteSeen,
  };
}

const FLIP_DRIFT_EVENT = 'inv_flip_drift';
const FLIP_DRIFT_CADENCE_MS = 5 * 60 * 1000;   // low cadence — a soak signal, not a stream
let _lastFlipDriftKey = null;
let _flipDriftTimer = null;

/* Dedupe on the drift PICTURE, excluding the monotonic soak clock: an unchanged
   readout must not re-emit just because five minutes elapsed. This is what keeps
   the steady state (the overwhelming common case — zero drift) to a SINGLE row
   per session instead of one per cadence tick. */
function _flipDriftDedupeKey(s) {
  return [s.destructiveOwnedOmissions, s.envelopesApplied, s.completeEnvelopes,
    s.lastLossMag, s.ready, s.armed, s.dungeonsLoaded, s.baselineCompleteSeen].join('|');
}

/** Read the drift summary and emit it through the observability channel IF it
 *  changed since the last emit. Returns the emitted summary, or null when
 *  suppressed as a duplicate. `emit` is injectable for tests; defaults to
 *  window.trackEvent (the existing analytics funnel). */
export function reportFlipDrift(emit) {
  const s = flipDriftSummary();
  const key = _flipDriftDedupeKey(s);
  if (key === _lastFlipDriftKey) return null;   // no change → no spam
  _lastFlipDriftKey = key;
  const sink = (typeof emit === 'function') ? emit
    : (typeof window !== 'undefined' && typeof window.trackEvent === 'function') ? window.trackEvent
      : null;
  if (sink) { try { sink(FLIP_DRIFT_EVENT, s); } catch (e) { /* telemetry never breaks the client */ } }
  return s;
}

/** Test seam — forget the last-emitted picture so a fresh assertion starts clean. */
export function __resetFlipDriftReport() { _lastFlipDriftKey = null; }

/** Start the low-cadence reporter (idempotent — the once-guard makes a second
 *  call a no-op). A final summary is flushed on pagehide for session-end
 *  coverage. Never runs off-window (Node/tests drive reportFlipDrift directly). */
export function startFlipDriftReporter(intervalMs) {
  if (typeof window === 'undefined') return null;
  if (_flipDriftTimer != null) return _flipDriftTimer;   // once per page
  const ms = Number(intervalMs) > 0 ? Number(intervalMs) : FLIP_DRIFT_CADENCE_MS;
  _flipDriftTimer = setInterval(function () { try { reportFlipDrift(); } catch (e) {} }, ms);
  try {
    window.addEventListener('pagehide', function () { try { reportFlipDrift(); } catch (e) {} });
  } catch (e) {}
  return _flipDriftTimer;
}

/* ── THE CLIENT-TRADE LEDGER (2026-08-18) ───────────────────────────────────
   A DIRECT IMPORT, not a registration seam like `predictionSeam` below, and the
   difference is deliberate. That seam exists because gold.js imports THIS file
   and the dependency could not be inverted. item-ledger.js is a pure leaf that
   imports nothing, so there is no cycle to dodge — and a direct import has no
   "unregistered, therefore silently inert" failure mode, which for a correction
   that prevents an item dupe is the whole ballgame. */
import * as itemLedger from './item-ledger.js?v=483';

/* THE SERVER-OWNED-ITEM PREDICATE (server-authority inventory-flip, Step 2).
   A pure data-derived leaf like item-ledger.js — no cycle to dodge, so a direct
   import. It answers "may the absolute envelope OWN this id?"; a false id is one
   a live, un-modeled path writes (cooked food, crop, dungeon reward, companion
   proc) and the absolute branch below leaves the client's copy of it intact. */
import { serverOwnedItem, rebuildItemAuthority, flipArmBlockers, INVENTORY_ARM_ENABLED } from '../data/item-authority.js?v=483';

/* THE SERVER-ACCRUED-SKILL PREDICATE (P0 — client-only skills must not be
   dragged DOWN by the absolute reconcile). Same shape and same reasoning as
   serverOwnedItem above: a pure data-derived leaf, direct import, answering
   "may the absolute envelope OWN this skill's xp?". A false id — farming,
   cooking, or any skill with no server accrual path — follows Math.max below
   (can only rise) instead of the absolute assign, so the server's FROZEN xp for
   an un-modeled skill can never reduce the client's real progress. */
import { serverAccruedSkill } from '../data/skill-authority.js?v=483';
/* The style catalogue's DEFAULTS — the same object the picker, the XP router and
   the server-side accrual engine all read (src/core/styles.js). Imported rather
   than restated so `reconcileCombatStyle`'s back-fill filter can never disagree
   with what `resolveStyle` treats as "unchosen"; two copies of that fact is the
   b222 shape this repo has already paid for once. */
import { DEFAULT_STYLE_KEYS } from '../core/styles.js?v=483';

/* ── THE HIRED CREW, RECONCILED FROM THE ENVELOPE (worker-settlement slice) ──
   `hr_state_of` projects the server-owned crew (player_workers — no client write
   policy) at `res.workers`: an array of {uid,name,skill,target_id,xp,acc_ms}. The
   client renders G.workers.hired, whose shape uses `targetId` and carries a
   DISPLAY-ONLY ledger (collected/collectedTotal/collectedSince/lastCollect) that
   is not server-owned. So the reconcile is ABSOLUTE for the server-owned fields
   (the crew roster, each worker's skill/target/xp) and PRESERVES the local
   display ledger by matching on uid.

   Fail-closed on absence: an envelope with no readable `workers` array (a server
   build predating this slice, or a partial we cannot trust) leaves G.workers
   untouched — absence is not a claim that the crew is empty, exactly as the
   skills/inventory reconciles above treat an omitted key. An EMPTY array IS a
   claim (the crew is genuinely empty) and clears the roster. Pure: takes G and
   res, returns the reconciled crew size, so the suite can drive it without a live
   window. */
export function reconcileWorkers(G, res) {
  if (!G || !res || !Array.isArray(res.workers)) return null;
  const prev = (G.workers && Array.isArray(G.workers.hired)) ? G.workers.hired : [];
  const byUid = Object.create(null);
  for (const w of prev) if (w && w.uid) byUid[w.uid] = w;
  const hired = res.workers.map((sw) => {
    const old = byUid[sw.uid] || {};
    /* Spread the local record FIRST (keeps the display ledger), then overwrite
       every SERVER-OWNED field so the server always wins the roster contest. */
    const merged = Object.assign({}, old, {
      uid: sw.uid,
      name: sw.name,
      skill: sw.skill || null,
      targetId: (sw.target_id != null ? sw.target_id : null),
      xp: Number(sw.xp) || 0,
      acc_ms: Number(sw.acc_ms) || 0
    });
    if (!merged.lastCollect) merged.lastCollect = Date.now();
    return merged;
  });
  G.workers = { hired };
  return hired.length;
}

/* ── THE BANK ITEM STORE, RECONCILED FROM THE ENVELOPE (bank-store, b438) ────
   `hr_state_of` projects the server-owned bank (public.player_bank — no client
   write policy) at `res.bank`: a flat {item_id: qty} map, exactly the shape of
   `res.inventory`. G.bank is the client's copy of that store — but note it ALSO
   carries three NON-ITEM bank-SPACE counters (goldBuys/gemBuys/grandfather; see
   src/legacy.js ~615/1274, which Object.assigns them into the same object). Those
   are purchase state, NOT items, and are ALWAYS preserved here.

   The fold MIRRORS the bag (applyEnvelopeState's inventory branch) EXACTLY, and
   is gated on the SAME two conditions, both fail-closed toward "leave G.bank
   alone" — the direction that can never delete a banked item:
     • the general inventory bag must be absolute on this device
       (isInventoryAbsolute() — false in prod today; the inventory arm), AND
     • the envelope must be server-certified complete (baselineComplete).
   Absent either, G.bank is left UNTOUCHED — byte-for-byte today's behaviour,
   which is why this ships fully inert (the inventory flip is dormant, post-wipe).

   Under absolute+complete, the serverOwnedItem carve-out applies per key just as
   the bag's does: an OWNED id is the server's truth (named sets the qty, OMITTED
   removes the stack); a NON-owned id (crop, cooked food, dungeon reward — a bank
   can hold any of these) is never deleted and never lowered. This is what makes
   arming the flip SAFE for the bank: it can only ever remove a forged OWNED stack,
   never a legitimately-banked excluded item.

   Fail-closed on absence: no readable `res.bank` object → leave G.bank alone
   (absence is not a claim the bank is empty). Pure: takes G + res, returns a small
   receipt, so the suite drives it without a live window. */
export const BANK_NON_ITEM_KEYS = Object.freeze(['goldBuys', 'gemBuys', 'grandfather']);

export function reconcileBank(G, res, invAbsolute, baselineComplete) {
  if (!G || typeof G !== 'object') return null;
  const named = res && res.bank;
  if (!named || typeof named !== 'object' || Array.isArray(named)) return { mode: 'absent' };
  /* DORMANT / MERGE: the bank is not part of the accrual settle, and the only
     writer of server bank state is hr_bank_move (which the client reconciles from
     that RPC's own response). So outside the absolute arm there is nothing to
     fold in — leave G.bank exactly as the client holds it. */
  if (!invAbsolute || !baselineComplete) return { mode: 'dormant' };

  const cur = (G.bank && typeof G.bank === 'object') ? { ...G.bank } : {};
  const next = {};
  /* Always carry the non-item bank-SPACE counters through untouched. */
  for (const sk of BANK_NON_ITEM_KEYS) {
    if (Object.prototype.hasOwnProperty.call(cur, sk)) next[sk] = cur[sk];
  }
  const keys = new Set(Object.keys(cur).concat(Object.keys(named)));
  for (const k of keys) {
    if (BANK_NON_ITEM_KEYS.indexOf(k) !== -1) continue;   // already preserved
    const q = Number(named[k]);
    const isNamed = Number.isFinite(q) && q > 0;
    if (serverOwnedItem(k)) {
      if (isNamed) next[k] = Math.floor(q);   // OWNED: absolute; omitted → removed
      continue;
    }
    /* NOT OWNED (excluded / un-modeled): never delete, never lower. */
    const have = Number(cur[k]) || 0;
    const best = Math.max(have > 0 ? Math.floor(have) : 0, isNamed ? Math.floor(q) : 0);
    if (best > 0) next[k] = best;
  }
  G.bank = next;
  return { mode: 'absolute', keys: Object.keys(next).length };
}

/* ── THE COMPANION ROSTER, RECONSTRUCTED FROM THE ENVELOPE (blob-retire) ──────
   THE CRITICAL BLOCKER THIS CLOSES. Under the capstone arm the client stops
   loading the save blob, so NOTHING would rebuild G.companions — and
   ensureCompanionState() (src/legacy.js / src/features/companions.js) would then
   default every player to the starter fox with 0 XP, silently RESETTING the whole
   roster + per-companion XP + equipped companion on the first armed boot. The
   server OWNS the underlying facts and `hr_state_of` now projects the WHOLE set
   at `res.companions` (2026-08-22-companion-record.sql):
     { equipped: <id>|null, owned: [<id>,…], xp: { <id>: <xp> } }

   ⚠ ARM-GATED, unlike reconcileWorkers/reconcileBank. G.companions is CLIENT-
   authored today (dormant) — the client awards XP, equips, and unlocks locally.
   So this must run ONLY under the capstone arm (isBlobRetired), or it would
   overwrite the live client roster and break dormant byte-parity. Dormant it is a
   pure no-op ({mode:'dormant'}), so today's load path is byte-for-byte unchanged.

   THE STARTER FOX is owned by grammar (no unlock row server-side — see
   hr_companion_equip c_starter), so the projection's `owned` deliberately omits
   it; the union below re-adds it, exactly as ensureCompanionState seeds it. XP is
   0 for any id the server has not written a companion_xp row for (the XP writer,
   b434, is still dormant) — the same self-configuring default hr_perks_of uses;
   the pet then shows level 1, reconciled to server truth, never client-invented.

   FAIL-CLOSED on absence: no readable `res.companions` object → leave G.companions
   UNTOUCHED (absence is not a claim the roster is empty — a server build predating
   this projection, or a partial we cannot trust, must not wipe the roster). The
   armed boot BEFORE the first projecting envelope arrives is handled by
   ensureCompanionState's own fail-closed empty state, never a fox-reset. Pure:
   takes G + res, returns a small receipt, so the suite drives it without a live
   window. Read the capstone flag off the window global at CALL time — accrue.js is
   imported BY capstone.js, so importing back would be a cycle (the same rule
   isReconcilePending uses). */
function companionAuthorityArmed() {
  try {
    const w = (typeof window !== 'undefined') ? window
      : (typeof globalThis !== 'undefined' ? globalThis.window : null);
    return !!(w && w.HearthriseCapstone
      && typeof w.HearthriseCapstone.isBlobRetired === 'function'
      && w.HearthriseCapstone.isBlobRetired());
  } catch (e) { return false; }
}

export function reconcileCompanions(G, res) {
  if (!G || typeof G !== 'object') return null;
  /* DORMANT: the client owns G.companions exactly as today. A pure no-op — this
     is what keeps the un-armed load path byte-for-byte unchanged. */
  if (!companionAuthorityArmed()) return { mode: 'dormant' };
  const c = res && res.companions;
  /* FAIL-CLOSED: an un-projecting/partial envelope leaves the roster alone. */
  if (!c || typeof c !== 'object' || Array.isArray(c) || !Array.isArray(c.owned)) {
    return { mode: 'absent' };
  }
  /* OWNED = server's unlock set ∪ the grammar-owned starter fox. */
  const owned = new Set(['fox']);
  for (const id of c.owned) if (typeof id === 'string' && id) owned.add(id);
  /* PER-ID XP, an integer floor for every owned id; an id the server has no xp
     row for reads 0 (level 1 base — the self-configuring default). */
  const xpIn = (c.xp && typeof c.xp === 'object' && !Array.isArray(c.xp)) ? c.xp : {};
  const xp = {};
  for (const id of owned) {
    const v = Number(xpIn[id]);
    xp[id] = (Number.isFinite(v) && v > 0) ? Math.floor(v) : 0;
  }
  /* EQUIPPED is the server-owned column. A stale/forged id the player does not
     (server-)own is refused to null rather than trusted — the same safe direction
     hr_companion_equip's ownership gate enforces. */
  let equipped = (typeof c.equipped === 'string' && c.equipped) ? c.equipped : null;
  if (equipped && !owned.has(equipped)) equipped = null;
  G.companions = { ownedIds: Array.from(owned), xp, equipped };
  return { mode: 'server', owned: owned.size, equipped };
}

/* ── THE OWNED PERMANENT TRAITS, HYDRATED FROM THE ENVELOPE ───────────────────
   hr_trait_buy (supabase/migrations/2026-08-23-trait-buy.sql) is the server-side
   writer of a trait: it debits the server-owned Bounty-Marks balance and writes
   a player_progress kind='flag' key='trait:<id>' row — the same row
   hr_auto_eat_tier reads to decide the auto-eat ceiling. hr_state_of projects
   that set as a flat top-level `traits` array, and THIS is what puts it into
   G.traits so a purchase survives a device change without the save blob.

   ⚠ UNION, NEVER REPLACE — and that is the whole design of this function.
   G.traits is still a blob field today, and there are live players who bought
   Auto-Eat BEFORE this verb existed: they hold `G.traits.auto_eat === true`
   locally and NO server row. An absolute assignment would REVOKE a paid trait
   from every one of them on their next envelope, which is the one irreversible
   mistake available here. A union can only ever ADD, so:
     · a server-owned trait appears on every device (the feature);
     · a locally-owned, server-unknown trait is left exactly alone (the safety);
     · an entitlement is monotone, which is what hr_set_auto_eat's tier argument
       already assumes ("an entitlement is never revoked").
   The beta wipe removes the pre-migration population, at which point the server
   set IS the set — but the union stays, because "never take a purchase away" is
   not a transitional rule.

   FAIL-CLOSED on absence: no readable `res.traits` ARRAY → leave G.traits
   untouched. A server build predating the projection, or a partial we cannot
   trust, must not be read as "you own nothing" — and because this is a union
   that is already true, absence simply changes nothing.

   NOT arm-gated: a union has no dormant/armed difference to gate. Pure — takes
   G + res, returns a small receipt, so the suite drives it without a window. */
export function reconcileTraits(G, res) {
  if (!G || typeof G !== 'object') return null;
  const t = res && res.traits;
  if (!Array.isArray(t)) return { mode: 'absent' };
  if (!G.traits || typeof G.traits !== 'object') G.traits = {};
  let added = 0;
  for (const id of t) {
    if (typeof id !== 'string' || !id) continue;
    if (G.traits[id] !== true) { G.traits[id] = true; added++; }
  }
  return { mode: 'server', owned: t.length, added };
}

/* ── THE COMBAT STYLE IS THE SERVER'S (2026-08-24-combat-style.sql) ───────────
   THE DEFECT THIS HALF CLOSES. `G.combatStyle` was a purely local choice: the
   save blob carried it, then the blob retired and `client-state.js`
   RESIDUE_FIELDS carried it — a SELF-ONLY verbatim bag the server is forbidden
   to read for authority. So the accrual engine had nothing to read and used
   `resolveStyle(weaponType, null)`, the family DEFAULT — Accurate, 100% of
   styled XP to ATTACK. Skills are server-of-record and armed, so every settle
   replaced the client's predicted Strength/Defence XP with the server's
   Attack-only routing. Paione, live: "only Attack saves."

   `hr_set_style` now owns `player_state.combat_style` and hr_state_of projects
   it at `state.combat_style`. THIS is what makes the server's copy the one the
   picker renders, so the routing the player sees and the routing the engine
   pays can no longer disagree — and it survives a device change, which the
   residue bag never did.

   ── THE MERGE DIRECTION, AND WHY IT IS NOT AN ASSIGNMENT ────────────────────
   SERVER WINS PER FAMILY; a family the SERVER has no opinion about keeps the
   local choice. Both halves are load-bearing:
     · server-wins is the whole point — the engine pays from the server's map,
       so a local value that disagrees is a lie the player is being shown;
     · per-family, because the map is deliberately PARTIAL. `{}` means "has
       chosen nothing", not "chose Accurate". A player who picked Aggressive
       before this migration shipped has that choice only in their residue bag,
       and a whole-map assignment would silently reset them to Accurate — which
       is this file's own bug, reintroduced from the other side. The unchosen
       families are then pushed up by `adopt` below, once, and after that the
       server's map is complete and this branch never fires again.

   FAIL-CLOSED on absence: no readable `res.state.combat_style` OBJECT leaves
   G.combatStyle exactly alone. A server build predating the migration, or a
   lean envelope, must never be read as "you chose nothing".

   NOT arm-gated. There is no dormant/armed difference to gate: the value is a
   preference, the server is already the only thing that computes XP from it,
   and a merge that can only ever agree-or-correct has no unsafe direction.

   PURE — takes G + res and returns a receipt, so the suite drives it without a
   window. `adopt` is a LIST, not a side effect: the caller decides whether to
   send it, which keeps the transport out of this function. */
export function reconcileCombatStyle(G, res) {
  if (!G || typeof G !== 'object') return null;
  const st = (res && res.state) || null;
  const server = st && st.combat_style;
  if (!server || typeof server !== 'object' || Array.isArray(server)) return { mode: 'absent' };
  if (!G.combatStyle || typeof G.combatStyle !== 'object' || Array.isArray(G.combatStyle)) {
    G.combatStyle = {};
  }
  /* ── THE OPTIMISTIC-PICK GUARD (2026-08-24, "magic style reverts to attack") ──
     applyCombatStyle() writes G.combatStyle[family] the instant the player taps a
     style AND fires set_style fire-and-forget. But set_style settles first, then
     runs on a 0/4s/15s retry ladder, so for up to a few seconds the SERVER'S map
     still holds the OLD value. Any envelope that lands in that window — a routine
     settle, or the one a stat level-up triggers — carried the pre-change map, and
     "server-wins per family" then rolled the fresh pick straight back (Focus →
     Cast; a magic user watched their choice snap to the family default). That is
     the report: "styles swap back when you level a stat or switch cast↔focus".

     So applyCombatStyle records G._pendingStyle[family] = key (scratch, `_`-prefixed
     → never synced). A family with a pending pick the server has NOT yet echoed is
     HELD, not overwritten, and re-queued in `adopt` so the intent keeps being
     resent until the server agrees. The moment the server's map matches the pending
     key, the marker is cleared and normal server-wins resumes — so a genuine
     cross-device change still wins, this only protects the in-flight local gesture. */
  const pending = (G._pendingStyle && typeof G._pendingStyle === 'object' && !Array.isArray(G._pendingStyle))
    ? G._pendingStyle : null;
  let corrected = 0;
  let held = 0;
  const adopt = [];
  for (const family of Object.keys(server)) {
    const key = server[family];
    if (typeof key !== 'string' || !key) continue;
    if (pending && pending[family] && pending[family] !== key) {
      /* The server is stale for this family — its echo predates our pick. Keep
         the local value, keep the marker, and let the back-fill below re-send. */
      held++;
      continue;
    }
    if (pending && pending[family] === key) delete pending[family];  // server caught up
    if (G.combatStyle[family] !== key) { G.combatStyle[family] = key; corrected++; }
  }
  /* THE ONE-SHOT BACK-FILL. A family the player chose locally that the server
     has never been told about — i.e. every pre-migration choice, which today is
     ALL of them. Reported, not sent: the caller owns the transport.

     ⚠ NON-DEFAULT CHOICES ONLY, and that filter is what keeps this from being a
       boot-time storm. `migrate()` in legacy.js runs `normaliseStyleKeys`, which
       FILLS ALL FOUR families with their defaults, so an unfiltered back-fill
       would fire four RPCs on the first boot of every account — and, worse,
       would write those defaults into the server map, destroying the
       distinction the column is defined on ("{} means chosen nothing", not
       "chose Accurate"). A default is already what the server resolves an absent
       family to, so sending it says nothing. */
  for (const family of Object.keys(G.combatStyle)) {
    const key = G.combatStyle[family];
    if (typeof key !== 'string' || !key) continue;
    if (DEFAULT_STYLE_KEYS[family] === key) continue;
    if (server[family] !== key) adopt.push([family, key]);
  }
  return { mode: 'server', corrected, held, adopt };
}

/* ── THE FARM PLOTS, RECONSTRUCTED FROM THE ENVELOPE (blob-retire capstone) ────
   THE CRITICAL BLOCKER THIS CLOSES. Under the capstone arm the client stops
   loading the save blob, and NOTHING would rebuild G.farmPlots / G.plotLevels —
   so startFarmCheck's forEach and the two farm render loops would deref an
   `undefined` and THROW, and every standing/growing crop would silently vanish.
   The four farm gestures are already server-authoritative (hr_farm_*), and
   `hr_state_of` projects the plot set at `res.farm`, verified LIVE 2026-08-22:

     res.farm = [ { i:<plot_idx>, crop:<crop_id>,
                    planted_at:<timestamptz>, watered_at:<timestamptz|null> }, … ]

   — one row PER PLANTED PLOT (empty plots have no row), ordered by plot_idx. It
   carries the REAL server `planted_at`, which is strictly better than the
   per-action path (reconcileFarmResult approximates a regrow's plantedAt to
   Date.now() because the RPC response does not restate it — the full-state load
   does not have to). The server→client mapping mirrors reconcileFarmResult's
   plot-object shape so the two stay consistent:

     { cropId:res.crop, plantedAt:<ms>, waterings:[<ms>|…], state:'growing',
       regrowCount:0 }

   The growth model (HearthriseFarm.growthHours) reads `waterings[]`, so the
   single server `watered_at` column becomes a one-element `waterings` array (the
   most recent watering — the projection does not restate the full array); the
   live tick then promotes a finished plot to state:'ready'.

   ⚠ TWO FIELDS THE LIVE PROJECTION DOES NOT CARRY, stated honestly:
     • G.plotLevels (player_state.plot_level) is NOT in the state envelope today
       (verified live: hr_state_of has no plot_level key). So this reads it only
       IF a future projection adds `state.plot_level`, and otherwise leaves
       G.plotLevels UNTOUCHED — getPlotLevel() already fail-safes an undefined to
       Lv 1. Restoring the true plot tier under arm needs a one-line server
       projection add (`'plot_level', v_st.plot_level`); until then an armed farm
       reads as Lv 1. Flagged, not silently defaulted-as-if-correct.
     • regrow_count is not projected either, so regrowCount rebuilds to 0. This is
       display-only: the finite-perennial wither LIMIT is enforced server-side in
       hr_farm_harvest, so a client that under-counts regrows cannot exceed it.

   ⚠ ARM-GATED (companionAuthorityArmed / isBlobRetired), like reconcileCompanions
   and for the same reason: G.farmPlots is CLIENT-authored today, so running this
   dormant would overwrite the live client farm and break byte-parity. Dormant it
   is a pure no-op ({mode:'dormant'}).

   FAIL-CLOSED on absence: no readable `res.farm` ARRAY leaves G.farmPlots
   UNTOUCHED — a server build predating the projection, or a partial we cannot
   trust, must NEVER wipe a populated farm on a lean envelope (the accrue-idle
   envelope, which carries no farm, must not blank the plots).

   ⚠ EMPTY ARRAY (bug-fix, KD420 "disappearing plots" / Paione live reports):
   an EMPTY farm:[] is a claim the farm is unplanted ONLY on the AUTHORITATIVE
   full statement — the boot hr_load body (record.js settle passes
   {authoritative:true}). On a LEAN/partial envelope (the frequent hr-accrue
   settle, which may project farm:[] for a moment) an empty array is NOT a claim:
   wiping a populated G.farmPlots there is exactly the disappearing-plots bug, and
   under blob-retire there is no local blob to restore them. So a non-authoritative
   empty array leaves a standing farm ALONE (save-invariant #2 — act only on
   certainty). The legit "a plot was cleared/harvested" path is the harvest RPC
   response (farm-sync.js reconcileFarmResult), never this whole-state reconcile.
   Pure. */
function farmParseTs(v) {
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : Date.now();
}

/* Is a rebuilt plot already past its ready time? Reads HearthriseFarm.isReady
   (the single growth authority) off the window at CALL time — accrue.js is
   Node-importable, so this fail-safes to false (stays 'growing') when the farm
   API is absent, e.g. in a headless guard. */
function farmPlotReady(p) {
  try {
    const w = (typeof window !== 'undefined') ? window
      : (typeof globalThis !== 'undefined' ? globalThis.window : null);
    const A = w && w.HearthriseFarm;
    return !!(A && typeof A.isReady === 'function' && A.isReady(p));
  } catch (e) { return false; }
}

export function reconcileFarm(G, res, opts) {
  if (!G || typeof G !== 'object') return null;
  /* DORMANT: the client owns G.farmPlots exactly as today — a pure no-op that
     keeps the un-armed load path byte-for-byte unchanged. */
  if (!companionAuthorityArmed()) return { mode: 'dormant' };
  const rows = res && res.farm;
  /* FAIL-CLOSED: absence is not a claim the farm is empty. Leave it alone. */
  if (!Array.isArray(rows)) return { mode: 'absent' };

  const authoritative = !!(opts && opts.authoritative);

  const plots = [];
  let planted = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const idx = Number(row.i);
    if (!Number.isFinite(idx) || idx < 0 || idx > 255) continue;   // sane bound
    const cropId = (typeof row.crop === 'string' && row.crop) ? row.crop : null;
    if (!cropId) continue;
    const waterings = (row.watered_at != null) ? [farmParseTs(row.watered_at)] : [];
    const plot = {
      cropId,
      plantedAt: farmParseTs(row.planted_at),
      waterings,
      state: 'growing',
      regrowCount: 0,
    };
    /* BUG FIX (Paione "turnip ready every 5s"): promote a genuinely-ready plot to
       'ready' AT REBUILD TIME. The reconcile ran on every envelope and rebuilt
       every plot as 'growing', wiping the ready-latch startFarmCheck sets — so the
       tick re-detected readiness and re-fired the "ready!" toast each 5s cycle.
       Rebuilding it already-ready removes that churn. */
    if (farmPlotReady(plot)) plot.state = 'ready';
    plots[idx] = plot;
    planted++;
  }

  /* BUG FIX (KD420 "disappearing plots"): an empty/zero-plot envelope may not wipe
     a standing farm unless it is the authoritative full statement. A lean accrue
     settle projecting farm:[] leaves the populated farm untouched. */
  const hasStanding = Array.isArray(G.farmPlots) && G.farmPlots.some((p) => p && p.cropId);
  if (planted === 0 && hasStanding && !authoritative) {
    return { mode: 'empty-noclaim', planted: 0, kept: G.farmPlots.length };
  }

  G.farmPlots = plots;

  /* PLOT TIER — only if a future projection carries it; else leave untouched so
     getPlotLevel() keeps its Lv 1 fail-safe. Never invented from the client. */
  const st = res && res.state;
  const tier = st && Number(st.plot_level);
  let plotLevel = null;
  if (Number.isFinite(tier) && tier >= 1) {
    G.plotLevels = Math.floor(tier);
    plotLevel = G.plotLevels;
  }

  return { mode: 'server', planted, plots: plots.length, plotLevel };
}

export function applyEnvelopeState(G, res, ownKey) {
  const st = (res && res.state) || {};
  const written = { skills: {}, inventory: 0 };
  const absolute = isEnvelopeAbsolute();
  /* Observe the baseline-complete signal off every arriving envelope, armed or
     not — this is what lets a merge-mode client accumulate the proof that the
     server IS stamping completeness before a human arms (see markInventoryAuthorityLive). */
  noteBaselineComplete(res);
  /* THE BOOT AUTO-ARM (LIVE-ARM wiring). Build-gated and fully guarded; a silent
     no-op in prod (INVENTORY_ARM_ENABLED false) and until every arm precondition
     is met. Wrapped so it can NEVER throw into the envelope apply — a refusal is a
     no-op that retries on the next envelope. See maybeAutoArm. */
  maybeAutoArm();
  /* b465 — hand the envelope's progress rows to the daily-reward sheet: the
     server's daily/login claim row is the marker that survives tab/save races
     (the residue copy kept losing them and the sheet re-opened on a paid
     reward). Guarded — a marker must never throw into an envelope apply. */
  try {
    const w = (typeof window !== 'undefined') ? window : null;
    if (w && w.HearthriseDaily && typeof w.HearthriseDaily.markServerClaim === 'function') {
      w.HearthriseDaily.markServerClaim(res && res.progress);
    }
    // b475 — feed the server's authoritative streak (state.streak_days) so the
    // daily-reward sheet renders the day/reward the server will actually pay.
    if (w && w.HearthriseDaily && typeof w.HearthriseDaily.noteServerStreak === 'function') {
      w.HearthriseDaily.noteServerStreak(res);
    }
  } catch (e) {}
  written.absolute = absolute;

  if (Number.isFinite(Number(st.gold))) { G.gold = Number(st.gold); written.gold = G.gold; }

  /* ELEMENTS v1 — THE WEAPON ENCHANT IS SERVER-AUTHORED. When the envelope
     carries a `state.enchant` object, it is the truth: the server sets
     `enchant.weapon` on a successful `enchant` verb and clears it whenever an
     `equip` changes the weapon. Applied absolutely whenever present (element
     name only — never a magnitude), and left ALONE when omitted (a server build
     that predates the verb sends no `enchant`, and absence is not a claim, the
     same rule skills follow above). Placed before both return paths so the
     absolute-inventory branch does not skip it. */
  if (st.enchant && typeof st.enchant === 'object' && !Array.isArray(st.enchant)) {
    const el = st.enchant.weapon;
    const ok = el === 'ember' || el === 'frost' || el === 'poison';
    G.enchant = ok ? { weapon: el } : {};
    written.enchant = G.enchant.weapon || null;
  }
  if (Number.isFinite(Number(st.max_hp))) { G.playerMaxHp = Number(st.max_hp); written.maxHp = G.playerMaxHp; }
  /* ══════════════════════════════════════════════════════════════════════
     b373 — HP IS FIGHT-LOCAL, AND AN IDLE PLAYER CANNOT BE WOUNDED BY AN
     ENVELOPE. (Designer ruling, LIVE-AUDIT-2026-08-17 FTUE run 2 finding 2.)

     THE MEASURED BUG. A fresh player died to the first slime and respawned at
     **2/10 HP**, which reads as a punishment nobody designed. Nothing in the
     combat rules produces it: `resolveDeath` in src/core/combat-sim.js sets
     `state.playerHp = state.playerMaxHp` — a full heal — and always has. The 2
     arrives HERE. The client resolved the death and healed; an envelope for a
     window that ended BEFORE that death then landed and wrote the server's
     mid-fight hp straight over the respawn. The next fight starts at 2 HP and
     the new player dies again, having done nothing wrong.

     WHY THIS IS THE RIGHT SEAM, and not a special case. src/net/events.js
     already states the rule this file was breaking: `playerHp` and
     `playerMaxHp` are in `NO_SYNC` — "in-flight combat — belongs to the device
     you are fighting on". The snapshot has honoured that since it was written;
     the envelope never did. So this is not a new exception, it is this module
     finally obeying a rule the codebase already declares.

     THE RULE: an envelope may RAISE hp freely, and may lower it only while a
     fight is actually in flight. With no `activeMonster` there is nothing
     hitting the player, and the server itself agrees — the accrual engine sets
     the activity pointer to idle in the same delta as a death
     (supabase/functions/hr-accrue/accrual.js: `if (summary.died ||
     !state.activeMonster) delta.activity = {kind:'idle'}`), so a low hp
     alongside an idle pointer is by construction a reading from a window that
     has already been superseded.

     NOT AN ECONOMY HOLE: hp is not tradeable, rankable or contributable, it is
     already client-local by the project's own denylist, and away combat — the
     only place hp materially gates earnings — runs with `activeMonster` set,
     where the server keeps full authority. `written.hp` records the refusal so
     the drift counter can still see it.

     ⚠ THIS IS A CLIENT-SIDE FLOOR, NOT THE FIX. The correct end state is the
     envelope carrying the death as a STATEMENT (it already computes
     `summary.died`) and reporting post-respawn hp, so the two sides never
     disagree in the first place. Raised for the Systems Engineer in
     CONFLICTS.md — do not let this guard become the reason that never happens.
     ══════════════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════════════
     PAIONE P0 (2026-08-25) — DURING A LIVE FIGHT, HP IS CLIENT-OWNED UNLESS
     THE SERVER GENUINELY COMPUTED IT (an AWAY grant).

     THE MEASURED BUG. On a live client-predicted fight the periodic sync/settle
     returns an envelope whose `state.hp` is STALE-FULL — the server pointer is
     `idle` and never saw the fight (confirmed live: active_kind='idle', hp=10/10
     while the client is mid-goblin-fight at 4 HP). The b373 floor below RAISED hp
     freely (`next >= cur`), so every few seconds the live fight's hp snapped back
     to full and the player never took real damage / never fell. b373 was written
     for AWAY combat, where the server DID compute hp and must win.

     THE DISTINGUISHER, stated rather than guessed: an AWAY-return envelope
     carries an `away` receipt block (isEnvelopeApplicable requires `res.away` for
     accrued:true, and applyEnvelope — the only away-grant path — passes the full
     response through). A live sync / lean settle / intent collect (eat, equip,
     enchant, activity switch) carries NO `away` block; those come through
     applyIntentEnvelope / gold.js with the bare state envelope. So:
       • away envelope (server owns hp) → apply b373 exactly as before;
       • non-away envelope during a live fight → PRESERVE the client's combat hp
         (never raise to stale-full, never lower to a stale reading).
     This is the GENERAL form of the wireServerEat onEnvelope keepHp guard in
     legacy.js (Paione P0 phase 2) — that hook snapshots/restores G.playerHp
     around the eat reconcile; this makes the applier itself refuse the write, so
     every non-away path (sync, equip, enchant, activity) is covered at the source
     and the eat hook's restore becomes a harmless no-op consistent with it.

     Out of combat (no activeMonster) the b373 raise-only floor is unchanged: an
     idle player cannot be wounded by a stale envelope, and a heal still applies.
     ══════════════════════════════════════════════════════════════════════ */
  if (Number.isFinite(Number(st.hp))) {
    const next = Number(st.hp);
    const cur = Number(G.playerHp);
    const inFight = !!G.activeMonster;
    const awayOwnsHp = !!(res && res.away && typeof res.away === 'object');
    if (inFight && !awayOwnsHp) {
      /* LIVE fight, non-away envelope: combat hp is client-owned. Preserve it.
         (Adopt the server value only if the client has no finite hp at all — a
         cold state where there is nothing to preserve.) */
      if (Number.isFinite(cur)) { written.hp = cur; written.hpRefused = next; }
      else { G.playerHp = next; written.hp = G.playerHp; }
    } else if (inFight || !Number.isFinite(cur) || next >= cur) {
      /* Away combat (server owns hp) OR idle-and-raising — b373 unchanged. */
      G.playerHp = next; written.hp = G.playerHp;
    } else {
      written.hp = cur; written.hpRefused = next;
    }
  }

  /* skills: {<id>:{xp,level}} on the wire, {<id>: xp} in G. The LEVEL is
     derived from xp everywhere in this client, so taking the server's xp and
     letting the existing derivation run keeps one source of that rule. */
  /* ══════════════════════════════════════════════════════════════════════
     P0 FIX (b359) — THE ENVELOPE OVERWRITES WHAT IT NAMES, NOT WHAT IT OMITS.

     This block used to REPLACE `G.skills` and `G.inventory` wholesale with the
     envelope's copy. That is only safe if the server is the sole writer of both,
     and it is not yet: LIVE play still awards drops and XP on the client, so
     every envelope deleted whatever the server had not been told about.

     Reported by a player, 2026-08-17: farmed 14 Dragon Scales, watched them
     decay 14 -> 2 -> 1 as envelopes arrived, and saw Stonemason — a skill that
     shipped hours earlier and therefore exists NOWHERE server-side — reset to
     level 1 on every round trip. The `describeReplacement` "destructive" check
     directly below already MEASURED this loss; nothing acted on it.

     So: a key the envelope NAMES is authoritative and overwrites (the server
     still wins every contest, including downward — that is the anti-forgery
     property). A key the envelope OMITS is left alone, because "absent" from a
     server that has never owned live drops means "unknown", not "zero". Absence
     is not a claim.

     THIS IS A DELIBERATE, TEMPORARY WEAKENING of server authority, authorised by
     Tyler during the incident: a forged client-side item now survives a round
     trip where before it was scrubbed. The beta already carries explicit amnesty
     for pre-cutover forgery and the exposure is a closed friends-list, so losing
     real players' real progress was judged the greater harm. It is NOT the end
     state. It retires the moment live drops/XP are server-authored — at which
     point the envelope names every key it owns, and omission stops being
     ambiguous. Do not "tidy" this back into a replace before then; the guard
     below fails the build if you do. */
  const skills = (G.skills && typeof G.skills === 'object') ? { ...G.skills } : {};
  for (const k of Object.keys(res.skills || {})) {
    const xp = Number(res.skills[k] && res.skills[k].xp);
    if (Number.isFinite(xp)) {
      const have = Number(skills[k]) || 0;
      /* ── P0 CARVE-OUT: A CLIENT-ONLY SKILL IS NEVER ASSIGNED DOWNWARD ───────
         The absolute assign is only safe for a skill the accrual engine actually
         SETTLES. Farming (no gather node, no declarable activity) and cooking
         (the un-modeled artisan lane) have NO server accrual path, so the
         server's xp for them is FROZEN at its last value — and an absolute
         assign then re-asserts that frozen value DOWNWARD on every 90s settle
         and every reload (the "Farming stuck at 66" / "cooking XP resets" bugs).
         `serverAccruedSkill(k)` is derived from the SAME sources the engine reads
         (combat styles ∪ GATHER_SKILLS ∪ payable artisan lanes), so a future
         server-accrued skill is not wrongly carved out and a new client-only
         skill is protected automatically. Fail-closed: an UNKNOWN skill is not
         server-accrued either, so it too follows Math.max — the never-reduce
         direction. This generalises the OMITTED-skill protection below to a
         NAMED-but-not-accrued skill. */
      const skillAbsolute = absolute && serverAccruedSkill(k);
      /* PHASE 2: ASSIGNMENT. For a SERVER-ACCRUED skill the server wins every
         contest, INCLUDING DOWNWARD — that direction IS the anti-forgery
         property, and the max was the one thing standing between a devtools-
         edited xp figure and a round trip that laundered it into permanence.
         PHASE 1: MAX. Kept behind the switch, not deleted, because it is the
         incident lever — and it is now ALSO the client-only-skill floor. */
      skills[k] = skillAbsolute ? xp : Math.max(have, xp);
      written.skills[k] = skills[k];
    }
  }
  /* ⚠ A SKILL THE ENVELOPE OMITS IS **LEFT ALONE**, EVEN UNDER ABSOLUTE, AND
     THAT IS A DELIBERATE ASYMMETRY WITH INVENTORY BELOW. State the reason,
     because "be consistent" is the obvious wrong answer here:

     `hr_state_of` builds `skills` from `player_skills`, which is seeded at
     character creation from the GENERATED `hr_skills` catalogue. That catalogue
     is one `apply` behind src/data/skills.js whenever a skill ships ahead of
     its migration — which is not hypothetical, it is the b361 incident by name:
     **Stonemason shipped to clients minutes before its hr_skills row landed.**
     Under a symmetric rule, every envelope in that window would have DELETED
     every player's Stonemason progress, permanently, and the deletion would
     have looked exactly like the server correctly disagreeing.

     An omitted skill therefore means "the server's catalogue has never heard of
     this", which is a CATALOGUE GAP, not a zero. Inventory has no equivalent:
     `hr_items` holds all 512 authored ids and an absent row genuinely means an
     empty stack.

     ⏳ THE CLOSING CONDITION, so this is a scheduled debt and not a permanent
     hole: a parity assertion between src/data/skills.js and the envelope's
     skill set — one that FAILS THE BUILD on a skill the server does not know —
     makes omission unambiguous, and this branch can then delete like the bag
     does. Until then the residual is stated: a skill deleted from src/data on
     purpose keeps its client-side xp until the save is rewritten. That is a
     stale display, not a mint: nothing tradeable, rankable or contributable
     hangs off it, because leaderboard scores come off the server. */
  G.skills = skills;

  /* ══════════════════════════════════════════════════════════════════════
     b374 — MAX-HP FOLLOWS THE HITPOINTS LEVEL LIVE (Tyler backlog: "HP went
     from 10 to 11 but I had to refresh the game for it to take effect").

     maxHp is DERIVED from the hitpoints level everywhere in this client —
     `ensureSave` computes `G.playerMaxHp = levelFromXp(G.skills.hitpoints)`,
     and the live-combat level-up handler (`addXp`) bumps it in the same tick.
     The envelope updates `G.skills.hitpoints` above but only ever set
     `playerMaxHp` from an explicit `st.max_hp` (line above), which the settle
     envelope does not reliably carry. So a hitpoints level gained through
     SERVER-computed away/settle accrual raised the xp but not the cap: the top
     bar kept the old max and — worse — the heal/auto-eat cap stayed low, until
     a reload re-ran `ensureSave`. This recomputes the derived max from the
     freshly-applied xp so it applies in the same settle, no reload.

     RAISE-ONLY, on purpose, and this is how it stays out of the b373 fight.
     That HP FLOOR (the `st.hp` block above) blocks an envelope from LOWERING a
     resting player's hp. A maxHp change here can only ever GROW (xp is
     monotonic and the max is a pure function of it), so it never contends with
     the floor — a level-up must raise the cap, and nothing here can shrink it.
     If a would-be lower value ever arrived (a corrected/rolled-back xp), the
     `> current` guard simply declines it rather than clobbering the display. */
  try {
    const lf = (typeof window !== 'undefined' && typeof window.levelFromXp === 'function')
      ? window.levelFromXp : null;
    if (lf) {
      const derivedMax = Number(lf(Number(G.skills.hitpoints) || 0));
      if (Number.isFinite(derivedMax) && derivedMax > (Number(G.playerMaxHp) || 0)) {
        G.playerMaxHp = derivedMax;
        written.maxHp = G.playerMaxHp;
        /* Let a player who just leveled Hitpoints heal into the new headroom
           instead of being stuck one under — but only top up a bar that is not
           a valid live hp (0/NaN, i.e. not mid-fight). An in-fight hp is left
           exactly where the fight put it. */
        if (!(Number(G.playerHp) > 0)) G.playerHp = G.playerMaxHp;
      }
    }
  } catch (e) {}

  /* THE HIRED CREW IS THE SERVER'S (worker-settlement slice). Reconciled here,
     before the inventory branch splits, so it rides EVERY envelope (away,
     activity-switch, gold) regardless of which return path the bag takes. */
  written.workers = reconcileWorkers(G, res);

  /* THE COMPANION ROSTER IS THE SERVER'S UNDER ARM (blob-retire). Reconciled
     here, alongside the crew, so it rides EVERY envelope (away, activity-switch,
     gold) regardless of which return path the bag takes. Arm-gated inside — a
     pure no-op while dormant, so today's path is byte-for-byte unchanged. The
     boot hr_load path reconstructs through record.js's settle() (the always-full
     envelope), which calls this same function. */
  written.companions = reconcileCompanions(G, res);

  /* THE OWNED TRAIT SET IS THE SERVER'S (hr_trait_buy). Reconciled here so it
     rides EVERY envelope, and as a UNION so a trait bought before the server
     verb existed is never revoked — see reconcileTraits' header. */
  written.traits = reconcileTraits(G, res);

  /* THE COMBAT STYLE IS THE SERVER'S (hr_set_style). Reconciled here so it rides
     EVERY envelope, which is what makes the picker show what the ENGINE will
     actually pay. Server-wins per family, fail-closed on absence — see the
     function header. The `adopt` list is the one-shot back-fill of a choice made
     before the verb existed; it is SENT here rather than inside the reconciler
     so that function stays pure and transport-free. Fire-and-forget, and only
     for a NON-DEFAULT choice, so a fresh account sends nothing. */
  written.combatStyle = reconcileCombatStyle(G, res);
  try {
    const adopt = written.combatStyle && written.combatStyle.adopt;
    const GC = (typeof window !== 'undefined') ? window.HearthriseGoalClaim : null;
    if (adopt && adopt.length && GC && typeof GC.setStyle === 'function') {
      for (const [family, key] of adopt) {
        const p = GC.setStyle(family, key);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    }
  } catch (e) {}

  /* THE FARM IS THE SERVER'S UNDER ARM (blob-retire capstone). Reconciled here,
     alongside the crew and companions, so it rides EVERY envelope (away,
     activity-switch, gold) regardless of which return path the bag takes.
     Arm-gated inside — a pure no-op while dormant, so today's path is
     byte-for-byte unchanged. The boot hr_load path reconstructs through
     record.js's settle() (the always-full envelope), which calls this same
     function. Fail-closed on an absent res.farm — a lean envelope never wipes a
     populated farm. */
  written.farm = reconcileFarm(G, res);

  const inv = (G.inventory && typeof G.inventory === 'object') ? { ...G.inventory } : {};
  /* ══════════════════════════════════════════════════════════════════════
     PHASE 1 (b364) — DEBITS ABSOLUTE, CREDITS BY MAX. live-settlement.md §5.2.

     THE HOLE THIS CLOSES, AND WHY IT BECAME URGENT. The b359 max below is a
     one-way ratchet: it can only ever RAISE the client's copy. That is exactly
     right for a DROP the server has not been told about, and exactly wrong for
     a unit the server SPENT — its own header said so ("an item the server
     legitimately CONSUMED while he was away will not be deducted"). Away, that
     fired on the rare night that auto-ate. Settling every 90 s fires it ~320
     times a day, and a duplication that fires 320 times a day is a faucet.

     THE RULE, and it is exact rather than heuristic: a key the server states it
     DEBITED is a key the server's figure is authoritative for, because the
     client cannot have spent it on the server's behalf. So a debited key is
     ASSIGNED; every other key keeps b359's max untouched.

     ⚠ A FULLY-CONSUMED KEY IS OMITTED FROM THE ENVELOPE, NOT NAMED AT ZERO.
     Verified in 2026-08-11-apply-engine.sql: the item block DELETEs the
     `player_inventory` row when `have + delta = 0`, and `hr_state_of` builds
     `inventory` by aggregating the surviving rows. So "ate the last three
     shrimp" arrives as `away.items = {shrimp:-3}` with NO `inventory.shrimp` —
     and a fix that only walked the envelope's own keys would close nothing in
     precisely the case that matters most. The debit list is therefore part of
     the key set, and an omitted DEBITED key reads as a real zero. That does not
     reopen B359-1: omission is only load-bearing here for a key the server
     explicitly named as spent.

     PRECEDENCE WITH THE b362 EQUIP DISCOUNT — both apply, discount FIRST. The
     discount corrects a known over-count in the server's *figure* (copies worn
     on this client that its inventory row still counts) and is orthogonal to
     whether the span also spent some. Applying it to a debited key can only
     lower the result, which is the safe direction the b362 block already
     argues for; skipping it would let an equip dupe ride in on any span that
     happened to auto-eat.

     RESIDUAL, STATED (§5.2): an item both credited AND debited inside one span
     nets to a single positive receipt entry and is treated as a credit. That
     can only under-deduct, by at most what the same span credited. It is gone
     at Phase 2.

     ⏳ RETIRES AT PHASE 2 together with the max itself — see §8. At the flip
     this whole block becomes plain absolute assignment and the debit/credit
     distinction stops existing, because the envelope will name every key it
     owns. Do not build anything new on top of it. */
  /* ══════════════════════════════════════════════════════════════════════
     PHASE 2 (b366) — THE BAG IS THE SERVER'S. §5.3, and it is the whole point
     of the phase.

     `hr_state_of` builds `inventory` by aggregating EVERY surviving
     `player_inventory` row, and `hr_apply` DELETEs a row when its quantity
     reaches zero. So the envelope's inventory map is a COMPLETE STATEMENT of
     what the player owns: a named key is the quantity, and an OMITTED key is a
     real zero rather than "unknown". That equivalence is what b359 could not
     rely on and what b366's equip verb finally makes true — the last thing the
     server did not know about a player's bag was the copy they were wearing.

     So: replace wholesale. Every faucet the merge left open closes at once —
     the consumption hole (§5.2's residual: an item both credited and debited in
     one span), the b362 equip dupe, and the forged-item survival b359 knowingly
     traded for. The b363 `unaccountedEquipped` discount is NOT applied here and
     must not be: under absolute the server's figure is already correct, and
     subtracting a worn copy from a correct figure DELETES a bag copy the player
     owns. Its own header names exactly this as the condition that retires it.

     ⚠ FAIL-CLOSED ON A MALFORMED ENVELOPE. An envelope with no readable
       `inventory` object is not a claim that the bag is empty — it is an answer
       this function could not read, and wiping a player's bag on one is the
       single most expensive mistake available here. The absolute branch is
       therefore entered ONLY when the envelope actually carries an inventory
       object; anything else falls through to the merge, which cannot delete. */
  /* THE BAG USES ITS OWN AUTHORITY FLAG, NOT the equip-armed `absolute` above.
     Gold (assigned outright) and skills (line ~974) keep `absolute`; only the
     general inventory bag consults `isInventoryAbsolute()`, which is merge today
     because no inventory-baseline signal exists. This is the P1 decoupling: the
     absolute branch is what DELETES a crafted item the server's stale, out-of-
     order craft baseline cannot yet reproduce, so the bag must not enter it
     while inventory is not truly server-owned. */
  const invAbsolute = isInventoryAbsolute();
  written.inventoryAuthority = invAbsolute;
  /* ⚠ THE PER-ENVELOPE COMPLETENESS GATE (Step 3, condition #1). Even an ARMED
     client enters the absolute branch ONLY for an envelope the server has
     certified `inventory_complete === true`. Any other envelope — one produced
     mid-craft-chain, before the settle loop drained the pointer — falls through
     to the merge below, which can only ever over-credit and NEVER deletes. This
     is what stops an incomplete, out-of-order baseline from deleting a legit
     freshly-crafted OWNED stack: absence of the flag routes to the safe branch,
     armed or not. FAIL-CLOSED — see envelopeBaselineComplete. */
  const baselineComplete = envelopeBaselineComplete(res);
  written.baselineComplete = baselineComplete;
  /* THE BANK ITEM STORE (bank-store, b438). Reconciled here — after the two arm
     gates are known and BEFORE the bag branch splits — so it rides EVERY envelope
     regardless of which return path the bag takes, and folds through the SAME
     absolute/carve-out machinery as the bag. Fully inert while dormant (invAbsolute
     is false in prod): reconcileBank leaves G.bank untouched. */
  written.bank = reconcileBank(G, res, invAbsolute, baselineComplete);
  /* THE BAG (b46x inventory-hydrate). Extracted to reconcileInventory so the
     boot hr_load settle (record.js) can hydrate the bag on an IDLE boot — where
     hr-accrue returns {accrued:false} and applyEnvelopeState never runs, the
     inventory-loss-on-idle-reload P1. ONE implementation of the merge/absolute
     rule. The prediction sweep stays HERE, with the caller, run once after the
     bag write — the load path must NOT run it (it would re-offset the gold
     applyRecord already wrote). */
  const invReceipt = reconcileInventory(G, res, invAbsolute, baselineComplete);
  if (invReceipt) {
    written.inventory = invReceipt.inventory;
    if (invReceipt.inventoryAbsolute) written.inventoryAbsolute = true;
    written.itemLedger = invReceipt.itemLedger;
  }

  /* LAST, and after the bag write, because the sweep re-adds outstanding
     predictions ON TOP of the server's numbers. Guarded: a throw in the ledger
     must not leave a half-applied envelope, and the envelope itself is already
     correct without the carry — the carry is display only. */
  if (predictionSeam) {
    try { written.predictions = predictionSeam(G, res, ownKey); }
    catch (e) { console.warn('[accrue] prediction reconcile threw:', e && e.message); }
  }
  return written;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE BAG, RECONCILED FROM AN ENVELOPE — ONE IMPLEMENTATION (b46x).

   Extracted VERBATIM from applyEnvelopeState so that record.js's boot hr_load
   settle() can hydrate the bag on an IDLE boot. Root cause of the P1: inventory
   hydration lived ONLY here, reached ONLY through applyEnvelopeState — which runs
   ONLY on `accrued:true`. On an idle boot hr-accrue answers
   {accrued:false, reason:'idle'}, so the bag was never applied and the player saw
   a stale ~3-stack remnant while the server held the full inventory. settle()
   (record.js) already rebuilds companions/farm/traits/activity from the always-
   full hr_load body for exactly this reason; inventory + bank were the omission.
   This function is now the shared apply, called from BOTH paths.

   The merge/absolute split, the b364 debit handling (consumedKeysOf), the b362
   equip-dupe discount (unaccountedEquipped), the serverOwnedItem carve-out, the
   never-delete rule and itemLedger.reconcile are all preserved EXACTLY. The ONLY
   behavioural change from the inlined version is that the prediction sweep is NOT
   run here: applyEnvelopeState runs it once after this returns, and the load path
   deliberately does not (it would re-offset the gold applyRecord already wrote).

   IDEMPOTENCY (the double-apply concern, non-idle boot). On a non-idle boot
   applyEnvelopeState still runs from the hr-accrue envelope AND settle() now runs
   this from the hr_load body:
     • MERGE (prod today): the credit path is Math.max, a one-way ratchet — max of
       maxes is idempotent. The DEBIT path keys off `res.away.items`, and an
       hr_load body carries NO `away` block, so consumedKeysOf is empty and the
       load path never deletes — it can only ratchet the full server bag UP,
       which is exactly the fix.
     • ABSOLUTE (future arm): both envelopes replace from the SAME complete server
       baseline, so the result is identical either order.
     • itemLedger.reconcile only ever REMOVES (settledBy retires, refundedBy takes
       back, clamped and floored at zero) — safe to run on both.

   Pure: takes G + res + the two arm flags, returns a receipt. invAbsolute /
   baselineComplete are OPTIONAL — computed from isInventoryAbsolute() /
   envelopeBaselineComplete(res) when a caller (settle) does not pass them. */
export function reconcileInventory(G, res, invAbsolute, baselineComplete) {
  if (!G || typeof G !== 'object') return null;
  if (typeof invAbsolute !== 'boolean') invAbsolute = isInventoryAbsolute();
  if (typeof baselineComplete !== 'boolean') baselineComplete = envelopeBaselineComplete(res);
  const written = { inventoryAuthority: invAbsolute, baselineComplete };
  const inv = (G.inventory && typeof G.inventory === 'object') ? { ...G.inventory } : {};
  const invNamed = res && res.inventory;
  if (invAbsolute && baselineComplete && invNamed && typeof invNamed === 'object' && !Array.isArray(invNamed)) {
    /* ══════════════════════════════════════════════════════════════════════
       THE SERVER-OWNED CARVE-OUT (server-authority inventory-flip, Step 2).

       The absolute replace may OWN only the ids the accrual engine settles —
       `serverOwnedItem(id)` (src/data/item-authority.js): combat drops, gather
       products, payable (non-cooking) artisan outputs. For those, the envelope
       is the truth: a named key sets the quantity and an OMITTED owned key is a
       real zero (removed) — which is exactly what closes the forgery the flip
       exists to close.

       Every OTHER id is one a LIVE, un-modeled path writes with no server
       counterpart — a cooked food, a crop harvest, a dungeon reward, a
       companion-proc bonus. The envelope omitting it is NOT a claim that it is
       zero, so the client's copy is KEPT, and a positively-named figure may only
        RAISE it, never lower it (the never-delete rule). This mirrors the
       itemLedger.reconcile carve-out precisely: the server owns its set, the
       client keeps the rest.

       ⚠ UNARMED IN PROD. `isInventoryAbsolute()` is false today (no inventory
       baseline signal calls markInventoryAuthorityLive), so this branch is
       dormant on the live path; the tests drive it directly. */
    const next = {};
    const keys = new Set(Object.keys(inv).concat(Object.keys(invNamed)));
    for (const k of keys) {
      const q = Number(invNamed[k]);
      const named = Number.isFinite(q) && q > 0;
      if (serverOwnedItem(k)) {
        /* OWNED: absolute. A readable positive figure is assigned; an omitted,
           zero or unreadable figure removes the stack (act only on certainty —
           save-invariant #2 — and the next settle restates a real one). */
        if (named) next[k] = Math.floor(q);
        continue;
      }
      /* NOT OWNED (excluded / un-modeled): never delete, never lower. Keep the
         larger of the client's copy and any positively-named server figure. */
      const have = Number(inv[k]) || 0;
      const best = Math.max(have > 0 ? Math.floor(have) : 0, named ? Math.floor(q) : 0);
      if (best > 0) next[k] = best;
    }
    G.inventory = next;
    written.inventory = Object.keys(next).length;
    written.inventoryAbsolute = true;
    /* AFTER the wholesale replace, never before. Under absolute the envelope
       deletes anything the server has not heard of — which includes a
       Quartermaster purchase, so these players were LOSING blueprints while
       merge-mode players were getting them free. Same correction, both
       branches, one call site each. */
    written.itemLedger = itemLedger.reconcile(G, res);
    return written;
  }

  const consumed = consumedKeysOf(res);
  const namedKeys = Object.keys((res && res.inventory) || {});
  const invKeys = consumed.size
    ? Array.from(new Set(namedKeys.concat(Array.from(consumed))))
    : namedKeys;
  for (const k of invKeys) {
    /* ══════════════════════════════════════════════════════════════════════
       P0 FIX (b362) — THE MAX MUST NOT RESURRECT A COPY THAT IS NOW WORN.

       REPORTED LIVE: "every time I am using the corresponding weapon type it
       gets duplicated when I equip it." One dupe per equip round trip, on
       tradeable gear.

       THE MODEL, PROVED NOT GUESSED. Both sides hold gear DISJOINTLY —
       equipped copies are NOT also counted in the bag:
         • server: hr_apply's `equip` op is a TRANSFER (2026-08-11-apply-engine
           .sql §EQUIPMENT — debits player_inventory, inserts player_equipment),
           and hr_create_character asserts no starting item is in both
           (2026-08-14-character-bootstrap.sql: "a starting item exists in BOTH
           equipment and inventory — equip/unequip would duplicate it");
         • client: equipItem/equipToSlot/applyLoadout all `removeItem(id,1)`
           and write G.equipment[slot].

       The break is that NOTHING TELLS THE SERVER ABOUT A CLIENT EQUIP — there
       is no equip verb anywhere in src/net/*. So the server's inventory row is
       a STALE view that still counts the copy the player is wearing, the client
       correctly counts 0, and the b359 max hands the stale figure back into the
       bag while the same copy sits in the slot. Item created from nothing.

       THE ACCOUNTING: only copies the client has equipped that the ENVELOPE
       does not also show equipped are unknown to the server's figure, so only
       those are subtracted. When the server agrees the item is worn (starter
       gear, or any future equip verb) its inventory figure already excludes it
       and nothing is deducted — no double subtraction.

       DIRECTION, DELIBERATE: this can only ever LOWER the server's figure, so
       the worst case is under-crediting a bag copy, which the next settle
       heals. A dupe never heals. Counted by ITEM ID, never by slot name, so
       client and server slot vocabularies cannot drift into a wrong deduction. */
    const isDebit = consumed.has(k);
    const raw = Number(((res && res.inventory) || {})[k]);
    /* A debited key the envelope omits is a REAL zero (the row was deleted).
       For every other key, an unreadable figure is still "unknown" and skipped. */
    const figure = Number.isFinite(raw) ? raw : (isDebit ? 0 : NaN);
    if (!Number.isFinite(figure)) continue;
    const q = figure - unaccountedEquipped(G, res, k);
    const have = Number(inv[k]) || 0;
    if (isDebit) {
      /* ABSOLUTE. The client's convention is that a zero row does not exist
         (legacy.js `removeItem` deletes at <= 0), and it is the server's too. */
      const next = Math.max(0, q);
      if (next > 0) inv[k] = next; else delete inv[k];
      continue;
    }
    /* MAX for a NAMED key too — and this is the clause that actually saved the
       reporting player, so do not weaken it to a plain assignment. `dragon_scale`
       WAS named (the server held 2 from away accrual); only taking the max keeps
       the 14 he earned at the keyboard.
       THE COST, STATED: an item the server legitimately CONSUMED while he was
       away (a crafting input) will not be deducted from the client copy until a
       live-write verb exists, so a determined player could double-spend that
       input. That is a bounded duplication risk in a closed beta that already
       carries forgery amnesty; it was traded knowingly against certain,
       ongoing, irreversible loss of real progress. It retires with the same
       commit that gives live play an intent verb. */
    if (Number.isFinite(q) && q > 0) inv[k] = Math.max(have, q);
  }
  G.inventory = inv;
  written.inventory = Object.keys(inv).length;

  /* THE HALF-REVERTED TRADE (2026-08-18). The `Math.max` directly above is a
     one-way ratchet, and a client-authored trade moves the bag in BOTH
     directions: the scrip the player spent is a key the envelope NAMES (so the
     max hands it straight back) while the blueprint they bought is a key the
     envelope OMITS (so "absent means unknown" keeps it). Item kept, currency
     refunded, every 90 seconds. See src/net/item-ledger.js. */
  written.itemLedger = itemLedger.reconcile(G, res);
  return written;
}

export function applyEnvelope(G, res) {
  if (!G || !isEnvelopeApplicable(res)) return null;
  /* THE ONE GATE. Refusing here writes nothing at all — the server has already
     recorded the grant against its own watermark, so the next accrual returns
     the same truth and nothing is lost by waiting for an answer. */
  const loss = describeReplacement(G, res);
  noteEnvelopeDrift(loss);
  /* b366 — DO NOT ASK A QUESTION THE ANSWER TO WHICH IS STILL BEING FETCHED.
     `G` during a device handoff is whatever loadLocal() put there — on a phone
     that has not played in a week, a stale save. Against it almost any envelope
     looks "destructive" (the desktop session SPENT gold, so local > server on
     nothing but arithmetic), so the player was shown a modal saying their
     progress would be "permanently gone" while pullAndMaybeRestore was still in
     flight with the real save. The gate is right; its ORDERING was wrong.
     Defer while the reconcile is unresolved. Refusing costs nothing — the
     server has already recorded the grant against its own watermark, so the
     next accrual returns the same truth and the gate re-evaluates then, against
     the save that actually won. Read through the global rather than an import:
     sync.js imports THIS module, so importing back would be a cycle. */
  if (loss.destructive && isReconcilePending()) {
    console.warn('[accrue] deferring the replacement decision — the cloud reconcile has not settled, '
      + 'so the local save being compared against may not be the one that wins.');
    return null;
  }
  /* ══════════════════════════════════════════════════════════════════════
     PHASE 2 (b366) — THE GATE NARROWS TO THE CASE IT WAS BUILT FOR.

     §8 says the replacement-ack sheet RETIRES at Phase 2 and should be deleted
     outright. That is right about the end state and wrong about the transition,
     and the difference matters on a live beta: under ABSOLUTE, `destructive` is
     no longer an alarm — it is the NORMAL, EXPECTED answer every time the
     client predicted a drop the server did not roll (§6's own table says so:
     "Phase 2: it disappears at the next settle"). Leaving the gate as it stands
     would put a consent modal in front of the player every 90 seconds, and the
     only way through it is to consent, so it would protect nothing while
     making the game unusable.

     Deleting it outright is the other wrong answer, because the case it was
     genuinely built for still exists and is still permanent: a COLD LOAD on a
     device whose local save is real progress, answered by a server character
     that is fresh or belongs to a different slot. That apply is not a 90-second
     prediction correcting itself; it is one save overwriting another.

     The line between them is measurable and is not a feeling: has this session
     already applied an envelope? If it has, the client and the server have
     already agreed once and every later difference is drift. If it has not,
     this is the first contact and the sheet is exactly right.

     ⏳ THE SHEET RETIRES FULLY when the client stops holding a rival copy at
     all — i.e. when `gold`/`skills`/`inventory` are on SERVER_OF_RECORD and the
     load strip deletes them, at which point `describeReplacement` is
     permanently non-destructive and this branch is unreachable. That is a
     record.js change, not this one, and it is named in the report. */
  /* ── THE CAPSTONE RETIRES THIS SHEET (blob-retire, DORMANT) ─────────────────
     The ⏳ comment above ("THE SHEET RETIRES FULLY when the client stops holding
     a rival copy at all") names exactly this: once the save blob is retired there
     is NO local authored character to be "replaced", so applying the server
     envelope IS the load, not an overwrite of a rival, and this modal is never the
     right thing to show. Gated on the one capstone flag, read off the window global
     at CALL time (cycle-avoidance, same as isReconcilePending above). While dormant
     it is false and the sheet behaves byte-for-byte as today. Deleting the sheet +
     its plumbing is a POST-ARM cleanup once proven live post-wipe. */
  let __blobRetired = false;
  try {
    __blobRetired = typeof window !== 'undefined' && window.HearthriseCapstone
      && typeof window.HearthriseCapstone.isBlobRetired === 'function'
      && window.HearthriseCapstone.isBlobRetired();
  } catch (e) { __blobRetired = false; }
  const firstContact = envelopeDrift.applied <= 1;
  if (!__blobRetired && loss.destructive && !isReplacementAcknowledged()
      && (!isEnvelopeAbsolute() || firstContact)) {
    console.warn('[accrue] REFUSING to overwrite local progress with the server character '
      + 'until the player confirms — would lose ' + loss.gold + ' gold, ' + loss.skillXp
      + ' skill XP and ' + loss.items + ' item(s). This is permanent and there is no merge.');
    showReplacementSheet(loss, G, res);
    return null;
  }
  const st = res.state || {};
  const written = applyEnvelopeState(G, res);

  /* The receipt. Shaped to the SAME contract legacy.js's local summary uses, so
     every welcome-back renderer keeps working unchanged — and every field is a
     value the SERVER stated, never one this file inferred. `serverAuthoritative`
     is the flag that lets a renderer (or a bug report) tell the two apart. */
  G.lastOfflineSummary = summaryFromAway(res.away, res);
  written.summary = true;

  /* The server owns `accrued_to`. Parking it here is what makes it visible to
     the countdown UI and to a bug report; nothing reads it as authority. */
  G._serverAccrual = {
    version: Number(res.version),
    accruedTo: st.accrued_to || null,
    serverNow: res.now || null,
    at: nowMs(),
  };
  return written;
}

/** The away receipt, translated into the shape lastOfflineSummary renderers read. */
export function summaryFromAway(away, res) {
  const a = away || {};
  const ms = Number(a.grantMs) || 0;
  const items = a.items && typeof a.items === 'object'
    ? Object.keys(a.items).reduce((s, k) => s + (Number(a.items[k]) || 0), 0) : 0;
  const xp = a.xp && typeof a.xp === 'object'
    ? Object.keys(a.xp).reduce((s, k) => s + (Number(a.xp[k]) || 0), 0) : (Number(a.xp) || 0);
  return {
    hrs: +(ms / 3600000).toFixed(1),
    awayMs: ms,
    gainedItems: items,
    gainedXp: xp,
    gainedGold: Number(a.gold) || 0,
    gainedKills: Number(a.kills) || 0,
    burnt: 0,
    combat: a.kills ? { kills: Number(a.kills) || 0, crits: Number(a.crits) || 0, died: !!a.died } : null,
    capped: !!a.capped,
    blessed: !!a.blessed,
    buffsPaused: !!a.buffsPaused,
    crits: Number(a.crits) || 0,
    featuredMs: Number(a.featuredMs) || 0,
    featuredDropMult: Number(a.featuredDropMult) || 1,
    /* Ruling 2 (b352). `awayMs` above is the CREDITED span (`grantMs`) and keeps
       that meaning; these say WHICH hours it was and how much of the absence the
       cap refused. Stated by the server, never derived here — the credited
       window is now anchored to when the player LEFT, so it no longer ends at
       the return instant and cannot be reconstructed from a duration. */
    unpaidMs: Number(a.unpaidMs) || 0,
    windowFrom: Number(a.windowFrom) || null,
    windowTo: Number(a.windowTo) || null,
    levelUps: Array.isArray(a.levelUps) ? a.levelUps : [],
    at: nowMs(),
    /* THE HONEST LABEL. A renderer, a screenshot and a bug report can all tell
       a server-stated receipt from a locally-computed one. */
    serverAuthoritative: true,
    version: Number(res && res.version) || null,
  };
}

/* ── WHAT KIND OF RECEIPT IS THIS? (b361) ──────────────────────────────────
   THE BUG, AS REPORTED: "⏳ Away 0h — the server credited +13 items, +104 XP,
   +0 gold", fired while Tyler was sitting at the keyboard watching the fight.

   The MECHANICS were right and are untouched here. Since the live-settlement
   work (b356–b360) a span settled WHILE ONLINE goes through the same
   `applyEnvelope` → `summaryFromAway` receipt as a genuine absence, because
   there is deliberately only ONE payment path and only one receipt shape
   (docs/design/live-settlement.md §0). What was wrong was the SENTENCE: the
   only thing distinguishing "you were away all night" from "we just settled
   the last ninety seconds you spent watching" was `source === 'switch'`, which
   an accrue-triggered settle does not set. So every live settle claimed an
   absence, and rounded it to "0h".

   ── THE SIGNAL, AND WHY IT IS THE CREDITED SPAN AND NOT `document.hidden` ──
   Two candidates were on the table. The credited span wins on three counts:

     1. It is SERVER-STATED. `grantMs` is the window the server actually paid
        for, arriving on the envelope. `document.hidden` is a client
        observation, and this file's whole reason for existing is that a client
        observation is not authority (see the header). A label derived from the
        server's own number cannot disagree with the number beside it.
     2. `document.hidden` IS NOT OBSERVABLE ACROSS THE CASE THAT MATTERS MOST.
        The single most common real absence is closing the tab (or the browser,
        or the laptop lid) — and a page that is not running never sees a
        `visibilitychange`. On the next boot there is no "was hidden" flag to
        read, only a fresh document that has been visible since millisecond
        zero. A visibility-based rule would therefore label the biggest, most
        important absence in the game a "sync". That is the same class of
        defect as the one being fixed, pointed the other way, and it is worse:
        under-claiming an eight-hour night is a bigger lie than over-claiming
        ninety seconds. (Rule 5's `offlineBudget.at` watermark already only
        advances while `document.hidden` is false — so the engine has a
        visibility reader; the point is that it is a *budget* input, not a
        *narration* input.)
     3. It degrades honestly. A short span that WAS a real absence — a
        four-minute walk to the kettle — gets "Synced — +N items", which is
        true of a real absence too. The converse mislabel is not: "Away 0h"
        is false of a live settle, and reads as a bug even to a player who
        cannot name what is wrong with it.

   THE THRESHOLD is 10 minutes, and it is a MAXIMUM SETTLE CADENCE plus
   headroom rather than a taste call: §3.1 recommends a 90 s settle cadence,
   §3.2 argues 90 s over 60 s, and the rate gate allows 30 accrue/min, so no
   legitimate live settle is anywhere near ten minutes wide. Ten minutes is
   also comfortably under the 0.1 h (6 min) liveness gate the Home away card
   has used since b343, so the toast and the card cannot tell different
   stories about one receipt — they now read the SAME classifier.

   DEATH OVERRIDES THE SPAN, exactly as b343 ruled for the away card: the
   absence that most needs explaining is the one that ended sixty seconds in,
   and a receipt whose paid span rounds to nothing is precisely that receipt.
   A death is never a quiet toast.

   NOTHING HERE CHANGES WHAT IS CREDITED. These are pure functions of a receipt
   that has already been written; no caller may use them to gate an apply. */

/** The widest credited span that can honestly be called a live settle. */
export const SYNC_MAX_MS = 10 * 60 * 1000;

/** Did this receipt actually move anything? Pure; totals only, no formatting. */
export function receiptCredit(summary) {
  const s = summary || {};
  const items = Number(s.gainedItems) || 0;
  const xp = Number(s.gainedXp) || 0;
  const gold = Number(s.gainedGold) || 0;
  const kills = Number(s.gainedKills) || 0;
  const levelUps = Array.isArray(s.levelUps) ? s.levelUps.length : 0;
  return { items, xp, gold, kills, levelUps, any: (items + xp + gold + kills + levelUps) > 0 };
}

/** True when the receipt names a death, whoever wrote the flag. */
export function receiptDied(summary) {
  const s = summary || {};
  return !!(s.died || (s.combat && s.combat.died));
}

/**
 * 'switch' | 'sync' | 'away' — the three genuinely different events that share
 * one receipt shape. Callers pick a sentence from this and nothing else.
 */
export function classifyReceipt(summary) {
  const s = summary || {};
  if (s.source === 'switch') return 'switch';
  if (receiptDied(s)) return 'away';
  /* `awayMs` is the credited span and is what every server receipt carries.
     `hrs` is the SAME span, rounded, and is all a receipt written by an older
     build (or by a fixture) has — so it is a fallback and never a preferred
     reading. Falling back matters: a receipt with no span at all would
     otherwise read as 0 ms and be silently downgraded to a sync, which is the
     reported bug pointed the other way. */
  const ms = Number(s.awayMs) || (Math.max(0, Number(s.hrs) || 0) * 3600000);
  return ms < SYNC_MAX_MS ? 'sync' : 'away';
}

/**
 * Should this receipt say anything at all, and if so which sentence?
 * Returns { kind, credit, announce } — `announce:false` is the zero-value
 * settle, which is the overwhelmingly common case at a 90 s cadence and must
 * be silent or the game toasts at the player every minute and a half forever.
 * A death always announces, even on a zero-value receipt: "you fell" is the
 * one piece of news that is not measured in items.
 */
export function receiptNotice(summary) {
  const kind = classifyReceipt(summary);
  const credit = receiptCredit(summary);
  const announce = credit.any || receiptDied(summary) || kind !== 'sync';
  return { kind, credit, announce };
}

/**
 * THE SENTENCE ITSELF, as a pure function — receipt (+ an optional market
 * ledger line) in, the exact toast text or null out.
 *
 * It lives here rather than inline in `applyServerEnvelope` for one reason: a
 * sentence that only exists inside a call site that needs a live envelope, a
 * live session and a live server to reach is a sentence NO TEST CAN READ, and
 * the reported bug was a sentence. Now the suite asserts the literal string,
 * and "Away 0h" cannot come back without going red.
 *
 * `spanLabel` is injected because legacy.js's `fmtSince` is the game's one
 * span formatter and this module cannot import a classic script. Callers pass
 * it; without it the switch line simply says less, which is honest degradation
 * rather than a second formatter that rounds differently.
 */
export function receiptSentence(summary, opts) {
  const o = opts || {};
  const s = summary || {};
  const n = receiptNotice(s);
  if (!n.announce) return null;
  const tail = o.saleLine ? (' · ' + o.saleLine) : '';
  const c = n.credit;
  if (n.kind === 'switch') {
    const span = (typeof o.spanLabel === 'function') ? o.spanLabel(Number(s.awayMs) || 0) : null;
    return 'Collected' + (span ? (' ' + span) : '') + ' — +' + c.gold + ' gold, +'
      + c.xp + ' XP, +' + c.items + ' items' + tail;
  }
  if (n.kind === 'sync') {
    /* QUIET, AND IT NEVER CLAIMS AN ABSENCE. Only the channels that actually
       moved are named: at a 90 s settle cadence a "+0 gold" on every toast is
       exactly the noise that made the original sentence read as a bug. */
    const parts = [];
    if (c.items > 0) parts.push('+' + c.items + ' items');
    if (c.xp > 0) parts.push('+' + c.xp + ' XP');
    if (c.gold > 0) parts.push('+' + c.gold + ' gold');
    return 'Synced' + (parts.length ? (' — ' + parts.join(', ')) : '') + tail;
  }
  return '⏰ Away ' + s.hrs + 'h — the server credited +' + c.items + ' items, +'
    + c.xp + ' XP, +' + c.gold + ' gold' + tail;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PHASE 1 — LIVE SETTLEMENT. docs/design/live-settlement.md §3, §7.
   ═══════════════════════════════════════════════════════════════════════════
   THE MODEL, IN ONE SENTENCE: away accrual and live play are the SAME
   operation at different intervals, so this adds a TRIGGER and nothing else —
   no verb, no engine, no idempotency scheme, no second concurrency model. Every
   settle below funnels into `requestAccrual`, which owns the in-flight mutex,
   the gate, the backoff and the halt. **THERE IS DELIBERATELY NO SECOND
   SCHEDULER AND NO SECOND BREAKER.** A retry policy that lived out here could
   disagree with the one in `settle()` during exactly the incident both exist
   for.

   THE CLIENT'S TIMER IS A TRIGGER, NEVER A MEASUREMENT (§7). The body is
   `{"slot":N}` and carries no timestamp; both ends of the paid span come from
   `select now()` in Postgres. A device with a clock a year fast settles at the
   wrong wall time and is paid the correct amount. `lastSettleAt` below is a
   local estimate used ONLY to avoid spending a rate budget on a span the server
   will refuse — it is never authority, and a wrong estimate costs at most one
   `below_min_span`, which is a non-event (§3.4) and loses nothing (the server
   leaves `accrued_to` alone on a refusal, so the next settle prices a wider
   span).

   ── THE TWO NUMBERS, AND WHY NEITHER MOVES ────────────────────────────────
   Security's standing rulings are honoured WITHOUT touching either: the server
   floor stays at 60 s and `hr_rate_gate` stays at 30 accrue/min. Setting the
   cadence ABOVE the floor achieves what lowering the floor was meant to
   achieve, and leaves the floor as the second line of defence against a client
   that settles in a loop. SETTLE-6 asserts both, arithmetically. */

/** The cadence (§3.1). 90 s, not 60: `setInterval` drift, a throttled tab and
 *  the previous round trip all push a 60 s timer's real span UNDER the server
 *  floor, and every one of those is a wasted invocation and a settle that
 *  silently did not happen. 90 s clears the floor by 50 % with no tuning. */
export const SETTLE_INTERVAL_MS = 90000;

/** A MIRROR of the server's `ACCRUE_MIN_MS`, and it is a mirror on purpose:
 *  this file may not change the floor, only decline to waste a call under it.
 *  ⚠ DO NOT LOWER. §3.6's event trigger wants it at 30 s; that change is one
 *  reviewed unit with Security and has NOT cleared, so the event trigger ships
 *  in its DEGRADED form below instead. */
export const ACCRUE_MIN_SPAN_MS = 60000;

/** The server's own budget, mirrored so the arithmetic is assertable. */
export const ACCRUE_RATE_PER_MIN = 30;

const SETTLE_KINDS_IDLE = 'idle';

let settleState = null;
let settleEnv = null;

export function newSettleState() {
  return {
    running: false, timer: null, wired: false,
    lastSettleAt: 0, eventAt: 0, eventKind: null,
    settles: 0, unloadSettles: 0, events: 0, lastDecision: null,
  };
}
settleState = newSettleState();

/* The environment, injectable ENTIRELY so the suite can drive a fake clock, a
   fake timer and a fake transport without a live server or a 90-second wait —
   the same reason `buildAccrueRequest` is pure. Nothing here reaches for a
   global at module scope; every default resolves at CALL time, so a page that
   loads this before `localActivityPointer` exists still works. */
function defaultSettleEnv() {
  return {
    now: nowMs,
    setTimer: (fn, ms) => (typeof setTimeout === 'function' ? setTimeout(fn, ms) : null),
    clearTimer: (h) => { if (typeof clearTimeout === 'function' && h != null) clearTimeout(h); },
    /* §3.1: "while the tab is VISIBLE". A document that does not exist (Node,
       the suite's pure blocks) counts as visible — there is nothing to hide. */
    visible: () => (typeof document === 'undefined' ? true : !document.hidden),
    /* The switch and the wiring are read THROUGH the env for the same reason
       the clock is: they are ambient module state, and a test that cannot
       control them can only assert the loop in whatever position the previous
       test happened to leave it. The defaults are the real readers, so nothing
       about production behaviour is indirected away. */
    enabled: () => isServerAccrualEnabled(),
    configured: () => !!config,
    /* legacy.js owns the pointer and publishes ONE translation of it
       (`localActivityPointer`). Read, never re-derived: a second reader of
       `G.activeMonster`/`G.activeSkill` here is a second idea of what counts as
       an activity, which is the b348 defect exactly. */
    pointer: () => {
      try {
        const f = (typeof window !== 'undefined') && window.localActivityPointer;
        return (typeof f === 'function') ? f() : null;
      } catch (e) { return null; }
    },
    request: (o) => requestAccrual(o),
    fetch: (u, i) => fetch(u, i),
  };
}

/** Test seam. `null` restores the real clock/timer/transport. */
export function setSettleEnv(env) {
  settleEnv = env ? { ...defaultSettleEnv(), ...env } : null;
  return settleEnv;
}
function env() { return settleEnv || defaultSettleEnv(); }

export function getSettleState() {
  const e = env();
  const p = e.pointer() || { kind: SETTLE_KINDS_IDLE };
  return {
    ...settleState,
    intervalMs: SETTLE_INTERVAL_MS,
    minSpanMs: ACCRUE_MIN_SPAN_MS,
    visible: !!e.visible(),
    kind: p.kind || SETTLE_KINDS_IDLE,
  };
}

/**
 * SHOULD WE SETTLE RIGHT NOW, AND IF NOT, WHEN DO WE LOOK AGAIN?
 *
 * PURE — takes the whole world as an argument and returns a verdict, so every
 * condition in §3.1 is assertable without a timer, a document or a server.
 * `waitMs` is part of the verdict rather than a constant at the call site: the
 * event trigger's whole behaviour is "come back at the earliest LEGAL instant",
 * and a caller that re-derived that would be a second copy of the rule.
 */
export function decideSettle(st, now) {
  const wait = SETTLE_INTERVAL_MS;
  if (!st || typeof st !== 'object') return { settle: false, reason: 'no-state', waitMs: wait };
  if (!st.enabled) return { settle: false, reason: 'switch-off', waitMs: wait };
  /* Not signed in / not wired yet. Keep ticking: sign-in happens mid-session
     and a loop that gave up here would never notice. */
  if (!st.configured) return { settle: false, reason: 'unconfigured', waitMs: wait };
  if (!st.visible) return { settle: false, reason: 'hidden', waitMs: wait };
  const kind = st.kind || SETTLE_KINDS_IDLE;
  if (kind === SETTLE_KINDS_IDLE) return { settle: false, reason: 'idle', waitMs: wait };

  const last = Number(st.lastSettleAt);
  /* A garbage or FUTURE watermark must not park the loop forever — the same
     posture rule 5 takes with `offlineBudget.at`. Treat it as "settle now",
     which is safe because the SERVER prices the span and simply refuses one
     that is too short. Note `0` is a LEGITIMATE watermark (a fake clock, and
     the instant of an epoch-zero boot), so the test is `>= 0`, not `> 0`. */
  const since = (Number.isFinite(last) && last >= 0 && last <= now) ? (now - last) : Infinity;

  /* §3.6 EVENT TRIGGER, DEGRADED FORM. The player SAW a rare drop or a boss
     die; the server's roll for that span should land within seconds so the
     journal makes it permanent. The undegraded version settles IMMEDIATELY,
     which needs `ACCRUE_MIN_MS` lowered — a change that has NOT cleared
     Security. So: settle at the NEXT LEGAL INSTANT, which still beats the 90 s
     interval by up to half a minute and costs nothing to ship. Firing early
     would only earn a `below_min_span` and burn a rate spend. */
  if (st.eventAt) {
    if (since >= ACCRUE_MIN_SPAN_MS) return { settle: true, reason: 'event', waitMs: wait };
    return { settle: false, reason: 'event-early', waitMs: Math.max(1, ACCRUE_MIN_SPAN_MS - since) };
  }
  if (since >= SETTLE_INTERVAL_MS) return { settle: true, reason: 'interval', waitMs: wait };
  return { settle: false, reason: 'early', waitMs: Math.max(1, SETTLE_INTERVAL_MS - since) };
}

function scheduleSettle(ms) {
  const e = env();
  if (settleState.timer != null) { e.clearTimer(settleState.timer); settleState.timer = null; }
  if (!settleState.running) return null;
  settleState.timer = e.setTimer(settleTick, Math.max(1, Math.floor(ms)));
  return settleState.timer;
}

/** ONE tick: decide, maybe fire, always re-arm. Never throws into the timer. */
export function settleTick() {
  settleState.timer = null;
  if (!settleState.running) return null;
  const e = env();
  const now = e.now();
  let p = null;
  try { p = e.pointer(); } catch (err) { p = null; }
  const d = decideSettle({
    enabled: !!e.enabled(),
    configured: !!e.configured(),
    visible: !!e.visible(),
    kind: (p && p.kind) || SETTLE_KINDS_IDLE,
    lastSettleAt: settleState.lastSettleAt,
    eventAt: settleState.eventAt,
  }, now);
  settleState.lastDecision = { ...d, at: now };
  if (d.settle) {
    /* Stamped BEFORE the request, not in its callback: a settle that is
       throttled by the gate, or that never answers, must still cost the cadence
       its interval. Stamping on success would turn an outage into a tight loop
       against the endpoint the breaker exists to protect. */
    settleState.lastSettleAt = now;
    settleState.eventAt = 0;
    settleState.eventKind = null;
    settleState.settles++;
    try {
      const r = e.request({ reason: d.reason });
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (err) { /* the breaker owns failure; the loop only owns cadence */ }
  }
  scheduleSettle(d.waitMs);
  return d;
}

/** Arm the loop. Idempotent; safe to call from every boot path.
 *
 *  ⚠ AN ALREADY-RUNNING LOOP IGNORES `opts`, INCLUDING `lastSettleAt`. That is
 *  deliberate — re-arming must never reset the cadence, or a page that called
 *  this on every wire-up would settle far more often than the interval and walk
 *  into the rate gate. It IS a sharp edge for a caller trying to backdate the
 *  watermark (it cost the author a confused ten minutes at a debugger), so:
 *  stop the loop first if you mean to re-seed it. */
export function startSettleLoop(opts) {
  const o = opts || {};
  const e = env();
  if (settleState.running) return settleState;
  settleState.running = true;
  /* Seed the watermark to NOW rather than to zero. The cold-load accrual
     (`processOffline` -> `ensureThenAccrue`) has just fired or is in flight, so
     an unseeded loop would settle a second time against a span of milliseconds
     and earn nothing but a `below_min_span` and a rate spend. */
  settleState.lastSettleAt = Number.isFinite(Number(o.lastSettleAt)) ? Number(o.lastSettleAt) : e.now();
  scheduleSettle(o.firstWaitMs != null ? o.firstWaitMs : SETTLE_INTERVAL_MS);
  return settleState;
}

export function stopSettleLoop() {
  const e = env();
  if (settleState.timer != null) { e.clearTimer(settleState.timer); settleState.timer = null; }
  settleState.running = false;
  return settleState;
}

/** Full reset — the suite's teardown, and the only way to clear the counters. */
export function resetSettleLoop() {
  stopSettleLoop();
  /* `wired` SURVIVES a reset, deliberately. The listeners are attached to
     `window`/`document` for the life of the page and there is no detach path;
     clearing the flag would let the next `wireSettleTriggers()` attach a SECOND
     set, so every suite run that reset the loop would leave the page settling
     twice on each unload. Counters and cadence reset; wiring is permanent. */
  const wired = settleState.wired;
  settleState = newSettleState();
  settleState.wired = wired;
  return settleState;
}

/**
 * §3.6 — "the player just SAW something they must not lose."
 *
 * Records that a settle is wanted as soon as one is legal, and re-arms the
 * timer so the loop looks again at that instant instead of at the next 90 s
 * boundary. The FIRST event in a window wins: three rares in one span are one
 * settle, because the span is what gets paid, not the drop.
 *
 * It records an INTENT TO SETTLE, never the drop itself. The client's roll is a
 * prediction (§6); the server rolls its own dice for the span and that roll is
 * the record. Nothing here crosses the wire.
 */
export function noteSettleEvent(kind) {
  const e = env();
  const now = e.now();
  settleState.events++;
  if (!settleState.eventAt) {
    settleState.eventAt = now;
    settleState.eventKind = kind || 'event';
    if (settleState.running) scheduleSettle(1);
  }
  return settleState.eventAt;
}

/* ── THE UNLOAD SETTLE (§3.3) ───────────────────────────────────────────────
   `navigator.sendBeacon` CANNOT SET AN `Authorization` HEADER, and index.ts's
   only identity is the bearer JWT — there is no query-parameter or body token
   path and it must never gain one. A beacon therefore arrives `not_signed_in`,
   401. `fetch(..., {keepalive:true})` carries headers, survives unload in every
   browser that ships sendBeacon, and is capped at a 64 KB body; ours is
   `{"slot":0}`. SETTLE-4 asserts the literal bytes AND that no `sendBeacon`
   call site exists anywhere in src/net.

   COST, STATED: keepalive is best-effort. A hard tab kill or an OS process kill
   loses it, and that costs the player NOTHING — the window is simply still
   unpaid and the next login's cold-load accrual pays it as away time. */
export function buildKeepaliveRequest(opts) {
  const { url, init } = buildAccrueRequest(opts);
  return { url, init: { ...init, keepalive: true } };
}

/**
 * Fire the unload settle. Returns the request it built (for the suite), or null
 * with a stated reason when it declined.
 *
 * DELIBERATELY NOT through `requestAccrual`: the document is going away, so
 * there is nobody left to apply an envelope to, and the in-flight mutex would
 * make a settle already on the wire silently swallow this one. It still CONSULTS
 * the same gate — an endpoint the breaker has backed off from does not get a
 * parting shot.
 */
export function settleOnUnload() {
  if (!isServerAccrualEnabled()) return null;
  if (!config) return null;
  const token = tokenOf();
  if (!token) return null;
  const e = env();
  const now = e.now();
  let p = null;
  try { p = e.pointer(); } catch (err) { p = null; }
  if (!p || !p.kind || p.kind === SETTLE_KINDS_IDLE) return null;
  if (!decideAccrualGate(gate, now).allow) return null;
  /* Below the server floor: the span is NOT lost (§7 — `accrued_to` is left
     alone on a refusal), so declining here trades nothing for one fewer
     guaranteed-refused invocation on the way out. */
  const last = Number(settleState.lastSettleAt) || 0;
  if (last > 0 && last <= now && (now - last) < ACCRUE_MIN_SPAN_MS) return null;
  const req = buildKeepaliveRequest({
    url: config.url, apiKey: config.apiKey, token,
    slot: resolveActiveSlot(config.slot),
  });
  try {
    const r = e.fetch(req.url, req.init);
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (err) { /* unload is best-effort by definition */ }
  settleState.lastSettleAt = now;
  settleState.unloadSettles++;
  return req;
}

/**
 * §3.5 — SETTLE BEFORE A VALUE-MOVING INTENT.
 *
 * Awaitable, unlike everything else here. A player holding 40 unpaid seconds of
 * gold who spends it will be refused `insufficient_gold` once gold is
 * server-of-record; settling first makes the server's balance the one the
 * player is looking at.
 *
 * THIS IS A CLIENT SEQUENCING RULE, NOT A REGISTRY CHANGE. `collectsFirst`
 * stays `false` on every spend verb — flipping it would make a purchase
 * CONFISCATE on a refused collect, which is a strictly worse trade.
 */
export async function settleBeforeIntent() {
  if (!isServerAccrualEnabled() || !config) return { settled: false, reason: 'unconfigured' };
  const e = env();
  const now = e.now();
  let p = null;
  try { p = e.pointer(); } catch (err) { p = null; }
  if (!p || !p.kind || p.kind === SETTLE_KINDS_IDLE) return { settled: false, reason: 'idle' };
  const last = Number(settleState.lastSettleAt) || 0;
  if (last > 0 && last <= now && (now - last) < ACCRUE_MIN_SPAN_MS) {
    return { settled: false, reason: 'below-min-span' };
  }
  settleState.lastSettleAt = now;
  settleState.settles++;
  let r = null;
  try { r = await e.request({ reason: 'intent' }); } catch (err) { r = null; }
  return { settled: true, reason: 'intent', outcome: (r && r.outcome) || null };
}

/* ── THE TRIGGERS (§3.1) ────────────────────────────────────────────────────
   Wired ONCE, guarded on `typeof window`, and every listener is a one-liner
   that delegates — the decision lives in `decideSettle` / `settleOnUnload` and
   nowhere else, so a listener cannot acquire its own idea of the rules.

   `pagehide` AND `visibilitychange`->hidden are BOTH wired because neither
   alone covers the field: iOS Safari has historically fired `pagehide` without
   a preceding `visibilitychange`, and a tab switched away (rather than closed)
   fires only the latter. Firing both is harmless — the second finds the span
   under the floor and declines. */
export function wireSettleTriggers() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (settleState.wired) return false;
  settleState.wired = true;
  const hide = () => { try { settleOnUnload(); } catch (e) {} };
  window.addEventListener('pagehide', hide);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hide(); return; }
    /* Back in front: look again NOW rather than at the end of whatever wait was
       armed while hidden, or a player who tabs away for ten minutes waits a
       further ninety seconds for a settle that was already due. */
    if (settleState.running) scheduleSettle(1);
    /* b368: and if this device is carrying a halt from an earlier session, ask
       once before we keep telling the player the server is refusing them. On a
       phone, "back in front" IS the boot most players experience. */
    try { verifyHaltedState(); } catch (e) {}
  });
  /* §3.1 reconnect. Reuses the gate/backoff — a reconnect storm cannot outpace
     the breaker, and `decideSettle` still holds the cadence floor. */
  window.addEventListener('online', () => { if (settleState.running) scheduleSettle(1); });
  return true;
}

/* ── THE HONESTY SHEET (b331's posture, not a rival modal) ──────────────────
   b331 owns "your session is broken"; b302 owns "you were signed out here".
   This owns a third, genuinely different sentence — "we could not find out what
   you earned" — and it defers to both of the others rather than drawing over
   them, exactly as b333's escalation defers to b302.

   It is DISMISSIBLE. The game is running and nothing is at risk; blocking play
   over an accrual that did not resolve would be a worse bug than the one it
   reports. And it never claims anything was credited. */
export const ACCRUE_SHEET_ID = 'hr-accrual-halted-gate';

const HALT_COPY = {
  'no-character': 'This character has no record on the progress server yet, so there is nothing for it to credit.',
  'not-signed-in': 'Your sign-in is not being accepted, so the server will not say what you earned.',
  'unreachable': 'The progress server could not be reached from this device.',
  'unavailable': 'The progress server is up but could not answer.',
  'rejected': 'The progress server refused the result and recorded it for review.',
  'malformed': 'The progress server sent an answer this build could not read.',
  'unconfigured': 'This device is not wired to the progress server.',
};

export function showAccrualHaltedSheet(outcome) {
  if (typeof document === 'undefined' || !document.body) return null;
  if (document.getElementById('hr-evicted-gate')) return null;        // b302 wins
  if (document.getElementById('hr-auth-expired-gate')) return null;   // b331 wins
  const existing = document.getElementById(ACCRUE_SHEET_ID);
  if (existing) return existing;
  const el = document.createElement('div');
  el.id = ACCRUE_SHEET_ID;
  el.setAttribute('role', 'dialog');
  el.style.cssText = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)', 'bottom:18px',
    'z-index:2147483645', 'max-width:440px', 'width:calc(100% - 24px)',
    'background:rgba(9,12,17,.96)', 'color:#f2e9d8', 'border:1px solid #d9a441',
    'border-radius:12px', 'padding:16px 18px', 'box-sizing:border-box',
    /* b353: 15px, not 14px. The suite's legibility floor is 14.5px and both of
       these sheets sat under it — invisible while they only rendered for an armed
       tester, and a real failure the moment the switch defaulted on. */
    'font:400 15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'box-shadow:0 10px 30px rgba(0,0,0,.5)',
  ].join(';');
  const why = HALT_COPY[outcome] || HALT_COPY.unreachable;
  el.innerHTML =
    '<div style="font:700 16px/1.3 system-ui,sans-serif;margin-bottom:6px">⏳ Away progress is paused</div>'
    + '<p style="margin:0 0 6px">' + why + ' <strong>Nothing has been credited for your time away</strong>, '
    + 'and this device will not guess at the numbers.</p>'
    + '<p style="margin:0 0 12px;opacity:.75">Your saved progress is untouched. Away time is credited by the '
    + 'server, so it will be there once it answers.</p>'
    + '<div style="display:flex;gap:8px">'
    + '<button id="hr-accrue-retry" style="flex:1;font:600 15px/1 system-ui,sans-serif;background:#d9a441;color:#1a130a;border:0;border-radius:8px;padding:11px 16px;cursor:pointer">Try again</button>'
    + '<button id="hr-accrue-later" style="font:500 15px/1 system-ui,sans-serif;background:transparent;color:#c9c2b4;border:1px solid #3a4154;border-radius:8px;padding:11px 14px;cursor:pointer">Not now</button>'
    + '</div>';
  document.body.appendChild(el);
  const retry = el.querySelector('#hr-accrue-retry');
  if (retry) retry.addEventListener('click', () => {
    retry.disabled = true; retry.textContent = 'Asking the server…';
    requestAccrual({ force: true }).then((r) => {
      if (r && r.outcome === 'accrued') { hideAccrualHaltedSheet(); return; }
      if (r && r.outcome === 'nothing') { hideAccrualHaltedSheet(); return; }
      retry.disabled = false; retry.textContent = 'Try again';
    });
  });
  const later = el.querySelector('#hr-accrue-later');
  if (later) later.addEventListener('click', () => hideAccrualHaltedSheet());
  return el;
}

/* ── THE REPLACEMENT SHEET (b339) ───────────────────────────────────────────
   Deliberately NOT dismissible-by-default the way the halted sheet is: the
   halted sheet reports a non-event ("nothing was credited"), this one asks for
   consent to an irreversible one. It still defers to b302/b331, because a
   player who has been evicted or signed out has a more urgent problem and two
   sheets arguing is worse than either.

   It states NUMBERS, not adjectives. "Your local progress will be replaced" is
   a sentence somebody clicks through; "1,240 gold, 3 skills and 27 items will
   be gone" is one they read. */
/* 5000000 is a number a player skims; 5,000,000 is one they read. Grouped with
   the page's locale, and never used for anything but display. */
function num(v) {
  const n = Math.round(Number(v) || 0);
  try { return n.toLocaleString(); } catch (e) { return String(n); }
}

/* `onConfirm` (b347) is how a SECOND applier gets its consent honoured. The
   hook path below re-runs `applyEnvelope`, which is the away verb's applier and
   correctly refuses an intent envelope (no `away` block) — so without this the
   activity intent's player would click "Use the server's character" and nothing
   at all would happen. One sheet, one acknowledgement key, two appliers. */
export function showReplacementSheet(loss, G, res, onConfirm) {
  if (typeof document === 'undefined' || !document.body) return null;
  if (document.getElementById('hr-evicted-gate')) return null;        // b302 wins
  if (document.getElementById('hr-auth-expired-gate')) return null;   // b331 wins
  const existing = document.getElementById(ACCRUE_REPLACE_SHEET_ID);
  if (existing) return existing;
  const l = loss || { gold: 0, skillXp: 0, items: 0 };
  const el = document.createElement('div');
  el.id = ACCRUE_REPLACE_SHEET_ID;
  el.setAttribute('role', 'dialog');
  el.style.cssText = [
    'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
    'z-index:2147483646', 'max-width:460px', 'width:calc(100% - 24px)',
    'background:rgba(9,12,17,.98)', 'color:#f2e9d8', 'border:1px solid #d9a441',
    'border-radius:12px', 'padding:18px 20px', 'box-sizing:border-box',
    /* b353: 15px, not 14px. The suite's legibility floor is 14.5px and both of
       these sheets sat under it — invisible while they only rendered for an armed
       tester, and a real failure the moment the switch defaulted on. */
    'font:400 15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'box-shadow:0 10px 40px rgba(0,0,0,.65)',
  ].join(';');
  el.innerHTML =
    '<div style="font:700 16px/1.3 system-ui,sans-serif;margin-bottom:8px">⚠️ This will replace your local progress</div>'
    + '<p style="margin:0 0 8px">Away time is now credited by the progress server, and the server keeps '
    + 'its own copy of your character. Applying it <strong>replaces what is saved on this device</strong> — '
    + 'the two are not merged.</p>'
    + '<p style="margin:0 0 8px">Compared with the server\'s character, this device is currently ahead by '
    + '<strong>' + num(l.gold) + ' gold</strong>, <strong>' + num(l.skillXp)
    + ' skill XP</strong> and <strong>' + num(l.items) + ' item(s)</strong>. '
    + 'That difference will be <strong>permanently gone</strong>.</p>'
    + '<p style="margin:0 0 12px;opacity:.75">If this is not what you expected, choose “Keep my local save”. '
    + 'Nothing is credited until you decide, and you can ask again at any time.</p>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button id="hr-accrue-replace" style="flex:1;min-width:180px;font:600 15px/1 system-ui,sans-serif;background:#d9a441;color:#1a130a;border:0;border-radius:8px;padding:11px 16px;cursor:pointer">Use the server’s character</button>'
    + '<button id="hr-accrue-keep" style="font:500 15px/1 system-ui,sans-serif;background:transparent;color:#c9c2b4;border:1px solid #3a4154;border-radius:8px;padding:11px 14px;cursor:pointer">Keep my local save</button>'
    + '</div>';
  document.body.appendChild(el);
  const go = el.querySelector('#hr-accrue-replace');
  if (go) go.addEventListener('click', () => {
    acknowledgeReplacement(true);
    hideReplacementSheet();
    /* Replay the SAME envelope the player just saw the numbers for — not a
       fresh request, whose answer could differ from what was consented to.
       Through the HOOK, so the save + repaint + receipt that legacy.js owns all
       happen exactly as they would have on the original apply. Only if nothing
       is wired does this apply the envelope itself. */
    try {
      if (typeof onConfirm === 'function') onConfirm(G, res);
      else if (typeof (hooks && hooks.onApplied) === 'function') fire('onApplied', res);
      else applyEnvelope(G, res);
    } catch (e) { console.warn('[accrue] replacement apply failed:', e && e.message); }
  });
  const keep = el.querySelector('#hr-accrue-keep');
  if (keep) keep.addEventListener('click', () => hideReplacementSheet());
  return el;
}

export function hideReplacementSheet() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(ACCRUE_REPLACE_SHEET_ID);
  if (el) el.remove();
}

export function hideAccrualHaltedSheet() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(ACCRUE_SHEET_ID);
  if (el) el.remove();
}

/**
 * b368 — VERIFY A CARRIED-OVER HALT BEFORE STANDING BEHIND IT.
 *
 * The halt is a latch, and a latch that survives the outage is a lie waiting to
 * be told. This runs on the two edges where a halt can be older than the
 * evidence for it — the app coming back to the foreground, and a cold boot that
 * restored a halted gate — and it does ONE forced request BEFORE the player is
 * shown anything. Server answers: the sheet goes (settle() removes it) and the
 * player never learns there was a question. Server refuses again: the sheet
 * stands, unchanged, because a live repeated refusal is exactly what it is for.
 *
 * It deliberately does NOT weaken the first announcement. A halt EARNED in this
 * session still raises the sheet the instant it is earned, on the third failure,
 * with no extra request — `settle()` owns that and is untouched. This only ever
 * re-examines a verdict that was reached earlier.
 *
 * Silent by construction: with `gate.halted` already true, `settle()`'s
 * announce branch cannot fire (`wasHalted` is true), so a failed re-check has to
 * re-raise the sheet itself.
 */
export async function verifyHaltedState() {
  if (!gate.halted) return { checked: false, cleared: false, reason: 'not-halted' };
  if (!isServerAccrualEnabled() || !config) return { checked: false, cleared: false, reason: 'unconfigured' };
  if (!tokenOf()) return { checked: false, cleared: false, reason: 'no-token' };
  /* Take the carried-over sheet down FOR the duration of the check. If the
     server answers, the player never sees a claim that was already false; if it
     refuses, the sheet comes straight back below. Leaving it up while we ask
     would make "silently retry first" a retry the player watches. */
  hideAccrualHaltedSheet();
  let r = null;
  try { r = await requestAccrual({ force: true }); } catch (e) { r = null; }
  const outcome = (r && r.outcome) || 'unreachable';
  if (!isAccrualFailure(outcome)) return { checked: true, cleared: true, outcome };
  showAccrualHaltedSheet(outcome);
  return { checked: true, cleared: false, outcome };
}

/* ── THE ENTRY POINT legacy.js CALLS ────────────────────────────────────────
   processOffline() returns immediately after calling this. It is async and its
   promise is deliberately NOT awaited by the caller: the game must not block a
   frame on a network round trip, and there is nothing for the caller to do with
   the answer that this module does not already do. */
export function beginServerAccrual(opts) {
  const p = requestAccrual(opts);
  p.catch(() => {});
  return p;
}

if (typeof window !== 'undefined') {
  window.HearthriseAccrual = {
    ACCRUE_KILL_KEY, ACCRUE_OFF_VALUE, ACCRUE_OUTCOMES, ACCRUE_SHEET_ID,
    ACCRUE_REPLACE_ACK_KEY, ACCRUE_REPLACE_SHEET_ID, MAX_SLOT,
    isServerAccrualEnabled, setServerAccrualEnabled, __clearAccrualOverride,
    stampAwayWatermarks, clampSlot, resolveActiveSlot, mayClientWrite,
    describeReplacement, isReplacementAcknowledged, acknowledgeReplacement, isReconcilePending,
    isEnvelopeAbsolute, ENVELOPE_MERGE_KEY, envelopeDrift, noteEnvelopeDrift,
    resetEnvelopeDrift, inventoryFlipReadiness,
    flipDriftSummary, reportFlipDrift, startFlipDriftReporter, __resetFlipDriftReport,
    isInventoryAbsolute, markInventoryAuthorityLive, isInventoryAuthorityLive,
    maybeAutoArm, isInventoryArmEnabled, __setInventoryArmEnabledForTest, __resetAutoArm,
    envelopeBaselineComplete, noteBaselineComplete, isBaselineCompleteSeen, __resetBaselineComplete,
    serverOwnedItem, serverAccruedSkill, markEquipAuthorityLive,
    equippedCount, unaccountedEquipped, consumedKeysOf,
    /* Phase 1 — live settlement (docs/design/live-settlement.md §3). */
    SETTLE_INTERVAL_MS, ACCRUE_MIN_SPAN_MS, ACCRUE_RATE_PER_MIN,
    decideSettle, settleTick, startSettleLoop, stopSettleLoop, resetSettleLoop,
    newSettleState, getSettleState, setSettleEnv, noteSettleEvent,
    buildKeepaliveRequest, settleOnUnload, settleBeforeIntent, wireSettleTriggers,
    showReplacementSheet, hideReplacementSheet,
    configureAccrual, getAccrualConfig, accrueEndpoint,
    buildAccrueRequest, classifyAccrueResponse, isEnvelopeApplicable,
    isAccrualFailure, newAccrualGate, accrualGateStep, decideAccrualGate,
    nextAccrualBackoffMs, ACCRUE_HALT_AFTER_TRIES,
    requestAccrual, beginServerAccrual, applyEnvelope, applyEnvelopeState, reconcileInventory, reconcileBank, reconcileWorkers, reconcileCompanions, reconcileFarm, reconcileTraits, reconcileCombatStyle, summaryFromAway,
    SYNC_MAX_MS, receiptCredit, receiptDied, classifyReceipt, receiptNotice, receiptSentence,
    getAccrualState, resetAccrualGate, setAccrualHooks,
    showAccrualHaltedSheet, hideAccrualHaltedSheet, verifyHaltedState,
  };
  /* Boot the low-cadence inventory-flip drift reporter. Idempotent, window-only,
     purely observational — reads the soak counters and emits a periodic aggregate
     summary through the analytics funnel so the arm-safety soak is measurable
     across the playerbase. Arms nothing. */
  try { startFlipDriftReporter(); } catch (e) {}
}
