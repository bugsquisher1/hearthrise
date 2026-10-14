// tools/world-art/pack.mjs — deterministic shelf packing of frames into one atlas.
//
// Identical frames (a held pose, a mirrored twin that came out the same) share one
// rect. Order is fixed (height, width, then key), the width is the smallest power of
// two from 256 whose packing is no taller than it is wide, and every rect keeps a
// 1 px transparent gutter, so a rebuild of the same frames is the same atlas.
import { createImage, blit, pixelHash } from './png.mjs';
import { ATLAS_MAX } from '../../src/data/world/art-budget.js';

const GUTTER = 1;

function shelves(items, W) {
  let x = 0, y = 0, rowH = 0;
  const at = new Map();
  for (const it of items) {
    const w = it.img.width + GUTTER, h = it.img.height + GUTTER;
    if (x + w > W) { x = 0; y += rowH; rowH = 0; }
    at.set(it.hash, [x, y]);
    x += w; rowH = Math.max(rowH, h);
  }
  return { at, height: y + rowH };
}

/** frames: [{ key, img }] → { width, height, rects: Map(key → [x, y]), image } */
export function pack(frames) {
  const byHash = new Map();
  const keyHash = new Map();
  for (const f of frames) {
    const hash = pixelHash(f.img);
    keyHash.set(f.key, hash);
    if (!byHash.has(hash)) byHash.set(hash, { hash, img: f.img, key: f.key });
  }
  const items = [...byHash.values()].sort((a, b) =>
    b.img.height - a.img.height || b.img.width - a.img.width || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  let W = 0, laid = null;
  for (let w = 256; w <= ATLAS_MAX * 2; w *= 2) {
    if (items.some((it) => it.img.width + GUTTER > w)) continue;
    W = w; laid = shelves(items, w);
    if (laid.height <= w) break;
  }
  if (!laid) throw new Error(`a frame is wider than ${ATLAS_MAX * 2}px`);
  const height = Math.ceil(laid.height / 4) * 4;
  const image = createImage(W, height);
  for (const it of items) { const [x, y] = laid.at.get(it.hash); blit(image, it.img, 0, 0, it.img.width, it.img.height, x, y); }
  const rects = new Map();
  for (const [key, hash] of keyHash) rects.set(key, laid.at.get(hash));
  return { width: W, height, rects, image };
}
