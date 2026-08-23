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
// That is correct, and under the arm it produced a live, founder-reported defect:
//
//     "my woodcutting exp is bouncing from lvl 5 to lvl 1 over and over again"
//
// The cycle, measured (tests/predict-display.mjs reproduces it):
//     envelope lands  → applyRecord stamps G.skills   → display Lv 5
//     a gather tick   → grantXp writes G.skills[wc]   → fingerprint MISMATCH
//                     → recordValue known:false       → skillLevelOf → null
//                     → legacy getLevel() floors to 1 → display Lv 1
//     next settle     → re-stamp                      → Lv 5 … repeat
//
// The naive cures are both wrong:
//   · DISARM — hands the record back to the client. Not an option.
//   · LET THE CLIENT WRITE G.skills AND RE-STAMP — that is the client authoring
//     the record wearing the server's fingerprint, i.e. exactly the b347 defect.
//
// ── THE MODEL ───────────────────────────────────────────────────────────────
// A record-stamped field holds the SERVER'S NUMBER AND NOTHING ELSE, at every
// instant. Client optimism lives HERE instead, in a `_`-prefixed scratch bag
// that never syncs and is never authority:
//
//     G._pred = { xp: { woodcutting: 40 }, gold: 12, gems: 0, at, seq }
//
//   WRITE  a gated site that used to mutate a stamped field calls predictXp /
//          predictBalance instead. G.skills / G.gold do not move, so the
//          fingerprint stays VALID and `recordValue` stays `known:true`.
//   READ   the DISPLAY accessors (skill-record.js skillXpForDisplay,
//          balance.js balanceForDisplay) answer `server truth + prediction`.
//          The AUTHORITY accessors (skillXpOf, balanceOf, canAfford) are
//          untouched and still answer pure server truth.
//   CLEAR  every envelope that stamps a field clears that field's prediction —
//          the server's new number already contains those actions. Same
//          reconcile shape as gold.js's `reconcilePredictions`, and wired at the
//          same seam (record.js applyRecord).
//
// ── WHY WHOLESALE CLEAR RATHER THAN gold.js's PER-CALL LEDGER ───────────────
// gold.js models a prediction per INTENT KEY because a gold verb can be refused,
// replayed, or answered out of order — a prediction there has a lifecycle and an
// orphan is a permanent additive offset (its F1 finding).
//
// An XP tick has none of that. There is no call to refuse: the client does not
// send "I chopped a log", it declares an ACTIVITY and the server settles the
// whole window on its own clock. So a prediction here is only ever "what I have
// shown the player since the last settle", and the settle is an absolute
// statement that already includes it. Wholesale clear is therefore both correct
// and the only shape that cannot orphan.
//
// THE RESIDUAL, STATED: a tick that lands in the microseconds between the
// server computing an envelope and the client applying it is cleared without
// having been paid, so the display dips by one tick's worth and the next tick
// re-predicts it. Bounded by one tick, self-correcting, display-only, and it
// cannot cost the player anything real — the server's number is unaffected.
//
// ── AND THE BELT TO THAT BRACE ──────────────────────────────────────────────
// The display accessors do NOT depend on every writer having been found. If some
// site this sweep missed still writes a stamped field, `recordValue` reports
// `client-overwrote` and the display path falls back to the LOCAL optimistic
// number (and then to the last value the server actually stated) rather than to
// UNKNOWN. So a missed writer costs display FRESHNESS, never a bounce to level 1.
// That fallback is what makes the defect above structurally impossible rather
// than merely fixed.
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
 *  nothing to clear it. */
export const PREDICTED_BALANCE_FIELDS = Object.freeze(['gold', 'gems']);

/** Bounded on purpose (the gold.js MAX_PENDING lesson): a bag that can grow
 *  without limit is a leak with a renderer attached. SKILLS_DEF holds ~15 ids
 *  and the game grows by adding data, so 128 is far past any real content scale
 *  and only reachable by a bug feeding garbage ids. The oldest key is dropped
 *  LOUDLY rather than silently, because a silent drop here is a display that
 *  stops moving for one skill and nothing says why. */
export const MAX_PREDICTED_SKILLS = 128;

/** Which prediction bucket does a RECORD field name clear?
 *  Data, not a switch statement, so arming a new field is a row. A record field
 *  absent from this map has no prediction bucket and clears nothing. */
export const CLEARS = Object.freeze({
  skills: 'xp',
  gold: 'gold',
  gems: 'gems',
});

function freshBag() {
  return { xp: {}, gold: 0, gems: 0, at: 0, seq: 0 };
}

/** The bag, created on demand. Returns null for a non-object G (a boot before
 *  legacy.js published it) rather than throwing — every caller here is on a
 *  hot path and none of them may take the game down. */
export function predictionBag(G, create) {
  if (!G || typeof G !== 'object') return null;
  const have = G[PRED_KEY];
  if (have && typeof have === 'object' && !Array.isArray(have)) {
    /* Defensive re-shape: a bag that survived a reload with a missing/garbage
       `xp` map would throw on the first write. Cheap, and it runs once. */
    if (!have.xp || typeof have.xp !== 'object' || Array.isArray(have.xp)) have.xp = {};
    if (!Number.isFinite(Number(have.gold))) have.gold = 0;
    if (!Number.isFinite(Number(have.gems))) have.gems = 0;
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

/* ══════════════════════════════════════════════════════════════════════════
   SKILL XP
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * PREDICT an xp gain the client has just shown the player but has NOT written
 * to the record. Additive; call once per grant.
 *
 * @returns the running predicted delta for that skill (never NaN).
 */
export function predictXp(G, skillId, delta) {
  const id = String(skillId == null ? '' : skillId);
  if (!id) return 0;
  const d = deltaOf(delta, 'xp delta');
  if (!d) return predictedXp(G, id);
  const bag = predictionBag(G, true);
  if (!bag) return 0;
  if (!Object.prototype.hasOwnProperty.call(bag.xp, id)
      && Object.keys(bag.xp).length >= MAX_PREDICTED_SKILLS) {
    const oldest = Object.keys(bag.xp)[0];
    try {
      console.warn('[predict] xp prediction bag full (' + MAX_PREDICTED_SKILLS + ') — dropping "'
        + oldest + '". The next envelope is absolute, so this costs display accuracy for a '
        + 'moment and nothing else. A bag this size means something is feeding garbage skill ids.');
    } catch (e) {}
    delete bag.xp[oldest];
  }
  bag.xp[id] = (Number(bag.xp[id]) || 0) + d;
  bag.at = Date.now();
  bag.seq++;
  return bag.xp[id];
}

/** The predicted delta for one skill. 0 when there is none — a prediction is a
 *  DELTA, so 0 is the honest identity here, unlike a balance where 0 is a claim. */
export function predictedXp(G, skillId) {
  const bag = predictionBag(G, false);
  if (!bag) return 0;
  const n = Number(bag.xp[String(skillId == null ? '' : skillId)]);
  return Number.isFinite(n) ? n : 0;
}

/** The whole predicted map — for a diagnostic, and for the total-level rollups
 *  that have to add prediction across every skill at once. */
export function predictedXpMap(G) {
  const bag = predictionBag(G, false);
  if (!bag) return {};
  const out = {};
  for (const k in bag.xp) {
    if (!Object.prototype.hasOwnProperty.call(bag.xp, k)) continue;
    const n = Number(bag.xp[k]);
    if (Number.isFinite(n) && n !== 0) out[k] = n;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   BALANCES (gold / gems)
   ══════════════════════════════════════════════════════════════════════════ */

/** PREDICT a balance movement. Signed — a spend is negative. */
export function predictBalance(G, field, delta) {
  const f = String(field == null ? '' : field);
  if (PREDICTED_BALANCE_FIELDS.indexOf(f) === -1) return 0;
  const d = deltaOf(delta, f + ' delta');
  if (!d) return predictedBalance(G, f);
  const bag = predictionBag(G, true);
  if (!bag) return 0;
  bag[f] = (Number(bag[f]) || 0) + d;
  bag.at = Date.now();
  bag.seq++;
  return bag[f];
}

export function predictedBalance(G, field) {
  const f = String(field == null ? '' : field);
  if (PREDICTED_BALANCE_FIELDS.indexOf(f) === -1) return 0;
  const bag = predictionBag(G, false);
  if (!bag) return 0;
  const n = Number(bag[f]);
  return Number.isFinite(n) ? n : 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE RECONCILE — the only thing that removes a prediction
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * CLEAR the predictions belonging to the record fields an envelope just stamped.
 *
 * @param fields  the record field names applyRecord actually WROTE. Only those:
 *                an envelope that supplied no `skills` (a lean accrue answer)
 *                must not clear the xp a live tick has predicted since, or the
 *                display would drop progress the server has not yet stated.
 * @returns {{cleared:[], xp:number, gold:number, gems:number}} what was dropped,
 *          for the diagnostic — never for arithmetic.
 */
export function clearPredictionsFor(G, fields) {
  const out = { cleared: [], xp: 0, gold: 0, gems: 0 };
  const bag = predictionBag(G, false);
  if (!bag || !Array.isArray(fields)) return out;
  for (const f of fields) {
    const bucket = CLEARS[f];
    if (!bucket) continue;
    if (bucket === 'xp') {
      let n = 0;
      for (const k in bag.xp) {
        if (Object.prototype.hasOwnProperty.call(bag.xp, k)) n += Number(bag.xp[k]) || 0;
      }
      if (Object.keys(bag.xp).length) { bag.xp = {}; out.xp = n; out.cleared.push(f); }
    } else {
      if (bag[bucket]) { out[bucket] = Number(bag[bucket]) || 0; bag[bucket] = 0; out.cleared.push(f); }
    }
  }
  if (out.cleared.length) bag.at = Date.now();
  return out;
}

/** Drop EVERYTHING. One caller class: authority changing hands — a slot switch,
 *  a sign-out, `forgetServerOfRecord`. A prediction that outlives the character
 *  it was made about would be shown against a different one. */
export function resetPredictions(G) {
  if (!G || typeof G !== 'object') return null;
  G[PRED_KEY] = freshBag();
  return G[PRED_KEY];
}

/** Is anything predicted at all? Cheap — used by the display path to take the
 *  byte-for-byte-unchanged branch when there is nothing to add. */
export function hasPredictions(G) {
  const bag = predictionBag(G, false);
  if (!bag) return false;
  if (bag.gold || bag.gems) return true;
  for (const k in bag.xp) {
    if (Object.prototype.hasOwnProperty.call(bag.xp, k) && Number(bag.xp[k])) return true;
  }
  return false;
}

/** One line for a bug report / the diagnostics panel. Never player-facing. */
export function predictionState(G) {
  const bag = predictionBag(G, false);
  if (!bag) return { active: false };
  return {
    active: hasPredictions(G),
    xp: predictedXpMap(G),
    gold: Number(bag.gold) || 0,
    gems: Number(bag.gems) || 0,
    at: bag.at || 0,
    seq: bag.seq || 0,
  };
}

if (typeof window !== 'undefined') {
  window.HearthrisePredict = {
    PRED_KEY, PREDICTED_BALANCE_FIELDS, MAX_PREDICTED_SKILLS, CLEARS,
    predictionBag, predictXp, predictedXp, predictedXpMap,
    predictBalance, predictedBalance,
    clearPredictionsFor, resetPredictions, hasPredictions, predictionState,
  };
}
