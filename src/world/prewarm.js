// ════════════════════════════════════════════════════════════════════════
// src/world/prewarm.js — THE TOWN'S ART, FETCHED WHILE THE PLAYER PICKS A HERO.
//
// Every release changes the ?v= on every sheet, so a returning player's first Play
// after a release is a cold one: it waited for the town's six sheets (2.5 MB) after
// the press (perf lane 2026-10-29: Play to the first town frame 1.56 s cold vs 0.40 s
// warm, at 20 Mbps and 40 ms). The boot asks for them once an account is known
// (src/app/boot.js, beside the icon atlas), so they arrive while the roster is read
// and the hero picked: the sets the World itself derives for the town (scene-sets.js),
// loaded into the page's one held copy of each sheet (src/render/images.js), which the
// World's first open then finds decoded. Display art only; a sheet that fails here is
// fetched again by the World, which logs it.
// ════════════════════════════════════════════════════════════════════════
import { BUILD } from '../build-info.js?v=0.2.70';
import { WORLD_MAPS, SCENE_MAPS } from '../data/world/maps/index.js?v=0.2.70';
import { compileMap } from './core/map-compile.js?v=0.2.70';
import { createBook } from './core/book.js?v=0.2.70';
import { loadManifests, loadAtlasImage, baseTables } from './atlas.js?v=0.2.70';
import { sceneSetsSliced } from './scene-sets.js?v=0.2.70';

const PENDING = new WeakMap();

/**
 * Fetch and decode the town's sheets, once per page. Resolves to the sets asked for ([] when none could be).
 * @param {Window} win
 * @returns {Promise<string[]>}
 */
export function prewarmTown(win) {
  let p = PENDING.get(win);
  if (p) return p;
  const o = { doc: win.document, version: BUILD.cache };
  /* the World's own slicing (world-boot.js): the whole-map passes never hold the characters screen */
  const slices = { later: (fn) => win.setTimeout(fn, 0), now: () => win.performance.now() };
  const row = WORLD_MAPS.find((m) => m.id === SCENE_MAPS.town);
  p = loadManifests(o).then((manifests) => {
    const book = createBook(manifests), tables = baseTables(book);
    return sceneSetsSliced(compileMap(row, tables), row, book, tables, slices);
  }).then((sets) => Promise.all(sets.map((set) => loadAtlasImage(o, set).catch(() => null))).then(() => sets), () => []);
  PENDING.set(win, p);
  return p;
}
