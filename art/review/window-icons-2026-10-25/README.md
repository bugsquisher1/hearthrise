# Window icon size: Inventory, Storage, Shop (mocks, 2026-10-25)

Tyler 10-25: "I think the inventory/storage/shop icons also need a small increase in size."
Mock-only lane (lane/d-window-icon-size). Nothing under `src/` changed: `shoot.mjs` serves the real client
(v0.2.46 at a680fcfc4) on the window tests' fake server and appends each option's CSS to `windows.css` in memory.
The hero is the fixture with a QA-like load: 43 of 60 bag stacks, 90 of 120 storage stacks, 14 gear/tool
offers. The tutorial coach card is hidden in every shot (all options alike) so it does not cover the grid.

Re-run: `node art/review/window-icons-2026-10-25/shoot.mjs <worktree> <out-dir> before,A,B,C <sizes>`.

## The constraint
The item art is true 32x32 (no 2x2 blocks). The only whole scales are 1x (32 px) and 2x (64 px).
A "small" 40 or 48 px icon is a 1.25x/1.5x resample: nearest-neighbour doubles every 4th or every 2nd art
pixel and the item wobbles. So a small increase has to come from the well, the air and the count, or from
2x in places where 2x does not cost rows.

## Measured (window size; slots per row; scroll = body height / content height)

| Option | Slot (icon) | Inventory 1440x900 | Storage 1440x900 | Shop Buy / Sell | Phone 844x390 |
|---|---|---|---|---|---|
| before | 36 (32) | 452 wide, 6/row, 510/649 | 452, 10/row, 510/814 | rows 52, 420 wide; Sell 510/2362 | 400 sheet, 6/row, unchanged |
| A: 2x everywhere | 68 (64) | 640 wide, **4/row**, 510/**1084** (+67%) | 640, 8/row, 510/**1544** (+90%) | rows 76, 520 wide; Sell 510/3394 (+44%) | unchanged (gated >= 1280) |
| B: 1x, bigger wells | 44 (32), count 16 px | 540 wide, 6/row, 510/725 (+12%) | 540, 10/row, 510/950 (+17%) | 48 px well; Sell 510/2534 (+7%) | unchanged |
| **C: 2x where it is few** | doll 68 (64); bag+storage 44 (32); Shop lines 68 (64) | 600 wide, 6/row, 510/676 (+4%) | 540, 10/row, 510/950 (+17%) | rows 76, 480 wide; Sell 510/3394 (+44%) | unchanged |

At 1920x1080 the windows are taller (body 690): before and C Inventory show the whole 43-stack bag with no scroll;
A still scrolls (690/1084).

## Blur risk on Windows display scaling (`dpr-pixel-check.png`, the `*-dpr125/150-*` shots)
Chrome draws these with `image-rendering: pixelated`, so there is never blur, only uneven pixels:
- 1x art (before, B, C's grids): 125% = 1.25 device px per art px (every 4th doubled), 150% = 1.5 (every other doubled,
  the worst wobble). This is today's state too; B and C do not make it worse.
- 2x art (A, C's doll and Shop): 125% = 2.5 (2,3,2,3: hard to see); **150% = exactly 3: clean.** 2x is the more robust
  scale on scaled laptops, which is a point for 2x wherever it fits.
- No option introduces a non-integer CSS scale. Shipping must snap the icon with `round(down, ..., 32px)` and size wells
  with the action bar's `clamp(..., 100vw ...)` (lane/b-action-bar-fix), not a new `@media` spelling (breakpoint-guard).

## Reading the shots
- **A** is the best-looking art (the Storage grid at 2x is lovely) but it is not a small increase: the bag drops to
  4 a row and 6 of 11 rows visible, storage scrolls almost twice as far, and the windows grow 190 px.
- **B** keeps every row count and reads slightly calmer (16 px counts no longer sit on the art), but the art itself
  is the same size, so it does not answer "the icons are small". Honest verdict: a spacing change, not a size change.
- **C** puts 2x where the count is fixed or the item is the row: the 15-slot paper doll (the hero's own gear now reads
  at the bar's size) and the Shop's Buy/Sell lines (one item per row, room to spare). The open-ended grids (bag,
  storage) keep 1x art in B's 44 px wells with 16 px counts, so the bag still shows 6 a row and fits on one screen at
  1080p. Worn-big / carried-small is a hierarchy players already read from classic MMOs.

## Pick: C
Desktop >= 1280 only; the phone sheet stays as it is (shots `before-844x390-*` = `C-844x390-*`). Known costs:
the Shop Sell list scrolls 44% further with a full bag (its "Sell all loot" line is the main action and stays on top);
the Inventory window grows 452 -> 600 px. Services has no item art in this fixture (no stamina/blessing rows priced),
so it is unchanged and unverified with blessing icons loaded. If Tyler wants the bag and storage art itself bigger
too, that is A, and the price is the row counts above.
