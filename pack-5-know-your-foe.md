# 5. Know Your Foe: the knocked-out sheet names the fix, and the bounty notice carries the Field Note

VERDICT: GO-WITH-CHANGES | class A: true | est 1.5 h

PLAYER VALUE: When a player in days 7-30 hits a wall at tier 3-4, the 'outmatched' tip says 'train Defence, upgrade your armour, or take a softer target first' (death-sheet.js:203-206). The b495 audit measured Defence as saturated from Rune gear up, because monster accuracy floors at the clamp. The answer the engine actually pays is never named: the foe's weak weapon type gives +20% damage and +15% accuracy (combat.js:52), and a matching element rune gives +15% damage (elements.js).

The Field Notes written in batch 1 appear only in the Bestiary. Bounty notices, the day 7-30 combat loop, have no voice.

After this pack, the failure moment tells the player the one change that shortens the fight. It respects the charm curtain: a player learns an element only once they have studied the kind. The contract they are working on also reads like a hunter's note.

PROBLEMS TO FIX IN THIS LANE (each is a condition):
- 1 | P1 lane-blocker | CONFIRMED | copy row 'foe.weak' ('...so the fight ends sooner') matches SIGN-8 RETIRED /fight ends/ (tests/signposts.mjs:56). I planted it in a scratch copy of release/b559 and got 'FAIL SIGN-8: src/data/signposts.js:22', exit 1. Clean tree exits 0. | blast: none (CI red) | fix: reword (see brief). The brief only checked the copy against SIGN-3/5. The existing guard catches it.
- 2 | P2 dead door | CONFIRMED (static CSS) | the 'Field notes' button calls window.openBestiary() directly. The Bestiary (.ach-overlay, z-index 9998, legacy.css:2189) opens UNDER the death scrim (z-index 100000, death-sheet.js:1124), so the tap shows nothing. | blast: self | fix: send it through act('notes'), which already calls close() first (death-sheet.js:1456), as lucky-finds.js:264 does. Also hide the door while an enabled 'Rest at the Hearth' action is on the sheet: Rest exists nowhere else, and closing the sheet gives it up. | not caught by any test. Add in-page FOE-C.
- 3 | P2 section-6 browser-vs-server | CONFIRMED (probe) | the brief never says where 'the equipped weaponType' comes from. window.getWeaponType() (legacy.js:12262-12303) returns 'sword' for bare hands and falls back to raw G.equipment, but the engine's equipmentStats says 'neutral' (combat.js:167). Probe: unarmed vs goblin gives weaknessInfo(...).matched=false. So the sheet would show weakHeld ('already carry the 1H Sword') to an unarmed player the engine pays no bonus to. | blast: self, false statement | fix: held = weaknessInfo(m, getEquipmentStats()).matched, and only when HearthriseEquipRead.isEquipmentKnown(G). Otherwise show the plain line. | add to FOE-A.
- 4 | P2 copy honesty | CONFIRMED (code) | 'land more often and harder' / 'bring Ranged to it'. Player accuracy is clamped at 0.95 and maxHit is floored (combat.js:486-514). At tier 3-4 with matched gear, accuracy is already at the clamp. Switching to Ranged or Magic also switches the accuracy and damage skill (legacy.js:12316-12318) and risks the x0.25 dry-ammo penalty (ammo.js:64). A melee player told 'bring Magic' can fight longer, not shorter. | blast: self | fix: scope the claim to '{weapon} attacks ... if you have trained that style ... carries a bonus'.
- 5 | P2 missing branch | CONFIRMED | the element line has no 'already enchanted' case. A weapon already carrying the matching element (weaknessInfo.elementMatched, combat.js:317) still reads 'bind that rune to your weapon'. The verb is also wrong: the UI action is 'Enchant weapon' (legacy.js:8185), and 'Bind ... Rune' is the Runecrafting craft (stonecraft.js:372-374). | fix: add 'foe.elementHeld' and say 'enchant your weapon with the {element} rune'.
- 6 | P3 curtain claim inaccurate | CONFIRMED | the brief calls it 'the Bestiary's exact predicate', but the Bestiary also gates the element on `disc` (the residue field G.bestiary, bestiary.js:65,72). For per-monster element classes (dragon, elemental, extradimensional; monster-classes.js:103-124), the sheet can name an element that monster's Bestiary row still hides. It is self-only and matches the design rule 'studied the kind'. | fix: accept the class-level predicate, do NOT copy the residue gate, and word the hidden line 'you will know which', not 'the Bestiary names it'.
- 7 | P3 coupling | CONFIRMED | {more} = nextOfClass(cls).remaining is the distance to the NEXT charm rung. It equals the distance to the reveal only because CHARM_RANKS[0].reveal===true (src/data/bestiary-charms.js:80). | fix: pin that fact in the guard (SIGN-9b).
- 8 | P3 false clause | CONFIRMED | 'You ate everything you had' is carried forward, but the outmatched tip fires on ate>0 even with food left (death-sheet.js:475; the existing fixture foodQty:2, ate:4 gives 'outmatched'). | fix: 'You ate as you fought and still fell.'
- 9 | P2 guard plan | CONFIRMED | FOE-1 and FOE-2 duplicate auditRoster (monster-classes.js:288-305, already run by run-smoke and at boot). A new tests/know-your-foe.mjs also needs a smoke.yml step AND a tests/ci-shape.baseline.json entry (CI-SHAPE-6; the brief omits the baseline). The three in-flight lanes all edit both files (smoke.yml ~375/1411/2151, ci-shape ~17/83/143). | fix: no new guard file. Extend the registered tests/signposts.mjs: armour advice added to SIGN-8, know-your-foe added to SIGN-7, plus a new SIGN-9. That leaves smoke.yml and ci-shape untouched.
- 10 | P2 files missed | CONFIRMED | (a) .bb-note needs a rule in src/styles/board-and-shop.css (tokens only). (b) New death-sheet ensureStyle rules must carry no hex fallbacks, because the css-literal ratchet counts hex inside JS strings. (c) main.js uses setup+boot (import near :478, boot near :537); :440 sits inside the bestiary-charms comment chain, and publish-at-eval breaks the signposts.js 'no top-level window' pattern. (d) describeDeath is PURE and the TIPS call at :665 passes a filtered object: foe facts must be computed in readMoment and passed on d.foe, not read from window.
- 11 | P3 injection hygiene | CONFIRMED (probe) | MONSTER_NOTES keeps Object.prototype, so typeof MONSTER_NOTES.constructor === 'function'. noticeHtml(active.target) reads a key from G.bountyHunter, a RESIDUE_FIELDS entry the client writes. | blast: self-only | fix: hasOwnProperty check, typeof string, esc().
- 12 | P3 ratchets | PLAUSIBLE | CR-2/CR-3 fail if new comments name builds (the brief cites 'b495'; recovery-and-auto-eat.js has a b-number ceiling of 40). legacy.js edits must stay in-place (MONO-1/2).
- VERIFIED OK: no file the pack touches is in the hr-accrue pack. I packed the bundle from release/b559: signposts.js, monster-notes.js, death-sheet.js, legacy.js and main.js are all absent. pack-edge --hash printed 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f, exit 0. Base guards on the b559 export exited 0: signposts, monolith, comment-ratio, test-file, css-literal, dead-exports, dead-css, window-globals, modal-census, no-new-prediction, no-client-copy-of-projection, token-single-source, no-duplicate-toplevel-fns. I did not run lane-done or the in-page suite (read-only review).
- RESIDUAL RISKS ACCEPTED (all self-only; nothing crosses to another player): the element reveal is class-level (item 6). {more} lags attended kills until the next settle, the same as the Bestiary. Armour advice is retired: my probe puts monster accuracy at the 0.10 floor from tier-3 matched armour at the gate level, earlier than the brief's 'Rune'. Under-armoured players lose that hint but keep 'softer target'.

---

LANE lane/content-b5-5-know-your-foe. Branch from origin/release/b559 at 467dcf90. Every new ESM import uses ?v=559. CLASS A: client-only. Do not touch src/core/**, supabase/**, or any src/data file the edge packs (monsters, monster-classes, bestiary-charms, items, ...). src/data/signposts.js and src/data/monster-notes.js are not packed (verified). `node tools/pack-edge.mjs hr-accrue --hash` must print 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f.

GOAL: when a player is knocked out, the sheet names the fix the engine actually pays: the foe's weak weapon type (x1.20 damage, x1.15 accuracy; combat.js:52, 297-300) and, once the kind is studied, its element (+15%; elements.js). The active bounty notice carries the monster's Field Note.

FILES
- NEW src/features/know-your-foe.js (ESM).
- EDIT src/data/signposts.js (rows after 'bag.comp'), src/features/death-sheet.js, src/legacy.js (:4960 and :4981, in place, ZERO new lines), src/main.js, src/styles/board-and-shop.css, tests/signposts.mjs, src/features/smoke/recovery-and-auto-eat.js.
- DO NOT TOUCH .github/workflows/smoke.yml, tests/ci-shape.baseline.json, tests/live-hash-drift.baseline.json or docs/reports/visual-qa/findings.json. Registering a new guard there conflicts with lane/world-tick-stall-after-repoint, lane/settle-before-mutate-f1 and lane/settle-before-mutate-f2f3. That is why the guard work folds into the already-registered tests/signposts.mjs.

1. know-your-foe.js
Imports:
- `weaknessInfo, WEAPON_TYPES` from '../core/combat.js?v=559'
- `MONSTER_NOTES` from '../data/monster-notes.js?v=559'
- `SIGNPOSTS` from '../data/signposts.js?v=559'
- `fill` from './signposts.js?v=559'
Nothing at top level touches window or the DOM.

export function facts(id, opts)
- Returns null unless id is an own property of window.MONSTERS.
- opts defaults:
  - eq = window.getEquipmentStats() (the engine's equipmentStats over the server equipment record plus G.enchant)
  - known = !!(window.HearthriseEquipRead && HearthriseEquipRead.isEquipmentKnown(window.G))
  - charms = window.HearthriseCharms
- wi = weaknessInfo(m, eq). This is the engine's own match predicate. NEVER compare types yourself and NEVER call window.getWeaponType(): it says 'sword' for bare hands while the engine says 'neutral'.
- name = m.name; weapon = WEAPON_TYPES[m.weaponWeak].
- note = the own-property string in MONSTER_NOTES, else ''.
- held = known && wi.matched.
- weakLine = held ? fill('foe.weakHeld', {weapon, foe:name}) : fill('foe.weak', {foe:name, weapon}).
- element (null unless m.elementWeak && charms && charms.countersKnown()):
  - cls = charms.classOfMonsterId(id).
  - If charms.revealsElement(cls): use (known && wi.elementMatched) ? fill('foe.elementHeld', {element}) : fill('foe.element', {element}), with element = m.elementWeak.
  - Else, if nx = charms.nextOfClass(cls): fill('foe.elementHidden', {more: nx.remaining, kind: charms.classLabel(cls)}).
  - If the counters are unknown, omit the line entirely. Never print a number from an unknown.
- outmatchedTip = held ? fill('foe.outmatchedHeld', {weapon}) : fill('foe.outmatched', {foe:name, weapon}).
- Return plain data: {id, name, note, weapon, held, weakLine, elementLine, outmatchedTip}.

export function aboutHtml(f, {door})
- Returns '' for null.
- Otherwise: <div class="hr-death-foe"> containing a <b> heading from SIGNPOSTS.labels['foe.heading'], the note in <i>, weakLine and elementLine, all esc()'d.
- If door is true, add <button class="btn ghost hr-death-notes" data-act="notes"> with the label 'foe.notes'.

export function noticeHtml(target)
- Returns '<p class="bb-note"><i>' + esc(note) + '</i></p>', or '' unless target is an own property of MONSTER_NOTES and the value is a string. target comes from G.bountyHunter, a RESIDUE_FIELDS entry: use it only as a key and never echo it.

export function elementSuffix(target)
- Returns ' · ' + esc(elementWeak) only when countersKnown() && revealsElement(cls); else ''.

export function setupKnowYourFoe()
- window.HearthriseFoe = Object.freeze({facts, aboutHtml, noticeHtml, elementSuffix}).

Rules for this file: no hex colours in any string. No reads of G.bestiary or G.stats (residue). No *ForDisplay calls or predict.js API. Every foe.* key must appear as a full string literal in this file (SIGN-1).

2. src/data/signposts.js: rows after 'bag.comp' at :20, with vars declared. Checked: 30-200 chars, no digits, no RETIRED words.
- 'foe.weak': '{foe} is weak to {weapon} attacks: switch to them if you have trained that style, and every blow you land carries a bonus.' vars [foe, weapon]
- 'foe.weakHeld': 'Your {weapon} attacks are the kind {foe} is weak to, so every blow you land already carries the bonus.' vars [weapon, foe]
- 'foe.element': 'Its kind gives way to {element}: enchant your weapon with the {element} rune and every blow carries a bonus against it.' vars [element]
- 'foe.elementHeld': 'Your weapon already carries the {element} its kind gives way to, and every blow is the better for it.' vars [element]
- 'foe.elementHidden': 'Its kind gives way to one element you have not learned yet; {more} more {kind} kills and you will know which.' vars [more, kind]
- 'foe.outmatched': 'You ate as you fought and still fell. {foe} out-fights you as you stand: switch to {weapon} attacks if you have trained them, carry better food, or take a softer target first.' vars [foe, weapon]
- 'foe.outmatchedHeld': 'You ate as you fought and still fell, even with the {weapon} attacks it is weak to. Carry better food, train up, or take a softer target first.' vars [weapon]
- labels: 'foe.heading': 'Know your foe', 'foe.notes': 'Field notes'.

3. src/features/death-sheet.js (describeDeath stays PURE, with no window reads inside it)
- TIPS.outmatched (:203-206) returns (d.foe && d.foe.outmatchedTip) || ('You ate as you fought and still fell. ' + d.monsterName + ' out-fights you as you stand: carry better food, or take a softer target first.'). No 'train Defence' and no 'upgrade your armour'. The tipKey rule at :475 is unchanged.
- In describeDeath, thread `foe: d.foe || null` into the TIPS argument object at :665 and onto the returned model.
- In readMoment (return object near :913), add `foe: (function(){ try { return (window.HearthriseFoe && id) ? window.HearthriseFoe.facts(id) : null; } catch (e) { return null; } })()`.
- In render (:1226), after the tip block and inside .hr-sheet-body, add model.foe ? window.HearthriseFoe.aboutHtml(model.foe, {door: !restOffered}) : ''. restOffered = model.actions.some(a => a.k === 'rest' && !a.disabled): Rest exists only on this sheet, so the door must not take it away.
- In act() (:1451), add `if (kind === 'notes') { if (typeof window.openBestiary === 'function') window.openBestiary(); return; }`. The existing close-first at :1456 is REQUIRED: the Bestiary (.ach-overlay, z-index 9998) otherwise opens under this scrim (z-index 100000).
- In ensureStyle, add .hr-death-foe{margin:12px 0 0;padding:10px 12px;border-radius:10px;border:1px solid var(--line)} and .hr-death-notes{min-height:44px;margin-top:8px}. Tokens only, with NO hex fallback (the css-literal ratchet counts hex in JS strings).
- No build numbers in new comments (CR-2/CR-3).

4. src/legacy.js, both edits on the existing lines (MONO-1/2):
- :4960: inside bb-weak, after ${_hrDropBonusNote(m)}, add ${window.HearthriseFoe?window.HearthriseFoe.elementSuffix(active.target):''}. After that </p>, add ${window.HearthriseFoe?window.HearthriseFoe.noticeHtml(active.target):''}.
- :4981: add elementSuffix(b.target) only. The board shows no note.

5. src/styles/board-and-shop.css: beside the .bb-weak rule at :235, add body[data-theme] #panel-bounty .bb-note{margin:4px 0 0;font-style:italic;color:var(--ink-3)}. Tokens only, no new @media.

6. src/main.js: add `import { setupKnowYourFoe } from './features/know-your-foe.js?v=559';` after the setupSignposts import (:478), and `boot('know-your-foe', setupKnowYourFoe);` after boot('signposts') (:537).

TESTS
Guard: extend tests/signposts.mjs. No new tests/*.mjs.
- SIGN-8: extend RETIRED to /fight ends|night ends in recovery|until you fall|nobody eats for you|upgrade your armou?r|train defen[cs]e/i. RED before: death-sheet.js:205 contains the literal. GREEN after. Add selftest mutation armourAdvice.
- SIGN-7: widen /signposts/ to /signposts|know-your-foe/ in both the pack-origin check and the core/data import check. Add selftest mutation foeCoreImport.
- NEW SIGN-9, one selftest mutation per arm:
  - (a) every WEAPON_AXES member (monster-classes.js:41) has a WEAPON_TYPES label (combat.js:49).
  - (b) CHARM_RANKS[0].reveal === true, so nextOfClass().remaining is the distance to the reveal.
  - (c) every foe.* line key is a literal in src/features/know-your-foe.js.
- Per-monster weapon and element validity is already auditRoster's (monster-classes.js:288). Do not duplicate it.

In-page tests (recovery-and-auto-eat.js): each at most 20 code lines, ZERO G seeds (pass stubs through opts). All three are RED on 467dcf90 (HearthriseFoe undefined) and GREEN after.
- FOE-A: facts('goblin', {eq:{weaponType:'hammer',element:null}, known:true, charms:null}).
  - note === MONSTER_NOTES.goblin, and weakLine contains 'weak to 1H Sword'.
  - eq {weaponType:'sword'} with known:true gives 'already'.
  - The same eq with known:false does NOT say 'already'.
  - eq {weaponType:'neutral'} does NOT say 'already'.
- FOE-B: charms stub {countersKnown:()=>true, classOfMonsterId:()=>'humanoid', revealsElement:()=>false, nextOfClass:()=>({remaining:7}), classLabel:()=>'Humanoid'}.
  - elementLine contains '7 more Humanoid' and no poison synonym (the lore-notes.mjs SYN map).
  - revealsElement true: the line names poison.
  - With eq.element 'poison' and known:true: the elementHeld text.
  - countersKnown false: no elementLine.
  - describeDeath({ateThisFight:2, foodQty:0, monsterName:'Goblin', foe:<facts>}).tipKey === 'outmatched'. Its tip names '1H Sword' and does not match /armou?r|Defence/.
- FOE-C: HearthriseDeathSheet._render(model-with-foe, {monsterId:'goblin'}), then click [data-act="notes"].
  - Assert #hr-death-scrim is NOT .show and #best-overlay IS .show.
  - A model with an enabled rest action renders no [data-act="notes"].
  - Teardown: close the Bestiary, then __resetForTest().

GATES (write 'green' only from an exit code you saw):
- node tests/signposts.mjs; echo $?
- node tests/signposts.mjs --selftest; echo $?
- node tools/pack-edge.mjs hr-accrue --hash (must equal 184a155a...114f)
- node tools/lane-done.mjs, and paste its last line.
- The in-page suite once, only when the machine is quiet (node tests/run-smoke.mjs).
- Proof PNGs at 1280x800 and 922x423 of: the sheet for an unstudied kind, the sheet for a studied kind, the active bounty notice, the board. Commit them ONLY to the separate branch qa/content-b5-5-know-your-foe.
- Play gate on the QA account: take a bounty and read the notice; get knocked out once against an unstudied kind and once against a studied kind; tap 'Field notes' and confirm the Bestiary opens in front.

Never deploy, never push main or next, never git stash (commit WIP on the branch). Before reporting, merge the current set/release branch into the lane and resolve conflicts in-lane. Other batch-5 packs likely share these anchors: the signposts.js rows after 'bag.comp', the main.js import/boot lines, the tests/signposts.mjs RETIRED/SIGN-7 lines, legacy.js renderBountyPanel, and death-sheet.js TIPS/render. There is no overlap with the three edge/lane-C branches once the guard stays inside signposts.mjs. Estimate: about 2 h.
