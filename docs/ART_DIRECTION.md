# Art Direction: the measured spec

Read this before touching any sprite, icon, tile, effect, CSS or screen layout. These facts were measured on b584 (2026-10-14 art-director audit; screenshots and metrics are in that session's scratchpad), not invented. **Law** = enforced or to be enforced. **Mixed** = drifts today and gets converged as each screen is touched. Design intent lives in `DESIGN_STANDARDS.md`; the done gate is `QUALITY_CHECKLIST.md`.

## 1. The look in one paragraph
Hearthlight (dark) is the only theme: charcoal surfaces, restrained gold, a medieval look we call "Forge & Stone". The world is a 3/4 top-down pixel town and hunt maps, lit from the upper-left. UI chrome stays quiet so the world and the art carry the identity. No emoji as art anywhere (icons come from the atlas in `src/data/glyphs.js`). Containment is earned: no wall of cards (the b217 rule).

## 2. Pixel world (law; the code is the spec)
- **Grid:** T = 32 art px per tile. Sprite frames are 64×64 with an anchor. Body sizes per sprite class are in `src/data/world/art-budget.js`, enforced by `tests/world-assets.mjs`. Add a class row there before adding a new kind of sprite.
- **Palette:** every opaque world pixel is in palette `hr-world-56-v2` (`art/world/palette.json`). Sprites are graded once per material (`src/data/world/palette.js`) and then snapped. Runtime lighting is the only colour change: no per-sprite tint.
- **Scale:** whole-number zoom only (`src/world/core/camera.js`). `imageSmoothingEnabled=false`, and the canvas is `pixelated`. Nameplates and damage floats draw at screen resolution.
- **Light:** upper-left. Cast shadows fall down-right (`src/world/core/shadows.js`, shear .5/.22). Lighting is in 4 stepped bands, with a vignette outdoors. Shadows are never painted into the art.
- **Perspective:** 3/4 top-down for every world sprite. Never mix in side-on or isometric art.

## 3. Icons (mixed: converge on this)
- **Today there are three icon languages:** 32 px pixel items (`assets/icons-bundle/pixel/items`, 506 of them), painted 128 px items and 256 px monsters/buildings (`hearthfire/`, `painted/`), and white line glyphs (event strip, paper doll, skills). This is the biggest consistency gap in the game.
- **Rule from now on:** a pixel icon renders at a whole-number multiple only (32 → 32/64/96), never 57 or 49. Painted art never renders above its source size, and never as a blurry upscale. One screen uses one icon language for the same kind of thing (a bag slot, the doll slot and a drop of the same item look alike).
- **Direction:** pixel art is the target language for items and monsters (it matches the world). Painted art stays for banners and portraits until it's replaced. New icons follow the world palette and light. Any canvas is square.

## 4. UI chrome
| Area | Rule | Today |
|---|---|---|
| Colour | tokens only, from `src/styles/tokens.css` (the single source, `tests/token-single-source.mjs`). Surfaces `--bg-0..3`, gold `--gold/-2/-3`, ink `--ink/-2/-3`, states red/green/gem/steel | 1,708 CSS + 453 JS literals; the ratchet only goes down |
| Radius | `--r-sm 2px`, `--r 3px`, `--r-lg 5px`. No pills except true toggles. 50% only for portraits/pips | 6 px and 8 px literals dominate; 40 pills |
| Borders | `1px solid var(--line-soft)`, only where a box means something (a slot, a selected item, a dialog) | 126 of 174 boxes bordered on the Bag |
| Shadow/glow | depth for overlays and dialogs only. No 0-offset glow as decoration | 215 box-shadows, 81 of them glows |
| Gradients | none on controls. Allowed in painted art and scene backdrops | 328 linear, 36 radial; gold gradient on every primary button |
| Primary action | one per view. Others are secondary or quiet | 8 gold primaries on Combat |

## 5. Typography
- Cinzel (display, small caps) + Alegreya Sans (body). Nothing else, so no Inter (`legacy.css:21` still imports it; remove it) and no monospace (27 uses).
- Size scale: `--t-micro 14.5`, `--t-small 16`, `--t-body 17`, `--t-h3 16.5`, `--t-lead 18.5`, `--t-h2 22.5`, `--t-num 27`, `--t-h1 31` (× `--ui-scale`). Use the tokens; only 244 of 990 sizes do today.
- Floor: 14.5 px everywhere, the phone included (holds today; keep it).

## 6. Screens are purpose-built
Each major screen has a fantasy object behind it, and its layout comes from that object, not from a card grid:
- **Bag:** a satchel grid, with a paper doll that has a body silhouette.
- **Bestiary:** an encyclopedia, with region chapters and a plate per creature.
- **Hunt board:** a map or notice board where the living hunt is visible.
- **Farm:** soil plots drawn from the world's tiles.
- **House:** rooms in the world's style.
- **Market:** a stall ledger.

What they share: tokens, type, one primary action and the icon rules. What they never share is the same tile grid.

## 7. Combat and loot feedback
- **Exists today:** canvas floats for hit, crit, kill, miss and hurt (`src/world/.../choreo.js`), canvas HP bars, corpses and loot bags, the rare spoils veil (`spoils.css`, `lucky-finds.css`). There is no MP bar, no screen shake and no hit-flash.
- **Rules:** a float shows one number per event and never overlaps (stagger or merge). A crit is bigger and gold, not a flash. A kill fades out the corpse and pops the loot. Rare loot gets the reveal. Nothing shakes on a routine hit.
- **Audio:** none exists (only a `settings.sfx` flag). When it's added, it's one coherent set, chosen and approved as a sample first: impact, crit, kill, loot, rare loot, and one ambience per region.
