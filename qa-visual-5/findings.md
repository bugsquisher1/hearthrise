# Visual pass 5: set/b560 (assembled), qa-engineer, 2026-09-28

Rendered **`192044d`** (`origin/set/b560`, head = "merge: lane/vg4-fight-card-rows-922"). Headless Chromium 1194, `window.__HR_TEST_HARNESS__=true`, `bootPage()`/`serve()` from `tests/visual-qa.mjs --offline-fonts`. **The fonts are fallbacks.** Cinzel, Alegreya Sans and Alegreya Sans SC did not load because Google Fonts is blocked (403), so DejaVu rendered instead. Supabase is also unreachable, which is why the realm banner shows on its own. Rects are CSS px `[left,top,right,bottom]`.

## Checks

| # | Screen | Check | 1280x800 | 922x423 |
|---|---|---|---|---|
| 1 | home-top | company line "Also hunting Slime: Paione" inside the Right now card | PASS [900,227,1094,247] in [855,175,1268,257] | PASS [125,161,318,181] in [80,110,906,191] |
| 2 | home-top | Open button inside the card | PASS [1189,199,1264,233] | PASS [821,128,902,172] |
| 3 | home-top | banking row: no dash, no `\d+h` while pending ("Banking offline while you are away. The limit is being confirmed.") | PASS | PASS |
| 4 | home-comeback | 1..4 rows, new day last (ready · dungeon · newday = 3) | PASS | PASS |
| 5 | home-comeback | no `.when` matching `-\d|NaN|undefined|Infinity`; every `.when`/`.s` fits its row | PASS (0 bad, 0 clipped) | PASS (0 bad, 0 clipped) |
| 6 | home-welcome | ledger chips wrap inside the band; nothing clipped | PASS band [182,133,1268,313] | PASS band [80,72,906,301] |
| 7 | home-welcome | band fits one screen | PASS 180 ≤ 800 | PASS 229 ≤ 423 |
| 8 | fight | every `#ab-meta` chip (kills, xp, tkills, away) and the Vigour chip inside the bar | PASS bar [170,90,1280,137] | PASS bar [64,44,922,72] |
| 9 | fight | food row inside the arena card and the viewport | PASS [441,667,964,717] in [422,194,1270,790] | PASS [255,319,776,369] in [244,106,916,405] |
| 10 | fight | `#fs-metrics` inside the card and the viewport, contains "you last" | PASS [441,721,1251,743] | PASS [255,370,905,388] |
| 11 | fight | `#fs-session` inside the card and the viewport | PASS [441,747,1251,767] | PASS (idle sentence hidden, as VG4 ruled) |
| 12 | fight | gap between stance buttons ≥ 4px | PASS 4.0 | PASS 4.0 |
| 13 | codex-banner | title and Close within the sheet's top 80px after scrolling the body 2000px | PASS title [359,37,474,64], Close [855,35,921,66], sheet top 16 | PASS title [180,44,295,70], Close [668,35,742,79], sheet top 16 |
| 14 | codex-banner | banner [415,8,865,41] / [236,8,686,40] overlaps Close; hit-test at Close+2px (banner made hittable) gives Close | PASS: banner is under the sheet | PASS: banner is under the sheet |
| 15 | codex-banner-closed | banner back on top after the sheet closes | PASS | PASS |
| 16 | dungeons | loot rows carry odds chips (38 rows, 31 with odds; guaranteed rows have none); none clipped | PASS | PASS |
| 17 | spoils-sheet | lore line, `.spoils-rare` last (Wartusk Cleaver "Unique 6% a clear"), "Your purse", "Spent one Goblin Seal · 2 left", "Opens to you again in 3h 59m", Done + Quartermaster | PASS | PASS |
| 18 | spoils-sheet | numbers match the fixture: 21 scrip, purse 57, 2 left | PASS | PASS |
| 19 | spoils-sheet | head within the sheet's top 80px; Done inside the viewport | PASS head [422,206,858,259], Done [775,550,858,594] | PASS head [237,25,685,73], Done [609,354,685,398] |
| 20 | spoils-banner | banner not over the sheet head | PASS: banner [570,8,710,41] is clear of the head | **FAIL (KNOWN)**: banner [391,8,531,40] is over the head [237,25,685,73], and the hit-test at the head gives `hr-net-banner`, so the banner paints above the `.hr-scrim` sheet and covers "— cleared" |
| 21 | spoils-toast | loot toast does not cover Done | PASS: toast [888,631,1268,699], Done [775,550,858,594] | **FAIL (KNOWN)**: toast [630,320,910,411] covers Done [609,354,685,398] |
| 22 | party | each doing line inside its row, single line, `ellipsis/nowrap/hidden`, not overlapping Lv or Remove | PASS (Paione [191,226,635,249], Kd [191,338,635,361]) | PASS (Paione [107,155,559,178], Kd [107,256,559,278]) |
| 23 | chronicle | "Cleared the Goblin Warcamp" drawn with the skull glyph (SVG identical to `_hrGly('skull')`) | PASS row [361,432,919,470] | PASS row [182,243,740,282] |
| 24 | inventory | fabs (`#hr-bug-btn`, `#chat-dock` / bottom-nav) do not cover any control | PASS (0 hits) | PASS (0 hits) |
| 25 | inventory | equipment slot labels break mid-word in fallback fonts: "Weapo n", "Neckla ce", "Offhan d" | noted, not failed (known fallback-font issue) | not present |

## Read from the screenshots (things the checks above do not measure)

- **N1, new, pre-existing on main `e3b6aed` and on `28ebc98`, so not a b560 regression:** in a fight with Auto-eat on, the `.fs-actionbar` in the arena card overflows. At 922x423, scrollWidth 783 > clientWidth 650: Loot/Stats [765,329,925,373] and History [931,329,1038,373] sit past the card (right edge 916) and the viewport, so History cannot be reached. In `fight-922x423.png` only "LOOT" shows, cut at the edge. At 1280x800, History [1204,676,1304,707] runs past the card (1270) and the viewport (1280), and `fight-1280x800.png` shows "HISTOI". At 922 the overflow is 133px on a 650px row, too large for the real fonts to absorb. At 1280 it is 53px, so it may be a fallback-font effect there.
- N2 (copy): the Goblin Warcamp lore line ends "…telling the tale of your blade to the next". It reads as cut off, with no noun and no full stop (`src/data/dungeon-lore.js:9`). `spoils-*.png`.
- N3 (pre-existing, only because the harness is offline): the Crypt of Bones card says "Bone Key (have 3)" while Come back for says "Bone Key held: —". With no server bag stated, the card's `gateItemCount` falls back to the display bag and Come back reads `serverItemCount` → null. On live the server bag is stated, so both surfaces should show the same count. Worth a guard under §6. `dungeons-*.png`, `home-top-1280x800.png`.
- N4 (transient): the "Today's blessing" toast [630,320,910,411] covers the Come back for `.when` column at 922x423 (`home-top-922x423.png`). Same toast-placement class as KNOWN #21.
- The quest strip reads "— / 60" and "Lifetime — —" because the counts are unknown offline: a dash where the value is unknown, which is correct. No zero appears where a dash belongs. No NaN or undefined anywhere.

## Verdict

Every b560 surface passes except the two KNOWN Spoils items (#20 banner over the sheet head and #21 toast over Done, both at 922x423 only). N1 is a real player-visible defect already live on main, not introduced by b560.
