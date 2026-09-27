# Pack 4: The Hearth Codex (an in-game glossary whose every claim is checked by a guard)

VERDICT: GO-WITH-CHANGES | class A: true | est 2 h

PLAYER VALUE: The game has no help or glossary surface at all. Every entry here is tied to a named predicate over the live engine, so the Codex cannot lie the way tour card 4 does. Left out on purpose because they are not live for players: Rested XP (potency is 0, legacy.js:3205-3211), Vigour (the meter is not drawn), and Hunts (renderHuntPanel has no caller).

SECURITY/SYSTEMS PROBLEMS TO FIX IN THIS LANE (each is a condition):
- HIGH, CONFIRMED. The pack says every entry is guarded so the Codex 'cannot lie'. That is false. At 715a9b1d, about a dozen of its sentences contradict the server engine. The named predicates only check part of each sentence, and 7 of the 24 entries have no predicate at all. CODEX-6 would pass while the Codex adds new cases of the CLAUDE.md §6 P1 class: the browser says one thing, the server does another.
- HIGH, CONFIRMED in the repo chain (the live body was not measured because the brief is read-only). 'Away time' says bigger homes and higher renown ranks raise the away limit, and 'Property' says a tier gives a longer away limit. Both are false. The only definition of hr_offline_cap_ms (supabase/migrations/2026-08-11-accrual.sql:63-101) is 12h plus clan level 4/7 perks. Line 98 says renown and property 'contribute 0'. Fix: name no raiser.
- HIGH, CONFIRMED. 'Farmer's Deeds' says deeds come from tougher monsters and finished bounties. The engine has no deed roll (supabase/functions/hr-accrue/accrual.js:2194-2196 and 2411). Server-side, deeds come only from dungeon loot (src/data/dungeons.js:48-190; 2026-09-10-dungeon-catalogue.generated.sql:86). Fix: say 'dungeon chests'.
- HIGH, CONFIRMED. 'Renown' has three errors. Peasant pays no reward (src/data/renown-ranks.js:27-29; src/features/renown.js:61). Quests score 0 in the live body (2026-09-02-renown-kill-faucet.sql questDone term; live and replay hash both c583b454, measured 2026-09-26). The offline-hour perks are not honoured server-side, so 'a lasting perk' is not true for every rank. 'Days played' is the streak_days value.
- MED, CONFIRMED by running node on src/data/monsters.js. 'Weakness' says each family has one weakness. Weakness is set per monster, and it varies inside 10 of the 11 families. 3 monsters have no element weakness and many have no resist. 'Every card names the weakness' is contradicted by the 6 hiddenElement monsters and by the Codex's own Charms entry.
- MED, CONFIRMED. 'Charms' has the ranks backwards. Rank 1 (studied, 25 kills) reveals the hidden element and pays a drop multiplier of 1.00. Ranks 2-4 pay 1.01-1.03 (src/data/bestiary-charms.js CHARM_RANKS).
- MED, CONFIRMED. 'Daily reward' says 'missing a day only starts the climb again'. That is misleading: deriveLoginStreak returns 1 after a gap, so the weekly multiplier resets as well (src/data/rewards.js).
- MED, CONFIRMED. The Gems and Hearth Token entries describe things that are not live. Real-money purchase refuses on web (src/legacy.js:2668). Buying bank space with gems refuses under the arm (src/net/gem-sites.js buyBankSpaceGem, status 'deferred'). Nobody can hold a Hearth Token, so that entry falls under the same exclusion rule the pack applied to Rested XP, Vigour and Hunts. The gem sources also leave out the daily reward and collection milestones.
- MED, CONFIRMED. 'Dungeon Scrip' says some dungeons charge scrip at the door. All six dungeon doors take a key (DUNGEONS[*].cost.key). Scrip buys keys and blueprints from QM_STOCK.
- MED, CONFIRMED. 'Your save' says there is no save button. Settings > Data draws 'Save now', Export, Import and 'Erase save' (src/settings-page.js:809-818, 1237-1257, 1390).
- MED, CONFIRMED. 'Knocked out' says each later fall keeps you down longer. The novice grace makes this false for the first 5 lifetime deaths: recoveryFor with 3 falls today and 1 lifetime death returns 120000 ms, the same as the second fall. It is also false once the 64-minute cap is reached. 'Goes home to rest' implies a heal, but a retreat is 'pulled back to camp' with no heal (src/core/away.js retreat block; src/render/retreat.js:28).
- MED, CONFIRMED. Lucky Finds and Field Salvage are not on origin/main 715a9b1d: `git grep lucky` over main's src/data and src/core finds 0 hits. They exist only on the unreleased set/b556, so luckyRowsExist and salvageIsArmourSlots fail at the branch point. Fix: add these entries in the lane that ships them.
- LOW, CONFIRMED. 'Combat level' reads as if all styles are summed. The engine counts only the best of melee, ranged and magic (src/core/xp.js:68-79). The pack's Prayer 81 = Defence 41 predicate does not test this; it does hold (both give 11).
- MED, PLAUSIBLE semantic conflict (no textual one). The custom #hr-codex modal with its own 92vh cap would duplicate the Escape handling and layout that lane/modal-overflow (7caf1630, WIP) is centralising in src/render/modal-sheet.js and legacy.js:6996/9455. Fix: reuse .modal/.modal-card (90vh, overflow auto; closed by closeAllModals and the existing Escape handler), and add no keydown listener and no max-height rule. The other three fix lanes have no overlapping files or hunks.
- Guard gaps. (a) CODEX-4 bans digits but not spelled numbers, so 'twelve hours' would pass. (b) tests/recovery-relief-guard.mjs imports every src/data/*.js file and walks EFFECT_FIELDS (key, target, stat, effect, apply, bonus, grant...). An entry field with one of those names holding 'recovery' or 'knockout' would turn it red. (c) dead-exports treats all of src/data as edge-vendored, so codex.js exports are never checked. (d) The pack's line references are off: the toolbar is at legacy.js:15688 and the feat row at 14466.
- Pre-existing issues, outside this lane, for the Coordinator. Blast radius is the player's own account only. (a) P1 §6: the client away cap (legacy.js:1222-1243; home-dashboard.js:1479-1480 '+Nh offline cap'; renown.js:62-72; homestead.js tier offlineHours) advertises hours the server never pays. (b) P1 §6: client-side deed rolls (legacy.js:4889-4891 and 6265-6267, via farm-progression.js:216-240) show a 'Rare drop: Farmer's Deed!' toast and add a deed the engine never credits. (c) P2: the Settings Data section describes the retired save blob.
- Reviewer gates. Edge hash on main, computed from an extract of 715a9b1d: c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad (exit 0). src/data/codex.js cannot be reached from the hr-accrue bundle, which vendors 19 data files. I did not run lane-done: this was a read-only review with no branch, and its PGlite replays are heavy work that is not allowed while Tyler is streaming.

LANE BRIEF:
LANE lane/content-hearth-codex (a Class A content pack). Branch from origin/main 715a9b1d. Use a worktree. Never deploy, apply, bump or push main. Before reporting, merge the current integration branch (origin/next or the day's set/b5NN) into the lane yourself, then re-run the gates.

GOAL: an in-game glossary. It shows no numbers and stores no state. Every sentence in it is checked against the engine or the SQL authority.

FILES
- NEW src/data/codex.js: export CODEX_GROUPS and CODEX_ENTRIES, both frozen.
  - Entry shape: {id, group, term, text, door, claims:[{s, bind}]}. `s` is the index of a sentence in `text`.
  - Do not name any field key, target, stat, effect, apply, bonus or grant (tests/recovery-relief-guard.mjs imports every src/data file).
- NEW src/features/codex.js: statically imported from src/main.js. At boot it publishes window.HearthriseCodex = {open(id), close()}.
  - open() awaits import('../data/codex.js?v=555') and builds a .modal > .modal-card with id codex-modal.
  - Each entry is a <details id="cx-<id>">. Write every text with textContent, never innerHTML.
  - Each door is a button at least var(--tap) tall. A door either calls showTab(tab) or window.<Opener>.
  - Add no keydown listener and no max-height rule. The existing .modal handling and Escape/closeAllModals cover it.
  - It reads no G, localStorage or envelope data.
- NEW src/styles/codex.css, only if it is needed: layout only, tokens only, zero colour literals or !important, no new media-query forms. Link it in index.html with ?v=555.
- EDIT index.html: add a Codex button after Recipe Book in #more-modal, copying Recipe Book's inline pattern.
- EDIT src/legacy.js, in place with 0 net lines:
  - Append a tb-btn to the Lifetime line at about line 15688 (buildProfileToolbar).
  - Append a btn to the Bestiary line at about line 14466 (injectProfileButtons).
- EDIT src/settings-page.js: add a Gameplay row, 'Hearth Codex — what everything means'. It closes Settings, then calls open().
- EDIT .github/workflows/smoke.yml: in the client-guards job, after item-flavour-coverage, add `node tests/codex-claims.mjs` and then `node tests/codex-claims.mjs --selftest`.
- Regenerate tests/ci-shape.baseline.json with `node tests/ci-shape.mjs --write`. Never hand-edit it.
- EDIT docs/SYSTEMS_MAP.md: add one row.
- Do NOT touch: src/core/**, any other src/data file, supabase/**, src/net/**, death-sheet.js, art-direction.css, combat-screens.css, smoke/_harness.js.

CONTENT: exactly these texts, all verified at 715a9b1d. The door follows the text in brackets.

FIRST THINGS
- Away time: "Close the game and your hero keeps doing the last thing you set, at the same pace as if you were watching, though realm-wide blessings pause while you are gone. When you come back the realm pays out what was earned, up to your away limit." [tab profile]
- Your hero: "Your hero lives on the server, not in your browser, so closing a tab or switching device keeps everything you have earned." [none]
- Total level: "Every skill's level added together, and the plainest measure of how much you have done. It also counts toward your renown." [tab character]
- Daily reward: "Claim one reward each day from the Home screen. The rewards climb through the week and each finished week makes the next one richer, but a missed day starts the streak over from the beginning." [tab profile]
- Renown: "The realm's measure of what you have done: your levels, kills, bosses slain, items collected, days played in a row and gold. Every rank above Peasant pays a reward you claim, and a rank once reached is never taken away." [HearthriseRenown.openLadder]

FIGHTING
- Combat level: "One number for how dangerous you are: your Defence, Hitpoints and half your Prayer, plus your strongest way of fighting, whether blade, bow or spell." [tab character]
- Weakness: "Every monster has a weapon it fears, and most also have an element they cannot stand. Bring the weapon it fears and your blows land more often and hit harder. A few strange foes hide their element until you have studied their kind." [tab combat]
- Knocked out: "A fall does not end a fight. You stand back up on part of your health and carry on against the same foe. The first fall of each day costs no time, later falls can keep you down longer, and a hero who keeps falling without a single win pulls back to camp." [tab combat]
- Auto-Eat: "Every hero starts with Auto-Eat switched on. When your health runs low it eats from your bag, in a fight you are watching or on a night away. Auto-Eat II, bought with Bounty Marks, lets you choose how low is low." [the screen that sells TRAITS; verify it]
- Bounty Marks: "Every finished bounty contract pays gold, Bounty Hunter experience and Marks. Marks buy Auto-Eat II and, in the Bounty Board's own shop, things like Auto-Accept, rerolls and the Hunter Cloak." [tab bounty]

HOME AND HANDS
- Property: "Your home climbs from a Wanderer's Camp to Hearthrise Castle. Each tier is paid in gold and in things you gathered and made, and it opens new rooms, more farm plots and more hired hands." [tab house]
- Hired hands: the pack's text, unchanged. [tab house]
- Farmer's Deeds: "A Farmer's Deed turns up in dungeon chests. It can pay for your next farm plot upgrade instead of gold, and it sells on the Market, so a lucky delver can fund a farmer." [tab farming]
- Companions: the pack's text, unchanged. [tab stable]
- Rooms: the pack's text. Keep it only if the in-page test binds it; otherwise cut it.

COIN
- Gems: "Gems come from the daily reward, renown ranks and collection milestones. They buy extra hero slots, themes and looks, and never experience, levels or gear." [tab shops]
- Dungeon Scrip: "Scrip is paid out for clearing dungeons, and the quartermaster takes it for dungeon keys and room blueprints, so every clear helps pay for the next." [the quartermaster screen; verify it]

RECORDS
- Collection Log: the pack's text, unchanged. [HearthriseCollection.open]
- Charms: "Slay enough monsters of one kind and the realm grants you that kind's charm. Its first rank reveals any element those foes were hiding, and each rank after makes them drop their loot a little more often." Use the bestiary UI's own word for 'kind'. [openBestiary]
- Trophies: the pack's text, unchanged. [openBestiary]
- Hearthfinds: "Once in a very long while something so rare turns up that the whole realm is told. A Hearthfind is announced in chat, under your name unless you have chosen to stay quiet, and you can copy its card to show it off." [none]

DROPPED
- Hearth Tokens: not live, since there is no web purchase and nothing mints one.
- Lucky Finds and Field Salvage: they ship with set/b556, so add them in that lane.
- Rested XP, Vigour, Hunts: stay out, as the pack already decided.

GUARD tests/codex-claims.mjs. It imports only src/core, src/data and tools/pack-edge.mjs, and reads SQL as text.
- CODEX-1: ids are unique slugs.
- CODEX-2: every group is known and non-empty.
- CODEX-3: every text is 80-320 characters and ends with a full stop.
- CODEX-4: no digits, emoji or < > &. No number words from two upward, and no 'half', 'twice' or 'double', except 'half' in combat-level, which is bound.
- CODEX-5: every door is a data-tab present in index.html, or a window opener that is assigned somewhere in src.
- CODEX-6: every sentence index has at least one claim. Every bind exists and holds. The binds:
  - awayPaysLiveRate: AWAY_RATE_MULT===1.
  - awayScope: AWAY_SCOPE.blessing===false and every other key is true.
  - awayCapped: creditWindow caps paidMs at capMs.
  - awayCapNoRaiser: the chain-end hr_offline_cap_ms body does not mention renown or property, AND the away-time text names no raiser.
  - residueNoProgression: a source scan of RESIDUE_FIELDS finds none of gold, gems, inventory, skills or equipment.
  - totalLevel: the chain-end hr_renown_of body contains sum(lv).
  - daily: the cycle length is 7, the cycle's gold climbs, priceDailyLogin(8).gold > priceDailyLogin(1).gold, and deriveLoginStreak({prev:'x',rows:{}})===1.
  - renownTerms: the body contains ev:kill_any, is_boss, ev:loot:, streak_days and gold, and its questDone term is 0.
  - rankRewards: RENOWN_RANK_REWARDS has no peasant key, and every rank has gold > 0.
  - rankRatchet: renown_high is raise-only in the SQL text.
  - prayerHalf: combatLevel(Prayer 81)===combatLevel(Defence 41).
  - bestStyleOnly: combatLevel(Ranged 99 + Magic 99)===combatLevel(Ranged 99).
  - weakness: every monster has weaponWeak, more than half have elementWeak, WEAKNESS_BONUS.damage and .accuracy are both > 1, some monster has hiddenElement, and CHARM_RANKS[0].reveal is true.
  - falls: recoveryFor(0 today, 100 lifetime)===0; recoveryFor(3,100) > recoveryFor(1,100); 0 < RESUME_HP_FRACTION < 1; retreatAtFall at RETREAT_ANY_FALLS is true; combat-sim resolveKill resets consecFalls.
  - autoEat: 2026-09-04-auto-eat-at-creation.sql grants trait:auto_eat and is in the apply order; hero-slot-buy's precondition requires that grant; AWAY_SCOPE.heal is true; tier 2 maxPct > tier 1 maxPct; the auto_eat_2 row in 2026-08-23-trait-buy.sql costs 'marks'.
  - bounty: bountyRewards returns gold > 0, marks >= 1 and xp > 0 for every tier and type; the offers auto_bounty_1, cosmetic_cape and a reroll exist and cost marks.
  - workers: workerEff(max) < 1.
  - deeds: some DUNGEONS loot contains farm_deed and so does the generated SQL; accrual.js has no deed handler; PLOT_TIER_PRICES has both deeds and gold; farm_deed is not bop.
  - companions: every COMPANIONS entry has a source; core/companion-xp.js is in the pack list.
  - gems: gems appear in the daily cycle, the rank rewards and COLLECTION_MILESTONES; every gem-cost offer grants only character_slot, theme or cosmetic unlocks, or bank capacity.
  - scrip: QM_STOCK sells every DUNGEONS key for scrip > 0, and no DUNGEONS cost uses scrip or gold.
  - charms: CHARM_RANKS[0].drop===1, and later ranks' drop is > 1 and strictly rising.
  - trophies: the pack's predicate.
  - hearthfind: the world-finds SQL nulls the name for presence_quiet, and hearthfind.js has the copy control.
- CODEX-7: every term is unique.
- CODEX-8: pack('hr-accrue') contains no codex file.
- CODEX-9: data/codex.js is reached only through a dynamic import.
- CODEX-10: src/features/codex.js reads no G.
- --selftest applies in-memory mutations, and each must turn exactly its guard red:
  - M1: AWAY_RATE_MULT set to 0.5 turns CODEX-6 red.
  - M2: planting 'bigger homes raise that limit' turns awayCapNoRaiser red.
  - M3: a digit turns CODEX-4 red.
  - M4: 'twelve' turns CODEX-4 red.
  - M5: a sentence with no claim turns CODEX-6 red.
  - M6: a static import turns CODEX-9 red.
  - M7: a fake opener turns CODEX-5 red.
  - M8: a luckyRowsExist bind at this base turns CODEX-6 red.
  - A clean run must also be green.

IN-PAGE TEST: add CODEX-1 to src/features/smoke/muster-nav-and-identity.js as a tryRunAsync. Keep it lean with no G seeds (test-file-ratchet).
- await open('knocked-out'); #codex-modal is shown; #cx-knocked-out is open, matches /first fall of each day/ and has a door.
- close() hides it.
- The #more-modal button and the .prof-toolbar button exist.
- RED at 715a9b1d (there is no HearthriseCodex), GREEN after.

GATES: write the exit codes you actually saw, never expected ones.
1. `node tools/pack-edge.mjs hr-accrue --hash` equals c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad both before and after.
2. `git diff --name-only origin/main...HEAD -- supabase src/core src/net` is empty, and the only new file under src/data is codex.js.
3. `node tests/codex-claims.mjs` exits 0, and `node tests/codex-claims.mjs --selftest` exits 0 with all mutations caught.
4. `node tools/lane-done.mjs` exits 0; paste its last line. It replays the migration chain, so do not run it locally while Tyler is streaming.
5. The in-page test and the visual pass (desktop and 922x423) run on the GitHub run for the pushed lane branch. Proof PNGs go only to qa/content-hearth-codex. Never commit docs/reports/visual-qa/findings.json.

The report is one table plus at most three sentences. Out of scope, for the Coordinator to file as separate lanes: the away-cap copy lie, the client-side Farmer's Deed rolls, and the Settings Data section.
