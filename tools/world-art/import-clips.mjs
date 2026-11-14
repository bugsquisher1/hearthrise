#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/import-clips.mjs — REVIEWED CLIP FRAMES INTO THE SHIPPED SHEETS (lane/a-hunt-clips, 2026-11-10).
//
//   node tools/world-art/import-clips.mjs            write every row of hunt-clips.mjs and barrow-clips.mjs into art/world/<set>/<id>.{png,json}
//   node tools/world-art/import-clips.mjs --check    exit 1 when a committed sheet or sidecar is not what a re-run writes
//   node tools/world-art/import-clips.mjs --id rat   one sprite (with --check too)
// Then node tools/world-art/build.mjs (the atlases) and, for the heroes, tools/world-art/outfit-masks.mjs.
//
// Per facing of a clip (hunt-clips.mjs names the raw frames, the rotation they were drawn from and the lay):
//   colour    a `material: native` body (a hue that is its identity) takes the treatment its shipped clips took at the
//             port (port-pixellab.mjs unit --ramps/--lift, read from its notes): snapTo those ramps, then liftBody.
//             Any other body keeps its raw colours: build.mjs grades and locks every frame as it locks the rest.
//   register  the rotation is laid on the shipped idle frame 0 of the facing by the whole-pixel shift with the most
//             overlap (misses subtracted), so the clip starts on the drawing the unit stands in; every frame takes it.
//             A mirrored facing flips the source facing's frames and registers the flipped rotation on its own still.
//   seat      a fall's last frame lies on the anchor row: a corpse floating above it steps down to it by whole pixels
//             (frame i by round(gap x i / (n-1)), the generator's own seat rule), never lifted; a frame that would
//             reach below the anchor row moves up whole (validate.mjs [below-anchor]). A swing or flinch of a ground
//             unit has any frame standing more than 3 px above the row planted on it (port-pixellab.mjs SEAT_PX).
//   corpse    every death facing gets a corpse frame: its fall's last frame, held.
// The sheet keeps every row it had (idle, walk, the shipped clips) and the rows are rewritten in the sidecar's anim order.
// Re-running is a no-op: a facing it writes is recomputed from its sources, so --check is the drift guard.
// Exit 0 green · 1 drift or a missing source · 2 harness error.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit, crop, flipX, pixelHash } from './png.mjs';
import { snapTo, liftBody } from './lock.mjs';
import { RAMPS } from './palette.mjs';
import { CLASSES, FACINGS } from '../../src/data/world/art-budget.js';
import { ALPHA_CUT } from '../../src/data/world/palette.js';
import { ROOT, ART_DIR } from './build.mjs';
import { plant } from './port-hunt-sim.mjs';
import { measureFrame } from './measure.mjs';
import { HUNT_CLIPS } from './hunt-clips.mjs';
import { BARROW_CLIPS } from './barrow-clips.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const SEAT_PX = 3;          // port-pixellab.mjs: a swing frame may stand this far above the anchor
/* the line derive-combat.mjs left on the seven it scripted: its clips are gone once drawn ones replace them */
const DERIVED_NOTE = ' attack, death and corpse derived from this unit\'s own idle frames by tools/world-art/derive-combat.mjs (whole-pixel shifts, quarter turns, flips; no drawn death exists).';
const SLACK = 8;            // the registration searches this far round the boxes' corners
const FALL_HOP_PX = 4;      // validate.mjs [feet]: a ground unit's frame (not its still) may stand this far above the anchor
const on = (im, x, y) => x >= 0 && y >= 0 && x < im.width && y < im.height && im.data[(y * im.width + x) * 4 + 3] >= ALPHA_CUT;
const load = (rel) => decodePNG(readFileSync(join(ROOT, rel)));

/** A clip dir's frames in order (0.png…, frame_000.png… or f00.png…). */
function framesIn(rel) {
  const dir = join(ROOT, rel);
  if (!existsSync(dir)) throw Object.assign(new Error('missing source ' + rel), { missing: true });
  return readdirSync(dir).filter((f) => /^(frame_|f)?\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])).map((f) => load(rel + '/' + f));
}

function box(im) {
  let x0 = im.width, y0 = im.height, x1 = -1, y1 = -1;
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (on(im, x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}
const lowest = (im) => { const b = box(im); return b ? b[3] : -1; };

/** The whole-pixel shift laying `img` (any size) on `still` (the frame): the most overlap, misses subtracted. */
function register(img, still) {
  const a = box(img), b = box(still);
  if (!a || !b) return { dx: 0, dy: 0, score: 0 };
  const cx = Math.round((b[0] + b[2] - a[0] - a[2]) / 2), cy = b[3] - a[3];
  let best = null;
  for (let dy = cy - SLACK; dy <= cy + SLACK; dy++) for (let dx = cx - SLACK; dx <= cx + SLACK; dx++) {
    let score = 0;
    for (let y = a[1]; y <= a[3]; y++) for (let x = a[0]; x <= a[2]; x++) if (on(img, x, y)) score += on(still, x + dx, y + dy) ? 1 : -1;
    if (!best || score > best.score || (score === best.score && Math.abs(dx - cx) + Math.abs(dy - cy) < Math.abs(best.dx - cx) + Math.abs(best.dy - cy))) best = { dx, dy, score };
  }
  return best;
}

/** `img` drawn on a fw x fh frame at (dx, dy); the opaque pixels that fall outside are counted. */
function place(img, fw, fh, dx, dy) {
  const out = createImage(fw, fh);
  let lost = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (on(img, x, y) && !(x + dx >= 0 && y + dy >= 0 && x + dx < fw && y + dy < fh)) lost++;
  blit(out, img, 0, 0, img.width, img.height, dx, dy);
  return { img: out, lost };
}
const shift = (img, dy) => { const out = createImage(img.width, img.height); blit(out, img, 0, 0, img.width, img.height, 0, dy); return out; };

/** The colour treatment a native body's shipped clips took (port-pixellab.mjs unit --ramps/--lift, as its notes say). */
function treatmentOf(sc) {
  if (sc.material !== 'native') return (im) => im;
  const m = /Snapped to the ([a-z, ]+) ramps/.exec(sc.notes || '');
  if (!m) throw new Error(sc.id + ': a native body whose notes name no ramps');
  const colours = m[1].split(', ').flatMap((n) => { if (!RAMPS[n]) throw new Error(sc.id + ': no ramp ' + n); return RAMPS[n]; });
  const lift = Number((/lifted (\d+) ramp step/.exec(sc.notes || '') || [, 0])[1]);
  return (im) => { const s = snapTo(im, colours); return lift ? liftBody(s, lift) : s; };
}

/** Every row of a sprite's sheet, by clip and facing: { idle: { s: [img…] }, … }. */
function rowsOf(sc, sheet, fw, fh) {
  const out = {};
  let r = 0;
  for (const a of sc.anims) {
    out[a.name] = {};
    for (const d of FACINGS) {
      const n = a.dirs[d];
      if (!n) continue;
      out[a.name][d] = Array.from({ length: n }, (_, i) => crop(sheet, i * fw, r * fh, fw, fh));
      r++;
    }
  }
  return out;
}

/** One sprite: its sidecar and sheet with every clip of `row` written in. */
export function importSprite(row, sc0, sheet0) {
  const sc = JSON.parse(JSON.stringify(sc0));
  const cls = CLASSES[sc.class];
  if (!cls || !cls.frame) throw new Error(row.id + ': ' + sc.class + ' is not a unit class');
  const [fw, fh] = cls.frame, ay = sc.anchor_px[1], ground = cls.contact === 'unit';
  const tint = treatmentOf(sc);
  const rows = rowsOf(sc, sheet0, fw, fh);
  const report = [];
  for (const [name, clip] of Object.entries(row.clips)) {
    const made = {};
    const laid = (src, d) => {
      const raw = framesIn(src.dir).map(tint);
      const order = src.lay || raw.map((_, i) => i);
      if (order.some((i) => !raw[i])) throw new Error(`${row.id} ${name}/${d}: lay ${order} reaches past the ${raw.length} frames of ${src.dir}`);
      const still = src.still ? tint(load(src.still)) : raw[0];
      return { frames: order.map((i) => raw[i]), still };
    };
    const target = (d) => { const idle = rows.idle && rows.idle[d]; if (!idle) throw new Error(`${row.id}: no idle ${d} to lay ${name} on`); return idle[0]; };
    const put = (frames, still, d) => {
      const reg = register(still, target(d));
      let lost = 0;
      let out = frames.map((f) => { const p = place(f, fw, fh, reg.dx, reg.dy); lost += p.lost; return p.img; });
      if (name === 'death') {
        const gap = ay - lowest(out[out.length - 1]);
        if (gap > 0) out = out.map((f, i) => shift(f, Math.round((gap * i) / Math.max(1, out.length - 1))));
      }
      if (ground && name !== 'death') out = out.map((f) => plant(f, ay, SEAT_PX));
      /* a fall that hops (a spider flipping over) keeps its hop, cut to the 4 px a ground unit's frame may stand up (validate.mjs [feet]) */
      if (ground && name === 'death') out = out.map((f) => { const m = measureFrame(f); return !m.empty && m.foot < ay - FALL_HOP_PX ? shift(f, ay - FALL_HOP_PX - m.foot) : f; });
      out = out.map((f) => { const low = lowest(f); return low > ay ? shift(f, ay - low) : f; });
      report.push(`${name}/${d} reg ${reg.dx},${reg.dy} (${reg.score})${lost ? ' LOST ' + lost + ' px' : ''}`);
      return out;
    };
    for (const d of FACINGS) {
      const src = clip.dirs[d];
      if (!src || src.mirror) continue;
      const { frames, still } = laid(src, d);
      made[d] = put(frames, still, d);
    }
    for (const d of FACINGS) {
      const src = clip.dirs[d];
      if (!src || !src.mirror) continue;
      const from = clip.dirs[src.mirror];
      if (!from || from.mirror) throw new Error(`${row.id} ${name}/${d}: mirrors ${src.mirror}, which is not drawn`);
      const { frames, still } = laid(from, src.mirror);
      made[d] = put(frames.map(flipX), flipX(still), d);
    }
    rows[name] = clip.replace ? made : Object.assign(rows[name] || {}, made);
    let a = sc.anims.find((x) => x.name === name);
    if (!a) {
      /* a new clip goes before the corpse (a fall's partner) or last */
      a = { name, fps: clip.fps, loop: false };
      const at = sc.anims.findIndex((x) => x.name === 'corpse');
      if (at >= 0) sc.anims.splice(at, 0, a); else sc.anims.push(a);
    }
    a.fps = clip.fps;
    a.loop = false;
    if (clip.hit !== undefined) a.hit = clip.hit;
    a.dirs = Object.fromEntries(FACINGS.filter((d) => rows[name][d]).map((d) => [d, rows[name][d].length]));
  }
  /* every fall facing lies as its corpse: the fall's last frame, held */
  if (rows.death) {
    rows.corpse = Object.fromEntries(FACINGS.filter((d) => rows.death[d]).map((d) => [d, [rows.death[d][rows.death[d].length - 1]]]));
    let c = sc.anims.find((x) => x.name === 'corpse');
    if (!c) { c = { name: 'corpse', fps: 0, loop: false }; sc.anims.push(c); }
    c.dirs = Object.fromEntries(FACINGS.filter((d) => rows.corpse[d]).map((d) => [d, 1]));
  }
  const nrows = sc.anims.reduce((n, a) => n + FACINGS.filter((d) => a.dirs[d]).length, 0);
  const cols = Math.max(...sc.anims.map((a) => Math.max(...FACINGS.map((d) => a.dirs[d] || 0))));
  const sheet = createImage(cols * fw, nrows * fh);
  let r = 0;
  for (const a of sc.anims) for (const d of FACINGS) {
    if (!a.dirs[d]) continue;
    rows[a.name][d].forEach((f, i) => blit(sheet, f, 0, 0, fw, fh, i * fw, r * fh));
    r++;
  }
  /* provenance: the clips this tool wrote and where from, beside the generation record */
  sc.pixellab = Object.assign({}, sc.pixellab, { clips: Object.fromEntries(Object.entries(row.clips).map(([name, clip]) => [name,
    Object.fromEntries(FACINGS.filter((d) => clip.dirs[d]).map((d) => [d, clip.dirs[d].mirror ? 'mirror of ' + clip.dirs[d].mirror : clip.dirs[d].dir + (clip.dirs[d].lay ? ' lay ' + clip.dirs[d].lay.join(' ') : '')]))])) });
  const NOTE = ' Combat clips (' + Object.keys(row.clips).join(', ') + ') laid from reviewed raw frames by tools/world-art/import-clips.mjs (hunt-clips.mjs): registered on the idle still by whole pixels, falls seated on the anchor row, never scaled or redrawn.';
  sc.notes = (sc.notes || '').split(NOTE).join('').replace(DERIVED_NOTE, '') + NOTE;
  return { sc, sheet, report };
}

function run(argv) {
  const check = argv.includes('--check');
  const only = argv.includes('--id') ? argv[argv.indexOf('--id') + 1] : null;
  let stale = 0, done = 0;
  for (const row of HUNT_CLIPS.concat(BARROW_CLIPS)) {
    if (only && row.id !== only) continue;
    const dir = join(ROOT, ART_DIR, row.set), jp = join(dir, row.id + '.json');
    const sc0 = JSON.parse(readFileSync(jp, 'utf8'));
    const sheet0 = decodePNG(readFileSync(join(dir, sc0.source)));
    let res;
    try { res = importSprite(row, sc0, sheet0); } catch (e) { if (e.missing) { stale++; console.log('  ✗ ' + row.set + '/' + row.id + ': ' + e.message); continue; } throw e; }
    done++;
    const json = JSON.stringify(res.sc, null, 2) + '\n';
    if (check) {
      const same = readFileSync(jp, 'utf8').replace(/\r\n/g, '\n') === json && pixelHash(res.sheet) === pixelHash(sheet0);
      if (!same) { stale++; console.log('  ✗ ' + row.set + '/' + row.id + ': its clips are not what import-clips.mjs writes'); }
      continue;
    }
    writeFileSync(join(dir, sc0.source), encodePNG(res.sheet));
    writeFileSync(jp, json);
    const lost = res.report.filter((l) => l.includes('LOST'));
    console.log('  ✓ ' + row.set + '/' + row.id + ' ' + Object.keys(row.clips).join('+') + (lost.length ? '  ' + lost.join('; ') : ''));
    if (argv.includes('--verbose')) for (const l of res.report) console.log('      ' + l);
  }
  if (check) console.log(stale ? 'import-clips --check: RED (' + stale + ')' : 'import-clips --check: green, ' + done + ' sprites match their sources');
  return stale ? 1 : 0;
}

if (isMain(import.meta.url)) {
  try { process.exit(run(process.argv.slice(2))); } catch (e) { console.error('import-clips: harness error: ' + (e && e.stack || e)); process.exit(2); }
}
