// ============================================================================
// supabase/functions/hr-accrue/dungeon-settle.js — THE DUNGEON RUN SETTLE.
// SCRIP + RUN LOOT IN, THE ENTRY KEY OUT — ALL SERVER-OWNED.
//
// "I cleared the Crypt of Bones." — and from then on the SERVER knows this
// character earned scrip and loot, so a reload no longer wipes it (the
// "dungeon scrip goes to 0" P1, docs/design/dungeon-settlement.md §0/§2).
//
// Read ./intents.js first (the contract), ./unlock-buy.js second (the closest
// sibling — a verb whose commit point is a DEDICATED RPC, not hr_apply), and
// docs/design/dungeon-settlement.md §2 for the full server contract.
//
// ── THE STRUCTURAL SHAPE (unlock_buy's, deliberately) ───────────────────────
// Every accrual/gold verb builds a DELTA and hands it to hr_apply. This one does
// not: settling a run is a currency credit + a loot roll + a key debit that must
// be ONE transaction with its own re-validation, so the commit point is a second
// SECURITY DEFINER function, hr_dungeon_settle, and this module's job is:
//
//     validate the shape → gate + read → name the RUN → render the envelope
//
// It uses spend.js's gateAndRead / refusalBody, so the rate gate, the
// envelope-carrying refusal and the "refuse before any database work" property
// are the SAME implementations the gold verbs use.
//
// ── AND IT SENDS NO REWARD ──────────────────────────────────────────────────
// The wire carries a DUNGEON ID, a MODE and a clear-fraction QUALITY. It sends
// no loot id, no quantity, no chance, no scrip amount and no key. The loot table
// and its rates, the scrip base, the entry key, the cooldown and the per-day cap
// all live in the client-unwritable hr_dungeons / hr_dungeon_loot and the
// append-only ledger; hr_dungeon_settle reads them for itself and rolls loot with
// the seeded server PRNG. p_quality is the ONE client value, CLAMPED to [0,1]
// server-side, and it scales SELF-ONLY scrip — never loot. Edge decides WHAT
// SHOULD HAPPEN; Postgres decides WHETHER IT MAY.
//
// ⚠ WHICH IS WHY THERE IS NO hr_apply CALL SITE HERE, exactly as in
//   unlock-buy.js: the statement below binds SEVEN scalars and no jsonb, so the
//   ::text::jsonb double-encoding hazard (delta-transport T6) is structurally
//   unreachable — there is no json-typed parameter to double-encode.
//
// PURE ESM. No I/O, no Deno, no globals.
// ============================================================================

import { INTENT_ERRORS, collectsFirst } from './intents.js';
import { gateAndRead, refusalBody, shapeRefusal } from './spend.js';

/** The verb's own name — returned in every body so one client dispatcher can
    route a response without remembering what it asked for. */
export const VERB = 'dungeon_settle';

/* THE COMMIT POINT. One statement, its own transaction, run as `hr_engine`.
   SEVEN SCALARS: no jsonb parameter, therefore no pre-stringified payload and no
   double-encoding hazard.

   $5 dungeon id, $6 mode, $7 quality are the whole of this verb's caller-supplied
   surface. hr_dungeon_settle looks up the loot table, the scrip base, the entry
   key, the cooldown and the per-day cap for itself, takes the per-character
   advisory lock, refuses a stale version, consumes the key, rolls loot with the
   seeded PRNG, credits scrip, journals and returns hr_state_of + a `settled`
   receipt. */
const SETTLE_SQL = `
  select public.hr_dungeon_settle($1::uuid, $2::int, $3::bigint, $4::uuid,
                                  $5::text, $6::text, $7::numeric) as res`;

/**
 * THE INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      the only request-derived value that reaches a query, and it
 *                    selects a row the caller already owns.
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.dungeon   { id, mode, quality } from request.js, or null
 * @returns { status, body } — the HTTP answer, built here so the test asserts the
 *          same object the shell serialises.
 */
export async function runDungeonSettle(o) {
  const { exec, user, slot, intentId, dungeon } = o;

  /* (0) SHAPE FIRST — refused before ANY database work, so a malformed client
         cannot spend a real player's rate budget by looping on garbage. THIS is
         why these refusals carry no state envelope: reading one would be the
         database work the check exists to avoid. `qty` is passed as 1 and is not
         part of this verb's wire; shapeRefusal is still the one key check. */
  const shape = shapeRefusal(VERB, intentId, 1);
  if (shape) return shape;

  if (!dungeon || !dungeon.id) {
    return { status: 409, body: { ok: false, verb: VERB, error: INTENT_ERRORS.UNKNOWN_DUNGEON } };
  }
  if (!dungeon.mode) {
    return { status: 400, body: { ok: false, verb: VERB, error: INTENT_ERRORS.BAD_MODE } };
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
         is asserted where it lives — hr_dungeon_settle touches accrued_to nowhere
         (dungeon-settlement.md §2). */
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

  /* (3) THE COMMIT. `env.version` is the version THIS call read; hr_dungeon_settle
         refuses a stale one, which is the whole of our concurrency control. The
         key is the CLIENT's — a run is a gesture, and the client is the only party
         that knows which retry is which. `quality` may be null (the server
         coalesces null to a full clear and clamps whatever survives to [0,1]). */
  const [row] = await exec(SETTLE_SQL, [
    user, slot, env.version, intentId, dungeon.id, dungeon.mode,
    dungeon.quality === null || dungeon.quality === undefined ? null : dungeon.quality,
  ]);
  const res = (row && row.res) || null;
  if (!res || res.ok !== true) {
    /* NOTHING WAS APPLIED — hr_dungeon_settle's protected block rolls back in
       full (key, loot, scrip, journal), so "a rejected intent is retried with a
       NEW key" holds without exception. The code is the function's own, returned
       verbatim so it survives to the client and to hr_rejections. */
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb: VERB,
        refusal: { error: (res && res.error) || 'dungeon_settle_failed', stage: 'settle', detail: res ?? null },
        fallback: null,
      }),
    };
  }

  /* (4) THE ENVELOPE. hr_state_of verbatim (from `res`, the state AFTER the
         write) — the client renders it and computes nothing.

         THE `settled` RECEIPT IS NULL ON A REPLAY, spend.js's rule and for
         spend.js's reason: it describes the run this invocation settled, and a
         replay settled nothing THIS time (the effect landed on the first call).
         The envelope still carries the true scrip balance + inventory either way,
         so the client reconciles correctly; nulling the receipt only stops it
         re-notifying "+N scrip" a second time on a retry. */
  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb: VERB,
      settled: res.replayed === true ? null : (res.settled ?? null),
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}
