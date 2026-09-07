// ════════════════════════════════════════════════════════════════════════
// away-receipt.js — THE LAST AWAY-CLASSIFIED RECEIPT, BUILT ONCE.
//
// Ruling (Principal Game Designer, 2026-09-07): THE REALM KEEPS THE LAST
// AWAY-CLASSIFIED RECEIPT. A receipt the server PAID is progression, not
// preference — it is the only statement of what happened to a character while
// nobody was watching.
//
// WHAT WAS BROKEN. `G.lastOfflineSummary` is the only copy of the away receipt
// and it is a NO_SYNC field (src/net/events.js:93, "transient UI / derived"), so
// it lives for exactly one page life. One reload and the Home "While you were
// away" card, the welcome-back modal (legacy.js:14291) and the combat-screen
// recap (combat-screens.js:309) all render nothing — for a night the server has
// already paid, journalled and banked.
//
// WHY THIS IS ITS OWN MODULE AND NOT AN INLINE HELPER IN index.ts. index.ts is
// Deno TypeScript: nothing in tests/ can import it, so an inline builder could
// only ever be tested by TRANSCRIBING it into the guard — and a guard that
// grades a transcription passes while the shipped code drifts. Everything here
// is plain ESM that imports cleanly in Node AND Deno, so
// tests/away-receipt-journal.mjs grades THE SHIPPED FUNCTION.
//
// ── THE THREE RULES THIS FILE EXISTS TO KEEP ────────────────────────────────
// 1. AWAY-CLASSIFIED SETTLES ONLY. `awayMs >= SYNC_MAX_MS` (600,000 — the same
//    classifier as src/net/accrue.js:3709 `classifyReceipt`) OR a death (b343: a
//    death always speaks, whatever the span). The 90 s settle cadence must NEVER
//    write this column: that is the difference between ~1 write per session and
//    40 writes per hour per character, which is journal rule 6 and the
//    game_events lesson (1.6M rows / 229 MB from six players in four days).
//    hr_apply REFUSES a sync-sized receipt with `bad_receipt`, so the rule is
//    enforced on both sides — but the edge is the side that must not send it.
// 2. ALLOWLISTED HERE TOO. hr_apply refuses an unknown key rather than stripping
//    it, so `AWAY_RECEIPT_KEYS` below IS the contract with the SQL. A field
//    added to the `away:` response payload does NOT silently join the stored
//    receipt, and tests/away-receipt-journal.mjs asserts the two lists agree.
// 3. NOTHING IS DEFAULTED TO A GUESS. Numbers floor at 0, strings are strings or
//    null (a non-string truthy value reaches a renderer as "something stopped"
//    with nothing to say about it, which is worse than silence), and `at` is the
//    SERVER clock — never a client value.
//
// ⚠ THE CALLER MUST RECOMPUTE THIS ON EVERY DEGRADE ATTEMPT. index.ts's clamp
//   ladder HALVES the span, and a halved span can fall under SYNC_MAX_MS. A
//   receipt computed once would then be REFUSED with `bad_receipt` and 409 the
//   whole absence. Recomputed, it is simply dropped: pay the player, then tell
//   them, in that order.
//
// NO `?v=` ON ANY IMPORT IN THIS TREE (b332): Supabase's bundler resolves the
// query as a literal path and the deploy fails.
// ════════════════════════════════════════════════════════════════════════

/** SYNC_MAX_MS, mirrored from src/net/accrue.js:3545 and from hr_apply's
 *  `c_sync_max_ms`. Three copies, one number, and the guard asserts all three. */
export const AWAY_RECEIPT_SYNC_MAX_MS = 600000;

/** The recovery ladder is bounded by its own 64-minute cap (~20 falls in a
 *  twelve-hour night); 24 is hr_apply's `c_max_death_rows`, the same bound. */
export const AWAY_RECEIPT_MAX_LADDER = 24;

/** At most this many entries survive into the `xp` / `items` maps — hr_apply's
 *  `c_max_receipt_keys`. The 2 KB size bound is the one that really binds; this
 *  stops a pathological map reaching it in the first place. */
export const AWAY_RECEIPT_MAX_MAP = 64;

/** THE CONTRACT WITH hr_apply's `c_receipt_keys`. Exactly these, no more: an
 *  unknown key is a `bad_receipt` refusal, not an ignored field. */
export const AWAY_RECEIPT_KEYS = Object.freeze([
  'grantMs', 'awayMs', 'paidMs', 'at',
  'gold', 'xp', 'items', 'kills', 'crits',
  'burnt', 'stoppedBy', 'stoppedById', 'stoppedSkill', 'stoppedPerHour',
  'died', 'diedTo', 'deaths', 'recoverMs', 'recoverLadder', 'foodEaten', 'autoEat',
  'blessed', 'featuredMs',
]);

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const str = (v) => (typeof v === 'string' && v ? v.slice(0, 64) : null);

function mapOf(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
  const out = {};
  for (const k of Object.keys(m).slice(0, AWAY_RECEIPT_MAX_MAP)) {
    const n = Number(m[k]);
    /* Zero entries are dropped, not stored: "you gained 0 Oak Logs" is noise on
       a card and bytes in a column every boot envelope carries. `items` stays
       SIGNED — auto-eat debits the food it ate, and the card has to be able to
       say so. */
    if (Number.isFinite(n) && n !== 0) out[String(k).slice(0, 64)] = Math.trunc(n);
  }
  return out;
}

/**
 * Does this settle classify as AWAY? The one predicate, so the builder and the
 * guard cannot form different ideas of what a night is.
 * @param {object} out the accrual engine's result (`computeAccrual`'s shape)
 */
export function classifiesAway(out) {
  const s = (out && out.summary) || {};
  return num(s.awayMs) >= AWAY_RECEIPT_SYNC_MAX_MS || s.died === true || num(s.deaths) >= 1;
}

/**
 * The receipt to store, or `null` when this settle is a sync and must not write
 * one. `nowMs` is injectable ONLY so the guard can pin the clock; the shipped
 * caller passes nothing and gets the server clock.
 */
export function awayReceiptFor(out, nowMs) {
  if (!classifiesAway(out)) return null;
  const o = out || {};
  const s = o.summary || {};
  const awayMs = num(s.awayMs);
  return {
    grantMs: num(o.grantMs),
    awayMs,
    /* `paidMs` is the part of the credited span that actually EARNED, and it
       cannot exceed it — hr_apply re-checks the same inequality. */
    paidMs: Math.min(num(s.paidMs), awayMs),
    at: Number.isFinite(Number(nowMs)) ? Math.floor(Number(nowMs)) : Date.now(),
    /* The credited totals. `gold` is the same number this delta credits, and
       hr_apply refuses a receipt claiming more gold than the apply moved. */
    gold: num(s.gold),
    xp: mapOf(s.xp),
    items: mapOf(s.items),
    kills: num(s.kills),
    crits: num(s.crits),
    /* Why the run ended before the absence did (b345). PASS-THROUGH ONLY:
       nothing here is inferred, and in particular the stop is NEVER derived from
       `paidMs < awayMs` — tick flooring makes that inequality true on a
       perfectly ordinary night. */
    burnt: num(s.burnt),
    stoppedBy: str(s.stoppedBy),
    stoppedById: str(s.stoppedById),
    stoppedSkill: str(s.stoppedSkill),
    stoppedPerHour: num(s.stoppedPerHour),
    /* Death, and why nothing healed them — the same sentence, b341's standard. */
    died: s.died === true,
    diedTo: str(s.diedTo),
    deaths: num(s.deaths),
    recoverMs: num(s.recoverMs),
    /* The ladder AS CHARGED, one entry per fall. Sent verbatim because a card
       that regenerated the doubling from a count would be wrong (and harsher
       than the truth) on every night that met the novice clamp or the cap. */
    recoverLadder: Array.isArray(s.recoverLadder)
      ? s.recoverLadder.slice(0, AWAY_RECEIPT_MAX_LADDER).map(num) : [],
    foodEaten: num(o.foodEaten),
    /* ⚠ AN OBJECT, NOT A BOOLEAN, and deliberately: the client's
       `summaryFromAway` (src/net/accrue.js:3436) and `receiptDeathCause` read
       `{enabled, pct, hadFood}` — "auto-eat was off", "your threshold was 20%"
       and "your bag was empty" are three different sentences and only the third
       names the fix. OMITTED ENTIRELY when the engine did not state it, so an
       older payload renders silence rather than a fabricated "auto-eat was off".
       This is the state the ENGINE ran the span with, not the client's current
       toggle, which is a different instant. */
    ...(s.autoEat && typeof s.autoEat === 'object' && !Array.isArray(s.autoEat)
      ? { autoEat: {
          enabled: s.autoEat.enabled === true,
          pct: Math.max(0, Math.min(100, Math.floor(Number(s.autoEat.pct) || 0))),
          hadFood: s.autoEat.hadFood === true,
        } }
      : {}),
    blessed: s.blessed === true,
    featuredMs: num(s.featuredMs),
  };
}

/**
 * Splice the receipt onto a delta, or return the delta untouched. The ONE place
 * the key name is written on the edge side.
 */
export function withAwayReceipt(delta, out, nowMs) {
  const receipt = awayReceiptFor(out, nowMs);
  return receipt ? { ...delta, last_away_receipt: receipt } : delta;
}

/**
 * THE CARD IS NEVER WORTH THE NIGHT (F2, security 2026-09-07).
 *
 * `bad_receipt` is deliberately NOT in index.ts's `DEGRADABLE` set, and that is
 * right: shortening a span cannot repair a malformed object. But hr_apply
 * refuses the DELTA, not the key, and `bad_receipt` is not a clamp — so the
 * degrade ladder is never entered and ONE receipt the database disagrees with
 * (a builder field `c_receipt_keys` has not learnt yet, a bound the two sides
 * read differently, an `at` outside the clock slack) would 409 EVERY away
 * settle for EVERY player until a redeploy: watermark frozen, night unpaid,
 * over a Home card.
 *
 * So a refusal of the receipt costs the RECEIPT and nothing else. Given
 * hr_apply's answer and the delta that produced it, this returns the delta to
 * RETRY — the same delta with `last_away_receipt` DELETED — or `null` when
 * there is nothing to rescue.
 *
 * It lives HERE, next to the builder, for the reason this whole module exists:
 * index.ts is Deno TypeScript that no test can import, so a decision written
 * inline there could only be graded by transcribing it, and a guard that grades
 * a transcription stays green while the shipped code drifts.
 *
 * ⚠ NOT A GENERAL RETRY. It fires on `bad_receipt` and on nothing else, and
 *   only when the delta ACTUALLY CARRIED a receipt: a `bad_receipt` answer to a
 *   delta with no receipt in it is a different defect and must not be masked by
 *   a retry that changes nothing. The caller is responsible for retrying at a
 *   DIFFERENT `attempt`, so the derived intent key is a fresh apply and never a
 *   replay of the rejected one.
 */
export function receiptRescue(res, delta) {
  if (!res || typeof res !== 'object') return null;
  if (res.ok === true || String(res.error) !== 'bad_receipt') return null;
  if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return null;
  if (!('last_away_receipt' in delta)) return null;
  const rescued = { ...delta };
  delete rescued.last_away_receipt;
  return rescued;
}
