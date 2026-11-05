// tools/world-art/idle-clip.mjs — a generated v3 idle → the frames a shipped creature's source sheet takes.
// `node tools/world-art/port-pixellab.mjs idle` writes them; this is the part that decides the pixels.
//
// The clip starts from the creature's own still (PixelLab rotation, or a start frame passed as custom_start_frame_base64),
// so its frame 0 and the shipped still are one drawing. That fixes everything else:
//   register   the whole-pixel shift that lays frame 0 on the still (the port seated the still on the class anchor), used for
//              the whole clip: the model's own motion is kept, and nothing is moved per frame, which read as a skating body
//   colours    every generated pixel is snapped to a colour frame 0 uses, then given the colour that pixel wears in the still.
//              A v3 frame invents near-colours from frame to frame, so a body standing still shimmers without this; it also carries the
//              still's ramps and body lift (`material: native`) to the new frames with no second list of them
//   frame 0    is the still itself: the Bestiary's portrait, the atlas rect and the step from a walk are all unchanged
//   picking    v3 bills the same for 4 and for 8 frames at 64 px or less, so the clip is generated at 8 and the loop takes the two
//              frames that move most calmly from the still (idleFrames). A ping-pong's repeated frame shares its atlas rect (pack.mjs), so
//              a loop of 4 costs 2 new frames a facing
// Pure: the same input gives the same frames, so a re-port of a downloaded clip is byte-identical.
import { createImage, blit } from './png.mjs';
import { snapTo } from './lock.mjs';
import { ALPHA_CUT } from '../../src/data/world/palette.js';

const on = (im, x, y) => x >= 0 && y >= 0 && x < im.width && y < im.height && im.data[(y * im.width + x) * 4 + 3] >= ALPHA_CUT;
const hexAt = (im, i) => '#' + [0, 1, 2].map((k) => im.data[i + k].toString(16).padStart(2, '0')).join('');

/** The opaque box [x0, y0, x1, y1] of a frame. */
function boxOf(im) {
  let x0 = im.width, y0 = im.height, x1 = -1, y1 = -1;
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (on(im, x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

/* the shift is searched this far around the one that lays the two boxes' corners together */
const REGISTER_SLACK = 6;

/** The whole-pixel shift laying `img` on `still`: the largest overlap, misses subtracted. */
function registerOn(img, still) {
  const a = boxOf(img), b = boxOf(still);
  const cx = b[0] - a[0], cy = b[3] - a[3];
  let best = null;
  for (let dy = cy - REGISTER_SLACK; dy <= cy + REGISTER_SLACK; dy++) for (let dx = cx - REGISTER_SLACK; dx <= cx + REGISTER_SLACK; dx++) {
    let both = 0, miss = 0;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      if (!on(img, x, y)) continue;
      if (on(still, x + dx, y + dy)) both++; else miss++;
    }
    if (!best || both - miss > best.both - best.miss) best = { dx, dy, both, miss };
  }
  return best;
}

/**
 * A FLIER NEVER STANDS: hovering, it does what it does flying, so its idle is its own flight clip with the still as frame 0. Every
 * frame is one the atlas already holds (pack.mjs shares the rects), unless the still and the clip were seated apart, when the clip moves onto the still.
 * @param {object} still  the shipped still, on its frame
 * @param {object[]} flight  the facing's walk frames, as shipped
 */
export function flightIdle(still, flight) {
  const reg = registerOn(flight[0], still);
  const seated = flight.map((f) => {
    if (!reg.dx && !reg.dy) return f;
    const out = createImage(f.width, f.height);
    blit(out, f, 0, 0, f.width, f.height, reg.dx, reg.dy, true);
    return out;
  });
  const frames = [still, ...seated.slice(1)];
  const body = still.data.reduce((n, v, i) => n + (i % 4 === 3 && v >= ALPHA_CUT ? 1 : 0), 0);
  return { frames, audit: { picked: frames.map((_, i) => i), body, register: [reg.dx, reg.dy], missed: 0, feet: null, lifted: null,
    steps: frames.map((f, i) => { const c = changed(f, frames[(i + frames.length - 1) % frames.length]); return c.colour + c.mask; }) } };
}

/** Frame 0's colour → the colour its pixel wears in the still (the most common, when a lift split it). */
function colourMap(ref, still, reg) {
  const count = new Map();
  for (let y = 0; y < ref.height; y++) for (let x = 0; x < ref.width; x++) {
    if (!on(ref, x, y) || !on(still, x + reg.dx, y + reg.dy)) continue;
    const raw = hexAt(ref, (y * ref.width + x) * 4);
    if (!count.has(raw)) count.set(raw, new Map());
    const m = count.get(raw), s = hexAt(still, ((y + reg.dy) * still.width + x + reg.dx) * 4);
    m.set(s, (m.get(s) || 0) + 1);
  }
  const map = new Map();
  for (const [raw, m] of count) map.set(raw, [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]);
  return map;
}

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** One generated frame laid on the still's frame, in the still's own colours. Pixels the frame would push under `floorRow` move it up whole. */
function layFrame(img, still, reg, map, floorRow) {
  /* each colour of the frame is snapped once: a v3 frame has few, and a pixel at a time was minutes a creature */
  const seen = new Map();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] >= ALPHA_CUT) seen.set(hexAt(img, i), null);
  const list = createImage(seen.size || 1, 1);
  [...seen.keys()].forEach((h, k) => { list.data.set([...rgb(h), 255], k * 4); });
  const snapped = snapTo(list, [...map.keys()]);
  [...seen.keys()].forEach((h, k) => seen.set(h, rgb(map.get(hexAt(snapped, k * 4)))));
  const painted = createImage(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < ALPHA_CUT) continue;
    const [r, g, b] = seen.get(hexAt(img, i));
    painted.data[i] = r; painted.data[i + 1] = g; painted.data[i + 2] = b; painted.data[i + 3] = 255;
  }
  const out = createImage(still.width, still.height);
  blit(out, painted, 0, 0, painted.width, painted.height, reg.dx, reg.dy, true);
  const low = lowest(out);
  if (floorRow === null || low <= floorRow) return out;
  const up = createImage(still.width, still.height);
  blit(up, out, 0, 0, out.width, out.height, 0, floorRow - low, true);
  return up;
}

function lowest(img) {
  for (let y = img.height - 1; y >= 0; y--) for (let x = 0; x < img.width; x++) if (on(img, x, y)) return y;
  return -1;
}

/**
 * The body stays the still's. A v3 frame redraws every pixel, so a big furred body shimmers from frame to frame even where it does not move
 * (a boar's flank: 80% of its pixels a step). Only where the silhouette moves, and within EDGE_REACH of that, is the new drawing kept:
 * a tail, a wing, a flank swelling. Everything else is the still's own shading, so what the eye reads is the shape breathing.
 */
function holdBody(frame, still) {
  const w = frame.width, h = frame.height;
  const moved = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(frame, x, y) !== on(still, x, y)) moved[y * w + x] = 1;
  const near = (x, y) => {
    for (let dy = -EDGE_REACH; dy <= EDGE_REACH; dy++) for (let dx = -EDGE_REACH; dx <= EDGE_REACH; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && moved[Y * w + X]) return true;
    }
    return false;
  };
  const out = createImage(w, h);
  out.data.set(frame.data);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(frame, x, y) || !on(still, x, y) || near(x, y)) continue;
    const i = (y * w + x) * 4;
    out.data.set(still.data.subarray(i, i + 4), i);
  }
  return out;
}

/** Mask pixels two frames differ by in the rows [y0, y1]. */
function maskDiff(a, b, y0 = 0, y1 = a.height - 1) {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < a.width; x++) if (on(a, x, y) !== on(b, x, y)) n++;
  return n;
}

/** Pixels that change between two frames: { colour (both opaque), mask (one is empty) }. */
function changed(a, b) {
  let colour = 0, mask = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const A = a.data[i + 3] >= ALPHA_CUT, B = b.data[i + 3] >= ALPHA_CUT;
    if (A !== B) mask++;
    else if (A && (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2])) colour++;
  }
  return { colour, mask };
}

/* the rows of a ground unit that hold its feet: the anchor row and the three above it */
const FOOT_ROWS = 3;
/* a loop's far frame moves at least this many mask pixels from the still, or it is a still frame with shimmer */
const MIN_MOTION = 12;
/* and each of the loop's two steps moves this many, so no step is a held frame (a loop that only pops once) */
const MIN_STEP = 6;
/* one foot pixel out of place reads worse than this many pixels of a body's shading turning */
const FOOT_WEIGHT = 8;
/* a step moving more of the mask than this share of the body costs this much a pixel */
const POP_SHARE = 0.1, POP_WEIGHT = 2;
/* how far from a moving edge a frame's own pixels are kept (holdBody) */
const EDGE_REACH = 2;

/**
 * The frames a facing's idle takes: a ping-pong [still, a, b, a], so the loop always comes home without a pop, and b's pose is
 * only two steps from the still however far the model wandered.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} still  the shipped still, on its frame
 * @param {object[]} frames  the clip as generated, frames[0] the start frame
 * @param {number|null} floorRow  a ground unit's anchor row; null for a flier (it hovers, and its bob is its motion)
 */
export function idleFrames(still, frames, floorRow) {
  const reg = registerOn(frames[0], still);
  const map = colourMap(frames[0], still, reg);
  const laid = frames.map((f, i) => (i ? holdBody(layFrame(f, still, reg, map, floorRow), still) : still));
  const feet = (c) => (floorRow === null ? 0 : maskDiff(laid[c], still, floorRow - FOOT_ROWS, floorRow));
  /* what a step costs the eye: a colour turning inside a body that holds still is shimmer, and a foot leaving its place is a slide. The
     mask moving (a tail, a wing, a flank) is the motion we came for, and costs nothing until one step moves a good part of the body: a pop. */
  const shimmer = (x, y) => changed(laid[x], laid[y]).colour;
  const body = still.data.reduce((n, v, i) => n + (i % 4 === 3 && v >= ALPHA_CUT ? 1 : 0), 0);
  const pop = (x, y) => POP_WEIGHT * Math.max(0, maskDiff(laid[x], laid[y]) - POP_SHARE * body);
  const pick = (minStep) => {
    let best = null;
    for (let a = 1; a < laid.length; a++) for (let b = 1; b < laid.length; b++) {
      if (a === b || maskDiff(laid[b], still) < MIN_MOTION || maskDiff(laid[a], still) < minStep || maskDiff(laid[a], laid[b]) < minStep) continue;
      const cost = shimmer(0, a) + shimmer(a, b) + FOOT_WEIGHT * (feet(a) + feet(b)) + pop(0, a) + pop(a, b);
      if (!best || cost < best.cost) best = { a, b, cost };
    }
    return best;
  };
  const best = pick(MIN_STEP) || pick(0);
  if (!best) throw new Error('no frame of this clip moves ' + MIN_MOTION + ' px from the still');
  const picked = [0, best.a, best.b, best.a];
  const out = picked.map((c) => laid[c]);
  const audit = {
    picked, body, register: [reg.dx, reg.dy], missed: reg.miss,
    feet: floorRow === null ? null : out.map((f) => maskDiff(f, still, floorRow - FOOT_ROWS, floorRow)),
    lifted: floorRow === null ? null : out.map((f) => floorRow - lowest(f)),
    steps: out.map((f, i) => { const c = changed(f, out[(i + out.length - 1) % out.length]); return c.colour + c.mask; }),
  };
  return { frames: out, audit };
}
