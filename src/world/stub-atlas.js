// ════════════════════════════════════════════════════════════════════════
// src/world/stub-atlas.js — THE FRAME A SPRITE GETS BEFORE ITS ART EXISTS.
//
// Any sprite id no shipped atlas carries (src/data/world/atlas-sets.js) is drawn
// as a flat box sized like the art it stands in for: the frame size, the anchor
// and the box follow the art-budget scale table (a hero ~38 px tall in a 64x64
// frame, a door 48, a tree 3.5 tiles), so a scene laid out against the stubs
// is laid out right for the real art. Each stub is the same SHAPE as a real
// atlas frame ({ w, h, ax, ay } plus a source to blit), which is why a real
// atlas drops in as a data row with no code change.
//
// Colours are the --world-stub-* tokens (src/styles/tokens.css); this file
// names tones, never colours. stubGeometry() is pure; paintStub() needs a 2D
// context.
// ════════════════════════════════════════════════════════════════════════
import { PROPS, TERRAIN } from '../data/world/terrain.js?v=574';

const box = (w, h, ax, ay, bx, by, bw, bh, tone) => Object.freeze({ w, h, ax, ay, box: Object.freeze([bx, by, bw, bh]), tone });

/** Frame geometry per art-budget class: frame w/h, anchor, the drawn box, its tone. */
const CLASS = Object.freeze({
  hero: box(64, 64, 32, 60, 22, 22, 20, 38, 'hero'),
  vermin: box(32, 32, 16, 28, 8, 14, 16, 14, 'mob'),
  beast: box(64, 48, 32, 44, 10, 20, 44, 24, 'mob'),
  wall: box(32, 58, 16, 58, 0, 0, 32, 58, 'wall'),
  door: box(32, 58, 16, 58, 4, 10, 24, 48, 'door'),
  chest: box(24, 20, 12, 20, 2, 4, 20, 16, 'wood'),
  crate: box(22, 20, 11, 20, 1, 2, 20, 18, 'wood'),
  barrel: box(20, 26, 10, 26, 1, 0, 18, 26, 'wood'),
  table: box(28, 22, 14, 22, 2, 0, 24, 22, 'wood'),
  chair: box(18, 26, 9, 26, 1, 0, 16, 26, 'wood'),
  bed: box(28, 60, 14, 60, 1, 0, 26, 60, 'cloth'),
  hearth: box(60, 44, 30, 44, 0, 0, 60, 44, 'stone'),
  small: box(12, 10, 6, 10, 1, 0, 10, 10, 'stone'),
  bush: box(28, 24, 14, 24, 1, 0, 26, 24, 'plant'),
  tree: box(12, 40, 6, 40, 1, 0, 10, 40, 'trunk'),
  canopy: box(80, 80, 40, 112, 0, 0, 80, 80, 'plant'),
  torch: box(10, 22, 5, 22, 2, 0, 6, 22, 'light'),
  lamppost: box(10, 56, 5, 56, 2, 0, 6, 56, 'light'),
  hatch: box(28, 20, 14, 24, 0, 4, 28, 16, 'wood'),
  well: box(30, 32, 15, 32, 0, 0, 30, 32, 'stone'),
  board: box(28, 36, 14, 36, 0, 0, 28, 36, 'wood'),
  bench: box(30, 16, 15, 20, 0, 4, 30, 12, 'wood'),
  anvil: box(24, 18, 12, 18, 0, 2, 24, 16, 'stone'),
  decal: box(60, 28, 30, 30, 0, 0, 60, 28, 'cloth'),
  roof: box(32, 32, 0, 0, 0, 0, 32, 32, 'roof'),
  wang: box(32, 32, 0, 0, 0, 0, 32, 32, 'floor-stone'),
});

/** The art-budget class of a sprite id (the id prefixes are documented in atlas-sets.js). */
export function classOf(id, hint) {
  if (hint && CLASS[hint]) return hint;
  if (id === 'hero') return 'hero';
  if (id.endsWith(':canopy')) return 'canopy';
  if (PROPS[id] && CLASS[PROPS[id].class]) return PROPS[id].class;
  const head = id.split(':')[0];
  return CLASS[head] ? head : 'small';
}

/** The tone (a --world-stub-<tone> token suffix) a stub of this id is painted in. */
function toneOf(id, cls) {
  const parts = id.split(':');
  if (cls === 'wall' || cls === 'door') return cls + '-' + (parts[1] || 'stone');
  if (cls === 'roof') return 'roof-' + (parts[1] || 'thatch');
  if (cls === 'wang') return (TERRAIN[parts[1]] || {}).stub || 'stone';
  return CLASS[cls].tone;
}

/** Pure: the stub frame for a sprite id — { cls, w, h, ax, ay, box, tone }. */
export function stubGeometry(id, hint) {
  const cls = classOf(id, hint);
  const c = CLASS[cls];
  return { cls, w: c.w, h: c.h, ax: c.ax, ay: c.ay, box: c.box, tone: toneOf(id, cls) };
}

/**
 * Paint a stub frame at (0, 0) of `ctx`. `toneOf(name)` resolves a token suffix to a colour.
 * A Wang stub fills the quadrants whose corner bit is set (NW 8, NE 4, SW 2, SE 1).
 */
export function paintStub(ctx, id, geo, colour) {
  const fill = colour('stub-' + geo.tone);
  if (geo.cls === 'wang') {
    const idx = Number(id.split(':')[2]) || 0, q = geo.w / 2;
    ctx.fillStyle = fill;
    [[8, 0, 0], [4, q, 0], [2, 0, q], [1, q, q]].forEach(([bit, x, y]) => { if (idx & bit) ctx.fillRect(x, y, q, q); });
    return;
  }
  const [bx, by, bw, bh] = geo.box;
  ctx.fillStyle = fill;
  ctx.fillRect(bx, by, bw, bh);
  if (geo.cls === 'roof') return;
  ctx.fillStyle = colour('stub-line');
  ctx.fillRect(bx, by, bw, 1); ctx.fillRect(bx, by + bh - 1, bw, 1);
  ctx.fillRect(bx, by, 1, bh); ctx.fillRect(bx + bw - 1, by, 1, bh);
  if (geo.cls === 'hero') { ctx.fillStyle = colour('stub-hero-face'); ctx.fillRect(bx + 4, by + 3, bw - 8, 10); }
}
