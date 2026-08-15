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
// ── THE CLIENT'S ENTIRE VOCABULARY (b345) ──────────────────────────────────
// Four fields, and every one of them is a NAME or a SELECTOR — never a value
// that any progression number is computed from:
//
//   slot      an integer in [0, MAX_SLOT], selecting a row the caller owns
//   verb      one of VERBS, naming WHICH intent this is
//   intentId  a canonical uuid, the caller's idempotency key
//   activity  { kind, id } — a DECLARATION of what the player says they are
//             doing. The server looks that pair up in its own catalogue; the
//             client never sends a rate, a yield, a tick count or a span.
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
// If a future intent needs to name a quantity (craft 5 planks), that quantity
// is a COUNT OF SERVER-PRICED ACTIONS, not a value — and it gets its own
// bounded reader here, beside the others, never a passthrough.
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
export const VERBS = Object.freeze(['accrue', 'set_activity', 'claim_reward']);
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
    make the server do work proportional to the request body. */
export const ACTIVITY_ID_RE = /^[a-z0-9_]{1,64}$/;

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
export const INTENT_KEYS = Object.freeze(['slot', 'verb', 'intentId', 'activity', 'reward']);

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
  out.reward = readReward(body);
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
