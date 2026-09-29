# Visual pass 11 — set/b561 @ f0a2846

Rendered `f0a2846` (merge: lane/b561-toast-replay-pacing; history holds plant-all-pending 34543b1 and elemental-name cdaf131).
Headless Chromium 1194, harness flag on, FTUE dismissed, `#notifs` emptied before every shot. Supabase unreachable (sandbox).
Fonts: `fallback` = CDN blocked (OS faces); `cinzel` = Google Fonts woff2 injected, verified rendering (Cinzel + Alegreya Sans width-probe true).
Viewports 1280x800 and 922x423. Rects are `x,y,w,h → r,b` in CSS px.

## Findings

| # | Check | fallback 1280 | fallback 922 | cinzel 1280 | cinzel 922 |
|---|---|---|---|---|---|
| T1 | Replay: max visible toasts, first 3 s | 1 PASS | 1 PASS | 1 PASS | 1 PASS |
| T2 | Replay: max visible toasts, whole replay (~17 s, 4 × 4 s dwell) | 1 PASS | 1 PASS | 1 PASS | 1 PASS |
| T3 | Replay order one→four | PASS | PASS | PASS | PASS |
| T4 | Resting replay toast vs `.hd-cta` | 1041,654,240×45 — no hit PASS | 538,366,240×45 → 777,411 — no hit PASS | 1101,654,178×45 — no hit PASS | 627,366,178×45 → 805,411 — no hit PASS |
| T5 | Plain toast (no sheet) vs `.hd-cta` | 888,631,380×68 PASS | 478,320,280×91 → 758,411 PASS | 895,654,373×45 PASS | 504,343,280×68 → 784,411 PASS |
| F1 | Unstated bag: Plant all | "Plant all", disabled, `.bal-pending`, `data-pending=seeds`, title "Plant all · counting your seeds…" PASS | same PASS | same PASS | same PASS |
| F2 | Forced `plantAllEmpty()` | returns 0, 0 intents (FarmSync + fetch spied), toast "The realm is counting your seeds… try again in a moment" PASS | same PASS | same PASS | same PASS |
| F3 | Stated `{turnip_seed:10}` | "Plant all (2)" enabled PASS | same PASS | same PASS | same PASS |
| F4 | Crops rows vs FABs (1280) | max row content right 1210; Carrot row 178,566,1038×105 → 1216; `#hr-bug-btn` 1233,709,35×29; chat button left ≈1219 — no hit PASS | n/a (bug btn is the rail foot at 0,379) PASS | same as fallback PASS | PASS |
| D1 | Pending label text / lines | "Counting keys…", 1 line PASS | PASS | PASS | PASS |
| D2 | Pending height vs stated (±2 px) | 38.1 vs 55.2 **FAIL** (stated wraps, see defect 2) | 44 vs 44 PASS | 38.1 vs 55.2 **FAIL** | 44 vs 44 PASS |
| D3 | Pending buttons inside the card foot | spill 0 PASS | 0 PASS | **spill 35 px on every card FAIL** (defect 1) | 0 PASS |
| D4 | Entry line "Entry: 1× Bone Key (have —)" ≤ 2 lines | 1 line PASS | 1 PASS | 1 PASS | 1 PASS |
| M1 | `#fs-title` Fire Elemental | "Fire Elemental · Tier 1" no dup PASS | PASS | PASS | PASS |
| M2 | `#fs-title` Slime (control) | "Slime · Vermin · Tier 1" PASS | PASS | PASS | PASS |
| M3 | War Table row | "Fire Elemental · weak to magic" / "Slime · Vermin · weak to hammer" PASS | PASS | PASS | PASS |
| M4 | Loot preview subtitle | "Tier 1" / "Tier 1 · Vermin" PASS | PASS | PASS | PASS |
| M5 | Foe card swing line under the name | **"Elemental · 2.40s" under "Fire Elemental" FAIL** (defect 3) | FAIL | FAIL | FAIL |

`/\b(\w+)\s+\1\b/i` matched nothing in any string. M5 is not an adjacent duplicate, but it prints the family word beside a name that already ends with it — the FOE-NAME-1 ruling.

## Defects (numbered)

1. **Pending dungeon buttons overflow the card at 1280x800 with the real fonts.** `dungeons-pending-labels-cinzel-1280x800.png`. Each "Counting keys…" button is 177 px wide (Cinzel caps); two plus the gap end 35 px past `.dgn-foot` on all six cards. Crypt of Bones: card 180→535, foot right 520, buttons 195–372 and 378–**555**. Haunted Archive: second button 1113–**1290**, past the 1280 viewport. Labels read "COUNTING KEYS…" / clipped at the card edge. Fallback fonts fit exactly (160 px, spill 0), so the b561 short-label fix only holds for the OS face.
2. **Stated dungeon buttons wrap to two lines at 1280x800, so pending (1 line, 38.1 px) ≠ stated (2 lines, 55.2 px).** `dungeons-stated-labels-{fallback,cinzel}-1280x800.png`. Crypt of Bones with `{bone_key:2}`: "Manual / Run" 364,564,82×55 and "Auto- / Run" 452,564,68×55 (fallback); cinzel 328,566,100×55 / 434,566,86×55. The entry line beside them is also squeezed to 2–3 lines ("Entry: 1× Bone Key / (have 2)"). At 922x423 both states are 44 px, one line.
3. **Foe card swing line repeats the family under a name that ends with it.** `fight-foe-meta-fire_elemental-*.png`: `#fs-foe-swing` = "Elemental · 2.40s" directly under "FIRE ELEMENTAL" (1280 cinzel: foe card ≈ 916–1214, y 437–513). Source: `src/features/combat-screens.js:1604` builds the label from `m.family` without `foeFamily()`. Control Slime prints "Vermin · 2.40s" (correct).

## Other things seen in the screenshots (not b561 regressions)

- O1 `farm-plantall-stated-*-1280x800.png`: Tomato and Emberfruit rows break as "Lv 40 · 8h grow · 2-3 yield ·" / **"perennial"** (rendered at the crop-name size, own line) / "(regrows ×4)". The `<b>perennial</b>` in `src/screens/farm.js:536` picks up the row's name style. Pre-existing (cc568f8).
- O2 `loot-preview-slime-*.png`: the drops sheet says "Slime fears no weapon, and an even matchup pays 15% better" while the Fight screen for the same foe says "Weak to 2H Hammer". Contradictory copy; not in the b561 diff.
- Sandbox, not defects: "realm is slow" pill (covers the gold chip's left edge), `—` in quest progress / plot tier / "have —", `0 / 0`-style foe placeholders, "Reconnecting…", Fight button styling while offline.

## Verdict

**RED — 3 defects:** (1) pending "Counting keys…" pair spills 35 px out of every dungeon card at 1280x800 with Cinzel (Haunted Archive to x=1290); (2) stated Manual/Auto-Run wrap to 2 lines at 1280x800, 55.2 px vs pending 38.1 px; (3) `#fs-foe-swing` prints "Elemental · 2.40s" under "Fire Elemental" (combat-screens.js:1604). Toasts, Plant all and the other foe-name surfaces PASS in both font sets at both sizes.
