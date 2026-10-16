# PixelLab capability reference (condensed)

Sources (2026-10-16): pixellab.ai/docs index, pixellab.ai/mcp, and `mcp__pixellab__search_help` answers. Nothing was generated. Costs are in "generations" (gen). Items marked (unverified) came from the help agent without a doc page behind them. The per-tool web doc pages (api.pixellab.ai/v1/docs) were not crawled; parameter ranges below are from the MCP help text.

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

- `create_map_object(description, width, height, view)`: quick transparent prop, 1 gen, permanent, but not animatable and has no states/review. Basic mode needs width/height. Older doc text said map objects are auto-deleted after 8 h; the newer help says permanent (check before relying on it).
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
- Gotcha: only two terrains per set; three-way junctions are not automated (unverified).
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

## 12. Product surfaces (from docs index)

- Web creator, in-browser editor (Pixelorama), Aseprite extension, API (api.pixellab.ai/v1/docs), MCP (`https://api.pixellab.ai/mcp`, bearer token), Discord community.
- Docs sections not read in detail: init images and inpainting, creating maps, rotating a character, pose-to-image, depth image-to-image, re-pose, interpolate (old), Edit animation (Pro), Create walking character, Try on, Multi image, Reshape, tool options (guidance, colors, camera, projection).
- Hearthrise: "Edit animation (Pro)" and "Re-pose" may fix single bad frames; worth reading next.

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
- Unread docs pages (Edit animation Pro, Re-pose, Try on, Multi image, Reshape).
