# Content pack 5: 5. Bestiary Field Notes: a hunter's note for every one of the 108 monsters

VERDICT (security/systems pre-review): GO-WITH-CHANGES | class B

## PLAYER VALUE
The bestiary Tyler asked for (Huntera-style) gets a voice. Opening a monster you have slain shows a line of hunter's lore under its name, so the 2,500-kill trophy ladder is attached to a creature the player knows, not just to a stat block.

## THE CORRECTED LANE BRIEF (execute this)
LANE: lane/bestiary-field-notes. Branch from origin/next (= set/b554 @ 9c70fa98), not main. Release class B: client-only, no Security, rides the 20:00 UTC daily cut, never out of band. Owner: systems-engineer for the wiring; game-designer voice rules for the 108 lines.

GOAL: Every monster gets one line of hunter's lore. It renders wherever the monster's NAME renders, under the SAME predicate, and nowhere the name renders '???'.

FILES
1. NEW src/data/monster-notes.js. `export const MONSTER_NOTES = Object.freeze({ <id>: '<note>', ... })`.
   - Exactly the 108 MONSTERS ids: T1 14, T2 16, T3 16, T4 21, T5 20, T6 21, across 11 families.
   - Imports nothing. Short header comment with no build numbers (comment-ratio CR-2/3). No hex anywhere.
   - Voice: 1-2 sentences, 60-160 chars, original IP, lore or behaviour and never a stat, no terminal full stop (the ITEM_DESC convention in item-descriptions.js).
   - Consistent with family, tier and drop table.
   - The 14 boss:true rows get a named history: elk_king, broodmother, treant, stonejaw, necromancer, lich, grim_reaper, vharek, dragon, draconia, ashwing, elder_cinder, iron_colossus, the_unlit.
   - HARD RULES (guarded):
     - Charset /^[A-Za-z ,.;:'’!?—-]+$/u (no digits, emoji or HTML).
     - Unique.
     - Never hint the monster's own elementWeak. That weakness is the Bestiary Charms rank-1 reward.
     - The 6 hiddenElement rows mention no element at all: void_mote, shadow_creeper, starhusk, void_parasite, the_silence, the_unlit.
     - Never name an item the monster does not drop.
     - Nothing unreleased; the text ships in the public bundle.
   - Seed lines (keep): slime 'It eats whatever the rain washes into the cellar, and the cellar is never quite clean again'; kobold 'Kobolds hoard anything that glints, and they will fight harder for a brass button than for their lives'; war_king 'He crowned himself on a field of his own dead, and wears the crown still, though no one alive will kneel'; broodmother 'The old woodcutters say the forest went quiet the year she came, and it has not sung since'.
   - Do NOT add a note field to src/data/monsters.js. It is edge-packed.
2. src/main.js.
   - `import { MONSTER_NOTES } from './data/monster-notes.js?v=<BUILD.cache, currently 553>';` beside the monster-art import (line 29).
   - `window.HearthriseMonsterNotes = MONSTER_NOTES;` beside window.HearthriseMonsterArt (line 112).
   - Not window.MONSTER_NOTES: the Hearthrise* name is what window-globals-exist checks.
3. src/features/collection-log.js, monDetailHtml only (382-406).
   - var note = (window.HearthriseMonsterNotes || {})[id]. Only if typeof note === 'string', emit `<div class="hr-cl-stats hr-cl-note">` + note + `</div>` after the centred header div closes (after line 402) and before the Combat section.
   - Otherwise emit ''.
   - Add NO CSS rule: a rule with the file's var(--x,#hex) fallback trips css-literal-ratchet.
   - Do not touch MILESTONES (pack 3), getStats or the found predicate.
4. src/render/bestiary.js, openBestiary row (84-95).
   - Let named = disc || tKills > 0 (the predicate that already un-???s the name).
   - When named and the note is a string, append `<small class="br-note">` + note + `</small>` after the Tier small. Otherwise append nothing.
   - No CSS rule. Hand typography and placement for both surfaces to the Art Director.
5. src/features/smoke/quests-chronicle-and-bonus.js: three tests (below). Add hrCharmDriver to the one-line _harness import.
6. docs/SYSTEMS_MAP.md §5: one line. 'Hunter's note per monster: src/data/monster-notes.js (client-only display, never edge-imported); FIELDNOTES-1 requires exactly one per MONSTERS id, so a new monster ships with its note.'

TESTS (in-page)
- FIELDNOTES-1 (tryRun, data).
  - Sorted Object.keys(window.HearthriseMonsterNotes) equals sorted Object.keys(window.MONSTERS). The message names the missing and orphan ids.
  - Object.isFrozen is true.
  - Each note is a string of 60-160 chars, matches the charset whitelist, and is unique.
  - ELEMENT: SYN = { ember:/\b(ember\w*|fire\w*|flame\w*|burn\w*|blaz\w*|scorch\w*|smoulder\w*|heat|torch\w*|kindl\w*|candle\w*|lantern\w*)\b/i, frost:/\b(frost\w*|ice|icy|cold\w*|freez\w*|snow\w*|chill\w*|winter\w*|rime)\b/i, poison:/\b(poison\w*|venom\w*|toxi\w*|blight\w*)\b/i }. No note matches SYN[M.elementWeak]. If M.hiddenElement === true, no note matches any SYN.
  - DROPS: for every ITEMS x whose .n contains a space, if note.toLowerCase() includes x.n.toLowerCase(), then x must be in M.drops ids.
- FIELDNOTES-2 (tryRunAsync, attended/residue path, collection log).
  - snap = snapshotG(); G.bestiary = { kobold: { kills: 1 } }.
  - HearthriseCollection.open(); click [data-cl-tab="bestiary"]; click [data-mon="kobold"].
  - Assert #hr-cl-body contains the kobold note.
  - Click [data-cl-back]. Assert the slime cell has no data-mon and the modal HTML contains no slime note.
  - finally: remove #hr-cl-modal; restoreG(snap); saveLocal().
- FIELDNOTES-3 (tryRunAsync, away/server path, bestiary).
  - snap; prev = G._bestiaryTrophies; G.bestiary = {}; rig = hrCharmDriver().
  - await rig.drive({ kills_by_class:{}, kills_by_monster:{ goblin: 12 }, trophies:[] }); window.openBestiary().
  - Assert #best-list contains the goblin note and no slime note.
  - FAIL-SAFE arm: stash and delete window.HearthriseMonsterNotes, reopen, assert the goblin name renders and the list contains no 'undefined'. Restore the namespace.
  - finally: rig.restore(); hide #best-overlay; restore G._bestiaryTrophies; restoreG(snap).
- MUTATION PROOFS (record in the commit, each seen red, then reverted):
  - Delete the slime entry: FIELDNOTES-1 red.
  - Give the_unlit a note containing 'flame': FIELDNOTES-1 red.
  - Change the bestiary.js predicate to `disc` only: FIELDNOTES-3 red.
  - Misspell the HearthriseMonsterNotes read in bestiary.js: `node tests/window-globals-exist.mjs` red.

GATES (branch on real exit codes)
- `node tools/pack-edge.mjs hr-accrue --hash` prints c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad both before and after. Proves the file is not edge-reachable.
- `node tests/window-globals-exist.mjs`, `node tests/css-literal-ratchet.mjs` and `./bump-version.sh --check` are green.
- Run the in-page suite only if the machine allows. The cut's suite is the record.
- Merge origin/next into the branch yourself before reporting. Zero conflicts are expected: no open ref touches these files.
- `node tools/lane-done.mjs`: paste its last line.
- NEVER edit docs/reports/visual-qa/findings.json or tests/live-hash-drift.baseline.json.
- AT THE CUT (Coordinator): visual gate on Collection Log → monster detail and the Bestiary modal, desktop and 922x423, screenshots read.

OUT OF SCOPE: the collection log's residue-only found predicate (collection-log.js:150/459). It needs its own systems lane because getStats feeds milestone claims.

## THE DESIGNER'S ORIGINAL SPEC (rows, rates, tests; the brief above wins where they differ)
### contents
NEW FILE: src/data/monster-notes.js, client-only. No edge-bundled file may import it. It exports MONSTER_NOTES = { <monsterId>: '<note>' } with one entry for each of the 108 MONSTERS ids, T1-T6, all 11 families.

WIRING:
- src/main.js imports it with the current ?v= string and publishes window.MONSTER_NOTES inside the existing Object.assign(window, {...}) block.
- src/features/collection-log.js monDetailHtml(id) adds one line, `<div class="hr-cl-note">…</div>`, between the eyebrow and the Combat section, using an existing token-based text style. It shows only in the detail view, which only opens for monsters already found; undiscovered cells keep showing '???', so nothing leaks. Styling and placement polish go to the Art Director as a handoff.

VOICE:
- 1-2 sentences, 60-160 characters, no emoji, no digits (numbers would drift from data), original IP.
- A note is lore or behaviour, never a stat.
- It must stay consistent with the monster's family, tier and drop table (a spider note may mention silk; a note may not promise a drop the monster does not have).
- Bosses get a note with a named history.

EXAMPLE LINES:
- slime: 'It eats whatever the rain washes into the cellar, and the cellar is never quite clean again'
- kobold: 'Kobolds hoard anything that glints, and they will fight harder for a brass button than for their lives'
- war_king: 'He crowned himself on a field of his own dead, and wears the crown still, though no one alive will kneel'
- broodmother: 'The old woodcutters say the forest went quiet the year she came, and it has not sung since'
### files
NEW src/data/monster-notes.js; src/main.js (import and publish window.MONSTER_NOTES); src/features/collection-log.js (monDetailHtml only, around lines 382-406: a different hunk from pack 3's MILESTONES edit at lines 41-44); src/features/smoke/quests-chronicle-and-bonus.js (FIELDNOTES-1..2)
### tests
IN-PAGE:
- FIELDNOTES-1: Object.keys(MONSTER_NOTES) equals Object.keys(MONSTERS) exactly, so there are no missing notes and no orphans. Every note is 60-160 characters, has no \p{Extended_Pictographic}, has no digits, and is unique.
- FIELDNOTES-2: after seeding G.bestiary.kobold = {kills:1}, monDetailHtml('kobold') contains the kobold note. A never-killed monster's cell renders '???' and carries no data-mon handler, so the note cannot leak.

The mutation proof for FIELDNOTES-1 is recorded in the commit: deleting the slime entry turns it red.

Also run lane-done: window-globals-exist, dead-exports, and bump-version --check for the new ?v= import.
### reviewer problems fixed by the brief
- CLASS (CONFIRMED): Not C. No row enters an inventory, drop table, price, XP, gold or ranking, so needs_security=false is right. It is not lane A either: in CLAUDE.md §3.3, lane A is the bug fast lane. This pack is a content batch that changes two rendered screens across 5-6 files, so it is lane B. It rides the 20:00 UTC cut with the full visual gate and must never ship out of band.
- P2 VALUE NOT DELIVERED BY THE NAMED WIRING (CONFIRMED): The 2,500-kill trophy ladder renders in src/render/bestiary.js openBestiary (bestiary.js:84-95, TROPHY-1/2 in hunt-raids-and-screens.js:2205-2265), not in collection-log.js. The collection-log detail only opens when G.bestiary[id].kills>0 (collection-log.js:452, :459). G.bestiary is RESIDUE (client-state.js:321) with one writer, the ATTENDED killMonster (legacy.js:14406-14407). So a semi-idle player whose kills are away-only sees '???' and never the note. openBestiary already names a monster from the server count (`disc || tKills > 0`). Fix: also render the note in bestiary.js under the exact predicate that renders the name.
- P2 FIELDNOTES-2 CANNOT RUN AS WRITTEN (CONFIRMED): monDetailHtml is private to the IIFE (collection-log.js:382). It is not on window.HearthriseCollection (:576-592). The test must play it: HearthriseCollection.open(), click [data-cl-tab=bestiary], then click [data-mon=kobold]. Do not add an export seam.
- P2 TWO OF THE THREE NAMED GUARDS ARE BLIND (CONFIRMED): window-globals-exist only checks `window.Hearthrise*` (window-globals-exist.mjs:42), so a misspelt window.MONSTER_NOTES read silently renders nothing. dead-exports exempts every src/data/*.js file as edge-vendored (dead-exports.mjs:57-64). Fix: publish as window.HearthriseMonsterNotes next to HearthriseMonsterArt (main.js:112), so the census covers both readers and the write.
- P2 HIDDEN-ELEMENT / CHARM-REWARD LEAK (PLAUSIBLE, trigger is one natural lore line): The element weakness is the Bestiary Charms rank-1 reward (bestiary.js:67-70). For the 6 hiddenElement rows it is the only way to learn it: void_mote=ember, shadow_creeper=frost, starhusk=frost, void_parasite=poison, the_silence=poison, the_unlit=ember. CHARM-1 (hunt-raids-and-screens.js:1989) only greps the literal element id. A note like 'it recoils from flame' shows at 1 kill and bypasses the charm. Fix: mechanise it in FIELDNOTES-1. No note may match synonyms of its own elementWeak (105 rows), and hiddenElement rows may match no element synonym. I checked satisfiability: no monster's own name collides with its weakness synonyms.
- P3 css-literal-ratchet WILL GO RED (CONFIRMED mechanism): A new .hr-cl-note rule in collection-log ensureStyle would copy the file's fallback convention `var(--ink-3,#a5896a)`. The ratchet counts hex inside JS string literals (css-literal-ratchet.mjs:41), so that adds a counted literal. Fix: reuse the existing .hr-cl-stats class (collection-log) and the row's existing small styling (bestiary.js), add no new rule, and hand styling to the Art Director.
- P3 innerHTML CHARSET (CONFIRMED sink, authored-only source): Notes are concatenated into innerHTML (collection-log.js:398-406; bestiary.js:92-95). The source is static data, so this is not an exploit, but FIELDNOTES-1 should assert a whitelist /^[A-Za-z ,.;:'’!?—-]+$/u. That one check also covers no digits, no emoji and no <>&".
- P3 DROP-CONSISTENCY RULE IS NOT MECHANISED: Drop tables are server catalogues (catalogue-literal-drift) and change under lane C. A note naming an item the monster does not drop becomes a 'browser says X, server says Y' lie. 510 of the 538 ITEMS have multi-word names. Assert that no note contains ITEMS[x].n (multi-word, case-insensitive) for any x not in that monster's drops.
- P3 KEY EQUALITY IS ORDER-SENSITIVE AS WRITTEN: Compare sorted sets and name the missing and orphan ids. The folded aliases barn_rat, jackal and cultist must read as orphans. window.MONSTERS is 108 keys, because legacy inline MONSTERS is {} (legacy.js:116).
- P3 MISSING FILE: docs/SYSTEMS_MAP.md §5. FIELDNOTES-1 ties every future MONSTERS row, including lane-C monster adds, to a note, and the map must say so. Rendering must also fail safe: if the namespace or an entry is absent, render nothing (never 'undefined'), as the ITEM_DESC precedent does.
- P3 EDGE ISOLATION HAS NO GATE IN THE BRIEF: monsters.js IS edge-packed (hr-accrue index.ts, tick-combat.js, set-activity.js). A `note:` field in monsters.js, or an import from any edge-reachable file, would move payload_sha256. Gate: `node tools/pack-edge.mjs hr-accrue --hash` must still print c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad (measured at 9c70fa98).
- LANE CONFLICTS (CONFIRMED none): set/b554 = origin/next = 9c70fa98. Vigour, party-view and tap-targets touch hunt-raids-and-screens.js, index.html, styles and baselines, but none of this pack's files. I checked all 134 remote refs and none has an unmerged diff on collection-log.js, render/bestiary.js, main.js or quests-chronicle-and-bonus.js. Branch from origin/next, not main. Keep the tests in quests-chronicle-and-bonus.js and do not touch index.html. Never re-record docs/reports/visual-qa/findings.json: bf8c4576 had to revert a cloud-sandbox re-record. Pack 3's MILESTONES edit (:41-44) is a separate hunk but a money surface (C, Security) and does not gate this lane.
- OVERCLAIM: 'nothing leaks' is true of the UI only. All 108 notes ship in the public module bundle, as MONSTERS and every drop table already do. The defended property is that no surface renders a note where the name renders '???'. Authors must not put unreleased or spoiler-sensitive content in a note.
- TEST HYGIENE: The test-file ratchet TF-2 counts G.* seeds per registered test. Drive the away path with hrCharmDriver (_harness.js:2555) server counts and gestures (.click()), and restore with snapshotG/restoreG plus the G._bestiaryTrophies prev pattern in finally. Estimate about 2.5h, not 1.5h: 108 original notes plus an editor pass is most of the work.
- PRE-EXISTING, OUT OF SCOPE (CONFIRMED, P3, separate systems lane): The collection log's found predicate is residue-only (collection-log.js:150, :459). openBestiary uses the server count, so the two surfaces disagree for semi-idle players. Do not fix it in this lane, because getStats feeds claimable() milestones, which is pack 3's money surface.
