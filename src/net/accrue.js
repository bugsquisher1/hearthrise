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
//              levelUps, events}   — the receipt, STATED by the server so
//              no renderer can invent a bonus that was not applied.
//              ⚠ `levelUps` states what the WRITE BANKED, not what the
//              simulation crossed: over an attended window the live combat-xp
//              credit has already paid the front of the span, so the settle
//              proposes only the tail. Reading it off the simulation promised
//              levels a reload then took back (fixed 2026-09-05; guarded by
//              `receiptLevelUpsGuard` in tests/accrual-engine.mjs). Render it
//              verbatim — never re-derive it from a client preview.
//
// ── WHAT ACTUALLY GATES THIS ────────────────────────────────────────────────
// ⚠ THERE IS NO SWITCH. The old kill switch (`hr:serverAccrual`) is RETIRED:
// server accrual is unconditional, `isServerAccrualEnabled()` is a constant
// `true`, and nothing in this file or any consumer forks on it — see the block
// below for what its OFF position actually did. The only remaining gate is the
// one that was always real: a deployed function, applied migrations, and a
// signed-in player. A pre-cutover server is refused rather than latched
// (B339-6); `tests/cors-preflight.mjs` C4 is the live gate for the transport,
// and `tests/no-blob-branches.mjs` fails if a fork on the retired switch ever
// returns.
//
// DOM-free except for one honesty sheet at the bottom, which is guarded on
// `typeof document` and is the ONLY thing in this file that touches the page.
// ============================================================================

/* ── THE KILL SWITCH IS RETIRED ─────────────────────────────────────────────
   `hr:serverAccrual` shipped as an operator escape hatch: the literal string
   'off' in localStorage dropped ONE device back to the pre-cutover client
   without a redeploy. Security measured what "off" actually did (2026-09-07)
   and it is not a pre-cutover client — it is a DIVERGENT SINGLE-DEVICE LOCAL
   GAME: the save blob uploads to `game_saves` again, `processOffline` computes
   away time from the device clock, gold and gems mint locally, `mayClientWrite`
   answers yes for every field, every intent goes dark, the v1 market writes
   from the client and the boot veil is off. None of it can cross into another
   player's economy (the server grants refuse a client value), so it was never
   an exploit — but it IS a client-authored fallback, and everything it "saved"
   is silently discarded the moment the key is cleared. CLAUDE.md §1 forbids
   exactly that: nothing is authored by the client, ever.

   So the switch is GONE, not defaulted-on. `isServerAccrualEnabled()` is a
   constant `true`, the localStorage key is never read, and a device that
   still has `hr:serverAccrual=off` sitting in storage from an old session
   simply boots the normal server game. `setServerAccrualEnabled` survives for
   one release as a logging no-op so a console call or an un-updated caller is
   answered honestly rather than silently doing nothing.

   Every consumer reads THIS function — `isActivityIntentEnabled`,
   `isGoldIntentEnabled`, `isCharacterIntentEnabled`, `isRecordActive`,
   `isEatIntentEnabled`, `isBlobRetired` and legacy.js's `serverAccrualActive`
   are all one-line delegations — so retiring it here retires it everywhere,
   and `tests/no-blob-branches.mjs` fails if the predicate ever regains a
   condition. */

let config = null;          // {url, apiKey, authToken, slot}

/** Always true. Kept as a function (not a const) because ~20 modules delegate
 *  to it and one definition is what made the retirement a single edit. */
export function isServerAccrualEnabled() { return true; }

/* ── THE RETIRED SETTER (b515) ──────────────────────────────────────────────
   Kept for ONE release as a logging no-op, deliberately: `setServerAccrualEnabled`
   was reachable from the console and from a handful of harnesses, and a silently
   inert setter is how a tester ends up believing they are in a state they are
   not. It says so once, then never again (a caller in a loop must not be able to
   flood the console).

   `stampAwayWatermarks` went with it. Its whole job was to stop a flip minting a
   span the other side had already paid for; with no flip there is no span to
   confiscate, and the server owns `accrued_to` in both directions. */
let retirementAnnounced = false;
export function setServerAccrualEnabled() {
  if (!retirementAnnounced) {
    retirementAnnounced = true;
    try { console.warn('[accrue] setServerAccrualEnabled: retired in b515 — server accrual is unconditional'); } catch (e) {}
  }
  return true;
}

/** Test seam, retained so callers that reset module state keep compiling. There
 *  is no override left to clear. */
export function __clearAccrualOverride() { return true; }

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
const ACCRUE_BACKOFF_BASE_MS = 5000;
const ACCRUE_BACKOFF_MAX_MS = 300000;
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

/* THE SETTLE-FIRST LATCH — false until the server has closed this session's away
   window once. While false the attended combat-XP credit must not fire: it stamps
   `combat_xp_accrued_to = now()`, arming the settle's `xpEligibleFromMs` trim over
   the whole unpaid absence (rationale + census: src/core/combat-xp-cap.js). */
let awaySettleClosed = false;
export function awaySettleDone() { return awaySettleClosed; }             // has this session's absence been paid?
export function __resetAwaySettleLatch(v) { awaySettleClosed = !!v; }     // test seam: (true) = "the boot settle already landed"

/* ── C1: A REFUSED OR LATCHED WINDOW IS OWNED BY THE SETTLE ─────────────────
   The settle-first rule makes the server refuse (`settle_first`) — or makes the
   client skip — a credit whose window the away sim is about to pay. The observed
   XP for that window therefore stays in `G._combatXpPending`, and the NEXT
   admitted flush would drain it on top of the XP the settle already paid: the
   same window credited twice on a ranked surface. So whoever learns that the
   settle owns the window drops exactly the snapshot it saw. Gains that arrive
   during the call are never captured (the live map is re-read here) and survive.
   Shared with legacy.js's flush so there is ONE subtract shape, not two. */
export function dropPendingCombatXp(snap, g) {
  if (!snap || typeof snap !== 'object') return 0;
  const G = g || (typeof window !== 'undefined' ? window.G : null);
  if (!G) return 0;
  if (!G._combatXpPending || typeof G._combatXpPending !== 'object') G._combatXpPending = {};
  let dropped = 0;
  for (const k in snap) {
    const n = Math.max(0, Math.floor(Number(snap[k]) || 0));
    if (n <= 0) continue;
    const have = Math.max(0, Number(G._combatXpPending[k]) || 0);
    const take = Math.min(have, n);
    G._combatXpPending[k] = have - take;
    dropped += take;
  }
  return dropped;
}

/* The pending map as a plain snapshot, for the skipped-flush case below. */
function snapshotPendingCombatXp() {
  const G = (typeof window !== 'undefined') ? window.G : null;
  const pend = G && G._combatXpPending;
  if (!pend || typeof pend !== 'object') return null;
  const out = {}; let any = false;
  for (const k in pend) { const n = Math.floor(Number(pend[k]) || 0); if (n > 0) { out[k] = n; any = true; } }
  return any ? out : null;
}
let haltAnnounced = false;

export function getAccrualState() {
  const now = nowMs();
  return {
    enabled: true,               // b515: the kill switch is retired; always on
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

  let skippedSnap = null;
  inFlight = (async () => {
    /* bug #5 root pt2 — CREDIT ATTENDED COMBAT XP BEFORE THE SETTLE PRICES IT.
       hr_credit_combat_xp advances combat_xp_accrued_to; the settle then reads
       that watermark and credits combat XP only for the window at/after it. If the
       settle ran FIRST it would price the attended window UNATTENDED and the
       credit would then re-pay it — a double-count on a rankable surface. Awaiting
       the flush here makes credit-before-settle a hard ordering. A no-op off the
       arm, when signed out, or with nothing pending (a cold-load / away settle).

       ⚠ NOT BEFORE THE FIRST SETTLE OF THE SESSION: on a BOOT this settle's window
       is the player's ABSENCE, which the credit has no standing to speak for, and
       flushing first stamps the watermark and trims it — see the latch above. */
    if (awaySettleClosed
        && typeof window !== 'undefined' && typeof window.hrCreditCombatXpFlush === 'function') {
      try { await window.hrCreditCombatXpFlush(true); } catch (e) {}
    } else if (!awaySettleClosed) {
      /* C1: the flush was SKIPPED because this settle's window is the unpaid
         absence. The settle is about to pay it, so the XP the client observed up
         to this moment belongs to the settle, not to a later credit. Snapshot it
         now and drop that snapshot once the server confirms it closed the window
         (`accrued`/`nothing`); a refusal drops nothing. This is the boot path,
         where no `settle_first` refusal is ever seen. */
      skippedSnap = snapshotPendingCombatXp();
    }
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

  try {
    const out = await inFlight;
    if (skippedSnap && out && (out.outcome === 'accrued' || out.outcome === 'nothing')) {
      dropPendingCombatXp(skippedSnap);
    }
    return out;
  } finally { inFlight = null; }
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
  /* The latch closes on the two verdicts that mean `accrued_to` is now: a window
     was paid, or there was none. Any other outcome leaves an away window OPEN, so
     the credit stays suppressed. Never re-opened by a later failure. */
  if (verdict.outcome === 'accrued' || verdict.outcome === 'nothing') awaySettleClosed = true;
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
   shape the retired `hr:serverAccrual` switch had — with the difference that
   kept THIS one: it selects between two SERVER-APPLIED merge semantics, not
   between the server and a client-authored local game.

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
/* THE RECOVERY LINE off the most recent envelope, in ms. 0 = up, or no server
   has stated one. SERVER TRUTH, cached for rendering — never authored here and
   never counted down. See applyEnvelopeState. */
let recoveringUntil = 0;
/* ══════════════════════════════════════════════════════════════════════════
   THE FALL, AS A QUESTION FOR THE SERVER (attended-death P0, 2026-09-06)
   ══════════════════════════════════════════════════════════════════════════
   THE MEASURED BUG. b509 made a death an INTERRUPTION with a cost — a recovery
   line, a deaths counter, a ledger row, a resume at 40%. Live on the QA account
   the whole rule held for the AWAY path and NONE of it for the attended one:
   the client fell, `stopCombat()` declared `idle`, and the server therefore
   never simulated the span the death was in. Measured after an attended death:
   `recovering_until` NULL, hp 12/12 (the old free full heal), no `deaths` row,
   no ledger row, pointer `idle` — while the sheet on screen counted down from
   1:38. A number the client invented against a ladder rung the server never
   charged, on a run the server had been told was over.

   THE RULE THIS IMPLEMENTS. A fall is not a client verdict; it is a QUESTION.
   The client stops SWINGING (it has no business predicting past a death) and
   stops NOTHING ELSE: the activity pointer survives, so the window containing
   the death stays open and the very next settle prices it with the engine that
   already handles away deaths. `simulateSpan` finds the death, stamps
   `recovering_until`, writes the `deaths` delta and the ledger row, stands the
   character up at 40% and CARRIES THE RUN ON — one death path, as AWAY-12
   requires. This module only records that the question was asked and reads the
   answer back off the envelope.

   ⚠ THE ANSWER CAN TAKE UP TO A MINUTE, AND THAT IS THE SERVER FLOOR, NOT A
     DEFECT HERE. `ACCRUE_MIN_MS` is 60 s and Security owns it (see
     ACCRUE_MIN_SPAN_MS below — "this file may not change the floor"), so a
     death 19 s into a fight cannot be priced until second 60. `noteSettleEvent`
     makes the settle happen at the earliest LEGAL instant; until it lands the
     sheet says it is asking, and states NOTHING it cannot source from an
     envelope. The alternative — rendering the client's guess — is the bug.

   ⚠ NOTHING HERE IS PERSISTED, DELIBERATELY. Recovery must not survive a
     reload as a client-held countdown (exploit R1): after a reload the only
     truth is `player_state.recovering_until`, which arrives on the next
     envelope, and a pending fall simply resolves to whatever the server says.
   ══════════════════════════════════════════════════════════════════════════ */
/* The last instant the server priced, off `state.accrued_to`. A window that
   ends at or after the fall is a window the engine has SIMULATED, so this — and
   not the presence of a recovery line — is what "the server has answered"
   means: the day's free first fall is answered with no timer at all. */
let accruedToAt = 0;
/* THE FIRST priced instant this page session ever saw — i.e. the watermark as
   it stood BEFORE this boot's settle advanced it. `accruedToAt` is useless as a
   measure of an absence for exactly that reason: by the time anything renders,
   the server has already priced the span up to now and the difference is zero.
   This one is written ONCE and never again, so "now - bootAccruedToAt" is the
   server's own statement of how long the character went unpriced. */
let bootAccruedToAt = 0;
/* The server's own death counters, off `state.deaths_today` / `deaths_lifetime`
   (hr_state_of, 2026-09-06-recovering-until.sql). Rendered, never derived: the
   client's `G.stats.deaths` is a LIFETIME tally, and `resolveDeath` reading it
   as the day's count is exactly how the live sheet came to promise a 2-minute
   rung on what the server would have charged nothing for. */
let deathsTodayCount = 0;
let deathsLifetimeCount = 0;
/* THE PENDING FALL. `at` is when the client saw itself go down (local clock,
   used only to ask "has a priced window reached it yet"); `answered` flips when
   one has; `serverDied` is the server's own statement for that window. */
let fall = { at: 0, answered: false, serverDied: false, answeredAt: 0, asks: 0, reaskAt: 0, lastAskAt: 0 };
/* The re-ask timer handle. Module-scope so `clearFall` can cancel a timer the
   fall started — the same rule the death sheet countdown follows. */
let fallTimer = null;

/** How long a pending fall may go unanswered before the client stops waiting.
 *  Twice the server floor: one whole legal settle may be missed (a throttled
 *  tab, a 429, one unreachable round trip) and the question still gets asked
 *  again before we give up. Giving up does NOT invent a death — it resolves the
 *  fall as UNCONFIRMED, which the sheet says out loud and the fight resumes on,
 *  because a client that stays paused forever on a silent server has invented a
 *  punishment nobody imposed. */
export const FALL_CONFIRM_TIMEOUT_MS = 2 * 60000;

/** THE SERVER'S OWN SCALARS, read-only and as FUNCTIONS — a caller must not be
 *  able to capture a stale number, the same rule `recoveringUntilMs` follows.
 *  Exported (not just published on window) so tests/attended-fall.mjs can drive
 *  the whole state machine headlessly. */
export function accruedToMs() { return accruedToAt; }
function bootAccruedToMs() { return bootAccruedToAt; }

/** THE ABSENCE, AS THE SERVER PRICED IT (b514).
 *
 *  The welcome-back card used to print `Date.now() - G.lastSeen` — a residue
 *  stamp this client writes for itself. Measured live on b513: it said
 *  "13h 8m" on a reload two hours after the last session, and "64h 53m" for a
 *  boot whose server receipt said `awayMs 15,934,121` (4.4h). A residue stamp
 *  is per-device, only advances on the saves that happen to run, and under §1
 *  is not authority for anything — least of all for a span the server owns.
 *
 *  Order of truth:
 *    1. the fresh away RECEIPT's credited span (`awayMs`), the same number the
 *       Home away card and `classifyReceipt` quote — one absence, one figure;
 *    2. otherwise the boot watermark: now - the first `accrued_to` this session
 *       saw, i.e. the last instant the server had priced before this boot;
 *    3. otherwise NULL — and null means the surface says nothing at all. An
 *       unknown span is never rendered as a number.
 *  @returns {number|null} milliseconds, or null when the server stated none. */
export function serverAwaySpanMs(g, now) {
  const st = g || (typeof window !== 'undefined' ? window.G : null);
  const t = Number(now) > 0 ? Number(now) : nowMs();
  const off = st && st.lastOfflineSummary;
  if (off && Number(off.at) > 0 && (t - Number(off.at)) < 30 * 60000 && Number(off.awayMs) > 0) {
    return Number(off.awayMs);
  }
  if (bootAccruedToAt > 0) return Math.max(0, t - bootAccruedToAt);
  return null;
}

/** Test seam only: drive the boot watermark from the in-page suite. Never
 *  called by game code — the watermark is written by an envelope or not at all. */
export function __setBootAccruedToForTest(ms) {
  bootAccruedToAt = Number(ms) > 0 ? Number(ms) : 0;
}
export function deathsToday() { return deathsTodayCount; }
export function deathsLifetime() { return deathsLifetimeCount; }

/** The client saw itself fall. Records the question; sends nothing. */
export function noteFall(atMs) {
  const t = Number(atMs);
  cancelFallReask();
  fall = { at: (Number.isFinite(t) && t > 0) ? t : Date.now(), answered: false, serverDied: false,
    answeredAt: 0, asks: 0, reaskAt: 0, lastAskAt: 0 };
  /* THE QUESTION IS RE-ASKED BY THE FALL, NEVER LEFT TO THE CADENCE. See
     scheduleFallReask for the measurement that forced this. */
  scheduleFallReask(nowFall());
  return fall.at;
}

/** Forget the pending fall (the player stopped the run, or it resolved). */
export function clearFall() {
  cancelFallReask();
  fall = { at: 0, answered: false, serverDied: false, answeredAt: 0, asks: 0, reaskAt: 0, lastAskAt: 0 };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE RE-ASK, AND WHY THE FALL MUST OWN IT (P1, measured live on b511)
   ══════════════════════════════════════════════════════════════════════════
   MEASURED: QA account, 16:25 UTC 2026-09-06. The client fell 12 s into a
   `combat/dark_wizard` run. The forced settle that fired AT the fall was inside
   the 60 s server floor and came back `{ok:true, accrued:false,
   reason:'below_min_span'}` — no envelope, so `accruedToAt` never reached
   `fall.at` and `noteFallAnswer` had nothing to read. Ninety-four seconds later
   the state was byte-identical: phase `pending`, `answered:false`, the sheet
   still reading "Asking the hearth how long you are down…", the swing gate
   still shut, the bar still "Fighting Dark Wizard". The run was frozen behind a
   sheet waiting on an answer nothing had asked for a second time.

   THE ROOT CAUSE IS AN ABSENCE OF OWNERSHIP. `noteFall` recorded the question
   and then handed the ASKING to the generic settle cadence — a loop that
   legitimately declines to run for reasons that have nothing to do with a fall:
   the tab is hidden, the loop was never started on this boot, the pointer read
   idle for a tick, or a `below_min_span` refusal re-stamped `lastSettleAt` and
   pushed the next interval out past the ceiling. Every one of those is correct
   for a settle and fatal for a fall, because a fall is the one state a player
   cannot leave without an answer. An `accrued:false` reply is NOT an answer,
   and treating the absence of a re-request as "we already asked" is the freeze.

   SO THE FALL SCHEDULES ITS OWN RE-ASK, at the earliest LEGAL instant
   (`fall.at + ACCRUE_MIN_SPAN_MS + FALL_REASK_MARGIN_MS` — the floor is
   Security's and this file may not lower it), and again one floor later if that
   answer still does not cover the fall. It stops on the first covering answer
   and at `FALL_CONFIRM_TIMEOUT_MS`, so a silent server costs at most two extra
   invocations against a 30/min budget — never a loop.

   IT INVENTS NOTHING. The re-ask puts the SAME request on the wire the cadence
   would have put there; every number still arrives on an envelope. */
export const FALL_REASK_MARGIN_MS = 2000;

function nowFall() { try { return env().now(); } catch (e) { return Date.now(); } }

function cancelFallReask() {
  if (fallTimer == null) return;
  try { env().clearTimer(fallTimer); } catch (e) {}
  fallTimer = null;
}

/** When may the next re-ask legally go out? PURE, and exported, so the suite
 *  asserts the arithmetic rather than the behaviour of a timer. */
export function nextFallReaskAt(fallAt, lastAskAt, now) {
  const f = Number(fallAt) || 0;
  const legalAfterFall = f + ACCRUE_MIN_SPAN_MS + FALL_REASK_MARGIN_MS;
  const legalAfterAsk = (Number(lastAskAt) || 0) + ACCRUE_MIN_SPAN_MS + FALL_REASK_MARGIN_MS;
  return Math.max(legalAfterFall, legalAfterAsk, (Number(now) || 0) + 1);
}

function scheduleFallReask(now) {
  cancelFallReask();
  if (!fall.at || fall.answered) return 0;
  const at = nextFallReaskAt(fall.at, fall.lastAskAt, now);
  /* THE CEILING. Past it `fallState` already answers `unconfirmed` — the run
     resumes and the sheet says the hearth never confirmed the fall — so asking
     again would be asking on nobody's behalf. */
  if (at - fall.at >= FALL_CONFIRM_TIMEOUT_MS) {
    /* One last wake-up AT the ceiling, so leaving `pending` is an EVENT rather
       than something a poller happens to notice: the sheet re-renders and the
       swing gate opens even on a surface that is not polling. */
    fall.reaskAt = 0;
    const wait = Math.max(1, (fall.at + FALL_CONFIRM_TIMEOUT_MS) - now);
    try { fallTimer = env().setTimer(fallCeilingTick, wait); } catch (err) { fallTimer = null; }
    return 0;
  }
  fall.reaskAt = at;
  try { fallTimer = env().setTimer(fallReaskTick, Math.max(1, at - now)); } catch (e) { fallTimer = null; }
  return at;
}

/** DIAGNOSTIC / TEST SEAM: when the next re-ask is due (0 = none pending). */
export function fallReaskAt() { return fall.reaskAt || 0; }

function fallReaskTick() {
  fallTimer = null;
  if (!fall.at || fall.answered) return null;
  const e = env();
  const now = e.now();
  fall.asks++;
  fall.lastAskAt = now;
  fall.reaskAt = 0;
  /* Through the SAME event trigger the fall used the first time, so the cadence
     loop and the re-ask cannot hold two ideas of when a settle is due. */
  try { noteSettleEvent('fall-reask'); } catch (err) {}
  try {
    const r = e.request({ reason: 'fall-reask' });
    if (r && typeof r.then === 'function') {
      r.then(() => scheduleFallReask(e.now()), () => scheduleFallReask(e.now()));
    } else scheduleFallReask(e.now());
  } catch (err) { scheduleFallReask(e.now()); }
  return fall.lastAskAt;
}

function fallCeilingTick() {
  fallTimer = null;
  if (!fall.at || fall.answered) return null;
  /* NOTHING IS DECIDED HERE. `fallState` reads the ceiling off the clock and
     answers `unconfirmed` by itself; this only makes the surfaces look. */
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function'
        && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('hearthrise:fall', { detail: fallState() }));
    }
  } catch (e) {}
  return null;
}

/**
 * WHERE THE CHARACTER STANDS, from server-stated facts only. PURE given the
 * module's observations, so the suite can drive every phase without a server.
 *
 *   up          nothing is pending and no line is running.
 *   pending     the client fell and no priced window has reached that instant.
 *   recovering  the server stated a line and it has not passed.
 *   down-free   the server priced the window and DID see the fall, with no
 *               timer — the day's first fall, or a rung that already elapsed.
 *   unconfirmed the server priced the window and saw NO death in it (a
 *               divergence between the client's dice and the server's), or it
 *               never answered in time. The run carries on and the sheet says
 *               so rather than inventing a knockout.
 */
export function fallState(nowArg) {
  const now = Number.isFinite(Number(nowArg)) ? Number(nowArg) : Date.now();
  const until = recoveringUntil;
  if (until > now) {
    return { phase: 'recovering', until, msLeft: until - now, fellAt: fall.at,
      answered: true, serverDied: true, deathsToday: deathsTodayCount, deathsLifetime: deathsLifetimeCount };
  }
  if (!fall.at) {
    return { phase: 'up', until: 0, msLeft: 0, fellAt: 0, answered: false, serverDied: false,
      deathsToday: deathsTodayCount, deathsLifetime: deathsLifetimeCount };
  }
  if (fall.answered) {
    return { phase: fall.serverDied ? 'down-free' : 'unconfirmed', until: 0, msLeft: 0,
      fellAt: fall.at, answered: true, serverDied: fall.serverDied, deathsToday: deathsTodayCount, deathsLifetime: deathsLifetimeCount };
  }
  if (now - fall.at >= FALL_CONFIRM_TIMEOUT_MS) {
    return { phase: 'unconfirmed', until: 0, msLeft: 0, fellAt: fall.at, answered: false,
      serverDied: false, timedOut: true, deathsToday: deathsTodayCount, deathsLifetime: deathsLifetimeCount };
  }
  return { phase: 'pending', until: 0, msLeft: 0, fellAt: fall.at, answered: false,
    serverDied: false, deathsToday: deathsTodayCount, deathsLifetime: deathsLifetimeCount };
}

/** Is the character off their feet right now — the one question the live combat
 *  tick asks before it swings. `pending` counts: the client has seen itself go
 *  down and has no business predicting the next swing until the server has
 *  priced the window it fell in. */
export function isKnockedOut(nowArg) {
  const p = fallState(nowArg).phase;
  return p === 'pending' || p === 'recovering';
}

/** Observe a priced window off an arriving envelope. Called by
 *  applyEnvelopeState — every envelope, away or not — so there is ONE reader of
 *  the server's answer and no second idea of when a fall has been settled. */
function noteFallAnswer(res) {
  if (!fall.at || fall.answered) return;
  if (!(accruedToAt >= fall.at)) return;
  const away = (res && res.away && typeof res.away === 'object') ? res.away : null;
  /* THE SERVER'S OWN STATEMENT, in the order of how directly it says it:
     a running recovery line, then the away receipt's death fields. Never
     inferred from hp — a 40% hp reading is also what a heal looks like. */
  const died = recoveringUntil > 0
    || !!(away && (away.died === true || Number(away.deaths) > 0));
  fall = { at: fall.at, answered: true, serverDied: died, answeredAt: Date.now(),
    asks: fall.asks, reaskAt: 0, lastAskAt: fall.lastAskAt };
  /* ANSWERED ⇒ STOP ASKING. Both outcomes end the wait: a death puts the
     server's recovery line on screen, and NO death in a priced window that
     COVERS the fall resolves to `unconfirmed`, which stands the player up on
     the server's own hp and un-gates the tick. */
  cancelFallReask();
}
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
import * as itemLedger from './item-ledger.js?v=542';

/* THE SERVER-OWNED-ITEM PREDICATE (server-authority inventory-flip, Step 2).
   A pure data-derived leaf like item-ledger.js — no cycle to dodge, so a direct
   import. It answers "may the absolute envelope OWN this id?"; a false id is one
   a live, un-modeled path writes (cooked food, crop, dungeon reward, companion
   proc) and the absolute branch below leaves the client's copy of it intact. */
import { serverOwnedItem, serverConsumedItem, rebuildItemAuthority, flipArmBlockers, INVENTORY_ARM_ENABLED } from '../data/item-authority.js?v=542';

/* THE SERVER-ACCRUED-SKILL PREDICATE (P0 — client-only skills must not be
   dragged DOWN by the absolute reconcile). Same shape and same reasoning as
   serverOwnedItem above: a pure data-derived leaf, direct import, answering
   "may the absolute envelope OWN this skill's xp?". A false id — farming,
   cooking, or any skill with no server accrual path — follows Math.max below
   (can only rise) instead of the absolute assign, so the server's FROZEN xp for
   an un-modeled skill can never reduce the client's real progress. */
import { serverAccruedSkill } from '../data/skill-authority.js?v=542';

/* WHAT THE CLIENT HAS SPENT AND THE SERVER HAS NOT AGREED TO YET (LIVE P0,
   "food eaten in combat gets restocked"). Another pure leaf that imports
   nothing, so a direct import like item-ledger.js above — and for the same
   reason: a correction that prevents an item DUPE must not have an
   "unregistered, therefore silently inert" failure mode. `reconcileInventory`
   folds these holds OUT of the envelope's figures before either branch reads
   one; see the module header for why the max/assign restocks by construction.

   ⚠ THE INVENTORY TWIN OF THE b487 SKILLS FOLD-BACK directly below the skills
   branch: same class ("a server reconcile stomps state the client has observed
   but the server has not yet settled"), same shape (a scratch, session-only
   record of what is in flight, folded through the reconcile, drained on
   evidence). Kept as a separate module rather than merged with the XP buffer
   because the XP buffer is ADDITIVE and drains on the flush's own receipt,
   while this is SUBTRACTIVE and drains on the server's figure moving — one file
   holding both rules would have to state which one it was obeying per call. */
import * as pendingConsume from './pending-consume.js?v=542';
/* The style catalogue's DEFAULTS — the same object the picker, the XP router and
   the server-side accrual engine all read (src/core/styles.js). Imported rather
   than restated so `reconcileCombatStyle`'s back-fill filter can never disagree
   with what `resolveStyle` treats as "unchosen"; two copies of that fact is the
   b222 shape this repo has already paid for once. */
import { DEFAULT_STYLE_KEYS } from '../core/styles.js?v=542';
/* b492 — the property/worker rung OBSERVER. A static import rather than a window
   hop so the observation is exercised in Node by the suite exactly as it runs in
   the browser; property-record.js imports NOTHING, so there is no cycle. */
import { notePropertyUnlocks, pickBankRung, isCompleteProgressStatement } from './property-record.js?v=542';
/* b313 rev.2 — the companion XP CURVE, for the level-up detector below. The
   pure core copy (src/core/companion-perk.js), not the feature module's twin:
   companions.js imports the event bus and reaches for window, and this file is
   driven headlessly by the suite. The two curves are pinned equal to each other
   by tests/perk-channel.mjs, so reading the level here can never disagree with
   the level the doll and getCompanionBonus read. */
import { companionLevelFromXp } from '../core/companion-perk.js?v=542';

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

/* ── THE PURCHASED BANK RUNGS, RESTORED FROM SERVER TRUTH (SA-010) ───────────
   THE LIVE P1 THIS CLOSES ("bank space purchases are forgotten on reload"). The
   bank CAP was computed client-side from these counters then (it is the realm's
   own `bank_cap` now — noteServerBankCap below), and `G.bank.goldBuys` was homed
   by NOTHING: `bank` is not a record field and not a RESIDUE_FIELD, so under the
   allowlist persistence every purchased rung vanished on reload — the cap
   snapped back to 100, "Bank full" nagged with paid space unused, and each press
   of Buy answered "That bank space is already yours" (hr_unlock_buy
   `already_owned`, because the client was asking for a rung the server had
   already sold it) once per owned rung. reconcileBank above deliberately CARRIES
   the three counters through untouched — carrying through is not restoring, and
   nothing restored them.

   THE SERVER ALREADY SENDS THE ANSWER; THIS IS THE MISSING READER. hr_unlock_buy
   files a bank purchase as a permanent `player_progress` row
   `kind='unlock' key='bank' value=<rungs owned>` (GREATEST-merged, ladder-ordered,
   30-rung ceiling enforced in SQL), and hr_state_of projects every permanent
   progress row in the top-level `progress` array that rides EVERY envelope — the
   boot hr_load body and every settle. So no migration and no new projection: the
   same wire the property tier and the crew rung already come home on.

   ⚠ SERVER TRUTH IN **BOTH** DIRECTIONS, under the b502 rule, and it is the same
   class the property deadlock was: a client-held number gating a SERVER-OWNED
   capability may cache a server value, never out-rank one. A client sitting
   ABOVE the server (the pre-b500 optimistic `goldBuys++` whose refusal was
   swallowed) asks for a rung the server refuses `rung_order` — a bank that can
   never be expanded again — so a raise-only heal would preserve that lie
   forever. Hence:
     · COMPLETE statement (`progress_truncated === false`) → the server's rung IS
       the count, up or down;
     · TRUNCATED / undeclared → a FLOOR: it may raise, never lower (an absent row
       proves nothing when the server admits the window clipped);
     · UNKNOWN (no `progress` array at all — a lean/legacy/malformed body) →
       G.bank is left exactly alone. Absence is not a claim of zero.

   ONLY `goldBuys` IS SERVER-STATED. `gemBuys` has no server verb (the gem path
   refuses under the armed gems record — legacy.js buyBankSpaceGem) and
   `grandfather` is a pre-cutover blob migration; both are left untouched here,
   and neither can be restored by a reader because there is no row to read. When
   a gem rung gets a server ladder it becomes one more `pickBankRung`-shaped read,
   not a second mechanism.

   ⚠ THE RUNG IS NOT THE CAP — see noteServerBankCap directly below, which is why
   this reader alone did NOT close the residue-ahead half. The cap the game
   enforces is `player_state.bank_cap`, and the client re-derived its own from
   three client-held counters instead of mirroring it.

   Pure: takes G + res, returns a small receipt, so the suite and the arm-homing
   guard drive it without a live window. */
export function reconcileBankRungs(G, res) {
  if (!G || typeof G !== 'object') return null;
  /* THE CAP FIRST, and deliberately ABOVE the UNKNOWN-rung return: `state` and
     `progress` are two independent halves of the same body, and a body that
     states the cap while carrying no `progress` array (a lean verb answer) still
     states the cap. */
  const cap = noteServerBankCap(G, res);
  const rung = pickBankRung(res);
  if (rung === null) return { mode: 'absent', cap };     // UNKNOWN — leave G.bank alone
  const cur0 = Number(G.bank && G.bank.goldBuys);
  const cur = (Number.isFinite(cur0) && cur0 > 0) ? Math.floor(cur0) : 0;
  const complete = isCompleteProgressStatement(res);
  const next = complete ? rung : Math.max(cur, rung);
  if (next !== cur) {
    if (!G.bank || typeof G.bank !== 'object') G.bank = {};
    G.bank.goldBuys = next;
  }
  return { mode: 'server', rungs: next, from: cur, exact: complete, lowered: next < cur, cap };
}

/* ── THE ENFORCED BANK CAP IS THE SERVER'S NUMBER, NOT THE CLIENT'S SUM ───────
   THE RESIDUE-AHEAD HALF SA-010 LEFT OPEN (the census). `bankCap()` (legacy.js)
   used to compute the bag's capacity itself —
   `BASE_CAP + goldBuys*20 + gemBuys*60 + grandfather` — three CLIENT-HELD
   counters gating a SERVER capability, which is CLAUDE.md §6's residue-ahead
   class verbatim. Only `goldBuys` has a server statement (above); `gemBuys` and
   `grandfather` have none and were conformed by NOTHING, so anything that ever
   put a number in them held it for the whole session.

   AND IT HURTS IN BOTH DIRECTIONS, which is why a raise-only heal is not enough:
     · CLIENT ABOVE SERVER — `hr_apply` refuses the WHOLE delta `bank_full` the
       moment the stacks pass `player_state.bank_cap` (2026-08-11-apply-engine
       §bank_full). A bag the client draws and the server refuses does not lose
       one item; it kills every loot, gather, craft and shop buy in that apply.
     · SERVER ABOVE CLIENT — `bank_cap` is RAISE-ONLY server-side and both the
       pre-cutover grandfather and the cutover importer mint caps ABOVE the gold
       ladder (tests/bank-cap-rungs.mjs B4 pins that). No sum of the client's
       counters reproduces one, so those players were nagged "Bank full" and had
       new stacks refused locally on space the realm was holding open.

   ONE NUMBER, THE ENFORCED ONE. `hr_state_of` projects `state.bank_cap` — the
   very column `hr_apply` checks — on every envelope (asserted on the chain:
   2026-08-17-cutover-import.sql refuses to install against an hr_state_of whose
   body lacks `bank_cap`; tests/bank-cap-rungs.mjs B2 asserts projected ==
   enforced on a replayed chain). Mirroring it is the whole fix: the rungs go on
   pricing the next purchase (`bankGoldCost`, offer `bank.<goldBuys>`) and stop
   being an arithmetic second opinion about how much space the player owns.
   `_`-PREFIXED ON PURPOSE — scratch, never persisted (§6), the `_heroSlots`
   shape; a cap that survived a reload in a client-held field would be this bug
   wearing the fix's clothes.
   THE THREE ANSWERS: STATED (`state.bank_cap` finite > 0) → that IS the cap, up
   or down, and the client never argues. ABSENT from a body carrying other things
   → the last STATEMENT stands (absence is not a claim, as for the rung above).
   NEVER STATED this session → `bankCap()` answers the BASE cap, not the
   counters: the fail-safe of "not unlocked", and byte-identical to a
   post-cutover cold boot, where `G.bank` starts {0,0,0} homed by nothing. */
function noteServerBankCap(G, res) {
  const held = Number(G._bankCap);
  const last = (Number.isFinite(held) && held > 0) ? Math.floor(held) : null;
  const st = (res && typeof res === 'object' && res.state) || null;
  if (!st || typeof st !== 'object') return last;
  const n = Number(st.bank_cap);
  if (!Number.isFinite(n) || n <= 0) return last;
  G._bankCap = Math.floor(n);
  return G._bankCap;
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
export function reconcileCompanions(G, res) {
  if (!G || typeof G !== 'object') return null;
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
  /* ── b313 rev.2 — THE LEVEL-UP REPAINT LIVES ON THE RECONCILE NOW ──────────
     paione's original report was "companion stats mismatch": the equipment
     doll's Companion pane is only rebuilt when the doll is, so a pet that
     LEVELLED UP kept showing the old level while inventory and combat — which
     read the live bonus on every call — already showed the higher numbers. The
     original fix hung a refreshAllDolls() off the client-side level-up inside
     `companions.js awardCompanionXp`. That function is gated off for every
     caller (companion XP is a server-owned aggregate), so the repaint became
     unreachable while the LEVEL kept arriving — here, in the envelope.

     So the detector is here, where the level actually changes, and it reads
     ONLY envelope values: the previous MIRROR (what the last envelope stated)
     versus the incoming one. The client authors nothing; it notices.

     NO PRIOR STATEMENT, NO NOTICE. An id with no finite xp cell in the previous
     mirror is a first sight — the boot hydration, or a pet that just joined the
     roster — and announcing a "level-up" for it would throw a party on every
     reload. Two levels crossed in one envelope are ONE event naming the level
     the player is now, because that is the number the doll will show. */
  const prevXp = (G.companions && G.companions.xp && typeof G.companions.xp === 'object'
                  && !Array.isArray(G.companions.xp)) ? G.companions.xp : null;
  const leveled = [];
  if (prevXp) {
    for (const id of owned) {
      const p = Number(prevXp[id]);
      if (!Number.isFinite(p)) continue;
      const from = companionLevelFromXp(p);
      const to = companionLevelFromXp(xp[id]);
      if (to > from) leveled.push({ id, from, to });
    }
  }
  G.companions = { ownedIds: Array.from(owned), xp, equipped };
  if (leveled.length) announceCompanionLevelUps(leveled);
  return { mode: 'server', owned: owned.size, equipped, leveled };
}

/* The b313 sentence, fired from the reconcile: the same two repaints and the
   same `companionLevelUp` event `awardCompanionXp` used to fire, no more. Every
   hop is window-guarded and try//caught so a headless driver (and a renderer
   that throws) can never break the reconcile that just wrote server truth — the
   roster is already committed to G before this runs. ONE doll refresh and ONE
   stable repaint for the whole envelope, however many pets levelled. */
function announceCompanionLevelUps(leveled) {
  const w = (typeof window !== 'undefined') ? window : null;
  if (!w) return;
  for (const ev of leveled) {
    try {
      if (w.HearthriseEvents && typeof w.HearthriseEvents.emit === 'function') {
        w.HearthriseEvents.emit('companionLevelUp', { id: ev.id, level: ev.to, from: ev.from, source: 'server' });
      }
    } catch (e) {}
  }
  try { if (typeof w.refreshAllDolls === 'function') w.refreshAllDolls(); } catch (e) {}
  try { if (typeof w.renderStable === 'function' && w.activeTab === 'stable') w.renderStable(); } catch (e) {}
}

/* ── THE OWNED PERMANENT TRAITS, HYDRATED FROM THE ENVELOPE ───────────────────
   hr_trait_buy (supabase/migrations/2026-08-23-trait-buy.sql) is the server-side
   writer of a trait: it debits the server-owned Bounty-Marks balance and writes
   a player_progress kind='flag' key='trait:<id>' row — the same row
   hr_auto_eat_tier reads to decide the auto-eat ceiling. hr_state_of projects
   that set as a flat top-level `traits` array, and THIS is what puts it into
   G.traits so a purchase survives a device change without the save blob.

   ⚠ A MIRROR, BOTH DIRECTIONS. THIS USED TO BE A UNION, AND THE UNION
     WAS THE ENGINE OF THE RESIDUE-AHEAD CLASS (CLAUDE.md §6).
   It could once only ever ADD, and the rationale was
   grandfathering: at the time there were live players who had bought Auto-Eat
   BEFORE hr_trait_buy existed and held `G.traits.auto_eat === true` locally
   with no server row, and an absolute assignment would have revoked a paid
   trait from every one of them. That population no longer exists — the cutover
   is complete and the beta was wiped (CLAUDE.md §1: no back-compat, no
   client-authored fallbacks) — and the rule outlived its reason with teeth:
   union-only means a trait the server NEVER SOLD outlives the server forever.
   A stale residue, a suite leak, a refused purchase painted optimistically or
   a devtools poke writes `G.traits.<id>`, and from then on every client gate
   that asks "do you own this" (settings-page.js:500 the threshold slider,
   auto-actions.js:665/841 the auto-eat engine, death-sheet.js:850,
   render/shop.js:334, legacy.js hasTrait) answers YES for a capability the
   server will refuse. That is the auto-eat threshold lie and the 2026-09-04
   property-tier deadlock (Paione: "rooms still not built") in one shape: a
   client-held flag gating a server capability.

   SO: THE SERVER'S ARRAY IS THE SET, in both directions —
     · a server-owned trait appears on every device (unchanged, the feature);
     · a trait the projection does NOT name is REMOVED — fail-safe "not owned";
     · except an id with a purchase IN FLIGHT (`G._traitBuying[id]`, the scratch
       marker legacy.js buyTrait already keeps so a double tap cannot spend two
       intent keys). An optimistic paint holds its trait only until the server
       answers; it is never a second source of truth. That is the existing
       optimistic/answer seam, not a new one.

   THIS IS SAFE ONLY BECAUSE THE PROJECTION IS COMPLETE, and the migration says
   so in its own words: 2026-08-23-trait-buy.sql builds `traits` UNFILTERED
   (deliberately not through the LIMIT-ed `progress` array, "an entitlement must
   never be truncated into 'you own nothing'") and documents `[]` as a valid
   KNOWN state — a fresh character owns no traits. hr-accrue spreads that same
   hr_state_of jsonb at the top level of every envelope (functions/hr-accrue/
   envelope.js `...env`), so there is no lean/partial shape carrying a truncated
   `traits`, which is why this needs no `{authoritative:true}` flag the way
   reconcileFarm does.

   FAIL-CLOSED on absence: no readable `res.traits` ARRAY → leave G.traits
   untouched. A server build predating the projection, or a partial we cannot
   trust, must not be read as "you own nothing" — never evict on uncertainty
   (CLAUDE.md §6). Absence is the ONLY case that changes nothing now.

   NOT arm-gated: the projection is the entitlement on every build that has it.
   Pure — takes G + res, returns a small receipt, so the suite drives it without
   a window. */
export function reconcileTraits(G, res) {
  if (!G || typeof G !== 'object') return null;
  const t = res && res.traits;
  if (!Array.isArray(t)) return { mode: 'absent' };
  if (!G.traits || typeof G.traits !== 'object') G.traits = {};
  const server = new Set();
  for (const id of t) { if (typeof id === 'string' && id) server.add(id); }
  let added = 0;
  for (const id of server) {
    if (G.traits[id] !== true) { G.traits[id] = true; added++; }
  }
  /* THE OTHER DIRECTION — the half the union never had. */
  const flying = (G._traitBuying && typeof G._traitBuying === 'object') ? G._traitBuying : null;
  let removed = 0, held = 0;
  for (const id of Object.keys(G.traits)) {
    if (server.has(id)) continue;
    if (flying && flying[id] && G.traits[id]) { held++; continue; }
    delete G.traits[id];
    removed++;
  }
  return { mode: 'server', owned: server.size, added, removed, held };
}

/* ── THE OWNED HERO SLOTS, HYDRATED FROM THE ENVELOPE ─────────────────────────
   hr_buy_hero_slot (supabase/migrations/2026-09-08-hero-slot-buy.sql) is the
   server-side writer of a hero slot: it debits the server-owned GEM balance on
   the calling character and writes a player_progress kind='flag'
   key='character_slot:<n>' row on the ACCOUNT's canonical row. hr_state_of
   projects the account's owned set as a flat top-level `hero_slots` array, and
   THIS is what puts it where multi-character.js can read it.

   ⚠ IT DOES NOT WRITE `G.heroSlotsUnlocked`, AND THAT IS THE WHOLE POINT.
   That field is the RESIDUE — a self-authored count a cloud restore can rewind
   while the entitlement it paid for stays granted, which IS the b371 gem dupe.
   If the server's answer were merged into it the two would become
   indistinguishable, and the client could no longer tell "the server says you
   own this" from "a local field says so". So the server's answer lands in its
   OWN `_`-prefixed scratch key, which:
     · is never synced (the snapshot denylist skips `_` prefixes) and never
       persisted, so it cannot outlive the connection that produced it — exactly
       right for a projection;
     · is ABSENT on a cold boot, which is what lets multi-character.js render an
       honest "checking…" state instead of a lit Buy button that dead-ends. A
       button that is lit before we know anything is the defect this closes.

   FAIL-CLOSED on absence: no readable `res.hero_slots` ARRAY → leave the scratch
   key exactly as it was. A server build predating the projection, or a partial
   we cannot trust, must not be read as "you own nothing" — that would evict a
   player from a hero they are standing in.

   ABSOLUTE, NOT A UNION — the one way this differs from reconcileTraits. The
   server's set ALREADY INCLUDES every grandfathered character (hr_hero_slots_of
   counts an existing player_state row as ownership), so there is no
   pre-migration population to protect, and a union could only keep a forged
   local claim alive. reconcileTraits unions because a trait bought before its
   verb existed has no server row; a hero slot bought before this verb existed
   HAS one — in the form of the character sitting in it.

   NOT arm-gated: writing a scratch key nothing else reads is a no-op on a build
   whose multi-character.js has not been updated. Pure — takes G + res, returns a
   small receipt, so the suite drives it without a window. */
export function reconcileHeroSlots(G, res) {
  if (!G || typeof G !== 'object') return null;
  const h = res && res.hero_slots;
  if (!Array.isArray(h)) return { mode: 'absent' };
  const owned = [];
  for (const n of h) {
    const v = Number(n);
    if (Number.isInteger(v) && v >= 0 && v < 16 && !owned.includes(v)) owned.push(v);
  }
  /* Slot 0 is free and every account has it. A projection that somehow arrived
     without it is a partial, not an eviction — the player is playing SOMETHING. */
  if (!owned.includes(0)) owned.push(0);
  owned.sort((a, b) => a - b);
  G._heroSlots = { owned, at: Date.now() };
  return { mode: 'server', owned: owned.length };
}

/* ── THE DUNGEON RE-ENTRY WINDOWS ARE THE SERVER'S ───────────────────────────
   hr_dungeon_settle refuses an early re-entry with `on_cooldown` and a detail
   carrying {dungeon, mode, next_entry_at}; hr_state_of projects the ACTIVE windows
   as a top-level `dungeon_cooldowns`, PER DUNGEON AND PER MODE —
   { "<dungeon_id>": { "auto": ISO, "manual": ISO, "scavenger": ISO } } — derived by
   the SAME function the gate refuses on, so the countdown shown and the window
   enforced are one number. This lands it where the dungeon cards read it.

   PER MODE, NOT PER DUNGEON, and the nesting is the whole contract: one run stamps
   one `last_at` and each mode clears at `last_at + cooldown_s / divisor(mode)`
   (auto 1, manual 1, scavenger 4). So a scavenger entry can be open while auto is
   not, and a flat "is this dungeon resting" answer would be wrong for two of the
   three buttons. A caller must name the mode it is about to settle as.

   ⚠ IT DOES NOT WRITE `G.dungeons.lastRun`, AND THAT IS THE POINT. That was a
   CLIENT-CLOCK stamp in the residue — a clock the client set and could rewind —
   and once the settle arm went live nothing stamped it at all, so every card read
   "ready" regardless of what the server would allow. The server's answer lands in
   its own `_`-prefixed scratch key: never synced, never persisted, and ABSENT on a
   cold boot, which reads as ready — exactly today's behaviour until an envelope
   speaks.

   TWO SHAPES, ONE SEAM. A projection is ABSOLUTE (it holds open entries only, so an
   omitted mode has come off cooldown and must read ready); a refusal detail names
   ONE dungeon and ONE mode, so it MERGES into that entry — which paints the
   countdown the instant the server says no, without waiting for an envelope. A
   detail without a `mode` is not placed anywhere rather than guessed at: the mode is
   what the entry MEANS, and a guess would rest the wrong button.

   FAIL-OPEN on absence or garbage, deliberately. A stamp we cannot read leaves the
   button live, the player clicks, and the SERVER refuses with the honest reason;
   evicting on an unparseable stamp would lock a dungeon out of an account with no
   way back, which is the uncertainty rule (§6). Pure — G + res in, a receipt out. */
export function reconcileDungeonCooldowns(G, res) {
  if (!G || typeof G !== 'object' || !res || typeof res !== 'object') return null;
  const iso = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
  const bag = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
  const map = bag(res.dungeon_cooldowns);
  if (map) {
    const out = {};
    for (const id of Object.keys(map)) {
      const modes = bag(map[id]);
      if (!modes) continue;
      const kept = {};
      for (const m of Object.keys(modes)) { const s = iso(modes[m]); if (s) kept[m] = s; }
      if (Object.keys(kept).length) out[id] = kept;
    }
    G._dungeonCooldowns = out;
    return { mode: 'server', active: Object.keys(out).length };
  }
  const d = bag(res.detail);
  const one = (d && typeof d.dungeon === 'string' && typeof d.mode === 'string') ? iso(d.next_entry_at) : null;
  if (!one) return { mode: 'absent' };
  const merged = Object.assign({}, G._dungeonCooldowns || {});
  merged[d.dungeon] = Object.assign({}, bag(merged[d.dungeon]) || {}, { [d.mode]: one });
  G._dungeonCooldowns = merged;
  return { mode: 'refusal', active: Object.keys(merged).length };
}

/* ── THE LIFETIME EVENT COUNTERS ARE THE SERVER'S (dead-counter class) ────────
   THE DEFECT THIS CLOSES. `G.stats.harvested` / `G.stats.planted` are read by
   the goal engine (legacy.js DAILY_GOAL_POOL `source:`, ACHIEVEMENTS `src:`,
   MIRRORED_QUEST_SOURCES) and, since the b454 farm cutover, were written by
   NOBODY. The only writers were the client-side increments inside plantCrop /
   harvestPlot, and both sit AFTER `if(farmSyncArmed()){ …; return; }` — dead in
   the shipped build. So "Harvest 100 crops" (Green Thumb), the farmhand quest
   and "Plant 3 crops" sat at 0 for every player, forever: §3.4's dead-feature
   class, invisible because nothing errored.

   THE FIX IS THE SERVER'S OWN ROWS, not a re-armed client increment.
   hr_farm_harvest already writes `player_progress(kind='stat', key='ev:harvest',
   period_key='')` — a lifetime count — in the same transaction as the produce,
   and hr_state_of projects the permanent rows onto EVERY envelope. This reads
   them. The client never increments, so there is no second copy to drift, and
   the counter is correct on a device that never saw the harvest that earned it.

   ⚠ THE TABLE IS THE AUTHORING SURFACE. A new counter is a ROW here plus the
   server-side `ev:<type>` write — never a branch. Keys are the src/core/goals.js
   `ev:` namespace; targets are leaves of the G.stats residue bag.

   ✔ `ev:planted` GREW ITS LIFETIME TWIN on 2026-09-07
   (supabase/migrations/2026-09-07-farm-plant-lifetime-counter.sql, APPLIED
   09:20 UTC): hr_farm_plant now stamps the `kind='stat', period=''` row in
   lockstep with the daily one, and 27 (user, slot) pairs were backfilled from
   the plant ledger. The paragraph below is the history that explains the row —
   it is no longer inert. The FIRST boot after that backfill is what exposed the
   goal-baseline defect the `_eventCountersKnown` stamp at the bottom of
   reconcileEventCounters now closes.
   HISTORY: hr_farm_plant stamped `ev:planted` as a
   DAILY row only (kind='daily', period=<UTC day>), added by the b461 patch in
   2026-08-23-modal-goal-claims.sql §5, whose own comment says it deliberately:
   "there is no lifetime twin because no quest reads one". hr_farm_harvest, by
   contrast, stamps BOTH (daily + kind='stat', period='') — 2026-08-22-server-
   farming-complete.sql §HARVEST GOAL COUNTERS. That was true when it was
   written and is not true now: legacy.js's DAILY_GOAL_POOL 'plant' row grades
   `readSource('stats.planted') - startValue`, i.e. a LIFETIME counter with a
   client-held day baseline, so a daily row cannot answer it.
   The `ev:planted` row below was therefore correct and INERT until hr_farm_plant
   grew the same two-line lifetime insert hr_farm_harvest already carried, which
   it now has. Papering over the gap with a client increment was refused
   throughout — that is the forged-counter direction, and a client-minted goal
   counter is a client-authored reward.
   (The QUEST-MODAL plant goal is unaffected: hr_claim_goal verifies it against
   the daily row directly and never reads G.)

   DIRECTION, and why it is not a plain assignment. These are LIFETIME, monotone
   server counters, so:
     · a COMPLETE progress statement (`progress_truncated === false`, the shared
       predicate property-record.js already uses) SETS the counter, downward
       included — that is what kills a residue-ahead value carried in the
       client_state bag from the pre-cutover client-authored era, the exact
       deadlock class the property rung hit;
     · a TRUNCATED statement may only RAISE. Truncation means "some rows were not
       in this window", and reading a missing row as 0 would rewind a real
       player's lifetime harvest count to nothing.
   FAIL-CLOSED on absence: no readable `res.progress` ARRAY leaves every counter
   exactly as it was. A lean envelope is not a statement that you have done
   nothing.

   NOT arm-gated: these are display/goal counters with no dormant path, and the
   farm's client half has been armed since b454.

   Pure — takes G + res, returns a small receipt, so the suite drives it without
   a window. */
export const EVENT_COUNTER_PROJECTION = Object.freeze([
  Object.freeze({ key: 'ev:harvest', stat: 'harvested' }),
  /* LIVE since 2026-09-07 (hr_farm_plant stamps the twin; 27 pairs backfilled).
     This table is also what legacy.js derives its "which goal sources are
     server-mirrored" set from — add a row, and any goal reading that stat is
     baseline-protected without touching the goal code. */
  Object.freeze({ key: 'ev:planted', stat: 'planted' }),
]);

export function reconcileEventCounters(G, res) {
  if (!G || typeof G !== 'object') return null;
  const rows = res && res.progress;
  if (!Array.isArray(rows)) return { mode: 'absent' };
  const complete = isCompleteProgressStatement(res);
  /* The LIFETIME rows only: kind='stat', period_key=''. A kind='daily' row for
     the same key is TODAY's slice, and reading it as the lifetime total would
     under-report a lifetime goal by every day but this one. */
  const seen = new Map();
  for (const r of rows) {
    if (!r || r.kind !== 'stat' || r.period !== '') continue;
    const v = Number(r.value);
    if (!Number.isFinite(v) || v < 0) continue;
    seen.set(r.key, Math.floor(v));
  }
  if (!G.stats || typeof G.stats !== 'object') G.stats = {};
  const written = {};
  for (const row of EVENT_COUNTER_PROJECTION) {
    const next = seen.has(row.key) ? seen.get(row.key) : 0;
    const prevRaw = Number(G.stats[row.stat]);
    const prev = (Number.isFinite(prevRaw) && prevRaw > 0) ? Math.floor(prevRaw) : 0;
    /* A truncated window may raise but never lower — see the header. */
    if (!complete && next <= prev) continue;
    if (next === prev && Number.isFinite(prevRaw)) continue;
    G.stats[row.stat] = next;
    written[row.stat] = next;
  }
  /* ── "THE COUNTER IS KNOWN" — the tell the goal baseline needs ────────────
     A COMPLETE statement is the first moment these lifetime counters mean
     anything: before it, `G.stats.planted` is absent and every reader gets 0
     through a `|| 0`, which is indistinguishable from a real zero. legacy.js's
     daily-goal baseline used to capture that 0 and then grade the arriving
     lifetime count against it, rendering "Plant 3 crops — Complete!" for work
     done days earlier (display-only; hr_claim_goal grades the server's own
     DAILY counter and refuses `not_complete`). Same class as the day-start gold
     watermark, which `balKnown('gold')` already gates.
     SCRATCH, `_`-prefixed: never persisted, so a reload starts UNKNOWN again —
     the fail-safe direction. Set only on `complete`; a TRUNCATED statement is
     explicitly not a statement of the total. */
  if (complete) G._eventCountersKnown = true;
  return { mode: complete ? 'server' : 'floor', written };
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

   Q-5 (2026-09-06-state-of-farm-projection.sql): the row ALSO carries
   `waterings:[<timestamptz>,…]` — the FULL server history, the exact array
   hr_farm_growth_hours() computes from, capped at 8 by hr_farm_water. The growth
   model (HearthriseFarm.growthHours) is a byte-for-byte port of that SQL and
   reads `waterings[]`, so mirroring the whole array is what makes the client's
   isReady AGREE with the server's. Before that key existed this rebuilt a
   ONE-element array from the scalar `watered_at`, and a plot watered 4–8× came
   back carrying one watering's bonus: a long timer and a Water button on a crop
   the server already considered ready, with the client-side isReady gate then
   refusing Harvest. `watered_at` is still projected and is still the FALLBACK
   here, so a server predating the key degrades to the old behaviour rather than
   to an empty history. The live tick then promotes a finished plot to
   state:'ready'.

   Q-2 (same migration): `state.plot_level` — player_state.plot_level, written
   ONLY by hr_farm_upgrade_plot — is now in the envelope, so the tier read below
   is live rather than aspirational. It is still written ONLY from the server
   value and never invented; an envelope without the key leaves G.plotLevels
   UNTOUCHED and getPlotLevel() keeps its Lv 1 fail-safe.

   ⚠ ONE FIELD THE PROJECTION STILL DOES NOT CARRY, stated honestly:
     • regrow_count is not projected, so regrowCount rebuilds to 0. This is
       display-only: the finite-perennial wither LIMIT is enforced server-side in
       hr_farm_harvest, so a client that under-counts regrows cannot exceed it.

   b515: this WAS arm-gated (companionAuthorityArmed / isBlobRetired) because
   G.farmPlots used to be client-authored when the kill switch was off. The
   switch is retired, the client farm twin is gone, and this reconcile is the
   only writer — so the dormant no-op went with it.

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

/* THE WATERING HISTORY, MIRRORED (Q-5). `row.waterings` is the server's own
   timestamptz[] — the array hr_farm_growth_hours() reads — so the client's
   growthHours() computes the SAME effective hours the server does. Each entry is
   parsed strictly: an unparseable one is DROPPED rather than defaulted to
   Date.now() (farmParseTs's fallback is right for plantedAt, where a missing
   value must not make a plot instantly ready, and wrong here, where it would
   mint a watering bonus the server never granted). Falls back to the scalar
   `watered_at` when the array is absent — a server predating the projection then
   behaves exactly as it did before. Never invented, never client-authored: an
   early harvest is refused by hr_farm_harvest from its own row regardless. */
function farmWaterings(row) {
  const arr = row && row.waterings;
  if (Array.isArray(arr)) {
    const out = [];
    for (const w of arr) {
      const t = Date.parse(w);
      if (Number.isFinite(t)) out.push(t);
    }
    /* Mirror the server cap (hr_farm_water keeps the last 8) so a widened
       projection can never grow the client's bonus loop unbounded. */
    return (out.length > 8) ? out.slice(-8) : out;
  }
  if (row && row.watered_at != null) {
    const t = Date.parse(row.watered_at);
    if (Number.isFinite(t)) return [t];
  }
  return [];
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
    const waterings = farmWaterings(row);
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

  /* PLOT TIER (Q-2) — hr_state_of projects state.plot_level since
     2026-09-06-state-of-farm-projection.sql. Mirrored, never invented: an
     envelope without the key leaves G.plotLevels untouched so getPlotLevel()
     keeps its Lv 1 fail-safe, and hr_farm_upgrade_plot prices the next tier
     from its OWN row regardless of what the client believes. */
  const st = res && res.state;
  const tier = st && Number(st.plot_level);
  let plotLevel = null;
  if (Number.isFinite(tier) && tier >= 1) {
    G.plotLevels = Math.floor(tier);
    /* THE MIRROR (P1 2026-09-06). `_`-prefixed scratch — never snapshotted,
       never in the residue allowlist — read by farm-progression.js
       getServerPlotLevel(). Its PRESENCE is what tells the client gate the
       tier is the server's answer and not a leftover client number, so a
       residue-ahead G.plotLevels can no longer offer a crop hr_farm_plant
       will refuse with plot_tier_locked. */
    G._serverPlotLevel = G.plotLevels;
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
    /* b475/b498 — feed the WHOLE envelope so the daily-reward sheet can derive
       the day the server will pay from the server's own daily/login claim rows
       (`progress`) against the server's own clock (`now`).
       ⚠ NOT `state.streak_days`. That is hr_apply's SETTLE streak — days
         PLAYED, not days CLAIMED — and b475 rendering it as the login streak is
         what made the sheet advertise Day 3 against a Day 1 payout (b497). */
    if (w && w.HearthriseDaily && typeof w.HearthriseDaily.noteServerStreak === 'function') {
      w.HearthriseDaily.noteServerStreak(res);
    }
    /* THE HEARTHFIND (slate §2) — the WHOLE envelope to the reveal, from the one funnel
       every envelope passes (settle AND switch). It reads `res.hearthfind` (hr_apply's
       receipt, present only on the ORIGINAL response) and falls back to
       `state.hearthfind_last`, so a lost reply loses no more than the trophy's moment. */
    if (w && w.HearthriseHearthfind && typeof w.HearthriseHearthfind.noteEnvelope === 'function') {
      w.HearthriseHearthfind.noteEnvelope(res);
    }
    /* THE ACTIVE BOUNTY'S SERVER PROGRESS (2026-09-09). hr_state_of projects
       `state.bounty.progress` = hr_bounty_kills(target) - baseline, i.e. the
       number hr_claim_bounty judges the turn-in by, INCLUDING the settled/away
       kills the client's attended counter cannot see. Read from the one funnel
       every envelope passes (settle AND switch AND the boot hr_load), so a
       player who finished a contract while away sees it finished the moment
       they land rather than never. Guarded like every other note: a display
       adopter must never throw into an envelope apply, and a server without the
       projection simply carries no key, which reads as absent. */
    if (w && typeof w.hrNoteServerBounty === 'function') w.hrNoteServerBounty(res);
  } catch (e) {}
  written.absolute = absolute;

  /* THE PRICED WINDOW, OBSERVED - same KEY-PRESENCE rule; `accrued_to` answers
     a pending fall (see `noteFallAnswer`). SITED HERE AND ONLY HERE, read
     BEFORE `reconcileFall` exactly as it always was, and deliberately not
     inside it: `bootAccruedToAt` is the welcome-back card's statement of the
     absence, and letting the boot body write it first would move a number. */
  if (st && Object.prototype.hasOwnProperty.call(st, 'accrued_to')) {
    const a = st.accrued_to ? Date.parse(st.accrued_to) : 0;
    if (Number.isFinite(a) && a > 0) {
      accruedToAt = a; written.accruedTo = a;
      if (!bootAccruedToAt) bootAccruedToAt = a;
    }
  }

  /* WHERE THE CHARACTER STANDS - the recovery line, the death counters, the
     retreat counter, the pending-fall answer and the announcement. ONE
     implementation, shared with the BOOT hr_load path: applyEnvelopeState runs
     only on `accrued:true` and a retreat always leaves the pointer idle, so the
     one state the Retreat produces is the one the client would be blind to. */
  Object.assign(written, reconcileFall(G, res) || {});

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
  /* HP + MAX HP ARE THE SERVER'S. One implementation, shared with the BOOT
     hr_load path (record.js) — see reconcileHp below for the full narrative. */
  Object.assign(written, reconcileHp(G, res) || {});


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
      const next = skillAbsolute ? xp : Math.max(have, xp);
      /* ── THE PENDING FOLD-BACK USED TO BE HERE, AND IT IS GONE ─────────────
         Folding still-uncredited attended XP into `next` here was the wrong
         LAYER twice over: `G.skills` is a MOVED field, so applyRecord replaces
         it wholesale from the same envelope microseconds later (dead on the
         normal path), and on a STALE envelope the folded value survives without
         matching `_record.stamp` — `skillXpForDisplay` then drops to the local
         rung, which ADDS the prediction on top of a number that already contains
         it. That is the double-count it was meant to prevent.

         THE PROTECTION NOW LIVES IN THE LAYER THAT SURVIVES applyRecord: the
         prediction bag. `addXp` records the attended gain as a `credit`-tagged
         bucket (predict.js `predictXp`), `skillXpForDisplay` renders record truth
         PLUS the un-retired bucket, and `reconcileCreditedXp` retires it by the
         AMOUNT the record actually advanced rather than by a watermark the credit
         never moves. Asserted by XP-FOLDBACK / XP-CREDIT-RETIRE in smoke-test.js.

         ⚠ DO NOT REINTRODUCE A CLIENT WRITE OF `G.skills` HERE. Under the armed
         record it is not a display buffer; it is a field with provenance, and
         writing it un-stamped is how a real number starts reading as forged. */
      skills[k] = next;
      written.skills[k] = next;
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
     rides EVERY envelope, and as a MIRROR: a trait the projection does not name
     is REMOVED, because a client-held entitlement that outlives the server is
     the residue-ahead class — see reconcileTraits' header. */
  written.traits = reconcileTraits(G, res);

  /* THE OWNED HERO SLOTS ARE THE SERVER'S (hr_buy_hero_slot). Reconciled here so
     the projection rides EVERY envelope — away, activity-switch and gold alike —
     which is what lets the hero drawer stay honest without a poll of its own.
     Lands in `G._heroSlots` scratch, NEVER in the G.heroSlotsUnlocked residue;
     see reconcileHeroSlots' header for why keeping the two apart is the fix. */
  written.heroSlots = reconcileHeroSlots(G, res);

  /* AND THE DUNGEON RE-ENTRY WINDOWS BESIDE THEM, for the same reason: the panel's
     countdown must be right on the envelope the player's own action produced, not
     one poll later. Same absolute/merge split, same fail-open — see the header. */
  written.dungeonCooldowns = reconcileDungeonCooldowns(G, res);

  /* THE LIFETIME GOAL COUNTERS ARE THE SERVER'S (`ev:*` permanent progress
     rows). Reconciled here, beside traits and the property rung, because they
     ride the SAME rows and must land on EVERY envelope — away, activity-switch
     and gold alike — or the Green Thumb bar moves only on the boot load. See
     reconcileEventCounters' header for the direction rule and for why
     `stats.planted` is inert until hr_farm_plant mints `ev:plant`. */
  written.eventCounters = reconcileEventCounters(G, res);

  /* b492 — THE PROPERTY RUNG IS THE SERVER'S TOO, and it rides the SAME permanent
     `progress` rows as traits (`property:<tier>`, `worker_hire`). OBSERVED here
     rather than applied: notePropertyUnlocks only ratchets a module cache, so it
     cannot race record.js's residue hydrate the way a write into G would. The
     repair happens at the READ (features/homestead.js getTier → healPropertyTier).
     Guarded — an observation must never throw into an envelope apply. */
  try { written.property = notePropertyUnlocks(res); } catch (e) {}

  /* THE RENOWN MIRROR RIDES EVERY SETTLE TOO. Same observation, same
     rules as the property rung above: the rank headline and the rank-up card
     read what the SERVER has counted, never the client's own score, and this is
     the call that keeps that figure fresh between claims. Feeds the ONE record
     in src/features/renown.js; writes nothing into G. */
  try {
    const RN = (typeof window !== 'undefined') && window.HearthriseRenown;
    if (RN && typeof RN.noteServerRenown === 'function') written.renown = RN.noteServerRenown(res);
  } catch (e) {}

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

  /* THE LAST AWAY-CLASSIFIED RECEIPT IS THE SERVER'S (ruling 2026-09-07).
     Seeded from `state.last_away_receipt` so the Home "While you were away" card
     survives a reload — see reconcileAwayReceipt's header for why it can only
     ever fill a hole and never overwrite this session's receipt.

     ⚠ NAMED `restoredReceipt`, NEVER `receipt`, AND THE NAME IS LOAD-BEARING.
       This is a RESTATEMENT of a night that was paid, journalled and banked
       some time ago; `paidReceipt` (set by applyEnvelope / applyIntentEnvelope
       below) is the receipt for the payment THIS envelope carried. Exactly one
       of them may reach a crediting seam and it is never this one — see the
       block above `creditServerAwayKills` in legacy.js. Two fields with two
       names, because one field with two meanings is how a restored receipt
       comes to be credited twice. */
  written.restoredReceipt = reconcileAwayReceipt(G, res);

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
  /* THE PURCHASED BANK RUNGS (SA-010). Beside the item store because the two
     share one object, but on its own authority: the rungs are `progress`
     unlock rows and are NOT gated on the inventory arm — a paid rung must come
     home on every envelope in prod, today. See reconcileBankRungs' header. */
  written.bankRungs = reconcileBankRungs(G, res);
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
   DOES THE SERVER EAT FOR THIS CHARACTER?  (live P0, b467→b479.)

   THE QUESTION MATTERS BECAUSE THE ANSWER DECIDES WHO OWNS THE DEBIT, and
   getting it wrong in either direction is a bug:

     server eats  → the accrual engine consumes the food itself and states the
                    debit in the settle's signed `items` delta; a client `eat`
                    intent for the SAME auto-eat would debit it TWICE — real
                    item loss.
     server does NOT eat → nothing server-side ever removes an auto-eaten
                    Provision, the envelope keeps naming the pre-eat count, and
                    the reconcile hands it straight back. That is the reported
                    bug, and only a client intent closes it.

   ⚠ "THE SERVER EATS" IS A PROPERTY OF THE CHARACTER, NOT OF THE WINDOW, AND
     THAT DISTINCTION HAS ALREADY BEEN MISREAD ONCE. The b497 staging note in
     supabase/migrations/2026-09-04-auto-eat-at-creation.sql asserts that "the
     server's sim only eats during AWAY accrual" and proposes re-shaping the
     client gate around `inOfflineReplay()` on the strength of it. It is FALSE.
     `computeAccrual` takes no away input and no presence input: it prices
     whatever elapsed since `accrued_to`, and `fx.autoEat()` is gated on
     `autoEatEnabled` alone. This module settles on a ~90 s cadence WHILE THE TAB
     IS VISIBLE (see `decideSettle` below), so an ATTENDED window is simulated,
     paid and eaten by the server exactly like a night is.
     MEASURED, tests/accrual-engine.mjs `attendedSettleAutoEatGuard`: a fresh
     10-HP goblin fight with `autoEatEnabled: true` eats 2 meals over 60 s and 3
     over 90 s, each with the matching negative item delta — and the same window
     with the flag false pays 0 kills and dies. Re-shaping the gate would open a
     double debit on every attended meal; both sides are now red on it
     (EAT-RESTOCK-6 block 2, and the engine guard above).

   THE COLUMN'S VALUE IS AN OBSERVATION, NEVER A CONSTANT. It was false for every
   character while `hr_set_auto_eat` (its only writer) had never been called —
   supabase/migrations/2026-08-29-auto-eat-tiers.sql records "0 rows on
   production 2026-08-23". b497's `2026-09-04-auto-eat-at-creation.sql` makes it
   TRUE at character creation, so the live answer flips to "the server eats" for
   every new character and the client send retires itself, exactly as the
   RETIREMENT note below anticipated. Nothing here has to change for that: this
   reads the server's own `state.auto_eat_enabled` off every envelope
   (hr_state_of projects it, 2026-08-15-auto-eat.sql). TRI-STATE and FAIL-CLOSED:

     false  → the client must send the eat intent (the only debit there is)
     true   → the server does it; the client must NOT send (no double debit)
     null   → never observed on this device; treated as `true` by the caller,
              i.e. do not send. The safe direction is the one that cannot
              destroy an item.

   ⏳ RETIREMENT — HALF DONE AS OF b497. b497 makes this read `true` for every
   new character, so the client send has retired itself with no flag to flip and
   only the pending-consumption hold remains. THE OTHER HALF — the settings sync
   — SHIPPED IN b499: src/features/auto-actions.js now debounces the player's
   own toggle / threshold / food pick out to `hr_set_auto_eat`, so
   `auto_eat_food` stops being NULL and the engine stops falling back to
   `bestHealingFood` (the most valuable healer in the bag) while the client
   honours the player's nomination. Nothing about THIS predicate changed for it:
   the sync is a new verb call site, and the who-eats question is still answered
   by the server's own `auto_eat_enabled` column, read below. */
let serverAutoEatObserved = null;
/* ── THE FULL OBSERVED TRIPLE (b499) ──────────────────────────────────────────
   hr_state_of has projected all three auto-eat columns since
   2026-08-15-auto-eat.sql (`state.auto_eat_enabled` / `auto_eat_food` /
   `auto_eat_pct`); only the first was ever read. The settings sync needs the
   other two as its DEDUPE ANCHOR — "what does the server already believe" — so
   that a settings panel that is merely OPENED, or a suite that sets a value and
   puts it straight back, sends nothing at all. `hr_set_auto_eat` bumps the
   version and writes a ledger row on EVERY call and is rate-gated at 30/hour, so
   "would this call change anything" is a question worth answering locally.

   OBSERVATION, NEVER INFERENCE: a key the envelope does not carry leaves the
   previous observation alone, and an unobserved field reads `undefined` — which
   the sync treats as "unknown, so send it" rather than as a value. Absence must
   never be read as "the server has NULL". */
const serverAutoEatSeen = { enabled: undefined, food: undefined, pct: undefined, touched: undefined };
/* ── `pctSeq` — HOW MANY TIMES THE SERVER HAS STATED A THRESHOLD ─────────────
   A monotonic counter bumped on every RECORDING of `auto_eat_pct`, whatever the
   value. src/features/auto-actions.js has to tell "the server has spoken since
   the player's last gesture" from "the value happens to match last time", and
   only an EVENT count separates those: an envelope restating 25 is still the
   server saying 25, and it must be able to overrule an unanswered local 50.
   Never decreases except through __resetServerAutoEat, which puts the module
   back to never-observed — itself an observation event for the reader. */
let serverAutoEatPctSeq = 0;
export function noteServerAutoEat(res) {
  const st = res && res.state;
  if (st && typeof st === 'object'
      && Object.prototype.hasOwnProperty.call(st, 'auto_eat_enabled')) {
    const v = st.auto_eat_enabled;
    if (v === true || v === false) { serverAutoEatObserved = v; serverAutoEatSeen.enabled = v; }
  }
  if (st && typeof st === 'object'
      && Object.prototype.hasOwnProperty.call(st, 'auto_eat_food')) {
    const f = st.auto_eat_food;
    /* NULL is a real, meaningful value here — "no nomination, use the best in
       the bag" — so it is recorded as null, not skipped. */
    if (f === null || typeof f === 'string') serverAutoEatSeen.food = f;
  }
  if (st && typeof st === 'object'
      && Object.prototype.hasOwnProperty.call(st, 'auto_eat_pct')) {
    const p = Number(st.auto_eat_pct);
    if (Number.isFinite(p)) {
      serverAutoEatSeen.pct = Math.max(0, Math.min(100, Math.round(p)));
      serverAutoEatPctSeq++;
    }
  }
  /* HAS A HUMAN EVER TOUCHED THE SWITCH? (`player_state.auto_eat_set_at is not
     null`, projected as a boolean.) This is a DIFFERENT question from "is it
     on", and the difference is the whole of the one-time switch-on: 34 of 36
     characters own Auto-Eat and have it off, not because anybody chose that but
     because the purchase never flipped it. `undefined` — an older server, or no
     envelope yet — must read as "unknown" and make NO offer, because an offer
     made on missing data is an offer made repeatedly. */
  if (st && typeof st === 'object'
      && Object.prototype.hasOwnProperty.call(st, 'auto_eat_touched')) {
    const t = st.auto_eat_touched;
    if (t === true || t === false) serverAutoEatSeen.touched = t;
  }
  return serverAutoEatObserved;
}
/** true | false | null (never observed). Never infers — only reports. */
export function serverAutoEats() { return serverAutoEatObserved; }
/** Should the CLIENT send an eat intent for an auto-eat? Only on a definite NO
 *  from the server. Unknown and yes both mean "leave it to the server". */
export function clientOwnsAutoEatDebit() { return serverAutoEatObserved === false; }
/** The server's own auto-eat settings as last PROJECTED. A field is `undefined`
 *  when no envelope has carried it — never confuse that with a stored NULL.
 *  Returns a copy; the observation is not the caller's to edit. */
export function serverAutoEatSettings() {
  return { enabled: serverAutoEatSeen.enabled, food: serverAutoEatSeen.food,
           pct: serverAutoEatSeen.pct, touched: serverAutoEatSeen.touched,
           /* The OBSERVATION COUNT for `pct`. See serverAutoEatPctSeq. */
           pctSeq: serverAutoEatPctSeq };
}
/* ── THE VERB'S OWN ANSWER IS ALSO AN OBSERVATION ────────────────────────────
   `hr_set_auto_eat` returns `{ok:true, auto_eat:{enabled,food,pct,tier,max_pct}}`
   — the POST-WRITE value of the same three columns, after its tier clamp
   (`v_pct := least(v_pct, v_max)`, 2026-08-29-auto-eat-tiers.sql). Not a client
   guess about what the server stored: the server saying what it stored, on the
   RPC round trip instead of on the next ~90 s settle.

   WHY IT MATTERS: the settings threshold is MIRRORED from this observation
   (src/features/auto-actions.js eatThreshold), so without it a player whose
   value the server CLAMPED keeps seeing their own un-clamped number until the
   next envelope — the same lie with a shorter fuse. The shape differs from
   noteServerAutoEat's (`res.state`) because the verb returns no envelope; the
   recording is shared so the two cannot drift.

   FAIL-SAFE: anything not `ok` with a readable `auto_eat` object records NOTHING
   and leaves the previous observation alone. A refusal is not a value. */
export function noteAutoEatVerb(res) {
  const a = res && res.ok === true ? res.auto_eat : null;
  if (!a || typeof a !== 'object') return serverAutoEatSettings();
  if (a.enabled === true || a.enabled === false) {
    serverAutoEatObserved = a.enabled; serverAutoEatSeen.enabled = a.enabled;
  }
  if (a.food === null || typeof a.food === 'string') serverAutoEatSeen.food = a.food;
  const p = Number(a.pct);
  if (Number.isFinite(p)) {
    serverAutoEatSeen.pct = Math.max(0, Math.min(100, Math.round(p)));
    serverAutoEatPctSeq++;
  }
  return serverAutoEatSettings();
}

/** TEST-ONLY. Record an observation without an envelope. */
export function __noteAutoEatSettings(patch) {
  const p = patch || {};
  if (Object.prototype.hasOwnProperty.call(p, 'enabled')) serverAutoEatSeen.enabled = p.enabled;
  if (Object.prototype.hasOwnProperty.call(p, 'food')) serverAutoEatSeen.food = p.food;
  if (Object.prototype.hasOwnProperty.call(p, 'pct')) {
    serverAutoEatSeen.pct = p.pct; serverAutoEatPctSeq++;
  }
  if (Object.prototype.hasOwnProperty.call(p, 'touched')) serverAutoEatSeen.touched = p.touched;
  return serverAutoEatSettings();
}
/** TEST-ONLY. Restore the never-observed state. */
export function __resetServerAutoEat() {
  serverAutoEatObserved = null;
  serverAutoEatSeen.enabled = undefined; serverAutoEatSeen.food = undefined;
  serverAutoEatSeen.pct = undefined; serverAutoEatSeen.touched = undefined;
  /* Back to never-observed. The counter RESETS rather than advancing because
     this IS the "forget everything" seam; a reader comparing sequences sees the
     change either way, which is what makes the reset an observation event too. */
  serverAutoEatPctSeq = 0;
  return serverAutoEatObserved;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE BAG, RECONCILED FROM AN ENVELOPE — ONE IMPLEMENTATION.

   The FIRST of the idle-boot hydration class: bag hydration lived only inside
   applyEnvelopeState, which runs only on `accrued:true`, so an idle boot left
   the player looking at a stale remnant of the inventory the server held. This
   function is the shared apply, called from BOTH paths.

   The merge/absolute split, the debit handling (consumedKeysOf), the equip-dupe
   discount (unaccountedEquipped), the serverOwnedItem carve-out, the never-delete
   rule and itemLedger.reconcile are preserved EXACTLY. The ONLY behavioural
   difference from the inlined version is that the prediction sweep is NOT run
   here: applyEnvelopeState runs it once after this returns, and the load path
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
/* ══════════════════════════════════════════════════════════════════════════
   HP IS SERVER-OWNED — ONE IMPLEMENTATION, BOTH DIRECTIONS.

   TWO CAUSES, BOTH CLOSED HERE, of a client that booted at 13/13 while the
   server held a 40% resume at 6/13 and settled the next fight into a death.
   (1) THE RAISE-ONLY FLOOR. The old rule ("an idle player cannot be wounded by
       an envelope") let an envelope RAISE hp freely and lower it only mid-fight.
       Its evidence was real for its time: `resolveDeath` full-healed on the
       CLIENT, so a late envelope for a superseded window wrote a mid-fight hp
       over the respawn. That world is gone — death, the recovery window and the
       resume-at-fraction are SERVER state (2026-09-06-recovering-until.sql).
       Out of combat the server's hp is the answer, and raise-only inverted that
       into "the client keeps whatever is higher": a stale full bar overwriting a
       40% resume. CLAUDE.md §1 — the server owns it, down as well as up.
   (2) THE BOOT PATH NEVER ASKED. hp lived ONLY in applyEnvelopeState, which
       runs ONLY on `accrued:true`; an idle boot answers {accrued:false} and
       nothing ever read `state.hp`. `playerHp` is in NO_SYNC, so there was no
       other source and the bar defaulted to full — the same idle-boot hydration
       class as inventory, crew and hero slots, with the same shape of fix.

   WHAT IS PRESERVED. The Paione P0 rule is unchanged and is the ONLY exception:
   during an ATTENDED fight (`G.activeMonster` set) a NON-away envelope carries
   a stale-full hp the server computed nothing for, so the client's in-fight
   prediction wins. An AWAY envelope (`res.away`) is a settle that covers the
   fight span — the server did compute it — and is adopted absolutely.

   AND THE PREDICTION IS SEEDED HONESTLY. Preserving an in-fight prediction is
   only sound if the fight STARTED from server truth; `startCombat` (legacy.js)
   now seeds `G.playerHp` from `serverHp()` rather than leaving it at max, so
   the exception can no longer launder a stale full bar through a whole fight.

   Returns a receipt fragment; never throws. */
/* ══════════════════════════════════════════════════════════════════════════
   reconcileFall - WHERE THE CHARACTER STANDS, OFF ANY SERVER ENVELOPE.
   ONE observer, TWO callers: `applyEnvelopeState` (the settle, the activity and
   gold envelopes) and record.js's boot `hr_load` settle. Extracted verbatim, so
   the two paths cannot develop two ideas of whether a player is on the floor.
   THE MEASURED BUG THIS EXISTS FOR (RETREAT-A4). applyEnvelopeState only runs
   on `accrued:true`, and a RETREAT leaves the activity pointer IDLE - so the
   next boot is answered `{accrued:false, reason:'idle'}` and it never runs.
   Measured against the real boot path with `recovering_until` 32 minutes ahead
   and `consec_falls: 3`: the client came up `phase:'up'`, `G.consecFalls`
   UNDEFINED and no sheet - 27 minutes earning nothing with no countdown and no
   Rest button, reached through the IDLE-BOOT door instead of the reload door
   RECOVER-11 closed, the FIFTH instance of the class record.js names. It bites
   twice: no reason is given for the 5/13 HP, and the rule that just ended a
   hopeless run forgets it did. The fix is the shape record.js prescribes for
   the other four: route the always-full boot body through the SAME function.
   ⚠ `accrued_to` IS DELIBERATELY NOT IN HERE. It feeds `bootAccruedToAt`, the
     welcome-back card's statement of how long the player was away; moving its
     first observation to the boot read would change a player-visible number
     this change has no business touching. `noteFallAnswer` reads it, but only
     when `fall.at` is set - which at boot it never is.
   Returns a receipt fragment; never throws. */
export function reconcileFall(G, res) {
  const st = (res && res.state) || {};
  const written = {};

  /* THE RECOVERY LINE, OBSERVED - `player_state.recovering_until`, an ABSOLUTE
     server instant, recorded off every envelope and NEVER decremented here: a
     client-side countdown survives a reload and Recovery is precisely the thing
     that must not (exploit R1). Renderers subtract it from the clock to draw.
     ⚠ KEY PRESENCE, not truthiness. `null` means "up" and must CLEAR the stored
       line; an ABSENT key means an older server and must leave it alone, or a
       mixed-deploy window would show a stale knockout. */
  if (st && Object.prototype.hasOwnProperty.call(st, 'recovering_until')) {
    const t = st.recovering_until ? Date.parse(st.recovering_until) : 0;
    recoveringUntil = (Number.isFinite(t) && t > 0) ? t : 0;
    written.recoveringUntil = recoveringUntil;
  }

  /* THE DEATH COUNTERS, OBSERVED - same KEY-PRESENCE rule, same reason.
     `deaths_today` / `deaths_lifetime` are what the death sheet renders instead
     of re-deriving a ladder rung from `G.stats.deaths`, a lifetime tally that
     produced a two-minute promise on a fall the server charged nothing for. */
  if (st && Object.prototype.hasOwnProperty.call(st, 'deaths_today')) {
    const n = Math.floor(Number(st.deaths_today));
    deathsTodayCount = (Number.isFinite(n) && n >= 0) ? n : 0;
    written.deathsToday = deathsTodayCount;
  }
  if (st && Object.prototype.hasOwnProperty.call(st, 'deaths_lifetime')) {
    const n = Math.floor(Number(st.deaths_lifetime));
    deathsLifetimeCount = (Number.isFinite(n) && n >= 0) ? n : 0;
    written.deathsLifetime = deathsLifetimeCount;
  }
  /* THE RETREAT COUNTER, OBSERVED - consecutive falls with no kill between them.
     Written straight onto `G`, not a module-local: `G` IS the state the live
     tick hands to `resolveDeath`, so this assignment is what makes the ATTENDED
     path evaluate the same rule the away path does.
     ⚠ KEY PRESENCE. `resolveDeath` gates the ENTIRE Retreat on this being a
       NUMBER, so an ABSENT key must leave `G.consecFalls` undefined - inventing
       a 0 arms a client rule against a database that cannot back it, pointed at
       a mechanic that STOPS the player. PREDICTION ONLY: the next envelope
       overwrites it with the server's number. */
  if (st && Object.prototype.hasOwnProperty.call(st, 'consec_falls')) {
    const n = Math.floor(Number(st.consec_falls));
    const v = (Number.isFinite(n) && n >= 0) ? n : 0;
    if (G && typeof G === 'object') G.consecFalls = v;
    written.consecFalls = v;
  }
  /* AFTER all three: a no-op unless the CLIENT saw itself fall this session
     (`fall.at`), which on the boot path it never has. */
  noteFallAnswer(res);
  /* THE ANNOUNCEMENT. Measured live: a character with `recovering_until` 27
     minutes ahead RELOADED and got a normal "Fighting Goblin" bar - no sheet,
     no countdown, no Rest button. The sheet was never broken; its only trigger
     was the fall MOMENT in the live tick, and a reload has no such moment.
     One-way: a listener that throws must not poison an envelope apply. */
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function'
        && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('hearthrise:fall', { detail: fallState() }));
    }
  } catch (e) {}

  return written;
}

let lastServerHp = null;   /* {hp, maxHp, at} — the last hp the SERVER stated. */

/** The last server-stated hp, or null if this session has never seen one.
 *  A copy; the observation is not the caller's to edit. */
export function serverHp() {
  return lastServerHp ? { hp: lastServerHp.hp, maxHp: lastServerHp.maxHp, at: lastServerHp.at } : null;
}
/** TEST-ONLY. Forget the observation. */
export function __resetServerHp() { lastServerHp = null; return lastServerHp; }

export function reconcileHp(G, res) {
  if (!G || typeof G !== 'object') return null;
  const st = (res && res.state) || {};
  const written = {};
  if (Number.isFinite(Number(st.max_hp))) { G.playerMaxHp = Number(st.max_hp); written.maxHp = G.playerMaxHp; }
  if (!Number.isFinite(Number(st.hp))) return written;

  const next = Number(st.hp);
  const cur = Number(G.playerHp);
  const maxHp = Number.isFinite(Number(st.max_hp)) ? Number(st.max_hp)
              : (Number.isFinite(Number(G.playerMaxHp)) ? Number(G.playerMaxHp) : next);
  /* Observed on EVERY envelope that names hp — including the ones the fight
     exception refuses to apply, because "what does the server believe" is a
     different question from "what does the bar show", and startCombat needs
     the first one. */
  lastServerHp = { hp: next, maxHp, at: Date.now() };
  written.serverHp = next;

  const inFight = !!G.activeMonster;
  const awayOwnsHp = !!(res && res.away && typeof res.away === 'object');
  if (inFight && !awayOwnsHp && Number.isFinite(cur)) {
    written.hp = cur; written.hpRefused = next;
    return written;
  }
  G.playerHp = next; written.hp = G.playerHp;
  return written;
}

/** Has an envelope stated this character's bag on THIS page load? Fail-closed —
 *  an unstamped G answers false. `__forgetBagHydrated` is the test seam. */
export function bagHydrated(G) {
  const at = G && Number(G._bagFromServerAt);
  return Number.isFinite(at) && at > 0;
}
export function __forgetBagHydrated(G) { if (G) delete G._bagFromServerAt; }

export function reconcileInventory(G, res, invAbsolute, baselineComplete) {
  if (!G || typeof G !== 'object') return null;
  if (typeof invAbsolute !== 'boolean') invAbsolute = isInventoryAbsolute();
  if (typeof baselineComplete !== 'boolean') baselineComplete = envelopeBaselineComplete(res);
  const written = { inventoryAuthority: invAbsolute, baselineComplete };
  const inv = (G.inventory && typeof G.inventory === 'object') ? { ...G.inventory } : {};

  /* Observe whether the SERVER eats for this character. Done HERE rather than in
     applyEnvelopeState because this function is the one the boot hr_load settle
     ALSO calls (record.js), so the answer is known from the first envelope of a
     session either way. See noteServerAutoEat. */
  noteServerAutoEat(res);

  /* THE ONE-TIME AUTO-EAT SWITCH-ON (Recovery rev. 2 §10). Fired from the same
     place, for the same reason: this is the function the BOOT hr_load settle
     also calls, so the offer is evaluated against the first envelope of a
     session and never against a guess. It is idempotent, self-limiting to once
     per page load, and declines silently on anything it cannot prove — an
     unknown `auto_eat_touched` (an older server) makes NO offer. Kept behind a
     try/catch because a settle must never fail on a toast. */
  try {
    const A = (typeof window !== 'undefined') && window.HearthriseAuto;
    if (A && typeof A.maybeSwitchOnAutoEat === 'function') A.maybeSwitchOnAutoEat();
  } catch (e) {}

  /* ══════════════════════════════════════════════════════════════════════
     THE LIVE P0 (reported 4×, b467→b479): "food eaten in combat gets
     restocked" / "I have 2 moonblood and every time I use 1 it comes back".

     EVERY branch below takes the LARGER of the client's copy and the server's
     figure (or, for an OWNED id under absolute, the server's figure outright).
     A locally-eaten unit makes the client's copy SMALLER, so an envelope that
     still names the pre-eat count RESTOCKS it BY CONSTRUCTION — and because
     `have` is itself the ratcheted value, the eat's own (correct) response then
     loses the max and the client is permanently one ahead of the server.

     So the pending holds are folded OUT of the server's figures BEFORE either
     branch reads one. The fold only ever LOWERS a figure — it cannot mint, add
     a key, or write the bag — and it drains on EVIDENCE that the server's own
     figure has come down. See src/net/pending-consume.js.

     `omissionIsZero` is the same distinction the branches themselves draw: a
     complete, armed absolute envelope is a COMPLETE STATEMENT (an omitted key
     is a real zero, so a hold on it is settled), while a merge envelope's
     omission means "unknown" — except for the ids the away receipt explicitly
     DEBITED, which is a positive statement and is exactly `consumedKeysOf`.

     ⚠ `itemLedger.reconcile` BELOW IS DELIBERATELY GIVEN THE RAW `res`, not the
     folded figures. Its two predicates ask what the SERVER LITERALLY STATED
     ("does it name the goods?", "did it hand the payment back?"), and a hold is
     a fact about the CLIENT, not a statement by the server. The two cannot
     collide today — only foods reach a hold, and no food is a Quartermaster
     trade leg — but a future caller that adopts the consumption seam for a
     tradeable id must revisit that sentence rather than assume it. */
  /* ARRAYS ARE EXCLUDED HERE RATHER THAN ONLY AT THE ABSOLUTE GUARD BELOW. An
     array is a malformed bag, not a claim; letting one through and then spreading
     it into a folded copy would turn it into a plain object and quietly defeat
     the `!Array.isArray` fail-closed check the absolute branch depends on. The
     merge branch is unaffected — an array's index keys never parse as item ids,
     so it wrote nothing before and writes nothing now. */
  const invNamedRaw = (res && res.inventory && typeof res.inventory === 'object' && !Array.isArray(res.inventory))
    ? res.inventory : null;
  /* THE BAG HAS NOW BEEN STATED BY THE SERVER. Stamped here because this is the
     ONE apply both doors run (the idle-boot hr_load hydrate and
     applyEnvelopeState): until the first envelope `G.inventory` is still the
     fresh-G factory literal, which loadLocal cannot strip because `inventory` is
     not a SERVER_OF_RECORD field, so any SERVER-DERIVED statement about the bag
     waits for this. hr_state_of coalesces the projection to `{}`, so an empty
     bag stamps; an absent key is not a statement. `_`: scratch, never persisted. */
  if (invNamedRaw) { try { G._bagFromServerAt = Date.now(); } catch (e) {} }
  const consumedIds = consumedKeysOf(res);
  const invNamed = pendingConsume.foldPendingConsume(G, invNamedRaw, {
    omissionIsZero: (invAbsolute && baselineComplete) ? true : consumedIds,
  });
  /* ══════════════════════════════════════════════════════════════════════
     THE PHANTOM FOOD (LIVE P0, b510 QA slot 2, 2026-09-06).

     MEASURED: `player_inventory` held NO food; the 12:15 away settle receipt
     said `ate 23 cooked_shrimp`; the client, after a FRESH RELOAD, still
     showed 20 Cooked Shrimp and 10 Shrimp. The knocked-out sheet therefore
     told the player they "were carrying 20 x Cooked Shrimp and never ate one"
     and offered a Rest that `hr_rest` refused with `insufficient_food`.

     THE ROOT CAUSE, EXACTLY. Both branches below only ever RAISE a figure for
     an id the server does not OWN, and a cooked dish is deliberately NOT owned
     (buildItemAuthority puts cookingOutputIds in `excluded` so an incomplete
     baseline can never delete a live-cooked meal). An OMITTED key is read as
     "unknown", so once the server's row hits zero the key disappears from the
     envelope and the client's stale 20 is never contradicted again — by any
     envelope, ever, including the boot `hr_load` reconcile (record.js). The
     never-delete rule, which is right for a dish the CLIENT made, is wrong for
     the one thing the SERVER unmakes: auto-eat and hr_rest eat the player's
     food behind their back.

     THE RULE. For a SERVER-CONSUMED id (`heals > 0` — the same marker
     supabase/functions/hr-accrue/eat.js and src/core/auto-eat.js both read),
     on an envelope the SERVER has certified COMPLETE, the bag figure is
     believed in BOTH directions: a named figure sets the quantity and an
     OMITTED key is a real zero.

     WHY `baselineComplete` ALONE IS THE RIGHT GATE, and why this is not
     smuggling the inventory arm in early:
       · `inventory_complete` is a SERVER assertion (2026-08-24-inventory-
         complete.sql) that NO settle window is open — not mid-fight, not
         mid-gather, not mid-cook. That is exactly the condition under which a
         freshly-cooked dish cannot be "in flight and therefore invisible",
         which is the single hazard the ownership exclusion exists to avoid.
       · The arm (`isInventoryAbsolute()`) is NOT usable here: it starts false
         every session and can only be thrown by `maybeAutoArm` from
         applyEnvelopeState — i.e. AFTER the boot reconcile has already run. A
         rule gated on it could never fix the reported case, which is a fresh
         reload showing food the server ate an hour ago.
       · It stays fail-closed: no completeness flag (an older server, an open
         window) ⇒ nothing changes, byte for byte.
     Scope is deliberately the CONSUMED class only — this adds no new authority
     over any id the server does not eat. */
  const consumableAbsolute = baselineComplete === true && !!invNamedRaw;
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
      /* OWNED, or SERVER-CONSUMED under a complete baseline (the phantom-food
         rule above — a provision the server eats must be allowed to reach 0). */
      if (serverOwnedItem(k) || (consumableAbsolute && serverConsumedItem(k))) {
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

  /* The SAME folded figures the absolute branch above reads — computed once, at
     the top, so neither branch can be fixed without the other. `consumed` is the
     set built there. */
  const consumed = consumedIds;
  const namedFigures = (invNamed && typeof invNamed === 'object') ? invNamed : {};
  const namedKeys = Object.keys(namedFigures);
  /* THE PHANTOM-FOOD KEYS (see the block above). A provision the server has
     eaten to zero is ABSENT from the envelope, so it is in neither `namedKeys`
     nor `consumed` and the loop would never visit it. Under a server-certified
     COMPLETE baseline its absence is a statement, so the client's own food keys
     are walked too — and only those: this adds no other id to the loop. */
  const phantomKeys = consumableAbsolute
    ? Object.keys(inv).filter((k) => serverConsumedItem(k))
    : [];
  const invKeys = (consumed.size || phantomKeys.length)
    ? Array.from(new Set(namedKeys.concat(Array.from(consumed), phantomKeys)))
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
    /* ABSOLUTE for this key: the away receipt explicitly DEBITED it, or it is a
       provision the server eats and the baseline is certified complete. Either
       way the envelope's silence is a positive statement of zero. */
    const isDebit = consumed.has(k) || (consumableAbsolute && serverConsumedItem(k));
    const raw = Number(namedFigures[k]);
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
  /* THE REPLACEMENT SHEET IS GONE, NOT GATED. It asked the player to confirm
     before the server envelope "replaced" a rival local character; the capstone
     retired that rival — there is no locally-authored character left for an
     envelope to overwrite, so applying it IS the load. `describeReplacement` /
     `showReplacementSheet` remain exported for the tests that pin the copy;
     nothing calls the sheet on the load path any more. */
  const st = res.state || {};
  const written = applyEnvelopeState(G, res);

  /* The receipt. Shaped to the SAME contract legacy.js's local summary uses, so
     every welcome-back renderer keeps working unchanged — and every field is a
     value the SERVER stated, never one this file inferred. `serverAuthoritative`
     is the flag that lets a renderer (or a bug report) tell the two apart. */
  G.lastOfflineSummary = summaryFromAway(res.away, res);
  written.summary = true;
  /* ── THE RECEIPT THIS ENVELOPE PAID FOR, HANDED BACK BY IDENTITY ───────────
     `creditServerAwayKills` (legacy.js) replays the server's away KILL TOTAL
     through the live counter seams — `stats.kills`, the this-fight streak,
     `updateQuest` and `updateDaily`, and `updateDaily` is the wrapper chain the
     Muster contributes to (`world_event_contribute`, a SHARED surface). It used
     to read `G.lastOfflineSummary`, an ambient holder that ANY applier may have
     seeded — including reconcileAwayReceipt with a night that was credited
     hours ago. Handed the object instead, the crediting seam can only ever see
     the receipt for the delta that was just applied. See legacy.js:~2034. */
  written.paidReceipt = G.lastOfflineSummary;

  /* ── THE AWAY RECEIPT OUTLIVES THE NEXT SYNC ────────────────────────────
     `lastOfflineSummary` is the LATEST receipt of any kind and must stay that
     way (the toast, the welcome modal and the bug report all want the thing
     that just happened). The Home "While you were away" card is not about the
     latest receipt — it is about the ABSENCE, which is news for thirty minutes
     — and the 90-second settle loop overwrote the night's receipt with a sync
     receipt a minute and a half into play. Design ruling (game-designer,
     2026-09-07): a sync receipt must never CREATE or RE-LABEL an away card,
     and must not EVICT a fresh one either.

     So the away receipt gets its own module-scope holder, written ONLY when the
     SHARED classifier says 'away' (>= SYNC_MAX_MS, or a death on any span) —
     read through `classifyReceipt` rather than re-decided here, which is what
     keeps one classifier for the whole client. A sync never touches it; a LATER
     away receipt replaces it, because two absences in one 30-minute box means
     the second is the news. It is display state, not progression (§6), so it is
     not persisted; the boot seed below is what restates it after a reload. */
  if (classifyReceipt(G.lastOfflineSummary) === 'away') lastAwayReceipt = G.lastOfflineSummary;

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

/* ── THE LAST AWAY-CLASSIFIED RECEIPT, ACROSS A RELOAD (ruling 2026-09-07) ──
   `G.lastOfflineSummary` is a NO_SYNC field (src/net/events.js:93), so it lives
   for exactly one page life: reload once and the Home "While you were away"
   card, the welcome-back modal and the combat recap all render nothing for a
   night the server already paid, journalled and banked. The DESIGN RULING is
   that a receipt the server paid is PROGRESSION, not preference — so it now
   lives in `player_state.last_away_receipt`, written by the accrual engine on
   AWAY-classified settles only and projected by hr_state_of.

   ── THE TWO RULES THIS FUNCTION KEEPS ─────────────────────────────────────
   1. IT ONLY EVER FILLS A HOLE. A receipt written THIS session is the fresher
      statement of the same character by definition — it came from the settle
      that is still on screen — so a stored receipt never overwrites one. This is
      also what stops a stale projection re-announcing last night's absence after
      every envelope: the seed happens once, on the boot envelope, and every
      envelope after it finds the holder already populated.
   2. IT IS A READ, NOT AN AUTHORITY. Nothing here credits anything. The value
      the receipt DESCRIBES was moved by hr_apply in the same delta that wrote
      it; this is the sentence, not the payment. A garbage or absent projection
      therefore degrades to today's behaviour (silence), never to a guess —
      PRESENCE is tested, never coalesced, so a database that predates the column
      says nothing rather than rendering a fabricated empty night.

   Returns the seeded summary, or null when nothing was seeded. */
export function reconcileAwayReceipt(G, res) {
  if (!G || typeof G !== 'object') return null;
  const st = (res && res.state) || null;
  if (!st || typeof st !== 'object') return null;
  /* PRESENCE, never coalescing: an ABSENT key means "this database predates the
     receipt" and a NULL means "this character has never been away". Both are
     silence; neither is a fabricated night. */
  if (!('last_away_receipt' in st)) return null;
  const stored = st.last_away_receipt;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
  /* RULE 1: this session's receipt wins. It is the same character's fresher
     statement, and it is the one the player is looking at. */
  if (G.lastOfflineSummary) return null;
  /* ONE TRANSLATOR. summaryFromAway is the only away-receipt translator on the
     client (a second one would be two opinions about a settled night), and the
     stored object is deliberately in the SAME shape as the `away:` payload so it
     can go straight through it. */
  const summary = summaryFromAway(stored, res);
  /* `at` is the SERVER's instant, stated on the stored receipt. Kept as-is
     rather than restamped to `nowMs()`: serverAwaySpanMs treats a receipt older
     than 30 minutes as stale and falls back to the boot watermark, and
     restamping would make every reload look like a fresh absence. */
  const at = Number(stored.at);
  if (Number.isFinite(at) && at > 0) summary.at = at;
  summary.restored = true;          // scratch marker for the renderers/QA; not authority
  G.lastOfflineSummary = summary;
  /* ── AND INTO THE AWAY HOLDER, OR THE RESTORED CARD LIVES 90 SECONDS ───────
     MERGE-EMERGENT, and the seed above is only half the restore without it: the
     holder starts a boot null, so the first 90-second sync — which writes a sync
     receipt to `lastOfflineSummary` and leaves the holder alone — evicted the
     restored card. Measured on the merged tree 2026-09-07: card DRAWS at boot,
     NONE after one sync.

     One line, obeying the two rules the holder already has rather than
     restating them:
       · ONE CLASSIFIER — `classifyReceipt`, never a local re-decision, so the
         holder and the toast can never disagree about which night this was. A
         restored receipt classifies away by construction; asking anyway is what
         keeps that true if the stored shape ever drifts.
       · HOLE-FILLING ONLY — a holder already populated belongs to an absence
         THIS session applied, which is the fresher statement; a restore may
         never evict it.
     Nothing is credited by either write — see this function's rule 2. */
  if (!lastAwayReceipt && classifyReceipt(summary) === 'away') lastAwayReceipt = summary;
  return summary;
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
    /* ── WHY THE RUN STOPPED, AND ON WHAT (b515, QA) ────────────────────────
       `burnt` was a hardcoded 0 and `stoppedBy`/`stoppedById` were not read at
       all — while FOUR client sites render them (home-dashboard.js's away card
       at :531/:536/:625/:758 and legacy.js's welcome modal at :14295/:14298).
       Under the local away engine `processOffline` filled the flat receipt
       itself, so the omission was invisible; b515 deleted that engine and made
       this function the ONLY translator, at which point a supply-exhausted
       night — the exact b345 scenario, 8 Raw Shrimp against an 8-hour absence
       that earns for 31 seconds — renders as eight hours of honest pay.

       These three now come off the payload, STATED and never inferred: a
       renderer that derived the stop from `paidMs < awayMs` would print a
       shortage on every ordinary night, because tick flooring guarantees the
       inequality (B345-1's own third case).

       ⚠ THE SERVER HALF IS STILL MISSING AND IS FILED, NOT FIXED HERE.
         supabase/functions/hr-accrue/index.ts (~1163) does not put `stoppedBy`,
         `stoppedById` or `burnt` on the `away:` payload, although `out.summary`
         holds all three and `accrual.js` already journals them as
         `meta.stopped` / `meta.out_of`. Until that ships these read null/0 on a
         live envelope — which is the honest degradation (say nothing) rather
         than the old one (claim a full night). See DISCOVERIES.md 2026-09-07,
         routed to Backend + Systems with the edge redeploy it needs. */
    burnt: Math.max(0, Number(a.burnt) || 0),
    /* A STOP IS A STRING OR IT IS NOTHING. An empty string, a number or an
       object would each reach a renderer as a truthy "something stopped" with
       nothing to say about it, which is worse than silence. */
    stoppedBy: (typeof a.stoppedBy === 'string' && a.stoppedBy) ? a.stoppedBy : null,
    stoppedById: (typeof a.stoppedById === 'string' && a.stoppedById) ? a.stoppedById : null,
    /* WHICH BENCH, and HOW FAST it eats. Both are stated by the simulation
       (`skill`, `stoppedPerHour`) for the same reason the stop is: the card
       says "Cooking ran out of Raw Shrimp 31s in — it eats about 940/hr, so
       stock up", and every one of those numbers has to come from the run that
       actually happened. A card that re-derived the rate would be a second
       estimator of a night that is already settled. */
    stoppedSkill: (typeof a.stoppedSkill === 'string' && a.stoppedSkill) ? a.stoppedSkill : null,
    stoppedPerHour: Math.max(0, Number(a.stoppedPerHour) || 0),
    /* HOW MUCH OF THE WINDOW ACTUALLY EARNED. `awayMs` is the CREDITED span;
       `paidMs` is the part of it the run was alive for, and it is what
       home-dashboard.js :524 prints as "…31s in". The server has always sent it
       (index.ts `paidMs: out.summary.paidMs`); this function simply never read
       it, so the card fell back to the whole window and a run that stopped 31
       seconds in read as the full night. Defaults to the credited span, which
       is the truthful reading when nothing stopped. */
    paidMs: Number.isFinite(Number(a.paidMs)) ? Math.max(0, Number(a.paidMs)) : ms,
    combat: a.kills ? { kills: Number(a.kills) || 0, crits: Number(a.crits) || 0, died: !!a.died } : null,
    /* ── DEATH, AT THE TOP LEVEL (ruling 2b, 2026-08-31) ─────────────────────
       These three are the shape legacy.js's own summary has carried since b341
       and every welcome-back renderer reads (`home-dashboard.js` asks
       `off.diedTo || c.diedTo`; `maybeShowWelcome` prints the row off `_off`).
       This translation carried NONE of them: a server-stated death arrived with
       the foe missing, and on a 0-KILL death `combat` is null too, so
       `receiptDied()` read false and the death row was dropped entirely. The
       absence that most needs explaining is exactly the one that ended sixty
       seconds in, and it was the one the receipt could not describe.

       `diedAfterMs` comes from `paidMs`, which is what the SERVER sets it from
       (accrual.js `windowEnvelope`: the earning span is `survivedMs` when the
       run died) — the same meaning legacy.js gives the field, not a second one. */
    died: !!a.died,
    diedAfterMs: a.died ? (Number(a.paidMs) || 0) : 0,
    diedTo: a.died ? (a.diedTo || null) : null,
    /* THE AUTO-EAT STATE FOR THIS SPAN, as the engine ran it. `null` when the
       server did not state one (a deployment older than this build) — and that
       null is load-bearing: the death row then names WHAT killed the player but
       not WHY nothing healed them, which is the honest outcome. It must never
       be reconstructed from the live toggle; that is a different instant, and
       b341's rule for this row is STATED, NOT INFERRED. */
    autoEat: (a.autoEat && typeof a.autoEat === 'object')
      ? { enabled: !!a.autoEat.enabled,
          pct: Number(a.autoEat.pct),
          /* `hadFood` (First-Night Idle Rescue). The THIRD cause of a no-heal
             night, and the only one whose fix is "cook something": auto-eat on,
             threshold sane, empty bag. Derived by the engine at WINDOW START
             from the same chooser the handler used — never from the bag as it
             stands now, which is the bag AFTER the night ate out of it.
             `undefined` (not false) when the server did not state it, so an
             older deployment claims nothing rather than claiming starvation. */
          hadFood: (typeof a.autoEat.hadFood === 'boolean') ? a.autoEat.hadFood : undefined }
      : null,
    /* ── THE RECOVERY PAYLOAD (First-Night Idle Rescue) ────────────────────
       A death is no longer the end of a night, so `died` alone can no longer
       describe one. These three are STATED BY THE SIMULATION (b341's rule) and
       are what let the receipt say "fell 4 times, 8m spent recovering, still
       1:47 to go" instead of a renderer dividing lost time by two minutes and
       guessing. 0 on a server that predates Recovery, which reads as "no
       recovery happened" — the honest degradation. */
    deaths: Math.max(0, Number(a.deaths) || 0),
    recoverMs: Math.max(0, Number(a.recoverMs) || 0),
    recoverRemainingMs: Math.max(0, Number(a.recoverRemainingMs) || 0),
    /* THE LADDER AS CHARGED, one entry per fall. Stated by the simulation, and
       the receipt renders it verbatim — a card that regenerated the doubling
       from a count would be wrong (and harsher than the truth) on every night
       that met the novice clamp or the 64-minute cap. */
    recoverLadder: Array.isArray(a.recoverLadder)
      ? a.recoverLadder.map((v) => Math.max(0, Number(v) || 0)) : [],
    /* THE RETREAT's pass-through fields. Nothing is inferred, and `retreatMs`
       stays `null` rather than 0 when the server stated none, because 0 means
       "on the very first tick" and a truthiness test would render the worst
       night as a clean one (the `dryMs` trap). `retreatFoodless` is the bag AT
       THE FALL, deliberately not `autoEat.hadFood` (window-open). */
    retreatMs: Number.isFinite(Number(a.retreatMs)) ? Math.max(0, Number(a.retreatMs)) : null,
    retreatFoodless: !!a.retreatFoodless,
    retreatFalls: Math.max(0, Number(a.retreatFalls) || 0),
    /* The slice of the credited window that paid nothing because the hero had
       already gone home. 0 on every night that did not retreat. */
    idleMs: Math.max(0, Number(a.idleMs) || 0),
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

/* ── WHY NOTHING HEALED THEM (Designer ruling 2b, 2026-08-31) ───────────────
   The ruling arms the auto-eat ON/OFF sync — a player may switch off a
   mechanic their overnight survival depends on — on THREE binding conditions,
   and this is the second: *"the return receipt NAMES the cause on a death.
   STATED, NOT INFERRED."*

   ⚠ THE WHOLE POINT IS WHAT THIS FUNCTION REFUSES TO DO. It reads the auto-eat
     state THE RECEIPT CARRIES — the state the engine ran that span with — and
     nothing else. Reconstructing the sentence from `HearthriseAuto.getEat()`
     would be describing a different instant: a player who comes back to a
     corpse and switches auto-eat on before opening the modal would be told
     their death happened with it running. That is b341's own standard for this
     row, and it is why `summaryFromAway` had to grow a field rather than a
     renderer growing a lookup.

   `null` is the honest answer in three distinct cases, and they are
   deliberately not distinguished: nobody died; the receipt predates the field
   (an older Edge deployment — self-configuring, no flag to forget); or
   auto-eat was on and simply lost the fight, which is a gear problem and
   already has copy of its own on the death sheet.

   THE DIAL AND THE SWITCH ARE ONE ANSWER because they are one outcome: a 0%
   trigger point reproduces the 0-heal night exactly, through a key that has
   been live since b499. The ruling covers both, so this does too.

   Pure. Returns `{key, clause, sentence}` — the KEY is the branch (assertable),
   the copy is rewordable, so a test pins the rule and not a sentence. Two
   forms because there are two placements and neither may re-punctuate the
   other's: the modal row joins the CLAUSE onto "You died to X — …", and the
   durable Home card, which already ends its own sentence, appends the
   SENTENCE. One source, so the surfaces cannot drift. */
export function receiptDeathCause(summary) {
  const s = summary || {};
  if (!receiptDied(s)) return null;
  const ae = s.autoEat;
  if (!ae || typeof ae !== 'object') return null;      // not stated → claim nothing
  const said = (key, clause, sentence) => ({ key, clause, sentence });
  if (ae.enabled === false) {
    return said('auto-eat-off', 'auto-eat was off, so nothing healed you',
      'Auto-eat was off, so nothing healed you.');
  }
  const pct = Number(ae.pct);
  if (Number.isFinite(pct) && pct <= 0) {
    return said('threshold-zero', 'your auto-eat trigger was at 0%, so nothing healed you',
      'Your auto-eat trigger was at 0%, so nothing healed you.');
  }
  /* THE THIRD CAUSE, AND THE FIRST-NIGHT ONE (First-Night Idle Rescue).
     Auto-eat on, trigger sane, and the bag empty — which is the state EVERY new
     character is in, and the state the whole Recovery ruling exists because of.
     It is LAST in the priority order deliberately: the switch and the dial are
     things the player DID, and a player who turned auto-eat off does not need
     to be told to go cooking, they need to be told about the switch. Stated by
     the engine at window start (`autoEat.hadFood`), so a bag refilled between
     the death and the modal cannot rewrite history.
     ⚠ `=== false`, NOT `!ae.hadFood`. `undefined` means an older deployment did
       not state it, and a truthiness test would tell every one of those players
       their bag was empty. */
  if (ae.hadFood === false) {
    return said('no-food', 'you had no cooked food, so nothing healed you',
      'You had no cooked food, so nothing healed you.');
  }
  return null;
}

/* ── ATTENDANCE: DID THE PLAYER WATCH THIS SPAN LAND? (2026-09-06) ─────────
   THE REPORT (Paione): "the constant syncing in the game while playing
   actively." It is not a network storm — 14 Supabase calls in 65 s, ten of
   them the session heartbeat. It is the SENTENCE, again. The settle cadence is
   90 s (`SETTLE_INTERVAL_MS`, and sooner on a rare-drop event), so a player who
   sits and fights is told "Synced — +3 items, +40 XP" every minute and a half,
   for drops and XP they just watched land in the combat log. A receipt is
   news; a receipt for something you were looking at is noise, and noise that
   arrives on a timer reads as a malfunction.

   THE RULE (Designer, final authority): AN ATTENDED LIVE SETTLE NARRATES
   NOTHING. Speech is reserved for what the player could NOT have seen — a real
   absence (>= SYNC_MAX_MS, unchanged), a switch ("Collected", unchanged), a
   death (always, b343, unchanged), and a market listing that sold while they
   were on the combat screen (the sale line — the one thing on a sync receipt
   that nobody watched happen).

   ── WHY THIS IS NOT THE `document.hidden` THE BLOCK ABOVE REJECTED ─────────
   b361 rejected visibility as a CLASSIFIER, and that ruling stands: the label
   on a receipt is still derived from the server-stated span and nothing else,
   because a tab that was closed all night cannot observe its own absence.
   Visibility here gates SPEECH ONLY — never the label, never a payment — and
   it is used in the one direction where being unobservable is harmless:

     ATTENDANCE MUST BE PROVEN, NEVER ASSUMED. Silence requires positive
     evidence that this document was continuously visible from before the
     credited window began. A fresh boot (the tab-close absence, the exact case
     b361 named), an unknown state, a module that never wired, a span that
     started while hidden: none of those can prove it, so all of them SPEAK.
     If we cannot show that you saw it, we tell you.

   Both timestamps are on the CLIENT clock — `at` is `nowMs()` at receipt-write
   time and `visibleSince` is a locally observed instant — and what sits between
   them is a DURATION, which is clock-agnostic. The server's `windowFrom` is
   deliberately NOT read here: it is on the SERVER clock, and comparing it to a
   local observation would let skew decide whether the game speaks. */

let visibleSinceAt = 0;

/** Note that the document became visible (or hidden, with `false`). Impure by
    design; the predicate that reads it is pure and takes the value. */
export function noteVisibility(visible, atMs) {
  visibleSinceAt = visible ? (Number(atMs) || nowMs()) : 0;
  return visibleSinceAt;
}

/** The instant this document last became visible, or 0 for "cannot prove it". */
export function visibleSince() { return visibleSinceAt; }

/**
 * Was the whole credited window spent with this document in front of the
 * player? Pure: receipt + the observed visible-since instant in, boolean out.
 * FALSE is the safe answer and is what every unprovable case returns.
 */
export function receiptAttended(summary, visibleSinceMs) {
  const s = summary || {};
  const vs = Number(visibleSinceMs);
  if (!Number.isFinite(vs) || vs <= 0) return false;    // hidden now, or never observed
  const at = Number(s.at);
  /* Same span-reading order as `classifyReceipt`, deliberately, so the two
     cannot form different ideas of how wide one window was. */
  const span = Number(s.awayMs) || (Math.max(0, Number(s.hrs) || 0) * 3600000);
  if (!Number.isFinite(at) || at <= 0 || span <= 0) return false;
  return vs <= (at - span);
}

/* The most recent receipt that CLASSIFIED AS AWAY, held apart from
   `G.lastOfflineSummary` so a 90-second sync cannot evict the night's card.
   Written in exactly one place (applyEnvelope, above); read by the Home away
   card; cleared by `__resetAwayReceipt` for tests that land an away fixture. */
let lastAwayReceipt = null;

/** The away card's source of truth. Null when this session has seen no absence. */
export function getLastAwayReceipt() { return lastAwayReceipt; }

/** TEST SEAM ONLY. An away fixture landed by one test would otherwise stay on
    the Home screen for the next thirty minutes of the suite. */
export function __resetAwayReceipt() { lastAwayReceipt = null; }

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
 *
 * `opts.visibleSince` (the instant this document last became visible, 0 for
 * unknown) silences an ATTENDED sync — the player watched those numbers land,
 * so repeating them on a 90 s timer is noise. Omitted / 0 keeps every prior
 * caller on the old behaviour, which is the speaking one. See the attendance
 * block above; a death is already routed to 'away' and cannot be silenced here.
 */
export function receiptNotice(summary, opts) {
  const o = opts || {};
  const kind = classifyReceipt(summary);
  const credit = receiptCredit(summary);
  const attended = (kind === 'sync') && receiptAttended(summary, o.visibleSince);
  const announce = !attended && (credit.any || receiptDied(summary) || kind !== 'sync');
  return { kind, credit, attended, announce };
}

/* ── THE TWO CLAUSES THE TOAST LOST WHEN THE LOCAL ENGINE DIED ──────────────
   b345 gave the away receipt a "your supplies ran out" line and Recovery rev. 2
   gave it a "you got back up" line; b515 deleted the local `processOffline`
   that produced both, and `receiptSentence` — the ONLY sentence source since —
   never had either. So the two absences that most need explaining, a night
   that stopped 31 seconds in and a night with four falls in it, toasted as
   eight hours of honest, uninterrupted pay. b518 put the fields on the away
   payload (`stoppedBy`, `stoppedById`, `stoppedSkill`, `stoppedPerHour`,
   `deaths`, `recoverMs`, `recoverLadder`); these two read them.

   Both are pure and STATED-ONLY (b341's rule — nothing is inferred, and in
   particular `paidMs < awayMs` is NOT a stop test), and both speak the
   vocabulary of the two surfaces that already render these fields: the Home
   away card (`features/home-dashboard.js` — STOP_COPY and its "You fell"
   block) and the welcome-back modal (`legacy.js` — the stop row and the
   picked-up row). Three surfaces describing one night in three voices is how a
   player learns to distrust all three, so the toast is the SHORT FORM of the
   same sentence, never a fourth reading.

   Exported so the suite can read them without a live envelope, for the same
   reason `receiptSentence` is. */

/* WHICH STOP REASONS THIS SENTENCE CAN HONESTLY DESCRIBE — a table, not a
   negation, and the same shape (and the same single row) as the away card's
   STOP_COPY. `stoppedBy` carries reasons that are NOT "you ran out of
   something": 'idle' is no activity at all, 'gate' is a locked recipe, 'level'
   is a level gate, 'budget' is the accrual engine asking for a smaller
   proposal. Speaking "ran out of materials" for any of those would be a
   fabricated cause on the one surface that exists to state a real one, so an
   unknown reason is SILENT and a new reason is a row here. 'death' is
   excluded for the card's own reason: it reports through this seam but owns
   richer copy of its own. */
const STOP_CLAUSE = Object.freeze({
  supplies: true,
});

/** "Cooking ran out of Raw Shrimp 31s in — nothing was earned after", or null. */
export function receiptStopClause(summary, opts) {
  const o = opts || {};
  const s = summary || {};
  const by = (typeof s.stoppedBy === 'string' && s.stoppedBy) ? s.stoppedBy : null;
  if (!by || !STOP_CLAUSE[by]) return null;
  /* Names are resolved by the CALLER (`itemLabel` / `skillLabel`, the same
     injection shape as `foeLabel`) because ITEMS and SKILLS_DEF are data this
     pure module must not reach for. The fallbacks are the away card's own
     ("materials" / "Your run"), so an unwired call site says something true
     rather than "undefined". */
  const what = (typeof o.itemLabel === 'function' && s.stoppedById)
    ? (o.itemLabel(s.stoppedById) || 'materials') : 'materials';
  const skill = (typeof o.skillLabel === 'function' && s.stoppedSkill)
    ? (o.skillLabel(s.stoppedSkill) || 'Your run') : 'Your run';
  /* HOW FAR IN. `paidMs` is stated; the span is printed only when a formatter
     was injected, because a second formatter here would round differently from
     the card's and the two would then disagree about one instant. */
  const paid = Math.max(0, Number(s.paidMs) || 0);
  const when = (paid > 0 && typeof o.spanLabel === 'function') ? o.spanLabel(paid) : null;
  return skill + ' ran out of ' + what + (when ? (' ' + when + ' in') : '')
    + ' — nothing was earned after';
}

/** "You fell 4 times to the Goblin — knocked out for 8m in total; your run
 *  picked up each time", or null. Gated exactly as the card and the modal gate
 *  it: `deaths` STATED (a `died` with no count is one pre-Recovery fall and has
 *  no recovery story to tell), and the run did not actually stop on the death. */
export function receiptRecoveryClause(summary, opts) {
  const o = opts || {};
  const s = summary || {};
  const deaths = Math.max(0, Number(s.deaths) || 0);
  /* ⚠ AND SILENT ON A RETREAT. "your run picked up each time" is rev. 2's
     headline promise and it is FALSE of a night the hero ended by going home;
     the retreat has its own sentence, one author (HearthriseHome). */
  if (deaths < 1 || s.stoppedBy === 'death' || s.stoppedBy === 'retreat') return null;
  const foeName = (typeof o.foeLabel === 'function') ? o.foeLabel(s.diedTo) : null;
  const foe = foeName ? (' to the ' + foeName) : '';
  const recMs = Math.max(0, Number(s.recoverMs) || 0);
  const held = (recMs > 0 && typeof o.spanLabel === 'function') ? o.spanLabel(recMs) : null;
  /* THE SINGLE FALL KEEPS ITS OWN SHAPE, exactly as the card does: one fall is
     one event, many falls are a night, and quoting the first one's span would
     read as the only one. */
  if (deaths === 1) {
    return 'You fell' + foe
      + (held ? (' — knocked out for ' + held + ', then your run picked up')
              : ' — your run picked up');
  }
  return 'You fell ' + deaths + ' times' + foe
    + (held ? (' — knocked out for ' + held + ' in total; your run picked up each time')
            : ' — your run picked up each time');
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
  const n = receiptNotice(s, o);
  /* THE ONE THING ON A SILENT SYNC THAT IS STILL NEWS. A listing selling is
     the only line on a live-settle receipt the player cannot have watched
     happen — they were on the combat screen, not the market — so it survives
     both the attendance rule and the zero-credit rule, alone and unprefixed.
     "Synced — 2 listings sold" would put the noise back to carry the news. */
  if (!n.announce) return (n.kind === 'sync' && o.saleLine) ? o.saleLine : null;
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
  /* ── A DEATH IS NOT AN ABSENCE, AND MUST NOT WEAR ITS WORDS ─────────────
     `classifyReceipt` sends every death down the 'away' branch on purpose
     (b343: "a death is never a quiet toast"). Until 2026-08-31 a 0-KILL death
     could not reach here at all — `summaryFromAway` carried no top-level
     `died` and `combat` is null with no kills — so this branch was only ever
     entered by deaths that had also earned something. Closing that receipt gap
     pointed the b361 defect straight back at the line below: a character who
     dies inside an ATTENDED 90 s settle has an `hrs` of 0 and no credit, and
     the generic sentence would announce **"⏰ Away 0h — the server credited +0
     items, +0 XP, +0 gold"** at a player sitting at the keyboard watching it
     happen. That is the exact sentence b361 exists to have deleted.

     So a death gets its own sentence: it says what happened, quotes only what
     was actually credited, and never claims an absence. The FOE is resolved by
     the CALLER (`opts.foeLabel`, the same injection shape as `spanLabel`)
     because this module is pure and MONSTERS is data — the away card and the
     welcome modal resolve `diedTo` the same way. */
  /* ── THE AWAY BRANCH, AND ONLY THE AWAY BRANCH, SAYS WHAT HAPPENED ──────
     An away receipt owes the player the shape of the night, not just its
     total: WHY it stopped and WHETHER they got back up. Both clauses are
     confined here on purpose — b510's silence ruling means an attended live
     settle narrates nothing, and a 'switch' is a window the player closed
     themselves. Ordered as the Home card orders its notes: what happened to
     the character first, then what happened to the run. */
  const recovery = receiptRecoveryClause(s, o);
  const stop = receiptStopClause(s, o);
  const extra = (recovery ? (' · ' + recovery) : '') + (stop ? (' · ' + stop) : '');
  /* A RECOVERED NIGHT IS NOT A DEATH NOTICE. The b343 sentence ends "nothing
     was earned after", which was true when a death was terminal and is a lie
     under Recovery rev. 2 — the run picked up and kept paying. So a receipt
     that STATES a recovery takes the away sentence with the fall clause on it
     (still announced, still leading with the fall — b343's rule is that a
     death is never a QUIET toast, not that it must wear these exact words),
     and the terminal death keeps b343's branch untouched. Same switch the away
     card uses (`deaths` stated and `stoppedBy !== 'death'`), so the durable
     surface and the toast cannot disagree about which night this was. */
  if (receiptDied(s) && !recovery) {
    const foe = (typeof o.foeLabel === 'function') ? o.foeLabel(s.diedTo) : null;
    const why = receiptDeathCause(s);
    const gains = [];
    if (c.items > 0) gains.push('+' + c.items + ' items');
    if (c.xp > 0) gains.push('+' + c.xp + ' XP');
    if (c.gold > 0) gains.push('+' + c.gold + ' gold');
    return 'You died' + (foe ? (' to ' + foe) : '') + ' — '
      + (why ? why.clause + (gains.length ? '. Credited ' + gains.join(', ') : '')
             : (gains.length ? 'credited ' + gains.join(', ') + ' before it'
                             : 'nothing was earned after'))
      + extra + tail;
  }
  return '⏰ Away ' + s.hrs + 'h — the server credited +' + c.items + ' items, +'
    + c.xp + ' XP, +' + c.gold + ' gold' + extra + tail;
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
    /* The wiring is read THROUGH the env for the same reason the clock is: it
       is ambient module state, and a test that cannot control it can only
       assert the loop in whatever position the previous test happened to leave
       it. `enabled` is a constant since b515 — the retirement left decideSettle's
       `switch-off` arm reachable only from a test that passes it explicitly. */
    enabled: () => true,
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
  /* ⚠ A PENDING FALL OUTRANKS THE VISIBILITY RULE. `hidden` exists to stop a
     background tab burning invocations on a run nobody is watching; a player
     face-down behind a sheet is not that case — they are BLOCKED until the
     server prices the window, and a backgrounded tab that declines to ask is a
     run that never resumes. Every other reason to decline still applies, and
     the server floor still refuses a short span. */
  if (!st.visible && !st.fallPending) return { settle: false, reason: 'hidden', waitMs: wait };
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
    fallPending: !!(fall.at && !fall.answered),
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
  if (!config) return { settled: false, reason: 'unconfigured' };
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
  /* The attendance clock starts HERE and nowhere else — one wiring point, so a
     second listener cannot acquire its own idea of when the player arrived.
     Wiring runs on the authority path after sign-in, which is later than boot;
     that only ever makes attendance harder to prove, which is the safe way for
     it to be wrong. */
  noteVisibility(!document.hidden, nowMs());
  const hide = () => { try { noteVisibility(false); } catch (e) {} try { settleOnUnload(); } catch (e) {} };
  window.addEventListener('pagehide', hide);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hide(); return; }
    noteVisibility(true, nowMs());
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
  if (!config) return { checked: false, cleared: false, reason: 'unconfigured' };
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
    ACCRUE_OUTCOMES, ACCRUE_SHEET_ID,
    ACCRUE_REPLACE_ACK_KEY, ACCRUE_REPLACE_SHEET_ID, MAX_SLOT,
    isServerAccrualEnabled, setServerAccrualEnabled, __clearAccrualOverride,
    clampSlot, resolveActiveSlot, mayClientWrite,
    /* THE RECOVERY LINE, read-only. A function rather than a value so a caller
       cannot capture a stale number, and read-only so no surface can author it:
       the client renders `recoveringUntilMs() - Date.now()` and nothing else. */
    recoveringUntilMs: () => recoveringUntil,
    isRecovering: () => recoveringUntil > Date.now(),
    /* THE ATTENDED FALL (2026-09-06 P0). `noteFall` records the question the
       combat tick just asked; `fallState` / `isKnockedOut` read the SERVER's
       answer back. The death sheet renders `fallState()` and nothing it
       computed itself. `accruedToMs` / `deathsToday` / `deathsLifetime` are the
       envelope's own scalars, functions for the same reason the recovery line
       is one — a caller must not be able to capture a stale number. */
    noteFall, clearFall, fallState, isKnockedOut, FALL_CONFIRM_TIMEOUT_MS,
    FALL_REASK_MARGIN_MS, nextFallReaskAt, fallReaskAt,
    accruedToMs, deathsToday, deathsLifetime,
    /* THE SERVER-PRICED ABSENCE, for every "welcome back" surface. Read it;
       never re-derive one from `G.lastSeen` (b514). */
    bootAccruedToMs, serverAwaySpanMs, __setBootAccruedToForTest,
    describeReplacement, isReplacementAcknowledged, acknowledgeReplacement, isReconcilePending,
    isEnvelopeAbsolute, ENVELOPE_MERGE_KEY, envelopeDrift, noteEnvelopeDrift,
    resetEnvelopeDrift, inventoryFlipReadiness,
    flipDriftSummary, reportFlipDrift, startFlipDriftReporter, __resetFlipDriftReport,
    isInventoryAbsolute, markInventoryAuthorityLive, isInventoryAuthorityLive,
    maybeAutoArm, __setInventoryArmEnabledForTest, __resetAutoArm,
    envelopeBaselineComplete, noteBaselineComplete, isBaselineCompleteSeen, __resetBaselineComplete,
    serverOwnedItem, serverConsumedItem, serverAccruedSkill, markEquipAuthorityLive,
    equippedCount, unaccountedEquipped, consumedKeysOf,
    /* THE PENDING-CONSUMPTION LEDGER (live P0 — "eaten food gets restocked").
       Re-published here as well as on window.HearthrisePendingConsume so a
       caller that already holds the accrual module does not need a second
       lookup, and so the suite can drive the fold through the same handle it
       drives applyEnvelopeState with. */
    noteConsumed: pendingConsume.noteConsumed,
    releaseConsumed: pendingConsume.releaseConsumed,
    pendingConsumeFor: pendingConsume.pendingFor,
    pendingConsumeSnapshot: pendingConsume.pendingSnapshot,
    clearPendingConsume: pendingConsume.clearPendingConsume,
    foldPendingConsume: pendingConsume.foldPendingConsume,
    /* WHO OWNS AN AUTO-EAT'S DEBIT — observed off `state.auto_eat_enabled`.
       serverAutoEatSettings is the b499 settings-sync DEDUPE ANCHOR (all three
       projected columns); it answers "what does the server already believe",
       never "what should it believe". */
    noteServerAutoEat, serverAutoEats, clientOwnsAutoEatDebit, serverAutoEatSettings,
    noteAutoEatVerb,
    __noteAutoEatSettings, __resetServerAutoEat,
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
    awaySettleDone, __resetAwaySettleLatch, dropPendingCombatXp,   // settle-first, read by legacy.js's combat-XP cadence
    requestAccrual, beginServerAccrual, applyEnvelope, applyEnvelopeState, reconcileFall, reconcileHp, serverHp, __resetServerHp, reconcileInventory, bagHydrated, __forgetBagHydrated, reconcileBank, reconcileBankRungs, reconcileWorkers, reconcileCompanions, reconcileFarm, reconcileTraits, reconcileHeroSlots, reconcileDungeonCooldowns, reconcileEventCounters, EVENT_COUNTER_PROJECTION, reconcileCombatStyle, summaryFromAway, reconcileAwayReceipt,
    SYNC_MAX_MS, receiptCredit, receiptDied, receiptDeathCause, classifyReceipt, receiptNotice, receiptSentence,
    getLastAwayReceipt, __resetAwayReceipt,
    receiptStopClause, receiptRecoveryClause,
    noteVisibility, visibleSince, receiptAttended,
    getAccrualState, resetAccrualGate, setAccrualHooks,
    showAccrualHaltedSheet, hideAccrualHaltedSheet, verifyHaltedState,
  };
  /* Boot the low-cadence inventory-flip drift reporter. Idempotent, window-only,
     purely observational — reads the soak counters and emits a periodic aggregate
     summary through the analytics funnel so the arm-safety soak is measurable
     across the playerbase. Arms nothing. */
  try { startFlipDriftReporter(); } catch (e) {}
}
