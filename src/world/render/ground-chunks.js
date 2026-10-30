// ════════════════════════════════════════════════════════════════════════
// src/world/render/ground-chunks.js — THE GROUND, BAKED BY CHUNK, NEVER IN ONE LONG TASK.
//
// A map's ground (compose.js groundOf) is binned once into packed numbers per 16x16-tile chunk
// (voids x,y; tones name,x,y; tiles set,sx,sy,x,y), and a chunk is baked from its own cells onto a
// canvas of its own. Both are made in SLICES (perf lane 10-28: the town's bins were one 7-28 ms
// task, a chunk ~520 paint calls and a first view several chunks in one 30-110 ms frame):
//   prepare   bins a map in slices (compose.js sliced), kept per map until the backend drops it;
//   bake      bakes the listed chunks until a deadline, a chunk half-baked kept and resumed later;
//   get       the chunk a frame draws, finishing whatever is left of it in place.
// A chunk is drawn only once whole, and its calls run in the same order however it is sliced, so
// the pixels are the one-go bake's (tests/world-core.mjs W5).
// ════════════════════════════════════════════════════════════════════════
import { takeGround, groundOfSliced, sliced } from '../core/compose.js?v=0.2.70';

const NONE = Object.freeze({ voids: [], tones: [], tiles: [] });
const EMPTY = () => ({ cells: new Map(), names: [] });
/* paint calls between two looks at the clock */
const CHECK_EVERY = 16;
/* bin entries per step of a sliced prepare */
const BIN_STEP = 2048;

/* a chunk's key: one number per (cx, cy), the dual grid's -1 column included (never a string per tile) */
const chunkKey = (cx, cy) => cy * 65536 + cx;

/* the bins as STEPS (BIN_STEP entries each), the same bins however they are run */
function* binSteps(gr, T, CHUNK) {
  const cells = new Map(), names = [], nameAt = new Map();
  const name = (s) => { let i = nameAt.get(s); if (i === undefined) { i = names.length; names.push(s); nameAt.set(s, i); } return i; };
  /* a tone's name per material and parity, made once per map rather than once per cell */
  const toneAt = new Map();
  const toneName = (m, alt) => { const k = alt ? 'b' + m : 'a' + m; let i = toneAt.get(k); if (i === undefined) toneAt.set(k, i = name('ground-' + m + (alt ? '-b' : '-a'))); return i; };
  const into = (kind, t, a, b, c, d, e) => {
    for (let cy = Math.floor(t.y / CHUNK); cy * CHUNK < t.y + T; cy++) {
      for (let cx = Math.floor(t.x / CHUNK); cx * CHUNK < t.x + T; cx++) {
        const k = chunkKey(cx, cy);
        let bk = cells.get(k);
        if (!bk) cells.set(k, bk = { voids: [], tones: [], tiles: [] });
        const out = bk[kind];
        if (kind === 'voids') out.push(a, b);
        else if (kind === 'tones') out.push(a, b, c);
        else out.push(a, b, c, d, e);
      }
    }
  };
  let n = 0;
  for (const t of gr.voids) { into('voids', t, t.x, t.y); if (++n % BIN_STEP === 0) yield; }
  for (const t of gr.tones) { into('tones', t, toneName(t.m, t.alt), t.x, t.y); if (++n % BIN_STEP === 0) yield; }
  for (const t of gr.tiles) { into('tiles', t, name(t.set), t.sx, t.sy, t.x, t.y); if (++n % BIN_STEP === 0) yield; }
  for (const b of cells.values()) for (const kind of ['voids', 'tones', 'tiles']) b[kind] = Int32Array.from(b[kind]);
  return { cells, names };
}

/**
 * @param {{doc: Document, tone: (name: string) => string, now: () => number}} o
 */
export function createGroundChunks(o) {
  const { doc, tone, now } = o;
  /* the bins are KEPT per map, so the town shown again after a hunt never re-makes its ground inside a frame */
  const BINS = new WeakMap();   // map → { book, bins }
  let binned = EMPTY(), images = {}, T = 32, CHUNK = 512, keep = 24;
  let chunks = new Map();   // key → a whole chunk (LRU: oldest first)
  let jobs = new Map();     // key → a chunk half-baked

  function binsFor(m, a) {
    const kept = BINS.get(m);
    if (kept && kept.book === a.book) return kept.bins;
    const t = m.T || 32;
    const it = binSteps(takeGround(m, a.book, a.tables, t), t, 16 * t);
    let r = it.next();
    while (!r.done) r = it.next();
    BINS.set(m, { book: a.book, bins: r.value });
    return r.value;
  }
  function binsSliced(m, a, sl) {
    /* a frame that binned it meanwhile (setMap) wins: one set of bins per map, its ground made once */
    const kept = () => { const k = BINS.get(m); return k && k.book === a.book ? k.bins : null; };
    if (kept()) return Promise.resolve(kept());
    const t = m.T || 32;
    return groundOfSliced(m, a.book, a.tables, t, sl)
      .then(() => kept() || sliced(binSteps(takeGround(m, a.book, a.tables, t), t, 16 * t), sl, (bins) => {
        if (kept()) return kept();
        BINS.set(m, { book: a.book, bins });
        return bins;
      }));
  }

  function start(key, cx, cy) {
    const c = doc.createElement('canvas');
    c.width = CHUNK; c.height = CHUNK;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    /* placeholder tones (a town ahead of its ground art): one token per material and parity, read once per chunk */
    return { c, g, own: binned.cells.get(key) || NONE, x0: cx * CHUNK, y0: cy * CHUNK, phase: 0, i: 0, tones: new Map() };
  }
  /* a job's paint calls, in order, until `until` (now()); true once the chunk is whole */
  function run(j, until) {
    const { g, own, x0, y0 } = j;
    const timed = until !== Infinity;
    let n = 0;
    const spent = () => timed && ++n % CHECK_EVERY === 0 && now() >= until;
    if (j.phase === 0) {
      g.fillStyle = tone('void');
      for (const v = own.voids; j.i < v.length; j.i += 2) { if (spent()) return false; g.fillRect(v[j.i] - x0, v[j.i + 1] - y0, T, T); }
      j.phase = 1; j.i = 0;
    }
    if (j.phase === 1) {
      for (const t = own.tones; j.i < t.length; j.i += 3) {
        if (spent()) return false;
        const k = binned.names[t[j.i]];
        if (!j.tones.has(k)) j.tones.set(k, tone(k));
        g.fillStyle = j.tones.get(k);
        g.fillRect(t[j.i + 1] - x0, t[j.i + 2] - y0, T, T);
      }
      j.phase = 2; j.i = 0;
    }
    for (const t = own.tiles; j.i < t.length; j.i += 5) {
      if (spent()) return false;
      const img = images[binned.names[t[j.i]]];
      if (img) g.drawImage(img, t[j.i + 1], t[j.i + 2], T, T, t[j.i + 3] - x0, t[j.i + 4] - y0, T, T);
    }
    return true;
  }
  function store(key, c) {
    if (chunks.size >= keep) chunks.delete(chunks.keys().next().value);
    chunks.set(key, c);
  }

  return {
    /** Draw map `m`'s ground from now on, with `art` ({book, tables, images}); every chunk is baked again. */
    use(m, art) {
      T = m.T || 32; CHUNK = 16 * T;
      binned = binsFor(m, art);
      images = art.images || {};
      chunks = new Map(); jobs = new Map();
    },
    /** Bin map `m` ahead of its first frame: at once, or in slices (`sl`, compose.js sliced) → a promise. */
    prepare(m, art, sl) { return sl ? binsSliced(m, art, sl) : binsFor(m, art); },
    /** Chunks kept (LRU), at least `n`. */
    fit(n) { keep = n; },
    /** Whether every [cx, cy] of `list` is baked whole. */
    whole(list) { return list.every(([cx, cy]) => chunks.has(chunkKey(cx, cy))); },
    /** The whole chunk (cx, cy) for a frame: kept, or baked (the rest of it) here. */
    get(cx, cy) {
      const key = chunkKey(cx, cy);
      let c = chunks.get(key);
      if (c) { chunks.delete(key); chunks.set(key, c); return c; }
      const j = jobs.get(key) || start(key, cx, cy);
      run(j, Infinity);
      jobs.delete(key);
      store(key, j.c);
      return j.c;
    },
    /** Bake every [cx, cy] of `list` not yet whole until now() reaches `until`: true once all of them are. */
    bake(list, until) {
      for (const [cx, cy] of list) {
        const key = chunkKey(cx, cy);
        if (chunks.has(key)) continue;
        let j = jobs.get(key);
        if (!j) jobs.set(key, j = start(key, cx, cy));
        if (!run(j, until)) return false;
        jobs.delete(key);
        store(key, j.c);
      }
      return true;
    },
    clear() { chunks = new Map(); jobs = new Map(); binned = EMPTY(); images = {}; },
  };
}
