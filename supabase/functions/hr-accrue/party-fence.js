// ============================================================================
// supabase/functions/hr-accrue/party-fence.js — INVARIANT 8 AT THE INTENT DOOR.
//
// docs/planning/WORLD_TICK_DESIGN.md §18.2.3 invariant 8, §18.3's existing-verbs
// table, §18.4 T-5b. ONE predicate — `hr_partied(user, slot)` — at every door a
// partied character could otherwise use to re-price a window three other people
// are paid from.
//
// ── WHY THIS IS A FENCE AND NOT A PREFERENCE ────────────────────────────────
// §18.4 T-5b is forging by TIMING rather than by number. A member's own
// `accrue`, or any `collectsFirst` verb, could advance their `accrued_to` into
// the middle of a party window — at which point the party cannot replay over
// the paid minute and the other three are never paid for it either. The
// quantity the client controls is the INSTANT of an ordinary intent, and it
// crosses into three other players' economies. That is `CLAUDE.md` §1's target
// property failing by timing, on the normal client path, every time anybody in
// a party touches anything.
//
// So for the life of a party hunt the party watermark IS the member's watermark
// and `hr_party_tick_settle` is the only writer of either. §18.2.4's old "a
// member whose own accrued_to is ahead drags the party's `from` forward"
// sentence is DELETED, not softened: there is no correct way for one member to
// move a shared window's left edge.
//
//   accrue (including the ~90 s attended cadence) → `party_settle_required`
//       There is nothing for it to price: the party owns
//       [party_hunt.accrued_to, now]. This is ALSO the whole of S-4's attended
//       fence (invariant 9): with `accrue` refused there is no attended top-up
//       for a party member to receive and no `hr_kill_credit_log` row is
//       written for them, so §16.6's roster exclusion is VACUOUS for party
//       members rather than contended — and the emptiness of §16.6's attended
//       bucket is itself the assertion that the fence is live (§18-SEC.2, 8c).
//
//   every `collectsFirst: true` verb                 → `party_hunt_running`
//       set_activity, equip, enchant, and the shop and buff verbs that collect.
//       Each either stamps a `STAMP_KEYS` key or changes an input the shared
//       window is priced from. Suppressing the collect instead would leave an
//       approximation four players share; a refusal one player can SEE is
//       strictly better, and §18.1 names the cost rather than discovering it.
//       Auto-eat still fires inside the simulation, so nothing a hunt actually
//       needs is behind the refusal.
//
//   everything else (reads, bug reports, cosmetics)  → unaffected.
//
// ── WHERE IT SITS, AND WHY ONE PLACE ───────────────────────────────────────
// §18.3: *"checked in INTENT_REGISTRY's dispatch, before any key is derived."*
// ONE call site in index.ts, before the verb dispatch, rather than a copy in
// each of the eight `collectsFirst` handlers — eight copies is eight chances to
// forget one, and the one forgotten is the one that confiscates four nights.
//
// `collectsFirst()` is the reader of the registry column, so this fence covers
// a verb the day its row flips without anybody having to remember it.
//
// ── IT FAILS CLOSED ON ITS OWN ERROR, AND THAT IS THE SAFE DIRECTION ───────
// A predicate that cannot be read is answered `party_settle_required` rather
// than waved through: the cost of a false refusal is a player retrying, and the
// cost of a false pass is three other players' window re-priced by somebody
// else's button. §18.3 already gives the client a retry for that code.
//
// PURE ESM, Node + Deno. No `?v=` (not under src/**).
// ============================================================================

import { collectsFirst } from './intents.js';

/** The verb whose refusal is its own, because the party already owns the
    window it would price (§18.2.3 invariant 8, first door). */
export const ACCRUE_VERB = 'accrue';

/** §18.3's two codes. 409 both: they are real things the server refuses, not
    malformed requests, and `intents.js`'s taxonomy is what decides that. */
export const PARTY_SETTLE_REQUIRED = 'party_settle_required';
export const PARTY_HUNT_RUNNING = 'party_hunt_running';

/** Which code a verb is refused with. Exported so a guard asserts the mapping
    against ONE definition rather than against a copy of it. */
export function partyRefusalFor(verb) {
  if (verb === ACCRUE_VERB) return PARTY_SETTLE_REQUIRED;
  return collectsFirst(verb) ? PARTY_HUNT_RUNNING : null;
}

/**
 * The fence. Returns `null` when the verb may proceed, or the refusal body the
 * caller should answer with.
 *
 * ⚠ THE PREDICATE IS ONLY CONSULTED FOR A VERB THAT WOULD BE REFUSED. A read,
 *   a bug report or a cosmetic pays no round trip for a fence that could not
 *   have applied to it — which is what keeps this from being a query on every
 *   intent in the game.
 */
export async function partyIntentFence(o) {
  const code = partyRefusalFor(o && o.verb);
  if (code === null) return null;
  let partied;
  try {
    const [row] = await o.exec(
      'select public.hr_partied($1::uuid, $2::int) as partied',
      [o.user, o.slot]);
    partied = row ? row.partied === true : null;
  } catch {
    partied = null;                                   // fails closed, below
  }
  if (partied === false) return null;
  if (partied === null) {
    /* THE PREDICATE COULD NOT BE READ. Refuse, and refuse with the code the
       client already retries once on — never wave through, because the cost of
       the two mistakes is not symmetric. */
    return { status: 409, body: { ok: false, error: PARTY_SETTLE_REQUIRED, retry_ms: 2000 } };
  }
  return code === PARTY_SETTLE_REQUIRED
    ? { status: 409, body: { ok: false, error: code, retry_ms: 2000 } }
    /* The panel offers *Stop the hunt* and *Leave*; the client renders those
       from the code, and the server names no button. */
    : { status: 409, body: { ok: false, error: code } };
}
