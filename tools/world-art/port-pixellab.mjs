#!/usr/bin/env node
// tools/world-art/port-pixellab.mjs — PixelLab style-1 art → world-art sources (art/world/<set>/).
//
//   node tools/world-art/port-pixellab.mjs map --set S --id ID --map MAP_ID --size W,H
//        --crop X,Y,FILE [--crop …] [--patch PX,PY,FILE,JOB …] [--material terrain] [--note "…"]
//     Stitch full-scale `view_map` renders of a PixelLab map (each FILE rendered from cell X,Y)
//     into ONE painted ground: map cell (0,0) .. (W-1,H-1) at 32 px a cell. The sidecar is a
//     `fill` terrain whose cycle is the map itself (W x H variants, cell (x,y) = variant
//     y*W + x) marked `painted`: the renderer draws it under EVERY cell, rock and water
//     included, and draws no wall kit over it (the walls are in the paint).
//
//   node tools/world-art/port-pixellab.mjs object --set S --id ID --class C --file F --object OBJ_ID
//        [--material M] [--name "S1 …"] [--hover N] [--footprint W,H]
//     One single-direction Map Workshop object (its `rotations/unknown.png`) as a still sprite.
//     PixelLab draws an object with its image's bottom-centre on the bottom-centre of the cell
//     it stands on (measured on map c8ed5928: 22 placements, zero error). The port keeps exactly
//     that: the frame is the image with empty rows below the art cut, the anchor is the
//     bottom-centre, footprint 1x1 — so a placement at the same cell lands on the same pixels.
//
// The pixels are never scaled or redrawn (ART_DIRECTION §2); build.mjs locks them to the
// palette and checks them against the budget like every other source.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit } from './png.mjs';
import { T, CLASSES, FACINGS } from '../../src/data/world/art-budget.js';
import { ROOT, ART_DIR } from './build.mjs';
import { isMain } from '../../tests/_is-main.mjs';

/** Every --key value (repeatable keys collect into arrays). */
function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    /* --key value, or --key=value (a value that starts with '-', like a negative cell) */
    const eq = a.indexOf('=');
    const k = eq > 0 ? a.slice(2, eq) : a.slice(2), v = eq > 0 ? a.slice(eq + 1) : argv[++i];
    if (k === 'crop' || k === 'patch') (o[k] = o[k] || []).push(v); else o[k] = v;
  }
  return o;
}
const pair = (s) => s.split(',').map(Number);

/** Stitch crops [{x, y, img}] (x, y: the map cell each render starts at) into the W x H map from cell (0,0). */
function stitch(crops, w, h) {
  const out = createImage(w * T, h * T);
  for (const c of crops) blit(out, c.img, 0, 0, c.img.width, c.img.height, c.x * T, c.y * T);
  let holes = 0;
  for (let i = 3; i < out.data.length; i += 4) if (out.data[i] !== 255) holes++;
  return { img: out, holes };
}

function paintedSidecar({ id, mapId, w, h, material, note, crops }) {
  const cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push([x, y]);
  return {
    id, class: 'terrain', kind: 'fill', painted: true, style: 's1', material, source: id + '.png',
    lower: 'painted', upper: 'painted', cycle: [w, h], tiles: { 1111: cells },
    pixellab: { tool: 'view_map', map: mapId, crops: crops.map((c) => [c.x, c.y]) },
    notes: note || 'Stitched from full-scale view_map renders of PixelLab map ' + mapId + ' by tools/world-art/port-pixellab.mjs.',
  };
}

/**
 * The frame and anchor of a Map Workshop object. A thing that STANDS has the empty rows below
 * its art cut and its anchor on its lowest row, so it rests on the floor (it moves down by the
 * cut rows, at most a few px). Flat and hung art (`keep`) keeps the whole image with the anchor
 * on its bottom row: it lands on exactly the pixels PixelLab drew it on.
 */
function objectFrame(img, keep) {
  let low = -1;
  for (let y = img.height - 1; y >= 0 && low < 0; y--) for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3] >= 128) { low = y; break; }
  if (low < 0) return null;
  const h = keep ? img.height : low + 1;
  const out = createImage(img.width, h);
  blit(out, img, 0, 0, img.width, h, 0, 0);
  return { img: out, anchor: [Math.floor(img.width / 2), h - 1], frame: [img.width, h] };
}

/**
 * The sheet's opaque pixels (alpha >= 128) as 8-connected blobs: [{ px: [i…], x0, y0, x1, y1, cx, cy }].
 * A generated sheet does not keep its items inside their cells, so an item is the set of blobs
 * whose centre (weighted by pixels) falls in its cell, never a rectangle cut from the grid.
 */
function blobs(sheet) {
  const W = sheet.width, H = sheet.height, seen = new Uint8Array(W * H), out = [];
  const on = (i) => sheet.data[i * 4 + 3] >= 128;
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !on(s)) continue;
    const px = [], stack = [s];
    seen[s] = 1;
    let x0 = W, y0 = H, x1 = -1, y1 = -1, sx = 0, sy = 0;
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i - x) / W;
      px.push(i); sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && !seen[j] && on(j)) { seen[j] = 1; stack.push(j); }
      }
    }
    out.push({ px, x0, y0, x1, y1, cx: sx / px.length, cy: sy / px.length });
  }
  return out;
}

/** One sheet cell's item: its blobs cut to their joint box, the width padded to even so the anchor centres; null when empty. */
function cellArt(sheet, cx, cy, cell, all = blobs(sheet)) {
  const mine = all.filter((b) => b.cx >= cx && b.cx < cx + cell && b.cy >= cy && b.cy < cy + cell);
  if (!mine.length) return null;
  const x0 = Math.min(...mine.map((b) => b.x0)), y0 = Math.min(...mine.map((b) => b.y0));
  const x1 = Math.max(...mine.map((b) => b.x1)), y1 = Math.max(...mine.map((b) => b.y1));
  const w = x1 - x0 + 1 + ((x1 - x0 + 1) % 2), h = y1 - y0 + 1;
  const out = createImage(w, h);
  for (const b of mine) for (const i of b.px) {
    const x = i % sheet.width, y = (i - x) / sheet.width;
    out.data.set(sheet.data.subarray(i * 4, i * 4 + 4), ((y - y0) * w + (x - x0)) * 4);
  }
  return out;
}

/* ── wang: a Wang-16 pair recovered from painted grounds ─────────────────────────────────────────
   A PixelLab Map Workshop ground is drawn on a DUAL grid: its tileset's tiles sit half a cell off the
   map cells, their corners on the cell centres. Cut at (16 + 32k, 16 + 32k), a painted ground is
   exactly the tileset's own tiles (common_ground: 21 distinct tiles in 299 cuts). The grounds of the
   Common family share their base tiles pixel for pixel (grass in common, meadowbrook, cottage and
   mosslight; the dirt in common and square_dirt_flag), so every pair those grounds painted can be
   recovered as a wang16 terrain without a new generation. */
const CORNER = 6;
/** The mean colour of a w x h block. */
function meanOf(img, x0, y0, w, h) {
  const m = [0, 0, 0];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const p = (y * img.width + x) * 4; m[0] += img.data[p]; m[1] += img.data[p + 1]; m[2] += img.data[p + 2]; }
  return m.map((v) => v / (w * h));
}
const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
/** The four corner materials (NW NE SW SE) of the tile at (x, y): each corner block's nearest reference fill. */
function cornersOf(img, x, y, refs) {
  const at = (cx, cy) => { const m = meanOf(img, cx, cy, CORNER, CORNER); return refs.reduce((b, r) => (dist(m, r.mean) < dist(m, b.mean) ? r : b)).mat; };
  return [at(x, y), at(x + T - CORNER, y), at(x, y + T - CORNER), at(x + T - CORNER, y + T - CORNER)];
}
const tileHash = (img, x, y) => { let s = ''; for (let r = 0; r < T; r++) s += Buffer.from(img.data.subarray(((y + r) * img.width + x) * 4, ((y + r) * img.width + x + T) * 4)).toString('base64'); return s; };
/**
 * A diagonal key no ground painted (two roads touching corner to corner): each quadrant from a tile
 * whose three corners nearest it match (the quadrant's own corner and its two edge neighbours).
 */
function composeKey(key, byKey) {
  const out = createImage(T, T), H = T / 2;
  const quads = [[0, 1, 2, 0, 0], [1, 0, 3, 1, 0], [2, 0, 3, 0, 1], [3, 1, 2, 1, 1]];
  for (const [c, n1, n2, qx, qy] of quads) {
    const want = (k) => k[c] === key[c] && k[n1] === key[n1] && k[n2] === key[n2];
    const src = Object.keys(byKey).filter(want).sort((a, b) => (b[3 - c] === key[3 - c]) - (a[3 - c] === key[3 - c]))[0];
    if (!src) return null;
    const t = byKey[src][0];
    blit(out, t.img, t.x + qx * H, t.y + qy * H, H, H, qx * H, qy * H);
  }
  return out;
}

/** The lowest row holding an opaque pixel (-1 for an empty image). */
function lowestRow(img) {
  for (let y = img.height - 1; y >= 0; y--) for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3] >= 128) return y;
  return -1;
}

function main() {
  const o = args(process.argv.slice(2));
  const cmd = o._[0];
  if (!o.set || !o.id) throw new Error('--set and --id are required');
  const dir = join(ROOT, ART_DIR, o.set);
  mkdirSync(dir, { recursive: true });
  if (cmd === 'map') {
    const [w, h] = pair(o.size);
    const crops = (o.crop || []).map((c) => { const [x, y, ...f] = c.split(','); return { x: Number(x), y: Number(y), img: decodePNG(readFileSync(f.join(','))) }; });
    const { img, holes } = stitch(crops, w, h);
    if (holes) throw new Error(o.id + ': ' + holes + ' map pixels not covered by any crop');
    /* --patch PX,PY,FILE[,JOB]: a PixelLab inpaint of the render (a corner no tileset can draw) laid
       back at its pixel offset; recorded in the sidecar so the source says which pixels are not the map's. */
    const patches = (o.patch || []).map((c) => { const [x, y, f, job] = c.split(','); return { x: Number(x), y: Number(y), f, job }; });
    for (const p of patches) { const im = decodePNG(readFileSync(p.f)); blit(img, im, 0, 0, im.width, im.height, p.x, p.y); }
    writeFileSync(join(dir, o.id + '.png'), encodePNG(img));
    writeFileSync(join(dir, o.id + '.json'), JSON.stringify(paintedSidecar({ id: o.id, mapId: o.map, w, h, material: o.material || 'terrain', note: o.note, crops }), null, 2) + '\n');
    console.log('  ✓ ' + o.set + '/' + o.id + ': painted ' + w + 'x' + h + ' from ' + crops.length + ' renders');
  } else if (cmd === 'object') {
    const cls = CLASSES[o.class];
    if (!cls) throw new Error(o.id + ': no class ' + o.class + ' in art-budget.js');
    const f = objectFrame(decodePNG(readFileSync(o.file)), cls.contact === 'flat' || cls.contact === 'raised');
    if (!f) throw new Error(o.id + ': ' + o.file + ' is empty');
    writeFileSync(join(dir, o.id + '.png'), encodePNG(f.img));
    const sc = {
      id: o.id, class: o.class, style: 's1', material: o.material || 'stone', source: o.id + '.png',
      frame: f.frame, anchor_px: f.anchor, footprint: o.footprint ? pair(o.footprint) : [1, 1],
      ...(o.hover ? { hover_px: Number(o.hover) } : {}),
      anims: [{ name: 'idle', fps: 0, loop: false, dirs: { s: 1 } }],
      pixellab: { tool: 'create_object_pro_flash', object: o.object, ...(o.name ? { name: o.name } : {}) },
      notes: 'Ported from PixelLab object ' + o.object + ' (style 1) by tools/world-art/port-pixellab.mjs: pixels unscaled, bottom-centre anchor as Map Workshop places it.',
    };
    writeFileSync(join(dir, o.id + '.json'), JSON.stringify(sc, null, 2) + '\n');
    console.log('  ✓ ' + o.set + '/' + o.id + ' (' + o.class + ', ' + sc.frame.join('x') + ')');
  } else if (cmd === 'sheet') {
    /* --file SHEET --image IMAGE_ID --cell 64 --items "id:class:material[:WxH[:up]],…" in reading order
       ('-' skips a cell). Each cell's art is cut to its opaque box and ported like an object. */
    const sheet = decodePNG(readFileSync(o.file));
    const cell = Number(o.cell || 64), cols = Math.floor(sheet.width / cell), found = blobs(sheet);
    o.items.split(',').forEach((spec, n) => {
      if (spec === '-') return;
      /* fp: a footprint WxH; up: the art meets the floor this many rows above its lowest pixel
         (legs or a handle reach below): the anchor moves up and the rest is a declared overhang. */
      const [id, klass, material, fp, up] = spec.split(':');
      const cls = CLASSES[klass];
      if (!cls) throw new Error(id + ': no class ' + klass + ' in art-budget.js');
      const img = cellArt(sheet, (n % cols) * cell, Math.floor(n / cols) * cell, cell, found);
      if (!img) throw new Error(id + ': cell ' + n + ' of ' + o.file + ' is empty');
      writeFileSync(join(dir, id + '.png'), encodePNG(img));
      const sc = {
        id, class: klass, style: 's1', material: material || 'wood', source: id + '.png',
        frame: [img.width, img.height], anchor_px: [Math.floor(img.width / 2), img.height - 1 - Number(up || 0)],
        footprint: fp && fp !== '1x1' ? fp.split('x').map(Number) : [1, 1], ...(up ? { overhang_px: [0, 0, Number(up), 0] } : {}),
        anims: [{ name: 'idle', fps: 0, loop: false, dirs: { s: 1 } }],
        pixellab: { tool: 'create_image_pro_flash', image: o.image, cell: n, ...(o.name ? { name: o.name } : {}) },
        notes: 'Cell ' + n + ' of a 4x4 style-1 prop sheet (PixelLab image ' + o.image + ', style image a Map Workshop prop of the kit), cut to its opaque box by tools/world-art/port-pixellab.mjs; pixels unscaled.',
      };
      writeFileSync(join(dir, id + '.json'), JSON.stringify(sc, null, 2) + '\n');
      console.log('  ✓ ' + o.set + '/' + id + ' (' + klass + ', ' + sc.frame.join('x') + ')');
    });
  } else if (cmd === 'unit') {
    /* --dir DIR --class C --object OBJ_ID [--hover N]: an 8-direction Pro Flash object (a monster
       or an NPC). DIR holds its rotations as <facing>.png (south, east, …, the PixelLab names)
       and, when it walks, walk/<facing>/<i>.png (attack/ and death/ the same way: the blow, the fall,
       and a one-frame corpse from the fall's end). idle is the rotation, walk the clip. Each clip
       facing is moved by whole pixels so its lowest foot stands on the class anchor (a flier's
       hovers `hover` px above it), exactly as port-hunt-sim.mjs seats the sim's units. */
    const cls = CLASSES[o.class];
    if (!cls || !cls.frame) throw new Error(o.id + ': ' + o.class + ' is not a unit class');
    const [fw, fh] = cls.frame, [ax, ay] = cls.anchor;
    const flier = cls.contact === 'flier', hover = Number(o.hover || 10);
    const NAME = { s: 'south', e: 'east', n: 'north', w: 'west', se: 'south-east', sw: 'south-west', ne: 'north-east', nw: 'north-west' };
    const rot = (d) => join(o.dir, NAME[d] + '.png');
    const walkOf = (d) => { const out = []; for (let i = 0; existsSync(join(o.dir, 'walk', NAME[d], i + '.png')); i++) out.push(join(o.dir, 'walk', NAME[d], i + '.png')); return out; };
    const anims = [{ name: 'idle', fps: 5, loop: true, frames: Object.fromEntries(FACINGS.map((d) => [d, [rot(d)]])) }];
    if (FACINGS.every((d) => walkOf(d).length)) anims.push({ name: 'walk', fps: 10, loop: true, frames: Object.fromEntries(FACINGS.map((d) => [d, walkOf(d)])) });
    /* the combat clips (choreo.js plays `attack` on a blow and `death` on a fall), in whichever facings
       DIR holds as <clip>/<facing>/<i>.png; a facing it lacks falls back to the renderer's 's' */
    const clipOf = (name, d) => { const out = []; for (let i = 0; existsSync(join(o.dir, name, NAME[d], i + '.png')); i++) out.push(join(o.dir, name, NAME[d], i + '.png')); return out; };
    for (const name of ['attack', 'death']) {
      const have = FACINGS.filter((d) => clipOf(name, d).length);
      if (have.includes('s')) anims.push({ name, fps: 10, loop: false, frames: Object.fromEntries(have.map((d) => [d, clipOf(name, d)])) });
    }
    /* the body left lying (choreo.js `corpse`, after `death`): the fall's last frame, held */
    const death = anims.find((a) => a.name === 'death');
    if (death) anims.push({ name: 'corpse', fps: 0, loop: false, frames: Object.fromEntries(Object.entries(death.frames).map(([d, f]) => [d, [f[f.length - 1]]])) });
    const facingsOf = (a) => FACINGS.filter((d) => a.frames[d] && a.frames[d].length);
    const cols = Math.max(...anims.map((a) => Math.max(...facingsOf(a).map((d) => a.frames[d].length))));
    const sheet = createImage(cols * fw, anims.reduce((n, a) => n + facingsOf(a).length, 0) * fh);
    let r = 0;
    for (const a of anims) for (const d of facingsOf(a)) {
      const imgs = a.frames[d].map((f) => decodePNG(readFileSync(f)));
      const lowest = Math.max(...imgs.map(lowestRow));
      /* a flier falls from its hover to the floor: its fall and corpse rest on the anchor row like every body */
      const dy = (flier && a.name !== 'death' && a.name !== 'corpse' ? ay - hover : ay) - lowest, dx = ax - Math.floor(imgs[0].width / 2);
      imgs.forEach((img, i) => {
        const frame = createImage(fw, fh);
        blit(frame, img, 0, 0, img.width, img.height, dx, dy, true);
        blit(sheet, frame, 0, 0, fw, fh, i * fw, r * fh);
      });
      r++;
    }
    writeFileSync(join(dir, o.id + '.png'), encodePNG(sheet));
    const sc = {
      id: o.id, class: o.class, style: 's1', material: o.material || 'unit', source: o.id + '.png', anchor_px: [ax, ay], footprint: [1, 1],
      ...(flier ? { hover_px: hover } : {}),
      anims: anims.map((a) => ({ name: a.name, fps: a.fps, loop: a.loop, dirs: Object.fromEntries(facingsOf(a).map((d) => [d, a.frames[d].length])) })),
      pixellab: { tool: 'create_object_pro_flash', object: o.object, n_directions: 8, ...(o.name ? { name: o.name } : {}) },
      notes: 'Ported from PixelLab object ' + o.object + ' (style 1, 48 px canvas, 8 rotations' + (anims.length > 1 ? ' and a v3 walk' : '') + ') by tools/world-art/port-pixellab.mjs: pixels unscaled, each facing seated on the class anchor by whole pixels.',
    };
    writeFileSync(join(dir, o.id + '.json'), JSON.stringify(sc, null, 2) + '\n');
    console.log('  ✓ ' + o.set + '/' + o.id + ' (' + o.class + ', ' + anims.map((a) => a.name).join('+') + ')');
  } else if (cmd === 'wang') {
    /* --from SET/GROUND[,…] --ref MAT:SET/GROUND:X:Y[,…] --lower MAT --upper MAT [--variants N]
       Every 32 px cut at (16 + 32k) of the FROM grounds' sources whose four corners are the pair's
       materials (each corner the nearest --ref fill: one REF per material any of the grounds paints,
       so a tile with a third material is never taken for the pair). Distinct tiles per key, up to N. */
    const load = (p) => { const [s, g] = p.split('/'); const sc = JSON.parse(readFileSync(join(ROOT, ART_DIR, s, g + '.json'), 'utf8')); return { p, sc, img: decodePNG(readFileSync(join(ROOT, ART_DIR, s, sc.source))) }; };
    const grounds = o.from.split(',').map(load);
    const refs = o.ref.split(',').map((r) => { const [mat, p, x, y] = r.split(':'); return { mat, mean: meanOf(load(p).img, Number(x), Number(y), T, T) }; });
    const lo = o.lower, up = o.upper, max = Number(o.variants || 4);
    const byKey = {}, seen = new Set();
    for (const g of grounds) {
      for (let y = T / 2; y + T <= g.img.height; y += T) for (let x = T / 2; x + T <= g.img.width; x += T) {
        const c = cornersOf(g.img, x, y, refs);
        if (!c.every((m) => m === lo || m === up)) continue;
        const h = tileHash(g.img, x, y);
        if (seen.has(h)) continue;
        seen.add(h);
        const key = c.map((m) => (m === up ? '1' : '0')).join('');
        (byKey[key] = byKey[key] || []).push({ img: g.img, x, y, from: g.p });
      }
    }
    const composed = [];
    const cells = [];
    for (let i = 0; i < 16; i++) {
      const key = i.toString(2).padStart(4, '0');
      let list = (byKey[key] || []).slice(0, max).map((t) => { const im = createImage(T, T); blit(im, t.img, t.x, t.y, T, T, 0, 0); return im; });
      if (!list.length) { const im = composeKey(key, byKey); if (!im) throw new Error(o.id + ': no tile and no quadrants for corners ' + key); list = [im]; composed.push(key); }
      for (const im of list) cells.push({ key, im });
    }
    const cols = 8, rows = Math.ceil(cells.length / cols), sheet = createImage(cols * T, rows * T), tiles = {};
    cells.forEach((c, n) => { blit(sheet, c.im, 0, 0, T, T, (n % cols) * T, Math.floor(n / cols) * T); (tiles[c.key] = tiles[c.key] || []).push([n % cols, Math.floor(n / cols)]); });
    writeFileSync(join(dir, o.id + '.png'), encodePNG(sheet));
    const sources = grounds.map((g) => ({ ground: g.p, ...(g.sc.pixellab || {}) }));
    const sc = {
      id: o.id, class: 'terrain', kind: 'wang16', style: 's1', material: o.material || 'terrain', source: o.id + '.png', lower: lo, upper: up, tiles,
      pixellab: { tool: 'port-wang', map: sources.map((s) => s.map || s.id || s.ground).join(','), sources },
      notes: 'The ' + lo + '/' + up + ' Wang-16 pair recovered from the painted grounds ' + grounds.map((g) => g.p).join(', ') + ' (their tileset tiles, cut on the dual grid) by tools/world-art/port-pixellab.mjs wang; pixels unscaled.' + (composed.length ? ' Corners ' + composed.join(', ') + ' were never painted: each is four quadrants of painted tiles whose nearest corners match.' : ''),
    };
    writeFileSync(join(dir, o.id + '.json'), JSON.stringify(sc, null, 2) + '\n');
    console.log('  ✓ ' + o.set + '/' + o.id + ' wang16 ' + lo + '/' + up + ': ' + cells.length + ' tiles' + (composed.length ? ', composed ' + composed.join(' ') : '') + ' · per key ' + Object.keys(tiles).sort().map((k) => k + ':' + tiles[k].length).join(' '));
  } else throw new Error('usage: port-pixellab.mjs map|object|sheet|unit|wang …');
}
if (isMain(import.meta.url)) {
  try { main(); } catch (e) { console.error('port-pixellab: ' + (e && e.message || e)); process.exit(2); }
}
