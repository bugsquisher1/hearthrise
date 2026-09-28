# Visual pass 8 — set/b560 @ f93a0e0 (Fight · Dungeons · Quartermaster)

Rendered: `f93a0e0` (merge: lane/vg7-fight-logrow-in-card; history holds merge: lane/vg7-scrip-pending-dash f3f214e). Headless Chromium 1194, `__HR_TEST_HARNESS__`, `bootPage()/serve()` from tests/visual-qa.mjs, `--offline-fonts`; `-cinzel` = Google Fonts woff2 served locally + injected (Cinzel 3 faces, Alegreya Sans 3–4, Alegreya Sans SC 1 loaded); `-fallback` = no webfonts. #notifs empty, FTUE dismissed, no runtime errors. Rects are [x,y,w,h] CSS px.

## Fight (stated Vigour 626 min, stocked fight, Auto-eat Cooked Shrimp)
| check | fallback 1280x800 | cinzel 1280x800 | fallback 922x423 | cinzel 922x423 |
|---|---|---|---|---|
| card rect | [422,194,848,596] PASS | same PASS | [244,106,672,299] PASS | same PASS |
| .fs-logrow | [423,679,846,96] in card + viewport PASS | same PASS | hidden; "Log" door [851,325,54,44] visible PASS | hidden; door [860,319,45,44] PASS |
| card scrollHeight/clientHeight | 594/594 PASS | 594/594 PASS | 297/297 PASS | 297/297 PASS |
| action bar: no scroller, 10 buttons all in card | PASS | PASS | PASS | PASS |
| #fs-metrics text | "measuring… · survival still measuring" no dash PASS | same PASS | same PASS | same PASS |
| food row / metrics in card | [441,571,471,50] / [441,625,810,22] PASS | [441,571,395,50] / [441,625,810,22] PASS | [255,319,389,56] / [255,377,650,18] PASS | [255,319,322,44] / [255,364,650,18] PASS |
| stance gap ≥4px | 4.0 PASS | 4.0 PASS | 4.0 PASS | 4.0 PASS |
| portraits | 99x99 at y209, stage 482px — not cramped PASS | same PASS | 44x44 (unchanged from pass 7) PASS | same PASS |

## Dungeons / Quartermaster (all four renders identical in values)
| check | result |
|---|---|
| unstated strip innerText | "— Dungeon Scrip Quartermaster", `.bal-pending` present PASS (1280 [180,134,1090,49]; 922 [76,72,834,62]) |
| unstated Crypt entry | "Entry: 1× Bone Key (have —)", `.bal-pending` PASS (below the fold at 922x423; measured, not in PNG) |
| unstated #qm-scrip-line | "You have — Dungeon Scrip — earned by clearing dungeons." `.bal-pending` PASS |
| unstated Buy | 19/19 disabled PASS |
| sheet padding | sheet `padding: 18px`, body 0; h3 / line / rows / group label left = 20px from sheet border, Buy right = 20px PASS (≥12) at both sizes |
| sheet scroll + Close | #quartermaster-body scrolls (1280: 948/655; 922: 1202/302); sheet in viewport; Close 1280 [864,36,30,30], 922 [685,27,30,30], hit-test reaches it PASS |
| applyRecord {dungeon_scrip:37} | written ["dungeonScrip"], G.dungeonScrip=37 PASS |
| stated strip | "37 Dungeon Scrip Quartermaster", no `.bal-pending` PASS |
| stated #qm-scrip-line | "You have 37 Dungeon Scrip — earned by clearing dungeons." no `.bal-pending` PASS |
| stated Buy | Bone Key 18 EN, Goblin Seal 24 EN, Arcane Tome 30 EN; Obsidian Sigil 45 disabled, Void 60 / Dragonsbane 85 disabled; 16/19 disabled PASS |
| arm restored | `__setDungeonSettleArm(null)` after each run |

## Global read of the 20 PNGs
1. MINOR (new with the log row) — fight-*-1280x800: the fixed bug button `#hr-bug-btn` [1233,709,35,29] and `.chat-dock` [1219,751,45,33] sit INSIDE `.fs-logrow` [423,679,846,96] and over the right 8–22px of `.combat-log` [451,691,790,62]. Today's log lines are short so no text is covered; a long line would run under them.
2. MINOR (fallback fonts only) — dungeons-*-fallback-1280x800: the Crypt entry wraps "(have" / "—)" so the pending dash is orphaned at the start of its own line (~[195,631,16,21] in the PNG). Cinzel keeps "(have —)" together.
- Observation, not a defect: unstated, the QM line reads "You have — Dungeon Scrip — earned…": the pending dash and the punctuation em-dash look identical and read as a parenthetical. Matches the brief's wording; game-designer's call.
- Not defects: the Loadout rail is cut at the viewport bottom at both sizes but `#fs-manage` scrolls (683/594); the realm-slow pill, "—" in quest progress, "Signed out"/"Reconnecting…" are the offline sandbox.

Verdict: every checked item is GREEN; there are 2 minor, non-blocking layout findings (1: FABs over the log row at 1280x800; 2: the dash wraps onto its own line with fallback fonts).
