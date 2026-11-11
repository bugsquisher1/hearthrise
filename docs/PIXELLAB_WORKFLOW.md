# PixelLab workflow: how Hearthrise generates pixel art

Tyler's production directive (2026-10-15). PixelLab is the generator; our own pipeline (`tools/world-art/*`) is the gate. Nothing generated reaches `assets/` without passing the palette lock, the art budget and a look at ×2 in the game. The look is `ART_DIRECTION.md`; sizes, anchors and export are `ASSET_STANDARDS.md`; what exists and what happens to it is the registry in `ASSET_MANIFEST.md`. Parameters below were read from https://api.pixellab.ai/mcp/docs (generated 2026-10-14) and from the requests recorded in our sidecars; nothing is assumed beyond them. **The Art Director writes specs; the Coordinator (or a general agent) runs the calls**, because the art-director role cannot call PixelLab.

## 1. The best tool per asset category
| Category | Tool (mode) | Why | Cost (docs) |
|---|---|---|---|
| Hero, NPCs, peers, humanoid monsters | `create_character` mode `v3`, `view: "high top-down"`, size 40 (body 36 in a 64 frame) | what the hero was made with (`03dec2e0`); v3 always returns 8 rotations without a reference | 2–9 gens |
| New humanoid in an existing style | `create_character` v3 with `reference_image_url` (a straight-on south sprite) | rotates the exact sprite; the only mode that keeps identity | 2–9 |
| Character animation | `animate_character` mode `v3`, custom `action_description`, ONE direction per call, `animation_group_id` to append facings | template clips redraw the character (the shield came and went); v3 keeps it | ~1 per facing at 64 px, 8 frames |
| Character walk that drifts | `animate_character` mode `skeleton-v3`, `template_animation_id: "walking-8-frames"` | moves the sprite instead of redrawing it (beta) | 2–4 per facing |
| Critters, beasts, fliers | `create_object_pro_flash` (`n_directions: 8`, high top-down), then `animate_object` mode `v3` | the rat, slime and wasp were made so; true facings, strong outline | pro flash: see `get_pro_flash_capabilities`; v3 animation cheap |
| Props (barrels, crates, clutter) | `create_1_direction_object` with `style_images` (up to 8 shipped props) at size ≤ 42 | one call returns a sheet of 64 candidates in one style: pick, `select_object_frames` | 10–25 per call |
| A prop that must fit a spot | `create_map_object` with `background_image` + `inpainting` | matches the scene around it (the waterwheel) | |
| Terrain | `create_topdown_tileset` standard, `tile_size: 32`, chained with `lower_base_tile_id` / `upper_base_tile_id` | it is a Wang-16 corner set, exactly our `wang16` | 1–4 (usually 3–4) |
| Roads and paths | `create_path_tiles` square_topdown 32 | an 18-tile connectable path | |
| Walls and floors | `create_building_kit` square_topdown 32, **as reference only** | our walls are custom 32×60 slices; the Asset Director fits them | |
| Item icons (32 px) | `create_image_pro` with `palette` = our 56 colours and a `style_image_url` of a shipped icon; or `create_1_direction_object` size 32 with `style_images` for a batch | palette-true from the start, one style | 10–25 |
| Fixing a few pixels | `pixelart_workbench` (free) or `inpaint_image` (one region) | edit before regenerate | free / 10–25 |
| The same edit on many frames | `edit_image` with `image_urls` = every frame | one consistent edit across a clip | 10–25 per call |
| Clean-up | `correct_pixelart` (strength 0.1), `reduce_colors` | stray pixels; our `lock.mjs` still does the palette snap | 0.1 |
| Not used | `create_ui_asset`, `create_font`, `vfx_workbench` effects | chrome is a code-drawn 9-slice from the palette; the type is decided; floats, rings and bars are drawn by the engine | |

## 2. Style lock: how a batch stays one game
1. **Reference first.** A new asset of a kind that exists starts from a shipped one: `reference_image_url` (characters), `style_images` (objects), `style_image_url` (images), `lower/upper_base_tile_id` (tiles). A reference sprite for a character faces **straight south**, or every facing is mislabelled by 45°.
2. **Persistent ids.** The hero is `03dec2e0-d4e4-4745-8c31-7d97aa0aeba6`; the rat `18ec0bfa-…`. Animations append to the existing group (`animation_group_id` + the group's own `animation_name`, which is not inherited).
3. **Same words.** Every facing of a clip uses the identical `action_description`, copied from the sidecar.
4. **Fixed camera and outline.** `view: "high top-down"`, `outline: "single color black outline"`. Outline and shading are soft hints, so the gate measures, not trusts.
5. **Palette.** Pass our palette where a tool takes one (`create_image_pro palette`, `reduce_colors palette_image_url`); the authority is still `tools/world-art/lock.mjs` → `hr-world-56-v2`, and `tests/world-assets.mjs` fails any off-palette pixel.
6. **Seeds.** Record the seed of every accepted generation in the sidecar so a near-miss can be rerun.

## 3. The pipeline (every asset, no exceptions)
1. **Spec** (Art Director): tool, parameters, reference inputs, expected size, accept criteria, generation estimate. Batches stay small (≤ 20 calls).
2. **Generate** (Coordinator): `get_balance` before; submit; `wait_for_jobs`; `get_balance` after.
3. **Inspect at native size and at ×2**, frame by frame (`get_image` / `get_character`): identity, facing, seating, gear constant.
4. **Approve or reject** (Art Director) against the spec's criteria. A reject says why and which fallback runs.
5. **Export**: download the frames into `art/world/<set>/<id>.png` in sheet order (`ASSET_STANDARDS.md` §2) and fill the sidecar's `pixellab` block (tool, id, request, groups, seed, cost).
6. **Lock and build**: `node tools/world-art/build.mjs --set <set>`, then `node tests/world-assets.mjs` (exit 0).
7. **Registry**: update the asset's row in `ASSET_MANIFEST.md` (decision, states, approval, PixelLab id).
8. **In-game check at ×2**: the prototype scene, and `prototypes/world-shell/samples/readability.html` for dark grounds; screenshots read before the commit.

## 4. Known limits (from the docs and from our own sheets)
- Template animations redraw the character each frame; v3 custom animation is one direction per call. Characters have no `replace_existing`: a redo makes a new group (old groups are kept, never deleted).
- `create_8_direction_object` is unreliable for characters' identity; use `create_character` v3 with a reference.
- Inline base64 is truncated by MCP clients: use `get_upload_url` / `image_urls`.
- Pro Flash drifts glossy (the b574 lesson): judge against the shelf the asset lands on, not the prompt.
- Quadruped templates are bear, cat, dog, horse and lion only; small creatures go through the object tools.
- The tools return 8 rotations, but our engine reads `s, e, n, w` until NOW-3 lands; diagonals are wasted until then.

## 4b. Spend rule: free first (Tyler, 2026-10-15)
Batch 1 spent 40 generations on rat and slime readability, then still needed a free value lift to reach the target. From now on, a fix to an EXISTING sprite (contrast, value, hue, rim light, small pose edits) tries the free in-repo pass first: a value lift, a palette ramp shift, `pixelart_workbench` hand edits. PixelLab is used only when that cannot meet the accept criteria. Generations are for NEW art: new creatures, new facings, new animations and tilesets.

## 5. The first production batch (small, aimed at the first playable)
Order matters: R1 and R3 can run now; R2 lands with the engine's 8-facing support (ART_ROADMAP NOW-3). **R0 preflight (free):** `get_balance`; `get_character(character_id="03dec2e0-d4e4-4745-8c31-7d97aa0aeba6")` (confirm 8 rotations; read the walk and idle group names); `get_object(object_id="18ec0bfa-136c-47ba-a3c8-11ddfa50bceb")`.

| # | Asset | What exists → what changes | Tool and parameters | Expected | Accept when | Est. gens |
|---|---|---|---|---|---|---|
| R1a | Aldric south walk | 8 frames, only the left foot lifts → both feet alternate | **EDIT, free:** `pixelart_workbench(argv=["describe","cli"], mode="high")`, then edit the leg rows (about y 44–58 of the 64 frame) of the frames where the right foot should lift, on subject `character:03dec2e0-…:south:<walk animation>`; `save_to_asset(target="character:03dec2e0-…:south:e0833032-9a4c-4e10-bcc5-d6d1a95261d8")` | 8 frames 64×64 | contact poses at frames 0 and 4 on opposite feet; each foot lifts ≥ 2 art px once a cycle; shield on the left arm and sword in the right hand in every frame; seated on the anchor row; looks right walking at ×2 in the town | 0 |
| R1b | (fallback) | if R1a cannot make a clean stride | `animate_character(character_id="03dec2e0-…", mode="v3", directions=["south"], frame_count=8, keep_first_frame=false, animation_name="walk", action_description="walking toward the viewer at a steady pace, the left and right legs alternating clearly with each foot lifting in turn, sword held low in the right hand, shield on the left arm, cloak swaying")` | a new 8-frame group | as R1a, plus identity equal to the idle south frame | 1–2 |
| R1c | (second fallback) | if R1b drifts | same call with `mode="skeleton-v3", template_animation_id="walking-8-frames"` | | as R1a | 2–4 |
| R2 | Aldric diagonals, idle + walk | 4 facings → 8 | for each of `south-east, north-east, north-west, south-west`: `animate_character(…, mode="v3", directions=[d], frame_count=4, animation_group_id="23a56522-7381-4d81-bee6-1c870230545c", animation_name=<idle group's name>, action_description="standing still on guard, breathing slowly, sword and shield held ready")`, and the walk with R1's accepted text, `frame_count=8`, the accepted walk group | 8 clips | true 45° views (front and side both visible in se/sw); same identity and gear as the cardinals; the walk passes R1's criteria; `build.mjs` clean once `DIRS` has 8 | 8–16 |
| R3a | Giant Rat readability | body edge 2.36:1 on cellar earth → ≥ 3.5:1 | **EDIT, free preview:** one ramp step up + a lit rim (`samples/readability.html`) reaches only 3.00:1, so it is the fallback, not the fix | | | 0 |
| R3b | Giant Rat | as above | `edit_image(image_urls=[the 27 east frames: idle 1, walk 6, attack 7, hit 5, death 7, corpse 1 — uploaded via get_upload_url], description="lighten the fur to a mid warm grey-brown with a pale sandy belly and a pale pink tail, catch light along the top of the back and head from the upper left; keep the pose, the silhouette, the size and the dark outline exactly")`; split per clip if the grid is refused. West = the edited east, mirrored (no handedness; death already mirrors) | 27 frames 48×48 | body edge ≥ 3.5:1 (readability page); every frame's alpha mask matches the shipped one (IoU ≥ 0.95: same silhouette, size and anchor); in palette after lock; `world-assets` exit 0; reads at a glance at ×2 in the cellar | 10–25 per call (1–5 calls) |
| R3c | Slime | 2.59:1 → ≥ 3.5:1 | the R3b pattern on the slime's east frames: "brighten the slime to a lighter moss green with a wet pale highlight on its upper left; keep the shape and outline exactly" | 27 frames | as R3b | 10–25 |
| R4 | Loot bag | 12×14, 1.06:1, lands on the corpse → a readable sack | **free first:** draw a 14×14 tied burlap sack in `pixelart_workbench` (earth `#a88457` / `#8a6440`, rope `#c49a5c`, dark outline); fallback `create_object_pro_flash(description="small tied burlap loot sack, light tan, rope tie, top-down RPG prop, dark outline", view="high top-down", n_directions=1, width=16, height=16)` | 1 frame, class `loot` | body edge ≥ 3:1; body 8–14 px; reads beside a corpse at ×2 | 0 / small |

Batch estimate: about 30–90 generations, most of it R3. **Cost tracking:** the Coordinator records `get_balance` before and after each row; the actual figure goes into the sidecar's `pixellab.cost` and the registry row. Nothing runs without the Coordinator's go (budget freeze, 2026-08-17: per-spend approval).

**Actuals (2026-10-15, lane `art-batch1`):** balance 8599 → 8559 generations (40). R1a accepted as a free edit (0); R3b/R3c 2 `edit_image` calls each (10 + 10 per monster). The edit kept every silhouette but drifted it 0–6 px and stopped short of 3.5:1 on its own, so each frame is re-aligned to the shipped mask by its best whole-pixel shift and its non-outline pixels value-lifted (×1.12 rat, ×1.15–1.25 slime) before the lock. R4 accepted as a free hand drawing (0). Evidence is in each sidecar's `pixellab` block.

## 5b. What art batch 1 measured (2026-11-04, lane `a-art-batch-1`, 283 generations; `ASSET_MANIFEST.md`)
- **A creature, 30 generations:** Pro Flash first frame 5 (`n_directions: 1`, so a bad look costs 5), rotations 1 (`first_frame_url`), v3 walk and attack 8 each, one `edit_image_pro_flash` dead pose 5, a fall of 3 facings 3. A v3 clip bills 1 a facing at 6 frames (and at 4). Read the frame before the rotations and the rotations before the clips.
- **Size comes from the canvas:** a 48 px canvas drew a boar-sized rat. 40 px gives a 34-38 px body. A style image must fit the canvas: crop it to its opaque box.
- **Hue:** the plain lock turned a dun rat charcoal. `port-pixellab.mjs unit --ramps` snaps to the creature's own ramps and declares `material: native`; `--lift 1` lifts a body for a dark floor.
- **A v3 death alone leaves it standing.** Pass the dead pose as `end_frame_base64` (only base64 on `animate_object`: `encodeSheetPNG` keeps it near 1 KB, and PNG's CRCs refuse a slipped character).
- **Re-roll on sight:** a north attack with a mouth on the rump, a south walk that turns away, a baked flash. Read every clip at x2 after the lock: `seen from behind` and `facing the viewer the whole time` fixed these for 1 generation each.
- **Icons:** `create_1_direction_object` with `style_images` and the palette gives 64 on-palette 32 px candidates for 10 generations: pass `item_descriptions` several times each and pick. Beware a style image's own shape: `alpha_fang` as the style drew the next claw as its twin.

## 5c. What the creature idles measured (2026-11-05, lane `a-creature-idles`; `art/review/creature-idles-2026-11-05/`)
- **Generate 8, keep 2.** `frame_count: 8` bills the same 1 generation a facing as 4 at 64 px or less, and the 9 stored frames give `tools/world-art/idle-clip.mjs` a choice: a ping-pong (still, a, b, a), which always comes home without a pop and costs 2 new atlas frames a facing.
- **The words that held the feet:** `frozen in place and alert, all four paws planted and never lifting, only breathing: ...` (`both feet`, `all eight legs`). "The feet do not move" and "almost motionless" both let a paw walk off.
- **The model redraws the whole body each frame, so a big furred one shimmers** (a boar's flank turned 80% of its pixels a step). `holdBody` keeps the still's pixels except within 2 px of where the silhouette moved: only the outline breathes, 2-12% of the body a step, and the shading never flickers. Snapping only to the still's colours was not enough on its own.
- **A flier never stands:** its idle is its own flight clip with the still as frame 0 (`port-pixellab.mjs idle --flight`), at 10 fps, no generation, nearly no atlas.
- **A sprite with no object:** `animate_image` with `first_frame_url: "upload:<id>"` from `get_upload_url` is the same price and the same quality, and frames come from `/mcp/images/<job>/download?index=N`. `custom_start_frame_base64` works but a 1 KB string copied through a tool call slips a character about one call in ten (PNG's CRCs refuse it, nothing is billed), so do not use it for a batch. It also fixes a facing whose object rotation is not the shipped still (the audit prints `frame 0 missed`).
- **Measure lift the way `validate.mjs [feet]` does:** on the mass, not the lowest pixel. A spider's thin leg can stay down while its body hops 5 px.
- **20 jobs at once is the account's limit;** one creature of 8 facings takes 2-5 minutes, so two creatures a round.

## 6. Planned after the first playable (counts only; no calls yet)
| Batch | Calls | Tools |
|---|---|---|
| Mill Cellar tileset family: earth ↔ cracked dirt, earth ↔ flagstone (`d6b2cf79` exists but is unused: it read as a raised slab; regenerate flatter), flagstone ↔ wall skirting | 2 new tilesets (6–8 gens) | `create_topdown_tileset` chained by base tile ids |
| Mill Cellar walls, corners and a doorway | 1 kit as reference (+ Asset Director fitting) | `create_building_kit` |
| Mill Cellar props refresh (sacks, millstone parts, grain, cobwebs) | 2 prop sheets | `create_1_direction_object` with 8 shipped props as style |
| Life: torch and brazier flicker, waterwheel turn, crier and smith idles, peer idle and walk | ~14 clips | `animate_object` / `animate_character` v3 |
| Town wear and framing: cobble wear decals, kerb edging, square border | 1 path set + 1 decal sheet | `create_path_tiles`, `create_1_direction_object` |
| Monster re-art for the EA region (about 30 creatures) | per creature: 1 object + 5 clips on the east facing | `create_object_pro_flash`, `animate_object` v3 (150–300 gens in all) |
| Hero clips: hit, and attack + down on the diagonals | 1 + 8 clips | `animate_character` v3 |

## 7. PixelLab release 2026-11-11 ("What's New": attack templates, VFX Creator, palettes, Tileset Pro, normal maps)
Read 2026-11-11 from PixelLab's video (youtube.com/watch?v=OND5ExBdajQ), the MCP docs (api.pixellab.ai/mcp/docs) and the public API notes for 0.4.130. Costs below are PixelLab's stated prices; nothing here is measured by us yet. Each row says what it is worth to Hearthrise under §1 and §4b.
| Feature | What it is (tool and parameters) | Cost | Use for us |
|---|---|---|---|
| Attack templates | `animate_character` `template_action`: punch, left punch, two punch combo, uppercut, high kick, swoop kick (v3 and PixMiniMax); one click, no prompt. No hurt, dash or cast templates (use taking-punch, running-slide, fireball). | template 1 per facing | Low: our hero and monsters attack with weapons and claws, and templates redraw the character (§4). Keep v3 custom `action_description`. |
| Custom animation with Enhance + start pose + per-direction slot | the Creator's UI for v3 custom clips; same `animate_character` v3 underneath | as v3 | Already how we work. The "resize canvas before you animate" step matches §5b (size comes from the canvas). |
| Palettes that stick | `palette` (2-256 hex), `palette_name` (label only), `max_colors` (2-64) on most tools, including `create_character`, `create_topdown_tileset`, `animate_object`, `create_tiles_pro`, `create_image_pro`. On characters, topdown tilesets and animate_object a palette needs `mode: 'pro'` (standard refuses it). | pro prices (10/15/25) | HIGH for new creatures and tilesets: pass `hr-world-56-v2` so every facing and clip is on-palette before `lock.mjs`, which stays the authority. v3 standard clips still cannot take it, so creature clips keep going through the lock. Try on the next new creature (one sample, §10). |
| VFX Creator | free `vfx_workbench` (presets, parts, recipes, sliders, layers behind or in front of the sprite, export GIF/sheet/game pack) plus a paid "VFX artist" from a description: `POST /vfx` with `artist: lite` or `pro` (REST and Creator; not seen as an MCP tool yet). | workbench free; artist quoted per job, bill up to 2x the quote; lite measured at 1 | Medium: our impact, glance and rune effects are engine-drawn or in-repo scripts (`glance-spark.mjs`, `hearth-flames.mjs`, `round-fireworks.mjs`) and §1 lists vfx as not used. The free workbench is a fair source for area-spell and rune effects the engine cannot draw; pass its frames through the lock and the vfx sidecar (`style1.mjs` `class: 'vfx'`). No paid artist without a sample. |
| Tileset Pro | `create_topdown_tileset` / `create_sidescroller_tileset` `mode: 'pro'` (15 for tiles up to 32 px, 25 above); connected sets via `lower_base_tile_id` / `upper_base_tile_id`; new shape controls `roundness`, `connect_diagonals`, `boundary_amplitude` + `boundary_seed`, `step_slope`, elevation; `spread_x` and `slope_size` do nothing now. Transition size 0.5 returns 25 tiles (16 corners + wall twins), not our plain Wang-16. `create_tiles_pro` (tier 1+, `tile_feature: tileset|paths|building`, `outline_mode: segmentation` for clean seams, 10-25) is the Creator "Create tiles (Pro)". | 15/25 | HIGH for the Slake and Pyre Field region kits: one pro transition at 32 px replaces 3-4 standard rerolls, with the palette on. Our `wang16` reader takes the 16 corner tiles; the 9 extra wall tiles are ignored until `terrain.js` wants cliffs. Standard stays 1 for cheap variants. |
| Normal maps | `create_normal_map`: `image` (character, object, job or upload ref; up to 32 frames as one strip), `mode: lite` (0.1) or `pro` (0.5), `convention: opengl|directx`, `kind: character|object|topdown|side|iso|ui`, `strength`, `outline_rounding`, `part_shapes`, `surface_detail`. | 0.1 / 0.5 per call | None now: the world renderer has no lighting pass, and §10 pixel art is flat, one grid, one palette. Note it for a torch-lit cellar look later; it would be a renderer feature, not an art batch. |

What changed for the spend plan (generations reset 2026-11-14): spend the rest on pro tilesets with the palette for the open region kits and on palette-locked pro creatures for the missing six, not on templates or effects. A pro call bills 15-25 so a reject is dear: one sample per kind, read at x2, before any batch (§10).
