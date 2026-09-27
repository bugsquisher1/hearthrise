# Pack 1: First Steps (honest tour, screen primers, post-signup sheet)

VERDICT: GO-WITH-CHANGES | class A: true | est 1.75 h

PLAYER VALUE: Covers the first five minutes of every account.
- Tour card 4 tells players to earn 15 Marks for Auto-Eat, but every hero has owned it, switched on, since creation (supabase/migrations/2026-09-04-auto-eat-at-creation.sql:30).
- Tour card 2 says armour 'is what stops you dying', but defence only moves monster accuracy by 0.006 a point (src/core/combat.js:68, 533-535).
- The post-signup sheet points players to an 'Activities' tab that does not exist (src/post-signup-welcome.js:41).
- Eight screens never explain themselves.
This pack removes the three false statements and answers 'what is this screen for?' once on each of the eight screens.

SECURITY/SYSTEMS PROBLEMS TO FIX IN THIS LANE (each is a condition):
- P1 CONFIRMED, CI gate. FIRST-LIGHT-4 (src/features/smoke/monsters-inventory-and-brand.js:8284-8291 on main, :8290-8297 on set) requires the combat tour card to contain /Bounty Board/ and `${AUTO_EAT_TIERS[1].marks} Marks`. The pack's combat copy removes both, so that in-page test goes RED, and the pack does not list the test or the file. The pack's new FTUE-COPY-2 would duplicate a guard it never found: ftue.js:141 cites an 'FTUE-COPY-1' that does not exist. Fix: amend FIRST-LIGHT-4 in place and do not add a duplicate. Existing tests catch this only by turning CI red.
- P2 CONFIRMED, false security promise to players. The Social primer says 'nothing on it can be bought or typed in'. That is false. The Wealth board ranks gold (leaderboards.js:83). Gold and artisan materials change hands on the Market, and materials bought there turn into artisan XP on the skill boards. Hearth Tokens are a cash-to-gold route (legacy.js:616). This is an unproven assurance of exactly the kind this review exists to stop. Fix: delete the clause. No test would catch it.
- P2 CONFIRMED, the Events primer describes a feature that is not live. CLAN_LAUNCHED=false (clans.js:59), so the muster and the weekly clan boss show coming-soon cards (muster.js:1769-1778, raids.js:1164). It also says dungeons 'ask for a combat level' but leaves out the entry key and cooldown (src/data/dungeons.js:39-42). Fix: corrected row, plus guard G7 tying the copy to the flag.
- P2 CONFIRMED, the Shop primer says 'Premium Shop sells slots, looks and gems for real money'. The web beta refuses every purchase (legacy.js:2668). IAP_CATALOG (legacy.js:615-622) holds no looks and does include Hearth Tokens, which the primer leaves out. Fix: corrected row, plus G7 tying it to the web-refusal branch.
- P2 CONFIRMED, a §6-class statement. The combat card says 'Auto-Eat is already switched on', a claim about one player's server state. It is false for heroes created before the 2026-09-04 apply: §grant-existing gave them the flag only, never the switch (2026-09-04-auto-eat-at-creation.sql:530-560 and its apply-order note). It is also false for anyone who turned it off. Every account can replay the tour from Settings (settings-page.js:639, :1210). Fix: state the rule instead, 'new heroes start with Auto-Eat switched on'.
- P3 CONFIRMED, remaining false statements. (a) The topbar card keeps 'there is no save button', but Settings > Data shows a Save button (settings-page.js:809-812). (b) Market primer: 'every listing by another player' is wrong because your own listings show too (market.js:1290), and 'keeps selling while you are away' is wrong because listings expire after listing_ttl_h, default 48h (market-v2.sql:543). (c) House primer: 'each tier opens rooms' is wrong because the Castle opens none (rooms:[] at homestead.js:77). Fix: corrected rows.
- P2 PLAUSIBLE, layout. .panel.active is a CSS grid (legacy.css:236; art-direction.css:1357-1371), so a prepended aside becomes a grid cell and pushes the cards aside. Seven of the eight panels sit under theme-cozy.css:2469-2480 `#panel-X *:not(...){color:...!important}`, which overrides the primer's colours. A new CSS file starts with zero allowed !important. The pack's visual gate checks 2 of 8 screens. Fix: grid-column:1/-1, no !important, a geometry assertion in PRIMER-1, and a visual gate on every touched surface at both viewports.
- P2 PLAUSIBLE, test suite. run-smoke and visual-qa boot with empty localStorage, so a primer mounts on the first visit to each of the eight panels. That moves the layout under every existing in-page test on those screens, and the pack sets no precondition to prevent it. Fix: a _park seam, parked in runSmokeTest (smoke-test.js ~:62-110) the same way _parkEatSync is, and unparked inside the primer tests.
- P3 CONFIRMED, wrong hash in the gate. The literal 184a155a...114f is the hash of set/b556. origin/main 715a9b1d measures c799d159...7bad (pack-edge --hash, exit 0). The gate should compare against the merge base, not a fixed literal. Proven in a scratch copy of main: adding an unreachable src/data/screen-primers.js left the hash at c799..., and the pack() payload has no screen-primers origin. The edge-bundle claim holds.
- P3 PLAUSIBLE, reset() is unspecified. A reset that scans every 'hearthrise:' key would wipe the FTUE flag, the identity record and the save backups. Fix: iterate the SCREEN_PRIMERS keys only, and have PRIMER-2 assert the FTUE flag is untouched.
- P3, wrong citations and a missing registration. Panel-bounty is legacy.js:10918/10921 on main (the pack cites 10927, a set line). The Settings row markup is at :639, not :1209. The tap census at boot.js:122-128 should add 'screen-primers' so a dropped tap is caught. The post-signup header comment at :9-10 still says 'Activities'.
- Conflicts with the four fix lanes: none textual. stale-gold only touches src/net plus legacy onLoot. modal-overflow adds index.html:1015 in the script block, while the primer link goes in the stylesheet block (:165-196); it also edits tokens.css, so this lane must not touch tokens.css. ko-sheet-truth is at _harness:2303, and combat-tile-clip at monsters-inventory :426 and _harness :2409, both away from FIRST-LIGHT-4 at :8265. Merging into set/b556 will conflict on smoke.yml, ci-shape.baseline.json and SYSTEMS_MAP.md; the lane resolves those itself.
- Out of scope, file separately. Settings > Data still has blob-era controls (Save now, Export, Import, Erase, Restore; settings-page.js:798-830, 1236-1275, 1340-1368) that contradict 'your hero lives on the server'; that is its own Class-A lane. The wrap card's 'banks the whole time you are gone' is false past the 12h base offline cap (away.js:364-366), and AWAY-HONEST-5 pins that sentence in; the Game Designer should rule on it.
- What the reviewer did and did not run: read-only, with Tyler streaming. No merge, no commit, no lane-done, no in-page suite, no visual-qa. The only executions were pack-edge --hash (exit 0, twice) and a scratch copy check (exit 0).

LANE BRIEF:
LANE lane/content-first-steps: Pack 1, First Steps. Class A: client-only, lane B, no migration, no edge deploy, no Security review.

BASE AND RULES
- Branch from origin/main 715a9b1d.
- Before you report, merge origin/set/b556 (or `next` if the Coordinator says so) into the lane yourself. Expect conflict hunks in .github/workflows/smoke.yml, tests/ci-shape.baseline.json and docs/SYSTEMS_MAP.md.
- Commit WIP. Never git stash.
- Never deploy, touch the DB, or push main/next. Never commit docs/reports/visual-qa/findings.json.
- Do not touch: src/core/**, src/net/**, supabase/**, any src/data file except the new one, src/styles/tokens.css (modal-overflow edits it), legacy.css, art-direction.css, theme-cozy.css, combat-screens.css, src/legacy.js, src/features/death-sheet.js, src/features/home-dashboard.js, src/welcome-modal.js.
- While Tyler is streaming, run nothing heavy. Write "unrun"; do not wait.

0. EDGE HASH
- Run `node tools/pack-edge.mjs hr-accrue --hash`.
- At the base it must read c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad (Security measured this).
- It must be byte-identical after your diff.
- After merging set/b556 it must read 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f.
- Any other value means you touched the edge. Stop.

A. TOUR, src/ftue.js (titles unchanged)
- :77 topbar body: "Combat level, total level, gold and gems. Gold is your first upgrade — a few hundred buys boots and gloves at Shops, and armour turns aside some of the blows aimed at you. Progress saves itself to your account as you play."
- :144 combat body: "Combat is the part you play with your hands. Monsters hit back, so you eat between kills: new heroes start with Auto-Eat switched on, which eats from your bag when your health runs low, and food comes from Cooking. Falling does not end the run: you are knocked out for a spell, stand back up on part of your health and carry on with the same fight, and the first fall of each day costs you no time at all. Your fights keep going while you are away under exactly the same rule."
- :160 inventory body: "Everything you gather, cook and kill for lands in your bag. Right-click any item, or press and hold it on a phone, to eat it, equip it, bury bones or see what it is for — and once you own gear, drag it onto the doll beside your bag to wear it. Nothing here is lost when you fall."
- :113-143: replace the comment with at most 6 lines. No build numbers (CR-3 has zero headroom). Name FIRST-LIGHT-4 and tests/screen-primers.mjs as the guards; 'FTUE-COPY-1' never existed.

B. POST-SIGNUP SHEET, src/post-signup-welcome.js
- :40: "Your hero lives on the server, not in this browser — sign in on any device and your progress is waiting."
- :41: "<b>First step:</b> open <b>Skills</b> and start one. It keeps earning while you are away."
- :9-10: change the header "jumps to Activities" to "jumps to Skills".
- Add no colour literal.

C. NEW FILE src/data/screen-primers.js
- Pure ESM, no imports: `export const SCREEN_PRIMERS = Object.freeze({...})`. Each row is Object.freeze({title, body}).
- panel-farming: "The Farm" | "Crops grow in real time, even while you are away. Plant a seed from the Local Shop, water it to hurry it along, and carry the harvest to Cooking. Plant all and Water all save you the clicking."
- panel-house: "Your homestead" | "Your home grows from a camp to a castle, one property tier at a time, paid in gold and in things you gathered and made. Each tier adds farm plots and hired hands, most open new rooms, and every room makes part of your day quicker or richer."
- panel-stable: "The Stable" | "Companions travel with you one at a time. The one you equip lends you its bonus and earns experience of its own, and every locked card says where the others are found."
- panel-shop: "Shops" | "The Local Shop sells starter gear, seeds and supplies for gold, and the Market beside it is where players trade. The Premium Shop lists gem packs, Hearth Tokens and Hearth Hall Premium; the web beta cannot buy them yet."
- panel-market: "The Market" | "Every listing here was put up by a player, and every sale is settled by the realm rather than by either side. What you list stays up while you are away, until it sells or its time runs out."
- panel-bounty: "The Bounty Board" | "Take a contract, slay what it names, and turn it in for gold, Bounty Marks and Bounty Hunter experience. One contract runs at a time, and Marks buy the upgrades in the shop beside the board."
- panel-events: "Events" | "The day's blessing lives here, and so do the dungeons. A dungeon asks for a combat level and a key before it opens, rests between runs, and its boss keeps loot the open field never gives up."
- panel-social: "Leaderboards" | "Every board here is ranked by the realm from what the server has counted, and your own place is pinned to each one. Find your name, then find the name just above it."
- Security validated all eight: 165-240 chars, no digits, no < > &, all unique.

D. NEW FILE src/features/screen-primers.js
- ESM. Import SCREEN_PRIMERS with ?v=555. Import it and call its setup from the feature block of src/main.js.
- Register window.HearthriseShowTab.wrapShowTab('screen-primers', fn).
- Key on `document.querySelector('main .panel.active').id`, never on the tab name ('shops', 'shop', 'premium' and 'market' map to two panels).
- Prepend `<aside class="hr-primer" role="note" data-primer=ID><b>title</b><p>body</p><button type="button" class="btn btn-sm" data-primer-dismiss>Got it</button></aside>`. Build it with createElement and textContent.
- Show it only when all of these hold: a row exists for the panel; HearthriseStorage.get('hearthrise:primer:'+id) !== '1'; no '.ftue-root .ftue-card.show' is on screen; the panel has no [data-primer] already; primers are not parked.
- "Got it" sets the marker and removes the aside. The marker is device-local only: never in G, never in the residue, never sent.
- Publish window.HearthriseScreenPrimers = {html, shouldShow, reset, dismissAll, _park}.
- reset and dismissAll iterate Object.keys(SCREEN_PRIMERS) only. Never scan a 'hearthrise:' prefix: that would wipe the FTUE flag, the identity record and the save backups.
- _park is an in-memory flag and never writes storage.
- Keep the aside in flow: no position absolute or fixed (the ui-overlap guard). No Escape handler (modal-overflow owns Escape).

E. SETTINGS, src/settings-page.js
- After the #set-replay-tutorial row (:639), add a row "Show screen tips again" with button id set-replay-primers.
- Put its handler next to the tutorial handler (:1210). It calls HearthriseScreenPrimers.reset() and notify('Screen tips will show again the next time you open each screen.','info').
- If the seam is missing, show a failure toast, following the pattern at :1211-1214.

F. NEW FILE src/styles/primers.css
- Link it in index.html after combat-screens.css (:196) with ?v=555.
- `.hr-primer{grid-column:1/-1}`: .panel.active is a CSS grid (legacy.css:236; art-direction.css:1357-1371).
- Use only var() tokens that tokens.css already defines. Add no new token and zero !important.
- 7 of the 8 panels sit under theme-cozy.css:2469-2480's forced `color !important`. Pick a surface on which that forced ink stays legible.
- [data-primer-dismiss] gets min-height and min-width of 44px.
- Use only the media query `(max-width: 540px), (max-height: 540px) and (max-width: 1024px)`.

G. SUITE PRECONDITION, src/features/smoke-test.js
- In runSmokeTest, park primers alongside the other parks (~:62-110) and restore them in the same finally, exactly like _parkEatSync.
- Primer tests unpark inside their own bodies.

TESTS
1. NEW tests/screen-primers.mjs, with a plain run and --selftest. Register both in the smoke.yml client-guards job and in tests/ci-shape.baseline.json.
   - G1: every key is a panel id, derived from index.html plus `id = 'panel-...'` assignments in src/**/*.js (companions.js:901, legacy.js:10921, muster.js:1732).
   - G2: title 4-32 chars; body 80-260 chars, ending in '.'.
   - G3: no digits, emoji, <, > or &.
   - G4: bodies are unique.
   - G5: the object and every row are frozen.
   - G6: pack('hr-accrue') from tools/pack-edge.mjs has no screen-primers origin, and no src/core or src/data file imports it.
   - G7: while legacy.js still contains "not available in the web beta", the panel-shop body must say the web beta cannot buy. While clans.js has `CLAN_LAUNCHED = false`, panel-events must not mention muster, rally or clan boss.
   - G8: src/ftue.js must not contain /15 Marks|until you own Auto-Eat|stops you dying|no save button/. The combat body must keep "knocked out", "carry on with the same fight" and "first fall of each day costs you no time at all".
   - --selftest: one clean arm that must pass, plus one planted defect for each of G1-G8 that must go red. Plant them in a temp copy (the css-literal-ratchet mkdtemp/cpSync pattern), never in the tree.
   - RED-before: add the guard and the data file first, then run it before editing ftue.js. It must exit 1 on G8. After the edit it must exit 0. Report both exit codes.
2. AMEND FIRST-LIGHT-4 in place (monsters-inventory-and-brand.js:8265; asserts at :8284-8291).
   - Replace the /Bounty Board/ assert and the `${marks} Marks` assert with two new ones: the combat body quotes no Auto-Eat price (!/\bMarks\b/), and it matches /new heroes start with Auto-Eat switched on/.
   - Keep the retired-sentence, knocked-out, recoveryFor and wrap asserts.
   - Drop "names the Bounty Board" from the title.
   - Add no FTUE-COPY-2.
   - Mutation proof when the machine is free: revert ftue.js:144 and FIRST-LIGHT-4 must go red.
3. src/features/smoke/boot.js
   - Add 'screen-primers' to the tap census EXPECTED list (:122-128).
   - PRIMER-1 (no G.* writes): unpark, then reset the panel-farming marker. showTab('farming') must produce exactly one [data-primer=panel-farming] as the first child, titled "The Farm". Its rect must intersect no .card and span at least 90% of the panel's content width. Clicking dismiss removes it and sets the marker to '1'. Going to profile and back to farming shows none. Restore the marker and the park in finally.
   - PRIMER-2: html('panel-profile') === ''. shouldShow with {dismissed:true} is false. shouldShow is false while a synthetic .ftue-root>.ftue-card.show is present. reset() leaves 'hearthrise:ftue:completed' untouched.
   - PRIMER-3: #set-replay-primers clears exactly the SCREEN_PRIMERS keys.

GATES (a claim is an exit code you saw)
- The step 0 hash equality.
- screen-primers RED-before (exit 1) and GREEN-after (exit 0); --selftest exits 0.
- `node tools/lane-done.mjs` ends with "lane-done: all green.". It includes about 3 minutes of chain replay, so run it only when the Coordinator frees the machine; otherwise report "lane-done unrun".
- Do not run the in-page suite or visual-qa locally while streaming. The record is the GitHub five-job run on `next`.
- Visual proof, once the machine is free: all 8 panels with the primer showing, the topbar/combat/inventory tour cards, the post-signup sheet and the Settings row, at 1440x900 and at 922x423. Read the screenshots. Commit the PNGs only to qa/content-first-steps.
- The report is one table plus at most 3 sentences.

OUT OF SCOPE (file separately)
- Settings > Data blob-era controls (settings-page.js:798-830, 1236-1275, 1340-1368).
- The wrap card's "banks the whole time you are gone" is false past the 12h base cap; that needs a Game Designer ruling.
