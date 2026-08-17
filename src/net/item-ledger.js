// ============================================================================
// src/net/item-ledger.js — TWO LEGS OF ONE TRADE, MOVED TOGETHER.
//
// ── THE BUG THIS EXISTS FOR (reported by Xarnathos, 2026-08-18) ────────────
// "When you buy e.g. a blueprint, you will get the dungeon scrip back after a
//  short amount of time. You can buy every blueprint with minimum 160 scrip."
//
// `dungeon_scrip` is not a currency field — it is an INVENTORY ITEM
// (`G.inventory.dungeon_scrip`), and so is the blueprint it buys. The
// Quartermaster (src/dungeons.js `buyFromQuartermaster`) moves both, purely on
// the client. No verb tells the server. Then the settle envelope arrives and
// `applyEnvelopeState` treats the two legs by DIFFERENT RULES:
//
//   • scrip is a key the envelope NAMES (the server still holds the pre-purchase
//     160), so the b359 merge takes `Math.max(have=0, q=160)` -> **160 restored**;
//   • the blueprint is a key the envelope OMITS (the server has never heard of
//     it), and b359's rule is "absent means unknown, leave it alone"
//     -> **the blueprint is kept**.
//
// One gesture, two legs, two different reconciliation rules — so the trade is
// only ever half-reverted. Every 90 seconds. Free blueprints, indefinitely.
//
// ⚠ AND IT IS NOT ONLY A DUPE. Under the Phase 2 ABSOLUTE envelope (b366) the
//   same split runs the other way: the bag is replaced wholesale, so the scrip
//   comes back AND the blueprint is DELETED. Those players are silently losing
//   purchases right now. The asymmetry hurts in both directions, which is why
//   the fix is not "make the merge stricter" but "make the trade atomic".
//
// ── THE RULE ────────────────────────────────────────────────────────────────
// A client-authored trade is recorded as ONE record holding BOTH legs, and the
// envelope resolves that record as a UNIT — in the merge branch and the absolute
// branch alike. There are exactly three outcomes and no fourth:
//
//     the server knows about the goods   -> the trade is REAL.  Keep both legs.
//     the server refunded the payment    -> the trade DID NOT HAPPEN. Take the
//                                           goods back too. Both legs revert.
//     the envelope said neither          -> keep waiting.
//
// The two legs are never separated, and that is the whole property.
//
// ⚠ THE LEDGER ONLY EVER *REMOVES*. It has no branch that adds an item, under
//   any envelope, which is what makes it safe to run 320 times a day. The
//   obvious implementation — re-add the client's signed delta on top of the
//   envelope, the way gold.js's prediction sweep does — MINTS, because the
//   envelope's bag is not a consistent baseline (it rolls back the named
//   payment leg but not the omitted goods leg). The long-form argument is on
//   `reconcile` below; it is the single most important paragraph in this file.
//
// ── WHY THE ENTRIES DO NOT EXPIRE ON A TIMER ───────────────────────────────
// src/net/gold.js's prediction ledger carries `PREDICTION_CARRY_MS` and drops an
// entry the server never answers, which is right for GOLD: a prediction there
// always has a verb in flight, so silence means the call failed. Here there is
// no verb at all — the Quartermaster has no server counterpart — so a clock
// would decide the outcome of a trade by timing. An entry is retired by
// EVIDENCE, never by a clock (`settledBy` / `refundedBy` below).
//
// ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
// This is NOT server authority and does not pretend to be. It makes a
// client-authored trade CONSISTENT and BOUNDED and VISIBLE, so it stops being a
// faucet, while the real fix is built. The real fix is named in
// docs/design/server-authority.md terms at the bottom of this file.
//
// PURE ESM, no DOM, no timers, no Math.random. Persistent state lives on `G`.
// ============================================================================

/* THE STORE IS A FIELD ON `G`, NOT A MODULE-LOCAL ARRAY.
   Save invariant 3: the snapshot is a DENYLIST, so a new `G` field persists by
   default — which is exactly what is needed. An outstanding trade that did not
   survive a reload would be reverted by the first envelope after it, taking the
   player's blueprint with it. Deliberately NOT `_`-prefixed (that is scratch,
   and scratch is stripped from the snapshot) and deliberately NOT added to
   NO_SYNC ("adding a persistent-progress field to NO_SYNC = silent cloud data
   loss — forbidden"). */
/* ⚠ READ VIA THIS CONSTANT, WRITE VIA THE LITERAL `G.pendingItemSpends`, and
   that inconsistency is deliberate. tests/gold-site-census.mjs carries a
   `computed` rule that flags EVERY computed member write on `G`
   (`G[expr] = …`), not only ones that look like gold, because the whole point
   of `G['go' + 'ld']` is that the property name is absent from the source. Its
   own note records "zero in the tree today, so the cost of the broad rule is
   zero". Writing `G[LEDGER_FIELD] = []` here would have been the first, and
   would have bought this file a gold-ledger row it does not deserve while
   costing the census the cheapest invariant it has. */
export const LEDGER_FIELD = 'pendingItemSpends';

/* Bounded. A record is ~100 bytes and the realistic outstanding count is 0-2;
   64 is far above any honest run and stops a loop from growing the save without
   limit. Oldest is dropped first — see the note in `record`. */
export const MAX_ENTRIES = 64;

let seq = 0;

/** The live list, created on demand. Always an array. */
export function ledgerOf(G) {
  if (!G || typeof G !== 'object') return [];
  const cur = G[LEDGER_FIELD];
  if (!Array.isArray(cur)) G.pendingItemSpends = [];
  return G.pendingItemSpends;
}

/** Normalise a leg to `{id: positiveInteger}`, dropping anything unreadable. */
function legOf(bag) {
  const out = {};
  if (!bag || typeof bag !== 'object') return out;
  for (const k of Object.keys(bag)) {
    const n = Math.floor(Number(bag[k]));
    if (Number.isFinite(n) && n > 0 && /^[a-z0-9_]{1,64}$/.test(k)) out[k] = n;
  }
  return out;
}

/**
 * Record a client-authored trade. Call AFTER the gesture has already moved the
 * bag — this does not move it, it remembers that the move happened so the next
 * envelope cannot half-undo it.
 *
 * @param G      the game state
 * @param debit  {id: qty} the player PAID (already removed from the bag)
 * @param credit {id: qty} the player RECEIVED (already added to the bag)
 * @param site   a short label for debugging ('quartermaster')
 * @returns the entry, or null if there was nothing to record
 */
export function record(G, debit, credit, site) {
  if (!G || typeof G !== 'object') return null;
  const d = legOf(debit);
  const c = legOf(credit);
  if (!Object.keys(d).length && !Object.keys(c).length) return null;

  const list = ledgerOf(G);
  const entry = { key: 'il' + (++seq) + '-' + Object.keys(c).join('.'), site: String(site || ''), debit: d, credit: c };
  list.push(entry);
  /* Oldest first, because the oldest entry is the one most likely to have been
     settled already by a server that simply never named it — and dropping a
     NEW entry would revert a purchase the player just made and can see. */
  while (list.length > MAX_ENTRIES) list.shift();
  return entry;
}

/**
 * HAS THE SERVER CAUGHT UP WITH THIS TRADE?
 *
 * The retirement condition, and it is EVIDENCE rather than a clock. The server
 * proves it knows about the trade by naming the credited item at or above the
 * quantity we granted: `hr_state_of` aggregates every surviving
 * `player_inventory` row, so a named credit is a positive statement that the
 * row exists server-side.
 *
 * When that happens the envelope's own figure already includes the purchase and
 * re-applying the delta would DOUBLE it — so the entry retires. That is what
 * makes this self-healing on the day a real `quartermaster_buy` verb lands:
 * every outstanding entry drains itself with no migration and no flag.
 *
 * A trade with no credit leg can never be proven this way, so it is never
 * settled here; that shape is not produced today and is asserted against.
 */
export function settledBy(entry, res) {
  if (!entry || !res) return false;
  const inv = res.inventory;
  if (!inv || typeof inv !== 'object') return false;
  const ids = Object.keys(entry.credit || {});
  if (!ids.length) return false;
  return ids.every((id) => (Number(inv[id]) || 0) >= entry.credit[id]);
}

/**
 * DID THE ENVELOPE HAND THE PAYMENT BACK?
 *
 * A positive statement, in the same spirit as `consumedKeysOf` in accrue.js: the
 * server NAMES the debited item at a figure that still includes what the player
 * spent. That is the server saying, in the only way it can, "I never saw this
 * trade" — and it is precisely the moment the refund happens.
 */
export function refundedBy(entry, res) {
  if (!entry || !res) return false;
  const inv = res.inventory;
  if (!inv || typeof inv !== 'object') return false;
  const ids = Object.keys(entry.debit || {});
  if (!ids.length) return false;
  return ids.some((id) => {
    const q = Number(inv[id]);
    return Number.isFinite(q) && q >= entry.debit[id];
  });
}

/**
 * Reconcile every outstanding trade against the bag the envelope just wrote.
 *
 * ⚠ MUST RUN AFTER the envelope's own inventory write, in BOTH the merge and
 *   the absolute branch. Running it before would let the envelope overwrite the
 *   correction, which is the bug.
 *
 * ── WHY THIS REVERTS RATHER THAN RE-APPLIES ────────────────────────────────
 * The obvious implementation is "re-add the client's delta on top of whatever
 * the envelope wrote", the way gold.js's prediction sweep does. It is wrong
 * here, and the reason is worth writing down because it is not obvious:
 *
 *   THE ENVELOPE'S BAG IS NOT A CONSISTENT BASELINE. In the merge branch the
 *   payment leg is rolled back (scrip is NAMED, so `Math.max` refunds it) while
 *   the goods leg is NOT (the blueprint is OMITTED, so it is left alone). Blindly
 *   re-applying `-160 scrip, +1 blueprint` would subtract the scrip correctly
 *   and mint a SECOND blueprint, at every settle. A correction that can mint is
 *   worse than the bug it corrects.
 *
 * So the ledger only ever REMOVES. It cannot mint, in any branch, under any
 * envelope, which is the property that makes it safe to run 320 times a day:
 *
 *   • the server knows about the goods  -> the trade is real. Retire, touch
 *     nothing (`settledBy`). This is what drains the whole mechanism on the day
 *     a real `quartermaster_buy` verb ships.
 *   • the server handed the payment back -> the trade did not happen. Take the
 *     goods back too, and retire. BOTH LEGS MOVE TOGETHER, which is the
 *     property the report was about.
 *   • the envelope said nothing either way -> keep waiting.
 *
 * ── AND THE PLAYER LOSES NOTHING REAL BY THE REVERT ────────────────────────
 * The blueprint the Quartermaster grants is spent by `hr_unlock_buy`, which
 * reads the requirement out of `hr_unlock_offers` and re-validates it under the
 * per-character lock. A blueprint the server never received cannot satisfy it —
 * so a client-only blueprint was already decorative, and could never buy the
 * homestead rung it exists for. Reverting it returns the 160 scrip, which is
 * the honest outcome, instead of leaving the player holding a token that does
 * nothing and an economy that mints them.
 *
 * @returns {{settled:number, reverted:number, took:object}} for telemetry and
 *          so a caller can tell the player their scrip came back.
 */
export function reconcile(G, res) {
  const out = { settled: 0, reverted: 0, took: {} };
  if (!G || typeof G !== 'object') return out;
  const list = ledgerOf(G);
  if (!list.length) return out;

  const inv = (G.inventory && typeof G.inventory === 'object') ? G.inventory : (G.inventory = {});
  const keep = [];

  for (const e of list) {
    if (!e || typeof e !== 'object') continue;

    if (settledBy(e, res)) { out.settled++; continue; }

    if (refundedBy(e, res)) {
      for (const id of Object.keys(e.credit || {})) {
        /* Clamped at the quantity WE granted and floored at zero: if the player
           has since acquired more of the same item by other means, only our
           copy is taken back, and the bag can never go negative. */
        const take = Math.min(e.credit[id], Number(inv[id]) || 0);
        if (take <= 0) continue;
        const next = (Number(inv[id]) || 0) - take;
        if (next > 0) inv[id] = next; else delete inv[id];
        out.took[id] = (out.took[id] || 0) + take;
      }
      out.reverted++;
      continue;
    }

    keep.push(e);
  }

  G.pendingItemSpends = keep;
  return out;
}

/* ── THE SERVER END STATE (not built here, named so it is not re-derived) ────
   The correct shape is a `quartermaster_buy` INTENT, and every piece of it
   already exists:

     • the catalogue: `QM_STOCK` in src/dungeons.js is the price list and must
       move to src/data/ so tools/gen-catalogues.mjs can emit an
       `hr_quartermaster_offers` table. The PRICE IS THE SERVER'S — the request
       names an offer id and nothing else, exactly as ./shop-buy.js does.
     • the plumbing: supabase/functions/hr-accrue/spend.js already carries the
       gate/read/apply/refusal seam; the verb module only has to validate a name,
       look up a price and build a delta.
     • the authority: `hr_apply`'s item op is signed and re-checks
       `have + delta >= 0` under the per-character advisory lock, so "not enough
       scrip" is the DATABASE's answer, not the client's — and the debit and the
       grant land in ONE delta, i.e. atomically, which is the property this file
       approximates from the outside.
     • the retirement: this whole module drains itself the moment that verb
       ships, via `settledBy` above. Delete it when the ledger is empty in the
       field.

   Until then the residual is stated plainly: a determined player can still
   forge a Quartermaster purchase, because the client still authors it. What
   they can NO LONGER do is get the item and keep the currency — which is the
   bug that was reported, and the one that scaled at one free blueprint every
   90 seconds. */
