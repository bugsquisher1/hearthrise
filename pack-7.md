# Content pack 7: Journeyman's Road: six server-paid quests after the starter chain

VERDICT (security/systems pre-review): GO-WITH-CHANGES | class C

## PLAYER VALUE
When the five starter quests end (around hour 2), six more pick up: smith, craft, cook, gather, hunt, farm. Each pays gold and a tool or key that points at the next step: an iron pickaxe, an iron axe, an oak rod, the Crypt of Bones key, potato seeds. 'What do I do now?' gets an answer through day 2.

## THE CORRECTED LANE BRIEF (execute this)
LANE lane/c-journeymans-road. This is lane C: a DB half plus a client half. The client half ships at the next 20:00 UTC cut and needs a Home visual gate.
BASE: branch from origin/next (set/b555 @0b776c7a, which already has Ledger of Firsts, Timberline and Lucky Finds). Then run `git merge origin/main` to pick up the b554 release 4748992f, and resolve ?v= conflicts per CLAUDE section 5. Do not use git stash.
SECURITY: GO-WITH-CHANGES. Every numbered item below is a condition of the GO.

0. DESIGN RULING FIRST (game-designer, not Tyler). Confirm or re-rule three items:
B1. road_hunt pays 500 kills -> 1,500 gold, i.e. 3 gold/kill. Every kill neighbour pays 23-30 gold/kill, and b497 moved kill payouts up for this reason.
B2. The road_forge and road_craft labels collide with weekly wk_smith and wk_craft ('Smith/Craft 60 items', which pay 2,200 gold + 600 XP).
B3. road_gather pays 2 gold/resource.
Author whatever is ruled, identically in every copy. The numbers below are the pack's.

1. src/legacy.js QUEST_DEFS: add these rows after hundred_kills. Every row is MIRRORED and carries chain:'road'. Use the pack's note text.
{id:'road_forge',chain:'road',type:'smithed',mirror:'stats.evSmithed',label:'Smith 60 items',goal:60,progress:0,reward:{gold:700,item:'iron_pickaxe',qty:1},note:'...',done:false}
road_craft: crafted / stats.evCrafted / goal 60 / 700 gold + iron_axe x1
road_cook: cooked / stats.evCooked / goal 60 / 600 gold + oak_rod x1
road_gather: gather / stats.evGather / goal 500 / 1000 gold
road_hunt: kill_any / stats.evKillAny / goal 500 / 1500 gold + bone_key x1
road_harvest: harvest / stats.harvested / goal 40 / 1500 gold + potato_seed x10
Also in legacy.js:
- MIRRORED_QUEST_SOURCES (~5248): add readers for stats.evSmithed, evCrafted, evCooked, evGather and evKillAny, in the same defensive shape as the existing ones.
- Class-kill: change hundred_kills' mirror from stats.kills to stats.evKillAny, and comment why. On live, stats.kills runs up to 368 ahead of the server on 18 of 40 characters.

2. src/net/accrue.js EVENT_COUNTER_PROJECTION: add {key:'ev:gather',stat:'evGather'}, {ev:cooked -> evCooked}, {ev:smithed -> evSmithed}, {ev:crafted -> evCrafted} and {ev:kill_any -> evKillAny}. NEVER map onto stats.gathered, cooked, smithed, crafted or kills: those have live readers (goal board, weeklies, cook_100, launchpad) and measured divergence.

3. src/data/goal-catalogue.js QUEST_REWARDS: add 6 rows {checkKey, goal, gold, items}, identical to the rows above. Refresh the header comment.

4. src/features/home-dashboard.js:
- firstDayModel takes only the rows with no `chain`.
- A sibling 'Journeyman's Road' card renders the chain:'road' rows from the same model. It is visible only when the first-day model returns null and a road step is open.
- Reuse the First Light CSS classes so the b554 tap-target sizing applies.
- Rewrite the contract comment at lines 1009-1015 to match.

5. supabase/migrations/2026-09-28-journeymans-road.sql. The header opens with 'STAGED, NOT APPLIED - REVIEW ONLY'.
Section 0, fail closed unless ALL of these hold:
- hr_quest_rewards holds exactly the 3 known rows.
- The installed hr_claim_quest__ungated, read with PROSRC (never pg_get_functiondef), contains the 4 known arm lines byte-exact, has exactly 4 `when '...' then v_key` arms, names no ev:planted, and contains the hr_quest_rewards lookup.
- iron_pickaxe, iron_axe, oak_rod, bone_key and potato_seed all exist in hr_items.
- hr_note_rejection exists.
Section 1: TAKE OWNERSHIP of hr_quest_rewards. Delete, then insert all 8 rows: the 3 existing byte-identical plus road_forge, road_craft, road_cook, road_hunt, road_harvest. Do not re-create the table, the helper or the constraint.
Section 2: create or replace hr_claim_quest__ungated as the 2026-09-06 body verbatim plus 6 arms, in the same one-line shape, e.g. `when 'road_hunt' then v_key := 'ev:kill_any'; v_goal := 500; v_gold := 1500;`. The 4 existing lines stay byte-identical.
DO NOT restate the wrapper hr_claim_quest. Its live body routes through hr_note_rejection.
Section 3: revoke execute on the __ungated function from public, anon, authenticated and service_role. Re-assert the wrapper grant to authenticated only.
Section 4, executed, with probes in an HR8xx-discarded subtransaction:
(a) Exactly 8 rows, each exact, every id in hr_items, and the shape check passes.
(b) hr_quest_rewards: has_table_privilege over the full PG17 verb list shows no privilege for anon, authenticated, service_role or hr_engine; RLS is on with 0 policies. The __ungated function is not executable by authenticated or anon. The wrapper is executable by authenticated and not by anon.
(c) The body names no ev:planted. Positive control: it still names ev:gather, ev:cooked, ev:kill_any, ev:harvest, ev:smithed and ev:crafted.
(d) For ALL 10 quest ids:
- At goal-1 the claim returns 'incomplete', credits nothing and does not consume the claim.
- At goal it returns ok, with the exact gold delta, the exact player_inventory rows and the exact receipt `items`.
- A replay returns 'already_claimed' and neither gold nor items move.
- Exactly one player_ledger row exists with kind 'quest', intent 'quest_claim:<id>' and meta.items.
- road_gather returns items {}.
- 'road_nope' returns 'unknown_quest'.
(e) An incomplete claim through the WRAPPER still writes an hr_rejections row (the Ledger of Firsts section 4(d) precedent).
(f) No probe row leaks, and hr_assert_grant_hygiene is clean.
HEADER must state:
- Per-character faucet ceiling: 6,000 gold + the 5 item grants, x6 slots.
- The retroactive payout measured 2026-09-26: 44 claims, about 41,500 gold.
- The bank-cap residual: up to 8 new stacks / 53 items.
- The road_hunt forge residual: the hr_credit_kills bounty branch has no active_id check, costs about 4 minutes, and is accepted as a gate, not a multiplier. Include the detection query (non-free hr_kill_credit_log applied at 80% or more of ev:kill_any at the time of the road_hunt claim). Reopen if the payout exceeds 2,000 gold, gains a tradeable item, or becomes repeatable; then grade on ev:kill_any minus ev:kill_credited_any.
- Reversibility: re-applying 2026-09-06 restores the old state. NEVER re-apply 2026-09-04 or 2026-09-06 on production after this file.
- ORDER: after 2026-09-07-goal-counter-kind-check.sql and 2026-09-27-ledger-of-firsts.sql.

6. tests/schema-apply-order.json. There is no generator; edit by hand. Append the file to `order` after the last entry present at merge time (after Deep Waters if it lands first). Its `_order_notes` entry starts exactly 'STAGED, NOT APPLIED - REVIEW ONLY; '. Conflicts are resolved in this lane.

7. Guards:
- quest-reward-parity.mjs: derive MIG as the LAST file in the schema-apply-order `order` that contains `insert into public.hr_quest_rewards`. Add road mutations (bone_key qty in legacy, potato_seed in the seed, the catalogue qty); each must go RED.
- goal-catalogue-drift.mjs: bind the quest CASE at the chain end, i.e. the last file in `order` that creates the __ungated function. Keep the 2026-09-04 farmhand check. ADD a --selftest covering: chain-end gold drift (road_hunt 1500 -> 1501), a missing chain-end arm, checkKey drift, legacy gold drift, and chain-end farmhand gold 500 -> 5000 (green today, proven in a scratch copy).
- goal-counter-kinds.mjs: derive QUEST_MIG as the chain end. Re-anchor quest_reads_planted on a road arm line. GATE_BLIND must also neutralise the new file's own GATE(d). Add ev:smithed and ev:crafted to the positive-control keys.
- Run `node tests/restore-census.mjs --write` (hr_quest_rewards replay 3 -> 8) and fix its note.
- Run patch-chain-guard; run --write only if it asks.
- live-hash-drift.baseline.json is Coordinator-only. Report that hr_claim_quest__ungated reads repo-ahead; do not edit the baseline.

8. In-page tests: append to src/features/smoke/quests-chronicle-and-bonus.js after the Ledger of Firsts rows.
- ROAD-1 (away): a complete statement with ev:smithed=60 -> road_forge shows 60/60 and is claimable. A stubbed claim returns items {iron_pickaxe:1}, and hrApplyQuestClaimGrant banks exactly that, with no mint.
- ROAD-2 (attended): updateQuest('smithed',999) and a live artisan tick leave road_forge at the server figure.
- ROAD-2b: G.stats.kills=500 with projected ev:kill_any=132 -> road_hunt and hundred_kills show 132, are not done, and no claim fires. This test must FAIL on a stats.kills mirror.
- ROAD-3: questDestination resolves all 6 rows without via 'fallback'.
- ROAD-4: the first-day card total equals the QUEST_DEFS rows without a chain. The Road card is hidden while a first-day step is open and shown afterwards. Update FIRST-LIGHT-1:3347 to that derivation, which re-derives the assertion rather than loosening it.
- ROAD-5: a complete statement with no ev rows zeroes the evX fields and leaves stats.gathered, cooked and kills untouched.

9. docs/SYSTEMS_MAP.md: document the rows, the chain field and the projection rows.

GATES (paste the exit codes you saw):
- node tests/quest-reward-parity.mjs, and again with --selftest
- goal-catalogue-drift, and --selftest
- goal-counter-kinds, and --selftest
- goal-gold-retune
- goal-counters
- schema-drift (the second apply must be byte-identical)
- apply-order-honesty
- restore-census
- patch-chain-guard
- catalogue-literal-drift (should stay green, unchanged)
- `node tools/pack-edge.mjs hr-accrue --hash`, unchanged from before your edits (no edge deploy)
- `node tools/lane-done.mjs`: paste its last line
- In-page: __smokeTest({only:'ROAD'}) and the FIRST-LIGHT battery
- Home visual check on desktop and at 922x423, with screenshots read

ORDER: Security GO on the file -> the Coordinator applies it with tools/apply-migration.mjs (never 00:00-00:10 UTC) -> a read-only post-apply check (prosrc md5, 8 rows) -> the client half rides the next cut -> play gate: a QA veteran's already-complete road quest claims once, and a second claim is refused. Estimate: 4-5 h.

## THE DESIGNER SPEC (rows, rates, tests; the brief above wins where they differ)
### contents
Six rows, identical in three places: QUEST_DEFS (legacy.js), QUEST_REWARDS (goal-catalogue.js), and the hr_claim_quest__ungated CASE plus hr_quest_rewards. Each row is verified against the server's own lifetime counter (kind 'stat', period '', written by goalProgressOps for GOAL_EVENTS). Rows go after hundred_kills in this order:

1. road_forge. Type 'smithed', label 'Smith 60 items', check ev:smithed >= 60, 700 gold + iron_pickaxe x1.
   Note: 'Sixty pieces off the anvil. Take this pick: iron waits at Mining 15.'
2. road_craft. Type 'crafted', label 'Craft 60 items', check ev:crafted >= 60, 700 gold + iron_axe x1.
   Note: 'Sixty things made by hand. This axe will keep the sawmill fed.'
3. road_cook. Type 'cooked', label 'Cook 60 dishes', check ev:cooked >= 60, 600 gold + oak_rod x1.
   Note: 'Sixty meals cooked. A better rod means more fish for the pan.'
4. road_gather. Type 'gather', label 'Gather 500 resources', check ev:gather >= 500, 1,000 gold.
   Note: 'Five hundred loads hauled. The homestead is built on this.'
5. road_hunt. Type 'kill_any', mirror stats.kills, label 'Defeat 500 monsters', check ev:kill_any >= 500, 1,500 gold + bone_key x1.
   Note: 'Five hundred down. The Crypt of Bones opens at combat 25, and this key fits its door.'
6. road_harvest. Type 'harvest', mirror stats.harvested, label 'Harvest 40 crops', check ev:harvest >= 40, 1,500 gold + potato_seed x10.
   Note: 'Forty crops in. Potatoes grow at Farming 30.'

Totals: 6,000 gold, plus items worth about 1,000 at vendor. bone_key is bind-on-pickup with value 0.

The smithed/crafted/cooked/gather rows mirror server-projected stats. Add EVENT_COUNTER_PROJECTION rows ev:gather->gathered, ev:cooked->cooked, ev:smithed->smithed, ev:crafted->crafted. The ev:harvest->harvested row is the precedent. Audit the 3-5 readers of each stat first. If ev semantics differ from the client stat (items vs actions), use dedicated lifetime fields instead.

Balanced against the starter quests and the dailies:
- Starter quests: gatherer 15 -> 150 gold, first_cook 5 -> 200 gold + 30 shrimp, first_blood 5 -> 150 gold + 5 turnip seeds, farmhand 6 -> 500 gold + 5 wheat seeds, hundred_kills 100 -> 1,500 combat XP.
- DAILY_TASK_REWARDS: daily_smith 40 -> 500, daily_craft 40 -> 500, daily_cook 12 -> 400, daily_gather_big 120 -> 800, daily_kill_big 60 -> 1,400.
- Each one-off pays about 1.1-1.25x its matching daily for 1.5-4x the count.
- The tools are the level-18 rung: forge_iron_pickaxe@18, forge_iron_axe@18, carve_oak_rod@18 (value 250-300), so each reward is one tier ahead of the player's curve.
### files
- src/legacy.js QUEST_DEFS: 6 rows after hundred_kills.
- src/data/goal-catalogue.js QUEST_REWARDS: 6 rows.
- src/net/accrue.js EVENT_COUNTER_PROJECTION: +4 rows.
- supabase/migrations/2026-09-28-journeymans-road.sql (new): restates hr_claim_quest__ungated with 6 CASE arms (the 4 existing arms byte-identical), upserts 5 hr_quest_rewards rows, and carries a §4 self-check.
- tests/quest-reward-parity.mjs and tests/goal-catalogue-drift.mjs: extend.
- tests/schema-apply-order.json.
- src/features/smoke/quests-chronicle-and-bonus.js: ROAD-1..3, appended.
- docs/SYSTEMS_MAP.md.
- No edge deploy: goal-catalogue.js and accrue.js are not bundled, and src/core/goals.js is unchanged.
### tests
§4 self-check executed in the migration (SQL, not markers). For each of the 6 ids:
- A probe below the goal returns 'incomplete'.
- At the goal it returns ok: gold +N exactly, the items credited exactly, and one player_ledger row with meta.items.
- A replay returns 'already_claimed'.
- An unknown id returns 'unknown_quest'.
- The body still names no ev:planted (GATE(d)).
- The 4 original arms are unchanged.
- The second apply is byte-identical on schema-drift replay, and apply-order-honesty is green.

Parity guards: quest-reward-parity and goal-catalogue-drift bind QUEST_DEFS, QUEST_REWARDS, the SQL CASE and hr_quest_rewards for all 10 server-paid quests. --mutate proof: change road_hunt gold in one copy and the guard goes red.

In-page:
- ROAD-1 (happy path): reconcileEventCounters with a server progress row ev:smithed=60 shows road_forge at 60/60 and claimable. The claim mirrors the RPC's items (iron_pickaxe) with no client mint.
- ROAD-2 (§6 regression): a client updateQuest('smithed', 999) cannot move road_forge past the server figure.
- ROAD-3: questDestination resolves all 6 rows without reaching the fallback.

Coordinator: live-hash-drift re-measure for hr_claim_quest__ungated after the apply.
### depends on
No other batch-2 pack. Branch from set/b555 after Ledger of Firsts merges, because both append to src/features/smoke/quests-chronicle-and-bonus.js. Order: Security GO, then the Coordinator applies the migration, then the client half rides the next cut. If Deep Waters merges first, regenerate tests/schema-apply-order.json with its tool; never hand-merge it.
### reviewer problems fixed by the brief
- P1 CONFIRMED on live data. road_hunt mirrors stats.kills, a client-only residue counter (client-state.js:113) that no envelope projects, while hr_claim_quest grades the server's lifetime ev:kill_any. A read-only production check on 2026-09-26 found the client count ahead of ev:kill_any on 18 of 40 characters, by up to 368 (median 21). 3 characters already show at least 100 kills on the client while the server has under 100. Under the pack, road_hunt would show 500/500, completeQuest would set done and fire the claim, the server would answer 'incomplete', and hrSweepUnclaimedQuests would re-fire every 60 s (legacy.js:5679-5810). That is the section 6 'client shows X, server refuses' P1 class. Fix: mirror a projected server field, and re-point hundred_kills (same class) in the same commit. No existing guard catches this.
- P1 CONFIRMED by reading. Rows 1-4 as specified carry no `mirror:`, so they would be counting rows. A counting row starts at 0 on every existing save and only moves on a live updateQuest (legacy.js:5691-5694), but the server grades a lifetime counter. On live, ev:gather runs up to 81,560 ahead of the client's stats.gathered. The display would disagree with the server in both directions. Fix: all six rows must be mirrored rows.
- P2 CONFIRMED on live data. The pack projects onto existing stats fields: ev:gather to stats.gathered, ev:cooked to cooked, ev:smithed to smithed, ev:crafted to crafted. Those fields have other readers: DAILY_GOAL_POOL 'cook' (legacy.js:13775), weekly wk_smith / wk_craft / wk_cook (18232/18234/18271), achievement cook_100 (14270) and the profile-launchpad day delta (profile-launchpad.js:93/131). goalSourceMirrored derives from EVENT_COUNTER_PROJECTION (legacy.js:13839), so four goal-board fallbacks would quietly re-baseline. reconcileEventCounters also SETS the value, downward included, on a complete statement, and the client and server gather counts already differ on 39 of 40 characters. Fix: dedicated fields that nothing else reads (evGather, evCooked, evSmithed, evCrafted, evKillAny).
- P2 CONFIRMED by reproduction. The guards read superseded migration files, not the chain end. goal-catalogue-drift reads the quest CASE only from 2026-08-20 (goal-catalogue-drift.mjs:126). In a scratch copy I changed farmhand gold from 500 to 5000 in 2026-09-06, the body production actually runs (live prosrc md5 a20ff223); the guard stayed green (exit 0). quest-reward-parity hard-codes 2026-09-06 (:57). goal-counter-kinds sets QUEST_MIG to 2026-09-06 (:69), so its quest_reads_planted gate-blind arm breaks once a later file restates the body. As written, the lane either goes red on all three guards or 'fixes' them by editing applied migrations. Fix: derive the chain end from tests/schema-apply-order.json, as collection-renown-claim-drift already does. Also add a --selftest to goal-catalogue-drift, which has none.
- P2 CONFIRMED. The pack misses these files: tests/restore-census.baseline.json, which pins the hr_quest_rewards replay row count at 3 (it will read 8 and go red); tests/goal-counter-kinds.mjs; MIRRORED_QUEST_SOURCES in legacy.js:5248; home-dashboard.js firstDayModel; and FIRST-LIGHT-1 (hunt-raids-and-screens.js:3347, which asserts total === QUEST_DEFS.length). The pack also says to regenerate schema-apply-order.json 'with its tool'. No such tool exists; the file is edited by hand, and the lane resolves its own conflicts.
- P2 CONFIRMED by reading. The pack breaks the First Light contract. home-dashboard.js:1009-1015 treats QUEST_DEFS as the 'Your first day' card and says a longer quest line 'wants its own table and its own section'. Six day-2 rows would show 'Step 7 of 11: Defeat 500 monsters' under 'Your first day' and keep the card on screen for days. Fix: a chain:'road' field, a firstDayModel filter, and a separate Road card. Home is a rendered surface, so the client half needs a visual gate.
- P2 CONFIRMED by reading. Ownership and restatement hazards. 2026-09-06 owns hr_quest_rewards by delete-and-refill (:237). 'Upsert 5' would leave two owners, and re-applying 2026-09-06 would silently drop 5 rows and 6 arms. The live hr_claim_quest WRAPPER was patched by the 2026-09-12 rejections-journal discovery to route through hr_note_rejection; restating it from a template would delete the refusal journal. Section 0 must read the installed body with prosrc, not pg_get_functiondef, because live-hash-drift treats pg_get_functiondef callers as patchers.
- P3 CONFIRMED on the live function body; no exploit was executed. The road_hunt gate can be moved by the client. hr_credit_kills (authenticated, 60 calls/min bucket) has a bounty branch that adds client-claimed kills to lifetime ev:kill_any. Its only limit is the physics cap measured from accepted_at (130/min against a 15-HP target at damage level 10), and it has no active_id check (live prosrc; an accepted residual in the Ledger of Firsts review). Roughly 4 minutes of forged credit reaches 500 kills, paying 1,500 gold + bone_key per character, x6 slots. This is ACCEPTED as a bounded residual: the forged counter is a gate, not a multiplier, it pays once ever, and it is journalled (quest_claim:road_hunt plus hr_kill_credit_log.claimed_raw). That is consistent with the 2026-09-01 section C4 ruling, provided the migration header states it. Reopen it if the payout goes above 2,000 gold, gains a tradeable item, or becomes repeatable; the fix then is to grade on ev:kill_any minus ev:kill_credited_any, as renown R5 does.
- P3 balance, a design ruling for the game-designer. road_hunt pays 3 gold/kill, against daily_kill_big 23.3, daily_kill 24, wk_kills 25 (+3 gems, +1,000 HP XP) and first_blood 30. That brings back the b497 'fighters at the bottom' problem. The pack's ratio claim is wrong: hunt pays 1.07x the gold for 8.3x the count, and cook pays 1.5x for 5x. road_gather pays 2 gold/resource against 6.7-10 for its neighbours. The road_forge and road_craft labels ('Smith 60 items', 'Craft 60 items') duplicate weekly wk_smith and wk_craft, which pay 2,200 gold + 600 XP. bone_key is not really 'value 0': the Quartermaster sells it for 18 scrip, and it buys one Crypt run with a 12% kitchen_blueprint_t2 and 20% farm_deed chance, both tradeable.
- P3 faucet, to be stated in the header. Per character, once: 6,000 gold + iron_pickaxe + iron_axe + oak_rod + bone_key + 10 potato_seed, x6 slots per account. Retroactive payout measured on live 2026-09-26: 44 claims become payable on the first tick after the client ships (3 forge, 4 craft, 11 cook, 18 gather, 3 hunt, 5 harvest). That is about 41,500 gold + 3 pickaxes, 4 axes, 11 rods, 3 bone keys and 50 potato seeds. The bank-cap residual grows from 3 new stacks / 40 items to 8 new stacks / 53 items, because hr_apply's cap check is an absolute count after the write (2026-09-14-hr-apply-restatement.sql:1188-1196). No character is within 5 stacks of its cap today.
- P3 integration. set/b555 (= origin/next 0b776c7a) already contains Ledger of Firsts, Timberline and Lucky Finds, but not the b554 release commit 4748992f (?v=553 vs 554); the lane must merge origin/main itself. There is no code overlap with Vigour, party-view-volatile or tap targets. A Road card must reuse the First Light classes so the b554 tap-target sizing applies. The pack's 'no edge deploy' claim holds: the hr-accrue payload (83 files) contains neither goal-catalogue.js nor accrue.js. The 2 h estimate is low; expect 4-5 h.
- P4 hardening, separate branch, not blocking. get_advisors reports WARN function_search_path_mutable on hr_quest_rewards_items_ok. The other advisor hits are expected: hr_claim_quest is callable by authenticated, and hr_quest_rewards has RLS on with no policy.
