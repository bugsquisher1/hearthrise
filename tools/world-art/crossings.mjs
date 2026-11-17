// tools/world-art/crossings.mjs — NOBODY WADES: a tile a hero can stand on is never painted water with nothing under its feet.
//
// Tyler 2026-11-14, Mosslight Glade on v0.2.130: "the bridge needs fixed, i'm walking through water". The sluice boards
// were open floor across five rows while the one plank bridge on them covered three, so the hero walked the last
// row in the brook; the ford beside it was three open columns of painted deep water with five stones scattered over it.
// The walk mask (the map rows, what the engine paths on) and the painted ground (one picture, src/data/world/maps
// `ground`) are authored apart, so only the pixels can tell which open tile LOOKS like water. Rule [wet] in
// tests/world-assets.mjs reads them:
//
//   WATER   the colours of the painted ground inside a flat solid (brook, sewage, chasm: src/data/world/terrain.js `flat`)
//           whose eight neighbours are the same, minus every colour on open floor away from it. A bank painted as
//           grass, or a shared outline, is never water.
//   FOOT    where a unit stands on tile (x, y): its contact row lands on the tile's south pixel row (src/world/core/compose.js
//           PLACEMENT), so the foot is the 13 x 7 px box centred on the tile's column, ending on that row.
//   WET     an open tile whose foot is more than half water that no FOOTHOLD covers. A foothold is a placed object of
//           class span or bridge (a bridge, a pier) or a stepping stone, drawn as the renderer draws it (its first frame,
//           at its anchor).
//
// A town (ground: null) is drawn from its materials tile by tile, so its open tiles are never painted water; a map on
// another grid than the base one is skipped (its own lane checks it). Pure: takes the decoded atlases, reads no file.

const FOOTHOLD_CLASSES = Object.freeze(['span', 'bridge']);
/* the meadow stones, and their six layings a tile apiece (tools/world-art/seam-grounds.mjs FORD_STONES, Wickstead's ford) */
export const FOOTHOLD_IDS = Object.freeze(['mb_stepping_stones', 'mb_stepping_stones_1', 'mb_stepping_stones_2', 'mb_stepping_stones_3', 'mb_stepping_stones_4',
  'mb_stepping_stones_5', 'mb_stepping_stones_6']);
export const FOOT = Object.freeze({ half: 6, rise: 6 });   // 13 px wide, 7 px tall, ending on the tile's south row
const WET_SHARE = 0.5;
const WATER_ODDS = 20;

const rgb = (img, x, y) => { const i = (y * img.width + x) * 4; return img.data[i + 3] ? (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2] : -1; };

/**
 * @param {{ maps: object[], atlases: { manifest: object, atlas: { width: number, height: number, data: Uint8Array } }[], materials: object }} d
 * @returns {{ rule: 'wet', id: string, x: number, y: number, detail: string }[]}
 */
export function wetFootFindings({ maps, atlases, materials }) {
  const sprites = new Map(), terrains = new Map();
  for (const a of atlases) {
    for (const [id, s] of Object.entries(a.manifest.sprites || {})) if (!sprites.has(id)) sprites.set(id, { s, img: a.atlas });
    for (const [id, t] of Object.entries(a.manifest.terrain || {})) if (!terrains.has(id)) terrains.set(id, { t, img: a.atlas, T: a.manifest.T || 32 });
  }
  const out = [];
  for (const map of maps) {
    const ter = map.ground && terrains.get(map.ground);
    if (!ter || !ter.t.painted || map.grid) continue;
    const { t, img, T } = ter;
    const rows = map.rows, h = rows.length, w = rows[0].length;
    const [cols, crow] = t.cycle || [1, 1];
    const mat = (x, y) => materials[map.legend[rows[y][x]]] || { solid: true };
    const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !mat(x, y).solid;
    const ground = (px, py) => {
      const cx = Math.floor(px / T), cy = Math.floor(py / T);
      const [sx, sy] = t.tiles['1111'][(cy % crow) * cols + (cx % cols)];
      return rgb(img, sx + (px % T), sy + (py % T));
    };
    const same = (x, y, pred) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h || !pred(X, Y)) return false; } return true; };
    /* the shipped sheets are indexed to a few dozen colours, so water and grass share some: a colour is water when its
       share of the water pixels is at least WATER_ODDS times its share of the open floor's */
    const inWater = new Map(), onLand = new Map();
    let nWater = 0, nLand = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const m = mat(x, y), ch = rows[y][x];
      const water = m.solid && m.flat && same(x, y, (X, Y) => rows[Y][X] === ch), land = !water && !m.solid && same(x, y, open);
      if (!water && !land) continue;
      const into = water ? inWater : onLand;
      for (let py = y * T; py < (y + 1) * T; py++) for (let px = x * T; px < (x + 1) * T; px++) { const c = ground(px, py); into.set(c, (into.get(c) || 0) + 1); }
      if (water) nWater += T * T; else nLand += T * T;
    }
    const waterC = new Set();
    for (const [c, k] of inWater) if (k / nWater >= WATER_ODDS * ((onLand.get(c) || 0) / Math.max(1, nLand))) waterC.add(c);
    if (!waterC.size) continue;
    /* every bridge's opaque pixels, where the renderer draws them; a stone holds the foot of the tile it lies on (its art
       ends 3 px above the contact row by its anchor, under the walker's shadow) */
    const held = new Set(), stones = new Set();
    for (const o of map.objects || []) {
      const e = sprites.get(o.id);
      if (e && FOOTHOLD_IDS.includes(o.id)) { stones.add(o.x + ',' + o.y); continue; }
      if (!e || !FOOTHOLD_CLASSES.includes(e.s.class)) continue;
      const [fw, fh] = e.s.footprint || [1, 1];
      const clip = Object.values(e.s.anims)[0], [fx, fy] = Object.values(clip.dirs)[0][0];
      const ox = o.x * T + Math.floor((fw * T) / 2) - e.s.anchor[0], oy = o.y * T + fh * T - 1 - e.s.anchor[1];
      for (let y = 0; y < e.s.frame[1]; y++) for (let x = 0; x < e.s.frame[0]; x++) if (e.img.data[((fy + y) * e.img.width + fx + x) * 4 + 3]) held.add((oy + y) * w * T + ox + x);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!open(x, y) || stones.has(x + ',' + y)) continue;
      const cx = x * T + (T >> 1), fy = y * T + T - 1;
      let wet = 0, n = 0;
      for (let py = fy - FOOT.rise; py <= fy; py++) for (let px = cx - FOOT.half; px <= cx + FOOT.half; px++) {
        n++;
        if (waterC.has(ground(px, py)) && !held.has(py * w * T + px)) wet++;
      }
      if (wet / n > WET_SHARE) out.push({ rule: 'wet', id: map.id, x, y, detail: `${map.id} ${x},${y}: an open tile whose foot is ${Math.round((100 * wet) / n)}% painted water with no bridge or stone under it` });
    }
  }
  return out;
}
