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
// 4. ~~THE ACCRUAL PATH DOES NOT RECONCILE GEMS.~~ CLOSED. `reconcilePredictions`
//    is registered into `applyEnvelopeState`, so gems are now written absolutely
//    by EVERY envelope — away, activity switch and gold verb alike.
// 5. AN ABANDONED PREDICTION SURVIVES UNTIL THE NEXT ENVELOPE. That is the
//    design (the envelope is what makes the answer knowable), but it means a
//    player who goes offline mid-gesture and never receives another envelope
//    keeps a locally-optimistic number until they do. It cannot become
//    permanent — the entry is not carried, so the first envelope drops it — and
//    it is never uploaded as authority once `gold` joins SERVER_OF_RECORD.
// 6. THE CARRY BOUND IS TIME-BASED (`PREDICTION_CARRY_MS`), so a transport that
//    hangs longer than 30s has its prediction dropped at the next envelope even
//    if it later answers. The late answer's envelope is absolute, so the outcome
//    is correct; the display simply stops being optimistic sooner.
//
// DOM-free apart from the replacement sheet it delegates to accrue.js.
// Node-importable. No fetch seam — `fetch` resolves at call time, so a test's
// override IS the transport and the suite asserts the literal bytes.
// ============================================================================

import {
  isServerAccrualEnabled, resolveActiveSlot, accrueEndpoint, MAX_SLOT,
  applyEnvelopeState, describeReplacement, isReplacementAcknowledged,
  showReplacementSheet, registerPredictionSeam, isReconcilePending,
} from './accrue.js?v=483';
import { SHOP_OFFERS } from '../data/shops.js?v=483';
import { GOLD_SITE_LEDGER, isWiredSite } from './gold-sites.js?v=483';

export const SHOP_BUY_VERB = 'shop_buy';
export const VENDOR_SELL_VERB = 'vendor_sell';
export const CLAIM_REWARD_VERB = 'claim_reward';
/* ── unlock_buy — GOLD OUT, A PERMANENT RUNG IN. ─────────────────────────────
   The mirror of shop_buy on the buy side and its OPPOSITE on the wire: shop_buy
   sends an offer AND a qty, unlock_buy sends an OFFER ID AND NOTHING ELSE. No
   price, no rung, no count — hr_unlock_buy reads price/rung/prereqs off
   public.hr_unlock_offers under the per-character lock and merges the rung as
   GREATEST(existing, granted), so a re-buy cannot downgrade a ladder. The two
   sellable namespaces are `property` and `room` (unlock-catalogue.js
   SELLABLE_NAMESPACES); worker/plot/theme/trait/companion are refused by that
   catalogue's design and are NOT wired here. */
export const UNLOCK_BUY_VERB = 'unlock_buy';
/* ── b355 — THE MARKET VERBS. THE FIRST VALUE THAT LEAVES THIS PLAYER AND
   ARRIVES ON ANOTHER'S ROW. ─────────────────────────────────────────────────
   They live in THIS module rather than in a `src/net/market.js` of their own,
   and that is a decision with a reason: the prediction ledger is what makes a
   value gesture safe (F1 — an orphaned prediction is a permanent additive
   offset), there must be exactly ONE of it, and a second transport module would
   either import this one's internals or grow a second ledger. The market's
   gestures are gold gestures; they belong where the gold accounting is.

   ⚠ AND THE HAZARD IS ONE STEP WORSE HERE THAN FOR shop_buy. A refused NPC
     purchase costs the player a wasted tap. A market gesture that is locally
     predicted and server-refused leaves the OTHER player's side untouched —
     the counterparty ledger is server-side already — so the only thing that can
     ever disagree is this client's own display, and the only way that becomes
     permanent is an unretired prediction. Every market path below therefore
     terminates its prediction exactly as the three gold verbs do, through the
     same `settleVerdict` seam, and never through a second one. */
export const MARKET_LIST_VERB = 'market_list';
export const MARKET_CANCEL_VERB = 'market_cancel';
export const MARKET_BUY_VERB = 'market_buy';
export const MARKET_VERBS = Object.freeze(
  [MARKET_LIST_VERB, MARKET_CANCEL_VERB, MARKET_BUY_VERB]);
export const GOLD_VERBS = Object.freeze([SHOP_BUY_VERB, VENDOR_SELL_VERB, CLAIM_REWARD_VERB,
  UNLOCK_BUY_VERB, ...MARKET_VERBS]);

/** Mirrors `MAX_QTY` in supabase/functions/hr-accrue/request.js. A count above
 *  it is refused by the server with `bad_qty`; refusing it HERE means the
 *  gesture does not spend an intent key and a rate slot to be told so, and —
 *  more importantly — the caller learns that this gesture has no server story
 *  at that size, which is a fact the ledger records rather than a surprise. */
export const MAX_QTY = 1000;

/** Mirrors `MAX_ASK` in supabase/functions/hr-accrue/request.js, which in turn
 *  mirrors the `ask_each` CHECK constraint. Refused HERE for the same reason
 *  MAX_QTY is: a price the database would reject is a wasted intent key and a
 *  wasted rate slot, and — more to the point — a mistyped price is the one
 *  input error in this whole surface that a player would rather be told about
 *  before it becomes a public listing. */
export const MAX_ASK = 1000000000;

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
   ══════════════════════════════════════════════════════════════════════════

   ⚠ THE F1 FINDING — READ THIS BEFORE CHANGING ANYTHING BELOW.

   The first revision's envelope arithmetic was right and its LIFECYCLE was not.
   `reconcile` re-adds every OUTSTANDING prediction on top of every arriving
   envelope — correct, because an envelope produced before a gesture existed
   cannot describe it — but nothing ever guaranteed a prediction stopped being
   outstanding. Security's probe: 32 unanswered sells, then any later envelope,
   and gold reads 32,000,000 against a server saying 0 — for the rest of the
   session, surviving every subsequent envelope. An orphan is not a display
   glitch; it is a PERMANENT ADDITIVE OFFSET, which is the double-pay this
   module exists to make unspellable, arriving through the lifecycle instead of
   through the arithmetic.

   So a prediction now has exactly two states and both terminate:

     INFLIGHT   a call is outstanding for it. Carried onto envelopes that
                predate it, because it may still land.
     ABANDONED  the call ended without an envelope for it (unanswered, 5xx,
                malformed, gate-refused, stale). NOT carried. DROPPED by the
                first envelope that arrives, which is absolute and already
                states whatever really happened.

   Every terminal path calls exactly one of `retire` / `rollbackPrediction` /
   `abandonPrediction` / `dropPrediction`, and `reconcile` sweeps the rest. The
   AGE BOUND below is the belt to that braces: a call that never settles at all
   (no AbortController, a hung transport) leaves an INFLIGHT entry nobody can
   abandon, so an entry older than the bound is treated as abandoned regardless.
   Termination must not depend on anybody remembering to call something.
   ══════════════════════════════════════════════════════════════════════════ */

/** [{ key, site, delta:{gold,gems}, at, inflight }] */
let pending = [];
let config = null;
let last = null;
let lastVersion = -1;      // monotonic, per §9.4's rule for hr_load vs hr-accrue

/** Bounded on purpose. A prediction list that can grow without limit is a leak
 *  with an economy attached; 32 outstanding value gestures is already far past
 *  anything a human produces, and the oldest is dropped LOUDLY. */
export const MAX_PENDING = 32;

/** How long an INFLIGHT prediction may stay carried without an answer. Twice
 *  the request timeout: a call that has not settled by then is not in flight in
 *  any sense a human would recognise, and the only way this bound is reached is
 *  a transport that never called back — precisely the case no `finally` can
 *  clean up. */
export const PREDICTION_CARRY_MS = 2 * 15000;

/** The fields a prediction may move. Both are absolute in the envelope, so both
 *  can be predicted; anything else has no absolute counterpart and must not be. */
export const PREDICTED_FIELDS = Object.freeze(['gold', 'gems']);

export function goldPredictions() {
  return pending.map((p) => ({ key: p.key, site: p.site, at: p.at, inflight: p.inflight,
    amount: p.delta.gold, delta: { ...p.delta } }));
}
export function predictedGold() { return pending.reduce((s, p) => s + p.delta.gold, 0); }
export function predictedGems() { return pending.reduce((s, p) => s + p.delta.gems, 0); }
export function resetGold() { pending = []; last = null; lastVersion = -1; }

/** A finite integer-ish amount, or 0. F8: `Number(x) || 0` maps NaN to 0 but
 *  lets `Infinity` straight through, and an Infinity in the prediction ledger
 *  poisons every later sum into NaN — after which `G.gold` is NaN and every
 *  comparison in the game silently answers false. */
function amountOf(v, what) {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    console.warn('[gold] refusing a non-finite ' + what + ' (' + String(v) + '). A prediction '
      + 'ledger that accepts Infinity or NaN turns every later balance into NaN.');
    return 0;
  }
  return n;
}

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
  const r = settleCurrency(G, { gold: amount }, site, key);
  return { applied: r.applied.gold, predicted: r.predicted, key: r.key };
}

/**
 * THE GENERAL FORM — gold and gems, one gesture, ONE prediction.
 *
 * F5: the daily claim pays BOTH, and the gem half used to be a bare
 * `G.gems += rw.gems` with no prediction and no reconcile. Two tabs claiming the
 * same day therefore paid gems twice locally while the server (which clamps at
 * the 5,000/day ceiling and refuses the second claim outright) paid once — the
 * double-pay this module closed for gold, still open one field over. One entry
 * covers both fields so they cannot acquire separate lifecycles.
 */
export function settleCurrency(G, delta, site, key) {
  const d = { gold: 0, gems: 0 };
  for (const f of PREDICTED_FIELDS) {
    if (delta && delta[f] !== undefined && delta[f] !== null) d[f] = amountOf(delta[f], f);
  }
  if (!G || typeof G !== 'object') return { applied: { gold: 0, gems: 0 }, predicted: false, key: null };
  for (const f of PREDICTED_FIELDS) if (d[f]) G[f] = (Number(G[f]) || 0) + d[f];
  if (!isGoldIntentEnabled()) return { applied: d, predicted: false, key: null };
  /* A site with no server verb is still client-authored under the switch — that
     is exactly what its `deferred` row in the ledger says, and recording a
     prediction that nothing will ever settle would leave a phantom on the books
     forever. Declared rather than silent. */
  if (!isWiredSite(site) || !key) return { applied: d, predicted: false, key: null };
  if (pending.length >= MAX_PENDING) {
    const dropped = pending.shift();
    console.warn('[gold] prediction backlog full — dropping the oldest ('
      + dropped.site + ', ' + JSON.stringify(dropped.delta) + '). The next envelope is absolute, so '
      + 'this costs display accuracy for a moment and nothing else.');
  }
  pending.push({ key, site, delta: d, at: Date.now(), inflight: true });
  return { applied: d, predicted: true, key };
}

/** Retire one call's prediction — the call was ANSWERED WITH AN ENVELOPE, and
 *  the envelope's absolute value already contains whatever really happened. */
function retire(key) {
  const i = pending.findIndex((p) => p.key === key);
  if (i === -1) return 0;
  const [p] = pending.splice(i, 1);
  return p.delta.gold;
}

/**
 * MARK a prediction ABANDONED: this call will never receive an envelope of its
 * own, and we do NOT know whether it landed server-side (a 5xx after commit, a
 * 200 that was not an envelope, a gate the player dismissed). Leaving the local
 * value alone is the honest display; refusing to CARRY it, and dropping it at
 * the first envelope, is what stops it becoming permanent.
 */
export function abandonPrediction(key) {
  const p = pending.find((x) => x.key === key);
  if (!p) return false;
  p.inflight = false;
  return true;
}

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
  return p.delta.gold;
}

/**
 * ROLL BACK a prediction whose server counterpart PROVABLY never happened.
 *
 * ⚠ F7 — THE SET OF OUTCOMES THIS IS VALID FOR IS NARROW, AND THE FIRST
 *   REVISION HAD IT TOO WIDE. It rolled back on any answered outcome with no
 *   envelope, which swept in `unavailable` (5xx) and `malformed` (a 200 that is
 *   not an envelope). Neither is proof of non-write: a 502 from the edge after
 *   `hr_apply` committed, or a truncated body, both describe a purchase that
 *   HAPPENED. Reversing there hands the player their gold back for an item the
 *   server has already delivered — a mint, from the function written to prevent
 *   one.
 *
 *   `PROVABLY_UNWRITTEN` below is the whole valid set and it is stated as data.
 *   Everything else ABANDONS instead: the local value stands (honest — we do not
 *   know) and the next absolute envelope settles it.
 */
export function rollbackPrediction(G, key) {
  const i = pending.findIndex((p) => p.key === key);
  if (i === -1) return 0;
  const [p] = pending.splice(i, 1);
  if (G && typeof G === 'object') {
    for (const f of PREDICTED_FIELDS) if (p.delta[f]) G[f] = (Number(G[f]) || 0) - p.delta[f];
  }
  return p.delta.gold;
}

/**
 * THE OUTCOMES IN WHICH NOTHING REACHED THE DATABASE, AS DATA.
 *
 *   refused        400/409 with a machine code. hr_apply's protected block rolls
 *                  back in full, and the shape refusals never reach it at all.
 *   rate-limited   429 — `hr_rate_gate` is the FIRST statement of the read
 *                  transaction, before any state is read or written.
 *   not-signed-in  401/403 — refused by the JWKS verification in the function
 *                  shell, before a database connection is taken.
 *
 * ⚠ `unavailable` (5xx) and `malformed` are DELIBERATELY ABSENT. See
 *   rollbackPrediction. Adding one back is the F7 defect.
 */
export const PROVABLY_UNWRITTEN = Object.freeze(['refused', 'rate-limited', 'not-signed-in']);
export function isProvablyUnwritten(outcome) { return PROVABLY_UNWRITTEN.indexOf(outcome) !== -1; }

/**
 * THE ONE SEAM (F4). Called from `applyEnvelopeState` — i.e. from EVERY path
 * that writes a server envelope into G, including accrue.js's away grant and
 * activity.js's switch collect, neither of which knows this ledger exists.
 *
 * Before this existed the two of them wrote `G.gold` absolutely and left the
 * pending list untouched, so an outstanding prediction survived their envelope
 * and was then re-added on top of the NEXT gold envelope — the same permanent
 * offset as F1, reached from a different module. Registering one function
 * beats teaching three modules the same rule; this repo has paid for five
 * copies of one hash.
 *
 * @param ownKey the key of the call this envelope answers, when there is one.
 *        `undefined` from accrue/activity, which own no gold gesture.
 */
export function reconcilePredictions(G, res, ownKey) {
  const now = Date.now();
  const retired = ownKey ? retire(ownKey) : 0;

  /* GEMS, ABSOLUTE — here rather than in accrue.js because `applyEnvelopeState`
     is shared with the away path, which has never carried a gems field, and
     widening it would change what an away envelope does to a value no away
     envelope states. Same reasoning as the original note; it now runs for every
     envelope rather than only for the gold verbs. */
  const st = (res && res.state) || {};
  if (Number.isFinite(Number(st.gems))) G.gems = Number(st.gems);

  /* SWEEP. An ABANDONED entry, or an INFLIGHT one older than the carry bound,
     is dropped: the envelope in hand is absolute and already states whatever
     really happened. Only genuinely-outstanding gestures are carried. */
  const keep = [];
  let carried = { gold: 0, gems: 0 };
  let dropped = 0;
  for (const p of pending) {
    if (!p.inflight || (now - p.at) > PREDICTION_CARRY_MS) { dropped++; continue; }
    keep.push(p);
    for (const f of PREDICTED_FIELDS) {
      if (p.delta[f]) { G[f] = (Number(G[f]) || 0) + p.delta[f]; carried[f] += p.delta[f]; }
    }
  }
  pending = keep;
  return { retired, carried, dropped, outstanding: pending.length };
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
 *        prediction is RETIRED by the shared seam; every other OUTSTANDING
 *        prediction is re-added on top, because the server produced this
 *        envelope before those gestures existed and cannot describe them.
 *
 * ⚠ EVERY EXIT FROM THIS FUNCTION ACCOUNTS FOR `ownKey` (F2/F3). Two of them did
 *   not, and the shape of the bug is identical in both: a call whose envelope
 *   arrived, returned without touching its own prediction, leaving an entry that
 *   nothing else was ever going to retire — i.e. F1 again, reached from the two
 *   paths that look like early returns rather than like answers.
 */
export function applyGoldEnvelope(G, body, ownKey) {
  const env = envelopeOf(body);
  if (!G || typeof G !== 'object' || !env) return null;

  /* §9.4's monotonic rule, applied to the verbs instead of to hr_load. Two
     calls are in flight by design; both answer truthfully, and the slower
     answer is the OLDER one. Applying it would put a balance back to before a
     spend that has already been journalled.

     ⚠ F2 — AND THIS CALL IS STILL ANSWERED. The newer envelope that already
       landed CARRIED this prediction (it was outstanding at the time), so the
       amount is sitting in `G.gold` on top of a server value that is at least
       as new. Rolling it back is not "reversing a payment": it is removing a
       CARRY whose gesture has now been answered. If the intent did land, the
       newer envelope already contains it; if it did not, the newer envelope is
       still the truth. Either way the carry must come off, and the first
       revision just returned. */
  if (env.version < lastVersion) {
    const undone = rollbackPrediction(G, ownKey);
    return { stale: true, version: env.version, current: lastVersion, undone };
  }

  const loss = describeReplacement(G, env);
  /* b366 — THE DEVICE-HANDOFF DEFERRAL, APPLIED TO THIS TWIN TOO. Same three
     lines and same reasoning as accrue.js's applyEnvelope: during a handoff `G`
     is whatever loadLocal() put there, so a stale phone save makes almost any
     envelope read "destructive" on arithmetic alone, and the consent modal it
     raises names a permanent loss while the real save is still in flight.
     ⚠ THE PREDICTION IS ABANDONED, exactly as in the consent branch below (F3):
     nothing is written, no second envelope is coming for this key, and leaving
     it INFLIGHT would make it immortal — the F1 permanent offset wearing a
     deferral instead of a dialog. The re-apply after the reconcile is absolute
     and needs no carry to be correct. */
  if (loss.destructive && isReconcilePending()) {
    console.warn('[gold] deferring the replacement decision — the cloud reconcile has not settled, '
      + 'so the local save being compared against may not be the one that wins.');
    abandonPrediction(ownKey);
    return null;
  }
  if (loss.destructive && !isReplacementAcknowledged()) {
    console.warn('[gold] REFUSING to overwrite local progress with the server character '
      + 'until the player confirms — would lose ' + loss.gold + ' gold, ' + loss.skillXp
      + ' skill XP and ' + loss.items + ' item(s). This is permanent and there is no merge.');
    /* ⚠ F3 — ABANDONED, NOT LEFT INFLIGHT. Nothing is written here, so the local
       value stands and rolling back would be wrong (the intent may well have
       landed — this refusal is about CONSENT, not about the server). But the
       call is over: its envelope came and went, and no second one is coming for
       this key. Leaving it INFLIGHT makes it immortal for any player who
       dismisses the sheet, which is the F1 offset wearing a consent dialog.
       ABANDONED keeps the display honest and guarantees the first envelope
       after the acknowledgement drops it. The re-apply below is absolute and
       needs no prediction to be correct. */
    abandonPrediction(ownKey);
    showReplacementSheet(loss, G, env, (g, e) => applyGoldEnvelope(g, { ...body, ...e }, ownKey));
    return null;
  }

  /* ABSOLUTE, never additive — and the prediction sweep now happens INSIDE this
     call, through the seam registered at the bottom of this file, so the away
     and activity envelopes get exactly the same accounting (F4). */
  lastVersion = env.version;
  const written = applyEnvelopeState(G, env, ownKey);

  written.envelope = env;
  written.retired = (written.predictions && written.predictions.retired) || 0;
  written.carried = (written.predictions && written.predictions.carried) || { gold: 0, gems: 0 };
  written.receipt = receiptOf(body);
  G._serverAccrual = {
    version: env.version,
    accruedTo: env.state.accrued_to || null,
    serverNow: env.now || null,
    at: Date.now(),
    via: (body && body.verb) || 'gold',
  };
  /* b395 — THE RECORD FOLLOWS THE GOLD VERB TOO (the "forgot the fourth caller"
     gap). applyEnvelopeState above just wrote the balances ABSOLUTELY; the
     RECORD fields (record.js's `_record.stamp`) ride the same envelope and are
     written by applyRecord and by nothing else. The away/boot/switch paths in
     legacy.js (applyServerEnvelope) already re-stamp — this path did not, so a
     shop_buy / vendor_sell / claim_reward / market_buy envelope moved G.gold
     while leaving `_record.stamp.gold` at the OLD fingerprint. Harmless while
     gold/gems are UNMOVED (recordValue only guards a moved field), but the
     moment they are armed into SERVER_OF_RECORD the stale stamp makes
     recordValue report `source:'client-overwrote'` → balanceOf UNKNOWN →
     canAfford fail-closes → every Buy/Sell/List control disables until the next
     background sync re-stamps. Same shape applyRecord expects on the reference
     path (`{ok:true, version, state, now}`), which `env` already is. Monotonic
     on `version`, so a slower answer cannot rewind. */
  try { if (typeof window !== 'undefined' && window.HearthriseRecord) window.HearthriseRecord.applyRecord(G, env); } catch (e) {}
  return written;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE REQUEST, AS DATA — pure, so the suite asserts the LITERAL bytes.
   ══════════════════════════════════════════════════════════════════════════ */
export const OFFER_ID_RE = /^[a-z0-9_]{1,32}\.[a-z0-9_]{1,64}$/;
/* ⚠ A SEPARATE, WIDER pattern for unlock offers — DELIBERATELY not a widening of
   OFFER_ID_RE. An unlock offer id has 2-3 dotted segments (`property.homestead`,
   `room.cellar.1`), which the single-dot shop pattern above would refuse. This
   MIRRORS the server's OFFER_ID_RE in supabase/functions/hr-accrue/request.js
   (1-3 trailing segments); a mismatch would let the client refuse an id the
   server accepts, or send one it rejects. Kept in lockstep by tests. */
export const UNLOCK_OFFER_ID_RE = /^[a-z0-9_]{1,40}(?:\.[a-z0-9_]{1,40}){1,3}$/;
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
  /* ⚠ THE OFFER ID AND NOTHING ELSE. No qty (a rung is bought once), and above
     all NO PRICE — the price the server charges lives only in
     public.hr_unlock_offers. A qty or cost field added here would be a client
     number authoring a permanent capability, which is the whole thing this verb
     was written to make impossible. */
  else if (o.verb === UNLOCK_BUY_VERB) { body.offer = String(o.offer); }
  else if (o.verb === VENDOR_SELL_VERB) { body.item = String(o.item); body.qty = Number(o.qty); }
  else if (o.verb === CLAIM_REWARD_VERB) {
    body.reward = { kind: String(o.rewardKind), key: String(o.rewardKey) };
  }
  /* ⚠ THE MARKET BRANCHES, AND THE ASYMMETRY IN THEM IS THE SECURITY PROPERTY.
     `market_list` sends an `ask` — a seller naming a price about their own
     goods, which becomes SERVER STATE the moment it is accepted. `market_buy`
     sends a LISTING and a COUNT and has NO PRICE FIELD AT ALL: the server reads
     `ask_each` off the row it locked. A price on the buy branch would be a
     client value crossing to another player, which is the one thing that may
     never happen — so if you are here to add one, read
     supabase/migrations/2026-08-17-market-v2.sql §"THE ONE UNCOMFORTABLE
     FIELD" first, and then do not. */
  else if (o.verb === MARKET_LIST_VERB) {
    body.item = String(o.item); body.qty = Number(o.qty); body.ask = Number(o.ask);
  } else if (o.verb === MARKET_CANCEL_VERB) {
    body.listing = String(o.listing);
  } else if (o.verb === MARKET_BUY_VERB) {
    body.listing = String(o.listing); body.qty = Number(o.qty);
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

let hooks = { onEnvelope: null, onOutcome: null, onRollback: null, onAbandon: null };
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
    pending: goldPredictions(), predicted: predictedGold(), predictedGems: predictedGems(),
    inflight: pending.filter((p) => p.inflight).length,
    abandoned: pending.filter((p) => !p.inflight).length,
    version: lastVersion, last,
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
       legacy.js has not published G yet — the prediction is ABANDONED rather
       than retired: retiring it would tell the ledger a server number landed
       when none did, and leaving it INFLIGHT would make it immortal (F1). */
    if (!wrote) applied.abandoned = !!fire('onAbandon', key, { ...verdict, verb });
  } else if (isProvablyUnwritten(verdict.outcome)) {
    /* ⚠ F7 — THE NARROW SET, AND ONLY IT. `refused` / `rate-limited` /
       `not-signed-in` are refused before any state is written: shape checks,
       the rate gate as the first statement of the read transaction, or the JWKS
       verification before a connection is taken. hr_apply's protected block
       rolls back in full for the rest. So the local prediction is provably the
       only thing that moved and it is undone exactly. */
    applied.rolledBack = fire('onRollback', key, { ...verdict, verb }) || 0;
  } else if (isAnswered(verdict.outcome)) {
    /* ⚠ ANSWERED, NO ENVELOPE, AND **NOT** PROOF OF NON-WRITE — `unavailable`
       (5xx) and `malformed` (a 200 that is not an envelope). A 502 from the
       edge after `hr_apply` committed, and a truncated body, both describe a
       purchase that HAPPENED. The first revision rolled these back, which hands
       the player their gold back for an item the server has already delivered:
       a mint, from the function written to prevent one. ABANDONED — the local
       value stands (we do not know) and the first absolute envelope settles it. */
    applied.abandoned = !!fire('onAbandon', key, { ...verdict, verb });
    applied.unresolved = true;
  } else {
    /* NEVER ANSWERED. Same reasoning, arrived at from the other direction: the
       intent may have landed, so nothing local is reversed — but the call is
       OVER, so the entry must stop being carried or it outlives the session. */
    applied.abandoned = !!fire('onAbandon', key, { ...verdict, verb });
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

/**
 * BUY A PERMANENT UNLOCK RUNG. NO PRICE CROSSES — the client names an OFFER ID
 * and the server reads price, rung and both prerequisites off
 * public.hr_unlock_offers, under the per-character lock, merging the rung as
 * GREATEST(existing, granted). A refused offer (unknown, unsupported, stale
 * version, insufficient gold, unmet prereq) is answered server-side and the
 * local debit prediction is retired or rolled back by the same settleVerdict
 * seam every gold verb uses.
 *
 * The id shape is refused LOCALLY so a malformed gesture does not spend a real
 * player's rate budget to be told `bad_offer` — the same discipline buyShop and
 * the market gestures follow.
 */
export function buyUnlock(offerId, key) {
  const id = String(offerId == null ? '' : offerId);
  if (!UNLOCK_OFFER_ID_RE.test(id)) {
    return Promise.resolve(inert('unsendable', UNLOCK_BUY_VERB, 'bad_offer', { offer: id }, key));
  }
  return sendGoldIntent({ verb: UNLOCK_BUY_VERB, offer: id }, key);
}

/* ══════════════════════════════════════════════════════════════════════════
   BUY A PERMANENT TRAIT (b46x) — hr_trait_buy, a DIRECT RPC.
   ══════════════════════════════════════════════════════════════════════════
   THE DEFECT IT CLOSES. Under the live marks arm, legacy.js `buyTrait()` fails
   closed on its first line — a raw `G.marks -= cost` on a server-owned balance
   would be a client-authored debit the next envelope reconciles away while the
   trait stayed granted. Correct, and it meant AUTO-EAT (the purchase the death
   sheet teaches on a player's FIRST death) could not be bought at all. The
   server half is supabase/migrations/2026-08-23-trait-buy.sql.

   ⚠ WHY THIS IS NOT A GOLD VERB, AND SO NOT A PREDICTION.
     The five verbs above ride the hr-accrue Edge Function, return an ENVELOPE,
     and write `G.gold` ABSOLUTELY — which is why each needs an entry in the
     prediction ledger. This one is a plain PostgREST RPC and it writes NO
     balance at all: the client never touches G.marks / G.gold for a trait, so
     there is nothing to predict, nothing to retire and nothing that can be
     orphaned into the permanent additive offset the F1 finding is about. The
     new balance comes back in the answer for RENDERING only and is reconciled
     by the next envelope (the hr_bounty_spend discipline exactly). If you are
     here to add `settle(G, -cost, …)` — don't. That reopens F1 for a value the
     server already owns.

   ⚠ NO PRICE, NO CURRENCY, NO QUANTITY CROSSES. The body is a TRAIT ID and a
     SLOT. Price, currency and prerequisite live in public.hr_traits and are
     read under the per-character lock. A `p_cost` field added here would be a
     client number authoring a permanent capability, which is exactly what the
     server verb was written to make impossible (tests/trait-buy.mjs bindGuard
     fails the build if one appears).

   The transport is spelled out here rather than borrowed from
   src/net/goal-claim.js because that module is a classic script on `window` and
   this one is ESM that Node imports directly — a seam that only exists in a
   browser is a seam the Node guards cannot see. `fetch` resolves at CALL time,
   so a test's override IS the transport. */
export const TRAIT_BUY_RPC = 'hr_trait_buy';
export const TRAIT_ID_RE = /^[a-z0-9_]{1,64}$/;

/** The request, as data — pure, so the suite asserts the LITERAL bytes. */
export function buildTraitBuyRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= MAX_SLOT ? o.slot : 0;
  /* CONSTRUCTED, field by field. There is no `...o` here for the same reason
     buildGoldRequest has none: the field a future caller adds by accident is
     the field that turns a NAME into a VALUE. */
  const body = {
    p_trait_id: String(o.trait == null ? '' : o.trait),
    p_slot: slot,
    p_idem: String(o.intentId == null ? '' : o.intentId),
  };
  return {
    url: String(o.url || '').replace(/\/+$/, '') + '/rest/v1/rpc/' + TRAIT_BUY_RPC,
    init: { method: 'POST', headers, body: JSON.stringify(body) },
  };
}

/**
 * WHAT DID THE SERVER SAY? Pure.
 *
 * ⚠ A REFUSAL ARRIVES AS HTTP 200. PostgREST returns 200 for a function that
 *   RETURNS a value, whatever that value says — so the outcome is decided by
 *   `body.ok`, never by the status alone. Classifying on status would read
 *   `{ok:false,error:'insufficient_marks'}` as a successful purchase and grant
 *   the trait for free, which is the worst mistake available in this file.
 */
export function classifyTraitResponse(status, body) {
  const b = (body && typeof body === 'object' && !Array.isArray(body)) ? body : null;
  /* A missing function is 404/PGRST202 — the shape a deploy that never applied
     the migration produces. Named, so the caller can say "not available yet"
     rather than "you cannot afford it". */
  if (status === 404 || (b && (b.code === 'PGRST202'
      || /could not find the function/i.test(String(b.message || ''))))) {
    return { outcome: 'unavailable', reason: 'rpc_missing', body: b };
  }
  if (status === 401 || status === 403) return { outcome: 'not-signed-in', reason: 'not_signed_in', body: b };
  if (status === 429) return { outcome: 'rate-limited', reason: 'rate_limited', body: b };
  if (status >= 500) return { outcome: 'unavailable', reason: (b && b.error) || 'server_error', body: b };
  if (status !== 200) return { outcome: 'malformed', reason: 'http_' + status, body: b };
  if (!b) return { outcome: 'malformed', reason: 'not_json', body: null };
  if (b.ok === true) return { outcome: b.replayed === true ? 'replayed' : 'applied', body: b };
  const err = String(b.error || 'refused');
  if (err === 'rate_limited') return { outcome: 'rate-limited', reason: err, body: b };
  if (err === 'not_signed_in') return { outcome: 'not-signed-in', reason: err, body: b };
  return { outcome: 'refused', reason: err, body: b };
}

/** Was this outcome a real, applied purchase? The ONE predicate the caller
 *  should branch ownership on — `replayed` counts, because a replay means the
 *  original call landed and the trait IS owned. */
export function isTraitOwnedOutcome(outcome) {
  return outcome === 'applied' || outcome === 'replayed';
}

/**
 * SEND ONE TRAIT PURCHASE.
 *
 * @param traitId the catalogue id (`auto_eat`), refused locally on shape so a
 *                malformed gesture does not spend a real player's rate budget
 *                to be told `unknown_trait` — the buyShop/buyUnlock discipline.
 * @param key     the idempotency key. A retry of the SAME gesture carries the
 *                same key and the server re-debits nothing; a NEW gesture gets a
 *                fresh one. Only SUCCESSES are cached server-side, so a refusal
 *                ("5 Marks short") is buyable again the moment the Marks arrive.
 *
 * ONE ATTEMPT, NO AUTOMATIC RETRY — the rule sendGoldIntent states: an
 * unanswered value transfer is the one case where a client must not decide
 * anything on its own.
 *
 * @returns {Promise<{outcome,reason,trait,key,owned,marks,gold,name,body}>}
 */
export async function buyTrait(traitId, key) {
  const id = String(traitId == null ? '' : traitId);
  const done = (v) => {
    last = { outcome: v.outcome, verb: TRAIT_BUY_RPC, reason: v.reason || null,
      status: v.status || 0, at: Date.now(), key: key || null, trait: id };
    fire('onOutcome', last);
    const b = v.body || null;
    return { outcome: v.outcome, reason: v.reason || null, trait: id, key: key || null,
      owned: (b && Array.isArray(b.owned)) ? b.owned : null,
      marks: (b && Number.isFinite(Number(b.marks))) ? Number(b.marks) : null,
      gold: (b && Number.isFinite(Number(b.gold))) ? Number(b.gold) : null,
      name: (b && typeof b.name === 'string') ? b.name : null,
      status: v.status || 0, body: b };
  };

  /* SHAPE FIRST, CONFIG SECOND — and that order is deliberate, not tidiness.
     A gesture the client itself cannot spell is `unsendable` on ANY device;
     answering `unconfigured` for it would make the caller's diagnosis depend on
     whether the player happened to be signed in, which is how a real defect
     gets reported as "it works on my machine". buyUnlock refuses shape before
     sendGoldIntent looks at the transport for the same reason. */
  if (!TRAIT_ID_RE.test(id)) return done({ outcome: 'unsendable', reason: 'bad_trait' });
  if (!isIntentKey(key)) return done({ outcome: 'unsendable', reason: 'no_intent_key' });
  if (!config) return done({ outcome: 'unconfigured', reason: 'no_endpoint' });
  const token = tokenOf();
  if (!token) return done({ outcome: 'unconfigured', reason: 'no_token' });

  const { url, init } = buildTraitBuyRequest({
    trait: id, url: config.url, apiKey: config.apiKey, token,
    slot: resolveActiveSlot(config.slot), intentId: key,
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
    /* NEVER ANSWERED. Nothing local moved, so there is nothing to reverse — the
       purchase either landed or it did not, and the next envelope (or a retry
       with the SAME key) settles it. */
    return done({ outcome: aborted ? 'timeout' : 'unreachable',
      reason: String((e && e.message) || e) });
  }
  if (timer) clearTimeout(timer);
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  return done({ ...classifyTraitResponse(res.status, body), status: res.status });
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
   THE MARKET GESTURES (b355). Each returns a promise the caller does NOT await.
   ══════════════════════════════════════════════════════════════════════════
   Every one refuses LOCALLY on a shape the server would refuse anyway. That is
   not duplication of the server's rules — none of these is a rule about the
   GAME, they are all "this request is not readable" — and the win is the one
   `sellItem` already documents: the gesture is honest about having no server
   story at that shape instead of burning an intent key and a rate slot to be
   told so. Every rule about a ROW (is it tradeable, is it still there, can you
   afford it, is it yours) is left to the RPC, under the lock, where it can be
   answered truthfully. */

/** The listing id shape. Deliberately the SAME regexp the intent key uses, and
 *  deliberately the strict canonical form: `readListing` on the server is strict
 *  for the reason `readIntentId` is, and a client that sent `{…}` or the
 *  undashed form would be refused with `bad_listing` for a listing that exists. */
export function isListingId(id) { return typeof id === 'string' && UUID_RE.test(id); }

/**
 * LIST. Items leave the bag and become the escrow.
 *
 * ⚠ `ask` IS A PRICE AND IT IS SENT. See buildGoldRequest's market branches and
 *   supabase/functions/hr-accrue/request.js's header. It is the seller's own
 *   number about their own goods; it crosses to the SERVER, never to a buyer.
 */
export function listOnMarket(itemId, qty, ask, key) {
  const id = String(itemId == null ? '' : itemId);
  const n = Number(qty);
  const a = Number(ask);
  if (!ITEM_ID_RE.test(id)) {
    return Promise.resolve(inert('unsendable', MARKET_LIST_VERB, 'bad_item', { item: id }, key));
  }
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_QTY) {
    return Promise.resolve(inert('unsendable', MARKET_LIST_VERB, 'qty_out_of_range',
      { qty: n, max: MAX_QTY }, key));
  }
  if (!Number.isSafeInteger(a) || a < 1 || a > MAX_ASK) {
    return Promise.resolve(inert('unsendable', MARKET_LIST_VERB, 'ask_out_of_range',
      { ask: a, max: MAX_ASK }, key));
  }
  return sendGoldIntent({ verb: MARKET_LIST_VERB, item: id, qty: n, ask: a }, key);
}

/** CANCEL. The escrow comes back — exactly once, arbitrated server-side by the
 *  DELETE itself, so a cancel racing the expiry sweep is the server's problem
 *  and not a race this client has to model. */
export function cancelMarketListing(listingId, key) {
  const id = String(listingId == null ? '' : listingId);
  if (!isListingId(id)) {
    return Promise.resolve(inert('unsendable', MARKET_CANCEL_VERB, 'bad_listing', { listing: id }, key));
  }
  return sendGoldIntent({ verb: MARKET_CANCEL_VERB, listing: id }, key);
}

/** BUY. NO PRICE CROSSES. Two values leave this client — which listing, and how
 *  many — and the gross, the tax and the seller's credit are all computed inside
 *  the transaction that charges, off the row it locked. */
export function buyMarketListing(listingId, qty, key) {
  const id = String(listingId == null ? '' : listingId);
  const n = Number(qty);
  if (!isListingId(id)) {
    return Promise.resolve(inert('unsendable', MARKET_BUY_VERB, 'bad_listing', { listing: id }, key));
  }
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_QTY) {
    return Promise.resolve(inert('unsendable', MARKET_BUY_VERB, 'qty_out_of_range',
      { qty: n, max: MAX_QTY }, key));
  }
  return sendGoldIntent({ verb: MARKET_BUY_VERB, listing: id, qty: n }, key);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE BROWSER FACE — one object, so legacy.js (a classic script that cannot
   import ESM) reaches all of it through one name.
   ══════════════════════════════════════════════════════════════════════════ */
/* ⚠ REGISTERED AT MODULE LOAD, IN NODE **AND** IN THE BROWSER (F4). Outside the
   `typeof window` block on purpose: tests/gold-*.mjs and any future Node driver
   import this module directly, and a seam that only exists in a browser is a
   seam the Node guards cannot see. accrue.js holds the slot; this fills it, so
   every envelope written by accrue.js, activity.js or this file goes through
   ONE prediction accounting rather than three copies of the rule. */
registerPredictionSeam(reconcilePredictions);

/* ══════════════════════════════════════════════════════════════════════════
   THE BROWSER FACE — one object, so legacy.js (a classic script that cannot
   import ESM) reaches all of it through one name.
   ══════════════════════════════════════════════════════════════════════════ */
if (typeof window !== 'undefined') {
  /* THE DEFAULT WIRING: the envelope applier, the rollback and the abandon are
     hooked HERE, against `window.G`, so a call site does not have to know any of
     them exists. A test replaces them with setGoldHooks. */
  setGoldHooks({
    onEnvelope: (body, v) => applyGoldEnvelope(window.G, body, v && v.key),
    onRollback: (key) => rollbackPrediction(window.G, key),
    onAbandon: (key) => abandonPrediction(key),
  });

  window.HearthriseGold = {
    GOLD_VERBS, SHOP_BUY_VERB, VENDOR_SELL_VERB, CLAIM_REWARD_VERB, GOLD_OUTCOMES,
    MARKET_VERBS, MARKET_LIST_VERB, MARKET_CANCEL_VERB, MARKET_BUY_VERB,
    listOnMarket, cancelMarketListing, buyMarketListing, isListingId, MAX_ASK,
    MAX_QTY, MAX_PENDING, GOLD_TIMEOUT_MS, PREDICTION_CARRY_MS, PREDICTED_FIELDS,
    PROVABLY_UNWRITTEN, isProvablyUnwritten,
    isGoldIntentEnabled, settle, settleCurrency, rollbackPrediction, abandonPrediction,
    goldPredictions, predictedGold, predictedGems, reconcilePredictions,
    envelopeOf, receiptOf, classifyGoldResponse, dropPrediction, isAnswered, applyGoldEnvelope,
    buildGoldRequest, newIntentKey, isIntentKey, resolvePurchase, shopOfferIndex,
    configureGold, getGoldConfig, setGoldHooks, getGoldState, resetGold,
    buyShop, buyUnlock, sellItem, claimReward, sendGoldIntent,
    UNLOCK_BUY_VERB, UNLOCK_OFFER_ID_RE,
    /* The permanent-trait purchase (hr_trait_buy). NOT a gold verb and NOT a
       prediction — see its header. legacy.js buyTrait() is the only caller. */
    buyTrait, buildTraitBuyRequest, classifyTraitResponse, isTraitOwnedOutcome,
    TRAIT_BUY_RPC, TRAIT_ID_RE,
    LEDGER: GOLD_SITE_LEDGER,
  };
}
