# Visual pass 10 — set/b561 (toast-hold + dungeon-run-pending)

Rendered **e5441e5** (`origin/set/b561` head: "merge: lane/b561-toast-hold", parent chain holds d2f2ae8 "merge: lane/b561-dungeon-run-pending"). Headless Chromium 1194, `__HR_TEST_HARNESS__`, `bootPage()`/`serve()` from `tests/visual-qa.mjs`, FTUE dismissed via "Not now", `#notifs` empty before each shot. Fonts: `fallback` = Google Fonts blocked (no Cinzel face loaded); `cinzel` = woff2 fetched by curl and injected with `addStyleTag` (Cinzel face `loaded` = true). Viewports 1280x800 (d) and 922x423 (l). Rects are `[left, top, right, bottom]` in CSS px.

## 1. Toasts held under sheets

| Check | fb 1280 | fb 922 | cz 1280 | cz 922 | Verdict |
|---|---|---|---|---|---|
| Codex open → toast drawn | 0 | 0 | 0 | 0 | PASS |
| `state().held` | 1 | 1 | 1 | 1 | PASS |
| Codex title / first h3 / Close rects unchanged after notify | yes | yes | yes | yes | PASS |
| Codex title | [359,37,474,64] | [180,44,295,70] | [359,37,507,64] | [180,44,328,70] | |
| Codex Close | [855,35,921,66] | [668,35,742,79] | [868,35,921,66] | [681,35,742,79] | |
| Close clicked → toast replayed within 2 frames | yes | yes | yes | yes | PASS |
| Replayed toast rect (settled) | [1024,654,1268,699] | [666,366,910,411] | [1090,654,1268,699] | [732,366,910,411] | PASS (lower-right quadrant) |
| Spoils (SPOILS-1 fixture) open → toast drawn / held | 0 / 1 | 0 / 1 | 0 / 1 | 0 / 1 | PASS |
| Spoils title / Done unchanged | yes | yes | yes | yes | PASS |
| Spoils Done | [775,550,858,594] | [609,354,685,398] | [788,538,858,582] | [620,342,685,386] | |
| Done clicked → replayed within 2 frames, scrim gone | yes, 0 | yes, 0 | yes, 0 | yes, 0 | PASS |
| 7 pushed while held → held | 5 | 5 | 5 | 5 | PASS |
| After close: visible + pending | 4 + 1 | 4 + 1 | 4 + 1 | 4 + 1 | PASS* |
| After close: shown texts | burst 3–6 (7 queued) | same | same | same | PASS (newest five, in order) |
| `state().dropped` delta | +2 | +2 | +2 | +2 | PASS |

\* The brief said "exactly 5 show". `MAX_VISIBLE = 4` in `toasts.js`, so the newest five replay as 4 on screen + 1 queued, which is what TOAST-SHEET-1 asserts (`visible + pending === 5`). That is by design, not a defect.

The shots taken 2 frames after close (`sheet-toast-replayed-*`, `sheet-spoils-replayed-*`, `sheet-toast-burst-*`) show the toasts mid-entry: translucent and up to 14px past the right edge (e.g. [1036,654,1280,699] → settles at [1024,654,1268,699]). The `*-settled` shots show them at rest.

## 2. Dungeon key gate (Crypt of Bones)

| State | Buttons (text · disabled · `.bal-pending` · `data-pending`) | Card `locked` | Entry line | Verdict |
|---|---|---|---|---|
| Unstated bag (display bag 3) | "Manual Run · counting…" · ✓ · ✓ · keys; "Auto-Run · counting…" · ✓ · ✓ · keys | no | "1× Bone Key (have —)" | PASS ×4 |
| Stated `{bone_key: 2}` | "Manual Run" / "Auto-Run" · enabled · no mark | no | "1× Bone Key (have 2)" | PASS ×4 |
| Stated `{bone_key: 0}` | "Need a Bone Key" · disabled · no mark | **yes** | "1× Bone Key (have 0)" | PASS ×4 |

Pending button rects: fb 1280 [281,557,403,643] + [409,557,520,643]; cz 1280 [247,557,392,643] + [398,557,532,643]; fb 922 [282,298,586,342] + [592,298,895,342]; cz 922 [238,288,564,332] + [570,288,895,332]. None clip (`scrollWidth ≤ clientWidth`).

## 3. Farm seed gate (real button path: tap the empty plot)

| Check | fb 1280 | fb 922 | cz 1280 | cz 922 | Verdict |
|---|---|---|---|---|---|
| Sheet open before the tap | no | no | no | no | |
| Unstated bag (turnip_seed 5 in display bag): intents sent (`farmPlant` calls / `farm_plant` requests) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | PASS |
| Toast text | "The realm is counting your seeds… try again in a moment" (all four) | | | | PASS |
| Toast rect | [888,631,1268,699] | [630,320,910,411] | [888,631,1268,699] | [630,343,910,411] | |
| Stated `{turnip_seed: 10}`: picker shows "Turnip … x10"; row tapped → intents | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | PASS |
| After that | "Couldn't reach the server — nothing was planted…" (sandbox refusal, not a defect) | | | | |

## 4. Inventory 1280x800 fallback (slot-label regression)

All 14 doll labels (Helmet … Earrings) fit on one line inside their slot, with none clipped (e.g. Necklace [1068,503,1134,518], Offhand [1142,577,1208,592]). **PASS.** The first take caught a hover tooltip because of where the harness left the mouse. It was re-shot with the pointer parked at (640,5).

## Global read (every PNG read)

**Defects**

1. **"Plant all (2)" says you have no seeds while the realm is still counting them.** With the bag unstated (display bag turnip_seed 5), the button is enabled. Tapping it toasts "No plantable seeds for your plots — the Local Shop sells them" (0 intents sent). A single-plot tap in the same state correctly says "counting your seeds". `plantAllEmpty` (`src/screens/farm.js:558`) folds `heldByServer() === null` to 0 instead of treating it as pending. This is the §6 "browser says one thing" class. `farm-pending-plantall-*.png`: toast [888,631,1268,699] at 1280 and [630,320,910,411] at 922; button top-right of Plots, cz 1280 ≈[871,298,959,327].
2. **A replayed burst covers the Home CTAs at 922x423.** Four toasts released at once when a sheet closes form a column 201px high (47.5% of the viewport) with `pointer-events: auto`. It covers "Go train" and touches the bottom of "Claim". Column rects: fb 922 [809,210,910,411]; cz 922 [832,210,910,411]. "burst 5" [809,314,910,359] sits on Go train ≈[818,318,902,358]. `sheet-toast-burst-settled-{fallback,cinzel}-922x423.png`. The column-lift behaviour already existed, but the hold-and-replay now makes a 4-toast release after any sheet a normal event.

**Observations (not blocking; mostly pre-existing)**

- Pending dungeon buttons wrap to three lines at 1280, where the card is 355px wide. "AUTO-RUN / · / COUNTING…" leaves a lone "·" on its own line, and the buttons are 86px tall against 55px when stated. The entry line is squeezed to one word per line ("Entry: 1× / Bone / Key / (have —)"). `dungeons-pending-{fallback,cinzel}-1280x800.png`, Crypt buttons [247..532, 557..643]. Nothing is clipped, but it reads cramped.
- The Bone Key glyph in the entry line shows in the pending shots but is absent in several stated shots (`dungeons-stated-zero-*`, `dungeons-stated-*-922x423`). Not measured.
- Farm Crops list: the Carrot row's right-edge "🔒 Lv…" label is covered by the bug-report FAB [1233,709,1268,737] at 1280x800 (`farm-*-1280x800.png`).
- The seed picker says "Pick a seed" twice (modal title and body h3). `farm-stated-picker-*.png`.
- Farm "Lv —/5", `—` in quest progress and hero stats, the "realm is slow" pill and "Reconnecting…" are all the offline sandbox.

Verdict: **not GREEN.** Two defects (1: Plant all on an unstated bag; 2: a replayed burst covers the CTAs at 922x423). Every check the brief specified passes.
