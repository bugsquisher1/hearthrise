// ============================================================================
// supabase/functions/hr-accrue/request.js — THE ONLY READER OF THE REQUEST BODY.
//
// The accrual engine's entire client-authored surface is this file. Everything
// else the grant depends on — the clock, the cap, the equipment, the levels, the
// activity, the watermark, the seed — is read from a server table inside the
// same transaction.
//
// ── WHY IT IS ITS OWN MODULE (review: "the shape guards assert the wrong
//    thing") ────────────────────────────────────────────────────────────────
// tests/accrual-engine.mjs proves that hostile keys are inert **on the engine's
// input object** — but nobody ever hands the engine an object. The attacker
// hands an HTTP BODY to a Deno function that cannot be imported into Node, so
// the one surface that is actually reachable was the one surface with no
// executable test. Pulling the body reader out into a pure ESM module fixes that
// by construction: the exact function the shell calls is the function the test
// calls, in plain Node, with genuinely hostile bodies.
//
// ── THE RULE THIS ENFORCES ─────────────────────────────────────────────────
// `parseIntent` returns a FRESHLY CONSTRUCTED, NULL-PROTOTYPE object containing
// exactly the fields named in this file. It is not a filtered copy of the body
// and it is not the body with extra keys deleted — both of those are one careless
// edit away from passing something through. There is no path by which an
// unlisted key survives, because no unlisted key is ever read.
//
// ── THE CLIENT'S ENTIRE VOCABULARY (b345; +3 for the gold verbs, +1 for the
//    grant verb) ───────────────────────────────────────────────────────────
// Eight fields, and every one of them is a NAME, a SELECTOR or a COUNT — never
// a value that any progression number is computed from:
//
//   slot      an integer in [0, MAX_SLOT], selecting a row the caller owns
//   verb      one of VERBS, naming WHICH intent this is
//   intentId  a canonical uuid, the caller's idempotency key
//   activity  { kind, id } — a DECLARATION of what the player says they are
//             doing. The server looks that pair up in its own catalogue; the
//             client never sends a rate, a yield, a tick count or a span.
//   offer    a SHOP OFFER ID (`equip.iron_sword`). The server looks the PRICE
//             up in its own copy of the price catalogue.
//   item      an ITEM ID (`normal_log`). Same rule: the vendor's bid is
//             computed server-side from the item's own book value.
//   qty       a COUNT OF SERVER-PRICED ACTIONS. Bounded, integer, and never
//             defaulted — see readQty for why this one is strict where readSlot
//             is tolerant.
//   reward    { kind, key } — WHICH claimable the player is claiming (b349).
//             A NAME, in two allowlisted strings.
//   listing   a market listing's uuid. A SELECTOR for a row the server owns —
//             the server reads the item, the price, the seller and the escrow
//             off it and the request has no field for any of them.
//   ask       ⚠ THE ONE PRICE FIELD IN THIS FILE. See the block below.
//
// ⚠ THERE IS NO `period` FIELD, AND ITS ABSENCE IS THE WHOLE DESIGN. A daily
//   reward is worth something exactly once per UTC day, and the thing that
//   decides which day it is must be the SERVER's clock — CLAUDE.md, in as many
//   words: "not a timestamp (use now())". So the period key is derived inside
//   the intent from the `now()` the read statement returns, it is what lands in
//   `player_progress.period_key` and in `journal.intent`, and there is no field
//   here through which a client could name yesterday. Adding one would make
//   "claim every day since launch" a single loop.
//
// ⚠ THERE IS STILL NO `price`, `cost`, `gold`, `total` OR `unit` FIELD, AND
//   THERE NEVER WILL BE. `qty` is the ONLY number the client contributes to a
//   value transfer, it is bounded before it is used, and the thing it
//   multiplies came out of src/data. That is the whole of the client's
//   arithmetic authority over the economy.
//
// ⚠ …AND THEN THERE IS `ask`, WHICH IS A PRICE, AND WHICH IS NOT AN EXCEPTION
//   TO THE SENTENCE ABOVE SO MUCH AS THE ONE PLACE THE SENTENCE HAS TO BE READ
//   CAREFULLY. The argument is 2026-08-17-market-v2.sql's, §"THE ONE
//   UNCOMFORTABLE FIELD", and it is repeated here rather than cross-referenced
//   because the header a reader trusts is the one in the file they are reading:
//     · A MARKET EXISTS TO LET A SELLER NAME A PRICE. There is no server-side
//       answer to "what is this worth" that is not a price control.
//     · It is authored about the seller's OWN goods and, the moment it is
//       accepted, it becomes SERVER STATE. THE BUYER NEVER SUPPLIES A PRICE —
//       `market_buy`'s wire is (listing, qty) and has no field for one;
//       hr_market_buy reads `ask_each` off the listing row it locked. So no
//       client value crosses to another player: the seller's number crosses to
//       the SERVER, and the server's copy is what the buyer transacts against.
//     · It cannot mint. The trade conserves gold (buyer −gross, seller +net,
//       tax burned) and the buyer's balance is checked under the lock.
//   It is bounded HERE anyway — a positive integer in [1, MAX_ASK] — for the
//   reason `qty` is: an unbounded number that reaches a multiply is an overflow,
//   and an overflow inside a value transfer is a 500 in the middle of one. The
//   server re-checks the same bound and the PRODUCT bound this parser cannot
//   state (it does not know the qty and the ask belong to one listing yet).
//
// PURE ESM, no I/O, no globals. Runs in Node and Deno unchanged.
// ============================================================================

/** The character slot bound. 0..5 inclusive — SIX slots.
    This constant exists because the previous shell's comment said "0…4" while
    the code, and `player_state`'s CHECK constraint, both said 0..5. A comment
    that disagrees with a constraint is a trap for the next reader, so the bound
    is now a named value that the test asserts against the migration. */
export const MAX_SLOT = 5;

/** THE VERB ALLOWLIST. An absent verb means `accrue`, because that is what the
    deployed client posts (`{slot}` and nothing else) and a deploy that stopped
    understanding the live client would take away time off every player at once.
    An UNKNOWN verb is a hard `null` — never defaulted to `accrue`. A typo that
    silently performs a different intent than the one asked for is the worst
    possible failure of a dispatch table. */
export const VERBS = Object.freeze(
  ['accrue', 'set_activity', 'shop_buy', 'vendor_sell', 'claim_reward', 'unlock_buy',
    /* b355 — THE MARKET VERBS. Three, not one, and deliberately not collapsed
       into a single `market` verb with a `mode` field: the three do different
       things to different rows, and a dispatch table whose branch is a body
       field is a dispatch table one typo away from performing a different
       intent than the one asked for (the same reason an unknown verb is a hard
       null below). */
    'market_list', 'market_cancel', 'market_buy',
    /* b366 — THE EQUIP VERB. Phase 2 of docs/design/live-settlement.md, and the
       gap that made the b362/b363 equip-dupe class possible at all: NOTHING
       told the server about a client equip, so its `player_inventory` row went
       on counting a copy the player was wearing and the b359 max handed that
       stale figure back into the bag. One verb closes it, because hr_apply's
       equip op is a TRANSFER (inventory -> equipment) and a transfer conserves.

       ONE verb for equip AND unequip, unlike the market's three. The market's
       three touch DIFFERENT ROWS with different authorities; these two are the
       same operation on the same (slot -> item) map, distinguished by whether
       the value is a string or `null` — which is hr_apply's own vocabulary, not
       a mode flag invented at the wire. */
    'equip',
    /* ELEMENTS/ENCHANTING v1 — a CLONE of `equip`, the second verb that must
       collect before it acts. The wire carries a slot NAME and a rune item NAME
       ({slot:'weapon', rune:'ember_rune'}); the server resolves the rune to an
       ELEMENT (hr_runes), checks the weapon slot holds a weapon, debits the rune
       and sets the server-owned enchant state. The client never sends an
       element, a magnitude or a success bit. */
    'enchant',
    /* MANUAL FOOD CONSUMPTION (2026-08-25, Paione P0). The wire carries an
       `item` NAME (`{verb:'eat',item:'turnip'}`) — the SAME field vendor_sell
       reads — and NOTHING ELSE. No heal amount, no qty, no hp: eat.js reads
       ITEMS[item].heals server-side and hr_apply credits `hp` (clamped to
       max_hp) and debits one unit under the row lock. Before this verb existed,
       `window.eatFood` debited G.inventory CLIENT-ONLY and sent no intent, so
       the absolute inventory reconcile RESTORED the eaten OWNABLE food on the
       next envelope — a free heal AND an effective dupe. See eat.js's header. */
    'eat',
    /* THE DUNGEON SETTLE VERB (dungeon-settlement.md §2). The wire carries a
       `dungeon` object {id, mode, quality} and NOTHING ELSE — no loot id, no
       quantity, no scrip amount, no key. hr_dungeon_settle consumes the entry
       key, rolls loot from the server catalogue with the seeded PRNG, and credits
       scrip into player_state.dungeon_scrip; the client renders the returned
       envelope. Before this verb, scrip + run loot were minted CLIENT-only and
       BLOB_RETIRED wiped them on reload (the "dungeon scrip goes to 0" P1). */
    'dungeon_settle',
    /* THE QUARTERMASTER BUY VERB (dungeon-settlement.md §4, increment 3). The wire
       carries an `offer` id (`qm.<item>`, the dotted <namespace>.<row> shape) and
       NOTHING ELSE — no item, no qty, no price, no scrip amount. hr_quartermaster_buy
       prices it from the client-unwritable hr_qm_offers, debits scrip and grants the
       item in ONE transaction. Before this verb the Quartermaster was a client trade
       the settle envelope half-undid (the b372 "get the scrip back" bug). */
    'quartermaster_buy']);
export const DEFAULT_VERB = 'accrue';

/** The catalogue's activity vocabulary — the `kind` column of `hr_activities`
    plus the idle sentinel. This is the PARSE-level allowlist and is deliberately
    WIDER than the set the intent will act on: a `gather` declaration must reach
    the intent layer so it can be refused by NAME (`activity_unsupported`)
    instead of being mistaken for a malformed request. */
export const ACTIVITY_KINDS = Object.freeze(['idle', 'combat', 'gather', 'artisan']);

/** Catalogue ids are generated from src/data/*.js by tools/gen-catalogues.mjs
    and every one of them matches this. Bounded on purpose: an id is a lookup
    key, and an unbounded string reaching a `::text` comparison is a free way to
    make the server do work proportional to the request body.

    ONE definition, two names. Activity ids, item ids and gathering-node ids all
    have this shape (verified against all 426 items and all 344 activities), and
    two regexes that agree today are two regexes. `ACTIVITY_ID_RE` is kept
    because it is the name the activity intent and its guards already use. */
export const CATALOGUE_ID_RE = /^[a-z0-9_]{1,64}$/;
export const ACTIVITY_ID_RE = CATALOGUE_ID_RE;

/** A SHOP OFFER id — `equip.bronze_sword`, `room.cellar.3`. Dotted, because the
    generator builds it as `<table>.<row>`; bounded to four segments and 64
    characters for the same reason as above. Verified against all 128 authored
    offer ids. Deliberately a SEPARATE pattern from CATALOGUE_ID_RE rather than
    a widening of it: an item id must never be able to spell an offer id. */
export const OFFER_ID_RE = /^[a-z0-9_]{1,40}(?:\.[a-z0-9_]{1,40}){1,3}$/;

/** The largest count one tap may name.
    A quantity is a COUNT OF SERVER-PRICED ACTIONS, never a value (request.js's
    own header, "if a future intent needs to name a quantity"). It still gets a
    bound, because the server multiplies by it: 1,000 x the dearest gold offer
    (2,000g) is 2,000,000 — comfortably inside hr_apply's 50,000,000 per-call
    gold clamp, which tests/gold-intents.mjs asserts by reading BOTH numbers
    rather than by restating either. A sell large enough to breach the clamp
    (1,000 x a 270,000g platebody) is refused BY NAME by hr_apply and applies
    nothing; that is measured, not assumed. */
export const MAX_QTY = 1000;

/** The `kind` column of `player_progress`, which is where a claim's bookkeeping
    row lands. Deliberately the table's OWN CHECK list — a kind this parser
    admitted but the table rejected would surface as an opaque 23514 from deep
    inside hr_apply instead of as a named refusal one round trip earlier. */
export const REWARD_KINDS = Object.freeze(['quest', 'daily', 'bounty', 'stat', 'collection', 'flag']);

/** THE SAME REGEXP OBJECT as ACTIVITY_ID_RE, not a second literal that looks
    like it. A reward key and an activity id are the same shape of thing — a
    bounded lookup token — and two identical regexes in one file are two regexes
    that can be edited apart. */
export const REWARD_KEY_RE = ACTIVITY_ID_RE;

/** Canonical uuid, lowercase, dashed. Postgres would accept `{...}` and the
    undashed form too and normalise them on cast — which is exactly why this is
    strict: two spellings that mean one key are two chances for a caller to
    believe it has two keys. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The contract's key set, exported so a test reads it instead of restating it.
    A test that hard-codes the field list cannot notice a field being ADDED,
    which is the direction that matters. */
export const INTENT_KEYS = Object.freeze(
  ['slot', 'verb', 'intentId', 'activity', 'offer', 'item', 'qty', 'reward',
    'listing', 'ask', 'equip', 'enchant', 'dungeon'],
);

/** The dungeon-run modes the settle RPC understands. Parse-level allowlist,
    deliberately the SAME set hr_dungeon_settle enforces; an unknown mode is
    null here and answered `bad_mode` by the intent layer. */
export const DUNGEON_MODES = Object.freeze(['auto', 'manual', 'scavenger']);

/** An equip-slot name. The SAME bounded shape as a catalogue id and
    deliberately NOT allowlisted here against EQUIP_SLOTS: `hr_equip_slots` is
    the authority and the intent layer must be able to answer
    `unknown_equip_slot` BY NAME, which a parser that collapsed it into `null`
    would turn into "malformed request" (the readActivity rule, applied again). */
export const EQUIP_SLOT_RE = /^[a-z0-9_]{1,32}$/;

/** How many slot operations ONE equip call may carry.
    Not 1, because "wear this loadout" is a real gesture and fifteen round trips
    for it is fifteen chances to half-apply a set. Not unbounded, because every
    op is a row lock inside one hr_apply. 15 is EQUIP_SLOTS.length — a call that
    names more slots than a character HAS is naming a slot twice or naming one
    that does not exist, and both are refusals. Stated as a literal rather than
    imported because request.js is the outermost layer and must not depend on a
    catalogue to answer a SHAPE question; hr_apply's own `c_max_equip_kinds` is
    the authoritative bound and is checked under the lock. */
export const MAX_EQUIP_OPS = 15;

/** The largest ask a seller may name, per unit. THE SAME NUMBER the migration's
 *  `ask_each` CHECK constraint carries (1e9), stated here so a listing that the
 *  database would refuse is refused one round trip earlier and by name. Two
 *  copies of a bound is a drift risk and it is taken deliberately: the parser
 *  cannot read a CHECK constraint, and a parser that admitted 1e18 would hand
 *  `bad_price` back to every honest client that fat-fingered a price. */
export const MAX_ASK = 1000000000;

/**
 * Read the intent out of a parsed request body.
 *
 * @param body  whatever `await req.json()` produced. May be anything at all:
 *              null, a string, an array, a number, an object with a poisoned
 *              `__proto__`, an object with two hundred keys. All of them are
 *              the same amount of authority: none.
 * @returns { slot, verb, intentId, activity } — a null-prototype object built
 *          field by field by the readers below. `verb` is null ONLY when the
 *          body named one this build does not implement; `intentId` and
 *          `activity` are null whenever they were absent or unreadable.
 */
export function parseIntent(body) {
  const out = Object.create(null);
  out.slot = readSlot(body);
  out.verb = readVerb(body);
  out.intentId = readIntentId(body);
  out.activity = readActivity(body);
  out.offer = readOffer(body);
  out.item = readItem(body);
  out.qty = readQty(body);
  out.reward = readReward(body);
  out.listing = readListing(body);
  out.ask = readAsk(body);
  out.equip = readEquip(body);
  out.enchant = readEnchant(body);
  out.dungeon = readDungeon(body);
  return out;
}

/**
 * THE DUNGEON RUN DECLARATION. `{ id, mode, quality }`.
 *
 * `id` is a dungeon id (a NAME — the server looks its req level, cooldown, entry
 * key, scrip base and loot table up in the client-unwritable hr_dungeons). `mode`
 * is one of DUNGEON_MODES (auto|manual|scavenger). `quality` is the client's
 * reported clear fraction — the ONE client-authored number this verb carries, and
 * it is CLAMPED to [0,1] server-side and scales SELF-ONLY scrip, never loot. No
 * loot id, no quantity, no chance, no key and no scrip amount cross: those are all
 * server-owned (dungeon-settlement.md §2 anti-forgery).
 *
 * FIELD-WISE null, like readActivity: an unreadable field is null and the intent
 * layer names which one (`unknown_dungeon` / `bad_mode`) rather than collapsing
 * the whole gesture into "malformed request". `quality` is a REAL finite number
 * or null (a NaN/Infinity/string is null → the server coalesces null to a full
 * clear); the server clamps whatever survives to [0,1], so no bound is enforced
 * here beyond "it is a usable number".
 *
 * @returns a null-prototype `{ id, mode, quality }`, or null when the `dungeon`
 *          field was absent or not an object.
 */
export function readDungeon(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.prototype.hasOwnProperty.call(body, 'dungeon')) return null;
  const d = body.dungeon;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;

  const idRaw = ownString(d, 'id');
  const modeRaw = ownString(d, 'mode');
  let quality = null;
  if (Object.prototype.hasOwnProperty.call(d, 'quality')) {
    const q = d.quality;
    if (typeof q === 'number' && Number.isFinite(q)) quality = q;
  }

  const out = Object.create(null);
  out.id = (idRaw !== null && CATALOGUE_ID_RE.test(idRaw)) ? idRaw : null;
  out.mode = (modeRaw !== null && DUNGEON_MODES.includes(modeRaw)) ? modeRaw : null;
  out.quality = quality;
  return out;
}

/**
 * THE ENCHANT DECLARATION (ELEMENTS/ENCHANTING v1). `{ slot, rune }`.
 *
 * TWO strings, both bounded, and NOTHING ELSE — no element, no magnitude, no
 * success bit. `slot` is an equip-slot name; `rune` is an item id. The server
 * resolves the rune to its element from hr_runes and decides whether the slot
 * may be enchanted; there is nothing else a client could truthfully contribute.
 *
 * FIELD-WISE null, like `readActivity` and unlike `readEquip`: an enchant has
 * two independent facts and the intent layer must be able to answer
 * `wrong_slot` (bad slot) and `unknown_item` (bad rune) apart. An unreadable
 * field is null and the intent layer names which one, rather than collapsing the
 * whole gesture into "malformed request".
 *
 * @returns a null-prototype `{ slot: string|null, rune: string|null }`, or null
 *          when the `enchant` field was absent or not an object.
 */
export function readEnchant(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.prototype.hasOwnProperty.call(body, 'enchant')) return null;
  const e = body.enchant;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;

  const slotRaw = ownString(e, 'slot');
  const runeRaw = ownString(e, 'rune');

  const out = Object.create(null);
  out.slot = (slotRaw !== null && EQUIP_SLOT_RE.test(slotRaw)) ? slotRaw : null;
  out.rune = (runeRaw !== null && CATALOGUE_ID_RE.test(runeRaw)) ? runeRaw : null;
  return out;
}

/**
 * THE EQUIP OPERATIONS. `{ "<equipSlot>": "<itemId>" | null }`.
 *
 * A string VALUE means "wear this"; `null` means "take off whatever is there".
 * That is hr_apply's own vocabulary (its equip block branches on
 * `jsonb_typeof(v) = 'null'`), so the wire says the same thing the authority
 * says, in the same words, with no translation layer to get backwards.
 *
 * ⚠ NO QUANTITY, NO PRICE, NO STAT, NO SOURCE SLOT. An equip moves exactly one
 *   unit and the server decides where it came from — the player's own
 *   `player_inventory` row, debited under a lock. There is nothing else a
 *   client could truthfully contribute and every field it might send would be
 *   a number the server would then have to disbelieve.
 *
 * WHOLE-OBJECT REFUSAL, unlike readActivity's field-wise null. A malformed
 * activity has two independent fields and the intent layer must be able to tell
 * "unknown kind" and "unknown id" apart. An equip map is ONE gesture: if any pair in
 * it is unreadable the gesture is unreadable, and half-applying a loadout
 * because one slot name had a capital letter is exactly the kind of partial
 * write this contract exists to make impossible.
 *
 * @returns a null-prototype `{slot: itemId|null}`, or `null` when absent or
 *          unreadable. NEVER a partially-populated map.
 */
export function readEquip(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.prototype.hasOwnProperty.call(body, 'equip')) return null;
  const e = body.equip;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;

  /* OWN keys only. `Object.keys` already excludes inherited ones, but a body
     parsed from JSON can carry a literal `"__proto__"` OWN key, which is why
     the map being built is null-prototype and the write below is unconditional
     rather than an assignment onto a plain object. */
  const keys = Object.keys(e);
  if (keys.length === 0 || keys.length > MAX_EQUIP_OPS) return null;

  const out = Object.create(null);
  for (const k of keys) {
    if (!EQUIP_SLOT_RE.test(k)) return null;
    const v = e[k];
    if (v === null) { out[k] = null; continue; }
    if (typeof v !== 'string' || !CATALOGUE_ID_RE.test(v)) return null;
    out[k] = v;
  }
  return out;
}

/**
 * WHICH LISTING. A canonical uuid and nothing else — the same strictness, and
 * the same reason, as `readIntentId`: Postgres would accept `{…}` and the
 * undashed form too and normalise them on cast, and two spellings of one row id
 * are two chances for a caller to believe it named two different listings.
 *
 * It does NOT check that the listing exists, is open, or belongs to anyone: all
 * three are answers the RPC gives BY NAME under the lock (`gone`, `not_yours`,
 * `expired`), and a parser that collapsed them into null would report
 * "malformed request" for "somebody bought it first".
 */
export function readListing(body) {
  const s = ownString(body, 'listing');
  if (s === null || s.length !== 36) return null;
  const low = s.toLowerCase();
  return UUID_RE.test(low) ? low : null;
}

/**
 * THE ASK, PER UNIT. See the header block for why a price is readable here at
 * all and why that is not a hole.
 *
 * STRICT, exactly as `readQty` is strict and for the identical reason: a server
 * that GUESSES a price has authored a number the player did not ask for, in
 * both directions. An own property, a real JSON number (never a numeric string
 * — `Number("1e9")` is a thousand-fold fat finger that parses), an integer, and
 * inside [1, MAX_ASK]. Everything else is `null`, which market.js refuses BY
 * NAME as `bad_ask` before any database work.
 */
export function readAsk(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.prototype.hasOwnProperty.call(body, 'ask')) return null;
  const v = body.ask;
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) return null;
  return v >= 1 && v <= MAX_ASK ? v : null;
}

/** An own string property, or null. The one place a raw body value is read. */
function ownString(body, key) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.prototype.hasOwnProperty.call(body, key)) return null;
  const v = body[key];
  return typeof v === 'string' ? v : null;
}

/**
 * The verb. Absent ⇒ DEFAULT_VERB (the live client). Unknown ⇒ null, which the
 * shell answers with `unknown_verb`, NOT by falling back to accrue.
 */
export function readVerb(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return DEFAULT_VERB;
  if (!Object.prototype.hasOwnProperty.call(body, 'verb')) return DEFAULT_VERB;
  const v = body.verb;
  if (typeof v !== 'string') return null;
  return VERBS.includes(v) ? v : null;
}

/**
 * The idempotency key. CLIENT-CHOSEN, and that is a deliberate decision with a
 * named residual — see supabase/functions/hr-accrue/intents.js §"THE KEY".
 * Anything that is not a canonical uuid is null, and a null key is refused
 * (`missing_intent_id`) rather than replaced with one the server invented: a
 * server-invented key makes every retry a NEW intent, which is the opposite of
 * idempotence.
 */
export function readIntentId(body) {
  const s = ownString(body, 'intentId');
  if (s === null || s.length !== 36) return null;
  const low = s.toLowerCase();
  return UUID_RE.test(low) ? low : null;
}

/**
 * The activity DECLARATION. Two strings, both allowlisted, nothing else.
 *
 * Returns null when the body did not carry a readable one. It deliberately does
 * NOT enforce the (kind ⇔ id) pairing rule or the "is this kind payable" rule:
 * both of those are answers the intent layer must give BY NAME, and a parser
 * that collapses them into `null` would turn "you cannot fish yet" into
 * "malformed request".
 */
export function readActivity(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.prototype.hasOwnProperty.call(body, 'activity')) return null;
  const a = body.activity;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;

  const kindRaw = ownString(a, 'kind');
  const idRaw = ownString(a, 'id');

  const out = Object.create(null);
  out.kind = (kindRaw !== null && ACTIVITY_KINDS.includes(kindRaw)) ? kindRaw : null;
  out.id = (idRaw !== null && ACTIVITY_ID_RE.test(idRaw)) ? idRaw : null;
  return out;
}

/**
 * The SHOP OFFER a `shop_buy` names. A NAME, never a price.
 *
 * Returns null when absent or unreadable. It does NOT check the offer against
 * the catalogue — that answer has to be given BY NAME by the intent layer
 * (`unknown_offer` vs `offer_unsupported`), and a parser that collapsed the two
 * into `null` would report "malformed request" for "this build cannot sell you
 * a subscription".
 */
export function readOffer(body) {
  const s = ownString(body, 'offer');
  if (s === null || s.length > 64) return null;
  return OFFER_ID_RE.test(s) ? s : null;
}

/**
 * The ITEM a `vendor_sell` names. Same rule: a name, never a price, and the
 * catalogue answer belongs to the intent layer.
 */
export function readItem(body) {
  const s = ownString(body, 'item');
  return s !== null && CATALOGUE_ID_RE.test(s) ? s : null;
}

/**
 * The COUNT. Deliberately STRICT where `readSlot` is tolerant, and the
 * difference is not inconsistency — it is what the two values do.
 *
 * A bad slot selects a row the caller already owns, so coercing it to 0 costs a
 * confused client one wasted call. A quantity MULTIPLIES A VALUE TRANSFER. A
 * server that guesses one has authored a number the player did not ask for, in
 * both directions: default-to-1 sells one item when the player meant a hundred,
 * and `Number("1e3")` sells a thousand when they typed nonsense. So: an own
 * property, a real JSON number (never a numeric string — JSON has numbers, and
 * accepting both spellings is two ways to say one thing), an integer, and
 * inside [1, MAX_QTY]. Everything else is `null`, which the intent layer
 * refuses BY NAME as `bad_qty` rather than replacing with a guess.
 */
export function readQty(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.prototype.hasOwnProperty.call(body, 'qty')) return null;
  const v = body.qty;
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) return null;
  return v >= 1 && v <= MAX_QTY ? v : null;
}

/**
 * WHICH CLAIMABLE (b349). Two strings, both allowlisted, nothing else — and
 * conspicuously NO period and NO amount. See the header.
 *
 * Returns null when the body carried no readable one. Like `readActivity` it
 * deliberately does NOT answer "is this claimable known" or "can the server
 * pay it yet": those are answers the intent layer must give BY NAME
 * (`unknown_reward` / `reward_unavailable`), and a parser that collapsed them
 * into null would turn "the server does not track your Renown yet" into
 * "malformed request".
 */
export function readReward(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.prototype.hasOwnProperty.call(body, 'reward')) return null;
  const r = body.reward;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;

  const kindRaw = ownString(r, 'kind');
  const keyRaw = ownString(r, 'key');

  const out = Object.create(null);
  out.kind = (kindRaw !== null && REWARD_KINDS.includes(kindRaw)) ? kindRaw : null;
  out.key = (keyRaw !== null && REWARD_KEY_RE.test(keyRaw)) ? keyRaw : null;
  return out;
}

/**
 * The slot, and nothing else.
 *
 * Deliberately TOLERANT rather than rejecting: a bad slot is not an attack
 * surface (it selects a row the caller already owns, and hr_state_of returns
 * `no_character` for a slot they do not have), so coercing to 0 costs a
 * confused client one wasted call instead of an error taxonomy entry. What it
 * must never do is let a non-integer or an out-of-range value reach a `::int`
 * cast in Postgres.
 */
export function readSlot(body) {
  /* `typeof body === 'object'` excludes strings — `'abc'.slot` is undefined but
     `'abc'[0]` is not, and a future field read by index would then be reachable
     from a string body. Arrays are excluded for the same reason. */
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 0;
  /* Own-property only. A body of `{"__proto__":{"slot":5}}` produces an own
     "__proto__" data property under JSON.parse rather than a prototype write,
     but `Object.prototype.hasOwnProperty.call` also defends the case where the
     caller of this module built the object some other way. */
  if (!Object.prototype.hasOwnProperty.call(body, 'slot')) return 0;
  const n = Number(body.slot);
  return Number.isInteger(n) && n >= 0 && n <= MAX_SLOT ? n : 0;
}
