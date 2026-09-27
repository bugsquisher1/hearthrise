# 5. The Homestead Almanac: a line for every room rung, plot tiers with names, and crops that say what they are for

VERDICT: GO-WITH-CHANGES | class A: true | est 1.5 h

PLAYER VALUE: The homestead-to-castle climb is the week-long spine, but its 40 room rungs (Hearthstone → The Great Hearth, Field Forge → The Deep Forge…) are a name plus a percentage. The 5 farm plot tiers are only 'Farm Plot Lv N'. The crop guide never says what a crop is for, which leaves 'Why would I grow this?' unanswered.

This pack gives each rung a line of lore so an upgrade reads as a new room rather than a new number. It names the plot tiers after what they unlock. The crop guide shows the Almanac line plus 'Used in: …', both from data that already exists.

PROBLEMS TO FIX IN THIS LANE (each is a condition):
- 1. MED, CONFIRMED (CLAUDE.md s6). The plot tier name and lore would come from HearthriseFarm.getPlotLevel(). That function reads the gate and falls back to G.plotLevels, which defaults to 1, whenever the server mirror is missing (src/features/farm-progression.js:82-99). The mirror G._serverPlotLevel is written only from an envelope carrying state.plot_level (src/net/accrue.js:3690-3701) or from an upgrade reply (src/net/farm-sync.js:293). Trigger: any render before that envelope arrives (boot, reconnect, a lean settle). A tier-5 farmer would read 'The Turnip Patch · Plot Lv 1/5', which is a named fact standing in for an unknown value. So the pack's line 'the level is the existing server plot_level' is false for this read. Fix: read window.HearthriseFarm.getServerPlotLevel(). When it is null, render the pending glyph (HearthriseBalance.UNKNOWN_TEXT) with no name and no line. The effect stays on the player's own screen. No current test would catch this, so the fix needs FARMLORE-2.
- 2. MED, CONFIRMED (wrong file). The House -> Plot card lives at src/legacy.js:8574-8628 (title at line 8619), not in farm-progression.js, which has no render code. The pack's file list leaves out legacy.js. Fix: swap exactly line 8619 for one call to a builder in farm-progression.js. The farm header must use the same builder, so there is one builder and no twin. Net change in legacy.js is 0 lines with no comment, so MONO-1 still passes.
- 3. LOW, CONFIRMED. 'Next: {NextName} — adds {crops}' repeats what legacy.js:8620 already says ('Next tier unlocks: …'). It would also need a second legacy edit that reads a different level source (the getPlotLevel() fallback at 8584) on the same card. Drop it.
- 4. LOW, CONFIRMED. At set/b559 85da250d, tests/lore-notes.mjs has no SETS structure, so the pack's tests depend on packs 3 and 4, which have not landed. Extend the guard's current check()/loadReal()/selftest shape instead. If packs 3/4 land first, the lane merges the set into itself and adapts. Extending the existing guard keeps its smoke.yml step unchanged, so ci-shape does not move.
- 5. LOW, CONFIRMED. src/main.js needs a new import at line 31 as well as the line 116 edit. It must use ?v=558, the BUILD.cache at 85da250d.
- 6. LOW, CONFIRMED. Nothing ties the copy to the engine. All 5 PLOT_TIER_LORE lines name exactly the crops PLOT_TIERS adds at that tier (checked, 0 misses, 0 early mentions), but no guard fails if PLOT_TIERS changes. Add LORE-13 for that (the codex-claims principle). Add LORE-14 as a census so that only the one builder reads HearthriseLore.plot and the old header literals are gone.
- 7. LOW, CONFIRMED. New strings land in raw-HTML sinks: the ladder `effect` is injected raw (homestead.js:1080-1086) and the farm templates are raw. Pass every new string through esc()/escapeHtml. Also, the FARMLORE-1 check as proposed would compare raw text to escaped HTML. Carrot's Almanac line contains an apostrophe that becomes &#39;, so the test must compare against the escaped line.
- 8. LOW, CONFIRMED. The new stylesheet and index.html link are not needed. The hh-rung-* styles already live in src/styles/homestead-rooms.css:285-301. Add .hh-rung-lore and .hh-almanac-line there (tokens only) and drop the index.html edit, which removes a shared-file conflict with the other b4 packs. Do not reuse .hh-rung-resv: that style means 'specced, not shipped'.
- 9. INFO. set/b559 moved from 05fba6a3 to c3ac50ec to 85da250d during this review; every line reference here is at 85da250d. There, 'node tools/pack-edge.mjs hr-accrue --hash' printed 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f and exited 0. The vendored graph contains no file this pack edits. src/core/farm.js is not in the graph, and src/data/perks.js is, but it is only read. Checks run against the live vocabulary (29 words): all 45 lines pass LORE-4/5/6 and are unique against MONSTER_NOTES, ITEM_DESC and the existing lore. The 5 plot names collide with nothing in src/. Lanes still in flight: ledger-rung-unknown-zero edits legacy.js near lines 11098, 11443, 13912, 18387, 18792 and 18944 (no overlap with 8619), plus balance.js, companions-claims-and-renown.js and farm-and-profile.js. rankup-overlay-show touches renown.js, daily-reward.js, modal-sheet.js and two smoke files. Neither touches this pack's files. The companion and timberline lanes are already merged.
- 10. RESIDUAL, pre-existing, not introduced by this pack. The rest of the House plot card (next-tier crops, price and upgrade check, from legacy.js:8584) and the crop-guide lock badges still use the getPlotLevel() fallback before the first envelope. Separately, the room sheet shows an unknown rooms map as 'You have not built this room yet', because roomRung fails closed to 0 (src/net/rooms-record.js:99-106, homestead.js:1057). Both are display-only and affect only the player's own screen, since the server RPCs price and gate from their own rows. Worth a follow-up s6 lane.

---

LANE lane/content-b4-5-homestead-almanac: CLASS A, client-only. No migration, no edge deploy, no Security review.

Branch from origin/set/b559 at the SHA the Coordinator names. It was reviewed at 85da250d. Use the BUILD.cache in src/build-info.js at that SHA on every new ESM import (it is 558 at 85da250d). Never put ?v= in tests/**. Do not use git stash. Commit messages are at most 8 lines.

GOAL
- Each of the 40 room rungs gets a lore line.
- The 5 farm plot tiers get names and lines.
- Crop guide rows show the Almanac line and 'Used in'.
- Every tier name reads the SERVER plot tier and shows the pending glyph while that tier is unknown.

A. NEW src/data/homestead-lore.js (no imports; header comment says: client-only, never edge-imported, guarded by tests/lore-notes.mjs)
Exports:
- ROOM_RUNG_LORE: Object.freeze, keys '<room>.<n>'
- PLOT_TIER_NAMES: Object.freeze
- PLOT_TIER_LORE: Object.freeze
- roomRungLore(id, n): returns the string, or '' if the key is missing (hasOwnProperty check)
- plotTier(n): returns {name, line}, or null if n is outside 1..5

Room lines. Copy exactly; U+2019 apostrophes only; no trailing full stop.

kitchen:
- kitchen.1: 'A flat stone by the fire, a blackened pot and a wooden spoon, and already the camp smells more like a home than a camp'
- kitchen.2: 'Iron that holds its heat through the night means porridge is warm at dawn, and nobody has to sit up minding the flames'
- kitchen.3: 'A proper range with an oven and a hob, and a cook who can finally turn away from the pan without smelling smoke a moment later'
- kitchen.4: 'Two ranges back to back, one for the day’s bread and one for whatever the hunters drag home, and neither of them ever cold'
- kitchen.5: 'A hearth wide enough to roast an ox and warm a hall, and the whole valley knows that nobody leaves this kitchen hungry'

forge:
- forge.1: 'A clay pit, a hand bellows and an anvil on a stump, which is how every smith in the valley started out, whatever they claim'
- forge.2: 'Stone walls hold the heat that clay let go, and for the first time the iron comes out of the fire the colour you wanted'
- forge.3: 'Two bellows worked in turn keep the coals white, and the apprentice who works them has arms like a dock hand by summer'
- forge.4: 'A bellows so large it is worked by a wheel, and its roar can be heard from the road long before the forge comes into sight'
- forge.5: 'Dug down into the rock where the earth is already warm, it burns hot enough for metals the old smiths only ever read about'

library:
- library.1: 'A single plank on two brackets, holding a borrowed almanac and a ledger, and already the evenings pass more usefully'
- library.2: 'A chair by the window, a good lamp and a door that shuts, and the first evening spent there is worth a week of guessing'
- library.3: 'Real shelves from the floor to the beams, full of books bought, borrowed and not quite returned, and a ladder nobody trusts'
- library.4: 'Scribes copy out everything the house has learned, so that no lesson paid for in sweat ever has to be paid for twice'
- library.5: 'A hall of books with a reading table long enough for a council, and scholars from three valleys asking to be let in'

garden:
- garden.1: 'A few rows by the back door for herbs and greens, close enough to reach from the kitchen with a wet hand and a knife'
- garden.2: 'A wall keeps out the wind, the deer and the neighbour’s goats, and the rows inside stand straighter for it every season'
- garden.3: 'Raised beds of good black soil, turned and fed each autumn, where even a careless planting seems to come up well'
- garden.4: 'Panes of real glass catch the sun and keep off the frost, so the tender plants that never took in the valley take here'
- garden.5: 'Trees planted by you and meant for your grandchildren, and the blossom in spring is the finest thing the homestead owns'

trophy:
- trophy.1: 'A single wall with a wolf pelt, a pair of antlers and one nail left bare for whatever you bring home next'
- trophy.2: 'A proper hall for proper trophies, where guests stop in the doorway and ask, a little nervously, who did all of this'
- trophy.3: 'Heads mounted in rows, each with a plaque and a date, and one space left empty at the end for the beast that got away'
- trophy.4: 'Banners taken from warbands and war camps hang from the beams, and every one of them has a story you tell differently'
- trophy.5: 'A gallery so long the far end is lost in shadow, lined with the proof of every hunt that ever mattered to the valley'

cellar:
- cellar.1: 'A hole under the floor, cool and dark, where turnips last through the winter and the cider does something interesting'
- cellar.2: 'Stone walls and a proper stair, shelves of jars and crocks, and a cold that keeps a pie as good on the third day as the first'
- cellar.3: 'An arched vault with a locked door, for the bottles too good to open and the preserves too precious to share'
- cellar.4: 'Casks racked to the ceiling, each one chalked with a date and a name, and a tasting cup hung on a nail by the door'
- cellar.5: 'Cut deep into the hill where the cold never changes, it keeps whatever is stored there exactly as it was the day it went down'

workshop:
- workshop.1: 'A bench, a vice and a rack of borrowed tools, and the first thing anyone ever makes on it is always a better bench'
- workshop.2: 'A joiner’s bench with dogs and a tail vice, where a plank is cut true on the first try and the offcuts become pegs'
- workshop.3: 'A pit with one sawyer above and one below, and the logs that came in as trees go out again as boards by the cartload'
- workshop.4: 'A treadle lathe turns bowls, handles and spindles, and the shavings pile up so fast they have to be swept twice a day'
- workshop.5: 'A shop the guild would envy, with a tool for every task and a master’s mark burned into every piece that leaves it'

shrine:
- shrine.1: 'A carved post by the path with a ledge for offerings, where travellers stop, bow their heads and walk on a little lighter'
- shrine.2: 'An altar of dressed stone, worn smooth where hands have rested, and a bowl of water that never seems to go stale'
- shrine.3: 'A small chapel with a bell, and on quiet evenings the whole homestead stops what it is doing when the bell is rung'
- shrine.4: 'A locked case of old bones and older relics, and a keeper who knows the story of every one and tells it at length'
- shrine.5: 'Bones of the valley’s honoured dead laid in patterns on the walls, and a silence so deep it can be heard from outside'

PLOT_TIER_NAMES:
- 1: 'The Turnip Patch'
- 2: 'The Furrowed Field'
- 3: 'The Market Rows'
- 4: 'The Harvest Field'
- 5: 'The Moonlit Acre'

PLOT_TIER_LORE:
- 1: 'A patch of dug earth behind the camp, fit for turnips and not much else, but it is yours and every farm starts somewhere'
- 2: 'Furrows ploughed straight enough for carrots and wheat, and a scarecrow that fools the crows about half of the time'
- 3: 'Rows long enough to sell from, with potatoes swelling below the ground and tomatoes climbing their canes above it'
- 4: 'A field that fills a cart each harvest, with pumpkins in the low ground and goldenroot wherever the sun lies longest'
- 5: 'The farthest acre, where emberfruit ripens warm to the touch and moonbloom opens only after the lamps are lit'

The reviewer verified all 45 lines against LORE-4/5/6 at 85da250d.

B. src/main.js
- Next to line 31, add: import { roomRungLore, plotTier } from './data/homestead-lore.js?v=558';
- Line 116 becomes: window.HearthriseLore = Object.freeze({ companion: companionLore, rank: rankLore, trophy: trophyLore, room: roomRungLore, plot: plotTier });

C. src/features/homestead.js (add zero comment lines: CR-1 headroom is 0; code 853 against a base of 860)
- roomDescriptor (line 689):
  - each ladder row gains line: L.room(id, level), where L = window.HearthriseLore; use '' when L is absent.
  - the descriptor gains currentLine: cur ? L.room(id, lv) : null.
- modalDescriptor (line 1048):
  - After the 'Yours' rows section (line 1061), push { kind: 'note', html: '<span class="hh-rung-lore">' + esc(d.currentLine) + '</span>' } when d.currentLine is set.
  - In the ladder effect (lines 1081-1086), append '<span class="hh-rung-lore">' + esc(row.line) + '</span>' when row.line is set.
- Do not touch ROOMS, ROOM_META or KEY_LABEL.

D. src/features/farm-progression.js (the ONE tier builder)
- Add a local esc.
- Add tierHeadHtml():
  - lv = window.HearthriseFarm.getServerPlotLevel(). Read it through the published object so a test can stub it. NEVER use getPlotLevel().
  - lv null -> '<b>Farm Plot · Lv ' + ((window.HearthriseBalance && window.HearthriseBalance.UNKNOWN_TEXT) || '—') + '/' + MAX + '</b>'
  - lv known but HearthriseLore.plot missing -> '<b>Farm Plot · Lv N/MAX</b>'
  - otherwise -> '<b>' + esc(name) + ' · Plot Lv N/MAX</b>'
- Add tierLoreHtml(): '<span class="hh-almanac-line">' + esc(line) + '</span>' when lv is known and the line exists, else ''.
- Publish both on window.HearthriseFarm.
- Do not touch the gate, the price or PLOT_TIERS.

E. src/screens/farm.js
- Line 470 becomes: ${window.HearthriseFarm ? window.HearthriseFarm.tierHeadHtml() : ''}
- Delete lines 454-455 (plotLv and plotMax are now unused).
- Pull the crop-guide row (lines 519-528) out into function cropGuideRowHtml(id).
  - Keep the existing text and badge.
  - Add '<span class="hh-almanac-line">' + escapeHtml(window.itemDesc(c.prod)) + '</span>' when itemDesc is a function and returns non-empty.
  - Add '<span class="tiny muted">Used in: ' + escapeHtml(u) + '</span>' only when u = window.itemUsedInLine(c.prod) is non-empty.
  - Text only: no itemArt. tests/icon-boot-order.mjs counts img.hr-item-art in #crops-guide.
- Publish window.cropGuideRowHtml in the PUBLISHED block at the end of the file.

F. src/legacy.js: EXACTLY one line changes.
- Line 8619 '<b>Farm Plot · Lv ${lv}/${max}</b>' becomes '${window.HearthriseFarm.tierHeadHtml()}${window.HearthriseFarm.tierLoreHtml()}'.
- Net 0 lines, no comment added.
- Line 8620 ('Next tier unlocks') stays as it is. Do NOT add a 'Next: {name}' line.

G. src/styles/homestead-rooms.css (tokens only; no new stylesheet; no index.html edit)
- .hh-rung-lore: display block, italic, color var(--ink-3), size and line-height of .hh-rung-eff
- .hh-almanac-line: display block, italic, color var(--ink-3)
- Do NOT reuse .hh-rung-resv; that style means 'specced, not shipped'.

H. tests/lore-notes.mjs (extend the CURRENT shape; its smoke.yml step is unchanged, so ci-shape does not move)
- loadReal: import homestead-lore inside a try/catch that falls back to empty maps, so a missing file reports as red rather than a harness error. Import read-only:
  - ROOM_PERKS from src/data/perks.js
  - PLOT_TIERS and MAX_PLOT_LEVEL from src/core/farm.js
  - CROPS from src/data/gathering.js
- Parse the legacy ROOMS rung names with nm:\s*(['"])(.*?)\1, between 'const ROOMS={' and 'window.ROOMS = ROOMS' (40 names).
- Parse the homestead TIERS names and the ROOM_META flavour lines from their source text.
- New checks:
  - LORE-11: ROOM_RUNG_LORE keys equal room.n for every ROOM_PERKS room and rung.
  - LORE-12: PLOT_TIER_NAMES and PLOT_TIER_LORE keys equal 1..MAX_PLOT_LEVEL. Names are 3-32 characters, match /^[A-Za-z '’-]+$/, are unique, and equal no rung nm or TIERS name (case-insensitive).
  - LORE-13: PLOT_TIER_LORE[n] contains the lowercase CROPS name of every crop first unlocked at tier n, and of no crop first unlocked above n.
  - LORE-14: HearthriseLore.plot is read only in src/features/farm-progression.js. tierHeadHtml() is called in src/screens/farm.js and src/legacy.js. 'Farm Plot <b>Lv' is absent from farm.js and '<b>Farm Plot · Lv' is absent from legacy.js. The body of tierHeadHtml names getServerPlotLevel and not getPlotLevel.
- The 45 new lines join LORE-4/5/6. The LORE-5 foreign set also gets the ROOM_META flavour lines.
- The LORE-7 regex becomes /lore-notes|homestead-lore/.
- --selftest gains 5 arms, one each:
  - drop a rung key (LORE-11)
  - name colliding with 'Hearthstone' (LORE-12)
  - tier-2 line missing 'wheat' (LORE-13)
  - a helper body using getPlotLevel (LORE-14)
  - pack src/data/homestead-lore.js (LORE-7)
- Selftest output changes to '12/12 plants caught'.
- RED-before: land the guard rows first; run node tests/lore-notes.mjs; it must exit 1 with LORE-11/12/13/14. GREEN-after: it exits 0.

I. src/features/smoke/rooms-items-and-economy.js
- Zero comment lines, zero G.* writes, at most 20 code lines each.
- A missing seam is an assert, not a skip, so each test can be RED before the change.
- HOMELORE-1: every window.ROOMS rung satisfies ladder[i].line === HearthriseLore.room(id, i+1), and it is non-empty. Stub window.HearthriseRooms.roomRung (as LORE-3b does) to return kitchen 2: currentLine equals room('kitchen', 2), and the modalDescriptor html contains the lines for rungs 2 and 5. Stub it to 0: currentLine === null. Restore in finally.
- FARMLORE-1: cropGuideRowHtml('carrot') contains escapeHtml(itemDesc('carrot')); the apostrophe proves the escaping. 'Used in:' appears exactly when itemUsedInLine is non-empty, and the row contains its escaped text. HearthriseLore.plot(1).name === 'The Turnip Patch' and plot(6) === null.
- FARMLORE-2 (the s6 test):
  - Stub HearthriseFarm.getServerPlotLevel to return null. tierHeadHtml() contains the UNKNOWN_TEXT glyph and none of the 5 names, and tierLoreHtml() === ''.
  - After renderFarm(), the innerHTML of '#farm-panel .farm-status' includes the tierHeadHtml() output.
  - Stub it to 3: /The Market Rows · Plot Lv 3\/5/ matches, and the lore html contains plot(3).line.
  - Restore in finally, then call renderFarm().
  - Mutation proof: the helper reading getPlotLevel() must turn the null arm RED.

GATES (each 'green' is an exit code you saw)
- node tools/pack-edge.mjs hr-accrue --hash must print 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f
- node tests/lore-notes.mjs, then node tests/lore-notes.mjs --selftest
- node tests/item-flavour-coverage.mjs
- node tests/window-globals-exist.mjs
- node tests/dead-css.mjs
- node tests/css-literal-ratchet.mjs
- node tests/comment-ratio-ratchet.mjs
- node tests/monolith-ratchet.mjs
- bash ./bump-version.sh --check
- node tools/lane-done.mjs: paste its last line
- Merge the named set SHA into the branch yourself and resolve any conflicts there. If packs 3/4 have restructured lore-notes.mjs, adapt to their structure.
- Do not run the in-page suite, visual-qa or run-ci-local on this PC while stream mode is on. The Coordinator's set run proves the in-page tests.

PROOF PNGs
- Farming header with the crop guide; House -> Plot; the Kitchen sheet with an owned rung.
- At 1280x800 and 922x423.
- Only when the Coordinator says the machine is free.
- Push them only to qa/content-b4-5, never to the lane branch.

NEVER
- deploy, apply a migration or touch production
- edit src/core/**, src/data/perks.js, legacy ROOMS, PLOT_TIERS or supabase/**
- commit docs/reports/visual-qa/findings.json
- touch tests/live-hash-drift.baseline.json
- edit src/features/smoke/companions-claims-and-renown.js or farm-and-profile.js (both have lanes in flight)

RESIDUAL (not this lane; follow-up s6 lane)
- legacy.js:8584 onward (next-tier crops, price, upgrade check) and the crop-guide lock badges still use the getPlotLevel() fallback before the first envelope.
- The room sheet shows an unknown rooms map as 'not built' (rooms-record.js:99-106, homestead.js:1057).
