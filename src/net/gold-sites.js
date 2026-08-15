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

/* ── THE NAMED BLOCKERS ─────────────────────────────────────────────────────
   Spelled once, so twenty rows blocked on one thing all say the same words and
   a reader can count them. */
const B = Object.freeze({
  MARKET_V2: 'market-v2 (market_list / market_cancel / market_buy). Applied to production: NO — '
    + 'queried directly 2026-08-14 and absent. b340 moved the client onto RPCs that are not there '
    + 'yet, which is correct sequencing and means every market gold site is still client-authored.',
  UNLOCK_BUY: '`unlock_buy` — the verb for "gold buys a RUNG, not an item". Unlocks are '
    + '`player_progress` rows with kind=\'unlock\', deliberately absent from hr_apply\'s delta '
    + 'allowlist so the additive merge structurally cannot reach a rung. In flight, other agent.',
  CLAN_DEPOSIT_GOLD: '`clan_deposit_gold`. `clan_deposit` exists for ITEMS (2026-08-08-clan-seat.sql) '
    + 'and has the whole pattern — server catalogue, server clock, per-call and per-day clamps off '
    + 'an append-only ledger. Gold needs the same shape and does not have it. Blocked with market-v2 '
    + 'on `player_inventory` holding real rows.',
  LIVE_ACTION_INTENTS: 'live-action intents. This fires inside the loop the server already '
    + 'simulates (`computeAccrual`), so it does not want a verb — it wants the accrual engine to '
    + 'pay it, and this client site is DELETED when live actions move server-side.',
  DAILY_COUNTERS: 'server-side daily/quest progress counters (Designer ruling 3.1: CUTOVER-'
    + 'BLOCKING). The goals read `stats.*` out of the client save; nothing writes a '
    + '`player_progress` row for any of them, so `claim_reward` answers `reward_unavailable`.',
  MARKS_COLUMN: '`player_state.marks`. A bounty turn-in pays gold AND Bounty Marks; Marks have no '
    + 'server column at all, so paying the gold half alone would silently drop the rest — worse '
    + 'than refusing. The turn-in is also kill-driven, so part of it belongs to accrual.',
  COLLECTION_MODEL: 'a server collection model. Eligibility tests how many of 31 monsters and 426 '
    + 'items the character has EVER seen; the server records neither.',
  RENOWN_MODEL: 'server-side Renown. `effectiveRenown(G)` is computed entirely from the client save '
    + 'and has no column, table or RPC.',
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
  'seam:vendor.sell_one': {
    kind: 'vendor', status: 'wired', verb: 'vendor_sell',
    site: 'src/legacy.js invSellOne() — the bag\'s Sell 1',
  },
  'seam:vendor.sell_all': {
    kind: 'vendor', status: 'wired', verb: 'vendor_sell',
    site: 'src/legacy.js invSellAll() — the bag\'s Sell All (one item id, whole stack)',
    note: 'A stack above MAX_QTY (1,000) has no server story and is refused LOCALLY by name '
      + '(`qty_out_of_range`) instead of burning a rate slot to be told `bad_qty`.',
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

  // ══ THE PAYMENT PATH ITSELF ═══════════════════════════════════════════════
  'src/net/gold.js#settle': {
    kind: 'seam', status: 'none',
    why: 'THE choke point. Switch OFF this is `G.gold += amount` and nothing else; switch ON it '
      + 'also records the amount as a prediction keyed to the intent that is about to go out.',
  },
  'src/net/gold.js#rollbackPrediction': {
    kind: 'seam', status: 'none',
    why: 'The inverse of a prediction whose server counterpart provably never happened — a refusal '
      + 'carrying no envelope, i.e. refused on shape or before any database work.',
  },
  'src/net/gold.js#applyGoldEnvelope': {
    kind: 'seam', status: 'none',
    why: 'Re-adds predictions the arriving envelope PREDATES. The envelope itself is applied '
      + 'absolutely by accrue.js\'s applyEnvelopeState; this line is display-only carry-over for '
      + 'gestures still in flight.',
  },
  'src/legacy.js#goldSettle': {
    kind: 'seam', status: 'none',
    why: 'The fail-loud fallback. legacy.js is a classic script and cannot import ESM, so it '
      + 'reaches the seam through `window.HearthriseGold`. If that module did not load AND the '
      + 'switch is ON this THROWS rather than quietly paying a client-authored number — the same '
      + 'discipline as the b340 record strip. With the switch off it is the pre-seam expression.',
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
    kind: 'grant', status: 'deferred', blockedBy: B.COLLECTION_MODEL,
    site: 'claim_reward {kind:"collection", key:"milestone"} — registry row exists, status blocked',
  },
  'src/features/companions.js#rollProc': {
    kind: 'grant', status: 'deferred', blockedBy: B.LIVE_ACTION_INTENTS,
    site: 'companion gold proc, inside killMonster',
  },
  'src/features/companions.js#rollProc@2': {
    kind: 'grant', status: 'deferred', blockedBy: B.LIVE_ACTION_INTENTS,
    site: 'companion extraGold proc, inside killMonster',
  },
  'src/features/renown.js#claimRank': {
    kind: 'grant', status: 'deferred', blockedBy: B.RENOWN_MODEL,
    site: 'claim_reward {kind:"flag", key:"renown_rank"} — registry row exists, status blocked',
  },
  'src/legacy.js#grant': {
    kind: 'grant', status: 'deferred', blockedBy: B.IAP_RECEIPT,
    site: 'the IAP entitlement grant',
  },
  'src/legacy.js#completeBounty': {
    kind: 'grant', status: 'deferred', blockedBy: B.MARKS_COLUMN,
    site: 'claim_reward {kind:"bounty", key:"turnin"} — registry row exists, status blocked',
  },
  'src/legacy.js#updateDaily': {
    kind: 'grant', status: 'deferred', blockedBy: B.DAILY_COUNTERS,
    site: 'the daily-task payout',
  },
  'src/legacy.js#completeQuest': {
    kind: 'grant', status: 'deferred', blockedBy: B.DAILY_COUNTERS,
    site: 'the quest payout',
  },
  'src/legacy.js#claimQuestReward': {
    kind: 'grant', status: 'deferred', blockedBy: B.DAILY_COUNTERS,
    site: 'claim_reward {kind:"daily", key:"goal"} and {kind:"quest", key:"weekly"} — both registry '
      + 'rows exist, both status blocked',
  },

  // ══ SPENDS WITH NO VERB YET ═══════════════════════════════════════════════
  'src/dungeon-scavenger.js#startScavengerRun': {
    kind: 'spend', status: 'deferred', blockedBy: B.DUNGEON_ENTRY,
  },
  'src/dungeons.js#runDungeon': { kind: 'spend', status: 'deferred', blockedBy: B.DUNGEON_ENTRY },
  'src/dungeons.js#startManualRun': { kind: 'spend', status: 'deferred', blockedBy: B.DUNGEON_ENTRY },
  'src/features/homestead.js#upgradeProperty': {
    kind: 'spend', status: 'deferred', blockedBy: B.UNLOCK_BUY,
  },
  'src/features/workers.js#hire': { kind: 'spend', status: 'deferred', blockedBy: B.UNLOCK_BUY },
  'src/legacy.js#buyBankSpaceGold': {
    kind: 'spend', status: 'deferred', blockedBy: B.DERIVED_PRICE,
    site: 'DERIVED_PRICES id `bank.gold`',
  },
  'src/legacy.js#upgradeRoom': { kind: 'spend', status: 'deferred', blockedBy: B.UNLOCK_BUY },
  'src/legacy.js#buildPlot': { kind: 'spend', status: 'deferred', blockedBy: B.UNLOCK_BUY },
  'src/legacy.js#buyTheme': { kind: 'spend', status: 'deferred', blockedBy: B.UNLOCK_BUY },
  'src/legacy.js#buyTrait': { kind: 'spend', status: 'deferred', blockedBy: B.UNLOCK_BUY },
  'src/legacy.js#_buyCompanion': { kind: 'spend', status: 'deferred', blockedBy: B.UNLOCK_BUY },
  'src/legacy.js#repurchase': {
    kind: 'spend', status: 'deferred', blockedBy: B.BUYBACK_LEDGER,
  },

  // ══ TRANSFERS — value crossing to another player ══════════════════════════
  'src/features/clans.js#contribute': {
    kind: 'transfer', status: 'deferred', blockedBy: B.CLAN_DEPOSIT_GOLD,
  },
  'src/features/muster.js#payChest': {
    kind: 'transfer', status: 'deferred',
    blockedBy: 'nothing here — the VALUE is already decided by a SECURITY DEFINER RPC, so this is '
      + 'pure bookkeeping and belongs INSIDE that RPC (the 2026-08-15 ruling: rules => Edge, '
      + 'bookkeeping => database function). Clan/raid domain, separate owner. It must NOT be '
      + 're-priced by a verb that would second-guess a number the database already fixed.',
  },
  'src/features/raids.js#grantReward': {
    kind: 'transfer', status: 'deferred',
    blockedBy: 'same as muster payChest — server-priced already; belongs in the raid RPC.',
  },
  'src/market.js#collectSaleProceeds': { kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_V2 },
  'src/market.js#revertBuy': { kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_V2 },
  'src/market.js#buyListing': { kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_V2 },
  'src/market.js#buyAggregated': { kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_V2 },
  'src/market.js#placeBuyOffer': { kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_V2 },
  'src/market.js#cancelBuyOffer': { kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_V2 },
  'src/market.js#autoMatchAgainstOffers': { kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_V2 },

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
  window.HearthriseGoldSites = { GOLD_SITE_LEDGER, KINDS, STATUSES, isWiredSite, goldSiteCensus };
}
