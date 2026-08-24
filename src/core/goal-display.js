// ════════════════════════════════════════════════════════════════════════
// src/core/goal-display.js — THE PREDICTED vs CONFIRMED DISPLAY SEAM.
// Designer Rulings R1 (monotonic predicted display + server-gated celebration)
// and R5 (the render half of the two-phase-commit claim).
//
// ── WHY IT IS A SIBLING OF goals.js, NOT A KEY INSIDE IT ─────────────────
// src/core/goals.js is the SERVER COUNTER CONTRACT: it is vendored verbatim
// into the hr-accrue Edge Function payload by tools/pack-edge.mjs (the edge
// imports utcDayKey / MAX_GOAL_ADD / GOAL_KEY_PREFIX from it), and the smoke
// suite's "Edge payload guard" asserts the deployed bytes equal the repo bytes.
// This module is a CLIENT-DISPLAY concern — it decides nothing the server
// computes — so putting it in goals.js would bloat the server payload and force
// an hr-accrue redeploy for a change the server never reads. It lives beside
// the counter contract it displays, imported only by the browser (src/main.js
// publishes it as window.HearthriseGoals), so the server payload stays
// byte-identical and this ships without a coordinated edge redeploy.
//
// ── WHY IT EXISTS ───────────────────────────────────────────────────────
// Under server-authority a goal/quest/cull-bounty counter is SERVER TRUTH, fed
// by a ~90 s span-sim that UNDERCOUNTS live actions. So the honest server number
// lags what the player just did: they kill 46, the server confirms 27, and a
// naive display reads "27 / 30 — keep going" beside a bar that just SHRANK from
// a predicted 30. Every historical variant of this ("46 kills but stuck at
// </30", "completed, 0 marks", a count that reverts) is the same wound — the
// display told the truth about the SERVER instead of the truth about the PLAYER,
// then celebrated or reverted on the server's schedule. This is the DISPLAY
// contract that makes the gap invisible and safe until the server-fidelity fix
// lands (a separate track). It is pure so the exact rule the strip, the modal
// and the bounty board obey is ONE testable expression, not three hand-rolled
// render branches that drift.
//
// ── THE RULE (R1) ───────────────────────────────────────────────────────
//   Keep two values per counter: `predicted` (local optimistic) and `confirmed`
//   (last server-settled). Render
//       shown = max(shownLastFrame, confirmed, min(predicted, goal))
//   — once a number is on screen it only ever CLIMBS. If the server reconciles
//   DOWN, `shown` HOLDS at its high-water and stops advancing until server truth
//   catches up; the player never sees a decrement.
//   · predicted >= goal, confirmed < goal → phase CONFIRMING (bar full,
//     goal/goal, "Confirming…"), NOT complete: no toast, no claim yet.
//   · confirmed >= goal                   → phase COMPLETE: claim + celebrate.
//
// ── THE RULE (R5, the render half) ──────────────────────────────────────
//   `canClaim` is TRUE only when confirmed >= goal. The claim path (the
//   two-phase commit in src/net/goal-claim.js's consumers) offers a claim only
//   then, and on a server 'incomplete' denial reverts to CONFIRMING showing REAL
//   server progress — but never below the shown high-water. That "never below
//   the high-water even after a denial" is exactly the same max() applied again,
//   so this one function serves the revert too.
//
// PURE. No DOM, no window, no clock. Runs in Node and in the browser.
// ════════════════════════════════════════════════════════════════════════

/** The three display phases a monotonic goal counter can be in. */
export const GOAL_PHASE = Object.freeze({
  PROGRESS: 'progress',      // shown < goal — still counting
  CONFIRMING: 'confirming',  // predicted hit goal, server hasn't confirmed — hold + "Confirming…"
  COMPLETE: 'complete',      // confirmed >= goal — claim + celebrate
});

/**
 * The monotonic display state for ONE counter.
 *
 * @param input.goal      the completion target (>0). A 0/absent goal yields
 *                        PROGRESS and never claims — a goal-less counter cannot
 *                        complete.
 * @param input.confirmed last server-settled value. Under a dormant/offline
 *                        client pass the caller feeds confirmed === predicted,
 *                        so the pre-server-authority behaviour is preserved
 *                        exactly (shown climbs to the local value, completes at
 *                        the local value).
 * @param input.predicted local optimistic value.
 * @param input.prevShown the value shown on the previous frame (the high-water
 *                        the caller persists per counter, per period, per
 *                        baseline — a re-baseline is a new counting epoch).
 * @returns { shown, phase, canClaim, confirmed, goal }
 *
 * INVARIANTS (asterisked in the tests):
 *   · shown >= prevShown ALWAYS (monotonic — never a decrement).
 *   · shown <= goal (a display never over-fills its bar).
 *   · canClaim ⟺ phase === COMPLETE ⟺ confirmed >= goal (> 0).
 *   · a confirmed drop after prevShown reached goal HOLDS at goal and drops the
 *     phase back to CONFIRMING (bar stays full, claim withdrawn) — R5's revert.
 */
export function goalDisplayState(input) {
  const i = input || {};
  const goal = Math.max(0, Math.floor(Number(i.goal) || 0));
  const confirmed = Math.max(0, Math.floor(Number(i.confirmed) || 0));
  const predicted = Math.max(0, Math.floor(Number(i.predicted) || 0));
  const prevShown = Math.max(0, Math.floor(Number(i.prevShown) || 0));

  // Predicted is optimistic but may never over-fill the bar; confirmed can
  // stand on its own (a server that has counted MORE than we predicted, e.g.
  // an away night, legitimately advances the bar past our local guess).
  const predictedCapped = goal > 0 ? Math.min(predicted, goal) : predicted;

  // Monotonic high-water. Clamp the display to the goal so a bar is never > 100%.
  let shown = Math.max(prevShown, confirmed, predictedCapped);
  if (goal > 0) shown = Math.min(shown, goal);

  let phase, canClaim = false;
  if (goal > 0 && confirmed >= goal) { phase = GOAL_PHASE.COMPLETE; canClaim = true; }
  else if (goal > 0 && shown >= goal) { phase = GOAL_PHASE.CONFIRMING; }
  else { phase = GOAL_PHASE.PROGRESS; }

  return { shown, phase, canClaim, confirmed, goal };
}
