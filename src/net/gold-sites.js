// ============================================================================
// src/net/gold-sites.js — THE GOLD SITE LEDGER.
//
// Every place in this client that moves a gold balance, named, with the server
// verb that owns it or the dependency that blocks one. `tests/gold-site-census.
// mjs` derives the site list from the SOURCE and fails the build on any site
// that is not in here — so this is a census that cannot go stale in silence,
// which the two hand-counted ones before it both did within a week.
//
// ── WHY A LEDGER AND NOT A COMMENT ──────────────────────────────────────────
// Tyler's b348 lesson, in his own framing: *derivation removes the second LIST,
// it does not remove the second SIDE.* The server can derive `SETTABLE_KINDS`
// from `PAYABLE_KINDS` all it likes; nothing on the server can make the CLIENT
// say the word. Money has the same two sides and a worse failure mode — a gold
// site the server was never told about does not error, it just goes on paying a
// client-authored number, forever, under a green suite.
//
// ── HOW A SITE IS NAMED ─────────────────────────────────────────────────────
// Two shapes, because there are two kinds of site:
//
//   `seam:<id>`            A PLAYER GESTURE that has been moved onto the one
//                          payment choke point (`HearthriseGold.settle`). The
//                          id is the literal string at the call site, so the
//                          row survives every edit that does not change the
//                          gesture. THESE are the rows that carry a verb.
//   `<path>#<function>`    A RAW `.gold` write the scanner found, named by its
//                          enclosing function. `@2` disambiguates a second
//                          write in the same function.
//
// ── THE STATUSES ────────────────────────────────────────────────────────────
//   'wired'    routes through a live server verb behind the kill switch. Flag
//              OFF is byte-for-byte the behaviour that shipped before it.
//   'deferred' has no server story TODAY, and `blockedBy` says exactly what
//              would give it one. "Not yet" without a named dependency is
//              indistinguishable from "forgotten".
//   'none'     will never have a verb, and `why` says what makes it exempt.
//
// ── WHAT THIS FILE IS NOT ───────────────────────────────────────────────────
// It is not a switch and it is not a policy. Nothing here decides whether a
// call goes out; `src/net/gold.js` does, from the kill switch. `isWiredSite`
// exists so `settle` can tell a prediction that WILL be reconciled from one
// that never will be — recording the second kind would leave a phantom on the
// books forever.
// ============================================================================

export const KINDS = Object.freeze([
  'grant',           // value appears from nowhere and lands on the player
  'spend',           // value leaves the player for a sink
  'vendor',          // items -> gold at the shop bid
  'transfer',        // value crosses to ANOTHER player (market, clan, raid)
  'dev',             // a developer sink. Must never acquire a server path.
  'server',          // the value already came from the server
  'seam',            // the payment choke point itself
  'false-positive',  // the scanner matched a `.gold` that is not a balance
]);

export const STATUSES = Object.freeze(['wired', 'deferred', 'none']);

/* ══════════════════════════════════════════════════════════════════════════
   F10 — WHAT A DEFERRED SITE DOES ON THE DAY THE SWITCH IS FLIPPED
   ══════════════════════════════════════════════════════════════════════════
   The flip does not make a deferred site inert. It makes it WRONG, in a
   direction that depends only on the sign of the movement, because the server
   envelope is applied ABSOLUTELY: a local number the server has never heard of
   is not merged, it is overwritten.

     a GRANT  the player sees gold arrive and then vanish at the next envelope
     a SPEND  the player is REFUNDED at the next envelope — and keeps whatever
              the spend bought, until the envelope's absolute inventory takes
              that back too. Between the two writes the balance is a lie in the
              player's favour, which is the direction that gets noticed.

   That is the whole of the flip risk for these 33 rows, and it is why the flip
   is gated on the verbs rather than on this branch. DERIVED from `kind` rather
   than restated per row — 33 copies of two sentences is 33 chances to write the
   wrong one — with a per-row `flip` override for the rows that genuinely differ.
   `flipBehaviourOf` is the single reader; the census guard asserts every
   deferred row resolves to one AND that more than one distinct answer exists,
   so a derivation that collapsed to a single string is caught. */
const FLIP_BEHAVIOUR = Object.freeze({
  grant: 'ERASED. The next absolute envelope overwrites the local grant with the server value, '
    + 'which does not contain it. The player watches gold arrive and disappear.',
  spend: 'REFUNDED. The next absolute envelope restores the gold and — a write later — takes back '
    + 'what was bought. Between the two the balance favours the player, which is the direction a '
    + 'beta reports.',
  vendor: 'REFUNDED IN REVERSE. The sale proceeds are erased and the items come back with the '
    + 'envelope\'s absolute inventory. Net-neutral once both land; visibly wrong in between.',
  transfer: 'ERASED OR REFUNDED depending on direction, AND the other player\'s side is unaffected '
    + '— the counterparty ledger is server-side already. A market escrow that is refunded locally '
    + 'while the listing stands server-side is the worst shape here, which is why market-v2 gates '
    + 'the flip rather than following it.',
  dev: 'ERASED, and that is correct. A dev sink must not survive an envelope.',
  server: 'NOTHING. The value came from the server; the envelope agrees with it.',
  seam: 'NOTHING. The seam IS the accounting.',
  'false-positive': 'NOTHING. No balance moves.',
});

/** The single reader. Per-row `flip` wins; otherwise the family answer. */
export function flipBehaviourOf(row) {
  if (!row) return '';
  if (row.flip) return row.flip;
  return FLIP_BEHAVIOUR[row.kind] || '';
}

/* ══════════════════════════════════════════════════════════════════════════
   THE FLIP-GUARD — WHAT KEEPS A DEFERRED TRANSFER/GRANT FROM ARMING WRONG
   ══════════════════════════════════════════════════════════════════════════
   Security's gold-flip review (2026-08-17, GO-WITH-FIXES) named a class, not a
   bug: a client site that GRANTS gold or moves it to another player, with no
   server counterpart, is not merely wrong on flip day — for a `transfer` it
   arms into a FREE CROSS-PLAYER REFUND (the local rollback restores the buyer's
   gold while the counterparty ledger stands server-side), and for a `grant` it
   quietly ERASES a reward the player legitimately earned. Finding #1 was one
   instance (clan contribute); the durable fix is to make the WHOLE class
   un-regressable, which is what `flipGuard` + the census guard's L8 do together.

   Every `deferred` row whose kind is `transfer` or `grant` MUST carry ONE of:

     `flipGuard: { gated: 'TOKEN' }`
        The site does not author a balance the server will overwrite, because a
        runtime switch skips the write. TOKEN is the literal the code uses:
          · `serverMarketActive`          — the market v1/v2 switch (market.js)
          · `CLAN_LAUNCHED`               — the clan beta gate (clans.js)
          · `clientMayWriteRecordField`   — THE record seam. Returns false only
             once the field is on SERVER_OF_RECORD *and* armed, so it is a no-op
             today and becomes the gate the instant gold flips. This is the one
             new sites should reach for.
        The census guard does NOT take this on faith: it finds the site in the
        SOURCE and fails the build unless TOKEN appears in the site's enclosing
        function. A data annotation that the code does not back is a lie it
        catches.

     `flipGuard: { serverCredits: 'why' }`
        The value IS written server-side by a named counterparty RPC, so the
        local write is a prediction the envelope reconciles — not a second
        record. Data-only (the SQL is not walked here); `why` must name the RPC.

   `flipGuardOf` is the single reader. L8 asserts every deferred transfer/grant
   resolves to a valid one, and `--selftest` plants both an un-annotated transfer
   and a `gated` annotation whose token is absent from the code. */
export function flipGuardOf(row) {
  if (!row || row.status !== 'deferred') return null;
  if (row.kind !== 'transfer' && row.kind !== 'grant') return null;
  const g = row.flipGuard;
  if (!g || typeof g !== 'object') return { valid: false, reason: 'no flipGuard' };
  if (typeof g.gated === 'string' && g.gated) return { valid: true, mode: 'gated', token: g.gated };
  if (typeof g.serverCredits === 'string' && g.serverCredits) {
    return { valid: true, mode: 'serverCredits', why: g.serverCredits };
  }
  return { valid: false, reason: 'flipGuard names neither a gate token nor a server counterparty' };
}

/* ── THE NAMED BLOCKERS ─────────────────────────────────────────────────────
   Spelled once, so twenty rows blocked on one thing all say the same words and
   a reader can count them. */
const B = Object.freeze({
  /* ── b355: MARKET_V2 IS NO LONGER ONE BLOCKER. ────────────────────────────
     The old row said "market-v2 does not exist" and covered all seven market
     sites with one sentence. market-v2 now exists — three engine-only RPCs, an
     Edge verb each, a client transport — and the seven sites split three ways
     rather than flipping together, because the migration deliberately does NOT
     implement everything the v1 client does. Collapsing them back into one
     blocker would be the b348 failure in the other direction: a status that is
     true of the group and false of every member. */
  MARKET_BUY_OFFERS: 'a server BUY-OFFER model. market-v2 implements SELL listings only — '
    + '`market_listings` is an item escrow with a seller, and there is no table, no RPC and no '
    + 'escrow shape for "I will pay up to N each for M of these". A buy offer escrows GOLD, which '
    + 'means a second value-holding row with its own expiry, its own cancel-vs-fill arbitration and '
    + 'its own per-day fuses — i.e. the whole of market-v2 again, pointed the other way. Until then '
    + 'these three sites move gold the server has never heard of.',
  MARKET_V1_BACKEND: 'the removal of src/net/supabase-market-backend.js. This site exists ONLY to '
    + 'compensate a v1 direct-table write that refused, and under the seam it is DEAD CODE that is '
    + 'gated off at runtime (`serverMarketActive()`): the seam\'s own rollback is narrower and '
    + 'correct, reversing only the three outcomes that PROVE nothing was written, where this one '
    + 'also reverses a 5xx — which is a refund for goods the server may have delivered. Deleting '
    + 'the v1 backend is the next commit, not this one; the live beta still runs on it with the '
    + 'switch off.',
  MARKET_V2_NO_COLLECT: 'nothing — this site is DELETED by market-v2\'s design and is already gated '
    + 'off at runtime. hr_market_buy pays the seller INTO player_state.gold AT SALE TIME, online or '
    + 'not: there is no `collected` column (asserted, migration §11(d)) and no second credit path. '
    + 'A verb here would be a second way to be paid for one sale. It survives as the v1 path for a '
    + 'switch-off client and goes with the v1 backend.',
  UNLOCK_BUY: 'a SELLABLE namespace in unlock_buy. The verb is LIVE (hr-accrue routes it; '
    + 'hr_unlock_buy + public.hr_unlock_offers exist) and `property`/`room` are wired through it '
    + '(seam:homestead.upgrade, seam:house.upgrade_room), as are worker/plot/bank (slices 2-3). '
    + 'The non-farm plot buildings (scarecrow) are refused BY DESIGN: they have no ladder, and '
    + 'wiring them is NOT "add catalogue rows" — it is net-new server invariants + a Designer/Security '
    + 'pass, tracked as a separate work item.',
  /* B.BULK_VENDOR was RETIRED on 2026-10-06: Sell Selected and the
     sell-junk sweep paid gold through it and sent nothing, so the envelope took
     it back. They are `wired` rows naming `vendor_sell_many` now. */
  BUYBACK_LEDGER: '`G.buyback` becoming server state. Buy-back re-purchases at the exact price the '
    + 'vendor paid, off a 15-entry local list; a server that authorises it must own that list, or '
    + 'the price is client-supplied — which is the one thing that may never happen.',
});

/**
 * THE LEDGER. Keys are site ids; see the header for the two shapes.
 *
 * ⚠ Rows are ordered by FILE, not by status, so a reviewer reads the same order
 *   the scanner reports and a diff is legible.
 */
export const GOLD_SITE_LEDGER = Object.freeze({
  // ══ THE SEAM SITES — one row per player GESTURE ═══════════════════════════
  'seam:shop.buy': {
    kind: 'spend', status: 'wired', verb: 'shop_buy',
    site: 'src/screens/shop-counter.js buyShopItem() — the Equip shop and the Seed shop',
    note: 'The item id + qty + cost are resolved to a catalogue OFFER by '
      + '`resolvePurchase`, which refuses on a price mismatch rather than sending a purchase whose '
      + 'price the player has not seen. 29 of the 128 authored offers are server-sellable today '
      + '(20 equip + 9 seed); the other 99 grant unlocks or cost something other than gold.',
  },
  'seam:homestead.upgrade': {
    kind: 'spend', status: 'wired', verb: 'unlock_buy',
    site: 'src/features/homestead.js upgradeProperty() — the property-tier spine',
    note: 'NO PRICE CROSSES. The wire is the offer id `property.<tierId>` only; hr_unlock_buy reads '
      + 'the price, the one-rung ladder and the tier-(k-1) prerequisite off public.hr_unlock_offers '
      + 'under the per-character lock and merges the rung as GREATEST(existing, granted). The local '
      + 'gold debit is a PREDICTION keyed to that intent; the ITEM cost lines stay client-side until '
      + 'item authority lands (its own program), and hr_unlock_buy consumes them server-side.',
  },
  'seam:house.upgrade_room': {
    kind: 'spend', status: 'wired', verb: 'unlock_buy',
    site: 'src/legacy.js upgradeRoom() — a housing rung on the room ladder',
    note: 'Offer id `room.<id>.<rung>`; price/rung/property-tier gate/blueprint are all read and '
      + 're-validated inside hr_unlock_buy, never sent. GREATEST merge means re-buying a rung cannot '
      + 'downgrade the ladder. Gold is predicted; the item cost + dungeon blueprint stay client-side '
      + 'for now (item authority is a separate program) and are consumed server-side by the verb.',
  },
  'seam:workers.hire': {
    kind: 'spend', status: 'wired', verb: 'unlock_buy',
    site: 'src/features/workers.js hire() — the hired-crew ladder (slice 2)',
    note: 'NO PRICE CROSSES. The wire is the offer id `worker_hire.<N>` (N = current crew + 1) only; '
      + 'hr_unlock_buy reads the ESCALATING per-rung price and the property-tier gate off '
      + 'public.hr_unlock_offers and merges the rung GREATEST, so a re-buy cannot downgrade the crew '
      + 'and the crew cap tracks the SERVER property tier. The local gold debit is a PREDICTION keyed '
      + 'to that intent; switch OFF it is the plain debit that shipped before.',
  },
  'seam:workers.hire@2': {
    kind: 'spend', status: 'wired', verb: 'unlock_buy',
    site: 'src/features/workers.js hireServer() — the buy-NEXT-rung debit (hire-first)',
    note: 'The hire-first orchestration calls hr_worker_hire FIRST against the paid cap; a '
      + 'stranded/available rung materialises for FREE (no debit here). This second site fires ONLY '
      + 'when the server answers crew_cap_reached(paid_cap): the client then buys the NEXT rung '
      + '`worker_hire.<paid_cap+1>` — same escalating server-priced ladder, property-tier gated, '
      + 'GREATEST-merged. The wire is the offer id only; NO PRICE CROSSES. The local gold debit is a '
      + 'PREDICTION keyed to that intent, reconciled by the envelope (rolled back on refusal).',
  },
  'seam:farm.build_plot': {
    kind: 'spend', status: 'wired', verb: 'unlock_buy',
    site: 'src/legacy.js buildPlot(\'farm_plot\') — the farm-land ladder (slice 3)',
    note: 'Offer id `farm_land.<N>` (N = current farm-plot count + 1), 12 flat-priced rungs gated on '
      + 'the property tier. Price + gate read and re-validated server-side, GREATEST merge. Gold is '
      + 'predicted; the item cost (normal_log) stays client-side until item authority lands and is '
      + 'consumed server-side by the verb. The OTHER plot buildings (scarecrow) have no ladder — '
      + 'their raw debit is the still-deferred src/legacy.js#buildPlot row below.',
  },
  'seam:bank.buy_gold': {
    kind: 'spend', status: 'wired', verb: 'unlock_buy',
    site: 'src/legacy.js buyBankSpaceGold() — the bag-capacity ladder, gold rungs (slice 2)',
    note: 'Offer id `bank.<k>` (k = rungs already owned; the rung VALUE is k+1), 30 geometric-priced '
      + 'rungs, no tier gate. Price + the 30-rung ceiling are read and re-validated inside '
      + 'hr_unlock_buy, never sent; GREATEST merge makes a re-buy idempotent. The client also clamps '
      + 'at goldBuys<=30 as defence-in-depth. Gold is predicted; switch OFF it is the plain debit.',
  },
  'seam:vendor.sell_one': {
    kind: 'vendor', status: 'wired', verb: 'vendor_sell',
    site: 'src/screens/shop-counter.js invSellOne() — the bag\'s Sell 1',
  },
  'seam:vendor.sell_all': {
    kind: 'vendor', status: 'wired', verb: 'vendor_sell',
    site: 'src/screens/shop-counter.js invSellAll() — the bag\'s Sell All (one item id, whole stack)',
    note: 'b377: a stack above MAX_QTY (1,000) is SPLIT into ceil(qty/1,000) intents by '
      + '`vendorSellChunked`, each its own key/settle/send. The old path sent ONE oversized '
      + 'intent, whose local `qty_out_of_range` refusal rolled back the WHOLE prediction — selling '
      + 'a 4,600 stack deleted it and paid nothing. Chunks each have a real server story now.',
  },
  'seam:vendor.tap_sell': {
    kind: 'vendor', status: 'wired', verb: 'vendor_sell',
    site: 'src/legacy.js onItemTap() — the old inventory tap-to-sell prompt',
  },
  'seam:vendor.quick_sell': {
    kind: 'vendor', status: 'wired', verb: 'vendor_sell',
    site: 'src/item-ux.js — the quick-sell slider',
  },
  /* THE TWO BULK GESTURES, WIRED. Both send ONE
     `vendor_sell_many` per press through `vendorSellMany` (shop-counter.js):
     one key, one prediction, one shop rate token, all-or-nothing under hr_apply.
     The toast is built from the server's receipt only; a refusal rolls back the
     gold (PROVABLY_UNWRITTEN) and puts every stack back on the bag. */
  'seam:vendor.sell_selected': {
    kind: 'vendor', status: 'wired', verb: 'vendor_sell_many',
    site: 'src/screens/shop-counter.js invSellSelected() — Sell Selected, N item ids in one gesture',
  },
  'seam:vendor.sell_junk': {
    kind: 'vendor', status: 'wired', verb: 'vendor_sell_many',
    site: 'src/features/inv-context-menu.js settleJunk() — the sell-junk sweep',
  },
  /* 'seam:claim.daily_login' RETIRED (lane C2): the daily login and its
     `claim_reward` verb were deleted outright; daily-reward.js claims nothing. */

  // ══ THE DISPLAY-PREDICTION LAYER (b455) ═══════════════════════════════════
  /* These three are the ONLY rows in this ledger that describe gold moving the
     OTHER way — out of the record and into a display scratch — and the census
     found all three, which is the guard doing exactly its job. */
  'src/legacy.js#onLoot': {
    kind: 'seam', status: 'none',
    why: 'b455 — THE KILL\'S GOLD, MOVED OFF THE RECORD AND ONTO THE DISPLAY. '
      + '`resolveKill` in src/core/hunt/world-step.js writes `state.gold += gp` directly — correct on '
      + 'the SERVER, where that line IS the credit, and on an ARMED client it trips record.js\'s '
      + 'b347 fingerprint so the whole economy UI em-dashes until the next settle. This is the '
      + 'EXACT INVERSE of that write (`G.gold -= gp`, unclamped, on the very next statement the '
      + 'engine executes) followed by a display prediction. It ADDS no value and REMOVES none: the '
      + 'net movement of G.gold across a kill is zero and the server\'s number is untouched. '
      + 'Gated on clientMayWriteRecordField(\'gold\') — with the record dormant it does not run at '
      + 'all and the kill\'s gold is the plain local credit it has always been.',
  },
  'src/net/predict.js#predictionBag': {
    kind: 'false-positive', status: 'none',
    why: 'NOT A GOLD WRITE. `G[PRED_KEY] = bag` — the `computed` pattern (F6-3) matches every '
      + 'computed member write on G, deliberately and by design, so this is the case its own '
      + 'comment anticipated ("the day somebody needs one it gets a ledger row and a reason"). '
      + 'PRED_KEY is the literal string \'_pred\': a `_`-prefixed scratch bag that snapshot() '
      + 'excludes and the capstone residue allowlist does not name. It holds display DELTAS and '
      + 'is never read by balanceOf, canAfford, or anything that spends.',
  },
  'src/net/predict.js#resetPredictions': {
    kind: 'false-positive', status: 'none',
    why: 'NOT A GOLD WRITE — the same `G[PRED_KEY] = …` computed member as predictionBag above, '
      + 'here dropping the whole scratch bag when authority changes hands (a slot switch, a '
      + 'sign-out, forgetServerOfRecord). It can only ever REMOVE optimism.',
  },

  // ══ THE PAYMENT PATH ITSELF ═══════════════════════════════════════════════
  'src/net/gold.js#settleCurrency': {
    kind: 'seam', status: 'none',
    why: 'THE choke point. Switch OFF this is `G.gold += amount` (and `G.gems += …`) and nothing '
      + 'else; switch ON it also records ONE prediction, covering both fields, keyed to the intent '
      + 'that is about to go out.',
  },
  'src/net/gold.js#rollbackPrediction': {
    kind: 'seam', status: 'none',
    why: 'The inverse of a prediction whose server counterpart PROVABLY never happened — and only '
      + 'those: `refused`, `rate-limited`, `not-signed-in`. A 5xx or a malformed 200 is NOT proof '
      + 'of non-write (F7) and abandons instead.',
  },
  'src/net/gold.js#reconcilePredictions': {
    kind: 'seam', status: 'none',
    why: 'THE ONE SEAM (F4). Registered into accrue.js\'s `applyEnvelopeState`, so every envelope — '
      + 'away grant, activity collect, gold verb — retires this call\'s prediction, drops abandoned '
      + 'and stale ones, and re-adds only the genuinely outstanding.',
  },
  'src/legacy.js#goldSettleCurrency': {
    kind: 'seam', status: 'none',
    why: 'The delegation into the module. legacy.js is a classic script and cannot import ESM, so '
      + 'it reaches the seam through `window.HearthriseGold`.',
  },
  'src/legacy.js#goldSettleCurrency@2': {
    kind: 'seam', status: 'none',
    why: 'The fail-loud fallback. If src/net/gold.js did not load AND the switch is ON this THROWS '
      + 'rather than quietly paying a client-authored number — the same discipline as the b340 '
      + 'record strip. With the switch off it is the pre-seam expression.',
  },
  'src/legacy.js#(module)': {
    kind: 'seam', status: 'none',
    why: 'F6 — `window.goldSettle = goldSettle`, the publication. Declared because ASSIGNING to it '
      + 'is how the seam would be replaced, and REFERENCING it is how a caller would alias past the '
      + 'census (`var f = window.goldSettle; f(1e9)`). The scanner reports both sides of the line.',
  },
  'src/legacy.js#(module)@2': {
    kind: 'seam', status: 'none', why: 'the value half of the goldSettle publication — see above.',
  },
  'src/legacy.js#(module)@3': {
    kind: 'seam', status: 'none', why: 'the goldSettleCurrency publication — see above.',
  },
  'src/legacy.js#(module)@4': {
    kind: 'seam', status: 'none', why: 'the value half of the goldSettleCurrency publication.',
  },

  // ══ BULK STATE WRITES — F6. THEY CAN CARRY GOLD WITHOUT NAMING IT ═════════
  /* `src/legacy.js#loadLocal` and `#loadLocal@2` STRUCK 2026-09-07 (b515). They
     described `Object.assign(G, stripRecordFields(migrated))` — the local save
     load and its v1 migration branch, bulk writes that carried gold without
     naming it. loadLocal no longer reads a blob at all (it drops any leftover
     one and forgets the factory literals), and stripRecordFields is deleted
     with its only caller. A census row for a site nobody runs is READ as one
     that does. */
  'src/net/auth.js#applyCloudOverlay': {
    kind: 'seam', status: 'none',
    why: 'F6 — `Object.assign(G, overlay)`, the cloud overlay. Same shape and the same defence: '
      + '`stripRecordFieldsForOverlay` runs first and FAILS LOUD if the switch is on and record.js '
      + 'did not load.',
  },
  'src/legacy.js#restoreG': {
    kind: 'seam', status: 'none',
    why: 'F6 — `G[k] = snap[k]` over every key of a snapshot. A COMPUTED write, invisible to a '
      + 'scanner that matches a literal property name, and it can restore gold. It is the '
      + 'test/diagnostic restore path.',
  },
  'src/net/record.js#applyRecord': {
    kind: 'seam', status: 'none',
    why: 'F6 — `G[f] = dec.fields[f]` over the SERVER_OF_RECORD field list. Computed, and it is '
      + 'the site that will write gold on the day gold joins that list. Declared now so the flip '
      + 'is a one-line change to a site the census already knows about.',
  },
  'src/net/client-state.js#hydrateInto': {
    kind: 'seam', status: 'none',
    why: 'F6 — `G[f] = bagAA`, the non-object autoActions fallback of the blob-retire capstone '
      + 'residue hydrate. `f` here is the fixed allowlist key `autoActions`, never gold/authority. '
      + 'The whole hydrate iterates the RESIDUE_FIELDS ALLOWLIST (client-state.js), NEVER the bag\'s '
      + 'own key set — so a forged AUTHORITY key like `gold`/`skills` in the client-writable '
      + 'client_state bag is IGNORED and can never reach G.gold. Enforced twice: the allowlist here '
      + 'AND a server deny-list in hr_put_client_state (2026-08-22-client-state-denylist.sql) that '
      + 'refuses to STORE an authority key at all.',
  },
  'src/net/client-state.js#hydrateInto@2': {
    kind: 'seam', status: 'none',
    why: 'The `autoActions` branch (2026-09-14) — `G[f] = mergedAA`, the bag autoActions minus its '
      + '`eat` key DELETED. That branch is the three auto-eat COLUMNS (auto_eat_enabled/pct/food), '
      + 'which the server owns and projects, so it is stripped on the way in. `f` is the allowlist key `autoActions`; it cannot write gold, and the '
      + 'un-projected halves (farmReplant, trainGoal) are real client-only prefs.',
  },
  'src/net/client-state.js#hydrateInto@3': {
    kind: 'seam', status: 'none',
    why: 'The general residue branch — `G[f] = sanitizeResidueField(f, cs[f])` for `f` drawn from the '
      + 'RESIDUE_FIELDS allowlist (stats/chronicle/settings/…), never an arbitrary bag key. A forged '
      + 'authority key is not on the allowlist and is never assigned. Same boundary as the ones above.',
  },
  'src/net/accrue.js#applyEnvelopeStateBody': {
    kind: 'server', status: 'none',
    why: 'The server\'s own number, written ABSOLUTELY. This is the site every other one is trying '
      + 'to become.',
  },
  'src/net/accrue.js#applyEnvelopeStateBody@2': {
    kind: 'false-positive', status: 'none',
    why: '`written.gold` — a diagnostic record of what was written, on the same source line. Not a '
      + 'balance. Declared rather than special-cased in the scanner: a scanner that skips receivers '
      + 'it has been taught to ignore is a scanner one rename away from skipping a real site.',
  },
  'src/net/market-history.js#salesSince': {
    kind: 'false-positive', status: 'none',
    why: '`sum.gold += e.goldNet` TOTALS a read-only ledger for the "2 listings sold · +340 gold" '
      + 'line. `sum` is a local tally built from `market_sales` rows the server already wrote and '
      + 'already paid into `player_state.gold`; nothing here touches G, and deleting the whole '
      + 'module changes zero balances. Declared rather than skipped for the same reason as the '
      + 'accrue.js row above — a scanner taught to ignore a receiver name is one rename away from '
      + 'ignoring a real site.',
  },

  // ══ DEV SINKS — these must NEVER acquire a server path ════════════════════
  'src/admin.js#addGold': {
    kind: 'dev', status: 'none',
    why: 'The admin panel. A server verb here would be a server-sanctioned way to mint gold, which '
      + 'is the exact hole this whole program exists to close.',
  },
  'src/legacy.js#testerBoost': {
    kind: 'dev', status: 'none',
    why: 'The tester boost. Same rule as the admin panel.',
  },

  // ══ ALREADY THE SERVER'S ══════════════════════════════════════════════════
  /* H1/H5 (2026-10-17): resolveKill moved out of src/core/combat-sim.js into the
     world hunt's swing; it and the per-hero tally live in src/core/hunt/** —
     the same shared engine, vendored into hr-accrue. */
  'src/core/hunt/world-step.js#resolveKill': {
    kind: 'server', status: 'none',
    why: 'THE SHARED SIMULATION, world-hunt half. src/core/hunt/world-step.js is vendored into '
      + 'the Edge Function and prices a world kill on the SERVER; the settle re-bounds it '
      + '(hr_hunt_apply value bound). It is the code that already moved.',
  },
  'src/core/hunt/tally.js#tallyEvents': {
    kind: 'server', status: 'none',
    why: 'THE SHARED SIMULATION, the per-hero tally of a world-hunt window\'s kill gold. Vendored '
      + 'into hr-accrue; it sums the server engine\'s own events, never a client number.',
  },

  // ══ GRANTS ════════════════════════════════════════════════════════════════
  /* b494 — the write moved from claimMilestone into msGrantLocally, the DISPLAY
     half of the claim that now runs only after the server's verdict. Same site,
     same verb, renamed with it. */
  'src/features/collection-log.js#msGrantLocally': {
    kind: 'grant', status: 'deferred',
    /* SERVER-CREDITED (2026-08-22-collection-claim.sql). hr_claim_milestone
       RE-DERIVES the DISTINCT monster/item count from the server's own
       hr_bestiary_of / hr_collection_of projections (never a client `earned`
       flag), owns the gold+gems amount, once-guards a player_progress
       kind='collection' claim row per milestone, and journals it. claimMilestone
       fires HearthriseGoalClaim.claimMilestone(id); the local gold/gems write is
       a GATED prediction the envelope reconciles.

       R1/R5 (two-phase commit, the b494 fix): under the arm the DISPLAY write —
       and the `G.collectionLog.claimed` mark — happen ONLY AFTER
       hr_claim_milestone returns ok. The claim used to be fire-and-forget with
       an UNCONDITIONAL claimed-push, and `collectionLog` is residue, so an
       `incomplete` refusal marked an EARNED milestone claimed forever. And
       `incomplete` is the COMMON case, not the edge one: the client counts what
       the ATTENDED player saw while the server counts its own away-sim rows,
       which realise 60–99% fewer kills. A refusal now writes nothing, keeps the
       milestone claimable, and answers in the server's own count. */
    flipGuard: { serverCredits: 'hr_claim_milestone (2026-08-22-collection-claim.sql) re-derives the '
      + 'DISTINCT count from hr_bestiary_of / hr_collection_of, owns the fixed gold+gems amount, '
      + 'once-guards a player_progress kind=collection claim row per milestone, journals '
      + 'player_ledger kind=collection.' },
    blockedBy: 'nothing for the VALUE — hr_claim_milestone credits gold+gems server-side (see '
      + 'flipGuard). This stays deferred (not wired) only because the local write is a DIRECT display '
      + 'write gated on clientMayWriteRecordField, not yet a HearthriseGold.settle prediction the '
      + 'envelope reconciles by key — the same follow-up as muster/raid.',
    site: 'the collection-milestone payout',
  },
  /* b494 — the write moved from claimRank into grantLocally, the DISPLAY half
     of the claim that now runs only after the server's verdict. Same site, same
     verb, renamed with it: a census row that names a function nobody runs is
     read as coverage that does not exist. */
  /* 'src/legacy.js#grant' — the IAP gold-grant branch — was DELETED in b507
     (the store sells no gold; `IAP.grant()` no longer has a `p.gold` arm).
     The census must not describe a site nobody runs, so the row is gone with it. */
  'src/legacy.js#completeQuest': {
    kind: 'grant', status: 'deferred',
    /* SERVER-CREDITED (2026-08-20-goal-reward-rpc-credit.sql). hr_claim_quest
       VERIFIES quest completion from the server's own kind='stat' ev:<type>
       lifetime counter (a mirrored quest reads ev:kill_any = stats.kills),
       credits the server-owned gold once-guarded per quest id and journals it
       (kind='quest'). completeQuest fires HearthriseGoalClaim.claimQuest(q.id);
       the local gold write is a GATED prediction. The ITEM half is server-
       credited too since 2026-09-06-quest-item-rewards.sql — hr_quest_rewards
       is looked up in the same transaction, credited into player_inventory on
       the same once-guard and reported back as `items`, which the client
       MIRRORS rather than mints. Only combat-XP stays client-applied (the XP
       arming slice); hundred_kills is XP-only and never claims. */
    flipGuard: { serverCredits: 'hr_claim_quest (2026-08-20-goal-reward-rpc-credit.sql) verifies the '
      + 'kind=stat ev:<type> lifetime counter, owns the fixed gold amount, once-guards a '
      + 'player_progress kind=quest claim row per quest id, journals player_ledger kind=quest.' },
    blockedBy: 'nothing for the VALUE (gold) or for the ITEM half — hr_claim_quest credits both, in one '
      + 'transaction, on one once-guard. Only the combat-XP reward (hundred_kills) stays client-applied '
      + 'until the XP arming slice; that is a display grant, not a value that crosses to another player.',
    site: 'the quest payout',
  },

  // ══ SPENDS WITH NO VERB YET ═══════════════════════════════════════════════
  /* upgradeProperty is now `seam:homestead.upgrade` (wired, unlock_buy) — it no
     longer writes `.gold` raw, so the scanner reports it under the seam id. */
  /* hire() is now `seam:workers.hire` (wired, unlock_buy — slice 2). */
  /* buyBankSpaceGold() is now `seam:bank.buy_gold` (wired, unlock_buy — slice 2);
     the DERIVED_PRICE blocker is retired for it (the price is a server-owned
     ladder rung now, not a client-derived escalator). */
  /* upgradeRoom is now `seam:house.upgrade_room` (wired, unlock_buy). */
  /* b510 — THE FARM PLOT TIER IS PRICED IN GOLD NOW. Both sites live in
     upgradePlot(); the scanner names them for the nearest enclosing function
     (the injected `setGold` dep) and disambiguates with @2. */
  'src/features/farm-progression.js#setGold': {
    kind: 'seam', status: 'none',
    why: 'NOT A CLIENT-AUTHORED SPEND — it is the SERVER\'s post-debit balance, written ABSOLUTELY. '
      + 'hr_farm_upgrade_plot (supabase/migrations/2026-09-06-plot-tier-reachable.sql) reads the '
      + 'price off public.hr_plot_tier under the character\'s row lock, charges gold (or a Farmer\'s '
      + 'Deed when gold is short) and RETURNS the resulting balance; reconcileFarmResult writes that '
      + 'number and nothing else. No price and no delta crosses from the client, and a response '
      + 'without the key leaves gold alone for the next envelope to settle. This is the same shape '
      + 'as an envelope write, not a payment.',
  },
  /* b514 (cleanup slice 4) — `farm-progression.js#setGold@2` IS RETIRED, not
     re-filed. It described upgradePlot()'s PRE-ARM fallback debit (deed/gold
     spend + a local plot_level write), which had been unreachable since the b454
     cutover armed FARM_SERVER_ARM_ENABLED and is now DELETED from the source.
     There is exactly one writer of the plot tier again — hr_farm_upgrade_plot —
     and the `#setGold` row above (the server's absolute post-debit balance) is
     the whole of what the client still does with gold on this screen. */
  'src/legacy.js#buildPlot': {
    kind: 'spend', status: 'deferred', blockedBy: B.UNLOCK_BUY,
    site: 'the NON-farm plot buildings (scarecrow) — farm_plot itself is now seam:farm.build_plot',
  },

  /* 2026-09-14: the vendor counter moved out of the monolith into the shop
     screen controller (task #129). The row follows the code — the census fails
     BOTH ways on a stale path (undeclared site here, missing site there), which
     is how this rename was found rather than assumed. */
  'src/screens/shop-counter.js#repurchase': {
    kind: 'spend', status: 'deferred', blockedBy: B.BUYBACK_LEDGER,
  },

  // ══ TRANSFERS — value crossing to another player ══════════════════════════
  /* ── THE MARKET (b355). The first value that crosses to another player. ───
     `seam:market.buy` and `seam:market.buy_aggregated` are one gesture each and
     both are `market_buy`: a sweep across five sellers is FIVE transfers to five
     people, one intent apiece, because hr_apply is single-character by
     construction and a delta that could move five strangers' rows would be the
     most dangerous key in the engine's vocabulary. Two ids rather than one
     because they are two gestures a player can tell apart and a support ticket
     has to be able to name.

     ⚠ THE SELL SIDE HAS NO ROW HERE, AND ITS ABSENCE IS CORRECT. `listItem` and
       `cancelListing` are wired to market_list / market_cancel in the same
       commit, but they move ITEMS, not gold — the seller is paid at SALE time,
       by hr_market_buy, into the buyer's own envelope. A gold census that grew a
       row for them would be claiming a gold movement that does not exist. */
  'seam:market.buy': {
    kind: 'transfer', status: 'wired', verb: 'market_buy',
    site: 'src/market.js buyListing() — buying one listing outright',
    note: 'NO PRICE CROSSES. The wire is (listing, qty); hr_market_buy reads `ask_each` off the row '
      + 'it locked under both parties\' advisory locks, charges the buyer, credits the seller net of '
      + 'the house tax and journals both sides. The local debit is a PREDICTION keyed to that intent '
      + 'and is retired by its envelope. A listing whose id is still local (\'L…\') gets NO key and '
      + 'therefore NO prediction — an entry nobody can retire is the F1 permanent offset.',
  },
  'seam:market.buy_aggregated': {
    kind: 'transfer', status: 'wired', verb: 'market_buy',
    site: 'src/market.js buyAggregated() — the cheapest-first sweep, one intent per listing',
    note: 'The `shop` bucket is 30/min, so a sweep past thirty listings rate-limits its own tail. '
      + 'A 429 is PROVABLY_UNWRITTEN, so those legs roll back exactly and the sweep is partial — '
      + 'which is the state the residual already models.',
  },
  'src/market.js#collectSaleProceeds': {
    kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_V2_NO_COLLECT,
    flipGuard: { gated: 'serverMarketActive' },
  },
  'src/market.js#revertBuy': {
    kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_V1_BACKEND,
    flipGuard: { gated: 'serverMarketActive' },
  },
  /* b511: these two escrow/refund raw gold, and until b511 the ONLY thing
     stopping them was serverMarketActive() — the market v1/v2 switch, which
     answers "is there a server market", not "may the client author gold". They
     are different questions with different owners. Both now also carry
     `clientMayWriteRecordField('gold')`, refusing the whole gesture (never just
     the debit — an offer created without its escrow is a free order), and the
     declared guard is the record seam because that is the one that tracks gold
     authority. autoMatchAgainstOffers below is unreachable while placeBuyOffer
     is refused, so it keeps the market gate. */
  'src/market.js#placeBuyOffer': {
    kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_BUY_OFFERS,
    flipGuard: { gated: 'clientMayWriteRecordField' },
  },
  'src/market.js#cancelBuyOffer': {
    kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_BUY_OFFERS,
    flipGuard: { gated: 'clientMayWriteRecordField' },
  },
  'src/market.js#autoMatchAgainstOffers': {
    kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_BUY_OFFERS,
    flipGuard: { gated: 'serverMarketActive' },
  },

  // ══ NOT BALANCES AT ALL ═══════════════════════════════════════════════════
  'src/net/sync.js#readRealmProjection': {
    kind: 'false-positive', status: 'none',
    why: '`out.gold = …` copies the figure OFF the hr_load envelope into the cloud-save '
      + "diagnostic's report object (b519). It is a read of the server's own number for "
      + 'display in Settings; it never touches G, and no balance moves.',
  },
});

/** Is this site one whose prediction a server envelope will actually settle? */
export function isWiredSite(id) {
  const row = Object.prototype.hasOwnProperty.call(GOLD_SITE_LEDGER, `seam:${id}`)
    ? GOLD_SITE_LEDGER[`seam:${id}`]
    : (Object.prototype.hasOwnProperty.call(GOLD_SITE_LEDGER, id) ? GOLD_SITE_LEDGER[id] : null);
  return !!(row && row.status === 'wired');
}

if (typeof window !== 'undefined') {
  window.HearthriseGoldSites = {
    GOLD_SITE_LEDGER, KINDS, STATUSES, isWiredSite, flipBehaviourOf, flipGuardOf,
  };
}
