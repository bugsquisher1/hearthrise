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

import { markEquipAuthorityLive, isServerAccrualEnabled } from './accrue.js?v=365';

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

/**
 * Configure the transport. ⚠ THIS IS ALSO WHAT ARMS THE ENVELOPE FLIP, and the
 * coupling is deliberate rather than incidental: an endpoint plus a token
 * source is exactly the condition "this client can tell the server about an
 * equip", which is exactly the precondition for believing the server's bag.
 * Configuring with no url DISARMS, so a torn-down client falls back to merge
 * rather than to a stale absolute.
 */
export function configureEquip(cfg) {
  config = cfg && cfg.url ? { ...cfg } : null;
  /* ⚠ `gestureWired` IS A SEPARATE, EXPLICIT ASSERTION AND IT IS NOT PEDANTRY.
     A configured transport means "this client CAN tell the server about an
     equip". The flip's real precondition is "this client DOES" — i.e. the
     player's equip gesture in the game loop actually routes here instead of
     mutating `G.equipment` locally. Those are different facts, and arming on
     the first one would produce exactly the dangerous state: a client that
     believes the server's bag outright while still equipping locally, so every
     settle assigns the worn copy back in. That is the b362 dupe at settle
     cadence.

     So the caller that OWNS the gesture states it, once, by name. Absent, the
     transport is fully usable and every envelope keeps merge semantics — which
     is exactly what should happen while the gesture is half-wired. */
  markEquipAuthorityLive(!!config && cfg.gestureWired === true);
  return config;
}
export function getEquipConfig() { return config; }
export function setEquipHooks(h) { hooks = { ...hooks, ...(h || {}) }; }
export function resetEquip() { config = null; hooks = { onEnvelope: null, pointer: null }; markEquipAuthorityLive(false); }

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

/** Outcomes that mean WE WERE NOT ANSWERED. The key must be REUSED after one.
    An allowlist of the unanswered, not of the answered: a new outcome added
    without a decision lands on the "we were answered" side, which is the side
    that mints a fresh key — and a fresh key on an unanswered call is how one
    swap applies twice. */
export const UNANSWERED_OUTCOMES = Object.freeze(['unreachable', 'timeout']);
export function isAnswered(outcome) { return UNANSWERED_OUTCOMES.indexOf(outcome) === -1; }

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
  if (!isServerAccrualEnabled()) return { outcome: 'switch-off', key: o.key || null };
  if (!config) return { outcome: 'unconfigured', key: o.key || null };
  const token = typeof config.token === 'function' ? config.token() : config.token;
  if (!token) return { outcome: 'unconfigured', key: o.key || null };

  const v = validateEquipOps(ops);
  if (!v.ok) return { outcome: 'undeliverable', reason: v.why, key: o.key || null };

  const key = isIntentKey(o.key) ? o.key : newIntentKey();
  const { url, init } = buildEquipRequest({
    url: config.url, apiKey: config.apiKey, token,
    slot: Number.isInteger(config.slot) ? config.slot : 0,
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
    /* NOT ANSWERED ⇒ THE KEY COMES BACK so the caller reuses it. */
    return { outcome: aborted ? 'timeout' : 'unreachable', key, reason: String((e && e.message) || e) };
  }
  if (timer) clearTimeout(timer);

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
  }
  return verdict;
}

if (typeof window !== 'undefined') {
  window.HearthriseEquip = {
    EQUIP_VERB, MAX_EQUIP_OPS, EQUIP_OUTCOMES, UNANSWERED_OUTCOMES,
    configureEquip, getEquipConfig, setEquipHooks, resetEquip,
    validateEquipOps, buildEquipRequest, classifyEquipResponse, envelopeOf,
    newIntentKey, isIntentKey, isAnswered, sendEquip,
  };
}
