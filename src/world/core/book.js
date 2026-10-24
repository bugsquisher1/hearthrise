// ════════════════════════════════════════════════════════════════════════
// src/world/core/book.js — EVERY FRAME, FROM THE ATLAS MANIFESTS.
//
// The manifests (assets/world/atlas-<set>.json; shape: MANIFEST block in
// src/data/world/art-budget.js) are the one source of what a sprite is: its
// class, layer, frame size, anchor, footprint, hover, height and shadow, and
// where each animation frame sits in which atlas. createBook() indexes them so
// compose.js can ask:
//   sprite(id)                  the record, or a stub record for a missing id
//   frame(id, anim, dir, i)     { set, sx, sy, w, h, ax, ay, hover } — set
//                               '' marks a stub (the backend paints a box)
//   frames(id, anim, dir)       how many frames that clip has
//   tile(terrainId, key, n)     a terrain tile's { set, sx, sy } (key NWNESWSE)
//   facing(id, anim, dir, diag) the facing to draw: the diagonal when the clip
//                               has it, else the cardinal (core/facing.js)
// A frame falls back to the nearest cardinal of a missing diagonal, then to
// dir 's', then to the clip's first facing; a missing clip to the first clip.
// PURE: no DOM, no window, no G — the node tests read the same book.
// ════════════════════════════════════════════════════════════════════════
import { pickFacing } from './facing.js?v=0.2.44';

/** The record a sprite id with no art gets: a small solid box on one tile. */
export const STUB_SPRITE = Object.freeze({
  class: 'clutter', layer: 'prop', frame: Object.freeze([20, 20]), anchor: Object.freeze([10, 19]), footprint: Object.freeze([1, 1]),
  hover: 0, height: 20, shadow: null, stub: true,
});

/** @param {{[set: string]: object}} manifests  set name → parsed manifest */
export function createBook(manifests) {
  const sprites = Object.create(null), terrains = Object.create(null), home = Object.create(null);
  for (const [set, m] of Object.entries(manifests || {})) {
    for (const [id, s] of Object.entries(m.sprites || {})) { sprites[id] = s; home[id] = set; }
    for (const [id, t] of Object.entries(m.terrain || {})) terrains[id] = Object.assign({ set }, t);
  }
  const sprite = (id) => sprites[id] || STUB_SPRITE;
  const anim0 = (s, anim) => (anim && s.anims[anim]) || s.anims[Object.keys(s.anims)[0]];
  const clip = (s, anim, dir) => { const a = anim0(s, anim); return a.dirs[pickFacing(a.dirs, dir, null)]; };
  return {
    sprites, terrains, sprite,
    has: (id) => !!sprites[id],
    /** The facing a unit facing `dir` (cardinal) on a step `diag` (diagonal or null) is drawn in (core/facing.js). */
    facing(id, anim, dir, diag) { const s = sprites[id]; return s ? pickFacing(anim0(s, anim).dirs, dir || 's', diag) : dir || 's'; },
    frames(id, anim, dir) { const s = sprites[id]; return s ? clip(s, anim, dir || 's').length : 1; },
    frame(id, anim, dir, i) {
      const s = sprites[id];
      if (!s) return { set: '', id, sx: 0, sy: 0, w: STUB_SPRITE.frame[0], h: STUB_SPRITE.frame[1], ax: STUB_SPRITE.anchor[0], ay: STUB_SPRITE.anchor[1], hover: 0 };
      const list = clip(s, anim, dir || 's');
      const [sx, sy] = list[((i || 0) % list.length + list.length) % list.length];
      return { set: home[id], id, sx, sy, w: s.frame[0], h: s.frame[1], ax: s.anchor[0], ay: s.anchor[1], hover: s.hover || 0 };
    },
    tile(tid, key, n) {
      const t = terrains[tid];
      const list = t && (t.tiles[key] || t.tiles['1111']);
      if (!list) return null;
      const [sx, sy] = list[((n || 0) % list.length + list.length) % list.length];
      return { set: t.set, sx, sy };
    },
  };
}
