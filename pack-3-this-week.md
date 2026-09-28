# 3. This Week: the week's tally on Home, plus honest 'today' figures in the hearth band

VERDICT: GO-WITH-CHANGES | class A: true | est 1.5 h

PLAYER VALUE: There is no weekly rhythm anywhere a player can see. The welcome card expires after 30 minutes and the Hunt Analyzer covers 24 hours. Yet the server already computes this ISO week's count for all ten weekly counters on every hr_goal_state call, and the global quest strip refreshes that into one cache every 30 seconds (legacy.js:17994-18032, :18435, :18680).

Meanwhile the Home hearth band's 'Kills' and 'Harvest' are device-local snapshots of browser counters. Harvest reads stats.cropsHarvested, which only companions.js writes (profile-launchpad.js:94-100, :130-132; home-dashboard.js:1271-1272, :1325-1337). The band is also the screen every player sees first each day.

After this pack, Home gains a 'This week' card that tells a player in days 7-30 what kind of week they are having, for example 'A woodcutter's week so far…', with the realm's own counts. The band's Kills and Gold figures become the realm's figures for today.

PROBLEMS TO FIX IN THIS LANE (each is a condition):
- P1 (High, guard) | WEEK-4 as specified imports tests/lore-notes.mjs for labelValues | CONFIRMED by a probe in a scratch copy of b559: lore-notes.mjs runs `main().then(code => process.exit(code))` at module top level (tail of file). The importer's own assertions never ran, and it exited 0 where it should have exited 7. Under --selftest, lore-notes' selftest ran instead of the importer's. Trigger: any data defect. Blast: the whole this-week guard reads green whatever the data says. Existing tests would not catch it. | Fix: copy the vocab derivation locally (COMPANION_LABELS in src/render/companion-lines.js + KEY_LABEL in src/features/homestead.js + the 10 EXTRA words, as lore-notes.mjs:37-48,196-200 does). Never import another tests/*.mjs guard. A selftest plant of 'speed' must go red.
- P1 (High, lane-done red) | The pack names .github/workflows/smoke.yml but not tests/ci-shape.baseline.json | CONFIRMED by reading tests/ci-shape.mjs: CI-SHAPE-6 fails on any unregistered command. The new step after 'Hearth Codex claims' (smoke.yml:2601-2606) also sits on the anchor the batch-3/4 content lanes used, so batch-5 siblings would conflict there. | Fix: append the two commands to the run block of the existing 'Quest reward parity' step (smoke.yml:2560-2564, client-guards job). Then run `node tests/ci-shape.mjs --write`: the baseline diff must be exactly 2 lines after baseline :184. In-flight hunks do not overlap: smoke.yml 375/1411/2151/2307 and baseline 17/83/143/157 (f1, f2f3, world-tick, next).
- P2 (Med, section 6) | legacy.js:18022-18025: _srvGoals is never cleared when a sync fails (the else branch and the .catch leave the map) | CONFIRMED by reading. Trigger: the sync fails or the tab is throttled across 00:00 UTC or Monday. 'Kills today' and the weekly rows then show the previous period's server numbers indefinitely, labelled 'today' or 'since Monday'. Blast: self only, but the browser says X while the server says Y. | Fix: peek returns null when Date.now()-_srvGoalsAt >= 120000, so the cell shows the pending dash. Residual accepted: up to 30 s after a rollover, the same staleness the Quests modal already has.
- P3 (Med, display integrity) | The proposed Object.freeze(m) at :18022 is shallow | PLAUSIBLE. Each entry {have,target,complete,claimed} is the object that isComplete/isClaimed read (legacy.js:18055-18075). A consumer holding peek() could mutate one and flip a Claim button. hr_claim_goal still verifies server-side, so the blast radius is self and cosmetic. | Fix: wrap the entry literal at :18018-18021 in Object.freeze({...}) in place (net 0 lines; no writer of entries exists, checked by grep). WEEK-D proves the deep freeze.
- P4 (Med, guard) | WEEK-1/WEEK-2 regex over modal-goal-claims.sql | CONFIRMED by running it: a naive `('<id>', true,` scan of the whole file returns 15 weekly hits, because the section-9 self-check fixtures such as ('ok', true, and ('kill_any', true, also match. | Fix: strip /*...*/ and -- comments, slice the single `insert into public.hr_goal_rewards ... ;` block, and parse only that. This yields exactly 10 weekly and 9 daily ids (verified). Assert those counts for non-vacuity.
- P5 (Low-Med, section 6 residual in the same band) | 'XP today' stays at home-dashboard.js:1326/1334 and prints '0' when unknown. getTodayDelta returns zeros when the snapshot is refused (profile-launchpad.js:118-121). Its baseline is G.daily.snapshot, and 'daily' is on RESIDUE_FIELDS (client-state.js:116). Its window is LOCAL midnight (toDateString, :51), next to two UTC realm cells | CONFIRMED, pre-existing. | Fix in lane: the XP cell renders the pending dash when !today or balKnown('gold') is false; the UTC title goes on the two server cells only. Residual: the XP baseline and its local-day window need a server counter, so that follow-up is not Class A.
- P6 (Med, wrong gate) | Play gate 'agree with the Quests modal's weekly bars' | CONFIRMED: under ruling R1 the modal displays monotonic predicted progress, max(prev, confirmed, min(predicted, target)) (legacy.js:18113-18130; smoke companions-claims-and-renown.js:2316-2320). It can read ahead of the server and hold at its high-water. The gate would false-fail, or tempt the lane into reading the predicted seam. | Fix: compare the card to HearthriseGoalState.peek() and to modal rows that are not 'Confirming...'. WEEK-7 forbids __hrGoalDisplay, getProgress, localProgress, *ForDisplay( and G. in the feature. Residual: the modal and the card visibly differ for about one span-sim cycle (the modal's prediction is pre-existing).
- P7 (Med, missing regression) | The band fix (Kills was a G.stats delta with a G.stats.kills lifetime fallback; Harvest was G.stats.cropsHarvested, written only at companions.js:690; all residue) has no test that fails without it | CONFIRMED. The pack's in-page tests exercise only the pure module. | Fix: WEEK-C renders Home with HearthriseGoalState stubbed to null: the 'Kills today' cell must be .bal-pending and no 'Harvest' cell may exist. This is RED on 467dcf90. WEEK-8 is a text guard that the band no longer reads today.kills, today.harvested or G.stats.
- P8 (Low, UX honesty) | The h3 'This week' repeats The realm's world-event row 'This week' directly above it (home-dashboard.js:1697). 'Gold today' reads as a net balance change, but the figure is gross ledger inflow: sum of gold>0 rows, including goal payouts, sales and refunds (modal-goal-claims.sql:606-611) | CONFIRMED. | Fix: h3 'Your week'; band label 'Gold earned' with title 'Earned since midnight UTC, as the realm counts it; spending is not taken off'.
- VERIFIED CLOSED | Edge and server | Ran `node tools/pack-edge.mjs hr-accrue --hash` on a b559 snapshot: 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f, exit 0. pack-edge walks the static import graph, and no packed module can reach src/data/this-week.js or src/features/this-week.js. No RPC, migration, catalogue, price, XP or reward change. hr_goal_state `have` is uncapped and server-computed (modal-goal-claims.sql:583-640), with no new call (rate bucket 120/min untouched). Residual, bounded to self-display: the ev:kill_any daily is client-influenced within hr_bounty_kill_cap via hr_credit_kills' bounty-free branch.

---

LANE lane/content-b5-3-this-week: "This Week" (Class A, client-only)
Branch lane/content-b5-3-this-week from origin/release/b559 at 467dcf90. Every new ESM import uses ?v=559 (none under tests/**). The edge hash must stay 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f. Never deploy. Never push main or next. Never commit docs/reports/visual-qa/findings.json. Never touch tests/live-hash-drift.baseline.json. No git stash (commit WIP on the branch). Run --write only for ci-shape; never on the monolith, comment, css or test-file ratchets. Add no b\d{3} comment anywhere (CR-3 counts the whole corpus). No hex colours, no new CSS, no new overlay, no call to hr_goal_state.

WHAT IT IS. Home gains a "Your week" card built from the server's ISO-week goal counters. The hearth band's Kills and Harvest cells were residue-derived (G.stats deltas; Harvest is written only at companions.js:690). They become the realm's "Kills today" and "Gold earned". Source: the one existing cache, _srvGoals (legacy.js:17994), which hr_goal_state fills and the quest strip refreshes every 30 s (legacy.js:18435, :18680). A missing or unknown figure renders the pending dash (window.HearthriseBalance.countMarkup(null), class bal-pending), never 0.

FILES
1. src/legacy.js. Net 0 lines: wc -l stays 18730, and the monolith ratchet reads 18731.
   (a) :18018-18021: change the entry literal to `m[...] = Object.freeze({ have: ..., target: ..., complete: ..., claimed: ... });`.
   (b) :18022: `_srvGoals = Object.freeze(m); _srvGoalsAt = Date.now();`.
   (c) Add one line after :18032: `window.HearthriseGoalState = { peek: function(){ return goalsArmed() && _srvGoals && (Date.now() - _srvGoalsAt) < 120000 ? _srvGoals : null; } };`
   (d) Delete one stale line of the :17983-17993 header, preferring one carrying a b-number, and keep the comment coherent.
2. NEW src/data/this-week.js: plain data, no imports.
   - THIS_WEEK: exactly these rows ({goal, label, lead}), in this order:
     - wk_kills 'Monsters slain' 'A hunter’s week so far: the paths out of the valley are quieter than they were on Monday, and the lodge has noticed who did it'
     - wk_logs 'Logs cut' 'A woodcutter’s week so far: the woodpile has climbed past the window, and the stove will not go hungry for a long while yet'
     - wk_gather 'Ore mined' 'A miner’s week so far: the ore heap by the forge stands taller than the smith, and the hill is a little lighter than it was'
     - wk_cook 'Dishes cooked' 'A cook’s week so far: the kitchen fire has not gone cold since Monday, and nobody in camp can remember their last plain supper'
     - wk_smith 'Smithing jobs done' 'A smith’s week so far: the anvil has rung from Monday on, and half the camp can tell the hour by the sound of your hammer'
     - wk_craft 'Crafts finished' 'A crafter’s week so far: shavings on the floor, thread on the sleeve, and a bench that has barely had a moment to cool'
     - wk_harvest 'Crops harvested' 'A farmer’s week so far: the baskets keep coming in from the plots, and the root cellar has started to run short of shelf'
     - wk_rare 'Rare drops' 'A lucky week so far: the rarer things keep turning up at the bottom of your pack, and the old hunters have begun to ask where you go'
     - wk_gold 'Gold earned' 'A merchant’s week so far: coin has been coming in faster than you can stack it, and the purse strings are wearing thin'
     - wk_levels 'Levels gained' 'A scholar’s week so far: something new has clicked into place every few days, and you can feel the difference in your hands'
   - THIS_WEEK_QUIET = 'The week is still young; everything you fight, cut, mine, cook and make before Monday comes round again is counted here'.
   - THIS_WEEK_TODAY = [{goal:'kill_any', label:'Kills today'}, {goal:'gold_500', label:'Gold earned'}].
   - All leads are 118-132 chars and were checked charset- and stat-word-clean. Fishing has no weekly counter, so it stays absent.
3. NEW src/features/this-week.js: ESM that imports the data, has NO named exports, and publishes window.HearthriseThisWeek = {live, view, cardHtml, card, todayCells} at eval.
   - live(): returns window.HearthriseGoalState.peek(), or null.
   - view(map): null gives {known:false}. Otherwise:
     - Rows are the THIS_WEEK entries whose map['w:'+goal] has a finite have > 0 and target > 0.
     - Sort by have/target descending; ties keep THIS_WEEK order; keep at most 6 rows.
     - lead = the top row's lead if its ratio is >= 0.25, else QUIET.
     - A missing key is absent, never 0.
   - cardHtml(v): existing Home classes only:
     - `<div><div class="hd-h"><h3>Your week</h3></div><div class="hd-rows">`
     - an .hd-card.hd-mini line 'Since Monday, midnight UTC'
     - an .hd-card with .bd .s containing <em>lead</em>
     - each row as .hd-card.hd-duo, with .bd .t = label and .when = countMarkup(have).
     - Unknown state: one .hd-duo row labelled 'So far' holding countMarkup(null). Known with no rows: the QUIET line only.
     - All text goes through an HTML escaper; numbers only through countMarkup.
   - card(): cardHtml(view(live())) inside try/catch.
   - todayCells(map): [{label, html}] for THIS_WEEK_TODAY, from map['d:'+goal].have, pending when unknown.
   - Never reads G or window.G, never names hr_goal_state, goalState(, __hrSyncServerGoals, __hrGoalDisplay, getProgress, localProgress or *ForDisplay(.
4. src/features/home-dashboard.js
   - :1269-1272: delete the `kills` and `harvest` locals (today.kills, G.stats.kills, today.harvested, today.gathered).
   - XP cell: show the pending dash when !today or (typeof balKnown==='function' && !balKnown('gold')); otherwise num(xp) as today. The b341 test at smoke/market-night-and-prices.js:2718 must stay green.
   - Cells 2-3 of both .hd-ledger (:1325-1329) and .hd-ledger-m (:1333-1337) come from `TW.todayCells(TW.live())`, with the pending dash if TW is absent. Those two .hd-led divs carry title="Since midnight UTC, as the realm counts it"; the XP cell carries no such title.
   - One line immediately before `// Upkeep` (:1707): `try { var TW2 = window.HearthriseThisWeek; if (TW2 && typeof TW2.card === 'function') html += TW2.card(); } catch (e) { /* display only */ }`.
   - Keep comments to a few lines (CR-1 marginal).
5. src/main.js: one line after :460: `import './features/this-week.js?v=559';` (no boot() entry).
6. .github/workflows/smoke.yml: append `node tests/this-week.mjs` and `node tests/this-week.mjs --selftest` to the run block of the EXISTING step 'Quest reward parity — data, client and server agree, every id real' (:2560-2564), plus a comment of 3 lines or fewer above it. Do not add a new step.
7. tests/ci-shape.baseline.json: only via `node tests/ci-shape.mjs --write`. The diff must be exactly +2 lines, after quest-reward-parity --selftest.
8. NEW tests/this-week.mjs (Node, text + data + tools/pack-edge.mjs `pack`). NEVER import another tests/*.mjs: importing tests/lore-notes.mjs runs its gate and process.exit()s the importer (proven).
   - WEEK-1: strip /*..*/ and -- comments from supabase/migrations/2026-08-23-modal-goal-claims.sql and slice the single `insert into public.hr_goal_rewards ... ;` block. Parse `\('([a-z0-9_]+)',\s+(true|false),`. Assert 10 weekly and 9 daily ids (non-vacuity), and THIS_WEEK ids == the weekly set.
   - WEEK-2: THIS_WEEK_TODAY goals are all in the daily set.
   - WEEK-3: labels are 3-24 chars of /^[A-Za-z' ]+$/ and unique.
   - WEEK-4: leads and QUIET are:
     - 100-140 chars, matching /^[A-Za-z ,.;:'’!?—-]+$/u, with no digit and no trailing '.';
     - unique;
     - free of stat words, from a vocab derived LOCALLY: COMPANION_LABELS values + homestead KEY_LABEL values + xp, percent, damage, chance, bonus, crit, drop rate, gold find, yield, speed, matched with the (^|[^A-Za-z])w($|[^A-Za-z]) rule;
     - not equal to any value in src/data/lore-notes.js, lucky-rumours.js, homestead-lore.js, charm-lore.js, monster-notes.js or item-descriptions.js.
   - WEEK-5: no file in pack('hr-accrue') has an origin or content naming 'this-week'.
   - WEEK-6: the feature text (comments stripped) contains no hr_goal_state, goalState(, __hrSyncServerGoals or rpc(.
   - WEEK-7: the feature text has no /\bG\s*[.\[]/, window.G, __hrGoalDisplay, getProgress, localProgress or ForDisplay(.
   - WEEK-8: home-dashboard.js contains no today.kills, today.harvested, today.gathered, G.stats.kills or >Harvest<, and calls todayCells in both ledger blocks.
   - WEEK-9: legacy.js has the HearthriseGoalState line containing `_srvGoalsAt` and `120000`, plus `_srvGoals = Object.freeze(m)` and `Object.freeze({` on the entry.
   - --selftest: a clean arm GREEN, and one plant per WEEK id caught BY ITS NAMED id: add wk_fish; TODAY goal wk_kills; a label with a digit; a lead with 'speed'; a lead with '5'; a packed origin src/data/this-week.js; feature 'goalState('; feature 'G.stats'; home 'today.kills'; legacy without 120000. Also 2 negative controls that stay green (a comment naming hr_goal_state; a whitespace edit).
   - Exit codes: 0 green, 1 red, 2 harness.
   - RED-before: commit the guard first. On that commit, `node tests/this-week.mjs` must exit non-zero; record the code. GREEN-after: exit 0 for both the plain and the --selftest run.
9. src/features/smoke/quests-chronicle-and-bonus.js: 4 tests inserted immediately BEFORE the tryRun holding :2717 ('no quest strip'), NOT at the file tail. Each test is 20 code lines or fewer, writes nothing to G, and restores in finally.
   - WEEK-A: view(null).known===false; cardHtml(view(null)) contains bal-pending and no digit; both todayCells(null) are pending.
   - WEEK-B: fixture {'w:wk_logs':{have:180,target:250}, 'w:wk_kills':{have:30,target:100}, 'd:kill_any':{have:12,target:10}, 'd:gold_500':{have:1520,target:500}}. Expect: lead === the wk_logs lead; rows [wk_logs, wk_kills]; cells equal (12).toLocaleString() and (1520).toLocaleString(). Also {'w:wk_rare':{have:1,target:5}} gives lead === QUIET.
   - WEEK-C (regression, RED on 467dcf90): swap window.HearthriseGoalState to {peek:()=>null}; showTab('profile'); HearthriseHome.render(). The .hd-ledger 'Kills today' cell must have .bal-pending, and no .hd-led may read Harvest. Then the fixture peek: the cell shows (12).toLocaleString().
   - WEEK-D (seam): stub clientMayWriteRecordField (armed) and HearthriseGoalClaim {isSignedIn:()=>true, goalState: a resolved wk_logs row}, following smoke/companions-claims-and-renown.js:2322-2330. Await __hrSyncServerGoals. Assert Object.isFrozen on both the map and m['w:wk_logs']. Then Date.now +121000 gives peek()===null; restore Date.now. __hrSyncServerGoals.reset() gives peek()===null.

GATES (paste the real exit codes)
- `node tools/pack-edge.mjs hr-accrue --hash` prints 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f.
- `node tests/this-week.mjs` and `node tests/this-week.mjs --selftest`: 0/0 (and the RED-before code).
- `node tests/ci-shape.mjs`: 0. `node tests/guard-hygiene.mjs`: 0.
- `wc -l src/legacy.js` is 18730.
- `git merge-tree --write-tree HEAD origin/next` and `git merge-tree --write-tree HEAD origin/lane/settle-before-mutate-f2f3` both exit 0.
- Merge origin/release/b559 into the branch yourself before reporting.
- `node tools/lane-done.mjs`: paste its last line.
- Do not run the full in-page suite, visual-qa or run-ci-local; the Coordinator runs them at the cut.
- Proof PNGs of Home (card + band) at 1280x800 and 922x423, one signed-in and one pending: commit them ONLY to a separate branch qa/content-b5-3-this-week.
- Play check (local build against the live server, QA account): kill and chop, then within 30 s the card and band equal HearthriseGoalState.peek(). Compare with the Quests modal only on rows NOT reading 'Confirming...' (the modal shows predicted progress by ruling R1).

ACCEPTED RESIDUALS (state them in the report)
- Up to 30 s of previous-period figures after a UTC rollover (the same as the Quests modal).
- XP today stays residue-baselined on a local-midnight window; a follow-up needs a server counter.
- The modal can read ahead of the card for about one span-sim cycle.
- 'Gold earned' is gross ledger inflow.
- The daily ev:kill_any counter is client-influenced within hr_bounty_kill_cap; it is shown to self only.

Hot files shared with batch-5 siblings: home-dashboard.js, main.js, the quests-chronicle smoke file, smoke.yml, ci-shape. If a sibling lands first, merge it into this branch yourself, re-run the gates, and regenerate ci-shape with --write (never hand-merge it).
REPORT: one table plus at most three sentences.
