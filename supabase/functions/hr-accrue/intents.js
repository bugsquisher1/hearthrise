// ============================================================================
// supabase/functions/hr-accrue/intents.js — THE PLAYER-INTENT CONTRACT.
//
// This file is the TEMPLATE. `set_activity` is the first of nine intents and
// the other eight copy the shape defined here, so the shape matters more than
// the feature. Everything below is a rule about EVERY intent; the intent itself
// lives in ./set-activity.js.
//
// PURE ESM. No I/O, no fetch, no Deno, no globals — so every rule in it is
// executable from plain Node, which is why the guards can be behavioural
// instead of a regex over TypeScript nobody can import.
//
// ════════════════════════════════════════════════════════════════════════════
// THE CONTRACT — read this before writing intent number two
// ════════════════════════════════════════════════════════════════════════════
//
// 1. WHAT THE CLIENT MAY SEND: a verb, an idempotency key, a slot, and a
//    DECLARATION ("I am now fighting goblins"). Never a computed value. Not a
//    yield, not a rate, not a tick count, not a span, not a price, not a
//    timestamp. `request.js` is the only reader of the body and it constructs
//    its output field by field; there is no path by which an unlisted key
//    survives, because no unlisted key is ever read.
//
// 2. WHAT IT GETS BACK: the `hr_state_of` envelope, verbatim, plus `ok`. One
//    envelope shape for every intent so the client has one code path. Errors are
//    MACHINE CODES, never prose (design §2 "Error taxonomy"), and a refusal
//    carries `stage` so the client knows which half failed.
//
// 3. ⚠ AN INTENT MUST COLLECT BEFORE IT SWITCHES.
//    `hr_apply` stamps `accrued_to = now()` on any delta carrying `equip` or
//    `activity` (apply-engine.sql §S5). That makes the equip-at-collect
//    OVER-payment arithmetically empty — there is no unpaid window left for the
//    new gear to be priced at. It creates the exact mirror image: if the intent
//    surface changes the pointer WITHOUT paying first, the elapsed window is
//    CONFISCATED. Three hours of mining vanish the moment the player says "now
//    I'm fishing".
//
//    So every state-changing intent that touches `equip` or `activity` runs a
//    COLLECT first, in its own apply, and only proceeds if that collect did not
//    fail. `collectGate()` below is the one implementation of "did it fail",
//    and it is exhaustively tested.
//
// 4. TWO APPLIES, NOT ONE MERGED DELTA — and the reason is not taste.
//      • The collect's key is SERVER-DERIVED and salted with a 256-bit secret
//        (review S6); the switch's key is CLIENT-CHOSEN. Merging them would put
//        a payment the client cannot predict under a key the client chose.
//      • The ledger would lose the distinction between "the server paid you for
//        a night of fighting" (kind=combat, intent=accrue, with the value on the
//        row) and "you declared a new activity" (kind=admin, no value). Journal
//        rule 6 is about being able to audit value movement; one row that is
//        both is one row that is neither.
//      • The failure modes are asymmetric in our favour. Two applies can end
//        "paid, not switched" — the player keeps their old activity and their
//        money, and a retry costs one round trip. One merged apply that is
//        refused rolls the PAYMENT back too, and then refuses identically on
//        every retry.
//
// 5. THE COLLECT DOES NOT DEGRADE. `hr-accrue`'s accrue verb has a degrade
//    ladder because its only alternatives are "pay less" or "brick the
//    watermark forever". An intent has a third option the accrual does not:
//    DON'T SWITCH. So a rejected collect refuses the switch (`stage:'collect'`),
//    changes nothing, and leaves the window intact for the accrue verb — which
//    owns the ladder — to drain. That is why there is exactly one ladder in this
//    payload and not two.
//
// 6. IDEMPOTENCY IS `hr_apply`'s, NOT OURS. `player_intents(user_id, intent_id)`
//    is claimed under the same advisory lock that serialises the character, and
//    a replay returns the FIRST decision. Nothing here re-implements that; the
//    intent's whole job is to send a stable key and honour the answer.
//
// 7. CONCURRENCY IS `p_version`, NOT OURS. Every apply names the version it read
//    and `hr_apply` refuses a stale one. The switch names the version the
//    COLLECT returned, because the collect just bumped it.
//
// ════════════════════════════════════════════════════════════════════════════
// THE KEY — why a client-chosen uuid is safe HERE and was not safe before
// ════════════════════════════════════════════════════════════════════════════
// `player_intents` is ONE namespace shared by client uuids and by keys the
// server derives. Left alone, a player who can COMPUTE the engine's next accrual
// key can burn it with any other intent, after which every accrual answers
// `replayed:true`, applies nothing and never advances the watermark — silently,
// with ok:true, for 24 hours. Two independent locks close it, and BOTH are
// already live in production (verified 2026-08-15 against the deployed body):
//
//   · the accrual key is `sha256(user, slot, watermark, SALT, attempt)` where
//     SALT = hr_seed(user, slot, 'intent:accrue:<watermark>') mixes a 256-bit
//     secret held in a table with RLS on, no policy and no client grant. It is
//     not computable from anything hr_load returns.
//   · `hr_apply` refuses a replay that is not a replay of the SAME THING:
//     `player_intents.intent` records what the key was claimed for, and a
//     different name answers `intent_mismatch`.
//
// THE SECOND LOCK IS ONLY AS SHARP AS THE NAME IT COMPARES. Which is why:
//
//   ⇒ RULE: `journal.intent` NAMES THE INTENT **AND ITS TARGET**.
//     'set_activity:combat:goblin', not 'set_activity'.
//
// Without the target, a client that reused one key for "fight goblins" and then
// "fight rats" would get `replayed:true, ok:true` and SILENTLY stay on goblins —
// a correctness trap with no error anywhere. With it, the second call is
// `intent_mismatch`: loud, refused, nothing applied. The name is also what
// lands in `player_ledger.intent`, so the journal says what was declared.
// ============================================================================

// ════════════════════════════════════════════════════════════════════════════
// THE CLIENT SEAM — the wire, specified. NOT YET IMPLEMENTED (b345).
//
// The client half is deliberately not written here: src/legacy.js is held by
// another workstream and the seam runs through it. This is the specification it
// implements, kept in the CONTRACT file rather than in a design doc so the two
// sides of the wire cannot drift apart in different folders.
//
// ── THE REQUEST ────────────────────────────────────────────────────────────
//   POST <SUPABASE_URL>/functions/v1/hr-accrue
//     apikey:        <anon key>
//     Authorization: Bearer <user JWT>     ← the ONLY identity. There is no
//                                            user field in the body and no way
//                                            for one player to name another.
//     Content-Type:  application/json
//     {"verb":"set_activity","slot":N,"intentId":"<uuid>",
//      "activity":{"kind":"combat","id":"goblin"}}
//
//   STOP is the same call with {"kind":"idle","id":null}.
//   An ABSENT `verb` still means `accrue`, so the existing accrual client
//   (src/net/accrue.js, which posts {slot}) is unaffected — no coordination
//   needed between the two deploys.
//
// ── THE RESPONSE ───────────────────────────────────────────────────────────
//   200 {ok:true, verb, activity:{kind,id}, version, now, state, skills,
//        inventory, equipment, farm, progress, total_level,
//        collected:{ms,capped,kills,gold,xp,items,levelUps,died} | null}
//        `collected` is the RECEIPT for the window the switch paid on the way
//        through, stated by the server. It is null on a replay, and on a switch
//        that had nothing to collect. RENDER IT, DO NOT RECOMPUTE IT.
//   200 {ok:true, replayed:true, …}                this exact intent already landed
//   400 {ok:false, error:'unknown_verb'|'missing_intent_id'|'bad_activity'}
//   409 {ok:false, error:'no_character'|'unknown_activity'|'activity_unsupported'}
//   409 {ok:false, error:<code>, stage:'collect'}  NOTHING CHANGED and the elapsed
//        window is INTACT. Recovery: run the accrue verb (it owns the degrade
//        ladder), then retry. Never retry the switch alone in a loop.
//   409 {ok:false, error:'version_conflict'|'intent_mismatch', stage:'switch'}
//   429 {ok:false, error:'rate_limited'}           30/min. Back off; do not spin.
//
// ── THE IDEMPOTENCY KEY — THE ONE RULE A CLIENT CAN GET WRONG ──────────────
//   ONE KEY PER PLAYER GESTURE. Generate it with crypto.randomUUID() at the
//   moment the player taps a monster, keep it for every RETRY of that tap, and
//   throw it away when the tap is answered. A NEW tap gets a NEW key.
//
//   Reusing a key for a DIFFERENT target answers `intent_mismatch` (loud, and
//   nothing is applied) rather than silently leaving the player on the old one —
//   that is the whole reason `journal.intent` names the target. Reusing it for
//   the SAME target answers `replayed:true`, which is what makes a retry safe.
//
// ── WHERE IT GOES IN src/legacy.js ─────────────────────────────────────────
//   THE POINTER HAS FOUR WRITERS TODAY. All four are the seam; a fifth added
//   later without this call is a client that silently disagrees with the server.
//
//     legacy.js:3071 startCombat(mId)     → set_activity {combat, mId}
//     legacy.js:3082 stopCombat()         → set_activity {idle, null}
//     legacy.js:2556 the bounty away-switch drain (b344) → set_activity {combat, id}
//     legacy.js:3217 combat-sim onDeath (away branch)    → NO CALL. The SERVER
//                    already set the pointer to idle in the accrual delta; the
//                    client is reconciling to state it was told, not declaring.
//
//   All of it behind the SAME kill switch as accrual —
//   `localStorage['hr:serverAccrual'] === 'on'` via isServerAccrualEnabled().
//   Two switches would produce a state where the client starts activities the
//   server never hears about, or accrues against a pointer it never set.
//
//   ⚠ FIRE-AND-RECONCILE, NOT AWAIT-THEN-RENDER. The local pointer moves
//     immediately (an idle game must feel instant) and the envelope reconciles
//     it. The prediction is DISPLAY-ONLY: nothing local may be treated as
//     authoritative, and on a refusal the local pointer is put back to what the
//     envelope says — never to what the client guessed.
//
//   ⚠ AND THE ONE THAT WILL BITE: a switch PAYS. The response carries a
//     `collected` receipt with gold, XP, items and level-ups that the player has
//     genuinely just earned, and if the client discards it those numbers appear
//     out of nowhere at the next hr_load. Route it through the SAME renderer the
//     away card uses (applyEnvelope + the away summary), not through a second
//     one written for this call.
//
//   A transport module in the shape of src/net/accrue.js and src/net/character.js
//   (pure request builder + pure response classifier + a thin caller) is the
//   right home for it — those two are the precedent, and their split exists so a
//   test can assert the LITERAL BYTES that go on the wire.
// ════════════════════════════════════════════════════════════════════════════

/** The verb registry. One row per intent; adding an intent adds a row.
 *
 *  bucket      — the `hr_rate_gate` bucket. The gate owns the LIMIT (a caller
 *                that names its own rate limit does not have one), so this names
 *                only which budget is spent. An unknown bucket fails closed in
 *                the database, which is what makes a typo here a refusal rather
 *                than a brand-new unlimited namespace.
 *  needsKey    — whether the caller must supply an idempotency key. `accrue`
 *                does not: its key is derived, because an accrual is the same
 *                operation no matter who asks or how often (index.ts §Idempotency).
 *  collectsFirst — whether rule 3 applies.
 */
export const INTENT_REGISTRY = Object.freeze({
  accrue: Object.freeze({ bucket: 'accrue', needsKey: false, collectsFirst: false }),
  set_activity: Object.freeze({ bucket: 'activity', needsKey: true, collectsFirst: true }),
});

/** Machine codes this layer produces itself. Everything else is `hr_apply`'s own
    code, returned verbatim so it survives to the client and to `hr_rejections`. */
export const INTENT_ERRORS = Object.freeze({
  UNKNOWN_VERB: 'unknown_verb',                 // 400 — this build has no such intent
  MISSING_INTENT_ID: 'missing_intent_id',       // 400 — no key, or not a canonical uuid
  BAD_ACTIVITY: 'bad_activity',                 // 400 — the declaration is malformed
  ACTIVITY_UNSUPPORTED: 'activity_unsupported', // 409 — a real kind the server cannot pay YET
  NO_CHARACTER: 'no_character',                 // 409 — nothing to act on in this slot
  RATE_LIMITED: 'rate_limited',                 // 429
  /* 409, stage:'collect'. The elapsed window could not be priced, so switching
     would confiscate it. Nothing was written; the window is intact. */
  UNCOLLECTABLE_WINDOW: 'uncollectable_window',
});

/* ── COLLECT-GATE OUTCOMES ─────────────────────────────────────────────────
   Three, and they are not three shades of the same thing:

     'paid'     the collect applied a delta. `version` moved; use the new one.
     'nothing'  there was NOTHING OWED. Proceed.
     'refused'  something may have been owed and it was not paid. Nothing was
                written and the window is intact. DO NOT SWITCH: switching now is
                precisely the confiscation rule 3 exists to prevent. */
export const COLLECT_OUTCOMES = Object.freeze(['paid', 'nothing', 'refused']);

/* ── "NOTHING OWED" IS AN ALLOWLIST, NOT A FALLBACK ────────────────────────
   THIS IS THE SUBTLEST PART OF THE WHOLE CONTRACT, so it is a table.

   `computeAccrual` returns `{accrued:false, reason}` for six different
   situations and they fall into two groups that look identical at the call site
   and are opposites:

     NOTHING WAS OWED — safe to switch, because the switch's `accrued_to = now()`
       discards a window that was worth nothing:
         idle             the character was not doing anything
         below_min_span   less than ACCRUE_MIN_MS has elapsed
         nothing_accrued  it WAS simulated and produced nothing

     SOMETHING MAY HAVE BEEN OWED AND THE ENGINE COULD NOT PRICE IT — refuse,
     because proceeding CONFISCATES it:
         unsupported_activity  a real activity this engine cannot simulate yet
         unknown_monster       the pointer names a target that is not in the data
         no_active_since       an inconsistent row; the span cannot be bounded

   The naive implementation treats every `accrued:false` as "nothing to do" and
   switches. That is EXACTLY the bug Tyler named: mine for three hours, declare
   "now I'm fishing", and the three hours are gone. It would also have been
   invisible — no error, no log, `ok:true`, and the player's only evidence is
   that their night was smaller than it should have been.

   The list is an ALLOWLIST and `classifySkip` FAILS CLOSED on anything not in
   it, so a reason added to accrual.js in future refuses a switch until somebody
   decides which group it belongs to. That is the correct direction: a refused
   switch is a visible, recoverable annoyance; a confiscated window is silent
   and permanent.

   ⚠ KNOWN AND BOUNDED COST of putting `below_min_span` in the safe group: a
     switch always closes the window (hr_apply stamps accrued_to unconditionally
     on an `activity` delta), so a remainder of up to ACCRUE_MIN_MS − 1 ms is
     discarded per switch. Bounded at <60 s, self-inflicted, and rate-limited to
     30 switches/minute. The alternative — refusing every switch made within a
     minute of the last collect — makes the intent unusable. The real fix is to
     let a CLOSING collect simulate a sub-minute span, which changes the accrual
     engine's contract and has a balance dimension; it is named here rather than
     shipped quietly. */
export const SAFE_SKIP_REASONS = Object.freeze([
  'idle',            // SKIP.NO_ACTIVITY
  'below_min_span',  // SKIP.TOO_SOON      — see the bounded cost above
  'nothing_accrued', // SKIP.NOTHING
]);

/**
 * Classify a `{accrued:false, reason}` from the accrual engine.
 * @returns 'nothing' (safe to switch) | 'refused' (switching would confiscate)
 */
export function classifySkip(reason) {
  return SAFE_SKIP_REASONS.includes(reason) ? 'nothing' : 'refused';
}

/**
 * THE ONE IMPLEMENTATION OF "MAY I SWITCH NOW?".
 *
 * Deliberately a pure function of a verdict object rather than a branch inside
 * the runner: this is the rule the other eight intents inherit, and a rule that
 * lives inside a call site is a rule that gets copied slightly differently the
 * second time.
 *
 * @param v  { outcome, error?, version, detail? }
 * @returns  { proceed: boolean, version: number|null, error: string|null }
 */
export function collectGate(v) {
  const outcome = v && v.outcome;
  if (outcome === 'paid' || outcome === 'nothing') {
    return { proceed: true, version: v.version ?? null, error: null };
  }
  if (outcome === 'refused') {
    return { proceed: false, version: null, error: (v && v.error) || 'collect_failed' };
  }
  /* FAIL CLOSED. An outcome this function does not recognise is a caller that
     has changed without changing this rule, and the safe answer to "I do not
     know whether the window was paid" is "then do not confiscate it". */
  return { proceed: false, version: null, error: 'collect_unknown' };
}

/**
 * The journal intent NAME. See "THE KEY" above — the target is part of the name
 * because `hr_apply`'s `intent_mismatch` compares exactly this string.
 *
 * Exported and pure so the client, the server and the tests derive it from one
 * function rather than three format strings that agree today.
 */
export function intentNameFor(verb, kind, id) {
  if (!kind || kind === 'idle') return `${verb}:idle`;
  return `${verb}:${kind}:${id}`;
}

/** Is this verb one this build implements? */
export function isKnownVerb(verb) {
  return typeof verb === 'string' && Object.prototype.hasOwnProperty.call(INTENT_REGISTRY, verb);
}

/* ── THE ACCRUAL KEY — DERIVED, NOT ACCEPTED ────────────────────────────────
   Lives HERE rather than in index.ts because TWO verbs now derive it: the
   `accrue` verb, and the COLLECT that every collect-before-switch intent runs
   first. A second copy would be a drift generator, and the property that copy
   would destroy is a good one:

     an `accrue` call and a `set_activity` call racing on the SAME watermark
     derive the SAME key, so the loser is a replay and the window is paid
     EXACTLY ONCE — across two verbs that have never heard of each other.

   ⚠ SALTED WITH A SERVER SECRET (review S6). A key derived only from
     (user, slot, watermark) is COMPUTABLE BY THE PLAYER: hr_load returns
     `accrued_to` so the UI can render a countdown. `hr_seed(user, slot,
     'intent:accrue:<watermark>')` mixes a 256-bit secret held in a table with
     RLS on, no policy and no client grant, which makes the key unguessable
     while keeping it identical across two concurrent invocations — the only
     property the derivation actually needed.

   SHA-256, formatted as a v4-shaped uuid (the version/variant bits are set so
   Postgres's uuid type accepts it and it can never collide with a real v4). */
export async function intentIdFor(user, slot, watermark, salt, attempt) {
  const label = `hr-accrue|${user}|${slot}|${watermark}|${salt}|${attempt}`;
  const buf = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label)));
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = Array.from(buf.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
