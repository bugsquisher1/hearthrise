// ════════════════════════════════════════════════════════════════════════
// src/world/worn-sets.js — A WORN SET COMES WITH THE FIRST HERO WHO WEARS IT (lane/b-factions-open, v0.2.142).
//
// A worn set (src/data/world/atlas-sets.js WORN_SETS: `factionwear`, the faction looks) is in no scene's sheets and its manifest is
// not read on the pane's first open, so an account that never meets a faction look fetches none of it. The first time a hero drawn
// from one is about to be on screen (yours, a walker in town, a seat in a hunt) its manifest joins the book (core/book.js add) and its
// sheet loads beside the scene's (atlas.js createSceneImages); the pane draws it from the next frame after both land. Meanwhile:
//   another hero  is left out of the frame (the World's rule for a unit whose sheet is on its way: never a stub box)
//   your hero     keeps the look it was last drawn in (put on mid-session, the old look stays until the new one lands); the first
//                 scene opens with your own look already in (world-boot.js prepareScene)
// A set that fails settles as every failed set does: its sprites draw as stubs.
// PURE of globals: the book, the sheets, the manifest loader and the wake are handed in.
// ════════════════════════════════════════════════════════════════════════
import { wornSetOf } from '../data/world/atlas-sets.js?v=0.2.143';
import { outfitSprite } from '../data/hunt-outfits.js?v=0.2.143';

/**
 * @param {{book: {add: (set: string, manifest: object) => void}, sheets: {ensure: (sets: string[]) => Promise<boolean>},
 *   manifest: (set: string) => Promise<object>, wake: () => void}} o
 *   manifest: the set's manifest (atlas.js loadAtlasManifest); wake: draw once more now that a set landed
 */
export function createWornSets(o) {
  const loads = new Map(), settled = new Set();
  let hero = null;
  function load(set) {
    if (!loads.has(set)) {
      const manifest = o.manifest(set).then((m) => { o.book.add(set, m); return true; },
        (e) => { console.warn('[world] atlas "' + set + '" did not load; its sprites draw as stubs', e && e.message); return false; });
      loads.set(set, Promise.all([manifest, o.sheets.ensure([set])]).then(([a, b]) => { settled.add(set); o.wake(); return a && b; }));
    }
    return loads.get(set);
  }
  /** Can sprite `id` be drawn now? Always for a sprite of a first-open set; for a worn set's, once it has settled (asked for here). */
  function ready(id) {
    const set = wornSetOf(id);
    if (!set || settled.has(set)) return true;
    load(set);
    return false;
  }
  return {
    ready,
    /** The worn sets of `ids`, loaded: resolves once each has settled (true when every one landed). */
    ensure: (ids) => Promise.all([...new Set(ids.map(wornSetOf).filter(Boolean))].map(load)).then((r) => r.every(Boolean)),
    /** `units` less every one whose worn set is still on its way (each asked for): the same array when none is. */
    keep(units) {
      let out = null;
      for (let i = 0; i < units.length; i++) {
        if (ready(units[i].id)) { if (out) out.push(units[i]); } else if (!out) out = units.slice(0, i);
      }
      return out || units;
    },
    /** The sprite your hero is drawn in: `id` once its set is in, else the look it was last drawn in (the tank's when it has none yet). */
    hero(id) {
      if (ready(id)) hero = id;
      return hero && ready(hero) ? hero : outfitSprite(null, null);
    },
  };
}
