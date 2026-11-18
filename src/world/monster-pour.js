// ════════════════════════════════════════════════════════════════════════
// src/world/monster-pour.js — MONSTERS IN A POUR, BAKED ONCE A KIND (lane/a-tower-art; the rule is src/world/pour.js).
//
// The Burning Tower draws every monster of its room charred (`char`) and its landing's Keeper burning (`keeper`): the scene names the
// pour on the unit (src/hunt-view/scene.js pourOf), compose.js carries it to the draw list, and the backend blits from the baked sheet.
// The machinery is hero-dye.js's, without masks: a kind's frames are copied once into a compact sheet, poured whole (pour.js reads the
// whole sprite so no frame differs from its neighbour), and kept as an ImageBitmap.
//
// THE COST, AND ITS BOUNDS. A floor stands five monsters of at most five kinds; a kind's sheet is its frames and nothing else (a
// 48x48 vermin with every clip: about 2 MB; the biggest brute about 6 MB). At most POUR_LOOKS baked sheets stay, least recently drawn
// out first, never one drawn in the last STALE_MS. At most one bake a frame (pump). A unit whose pour is not baked yet is NOT drawn
// that frame (canvas-backend.js source): never its unpoured colours for a flicker, and never a stub.
//
// PURE of globals: the document and the clock are handed in.
// ════════════════════════════════════════════════════════════════════════
import { pourPixels, POURS } from './pour.js?v=0.2.139';

/** How many baked kind-and-pour sheets stay in memory (a room is five, a landing's Keeper one more, the next room's while it stands). */
export const POUR_LOOKS = 12;
/** A sheet drawn this recently is never evicted. */
export const STALE_MS = 3000;
const COLS = 8;

/** Is `name` a pour the backend can bake? */
const isPour = (name) => typeof name === 'string' && Object.hasOwn(POURS, name);

/**
 * @param {{doc: Document, now?: () => number, cap?: number}} o
 */
export function createMonsterPour(o) {
  const now = o.now || (() => o.doc.defaultView.performance.now());
  const cap = o.cap || POUR_LOOKS;
  /* `<sprite>|<pour>` -> { img, w, h, cells, at } once baked */
  const looks = new Map();
  let queue = [];
  const queued = new Set();
  const stats = { bakes: 0, evicted: 0, refused: 0, bakeMs: 0, bakeMaxMs: 0 };
  const out = { img: null, sx: 0, sy: 0 };
  const free = (l) => { if (l.img && l.img.close) l.img.close(); else if (l.img) l.img.width = 0; l.img = null; };

  function bake(q) {
    const t0 = now();
    const { id, pour, row, image, k } = q;
    const [fw, fh] = row.frame;
    const cells = new Map();
    for (const clip of Object.values(row.anims)) for (const list of Object.values(clip.dirs)) for (const [sx, sy] of list) {
      const key = sx * 65536 + sy;
      if (!cells.has(key)) { const n = cells.size; cells.set(key, [(n % COLS) * fw, Math.floor(n / COLS) * fh]); }
    }
    const W = COLS * fw, H = Math.ceil(cells.size / COLS) * fh;
    const c = o.doc.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    for (const [key, [dx, dy]] of cells) g.drawImage(image, Math.floor(key / 65536), key % 65536, fw, fh, dx, dy, fw, fh);
    const data = g.getImageData(0, 0, W, H);
    pourPixels(data.data, pour);
    g.putImageData(data, 0, 0);
    /** @type {{img: HTMLCanvasElement|ImageBitmap|null, w: number, h: number, cells: Map<number, number[]>, at: number}} */
    const look = { img: c, w: W, h: H, cells, at: now() };
    looks.set(k, look);
    /* A BITMAP WHERE THE BROWSER HAS ONE: the canvas draws meanwhile, then gives its memory back. */
    const win = o.doc.defaultView;
    if (win && typeof win.createImageBitmap === 'function') {
      win.createImageBitmap(c).then((b) => { if (looks.get(k) === look) { look.img = b; c.width = c.height = 0; } else b.close(); }, () => {});
    }
    const ms = now() - t0;
    stats.bakes++; stats.bakeMs += ms; stats.bakeMaxMs = Math.max(stats.bakeMaxMs, ms);
  }

  function roomFor() {
    if (looks.size < cap) return true;
    const t = now();
    let oldest = null;
    for (const [k, l] of looks) if (t - l.at >= STALE_MS && (!oldest || l.at < looks.get(oldest).at)) oldest = k;
    if (!oldest) { stats.refused++; return false; }
    free(looks.get(oldest));
    looks.delete(oldest);
    stats.evicted++;
    return true;
  }

  return {
    /** This frame will draw sprite `id` in pour `pour` (`row`: its manifest row; `image`: its atlas, once arrived). */
    want(id, pour, row, image) {
      if (!isPour(pour) || !row || !image || !row.frame || !row.anims) return;
      const k = id + '|' + pour;
      const l = looks.get(k);
      if (l) { l.at = now(); return; }
      if (queued.has(k)) return;
      queued.add(k);
      queue.push({ id, pour, row, image, k });
    },
    /** Bake at most one wanted sheet. True when one landed: the next paint draws it. */
    pump() {
      if (!queue.length) return false;
      const q = queue.shift();
      queued.delete(q.k);
      if (looks.has(q.k) || !roomFor()) return false;
      bake(q);
      return true;
    },
    /** Is this pour baked? (A paint's signature reads it: a sheet landing changes the picture.) */
    has: (id, pour) => looks.has(id + '|' + pour),
    /** Where to blit this frame from, or null while it isn't baked (the unit is not drawn). Read the answer at once: it is reused. */
    source(id, pour, sx, sy) {
      const l = looks.get(id + '|' + pour);
      const c = l && l.img && l.cells.get(sx * 65536 + sy);
      if (!c) return null;
      out.img = l.img; out.sx = c[0]; out.sy = c[1];
      return out;
    },
    stats: () => {
      let bytes = 0;
      for (const l of looks.values()) bytes += l.w * l.h * 4;
      return { looks: looks.size, queued: queue.length, sheetBytes: bytes, ...stats };
    },
    destroy() { for (const l of looks.values()) free(l); looks.clear(); queue = []; queued.clear(); },
  };
}

/* ONE PER DOCUMENT: a World pane is remounted on every switch of the viewed character, and a baked kind stays good. */
const PAGES = new WeakMap();
export function monsterPourOf(o) {
  let p = PAGES.get(o.doc);
  if (!p) PAGES.set(o.doc, p = createMonsterPour(o));
  return p;
}
