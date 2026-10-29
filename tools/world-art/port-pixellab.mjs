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
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit } from './png.mjs';
import { T, CLASSES, FACINGS } from '../../src/data/world/art-budget.js';
import { ROOT, ART_DIR } from './build.mjs';
import { measureFrame } from './measure.mjs';
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

/* ── paint / retile: grounds drawn from PixelLab pro tilesets on the dual grid ─────────────────────────── */
/** The PAINT rows of a grid brief (the lines after a `PAINT` line, quotes and commas stripped, up to a blank line). */
function paintRows(text) {
  const lines = text.split(/\r?\n/), at = lines.findIndex((l) => /^\s*PAINT\b/.test(l));
  if (at < 0) throw new Error('the grid has no PAINT section');
  const rows = [];
  for (const l of lines.slice(at + 1)) { const r = l.replace(/['",\s]/g, ''); if (!r) break; rows.push(r); }
  if (!rows.length || rows.some((r) => r.length !== rows[0].length)) throw new Error('PAINT rows are empty or ragged');
  return rows;
}
/**
 * The tiles of the named tilesets (DIR/<anything>.json holding a GET /tilesets/{id} response whose tileset id,
 * taken from its tiles' set, is in `use`; a file names its set by `tileset_id` or its filename's id).
 * tileFor(corners NW NE SW SE as terrain ids) is the tile drawing them (null when none can); cornersOf(hash) reads
 * a cut back as its corner terrains.
 */
function tileBook(dirPath, use) {
  const sets = [];
  for (const f of readdirSync(dirPath).filter((f) => f.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(join(dirPath, f), 'utf8'));
    if (!j.metadata || !j.tileset) continue;
    const id = j.tileset_id || (j.metadata.tileset_id) || f.replace(/\.json$/, '');
    const hit = use.find((u) => id.startsWith(u) || f.startsWith(u));
    if (!hit) continue;
    const { lower, upper } = j.metadata.terrain_ids;
    const tiles = {};
    for (const t of j.tileset.tiles) {
      const key = ['NW', 'NE', 'SW', 'SE'].map((c) => (t.corners[c] === 'upper' ? '1' : '0')).join('');
      tiles[key] = decodePNG(Buffer.from(t.image.base64, 'base64'));
    }
    sets.push({ id: hit, full: id, lower, upper, tiles, prompts: j.metadata.terrain_prompts });
  }
  const missing = use.filter((u) => !sets.some((s) => s.id === u));
  if (missing.length) throw new Error('tilesets not in ' + dirPath + ': ' + missing.join(', '));
  const ids = [...new Set(sets.flatMap((s) => [s.lower, s.upper]))];
  const terrain = (p) => { const m = ids.filter((t) => t.startsWith(p)); if (m.length !== 1) throw new Error('terrain ' + p + ' matches ' + m.length + ' of the sets\' terrains'); return m[0]; };
  const name = (t) => { const s = sets.find((s) => s.lower === t || s.upper === t); return t.slice(0, 8) + ' (' + (s.lower === t ? s.prompts.lower : s.prompts.upper).split(/[,]/)[0] + ')'; };
  const usedIds = new Set();
  const tileFor = (c) => {
    const m = [...new Set(c)];
    if (m.length > 2) return null;
    if (m.length === 1) {
      /* the base tile most of the sets share (a set chained by reference image alone can redraw its partner's base) */
      const have = sets.filter((s) => s.lower === m[0] || s.upper === m[0]).map((s) => ({ s, im: s.tiles[s.lower === m[0] ? '0000' : '1111'] }));
      const votes = new Map();
      for (const h of have) { const k = tileHash(h.im, 0, 0); votes.set(k, (votes.get(k) || 0) + 1); }
      const best = have.find((h) => votes.get(tileHash(h.im, 0, 0)) === Math.max(...votes.values()));
      usedIds.add(best.s.id);
      return best.im;
    }
    const s = sets.find((s) => (s.lower === m[0] && s.upper === m[1]) || (s.lower === m[1] && s.upper === m[0]));
    if (!s) return null;
    usedIds.add(s.id);
    return s.tiles[c.map((t) => (t === s.upper ? '1' : '0')).join('')];
  };
  const byHash = new Map();
  for (const s of sets) for (const [key, im] of Object.entries(s.tiles)) {
    const hsh = tileHash(im, 0, 0);
    if (!byHash.has(hsh)) byHash.set(hsh, [...key].map((b) => (b === '1' ? s.upper : s.lower)));
  }
  return { terrain, name, tileFor, cornersOf: (hsh) => byHash.get(hsh) || null, used: () => sets.filter((s) => usedIds.has(s.id)).map((s) => s.full) };
}

/**
 * A vertex no single set draws (three or four terrains round it, as where a clearing, a mound and the thicket
 * meet): each 16 px quarter is cut from the pair tile of its own corner's terrain and a neighbour terrain it
 * meets (the edge neighbours first), every corner of that tile set to one of the two. Null when a pair it needs
 * has no set.
 */
const QUADS = [[0, 1, 2, 0, 0], [1, 0, 3, 1, 0], [2, 0, 3, 0, 1], [3, 1, 2, 1, 1]];
function blendTile(book, k) {
  const H2 = T / 2, out = createImage(T, T);
  for (const [ci, n1, n2, qx, qy] of QUADS) {
    const others = [...new Set([k[n1], k[n2], k[3 - ci]].filter((t) => t !== k[ci]))];
    let tile = null;
    for (const X of others.length ? others : [k[ci]]) {
      tile = book.tileFor(k.map((t) => (t === k[ci] ? k[ci] : X)));
      if (tile) break;
    }
    if (!tile) return null;
    blit(out, tile, qx * H2, qy * H2, H2, H2, qx * H2, qy * H2);
  }
  return out;
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
    /* the combat clips (choreo.js plays `attack` on a blow and `death` on a fall; a boss's `special` is its special
       attack, Tyler 10-15), in whichever facings DIR holds as <clip>/<facing>/<i>.png; a facing it lacks falls back
       to the renderer's 's' */
    const clipOf = (name, d) => { const out = []; for (let i = 0; existsSync(join(o.dir, name, NAME[d], i + '.png')); i++) out.push(join(o.dir, name, NAME[d], i + '.png')); return out; };
    for (const name of ['attack', 'special', 'death']) {
      const have = FACINGS.filter((d) => clipOf(name, d).length);
      if (have.includes('s')) anims.push({ name, fps: 10, loop: false, frames: Object.fromEntries(have.map((d) => [d, clipOf(name, d)])) });
    }
    /* the body left lying (choreo.js `corpse`, after `death`): the fall's last frame, held */
    const death = anims.find((a) => a.name === 'death');
    if (death) anims.push({ name: 'corpse', fps: 0, loop: false, frames: Object.fromEntries(Object.entries(death.frames).map(([d, f]) => [d, [f[f.length - 1]]])) });
    const facingsOf = (a) => FACINGS.filter((d) => a.frames[d] && a.frames[d].length);
    const cols = Math.max(...anims.map((a) => Math.max(...facingsOf(a).map((d) => a.frames[d].length))));
    const sheet = createImage(cols * fw, anims.reduce((n, a) => n + facingsOf(a).length, 0) * fh);
    /* --seat idle (a walking unit whose pike, banner or falling body reaches below its feet): PixelLab draws every
       clip on its rotation's canvas, so each frame keeps the idle's offset (the rotation's foot row, the validator's
       measure, on the anchor) and is lifted only as far as keeps its lowest pixel in the frame. What still reaches
       below the anchor is declared as overhang_px. The default seats each clip facing by its own lowest pixel.
       --overflow crop (with --seat idle): no frame is ever lifted, so the body never hops off its feet on a blow or
       a fall; the few pixels of pike or pole that reach past the frame's bottom edge are cut instead. */
    /* --foot-cols N: the rotation's foot is the lowest row at least N columns bottom out on (default 2, the validator's
       footRow); a unit that holds a blade point-down below its feet in a rotation needs a wider foot (4) to be seated on
       its boots, not on the blade's tip */
    const footOf = (img) => { const m = measureFrame(img); if (!o['foot-cols']) return m.foot; const n = Number(o['foot-cols']); for (let y = m.box.y1; y >= m.box.y0; y--) { let hits = 0; for (let x = m.box.x0; x <= m.box.x1; x++) if (m.profile[x] === y) hits++; if (hits >= n) return y; } return m.foot; };
    const idleFoot = o.seat === 'idle' ? Object.fromEntries(FACINGS.map((d) => [d, footOf(decodePNG(readFileSync(rot(d))))])) : null;
    let r = 0, reach = 0;
    for (const a of anims) for (const d of facingsOf(a)) {
      const imgs = a.frames[d].map((f) => decodePNG(readFileSync(f)));
      const lowest = Math.max(...imgs.map(lowestRow));
      /* a flier falls from its hover to the floor: its fall and corpse rest on the anchor row like every body */
      const dy = (flier && a.name !== 'death' && a.name !== 'corpse' ? ay - hover : ay) - lowest, dx = ax - Math.floor(imgs[0].width / 2);
      /* --overflow crop: a fall (death, and the corpse it leaves) still has to stay whole in the frame, so its lift is
         spread over the clip, never more than a pixel or two a frame and never back down: the body settles, it does
         not jump. The corpse holds the fall's last lift. */
      const need = imgs.map((img) => Math.max(0, (ay - (idleFoot ? idleFoot[d] : 0)) - (fh - 1 - lowestRow(img))));
      const fall = a.name === 'death' || a.name === 'corpse';
      const deathNeed = fall && idleFoot && o.overflow === 'crop' ? (() => { const dn = anims.find((x) => x.name === 'death').frames[d].map((f) => decodePNG(readFileSync(f))).map((img) => Math.max(0, (ay - idleFoot[d]) - (fh - 1 - lowestRow(img)))); const top = Math.max(...dn); let run = 0; return dn.map((v, i) => (run = Math.max(run, v, Math.ceil(top * i / Math.max(1, dn.length - 1))))); })() : null;
      imgs.forEach((img, i) => {
        const lift = !deathNeed ? 0 : a.name === 'corpse' ? deathNeed[deathNeed.length - 1] : Math.max(deathNeed[i], need[i]);
        const fdy = idleFoot ? (o.overflow === 'crop' ? ay - idleFoot[d] - lift : Math.min(ay - idleFoot[d], fh - 1 - lowestRow(img))) : dy;
        if (idleFoot) reach = Math.max(reach, Math.min(fh - 1, lowestRow(img) + fdy) - ay);
        const frame = createImage(fw, fh);
        blit(frame, img, 0, 0, img.width, img.height, dx, fdy, true);
        blit(sheet, frame, 0, 0, fw, fh, i * fw, r * fh);
      });
      r++;
    }
    writeFileSync(join(dir, o.id + '.png'), encodePNG(sheet));
    const sc = {
      id: o.id, class: o.class, style: 's1', material: o.material || 'unit', source: o.id + '.png', anchor_px: [ax, ay], footprint: [1, 1],
      ...(flier ? { hover_px: hover } : {}),
      ...(idleFoot && reach > 0 ? { overhang_px: [0, 0, reach, 0] } : {}),
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
  } else if (cmd === 'paint') {
    /* --grid FILE --tilesets DIR --use ID,… --legend L=TERRAIN,… [--note "…"]
       A painted ground drawn the way Map Workshop draws one, from PixelLab pro tilesets (the GET /tilesets/{id}
       JSON, one file per set in DIR): the grid's PAINT rows give each map cell a material, and every 32 px tile
       sits on the DUAL grid, its four corners on four cell centres (the edge cells continue past the border).
       One material is its base tile; two are the tile of the pair's set whose corners match. Chained sets share
       their base tiles pixel for pixel (one terrain id each), so the paint is exactly the sets' own tiles. Three
       materials round one vertex are blended from quadrants (blendTile); a pair no set draws refuses the grid. */
    const rows = paintRows(readFileSync(o.grid, 'utf8'));
    const h = rows.length, w = rows[0].length;
    const legend = Object.fromEntries(o.legend.split(',').map((p) => p.split('=')));
    const book = tileBook(o.tilesets, o.use.split(','));
    const terrain = (ch) => { const p = legend[ch]; if (!p) throw new Error(o.id + ': no legend entry for ' + ch); return book.terrain(p); };
    const out = createImage(w * T, h * T), bad = [];
    let blends = 0;
    const cell = (x, y) => terrain(rows[Math.min(h - 1, Math.max(0, y))][Math.min(w - 1, Math.max(0, x))]);
    for (let vy = -1; vy < h; vy++) for (let vx = -1; vx < w; vx++) {
      const c = [cell(vx, vy), cell(vx + 1, vy), cell(vx, vy + 1), cell(vx + 1, vy + 1)];
      const tile = book.tileFor(c) || blendTile(book, c);
      if (tile && new Set(c).size > 2) blends++;
      if (!tile) { bad.push(vx + ',' + vy + ' ' + [...new Set(c.map((t) => book.name(t)))].join('+')); continue; }
      blit(out, tile, 0, 0, T, T, vx * T + T / 2, vy * T + T / 2);
    }
    if (bad.length) throw new Error(o.id + ': ' + bad.length + ' vertices no set can draw: ' + bad.slice(0, 12).join(' · '));
    writeFileSync(join(dir, o.id + '.png'), encodePNG(out));
    const sc = paintedSidecar({ id: o.id, mapId: null, w, h, material: o.material || 'terrain', note: o.note, crops: [] });
    sc.pixellab = { tool: 'create-tileset (pro), dual-grid paint', tileset: book.used().join(','), grid: o.grid.replace(/\\/g, '/').replace(/^.*?(art\/briefs\/)/, '$1') };
    sc.notes = o.note || 'Painted from ' + sc.pixellab.grid + ' with the tiles of ' + book.used().length + ' PixelLab pro tilesets on the dual grid by tools/world-art/port-pixellab.mjs paint; pixels unscaled.';
    writeFileSync(join(dir, o.id + '.json'), JSON.stringify(sc, null, 2) + '\n');
    console.log('  ✓ ' + o.set + '/' + o.id + ': painted ' + w + 'x' + h + ' from ' + book.used().length + ' tilesets, ' + blends + ' three-terrain vertices blended from quadrants');
  } else if (cmd === 'retile') {
    /* --tilesets DIR --use ID,… --swap OLD_TERRAIN=NEW_TERRAIN,… [--note "…"]
       Re-lay a painted ground's tiles for a terrain that was regenerated: every 32 px dual-grid cut that IS a
       tile of one of the sets (pixel for pixel) is read back as its four corner terrains, the swapped terrains are
       replaced, and the cut is redrawn from the set of the new pair. Cuts that match no set are left as painted. */
    const g = JSON.parse(readFileSync(join(dir, o.id + '.json'), 'utf8'));
    const img = decodePNG(readFileSync(join(dir, g.source)));
    const book = tileBook(o.tilesets, o.use.split(','));
    const swap = Object.fromEntries(o.swap.split(',').map((p) => p.split('=').map((t) => book.terrain(t))));
    let n = 0, swapped = 0, unread = 0, composed = 0;
    /* each map cell's terrain, read from any cut that is a set's tile (a cell centre is a corner of four cuts) */
    const cw = Math.round(img.width / T), cells = new Map(), unreadCuts = [];
    const cellAt = (x, y) => cells.get(y * cw + x);
    for (let y = T / 2; y + T <= img.height; y += T) for (let x = T / 2; x + T <= img.width; x += T) {
      const c = book.cornersOf(tileHash(img, x, y)), vx = (x - T / 2) / T, vy = (y - T / 2) / T;
      if (c) [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy], i) => cells.set((vy + dy) * cw + vx + dx, c[i]));
    }
    for (let y = T / 2; y + T <= img.height; y += T) for (let x = T / 2; x + T <= img.width; x += T) {
      n++;
      const c = book.cornersOf(tileHash(img, x, y));
      if (!c) { unread++; unreadCuts.push([x, y]); continue; }
      if (!c.some((t) => swap[t])) continue;
      const tile = book.tileFor(c.map((t) => swap[t] || t));
      if (!tile) throw new Error(o.id + ': no set draws ' + c.map((t) => book.name(swap[t] || t)).join('+') + ' at ' + x + ',' + y);
      blit(img, tile, 0, 0, T, T, x, y);
      swapped++;
    }
    /* A cut no set drew (three terrains round one vertex: Map Workshop's own blend) that touches a swapped terrain is
       re-laid quadrant by quadrant: each 16 px quarter from the pair tile of its own corner's terrain and the
       neighbour terrain it meets, so no pixel of the old terrain is left in it. */
    for (const [x, y] of unreadCuts) {
      const vx = (x - T / 2) / T, vy = (y - T / 2) / T;
      const old = [cellAt(vx, vy), cellAt(vx + 1, vy), cellAt(vx, vy + 1), cellAt(vx + 1, vy + 1)];
      if (old.some((t) => !t) || !old.some((t) => swap[t])) continue;
      const tile = blendTile(book, old.map((t) => swap[t] || t));
      if (!tile) continue;
      blit(img, tile, 0, 0, T, T, x, y);
      composed++;
    }
    writeFileSync(join(dir, g.source), encodePNG(img));
    g.pixellab = { ...g.pixellab, retiled: { swap: o.swap.split(','), tilesets: book.used() } };
    if (o.note) g.notes += ' ' + o.note;
    writeFileSync(join(dir, o.id + '.json'), JSON.stringify(g, null, 2) + '\n');
    console.log('  ✓ ' + o.set + '/' + o.id + ': ' + swapped + ' of ' + n + ' cuts re-laid, ' + composed + ' of ' + unread + ' blends no set drew composed from quadrants');
  } else throw new Error('usage: port-pixellab.mjs map|object|sheet|unit|wang|paint|retile …');
}
if (isMain(import.meta.url)) {
  try { main(); } catch (e) { console.error('port-pixellab: ' + (e && e.message || e)); process.exit(2); }
}
