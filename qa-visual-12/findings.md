# Visual pass 12 — set/b561 @ 9eef831

Rendered `9eef831` (merge: lane/b561-vg11-fixes; history holds dcaf292 merge: lane/b561-foe-weakness-copy).
Headless Chromium 1194, harness flag on, FTUE dismissed, `#notifs` empty before every shot (one forced clear: cinzel-1280 fight-rat). Supabase unreachable (sandbox).
Fonts: `fallback` = every off-origin request aborted, width-probe Cinzel/Alegreya false; `cinzel` = Google Fonts woff2 (58 files) injected, width-probe true for all three faces.
Rects are `x,y,w,h → r,b` CSS px. Combat level forced to 99.

## 1. Dungeons — pending (unstated bag, `bone_key:3` in the display bag) vs stated (`applyEnvelopeState {bone_key:2}`)

| Check | fallback 1280 | fallback 922 | cinzel 1280 | cinzel 922 |
|---|---|---|---|---|
| D1 Every run button inside its card foot (6 cards × 2 states) | out 0 on all PASS | out 0 PASS | out 0 PASS | out 0 PASS |
| D2 Labels one line, no lone "·", no clip | all 1 line PASS | PASS | PASS | PASS |
| D3 Pending vs stated height (±2px) | 34.6 vs 34.6 PASS | 44 vs 44 PASS | 34.6 vs 34.6 PASS | 44 vs 44 PASS |
| D4 Entry line ≤ 2 lines | 1 line all cards PASS | 1 PASS | 1 PASS | 1 PASS |

Widest button vs foot (Crypt of Bones, the only card with two stated buttons):

| | foot | widest pending | widest stated |
|---|---|---|---|
| fallback 1280 | 195,489.2,325.3×70.4 → 520.3,559.7 | 195,525.1,159.7×34.6 → 354.7 | "Manual Run" 195,525.1,168.5×34.6 → 363.5 |
| fallback 922 | 91,316.1,804×79.4 → 895,395.5 | 91,351.5,399×44 → 490 | "Manual Run" 91,351.5,407.8×44 → 498.8 |
| cinzel 1280 | 195,489.2,325.3×71.4 → 520.3,560.7 | 195,526.1,159.7×34.6 → 354.7 | "Manual Run" 195,526.1,169.9×34.6 → 364.9 |
| cinzel 922 | 91,295,804×80.4 → 895,375.5 | 91,331.5,399×44 → 490 | "Manual Run" 91,331.5,409.2×44 → 500.2 |

Stated single-button cards ("Need a Goblin Seal" etc.) fill the foot exactly (325.3 / 804 wide), out 0. Pending: every card shows two "Counting keys…" buttons.

## 2. Fight foe card (`#fs-foe-swing`)

| Foe | all 4 renders | Check |
|---|---|---|
| Fire Elemental | "2.40s" (rect 915,389,300×13 at 1280; 605,190 at 922) | no family word, no leading "·" PASS |
| Slime | "Vermin · 2.40s" | PASS |
| Duplicate word `/\b(\w+)\s+\1\b/i` over title, swing, weak, fs-foe-*, table title/row, loot note, all foes, all renders | 0 hits | PASS |

Title lines: "Fire Elemental · Tier 1", "Slime · Vermin · Tier 1".

## 3. Foe weakness — Fight card / War Table / loot sheet (identical in all 4 renders)

| Foe | Fight `#fs-weak` | War Table card (`em` · `title`) / list row | Loot sheet note | Agree |
|---|---|---|---|---|
| Slime | "Weak to 2H Hammer · charm not counted yet" | "2H Hammer" · "Slime — weak to 2H Hammer · 8 HP" / "Slime Vermin · weak to 2H Hammer" | "Slime is weak to 2H Hammer; bringing one raises your damage and accuracy, not your drop rates. Its drops run 15% richer than most foes'." | PASS |
| Goblin | "Weak to 1H Sword · …" | "1H Sword" · "Goblin — weak to 1H Sword · 15 HP" / "Goblin Humanoid · weak to 1H Sword" | "Goblin is weak to 1H Sword; …" | PASS |
| Wild Boar | "Weak to Ranged · …" | "Ranged" · "Wild Boar — weak to Ranged · 13 HP" / "Wild Boar Mammal · weak to Ranged" | "Wild Boar is weak to Ranged; …" | PASS |
| Fire Elemental | "Weak to Magic · …" | "Magic" · "Fire Elemental — weak to Magic · 12 HP" / "Fire Elemental weak to Magic" | "Fire Elemental is weak to Magic; …" | PASS |
| *(none)* | — | — | — | **no real foe**: all 108 `window.MONSTERS` rows carry a `weaponWeak` (none `neutral`) |
| Giant Rat, `weaponWeak` set to `neutral` in-page (SYNTHETIC, no source edit) | "Fears no weapon · …" | "—" · "Giant Rat — fears no weapon · 9 HP" / "Giant Rat Vermin" | "Giant Rat fears no weapon." | PASS on words (see L1) |

## Global — read every screenshot

- G1 (pre-existing copy, `src/dungeons.js:529` `'Need a ' + keyName`): "**Need a Arcane Tome**" and "**Need a Obsidian Sigil**" on the stated run buttons. `dungeons-stated-*-1280x800.png` Haunted Archive 929.7,525.1,325.3×34.6; Obsidian Keep 195,1064 (below fold). Not in the b561 diff.
- G2 (pre-existing layout): at 1280 the boss line squeezes into three columns so "Final / boss:", "The Marrow / King", "weak to / hammer" each wrap to two lines (Crypt of Bones ≈195,285,325×42; Haunted Archive, Obsidian Keep, both fonts). Reads broken; at 922 it is one line. Not in the b561 diff.
- G3 (transient): the "Defeated <foe>" kill toast lands over the foe card's weakness line at 922 (`fight-foe-card-fire_elemental-fallback-922x423.png` ≈648,262,262×42 over `#fs-weak`) and over the War Table family tabs at 1280 (`foe-weakness-table-goblin-cinzel-1280x800.png` ≈1126,510,142×42 covering "Vermin"). Clears on its own.
- G4: at 922 the loot sheet is full-screen and the weakness note sits below the fold (`foe-weakness-loot-*-922x423.png`); text verified from the DOM, not visible in the PNG.
- L1 (latent, synthetic only): a foe with no weakness would show "—" as the War Table card's visible weakness text while its title says "fears no weapon", the list row drops the clause, and `#fs-foe-swing` swaps the family for "Foe" ("Foe · 2.40s"). No live foe hits this today.
- Sandbox, not defects: "realm is slow" pill over the gold chip, `—` in quest progress / "(have —)", "Reconnecting…", "away: counting…".

## Verdict

**GREEN** for the pass-12 checks: dungeon run pairs sit on one line inside every foot in both fonts at both sizes (pending = stated, 34.6 / 44 px), `#fs-foe-swing` reads "2.40s" for Fire Elemental and "Vermin · 2.40s" for Slime, and weakness copy agrees on all three surfaces for every foe checked. Pre-existing, outside b561: G1 "Need a Arcane Tome" article, G2 squeezed boss line at 1280.
