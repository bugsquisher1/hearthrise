# Sandbox town at 64 px tiles: engine spec

Systems Engineer, 2026-10-22, branch `lane/sandbox-town-spec`. This is a spec only; nothing is implemented.

**Goal (Tyler):** a look-and-walk sandbox town where Tyler can judge a higher-detail world. Tiles are 64 art px, drawn at 1 CSS px per art pixel, so a tile is the same size on screen as today's 32 px tile at x2. A sign in the current town takes you in, and a sign in the sandbox brings you back. All the art is new and comes from a separate art lane. The sandbox has one 64 px monster that idles and wanders, for display only. The existing game must look and behave exactly as it does now.

**Scope ruling (Coordinator, 2026-10-22):** go with the least work. The game is CLOSED, so only the allowlist (Tyler, QA, Andy) can play at all, and the closed game is the gate. The sandbox adds no feature gating of its own. It must be hidden or removed before the game reopens (CLAUDE.md §3.5). The checklist is in §7.

---

## 1. How the renderer handles tile size and density today

**Zoom.** `src/world/core/camera.js`: `DENSITY = 2` and `WIDE_CSS = 2400`. `zoomFor(innerWidth, dpr)` returns `round(css x dpr)` device px per art pixel, where `css` is 2, or 3 on a window wider than 2400 CSS px. It reads the window only, "never per scene" (WORLD_SHELL §1). The canvas sets `z` in exactly one place, `measure()` in `canvas-backend.js`, and `tests/world-core.mjs` C6 pins that with a regex: one `z =` assignment, it must match `z = zoomFor(win.innerWidth, dpr)`, and nothing may say `fitZoom` or `map.frame`. `blitPlan(cam, z, T)` and `frameView(..., z, T, o)` already take `T` as a parameter.

**The grid has two sources of T, both 32:**
- `src/world/core/grid.js` `T = 32`. Imported by `map-compile.js`, `render/canvas-backend.js`, `render/null-backend.js`, `town-scene.js` and `walk-scene.js` (their `onPixel` snap).
- `src/data/world/art-budget.js` `T = 32`, together with `CLASSES`. Every class's `frame`, `anchor`, `body`, `hover`, `canopy`, `maxW` and `face`/`cap`, plus `SHADOW.dx/dy`, is an absolute art-px number sized for 32 px tiles. It is imported by `tools/world-art/build.mjs`, `validate.mjs`, `port-pixellab.mjs`, `port-hunt-sim.mjs`, `derive-combat.mjs`, `review-strip.mjs`, `pack.mjs` (only `ATLAS_MAX`), `tests/world-assets.mjs`, `tests/hunt-core/forest-cave.mjs`, `tests/hunt-scene.mjs`, and on the client by `src/world/atlas.js` (`atlasPaths`) and `src/shell/windows/character/outfit.js` (`FACINGS`).

**Code that assumes 32 px tiles or DENSITY 2 without taking T as a parameter:**

| File | What assumes 32 / x2 | Reached by an outdoor sandbox map? |
|---|---|---|
| `src/world/core/grid.js` | `T = 32` | yes (it is the source) |
| `src/world/core/camera.js` | `DENSITY`, `WIDE_CSS`, `zoomFor` | yes |
| `src/world/render/canvas-backend.js` | imports T; `CHUNK = 16*T`; overlay sizes in art px times z: plate fonts `font(4.5/5)`, floats `8/9*z`, badges `4.5*z`, walk-mark ellipse `9*z x 4*z`, edge slide `16*z` | yes: the hero plate and walk mark would draw at half size |
| `src/world/render/null-backend.js` | imports T | yes (tests) |
| `src/world/core/compose.js` | T is a parameter, but art-px constants are hardcoded: `WALL_FACE_PX 48`, `CAP_DX 10`, `CAP_H_LIFT 68`, cap crop `[0,20,12,32]`, building shadow polygon `+8/+32/+6/+18/+40/+20`, roof top `-28+12`, roof/chimney rows `31.5/31.6`, chimney `+16/+24`, hero light `foot-18`, bubble `-(height\|\|20)-14`, walk mark `-7`, float `-6`/`-14k` | only bubble, mark and float. Walls, roofs, faces and the cellar light are not reached if the lint in §2.5 holds |
| `src/world/core/map-compile.js` | imports T; `BODY {w:24,h:38}` (the unit-overlap box); wall anchor fallback `59`; roof `-16` | BODY yes; the wall/roof constants no |
| `src/world/town-scene.js`, `walk-scene.js` | `onPixel` uses grid T | yes |
| `src/world/steer-local.js` | `WALK_CYCLE_TILES = 1` (one walk cycle per tile; the comment measures a 32 px stride) | yes; the walk clip is authored to a 64 px stride |
| `src/data/world/art-budget.js` | `T`, `CLASSES`, `SHADOW` (absolute px) | yes, for the art build |
| `tools/world-art/build.mjs` | slices terrain at `T`, sizes shadows from `SHADOW` and `T`, validates against `CLASSES` | yes |
| `tools/world-art/validate.mjs` | `T`, `CLASSES`, `TOLERANCE` imported, not passed in | yes |
| `tools/world-art/measure.mjs` | mass uses a 3x3 opening ("thinner than 3 px"); contact uses "the bottom 5 px" | yes. At 64 px these should be 6 and 10, or a 64 px sword blade counts as body |
| `tools/world-art/port-pixellab.mjs` | `T`, `CLASSES` | only if the art lane uses it |
| `src/data/world/atlas-sets.js` | every set loads on the pane's first open into ONE book | yes: a 64 px set must not share the 32 px book |
| `tests/world-core.mjs` C1/C6 | the zoom table, and the one-zoom-from-the-window regex | must be extended, not loosened |
| `tests/world-assets.mjs` | checks every committed manifest against `CLASSES` | must pick the profile by the manifest's `T` |

**Maps** (`src/data/world/maps/*.js`, listed in `maps/index.js` `WORLD_MAPS`) are whole tiles plus sprite ids. They carry no pixel numbers, so a map row is grid-agnostic until it names sprites. **Atlases**: `tools/world-art/build.mjs` turns `art/world/<set>/*.json` sidecars into `assets/world/atlas-<set>.{png,json}`, and the manifest already records `T`.

## 2. The smallest clean design: a per-scene GRID PROFILE

### 2.1 What the scale rule really protects
WORLD_SHELL §1 exists so that every scene is drawn at the same on-screen scale and no zoom is ever fitted to a room. The invariant is **one on-screen TILE size per screen class**: 64 CSS px per tile on the desktop and the phone, 96 above 2400 CSS px. With 32 px art that comes out as density 2 or 3. With 64 px art the same tile is density 1. So the sandbox is not a per-scene zoom. It is a different art grid drawn so that its tile matches the same on-screen tile, and the "never fitted, never per room" rule still holds word for word.

### 2.2 The profile table (one new data row per grid; no fork)
In `src/data/world/art-budget.js`:
```js
export const GRIDS = Object.freeze({
  base: { T: 32, density: 2, wideDensity: 3, thin: 3, contactBand: 5, classes: CLASSES, shadow: SHADOW },
  hd64: { T: 64, density: 1, wideDensity: 1, thin: 6, contactBand: 10, classes: CLASSES_HD64, shadow: SHADOW_HD64 },
});
export const gridOf = (id) => GRIDS[id || 'base'];
```
- `CLASSES_HD64` is derived as `scaleClasses(CLASSES, 2)`, which doubles every px field, plus any hd64-only rows the art lane needs (for example `monster64`). It is derived, never hand-copied, so nothing exists twice. `SHADOW_HD64` doubles `dx/dy`.
- **Above 2400 CSS px,** 96 CSS px / 64 art px = 1.5, which is not a whole number. At DPR 2 it is exact (z = 3); at DPR 1 it is not. The sandbox therefore uses `wideDensity: 1`: on a window wider than 2400 CSS px at DPR 1 it shows 1.5x more world than the town does. That is a known, stated limitation, and it keeps pixels integral (§10). Desktop at 1920 and the phone match exactly.
- `grid.js` keeps `T = 32` as the base grid's T for the existing importers, so nothing in the game changes.

### 2.3 Where the profile flows
- **Map row**: an optional `grid: 'hd64'` field. If it is missing, the map is `base`. All seven shipped maps stay byte-identical.
- **`compileMap`** copies `T = gridOf(row.grid).T` onto the compiled map (`map.T`, `map.grid`) and uses that T and `BODY x T/32` instead of the import. For base maps the output is identical, and the `maskHash` of every shipped map is unchanged (the hashes in `tests/world-core.mjs` prove it).
- **`camera.js`**: `zoomFor(innerWidth, dpr, grid = GRIDS.base)` uses `grid.density` / `grid.wideDensity`. The C1 table stays as it is for the default argument, and a hd64 table is added.
- **`canvas-backend.js` / `null-backend.js`**: read `map.T` instead of importing T. `setMap` sets `dirty = true`, so `measure()` recomputes `z = zoomFor(win.innerWidth, dpr, map.grid)`. That is still ONE assignment in `measure()`, still from the window, and it never reads a room frame. C6's regex is widened to allow the third argument only as `map.grid`, with a mutation proof that it still bites on `fitZoom`, `map.frame`, and a second `z =`. Overlay sizes use `u = z * T / 32` (screen px per base art px) where they use `z` today, so plates, floats and the walk mark keep their on-screen size. `u === z` on every base map.
- **`compose.js`**: the three constants a walked map reaches (bubble `-14`/`20`, mark `-7`, float `-6`/`-14k`) are multiplied by `k = T/32`. The wall, roof, face and cellar-light constants are not reached, because of the lint in §2.5. They stay as they are, with a one-line note that they belong to the base grid.
- **`walk-scene.js` / `town-scene.js`**: `onPixel` uses `map.T`.
- **`steer-local.js`**: `createSteer(map, at, o = {})` takes an optional `speed` (tiles per second; defaults to `WALK_TILES_PER_S`) so the monster can amble. The walk cycle stays per tile, and the art lane authors the hd64 walk to a 64 px stride.

### 2.4 Its own atlas set and art-budget profile
- **Art source**: `art/world/sandbox64/` plus `art/world/sandbox64/_set.json` `{ "grid": "hd64" }`. `build.mjs` reads `_set.json` (if it is missing, the set is `base`) and passes `gridOf(...)` into `framesOf`, `shadowOf`, the terrain slicing, `validateSprite`/`validateTerrain` and `measureFrame` (thin and contactBand). Today those import T/CLASSES; they become parameters whose defaults are the base grid, so every existing set rebuilds byte-identical (`build.mjs --check` is the proof). The manifest's existing `T` field records 64.
- **Client registry**: `src/data/world/atlas-sets.js` gets `GRID_SETS = { hd64: ['sandbox64'] }`. `ATLAS_SETS` (base) is unchanged. A hd64 set is NOT loaded on the pane's first open. It is loaded on first entry into a hd64 scene through the existing `loadAtlasSet()` into its OWN book (`createBook`), so a 64 px sprite id can never collide with a 32 px one, and players outside the sandbox never download it.
- **`tests/world-assets.mjs`** picks the class table by `gridOf` of the manifest's grid, and fails a manifest whose `T` does not match its declared grid.

### 2.5 Its own map data file
`src/data/world/maps/sandbox_hd64.js`: `kind: 'sandbox'`, `grid: 'hd64'`, `outdoor: true`, `light: 'day'`, `hunts: []`, `faces: []`, a ground terrain from the sandbox set, objects naming sandbox64 sprite ids, `start`, `focus`, an exit sign object, `monster: { id, at: [x, y], leash: n }`, and `maskHash`. It is listed in `WORLD_MAPS`, so `lintMap` and the hash checks run on it. It is not listed in `STAGED_MAPS`, and no hunt names it, so `HUNT_MAP_INDEX` and the server never see it.

**Lint addition** (`lintMap`): a map whose grid is not `base` may not have `faces`, wall-kit buildings (anything but `painted` or `closed` whole-building sprites) or `light: 'cellar'`, and must have `hunts: []`. That keeps every unscaled compose constant out of reach by rule rather than by habit. If the hd64 world later needs walls, those constants scale by `k` in that lane.

`map-compile.js` `MAP_KINDS` gains `'sandbox'`, and `WALKED_KINDS` gains `'sandbox'`.

### 2.6 Entering and leaving from a sign
- **The way in, without touching `town_common.js`**: `src/world/sandbox-scene.js` adds one non-blocking prop to the town frame's `props` while `SANDBOX.open` is true: the existing 32 px `signpost` sprite on an open grass tile, with `ref: { scene: 'sandbox' }` and a plate "Sandbox (64 px)". This uses the same `props` channel the home uses for furniture, so the town map row, its collision mask and its `maskHash` are unchanged.
- **The way out**: the sandbox map's exit sign carries `ref: { scene: 'town' }`.
- **`steer-local.js` `tapAction`**: one branch, `if (ref && ref.scene) return { kind: 'scene', choice: ref.scene }`. `runAction` already routes `scene` to `nav.scene`, which does no network.
- **`store.js` `setChoice`** accepts `'sandbox'` (it currently clamps anything else to town). `SCENE_MAPS` gains `sandbox: 'sandbox_hd64'`, and `sceneFor` returns `{ map: sceneMaps.sandbox, kind: 'sandbox' }` for that choice. A hunt still overrides it: if the server says the hero is fighting, the hunt shows, exactly as it does over town.
- **First entry**: `nav.scene('sandbox')` awaits the hd64 book (`sandbox-scene.js ensureBook`) before `setChoice`, so the scene never opens on stubs. A failed load logs and stays in town.
- **`world-boot.js`** keeps a book and tables per grid (`tablesFor(map.grid)`), and `mapOf` compiles each map with its grid's tables. The extra wiring lives in `sandbox-scene.js` so `world-boot.js` (443 lines; the cap is 600) gains roughly 15 lines. The town/home chrome buttons stay visible in the sandbox, and pressing Town is a second way out.

## 3. Walking with no server authority, and why that is allowed

- **Walking is the same display-only feet the town and home already use** (`steer-local.js createSteer`, through `walk-scene.js`). A tap or WASD moves a local body; nothing is an intent (`runAction`'s `nav` cannot send one; `tests/client-intent-surface.mjs` pins the whole RPC surface, and this change adds nothing to it). The position goes to `G._world.pos` through `store.notePos`. That is `_`-prefixed display scratch, outside the `RESIDUE_FIELDS` allowlist, never saved, and forgotten on reload, so a reload lands back in town. That is correct, because the choice also lives only in `_world` (`tests/world-no-authority.mjs` still holds: the only G write is `_world`).
- **The hero's real server position.** The town does hold one: `TownPresence` publishes `hr_town_move` (display presence, `2026-10-25-town-walk.sql`). Today `walkState` calls `town.show(null)` on any non-town scene, which sends a LEAVE. The sandbox must not do that. While the scene kind is `'sandbox'`, world-boot calls `town.park()` instead, the same path used when another character is viewed. The body stays on the sign tile in town for everyone else, and its existing keepalive re-sends that same tile. No sandbox tile is ever published (and `placeOf` would only ever send the town map id). On exit, `town.show('town_common')` un-parks, and `placeOn` returns the sign tile, so the hero reappears where it entered. The sandbox itself makes **zero** server calls. The only traffic while inside is the parked keepalive that already exists.
- **No peers in the sandbox.** `walk-scene.js` builds a `createTownCast` only for `kind === 'town'`, so the sandbox shows no other players and reads no walkers.
- **§1 check**: the client authors nothing that crosses to the server or to another player. There is no XP, gold, item, position or timestamp to forge. §6 check: no number a player can act on is predicted, and no gate reads a client-held tier. Visibility is not a server capability: the sandbox unlocks nothing, and its art is public on Pages anyway. A modified client that shows it gains nothing.

## 3a. The display-only 64 px monster

- **Placement**: map row `monster: { id: 'sandbox_beast', at: [x, y], leash: 4 }`. The lint checks that `at` is open and reachable from `start`, and that the sprite id is in the hd64 book (otherwise it draws as a stub). The art lane delivers a sidecar of class `monster64` (from `CLASSES_HD64`, 128x128 frame) with `idle` and `walk` clips in the four cardinals.
- **Animation and wander** (`sandbox-scene.js createWanderer(map, row, o)`, pure, with the clock passed in): one `createSteer(map, at, { speed: 1.6 })`. When it rests longer than `restMs` (2-5 s, picked by a mulberry32 PRNG seeded from the map id, so the motion is deterministic under test), it walks to a random open tile within `leash` tiles of `at` (`standOn` clamps to reachable). Each frame it returns one unit, `{ id, x, y, dir, diag, anim, age }`, from `walkClip`, the same rule the hero and peers use. It has no plate and no `ref`, so a tap on it walks the hero there and a right-click opens nothing.
- **No combat.** It is not free: the only combat path is `src/core/combat-sim.js` through the server settle (§6, one combat engine). The wanderer never imports from `src/core/hunt*`, `combat*` or `src/hunt-view`. A test asserts this.
- The hero in the sandbox wears a hd64 hero sprite from the art lane (`sandbox_hero`), because 32 px outfits are not in the hd64 book. `sandbox-scene.js` passes that id as `heroSprite`.

## 4. File-by-file plan, tests, effort

**Lane 1, engine (systems-engineer, xhigh): about 1 lane.**

| File | Change |
|---|---|
| `src/data/world/art-budget.js` | `GRIDS`, `gridOf`, `scaleClasses`, `CLASSES_HD64`, `SHADOW_HD64` |
| `src/data/world/atlas-sets.js` | `GRID_SETS` |
| `src/data/world/sandbox.js` (new) | `SANDBOX = { open: true, map: 'sandbox_hd64', entry: { map: 'town_common', at: [x, y] } }` (the ONE switch, §7) |
| `src/data/world/maps/sandbox_hd64.js` (new), `maps/index.js` | the map row; one row in `WORLD_MAPS`, plus `SCENE_MAPS.sandbox` |
| `src/world/core/camera.js` | `zoomFor(..., grid)`; the header comment states the one-tile-size rule |
| `src/world/core/map-compile.js` | `map.T`/`map.grid`; `BODY` scaled; `'sandbox'` kind; the lint in §2.5 |
| `src/world/core/compose.js` | `k = T/32` on bubble, mark and float |
| `src/world/core/scene-route.js`, `src/world/store.js` | the `'sandbox'` choice |
| `src/world/render/canvas-backend.js`, `null-backend.js` | `map.T`; zoom by grid in `measure()`; overlay `u` |
| `src/world/walk-scene.js`, `town-scene.js` | `onPixel` by `map.T`; props pass-through for the entry sign |
| `src/world/steer-local.js` | the `ref.scene` branch; optional `speed` |
| `src/world/sandbox-scene.js` (new, about 120 lines) | `ensureBook`, the entry prop, `createWanderer` |
| `src/world/world-boot.js` | per-grid tables/books; `park()` instead of `show(null)` in the sandbox; the wanderer unit in the frame |
| `tools/world-art/build.mjs`, `validate.mjs`, `measure.mjs` | the grid passed as a parameter; `_set.json` |

**Lane 2, art (asset-director, separate):** `art/world/sandbox64/*` (ground terrain, around 10 props, the exit sign, `sandbox_hero`, `sandbox_beast`) built with `build.mjs`. It needs Lane 1's `build.mjs` change first, or it can start from sidecars and build once that lands. Lane 1 can ship with stubs, because the book stub-falls-back.

**Tests (in Lane 1's commit):**
- **Happy path, new `tests/world-sandbox.mjs`**: a node test on the null backend and the pure scenes. It (a) enters the town and finds the entry prop; a `tapAction` on it gives `{kind:'scene', choice:'sandbox'}`; (b) `readScene` gives `sandbox_hd64`, and the compiled map has `T === 64`; (c) it drives the hero 3 tiles with `drive([1,0])` and asserts the position changed; (d) the wanderer moves within its leash over 30 s of injected clock and plays `walk` then `idle`; (e) it taps the exit sign, gets back to town, and `TownPresence.placeOn('town_common')` equals the entry tile; (f) with a fake `server.rpc` recorder, the whole run sends no RPC except `hr_town_move` with the town map and the entry tile (no leave, no sandbox map id); (g) the sandbox module graph imports nothing from `src/core/hunt*`, `combat*`, `src/hunt-view`. It has a `--mutate` proof: `show(null)` instead of `park()` turns (f) red, and dropping the `ref.scene` branch turns (a) red.
- **Guards touched, each kept as strict**: `tests/world-core.mjs` (a C1 hd64 table; C6 regex widened plus its mutant; hashes and lint over the new map), `tests/world-assets.mjs` (grid-aware), `tools/world-art/build.mjs --check` (every base set byte-identical), `tests/world-town-home.mjs` and `tests/world-hunt.mjs` (must stay green unchanged, which proves base maps are untouched), `tests/world-no-authority.mjs`, `tests/client-intent-surface.mjs` (no new surface), `tests/client-module-size.mjs`, `tests/perf-budget.mjs` (no extra load for players outside the sandbox).

**Effort: 1 engine lane (about half a day of agent time) plus 1 art lane, run in parallel. No DB, no edge, no Security.**

## 5. art-budget.js line 4
Fixed on this branch, one line: "drawn at an integer zoom (×2, ×3 only above 2400 CSS px)".

## 6. Blast radius and risks
- Shared renderer files are edited, but each edit is the identity at T = 32. The proof is the existing world tests, map hashes and `build.mjs --check` passing unchanged.
- No server, migration, edge, residue or save change. No CONFLICTS.md entry: the only cross-domain dependency is Lane 2's art, which this spec defines as sidecars under `art/world/sandbox64/`.
- At DPR 1 above 2400 CSS px the sandbox shows 1.5x more world than the town (§2.2).

## 7. Before the game reopens (CLAUDE.md §3.5): what to hide or remove
1. Set `SANDBOX.open = false` in `src/data/world/sandbox.js`. That removes the entry prop, and `setChoice('sandbox')` refuses when it is closed. Better still, if Tyler does not adopt hd64 for the real world: delete `sandbox.js`, `sandbox-scene.js`, `maps/sandbox_hd64.js`, its `WORLD_MAPS`/`SCENE_MAPS` rows, `GRID_SETS.hd64` and `assets/world/atlas-sandbox64.*`. Keep the grid profile only if hd64 becomes the real grid.
2. Add one line to the priority board's reopen checklist (next to the closed-mode `hr_flags` switch) naming this file. `tests/world-sandbox.mjs` prints a reminder line while `SANDBOX.open` is true.
