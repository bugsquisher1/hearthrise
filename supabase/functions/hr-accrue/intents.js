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
// ⚠ A RULE IN THIS FILE THAT NO CODE PATH READS IS NOT A RULE. Everything
//   declarative here — the registry, the skip classification, the catalogue
//   lookup — is READ by the implementation at runtime and mutation-proven by
//   tests/activity-intent.mjs (A17, A19). The first revision shipped an
//   `INTENT_REGISTRY` that nothing read: intent #2 could have declared
//   `collectsFirst:true`, never collected, spent the wrong rate bucket, and
//   every guard would have stayed green. Do not add a field here without a
//   reader and a mutation.
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
//    ⚠ A REFUSAL THAT REACHED THE DATABASE CARRIES THE ENVELOPE TOO. The seam
//      tells the client to put its optimistic local pointer back to what the
//      envelope says; a refusal with no envelope makes that instruction
//      unexecutable, and the client's only remaining option is to keep its own
//      guess — which is the one thing a client is never allowed to do. See
//      §"WHICH REFUSALS CARRY STATE" below: the exceptions are enumerated, each
//      has a reason, and `refusalCarriesState()` is the single implementation.
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
//    and it is exhaustively tested. WHICH intents collect is the registry's
//    `collectsFirst` column, and `collectsFirst()` is the only reader of it.
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
//   · the accrual key is `sha256(user, slot, watermark, version, SALT, attempt)`
//     where SALT = hr_seed(user, slot, 'intent:accrue:<watermark>') mixes a
//     256-bit secret held in a table with RLS on, no policy and no client grant.
//     It is not computable from anything hr_load returns.
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
//
// ⚠ AND THE NAME IS NOT ENOUGH ON ITS OWN, BECAUSE IT DOES NOT NAME THE SLOT.
//   `intentNameFor` yields 'set_activity:combat:goblin' for slot 0 and slot 1
//   alike, and `set_activity:idle` is worse still — every STOP a player makes
//   shares one name. Measured against production on 2026-08-15, rolled back:
//   one key applied on slot 0, then replayed on slot 1, answered
//   `ok:true, replayed:true` and APPLIED NOTHING (slot 1 gold 500 → 500), while
//   a control with a fresh key applied (500 → 507). The fix is one comparison
//   in `hr_apply` — `player_intents.slot` already records the slot and was
//   simply never read — and it is staged in
//   supabase/migrations/2026-08-15-intent-key-hygiene.sql. It covers all nine
//   intents at once, which is why it is not solved a tenth time out here.
//
// ════════════════════════════════════════════════════════════════════════════
// A REJECTED INTENT IS RETRIED WITH A **NEW** KEY
// ════════════════════════════════════════════════════════════════════════════
// This is the rule the first revision of this file got backwards, and it is the
// one rule a client can get wrong in a way that produces a silent 25-hour
// outage rather than an error. Measured against production, rolled back:
//
//     (1) apply, stale version   → {"ok":false,"error":"version_conflict"}
//     (2) retry, SAME key,
//         CORRECT version        → {"ok":false,"error":"version_conflict",
//                                   "replayed":true}
//     (3) control, NEW key,
//         CORRECT version        → {"ok":true}
//
// Same delta, same correct version. Only the key differed, and the key the old
// text told you to reuse could never succeed. The mechanism is `hr_apply` step
// (5): the decision — success OR rejection — is recorded under the key OUTSIDE
// the protected block, so it survives the rollback, and step (3) hands the
// stored decision back to every later call that presents the same key.
//
//   ⇒ RULE: a REJECTED intent is retried with a NEW idempotency key.
//     Only an UNANSWERED one — a timeout, an aborted fetch, a dropped socket —
//     reuses the old key. That is the case idempotency exists for: "I do not
//     know whether it landed." A refusal is an ANSWER; the client knows.
//
// A new key is always safe after a refusal, whatever the stage, because a
// refusal applied nothing: the collect refuses before the switch is attempted,
// and hr_apply's protected block rolls back in full. There is no partial effect
// for a second key to duplicate.
//
// ── AND THE HALF THAT HAS NO CLIENT TO WORK AROUND IT ──────────────────────
// The COLLECT's key is derived, not chosen, so "use a new key" is not advice it
// can take. A rejection does not advance `accrued_to`, so the next call
// re-derives from the same watermark. Two things keep that from becoming a
// permanent deadlock, and they are complementary rather than redundant:
//
//   (a) `version` IS PART OF THE DERIVATION (here). A `version_conflict` means
//       the state moved under us; the next call reads the NEW version and
//       therefore derives a DIFFERENT key. The property the derivation exists
//       for is untouched — two verbs racing on one watermark read the SAME
//       version and still land on the SAME key, so the loser is a replay and
//       the window is paid exactly once. And where they read DIFFERENT versions
//       they could never both have applied anyway: `hr_apply` refuses the stale
//       one at step (4). So this can only ever turn a poisoned replay into an
//       honest conflict, never a single payment into two.
//
//       This is what makes intent #2 survivable. A gold spend or a craft bumps
//       `version` WITHOUT stamping `accrued_to`, which is precisely the shape
//       that re-derives an identical key forever; today it is rare because
//       nothing else writes, and the day a second intent ships it is routine.
//
//   (b) `hr_apply` RELEASES A KEY IT CLAIMED ITSELF WHEN THE DECISION WAS
//       `version_conflict` (staged, 2026-08-15-intent-key-hygiene.sql). A
//       version conflict is a statement about the caller's READ, not about the
//       delta, it is rolled back in full, and the defined recovery is "re-read
//       and try again" — so storing it converts an ordinary concurrency outcome
//       into a lockout for any caller whose key cannot change. That covers the
//       CLIENT-chosen keys too, which (a) cannot.
//
// RESIDUAL, STATED: a rejection that is neither a version conflict nor a
// DEGRADABLE clamp still sticks to a derived key until `hr_intents_prune` runs
// (`17 * * * *`, 24h window ⇒ ≤25h). The clamp family escapes through the
// accrue verb's degrade ladder, which re-derives with `attempt+1` and, at the
// end, forfeits — moving the watermark and freeing every key derived from it.
// What is left is `bad_delta` / `insufficient_item` / `unknown_item`: engine
// bugs, not player-reachable states. If one of those ever becomes routine, the
// answer is to widen the release set in hr_apply, not to un-derive the key.
//
// ════════════════════════════════════════════════════════════════════════════
// ⚠ THE SECTION BELOW IS `set_activity`'s WIRE. Each intent's own wire lives in
//   its own module header, for the reason this one states: the two sides of a
//   wire must not be able to drift apart in different folders, and a single
//   "the seam" section that nine verbs share would drift from all nine at once.
//   What is GENERAL — the key rule, the refusal taxonomy, the envelope
//   contract, the registry — is up here and is the same for every verb.
//     · set_activity  — below, and src/net/activity.js implements it.
//     · claim_reward  — ./claim-reward.js §"THE CLIENT SEAM" (b349, server half
//                       only; the six grant sites it covers are named there).
//
// ════════════════════════════════════════════════════════════════════════════
// THE CLIENT SEAM — the wire, specified. NOT YET IMPLEMENTED (b345).
//
// The client half is deliberately not written here: src/legacy.js is held by
// another workstream and the seam runs through it. This is the specification it
// implements, kept in the CONTRACT file rather than in a design doc so the two
// sides of the wire cannot drift apart in different folders.
//
// ⚠ THE SEAM DEPENDS ON A MIGRATION, NOT ONLY ON A DEPLOY. Two of the rules
//   below — "a rejection is retried with a new key and that retry can succeed"
//   and "one key means one thing on one slot" — are enforced in `hr_apply`.
//   supabase/migrations/2026-08-15-intent-key-hygiene.sql must be APPLIED, not
//   merely staged, before the client half is written.
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
//
//        `activity` IS READ OUT OF `state`, NOT ECHOED FROM THE REQUEST. The
//        first revision echoed the client's own declaration back at it, so a
//        replayed switch reported what the CLIENT said while `state` reported
//        what the SERVER did — two fields in one body disagreeing, with the
//        forged-looking one on top. If they can disagree, only one of them is
//        the server's, and the other should not exist.
//
//        `collected` is the RECEIPT for the window this call paid on the way
//        through, stated by the server. RENDER IT, DO NOT RECOMPUTE IT. It is
//        null when there was nothing to collect, and null when the COLLECT
//        itself was a replay — but it is PRESENT on a replayed SWITCH whose
//        collect applied, which is the case the first revision got wrong:
//        measured, 3,809 gold and 744 kills of genuinely applied payment were
//        reported as `null` because the SWITCH half was a replay. The test is
//        "did THIS invocation's collect apply", never "was the switch a replay".
//   200 {ok:true, replayed:true, …}                this exact intent already landed
//   400 {ok:false, error:'unknown_verb'|'missing_intent_id'|'bad_activity'}
//   409 {ok:false, error:'no_character'|'unknown_activity'|'activity_unsupported'}
//   409 {ok:false, error:<code>, stage:'collect', …envelope}
//        NOTHING CHANGED and the elapsed window is INTACT. Recovery: run the
//        `accrue` verb — it owns the degrade ladder, which is what escapes a
//        clamp — then retry the switch WITH A NEW KEY. Never retry the switch
//        alone in a loop.
//   409 {ok:false, error:'version_conflict'|'intent_mismatch', stage:'switch',
//        collected, …envelope}
//        ⚠ `collected` IS PRESENT HERE, AND IT IS NOT A CONTRADICTION. The
//        collect and the switch are two applies (rule 4): a refused switch does
//        not roll the payment back. The player was paid and did not switch, and
//        the body has to be able to say both. Render the receipt, then reconcile
//        the pointer to the envelope.
//   429 {ok:false, error:'rate_limited'}           30/min. Back off; do not spin.
//
//   Every body — success and refusal alike — carries `verb`, so one dispatcher
//   can route a response without remembering what it asked for.
//
// ── WHICH REFUSALS CARRY STATE, AND WHY THE OTHERS CANNOT ──────────────────
//   Every refusal that reached the database carries the full `hr_state_of`
//   envelope (`state`, `version`, `now`, `skills`, `inventory`, `equipment`,
//   `farm`, `progress`, `total_level`) plus a top-level `activity` read out of
//   it, so "reconcile to the envelope" is one code path for success and failure
//   alike. `refusalCarriesState(error)` is the single implementation and the
//   test asserts it against the reachable set.
//
//   FOUR do not, and each is a decision rather than an omission:
//     missing_intent_id / bad_activity / activity_unsupported / unknown_activity
//                     refused on SHAPE, before any database work. Reading a
//                     state envelope for them would let a malformed client
//                     spend a real player's rate budget by looping on garbage —
//                     the exact property A10 measures.
//     rate_limited    the gate exists so an over-caller does NOT pay for a full
//                     envelope read (player_state + fifteen skills + the whole
//                     inventory + every farm plot + up to 1,000 progress rows).
//                     Attaching one here would hand the budget back.
//     no_character    there is no state to send. `hr_state_of` itself answered
//                     `no_character`; an empty object would be a lie.
//   In all four, nothing was written, so the client's LAST envelope is still
//   current — which is what it must reconcile to. Never to its own guess.
//
// ── THE IDEMPOTENCY KEY — THE ONE RULE A CLIENT CAN GET WRONG ──────────────
//   ONE KEY PER ATTEMPT AT A GESTURE. Generate it with crypto.randomUUID() when
//   the player taps a monster. Reuse it ONLY when the call was UNANSWERED — a
//   timeout, an aborted fetch, a dropped socket — because that is the case where
//   the client genuinely does not know whether the intent landed, and reuse is
//   what makes the retry safe.
//
//   ⇒ ON ANY ANSWERED REFUSAL, THROW THE KEY AWAY AND GENERATE A NEW ONE.
//     A refusal is recorded under the key by `hr_apply`, and (except for a
//     version conflict, which is released) presenting it again returns the same
//     refusal — for up to 25 hours. See §"A REJECTED INTENT IS RETRIED WITH A
//     NEW KEY" above for the measurement.
//
//   Reusing a key for a DIFFERENT target answers `intent_mismatch` (loud, and
//   nothing is applied) rather than silently leaving the player on the old one —
//   that is the whole reason `journal.intent` names the target. Reusing it for
//   the SAME target answers `replayed:true`, which is what makes a retry safe.
//   Reusing it on a DIFFERENT SLOT answers `intent_mismatch` too, once
//   2026-08-15-intent-key-hygiene.sql is applied.
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
//     envelope says — never to what the client guessed. When the refusal carries
//     no envelope (the four named above) nothing was written, so the last
//     envelope the client holds is still the server's answer.
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
 *  ⚠ EVERY COLUMN IS READ ON THE HOT PATH. `rateBucketFor`, `requiresKey` and
 *    `collectsFirst` below are the only readers, and the implementations call
 *    them instead of hard-coding — so a wrong row here is a wrong BEHAVIOUR, in
 *    a test, rather than a comment nobody checks. tests/activity-intent.mjs A19
 *    mutation-proves each column: change `bucket` and the call is refused,
 *    change `needsKey` and a keyless call reaches the database, change
 *    `collectsFirst` and the elapsed window is confiscated.
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
  /* ── THE GOLD VERBS (b351) ────────────────────────────────────────────────
     `collectsFirst: false`, and it is a RULING rather than an omission. Rule 3
     applies to an intent that CLOSES THE ACCRUAL WINDOW, and hr_apply closes it
     on exactly three delta keys — `activity`, `equip`, and an explicit
     `accrued_to`. A gold spend carries none of them, so the elapsed window
     survives the purchase untouched and there is nothing to confiscate.

     That is a property of the DELTA, not of the verb, so it is not left as a
     comment: `guardStampKeys()` below re-checks it against the delta each verb
     actually built, and the verb refuses itself if the two ever disagree.
     Someone who later adds `equip` to a shop_buy delta (buy-and-wield in one
     tap is an obvious feature request) gets a loud refusal instead of a silent
     confiscation.

     ONE bucket for both, not two. They are one surface — the NPC shop — and a
     player who is spamming it should exhaust one budget, not two. The cost is
     stated rather than discovered: a client selling forty stacks in a loop can
     rate-limit its own next purchase. Batch the sell; do not widen the gate. */
  shop_buy: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),
  vendor_sell: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),
  /* b349 — THE FIRST GRANT INTENT. `collectsFirst: false`, and that is a
     DERIVED fact rather than a preference: hr_apply stamps `accrued_to = now()`
     on a delta carrying `equip` or `activity` and on nothing else
     (apply-engine.sql §S5). A claim's delta carries gold, gems, progress,
     progress_claim and journal, so it does NOT close the window and there is
     nothing to confiscate — collecting first would cost a round trip and buy
     nothing.

     ⚠ THAT IS AN INVARIANT ABOUT A DELTA, NOT A STATEMENT ABOUT A VERB, so it
       is checked at RUNTIME by `deltaClosesWindow` / `guardStampKeys` below
       rather than asserted here in prose. The day someone adds `equip` to a
       claim's delta — a "claim this and equip it" reward, which is an obvious
       thing to want — this row silently becomes a confiscation. The runtime
       check turns that into a refusal (`would_confiscate`) instead. */
  claim_reward: Object.freeze({ bucket: 'claim', needsKey: true, collectsFirst: false }),
  /* b354 — THE UNLOCK PURCHASE. The `shop` bucket, with shop_buy and
     vendor_sell, because it is the same surface: a player spamming the shop
     should exhaust ONE budget, not three. A new bucket would also need a new
     arm in hr_rate_gate, i.e. another link on that derivation chain, for a verb
     that a player uses 45 times in the lifetime of a character.

     `collectsFirst: false`, and it is DERIVED rather than preferred: hr_apply
     stamps `accrued_to = now()` on a delta carrying `equip` or `activity`, and
     this verb PROPOSES NO DELTA AT ALL — its commit point is hr_unlock_buy,
     which writes gold, one progress row and one ledger row and never touches
     accrued_to. So the window survives the purchase and there is nothing to
     confiscate. That is an invariant about a FUNCTION rather than about a
     delta, so `guardStampKeys` cannot grade it; it is asserted where it lives,
     in 2026-08-16-unlock-buy.sql §6(b), by measuring accrued_to across a real
     purchase. */
  unlock_buy: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),
  /* ── b355 — THE MARKET VERBS. THE FIRST CROSS-PLAYER TRANSFER. ────────────
     `bucket: 'shop'`, and it is a RULING with a cost, so it is argued:

       · hr_rate_gate's bucket list is a `case` in SQL and an unknown bucket
         FAILS CLOSED. Adding a fifth arm means `create or replace`-ing
         hr_rate_gate — and 2026-08-16-claim-reward.sql is the LAST file that
         may do that, while 2026-08-17-market-v2.sql deliberately declines to
         touch it ("a second writer with its own allowance would raise a
         compromised engine's total reachable write rate"). A registry row
         naming a bucket the gate does not know is not a wider budget, it is a
         verb that 429s on its first call, forever.
       · So the market rides the `shop` allowance: 30/min, shared with
         shop_buy, vendor_sell and unlock_buy. That is TIGHTER than the fuse the
         RPCs spend for themselves (`apply`, 240/min via hr_rate_ok), so the
         Edge gate is the binding one and this file adds no reachable write
         rate at all. THE COST, stated rather than discovered: a player sweeping
         the market can rate-limit their own next NPC purchase. Batch the
         gesture; do not widen the gate.

     `collectsFirst: false`, and it is DERIVED, not preferred: hr_apply stamps
     `accrued_to = now()` on a delta carrying `equip` or `activity`, and these
     three verbs PROPOSE NO DELTA AT ALL — their commit points are
     hr_market_list / hr_market_cancel / hr_market_buy, which write inventory,
     gold, the escrow and the journal, and bump `version`, and touch
     `accrued_to` nowhere. So the unpaid accrual window survives a trade and
     there is nothing to confiscate. `guardStampKeys` cannot grade an invariant
     about a FUNCTION (the unlock_buy situation exactly); it is asserted where
     it lives, in 2026-08-17-market-v2.sql §11, and re-asserted behaviourally by
     tests/market-v2.mjs. */
  market_list: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),
  market_cancel: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),
  market_buy: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),
  /* ── b366 — THE EQUIP VERB. THE FIRST VERB THAT MUST COLLECT SINCE #2. ────
     `collectsFirst: TRUE`, and it is the ONE row in this registry where that is
     true besides `set_activity`. It is DERIVED, not chosen:
     `STAMPING_DELTA_KEYS` is `['equip','activity']` — hr_apply stamps
     `accrued_to = now()` on an `equip` delta, exactly as it does on an
     `activity` one — so an equip that did NOT collect first would silently
     discard every unpaid second since the last settle. At a 90 s cadence that
     is up to 90 seconds of gold, XP and drops per equip gesture, and a player
     re-gearing between fights would lose it on every swap, invisibly.

     `guardStampKeys` re-checks this against the delta this verb actually
     builds, so the row and the behaviour cannot drift apart; a row flipped to
     `false` produces `would_confiscate` rather than a confiscation.

     ⚠ THE COLLECT AND THE EQUIP ARE TWO APPLIES, and the order matters in one
       direction only: the window is priced against the equipment the player had
       WHILE they were wearing it, and only then does the swap land. Collecting
       AFTER would price the whole unpaid span at the NEW gear — which is the
       12.8x gold / 20x XP naked->BiS exposure live-settlement.md §12(1) names,
       turned from a 90 s residue into a deliberate, repeatable exploit ("fight
       naked all night, equip BiS, settle").

     `bucket: 'activity'`, shared with set_activity, because they are one
     surface — the character's own pointer and loadout — and a player spamming
     that surface should exhaust ONE budget. 30/min against a gesture a human
     performs a few times a minute. THE COST, stated rather than discovered: a
     client applying a 15-slot loadout as fifteen calls can rate-limit its own
     next activity switch. Batch the loadout into ONE call (the wire takes a
     map, and `MAX_EQUIP_OPS` is exactly the slot count for that reason); do not
     widen the gate. */
  equip: Object.freeze({ bucket: 'activity', needsKey: true, collectsFirst: true }),
});

/** The registry columns every row must carry, exported so the guard reads the
    contract instead of restating it — a hard-coded list cannot notice a column
    being ADDED, which is the direction that produces decoration. */
export const REGISTRY_FIELDS = Object.freeze(['bucket', 'needsKey', 'collectsFirst']);

/** Is this verb one this build implements? */
export function isKnownVerb(verb) {
  return typeof verb === 'string' && Object.prototype.hasOwnProperty.call(INTENT_REGISTRY, verb);
}

/**
 * The registry row for a verb. THROWS on an unknown one rather than returning a
 * default: a default here is how a new intent silently inherits `accrue`'s rate
 * budget and skips the collect. index.ts already refuses an unknown verb at the
 * door with `unknown_verb`, so reaching this with one is a programming error and
 * a 500 is the honest report of it.
 */
export function intentSpec(verb) {
  if (!isKnownVerb(verb)) throw new Error(`intents: no registry row for verb '${verb}'`);
  return INTENT_REGISTRY[verb];
}

/** Which `hr_rate_gate` bucket this verb spends. THE ONLY SOURCE OF IT — a
    literal at a call site is a second registry. */
export function rateBucketFor(verb) { return intentSpec(verb).bucket; }

/** Must the caller supply an idempotency key? */
export function requiresKey(verb) { return intentSpec(verb).needsKey === true; }

/** Does rule 3 (collect before switch) apply to this verb? */
export function collectsFirst(verb) { return intentSpec(verb).collectsFirst === true; }

/* ── WHICH DELTA KEYS CLOSE THE ACCRUAL WINDOW ──────────────────────────────
   apply-engine.sql §S5:

       if p_delta ? 'equip' or p_delta ? 'activity' then
         v_accrued := now();

   Those two keys, and only those two. That single line is what makes rule 3
   load-bearing for `set_activity` and what makes it UNNECESSARY for a claim —
   so the rule is not "every intent collects", it is "every intent whose delta
   contains one of these collects". Stated as a LIST WITH A READER, because the
   registry column that encodes the answer is otherwise a comment: a future
   claim-and-equip reward would flip the truth without flipping the row, and the
   symptom is a silently confiscated night, not an error. */
export const STAMPING_DELTA_KEYS = Object.freeze(['equip', 'activity']);

/** Would applying this delta stamp `accrued_to = now()` and therefore discard
    any unpaid window? Own-property, so a poisoned `__proto__` cannot answer. */
export function deltaClosesWindow(delta) {
  if (!delta || typeof delta !== 'object') return false;
  return STAMPING_DELTA_KEYS.some((k) => Object.prototype.hasOwnProperty.call(delta, k));
}

/** Machine codes this layer produces itself. Everything else is `hr_apply`'s own
    code, returned verbatim so it survives to the client and to `hr_rejections`. */
export const INTENT_ERRORS = Object.freeze({
  UNKNOWN_VERB: 'unknown_verb',                 // 400 — this build has no such intent
  MISSING_INTENT_ID: 'missing_intent_id',       // 400 — no key, or not a canonical uuid
  BAD_ACTIVITY: 'bad_activity',                 // 400 — the declaration is malformed
  ACTIVITY_UNSUPPORTED: 'activity_unsupported', // 409 — a real kind the server cannot pay YET
  UNKNOWN_ACTIVITY: 'unknown_activity',         // 409 — not in the authored data
  NO_CHARACTER: 'no_character',                 // 409 — nothing to act on in this slot
  RATE_LIMITED: 'rate_limited',                 // 429
  /* 409, stage:'collect'. The elapsed window could not be priced, so switching
     would confiscate it. Nothing was written; the window is intact. */
  UNCOLLECTABLE_WINDOW: 'uncollectable_window',

  /* ── THE GOLD VERBS (b351) ───────────────────────────────────────────────
     Read the pairs. Each one exists because collapsing it into its neighbour
     would tell a player something false about the game:
       unknown_offer      there is no such offer, at all
       offer_unsupported  the offer is REAL and this build cannot sell it —
                          the refusal carries WHY (`unimplemented_field:reqLv`,
                          `unpayable_cost:currency:gems`, `not_repeatable`)
       unknown_item       there is no such item
       item_not_sellable  the item is real and the vendor bids 0 for it */
  BAD_OFFER: 'bad_offer',                   // 400 — absent or malformed offer id
  BAD_QTY: 'bad_qty',                       // 400 — absent, non-integer, or out of [1, MAX_QTY]
  UNKNOWN_OFFER: 'unknown_offer',           // 409 — not in the price catalogue
  OFFER_UNSUPPORTED: 'offer_unsupported',   // 409 — a real offer this build cannot price/grant
  BAD_ITEM: 'bad_item',                     // 400 — absent or malformed item id
  UNKNOWN_ITEM: 'unknown_item',             // 409 — not in src/data/items.js
  ITEM_NOT_SELLABLE: 'item_not_sellable',   // 409 — the vendor's bid is 0
  /* 409. The registry says this verb collects before it acts and this verb
     implements no collect. Fail-closed: refusing costs one tap, proceeding
     confiscates a night. Unreachable while the registry is correct, which is
     precisely why it is a REFUSAL and not an assertion in a comment. */
  COLLECT_REQUIRED: 'collect_required',
  /* 409. The delta this verb built carries a key that CLOSES the accrual
     window, and the verb does not collect first. See guardStampKeys. */
  DELTA_WOULD_STAMP: 'delta_would_stamp',

  /* ── b349, THE GRANT INTENT ─────────────────────────────────────────────── */
  BAD_REWARD: 'bad_reward',                 // 400 — the naming is malformed
  UNKNOWN_REWARD: 'unknown_reward',         // 409 — no such claimable, ever
  /* 409 — a REAL claimable this server cannot own YET. Carries `needs`, read
     out of the registry, so the answer says what would unblock it. The exact
     shape `activity_unsupported` has, and for the same reason: a player told
     "bad request" when the truth is "the server does not track your Renown yet"
     files a bug against the wrong system. */
  REWARD_UNAVAILABLE: 'reward_unavailable',
  /* 500-shaped, refused before the apply. The proposed delta would stamp
     accrued_to (see deltaClosesWindow) on a verb whose registry row says it
     does not collect first. Refusing costs one gesture; proceeding costs an
     unpaid night, silently. FAIL CLOSED. */
  WOULD_CONFISCATE: 'would_confiscate',

  /* ── b354, THE UNLOCK PURCHASE ────────────────────────────────────────────
     Only the codes THIS LAYER produces are listed; the seven that come out of
     `hr_unlock_buy` — already_owned, rung_skipped, prereq_property_tier,
     prereq_item, insufficient_gold, insufficient_item, unlock_daily_cap — are
     the function's own and are returned verbatim, exactly as hr_apply's are.
     Restating them here would be a second taxonomy that agrees today.

     `bad_offer` / `unknown_offer` / `offer_unsupported` are SHARED with
     shop_buy and are already above: one code means one thing, and "this build
     cannot sell that offer" is the same fact whichever verb was asked. */

  /* ── b355, THE MARKET VERBS ───────────────────────────────────────────────
     TWO codes, and only two, because only two facts are decidable in this
     process. Everything a market call can be refused for is a fact about a ROW
     — the escrow, the listing, the buyer's balance, the seller's day — and
     every one of those is hr_market_*'s own code, returned VERBATIM exactly as
     hr_apply's are. The reachable set, named here so a reader does not have to
     read 2,100 lines of SQL to know what a client must handle, but NOT
     restated as constants (a second taxonomy is a taxonomy that agrees today):

       list    not_tradeable · bad_qty · bad_price · listing_too_large ·
               too_many_listings · insufficient_item · market_list_daily_cap
       cancel  gone · not_yours · wrong_slot · bank_full
       buy     gone · expired · not_enough · own_listing · insufficient_gold ·
               bank_full · seller_unavailable · trade_too_large ·
               market_spend_daily_cap · market_proceeds_daily_cap ·
               listing_moved
       all three  no_character · version_conflict · intent_mismatch ·
               intent_in_flight · rate_limited · forbidden_impersonation ·
               missing_intent_id · bad_market_write

     `bad_qty` is SHARED with the gold verbs and stays shared: one code means
     one thing, and "that is not a usable count" is the same fact whichever verb
     was asked. */
  BAD_LISTING: 'bad_listing',   // 400 — absent, or not a canonical uuid
  /* 400 — absent, non-integer, or outside [1, MAX_ASK]. A SEPARATE code from
     the server's `bad_price` on purpose: this one means "your request did not
     contain a readable price", which the client can fix by re-reading its own
     form, and the server's means "the price you named is outside the market's
     bounds". Collapsing them would tell a player with a broken input box that
     the market has a rule they broke. */
  BAD_ASK: 'bad_ask',

  /* ── b366 — THE EQUIP VERB ───────────────────────────────────────────────
     ONE shape code produced HERE, and everything else about an equip is
     hr_apply's own vocabulary returned verbatim:

       bad_equip            400/409 — the map is unreadable, OR hr_apply refused
                            its shape under the lock. SHARED WITH hr_apply
                            DELIBERATELY, and it is the same bargain
                            `unknown_item` already struck: one code means one
                            thing ("that is not a usable equip instruction"),
                            and the `stage` field says which layer said it.
       unknown_equip_slot   409 — no such slot (hr_equip_slots)
       wrong_slot           409 — real item, real slot, does not fit
                            ⚠ SHARED with market_cancel's `wrong_slot`, which
                              means a CHARACTER slot. Two meanings, one code —
                              tolerated only because the two can never appear on
                              one verb, and flagged here so the next person does
                              not discover it in a support ticket.
       unknown_item         409 — not in hr_items
       requirement_not_met  409 — the reqSkill/reqLv gate, against SERVER skills
       insufficient_item    409 — the player does not own a copy. THIS IS THE
                            DUPE REFUSAL: equipping is a TRANSFER, the debit is
                            the ownership check, and there is nothing else to
                            check.
       too_many_equip_ops   409 — more ops than hr_apply's c_max_equip_kinds

     None of them is minted here except `bad_equip`, because inventing a second
     name for a refusal the database already names is how a taxonomy stops
     meaning one thing per code. */
  BAD_EQUIP: 'bad_equip',
});

/* ── THE REFUSALS THAT CANNOT CARRY AN ENVELOPE ────────────────────────────
   Four, enumerated, each with its reason in §"WHICH REFUSALS CARRY STATE"
   above. This is an ALLOWLIST OF EXEMPTIONS and everything else must carry
   state: a code added to the taxonomy without a decision therefore lands on the
   side that keeps the client's instruction executable. */
export const STATELESS_REFUSALS = Object.freeze([
  INTENT_ERRORS.MISSING_INTENT_ID,
  INTENT_ERRORS.BAD_ACTIVITY,
  INTENT_ERRORS.ACTIVITY_UNSUPPORTED,
  INTENT_ERRORS.UNKNOWN_ACTIVITY,
  INTENT_ERRORS.RATE_LIMITED,
  INTENT_ERRORS.NO_CHARACTER,
  /* The gold verbs' shape refusals, and they are on this list for exactly the
     reason the activity ones are: every one is answered from the CATALOGUE,
     which is in-process, BEFORE the rate gate and before any database work.
     Reading a state envelope for them is the database work the shape check
     exists to avoid.

     ⚠ `unknown_item` HAS TWO PRODUCERS AND ONLY ONE OF THEM CAN BE LIVE.
       hr_apply raises the same code from its own `hr_items` lookup — and that
       refusal DID reach the database and does carry an envelope. The two can
       only both fire if `hr_items` has drifted from src/data/items.js, which
       `node tools/gen-catalogues.mjs --check` makes a build failure (it is a
       preflight in tests/run-smoke.mjs) and tests/gold-intents.mjs re-asserts
       as set containment against the real generated SQL. Stated here rather
       than left as a coincidence, because a code that means two things is how
       an error taxonomy stops being one. */
  INTENT_ERRORS.BAD_OFFER,
  INTENT_ERRORS.BAD_QTY,
  INTENT_ERRORS.UNKNOWN_OFFER,
  INTENT_ERRORS.OFFER_UNSUPPORTED,
  INTENT_ERRORS.BAD_ITEM,
  INTENT_ERRORS.UNKNOWN_ITEM,
  INTENT_ERRORS.ITEM_NOT_SELLABLE,
  /* b349 — the grant intent's three SHAPE-AND-REGISTRY refusals. Same reason as
     the activity three above them: all are answered from the request and the
     frozen registry, before any database work, so reading a state envelope for
     them would hand a malformed client the rate budget the check exists to
     protect (property A10 measures). Nothing was written, so the client's LAST
     envelope is still current — which is what it reconciles to.
     `would_confiscate` is deliberately NOT here: it is an ENGINE bug reached
     after a real read, the caller has already paid for the envelope, and a
     refusal it cannot reconcile from would leave the client guessing. */
  INTENT_ERRORS.BAD_REWARD,
  INTENT_ERRORS.UNKNOWN_REWARD,
  INTENT_ERRORS.REWARD_UNAVAILABLE,
  /* b355 — the market verbs' two SHAPE refusals, on this list for the reason
     every other shape refusal is: both are answered from the parsed request
     alone, BEFORE the rate gate and before any database work, so reading a
     state envelope for them is the database work the check exists to avoid.
     Nothing was written, so the client's LAST envelope is still current.
     ⚠ NOTHING ELSE THE MARKET PRODUCES IS ON THIS LIST, and that is the point:
       every other market refusal is a fact about a ROW that was read under a
       lock, the caller has already paid for the envelope, and a `gone` or an
       `insufficient_gold` the client cannot reconcile from would leave a
       prediction outstanding — which is how a local offset becomes permanent. */
  INTENT_ERRORS.BAD_LISTING,
  INTENT_ERRORS.BAD_ASK,
  /* b366 — the equip verb's ONE shape refusal, answered from the parsed request
     and the in-process catalogue BEFORE the rate gate and before any database
     work. Nothing was written and, critically, NO COLLECT RAN — which is what
     makes a malformed equip cost the player nothing at all rather than a
     confiscated window.
     ⚠ `bad_equip` HAS TWO PRODUCERS, exactly like `unknown_item`: hr_apply
       raises it too, from under the row lock, and THAT one reached the database
       and does carry an envelope. `refusalCarriesState` is consulted only on
       this layer's own refusals (the shape path returns before any read), so
       hr_apply's copy is never routed through this list. Stated because a code
       on a stateless allowlist that can also arrive stateful is precisely how a
       client ends up reconciling to an envelope that was never sent. */
  INTENT_ERRORS.BAD_EQUIP,
]);

/** Must a refusal with this code carry the `hr_state_of` envelope? */
export function refusalCarriesState(error) {
  return !STATELESS_REFUSALS.includes(error);
}

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

   `computeAccrual` returns `{accrued:false, reason}` for SEVEN different
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
         unknown_node          ditto, for a gathering node (2026-08-15). A
                               SEPARATE code because the two are produced by
                               different catalogues, and "unknown_monster" is a
                               lie about a missing tree
         wrong_skill           the pointer's node belongs to a different skill
                               than the character is set to — paying it would
                               credit the wrong skill's XP
         no_active_since       an inconsistent row; the span cannot be bounded
         no_cap                hr_offline_cap_ms returned 0, so NOTHING in the
                               window can be priced — see the note below

   The naive implementation treats every `accrued:false` as "nothing to do" and
   switches. That is EXACTLY the bug Tyler named: mine for three hours, declare
   "now I'm fishing", and the three hours are gone. It would also have been
   invisible — no error, no log, `ok:true`, and the player's only evidence is
   that their night was smaller than it should have been.

   ⚠ THE COUNT IS DERIVED, NOT RESTATED. The previous revision of this comment
     said SIX and the engine had SEVEN: `'no_cap'` was a bare string literal in
     accrual.js, absent from `SKIP`, absent from both lists here, and landed in
     the refusing group only because `classifySkip` fails closed. It was right by
     accident. tests/activity-intent.mjs A17 now reads `SKIP` out of accrual.js
     and asserts SAFE ∪ REFUSING is EXACTLY its value set, and that no reason is
     produced as a bare literal — so a reason added to the engine fails the build
     until somebody decides which group it belongs to.

   ⚠ `no_cap` IS A LOCKOUT, AND IT IS THE RIGHT ONE. With capMs = 0 the grant is
     0 for the whole window, so refusing means the player cannot change activity
     at all until the cap is positive again. That is deliberate: confiscating a
     window that WILL become payable is permanent, and a refusal is not. It is
     unreachable today — hr_offline_cap_ms floors at 12h — and the day something
     gates the cap to zero, this is the line that decides what happens. Decide
     it there, on purpose.

   ⚠ THE COST OF PUTTING `below_min_span` IN THE SAFE GROUP IS NOT "<60 s".
     A switch always closes the window (hr_apply stamps accrued_to
     unconditionally on an `activity` delta), so the remainder since the last
     collect is discarded — at most ACCRUE_MIN_MS − 1 ms per switch. Stating
     that as "bounded at <60 s" is the dishonest half of the truth, because the
     bound that matters to a player is a FRACTION, not an absolute: a player
     whose mean switch interval is under a minute never accumulates a payable
     span and therefore ACCRUES NOTHING AT ALL, indefinitely. Not 60 seconds —
     everything. And target-hopping is ordinary idle behaviour: chasing a bounty,
     clearing a slayer list, re-targeting after a death. The rate gate (30/min)
     bounds the CALLS, not the loss.
     Left as-is on purpose — this is balance, and balance is the Game Designer's.
     The real fix is to let a CLOSING collect simulate a sub-minute span, which
     changes the accrual engine's contract and has a balance dimension; it is
     named here rather than shipped quietly. What is fixed here is the claim. */
export const SAFE_SKIP_REASONS = Object.freeze([
  'idle',            // SKIP.NO_ACTIVITY
  'below_min_span',  // SKIP.TOO_SOON      — see the fraction note above
  'nothing_accrued', // SKIP.NOTHING
]);

/** The other half of the partition. Exported so the coverage guard can assert
    SAFE ∪ REFUSING is EXACTLY the engine's reason set — a total classification
    is checkable, a fail-closed default alone is not. `classifySkip` still fails
    closed at runtime, so a reason that reaches production unlisted refuses
    rather than confiscates. */
export const REFUSING_SKIP_REASONS = Object.freeze([
  'unsupported_activity', // SKIP.UNSUPPORTED
  'unknown_monster',      // SKIP.NO_TARGET
  'unknown_node',         // SKIP.NO_NODE      — the gather mirror of NO_TARGET
  'wrong_skill',          // SKIP.WRONG_SKILL
  'no_active_since',      // SKIP.NO_ACTIVE_SINCE
  'no_cap',               // SKIP.NO_CAP — see the lockout note above
  'unknown_recipe',       // SKIP.NO_RECIPE — the artisan member of the
                          //   NO_TARGET / NO_NODE family. Three catalogues,
                          //   three truths.
  /* SKIP.UNPAYABLE_BENCH — the recipe EXISTS and its bench is not one the
     server may pay tonight (cooking, until `noBurn`'s WRITE path is
     server-owned; see src/core/artisan-sim.js `benchPayable`).

     REFUSING, and the choice is the same one `no_cap` documents above: this is
     real work that BECOMES payable by deploying a commit, so confiscating it
     would be permanent while deferring it is not. Unlike `no_cap` it carries no
     lockout, because ./set-activity.js refuses an unpayable bench on SHAPE —
     before any database work, before the collect — so `player_state` can never
     come to hold one and this reason can never be the thing standing between a
     player and their next switch. That asymmetry is why the two can share a
     group without sharing a risk. */
  'unpayable_bench',      // SKIP.UNPAYABLE_BENCH
]);

/** Every reason this contract has an opinion about. */
export const CLASSIFIED_SKIP_REASONS = Object.freeze(
  [...SAFE_SKIP_REASONS, ...REFUSING_SKIP_REASONS],
);

/* ── THE ESCAPE HATCH, AND WHY IT IS A PARTITION OF THE REFUSING SET ────────
   (Security C3, b356.)

   A REFUSING reason costs the player nothing and defers the window — which is
   right, and which has one consequence nobody had written down: THE PLAYER
   CANNOT LEAVE. The collect refuses, the collect refusing refuses the switch,
   and every subsequent declaration — INCLUDING `idle` — gets the same 409. If a
   recipe id is renamed, or an Edge deploy is rolled back while players hold
   artisan pointers, every one of those characters is frozen on an activity the
   server will not price and cannot be told to stop doing it. That is a
   deploy-shaped outage with no client-side recovery.

   So `idle` — and ONLY `idle` — may force-close a refusing window as a
   JOURNALLED FORFEIT. It is the one declaration that cannot be about the thing
   that is stuck: the player is asking to stop, and stopping is exactly the
   operation that makes the unpriceable pointer go away.

   ⚠ BUT NOT FOR EVERY REFUSING REASON, AND THE SPLIT IS THE WHOLE DESIGN.
     Some refusals are a property of the POINTER — the pointer names something
     this build cannot price, so it will still be unpriceable in a minute, an
     hour and a week, and the ONLY thing that fixes it is clearing the pointer.
     Forfeiting there costs the player a window that was never going to be paid
     by waiting.
     The others are a property of the ABSENCE — `no_cap` (the cap function
     returned 0) and `no_active_since` (an inconsistent row). Neither is fixed
     by stopping, both are transient, and both become payable on their own. A
     forfeit there would destroy a window that waiting WOULD have paid, which is
     precisely the confiscation the whole collect-before-switch rule exists to
     prevent — and `no_cap`'s lockout was chosen DELIBERATELY over exactly that
     trade (see the note above). This list is what keeps the escape hatch from
     quietly reversing that decision.

   Fails closed: a reason not on this list does not forfeit. A new refusing
   reason is therefore a lockout until somebody decides it belongs here, which
   is the safe direction and is asserted by tests/activity-intent.mjs A17. */
export const POINTER_SKIP_REASONS = Object.freeze([
  'unsupported_activity', // the kind is not payable by this build
  'unknown_monster',      // the pointer names content that is not in the data
  'unknown_node',
  'unknown_recipe',
  'unpayable_bench',      // real content, this build cannot price the bench
  'wrong_skill',          // an inconsistent row; stopping is the repair
]);

/**
 * May an incoming `idle` declaration force-close this refused collect?
 *
 * @param kind    the kind being DECLARED (only `idle` qualifies)
 * @param reason  the engine's skip reason from the refused collect
 */
export function mayForceCloseWindow(kind, reason) {
  return kind === 'idle' && POINTER_SKIP_REASONS.indexOf(reason) !== -1;
}

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

/* ── CATALOGUE LOOKUPS ARE `hasOwnProperty`, NEVER TRUTHINESS ───────────────
   `ACTIVITY_ID_RE` is /^[a-z0-9_]{1,64}$/ — which matches `constructor` and
   matches `__proto__`. So `MONSTERS['constructor']` is the Object constructor,
   `!MONSTERS[id]` is false, and a guard written as `if (!CATALOGUE[id]) refuse`
   ADMITS BOTH. Measured on the real ITEMS/MONSTERS maps: the early check was
   bypassed and three database statements were issued where a genuinely unknown
   id issued none.

   Today that costs a wasted round trip and nothing more, because hr_apply
   re-validates the pair against the generated `hr_activities` catalogue and
   refuses it there. It stops being harmless the moment an intent does the
   ordinary next thing:

       if (!RECIPES[id]) return refuse;      // passes for 'constructor'
       const cost = RECIPES[id].cost.gold;   // reads a function's property
                                             // → undefined → a FREE craft

   So the lookup is a function, it is exported, and every catalogue guard in
   this payload calls it. */
export function catalogueGet(catalogue, id) {
  if (!catalogue || typeof id !== 'string') return undefined;
  if (!Object.prototype.hasOwnProperty.call(catalogue, id)) return undefined;
  return catalogue[id];
}

/** Is `id` an OWN key of the catalogue? The guard form of `catalogueGet`. */
export function catalogueHas(catalogue, id) {
  return catalogueGet(catalogue, id) !== undefined;
}

/**
 * The journal intent NAME. See "THE KEY" above — the target is part of the name
 * because `hr_apply`'s `intent_mismatch` compares exactly this string.
 *
 * ⚠ IT DOES NOT NAME THE SLOT, and it must not start: `player_ledger.intent`
 *   would then carry a slot number in a text column that the rollup groups on,
 *   and the same declaration on two characters would read as two different
 *   things in the journal. The slot is a COLUMN on `player_intents` and the
 *   comparison belongs in hr_apply, where it covers all nine intents at once.
 *
 * Exported and pure so the client, the server and the tests derive it from one
 * function rather than three format strings that agree today.
 */
export function intentNameFor(verb, kind, id) {
  if (!kind || kind === 'idle') return `${verb}:idle`;
  return `${verb}:${kind}:${id}`;
}

/**
 * The same rule for a verb whose target is not a `{kind, id}` activity:
 * `intentNameOf('shop_buy', 'equip.iron_sword', 5)` → `shop_buy:equip.iron_sword:5`.
 *
 * ⚠ THE QUANTITY IS PART OF THE NAME, AND THAT IS THE POINT.
 *   `journal.intent` is what hr_apply's `intent_mismatch` compares, so anything
 *   that changes WHAT THE DELTA DOES has to be in it. One key reused for "buy
 *   1 sword" and then "buy 5 swords" must be a loud refusal; without the count
 *   it answers `replayed:true, ok:true` and the player is charged for one sword
 *   while their client believes it bought five — a correctness trap with no
 *   error anywhere, which is exactly the failure the TARGET was added for.
 *
 *   It costs ledger cardinality (offers x counts instead of offers) in
 *   `player_ledger.intent`. That column is not what the rollup groups on —
 *   `kind` is — and being able to audit "who bought how many of what" is the
 *   reason a journal exists at all. Bounded by MAX_QTY either way.
 *
 * Deliberately NOT a rewrite of `intentNameFor` in terms of this, even though
 * it would produce identical strings: that function's exact source line is a
 * mutation anchor in tests/activity-intent.mjs, and a refactor that makes a
 * planted bug un-plantable disarms a guard while looking like tidying.
 * tests/gold-intents.mjs asserts the two agree on the activity shape instead.
 */
export function intentNameOf(verb, ...parts) {
  const named = parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .map((p) => String(p));
  return [verb, ...named].join(':');
}

/* ── RULE 3'S PRECONDITION, AS A FUNCTION RATHER THAN A HABIT ───────────────
   Rule 3 says "an intent must collect before it switches". What makes it
   load-bearing is a property of hr_apply, not of any verb: it stamps
   `accrued_to = now()` on a delta carrying `equip` or `activity`
   (apply-engine.sql §S5), and an explicit `accrued_to` key sets it outright.
   Any of the three CLOSES the elapsed accrual window.

   `set_activity` handles that by collecting first. The seven verbs that come
   after it mostly will NOT collect — a purchase, a sale, a craft moves value
   without touching the clock — and for them the rule reads the other way
   round: THE DELTA MUST NOT CARRY A STAMPING KEY.

   That is the half a comment cannot enforce. The realistic regression is not
   someone deleting a collect; it is someone adding `equip` to a shop_buy delta
   so the sword you just bought is also wielded — an obvious, desirable feature
   — and silently confiscating every buyer's unpaid window from then on. There
   would be no error, no log, and the only evidence is that players' nights got
   smaller.

   So it is a check, it runs on the delta the verb actually built, and it fails
   the CALL rather than the build: a delta that would confiscate is refused
   before it is ever presented to hr_apply. */
export const STAMP_KEYS = Object.freeze(['activity', 'equip', 'accrued_to']);

/** Which stamping keys this delta carries. Own properties only — a delta is
    built here, but `{"__proto__": {...}}` survives JSON.parse as an own data
    property and this function is exported for the guards to call with hostile
    shapes too. */
export function stampKeysIn(delta) {
  if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return [];
  return STAMP_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(delta, k));
}

/**
 * May `verb` present this delta?
 *
 * @returns null when it may; `{ error, keys }` when the delta would close the
 *          accrual window and the verb does not collect first.
 */
export function guardStampKeys(verb, delta) {
  const keys = stampKeysIn(delta);
  if (keys.length === 0) return null;
  if (collectsFirst(verb)) return null;
  return { error: INTENT_ERRORS.DELTA_WOULD_STAMP, keys };
}

/**
 * THE JOURNAL NAME FOR A CLAIM — and it NAMES THE PERIOD, which `intentNameFor`
 * deliberately does not do for an activity.
 *
 * The rule above is "the name must identify the THING the key was claimed for",
 * because `hr_apply`'s `intent_mismatch` compares exactly this string. For a
 * claim the thing is not (kind, key) — it is (kind, key, WHICH DAY). Without
 * the period, a client that reused Monday's key on Tuesday would get
 * `replayed: true, ok: true` and be paid NOTHING, silently, for a reward it had
 * genuinely earned. With it, Tuesday is `intent_mismatch`: loud, refused,
 * nothing applied, and a fresh key succeeds.
 *
 * ⚠ AND THE OBJECTION THAT KEEPS THE SLOT OUT DOES NOT APPLY TO A PERIOD.
 *   `intentNameFor`'s comment refuses the slot partly because
 *   `player_ledger.intent` is "what the rollup groups on". MEASURED, in
 *   2026-08-11-player-state.sql: `player_ledger_rollup`'s primary key is
 *   `(user_id, slot, month, kind)` — it does not group on `intent` at all, so a
 *   period suffix costs zero rollup rows. The surviving half of that objection
 *   is semantic ("the same declaration on two characters would read as two
 *   different things"), and it points the OTHER way here: Monday's claim and
 *   Tuesday's genuinely ARE two different things.
 *
 * A non-periodic claimable (a collection milestone, a Renown rank) gets no
 * suffix, because there is only ever one of it.
 */
export function claimIntentNameFor(verb, kind, key, period) {
  const base = `${verb}:${kind}:${key}`;
  return period ? `${base}:${period}` : base;
}

/* ── THE ACCRUAL KEY — DERIVED, NOT ACCEPTED ────────────────────────────────
   Lives HERE rather than in index.ts because TWO verbs now derive it: the
   `accrue` verb, and the COLLECT that every collect-before-switch intent runs
   first. A second copy would be a drift generator, and the property that copy
   would destroy is a good one:

     an `accrue` call and a `set_activity` call racing on the SAME watermark AND
     the SAME version derive the SAME key, so the loser is a replay and the
     window is paid EXACTLY ONCE — across two verbs that have never heard of
     each other.

   ⚠ SALTED WITH A SERVER SECRET (review S6). A key derived only from
     (user, slot, watermark) is COMPUTABLE BY THE PLAYER: hr_load returns
     `accrued_to` so the UI can render a countdown. `hr_seed(user, slot,
     'intent:accrue:<watermark>')` mixes a 256-bit secret held in a table with
     RLS on, no policy and no client grant, which makes the key unguessable
     while keeping it identical across two concurrent invocations — the only
     property the derivation actually needed.

   ⚠ AND KEYED ON `version`, WHICH IS THE ANTI-DEADLOCK HALF. See §"A REJECTED
     INTENT IS RETRIED WITH A NEW KEY". A rejection does not move `accrued_to`,
     so without `version` a refused accrual re-derives a byte-identical key
     forever and the stored refusal is handed back for up to 25 hours — to the
     accrue verb AND to every `set_activity`, which derives the same key for its
     collect. With it, a `version_conflict` (the one rejection that means "the
     state moved") produces a different key on the next call, by construction.

   ⚠ NAMED ARGUMENTS, NOT POSITIONAL, AND IT THROWS ON A MISSING ONE. Six
     positional arguments across two call sites in two languages is how the two
     verbs silently stop sharing a key — and a key that silently differs does
     not fail, it just pays twice or conflicts. A missing field is a thrown
     error, which index.ts's catch turns into a loud 500.

   SHA-256, formatted as a v4-shaped uuid: the version/variant bits are set so
   Postgres's uuid type accepts it and so it is INDISTINGUISHABLE from a client
   v4.

   ⚠ THE ORIGINAL WORDING HERE SAID IT "can never collide with a real v4". THAT
     IS FALSE, and it was load-bearing prose — b354's client seam generates real
     v4 keys for shop_buy / vendor_sell / claim_reward, so it read as a promise
     that a player cannot burn a derived accrual key on a purchase. Setting the
     version and variant bits does not carve out a subspace; it puts these keys
     in EXACTLY the same 122-bit space a v4 occupies. Nothing about the shape
     separates them.

     WHAT ACTUALLY PREVENTS THE ATTACK, stated so the next reader does not have
     to re-derive it:

       1. THE SECRET SALT. `o.salt` is read from `hr_server_secrets`, a table
          with RLS ON, zero policies and zero grants — including to `hr_engine`.
          A client cannot compute the digest because it cannot obtain the input,
          so it cannot AIM at a future accrual key. Guessing one is a 2^122
          search, which is the same statement as "v4 keys do not collide".
       2. `intent_mismatch` (apply-engine §S6). If a client ever did present a
          key the accrual path later derives, the stored intent NAME differs and
          hr_apply refuses rather than answering `replayed:true` with no payment.
          This is the branch that turns a collision from a silent 24-hour outage
          into an error.

     So the property is "unguessable, and mismatched keys are refused" — NOT
     "structurally disjoint". Rotating the salt or removing S6 breaks it; a
     change to these bits does not. */
export const INTENT_ID_FIELDS = Object.freeze(
  ['user', 'slot', 'watermark', 'version', 'salt', 'attempt'],
);

export async function intentIdFor(o) {
  for (const k of INTENT_ID_FIELDS) {
    if (o == null || o[k] === undefined || o[k] === null || o[k] === '') {
      throw new Error(
        `intentIdFor: '${k}' is missing. A derived key with a missing field is a `
        + 'DIFFERENT key, and the two verbs that share this derivation would stop sharing it.');
    }
  }
  const label = `hr-accrue|${o.user}|${o.slot}|${o.watermark}|${o.version}|${o.salt}|${o.attempt}`;
  const buf = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label)));
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = Array.from(buf.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
