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
export const FLIP_BEHAVIOUR = Object.freeze({
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
    + '(seam:homestead.upgrade, seam:house.upgrade_room), as are worker/plot/bank (slices 2-3) and '
    + 'companion (slice 4 — the req_skill/req_skill_level gate is now implemented, so the shop '
    + 'companions sell through seam:companion.buy). The namespaces still parked here are refused BY '
    + 'DESIGN, each for a server-authority reason: theme is gem-priced; trait:auto_eat already has '
    + 'its own applied RPC (hr_set_auto_eat); the non-farm plot buildings (scarecrow) have no ladder. '
    + 'Wiring them is NOT "add catalogue rows" — it is net-new server invariants + a Designer/Security '
    + 'pass, tracked as separate work items.',
  CLAN_DEPOSIT_GOLD: '`clan_deposit_gold`. `clan_deposit` exists for ITEMS (2026-08-08-clan-seat.sql) '
    + 'and has the whole pattern — server catalogue, server clock, per-call and per-day clamps off '
    + 'an append-only ledger. Gold needs the same shape and does not have it. Blocked with market-v2 '
    + 'on `player_inventory` holding real rows.',
  LIVE_ACTION_INTENTS: 'live-action intents. This fires inside the loop the server already '
    + 'simulates (`computeAccrual`), so it does not want a verb — it wants the accrual engine to '
    + 'pay it, and this client site is DELETED when live actions move server-side.',
  DAILY_COUNTERS: 'a server model for the GOALS BOARD (DAILY_GOAL_POOL / WEEKLY_GOAL_POOL, '
    + 'claimQuestReward). b414 moved the DAILY-TASK (updateDaily) and QUEST (completeQuest) payouts '
    + 'onto hr_claim_daily / hr_claim_quest, which verify the src/core/goals.js ev:<type> counters. '
    + 'This board is a DIFFERENT tracking model the ev counters cannot verify: progress = '
    + 'readSource(stats.*) - a per-period baseline, and most sources (stats.chopped/.mined/.fished/'
    + '.planted/.levelups, _dailyGoldDelta) are NOT ev types — the ev model emits only six AGGREGATE '
    + 'types. The weekly delta-baseline cannot be reconstructed from ev daily rows either. Needs a '
    + 'server per-skill/derived counter model + period baseline, or re-authoring the board onto the '
    + 'six ev types. See src/data/goal-catalogue.js BLOCKED_GOAL_BOARD.',
  /* B.MARKS_COLUMN was RETIRED on 2026-08-23: player_state.marks now exists and the
     CULL bounty turn-in is server-credited (hr_claim_bounty, 2026-08-23-bounty.sql),
     so completeBounty carries a serverCredits flipGuard rather than this blocker. See
     that row. The kill-driven AWAY accrual of bounties remains an accrual-engine
     follow-up, tracked at the completeBounty row, not here. */
  /* B.COLLECTION_MODEL and B.RENOWN_MODEL were RETIRED on 2026-08-22: the
     collection-milestone and renown-rank payouts are now server-credited
     (hr_claim_milestone / hr_claim_rank), so their sites carry a serverCredits
     flipGuard rather than a blocker. See those rows below. */
  BULK_VENDOR: 'a BULK vendor verb. `vendor_sell` prices ONE item id per call and the shop rate '
    + 'bucket is 20/min, so a sweep of N stacks needs N intents and a 30-stack sweep is rate-'
    + 'limited halfway through — leaving the bag half-sold against a server that agrees. Needs '
    + 'either a `vendor_sell_many` taking a list, or a server-side "sell everything below value V".'
    + ' REPORTED, NOT PATCHED: supabase/functions/** is held by other agents.',
  DERIVED_PRICE: 'a server-owned price. This spend computes its cost at call time and is NOT in '
    + 'SHOP_OFFERS — see DERIVED_PRICES in src/data/shops.js. A server that authorises a spend must '
    + 'own the price, and for this one it would also have to own the purchase COUNT the price '
    + 'escalates from, plus a cap the client does not have.',
  DUNGEON_ENTRY: 'a dungeon-entry verb. The six dungeon offers price an ENTRY, not an item — the '
    + 'grant is a run, which has no delta shape in hr_apply. Sits with the live-action intents.',
  BUYBACK_LEDGER: '`G.buyback` becoming server state. Buy-back re-purchases at the exact price the '
    + 'vendor paid, off a 15-entry local list; a server that authorises it must own that list, or '
    + 'the price is client-supplied — which is the one thing that may never happen.',
  IAP_RECEIPT: 'platform receipt verification. This is real money and wants a store receipt check, '
    + 'not a progression intent. Disabled in the web beta.',
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
    site: 'src/legacy.js buyShopItem() — the Equip shop and the Seed shop',
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
  'seam:companion.buy': {
    kind: 'spend', status: 'wired', verb: 'unlock_buy',
    site: 'src/legacy.js _buyCompanion() — the four shop companions (slice 4)',
    note: 'Offer id `companion.<id>` (sparrow/honeybee/raccoon/owl — the ONLY four companions with a '
      + '`shop:` source; drop/quest/skill/boss/starter/hatch companions never reach this path). '
      + 'hr_unlock_buy reads the price AND the skill prerequisite (honeybee cooking 25, owl prayer 50) '
      + 'off public.hr_unlock_offers and merges the one-rung `companion:<id>` ladder GREATEST — NO '
      + 'PRICE and no skill level cross the wire. The gold debit is a PREDICTION keyed to the intent. '
      + '── ARM-GATE LIFTED (b420). The buy is NO LONGER gated on clientMayWriteRecordField(\'gold\'); '
      + 'it is buyable under arm, because the pet EFFECT is now SERVER-OWNED. The server owns the '
      + 'equipped id (player_state.companion_equipped, written only by hr_companion_equip after an '
      + 'ownership check) and PROJECTS the passive bonus (hr_perks_of → companion:{id,xp}; '
      + 'sources.companions → derived), priced at accrual by src/core/companion-perk.js. The paired '
      + 'client wiring landed WITH the un-gate: equipCompanion()/unequipCompanion() in '
      + 'src/features/companions.js fire HearthriseGoalClaim.equipCompanion()/.unequipCompanion() '
      + '(hr_companion_equip), so the server learns the equipped id and pays the passive bonus. '
      + '⚠ The companion PROCS (gold/extraGold) stay client-authored and KEEP their own '
      + 'clientMayWriteRecordField(\'gold\') defer at rollProc (src/features/companions.js#rollProc, '
      + 'the two grant rows below) — a proc is a bonus on top of the bought pet, not the pet, and it '
      + 'no-ops under arm until the RNG-seam follow-up.',
  },
  'seam:vendor.sell_one': {
    kind: 'vendor', status: 'wired', verb: 'vendor_sell',
    site: 'src/legacy.js invSellOne() — the bag\'s Sell 1',
  },
  'seam:vendor.sell_all': {
    kind: 'vendor', status: 'wired', verb: 'vendor_sell',
    site: 'src/legacy.js invSellAll() — the bag\'s Sell All (one item id, whole stack)',
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
  'seam:vendor.sell_selected': {
    kind: 'vendor', status: 'deferred', blockedBy: B.BULK_VENDOR,
    site: 'src/legacy.js invSellSelected() — Sell Selected, N item ids in one gesture',
  },
  'seam:vendor.sell_junk': {
    kind: 'vendor', status: 'deferred', blockedBy: B.BULK_VENDOR,
    site: 'src/features/inv-context-menu.js sellJunk() — the sell-junk sweep',
  },
  'seam:claim.daily_login': {
    kind: 'grant', status: 'wired', verb: 'claim_reward',
    site: 'src/features/daily-reward.js claim() — the daily login reward',
    note: 'THE double-pay surface Security flagged. The local payment is a PREDICTION; the '
      + 'server\'s envelope is applied ABSOLUTELY and `granted` is rendered, never added. '
      + '`s.lastClaimDay` stays a local "have I shown the sheet" cache and stops being the '
      + 'eligibility test — eligibility is the server\'s `not_claimable`, the only answer that '
      + 'survives a second device.',
  },

  // ══ THE DISPLAY-PREDICTION LAYER (b455) ═══════════════════════════════════
  /* These three are the ONLY rows in this ledger that describe gold moving the
     OTHER way — out of the record and into a display scratch — and the census
     found all three, which is the guard doing exactly its job. */
  'src/legacy.js#onLoot': {
    kind: 'seam', status: 'none',
    why: 'b455 — THE KILL\'S GOLD, MOVED OFF THE RECORD AND ONTO THE DISPLAY. '
      + '`resolveKill` in src/core/combat-sim.js writes `state.gold += gp` directly — correct on '
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
  'src/legacy.js#loadLocal': {
    kind: 'seam', status: 'none',
    why: 'F6 — `Object.assign(G, stripRecordFields(migrated))`, the local save load. It writes '
      + 'whatever the blob holds, gold included, and no `.gold =` appears anywhere in it. Safe '
      + 'because the strip is what §9.3 makes it: a moved field is DELETED on the way in, so the '
      + 'blob\'s copy is never consulted for authority. The row exists so that stops being an '
      + 'unexamined assumption — the day `gold` joins SERVER_OF_RECORD, this is the site that '
      + 'has to already be right.',
  },
  'src/legacy.js#loadLocal@2': {
    kind: 'seam', status: 'none', why: 'the v1 migration branch of the same load — see above.',
  },
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
    why: 'F6 — `G[f] = bagBH`, the non-object bountyHunter fallback of the blob-retire capstone '
      + 'residue hydrate. `f` here is the fixed allowlist key `bountyHunter`, never gold/authority. '
      + 'The whole hydrate iterates the RESIDUE_FIELDS ALLOWLIST (client-state.js), NEVER the bag\'s '
      + 'own key set — so a forged AUTHORITY key like `gold`/`skills` in the client-writable '
      + 'client_state bag is IGNORED and can never reach G.gold. Enforced twice: the allowlist here '
      + 'AND a server deny-list in hr_put_client_state (2026-08-22-client-state-denylist.sql) that '
      + 'refuses to STORE an authority key at all.',
  },
  'src/net/client-state.js#hydrateInto@2': {
    kind: 'seam', status: 'none',
    why: 'The bountyHunter merge branch — `G[f] = merged`, where `merged` is the bag\'s bountyHunter '
      + 'with `.marks` DELETED (marks is authority, owned by the record) and G\'s record-set marks '
      + 'preserved. `f` is the allowlist key `bountyHunter`; still allowlist-bounded, cannot write gold.',
  },
  'src/net/client-state.js#hydrateInto@3': {
    kind: 'seam', status: 'none',
    why: 'The general residue branch — `G[f] = cs[f]` for `f` drawn from the RESIDUE_FIELDS allowlist '
      + '(stats/chronicle/settings/…), never an arbitrary bag key. A forged authority key is not on '
      + 'the allowlist and is never assigned. Same boundary as the two above.',
  },
  'src/net/accrue.js#applyEnvelopeState': {
    kind: 'server', status: 'none',
    why: 'The server\'s own number, written ABSOLUTELY. This is the site every other one is trying '
      + 'to become.',
  },
  'src/net/accrue.js#applyEnvelopeState@2': {
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
  'src/core/combat-sim.js#resolveKill': {
    kind: 'server', status: 'none',
    why: 'THE SHARED SIMULATION. src/core/combat-sim.js is vendored into the Edge Function by '
      + 'tools/pack-edge.mjs and the SERVER runs this exact line to price a kill. It is not a '
      + 'client site that needs moving; it is the code that already moved.',
  },

  // ══ GRANTS ════════════════════════════════════════════════════════════════
  'src/features/collection-log.js#claimMilestone': {
    kind: 'grant', status: 'deferred',
    /* SERVER-CREDITED (2026-08-22-collection-claim.sql). hr_claim_milestone
       RE-DERIVES the DISTINCT monster/item count from the server's own
       hr_bestiary_of / hr_collection_of projections (never a client `earned`
       flag), owns the gold+gems amount, once-guards a player_progress
       kind='collection' claim row per milestone, and journals it. claimMilestone
       fires HearthriseGoalClaim.claimMilestone(id); the local gold/gems write is
       a GATED prediction the envelope reconciles. */
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
  'src/features/companions.js#rollProc': {
    kind: 'grant', status: 'deferred', blockedBy: B.LIVE_ACTION_INTENTS,
    flipGuard: { gated: 'clientMayWriteRecordField' },
    site: 'companion gold proc, inside killMonster',
  },
  'src/features/companions.js#rollProc@2': {
    kind: 'grant', status: 'deferred', blockedBy: B.LIVE_ACTION_INTENTS,
    flipGuard: { gated: 'clientMayWriteRecordField' },
    site: 'companion extraGold proc, inside killMonster',
  },
  'src/features/renown.js#claimRank': {
    kind: 'grant', status: 'deferred',
    /* SERVER-CREDITED (2026-08-22-renown-claim.sql). hr_claim_rank reads the
       SERVER-DERIVED renown score (hr_renown_of), ratchets a SERVER HIGH-WATER
       (player_state.renown_high) so a transient low read cannot un-earn a
       reached rank, maps the high-water to the rank via a server-owned
       catalogue, owns the gold+gems amount, once-guards a player_progress
       kind='flag' claim row per rank, and journals it. claimRank fires
       HearthriseGoalClaim.claimRank(id); the local gold/gems write is a GATED
       prediction the envelope reconciles. */
    flipGuard: { serverCredits: 'hr_claim_rank (2026-08-22-renown-claim.sql) reads hr_renown_of, '
      + 'ratchets player_state.renown_high, maps it to the rank via a server-owned catalogue, owns '
      + 'the fixed gold+gems amount, once-guards a player_progress kind=flag renown_claim row per '
      + 'rank, journals player_ledger kind=renown.' },
    blockedBy: 'nothing for the VALUE — hr_claim_rank credits gold+gems server-side (see flipGuard). '
      + 'This stays deferred (not wired) only because the local write is a DIRECT display write gated '
      + 'on clientMayWriteRecordField, not yet a HearthriseGold.settle prediction the envelope '
      + 'reconciles by key — the same follow-up as muster/raid.',
    site: 'the renown rank-up payout',
  },
  'src/legacy.js#grant': {
    kind: 'grant', status: 'deferred', blockedBy: B.IAP_RECEIPT,
    flipGuard: { gated: 'clientMayWriteRecordField' },
    site: 'the IAP entitlement grant',
  },
  'src/legacy.js#completeBounty': {
    kind: 'grant', status: 'deferred',
    /* SERVER-CREDITED for CULL bounties (2026-08-23-bounty.sql). hr_accept_bounty
       snapshots the target's kill count as a baseline and owns the tier+reward;
       hr_claim_bounty verifies (kills-since-accept >= required) from the server's own
       ev:kill_monster:<id> counter and credits server-owned gold + the new
       player_state.marks (Bounty Marks) once-guarded by the active_bounty row,
       journalled kind='bounty'. completeBounty fires HearthriseGoalClaim.claimBounty()
       for cull; the local gold/marks write is a GATED display prediction. proof/weapon/
       streak keep the clientMayWriteRecordField defer (NOT server-verifiable). */
    flipGuard: { serverCredits: 'hr_claim_bounty (2026-08-23-bounty.sql) verifies kills-since-accept '
      + 'from ev:kill_monster:<id> against the hr_accept_bounty baseline, owns tier+reward, credits '
      + 'server-owned gold + player_state.marks once-guarded by active_bounty, journals '
      + 'player_ledger kind=bounty. CULL only; proof/weapon/streak stay clientMayWriteRecordField-gated.' },
    blockedBy: 'nothing for CULL — hr_claim_bounty credits gold+marks server-side. This stays deferred '
      + '(not wired) because (a) the local gold/marks write is a DIRECT display write gated on '
      + 'clientMayWriteRecordField, not yet a HearthriseGold.settle prediction reconciled by key '
      + '(same follow-up as muster/raid), (b) MARKS have no record-field arm yet, so client marks are '
      + 'display-only until a marks envelope key lands, and (c) proof/weapon/streak are not server-'
      + 'verifiable (loot-consume ruling / weapon-at-kill / death-streak are unmodelled).',
    site: 'the bounty turn-in payout (cull server-credited; other types client-deferred)',
  },
  'src/legacy.js#updateDaily': {
    kind: 'grant', status: 'deferred',
    /* SERVER-CREDITED (2026-08-20-goal-reward-rpc-credit.sql). hr_claim_daily
       VERIFIES the fixed daily task from the server's own kind='daily'
       ev:<type> counter for TODAY's UTC day, derives the offered SET server-side
       (hr_daily_task_set, keyed on the UTC day key — the client seeds the same
       string now), credits the server-owned gold into player_state once-guarded
       per (day, task) and journals it (kind='daily'). updateDaily fires
       HearthriseGoalClaim.claimDaily(t.id); the local G.gold write is a GATED
       prediction the envelope reconciles. daily_harvest is EXCLUDED — dynamic
       goal (farmPlotCap), keeps the clientMayWriteRecordField defer. */
    flipGuard: { serverCredits: 'hr_claim_daily (2026-08-20-goal-reward-rpc-credit.sql) verifies the '
      + 'kind=daily ev:<type> counter for the UTC day, owns the fixed gold amount, once-guards a '
      + 'player_progress kind=daily claim row per (day, task), journals player_ledger kind=daily. '
      + 'daily_harvest is server-BLOCKED (dynamic goal) and still gated on clientMayWriteRecordField.' },
    blockedBy: 'nothing for the 7 FIXED tasks — hr_claim_daily credits them. daily_harvest is BLOCKED '
      + '(dynamic goal, no server farm-plot-cap model) and a King\'s Renown 4th slot is refused '
      + 'not_offered (no server Renown model). See src/data/goal-catalogue.js BLOCKED_DAILY.',
    site: 'the daily-task payout',
  },
  'src/legacy.js#completeQuest': {
    kind: 'grant', status: 'deferred',
    /* SERVER-CREDITED (2026-08-20-goal-reward-rpc-credit.sql). hr_claim_quest
       VERIFIES quest completion from the server's own kind='stat' ev:<type>
       lifetime counter (a mirrored quest reads ev:kill_any = stats.kills),
       credits the server-owned gold once-guarded per quest id and journals it
       (kind='quest'). completeQuest fires HearthriseGoalClaim.claimQuest(q.id);
       the local gold write is a GATED prediction. Item + combat-XP stay client-
       applied (later arming slices); hundred_kills has no gold and never claims. */
    flipGuard: { serverCredits: 'hr_claim_quest (2026-08-20-goal-reward-rpc-credit.sql) verifies the '
      + 'kind=stat ev:<type> lifetime counter, owns the fixed gold amount, once-guards a '
      + 'player_progress kind=quest claim row per quest id, journals player_ledger kind=quest.' },
    blockedBy: 'nothing for the VALUE (gold) — hr_claim_quest credits it. The quest\'s item + combat-XP '
      + 'rewards stay client-applied until the inventory/XP arming slices; that is a display grant, not '
      + 'a value that crosses to another player.',
    site: 'the quest payout',
  },
  'src/legacy.js#claimQuestReward': {
    kind: 'grant', status: 'deferred', blockedBy: B.DAILY_COUNTERS,
    flipGuard: { gated: 'clientMayWriteRecordField' },
    site: 'claim_reward {kind:"daily", key:"goal"} and {kind:"quest", key:"weekly"} — both registry '
      + 'rows exist, both status blocked',
  },

  // ══ SPENDS WITH NO VERB YET ═══════════════════════════════════════════════
  'src/dungeon-scavenger.js#startScavengerRun': {
    kind: 'spend', status: 'deferred', blockedBy: B.DUNGEON_ENTRY,
  },
  'src/dungeons.js#runDungeon': { kind: 'spend', status: 'deferred', blockedBy: B.DUNGEON_ENTRY },
  'src/dungeons.js#startManualRun': { kind: 'spend', status: 'deferred', blockedBy: B.DUNGEON_ENTRY },
  /* upgradeProperty is now `seam:homestead.upgrade` (wired, unlock_buy) — it no
     longer writes `.gold` raw, so the scanner reports it under the seam id. */
  /* hire() is now `seam:workers.hire` (wired, unlock_buy — slice 2). */
  /* buyBankSpaceGold() is now `seam:bank.buy_gold` (wired, unlock_buy — slice 2);
     the DERIVED_PRICE blocker is retired for it (the price is a server-owned
     ladder rung now, not a client-derived escalator). */
  /* upgradeRoom is now `seam:house.upgrade_room` (wired, unlock_buy). */
  'src/legacy.js#buildPlot': {
    kind: 'spend', status: 'deferred', blockedBy: B.UNLOCK_BUY,
    site: 'the NON-farm plot buildings (scarecrow) — farm_plot itself is now seam:farm.build_plot',
  },
  /* buyTheme no longer writes gold at all — themes are gems-only and the free
     default is a free equip (slice 6). The old deferred gold row is retired. */
  'src/legacy.js#buyTrait': { kind: 'spend', status: 'deferred', blockedBy: B.UNLOCK_BUY },
  /* _buyCompanion is now `seam:companion.buy` (wired, unlock_buy — slice 4); it no
     longer writes `.gold` raw, so the scanner reports it under the seam id. b420:
     the arm-gate is LIFTED (the pet EFFECT is server-owned now) — see the seam row
     above. The companion PROCS stay gated at rollProc, their own grant rows. */
  'src/legacy.js#repurchase': {
    kind: 'spend', status: 'deferred', blockedBy: B.BUYBACK_LEDGER,
  },

  // ══ TRANSFERS — value crossing to another player ══════════════════════════
  'src/features/clans.js#contribute': {
    kind: 'transfer', status: 'deferred', blockedBy: B.CLAN_DEPOSIT_GOLD,
    /* Finding #1's site. The whole contribute() path is behind CLAN_LAUNCHED, so
       the value-crossing debit cannot execute — the b378 clan-block. */
    flipGuard: { gated: 'CLAN_LAUNCHED' },
  },
  'src/features/muster.js#payChest': {
    kind: 'transfer', status: 'deferred',
    /* SERVER-CREDITED (2026-08-19-muster-raid-rpc-credit.sql). world_event_claim
       now credits v_gold/v_gems INTO player_state, atomically with consuming the
       once-per-day claim, and journals one player_ledger row. muster.js passes
       p_slot; the b411 entry-point defer is removed. payChest's local gold/gems
       write is now a DISPLAY prediction the server envelope reconciles (pre-arm it
       still credits locally; post-arm it no-ops via clientMayWriteRecordField and
       the server value arrives on the next envelope) — not a second record. */
    flipGuard: { serverCredits: 'world_event_claim (2026-08-19-muster-raid-rpc-credit.sql) '
      + 'credits gold+gems into player_state after the claim-consuming conditional update, '
      + 'once-per-day guard covers the credit, journalled to player_ledger kind=rally' },
    blockedBy: 'nothing for the VALUE — world_event_claim credits it server-side (see flipGuard). '
      + 'What keeps this row deferred rather than wired is that payChest\'s local gold/gems write is '
      + 'a DIRECT display write gated on clientMayWriteRecordField, not yet a HearthriseGold.settle '
      + 'prediction the envelope reconciles by key. Folding it onto the settle seam (or dropping the '
      + 'local write and rendering the returned amount) is the follow-up that makes it wired.',
  },
  'src/features/raids.js#grantReward': {
    kind: 'transfer', status: 'deferred',
    /* SERVER-CREDITED (2026-08-19-muster-raid-rpc-credit.sql). raid_claim now
       credits the chest gold/gems INTO player_state, atomically with consuming the
       once-per-week claim (clan: hr_hunt_tiers.chest_gold/gems × server v_scale;
       solo: the flat 2,800/5 × 0.4 constant pinned server-side), and journals one
       player_ledger row (kind=raid). raids.js passes p_slot through the single
       serverClaim() choke; the b411 entry-point defer is removed. grantReward's
       local gold/gems write is now a DISPLAY prediction reconciled by the server
       envelope, not a second record. */
    flipGuard: { serverCredits: 'raid_claim (2026-08-19-muster-raid-rpc-credit.sql) credits '
      + 'gold+gems into player_state after the raid_claims on-conflict-do-nothing guard, '
      + 'once-per-week PK covers the credit, journalled to player_ledger kind=raid' },
    blockedBy: 'nothing for the VALUE — raid_claim credits it server-side (see flipGuard). This row '
      + 'stays deferred (not wired) only because grantReward\'s local gold/gems write is a DIRECT '
      + 'display write gated on clientMayWriteRecordField, not yet a HearthriseGold.settle prediction '
      + 'the envelope reconciles by key. Same follow-up as muster payChest.',
  },
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
  'src/market.js#placeBuyOffer': {
    kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_BUY_OFFERS,
    flipGuard: { gated: 'serverMarketActive' },
  },
  'src/market.js#cancelBuyOffer': {
    kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_BUY_OFFERS,
    flipGuard: { gated: 'serverMarketActive' },
  },
  'src/market.js#autoMatchAgainstOffers': {
    kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_BUY_OFFERS,
    flipGuard: { gated: 'serverMarketActive' },
  },

  // ══ NOT BALANCES AT ALL ═══════════════════════════════════════════════════
  'src/features/daily-reward.js#rewardFor': {
    kind: 'false-positive', status: 'none',
    why: '`out.gold = p.gold` builds the reward DESCRIPTION handed to the renderer. No balance moves.',
  },
  'src/features/pet-session.js#recordProc': {
    kind: 'false-positive', status: 'none',
    why: '`a.gold += amount` accumulates a per-session PROC TALLY for the pet card. No balance moves.',
  },
});

/** Is this site one whose prediction a server envelope will actually settle? */
export function isWiredSite(id) {
  const row = Object.prototype.hasOwnProperty.call(GOLD_SITE_LEDGER, `seam:${id}`)
    ? GOLD_SITE_LEDGER[`seam:${id}`]
    : (Object.prototype.hasOwnProperty.call(GOLD_SITE_LEDGER, id) ? GOLD_SITE_LEDGER[id] : null);
  return !!(row && row.status === 'wired');
}

/** The census, as counts — for a report, and so a test can assert the shape did
 *  not quietly collapse to one bucket. Derived, never restated. */
export function goldSiteCensus() {
  const out = { total: 0, byKind: Object.create(null), byStatus: Object.create(null) };
  for (const row of Object.values(GOLD_SITE_LEDGER)) {
    out.total++;
    out.byKind[row.kind] = (out.byKind[row.kind] || 0) + 1;
    out.byStatus[row.status] = (out.byStatus[row.status] || 0) + 1;
  }
  return out;
}

if (typeof window !== 'undefined') {
  window.HearthriseGoldSites = {
    GOLD_SITE_LEDGER, KINDS, STATUSES, isWiredSite, goldSiteCensus, flipBehaviourOf, flipGuardOf,
  };
}
