// ============================================================================
// supabase/functions/hr-accrue/trophy-claim.js — THE TROPHY CLAIM. NOTHING OUT,
// A ROW IN.
//
// "I have killed twenty thousand of those." — and from then on the SERVER holds
// a row saying so, which is what the collection, the profile and any future
// "trophies claimed" board read.
//
// Read ./intents.js first (the contract), ./unlock-buy.js second (the verb this
// one is shaped after), and docs/design/BESTIARY_LADDER.md §4 for the split that
// makes the whole feature cheap: THE POWER IS DERIVED, THE TROPHY IS CLAIMED.
//
// ── WHAT THIS VERB DOES NOT DO, WHICH IS THE POINT ──────────────────────────
// It mints NOTHING. No gold, no gems, no items, no XP, no multiplier. The drop
// multiplier a trophy pays is derived from the kill counters on every read
// (src/core/trophies.js) and is already on before this button exists — a player
// who never opens the Bestiary is never behind.
//
// That is what makes the verb RANKED-SAFE BY CONSTRUCTION rather than by a
// clamp: CLAUDE.md §1's target property is "a forged client value cannot cross
// into another player's economy or ranking", and a claim that moves no value
// cannot cross into one however it is forged, replayed or reordered. A clamp can
// be wrong; "there is no value here" cannot.
//
// ── AND IT SENDS NO KILL COUNT ──────────────────────────────────────────────
// The wire is `{trophy:{monster, stage}}` and the commit statement binds FIVE
// SCALARS, none of which is a count. hr_trophy_claim reads the kill total out of
// `player_progress` inside its own transaction, under the advisory lock the
// spend RPCs take. So a forged count is not refused — it is UNREPRESENTABLE,
// which is a stronger position than a clamp (design §5).
//
// ⚠ NO hr_apply CALL SITE HERE, AND THAT IS NOT A GAP IN tests/delta-transport
//   .mjs T6. T6 requires `::text::jsonb` on the last argument of every hr_apply
//   call site because a pre-stringified delta bound to a bare `$n::jsonb` is
//   double-encoded by postgres.js (the 2026-08-15 P0). This verb binds five
//   scalars and no jsonb, so the double-encoding failure is structurally
//   unreachable — the same position unlock_buy is in, asserted the same way.
//
// PURE ESM. No I/O, no Deno, no globals.
// ============================================================================

import { INTENT_ERRORS } from './intents.js';
import { gateAndRead, refusalBody, shapeRefusal } from './spend.js';

/** The verb's own name — returned in every body so one client dispatcher can
    route a response without remembering what it asked for. */
export const VERB = 'trophy_claim';

/* THE COMMIT POINT. One statement, its own transaction, run as `hr_engine`.
   FIVE SCALARS: no jsonb parameter, therefore no pre-stringified payload and no
   double-encoding hazard (see the T6 note above).

   `$3::text` (the monster) and `$4::int` (the stage) are the WHOLE of this
   verb's caller-supplied surface. The function validates the monster against
   the server's OWN combat catalogue, bounds the stage against the server's own
   ladder, takes the per-character advisory lock, reads the kill total itself,
   refuses below the threshold and refuses an already-held trophy, writes ONE
   progress row and journals ONE ledger row. Edge decides WHAT SHOULD HAPPEN;
   Postgres decides WHETHER IT MAY.

   ⚠ NO `version` PARAMETER, UNLIKE unlock_buy — and it is a ruling, not an
     omission. A version check exists to refuse a write computed against a stale
     read; this write is computed against NOTHING the client read. The row it
     inserts is decided entirely by the server's own counters at the instant of
     the claim, so a stale envelope cannot make it wrong, and refusing a claim
     because an unrelated accrual bumped the version would fail the one gesture
     in the feature for no property gained. Concurrency is still the advisory
     lock plus the primary key, both inside the RPC. */
const CLAIM_SQL = `
  select public.hr_trophy_claim($1::uuid, $2::int, $3::text, $4::int, $5::text) as res`;

/* THE PROJECTION, RE-READ AFTER THE WRITE — one statement, two aggregates.
   ⚠ WITHOUT THIS THE CLAIM IS A "BROWSER SAYS ONE THING" BUG OF ITS OWN.
     `hr_state_of` no longer carries the trophy population at all
     (2026-09-22-state-of-trophy-prefix.sql took it out), so the envelope this
     verb returns cannot tell the client its new row exists — and the panel would
     go on offering Claim until the next accrual settled, where a second press
     earns `already_owned`. The client must never be left showing a state the
     server has already moved past (CLAUDE.md §6).

   READ AFTER THE COMMIT, in its own transaction, so it states what the database
   HOLDS rather than what this call believed it wrote. That is the same reason
   unlock_buy's receipt is built from `res.charged` and not from the Edge
   catalogue: a projection re-read is a fact, a locally-assembled one is a guess.

   AGGREGATED IN SQL because both projections return SETS and `exec` hands back
   rows; `coalesce` because an aggregate over zero rows is NULL and "no trophies"
   must be an empty array rather than a missing key.

   ⚠ NO `kills_by_class` — and the omission is deliberate, not laziness. That
     block is the CHARM mirror's, the fold belongs to src/core/charms.js, and
     this verb has no business re-deriving it. The client's charm adopter treats
     a block without it as "no counters" and leaves its own mirror alone, which
     is the absence-is-not-a-claim rule both mirrors already follow. */
const PROJECTION_SQL = `
  select coalesce((select jsonb_object_agg(monster_id, kills)
                     from public.hr_bestiary_of($1::uuid, $2::int)), '{}'::jsonb) as kills,
         coalesce((select jsonb_agg(jsonb_build_object('monster', monster_id, 'stage', stage))
                     from public.hr_trophy_of($1::uuid, $2::int)), '[]'::jsonb)   as trophies`;

/**
 * Resolve the parsed `trophy` object to a claim, or to a refusal that says why.
 * Pure — no database, no clock, no request beyond the parsed object.
 *
 * request.js `readTrophy` has already refused anything malformed WHOLE (a bad
 * monster id, a missing/float/out-of-range stage), so the only shape left to
 * answer here is ABSENCE. It is answered BY NAME rather than left to the
 * database, for shapeRefusal's reason: a malformed client must not be able to
 * spend a real player's rate budget by looping on garbage.
 *
 * ⚠ THE MONSTER IS *NOT* CHECKED AGAINST THIS PROCESS'S `MONSTERS` CATALOGUE,
 *   and the omission is deliberate. The Edge's copy is a COPY; the authority is
 *   `hr_activities` (kind='combat'), which is what hr_trophy_claim reads under
 *   the lock. Checking here as well would put a SECOND catalogue in the
 *   refusal path, and the day the two drift the player is told "no such
 *   monster" about a monster the server would happily have claimed — the exact
 *   class Security C4 named on unlock_buy's receipt. One catalogue, one answer,
 *   and a drifted Edge copy produces nothing at all rather than a wrong no.
 */
export function resolveTrophyClaim(trophy) {
  if (!trophy || typeof trophy !== 'object'
      || typeof trophy.monster !== 'string' || trophy.monster === ''
      || typeof trophy.stage !== 'number') {
    return { ok: false, status: 400, error: INTENT_ERRORS.BAD_TROPHY };
  }
  return { ok: true, claim: { monster: trophy.monster, stage: trophy.stage } };
}

/**
 * THE INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      the only request-derived value that reaches a query, and
 *                    it selects a row the caller already owns.
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.trophy    the parsed `{monster, stage}` from request.js, or null
 * @returns { status, body } — the HTTP answer, built here so the test asserts
 *          the same object the shell serialises.
 */
export async function runTrophyClaim(o) {
  const { exec, user, slot, intentId, trophy } = o;

  /* (0) SHAPE FIRST — refused before ANY database work, so a malformed client
         cannot spend a real player's rate budget by looping on garbage. THIS is
         why these refusals carry no state envelope: reading one would be the
         database work the check exists to avoid.

         `qty` is passed as 1 and is not part of this verb's wire: a trophy is
         claimed once, and "claim 3 Nemesis trophies" is not a thing the game
         can mean. shapeRefusal is still the one implementation of the key
         check. */
  const shape = shapeRefusal(VERB, intentId, 1);
  if (shape) return shape;

  const resolved = resolveTrophyClaim(trophy);
  if (!resolved.ok) {
    return { status: resolved.status, body: { ok: false, verb: VERB, error: resolved.error } };
  }
  const claim = resolved.claim;

  /* (1) GATE + READ — spend.js's, so the bucket comes from the registry and an
         unknown one fails closed in the database.

         ⚠ RULE 3 HAS NOTHING TO GRADE HERE and is therefore not consulted, the
           way unlock_buy consults `collectsFirst` and dungeon_settle does not:
           this verb builds NO delta, so there is no key it could carry that
           would stamp `accrued_to` and confiscate the unpaid window. The
           property is asserted where it lives — the migration's §4 self-check
           measures `accrued_to` across a real claim and fails if it moved. */
  const read = await gateAndRead({ exec, user, slot, verb: VERB });
  if (read.refusal) return read.refusal;
  const env = read.env;

  /* (2) THE COMMIT. The key is the CLIENT's — a claim is a tap, and the client
         is the only party that knows which retry is which. A replay of the SAME
         key returns the stored answer with `replayed:true`; a DIFFERENT key for
         a trophy already held is `already_owned`. Those are different facts and
         the RPC keeps them apart, so a double-click does not read as an error. */
  const [row] = await exec(CLAIM_SQL, [user, slot, claim.monster, claim.stage, intentId]);
  const res = (row && row.res) || null;
  if (!res || res.ok !== true) {
    /* NOTHING WAS APPLIED — hr_trophy_claim's protected block rolls back in
       full, journal row included, so "a rejected intent is retried with a NEW
       key" holds here without exception. The code is the function's own,
       returned verbatim so it survives to the client and to hr_rejections. */
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb: VERB,
        refusal: { error: (res && res.error) || 'trophy_claim_failed', stage: 'claim', detail: res ?? null },
        fallback: env,
      }),
    };
  }

  /* (3) THE ENVELOPE. `hr_state_of` verbatim — the client renders it and
         computes nothing.

         THE RECEIPT IS NULL ON A REPLAY, spend.js's rule and for spend.js's
         reason: this receipt describes THE CLAIM ITSELF, and this invocation
         wrote nothing. The trophy is still held either way, and hr_trophy_of
         still reports it.

         ⚠ THE RECEIPT IS BUILT FROM `res.claimed`, NEVER FROM THE REQUEST
           (Security C4, unlock_buy's receipt rule). `kills_at_claim` in
           particular is the count hr_trophy_claim READ under the lock, inside
           the transaction that wrote the row — so a client whose own idea of
           the count ran ahead is shown the server's number and reconciles,
           rather than being shown its own back (CLAUDE.md §6).
           Absent `claimed` → null, fail closed: no receipt beats a made-up one.

         ⚠ AND THERE IS NO `gold`, `gems`, `items` OR `xp` FIELD ON IT, because
           there is nothing to put in one. A receipt shaped like a payout is the
           first step toward somebody adding a payout. */
  /* (4) THE FRESH PROJECTION. Best-effort: a failed re-read must NOT turn a
         successful claim into an error — the row IS written and the caller is
         entitled to know that. The key is then simply OMITTED and the client
         falls back to its existing mirror until the next settle, which is the
         behaviour before this statement existed. Absence is never a claim. */
  let bestiary = null;
  try {
    const [proj] = await exec(PROJECTION_SQL, [user, slot]);
    if (proj) {
      bestiary = {
        kills_by_monster: (proj.kills && typeof proj.kills === 'object') ? proj.kills : {},
        trophies: Array.isArray(proj.trophies) ? proj.trophies : [],
      };
    }
  } catch { /* see above — the claim stands either way */ }

  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb: VERB,
      ...(bestiary ? { bestiary } : {}),
      receipt: (res.replayed === true || !res.claimed) ? null : {
        monster: res.claimed?.monster,
        stage: res.claimed?.stage,
        killsAtClaim: res.claimed?.kills_at_claim,
      },
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}
