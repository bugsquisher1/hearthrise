#!/usr/bin/env node
// tools/world-art/harbour-art.mjs — HAVORA'S HARBOUR GROUND AND PIERS, drawn by hand-written rules (lane/a-havora-dock
// round 3, 2026-10-27). Deterministic: the same inputs give the same pixels, every run.
//
//   node tools/world-art/harbour-art.mjs        rewrite the art/world/havora sources below, then run build.mjs --set havora
//
// Inputs: the PixelLab originals kept in art/world-src/havora-harbour/ (their quay wall, sill and earth are kept).
// Outputs (art/world/havora):
//   havora_earth_setts   earth/setts wang16 DRAWN HERE: granite setts laid in courses of mixed stones (stone, shadow, moss
//                        ramps), the edge an irregular border where whole stones thin out into the earth, loose broken
//                        setts past it; four interior variants (picked per cell by the renderer's hash)
//   havora_water_setts   PixelLab's quay wall, its paving swapped for the same setts, the water darkened under the wall
//   havora_setts_planks  PixelLab's sill, its paving swapped for the same setts
//   havora_water_quay    PixelLab's earth quay wall, the water darkened under the wall
//   havora_pier_root / _mid0.._mid2 / _end   a pier 3 tiles wide seen from above, boards running ALONG it, a dark edge
//                        beam each side, round pilings standing out of the water at its sides and end (span decals laid
//                        on the planks by town/piers.js)
// THE STONES never cross a tile's top or bottom (four courses a tile); in every course one stone straddles the tile's
// west/east seam and is the SAME stone in every tile and variant, so any two tiles meet without a joint line at the seam.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, createImage, blit } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'art/world-src/havora-harbour'), OUT = join(ROOT, 'art/world/havora');
const T = 32;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const STONE = ['#3a3a3e', '#4f4e52', '#6a6865', '#8a867d', '#aaa49a'].map(hex);
const SHADOW = ['#0b0a0c', '#17141a', '#231d1f', '#2f2723'].map(hex);
const MOSS = ['#4a5a2a', '#6b7a38'].map(hex);
const EARTH = ['#2a1c14', '#3d2a1d', '#553a26', '#6e4c30', '#8a6440', '#a88457', '#c49a5c'].map(hex);
const WATER = ['#1a2c44', '#2b4a6a'].map(hex);

/** A small deterministic hash → [0, 1). */
const h01 = (...n) => { let x = 0x9e3779b9; for (const v of n) { x ^= (v | 0) + 0x7f4a7c15 + (x << 6) + (x >>> 2); x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0; } return (x >>> 0) / 4294967296; };

/* THE COURSES: [top row, height]; the stone straddling the seam: [px left of the seam, px right of it] */
const COURSES = [[0, 7], [7, 9], [16, 8], [24, 8]];
const SEAM = [[4, 5], [7, 2], [2, 6], [5, 4]];

/** The stones of one tile: [{x0, x1, y0, y1, seam, tone, id}] (x1/y1 exclusive; a seam stone's x0 may be < 0). */
function stones(variant) {
  const out = [];
  COURSES.forEach(([y0, hgt], c) => {
    const [a, b] = SEAM[c], [na] = SEAM[c];
    out.push({ x0: -a, x1: b, y0, y1: y0 + hgt, seam: true, c, id: 'S' + c });
    /* the interior from b to T - na, cut into 2-3 stones, different per variant */
    let x = b;
    const end = T - na;
    let k = 0;
    while (x < end) {
      const left = end - x;
      let w = left <= 11 ? left : Math.round(5 + h01(variant, c, k, 7) * 6);
      if (left - w > 0 && left - w < 5) w = left;
      out.push({ x0: x, x1: x + w, y0, y1: y0 + hgt, seam: false, c, id: variant + ':' + c + ':' + k });
      x += w; k++;
    }
  });
  for (const s of out) { const r = h01(s.c, s.x0 + 40, s.x1, s.seam ? 3 : variant + 5); s.tone = r < 0.15 ? 1 : r < 0.78 ? 2 : 3; }   // mostly the mid stone, a few dark and light
  return out;
}

/** Draw one stone into img at tile origin (ox, oy): joint above and left, pillow shading, wear, moss in the joint. */
function drawStone(img, ox, oy, s, variant, opts = {}) {
  const put = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= T || y >= T) return;
    if (opts.mask && !opts.mask(x, y)) return;
    const i = ((oy + y) * img.width + ox + x) * 4;
    img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
  };
  const shrink = opts.broken ? 1 : 0;
  const x0 = s.x0 + shrink, x1 = s.x1 - shrink, y0 = s.y0 + shrink, y1 = s.y1 - shrink;
  const tone = s.tone;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const joint = !shrink && (y === y0 || x === x0);
    if (joint) {
      /* the joint: dark, now and then moss (more in the worn variants) */
      const m = h01(x + 64, y, 11, variant) < (variant >= 2 ? 0.12 : 0.04);
      put(x, y, m ? MOSS[0] : SHADOW[3]);
      continue;
    }
    let t = tone;
    if (y === y0 + (shrink ? 0 : 1)) t = Math.min(4, tone + 1);   // lit top edge (light from the north)
    if (y === y1 - 1) t = Math.max(0, tone - 1);                                                     // shaded lower edge
    const w = h01(x + 32, y + 32, variant, s.c);
    if (w < 0.05) t = Math.max(0, t - 1); else if (w > 0.97) t = Math.min(4, t + 1);                     // wear
    put(x, y, STONE[t]);
  }
  if (opts.broken || opts.kerb) {
    /* a stone lying in the earth casts a shadow on its south and east */
    for (let x = x0 + 1; x <= x1; x++) if (opts.earthAt(x, y1)) put(x, y1, SHADOW[3]);
    for (let y = y0 + 1; y < y1; y++) if (opts.earthAt(x1, y)) put(x1, y, SHADOW[3]);
  }
}

/** One full setts tile (variant 0..3). */
function settsTile(variant) {
  const img = createImage(T, T);
  for (const s of stones(variant)) {
    drawStone(img, 0, 0, s, variant);
    if (s.seam) drawStone(img, 0, 0, Object.assign({}, s, { x0: s.x0 + T, x1: s.x1 + T }), variant);   // its other half at the east edge
  }
  return img;
}

/* ── the earth/setts wang16 ── */
const KEYS = Array.from({ length: 16 }, (_, i) => i.toString(2).padStart(4, '0'));
/** How much a point of a tile is setts (corners NW NE SW SE = key), with a wobble that is 0 on the tile's edges. */
function cover(key, x, y, variant = 0) {
  const [nw, ne, sw, se] = [...key].map(Number), u = x / T, v = y / T;
  const b = nw * (1 - u) * (1 - v) + ne * u * (1 - v) + sw * (1 - u) * v + se * u * v;
  const edge = Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * Math.sin(Math.PI * Math.min(1, Math.max(0, v)));
  return b + (h01(Math.round(x), Math.round(y), key.length, variant) - 0.5) * 0.6 * edge;
}
function earthSettsTile(key, earth, variant) {
  const img = createImage(T, T);
  blit(img, earth, 0, 0, T, T, 0, 0);
  const st = stones(variant);
  const keep = new Map(), lie = new Map();
  for (const s of st) {
    /* a seam stone is judged on the seam itself (both tiles that share it agree) */
    const cx = s.seam ? 0 : (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
    const c = s.seam ? cover(key, 0, cy) : cover(key, cx, cy, variant);
    const cE = s.seam ? cover(key, T, cy) : c;
    keep.set(s, [c, cE]);
  }
  const placed = [];
  for (const s of st) {
    const [c, cE] = keep.get(s);
    const parts = s.seam ? [[c, s], [cE, Object.assign({}, s, { x0: s.x0 + T, x1: s.x1 + T })]] : [[c, s]];
    for (const [v, p] of parts) {
      if (v >= 0.5) placed.push([p, false]);
      else if (v >= 0.36 && h01(p.x0 + 90, p.y0, key.charCodeAt(0) + key.charCodeAt(3), p.seam ? 0 : variant) < 0.3) placed.push([p, true]);   // a loose broken sett
    }
  }
  const solid = new Set();
  for (const [p, broken] of placed) if (!broken) for (let y = p.y0; y < p.y1; y++) for (let x = p.x0; x < p.x1; x++) solid.add(x + ',' + y);
  const earthAt = (x, y) => !solid.has(x + ',' + y);
  for (const [p, broken] of placed) {
    const kerb = !broken && [...'x'].some(() => earthAt(p.x1, p.y0 + 1) || earthAt(p.x0 + 1, p.y1));
    drawStone(img, 0, 0, p, variant, { broken, kerb, earthAt });
  }
  return img;
}

/* ── sheets ── */
const sidecar = (id) => JSON.parse(readFileSync(join(SRC, id + '.json'), 'utf8'));
const src = (id) => decodePNG(readFileSync(join(SRC, id + '.png')));
const tileOf = (img, [c, r]) => { const t = createImage(T, T); blit(t, img, c * T, r * T, T, T, 0, 0); return t; };
const same = (a, b, x, y) => { const i = (y * T + x) * 4; return a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2]; };
const VARIANTS = [0, 1, 2, 3].map(settsTile);

function writeSheet(id, tiles, settsKey, note, base) {
  /* tiles: { key: image } in KEYS order on a 4 x 4 grid; the setts key's extra variants on a fifth row */
  const list = Object.fromEntries(KEYS.map((k) => [k, [].concat(tiles[k], k === settsKey ? VARIANTS.slice(1) : [])]));
  const cells = KEYS.flatMap((k) => list[k].map((img) => [k, img]));
  const sheet = createImage(4 * T, Math.ceil(cells.length / 4) * T);
  const map = {};
  cells.forEach(([k, img], i) => { blit(sheet, img, 0, 0, T, T, (i % 4) * T, Math.floor(i / 4) * T); (map[k] = map[k] || []).push([i % 4, Math.floor(i / 4)]); });
  writeFileSync(join(OUT, id + '.png'), encodePNG(sheet));
  const sc = Object.assign({}, base, { tiles: map, source: id + '.png', notes: note });
  sc.pixellab = Object.assign({}, base.pixellab, { derived: 'tools/world-art/harbour-art.mjs (lane/a-havora-dock round 3)' });
  writeFileSync(join(OUT, id + '.json'), JSON.stringify(sc, null, 2) + '\n');
}

/** Darken water just south of a wall: water pixels within 3 px below a non-water pixel (2 px full, the 3rd dithered). */
function shadeUnderWall(img, isWater) {
  const out = createImage(T, T); blit(out, img, 0, 0, T, T, 0, 0);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (!isWater(x, y)) continue;
    let d = 0;
    for (let k = 1; k <= 3; k++) if (y - k >= 0 && !isWater(x, y - k)) { d = k; break; }
    if (!d || (d === 3 && (x + y) % 2)) continue;
    const i = (y * T + x) * 4;
    const rgb = d === 1 ? SHADOW[1] : WATER[0];
    out.data[i] = rgb[0]; out.data[i + 1] = rgb[1]; out.data[i + 2] = rgb[2];
  }
  return out;
}

/* earth/setts: drawn here, the earth from PixelLab's earth tile */
{
  const sc = sidecar('havora_earth_setts'), img = src('havora_earth_setts');
  const earth = tileOf(img, sc.tiles['0000'][0]);
  /* every edge key in three variants (the renderer picks one per cell by its hash), so no edge repeats in step */
  const tiles = Object.fromEntries(KEYS.map((k) => [k, k === '1111' ? VARIANTS[0] : k === '0000' ? earth : [0, 1, 2].map((v) => earthSettsTile(k, earth, v))]));
  writeSheet('havora_earth_setts', tiles, '1111', 'Packed earth against the harbour\'s granite setts: setts laid in courses of mixed stones, the edge whole stones thinning into the earth with loose broken setts past them, three variants of every edge and four of the interior (drawn by tools/world-art/harbour-art.mjs from the stone, shadow and moss ramps; the earth is PixelLab\'s, lane/a-havora-dock round 3).', sc);
}
/* water/setts and setts/planks: PixelLab's wall and sill, the paving swapped */
for (const [id, settsKey, waterKey, note] of [
  ['havora_water_setts', '1111', '0000', 'The harbour quay: PixelLab\'s dressed stone quay wall (capstones, mooring rings), its paving swapped for the hand-laid setts and the water darkened under the wall (tools/world-art/harbour-art.mjs, lane/a-havora-dock round 3).'],
  ['havora_setts_planks', '0000', null, 'A pier\'s root on the quay: PixelLab\'s timber sill, its paving swapped for the hand-laid setts (tools/world-art/harbour-art.mjs, lane/a-havora-dock round 3).'],
]) {
  const sc = sidecar(id), img = src(id);
  const baseS = tileOf(img, sc.tiles[settsKey][0]), baseW = waterKey ? tileOf(img, sc.tiles[waterKey][0]) : null;
  const tiles = {};
  for (const k of KEYS) {
    let t = tileOf(img, sc.tiles[k][0]);
    const o = createImage(T, T); blit(o, t, 0, 0, T, T, 0, 0);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (same(t, baseS, x, y)) {
      const i = (y * T + x) * 4; o.data[i] = VARIANTS[0].data[i]; o.data[i + 1] = VARIANTS[0].data[i + 1]; o.data[i + 2] = VARIANTS[0].data[i + 2]; o.data[i + 3] = 255;
    }
    if (baseW) o.data.set(shadeUnderWall(o, (x, y) => same(t, baseW, x, y)).data);
    tiles[k] = o;
  }
  writeSheet(id, tiles, settsKey, note, sc);
}
/* water/earth quay: the water darkened under the wall */
{
  const id = 'havora_water_quay', sc = sidecar(id), img = src(id), baseW = tileOf(img, sc.tiles['0000'][0]);
  const tiles = Object.fromEntries(KEYS.map((k) => { const t = tileOf(img, sc.tiles[k][0]); return [k, shadeUnderWall(t, (x, y) => same(t, baseW, x, y))]; }));
  writeSheet(id, tiles, null, sc.notes.replace(/ \(lane\/a-havora-dock 2026-10-26.*$/, '') + ' The water is darkened under the wall (tools/world-art/harbour-art.mjs, lane/a-havora-dock round 3).', sc);
}

/* ── the piers: 3 tiles wide, slices 32 tall, 8 px of pilings standing out on each side ── */
const PW = 3 * T, OV = 10, FW = PW + 2 * OV;
const BEAM = [EARTH[1], EARTH[2]];
const PLANK_SC = sidecar('havora_water_planks'), PLANK_SRC = src('havora_water_planks');
const PLANK_TILE = { x: PLANK_SC.tiles['1111'][0][0] * T, y: PLANK_SC.tiles['1111'][0][1] * T };
function pierSlice(kind, variant) {
  const H = kind === 'root' ? T + 6 : T, top = H - T;   // the root reaches 6 px up over the quay's cap
  const img = createImage(FW, H);
  const put = (x, y, rgb) => { if (x < 0 || y < 0 || x >= FW || y >= H) return; const i = (y * FW + x) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255; };
  /* boards: PixelLab's own dock planks (havora_water_planks, the full-plank tile), turned a quarter so they run ALONG the
     pier; each 8 px band slid by its own amount per slice variant, so the butt joints never line up and no two slices match */
  const x0 = OV + 5, x1 = OV + PW - 5;
  for (let x = x0; x < x1; x++) {
    const band = Math.floor((x - x0) / 8), slide = Math.floor(h01(band, variant, 9) * T);
    for (let y = top; y < H; y++) {
      const sy = (x - x0) % T, sx = (y - top + slide) % T;
      const i = ((PLANK_TILE.y + sy) * PLANK_SRC.width + PLANK_TILE.x + sx) * 4;
      put(x, y, [PLANK_SRC.data[i], PLANK_SRC.data[i + 1], PLANK_SRC.data[i + 2]]);
    }
  }
  /* the edge beams: 5 px each side, lit on top */
  for (const bx of [OV, OV + PW - 5]) for (let x = bx; x < bx + 5; x++) for (let y = top; y < H; y++) put(x, y, x === bx ? BEAM[1] : x === bx + 4 ? SHADOW[3] : BEAM[0]);
  if (kind === 'root') {
    /* the sill: a cross beam on the quay's cap */
    for (let y = 0; y < 6; y++) for (let x = OV; x < OV + PW; x++) put(x, y, y === 0 ? BEAM[1] : y === 5 ? SHADOW[3] : BEAM[0]);
  }
  if (kind === 'end') {
    /* the end beam across the pier's head */
    for (let y = T - 5; y < T; y++) for (let x = OV; x < OV + PW; x++) put(x, y, y === T - 5 ? BEAM[1] : y === T - 1 ? SHADOW[3] : BEAM[0]);
  }
  /* pilings: a round post standing out of the water on each side (every slice but the root), two more at the end */
  const piling = (cx, cy) => {
    for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
      const d = Math.hypot(x, y);
      if (d > 7.2) continue;
      if (d > 6.0) { if (y > 0) put(cx + x, cy + y, WATER[1]); continue; }               // the water-line ring, on its lit lower rim
      put(cx + x, cy + y, d > 5 ? SHADOW[2] : d < 2.5 ? EARTH[2] : (x + y < -2 ? EARTH[4] : EARTH[2]));   // the post's cut top: a lit rim, a darker heart
    }
  };
  if (kind !== 'root') { piling(OV - 1, top + 10 + (variant % 2) * 8); piling(OV + PW, top + 10 + ((variant + 1) % 2) * 8); }
  if (kind === 'end') { piling(OV + 20, T - 2); piling(OV + PW - 21, T - 2); }
  return img;
}
const PIERS = [['havora_pier_root', 'root', 0], ['havora_pier_mid0', 'mid', 0], ['havora_pier_mid1', 'mid', 1], ['havora_pier_mid2', 'mid', 2], ['havora_pier_end', 'end', 3]];
for (const [id, kind, v] of PIERS) {
  const img = pierSlice(kind, v);
  writeFileSync(join(OUT, id + '.png'), encodePNG(img));
  writeFileSync(join(OUT, id + '.json'), JSON.stringify({
    id, class: 'span', style: 's1', material: 'wood', source: id + '.png', frame: [img.width, img.height], anchor_px: [img.width / 2, img.height - 1],
    footprint: [3, 1], anims: [{ name: 'idle', fps: 0, loop: false, dirs: { s: 1 } }],
    pixellab: { tileset: PLANK_SC.pixellab.id, derived: 'tools/world-art/harbour-art.mjs: the boards are the PixelLab dock tileset planks turned along the pier; the edge beams, sill and pilings are drawn on its earth and shadow ramps' },
    notes: 'A ' + kind + ' slice of a Havora pier (3 tiles wide): PixelLab dock boards turned to run along it, a dark edge beam each side, round pilings standing out of the water' + (kind === 'root' ? '; its sill reaches up over the quay\'s cap' : kind === 'end' ? '; the end beam and two more pilings at its head' : '') + '. Drawn by tools/world-art/harbour-art.mjs (lane/a-havora-dock round 3), laid by src/data/world/town/piers.js.',
  }, null, 2) + '\n');
}
console.log('harbour-art: earth/setts drawn, water/setts + setts/planks paving swapped, quay water shaded, 5 pier slices');
