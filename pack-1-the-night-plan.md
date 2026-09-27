# 1. The Night Plan: why you fall all night, and the fix, before you leave

VERDICT: GO-WITH-CHANGES | class A: true | est 2 h

PLAYER VALUE: This removes the day-2 wall. From day 2 every fighter is out of food, because the starter shrimp runs out in session one (start-kit.js:95). The screens they read before logging off still describe Recovery rev.1, where a fall ended the fight:
- activity chip 'away: until you fall' / 'nobody eats for you without Auto-Eat' (legacy.js:11485-11489)
- Fight Stats 'then you fall and the fight ends' (combat-render.js:203)
- Tonight strip '…the night ends in recovery' (set-the-night.js:359-361)

The return cards name the cause but offer only Continue. The QA heroes lay knocked out for 11h51m and 11h36m. After this pack the Fight screen tells the player before they leave: 'you fall about 11 times against Slime and spend about 7h of the night knocked out, earning nothing', with one-tap doors (Buy food / Cook before you go / Gather tonight instead / Turn Auto-Eat back on). The morning card leads with the fix instead of 'the forecast held'.

PROBLEMS TO FIX IN THIS LANE (each is a condition):
- P1 | CONFIRMED | HIGH (§6) | set-the-night.js:186-235 combatForecast. The JSON clone of G never seeds deathsTodayBefore, deathsLifetimeBefore or recoveringUntilMs. As a result resolveDeath (combat-sim.js:259-264) prices the Recovery ladder off G.stats.deaths, which is a client-authored RESIDUE tally (client-state.js RESIDUE 'stats'; legacy.js:12357/12391). The server prices it off deaths_today and deaths_lifetime (accrual.js:1912-1913). Node proof on c3ac50ec (foodless, consecFalls 0): at L3 vs goblin the clone with stats.deaths=20 gives 128m down and a retreat 129m in; seeded the way the server seeds it (today 0, life 30) it gives 2m and 3m in. At L6 it is 320m vs 30m. Every {down} and {span} the pack prints is off by up to hours, in either direction. Blast radius: self only. No test catches it, because the NIGHT tests feed literal shapes. Fix plus the NIGHT-5 regression are in the brief.
- P2 | CONFIRMED | MED | The pack's why_class_a claim 'Every count is a server projection' is false. {falls}, {down}, {span} and {full} come from a client engine run on a clone with one fixed seed. They are allowed only under §6's prediction clause: never spent or gated on, re-derived each envelope, worded 'about'. Separately, the 2 s poll re-runs simulateSpan from a browser timer. tests/no-new-prediction.mjs:47-48 defines exactly that as prediction, and the 2026-09-16 ruling (LIVE_WORLD_BRIEF.md:66) forbids new prediction. The name-based census does not detect this (it exited 0). Fix: recompute only on the server-driven bag stamp (G._bagFromServerAt, accrue.js:4822), at most once every 30 s; the poll only repaints. The Coordinator should record this as an extension of the shipped advisory forecast.
- P3 | CONFIRMED | MED | night.vigour and vigourFullMs are a hand-written second copy of the server's Vigour rules (hunt.js vigourSplit, accrual.js:2943-2991). The server charges Vigour on grantMs (wall clock, including time knocked out), per settle window, against the server's day_key. The pack's formula caps by earning ms, which is the wrong unit, and uses the client clock for midnight. The same rail already mounts the server-stated Vigour block (#fsm-vigour, vigour-mount.js). The NIGHT-4 spec is unfinished ('3600000 + 26*60000*…'). Fix: drop the line, the function, the test and the memo key.
- P4 | CONFIRMED | MED (§6 pending mark) | The chip fallback awayFightSustains() (legacy.js:11339-11348) reads G.inventory before bagHydrated. At that point the bag is the fresh-G factory literal cooked_shrimp:20 (set-the-night.js:311-320). The fallback also never reads the server Auto-Eat switch. So it would say 'pays away' to a player whose server switch is off, and 'away: no food' to one who holds food. Fix: show a pending mark until the memo exists. Same class in combat-render.js:205-211, where num(G.inventory[foodId]) is printed before hydration; this lane edits that function, so it gates it too.
- P5 | CONFIRMED | MED | night.chipNoFood and night.statsFall say a fallen hero 'stand[s] back up and fight[s] on'. That is false for exactly the players who read it: RETREAT_FOODLESS_FALLS=3 (away.js:478, 495-505) ends the run after three falls in a row with an empty bag, attended and away (resolveDeath is shared). Reworded lines are in the brief.
- P6 | CONFIRMED | MED | Door and branch logic. (a) 'Turn Auto-Eat back on' ignores ownership; mirror death-sheet.js:691-695 (owned and the server switch === false). (b) The retreat branch comes before fallsOff, so a player who owns Auto-Eat, has food, has the switch off and retreats never gets the door. The door must not depend on which sentence is shown. (c) fed and fallsFed claim the food is eaten; require the forecast's foodEaten > 0. (d) morningOutmatched ('even after eating') would fire when hadFood is true but Auto-Eat was off, and when hadFood is undefined; require autoEat.enabled===true && hadFood===true. The summary has no foodEaten (accrue.js:5251-5400). (e) The welcome card's Auto-Eat door must read the current server switch, not the receipt's.
- P7 | CONFIRMED | HIGH for the gate | Missing file: src/features/smoke/market-night-and-prices.js pins the copy this pack deletes: :722 /carry you/, :724-727 'then you fall and the night ends in recovery.', :896 '^Tonight: with nothing to eat you last', and test b342-2 at :3451-3495 ('until you fall' / 'pays away'). The in-page suite goes red, and a red in-page test is P1. That file has 1.0 comment line of CR-1 headroom (measured).
- P8 | PLAUSIBLE, dormant | LOW | The server stops a hunt on stance and stop orders (hunt.js STANCES careful falls:2; evaluateStop; accrual.js:2795-2835). The clone never stops. No client UI sets those orders today (renderHuntPanel is never mounted). Fix: suppress counts whenever G._hunt carries a non-default stance or any stop rule.
- P9 | PLAUSIBLE | LOW-MED perf | The memo key includes total food, so every auto-eat meal during an attended fight re-runs an 8 h simulateSpan: 12,000 ticks, 20-37 ms in node on a lean ctx, and more in the browser with the full ctx plus a JSON clone of G. That repeats on a 2 s poll on the most-used screen. The P2 key fixes it.
- P10 | CONFIRMED | hygiene. set-the-night.js is a classic script (index.html:1212), so it cannot import signposts; it must read window.HearthriseSignposts at call time and must not keep the old literals as a fallback. boot('signposts') is at main.js:532, after vigour-mount at :529, so night-plan.js should import fill directly. The extra fields added to remember() have no reader. The optional death-sheet.js edit adds coupling and should be dropped. Guards the pack does not name: dead-css, no-client-copy-of-projection RAW-READ (no G.autoActions reads), window-globals-exist, dead-exports (export only setupNightPlan). No standing guard stops the rev.1 copy coming back, although this is the class's second breakage. The strings-only scan finds exactly legacy.js:11487, combat-render.js:203 and set-the-night.js:361 (proof run done).
- P11 | CHECKED CLEAN | origin/set/b559 has moved from 05fba6a3 to c3ac50ec (companion-procs-authority merged). On c3ac50ec: pack-edge --hash = 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f (exit 0). None of the pack's 12 paths is among the 85 packed origins, and signposts.js is not packed (SIGN-7). The pack adds no server-owned row or value. Its only server write is the existing ownership-gated hr_set_auto_eat, called through HearthriseAuto.setEat. Blast radius is self only. Guards green on the extract: signposts, no-new-prediction, no-client-copy-of-projection, monolith, comment-ratio and test-file (all exit 0). Conflicts: the in-flight ledger-rung-unknown-zero lane edits legacy.js:11446 (same refreshActivityBar, 38 lines above the chip; no overlapping hunk), home-dashboard.js:1742 and _harness.js. rankup-overlay-show is disjoint. phone-rail, cook-collect, companion-procs and timberline are already in the base. Out of scope and logged: legacy.js:13485 _ateAll reads _off.foodEaten, which summaryFromAway never carries, so the 'You ate every provision' row is dead code. It needs an accrue.js lane.

---

LANE: lane/content-b4-1-night-plan. Security and Systems verdict: GO-WITH-CHANGES, CLASS A, with every change below required.

BASE
- Branch from origin/set/b559 at the SHA the Coordinator names. The review was done at c3ac50ec; the tip has moved past 05fba6a3.
- Every new import takes ?v=<BUILD.cache in src/build-info.js at that SHA>. That is 558 at c3ac50ec.
- Work in the worktree only and commit on the branch.
- Never: deploy, push main or next, touch the DB, git stash, edit tests/live-hash-drift.baseline.json, or commit docs/reports/visual-qa/findings.json.

GOAL
Before a fighter logs off, show what the server's own rules will do to tonight — falls, time knocked out, retreat — with one-tap doors, and have the morning card lead with the fix. The client adds no server value and no edge file.

1. FORECAST FIDELITY (src/features/set-the-night.js). Without this the pack's numbers are wrong.
a) Add a pure function cloneForForecast(G, server) and publish it on HearthriseSetTheNight.
   - Take the JSON clone as today.
   - Set clone.stats = {...clone.stats, deaths: 0}.
   - Set clone.deathsTodayBefore = server.deathsToday and clone.deathsLifetimeBefore = server.deathsLifetime.
   - Set clone.recoveringUntilMs = server.recoveringUntilMs.
   - Set clone.consecFalls = server.consecFalls when it is a number; otherwise delete the key.
   - combatForecast passes {deathsToday: AC.deathsToday(), deathsLifetime: AC.deathsLifetime(), recoveringUntilMs: AC.recoveringUntilMs(), consecFalls: G.consecFalls}.
   - Why: resolveDeath today prices the ladder off the client residue tally G.stats.deaths. Measured: the forecast says 128m knocked out where the server charges 2m.
b) Add these fields to the forecast object: deaths, downMs (=out.recoverMs), stoppedBy, retreatMs, retreatFalls, foodEaten, autoEatOff, numeric.
   - autoEatOff = HearthriseCore.autoEat.autoEatTier(G.traits||{})>0 && HearthriseAccrual.serverAutoEatSettings().enabled===false.
   - numeric = typeof G.consecFalls==='number' && no hunt orders. "No hunt orders" means G._hunt is absent, or its stance is null or 'steady' and its stop is null or empty.
   - spanMs, allNight, kills, foodQty and foodName keep their current meanings.
   - Leave remember()'s stored shape unchanged.
c) Add memo(G) and publish it. It returns the last forecast and recomputes only when BOTH hold: the key changed, and at least 30 s have passed since the last compute.
   - Key: [G._bagFromServerAt, G.activeMonster, UTC hour, JSON(G.equipment), HearthriseAuto.eatEnabled(), eatFoodId(), eatThreshold(), G.consecFalls, AC.deathsToday(), AC.deathsLifetime(), AC.recoveringUntilMs()>Date.now(), JSON(G._hunt)].
   - The memo lives in the module, never on G.
   - strip() uses memo().
   - Never read G.autoActions.
   - No timer may drive the engine.
d) Delete the old literal sentences; do not keep them as a fallback. sentence() reads window.HearthriseSignposts.fill and SIGNPOSTS at call time and returns null when they are absent. Keys must be string literals (SIGN-1).

2. COPY (src/data/signposts.js). Every line below was checked by node against SIGN-3 and SIGN-5.

Lines:
- 'night.fed': 'Tonight: your {food} carry you through the night against {foe}.' vars [food, foe]
- 'night.hold': 'Tonight: you hold out through the night against {foe}.' vars [foe]
- 'night.fallsOnce': 'Tonight: you fall once against {foe}, stand back up and fight on through the night.' vars [foe]
- 'night.fallsFed': 'Tonight: even with your {food} you fall about {falls} times against {foe} and spend about {down} of the night knocked out, earning nothing.' vars [food, falls, foe, down]
- 'night.fallsHungry': 'Tonight: with nothing to eat you fall about {falls} times against {foe} and spend about {down} of the night knocked out, earning nothing.' vars [falls, foe, down]
- 'night.fallsOff': 'Tonight: Auto-Eat is switched off, so your {food} stay in the bag while you fall about {falls} times against {foe}.' vars [food, falls, foe]
- 'night.fallsUncounted': 'Tonight: you fall against {foe} and lie knocked out for part of the night, earning nothing while you are down.' vars [foe]
- 'night.retreat': 'Tonight: you fall {falls} times in a row against {foe} and pull back to camp about {span} in; the rest of the night earns nothing.' vars [falls, foe, span]
- 'night.cookable': 'You are carrying {raw} you can cook, and the fire turns it into food before you go.' vars [raw], door {skill:'cooking', label:'Cook before you go'}
- 'night.gatherInstead': 'Gathering never falls and spends no Vigour, so a night at a tree, a rock or a fishing spot earns from start to finish.' door {tab:'skills', label:'Gather tonight instead'}
- 'night.morningFloor': 'You spent more of the night knocked out than fighting. Food in the bag turns that time on the floor into fighting.'
- 'night.morningOutmatched': 'You spent more of the night knocked out than fighting, with Auto-Eat on and food in the bag. A softer foe or better food keeps you standing.'
- 'night.chipFed': 'Auto-Eat and the food in your bag keep this fight running while you are away.'
- 'night.chipNoFood': 'No food for Auto-Eat: a fall while you are away knocks you out and earns nothing, and a run of falls on an empty bag sends you back to camp.'
- 'night.statsFall': 'After a fall you are knocked out and earn nothing, then fight on; a run of falls on an empty bag sends you back to camp.'

Labels:
- 'night.heading': 'Tonight'
- 'night.buyFood': 'Buy food at the Local Shop'
- 'night.autoEat': 'Turn Auto-Eat back on'
- 'night.chipAway': 'pays away'
- 'night.chipDown': 'away: you fall'
- 'night.chipNoFoodLabel': 'away: no food'
- 'night.chipPending': 'Tonight is not forecast yet'

DROPPED from the pack: night.vigour, vigourFullMs and NIGHT-4. They were a second copy of hunt.js vigourSplit and accrual.js:2943-2991, and the rail already mounts the server-stated Vigour block.

3. WHICH SENTENCE. sentence(f) is pure. Take the first rule that matches:
1. !numeric and (deaths≥1 or retreat) → fallsUncounted
2. stoppedBy==='retreat' → retreat, with falls=retreatFalls and span=fmtSpan(retreatMs)
3. deaths 0 → fed if foodEaten>0, otherwise hold
4. deaths 1 → fallsOnce
5. deaths≥2 and foodEaten>0 → fallsFed
6. deaths≥2 and foodQty 0 → fallsHungry
7. deaths≥2 and foodQty>0 and foodEaten 0 and autoEatOff → fallsOff
8. anything else → fallsUncounted

Variables: {food}=countOf(foodQty, foodName), {foe}=targetName, {falls}=deaths, {down}=fmtSpan(downMs). The bench and gather sentences stay as they are.

4. SURFACES. NEW src/features/night-plan.js is an ES module.
- It imports fill from ./signposts.js and SIGNPOSTS from ../data/signposts.js.
- It exports ONLY setupNightPlan. Everything else goes on window.HearthriseNightPlan = {fightBlockHtml, doorsHtml, chipHtml, goFoodShop, refresh}.

a) Fight rail block #fsm-night.
   - Heading: night.heading.
   - Insert it into #fs-manage after the section that holds #fsm-food.
   - A 2 s poll only re-ensures and diff-repaints the block from memo(); it never computes.
   - Hide the block when !AC.bagHydrated(G) or when there is no G.activeMonster.

b) Doors. They appear under the sentence when deaths≥1 or on a retreat.
   - One delegated document listener on [data-night-act].
   - 'foodshop': setShopTab('seeds'), then showTab('shop').
   - 'autoeat': HearthriseAuto.setEat({enabled:true}), then notify. Render this door only when owned, the server switch === false and foodQty>0. Show it regardless of which sentence is displayed, including a retreat.
   - 'cook': render the night.cookable line and its door only when the server bag holds every input (HearthriseCore.artisan.recipeInputs) of a cooking recipe with req ≤ window.hrGateLevel('cooking') whose output isAutoEatable.
   - 'gather': render night.gatherInstead and its door.
   - Inside #welcome-overlay, every act first removes .show from the overlay.
   - fightBlockHtml(f, ctx) and doorsHtml(ctx) are pure, with ctx={owned, serverEatOn, cookable:{qty,name}|null}. Escape every piece of text.

c) Activity chip (legacy.js refreshActivityBar, :11484-11488).
   - Shorten the stale comment at :11466-11483 to pay for the edit. Net ≤0 lines. No new top-level function.
   - awayChip = HearthriseNightPlan.chipHtml(memo). The chip reads the memo only; it never computes.
   - chipHtml(null) → a pending span with class ab-xph ab-away plus HearthriseBalance.PENDING_CLASS, text HearthriseBalance.UNKNOWN_TEXT, and aria-label night.chipPending.
   - No falls → chipAway, with title chipFed when foodEaten>0, otherwise the sentence.
   - Falls or retreat, and foodQty 0 → chipNoFoodLabel, with title chipNoFood.
   - Falls or retreat, with food → chipDown, with the sentence as its title.
   - The chip no longer reads awayFightSustains().

d) Fight Stats awayRow (combat-render.js:202-211).
   - When not stocked: name 'Before your first fall', meta night.statsFall.
   - When stocked: print the food count only when bagHydrated; otherwise show the pending mark.

e) Home strip: same mount; it speaks the new sentence.

f) Welcome card, the _fix row at legacy.js:13503: v = (window.HearthriseNightPlan && HearthriseNightPlan.doorsHtml(ctxNow)) || ''. Build ctxNow from the CURRENT server switch and bag, never from the receipt. Net ≤0 lines.

g) Home away card (home-dashboard.js awayCardHtml, after noteHtml): add the same doors row when Number(off.deaths)≥2 or off.stoppedBy==='retreat'. Add ZERO comment lines (1.5 lines of CR-1 headroom, measured).

h) morningLine. When deaths≥2 and recoverMs>paidMs:
   - autoEat.hadFood===false → night.morningFloor
   - autoEat.enabled===true && hadFood===true → night.morningOutmatched
   - otherwise → today's line
   Do not read foodEaten; the summary does not carry it.

i) main.js and index.html.
   - main.js: import setupNightPlan and call boot('night-plan', setupNightPlan) AFTER boot('signposts').
   - index.html: add <link rel="stylesheet" href="src/styles/night-plan.css?v=NNN"> after primers.css.

j) NEW src/styles/night-plan.css.
   - Tokens only.
   - Use only the canonical mobile query: @media (max-width: 540px), (max-height: 540px) and (max-width: 1024px).
   - Every selector must be used.

Do not touch: src/core/**, packed src/data/**, supabase/**, src/net/**, death-sheet.js, companions.js, collection-log.js, activities-grid.js, renown.js, daily-reward.js, modal-sheet.js, theme-cozy.css, tokens.css, _harness.js.

5. TESTS

New in-page tests in src/features/smoke/recovery-and-auto-eat.js. Each is ≤20 code lines, uses zero G.* seeds and only pure calls.
- NIGHT-1 (AWAY forecast).
  - sentence({kind:'combat', numeric:true, deaths:11, downMs:25200000, foodQty:0, foodEaten:0, targetName:'Slime', spanMs:1800000}) contains 'fall about 11 times', 'knocked out' and 'earning nothing', and does not contain 'night ends'.
  - The retreat shape contains 'pull back to camp'.
  - The same shape with numeric:false contains no digit.
- NIGHT-2 (AWAY receipt).
  - The pack's floor case leads with 'knocked out than fighting' and does not contain 'the forecast held'.
  - A receipt with autoEat {enabled:false, hadFood:true} does NOT produce 'Auto-Eat on'.
- NIGHT-3 (ATTENDED doors).
  - fightBlockHtml(f4falls, {owned:true, serverEatOn:false}) has both 'Buy food at the Local Shop' and 'Turn Auto-Eat back on'; with serverEatOn:true there is no Auto-Eat button.
  - Clicking Buy food with showTab and setShopTab spies (restored in finally) records 'shop' and 'seeds'.
- NIGHT-5 (the regression for 1a).
  - HearthriseCore.combatSim.resolveDeath(HearthriseSetTheNight.cloneForForecast({stats:{deaths:20}, playerHp:0, playerMaxHp:30, inventory:{}}, {deathsToday:0, deathsLifetime:30, recoveringUntilMs:0, consecFalls:0}), {items: window.ITEMS}).recoverMs === 0.
  - RED before: the function does not exist.
  - Mutation proof: remove the stats.deaths reset and the result is 3840000, so the test goes red.
- NIGHT-6 (pending chip).
  - chipHtml(null) contains PENDING_CLASS and not 'pays away'.
  - A retreat shape with foodQty 0 contains 'away: no food'.

Update — never delete — the tests in src/features/smoke/market-night-and-prices.js that pin the retired copy:
- :719-727
- :896-897
- b342-2 at :3451-3495
Where a test asserts numbers, state the counters through the real door: AC.reconcileFall(window.G, {state:{consec_falls:0, deaths_today:0, deaths_lifetime:0}}), and restore the prior values in finally. Net ≤ +1 comment line in that file; trim the stale 'until you fall' prose at about :3460-3470 to pay.

Guard changes in tests/signposts.mjs:
- Add SIGN-8 RETIRED COPY. Strip comments first, then take string literals only. No such literal in src/** outside smoke may match /fight ends|night ends in recovery|until you fall|nobody eats for you/i.
- RED before: the scan run on c3ac50ec hits exactly legacy.js:11487, combat-render.js:203 and set-the-night.js:361. Paste that output.
- Add two plants: retiredCopy, which adds a planted literal and must turn SIGN-8 red; and nightKeyUnused, which removes every 'night.retreat' literal and must turn SIGN-1 red.
- GREEN after: --selftest exits 0 with 9 mutations caught.

6. GATES. Paste each exit code; call something green only when you saw its exit code.
- node tools/pack-edge.mjs hr-accrue --hash must print 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f.
- Intersect git diff --name-only <base>...HEAD with the pack('hr-accrue') origins. The result must be empty, exit 0.
- Run each of these and record its exit code:
  - node tests/signposts.mjs
  - node tests/signposts.mjs --selftest
  - no-new-prediction
  - no-client-copy-of-projection
  - dead-css
  - dead-exports
  - window-globals-exist
  - comment-ratio-ratchet
  - monolith-ratchet
  - test-file-ratchet
  - breakpoint-guard
  - css-literal-ratchet
- node tools/lane-done.mjs; its last line must read 'lane-done: all green.'
- node tests/run-smoke.mjs --only NIGHT- is a convenience, never a verdict. The record is the GitHub run on next.
- While Tyler is streaming, run no local suite and no visual-qa.
- Merge the named set SHA, or a newer origin/set/b559, into your branch yourself before reporting.
- Expected neighbour: ledger-rung-unknown-zero edits legacy.js:11446, which is in the same refreshActivityBar function, and home-dashboard.js:1742. There is no overlap as long as you stay within :11466-11488 and awayCardHtml.
- Proof PNGs at 1280x800 and 922x423, committed ONLY to qa/content-b4-1-night-plan:
  - the Fight rail with Tonight and the doors
  - the chip, pending and 'away: you fall'
  - the Home strip and the away card doors
  - the welcome card doors

7. REPORT
One table plus at most three sentences. Log, but do not fix: legacy.js:13485 _ateAll is dead code because summaryFromAway never carries foodEaten. It needs an accrue.js lane.

RESIDUAL RISK ACCEPTED
- Closed: no forged value can cross to another player.
- Bounded: the forecast is a single seeded sample on server-stated inputs, worded 'about', and graded each morning against the receipt.
- Remaining:
  - the UTC-midnight rollover of deaths_today inside the 8 h horizon is not modelled
  - party sessions are not modelled
  - the no-new-prediction classification needs the Coordinator's written call

Review notes: this was a read-only review, so no branch was merged or committed. lane-done was not run, because it replays the migration chain 14 times and is heavy during the stream. Every green cited above is an exit code I saw on the c3ac50ec extract.
