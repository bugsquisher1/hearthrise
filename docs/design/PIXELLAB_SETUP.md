# PixelLab map setup for Hearthrise (2026-10-15)

## Where things are
Maps: https://www.pixellab.ai/maps (Map Workshop). Tilesets: Create Tileset -> use existing. Objects: https://www.pixellab.ai/create-object. Same account as the MCP key (Tier 3, ~8,08x generations left on 10-15).

## No project
Your PixelLab account has 0 projects, and the MCP cannot create one. Everything below is a plain account asset. Every web creator lists account assets, so you can still use it all. If you want a project anyway, make one in the web app, send me its id, and I will run `add_to_project` on every id below (it is free and safe to run twice).

## Starter map: "Hearthrise Sewer (starter)", id `2cb07f55-0083-4717-abac-68d5e769bb71`
Open it in the PixelLab web app under Map Workshop, in your maps list. It is a 40x30 blockout made of 32 px tiles: brick wall border, wet flagstone floor and a sewage channel across the middle. Its terrains are sewage water, wet flagstone, brick wall top, cellar earth and cellar flagstone (attached because they chain to it). Paint over the blockout freely.

## Tilesets (all 32 px, high top-down, chained by shared base tiles)
| Pair | Tileset id | Notes |
|---|---|---|
| cobble to grass (LIVE town ground) | `185818a3-afa7-4ea8-8aee-0c1c485bc997` | the style anchor for the new sets |
| dirt to grass (new) | `0fd478ac-d799-4a8b-9cb3-21cede769c6c` | chained on the live grass |
| dirt to cobble (new) | `45c9e543-aebb-4c43-bcf6-d17edf4f7539` | chained on the new dirt and the live cobble |
| sewage water to wet flagstone (new) | `38320fee-a261-4801-a101-64ce57d9a838` | the floor is chained on the live cellar flagstone |
| wet flagstone to brick wall top (new, 25 tiles, raised wall) | `a1eb9c5c-aefd-4ff5-b587-0f9552c05a86` | |
| cellar earth to flagstone (LIVE cellar) | `d6b2cf79-1e00-49ce-ba97-4789dc0a1107` | |
| From today's batch: dirt to grass (pro) | `28dfefbf-d987-4d29-bdbb-318aeccdecdb` | |
| From today's batch: cobble to grass (pro) | `416f2fe2-c9d4-4b9f-8ac3-2ccfe2cbd455` | |

To use a tileset in another map, open the web app's Create Tileset page and pick it as an existing tileset. In Map Workshop, a terrain from the same chain can be painted next to these. Two terrains blend only if a tileset exists for that exact pair; a pair without one renders black.

## Props and objects (in the web Object Creator)
- **Batch 1:** barrels `a9ac6b16`, crates `ff3e383d`, market stall `7579698d`, lantern `b8c24d32`, fountain `ec06c980`, grass tufts `4122b616`, pebbles `b82d1ddd`, dirt patch `2a1cbe30`.
- **Batch 2:** table `71827ec2`, hearth `7005b9d8`, shelves `82d63fdf`, rug `8de3f85e`, stall A `1c410b88`, stall B `1577cfa9`, crates `799d4cba`, barrels `4c96ac9a`, broken cobble `68904f53`, bush `bd88fada`, weeds `4042c87c`, tree `29357bec`.
- **Building kits:** stone `cfba9a55` and `150c3df9`, timber `60a65677`.

PixelLab's help could not confirm that these props can be placed directly in Map Workshop, so check the object panel there.

## Exporting, and what to send me
- Use **Download** in Map Workshop to get the full map as a PNG. PixelLab's help could not confirm whether a JSON or data export exists.
- **Best:** send me the **map id** (or just its name). I can read the terrain grid with `get_map` and `view_map` and import it into the game myself. Also send the PNG export if you like.

## Not done through MCP
- Creating a project: not supported.
- A "style_image" for tilesets: `create_topdown_tileset` has no such input. Style is carried over by chaining on the live tilesets' base tiles instead.
- Fill variants: skipped because the generation budget was already spent.

## Town blockout map: "Hearthrise Town (blockout)", id `c6f08812-b743-4f2a-9d96-6d020f7a699d`
This is a 64x48 blockout of the v0.5 blueprint. Grey cobble rectangles stand in for building footprints, the market plaza is cobble, the roads are dirt, the river is one tile wide and the sea runs along the bottom.
- **Simplified:** there is no mountain terrain, and the docks are left out.
- **Grass gaps:** the river breaks at the bridges, and there is a one-tile grass gap wherever dirt, cobble or water would otherwise meet. A pair with no tileset, or a corner where three terrains meet, renders black.
- **New tileset for it:** river water to grass, `68884353-21a4-4919-bce0-4cf5cdd09ed2`, chained on the live grass.
- **Remaining black tiles:** the only ones left are at the map border, where a water cell touches the empty space outside the map.
- **Not renamed:** the earlier test map `0eafce68` keeps its old name, because no MCP tool can rename a map. Rename it in Map Workshop.

## Fill variants (create_tiles_pro styled on each terrain's base tile, 32 px, 16 tiles per set)
| Terrain | tiles-pro id | Close enough to scatter |
|---|---|---|
| grass (live) | `1db50149-b86b-4b53-add0-a108d7a9f2ba` | 0, 2, 3, 4, 5, 8, 9, 14, 15 (the others are lighter or flatter and show a square) |
| cobble (live) | `ce4830ef-2ba8-4648-a921-3704b78885c4` | 7, 12, 13 (5, 6, 11 maybe; the rest are too light or too mossy) |
| dirt | `75cdaac3-000c-4c6c-af6c-c5706564d0bf` | not checked yet |
| wet flagstone (sewer) | `1494de50-7095-4770-8a5e-ec306ffc0aaf` | not checked yet |
| sewage water | `b16b1d21-ea0c-4970-b7a6-24432629fd90` | not checked yet |

These are single tiles, not Wang tilesets, so Map Workshop does not scatter them automatically. Use them as stamps, or let our renderer pick a variant at random for interior cells.
