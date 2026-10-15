# PixelLab Style-1 Kit (2026-10-15)

Style 1 = the "classic MMORPG readability" references: `scratchpad/style10/combat-1.png` (forest fight, shown at 2x) and `sewer.png` (native 1x). Straight top-down camera, calm bright ground, crisp dark-outlined sprites about 36 px tall on 32 px tiles. Signature grade (warm hearth-amber light against cool slate shadow) is applied by the ENGINE. Do not bake it into tiles. Rules: `docs/design/ART_BRIEF.md`.

All assets are in Tyler's PixelLab account. Names start with `S1`.

## 1. Sewer map (the real one)

**Map Workshop**: https://www.pixellab.ai/maps → **"Hearthrise — Sewer (style 1)"**, id `c8ed5928-aef3-409f-a712-c0ce2e73d46b`, 48×36 cells of 32 px, 46 objects placed.
(Ignore the older map with the same name, `b473b67e-…`. It was a first pass whose saturated-blue tileset drifted from the reference. Delete it in the web app.)

Layout (x,y cells): entrance corridor on the west (x0–7, y17–19, 3 wide) → **west junction hall** (x8–17, y12–23) → 2-wide doors → **channel hall** (x20–28, y2–33, sewage x23–25 with a floor rim at both ends; iron grate bridge at y18) → **east junction hall** (x31–38, y13–22) → 3×2 door → **Rat King room** (x42–46, y12–23). Four **medium spawn rooms** (10×7) hang off the halls through 2-wide corridors:

| Pocket | Room | Pack (grouped around the pull point) | Props |
|---|---|---|---|
| NW | x5–14 y2–8 | 4 giant rats around (10,5) | rat nest, crates, 2 torches |
| SW | x5–14 y27–33 | 3 slimes around (10,30) | rat nest, barrels, torch |
| NE | x31–40 y2–8 | **mid-fight pocket**: 3 venom spiders + 2 bats pulled tight onto the EK at (35,5) | bones, 2 torches |
| SE | x31–40 y27–33 | 3 kobolds around (36,30) | rat nest, crates, torch |
| Boss | x42–46 y12–23 | Rat King (44,17) + 2 rats | brazier, nest, bones, torch |

Preview renders (scratchpad, `…/scratchpad/k/`): `map_half.png` (full map at half scale), `sewer_fight_preview_2x.png` (NE pocket at 2x with the effects overlay drawn in).

## 2. Asset ids by use

### Sewer terrain (Wang tilesets, pro mode, the map's family)
| Use | Tileset id | Base tile ids |
|---|---|---|
| sewage water ↔ flagstone floor (curb) | `e0c9621c-fb2d-41df-a2fe-5039b76f9893` | water `21786242-b96f-4315-b9c8-e5184ad0b50a`, floor `6a3a2149-5a1d-4538-826d-208c0fe94e51` |
| floor ↔ wall top (brick wall face, 25 tiles) | `6c33367b-7748-47d8-8ab7-9d73b196c1b7` | wall top `040d3343-fb71-4da1-bc73-337ca576c2f3` |

Missing pair: water ↔ wall top. Don't let water touch wall. Leave a 1-cell floor rim, or generate that pair with both base ids.

### Sewer single tiles (Create Tiles Pro, style-matched from crops of sewer.png)
`0aa1a269-9c99-4433-844e-9da397cfff64` has 16 variants: flagstone ×2, mossy flagstone ×2, puddle ×2, rubble ×2, brick face, brick + slate cap ×2, iron drain grate ×2, sewage water. Tile 9 failed to download. Use the rest as fill/decals.

### Sewer props (Object Creator, Pro Flash, style image = crop of sewer.png)
| Prop | Object id |
|---|---|
| wall torch 32×48 | `55753820-4968-44d1-a5f7-c75da45bb5ff` |
| brazier | `919538c5-164c-4320-8187-c740af7297c6` |
| crates | `862bbc25-0d61-45be-a55f-0a2853b3dbe4` |
| barrels | `bc948c13-0667-4e26-9795-54a141316515` |
| rat nest 48 | `bde80354-9814-4d4e-886c-7aa81b2b0153` |
| bones | `2e4f8622-9db6-43fa-9633-a3296e847d71` |
| iron grate bridge, horizontal (used) | `b815f910-45f2-4148-b15d-649c49b658bd` |
| iron grate bridge, vertical | `a2a59aec-71c0-4e31-b29a-4a78190d5791` |

### Monsters (Pro Flash, 8 directions, 48 canvas ≈ 36 px body)
giant rat `01744036-6944-4548-a581-a408b4bf1bee` · slime `a53b1f35-5b54-47e4-be50-40a593b96392` · giant bat `3d41dcb0-204b-4cba-8b22-66ae711d449d` · venom spider `d6f7f699-30f0-4ed1-985e-62d41ae98bee` · kobold `27b8daf0-8222-4e0b-ac00-30cf6fa91b21` · **Rat King** (64 canvas) `3c137163-dbd3-4812-8a72-a518a58f0f20`

### Heroes (Pro Flash, 8 directions, style image = the reference knight crop)
default hero / EK knight `0793db1d-6d51-4345-acc4-8f181922d60b` · RP paladin `5d1317f2-d754-43b2-8df5-34c55eb0a3b9` · ED druid `70f41f81-6f79-47ff-8e8e-165f41cb3d51` · MS sorcerer `d3fb6041-ecfd-44b1-bd16-1689f9708ac2`

### Greenhaven / town terrain (Wang, pro mode, one chained family on the grass base `42099ab7-68ef-4c41-bed9-581b37501045`)
| Pair | Tileset id |
|---|---|
| dirt path ↔ grass | `c9c1dd5d-e97b-4b81-98d3-bf275c76abbb` (dirt base `97e71544-5fcf-4e48-94b7-c809721a12be`) |
| river water ↔ grass (bank) | `8cc1cd86-cc17-4cad-9fcd-419347743236` |
| dirt ↔ cobblestone | `adae9e76-2b79-488b-a32c-ccf6f2f975d5` (cobble base `dee38aee-3836-4643-bbd6-667470948201`) |
| grass ↔ forest floor | `edf46cbb-9b49-43fb-84d7-fe5a237f1ecf` |
| grass ↔ rock ground (raised) | `caacdbce-1b55-4dad-a9b5-b76b3c872395` |
Fill variants (Tiles Pro, style from combat-1 crops): `0be8539a-0d87-4136-beaf-e499afeea42d`: grass ×3 (plain, flowers, tufts), dirt ×2, cobble, mossy cobble, forest floor ×2, river water, rock, ruin flagstones. Some variants have a grey rim and the water is too saturated. Use those only as decals.
REJECTED (drifted, do not use): standard-mode tilesets `2bcf98d8-…`, `8e60c8d6-…`, `5d6e6d2a-…`, `0c3d7330-…`.

### Greenhaven props (Pro Flash, style = combat-1 crops)
oak `d3c23a6b-f6ca-42ff-9af5-d9aa56ecfeac` · pine `aff6bff0-64f1-45ba-9be5-87ab20aabc80` · bush `79674d6c-3b33-47e2-8571-45c9767c5bb2` · rocks `99a5ffd7-b069-42c5-a861-aca9835d7a38` · ruin wall `86d3e295-75ab-4b36-86a2-cbcd1ff6ffc7` · fence `997c2c21-b760-4ffb-a4c5-48cf1e311751` · lantern post `0711b801-fcf2-4c31-b414-7ed14ce67209`

## 3. Making NEW style-1 assets yourself

**Reference crops** (keep these. Uploads expire after 3 days, so re-upload when you need them). Crop from the two reference PNGs: a 32×32 floor/grass tile for tiles, a 32×32 or 48×48 prop crop for objects, and a 48×48 crop around the knight for characters. **Pro Flash refuses a style image larger than the canvas**, so crop to ≤ the canvas size.

| Making | Where | Tool & settings |
|---|---|---|
| Single tiles / fill variants | Create Tiles → Pro, **style mode** | `create_tiles_pro` with `style_images` = 1–3 32×32 crops (raw base64; the upload: ref is refused there). Number each tile in the prompt. Cost ~10–25/sheet. |
| Terrain transitions (Wang) | Create Tileset → Top-down (Map Workshop picks them up) | `create_topdown_tileset`, **mode=pro**, 32 px, high top-down. It takes NO style image, so chain `lower/upper_base_tile_id` from this kit. Use muted, low-contrast colour words. ~15/set. Standard mode drifts to saturated neon. Don't use it. |
| Props / objects | Object Creator https://www.pixellab.ai/create-object | `create_object_pro_flash`, n_directions 1, view high top-down, `style_image` = a prop crop ≤ canvas, "match palette, outline, shading". ~5 each. |
| Monsters / heroes | same, 8 directions | `create_object_pro_flash` n_directions 8, 48×48 (64 for bosses), style_image = 48×48 character crop. ~6 each. Place with `place_map_object` + `direction`. |

Prompt templates (copy, fill the brackets):
- **Tile**: `1). [material], muted [colour] 2). [material] with [small detail] 3). [material] with [puddle/moss/rubble]`. Keep it calm and low contrast, with no lighting baked in.
- **Wang tileset**: lower `[ground A], muted [colour], calm low contrast`; upper `[ground B], muted [colour], [texture]`; transition `[edge description]`; mode pro; chain the base id of whichever side already exists.
- **Object**: `[object] with [material details], top-down game prop`, + the style crop. For light sources add "warm amber flame". For everything else, no glow.
- **Character / monster**: `[creature/class], [2–3 colour words], [weapon/pose], game enemy sprite` (or `game player sprite`), + the 48 character crop. Monsters that live in amber-lit areas get COOL colours (grey-brown, slate) so they don't sink into the light.

## 4. Hunt layout & formation rules (for map building and the AI hunting model)

**Space sizing**
- Corridors: 2–3 tiles wide. They are for travel only, never spawn.
- Medium rooms (spawn pockets): about 10×7 tiles. One pack each.
- Junction halls: 8–10 × 10–12 tiles at every branch point, so a 4-player party can turn and re-form without anyone getting stuck.
- Keep a 2-tile clear lane through every room. Props go against walls and in corners: torches on wall faces, one nest near the pack, at most two clutter props per room.

**Packs**
- Each pocket holds one pack of 3–5, grouped within a 3×3 area around the pull point. Never spread evenly through the room.
- The boss room has the boss plus 2 adds flanking it.

**Party formation (Tibia-style automated hunt), measured from the EK along the line back toward the entrance**
- **EK (knight)** is at the front. It pulls and holds the pack tight around itself, with monsters on adjacent cells.
- **RP (paladin)** is 3 tiles behind and offset 1 tile sideways, shooting at range.
- **ED (druid)** is 5 tiles behind, on the opposite side, healing the EK.
- **MS (sorcerer)** is furthest back, 7–8 tiles behind. It may stand in the corridor or hall outside the room.
- In tight corridors the party stays in single file in the same order.

**Effects (readability)**: small 3–5 px hit sparks on the EK's targets, ONE tight AoE ring around the pack (not the whole room), short arrows of 1 tile or less, a small green heal sparkle on the EK. Nothing should cover the sprites.

## 5. Known pitfalls
- base64 pasted into a call gets truncated. For anything above about 1 KB, upload it with `get_upload_url` and pass `upload:<id>` (Pro Flash `style_image.url`, character refs). Tiles Pro `style_images` still needs raw base64, so keep those crops under about 1.5 KB.
- Three-terrain corners and terrain at the map border render BLACK. Wall in one extra ring outside the map and keep a single-terrain band between any two other terrains.
- Map Workshop only blends a pair that has its own tileset. Being in the same family is not enough.
- A Wang tileset's `upper` side needs room for its wall face, so rooms lose about half a tile at the top edge to the brick face. Size rooms so they still fit the pack after that.
- `view_map` renders without the engine grade, so the amber/slate look appears only in the game.
- Standard-mode Wang tilesets ignore muted colour words. Always use `mode=pro`.
