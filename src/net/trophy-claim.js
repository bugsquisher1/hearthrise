// ============================================================================
// src/net/trophy-claim.js — THE TROPHY CLAIM INTENT, CLIENT SIDE.
//
// "I have killed twenty thousand of those." — sent to the server, which reads
// the kill total out of its OWN counters and writes the trophy row. This client
// sends two NAMES and renders whatever comes back.
//
// Contract: supabase/functions/hr-accrue/trophy-claim.js and ./intents.js.
// Design: docs/design/BESTIARY_LADDER.md §4.
//
//   POST <SUPABASE_URL>/functions/v1/hr-accrue
//     {"verb":"trophy_claim","slot":N,"intentId":"<uuid>",
//      "trophy":{"monster":"goblin","stage":2}}
//   → 200 {ok:true, verb:'trophy_claim', receipt:{monster,stage,killsAtClaim}|null, …env}
//     409 {ok:false, error:'not_yet'|'already_owned'|'unknown_monster'|…}
//
// ── WHAT IT DOES *NOT* SEND, WHICH IS THE POINT ─────────────────────────────
// No kill count. No stage the client derived for itself as a claim of
// entitlement. No multiplier. The body is built field by field and there is no
// `...o` and never will be: the field a future caller adds by accident is the
// field that turns a NAME into a VALUE. The stage travels as "which trophy am I
// asking for", and the server refuses it out of its own counters if the
// character has not reached it — so the worst a forged stage buys is a
// `not_yet` (design §5).
//
// ── AND THERE IS NO PREDICTION LEDGER, BECAUSE NOTHING IS PREDICTED ─────────
// A claim moves no gold, no gems, no items and no XP — it writes one row. There
// is nothing to debit optimistically and nothing to put back, so the whole F1
// permanent-offset hazard ./gold.js guards against cannot arise here. The
// button goes busy, the answer arrives, the panel repaints from the server's
// projection. The claimed state is NEVER set locally ahead of the server: that
// is the residue-ahead class (CLAUDE.md §6), and on this surface it would show a
// trophy the server would refuse.
//
// ── IDEMPOTENCY (intent contract rule 1, shared with ./eat.js, ./equip.js) ──
// NOT ANSWERED (timeout, dead network, CORS) ⇒ REUSE THE KEY, so a retry is a
// replay and not a second claim attempt. ANSWERED (200 or a machine-code
// refusal) ⇒ a NEW key next time.
//
// PURE except for `fetch` and the injected hooks/config, so the suite drives the
// same bytes the browser runs. Node-importable.
// ============================================================================

import {
  resolveActiveSlot, accrueEndpoint, MAX_SLOT,
} from './accrue.js?v=553';
import { MAX_TROPHY_STAGE } from '../data/bestiary.js?v=553';

export const TROPHY_CLAIM_VERB = 'trophy_claim';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* The SAME bounded shape request.js's CATALOGUE_ID_RE admits. Restated here so
   the client refuses its own malformed request before spending a round trip,
   never so the client becomes the authority on which monsters exist — that is
   `hr_activities`, and an id this passes is still validated server side. */
const MONSTER_RE = /^[a-z0-9_]{1,64}$/;
const CLAIM_TIMEOUT_MS = 15000;

let config = null;
let hooks = { onEnvelope: null, onOutcome: null };

export const TROPHY_OUTCOMES = Object.freeze([
  'claimed',        // 200 ok:true — the trophy row landed
  'replayed',       // 200 ok:true replayed:true — this exact intent already landed
  'refused',        // 4xx/409 with a machine code; carries an envelope
  'rate-limited',   // 429 — the `claim` bucket, shared with claim_reward
  'not-signed-in',  // 401/403
  'unavailable',    // 5xx
  'malformed',      // a 200 that is not an envelope
  'unreachable',    // no answer at all (CORS, DNS, offline)
  'timeout',        // aborted — also no answer
  'unconfigured',   // no endpoint / no token on this device
  'unsendable',     // the client refused its own request before sending it
]);

/** Outcomes that mean WE WERE NOT ANSWERED. An allowlist of the unanswered, so
    a new outcome added without a decision lands on the "answered" side. */
export const UNANSWERED_OUTCOMES = Object.freeze(['unreachable', 'timeout']);
export function isAnswered(outcome) { return UNANSWERED_OUTCOMES.indexOf(outcome) === -1; }

export function newIntentKey() {
  try {
    const c = (typeof crypto !== 'undefined') ? crypto : null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    if (c && typeof c.getRandomValues === 'function') {
      const b = c.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
    }
  } catch (e) { /* fall through */ }
  return null;
}
export function isIntentKey(k) { return typeof k === 'string' && UUID_RE.test(k); }

/* ── CONFIG + HOOKS — the same shape every other transport takes, wired from
   ONE base in src/net/auth.js so the token is re-read per call and the slot is
   resolved per call (the b339/b342 slot bug, pre-empted). */
export function configureTrophyClaim(cfg) {
  if (!cfg || !cfg.url) { config = null; return null; }
  config = {
    url: String(cfg.url).replace(/\/+$/, ''),
    apiKey: cfg.apiKey || '',
    authToken: cfg.authToken || cfg.token || null,
    slot: Number.isInteger(cfg.slot) ? cfg.slot : null,
  };
  return getTrophyClaimConfig();
}
export function getTrophyClaimConfig() {
  if (!config) return null;
  return { url: config.url, slot: resolveActiveSlot(config.slot), pinnedSlot: config.slot,
    endpoint: accrueEndpoint(config.url) };
}
function tokenOf() {
  if (!config || !config.authToken) return null;
  try { return typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { return null; }
}
export function setTrophyClaimHooks(h) { hooks = { ...hooks, ...(h || {}) }; }
export function getTrophyClaimHooks() { return { ...hooks }; }
function fire(name, a, b) {
  const fn = hooks && hooks[name];
  if (typeof fn !== 'function') return null;
  try { return fn(a, b); }
  catch (e) { console.warn('[trophy] hook ' + name + ' threw:', e && e.message); return null; }
}

/* ── THE REQUEST, AS DATA — pure, so the suite asserts the LITERAL bytes ─────
   CONSTRUCTED field by field. There is no `...o`: no `kills`, no `have`, no
   `earned`, no `mult`. The server's parser would drop them anyway
   (tests/bestiary-trophy.mjs T10 proves it), but a body that never carries one
   is a body no reviewer has to check. */
export function buildTrophyClaimRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= MAX_SLOT ? o.slot : 0;
  return {
    url: accrueEndpoint(o.url),
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        verb: TROPHY_CLAIM_VERB,
        slot,
        intentId: String(o.intentId == null ? '' : o.intentId),
        trophy: {
          monster: String(o.monster == null ? '' : o.monster),
          /* A NUMBER, not a string: request.js refuses a numeric string on
             purpose, because a parser that coerced would be a parser that could
             round. Which trophy is being ASKED for — never a claim of having
             earned it. */
          stage: Number(o.stage),
        },
      }),
    },
  };
}

/** The envelope, constructed field by field — never a spread of the body. */
export function envelopeOf(body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (!b) return null;
  const version = Number(b.version);
  if (!Number.isFinite(version)) return null;
  if (!b.state || typeof b.state !== 'object') return null;
  return {
    ok: true, version, now: b.now || null, state: b.state,
    skills: b.skills || {},
    inventory: (b.inventory && typeof b.inventory === 'object') ? b.inventory : null,
  };
}

/** Classify an answer. Pure — status and body in, verdict out. */
export function classifyTrophyClaimResponse(status, body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (status === 200) {
    if (!b || b.ok !== true) return { outcome: 'malformed', body: b, reason: 'not_ok' };
    if (!envelopeOf(b)) return { outcome: 'malformed', body: b, reason: 'envelope_incomplete' };
    return { outcome: b.replayed === true ? 'replayed' : 'claimed', body: b };
  }
  if (status === 401 || status === 403) return { outcome: 'not-signed-in', body: b };
  if (status === 429) return { outcome: 'rate-limited', body: b, reason: (b && b.error) || 'rate_limited' };
  if (status === 400 || status === 409) {
    return { outcome: 'refused', body: b, reason: (b && b.error) || 'refused', stage: (b && b.stage) || null };
  }
  if (status >= 500) return { outcome: 'unavailable', body: b, reason: (b && b.error) || 'server_error' };
  return { outcome: 'malformed', body: b, reason: 'http_' + status };
}

/* ⚠ NO `lastTrophyClaim()` ACCESSOR, unlike ./eat.js's sibling state. Nothing
   reads one — the caller already has the verdict this returns, and the panel
   repaints from the ENVELOPE rather than from a remembered outcome. An exported
   getter nobody calls is the dead-exports ratchet's whole subject. */
function record(verdict) {
  fire('onOutcome', {
    outcome: verdict.outcome, reason: verdict.reason || null,
    monster: verdict.monster || null, stage: verdict.stage || null,
    status: verdict.status || 0, at: Date.now(), key: verdict.key || null,
  });
  return verdict;
}

/**
 * SEND ONE CLAIM AND RECONCILE.
 *
 * @param monster  the monster id the trophy is against
 * @param stage    1..MAX_TROPHY_STAGE
 * @param o.key    an idempotency key to REUSE (rule 1). Absent ⇒ a fresh one.
 * @returns a verdict from TROPHY_OUTCOMES, with `key` so the caller can reuse
 *          it on a NOT-ANSWERED outcome.
 *
 * ONE ATTEMPT, NO AUTOMATIC RETRY. `not_yet` and `already_owned` are answers
 * about the server's own rows; retrying either cannot change them, and the
 * envelope that came back is what the panel repaints from.
 */
export async function sendTrophyClaim(monster, stage, o = {}) {
  const id = String(monster == null ? '' : monster);
  const st = Number(stage);
  if (!config) return record({ outcome: 'unconfigured', reason: 'no_endpoint', key: o.key || null });
  const token = tokenOf();
  if (!token) return record({ outcome: 'unconfigured', reason: 'no_token', key: o.key || null });
  if (!MONSTER_RE.test(id)) {
    return record({ outcome: 'unsendable', reason: 'bad_monster', key: o.key || null, monster: id });
  }
  if (!Number.isInteger(st) || st < 1 || st > MAX_TROPHY_STAGE) {
    return record({ outcome: 'unsendable', reason: 'bad_stage', key: o.key || null, monster: id, stage: st });
  }

  const key = isIntentKey(o.key) ? o.key : newIntentKey();
  if (!isIntentKey(key)) return record({ outcome: 'unsendable', reason: 'no_intent_key', key: null });

  const { url, init } = buildTrophyClaimRequest({
    url: config.url, apiKey: config.apiKey, token,
    slot: resolveActiveSlot(config.slot), intentId: key, monster: id, stage: st,
  });

  let ac = null; let timer = null;
  try { ac = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (e) { ac = null; }
  const init2 = ac ? { ...init, signal: ac.signal } : init;
  if (ac) timer = setTimeout(() => { try { ac.abort(); } catch (e) {} }, CLAIM_TIMEOUT_MS);

  let res = null;
  try {
    res = await fetch(url, init2);
  } catch (e) {
    const aborted = !!(ac && ac.signal && ac.signal.aborted);
    if (timer) clearTimeout(timer);
    /* NOT ANSWERED ⇒ THE KEY COMES BACK so the caller reuses it. */
    return record({ outcome: aborted ? 'timeout' : 'unreachable',
      reason: String((e && e.message) || e), key, monster: id, stage: st });
  }
  if (timer) clearTimeout(timer);

  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  const verdict = {
    ...classifyTrophyClaimResponse(res.status, body),
    status: res.status, key, monster: id, stage: st,
  };

  /* THE ENVELOPE IS THE TRUTH WHETHER THE CLAIM LANDED OR NOT. A `not_yet`
     refusal carries the server's current state, and applying it is exactly how a
     client whose own counter ran ahead is put back — which is the one thing this
     surface must get right (CLAUDE.md §6). */
  const env = envelopeOf(body);
  if (env && typeof hooks.onEnvelope === 'function') {
    try { verdict.applied = !!hooks.onEnvelope(body, verdict); }
    catch (e) { console.warn('[trophy] envelope hook threw:', e && e.message); }
  }
  return record(verdict);
}

/* ── WHAT A REFUSED CLAIM SAYS TO THE PLAYER ───────────────────────────────
   A TABLE keyed by the server's own machine code, because these codes are a
   FAMILY: a new one is a row, not a branch. It lives with the transport rather
   than at the call site because the codes are this layer's vocabulary. An
   unlisted code says NOTHING rather than guessing — a made-up sentence about a
   refusal nobody wrote is worse than silence. */
export const TROPHY_REFUSAL_COPY = Object.freeze({
  /* The kill count is the SERVER's, and this is the sentence that makes that
     legible instead of infuriating: the panel just said the trophy was ready. It
     can happen honestly — kills land on a SETTLE, so the tail of an unsettled
     fight is not counted yet (design §5) — and the envelope that came with this
     refusal has already corrected the number on screen. */
  not_yet: 'Not yet — the server counts fewer kills than that. Your latest fight may not have settled.',
  already_owned: 'You have already claimed that trophy.',
  unknown_monster: 'The server does not know that monster.',
  no_character: 'No character in this slot.',
  rate_limited: 'Too many claims at once — try again in a moment.',
  intent_mismatch: 'That claim was already used for something else. Try again.',
  intent_in_flight: 'That claim is still being processed. Try again in a moment.',
});

/** The sentence for a verdict, or '' when there is nothing honest to say. */
export function refusalCopyFor(verdict) {
  const code = verdict && (verdict.reason || (verdict.body && verdict.body.error));
  if (!code) return '';
  return Object.prototype.hasOwnProperty.call(TROPHY_REFUSAL_COPY, code)
    ? TROPHY_REFUSAL_COPY[code] : '';
}

/* Published for the classic-script Bestiary modal, for the envelope-hook
   installer in src/legacy.js and for the sign-in wiring in src/net/auth.js —
   the same seam ./eat.js and every other transport uses. */
if (typeof window !== 'undefined') {
  window.HearthriseTrophyClaim = {
    TROPHY_CLAIM_VERB, TROPHY_OUTCOMES, UNANSWERED_OUTCOMES,
    configureTrophyClaim, getTrophyClaimConfig, setTrophyClaimHooks, getTrophyClaimHooks,
    buildTrophyClaimRequest, classifyTrophyClaimResponse, envelopeOf,
    newIntentKey, isIntentKey, isAnswered, sendTrophyClaim,
    TROPHY_REFUSAL_COPY, refusalCopyFor,
  };
}
