// ════════════════════════════════════════════════════════════════════════
// src/world/view-sheets.js — THE TOWN OPENS ON ITS VIEW, NOT ON ALL ITS SHEETS.
//
// Phone, first visit (11-04): Play waited 6.5 s for the town's six sheets, and a first view at the hearth draws two of them.
// A town frame shows once every sheet IT draws has arrived (backend.missing), so its pixels are the ones a frame with every
// sheet paints. The others are asked for as it opens, all at once (one at a time cost the last one 1.5 s of round trips on a phone's line and
// gained the first frame nothing), and a view that reaches one before it lands
// keeps its last frame until it does: never a stub. A failed sheet counts as arrived and draws stubs, as it always has.
// Only the town: a ground's monsters walk in from sheets no view names yet, so a ground still opens whole.
// Proof: tests/client-boot.mjs B-21; its pixels, tests/perf-budget.mjs PB-VIEW.
// ════════════════════════════════════════════════════════════════════════
import { SCENE_MAPS } from '../data/world/maps/index.js?v=0.2.115';

/* how long a first view waits for the server to say where its hero stands (a read lost on a bad line) */
const PLACE_WAIT_MS = 3000;

/**
 * @param {{win: Window, sheets: {ready: (sets: string[]) => boolean, ensure: (sets: string[]) => Promise<boolean>}, needs: Map<string, string[]>,
 *   town: object|null, missing: (cast: object) => string[], wake: () => void}} o
 *   needs: map id -> its scene's sheets; missing: what a frame draws that has not arrived; wake: draw now if no loop runs
 */
export function createViewSheets(o) {
  const { win, sheets, needs, town, missing, wake } = o;
  const asked = new Set(), behind = new Set();
  let opening = false;
  const opensOnView = (id) => id === SCENE_MAPS.town;

  function loadBehind(id) {
    if (behind.has(id)) return;
    behind.add(id);
    sheets.ensure(needs.get(id));
  }

  /* Does this frame of `id` draw a sheet still on its way? It is asked for at once, and the last frame stays. */
  function check(id, cast) {
    if (!opensOnView(id) || sheets.ready(needs.get(id))) return false;
    const miss = missing(cast);
    /* no wake while open() is at work: it goes on by itself, and a wake starts the frame loop, seconds of frames that cannot show (phone: 0.5 s of main thread) */
    for (const set of miss) if (!asked.has(set)) { asked.add(set); sheets.ensure([set]).then(() => { if (!opening) wake(); }); }
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
    opening = true;
    try {
      for (let waited = false; ; waited = true) {
        const now = look();
        if (!now) return;
        if (!waited && town && !town.placeOn(now.id)) {
          await Promise.race([town.heard(), new Promise((done) => win.setTimeout(done, PLACE_WAIT_MS))]);
          continue;
        }
        if (!check(now.id, now.cast)) return;
        await sheets.ensure(missing(now.cast));
      }
    } finally { opening = false; }
  }
  /** May this frame of `id` show? No frame of the town shows, or asks for a sheet on its own, while open() is at work (a zoom's or a tab's sync can run one). */
  const held = (id, cast) => (opening ? opensOnView(id) : check(id, cast));

  return { opensOnView, held, open };
}
