LANE BRIEF: lane/stale-gold-prediction. P1, LANE A (client only). All citations are at 715a9b1d (origin/main, live b555).

0. GROUND RULES
- Start with `git fetch origin && git checkout -b lane/stale-gold-prediction origin/main`. If origin/main is no longer 715a9b1d, check that the cited lines still match before editing.
- Never:
  - deploy;
  - touch Supabase or the DB;
  - edit supabase/**, src/core/** or tests/live-hash-drift.baseline.json;
  - commit docs/**, any report, visual-qa output or findings.json;
  - use git stash;
  - bump the version (the Coordinator bumps).
- Every new import under src/** carries ?v=555. Nothing under tests/** carries a ?v=.
- Commits: at most 8 lines, ending with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Commit and `git push -u origin <branch>` after every green step.
- HARD CONSTRAINT 1, legacy.js is at its ceiling. The monolith ceiling is src/legacy.js 19178 lines and 421 top-level functions (tests/monolith-ratchet.baseline.json). Every legacy.js edit must be line-neutral or smaller and add no top-level function. New logic goes in src/net/* or src/render/*.
- HARD CONSTRAINT 2, the prediction ratchet is frozen. tests/no-new-prediction.mjs on 715a9b1d reports sites=35, predict.js exports=19, reconcilers=26 (exit 0; tools/lane-done.mjs:28).
  - No new predict.js export.
  - No new exported reconcile* anywhere.
  - No new CALL of any registry name (tests/no-new-prediction.mjs:62-69: predictionBag, predictedXp, predictedBalance, predictedXpMap, hasPredictions, retirePredictions, coverageBoundary, reconcileCreditedXp, …), and that includes calls inside predict.js. Private helpers take a bucket as an argument and never call predictionBag.

1. INCIDENT (QA account, slot 0, live b555, about 21:09-21:16 UTC)
- For 4+ minutes after a kill and a knockout, and across two shop buys, the topbar showed gold 11,259 while the server held 11,257: balanceForDisplay returned {value:11259, predicted:2, rung:'server'} and balanceOf returned 11257.
- 8 attack/strength XP entries were still predicted.
- G._combatXpPending = {attack:2, strength:2, defense:2, hitpoints:1}; G._killCreditPending = {slime:1}.
- A reload fixed the display, and also threw those pending credits away.

2. VERIFIED ROOT CAUSE (read in code, reproduced by the ratchet run; not seen at runtime)
A prediction has no deadline of its own. Only three things remove one:
- applyRecord (src/net/record.js:1050-1053: reconcileCreditedXp, then retirePredictions);
- resetPredictions on an identity change (record.js:865);
- the 256-entry overflow (src/net/predict.js:203-209).

The 15-minute age limit (predict.js:130) is checked only inside retirePredictions (predict.js:495). Even there it only covers the fields that envelope wrote (496-498), and it never runs at all on a stale envelope (record.js:937-941) or one with no record fields (967-969). There is no timer and no check at read time.

Kill gold:
- Written by onLoot → hrPredictBalance (src/legacy.js:6338-6341). It is untagged, so it is retired only by the coverage rule: cut-off = arrival − (serverNow − state.accrued_to) (predict.js:344-358).
- Gold verbs never move accrued_to: supabase/functions/hr-accrue/spend.js:199 guardStampKeys refuses stamping keys, and the body is hr_apply's hr_state_of.
- So a shop envelope restates the last settle's watermark and cannot retire a kill made after it. That is the measured +2.

Credit-tagged XP (combat at legacy.js:3606, Bounty Hunter at 4852; tag set at predict.js:260):
- Exempt from coverage (predict.js:511). Retired only when the server's recorded XP goes up (predict.js:437-462).
- Any shortfall is never retired except by the 15-minute limit, and only if a skills-carrying envelope arrives. Shortfalls come from a knockout-clamped credit, settle_first, the daily budget, the cap, or pending XP that was never sent.

TRIGGER, UNCONFIRMED. Two candidates, both consistent with the code:

(a) A hung settle latch. This is the most direct route.
- requestAccrual reuses any settle already in flight (src/net/accrue.js:889) and clears that latch only in the finally at 953.
- Before sending, it awaits a forced credit flush (915-917). That flush waits for any credit already in flight (legacy.js:4347-4354), and credits go through goal-claim.js call(), whose fetch (src/net/goal-claim.js:196) has no timeout.
- The accrue fetch itself (accrue.js:929) has no signal either, and res.json() (937) can stall.
- One hang therefore blocks, until reload:
  - every cadence settle;
  - the fall re-ask;
  - settleBeforeIntent (accrue.js:5963), which means market, quest claims and clan seat hang too.
- There is also a latent promise cycle:
  1. The forced flush gets not_in_combat and re-declares with force (goal-claim.js:246-265).
  2. The collect is refused, so recoverCollectRefusal awaits beginServerAccrual (src/net/activity.js:1163-1166).
  3. beginServerAccrual returns the same outer inFlight, which is itself waiting on step 1.
- accrue.js:547-549 describes "the settle's own request timeout", which does not exist.

(b) A server-side stop (retreat or auto-stop) left the server pointer idle, and the one settle answer that carried it was dropped at legacy.js:2089. That happens when the frame gate refuses (accrue.js:4870) or on the reconcile-pending deferral (4889). Every later settle answers accrued:false with no state (hr-accrue/index.ts:1318).

A hidden tab (accrue.js:5758) is a weaker third candidate. The display fix below is correct whichever trigger it was, and (a) is fixed outright.

SKEPTIC CORRECTIONS ALREADY APPLIED TO THIS DESIGN
- No clamp keyed on combat_xp_accrued_to. Every credit call stamps it (hr-accrue/accrual.js:1966), so a clamp would re-open the b491/b492 "XP vanished" shape.
- Never race the flush and then send the settle anyway: that breaks credit-before-settle (accrue.js:904-911). On timeout, ABANDON the attempt.
- The read-time expiry MUTATES the scratch queue head. Buckets keep running totals (predict.js:93-95); a skip that does not mutate re-sums up to 256 entries per read on getLevel's render path.
- Nothing repaints the header when an entry expires: updateTopbar (legacy.js:7162) runs only on actions and inside applyRecord (record.js:1056). A repaint must be added.
- The accrue request timeout must sit above the edge's own limit, so it never aborts an answer the platform can still deliver.

3. CLASS LIST
Fixed in Part A:
- (1) Kill gold, legacy.js:6338-6341 → F1.
- (2) Untagged gather/artisan XP, legacy.js:3606 → F1.
- (3) Credit-tagged combat XP, predict.js:437-462 and 511 → F1 + forgiven (F2).
- (4) The age limit exists only inside applyRecord (predict.js:130, 495-498; record.js:937-941, 967-969) → F1.
- (5) Bounty Hunter XP predicted after the server already credited it (legacy.js:4852) → limited to 210 s by F1.
- (6) Gems bucket (predict.js:117): dormant, covered by F1.
- (7) No repaint when a prediction expires → F3.
- (8) Credit transport has no timeout (goal-claim.js:186-211) → F4.
- (9) Settle latch and fetch have no bound, plus the promise cycle (accrue.js:889, 903-953) → F5.
- (10) Kill credit is not flushed before a settle (legacy.js:4581-4617, 60 s cadence). hr_attended_kills pays only for credit rows inside (accrued_to, p_upto] (supabase/migrations/2026-09-10-attended-loot-credit.sql:484-494). So a kill's gold is retired at settle N but paid at settle N+1, and the display dips in between → F5.
- (11) No credit drain before a switch closes the window: stopCombat declares idle (legacy.js:6005) with _combatXpPending and _killCreditPending unsent → F6.
- (12) farm-sync callFarmRpc has no timeout (src/net/farm-sync.js:122-140) → F7.
- (13) A hidden tab stops settles (accrue.js:5758). No change: F1 bounds the display, and the visible→scheduleSettle(1) trigger at accrue.js:6009 already settles on return.

Fixed in Part B (separate branch):
- (14) Gates that read the display level. Full list in §6.

FOLLOW-UP, do not do in this lane; list them in the report:
- hrSyncMaxHp is raise-only off the display level (legacy.js:2917-2933). Changing it conflicts with Paione's 10/11 HP report, so it is the game-designer's call.
- Replayed settle answers carry full state (hr-accrue/index.ts:1494-1496) but are classified 'nothing' (accrue.js:437) and thrown away.
- The G.bestiary kills++ residue counter is never reconciled with the server.
- item-ledger has an unbounded "keep waiting" outcome (dormant).

4. FIX DESIGN

Part A, commit 1: F1 + F2 + F3

F1, src/net/predict.js: one deadline, checked on every read and every envelope.
- Retune MAX_PREDICTION_AGE_MS (predict.js:130) from 15 min to 210_000: 2 × SETTLE_INTERVAL_MS (90000, accrue.js:5656) + 30 s for the flush and round trip.
  - KEEP THE NAME. window.HearthrisePredict (predict.js:568) and tests/predict-display.mjs:177, 242 and 518 read it, and the export count stays at 19.
  - Rewrite the header comment (83-87) and the comment at 125-129. It is now THE deadline. In a healthy loop the coverage rule retires every entry in about 95 s, so the deadline never fires. Past a stalled pipeline, §6 (Tyler, 2026-09-14) outranks b455's no-rewind rule.
- Add a private expireHead(bucket, now):
  - shift head entries whose at <= now − MAX_PREDICTION_AGE_MS;
  - keep total in step, the same way retireBucket (464-477) does;
  - for a credit-tagged bucket, add the dropped amount to bucket.forgiven = {n, at: now}.
- Read-time expiry: predictedXp(G,id,nowMs) (270), predictedBalance(G,f,nowMs) (311), predictedXpMap(G,nowMs) and hasPredictions(G,nowMs) (544) each take an optional trailing nowMs (default Date.now()) and call expireHead on the buckets they read before reading total. They already hold the bag; add no predictionBag calls.
- retirePredictions (489-524): first run expireHead over EVERY bucket (all skills, gold, gems), then run the existing written-fields coverage pass unchanged.

F2, the forgiven amount: reconcileCreditedXp (437-462).
- Takes an optional nowMs. record.js:1051 passes the nowMs it already has; the call site count does not change.
- A positive increase first uses up a live bucket.forgiven.n. Forgiven is dropped once now − at > MAX_PREDICTION_AGE_MS. Only the remainder goes to consumeBucket.
- Do not delete a bucket (459, 513) while its forgiven amount is live.
- Why: a credit that lands late for an expired entry must not eat the newer entries, which is the b492 "reads low" shape.
- coverageBoundary is unchanged. Its 'age-bound' fallback now shrinks with the constant, which is intended.

F3, repaint when a prediction expires.
- In src/net/record.js next to repaintHeader (1073), window-gated the same way, add armExpiryRepaint(). It keeps ONE timer, set to Date.now() + MAX_PREDICTION_AGE_MS + 250. When it fires it calls window.updateTopbar() and repaints the visible skill surface.
- Publish it, plus armedAt(), on window.HearthriseRecord (record.js:1923).
- Call it from hrPredictXp and hrPredictBalance (legacy.js:2840-2849), compacting those wrappers so legacy.js stays line-neutral.
- Active fights already repaint on every kill (legacy.js:6372).

Part A, commit 2: F4 to F7 (deadlines on everything that credits a prediction)

F4, src/net/goal-claim.js call() (186-211).
- Add an AbortController with CALL_TIMEOUT_MS = 15000 (precedent: src/net/gold.js:826). Keep the timer armed across fetch AND res.json(); unlike gold.js:951-956, do not clear it before json. An abort returns {ok:false, error:'timeout'}.
- The callers already keep pending XP and kills on any not-ok answer (legacy.js:4408; 4607 subtracts only on ok).
- Add a test seam on window.HearthriseGoalClaim that shortens the timeout.

F5, src/net/accrue.js requestAccrual (903-939).
- New export flushAttendedCredits(), used here and by activity.js:
  - awaits window.hrCreditCombatXpFlush(true) AND window.hrKillCreditFlush(true);
  - races them against CREDIT_FLUSH_WAIT_MS = 35000 (≥ 2 × CALL_TIMEOUT_MS + 5 s, because a forced flush may wait for a credit in flight and then send one follow-up, legacy.js:4347-4354);
  - uses env().setTimer / env().clearTimer from setSettleEnv (accrue.js:5718) so tests can drive the clock;
  - returns {timedOut}.
- Call it only inside the existing awaySettleClosed branch (915-917). The boot/away settle still skips it.
- If timedOut, ABANDON the attempt:
  - send no accrue request and do not call settle() (no halt strike, the settle-first latch untouched);
  - return {outcome:'unreachable', reason:'credit_flush_timeout', applied:false, abandoned:true};
  - inFlight clears in the existing finally (953). This also breaks the promise cycle.
- Accrue fetch timeout: an AbortController on the fetch (929) with ACCRUE_REQUEST_TIMEOUT_MS = 160000, armed across fetch AND res.json() (937), via env().setTimer.
  - Why 160 s: Supabase documents a 150 s request idle timeout for Edge Functions, so this timeout only catches a client-side black hole. Say "per Supabase docs, not measured" in the commit.
  - An abort runs settle({outcome:'unreachable', reason:'timeout'}), which counts toward the halt.
- Add pendingSinceMs to getAccrualState() (798).
- Reword 547-549 so it is true.

F6, src/net/activity.js declareActivity.
- At the top of the in-flight block (1209), when the last confirmed activity (the `confirmed` variable, 163) was combat AND the call is not o.force, `await flushAttendedCredits()`. Ignore timedOut.
- Skip it for o.force. The not_in_combat re-declare (goal-claim.js:256) runs inside the flush, so pre-flushing there is a cycle.
- Ordering is kept by the existing coalescer (1202).
- Why: the attended tail then reaches the server before the collect closes the window, instead of stranding in _combatXpPending and _pred.

F7, src/net/farm-sync.js callFarmRpc (122-140).
- AbortController with FARM_RPC_TIMEOUT_MS = 15000, across fetch and json. An abort returns {ok:false, error:'timeout'}.

If any item turns out to need a migration or an edge change: STOP, report "LANE C needed" with the reason, and write no SQL. None is expected.

5. TESTS
Each test must be RED on 715a9b1d and GREEN after. Capture the RED line by running the new test against a checkout of origin/main.

Commit 1 tests, in tests/predict-display.mjs (pure Node, run from tests/run-smoke.mjs:3074 and standalone).
applyRecord calls Date.now() itself (record.js:1041), so backdate the `at` argument of predictXp/predictBalance instead of faking a clock. Use the file's existing envelope builders.
- PD-TTL-1a, control (no rewind):
  - Setup: record gold 11557, stamped. predictBalance(G,'gold',2, now−60000). Apply a gold-verb envelope with gold 11407 whose accrued_to maps to before the kill.
  - Expect balanceForDisplay to be 11409.
  - GREEN both before and after.
- PD-TTL-1b, the incident:
  - Setup: same, but the kill is at now−240000 and two stale gold-verb envelopes arrive (11407, then 11257).
  - Expect 11257 with predicted 0.
  - RED today: 11259.
- PD-TTL-2, no envelope at all:
  - Setup: predictXp(G,'woodcutting',30, now−211000) and predictBalance(G,'gold',5, now−211000), with no applyRecord.
  - Expect skillXpForDisplay and balanceForDisplay to equal the server values.
  - RED today.
  - Control: the same at now−150000 is still displayed, in both runs.
- PD-TTL-3, credit-tagged XP and the forgiven amount:
  - Setup: a baseline envelope with skills.attack = 1000. Then attack +10 at now−215000 {credited:true} and +6 at now−5000 {credited:true}.
  - Expect display 1006. RED today: 1016.
  - Then an envelope with attack = 1010 → expect display 1016 (the forgiven 10 is used first; the 6 survives).
- PD-TTL-4, away-path pin:
  - Setup: an accrued:true away envelope (away block with death:true, recovering_until set, accrued_to = serverNow).
  - Expect it to retire every entry by coverage, and a kill predicted after it to survive.
  - GREEN both before and after.
- PD-TTL-5: assert 2*SETTLE_INTERVAL_MS + 15000 <= MAX_PREDICTION_AGE_MS <= 3*SETTLE_INTERVAL_MS.
- The existing b455 no-rewind and b492 double-count cases stay GREEN.

Commit 1 tests, in-page, in src/features/smoke/record-seam-and-hydration.js under "regression suite". Copy the pattern of THE HEADER THAT KEPT THE OLD NUMBER (line 7518) and use stampBalanceLikeLoad (_harness.js:476).
- IP-1, attended:
  - Setup: stamp the record, make the kill-gold prediction through the production wrapper path, backdate its entry past the deadline, then apply two stubbed gold-verb envelopes with a stale watermark through the real apply path.
  - Expect armedAt() to be set.
  - Then invoke the armed handler and expect the #top-gold text to equal balanceOf(G,'gold').
  - RED today.
- IP-2, away:
  - Setup: a stubbed away receipt with a death, applied through applyServerEnvelope.
  - Expect hasPredictions() to be false and #top-gold to equal balanceOf.
  - GREEN both before and after.
- XP-FOLDBACK (b495) and XP-CREDIT-RETIRE (b492) in src/features/smoke/monsters-inventory-and-brand.js:2081 and 2231 must stay GREEN.

Commit 1 message, mutation proof (run each mutation and name the test that goes RED):
- (a) Constant back to 15 min → PD-TTL-1b, -2, -3 and -5 RED.
- (b) No read-time expireHead → PD-TTL-2 RED.
- (c) No forgiven-first consumption → the second half of PD-TTL-3 RED.
- (d) Constant set to 0 → PD-TTL-1a and the b455 no-rewind case RED. This proves the deadline is not just deleting predictions.
- (e) No repaint arm → IP-1 RED.

Commit 2 tests, in tests/attended-fall.mjs (it uses the staged-copy MUTATIONS harness at line 73 and runs --selftest in smoke.yml:2553-2554).
- Stub globalThis.fetch the way tests/combat-xp-settle-first.mjs:152 does. requestAccrual uses the global fetch, not the setSettleEnv transport.
- Route every new timer through setSettleEnv({now, setTimer, clearTimer}).
- Wrap each await in a 200 ms real-time race, so a RED on the base commit reports instead of hanging.
- ST-1, hung flush:
  - Setup: hrCreditCombatXpFlush = () => new Promise(() => {}). Fire the fake flush timer.
  - Expect the outcome 'unreachable' with reason 'credit_flush_timeout', 0 accrue fetches, and settleInFlight() false. A second requestAccrual must put a request on the wire.
  - RED today.
  - Control: a boot settle (latch false) skips the flush and still sends.
- ST-2, hung fetch:
  - Setup: a fetch that never resolves but rejects on init.signal abort. Fire the timeout.
  - Expect 'unreachable'/'timeout' and settleInFlight() false.
  - RED today.
- ST-3, the cycle:
  - Setup: hrCreditCombatXpFlush = () => A.requestAccrual({}).
  - Expect both the outer and the inner calls to resolve after the timer fires.
  - RED today (deadlock).
- ST-4, order:
  - Expect hrKillCreditFlush(true) and hrCreditCombatXpFlush(true) both to resolve before the accrue fetch.
  - RED today.
- ST-5, goal-claim timeout:
  - Setup: load src/net/goal-claim.js in node:vm with a window shim (HearthriseSupabase.getConfig, HearthriseRpc.mayCall returning true, a fetch that honours the signal, a fake setTimeout).
  - Expect creditCombatXp to resolve {ok:false, error:'timeout'}.
  - RED today.
- New MUTATIONS entries: no-flush-bound, send-after-flush-timeout, no-accrue-watchdog, no-kill-flush-before-settle, no-call-timeout. --selftest must report all of them CAUGHT.

Commit 2 tests, elsewhere:
- tests/activity-intent.mjs (MUTATIONS at line 105; --selftest in smoke.yml:2095):
  - ACT-CREDIT-1: after a confirmed combat, declareActivity('idle') awaits the forced flush before the set_activity fetch. RED today.
  - ACT-CREDIT-2: a {force:true} declaration does not pre-flush.
  - Mutations: no-credit-before-switch, preflush-on-force.
- tests/farm-sync.mjs (run-smoke.mjs:2705):
  - FARM-TIMEOUT-1: a hanging fetch → {ok:false, error:'timeout'}. RED today.

Commit 2 message: the --selftest CAUGHT lines, plus the farm test's manual mutation.

§4 both-path requirement: attended is covered by IP-1, ST-* and ACT-*; away is covered by PD-TTL-4, IP-2 and the ST-1 boot control.

6. PART B: second branch lane/display-level-gates
Start this only after Part A is pushed and its gates are green. Branch from origin/main.

Change:
- Gates read the SERVER level with a fail-safe of 1: HearthriseSkillRecord.skillLevelOf(G, sk, levelFromXp) (src/net/skill-record.js:105). They must stop reading getLevel, which is the display level (legacy.js:2876).
- Publish ONE accessor, for example window.hrGateLevel, from src/net/skill-record.js. Do not add a legacy.js function.
- Swap it in at these sites:
  - legacy.js: 8379 canWield, 8421, 11067, 14576, 14607, 15136, 15166, 16003, 16088, 16103;
  - src/screens/farm.js: 339, 520, 598;
  - src/features/auto-actions.js: 892;
  - src/features/inv-context-menu.js: 122;
  - src/item-ux.js: 138.
- Display sites keep getLevel.
- When the display level is ≥ the requirement but the server level is below it, the refusal or label says the new level is still being confirmed. Use one shared string.

Regression test (in-page, "regression suite"):
- Setup: server attack level 9 stamped, plus a credited prediction that makes the display read level 10.
- Expect canWield(a level-10 item).ok to be false, and the Craft refusal to fire.
- RED today.

Proof screenshots: the Equip panel and one crafting list while a level is pending, at desktop size and at 922×423.

7. GATES
Use real exit codes: `cmd; echo "exit=$?"`, never `|| echo`.
- a. Before editing, on origin/main: `node tests/run-smoke.mjs > base.log 2>&1; echo exit=$?`. List its reds; this container cannot reach Supabase, so those reds are environmental.
- b. Per commit:
  - `node tests/predict-display.mjs`
  - `node tests/attended-fall.mjs` and `node tests/attended-fall.mjs --selftest`
  - `node tests/activity-intent.mjs --selftest`
  - `node tests/farm-sync.mjs`
  - `node tests/no-new-prediction.mjs` and `node tests/no-new-prediction.mjs --selftest` (must still print sites ≤35, exports 19, reconcilers 26)
  - `node tests/monolith-ratchet.mjs`
  - `node tests/comment-ratio-ratchet.mjs`
- c. At the end:
  - `node tests/run-smoke.mjs`: every red must appear in base.log, named with the reason "no Supabase from cloud". Any new red is this lane's to fix.
  - Then `node tools/lane-done.mjs` must exit 0.
- d. Screenshots: `node tests/visual-qa.mjs` with window.__HR_TEST_HARNESS__ = true.
  - Part A changes numbers, not layout. Add one before/after pair of the topbar only if it is cheap.
  - Part B screenshots are required.
  - PNG only, pushed ONLY to the branch qa/stale-gold-prediction, which is never merged into the lane branches.

8. REPORT
Put the table first, then at most three sentences.

| item | status (pushed / red / not started) | commit SHA | evidence |

Rows: F1-F3, F4-F7, Part B. For each row give:
- the RED line on 715a9b1d;
- the exit codes above, including the ratchet counts and the lane-done exit;
- the run-smoke reds, split into environmental and new (new must be none);
- the mutation results;
- the qa branch and the PNG names.

Also:
- Name anything skipped. Say "LANE C needed" if any item needed a server change.
- State that the trigger is still unconfirmed, and how the Coordinator pins it next time it happens:
  - client side: HearthriseAccrual.getAccrualState().pending and pendingSinceMs, getSettleState().lastDecision, the frame drops, and console lines starting '[accrue] deferring';
  - server side, read-only and Coordinator only: player_state.accrued_to and active_kind, and the last accrue ledger row compared with the kill time.