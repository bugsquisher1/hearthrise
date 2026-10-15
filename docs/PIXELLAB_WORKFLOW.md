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
6. **Seeds.** Record the seed of every accepted generation in the sidecar (`pixellab.seed`; `null` + `seed_note` if the tool showed none) so a near-miss can be rerun. Enforced for new art by `tests/art-provenance.mjs`; the style record is `docs/HEARTHRISE_ART_BIBLE.md`.

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
