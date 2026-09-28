# Visual pass 9: set/b561 @ 3bcdb78

Rendered SHA: `3bcdb78` (merge: lane/b561-visual-p3s-a). It contains `759dbb7` (merge: lane/b561-words-p3s) and `e3d06e7` (merge: lane/b561-hr-chrome-tooling).

Sandbox: `HR_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Supabase is unreachable (egress 403).

Font sets:
- **fallback**: the Google Fonts CDN is aborted (`--offline-fonts` route).
- **cinzel**: the real Cinzel, Alegreya Sans and Alegreya Sans SC woff2 files (fetched with a browser User-Agent into `.scratch/gf/`), injected with `addStyleTag`. They were confirmed loaded before any shot.

Harness: `.scratch/vp9.mjs` and `.scratch/vp9b.mjs` (git-excluded). Both reuse `bootPage()` and `serve()` from `tests/visual-qa.mjs`. The FTUE was dismissed and `#notifs` was empty before every shot.

## Guard runs (the tooling lane's proof)
| guard | exit | result line |
|---|---|---|
| `HR_CHROME=… node tests/reachability.mjs` | 0 | PASS: `Reachability guard — every declared CTA is on screen and hit-testable at 1366x768, 1280x800, 1440x900, 922x423, and at 922x423+banner with the desktop-mode banner up; every declared sheet (welcome-back, whats-new, confirm-long, spoils) fits, keeps its action on screen and closes on Escape, there and at 1384x771; declared chrome (chrome/NO-FIXED-OVER-CONTENT, skills/HEADER-CLEAR-OF-STRIP) reserves its own box.` |
| `HR_CHROME=… node tests/visual-qa.mjs --offline-fonts` | 0 | `VISUAL QA — screens: 26 \| issues by severity: {"ERR":26,"P3":13,"P1":19,"P2":2}` (a re-run gave P1 18) |

What the visual-qa counts contain:
- **Sandbox only, not counted:** 26 ERR are `fonts-unloaded` (by design under `--offline-fonts`: the fail-closed path). All 18–19 P1 are `runtime-error` from the network (`ERR_TUNNEL_CONNECTION_FAILED`, realtime WebSocket, `Failed to fetch`).
- **Pre-existing, not touched by this set:** 13 P3 are `small-target`. 2 P2 are `duplicate-word "Elemental Elemental"` on desktop/combat and landscape/combat (the family name after a "… Elemental" foe name; `src/data/monsters.js` is not in this set).

## Fight (stocked, Auto-eat on, Vigour meter stated)
| check | fallback 1280x800 | cinzel 1280x800 | fallback 922x423 | cinzel 922x423 |
|---|---|---|---|---|
| `.fs-logrow` inside the card | PASS: row [423,679,1269,775] in card [422,194,1270,790] | PASS: same | n/a (hidden) | n/a (hidden) |
| FABs vs `.combat-log` content box [464,702,1186,742] | PASS: `#hr-bug-btn` [1233,709,1268,738] and `#chat-dock` [1219,751,1264,784] are disjoint | PASS: same | n/a | n/a |
| log row hidden, "Log" door shown at 922 | n/a | n/a | PASS: row display:none, door "Log" [851,319,905,363] | PASS: door [860,319,905,363] |
| action bar does not scroll | PASS: sw 810 = cw 810, sh 56 = ch 56 | PASS | PASS: 650 = 650, 58 = 58 | PASS: 650 = 650, 46 = 46 |
| `#fs-metrics` has no — or – | PASS: "measuring… · survival still measuring" | PASS | PASS | PASS |
| `.ab-away` PENDING | PASS: "away: counting…" (`.bal-pending`, aria "Tonight is not forecast yet") | PASS | PASS | PASS |
| `.ab-away` STATED (bag server-stamped, forecast made) | PASS: "away: you fall" (title "Tonight: you fall against Slime…") | PASS | PASS | PASS |

The stated chip speaks words ("pays away", "you fall", "no food" in `night-plan.js` `chipHtml`), not a number. That is how the set is ruled; there is no bare dash in either state. The Vigour block reads "407 / 1,033 min today · 913 free + 120 bought".

## Dungeons and Quartermaster (unstated scrip and bag, settle arm on)
| check | fallback 1280 | cinzel 1280 | fallback 922 | cinzel 922 |
|---|---|---|---|---|
| Crypt "(have —)" on one line | PASS: 1 line, h 16 (line-height 20.6), [195,631,269,647] | PASS: h 15 [195,625,247,640] | PASS: [91,459,165,475] | PASS: [91,438,143,453] |
| all six key stocks on one line | PASS | PASS | PASS | PASS |
| strip scrip is a pending dash | PASS: "— Dungeon Scrip" (`.bal-pending`) | PASS | PASS | PASS |
| `#qm-scrip-line`: exactly one —, inside `.bal-pending` | PASS: "You have — Dungeon Scrip, earned by clearing dungeons." | PASS | PASS | PASS |
| Buy disabled | PASS: 19 of 19 | PASS | PASS | PASS |
| 18px gutter | PASS: padding 18px (+2px border gives a 20px inset for the line and rows) | PASS | PASS | PASS |

`__setDungeonSettleArm(null)` was restored after the shots.

## Sheet and toast
| check | fallback 1280 | cinzel 1280 | fallback 922 | cinzel 922 |
|---|---|---|---|---|
| Codex: toast vs Close | PASS: toast [450,56,830,101], Close [855,35,921,66], disjoint | PASS: Close [868,35,921,66] | PASS: toast [321,62,601,130], Close [668,35,742,79] | PASS: toast [321,62,601,107], Close [681,35,742,79] |
| Codex: `elementFromPoint` at the Close centre is Close | PASS | PASS | PASS | PASS |
| Spoils: toast vs Done and Quartermaster (foot) | PASS: Done [775,550,858,594], QM [591,550,767,594] | PASS: Done [788,538,858,582] | PASS: Done [609,354,685,398] | PASS: Done [620,342,685,386] |
| after close, the next toast is bottom-right | PASS: [901,654,1268,699] | PASS: [1008,654,1268,699] | PASS: [630,343,910,411] | PASS: [650,366,910,411] |
| **toast vs the sheet's own text** | **FAIL (D1):** covers the Codex title "Hearth Codex" [359,37,474,64] by 24x8 and "First things" [359,90,921,118] by 380x11 | **FAIL (D1):** title [359,37,507,64] by 57x8, "First things" by 380x11 | **FAIL (D1):** Codex "First things" [180,103,742,127] by 280x24. Spoils boss line [237,51,685,73] by 280x11 and lore [237,79,685,153] by 280x51 | **FAIL (D1):** Codex title by 7x8, "First things" by 280x4. Spoils boss line [237,63,685,85] by 280x22 and lore [237,91,685,140] by 280x16 |

The Codex has no foot primary; its only head button is Close. The Spoils sheet has no head Close; it closes from its foot (Done).

## Inventory (stocked bag, 1280x800)
| check | fallback | cinzel |
|---|---|---|
| slot labels (`.td-slot-lbl`, 14 of them) have no mid-word break; line boxes ≤ words | PASS: 0 bad ("Necklace" [1068,503,1134,518], "Offhand" [1142,577,1208,592], "Weapon" [994,577,1060,592]) | PASS: 0 bad |
| no truncation (scroll box ≤ client box) | PASS: 0 | PASS: 0 |

In the PNG, "Earrings" sits at y 799–814 in fallback, below the 800 fold. It is reached by scrolling the page, not clipped by a container.

## Global read of every PNG
1. **D1 (P3, overlap):** while a sheet is up, the toast column (top: `--top-h` + 8px, centred; `art-direction.css` "THE TOASTS LEAVE AN OPEN SHEET'S FOOT") paints over the sheet's own text. A tall sheet occupies the band under the header, so the toast lands inside it. Affected: `sheet-toast-codex-*` (title and the first group heading) and `sheet-toast-spoils-*-922x423` (boss line and lore). Rects are in the table above. Close and Done stay clear, so the lane's ruled checks pass.
2. Observation, pre-existing and not this set (§6 class for the Coordinator): `dungeons-unstated-*`. With the bag unstated, the Crypt card reads "(have —)" while Manual Run and Auto-Run are enabled from the client bag (`G.inventory.bone_key = 3`). Enabled buttons at fallback 1280, read from the PNG: Manual ≈[364,376,446,431], Auto ≈[452,376,520,431]. The code comment in `dungeons.js` calls this a deliberate fail-open for the gate. §6 asks gates to fail safe to "not unlocked".
3. Observation, transient: `fight-fallback-922x423`. The combat toast "Defeated Slime" (≈[732,366,910,410]) arrived after the wait for an empty `#notifs`. It sits at the bottom-right of the arena card, just under the "Log" door [851,325,905,369].
4. Sandbox only, not defects: "The realm is slow" pill, `—` in quest progress, "Lifetime —" (pending), "Signed out" and "Reconnecting…".

## Verdict
**One defect: D1 (P3).** While a sheet is open, the toast covers the sheet's title and first heading or prose at both sizes and in both font sets. Every ruled check for the three lanes passes.
