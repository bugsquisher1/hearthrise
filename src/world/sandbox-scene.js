// ════════════════════════════════════════════════════════════════════════
// src/world/sandbox-scene.js — THE 64 PX SANDBOX: ITS ART, ITS SIGNS, ITS ONE MONSTER.
//
// The sandbox (src/data/world/sandbox.js) is a walked map on another art grid
// (src/data/world/art-budget.js GRIDS.hd64). This module is everything the
// World pane does differently there, so world-boot.js only asks it:
//   art      that grid's atlas sets (atlas-sets.js GRID_SETS), loaded on the
//            first entry into a book of their own; until they arrive the pane
//            keeps showing the Common, and a failed load stays there
//   extras   what a walk scene adds on a map: the entry signpost in the
//            Common, the exit sign, the 64 px hero and the wanderer in the
//            sandbox. A sign is a prop with ref.scene (steer-local.js
//            tapAction): a tap switches the scene and sends nothing.
//   wanderer the ONE monster: display only. Its own feet (steer-local.js
//            createSteer, slower), resting a seeded 2-5 s and then walking to
//            an open tile within its leash; the walk clip by distance
//            (walkClip), as every walker. No combat: nothing here reaches the
//            combat engine, the hunt view or the server.
// The hero's TOWN PRESENCE is parked on the entry sign while it is inside
// (world-boot.js): the sandbox never publishes a tile and never leaves town.
// ════════════════════════════════════════════════════════════════════════
import { SANDBOX } from '../data/world/sandbox.js?v=0.2.39';
import { GRID_SETS } from '../data/world/atlas-sets.js?v=0.2.39';
import { GRIDS } from '../data/world/art-budget.js?v=0.2.39';
import { createBook, STUB_SPRITE } from './core/book.js?v=0.2.39';
import { pickFacing } from './core/facing.js?v=0.2.39';
import { createSteer, standOn, walkClip } from './steer-local.js?v=0.2.39';

/* A small seeded generator (mulberry32): the same map wanders the same way, so a test can replay it. */
function seeded(text) {
  let a = 0;
  for (let i = 0; i < text.length; i++) a = (Math.imul(a, 31) + text.charCodeAt(i)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * THE WANDERER: one display-only monster on `map` (compileMap output). frame(now) → the unit to draw.
 * @param {object} map
 * @param {{id: string, at: number[], leash: number, speed: number, restMs: number[]}} row  SANDBOX.monster
 * @param {object} [sprites]  the map's sprite records (the walk clip's length)
 */
export function createWanderer(map, row, sprites) {
  const home = standOn(map, row.at);
  const steer = createSteer(map, home, { speed: row.speed });
  const rand = seeded(map.id + ':' + row.id);
  const T = map.T || GRIDS.base.T;
  const onPixel = (v) => Math.round(v * T) / T;
  /* the open tiles of its leash a walker on its home tile can reach (standOn clamps each pick) */
  const near = [];
  for (let y = home[1] - row.leash; y <= home[1] + row.leash; y++) {
    for (let x = home[0] - row.leash; x <= home[0] + row.leash; x++) {
      if (x >= 0 && y >= 0 && x < map.w && y < map.h && !map.mask[y * map.w + x]) near.push([x, y]);
    }
  }
  let restUntil = null;
  return {
    frame(now) {
      const at = steer.step(now);
      if (!at.moving) {
        if (restUntil === null) restUntil = now + row.restMs[0] + rand() * (row.restMs[1] - row.restMs[0]);
        else if (now >= restUntil && near.length) {
          restUntil = null;
          steer.walkTo(near[Math.floor(rand() * near.length)], now, false);
        }
      }
      const { anim, age } = walkClip(sprites && sprites[row.id], at, steer.restMs(now), pickFacing);
      return { id: row.id, x: onPixel(at.x), y: onPixel(at.y), dir: at.dir, diag: at.diag, anim, age };
    },
    /** The tile it stands on (or is stepping onto); its home tile and leash. */
    cell: () => steer.cell(),
    home, leash: row.leash,
  };
}

/** A sign prop: tapping it (or its name) switches to scene `scene`. */
const sign = (id, at, plate, scene) => Object.freeze({ id, x: at[0], y: at[1], ref: Object.freeze({ scene }), plate: Object.freeze({ text: plate, kind: 'sign' }) });

/**
 * What a walk scene on `map` adds (createWalkScene options): the entry sign in the Common while the
 * sandbox is open; in the sandbox, the exit sign, the 64 px hero and the wanderer. {} anywhere else.
 * @param {object} map  compileMap output
 * @param {object} sprites  that map's sprite records
 */
export function sandboxExtras(map, sprites) {
  if (!SANDBOX.open) return {};
  if (map.id === SANDBOX.entry.map) return { props: [sign(SANDBOX.entry.sprite, SANDBOX.entry.at, SANDBOX.entry.plate, 'sandbox')] };
  if (map.id !== SANDBOX.map) return {};
  const wanderer = createWanderer(map, SANDBOX.monster, sprites);
  return {
    props: [sign(SANDBOX.exit.sprite, SANDBOX.exit.at, SANDBOX.exit.plate, 'town')],
    units: (now) => [wanderer.frame(now)],
    heroSprite: () => SANDBOX.hero,
  };
}

/**
 * THE TOWN PRESENCE for one walked frame on `map` (src/session/town-presence.js; world-boot.js
 * calls this every frame): in town the body is shown and its place published; at home it leaves
 * town; IN THE SANDBOX IT IS PARKED, so it keeps standing where it stood in town (the entry sign)
 * for everyone else, and no sandbox tile is ever sent.
 * @param {object|null} town  the character's TownPresence
 * @param {object} map  compileMap output
 * @param {object} place  the walk frame's place
 */
export function presenceFor(town, map, place) {
  if (!town) return;
  if (map.kind === 'sandbox') town.park();
  else town.show(map.kind === 'town' ? map.id : null);
  if (map.kind === 'town') town.publish(place);
}

/**
 * THE ART OF ANOTHER GRID, loaded on first use. `art(grid)` is { book, images, tables } once its sets
 * arrived (null before, and for the base grid: the pane's own art); `ensure(grid)` loads them.
 * @param {{doc: Document, version: string, tables: object, loadSet: (o: object, set: string) => Promise<{manifest, image}>}} o
 *   tables: the pane's tables (materials, classes, lights); loadSet: atlas.js loadAtlasSet
 */
export function createGridArt(o) {
  const ready = new Map(), loading = new Map();
  async function load(grid) {
    const manifests = {}, images = {};
    await Promise.all((GRID_SETS[grid] || []).map(async (set) => {
      const a = await o.loadSet({ doc: o.doc, version: o.version }, set);
      manifests[set] = a.manifest;
      images[set] = a.image;
    }));
    const book = createBook(manifests);
    /* a sprite the grid's atlas does not carry compiles as a one-tile stub, never a crash */
    const sprites = new Proxy(book.sprites, { get: (t, k) => t[k] || STUB_SPRITE });
    return { book, images, tables: Object.assign({}, o.tables, { sprites }) };
  }
  return {
    art: (grid) => (grid && grid !== 'base' ? ready.get(grid) || null : null),
    /**
     * Resolves true once `grid`'s art is loaded; false when it failed (logged once, and not asked
     * again until a reload: the caller sends the viewer back to the Common).
     */
    ensure(grid) {
      if (!grid || grid === 'base' || ready.has(grid)) return Promise.resolve(true);
      if (!loading.has(grid)) {
        loading.set(grid, load(grid).then((a) => { ready.set(grid, a); return true; }, (e) => {
          console.warn('[world] the ' + grid + ' art did not load; staying in the Common', e && e.message);
          return false;
        }));
      }
      return loading.get(grid);
    },
  };
}
