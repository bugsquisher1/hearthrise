// ════════════════════════════════════════════════════════════════════════
// src/world/view-sheets.js — THE TOWN OPENS ON ITS VIEW, NOT ON ALL ITS SHEETS.
//
// Phone, first visit (11-04): Play waited 6.5 s for the town's six sheets, and a first view at the hearth draws two of them.
// A town frame shows once every sheet IT draws has arrived (backend.missing), so its pixels are the ones a frame with every
// sheet paints. The others come behind it one at a time, in scene-sets.js's order, and a view that reaches one before it lands
// keeps its last frame until it does: never a stub. A failed sheet counts as arrived and draws stubs, as it always has.
// Only the town: a ground's monsters walk in from sheets no view names yet, so a ground still opens whole.
// Proof: tests/client-boot.mjs B-20.
// ════════════════════════════════════════════════════════════════════════
import { SCENE_MAPS } from '../data/world/maps/index.js?v=0.2.89';

/* how long a first view waits for the server to say where its hero stands (a read lost on a bad line) */
const PLACE_WAIT_MS = 3000;

/**
 * @param {{win: Window, sheets: {ready: (sets: string[]) => boolean, ensure: (sets: string[]) => Promise<boolean>}, needs: Map<string, string[]>,
 *   town: object|null, missing: (cast: object) => string[], gone: () => boolean, wake: () => void}} o
 *   needs: map id -> its scene's sheets, in the order to fetch them; missing: what a frame draws that has not arrived; wake: draw now if no loop runs
 */
export function createViewSheets(o) {
  const { win, sheets, needs, town, missing, gone, wake } = o;
  const asked = new Set(), behind = new Set();
  const opensOnView = (id) => id === SCENE_MAPS.town;

  async function loadBehind(id) {
    if (behind.has(id)) return;
    behind.add(id);
    for (const set of needs.get(id)) { if (gone()) return; await sheets.ensure([set]); }
  }

  /** Does this frame of `id` draw a sheet still on its way? It is asked for at once, and the last frame stays. */
  function held(id, cast) {
    if (!opensOnView(id) || sheets.ready(needs.get(id))) return false;
    const miss = missing(cast);
    for (const set of miss) if (!asked.has(set)) { asked.add(set); sheets.ensure([set]).then(wake); }
    if (!miss.length) loadBehind(id);
    return miss.length > 0;
  }

  /**
   * Until the first view's sheets are in. Where the hero stands is the server's: its first read names the view, so what that
   * view draws is asked only once it has answered, or the town's start would fetch sheets the view never draws. A read that
   * never answers opens on the start, as a frame would.
   * @param {() => ({id: string, cast: object}|null)} look  this frame's scene and draw state; null: not a scene that opens on its view
   */
  async function open(look) {
    for (let waited = false; ; waited = true) {
      const now = look();
      if (!now) return;
      if (!waited && town && !town.placeOn(now.id)) {
        await Promise.race([town.heard(), new Promise((done) => win.setTimeout(done, PLACE_WAIT_MS))]);
        continue;
      }
      if (!held(now.id, now.cast)) return;
      await sheets.ensure(missing(now.cast));
    }
  }

  return { opensOnView, held, open };
}
