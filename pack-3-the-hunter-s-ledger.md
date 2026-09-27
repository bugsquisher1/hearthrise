# 3. The Hunter's Ledger: the week's charm and trophy ladders, plus a charm rank-up moment

VERDICT: GO-WITH-CHANGES | class A: true | est 2 h

PLAYER VALUE: When the Journeyman's Road ends, Home's chain card disappears and 'Next up' only knows skills and dailies (profile-launchpad.js:271-360).

The server-owned ladders that fill days 2-14 are buried in the Bestiary modal:
- Bestiary charms at 25/100/500/2,000 kills per class, across 11 classes
- trophies at 2,500+ kills per monster

A charm rank-up has no moment at all; the envelope silently swaps the counters (bestiary-charms.js:74-95). A first-week hunter crosses 25 and 100 in several classes, so this is the most frequent free moment of delight in days 2-7.

This pack adds:
- a Home card with the nearest charm and trophy (and 'trophy ready')
- a live Ledger line on the Fight rail for the current foe
- a one-time 'A charm is earned' sheet with new hunter's lore per class and per rank

PROBLEMS TO FIX IN THIS LANE (each is a condition):
- P1 | CONFIRMED | The dedupe record is keyed on G.name, and that field does not exist. G carries playerName (legacy.js:674), which is scoped to the account, not the character. The only other reader of G.name is set-the-night.js:374. So `who` is always '' and the record cannot tell hero slots or accounts apart. Trigger: switch hero slot (the switch reloads the page). The first envelope then diffs slot B's ranks against slot A's record and opens 'A charm is earned' for ranks earned weeks ago. Blast radius: the player's own display only, but it breaks the section 6 rule that the browser never contradicts the server. Fix: key the record by HearthriseAuth.currentUserId() + ':' + HearthriseProfile.activeSlot(); with no uid, do nothing. The pack's tests would not catch this; guard it with HLEDGER-5's slot-switch arm.
- P1 | CONFIRMED | Class key mismatch. The lore map uses `extradimensional` (the data/monster-classes.js spelling), but the charm counters and ranks use `extra_dimensional` (core/bane.js:84-86; render/bestiary-charms.js:42,82; the suite drives that key at hunt-raids-and-screens.js:2061). Proposed LORE-8 is 'keys = Object.keys(MONSTER_CLASSES)'. Against bane.js that gives '0'..'10' and is always red. Against data/monster-classes.js it passes, yet at runtime CHARM_CLASS_LORE['extra_dimensional'] is undefined. Result: the Extra Dimensional moment, the one class whose reveal the charm exists for, renders without its lore. The pack's undead-only tests miss it. Fix: key the map by the bane taxonomy; make LORE-8 set-equal to [...bane MONSTER_CLASSES]; add a plant that respells the key.
- P1 | CONFIRMED | The pack gates the moment on the wrong 'is a sheet open' predicate. topOpen() only sees .hr-scrim (modal-sheet.js:37-46). The b559 fix (lane/rankup-overlay-show e32dfa5e, not merged) gates on a new HearthriseSheet.anyOpen() plus a .ftue-root check, precisely because the KO sheet, .modal, the recipe book and the FTUE are not .hr-scrim. The pack's claim that it uses 'the same predicate' is false. With topOpen, the charm sheet stacks over the FTUE, the KO sheet and the recipe book. Fix: depend on that lane. Gate on `document.querySelector('.ftue-root') || HearthriseSheet.anyOpen(ownSheet)`, and treat a missing seam as busy.
- P1 | CONFIRMED | 'Shared with b559 fix lanes: none' is false. lane/ledger-rung-unknown-zero (unmerged) adds HearthriseCharms.countersKnown() to render/bestiary-charms.js. That is the only honest way to tell unknown from zero: killsOfClass returns 0 when unknown (bestiary-charms.js:129-134). The same lane also edits home-dashboard.js:1741 and the #fs-weak line in combat-screens.js ('charm not counted yet'). Without it, this lane must either read G._bestiaryCharms directly (breaking the single-owner rule at bestiary-charms.js:112) or add a twin countersKnown (a merge conflict). Fix: branch only from a set tip that holds both ledger-rung-unknown-zero and rankup-overlay-show.
- P1 | CONFIRMED | The watcher has no suite park. A 1 s watcher that opens a full-screen sheet with no auto-dismiss will fire mid-suite, because the in-page suite rewrites G._bestiaryCharms (hunt-raids-and-screens.js:2029-2267; vermin 25 = Studied). The teardown assertion (smoke-test.js:187) then blames the sheet on an unrelated test. That is an in-page red, a P1 under section 4, and the same shape as the renown COVER incident at b513. The pack does not name the file that needs the fix. Fix: expose __setPollEnabled and park it in src/features/smoke-test.js beside renown and daily (lines 166-173, restored at 228-230). While parked, the watcher must neither read nor write.
- P2 | CONFIRMED | The rank-1 effect line misdescribes the reward. The rank-1 reveal applies to every class: CHARM_RANKS has reveal:true at rank 1 (data/bestiary-charms.js:80), and all 11 bane classes have monsters with elementWeak (measured 5-15 per class). The Codex already says so (codex.js:110). The pack shows the reveal line only for hiddenElement classes, so 10 of 11 classes are told 'Your notes on them are in the Bestiary' instead of what they actually unlocked. Fix: derive the effect lines from the ladder rows (reveal newly true, drop > 1), not from hiddenElement. Use the wording 'what they are weak to'.
- P2 | CONFIRMED | Test-ID collision. LEDGER-1..3 are already used twice (the market ledger and the Ledger of Firsts), and the ledger-rung lane adds LEDGER-5 and LEDGER-6. A red LEDGER-2 could not be attributed. Fix: use HLEDGER-1..5.
- P3 | CONFIRMED | The Fight rail reads G.activeMonster only. The Fight screen shows currentFoeId() = activeMonster || previewId (combat-screens.js:676-680), so in preview the block is blank or stale. Separately, the heading 'Ledger' collides with the Fight's own loot Ledger (combat-screens.js:129, 1633). Fix: fall back to HearthriseCombatScreens.previewId, and head the block 'Charm & trophy'.
- P3 | CONFIRMED | Mechanics the pack leaves open. (1) Home's wire() has no 'bestiary' kind (home-dashboard.js wire), so the card's link and button need their own delegated data-hl-open handler to keep home-dashboard.js to one line. (2) The rail block must mount lazily, using the vigour-mount.js:29-41 pattern, or boot after combat-screens (main.js:527-529), not 'beside bestiary-charms'. (3) 'Open the Bestiary' must remove the moment sheet first, because both are .hr-scrim (the Bestiary uses z 9998, legacy.css:2189). (4) '1 kills' needs a singular form. (5) No hex literals in the card's strings: the Renown block's '#e6d6b4' pattern is counted by css-literal-ratchet's JS table.
- RESIDUAL (accepted) | The counts shown lag by one settle, because index.ts:1542-1547 reads the bestiary block before applying the settle's kills. The moment and the rows therefore arrive one settle late, never early. 'Watching or away' is true today: weaknessInfo feeds both the away span and the attended top-up (accrual.js:1554, 2297, 2446-2451). It becomes false if world-tick combat is armed without threading bestiary_kills; tick-combat.js:292-302 already names that as an ARM blocker.
- CLASS A PROVEN | The edge hash measured 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f at set/b559 c3ac50ec, in a scratch git-archive extract. It stayed unchanged after adding stub src/data/charm-lore.js and src/features/hunters-ledger.js files. A mutation where a src/core file imports charm-lore moved it to 3c60cb9b…, so the LORE-7 extension bites. No row, price, XP, item, intent or ranking is added. Every number comes from the server mirrors, and the device-local record gates nothing. All 15 lore lines pass LORE-4/5/6 against the real vocabulary (112-130 chars).
- ANCILLARY (existing, not this pack) | PLAUSIBLE, low severity: set-the-night.js:374 who() also reads the nonexistent G.name. Its 'different character's night' check at :394 therefore never fires, so a forecast written on one hero slot can show on another slot's morning card. Report it to that owner.
- PROCESS | This was a read-only review under stream mode. I created no branch, merged nothing and did not run lane-done (it replays PGlite). Every 'green' above is a node exit code I saw in the scratch extract. The origin/set/b559 tip is c3ac50ec, not 05fba6a3.

---

LANE lane/content-b4-3-hunters-ledger — the Hunter's Ledger (Class A: client-only; no migration, no edge deploy, no Security apply).

BASE
- Branch from origin/set/b559 at the SHA the Coordinator names.
- That SHA MUST already contain lane/ledger-rung-unknown-zero and lane/rankup-overlay-show. Precheck: `git grep -n countersKnown <SHA> -- src/render/bestiary-charms.js` and `git grep -n anyOpen <SHA> -- src/render/modal-sheet.js` must both hit. If either misses, STOP and report; never add a twin.
- Every new ESM import carries ?v=<BUILD.cache at that SHA> (558 at c3ac50ec). bump-version --check enforces it.

DO NOT EDIT
- src/core/**, any existing src/data/** file, supabase/**.
- render/bestiary-charms.js, bestiary-trophies.js, bestiary.js, modal-sheet.js.
- features/combat-screens.js, renown.js, collection-log.js, legacy.js, src/net/**.

RULES
- Zero G writes.
- Never read G.bestiary (the residue copy) or G._bestiaryCharms / G._bestiaryTrophies directly. Read only through window.HearthriseCharms and window.HearthriseTrophies.

A. NEW src/data/charm-lore.js — pure frozen data, short header.
- CHARM_CLASS_LORE is keyed by the core/bane.js taxonomy: mammal, vermin, plant, humanoid, human, undead, demon, dragon, elemental, construct, extra_dimensional (UNDERSCORE).
- The 11 lines are verbatim from the pack. The only change: the key extradimensional becomes extra_dimensional.
- CHARM_RANK_LORE is keyed studied / marked / hunter / banesworn, with the pack's 4 lines verbatim.
- Measured: all 15 lines pass LORE-4/5/6 (112-130 chars).

B. NEW src/features/hunters-ledger.js (ESM)

Imports:
- charm-lore
- ../data/bestiary-charms.js (CHARM_RANKS, CHARM_RANK_NAMES, MAX_CHARM_RANK)
- ../core/charms.js (charmRankAt, nextCharmAt, charmRowOfRank)
- ../data/bestiary.js (TROPHY_STAGES, TROPHY_STAGE_NAMES, nextTrophyAt)
- ../core/bane.js (MONSTER_CLASSES, classOfMonster)
All are read-only imports.

snapshot():
- Returns null unless HearthriseCharms.countersKnown().
- Otherwise returns {known:true, classes, monsters, readyId}:
  - classes = {cls: kills}, from HearthriseCharms.charmClasses().
  - monsters = {id: kills}, from HearthriseTrophies.killsOfMonster over window.MONSTERS.
  - readyId = the first monster in roster order where HearthriseTrophies.isClaimable(id, s) holds for the lowest unclaimed s ≤ stageOfMonster(id). Set it ONLY when HearthriseTrophies.claimsKnown(); otherwise null.

Pure exports (inputs are passed in; labels come from HearthriseCharms.classLabel and MONSTERS names; all text goes through esc()):

1. charmRow(classes)
- Returns null when the map is empty.
- Otherwise picks the non-max class with the best kills / next.at. Ties go to bane taxonomy order.
- Shape: {cls, title:'{Label} charm', sub:'{n} kill(s) to {RankName}', pct}. Use 'kill' when n is 1. Format n with toLocaleString.
- Only when EVERY listed class is at the top rank: sub '{RankName} — the last charm there is', pct 100.

2. trophyRow(monsters, readyId)
- If readyId is set: {title:'{Monster} trophy ready', sub:'{StageName} — claim it in the Bestiary', ready:true}.
- Otherwise: the best kills / next.at monster, as {title:'{Monster} trophy', sub:'{n} kill(s) to {StageName}', pct}.
- Returns null when no monster has kills or every monster is at the top stage.

3. cardHtml(snap)
- Unknown (snap null): the card with both row values rendered as <span class="bal-pending" role="status" title="Waiting for the server">—</span>. Never render 0.
- Known and no class kills: ''.
- Otherwise:
  - Head: <h3>Hunter's ledger</h3> plus <a data-hl-open="bestiary">Bestiary →</a>.
  - A ready row gets <button type="button" class="hd-cta ghost" data-hl-open="bestiary">Claim in the Bestiary</button>.
  - Progress bars are styled with var(--…) only. No hex literal in the JS strings.

4. railHtml(foeId, snap)
- Line 1: '{Label} charm · {n} to {RankName}'. At the top rank: '{Label} charm · {RankName}, the last'.
- Line 2: '{Monster} trophy · {n} to {StageName}'.
- Unknown: each line shows the pending mark.

5. rankUpsBetween(prev, next)
- Inputs are {cls: rank} maps.
- Returns [] when prev is null.
- Otherwise returns [{cls, from, rank}] for each class where next > prev, in bane order. A decrease is never returned.

6. momentHtml(ups, classes)
- One block per rank-up:
  - Title '{Label} · {RankName}'.
  - <i>CHARM_RANK_LORE[id]</i>, then CHARM_CLASS_LORE[cls].
  - Effect lines derived from the ladder rows, never from rank numbers or hiddenElement:
    - If a row with reveal lies in (from, rank]: 'The Bestiary now shows what they are weak to.' When the rank's own drop is 1, add ' The next charm makes them drop their loot a little more often.'
    - If the rank's row.drop > 1: '{Label} foes now drop their loot a little more often, watching or away.'
  - Next line: 'Next: {NextRank} at {at} {Label} kills — you have {kills}.' At the top rank: 'This is the last charm there is.'
- The sheet head's eyebrow reads 'A charm is earned'.

7. tick(deps) — the watcher. deps = {parked, known, uid, slot, ranks, store, busy, open}.
- If parked: return 'parked'. No reads, no writes.
- If !known or !uid: return 'unknown'.
- key = uid + ':' + slot. rec = store.getJSON('hearthrise:charm-seen', {}).
- No rec[key]: set it to ranks, write, return 'seeded'. Nothing opens on first sight.
- No rank-ups: overwrite on any change (a decrease or a wipe), return 'quiet'.
- busy(): return 'waiting' and leave the record untouched.
- Otherwise: open(ups), set rec[key] to ranks, write, return 'opened'.
- Keep at most 10 keys in rec (drop the oldest).

Live deps:
- parked = the module flag.
- known = HearthriseCharms.countersKnown().
- ranks = the rank > 0 rows of charmClasses().
- uid = HearthriseAuth.currentUserId(); slot = HearthriseProfile.activeSlot().
- busy = () => !!document.querySelector('.ftue-root') || HearthriseSheet.anyOpen(document.getElementById('hr-charm-moment')). A throw counts as busy.
- open = builds the sheet.
- setInterval(tick, 1000).

Sheet #hr-charm-moment:
- Structure: div.hr-scrim with role=dialog, aria-modal=true and aria-labelledby, containing .hr-sheet > .hr-sheet-head / .hr-sheet-body / .hr-sheet-foot.
- 'Open the Bestiary' is the primary button. It has NO data-hr-dismiss. It removes the sheet, then calls window.openBestiary().
- 'Close' has data-hr-dismiss and removes the sheet.
- No backdrop close and no timer. Focus goes to the primary button on open.
- Several rank-ups give one sheet with one block each.

Fight rail:
- Mount lazily, as src/features/vigour-mount.js:29-41 does: section.fsm-block#fsm-ledger, inserted before the block that holds #fsm-drops, inside #fs-manage.
- Head: 'Charm & trophy'. Not 'Ledger': the Fight already has a loot Ledger (combat-screens.js:129).
- Foe = G.activeMonster || HearthriseCombatScreens.previewId (combat-screens.js:676-680).
- Diffed innerHTML write on the same 1 s tick. Hidden when there is no foe.

setupHuntersLedger():
- Publishes window.HearthriseHuntersLedger = {card: () => cardHtml(snapshot()), charmRow, trophyRow, cardHtml, railHtml, rankUpsBetween, momentHtml, tick, __setPollEnabled(on) → returns the previous value}.
- Installs ONE delegated document click listener for [data-hl-open="bestiary"] that calls window.openBestiary().
- Starts the interval.

C. NEW src/styles/hunters-ledger.css
- Tokens only. No !important.
- No media query, unless it is the canonical one that breakpoint-guard allows.
- Every selector must be used (dead-css).
- Buttons at least var(--tap).
- The sheet's z-index is 9998, matching .ach-overlay (legacy.css:2189).
- The backdrop uses color-mix over tokens, never an rgba literal.

EDITS
1. src/features/home-dashboard.js — one block, after the Renown try/catch (line 1659) and before 'The realm' (line 1662):
   try { var HL = window.HearthriseHuntersLedger; if (HL && typeof HL.card === 'function') html += HL.card(G); } catch (e) { /* display only */ }
   Do not touch wire().
2. src/main.js — the import, plus boot('hunters-ledger', setupHuntersLedger) AFTER boot('vigour-mount') (main.js:529).
3. index.html — <link rel="stylesheet" href="src/styles/hunters-ledger.css?v=NNN"> after primers.css (line 198).
4. src/features/smoke-test.js — park the watcher beside renown and daily (lines 166-173), restore it in the finally (lines 228-230):
   const _HL = window.HearthriseHuntersLedger; let _hlWasOn = true; try { if (_HL && typeof _HL.__setPollEnabled === 'function') _hlWasOn = _HL.__setPollEnabled(false); } catch (e) {}
5. tests/lore-notes.mjs
   - Refactor into a SETS table: {name, map, wantKeys, band:[100,140]}. Packs 4 and 5 each add one row; merge order 3 → 4 → 5.
   - LORE-8: CHARM_CLASS_LORE keys set-equal to [...MONSTER_CLASSES] from src/core/bane.js. That export is an array. Not Object.keys, and not data/monster-classes.js.
   - LORE-9: CHARM_RANK_LORE keys = CHARM_RANKS ids.
   - Both maps join the LORE-4/5/6 checks, and their text joins the duplicate-line set.
   - LORE-7 also refuses any packed origin or content matching /charm-lore/.
   - --selftest keeps the existing 7 plants and adds 3:
     - respell extra_dimensional as extradimensional → LORE-8
     - add an orphan rank 'legend' → LORE-9
     - pack src/data/charm-lore.js → LORE-7
     It must print '10/10 plants caught'.
6. src/features/smoke/monsters-inventory-and-brand.js — HLEDGER-1..5. Each ≤ 20 code lines, zero G.* seeds, all inputs passed in.
   - HLEDGER-1: charmRow({undead:88}).sub === '12 kills to Marked'. charmRow({undead:2000}).sub contains 'the last charm there is'. charmRow({undead:120, vermin:24}) returns cls 'vermin' and sub '1 kill to Studied'.
   - HLEDGER-2: rankUpsBetween(null, {undead:2}) is []. ({undead:1}, {undead:2}) deep-equals [{cls:'undead', from:1, rank:2}]. ({undead:3}, {undead:1}) is []. ({}, {extra_dimensional:1})[0].cls === 'extra_dimensional'.
   - HLEDGER-3: momentHtml of the undead 1→2 rank-up contains CHARM_CLASS_LORE.undead and 'a little more often, watching or away'. momentHtml of extra_dimensional 0→1 contains CHARM_CLASS_LORE.extra_dimensional (non-empty) and 'what they are weak to'. Neither contains 'undefined'.
   - HLEDGER-4: cardHtml(null) contains 'bal-pending' and fails /\b0 kills?\b/. cardHtml({known:true, classes:{}, monsters:{}, readyId:null}) === ''.
   - HLEDGER-5: tick with a fake store and an open spy.
     - No record → 'seeded', open not called.
     - A rank-up while busy → 'waiting', record unchanged.
     - Not busy → 'opened', spy called once, record updated.
     - Parked → 'parked', setJSON not called.
     - Same uid, another slot → 'seeded', open not called. This is the slot-switch false-moment arm.

RED-BEFORE / GREEN-AFTER
- Commit the lore-notes refactor with the data file still keyed `extradimensional`. `node tests/lore-notes.mjs` must exit 1 naming LORE-8; quote that line in the report. Respell, and it exits 0.
- --selftest: '10/10 plants caught', exit 0.
- HLEDGER-5's slot arm is red against a watcher keyed on a constant 'who' (the pack's G.name design). Record that red in the commit message.
- The in-page suite is NOT run locally (stream mode). It runs in GitHub's smoke job on `next`.

GATES — paste each real exit code
- node tests/lore-notes.mjs, and --selftest
- node tools/pack-edge.mjs hr-accrue --hash — must print exactly 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f
- node tools/pack-edge.mjs hr-accrue --check
- node tests/modal-primitive-census.mjs
- node tests/dead-css.mjs
- node tests/css-literal-ratchet.mjs
- node tests/window-globals-exist.mjs
- Merge the named set tip into the branch yourself, then run node tools/lane-done.mjs. Its last line must be 'lane-done: all green.'

PROOF PNGs
- At 1280x800 and 922x423, pushed only to qa/content-b4-3-hunters-ledger, and only when the Coordinator says the machine is free.
- Screens:
  - Home status rail, pending and known.
  - Fight rail, in preview and live.
  - The moment sheet with two blocks (extra_dimensional rank 1, undead rank 2).

NEVER
- Deploy, apply, or git stash.
- Commit docs/, reports, visual-qa/findings.json.
- Touch tests/live-hash-drift.baseline.json.

RESIDUALS TO RESTATE IN THE REPORT
- Counts lag one settle (index.ts:1542-1547), so the moment is late, never early.
- 'Watching or away' holds today (accrual.js:1554, 2297, 2446-2451). It becomes false if world-tick combat is armed without bestiary_kills (tick-combat.js:292-302 names that as an ARM blocker).
