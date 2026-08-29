// ============================================================================
// src/net/predict.js — THE DISPLAY-PREDICTION SCRATCH LAYER (b455).
//
// ── THE PROBLEM THIS EXISTS TO SOLVE ────────────────────────────────────────
// b454 armed the whole record: `skills`, `gold`, `gems`, `equipment`, `rooms`,
// `marks`, `rested*` are SERVER-OF-RECORD. record.js's b347 fingerprint makes
// that checkable — `_record.stamp[field]` holds a fingerprint of exactly what
// applyRecord wrote, and `recordValue` answers `known:false` the moment anything
// else moves the field.
//
// That is correct, and under the arm it produced two live, founder-reported
// defects that are the same defect seen from two sides:
//
//   1. THE COLLAPSE — "my woodcutting exp is bouncing from lvl 5 to lvl 1 over
//      and over again". A gather tick wrote G.skills, the fingerprint tripped,
//      `recordValue` said UNKNOWN, and legacy `getLevel()` floored to 1 until the
//      next settle put it back.
//
//   2. THE REWIND — measured in a live 12-second window mid-fight:
//          start {kills:3756, gold:501, atkXp:5}   ← the kill landed instantly
//          +12s  {kills:3755, gold:500, atkXp:1}   ← the settle took it away
//      The server settles a LAGGING window. Its envelope is authoritative about
//      everything up to `accrued_to` and says NOTHING about the seconds since —
//      so applying it and clearing the client's optimism wholesale rewinds
//      progress the player has already watched happen.
//
// The naive cures are both wrong:
//   · DISARM — hands the record back to the client. Not an option.
//   · LET THE CLIENT WRITE AND RE-STAMP — that is the client authoring the
//     record wearing the server's fingerprint, i.e. exactly the b347 defect.
//
// ── THE MODEL ───────────────────────────────────────────────────────────────
// A record-stamped field holds the SERVER'S NUMBER AND NOTHING ELSE, at every
// instant. Client optimism lives HERE instead, in a `_`-prefixed scratch bag
// that never syncs and is never authority:
//
//     G._pred = { xp: { woodcutting: {total, q} }, gold: {total, q}, … }
//
//   WRITE  a gated site that used to mutate a stamped field calls predictXp /
//          predictBalance instead. G.skills / G.gold do not move, so the
//          fingerprint stays VALID and `recordValue` stays `known:true`.
//   READ   the DISPLAY accessors (skill-record.js skillXpForDisplay,
//          balance.js balanceForDisplay) answer `server truth + prediction`.
//          The AUTHORITY accessors (skillXpOf, balanceOf, canAfford) are
//          untouched and still answer pure server truth.
//   RETIRE ⚠ ONLY WHAT THE SERVER'S NUMBER HAS ACTUALLY INCORPORATED.
//
// ── THE COVERAGE RULE, AND WHY IT IS NOT A CLOCK COMPARISON ─────────────────
// This is the whole of the rewind fix and it is the one thing in this file that
// must not be simplified.
//
// Every prediction carries the instant it was MADE. Every envelope states the
// instant the server has settled UP TO (`state.accrued_to`) and the instant it
// was BUILT (`now`). A prediction is RETIRED only if the envelope's number
// already contains it — i.e. only if it was made at or before the coverage
// boundary. Anything newer SURVIVES and is still displayed on top.
//
// The boundary is computed from a DURATION, never from a comparison of the two
// machines' clocks:
//
//     lag            = serverNow - accruedTo     (server-side subtraction)
//     coveredUntil   = envelopeArrivedAt - lag   (client-side subtraction)
//
// Both operands of each subtraction come from the SAME clock, so the result is
// immune to skew between them. A naive `prediction.at <= Date.parse(accrued_to)`
// would be a cross-clock comparison, and a device five minutes fast would retire
// everything (permanent rewind) while a slow one would retire nothing
// (permanent inflation). This program has paid for that class of bug before.
//
// THE PROPERTY THAT FALLS OUT, and it is what the player feels:
//
//     display_before = S₀ + Σ(all predictions)
//     display_after  = S₁ + Σ(surviving)   where S₁ = S₀ + Σ(covered)
//                    = S₀ + Σ(covered) + Σ(uncovered)
//                    = display_before
//
// The settle is INVISIBLE. Not "a small snap" — continuous, exactly, as long as
// the client and the server compute the same rates (AWAY-1 parity asserts they
// do). Only genuinely rng-divergent things (a drop that rolled differently) can
// move the number, and those are bounded by one window.
//
// ── THE BOUNDS (nothing here may grow without limit) ────────────────────────
//   · MAX_PREDICTION_AGE_MS  a prediction older than this is retired by the next
//     envelope whatever the coverage says. This is the belt to the coverage
//     rule's brace: an envelope with an unreadable watermark cannot be allowed to
//     leave optimism standing forever, or a broken server field becomes a
//     permanently inflated display.
//   · COALESCE_MS  consecutive predictions for the same key inside this window
//     fold into one entry, so a 600 ms combat swing does not build a 150-entry
//     queue per settle window.
//   · MAX_ENTRIES / MAX_PREDICTED_SKILLS  hard caps, dropped from the OLDEST end
//     (which is also the end the coverage rule would have retired first).
//   · Every bucket keeps a RUNNING TOTAL, so a display read is O(1). `getLevel`
//     is on the combat render path; a read that summed a queue would be a
//     per-frame cost that grows with session length.
//
// ── AND THE BELT TO ALL OF IT ───────────────────────────────────────────────
// The display accessors do NOT depend on every writer having been found. If some
// site this sweep missed still writes a stamped field, `recordValue` reports
// `client-overwrote` and the display path falls back to the LOCAL optimistic
// number (and then to the last value the server actually stated) rather than to
// UNKNOWN. So a missed writer costs display FRESHNESS, never a bounce to level 1.
//
// PURE. No DOM, no timers, no imports. Node-importable. Never authority.
// ============================================================================

/** The scratch bag's key on G. `_`-prefixed, which is what keeps it out of
 *  `snapshot()` (save-invariant #3 excludes `_`-prefixed scratch) and out of the
 *  capstone residue patch (src/net/capstone.js RESIDUE_FIELDS is an allowlist).
 *  A prediction that reached the cloud would be the client authoring a record. */
export const PRED_KEY = '_pred';

/** Scalar record fields this module may predict. Both have an ABSOLUTE
 *  counterpart in every envelope, which is what makes a prediction retirable.
 *  A field with no absolute statement must not be predicted — there would be
 *  nothing to retire it. */
export const PREDICTED_BALANCE_FIELDS = Object.freeze(['gold', 'gems']);

/** Consecutive predictions for one key inside this window fold into one entry.
 *  A combat swing is ~600 ms and a settle window is ~90 s, so without this a
 *  single fight would build ~150 entries per skill. One second of granularity is
 *  far finer than the coverage boundary's own precision. */
export const COALESCE_MS = 1000;

/** The absolute age bound. A prediction older than this is retired by the next
 *  envelope REGARDLESS of what its watermark says — the belt to the coverage
 *  brace. Generous (fifteen minutes is ten settle windows) so it never fires in
 *  normal play, and finite so a server that stops stating `accrued_to` degrades
 *  to a stale display rather than to an unboundedly inflated one. */
export const MAX_PREDICTION_AGE_MS = 15 * 60 * 1000;

/** Hard caps. Reached only by a bug feeding garbage, and the drop is from the
 *  OLDEST end — the same end the coverage rule retires first, so the cost is the
 *  same "display accuracy for a moment" the retire path already has. */
export const MAX_PREDICTED_SKILLS = 128;
export const MAX_ENTRIES = 256;

/** Which prediction bucket does a RECORD field name retire?
 *  Data, not a switch statement, so arming a new field is a row. A record field
 *  absent from this map has no prediction bucket and retires nothing. */
export const CLEARS = Object.freeze({
  skills: 'xp',
  gold: 'gold',
  gems: 'gems',
});

function newBucket() { return { total: 0, q: [] }; }
function isBucket(b) { return !!(b && typeof b === 'object' && Array.isArray(b.q)); }

function freshBag() {
  return { xp: {}, gold: newBucket(), gems: newBucket(), at: 0, seq: 0, overflowed: false };
}

/** The bag, created on demand. Returns null for a non-object G (a boot before
 *  legacy.js published it) rather than throwing — every caller here is on a
 *  hot path and none of them may take the game down. */
export function predictionBag(G, create) {
  if (!G || typeof G !== 'object') return null;
  const have = G[PRED_KEY];
  if (have && typeof have === 'object' && !Array.isArray(have)) {
    /* Defensive re-shape. Cheap, runs once, and it means a bag that somehow
       survived from an older shape cannot throw on the first write. */
    if (!have.xp || typeof have.xp !== 'object' || Array.isArray(have.xp)) have.xp = {};
    for (const f of PREDICTED_BALANCE_FIELDS) if (!isBucket(have[f])) have[f] = newBucket();
    return have;
  }
  if (!create) return null;
  const bag = freshBag();
  G[PRED_KEY] = bag;
  return bag;
}

/** A finite delta, or 0. Straight from gold.js's `amountOf` and for the same
 *  measured reason (its F8): `Number(x) || 0` maps NaN to 0 but lets Infinity
 *  through, and one Infinity in a prediction poisons every later sum into NaN —
 *  after which the display reads "NaN" and every comparison answers false. */
function deltaOf(v, what) {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    try {
      console.warn('[predict] refusing a non-finite ' + what + ' (' + String(v) + '). A prediction '
        + 'that accepts Infinity or NaN turns every later display into NaN.');
    } catch (e) {}
    return 0;
  }
  return n;
}

/** Append (or coalesce into) one bucket. The queue stays ASCENDING in `at`,
 *  which is what lets the retire pass stop at the first uncovered entry. */
function push(bucket, delta, at0) {
  const tail = bucket.q.length ? bucket.q[bucket.q.length - 1] : null;
  /* ⚠ THE QUEUE IS ASCENDING IN `at`, AND THAT IS AN INVARIANT, NOT AN OBSERVATION.
     `retireBucket` scans from the head and STOPS at the first uncovered entry —
     which is only correct if nothing behind it is older. Real callers always pass
     `Date.now()` so it holds naturally; a backwards clock step (NTP, a laptop
     waking) would otherwise silently strand an entry behind the scan forever.
     Clamped rather than rejected: the entry is real progress and must be shown. */
  const at = (tail && at0 < tail.at) ? tail.at : at0;
  if (tail && (at - tail.at) < COALESCE_MS) { tail.d += delta; }
  else {
    bucket.q.push({ at, d: delta });
    if (bucket.q.length > MAX_ENTRIES) {
      /* Drop the OLDEST — the entry the next coverage boundary would have
         retired first — and fold its value away with it, so `total` and `q`
         cannot disagree. */
      const gone = bucket.q.shift();
      bucket.total -= gone.d;
    }
  }
  bucket.total += delta;
  return bucket.total;
}

/* ══════════════════════════════════════════════════════════════════════════
   SKILL XP
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * PREDICT an xp gain the client has just shown the player but has NOT written
 * to the record. Additive; call once per grant.
 *
 * @param at optional client timestamp (ms). Defaults to now. Exposed so a test
 *           can drive the coverage rule without sleeping.
 * @returns the running predicted delta for that skill (never NaN).
 */
export function predictXp(G, skillId, delta, at, opts) {
  const id = String(skillId == null ? '' : skillId);
  if (!id) return 0;
  const d = deltaOf(delta, 'xp delta');
  if (!d) return predictedXp(G, id);
  const bag = predictionBag(G, true);
  if (!bag) return 0;
  const t = Number.isFinite(Number(at)) ? Number(at) : Date.now();
  if (!isBucket(bag.xp[id])) {
    if (Object.keys(bag.xp).length >= MAX_PREDICTED_SKILLS) {
      const oldest = Object.keys(bag.xp)[0];
      /* ONCE PER BAG. The condition that reaches this line (garbage ids) reaches
         it on EVERY subsequent grant, so an unthrottled warn is a console flood
         that buries the one line a reader needed. */
      if (!bag.overflowed) {
        bag.overflowed = true;
        try {
          console.warn('[predict] xp prediction bag full (' + MAX_PREDICTED_SKILLS + ') — dropping "'
            + oldest + '" and any further overflow, silently, this session. The next envelope is '
            + 'absolute, so this costs display accuracy for a moment and nothing else. A bag this '
            + 'size means something is feeding garbage skill ids.');
        } catch (e) {}
      }
      delete bag.xp[oldest];
    }
    bag.xp[id] = newBucket();
  }
  /* ⚠ THE SETTLEMENT TAG (b492) — WHICH RULE RETIRES THIS BUCKET.
     A bucket is STICKY once tagged: a skill is settled one way or the other for
     the whole session, and a single untagged grant must not silently hand a
     credit-settled skill back to the coverage rule (that is the bug this tag
     exists to close, and it would come back as an intermittent). See
     `reconcileCreditedXp` for the whole argument. */
  if (opts && opts.credited) bag.xp[id].credit = true;
  const total = push(bag.xp[id], d, t);
  bag.at = t;
  bag.seq++;
  return total;
}

/** The predicted delta for one skill. O(1). 0 when there is none — a prediction
 *  is a DELTA, so 0 is the honest identity here, unlike a balance where 0 is a
 *  claim. */
export function predictedXp(G, skillId) {
  const bag = predictionBag(G, false);
  if (!bag) return 0;
  const b = bag.xp[String(skillId == null ? '' : skillId)];
  if (!isBucket(b)) return 0;
  return Number.isFinite(b.total) ? b.total : 0;
}

/** The whole predicted map — for the rollups (total level, combat level) that
 *  need every skill at once, and for the diagnostic. */
export function predictedXpMap(G) {
  const bag = predictionBag(G, false);
  if (!bag) return {};
  const out = {};
  for (const k in bag.xp) {
    if (!Object.prototype.hasOwnProperty.call(bag.xp, k)) continue;
    const b = bag.xp[k];
    if (isBucket(b) && Number.isFinite(b.total) && b.total !== 0) out[k] = b.total;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   BALANCES (gold / gems)
   ══════════════════════════════════════════════════════════════════════════ */

/** PREDICT a balance movement. Signed — a spend is negative. */
export function predictBalance(G, field, delta, at) {
  const f = String(field == null ? '' : field);
  if (PREDICTED_BALANCE_FIELDS.indexOf(f) === -1) return 0;
  const d = deltaOf(delta, f + ' delta');
  if (!d) return predictedBalance(G, f);
  const bag = predictionBag(G, true);
  if (!bag) return 0;
  const t = Number.isFinite(Number(at)) ? Number(at) : Date.now();
  const total = push(bag[f], d, t);
  bag.at = t;
  bag.seq++;
  return total;
}

export function predictedBalance(G, field) {
  const f = String(field == null ? '' : field);
  if (PREDICTED_BALANCE_FIELDS.indexOf(f) === -1) return 0;
  const bag = predictionBag(G, false);
  if (!bag || !isBucket(bag[f])) return 0;
  return Number.isFinite(bag[f].total) ? bag[f].total : 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE COVERAGE BOUNDARY
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHERE DOES THIS ENVELOPE'S KNOWLEDGE STOP, IN THIS CLIENT'S CLOCK?
 *
 * PURE, and deliberately separate from the retire pass so the arithmetic that
 * decides whether a player's progress survives can be unit-tested on its own.
 *
 * @param res      the server envelope ({now, state:{accrued_to}})
 * @param arriveMs the client instant it was applied (defaults to now)
 * @returns {{at:number, lagMs:number, source:string}}
 *
 * ⚠ IT NEVER COMPARES THE TWO CLOCKS. `lag` is a server-minus-server duration;
 *   the boundary is a client-minus-duration instant. See the header.
 *
 * ⚠ AND IT FAILS TOWARD *KEEPING* THE PLAYER'S PROGRESS. If the envelope does
 *   not state a readable watermark we do not know what it covers, and the two
 *   ways to be wrong are not symmetric: retiring too much REWINDS visible
 *   progress (the reported defect, and it looks like theft), while retiring too
 *   little leaves the display briefly optimistic and self-corrects at the next
 *   good envelope. So an unreadable watermark retires only what is older than
 *   MAX_PREDICTION_AGE_MS, which is bounded and cannot be permanent.
 */
export function coverageBoundary(res, arriveMs) {
  const arrive = Number.isFinite(Number(arriveMs)) ? Number(arriveMs) : Date.now();
  const st = (res && typeof res === 'object' && res.state && typeof res.state === 'object')
    ? res.state : null;
  const serverNow = parseInstant(res && res.now);
  const accruedTo = parseInstant(st && st.accrued_to);
  if (serverNow === null || accruedTo === null) {
    return { at: arrive - MAX_PREDICTION_AGE_MS, lagMs: null, source: 'age-bound' };
  }
  /* Clamped at 0: an `accrued_to` in the server's own future is not a lag, and a
     negative one would push the boundary past NOW and retire predictions the
     envelope provably cannot describe. */
  const lagMs = Math.max(0, serverNow - accruedTo);
  return { at: arrive - lagMs, lagMs, source: 'watermark' };
}

function parseInstant(v) {
  if (v === null || typeof v === 'undefined') return null;
  const ms = typeof v === 'number' ? v : Date.parse(String(v));
  return (Number.isFinite(ms) && ms > 0) ? ms : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE RETIRE — the only thing that removes a prediction
   ══════════════════════════════════════════════════════════════════════════ */

/** Drain EXACTLY `amount` from a bucket, OLDEST FIRST, splitting the head entry
 *  when it is larger than what is left to take. Keeps `total` and `q` in step —
 *  they are two views of one fact and a drift between them is a permanently
 *  wrong display. Returns what it actually took (≤ amount, ≤ bucket.total). */
function consumeBucket(bucket, amount) {
  let left = Number(amount) || 0;
  let took = 0;
  while (left > 0 && bucket.q.length) {
    const head = bucket.q[0];
    const d = Number(head.d) || 0;
    /* A non-positive entry can never satisfy `left`, so consuming it without
       decrementing `left` is what stops it stranding the scan forever. */
    if (d <= 0) { bucket.q.shift(); bucket.total -= d; continue; }
    if (d <= left) { bucket.q.shift(); bucket.total -= d; left -= d; took += d; }
    else { head.d = d - left; bucket.total -= left; took += left; left = 0; }
  }
  if (!bucket.q.length) bucket.total = 0;   // float hygiene, as retireBucket
  return took;
}

/**
 * RETIRE CREDIT-SETTLED XP BY THE AMOUNT THE RECORD JUST ADVANCED (b492).
 *
 * ── THE BUG THIS EXISTS TO KILL, stated exactly (live, b491, QA slot 0) ──────
 * The coverage rule below is correct for xp the server ACCRUES: the settle moves
 * `accrued_to` and the boundary is derived from `accrued_to`, so
 * `S₁ = S₀ + Σ(retired)` holds and the settle is invisible.
 *
 * ATTENDED COMBAT XP IS NOT ACCRUED. `hr_credit_combat_xp` writes
 * `player_skills.xp` on the client's own ~60 s flush cadence and DOES NOT move
 * `accrued_to` (it moves a separate `combat_xp_accrued_to`), and the combat
 * settle then deliberately pays ZERO xp for the credited window. So the record
 * advances on the CREDIT clock while the retire fires on the ACCRUAL clock, and
 * the two disagree by one settle-lag (60–90 s of fighting):
 *
 *     record 349 → 376 (a credit of 27 landed)   prediction bucket still 27
 *     display = 376 + 27 = 403                   ← the player's number, 26 too high
 *     next envelope, fresh accrued_to → the 27 finally retires
 *     display = 377                              ← −26, "my combat XP vanished"
 *
 * Measured live and reproduced byte-for-byte from `player_ledger` (defense
 * 348 → 375 → 403 → 377). NOTHING was lost server-side: 377 was always the
 * truth. The DISPLAY double-counted the credit and then corrected, and a
 * correction that big reads as theft.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * Retire what the server's number PROVABLY CONTAINS — measured as an AMOUNT,
 * not as an instant: when an envelope moves the record for skill k from `prev`
 * to `next`, retire exactly `next − prev` from k's bucket, oldest first.
 *
 *     display_before = R₀ + P
 *     display_after  = R₁ + (P − (R₁ − R₀)) = R₀ + P
 *
 * Identical, for ANY cadence and with NO clock in the arithmetic at all — which
 * is strictly stronger than the coverage rule it replaces for these buckets.
 *
 * FAIL-SAFE IN BOTH DIRECTIONS. Clamped at the bucket total, so an envelope that
 * jumps further than was predicted (the server's own away accrual) drains the
 * bucket and no more. Clamped at 0, so a DOWNWARD correction retires nothing and
 * the display follows the server down by the full disagreement — the server
 * still wins every contest, which is the anti-forgery property.
 *
 * @param prevSkills the last map the SERVER stated (record.js `recordLastKnown`),
 *                   NEVER `G.skills` — a client-side write (e.g. accrue.js's
 *                   pending fold-back) must not be able to move this diff.
 * @param nextSkills the map this envelope states.
 */
export function reconcileCreditedXp(G, prevSkills, nextSkills) {
  const out = { retired: 0, skills: {} };
  const bag = predictionBag(G, false);
  if (!bag) return out;
  const next = (nextSkills && typeof nextSkills === 'object' && !Array.isArray(nextSkills)) ? nextSkills : null;
  const prev = (prevSkills && typeof prevSkills === 'object' && !Array.isArray(prevSkills)) ? prevSkills : null;
  /* NO PREVIOUS STATEMENT = NO MEASURABLE ADVANCE. The first envelope of a
     session has nothing to diff against, so it retires nothing and the display
     is optimistic for exactly one settle. That is the safe direction (the other
     one deletes progress the player watched happen). */
  if (!next || !prev) return out;
  for (const k in bag.xp) {
    if (!Object.prototype.hasOwnProperty.call(bag.xp, k)) continue;
    const b = bag.xp[k];
    if (!isBucket(b) || !b.credit) continue;
    const n = Number(next[k]);
    const p = Number(prev[k]);
    if (!Number.isFinite(n) || !Number.isFinite(p)) continue;   // the envelope said nothing
    const advance = n - p;
    if (!(advance > 0)) continue;
    const took = consumeBucket(b, advance);
    if (took > 0) { out.retired += took; out.skills[k] = took; }
    if (!b.q.length) delete bag.xp[k];     // an empty bucket is a leak with a name
  }
  return out;
}

function retireBucket(bucket, coveredUntil, ageFloor) {
  let removed = 0;
  while (bucket.q.length) {
    const head = bucket.q[0];
    if (head.at > coveredUntil && head.at > ageFloor) break;   // ascending — the rest is newer
    bucket.q.shift();
    bucket.total -= head.d;
    removed += head.d;
  }
  /* Float hygiene: a queue drained to empty must have a total of exactly 0, not
     an accumulated 1e-13 that renders as a stray xp point forever. */
  if (!bucket.q.length) bucket.total = 0;
  return removed;
}

/**
 * RETIRE the predictions this envelope has ALREADY INCORPORATED, and only those.
 *
 * @param fields       the record field names applyRecord actually WROTE. Only
 *                     those: an envelope that supplied no `skills` (a lean accrue
 *                     answer) must not retire xp — it has stated nothing about it.
 * @param coveredUntil the boundary from `coverageBoundary`, in CLIENT ms.
 * @param nowMs        the client instant (for the absolute age bound).
 * @returns a report — for the diagnostic, never for arithmetic.
 */
export function retirePredictions(G, fields, coveredUntil, nowMs) {
  const out = { retired: [], xp: 0, gold: 0, gems: 0, kept: 0 };
  const bag = predictionBag(G, false);
  if (!bag || !Array.isArray(fields)) return out;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const boundary = Number.isFinite(Number(coveredUntil)) ? Number(coveredUntil) : now;
  const ageFloor = now - MAX_PREDICTION_AGE_MS;
  for (const f of fields) {
    const bucket = CLEARS[f];
    if (!bucket) continue;
    if (bucket === 'xp') {
      let n = 0;
      for (const k in bag.xp) {
        if (!Object.prototype.hasOwnProperty.call(bag.xp, k)) continue;
        if (!isBucket(bag.xp[k])) { delete bag.xp[k]; continue; }
        /* ⚠ A CREDIT-SETTLED BUCKET IS EXEMPT FROM THE COVERAGE RULE (b492).
           `accrued_to` says nothing about when a credit landed — see
           `reconcileCreditedXp`, which is what retires these, by amount. The
           ABSOLUTE age belt still applies (`-Infinity` leaves only the
           `head.at > ageFloor` half of the test standing), so a credit path that
           breaks entirely still degrades to a bounded stale display and never to
           an unboundedly inflated one. */
        const bound = bag.xp[k].credit ? -Infinity : boundary;
        n += retireBucket(bag.xp[k], bound, ageFloor);
        if (!bag.xp[k].q.length) delete bag.xp[k];   // an empty bucket is a leak with a name
      }
      if (n) { out.xp = n; out.retired.push(f); }
    } else if (isBucket(bag[bucket])) {
      const n = retireBucket(bag[bucket], boundary, ageFloor);
      if (n) { out[bucket] = n; out.retired.push(f); }
    }
  }
  out.kept = outstandingCount(bag);
  if (out.retired.length) bag.at = now;
  return out;
}

function outstandingCount(bag) {
  let n = 0;
  for (const k in bag.xp) if (isBucket(bag.xp[k])) n += bag.xp[k].q.length;
  for (const f of PREDICTED_BALANCE_FIELDS) if (isBucket(bag[f])) n += bag[f].q.length;
  return n;
}

/** Drop EVERYTHING. One caller class: authority changing hands — a slot switch,
 *  a sign-out, `forgetServerOfRecord`. A prediction that outlives the character
 *  it was made about would be shown against a different one. */
export function resetPredictions(G) {
  if (!G || typeof G !== 'object') return null;
  G[PRED_KEY] = freshBag();
  return G[PRED_KEY];
}

/** Is anything predicted at all? O(#skills). Used by the display path to take the
 *  byte-for-byte-unchanged branch when there is nothing to add. */
export function hasPredictions(G) {
  const bag = predictionBag(G, false);
  if (!bag) return false;
  for (const f of PREDICTED_BALANCE_FIELDS) if (isBucket(bag[f]) && bag[f].total) return true;
  for (const k in bag.xp) if (isBucket(bag.xp[k]) && bag.xp[k].total) return true;
  return false;
}

/** One line for a bug report / the diagnostics panel. Never player-facing. */
export function predictionState(G) {
  const bag = predictionBag(G, false);
  if (!bag) return { active: false };
  return {
    active: hasPredictions(G),
    xp: predictedXpMap(G),
    gold: predictedBalance(G, 'gold'),
    gems: predictedBalance(G, 'gems'),
    outstanding: outstandingCount(bag),
    at: bag.at || 0,
    seq: bag.seq || 0,
  };
}

if (typeof window !== 'undefined') {
  window.HearthrisePredict = {
    PRED_KEY, PREDICTED_BALANCE_FIELDS, MAX_PREDICTED_SKILLS, MAX_ENTRIES,
    MAX_PREDICTION_AGE_MS, COALESCE_MS, CLEARS,
    predictionBag, predictXp, predictedXp, predictedXpMap,
    predictBalance, predictedBalance,
    coverageBoundary, retirePredictions, reconcileCreditedXp,
    resetPredictions, hasPredictions, predictionState,
  };
}
