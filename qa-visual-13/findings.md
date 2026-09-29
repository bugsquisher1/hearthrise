# Visual pass 13 — set/b561 @ c608502 (qa-engineer)

Rendered `c608502` (merge: lane/b561-autoeat-chip-truth; history holds 0635ccd merge: lane/b561-dungeon-copy-polish).
Headless Chromium 1194, `window.__HR_TEST_HARNESS__=true`, `bootPage()`/`serve()` from tests/visual-qa.mjs, FTUE dismissed, `#notifs` cleared before each shot.
Fonts: `-fallback` = Google Fonts CDN blocked (no webface loaded); `-cinzel` = Cinzel / Alegreya Sans / Alegreya Sans SC mirrored locally from Google Fonts (document.fonts reports all three loaded).
Fight fixture: auto_eat trait owned, cooked_shrimp 100000, slime fight live, server belief driven through `HearthriseAccrual.serverAutoEatSettings` with the mirror + sync unparked (the AUTOEAT-CHIP-1 aeRig shape).
Dungeons fixture: combat level 99, cooldowns cleared, `applyEnvelopeState(G,{state:{},inventory:{}})` (stated empty bag). Expected article derived from `window.DUNGEONS[*].cost.key` → `ITEMS[key].n`.
Card for the fight check = `.combat-arena` (the bar's card ancestor); bar = `#arena-act-player`.

## Verdict: GREEN — 16/16 fight rows (32 button rects) and 24/24 dungeon rows PASS. No blocking defects.

## Fight — auto-eat chip (4 states × 2 fonts × 2 sizes)
| fonts | vp | state | chip text | .bal-pending | bar scrollW/clientW | Eat rect (l,t,r,b) | chip rect | in card (.combat-arena) | verdict |
|---|---|---|---|---|---|---|---|---|---|
| fallback | 1280x800 | a-bestinbag | Auto-eat: best in bag ▾ | false | 415/415 | 441,571,642,621 | 648,571,856,621 | true | PASS |
| fallback | 1280x800 | b-shrimp | Auto-eat: Cooked Shrimp ▾ | false | 447/447 | 441,571,642,621 | 648,571,888,621 | true | PASS |
| fallback | 1280x800 | c-off | Auto-eat: Off ▾ | false | 348/348 | 441,571,642,621 | 648,571,789,621 | true | PASS |
| fallback | 1280x800 | d-pending | Auto-eat: counting… ▾ | true | 415/415 | 441,571,642,621 | 648,571,856,621 | true | PASS |
| fallback | 922x423 | a-bestinbag | Auto-eat: best in bag ▾ | false | 320/320 | 255,319,446,363 | 452,319,575,363 | true | PASS |
| fallback | 922x423 | b-shrimp | Auto-eat: Cooked Shrimp ▾ | false | 351/351 | 255,319,446,363 | 452,319,606,363 | true | PASS |
| fallback | 922x423 | c-off | Auto-eat: Off ▾ | false | 292/292 | 255,319,446,363 | 452,319,547,363 | true | PASS |
| fallback | 922x423 | d-pending | Auto-eat: counting… ▾ | true | 320/320 | 255,319,446,363 | 452,319,575,363 | true | PASS |
| cinzel | 1280x800 | a-bestinbag | Auto-eat: best in bag ▾ | false | 310/310 | 441,571,591,621 | 597,571,751,621 | true | PASS |
| cinzel | 1280x800 | b-shrimp | Auto-eat: Cooked Shrimp ▾ | false | 336/336 | 441,571,591,621 | 597,571,777,621 | true | PASS |
| cinzel | 1280x800 | c-off | Auto-eat: Off ▾ | false | 266/266 | 441,571,591,621 | 597,571,707,621 | true | PASS |
| cinzel | 1280x800 | d-pending | Auto-eat: counting… ▾ | true | 314/314 | 441,571,591,621 | 597,571,755,621 | true | PASS |
| cinzel | 922x423 | a-bestinbag | Auto-eat: best in bag ▾ | false | 237/237 | 255,319,395,363 | 401,319,492,363 | true | PASS |
| cinzel | 922x423 | b-shrimp | Auto-eat: Cooked Shrimp ▾ | false | 262/262 | 255,319,395,363 | 401,319,517,363 | true | PASS |
| cinzel | 922x423 | c-off | Auto-eat: Off ▾ | false | 219/219 | 255,319,395,363 | 401,319,474,363 | true | PASS |
| cinzel | 922x423 | d-pending | Auto-eat: counting… ▾ | true | 240/240 | 255,319,395,363 | 401,319,495,363 | true | PASS |

## Dungeons — stated empty bag (6 keyed cards × 2 fonts × 2 sizes)
| fonts | vp | dungeon | button text | expected | disabled | in card | boss line boxes | name line boxes | name rect | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| fallback | 1280x800 | Crypt of Bones | Need a Bone Key | Need a Bone Key | true | true | 2 | 1 | 294,287,410,303 | PASS |
| fallback | 1280x800 | Goblin Warcamp | Need a Goblin Seal | Need a Goblin Seal | true | true | 1 | 1 | 662,265,723,281 | PASS |
| fallback | 1280x800 | Haunted Archive | Need an Arcane Tome | Need an Arcane Tome | true | true | 2 | 1 | 1029,265,1146,281 | PASS |
| fallback | 1280x800 | Obsidian Keep | Need an Obsidian Sigil | Need an Obsidian Sigil | true | true | 2 | 1 | 294,766,396,782 | PASS |
| fallback | 1280x800 | The Voidbringer | Need a Void Fragment | Need a Void Fragment | true | true | 1 | 1 | 662,788,745,804 | PASS |
| fallback | 1280x800 | Ancient Wyrm | Need a Dragonsbane Key | Need a Dragonsbane Key | true | true | 2 | 1 | 294,1327,472,1343 | PASS |
| fallback | 922x423 | Crypt of Bones | Need a Bone Key | Need a Bone Key | true | true | 1 | 1 | 190,204,306,220 | PASS |
| fallback | 922x423 | Goblin Warcamp | Need a Goblin Seal | Need a Goblin Seal | true | true | 1 | 1 | 190,533,252,549 | PASS |
| fallback | 922x423 | Haunted Archive | Need an Arcane Tome | Need an Arcane Tome | true | true | 1 | 1 | 190,864,307,880 | PASS |
| fallback | 922x423 | Obsidian Keep | Need an Obsidian Sigil | Need an Obsidian Sigil | true | true | 1 | 1 | 190,1241,292,1257 | PASS |
| fallback | 922x423 | The Voidbringer | Need a Void Fragment | Need a Void Fragment | true | true | 1 | 1 | 190,1572,274,1588 | PASS |
| fallback | 922x423 | Ancient Wyrm | Need a Dragonsbane Key | Need a Dragonsbane Key | true | true | 1 | 1 | 190,2007,368,2023 | PASS |
| cinzel | 1280x800 | Crypt of Bones | Need a Bone Key | Need a Bone Key | true | true | 1 | 1 | 272,286,414,305 | PASS |
| cinzel | 1280x800 | Goblin Warcamp | Need a Goblin Seal | Need a Goblin Seal | true | true | 1 | 1 | 640,264,716,283 | PASS |
| cinzel | 1280x800 | Haunted Archive | Need an Arcane Tome | Need an Arcane Tome | true | true | 1 | 1 | 1007,264,1155,283 | PASS |
| cinzel | 1280x800 | Obsidian Keep | Need an Obsidian Sigil | Need an Obsidian Sigil | true | true | 1 | 1 | 272,746,396,765 | PASS |
| cinzel | 1280x800 | The Voidbringer | Need a Void Fragment | Need a Void Fragment | true | true | 1 | 1 | 640,746,739,765 | PASS |
| cinzel | 1280x800 | Ancient Wyrm | Need a Dragonsbane Key | Need a Dragonsbane Key | true | true | 2 | 1 | 272,1243,499,1262 | PASS |
| cinzel | 922x423 | Crypt of Bones | Need a Bone Key | Need a Bone Key | true | true | 1 | 1 | 168,182,310,201 | PASS |
| cinzel | 922x423 | Goblin Warcamp | Need a Goblin Seal | Need a Goblin Seal | true | true | 1 | 1 | 168,512,245,531 | PASS |
| cinzel | 922x423 | Haunted Archive | Need an Arcane Tome | Need an Arcane Tome | true | true | 1 | 1 | 168,844,317,863 | PASS |
| cinzel | 922x423 | Obsidian Keep | Need an Obsidian Sigil | Need an Obsidian Sigil | true | true | 1 | 1 | 168,1222,292,1241 | PASS |
| cinzel | 922x423 | The Voidbringer | Need a Void Fragment | Need a Void Fragment | true | true | 1 | 1 | 168,1554,268,1573 | PASS |
| cinzel | 922x423 | Ancient Wyrm | Need a Dragonsbane Key | Need a Dragonsbane Key | true | true | 1 | 1 | 168,1968,395,1987 | PASS |
Boss phrases (`.dgn-boss-lead`, `b`, `.dgn-boss-weak`) are one line box each in every row; no name split. Two-line boss lines (fallback 1280: Marrow King, Pale Archivist, Ashen King; cinzel 1280: Elderscale) break after the `·`, between phrases.

## Global read of every PNG (non-blocking observations)
1. `fight-autoeat-*-*-*.png` — Eat button meta reads "+8 HP · 100000 left" (unformatted; the Provisions row on the same screen reads "100,000 held"). Source: `src/features/combat-render.js:257` prints `G.inventory[id]` raw. Copy nit, fixture-sized quantity; e.g. Eat rect 255,319,395,363 in `fight-autoeat-d-pending-cinzel-922x423.png`.
2. `fight-autoeat-d-pending-fallback-922x423.png` — a transient "Defeated Slime" kill banner (≈737,262,915,305) overlaps the "Weak to 2H Hammer · charm not counted yet" hint for the tick it shows. Live-tick artifact of the fixture (8 HP slime dies between shots), not a layout fault.
3. `fight-autoeat-*-fallback-922x423.png` — activity strip truncates to "Fightin…" in the fallback face only (Cinzel shows "Fighting Slime"). Pre-existing, fallback-only.
4. At 922x423 the chip wraps to two lines ("Auto-eat: / best in bag ▾", "counting… ▾") inside a 44px button; text stays inside (no scrollWidth overflow).
Sandbox-only (not defects): "The realm is slow" pill, `—` in quest progress, "Signed out"/"Reconnecting…", "away: counting…".

## PNGs
- dungeons-stated-zero-cinzel-1280x800.png
- dungeons-stated-zero-cinzel-922x423-end.png
- dungeons-stated-zero-cinzel-922x423.png
- dungeons-stated-zero-fallback-1280x800.png
- dungeons-stated-zero-fallback-922x423-end.png
- dungeons-stated-zero-fallback-922x423.png
- fight-autoeat-a-bestinbag-cinzel-1280x800.png
- fight-autoeat-a-bestinbag-cinzel-922x423.png
- fight-autoeat-a-bestinbag-fallback-1280x800.png
- fight-autoeat-a-bestinbag-fallback-922x423.png
- fight-autoeat-b-shrimp-cinzel-1280x800.png
- fight-autoeat-b-shrimp-cinzel-922x423.png
- fight-autoeat-b-shrimp-fallback-1280x800.png
- fight-autoeat-b-shrimp-fallback-922x423.png
- fight-autoeat-c-off-cinzel-1280x800.png
- fight-autoeat-c-off-cinzel-922x423.png
- fight-autoeat-c-off-fallback-1280x800.png
- fight-autoeat-c-off-fallback-922x423.png
- fight-autoeat-d-pending-cinzel-1280x800.png
- fight-autoeat-d-pending-cinzel-922x423.png
- fight-autoeat-d-pending-fallback-1280x800.png
- fight-autoeat-d-pending-fallback-922x423.png
- findings.md
