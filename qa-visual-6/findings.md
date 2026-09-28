# Visual pass 6: set/b560 with Marks of the Climb

I rendered **`ef0e44c`** (`origin/set/b560`). Its history holds "merge: lane/content-b6-4-marks-of-the-climb" (`27449ab`) and, above that, "merge: lane/vg5-spoils-sheet-banner-toast" (`ef0e44c`). That second merge is the follow-up that stacks the net banner under `.hr-scrim` sheets, so it **is in the head**.

Setup:
* Headless Chromium 1194 with `window.__HR_TEST_HARNESS__=true`.
* `bootPage()` and `serve()` come from `tests/visual-qa.mjs --offline-fonts`.
* **The fonts are fallbacks.** Cinzel, Alegreya Sans and Alegreya Sans SC are blocked with a 403, so DejaVu renders in their place.
* Supabase is unreachable. That explains the realm-slow/back-online pill, "Signed out", the `—` on quest progress and the enemy `0 / 0` HP.
* Before each shot I wait until the boot toasts leave `#notifs` (under 5 s).
* Rects are CSS px `[left,top,right,bottom]`.

| # | screen | check | 1280x800 | 922x423 |
|---|---|---|---|---|
| 1 | mark-banner | `.hr-levelup-pop.is-mark` inside the viewport | PASS [410,70,870,248] | PASS [231,70,691,219] |
| 2 | mark-banner | kicker "Old Hand", title "Mining 50", lore, foot "Kept in your Chronicle"; no clipped text | PASS | PASS |
| 3 | mark-banner | nothing actionable covered for good (transient: leaves at 6 s, click dismisses, `pointer-events:auto`) | PASS (covers the quest strip and idle bar for ≤6.5 s) | PASS (covers the hero band for ≤6.5 s) |
| 4 | mastery-sheet | `.cm-mastery.hr-sheet` inside the viewport; body fits without scrolling | PASS [400,246,880,554] | PASS [221,71,701,352] |
| 5 | mastery-sheet | kicker "Mastery", "Fishing 99", two lore paragraphs, "Kept in your Chronicle for good"; no clipped text | PASS | PASS |
| 6 | mastery-sheet | Close has focus | PASS | PASS |
| 7 | mastery-sheet-netbanner | with `setMode('degraded')`, the net banner stays off the sheet head: the head is not overlapped and `elementFromPoint` on the head returns the sheet | PASS: banner [415,8,865,41] sits under the scrim, head [422,266,858,316] | PASS: banner [236,8,686,40] sits under the scrim, head [237,85,685,129] |
| 8 | pet-banner | `.is-pet` inside the viewport, kicker "Companion", no clip | PASS [497,70,783,130] | PASS [318,70,604,130] |
| 9 | plain-banner-reduce-motion | with `hrApplyReduceFx(true)`, `animationName` of the pop is `none` | PASS `none` [503,70,777,156] | PASS `none` [324,70,598,155] |
| 10 | plain-banner-reduce-motion | `hrApplyReduceFx(false)` removes `hr-reduce-fx` | PASS | PASS |
| 11 | skills | no horizontal scroll; no leftover `levelup-toast` rules in any sheet | PASS (0 rules) | PASS (0 rules) |
| 12 | skills | the sticky strip clears the header after scrolling | n/a (desktop has no sticky strip) | PASS: `.act-mob-strip` [68,72,918,136] sits below the topbar [64,0,922,44] and the idle bar (ends at 72) |
| 13 | settings-reduce-motion | Display opened, row in the viewport | PASS: row [374,496,906,537] | PASS: row [195,203,727,279] |
| 14 | settings-reduce-motion | toggle on → `<html>.hr-reduce-fx`; toggle off → gone | PASS / PASS | PASS / PASS |
| 15 | fight | every `#activity-bar` chip (vigour, kills, xp, lifetime, away) inside the bar | PASS: bar [170,90,1280,137] | PASS: bar [64,44,922,72] (note: the Stop button's box [848,42,914,73] is 1.6 px taller than the 28 px bar. It is not visibly clipped. Not a chip.) |
| 16 | fight | `.fs-actionbar` (food row) inside the arena card and the viewport | PASS [441,660,1251,717] in [422,194,1270,790] | PASS [255,316,905,369] in [244,106,916,405] |
| 17 | fight | `.fs-metrics` inside the card and the viewport | PASS [441,721,1251,743] | PASS [255,370,905,388] |
| 18 | fight | `.fs-session` inside the card and the viewport | PASS [441,747,1251,767] | PASS (`display:none` on the phone, as VG4 ruled) |
| 19 | fight | the controls inside `.fs-actionbar` fit the card | **FAIL (KNOWN N1)**: History [1204,676,1304,707] runs past the card (1270) and the viewport (1280) | **FAIL (KNOWN N1)**: Loot [848,322,925,366], Stats [931,322,1008,366] and History [1014,322,1122,366] run past the card (916) and the viewport, so Stats and History cannot be reached |
| 20 | fight | gap between stance buttons ≥ 4px | PASS 4.0 | PASS 4.0 |
| 21 | inventory | the fixed FAB (`#hr-bug-btn`) is clear of every actionable control (50 / 49 checked) | PASS: FAB [1233,709,1268,738], 0 hits | PASS: FAB [0,379,64,423] sits in the rail, 0 hits |
| 22 | inventory | no horizontal scroll | PASS | PASS |
| 23 | inventory | equip-slot labels break mid-word at 1280 in fallback fonts (reported, not failed) | REPORTED: "Neckla/ce", "Weapo/n", "Offhan/d" in `inventory-1280x800.png` (equip doll ≈[993,452,1209,594], read off the PNG) | none |

## Read-through of every PNG

* **N1, KNOWN and pre-existing (pass 5 logged it on main `e3b6aed`). Not introduced by Marks, which moved no `combat-screens.css`.** In `fight-1280x800.png` the last chip reads "HISTOI" at [1204,676,1280,707]. In `fight-922x423.png` only "LOOT" shows, cut at the card edge 916. `.fs-actionbar` is a no-wrap flex row with Auto-eat on. At 922 the overflow is about 205 px, which the real fonts cannot absorb.
* Offline effects, not defects of this set:
  * `fight-*`: the enemy HP bar shows `0 / 0` next to "HP 8". The fight was never started by the server, and a real session would carry `monsterHp`.
  * The bar reads "Lifetime — —". The second `—` is the pending away chip (`ab-away bal-pending`) [1171,102,1189,124].
  * Quest strip progress reads "— / 60" and so on.
* The "Back online" pill in `mark-banner-922x423`, `pet-banner-1280x800`, `plain-banner-reduce-motion-1280x800` and `mastery-sheet-*` covers the Quests counter [570,8,710,40]. It is a transient pill that the harness triggered by forcing `setMode('ok')`.
* A boot toast paints above `.hr-scrim` sheets: `#notifs` has z 10050 and the scrim 9998. In a first render taken before the wait, "Today's blessing" [630,320,910,411] sat over the Mastery sheet's Close at 922x423 for its ~5 s dwell. It is transient, and once it left, `elementFromPoint` on Close returned the sheet. This is the same class as pass-5 item 21 (a toast over a sheet's action). Recorded here, not failed.
* No zero where a dash belongs, no dash inside a sentence and no empty regions in the Marks surfaces. Banner, pet, plain, mastery and settings copy all render in full.

## Verdict
GREEN for Marks of the Climb: every Marks check passes at both sizes, and the banner-over-`.hr-scrim` check (7) passes because the vg5 follow-up is in the head. The one FAIL on the gate list is **N1**: the fight action bar overflows. It is KNOWN and pre-existing on main, and still open.
