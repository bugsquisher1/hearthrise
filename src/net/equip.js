// ============================================================================
// src/net/equip.js — THE EQUIP INTENT, CLIENT SIDE (b366).
//
// "Wear this." / "Take that off." / "Apply this loadout." — sent to the server,
// which decides.
//
// Contract: supabase/functions/hr-accrue/intents.js and ./equip.js.
// Spec: docs/design/live-settlement.md §10 PHASE 2.
//
//   POST <SUPABASE_URL>/functions/v1/hr-accrue
//     {"verb":"equip","slot":N,"intentId":"<uuid>",
//      "equip":{"weapon":"iron_sword","shield":null}}
//   → 200 {ok:true, verb:'equip', equipment:{…}, collected:{…}|null, ...envelope}
//     409 {ok:false, error:'insufficient_item'|'wrong_slot'|'requirement_not_met'|…}
//
// ── WHY THIS FILE IS THE HINGE OF PHASE 2 ───────────────────────────────────
// Until it existed there was NO equip verb anywhere in src/net, so the server's
// `player_inventory` row was a stale view that still counted the copy the
// player was wearing. That is the root of the b362 dupe (`unaccountedEquipped`
// in ./accrue.js is the tourniquet), AND it is the reason the envelope could
// not be believed outright: assigning a stale bag figure is the same
// duplication with the merge removed.
//
// So loading this module ARMS THE FLIP — it calls
// `markEquipAuthorityLive()` in ./accrue.js, which is the single condition
// `isEnvelopeAbsolute()` reads. The arming is a registration rather than a
// date or a constant somebody has to remember to change: until the gesture is
// wired to this transport, nothing imports it, nothing arms, and every envelope
// keeps b359 merge semantics. Read the block above `equipAuthorityLive` in
// accrue.js before changing that.
//
// ── WHAT THE CLIENT MAY SEND ────────────────────────────────────────────────
// Slot NAMES and item NAMES. Nothing else, and there is nothing else it could
// truthfully contribute: an equip moves exactly one unit, the server decides
// where it came from (the player's own inventory row, debited under a lock),
// and every stat comes off `ITEMS[id]` server-side. No qty, no price, no stats,
// no source slot.
//
// ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
// Rule 1 of the intent contract, unchanged and shared with ./activity.js: WE
// WERE NOT ANSWERED ⇒ REUSE THE KEY; we were answered ⇒ a new key next time. A
// CORS failure, a DNS failure and a dead network are indistinguishable by
// design of the fetch spec and all three mean "not answered", so a retry after
// one must carry the same key or the swap can apply twice.
//
// PURE except for `fetch` and the two injected seams, so the suite drives the
// same bytes the browser runs.
// ============================================================================

import { markEquipAuthorityLive, isServerAccrualEnabled, resolveActiveSlot } from './accrue.js?v=432';

export const EQUIP_VERB = 'equip';

/** The server's own bound (`MAX_EQUIP_OPS` in request.js) mirrored so a loadout
    too large is refused HERE rather than costing a round trip. A mirror, never
    an authority: the parser re-checks it and hr_apply re-checks it again under
    `c_max_equip_kinds`. */
export const MAX_EQUIP_OPS = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLOT_RE = /^[a-z0-9_]{1,32}$/;
const ITEM_RE = /^[a-z0-9_]{1,64}$/;
const MAX_SLOT = 5;
const EQUIP_TIMEOUT_MS = 15000;

let config = null;
let hooks = { onEnvelope: null, pointer: null };

/* ⚠ DECLARED HERE, ABOVE THE COUNTERS, AND NOT WHERE IT READS MOST NATURALLY
   (next to `classifyEquipResponse`). `stats` pre-seeds a key per outcome at
   module-evaluation time, and a `const` referenced before its declaration is a
   TDZ ReferenceError — which in a module imported for its side effects means
   the ENTIRE transport silently fails to publish. That is the incident class
   this whole file is being changed to close, so it is not repeated here. */
export const EQUIP_OUTCOMES = Object.freeze([
  'equipped',       // 200 ok:true — the swap landed; the envelope is the truth
  'replayed',       // 200 ok:true replayed:true — this exact intent already landed
  'refused',        // 4xx/409 with a machine code
  'rate-limited',   // 429 — shared with set_activity at 30/min
  'not-signed-in',  // 401/403
  'unavailable',    // 5xx
  'malformed',      // a 200 that is not an envelope
  'unreachable',    // no answer at all (CORS, DNS, offline)
  'timeout',        // aborted — also no answer
  'unconfigured',   // no endpoint / no token on this device
  'switch-off',     // server accrual is off; nothing was sent
  'undeliverable',  // the client refused its own request before sending it
]);

/* ══════════════════════════════════════════════════════════════════════════
   b369 — EVERY WAY THIS TRANSPORT CAN DELIVER NOTHING, COUNTED BY NAME.

   THE INCIDENT THAT BOUGHT THIS. On live b367 a player unequipped a bronze
   sword. The flip was armed, the gesture was wired, `routeEquipGesture` existed
   — and the server journal held ZERO equip rows. It took hours of log
   archaeology to establish even THAT the transport had not delivered, because
   every non-delivery in this file was a bare `return {outcome:'…'}` that
   nothing counted, nothing logged, and no console could be asked about after
   the fact. The bug was never "which line dropped it"; the bug was that the
   answer was unknowable from a running client.

   So: one counter per named outcome, one per drop REASON, and a first-sight
   `console.warn` per reason (throttled — a silent no-op is the incident class,
   but a warn on every tick is how a player's console becomes unreadable and
   the next real warning is missed).

   `window.HearthriseEquip.stats` is the whole diagnosis in one paste. It is a
   COUNTER, never a ledger: no item ids, no keys, nothing a support request
   should not carry.

   ⚠ THE COUNTERS ARE NOT DECORATION — `acknowledged` IS THE FLIP'S ARMING
     CONDITION. See `noteAck` below. */
export const EQUIP_DROP_REASONS = Object.freeze([
  'switch-off',        // the kill switch is off; nothing was sent
  'unconfigured',      // no endpoint on this device
  'no-token',          // configured, but this device has no session token
  'token-threw',       // the token accessor threw
  'undeliverable',     // our own validator refused the map
  'unreachable',       // fetch itself failed — CORS, DNS, offline (INDISTINGUISHABLE)
  'timeout',           // aborted after EQUIP_TIMEOUT_MS — also "not answered"
  'no-transport',      // legacy: window.HearthriseEquip absent at gesture time
  'no-send',           // legacy: the module is there but sendEquip is not
  'no-ops',            // legacy: nothing actually moved (the S4 skip — benign)
  'gesture-threw',     // legacy: the gesture itself threw
]);

function freshStats() {
  const drops = Object.create(null);
  for (const r of EQUIP_DROP_REASONS) drops[r] = 0;
  const byOutcome = Object.create(null);
  for (const o of EQUIP_OUTCOMES) byOutcome[o] = 0;
  return {
    attempted: 0,          // sendEquip calls that reached `fetch`
    answered: 0,           // calls that came back with a status
    acknowledged: 0,       // 200 ok:true — THE SERVER PERFORMED A SWAP
    ackAt: 0,
    drops, byOutcome,
    lastOutcome: null, lastError: null, lastDrop: null, lastDropAt: 0,
    warned: Object.create(null),
  };
}
export const stats = freshStats();
/** Test seam. Returns the counters to zero AND retires the session's proof —
    the two are one fact, so they must not be resettable independently. */
export function __resetEquipStats() {
  const f = freshStats();
  for (const k of Object.keys(f)) stats[k] = f[k];
  markEquipAuthorityLive(false);
  return stats;
}
export function equipStats() { return stats; }

/* THROTTLED, NOT SUPPRESSED. The first three sightings of a reason are warned
   in full; after that only the counter moves. Three because one can be a
   startup race, two can be a retry, and three is a pattern — and because the
   b367 incident would have been diagnosed off the FIRST one. */
const WARN_LIMIT = 3;
function noteDrop(reason, extra) {
  const r = String(reason || 'unknown');
  stats.drops[r] = (stats.drops[r] || 0) + 1;
  stats.lastDrop = r;
  stats.lastDropAt = Date.now();
  const n = (stats.warned[r] = (stats.warned[r] || 0) + 1);
  if (n <= WARN_LIMIT) {
    console.warn(`[equip] gesture DELIVERED NOTHING (${r}${extra ? ': ' + extra : ''}) — the server was not told `
      + `about this gear change. window.HearthriseEquip.stats has the counts.`
      + (n === WARN_LIMIT ? ' (further warnings for this reason are counted only)' : ''));
  }
  return { outcome: r === 'no-token' || r === 'token-threw' ? 'unconfigured' : r, dropReason: r };
}

/* ── THE ARMING CONDITION, AFTER THE b367 INCIDENT ──────────────────────────
   ⚠ READ THIS BEFORE CHANGING EITHER HALF.

   b366 armed the flip on `configureEquip({gestureWired:true})` — an endpoint,
   a token source, and the gesture owner's assertion that the player's tap
   routes here. Every one of those is a statement about the CLIENT. None of
   them is evidence that a single equip has ever reached the server, and on
   live b367 none of them was: the flip was armed on a client whose equips the
   server never heard, which is precisely the state the arming condition exists
   to make impossible.

   The property that actually matters is not "this client CAN send" but "this
   client's equips ARE LANDING". That is only knowable one way — the server
   answered `ok:true` to one of them. So the flip now arms on a
   SERVER-ACKNOWLEDGED ROUND TRIP IN THIS SESSION, and on nothing else:

     · a 200 `equipped` or `replayed` arms it (`replayed` counts — it means the
       server holds this exact intent, which is the same proof);
     · a refusal, a 5xx, a CORS failure, a timeout and a malformed answer all
       leave it DISARMED, because none of them proves the swap landed;
     · a page reload disarms it again (module state, deliberately not
       persisted): a proof from yesterday's deploy is not a proof about the
       payload running now, and this is exactly how the incident hid;
     · tearing the transport down disarms it.

   THE COST, STATED: the first envelope of a session is merged rather than
   assigned, and a player who never touches their gear stays on merge
   semantics forever. That is the correct trade in both directions — the merge
   can only over-credit, it cannot delete, and `unaccountedEquipped` keeps it
   honest about worn copies. The absolute envelope is the one that can DELETE a
   bag copy, so it is the one that must be earned.

   `gestureWired` is still required, and still means what its old block said:
   a client that believes the server's bag outright while equipping locally is
   the b362 dupe at settle cadence. It is now NECESSARY AND INSUFFICIENT, which
   is what it always should have been. */
let gestureWired = false;
function noteAck() {
  stats.acknowledged++;
  stats.ackAt = Date.now();
  if (stats.acknowledged === 1) {
    console.log('[equip] the server acknowledged an equip on this client — the envelope may now be believed '
      + 'outright (absolute inventory). Before this point every envelope was merged.');
  }
  markEquipAuthorityLive(gestureWired === true && !!config);
  return stats.acknowledged;
}
/** Has a real equip landed on the server IN THIS SESSION? The single fact the
    flip is armed on. Exported so a test, and a support paste, can ask. */
export function isEquipTransportProven() {
  return stats.acknowledged > 0 && gestureWired === true && !!config;
}

function noteVerdict(v) {
  const o = (v && v.outcome) || null;
  if (o) {
    stats.byOutcome[o] = (stats.byOutcome[o] || 0) + 1;
    stats.lastOutcome = o;
  }
  stats.lastError = (v && v.error) || null;
  if (o === 'equipped' || o === 'replayed') noteAck();
  return v;
}

/**
 * Configure the transport.
 *
 * ⚠ b369 — THIS NO LONGER ARMS THE FLIP. It cannot: an endpoint plus a token
 * source is a statement about this client, and the b367 incident is what a
 * client-side statement is worth. Configuring records `gestureWired` (a
 * NECESSARY condition) and DISARMS, because a reconfiguration is a new
 * transport whose delivery has not been demonstrated. `noteAck()` arms.
 *
 * Configuring with no url DISARMS too, so a torn-down client falls back to
 * merge rather than to a stale absolute.
 */
export function configureEquip(cfg) {
  /* ⚠ `authToken` AND `slot` FOLLOW THE OTHER FOUR TRANSPORTS, and this is the
     b339/b342 slot bug pre-empted rather than repeated. auth.js wires every
     intent from ONE base — `{url, apiKey, authToken}` with NO slot — because a
     token captured at sign-in is dead in an hour and a slot captured at sign-in
     is wrong the moment the player switches character. This module's first
     revision read `cfg.token` and pinned `cfg.slot`, which would have sent
     every equip to character 1 while the player wore gear on character 3.
     `token` is still honoured so a caller (and the suite) may pass a literal. */
  config = cfg && cfg.url ? { ...cfg, authToken: cfg.authToken || cfg.token || null } : null;
  /* ⚠ `gestureWired` IS A SEPARATE, EXPLICIT ASSERTION AND IT IS NOT PEDANTRY.
     A configured transport means "this client CAN tell the server about an
     equip". The gesture flag means the player's tap actually routes here
     instead of mutating `G.equipment` locally. Believing the server's bag
     outright while still equipping locally is the b362 dupe at settle cadence,
     so this stays a NECESSARY condition — it is simply no longer a sufficient
     one. See the arming block above. */
  gestureWired = !!config && cfg && cfg.gestureWired === true;
  /* ⚠ CONFIGURING DISARMS. Always. A new endpoint, a new token source or a
     re-wire after a sign-in is a transport whose delivery has not been
     demonstrated, and the b367 incident is exactly what an undemonstrated
     transport is worth. The next `ok:true` arms it. */
  markEquipAuthorityLive(false);
  return config;
}
export function getEquipConfig() { return config; }
export function setEquipHooks(h) { hooks = { ...hooks, ...(h || {}) }; }
/** WHAT IS ACTUALLY INSTALLED. Exported because `resetEquip()` clears the hooks
    and a caller that latched on "I already wired this" would then hold a
    transport with NO envelope applier — a swap the server performed that the
    client never reads. The gesture owner asks this instead of remembering. */
export function getEquipHooks() { return { ...hooks }; }
export function resetEquip() {
  config = null;
  gestureWired = false;
  hooks = { onEnvelope: null, pointer: null };
  /* THE SESSION'S PROOF GOES WITH THE TRANSPORT. A torn-down transport whose
     ack survived would re-arm the flip the instant it was reconfigured, on
     evidence about a transport that no longer exists. */
  stats.acknowledged = 0;
  stats.ackAt = 0;
  markEquipAuthorityLive(false);
}

function accrueEndpoint(url) {
  const u = String(url || '').replace(/\/+$/, '');
  return /\/functions\/v1\/hr-accrue$/.test(u) ? u : u + '/functions/v1/hr-accrue';
}

export function newIntentKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* fall through */ }
  /* A NON-CRYPTO FALLBACK IS STILL A UUID SHAPE, and that matters: the server
     refuses anything that is not canonical, so a fallback that produced a
     readable-but-non-uuid key would turn "this browser has no crypto" into
     `missing_intent_id` on every gesture. */
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
export function isIntentKey(k) { return typeof k === 'string' && UUID_RE.test(k); }

/**
 * VALIDATE THE OPERATIONS BEFORE SENDING. Pure.
 *
 * WHOLE-MAP REFUSAL, matching the server parser exactly: if any pair is
 * unreadable the gesture is unreadable. Half-sending a loadout because one slot
 * name was wrong is a partial write the contract exists to make impossible, and
 * a client that trimmed the bad pair would be inventing an instruction the
 * player did not give.
 *
 * @returns { ok:true, ops } | { ok:false, why }
 */
export function validateEquipOps(ops) {
  if (!ops || typeof ops !== 'object' || Array.isArray(ops)) {
    return { ok: false, why: 'not an object' };
  }
  const keys = Object.keys(ops);
  if (keys.length === 0) return { ok: false, why: 'no operations' };
  if (keys.length > MAX_EQUIP_OPS) return { ok: false, why: `${keys.length} ops exceeds ${MAX_EQUIP_OPS}` };
  const out = Object.create(null);
  for (const k of keys) {
    if (!SLOT_RE.test(k)) return { ok: false, why: `bad slot '${k}'` };
    const v = ops[k];
    if (v === null || v === undefined) { out[k] = null; continue; }
    if (typeof v !== 'string' || !ITEM_RE.test(v)) return { ok: false, why: `bad item for '${k}'` };
    out[k] = v;
  }
  return { ok: true, ops: out };
}

/* ── THE REQUEST, AS DATA ───────────────────────────────────────────────────
   PURE and exported so the suite asserts the LITERAL bytes on the wire — the
   same rule ./activity.js follows, and the reason is the same: a request built
   inside a fetch call can only be tested by mocking fetch, and a mock proves
   what the mock was told. */
export function buildEquipRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= MAX_SLOT ? o.slot : 0;
  /* RE-VALIDATED HERE TOO, and it is not belt-and-braces: this function is
     exported and the suite calls it directly, so a caller that skipped
     `validateEquipOps` must not be able to put an unreadable map on the wire. */
  const v = validateEquipOps(o.equip);
  const equip = v.ok ? v.ops : {};
  return {
    url: accrueEndpoint(o.url),
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        verb: EQUIP_VERB,
        slot,
        intentId: String(o.intentId == null ? '' : o.intentId),
        /* `{...equip}` rather than `equip`: the validated map is
           null-prototype, and JSON.stringify of one is fine, but spreading
           keeps the serialised shape a plain object for every reader. */
        equip: { ...equip },
      }),
    },
  };
}

/** Outcomes that mean WE WERE NOT ANSWERED. The key must be REUSED after one.
    An allowlist of the unanswered, not of the answered: a new outcome added
    without a decision lands on the "we were answered" side, which is the side
    that mints a fresh key — and a fresh key on an unanswered call is how one
    swap applies twice. */
export const UNANSWERED_OUTCOMES = Object.freeze(['unreachable', 'timeout']);
export function isAnswered(outcome) { return UNANSWERED_OUTCOMES.indexOf(outcome) === -1; }

/* ── WHAT THE PLAYER IS TOLD WHEN THE SERVER SAYS NO ────────────────────────
   ONE map, here rather than in the gesture, so the legacy call site and the
   suite name the same sentences.

   ⚠ IT IS KEYED ON THE ERROR CODE AND ON NOTHING ELSE, which is what makes it
   INDEPENDENT OF `2026-08-18-equip-release-codes.sql` BEING APPLIED. That
   migration changes exactly one thing: whether hr_apply RELEASES the intent key
   a refusal claimed. It does not rename a code, add one, or remove one. So the
   same five sentences are correct against the old release set and the new one.

   The only behaviour that could depend on it is a RETRY ON THE SAME KEY, which
   would replay the stored rejection against an unpatched database. We never do
   that: `isAnswered()` is true for every refusal, so the next gesture mints a
   fresh key (rule 1), and nothing here retries a refusal automatically.

   An UNKNOWN code still says something true and names itself, because a code
   this build has never heard of is exactly the case where the player must be
   able to quote something in a bug report. */
export const EQUIP_REFUSALS = Object.freeze({
  bad_equip: 'That gear change could not be read. Nothing was changed.',
  unknown_equip_slot: 'That equipment slot is not one the server knows.',
  wrong_slot: 'That item does not go in that slot.',
  unknown_item: "The server does not have that item yet — it may be a build newer than the server's.",
  requirement_not_met: 'You do not meet the requirement to wear that yet.',
  insufficient_item: 'The server says you do not have that item.',
  too_many_equip_ops: 'That is too many gear changes at once.',
  rate_limited: 'Slow down a moment — too many gear changes.',
  no_character: 'The server has no character in this slot yet.',
  version_conflict: 'Your gear changed somewhere else. Try again.',
  intent_mismatch: 'That gear change did not match the one the server recorded.',
});
export function equipRefusalMessage(code) {
  const k = String(code || '');
  if (Object.prototype.hasOwnProperty.call(EQUIP_REFUSALS, k)) return EQUIP_REFUSALS[k];
  return k ? `The server refused that gear change (${k}).` : 'The server refused that gear change.';
}

/** Classify an answer. Pure — status and body in, verdict out. */
export function classifyEquipResponse(status, body) {
  if (status === 429) return { outcome: 'rate-limited', body };
  if (status === 401 || status === 403) return { outcome: 'not-signed-in', body };
  if (status >= 500) return { outcome: 'unavailable', body };
  if (status === 200 && body && body.ok === true) {
    return { outcome: body.replayed === true ? 'replayed' : 'equipped', body };
  }
  if (status === 200) return { outcome: 'malformed', body };
  return { outcome: 'refused', error: (body && body.error) || null, body };
}

/** The envelope, constructed field by field — never a spread of the body.
    Shape-tested rather than code-tested for the same reason ./activity.js gives:
    a client that mirrored the server's STATELESS_REFUSALS list would be a second
    registry, and its drift would be silent. */
export function envelopeOf(body) {
  if (!body || typeof body !== 'object') return null;
  if (!body.state || typeof body.state !== 'object') return null;
  return {
    ok: true,
    version: Number(body.version),
    now: body.now || null,
    state: body.state,
    skills: body.skills || {},
    inventory: body.inventory || {},
    equipment: body.equipment || {},
    ...(body.away ? { away: body.away } : {}),
  };
}

/**
 * SEND ONE EQUIP GESTURE.
 *
 * @param ops   `{ equipSlot: itemId|null }`
 * @param o.key an idempotency key to REUSE (rule 1). Absent ⇒ a fresh one.
 * @returns a verdict from EQUIP_OUTCOMES, with `key` so the caller can reuse it.
 */
export async function sendEquip(ops, o = {}) {
  /* ⚠ EVERY RETURN BELOW THAT DOES NOT REACH `fetch` GOES THROUGH `noteDrop`.
     That is the whole b369 repair: on live b367 one of these fired on a real
     player's gesture and left no trace anywhere — not a counter, not a console
     line, not a server row — so "the flip is armed but nothing is delivered"
     was invisible from inside a running client. If you add an early return
     here, count it; the reason list is `EQUIP_DROP_REASONS`. */
  if (!isServerAccrualEnabled()) {
    noteDrop('switch-off');
    return noteVerdict({ outcome: 'switch-off', key: o.key || null });
  }
  if (!config) {
    noteDrop('unconfigured', 'configureEquip() has never been called with a url on this client');
    return noteVerdict({ outcome: 'unconfigured', key: o.key || null, dropReason: 'unconfigured' });
  }
  let token = null;
  let tokenThrew = null;
  try { token = typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { token = null; tokenThrew = String((e && e.message) || e); }
  if (!token) {
    /* SPLIT FROM `unconfigured` ON PURPOSE. "No endpoint" and "an endpoint but
       no session" are different incidents with different fixes, and b367 could
       not tell them apart because both answered with the same word. The wire
       OUTCOME stays `unconfigured` (the caller's contract is unchanged and
       equipVerdictOutcome must keep leaving the prediction standing); only the
       diagnosis is finer. */
    noteDrop(tokenThrew ? 'token-threw' : 'no-token', tokenThrew || 'the token accessor returned nothing');
    return noteVerdict({ outcome: 'unconfigured', key: o.key || null,
      dropReason: tokenThrew ? 'token-threw' : 'no-token' });
  }

  const v = validateEquipOps(ops);
  if (!v.ok) {
    noteDrop('undeliverable', v.why);
    return noteVerdict({ outcome: 'undeliverable', reason: v.why, key: o.key || null, dropReason: 'undeliverable' });
  }

  const key = isIntentKey(o.key) ? o.key : newIntentKey();
  stats.attempted++;
  const { url, init } = buildEquipRequest({
    url: config.url, apiKey: config.apiKey, token,
    /* RESOLVED PER CALL, never captured. See configureEquip's block. */
    slot: resolveActiveSlot(Number.isInteger(config.slot) ? config.slot : null),
    intentId: key, equip: v.ops,
  });

  let ac = null; let timer = null;
  try { ac = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (e) { ac = null; }
  const init2 = ac ? { ...init, signal: ac.signal } : init;
  if (ac) timer = setTimeout(() => { try { ac.abort(); } catch (e) {} }, EQUIP_TIMEOUT_MS);

  let res = null;
  try {
    res = await fetch(url, init2);
  } catch (e) {
    const aborted = !!(ac && ac.signal && ac.signal.aborted);
    if (timer) clearTimeout(timer);
    /* NOT ANSWERED ⇒ THE KEY COMES BACK so the caller reuses it. Counted AND
       warned: a CORS refusal and a dead network are indistinguishable to the
       fetch spec, so this is the branch that looks most like "nothing
       happened" from the outside — and the one an incident most needs to see. */
    const reason = String((e && e.message) || e);
    noteDrop(aborted ? 'timeout' : 'unreachable', reason);
    return noteVerdict({ outcome: aborted ? 'timeout' : 'unreachable', key, reason });
  }
  if (timer) clearTimeout(timer);
  stats.answered++;

  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  const verdict = { ...classifyEquipResponse(res.status, body), status: res.status, key };

  /* THE ENVELOPE IS THE TRUTH WHETHER THE SWAP LANDED OR NOT. A refused equip
     whose COLLECT applied carries a real payment, and the state that comes with
     it is the state after that payment — dropping it because the swap failed
     would report genuinely applied gold and XP as nothing. */
  const env = envelopeOf(body);
  if (env && typeof hooks.onEnvelope === 'function') {
    try { verdict.applied = !!hooks.onEnvelope(body, verdict); }
    catch (e) { console.warn('[equip] envelope hook threw:', e && e.message); }
  } else if (env && typeof hooks.onEnvelope !== 'function') {
    /* AN ENVELOPE WITH NOWHERE TO GO. The verb collects first, so this answer
       can carry real gold and XP the server has ALREADY applied; dropping it
       silently reports applied payment as nothing. wireServerEquip() asks
       getEquipHooks() precisely to prevent this state — if it is reached, that
       ask has been bypassed. */
    console.warn('[equip] the server returned an envelope but no onEnvelope hook is installed — a swap the '
      + 'server performed (and any payment collected with it) has just been dropped. Call setEquipHooks().');
  }
  /* ⚠ THE ONE PLACE AN ANSWER BECOMES THE FLIP'S PROOF. `noteVerdict` arms the
     absolute envelope on `equipped`/`replayed` and on nothing else. */
  return noteVerdict(verdict);
}

if (typeof window !== 'undefined') {
  window.HearthriseEquip = {
    EQUIP_VERB, MAX_EQUIP_OPS, EQUIP_OUTCOMES, UNANSWERED_OUTCOMES,
    EQUIP_REFUSALS, equipRefusalMessage,
    configureEquip, getEquipConfig, setEquipHooks, getEquipHooks, resetEquip,
    validateEquipOps, buildEquipRequest, classifyEquipResponse, envelopeOf,
    newIntentKey, isIntentKey, isAnswered, sendEquip,
    /* b369 — THE DIAGNOSIS, IN ONE PASTE. `stats` is the live object, not a
       copy: a support request that says "paste HearthriseEquip.stats" must
       show what the transport is doing NOW, and a snapshot taken at publish
       time would show all zeros forever. */
    EQUIP_DROP_REASONS, stats, equipStats, isEquipTransportProven, __resetEquipStats,
  };
}
