# Visual pass 7: set/b560 @ c338602 (Fight + Dungeons)

Rendered sha **c3386029** (`merge: lane/vg5-fight-actionbar-922`; history holds `merge: lane/vg5-dungeon-key-count-server` 8ee5ff2). Headless Chromium 1194, `__HR_TEST_HARNESS__`, bootPage()/serve() from tests/visual-qa.mjs. Fonts: `fallback` = Google Fonts aborted (bootPage reports Cinzel/Alegreya missing); `cinzel` = the real woff2 from fonts.gstatic via curl, served locally (bootPage: all three families render). Offline sandbox: the "realm is slow" pill, `—` quest progress, and "Signed out" are expected.

## Fight (stated Vigour meter, stocked fight, Auto-eat ON, fighting Slime)
| check | fallback 1280x800 | fallback 922x423 | cinzel 1280x800 | cinzel 922x423 |
|---|---|---|---|---|
| bar scrollWidth <= clientWidth+1 | PASS 810/810 | PASS 650/650 | PASS 810/810 | PASS 650/650 |
| card rect | 422,194–1270,790 | 244,106–916,405 | 422,194–1270,790 | 244,106–916,405 |
| Eat btn in card+viewport | PASS 441..717 | PASS 255..483 | PASS 441..650 | PASS 255..454 |
| Auto-eat picker | PASS 723..912 | PASS 489..644 | PASS 656..836 | PASS 460..577 |
| Stop | PASS 922..992 | PASS 650..710 | PASS 846..904 | PASS 583..631 |
| Loot | PASS 1002..1071 | PASS 716..777 | PASS 1045..1101 | PASS 751..799 |
| Stats | PASS 1077..1145 | PASS 783..845 | PASS 1107..1163 | PASS 805..854 |
| History | PASS 1151..1251 | PASS 851..905 | PASS 1169..1251 | PASS 860..905 |
| no button overlaps food row (other than its own) | PASS | PASS | PASS | PASS |
| History text / aria-label | PASS "History"/"History" | PASS "Log"/"History" | PASS "History"/"History" | PASS "Log"/"History" |
| food row in card | PASS 667..717 | PASS 319..376 | PASS 667..717 | PASS 319..363 |
| #fs-metrics in card | PASS 721..743 | PASS 377..394 | PASS 721..743 | PASS 364..382 |
| #fs-session | PASS in card 747..767 | not drawn (idle prose, hidden by the VG4 ruling) | PASS 747..767 | not drawn (same ruling) |
| stance gap >= 4px | PASS 4.0 (4 btns) | PASS 4.0 | PASS 4.0 | PASS 4.0 |
| Loot opens @922 | n/a | PASS "Slime — what it drops" | n/a | PASS |
| Stats opens @922 | n/a | PASS "Slime — the maths" | n/a | PASS |
| History opens @922 | n/a | PASS "Loot history" | n/a | PASS |

## Dungeons (Crypt of Bones, combat level forced to 99, same result in all 4 runs)
| check | unstated (`_serverBag` deleted, inventory bone_key=3) | stated (envelope bone_key=2) |
|---|---|---|
| `.dgn-cost` innerText | PASS "Entry: 1× Bone Key (have —)", `.bal-pending` present, no "have 3" | PASS "Entry: 1× Bone Key (have 2)", no `.bal-pending` |
| Auto-Run disabled | PASS false | PASS false |
| Come back for key row | PASS "Bone Key held: —" (`.bal-pending`) | PASS "Bone Key held: 2" |
| card and Come back for agree | PASS | PASS |
| Quartermaster: key count disagreeing with the bag | PASS: no key count is printed | PASS: no key count is printed |

Come back for was rendered from `HearthriseComeBack.card(G)` into a magenta QA host, with a 3h Crypt auto window set only for that call. The host is not game UI.

## Global (every PNG read)
1. **FAIL: Quartermaster prints a zero where a dash belongs.** "You have **0** Dungeon Scrip" (quartermaster-*.png, `#qm-scrip-line`), and the Dungeons header also shows "0 Dungeon Scrip" (dungeons-stated-fallback-1280x800.png, top strip), while `G.dungeonScrip` is `undefined` (never stated). `scripOf()` (src/net/dungeon-scrip-record.js:99-107) returns 0 when unstated. §6: the right output is the pending dash. The Buy gate fails closed, so only the display is wrong.
2. **FAIL: `.fs-logrow` renders outside the arena card.** At 1280x800 the log row spans 775–871 while the card ends at 790, and one sliced log line shows at the card's bottom edge (fight-*-1280x800.png, around y 785–800). At 922x423 it spans 383–473 while the card ends at 405 and the viewport at 423 (fight-*-922x423.png, sliver at y≈400). Same in both font sets.
3. **FAIL (minor): the Quartermaster sheet has no inner padding.** `.qm-modal` padding is 0px, so the h3 and text start 2px from the left border and the Buy buttons end 2px from the right border (quartermaster-*.png; modal 370..910 @1280, 191..731 @922). The body does scroll (948/691 and 1202/338, overflow auto).
4. **FAIL (minor): a dash inside a sentence.** `#fs-metrics` reads "measuring… · you last **—**" (fight-*.png; 1280: 441,721–1251,743; 922: 255,364–905,382). The survival forecast is non-finite for this matchup, and `fmtRun()` (src/features/combat-screens.js:59) prints the pending dash inside the sentence. This is a local forecast, not a pending server value.

Other notes, not defects: at 1280x800 the floating 🐞 and chat FABs (≈1235..1265, 710..782) sit over the right end of the `#fs-session` rect but don't cover any text. Runtime errors in all runs are only the offline fetch/websocket failures.

Verdict: not GREEN. The two pass-5 fixes (the 922 action bar and the server-owned dungeon key count) both PASS every check. The defects above are outside those lanes.
