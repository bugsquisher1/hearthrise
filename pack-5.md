# Pack 5: Stable & Throne Lore (companion notes, rank lore, trophy stages, Trophy Room wall)

VERDICT: GO-WITH-CHANGES | class A: true | est 1.5 h

PLAYER VALUE: Gives the mid-game some meaning:
- None of the 22 companions has a line of lore.
- The 12 renown ranks carry only mechanical unlock strings (renown.js:61-72).
- The Trophy Room says it is 'purely about what you have already done', yet shows none of it (homestead.js:604, 1028-1049).
This pack adds reasons to want each companion, a rank-up line worth screenshotting, and the trophies the server already projects.

SECURITY/SYSTEMS PROBLEMS TO FIX IN THIS LANE (each is a condition):
- P1 CONFIRMED (code read), sec. 6 violation. The Trophy wall's empty state would say 'The wall is bare' to a player who has trophies, whenever the realm has not yet stated them. Cause: mirror() returns null before the first settle, or when the server omits the trophies key (index.ts:852). isClaimed() then fails safe to FALSE for every trophy (src/render/bestiary-trophies.js:143-147, 200-204). The hasTrophyKey flag that tells 'none' apart from 'unknown' exists (:132-136) but is not published on HearthriseTrophies (:393-407). Fix: add a read-only claimsKnown() accessor. When claims are unknown the wall section is OMITTED; the bare-wall line shows only when the claims are known and empty. Existing tests would not catch this; guard IN-PAGE LORE-3b.
- P2 CONFIRMED. The pack names no way to list the claimed set. HearthriseTrophies has only per-(monster, stage) isClaimed, and bestiary-trophies.js:156-157 keeps G._bestiaryTrophies owned by that one module. homestead.js must not read the mirror. It also cannot map a stage to the TROPHY_LORE id (quarry, stalker, and so on) without TROPHY_STAGES. Fix: put a pure wallRows(opts) in src/render/bestiary-trophies.js (client-only, not edge-packed) with injectable isClaimed/known/roster, and publish it. The file list must add src/render/bestiary-trophies.js and src/styles/legacy.css.
- P3 CONFIRMED, sec. 6. The ladder's 'lore on the current rank' reads getState().rank. That comes from countedRenown(), which falls back to the CLIENT prediction effectiveRenown() when serverRenownHigh() is null (renown.js:278-281, 337-354). So the lore would narrate a rank the realm has not counted. The rank-up modal is already safe: pollRankUp only fires on a counted figure (renown.js:786-796). Fix: render .hr-rn-lore in openLadder only when st.counted === true. Guard: IN-PAGE LORE-2.
- P4 CONFIRMED, injection surface. RoomModal 'rows' name/right/empty and 'note' html go in as raw HTML (clan-seat-ui.js:2118-2137), as do the renown and stable templates (innerHTML). Monster and stage names must go through esc(). The lore strings are safe only because the LORE-4 charset whitelist forbids < > & and double quotes. State that the charset guard IS the injection guard, and keep it.
- P5 CONFIRMED, missed files and guards. .sc-lore needs a rule in src/styles/legacy.css (stable block, main :3053-3061). .hr-rn-lore belongs in renown.js ensureStyle (:804+). css-literal-ratchet counts hex inside JS strings, and the adjacent house pattern var(--ink-3,#a5896a) would turn it red: use bare tokens only, no inline style, and no new @media spelling (breakpoint-guard). Also: no b-number in new comments (comment-ratio CR-2); dead-css; guard-hygiene (plain + --selftest both registered, selftest has a clean arm); ci-shape --write.
- P6 PLAUSIBLE, guard self-contradiction. The LORE-6 'stat words' list is undefined. A naive speed list (faster/slower) turns the approved tortoise line red on 'slower to stop'. Build the list from the UI's own bonus vocabulary: companions.js:933-938 labelMap, homestead.js:611-617 KEY_LABEL, plus xp, percent, damage, chance, bonus, crit, drop rate, gold find, yield, speed. Do not include slow/slower.
- P7 PLAUSIBLE, coverage gap. LORE-2 in Node checks peasant plus RENOWN_RANK_REWARDS. A future no-reward rank added to the renown.js RANKS array would escape it. Add an in-page assert over window.HearthriseRenown.RANKS ids. Never add a lore field to RANKS rows: tests/collection-renown-claim-drift.mjs:223-257 parses them.
- P8 PLAUSIBLE, honesty (low). The Baron line 'The valley pays you its dues now' reads as a recurring payout the server never makes. Baron is a one-time 5000 gold + 25 gems (renown.js:65, renown-ranks.js:38). Reworded in the brief: 'The valley swears you its fealty now, and asks in return only that you keep the roads clear and the wolves hungry' (113 chars, charset-clean). The other 37 lines are verified: 100-140 chars, charset, no digits, no trailing stop, unique, 0 copies of MONSTER_NOTES (108) or ITEM_DESC (538), 0 item names. Companion flavour matches each real perk in src/data/companions.js:29-68.
- P9 CONFIRMED, merge surface. set/b556 rewrote the import line of src/features/smoke/companions-claims-and-renown.js (:9). It also edits smoke.yml (+55), tests/ci-shape.baseline.json (+7) and docs/SYSTEMS_MAP.md (+73). It touches NONE of companions.js, renown.js, homestead.js, main.js, bestiary-trophies.js or legacy.css. Fix: do not touch the harness import line; insert the tests before the 'b227: every room opens' anchor, not at the tail; merge origin/set/b556 into the lane and regenerate ci-shape by --write, never by hand.
- INFO, fix lanes. No file overlap with stale-gold-prediction, ko-sheet-truth or combat-tile-clip. modal-overflow edits legacy.css modal rules (the .sc-lore hunk sits in the separate stable block) and the Escape handling (this pack adds none). Because the Trophy Room and renown modals render inside the modal system that lane is changing, their visual pass counts only on the assembled set after modal-overflow lands.
- VERIFIED Class A (scratch proof, repo untouched). The edge payload has 83 files. Its only src/data members are the 19 engine files; none is lore-notes.js, a src/features or src/render file, or main.js. On a git-archive copy of origin/main, adding src/data/lore-notes.js leaves 'pack-edge hr-accrue --hash' at c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad (exit 0), and lore-notes is packed: false. Every number the pack shows comes from the server projection: claimed trophy rows (index.ts:821-853, noteEnvelope :92-141), stage names from the catalogue, and the 'and N more' count derived from those rows. The pack authors no server value. lane-done was NOT run: read-only review, no branch, and stream mode forbids the PGlite replays inside it.

LANE BRIEF:
LANE lane/content-stable-throne-lore. Base: origin/main 715a9b1d. CLASS A: client-only. No migration, no edge deploy, no Security re-review, so long as the constraints below hold. Do not deploy, do not bump ?v=, do not write a CHANGELOG, do not touch production, and do not use git stash.

HARD CONSTRAINTS
- Do not edit src/core/**, supabase/**, or any src/data file the edge packs. That includes companions.js, bestiary.js, renown-ranks.js and monsters.js.
- Do not touch noteEnvelope, claim(), isClaimable() or installEnvelopeHook() in src/render/bestiary-trophies.js. The only change there is additive read-only exports.
- Do not add fields to the renown.js RANKS rows. tests/collection-renown-claim-drift.mjs parses them.
- Record 'node tools/pack-edge.mjs hr-accrue --hash' before your first edit and after your last. They must be byte-identical. On 715a9b1d it is c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad.

1) NEW src/data/lore-notes.js
- Pure ESM, no imports.
- Header of at most 6 lines: client-only display text, never imported by an edge-reachable module, never a stat, guarded by tests/lore-notes.mjs.
- Three frozen maps, plus three getters returning '' when the key is unknown: companionLore(id), rankLore(id), trophyLore(stageId).

COMPANION_NOTES
- fox: The fox was there before you pitched the first tent, and has decided, for reasons of its own, that the camp is now partly its responsibility
- wolf_pup: A pup that lost its pack follows whoever feeds it, and grows up believing every fight you pick was its own idea
- sparrow: A sparrow on the shoulder asks for crumbs and pays in song, and it always spots the next good tree before you do
- bunny: Nobody who has kept a bunny near a vegetable patch believes it is there to help, and yet the rows somehow come up fuller
- honeybee: One honeybee is a curiosity; the hive it came from is the reason every cook in the valley leaves the kitchen window open
- badger: A badger does not start fights, finish them politely or leave before they are over, which makes it the ideal second in a brawl
- hawk: A hawk circling overhead sees the glint of something worth having long before anyone on the ground thinks to look down
- whelp: Hatched warm and hungry, a dragon whelp is small enough to carry for about a week, and after that it is carrying you
- scorpion: It rides in a boot or a pocket without complaint, and nobody who has watched it strike has ever asked to hold it
- raccoon: A raccoon cannot be trained, only bribed, and it pays its keep in coins it swears it found lying about
- owl: The owl keeps the late watch over the shrine, and seems to know the old prayers better than whoever is saying them
- tortoise: Slow to start and slower to stop, the tortoise has outlived three owners and considers you a promising fourth
- beaver: A beaver judges a woodcutter by the stump, and follows the one whose cuts are clean enough to be worth finishing
- rock_golem: Stone that walked out of the quarry one morning and never went back, it breaks rock the way a baker breaks bread
- heron: A heron stands so still in the shallows that the fish forget it is there, which is the whole of its advice to anglers
- squirrel: A squirrel buries far more than it will ever remember, and the garden is always greener wherever it forgot
- phoenix_chick: A phoenix chick sleeps in the embers of the cooking fire, and that fire has not once gone out since it moved in
- forge_imp: An imp that fell in love with the forge and would not leave it, now the only apprentice who works the bellows unasked
- silkling: A silkling spins thread as fine as anything from the southern looms, and takes offence at any seam it did not sew
- grave_wisp: A small cold light that drifts over the graves on quiet nights, drawn to anyone who lays the dead to rest with care
- lichling: What is left of a lich once it has been beaten down far enough to follow you, and it has not forgiven anyone for it
- dragonling: Hatched from the hoard of a slain dragon, it inherited the fire, the temper and a deep interest in anything that glitters

RANK_LORE
- peasant: You own a bedroll, a borrowed axe and a good deal of ambition, which is more than most people in the valley can say
- serf: The steward has learned your name and writes it in the ledger beside the work you did, which is how every name in history began
- squire: A knight of the valley has noticed you, mostly because you keep turning up wherever the work is hardest
- knight: You kneel in the mud and stand up with a title, and from now on people expect you to act as though you meant it
- baron: The valley swears you its fealty now, and asks in return only that you keep the roads clear and the wolves hungry
- viscount: Your banner hangs in halls you have never visited, and people you have never met argue over what you would do
- count: You keep a seat at the market now, and merchants lower their voices whenever your steward walks past
- marquis: You hold the border marches, so every trouble from beyond the hills reaches your gate before it reaches anyone else
- duke: Your word settles quarrels three valleys away, and even your enemies have started writing to you politely
- prince: The old families bow when you enter and whisper when you leave, and both of those are a kind of respect
- king: The crown is heavier than it looks, and the realm expects you to wear it to every harvest, siege and wedding
- highking: Kings kneel to you now, and the valley that once lent you a bedroll tells stories about the night you first slept in it

TROPHY_LORE
- quarry: You have hunted this one long enough to know its tracks from any other, and the first trophy goes up on the wall
- stalker: It knows you now as well as you know it, and it no longer runs in quite the same direction when you come
- slayer: Hunters speak of this beast and of you in the same breath, and the wall is running out of room for heads
- nemesis: Somewhere its kind tells stories about you to frighten their young, and you have earned every word of them

2) src/main.js
- Import the getters from './data/lore-notes.js?v=555'.
- Publish window.HearthriseLore = Object.freeze({companion, rank, trophy}) beside window.HearthriseMonsterNotes (main :114).

3) src/features/companions.js (ESM)
- Import companionLore directly.
- In renderStable (:955-971), add <div class="sc-lore">…</div> after the .sc-row block on EVERY card, owned or locked.
- Emit nothing when the lore is ''. Leave the proc line at :968 untouched.
- CSS: .stable-card .sc-lore in src/styles/legacy.css, next to .sc-bonuses / .sc-source (main :3053-3061).
  - Tokens only (var(--ink-2) or var(--ink-3), italic, line-height), no literals, no !important.
  - Optional 2-line clamp, using ONLY the existing canonical mobile @media spelling.

4) src/features/renown.js (classic script)
- Add a local helper that reads window.HearthriseLore at render time and fails safe to ''.
- celebrate() (:1030): add <div class="hr-rn-lore">…</div> after the 'You are now' line.
- openLadder() (:955): add lore under the row where i === curIdx ONLY when st.counted === true.
- Add .hr-rn-lore{…} to ensureStyle (:804+) with bare var(--…) tokens and NO hex fallback. css-literal-ratchet counts hex inside JS strings.

5) src/render/bestiary-trophies.js (client-only; additive exports, published on HearthriseTrophies)
- claimsKnown() returns true only when mirror() is non-null AND mirror().hasTrophyKey === true.
- wallRows(opts) is PURE.
  - opts: {roster = window.MONSTERS, isClaimed = module isClaimed, known = claimsKnown(), cap = 12}.
  - For each roster id: highest s in MAX_TROPHY_STAGE..1 with isClaimed(id, s).
  - Sort by stage descending, then roster key order.
  - Returns {known, rows: [{id, name: roster[id].name || id, stage, stageId: TROPHY_STAGES[stage-1].id, stageName}] (first cap rows), more: total - cap (min 0), topStageId}.
  - It never reads G directly and never reads the mirror except through mirror().

6) src/features/homestead.js modalDescriptor (:1028-1049), trophy room only, level > 0 branch
- T = window.HearthriseTrophies. If T or T.wallRows is missing, or w.known is false: add NO wall section.
- Otherwise push {kind: 'rows', title: 'On the wall', rows: w.rows.map(r => ({name: esc(r.name), right: '<span class="hr-cs-val"><b>' + esc(r.stageName) + '</b></span>'})), empty: 'The wall is bare. A trophy goes up after enough kills of a single monster, and the Bestiary shows how close each one is.'}.
- Then, if w.more > 0: a note 'and ' + w.more + ' more on the wall'.
- If rows exist: a note carrying esc(HearthriseLore.trophy(w.topStageId)).
- Use only the seam's section kinds (the b227 test enforces this).

TESTS
G1 NEW tests/lore-notes.mjs, with --selftest.
- LORE-1: keys equal the COMPANIONS keys (import src/data/companions.js, read-only).
- LORE-2: keys equal ['peasant', ...RENOWN_RANK_REWARDS keys].
- LORE-3: keys equal the TROPHY_STAGES ids.
- LORE-4: every line is 100-140 chars and matches /^[A-Za-z ,.;:'’!?—-]+$/u, with no digit and no trailing '.'. Say in a comment that this charset is the innerHTML-injection guard.
- LORE-5: all lines unique, and none equals a MONSTER_NOTES or ITEM_DESC value.
- LORE-6: no word from the UI bonus vocabulary: companions.js labelMap, homestead.js KEY_LABEL, plus xp, percent, damage, chance, bonus, crit, drop rate, gold find, yield, speed. slow/slower are allowed.
- LORE-7: pack('hr-accrue') from tools/pack-edge.mjs has no file whose origin or content names lore-notes.
- --selftest: a CLEAN arm must be green, then 7 planted defects must each go red by their own assertion.
  - Defects: drop a companion key; add an orphan rank; drop a stage; add a digit; duplicate a line; add a 'speed' line; a synthetic file list containing src/data/lore-notes.js.
- RED-before: run it at base, where lore-notes.js is absent. It must exit non-zero; paste the code.
- GREEN-after: exit 0 on both the plain and the --selftest run; paste both.
- Register both commands in the client-guards job, in the step that runs item-flavour-coverage (main smoke.yml:2501-2502). Then run node tests/ci-shape.mjs --write followed by node tests/ci-shape.mjs (exit 0).

IN-PAGE, in src/features/smoke/companions-claims-and-renown.js
- Insert immediately BEFORE the "() => tryRun('b227: every room opens a themed modal" test.
- Do NOT edit the harness import line (set/b556 rewrote it).
- No G.* seeds. Restore every piece of module state you touch in finally.
- LORE-1: every HearthriseRenown.RANKS id and every COMPANIONS key has a non-empty lore getter. After window.renderStable(), count(.stable-card .sc-lore) === count(.stable-card) === Object.keys(COMPANIONS).length. If #stable-body is absent, call skip() with a reason.
- LORE-2: save serverRenownHigh(), then __resetClaimState(), then openLadder(). Expect 0 .hr-rn-lore. Then noteServerRenown with a renown_high of 0, openLadder() again, and expect exactly 1 .hr-rn-lore equal to the peasant line. In finally: close the modal, __resetClaimState(), and re-note the saved value if it was non-null.
- LORE-3: HearthriseTrophies.wallRows({roster: {goblin: {name: 'Goblin'}}, isClaimed: (id, s) => id === 'goblin' && s <= 2, known: true}) yields rows [{name: 'Goblin', stageName: 'Stalker'}] and topStageId 'stalker'. With known: false, the result has known false.
- LORE-3b: the trophy room modalDescriptor contains no 'On the wall' section when claimsKnown() is false. Stub T.claimsKnown and restore it; do not seed G.

GATES (a claim is an exit code you saw)
- The pack-edge hash is identical before and after.
- node tests/lore-notes.mjs, and the same with --selftest: exit 0.
- node tools/lane-done.mjs: paste the last line. It contains PGlite replays, so run it only when Tyler is not streaming; otherwise report 'lane-done unrun (stream mode)'.
- The in-page check: node tests/run-smoke.mjs --only LORE is a filtered run, never a gate, and only when not streaming. Otherwise it is proven at the cut suite.
- Merge origin/set/b556 (or the current set/b<NNN>) into the lane yourself. Resolve every hunk; ci-shape.baseline.json is regenerated by --write, never by hand. Re-run G1 and lane-done.

VISUAL
- Stable at desktop and 922x423, the ladder, the rank-up modal (HearthriseRenown.celebrate(RANKS[3])) and the Trophy Room (bare wall and one claimed row, if the QA account has one).
- Screenshots READ.
- Must be re-checked on the assembled set after the modal-overflow lane lands.
- Proof PNGs go only to a separate branch qa/content-stable-throne-lore.
- Never commit docs/reports/visual-qa/findings.json.

docs/SYSTEMS_MAP.md: one line under the monster-notes entry naming src/data/lore-notes.js as client-only and never edge-imported, guarded by tests/lore-notes.mjs.

REPORT: one table plus at most 3 sentences.
