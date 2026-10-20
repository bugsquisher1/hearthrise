// ════════════════════════════════════════════════════════════════════════
// src/render/outfit-sprite.js — AN OUTFIT DRAWN AT A WHOLE-NUMBER SCALE.
//
// The Character window's portrait and outfit preview draw the hero's style-1
// outfit sprite (the `hunt` atlas set, the same art the World draws) into a
// canvas at an integer scale with smoothing off (ART_DIRECTION §2). A facing
// is one of the art budget's FACINGS; the frame is the idle clip's.
//
// DYES: an outfit recolours only when its art set carries the region mask
// sprite `<sprite>_mask` (one mask frame per sprite frame; region i is mask
// colour MASK_COLOURS[i], src/data/outfits.js). Recolouring keeps each pixel's
// value and takes the dye's hue and saturation, so a dyed outfit keeps its
// shading. Until a mask ships, `hasMask` is false and the window offers no
// colour picker.
// ════════════════════════════════════════════════════════════════════════
import { loadAtlasSet } from '../world/atlas.js?v=0.2.13';
import { MASK_COLOURS } from '../data/outfits.js?v=0.2.13';

const SET = 'hunt';
let ART = null;

/** The `hunt` art set, loaded once: Promise<{manifest, image}> (rejects when it cannot load). */
export function outfitArt(doc, version) {
  if (!ART) ART = loadAtlasSet({ doc, version }, SET).catch((e) => { ART = null; throw e; });
  return ART;
}

/** Does this sprite have region masks in the art set? */
export function hasMask(art, sprite) {
  return !!(art && art.manifest && art.manifest.sprites && art.manifest.sprites[sprite + '_mask']);
}

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
function hueSat(r8, g8, b8) {
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, mx ? d / mx : 0, mx];
}
function hsv(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c, i = Math.floor(h / 60) % 6;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][i];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Recolour RGBA pixels in place by region. PURE over arrays.
 * @param {Uint8ClampedArray|number[]} px    the sprite's RGBA
 * @param {Uint8ClampedArray|number[]} mask  the mask's RGBA, same size
 * @param {(string|null)[]} dyes             per region index: '#rrggbb' or null (left as drawn)
 */
function recolourPixels(px, mask, dyes) {
  const targets = [];
  dyes.forEach((hex, i) => { if (hex && MASK_COLOURS[i]) targets.push({ key: MASK_COLOURS[i], hs: hueSat(...hexRgb(hex)) }); });
  if (!targets.length) return px;
  for (let i = 0; i < px.length; i += 4) {
    if (mask[i + 3] < 128 || px[i + 3] === 0) continue;
    let best = null, bd = 1e9;
    for (const t of targets) {
      const d = (mask[i] - t.key[0]) ** 2 + (mask[i + 1] - t.key[1]) ** 2 + (mask[i + 2] - t.key[2]) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    if (!best || bd > 120 * 120) continue;
    const v = Math.max(px[i], px[i + 1], px[i + 2]) / 255;
    const rgb = hsv(best.hs[0], best.hs[1], v * (0.4 + 0.6 * best.hs[2]));
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2];
  }
  return px;
}

/**
 * Draw one idle frame of `sprite` facing `dir` into `canvas` at `scale` (a whole number).
 * @param {HTMLCanvasElement} canvas
 * @param {{manifest: object, image: HTMLImageElement}} art
 * @param {string} sprite
 * @param {{dir?: string, scale?: number, dyes?: (string|null)[]}} [o]
 * @returns {boolean} false when the sprite or facing is not in the art set
 */
export function drawOutfit(canvas, art, sprite, o) {
  const opt = o || {};
  const row = art && art.manifest && art.manifest.sprites ? art.manifest.sprites[sprite] : null;
  const idle = row && row.anims && row.anims.idle;
  const dir = opt.dir || 's';
  const at = idle && idle.dirs && (idle.dirs[dir] || idle.dirs.s);
  if (!at || !at.length) return false;
  const scale = Math.max(1, Math.floor(opt.scale || 1));
  const [fw, fh] = row.frame;
  const [sx, sy] = at[0];
  if (canvas.width !== fw * scale) canvas.width = fw * scale;
  if (canvas.height !== fh * scale) canvas.height = fh * scale;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const dyes = Array.isArray(opt.dyes) ? opt.dyes : [];
  const maskRow = dyes.some(Boolean) && hasMask(art, sprite) ? art.manifest.sprites[sprite + '_mask'] : null;
  const mAt = maskRow && maskRow.anims && maskRow.anims.idle && (maskRow.anims.idle.dirs[dir] || maskRow.anims.idle.dirs.s);
  if (!mAt) { g.drawImage(art.image, sx, sy, fw, fh, 0, 0, fw * scale, fh * scale); return true; }
  /* Recolour at art size, then scale the result up by whole pixels. */
  const doc = canvas.ownerDocument;
  const tmp = doc.createElement('canvas');
  tmp.width = fw; tmp.height = fh;
  const t = tmp.getContext('2d', { willReadFrequently: true });
  t.drawImage(art.image, sx, sy, fw, fh, 0, 0, fw, fh);
  const pix = t.getImageData(0, 0, fw, fh);
  t.clearRect(0, 0, fw, fh);
  t.drawImage(art.image, mAt[0][0], mAt[0][1], fw, fh, 0, 0, fw, fh);
  const mask = t.getImageData(0, 0, fw, fh).data;
  recolourPixels(pix.data, mask, dyes);
  t.putImageData(pix, 0, 0);
  g.drawImage(tmp, 0, 0, fw, fh, 0, 0, fw * scale, fh * scale);
  return true;
}
