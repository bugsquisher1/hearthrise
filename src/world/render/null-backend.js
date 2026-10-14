// src/world/render/null-backend.js — the backend with no screen.
// Same interface as canvas-backend.js ({ mount, setMap, sync, snapshot, destroy }) and the
// same compose step, so a node test reads exactly the draw list the canvas would paint.
import { T } from '../core/grid.js?v=574';
import { frameView } from '../core/camera.js?v=574';
import { composeFrame } from '../core/compose.js?v=574';
import { stubGeometry } from '../stub-atlas.js?v=574';

/** @param {{view?: {w:number,h:number}, geometry?: Function}} [o] view in art px */
export function createNullBackend(o = {}) {
  const view = o.view || { w: 480, h: 300 };
  const geometry = o.geometry || stubGeometry;
  let map = null, mounted = false, frames = 0, last = null;
  return {
    mount() { mounted = true; },
    setMap(m) { map = m; last = null; },
    sync(state) {
      if (!map) return;
      const fv = frameView(state.hero, view.w, view.h, map, 1, T);
      last = composeFrame(map, geometry, state, fv.view, T);
      frames++;
    },
    snapshot() { return { mounted, map: map && map.id, frames, last }; },
    destroy() { mounted = false; map = null; last = null; },
  };
}
