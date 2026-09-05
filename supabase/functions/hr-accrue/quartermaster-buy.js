// ============================================================================
// supabase/functions/hr-accrue/quartermaster-buy.js — THE QUARTERMASTER SPEND.
// DUNGEON SCRIP OUT, A KEY / BLUEPRINT / BOSS WEAPON IN — ALL SERVER-OWNED.
//
// "I'll take the Forge Blueprint." — and the SERVER debits the scrip and grants
// the item in ONE transaction, so the b372 "buy every blueprint, get the scrip
// back" bug (the settle envelope half-undoing a client trade) is closed.
//
// Read ./intents.js first (the contract), ./unlock-buy.js second (the closest
// sibling — a verb whose commit point is a DEDICATED RPC, not hr_apply), and
// docs/design/dungeon-settlement.md §4 for the full server contract.
//
// ── THE STRUCTURAL SHAPE (unlock_buy's, deliberately) ───────────────────────
// This verb builds NO hr_apply delta: a scrip debit + an item grant is one
// transaction with its own re-validation, so the commit point is a second
// SECURITY DEFINER function, hr_quartermaster_buy, and this module's job is:
//
//     validate the shape → gate + read → name the OFFER → render the envelope
//
// It uses spend.js's gateAndRead / refusalBody / shapeRefusal, so the rate gate,
// the envelope-carrying refusal and the "refuse before any database work"
// property are the SAME implementations the gold verbs use.
//
// ── AND IT SENDS NO PRICE AND NO ITEM ───────────────────────────────────────
// THE WIRE CARRIES ONE OFFER ID AND NOTHING ELSE. The price (scrip_cost) and the
// granted item both live in the client-unwritable hr_qm_offers; hr_quartermaster_buy
// reads them for itself. The Edge has no arithmetic authority over the spend: it
// cannot buy a cheaper blueprint because it cannot name a price, and it cannot
// grant a different item because it cannot name one.
//
// ⚠ NO hr_apply CALL SITE HERE, exactly as in unlock-buy.js: the statement below
//   binds FIVE scalars and no jsonb, so the ::text::jsonb double-encoding hazard
//   (delta-transport T6) is structurally unreachable — no json-typed parameter.
//
// PURE ESM. No I/O, no Deno, no globals.
// ============================================================================

import { INTENT_ERRORS, collectsFirst } from './intents.js';
import { gateAndRead, refusalBody, shapeRefusal } from './spend.js';

/** The verb's own name — returned in every body so one client dispatcher can
    route a response without remembering what it asked for. */
export const VERB = 'quartermaster_buy';

/* THE COMMIT POINT. One statement, its own transaction, run as `hr_engine`.
   FIVE SCALARS: no jsonb parameter, therefore no double-encoding hazard.

   $5 is the OFFER ID (`qm.<item>`) and it is the whole of this verb's
   caller-supplied surface. hr_quartermaster_buy looks up the price and the item
   for itself, takes the per-character advisory lock, refuses a stale version,
   checks the scrip balance and the bank cap, debits scrip, credits the item,
   journals a negative-scrip qm_buy row and returns hr_state_of + a `bought`
   receipt. Edge decides WHAT SHOULD HAPPEN; Postgres decides WHETHER IT MAY. */
const BUY_SQL = `
  select public.hr_quartermaster_buy($1::uuid, $2::int, $3::bigint, $4::uuid, $5::text) as res`;

/**
 * THE INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      the only request-derived value that reaches a query, and it
 *                    selects a row the caller already owns.
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.offer     the offer id from request.js (`qm.<item>`), or null
 * @returns { status, body } — the HTTP answer, built here so the test asserts the
 *          same object the shell serialises.
 */
export async function runQuartermasterBuy(o) {
  const { exec, user, slot, intentId, offer: offerId } = o;

  /* (0) SHAPE FIRST — refused before ANY database work, so a malformed client
         cannot spend a real player's rate budget by looping on garbage. THIS is
         why these refusals carry no state envelope. `qty` is passed as 1 and is
         not part of this verb's wire (an offer is bought one unit at a time);
         shapeRefusal is still the one key check. */
  const shape = shapeRefusal(VERB, intentId, 1);
  if (shape) return shape;

  /* A missing/unparsed offer id is a SHAPE refusal, answered here with no
     database work. request.js already validated it against OFFER_ID_RE, so a
     null here means "absent or malformed". A real-but-unknown offer id passes
     this and is refused `unknown_offer` by the RPC, WITH the envelope — the
     unlock_buy dual-producer pattern. */
  if (!offerId) {
    return { status: 400, body: { ok: false, verb: VERB, error: INTENT_ERRORS.BAD_OFFER } };
  }

  /* (1) GATE + READ — spend.js's, so the bucket comes from the registry and an
         unknown one fails closed in the database. */
  const read = await gateAndRead({ exec, user, slot, verb: VERB });
  if (read.refusal) return read.refusal;
  const env = read.env;

  /* (2) RULE 3, THE HALF THAT APPLIES. The registry says whether this verb
         collects before it acts, read here rather than assumed, fail-closed. The
         OTHER half has nothing to grade: this verb builds no hr_apply delta, so
         there is no key it could carry that would stamp accrued_to. That property
         is asserted where it lives — hr_quartermaster_buy touches accrued_to
         nowhere (dungeon-settlement.md §4). */
  if (collectsFirst(VERB)) {
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb: VERB,
        refusal: { error: INTENT_ERRORS.COLLECT_REQUIRED, stage: 'collect' },
        fallback: env,
      }),
    };
  }

  /* (3) THE COMMIT. `env.version` is the version THIS call read; the RPC refuses a
         stale one, which is the whole of our concurrency control. The key is the
         CLIENT's — a purchase is a tap, and the client is the only party that
         knows which retry is which. */
  const [row] = await exec(BUY_SQL, [user, slot, env.version, intentId, offerId]);
  const res = (row && row.res) || null;
  if (!res || res.ok !== true) {
    /* NOTHING WAS APPLIED — hr_quartermaster_buy's protected block rolls back in
       full (scrip, item, journal), so "a rejected intent is retried with a NEW
       key" holds. The code is the function's own (insufficient_scrip / bank_full /
       daily_cap / unknown_offer / version_conflict), returned verbatim so it
       survives to the client and to hr_rejections. */
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb: VERB,
        refusal: { error: (res && res.error) || 'quartermaster_buy_failed', stage: 'buy', detail: res ?? null },
        fallback: null,
      }),
    };
  }

  /* (4) THE ENVELOPE. hr_state_of verbatim (from `res`, the state AFTER the
         write) — the client renders it and computes nothing. Scrip and inventory
         both come out of `res`, never out of the request.

         THE `bought` RECEIPT IS NULL ON A REPLAY, spend.js's rule and reason: it
         describes the purchase THIS invocation made, and a replay bought nothing
         this time (the effect landed on the first call). The envelope still
         carries the true scrip balance + inventory either way, so the client
         reconciles correctly; nulling the receipt only stops a re-notify. */
  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb: VERB,
      bought: res.replayed === true ? null : (res.bought ?? null),
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}
