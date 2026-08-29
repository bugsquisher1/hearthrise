// ============================================================================
// src/net/character.js — THE CHARACTER-CREATION INTENT (b338).
//
// The blocker b338 exists to remove: `player_state` held ZERO ROWS, so every
// `hr-accrue` call returned `no_character` and the b337 switch could not be
// turned on for anybody. The RPC to fix that — `hr_create_character` — has been
// live in production since the foundation landed. **Nothing ever called it.**
// This file is the missing call.
//
// ── THE ONE PROPERTY THIS FILE HOLDS, SAME AS accrue.js ─────────────────────
// **IT NEVER AUTHORS STATE.** Not on success, not on failure, not on a timeout.
// Its entire output is a NAMED VERDICT plus, on success, a latch that says "the
// server has confirmed a character exists in this slot". It writes nothing to
// `G`, invents no gold, no inventory and no skills — the starting kit is the
// SERVER's (`hr_start_kit`, generated from src/data/start-kit.js), and the
// client learns what it received by asking `hr-accrue`, exactly as it learns
// everything else.
//
// That matters more here than almost anywhere else in the program. A "helpful"
// fallback that seeded a local character when the server was unreachable would
// hand the client back authorship of the starting state — 500 gold and a sword
// per call, per device, unverifiable — which is the precise failure the whole
// server-authority program exists to close. There is no such path.
//
// ── THE CONTRACT, AS FOUND (not as guessed) ─────────────────────────────────
// Source: public.hr_create_character(int) as it exists in production, plus
// supabase/migrations/2026-08-14-character-bootstrap.sql which hardens it.
//
//   REQUEST   POST <SUPABASE_URL>/rest/v1/rpc/hr_create_character
//             apikey: <anon key>
//             Authorization: Bearer <user JWT>   — auth.uid() IS the identity;
//                                                  there is no p_user parameter
//                                                  and no way to name another
//                                                  player.
//             Content-Type: application/json
//             body {"p_slot": N}                 — ONE integer in [0,5]. The
//                                                  server clamps and validates
//                                                  it again regardless.
//
//   RESPONSE  200 {ok:true,  slot, created:true}          the character is new
//             200 {ok:true,  slot, created:false}         it already existed
//             200 {ok:true,  slot, created:false, raced:true}
//                                                         a concurrent call won
//             200 {ok:false, error:'not_signed_in'}
//             200 {ok:false, error:'bad_slot'}
//             200 {ok:false, error:'rate_limited'}
//             200 {ok:false, error:'no_start_kit'}        catalogue not applied
//             401/403                                     the JWT is not accepted
//             404                                         the RPC is not deployed
//             5xx                                         PostgREST/Postgres
//
// NOTE the RPC returns HTTP 200 for its own refusals — a jsonb verdict is a
// successful call that says no. Status alone is therefore not the answer, which
// is why classifyCreateResponse() reads BOTH.
//
// ── WHY `created` IS THE WHOLE POINT ────────────────────────────────────────
// Before b338 the RPC answered a second call with `{ok:false, slot_taken}`.
// Character creation is idempotent by nature — the key is (user_id, slot) and
// user_id comes from auth.uid(), so "taken" can only ever mean "taken by you" —
// and reporting that as a failure meant a client whose success response was lost
// on the wire could not distinguish "I already did this" from "something is
// broken", and the only safe behaviour left to it was to give up. `created` is
// the honest receipt of which of the two happened, and BOTH are success.
//
// ── ONE CALL PER SESSION, BY LATCH ──────────────────────────────────────────
// processOffline() can fire many times in a session (every return from hidden).
// The RPC is idempotent so a repeat is harmless, but it is not free: it spends
// the 60/min ensure budget and a round trip for an answer that cannot change.
// So a confirmed slot is latched and never asked about again — and the latch is
// keyed on (endpoint, USER ID, slot), so switching account or character re-arms
// it. b339: it used to be keyed on (endpoint, slot) with the slot hard-coded to
// 0 and the endpoint identical for every account, i.e. on a constant — see
// latchKey() for what that cost.
//
// DOM-free. Node-importable. No fetch seam — `fetch` is resolved at call time so
// a test's override is the transport, the same rule accrue.js follows.
// ============================================================================

import { ACCRUE_KILL_KEY, isServerAccrualEnabled, resolveActiveSlot } from './accrue.js?v=492';

/* THE SAME SWITCH AS b337, DELIBERATELY. Two switches would mean a state where
   the client creates characters it will never accrue against, or asks for
   accrual against a character it never created. One switch, one authority. */
export { ACCRUE_KILL_KEY };
export function isCharacterIntentEnabled() { return isServerAccrualEnabled(); }

let config = null;      // {url, apiKey, authToken, userId, slot}
let latch = null;       // the (endpoint, user, slot) whose existence the server confirmed
let inFlight = null;
let stopped = null;     // an outcome this build cannot make progress against

/** Wired from auth.js's enableLiveSync(), beside configureAccrual, so there is
 *  ONE copy of the url / key / token accessor in the client.
 *
 *  `userId` and `slot` are ACCESSORS, not values (b339). Both change while this
 *  module stays configured — a re-sign-in without a re-wire, a character switch
 *  — and a captured value is one that is wrong by the time the latch consults
 *  it. Same rule, same reason, as `authToken`.
 */
export function configureCharacter(cfg) {
  if (!cfg || !cfg.url) { config = null; latch = null; stopped = null; return null; }
  const next = {
    url: String(cfg.url).replace(/\/+$/, ''),
    apiKey: cfg.apiKey || '',
    authToken: cfg.authToken || null,
    userId: cfg.userId || null,
    slot: Number.isInteger(cfg.slot) ? cfg.slot : null,
  };
  /* Re-wiring is a new identity until proven otherwise. Keeping a latch across
     a sign-out would tell the next account its character exists. The latch KEY
     now carries the user id as well, so this is belt to that braces rather
     than the only defence — see latchKey(). */
  if (!config || config.url !== next.url) { latch = null; stopped = null; }
  config = next;
  return getCharacterConfig();
}

function userIdOf() {
  if (!config || !config.userId) return null;
  try {
    const v = typeof config.userId === 'function' ? config.userId() : config.userId;
    return (typeof v === 'string' && v) ? v : null;
  } catch (e) { return null; }
}

export function getCharacterConfig() {
  if (!config) return null;
  return { url: config.url, slot: resolveActiveSlot(config.slot), pinnedSlot: config.slot,
    userId: userIdOf(), endpoint: characterEndpoint(config.url) };
}

/** Derived once from the project URL. Never hand-copied. */
export function characterEndpoint(base) {
  return String(base || '').replace(/\/+$/, '') + '/rest/v1/rpc/hr_create_character';
}

function tokenOf() {
  if (!config || !config.authToken) return null;
  try { return typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { return null; }
}

/* ── THE LATCH KEY MUST NAME THE PLAYER (b339) ──────────────────────────────
   It used to be `(endpoint, slot)`. The endpoint is derived from the PROJECT
   url — byte-identical for every account on earth — and the slot was hard-coded
   to 0. So the key was a CONSTANT: sign out of account A and into account B on
   the same device and the latch still matched, and this module told B "the
   server has confirmed your character exists" without ever asking. B's first
   accrual then answers `no_character` and the player is stuck on an error that
   a reload does not clear, because the latch survives it too.

   The user id is what makes the key an identity. It is read LIVE (auth.js
   supplies an accessor), so the invalidation is automatic and cannot be
   forgotten at a call site — including the sign-out path, which is also wired
   now, but which is no longer the thing this depends on.

   `null` user is deliberately NOT a key: an unknown identity may never match a
   latch, or a signed-out device inherits the last player's confirmation. */
export function latchKey(url, userId, slot) {
  if (!userId) return null;
  return characterEndpoint(url) + '#' + userId + '#' + slot;
}

/** Has the server already confirmed a character in this slot this session? */
export function isCharacterConfirmed(slot) {
  if (!config || !latch) return false;
  const s = resolveActiveSlot(Number.isInteger(slot) ? slot : config.slot);
  const k = latchKey(config.url, userIdOf(), s);
  return !!k && latch === k;
}

/** Test seam, and the thing auth.js calls on sign-out (b339 — it now HAS a
 *  caller; before this it was documented as "the thing auth.js calls" and grep
 *  found none anywhere in src/). */
export function resetCharacterIntent() { latch = null; inFlight = null; stopped = null; }

/* ── THE REQUEST, AS DATA ───────────────────────────────────────────────────
   PURE and exported, so a test asserts the LITERAL bytes that go on the wire
   rather than asserting that code exists which might build them. Same reasoning
   as accrue.js's buildAccrueRequest — a network test that cannot observe a
   request is decoration. */
export function buildCreateCharacterRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  /* CONSTRUCTED, never a filtered copy of anything, and never a spread of a
     caller's object — one integer is the entire request. There is deliberately
     no user id in it: the server reads auth.uid() and there is no parameter
     through which one player could name another. */
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= 5 ? o.slot : 0;
  return {
    url: characterEndpoint(o.url),
    init: { method: 'POST', headers, body: JSON.stringify({ p_slot: slot }) },
  };
}

/* ── THE ANSWER, AS A VERDICT ───────────────────────────────────────────────
   PURE. Exactly two outcomes mean "a character exists in this slot on the
   server" — 'created' and 'existed' — and neither of them puts a number
   anywhere. Everything else changes nothing, by construction. */
export const CHARACTER_OUTCOMES = [
  'created',        // the server made one, and stated the starting kit itself
  'existed',        // there was already one; the ensure is a no-op
  'rate-limited',   // ok:false rate_limited — try later, nothing is wrong
  'bad-slot',       // ok:false bad_slot — a client bug, not a server one
  'not-signed-in',  // ok:false not_signed_in, or HTTP 401/403
  'not-deployed',   // HTTP 404 — the RPC is not in this database
  'unavailable',    // HTTP 5xx, or ok:false no_start_kit (catalogue missing)
  'refused',        // ok:false with a code this build does not know
  'malformed',      // a 200 that is not a verdict at all
  'unreachable',    // the request never got an answer (CORS, DNS, offline)
  'unconfigured',   // no endpoint / no token on this device
];

/** Does this body actually SAY a character exists? Fail closed. */
export function isCharacterConfirmation(body) {
  if (!body || typeof body !== 'object') return false;
  if (body.ok !== true) return false;
  /* `created` must be a real boolean. A missing field would otherwise be read
     as `existed` by the falsy branch below and latch a character nobody has. */
  return typeof body.created === 'boolean';
}

export function classifyCreateResponse(status, body) {
  const b = (body && typeof body === 'object') ? body : null;

  if (status === 401 || status === 403) return { outcome: 'not-signed-in', body: b };
  if (status === 404) return { outcome: 'not-deployed', body: b };
  if (status >= 500) return { outcome: 'unavailable', body: b, reason: 'http_' + status };

  if (status !== 200) return { outcome: 'malformed', body: b, reason: 'http_' + status };

  if (!b) return { outcome: 'malformed', body: b, reason: 'no_body' };

  if (isCharacterConfirmation(b)) {
    return { outcome: b.created ? 'created' : 'existed', body: b, slot: b.slot, raced: !!b.raced };
  }
  if (b.ok === true) return { outcome: 'malformed', body: b, reason: 'no_created_flag' };

  switch (b.error) {
    case 'rate_limited':  return { outcome: 'rate-limited', body: b };
    case 'bad_slot':      return { outcome: 'bad-slot', body: b };
    case 'not_signed_in': return { outcome: 'not-signed-in', body: b };
    /* The catalogue was not applied. The server is up and refusing correctly;
       nothing the player can do, and nothing this device may substitute. */
    case 'no_start_kit':  return { outcome: 'unavailable', body: b, reason: 'no_start_kit' };
    default:              return { outcome: 'refused', body: b, reason: b.error || 'unknown' };
  }
}

/** Outcomes after which a character definitely exists server-side. */
export function isCharacterPresent(outcome) {
  return outcome === 'created' || outcome === 'existed';
}

/**
 * ENSURE A CHARACTER EXISTS. Returns a verdict; never a game value.
 *
 * Deliberately NOT retried in a loop and NOT backed off into a halt sheet:
 * accrue.js already owns the "the server is not answering" conversation with
 * the player, and a failure here surfaces there anyway as `no-character`. A
 * second breaker and a second modal for the same outage would be two sheets
 * arguing about one problem.
 */
export async function ensureCharacter(opts) {
  const o = opts || {};
  if (inFlight) return inFlight;

  if (!config) return { outcome: 'unconfigured', reason: 'no_endpoint', present: false };
  const slot = resolveActiveSlot(Number.isInteger(o.slot) ? o.slot : config.slot);
  if (!o.force && isCharacterConfirmed(slot)) {
    return { outcome: 'existed', cached: true, present: true, slot };
  }
  /* THE STOP LATCH (b339). One outcome cannot change without a DATABASE
     deploy: a 200 that is `ok:true` with no `created` flag, which is what the
     CURRENT production `hr_create_character` returns because
     2026-08-14-character-bootstrap.sql is staged and unapplied. Re-asking costs
     a round trip and a slot of the 6/hour CREATION budget — and the live body
     charges that budget BEFORE its slot_taken check, so six reloads exhaust it
     and the player is then also told `rate_limited`. Ask once per session, say
     so loudly, and stop. Cleared by resetCharacterIntent() / a re-wire. */
  if (!o.force && stopped) {
    return { ...stopped, cached: true, present: false, slot };
  }
  const token = tokenOf();
  if (!token) return { outcome: 'unconfigured', reason: 'no_token', present: false };

  const { url, init } = buildCreateCharacterRequest({
    url: config.url, apiKey: config.apiKey, token, slot,
  });

  inFlight = (async () => {
    let res = null;
    try {
      res = await fetch(url, init);
    } catch (e) {
      /* CORS, DNS and a dead network are indistinguishable here by design of the
         fetch spec. All three mean the same thing: we do not know whether this
         player has a character, so we do not claim they do. */
      return settle({ outcome: 'unreachable', reason: String((e && e.message) || e) }, slot);
    }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return settle({ ...classifyCreateResponse(res.status, body), status: res.status }, slot);
  })();

  try { return await inFlight; } finally { inFlight = null; }
}

/** The ONE place an outcome becomes state — and the only state is the latch. */
function settle(verdict, slot) {
  const present = isCharacterPresent(verdict.outcome);
  if (present && config) latch = latchKey(config.url, userIdOf(), slot);
  if (verdict.outcome === 'created') {
    console.log('[character] the server created a character in slot ' + slot
      + ' with its own starting kit');
  } else if (verdict.reason === 'no_created_flag') {
    /* LOUD, AND BY NAME. This is not a network problem and not a player
       problem: the server answered `ok:true` and did not say whether it created
       anything, which is precisely the shape of the PRE-b338 RPC. Anyone
       reading a generic "could not confirm" warning here would go looking at
       the client. The diagnosis is one line and it belongs in the console. */
    stopped = { ...verdict };
    console.error('[character] THE SERVER IS RUNNING A PRE-b338 hr_create_character — it answered '
      + 'ok:true with NO `created` flag, so this client cannot tell "I made one" from "one already '
      + 'existed" and will not claim a character exists. Away time will not be credited. '
      + 'FIX: apply supabase/migrations/2026-08-14-character-bootstrap.sql. Until then the server '
      + 'accrual switch must stay OFF for real accounts. (Asked once; will not re-ask this session.)');
  } else if (!present) {
    /* Said once, plainly, and never dressed up as success. */
    console.warn('[character] the server did not confirm a character in slot ' + slot
      + ' (' + verdict.outcome + (verdict.reason ? ': ' + verdict.reason : '') + ')'
      + ' — away time will not be credited, and this device will not invent one.');
  }
  return { ...verdict, present, slot };
}

/**
 * The entry point legacy.js's b337 gate calls. Ensures a character exists, then
 * asks for accrual REGARDLESS of the verdict.
 *
 * "Regardless" is the important word and it is not laziness. If the ensure
 * failed because the network is down, accrual will fail the same way and
 * accrue.js will tell the player once, in one sheet. If it failed because this
 * build does not understand a new refusal code, the character may well exist
 * and skipping accrual would silently cost the player their absence. The server
 * is the authority on whether there is anything to pay; this function's job is
 * only to make sure it has been ASKED to create one, not to gate the ask.
 */
export function ensureThenAccrue(opts) {
  const p = ensureCharacter(opts).then((v) => {
    try {
      const A = (typeof window !== 'undefined') && window.HearthriseAccrual;
      if (A && typeof A.beginServerAccrual === 'function') A.beginServerAccrual(opts);
    } catch (e) { /* accrue.js owns its own failure reporting */ }
    return v;
  });
  p.catch(() => {});
  return p;
}

if (typeof window !== 'undefined') {
  window.HearthriseCharacter = {
    CHARACTER_OUTCOMES, ACCRUE_KILL_KEY,
    isCharacterIntentEnabled, configureCharacter, getCharacterConfig,
    characterEndpoint, latchKey, buildCreateCharacterRequest, classifyCreateResponse,
    isCharacterConfirmation, isCharacterPresent, isCharacterConfirmed,
    ensureCharacter, ensureThenAccrue, resetCharacterIntent,
  };
}
