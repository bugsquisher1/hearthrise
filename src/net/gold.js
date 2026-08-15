// ============================================================================
// src/net/gold.js — THE CLIENT HALF OF THE THREE ECONOMY VERBS.
//
//   shop_buy      gold  -> items, at the CATALOGUE price
//   vendor_sell   items -> gold,  at the CATALOGUE bid
//   claim_reward  a named claimable -> gold/gems, at the REGISTRY price
//
// The server halves are live and proven end to end (tests/gold-intents.mjs,
// tests/claim-intent.mjs, both against a real PostgreSQL with the real
// migration chain and the real postgres.js driver). THE CONTRACTS ARE NOT
// RESTATED HERE — they are the headers of supabase/functions/hr-accrue/
// {shop-buy,vendor-sell,claim-reward}.js, and where this file and those could
// disagree the comment says which line is being obeyed.
//
// Built DARK behind `localStorage['hr:serverAccrual'] === 'on'` — the SAME kill
// switch as accrual, activity, character and record, imported rather than
// re-read. Five switches would produce a client that spends against a server
// that never heard of the character.
//
// ════════════════════════════════════════════════════════════════════════════
// THE DOUBLE-PAY HAZARD, AND HOW THIS FILE MAKES IT UNSPELLABLE
// ════════════════════════════════════════════════════════════════════════════
// Security named this window before a line of it was written: *"the double-pay
// window opens the moment the client seam is wired."* The shape is simple and
// it is the only way this file can lose money:
//
//     claim() pays the player locally (`G.gold += rw.gold`)
//     …and then the server's receipt is ALSO added
//     ⇒ the player is paid twice for one claim.
//
// It is made unspellable rather than avoided, by ONE rule:
//
//     ⚠ THE SERVER'S ANSWER IS APPLIED **ABSOLUTELY**, NEVER ADDITIVELY.
//
// `applyEnvelopeState` writes `G.gold = Number(state.gold)` — the number the
// server's own row holds after the apply. There is no code path in this file,
// or reachable from it, that adds `granted.gold` or `receipt.gold` to anything.
// Those fields exist to be RENDERED ("you were paid 4,000") and are handed to
// the caller for exactly that.
//
// The local payment is therefore a PREDICTION and is modelled as one:
//
//   · `settle(G, amount, site)` is the only way a wired site touches gold. With
//     the switch OFF it is `G.gold += amount` and nothing else — byte-for-byte
//     today's behaviour. With the switch ON it ALSO records the amount in a
//     pending list, keyed to the call that is about to go out.
//   · When the envelope lands, `applyGoldEnvelope` writes the absolute value and
//     RETIRES that call's prediction. Any prediction still outstanding (a second
//     purchase in flight) is re-added on top, because the envelope was produced
//     before that one existed and cannot describe it.
//   · When the server refuses with NO envelope — the four codes refused on shape
//     or before any database work, so nothing was written — the prediction is
//     ROLLED BACK by exactly its own amount. That is not a guess: it is the
//     inverse of a local write whose server counterpart provably never happened.
//   · When we are NEVER ANSWERED (timeout, dead network), the prediction is left
//     STANDING and marked unresolved. The intent may have landed; snapping the
//     number either way would be the client authoring a value, which is the one
//     thing it may never do. The next accrue / hr_load settles it absolutely.
//
// The property that falls out, and the one the tests assert:
//
//     WITH THE SWITCH ON, THE NET GOLD MOVEMENT OF A WIRED GESTURE EQUALS THE
//     SERVER'S OWN NUMBER, EXACTLY ONCE, WHATEVER ORDER THE ANSWERS ARRIVE IN.
//
// ════════════════════════════════════════════════════════════════════════════
// WHAT THE CLIENT MAY SEND
// ════════════════════════════════════════════════════════════════════════════
// A verb, a key, a slot, and a NAME — an offer id, an item id, or a
// {kind,key} reward — plus a COUNT. Never a price, never a total, never a
// period. `supabase/functions/hr-accrue/request.js` refuses anything else, and
// this file never builds anything else: the body is CONSTRUCTED field by field,
// because a body assembled by spreading is a body a future field rides into.
//
// ════════════════════════════════════════════════════════════════════════════
// KNOWN LIMITATIONS — stated here because they are what a reviewer must weigh
// ════════════════════════════════════════════════════════════════════════════
// 1. ONLY GOLD IS PREDICTED. The item half of a gesture (addItem / removeItem)
//    is not modelled as a prediction and has no rollback. So a sale the server
//    refuses — a 429 in particular — reverses the gold and leaves the item
//    locally gone until the next envelope restores the inventory ABSOLUTELY.
//    Self-healing, never a permanent loss (the server never took the item), but
//    visibly inconsistent for the gap. Modelling item predictions is the next
//    increment and it is deliberately NOT in this one: it doubles the surface
//    and this commit is already the one that must be reviewed as a whole.
// 2. A PURCHASE TRIPS THE REPLACEMENT GATE ON FIRST USE. `describeReplacement`
//    reads a server balance LOWER than the local one as destructive, which is
//    exactly what a spend produces. Until the player acknowledges once (the
//    same single consent the away path uses), a purchase's envelope is refused
//    and the prediction stands. Correct — that gate exists because applying a
//    fresh server character over real local progress is permanent — but it
//    means the first switch-on purchase shows the sheet.
// 3. `vendor_sell` PRICES ONE ITEM ID PER CALL, so the two BULK gestures
//    (Sell Selected, the sell-junk sweep) have no server story and are DEFERRED
//    by name in src/net/gold-sites.js. Reported, not patched:
//    supabase/functions/** is held by other agents.
// 4. THE ACCRUAL PATH STILL DOES NOT RECONCILE GEMS. `applyEnvelopeState` never
//    learned to, because no away envelope carries any. This file does it for
//    the verbs (a claim pays gems); the accrue path is untouched and reported.
//
// DOM-free apart from the replacement sheet it delegates to accrue.js.
// Node-importable. No fetch seam — `fetch` resolves at call time, so a test's
// override IS the transport and the suite asserts the literal bytes.
// ============================================================================

import {
  isServerAccrualEnabled, resolveActiveSlot, accrueEndpoint, MAX_SLOT,
  applyEnvelopeState, describeReplacement, isReplacementAcknowledged,
  showReplacementSheet,
} from './accrue.js?v=351';
import { SHOP_OFFERS } from '../data/shops.js?v=351';
import { GOLD_SITE_LEDGER, isWiredSite } from './gold-sites.js?v=351';

export const SHOP_BUY_VERB = 'shop_buy';
export const VENDOR_SELL_VERB = 'vendor_sell';
export const CLAIM_REWARD_VERB = 'claim_reward';
export const GOLD_VERBS = Object.freeze([SHOP_BUY_VERB, VENDOR_SELL_VERB, CLAIM_REWARD_VERB]);

/** Mirrors `MAX_QTY` in supabase/functions/hr-accrue/request.js. A count above
 *  it is refused by the server with `bad_qty`; refusing it HERE means the
 *  gesture does not spend an intent key and a rate slot to be told so, and —
 *  more importantly — the caller learns that this gesture has no server story
 *  at that size, which is a fact the ledger records rather than a surprise. */
export const MAX_QTY = 1000;

/* Deliberately the accrual switch itself, not a copy of the key. */
export function isGoldIntentEnabled() { return isServerAccrualEnabled(); }

/* ══════════════════════════════════════════════════════════════════════════
   THE OFFER RESOLVER — an ITEM the shop sells → the OFFER the server prices.
   ══════════════════════════════════════════════════════════════════════════
   legacy.js's `buyShopItem(id, qty, cost)` is called from two shop tables with
   an ITEM id; the server names a PURCHASE (`equip.iron_sword`). The mapping is
   DERIVED from the generated catalogue rather than typed, so a new shop row is
   sellable through the server the moment `tools/gen-shops.mjs` runs — and a
   row that grants two items, or grants an item two offers already grant, is
   REFUSED rather than guessed at.

   ⚠ AMBIGUITY IS AN ABSENCE, NOT A COIN FLIP. If two offers grant the same
     single item, neither is resolvable: picking one would charge a price the
     player did not see. The guard in tests/gold-site-census.mjs asserts the map
     is non-empty and covers the tables `buyShopItem` actually serves. */
const offerByItem = (() => {
  const seen = Object.create(null);
  const out = Object.create(null);
  for (const o of SHOP_OFFERS) {
    if (!Array.isArray(o.grant) || o.grant.length !== 1) continue;
    const g = o.grant[0];
    if (!g || g.kind !== 'item') continue;
    const gold = Array.isArray(o.cost) && o.cost.length === 1 && o.cost[0].kind === 'currency'
      && o.cost[0].id === 'gold' ? Number(o.cost[0].amount) : null;
    if (!Number.isFinite(gold) || gold <= 0) continue;
    seen[g.id] = (seen[g.id] || 0) + 1;
    out[g.id] = { offer: o.id, gold, grants: Number(g.amount) || 0 };
  }
  for (const id of Object.keys(seen)) if (seen[id] > 1) delete out[id];
  return Object.freeze(out);
})();

/** The whole map, exported so a test reads what SHIPS rather than rebuilding it. */
export function shopOfferIndex() { return offerByItem; }

/**
 * WHICH OFFER IS THIS PURCHASE? Pure.
 *
 * @param itemId   what the client is adding to the bag
 * @param qty      how many of the ITEM the client is adding
 * @param goldCost what the client is about to charge itself
 * @returns {{offer, count}} | {error, detail}
 *
 * ⚠ IT CHECKS THE PRICE, AND REFUSES ON A MISMATCH. The server would charge its
 *   own number regardless — that is the whole design — so a divergence cannot
 *   cost the player money. It can cost them CONFIDENCE: a shop button that says
 *   500 and a balance that drops by 2,000 is indistinguishable from theft. The
 *   generated catalogue is guarded against drift by tools/gen-shops.mjs --check,
 *   so this firing at all means something is wrong that a player must not be the
 *   first to discover.
 */
export function resolvePurchase(itemId, qty, goldCost) {
  const row = Object.prototype.hasOwnProperty.call(offerByItem, String(itemId))
    ? offerByItem[String(itemId)] : null;
  if (!row) return { error: 'no_offer', detail: { item: String(itemId) } };
  const want = Number(qty) || 0;
  if (row.grants <= 0 || want % row.grants !== 0) {
    return { error: 'qty_not_a_whole_offer', detail: { item: itemId, want, per: row.grants } };
  }
  const count = want / row.grants;
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_QTY) {
    return { error: 'bad_qty', detail: { count } };
  }
  const expect = row.gold * count;
  if (Number(goldCost) !== expect) {
    return { error: 'price_mismatch', detail: { offer: row.offer, client: Number(goldCost), catalogue: expect } };
  }
  return { offer: row.offer, count };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PREDICTION LEDGER
   ══════════════════════════════════════════════════════════════════════════ */
let pending = [];          // [{ key, site, amount, at }]
let config = null;
let last = null;
let lastVersion = -1;      // monotonic, per §9.4's rule for hr_load vs hr-accrue

/** Bounded on purpose. A prediction list that can grow without limit is a leak
 *  with an economy attached; 32 outstanding value gestures is already far past
 *  anything a human produces, and the oldest is dropped LOUDLY. */
export const MAX_PENDING = 32;

export function goldPredictions() { return pending.map((p) => ({ ...p })); }
export function predictedGold() { return pending.reduce((s, p) => s + p.amount, 0); }
export function resetGold() { pending = []; last = null; lastVersion = -1; }

/**
 * THE ONLY WAY A WIRED SITE TOUCHES GOLD.
 *
 * @param G       the game state
 * @param amount  signed. Negative is a spend.
 * @param site    the ledger id (see src/net/gold-sites.js). Not decoration: it
 *                is what makes the site's status READABLE at runtime, and it is
 *                what tests/gold-site-census.mjs scans for.
 * @param key     the intent key this prediction belongs to, when one exists.
 * @returns {{applied, predicted, key}}
 *
 * SWITCH OFF ⇒ `G.gold += amount`, and NOTHING else happens. That is the whole
 * of the flag-off path and it is byte-for-byte what the call site used to do
 * inline.
 */
export function settle(G, amount, site, key) {
  const amt = Number(amount) || 0;
  if (!G || typeof G !== 'object') return { applied: 0, predicted: false, key: null };
  G.gold = (Number(G.gold) || 0) + amt;
  if (!isGoldIntentEnabled()) return { applied: amt, predicted: false, key: null };
  /* A site with no server verb is still client-authored under the switch — that
     is exactly what its `deferred` row in the ledger says, and recording a
     prediction that nothing will ever settle would leave a phantom on the books
     forever. Declared rather than silent. */
  if (!isWiredSite(site) || !key) return { applied: amt, predicted: false, key: null };
  if (pending.length >= MAX_PENDING) {
    const dropped = pending.shift();
    console.warn('[gold] prediction backlog full — dropping the oldest ('
      + dropped.site + ', ' + dropped.amount + '). The next envelope is absolute, so this costs '
      + 'display accuracy for a moment and nothing else.');
  }
  pending.push({ key, site, amount: amt, at: Date.now() });
  return { applied: amt, predicted: true, key };
}

/** Retire one call's prediction. Returns the amount retired, or 0. */
function retire(key) {
  const i = pending.findIndex((p) => p.key === key);
  if (i === -1) return 0;
  const [p] = pending.splice(i, 1);
  return p.amount;
}

/**
 * ROLL BACK a prediction whose server counterpart provably never happened.
 * Used ONLY for a refusal that carries no envelope — those codes are refused on
 * shape or before any database work, so there is nothing on the server to
 * disagree with. Any other case reconciles to the envelope instead.
 */
/**
 * DROP a prediction WITHOUT reversing it. One caller: the kill switch going off
 * between the local payment and the send. With the switch off the local payment
 * IS the payment, so reversing it would take money the player legitimately has —
 * but leaving the entry on the books would offset every future envelope.
 */
export function dropPrediction(key) {
  const i = pending.findIndex((p) => p.key === key);
  if (i === -1) return 0;
  const [p] = pending.splice(i, 1);
  return p.amount;
}

export function rollbackPrediction(G, key) {
  const i = pending.findIndex((p) => p.key === key);
  if (i === -1) return 0;
  const [p] = pending.splice(i, 1);
  if (G && typeof G === 'object') G.gold = (Number(G.gold) || 0) - p.amount;
  return p.amount;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE ANSWER
   ══════════════════════════════════════════════════════════════════════════ */

/** Same construction rule as activity.js's: field by field, and the SHAPE is
 *  what decides whether an answer carries state — never a client-side copy of
 *  the server's list of stateless refusals, which would be a second registry
 *  that drifts in silence. */
export function envelopeOf(body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (!b) return null;
  const version = Number(b.version);
  if (!Number.isFinite(version)) return null;
  if (!b.state || typeof b.state !== 'object') return null;
  if (!b.skills || typeof b.skills !== 'object') return null;
  if (!b.inventory || typeof b.inventory !== 'object') return null;
  return {
    ok: true, version, now: b.now || null, state: b.state,
    skills: b.skills, inventory: b.inventory,
    equipment: (b.equipment && typeof b.equipment === 'object') ? b.equipment : null,
  };
}

/** THE RECEIPT, OR NULL — for RENDERING only. `granted` (claim_reward) and
 *  `receipt` (shop_buy / vendor_sell) are the two spellings the two server
 *  files ship; both are read here and neither is ever added to a balance. */
export function receiptOf(body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (!b) return null;
  const r = b.granted || b.receipt;
  return (r && typeof r === 'object') ? r : null;
}

export const GOLD_OUTCOMES = Object.freeze([
  'applied',        // 200 ok:true — the verb landed, the envelope is the truth
  'replayed',       // 200 ok:true replayed:true — this exact intent already landed
  'refused',        // 4xx/409 with a machine code; may or may not carry an envelope
  'rate-limited',   // 429
  'not-signed-in',  // 401/403
  'unavailable',    // 5xx
  'malformed',      // a 200 that is not an envelope
  'unreachable',    // no answer at all
  'timeout',        // aborted — also no answer
  'unconfigured',   // no endpoint / no token on this device
  'switch-off',     // the kill switch is off; nothing was sent
  'unsendable',     // the client refused its own request before sending it
]);

export function classifyGoldResponse(status, body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (status === 200) {
    if (!b || b.ok !== true) return { outcome: 'malformed', body: b, reason: 'not_ok' };
    if (!envelopeOf(b)) return { outcome: 'malformed', body: b, reason: 'envelope_incomplete' };
    return { outcome: b.replayed === true ? 'replayed' : 'applied', body: b };
  }
  if (status === 401 || status === 403) return { outcome: 'not-signed-in', body: b };
  if (status === 429) return { outcome: 'rate-limited', body: b, reason: (b && b.error) || 'rate_limited' };
  if (status === 400 || status === 409) {
    return { outcome: 'refused', body: b, reason: (b && b.error) || 'refused',
      stage: (b && b.stage) || null };
  }
  if (status >= 500) return { outcome: 'unavailable', body: b, reason: (b && b.error) || 'server_error' };
  return { outcome: 'malformed', body: b, reason: 'http_' + status };
}

export const UNANSWERED_OUTCOMES = Object.freeze(['unreachable', 'timeout']);
export function isAnswered(outcome) { return UNANSWERED_OUTCOMES.indexOf(outcome) === -1; }

/**
 * APPLY AN ANSWER'S ENVELOPE. The ONLY place this module writes a game value
 * from the server, and the place the either/or property lives.
 *
 * @param ownKey the intent key of the call this envelope answers. Its
 *        prediction is RETIRED; every other outstanding prediction is re-added
 *        on top, because the server produced this envelope before those
 *        gestures existed and it cannot describe them.
 */
export function applyGoldEnvelope(G, body, ownKey) {
  const env = envelopeOf(body);
  if (!G || typeof G !== 'object' || !env) return null;

  /* §9.4's monotonic rule, applied to the verbs instead of to hr_load. Two
     calls are in flight by design; both answer truthfully, and the slower
     answer is the OLDER one. Applying it would put a balance back to before a
     spend that has already been journalled. */
  if (env.version < lastVersion) {
    return { stale: true, version: env.version, current: lastVersion };
  }

  const loss = describeReplacement(G, env);
  if (loss.destructive && !isReplacementAcknowledged()) {
    console.warn('[gold] REFUSING to overwrite local progress with the server character '
      + 'until the player confirms — would lose ' + loss.gold + ' gold, ' + loss.skillXp
      + ' skill XP and ' + loss.items + ' item(s). This is permanent and there is no merge.');
    showReplacementSheet(loss, G, env, (g, e) => applyGoldEnvelope(g, { ...body, ...e }, ownKey));
    return null;
  }

  const written = applyEnvelopeState(G, env);     // ABSOLUTE. Never additive.
  /* ⚠ GEMS, RECONCILED HERE AND NOT IN accrue.js — and this is the one place
     the double-pay hazard is REAL rather than structural.
     `applyEnvelopeState` writes gold, hp, skills and inventory; it does not
     write gems, because the away path it was built for never pays any. A CLAIM
     does (`claim-reward.js` puts `gems` in the delta and hr_apply clamps it at
     the 5,000/day ceiling), so leaving gems unreconciled would make the gem half
     of a daily reward the ONE number a wired gesture pays locally and never
     checks. Absolute, exactly like gold.
     NOT moved into applyEnvelopeState: that function is shared with the accrual
     path, and widening it would change what an away envelope does to a field no
     away envelope has ever carried. That the ACCRUAL path still ignores gems is
     a pre-existing gap, reported rather than silently patched from here. */
  if (Number.isFinite(Number(env.state.gems))) {
    G.gems = Number(env.state.gems);
    written.gems = G.gems;
  }
  lastVersion = env.version;
  const retired = retire(ownKey);
  /* Outstanding predictions belong to gestures this envelope predates. They are
     display-only and each is re-added exactly once, so the invariant holds:
     G.gold === server gold + sum(outstanding predictions). */
  let carried = 0;
  for (const p of pending) { G.gold = (Number(G.gold) || 0) + p.amount; carried += p.amount; }

  written.envelope = env;
  written.retired = retired;
  written.carried = carried;
  written.receipt = receiptOf(body);
  G._serverAccrual = {
    version: env.version,
    accruedTo: env.state.accrued_to || null,
    serverNow: env.now || null,
    at: Date.now(),
    via: (body && body.verb) || 'gold',
  };
  return written;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE REQUEST, AS DATA — pure, so the suite asserts the LITERAL bytes.
   ══════════════════════════════════════════════════════════════════════════ */
export const OFFER_ID_RE = /^[a-z0-9_]{1,32}\.[a-z0-9_]{1,64}$/;
export const ITEM_ID_RE = /^[a-z0-9_]{1,64}$/;
export const REWARD_KEY_RE = /^[a-z0-9_]{1,32}$/;

export function buildGoldRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= MAX_SLOT ? o.slot : 0;
  const body = { verb: o.verb, slot, intentId: String(o.intentId == null ? '' : o.intentId) };
  /* CONSTRUCTED, one branch per verb. There is no `...o` anywhere in this file
     and there never will be: the field a future caller adds by accident is the
     field that turns a NAME into a VALUE. */
  if (o.verb === SHOP_BUY_VERB) { body.offer = String(o.offer); body.qty = Number(o.qty); }
  else if (o.verb === VENDOR_SELL_VERB) { body.item = String(o.item); body.qty = Number(o.qty); }
  else if (o.verb === CLAIM_REWARD_VERB) {
    body.reward = { kind: String(o.rewardKind), key: String(o.rewardKey) };
  }
  return { url: accrueEndpoint(o.url), init: { method: 'POST', headers, body: JSON.stringify(body) } };
}

/** THE IDEMPOTENCY KEY — the same construction as activity.js's, for the same
 *  reason: a Math.random() key is one two devices can collide on, and a
 *  collision here means one player's purchase answering another's. */
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
  } catch (e) {}
  return null;
}
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isIntentKey(k) { return typeof k === 'string' && UUID_RE.test(k); }

/* ── TRANSPORT ────────────────────────────────────────────────────────────── */
export const GOLD_TIMEOUT_MS = 15000;

export function configureGold(cfg) {
  if (!cfg || !cfg.url) { config = null; return null; }
  config = {
    url: String(cfg.url).replace(/\/+$/, ''),
    apiKey: cfg.apiKey || '',
    authToken: cfg.authToken || null,
    slot: Number.isInteger(cfg.slot) ? cfg.slot : null,
  };
  return getGoldConfig();
}
export function getGoldConfig() {
  if (!config) return null;
  return { url: config.url, slot: resolveActiveSlot(config.slot), pinnedSlot: config.slot,
    endpoint: accrueEndpoint(config.url) };
}
function tokenOf() {
  if (!config || !config.authToken) return null;
  try { return typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { return null; }
}

let hooks = { onEnvelope: null, onOutcome: null };
export function setGoldHooks(h) { hooks = { ...hooks, ...(h || {}) }; }
function fire(name, a, b) {
  const fn = hooks && hooks[name];
  if (typeof fn !== 'function') return null;
  try { return fn(a, b); }
  catch (e) { console.warn('[gold] hook ' + name + ' threw:', e && e.message); return null; }
}

export function getGoldState() {
  return {
    enabled: isGoldIntentEnabled(), configured: !!config,
    pending: goldPredictions(), predicted: predictedGold(), version: lastVersion, last,
  };
}

/**
 * NOTHING LEFT THE CLIENT — and the prediction MUST NOT survive it.
 *
 * ⚠ FOUND BY B354-7, WHICH IS WHY IT IS WRITTEN DOWN HERE. The first revision
 *   just recorded an outcome. A purchase refused locally for `price_mismatch`
 *   had already called `settle`, so its prediction stayed outstanding — and
 *   `applyGoldEnvelope` RE-ADDS every outstanding prediction on top of each
 *   arriving envelope, by design, for gestures still in flight. An orphan is
 *   therefore not a one-off display glitch: it is a PERMANENT offset applied to
 *   every future server answer for the rest of the session. The test caught it
 *   as "the sale left gold at 777770 instead of 777777" — seven gold, from a
 *   refusal seven calls earlier.
 *
 * REVERSED, not merely dropped, because nothing was sent: there is no server
 * effect for the local write to be a prediction OF. The one exception is the
 * kill switch going off between the payment and the send — with the switch off
 * the local payment is the real payment, so that one is dropped and kept.
 */
function inert(outcome, verb, reason, detail, key) {
  if (key) {
    if (outcome === 'switch-off') dropPrediction(key);
    else fire('onRollback', key, { outcome, verb, reason });
  }
  last = { outcome, verb, reason: reason || null, detail: detail || null, at: Date.now(), key: key || null };
  fire('onOutcome', last);
  return { outcome, verb, reason: reason || null, detail: detail || null, sent: false, key: key || null };
}

/**
 * SEND ONE VALUE INTENT AND RECONCILE.
 *
 * @param req  what buildGoldRequest needs, minus the transport bits
 * @param key  the intent key, ALREADY used by `settle` if the caller predicted
 *
 * ONE ATTEMPT, NO AUTOMATIC RETRY. Deliberate, and narrower than activity.js:
 * a rejected key stays rejected for up to 25 hours (hr_apply records the
 * DECISION), so retrying a refusal cannot succeed; and an UNANSWERED value
 * transfer is the one case where a client must not decide anything on its own —
 * the next envelope settles it. `version_conflict` is the single code that
 * would be safe to retry and it is left to the caller's next gesture, because
 * an automatic retry of a purchase is a purchase the player did not make twice.
 */
export async function sendGoldIntent(req, key) {
  const verb = req && req.verb;
  if (!isGoldIntentEnabled()) return inert('switch-off', verb, null, null, key);
  if (!config) return inert('unconfigured', verb, 'no_endpoint', null, key);
  const token = tokenOf();
  if (!token) return inert('unconfigured', verb, 'no_token', null, key);
  if (!isIntentKey(key)) return inert('unsendable', verb, 'no_intent_key', null, key);

  const slot = resolveActiveSlot(config.slot);
  const { url, init } = buildGoldRequest({
    ...req, url: config.url, apiKey: config.apiKey, token, slot, intentId: key,
  });

  let ac = null; let timer = null;
  try { ac = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (e) { ac = null; }
  const opts = ac ? { ...init, signal: ac.signal } : init;
  if (ac) timer = setTimeout(() => { try { ac.abort(); } catch (e) {} }, GOLD_TIMEOUT_MS);

  let res = null;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    const aborted = !!(ac && ac.signal && ac.signal.aborted);
    if (timer) clearTimeout(timer);
    /* NEVER ANSWERED. The prediction STANDS — see the header. */
    return settleVerdict({ outcome: aborted ? 'timeout' : 'unreachable',
      reason: String((e && e.message) || e) }, verb, key);
  }
  if (timer) clearTimeout(timer);
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  return settleVerdict({ ...classifyGoldResponse(res.status, body), status: res.status }, verb, key);
}

function settleVerdict(verdict, verb, key) {
  const body = verdict.body || null;
  const env = envelopeOf(body);
  const applied = { envelope: false, rolledBack: 0, unresolved: false };

  if (env) {
    const wrote = fire('onEnvelope', body, { ...verdict, verb, key });
    applied.envelope = !!wrote;
    /* THE HOOK IS THE APPLIER. If nothing is hooked — a Node test, a boot where
       legacy.js has not published G yet — the prediction is left alone rather
       than retired: retiring it here would tell the ledger a server number
       landed when none did. */
  } else if (isAnswered(verdict.outcome)) {
    /* ANSWERED, REFUSED, NO ENVELOPE ⇒ nothing was written server-side. The
       local prediction is the only thing that moved, so it is undone exactly. */
    applied.rolledBack = fire('onRollback', key, { ...verdict, verb }) || 0;
  } else {
    applied.unresolved = true;
  }

  last = { outcome: verdict.outcome, verb, reason: verdict.reason || null,
    stage: verdict.stage || null, status: verdict.status || 0, at: Date.now(), key, applied,
    receipt: receiptOf(body) };
  fire('onOutcome', last);
  return { ...verdict, verb, key, applied };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE THREE GESTURES. Each returns a promise the caller does NOT await.
   ══════════════════════════════════════════════════════════════════════════ */

/** A shop purchase. `itemId`/`qty`/`goldCost` are what the CLIENT is doing;
 *  the offer and the count are derived, and a mismatch refuses locally. */
export function buyShop(itemId, qty, goldCost, key) {
  const r = resolvePurchase(itemId, qty, goldCost);
  if (r.error) return Promise.resolve(inert('unsendable', SHOP_BUY_VERB, r.error, r.detail, key));
  return sendGoldIntent({ verb: SHOP_BUY_VERB, offer: r.offer, qty: r.count }, key);
}

export function sellItem(itemId, qty, key) {
  const id = String(itemId == null ? '' : itemId);
  const n = Number(qty);
  if (!ITEM_ID_RE.test(id)) {
    return Promise.resolve(inert('unsendable', VENDOR_SELL_VERB, 'bad_item', { item: id }, key));
  }
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_QTY) {
    /* ⚠ A CONTRACT GAP, NAMED RATHER THAN PAPERED OVER. `vendor_sell` prices ONE
       item id per call and bounds the count at MAX_QTY; a 5,000-log stack has no
       server story today. Refusing locally means the gesture is honest about
       that instead of burning a rate slot to be told `bad_qty`. */
    return Promise.resolve(inert('unsendable', VENDOR_SELL_VERB, 'qty_out_of_range',
      { qty: n, max: MAX_QTY }, key));
  }
  return sendGoldIntent({ verb: VENDOR_SELL_VERB, item: id, qty: n }, key);
}

export function claimReward(kind, rkey, key) {
  const k = String(kind == null ? '' : kind);
  const v = String(rkey == null ? '' : rkey);
  if (!REWARD_KEY_RE.test(k) || !REWARD_KEY_RE.test(v)) {
    return Promise.resolve(inert('unsendable', CLAIM_REWARD_VERB, 'bad_reward', { kind: k, key: v }, key));
  }
  return sendGoldIntent({ verb: CLAIM_REWARD_VERB, rewardKind: k, rewardKey: v }, key);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE BROWSER FACE — one object, so legacy.js (a classic script that cannot
   import ESM) reaches all of it through one name.
   ══════════════════════════════════════════════════════════════════════════ */
if (typeof window !== 'undefined') {
  /* THE DEFAULT WIRING: the envelope applier and the rollback are hooked HERE,
     against `window.G`, so a call site does not have to know either exists. A
     test replaces them with setGoldHooks. */
  setGoldHooks({
    onEnvelope: (body, v) => applyGoldEnvelope(window.G, body, v && v.key),
    onRollback: (key) => rollbackPrediction(window.G, key),
  });

  window.HearthriseGold = {
    GOLD_VERBS, SHOP_BUY_VERB, VENDOR_SELL_VERB, CLAIM_REWARD_VERB, GOLD_OUTCOMES,
    MAX_QTY, MAX_PENDING, GOLD_TIMEOUT_MS,
    isGoldIntentEnabled, settle, rollbackPrediction, goldPredictions, predictedGold,
    envelopeOf, receiptOf, classifyGoldResponse, dropPrediction, isAnswered, applyGoldEnvelope,
    buildGoldRequest, newIntentKey, isIntentKey, resolvePurchase, shopOfferIndex,
    configureGold, getGoldConfig, setGoldHooks, getGoldState, resetGold,
    buyShop, sellItem, claimReward, sendGoldIntent,
    LEDGER: GOLD_SITE_LEDGER,
  };
}
