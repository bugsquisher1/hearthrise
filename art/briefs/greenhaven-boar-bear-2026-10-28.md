# Art brief: Orchard Boar and Brook Bear (Greenhaven, lane/b-unsourced-items, 2026-10-28)

Two creatures. They source the last Greenhaven items with no source: the Tusker's Charm, and the bear line
(Bear Pelt, Bear Claw, Raw Bear Meat, and through Cooking the Cooked Bear Meat and Bear Claw Pie). Nothing is
wired until the sprites land. No placeholder art, and no sprite borrowed from another creature.

## Shared spec (docs/ART_DIRECTION.md, src/data/world/art-budget.js `beast`)
- Style 1, generated through `tools/world-art` with the palette lock (`art/world/palette.json`), high top-down,
  one angle, no diagonal lean. Gritty, natural muted palette, no bold accent colours (Tyler 10-15).
- Class `beast`: frame 64x64, anchor [32, 56], body 40-48 art px wide (`measure: 'w'`), ellipse ground shadow.
  Use the same frame and anchor as `art/world/forest/dire_gray.json`.
- Anims as on `dire_gray.json`: idle 1 frame at 5 fps, walk 6 at 10 fps, attack 6 at 10 fps, death 6 at 10 fps,
  corpse 1. **All 8 facings** (s, e, n, w, se, sw, ne, nw) for idle, walk and attack. The open-ground walk-art
  guard (`tests/hunt-core/forest-cave.mjs walk-art`) needs all 8 for idle and walk. Death and corpse follow
  `dire_gray`'s facings.
- The knight v3 south walk is the gold standard. Do a frame-by-frame side-by-side with it before handing over
  (Tyler 10-16).
- Files: `art/world/forest/orchard_boar.{png,json}` (the forest atlas, beside the wolves) and
  `art/world/glade/brook_bear.{png,json}`. Sprite id = monster id.

## Orchard Boar (`orchard_boar`): Wickstead, the Orchard pocket, about Level 12
- A wild boar grown fat on the burned farm's windfalls: short legs, a high bristled back ridge, a heavy head
  held low, two short yellowed tusks. Coat dark gray-brown with mud on the legs. It reads as a tank, not a
  critter: about the Dire Gray's mass, lower and wider (about 44 px wide, 30 px tall).
- Attack: a head-down charge and tusk hook over the last 2 frames. Death: rolls onto its side, legs out.

## Brook Bear (`brook_bear`): Mosslight Glade, Vine Hollow and the Springs, about Level 24
- A brown bear that fishes the Meadowbrook where it rises: a wet, dark-tipped coat and a pale muzzle. On all
  fours when it walks; on the attack it rears up for 2 frames and swipes down. The widest regular creature on
  the ground (about 48 px wide). It is still not a boss, so it keeps the beast frame, never a boss frame.
- Death: slumps forward onto its chest. No glow, no moss on the bear. The glade's glow is the spring's.

## What the designer wires when the art lands (data only, one batch of ≤20 rows)
| Creature | Ground and pocket | Rows |
|---|---|---|
| Orchard Boar | Wickstead P3 the Orchard (two pack slots), uncommon | WIRED 2026-10-28: Boar Bristle (trader's goods) and bones; Orchard Boar Tusk (imbuement). No Rare: the Tusker's Charm is Old Tusker's champion relic (one source, w0f-fun-content), so it waits for Old Tusker to join the Orchard with his own larger art |
| Brook Bear | Mosslight P3 the Springs and P5 Vine Hollow, uncommon | Commons: Raw Bear Meat (Cooking: cook_bear_meat), Bear Pelt; Uncommon: its own imbuement item; Bear Claw (Cooking: cook_bear_pie) as a second Common or a Scarce-band material |

Then the spawn weights, `forest-cave` spawn-mix and drop-tables paces are re-measured on the real settle.
The Wickstead and Glade floors are re-played (no deaths, +25% over the bill), and `UNREACHABLE.greenhaven`
loses the six rows.
