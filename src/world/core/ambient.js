// ════════════════════════════════════════════════════════════════════════
// src/world/core/ambient.js — A MAP'S LIFE: SMOKE, SPARKS AND DAYLIGHT ON THE WATER (display only).
//
// map-compile.js lays it once per map (lifeOf -> map.life) and compose.js draws it every frame
// (lifeDraws). Nothing here reads a server value, spends, gates or blocks a step; the same map always
// lays the same life, so every client draws the same town. The one tint, the Great Hearth's smoke under
// the flame the server names, is handed in (lifeDraws `tint`, src/world/hearth-burn.js).
//   EMITTERS  a placed sprite's own points (src/data/world/ambient-life.js): a chimney's mouth in the
//             sprite's pixels, placed by the rule compose.js places the sprite by, so a home's smoke rises
//             from its chimney wherever it stands
//   SURFACES  a material that moves and catches the light, on a map whose row names it (`life: ['water']`): ripples on
//             every open cell of it, in step (the surface slides as one sheet), and a glint on
//             about one cell in `every`, by a seeded hash, only where the cell and its eight neighbours are
//             that material (never on a bank's blend), never under anything placed over it (a bridge's
//             deck), never two touching, at a jittered pixel inside its cell
// Each loop starts at its own frame (`phase`, a hash), so the chimneys never puff in step and the water
// never flashes as one; every clip turns on one beat (LIFE_BEAT_FPS), so a frame where several turn is
// one paint. The art's layer picks where it is drawn (lifeDraws).
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { EMITTERS, SURFACES, GLANCES, SWAYS, BUMP, LIFE_BEAT_FPS } from '../../data/world/ambient-life.js?v=0.2.140';

/** An integer hash of three numbers (the same on every client). */
function lifeHash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Where a placed object's frame lands, art px (compose.js frameBox's rule for a standing sprite). */
const frameAt = (o, s, T) => [o.x * T + Math.floor((o.fw * T) / 2) - s.anchor[0], o.y * T + o.fh * T - 1 - s.anchor[1]];

/**
 * The map's life, laid once.
 * @param {{life?: string[]}} row  the map row
 * @param {{id: string, x: number, y: number, fw: number, fh: number}[]} objects  compiled objects
 * @param {string[]} ground  material id per cell
 * @param {object} sprites  manifest sprite records by id
 * @param {number} w @param {number} h @param {number} T
 * @returns {{id: string, px: number, py: number, phase: number}[]}  px, py: the clip's anchor, art px
 */
export function lifeOf(row, objects, ground, sprites, w, h, T) {
  const out = [];
  for (const o of objects) {
    const list = EMITTERS[o.id], s = sprites[o.id];
    if (!list || !s || !s.anchor) continue;
    const [bx, by] = frameAt(o, s, T);
    list.forEach((e, k) => out.push({ id: e.clip, px: bx + e.at[0], py: by + e.at[1], phase: lifeHash(o.x, o.y, k + 1) }));
  }
  const names = (row.life || []).filter((n) => SURFACES[n]);
  if (!names.length) return out;
  /* the cells something placed is drawn over (a bridge, a pier's piles, a tree's crown) */
  const covered = new Uint8Array(w * h);
  for (const o of objects) {
    const s = sprites[o.id];
    if (!s || !s.anchor || !s.frame) continue;
    const [bx, by] = frameAt(o, s, T);
    for (let y = Math.max(0, Math.floor(by / T)); y <= Math.min(h - 1, Math.floor((by + s.frame[1] - 1) / T)); y++) {
      for (let x = Math.max(0, Math.floor(bx / T)); x <= Math.min(w - 1, Math.floor((bx + s.frame[0] - 1) / T)); x++) covered[y * w + x] = 1;
    }
  }
  for (const name of names) {
    const sf = SURFACES[name];
    const taken = new Uint8Array(w * h);
    const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && ground[y * w + x] === name;
    /* a cell of open water: it and its eight neighbours that material, nothing placed over it */
    const inner = (x, y) => !covered[y * w + x] && [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => open(x + dx, y + dy)));
    const rippled = new Uint8Array(w * h);
    const blockOpen = (x, y, k) => { for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (rippled[(y + j) * w + x + i] || !inner(x + i, y + j)) return false; return true; };
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const r = lifeHash(x, y, sf.seed);
        if (covered[y * w + x]) continue;
        let inner = true;
        for (let dy = -1; dy <= 1 && inner; dy++) for (let dx = -1; dx <= 1 && inner; dx++) inner = open(x + dx, y + dy);
        if (!inner) continue;
        /* the ripples: every open cell once, all in step (phase 0), so the surface slides as one sheet; a block of open cells
           takes the biggest tile that fits (the open sea in a quarter of the draws) */
        if (sf.flows && !rippled[y * w + x]) {
          const [id, n] = sf.flows.find(([, k]) => blockOpen(x, y, k)) || [];
          if (id) { for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) rippled[(y + j) * w + x + i] = 1; out.push({ id, px: x * T, py: y * T, phase: 0 }); }
        }
        if (r % sf.every !== 0) continue;
        let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) ok = !taken[(y + dy) * w + x + dx];
        if (!ok) continue;
        taken[y * w + x] = 1;
        const q = lifeHash(y, x, sf.seed);
        out.push({ id: sf.clips[q % sf.clips.length], px: x * T + 6 + ((q >>> 8) % (T - 12)), py: y * T + 6 + ((q >>> 16) % (T - 12)), phase: q >>> 24 });
      }
    }
  }
  return out;
}

/* WHERE A LOOP SITS IN THE FRAME, by its art's layer: water light on the ground among the standing things but under all of
   them (its row far below any contact row; nothing stands on open water, so nothing it could cover is ever near it); smoke
   and sparks in the air, last of the raised layer, over every roof and stack. Both are drawn before the light, so the day
   and the vignette fall on them as on the world, and both are named for the first view only where it SEES them (an effect
   is named wherever compose drew it, the overscan included: sparks there held a phone's first town view for their sheet,
   tests/client-boot.mjs B-21). */
const GROUND_ROW = -(1 << 22), AIR_ROW = 1 << 22;
/* the life of a map, banded by row so a frame reads only the bands its view crosses (a town has hundreds of glints) */
const BAND = 256;
const bandsOf = new WeakMap();
function bands(life, book) {
  let b = bandsOf.get(life);
  if (b) return b;
  b = { by: new Map(), pad: 0 };
  for (const a of life) {
    const k = Math.floor(a.py / BAND);
    if (!b.by.has(k)) b.by.set(k, []);
    b.by.get(k).push(a);
    const s = book.sprite(a.id);
    if (s.frame) b.pad = Math.max(b.pad, s.frame[0], s.frame[1]);
  }
  bandsOf.set(life, b);
  return b;
}

/**
 * The life in view this frame, as draw-list entries: `ground` (to the standing list), `air` (to the raised list). Each loop
 * turns on its clip's fps from its own `phase`.
 * @param {{life?: object[]}} map  compiled map
 * @param {object} book  the atlas book
 * @param {number} t  ms (the state's clock)
 * @param {{ox: number, oy: number, w: number, h: number}} view
 * @param {number} T
 * @param {{pour: Object<string, string>|null, puffs: {id: string, px: number, py: number, age: number, pour: string}[]}|null} [tint]
 *   THE HEARTH'S MOOD (src/world/hearth-burn.js, from the server's flame): `pour` draws a clip of the map's life in a pour
 *   (src/world/pour.js; the backend bakes it), `puffs` are more of a clip for a moment, each from its first frame at `age` ms
 */
export function lifeDraws(map, book, t, view, T, tint) {
  const ground = [], air = [];
  if (!map.life || !map.life.length) return { ground, air };
  const b = bands(map.life, book);
  const pourOf = (tint && tint.pour) || null;
  for (let k = Math.floor((view.oy - b.pad - 2 * T) / BAND); k <= Math.floor((view.oy + view.h + b.pad + 2 * T) / BAND); k++) {
    for (const a of b.by.get(k) || []) {
      const s = book.sprite(a.id);
      const clip = s.anims && s.anims.idle;
      if (!clip || !clip.fps || !s.frame) continue;
      const x = a.px - s.anchor[0], y = a.py - s.anchor[1];
      /* kept as compose.js keeps the standing and the raised (two tiles round the view, its `near`): every loop turns on
         the one beat, so one just off the view adds no paint */
      const m = 2 * T;
      if (!(x < view.ox + view.w + m && y < view.oy + view.h + m && x + s.frame[0] > view.ox - m && y + s.frame[1] > view.oy - m)) continue;
      const n = book.frames(a.id, 'idle', 's');
      lay(a, s, x, y, (Math.floor((Math.max(0, t) * clip.fps) / 1000) + a.phase) % n, pourOf && pourOf[a.id]);
    }
  }
  /* A PUFF: its clip from its first frame, on the clip's beat, in its pour; gone off the view like any loop */
  for (const p of (tint && tint.puffs) || []) {
    const s = book.sprite(p.id);
    const clip = s.anims && s.anims.idle;
    if (!clip || !clip.fps || !s.frame) continue;
    const x = p.px - s.anchor[0], y = p.py - s.anchor[1];
    if (!(x < view.ox + view.w && y < view.oy + view.h && x + s.frame[0] > view.ox && y + s.frame[1] > view.oy)) continue;
    lay(p, s, x, y, Math.floor((Math.max(0, p.age) * clip.fps) / 1000) % book.frames(p.id, 'idle', 's'), p.pour);
  }
  return { ground, air };

  /** One loop's draw entry (frame `i`, in `pour` when named), to the ground or the air by its art's layer. */
  function lay(a, s, x, y, i, pour) {
    const f = book.frame(a.id, 'idle', 's', i);
    /** @type {{[k: string]: any}} */
    const d = { id: a.id, set: f.set, sx: f.sx, sy: f.sy, w: f.w, h: f.h, x, y, alpha: 1, kind: 'life', cls: s.class, tx: Math.floor(a.px / T), ty: Math.floor(a.py / T), ref: null };
    if (pour) d.pour = pour;
    if (s.layer === 'decal') ground.push(Object.assign(d, { row: GROUND_ROW + a.py }));
    else air.push(Object.assign(d, { row: AIR_ROW + a.py }));
  }
}

/**
 * Which way a standing keeper placed at (x, y) faces at time t: its GLANCES faces in turn, each held holdMs, from its own
 * place in the round (a hash of where it stands, in whole beats, so every turn falls on the beat); s for anyone else.
 * @param {string} id @param {number} x @param {number} y @param {number} t ms
 */
export function glanceOf(id, x, y, t) {
  const g = GLANCES[id];
  if (!g) return 's';
  const beat = 1000 / LIFE_BEAT_FPS;
  const start = (lifeHash(x, y, 7) % 64) * beat;
  return g.faces[Math.floor((Math.max(0, t) + start) / g.holdMs) % g.faces.length];
}

/**
 * A viewer's own bump seed: a stable hash of who is watching (the hero's name), so two players' chests never jolt together and one
 * page's never jumps about; null with no viewer (no bump). The world draws no randomness of its own (tests/world-no-authority W-CALL).
 * @param {string|null|undefined} key
 * @returns {number|null}
 */
export function bumpSeedOf(key) {
  if (typeof key !== 'string' || !key) return null;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) & 0x7fffffff;
}

/**
 * A BUMP (ambient-life.js BUMP: the Hearth Chest jolting as if something inside wants out): at time t the frame of a loop's `bump` clip
 * to draw in place of its idle frame, or -1. A bump plays from the start of one idle loop in each block of BUMP.block loops (which one
 * hashed from the block and `seed`, the page's own), its clip standing for that loop's first `nb` frames. No seed, no bump.
 * @param {number} t ms @param {number} fps the idle clip's @param {number} n its frames @param {number} nb the bump clip's @param {number|null} seed
 */
export function bumpAt(t, fps, n, nb, seed) {
  if (!Number.isInteger(seed) || !nb || !n || !fps) return -1;
  const step = Math.floor((Math.max(0, t) * fps) / 1000), loop = Math.floor(step / n), f = step % n;
  const block = Math.floor(loop / BUMP.block);
  return f < nb && loop - block * BUMP.block === lifeHash(block, seed, 13) % BUMP.slots ? f : -1;
}

/**
 * The twin a placed sprite is drawn as while its cloth moves (SWAYS), and the frame it shows at time t from its own place in the loop;
 * null for anyone else, or when the atlas lacks the twin (the original is drawn, never a stub).
 * @param {object} book @param {string} id @param {number} x @param {number} y @param {number} t ms
 * @returns {{id: string, i: number}|null}
 */
export function swayOf(book, id, x, y, t) {
  const twin = SWAYS[id];
  if (!twin || !book.has(twin)) return null;
  const clip = book.sprite(twin).anims.idle;
  const n = book.frames(twin, 'idle', 's');
  return { id: twin, i: (Math.floor((Math.max(0, t) * clip.fps) / 1000) + (lifeHash(x, y, 11) % n)) % n };
}
