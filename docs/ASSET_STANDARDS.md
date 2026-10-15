# Asset production standards

How a world sprite, tile or icon is made so that it lands in the game without a second pass. The look is `ART_DIRECTION.md`; generation is `PIXELLAB_WORKFLOW.md`; the registry of what exists and what happens to it is `ASSET_MANIFEST.md` §World atlas registry. Every number here is enforced by code or measured; where a rule is new it says **(new)** and names who wires it.

## 1. Sizes
| Thing | Canvas | Body (measured mass) | Source of truth |
|---|---|---|---|
| Terrain tile | 32×32, fully opaque | | `T` in `src/data/world/art-budget.js` |
| Character (hero, NPC, peers, humanoid monsters) | 64×64 frame, anchor (32, 58) | 36–40 px tall | `CLASSES.character` |
| Critter / flier | 48×48, anchor (24, 40) / (24, 44) | 12–20 px | `CLASSES.critter`, `flier` |
| Beast | 64×64, anchor (32, 56) | 40–48 px wide | `CLASSES.beast` |
| Props | per class (box, barrel, bulky, fixture, tree…) | per class | `CLASSES` |
| Wall slice | 32×60 (face 48, cap 8–12), cycled every 32 px | | `CLASSES.wall` |
| Item icon | 32×32 square, transparent | mass fills 75–94% **(new floor; today 59–94%)** | `assets/icons-bundle/pixel/items/<id>.png` |
| HUD 9-slice | 12×12 slice 4 (windows), 6×6 slice 2 (widgets) | | `prototypes/world-shell/samples/make-frames.mjs` until the cutover |

A new kind of sprite gets a class row in `art-budget.js` before its first asset. No class is ever stretched to fit a sprite.

## 2. Sheets, layout and naming
- **Source:** `art/world/<set>/<id>.png` (curated, aligned, un-locked frames) + `art/world/<set>/<id>.json` (the sidecar: `id, class, material, source, anchor_px, footprint, overhang_px, anims, pixellab, notes`). The source sheet has one row per (anim, facing), anims in sidecar order, frames left to right at the frame size.
- **Facings order:** `s, e, n, w, se, ne, nw, sw` (`DIRS`); a sheet has rows only for the facings its sidecar declares. Every clip has the four cardinals; a character may add the diagonals (the hero's idle and walk have them since R2), and the renderer falls back to the nearest cardinal for a missing diagonal (`src/world/core/facing.js`).
- **Sets:** one atlas per place (`hero`, `town`, `home`, `cellar`); a new hunting ground gets its own set. Shared actors live in `hero` (or a future `monsters` set when two grounds share a monster).
- **Ids:** `snake_case`, equal to the data id (`rat` is `MONSTERS.rat`, an item icon is its `ITEMS` key). Variants are suffixes (`barrel_old`, `stone_wall_arch`), never numbers.
- **Clip names:** `idle, walk, attack, hit, death, corpse` (monsters), `idle, walk, attack, down` (+ `hit` new) for characters, `face` for wall slices, `slice` for roofs.

## 3. Alignment and anchors
- The anchor is the contact point: the frame is drawn at `(tileX·T + T·fw/2 − anchor.x, tileY·T + T·fh − 1 − anchor.y)`. Placement is whole tiles; there is no per-sprite offset.
- Every frame of every clip is seated on its own feet (or base) row; nothing sits below the anchor except a declared `overhang`. Fliers hover `hover_px` above it.
- Contact rules per class (`unit, solid, legged, post, touch, flier, wall, flat, raised`) are measured by `tests/world-assets.mjs`; read its message before moving pixels.
- Attack clips declare a `hit` frame index; effects key off it.

## 4. Palette lock and export
- Generate in colour, then lock: `tools/world-art/lock.mjs` grades by material class (`GRADE` in `src/data/world/palette.js`) and snaps every pixel to `hr-world-56-v2` in Lab with lightness weighted 1.3. Alpha is cut at 128: **no partial alpha, no baked shadows, no anti-aliased edges**.
- A new colour is a palette change (`art/world/palette.json`, a new ramp, never a single stray colour), which re-locks every atlas: Art Director decides, Asset Director lands it with a full rebuild. Pending: the two-colour **arcane** ramp for the epic rarity (`ART_DIRECTION.md` §8).
- Export PNG RGBA, no colour profile, no metadata beyond what `encodePNG` writes. Never hand-edit `assets/world/*`; they are built.

## 5. Build and check
```
node tools/world-art/build.mjs --set <set>     lock, validate, pack, write the atlas + manifest
node tools/world-art/build.mjs --report        what each sprite measures; writes nothing
node tests/world-assets.mjs                    the budget, palette, alpha, anchor and contact rules
node tools/world-art/build.mjs --check         the committed atlas equals a rebuild (drift)
```
Then look at it in the game at ×2 (the prototype's hunt or town scene) and, for anything that stands on a dark floor, in `prototypes/world-shell/samples/readability.html` (the 3:1 body-edge rule, `ART_DIRECTION.md` §4). **(new)** That rule becomes a `tests/world-assets.mjs` check per ground (Asset Director, ART_ROADMAP NOW-5).

## 6. Performance budget
| Budget | Limit | Today |
|---|---|---|
| Atlas size | ≤ 2048×2048 (`ATLAS_MAX`) | hero 1024×520, cellar 1024×804, town 512×428, home 512×164 |
| Atlases resident in one scene | ≤ 3 (hero + place + one shared) | 2 |
| Hero with 8 facings | about 1024×1040 (4 clips × 8 facings × ≤8 frames at 65 px pitch) | fits |
| Animated sprites on screen | ≤ 40 actors + 20 animated props at 60 fps on a mid phone | not yet measured: measure on the first route ground |
| Screen-resolution overlays | the fatigue budget (`ART_DIRECTION.md` §11): ≤ 8 floats, ≤ 6 bags, 1 light column | |
| Item icons | one 32×32 PNG each, loaded on demand | 506 files |

## 7. Acceptance checklist for any new or edited world asset
1. Class row exists; `build.mjs` writes it with no finding; `tests/world-assets.mjs` exit 0.
2. Seen at ×2 in its scene, beside the hero, screenshot read.
3. Dark grounds: body edge ≥ 3:1 to the floor median (readability page or the guard).
4. Every clip: identity stable across frames, seated on the anchor row, `hit` declared for attacks.
5. Sidecar `pixellab` block filled (tool, id, request, groups) and a registry row updated (decision, approval).
