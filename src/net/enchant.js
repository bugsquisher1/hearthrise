// ============================================================================
// src/net/enchant.js — THE ENCHANT INTENT, CLIENT SIDE (ELEMENTS v1).
//
// "Bind this rune to my weapon." — sent to the server, which decides.
// src/net/equip.js's leaner sibling: an enchant moves exactly one rune and
// stamps exactly one element, so the client contributes even less than an
// equip does — a slot NUMBER and a rune NAME, and nothing else.
//
//   POST <SUPABASE_URL>/functions/v1/hr-accrue
//     {"verb":"enchant","slot":N,"intentId":"<uuid>",
//      "enchant":{"slot":"weapon","rune":"ember_rune"}}
//   → 200 {ok:true, verb:'enchant', state:{enchant:{weapon:'ember'}}, ...envelope}
//     409 {ok:false, error:'insufficient_item'|'wrong_slot'|'unknown_item'|'rate_limited'}
//
// ── WHAT THE CLIENT MAY SEND, AND WHAT IT MAY NOT ───────────────────────────
// The rune ID and the slot it targets. NEVER an element name, a magnitude, a
// multiplier or a success bit. The server reads the rune's `element` field off
// ITEMS[rune] server-side (src/core/elements.js runeElement), validates the
// weapon slot actually holds a weapon, debits one rune under a lock, and
// AUTHORS `state.enchant.weapon`. The client applies the returned envelope
// absolutely and renders it — it never computes the element itself. Server
// authority: a forged rune name is refused (`unknown_item`), a rune the player
// does not own is refused (`insufficient_item`), an empty/non-weapon weapon
// slot is refused (`wrong_slot`).
//
// ── COLLECTS FIRST ──────────────────────────────────────────────────────────
// Like equip, the verb collects any pending accrual before applying, so a
// refused enchant can still carry a real payment; the envelope is the truth
// whether the bind landed or not, and is applied through the same
// `applyServerEnvelope` hook every other intent uses.
//
// ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
// Rule 1, shared with equip/activity: NOT ANSWERED ⇒ REUSE THE KEY. A replay
// consumes the rune exactly once (the server holds the intent id); a retry
// after a CORS/DNS/offline failure carries the same key so the debit cannot
// apply twice.
//
// PURE except for `fetch` and the injected config/hooks, so the suite drives
// the same bytes the browser runs (test with a mocked fetch, like the gold /
// equip tests).
// ============================================================================

export const ENCHANT_VERB = 'enchant';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ITEM_RE = /^[a-z0-9_]{1,64}$/;
const MAX_SLOT = 5;
const ENCHANT_TIMEOUT_MS = 15000;

/* The only gear slot v1 enchants. A constant, not a parameter: the contract
   binds runes to the WEAPON, and a client that could name another slot would
   be inventing an instruction the server has no verb for. */
export const ENCHANT_SLOT = 'weapon';

let config = null;
let hooks = { onEnvelope: null };

export function configureEnchant(cfg) {
  config = cfg && cfg.url ? { ...cfg, authToken: cfg.authToken || cfg.token || null } : null;
  return config;
}
export function getEnchantConfig() { return config; }
export function setEnchantHooks(h) { hooks = { ...hooks, ...(h || {}) }; }
export function getEnchantHooks() { return { ...hooks }; }
export function resetEnchant() { config = null; hooks = { onEnvelope: null }; }

function accrueEndpoint(url) {
  const u = String(url || '').replace(/\/+$/, '');
  return /\/functions\/v1\/hr-accrue$/.test(u) ? u : u + '/functions/v1/hr-accrue';
}

export function newIntentKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* fall through */ }
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
export function isIntentKey(k) { return typeof k === 'string' && UUID_RE.test(k); }

/**
 * VALIDATE A RUNE ID BEFORE SENDING. Pure. The client refuses its own
 * unreadable request rather than costing a round trip — a mirror of the
 * server's parser, never an authority (the server re-checks the tag, the
 * ownership and the weapon slot).
 *
 * @returns { ok:true, rune } | { ok:false, why }
 */
export function validateRune(rune) {
  if (typeof rune !== 'string' || !ITEM_RE.test(rune)) return { ok: false, why: 'bad rune id' };
  return { ok: true, rune };
}

/* ── THE REQUEST, AS DATA ───────────────────────────────────────────────────
   PURE and exported so the suite asserts the LITERAL bytes on the wire. */
export function buildEnchantRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= MAX_SLOT ? o.slot : 0;
  const v = validateRune(o.rune);
  return {
    url: accrueEndpoint(o.url),
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        verb: ENCHANT_VERB,
        slot,
        intentId: String(o.intentId == null ? '' : o.intentId),
        enchant: { slot: ENCHANT_SLOT, rune: v.ok ? v.rune : '' },
      }),
    },
  };
}

/** Outcomes that mean WE WERE NOT ANSWERED — reuse the key after one. */
export const UNANSWERED_OUTCOMES = Object.freeze(['unreachable', 'timeout']);
export function isAnswered(outcome) { return UNANSWERED_OUTCOMES.indexOf(outcome) === -1; }

/* Refusal sentences, keyed on the server's machine code and nothing else —
   the same four the contract names, mirroring equip's five. */
export const ENCHANT_REFUSALS = Object.freeze({
  insufficient_item: 'The server says you do not have that rune.',
  wrong_slot: 'You have no weapon equipped to enchant.',
  unknown_item: "The server does not have that rune yet — it may be a build newer than the server's.",
  rate_limited: 'Slow down a moment — too many enchants.',
});
export function enchantRefusalMessage(code) {
  const k = String(code || '');
  if (Object.prototype.hasOwnProperty.call(ENCHANT_REFUSALS, k)) return ENCHANT_REFUSALS[k];
  return k ? `The server refused that enchant (${k}).` : 'The server refused that enchant.';
}

/** Classify an answer. Pure — status and body in, verdict out. */
export function classifyEnchantResponse(status, body) {
  if (status === 429) return { outcome: 'rate-limited', body };
  if (status === 401 || status === 403) return { outcome: 'not-signed-in', body };
  if (status >= 500) return { outcome: 'unavailable', body };
  if (status === 200 && body && body.ok === true) {
    return { outcome: body.replayed === true ? 'replayed' : 'enchanted', body };
  }
  if (status === 200) return { outcome: 'malformed', body };
  return { outcome: 'refused', error: (body && body.error) || null, body };
}

/** The envelope, constructed field by field — never a spread of the body.
    `state` carries the server-authored `enchant`, which the applier writes. */
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
 * SEND ONE ENCHANT GESTURE.
 *
 * @param rune  the rune item id to bind
 * @param o.key an idempotency key to REUSE (rule 1). Absent ⇒ a fresh one.
 * @returns a verdict, with `key` so the caller can reuse it.
 */
export async function sendEnchant(rune, o = {}) {
  if (!config) return { outcome: 'unconfigured', key: o.key || null };
  let token = null;
  try { token = typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { token = null; }
  if (!token) return { outcome: 'unconfigured', key: o.key || null };

  const v = validateRune(rune);
  if (!v.ok) return { outcome: 'undeliverable', reason: v.why, key: o.key || null };

  const key = isIntentKey(o.key) ? o.key : newIntentKey();
  const { url, init } = buildEnchantRequest({
    url: config.url, apiKey: config.apiKey, token,
    slot: Number.isInteger(o.slot) ? o.slot : (Number.isInteger(config.slot) ? config.slot : 0),
    intentId: key, rune: v.rune,
  });

  let ac = null; let timer = null;
  try { ac = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (e) { ac = null; }
  const init2 = ac ? { ...init, signal: ac.signal } : init;
  if (ac) timer = setTimeout(() => { try { ac.abort(); } catch (e) {} }, ENCHANT_TIMEOUT_MS);

  let res = null;
  try {
    res = await fetch(url, init2);
  } catch (e) {
    const aborted = !!(ac && ac.signal && ac.signal.aborted);
    if (timer) clearTimeout(timer);
    /* NOT ANSWERED ⇒ THE KEY COMES BACK so the caller reuses it (rule 1). */
    return { outcome: aborted ? 'timeout' : 'unreachable', key, reason: String((e && e.message) || e) };
  }
  if (timer) clearTimeout(timer);

  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  const verdict = { ...classifyEnchantResponse(res.status, body), status: res.status, key };

  /* THE ENVELOPE IS THE TRUTH WHETHER THE BIND LANDED OR NOT — the verb
     collects first, so a refusal can still carry applied payment. */
  const env = envelopeOf(body);
  if (env && typeof hooks.onEnvelope === 'function') {
    try { verdict.applied = !!hooks.onEnvelope(body, verdict); }
    catch (e) { console.warn('[enchant] envelope hook threw:', e && e.message); }
  }
  return verdict;
}

if (typeof window !== 'undefined') {
  window.HearthriseEnchant = {
    ENCHANT_VERB, ENCHANT_SLOT, UNANSWERED_OUTCOMES, ENCHANT_REFUSALS, enchantRefusalMessage,
    configureEnchant, getEnchantConfig, setEnchantHooks, getEnchantHooks, resetEnchant,
    validateRune, buildEnchantRequest, classifyEnchantResponse, envelopeOf,
    newIntentKey, isIntentKey, isAnswered, sendEnchant,
  };
}
