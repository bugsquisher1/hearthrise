// src/world/render/null-backend.js — the backend with no screen.
// Same interface as canvas-backend.js ({ mount, setMap, sync, snapshot, destroy }) and the
// same compose step over the same manifest book, so a node test reads exactly the draw
// list the canvas would paint.
import { T } from '../core/grid.js?v=575';
import { frameView } from '../core/camera.js?v=575';
import { composeFrame, groundTiles } from '../core/compose.js?v=575';

/** @param {{book: object, tables: object, view?: {w:number,h:number}}} o  view in art px */
export function createNullBackend(o) {
  const view = o.view || { w: 640, h: 360 };
  let map = null, mounted = false, frames = 0, last = null, ground = null;
  return {
    mount() { mounted = true; },
    setMap(m) { map = m; last = null; ground = groundTiles(m, o.book, o.tables, T); },
    sync(state) {
      if (!map) return;
      const fv = frameView(state.hero, view.w, view.h, map, 1, T);
      last = composeFrame(map, o.book, state, fv.view, o.tables, T);
      frames++;
    },
    snapshot() { return { mounted, map: map && map.id, frames, last, ground }; },
    destroy() { mounted = false; map = null; last = null; ground = null; },
  };
}
