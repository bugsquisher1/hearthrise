# Art roadmap and first-pass recommendations (Art Director, 2026-10-15)

From the audit (`ART_AUDIT_2026-10-15.md`) to work. The rules it builds to are `docs/ART_DIRECTION.md` (§ numbers below), `docs/ASSET_STANDARDS.md` and `docs/PIXELLAB_WORKFLOW.md`. **Scope deal:** this lane changed documents and prototype samples only; nothing in `src/`, `assets/` or `index.html`. Environment rework is planned now and built after Tyler's first playable test; the small character batch may go first because it hurts the first playable.

**When:** NOW = feeds the shell cutover or the B1 build · AFTER = after Tyler's first playable test · LATER. **Pri** maps to P0 blocks play · P1 the first playable test is hurt · P2 looks unfinished · P3 polish. **Who:** AD = the Art Director alone; otherwise the role named, and "Tyler" where his approval is needed. ★ = quick win (under a day, low risk).

## C. Roadmap
| ID | When | Pri | Item: exists → changes | Why (player) | System / tool | Who | Size, risk | Verified by |
|---|---|---|---|---|---|---|---|---|
| NOW-1 ★ | NOW | P2 | Window and widget frames: flat glass, 5 px radius → the iron 9-slice (4 art px windows, 2 art px widgets), radius 0, bars and slots sunk (§9) | the HUD becomes part of the world instead of a web overlay | CSS `border-image`; frames from `samples/make-frames.mjs` move to `assets/ui/` | AD (CSS) + Asset Director (asset home) | S, low | screenshots at ×2, desktop and 922×423 |
| NOW-2 ★ | NOW | P2 | Strip name, window titles and ground widget in Cinzel → the analyzer's heading style (§10) | one voice; Tyler's 10-15 ruling | shell CSS | AD | S, low | DOM: zero Cinzel nodes outside the logo |
| NOW-3 | NOW | P1 | Hero facings 4 → 8: `DIRS` per class, build row order, `dirOf` 8-way, nearest-cardinal fallback (§6) | no sliding on diagonal steps | `art-budget.js`, `tools/world-art/build.mjs`, `choreo.js`, `canvas-backend.js` | Systems Engineer (AD reviews) | S, medium (atlas rebuild) | a regression test (a diagonal step picks `se`; a missing diagonal falls back); `world-assets` green |
| NOW-4 ★ | NOW | P1 | Combat overlay: red box → ground ring; crit 16 → 22 px gold with a pop; floats start above the plate; a heal float; plates on target, elites and players only (§11) | you can see what you hit and feel a crit | `canvas-backend.js overlay()`, `choreo.js`, tokens `--world-float-heal` | Systems Engineer from AD spec (`samples/combat.html`) | S, low | before/after stills; a test pinning crit size > hit size |
| NOW-5 | NOW | P1 | Loot bag: lands on the corpse → beside it, with a ground mark; rare light column + 4 s name + HUD toast (§11) | drops are seen | `choreo.js` bag offset, `canvas-backend.js`, a toast widget | Systems Engineer + AD | S, low | stills 5–6 of the sample reproduced in the engine |
| NOW-6 | NOW | P1 | First production batch R1–R4: south walk, diagonals (idle, walk), rat and slime readability, loot bag (PIXELLAB_WORKFLOW §5) | the first-playable pains: the walk, the rat, the loot | PixelLab + `tools/world-art` | Coordinator runs, AD approves, Asset Director builds; spend on the Coordinator's go | S–M, medium (generation variance) | each row's accept criteria; `world-assets` exit 0; ×2 look |
| NOW-7 | NOW | P1 | Readability becomes a guard: body edge ≥ 3:1 to the floor median per ground (§4) | the rat problem cannot come back | `tests/world-assets.mjs` + a `--selftest` arm | Asset Director (after R3, or it starts red) | S, low | mutation proof: the shipped rat trips it |
| NOW-8 ★ | NOW | P2 | Rarity: none → `--rar-*` tokens, rank pips, slot language for the four kinds, tooltips (§8) | a rare drop looks rare; kinds read at a glance | `tokens.css`, the Bag and Gear windows | AD; the epic colour's palette ramp: Asset Director | S, low | `samples/slots.html` reproduced in the Bag |
| NOW-9 | NOW | P1 | Phone HUD: 90 px, 10 slots → the ruling (68 px, 6 + page, vitals top-left); the bar shifts clear of the side sheet | a fifth of the phone back to the world; food reachable with the bag open | the shell's widget layout | B1 builder (AD spec) | S, low | DOM rects at 922×423 |
| NOW-10 | NOW | P2 | Phone bar in town: always shown → shown in a hunt only (vitals stay) | the town is bigger where nothing is fought | widget `when` | **Coordinator / Tyler** (changes WORLD_SHELL §2) | S, low | `town-phone.png` again |
| NOW-11 ★ | NOW | P2 | Analyzer v1 → v2: two lead numbers, compact and full densities, reserved compare and gathering slots (`samples/analyzer.html`) | the reason to hunt is read first | the analyzer widget (fixture → `G._huntAnalyzer`) | B1 builder (AD spec) | S, low | screenshot; no formula touched |
| NOW-12 ★ | NOW | P2 | Gear: the figure lost in an empty column → plinth sized to the ×2 figure, labels on hover for every slot | the doll reads as a body | the Gear window CSS | AD | S, low | screenshot |
| A-1 | AFTER | P2 | Mill Cellar polish: earth ↔ cracked dirt and flagstone ↔ skirting tilesets, wall corners and a feature every 6 wall tiles, the east wall fixed, wear decals, torch and brazier flicker, a darker band behind fight pockets (§3, §5) | a dangerous place, not a brown box | PixelLab tilesets + props (§6 of the workflow), `src/data/world/maps/*` | AD + Asset Director; Coordinator runs PixelLab | M, medium | ×2 shots; readability guard |
| A-2 | AFTER | P2 | Town life: waterwheel loop, chimney smoke, lamp and torch flicker, crier and smith idles, cobble wear and kerb edging, the square framed by hedges and fences, two warm accents (an awning, banners) | a safe home that feels alive | PixelLab clips and decals; town map | AD + Asset Director | M, medium | ×2 shots, a 10 s capture |
| A-3 | AFTER | P2 | Cottage: indoor signposts → doorways and arches with names on hover; furnish to a lived-in density; wall faces on every side | the home is a home | home map + props | AD + Asset Director | M, low | `cottage-desktop.png` again |
| A-4 | AFTER | P2 | Monster idles (4 frames), the hero's hit clip, diagonal attack and down | nothing alive is a still | PixelLab v3 animation | AD spec, Coordinator runs | S–M, low | `world-assets`; look at ×2 |
| A-5 | AFTER | P3 | ~40 flat item icons redrawn on the diagonal to fill 75–94% | an even bag | PixelLab `create_image_pro` with our palette | Asset Director (AD approves) | M, low | contact sheet at ×2; `tests/pixel-icons.mjs` |
| A-6 | AFTER | P3 | Edit HUD v1.1 visuals (drag, snap grid) in the iron frame | a HUD the player owns | shell | B1 builder | S, low | `*-edit-hud.png` |
| L-1 | LATER | P2 | Monster re-art for the EA region (~30 creatures, 5 clips each, east facing) | a world worth exploring | PixelLab objects + v3 clips (150–300 gens) | Asset Director + AD; **Tyler** approves spend | L, medium | per-creature accept rows |
| L-2 | LATER | P3 | Town time of day (dawn, day, dusk, night on the server clock) | the town has a rhythm | ambient tokens + engine | Systems Engineer + AD | M, low | 4 shots |
| L-3 | LATER | P2 | Audio sample set (impact, crit, kill, loot, rare, ambience) | feel | free/OFL sources only | AD; **Tyler** approves | M, low | a listening sample |
| L-4 | LATER | P3 | Optional bitmap numerals for world floats at ×2 | floats match the art | engine | AD + Systems Engineer | S, low | A/B stills |
| L-5 | LATER | P3 | Painted banners and portraits replaced by pixel art | one icon language | PixelLab | Asset Director | M, low | screenshots |

**NOW items for the cutover and B1, in order:** NOW-3 and NOW-6 (R1, R3, R4 first; R2 with NOW-3) · NOW-4, NOW-5 · NOW-9 · NOW-1, NOW-2 · NOW-8, NOW-11, NOW-12 · NOW-7 after R3 · NOW-10 on a yes.

## D. First-pass recommendations (exact changes, and why they help)
**Mill Cellar.** (1) Lift the rat and slime one value step with a lit rim, by edit not regeneration (R3), to ≥ 3.5:1, so the enemy is the clearest thing on the floor. (2) Keep the floor dark; do not brighten the room, because darkness is the mood (§3) and the problem is the actors. (3) Replace the loot bag with a light burlap sack and drop it beside the body (R4, NOW-5), so every kill visibly pays. (4) After the playable: fix the stepped east wall, add a skirting strip where floor meets wall, a feature every 6 wall tiles and torch flicker (A-1), so the room has edges and life.

**Town.** (1) Animate what already exists: waterwheel, smoke, lamps, the crier and the smith (A-2). Motion is the cheapest way to make a place feel lived in. (2) Break the cobble: wear decals, kerb edging, and a frame of hedges and fences around the square, so the square reads as a place. (3) Add two warm accents (a market awning and banners) and lit windows at dusk, so the town is the warm heart against the cold grounds.

**Combat presentation.** Ground ring under the target; crit 22 px gold with a pop; floats above the plate, three per actor at most; plates only on the target, elites and players; the bag beside the body with a ground mark; a stepped light column and a toast for rare drops; no shake on routine hits (NOW-4, NOW-5; `samples/combat.html`). The player can follow one fight among seven monsters for an hour without the screen shouting.

**Inventory.** Rarity border, faint back and rank pips on equipment; count and bar key on consumables; parchment and a seal on quest items; plain pockets for materials; a neutral selection outline; the analyzer-style tooltip with stat rows and the requirement in red when unmet (NOW-8; `samples/slots.html`). A player sorts a full bag by eye.

**Desktop HUD.** Iron 9-slice frames (NOW-1), one text style (NOW-2), analyzer v2 at the top left (NOW-11), the target widget naming the foe in its plate face. The HUD frames the world like a game's and the important numbers lead.

**Mobile HUD.** Build the 10-14 ruling: 68 px bottom HUD, 6 slots and a page toggle, vitals top left (NOW-9); the bar shifts clear of the side sheet; the 2-art-px widget frame so a phone pays 8 px a widget, not 16; the compact analyzer as the phone default; the bar hidden in town if the Coordinator agrees (NOW-10). The phone shows the world, not chrome.

## E. Samples (prototype only, `prototypes/world-shell/samples/`), before → after, all read
| Sample | Before | After | Decision |
|---|---|---|---|
| 1 Combat feedback, 6 stills | `shots/phase2/sample1-combat.png` row 1 (today's overlay rules) | the same file, row 2 | §11 |
| 2 Inventory slots | `shots/phase2/cellar-bag-desktop.png` | `shots/phase2/sample2-slots.png` | §8 |
| 3 Hunt Analyzer v2 | `shots/phase2/sample3-analyzer.png` (first panel) | the same file, panels 2–4 | NOW-11 |
| 4 Chrome A/B at ×2 | `shots/phase2/ab-a-flat-*.png`, `ab-zoom-a-flat.png` | `ab-b-nine-*.png` (chosen) and `ab-c-pixelfont-*.png` (rejected) | §9 |
| Readability | `shots/phase2/sample-readability.png` (shipped) | the same file, edit previews | §4, R3 |

Open a sample: serve the repo root and visit `/prototypes/world-shell/samples/<name>.html`; the A/B is `/prototypes/world-shell/?scene=hunt&chrome=nine|pixel`.
