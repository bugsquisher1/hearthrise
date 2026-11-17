#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/import-barrow-2026-11-14.mjs — THE BARROW MARCH'S KEPT PICKS → art/world/<set>/ (lane/b-barrow-art-import).
//
//   node tools/world-art/import-barrow-2026-11-14.mjs [--only bodies|heads|slake|pyre|hold] [--id <body>]
//
// Imports what the generation notes of art/world-src/gen-2026-11-14 (briefs 21-30) and gen-2026-11-09b (b7-b10) KEPT, for the
// Slake (set `slake`), the Pyre Field (set `pyre`) and Krell's Hold (set `hold`). It is a driver: every pixel goes through the
// one importer (port-pixellab.mjs unit / idle / tileset / paint) and import-clips.mjs (barrow-clips.mjs), never by hand.
// Repeatable: every file it writes is a function of art/world-src and the map rows. Then: build.mjs, tests/world-assets.mjs.
//
//   BODIES   each body's 8 rotations and v3 walk (unit), its idle from the kept idle clip (idle), then its swing, fall and
//            flinch (import-clips.mjs --id). A palette-born body (the Slake's, the Hold's) names the ramps its rotations wear
//            and is `native`; the mint glints the palette call put on metal are left off the list, so they land on steel.
//            The Hold's lifts are the notes' (ring 3:1 on its 0.027 floors); the Slake's are measured here on the copper silt
//            (ring-contrast.mjs: 3 and 4 steps read 4.25:1, the notes' 1 step read 1.4-2.1).
//   IDLES    the Barrow Knight's and Captain Hask's v3 idles (gen-2026-11-07, kept 2026-11-15), laid on the still's own floor.
//   PROVOST  the Barrow Knight re-poured onto the charred end of the palette (brief 12 P3 / brief 25 row 7, 0 gens):
//            every earth and bronze pixel of the knight's locked frames, by luminance rank, onto six shadow and iron steps.
//   TWINS    the Muster's Barrow Pikeman and Cairn Wight, re-poured from the Ford's bodies they used to wear (0 gens), heads too.
//   RING     last: each body's `lift` and the Ford's and Muster's floor `shade` (RING_LIFT, RING_SHADE), so every live monster reads
//            3:1 off its floor (tests/world-assets.mjs [ring]).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { decodePNG, encodePNG, createImage } from './png.mjs';
import { ROOT, ART_DIR } from './build.mjs';
import { lock, inPalette } from './lock.mjs';
import { RAMPS } from './palette.mjs';
import { ALPHA_CUT } from '../../src/data/world/palette.js';
import { isMain } from '../../tests/_is-main.mjs';
import { groundParts } from './barrow-grounds.mjs';

const G12 = 'art/world-src/gen-2026-11-12', G14 = 'art/world-src/gen-2026-11-14', B13 = 'art/world-src/gen-2026-11-09b';
const FACING = ['south', 'east', 'north', 'west', 'south-east', 'south-west', 'north-east', 'north-west'];
const abs = (p) => join(ROOT, p);
const TOOL = (name) => join(ROOT, 'tools', 'world-art', name);

function run(tool, argv) {
  const r = spawnSync(process.execPath, [TOOL(tool), ...argv], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) { process.stderr.write(r.stderr || ''); throw new Error(tool + ' ' + argv.slice(0, 6).join(' ') + ' … exit ' + r.status); }
}

/* THE BODIES. rot: the 8 rotations (<facing>.png); walk: [dir, skip] the walk's frames per facing less `skip` leading stills,
   or { facing: dir } overrides in `walkOf`; idle: the kept idle clip. */
const SL = `${G14}/21-slake-clips`, HA = `${G14}/27-hold-bodies-a`, HB = `${G14}/28-hold-bodies-b`;
const BODIES = Object.freeze([
  /* the Slake (brief 19 rotations, brief 21 clips) */
  { set: 'slake', id: 'greened_pikeman', cls: 'character', rot: `${G12}/slake-bodies/greened_pikeman/boneswap`, walk: [`${SL}/greened_pikeman/walk`, 1], idle: `${SL}/greened_pikeman/idle`,
    ramps: 'shadow,earth,stone,bone,moss,leaf,bronze,iron,skin', lift: 4, object: '6973c53e-a801-42d9-8de8-5618d9568d1e', name: 'S1 Greened Pikeman' },
  { set: 'slake', id: 'bargeman', cls: 'character', rot: `${G12}/slake-bodies/bargeman`, walk: [`${SL}/bargeman/walk`, 1], idle: `${SL}/bargeman/idle2`,
    ramps: 'shadow,earth,stone,bone,iron,bronze', lift: 3, object: 'fc37534e-9ad0-4df7-a466-02bd1996b2d0', name: 'S1 Bargeman' },
  { set: 'slake', id: 'color_sergeant', cls: 'brute', rot: `${G12}/slake-bodies/flag_sergeant`, walk: [`${SL}/flag_sergeant/walk`, 1], idle: `${SL}/flag_sergeant/idle`,
    ramps: 'shadow,earth,stone,leaf,moss,bronze', lift: 3, object: 'a758d79a-0718-44a0-8601-770978ce874a', name: 'S1 Color Sergeant' },
  /* the Pyre Field (b7, b8: drawn before the sticky palette, so graded and locked like every March body) */
  { set: 'pyrefolk', id: 'charred_pikeman', cls: 'character', rot: `${B13}/b7-pyre-bodies/charred_pikeman`, walk: [`${B13}/b7-pyre-bodies/charred_pikeman/walk`, 0], idle: `${B13}/b7-pyre-bodies/charred_pikeman/idle`,
    object: 'fb184755-3ad1-4430-8836-30e78134d2cc', name: 'S1 Charred Pikeman' },
  { set: 'pyrefolk', id: 'stoker', cls: 'brute', rot: `${B13}/b7-pyre-bodies/stoker`, walk: [`${B13}/b7-pyre-bodies/stoker/walk`, 0], idle: `${B13}/b7-pyre-bodies/stoker/idle`,
    object: '765cee1e-c89e-49f9-b594-a182e094bb5f', name: 'S1 Stoker' },
  { set: 'pyrefolk', id: 'lurcher', cls: 'hound', rot: `${B13}/b7-pyre-bodies/lurcher`, walk: [`${B13}/b7-pyre-bodies/lurcher/walk`, 0], idle: `${B13}/b7-pyre-bodies/lurcher/idle`,
    object: 'b7-lurcher', name: 'S1 Lurcher' },
  { set: 'pyrefolk', id: 'pyre_wraith', cls: 'character', rot: `${B13}/b8-pyre-wraith/pyre_wraith`, walk: [`${B13}/b8-pyre-wraith/pyre_wraith/walk`, 0], idle: `${B13}/b8-pyre-wraith/pyre_wraith/idle`,
    object: '0270f103-104f-41d8-802e-e45ed6f4c212', name: 'S1 Pyre Wraith' },
  /* Krell's Hold (briefs 26-28; lifts from 27-note and 28-note) */
  { set: 'holdguard', id: 'farmhand', cls: 'character', rot: `${G14}/26-hold-sample/farmhand/rotations`, walk: [`${HA}/farmhand/walk`, 1], idle: `${HA}/farmhand/idle2`,
    ramps: 'shadow,earth,bronze,stone,torch,iron,skin,steel', lift: 2, object: '802bd336-4d67-4f91-9dc5-43954c36b7ef', name: 'S1 Farmhand' },
  { set: 'holdguard', id: 'hasks_lookout', cls: 'character', rot: `${HA}/hasks_lookout/rotations`, walk: [`${HA}/hasks_lookout/walk`, 1], idle: `${HA}/hasks_lookout/idle`,
    ramps: 'shadow,earth,bone,blood,skin,leaf,bronze,stone,moss,cloth', lift: 1, object: '8046c3c6-84e2-4380-8690-be2ab0814e08', name: 'S1 Hask\'s Lookout' },
  { set: 'holdguard', id: 'grave_guard', cls: 'brute', rot: `${HA}/grave_guard/rotations`, walk: [`${HA}/grave_guard/walk`, 1], walkOf: { north: `${HA}/grave_guard/walk3/north`, 'north-east': `${HA}/grave_guard/walk3/north-east` },
    idle: `${HA}/grave_guard/idle`, ramps: 'shadow,iron,stone,earth,bronze,steel,cloth,blood,bone', lift: 2, object: '96a7fcde-9c50-4763-bcd5-0fea35ca0404', name: 'S1 Grave Guard' },
  { set: 'holdkeep', id: 'pyre_priest', cls: 'character', rot: `${HB}/pyre_priest/rotations`, walk: [`${HB}/pyre_priest/walk`, 1], idle: `${HB}/pyre_priest/idle`,
    ramps: 'stone,shadow,bone,earth,cloth,skin', object: '39b3a548-4c03-47d8-b752-620fa61139ab', name: 'S1 Pyre Priest' },
  { set: 'holdkeep', id: 'gatekeeper', cls: 'brute', rot: `${HB}/gatekeeper/rotations`, walk: [`${HB}/gatekeeper/walk`, 1], idle: `${HB}/gatekeeper/idle`,
    ramps: 'shadow,iron,earth,stone,cloth,steel,blood,bronze,skin', lift: 2, object: '4c759eff-7552-4819-b879-eba410501c20', name: 'S1 Gatekeeper' },
  { set: 'holdkeep', id: 'lord_krell', cls: 'brute', rot: `${HB}/lord_krell/rotations`, walk: [`${HB}/lord_krell/walk`, 1], idle: `${HB}/lord_krell/idle`,
    ramps: 'shadow,blood,cloth,stone,bone,earth,bronze,iron,steel,skin', lift: 2, object: 'ff5a6489-753d-4eac-90b4-adcbc0ee3541', name: 'S1 Lord Krell' },
]);

/* ── READ 3:1 OFF THE FLOOR (art director 2026-11-15; tests/world-assets.mjs [ring], art-budget.js READABLE) ─────────────────
   Measured under each map's spawn tiles, the Ford's and the Muster's floors sat at 0.077 and 0.089, the dead middle where neither a
   dark nor a light body reads 3:1, and their bodies (one earth ramp each, after the lock) read 1.3-1.8:1. Both floors go three
   value steps down their own ramps (moss into the leaf greens, build.mjs `shade`), to 0.015, the dim the Slake (0.022) and the
   Hold (0.027) already have; each body goes up its ramps as far as its weakest facing needs (build.mjs `lift`, after the lock, so
   the source stays the drawing). The Slake's and the Hold's few facings under 3:1 take one more step. The Pyre Field's dark bodies
   on bright ash pass as they are. A body or floor this driver ports is rewritten without its key, so the key is set here, last. */
const RING_LIFT = Object.freeze({
  'march/banded_pikeman': 2, 'march/fordsunk': 3, 'march/wight': 4, 'march/bannerman': 3, 'muster/barrow_knight': 2, 'muster/captain_hask': 3,
  'slake/greened_pikeman': 1, 'slake/bargeman': 1, 'holdguard/farmhand': 1, 'holdguard/hasks_lookout': 1, 'holdkeep/pyre_priest': 1,
});
const RING_SHADE = Object.freeze({ 'ford/hasks_ford_ground': 3, 'muster-floor/muster_barrows_ground': 3 });
/** Set a sidecar's readability key (`lift` or `shade`) just after its `material`, as the build reads it. */
function ringKey(path, key, n) {
  const f = join(ROOT, ART_DIR, path + '.json'), sc = JSON.parse(readFileSync(f, 'utf8')), out = {};
  for (const [k, v] of Object.entries(sc)) { if (k === key) continue; out[k] = v; if (k === 'material') out[key] = n; }
  writeFileSync(f, JSON.stringify(out, null, 2) + '\n');
}
function ringSteps(id) {
  for (const [p, n] of Object.entries(RING_LIFT)) if (!id || p.endsWith('/' + id)) ringKey(p, 'lift', n);
  for (const [p, n] of Object.entries(RING_SHADE)) if (!id) ringKey(p, 'shade', n);
}

const pngs = (dir) => readdirSync(abs(dir)).filter((f) => /^(frame_|f)?\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

/** One body: staged as port-pixellab.mjs unit reads it (rotations, walk/<facing>/<i>.png), ported, then its idle. */
function body(b) {
  const stage = mkdtempSync(join(tmpdir(), 'hr-barrow-'));
  try {
    for (const f of FACING) {
      copyFileSync(abs(`${b.rot}/${f}.png`), join(stage, f + '.png'));
      const src = (b.walkOf && b.walkOf[f]) || `${b.walk[0]}/${f}`;
      mkdirSync(join(stage, 'walk', f), { recursive: true });
      pngs(src).slice(b.walk[1]).forEach((file, i) => copyFileSync(abs(`${src}/${file}`), join(stage, 'walk', f, i + '.png')));
    }
    run('port-pixellab.mjs', ['unit', '--set', b.set, '--id', b.id, '--class', b.cls, '--dir', stage, '--object', b.object, '--name', b.name, '--hit', '3',
      ...(b.ramps ? ['--ramps', b.ramps] : []), ...(b.lift ? ['--lift', String(b.lift)] : [])]);
  } finally { rmSync(stage, { recursive: true, force: true }); }
  run('port-pixellab.mjs', ['idle', '--set', b.set, '--id', b.id, '--clip', abs(b.idle)]);
}

/* ── THE MUSTER'S TWO IDLES (brief 02-march-idles, 2026-11-07 A3, 35 gens; kept by the art director 2026-11-15) ──────────
   The Barrow Knight and Captain Hask shipped on one still frame. Their v3 clips were made on 11-07 and held for a read: laid at the
   anchor row, the S and SE stills (a sword tip under the feet, rows 60-63) lifted every frame off it, a pop. `--floor still` lays
   them on the still's own lowest row. `over`: a facing taken from another roll (alt/<roll>/<facing>): Hask's E from r1, whose cape
   stirs and settles (r2's flares on every other frame, a flap at 5 fps). The Provost re-pours the knight after, so he idles too. */
const G07 = 'art/world-src/gen-2026-11-07';
const IDLES = Object.freeze([
  { set: 'muster', id: 'barrow_knight', clip: `${G07}/barrow_knight-idle` },
  { set: 'muster', id: 'captain_hask', clip: `${G07}/captain_hask-idle`, over: { east: 'r1' } },
]);
function idleOf(b) {
  const stage = mkdtempSync(join(tmpdir(), 'hr-idle-'));
  try {
    for (const f of FACING) {
      const src = b.over && b.over[f] ? `${b.clip}/alt/${b.over[f]}/${f}` : `${b.clip}/${f}`;
      mkdirSync(join(stage, f), { recursive: true });
      for (const file of pngs(src)) copyFileSync(abs(`${src}/${file}`), join(stage, f, file));
    }
    run('port-pixellab.mjs', ['idle', '--set', b.set, '--id', b.id, '--clip', stage, '--floor', 'still']);
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

/* ── THE PROVOST: the Barrow Knight burned in his plate ───────────────────────────────────────── */
const hex = (d, i) => '#' + [0, 1, 2].map((k) => d[i + k].toString(16).padStart(2, '0')).join('');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lumOf = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
/* brief 12 P3: the charred end of the palette, dark to light */
const CHAR = Object.freeze(['#0b0a0c', '#17141a', '#231d1f', '#2f2723', '#2c2e33', '#4a4d54']);
/** `img` with every pixel of the `ramps` colours, ranked by luminance, poured onto the steps of `onto` (dark to light). */
function pourOnto(img, ramps, onto) {
  const warm = ramps.flatMap((r) => RAMPS[r]).sort((a, b) => lumOf(a) - lumOf(b));
  const pour = Object.fromEntries(warm.map((c, i) => [c, onto[Math.min(onto.length - 1, Math.floor((i * onto.length) / warm.length))]]));
  const out = createImage(img.width, img.height);
  out.data.set(img.data);
  let moved = 0;
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] < ALPHA_CUT) continue;
    const c = pour[hex(out.data, i)];
    if (c) { out.data.set(rgb(c), i); moved++; }
  }
  return { out, moved };
}
/** A body re-poured from another's locked sheet (0 generations): its own pixels under its own id, so it is no twin. */
function repour({ from, to, id, ramps, onto, note, lift }) {
  const [fset, fid] = from.split('/');
  const src = join(ROOT, ART_DIR, fset), dst = join(ROOT, ART_DIR, to);
  mkdirSync(dst, { recursive: true });
  /* the source's own drawing (its build-time `lift` is its floor's, not ours): a re-pour declares its own */
  const { lift: _theirs, ...sc } = JSON.parse(readFileSync(join(src, fid + '.json'), 'utf8'));
  const { out, moved } = pourOnto(lock(decodePNG(readFileSync(join(src, sc.source))), sc.material), ramps, onto);
  writeFileSync(join(dst, id + '.png'), encodePNG(out));
  const next = { ...sc, id, material: 'native', ...(lift ? { lift } : {}), source: id + '.png',
    pixellab: { tool: 'ramp re-pour of ' + fid + ' (0 generations)', from, object: sc.pixellab.object, onto },
    notes: note + ': every ' + ramps.join(' and ') + ' pixel of ' + from + '\'s locked frames, by luminance rank, onto ' + onto.join(' ') + ' by tools/world-art/import-barrow-2026-11-14.mjs. No pixel moved, none drawn.' };
  writeFileSync(join(dst, id + '.json'), JSON.stringify(next, null, 2) + '\n');
  console.log('  ✓ ' + to + '/' + id + ': ' + moved + ' pixels re-poured from ' + from);
}
function provost() {
  repour({ from: 'muster/barrow_knight', to: 'pyrefolk', id: 'provost', ramps: ['earth', 'bronze'], onto: CHAR,
    note: 'The Provost is the Barrow Knight burned in his plate (brief 12 P3)' });
}

/* ── THE MUSTER'S OWN TWO (art director 2026-11-15): the Barrow Pikeman and the Cairn Wight wore the Ford's Banded Pikeman and
   Ledger Wight pixel for pixel (HUNT_ART_ALIAS), so two names showed one drawing ([twin], the 2026-11-04 audit's "the same rat three
   times"). Each is now that body re-poured for the barrows (ART_DIRECTION §4: a value step, never a hue jump inside a ramp; bone,
   blood and stone kept): the pikeman's rotted leathers gone to grave-cold iron, the wight's robe to the grey of the cairn stones.
   No shadow step in the wight's pour (the shadow ramp never lifts). Each then lifts for the Muster's shaded floor (RING_LIFT's
   reasoning): the pikeman 3.34:1, the wight 4.45:1. Their 32 px heads take the same pour, unlifted (a head sits on a panel). */
const MUSTER_TWINS = Object.freeze([
  { from: 'march/banded_pikeman', to: 'muster', id: 'barrow_pikeman', ramps: ['earth'],
    onto: ['#17141a', '#231d1f', '#2c2e33', '#4a4d54', '#6e727a', '#969aa1', '#aaa49a'], lift: 2,
    note: 'The Barrow Pikeman is the Ford\'s Banded Pikeman out of a barrow, his leathers grave-cold' },
  { from: 'march/wight', to: 'muster', id: 'cairn_wight', ramps: ['earth'],
    onto: ['#3a3a3e', '#4f4e52', '#6a6865', '#8a867d', '#aaa49a', '#c9bfa0'], lift: 3,
    note: 'The Cairn Wight is the Ford\'s wight in the grey of the cairn stones' },
]);
const HEADS_DIR = 'assets/icons-bundle/pixel/heads/';
function musterTwin(t) {
  repour(t);
  const [, fid] = t.from.split('/');
  const { out } = pourOnto(decodePNG(readFileSync(abs(HEADS_DIR + fid + '.png'))), t.ramps, t.onto);
  writeFileSync(abs(HEADS_DIR + t.id + '.png'), encodePNG(out));
  console.log('  ✓ head ' + t.id + ' re-poured from ' + fid);
}

function main(argv) {
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  const id = argv.includes('--id') ? argv[argv.indexOf('--id') + 1] : null;
  const want = (part) => !only || only === part;
  if (want('bodies')) {
    for (const b of BODIES) {
      if (id && b.id !== id) continue;
      body(b);
      run('import-clips.mjs', ['--id', b.id]);
    }
    for (const b of IDLES) if (!id || id === b.id) idleOf(b);
    if (!id || id === 'provost' || id === 'barrow_knight') provost();
    for (const t of MUSTER_TWINS) if (!id || id === t.id) musterTwin(t);
  }
  for (const [part, fn] of Object.entries(GROUNDS)) if (want(part) && !id) fn();
  ringSteps(id);
}

/* the grounds' own art (tiles, floors, walls, props): barrow-grounds.mjs, one function a set */
const GROUNDS = groundParts(run);

/* ── HEADS (brief 32, one 64-candidate call, 10 gens): the picks, each 32x32 on the palette with binary alpha ── */
const HEADS = Object.freeze(['greened_pikeman', 'bargeman', 'color_sergeant', 'charred_pikeman', 'stoker', 'lurcher', 'pyre_wraith', 'provost']);
GROUNDS.heads = () => {
  for (const id of HEADS) {
    const buf = readFileSync(abs(G14 + '/32-heads/picks/' + id + '.png')), img = decodePNG(buf);
    if (img.width !== 32 || img.height !== 32) throw new Error('head ' + id + ' is ' + img.width + 'x' + img.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3];
      if (a !== 0 && a !== 255) throw new Error('head ' + id + ' has partial alpha');
      if (a === 255 && !inPalette(img.data[i], img.data[i + 1], img.data[i + 2])) throw new Error('head ' + id + ' has an off-palette pixel');
    }
    writeFileSync(abs('assets/icons-bundle/pixel/heads/' + id + '.png'), encodePNG(img));
  }
  console.log('  ✓ ' + HEADS.length + ' heads -> assets/icons-bundle/pixel/heads');
};

if (isMain(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('import-barrow: ' + (e && e.message || e)); process.exit(2); }
}
