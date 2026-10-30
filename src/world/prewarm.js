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
//
// ONE PASS AT A TIME (client-boot B-10, v0.2.71 merge: the work ran on beside the World's
// own pass and a session that died just after Play sent 5 calls, not 3): the World takes
// the sets made here when they are done (prewarmedSets) and stops a pass still running
// (stopPrewarm), and a session that ends stops it too. A stopped pass slices nothing more
// and asks for no sheet.
// ════════════════════════════════════════════════════════════════════════
import { BUILD } from '../build-info.js?v=0.2.71';
import { WORLD_MAPS, SCENE_MAPS } from '../data/world/maps/index.js?v=0.2.71';
import { compileMap } from './core/map-compile.js?v=0.2.71';
import { createBook } from './core/book.js?v=0.2.71';
import { loadManifests, loadAtlasImage, baseTables } from './atlas.js?v=0.2.71';
import { sceneSetsSliced } from './scene-sets.js?v=0.2.71';

const RUNS = new WeakMap();   // win -> { stopped, sets (the town's, once made), done: Promise<string[]> }

/**
 * Fetch and decode the town's sheets, once per page. Resolves to the sets asked for ([] when none were).
 * @param {Window} win
 * @returns {Promise<string[]>}
 */
export function prewarmTown(win) {
  const had = RUNS.get(win);
  if (had && (!had.stopped || had.sets)) return had.done;   // a pass stopped before its sets were made may run again (a second sign-in)
  const run = { stopped: false, sets: null, done: null };
  const o = { doc: win.document, version: BUILD.cache };
  /* the World's own slicing (world-boot.js): the whole-map passes never hold the characters screen; a stopped
     pass schedules nothing more (its promise is left unsettled and dropped with it) */
  const slices = { later: (fn) => { if (!run.stopped) win.setTimeout(() => { if (!run.stopped) fn(); }, 0); }, now: () => win.performance.now() };
  const row = WORLD_MAPS.find((m) => m.id === SCENE_MAPS.town);
  run.done = loadManifests(o).then((manifests) => {
    if (run.stopped) return [];
    const book = createBook(manifests), tables = baseTables(book);
    return sceneSetsSliced(compileMap(row, tables), row, book, tables, slices);
  }).then((sets) => {
    if (run.stopped) return [];
    run.sets = sets;
    return Promise.all(sets.map((set) => loadAtlasImage(o, set).catch(() => null))).then(() => sets);
  }, () => []);
  RUNS.set(win, run);
  return run.done;
}

/** The town's sets this page's pass has made for map `id` (a copy), or null: the World takes them instead of making them again. */
export function prewarmedSets(win, id) {
  const run = RUNS.get(win);
  return run && run.sets && id === SCENE_MAPS.town ? run.sets.slice() : null;
}

/** Stop a pass still running (the World makes its own, or the session ended): no more slices, no sheet asked for. */
export function stopPrewarm(win) {
  const run = RUNS.get(win);
  if (run) run.stopped = true;
}
