# Content pack 2: 2. Timberline: five new woodcutting stands at levels 22, 38, 52, 68 and 82

VERDICT (security/systems pre-review): GO-WITH-CHANGES | class C

## PLAYER VALUE
Woodcutting stops being the one gathering skill with a new tree only every 15 levels. There is now a new stand every 7-8 levels, and the 60-75 and 75-90 stretches (currently 104 and 377 hours with nothing new) are halved. The new stands also yield more of the logs and planks every room and property needs.

## THE CORRECTED LANE BRIEF (execute this)
LANE lane/timberline (lane C, DB + client data). BRANCH FROM origin/set/b554 (tip 9c70fa98 or newer), NOT main. Before reporting, merge the latest origin/set/b554 (or next) into this branch yourself. Work only in your worktree. Never apply to production, never deploy the edge, never edit tests/live-hash-drift.baseline.json, never use git stash. About 2 h.

GOAL: five woodcutting stands. Each yields an EXISTING log, with no new item, recipe or art. Insert them in src/data/gathering.js TREES in req order (do not append). The final 12-row order is:
normal_tree(1), oak_tree(15),
{id:'hollow_oak_tree',name:'Hollow Oak',icon:'🌳',req:22,xp:26,ms:4200,prod:'oak_log',qty:[1,1]},
willow_tree(30),
{id:'weeping_willow_tree',name:'Weeping Willow',icon:'🌿',req:38,xp:52,ms:6800,prod:'willow_log',qty:[1,2]},
maple_tree(45),
{id:'maple_grove',name:'Maple Grove',icon:'🍁',req:52,xp:78,ms:8200,prod:'maple_log',qty:[2,2]},
yew_tree(60),
{id:'elder_yew_tree',name:'Elder Yew',icon:'🌲',req:68,xp:124,ms:10800,prod:'yew_log',qty:[1,2]},
runewood_tree(75),
{id:'ancient_runewood_tree',name:'Ancient Runewood',icon:'🌲',req:82,xp:168,ms:12200,prod:'runewood_log',qty:[1,2]},
duskwood_tree(90).
Do not change any existing row. Add one comment block above the new rows. It must NOT contain build numbers (comment-ratio CR-2/CR-3). It quotes the PACED guard series, floor(xp*0.39)/pacedActionMs(ms): oak 1.2500 -> hollow 1.4881 -> willow 1.7045 -> weeping 1.8382 -> maple 2.0536 -> grove 2.2866 -> yew 2.5000 -> elder 2.7778 -> runewood 3.0435 -> ancient 3.3299 -> duskwood 3.7019. Every step clears +7.8%, and every req gap is 7 or 8.

FILES:
1) src/data/gathering.js as above.
2) NEW supabase/migrations/<authoring-date>-timberline.sql, following the 2026-09-13-deep-seam.sql §1(c)/§2 pattern. Data only: no function body, no grant, no new object, and NO xp/ms/qty in SQL (those ride the edge payload).
   §0 preconditions fail closed: hr_activities exists; hr_skills has woodcutting; oak_log, willow_log, maple_log, yew_log and runewood_log exist in hr_items.
   §1 one idempotent upsert into public.hr_activities (kind,activity_id,req_skill,req_lv,max_hp,is_boss) of ('gather',<id>,'woodcutting',22|38|52|68|82,null,false). Use `on conflict (kind,activity_id) do update ... where ... is distinct from ...` and raise notice with the number of rows moved (0 on a re-apply).
   §2 self-check, EXECUTED:
   (a) the five rows exist with exactly those values (literals restated);
   (b) count of woodcutting gather rows = 12, none has NULL req_lv, and no woodcutting req_lv holds more than one node;
   (c) the hr_items count captured at the start of the file equals the count at the end (NOT a literal 538);
   (d) PROBE as in deep-seam GATE(d): a probe character at Woodcutting 51 declaring maple_grove gets activity_locked and player_state.active_* is unmoved; CONTROL: WC 51 declaring maple_tree -> ok; WC 52 declaring maple_grove -> ok; then prove no probe row leaked.
   The header states: reversibility (delete the 5 rows, no value to claw back); order = apply -> edge redeploy -> client push, with every mis-order failing closed (unknown_node / unknown_activity, a dead tile); the economy section below.
3) supabase/migrations/2026-08-11-catalogue.generated.sql: REGENERATE with tools/gen-catalogues.mjs, never hand-edit. Result: 503 -> 508 activities, 538 items, new digest.
4) tests/schema-apply-order.json: append the new file LAST in `order`, with an _order_notes entry: 'STAGED, NOT APPLIED - Security GO required: 5 gather activity rows = 5 XP/item sources of existing tradeable logs; no item, body or grant. Apply ONLY this file (the regenerated generated catalogue is a chain record, not re-applied). Order: apply -> edge redeploy -> client push.'
5) tests/restore-census.baseline.json: hr_activities replay 503 -> 508 via `node tests/restore-census.mjs --write`. The diff must be only that pin (plus the note's count). If anything else moves, STOP and report.
6) docs/SYSTEMS_MAP.md §4: add a 'Woodcutting (Timberline)' table (req | node id | name | prod | qty | xp | ms) and one line: server half = hr_activities rows; xp/ms/yield ride the edge payload.
7) src/features/smoke/hunt-raids-and-screens.js: TIMBERLINE-1..4 after DEEPSEAM-6, with snapshotG/restoreG.
8) tests/accrual-engine.mjs: one server-path case, TIMBERLINE-S1.

ECONOMY SECTION (for the migration header and the report; all figures measured on paced ms, 20% raw vendor bid):
g/h: oak 2,250 -> hollow 2,143; willow 3,273 -> weeping 3,971 -> maple 7,714 -> grove 8,780 < yew 9,000 -> elder 12,500 < runewood 18,783 -> ancient 26,557 < duskwood 39,808.
logs/h: hollow 536, weeping 496, grove 549, elder 312.5, ancient 276.6.
Every new node's items/h, xp/h and g/h is below the current table maximum (normal_tree 750 items/h; duskwood 13,327 xp/h and 39,808 g/h), so the hr_apply clamps and hr_day_budget headroom are unchanged.
Workers: hr_worker_assign gates on the same req_lv. Crew yield scales in the same proportion (+39% yew, +41% runewood). The largest paced ms is 19,520, so WORKER_MAX_ACC_MS (900,000) is untouched.
Pacing to 99: 1,098 -> 1,066 h. The longest gap with no new stand goes from 104 h to 61 h (60-75) and from 377 h to 244 h (75-90). Do NOT write 'halved'.
Hearthfind is untouched; note that yew_tree (worldroot_seed) is now outpaced from WC 68, as a game-designer follow-up.

IN-PAGE TESTS. Harness for every test: G.inventory={} (no axe, so no double-yield or xpB), G.buffs=[], run inside P._withOfflineReplay (blessing latch), C.reseed(0xC0FFEE).
- TIMBERLINE-1: TREES has 12 rows, and the five ids sit at 22/38/52/68/82 in req order. Each prod is an existing ITEMS entry with raw===true. One doSkillAction(true) at hollow_oak_tree at WC 22 gives oak_log === 1. HearthriseActivitiesGrid.__tileForGather(node,'woodcutting') contains 'Yields Oak Log'.
- TIMBERLINE-2: __tileForGather(maple_grove) at WC 51: the class contains 'locked', the tile shows 'Level 52', and the onclick is the notify() with NO hrActivityTileClick. At WC 52: not locked, and the onclick is hrActivityTileClick('woodcutting','maple_grove',8200). Gather tiles have no `disabled` attribute; that is the artisan-bench markup.
- TIMBERLINE-3: one action at maple_grove at WC 52 gives maple_log === 2 and a woodcutting XP delta === 30 (floor(78*0.39)).
- TIMBERLINE-4 (AWAY): seeded C.skillSim.simulateSkillSpan(away:true) over 3,600,000 ms at elder_yew_tree at WC 68 -> 208 actions, XP delta === 9,984 (48 x 208), and yew_log === the exact seeded count (assert it lies in [208,416]). NO +/-5% band.
- TIMBERLINE-S1 (node, credential-free): the edge accrual over a 1 h seeded gather span at elder_yew_tree with nodes=GATHER_NODES pays yew_log > 0 and woodcutting XP = 48 x ticks. Control: the same span with elder_yew_tree removed from the index is refused as unknown_node.
- Mutation proofs (show red, then revert): delete the maple_grove row -> TIMBERLINE-2/3 red; set elder_yew req to 67 -> TIMBERLINE-1 red; drop elder_yew_tree from the migration -> the self-check (b) and catalogue-literal-drift red.
- Existing ladder guards must pass UNMODIFIED: strictly-faster xp/s, full-tier +6%, first three rungs [1,1] (normal/oak/hollow), and T1:T7 < 5:1 (measured 4.33).

GATES. Run each in the worktree and branch on its exit code; write 'green' only for an exit code you saw:
node tools/gen-catalogues.mjs --check
node tests/catalogue-literal-drift.mjs, then with --selftest
node tests/schema-drift.mjs (byte-identical second apply)
node tests/apply-order-honesty.mjs, then with --selftest
node tests/restore-census.mjs
node tests/accrual-engine.mjs
node tests/worker-accrual.mjs
node tests/world-tick-parity.mjs
node tests/hearthfind-boss-rate.mjs
node tools/pack-edge.mjs hr-accrue --hash (report the new hash; do NOT deploy)
node tools/lane-done.mjs (paste its last line)
Do NOT run the in-page suite. It runs at the cut, with a visual gate on the woodcutting screen at desktop and 922x423 (grid grows from 7 to 12 tiles).

DEPLOY ORDER (Coordinator):
1. Security review of the STAGED SQL (this brief review is not the apply GO).
2. Apply this ONE file with tools/apply-migration.mjs.
3. Read-only post-apply check: 508 activities, 538 items.
4. Edge deploy, then verify the live payload_sha256 equals pack-edge --hash.
5. The client rides the next 20:00 UTC cut.
6. live-hash-drift needs no change (no function body).

REPORT: one table (file / guard -> exit code) plus at most three sentences, including the new pack-edge hash and the CHANGELOG wording 'a new woodcutting stand every 7-8 levels; the longest gap with no new stand drops from 377 h to 244 h'.

## THE DESIGNER'S ORIGINAL SPEC (rows, rates, tests; the brief above wins where they differ)
### contents
WHAT CHANGES: five TREES rows in src/data/gathering.js, inserted in req order and not appended. Each yields an EXISTING log, the same pattern as Rich Coal Seam and Deep Verdite Seam. There are no new items, no new recipes and no art needed: node tiles paint the product's art through actIconHtml(prod).

The rows, with the paced guard xp/s (floor(xp x 0.39) / pacedActionMs) and the gain over the rung below:
- {id:'hollow_oak_tree', name:'Hollow Oak', req:22, xp:26, ms:4200, prod:'oak_log', qty:[1,1]}: 1.4881 xp/s (+19.0% over Oak 1.25). Willow is +14.5% over it. qty must be [1,1] because it becomes the third rung (b226 flood rule).
- {id:'weeping_willow_tree', name:'Weeping Willow', req:38, xp:52, ms:6800, prod:'willow_log', qty:[1,2]}: 1.8382 xp/s (+7.8%). Maple is +11.7% over it.
- {id:'maple_grove', name:'Maple Grove', req:52, xp:78, ms:8200, prod:'maple_log', qty:[2,2]}: 2.2866 xp/s (+11.3%). Yew is +9.3% over it.
- {id:'elder_yew_tree', name:'Elder Yew', req:68, xp:124, ms:10800, prod:'yew_log', qty:[1,2]}: 2.7778 xp/s (+11.1%). Runewood is +9.6% over it.
- {id:'ancient_runewood_tree', name:'Ancient Runewood', req:82, xp:168, ms:12200, prod:'runewood_log', qty:[1,2]}: 3.3299 xp/s (+9.4%). Duskwood is +11.2% over it.
Every new gap between rungs is 10 levels or less, so none owes the b390 +6% margin, yet every rung still clears +7.8%.

ECONOMY SEAT (raw logs sell at a 20% vendor bid, on paced ms). No stand out-earns the next full rung:
- Oak 2,250 g/h -> Hollow Oak 2,143 (it is an XP rung, slightly fewer logs than Oak)
- Willow 3,273 -> Weeping Willow 3,971 -> Maple 7,714
- Maple Grove 8,780 < Yew 9,000
- Elder Yew 12,500 < Runewood 18,783
- Ancient Runewood 26,557 < Duskwood 39,808

LOG SUPPLY where the rooms and properties bite: willow +21%, maple +14%, yew +39%, runewood +41% logs per hour. The Manor needs willow_plank x35, the Keep maple_plank x50 and the Castle yew_plank x70.

PACING: woodcutting time to 99 goes from 1,098 h to 1,066 h. It was the slowest gathering skill and now sits between mining (1,068 h) and fishing (1,048 h). Hours to reach each level, before -> after: 38: 5.9 -> 5.6; 60: 39.6 -> 36.9; 75: 143.7 -> 134.3; 90: 521 -> 489.

WHAT STAYS PUT: Hearthfind (normal_tree, yew_tree and duskwood_tree are untouched), and no ms changes on source nodes.

SERVER HALF: five hr_activities rows (kind 'gather', req_skill 'woodcutting', req_lv 22/38/52/68/82, max_hp null, is_boss false).

DEPLOY ORDER: Security GO, then the Coordinator applies, then the edge deploys, then the client pushes.
### files
src/data/gathering.js (TREES); NEW supabase/migrations/2026-09-27-timberline.sql (the 2026-09-13-deep-seam.sql §1(c) pattern: five activity rows, idempotent, with a §4 self-check); supabase/migrations/2026-08-11-catalogue.generated.sql regenerated by tools/gen-catalogues.mjs (503 -> 508 activities, new digest); the apply-order note (staged); docs/SYSTEMS_MAP.md trees table; src/features/smoke/hunt-raids-and-screens.js (TIMBERLINE-1..4, beside DEEPSEAM)
### tests
IN-PAGE, modelled on DEEPSEAM:
- TIMBERLINE-1: TREES has 12 rows with the five new ones at 22/38/52/68/82 in req order, and a real action at Hollow Oak at Woodcutting 22 lands exactly one oak_log. The tile names the Oak Log.
- TIMBERLINE-2: the Maple Grove tile is DISABLED at Woodcutting 51 and LIVE at 52. This is the client half of hr_apply activity_locked.
- TIMBERLINE-3: one Maple Grove action credits exactly 2 maple_log and floor(78 x 0.39) = 30 woodcutting XP.
- TIMBERLINE-4 (AWAY): a 1 h away skill-sim span at Elder Yew pays yew_log at 313 +/- 5% per hour and XP of 48 per action. This is the both-path half.

EXISTING GUARDS THAT MUST STAY GREEN untouched: b226 'every rung strictly faster', b390 'full tier +6%', b226 'first three rungs [1,1]' and 'T1 may not out-produce T7 more than 5:1' (normal 750 vs duskwood 173 logs/h = 4.3:1).

NODE: catalogue-literal-drift (+ --selftest), schema-drift replay with a byte-identical second apply, apply-order-honesty, hearthfind-boss-rate, and lane-done.

MIGRATION §4 SELF-CHECK, by executing SQL:
- the five rows exist with exact kind, req_skill and req_lv;
- the count of woodcutting gather activities = 12;
- the hr_items count is unchanged (538);
- a second apply is a no-op.
### reviewer problems fixed by the brief
- CLASS C CONFIRMED (checked in the code and with read-only queries on live). Each new row is a new source of XP and of 5 existing TRADEABLE logs (live: all 5 logs are tradeable=true). The edge pays them via GATHER_NODES, which is built from src/data/gathering.js (supabase/functions/hr-accrue/catalogue.js:32-51, accrueGather -> core simulateSkillSpan). The live hr_apply (activity_locked) and the live hr_worker_assign (level_too_low) both gate on hr_activities.req_lv, so the migration's req_lv values are the ONLY server-side level gate for players and for workers. Threats checked. CLOSED: a forged client value reaching another player (the client sends only an activity id; the edge refuses unknown nodes at set-activity.js:438; hr_apply clamps and the daily budget apply). CLOSED: deploying in the wrong order (every order fails closed, the worst case is a dead tile). BOUNDED + JOURNALLED: faucet size. Every new node's items/h, xp/h and g/h is below the current table maximum (normal_tree 750 items/h, duskwood 13,327 xp/h and 39,808 g/h), so the headroom of the per-call clamp and of hr_day_budget is unchanged. The largest paced ms is 19,520, so the worker acc bound (900,000) is untouched. Get_advisors shows nothing related (hr_activities: RLS on, read-only policy, no insert/update/delete for authenticated or anon).
- P1 MISSING GUARD FILE, CONFIRMED: tests/restore-census.baseline.json pins hr_activities "replay": 503 (line ~675). The CI step at smoke.yml:806 fails as soon as the chain rebuilds 508. The brief never mentions restore-census. The lane must re-pin it to 508 with `node tests/restore-census.mjs --write` (the diff must be that pin only).
- P1 BRANCH BASE / CONFLICT: set/b554 already changes 4 files this lane must touch: src/features/smoke/hunt-raids-and-screens.js (+206 lines, vigour/party tests), tests/schema-apply-order.json (vigour + party-view entries at the tail), tests/restore-census.baseline.json and tests/schema-drift.baseline.json. Branch from origin/set/b554, not main. Every other content pack in this batch will hit the same hunks (generated catalogue digest and counts, census replay count, apply-order tail). Integrate them one at a time and REGENERATE each file with its own tool; never merge them by hand. No functional conflict: Vigour is combat-accruer only (accrual.js ~1847), party-view only changes hr_party_view volatility, tap-targets is CSS. The woodcutting grid grows from 7 to 12 tiles (mining already renders 12), so the visual gate must cover the woodcutting screen on desktop and at 922x423.
- P1 SELF-CHECK GAPS: (a) 'hr_items count unchanged (538)' is a hard-coded literal (538 is correct on live today). If another pack lands items first, the apply raises. Replace it with a count captured at the start of the file compared to the count at the end. (b) There is no executed level-gate probe. Deep-seam §2 GATE(d) is the precedent, and req_lv is the only gate for hr_apply and hr_worker_assign. Required probe: Woodcutting 51 declaring maple_grove -> activity_locked with the pointer unmoved; control: WC 51 declaring maple_tree -> ok; WC 52 declaring maple_grove -> ok; then a leak check that no probe rows remain. (c) Add the GATE(b2) shape: no woodcutting gather row with NULL req_lv, and no woodcutting level holding two nodes. (d) Put NO xp/ms/qty values in the SQL (the deep-seam warning: an XP copy in SQL becomes a faucet).
- P1 FLAKY TEST: TIMBERLINE-4's '313 +/- 5%' band uses an unseeded [1,2] draw over 208 actions. The standard deviation is about 7.2 logs, so the band is about 2.2 sigma and the test fails about 3% of runs, and §4 treats a flake as a P1. It must be seeded (C.reseed as in away-time-and-offline.js:3166) and exact: 208 actions, XP = 48 x 208 = 9,984, and the exact seeded yew_log count (which must lie in [208,416]). TIMBERLINE-1/3 ('exactly 1 log', 'exactly 2 logs + 30 XP') also need no axe (double-yield and xpB), G.buffs=[] and the P._withOfflineReplay latch, or a blessing or buff makes them flaky too.
- P2 TEST CHECKS THE WRONG LOCK MARKUP: TIMBERLINE-2 copies DEEPSEAM-4's `disabled` check, but that is the artisan-bench markup. Gather tiles render `act-tile locked`, an `at-lock` 'Level N' label and a notify() onclick (activities-grid.js:175-202, published as HearthriseActivitiesGrid.__tileForGather). As written, the test is wrong or passes without testing anything.
- P2 NO SERVER-PATH TEST: every in-page test runs in the client. Add one credential-free case in tests/accrual-engine.mjs: a 1 h seeded gather span at elder_yew_tree with nodes=GATHER_NODES pays yew_log at 48 XP per tick. This proves the edge payload actually carries the node (it is the both-path server half). Control: remove the node from the index -> refused as unknown_node.
- P2 PLAYER-VALUE CLAIM WRONG (all other numbers reproduce exactly: xp/s, +%, g/h, logs/h, hours to 38/60/75/90, 1,098 -> 1,066 h, mining 1,068 h, fishing 1,048 h, T1:T7 = 4.33:1): the gaps are not 'halved'. The longest gap with no new stand goes from 104 h to 61 h in 60-75 (68->75) and from 377 h to 244 h in 75-90 (82->90, -35%). The CHANGELOG must say so.
- P3 LEFT OUT OF THE ECONOMY SECTION: (a) Workers. hr_worker_assign reads the same rows, so crews can be assigned to the new stands. Per-worker yield rises in the same proportion (+39% yew, +41% runewood at those levels), still bounded by crew caps and hr_day_budget. Include it in the economy section. (b) Hearthfind. yew_tree (worldroot_seed, 250 h) is now beaten on XP and logs from WC 68 instead of 75. That is a game-designer call with no security impact (a node without a row draws no RNG, so seeded replays stay byte-identical). File it; it is not in this lane's scope.
- P3 HOUSEKEEPING: docs/SYSTEMS_MAP.md has NO trees table; add a Woodcutting table under §4. New comments under src/** must not name build numbers (comment-ratio CR-2/CR-3 in lane-done), so call the guards 'strictly-faster ladder' and 'full-tier +6%', not b226/b390. Give the rows an `icon` like their neighbours. The edge payload hash changes (catalogue.js vendors gathering.js), so the in-page payload guard stays red until the Coordinator deploys the edge; the lane reports the `pack-edge --hash` value and does not deploy. Name the migration file with the date it is authored. This is pre-dispatch: the STAGED SQL still needs Security review before apply (CLAUDE.md §2).
- OUT OF SCOPE, EXISTING ADVISOR ITEMS (not caused by this pack): security_definer_view ERROR on public.market_price_history; anon can execute the SECURITY DEFINER functions beta_invite_check and hr_leaderboard; 33 functions have a mutable search_path.
