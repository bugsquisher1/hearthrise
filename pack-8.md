# Content pack 8: Deep Waters: fishing and mining stands 47-83, and higher fish heal more

VERDICT (security/systems pre-review): GO-WITH-CHANGES | class C

## PLAYER VALUE
Fishing gets a new spot every 5-8 levels from 40 to 90 (it had nothing from 41 to 54) and Mining gets new veins at 67 and 82. A higher-level fish is finally better food: today a cooked Swordfish (Fishing 55) heals 22, less than a Lobster (Fishing 40, heals 25).

## THE CORRECTED LANE BRIEF (execute this)
LANE: content "Deep Waters" (lane C, money/ranked surface, Security GO before apply). Branch lane/content-deep-waters, cut from set/b555 (it carries Timberline). Worktree only; never main; no prod writes; no git stash.

PREREQUISITE, game-designer (record it in the gathering.js / items.js design block before writing the heals):
(i) cooked_moonfish 50 is ABOVE gated dragon_stew 45 and EQUAL to lich_soul_soup 50. The pack's 'stays under' claim is false. Either keep 32/38/44/50 and state that honestly, or re-seat the numbers.
(ii) The auto-eat fallback (biggest healer) now eats Cooked Moonfish (2,100 g, 42 g/HP) instead of Cooked Shark (900 g, 20.5 g/HP). Acknowledge it or re-rule.
Write whatever is ruled; default is the pack's 32/38/44/50.

1. src/data/gathering.js — insert by req, never append (the ladder guards read array order). Add a design block quoting the PACED guard series, floor(xp x 0.39) / (floor(ms x 1.6)/1000). Fix the text: the ore stands are [1,2], and the one-ore bars are smelt_mithril (1 ore + 3 coal) and smelt_ember (1 ore + 4 coal).
FISH_SPOTS:
- after lobster_s: {id:'lobster_reef_s',name:'Lobster Reef',icon:'🦞',req:47,xp:98,ms:9000,prod:'lobster',qty:[1,1]}
- after swordfish_s: {id:'swordfish_deeps_s',name:'Swordfish Deeps',icon:'🐠',req:61,xp:133,ms:10600,prod:'swordfish',qty:[1,1]}
- after frostfin_s: {id:'frostfin_reach_s',name:'Frostfin Reach',icon:'❄️',req:71,xp:166,ms:12200,prod:'frostfin',qty:[1,1]}
- after shark_s: {id:'shark_shelf_s',name:'Shark Shelf',icon:'🦈',req:83,xp:195,ms:13600,prod:'shark',qty:[1,1]}
ROCKS:
- after mithril_rock: {id:'deep_mithril_vein',name:'Deep Mithril Vein',icon:'🔵',req:67,xp:118,ms:9300,prod:'mithril_ore',qty:[1,2]}
- after emberstone_rock: {id:'deep_ember_vein',name:'Deep Ember Vein',icon:'🔶',req:82,xp:157,ms:11200,prod:'emberstone_ore',qty:[1,2]}
Expected guard rates (measured): 2.6389 / 3.0071 / 3.2787 / 3.4926 / 3.0914 / 3.4040.

2. src/data/items.js heals: cooked_swordfish 22->32, cooked_frostfin 28->38, cooked_shark 42->44, cooked_moonfish 38->50. Leave v, foodTier, foodClass and buff unchanged. Update the '42' comment at src/core/auto-eat.js:190.

3. Run `node tools/gen-catalogues.mjs` to regenerate 2026-08-11-catalogue.generated.sql (514 activities on the b555 base; new digest). It is a chain record and is never applied.

4. NEW supabase/migrations/<authoring-date>-deep-waters.sql. One do-block, no begin/commit. Template: 2026-09-26-timberline.sql plus the Reed & Tide hr_rest/feast gates.
§0 preconditions: hr_activities exists; hr_skills has fishing and mining; hr_items has lobster, swordfish, frostfin, shark, mithril_ore, emberstone_ore and the 4 cooked fish; hr_feast_foods holds the 4 cooked fish. Capture the hr_items count.
§1a: the 6 hr_activities rows (gather, fishing/mining, req 47/61/71/83/67/82, max_hp null, is_boss false). Use insert ... on conflict (kind,activity_id) do update ... where the values are distinct.
§1b: `update public.hr_items set heals = x.h from (values ...) x(id,h) where item_id = x.id and heals is distinct from x.h`. Heals only; auto_eatable stays true.
§1c: MUST be exactly this shape, because the feast drift guard parses only insert blocks:
insert into public.hr_feast_foods (item_id, heals) values ('cooked_swordfish',32),('cooked_frostfin',38),('cooked_shark',44),('cooked_moonfish',50) on conflict (item_id) do update set heals = excluded.heals;
§2 self-check (§4 rule, every claim executed):
(a) The 6 rows, restated literally.
(b) Fishing and mining benches: no NULL req_lv and one node per level, over the whole bench. Assert your NAMED set is present. Do NOT pin an exact bench total: an exact total in a patch file is what breaks the next pack's replay, and the chain-end total is catalogue-literal-drift's job.
(c) hr_items count unchanged. The 4 heals, restated literally, match in BOTH hr_items and hr_feast_foods. Feast equals item for those 4 rows, and all 4 are auto_eatable.
(d) With a probe character, hr_apply answers: Fishing 46 is refused lobster_reef_s with activity_locked; positive control lobster_s is accepted at 46; Fishing 47 is accepted and the pointer lands. Repeat for Mining 66/67 on deep_mithril_vein, with control mithril_rock.
(e) hr_rest with exactly one cooked_swordfish and exactly 32 HP missing heals 32 and debits 1.
(f) A planted Tavern clan (tavern>=1): clan_feast_deposit of 1 cooked_moonfish adds exactly 50.
Roll back with a unique sentinel sqlstate. The leak check covers auth.users, player_state, player_skills, player_inventory, player_equipment, player_progress, player_intents, player_ledger, hr_rejections, clans, clan_members, clan_tavern, clan_ledger.
Header must state: xp/ms/qty are NOT in SQL (they ride the edge payload); the order; the reversal (delete the 6 rows, then an insert-on-conflict file restoring 22/28/42/38 in both tables).

5. POST-APPLY AMENDMENT, self-check only (needs explicit Security acceptance):
- 2026-09-13-reed-and-tide.sql:380-385 (fishing `<> 12`) and 2026-09-13-deep-seam.sql:461-466 (mining `<> 12`): replace the bare total with 'that ruling's 12 named ids are present at their req'. Keep the b2 checks and the cooking-35 / smithing-115 checks unchanged.
- Without this the chain replay RAISES, because the regenerated catalogue at position 83 carries 16 fishing / 14 mining rows.
- Record 'POST-APPLY AMENDMENT (self-check ONLY, no body/data)' in both order notes.
- Mutation proof: plant the deletion of one ruled row via bootReplay `patches` and show the amended gate still raises.

6. Other files:
- tests/schema-apply-order.json: the new file at chain end, after 2026-09-26-timberline.sql. Note: STAGED, Security GO required, apply ONLY this file, order apply -> edge -> client in ONE cut sitting.
- tests/restore-census.baseline.json: hr_activities replay 508 -> 514 via `node tests/restore-census.mjs --write`. Keep the authored note.
- docs/SYSTEMS_MAP.md §4: fishing and mining tables plus the heal note.
- tests/accrual-engine.mjs:1226-1227: the 'late-game fisher/cook' fixture changes `dear: 'cooked_shark'` to 'cooked_moonfish'. Also the comments at :798/:1193.
- Do NOT touch tests/live-hash-drift.baseline.json (Coordinator-only; expected no change).
- tests/clan-economy-sinks.mjs is unaffected (it boots only the 2026-08-27 seed).

7. Tests. In-page tests go next to TIMBERLINE/REEDTIDE in src/features/smoke/hunt-raids-and-screens.js. Keep each lean: about 33 code lines and 2 or fewer G-seeds per test (test-file-ratchet). Fixtures bonus-free: getBonus and restedQuantum set to 0, an EMPTY gear stat block (TL-1), a reseeded RNG, P._withOfflineReplay.
- DEEPWATERS-1: the 6 nodes sit at their req in req order and yield existing raw items. One action at Lobster Reef at Fishing 47 banks exactly 1 lobster and 38 XP, and the tile names the yield.
- DEEPWATERS-2: the Lobster Reef tile is locked at 46 (locked class, 'Level 47' label, notify, no start) and live at 47. This is the client half; the server half is §2(d).
- DEEPWATERS-3: time-to-99 for WC / Mining / Fishing stays within 5% (measured 1065.7 / 1051.0 / 1036.8 h). The commit must carry a mutation proof that it goes red.
- DEEPWATERS-4: heals strictly rise lobster < swordfish < frostfin < shark < moonfish; healing per fishing-hour on the named spots strictly rises (7,031 / 7,200 / 7,435 / 7,615 / 8,036); all four are auto-eatable healing food; the designer-ruled ceiling is pinned.
- DEEPWATERS-5 (ATTENDED combat): the resolveAutoEat adapter, and a manual eat of one cooked_swordfish at a deficit of 32 or more, restore exactly 32.
- Node DEEPWATERS-S1: 1 h away gather at deep_mithril_vein, Mining 67. Exactly 241 actions, 46 XP each, 1-2 ore per action with a seeded count pinned. The attended path on the same seed is identical. Include an unknown_node control.
- Node DEEPWATERS-S2 (AWAY combat): a seeded night with only cooked_swordfish and auto-eat on. Every meal heals 32. Server and client are in parity (serverAccrual vs clientAwaySpan).

8. Gates. Report each one's real exit code:
- `node tools/gen-catalogues.mjs --check`
- `node tests/schema-drift.mjs` and `--mutate`
- `node tests/catalogue-literal-drift.mjs` and `--selftest`
- `node tests/clan-feast-catalogue-drift.mjs` and `--selftest`
- `node tests/apply-order-honesty.mjs` and `--selftest`
- `node tests/restore-census.mjs`
- `node tests/patch-chain-guard.mjs`
- `node tests/selfcheck-no-global-dml.mjs`
- `node tests/accrual-engine.mjs`, `node tests/worker-accrual.mjs`, `node tests/world-tick-parity.mjs`, `node tests/hearthfind-boss-rate.mjs`
- `node tools/pack-edge.mjs hr-accrue --hash` (record the new hash)
- A production-shape probe: replay, delete the 6 rows and restore the old heals, apply. The insert path lands; a second apply writes no tuple; the probe is net-zero; mutations are refused (req off by one, dropped row, NULL req, feast/item heal mismatch).
- The in-page suite only if the machine is quiet; otherwise GitHub on the lane branch.
- `node tools/lane-done.mjs`: paste its last line.
Merge set/b555 (or next) into the branch yourself first. Resolve JSON and catalogue conflicts by regenerating with their tools; this pack shares them with Journeyman's Road.

9. Deploy (Coordinator): Security GO -> apply this one file (never 00:00-00:10 UTC) -> edge deploy and verify payload_sha256 -> client push, all in the same cut sitting. The visual gate covers the fishing screen (16 tiles) and the mining screen (14 tiles), desktop and 922x423. The play gate: fish at Lobster Reef, reload, and the lobster count matches the envelope.

File for others (not this lane):
- backend-architect: TL-2, the world-tick shadow is not value-exact on [1,2] yields. Two more such nodes; it must close before the gather tick goes live.
- game-designer: hearthfind cadence shifts (mithril_rock out-paced from 67, shark_s from 83).

Report: one table plus at most three sentences.

## THE DESIGNER SPEC (rows, rates, tests; the brief above wins where they differ)
### contents
Six new nodes, each yielding an EXISTING product (no new items, recipes or art), inserted by req. Guard rate = floor(xp x 0.39) / (floor(ms x 1.6) / 1000).

FISH_SPOTS:
- lobster_reef_s 'Lobster Reef' 🦞: req 47, xp 98, ms 9000, lobster [1,1]. Rate 2.6389, +5.6% over Lobster 2.5000; Swordfish 2.8125 is +6.6% over it.
- swordfish_deeps_s 'Swordfish Deeps' 🐠: req 61, xp 133, ms 10600, swordfish [1,1]. Rate 3.0071 (+6.9% / +4.8% to Frostfin 3.1522).
- frostfin_reach_s 'Frostfin Reach' ❄️: req 71, xp 166, ms 12200, frostfin [1,1]. Rate 3.2787 (+4.0% / +2.6% to Shark 3.3654).
- shark_shelf_s 'Shark Shelf' 🦈: req 83, xp 195, ms 13600, shark [1,1]. Rate 3.4926 (+3.8% / +3.5% to Moonfish 3.6161).

ROCKS:
- deep_mithril_vein 'Deep Mithril Vein' 🔵: req 67, xp 118, ms 9300, mithril_ore [1,2]. Rate 3.0914 (+4.1% over Mithril 2.9688, +4.0% to Emberstone 3.2143). 363 ore/h vs 281.
- deep_ember_vein 'Deep Ember Vein' 🔶: req 82, xp 157, ms 11200, emberstone_ore [1,2]. Rate 3.4040 (+5.9% / +5.6% to Dawnstone 3.5938). 301 ore/h vs 214.

Every new req gap is <= 8, so b390's full-tier 6% rule does not bind, and b226 strictly-faster holds (measured).

Heal climb, the same number in items.js, hr_items.heals and hr_feast_foods:
- cooked_swordfish 22 -> 32
- cooked_frostfin 28 -> 38
- cooked_shark 42 -> 44
- cooked_moonfish 38 -> 50

Healing per fishing-hour at the named spots becomes Lobster 7,031 -> Swordfish 7,200 -> Frostfin 7,435 -> Shark 7,615 -> Moonfish 8,036. Today it is 7,031 / 4,950 / 5,478 / 7,269 / 6,107. The new heals stay under dragon_stew 45 (gated), lich_soul_soup 50 and void_banquet 60.

Fish stands stay [1,1] on purpose. Cooked food sells at full value, so extra fish per hour would widen the fish-to-cook vendor faucet. Each stand is the XP choice and the named spot below it is the food choice. The ore stands copy the deep_verdite_seam [2,3] and rich_coal_rock [2,3] throughput pattern, because smelt_ember and smelt_rune eat 1 ore per bar.
### files
- src/data/gathering.js: FISH_SPOTS +4 and ROCKS +2, inserted by req, with a design block quoting the guard series.
- src/data/items.js: heals for the 4 cooked fish.
- supabase/migrations/2026-08-11-catalogue.generated.sql: regenerate with tools/gen-catalogues.mjs.
- supabase/migrations/2026-09-28-deep-waters.sql (new): 6 hr_activities rows, 4 hr_items heals updates, 4 hr_feast_foods updates, §4 self-check. Timberline and Deep Seam are the template.
- tests/accrual-engine.mjs: DEEPWATERS-S1.
- tests/schema-apply-order.json.
- src/features/smoke/bounty-and-artisan.js: DEEPWATERS-1..4, appended.
- docs/SYSTEMS_MAP.md §4: tables.
- Edge redeploy, because gathering.js and items.js are bundled.
### tests
In-page:
- DEEPWATERS-1 (happy path): at Fishing 47 the Lobster Reef tile starts, and one action settles lobster through the envelope. At 46 the server refuses the level gate.
- DEEPWATERS-2: b226 and b390 stay green with the new rows, and fishing/mining/woodcutting time-to-99 stay within 5% of each other (b390 parity).
- DEEPWATERS-3: cooked-fish heals strictly increase lobster < swordfish < frostfin < shark < moonfish, and healing per fishing-hour on the named spots strictly increases from Lobster to Moonfish.
- DEEPWATERS-4: categorizeRecipes lanes are unchanged, so no cooking recipe moves between provisions and feasts.

Node: accrual-engine DEEPWATERS-S1: an away gather at deep_mithril_vein pays 1-2 mithril_ore per action, and the attended tick pays the same on the same seed.

Guards: catalogue-literal-drift (chain end equals src/data, including hr_items.heals), clan-feast-catalogue-drift (reads every feast seed migration in apply order), gen-catalogues --check, schema-drift replay with a byte-identical second apply, apply-order-honesty.

§4 self-check: the 6 activity rows exist with the right req, the 4 heals match, the 4 feast rows match, and a mutated heal is refused by the self-check.
### depends on
Timberline, already on set/b555: same ladder guards, same migration pattern, same gathering.js file. Branch from set/b555. Order: Security GO, then the Coordinator applies, then the edge deploy, then the client push. It shares tests/schema-apply-order.json with Journeyman's Road; whichever merges second regenerates it.
### reviewer problems fixed by the brief
- P1 BLOCKER, CONFIRMED (static; deterministic raise): the chain replay breaks. 2026-09-13-reed-and-tide.sql:380-385 and 2026-09-13-deep-seam.sql:461-466 both raise when their bench count is not exactly 12 (`if v_n <> 12`). They sit at apply-order positions 236 and 247. The regenerated 2026-08-11-catalogue.generated.sql runs earlier, at position 83, and after this pack it carries 16 fishing and 14 mining rows. So schema-drift, catalogue-literal-drift and restore-census (all built on bootReplay) go red. Production today has fishing 12, mining 12, 503 activities (read-only query). Blast radius: the repo can no longer rebuild the DB, so every lane's CI is red. Fix: a self-check-only POST-APPLY AMENDMENT to both files (precedent: 2026-09-13-consumable-buffs.sql's note). Replace the bare total with a check that the ruling's own 12 named ids are present at their req, and keep the b2 checks (no NULL req, one node per level) plus the cooking-35 and smithing-115 checks as they are. Needs a mutation proof and an explicit Security acceptance. Kill the class: the new file must NOT add a fresh exact bench total, because the chain-end total is already catalogue-literal-drift's job. Would tests catch it: yes (schema-drift). The pack did not anticipate it.
- P2, CONFIRMED by running the real chooser on a patched copy of the catalogue: the auto-eat fallback (biggest healer) flips from Cooked Shark (900 g, 20.5 g/HP) to Cooked Moonfish (2,100 g, 42 g/HP). The mid-tier fallback also flips, River Chowder to Cooked Swordfish. auto-eat.js:186-195 says the fallback is the common case late game, so a late-game auto-eater's food bill roughly doubles. Blast radius: self. Today nobody holds any of the four fish (read-only query). Tests catch it: tests/accrual-engine.mjs:1226-1227 pins `dear: 'cooked_shark'` and goes red at :1261. Fix: the game designer acknowledges this in the ruling, the fixture becomes cooked_moonfish, and the stale '42' comments at auto-eat.js:190 and accrual-engine.mjs:798/1193 are updated.
- P2, CONFIRMED: the pack's claim that the new heals 'stay under dragon_stew 45 and lich_soul_soup 50' is false. cooked_moonfish at 50 is above Dragon Stew 45 (items.js:512) and equal to Lich Soul Soup 50 (:513). It becomes the top auto-eatable provision, above Moonbloom Elixir 40. With shark at 44 a strict climb cannot keep moonfish under 45. Fix: the designer re-rules or states it honestly, and a test pins whatever ceiling is ruled.
- P2, CONFIRMED (parser read): the feast drift guard cannot see UPDATE statements. tests/clan-feast-catalogue-drift.mjs:52-58 folds only `insert into public.hr_feast_foods (item_id, heals) values ...` blocks. If the pack's '4 hr_feast_foods updates' are written as UPDATEs, the fold keeps 22/28/42/38 and the guard stays red. Fix: write them as insert ... on conflict (item_id) do update set heals = excluded.heals.
- P2, CONFIRMED: the tests as specified cannot run, or test nothing, and the both-path rule (CLAUDE.md §4) is unmet. DEEPWATERS-1 ('the server refuses at 46', 'settles through the envelope') cannot run in-page before the apply: production has 0 of the 6 ids. The server half belongs in the migration's executed GATE(d). DEEPWATERS-4 is vacuous: recipeCategory keys on foodClass (recipes.js:663-667), so a heals-only change can never move a recipe. The heal change touches combat (edge eat.js:117/277, combat-sim auto-eat, SQL hr_rest recovering-until.sql:612-627), so it needs an ATTENDED test and an AWAY test. Neither is listed. Also carry Timberline's TL-1 fix: XP-exact in-page tests must pin an empty-gear stat block.
- P3, CONFIRMED: the file list misses tests/restore-census.baseline.json. The census pins the hr_activities replay count (restore-census.mjs:373), which moves 508 -> 514 on a set/b555 base, and the Timberline commit re-pinned it the same way. The migration name 2026-09-28 is a future date; use the authoring date.
- P3, PLAUSIBLE (sequencing): heals are read by three runtimes. The client uses items.js for display and its auto-eat prediction. The edge uses its vendored items.js in eat.js and combat-sim. SQL uses hr_items.heals in hr_rest and hr_feast_foods in clan_feast_deposit. An apply, edge deploy and client push spread over a day is a window where the browser says one thing and the server another (§6). Fix: apply, edge deploy and client push back-to-back in one cut sitting. For the six gather rows every mis-order fails closed.
- P3, pre-existing (Timberline TL-2): the world-tick shadow gather channel is not value-exact on variable-yield nodes, and the two new veins are [1,2]. Must close before the gather tick goes live (backend-architect). Also pre-existing: TL-3 digest lag. For the designer: hearthfind nodes are out-paced earlier. mithril_rock (deepvein_lodestar) from 67 instead of 75, shark_shelf_s over shark_s (tidecallers_pearl) from 83 instead of 90.
- Doc errors in the pack text: the ore stands are [1,2], not the deep_verdite/rich_coal [2,3] pattern. smelt_rune eats a mithril BAR; the one-ore bars are smelt_mithril (1 ore + 3 coal) and smelt_ember (1 ore + 4 coal). Coal is the binding constraint, so +29% / +41% ore per hour does not turn into bars one-for-one.
- Verified clean. The client only ever sends an activity id or item id. On all three tables (hr_activities, hr_items, hr_feast_foods) RLS is on, the only policy is SELECT, and anon/authenticated hold no write grants (production read). Every quoted guard rate reproduces exactly (2.6389 / 3.0071 / 3.2787 / 3.4926 / 3.0914 / 3.4040): strictly rising, and no gap of 10 or more remains. Every new row is below the table maximums (items/h 750, xp/h 13,327, raw gold/h 52,500), so the per-call clamps and hr_day_budget are unaffected. Each new fish stand yields fewer fish per hour than the named spot below it. The cheapest Tavern fuel per HP is still cooked_shrimp (2.25 g/HP) against swordfish at 17.5, so there is no cheaper path to fill a clan meter. Time to 99 is WC 1065.7 h, Mining 1051.0 h, Fishing 1036.8 h: a 2.8% spread. None of the six ids collides with an existing id. No live-hash impact (no function body). Advisors: none of the 6 lint groups names these tables; the only nearby hits (clan_feast_deposit, hr_worker_assign, hr_rest, executable by authenticated) are the approved client RPC surface. No conflict with the set/b554 lanes (Vigour, party-view, tap targets); b554 only bumped the ?v= numbers in items.js and auto-eat.js. The shared files are schema-apply-order.json, restore-census.baseline.json and the generated catalogue, shared with Timberline (on b555) and Journeyman's Road; whichever merges second regenerates them with their own tools. Tap targets means the visual gate must cover the fishing screen (12 -> 16 tiles) and the mining screen (12 -> 14 tiles) at 922x423.
