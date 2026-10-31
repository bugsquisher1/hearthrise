// ════════════════════════════════════════════════════════════════════════
// src/world/render/frame-sig.js — HAS ANYTHING THIS FRAME DRAWS CHANGED?
//
// The canvas backend composes a draw list every frame (core/compose.js) and paints it only when the
// list differs from the one it painted last: a town standing still repainted the same picture 60 times
// a second (37% of a fast core, all of an old laptop's; tests/perf-budget.mjs PB-IDLE). So nothing that
// animates needs naming here: a torch, a walker or a hit is a changed entry, painted on the frame it
// changes, and a frame is held only when every value in it is the one last painted.
//
// A signature is a flat list of the values walked, compared in place: exact (no hash to collide), and
// nothing allocated per frame once its length has settled. A list's entries are walked whole, so a field
// compose.js adds later is read here with no change. `ref` is not drawn (what a press on a thing names, a
// new record every answer): only whether there is one is read, and the backend takes it from each frame's list.
// ════════════════════════════════════════════════════════════════════════

const UNDRAWN = 'ref';

export function createFrameSig() {
  const had = [];
  let n = 0, changed = true;
  const put = (v) => {
    if (had[n] !== v) { had[n] = v; changed = true; }
    n++;
  };
  const walk = (v) => {
    if (v === null || typeof v !== 'object') { put(v); return; }
    if (Array.isArray(v)) { put(v.length); for (let i = 0; i < v.length; i++) walk(v[i]); return; }
    for (const k in v) {
      if (k === UNDRAWN) { put(!!v[k]); continue; }
      put(k);
      walk(v[k]);
    }
  };
  return {
    /** Start a frame's signature. */
    begin() { n = 0; changed = false; },
    /** One value (a number, a string, a boolean), or a whole list or record: walked. */
    add: walk,
    /** True when this frame's values differ from the last frame's (a NaN always does: never held on a doubt). */
    end() {
      if (had.length !== n) { had.length = n; changed = true; }
      return changed;
    },
    /** The next frame differs, whatever it holds (a canvas cleared, a colour token changed). */
    forget() { had.length = 0; },
  };
}
