// Cloud sync adapter — Supabase-ready stub.
//
// Subscribes to the state-event bus (src/net/events.js), batches changes,
// and POSTs them to a configurable endpoint. Falls back to localStorage when
// the network is unavailable or the endpoint is not configured.
//
// Usage (when Supabase is set up):
//   import { setupSync } from './net/sync.js?v=367';
//   setupSync({
//     endpoint: 'https://<project>.supabase.co/rest/v1/game_events',
//     authToken: () => window.localStorage.getItem('supabaseSession'),
//     userId: () => window.G?.userId,
//     batchIntervalMs: 5000,
//   });
//
// During local-only play, call setupSync() with no args — it stays in offline
// mode and just buffers events to localStorage for later replay.

import { on, snapshot } from './events.js?v=367';
/* b342 — WHICH CHARACTER'S SAVE IS THIS? The same resolver src/net/{accrue,
   character,record}.js use, imported rather than re-derived: multi-character.js
   owns the answer and a second reader of that record is a second thing to
   drift. accrue.js has no imports of its own, so this adds no cycle. */
import { resolveActiveSlot } from './accrue.js?v=367';
/* Read-only, for the cloud-save self-test's report. A balance the client has
   not been told is a different fact from a balance of zero. */
import { balanceState } from './balance.js?v=367';

const BUFFER_KEY = 'hearthrise:syncBuffer';
const SNAPSHOT_KEY = 'hearthrise:cloudSnapshot';
const DEVICE_KEY = 'hr:deviceId';
const MAX_BUFFER = 500;
// b301: how recently ANOTHER device must have written for us to call the account
// "active elsewhere". Two devices both save on the ~60s cadence, so a 2.5-min
// window reliably catches a genuinely concurrent session without false-positiving
// on a device you closed a few minutes ago.
// b366 — RETIRED AS A WARNING TRIGGER, kept as a documented constant so the
// mistake is not made twice. "Someone wrote the save recently" is NOT evidence of
// a concurrent session: on EVERY clean device handoff the departing device's b299
// pagehide keepalive snapshot lands seconds before the arriving device connects,
// so this window was ALWAYS satisfied and the arriving device was ALWAYS told
// "this account is being played on another device — close one". That is the
// warning Tyler hit just moving from his computer to his phone. Liveness is a
// property of the session CLAIM (a heartbeat), not of the last write.
const CONCURRENT_WINDOW_MS = 150000;   // eslint-disable-line no-unused-vars
// b303: how long an owner's heartbeat can go quiet before another tab may take
// over its claim. Poll is ~15s and heartbeat rides every poll, so 3 missed beats
// = the owner is really gone (tab closed), and the surviving tab reclaims instead
// of falsely locking itself out.
const CLAIM_STALE_MS = 50000;
const INSTANCE_KEY = 'hr:instanceId';
// b366: how long a cached claim view may be reused before a decision that
// matters (warn / refuse an upload) re-reads it. The claim poll is 15s, so a
// view older than this means the poll has missed a beat and we ask again.
const CLAIM_VIEW_TTL_MS = 20000;
// b366: which foreign instance we have already warned about, persisted per TAB.
// sessionStorage (not localStorage) because it is exactly "this running game
// instance" — the same scope the claim keys on — and it SURVIVES the
// location.reload() that a cloud restore performs, which is what stopped the
// module-scope flag from working: the restore path reloads, the module is
// re-evaluated, the flag resets, and the player is accused a second time.
const CONCURRENT_WARN_KEY = 'hr:concurrentWarnedFor';

let config = null;
let buffer = [];
let flushTimer = null;
let concurrencyTimer = null;
let claimTimer = null;
let lastSnapshotAt = 0;
let lastCloudSaveAt = 0;   // b299: last CONFIRMED cloud upload (for the verify tool + status)
let concurrentWarned = '';   // b366: fallback when sessionStorage is unavailable
// b366 — THE ONE CLAIM VERDICT. { owner, hbMs, at } — who holds the session
// claim, when their heartbeat last beat, and when we read it. Written by
// checkSessionClaim / claimSession / fetchClaimRow and read by everything that
// needs to know whether another instance is genuinely alive. One fetch, one
// answer: concurrency detection, eviction and the upload guard used to disagree
// because they each asked a different question of a different table.
let claimView = null;
let paused = false;        // b302: set when this device is evicted — stops all cloud writes
let evicted = false;       // b302: latch so we fire onEvicted once
// b314: hold ALL snapshot uploads until the first cloud pull + reconcile has run.
// Without this a fresh/empty local can upload over a real cloud in the ~5s before
// pullAndMaybeRestore() finishes its network read (the flush loop's first
// snapshotIfDue fires with lastSnapshotAt=0, so it is immediately "due"). auth.js
// holds before the pull and releases after decideRestore resolves — so the
// reconcile decision, not a race, decides whether local ever reaches the cloud.
let snapshotHold = false;

// ── b319: TELEMETRY CONTAINMENT ─────────────────────────────────────────────
// THE INCIDENT: setupSync subscribed with on('*') and flush() wrote ONE ROW PER
// EVENT every 5s — no allowlist, no sampling, no cap. Five of the eleven emit
// sites fire inside per-kill / per-item / per-tick loops, so `game_events` grew
// to 1,601,032 rows / 229 MB from SIX players in 3.45 days (94% of the whole
// database; 77,320 rows and 11.1 MB per player per day). Measured mix:
//   kill 899,745 · gather 403,142 · eat 109,314 · buffApply 108,565 ·
//   companionProc 73,850   —vs—   companionEquip 1,538 · companionLevelUp 1,063 ·
//   questClaim 507 · companionUnlock 443 · dungeonClear 102.
// At ~143 B of row overhead against a ~35 B payload, ROW COUNT is the cost, not
// size. So the fix is structural, in three layers:
//   1. ALLOWLIST — only genuinely low-frequency, diagnostically useful events
//      reach the network. The five loop-driven types are dropped from the
//      network path entirely; they still fire on the in-process bus
//      (src/net/events.js), which is what other features actually subscribe to.
//   2. KILL SWITCH — event logging can be turned off WITHOUT touching cloud
//      saves. Before this there was no such flag: silencing telemetry meant
//      killing the save path, which is why nobody did it.
//   3. RATE CAP — a hard backstop so a future emit site placed inside a loop
//      cannot recreate this even if someone allowlists it by mistake. Overflow
//      is DROPPED and COUNTED, never buffered.
// Every gate lives in enqueue(), the single entry point to the upload buffer, so
// even a reintroduced on('*') subscription stays contained.
const EVENT_ALLOWLIST = new Set([
  'companionLevelUp', 'companionUnlock', 'companionEquip', 'questClaim', 'dungeonClear',
]);
const EVENT_MAX_PER_FLUSH = 20;    // rows per POST
const EVENT_MAX_PER_MINUTE = 30;   // ~10x the observed allowlisted peak
const EVENT_MAX_PER_HOUR = 200;    // ceiling: 4,800 rows/player/day worst case
const EVENT_LOG_KEY = 'hr:eventLog';   // 'off' disables uploads on this device

let rateMinute = { at: 0, n: 0 };
let rateHour = { at: 0, n: 0 };
let eventDrops = { total: 0, notAllowed: 0, disabled: 0, rateLimited: 0, byType: {} };
// Unsubscribers for our bus subscriptions. setupSync() runs at least twice (once
// at import in offline mode, once more when auth supplies the cloud config); the
// old on('*') never unsubscribed, so the second call left TWO subscribers and
// every event was enqueued — and uploaded — twice.
let eventUnsubs = [];

/** True if this event type is allowed onto the NETWORK path (the local bus is unaffected). */
export function isEventAllowed(type) { return EVENT_ALLOWLIST.has(type); }

/** The kill switch. Defaults ON; disables event upload ONLY — cloud saves are untouched. */
export function isEventLogEnabled() {
  if (config && config.eventLog === false) return false;
  try { if (localStorage.getItem(EVENT_LOG_KEY) === 'off') return false; } catch (e) {}
  return true;
}
export function setEventLogEnabled(on) {
  try { if (on) localStorage.removeItem(EVENT_LOG_KEY); else localStorage.setItem(EVENT_LOG_KEY, 'off'); } catch (e) {}
  if (config) config.eventLog = on ? true : false;
  return isEventLogEnabled();
}

function countDrop(reason, type) {
  eventDrops.total++;
  eventDrops[reason] = (eventDrops[reason] || 0) + 1;
  eventDrops.byType[type] = (eventDrops.byType[type] || 0) + 1;
}

/**
 * The admission gate. Returns true if the event may enter the upload buffer.
 * Pure except for the drop counters + rate windows, so it is directly testable.
 */
export function admitEvent(ev, now = Date.now()) {
  const type = ev && ev.type;
  if (!type) return false;
  if (!isEventLogEnabled()) { countDrop('disabled', type); return false; }
  if (!EVENT_ALLOWLIST.has(type)) { countDrop('notAllowed', type); return false; }
  if (now - rateMinute.at >= 60000) rateMinute = { at: now, n: 0 };
  if (now - rateHour.at >= 3600000) rateHour = { at: now, n: 0 };
  if (rateMinute.n >= EVENT_MAX_PER_MINUTE || rateHour.n >= EVENT_MAX_PER_HOUR) {
    countDrop('rateLimited', type);
    return false;
  }
  rateMinute.n++; rateHour.n++;
  return true;
}

/** Diagnostics for the bug report / console — what got dropped and why. */
export function getEventStats() {
  return {
    enabled: isEventLogEnabled(),
    allowlist: Array.from(EVENT_ALLOWLIST),
    buffered: buffer.length,
    minute: rateMinute.n, hour: rateHour.n,
    limits: { perFlush: EVENT_MAX_PER_FLUSH, perMinute: EVENT_MAX_PER_MINUTE, perHour: EVENT_MAX_PER_HOUR },
    dropped: { ...eventDrops, byType: { ...eventDrops.byType } },
  };
}

/** Test seam: clear the rate windows + drop counters. */
export function resetEventLimiter() {
  rateMinute = { at: 0, n: 0 };
  rateHour = { at: 0, n: 0 };
  eventDrops = { total: 0, notAllowed: 0, disabled: 0, rateLimited: 0, byType: {} };
}

/**
 * b301 — a stable per-DEVICE id (not per-account). Persisted in localStorage so
 * it survives reloads; a fresh install / cleared storage gets a new one. Stamped
 * into every uploaded snapshot so any device can tell whether the last cloud
 * write came from ITSELF or from another device signed into the same account.
 */
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = 'd-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch (e) { return 'd-ephemeral'; }
}

/**
 * b303 — a per-TAB instance id, stored in sessionStorage. Unlike the device id
 * (localStorage, shared by every tab of a browser), sessionStorage is scoped to
 * a single tab and SURVIVES a reload — so it is exactly "one running game
 * instance". This is what the single-active-session claim keys on: two tabs of
 * the same browser are two instances and must not both run. The device id was
 * wrong for this (both tabs shared it, so neither ever saw a "different owner").
 */
function getInstanceId() {
  try {
    let id = sessionStorage.getItem(INSTANCE_KEY);
    if (!id) { id = 'i-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36); sessionStorage.setItem(INSTANCE_KEY, id); }
    return id;
  } catch (e) { return getDeviceId(); }
}

/** Load the offline buffer (events captured while offline / pre-config). */
function loadBuffer() {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (raw) buffer = JSON.parse(raw);
  } catch {}
  // b319: a buffer written before the allowlist existed can hold up to MAX_BUFFER
  // high-frequency rows. Drop them here rather than uploading the backlog on the
  // first flush after the fix ships.
  if (Array.isArray(buffer)) {
    const before = buffer.length;
    buffer = buffer.filter((ev) => ev && EVENT_ALLOWLIST.has(ev.type));
    if (buffer.length !== before) saveBuffer();
  } else buffer = [];
}

function saveBuffer() {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
  } catch {}
}

/**
 * Push an event into the buffer, trimming if too large.
 * b319: THE single entry point to the upload buffer, and therefore where the
 * allowlist / kill switch / rate cap are enforced. Rejected events are counted
 * and discarded — never buffered — so an emit site inside a loop costs nothing
 * but a counter increment.
 */
function enqueue(ev) {
  if (!admitEvent(ev)) return false;
  buffer.push(ev);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  saveBuffer();
  return true;
}

// ── Auth-aware fetch with refresh-and-retry (b149) ──────────────────────
// Supabase access tokens expire (~1h). Previously a save/flush that failed on
// an expired token was caught + console.warn'd and dropped SILENTLY — a player
// could lose a whole session's cloud progress with no signal. Now: on an auth
// error we ask the auth layer to refresh the token (config.onAuthError) and
// retry once, and we report sync-health transitions (config.onSyncFailure /
// onSyncRecovered) so the UI can warn "reconnecting — progress saved locally".
let syncHealthy = true;

function safeCall(fn, arg) { if (typeof fn === 'function') { try { return fn(arg); } catch {} } }

function reportSync(ok, info) {
  if (ok === syncHealthy) return;        // only fire on a health transition
  syncHealthy = ok;
  if (ok) safeCall(config.onSyncRecovered);
  else safeCall(config.onSyncFailure, info);
}

/** Fresh Authorization + apikey headers — read per-call so a retry picks up a refreshed token. */
function withAuthHeaders(base) {
  const h = { ...base };
  if (config.authToken) {
    const tok = typeof config.authToken === 'function' ? config.authToken() : config.authToken;
    if (tok) h['Authorization'] = `Bearer ${tok}`;
  }
  if (config.apiKey) {
    h['apikey'] = typeof config.apiKey === 'function' ? config.apiKey() : config.apiKey;
  }
  return h;
}

/** True if a failed response looks like an expired/invalid token worth a refresh. */
export function isAuthError(status, bodyText) {
  if (status === 401 || status === 403) return true;
  return /jwt expired|pgrst303|token is expired|invalid (jwt|token)/i.test(bodyText || '');
}

// ── b331: THE EXPIRED-TOKEN CIRCUIT BREAKER ─────────────────────────────────
// THE INCIDENT: a live player played for 3+ hours and NOTHING reached the cloud.
// Production edge logs: 3,087 x HTTP 401 from one IP in one continuous block,
// every response carrying `PostgREST; error=PGRST303` (JWT expired) — GET
// game_saves every ~20s, POST game_events 120/hr, GET session_claims 60/hr. The
// token being presented was a real access token that had been ISSUED THE DAY
// BEFORE: auth.js restores `session` from localStorage at boot and hands
// `session.access_token` to `withAuthHeaders` forever, and NOTHING anywhere
// looked at `exp`. `/auth/v1/token` saw ~25 requests in the same 24h, so the
// refresh was not reaching the network at all — the retry-once wrapper asked for
// a refresh, the refresh failed silently inside a `catch {}`, and the SAME dead
// token went straight back on the wire. And because `pullLatestDetailed()` used
// a RAW fetch, its 401 read as "cloud unknown", which correctly holds the b314
// snapshot gate closed — permanently. That hold is why not one POST to
// game_saves appears in the logs: the save path short-circuited before the
// network on every single tick for three hours.
//
// The rule this installs: a request is only put on the wire if we have a token
// we have no reason to believe is dead, and repeated auth failure BACKS OFF and
// then TERMINATES into a state the player is told about. Never an unbounded loop
// presenting a dead JWT.

/**
 * Is this bearer token safe to PUT ON THE WIRE? Pure.
 *   'none'   — nothing to send.
 *   'expired'— a JWT whose `exp` has passed. MUST NOT be sent: the server can
 *              only answer 401, so sending it is pure quota burn.
 *   'ok'     — a JWT still inside its lifetime.
 *   'opaque' — not a decodable JWT. We cannot judge it, so we SEND it. A player
 *              is never locked out on a parsing guess.
 */
export function tokenStatus(tok, now = Date.now(), skewMs = 0) {
  if (!tok || typeof tok !== 'string') return 'none';
  const parts = tok.split('.');
  if (parts.length !== 3) return 'opaque';
  let claims = null;
  try {
    const b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    claims = JSON.parse(atob(b + '==='.slice((b.length + 3) % 4)));
  } catch (e) { return 'opaque'; }
  const exp = Number(claims && claims.exp);
  if (!isFinite(exp) || exp <= 0) return 'opaque';
  return (exp * 1000) - skewMs <= now ? 'expired' : 'ok';
}

export const AUTH_BACKOFF_BASE_MS = 5000;
export const AUTH_BACKOFF_MAX_MS = 300000;   // 5 min ceiling on a single wait
export const AUTH_DEAD_AFTER_TRIES = 6;      // ~155s of doubling
export const AUTH_DEAD_AFTER_MS = 180000;    // …or 3 minutes, whichever first

/** Exponential backoff for consecutive auth failures. Pure. */
export function nextAuthBackoffMs(streak) {
  const s = Math.max(1, Math.floor(Number(streak) || 1));
  return Math.min(AUTH_BACKOFF_MAX_MS, AUTH_BACKOFF_BASE_MS * Math.pow(2, Math.min(s, 20) - 1));
}

export function newAuthGate() {
  return { streak: 0, firstAt: 0, blockedUntil: 0, dead: false, serverFails: 0 };
}

/** May this device put a cloud request on the wire right now? Pure. */
export function decideAuthGate(st, now) {
  if (!st) return { allow: true, reason: 'no-state' };
  if (st.dead) return { allow: false, reason: 'auth-dead' };
  if (st.blockedUntil > now) return { allow: false, reason: 'auth-backoff' };
  return { allow: true, reason: 'ok' };
}

/**
 * The breaker, as a pure reducer, so "three hours of failure costs N requests"
 * is a claim the suite can simulate rather than a claim about code shape.
 *
 *   'ok'              — any authorised response. Full reset.
 *   'auth-fail'       — the SERVER refused us (401/403/PGRST303). Evidence.
 *   'auth-fail-local' — OUR CLOCK's opinion that the token has expired. An
 *                       opinion, not evidence.
 *
 * b331 REVIEW FIX — THE DEAD LATCH REQUIRES SERVER EVIDENCE. The first cut let a
 * purely local verdict terminate a session, which inverted the incident instead
 * of fixing it: a client whose clock runs >1h FAST reads every freshly-minted
 * token as expired, so it would block the send, refresh, call the NEW token
 * expired too, and brick itself in ~155s — a player who synced fine before b331
 * and whose only fault is a wrong system clock, with re-signing-in unable to
 * clear it. Widening a skew constant does not fix that (a 3h-fast clock beats
 * any constant); refusing to let a guess be the sole ground for termination
 * does. `serverFails` is that requirement, and `authPreflight` below is the
 * other half: while the server has not yet corroborated us, we SEND and let the
 * response rule.
 */
export function authGateStep(st, outcome, now) {
  const s = st || newAuthGate();
  if (outcome === 'ok') return newAuthGate();
  const streak = s.streak + 1;
  const firstAt = s.firstAt || now;
  const serverFails = (s.serverFails || 0) + (outcome === 'auth-fail' ? 1 : 0);
  const dead = !!(s.dead || (serverFails >= 1 &&
    (streak >= AUTH_DEAD_AFTER_TRIES || (now - firstAt) >= AUTH_DEAD_AFTER_MS)));
  return { streak, firstAt, blockedUntil: now + nextAuthBackoffMs(streak), dead, serverFails };
}

/**
 * Evidence that OUR CLOCK is wrong rather than the token. Pure.
 * A token our clock calls expired, which the issuer just minted or which the
 * server just accepted, is a statement about this machine — not about the
 * session. There is no constant that can substitute for it.
 */
export function isClockSkewEvidence(statusNow, outcome) {
  return statusNow === 'expired' && (outcome === 'authorised' || outcome === 'refreshed');
}

let authGate = newAuthGate();
let refreshPromise = null;
// Latched, per tab, the moment the evidence above appears. From then on the
// local expiry verdict is discarded entirely and the SERVER is the only
// authority on whether a token is alive — which is what it always should have
// been for this case.
let clockTrusted = true;

export function isClockTrusted() { return clockTrusted; }
/** Test seam + the latch itself. */
export function setClockTrusted(v) { clockTrusted = !!v; }

/**
 * The expiry verdict as it is ACTUALLY applied to a request. Identical to
 * tokenStatus() until our clock has been caught lying, after which an "expired"
 * reading is downgraded to 'opaque' — send it, let the server decide.
 */
function wireTokenStatus(tok, now) {
  const st = tokenStatus(tok, now);
  return (st === 'expired' && !clockTrusted) ? 'opaque' : st;
}

export function getAuthGate() {
  const now = Date.now();
  return { ...authGate, ...decideAuthGate(authGate, now), clockTrusted };
}
/**
 * Auth recovered (or a test is done). Opens the gate again. `state` is a test
 * seam: the b331 battery seeds a gate one failure short of dead so the
 * escalation to onAuthExpired can be driven through the REAL request path
 * instead of being asserted about in the abstract.
 */
export function resetAuthGate(state) { authGate = state ? { ...newAuthGate(), ...state } : newAuthGate(); }

function noteAuthFailure(label, why, kind) {
  const wasDead = authGate.dead;
  authGate = authGateStep(authGate, kind === 'local' ? 'auth-fail-local' : 'auth-fail', Date.now());
  if (authGate.dead && !wasDead) {
    console.warn('[sync] auth is dead after ' + authGate.streak + ' failures ('
      + label + '/' + why + ') — cloud writes stopped until the player signs in again.');
    reportSync(false, 'auth-expired');
    safeCall(config && config.onAuthExpired, { streak: authGate.streak, label, why });
  }
}
/**
 * THE LEARNING STEP, as one named function with both call sites, so the suite
 * drives the real thing rather than a restatement of it. Returns true when the
 * outcome proved our clock wrong.
 */
export function learnClockFrom(outcome) {
  if (!isClockSkewEvidence(tokenStatus(currentToken()), outcome)) return false;
  markClockUntrusted(outcome === 'refreshed' ? 'a freshly refreshed token' : 'an authorised response');
  return true;
}

function noteAuthOk() {
  // The server just authorised a token our clock calls dead. Our clock is the
  // thing that is wrong; stop letting it veto requests for the rest of this tab.
  learnClockFrom('authorised');
  if (authGate.streak || authGate.dead) authGate = newAuthGate();
}

function markClockUntrusted(evidence) {
  if (!clockTrusted) return;
  clockTrusted = false;
  console.warn('[sync] ' + evidence + ' carried a token this device believes is expired — '
    + 'the local clock is wrong, not the session. Deferring to the server on token expiry from now on.');
}

function currentToken() {
  if (!config || !config.authToken) return null;
  try { return typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { return null; }
}

/**
 * Ask the auth layer to refresh, at most ONE in flight. `config.onAuthError`
 * returns true when it genuinely got a new token, false when the refresh
 * definitively failed. It is invoked SYNCHRONOUSLY so a caller that does not
 * await still knows the attempt was made.
 */
function doRefresh() {
  if (refreshPromise) return refreshPromise;
  const fn = config && config.onAuthError;
  if (typeof fn !== 'function') return Promise.resolve(false);
  let p; try { p = fn(); } catch (e) { return Promise.resolve(false); }
  refreshPromise = Promise.resolve(p).then(
    (ok) => {
      if (ok === true) {
        // The issuer just minted this token. If our clock calls it expired, the
        // clock is wrong — that is proof, not a heuristic.
        learnClockFrom('refreshed');
        resetAuthGate();
      }
      return ok !== false;
    },
    () => false
  );
  const clear = () => { refreshPromise = null; };
  refreshPromise.then(clear, clear);
  return refreshPromise;
}

/**
 * THE GATE EVERY CLOUD REQUEST PASSES. Returns false when this device must not
 * put another request on the wire.
 *
 * Two grounds, and they are NOT equal:
 *   - the breaker is open (backoff, or the terminal state) — that rests on
 *     server evidence and is authoritative;
 *   - our clock says the token has expired — that is an OPINION about this
 *     machine. It may suppress traffic only once the server has corroborated it
 *     at least once. Until then we PROBE: send the token and let the response
 *     rule. A 401 makes it evidence and the breaker takes over on the next tick;
 *     a 200 proves our clock is wrong and permanently retires the local veto.
 *
 * Cost of the probe in the real incident: ONE request (the first), after which
 * the server had corroborated and everything else was suppressed locally. Cost
 * of NOT probing, for a player whose clock is two hours fast: a bricked session.
 */
function authPreflight(label) {
  if (!decideAuthGate(authGate, Date.now()).allow) return false;
  if (!config || !config.authToken) return true;
  if (wireTokenStatus(currentToken(), Date.now()) !== 'expired') return true;
  doRefresh();
  if ((authGate.serverFails || 0) === 0) return true;      // unfalsified guess → probe
  noteAuthFailure(label, 'expired-token', 'local');
  return false;
}

/**
 * fetch() with one refresh-and-retry on an auth error. `initFn()` is called
 * fresh per attempt so the retry uses newly-refreshed auth headers. Reports sync
 * health. Returns the Response (ok or not), or null on a hard network failure.
 *
 * b331: the retry is now CONDITIONAL on the refresh having actually produced a
 * live token. Re-sending a token we know is dead was half the 401 flood.
 */
async function fetchWithAuthRetry(url, initFn, label) {
  let res;
  try { res = await fetch(url, initFn()); }
  catch (e) { console.warn('[sync] ' + label + ' network error:', e.message); reportSync(false, 'offline'); return null; }
  if (!res.ok && (res.status === 401 || res.status === 403 || res.status === 400)) {
    let body = ''; try { body = await res.clone().text(); } catch {}
    if (isAuthError(res.status, body) && config.onAuthError) {
      const refreshed = await doRefresh();
      if (refreshed && wireTokenStatus(currentToken(), Date.now()) !== 'expired') {
        try { res = await fetch(url, initFn()); }
        catch (e) { console.warn('[sync] ' + label + ' retry network error:', e.message); reportSync(false, 'offline'); return null; }
      }
      // else: the refresh definitively failed. A second request with the same
      // dead token can only 401 again — that is the loop this exists to stop.
    }
  }
  if (res.ok) { noteAuthOk(); reportSync(true); }
  else {
    let body = ''; try { body = await res.clone().text(); } catch {}
    console.warn('[sync] ' + label + ' failed:', res.status, body.slice(0, 140));
    const authish = isAuthError(res.status, body);
    if (authish) noteAuthFailure(label, 'http-' + res.status);
    reportSync(false, authish ? 'auth' : 'server');
  }
  return res;
}

/**
 * b319 — the exact rows flush() POSTs, as a pure function so the suite can
 * assert on the literal network payload (one row per event; ~143 B of row
 * overhead each, which is why the allowlist, not the payload shape, is the fix).
 * A second, belt-and-braces allowlist pass: any row reaching here is already
 * admitted, but a payload builder that can never emit a high-frequency type is
 * one fewer way to recreate the incident.
 */
export function buildEventRows(batch, userId) {
  return (batch || [])
    .filter((ev) => ev && EVENT_ALLOWLIST.has(ev.type))
    .map((ev) => ({
      user_id: userId,
      event_type: ev.type,
      payload: ev.payload,
      occurred_at: new Date(ev.ts).toISOString(),
    }));
}

/** Flush buffered events to the configured endpoint. */
async function flush() {
  if (paused) return;                   // b302: evicted device stops all cloud writes
  if (!config?.endpoint) return;        // No endpoint configured — stay in offline mode
  if (!isEventLogEnabled()) return;     // b319: kill switch — events only; saves unaffected
  if (buffer.length === 0) return;
  if (!navigator.onLine) return;        // Browser offline — keep buffered
  if (!authPreflight('flush')) return;  // b331: dead/backed-off auth — do not hammer

  const userId = config.userId
    ? (typeof config.userId === 'function' ? config.userId() : config.userId)
    : null;

  // b319: never POST more than EVENT_MAX_PER_FLUSH rows in one request. The
  // remainder stays buffered (bounded by MAX_BUFFER) for the next tick.
  const batch = buffer.slice(0, EVENT_MAX_PER_FLUSH);
  const payload = buildEventRows(batch, userId);

  const res = await fetchWithAuthRetry(config.endpoint, () => ({
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  }), 'flush');
  if (res && res.ok) {
    // Drop only the events we successfully sent (anything new arrived during the request stays)
    buffer = buffer.slice(batch.length);
    saveBuffer();
  }
}

/**
 * Builder for the snapshot upsert request. Exported so the smoke test can
 * assert the b146 contract without a live network: correct table (via cfg's
 * snapshotEndpoint — must be game_saves, NOT the non-existent game_snapshots),
 * a `slot` value (NOT NULL on the table), and upsert-on-conflict semantics
 * (game_saves has `unique (user_id, slot)`, so a plain insert 409s every save
 * after the first).
 *
 * b342 — THE THIRD CALLER OF THE b339 BUG, AND THE ONLY SILENT ONE.
 * This read `cfg.slot ?? 0`, and auth.js's enableLiveSync() passes no `slot` at
 * all — so EVERY autosave went to slot 0 no matter which character was live.
 * accrue.js and character.js were fixed for exactly this in b339; the save blob
 * itself was not. Measured before the fix, through the real
 * setupAuth->enableLiveSync->setupSync path with the wire intercepted: profile
 * activeSlot()===2, request body slot===0. A player on character 3 overwrote
 * character 1's cloud save on a 60s cadence and was told nothing.
 *
 * The default is now "ask the module that owns the answer", not "0". A pinned
 * integer still wins — that is the seam the suite drives and the one a future
 * "snapshot a specific slot" caller would use — but the SAFE direction is the
 * default, so a caller that forgets to say which character gets the live one
 * rather than silently getting someone else's.
 */
export function buildSnapshotRequest(cfg, userId, snap, nowMs) {
  // `slot` is NOT NULL on game_saves and CHECKed to 0..4.
  const slot = resolveActiveSlot(cfg && cfg.slot);
  const headers = {
    'Content-Type': 'application/json',
    // resolution=merge-duplicates + on_conflict turns POST into an upsert.
    'Prefer': 'resolution=merge-duplicates,return=minimal',
  };
  return {
    url: `${cfg.snapshotEndpoint}?on_conflict=user_id,slot`,
    method: 'POST',
    headers,
    body: { user_id: userId, slot, snapshot: snap, saved_at: new Date(nowMs).toISOString() },
  };
}

/**
 * Sum boss kills out of the bestiary. Exported + pure so the leaderboard
 * contract is testable without a live G. Returns null when the save carries no
 * bestiary at all — an ABSENT field, never a fabricated zero, because "no data"
 * and "zero bosses killed" are different claims and the Bosses board excludes
 * the first while ranking the second.
 */
export function countBossKills(G, MONSTERS) {
  if (!G || !G.bestiary || typeof G.bestiary !== 'object' || !MONSTERS) return null;
  let n = 0;
  for (const id in G.bestiary) {
    if (!Object.prototype.hasOwnProperty.call(G.bestiary, id)) continue;
    const def = MONSTERS[id];
    if (def && def.boss) n += (G.bestiary[id] && G.bestiary[id].kills) || 0;
  }
  return n;
}

/**
 * The DERIVED fields a save snapshot must carry so the SERVER can rank it.
 *
 * `snapshot()` (net/events.js) is a deliberate allowlist of *stored* state, and
 * none of these four are stored — they are all computed from it. But the
 * leaderboard views read `snapshot->>'<field>'`, so anything the server has to
 * sort by has to be written down at save time. This function is the one place
 * that decision lives.
 *
 *   totalLevel   — pre-existing (b146). Also gates cloud restore in auth.js.
 *   combatLevel  — b222. `public.leaderboard` has read snapshot->>'combatLevel'
 *                  since b205 and NOTHING has ever written it: the Combat board
 *                  ranked every player as null. This is that bug's fix.
 *   renown       — b222. The Throne board's score (leaderboards.md §3.2). The
 *                  ladder itself stays client-side; only the integer ships.
 *   bossKills    — b222. The Bosses board. The server cannot compute this — it
 *                  has no MONSTERS table and so no idea which kills were bosses.
 *
 * Each value comes from an explicit config provider when one is wired, else
 * from the live globals, else it is OMITTED. A field is never guessed: a client
 * that cannot compute renown does not appear on the Throne board, which is the
 * honest outcome.
 *
 * Pure apart from the reads it is handed — exported for the regression suite.
 */
export function derivedSnapshotFields(cfg, win) {
  win = win || (typeof window !== 'undefined' ? window : {});
  const out = {};
  const read = (name, fallback) => {
    const p = cfg ? cfg[name] : null;
    if (p != null) {
      try { return typeof p === 'function' ? p() : p; } catch { return null; }
    }
    try { return fallback(); } catch { return null; }
  };
  const whole = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.floor(v)) : null);
  const G = win.G;

  const tl = whole(read('totalLevel', () => (typeof win.getTotalLevel === 'function' ? win.getTotalLevel() : null)));
  if (tl != null) out.totalLevel = tl;

  const cl = whole(read('combatLevel', () => (typeof win.getCombatLevel === 'function' ? win.getCombatLevel() : null)));
  if (cl != null) out.combatLevel = cl;

  const rn = whole(read('renown', () => (
    win.HearthriseRenown && typeof win.HearthriseRenown.compute === 'function'
      ? win.HearthriseRenown.compute(G) : null
  )));
  if (rn != null) out.renown = rn;

  const bk = whole(read('bossKills', () => countBossKills(G, win.MONSTERS)));
  if (bk != null) out.bossKills = bk;

  return out;
}

/**
 * Snapshot full game state to the server (idempotent upsert).
 * @param {boolean} force  bypass the interval throttle (used on hide/close so a
 *                         session's tail isn't lost to the 60s cadence).
 * @param {boolean} keepalive  use fetch keepalive so the request survives the
 *                         page being torn down (pagehide/unload).
 * @returns {boolean} true if an upload was attempted and the server accepted it.
 */
async function snapshotIfDue(force, keepalive) {
  if (paused) return false;                 // b302: evicted device must not clobber the cloud
  if (snapshotHold) return false;           // b314: reconcile not done — never upload local yet
  if (!config?.snapshotEndpoint) return false;
  // b331: check auth BEFORE the throttle watermark moves and before we write the
  // local snapshot cache — a blocked attempt must cost nothing and must not eat
  // the next 60s window.
  if (!authPreflight('snapshot')) return false;
  const now = Date.now();
  if (!force && now - lastSnapshotAt < (config.snapshotIntervalMs || 60000)) return false;
  /* b366 — THE CLOBBER WINDOW. Handoff timeline before this: the arriving phone
     claims at t+1.5s and restores; the departing desktop only learns it lost the
     claim on its next 15s poll — and its 60s snapshotIfDue could fire in between,
     uploading a save from BEFORE the handoff over the phone's fresh one. The
     player then watches progress they just made disappear.
     The fix is a precondition on the WRITE, not a faster poll: do not upload
     while another instance is the known, still-beating owner. Silent and local
     (this is the device being left behind — there is nothing to tell the player,
     and the very next thing that happens to it is the eviction gate). Refusal
     requires CERTAINTY (invariant 2): unknown, unreadable, nobody-owns and
     stale-owner all still upload.

     PLACED AFTER THE THROTTLE, AND IT AWAITS ONLY WHEN IT HAS TO. Two reasons,
     both learned the hard way here:
       · after the throttle, so a call that was never going to upload does not
         spend a network read — and so a REFUSAL does not move `lastSnapshotAt`
         and eat the next 60s window.
       · the `await` is behind the staleness test rather than in front of it,
         because an unconditional await defers everything downstream (including
         the fetch) into a microtask. Two b331 clock tests drive snapshotIfDue
         and count requests synchronously; a gratuitous await made them read 0
         of 3 and go red. An async function that can answer now must answer now.
     A forced/keepalive save on pagehide never blocks on a network read — it
     decides on whatever view it already has. */
  if (config.claimEndpoint) {
    const viewStale = !claimView || (now - claimView.at) >= CLAIM_VIEW_TTL_MS;
    if (viewStale && !keepalive) await fetchClaimRow();     // error → view untouched → allows
    if (!decideUploadAllowed(claimView, getInstanceId(), Date.now())) return false;
  }
  lastSnapshotAt = now;
  const snap = snapshot(window.G);
  if (!snap) return false;
  // Stamp the derived, server-sortable fields (totalLevel, combatLevel, renown,
  // bossKills). See derivedSnapshotFields for why each one has to be written
  // down rather than computed server-side.
  Object.assign(snap, derivedSnapshotFields(config, window));
  // b301: stamp the writing device so any client can detect a concurrent session
  // on the same account. `__`-prefixed so snapshot() never re-reads it off G and
  // restore strips it before merge.
  snap.__device = getDeviceId();
  // Always cache locally for offline-load
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap)); } catch {}
  if (!navigator.onLine) return false;

  const userId = config.userId
    ? (typeof config.userId === 'function' ? config.userId() : config.userId)
    : null;
  const req = buildSnapshotRequest(config, userId, snap, now);
  // Auth-aware: refresh + retry once on an expired token, and surface failures
  // instead of swallowing them. Headers rebuilt per attempt for the fresh token.
  const res = await fetchWithAuthRetry(req.url, () => {
    const init = {
      method: req.method,
      headers: withAuthHeaders(req.headers),
      body: JSON.stringify(req.body),
    };
    if (keepalive) init.keepalive = true;   // survive page teardown on close
    return init;
  }, 'snapshot');
  const ok = !!(res && res.ok);
  /* b299: the REAL sync now records that it succeeded, on G where the player can
     see it (Settings "Last synced"). Before this, cloudSyncedAt was only ever set
     by the DEAD mock cloudSync() path (legacy NetClient, no endpoint), so the
     indicator said "never" forever even while snapshots uploaded fine — which is
     exactly why cloud save felt unverifiable. Also tracked as lastCloudSaveAt for
     the verify tool + health readout. */
  if (ok && window.G) {
    window.G.cloudSyncedAt = now;
    lastCloudSaveAt = now;
  }
  return ok;
}

/**
 * b314 — DETAILED pull. The reconcile gate needs to tell three cases apart that
 * pullLatest() collapses into a single `null`:
 *   'ok'    — a real cloud snapshot was read (snap is the row).
 *   'empty' — the server answered, DEFINITIVELY, that there is no save row yet
 *             (a brand-new account). Safe to adopt+upload the fresh local.
 *   'error' — we could NOT read the cloud (network down, non-200, exception).
 *             The cloud's state is UNKNOWN, so a thin local must NOT be uploaded
 *             over it — the gate stays held and the caller retries.
 *   'skip'  — sync isn't configured / not signed in.
 * Distinguishing 'empty' from 'error' is the whole point: only a CONFIRMED empty
 * lets a fresh local reach the cloud; an unreadable cloud never does.
 * @returns {Promise<{status:'ok'|'empty'|'error'|'skip', snap:object|null}>}
 */
export async function pullLatestDetailed() {
  if (!config?.snapshotEndpoint) return { status: 'skip', snap: null };
  const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
  if (!userId) return { status: 'skip', snap: null };
  // b331: this was a RAW fetch — the ONE cloud call that never went through the
  // refresh-and-retry wrapper. Its 401 read as "cloud unknown", which holds the
  // b314 snapshot gate closed forever, which is why an expired token stopped the
  // save path before it ever reached the network. It now refreshes, retries and
  // feeds the breaker like every other call.
  if (!authPreflight('pull')) return { status: 'error', snap: null, reason: 'auth-blocked' };
  try {
    /* b342 — THE READ MUST ADDRESS THE SAME CHARACTER AS THE WRITE, and it did
       not: this pinned slot 0 too. That is a SECOND data-loss channel running
       the other way, and the more dangerous of the pair, because it defeats the
       freshness invariant rather than merely mis-addressing it. The snap
       returned here is handed to decideRestore() against the ACTIVE character's
       local save; reading slot 0 while playing slot 2 compares two DIFFERENT
       CHARACTERS, so an untouched-but-recently-saved character 1 reads as
       "cloud is newer" and gets overlaid onto character 3's live game.
       "Newest wins" is only a safe rule between two copies of the SAME save.
       Same resolver, same config, same instant as buildSnapshotRequest — the
       two cannot disagree, which is the property that matters here. */
    const slot = resolveActiveSlot(config.slot);
    const res = await fetchWithAuthRetry(
      `${config.snapshotEndpoint}?user_id=eq.${encodeURIComponent(userId)}&slot=eq.${slot}&order=saved_at.desc&limit=1`,
      () => ({ headers: withAuthHeaders({}) }), 'pull');
    if (!res || !res.ok) return { status: 'error', snap: null };    // could not read — UNKNOWN cloud
    let rows;
    try { rows = await res.json(); } catch (e) { return { status: 'error', snap: null }; }
    const row = rows && rows[0];
    const snap = row && row.snapshot;
    if (!snap || typeof snap !== 'object') return { status: 'empty', snap: null };   // CONFIRMED no save row
    // b300: attach the authoritative server save time (ms) so decideRestore can
    // compare freshness. Namespaced key, stripped before it is ever merged into G.
    try {
      const t = row.saved_at ? Date.parse(row.saved_at) : 0;
      if (t) snap.__cloudSavedAt = t;
    } catch (e) {}
    return { status: 'ok', snap };
  } catch (e) {
    console.warn('[sync] pull failed:', e.message);
    return { status: 'error', snap: null };
  }
}

/** Replay-from-server — call after sign-in to pull the latest snapshot. Thin
 *  wrapper over pullLatestDetailed() for callers that only want the snap or null
 *  (checkConcurrentDevice, verifyCloudSave, the suite). */
export async function pullLatest() {
  const r = await pullLatestDetailed();
  return r.snap;
}

/**
 * b299 — CLOUD SAVE SELF-TEST. Forces an upload, pulls it straight back, and
 * diffs the round-tripped fields against the live game. This is the answer to
 * "how do I know cloud save is actually working?": it exercises the real write
 * AND read path end-to-end and reports, in plain terms, what matched.
 * Returns { ok, error, offline, signedIn, checks:[{label,cloud,local,match}] }.
 */
export async function verifyCloudSave() {
  const out = { ok: false, error: null, offline: false, signedIn: false, checks: [] };
  try {
    if (!config?.snapshotEndpoint) { out.error = 'Cloud is not configured (offline mode).'; return out; }
    if (!navigator.onLine) { out.offline = true; out.error = 'You are offline — connect to test cloud save.'; return out; }
    const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
    if (!userId) { out.error = 'Not signed in — cloud save needs an account.'; return out; }
    out.signedIn = true;

    const uploaded = await snapshotIfDue(true, false);      // force a fresh upload
    if (!uploaded) { out.error = 'Upload was rejected (auth or network). Try again in a moment.'; return out; }

    const cloud = await pullLatest();                        // read it straight back
    if (!cloud) { out.error = 'Uploaded, but reading it back returned nothing.'; return out; }

    const G = window.G || {};
    const invCount = (o) => (o && typeof o === 'object') ? Object.keys(o).length : 0;
    const rows = [
      ['Total level', cloud.totalLevel, (typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : undefined)],
      /* THE ROUND-TRIP CHECK REPORTS WHAT IT CAN SEE, AND SAYS SO WHEN IT
         CANNOT. Once a balance is on SERVER_OF_RECORD the local copy is
         stripped at load, so `G.gold` is legitimately absent — and printing
         `undefined` beside a cloud figure would read as data loss in the one
         tool a worried player opens to check for data loss. `balanceState`
         gives the honest word ("UNKNOWN:absent"), and the row still compares:
         a genuine mismatch is still a mismatch. */
      ['Gold', cloud.gold, balanceState(G).gold],
      ['Gems', cloud.gems, balanceState(G).gems],
      ['Kills', cloud.stats && cloud.stats.kills, G.stats && G.stats.kills],
      ['Inventory item types', invCount(cloud.inventory), invCount(G.inventory)],
      ['Name', cloud.playerName, G.playerName],
    ];
    out.checks = rows.map(([label, c, l]) => ({ label, cloud: c, local: l, match: String(c) === String(l) }));
    out.ok = out.checks.every((c) => c.match);
    if (!out.ok) out.error = 'Round-trip completed but some fields did not match — see the details.';
    return out;
  } catch (e) {
    out.error = (e && e.message) || String(e);
    return out;
  }
}

/**
 * b301, REBUILT IN b366 — CONCURRENT-SESSION DETECTION.
 *
 * WAS: "did a different __device write game_saves in the last 150s?" — which is
 * true on every single clean handoff, because the device you are leaving fires a
 * keepalive snapshot on pagehide. The player closed one device and was told to
 * close one. It never once described a concurrent session.
 *
 * IS: "does a DIFFERENT instance hold the session claim with a heartbeat that is
 * still beating?" A heartbeat is the only positive evidence of liveness we have.
 * A departed device stops beating; a live one keeps beating. That is the whole
 * difference between a handoff and a genuine double-session.
 *
 * Shares ONE verdict with checkSessionClaim (the `claimView` cache) rather than
 * issuing a second read of a second table — the two used to be able to disagree.
 * Returns { concurrent, otherDevice, agoMs } where agoMs is heartbeat age.
 */
export async function checkConcurrentDevice() {
  const out = { concurrent: false, otherDevice: null, agoMs: null };
  if (!config?.claimEndpoint || !navigator.onLine) return out;
  const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
  if (!userId) return out;
  const view = await freshClaimView();
  // UNKNOWN IS NOT CONCURRENT. A failed read tells us nothing, and a warning we
  // cannot substantiate is exactly the bug being fixed here.
  if (!view) return out;
  const v = decideConcurrent(view, getInstanceId(), Date.now());
  if (v.concurrent && !hasWarnedConcurrent(v.otherDevice)) {
    markWarnedConcurrent(v.otherDevice);
    safeCall(config.onConcurrentDevice, v);
  }
  return v;
}

/**
 * PURE. Given a claim view, who we are, and now — is another instance genuinely
 * live? Every "no" case is deliberate: no view / no owner / it's us / no
 * heartbeat / a stale or future-dated heartbeat all mean "no evidence", and no
 * evidence never warns.
 */
export function decideConcurrent(view, me, nowMs) {
  const out = { concurrent: false, otherDevice: null, agoMs: null };
  if (!view || !view.owner || view.owner === me) return out;
  const hb = Number(view.hbMs) || 0;
  if (!hb) return out;
  const ago = nowMs - hb;
  if (ago < 0 || ago >= CLAIM_STALE_MS) return out;
  return { concurrent: true, otherDevice: view.owner, agoMs: ago };
}

/**
 * PURE — may THIS instance write the cloud save? Deliberately expressed as the
 * negation of decideConcurrent so the two can never drift: "someone else is
 * demonstrably live" is the same fact whether we are warning about it or
 * declining to write because of it. Everything short of that demonstration —
 * unknown view, no owner, no/short/stale heartbeat — allows the write, because
 * refusing on uncertainty would mean a flaky connection could silently stop a
 * player's saves, which is the failure mode invariant 2 exists to forbid.
 */
export function decideUploadAllowed(view, me, nowMs) {
  return !decideConcurrent(view, me, nowMs).concurrent;
}

/** b366 — have we already accused this instance? Survives a reload (P0-B). */
export function hasWarnedConcurrent(other) {
  if (!other) return true;                       // nothing to warn about
  try { return sessionStorage.getItem(CONCURRENT_WARN_KEY) === other; }
  catch (e) { return concurrentWarned === other; }
}
export function markWarnedConcurrent(other) {
  concurrentWarned = other || '';
  try { sessionStorage.setItem(CONCURRENT_WARN_KEY, other || ''); } catch (e) {}
}

// ── b302: SINGLE ACTIVE DEVICE (session claim) ──────────────────────────────
// "New device wins." claimSession() takes ownership (upsert); checkSessionClaim()
// polls and, if another device now owns the account, evicts THIS device. The
// cardinal rule: evict ONLY on a definitive "a different device owns this" row —
// never on a network error, a missing table, or being signed out — or a flaky
// connection would lock a player out of their own account.

/**
 * b366 — the ONE read of session_claims. Returns
 * {status:'ok'|'skip'|'error', owner, hbMs} and, on 'ok', updates `claimView` —
 * the single verdict every other consumer reads. Errors NEVER write the view:
 * an unreadable claim must leave the last known good answer in place rather than
 * manufacture "nobody owns this", which would both silence a real eviction and
 * green-light an upload we should refuse.
 */
async function fetchClaimRow() {
  if (!config?.claimEndpoint || !navigator.onLine) return { status: 'skip' };
  const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
  if (!userId) return { status: 'skip' };
  if (!authPreflight('claim-poll')) return { status: 'skip' };
  let res;
  try { res = await fetch(`${config.claimEndpoint}?user_id=eq.${encodeURIComponent(userId)}&select=device_id,heartbeat_at`, { headers: withAuthHeaders({}) }); }
  catch (e) { return { status: 'error' }; }
  if (!res.ok) return { status: 'error' };
  let rows; try { rows = await res.json(); } catch (e) { return { status: 'error' }; }
  const row = rows && rows[0];
  const owner = (row && row.device_id) || null;
  const hbMs = (row && row.heartbeat_at) ? Date.parse(row.heartbeat_at) : 0;
  claimView = { owner, hbMs: Number.isFinite(hbMs) ? hbMs : 0, at: Date.now() };
  return { status: 'ok', owner, hbMs: claimView.hbMs };
}

/** The cached claim verdict, re-read if it has gone stale. null = unknown. */
async function freshClaimView() {
  if (claimView && (Date.now() - claimView.at) < CLAIM_VIEW_TTL_MS) return claimView;
  const r = await fetchClaimRow();
  return r.status === 'ok' ? claimView : null;
}

/** Read-only accessor for the suite + diagnostics. */
export function getClaimView() { return claimView ? { ...claimView } : null; }

/** Claim the account's single active-session slot for THIS tab (instance). */
export async function claimSession() {
  if (!config?.claimEndpoint) return false;
  const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
  if (!userId) return false;
  if (!authPreflight('claim')) return false;              // b331
  const now = new Date().toISOString();
  const body = { user_id: userId, device_id: getInstanceId(), claimed_at: now, heartbeat_at: now };
  const res = await fetchWithAuthRetry(`${config.claimEndpoint}?on_conflict=user_id`, () => ({
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(body),
  }), 'claim');
  /* b366 — THE CLAIM EPOCH. A successful claim makes US the owner as of NOW, and
     we record that locally so the upload guard (mayUploadSnapshot) has an answer
     before the next 15s poll rather than after it. Without this stamp the
     departing device's view still names itself for up to a poll interval, which
     is precisely the window in which its 60s snapshot could land on top of the
     arriving device's restore. */
  if (res && res.ok) {
    evicted = false;
    const now = Date.now();
    claimView = { owner: getInstanceId(), hbMs: now, at: now };
  }
  return !!(res && res.ok);
}

/** Refresh our heartbeat — ONLY updates the row while WE still own it (the
 *  device_id filter means an evicted instance can never resurrect its claim). */
async function heartbeatClaim() {
  if (paused || !config?.claimEndpoint || !navigator.onLine) return;
  const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
  if (!userId) return;
  if (!authPreflight('heartbeat')) return;                // b331
  const url = `${config.claimEndpoint}?user_id=eq.${encodeURIComponent(userId)}&device_id=eq.${encodeURIComponent(getInstanceId())}`;
  try {
    await fetch(url, {
      method: 'PATCH',
      headers: withAuthHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ heartbeat_at: new Date().toISOString() }),
    });
  } catch (e) { /* a missed heartbeat is harmless — the next poll retries */ }
}

/**
 * Poll the claim. Returns {status}: 'owner'|'evicted'|'reclaimed'|'claimed'|'skip'|'error'.
 * Fires config.onEvicted ONCE when — and only when — a DIFFERENT, still-alive
 * instance owns the account. An owner whose heartbeat has gone stale (a closed
 * tab) is taken over silently, so closing one tab never locks out the other.
 * Errors/absent rows/offline never evict.
 */
export async function checkSessionClaim() {
  if (paused) return { status: 'paused' };
  if (!config?.claimEndpoint || !navigator.onLine) return { status: 'skip' };
  const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
  if (!userId) return { status: 'skip' };
  // b331: a blocked poll must behave exactly like a network error — it NEVER
  // evicts (b302's cardinal rule), it just does not happen.
  const me = getInstanceId();
  // b366: ONE read, shared with checkConcurrentDevice via `claimView`. skip/error
  // still never evict — the statuses are mapped straight through.
  const r = await fetchClaimRow();
  if (r.status !== 'ok') return { status: r.status === 'skip' ? 'skip' : 'error' };
  const owner = r.owner;
  if (!owner) { await claimSession(); return { status: 'claimed' }; }   // nobody owns → take it
  if (owner === me) { heartbeatClaim(); return { status: 'owner' }; }   // still ours → keep alive
  // A different instance owns it. Is it actually still alive?
  const hb = r.hbMs;
  const fresh = hb && (Date.now() - hb) < CLAIM_STALE_MS;
  if (fresh) {                                            // genuinely active elsewhere → evict us
    if (!evicted) { evicted = true; safeCall(config.onEvicted, { owner }); }
    return { status: 'evicted', owner };
  }
  await claimSession();                                   // owner abandoned (stale) → take over
  return { status: 'reclaimed', from: owner };
}

/**
 * b314 — RECONCILE GATE. Between sign-in and the first cloud pull+reconcile,
 * snapshot uploads are held so a fresh/empty local can't win a race and clobber a
 * real cloud save. auth.js calls holdSnapshots() before pullLatest() and
 * releaseSnapshots() once decideRestore has resolved (or the pull failed). Default
 * OPEN, so offline mode and every non-reconcile path upload normally.
 */
export function holdSnapshots() { snapshotHold = true; }
export function releaseSnapshots() { snapshotHold = false; }
export function isSnapshotHeld() { return snapshotHold; }

/** Stop ALL cloud writes from this device (used when evicted). Idempotent. */
export function pauseSync() {
  paused = true;
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  if (concurrencyTimer) { clearInterval(concurrencyTimer); concurrencyTimer = null; }
  if (claimTimer) { clearInterval(claimTimer); claimTimer = null; }
}

/** Setup. Pass config on first call; passing nothing keeps offline mode active. */
export function setupSync(opts = {}) {
  config = { ...config, ...opts };
  loadBuffer();

  // b319: subscribe ONLY to the allowlisted, low-frequency event types (was
  // on('*'), which uploaded a row for every kill / gathered item / bite of food
  // and filled the production database). The dropped types keep firing on the
  // in-process bus for the features that subscribe to them locally — this is a
  // network-path change only. Re-subscribing is idempotent-safe because setupSync
  // may be called twice (offline boot, then again with cloud config), so we
  // unsubscribe the previous set first.
  eventUnsubs.forEach((off) => { try { off(); } catch (e) {} });
  eventUnsubs = Array.from(EVENT_ALLOWLIST).map((type) => on(type, (_payload, ev) => { enqueue(ev); }));

  // Periodic flush (whatever interval is configured, default 5s)
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(() => {
    flush();
    snapshotIfDue();
  }, config.batchIntervalMs || 5000);

  // b299: on hide/close, force BOTH the event flush AND a full cloud snapshot,
  // with keepalive so it survives the page being torn down. Before this only the
  // event buffer flushed on hide; the authoritative save (game_saves) waited for
  // the 60s timer, so closing the app could leave the cloud up to a minute stale
  // — or empty for a short session. Now the tail is captured on the way out.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flush(); snapshotIfDue(true, true); }
  });
  window.addEventListener('pagehide', () => { flush(); snapshotIfDue(true, true); });

  // b301: poll for a concurrent session on its own slower cadence (a GET each
  // time — kept off the 5s flush loop). One check shortly after connect catches
  // the "already open elsewhere" case fast.
  // b366: gated on claimEndpoint now, not snapshotEndpoint — the verdict comes
  // from session_claims, and without that table there is no liveness evidence to
  // reason from and therefore nothing honest to say.
  if (concurrencyTimer) clearInterval(concurrencyTimer);
  if (config.claimEndpoint) {
    concurrencyTimer = setInterval(() => { checkConcurrentDevice(); }, config.concurrencyIntervalMs || 45000);
    setTimeout(() => { checkConcurrentDevice(); }, 4000);
  }

  // b302: single active device. Claim the account for THIS device on connect
  // (new device wins), then poll for eviction. Inert until the session_claims
  // table + claimEndpoint exist — claim/poll simply no-op or error out safely.
  if (claimTimer) clearInterval(claimTimer);
  if (config.claimEndpoint && !paused) {
    setTimeout(() => { claimSession(); }, 1500);                       // take ownership
    setTimeout(() => { checkSessionClaim(); }, 6000);                  // first eviction check
    claimTimer = setInterval(() => { checkSessionClaim(); }, config.claimIntervalMs || 15000);
    // Re-check the moment the tab regains focus, so a kicked device locks out on return.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkSessionClaim(); });
  }

  // And one immediate attempt
  setTimeout(flush, 1000);

  console.log('[Cloud Sync]', config.endpoint ? 'configured: ' + config.endpoint : 'offline mode (no endpoint)');
}

// Expose for manual use during dev / migration. getConfig is read-only-ish
// (returns a shallow copy) so tests + debugging can inspect the live wiring —
// e.g. assert snapshotEndpoint targets game_saves, not game_snapshots.
window.HearthriseSync = {
  setupSync, flush, snapshotIfDue, pullLatest, buildSnapshotRequest, isAuthError,
  derivedSnapshotFields, countBossKills, verifyCloudSave, checkConcurrentDevice,
  claimSession, checkSessionClaim, pauseSync, pullLatestDetailed,
  // b366 device-handoff: the pure verdicts, exported so the suite drives the
  // REAL decision functions rather than a reimplementation of them.
  decideConcurrent, decideUploadAllowed, getClaimView,
  hasWarnedConcurrent, markWarnedConcurrent,
  CLAIM_STALE_MS,
  /* Test seam: set the shared claim verdict directly. The b366 battery needs to
     stage "another instance owns this, beating / not beating" without a live
     session_claims row; every consumer reads this one variable, so staging it is
     staging the real input. Restores by passing null. */
  __setClaimView: (v) => { claimView = v ? { ...v } : null; return getClaimView(); },
  holdSnapshots, releaseSnapshots, isSnapshotHeld,
  // b331 expired-token circuit breaker
  tokenStatus, nextAuthBackoffMs, newAuthGate, decideAuthGate, authGateStep,
  getAuthGate, resetAuthGate, isClockSkewEvidence, isClockTrusted, setClockTrusted, learnClockFrom,
  AUTH_DEAD_AFTER_TRIES, AUTH_DEAD_AFTER_MS, AUTH_BACKOFF_MAX_MS,
  /* Test seam: run fn() with the module config temporarily patched, then put the
     previous config back EXACTLY. The b331 battery uses this to drive the REAL
     request paths (flush / snapshotIfDue / pullLatestDetailed / claimSession)
     against a dead token without a live account — the alternative was a parallel
     reimplementation of the thing under test, which proves nothing. */
  /* Test seam: the battery drives a real health TRANSITION, which latches
     syncHealthy. Put it back so a player who runs the suite in-game doesn't get
     a spurious "Back online" toast on their next successful save. */
  __resetSyncHealth: () => { syncHealthy = true; },
  __withConfig: (patch, fn) => {
    const prev = config;
    config = { ...(config || {}), ...patch };
    let r;
    try { r = fn(); } catch (e) { config = prev; throw e; }
    // If fn is async, the config must survive until it SETTLES — the response
    // handlers (noteAuthOk / doRefresh) read config.authToken long after the
    // synchronous call returns, and restoring early would hand them the real
    // player's token mid-probe.
    if (r && typeof r.then === 'function') {
      const back = () => { config = prev; };
      return r.then((v) => { back(); return v; }, (e) => { back(); throw e; });
    }
    config = prev;
    return r;
  },
  // b319 telemetry containment
  isEventAllowed, isEventLogEnabled, setEventLogEnabled, admitEvent, getEventStats, resetEventLimiter,
  buildEventRows,
  getEventBuffer: () => buffer.slice(0),
  // Test/diagnostic seam: put the buffer back exactly as it was. The smoke suite
  // is player-runnable in-game, so its probe events must not survive into a real
  // player's telemetry — it snapshots the buffer, asserts, and restores.
  restoreEventBuffer: (rows) => { buffer = Array.isArray(rows) ? rows.slice(0) : []; saveBuffer(); return buffer.length; },
  getConfig: () => (config ? { ...config } : null),
  getSyncHealthy: () => syncHealthy,
  getLastCloudSaveAt: () => lastCloudSaveAt,
  getDeviceId,
  isPaused: () => paused,
};

// Default: kick off in offline mode so the buffer + snapshot start populating
// the moment any module fires emit(). When you add Supabase config later,
// just call setupSync({endpoint:..., authToken:...}) again to upgrade.
setupSync();
