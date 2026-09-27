# Pack 2: Skill Primer (what a skill is for, what the next level opens, levels gained away)

VERDICT: GO-WITH-CHANGES | class A: true | est 2 h

PLAYER VALUE: Today the game says nothing about why to train a skill or what comes next:
- None of the 17 skills has a description (src/data/skills.js:3-23).
- The header never names the next unlock, even though about 415 catalogue rows carry a level.
- The level-up toast says only 'Level N!' (src/render/levelup-celebration.js:47).
- The away receipt already carries the server's levelUps (src/net/accrue.js:5208), but nothing renders them.
This pack answers 'why train this?' and 'what do I get next?' on every skill screen, on every attended level-up, and on the welcome-back card.

SECURITY/SYSTEMS PROBLEMS TO FIX IN THIS LANE (each is a condition):
- #1 | P1 (section 6) | CONFIRMED by code, not run against a DB | The farming ladder promises crops the server will refuse. Planting checks two things: the farming req_lv AND hr_crop_plot_tier <= plot_level (supabase/migrations/2026-08-22-server-farming-complete.sql:185-201, which returns 'plot_tier_locked'). src/core/farm.js:28-40 PLOT_TIERS puts 8 of the 9 crops above tier 1 (carrot and wheat 2, potato and tomato 3, pumpkin and goldenroot 4, emberfruit and moonbloom 5). So 'Opens Carrot' at Farming 10 on a tier-1 plot is a case of 'client says X, server refuses'. Blast radius: the player only. Fix: when requiredPlotLevel(crop) > 1, name the rung 'Carrot (plot tier 2)'. That is a static catalogue fact, never a read of client state. No existing test would catch this; add SKG-11. The live b374 banner has the same lie today (legacy.js:3664 hrSkillUnlocksAt); the shared derivation fixes both.
- #2 | P1 (section 6) | CONFIRMED by code | 8 recipes that need a recipe scroll leak into the level ladder. Rows marked `gated` (recipes.js:70-72 Hunter's Feast / Dragon Stew / Lich Soul Soup, :242-243 Chief's Blade / Captain's Ribblade, :353 Alpha Cloak, and 2 more) are refused unless the server-projected unlockedRecipes holds the scroll (src/core/artisan.js:99 gateOk; artisan-sim.js:398). 'Opens Hunter's Feast' at Cooking 75 is false for almost every player. Fix: leave `gated` rows out of every ladder (SKG-10). hrSkillUnlocksAt has the same live lie, and the delegate fixes it too.
- #3 | P2 | CONFIRMED | Surface C3 edits the wrong popup and adds a second way of working out unlocks. addXp already raises the b374 banner (legacy.js:3679-3717: hrLevelUpNotice -> _hrRenderLevelUpPop 'Unlocked: ...', plus a Chronicle line) next to .lvl-celebration (the wrapper at legacy.js:14354-14365). The problem statement 'the toast says only Level N!' is inaccurate. The pack's 'Opens' line would print the unlock twice, from two derivations that disagree on names: hrSkillUnlocksAt uses ITEMS[output].n ('Cooked Wolf Meat') while the pack uses recipe.name ('Cook Wolf Meat'), and 315 recipes differ this way. Fix: do not touch levelup-celebration.js. Have one derivation (opensAt), turn legacy's hrSkillUnlocksAt into a fail-safe delegate, and give the banner a 'Next:' fallback. The existing b374 test (bounty-and-artisan.js:1719-1745) stays green.
- #4 | P2 | CONFIRMED by reading the boot order, not checked at runtime | Surface C1 edited only in activities-grid.js probably paints nothing. main.js:512 installs the ESM renderSkillDetail before DOMContentLoaded. legacy.js block 27 then reassigns it via applyAll -> patchSkillDetail (16333, 16471-16484) at DOMContentLoaded + 100 ms, and activities-grid.js:473-477 itself says its builders 'currently paint nothing'. Fix: both buildHead twins call headHtml (activities-grid.js:111-151 and legacy.js:16275-16295). The in-page test drives window.renderSkillDetail and reads the live DOM; SKG-13 checks both twins in source.
- #5 | P2 | CONFIRMED | The ladder spec leaves out Prayer. Prayer has 13 ARTISAN_RECIPES.prayer rungs (levels 1-99) and one gear rung (Bone Earrings, Prayer 45), but it is in neither ladder list and SKG-9 says nothing about it. Fix: Prayer = the non-gated prayer recipes plus gear with reqSkill 'prayer'. gearWieldReq exists only on window (legacy.js:8367), so the node guard covers non-gear rungs and the in-page test covers gear.
- #6 | P3 | CONFIRMED | Two flavour lines state a wrong or inconsistent rule. Prayer: 'half of every Prayer level counts toward your combat level' is wrong. src/core/xp.js:68-80 uses floor(p/2)*0.25, which is half the WEIGHT of Defense and Hitpoints. 'Defence' contradicts the skill's own name 'Defense' (src/data/skills.js:5), which the header prints one line above. Corrected text is in the brief; it is 122 and 121 characters and passes SKG-3 to SKG-7.
- #7 | P3 | CONFIRMED | The file list is wrong. A new src/styles/skill-guide.css would need an index.html <link> that the pack does not list. No new sheet is needed: add two token rules beside `.act-head .ah-xp` (legacy.css:2838), reuse `.lu-unlock` for the banner (legacy.css:2910) and `.hd-away-note` for the away card. levelup-celebration.js comes off the list; legacy.js and legacy.css go on it. Several cited lines have drifted: 'Level N!' is at levelup-celebration.js:50, not :47. accrue.js:5208 and home-dashboard.js:805 are set/b556 line numbers (main has them at 5169 and 801). The activities header is at :143-151, not :163-170.
- #8 | P3 | CONFIRMED | Edge cases in the away receipt. Older entries have no `from` (the fixture at monsters-inventory-and-brand.js:5284 is {skill:'mining',to:12}), and entries can carry ids that are not in SKILLS_DEF. The line must print 'Mining reached 12', skip unknown ids, and never print undefined or NaN. The unlock names are worked out on the client from the server-stated (from,to] range. That is fine, but it is not 'verbatim' as the pack says. Separately, 'Next' must fall back to 'Every X unlock is yours' whenever no rung is left (for example Woodcutting 90-98), not only at level 99.
- #9 | P3 | Guards the pack does not name. (a) The monolith ratchet: legacy.js is at its ceiling (19177 newlines against 19178 in the baseline), so the lane's legacy.js edits must net zero or fewer lines; the delegate refactor nets about -8. (b) comment-ratio CR-3: no new b### build-number prose in comments. (c) no-new-prediction PRED-1: no new *ForDisplay( call sites; use getLevel. (d) dead-exports and window-globals-exist. (e) The render module must not touch `window` at import time, so the node guard can load it. (f) Register the guard in client-guards at smoke.yml:2492-2502 and regenerate ci-shape.baseline.json with --write.
- #10 | Conflicts | No hunks overlap with the four in-flight fix lanes. This lane touches legacy.js 3664-3717 and 16275-16295; the others touch onLoot (~6308), Escape handling (6999, 9458, 12373, 19152) and the welcome modal (13297-13718). In legacy.css this lane is at ~2838 and the modal rules are at 612-628. The lane does not edit predict.js, accrue.js, goal-claim.js, death-sheet.js, record.js, combat-screens.css or art-direction.css. The real hotspots are set/b556's own edits: smoke.yml (around lines 1071 and 2025), ci-shape.baseline.json, SYSTEMS_MAP.md (181-248), and home-dashboard.js (the chain card, not awayCardHtml). The lane must merge origin/set/b556 into itself before reporting.
- CLASS A PROOF | Edge hash shown unchanged | On an extract of 715a9b1d I simulated the pack's file set: new src/data/skill-guide.js and src/render/skill-guide.js, the main.js import, and edits to activities-grid.js, home-dashboard.js and legacy.js. `pack-edge --hash` gave c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad before and after (exit 0). Control: adding one line to src/data/gathering.js moved it to d0ccfe42..., so the check does detect a change. None of the pack's files is in the 83-file bundle (skills.js is not either), and it writes nothing, sends no intents and derives no XP.
- RESIDUAL (accepted) | getLevel returns the DISPLAY level (legacy.js:2876: server value plus prediction), so 'Next' and 'Opens' can run one settle ahead of the server. Nothing can spend them, each envelope replaces them, and every existing level surface works the same way, which section 6 allows. Two level-up popups already fire per level; that is a separate P3 and not part of this lane. Everything in this pack affects the player only; nothing crosses to other players. I did not run get_advisors: there is no database surface and the brief forbids touching the DB. I created no branch, so lane-done does not apply to this review.

LANE BRIEF:
LANE lane/content-skill-primer. Branch from origin/main 715a9b1d. CLASS A: client-only. No migration, no edge deploy, no Security review, no database. Tyler is streaming, so do not run the in-page suite, visual-qa or run-ci-local on his PC.

EDGE HASH CONTRACT
- Base hash: `node tools/pack-edge.mjs hr-accrue --hash` = c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad. It must be byte-identical after your last commit.
- After you merge origin/set/b556, it must equal 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f.

A. DATA. NEW src/data/skill-guide.js
- `export const SKILL_GUIDE = Object.freeze({...})`. Each value is Object.freeze({line, use}), in SKILLS_DEF order.
- No edge file may import it.
- Exact text:
  - attack: "Attack decides how often a melee blow lands, and it is the level every sword and hammer asks before it lets you hold it" / "better swords and hammers"
  - strength: "Strength decides how hard a melee blow lands once it does, and a heavy hitter needs fewer swings for every kill" / "faster kills with every melee weapon"
  - defense: "Defense is the level armour asks before you may wear it, and every point of it makes a monster's swing a little less sure" / "heavier armour"
  - hitpoints: "Hitpoints is your health, one point for every level, and it trains itself beside whichever style you fight with" / "longer fights and longer nights away"
  - prayer: "Prayer is trained by laying bones and relics to rest, and it counts toward your combat level at half the weight of Defense" / "your combat level, and a use for every bone"
  - magic: "Magic is the caster's road, a staff in one hand and a pouch of runes in the other, and it opens every stronger staff" / "staves, and a use for every rune you bind"
  - ranged: "Ranged is the patient road, a bow and a full quiver from a safe distance, and it opens every longer bow as it climbs" / "bows, and a use for every arrow you craft"
  - bountyHunter: "Bounty Hunter is earned at the board rather than in the field, one finished contract at a time" / "your standing with the hunt masters"
  - woodcutting: "Every homestead in the valley started as a tree somebody felled, and most of the second storey did too" / "Crafting planks and bows, and your homestead's timber"
  - mining: "Ore comes out of the hill one swing at a time, and the forge is never more than a day from running empty" / "Smithing bars, and the ore your rooms are built with"
  - fishing: "A patient line feeds a hungry camp, and only a well-fed camp ever wins a fight worth telling about" / "Cooking, and so every fight you plan to walk away from"
  - farming: "Crops grow in real time whether you watch or not, which makes a planted plot the most honest promise in the valley" / "Cooking stews, pies, bread and roasts"
  - cooking: "Raw food heals a little and cooked food heals a great deal, which is the whole argument for building a kitchen" / "every meal Auto-Eat reaches for, watched or away"
  - smithing: "Ore becomes bars and bars become blades, plate and the iron fittings no manor can be raised without" / "weapons, armour, tools and your homestead's fittings"
  - crafting: "Logs become planks, hides and cloth become armour, and a steady hand turns out bows, arrows and rings at the one bench" / "planks, bows, arrows, light armour and jewellery"
  - runecrafting: "Blank stones take a rune the way wax takes a seal, and a mage without runes is only a person holding a stick" / "runes for every staff, and elemental enchants for your weapon"
  - stonemason: "The quarry asks nothing of you but time, and the stone it gives back ends up in every wall worth standing behind" / "ashlar for your manor, blank runes and whetstones"

B. LOGIC. NEW src/render/skill-guide.js (ESM)
- Every import carries ?v=555: SKILLS_DEF; TREES, ROCKS, FISH_SPOTS and CROPS from gathering.js; ARTISAN_RECIPES; ITEMS; requiredPlotLevel from ../core/farm.js; SKILL_GUIDE.
- Rungs per skill:
  - woodcutting, mining, fishing: node.name at node.req.
  - farming: crop.name at crop.req. If requiredPlotLevel(cropId) > 1, the name becomes "Carrot (plot tier 2)", because planting is also plot-tier gated server-side.
  - cooking, smithing, crafting, prayer, runecrafting, stonemason: recipe.name at recipe.req from ARTISAN_RECIPES[skill]. SKIP every row with `gated` (these need a recipe scroll; see gateOk in src/core/artisan.js:99).
  - attack, defense, ranged, magic, prayer: also gear. Use ITEMS[id].n at r.lv where r = window.gearWieldReq(item) and r.skill === skill. Read it at call time; if it is absent (as in node), there are no gear rungs.
  - strength, hitpoints, bountyHunter: no rungs.
- Dedupe names within a level. Order by level, then catalogue order.
- Functions:
  - opensAt(skill, lv): names at exactly lv.
  - nextUnlock(skill, lv): {lv, names} for the lowest rung above lv, or null.
  - nextLine(skill, lv): "Next: A, B +N more at Lv L", or ''.
  - headHtml(skill, lv): '<div class="ah-guide">LINE</div><div class="ah-next">Good for: USE' + tail + '</div>'. tail is ' · ' + nextLine when a rung remains; ' · Every NAME unlock is yours' when the ladder is non-empty but no rung remains (for example Woodcutting 90-98 as well as 99); '' when the ladder is empty.
  - awayLevelsLine(levelUps):
    - Return '' unless it gets an array with at least one usable entry.
    - Per SKILLS_DEF skill, skipping unknown ids and non-finite `to`: from = the minimum finite `from`, to = the maximum `to`.
    - Text: "Levels while you were away: Mining 44 → 46, Fishing 30 → 31". Use "Mining reached 12" when there is no finite from.
    - Unlocks: rungs with from < lv <= to, only for skills that have a from. Take the first two: " — Gold Rock is open." or " — A and B are open." Otherwise end with ".".
    - Never read G or a client level; the receipt is server-stated.
- Rules for the module:
  - Escape every output (& < > ") and never put a name inside an inline JS handler.
  - No *ForDisplay( call sites (PRED-1). The level always comes from the caller, which uses getLevel.
  - Export only names another file uses.
  - Publish window.HearthriseSkillGuide = {opensAt, nextUnlock, nextLine, headHtml, awayLevelsLine} inside `if (typeof window !== 'undefined')`. Nothing may touch window at import time.
- src/main.js: add one line, `import './render/skill-guide.js?v=555';`, next to the other render imports.

C. SURFACES
1. Skills header, in BOTH twins (legacy block 27 wins the boot race):
   - activities-grid.js buildHead (:111-151): import headHtml and insert ${headHtml(skillId, lv)} after the .ah-bar div, before goalControl.
   - legacy.js buildHead (:16275-16295): after the .ah-bar line, add `+(window.HearthriseSkillGuide?window.HearthriseSkillGuide.headHtml(skillId,lv):'')`.
2. Character tile, character-page.js:404: append " · LINE" to the title and, when it is non-empty, ". " + nextLine. Pass everything through esc().
3. Level-up banner. Do NOT edit src/render/levelup-celebration.js.
   - Replace the hrSkillUnlocksAt body (legacy.js:3664-3673) with: `const SG=window.HearthriseSkillGuide; return (SG&&typeof SG.opensAt==='function')?SG.opensAt(skill,level):[];`
   - Keep the window.hrSkillUnlocksAt publish at :3674.
   - In _hrRenderLevelUpPop (:3689), when unlocks is empty and SG.nextLine(skill, level) is non-empty, render `<div class="lu-unlock">${escapeHtml(that)}</div>`.
   - legacy.js must net zero or fewer lines; it is at its monolith ceiling.
4. Away card, home-dashboard.js awayCardHtml, directly after the charm-line try block:
   `try{var SG=window.HearthriseSkillGuide;var t=SG?SG.awayLevelsLine(off.levelUps):'';if(t)notes.push({tone:'good',icon:'uiXp',text:t});}catch(e){}`
   Do not touch the legacy welcome modal (ko-sheet-truth owns it).
- CSS: add two rules in src/styles/legacy.css beside `.act-head .ah-xp` (:2838):
  - `.act-head .ah-guide{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-2);margin-top:4px;line-height:1.35}`
  - `.act-head .ah-next{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3);margin-top:2px}`
  - Tokens only. No !important, no new stylesheet, no index.html edit.
- docs/SYSTEMS_MAP.md: add one row in the skills section naming src/data/skill-guide.js (client-only, not vendored).

FILES
- EDIT:
  - src/features/activities-grid.js
  - src/legacy.js
  - src/features/character-page.js
  - src/features/home-dashboard.js
  - src/main.js
  - src/styles/legacy.css
  - src/features/smoke/property-and-unlocks.js
  - src/features/smoke/away-time-and-offline.js
  - .github/workflows/smoke.yml
  - tests/ci-shape.baseline.json (only via `node tests/ci-shape.mjs --write`)
  - docs/SYSTEMS_MAP.md
- NEW:
  - src/data/skill-guide.js
  - src/render/skill-guide.js
  - tests/skill-guide-coverage.mjs
- READ-ONLY:
  - src/render/levelup-celebration.js
  - src/data/{skills,gathering,recipes,items,gear-tiers}.js
  - src/core/**, src/net/**, supabase/**
  - index.html
  - tests/monolith-ratchet.baseline.json (no --write)
  - tests/live-hash-drift.baseline.json
  - CHANGELOG.md, src/build-info.js
- No new comment may name a build (b###); that is CR-3.

TESTS
Guard tests/skill-guide-coverage.mjs:
- Node only. Its own imports carry no ?v=. Register it in the client-guards job beside item-flavour-coverage (smoke.yml:2492-2502) as a plain run and a --selftest run.
- Assertions:
  - SKG-1: exactly one entry per SKILLS_DEF id.
  - SKG-2: no orphan keys.
  - SKG-3: line is 60-150 characters; use is 12-70.
  - SKG-4: no \p{Extended_Pictographic} (emoji).
  - SKG-5: no digits.
  - SKG-6: no < > &.
  - SKG-7: no trailing '.'.
  - SKG-8: every line is unique.
  - SKG-9: woodcutting, mining, fishing, farming, cooking, smithing, crafting, prayer, runecrafting and stonemason each derive at least one rung (integer level 1-99, non-empty name). strength, hitpoints and bountyHunter derive none.
  - SKG-10: no `gated` recipe appears in any ladder.
  - SKG-11: every farming rung with requiredPlotLevel > 1 names "plot tier N", and turnip does not.
  - SKG-12: the pack('hr-accrue') origins contain neither new file.
  - SKG-13 (source text): both buildHead twins call headHtml; legacy hrSkillUnlocksAt references none of TREES, ROCKS, FISH_SPOTS, CROPS or ARTISAN_RECIPES; levelup-celebration.js does not reference HearthriseSkillGuide.
- --selftest plants one defect per SKG id on an in-memory copy. Each must go red under its own id, the clean tree must be green, and the run exits 1 if any defect goes uncaught.
- RED before: commit the guard first against the base tree; `node tests/skill-guide-coverage.mjs; echo $?` must print 1.
- GREEN after: the plain run and --selftest both exit 0. Paste all three exit codes.

In-page tests (no G.* writes, no seeds):
- SKILLGUIDE-1, attended, in property-and-unlocks.js:
  - nextUnlock('woodcutting',14) is level 15 and its names include 'Oak Tree'.
  - opensAt('woodcutting',15) deep-equals window.hrSkillUnlocksAt('woodcutting',15).
  - nextUnlock('attack',1).lv === window.gearWieldReq(window.ITEMS.iron_sword).lv.
  - opensAt('cooking',75) does not include "Hunter's Feast".
  - opensAt('farming',10) matches /Carrot \(plot tier 2\)/.
  - showTab('skills'), then window.renderSkillDetail('woodcutting'): #skill-detail .ah-guide equals the woodcutting line, and .ah-next matches /Good for:/.
- SKILLGUIDE-AWAY-1, away, in away-time-and-offline.js, using window.HearthriseHome.__awayCardHtml:
  - Input {hrs:8, awayMs:28800000, gainedXp:900, levelUps:[mining 44→45, mining 45→46, fishing 30→31]} matches /Mining 44 → 46/, /Fishing 30 → 31/ and /Gold Rock is open/.
  - levelUps:[] shows no "Levels while you were away".
  - [{skill:'mining',to:12}] matches /Mining reached 12/ and does not match /undefined|NaN/.
  - An unknown skill id prints no level line.
- The existing b374 test (bounty-and-artisan.js:1719-1745) must stay green without changes.

VISUAL (at the Coordinator's cut, not in this lane): the Skills header for woodcutting, cooking and farming at desktop and 922x423; the level-up banner; the Home away card; the Character tile. If the phone view pushes the tile grid below the fold, hide only .ah-guide, under the canonical section 7 media query. Proof PNGs go only to a separate branch, qa/content-skill-primer.

GATES. Run each one, branch on $?, and paste the real exit codes.
1. `pack-edge --hash`: identical before and after. `pack-edge --check`: 0.
2. The guard, plain and --selftest.
3. `node tests/ci-shape.mjs` is 0 after --write; `node tests/guard-hygiene.mjs` is 0.
4. `git merge origin/set/b556`. Resolve every conflict here in the lane: regenerate JSON baselines with their own tools, never by hand. Re-run gates 1-3; the hash must now be 184a155a...
5. `node tools/lane-done.mjs`: paste its last line; it must be "lane-done: all green.".

HARD RULES
- Never deploy, apply, push to main or next, or touch the DB.
- Commit only on the lane branch. No git stash.
- Never commit docs/reports/visual-qa/findings.json.
- Report as one table plus at most three sentences. Estimate: 3 hours.
