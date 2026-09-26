LANE BRIEF: lane/ko-sheet-truth. P2, LANE A (client only). Phase 2 is LANE C and is NOT this lane (section 10).

0. GROUND RULES (cloud routine)
- Work in a fresh clone of github.com/bugsquisher1/hearthrise. Run `git fetch && git checkout -b lane/ko-sheet-truth origin/main` and confirm `git rev-parse origin/main` = 715a9b1d (live b555). If main has moved, branch from the new tip and name it in the report.
- NEVER: deploy; touch Supabase or the DB; edit supabase/functions/**, supabase/migrations/**, src/core/combat-sim.js or tests/live-hash-drift.baseline.json; commit docs/reports/visual-qa/findings.json or any new .md; use git stash; run bump-version.sh. Any new import under src/** carries ?v=555.
- Commits: at most 8 lines each, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit and push to origin lane/ko-sheet-truth after each step in section 7. Every fix ships with its test in the same commit.
- NO COPY AUTHORING. This lane only (a) moves where facts are read from, (b) leaves out claims nobody stated, (c) reuses sentences that already exist. If a fix seems to need a new sentence, stop and report it.

1. SYMPTOM
A reload during a knockout (KO) rewrites the sheet:
- 'Slain by Slime · 3 kills first' becomes 'Slain in battle · no kills'.
- A player who ate is told 'You were carrying 5 x Cooked Shrimp and never ate one'. N is today's bag, including food bought AFTER the KO.
- At 3-5 consecutive falls, a fed character is told 'You pulled back … on an empty bag … your run does not restart itself'.
- A KO that spans 00:00 UTC reads 'First fall of the day … no delay' under a running countdown.
- On the accrued:true boot door (hr-accrue lands before hr_load) the sheet shows '[No food to rest with]' disabled while the server holds food. This one is actionable and is the b510 class.

2. VERIFIED ROOT CAUSE (two reviews upheld it; corrections applied)
R1. The event half is read from client scratch and from state as it is NOW, never from a server record of the fall. readMoment (src/features/death-sheet.js:824-1021) reads:
- killer: G.activeMonster (:830)
- kills: G.combatKillsThisFoe (:836)
- food eaten: a regex over G.combatLog (:750-758, :839)
- food held and quantity: the current G.inventory via bestProvision (:727-747, :832, :837-838)
- auto-eat state: the live switch (:860-865)
- this fall's cost: TODAY's deaths_today (:891-918). The projection is keyed on hr_utc_day_key(now()) at supabase/migrations/2026-09-14-hr-state-of-restatement.sql:478-481.
activeMonster, combatKillsThisFoe and combatLog are NO_SYNC (src/net/events.js:79-84, :93).
CORRECTION: activity-resume does NOT restore kills after a KO. hr-accrue voids the fight checkpoint on any window that contains a death (supabase/functions/hr-accrue/accrual.js:3080-3086), so fightOf returns null (src/net/activity.js:471-476), and startCombat zeroes kills and resets the log (src/legacy.js:5968-5969). No server field holds "kills before the fall", so dropping that value after the settle is REQUIRED.

R2. The announcement fires partway through the apply, on BOTH doors. reconcileFall dispatches 'hearthrise:fall' synchronously (src/net/accrue.js:4470-4480). The sheet listener (death-sheet.js:1583-1591) raises through maybeRaiseRecovery → show(null,null) (:1544-1557).
- Door 1, record.js settle(): step 'fall' (src/net/record.js:1751) runs BEFORE 'away-receipt' (:1806) and 'activity-resume' (:1849-1870).
- Door 2, applyEnvelopeState: reconcileFall at accrue.js:3663 runs BEFORE reconcileHp (:3699), reconcileAwayReceipt (:3982) and reconcileInventory (:4092). applyEnvelope writes G.lastOfflineSummary even later (:4912) and lastAwayReceipt at :4942.
- At boot, hr-accrue and hr_load race by design (src/net/character.js:396-399). An accrue-first raise therefore reads the empty literal bag (src/legacy.js:695) and default hp.
- syncToServer redraws only when phase or until changes (death-sheet.js:1295), so whatever was drawn first stays on screen.
- The comments at death-sheet.js:693-697 and record.js:1736-1741 are false on door 2. Fix them in this lane.

R3. Two in-session paths re-render without the engine info:
- answerTap → show(null,null) (death-sheet.js:1497-1498), reached from src/legacy.js:1773 and :1795 when the player taps while down. It throws away shown.info (streakBroken, retreat, resumeHp).

Confirm the mechanism FIRST: write the tests in section 6 and run them RED on the unfixed tree before touching any code.

3. CLASS LIST (fix all of these in this build)
K1 Killer from G.activeMonster (:830). Door-1 boot shows 'Slain in battle'.
K2 Kills from G.combatKillsThisFoe (:836). Never server-stated.
K3 Food eaten from the combatLog regex (:750-758, :839). 0 after a reload, so outmatched flips to food-unused.
K4 Tip quantity from today's bag (:727-747, :832, :837-838; TIPS :184-186). Names food bought after the KO.
K5 autoEatOn in the tip from the live switch (:860-865, TIPS :176-183).
K6 Cost row from today's counter (:891-918, rows :521-528). Cross-midnight 'First fall … no delay'.
K7 bootRetreat veto keys only on G.activeMonster (:790-807, :796). Fed at 3-5 falls, or fishing while KO'd (gathering is legal while down, legacy.js:1737-1744), reads 'You pulled back … empty bag'.
K8 Announcement before hp, bag and receipt land (accrue.js:3663, :4478; record.js:1751). Rest gate (:698, :709-714) and standing note (:1209-1212) are stale.
K9 syncToServer identity is phase/until only (:1291-1299), so bag, hp and record changes never redraw.
K10 answerTap rebuilds an open sheet with info=null (:1497-1498).
K11 Welcome modal auto-eat-off branch reads today's bag through a hand-rolled chooser (src/legacy.js:13535-13554).
K12 Home 'Still recovering — Nm to go' comes from the receipt's settle-time snapshot recoverRemainingMs (src/features/home-dashboard.js:719-729). It is frozen for 30 minutes, not reconciled against recovering_until, and gone after a reload. This is a CLAUDE.md §6 cooldown.
NOT IN THIS LANE (list them in the report):
- (c) 'You had nothing to eat' is server-derived (accrual.js:1952 → away-receipt.js:157 → accrue.js:5119). It is not a client lie.
- The outmatched 'You ate everything you had' copy defect (death-sheet.js:203-206) and its welcome-modal twin (legacy.js:13530, :13555-13557): copy for the Game Designer.
- awayAutoEatState is dead code (legacy.js:2289-2309): the hardening branch.
- Home retreat facts lost on reload (home-dashboard.js:600-601; the receipt drops retreatFalls/retreatFoodless, away-receipt.js:65-71): Phase 2.
- nToday in the auto-eat-off-repeat tip (:476) and the no-timer lead (:613-615): Phase 2.
- The resume row when the server pointer is Stopped or non-combat: Designer and Phase 2.
- The healed row's 0-hp fallback to maxHp (:503): P4.

4. FIX DESIGN (one seam: the server record of the fall, read in one place)
F1 Announce at the tail of every door (fixes K8):
- Move the dispatch out of reconcileFall (accrue.js:4470-4480) into an exported announceFall(). reconcileFall keeps every mirror write and noteFallAnswer.
- applyEnvelope (accrue.js:4870) and applyIntentEnvelope (src/net/activity.js:779) announce ONCE, in a finally, after their receipt writes (after accrue.js:4942, and after activity.js's paidReceipt write).
- A bare applyEnvelopeState call (the Rest envelope at death-sheet.js:1409, __resetForTest at :1574) announces at its own end. Use a module-scope hold counter so nested calls announce exactly once.
- record.js settle() (:1615): add hydrationStep('fall-announce', announceFall) as the LAST step, after 'activity-resume'.
- Leave the ceiling-tick dispatch (accrue.js:1640) alone.
- A missed door brings back the live b510 bug (reload shows a fight bar and no sheet, RETREAT-A4 at src/features/smoke/market-night-and-prices.js:2215), so every door gets a test.

F2 fallRecord() in src/net/accrue.js, next to reconcileFall. It is a read-only mirror, NEVER persisted and NEVER residue (§6):
- Inside reconcileFall, when `'last_away_receipt' in st` (key presence, never coalescing): if the value is a plain object with died===true, store a frozen copy of {at, diedTo, deaths, foodEaten, recoverLadder, autoEat (omitted if absent), stoppedBy} and bump a seq when `at` changes. If the value is null or has died!==true, clear the mirror. An absent key leaves it untouched.
- noteFallAnswer stamps fall.answerSeq only when THIS envelope wrote the record.
- fallRecord() returns the record only when PAIRED with the current fall:
  - phase 'recovering': rung = last(recoverLadder) > 0 and until - rung - 5000 <= at <= until + 5000. Receipt at >= fall end = until - rung (combat-sim.js:803-804).
  - phase 'down-free': fall.answerSeq === seq.
  - Otherwise it returns null.
- Do NOT read G.lastOfflineSummary. It holds the PREVIOUS receipt at dispatch and 90 s sync receipts replace it (accrue.js:4912-4940).
- Do NOT write into lastAwayReceipt or G.lastOfflineSummary either. That would re-announce the death on the welcome modal (legacy.js:13419-13423).
- The envelope state carries the receipt because hr_state_of projects it (hr-state-of-restatement.sql:459-461; post-apply envelope at supabase/functions/hr-accrue/index.ts:1502).
- Known limit, stated in code: an away settle of 10 minutes or more during a long KO replaces the receipt (away-receipt.js:96-99). The sheet then degrades to claiming nothing until Phase 2.

F3 readMoment's event half, by phase (fixes K1-K6):
- 'pending' and 'unconfirmed': unchanged (engine info plus client state is instant feedback).
- 'recovering' and 'down-free': ONLY fallRecord(), as follows:
  - killer = diedTo; unpaired → ''.
  - killsThisFoe = null (unstated). describeDeath then renders v '' and render() (:1168) omits an empty <b>.
  - tip facts (D1):
    - foodEaten > 0 → ate = foodEaten → outmatched.
    - foodEaten 0 and autoEat.hadFood === false → foodQty 0, autoEatOn = autoEat.enabled → auto-eat-idle or no-food.
    - otherwise (including hadFood true, autoEat absent, or unpaired) → tipStated:false → tipKey null and no .hr-death-tip block (:1179-1180).
    - Do NOT infer 'held food, never ate' from foodEaten 0 and hadFood true. The sim never counts manual Eat (legacy.js:8169-8172).
  - cost row = rung; rung 0 → the existing 'First fall …' row.
  - Unpaired while recovering → never render 'First fall of the day' (omit the cost row).
  - retreat = stoppedBy === 'retreat' when paired. The rung wording comes from G.consecFalls through the existing retreatAtFall order.
  - streakBroken = false and resumeHp = live server hp when not pending.
- STATE HALF stays on the live projection:
  - Rest gate (restFood / missingHp)
  - the present-tense 'your bag is empty' row (hadFood :1010-1019)
  - the 'if you fall again' warning (nextRecoveryMs :924-935; must NOT move)
  - the recovering_until countdown
  - the Auto-Eat re-enable BUTTON
- Split describeDeath's foodQty: add restFood for the Rest gate and keep foodQty/foodName/ateThisFight as the tip inputs. The b373 fixtures (monsters-inventory-and-brand.js:6657-6665) then stay valid. Fixtures that assert Rest set restFood explicitly. tipStated:false and killsThisFoe:null are opt-in, so hand-built fixtures keep their meaning.

F4 bootRetreat (fixes K7):
- A paired record is authoritative both ways: stoppedBy 'retreat' claims the retreat; any other value claims nothing.
- Unpaired: keep the consec_falls inference, but veto on ANY live pointer (activeMonster, activeSkill, activeAction, activeArtisanRecipe; the fixture names are at market-night-and-prices.js:2248-2249). These are valid now that F1 runs after activity-resume. RETREAT-A4/A4b/A4c then stay green unmodified.

F5 syncToServer identity (:1291-1299) (fixes K9):
- Add the fallRecord identity (at, or null), restFood>0, missingHp and hadFood.
- Skip the redraw while a Rest is in flight: set a module flag around GC.rest() at :1395 so a rebuild cannot re-enable 'Resting…'.

F6 answerTap (fixes K10): when the sheet is already open, re-render with readMoment(shown.info) and never show(null,null). Keep the openerForTest path; its tests are at recovery-and-auto-eat.js:1634-1700.

F7 Welcome modal (fixes K11): delete the today's-bag chooser (legacy.js:13537-13549) and always use the existing no-quantity sentence 'Auto-Eat was switched off. Switched on, your provisions were worth …'.

F8 Home clock (fixes K12): the recovery note reads the live line (HearthriseAccrual.recoveringUntilMs() - Date.now()) instead of off.recoverRemainingMs (home-dashboard.js:719), and says nothing when the live line is 0.

F9 Update the now-false comments in the same commits: death-sheet.js:693-697 and :1281-1286, record.js:1736-1741, legacy.js:11713-11716.

5. DESIGN DEFAULT D1 (the Coordinator may replace it with a Game Designer ruling before dispatch; the lane never improvises)
After the settle, the sheet drops every value the server never stated:
- the 'N kills first' value
- the 'carrying N x' quantity
- the food tip when food was held and nothing was auto-eaten
During 'pending' (the first ≤60 s) the b373 teaching tip still shows.
Tests assert stability and the absence of invented facts, and keep tipKey as the contract.

6. REGRESSION TESTS
Append them to the export array of src/features/smoke/recovery-and-auto-eat.js. Each test must fully restore G, window.fetch, R.resetRecord(), A.clearFall(), A.__resetAwayReceipt(), D.__resetForTest() and the HearthriseAuto switch in a finally.
Drive door 1 ONLY through R.configureRecord + R.requestRecord (src/net/record.js:1180, :1501) with a stubbed hr_load fetch, copying market-night-and-prices.js:2240-2285. applyRecord (:900) skips the hydration steps, so a test built on it passes today and proves nothing.
Drive door 2 through A.applyEnvelope(G, {accrued:true, state:{…}, away:{…}, inventory…}), copying the envelope shape of existing tests in record-seam-and-hydration.js.
Fixtures must be self-consistent. Compute RUNG = HearthriseCore.away.recoveryFor({deathsTodayBefore:2, deathsLifetimeBefore:8}), AT = now-30s, UNTIL = AT+RUNG, and assert RUNG > 60000.
Base state:
- active_kind 'combat', active_id 'slime', hp 8, max_hp 20, recovering_until UNTIL, consec_falls 1, deaths_today 3, deaths_lifetime 9
- inventory {cooked_shrimp:5}
- last_away_receipt {died:true, diedTo:'slime', deaths:1, kills:7, foodEaten:2, autoEat:{enabled:true,pct:25,hadFood:true}, recoverLadder:[RUNG], stoppedBy:null, at:AT, …} with the remaining keys valid per away-receipt.js:65-71
Snapshot the sheet as: title; lead with digits stripped; rows (k,t,v); data-tip; tip text; action labels and disabled flags.

- KO-RELOAD-1 ATTENDED:
  - Set G.activeMonster 'slime', combatKillsThisFoe 3, a combatLog with 2 eat lines, and the bag.
  - A.noteFall(now); D.show(ctx, info) as onDeath does (legacy.js:6408).
  - Then the door-2 pricing envelope → snapshot A.
  - Reload: fresh G literal, door 1 with the same state → snapshot B.
  - Assert A deep-equals B, killed-by t === 'Slain by Slime', no row v matches /kill/, tipKey 'outmatched', no /carrying \d+ x/.
  - RED today: B is 'Slain in battle · no kills' / food-unused.
- KO-RELOAD-1 AWAY:
  - A fresh G with no live fall. Door 2 raises → snapshot A'. Reload through door 1 → snapshot B'.
  - Assert A' equals B', and the Rest action reads 'Rest at the Hearth — eat 12 health' and is enabled.
- KO-DOOR-ORDER-1:
  - Door 2 on the empty literal G.
  - The raised sheet's Rest is enabled, and no 'You have no cooked food left' note is shown.
  - RED today (announce at :3663 before :4092).
- KO-FOOD-AT-FALL-1:
  - (i) receipt autoEat {enabled:true,hadFood:false}, foodEaten 0, empty bag, door-1 boot → tipKey 'auto-eat-idle' and Rest disabled.
    Then a door-2 envelope with cooked_shrimp:5 → the sheet redraws: Rest enabled, the 'no-food' row gone, tipKey still 'auto-eat-idle', no /carrying \d+ x/.
    Then reload with the bag at 5 → identical.
    RED today (flips to food-unused on reload; the in-session redraw never happens).
  - (ii) hadFood:true, foodEaten 0, bag 5, then the bag goes to 0 and reload → tipKey identical both times (D1: null), and never a quantity.
- KO-FED-3-BOOT: consec_falls 3, bag 5, pointer combat, paired receipt with stoppedBy null → no /You pulled back|empty bag/, resume v 'automatic'. RED today.
- KO-FED-3-GATHER: same fixture, active_kind 'gather' (fishing), receipt unpaired (last_away_receipt null) → no retreat claim. RED today (probe B).
- RETREAT-PAIRED: stoppedBy 'retreat', consec 3, pointer idle → 'You pulled back' present. Guards F4's other direction.
- KO-MIDNIGHT:
  - deaths_today 0 with a paired receipt → the run-stopped row t === 'Knocked out for '+fmtDur(RUNG)+' — nothing earns while you recover'.
  - Unpaired variant → no /First fall of the day/ while the countdown runs.
  - RED today.
- KO-ANSWERTAP-1: open an attended sheet with info {streakBroken:true, …} during pending, call D.answerTap('x') → the streak row is still present. RED today.
- KO-REST-INFLIGHT: stub GC.rest with a pending promise, tap Rest, then deliver a bag-change envelope → the button is still disabled and reads 'Resting…'.
- WELCOME-AE-OFF-1:
  - Receipt autoEat {enabled:false,hadFood:true}, recoverMs > 0, uplift ≥ 1.2.
  - window.__maybeShowWelcome({again:true}) twice with G.inventory 5 → 12 in between → identical text, never /You were carrying \d+/.
  - RED today.
- HOME-KO-CLOCK-1:
  - Receipt recoverRemainingMs 12m and deaths 1, then a Rest envelope with recovering_until null → the Home card has no 'Still recovering'.
  - Server line ahead with a restored receipt lacking recoverRemainingMs → the line is present.
  - RED today.
Also update, in the same commit, any existing fixture that asserts the Rest gate through foodQty: set restFood and keep every tipKey assertion. Never loosen an assertion.

7. COMMITS (push after each)
- C1: F1 + F5 + F6 + F9 (partial), with KO-DOOR-ORDER-1, KO-REST-INFLIGHT and KO-ANSWERTAP-1.
- C2: F2 + F3 + F4, with KO-RELOAD-1 (both), KO-FOOD-AT-FALL-1, KO-FED-3-BOOT/GATHER, RETREAT-PAIRED and KO-MIDNIGHT.
- C3: F7 + F8, with WELCOME-AE-OFF-1 and HOME-KO-CLOCK-1.
MUTATION PROOF: run each mutation, confirm the named test goes RED, revert, and cite the results in that commit's message.
- M1 restore G.activeMonster as the recovering-phase killer → KO-RELOAD-1
- M2 put the dispatch back inside reconcileFall → KO-DOOR-ORDER-1 and KO-FED-3-GATHER
- M3 restore bestProvision(G).qty as the tip quantity → KO-FOOD-AT-FALL-1
- M4 restore the deaths_today-derived recoveryMs → KO-MIDNIGHT
- M5 revert the sync identity to phase/until → KO-FOOD-AT-FALL-1(i)
- M6 answerTap back to show(null,null) → KO-ANSWERTAP-1
- M7 bootRetreat veto back to G.activeMonster only → KO-FED-3-GATHER
- M8 Home back to off.recoverRemainingMs → HOME-KO-CLOCK-1
- M9 restore the welcome bag chooser → WELCOME-AE-OFF-1

8. GATES (branch on $?; never write 'green' without the exit code)
- BEFORE any change, on untouched 715a9b1d, run `node tests/run-smoke.mjs; echo EXIT=$?` once. Record every red by name: the environmental baseline. The cloud cannot reach Supabase, so live-call tests may be red there.
- Show the new tests RED on the unfixed tree with `node tests/run-smoke.mjs --only KO-` (not a gate; it always exits non-zero) and quote each first failing assertion.
- At the tip, ONE full `node tests/run-smoke.mjs; echo EXIT=$?`. The reds must equal the baseline set exactly: zero new reds, every new test ✓. A red that is not in the baseline is read and fixed, never re-run until green.
- `node tools/lane-done.mjs; echo EXIT=$?` must be 0.
- Do not run run-ci-local or visual-qa: the Coordinator gates the assembled set.

9. VISUAL PROOF (the rendered sheet, welcome and Home card changed)
Create an orphan branch qa/ko-sheet-truth containing ONLY PNGs under ko-sheet-truth/, and push it. Never merge it and never put PNGs on the lane branch.
Headless shots of the KO-RELOAD-1 attended A and B, KO-DOOR-ORDER-1, and KO-FOOD-AT-FALL-1(i) after the purchase, each at desktop and at 922x423, both on 715a9b1d (before) and on the lane tip (after).
Use a throwaway script outside the repo with window.__HR_TEST_HARNESS__=true. Look at every PNG and say in one line each what it shows.

10. PHASE 2: LANE C (NOT this routine; scope it for the Coordinator)
- Add player_state.last_fall jsonb, written by hr_apply from the engine's LAST deathLog entry and projected by hr_state_of: extend the c_state key list (hr-state-of-restatement.sql:819), tests/no-client-copy-of-projection.mjs and restore-census.
- deathLog (combat-sim.js:809-816) gains:
  - foodless (:294)
  - killsThisFoe from state.combatKillsThisFoe (:143). NOT the span `kills` at :788.
  - autoEaten this fight. NOT the span foodEaten at :787; the sim never sees manual eats.
  - food {id,qty} at the fall
  - autoEat {enabled,pct}
  - retreat, retreat foodless and consecFalls
  - deathsToday (already present)
  - streakBroken
  - resumeHp (already present)
- Add a NEW ledger key rather than repurposing food_in_bag (accrual.js:3158).
- Keep retreatFalls/retreatFoodless in the stored receipt (away-receipt.js:65-71 plus hr_apply c_receipt_keys).
- Stop coercing hadFood to false (away-receipt.js:157).
- Needs: Security GO (hr_apply/hr_state_of bodies), a §4 self-check, a schema-drift replay, and an edge redeploy (core is packed; the in-page payload guard is red until then). AWAY-1 parity: the attended resolveDeath and away simulateSpan paths both populate it.
- BLOCKED behind the owed hr_state_of restatement (2026-09-22-hunt-analyzer.sql:2).
- Its client half, a key-presence reconcileLastFall feeding fallRecord() first, rides the next cut.
Hardening branch (parallel, never blocks this lane): tests/ko-sheet-invariance.mjs, a node guard that holds the record fixed and varies every NOW input (bag, combatLog, activeMonster, kills, switch, deaths_today) and asserts the event half is unchanged. Register it in .github/workflows/smoke.yml with --selftest. Also delete legacy.js:2289-2309.

11. REPORT (one table plus at most 3 sentences)
Rows: C1/C2/C3 SHAs; each new test RED@715a9b1d (first assertion) → GREEN@tip; M1-M9 (the test that went red); run-smoke EXIT plus the baseline-vs-tip red lists; lane-done EXIT; the qa/ko-sheet-truth PNG list; D1 applied (default or the ruling); the residuals from section 3 left open.
Say 'pushed to lane/ko-sheet-truth, unmerged, unplayed'. Never 'shipped'.

COORDINATOR RULING ON D1 (2026-09-26 22:20 UTC): APPLY THE DESIGN DEFAULT D1 AS WRITTEN (after the settle the sheet drops every value the server never stated; the b373 teaching tip still shows while pending). Basis: CLAUDE.md section 6. Phase 2 (server-owned last_fall, lane C) is NOT this lane.
