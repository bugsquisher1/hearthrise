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
  ['accrue', 'set_activity', 'shop_buy', 'vendor_sell', 'unlock_buy',
    /* b366 — THE EQUIP VERB. Phase 2 of docs/design/live-settlement.md, and the
       gap that made the b362/b363 equip-dupe class possible at all: NOTHING
       told the server about a client equip, so its `player_inventory` row went
       on counting a copy the player was wearing and the b359 max handed that
       stale figure back into the bag. One verb closes it, because hr_apply's
       equip op is a TRANSFER (inventory -> equipment) and a transfer conserves.

       ONE verb for equip AND unequip: the two are the
       same operation on the same (slot -> item) map, distinguished by whether
       the value is a string or `null` — which is hr_apply's own vocabulary, not
       a mode flag invented at the wire. */
    'equip',
    /* MANUAL FOOD CONSUMPTION (2026-08-25, Paione P0). The wire carries an
       `item` NAME (`{verb:'eat',item:'turnip'}`) — the SAME field vendor_sell
       reads — and NOTHING ELSE. No heal amount, no qty, no hp: eat.js reads
       ITEMS[item].heals server-side and hr_apply credits `hp` (clamped to
       max_hp) and debits one unit under the row lock. Before this verb existed,
       `window.eatFood` debited G.inventory CLIENT-ONLY and sent no intent, so
       the absolute inventory reconcile RESTORED the eaten OWNABLE food on the
       next envelope — a free heal AND an effective dupe. See eat.js's header. */
    'eat',
    /* THE TROPHY CLAIM VERB (docs/design/BESTIARY_LADDER.md §4). The wire
       carries `{trophy:{monster, stage}}` and NOTHING ELSE — no kill count, no
       multiplier, no "earned" bit. hr_trophy_claim re-reads the kill total from
       `player_progress` inside its own transaction and refuses a stage the
       character has not reached; the two fields here NAME which trophy is being
       asked for and are both re-validated against the server's own catalogue.

       ⚠ IT MINTS NOTHING. No gold, no gems, no items, no XP — the power is
         DERIVED from the counters and is already on before the button is
         pressed. That is what makes the verb ranked-safe by construction rather
         than by a clamp: a forged or replayed claim cannot move a value that
         crosses into another player's economy, because it moves no value. */
    'trophy_claim',
    /* b564 — THE BULK SALE. `vendor_sell` for N stacks in ONE gesture: one rate
       token, one settle, one hr_apply. A separate verb rather than an array on
       `vendor_sell`, for the dispatch-table reason: a body field that changes WHAT the verb does is a typo away from a
       different intent. The wire carries `lines: [{item, qty}]` — NAMES and
       COUNTS, never a price (readLines). */
    'vendor_sell_many',
    /* HUNT SESSIONS (ruling HR-2026-10-14, lanes C2 / S1). `hunt_settle`
       carries the slot and nothing else, and runs the ONE hunt settle the world
       tick runs (./hunt-settle.js). Hunts are idle: no press verb. */
    'hunt_settle',
    /* THE CHARACTER SHEET (lane character-window, 2026-10-25). `sheet` carries
       the slot and nothing else: the engine computes the combat numbers from
       server state and stores them compare-and-set (./character-sheet.js). It
       moves no value. */
    'sheet']);
export const DEFAULT_VERB = 'accrue';

/* THE BODY CAP (Security, reopen review 2026-10-19). A player intent is read through the ONE bounded
   reader below and refused past MAX_INTENT_BYTES: no verb's body comes near it (the largest is a 64-line
   bulk sale, a few KB), and index.ts used to `req.json()` a body of any size. */
export const MAX_INTENT_BYTES = 65536;

/**
 * THE ONE BOUNDED READ of a request body (the player intent here, the world tick's body in ./tick.js):
 * its BYTES, or `null` past `limit` (a declared Content-Length over it is refused before a byte is read;
 * a streamed body is counted as it arrives and cancelled the moment it passes) or unreadable. A
 * Request-like without a stream falls back to the whole-body read, still bounded. Never throws.
 */
export async function readBodyBytes(req, limit) {
  const declared = Number(req.headers && req.headers.get ? req.headers.get('content-length') : NaN);
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!req.body || typeof req.body.getReader !== 'function') {
    try {
      if (typeof req.text === 'function') {
        const b = new TextEncoder().encode(await req.text());
        return b.byteLength > limit ? null : b;
      }
      if (typeof req.json === 'function') return new TextEncoder().encode(JSON.stringify(await req.json()));
      return null;
    } catch { return null; }
  }
  const reader = req.body.getReader();
  const chunks = [];
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > limit) { try { await reader.cancel(); } catch { /* closed */ } return null; }
      chunks.push(value);
    }
  } catch { return null; }
  const buf = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) { buf.set(c, at); at += c.byteLength; }
  return buf;
}

/** Bytes parsed as JSON; empty or unparseable is `{}` (parseIntent then refuses it field by field). */
export function bodyJson(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return {};
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return {}; }
}

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

/** The largest "make N" a bench run takes: player_state.active_left's CHECK (2026-12-01-bench-count.sql). */
export const BENCH_COUNT_MAX = 100000;

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

/** Canonical uuid, lowercase, dashed. Postgres would accept `{...}` and the
    undashed form too and normalise them on cast — which is exactly why this is
    strict: two spellings that mean one key are two chances for a caller to
    believe it has two keys. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The contract's key set, exported so a test reads it instead of restating it.
    A test that hard-codes the field list cannot notice a field being ADDED,
    which is the direction that matters. */
export const INTENT_KEYS = Object.freeze(
  ['slot', 'verb', 'intentId', 'activity', 'offer', 'item', 'qty',
    'equip', 'auto', 'trophy', 'lines'],
);

/** The stage ceiling a claim may NAME. Deliberately the parse-level bound only:
    which stage a character has actually REACHED is read by hr_trophy_claim from
    its own counters, and this number exists so an unbounded integer never
    reaches a `::int` cast. It mirrors TROPHY_STAGES.length in
    src/data/bestiary.js and tests/bestiary-trophy.mjs asserts the two agree
    rather than restating either — a parser that admitted stage 9 would turn a
    named refusal into an opaque one. */
export const MAX_TROPHY_STAGE_WIRE = 4;

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

/** How many LINES one `vendor_sell_many` may carry (b564).
    Not 200, although hr_apply takes `c_max_item_kinds = 200` item keys in one
    delta: the line count also sizes the journal row (`meta.lines`, one entry
    per line) and the request body, and a bag sweep is a gesture over what a
    player can SEE — 64 stacks is more than a full bag page. Stated as a literal
    for the MAX_EQUIP_OPS reason (the parser answers a SHAPE question without a
    catalogue); tests/vendor-sell-many.mjs asserts it stays ≤ hr_apply's bound
    by reading the migration, so the edge can never propose a delta the
    database refuses for its size. */
export const MAX_SELL_LINES = 64;

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
  out.equip = readEquip(body);
  out.auto = readAuto(body);
  out.trophy = readTrophy(body);
  out.lines = readLines(body);
  return out;
}

/**
 * THE BULK SALE'S WHOLE CALLER-SUPPLIED SURFACE: `lines: [{item, qty}]` (b564).
 *
 * ⚠ AND THERE IS NO PRICE ON IT, BY CONSTRUCTION. Each line is copied FIELD BY
 *   FIELD into a fresh null-prototype object holding exactly `item` and `qty`;
 *   a `unit`, `price` or `gold` key on a line is not refused, it is simply never
 *   read — it cannot reach vendor-sell.js because nothing here forwards it.
 *
 * WHOLE-ARRAY REFUSAL, like readEquip: a sweep is ONE gesture, and a half-
 * readable one ("these three stacks, and something") is not a smaller sale, it
 * is an unreadable request. So any of these makes the whole thing `null`, which
 * the verb refuses BY NAME as `bad_lines`:
 *   · not an array, empty, or longer than MAX_SELL_LINES
 *   · a line that is not a plain object
 *   · an item that is not a catalogue-shaped id (CATALOGUE_ID_RE)
 *   · a qty that readQty would refuse (a real JSON integer in [1, MAX_QTY])
 *   · THE SAME ITEM TWICE. hr_apply's delta is a MAP keyed by item, so two
 *     lines for one id would have to be merged — and a merge is the parser
 *     authoring a number the client did not send (and doubling past MAX_QTY
 *     without either line breaking the bound). The client sends one line per
 *     stack, so a duplicate is a malformed request, never a bigger sale.
 *
 * @returns a null-prototype-element array of `{item, qty}`, or `null`.
 *          NEVER partially populated.
 */
export function readLines(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.prototype.hasOwnProperty.call(body, 'lines')) return null;
  const a = body.lines;
  if (!Array.isArray(a) || a.length === 0 || a.length > MAX_SELL_LINES) return null;
  const seen = new Set();
  const out = [];
  for (const l of a) {
    if (!l || typeof l !== 'object' || Array.isArray(l)) return null;
    const item = ownString(l, 'item');
    if (item === null || !CATALOGUE_ID_RE.test(item)) return null;
    const qty = readQty(l);
    if (qty === null) return null;
    if (seen.has(item)) return null;
    seen.add(item);
    const line = Object.create(null);
    line.item = item;
    line.qty = qty;
    out.push(line);
  }
  return out;
}

/**
 * THE TROPHY CLAIM'S WHOLE CALLER-SUPPLIED SURFACE: `{ monster, stage }`.
 *
 * ⚠ AND THERE IS NO KILL COUNT ON IT, BY CONSTRUCTION. The claim RPC reads the
 *   kill total from `player_progress` inside its own transaction, under the
 *   advisory lock the spend RPCs take, and the signature it is called with has
 *   no parameter a count could travel on. So a forged count is not refused —
 *   it is unrepresentable, which is a stronger position than a clamp
 *   (docs/design/BESTIARY_LADDER.md §5). The two fields here NAME which trophy
 *   is being asked for and nothing else; both are re-validated server side
 *   against the server's own monster catalogue and its own counters.
 *
 * WHOLE-OBJECT REFUSAL, like readEquip: a claim is ONE gesture, and a
 * half-readable one ("this monster, some stage") is not a smaller claim, it is
 * an unreadable request.
 *
 * `stage` must be a whole number in 1..MAX_TROPHY_STAGE_WIRE. A float, a
 * numeric string or an out-of-range integer is the whole object refused — the
 * parser never rounds a client's number into range, because a rounded stage is
 * a claim for a trophy nobody asked for.
 *
 * @returns a null-prototype `{monster, stage}`, or `null` when absent or
 *          unreadable. NEVER partially populated.
 */
export function readTrophy(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.prototype.hasOwnProperty.call(body, 'trophy')) return null;
  const t = body.trophy;
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null;

  const monster = ownString(t, 'monster');
  if (monster === null || !CATALOGUE_ID_RE.test(monster)) return null;

  if (!Object.prototype.hasOwnProperty.call(t, 'stage')) return null;
  const stage = t.stage;
  if (typeof stage !== 'number' || !Number.isInteger(stage)) return null;
  if (stage < 1 || stage > MAX_TROPHY_STAGE_WIRE) return null;

  const out = Object.create(null);
  out.monster = monster;
  out.stage = stage;
  return out;
}

/**
 * WAS THIS CONSUMPTION FIRED BY A MACHINE? (2026-09-13, the buff emitter.)
 *
 * `true` ⇒ the auto-eater healed with this food and the player never chose it;
 * `false` (and ABSENT) ⇒ a human chose to consume this item. It exists for ONE
 * decision — whether the `eat` verb puts `buff_apply` in its delta — and it is
 * the only honest place to make it, because "was this a gesture or a heal?" is a
 * fact about the CLIENT and the server has no other way to know it.
 *
 * ── WHY A CLIENT FLAG IS SAFE HERE, STATED RATHER THAN ASSUMED ─────────────
 * It can only DECLINE a buff, never enlarge one. A forged `auto:true` refuses
 * the forger their own buff. A forged `auto:false` on an auto-eat grants a buff
 * the player could have had for free by clicking Eat on the same item they
 * already own — no new entitlement, no new item, and the queue's 60-minute cap
 * (c_buff_max_ms) bounds the stock either way. Nothing tradeable, rankable or
 * contributable moves, so CLAUDE.md's target property is untouched: a forged
 * value cannot cross into another player's economy or ranking.
 *
 * ── WHY THE DEFAULT IS "NOT AUTO" AND NOT THE OTHER WAY ROUND ─────────────
 * Absence must mean what a HUMAN eat means, because the manual Eat button is the
 * gesture this field was added for and a client that has not learned to send it
 * yet (a cached bundle) must still buff — the alternative is a feature that is
 * silently off for every stale tab. The dangerous direction is the other one:
 * auto-eat fires up to 20×/min, and a server that buffed on every one of those
 * would cap a 60-minute queue in ~90 s of fighting and then refuse
 * `buff_at_max` — which ROLLS BACK THE DEBIT and restocks the food, i.e. the
 * b467 "food I eat comes back" P0. So the party that fires 20×/min is the party
 * that must say so, and legacy.js's auto-eat seam does (`{auto:true}`).
 *
 * STRICTLY BOOLEAN. A string "true", a 1, an object — none of them are a
 * boolean, and a truthiness read would let `auto: "false"` mean auto. Anything
 * that is not `true` is not auto.
 */
export function readAuto(body) {
  if (!body || typeof body !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(body, 'auto') && body.auto === true;
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
 * The activity DECLARATION. Two strings, both allowlisted, nothing else (the
 * hunt's stance and stop orders left with the away model, lane C2).
 *
 * Returns null when the body did not carry a readable one. It deliberately does
 * NOT enforce the (kind ⇔ id) pairing rule or the "is this kind payable" rule:
 * both of those are answers the intent layer must give BY NAME, and a parser
 * that collapses them into `null` would turn "you cannot fish yet" into
 * "malformed request".
 *
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
  /* "MAKE N" (2026-12-01-bench-count.sql): an optional whole number of actions. ABSENT is
     `undefined` (run until the bag is out); present but not a whole number 1..BENCH_COUNT_MAX
     is `null`, which the intent layer refuses BY NAME rather than silently running unbounded. */
  if (Object.prototype.hasOwnProperty.call(a, 'count')) {
    const c = a.count;
    out.count = (Number.isInteger(c) && c >= 1 && c <= BENCH_COUNT_MAX) ? c : null;
  }

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
