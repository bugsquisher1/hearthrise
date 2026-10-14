// ════════════════════════════════════════════════════════════════════════
// src/world/atlas.js — EVERY SPRITE'S FRAME, REAL OR STUB.
//
// The book loads each shipped atlas image (src/data/world/atlas-sets.js) with
// the build's cache-buster and answers two questions per sprite id:
//   geometry(id, cls)  { w, h, ax, ay, hover } — what compose.js lays out with
//   frame(id, cls)     a blit source and rect, plus the same geometry
// A sprite no loaded atlas carries gets its stub (stub-atlas.js), so the
// world draws completely before, during and after the real art arrives.
// ════════════════════════════════════════════════════════════════════════
import { ATLAS_SETS } from '../data/world/atlas-sets.js?v=573';
import { stubGeometry, paintStub } from './stub-atlas.js?v=573';

/**
 * @param {{doc: Document, colour: (name: string) => string, version: number|string,
 *          sets?: object, onChange?: () => void}} o
 */
export function createAtlasBook(o) {
  const sets = o.sets || ATLAS_SETS;
  const real = new Map();
  const stubs = new Map();
  for (const [name, set] of Object.entries(sets)) {
    const img = o.doc.createElement('img');
    img.decoding = 'async';
    img.onload = () => {
      for (const [id, f] of Object.entries(set.frames || {})) real.set(id, { img, f });
      if (o.onChange) o.onChange();
    };
    img.onerror = () => console.warn('[world] atlas "' + name + '" did not load; its sprites stay stubs');
    img.src = set.image + '?v=' + o.version;
  }
  function stub(id, cls) {
    const key = id + '|' + (cls || '');
    let s = stubs.get(key);
    if (!s) {
      const geo = stubGeometry(id, cls);
      const canvas = o.doc.createElement('canvas');
      canvas.width = geo.w; canvas.height = geo.h;
      paintStub(canvas.getContext('2d'), id, geo, o.colour);
      s = { src: canvas, sx: 0, sy: 0, w: geo.w, h: geo.h, ax: geo.ax, ay: geo.ay, hover: 0, nine: null };
      stubs.set(key, s);
    }
    return s;
  }
  function frame(id, cls) {
    const r = real.get(id);
    if (!r) return stub(id, cls);
    const f = r.f;
    return { src: r.img, sx: f.x, sy: f.y, w: f.w, h: f.h, ax: f.anchor_px[0], ay: f.anchor_px[1], hover: f.hover_px || 0, nine: f.nine || null };
  }
  return { frame, geometry: frame, realCount: () => real.size };
}
