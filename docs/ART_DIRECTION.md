# Art Direction: the measured spec and the bible

Read this before touching any sprite, icon, tile, effect, CSS or screen layout. **Law** = enforced or to be enforced. **Mixed** = drifts today and is converged as each screen is touched. **Decided** = an Art Director call (art sign-off is delegated, 2026-10-14); Tyler may overrule it. The facts were measured on b584 (2026-10-14 audit) and on the world-shell prototype (2026-10-15, `docs/design/ART_AUDIT_2026-10-15.md`), not invented. Design intent lives in `DESIGN_STANDARDS.md`; the done gate is `QUALITY_CHECKLIST.md`; the layout is `docs/design/WORLD_SHELL.md`. How assets are made: `docs/ASSET_STANDARDS.md` (sizes, sheets, anchors, export, budget) and `docs/PIXELLAB_WORKFLOW.md` (generation). The work plan: `docs/design/ART_ROADMAP.md`.

## 1. Identity and the look
**Hearthrise is a real fantasy MMORPG world that happens to play as an idle game.** Dark fantasy adventure with a warm medieval heart: towns are cozy and safe, hunting grounds are dangerous and atmospheric, and combat is satisfying to watch for hours without tiring the eye. Tibia and Huntera are inspiration for mechanics only; nothing of their look is copied.
- The world carries the identity; the chrome stays quiet. Hearthlight (dark) is the only theme: charcoal surfaces, restrained gold ("Charcoal & Gold", the Forge & Stone look).
- The world is a 3/4 top-down pixel world lit from the upper left. No emoji as art anywhere (icons come from the atlas in `src/data/glyphs.js` or the pixel item set). Containment is earned: no wall of cards (the b217 rule).
- The test for every screen: would a player screenshot it to show a friend the *world*? If the first thing they see is a panel, the panel is too loud.

## 2. Pixel world (law; the code is the spec)
- **Grid:** T = 32 art px per tile. Sprite frames are 64×64 with an anchor. Body sizes per sprite class are in `src/data/world/art-budget.js`, enforced by `tests/world-assets.mjs`. Add a class row there before adding a new kind of sprite.
- **One density:** every art pixel is 2×2 device px (×2) on desktop and phone, ×3 only above about 2400 device px wide (WORLD_SHELL §1). World, item icons, the gear figure, pixel frames and the cursor all share it. Whole-number zoom only (`src/world/core/camera.js`), `imageSmoothingEnabled=false`, the canvas `pixelated`.
- **Palette:** every opaque world pixel is in `hr-world-56-v2` (`art/world/palette.json`, 56 colours in 18 material ramps). Sprites are graded once per material (`src/data/world/palette.js`) and snapped. Runtime lighting is the only colour change: **no per-sprite tint**, which also rules out a white hit-flash.
- **Light:** upper-left. Cast shadows fall down-right (`src/world/core/shadows.js`, shear .5/.22). Lighting is 4 stepped bands, vignette outdoors. Shadows are never painted into the art.
- **Perspective:** 3/4 top-down ("high top-down" in PixelLab terms) for every world sprite. Never side-on or isometric.
- Screen-resolution marks (nameplates, bars, floats, the target ring) are drawn by the engine at screen resolution and scale with the zoom (`canvas-backend.js overlay()`).

## 3. Town and hunting ground: mood, palette and light (decided)
| | Town and home (safe) | Hunting grounds (danger) |
|---|---|---|
| Feeling | warm, lived-in, busy | close, quiet, watched |
| Ambient light | day `--world-light-day` (white); dusk and night are later | dim: the cellar is `--world-light-cellar` (#8f8f8f, ×0.56) |
| Point lights | many and warm: lamps, windows, hearths, the forge | few and purposeful: a torch marks a path, a brazier a fight pocket |
| Saturation | the palette grades as shipped; warm accents allowed (cloth reds, flowers, torch) on at most ~10% of the screen | ground and walls desaturated (terrain grade .7); the most saturated thing on screen is a monster's signature colour or loot |
| Motion | something always moves: smoke, the waterwheel, NPC idles, birds | little moves but the monsters; light flickers |
| Framing | the square is enclosed by buildings, fences or hedges; roads lead out | edges are walls, darkness or the vignette; the route leads in |

- **Local light only.** Every light has a visible source (a torch sprite, a window). No bloom, no blurred glow, no lens effects; light is added in the stepped bands. **A light never darkens or hides an actor:** an actor in a dark ground keeps the hero's own faint light (`--world-light-hero`).
- **Time of day** (later): four ambient states for the town on the server clock; hunting grounds have none.
- **UI colour never borrows world accents** except the rarity ladder (§8), which is deliberately the same in both.

## 4. Silhouette, outline and readability (law for new art; the shipped monsters fail it today)
- **Proportions:** the hero's body is 36–40 art px (about 1.2 tiles); critters 12–20, beasts 40–48, a door 48, trees 96–128 (`art-budget.js`). A monster's size class says how dangerous it reads; a boss is never drawn in a critter frame.
- **Outline:** one dark outline on every world sprite (`single color black outline` at generation), but on a dark ground **the outline is not the silhouette.** Readability is measured **inside** the outline: the ring of body pixels just inside it must reach **3:1 against the floor's median luminance** at that ground's ambient light. Measured today: the Giant Rat 2.36:1, the Slime 2.59:1, the loot bag 1.06:1, the Hive Wasp 4.67:1; the rat's outline itself is 1.17:1, invisible (`prototypes/world-shell/samples/readability.html`).
- **How to pass without over-saturating:** lift the body one value step (one step up its ramp, never a hue jump), and give the outline pixels that face the light (up and left) a lit-rim colour. Saturation is not the tool: a brighter-coloured rat is still a dark rat.
- **Signature:** each monster family owns one accent hue (venom green, frost blue, ember orange) used on at most 15% of its pixels, so families read at a glance and grounds keep one mood.
- **Clutter:** props sit at least one value step below actors; nothing on the floor is brighter than the dimmest actor body.

## 5. Tiles and transitions (decided)
- Terrain is `wang16` corner tiles for every pair of materials that touch, or a `fill` with a variant cycle of at least 4×2 tiles (`art-budget.js`). **Two fills never meet on a hard seam.**
- **Wear is authored, not tiled:** decals (cracks, moss, puddles, straw, scattered grain) at least one per 12 floor tiles, never on a grid, never two of the same in a row.
- **Edges are framed:** a road ends in an edging (kerb stones, a grass transition); a room's floor meets its wall on a one-tile darker skirting (a contact strip decal).
- Walls are wall-class slices (32×60, a 48 px face and a cap) cycled every 32 px; a wall run of more than 6 tiles needs a feature (a door, a torch, a support post, a broken stone).

## 6. The animation standard (decided)
| Clip | Hero and humanoids | Monsters | Notes |
|---|---|---|---|
| Facings | **8** (s, se, e, ne, n, nw, w, sw) | **2** (e and w; w may mirror e only if the creature has no handedness) | the engine paths in 8 directions (`path.js`), so a 4-facing hero slides on every diagonal; monsters keep a side (`choreo.js sideOf`) |
| idle | 4–6 frames at 5 fps, loop | 4 frames at 5 fps, loop | nothing alive is a still frame (today every monster and NPC idle is 1 frame) |
| walk | 8 frames at 10 fps; **both feet lift**, contact poses at frames 0 and 4 on opposite feet | 6 frames at 8–10 fps | the hero's south walk lifts only the left foot today |
| attack | 6–7 frames at 12 fps with a declared `hit` frame; the clip ends within `ACT_MS` (600 ms) | the same | impact effects fire on the `hit` frame, never on a timer |
| hit | 3–5 frames at 12 fps, a 1-art-px recoil away from the blow | 5 frames at 12 fps | the hero has no hit clip today |
| death / down | 6–7 frames at 8–10 fps, held on the last frame | the same; the last frame is the corpse | a corpse must read as dead at ×2: lying flat, legs out |
| props | torch and brazier 4 frames at 8 fps; the waterwheel 8 at 6 fps; smoke 6 at 6 fps | | flames are the cheapest life a scene can get |

Every clip keeps the reference identity: no gear appearing or disappearing between frames (the shield lesson, `art/world/hero/hero.json` notes), every frame seated on the anchor row.

## 7. Icons (mixed: converge on this)
- **Three icon languages exist today:** 32 px pixel items (`assets/icons-bundle/pixel/items`, 506, the active item set), painted 128/256 px art (`hearthfire/`, `painted/`), and white line glyphs (launchers, the doll's empty slots). Pixel is the target language for anything that is an object in the world; line glyphs stay for UI controls only.
- A pixel icon renders at the screen's one density only (32 → 64 at ×2), never 57 or 49. Painted art never renders above its source size. One screen uses one language for the same kind of thing.
- Measured on the 506 pixel items: all 32×32, every one dark-outlined, the mass fills 59–94% of the canvas (median 88%). **New icons fill 75–94%**; a flat item (a fish, a bar) is drawn on the diagonal so it does not read small.

## 8. Rarity and rewards (decided)
| Rarity | Colour (world palette) | Rank pips | Reward presentation |
|---|---|---|---|
| Common | stone `#aaa49a` | 0 | log line only |
| Uncommon | leaf `#73944c` | 1 | log line in colour; the bag's ground mark tinted |
| Rare | frost `#4fa8e8` | 2 | light column + name for 4 s + HUD toast |
| Epic | arcane `#9b72d0` (**new ramp**, Asset Director) | 3 | as rare, plus a sound when audio exists |
| Legendary | torch `#f2a03a` | 4 | the spoils reveal (`spoils.css`) |
| Mythic / unique | blood `#c23a2a` / gold `#e8c547` | 5 | the reveal, a clan broadcast and a shareable card (super-rare drops) |

- The colours become `--rar-*` tokens in `tokens.css` at the cutover (`samples/samples.css` holds the proposal). They are world colours so the light column in the world and the slot border in the bag match.
- **Colour is never the only cue:** equipment slots carry rank pips and a 2 px border; mythic adds a double border. Selection is a neutral `--ink` outline, because gold is the primary action and legendary is orange.
- **Kinds read from the pocket:** equipment is framed in its rarity, a consumable shows its count and bar key, a quest or key item sits on parchment with a seal and never shows a price, a material is a plain pocket (`samples/slots.html`).
- Drop odds shown to a player come from the server's catalogue, never from a client constant.

## 9. UI chrome (law for colour/radius/shadow; decided for the frame)
| Area | Rule | Today |
|---|---|---|
| Colour | tokens only, from `src/styles/tokens.css` (the single source, `tests/token-single-source.mjs`) | 1,708 CSS + 453 JS literals; the ratchet only goes down |
| Frame | **FORGED STEEL** (Tyler approved 2026-10-24; skin 1 of `art/review/ui-skins-2026-10-24/`): every window a thin 6-art-px steel frame with a square stud in each corner (`assets/ui/steel-frame.png`), popups, menus and phone dialogs the 3-art-px thin steel (`steel-frame-thin.png`), all drawn by `tools/make-ui-steel-art.mjs` (`--check`); a dark title band ruled in dim gold; section heads with a dim gold rule running right; the picked row lifted, outlined in gold, a gold bar at its left; fields sunk one art px; the one primary a raised gold plate (`gold-plate.png`). No rivets on panels, no gilded caps, no nameplates. Fills fade with the Window opacity setting (`--panel-alpha`, 60-100%); frames, rules, gold and text never fade. Bars and slots are sunk, never framed | windows done 2026-10-24; HUD panels done the same day (the THIN frame, the HUD plate at the opacity, no grain, Cinzel names: read-only panels stay the quiet member); the account screens and the action bar follow |
| Radius | 0 on framed boxes; `--r-sm 2px`, `--r 3px`, `--r-lg 5px` elsewhere. No pills except true toggles; 50% only for portraits and pips | 6 and 8 px literals dominate; 40 pills |
| Borders | `1px solid var(--line-soft)` only where a box means something | 126 of 174 boxes bordered on the Bag |
| Shadow / glow | depth for overlays and dialogs only; no 0-offset glow as decoration | 215 box-shadows, 81 glows |
| Gradients | none on controls; allowed in painted art and scene backdrops | 328 linear, 36 radial |
| Primary action | one per view | 8 gold primaries on Combat |

**The "feels off" A/B, decided (shots: `prototypes/world-shell/shots/phase2/ab-*.png`).** The hunt screen was rendered at ×2 three ways: A today's flat glass, B a pixel 9-slice drawn in the world's iron ramp (`samples/chrome-ab.css`, `make-frames.mjs`), C a pixel HUD font (Pixelify Sans, OFL). **B wins, with the type of A.**
- **Why B:** a rounded 5 px corner and a smooth hairline are web marks sitting on pixel stone. An iron frame in palette colours, lit from the upper left, makes the HUD part of the world's material. On the phone the 2-art-px HUD frame costs 8 px a widget, not 16.
- **Why not C:** Pixelify Sans at the 14.5 px floor falls between its pixel grid, so stems double and small caps are lost. A pixel face is only crisp at whole multiples of its grid, which fights the type scale and Tyler's one-text-style ruling.
- **Later, optional:** a bitmap numeral set drawn at ×2 for the world floats only, if playtests ask for it.

## 10. Typography (law)
- **A characterful heading over a readable body (Forged Steel, Tyler approved 2026-10-24; amends the 10-15 one-style rule).** Window titles, section heads, place names (a ground's page) and the one primary's word are `--f-display` (Cinzel, bold, letter-spaced, gold). Body is `--f-ui` (Alegreya Sans) at `--t-micro`/`--t-small`, with `--ink-2` labels and bold `--ink` tabular values; red/green only for cost/gain. Small labels inside a panel (an analyzer's column, a tooltip's "Comes from") stay `--f-label`.
- **Cinzel is for names and heads, never for body text or numbers.** The logo, place names, window titles, section heads and primary buttons; nothing a player reads as a sentence.
- No Inter, no monospace, no pixel font (§9). Floor 14.5 px everywhere, the phone included. Size scale `--t-micro 14.5` … `--t-h1 31` (× `--ui-scale`).
- World plates and floats use `--f-ui` 700/800 with a `--world-plate-line` stroke, at screen resolution.

## 11. Combat feedback and the fatigue budget (decided; `samples/combat.html`)
A hunt runs for hours. Every effect must read on the first hit and still be bearable on the ten-thousandth.
- **Target:** a ground ring under the foe's feet (1 art px, `--world-target`), drawn beneath the sprite; never a box over it. It fades over 300 ms on death.
- **Floats:** one number per event, starting above the name plate and rising 12 art px over 1 s (`FLOAT_MS`). Hit 16 px white; **crit 22 px gold** (1.35×, a 120 ms scale pop 1.0 → 1.2 → 1.0; today a crit is the same size as a hit); heal 16 px green with a "+"; hurt 16 px red on the hero; miss 14 px grey. Two floats never overlap: the next one stacks above.
- **Hit reaction:** the target's hit clip and a 1-art-px recoil. No tint, no flash (§2).
- **Death:** the death clip; bar and ring fade over 300 ms; the corpse stays 2.6 s (`CORPSE_MS`) then fades.
- **Loot pop:** the bag hops out **beside** the body in a 3-frame arc, never onto it (today it lands on the corpse and vanishes), and gets a 1-art-px ground mark in `--ink-3`, or its rarity colour from uncommon up. Common loot shows no world text.
- **Rare drop:** a stepped light column in the rarity colour (three bands, no bloom), the item name for 4 s, and a HUD toast (top centre, 4 s, never modal). Legendary and above use the spoils reveal.
- **Names:** your target's plate, elites and bosses, and other players. A bystander monster shows its name on hover only; your own name is hidden in a hunt (your bar is enough).
- **Budget:** at most 3 floats per actor and 8 on screen; at most one light column at a time; at most 6 bags (`BAGS_MAX`); an impact spark of at most 4 pixels for 150 ms. **No screen shake on routine hits**: shake is for a boss slam or the hero's knockout only, 2 art px for 150 ms, and off under reduced motion. No full-screen flashes.

## 12. Screens are purpose-built
Each major window has a fantasy object behind it, and its layout comes from that object, not from a card grid: the Bag is a satchel (a paper doll with a body silhouette beside it), the Bestiary an encyclopedia, the Hunt board a map or notice board, the Farm soil plots from the world's tiles, the House rooms in the world's style, the Market a stall ledger. They share tokens, type, the frame, one primary action and the icon rules; they never share the same tile grid.

## 13. Audio
None exists (only a `settings.sfx` flag). When it is added, it is one coherent set, chosen and approved as a sample first: impact, crit, kill, loot, rare loot, and one ambience per region. Sound follows the same fatigue budget: a routine hit is the quietest sound in the game.
