# LANE BRIEF — lane/hero-class-map-skills
Every citation is file:line on 85da250d (origin/set/b559 = live b558 + four merged fixes; BUILD.cache 558). Branch `lane/hero-class-map-skills` from origin/set/b559 at the SHA the Coordinator names in the routine prompt. Since 85da250d the set branch has moved in only src/features/daily-reward.js, src/features/renown.js, src/render/modal-sheet.js and two smoke files — none is a target of this lane.

## 0. Hard rules for this routine
- Read-only toward everything but your branch: never deploy, never touch the DB, never run bump-version.sh, never edit tests/live-hash-drift.baseline.json, never commit docs/reports/visual-qa/findings.json, no git stash.
- Commits <= 8 lines, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit and push early; push the branch after commit 1.
- Every new import under src/** carries `?v=558` (src/build-info.js:17 `cache: 558`). `./bump-version.sh --check` (bump-version.sh:33-37) is step 1 of tools/lane-done.mjs and fails on a bare import.
- No `b\d{3}` in any new comment (CR-2/CR-3, tests/comment-ratio-ratchet.mjs:36-41). Write "this build", never "b559".
- Nothing heavy beyond what the gates in §7 name. Supabase and Google Fonts are unreachable here; §7 says how that shows up.

## 1. Verified root cause (apply as written; both skeptic verdicts hold)
- src/features/character-page.js:41-61 `deriveClass()`. The top-skill pick is CORRECT: it iterates the envelope-fed `G.skills` keys (:44-46) through `srXpOf` (:33-39), so Runecrafting/Stonemason do win when they lead. Only the NAME lookup misses: `classMap` at :48-53 has 15 keys; :54 `classMap[topId] || 'Adventurer'`. Tiers at :56-59 (100/1,000/10,000).
- History: classMap was written in e3029522 (2026-05-03, "Hearthrise pre-beta"). The two skills arrived in 7a0855f7 (b357, 2026-08-16; src/data/skills.js:20-21, Fletching note at :16). That commit edited character-page.js only in hunks at :117 (gatherRates) and :346 (buildSkillsHeader) — never :48.
- Reproduced from the real body (srXpOf + deriveClass extracted from 85da250d, run per SKILLS_DEF id with that skill at 50,000 XP and hitpoints 1,154, the rest 0): 15 ids get their title; `runecrafting -> Master Adventurer`, `stonemason -> Master Adventurer`. Fresh hero (hitpoints 1,154 only) -> `Skilled Brawler`. Stripped G (no skills) -> `{name:'Adventurer', tagline:'Path: Wanderer'}`. runecrafting at 5,000 -> `Skilled Adventurer`.
- Reachable tiers for a real hero: only "Skilled" and "Master", because START_SKILL_XP.hitpoints is 1,154 (src/data/start-kit.js:66-68). "Path:" and "Aspiring" are unreachable.
- The word "Adventurer" (cls.name) is never painted; only `cls.tagline` is (:229). The live surface is ONE: Character > Hero `.cr-class` (buildHeroCard :198 -> :229, via refreshHeroPane :492). The Skills-banner fallback at :351 is effectively dead: renown getState (src/features/renown.js:358-375) always returns `rank: RANKS[rankIndexFor(..)]` and rankIndexFor defaults idx to 0 (:317-321), so `rn.rank` is always truthy at :342.
- Legacy twin: src/legacy.js:16934-16958 (block 34, :16929-17218). Same 15 pairs at :16945-16950 but NOT byte-identical (var, raw `Object.entries(G.skills)` at :16936-16941, an extra SKILLS_DEF guard at :16942-16943). Consumers :17048/:17076 and :17093/:17102. Reachable only if setupCharacterPage throws (src/main.js:504 boot() isolation, :521), because character-page.js:567 overwrites window.renderCharacter on every normal boot.
- No guard: tests/skill-guide-coverage.mjs pins only SKILL_GUIDE (SKG-1/2 :71-73). On a clean archive of 85da250d it prints "17/17 skills guided, 407 rungs" and exits 0; `--selftest` catches 14/14.
- No LANE C: `node tools/pack-edge.mjs hr-accrue --hash` on 85da250d = `184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f`; the pack's 83 origins contain neither src/data/skills.js, src/data/skill-guide.js, src/render/skill-guide.js nor src/features/character-page.js (SKG-12 asserts the two guide files, :123). No catalogue, migration or edge file moves.
- Not a CLAUDE.md §6 disagreement: nothing gates, spends or sends on deriveClass (the only readers are :198, :351 and the legacy twin), so P3, not P1.
- CORRECTIONS folded in (do NOT do these): (a) the activity-bar map at legacy.js:11533 is DEAD, not a live "generic anvil": startArtisan sets `G.activeSkill` (legacy.js:15037; base :14547), nothing writes `G.activeArtisanRecipe` (src/net/events.js:87 "Nothing in the game writes them any more"; legacy.js:15984), so refreshActivityBar returns from the skill branch at :11496-11513 where `setActivityIcon(iconEl, G.activeSkill)` (:11499 -> src/render/icons.js:238-241, HR.icon) already draws the real runecrafting/stonemason glyphs (src/data/glyphs-extra.js:40, :60). (b) recipe-book.js:105 appends any ARTISAN_RECIPES lane missing from SKILL_ORDER, so a 7th lane is not dropped; only :87 lacks the `|| skill` fallback that :93 and :119 have. (c) `G.skills` keys reach the client through record.js applyRecord, not accrue.js; the conclusion is unchanged. (d) Block boundaries: block 15's renderCharacter is :13079-13178 and block 15 also holds the LIVE 'character-render' tap (:13181-13188) and the 2 s refresh (:13191-13194); block 34's IIFE ends at :17218 and registers the 'character-rebuild' tap at :17213, which src/features/smoke/boot.js:135-142 EXPECTED pins. This lane deletes NO block.

If, on the SHA the Coordinator names, `node tests/skill-guide-coverage.mjs` is already red, or character-page.js:48-53 no longer holds the 15-key literal, stop and report: the mechanism must hold before the fix.

## 2. Class list (same root: a hand-written per-skill map that never learned b357's two rows)
FIXED IN THIS BUILD (this lane):
1. src/features/character-page.js:48-54 classMap — the live bug.
2. src/legacy.js:16934-16958 block-34 deriveClass twin — one-line delegation (dead path, but the same literal).
3. src/features/smoke/monsters-inventory-and-brand.js:7640 — the glyph test hand-lists `['runecrafting','stonemason']`; an 18th skill with no HR_GLYPHS row would ship an empty medallion. Switch to `Object.keys(window.SKILLS_DEF)` (all 17 have glyphs today: src/data/glyphs.js:16 carries 15, glyphs-extra.js:40/:60 the other two; src/features/icon-set.js:35-45 ACCENT already names all 17).
4. docs/SYSTEMS_MAP.md:313 — the add-a-skill cookbook line must name the new `title` field, or the next skill ships without one.

NAMED FOR THE PARALLEL HARDENING LANE (never blocks this fix; do not do here):
- Roster guard folded into tests/skill-guide-coverage.mjs as SKG-16/17 (not a new tests/ file — a new smoke.yml step forces tests/ci-shape.baseline.json --write and collides with any lane registering a step the same day; skill-guide-coverage sits in the "client-guards" family, ci-shape.baseline.json:191-192). SKG-16: every SKILLS_DEF id sits in exactly one of LADDER_SKILLS (:53-54) / RUNGLESS_SKILLS (:55) / GEAR_SKILLS (src/render/skill-guide.js:33) — today an 18th skill in none of them passes SKG-9 silently. SKG-17: named per-skill maps are SUPERSETS of the right roster (HR_GLYPHS ∪ glyphs-extra and ACCENT ⊇ all 17 — both hold non-skill keys gems/gold/foraging/ui*, so never "equals"; quest-nav.js:73-78 SKILL_VERB ⊇ GATHER_SKILLS ∪ Object.keys(ARTISAN_RECIPES) — it includes prayer, cat 'combat', so not "non-combat"; leaderboards.js:59-63 and character-page.js:367-372 SKILL_ORDER ⊇ all 17; recipe-book.js:17-21 lanes ⊇ Object.keys(ARTISAN_RECIPES)). ACCENT and HR_GLYPHS live in classic-script IIFEs node cannot import: text-parse them. Do NOT add a "3-or-more-ids literal" ratchet — it reds legitimate data rows (muster THEMES, gear-tier style maps) against CLAUDE.md §1 "grow content by adding data rows". src/data/glyphs.js:16 is GENERATED (:2 "do not hand-edit") and 15/17 by design: allowlist it.
- Paydown with CORRECT boundaries: delete the never-reached artisan branches legacy.js:11530-11541 and :11622-11630 plus src/activity-bar-clickable.js:25 together; delete inert BUNDLE_SKILL_ICON src/render/icons.js:306-322 (read only by the console.log at :1039-1042; invariant note :600-607); derive recipe-book.js:17-21 and item-index.js:19-22 labels from SKILLS_DEF and add the `|| skill` fallback at recipe-book.js:87; delete the dead legacy renderer BODY :13079-13178 only (keep :13181-13194), the block-23 extension chain :15232-15360 (buildActivityCard follows at :15361), and block 34 :16929-17218 WHOLE — and in the same commit retire 'character-rebuild' from boot.js:135-142 EXPECTED the way 'profile-button' was (:128-134), or the in-page census is red (P1 under §4). Sequence after today's other legacy.js lanes and regenerate monolith/comment/test-file baselines with their own --write, never hand-merged.
- legacy.js:690 factory `G.skills` (13/17): do NOT complete it. Under the armed record loadLocal forgets it at boot (legacy.js:1182-1194, "client-authored copy of a server-owned field"); growing it is the wrong direction under §6. Allowlist it in SKG-17 or route to Systems to shrink it.
- Latent hand copies, no symptom today: src/features/combat-screens.js:127 COMBAT_XP_SKILLS (copy of src/core/progression.js:30 plus a 'defence' alias; the derived seam is src/data/skill-authority.js:71 combatXpSkills()); src/features/clan-seat-ui.js:459 GATHER_SKILLS (copy of src/core/pacing.js:51 plus a phantom 'foraging'); the two smoke hand-lists at farm-and-profile.js:1415 (`['smithing','crafting','cooking']`, categorizeRecipes) and quests-chronicle-and-bonus.js:1178 (3 of 6 artisan lanes).
- Stale prose, no code guard: src/data/start-kit.js:59 "fifteen skills"; leaderboards.js:42 "the fifteen skills"; chronicle.js:55 "13 skills"; src/net/auth.js:706-711 "12 skills ... = 22" (FRESH_FLOOR=40 derived from it; a fresh hero now totals 26); src/ftue.js:96 body names Cooking/Smithing/Crafting only.

ROUTED ELSEWHERE:
- Game Designer (batch-5 Hero's Record): legacy.js:14248-14253 `min_combat_skill` = ['attack','strength','defense','hitpoints'] backs all_25 "Well-Rounded" / all_50 "Combat Master" (:14201-14202) whose desc says "All combat skills" — 4 of 8 cat 'combat'. Display-only (checkAchievements :14264-14276 pays nothing). Also: every new hero reads "Skilled Brawler" because hitpoints starts at 1,154.
- Coordinator, read-only: `select public.hr_lb_skills()` on live. The 15-id body is supabase/migrations/2026-08-08-leaderboards.sql:118-122; the 17-id twin 2026-08-17-leaderboard-skills.sql:53-57 is recorded "STAGED, NOT APPLIED" at tests/schema-apply-order.json:469, and leaderboards.js:64-73 says the two boards read EMPTY until it applies. The in-page b222 test (smoke/muster-nav-and-identity.js:2160-2174) proves only the client list. If live returns 15, that is a LANE C item with its own Security GO — not this lane.

## 3. Fix design — one seam, client-only
Titles: use the two the routine prompt names. If it names none, use 'Runebinder' (runecrafting) and 'Mason' (stonemason) — the recorded suggestions — and flag both in the report for the Game Designer; a swap is a two-string data edit.

(1) src/data/skill-guide.js:9 — `const g = (line, use, title) => Object.freeze({ line, use, title });`. Move the 15 existing titles over unchanged (attack Warrior, strength Berserker, defense Guardian, hitpoints Brawler, prayer Devotee, magic Mage, ranged Ranger, bountyHunter Bounty Hunter, woodcutting Lumberjack, mining Miner, fishing Angler, farming Farmhand, cooking Chef, crafting Artificer, smithing Smith) and add the two. SKG-3..8 loop only over `line` and `use` (:75-88), so the third field is safe there; SKG-15 bands it.

(2) src/render/skill-guide.js — add and export a pure `heroClass(xpOf, defs = SKILLS_DEF)`:
- iterates `Object.keys(defs)` (the roster), never `G.skills` keys;
- `xpOf(id)` returns a number or `null` (null = UNKNOWN);
- if every id is null -> return `null` (the pending state; the CALLER paints the mark);
- else top = highest known xp (ties keep roster order; unreachable on a server-created hero since hitpoints starts at 1,154); name = `SKILL_GUIDE[top].title`; tagline by the same 100/1,000/10,000 tiers ('Path: ' / 'Aspiring ' / 'Skilled ' / 'Master ');
- touches no `window` at import time (the node guard imports this file; the publish at :140-142 is already guarded) and add `heroClass` to the `window.HearthriseSkillGuide` object at :141 (window-globals-exist needs an assignment; it exists).
Never call `skillXpForDisplay(` inside this module or the caller: tests/no-new-prediction.mjs:80 counts every `\w*ForDisplay\s*\(` call site (PRED-1) and a new one is red. `skillXpForDisplayOr(` does not match that regex.

(3) src/features/character-page.js:41-61 — keep the name `deriveClass` (consumers :198, :351 stay), delete the classMap literal and the two raw `G.skills` reads (:43-44), and delegate:
```
import { heroClass } from '../render/skill-guide.js?v=558';   // dead-exports needs a real importer, not only the window publish
import { balanceMarkup, UNKNOWN_TEXT } from '../net/balance.js?v=558';   // :29 already imports this module; UNKNOWN_TEXT is balance.js:84
function deriveClass() {
  const G = window.G, SR = window.HearthriseSkillRecord;
  const xpOf = (id) => (SR && typeof SR.skillXpForDisplayOr === 'function') ? SR.skillXpForDisplayOr(G, id, null) : null;
  return heroClass(xpOf) || { name: null, tagline: UNKNOWN_TEXT };
}
```
`skillXpForDisplayOr(G, id, fallback)` returns the fallback when `!known` (src/net/skill-record.js:244-247); the unknown rung is skill-record.js:224-226. Do not fall back to a raw `G.skills` read the way srXpOf :37-38 does: `skills` is a ratcheted raw-read field in tests/no-client-copy-of-projection.mjs (:93; RAW-READ-ROSE at :353-357). Removing :43-44 makes that count FALL, which is green without --write. `srXpOf` stays (still used at :250 and :389). `UNKNOWN_TEXT` is an em dash: safe both raw (:229) and through esc() (:351). No in-page test pins 'Path: Wanderer', `.cr-class` or deriveClass (grepped src/features/smoke*, tests/ on 85da250d), so the unknown branch moving from a fake class to the pending mark breaks nothing and satisfies §6 ("an unknown renders as a pending mark").

(4) src/legacy.js:16934-16958 — replace the body with a delegation through the window seam (no new column-0 `function`; net lines <= 0):
```
function deriveClass(){
  var SG = window.HearthriseSkillGuide, SR = window.HearthriseSkillRecord, B = window.HearthriseBalance;
  var xpOf = function(id){ return (SR && typeof G !== 'undefined') ? SR.skillXpForDisplayOr(G, id, null) : null; };
  var c = (SG && typeof SG.heroClass === 'function') ? SG.heroClass(xpOf) : null;
  return c || {name:null, tagline:(B && B.UNKNOWN_TEXT) || '—'};
}
```
`window.HearthriseBalance` is published at src/net/balance.js:394-395 with UNKNOWN_TEXT. Keep the `deriveClass` name: tests/no-duplicate-toplevel-fns.mjs segments by column-0 `})();` and character-page.js is out of its scope.

(5) src/features/smoke/monsters-inventory-and-brand.js:7640 — `Object.keys(window.SKILLS_DEF).forEach((k) => {` (window.SKILLS_DEF is published at src/main.js:131). Zero net lines, zero G seeds.

(6) docs/SYSTEMS_MAP.md:313 — append ", plus its `title` (the Hero class name; heroClass in src/render/skill-guide.js)".

Do NOT touch legacy.js:11533 (dead branch), the SKILL_ORDER lists, recipe-book.js or item-index.js in this lane.

## 4. Regression test — SKG-15 in tests/skill-guide-coverage.mjs (already in CI: .github/workflows/smoke.yml:2574-2578, family "client-guards")
Add to the header list (:9-31) and to `check(ctx)` (:66). `loadReal()` (:126) gains `heroClass` the way it loads `ladderOf` (:135, try/catch; absence is reported under SKG-15, not thrown). Assert:
- (a) every guide entry has `title`: string, 3-20 chars, matches `/^[A-Za-z][A-Za-z ]*$/`, unique across entries.
- (b) `heroClass` is exported and is a function.
- (c) for every id in `ctx.skillIds` (Object.keys(SKILLS_DEF) — the loop grows with the data): `heroClass((k) => k === id ? 50000 : k === 'hitpoints' ? 1154 : 0)` returns `name === guide[id].title` and `tagline === 'Master ' + guide[id].title`; and name is never 'Adventurer'.
- (d) `heroClass(() => null)` returns `null` (pending, never a class built from factory defaults); `heroClass((k) => k === 'hitpoints' ? 1154 : null)` returns `'Skilled ' + guide.hitpoints.title`.
Mutation arms appended to MUTATIONS (:170-185), each red under SKG-15 and the clean clone green:
- delete `c.guide.stonemason.title`;
- `c.heroClass = ` the OLD 15-key literal lookup (plant the pre-fix body in the arm) -> red on runecrafting/stonemason;
- `c.skillIds.push('fletching')` -> red under SKG-1 AND SKG-15;
- `c.heroClass = () => ({ name: 'Warrior', tagline: 'Path: Warrior' })` -> red under (d).
No in-page test: keep the regression in node. A `.cr-class` test would need a G.skills seed under the armed record (zero-seed rule, TF-2), and src/net/accrue.js warns un-stamped G.skills writes read as forged. If a later lane wants one, the precedent is FIRST-LIGHT-3 (monsters-inventory-and-brand.js:8308-8358), which stubs `window.HearthriseSkillRecord.skillXpForDisplayOr` and never seeds G.
Both-path (attended/away) tests are not required: display-only, no combat/accrual/receipt path.

## 5. Commit plan (RED on base, GREEN after, proof in the message)
- Commit 1: SKG-15 + arms ONLY. Run `node tests/skill-guide-coverage.mjs` -> must exit 1 with `SKG-15` lines (heroClass not exported; titles missing). Quote the exit code in the message. Push.
- Commit 2: the seam (§3 (1)-(6)). Run the guard -> exit 0; `--selftest` -> exit 0 with 18/18 arms. Message carries the four arm names and "SKG-15: RED on base (exit 1), GREEN after (exit 0)". Push.
A claim of green is gated on `$?`, never on expectation (`( cmd || echo RED )` returns 0).

## 6. Constraints that bite
- src/legacy.js MONO-1 ceiling 19,074 lines (tests/monolith-ratchet.baseline.json), 18,950 on 85da250d; MONO-2 functions <= 420. Rule for this lane: net <= 0 lines in legacy.js, no new column-0 `function`. The twin delegation (§3 (4)) is ~-19 lines.
- CR-1/CR-2: comment lines per pinned file may grow only with code; no build numbers in comments. src/render/** lines may only rise (MONO-5 floor) — the new function is the right direction.
- TF-1/TF-2: the only smoke edit is 0 net lines and 0 seeds; add no in-page test.
- tests/dead-exports.mjs: `heroClass` must be imported by character-page.js (the window publish alone counts as its own file).
- tests/window-globals-exist.mjs: reads of `window.HearthriseSkillGuide` / `HearthriseSkillRecord` / `HearthriseBalance` all have assignments (render/skill-guide.js:141, skill-record.js:348, balance.js:394).
- tests/ci-shape.mjs: no new workflow step, so tests/ci-shape.baseline.json is untouched. tests/guard-hygiene.mjs: new --selftest arms are fine.
- SKG-12: neither guide file may enter the hr-accrue pack; they do not.
- Tokens only, no new @media: no CSS changes are expected; `.cr-class` already exists.
- Collision: other lanes may touch src/legacy.js today. If merging set/b559 conflicts, merge it INTO this branch, re-run §7, report — the Coordinator never resolves a hunk by hand.

## 7. Gates (quote every exit code)
1. `node tests/skill-guide-coverage.mjs` and `--selftest` (exit codes; RED on commit 1, GREEN on commit 2).
2. `node tools/lane-done.mjs` (tools/lane-done.mjs:7-67). It runs bump-version --check, monolith/comment/test-file ratchets, patch-chain, no-client-xp-mint, property-gate-census, dead-exports, dead-css, window-globals-exist, no-duplicate-toplevel-fns, token-single-source, css-literal-ratchet, breakpoint-guard, modal-primitive-census, no-client-copy-of-projection, no-new-prediction, utc-midnight-replay (~3 min, PGlite, no network), settle-carry-defer (+--mutate), ledger-rollup (+--mutate), ci-shape, guard-hygiene, snapshot-allowlist --selftest. Exit 0 required; print the first RED lines verbatim if any.
3. `node tools/pack-edge.mjs hr-accrue --hash` -> must print `184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f`.
4. `HR_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/run-smoke.mjs` (tests/run-smoke.mjs:2083 reads HR_CHROME; :2101 sets `window.__HR_TEST_HARNESS__ = true`). Never `--only` (a filtered run always exits non-zero, :4011). Supabase/CDN failures are filtered from console errors (:4047-4050) and SKIPs never redden (:4000-4001); Google Fonts unreachable does not stop boot. If a FAIL names fonts.googleapis, gstatic, supabase or raw.githubusercontent, report it by exact test name as ENVIRONMENTAL; any other red is a P1 you fix at source and never re-run until green.
5. Visual proof (a rendered surface changed): tests/visual-qa.mjs's own viewports are 1440x900 and 852x393 (:72-75), so write a throwaway script that imports `{ bootPage, serve }` from tests/visual-qa.mjs (:801), boots at `{width:1280,height:800}` and `{width:922,height:423}`, aborts `/fonts\.(googleapis|gstatic)\.com/` requests (the :460 pattern), opens Character > Hero, and captures: (i) as booted (class line shows the pending em dash); (ii) with `window.HearthriseSkillRecord = { skillXpForDisplayOr: (G,id,fb) => id==='stonemason' ? 50000 : id==='hitpoints' ? 1154 : 0 }` set in-page then `window.renderCharacter()` re-run (class line shows "Master <title>"). PNG only, both sizes, committed ONLY on branch `qa/hero-class-map-skills` (never on the lane branch, never findings.json). Read the PNGs before reporting them.

## 8. Report format (one table, <= 3 sentences after it)
| item | status | needed |
Rows: SKG-15 (RED on base exit / GREEN after exit); lane-done (exit); pack-edge hash (value); run-smoke (pass/fail counts, environmental reds by name); visual proofs (paths on qa/hero-class-map-skills, both sizes, what each shows); titles used (from prompt / defaults flagged for the Game Designer); branch + commit SHAs. Status words: READY (unmerged, unplayed) / RED / BLOCKED. Then the hardening-lane and routed items from §2 in one line each. Never say "shipped"; the Coordinator merges into set/b559 and it rides the 20:00 UTC cut.