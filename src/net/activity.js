// ============================================================================
// src/net/activity.js — THE CLIENT HALF OF THE ACTIVITY INTENT (b347).
//
// The server half has been live since b346: `set_activity`, its migration
// applied, Security's two blocking conditions landed and proven against
// production. THE CONTRACT IS NOT RESTATED HERE — it is
// supabase/functions/hr-accrue/intents.js §"THE CLIENT SEAM", and it is precise.
// This file is what that section specifies, and where the two could disagree
// the comment says which line of it is being obeyed.
//
//   POST <SUPABASE_URL>/functions/v1/hr-accrue
//     Authorization: Bearer <user JWT>     ← the ONLY identity. There is no
//                                            user field and no way for one
//                                            player to name another.
//     {"verb":"set_activity","slot":N,"intentId":"<uuid>",
//      "activity":{"kind":"combat","id":"goblin"}}
//     STOP is the same call with {"kind":"idle","id":null}.
//
// An ABSENT `verb` still means `accrue`, so the deployed src/net/accrue.js is
// untouched by this and the two need no coordinated deploy.
//
// ── THE FOUR RULES, AND WHICH FUNCTION HOLDS EACH ──────────────────────────
//
// 1. ONE KEY PER PLAYER GESTURE — **except that a REJECTED intent is retried
//    with a NEW key.** `nextIntentKey()`. This is the rule the whole review
//    turned on and the one a client can get wrong in a way that produces a
//    silent 25-hour outage rather than an error: `hr_apply` records the
//    DECISION — success or rejection — under the key, outside the protected
//    block, so it survives the rollback and is handed back to every later call
//    presenting that key. Measured against production and rolled back: the same
//    delta with the same correct version answered `version_conflict, replayed`
//    on the reused key and `ok:true` on a fresh one. Only an UNANSWERED call —
//    a timeout, an aborted fetch, a dropped socket — reuses the key, because
//    that is the one case where the client genuinely does not know whether the
//    intent landed, and reuse is what makes THAT retry safe.
//
// 2. THE SAME KILL SWITCH AS ACCRUAL. `isServerAccrualEnabled()`, imported, not
//    re-read. Two switches would produce a state where the client starts
//    activities the server never hears about, or accrues against a pointer it
//    never set — and "which half is on" is not a question anybody should have to
//    ask during an incident.
//
// 3. FIRE AND RECONCILE, NEVER AWAIT-THEN-RENDER. The caller moves the local
//    pointer immediately (an idle game must feel instant) and this module
//    reconciles it to the envelope. The prediction is DISPLAY-ONLY. On a refusal
//    the pointer goes back to what the SERVER says — never to what the client
//    guessed. When the refusal carries no envelope (four codes, all refused on
//    shape or before any database work) nothing was written, so the LAST
//    envelope this module saw is still the server's answer and is what it
//    reconciles to.
//
// 4. ⚠ A SWITCH PAYS. The collect runs first (contract rule 3: an intent must
//    collect before it switches, or the elapsed window is CONFISCATED), so a
//    successful switch returns a `collected` receipt with real gold, XP, items
//    and level-ups. Discard it and those numbers appear out of nowhere at the
//    next hr_load. It goes through `applyEnvelopeState` + `summaryFromAway` —
//    the SAME two functions the away card is built on — and lands in
//    `G.lastOfflineSummary`, which every welcome-back surface already reads.
//    There is no second renderer.
//
//    AND `collected` IS PRESENT ON A REFUSED SWITCH TOO. The collect and the
//    switch are two applies; a refused switch does not roll the payment back.
//    The player was paid and did not switch, and both halves are rendered.
//
// ── WHAT THE CLIENT MAY SEND ───────────────────────────────────────────────
// A verb, a key, a slot, and a DECLARATION. Never a computed value — not a
// yield, not a rate, not a tick count, not a span, not a timestamp. The body is
// CONSTRUCTED field by field (accrue.js's rule): a body assembled by spreading
// is a body a future field rides into.
//
// DOM-free apart from the replacement sheet it delegates to accrue.js.
// Node-importable. No fetch seam — `fetch` resolves at call time, so a test's
// override IS the transport, and the suite asserts the literal bytes.
// ============================================================================

import {
  isServerAccrualEnabled, resolveActiveSlot, accrueEndpoint, MAX_SLOT,
  applyEnvelopeState, summaryFromAway, describeReplacement,
  isReplacementAcknowledged, showReplacementSheet, beginServerAccrual,
  isReconcilePending,
} from './accrue.js?v=491';
/* THE PAYABLE-BENCH PREDICATE, read — never restated. `benchPayable` lives in
   src/core/artisan-sim.js and is the SAME function the accrual engine's
   `computeAccrual` and the intent's shape check read, so the client, the engine
   and the intent cannot disagree about which benches exist tonight. Precedent:
   src/net/gold.js already imports src/data/shops.js for exactly this reason. */
import { ARTISAN_RECIPES } from '../data/recipes.js?v=491';
import { indexArtisanRecipes, recipePayable } from '../core/artisan-sim.js?v=491';

export const ACTIVITY_VERB = 'set_activity';

/* Built once at module scope, null-prototype (see `indexArtisanRecipes`): the
   id shape /^[a-z0-9_]{1,64}$/ spells `constructor`, and a truthy miss on a
   plain object would reach `.recipe`. */
const ARTISAN_INDEX = indexArtisanRecipes(ARTISAN_RECIPES);

/** The kinds this client is allowed to DECLARE. Mirrors the server's
 *  `SETTABLE_KINDS` (supabase/functions/hr-accrue/set-activity.js), which is
 *  itself derived from `PAYABLE_KINDS` — the kinds the accrual engine can price.
 *
 *  ⚠ THIS LIST AND THE SERVER'S ARE ONE CONTRACT IN TWO FILES, and b348 is the
 *    bill for treating them as two. The server widened `PAYABLE_KINDS` to
 *    include `gather` and `SETTABLE_KINDS` grew with it in one edit, exactly as
 *    designed — and this list did not, so `startSkill` declared nothing, the
 *    server sat on `idle` through a real woodcutting session, and the first
 *    switch-on test died in minutes with `player_intents` empty and
 *    `player_state.version` still 0. Nothing was wrong on either side; the two
 *    sides simply never had to agree.
 *
 *    They do now: `tests/activity-seam.mjs` reads the server's list, this list
 *    and the CALL SITES in src/legacy.js, and fails the build when a kind
 *    exists in one and not the others. Widening this is still a decision — but
 *    it can no longer be a forgotten one.
 *
 *  `artisan` JOINED on 2026-08-16 (b356) — 290 of the 344 catalogue rows, and
 *  the engine prices 261 of them. The other 29 are the COOKING bench, which is
 *  held back by a property rather than by its name: `noBurn`'s Kitchen rung is
 *  READ from server state but still WRITTEN by the client (`upgradeRoom` in
 *  src/legacy.js), so the server could burn what the player's Cast-Iron Range
 *  protects. That exclusion is per-RECIPE, not per-kind, and it lives in
 *  `declarationFor` below — see `benchPayable` in src/core/artisan-sim.js. */
export const ACTIVITY_KINDS = Object.freeze(['combat', 'gather', 'artisan', 'idle']);

/** Every kind the GAME can actually be doing — the server's whole vocabulary,
 *  not the payable subset. The difference between this and `ACTIVITY_KINDS` is
 *  the set of activities that exist and cannot yet be declared, and that
 *  difference has to be REPRESENTED rather than dropped. See `declarationFor`. */
export const GAME_ACTIVITY_KINDS = Object.freeze(['combat', 'gather', 'artisan', 'idle']);

/* One in flight at a time, and the newest declaration wins. THE REASON IS
   ARITHMETIC, not politeness: three taps in three seconds sent in parallel race
   three collects on one watermark, and two of them come back replayed or
   conflicted. Coalesced, the first call's collect prices the span that actually
   elapsed under the old activity and the coalesced one prices a span of
   milliseconds — which classifies `below_min_span`, i.e. "nothing owed", i.e.
   safe to switch. The intermediate declaration is never sent because the player
   was never really doing it. */
let inFlight = null;
let queued = null;
let config = null;
let last = null;
let lastServerActivity = null;   // the newest activity the SERVER has stated
/* b372 (F18): the in-flight fight that came WITH `lastServerActivity`. Held
   beside it, never merged into it, because the two answer different questions —
   "what is this character doing" and "how far through the current foe" — and a
   pointer with a fight glued to it would leak a combat-only field into the
   gather and idle branches of every consumer. */
let lastServerFight = null;
/* ── THE ACKNOWLEDGED POINTER (b348) ────────────────────────────────────────
   The newest declaration the server has AGREED WITH: a `{kind,id}` this client
   sent, which an answer then reported back as the server's own state. It is not
   `lastServerActivity` — that is whatever the server last said, including
   things it says because it was never told anything.

   It exists to make ONE question answerable, and that question is the whole of
   b348's second half: **is the server's `idle` a statement about this player's
   run, or the absence of one?** Told-and-stopped and never-told are the same
   two bytes on the wire and opposite instructions to the client. Reconciling
   them the same way is what silently ends a session. */
let confirmed = null;

export const ACTIVITY_TIMEOUT_MS = 15000;
export const ACTIVITY_MAX_TRIES = 2;

/* Deliberately the accrual switch itself, not a copy of the key. */
export function isActivityIntentEnabled() { return isServerAccrualEnabled(); }

/* ── THE IDEMPOTENCY KEY ────────────────────────────────────────────────────
   A canonical v4 uuid or the server answers `missing_intent_id` (400, before
   any database work). `crypto.randomUUID` where it exists; otherwise built from
   `getRandomValues` with the version and variant bits set, because a
   Math.random() key is a key two devices can collide on and collision here
   means one player's intent answering another's. If neither exists this returns
   null and `declare()` refuses to send — an unkeyed intent is refused by the
   server anyway, and failing here says so locally. */
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

/** Did the server ANSWER? A refusal is an answer; the client knows. Only these
 *  two mean "I do not know whether it landed", which is the entire population
 *  of cases where reusing a key is correct. */
export const UNANSWERED_OUTCOMES = Object.freeze(['unreachable', 'timeout']);
export function isAnswered(outcome) { return UNANSWERED_OUTCOMES.indexOf(outcome) === -1; }

/**
 * RULE 1, and the only place a retry's key is chosen.
 *
 * ⚠ REUSE IS THE EXCEPTION, NOT THE DEFAULT, and the first revision of the
 *   contract had it the other way round. A rejected key stays rejected BY
 *   DESIGN for up to 25 hours (until `hr_intents_prune` runs), so retrying a
 *   refusal with the same key cannot ever succeed — it re-reads the stored
 *   refusal. A new key after a refusal is always safe whatever the stage,
 *   because a refusal applied nothing: the collect refuses before the switch is
 *   attempted, and hr_apply's protected block rolls back in full. There is no
 *   partial effect for a second key to duplicate.
 */
export function nextIntentKey(prevKey, verdict) {
  const outcome = verdict && verdict.outcome;
  if (!isAnswered(outcome)) return prevKey;   // never answered — reuse, that is what keys are FOR
  return newIntentKey();                      // answered → the key is spent, whatever it said
}

/** Is this something the client is allowed to declare? Pure. */
export function isDeclarableActivity(kind, id) {
  if (ACTIVITY_KINDS.indexOf(kind) === -1) return false;
  if (kind === 'idle') return true;
  return typeof id === 'string' && /^[a-z0-9_]{1,64}$/.test(id);
}

/**
 * WHAT THE SERVER GETS TOLD, for something the game is actually doing. Pure.
 *
 * ⚠ AN UNDECLARABLE ACTIVITY IS DECLARED AS `idle`, AND THAT IS THE WHOLE POINT.
 *
 * The tempting answer is "say nothing" — it costs no rate budget and the server
 * refuses the kind anyway. It is also the b348 bug with a different name.
 * Saying nothing leaves the server's pointer on the PREVIOUS activity, so a
 * player who chops oak for an hour and then starts cooking is paid for oak for
 * as long as they cook. That is not an under-payment at the margin; it is the
 * server paying for something nobody did, and it is exactly what "the client
 * sends INTENTS and the server owns the numbers" is supposed to make impossible.
 *
 * Declaring the kind and letting the server refuse it (`activity_unsupported`,
 * 409, before any database work) does NOT fix that: the refusal is correct and
 * harmless, and it leaves the pointer exactly where the silence would have.
 *
 * `idle` is the only honest declaration for "I am doing something you cannot
 * price". It COLLECTS the window that really elapsed on the previous activity —
 * money the player earned — and then stops the meter. The artisan time itself
 * pays nothing, which is the deferral `PAYABLE_KINDS` already documents.
 *
 * And it is self-correcting: the day `artisan` joins `ACTIVITY_KINDS`, every
 * call site below starts declaring `artisan` with no edit, because the downgrade
 * is a function of that list rather than a literal at the call site.
 *
 * @returns {{kind,id,downgradedFrom?}} | null — null means "not a game activity
 *          at all, or an id that could never be one": a client bug, reported as
 *          `undeclarable` rather than quietly turned into a stop.
 */
export function declarationFor(kind, id) {
  if (GAME_ACTIVITY_KINDS.indexOf(kind) === -1) return null;
  if (kind === 'idle') return { kind: 'idle', id: null };
  /* Shape first, THEN the downgrade. A malformed id is a client bug whichever
     kind carries it, and turning `combat`+'BAD ID' into a silent stop would
     hide it. */
  if (typeof id !== 'string' || !/^[a-z0-9_]{1,64}$/.test(id)) return null;
  if (ACTIVITY_KINDS.indexOf(kind) === -1) {
    return { kind: 'idle', id: null, downgradedFrom: kind };
  }
  /* ── THE SECOND DOWNGRADE, AND IT IS PER-RECIPE (b356) ────────────────────
     `artisan` is settable and 261 of its 290 recipes are payable. The COOKING
     bench is not, until `noBurn` is sourced from state the server owns end to
     end — until then the server would burn at the base 25% while the player's
     Kitchen says 0%, which is not an under-payment at the margin, it is the
     server destroying the input.

     THE DOWNGRADE IS NOT POLITENESS, IT IS THE ONLY SAFE OPTION, and the two
     alternatives are both worse in ways this codebase has already paid for:
       · SAY NOTHING → the server's pointer stays on the PREVIOUS activity and
         the player is paid for the oak they stopped chopping an hour ago. That
         is b348, and it is the reason this function exists at all.
       · DECLARE IT ANYWAY → `set_activity` refuses it on shape
         (`activity_unsupported`, 409, before any database work). Correct,
         harmless, and it leaves the pointer exactly where the silence would.
     `idle` is the only honest declaration for "I am doing something you cannot
     price": it COLLECTS the window that really elapsed and stops the meter.

     ⚠ AN UNKNOWN RECIPE ID IS **NOT** DOWNGRADED. It is declared as `artisan`
       and refused by the server as `unknown_activity` — exactly as a bogus
       monster id is. Turning a client bug into a legitimate-looking stop is how
       a client bug becomes invisible, and the shape check above already draws
       that line for every other kind.

     Self-correcting, like the kind-level downgrade above it: the day
     `SERVER_OWNED_BONUS_KEYS` gains `noBurn`, `recipePayable` starts answering
     true and every cooking call site starts declaring `artisan` with no edit
     anywhere. */
  if (kind === 'artisan'
      && Object.prototype.hasOwnProperty.call(ARTISAN_INDEX, id)
      && !recipePayable(ARTISAN_INDEX, id)) {
    return { kind: 'idle', id: null, downgradedFrom: kind, unpayableRecipe: id };
  }
  return { kind, id };
}

/** Would a declaration of this recipe reach the server, or be downgraded?
    Exported so a call site (and the suite) can ask without duplicating the
    predicate. `true` for an id the client does not recognise — that is the
    server's question to answer, not this module's. */
export function isPayableRecipe(id) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(ARTISAN_INDEX, id)) return true;
  return recipePayable(ARTISAN_INDEX, id);
}

/* ── THE REQUEST, AS DATA ───────────────────────────────────────────────────
   PURE and exported so the suite asserts the LITERAL bytes on the wire. Key
   order matches the contract's example so a diff against the spec is a string
   comparison. */
export function buildActivityRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= MAX_SLOT ? o.slot : 0;
  /* ALLOWLISTED FROM `ACTIVITY_KINDS`, not compared against a literal. It used
     to read `o.kind === 'combat' ? 'combat' : 'idle'`, which silently rewrote
     every future kind into a STOP — so widening the list without touching this
     line would have turned "I am chopping oak" into "I stopped", which is worse
     than not sending it at all. Anything not on the list still falls to `idle`:
     the request body may only ever contain a kind this build has decided it may
     declare, and failing to a stop is the safe direction (a stop confiscates
     nothing — the collect runs first). */
  const kind = ACTIVITY_KINDS.indexOf(o.kind) === -1 ? 'idle' : o.kind;
  /* A STOP CARRIES A NULL ID, never the id it is stopping. `intentNameFor`
     yields `set_activity:idle` for every stop, and a stop that named its target
     would be a different name for the same declaration. */
  const id = kind === 'idle' ? null : String(o.id == null ? '' : o.id);
  return {
    url: accrueEndpoint(o.url),
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        verb: ACTIVITY_VERB,
        slot,
        intentId: String(o.intentId == null ? '' : o.intentId),
        activity: { kind, id },
      }),
    },
  };
}

/* ── THE ANSWER ─────────────────────────────────────────────────────────────
   `switched` and `replayed` both mean "the server's pointer is what we asked
   for"; they are kept apart because only one of them applied a delta and a
   receipt that cannot tell them apart cannot explain a missing payment. */
export const ACTIVITY_OUTCOMES = Object.freeze([
  'switched',       // 200 ok:true — the declaration landed, envelope is the truth
  'replayed',       // 200 ok:true replayed:true — this exact intent already landed
  'refused',        // 4xx/409 with a machine code; may or may not carry an envelope
  'rate-limited',   // 429 — 30/min. Back off; never spin.
  'not-signed-in',  // 401/403
  'unavailable',    // 5xx
  'malformed',      // a 200 that is not an envelope
  'unreachable',    // no answer at all (CORS, DNS, offline)
  'timeout',        // aborted after ACTIVITY_TIMEOUT_MS — also no answer
  'unconfigured',   // no endpoint / no token on this device
  'switch-off',     // the kill switch is off; nothing was sent
  'undeclarable',   // the client refused its own request before sending it
]);

/**
 * THE ENVELOPE, CONSTRUCTED FIELD BY FIELD FROM THE BODY.
 *
 * Doubles as "does this answer carry state?", which is why the client does NOT
 * keep a copy of the server's STATELESS_REFUSALS list. That list is a server
 * decision that can grow; a client that mirrors it is a second registry that
 * drifts, and the drift would be silent (a code moved onto the stateful side
 * would still be reconciled as if it had no envelope). Asking the SHAPE cannot
 * drift: an envelope either arrived or it did not.
 */
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

/**
 * WHAT THE SERVER SAYS THE PLAYER IS DOING.
 *
 * `activity` is read out of `state` BY THE SERVER and echoed at the top level —
 * the first revision of the contract echoed the client's own declaration back
 * at it, so a replayed switch reported what the CLIENT said while `state`
 * reported what the SERVER did. Both fields are the server's now, and the
 * fallback to `state` exists so a build that predates the top-level field still
 * reconciles rather than silently keeping the client's guess.
 */
export function activityOf(body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (!b) return null;
  const a = b.activity;
  if (a && typeof a === 'object' && typeof a.kind === 'string') {
    return { kind: a.kind, id: a.id == null ? null : String(a.id) };
  }
  const st = b.state;
  if (st && typeof st === 'object' && typeof st.active_kind === 'string') {
    return { kind: st.active_kind, id: st.active_id == null ? null : String(st.active_id) };
  }
  return null;
}

/**
 * THE IN-FLIGHT FIGHT THE SERVER IS HOLDING (Phase 0 fight-carry), OR NULL.
 *
 * b372 (F18, live audit 2026-08-17). `player_state.fight` has been server state
 * since 2026-08-17-fight-carry.sql, `hr_state_of` projects it, and hr-accrue
 * feeds it back into every span — but NOTHING ON THE CLIENT HAS EVER READ IT.
 * The one consumer of an envelope's activity, `activityOf()` above, takes
 * `active_kind`/`active_id` and stops there, so `reconcileActivityPointer()`
 * could only ever answer "you are fighting a goblin" and never "…and it is on
 * 40 of its 120 hit points". Its only tool is `startCombat()`, which sets
 * `monsterHp = m.hp` — so every reconcile that had to move the pointer RESTARTED
 * the fight the server was carrying, discarding the partial the column exists to
 * preserve. The server resumes; the client did not.
 *
 * Returns `{ monster, hp, kills }` or null. STRICT, and each rejection is a
 * different sentence the server might be saying:
 *   • `null` / `{}`      → "no fight in flight" (the migration's own encoding:
 *                          null means the column is absent, `{}` means idle).
 *   • hp not a positive   → a dead or unstated foe. Resuming a fight at 0 hp is
 *     finite number         how you get a monster that cannot be killed.
 *   • monster not a        → an id this build cannot name. Never invent one.
 *     non-empty string
 * The CALLER clamps hp against its own catalogue — this function does not import
 * the monster table, because a parser that silently repairs its input is a
 * parser you cannot use to detect that the input was wrong.
 */
export function fightOf(body) {
  const st = (body && typeof body === 'object' && body.state && typeof body.state === 'object')
    ? body.state : null;
  const f = st ? st.fight : null;
  if (!f || typeof f !== 'object') return null;
  const monster = f.monster;
  if (typeof monster !== 'string' || !monster) return null;
  const hp = Number(f.hp);
  if (!Number.isFinite(hp) || !(hp > 0)) return null;
  const kills = Number(f.kills);
  return { monster, hp, kills: (Number.isFinite(kills) && kills >= 0) ? Math.floor(kills) : 0 };
}

/**
 * THE RECEIPT, OR NULL. Null both when the server sent none and when it sent
 * one that paid nothing — a zero receipt rendered is a welcome-back card that
 * says "+0 gold" over the real one, which is the mirror image of the bug this
 * whole path exists to avoid.
 */
export function collectedOf(body) {
  const c = body && typeof body === 'object' ? body.collected : null;
  if (!c || typeof c !== 'object') return null;
  const sum = (v) => (v && typeof v === 'object'
    ? Object.keys(v).reduce((s, k) => s + (Number(v[k]) || 0), 0) : (Number(v) || 0));
  const paid = (Number(c.gold) || 0) + (Number(c.kills) || 0) + sum(c.xp) + sum(c.items)
    + (Array.isArray(c.levelUps) ? c.levelUps.length : 0);
  if (paid <= 0 && !(Number(c.ms) > 0)) return null;
  return c;
}

/** `collected` → the `away` shape `summaryFromAway` already reads. ONE
 *  translation, so the away card and the switch receipt cannot describe the
 *  same kind of payment differently. */
export function awayFromCollected(collected) {
  const c = collected || {};
  return {
    grantMs: Number(c.ms) || 0,
    capped: !!c.capped,
    kills: Number(c.kills) || 0,
    crits: Number(c.crits) || 0,
    died: !!c.died,
    gold: Number(c.gold) || 0,
    xp: c.xp,
    items: c.items,
    levelUps: Array.isArray(c.levelUps) ? c.levelUps : [],
    blessed: !!c.blessed,
    buffsPaused: !!c.buffsPaused,
    /* Ruling 2 (b352): WHICH hours the collect settled. Carried rather than
       derived — with the credited window anchored to when the player LEFT, a
       capped window no longer ends at `now`, so subtracting the span off the
       clock names the wrong hours (and, through the Boss of the Day, the wrong
       multiplier). Absent on a pre-b352 server: left undefined rather than
       guessed, because a guess here is a renderer quoting a bonus nobody paid. */
    unpaidMs: Number(c.unpaidMs) || 0,
    windowFrom: Number(c.windowFrom) || null,
    windowTo: Number(c.windowTo) || null,
  };
}

export function classifyActivityResponse(status, body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (status === 200) {
    if (!b || b.ok !== true) return { outcome: 'malformed', body: b, reason: 'not_ok' };
    if (!envelopeOf(b)) return { outcome: 'malformed', body: b, reason: 'envelope_incomplete' };
    return { outcome: b.replayed === true ? 'replayed' : 'switched', body: b };
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

/**
 * MAY THIS ATTEMPT BE RETRIED AUTOMATICALLY? Pure, and deliberately narrow.
 *
 *   • UNANSWERED — retry with the SAME key. That is what idempotency is for.
 *   • `version_conflict` — retry with a NEW key. It is a statement about the
 *     caller's READ, not about the delta; it is rolled back in full; hr_apply
 *     RELEASES a key it claimed itself for exactly this code; and the defined
 *     recovery is "re-read and try again". One retry, not a loop.
 *
 * Everything else stops here. A `stage:'collect'` refusal in particular must
 * never be retried in a loop — the contract says so in as many words: the
 * recovery is the ACCRUE verb, which owns the degrade ladder that escapes a
 * clamp, and `declare()` kicks it once for that reason. `intent_mismatch` would
 * succeed on a fresh key and is still not retried: on a freshly generated uuid
 * it means a client bug, and auto-retrying a client bug is how a client bug
 * becomes permanent.
 */
export function shouldRetryActivity(verdict, attempt, maxTries) {
  const max = Number.isInteger(maxTries) ? maxTries : ACTIVITY_MAX_TRIES;
  if (!verdict || attempt >= max) return false;
  if (!isAnswered(verdict.outcome)) return true;
  return verdict.outcome === 'refused' && verdict.reason === 'version_conflict';
}

/* ── TRANSPORT ──────────────────────────────────────────────────────────────
   Same shape as accrue.js/character.js/record.js: config wired once from
   auth.js, accessors never captured (a token refreshed five minutes from now
   must reach the endpoint too), slot resolved per call. */
export function configureActivity(cfg) {
  if (!cfg || !cfg.url) { config = null; return null; }
  config = {
    url: String(cfg.url).replace(/\/+$/, ''),
    apiKey: cfg.apiKey || '',
    authToken: cfg.authToken || null,
    slot: Number.isInteger(cfg.slot) ? cfg.slot : null,
  };
  return getActivityConfig();
}

export function getActivityConfig() {
  if (!config) return null;
  return { url: config.url, slot: resolveActiveSlot(config.slot), pinnedSlot: config.slot,
    endpoint: accrueEndpoint(config.url) };
}

function tokenOf() {
  if (!config || !config.authToken) return null;
  try { return typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { return null; }
}

let hooks = { onEnvelope: null, onReconcile: null, onOutcome: null };
export function setActivityHooks(h) { hooks = { ...hooks, ...(h || {}) }; }
/* RETURNS WHAT THE HOOK RETURNED, and the first version did not — which made
   `applied.envelope` mean "a hook was called" while reading as "the envelope was
   applied". Found by driving a real gesture in a real browser: the diagnostic
   said `envelope: true` on a switch where the replacement gate had refused and
   NOTHING was written. A state object that reports an intention as an outcome is
   the same family of bug as an assertion that asserts nothing, and it is worse
   here because it is what an incident would be read from. */
function fire(name, a, b, c) {
  const fn = hooks && hooks[name];
  if (typeof fn !== 'function') return null;
  try { return fn(a, b, c); }
  catch (e) { console.warn('[activity] hook ' + name + ' threw:', e && e.message); return null; }
}

export function getActivityState() {
  return {
    enabled: isActivityIntentEnabled(), configured: !!config,
    pending: !!inFlight, queued: queued ? { ...queued } : null,
    lastServerActivity: lastServerActivity ? { ...lastServerActivity } : null,
    confirmed: confirmed ? { ...confirmed } : null,
    last,
  };
}

export function resetActivity() {
  inFlight = null; queued = null; last = null; lastServerActivity = null; confirmed = null;
  lastServerFight = null;
}

/**
 * HAS THE SERVER ACKNOWLEDGED THIS EXACT ACTIVITY? Pure over module state.
 *
 * The caller is legacy.js's reconcile, and the answer decides whether a server
 * `idle` may stop the player's run. `false` for a pointer the server was never
 * told about — which is the honest answer and the safe one: the recovery for
 * "we never told it" is to tell it, not to stop the player.
 */
export function isActivityConfirmed(kind, id) {
  if (!confirmed) return false;
  const want = id == null ? null : String(id);
  return confirmed.kind === kind && confirmed.id === want;
}

/** Test/diagnostic seam, mirroring setLastServerActivity. */
export function setConfirmedActivity(a) {
  confirmed = (a && typeof a === 'object' && typeof a.kind === 'string')
    ? { kind: a.kind, id: a.id == null ? null : String(a.id) } : null;
  return confirmed;
}

/** Test/diagnostic seam: what the server last SAID the player is doing. */
export function setLastServerActivity(a) {
  lastServerActivity = (a && typeof a === 'object' && typeof a.kind === 'string')
    ? { kind: a.kind, id: a.id == null ? null : String(a.id) } : null;
  return lastServerActivity;
}

/**
 * APPLY AN ANSWER'S ENVELOPE. Rule 4's implementation, and the ONLY place this
 * module writes a game value.
 *
 * Shares `applyEnvelopeState` and `summaryFromAway` with the away path, and
 * shares the REPLACEMENT GATE with it too — the server character is
 * deliberately fresh and applying it over real local progress is permanent, so
 * it asks once, in numbers, whichever verb is applying. One acknowledgement key
 * covers both because it is one consent.
 */
export function applyIntentEnvelope(G, body) {
  const env = envelopeOf(body);
  if (!G || typeof G !== 'object' || !env) return null;

  const loss = describeReplacement(G, env);
  /* b366 — THE DEVICE-HANDOFF DEFERRAL, APPLIED TO THIS TWIN TOO. accrue.js's
     applyEnvelope carries the same three lines and the same reasoning: `G`
     during a handoff is whatever loadLocal() put there, and against a week-old
     phone save almost any envelope reads "destructive" on nothing but
     arithmetic (the desktop session SPENT gold, so local > server). Asking the
     player to consent to losing progress while pullAndMaybeRestore is still in
     flight with the real save is a question whose answer is being fetched.
     Refusing costs nothing here: the switch's collect has already been recorded
     against the server's own watermark, so the next answer carries the same
     truth and the gate re-evaluates against the save that actually won. */
  if (loss.destructive && isReconcilePending()) {
    console.warn('[activity] deferring the replacement decision — the cloud reconcile has not settled, '
      + 'so the local save being compared against may not be the one that wins.');
    return null;
  }
  if (loss.destructive && !isReplacementAcknowledged()) {
    console.warn('[activity] REFUSING to overwrite local progress with the server character '
      + 'until the player confirms — would lose ' + loss.gold + ' gold, ' + loss.skillXp
      + ' skill XP and ' + loss.items + ' item(s). This is permanent and there is no merge.');
    showReplacementSheet(loss, G, env, (g, e) => applyIntentEnvelope(g, { ...body, ...e }));
    return null;
  }

  const written = applyEnvelopeState(G, env);
  /* THE CONSTRUCTED envelope goes back to the caller so record.js's applyRecord
     can read a REFUSAL's state too. A refused switch whose collect applied moved
     `accrued_to`, and `decodeRecord` fails closed on `ok !== true` — so handing
     it the raw refusal body would leave the record stale by exactly the window
     that was just paid. Constructed, never a spread of the refusal. */
  written.envelope = env;

  const collected = collectedOf(body);
  if (collected) {
    /* THE ONE THAT WOULD BITE. Through the away card's own translator, into the
       field every welcome-back surface already reads, so the player is told
       what they were just paid instead of finding it at the next hr_load. */
    const s = summaryFromAway(awayFromCollected(collected), env);
    /* STATED, not inferred: this receipt is for a SWITCH, not for an absence.
       `summaryFromAway` sets serverAuthoritative; the surfaces that print "while
       you were away" can key off this to say something truer, and a bug report
       can tell the two apart. */
    s.source = 'switch';
    s.activity = activityOf(body);
    G.lastOfflineSummary = s;
    written.summary = true;
    written.collected = collected;
  }

  G._serverAccrual = {
    version: env.version,
    accruedTo: env.state.accrued_to || null,
    serverNow: env.now || null,
    at: Date.now(),
    via: 'set_activity',
  };
  return written;
}

/* ── ONE ATTEMPT ────────────────────────────────────────────────────────────
   Everything that happens to an ANSWER happens here, so success and refusal
   share one code path (contract: "reconcile to the envelope is one code path
   for success and failure alike"). */
async function attemptOnce(kind, id, key) {
  const slot = resolveActiveSlot(config.slot);
  const token = tokenOf();
  const { url, init } = buildActivityRequest({
    url: config.url, apiKey: config.apiKey, token, slot, intentId: key, kind, id,
  });

  let ac = null;
  let timer = null;
  try { ac = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (e) { ac = null; }
  const opts = ac ? { ...init, signal: ac.signal } : init;
  if (ac) timer = setTimeout(() => { try { ac.abort(); } catch (e) {} }, ACTIVITY_TIMEOUT_MS);

  let res = null;
  let aborted = false;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    aborted = !!(ac && ac.signal && ac.signal.aborted);
    if (timer) clearTimeout(timer);
    /* A CORS failure, a DNS failure and a dead network are indistinguishable
       here by design of the fetch spec, and all three mean the same thing to
       rule 1: WE WERE NOT ANSWERED, so the key is reused. */
    return settle({ outcome: aborted ? 'timeout' : 'unreachable',
      reason: String((e && e.message) || e), key }, kind, id);
  }
  if (timer) clearTimeout(timer);

  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  return settle({ ...classifyActivityResponse(res.status, body), status: res.status, key }, kind, id);
}

function settle(verdict, kind, id) {
  const applied = { envelope: false, reconciled: null };
  const body = verdict.body || null;
  const env = envelopeOf(body);

  if (env) {
    /* The envelope is the truth whether the switch landed or not — a refused
       switch whose COLLECT applied carries a real payment, and the state that
       comes with it is the state after that payment. */
    const wrote = fire('onEnvelope', body, verdict);
    /* WHAT THE HOOK DID, not that it was called. `null` here is a real and
       expected outcome: the replacement gate refuses until the player consents,
       and reporting that as an applied envelope would hide the one state in
       which a switch pays the server and nothing reaches the player. */
    applied.envelope = !!wrote;
    if (wrote && wrote.summary) applied.collected = true;
    const a = activityOf(body);
    if (a) {
      lastServerActivity = { kind: a.kind, id: a.id };
      /* ⚠ CONFIRMED ONLY WHEN THE SERVER AGREES WITH WHAT WE SENT, and taken
         BEFORE the hook runs so the reconcile can ask about it. `switched` and
         `replayed` both mean "the server's pointer is what we asked for"; a
         REFUSAL that happens to carry an envelope does not, even though it
         carries a perfectly good `activity` field — that field is then the
         server's OLD state, and recording it as an acknowledgement of this
         declaration would let a refused switch look like a successful one.
         The comparison is against what was DECLARED on this attempt, not
         against `last`, because `last` has not been written yet. */
      const acked = (verdict.outcome === 'switched' || verdict.outcome === 'replayed')
        && a.kind === kind && a.id === (id == null ? null : String(id));
      if (acked) confirmed = { kind: a.kind, id: a.id };
      /* b372 (F18): the carried fight rides WITH the pointer, from the same
         envelope, in the same call. Kept as module state for the no-envelope
         branch below for the same reason `lastServerActivity` is: a refusal
         carries no state, so the last thing the server actually said is still
         the truth, and reconciling the pointer without the fight would restart
         a foe the server is still holding at half health. */
      lastServerFight = fightOf(body);
      fire('onReconcile', { ...lastServerActivity }, verdict, lastServerFight);
      applied.reconciled = { ...lastServerActivity };
    }
  } else if (isAnswered(verdict.outcome) && verdict.outcome !== 'switched') {
    /* ANSWERED, REFUSED, NO ENVELOPE. Nothing was written — these codes are
       refused on shape or before any database work — so the client's LAST
       envelope is still current, and that is what it reconciles to. NEVER to
       its own optimistic guess: keeping the guess is the one thing a client is
       never allowed to do. */
    if (lastServerActivity) {
      fire('onReconcile', { ...lastServerActivity }, verdict, lastServerFight);
      applied.reconciled = { ...lastServerActivity };
    } else {
      /* We have never been told. Nothing to reconcile TO, so the optimistic
         pointer stands and the state says it is unproven — the next accrual or
         hr_load settles it. Stated rather than hidden. */
      applied.unresolved = true;
    }
  } else if (!isAnswered(verdict.outcome)) {
    /* NEVER ANSWERED. The declaration may have landed. Snapping the pointer
       back would be a guess in the opposite direction, so the optimistic
       pointer stands and this is marked unresolved. */
    applied.unresolved = true;
  }

  last = {
    outcome: verdict.outcome, reason: verdict.reason || null, stage: verdict.stage || null,
    status: verdict.status || 0, at: Date.now(), key: verdict.key || null,
    declared: { kind, id: id == null ? null : id }, applied,
  };
  fire('onOutcome', last);
  return { ...verdict, applied };
}

/**
 * DECLARE WHAT THE PLAYER IS NOW DOING. The seam legacy.js's four pointer
 * writers call. Returns a promise; the caller does NOT await it (rule 3).
 */
export async function declareActivity(rawKind, rawId, opts) {
  const o = opts || {};
  /* THE DOWNGRADE HAPPENS HERE, ONCE, BEFORE ANYTHING ELSE LOOKS AT THE KIND.
     Every caller below — the switch check, the coalescer, the request builder,
     the confirmation — then sees the ONE declaration that is actually going on
     the wire, rather than the caller's word for it. Putting it at any of those
     sites instead would be four places that have to agree about what `artisan`
     means. */
  const decl = declarationFor(rawKind, rawId);
  if (!decl) return inert('undeclarable', rawKind, rawId, 'not_a_declarable_activity');
  const kind = decl.kind;
  const id = decl.id;
  if (!isActivityIntentEnabled()) return inert('switch-off', kind, id);
  if (!isDeclarableActivity(kind, id)) return inert('undeclarable', kind, id);
  if (!config) return inert('unconfigured', kind, id, 'no_endpoint');
  if (!tokenOf()) return inert('unconfigured', kind, id, 'no_token');

  if (inFlight && !o.force) {
    /* COALESCE. The newest declaration replaces any earlier queued one — the
       player's most recent tap is the only one that describes where they are. */
    queued = { kind, id: id == null ? null : id };
    return { outcome: 'queued', declared: { ...queued } };
  }

  inFlight = (async () => {
    /* ONE KEY PER GESTURE, generated at the tap. */
    let key = newIntentKey();
    if (!isIntentKey(key)) return inert('undeclarable', kind, id, 'no_uuid_source');
    let verdict = null;
    for (let attempt = 1; attempt <= ACTIVITY_MAX_TRIES; attempt++) {
      verdict = await attemptOnce(kind, id, key);
      /* A SUCCESS STOPS THE LOOP HERE, not inside shouldRetryActivity. Found by
         the mutation run: forcing `shouldRetryActivity` to true re-sent a
         SUCCESSFUL switch, because the only thing ending the loop was a function
         named "should retry". A retry policy is allowed to be wrong about a
         failure; it must not be able to be wrong about a success. */
      if (verdict.outcome === 'switched' || verdict.outcome === 'replayed') break;
      if (!shouldRetryActivity(verdict, attempt, ACTIVITY_MAX_TRIES)) break;
      key = nextIntentKey(key, verdict);
      if (!isIntentKey(key)) break;
    }
    /* THE CONTRACT'S OWN RECOVERY for a refused COLLECT: the elapsed window
       could not be priced, so nothing was written and the window is intact. The
       accrue verb owns the degrade ladder that escapes a clamp; it is asked
       ONCE and the switch is not retried, so a clamped player becomes unstuck
       on their next tap instead of never. */
    if (verdict && verdict.outcome === 'refused' && verdict.stage === 'collect') {
      try { beginServerAccrual(); } catch (e) {}
    }
    return verdict;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
    const next = queued;
    queued = null;
    if (next) { const p = declareActivity(next.kind, next.id); if (p && p.catch) p.catch(() => {}); }
  }
}

function inert(outcome, kind, id, reason) {
  last = { outcome, reason: reason || null, at: Date.now(),
    declared: { kind, id: id == null ? null : id }, applied: { envelope: false, reconciled: null } };
  return { outcome, reason: reason || null, sent: false, declared: { kind, id: id == null ? null : id } };
}

/** Fire-and-forget entry, mirroring accrue.js's `beginServerAccrual`. */
export function declare(kind, id) {
  const p = declareActivity(kind, id);
  if (p && typeof p.catch === 'function') p.catch(() => {});
  return p;
}

if (typeof window !== 'undefined') {
  window.HearthriseActivity = {
    ACTIVITY_VERB, ACTIVITY_KINDS, GAME_ACTIVITY_KINDS, ACTIVITY_OUTCOMES,
    ACTIVITY_TIMEOUT_MS, ACTIVITY_MAX_TRIES,
    UNANSWERED_OUTCOMES, isAnswered, newIntentKey, isIntentKey, nextIntentKey,
    isActivityIntentEnabled, isDeclarableActivity, declarationFor, isPayableRecipe,
    buildActivityRequest,
    classifyActivityResponse, shouldRetryActivity,
    envelopeOf, activityOf, fightOf, collectedOf, awayFromCollected, applyIntentEnvelope,
    configureActivity, getActivityConfig, setActivityHooks,
    declare, declareActivity, getActivityState, resetActivity, setLastServerActivity,
    isActivityConfirmed, setConfirmedActivity,
  };
}
