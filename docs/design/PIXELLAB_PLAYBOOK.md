# PixelLab playbook: Hearthrise town + hunting-ground kit (research only, 0 generations spent)
Sources: [S:tool] = that tool's MCP schema; [H] = search_help answers (2026-10-15). "unverified" = no doc found.

## 1. Tool per asset family
| Family | Tool | Why |
|---|---|---|
| Ground terrain + transitions (grass/dirt/sand/cobble) | create_topdown_tileset | Dedicated corner-Wang model; chains via base tile ids; adds transition width + per-terrain refs [S:create_tiles_pro tile_feature note][S:create_topdown_tileset] |
| Roads / paths over ground | create_path_tiles | 18 configs (straights, corners, T, cross, dead-ends) with N/E/S/W edge rules [S:create_path_tiles] |
| Walls, floors, doors, pillars, stairs | create_building_kit | Matched vocabulary; walls 1-3 tiles high; wall outline follows the floor area [S:create_building_kit][H] |
| Loose tile variants (floor decals, rugs, crop tiles) | create_tiles_pro (style_images = existing tiles) | Only tile tool with style-image matching [S:create_tiles_pro] |
| Props (barrel, well, tree, stall, rock) | create_map_object (1 gen) or create_object_pro_flash (+style_image) | map_object can style-match a map crop via background_image [S:create_map_object][H] |
| Hero / NPCs / monsters | create_character_pro_flash -> animate_character | 8 V3 views built in; style_image; skeleton ready for animation [S:create_character_pro_flash] |
| Style anchor / key art | create_image_pro | Many candidates per call, labelled refs, hex palette + max_colors [S:create_image_pro] |
| Composition test | create_map -> edit_map -> place_map_object -> view_map | Terrain by regions, objects for silhouettes [S:create_map][S:edit_map][S:place_map_object] |
| Fix-ups | pixelart_workbench (free for subscribers) -> save_to_asset (free) | lint/repair/selout/shade, then write back into the asset [S:pixelart_workbench][S:save_to_asset] |

## 2. One style across everything
- **Fixed params everywhere:** view = "high top-down" (default for tileset + map_object; set it explicitly on pro_flash, whose default is "low top-down") [S:create_topdown_tileset][S:create_map_object][S:create_object_pro_flash]. Outline "single color outline", shading "medium shading", detail "medium detail" on every call that takes them.
- **One tile size:** 32 px. Path tiles REQUIRE 32 for square_topdown [S:create_path_tiles]; building kit accepts 16-96 [S:create_building_kit]; standard tileset 16/32 [S:create_topdown_tileset].
- **Palette:** pick one hex palette (e.g. a 24-32 colour Lospec ramp) and pass it to create_image_pro `palette` + `max_colors` for the anchor [S:create_image_pro]. Other tools have no palette param; enforce afterwards with reduce_colors / workbench (unverified per-tool). No project-wide palette exists [H].
- **Style image:** the anchor PNG URL goes into `style_image{url, usage_description}` + `style_options` all true on pro_flash characters/objects [S:create_character_pro_flash], `style_image_url` on create_image_pro, `style_images` on create_tiles_pro. Prefer URLs over base64 (MCP truncates big args) [S:create_image_pro].
- **Terrain chaining:** every tileset after the first passes the shared terrain's base tile id as lower/upper_base_tile_id [S:create_topdown_tileset].
- **Props match the ground:** create_map_object with `background_image` = a crop of the rendered map (inpaint, max 192x192) [S:create_map_object].
- **Seeds:** fixed seed per family (building kit, path tiles, pro_flash) for reproducible re-rolls; a seed does NOT guarantee shared style [H].
- **Projects:** create_map(project_id=...) and add_to_project(asset_id) so a game can load them; free, idempotent [S:create_map][S:add_to_project].

## 3. Call sequences
**A. Town terrain (standard, 32px, high top-down)** [S:create_topdown_tileset]
1. T1 lower "dirt", upper "lush grass", transition_size 0.25, transition_description "grass tufts over dirt" -> get_topdown_tileset -> note grass + dirt base ids.
2. T2 lower_base_tile_id=dirt, upper "worn cobblestone", transition_size 0 (hard kerb).
3. T3 lower "sand", upper_base_tile_id=grass, transition_size 0.5.
4. Optional T4 grass <-> water for the hunting ground pond.
Any two terrains WITHOUT their own tileset render black on the map; view_map names the missing pair [S:create_map]. Wang does no 3-way junctions [H]: design layouts so cobble never touches sand directly.
**B. Building kit** [S:create_building_kit]
- Stone: wall_description "thick grey stone block walls with mossy top cap", floor "worn flagstone floor", tile_type "square_topdown", tile_size 32, wall_tiles 2, layout "materials" (more consistent), outline_mode "segmentation" (cleaner seams), seed fixed.
- Timber: second kit, wall "white plaster and dark timber frame walls", floor "wooden plank floor", same params + seed.
- Roofless interiors = place the kit's floor + walls on a map; there is no roof switch [H]. Roofs as separate objects (create_object_pro_flash) layered over.
- Doors: kit ships doorway halves; door leaves as objects.
**C. Path:** create_path_tiles("lush grass with a packed dirt road", tile_size 32, outline_mode "segmentation", seed) [S:create_path_tiles].
**D. Props:** first prop via create_object_pro_flash(n_directions=1, width/height x4, view "high top-down", style_image=anchor); bulk props via create_map_object with background_image crop (1 gen each) [H].
**E. Test map:** create_map(name, tileset_id=T1, project_id) -> edit_map ops: rect grass base, rect cobble plaza, path dirt road width 2, rect sand edge (dry_run first) -> view_map -> place_map_object for houses/props/hero (show=true) [S:edit_map][S:place_map_object].
**F. Hero:** create_character_pro_flash(description, width 48/height 48 or 64, view "high top-down", style_image=anchor, seed) -> wait until skeleton prep completes [S:create_character_pro_flash] -> animate_character template "walking-8-frames" (all dirs), "breathing-idle"; custom attacks via v3 single dir then add directions with animation_group_id + same animation_name [S:animate_character]. 4-dir game = pass directions [south,north,east,west] to halve cost.

## 4. Costs (generations)
| Call | Cost | Src |
|---|---|---|
| create_topdown_tileset standard | 1-4, mean 3.1 (budget 4) | S |
| ... mode="pro" | 15 (<=32px), 25 above | S |
| create_building_kit | 10-25; needs 15 balance to start | H |
| create_path_tiles | unverified | - |
| create_map_object | 1 | H |
| create_image_pro | 10-25 per call, 64 candidates at <=32px | S |
| create_object_pro_flash / character_pro_flash | first image + rotations; exact unverified; reusing source image = free 1-dir, rotations only | S |
| animate_character template | 1/direction (8 per 8-dir clip) | S |
| ... v3 | ceil(w*h*frames/65536)/dir on grown canvas: 64px=1, 96px~3 | S |
| ... skeleton-v3 | 2-4/dir | S |
| create_map, add_to_project, save_to_asset, workbench | free | S/H |
Cheapest high-quality path: anchor via create_image_pro at <=32px (one call, 64 candidates) -> standard tilesets (~12 for 3) -> building kits (~2x15-25) -> map_object props (1 each) -> hero at 48-64px with template walk+idle on 4 dirs (8). Use check get_balance before each batch.

## 5. Pitfalls
- Tileset cost is NOT 1; plan 3-4 [S:create_topdown_tileset]. Pro tilesets may not show in Map Editor's terrain list [H]; prefer standard for map work.
- Pro at transition 0.5 returns 25 tiles, not 16 - autotiler must handle both layouts [S:create_topdown_tileset].
- Unpaired terrains render black [S:create_map]; no 3-way junctions [H].
- Baked borders: tiles_pro "outline" mode can leave outline artifacts at tile edges; "segmentation" avoids them [S:create_tiles_pro][S:create_building_kit].
- Oblique: tiles_pro supports oblique only for tileset/building features [S:create_tiles_pro]; our renderer is square top-down - avoid oblique entirely (reported broken; unverified in docs).
- Size limits: map_object 32-400 basic, 192 inpaint; pro_flash 16-256, multiples of 4; path square_topdown = 32 only; v3 frames x canvas <= 8x256x256.
- Base64 args get truncated - use URLs [S:create_image_pro][S:animate_character].
- create_image_pro has no facing control; rotate via create_object_pro_flash(first_frame...) [S:create_image_pro].
- Appending animation directions without repeating animation_name renames the group [S:animate_character].
- Maps only in Map Workshop top-down mode [H].

## 6. First batch after the reset (for Tyler's review; ~60-80 gens)
1. get_balance; create one project (list_projects).
2. **Anchor** (10-25): create_image_pro 32x32, palette + max_colors 24, "cozy medieval town tile sample: grass, cobble, stone wall cap, timber"; pick one; save_to_asset gallery:new.
3. **Stone building kit** (10-25), square_topdown 32, wall_tiles 2, materials, segmentation, seed 1101.
4. **Tilesets** (~12): T1 dirt/grass, T2 dirt->cobble, T3 sand<->grass, chained by base ids.
5. **Props** (~5): well, barrel, market stall, oak tree, lamp post via create_map_object (high top-down).
6. **Test corner**: create_map + edit_map (cobble plaza 10x8, dirt road, sand edge) + place kit pieces/props -> view_map image to Tyler. Hero waits for batch 2 once the look is approved.
