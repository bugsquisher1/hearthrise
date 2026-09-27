# Pack 3: Signposts (every dead end gets a reason and a door)

VERDICT: GO-WITH-CHANGES | class A: true | est 1.75 h

PLAYER VALUE: Each of these leaves a player asking 'what do I do now?':
- When a bench runs dry, the toast reads 'Out of Raw Shrimp — cooking stopped', with no next step, and the hero idles (legacy.js:15071-15076). A player first sees this at about minute five, because First-Day step 2 is Cook 5.
- Nine of the ten Bounty strip chips are false. Proof, Weapon, Streak, Boss and Chain are never posted (core/bounty.js:272-279, 527). Hard arrives at Bounty Hunter 15, not 50 (:548). Elite is never posted. Auto-Bounty II has no offer. The board tier follows combat level (legacy.js:4052).
- Locked War Table cards give no distance to the unlock.
- Ten bag categories just say 'No items in this category'.

SECURITY/SYSTEMS PROBLEMS TO FIX IN THIS LANE (each is a condition):
- CLASS A CONFIRMED with changes. No file in the pack is packed into the edge bundle. pack('hr-accrue') lists 88 files: src/core and src/data vendored modules plus supabase/functions. None of the pack's files is among them, and nothing reachable imports a new src/data/signposts.js. Measured payload hash: c799d159…a517bad at 715a9b1d and 184a155a…9b114f at origin/set/b556 (exit 0 on both). The bounty facts check out. unlockedTypes gives hardLv=15. The not-offerable types are Proof, Weapon, Streak, Boss and Chain. generateBountyBoard reads only unlockedTier(combatLevel) (core/bounty.js:512). Elite is never generated. No auto_bounty_2 offer exists. The server mirrors all of this in 2026-09-12-bounty-accept-bh-clamp.sql:37-95 (hard at BH>=15, tier gated by server combat level). No server-owned value is added or restated.
- P1 CONFIRMED (truth, section 6): the bag empty state appears whenever visible.length===0 (inventory.js:129-139, :217). Search text and the standing loot filter are part of that count, and loot-filter.js's header says 'IT HIDES; IT NEVER DISCARDS'. So 'Your bag is empty' or 'No weapons yet' would tell a player with a search or a filter that items they own do not exist. Equipped items are also not in G.inventory, so 'No weapons yet' is false for anyone wielding a sword. Fix: choose the signpost from the server bag (entries plus cat.test) only. If the category holds items that are hidden, show a new bag.hidden line with a Clear button (_invSearchClear). Word gear lines as 'in your bag'.
- P2 CONFIRMED: the farm toast at farm.js:608 fires when seeds ARE held but need a higher level (haveSeed = held && getLevel('farming')>=c.req, farm.js:598). The pack's 'No seeds to plant' would then be false. Split into farm.noSeeds and farm.seedsAboveLevel.
- P2 CONFIRMED: reason 'gate' means only that the recipe scroll has not been read (core/artisan.js:99-101 and :193; artisan-sim.js:77). Level is not part of it, so 'Pick a recipe your level and your recipe book allow' misstates the cause. Reword to say the scroll must be read.
- P2 CONFIRMED: the chronicle claim 'Every toast … kept here until you reload, so a missed one is never lost' is false. The ring is capped at MAX_RECENT=100 and shift()s the oldest (chronicle.js:79, :189). Reword without 'never lost'.
- P1 CONFIRMED (the pack would turn existing tests red, and it lists none of them): (a) quests-chronicle-and-bonus.js:1061 and :1063 pin 'No milestones recorded yet' and 'No notifications yet this session'. (b) The F25 test in monsters-inventory-and-brand.js (main :6509, anchor `const gated = /unlocks at Combat Lv/`) detects the gate from the dungeon meta text. The new meta makes gated=false, and its else branch then asserts !d.locked, so it goes RED on any account below CL25. Both must be updated without loosening them.
- P2 CONFIRMED: the not-posted list must use the generator's own predicate, isOfferableType(t, bountyClientMayPay()) (legacy.js:4065-4086), not BOUNTY_TURN_IN!=='server'. Otherwise the strip contradicts the board whenever clientMayPay is true. After the move, window.getBountyDifficultyUnlocks (the false 50/60/75) and window.getUnlockedBountyTypes have zero readers (legacy main :10755 and :10768). The latter is a hand-copied second version of core.unlockedTypes; the in-module call resolves to the local :4054 delegate. Delete both to kill the class.
- P2 CONFIRMED (same class, missed): legacy main :14653-14691 is a dead first window.doArtisanAction. The (skillId, recipeId, opts) definition at :15000 overwrites it at parse time, and nothing captures it. It holds the only other stall toast ('Out of secondary materials') plus a silent stop. Delete it (about -39 lines of legacy.js).
- P3 CONFIRMED: the pack fails its own SIGN-3 rule (30-200 chars). 'Clans are not open yet' is 22 characters, and 'Cull', 'Hard contracts' and 'On the board' are labels, not sentences. Split the data into lines and labels. 'not posted yet' and 'not open yet' promise a roadmap, which breaks the house rule at quests-chronicle-and-bonus.js:1065 ('an empty state describes the state, never the roadmap').
- P3 CONFIRMED: the home {time} countdown comes from the client clock and is rendered once, so it goes stale until the next render. It would also need a third fmtCountdown copy (combat-screens.js:63, boss-of-the-day.js:97). Drop the number and say 'at midnight UTC'; the reset is UTC per hrGoalDayKey and goal-period utcDayKey. Show the done line only when G.daily.tasks.length>0, because daily is residue (client-state.js:146).
- P3 CONFIRMED (no value): the War Table grid empty state (combat-screens.js:1054) cannot be reached. renderFilters resets classFilter to 'all' when it is not in the tier (:989), and every tier T1-T6 has monsters (14/16/16/21/20/21). Drop war.filterEmpty.
- P3 guards: SIGN-6 duplicates tests/monolith-ratchet.mjs, which lane-done already runs. Replace it with SIGN-7: pack('hr-accrue') contains no signposts file and no src/core or src/data module imports it. The monster-notes.js precedent only has a comment. New guards must register both a plain run and --selftest (guard-hygiene R3) in the client-guards job. Also missing from the pack: comment-ratio pins legacy.js, home-dashboard.js, combat-screens.js and the smoke files, so no net comment growth and no bNNN comments. no-new-prediction: no new *ForDisplay( call site. test-file-ratchet: tests must not seed G.
- CONFLICTS (measured with git diff -U0 against the four lanes): there is no hunk overlap in legacy.js. Lane hunks sit at main 2841/2846, 6999/9458/13721 and 11713/13536; the pack edits sit at about 10755-10776, 11062, 14653 and 15065. In home-dashboard.js, ko-sheet-truth edits :719 and the pack edits :1458. In monsters-inventory-and-brand.js, combat-tile-clip rewrites the import line (:9) and inserts at :428, and set/b556 adds +283 lines, so put the new tests in bounty-and-artisan.js (untouched by the lanes and the set). Only the F25 hunk (:6509) is edited there. The set's smoke.yml hunks are in db-replay-3 and economy-selftests, not client-guards. The pack's line numbers are set/b556 coordinates, but legacy.js is 34 lines longer on the set than on 715a9b1d, so the lane must work from anchors. The War Table meta edit is on .wt-dest, not the .wt-card tiles that tile-clip restyles, but the 922x423 visual must be taken on the set with tile-clip included.
- RESIDUAL (accepted, not introduced by the pack): the War Table lock is a client-only UX gate, since set-activity.js has no monster-tier gate. The copy is true to that lock. The combat level shown includes display prediction and is the same value that decides the lock; nothing spends it. The 'all daily done' state rests on the residue daily sheet; pay is once-guarded on the server. Not run in this review: lane-done (read-only review, no lane branch, and heavy PGlite steps are barred during the stream), the in-page suite and visual-qa.

LANE BRIEF:
LANE lane/content-signposts. Branch from origin/main 715a9b1d. CLASS A: client-only. No migration, no edge deploy. Do not touch src/core/**, supabase/functions/**, or any src/data file the edge imports. Read window.HearthriseCore.bounty and window.HearthriseCore.botd only. Estimate about 2.5 h.
Line numbers below are MAIN coordinates. set/b556 is up to +34 lines in legacy.js, so edit by anchor text, never by line number.

1. NEW src/data/signposts.js
Shape: export const SIGNPOSTS = Object.freeze({ lines: {...}, labels: {...} }).
- Each line entry: { text, vars?: [...], door?: { tab | skill, label } }.
- Header: client-only display copy. It is never imported by an edge-reachable module; SIGN-7 enforces this.

lines:
- bag.all: 'Your bag is empty. Everything you gather, cook, craft or win in a fight lands here.' Door: {tab:'skills', label:'Start a skill'}
- bag.hidden: 'Nothing here matches your search or bag filter. Clear them to see everything you hold.' (no door; button calls window._invSearchClear)
- bag.weapons: 'No weapons in your bag; the one you wield sits on your character. Shops sell a starter blade, bow and staff, and Smithing and Crafting make better ones.' Door: {tab:'shops', label:'Visit Shops'}
- bag.armor: 'No armour in your bag; what you wear sits on your character. Shops sell boots, gloves and a first helm, and Smithing and Crafting make the rest.' Door: shops
- bag.jewelry: 'No jewellery in your bag. Shops sell a ring and a necklace, and Crafting makes finer ones.' Door: shops
- bag.food: 'No food in your bag, so Auto-Eat has nothing to reach for. Cook what you fish or farm, or buy a cooked meal under Supplies in Shops.' Door: {skill:'cooking', label:'Go to Cooking'}
- bag.mats: 'No materials in your bag. Chop, mine and fish on the Skills screen; monsters drop hides, fangs and stranger things.' Door: skills
- bag.seeds: 'No seeds in your bag. Supplies in Shops sells every seed the farm grows, and each crop opens at its own Farming level.' Door: shops
- bag.bones: 'No bones in your bag. Many monsters leave bones behind, and burying them at the altar trains Prayer.' Door: {tab:'combat', label:'Find a fight'}
- bag.tools: 'No tools in your bag. Smithing and Crafting both make them, and the best one you own speeds up its skill on its own.' Door: {skill:'smithing', label:'Go to Smithing'}
- bag.comp: 'No companion items in your bag. Companions live in the Stable, with a note on where each one is found.' Door: {tab:'stable', label:'Open the Stable'}
- stall.outOf: 'Out of {item} — {skill} stopped. More from: {source}' (vars item, skill, source)
- stall.outOfBare: 'Out of {item} — {skill} stopped, nothing left to use.' (used when the source is empty)
- stall.locked: 'Recipe not learned — {skill} stopped. Read its recipe scroll from your bag first.'
- farm.noSeeds: 'No seeds to plant. Supplies in Shops sells every seed the farm grows.'
- farm.seedsAboveLevel: 'Your seeds need a higher Farming level. Supplies in Shops has seeds for every level.'
- war.locked: 'You are combat level {have}; this opens at {need}.'
- bounty.notPosted: 'Contract tier follows your combat level. {types} contracts are not on the board.'
- home.dailyDone: 'All daily quests done. A new set arrives at midnight UTC.'
- chronicle.recentEmpty: 'Nothing yet this session. Your recent toasts are kept here until you reload.'
- chronicle.milestonesNone: 'No milestones yet. Rank-ups, first boss kills and new homes are kept here.'

labels:
- bounty.heading 'On the board'
- bounty.cull 'Cull'
- bounty.hard 'Hard contracts'
- war.clanClosed 'Clans closed'

2. NEW src/features/signposts.js
ESM with no top-level window or DOM access. Import '../data/signposts.js?v=555'.
Exports:
- setupSignposts(): publishes window.HearthriseSignposts.
- fill(key, vars): returns '' when a declared var is missing; never emits a raw brace.
- stallLine(skillId, res): gate → stall.locked. Otherwise item = ITEMS[res.missing].n or 'materials', skill = SKILLS_DEF[skillId].name, source = window.itemSourceLine(id); use stall.outOf, or stall.outOfBare when the source is empty.
- bagEmptyKey({catId, heldInCat}): heldInCat>0 → 'bag.hidden', else 'bag.'+catId.
- bountyStripHtml({level, clientMayPay, bounty}):
  - hardLv = first lv in 1..120 where bounty.unlockedTypes(lv) includes 'streak'.
  - notPosted = keys of bounty.BOUNTY_TURN_IN where !bounty.isOfferableType(t, clientMayPay), labelled via BOUNTY_TYPE_LABEL and joined as 'A, B and C'.
  - Omit the notPosted line when that list is empty.
  - Chips: <em>1</em>Cull (always on) and <em>{hardLv}</em>Hard contracts (on when level>=hardLv).
  - Reuse the existing .bh-unlocks-h, .bh-unlocks, .bh-unlock, .is-on and legacy.css .muted classes. No CSS edits.
- doorHtml(door) and go(door): a tab goes to window.showTab; a skill goes to window.hrOpenActivity.

3. src/main.js
Import setupSignposts with ?v=555 and add boot('signposts', setupSignposts) next to item-index.

4. src/legacy.js
Net negative lines. No new comments, no bNNN.
a. renderBountyTab (anchor `const unlocks = [`): replace the types/diff/unlocks/unlockHtml block with one line:
   const unlockHtml = window.HearthriseSignposts ? window.HearthriseSignposts.bountyStripHtml({level:lv, clientMayPay:bountyClientMayPay(), bounty:window.HearthriseCore.bounty}) : '';
b. Delete `window.getUnlockedBountyTypes = …` and `window.getBountyDifficultyUnlocks = …` (main :10755-10776). They have zero readers.
c. Anchor `notify('Recipe locked — '+skillId+' stopped','kill')`: replace the if/else with one notify(window.HearthriseSignposts.stallLine(skillId,res),'kill'). The b228 test regexes /Out of / and /stopped/ must keep passing.
d. Delete the dead first `window.doArtisanAction = function(skillId, recipeId){ … };` (main :14653-14691). Proof: grep -c '^window.doArtisanAction = function' src/legacy.js prints 1.

5. src/screens/inventory.js
In the empty branch (anchor 'No items in this category'), compute heldInCat from `entries` with cat.test only. Render fill(bagEmptyKey(...)) plus a door button (class 'btn btn-sm'). Leave the recipes branch untouched.

6. src/screens/farm.js
Anchor 'No usable seeds. Visit the shop.': if any CROPS seed has heldByServer>0 → farm.seedsAboveLevel, else farm.noSeeds.

7. src/features/combat-screens.js
- Boss of the Day, Weekly Boss and Dungeon locked cards: meta = fill('war.locked', {have, need}). `have` is the same combatLevel() value the lock used; `need` is the same reqLevelFor/reqLv. The locked chip stays as it is.
- Clan chip: labels.war.clanClosed.
- Leave :1054 alone (unreachable).

8. src/features/home-dashboard.js
Anchor 'All daily quests done — new ones at reset.': use home.dailyDone, and only when G.daily.tasks.length>0.

9. src/features/chronicle.js
Line 547 → chronicle.recentEmpty. Line 606 → chronicle.milestonesNone.

10. Update existing tests. Stay non-vacuous; never loosen.
- quests-chronicle-and-bonus.js ~1061 and ~1063: assert the new texts, read from window.HearthriseSignposts. Keep 'Nothing recorded yet' and the roadmap regex.
- monsters-inventory-and-brand.js F25 (anchor `const gated = /unlocks at Combat Lv/`): gated = /opens at/, keeping both branches. Edit ONLY that hunk; lane/combat-tile-clip rewrites line 9.

11. New in-page tests: src/features/smoke/bounty-and-artisan.js only. Pure calls, no writes to G.
SIGNPOST-1:
- stallLine('cooking', {reason:'inputs', missing:'shrimp'}) matches /Out of Raw Shrimp/, /Cooking stopped/ and /Fishing/.
- reason 'gate' matches /recipe scroll/.
- bagEmptyKey({catId:'weapons', heldInCat:2}) === 'bag.hidden' (the loot-filter lie); heldInCat:0 gives 'bag.weapons'.
- The seeds door tab is 'shops'. The food text names Auto-Eat.
SIGNPOST-2:
- bountyStripHtml({level:1, clientMayPay:false, bounty:CK.bounty}) contains Cull and Proof, and contains none of Elite, Auto-Bounty II or Tier 2 Board.
- level 15 lights Hard; level 14 does not.
- clientMayPay:true gives no notPosted line.
- Mutation: an injected stub whose isOfferableType returns true for 'proof' drops Proof. Never mutate the live core object.

12. NEW tests/signposts.mjs
No ?v= in its imports. Supports --selftest: the clean arm first, then every planted mutation must exit non-zero.
- SIGN-1: every lines key is reachable. bag.* keys are reached via the CATEGORIES ids parsed from src/screens/inventory.js; every other key by a literal key string somewhere in src/**.
- SIGN-2: every door tab is one of index.html's data-tab values, and every door skill is in src/data/skills.js SKILLS_DEF.
- SIGN-3: lines are 30-200 chars and labels 3-40. No digits, no emoji, no < > &.
- SIGN-4: every CATEGORIES id except recipes has a bag.<id> entry, plus bag.hidden.
- SIGN-5: the placeholders in each text equal its declared vars.
- SIGN-7: pack('hr-accrue') from tools/pack-edge.mjs contains no signposts file, and no src/core or src/data module imports it.
RED-before: each planted mutation (unreferenced key, tab 'nope', a digit, bag.tools deleted, an undeclared {x}, a src/core import of signposts.js) must exit 1. GREEN-after: the plain run exits 0.
Register in .github/workflows/smoke.yml, job client-guards, as both the plain run and --selftest. Regenerate the register with node tests/ci-shape.mjs --write.

13. docs/SYSTEMS_MAP.md
Add one line next to the monster-notes entry.

GATES
Report every exit code you actually saw.
- node tests/signposts.mjs and node tests/signposts.mjs --selftest
- node tools/pack-edge.mjs hr-accrue --hash must be unchanged from the merge base: c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad at 715a9b1d, or 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f once origin/set/b556 is merged.
- node tests/monolith-ratchet.mjs, then --write to pin the lower count.
- ./bump-version.sh --check
- node tools/lane-done.mjs: paste its last line.
- Merge origin/main. Then run git merge-tree --write-tree HEAD origin/set/b556 and report the conflict count. If it is non-zero, merge the set in and regenerate the JSON baselines with their own --write; never hand-merge them.

While Tyler streams, do NOT run the in-page suite or visual-qa on this PC. The Coordinator runs them on the assembled set via next. Visual list: the Bounty Board strip; the War Table rail at 922x423, assembled with lane/combat-tile-clip; the Weapons empty and hidden-by-search states; planting with no seeds. Proof PNGs go only to qa/content-signposts.
Never deploy or apply. Never commit docs/reports or visual-qa/findings.json. No git stash.
