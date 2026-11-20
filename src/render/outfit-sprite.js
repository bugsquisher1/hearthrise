// ════════════════════════════════════════════════════════════════════════
// src/render/outfit-sprite.js — AN OUTFIT DRAWN AT A WHOLE-NUMBER SCALE.
//
// The Character window's portrait and outfit preview draw the hero's style-1
// outfit sprite (a hero set: src/data/world/atlas-sets.js HERO_SETS, `heroes`
// and, since it is full, `factionwear`, a worn set fetched only for a sprite
// drawn from it; the same art the World draws) into a
// canvas at an integer scale with smoothing off (ART_DIRECTION §2). A facing
// is one of the art budget's FACINGS; the frame is the idle clip's.
//
// DYES: an outfit recolours only when its sprite has a mask in its set's mask set
// (`<sprite>_mask` in `hunt-masks` or `factionwear-masks`, region BASE_REGIONS[i] keyed MASK_COLOURS[i],
// src/data/outfits.js; the druid has none). The recolour is the World's own
// (src/world/hero-dye.js recolourPixels): a try-on shows exactly what a save will draw.
// ════════════════════════════════════════════════════════════════════════
import { loadAtlasSet } from '../world/atlas.js?v=0.2.142';
import { recolourPixels, loadMasks } from '../world/hero-dye.js?v=0.2.142';
import { heroSetsFor } from '../data/world/atlas-sets.js?v=0.2.142';

/* every hero set asked for on this page: hero set -> Promise<{ manifest, image }> */
const ART = new Map();

/* THE FIGURE: the part of a 64 px hero frame a portrait shows, [x, y, w, h] (lane/b-ui-character 2026-11-18). Every style-1
   outfit's idle, in every facing, stands inside x 15..53, y 17..58 (anchor 32,58; a sword held out to the east), so this 42 x 45
   box holds the whole hero, the one facing a portrait shows (s, x 15..51) a px off its middle, and the empty px round it are never
   drawn at twice their size. tests/character-window.mjs CW-10 proves no outfit paints outside it. */
export const FIGURE = Object.freeze([13, 15, 42, 45]);

/** The hero sets drawing `sprites` takes (src/data/world/atlas-sets.js heroSetsFor: every set a first open has, and a worn set, the
    faction looks', only for a sprite drawn from it), each loaded once a page: Promise<{ sets: [{manifest, image}] }>, the sets that loaded
    (a sprite in a set that failed draws nothing); rejects when none loads. */
export function outfitArt(doc, version, sprites) {
  return Promise.allSettled(heroSetsFor(sprites).map((set) => {
    if (!ART.has(set)) {
      const p = loadAtlasSet({ doc, version }, set);
      ART.set(set, p);
      /* a set that failed is asked for again next time; the sets that came draw now */
      p.catch(() => { if (ART.get(set) === p) ART.delete(set); });
    }
    return ART.get(set);
  })).then((all) => {
    /* each result narrowed by its status: the sets that came, and why the others did not */
    const sets = [], why = [];
    for (const r of all) { if (r.status === 'fulfilled') sets.push(r.value); else why.push(r.reason); }
    if (!sets.length) throw why[0] || new Error('no hero set loaded');
    return { sets };
  });
}

/** The masks dyeing `sprites`, each set loaded once on first need: Promise<{ sets: [{manifest, image}] }> (rejects when none loads: the
    outfit draws as it is). (doc, version, sprites) */
export const outfitMasks = loadMasks;

/* the sets of an art or masks answer: { sets } (outfitArt, loadMasks), or one atlas { manifest, image } */
const setsOf = (a) => (!a ? [] : Array.isArray(a.sets) ? a.sets : [a]);

/**
 * Draw one idle frame of `sprite` facing `dir` into `canvas` at `scale` (a whole number).
 * @param {HTMLCanvasElement} canvas
 * @param {{sets: {manifest: object, image: HTMLImageElement}[]}|{manifest: object, image: HTMLImageElement}} art  outfitArt's answer (or one atlas)
 * @param {string} sprite
 * @param {{dir?: string, scale?: number, dyes?: (string|null)[], masks?: object|null, crop?: readonly number[]}} [o]
 *   dyes: per BASE_REGIONS index, a colour or null; masks: outfitMasks' answer, when it has landed;
 *   crop: [x, y, w, h] of the frame to draw (FIGURE for a portrait), else the whole frame
 * @returns {boolean} false when the sprite or facing is not in the art set
 */
export function drawOutfit(canvas, art, sprite, o) {
  const opt = o || {};
  const set = setsOf(art).find((a) => a && a.manifest && a.manifest.sprites && a.manifest.sprites[sprite]);
  const row = set ? set.manifest.sprites[sprite] : null;
  const idle = row && row.anims && row.anims.idle;
  const dir = opt.dir || 's';
  const at = idle && idle.dirs && (idle.dirs[dir] || idle.dirs.s);
  if (!at || !at.length) return false;
  const scale = Math.max(1, Math.floor(opt.scale || 1));
  const [fw, fh] = row.frame;
  const [sx, sy] = at[0];
  const [cx, cy, cw, ch] = Array.isArray(opt.crop) && opt.crop.length === 4 ? opt.crop : [0, 0, fw, fh];
  if (canvas.width !== cw * scale) canvas.width = cw * scale;
  if (canvas.height !== ch * scale) canvas.height = ch * scale;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const dyes = Array.isArray(opt.dyes) ? opt.dyes : [];
  /* the mask set that masks this sprite (each hero set has its own) */
  const masks = dyes.some(Boolean) ? setsOf(opt.masks).find((a) => a && a.manifest && a.manifest.sprites && a.manifest.sprites[sprite + '_mask']) || null : null;
  const maskRow = masks ? masks.manifest.sprites[sprite + '_mask'] : null;
  const mAt = maskRow && maskRow.anims && maskRow.anims.idle && (maskRow.anims.idle.dirs[dir] || maskRow.anims.idle.dirs.s);
  if (!mAt) { g.drawImage(set.image, sx + cx, sy + cy, cw, ch, 0, 0, cw * scale, ch * scale); return true; }
  /* Recolour at art size, then scale the result up by whole pixels. */
  const doc = canvas.ownerDocument;
  const tmp = doc.createElement('canvas');
  tmp.width = fw; tmp.height = fh;
  const t = tmp.getContext('2d', { willReadFrequently: true });
  t.drawImage(set.image, sx, sy, fw, fh, 0, 0, fw, fh);
  const pix = t.getImageData(0, 0, fw, fh);
  t.clearRect(0, 0, fw, fh);
  t.drawImage(masks.image, mAt[0][0], mAt[0][1], fw, fh, 0, 0, fw, fh);
  const mask = t.getImageData(0, 0, fw, fh).data;
  recolourPixels(pix.data, mask, dyes);
  t.putImageData(pix, 0, 0);
  g.drawImage(tmp, cx, cy, cw, ch, 0, 0, cw * scale, ch * scale);
  return true;
}
