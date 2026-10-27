// ════════════════════════════════════════════════════════════════════════
// src/render/creature-sprite.js — A CREATURE AS THE WORLD DRAWS IT, STANDING STILL.
//
// The Hunts window's "Who lives here" draws each creature from the SAME style-1
// art the hunting ground does (the world atlases, src/data/world/atlas-sets.js):
// its idle frame, at a whole-number scale with smoothing off (ART_DIRECTION §2;
// never a painted portrait beside style-1 art, Tyler 10-18). The frame is cropped
// to the creature's own pixels, top to its feet (the anchor row), so a line of
// them stands on one ground line at their true relative size: a rat is small, the
// Rat King is not.
//
//   creatureArt(doc, version, ids)  the art of those creatures: every manifest is read (small
//                              JSON), but only the sets that carry them load their image, each
//                              once per page (the World pane holds the same decoded images):
//                              Promise<Map<id, { image, row }>>, one map that grows per call
//   drawCreature(canvas, art, id, o)  draw it; false when no set carries the sprite
// A PORTRAIT FACES THE PLAYER (Tyler 2026-10-24: "facing front though maybe?"): the idle
// frame facing south, which every unit sprite carries (35 of 43 have all eight directions,
// 7 only south, 1 the four sides), so a line of them is one consistent pose. Units in the
// World turn as they move; that is the World renderer's, not this.
// ════════════════════════════════════════════════════════════════════════
import { ATLAS_SETS } from '../data/world/atlas-sets.js?v=0.2.57';
import { loadAtlasManifest, loadAtlasImage } from '../world/atlas.js?v=0.2.57';

/** The direction a creature's portrait faces: front, toward the player. */
export const PORTRAIT_DIR = 's';

const ART = new Map();
let rows = null;   // Promise<Map<id, { set, row }>>: every unit sprite with an idle clip (the first set that carries it)

function unitRows(doc, version) {
  if (!rows) {
    rows = Promise.all(ATLAS_SETS.map((set) => loadAtlasManifest({ doc, version }, set).then((m) => [set, m], () => [set, null]))).then((all) => {
      const by = new Map();
      for (const [set, m] of all) {
        for (const [id, row] of Object.entries((m && m.sprites) || {})) {
          if (!by.has(id) && row.layer === 'unit' && row.anims && row.anims.idle) by.set(id, { set, row });
        }
      }
      return by;
    });
  }
  return rows;
}

/** The art of creatures `ids` (sprite ids): loads only the sets that carry them; resolves to the shared map. */
export async function creatureArt(doc, version, ids) {
  const by = await unitRows(doc, version);
  const want = (ids || []).filter((id) => !ART.has(id) && by.has(id));
  await Promise.all(Array.from(new Set(want.map((id) => by.get(id).set))).map((set) => loadAtlasImage({ doc, version }, set).then((image) => {
    for (const [id, r] of by) if (r.set === set) ART.set(id, { image, row: r.row });
  }, () => null)));
  return ART;
}

/* The opaque box of one frame, its bottom held at the anchor row (the feet): [x0, y0, x1, y1] in frame px. */
function bodyBox(doc, image, sx, sy, fw, fh, footY) {
  const tmp = doc.createElement('canvas');
  tmp.width = fw; tmp.height = fh;
  const g = tmp.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, sx, sy, fw, fh, 0, 0, fw, fh);
  const px = g.getImageData(0, 0, fw, fh).data;
  let x0 = fw, y0 = fh, x1 = -1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    if (px[(y * fw + x) * 4 + 3] === 0) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
  }
  return x1 < 0 ? null : [x0, y0, x1, Math.max(y0, Math.min(fh - 1, footY))];
}

/**
 * Draw `id`'s idle frame facing `dir` into `canvas`, cropped to its body, at `scale` (a whole number).
 * @param {HTMLCanvasElement} canvas
 * @param {Map<string, {image: HTMLImageElement, row: object}>} art   creatureArt's answer
 * @param {string} id
 * @param {{dir?: string, scale?: number}} [o]
 * @returns {boolean} false when no set carries the sprite (the canvas is left empty)
 */
export function drawCreature(canvas, art, id, o) {
  const opt = o || {};
  const hit = art && art.get(id);
  const dirs = hit && hit.row.anims.idle.dirs;
  const at = dirs && (dirs[opt.dir || PORTRAIT_DIR] || dirs.s || Object.values(dirs)[0]);
  if (!at || !at.length) return false;
  const [fw, fh] = hit.row.frame;
  const [sx, sy] = at[0];
  const box = bodyBox(canvas.ownerDocument, hit.image, sx, sy, fw, fh, hit.row.anchor[1]);
  if (!box) return false;
  const scale = Math.max(1, Math.floor(opt.scale || 1));
  const w = box[2] - box[0] + 1, h = box[3] - box[1] + 1;
  canvas.width = w * scale;
  canvas.height = h * scale;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(hit.image, sx + box[0], sy + box[1], w, h, 0, 0, w * scale, h * scale);
  return true;
}
