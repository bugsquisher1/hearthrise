# Hearthrise — Asset Manifest

_Last updated: 2026-10-25 (World atlas registry regenerated: Hearth Square staged art, Art Director); 2026-10-19 (live-ground monster combat clips, Asset Director); 2026-10-15 (World atlas registry, Art Director); 2026-08-08 (asset-organization pass, build b216; asset
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
    ├── pixel/supplies/  19 icons for the shop's basic supplies (salted food, thin drinks,
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
- `pixel/supplies/<id>.png`: one per `BASIC_SUPPLIES` row (src/data/supply-basics.js), 19 files. Not items, so not under
  `items/`. Wired by `SUPPLY_DIR` (item-art.js) and `itemIconHtml`/`actionIconHtml` (src/shell/widgets/bits.js).
  Salted food = its cooked partner's silhouette cured to a pale tan with a salt rim and crystals (reads as a different dish
  beside the cooked one). Thin drinks = six different plain vessels (wooden beaker, tin cup, stave tankard, clay mug,
  sipping bowl, goblet), each with its own painted band and fill level, all wood/tin/clay so they read as store basics beside the
  glass crafted ones. Plain ammo = unstained ash shaft, two bone-white vanes, a bare head in its partner's metal.
  `plain_fire_rune` (the store rune for Flame Strike) = the fire rune slab as plain grey stone with the flame only scratched in
  red. Its row has landed in supply-basics.js, so `SUPPLY_ART_AHEAD` (item-art.js) is empty.
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

### Longbow redraw (2026-10-24, Asset Director, player note a43)
"String Longbow sprite looks more like a larger crossbow." The Crafting recipe "String Longbow" makes the item `longbow`, whose icon
`pixel/items/longbow.png` was a thick wooden limb over a grey stock: a crossbow silhouette. Redrawn by hand (free tooling, no
PixelLab credits): a tall single stave leaning to the upper right like the set's swords and staves, a leather-wrapped grip, bone
nocks, one pale straight string; no stock, no prod, no bolt. Same 32x32, dark 4-neighbour outline, top-left light, `hr-world-56-v2`.
- Source of truth: `tools/world-art/longbow-icon.mjs` (stave rows, string runs, grip, nocks are data; `--print` shows the grid).
  `tests/pixel-icons.mjs` rule `longbow` requires the PNG to equal what the script draws (edit the script, rerun it, never the PNG).
- Before/after at 1x, 2x, 4x and a 4x sheet beside the other bows and crossbows: `docs/art-experiments/longbow/`.
- No world or hunt sprite draws this item: heroes wear outfit sprites, and `outfit_ranger` holds a drawn bow that already reads as one.
- The old painted `hearthfire/weapons/longbow.png` and `painted/gear/longbow.png` stay (the `ITEM_ART_SET = 'painted'` switch).
- Still easy to mistake for a crossbow, NOT changed here (Art Director to rule): `maple_bow`, `yew_bow`, `runewood_bow` (the same thick
  limb across a diagonal bow that the old longbow had), `duskwood_bow` (a small grey figure), `shortbow` (an arrow through the
  grip). `oak_crossbow`, `willow_crossbow` and `practice_crossbow` are one picture (KNOWN_TWINS). `alphaheart_longbow` is a framed
  square that does not read as a bow at all.

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

### Mosslight Glade set (2026-10-22, lane b-mosslight-art) — `art/world/glade`, atlas `glade`
PixelLab, paid generations approved by Tyler 2026-10-22. Style 1, ported unscaled by `tools/world-art/port-pixellab.mjs`:
`mosslight_ground` (painted 60x40, map `4589f28b` in the Meadowbrook's Greenhaven tileset family) and five units, each
a Pro Flash object (8 rotations) + v3 walk (8 facings), attack (8), death (s e n w), corpse = the fall's last frame:
`carrion_crow` (vermin_flier, `3920ce88`), `glade_poacher` (character, `3e5d4d7e`), `walking_vine` (vermin, `376e08d7`),
`goblin_sluicer` (vermin, `41214f2a`, the Warrens' Goblin Digger as style image), `rook_poacher` (character, `ad8d1765`).
Six item icons, `create_image_pro_flash` 32x32 on the hr-world-56-v2 palette with `alpha_fang` as the style image:
`crow_quill`, `snare_wire`, `mosslight_tendril`, `sluice_crust`, `rooks_moss_charm`, `rooks_whistle` (their six
KNOWN_TWINS entries are gone). Decision: **retain**; approved: Asset Director (delegated art sign-off) 2026-10-22.

### World atlas registry (2026-10-15) — every world sprite and terrain, and what happens to it

The registry Tyler's PixelLab directive asks for; there is no second registry. One row per sidecar in
`art/world/<set>/*.json` (236 today), printed by `node tools/world-art/registry.mjs` from the sidecars
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
| cistern_spider | hunt | vermin | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | hand / script |
| culvert_bat | hunt | vermin_flier | 48×48 | idle 1@5, walk 6@12, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | hand / script |
| drain_rat | hunt | vermin | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | hand / script |
| kobold_tosher | hunt | character | 64×64 | idle 1@5, walk 6@8, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | hand / script |
| outfit_berserker | hunt | character | 64×64 | idle 1@5, walk 6@8 | senwseswnenw | **retain** | hand / script |
| outfit_brute | hunt | character | 64×64 | idle 1@5, walk 6@7 | senwseswnenw | **retain** | hand / script |
| outfit_dawnward | hunt | character | 64×64 | idle 1@5, walk 6@8 | senwseswnenw | **retain** | hand / script |
| outfit_druid | hunt | character | 64×64 | idle 1@5, walk 6@8 | senwseswnenw | **retain** | hand / script |
| outfit_knight | hunt | character | 64×64 | idle 1@5, walk 6@8 | senwseswnenw | **retain** | hand / script |
| outfit_ranger | hunt | character | 64×64 | idle 1@5, walk 6@8 | senwseswnenw | **retain** | hand / script |
| outfit_sorcerer | hunt | character | 64×64 | idle 1@5, walk 6@8 | senwseswnenw | **retain** | hand / script |
| outfit_witch | hunt | character | 64×64 | idle 1@5, walk 6@8 | senwseswnenw | **retain** | hand / script |
| rat | hunt | vermin | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | hand / script |
| rat_king | hunt | beast | 64×64 | idle 1@5, walk 8@8, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | hand / script |
| slime | hunt | vermin | 48×48 | idle 1@5, walk 6@8, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | hand / script |
| sump_slime | hunt | vermin | 48×48 | idle 1@5, walk 6@8, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | hand / script |
| fx_arcane_barrier | vfx | vfx | 37×37 | play 8@7 | s | **retain** | hand / script |
| fx_cast_druid_motes | vfx | vfx | 24×12 | play 8@4 | s | **retain** | hand / script |
| fx_cast_knight_shield_bash | vfx | vfx | 25×20 | play 8@16 | s | **retain** | hand / script |
| fx_cast_ranger_aim_glint | vfx | vfx | 12×10 | play 6@9 | s | **retain** | hand / script |
| fx_cast_sorcerer_runes | vfx | vfx | 29×15 | play 8@4 | s | **retain** | hand / script |
| fx_challenge_taunt | vfx | vfx | 46×64 | play 8@9 | s | **retain** | hand / script |
| fx_circle_of_renewal | vfx | vfx | 38×17 | play 8@5 | s | **retain** | hand / script |
| fx_crossbow_bolt_impact | vfx | vfx | 23×20 | play 5@16 | s | **retain** | hand / script |
| fx_crossbow_bolt_projectile | vfx | vfx | 13×4 | play 4@12 | s | **retain** | hand / script |
| fx_fire_rune_burst | vfx | vfx | 56×30 | play 8@9 | s | **retain** | hand / script |
| fx_flame_volley_puff | vfx | vfx | 19×20 | play 6@12 | s | **retain** | hand / script |
| fx_frost_lance_shatter | vfx | vfx | 38×51 | play 8@12 | s | **retain** | hand / script |
| fx_hunters_mark | vfx | vfx | 22×10 | play 8@5 | s | **retain** | hand / script |
| fx_level_up | vfx | vfx | 24×42 | play 8@8 | s | **retain** | hand / script |
| fx_loot_sparkle | vfx | vfx | 19×20 | play 8@12 | s | **retain** | hand / script |
| fx_melee_slash | vfx | vfx | 16×25 | play 5@16 | s | **retain** | hand / script |
| fx_monster_death_poof | vfx | vfx | 23×18 | play 8@10 | s | **retain** | hand / script |
| fx_natures_wrath | vfx | vfx | 40×32 | play 8@7 | s | **retain** | hand / script |
| fx_nature_heal_motes | vfx | vfx | 18×33 | play 8@8 | s | **retain** | hand / script |
| fx_power_strike | vfx | vfx | 34×31 | play 8@16 | s | **retain** | hand / script |
| fx_staff_bolt | vfx | vfx | 6×6 | play 1@12 | s | **retain** | hand / script |
| fx_staff_bolt_impact | vfx | vfx | 18×23 | play 2@16 | s | **retain** | hand / script |
| fx_torch_flame_loop | vfx | vfx | 6×15 | play 8@12 | s | **retain** | hand / script |
| fx_wand_bolt | vfx | vfx | 16×16 | play 1@12 | s | **retain** | hand / script |
| fx_wand_bolt_impact | vfx | vfx | 22×22 | play 2@16 | s | **retain** | hand / script |
| fx_water_drip_ripple | vfx | vfx | 20×10 | play 8@7 | s | **retain** | hand / script |
| fx_water_drop_splash | vfx | vfx | 21×16 | play 8@11 | s | **retain** | hand / script |
| fx_x_slash | vfx | vfx | 28×27 | play 8@14 | s | **retain** | hand / script |
| barrels | sewer | bulky | 48×28 | idle 1 | s | **retain** | see sidecar |
| barrel_stack | sewer | bulky | 32×32 | idle 1 | s | **retain** | see sidecar |
| bones | sewer | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| brazier | sewer | station | 32×30 | idle 1 | s | **retain** | see sidecar |
| collapsed_cart | sewer | wreck | 64×42 | idle 1 | s | **retain** | see sidecar |
| corner_rubble | sewer | decal | 48×48 | idle 1 | s | **retain** | see sidecar |
| cracked_flagstone | sewer | decal | 48×32 | idle 1 | s | **retain** | see sidecar |
| crates | sewer | bulky | 32×31 | idle 1 | s | **retain** | see sidecar |
| drowned_lantern | sewer | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| exposed_dirt | sewer | decal | 48×32 | idle 1 | s | **retain** | see sidecar |
| floor_grate | sewer | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| grate_bridge | sewer | span | 160×64 | idle 1 | s | **retain** | see sidecar |
| hanging_chains | sewer | hanging | 32×48 | idle 1 | s | **retain** | see sidecar |
| moss_puddle | sewer | decal | 64×48 | idle 1 | s | **retain** | see sidecar |
| pipe_outflow | sewer | hanging | 32×48 | idle 1 | s | **retain** | see sidecar |
| rat_nest | sewer | decal | 48×48 | idle 1 | s | **retain** | see sidecar |
| sewer_ground | sewer | terrain | 32×32 tiles | still |  | **retain** | view_map |
| wall_chunk | sewer | hanging | 64×48 | idle 1 | s | **retain** | see sidecar |
| wall_torch | sewer | hanging | 32×48 | idle 1 | s | **retain** | see sidecar |
| banner | mill | hanging | 18×24 | idle 1 | s | **retain** | create_image_pro_flash |
| barrel_broken | mill | bulky | 42×37 | idle 1 | s | **retain** | create_image_pro_flash |
| bone_pile | mill | decal | 22×18 | idle 1 | s | **retain** | create_image_pro_flash |
| bread_loaf | mill | decal | 20×17 | idle 1 | s | **retain** | create_image_pro_flash |
| bucket | mill | bulky | 18×26 | idle 1 | s | **retain** | create_image_pro_flash |
| candle | mill | clutter | 14×22 | idle 1 | s | **retain** | create_image_pro_flash |
| cellar_ground | mill | terrain | 32×32 tiles | still |  | **retain** | view_map |
| coins_scattered | mill | decal | 18×16 | idle 1 | s | **retain** | create_image_pro_flash |
| grain_spill | mill | decal | 42×23 | idle 1 | s | **retain** | create_image_pro_flash |
| hay_bale | mill | clutter | 22×24 | idle 1 | s | **retain** | create_image_pro_flash |
| herbs_hanging | mill | hanging | 16×26 | idle 1 | s | **retain** | create_image_pro_flash |
| hive_wasp | mill | vermin_flier | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| jug | mill | clutter | 18×22 | idle 1 | s | **retain** | create_image_pro_flash |
| ladder | mill | hanging | 22×26 | idle 1 | s | **retain** | create_image_pro_flash |
| loot_bag | mill | clutter | 14×22 | idle 1 | s | **retain** | create_image_pro_flash |
| millstone | mill | decal | 36×26 | idle 1 | s | **retain** | create_image_pro_flash |
| mushrooms | mill | decal | 20×22 | idle 1 | s | **retain** | create_image_pro_flash |
| pebbles | mill | decal | 18×15 | idle 1 | s | **retain** | create_image_pro_flash |
| sack_pile | mill | bulky | 34×29 | idle 1 | s | **retain** | create_image_pro_flash |
| sack_stack | mill | bulky | 34×35 | idle 1 | s | **retain** | create_image_pro_flash |
| skull | mill | decal | 16×17 | idle 1 | s | **retain** | create_image_pro_flash |
| straw | mill | decal | 46×30 | idle 1 | s | **retain** | create_image_pro_flash |
| support_post | mill | fixture | 40×48 | idle 1 | s | **retain** | create_image_pro_flash |
| wasp_nest | mill | hanging | 24×38 | idle 1 | s | **retain** | create_image_pro_flash |
| water_trough | mill | clutter | 26×19 | idle 1 | s | **retain** | create_image_pro_flash |
| web | mill | hanging | 36×36 | idle 1 | s | **retain** | create_image_pro_flash |
| anvil | common | bulky | 30×29 | idle 1 | s | **retain** | create_image_pro_flash |
| bush | common | bush | 32×28 | idle 1 | s | **retain** | see sidecar |
| cabbage_crate | common | bulky | 38×30 | idle 1 | s | **retain** | create_image_pro_flash |
| common_ground | common | terrain | 32×32 tiles | still |  | **retain** | view_map |
| fence | common | bench | 32×24 | idle 1 | s | **retain** | see sidecar |
| fishing_pier | common | span | 96×160 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | see sidecar |
| flower_box | common | hanging | 38×23 | idle 1 | s | **retain** | create_image_pro_flash |
| fuel_bone | common | loot | 14×14 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| fuel_coal | common | loot | 12×14 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| fuel_den_knot | common | loot | 14×14 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| fuel_dry_husk | common | loot | 14×15 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| fuel_lamp_jelly | common | loot | 14×11 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| fuel_log | common | loot | 16×14 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| fuel_mosslight_clump | common | loot | 14×15 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| fuel_pithwood | common | loot | 12×15 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| fuel_queens_comb | common | loot | 14×14 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| fuel_rat_kings_knot | common | loot | 14×14 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| fuel_verdigris_cake | common | loot | 14×12 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| great_hearth | common | landmark | 352×349 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| hatch | common | decal | 40×27 | idle 1 | s | **retain** | create_image_pro_flash |
| hearth_burn_sparks | common | vfx | 75×65 | play 8@12 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | vfx_workbench |
| hearth_burn_sparks_verdigris | common | vfx | 75×65 | play 8@12 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | vfx_workbench |
| hearth_fire | common | vfx | 61×49 | idle 8@8 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | animate_image |
| hearth_fire_verdigris | common | vfx | 61×49 | idle 8@8 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | animate_image |
| hearth_flare | common | vfx | 55×50 | play 6@10 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | animate_image |
| hearth_flare_verdigris | common | vfx | 55×50 | play 6@10 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | animate_image |
| hedge | common | bush | 38×25 | idle 1 | s | **retain** | create_image_pro_flash |
| lamppost | common | fixture | 32×42 | idle 1 | s | **retain** | see sidecar |
| mill | common | building | 192×140 | idle 1 | s | **retain** | see sidecar |
| mine_mouth | common | building | 120×111 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | see sidecar |
| noticeboard | common | fixture | 36×33 | idle 1 | s | **retain** | create_image_pro_flash |
| npc_crier | common | character | 64×64 | idle 1@5 | senwseswnenw | **retain** | see sidecar |
| npc_smith | common | character | 64×64 | idle 1@5 | senwseswnenw | **retain** | see sidecar |
| oak | common | sapling | 64×90 | idle 1 | s | **retain** | see sidecar |
| ore_copper_rock | common | bulky | 28×27 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | see sidecar |
| pine | common | sapling | 64×92 | idle 1 | s | **retain** | see sidecar |
| rocks | common | bulky | 32×30 | idle 1 | s | **retain** | see sidecar |
| rug | common | decal | 40×23 | idle 1 | s | **retain** | create_image_pro_flash |
| signpost | common | fixture | 28×36 | idle 1 | s | **retain** | create_image_pro_flash |
| smithy | common | building | 224×160 | idle 1 | s | **retain** | see sidecar |
| square_bank | common | hall | 352×307 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_barracks | common | hall | 342×262 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_bench_log | common | bench | 64×34 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | see sidecar |
| square_bench_stone | common | bench | 64×37 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | see sidecar |
| square_bench_wood | common | bench | 64×34 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | see sidecar |
| square_decal_chips_a | common | decal | 28×26 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_decal_chips_b | common | decal | 28×26 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_decal_leaves_a | common | decal | 20×17 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_decal_leaves_b | common | decal | 20×20 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_decal_moss_a | common | decal | 28×26 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_decal_moss_b | common | decal | 28×26 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_decal_puddle_a | common | decal | 26×20 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_decal_puddle_b | common | decal | 24×19 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_decal_soot | common | decal | 28×26 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_decal_tuft_a | common | decal | 28×19 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_decal_tuft_b | common | decal | 26×18 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_depot | common | hall | 384×302 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_dirt_flag | common | terrain | 32×32 tiles | still |  | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_topdown_tileset `61093a68` |
| square_flag_hearthstone | common | terrain | 32×32 tiles | still |  | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_topdown_tileset `edb6840f` |
| square_general_store | common | hall | 384×315 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_image_pro |
| square_grass_flag | common | terrain | 32×32 tiles | still |  | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | create_topdown_tileset `1da34598` |
| square_market_stall | common | stall | 76×58 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | see sidecar |
| well | common | fixture | 36×43 | idle 1 | s | **retain** | create_image_pro_flash |
| westwood_ash | common | tree | 68×97 | idle 1 | s | **staged**: on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending | see sidecar |
| woodpile | common | fixture | 38×23 | idle 1 | s | **retain** | create_image_pro_flash |
| altar | cottage | fixture | 30×38 | idle 1 | s | **retain** | create_image_pro_flash |
| apple_crate | cottage | box | 20×21 | idle 1 | s | **retain** | create_image_pro_flash |
| armour_stand | cottage | fixture | 26×42 | idle 1 | s | **retain** | create_image_pro_flash |
| barrel_planter | cottage | barrel | 24×25 | idle 1 | s | **retain** | create_image_pro_flash |
| basket | cottage | clutter | 18×20 | idle 1 | s | **retain** | create_image_pro_flash |
| bed | cottage | bed | 26×40 | idle 1 | s | **retain** | create_image_pro_flash |
| bellows | cottage | clutter | 22×23 | idle 1 | s | **retain** | create_image_pro_flash |
| bookshelf | cottage | fixture | 38×42 | idle 1 | s | **retain** | create_image_pro_flash |
| candelabra | cottage | fixture | 20×29 | idle 1 | s | **retain** | create_image_pro_flash |
| cart_wheel | cottage | bulky | 24×23 | idle 1 | s | **retain** | create_image_pro_flash |
| chair_side | cottage | seat | 18×30 | idle 1 | s | **retain** | create_image_pro_flash |
| chest | cottage | box | 20×18 | idle 1 | s | **retain** | create_image_pro_flash |
| chest_iron | cottage | box | 18×18 | idle 1 | s | **retain** | create_image_pro_flash |
| chopping_block | cottage | bulky | 22×26 | idle 1 | s | **retain** | create_image_pro_flash |
| cottage_ground | cottage | terrain | 32×32 tiles | still |  | **retain** | view_map |
| counter | cottage | station | 42×34 | idle 1 | s | **retain** | create_image_pro_flash |
| desk | cottage | station | 38×32 | idle 1 | s | **retain** | create_image_pro_flash |
| display_case | cottage | station | 24×23 | idle 1 | s | **retain** | create_image_pro_flash |
| dummy | cottage | fixture | 32×43 | idle 1 | s | **retain** | create_image_pro_flash |
| flour_sack | cottage | clutter | 20×24 | idle 1 | s | **retain** | create_image_pro_flash |
| flower_bed | cottage | clutter | 24×18 | idle 1 | s | **retain** | create_image_pro_flash |
| forge | cottage | fixture | 46×48 | idle 1 | s | **retain** | create_image_pro_flash |
| grindstone | cottage | clutter | 20×23 | idle 1 | s | **retain** | create_image_pro_flash |
| hearth | cottage | fixture | 36×45 | idle 1 | s | **retain** | create_image_pro_flash |
| neighbour_cottage | cottage | building | 160×138 | idle 1 | s | **retain** | see sidecar |
| sack_tall | cottage | bulky | 20×24 | idle 1 | s | **retain** | create_image_pro_flash |
| shield_wall | cottage | hanging | 36×38 | idle 1 | s | **retain** | create_image_pro_flash |
| statue | cottage | fixture | 22×53 | idle 1 | s | **retain** | create_image_pro_flash |
| swords_wall | cottage | hanging | 42×41 | idle 1 | s | **retain** | create_image_pro_flash |
| table | cottage | bench | 18×18 | idle 1 | s | **retain** | create_image_pro_flash |
| trophy_wolf | cottage | hanging | 36×41 | idle 1 | s | **retain** | create_image_pro_flash |
| turnip_crate | cottage | box | 18×21 | idle 1 | s | **retain** | create_image_pro_flash |
| wardrobe | cottage | fixture | 30×45 | idle 1 | s | **retain** | create_image_pro_flash |
| weapon_rack | cottage | fixture | 36×42 | idle 1 | s | **retain** | create_image_pro_flash |
| workbench | cottage | station | 42×33 | idle 1 | s | **retain** | create_image_pro_flash |
| briarcoat_wolf | forest | vermin | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| dire_gray | forest | beast | 64×64 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| grayjaw | forest | beast | 64×64 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| gray_whelp | forest | vermin | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| gray_wolf | forest | vermin | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| mb_fallen_log | forest | decal | 64×32 | idle 1 | s | **retain** | see sidecar |
| mb_fern | forest | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| mb_flowers | forest | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| mb_hollow_oak | forest | sapling | 64×87 | idle 1 | s | **retain** | see sidecar |
| mb_hollow_oak_stump | forest | wreck | 64×87 | idle 1 | s | **retain** | see sidecar |
| mb_leaf_litter | forest | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| mb_log_bridge | forest | span | 160×48 | idle 1 | s | **retain** | see sidecar |
| mb_oak_stump | forest | wreck | 64×91 | idle 1 | s | **retain** | see sidecar |
| mb_pine_stump | forest | decal | 64×96 | idle 1 | s | **retain** | see sidecar |
| mb_reeds | forest | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| mb_stepping_stones | forest | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| meadowbrook_ground | forest | terrain | 32×32 tiles | still |  | **retain** | view_map |
| chief_coppercap | warren | brute | 64×64 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| cw_coal_seam | warren | bulky | 32×39 | idle 1 | s | **retain** | see sidecar |
| cw_coal_seam_spent | warren | clutter | 32×39 | idle 1 | s | **retain** | see sidecar |
| cw_copper_pots | warren | bulky | 32×29 | idle 1 | s | **retain** | see sidecar |
| cw_copper_vein | warren | bulky | 32×39 | idle 1 | s | **retain** | see sidecar |
| cw_copper_vein_spent | warren | decal | 32×48 | idle 1 | s | **retain** | see sidecar |
| cw_gold_seam | warren | bulky | 32×39 | idle 1 | s | **retain** | see sidecar |
| cw_gold_seam_spent | warren | clutter | 32×35 | idle 1 | s | **retain** | see sidecar |
| cw_iron_vein | warren | bulky | 32×39 | idle 1 | s | **retain** | see sidecar |
| cw_iron_vein_spent | warren | clutter | 32×39 | idle 1 | s | **retain** | see sidecar |
| cw_mine_cart | warren | wreck | 48×40 | idle 1 | s | **retain** | see sidecar |
| cw_ore_stain | warren | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| cw_plank_bridge | warren | span | 48×96 | idle 1 | s | **retain** | see sidecar |
| cw_puddle | warren | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| cw_rails | warren | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| cw_rubble | warren | decal | 32×32 | idle 1 | s | **retain** | see sidecar |
| cw_stalagmite | warren | bulky | 32×39 | idle 1 | s | **retain** | see sidecar |
| cw_throne | warren | wreck | 48×55 | idle 1 | s | **retain** | see sidecar |
| cw_tool_rack | warren | bulky | 48×39 | idle 1 | s | **retain** | see sidecar |
| goblin_digger | warren | vermin | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| goblin_scavenger | warren | vermin | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| goblin_skulker | warren | vermin | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| hobgoblin_foreman | warren | character | 64×64 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| warrens_ground | warren | terrain | 32×32 tiles | still |  | **retain** | view_map |
| carrion_crow | glade | vermin_flier | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| glade_poacher | glade | character | 64×64 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| goblin_sluicer | glade | vermin | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| mosslight_ground | glade | terrain | 32×32 tiles | still |  | **retain** | view_map |
| rook_poacher | glade | character | 64×64 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |
| walking_vine | glade | vermin | 48×48 | idle 1@5, walk 6@10, attack 6@10, death 6@10, corpse 1 | senwseswnenw | **retain** | see sidecar |

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
