// ============================================================================
// supabase/functions/hr-accrue/unlock-buy.js — INTENT #5. GOLD OUT, A PERMANENT
// CAPABILITY IN.
//
// "I'll take the Hearthstone." — and from then on the SERVER knows this
// character has a Kitchen, which is what makes `noBurn` readable and therefore
// what makes 'artisan' payable (§9(3) of the artisan progress model).
//
// Read ./intents.js first (the contract), ./spend.js second (the shared half of
// a value intent), and docs/design/unlock-buy.md for why this verb does not use
// `runValueIntent`.
//
// ── THE ONE STRUCTURAL DIFFERENCE FROM shop_buy ─────────────────────────────
// Every other value verb builds a DELTA and hands it to `hr_apply`. This one
// cannot, and the reason is the whole design: a room rung is a LEVEL, its merge
// is `GREATEST(existing, granted)`, and hr_apply merges progress ADDITIVELY —
// which is why 'unlock' is deliberately absent from its delta allowlist (buying
// rung 1 twice would otherwise stand in rung 2: the 2,000g Iron Stove for 1,000
// gold). So the commit point for this verb is a second SECURITY DEFINER
// function, `hr_unlock_buy`, and this module's job shrinks to:
//
//     validate the shape → gate + read → name an OFFER → render the answer
//
// It still uses spend.js's `gateAndRead`, `refusalBody` and `shapeRefusal`, so
// the rate gate, the envelope-carrying refusal and the "refuse before any
// database work" property are the SAME implementations the gold verbs use, not
// four more that agree today.
//
// ── AND IT DOES NOT SEND A PRICE ────────────────────────────────────────────
// `shop_buy` sends a gold delta it computed for itself. THIS VERB SENDS AN
// OFFER ID AND NOTHING ELSE.
// The price, the rung, the item cost, the property-tier gate and the blueprint
// all live in `public.hr_unlock_offers` — generated from THIS DIRECTORY'S
// ./unlock-catalogue.js, so the sellable set is one statement read twice. The
// Edge Function has no arithmetic authority over a permanent capability at all:
// it cannot buy a cheaper Kitchen because it cannot name a price.
//
// ⚠ WHICH IS WHY THERE IS NO hr_apply CALL SITE HERE, AND WHY THAT IS NOT A
//   GAP IN tests/delta-transport.mjs T6. T6 walks the deployed directory and
//   requires `::text::jsonb` on the last argument of every hr_apply call site,
//   because a pre-stringified delta bound to a bare `$n::jsonb` is
//   double-encoded by postgres.js (the 2026-08-15 P0). This verb binds FIVE
//   SCALARS and no jsonb, so there is nothing for that rule to grade — the
//   double-encoding failure is structurally unreachable when no parameter is
//   json-typed. tests/unlock-buy.mjs asserts exactly that instead: the
//   statement below must bind no `::jsonb` parameter at all.
//
// PURE ESM. No I/O, no Deno, no globals.
// ============================================================================

import { INTENT_ERRORS, catalogueGet, collectsFirst } from './intents.js';
import { UNLOCK_OFFERS, UNLOCK_REFUSALS } from './unlock-catalogue.js';
import { isGoldLadderOffer } from './gold-ladder-catalogue.js';
import { gateAndRead, refusalBody, shapeRefusal } from './spend.js';

/** The verb's own name — returned in every body so one client dispatcher can
    route a response without remembering what it asked for. */
export const VERB = 'unlock_buy';

/* THE COMMIT POINT. One statement, its own transaction, run as `hr_engine`.
   FIVE SCALARS: no jsonb parameter, therefore no pre-stringified payload and no
   double-encoding hazard (see the T6 note above).

   `$5::text` is the OFFER ID and it is the whole of this verb's caller-supplied
   surface. The function looks up price, rung, ladder and both prerequisites for
   itself, takes the per-character advisory lock, refuses a stale version,
   re-validates every invariant, debits, grants with GREATEST, journals, bumps
   the version and returns `hr_state_of`. Edge decides WHAT SHOULD HAPPEN;
   Postgres decides WHETHER IT MAY. */
const BUY_SQL = `
  select public.hr_unlock_buy($1::uuid, $2::int, $3::bigint, $4::uuid, $5::text) as res`;

/**
 * Resolve an offer id to a SELLABLE offer, or to a refusal that says why.
 * Pure — no database, no clock, no request beyond the id.
 *
 * The order is deliberate and it is `shop_buy`'s: a REAL offer this build
 * cannot sell is refused BY NAME before the "unknown" branch can mislabel it.
 * A player told "no such offer" about the gem-priced Winter theme files a bug
 * against the wrong system.
 *
 * ⚠ `catalogueGet`, NEVER `UNLOCK_OFFERS[id]` (review C6). The offer id shape
 *   admits `constructor`, which is truthy on a plain object and whose `.gold`
 *   is `undefined` — a free permanent capability. Both maps here are
 *   null-prototype AND every lookup goes through the own-property helper.
 */
export function resolveUnlockOffer(offerId) {
  if (typeof offerId !== 'string' || offerId === '') {
    return { ok: false, status: 400, error: INTENT_ERRORS.BAD_OFFER };
  }

  /* GOLD-LADDER OFFERS (worker_hire / farm_land / bank) FIRST, and by NAME only.
     The Edge holds no price, rung or gate for these — hr_unlock_buy reads all of
     it from public.hr_unlock_offers under the lock. The id space is disjoint
     from the shop maps below, so order is a clarity choice, not a correctness
     one. `{ id }` is the whole surface the commit statement binds. */
  if (isGoldLadderOffer(offerId)) return { ok: true, offer: { id: offerId } };

  const offer = catalogueGet(UNLOCK_OFFERS, offerId);
  if (offer) return { ok: true, offer };

  const why = catalogueGet(UNLOCK_REFUSALS, offerId);
  if (why !== undefined) {
    return {
      ok: false, status: 409, error: INTENT_ERRORS.OFFER_UNSUPPORTED,
      detail: { offer: offerId, reason: why },
    };
  }
  /* An offer that exists but grants no unlock (`equip.iron_sword`) lands here
     too, and `unknown_offer` is the right answer for it: it is not this verb's
     offer. `shop_buy` sells it, and telling a player "unsupported" about a
     purchase that works would be worse than telling them to use the shop. */
  return { ok: false, status: 409, error: INTENT_ERRORS.UNKNOWN_OFFER, detail: { offer: offerId } };
}

/**
 * THE INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      the only request-derived value that reaches a query, and
 *                    it selects a row the caller already owns.
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.offer     the offer id from request.js, or null
 * @returns { status, body } — the HTTP answer, built here so the test asserts
 *          the same object the shell serialises.
 */
export async function runUnlockBuy(o) {
  const { exec, user, slot, intentId, offer: offerId } = o;

  /* (0) SHAPE FIRST — refused before ANY database work, so a malformed client
         cannot spend a real player's rate budget by looping on garbage. THIS is
         why these refusals carry no state envelope: reading one would be the
         database work the check exists to avoid.

         `qty` is passed as 1 and is not part of this verb's wire: a rung is
         bought once, and "buy 3 Kitchens" is not a thing the game can mean.
         shapeRefusal is still the one implementation of the key check. */
  const shape = shapeRefusal(VERB, intentId, 1);
  if (shape) return shape;

  const resolved = resolveUnlockOffer(offerId);
  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: { ok: false, verb: VERB, error: resolved.error, ...(resolved.detail || {}) },
    };
  }
  const offer = resolved.offer;

  /* (1) GATE + READ — spend.js's, so the bucket comes from the registry and an
         unknown one fails closed in the database. */
  const read = await gateAndRead({ exec, user, slot, verb: VERB });
  if (read.refusal) return read.refusal;
  const env = read.env;

  /* (2) RULE 3, THE HALF THAT APPLIES. The registry says whether this verb
         collects before it acts, the column is READ here rather than assumed,
         and an unimplemented collect FAILS CLOSED.

         The OTHER half — `guardStampKeys` — has nothing to grade: this verb
         builds no delta, so there is no key it could carry that would stamp
         `accrued_to` and confiscate the unpaid window. That property is
         asserted where it now lives, in SQL: 2026-08-16-unlock-buy.sql §6(b)
         measures accrued_to across a real purchase and fails if it moved. */
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

  /* (3) THE COMMIT. `env.version` is the version THIS call read; hr_unlock_buy
         refuses a stale one, which is the whole of our concurrency control. The
         key is the CLIENT's — a purchase is a tap, and the client is the only
         party that knows which retry is which. */
  const [row] = await exec(BUY_SQL, [user, slot, env.version, intentId, offer.id]);
  const res = (row && row.res) || null;
  if (!res || res.ok !== true) {
    /* NOTHING WAS APPLIED — hr_unlock_buy's protected block rolls back in full,
       journal row included, so "a rejected intent is retried with a NEW key"
       holds here without exception. The code is the function's own, returned
       verbatim so it survives to the client and to hr_rejections. */
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb: VERB,
        refusal: { error: (res && res.error) || 'unlock_buy_failed', stage: 'buy', detail: res ?? null },
        fallback: null,
      }),
    };
  }

  /* (4) THE ENVELOPE. `hr_state_of` verbatim — the client renders it and
         computes nothing. Gold, inventory and version all come out of `res`,
         which is the state AFTER the write, never out of the request.

         THE RECEIPT IS NULL ON A REPLAY, spend.js's rule and for spend.js's
         reason: this receipt describes THE REPLAYED PURCHASE ITSELF, and this
         invocation moved nothing. The envelope still carries the true balance,
         and `hr_perks_of` still reports the rung, either way. */
  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb: VERB,
      /* ⚠ BUILT FROM `res.charged`, NEVER FROM THE EDGE CATALOGUE (Security C4).
         The catalogue in this process is a COPY of the table the charge came
         out of, and a receipt built from the copy is the number the player SEES
         being the one number nobody re-validated. `charged` is what
         hr_unlock_buy actually took, inside the transaction that took it, so a
         stale or drifted Edge catalogue produces a wrong REFUSAL (loud) rather
         than a wrong RECEIPT (silent). tests/unlock-buy.mjs mutates
         UNLOCK_OFFERS' price and requires this to stay correct.
         Absent `charged` → null, fail closed: no receipt beats a made-up one. */
      /* ⚠ THE FIELD READS ARE OPTIONAL-CHAINED even though the guard above
         makes that unreachable, and it is not defensive noise: it is what lets
         a test PROVE the guard. With plain `res.charged.offer`, deleting the
         guard makes a replayed call THROW, and a TypeError proves only that the
         module crashed — tests/unlock-buy.mjs' `receipt_on_replay` mutation read
         "Cannot read properties of undefined" instead of the property it exists
         to assert. With `?.` the mutated build runs and the test says the true
         thing: a replay reported a receipt for a transfer it did not make. */
      receipt: (res.replayed === true || !res.charged) ? null : {
        offer: res.charged?.offer,
        name: res.charged?.name,
        unlock: res.charged?.unlock,
        /* THE RUNG, not an amount added. Stated by the server, rendered by the
           client, never recomputed — the client has no copy of the ladder to
           recompute it from. */
        rung: res.charged?.rung,
        /* Negated HERE, so the sign convention lives in one place and the
           server states a magnitude. Same sign shop_buy's receipt carries, so a
           renderer cannot accidentally show a purchase as income. */
        gold: -res.charged?.gold,
        items: res.charged?.items,
        blueprint: res.charged?.blueprint ?? null,
      },
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}
