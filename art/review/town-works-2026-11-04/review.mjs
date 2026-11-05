#!/usr/bin/env node
// art/review/town-works-2026-11-04/review.mjs — the Weighhouse's review pictures, read from the BUILT atlases (locked pixels).
// NOT a test, NOT game code; it draws no shadows or lighting, so the build half's visual gate still has to look in the game.
//   node art/review/town-works-2026-11-04/review.mjs
// strip.png     x2, game scale: the finished Weighhouse between two live Havora lots, the four earlier stages under it, a hero for size.
// in-place.png  x1: all five stages on the real town map at plan (94, 55) (the real ground, the real neighbours, the oak at (98, 58)
//               out, as the build half will do), three heroes on the rows round it: (92, 54) and (97, 54) behind it, (97, 61) in front.
// in-place-finished.png  the same scene at x2 for the finished stage.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, createImage, blit, scaleNearest, crop } from '../../../tools/world-art/png.mjs';
import { ATLAS_SETS } from '../../../src/data/world/atlas-sets.js';
import { MATERIALS, OPEN_CLASSES, LIGHTS } from '../../../src/data/world/terrain.js';
import town from '../../../src/data/world/maps/town_common.js';
import { compileMap } from '../../../src/world/core/map-compile.js';
import { groundTiles } from '../../../src/world/core/compose.js';
import { createBook } from '../../../src/world/core/book.js';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..', '..');
const manifests = {}, images = {};
for (const set of ATLAS_SETS) {
  manifests[set] = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  images[set] = decodePNG(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.png')));
}
const book = createBook(manifests);
const tables = { materials: MATERIALS, sprites: book.sprites, openClasses: OPEN_CLASSES, lights: LIGHTS };
const frameOf = (id) => { const f = book.frame(id, 'idle', 's', 0); if (!f) throw new Error('no sprite ' + id); return f; };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const tone = (m, alt) => { const r = css.match(new RegExp('--world-ground-' + m + (alt ? '-b' : '-a') + ':\\s*(#[0-9a-fA-F]{6})')); return r ? hex(r[1]) : [64, 64, 64]; };

const STAGES = ['staked', 'footings', 'framed', 'walled', 'finished'].map((s) => 'havora_weighhouse_' + s);

/* ── the town map as a picture, one stage placed ─────────────────────────────────────────────────── */
const map = compileMap(town, tables), T = map.T;
const planDX = map.objects.find((o) => o.id === 'havora_home_p10').x - 88, planDY = map.objects.find((o) => o.id === 'havora_home_p10').y - 62;
const ground = createImage(map.w * T, map.h * T);
const g0 = groundTiles(map, book, tables, T);
for (const t of g0.tones) { const c = tone(t.m, t.alt); for (let y = t.y; y < t.y + T; y++) for (let x = t.x; x < t.x + T; x++) ground.data.set([c[0], c[1], c[2], 255], (y * ground.width + x) * 4); }
for (const t of g0.tiles) blit(ground, images[t.set], t.sx, t.sy, T, T, t.x, t.y, true);

function scene(stage, box) {
  const [bx, by, bw, bh] = box.map((v) => v * T);
  const out = crop(ground, bx, by, bw, bh);
  const lot = { id: stage, x: 94 + planDX, y: 55 + planDY, fw: 8, fh: 6 };
  const objs = map.objects.filter((o) => !(o.id === 'oak' && o.x === 98 + planDX && o.y === 58 + planDY)).concat([lot,
    { id: 'havora_weighhouse_plaque', x: 103 + planDX, y: 53 + planDY, fw: 1, fh: 1 },
    { id: 'outfit_knight', x: 92 + planDX, y: 54 + planDY, fw: 1, fh: 1 }, { id: 'outfit_knight', x: 97 + planDX, y: 54 + planDY, fw: 1, fh: 1 },
    { id: 'outfit_knight', x: 97 + planDX, y: 61 + planDY, fw: 1, fh: 1 }]);
  objs.sort((a, b) => (a.y + a.fh) - (b.y + b.fh));
  for (const o of objs) {
    const f = book.frame(o.id, 'idle', 's', 0); if (!f || !images[f.set]) continue;
    blit(out, images[f.set], f.sx, f.sy, f.w, f.h, o.x * T + Math.floor(o.fw * T / 2) - f.ax - bx, o.y * T + o.fh * T - 1 - f.ay - by, true);
  }
  return out;
}
/* plan x 84-112, y 46-73: the bridge's east end to the north, the river west, P10 south */
const BOX = [84 + planDX, 46 + planDY, 28, 27];
const pics = STAGES.map((s) => scene(s, BOX));
const GAP = 8, mont = createImage(pics[0].width * 3 + GAP * 2, pics[0].height * 2 + GAP);
pics.forEach((p, i) => blit(mont, p, 0, 0, p.width, p.height, (i % 3) * (p.width + GAP), Math.floor(i / 3) * (p.height + GAP)));
writeFileSync(join(HERE, 'in-place.png'), encodePNG(mont));
writeFileSync(join(HERE, 'in-place-finished.png'), encodePNG(scaleNearest(scene(STAGES[4], [86 + planDX, 49 + planDY, 24, 16]), 2)));

/* ── the strip ──────────────────────────────────────────────────────────────────────────────────── */
const row1 = ['havora_home_p10', STAGES[4], 'havora_harbor_office', 'outfit_knight'], row2 = STAGES.slice(0, 4).concat(['havora_weighhouse_plaque', 'outfit_knight']);
const widthOf = (r) => r.reduce((n, id) => n + frameOf(id).w + 12, 12);
const heightOf = (r) => Math.max(...r.map((id) => frameOf(id).h)) + 24;
const W = Math.max(widthOf(row1), widthOf(row2)), H = heightOf(row1) + heightOf(row2);
const strip = createImage(W, H);
const grassTile = g0.tiles.find((t) => { const [x, y] = [t.x / T, t.y / T]; return x === 104 + planDX && y === 52 + planDY; }) || null;
const a = tone('grass', false), b = tone('grass', true);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = (((x >> 5) + (y >> 5)) & 1) ? a : b; strip.data.set([c[0], c[1], c[2], 255], (y * W + x) * 4); }
if (grassTile) for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) blit(strip, images[grassTile.set], grassTile.sx, grassTile.sy, T, T, x, y, true);
const lay = (r, baseY) => { let x = 12; for (const id of r) { const f = frameOf(id); blit(strip, images[f.set], f.sx, f.sy, f.w, f.h, x, baseY - f.h, true); x += f.w + 12; } };
lay(row1, heightOf(row1) - 12); lay(row2, H - 12);
writeFileSync(join(HERE, 'strip.png'), encodePNG(scaleNearest(strip, 2)));
console.log('wrote strip.png (' + W * 2 + 'x' + H * 2 + '), in-place.png, in-place-finished.png; plan offset ' + planDX + ',' + planDY);
