# Visual pass 4: set/b560 @ ef3cb6d1 (qa-engineer, 2026-09-28)

Rendered headless (Chromium 1194, `bootPage()`/`serve()` from `tests/visual-qa.mjs`, `--offline-fonts`, `__HR_TEST_HARNESS__=true`, MID save).
**Fonts:** Cinzel / Alegreya Sans / Alegreya Sans SC did NOT load (the sandbox cannot reach Google Fonts, egress 403), so fallback faces rendered. Supabase is also unreachable, which is why "The realm is slow" (`#hr-net-banner`) and "Reconnecting…" appear on every shot.
Viewports: 1280x800 and 922x423. Measurements are CSS px, rects as [left, top, right, bottom].

| # | Check | 1280x800 | 922x423 |
|---|---|---|---|
| 1 | codex-scrolled: title+Close inside sheet top 80px after scroll (+2000, clamped to max) | PASS: sheet t16; title [359,37,474,64]; Close [855,35,921,66]; scrollTop 851/851 | PASS: sheet t16; title [180,44,295,70]; Close [668,35,742,79]; scrollTop 1219/1219 |
| 1b | codex: nothing overlaps title/Close | FAIL (P3, env): `#hr-net-banner` [415,8,865,41] covers Close's top-left 10x6px; hit-test at Close centre/edges = Close | FAIL (P3, env): banner [236,8,686,40] covers Close 18x5px; hit-test = Close |
| 2 | settings-scrolled: title+Close in top 80px | PASS: sheet t127; title t147..174; Close [855,146,921,176]; body does not scroll at 1280 (scrollMax 0) | PASS: sheet t16; title [180,44,244,70]; Close [668,35,742,79]; scrollTop 320/320 |
| 2b | settings: nothing overlaps title/Close | PASS | FAIL (P3, env): same banner over the Close corner (18x5px) |
| 3 | lifetime-stats-scrolled (opened via the Character-page door): title+✕ in top 80px | PASS: sheet t20; title [325,45,536,76]; ✕ [933,35,963,65]; scrollTop 846/846; no overlap | PASS: sheet t11; title [146,36,357,66]; ✕ [754,26,784,56]; scrollTop 1174/1174; no overlap |
| 4 | home-cap-pending (idle, as booted): row text, no `—`, no `0h`/`12h` | PASS: "Nothing is banking right now. Fighting, gathering or crafting banks offline; the limit is being confirmed." | PASS: same text |
| 4b | home-cap-pending-fighting (same unknown cap, fight running: `.hd-bank.is-on`) | **FAIL**: "Banking offline while you are away — the limit is being confirmed." (em dash inside the sentence) | **FAIL**: same text |
| 5 | home-cap-known (`hydrateHunt(G,{vigour:{grant_min:900}})`, the OFFLINE-CAP-1b value) | PASS: "…banks up to 15h offline."; offlineCapHours() = 15 | PASS: same |
| 6 | home-welcome-collected: every figure is the receipt's | PASS: "3h away — +2,310 XP · +231 items · +417 gold / Earned while gathering or crafting." Numbers: 3 ← collected.ms 10,800,000; 2,310 ← xp.woodcutting; 231 ← items.normal_log; 417 ← gold. kills 0 is not printed (no 0 shown). No clipped children | PASS: same figures; "+417 gold" wraps to line 2 in the fallback font |
| 7 | fight: `.ab-tkills`, `.ab-away`, `.ab-vigour` non-zero and inside the bar [170,90,1280,137] / [64,44,922,72] | PASS: vigour [551,100,693,126] "Vigour 626 min"; tkills [1054,102,1157,124] "Lifetime —"; away [1171,102,1189,124] "—" | PASS: vigour [426,44,519,71]; tkills [770,46,805,69]; away [819,46,837,69] |
| 7b | fight: stance buttons not touching | PASS: min gap 4.0px, no label overflow | PASS: min gap 4.0px, no label overflow |
| 7c | fight: metrics/session lines inside the arena card | PASS: card bottom 790; metrics 721..743; session 747..767 | **FAIL**: card [244,106,916,393]; `#fs-metrics` 390..407 and `#fs-session` 408..427 are drawn BELOW the card border (17px and 34px past it; the session line ends past the 423 viewport; `#fs-view` scrolls 441/327) |
| 8 | inventory: slot labels break mid-word | REPORT (known P3, fallback fonts): `.td-slot-lbl` "Necklace", "Weapon", "Offhand", "Earrings" break mid-word ("Neckla/ce", "Weapo/n", "Offhan/d") | PASS: 0 mid-word breaks |
| 8b | inventory: fixed bug/chat buttons vs actionable controls | PASS: `#hr-bug-btn` [1233,709,35x29], `#chat-dock` [1219,751,45x33]; 0 overlaps with 50 controls | PASS: `#hr-bug-btn` [0,379,64x44] in the rail; 0 overlaps with 50 controls |

## Defects (numbered)
1. **P2: pending away-cap copy still puts a dash inside the sentence while an activity runs.** `src/features/home-dashboard.js` `awayBankingRow`, `is-on` + `cap == null` branch: "Banking offline while you are away — the limit is being confirmed." The idle branch was fixed (NIGHT-PLAN-PENDING-COPY); the running branch was not. OFFLINE-CAP-1b calls this branch (`activeMonster:'slime'`) but checks only for numbers, so it passes. PNG: `home-cap-pending-fighting-{1280x800,922x423}.png`, row rect [855,~390,413x59] / [80,176,826x51].
2. **P2: at 922x423 the Fight card's metrics line ("measuring… · you last 1h 1m") and session line are drawn outside the arena card.** Card bottom 393; `#fs-metrics` 390..407, `#fs-session` 408..427 (past the viewport; reachable only by scrolling `#fs-view`). FIGHT-PHONE-DENSITY checks that the three rows don't overlap and that the food row stays inside the card; it does not check metrics/session against the card. The overhang (17px/34px) is larger than any fallback-font line-height difference. PNG: `fight-922x423.png`, `fight-bottom-922x423.png`.
3. **P3 (environment-triggered): `#hr-net-banner` ("The realm is slow…") sits over the top-left corner of the sheet Close button** (Codex and Settings; 10x6px at 1280, 18x5px at 922). Hit-testing still lands on Close. This only shows when the network is slow, which in this sandbox is always.

## Observations (not failed)
- `.ab-away` renders as a bare "—" with no visible label (pending: no Night Plan without a server). It has an aria-label (`night.chipPending`), and the Lifetime chip is "Lifetime —" at 1280 and trophy + "—" at 922. By design ("a dash is a count still on its way"), but a sighted player sees an unlabeled dash.
- Transient toasts cover content in several shots: "Today's blessing" [888,632,1268,698] covers the Settings Account chevron (1280) and the Gems/Bounty Marks values in Lifetime Stats (922); "Defeated Goblin" covers LOOT/STATS/HISTORY on Fight 922. These toasts auto-dismiss; not scored.
- Fight 922 stat strip: labels and values are inline with a 3px gap ("MAX HIT23 DPS4.8"). Tight in the fallback font; they do not touch.
- Settings at 1280 does not scroll (the content fits), so "scrolled" is the unscrolled sheet.

## PNGs
codex-scrolled, settings-scrolled, lifetime-stats-scrolled, home-cap-pending (+ -row), home-cap-known (+ -row), home-welcome-collected (+ -card), fight, inventory: each at -1280x800 and -922x423. Extra: home-cap-pending-fighting-*, fight-bottom-*.
