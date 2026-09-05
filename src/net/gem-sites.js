// ============================================================================
// src/net/gem-sites.js — THE GEM SITE LEDGER.
//
// Every place in this client that moves the PREMIUM balance, named, with the
// server verb that owns it or the dependency that blocks one.
// `tests/gem-site-census.mjs` derives the site list from the SOURCE and fails
// the build on any site that is not in here, on any row here that no longer
// exists, and — the rule this file was written for — on any unwired grant or
// spend that does not carry a REAL arm check in the code.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// src/net/gold-sites.js has done this job for GOLD since b3xx and it works. It
// scans `.gold`. It has never been able to see a single gem movement, in any
// file, and nothing else was watching either — so when b500 swept the
// "optimistic-apply, swallowed-rejection" class it fixed `buyBankSpaceGold` and
// walked straight past `buyBankSpaceGem` two functions below it, plus `buyTheme`
// and `buyCosmetic`. Three premium purchases, client-authored, under a green
// suite, for the whole life of the gems arm.
//
// The lesson is not "we missed three". It is that **the census was
// currency-shaped and only one currency had one.** This is the other one.
//
// ── WHY AN UNDECLARED GEM SITE IS WORSE THAN AN UNDECLARED GOLD SITE ────────
// Gold's flip is still gated; `gems` is ARMED TODAY. It sits on
// SERVER_OF_RECORD (src/net/record.js) with no dormant `armed()` gate, and
// accrue.js applyEnvelopeState writes it ABSOLUTELY:
//
//     if (Number.isFinite(Number(st.gems))) G.gems = Number(st.gems);
//
// So a client-authored gem movement is not "wrong on flip day". It is wrong on
// EVERY envelope, right now, in a direction that depends only on its sign:
//
//   a GRANT  the player watches gems arrive and vanish — and if the grant
//            CONSUMED something (redeemHearthToken burns the IAP-only bond) the
//            consume is local and does NOT come back. That is real loss.
//   a SPEND  the player is REFUNDED and KEEPS WHAT THEY BOUGHT, because the
//            things gems buy (`ownedThemes`, `ownedCosmetics`, `bank.gemBuys`,
//            `heroSlotsUnlocked`) are residue or client-preserved counters, not
//            record fields the envelope can take back. The purchase becomes
//            free and repeatable. This is the b371 dupe, named in
//            src/multi-character.js's own header, and it was live at three more
//            sites than anyone had counted.
//
// ── THE STATUSES ────────────────────────────────────────────────────────────
//   'wired'    routes through a live server verb; the row names it and L4
//              checks the server really implements it.
//   'deferred' has no server story TODAY, and `blockedBy` says exactly what
//              would give it one. "Not yet" without a named dependency is
//              indistinguishable from "forgotten" — which is literally how the
//              three purchase twins shipped.
//   'none'     will never have a verb, and `why` says what makes it exempt.
//
// ── `armGuard` — THE ONE FIELD THAT MATTERS ─────────────────────────────────
// Every `deferred` row whose kind is `spend` or `grant` must carry
// `armGuard: { gated: '<token>' }`, and the census SOURCE-PROBES it: the token
// has to appear as real, comment-stripped code inside the gating function's
// body. `where` names a different function to probe when the check honestly
// lives in the caller (exactly one row needs it, and it says why).
//
// This is the field that would have caught all three bugs on the day they were
// written, and it is the field that stops them coming back.
//
// ── WHAT THIS FILE IS NOT ───────────────────────────────────────────────────
// It is not a switch and it is not a policy. Nothing here decides whether a
// call goes out. It is a census: it can only be true or stale, and the guard
// exists so it cannot be stale in silence.
// ============================================================================

export const KINDS = Object.freeze([
  'grant',           // gems appear and land on the player
  'spend',           // gems leave the player for a sink
  'dev',             // a developer faucet. Must never acquire a server path.
  'server',          // the value already came from the server
  'seam',            // a shared payment choke point
  'init',            // a default/normalisation, not a movement
  'rollback',        // undoing this client's own optimistic write
  'migration',       // a save-blob field, not the live balance
  'false-positive',  // the scanner matched a `.gems` that is not the balance
]);

export const STATUSES = Object.freeze(['wired', 'deferred', 'none']);

/* ══════════════════════════════════════════════════════════════════════════
   THE SERVER STORY EVERY DEFERRED PURCHASE ROW IS WAITING ON
   ══════════════════════════════════════════════════════════════════════════
   Stated ONCE, here, rather than restated in four `blockedBy` strings that
   would drift apart. Every gem PURCHASE row below points at this constant.

   THE OBVIOUS FIX DOES NOT EXIST. Routing these through
   `window.HearthriseGold.buyUnlock`, the way b500 routed `buyBankSpaceGold`,
   was the first thing tried and it is structurally impossible — not a missing
   row, a missing COLUMN:

     · supabase/functions/hr-accrue/unlock-catalogue.js
       `SELLABLE_NAMESPACES = ['room','property']` refuses `theme` and
       `cosmetic` BY NAME, and its own comment gives the reason: they are
       "priced in gems, Bounty Marks (no server column at all) or real money".
     · The GENERATED catalogue agrees, because it is generated from that same
       predicate: 2026-08-16-unlock-offers.generated.sql carries every
       `theme.*` and `cosmetic.*` row with `gold = null` and
       `refusal = 'namespace_unsupported:<ns>'`.
     · `public.hr_unlock_offers` HAS A GOLD COLUMN AND NO OTHER. That sentence
       is not an inference — 2026-09-08-hero-slot-buy.sql's header states it in
       those words, and it is the entire reason the hero slot needed a verb of
       its own instead of a catalogue row.
     · `src/data/gold-ladders.js` publishes `bank.<n>` for the GOLD rung only.
       There has never been a gem rung offer to point at.

   So `buyUnlock('theme.forest')` answers 409 `offer_unsupported`, forever, and
   wiring it would turn a silent exploit into a permanently dead button.

   WHAT THE SERVER HALF ACTUALLY IS: a gem-priced purchase verb in the shape
   `hr_buy_hero_slot` already established (2026-09-08-hero-slot-buy.sql) —
   catalogue-driven, price read under an advisory lock, gems debited from
   player_state and the unlock row written in ONE transaction, plus an
   `hr_state_of` projection of the owned set so `ownsGemUnlock` has a server
   answer to prefer. It is a MONEY SURFACE, so it is Security's call and it is
   REVIEW-ONLY; this client does not invent one. Until it lands, every row
   below refuses honestly rather than paying with a number the envelope will
   take back — which is exactly what multi-character.js `serverBuySlot` already
   does while `hr_buy_hero_slot` is unapplied. */
/* ⚠⚠ THE ONE WAY THAT MIGRATION CAN GO CATASTROPHICALLY WRONG, STATED HERE SO
   IT IS READ BEFORE IT IS WRITTEN RATHER THAN AFTER.

   `ownsGemUnlock` prefers the server's set THE MOMENT ONE EXISTS. That is the
   correct authority direction and it is what makes a forged residue entry worth
   nothing. It also means the projection going live is a CLIFF: on the first
   envelope that carries `gem_unlocks`, every theme and cosmetic that is not in
   the server's rows stops being owned — instantly, for everybody, including
   every player who paid real gems for one before the record armed. Their
   purchase is in the residue and nowhere else, because until now the residue was
   the only place a purchase was ever written.

   So the migration MUST seed the unlock rows from the existing
   `client_state.ownedThemes` / `ownedCosmetics` BEFORE (or in the same
   transaction as) it starts projecting the set. This is not a nicety and it is
   not the client's job — the client cannot tell "the server has not answered"
   from "the server answered and says you own nothing", and it deliberately
   fails toward the player on the first (`serverSlots()` returning null → residue
   answers) precisely because that is the only ambiguity it can see.

   The precedent is written and reviewed: 2026-09-08-hero-slot-buy.sql §3 treats
   "a character already exists at slot N" as ownership for exactly this reason,
   and its own header calls that the GRANDFATHER note. Do the same here.

   Note the wipe does NOT excuse it. The beta wipe removes the obligation to
   grandfather BETA purchases; it does not remove the obligation to think about
   it, and a projection shipped without a seeding step will do the same thing to
   post-wipe players the first time it is redeployed. */
export const GEM_GRANDFATHER_PRECONDITION =
  '⚠ HARD PRECONDITION: the migration must SEED the server unlock rows from the existing '
  + 'client_state ownedThemes/ownedCosmetics before it begins projecting the owned set. '
  + 'ownsGemUnlock prefers the server the moment a projection exists, so an unseeded rollout '
  + 'silently de-owns every theme and cosmetic every player has already bought. See the '
  + 'GRANDFATHER note in 2026-09-08-hero-slot-buy.sql §3 for the reviewed precedent.';

export const GEM_PURCHASE_BLOCKER =
  'a gem-priced purchase verb (the hr_buy_hero_slot shape: server-side price, gems debited from '
  + 'player_state and the unlock row written in one transaction, plus an hr_state_of projection of '
  + 'the owned set). hr_unlock_buy CANNOT serve it — hr_unlock_offers has a gold column and no '
  + 'other, and unlock-catalogue.js refuses the theme/cosmetic namespaces by name. REVIEW-ONLY: it '
  + 'is a money surface and needs Security before authority moves. '
  + GEM_GRANDFATHER_PRECONDITION;

export const GEM_SITE_LEDGER = Object.freeze([
  /* ── THE THREE PURCHASE TWINS b500 MISSED ──────────────────────────────── */
  {
    id: 'src/legacy.js#buyBankSpaceGem',
    kind: 'spend', status: 'deferred',
    armGuard: { gated: 'gemSpendIsClientAuthored' },
    blockedBy: GEM_PURCHASE_BLOCKER + ' Additionally there is no `bank.gem.<n>` rung in '
      + 'src/data/gold-ladders.js at all — the gold ladder is gold-only — so even the offer id this '
      + 'would name does not exist yet.',
    why: 'THE GEM TWIN OF THE b500 BANK FIX. buyBankSpaceGold two functions above was moved onto '
      + 'HearthriseGold.buyUnlock and advances only on a server ok; this half kept doing '
      + '`G.gems -= cost; G.bank.gemBuys++` with no server call of any kind. Under the armed record '
      + 'the rung was granted and the gems came back. Now refuses under the arm.',
  },
  {
    id: 'src/legacy.js#buyTheme',
    kind: 'spend', status: 'deferred',
    armGuard: { gated: 'gemSpendIsClientAuthored' },
    blockedBy: GEM_PURCHASE_BLOCKER,
    why: '`G.gems -= t.price` then `G.ownedThemes.push(id)`. gems are record (refunded by the next '
      + 'envelope); ownedThemes is RESIDUE (persists). Free theme, repeatable. ⚠ THE FREE DEFAULT '
      + 'IS NOT IN THIS ROW AND MUST NOT BECOME ONE: `theme.default` is `currency !== "gem"`, price '
      + '0, and stays a FREE EQUIP — the unlock catalogue warns that a zero-priced offer is an '
      + 'infinite faucet, so it must never be turned into a bought unlock.',
  },
  {
    id: 'src/legacy.js#buyCosmetic',
    kind: 'spend', status: 'deferred',
    armGuard: { gated: 'gemSpendIsClientAuthored' },
    blockedBy: GEM_PURCHASE_BLOCKER,
    why: 'Was ONE line and every part of it was a client-authored premium purchase: '
      + '`G.gems -= price; G.ownedCosmetics.push(id)`. The push was not even deduplicated, so a '
      + 'second buy appended the same id again and grew the residue without bound. Both fixed.',
  },

  /* ── THE FOURTH TWIN, FOUND IN THE SAME SWEEP, POINTING THE OTHER WAY ──── */
  {
    id: 'src/legacy.js#redeemHearthToken',
    kind: 'grant', status: 'deferred',
    armGuard: { gated: 'gemSpendIsClientAuthored' },
    blockedBy: 'an `hr_redeem_token`-shaped verb — the same migration as the purchase twins. It '
      + 'must consume the token and credit the gems in ONE server transaction; a client that does '
      + 'either half alone can only lose value for the player.',
    why: 'THE ONLY SITE IN THIS CLASS THAT COSTS THE PLAYER RATHER THAN THE HOUSE. It burns a '
      + 'hearth_token — the IAP-only bond, the most valuable object in the game — with a local '
      + 'removeItem, then credits 150 gems the next envelope erases. The inventory absolute arm is '
      + 'dormant, so the token does not come back either. Net: the bond is destroyed for nothing. '
      + 'Refuses under the arm, because keeping the token is the only non-lossy outcome available '
      + 'to a client that cannot record the trade.',
  },

  /* ── THE FIFTH: THE HERO SLOT. ALREADY CORRECT — KEPT SO IT STAYS THAT WAY ── */
  {
    id: 'src/multi-character.js#unlockSlot',
    kind: 'spend', status: 'deferred',
    armGuard: { gated: 'clientMayWriteRecordField', where: 'buySlot' },
    blockedBy: 'supabase/migrations/2026-09-08-hero-slot-buy.sql — WRITTEN, REVIEW-ONLY, NOT '
      + 'APPLIED. The client half already landed: buySlot() forks to serverBuySlot() and '
      + 'goal-claim.js buyHeroSlot() calls hr_buy_hero_slot, which answers `rpc_missing` until the '
      + 'migration is applied.',
    why: 'THE ROW THAT PROVES THE `where` FIELD EARNS ITS KEEP. The debit is here, in unlockSlot, '
      + 'and the arm check is in its ONLY caller, buySlot — deliberately: that module\'s header '
      + 'calls unlockSlot "the PRE-ARM path and only the pre-arm path" and says "Do NOT wire a new '
      + 'caller to this". Probing unlockSlot\'s own body would report a false RED on correct code; '
      + 'probing nothing would let the whole class through. So the row names the caller and the '
      + 'census verifies THAT body instead. ⚠ If a second caller is ever added, this row becomes a '
      + 'lie and nothing will catch it — which is why the module says not to.',
  },

  /* ── GRANTS: value appears. All four already gated, all four deferred ──── */
  {
    id: 'src/legacy.js#grant',
    kind: 'grant', status: 'deferred',
    armGuard: { gated: 'clientMayWriteRecordField' },
    blockedBy: 'a server-side IAP receipt verb. A purchase made with real money is the platform\'s '
      + 'authority, not ours, and it must be credited from a verified receipt rather than from the '
      + 'client that claims to have made it.',
    why: 'The IAP product grant (`p.gems`). Already fail-closed behind the record seam, so under '
      + 'the arm it grants nothing rather than granting something the envelope erases — but that '
      + 'means a real-money gem pack currently cannot land at all without the verb.',
  },
  {
    id: 'src/features/collection-log.js#msGrantLocally',
    kind: 'grant', status: 'deferred',
    armGuard: { gated: 'msMayWrite' },
    blockedBy: 'nothing for the VALUE — hr_claim_milestone already credits gold+gems server-side '
      + '(see the matching gold-sites.js row). This local write is the switch-OFF display path and '
      + 'retires with the flag, not with a new verb.',
    why: 'Collection-milestone reward. Gated per field, so under the arm the server number is the '
      + 'only one that lands.',
  },
  {
    id: 'src/features/renown.js#grantLocally',
    kind: 'grant', status: 'deferred',
    armGuard: { gated: 'mayWrite' },
    blockedBy: 'nothing for the VALUE — hr_claim_rank credits gold+gems server-side. This is the '
      + 'switch-OFF display path.',
    why: 'Renown-rank reward. Same shape and same gate as the collection milestone.',
  },
  {
    id: 'src/features/muster.js#payChest',
    kind: 'grant', status: 'deferred',
    armGuard: { gated: '_mayGems' },
    blockedBy: 'world_event_claim crediting gems into player_state atomically with consuming the '
      + 'claim — the same deferral the gold half of this exact function carries in gold-sites.js.',
    why: 'The daily muster chest. The gem half of a payout whose gold half is already catalogued; '
      + 'listing only one of them is how a reader concludes the other is safe.',
  },
  {
    id: 'src/features/raids.js#grantReward',
    kind: 'grant', status: 'deferred',
    armGuard: { gated: '_mayGems' },
    blockedBy: 'the raid/hunt claim RPC crediting chest gold+gems into player_state atomically with '
      + 'the raid_claims once-guard — again the twin of the gold row already in gold-sites.js.',
    why: 'Weekly raid / clan-hunt chest.',
  },
  {
    id: 'src/legacy.js#claimQuestReward',
    kind: 'grant', status: 'deferred',
    armGuard: { gated: 'clientMayWriteRecordField' },
    blockedBy: 'nothing — hr_claim_goal already pays this server-side. The local branch is the '
      + 'switch-OFF fallback and is unreachable while any reward field is armed (the guard above it '
      + 'routes the WHOLE claim to the server if gold, gems, xp OR items are record-owned).',
    why: 'Daily/weekly quest reward. The strongest gate in this file: it does not gate the gem '
      + 'write, it gates the entire claim path.',
  },

  /* ── NOT MOVEMENTS ─────────────────────────────────────────────────────── */
  {
    id: 'src/legacy.js#goldSettleCurrency',
    kind: 'seam', status: 'none',
    why: 'THE shared gold+gems choke point (`if(gems) G.gems = (G.gems||0) + gems`). It THROWS if '
      + 'server accrual is on and src/net/gold.js did not load, so it cannot silently author a '
      + 'balance; with the module present it delegates to HearthriseGold.settleCurrency, which '
      + 'records a PREDICTION the envelope retires. The accounting is the seam itself. Owned by '
      + 'gold-sites.js as `seam:*`; carried here so a reader of the gem census is not left to '
      + 'wonder whether the choke point was overlooked.',
  },
  {
    id: 'src/legacy.js#loadLocal',
    kind: 'init', status: 'none',
    why: '`G.gems = G.gems || 0` — a default so the topbar has a number to render, and it is '
      + 'already behind clientMayWriteRecordField so under the arm it does not even do that '
      + '(balance.js renders a pending glyph instead). Normalisation, not a movement: it can only '
      + 'ever write the value that is already there.',
  },
  {
    id: 'src/multi-character.js#unlockSlot@2',
    kind: 'rollback', status: 'none',
    why: '`G.gems = prevGems` — the b371 atomicity rollback, undoing this client\'s OWN optimistic '
      + 'debit when the write did not become durable. It restores a value it captured itself and '
      + 'can never move gems net-positive. Removing it would be the bug.',
  },
  {
    id: 'src/net/gold.js#reconcilePredictions',
    kind: 'server', status: 'none',
    why: 'THE ABSOLUTE WRITE. `if (Number.isFinite(Number(st.gems))) G.gems = Number(st.gems)` — '
      + 'the envelope\'s own value landing on the client. This is not a site to be wired; it is the '
      + 'mechanism every other row in this file is measured against, and it is the reason an '
      + 'undeclared spend is refunded rather than merely untidy.',
  },
  {
    id: 'src/save-migrations.js#apply',
    kind: 'migration', status: 'none',
    why: '`save.gems = Math.max(0, Math.floor(save.gems))` — a SANITISER on the save BLOB, not the '
      + 'live balance, and it can only clamp downward toward a non-negative integer. Under '
      + 'BLOB_RETIRED the blob is not read for authority at all.',
  },
  {
    id: 'src/save-migrations.js#apply@2',
    kind: 'migration', status: 'none',
    why: 'The `else save.gems = 0` half of the same sanitiser: a save with a non-numeric gems field '
      + 'is normalised to zero rather than left to poison a toLocaleString. Same blob, same '
      + 'reasoning.',
  },
  {
    id: 'src/features/daily-reward.js#rewardFor',
    kind: 'false-positive', status: 'none',
    why: 'NOT A BALANCE. `out.gems = p.gems` builds the reward DESCRIPTOR the sheet renders; `out` '
      + 'is a local object literal that never touches G. The scanner matches any receiver on '
      + 'purpose (narrowing to `G` would miss `window.G.gems` and every alias), so a row like this '
      + 'is the expected cost of that choice and is cheaper than the miss.',
  },

  /* ── DEV FAUCETS. These must NEVER acquire a server path. ───────────────── */
  {
    id: 'src/admin.js#addGems',
    kind: 'dev', status: 'none',
    why: 'The admin console faucet. A dev sink is ERASED by the next envelope and that is CORRECT — '
      + 'it must not survive one. Giving this a server verb would be building the exploit the whole '
      + 'server-authority program exists to remove.',
  },
  {
    id: 'src/legacy.js#testerBoost',
    kind: 'dev', status: 'none',
    why: 'The tester boost (`G.gems += 200` inside a bundle of gold/marks/items/xp). Same standing '
      + 'as admin.js#addGems: erased by the next envelope, and it must stay that way.',
  },
]);

/** Rows by id — a convenience for readers, never a switch. */
export function gemSiteById(id) {
  return GEM_SITE_LEDGER.find((r) => r.id === id) || null;
}
