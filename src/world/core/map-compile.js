// ════════════════════════════════════════════════════════════════════════
// src/world/core/map-compile.js — A MAP ROW BECOMES SOMETHING YOU CAN DRAW.
//
// A map row (src/data/world/maps/*.js) is authored as an ASCII legend plus
// objects, buildings, a patrol path, spawns, stations and exits — all on whole
// tiles, all naming sprites by their atlas-manifest id. compileMap() resolves it
// against the manifests' sprite records (class, footprint) and the material
// table into: the material grid, the collision mask (and its hash, which the
// server will freeze), the placed objects, the buildings and the point lights.
// What the rock and the buildings LOOK like is compose.js's job, because it
// depends on where the hero stands. lintMap() is the authoring contract;
// tests/world-core.mjs runs it over every shipped map.
//
// ROW SHAPE
//   id, name, kind ('hunt' | 'town' | 'home'), hunts: [hunt ids it renders]
//   outdoor (bool), light (one of LIGHT_KINDS), ground (a wang16 terrain id:
//     its lower/upper materials are what the legend's characters name)
//   legend { char: MATERIALS id }, rows [string, …] (equal widths)
//   faces     [{ x, y, id }] a rock face drawn with a variant (an arch)
//   objects   [{ id, x, y }] whole tiles, nothing else
//   buildings [{ id, rect:[x,y,w,h], wall, floor, doors:[[x,y]], windows:[x],
//               chimney: x|null, roof:{ rect:[x,y,w,h], kind } }] rect includes
//             the walls; doors and windows sit on the south (front) row
//   path      [[x,y], …] corner waypoints of a CLOSED loop of straight 8-way legs
//   spawns [[x,y]], stations { name: [x,y] }, exits [{ x, y, to }], start [x,y]
//   maskHash  hash of the collision mask (maskHash below)
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { rectOf, onEdge, isCorner, sideOf } from './grid.js?v=574';

export const MAP_KINDS = Object.freeze(['hunt', 'town', 'home']);
export const LIGHT_KINDS = Object.freeze(['cellar', 'indoor', 'day']);
/** Outdoor maps need a tree in every window this many tiles square. */
export const TREE_WINDOW = 12;

/** FNV-1a over (w, h, mask bytes) → 8 hex chars. The server freezes this. */
export function maskHash(mask, w, h) {
  let x = 0x811c9dc5;
  const eat = (b) => { x ^= b & 0xff; x = Math.imul(x, 0x01000193) >>> 0; };
  eat(w); eat(w >> 8); eat(h); eat(h >> 8);
  for (let i = 0; i < mask.length; i++) eat(mask[i]);
  return x.toString(16).padStart(8, '0');
}

/** A closed loop of corner waypoints → every cell on it, or null if a leg is not a straight 8-way run. */
export function expandPath(points) {
  if (!points || points.length < 2) return null;
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const dx = bx - ax, dy = by - ay;
    if ((dx === 0 && dy === 0) || (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy))) return null;
    const n = Math.max(Math.abs(dx), Math.abs(dy));
    for (let k = 0; k < n; k++) out.push([ax + Math.sign(dx) * k, ay + Math.sign(dy) * k]);
  }
  return out;
}

function stepOutside(r, x, y) {
  const s = sideOf(r, x, y);
  return [x + (s.includes('e') ? 1 : s.includes('w') ? -1 : 0), y + (s.includes('s') ? 1 : s.includes('n') ? -1 : 0)];
}

/**
 * Compile a map row. Tables are injected so a guard can compile a planted row.
 * @param {object} row
 * @param {{materials: object, sprites: object, openClasses: string[], lights: object}} tables
 *   sprites: every manifest's sprite records merged by id
 */
export function compileMap(row, tables) {
  const { materials, sprites, openClasses, lights } = tables;
  const h = row.rows.length, w = row.rows[0].length;
  const ground = new Array(w * h);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const id = row.legend[row.rows[y][x]];
      ground[y * w + x] = id;
      if (materials[id] && materials[id].solid) mask[y * w + x] = 1;
    }
  }
  const buildings = (row.buildings || []).map((b) => {
    const r = rectOf(b.rect);
    const doors = b.doors.map(([x, y]) => ({ x, y }));
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (onEdge(r, x, y) && !doors.some((d) => d.x === x && d.y === y)) mask[y * w + x] = 1;
      }
    }
    return { id: b.id, rect: r, wall: b.wall, floor: b.floor, doors, windows: b.windows || [], chimney: b.chimney == null ? null : b.chimney,
      roof: { rect: rectOf(b.roof.rect), kind: b.roof.kind } };
  });
  const objects = [], lit = [];
  for (const o of row.objects || []) {
    const s = sprites[o.id];
    const [fw, fh] = s.footprint;
    if (!openClasses.includes(s.class)) for (let y = o.y; y < o.y + fh; y++) for (let x = o.x; x < o.x + fw; x++) mask[y * w + x] = 1;
    objects.push({ id: o.id, x: o.x, y: o.y, fw, fh, cls: s.class });
    if (lights[o.id]) lit.push({ x: o.x + fw / 2, y: o.y + fh / 2, radius: lights[o.id].radius, tint: lights[o.id].tint });
  }
  const faces = {};
  for (const f of row.faces || []) faces[f.x + ',' + f.y] = f.id;
  return {
    id: row.id, name: row.name, kind: row.kind, outdoor: !!row.outdoor, light: row.light, w, h,
    groundTerrain: row.ground, ground, mask, maskHash: maskHash(mask, w, h), faces, objects, lights: lit, buildings,
    path: expandPath(row.path) || [], spawns: row.spawns || [], stations: row.stations || {},
    exits: row.exits || [], start: row.start,
  };
}

const WHOLE = (v) => Number.isInteger(v);

/**
 * THE AUTHORING CONTRACT. Returns [{code, msg}]; empty means the map ships.
 *   L-ROWS  equal widths, every char in the legend, every legend id a material
 *   L-WHOLE objects are { id, x, y } on whole tiles, in bounds, a real sprite
 *   L-SPACE no two solid objects share a tile; nothing stands on rock or in a
 *           wall, except a hung sprite on a wall face
 *   L-BUILD building rect in bounds, >= 3x3, on open ground, not overlapping
 *   L-DOOR  doors on the rect's edge (not a corner) with open ground both sides
 *   L-ROOF  the roof is exactly the building's footprint
 *   L-NORTH no solid piece on the row directly north of a south wall
 *   L-PATH  a hunt has a closed patrol loop of straight 8-way legs on open ground
 *   L-WALK  start, spawns, stations and exits stand on open ground
 *   L-TREES an outdoor map has a tree in every TREE_WINDOW-square window
 *   L-KIND  kind and light are known values; ground names a terrain
 *   L-HASH  maskHash matches the compiled mask
 */
export function lintMap(row, tables) {
  const out = [];
  const bad = (code, msg) => out.push({ code, msg: row.id + ': ' + msg });
  const { materials, sprites, openClasses, treeClasses, terrains } = tables;
  if (!MAP_KINDS.includes(row.kind)) bad('L-KIND', 'kind "' + row.kind + '" is not one of ' + MAP_KINDS.join('/'));
  if (!LIGHT_KINDS.includes(row.light)) bad('L-KIND', 'light "' + row.light + '" is not one of ' + LIGHT_KINDS.join('/'));
  if (terrains && !terrains[row.ground]) bad('L-KIND', 'ground "' + row.ground + '" is not a terrain in any atlas');
  const rows = row.rows || [];
  if (!rows.length || rows.some((r) => r.length !== rows[0].length)) { bad('L-ROWS', 'rows are empty or ragged'); return out; }
  for (const [ch, id] of Object.entries(row.legend || {})) if (!materials[id]) bad('L-ROWS', 'legend "' + ch + '" names unknown material "' + id + '"');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (!(ch in row.legend)) bad('L-ROWS', 'char "' + ch + '" at ' + x + ',' + y + ' is not in the legend'); }));
  if (out.length) return out;
  const h = rows.length, w = rows[0].length;
  const inside = (x, y) => WHOLE(x) && WHOLE(y) && x >= 0 && y >= 0 && x < w && y < h;
  for (const b of row.buildings || []) {
    if (!Array.isArray(b.rect) || b.rect.length !== 4 || !b.rect.every(WHOLE)) { bad('L-WHOLE', 'building ' + b.id + ' rect is not four whole numbers'); return out; }
    if (!b.roof || !Array.isArray(b.roof.rect) || b.roof.rect.join() !== b.rect.join()) bad('L-ROOF', 'building ' + b.id + ' roof ' + JSON.stringify(b.roof && b.roof.rect) + ' is not its footprint ' + JSON.stringify(b.rect));
  }
  for (const o of row.objects || []) {
    const extra = Object.keys(o).filter((k) => k !== 'id' && k !== 'x' && k !== 'y');
    if (extra.length) bad('L-WHOLE', 'object ' + o.id + ' carries ' + extra.join(',') + ': placement is whole tiles only');
    if (!sprites[o.id]) { bad('L-WHOLE', 'object ' + o.id + ' is not a sprite in any atlas'); continue; }
    const [fw, fh] = sprites[o.id].footprint;
    if (!inside(o.x, o.y) || !inside(o.x + fw - 1, o.y + fh - 1)) bad('L-WHOLE', 'object ' + o.id + ' at ' + o.x + ',' + o.y + ' is not on whole tiles inside the map');
  }
  if (out.length) return out;
  const map = compileMap(row, tables);
  const open = (x, y) => inside(x, y) && map.mask[y * w + x] === 0;
  const solidAt = (x, y) => { const m = materials[map.ground[y * w + x]]; return !!(m && m.solid); };
  const B = map.buildings;
  const wallFace = (x, y) => (solidAt(x, y) && inside(x, y + 1) && !solidAt(x, y + 1))
    || B.some((b) => onEdge(b.rect, x, y) && (y === b.rect.y || y === b.rect.y + b.rect.h - 1));
  B.forEach((b, i) => {
    const r = b.rect;
    if (r.w < 3 || r.h < 3 || !inside(r.x, r.y) || !inside(r.x + r.w - 1, r.y + r.h - 1)) bad('L-BUILD', 'building ' + b.id + ' is smaller than 3x3 or leaves the map');
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (inside(x, y) && solidAt(x, y)) bad('L-BUILD', 'building ' + b.id + ' stands on solid ' + map.ground[y * w + x] + ' at ' + x + ',' + y);
    }
    B.slice(i + 1).forEach((o) => {
      const q = o.rect;
      if (r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h) bad('L-BUILD', 'buildings ' + b.id + ' and ' + o.id + ' overlap');
    });
    if (!b.doors.length) bad('L-DOOR', 'building ' + b.id + ' has no door');
    for (const d of b.doors) {
      if (!onEdge(r, d.x, d.y) || isCorner(r, d.x, d.y)) { bad('L-DOOR', 'building ' + b.id + ' door ' + d.x + ',' + d.y + ' is not on an edge'); continue; }
      const [ox, oy] = stepOutside(r, d.x, d.y);
      const [ix, iy] = [2 * d.x - ox, 2 * d.y - oy];
      if (!open(ox, oy) || !open(ix, iy)) bad('L-DOOR', 'building ' + b.id + ' door ' + d.x + ',' + d.y + ' does not open onto walkable ground on both sides');
    }
  });
  const taken = new Map();
  for (const o of map.objects) {
    const hung = o.cls === 'hanging';
    const solid = !openClasses.includes(o.cls);
    for (let y = o.y; y < o.y + o.fh; y++) for (let x = o.x; x < o.x + o.fw; x++) {
      const k = x + ',' + y;
      if (solid) { if (taken.has(k)) bad('L-SPACE', o.id + ' and ' + taken.get(k) + ' share tile ' + k); taken.set(k, o.id); }
      if (hung && wallFace(x, y)) continue;
      if (solidAt(x, y)) bad('L-SPACE', o.id + ' stands on solid ground at ' + k);
      if (B.some((b) => onEdge(b.rect, x, y))) bad('L-SPACE', o.id + ' stands in a wall at ' + k);
    }
    if (solid && !treeClasses.includes(o.cls)) {
      for (const b of B) {
        const southRow = b.rect.y + b.rect.h - 1;
        if (o.y + o.fh - 1 === southRow - 1 && o.x > b.rect.x && o.x < b.rect.x + b.rect.w - 1) bad('L-NORTH', o.id + ' at ' + o.x + ',' + o.y + ' stands directly north of ' + b.id + '\'s south wall');
      }
    }
  }
  if (row.kind === 'hunt') {
    const cells = expandPath(row.path);
    if (!cells) bad('L-PATH', 'the patrol path is missing, open or has a leg that is not a straight 8-way run');
    else cells.filter(([x, y]) => !open(x, y)).forEach(([x, y]) => bad('L-PATH', 'the patrol path crosses a blocked tile at ' + x + ',' + y));
  }
  const spots = [['start', row.start]].concat((row.spawns || []).map((s) => ['spawn', s]),
    Object.entries(row.stations || {}), (row.exits || []).map((e) => ['exit to ' + e.to, [e.x, e.y]]));
  for (const [what, at] of spots) if (!at || !open(at[0], at[1])) bad('L-WALK', what + ' ' + JSON.stringify(at) + ' is not on walkable ground');
  if (row.outdoor) {
    const trees = map.objects.filter((o) => treeClasses.includes(o.cls));
    const ww = Math.min(TREE_WINDOW, w), wh = Math.min(TREE_WINDOW, h);
    for (let wy = 0; wy + wh <= h; wy++) for (let wx = 0; wx + ww <= w; wx++) {
      if (!trees.some((t) => t.x >= wx && t.x < wx + ww && t.y >= wy && t.y < wy + wh)) {
        bad('L-TREES', 'no tree in the ' + ww + 'x' + wh + ' window at ' + wx + ',' + wy); wy = h; break;
      }
    }
  }
  if (row.maskHash !== map.maskHash) bad('L-HASH', 'maskHash "' + row.maskHash + '" but the mask hashes to "' + map.maskHash + '" — what blocks a step changed');
  return out;
}
