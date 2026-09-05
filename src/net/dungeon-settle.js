// ============================================================================
// src/net/dungeon-settle.js — THE DUNGEON RUN SETTLE, CLIENT SIDE.
//
// "I cleared the Crypt of Bones." — sent to the server, which consumes the entry
// key, rolls the loot from its own catalogue with the seeded PRNG, and credits
// the scrip. This client sends a NAME + a MODE + a clear fraction and reconciles
// whatever comes back. It authors NO reward.
//
// Contract: supabase/functions/hr-accrue/dungeon-settle.js and ./intents.js.
//
//   POST <SUPABASE_URL>/functions/v1/hr-accrue
//     {"verb":"dungeon_settle","slot":N,"intentId":"<uuid>",
//      "dungeon":{"id":"crypt_of_bones","mode":"auto","quality":1}}
//   → 200 {ok:true, verb:'dungeon_settle', state:{dungeon_scrip,…}, inventory:{…},
//          settled:{dungeon,mode,scrip,items,key_spent}|null, …env}
//     409 {ok:false, error:'insufficient_item'|'on_cooldown'|'daily_cap'|
//          'level_locked'|'version_conflict'|'unknown_dungeon'|'bad_mode'|…}
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// Before it, awardDungeonScrip / awardLoot (src/dungeons.js, src/dungeon-scavenger
// .js) minted scrip + loot into G CLIENT-ONLY. Under BLOB_RETIRED the reload
// rebuilt the bag from the server envelope, so the client-minted scrip vanished
// (the "dungeon scrip goes to 0" P1). This transport makes the settlement real
// server-side; the client renders the returned envelope.
//
// ── SHIPPED DORMANT (isDungeonSettleArmed) ──────────────────────────────────
// It sends NOTHING until the arm flips (post-apply + edge-deploy + increment 3;
// see ./dungeon-scrip-record.js). While dormant the completion paths mint locally
// exactly as today. There is no double-credit in either state: armed → send + no
// local mint; dormant → local mint + no send.
//
// ── IDEMPOTENCY (intent contract rule 1, shared with ./eat.js, ./gold.js) ────
// NOT ANSWERED (timeout, dead network, CORS) ⇒ REUSE THE KEY so the run cannot
// settle twice. ANSWERED (200 or a machine-code refusal) ⇒ a NEW key next time.
//
// PURE except for `fetch` and the injected hooks/config, so the suite drives the
// same bytes the browser runs. Node-importable.
// ============================================================================

import {
  isServerAccrualEnabled, resolveActiveSlot, accrueEndpoint, MAX_SLOT,
} from './accrue.js?v=504';
import { isDungeonSettleArmed, reconcileScrip } from './dungeon-scrip-record.js?v=504';

export const DUNGEON_SETTLE_VERB = 'dungeon_settle';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[a-z0-9_]{1,64}$/;
const MODES = ['auto', 'manual', 'scavenger'];
const SETTLE_TIMEOUT_MS = 15000;

let config = null;
let hooks = { onEnvelope: null, onOutcome: null };
let last = null;

/* The verb is dormant until the arm flips AND the master accrual switch is on —
   both, because sending a settle to a server that has not applied it yet is a
   wasted round trip and a confusing refusal. */
export function isDungeonSettleEnabled() {
  return isDungeonSettleArmed() && isServerAccrualEnabled();
}

export const DUNGEON_OUTCOMES = Object.freeze([
  'settled', 'replayed', 'refused', 'rate-limited', 'not-signed-in',
  'unavailable', 'malformed', 'unreachable', 'timeout', 'unconfigured',
  'switch-off', 'unsendable',
]);
export const UNANSWERED_OUTCOMES = Object.freeze(['unreachable', 'timeout']);
export function isAnswered(outcome) { return UNANSWERED_OUTCOMES.indexOf(outcome) === -1; }

export const DUNGEON_REFUSALS = Object.freeze({
  insufficient_item: 'The server says you have no key for that dungeon.',
  on_cooldown: 'That dungeon is on cooldown — try a manual run, or wait.',
  daily_cap: "You have earned the day's scrip from dungeons. Come back tomorrow.",
  level_locked: 'Your combat level is too low for that dungeon.',
  unknown_dungeon: "The server does not have that dungeon yet — it may be a newer build than the server's.",
  bad_mode: 'That run mode could not be read. Nothing was changed.',
  rate_limited: 'Slow down a moment — too many actions.',
  no_character: 'The server has no character in this slot yet.',
  version_conflict: 'Your state changed elsewhere. Try again.',
  intent_mismatch: 'That did not match the run the server recorded.',
});
export function dungeonRefusalMessage(code) {
  const k = String(code || '');
  if (Object.prototype.hasOwnProperty.call(DUNGEON_REFUSALS, k)) return DUNGEON_REFUSALS[k];
  return k ? `The server refused that run (${k}).` : 'The server refused that run.';
}

export function newIntentKey() {
  try {
    const c = (typeof crypto !== 'undefined') ? crypto : null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    if (c && typeof c.getRandomValues === 'function') {
      const b = c.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
    }
  } catch (e) { /* fall through */ }
  return null;
}
export function isIntentKey(k) { return typeof k === 'string' && UUID_RE.test(k); }

export function configureDungeonSettle(cfg) {
  if (!cfg || !cfg.url) { config = null; return null; }
  config = {
    url: String(cfg.url).replace(/\/+$/, ''),
    apiKey: cfg.apiKey || '',
    authToken: cfg.authToken || cfg.token || null,
    slot: Number.isInteger(cfg.slot) ? cfg.slot : null,
  };
  return getDungeonSettleConfig();
}
export function getDungeonSettleConfig() {
  if (!config) return null;
  return { url: config.url, slot: resolveActiveSlot(config.slot), pinnedSlot: config.slot,
    endpoint: accrueEndpoint(config.url) };
}
function tokenOf() {
  if (!config || !config.authToken) return null;
  try { return typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { return null; }
}
export function setDungeonSettleHooks(h) { hooks = { ...hooks, ...(h || {}) }; }
export function getDungeonSettleHooks() { return { ...hooks }; }
function fire(name, a, b) {
  const fn = hooks && hooks[name];
  if (typeof fn !== 'function') return null;
  try { return fn(a, b); }
  catch (e) { console.warn('[dungeon-settle] hook ' + name + ' threw:', e && e.message); return null; }
}

/* ── THE REQUEST, AS DATA — pure, so the suite asserts the LITERAL bytes ─────
   CONSTRUCTED field by field. There is no `...o` and there never will be: the
   field a future caller adds by accident is the field that turns a NAME into a
   VALUE. In particular there is no loot, no scrip, no key, no qty. `quality` is
   the ONE number and the server clamps it to [0,1]. */
export function buildDungeonSettleRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= MAX_SLOT ? o.slot : 0;
  const dungeon = { id: String(o.id == null ? '' : o.id), mode: String(o.mode == null ? '' : o.mode) };
  if (typeof o.quality === 'number' && Number.isFinite(o.quality)) dungeon.quality = o.quality;
  return {
    url: accrueEndpoint(o.url),
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        verb: DUNGEON_SETTLE_VERB,
        slot,
        intentId: String(o.intentId == null ? '' : o.intentId),
        dungeon,
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
  if (!b.inventory || typeof b.inventory !== 'object') return null;
  return {
    ok: true, version, now: b.now || null, state: b.state,
    skills: b.skills || {}, inventory: b.inventory,
    settled: (b.settled && typeof b.settled === 'object') ? b.settled : null,
  };
}

/** Classify an answer. Pure — status and body in, verdict out. */
export function classifyDungeonSettleResponse(status, body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (status === 200) {
    if (!b || b.ok !== true) return { outcome: 'malformed', body: b, reason: 'not_ok' };
    if (!envelopeOf(b)) return { outcome: 'malformed', body: b, reason: 'envelope_incomplete' };
    return { outcome: b.replayed === true ? 'replayed' : 'settled', body: b };
  }
  if (status === 401 || status === 403) return { outcome: 'not-signed-in', body: b };
  if (status === 429) return { outcome: 'rate-limited', body: b, reason: (b && b.error) || 'rate_limited' };
  if (status === 400 || status === 409) {
    return { outcome: 'refused', body: b, reason: (b && b.error) || 'refused', stage: (b && b.stage) || null };
  }
  if (status >= 500) return { outcome: 'unavailable', body: b, reason: (b && b.error) || 'server_error' };
  return { outcome: 'malformed', body: b, reason: 'http_' + status };
}

/**
 * RECONCILE G FROM A SETTLE ENVELOPE. DISPLAY prediction, reconciled to server
 * truth: the scrip balance is set from the envelope's authoritative
 * state.dungeon_scrip (never a client sum), and the run's loot is applied
 * additively to G.inventory for immediate display (the server already credited
 * player_inventory, which the envelope carries, so a reload re-hydrates it — this
 * is the render-now mirror). A replay reconciles state but adds no loot again.
 * A no-op while dormant. Returns { scrip, items } applied, or null.
 */
export function reconcileFromEnvelope(G, body) {
  if (!isDungeonSettleArmed() || !G || typeof G !== 'object') return null;
  const env = envelopeOf(body);
  if (!env) return null;
  const scrip = reconcileScrip(G, env.state);
  let items = null;
  if (body.replayed !== true && env.settled && env.settled.items && typeof env.settled.items === 'object') {
    items = env.settled.items;
    if (!G.inventory || typeof G.inventory !== 'object') G.inventory = {};
    for (const id of Object.keys(items)) {
      const q = Number(items[id]);
      if (Number.isFinite(q) && q > 0) G.inventory[id] = (Number(G.inventory[id]) || 0) + q;
    }
  }
  return { scrip, items };
}

function record(verdict) {
  last = { outcome: verdict.outcome, reason: verdict.reason || null, stage: verdict.stage || null,
    status: verdict.status || 0, at: Date.now(), key: verdict.key || null };
  fire('onOutcome', last);
  return verdict;
}
export function getDungeonSettleState() {
  return { enabled: isDungeonSettleEnabled(), armed: isDungeonSettleArmed(), configured: !!config, last };
}

/**
 * SEND ONE DUNGEON RUN AND RECONCILE.
 *
 * @param run  { id, mode, quality }
 * @param o.key an idempotency key to REUSE (rule 1). Absent ⇒ a fresh one.
 * @returns a verdict from DUNGEON_OUTCOMES, with `key` so the caller can reuse it
 *          on a NOT-ANSWERED outcome.
 */
export async function sendDungeonSettle(run, o = {}) {
  const r = run || {};
  const id = String(r.id == null ? '' : r.id);
  const mode = String(r.mode == null ? '' : r.mode);
  const quality = (typeof r.quality === 'number' && Number.isFinite(r.quality)) ? r.quality : undefined;

  if (!isDungeonSettleEnabled()) return record({ outcome: 'switch-off', key: o.key || null });
  if (!config) return record({ outcome: 'unconfigured', reason: 'no_endpoint', key: o.key || null });
  const token = tokenOf();
  if (!token) return record({ outcome: 'unconfigured', reason: 'no_token', key: o.key || null });
  if (!ID_RE.test(id)) return record({ outcome: 'unsendable', reason: 'bad_dungeon', key: o.key || null });
  if (MODES.indexOf(mode) === -1) return record({ outcome: 'unsendable', reason: 'bad_mode', key: o.key || null });

  const key = isIntentKey(o.key) ? o.key : newIntentKey();
  if (!isIntentKey(key)) return record({ outcome: 'unsendable', reason: 'no_intent_key', key: null });

  const { url, init } = buildDungeonSettleRequest({
    url: config.url, apiKey: config.apiKey, token,
    slot: resolveActiveSlot(config.slot), intentId: key, id, mode, quality,
  });

  let ac = null; let timer = null;
  try { ac = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (e) { ac = null; }
  const init2 = ac ? { ...init, signal: ac.signal } : init;
  if (ac) timer = setTimeout(() => { try { ac.abort(); } catch (e) {} }, SETTLE_TIMEOUT_MS);

  let res = null;
  try {
    res = await fetch(url, init2);
  } catch (e) {
    const aborted = !!(ac && ac.signal && ac.signal.aborted);
    if (timer) clearTimeout(timer);
    return record({ outcome: aborted ? 'timeout' : 'unreachable', reason: String((e && e.message) || e), key });
  }
  if (timer) clearTimeout(timer);

  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  const verdict = { ...classifyDungeonSettleResponse(res.status, body), status: res.status, key };

  /* THE ENVELOPE IS THE TRUTH WHETHER THE SETTLE LANDED OR NOT. A refused settle
     (version_conflict, on_cooldown, …) carries the server's current state, and
     applying it is what puts the optimistic local prediction back to server
     truth. */
  const env = envelopeOf(body);
  if (env && typeof hooks.onEnvelope === 'function') {
    try { verdict.applied = !!hooks.onEnvelope(body, verdict); }
    catch (e) { console.warn('[dungeon-settle] envelope hook threw:', e && e.message); }
  }
  return record(verdict);
}

/* ── THE QUARTERMASTER SPEND, CLIENT SIDE (dungeon-settlement.md §4, incr 3) ──
   Scrip OUT, an item IN — sent to hr_quartermaster_buy, which prices the offer
   from its own catalogue and debits/grants in one transaction. This client sends
   ONE offer id (`qm.<item>`) and reconciles the returned envelope; it authors no
   price and no item. Shares this module's config/token/hooks and the SAME arm
   (isDungeonSettleEnabled) — dormant, it sends nothing and the legacy client trade
   (src/net/item-ledger.js) still runs, so there is no gap. */
export const QM_BUY_VERB = 'quartermaster_buy';
const QM_OFFER_RE = /^[a-z0-9_]{1,40}(?:\.[a-z0-9_]{1,40}){1,3}$/;  // the Edge OFFER_ID_RE

/** The request, as data — pure, constructed field by field (no `...o`): the field
    a future caller adds by accident is the field that turns a NAME into a VALUE.
    There is no item, no price, no scrip amount — ONE offer id and the idempotency
    key. */
export function buildQuartermasterBuyRequest(opts) {
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
        verb: QM_BUY_VERB,
        slot,
        intentId: String(o.intentId == null ? '' : o.intentId),
        offer: String(o.offer == null ? '' : o.offer),
      }),
    },
  };
}

/** Reconcile G from a quartermaster_buy envelope: the scrip balance is set from
    the authoritative state.dungeon_scrip (the DEBIT), and the bought item is
    mirrored into G.inventory for immediate display (the server already credited
    player_inventory, which the envelope carries, so a reload re-hydrates it). A
    replay reconciles scrip but adds no item again. A no-op while dormant. */
export function reconcileQuartermasterFromEnvelope(G, body) {
  if (!isDungeonSettleArmed() || !G || typeof G !== 'object') return null;
  const env = envelopeOf(body);
  if (!env) return null;
  const scrip = reconcileScrip(G, env.state);
  let item = null;
  if (body.replayed !== true && body.bought && typeof body.bought === 'object' && body.bought.item) {
    item = String(body.bought.item);
    if (!G.inventory || typeof G.inventory !== 'object') G.inventory = {};
    G.inventory[item] = (Number(G.inventory[item]) || 0) + 1;
  }
  return { scrip, item };
}

/**
 * SEND ONE QUARTERMASTER PURCHASE. `offer` is an id (`qm.<item>`); the server
 * owns the price and the item. Same idempotency contract as sendDungeonSettle:
 * NOT ANSWERED ⇒ reuse the key; ANSWERED ⇒ a new key next time.
 */
export async function sendQuartermasterBuy(offer, o = {}) {
  const offerId = String(offer == null ? '' : offer);

  if (!isDungeonSettleEnabled()) return record({ outcome: 'switch-off', key: o.key || null });
  if (!config) return record({ outcome: 'unconfigured', reason: 'no_endpoint', key: o.key || null });
  const token = tokenOf();
  if (!token) return record({ outcome: 'unconfigured', reason: 'no_token', key: o.key || null });
  if (!QM_OFFER_RE.test(offerId)) return record({ outcome: 'unsendable', reason: 'bad_offer', key: o.key || null });

  const key = isIntentKey(o.key) ? o.key : newIntentKey();
  if (!isIntentKey(key)) return record({ outcome: 'unsendable', reason: 'no_intent_key', key: null });

  const { url, init } = buildQuartermasterBuyRequest({
    url: config.url, apiKey: config.apiKey, token,
    slot: resolveActiveSlot(config.slot), intentId: key, offer: offerId,
  });

  let ac = null; let timer = null;
  try { ac = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (e) { ac = null; }
  const init2 = ac ? { ...init, signal: ac.signal } : init;
  if (ac) timer = setTimeout(() => { try { ac.abort(); } catch (e) {} }, SETTLE_TIMEOUT_MS);

  let res = null;
  try {
    res = await fetch(url, init2);
  } catch (e) {
    const aborted = !!(ac && ac.signal && ac.signal.aborted);
    if (timer) clearTimeout(timer);
    return record({ outcome: aborted ? 'timeout' : 'unreachable', reason: String((e && e.message) || e), key });
  }
  if (timer) clearTimeout(timer);

  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  const verdict = { ...classifyDungeonSettleResponse(res.status, body), status: res.status, key };

  const env = envelopeOf(body);
  if (env && typeof hooks.onEnvelope === 'function') {
    try { verdict.applied = !!hooks.onEnvelope(body, verdict); }
    catch (e) { console.warn('[quartermaster-buy] envelope hook threw:', e && e.message); }
  }
  return record(verdict);
}

if (typeof window !== 'undefined') {
  window.HearthriseDungeonSettle = {
    DUNGEON_SETTLE_VERB, DUNGEON_OUTCOMES, UNANSWERED_OUTCOMES, DUNGEON_REFUSALS,
    dungeonRefusalMessage, configureDungeonSettle, getDungeonSettleConfig,
    setDungeonSettleHooks, getDungeonSettleHooks, buildDungeonSettleRequest,
    classifyDungeonSettleResponse, envelopeOf, reconcileFromEnvelope,
    newIntentKey, isIntentKey, isAnswered, isDungeonSettleEnabled, sendDungeonSettle,
    getDungeonSettleState,
    /* increment 3 — the Quartermaster spend transport */
    QM_BUY_VERB, buildQuartermasterBuyRequest, reconcileQuartermasterFromEnvelope,
    sendQuartermasterBuy,
  };
}
