// ════════════════════════════════════════════════════════════════════════
// tests/hr-apply-final-body.mjs — WHERE hr_apply's LIVE TEXT LIVES, AND HOW A
//                                 MUTATION PROOF REACHES IT.
//
// Not a guard: a two-constant module the guards that PLANT INTO hr_apply import,
// so the answer to "which file owns the body today?" exists in ONE place instead
// of in each guard's private `const MIG`.
//
// ── THE FINAL-BODY RULE ─────────────────────────────────────────────────────
// A mutation proof must plant its defect in the file that owns the text the
// database ACTUALLY RUNS. For a body assembled by anchored patches that is the
// LAST file to touch it; every earlier file's contribution is overwritten by
// whatever comes after. tests/buff-queue.mjs learned this the hard way on
// 2026-09-13 — an arm that mutated text a later file re-splices scored HARNESS
// instead of the tick it earned — and its header states the rule.
//
// 2026-09-14-hr-apply-restatement.sql RESTATES hr_apply whole and runs LAST, so
// it now owns every line of that body. An arm that still plants into
// 2026-09-12-renown-high-projection.sql or 2026-09-13-consumable-buffs.sql is
// mutating a draft: the restatement replaces it a few files later and the arm is
// VACUOUS. Point the arm HERE instead.
//
// ── WHY THAT IS LOUD RATHER THAN SILENT ─────────────────────────────────────
// The restatement's §0 PINS the code hash of the body it replaces and REFUSES to
// apply over a body it does not recognise (a restatement applied over drift
// silently DISCARDS the drift — the one failure mode unique to that migration
// shape). So an arm left pointing at an earlier file does not quietly stop
// biting: the chain refuses and the arm reads "THE REPO CANNOT REBUILD THE
// DATABASE". That is the desired failure — a stale anchor cannot rot unnoticed —
// and the fix is always the same: re-point the arm at S3_BLIND's file.
//
// ── THE BLINDS ──────────────────────────────────────────────────────────────
// Once an arm plants HERE, the restatement's own §3 self-check sees a body that
// is not the one the file states it installs and raises at apply time. That is
// correct behaviour and it is also a gate — so in GATE-BLIND mode (the run whose
// job is to prove THIS GUARD sees the defect, not that some migration can raise)
// it is short-circuited, exactly the way tests/buff-queue.mjs blinds the buff
// files' §-checks and tests/renown-projection.mjs blinds cellar-scale's §3.
// The PLAIN arm keeps running the whole chain honestly, which is where "the
// migration would have caught it too" is demonstrated.
//
// S0_BLIND is for the rarer case: an arm that must keep planting into an EARLIER
// file (it is proving something about that file's own patcher, not about the
// resulting body). Blinding §0's predecessor pin lets that arm run — but read the
// final-body rule again first, because such an arm is usually vacuous anyway.
// ════════════════════════════════════════════════════════════════════════

/** The migration that owns hr_apply's live text. */
export const HR_APPLY_FINAL = '2026-09-14-hr-apply-restatement.sql';

/** Short-circuit §3 (the post-install self-check). Anchored on the first
 *  statement of its `begin`, which is unique in the file. */
export const HR_APPLY_S3_BLIND = [
  "begin\n  v_def  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');",
  "begin\n  return;  -- §3 SHORT-CIRCUITED FOR A MUTATION PROOF (tests/hr-apply-final-body.mjs)\n"
  + "  v_def  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');",
];

/** Short-circuit §0 (the predecessor pin + the dead-declaration proof). */
export const HR_APPLY_S0_BLIND = [
  '  if to_regprocedure(c_sig) is null then',
  '  return;  -- §0 SHORT-CIRCUITED FOR A MUTATION PROOF (tests/hr-apply-final-body.mjs)\n'
  + '  if to_regprocedure(c_sig) is null then',
];
