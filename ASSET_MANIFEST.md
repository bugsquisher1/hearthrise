# Hearthrise — Asset Manifest

_Last updated: 2026-10-19 (live-ground monster combat clips, Asset Director); 2026-10-15 (World atlas registry, Art Director); 2026-08-08 (asset-organization pass, build b216; asset
promotion pass, build b224)._

The single reference for how Hearthrise's shipped assets are organized, what the
art direction is, and where everything that isn't shipped went. Supersedes the
old exploratory `ASSET_AUDIT.md` (May 2026), which described a plan that has
since been executed.

---

## Art direction (what "fits Hearthrise")

> **Superseded (2026-10-15).** This section records the August painted-icon direction. The current direction is pixel-world first: `docs/ART_DIRECTION.md` (the bible), `docs/ASSET_STANDARDS.md` and `docs/PIXELLAB_WORKFLOW.md`. Pixel art is the target language for items and monsters; painted art stays only where it has not been replaced yet. The text below is history.

Hearthrise is **100% painted RPG icons** in the CraftPix house style, framed by a
moody **"Forge & Stone"** dark UI (hearthlight theme: desaturated stone/iron
darks, candlelight warmth, gilt chrome). Verified against the running game:
homestead, skills, combat, inventory, equipment doll, farm, house.

An asset **fits** if it is:
- Hand-**painted** (not pixel-art, not flat vector, not 3D render),
- Warm/desaturated medieval palette with soft painterly rendering,
- Consistent lighting and outline weight with the shipped `painted/` sets.

An asset is **wrong** if it is pixel-art, a different rendering style, or from an
unrelated pack that would break cohesion. Gear tiers are conveyed by **rarity
borders**, not sprite recolors (bronze=gray … mythic=deep-red); shared material
sprites (e.g. one log for five wood tiers) are **hue-tinted** in CSS, not faked
as separate art.

---

## Active asset structure (`assets/` — this is what ships)

Only files actually referenced by the game live here. The tree was left in its
existing shape on purpose: `assets/icons-bundle/` is the single deployed icon
root, and its paths are hard-wired in ~360 places in `src/legacy.js` plus the
smoke test — renaming folders would break references for zero visual gain.

```
assets/
├── brand/            hearthrise-{crest.png,mark.png,wordmark.svg,splash.jpg,badge.svg}
│                     b361 lockup — DERIVED by tools/brand-process.mjs, never hand-edited
├── bg/               homestead-scene.svg              — brand scene art
├── ornaments/        corner-flourish.svg, wax-seal.svg — UI frame flourishes
├── icons/            24 SVG nav/topbar glyphs          — our own cocoa-line set
└── icons-bundle/     ← the only deployed icon root
    ├── painted/
    │   ├── monsters/   36 enemy portraits (rat … dragon, lich, death_knight,
    │   │               + the 6 Hunt boss portraits added b224 below)
    │   ├── items/      30 resource/food/drop icons (ores absent → resources/)
    │   ├── gear/       35 weapon/armour/tool/jewelry icons
    │   ├── companions/ wolf_pup.png, hawk.png — added b229 below
    │   └── npc/        player.png
    ├── resources/    21 material icons (bars, logs, stones, mushroom, egg,
    │                 + timber_beam/field_ration plates added b224 below)
    ├── buildings/    10 homestead/room/plot structures (forge, farm, tower…)
    ├── pixel/items/  one 32x32 pixel-world icon per ITEMS key (<id>.png), the ACTIVE
    │                 item set since 2026-10-14; see "Pixel item icons" below
    ├── pixel/supplies/  18 icons for the shop's basic supplies (salted food, thin drinks,
    │                 plain ammo), one per BASIC_SUPPLIES id; added 2026-10-21, see below
    ├── pixel/abilities/  32x32 framed ability tiles (13), keyed by ability id; cleave added 2026-10-21
    ├── medieval/     BlacksmithInstruments.png (anvil), Cog.png (iron_fitting,
    │                 added b224)
    └── backgrounds/  dungeon.jpg (combat/dungeon backdrop)
```

### Pixel item icons (2026-10-14) — the active item set

Every key of `src/data/items.js` has `assets/icons-bundle/pixel/items/<id>.png`: 32x32 native,
RGBA with binary alpha, every opaque pixel on the locked `hr-world-56-v2` palette
(`art/world/palette.json`), dark 1 px outline, light from the top-left, centred. Shown at x2 with
`image-rendering: pixelated` (`art-direction.css`). Made with PixelLab `create_image_pixen`, one fixed
seed and one shared prompt per family so tiers read as one set (ore, bar, plate; every tier of a weapon or
armour line), then snapped in Lab to the palette (metal tiers to their own ramp). Never from third-party game art.

- ONE SWITCH: `ITEM_ART_SET` in `src/data/item-art.js` (`'pixel'` | `'painted'`). `'painted'` restores
  the Hearthfire painted set and the wood tints in one line; the painted files stay on disk untouched.
- The filename is derived from the id, so `tests/pixel-icons.mjs` (+ `--selftest`) is the whole manifest:
  one icon per ITEMS key, no orphans, 32x32, on-palette, no partial alpha.
- Contact sheets (60 per sheet, read at x3): `docs/art-experiments/pixel-icons/`.
- Out of scope: monster portraits, skill medallions, building art (unchanged).

### Shop supply icons, drinks, practice kit, Cleave (2026-10-21, Asset Director)
Drawn with the pixel scripts (no PixelLab credits spent), on the locked palette, 32x32, dark outline, light from the upper left.
- `pixel/supplies/<id>.png`: one per `BASIC_SUPPLIES` row (src/data/supply-basics.js), 18 files. Not items, so not under
  `items/`. Wired by `SUPPLY_DIR` (item-art.js) and `itemIconHtml`/`actionIconHtml` (src/shell/widgets/bits.js).
  Salted food = its cooked partner's silhouette cured to a pale tan with a salt rim and crystals (reads as a different dish
  beside the cooked one). Thin drinks = one plain wooden mug, liquid colour per tier, N carved tally notches for tier N
  (a non-colour cue). Plain ammo = unstained ash shaft, two bone-white vanes, a bare head in its partner's metal.
  There are no basic runes (supply-basics.js: the per-swing rune ladder was retired), so no plain-rune icons exist.
- The six crafted drinks (`turnip_juice` .. `emberfruit_cordial`) were one jar recoloured; each is now its own vessel
  (flask, bottle, jar, jug, teacup, decanter) with a small ingredient cue. `moonbloom_elixir` keeps the original jar.
- Seven practice-kit items (`practice_sword/hatchets/club/bow/wand/staff/spellbook`) were byte-identical to tier-1
  art; each now has its own ash-and-rope training look with a red rag (`practice_shield`, `practice_crossbow` were already unique).
- `pixel/abilities/cleave.png`: the set's own frame and slate, axe and swing arc. The ability tiles are NOT on the world
  palette (ported from the hunt sim, 1024 opaque px each); Cleave uses colours sampled from them so it matches its siblings.
  `rend` (inactive) still shows a glyph.
- Guard: `tests/pixel-icons.mjs` now also requires the supply folder (missing/orphan/size/palette/alpha/empty) and a
  `duplicate` rule (two ids with byte-identical icons) for items and supplies. One known twin remains and is listed in
  KNOWN_TWINS: `crown_shard` = `crown_of_the_fallen_king` (needs its own art).

### Imbuement item icons (2026-10-21, Asset Director)
The eleven Thicket/Sewer imbuement items (`src/data/imbuements.js`) each have their own `pixel/items/<id>.png`, drawn with a
pixel script (no PixelLab credits): `whelp_milk_tooth` (cream baby tooth), `gray_dewclaw` (dark hooked horn, fur cuff),
`briar_burr` (thorned seed pod, gray hair), `dire_hackle` (dark-tipped bristle fan on hide), `grayjaw_whisker` (long pale
whisker, root bulb), `rat_incisor` (orange curved chisel tooth), `sump_membrane` (torn teal skin), `kobold_scale` (olive fan
scale, radial ridges), `culvert_bat_fang` (needle fang, blood bead), `cistern_venom_gland` (green sac, red duct, drip),
`knotted_tails` (pink ringed tails in a trefoil knot). Same 32x32 / palette / outline / top-left light as the creature parts.
Their eleven KNOWN_TWINS entries are gone: the guard now enforces unique art. Wiring is unchanged (filename derives from the id).

### Live-ground monster clips (2026-10-19) — the blow, the fall and the corpse
Every monster on Mill Cellar, Millrace Sewer, Meadowbrook Thicket and Coppercap Warrens must be drawable through a whole
kill: idle and walk in 8 facings, `attack`, `death` and the held `corpse` in s/e/n/w (`tests/world-assets.mjs` rule `[live]`, read
from `HUNT_GROUNDS` and `HUNTS`, so a new spawn is covered the day it lands). The wolves and goblins carry drawn clips. The nine
that had none (rat, slime, hive_wasp, drain_rat, sump_slime, culvert_bat, cistern_spider, kobold_tosher, rat_king) get
`node tools/world-art/derive-combat.mjs` (`--check` for drift): their own idle pixels, moved by whole pixels, flipped, squashed or
quarter-turned; nothing is borrowed or scaled up. These are a stand-in for drawn death clips, not a replacement:
a PixelLab death/attack per creature (`docs/PIXELLAB_WORKFLOW.md`) supersedes a derived row when Tyler approves a spend.
The `hunt` atlas is 2048x1808 of its 2048x2048 cap: the next monster set goes in its own set.

### World atlas registry (2026-10-15) — every world sprite and terrain, and what happens to it

The registry Tyler's PixelLab directive asks for; there is no second registry. One row per sidecar in
`art/world/<set>/*.json` (124 today), printed by `node tools/world-art/registry.mjs` from the sidecars
and the built manifests, plus the Art Director's decision (the `D` table in that script). **retain** =
ships as is; **edit** = keep the asset and change it, cheapest fix first (`docs/PIXELLAB_WORKFLOW.md`);
**replace** = a new asset. **Approval:** every row was approved for the world when its atlas was built
(W1–W3, the art pilot, the b585 town and home sets; Art Director). A row whose asset changes records its
new approval in the decision cell (`approved: <role> <date>`) when the change lands. Facings `senw` =
s, e, n, w; animation states are `clip frames@fps`; the PixelLab id is its first 8 characters, and the
full id, request, animation group ids, seed and cost live in the sidecar's `pixellab` block. After a
build, re-run the script and paste its output here; never hand-merge the table.

Open edits from the 2026-10-15 audit (`docs/design/ART_AUDIT_2026-10-15.md`): the first production
batch (R1 hero south walk, R2 hero diagonals, R3 rat and slime readability, R4 loot bag) is specified in
`docs/PIXELLAB_WORKFLOW.md` §5; everything else waits for Tyler's first playable test. R1a, R3 and R4
landed 2026-10-15 (40 generations, all R3; approval pending Tyler); R2 waits for the engine's 8 facings.

| id | set | class | frame | animation states (frames@fps) | facings | decision | source (PixelLab tool, id) |
|---|---|---|---|---|---|---|---|
| hero | hero | character | 64×64 | idle 5@5, walk 8@10, attack 7@12, down 7@8 | senw | **edit**: R1a done 2026-10-15: the south walk lifts both feet (free hand edit, 0 gens, saved to walk group `e0833032`); open: 4 diagonal facings (idle, walk; R2), no hit clip; approved: pending Tyler | create_character `03dec2e0` |
| peer_knight | hero | character | 64×64 | idle 1 | senw | **edit**: one still frame per facing; needs idle + walk to be a real peer | create_character `c95a6991` |
| peer_mage | hero | character | 64×64 | idle 1 | senw | **edit**: one still frame per facing; needs idle + walk | create_character `6112c21c` |
| peer_ranger | hero | character | 64×64 | idle 1 | senw | **edit**: one still frame per facing; needs idle + walk | create_character `f2a0b6c7` |
| barrel | cellar | barrel | 24×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| barrel_banded | cellar | barrel | 24×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| barrel_broken | cellar | bulky | 28×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| barrel_lid | cellar | barrel | 24×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| barrel_old | cellar | barrel | 24×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| bone | cellar | small | 16×16 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| bones | cellar | small | 16×16 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| bottle | cellar | small | 16×14 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| brazier | cellar | fixture | 26×32 | idle 1 | s | **edit**: still flame; needs a 4-frame flicker | create_1_direction_object `b90e189e` |
| candle | cellar | small | 10×14 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| cart_wheel | cellar | bulky | 30×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| cellar_earth | cellar | terrain | 32×32 tiles | still |  | **retain** | hand / script |
| cellar_floor | cellar | terrain | 32×32 tiles | still |  | **retain**: unused today: the hunt floor is the flat cellar_earth fill (the flagstone patch read as a raised slab) | create_topdown_tileset `d6b2cf79` |
| chest | cellar | box | 24×22 | idle 1 | s | **retain** | create_object_pro_flash `7480726a` |
| chopping_block | cellar | bulky | 28×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| coins | cellar | small | 16×12 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| coins_scattered | cellar | small | 14×12 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| crate | cellar | box | 18×22 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| crate_stack | cellar | bulky | 30×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| flour_sack | cellar | clutter | 26×26 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| grain_sack | cellar | clutter | 26×24 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| grain_spill | cellar | decal | 16×12 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| hive_wasp | cellar | flier | 48×48 | idle 1, walk 4@12, attack 7@12, hit 5@12, death 7@10, corpse 1 | senw | **retain**: body edge 4.67:1; idle is 1 still frame (add a wing-buzz idle later) | create_object_pro_flash `630c2cff` |
| ladder | cellar | hanging | 18×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| lantern_post | cellar | fixture | 22×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| loot_bag | cellar | loot | 14×14 | idle 1 | s | **replace**: R4 done 2026-10-15: a 14×14 tied burlap sack drawn by hand in palette (0 gens), body edge 1.06 → 3.21:1, lands beside the corpse; approved: pending Tyler | hand-drawn in palette (free, no generation) |
| millstone | cellar | bulky | 28×30 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| mushrooms | cellar | small | 16×16 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| pebbles | cellar | decal | 14×12 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| puddle | cellar | decal | 16×12 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| rat | cellar | critter | 48×48 | idle 1, walk 6@10, attack 7@12, hit 5@12, death 7@10, corpse 1 | senw | **edit**: R3 done 2026-10-15: body edge 2.36 → 4.03:1 (min 3.76 over the 27 east frames), silhouette IoU ≥ 0.985, edit_image `4ef84f2b` + `f6a044fa`, 20 gens; open: idle is 1 still frame; approved: pending Tyler | create_object_pro_flash `18ec0bfa` |
| rat_skull | cellar | small | 12×12 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| sack_lying | cellar | clutter | 32×20 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| sack_pile | cellar | bulky | 32×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| sack_stack | cellar | bulky | 32×30 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| sack_tall | cellar | bulky | 26×30 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| skull | cellar | small | 14×14 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| slime | cellar | critter | 48×48 | idle 1, walk 6@8, attack 7@12, hit 5@12, death 7@10, corpse 1 | senw | **edit**: R3 done 2026-10-15: body edge 2.59 → 4.33:1 (min 3.68 over the 27 east frames), silhouette IoU ≥ 0.978, edit_image `99916c7b` + `5436c660`, 20 gens; open: idle is 1 still frame; approved: pending Tyler | create_object_pro_flash `4bef8259` |
| stone_cap | cellar | wallcap | 12×32 | idle 1 | s | **retain** | hand / script |
| stone_cap_h | cellar | wallcap | 32×12 | idle 1 | s | **retain** | hand / script |
| stone_cap_w | cellar | wallcap | 12×32 | idle 1 | s | **retain** | hand / script |
| stone_end | cellar | wallend | 12×60 | idle 1 | s | **retain** | hand / script |
| stone_stub | cellar | stub | 32×24 | face 4 | s | **retain** | hand / script |
| stone_wall | cellar | wall | 32×60 | face 4 | s | **retain** | hand / script |
| stone_wall_arch | cellar | wall | 32×60 | face 4 | s | **retain** | hand / script |
| straw | cellar | decal | 16×14 | idle 1 | s | **retain** | create_1_direction_object `53ef2fe1` |
| support_post | cellar | fixture | 30×34 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| wall_torch | cellar | hanging | 16×32 | idle 1 | s | **edit**: still flame; needs a 4-frame flicker | create_1_direction_object `b90e189e` |
| wasp_nest | cellar | hanging | 30×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| web | cellar | hanging | 34×34 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| anvil | town | bulky | 32×22 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| apple_crate | town | bulky | 28×30 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| barrel_planter | town | barrel | 24×32 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| bench | town | bench | 50×16 | idle 1 | s | **retain** | create_map_object `2acdbc69` |
| bush | town | bush | 30×30 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| chimney | town | roof | 18×30 | idle 1 | s | **retain** | hand / script |
| deadtree | town | tree | 78×112 | idle 1 | s | **retain** | create_map_object `2b56133f` |
| door | town | door | 22×50 | idle 1 | s | **retain** | create_object_pro_flash `699000ad` |
| firewood | town | bulky | 30×30 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| flower_bed | town | clutter | 32×24 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| flower_box | town | hanging | 30×30 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| hatch | town | decal | 24×28 | idle 1 | s | **retain** | create_map_object `c4645c68` |
| hedge | town | bush | 30×30 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| lamppost | town | fixture | 12×62 | idle 1 | s | **retain** | create_map_object `f1f557ff` |
| mill_sign | town | hanging | 22×32 | idle 1 | s | **retain** | create_map_object `19a01b33` |
| noticeboard | town | fixture | 34×42 | idle 1 | s | **retain** | create_map_object `970b0bf5` |
| npc_crier | town | character | 64×64 | idle 1 | senw | **edit**: one still frame; needs a 4-frame idle (town life) | create_character `1356ca8d` |
| npc_smith | town | character | 64×64 | idle 1 | senw | **edit**: one still frame; needs a hammer loop (town life) | create_character `33ea8f13` |
| oak | town | tree | 88×114 | idle 1 | s | **retain** | create_map_object `7d86bc0a` |
| pine | town | tree | 74×114 | idle 1 | s | **retain** | create_map_object `73c5a2ba` |
| roof_slate | town | roof | 32×32 | slice 12 | s | **retain** | hand / script |
| roof_wood | town | roof | 32×32 | slice 12 | s | **retain** | hand / script |
| signpost | town | fixture | 24×32 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| statue | town | fixture | 20×64 | idle 1 | s | **retain** | create_map_object `13598478` |
| stone_house_end | town | wallend | 12×60 | idle 1 | s | **retain** | hand / script |
| stone_house_wall | town | wall | 32×60 | face 4 | s | **retain** | hand / script |
| stone_house_wall_door | town | wall | 32×60 | face 4 | s | **retain** | hand / script |
| stone_house_wall_window | town | wall | 32×60 | face 4 | s | **retain** | hand / script |
| timber_end | town | wallend | 12×60 | idle 1 | s | **retain** | hand / script |
| timber_wall | town | wall | 32×60 | face 4 | s | **retain** | hand / script |
| timber_wall_door | town | wall | 32×60 | face 4 | s | **retain** | hand / script |
| timber_wall_window | town | wall | 32×60 | face 4 | s | **retain** | hand / script |
| town_ground | town | terrain | 32×32 tiles | still |  | **edit**: one cobble fill with no wear, no edging and no square border: the "bland" town (after playable) | create_topdown_tileset `185818a3` |
| waterwheel | town | fixture | 58×68 | idle 1 | s | **edit**: still; needs a turning loop (the town's one big motion) | create_map_object `23d8714a` |
| well | town | fixture | 40×52 | idle 1 | s | **retain** | create_map_object `58e523ba` |
| woodpile | town | fixture | 44×34 | idle 1 | s | **retain** | create_map_object `71b58870` |
| young_oak | town | sapling | 46×90 | idle 1 | s | **retain** | create_map_object `74bbd1b0` |
| altar | home | fixture | 32×40 | idle 1 | s | **retain** | create_map_object `ed166eb3` |
| armour_stand | home | fixture | 24×34 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| banner | home | hanging | 28×32 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| basket | home | clutter | 28×28 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| bed | home | bed | 30×54 | idle 1 | s | **retain** | create_map_object `a049363d` |
| bellows | home | clutter | 32×24 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| bookshelf | home | fixture | 26×54 | idle 1 | s | **retain** | create_map_object `c36e6293` |
| candelabra | home | clutter | 24×32 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| chair | home | seat | 20×32 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| chair_side | home | seat | 18×32 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| chest_iron | home | box | 28×24 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| counter | home | station | 58×32 | idle 1 | s | **retain** | create_map_object `9c3ea5da` |
| desk | home | station | 34×34 | idle 1 | s | **retain** | create_map_object `20eb5ea7` |
| display_case | home | fixture | 26×32 | idle 1 | s | **retain** | create_map_object `59eb740f` |
| dummy | home | fixture | 30×32 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| forge | home | fixture | 32×54 | idle 1 | s | **retain** | create_map_object `0de56b00` |
| grindstone | home | station | 28×26 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |
| hearth | home | fixture | 60×64 | idle 1 | s | **retain** | create_map_object `db702bc0` |
| herbs_hanging | home | hanging | 32×26 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| plank_cap | home | wallcap | 12×32 | idle 1 | s | **retain** | hand / script |
| plank_end | home | wallend | 12×60 | idle 1 | s | **retain** | hand / script |
| plank_floor | home | terrain | 32×32 tiles | still |  | **retain** | hand / script |
| plank_stub | home | stub | 32×24 | face 4 | s | **retain** | hand / script |
| plank_wall | home | wall | 32×60 | face 4 | s | **retain** | hand / script |
| plank_wall_door | home | wall | 32×60 | face 4 | s | **retain** | hand / script |
| rug | home | decal | 68×40 | idle 1 | s | **retain** | hand / script |
| shield_wall | home | hanging | 26×28 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| swords_wall | home | hanging | 30×30 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| table | home | table | 30×28 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| trophy_wolf | home | hanging | 26×32 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| wardrobe | home | fixture | 34×58 | idle 1 | s | **retain** | create_map_object `f7842a79` |
| weapon_rack | home | fixture | 30×32 | idle 1 | s | **retain** | create_1_direction_object `8304f632` |
| workbench | home | station | 32×32 | idle 1 | s | **retain** | create_1_direction_object `b90e189e` |

### b224 — Asset Director promotion pass

Six Hunt boss portraits, one Castle Stores cog, one beam and one loaf were
promoted from `_archive/reserve-art/` (never modified there — copied out).
Everything below is judged against the shipped painted CraftPix house style
and each item's actual in-game identity, not just folder membership.

**Hunt bosses (`src/features/raids.js` — the six were rendering as a
typographic glyph only).** Matched by flavour text, not just filename:

| Boss (`src/features/raids.js` id) | Flavour | Archive source | Bundle path |
|---|---|---|---|
| `emberclad_tyrant` — The Emberclad Tyrant | "a furnace given a crown… slag-armor weeps molten iron" | `reserve-art/monster-portraits/Demon_01_nobg.png` | `painted/monsters/emberclad_tyrant.png` |
| `hollow_regent` — The Hollow Regent | "a king who outlived his own bones. The crown remembers" | `reserve-art/monster-portraits/Monster_SkeletonKing_nb.png` | `painted/monsters/hollow_regent.png` |
| `maw_below` — The Maw Below | "the lake was never empty" — a literal gaping maw beat a tentacle for the boss's own name | `reserve-art/monster-portraits/Monster_Worm_nb.png` | `painted/monsters/maw_below.png` |
| `sunken_choir` — The Sunken Choir | "drowned cantors beneath the ice" | `reserve-art/monster-portraits/Monster_FrostSkeleton_nb.png` | `painted/monsters/sunken_choir.png` |
| `warden_long_dark` — Warden of the Long Dark | "set to guard a door… it still guards" | `reserve-art/monster-portraits/Giant_StoneGolem_nb.png` | `painted/monsters/warden_long_dark.png` |
| `crownless_wyrm` — The Crownless Wyrm | wyrm/dragon that "ate the king who named it" | `reserve-art/monster-portraits/Monster_WarDragon_nb.png` | `painted/monsters/crownless_wyrm.png` |

Wired via a new `BOSS_PORTRAIT` map + `bossPortraitHtml()` helper in
`raids.js`, rendered as a 40px gilt-bordered circular portrait in the Hunt
card's `card-head` (both the clan and Lone Hunt cards). The helper returns
`''` for any boss without a mapped path (no `<img>` at all) and every `<img>`
carries `onerror="this.remove()"` — a missing file removes itself rather than
showing a broken-image icon; the boss's typographic `glyph` in the card title
is the fallback identity mark either way. Guarded by
`src/features/smoke-test.js` ("b224: Hunt boss portraits…").

**Castle Stores goods (b222 brief, `src/data/items.js` / wired in
`applyLocalIcons()`, `src/legacy.js`).** Judged against every candidate in
`materials-bars/`, `ore-stone-piles/`, `gems-crystals/`, `food/` and
`props-and-tools/`:

| Item | Archive source | Bundle path | Verdict |
|---|---|---|---|
| `timber_beam` | `reserve-art/ore-stone-piles/Res_23_oldwood.png` | `resources/Res_23_oldwood.png` | promoted — a squared, aged wood plank reads exactly as a structural beam |
| `field_ration` | `reserve-art/food/Res_137_bread.png` | `resources/Res_137_bread.png` | promoted — a baked loaf |
| `iron_fitting` | `reserve-art/props-and-tools/Cog.png` | `medieval/Cog.png` | promoted — a cast-iron mechanical component reads as fabricated ironwork/hardware, closer to a "fitting" than a raw bar |
| `keystone` | — | — (kept on gilt atlas glyph) | **rejected** — nothing in reserve-art reads as a carved/cut masonry block; the ore-stone-piles are raw ore-vein mounds and the gems-crystals are polished gems. A wrong painting is worse than the existing glyph. |

**In-passing bug found and fixed while verifying `keystone`.**
`__mapGeneratedGearIcons()` (bottom of `legacy.js`, maps generated tier gear
to shared slot art) matched "id ends with slot key" as
`id.indexOf(k) === id.length - k.length` with no check that `indexOf` actually
found anything. `indexOf` returns `-1` for an absent key, and `id.length -
k.length` is also `-1` whenever `k` is exactly one character longer than
`id` — so any 8-character `.tier` item with no hand-mapped icon false-matched
`platebody`/`gauntlets`/`warhammer` (all 9 chars). `keystone` (8 chars,
`tier:5`, no hand-mapped icon) was being silently painted as a **steel
platebody** instead of falling through to its glyph — the exact "wrong
painting" this pass was checking for, caused one file away from where I was
looking. Fixed to require a real match (`idx >= 0 && idx === id.length -
k.length`); regression-guarded ("b224: castle-stores goods never get a
false-matched gear icon").

**Shop keeper NPC — rejected, SVG keeper stands.** `Duke_nb.png` /
`Warrior_nb.png` / `ElfMage_nb.png` (`reserve-art/monster-portraits/`) are
genuinely well-painted human busts. Judged RENDERED: temporarily overlaid
each at the keeper's position in the live `SHOP_SCENE` (`src/legacy.js`,
`#panel-shop`) at localhost:8153, screenshotted, then removed (nothing
committed). All three read as a rectangular photographic bust pasted over the
scene's flat vector silhouette art — the exact "sticker" failure the Art
Director's b221 log documented fixing once already for the rim-light. None
carries the lantern-side rim light the hand-tuned SVG keeper does, and
replacing the figure drops its forearm-on-counter / apron / coif body
language and its relationship to the hen. Duke was the strongest of the
three (warm-toned, plausibly a merchant) but still net-worse in scene than
the validated, Tyler-approved SVG keeper. **No promotion — verdict: SVG
keeper stands.**

**Homestead dusk plates (b219 brief) and hen/chick (b221 brief) — closed,
not actioned; nothing in reserve-art fits either.** Checked every category
folder plus `CATALOG.html`: `backgrounds/` holds only `ruins.jpg`, a bright
flat-cel-shaded cartoon ruins scene — wrong medium (not painted), wrong tone
(daylight, not dusk), and not shaped as a 5:1/8:1 identity band. The 7
`Animals_*` portraits are a dolphin, an armoured horse, a falcon, a boar, a
wolf, a bear-cat/lynx and a vulture-beaked bird — no hen or chick anywhere,
shipped or archived. Both briefs still need a human artist/commission; not
closeable by promotion.

### b229 — the Stable's pet icons ("we need to figure out what to do about pet icons")

The Stable rendered its full roster — 22 companions/pets (12 base companions
in `src/data/companions.js` + 10 skill/boss pets added b202) — as raw emoji in
`.sc-icon`, the widest single 0-emoji-rule violation on one screen (Art
Director audit, 2026-08-08). Judged every companion by identity against the 7
painted `Animals_*` portraits in `reserve-art/monster-portraits/` (dolphin,
armoured horse, falcon, boar, wolf, lynx, vulture — the same 7 the b224 pass
already confirmed hold no hen/chick) plus a re-sweep of the rest of that
superseded monster set and `_archive/raw-packs/icons3/` for anything else that
reads as a creature portrait in style:

| Companion (`COMPANIONS` id) | Archive source | Bundle path | Verdict |
|---|---|---|---|
| `wolf_pup` — Wolf Pup | `reserve-art/monster-portraits/Animals_07_nobg.png` | `painted/companions/wolf_pup.png` | **promoted** — a wolf companion gets the wolf. Honest caveat: the painting is an adult wolf, not a pup; accepted on species identity, same bar as "a wolf companion gets the wolf" from the b224 brief. |
| `hawk` — Hawk | `reserve-art/monster-portraits/Animals_05_nobg.png` | `painted/companions/hawk.png` | **promoted** — the file is a generic hooked-beak bird-of-prey portrait (closer to a falcon than a hawk technically), but it doesn't claim a false species the way a songbird or scavenger would; same "bird of prey" identity as the Hawk companion's own gather/rareDrop flavour. |
| `sparrow` (small songbird), `owl` (round-faced nocturnal raptor), `heron` (wading bird) | `Animals_05` (falcon) is the only other bird | — | **rejected** — a fierce hooked-beak raptor face is a false identity for a sparrow (delicate songbird), an owl (distinct round face/forward eyes) or a heron (long-necked wader). Reusing the hawk's file for any of these would be the "dolphin for a fox" mistake. |
| `whelp`, `dragonling` (both dragons) | `_archive/reserve-art/monster-portraits/Monster_WarDragon_nb.png` — already promoted b224 as the Hunt boss `crownless_wyrm` | — | **rejected** — reusing a raid boss's own portrait for an unrelated companion (and a "whelp"/baby dragon at that, a life-stage mismatch on top) borrows another character's identity. No other dragon art exists in reserve. |
| `fox`, `bunny`, `honeybee`, `badger`, `scorpion`, `raccoon`, `tortoise`, `beaver`, `rock_golem`, `squirrel`, `phoenix_chick`, `forge_imp`, `silkling`, `grave_wisp`, `lichling` (15) | none | — | **rejected — no honest match anywhere on disk.** reserve-art's non-bird animals are a dolphin, an armoured horse, a boar and a lynx; none of these 15 species/creatures. `_archive/raw-packs/icons3/` has name-adjacent hits (`phoenix.png`, `summon_imp.png`, `Skill_Phoenix.png`, dragon/golem/spider skill icons) but that pack is a flatter icon-illustration style, never curated into `assets/`, and explicitly not a shipped source per `CLAUDE.md` ("assets/raw-bundle/, icons3/, etc. are NOT shipped") — mixing that style into the Stable next to the painted Hunt bosses and the 2 promoted portraits would read as inconsistent, not "found." |

**Render seam.** `window.companionIconHtml(id, px)` (`src/legacy.js`, defined
right after `window.COMPANIONS`) mirrors `bossPortraitHtml()`: a painted
portrait `<img>` (`onerror="this.remove()"`, never a broken-image icon) for
the 2 matched ids, else the shared gilt "paw" atlas glyph (`HR.medallion
('uiPaw', px)`, `uiPaw` already existed in `src/data/glyphs.js`) — never
emoji, never blank. `def.icon` stays an emoji in the data (other consumers may
still read it as a text label; not worth churning); every RENDER seam bypasses
it instead:
- Stable grid card (`.sc-icon`) — both `src/features/companions.js`
  `renderStable()` (the live one, wins the DOM after both showTab hooks fire)
  and `src/legacy.js`'s own superseded `renderStable()` (kept in sync as a
  defense-in-depth fallback — see `src/features/companions.js` for why the
  legacy one still exists and loses the race).
- Doll's companion equip slot (`.td-companion-slot`, `window.buildTibiaDoll()`
  in `src/legacy.js`) — **also fixed a real bug found in passing**: this slot
  resolved the equipped companion through `ITEMS[G.equipment.companion]` like
  every other gear slot, but `equipCompanion()` only ever mirrors the legacy
  `fox_companion` item id into `G.equipment.companion` for the fox — every
  other companion (wolf_pup, hawk, ...) writes its raw `COMPANIONS` id there,
  which `ITEMS` doesn't have. That silently rendered 21 of the 22 companions
  as an **empty slot** here even while equipped. Now resolves from
  `G.companions.equipped` / `window.COMPANIONS` directly, matching the info
  panel beside it. This doll is shared by the Character page and the
  Inventory page's equipment column (`window.buildTibiaDoll()` is the single
  builder for both), so the fix covers both surfaces.
- Character page's companion detail pane (`.td-comp-icon`).
- Profile mini-card (`.cc-icon`, `dash-user-body`) — both the live ESM
  `injectProfileCard()` and the superseded `legacy.js` copy.
- Shop's "buy a companion" rows (`.si`, `injectShopCompanions()` into
  `#panel-shop`'s Equipment tab).

Toast/notify copy (`"🎉 New companion unlocked: <emoji> <name>!"` and similar)
was left alone — that emoji-prefixed-toast convention is pervasive across the
whole game (auto-actions, collection-log, etc.), not a companion-specific
issue, and out of this pass's surface.

**Sizes:** Stable grid 44px, doll slot 44px, character detail pane 28px,
profile mini-card 32px, shop row 28px — matched to each seam's prior
font-size-driven emoji footprint.

**How icons are wired:** every game item/monster/room ID maps to a path in the
`LOCAL_*_ICON` maps inside `applyLocalIcons()` at the bottom of `src/legacy.js`.
That IIFE is the single source of truth. Generated tier gear is mapped to the
closest owned slot art by `window.__mapGeneratedGearIcons()`. Nav/topbar SVGs are
applied by `src/icon-swap.js` (map keyed by `data-tab`). Companion icons are
their own seam, `window.companionIconHtml()` — see b229 above.

### Naming
Existing conventions were preserved (renaming would break the wired paths):
- Painted sets use game-ID `snake_case` (`death_knight.png`, `iron_sword.png`).
- The `resources/` pack keeps its vendor `Res_NN_name.png` names — these are
  referenced verbatim in code, so they were intentionally **not** renamed.
- Buildings keep their `Building_NN_role_nobg.png` pack names, likewise wired.

---

## Quarantine (`_archive/` — recoverable, never ships, gitignored)

Nothing was deleted. Everything questionable was moved here. See
[`_archive/README.md`](_archive/README.md).

`_archive/reserve-art/` was re-sorted by in-game purpose sometime after this
manifest's last pass (see `_archive/README.md`) — the flat `resources/` /
`medieval/` / `monsters/` folders below no longer exist on disk; the same 150
+ 29 + 31 files now live under 8 purpose-named folders + a `CATALOG.html` +
`_preview/` contact sheets. Counts reconciled against disk during the b224
promotion pass (below):

| Location | Count | Tier | Notes |
|---|---|---|---|
| `_archive/reserve-art/materials-bars/`, `ore-stone-piles/`, `gems-crystals/`, `mushrooms/`, `plants-flowers/`, `potions-flasks/`, `monster-drops/`, `food/` | 150 (7+13+32+3+27+24+25+19) | 2 — compatible reserve | the old flat `resources/` folder, re-sorted by purpose; painted materials/food/potions/gems for future content |
| `_archive/reserve-art/buildings/` | 47 | 2 — compatible reserve | painted structures for future homestead/property tiers |
| `_archive/reserve-art/monster-portraits/` | 31 | 2–3 — superseded, partly promoted | was `monsters/`; the OLD painted monster portraits, mostly replaced by `painted/monsters/`. 6 promoted b224 for the Hunt bosses + 2 promoted b229 for the Stable (`Animals_07_nobg.png`→wolf_pup, `Animals_05_nobg.png`→hawk, both above); `Duke_nb.png`/`Warrior_nb.png`/`ElfMage_nb.png` (human busts) judged and rejected for the shop keeper (above) |
| `_archive/reserve-art/props-and-tools/` | 29 | 3 — possibly useful, partly promoted | was `medieval/`; props/tools, a few no-game-use (chess, toy, steering wheel). `Cog.png` promoted b224 for `iron_fitting` |
| `_archive/reserve-art/backgrounds/` | 1 | 2 — reviewed, not a fit | `ruins.jpg` — flat cel-shaded cartoon ruins, wrong medium/tone for a homestead dusk plate (checked b224, see below) |
| `_archive/pixel-packs/` | 526 | 4 — off-style | abandoned pixel-art packs + `.psd` sources (was `assets/pixel/`) |
| `_archive/asset-tooling/` | 10 | n/a — not art | icon-curation HTML/JSON/TXT dev tools |

---

## Audit summary

| Metric | Count |
|---|---|
| Files audited under `assets/` (start) | 949 |
| **Currently used (kept active)** | **161** (150 + 9 promoted b224 + 2 promoted b229) |
| Kept active but unreferenced (our own brand/UI SVGs, intentionally kept) | 5 |
| Unused-but-compatible → reserve (`_archive/reserve-art/`) | 247 (258 − 9 promoted b224 − 2 promoted b229) |
| Off-style pixel packs → archive (`_archive/pixel-packs/`) | 526 |
| Dev tooling → archive (`_archive/asset-tooling/`) | 10 |
| Duplicates found | 5 groups (intentional — one painting shared by several game IDs; left as-is) |
| Files renamed | 0 (renaming would break wired paths) |
| Permanently deleted | 0 |
| **b224 promotion pass** | **+9 shipped** (6 Hunt boss portraits, timber_beam, field_ration, iron_fitting) — copied out of `_archive/`, originals left in place there |
| **b229 promotion pass** | **+2 shipped** (wolf_pup, hawk companion portraits) — copied out of `_archive/`, originals left in place there |

**Deploy impact:** `assets/` went from 949 files to 155, then +9 in the b224
promotion pass (164), then +2 in the b229 pass (166); the ~245 remaining
unreferenced painted icons and ~628 KB of tooling JSON still don't ship, with
everything recoverable from `_archive/`.

### Duplicate note
Five byte-identical groups exist in `painted/gear` and `painted/monsters`
(all fishing rods share one rod painting; wolves/bears share a portrait;
several pickaxes share art). These are **deliberate** — each game ID needs its
own wired path even when the art is shared — so they were not deduplicated.

---

## Uncertain / future review
- `reserve-art/props-and-tools/` (was `medieval/`) holds a few painted-but-
  purposeless props (chess set, toy, steering wheel, drums). Cohesive art, but
  no game system uses them — revisit if a matching feature ships, otherwise
  they can be dropped later.
- `reserve-art/monster-portraits/` (was `monsters/`) is the previous monster
  portrait set. 6 of its 31 files were promoted b224 for the Hunt bosses; the
  human `Warrior_nb.png`/`Duke_nb.png`/`ElfMage_nb.png` were judged rendered
  against the SVG shop keeper and rejected (see b224 section above) — still
  worth keeping in reserve if a future NPC needs a human bust. The rest remain
  fully superseded by `painted/monsters/`.
- **Still open, needs a human artist/commission (b224 confirmed nothing in
  reserve-art fits):** painted dusk homestead plates per property tier (b219
  brief) and a hen/chick icon (b221 brief). See the b224 section above for
  what was checked.
- `keystone` (Castle Stores, b222) has no promoted art — ships on its gilt
  atlas glyph. Nothing in reserve-art reads as a cut masonry block; flag for
  a future pack purchase or commission if the Castle Stores lane gets a
  visual pass.
- **Still open, needs a human artist (b229 confirmed nothing in reserve-art
  fits):** 20 of the 22 Stable companions/pets — fox, sparrow, bunny,
  honeybee, badger, owl, tortoise, whelp, scorpion, raccoon, beaver,
  rock_golem, heron, squirrel, phoenix_chick, forge_imp, silkling, grave_wisp,
  lichling, dragonling — still ship on the shared gilt "paw" glyph, not a
  portrait. Full artist brief (identity notes + size spec) in the Asset
  Director's log, `.claude/coordination/agents/asset-director.md`.

---

## Verification (b216 pass)
- Smoke suite: **170/170 green**, 0 runtime errors.
- Headless load of every major screen (home, character, skills, combat,
  inventory, farm, house, market, dungeons, bounty, social, stable, shop):
  **0 failed/404 requests**.
- Pixel-diff before/after: only the animated status ticker and dynamic
  content differ (≤0.3%); no asset region changed; all painted portraits,
  gear, materials, buildings, and backgrounds render intact.

## Verification (b224 promotion pass)
- Smoke suite: **263/263 green**, 0 runtime errors (+2 guards this pass: Hunt
  boss portrait wiring, and the castle-goods false-gear-icon regression).
- `bash bump-version.sh --check` — OK, no version bump (asset/data/logic
  change only).
- Static server at `localhost:8153` (this worktree). Every one of the 9 new
  files fetched individually — all `200`. Full page load network log showed
  0 requests to any promoted path returning non-2xx/304. Console: only the
  pre-existing offline-Supabase probe errors (documented elsewhere as a known
  limitation), nothing asset-related.
- Visually confirmed in the running Hunt card (`#panel-events` → Weekly Clan
  Boss): the gilt-circular boss portrait renders next to the title.
  `window._itemPath` confirmed correct for all 4 castle goods, including
  `keystone` correctly resolving to `undefined` (glyph fallback) after the
  false-gear-icon fix.
- Shop keeper judgment: candidate portraits temporarily injected as an
  absolutely-positioned overlay at the keeper's on-screen position in
  `#panel-shop`, screenshotted for all three candidates, then fully removed
  (no test files committed).

## Verification (b229 — the Stable's pet icons)
- Smoke suite: **332/332 green**, 0 runtime errors (+1 guard: "no emoji in
  the Stable panel DOM, in any state" — sweeps all-locked, all-owned, and
  each of the 22 companions/pets equipped in turn, across both the Stable
  grid and the doll/detail-pane seams).
- `bash bump-version.sh --check` — OK, no version bump (asset/render-seam
  change only).
- Static server on port 8171 (this worktree's designated harness seam),
  `window.__HR_TEST_HARNESS__` set only long enough to walk the wall-gated
  boot manually, then reverted before commit (mirrors `tests/run-smoke.mjs`'s
  own `addInitScript` bypass — never a URL param, per `account-gate.js`'s own
  reasoning for why it's a JS global). Walked the Stable with 7/22 companions
  owned (mixing portrait ids and glyph-only ids) and Wolf Pup equipped: full
  22-card grid confirmed, 0 emoji, wolf portrait + hawk portrait render
  correctly, every other card shows the gilt paw medallion. Also walked
  Character → Manage gear → Companion tab and re-equipped a glyph-only
  companion (beaver) to confirm the doll's companion slot (the bug fix)
  updates correctly.
- Network log: `wolf_pup.png` and `hawk.png` both `200`, fetched from
  `assets/icons-bundle/painted/companions/`; 0 non-2xx across the full asset
  set for the whole walk. Console clean (no errors/warnings).
