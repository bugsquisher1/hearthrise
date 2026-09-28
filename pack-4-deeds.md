# 4. Deeds of the Realm: the 30 achievements re-pointed to what the realm counts (dispatch after Pack 2 merges)

VERDICT: GO-WITH-CHANGES | class A: true | est 2 h

PLAYER VALUE: Achievements are the classic goal board for days 7-30. Today every unlock is decided by the browser and announced with a toast (legacy.js:14064-14077): 'First Blood' through 'Legendary' on the kill tally that ran 368 ahead, and four 'Earn N gold' deeds on a counter that only counts kill gold. 'Estate Owner — Build all 6 house rooms' counts upgrades rather than rooms, and there are 8 house rooms (legacy.js:14009, :8670). The modal shows 0 for unknown values and lists no reason to care about any deed.

After this pack:
- Each of the 30 deeds is graded on a server count.
- Each has a line of lore.
- Each unlock moment fires only when the realm's number crosses the target.
- The five that no server count can support are replaced by five that can.

PROBLEMS TO FIX IN THIS LANE (each is a condition):
- 1. PRECONDITION NOT MET (process, High). The brief cannot start from 467dcf90 on its own. Pack 2's src/data/lifetime-tally.js (LIFETIME_KEYS) and window.HearthriseLifetime do not exist on origin/release/b559 (git grep finds nothing). A branch built only on b559 turns window-globals-exist RED on the HearthriseLifetime read, and DEED-1's import fails. Fix: step 0 merges origin/set/b560 once Pack 2 is on it. The lane never writes a second res.progress reader.
- 2. CONFIRMED: the guard would test nothing (High). DEED-4 as written imports labelValues from tests/lore-notes.mjs. That file has no main guard (lore-notes.mjs:346-350), so any file that imports it runs lore-notes' own run (or its --selftest) and then calls process.exit. Measured on a b559 snapshot: a probe that imported labelValues exited 0 on lore-notes' '18/18 plants caught', and its own planted RED never ran. `node tests/deeds.mjs --selftest` would therefore always pass. Fix: add an isMain guard to lore-notes.mjs before importing from it.
- 3. CONFIRMED: build goes RED, and lane-done cannot see it. arm-homing-guard fails if 'achievements' leaves RESIDUE_FIELDS while any `G.achievements =` write remains: src/render/achievements.js:56 and legacy.js:14066/14068. Measured: exit 1 with only the residue entry removed, exit 0 once every write is gone. The guard runs only as a run-smoke preflight (tests/run-smoke.mjs:2609), not in lane-done. Fix: remove every write, and make `node tests/arm-homing-guard.mjs` a lane gate.
- 4. CONFIRMED: lane-done goes RED. The file list leaves out tests/ci-shape.baseline.json. Registering tests/deeds.mjs in smoke.yml without re-pinning gives CI-SHAPE-6 (measured exit 1). `ci-shape --write` adds exactly two keys at baseline:197-198 (measured exit 0). Register inside the existing 'Hearth Codex claims' step (smoke.yml:2606), not as a new step after 'Skill guide coverage': that is the template anchor every batch-5 pack was handed. These hunks do not overlap the in-flight lanes: world-tick-stall at smoke.yml:1412 / baseline:82, settle-f1 at 2152 / 142, settle-f2f3 at 376 / 16. No conflict with supabase/functions/**, src/core/buffs.js or their tests.
- 5. CONFIRMED section 6 violation (Medium, affects only the player's own screen). Today's skill deeds grade on getLevel (legacy.js:14045/14051). getLevel (legacy.js:2806) is skillLevelForDisplay: server XP plus the client's prediction, with unknown floored to 1. So Apprentice through 99 Club can unlock on predicted XP. The pack says 'server skills' but names no accessor. It must use HearthriseSkillRecord.skillLevelOf, where null means unknown. Any *ForDisplay call would also trip PRED-1.
- 6. CONFIRMED: the streak deeds would be taken back (Medium). streak_7 and streak_30 grade on player_state.streak_days, which is the current run and resets on a missed day. Once the persisted G.achievements record is deleted, a deed that already toasted 'unlocked' falls back to '3 / 7'. No server count records a best run. Fix: retire both, the same way gold and food are retired, and replace them with two server counts that only go up: ev:planted and burnt. Both writers are verified, and the replacement lore passes LORE-4 and LORE-6.
- 7. CONFIRMED: existing tests the pack does not list. away-time-and-offline.js:389-397 filters on `a.src==='streak.count'`, and its CONTROL (>=2) goes RED under the new catalogue. hunt-raids-and-screens.js:1243/1252 seeds and restores G.achievements. rooms-items-and-economy.js:2591/2602/2608/2637 still asserts that achievements survive the cloud snapshot. smoke-test.js:168-177/232-235 must park the new watcher: the pack says 'park under the suite' but does not name this file.
- 8. PLAUSIBLE: toast storm (Medium UX). The four sources become known at different moments: the lifetime tally, the skills record, the rooms record and the trophies mirror. A record seeded all at once on the first known tick would treat every deed whose source becomes known later, and is already earned, as a new crossing. Fix: seed each deed separately, add a DEEDS-B arm for it, and show one toast per batch.
- 9. PLAUSIBLE: a wrong 0 shown as fact (Low). dragon_slayer is gated on HearthriseCharms.countersKnown(), which checks the charms mirror (kills_by_class, bestiary-charms.js:108). The count comes from HearthriseTrophies.killsOfMonster, which reads a separate trophies mirror (kills_by_monster, bestiary-trophies.js:176-180) and returns 0 when that mirror is empty. If an envelope carries one sub-key without the other, the screen prints '0 / 1' as a fact. Fix: add HearthriseTrophies.countsKnown() and gate on that.
- 10. CONFIRMED, fold in: the Hero tab's Bounties cell (character-page.js:242/272), in the same function this pack edits, prints G.bountyHunter.completed as a record. That is a residue counter the client increments itself (legacy.js:4724). Re-point it to the server's bounty_turnins, live since 2026-09-21 with backfill, and show the pending dash while unknown, unless Pack 2 already did.
- 11. Gaps in the proposed guard. DEED-2's regex over source strings cannot catch a reader that reads residue. Replace it with a text scan of the new files for G.stats, G.bountyHunter, G.bestiary, G.achievements, _bestiary, getLevel( and ForDisplay(. Add a check that every tally key has a server writer: an engine stat() call, BENCH_COUNTERS, SKILL_ACTION_STAT, or an SQL 'stat' row. Add a glyph-atlas check, since the seven new rows had no glyphs. Names are exempt from the no-digit rule ('99 Club').
- 12. Verified OK. All 30 pack lore lines and the 2 replacements pass the LORE-4/LORE-6 rules (script, 0 findings). All 8 ROOMS ids have room.<id> rows in the server unlock catalogue. MONSTERS.dragon exists. An unimported src/data/deeds.js leaves the hr-accrue hash at 184a155a...114f (measured). Every tally key has a server writer, and 2026-09-19-lifetime-facts is APPLIED. Nothing pays, and no SQL or cross-player surface reads achievements. On a b559 snapshot these cheap guards exited 0: ci-shape, monolith, test-file, window-globals, no-new-prediction, no-client-copy, modal-census, lore-notes, arm-homing. Not run: get_advisors (the task forbids the database) and lane-done (read-only review, no branch, heavy steps forbidden).
- 13. Residual risks accepted, all affecting only the player's own screen. A player can forge their own toasts through devtools or localStorage; this pays nothing and reaches no one else. Crit and kill progress are the engine's counts and can differ from the crits predicted on screen in attended fights. A slot switch with a stale mirror can miss or replay one toast; the Hunter's Ledger (HLEDGER) has the same issue.

---

LANE lane/content-b5-4-deeds-of-the-realm: Deeds of the Realm (the 30 achievements graded on server counts). CLASS A, no Security review needed if C1-C4 hold.

BASE. `git switch -c lane/content-b5-4-deeds-of-the-realm 467dcf90` (origin/release/b559).
STEP 0 (hard precondition). Merge origin/set/b560 after Pack 2 has landed on it, and resolve any conflict in this lane.
- After the merge, both `git grep -n LIFETIME_KEYS -- src/data/lifetime-tally.js` and `git grep -n "HearthriseLifetime *=" -- src` must print a line.
- If either is empty, STOP and report 'blocked on Pack 2'.
- Never write a second reader of res.progress. Consume Pack 2's API; this brief assumes HearthriseLifetime.valueOf(key) returns number|null, and a differently named Pack 2 API is used as it is.
- LIFETIME_KEYS must contain: kills, crits, rare_drops, bounty_turnins, chopped, mined, fished, ev:harvest, ev:planted, tool_doubles, cooked, smithed, crafted, burnt. Add any missing key as a row in Pack 2's table.
- Pack 2 must return null (not 0) for a key absent from a truncated progress statement.

HOUSE RULES.
- Every new ESM import carries the BUILD.cache ?v= of the merged base (559 today), and `bash ./bump-version.sh --check` must be green.
- Tests/tools take no ?v=.
- Never deploy. Never push main or next. No git stash.
- Never commit docs/reports/visual-qa/findings.json or tests/live-hash-drift.baseline.json.
- No bNNN build tags in any new comment: CR-3 is a ceiling on the whole corpus.

CONDITIONS
- C1: Nothing new pays, gates, or crosses to another player. No migration, RPC, supabase/functions, src/core or packed src/data edit. `node tools/pack-edge.mjs hr-accrue --hash` must equal 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f.
- C2: Every graded number comes through its one owner, and null means unknown:
  - tally:<k> from HearthriseLifetime.
  - Skills from window.HearthriseSkillRecord.skillLevelOf(G,id). Never getLevel, skillXp or any *ForDisplay (legacy.js:2806 is server XP plus prediction).
  - Rooms from window.HearthriseRooms.roomsOf(G) {known,map}. Count only window.ROOMS ids at rung >= 1.
  - Dragon from HearthriseTrophies.killsOfMonster('dragon'), gated on a new HearthriseTrophies.countsKnown(). In src/render/bestiary-trophies.js add `export function countsKnown() { return mirror() !== null; }` and publish it in setupBestiaryTrophies. Do not gate on HearthriseCharms.countersKnown(), which checks the other mirror.
  - Unknown renders `<span class="bal-pending" role="status" title="Waiting for the server">—</span>`. Never 0, never Earned.
- C3: The new code neither reads nor writes G.stats, G.bountyHunter, G.bestiary, G.achievements or G._bestiary*. No `G.achievements` write survives anywhere in src outside src/features/smoke*.
- C4: The 'hearthrise:deeds-seen' record (HearthriseStorage) is for display only and gates nothing.

DATA: new file src/data/deeds.js (pure ESM, no window).
- Export DEED_GROUPS = [['fight','Fighting'],['gather','Gathering'],['bench','At the bench'],['home','Home'],['skills','Skills']].
- Export a frozen DEEDS array of rows {id, group, name, glyph, source, target, desc, lore}.
- In desc, {n} is filled from the target via toLocaleString and {monster} from MONSTERS[id].name. No digit in any desc or lore.
- Rows are listed as id | name | glyph | source | target | desc, followed by the lore line.

FIGHT
- first_kill | First Blood | uiSword | tally:kills | 1 | 'Slay your first monster'. Lore: 'Everyone remembers the first one: the shaking hands, the long walk home, and a story that grew taller with every telling'
- kill_50 | Slayer | uiSkull | tally:kills | 50 | 'Slay {n} monsters'. Lore: 'The camp has stopped asking how the day went, because the pack you carry home each evening answers the question for you'
- kill_250 | Champion | uiShield | tally:kills | 250 | 'Slay {n} monsters'. Lore: 'Farmers along the valley road wave you through now, and a few leave the gate unbarred on the nights they hear you pass'
- kill_1000 | Hero of the Realm | uiTrophy | tally:kills | 1000 | 'Slay {n} monsters'. Lore: 'Children play at being you in the lanes and argue over who gets the part, and not one of them will agree to be the monster'
- kill_5000 | Legendary | uiCrown | tally:kills | 5000 | 'Slay {n} monsters'. Lore: 'The old hunters no longer tell stories about the beasts of the valley; they tell stories about you, and they tell them carefully'
- crit_100 | Keen Edge | uiArrow | tally:crits | 100 | 'Land {n} critical hits'. Lore: 'A clean blow in the right place ends a fight before it has properly begun, and your hands have started finding that place alone'
- crit_1000 | Deadeye | uiBow | tally:crits | 1000 | 'Land {n} critical hits'. Lore: 'You no longer look for the gap in the armour; your eye is already there, and the blow is away before you know you chose it'
- rare_drop | Lucky | uiSpark | tally:rare_drops | 1 | 'Loot your first rare drop'. Lore: 'Something rare turned up among the bones and the scraps, and you will spend a long evening turning it over in the lamplight'
- rare_25 | Loot Goblin | uiChest | tally:rare_drops | 25 | 'Loot {n} rare drops'. Lore: 'The goblins have begun to speak of you with a sort of professional respect, which is as close as a goblin ever comes to envy'
- bounty_1 | Bounty Hunter | navBounty | tally:bounty_turnins | 1 | 'Turn in your first bounty'. Lore: 'The first notice torn from the board, the first purse handed across the counter, and a hunt master who now knows your name'
- bounty_50 | Wanted Poster | uiScroll | tally:bounty_turnins | 50 | 'Turn in {n} bounties'. Lore: 'The hunt masters pin the hardest notices where you will see them first, and the other hunters have learned not to argue'
- dragon_slayer | Dragon Slayer | dragon | monster:dragon | 1 | 'Slay the {monster}'. Lore: 'Somewhere in the hills a hoard has no keeper tonight, and every tavern from here to the coast has a song that is nearly true'

GATHER
- wood_500 | Lumberjack | woodcutting | tally:chopped | 500 | 'Cut {n} logs'. Lore: 'The woodpile by the door became a wall, the wall became a windbreak, and the stove has not once gone cold since it began'
- mine_500 | Quarryman | mining | tally:mined | 500 | 'Mine {n} ore'. Lore: 'The hill gives up its ore one stubborn swing at a time, and you have swung enough of them that the hill has started to give'
- fish_500 | Angler | fishing | tally:fished | 500 | 'Catch {n} fish'. Lore: 'The river keeps its secrets from most folk, but it has told you a good many of them, one patient cast at a time from the bank'
- plant_100 | Green Thumb | farming | tally:ev:harvest | 100 | 'Harvest {n} crops'. Lore: 'Seed, water, wait and pull: a slow rhythm the valley has kept for generations, and one your hands now keep without a thought'
- sow_250 | Sower | uiSeed | tally:ev:planted | 250 | 'Plant {n} crops'. Lore: 'Row after row of seed pressed into the dark with a thumb, and the valley has started to look like a quilt of your making'
- tool_100 | Good Tools | uiPickaxe | tally:tool_doubles | 100 | 'Have a good tool double your work {n} times'. Lore: 'A well-made tool pays its keeper back in the quiet moments, when the work comes out twice over and nobody but you notices'

BENCH
- cook_100 | Chef | cooking | tally:cooked | 100 | 'Cook {n} dishes'. Lore: 'The whole camp drifts toward your fire at supper, and even the ones who swore they were not hungry find a bowl in their hands'
- burnt_50 | Charcoal Cook | uiPot | tally:burnt | 50 | 'Burn {n} dishes'. Lore: 'Smoke in the rafters, a black crust on the pan and a dog that will eat anything; every good cook has a season like this one'
- smith_500 | Anvil-Ringer | uiAnvil | tally:smithed | 500 | 'Finish {n} smithing jobs'. Lore: 'The neighbours set their mornings by the sound of your hammer, and the few who once complained have long since given up'
- craft_500 | Steady Hand | crafting | tally:crafted | 500 | 'Finish {n} crafts'. Lore: 'Planks, bows, bindings and rings: things you made are in use all over the valley, and most of their owners never knew your name'

HOME
- house_lv1 | Homebody | uiHome | rooms:house | 1 | 'Build your first house room'. Lore: 'Four walls, a roof that mostly keeps the rain out, and a room that is yours; a small thing, and it changes everything after it'
- house_all | Estate Owner | uiCastle | rooms:house | null (target is the count of window.ROOMS ids, 8 today) | 'Build all {n} house rooms'. Lore: 'Kitchen, forge, library and all the rest under one roof, and travellers on the road have started calling it a manor'

SKILLS
- lv25_any | Apprentice | uiXp | skill:highest | 25 | 'Reach level {n} in any skill'. Lore: 'You have stopped following instructions and started noticing where the instructions were wrong, which is where it begins'
- lv50_any | Master | uiStar | skill:highest | 50 | same desc. Lore: 'The work that once took every scrap of your attention now leaves room to think, and those starting out come to you for advice'
- lv75_any | Grandmaster | uiMedal | skill:highest | 75 | same desc. Lore: 'Few left in the valley can teach you anything about this craft, and the ones who can have started asking you questions instead'
- lv99_any | 99 Club | uiCrown | skill:highest | 99 | same desc. Lore: 'There is nothing left in this craft that can surprise you, and the valley will be telling stories about your hands for an age'
- all_25 | Well-Rounded | uiTarget | skill:minMelee | 25 | 'Train Attack, Strength, Defense and Hitpoints to level {n}'. Lore: 'A sword arm, a strong back, a steady guard and a body that can take a blow: a fighter built from all four sides at once'
- all_50 | Combat Master | navCombat | skill:minMelee | 50 | same desc. Lore: 'Every part of the fight is yours now, the striking, the enduring and the guarding, and the foes of the valley have noticed'

RETIRED (no row): gold_1k, gold_10k, gold_100k, gold_1m, food_100, streak_7, streak_30.
- The realm keeps no lifetime gold-earned count and no count of buff foods eaten.
- streak_days is the current run and resets on a missed day. With the unlock record gone, the streak deeds would be taken back after they had toasted.

FEATURE: new file src/features/deeds.js (ESM). It imports '../data/deeds.js?v=559'.
- progressOf(deed, readers) is pure and returns {known, have, target, done, html}.
- The readers are {tally(k), skillLevel(id), skillIds(), roomsOf(), roomIds(), monsterKnown(), monsterKills(id), monsterName(id)}. Each returns null for unknown.
  - skill:highest is the max over Object.keys(window.SKILLS_DEF). It is null if any skill is null.
  - skill:minMelee is the min over attack, strength, defense and hitpoints.
  - house_all's target is roomIds().length.
- doneCount(readers) returns number|null, and null if any row is unknown.
- tick(deps) is pure. deps = {parked, uid, slot, states:{id:'unknown'|'open'|'done'}, store, busy, open}.
  - Returns parked | unknown | seeded | quiet | waiting | opened.
  - The record is rec[uid:slot] = {id: 0|1}, and it holds only deeds observed with a known source.
  - A known deed missing from the record is added silently. Seeding is per deed, so a source that becomes known late never toasts old deeds.
  - A crossing is a record value of 0 with the deed now done.
  - If busy() returns true, return waiting and leave the store untouched.
  - Otherwise call open(ids) once for the whole batch, set those ids to 1, and write.
  - At most 10 uid:slot keys are kept. Follow hunters-ledger.js:227-250.
- liveTick builds deps from HearthriseAuth.currentUserId(), HearthriseProfile.activeSlot(), window.HearthriseStorage, and busy = HearthriseSheet.anyOpen() || .ftue-root.
- open() shows one window.showAchToast. With several crossings the toast reads '<first name> and N more'.
- setupDeeds() does four things:
  - publishes `window.HearthriseDeeds = {rows, groups, progressOf, doneCount, tick, __setPollEnabled}`;
  - sets window.ACHIEVEMENTS = DEEDS;
  - sets window.checkAchievements = liveTick;
  - calls setInterval(liveTick, 1000).

RENDER: src/render/achievements.js (classic IIFE).
- Move window.achievementGlyphHTML here from legacy.js:14024-14027, body unchanged.
- In openAchievements, keep #ach-overlay, .ach-modal.hr-sheet, #ach-list and the [data-hr-dismiss] Close exactly as they are.
- Under the title 'Achievements', each group renders `<h4 class="muted">Label</h4>`, then its rows in catalogue order.
- Each row is `<div class="ach-row[ unlocked]"><div class="ach-icon">glyph</div><div class="ach-info"><b>name</b><small>desc</small><small class="muted">lore</small></div><div class="ach-progress">X</div></div>`.
- X is the pending mark when unknown, 'Earned' (plus .unlocked) when done, and otherwise min(have,target) / target via toLocaleString.
- Headings are never .ach-row.
- No new CSS and no inline style.
- Delete the :56 `G.achievements =` write.
- src/render/** line total may not fall (MONO-5).

HERO: src/features/character-page.js:240-242 and 271-272.
- The Achievements cell shows HearthriseDeeds.doneCount() (pending mark if null), then ' / ' and ACHIEVEMENTS.length.
- The Bounties cell reads HearthriseLifetime 'bounty_turnins' with the pending mark, replacing the residue G.bountyHunter.completed (legacy.js:4724 increments it client-side), unless Pack 2 already did this.

LEGACY: src/legacy.js, deletions only: 13977-14082, 14207-14209 and 14213-14214.
RESIDUE: in src/net/client-state.js, delete the 'achievements' entry at 258-259. The server's stale key is inert and needs no server change.
BOOT: in src/main.js, put `import { setupDeeds } from './features/deeds.js?v=559';` after :474 and `boot('deeds', setupDeeds);` after :534.
PARKING: in src/features/smoke-test.js at 168-177 and 232-235, park and restore HearthriseDeeds.__setPollEnabled exactly as _HL is handled.

EXISTING TESTS: edit them, delete none (TF-3).
- away-time-and-offline.js:389-397: assert that no row has source 'streak' and no desc matches /login/i.
- hunt-raids-and-screens.js:1243/1252: drop the G.achievements seed and restore.
- rooms-items-and-economy.js:2591/2602/2608/2637: drop 'achievements' from the lists.

NEW IN-PAGE TESTS go directly after 'render: achievements toast + modal' (hunt-raids-and-screens.js:1253). Each is at most 20 code lines with 0 G writes.
- DEEDS-A: progressOf with injected readers.
  - Unknown gives the pending html and is not done.
  - 999/1000 is not done; 1000 is done and 'Earned'.
  - house_all's target equals roomIds().length.
  - skill:highest is null if one skill is null.
  - monster:dragon is null while monsterKnown() is false.
- DEEDS-B: tick with an in-memory store.
  - The first sight seeds silently.
  - Busy returns waiting and the store is unchanged byte-for-byte.
  - A crossing opens once, and a batch of 2 is 1 call.
  - A deed that was unknown when seeded and later becomes known and done seeds silently.
  - Parked writes nothing.
  - Slot 1 seeds its own record.

GUARD: new file tests/deeds.mjs, plus --selftest. Checks:
- DEED-1:
  - 30 unique ids, and every group is in DEED_GROUPS.
  - Every glyph is a key of HR_GLYPHS, parsed from src/data/glyphs.js and glyphs-extra.js.
  - Every tally key is in LIFETIME_KEYS.
  - Every other source is in {skill:highest, skill:minMelee, rooms:house, monster:<an id from src/data/monsters.js>}.
- DEED-2: every tally key has a server writer, found as one of:
  - a stat('<k>' call in supabase/functions/hr-accrue/accrual.js;
  - a BENCH_COUNTERS stats key in src/core/artisan.js;
  - a SKILL_ACTION_STAT value in src/core/skill-sim.js;
  - `'stat', '<k>'` in supabase/migrations/*.sql.
- DEED-3: the 7 retired ids are absent, and no source is 'streak'.
- DEED-4:
  - A target above 1 means the desc contains {n}.
  - A monster row's desc contains {monster}.
  - house_all has target null and {n} in its desc.
  - No digit in any desc or lore. Names are exempt.
- DEED-5, the lore:
  - 100-140 characters.
  - Charset /^[A-Za-z ,.;:'’!?—-]+$/u.
  - No digit and no trailing '.'.
  - Unique, and uses no LORE-6 word (labelValues of COMPANION_LABELS and KEY_LABEL plus the ten EXTRA words).
  - Copies no line from lore-notes, charm-lore, homestead-lore, lucky-rumours, monster-notes or item-descriptions.
- DEED-6: pack('hr-accrue') contains no deeds file and names none.
- DEED-7:
  - legacy.js defines none of ACHIEVEMENTS, readPath or checkAchievements.
  - 'achievements' is not in RESIDUE_FIELDS.
  - No `G.achievements` in src outside the smoke files.
  - The two new files contain none of: G.stats, G.bountyHunter, G.bestiary, G.achievements, _bestiary, getLevel(, ForDisplay(.
- --selftest plants one defect for each id and requires each to be caught by its named id.
- RED before: the plain run on 467dcf90, before the legacy deletion, reports DEED-7.

The first line of tests/lore-notes.mjs's CLI block is `const main = process.argv.includes('--selftest') …`, around :346-350. Wrap everything from that line to the file's end in `if (/(^|[\\/])lore-notes\.mjs$/.test(process.argv[1] || '')) { ... }` with the body unchanged. Today, importing the file runs its main and process.exits before the importer's own checks (measured). Only then import labelValues.

REGISTRATION
- Append `node tests/deeds.mjs` and `node tests/deeds.mjs --selftest` as the last two lines of the existing 'Hearth Codex claims' step in .github/workflows/smoke.yml (after :2606). Do not add a new step.
- Then run `node tests/ci-shape.mjs --write`. Measured: it adds 2 keys at baseline:197-198. Without it, CI-SHAPE-6 and lane-done are RED.
- These hunks do not overlap the three in-flight lanes. If another batch-5 lane has already landed there, merge set/b560 again and re-run --write. Never hand-merge the JSON.

GATES: record every exit code you actually saw.
- `node tools/lane-done.mjs`; paste its last line.
- `node tests/deeds.mjs` and `node tests/deeds.mjs --selftest`.
- `node tests/lore-notes.mjs` and `node tests/lore-notes.mjs --selftest`.
- `node tests/arm-homing-guard.mjs`. It is not in lane-done, and it goes RED if any G.achievements write survives (measured).
- `node tests/ci-shape.mjs`.
- `node tools/pack-edge.mjs hr-accrue --hash` must print 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f.
- `node tests/run-smoke.mjs --only DEEDS-`, then `--only "achievements toast"`. Read the check marks and crosses; a filtered run's exit code is never a verdict.
- Do not use *ForDisplay (PRED-1).
- Publish with a literal `HearthriseDeeds =` so window-globals-exist sees it.
- Every export must be consumed (dead-exports).
- Do not --write the monolith, test-file or comment-ratio baselines. The Coordinator re-pins them once for the set.

PROOF PNGs go only to qa/content-b5-4-deeds-of-the-realm:
- The modal, top and scrolled, at 1280x800 and 922x423, in both the pending and the settled state.
- The Hero Account grid at both sizes.
- One toast.

PLAY GATE (QA account):
- Open Achievements from Pack 2's door and from the profile button.
- Reload. Expect no toast on boot, and dashes only until the settle.
- Fighting and Gathering figures must equal Pack 2's Lifetime figures.
- Cross one near target and see exactly one toast. Reload and see no repeat.

REPORT: one table plus at most 3 sentences. Name any census you re-pinned with its own --write.
