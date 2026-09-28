# 2. The Hero's Tally: Lifetime Stats and the Hero tab rebuilt on the realm's own lifetime counts

VERDICT: GO-WITH-CHANGES | class A: true | est 2 h

PLAYER VALUE: The screens a player uses to answer 'how far have I come' currently show numbers the browser keeps for itself:
- Kills on the Hero card ran up to 368 ahead of the server live (legacy.js:5076-5083).
- Deaths is a client guess.
- 'Forged', 'Buried bones' and 'Total gold spent' have no writer, so they read 0 forever (lifetime-stats.js:141, :161-162).
- 'Time Played' and 'Save first seen' are device stamps.

Lifetime Stats also has no door on the shipped Home. Its only trigger is injected into .feat-buttons, and home-dashboard.js:39-42 hides that row, as it hides the toolbar.

The server already sends about 16 lifetime counts on every envelope, and nothing on the client reads them. They are the stat rows written at accrual.js:2697-2718, :3684-3692 and :4114-4128, plus state.deaths_lifetime.

After this pack:
- Every figure is the realm's, or shows a pending dash.
- Both modals get real doors.
- A player in days 7-30 sees crits, falls, logs, ore, fish, dishes and bars, tool doubles, bounties, trophies and kinds studied, each grounded in a count the server keeps.

PROBLEMS TO FIX IN THIS LANE (each is a condition):
- #1 HIGH | CONFIRMED | the TALLY-4 guard as specified would pass without checking anything | Trigger: the brief builds TALLY-4 on `labelValues` imported from tests/lore-notes.mjs. That file runs its own main when imported and ends with `main().then((code) => process.exit(code))` (tests/lore-notes.mjs, last lines). Proved on an extract of 467dcf90: a guard that imports it and then does exit(1) actually exits 0, and passing `--selftest` runs lore-notes' own selftest instead. So TALLY-1..6 and their mutation proofs would be cut off and CI would show green. | Blast radius: CI integrity. | Fix: tests/lifetime-tally.mjs imports no tests/*.mjs; copy the 6-line labelValues and the CHARSET locally. | Existing tests catch it? No (guard-hygiene R2 only checks the flag changes the exit path). | Guard to add: the selftest needs a CLEAN arm plus one plant per id, and the file exits only with its own code.
- #2 HIGH | CONFIRMED | six existing in-page tests go RED and the pack's file list misses all of them | (a) smoke/boot.js:141: the tap census expects 'lifetime-stats-place', which disappears when addStatsTrigger is deleted. (b) smoke/hunt-raids-and-screens.js:1147-1163: expects the sections Combat/Economy/Bounty Hunter/Production and seeds G.stats.kills=4242. (c) smoke/hunt-raids-and-screens.js:1660-1677: EXPECT_FEATS still includes 'lifetime stats'. (d) smoke/away-time-and-offline.js:426: its CONTROL requires a kill-streak row. (e) smoke/quests-chronicle-and-bonus.js:2071: requires a 'time' cell. (f) smoke/market-night-and-prices.js:4134: matches /Total kills lifetime/. | Blast radius: any red in-page test fails the GitHub smoke job, so the release cut is blocked. | Fix: rewrite each in place (TF-3 does not allow the test count to fall). | Caught? Yes, but only at the cut.
- #3 MEDIUM | CONFIRMED | dead CSS and CI registration left out of the pack | Once the trigger and its test references are gone, dead-css goes red on `.stats-btn-trigger` (legacy.css:1148-1155, audit-overrides.css:146-159 and :209) and on the ui-overlap.js:35-43 pairs. A new smoke.yml command also needs a tests/ci-shape.baseline.json entry, otherwise CI-SHAPE-6 fails. | Fix: delete those rules and pairs. Add 2 lines to the existing 'Item flavour coverage' step after :2582 and 2 'client-guards' baseline entries; no new step. | Caught? Yes (lane-done).
- #4 MEDIUM | CONFIRMED | Section 6: the pack creates a new disagreement between two screens | Trigger: the combat activity bar's 'Lifetime N' chip still shows the client's own kill count (legacy.js:11248 and :11282, shown whenever .ab-vigour is absent), while the Hero card will show the server's count. | Blast radius: self (the browser says two different numbers). | Fix: convert both lines in place with HearthriseLifetime.markup('kills'); 0 net lines. | Caught? No. | Guard: TALLY-3 checks the 'ab-tkills' line.
- #5 MEDIUM | CONFIRMED | new doors open a screen built on client-kept numbers, and the 'every figure is the realm's' claim is too broad | The Achievements modal reads the client's G.achievements (render/achievements.js:52-69; RESIDUE_FIELDS 'achievements'). Today its only doors (.prof-toolbar and .feat-buttons) are hidden on the shipped Home, so the Hero-tab and More-sheet buttons would newly surface client-authored progress. The Hero grid's Achievements cell and its Collections cell (collection-log.js:163-176, read from G.bestiary/G.collection) also stay client-kept. | Fix: drop both Achievements doors from this pack (Pack 4 owns them); leave those two cells unchanged and name them as residual. | Caught? No.
- #6 MEDIUM | CONFIRMED | the fold rules are wrong at the edges | (a) A key that is present in a truncated statement is the full server value, but the pack shows it as a floor with '+' and the title 'still on its way', which is untrue. (b) Nothing resets the cache when the character slot changes; multi-character.js supports noReload, so one character's count could appear on another. (c) Nothing checks envelope order, so an older `version` arriving late could pull a count back. (d) death-sheet.js:1684 sends a hand-built {state:{recovering_until:null}}, so deaths_lifetime must be read only when it is the state object's own key. | Fix: the rules as written in the brief. | Caught? No. | Guard: TALLY-6 fixtures.
- #7 LOW | CONFIRMED | shows 0 before the server has answered | Total XP adds up skillXpOr(G,k,0), so it reads '0' before any skill is known (lifetime-stats.js:73-81). The Bounty Hunter level falls back to 1. | Fix: show the pending dash unless HearthriseSkillRecord.isSkillXpKnown.
- #8 LOW | CONFIRMED | the MONO-5 floor could be breached | Moving sectionsHtml out of src/render shrinks the render layer. On b559 it has 196 lines of slack (7829 lines against a floor of 7633), and that slack is gone if another lane raises the floor first. | Fix: keep the renderer in src/render/lifetime-stats.js; only the observer and fold go in src/features.
- #9 LOW | CONFIRMED | dead code left behind | With the Time played cell removed, tickPlayMs/HearthrisePlayTime (legacy.js:3363-3381, fed by the 10fps loop at :11454) no longer feeds any screen. fmtDuration in character-page.js becomes unused. The RESIDUE_FIELDS 'stats' comment (client-state.js:120-122) now says something false. | Fix: delete the dead code and fix the comment in place; this also lowers MONO-1.
- #10 PLAUSIBLE | two server kill counters | The server keeps both stat:kills and stat:ev:kill_any (accrual.js:2723-2726; hr_credit_kills writes both). Hero 'Monsters slain' could differ from the Journeyman's Road 'Defeat 500 monsters' figure. Separately, the per-kind kill rows (bestiary counters) will not add up to Monsters slain. | Fix: the play gate records both kill figures side by side and checks the Hunter's Ledger per kind, never the sum; any gap goes to the server side, not a client-side fix.
- #11 PLAUSIBLE | merge conflicts with other batch-5 packs | Shared spots: the character-page.js Account grid (Pack 4's Achievements line sits between Quests and Bounties), index.html :723, the smoke.yml flavour step and ci-shape lines 187-188, accrue.js :4052-4070, record.js :1859 and legacy.js :13370. The three in-flight branches do not overlap with this pack: their smoke.yml changes are at ~373/~1409/~2149, ci-shape at ~15/~141, plus supabase/** and lane-done.mjs. | Fix: the second lane to merge brings the release into itself.
- RESIDUAL (accepted) | self-only surfaces | Nothing in this pack crosses to another player. The edge hash stays 184a155a…114f; I proved it with the new data and feature files and the render/feature edits all present. Still client-kept after this pack: the Hero Achievements and Collections cells, the Home 'today' tiles (profile-launchpad differences), and hidden legacy dashboards (legacy.js:7155, 12970, 16836). The world tick (tick-*.js) writes no stat rows yet, so once it takes over from accrue these counts will freeze unless it writes the same rows; TALLY-1's sources must follow it then.

---

LANE lane/content-b5-2-heros-tally: "The Hero's Tally". CLASS A: client-only, no migration, no edge deploy, no Security apply.

Security review (read-only, 467dcf90):
- `node tools/pack-edge.mjs hr-accrue --hash` printed `hr-accrue 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f`. It printed the same with the new data and feature files planted and the render/feature files edited.
- The packed payload contains no src/net, src/features, src/render, legacy.js or index.html.
- Every count this lane shows is the player's own, taken from what hr_state_of already projects. Nothing crosses to another player.

BASE AND RULES
- Start with `git fetch origin release/b559 && git switch -c lane/content-b5-2-heros-tally 467dcf90`.
- Every new import uses `?v=559`.
- Before you report, merge the current origin/release/b559 (or the set branch the Coordinator names) into the lane and resolve every conflict yourself.
- Never deploy. Never push main or next. Never touch the database or tests/live-hash-drift.baseline.json. Never commit docs/reports/visual-qa/findings.json. No git stash (commit WIP instead).
- No bNNN in any new comment or test name.
- Zero new comment lines in src/net/accrue.js and src/net/record.js.
- src/legacy.js net lines must be 0 or fewer.
- No colour literals or inline styles.
- Nothing is written into G. Nothing is added to RESIDUE_FIELDS. No reconcile* function and no *ForDisplay call is added.

WHAT IT DOES
Lifetime Stats and the Hero tab show only counts the server keeps. The sources are:
- rows in hr_state_of `progress` with kind='stat' and period=''
- quest rows with kind='quest', state='claimed', period=''
- `state.deaths_lifetime`
- the existing server mirrors: HearthriseCharms, HearthriseTrophies, the play streak, balances and marks.

A count the server has not stated yet shows HearthriseBalance.countMarkup(null), the pending dash. It never shows 0.

1. src/data/lifetime-tally.js (NEW, pure constants, no imports)
- `LIFETIME_KEYS`, frozen: kills, crits, rare_drops, deaths, bounty_turnins, gathered, chopped, mined, fished, tool_doubles, ev:planted, ev:harvest, cooked, burnt, smithed, crafted.
- `LIFETIME_SKIP = { refined: 'always smithed + crafted (src/core/artisan.js BENCH_COUNTERS)' }`.
- `LIFETIME_LORE` holds exactly these five lines. I checked each: 120, 126, 124, 122 and 120 characters, no charset, digit or stat-word problems.
  - fighting: 'The lodge keeps its tally in chalk on a slate by the door, and nobody has ever talked the lodge into rubbing a mark away'
  - kinds: 'A hunter learns a kind by the dozen and never by the one, so the lodge keeps a separate slate for every kind of beast it knows'
  - gathering: 'The woodpile, the ore heap and the smoking rack each keep their own count, and not one of them has ever been caught in a lie'
  - bench: 'A bench remembers the work done at it in scorch marks and worn grain, long after the hands that did the work have moved on'
  - purse: 'Only what sits in the purse today; the counting-house keeps no tally of what came in or went out in all the years before'

2. src/features/lifetime-tally.js (NEW ESM)
Imports:
- '../data/lifetime-tally.js?v=559'
- isCompleteProgressStatement from '../net/property-record.js?v=559'
- MONSTER_CLASSES from '../core/bane.js?v=559'
- Never import net/accrue.js.

It publishes window.HearthriseLifetime when the module loads. The module cache `view` starts as null.

`export function fold(prev, res, questIds)` is PURE and follows these rules in order:
- (a) If res is not an object, return prev.
- (b) Different character: if res.state.slot and prev.slot are both finite and differ, start from empty.
- (c) Older envelope: if res.version and prev.version are both finite and res.version < prev.version, return prev.
- (d) If Array.isArray(res.progress):
  - complete = isCompleteProgressStatement(res).
  - Lifetime rows are those with kind 'stat', period '', and a finite value of 0 or more.
  - For each LIFETIME_KEYS key where a row is present:
    - complete: {n: row value, exact: true}
    - truncated: {n: max(prev.n ?? 0, row value), exact: row value >= prev.n}
  - For each key where the row is absent:
    - complete: {n: 0, exact: true}
    - truncated, and prev has the key: {n: prev.n, exact: false}, a floor
    - truncated, and prev lacks the key: unknown
  - questsClaimed counts rows with kind 'quest', state 'claimed', period '' whose key is in questIds. Complete: exact. Truncated: max(prev, count), exact false.
- (e) If res.state has its OWN property deaths_lifetime and it is finite, deaths = {n, exact: true}. This beats the stat row.
- (f) If there is neither a progress array nor an own deaths_lifetime, return prev by identity. death-sheet.js:1684 sends {state:{recovering_until:null}}.

Other functions:
- `noteEnvelope(res)`: sets view = fold(view, res, ids of window.QUEST_DEFS) and returns {mode, keys}. It must never throw.
- `count(key)` returns {n, exact} or null.
- `quests()` returns {n, exact, of: QUEST_DEFS.length} or null.
- `markup(key, fmt = n => n.toLocaleString())`:
  - exact: esc(fmt(n))
  - floor: `<span title="At least this many; the full count is still on its way" aria-label="at least ">` + fmt(n) + '+</span>' (append the number to the aria-label)
  - unknown: countMarkup(null)
- `kindsTotal` = MONSTER_CLASSES.length (11).

Export only `fold` (the Node guard imports it). Everything else lives on window only.

3. Hooks (one line each, no comment lines)
- src/net/accrue.js, after :4052:
  `try { const LT = (typeof window !== 'undefined') && window.HearthriseLifetime; if (LT && typeof LT.noteEnvelope === 'function') written.lifetime = LT.noteEnvelope(res); } catch (e) {}`
- src/net/record.js, after :1859:
  `hydrationStep('lifetime', () => { if (typeof window !== 'undefined' && window.HearthriseLifetime) window.HearthriseLifetime.noteEnvelope(verdict.body); });`
- src/main.js, after :267:
  `import './features/lifetime-tally.js?v=559';`

4. src/render/lifetime-stats.js (classic script; it STAYS in src/render because of the MONO-5 floor)
- Publish `window.HearthriseLifetimeSheet = { sectionsHtml(view, readers) }`. It is pure over its inputs, and esc() every label.
- openLifetimeStats() calls sectionsHtml with the live readers.
- Keep .stats-card.hr-sheet, .hr-sheet-head, .hr-sheet-body, .stats-close, ESC to close, and close on a scrim click.
- Title: 'Lifetime Stats'.
- Sub line: 'Counted by the realm. A dash is a count still on its way.'
- Tiles:
  - Combat level and Total level, from the existing getters.
  - Total XP: the sum of HearthriseSkillRecord.skillXpOf values. Show the dash unless every summed skill is known.
  - Monsters slain, Falls, Bounties turned in, Resources gathered, Dishes cooked.
- Fighting section (lore line: fighting):
  - Monsters slain (kills)
  - Critical hits (crits)
  - Rare drops (rare_drops)
  - Falls (deaths)
  - Bounties turned in (bounty_turnins)
  - Bounty Hunter level: getBountyHunterLevel(); dash unless isSkillXpKnown(G,'bountyHunter')
  - Beasts on the trophy wall: HearthriseTrophies.wallRows({cap:100000}).rows.length; dash unless claimsKnown()
  - Kinds studied: 'N of 11', where N = classes with HearthriseCharms.rankOfClass of 1 or more; dash unless countersKnown()
- Kills by kind (lore line: kinds): HearthriseCharms.charmClasses() sorted by kills, highest first. Show one pending row until countersKnown(). Show 'None yet' when known and empty.
- Gathering section (lore line: gathering):
  - Resources gathered (gathered)
  - Logs cut (chopped)
  - Ore mined (mined)
  - Fish caught (fished)
  - Doubled by a good tool (tool_doubles)
  - Crops planted (ev:planted)
  - Crops harvested (ev:harvest)
- At the bench section (lore line: bench):
  - Dishes cooked (cooked)
  - Dishes burnt (burnt)
  - Smithing jobs done (smithed)
  - Crafts finished (crafted)
- Purse section (lore line: purse): Gold and Gems (balText), and Bounty Marks (HearthriseMarks.fmtMarks(G)).
- Each section shows its lore line as a <div class="muted tiny">.
- Delete these rows: Save first seen, Time Played, both kill streaks, Total gold earned, Total gold spent, Free rerolls left today, Forged, Buried bones, Buffs consumed, Harvested, Refined, Kills by Family, Kills by Tier.
- Delete _fmtTime and addStatsTrigger (:177-206).

5. src/features/character-page.js
- Hero card Kills (:191, :224): HearthriseLifetime.markup('kills', fmt).
- Account grid:
  - Quests: quests() shown as 'N / M'; a floor shows 'N+ / M'; the dash while unknown.
  - Bounties: markup('bounty_turnins', fmt).
  - The Time played cell becomes 'Days running': HearthriseAccrual.playStreakKnown(G) ? HearthriseStreakChip.days(G) : countMarkup(null).
  - Delete fmtDuration and the reveal.time branch.
  - Leave the Achievements and Collections cells UNCHANGED. They are still client-kept residue; do not describe them as the realm's.
- New foot row under the grid: ONE .btn 'Lifetime Stats' with the uiTrend glyph, at least 44px tall, calling window.openLifetimeStats().
- NO Achievements door anywhere. That modal reads the client's G.achievements; Pack 4 owns the door.

6. index.html, after :723: add one button only.
`<button class="btn tap" type="button" id="more-lifetime" onclick="document.getElementById('more-modal').classList.remove('show');window.openLifetimeStats&&window.openLifetimeStats()">Lifetime Stats</button>`

7. src/legacy.js (edit in place)
- :13370 becomes:
  `rows.push({g:'uiTarget', t: 'Monsters slain, all time', v: (window.HearthriseLifetime ? window.HearthriseLifetime.markup('kills') : '—')});`
- :11248 becomes:
  `const totalKills = window.HearthriseLifetime ? window.HearthriseLifetime.markup('kills') : '—';`
- :11282 prints `+totalKills+` inside the <b>, with no toLocaleString.
- Delete tickPlayMs and window.HearthrisePlayTime (:3363-3381).
- Change the interval at :11454 to `setInterval(function(){ refreshActivityBar(); }, 100);`, editing its comment at :11452-11453 in place.
- Drop playMs:0 from :731, editing the comment at :728-730 in place.

8. Dead-trigger cleanup
- Delete the .stats-btn-trigger rules at legacy.css:1148-1155 and audit-overrides.css:146-159.
- Remove the `.stats-btn-trigger` selector from the comma list at audit-overrides.css:209, keeping the .btn half.
- Remove the two .stats-btn-trigger pairs and their comment at src/features/ui-overlap.js:35-43.

9. src/net/client-state.js:120-122: rewrite the 'stats' comment in place (0 net lines). The envelope DOES project the lifetime stat rows; screens read HearthriseLifetime, never this bag.

TESTS

A. tests/lifetime-tally.mjs (NEW)
Import NO tests/*.mjs. tests/lore-notes.mjs calls process.exit() when imported: I proved a planted exit(1) came out as 0. Copy its 6-line labelValues and its CHARSET here.
- TALLY-1: every LIFETIME_KEYS key has a writer. Sources:
  - `stat('<key>'` in supabase/functions/hr-accrue/accrual.js
  - BENCH_COUNTERS[*].stats keys (src/core/artisan.js)
  - SKILL_ACTION_STAT values (src/core/skill-sim.js)
  - 'ev:harvest' and 'ev:planted' in EVENT_COUNTER_PROJECTION (src/net/accrue.js)
  - 'bounty_turnins' in supabase/migrations/2026-09-19-lifetime-facts-off-the-ledger.sql
- TALLY-2: every key those engine sources write is in LIFETIME_KEYS or LIFETIME_SKIP.
- TALLY-3:
  - src/features/lifetime-tally.js, src/render/lifetime-stats.js and src/features/character-page.js contain none of: G.stats, stats.kills, stats?.kills, stats.deaths, totalGoldEarned, totalGoldSpent, playMs, firstSeen, bestKillStreak, killStreak, forged, buriedBones, buffsConsumed, killsByFamily, killsByTier, G.quests, bountyHunter.completed.
  - In src/legacy.js, the line containing 'ab-tkills' and the line containing 'Monsters slain, all time' each contain 'HearthriseLifetime' and do not contain 'stats'.
  - tickPlayMs and HearthrisePlayTime appear nowhere in src/** outside the suite.
- TALLY-4: LIFETIME_LORE has exactly the 5 keys; each line is 100-140 characters, matches /^[A-Za-z ,.;:'’!?—-]+$/u, has no digit and no trailing '.', uses no stat word (COMPANION_LABELS + homestead KEY_LABEL + the lore-notes EXTRA_VOCAB), and copies no MONSTER_NOTES, ITEM_DESC or lore line.
- TALLY-5: pack('hr-accrue') has no file whose origin or content names lifetime-tally.
- TALLY-6: fold fixtures:
  - a slot change resets
  - an older version is ignored
  - {state:{recovering_until:null}} returns prev by identity
  - a key missing from a truncated statement stays as a floor
  - a present row in a truncated statement never lowers
- `--selftest`: a CLEAN arm is green, and one plant per TALLY-1..6 goes RED under its own id. The process exits only with its own code.

Registration:
- .github/workflows/smoke.yml: two lines in the existing 'Item flavour coverage - every item has a line' step, right after `node tests/lore-notes.mjs --selftest` (:2582): `node tests/lifetime-tally.mjs` and `node tests/lifetime-tally.mjs --selftest`.
- tests/ci-shape.baseline.json: both commands as "client-guards". Run `node tests/ci-shape.mjs --write` and confirm the diff is exactly +2 lines.
- No new step.

B. In-page tests in src/features/smoke/farm-and-profile.js (no comment lines, 20 code lines or fewer each, 0 G seeds)
- TALLY-A: fold fixtures:
  - A complete statement with kills 400 over an exact 900, in a newer version, gives 400 exact.
  - A truncated statement with no kills row over 900 keeps 900 as a floor.
  - A truncated statement with kills 450 over 400 gives 450 exact.
  - An envelope with no progress returns prev by identity.
  - state.deaths_lifetime 3 beats a stat row of 2.
- TALLY-B: HearthriseLifetimeSheet.sectionsHtml with stub readers:
  - An unknown view has .bal-pending in every value cell.
  - No label matches /Time Played|first seen|gold spent|gold earned|Forged|Buried bones|kill streak|Refined/i.
  - A known view prints Monsters slain as 4,812; a floor view prints 4,812+.
- RED-before/GREEN-after: record both failing on 467dcf90 and passing on the lane.

C. Rewrite these existing tests IN PLACE (they go red on this change; the test count may not fall)
1. smoke/boot.js:141: drop 'lifetime-stats-place'.
2. smoke/hunt-raids-and-screens.js:1147-1163: no seeds. Assert the headings Lifetime Stats, Fighting, Gathering, At the bench and Purse; every value cell is a number or .bal-pending; ESC closes.
3. smoke/hunt-raids-and-screens.js:1660-1677: EXPECT_FEATS = ['achievements','bestiary','codex']; drop the .stats-btn-trigger selector.
4. smoke/away-time-and-offline.js:416-431: CONTROL is that the modal renders 'Monsters slain'; assert no /streak/i anywhere in the Lifetime Stats text.
5. smoke/quests-chronicle-and-bonus.js:2051-2073: expect a 'days running' cell; the Quests and Bounties cells each show a digit or .bal-pending; no 'time played' label.
6. smoke/quests-chronicle-and-bonus.js:2076-2083: assert !('HearthrisePlayTime' in window) && !('tickPlayMs' in window). Use the string form, not a window.X read.
7. smoke/market-night-and-prices.js:4134: match /Monsters slain, all time/.

GATES (write down the exit code you saw for each)
- `node tools/pack-edge.mjs hr-accrue --hash` must print exactly `hr-accrue 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f`.
- These must each exit 0: `node tests/lifetime-tally.mjs`, `node tests/lifetime-tally.mjs --selftest`, `node tests/lore-notes.mjs`, `node tests/ci-shape.mjs`, `node tests/dead-css.mjs`, `node tests/dead-exports.mjs`, `node tests/window-globals-exist.mjs`, `./bump-version.sh --check`.
- `node tools/lane-done.mjs`: paste its last line; it must be 'lane-done: all green.'
- Do NOT run the in-page suite, visual-qa or run-ci-local; that is the Coordinator's at the cut.
- Proof PNGs: the Hero tab and Lifetime Stats, each in the pending and the settled state, at 1280x800 and 922x423. Commit them ONLY to qa/content-b5-2-heros-tally.

Post-cut play gate (Coordinator), on the QA account:
- Open the Hero foot door and the More-sheet door, reload, and let it settle.
- Monsters slain must be equal on the Hero card, Lifetime Stats, the welcome card and the combat-bar chip.
- Each kills-by-kind row must equal the Hunter's Ledger for that kind. The rows' SUM is not expected to equal Monsters slain.
- Record Monsters slain next to Journeyman's Road 'Defeat 500 monsters' (stat:kills against stat:ev:kill_any) and report any gap. Never reconcile it on the client.

CONFLICTS
Other batch-5 packs share: the character-page.js Account grid (Pack 4's Achievements line sits between Quests and Bounties), index.html :723, the smoke.yml flavour step and ci-shape lines 187-188, accrue.js :4052-4070, record.js :1859, and legacy.js :13370. Whichever lane merges second merges the release into itself and re-runs its gates.

There is no overlap with lane/world-tick-stall-after-repoint, lane/settle-before-mutate-f1 or lane/settle-before-mutate-f2f3.

REPORT
One table plus at most three sentences. Name what remains client-kept:
- the Hero Achievements and Collections cells
- the Home 'today' tiles
- the hidden legacy dashboards (legacy.js:7155, 12970, 16836)
