// ============================================================================
// src/net/eat.js — THE MANUAL-EAT INTENT, CLIENT SIDE (2026-08-25, Paione P0).
//
// "Eat one Turnip." — sent to the server, which DEBITS the food and CREDITS the
// heal. This client sends a NAME and reconciles whatever comes back.
//
// Contract: supabase/functions/hr-accrue/eat.js and ./intents.js.
//
//   POST <SUPABASE_URL>/functions/v1/hr-accrue
//     {"verb":"eat","slot":N,"intentId":"<uuid>","item":"turnip"}
//   → 200 {ok:true, verb:'eat', state:{hp,…}, inventory:{…}, receipt:{…}|null, …env}
//     409 {ok:false, error:'insufficient_item'|'item_not_food'|'version_conflict'|…}
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// Before it, `window.eatFood` (src/legacy.js) debited G.inventory CLIENT-ONLY
// and healed CLIENT-ONLY and sent NO intent. With inventory authority LIVE, the
// ABSOLUTE inventory reconcile (accrue.js applyEnvelopeState) restored the eaten
// OWNABLE food from server truth on the next envelope/reload — a free heal AND
// an effective dupe. This transport makes the consumption real server-side.
//
// ── WHY THERE IS NO PREDICTION LEDGER HERE (unlike ./gold.js) ────────────────
// An eat moves HP and one item — NOT gold or gems. Both HP and inventory are
// reconciled ABSOLUTELY by the envelope (applyEnvelopeState: inventory is
// assigned under the armed absolute branch; HP is RAISED by the floor rule and
// never lowered). There is no additive currency to orphan, so the F1
// permanent-offset hazard gold.js guards against cannot arise. The local heal +
// local debit `window.eatFood` performs are DISPLAY prediction, reconciled to
// server truth by the same envelope every other verb uses.
//
// ── IDEMPOTENCY (intent contract rule 1, shared with ./equip.js, ./gold.js) ──
// NOT ANSWERED (timeout, dead network, CORS) ⇒ REUSE THE KEY so the debit cannot
// apply twice. ANSWERED (200 or a machine-code refusal) ⇒ a NEW key next time.
//
// PURE except for `fetch` and the injected hooks/config, so the suite drives the
// same bytes the browser runs. Node-importable.
// ============================================================================

import {
  isServerAccrualEnabled, resolveActiveSlot, accrueEndpoint, MAX_SLOT,
} from './accrue.js?v=500';

export const EAT_VERB = 'eat';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_RE = /^[a-z0-9_]{1,64}$/;
const EAT_TIMEOUT_MS = 15000;

let config = null;
let hooks = { onEnvelope: null, onOutcome: null };
let last = null;

/* Deliberately the accrual switch itself, not a copy of the key. Five switches
   would produce a client that eats against a server that never heard of the
   character. */
export function isEatIntentEnabled() { return isServerAccrualEnabled(); }

export const EAT_OUTCOMES = Object.freeze([
  'eaten',          // 200 ok:true — the debit+heal landed; the envelope is truth
  'replayed',       // 200 ok:true replayed:true — this exact intent already landed
  'refused',        // 4xx/409 with a machine code; may carry an envelope
  'rate-limited',   // 429 — shared with set_activity at 30/min
  'not-signed-in',  // 401/403
  'unavailable',    // 5xx
  'malformed',      // a 200 that is not an envelope
  'unreachable',    // no answer at all (CORS, DNS, offline)
  'timeout',        // aborted — also no answer
  'unconfigured',   // no endpoint / no token on this device
  'switch-off',     // the kill switch is off; nothing was sent
  'unsendable',     // the client refused its own request before sending it
]);

/** Outcomes that mean WE WERE NOT ANSWERED. The key must be REUSED after one —
    an allowlist of the unanswered, so a new outcome added without a decision
    lands on the "answered" side (mints a fresh key), never the side that could
    apply a debit twice. */
export const UNANSWERED_OUTCOMES = Object.freeze(['unreachable', 'timeout']);
export function isAnswered(outcome) { return UNANSWERED_OUTCOMES.indexOf(outcome) === -1; }

/* ── WHAT THE PLAYER IS TOLD WHEN THE SERVER SAYS NO ────────────────────────
   Keyed on the error code and nothing else. An unknown code still names itself
   so a player can quote it in a bug report. */
export const EAT_REFUSALS = Object.freeze({
  insufficient_item: 'The server says you do not have that food.',
  item_not_food: 'That is not something you can eat.',
  unknown_item: "The server does not have that item yet — it may be a newer build than the server's.",
  bad_item: 'That food could not be read. Nothing was changed.',
  rate_limited: 'Slow down a moment — too many actions.',
  no_character: 'The server has no character in this slot yet.',
  version_conflict: 'Your state changed elsewhere. Try again.',
  intent_mismatch: 'That did not match the food the server recorded.',
});
export function eatRefusalMessage(code) {
  const k = String(code || '');
  if (Object.prototype.hasOwnProperty.call(EAT_REFUSALS, k)) return EAT_REFUSALS[k];
  return k ? `The server refused that (${k}).` : 'The server refused that.';
}

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

/* ── CONFIG + HOOKS ─────────────────────────────────────────────────────────
   The same `{url, apiKey, authToken, slot}` shape every other transport takes,
   wired from ONE base in src/net/auth.js so a token captured at sign-in is
   re-read per call and a slot is resolved per call (the b339/b342 slot bug,
   pre-empted). */
export function configureEat(cfg) {
  if (!cfg || !cfg.url) { config = null; return null; }
  config = {
    url: String(cfg.url).replace(/\/+$/, ''),
    apiKey: cfg.apiKey || '',
    authToken: cfg.authToken || cfg.token || null,
    slot: Number.isInteger(cfg.slot) ? cfg.slot : null,
  };
  return getEatConfig();
}
export function getEatConfig() {
  if (!config) return null;
  return { url: config.url, slot: resolveActiveSlot(config.slot), pinnedSlot: config.slot,
    endpoint: accrueEndpoint(config.url) };
}
function tokenOf() {
  if (!config || !config.authToken) return null;
  try { return typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { return null; }
}
export function setEatHooks(h) { hooks = { ...hooks, ...(h || {}) }; }
export function getEatHooks() { return { ...hooks }; }
function fire(name, a, b) {
  const fn = hooks && hooks[name];
  if (typeof fn !== 'function') return null;
  try { return fn(a, b); }
  catch (e) { console.warn('[eat] hook ' + name + ' threw:', e && e.message); return null; }
}

/* ── THE REQUEST, AS DATA — pure, so the suite asserts the LITERAL bytes ─────
   CONSTRUCTED field by field. There is no `...o` and there never will be: the
   field a future caller adds by accident is the field that turns a NAME into a
   VALUE. In particular there is no `heals`, `hp`, `qty` or `amount`. */
export function buildEatRequest(opts) {
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
        verb: EAT_VERB,
        slot,
        intentId: String(o.intentId == null ? '' : o.intentId),
        item: String(o.item == null ? '' : o.item),
      }),
    },
  };
}

/** The envelope, constructed field by field — never a spread of the body. The
    SHAPE decides whether an answer carries state, so a refusal that reached the
    database (insufficient_item, version_conflict) is reconciled
    the same way a success is. */
export function envelopeOf(body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (!b) return null;
  const version = Number(b.version);
  if (!Number.isFinite(version)) return null;
  if (!b.state || typeof b.state !== 'object') return null;
  if (!b.inventory || typeof b.inventory !== 'object') return null;
  return {
    ok: true, version, now: b.now || null, state: b.state,
    skills: b.skills || {}, inventory: b.inventory,
    equipment: (b.equipment && typeof b.equipment === 'object') ? b.equipment : null,
  };
}

/** Classify an answer. Pure — status and body in, verdict out. */
export function classifyEatResponse(status, body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (status === 200) {
    if (!b || b.ok !== true) return { outcome: 'malformed', body: b, reason: 'not_ok' };
    if (!envelopeOf(b)) return { outcome: 'malformed', body: b, reason: 'envelope_incomplete' };
    return { outcome: b.replayed === true ? 'replayed' : 'eaten', body: b };
  }
  if (status === 401 || status === 403) return { outcome: 'not-signed-in', body: b };
  if (status === 429) return { outcome: 'rate-limited', body: b, reason: (b && b.error) || 'rate_limited' };
  if (status === 400 || status === 409) {
    return { outcome: 'refused', body: b, reason: (b && b.error) || 'refused', stage: (b && b.stage) || null };
  }
  if (status >= 500) return { outcome: 'unavailable', body: b, reason: (b && b.error) || 'server_error' };
  return { outcome: 'malformed', body: b, reason: 'http_' + status };
}

function record(verdict) {
  last = { outcome: verdict.outcome, reason: verdict.reason || null, stage: verdict.stage || null,
    status: verdict.status || 0, at: Date.now(), key: verdict.key || null };
  fire('onOutcome', last);
  return verdict;
}
export function getEatState() {
  return { enabled: isEatIntentEnabled(), configured: !!config, last };
}

/**
 * SEND ONE EAT GESTURE AND RECONCILE.
 *
 * @param foodId  the item id to eat
 * @param o.key   an idempotency key to REUSE (rule 1). Absent ⇒ a fresh one.
 * @returns a verdict from EAT_OUTCOMES, with `key` so the caller can reuse it on
 *          a NOT-ANSWERED outcome.
 *
 * ONE ATTEMPT, NO AUTOMATIC RETRY. A refused key stays rejected for up to 25h
 * (hr_apply records the decision), so retrying a refusal cannot succeed; and an
 * UNANSWERED eat is the case where the client must decide nothing on its own —
 * the next envelope settles it. Whatever envelope comes back — success OR a
 * refusal that reached the database — is applied through the SAME hook, so the
 * eaten food never reappears and a refused eat's optimistic local debit is put
 * back from server truth.
 */
export async function sendEat(foodId, o = {}) {
  const id = String(foodId == null ? '' : foodId);
  if (!isEatIntentEnabled()) return record({ outcome: 'switch-off', key: o.key || null });
  if (!config) return record({ outcome: 'unconfigured', reason: 'no_endpoint', key: o.key || null });
  const token = tokenOf();
  if (!token) return record({ outcome: 'unconfigured', reason: 'no_token', key: o.key || null });
  if (!ITEM_RE.test(id)) return record({ outcome: 'unsendable', reason: 'bad_item', key: o.key || null });

  const key = isIntentKey(o.key) ? o.key : newIntentKey();
  if (!isIntentKey(key)) return record({ outcome: 'unsendable', reason: 'no_intent_key', key: null });

  const { url, init } = buildEatRequest({
    url: config.url, apiKey: config.apiKey, token,
    slot: resolveActiveSlot(config.slot), intentId: key, item: id,
  });

  let ac = null; let timer = null;
  try { ac = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (e) { ac = null; }
  const init2 = ac ? { ...init, signal: ac.signal } : init;
  if (ac) timer = setTimeout(() => { try { ac.abort(); } catch (e) {} }, EAT_TIMEOUT_MS);

  let res = null;
  try {
    res = await fetch(url, init2);
  } catch (e) {
    const aborted = !!(ac && ac.signal && ac.signal.aborted);
    if (timer) clearTimeout(timer);
    /* NOT ANSWERED ⇒ THE KEY COMES BACK so the caller reuses it. */
    return record({ outcome: aborted ? 'timeout' : 'unreachable', reason: String((e && e.message) || e), key });
  }
  if (timer) clearTimeout(timer);

  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  const verdict = { ...classifyEatResponse(res.status, body), status: res.status, key };

  /* THE ENVELOPE IS THE TRUTH WHETHER THE EAT LANDED OR NOT. A refused eat
     (insufficient_item, version_conflict) carries the server's
     current state, and applying it is what puts the optimistic local debit and
     heal back to server truth — the food that "returned" no longer can. */
  const env = envelopeOf(body);
  if (env && typeof hooks.onEnvelope === 'function') {
    try { verdict.applied = !!hooks.onEnvelope(body, verdict); }
    catch (e) { console.warn('[eat] envelope hook threw:', e && e.message); }
  } else if (env) {
    console.warn('[eat] the server returned an envelope but no onEnvelope hook is installed — '
      + 'a debit/heal the server performed has just been dropped from the client view. Call setEatHooks().');
  }
  return record(verdict);
}

if (typeof window !== 'undefined') {
  window.HearthriseEat = {
    EAT_VERB, EAT_OUTCOMES, UNANSWERED_OUTCOMES, EAT_REFUSALS, eatRefusalMessage,
    configureEat, getEatConfig, setEatHooks, getEatHooks,
    buildEatRequest, classifyEatResponse, envelopeOf,
    newIntentKey, isIntentKey, isAnswered, isEatIntentEnabled, sendEat, getEatState,
  };
}
