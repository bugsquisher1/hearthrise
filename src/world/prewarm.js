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
// ONE PASS AT A TIME, ONE SESSION (client-boot B-10/B-15): the World takes the sets made here when
// they are done (prewarmedSets) and stops a pass still running (stopPrewarm). The pass belongs to the
// account that started it (o.alive, src/app/boot.js): asked before every slice and before EACH sheet,
// one sheet at a time, so a session that ends (signed out, refused) asks for no sheet afterwards,
// whatever the pass was doing (release/v0.2.73 run 41045835796: a stop sent as a message missed
// the pass on CI and all six sheets were fetched for a signed-out account).
// ════════════════════════════════════════════════════════════════════════
import { BUILD } from '../build-info.js?v=0.2.75';
import { WORLD_MAPS, SCENE_MAPS } from '../data/world/maps/index.js?v=0.2.75';
import { compileMap } from './core/map-compile.js?v=0.2.75';
import { createBook } from './core/book.js?v=0.2.75';
import { loadManifests, loadAtlasImage, baseTables } from './atlas.js?v=0.2.75';
import { sceneSetsSliced } from './scene-sets.js?v=0.2.75';

const RUNS = new WeakMap();   // win -> { stopped, live(), sets (the town's, once made), done: Promise<string[]> }

/**
 * Fetch and decode the town's sheets, once per page and session. Resolves to the sets asked for ([] when none were).
 * @param {Window} win
 * @param {{alive?: () => boolean}} [opt]  the session this pass works for is still the page's (false: stop now)
 * @returns {Promise<string[]>}
 */
export function prewarmTown(win, opt = {}) {
  const had = RUNS.get(win);
  if (had && (had.live() || had.sets)) return had.done;   // a pass stopped before its sets were made may run again (a second sign-in)
  const alive = typeof opt.alive === 'function' ? opt.alive : () => true;
  const run = { stopped: false, sets: null, done: null, live: () => !run.stopped && alive() };
  const o = { doc: win.document, version: BUILD.cache };
  /* the World's own slicing (world-boot.js): the whole-map passes never hold the characters screen; a pass that is
     no longer live schedules nothing more (its promise is left unsettled and dropped with it) */
  const slices = { later: (fn) => { if (run.live()) win.setTimeout(() => { if (run.live()) fn(); }, 0); }, now: () => win.performance.now() };
  const row = WORLD_MAPS.find((m) => m.id === SCENE_MAPS.town);
  run.done = loadManifests(o).then((manifests) => {
    if (!run.live()) return [];
    const book = createBook(manifests), tables = baseTables(book);
    return sceneSetsSliced(compileMap(row, tables), row, book, tables, slices);
  }).then(async (sets) => {
    if (!run.live()) return [];
    run.sets = sets;
    for (const set of sets) {
      if (!run.live()) break;   // the session ended (or the World took over) since the last sheet
      await loadAtlasImage(o, set).catch(() => null);
    }
    return sets;
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
