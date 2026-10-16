# PixelLab capability reference (condensed)

Sources (2026-10-16): pixellab.ai/docs index, pixellab.ai/mcp, and `mcp__pixellab__search_help` answers. Nothing was generated. Costs are in "generations" (gen). Sections 1-11 are from MCP help text; sections 12-13 come from every individual docs page (read 2026-10-16) and confirm or correct them.

Global rules
- All generation is async. It returns a job id; poll with the matching `get_*`, or `wait_for_jobs`. Leave more than 2 s between submissions.
- Concurrent jobs: tier 1 = 8, tier 2 = 10, tier 3 = 20 (queued jobs count).
- Trial accounts cannot use: `inpaint_image`, `create_tiles_pro`, `create_path_tiles`, `create_building_kit`, `transfer_outfit`, `animate_image_pixminimax` (tier 1+ needed).
- Pro-tier tile tools need 15 gen available to start.
- Tags: max 20 per asset, 50 chars each (replace-all semantics).
- Deletes are permanent. Delete each character state separately.
- Quote before spending: `get_pro_flash_capabilities(operation=..., width, height)` for all `*_pro_flash` tools; pro animation asks for explicit cost confirmation.
- `get_balance` is free. `search_help` and `search_knowledge` are free.

## 1. Characters

### create_character
- Makes: humanoid or quadruped, 4 or 8 directions.
- Params: description, mode (standard | pro | v3), size, n_directions (4/8), body_type, template, view (e.g. "low top-down"), style options.
- Cost: standard 1; pro 10-25 (always 8 dirs); v3 2-9 depending on size (2 at 32/48 px).
- Limits: standard/pro max 128 px; v3 max 256 px. Standard stores the sprite on a canvas about 40% larger than nominal (room for animation), which affects animation cost. v3 without a reference always makes 8 directions. v3 reference-image rotation supports humanoids only; from scratch v3 also does quadrupeds.
- Gotchas: eight is the maximum direction count.
- Hearthrise: the baseline for our 4 classes. `mode="v3", size=32 or 48, view="low top-down"` is 2 gen for 8 directions. Best price/quality for a roster.

### create_character_pro_flash
- Makes: a first image plus eight V3 views. Size via width/height. Cost depends on canvas; quote with `get_pro_flash_capabilities(operation="character")`.
- Hearthrise: try when style fidelity to a hero concept image matters.

### create_character_state
- Makes: a variant of an existing character across all rotations (new outfit, armor tier, class swap, wounded look).
- Params: character_id, edit_description, `use_color_palette_from_reference` (keeps palette), optional paired override_width/override_height.
- Cost: 10-25 by generation size.
- Hearthrise: equipment tiers, class skins, elite/boss variants of a monster. Keeps identity consistent.

### transfer_outfit
- Makes: reskins 2+ animation frames onto a new outfit, preserving motion. Tier 1+.
- Params: frame_urls/base64, reference_image (same character wearing the target outfit). Cost 10-25.
- Gotchas: do not feed it a spritesheet. It is not a new character state.
- Hearthrise: reuse one walk cycle across gear sets without re-animating.

### create_portrait_character / set_character_portrait
- Converts portrait to character sprite or the reverse. result_size 16/32/48/64 = 10 gen; 128/160 = 15 gen. `set_character_portrait` is free.
- Hearthrise: dialogue/party-frame portraits matched to sprites.

### Management
- `get_character`, `list_characters(limit, offset, tags, search)`, `delete_character`, `update_character_tags`. `get_character` shows which template animations exist for that character type.

## 2. Character animation

### animate_character
- Template mode: `template_animation_id` (e.g. `walking-4-frames`, `walking-8-frames`, `slashing`, `casting`; full list is in the tool description). Animates all directions by default, 1 gen per direction. Existing directions are skipped; there is no overwrite parameter. Attack/cast availability varies by character type.
- Custom v3: omit template id, give `action_description` ("raises staff and releases a burst of magic"). Defaults to south only; needs a single direction per call. frame_count even, 4-16. Cost depends on canvas and frames. Optional start/end frame inputs.
- `skeleton-v3` mode: 2-4 gen per direction.
- `pixminimax`: frame counts in multiples of 4 up to 40, tier 1+.
- Pro mode: 10-25 per direction, needs cost confirmation.
- Hearthrise: template walk (8 dirs x 1 gen = 8 gen per class) for the cycle; custom v3 for class-specific cast/attack, south-only first, then expand the directions we actually show.

### animate_with_skeleton_v3
- Pose-driven: description, action, direction, keypoints, first_frame_keypoints. 3-15 frames. Cost 2 (3 frames), 3 (8 frames), 4 (15 frames).
- Hearthrise: cheapest way to get a controlled pose such as a staff raise, bow draw or shield bash with exact keyframes.

### animate_image / animate_image_pixminimax
- Animate any image. `animate_image`: even frames, default 8, cost = ceil(w x h x frames / 65,536), min 1. `pixminimax`: 4-40 frames in multiples of 4, tier 1+.
- Hearthrise: ambient loops (torch, water, slime) from a still prop when no object pipeline fits.

### delete_animation
- By character_id and animation_type or animation_group_id; omit direction to delete all directions.

### Talking
- `create_vocal_animation` (mouth visemes), `create_talking_gif` and `get_lip_sync` (free). Useful for NPC dialogue portraits; low priority for us.

## 3. Objects

- `create_map_object(description, width, height, view)`: quick transparent prop, 1 gen, permanent, but not animatable and has no states/review. Basic mode needs width/height. The /mcp page says map objects auto-delete after 8 h; MCP help says permanent. Unresolved: download anything you keep.
- `create_1_direction_object`: size 16-256, 10-25 gen. May return candidates in `review` status; pick with `select_object_frames(indices, common_tag)` or discard with `dismiss_review`. Takes `style_images` and `item_descriptions`.
- `create_8_direction_object`: 8 rotations, size 24-168, 10-25 gen. `reference_image_base64` and `style_image_base64` are mutually exclusive.
- `create_object_pro_flash`: first image plus V3 views; quote via capabilities.
- `create_object_state`: variant of an existing object (10-25), e.g. open/closed chest, lit/unlit brazier, ripe/unripe crop.
- `animate_object`: v3 by default. 1-direction objects omit directions; 8-direction objects need exactly one direction per call. 4-16 even frames. Pro up to 170 px. Start/end frame inputs need a single direction and cannot be combined with pro.
- Mgmt: `get_object`, `get_map_object` (retries saving pixels if persistence failed), `list_objects`, `delete_object`, `update_object_tags`.
- Hearthrise: 1-direction is enough for top-down props (barrels, crates, trees, farm plots). Use states for farm growth stages and node depletion. Animate torches, water wheels, portals.

## 4. Tiles and tilesets

### create_topdown_tileset (the workhorse)
- Wang transition tileset between two terrains: `lower_description`, `upper_description`, `transition_size` (0 sharp to 1.0 full-tile cliff), `transition_description` (recommended when transition_size > 0), tile_size, mode, `shape_style` (standard only).
- 16 tiles (25 when transition_size = 1.0). Standard 1-4 gen (usually 3-4); pro 10-25. Standard sizes 16/32 px; pro 16/32/64.
- Chain: pass a previous set's base tile id as `lower_base_tile_id` or `upper_base_tile_id` (ocean, beach, grass, forest) so terrains share a look.
- Gotcha: only two terrains per set; three-way junctions are not automated. Exports: Wang, dual-grid 15 or 3x3.
- Hearthrise: 32 px standard. Chain grass -> forest floor -> path -> sewer stone so all hunting grounds share a base palette.

### create_tiles_pro
- Independent or connectable tiles: hex, pointy hex, isometric, oblique, octagon, square top-down. 16-128 px. 10-25 gen, needs 15 free. `tile_feature="tileset"` makes a transition set (cannot combine with `style_images`).
- Hearthrise: unique floor/wall pieces, props-as-tiles, dungeon variety.

### create_path_tiles
- Connectable road/path set. Square top-down is exactly 32 px (our size). Isometric 48-96. 10-25 gen, needs 15 free.
- Hearthrise: town roads, forest trails, sewer walkways. Not used yet.

### create_building_kit
- Floor, walls, doorways, pillar, stairs. Square/oblique 16-96 px; isometric 32-96. Params: wall_description, floor_description, tile_type, tile_size, wall_tiles. 10-25 gen, needs 15 free.
- Hearthrise: guild halls, houses, sewer chambers; also housing later (Ravendawn-style housing goal).

### Others
- `create_sidescroller_tileset` (2-3 gen, 16 tiles, 16/32 px, chain with `base_tile_id`): not for our view.
- `create_isometric_tile` (1 gen, 16-64 px): not for our view.
- Mgmt: `get_/list_/delete_` for each tile family.

## 5. Maps

- `create_map(name, tileset_id | tile_group_id, project_id)`: free. Needs project_id to sync into a game project.
- `edit_map(map_id, ops, dry_run, show)`: rectangles and paths, ordered; terrain `"none"` erases. Use dry_run first.
- `place_map_tiles(map_id, ops, dry_run)`: place/stack/erase tile-group tiles.
- `get_map(map_id, x, y, width, height)`: ASCII terrain grid (cell coordinates). `view_map`: render.
- `place_map_object(map_id, x, y, object_id | character_id, direction, layer, show)`, `move_map_object`, `remove_map_object` (by placement id, or asset_id to remove all), `list_map_objects`, `list_maps`, `delete_map`.
- Hearthrise: free blocking-out tool for hunting-ground layouts. Our hunt-sim and map-editor prototypes already hold their own data, so treat PixelLab maps as a drafting aid.

## 6. Image generation

| Tool | Makes | Cost | Limits |
|---|---|---|---|
| create_image_pixflux | freeform image | 1 | min area 32x32; palette given as an image |
| create_image_pixen | freeform image | 1 | dims multiples of 4, area max 512x512 |
| create_image_pro | style-reference image, candidate set | 10-25 | palette as hex colours |
| create_image_pro_flash | newer pro | quote via capabilities | valid sizes via capabilities |
| edit_image / edit_image_pixen / edit_image_pro_flash | edit by text | 10-25 / 1 / quote | |
| inpaint_image / inpaint_image_pro_flash | masked repaint | 10-25 (tier 1+; tier 2 if longest side > 256) / quote | |
| image_to_pixelart / _pro_flash | convert any picture to pixel art | 1 / 6 | |

- Transparency is preserved: transparent sprites return transparent.
- Hearthrise: pixen at 1 gen is the cheap exploration tool; inpaint for fixing a single sprite part.

## 7. Cleanup utilities (cheap)

- `unzoom_image` 0.1: collapses an upscaled "fake pixel art" back to true pixel grid.
- `correct_pixelart` 0.1: snaps to clean pixels.
- `reduce_colors` 0.1: palette reduction. Use to force our style-1 palette.
- `create_normal_map` 0.5: for sprite or animation; `convention` opengl (default, green = up) or directx. Poll via `get_image`.
- Hearthrise: run every generated sprite through unzoom, correct, reduce_colors before it enters `assets/`. Normal maps are only useful if we add lit rendering (not planned).

## 8. UI, fonts

- `create_ui_asset(description, width, height, ...)`: one pixel-art panel. 192-688 px; maxima by aspect: square 512x512, 16:9 688x384, 9:16 384x688, 4:3 600x448, 3:4 448x600. 10-25 gen. Supports palette hints, style references, transparent background, named elements or custom shapes. Makes a panel, not a set of separate icons. Poll `get_ui_asset`.
- `create_font(description, weight, glyph_px)`: 15 gen. glyph_px 8/16/32/64. Atlas is a 10x8 grid, 80 glyphs, row-major, no space glyph. Poll `get_font`.
- Hearthrise: frames/panels for the inventory and bestiary (CLAUDE.md wants purpose-built UI). A pixel font could replace system text. Must respect token colours (no hardcoded colours), so reduce_colors afterwards.

## 9. Effects (VFX)

- `vfx_workbench(argv=["describe","start"])`: free for subscribers. Step-by-step: start a scene (optionally around a sprite), add/tune parts, render, export. Each step returns a step id. Export gives a re-editable effect, GIF, spritesheet PNG + JSON; `--game-pack` adds an engine ZIP. Full command reference is NOT documented in help; run `describe`.
- `create_vfx(description, sprite, artist="lite"|"pro")`: paid, cost quoted in the response; poll `get_vfx`. Returns frames, downloads, effect id, optional game pack.
- Hearthrise: spell impacts, heals, buffs, loot sparkles. Workbench is free and already partly used in the hunt-sim.

## 10. Free pixel tools

- `pixelart_workbench(argv=["describe","start"], mode="low"|"high")`: inspect, edit, draw and animate pixel art by explicit commands. "low" acts directly with few tokens; "high" plans aloud and reviews every frame. No generation charge.
- `save_to_asset` (free): store an image into a character/object/gallery asset.
- Hearthrise: palette fixes, touch-ups, hand-animated frames at zero cost.

## 11. Projects, git, sandbox, agents

- `list_projects` returns git clone URLs; `add_to_project` / `remove_from_project` attach assets. Standard git clone/push works against the project.
- Sandbox: `sandbox_create_session(project_id, branch_name)`, `sandbox_bash/run/read/write/edit`, `sandbox_sync` (syncs git to B2 storage), `sandbox_deploy_worker`, `sandbox_undeploy`, `sandbox_playtest`, `sandbox_read_image`, `sandbox_destroy_session(sync)`. Hosted code-and-deploy environment; detailed git-sync behavior is undocumented.
- Chat/agents: `chat_*`, `agent_list`, `agent_inspect`, `agent_talk`, `agent_feedback` (feedback on tools).
- Hearthrise: our repo stays the source of truth (CLAUDE.md §1); sandbox/deploy features are not a fit. Projects can still hold asset provenance.

## 12. Product surfaces (confirmed from docs)

- Surfaces: Simple Web Creator (/create), Characters (/create-character, 4/8-dir animated), Pixelorama browser editor (/editor, desktop only), Aseprite extension (v1.3+, non-trial), MCP, API + Python SDK. MCP requires an active subscription.
- Licence/FAQ: commercial use allowed; only request is do not train models on outputs. Steam allows AI assets but requires AI-use disclosure. Inputs/outputs not used for training. Monthly subscription; mid-month upgrade is prorated; failed jobs not charged.
- Several pro tools are extension-only (Pixelorama/Aseprite), not MCP: Edit animation (Pro), Re-pose, Remove background, Resize. Transfer outfit (Pro) is on both.

## 13. Per-page findings (every docs page read)

Costs/limits are as stated on each page. Tier = subscription tier (free < 1 < 2 < 3).

### Characters, rotation
- Create 8-directional sprite (Pro): one 3x3 grid (8 dirs + centre ref). Modes: create-with-style, concept + style (1-4 concept refs, auto-scaled to 1024), rotate-from-one-image. Output max 168 px; style/rotate reference max 168 px. Cost by frame size: 1-85 px = 10, 86-113 = 15, 114-168 = 25. Views low/high top-down or side; bipedal/quadrupedal. Transparent default. Tier 1. Rotate-from-one-image is the cheapest route to eight.
- Rotate (older): 8 views from one south-facing image, canvas 16/32/64/128 only. Tip: generate several, fix roughly, regenerate with fixed frames as init + inpaint, raise init strength gradually.
- Rotating guide: "single reference" (no compounding error, harder big turns) vs "rolling reference" (45 deg steps, errors accumulate). Flip a good west/east for symmetric characters. Camera-change trick: set From view to the wrong one.
- Create walking character (experimental, tier 2): char + 4-frame walk in 4 dirs, canvas exactly 32x32 or 32x40, much faster than automatic.
- Create animations (automatic, tier 1): 4 rotations each animated, canvas <= 64x64.
- Reshape: changes proportions from reference + target shape; canvas exactly 64x64; image/shape guidance weights. Prepares characters for animation.
- Try on (experimental, tier 2, 1 gen): subject 16-320 area + garment image <= 320 + text; optional palette; single output.
- Multi image (experimental, tier 2, 1 gen): 2+ same-size images (each 16-320), description, e.g. same character in different poses. Not all clients.

### Animation
- Animate with text (New): reference <= 256 px, 4-16 even frames, first frame = input. Cost: 64 px = 1 gen at 4/8/16 frames; 96 px 1/2/3; 128 px 1/2/4; 192 px 3/5/n.a.; 256 px 4/8/n.a. Budget w x h x frames <= 524,288. Max 8 gen.
- Animate with text (Pro): reference <= 256, action text, view/direction. 32/64 px ref gives 16 frames (4x4) for 10 gen; 65-128 = 4 frames 10; 129-170 = 4 frames 15; 171-256 = 4 frames 25. Tier 1. Optional palette (presets, Lospec, hex) with max-colour cap shared across frames.
- Create animated object/character (Pro): no reference; description + action; canvas <= 256; same frame/cost table (32/64 = 16 frames for 10 gen). Tier 1.
- Edit animation (Pro): one instruction applied to 2-16 frames consistently (add sword, hat). 32-64 px: 16 frames 10 gen; 65-80: 9 frames 10; 81-128: 4 frames 10; 129-170: 4 frames 15; 171-256: 4 frames 25. Extension-only.
- Transfer outfit (Pro): outfit reference + 2-15 frames. 32-64 px: 15 frames 10 gen; 65-80: 8 frames 10; 81-128: 3 frames 10; 129-170: 3 frames 15; 171-256: 3 frames 25.
- Animate with skeleton: per-frame skeleton (template or copied from another animation); modes freeze1->gen2, custom, freeze2->gen1; canvas 16/32/64/128/256; "fixed head: always" keeps face stable; tier 1. Skeletons reusable across characters.
- Animation to animation (tier 2): regenerates an existing animation for a new character; canvas 16-128; min 2 frames; set a good frame as reference.
- Re-pose: redraws a character to an adjusted skeleton; 8 directions; canvas 16-256; Aseprite only.
- Old (ignore): Animation with text (64x64, 4 frames), Interpolate (64x64).

### Images
- Style-reference (Pro): many images in one style. By largest dim: <=32 px = 64 frames (10 gen; 15 at 33-42); 43-85 = 16 frames (10 / 15 at 65-85); 86-170 = 4 frames (10 / 15 at 129-170); 171-341 = 1 frame (10 / 15 at 257+); 342-512 = 1 frame 25. Max style images 64 @32 px, 16 @64, 4 @128, 1 @256. Tier 1. Good for icon batches (sample about 5 first per CLAUDE.md section 10).
- Create S-L image (Pro): text, up to 4 reference + 1 style image (copy palette/outline/detail/shading selectively), 16-512 px per side, same cost grid; palette (beta) and max colours.
- Create M-XL (pixflux): general model, min 32x32, max area 200 (free) / 320 (T1) / 400 (T2+); 48x64 for characters.
- Create S-M (style/bitforge): style reference, max 80x80 (T1) / 140x140 (T2+).
- Image to image (depth): shape-guided variations; max area 128 / 160 / 180 by tier. Pose to image: from a skeleton; small and medium sizes.
- Image to pixel art: downsizes about 4x; max 200x200 T1 / 320x320 T2+.
- Edit image: text edit, no mask; min 32x32, max 320 (free) / 400 (T1+); dims divisible by 4. Edit image (Pro): 10 gen up to 256 px, 15 at 257-314, 25 at 315-512; text or reference.
- Remove background (extensions): simple or complex (needs subject description). Resize (Aseprite): AI redraw at 200/128/64/48/custom; do big changes in steps. Unzoom: input 256-2048 px, colour reduction auto/none/2-256, all-frames option.
- Inpaint v3 (MCP `inpaint_image`): 32-256 px/side T1, 512/side T2+, 10 gen, crop-to-mask. Inpaint (old): area 140x140 T<=1 / 200x200 T2+. Pixpatch v2: max 180x180, T2.
- Reduce colors: max 512x512; presets (Game Boy, PICO-8, NES, 1-bit), Lospec link, palette image, hex; frames share a palette; dithering uses only palette colours.

### Maps, tiles, UI
- Create tiles (Pro) modes: Tiles (variations; a numbered list gives one tile per item; style tiles up to 16 in Creator, 6 in Map Workshop), Paths (18-configuration autotile), Tileset (16 tiles square/iso/oblique, 32 hex), Building (walls 1-3 tiles high, doorway, pillar, stairs). Shapes: square, hex, hex pointy, isometric (octagon Creator only). 16-128 px, 32 recommended. Options: view angle, tile thickness, outline mode, seed; Tileset: uneven boundary, terrain height (plateau + cliff), step slope, wall tilt (oblique 27-45 deg). Cost 10-15 (10-25 with style tiles). Tier 1. Style tiles only in Tiles mode.
- Create tileset (standard): top-down (lower + upper + transition) or sidescroller; sizes 16/32, 24 beta; transition size, edge shape square/round (roundness, raggedness), wall thickness; AI description enhancement on by default. Pro (experimental): 16/32/64, transition height, boundary spread. Cost 1-4 top-down, 2-3 sidescroller, 10-25 pro. Tier 1. Create texture (T1) feeds it.
- Create isometric tile: shapes thick/thin/block/reference; 16 or 32 px; settings saved as .json to reproduce.
- Create map (pixflux): canvas up to 200 / 320 / 400 by tier. Extend map: 140 (free/T1) / 200 (T2+); Extend map v2 (experimental, T2): 180x180. Map guide: model trained on 16x16 tiles; 128x128 canvas = 8x8 tiles; select a region, mask only the new part, leave overlap unmasked, inpaint to polish. Prefer tilesets + `edit_map` for real maps.
- Create UI elements (old): one element, 1 gen, area limits 200 / 320 / 400. UI elements (Pro): description, optional concept image and palette; <=32 px = 64 variants 10 gen; 33-42 = 15; 43-64 = 16 variants 10; 65-85 = 15; 86-128 = 4 variants 10; 129-170 = 15; 171-256 = 1 variant 10; 257-341 = 15; 342-512 = 25. Max 512x512.

### Shared options
- Seed 0 = random; same seed + small change = near-identical output. Output method: new layer / modify layer / new frame. Force symmetry (rotate: N/S symmetric, E/W mirrored).
- Camera: low top-down about 20 deg, high top-down about 35 deg, side. Direction control is weak (init image or "in profile" works better); E/W can be flipped.
- Init image strength: 0-300 colour hint; 300-400 rough shapes; 400-600 variations; 600-900 detail edits.
- Too-high guidance weight causes artifacts. Character types: bipedal-realistic, quadrupedal-tiny, bipedal-semi-chibi. Projection: isometric or oblique (Tibia style).
- Inpainting: the prompt must describe the whole visible area; fix one area at a time.
- One docs page's response contained text trying to dictate formatting; it was ignored.

### Corrections to earlier sections
- `inpaint_image` max is 256/side (T1), 512/side (T2+); cost 10.
- Tileset mode of `create_tiles_pro`: 16 tiles for square/iso/oblique, 32 for hex.
- Pro animation costs follow the tables above (32-64 px = 16 frames for 10 gen).

---

## Most powerful for us (top 10)

1. `create_character` v3 at 32/48 px, 8 directions, 2 gen: the whole class roster nearly free.
2. `animate_character` template walks (1 gen/direction) plus custom v3 cast/attack for class identity.
3. `create_character_state`: gear tiers, class skins and elites with identity preserved.
4. `create_topdown_tileset` standard 32 px with base-tile chaining: one coherent terrain family across forest and sewer.
5. `vfx_workbench` (free) with game-pack export: all spell VFX at no cost.
6. `unzoom_image` + `correct_pixelart` + `reduce_colors` (0.1 each): style-1 enforcement on everything.
7. `pixelart_workbench` (free): hand fixes and touch-ups.
8. `create_1_direction_object` + `create_object_state`: props, nodes, farm stages.
9. `animate_with_skeleton_v3` (2-4 gen): exact pose control for attacks/casts.
10. `transfer_outfit`: reuse approved motion across gear sets.

## Not used yet that would help

- `create_path_tiles` (32 px roads/trails) and `create_building_kit` (walls, doors, stairs) for towns and sewer rooms.
- `create_tiles_pro` square top-down for unique dungeon pieces.
- `create_ui_asset` panels and `create_font` for a purpose-built inventory/bestiary look.
- `create_portrait_character`: dialogue and party-frame portraits.
- `create_normal_map`: only if we later add dynamic lighting for torches.
- `animate_object` / `animate_image`: ambient torches, water, portals.
- `create_map` + `place_map_object`: free layout drafting.
- `get_pro_flash_capabilities` quotes and `*_pro_flash` tools if the newer pipeline beats v3 on fidelity.
- `select_object_frames` review flow to pick the best of several object candidates.
- Edit animation (Pro): fix one weapon/gear across a whole walk cycle (extension-only). Style-reference (Pro) for consistent icon batches. Create tiles (Pro) Paths mode (18-config autotile).
