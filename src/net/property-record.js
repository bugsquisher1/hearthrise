// ============================================================================
// src/net/property-record.js — THE PROPERTY RUNG OFF THE WIRE (b492).
//
// ── THE LIVE P1 THIS CLOSES (Paione, 2026-08-29; QA 0a47ba77 slot 0) ─────────
// Two reports, ONE root: "hire a worker and it disappears" and "the problem
// with the planting in farm". Measured on the live server:
//
//   SERVER  player_progress: kind='unlock' key='property:homestead' value=1,
//           kind='unlock' key='worker_hire' value=1, one player_workers row.
//   CLIENT  G.homestead = {tier:0} — Wanderer's Camp. Worker cap 0 beside a
//           hired worker ("Workers 1/0"). Farm renders 2 plots, not 4.
//
// The property TIER — and EVERYTHING it gates (farm-plot count, worker slots,
// room prerequisites, offline-cap hours, the castle XP capstone, next-upgrade
// pricing) — was read from ONE number: `G.homestead.tier`, a RESIDUE field
// (src/net/client-state.js RESIDUE_FIELDS). Residue is the client's own
// self-only bag: the server stores it verbatim and never derives authority from
// it. So when a residue save was lost — the rpc-gate bucket window froze
// `client_state_put` for five builds; a device change; any failed upload — the
// tier fell back to 0 and NOTHING re-derived it. The player had PAID for the
// rung, the server had the row, and the client had no path from one to the
// other. That is the defect: a purchased, server-owned entitlement whose only
// client representation was a cache with no authority behind it.
//
// ── THE RUNG ALREADY ARRIVES. NO SERVER CHANGE IS NEEDED. ───────────────────
// `hr_state_of` (2026-08-25-workers.sql §1d, the current body) projects EVERY
// permanent player_progress row in the top-level `progress` array:
//     { kind:'unlock', key:'property:homestead', value:1, period:'', state:… }
// — permanent rows (period_key = '') are read UNFILTERED, so the property rung
// is in the boot hr_load envelope AND in every hr-accrue settle envelope,
// today, in production. This module is the READ SIDE of a value that was
// already on the wire and simply had no reader. It is the exact analogue of
// src/net/rooms-record.js, which shapes `room:<id>` rows out of the same array.
//
// The server's OWN tier rule is `max(value) over namespace 'property'`
// (2026-08-16-unlock-buy.sql §prereq_property_tier, lines 489-498). This module
// restates that rule and nothing else. The five rungs' values (homestead=1,
// farmstead=2, manor=3, keep=4, castle=5 — 2026-08-16-unlocks.generated.sql)
// are BY CONSTRUCTION the index into features/homestead.js TIERS, whose 0th
// entry is the un-bought camp. So the rung IS the tier; no mapping table, no
// second place for a sixth tier to have to be registered.
//
// ── b502 — THE SERVER RUNG IS TRUTH IN **BOTH** DIRECTIONS ──────────────────
// ⚠ THIS MODULE SHIPPED (b492) AS A RAISE-ONLY FLOOR: `max(server, residue)`.
//   That healed the reported half — residue BEHIND the server — and PRESERVED
//   THE OTHER HALF FOREVER. Proven live on 2026-09-04 (paione, "the rooms are
//   still not being built"):
//
//     SERVER  player_progress slot 0: unlock property:homestead = 1. No
//             `property:farmstead` row. The server's rung is 1.
//     CLIENT  player_state.client_state -> 'homestead' = { "tier": 2 }.
//     RESULT  hr_rejections 16:23–16:32 UTC: unlock_buy `room.forge.1` refused
//             `prereq_property_tier {have:1, need:2}` — TEN times. Same refusal
//             on 09-01 and 08-31; `worker_hire.2` since 08-27; a second player
//             (071d8b19…) on `room.workshop.1` ×11 on 08-26.
//
//   The residue went ahead of the server under the pre-b500 optimistic `tier++`
//   whose rejection was swallowed. b500/b501 stopped NEW advances but could not
//   repair a residue that was ALREADY wrong, because max() preserves the lie by
//   construction: the House named the Farmstead, the Forge card looked
//   buildable, "Upgrade Property" offered the rung ABOVE the one he was missing,
//   and EVERY build reached the server and bounced. An account that cannot build,
//   cannot hire, and is not even OFFERED the rung it needs is unplayable — and
//   nothing in the client could ever climb back out.
//
// THE CLASS: a client-authored RESIDUE field gating a SERVER-OWNED capability.
// Residue may cache a server value; it may never out-rank one. So:
//
//   • WHEN THE SERVER HAS SPOKEN **EXACTLY**, THE SERVER'S RUNG IS THE TIER —
//     up or down. The residue becomes a display cache that this module
//     OVERWRITES on load and on every envelope, and the corrected value is
//     written back into `G.homestead` so the stored residue self-heals on the
//     next upload. A COMPLETE `progress` projection is exact: hr_state_of
//     projects permanent rows (`period_key = ''`) unfiltered by date and ORDERS
//     them first inside its 1000-row window (2026-08-26-marks-record.sql
//     §hr_state_of), so a complete array with no `property:` row is a real
//     "owns no rung", not a gap.
//
//   • ABSENCE IS STILL NOT A CLAIM. UNKNOWN (no `progress` array at all — a
//     pre-projection server, a malformed body, a lean answer) leaves the residue
//     exactly where it is. A missing statement is not a statement of zero.
//
//   • AN ADMITTEDLY-INCOMPLETE STATEMENT IS A **FLOOR**, NOT A TIER. When
//     `progress_truncated` is set, a PRESENT row is still real but an ABSENT one
//     proves nothing — so such an answer may RAISE the tier and may never lower
//     it, i.e. it behaves exactly like b492's max(). That is the demotion hazard
//     the b492 header refused server-only over, and it is closed by reading the
//     flag the server already sends rather than by refusing to ever lower.
//     ⚠ THE FIRST cut of this fix stored the value and threw the provenance
//       away, so a truncated first envelope demoted a manor owner to the camp.
//       The record therefore carries EXACT-vs-FLOOR beside the number; the
//       census (tests/property-gate-census.mjs L1d) is what caught it.
//
// THREE STATEMENTS, ONE RECORD. The server says the rung in three ways and all
// three land here, which is what makes a broken client self-heal without support:
//   1. `notePropertyUnlocks(envelope)`  — the `progress` projection. EXACT when
//      complete (sets either way), a FLOOR when truncated (raises only).
//   2. `notePropertyGranted(rung)`      — an APPLIED hr_unlock_buy verdict (RAISE).
//      Without this a confirmed purchase would be un-done by the very next read,
//      because the record would still hold the pre-purchase rung until the next
//      envelope landed. A receipt for one rung proves "at least", so it carries
//      exactness forward but never manufactures it.
//   3. `notePropertyRefusalTier(have)`  — a `prereq_property_tier` refusal, whose
//      `have` IS `max(value) over namespace 'property'` computed server-side
//      (2026-08-16-unlock-buy.sql §(e)) — an EXACT reading. Conservative on
//      purpose: it may RAISE, and it may only SET DOWNWARD when nothing has been
//      observed yet, so a late refusal from a concurrent gesture can never roll
//      back a rung a complete envelope or a confirmed grant already established.
//
// The residue is still self-forgeable (it always was — nothing here widens it).
// Forging it now buys LESS than before: the first complete envelope, or the
// first refusal, overwrites it.
//
// ── THE SESSION RATCHET, AND WHY THE HEAL IS AT THE READ ────────────────────
// Observation is separated from repair on purpose:
//
//   notePropertyUnlocks(res)  updates a MODULE-LEVEL record from an envelope.
//                             Writes NOTHING into G, so it is safe to call from
//                             any path, in any order, at any point in boot.
//   healPropertyTier(G)       CONFORMS G.homestead.tier to the record — raising
//                             a stale tier AND lowering a forged one. O(1) (two
//                             integer compares), called from the READ
//                             (features/homestead.js getTier).
//
// Doing the repair at the READ is what makes this ORDER-PROOF, and that matters
// concretely: record.js's boot settle() hydrates the residue bag into G
// (applyClientState → hydrateInto) as one step among a dozen, and an hr-accrue
// envelope can land on either side of it. A heal written into G at envelope
// time would be overwritten by a residue hydrate that follows it — the class of
// race that produced this bug's neighbours all week. A cached rung consulted at
// every read cannot lose that race: the hydrate writes whatever the bag held,
// the next getTier() conforms it to the record, and the conformed value is what
// the residue save uploads (G.homestead rides buildResiduePatch), so the repair
// PERSISTS after one save cycle without any special-case write. That is the half
// that fixes paione's stored `{tier:2}` for good rather than for one session.
//
// The record is SESSION-scoped, matching client-state.js's own serverBag (also
// session-scoped, also never reset in prod — a slot switch reloads the page).
// __resetPropertyRecord() is the test/sign-out seam.
//
// PURE + DOM-free + Node-importable. No imports: the pick functions are total
// functions of an envelope and the cache is three integers.
// ============================================================================

/* The unlock namespace whose max IS the property tier — the same namespace
   hr_unlock_buy takes its max over. A sixth property rung is a data row in
   2026-08-16-unlocks.generated.sql plus a TIERS entry; nothing here changes. */
const PROPERTY_PREFIX = 'property:';

/* The crew-size ladder (src/data/gold-ladders.js WORKER_LADDER, unlock_id
   'worker_hire'). This is the cap hr_worker_hire itself reads, so it is the one
   number that can make the client's pre-flight agree with the server's answer. */
const WORKER_UNLOCK = 'worker_hire';

/** Is this a PERMANENT unlock row (period_key = '')? Period rows are dailies /
 *  weeklies and are pruned at 31 days — a rung must never be read out of one.
 *  An ABSENT `period` is treated as permanent: hr_state_of always projects the
 *  key, and refusing a row for a field a future projection might drop would
 *  fail OPEN into a demotion, which is the direction this module forbids. */
function isPermanentUnlock(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.kind !== 'unlock') return false;
  return row.period === '' || row.period === null || typeof row.period === 'undefined';
}

/** The rung value of one row, or null if it is not a usable integer >= 0. */
function rungValue(row) {
  const n = Number(row.value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * THE SHAPE STEP, pure. Highest permanent `unlock` rung whose key satisfies
 * `match`, read out of an envelope's top-level `progress` array.
 *
 * FAIL-CLOSED ON ABSENCE, not on empty — the same distinction pickRooms draws:
 *   • no `progress` ARRAY at all  → null  (UNKNOWN: a pre-projection server, a
 *                                          malformed body, a lean answer)
 *   • a PRESENT array with no matching row → 0 (a real "owns no rung yet")
 * A single malformed row is SKIPPED rather than condemning the scan, because
 * unlike a room MAP this is a max: one bad cell cannot corrupt the answer, and
 * dropping the whole scan would throw away a rung that is sitting right there.
 */
function highestRung(res, match) {
  if (!res || typeof res !== 'object') return null;
  const prog = res.progress;
  if (!Array.isArray(prog)) return null;
  let best = 0;
  for (const row of prog) {
    if (!isPermanentUnlock(row)) continue;
    const key = typeof row.key === 'string' ? row.key : '';
    if (!key || !match(key)) continue;
    const v = rungValue(row);
    if (v !== null && v > best) best = v;
  }
  return best;
}

/** The property tier the SERVER states, or null when the envelope does not say.
 *  `max` over the whole `property:` namespace — hr_unlock_buy's own rule. */
export function pickPropertyTier(res) {
  return highestRung(res, (k) => k.indexOf(PROPERTY_PREFIX) === 0);
}

/** The paid crew cap the SERVER states, or null when the envelope does not say. */
export function pickWorkerRung(res) {
  return highestRung(res, (k) => k === WORKER_UNLOCK);
}

/* ── THE SESSION RECORD: A VALUE **AND** WHAT KIND OF CLAIM IT IS ─────────────
   `null` = never observed (UNKNOWN). Everything else is one of TWO claims, and
   collapsing them is what made the first cut of this fix demote a manor owner:

     EXACT  "the player's max over the `property` namespace IS this number."
            Only a COMPLETE `progress` projection, an ingested
            `prereq_property_tier` refusal (whose `have` is that very max,
            computed server-side — 2026-08-16-unlock-buy.sql §(e)), or a
            confirmed grant on top of an exact base can say that. An exact
            record OUT-RANKS the residue in BOTH directions. This is the b502
            repair.
     FLOOR  "the player owns AT LEAST this rung." A `progress_truncated`
            answer and a bare purchase receipt are floors: a PRESENT row is
            real, an ABSENT one proves nothing. A floor may raise the residue
            and may never lower it — i.e. exactly the b492 behaviour, kept
            intact for precisely the case b492 was built for.

   Without the distinction, the FIRST statement of a session was taken as truth
   whatever its provenance, so a truncated envelope that happened to drop the
   `property:` row read as "owns no rung" and conformed a castle down to the
   camp. The census (tests/property-gate-census.mjs L1d) catches that; it caught
   it here. */
let observedTier = null;
let observedWorkers = null;
/* Is `observedTier` an EXACT statement (true) or only a FLOOR (false)? Meaning-
   less while observedTier is null. */
let observedExact = false;

/** Is this envelope's `progress` array a COMPLETE statement of the permanent
 *  rows — i.e. has this body EARNED the right to LOWER a rung?
 *
 *  THE ENVELOPE MUST DECLARE ITS OWN COMPLETENESS. `progress_truncated` has to
 *  be present and boolean: `false` means "this array IS the whole permanent
 *  projection", `true` means "the 1000-row cap bit". An array with NO flag has
 *  said nothing about how complete it is, so it is read as a FLOOR (raise-only —
 *  exactly b492) rather than as truth.
 *
 *  ⚠ THIS PREDICATE WAS FIRST WRITTEN AS `!== true` — "an absent flag means
 *    complete" — and the in-page suite proved that wrong the same afternoon: two
 *    unrelated tests went red (`b354` Build button, `WORKER-LEDGER-1` hire)
 *    because ONE envelope fixture carrying a FILLER `progress: []` was read as a
 *    complete statement of "this player owns no property", conformed the tier to
 *    0, and left it there for every test that followed. A fixture found it; the
 *    class is not confined to fixtures. Any body carrying a PARTIAL `progress`
 *    array without declaring it — a lean or legacy response, a hand-assembled
 *    one, a future caller building an envelope by hand — would demote a real
 *    manor owner to the Wanderer's Camp. That is the b492 P1 rebuilt from the
 *    other side, and the exact hazard b492's header refused server-only over.
 *
 *  REQUIRING THE FLAG COSTS NOTHING IN PRODUCTION, and that is MEASURED, not
 *  assumed. Every response envelope in this system is `hr_state_of` verbatim
 *  (supabase/functions/hr-accrue/index.ts — "the authoritative post-apply
 *  envelope, straight from hr_state_of"; every RPC does
 *  `v_out := public.hr_state_of(...)`). hr_state_of builds `progress` and
 *  `progress_truncated` in the SAME jsonb_build_object; a migration guard fails
 *  the deploy if its body lacks either (2026-08-15-auto-eat.sql: `position('limit
 *  1000' …) = 0 or position('progress_truncated' …) = 0` → raise), the envelope
 *  key list asserts both ship (same file, c_env_keys), and a PGlite guard over
 *  the real migration chain asserts the value literally arrives as `false`
 *  (tests/goal-counters.mjs G7: `env.progress_truncated === false`).
 *  src/features/daily-reward.js already reads the same flag for the same reason.
 *
 *  So RAISING is unchanged in every case, and LOWERING — the one direction that
 *  can take a capability away from a player — now requires the server to have
 *  said, in the same breath, that it was telling the whole story.
 *
 *  Worth knowing when judging how safe "complete" is: hr_state_of orders the
 *  projection `by period_key, kind, key` before the LIMIT, and permanent rows
 *  carry `period_key = ''` — the smallest value — so the permanent rows a rung
 *  lives in are the FIRST rows in the window and are the last thing truncation
 *  would reach. (2026-08-26-marks-record.sql §hr_state_of.) */
function isCompleteStatement(res) {
  return !!(res && typeof res === 'object' && res.progress_truncated === false);
}

/** One merge step, shared by the tier and the crew rung so the two can never
 *  drift into different rules. `next` is null when the envelope did not say.
 *  Returns the new value AND whether it is exact, because "what the number is"
 *  and "how much the number may be trusted downward" are two different facts. */
function mergeRung(prev, prevExact, next, complete) {
  // UNKNOWN: no statement at all. Absence is not a claim.
  if (next === null) return { value: prev, exact: prevExact, changed: false };
  // A COMPLETE projection is the whole permanent namespace: it SETS, either way.
  if (complete) return { value: next, exact: true, changed: next !== prev };
  // TRUNCATED: a floor. It may raise; it may never lower, and it may never
  // upgrade an exact reading into a guess.
  if (prev === null) return { value: next, exact: false, changed: true };
  if (next > prev) return { value: next, exact: false, changed: true };
  return { value: prev, exact: prevExact, changed: false };
}

/**
 * OBSERVE an envelope. Conforms the record to it; writes NOTHING into G, so it
 * is safe at any point of any load path and cannot race a residue hydrate.
 * Returns a receipt for the suite and for diagnostics.
 */
export function notePropertyUnlocks(res) {
  const tier = pickPropertyTier(res);
  const workers = pickWorkerRung(res);
  const complete = isCompleteStatement(res);
  const before = observedTier;
  const t = mergeRung(observedTier, observedExact, tier, complete);
  const w = mergeRung(observedWorkers, true, workers, complete);
  observedTier = t.value;
  observedExact = t.exact;
  observedWorkers = w.value;
  return {
    mode: (tier === null && workers === null) ? 'absent' : 'server',
    tier: observedTier, workers: observedWorkers, exact: observedExact,
    raised: (t.changed && (before === null || observedTier > before)) || w.changed,
    lowered: before !== null && observedTier !== null && observedTier < before,
    complete, truncated: !complete,
  };
}

/**
 * THE SERVER APPLIED A RUNG (an `applied`/`replayed`/`already_owned` verdict
 * from hr_unlock_buy). RAISE ONLY — this is a receipt for a purchase, never a
 * statement about the whole namespace.
 *
 * ⚠ LOAD-BEARING, not bookkeeping. Without it a CONFIRMED upgrade would be
 *   un-done by the very next getTier(): the caller writes the new rung into the
 *   residue, the record still holds the pre-purchase rung, and "the server rung
 *   is truth in both directions" would dutifully roll the purchase back until
 *   the next envelope arrived. The server just said it applied; that is a
 *   statement, and it belongs in the record.
 */
export function notePropertyGranted(rung) {
  const n = Number(rung);
  if (!Number.isFinite(n) || n < 0) return { ok: false, tier: observedTier };
  const v = Math.floor(n);
  const raised = observedTier === null || v > observedTier;
  if (raised) {
    /* EXACTNESS CARRIES, IT IS NOT CREATED. Raising an EXACT reading with a
       receipt keeps it exact: the max was E, the server just merged v > E, so
       the max is now v. Raising from UNKNOWN or from a FLOOR yields a floor —
       "at least v" is all a receipt for one rung can prove about a namespace. */
    observedExact = (observedTier !== null && observedExact);
    observedTier = v;
  }
  return { ok: true, tier: observedTier, raised, exact: observedExact };
}

/**
 * A `prereq_property_tier` REFUSAL states the server's own rung in `have` —
 * the one authoritative reading available to a client whose envelope never
 * carried the row (or never arrived). Ingesting it is what makes the very first
 * refused click correct the House card, the room locks and the upgrade offer.
 *
 * DELIBERATELY CONSERVATIVE ON THE WAY DOWN: it may RAISE freely, but it may
 * only LOWER when nothing has been observed yet. A refusal is a snapshot from
 * whenever that RPC ran, and unlock gestures are only latched PER OFFER — a
 * room refusal could land after a property grant and would otherwise roll a
 * just-bought rung backwards. A complete envelope corrects any staleness within
 * seconds anyway, so there is nothing to gain by racing it.
 */
export function notePropertyRefusalTier(have) {
  const n = Number(have);
  if (!Number.isFinite(n) || n < 0) return { ok: false, tier: observedTier };
  const v = Math.floor(n);
  /* `have` IS the max over the namespace, so wherever it is allowed to land it
     lands as EXACT — that is the whole reason one refused click can correct a
     screen the envelope never corrected. Where it is NOT allowed to land (a
     stale refusal below an established rung) it changes nothing at all,
     exactness included. */
  if (observedTier === null || v > observedTier) {
    const from = observedTier;
    observedTier = v;
    observedExact = true;
    return { ok: true, tier: observedTier, changed: true, from, exact: true };
  }
  if (v === observedTier) { observedExact = true; return { ok: true, tier: observedTier, changed: false, exact: true }; }
  return { ok: true, tier: observedTier, changed: false, exact: observedExact };
}

/** The property rung the server has stated this session, or null (UNKNOWN). */
export function serverPropertyTier() { return observedTier; }
/** The paid crew cap the server has stated this session, or null (UNKNOWN). */
export function serverWorkerRung() { return observedWorkers; }
/** Has the server stated the property rung at all this session? UNKNOWN is the
 *  ONE state in which the residue is the only reading available — every caller
 *  that gates a capability should be able to say so honestly rather than guess.
 *  Published on the verdict (`pending`) rather than used to refuse: see
 *  features/homestead.js serverRungKnown for the ruling and its evidence. */
export function propertyTierKnown() { return observedTier !== null; }
/** Is the record an EXACT statement of the rung (true) or only a FLOOR under it
 *  (false — a truncated projection or a bare purchase receipt)? Only an exact
 *  record may lower the residue. */
export function propertyTierExact() { return observedTier !== null && observedExact; }
/** The record is a floor rather than an exact rung — i.e. the last thing that
 *  moved it was an admittedly-incomplete statement. Diagnostics + the suite. */
export function propertyStatementTruncated() { return observedTier !== null && !observedExact; }

/** The residue's own tier, floored to a usable integer. 0 when absent/garbage —
 *  never negative, never NaN, so it is always a safe floor for the max below. */
export function residuePropertyTier(G) {
  const h = G && G.homestead;
  if (!h || typeof h !== 'object') return 0;
  const n = Number(h.tier);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** THE ANSWER, and it has exactly three cases:
 *    EXACT record   → the record, up or down. (b502: the residue may not
 *                     out-rank a server statement — that is the live P1.)
 *    FLOOR record   → max(record, residue). (b492: raise a stale residue toward
 *                     a rung we can only prove a lower bound for.)
 *    UNKNOWN        → the residue, unchanged. Absence is not a claim, and with
 *                     no statement this is byte-for-byte the read this line has
 *                     always been (a client-authoritative session has no other
 *                     source, and never will have one). */
export function effectivePropertyTier(G) {
  if (observedTier === null) return residuePropertyTier(G);
  if (observedExact) return observedTier;
  const residue = residuePropertyTier(G);
  return observedTier > residue ? observedTier : residue;
}

/**
 * THE CONFORM. Make `G.homestead.tier` agree with the record — RAISING a stale
 * tier (the b492 case: a lost residue save demoted a paid Homestead to the camp)
 * and LOWERING a forged one (the b502 case: an optimistic `tier++` whose
 * rejection was swallowed left `{tier:2}` against a server rung of 1, and every
 * build, hire and land purchase bounced off `prereq_property_tier` forever).
 * O(1) — two integer compares — because the read path calls it on every
 * getTier(), i.e. inside render loops.
 *
 * Writing it into G rather than only deriving it is what makes the repair
 * PERSIST: `homestead` is a residue field, so the conformed value rides the next
 * buildResiduePatch upload and the player is fixed for good, not just for the
 * current session. It is also what keeps every direct `G.homestead.tier` read
 * path (save/load, the smoke suite, anything not routed through getTier)
 * telling the same story as the UI.
 *
 * NEVER MOVES ANYTHING WHILE UNKNOWN: with no observed rung this is a pure
 * no-op and `ensureState()` keeps its grandfathering job.
 */
export function healPropertyTier(G) {
  if (!G || typeof G !== 'object') return { mode: 'no-state', tier: null, healed: false };
  const residue = residuePropertyTier(G);
  if (observedTier === null) return { mode: 'unknown', tier: residue, healed: false };
  const eff = effectivePropertyTier(G);
  if (eff === residue) return { mode: 'ok', tier: residue, healed: false, exact: observedExact };
  if (!G.homestead || typeof G.homestead !== 'object') G.homestead = {};
  G.homestead.tier = eff;
  return {
    mode: 'ok', tier: eff, healed: true, from: residue,
    lowered: eff < residue, exact: observedExact,
  };
}

/**
 * THE CREW CAP, floored by what the player has actually PAID FOR.
 *
 * `tierSlots` is features/homestead.js's TIERS[tier].workers — the client's
 * mirror of the ladder. The `worker_hire` rung is the number hr_worker_hire
 * itself materialises against, so taking the max means the client's pre-flight
 * gate can never refuse a hire the server would grant, and the panel can never
 * again print "Workers 1/0" beside a worker the server owns. Belt AND braces:
 * this stands even if the `property:` row is the one missing from a truncated
 * `progress` array.
 */
export function effectiveWorkerSlots(G, tierSlots) {
  const base = Number.isFinite(Number(tierSlots)) ? Math.max(0, Math.floor(Number(tierSlots))) : 0;
  return (observedWorkers !== null && observedWorkers > base) ? observedWorkers : base;
}

/** TEST / sign-out seam. Forgets everything the session observed and RETURNS the
 *  previous pair, so a test can put a live signed-in session back exactly as it
 *  found it (`const prev = __resetPropertyRecord(); … __resetPropertyRecord(prev.tier, prev.workers)`)
 *  rather than silently dropping a rung a real envelope had already delivered. */
export function __resetPropertyRecord(tier, workers) {
  const prev = { tier: observedTier, workers: observedWorkers, exact: observedExact };
  /* THE RECEIPT ROUND-TRIPS. `__resetPropertyRecord(prev)` restores the exact/
     floor provenance too, which matters on a LIVE signed-in page: the suite
     parks the record for the whole run, and putting a FLOOR back as an EXACT
     statement would let the restore lower a residue the server never claimed
     to have measured. The two-argument form is kept for the ~30 existing call
     sites and assumes EXACT, which is what a hand-written test fixture means. */
  if (tier && typeof tier === 'object') {
    const r = tier;
    observedTier = (typeof r.tier === 'number' && Number.isFinite(r.tier)) ? Math.floor(r.tier) : null;
    observedWorkers = (typeof r.workers === 'number' && Number.isFinite(r.workers)) ? Math.floor(r.workers) : null;
    observedExact = observedTier !== null && r.exact !== false;
    return prev;
  }
  observedTier = (typeof tier === 'number' && Number.isFinite(tier)) ? Math.floor(tier) : null;
  observedWorkers = (typeof workers === 'number' && Number.isFinite(workers)) ? Math.floor(workers) : null;
  observedExact = observedTier !== null;
  return prev;
}

if (typeof window !== 'undefined') {
  window.HearthriseProperty = {
    pickPropertyTier, pickWorkerRung, notePropertyUnlocks,
    notePropertyGranted, notePropertyRefusalTier,
    serverPropertyTier, serverWorkerRung, propertyTierKnown, propertyTierExact,
    propertyStatementTruncated,
    residuePropertyTier, effectivePropertyTier, healPropertyTier,
    effectiveWorkerSlots, __resetPropertyRecord,
  };
}
