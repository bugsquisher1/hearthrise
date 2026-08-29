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
// ── max(SERVER RUNG, RESIDUE) — AND WHY NOT SERVER-ONLY ─────────────────────
// The merge is MONOTONE UP, never down, in both directions:
//
//   • THE SERVER RUNG WINS UPWARD. A rung can only ever be BOUGHT
//     (hr_unlocks merge='max'); it is never sold, refunded or decremented. So a
//     rung above the residue is proof the residue is stale, and raising to it
//     can never take anything from a player. This is what heals Paione and
//     every other player already broken — silently, on their next boot, with no
//     support action and no migration.
//
//   • THE RESIDUE IS A FLOOR, NEVER OVERRIDDEN DOWNWARD. Server-ONLY was
//     considered and REFUSED: `hr_state_of` caps `progress` at 1000 rows and
//     reports `progress_truncated`, so a long-lived character's property row is
//     droppable; a server build predating the projection sends no array at all;
//     a lean/malformed envelope sends garbage. Under server-only every one of
//     those DEMOTES a castle owner to a bedroll — reintroducing the exact bug
//     from the other side, and worse, because it would hit players whose
//     residue was fine. Absence is not a claim. UNKNOWN leaves the floor alone.
//
// The residue floor is self-forgeable (it always was — this module does not
// widen it by one byte, it only raises the floor toward server truth). Forging
// it buys a LOCAL DISPLAY and nothing else: every consequence is re-gated
// server-side on the server's own rung — `hr_unlock_buy` re-checks
// `req_property_tier` for every farm_land / worker_hire / room rung, and
// `hr_worker_hire` reads the paid `worker_hire` rung directly. A forged tier
// shows plots you cannot buy and a Hire the server refuses.
//
// ── THE SESSION RATCHET, AND WHY THE HEAL IS AT THE READ ────────────────────
// Observation is separated from repair on purpose:
//
//   notePropertyUnlocks(res)  ratchets a MODULE-LEVEL cache up from an envelope.
//                             Writes NOTHING into G, so it is safe to call from
//                             any path, in any order, at any point in boot.
//   healPropertyTier(G)       raises G.homestead.tier to the cached rung. O(1)
//                             (two integer compares), called from the READ
//                             (features/homestead.js getTier).
//
// Doing the repair at the READ is what makes this ORDER-PROOF, and that matters
// concretely: record.js's boot settle() hydrates the residue bag into G
// (applyClientState → hydrateInto) as one step among a dozen, and an hr-accrue
// envelope can land on either side of it. A heal written into G at envelope
// time would be overwritten by a residue hydrate that follows it — the class of
// race that produced this bug's neighbours all week. A cached rung consulted at
// every read cannot lose that race: the hydrate writes tier 0, the next
// getTier() raises it back, and the raised value is what the residue save
// uploads (G.homestead rides buildResiduePatch), so the heal PERSISTS after one
// save cycle without any special-case write.
//
// The cache is SESSION-scoped and monotone, matching client-state.js's own
// serverBag (also session-scoped, also never reset in prod — a slot switch
// reloads the page). __resetPropertyRecord() is the test/sign-out seam.
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

/* ── THE SESSION CACHE ────────────────────────────────────────────────────────
   null = never observed (UNKNOWN). Monotone: an envelope may only ever RAISE
   these, because a rung is never lost. That also makes a truncated `progress`
   array harmless — it can lose the max, never win it. */
let observedTier = null;
let observedWorkers = null;

/**
 * OBSERVE an envelope. Ratchets the cache up; writes NOTHING into G, so it is
 * safe at any point of any load path and cannot race a residue hydrate.
 * Returns a small receipt for the suite and for diagnostics.
 */
export function notePropertyUnlocks(res) {
  const tier = pickPropertyTier(res);
  const workers = pickWorkerRung(res);
  let raised = false;
  if (tier !== null && (observedTier === null || tier > observedTier)) {
    observedTier = tier; raised = true;
  }
  if (workers !== null && (observedWorkers === null || workers > observedWorkers)) {
    observedWorkers = workers; raised = true;
  }
  return {
    mode: (tier === null && workers === null) ? 'absent' : 'server',
    tier: observedTier, workers: observedWorkers, raised,
  };
}

/** The highest property rung this session has seen the server state, or null. */
export function serverPropertyTier() { return observedTier; }
/** The highest paid crew cap this session has seen the server state, or null. */
export function serverWorkerRung() { return observedWorkers; }

/** The residue's own tier, floored to a usable integer. 0 when absent/garbage —
 *  never negative, never NaN, so it is always a safe floor for the max below. */
export function residuePropertyTier(G) {
  const h = G && G.homestead;
  if (!h || typeof h !== 'object') return 0;
  const n = Number(h.tier);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** THE ANSWER: max(server rung, residue). Never demotes, never invents. */
export function effectivePropertyTier(G) {
  const residue = residuePropertyTier(G);
  return (observedTier !== null && observedTier > residue) ? observedTier : residue;
}

/**
 * THE HEAL. Raise `G.homestead.tier` to the server's rung when the rung is
 * higher. O(1) — two integer compares — because the read path calls it on every
 * getTier(), i.e. inside render loops.
 *
 * Writing it into G rather than only deriving it is what makes the heal
 * PERSIST: `homestead` is a residue field, so the raised value rides the next
 * buildResiduePatch upload and the player is fixed for good, not just for the
 * current session. It is also what keeps the ~15 existing `G.homestead.tier`
 * read paths (save/load, the smoke suite, anything that has not been routed
 * through getTier) telling the same story as the UI.
 *
 * NEVER LOWERS. NEVER CREATES a tier out of nothing: with no observed rung this
 * is a pure no-op and `ensureState()` keeps its grandfathering job.
 */
export function healPropertyTier(G) {
  if (!G || typeof G !== 'object') return { mode: 'no-state', tier: null, healed: false };
  const residue = residuePropertyTier(G);
  const eff = effectivePropertyTier(G);
  if (eff <= residue) {
    return { mode: observedTier === null ? 'unknown' : 'ok', tier: residue, healed: false };
  }
  if (!G.homestead || typeof G.homestead !== 'object') G.homestead = {};
  G.homestead.tier = eff;
  return { mode: 'ok', tier: eff, healed: true, from: residue };
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
  const prev = { tier: observedTier, workers: observedWorkers };
  observedTier = (typeof tier === 'number' && Number.isFinite(tier)) ? Math.floor(tier) : null;
  observedWorkers = (typeof workers === 'number' && Number.isFinite(workers)) ? Math.floor(workers) : null;
  return prev;
}

if (typeof window !== 'undefined') {
  window.HearthriseProperty = {
    pickPropertyTier, pickWorkerRung, notePropertyUnlocks,
    serverPropertyTier, serverWorkerRung,
    residuePropertyTier, effectivePropertyTier, healPropertyTier,
    effectiveWorkerSlots, __resetPropertyRecord,
  };
}
