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
//            Lifts are the notes' (ring 3:1 on the Hold's 0.027 floors).
//   PROVOST  the Barrow Knight re-poured onto the charred end of the palette (brief 12 P3 / brief 25 row 7, 0 gens):
//            every earth and bronze pixel of the knight's locked frames, by luminance rank, onto six shadow and iron steps.
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
    ramps: 'shadow,earth,stone,bone,moss,leaf,bronze,iron,skin', lift: 1, object: '6973c53e-a801-42d9-8de8-5618d9568d1e', name: 'S1 Greened Pikeman' },
  { set: 'slake', id: 'bargeman', cls: 'character', rot: `${G12}/slake-bodies/bargeman`, walk: [`${SL}/bargeman/walk`, 1], idle: `${SL}/bargeman/idle2`,
    ramps: 'shadow,earth,stone,bone,iron,bronze', lift: 1, object: 'fc37534e-9ad0-4df7-a466-02bd1996b2d0', name: 'S1 Bargeman' },
  { set: 'slake', id: 'color_sergeant', cls: 'brute', rot: `${G12}/slake-bodies/flag_sergeant`, walk: [`${SL}/flag_sergeant/walk`, 1], idle: `${SL}/flag_sergeant/idle`,
    ramps: 'shadow,earth,stone,leaf,moss,bronze', lift: 1, object: 'a758d79a-0718-44a0-8601-770978ce874a', name: 'S1 Color Sergeant' },
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

/* ── THE PROVOST: the Barrow Knight burned in his plate ───────────────────────────────────────── */
const hex = (d, i) => '#' + [0, 1, 2].map((k) => d[i + k].toString(16).padStart(2, '0')).join('');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lumOf = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
/* brief 12 P3: the charred end of the palette, dark to light */
const CHAR = Object.freeze(['#0b0a0c', '#17141a', '#231d1f', '#2f2723', '#2c2e33', '#4a4d54']);
function provost() {
  const from = join(ROOT, ART_DIR, 'muster'), to = join(ROOT, ART_DIR, 'pyrefolk');
  mkdirSync(to, { recursive: true });
  const sc = JSON.parse(readFileSync(join(from, 'barrow_knight.json'), 'utf8'));
  const img = lock(decodePNG(readFileSync(join(from, sc.source))), sc.material);
  /* the rust plate's colours as they ship (earth and bronze), ranked by luminance, poured onto the six charred steps */
  const warm = [...RAMPS.earth, ...RAMPS.bronze].sort((a, b) => lumOf(a) - lumOf(b));
  const pour = Object.fromEntries(warm.map((c, i) => [c, CHAR[Math.min(CHAR.length - 1, Math.floor((i * CHAR.length) / warm.length))]]));
  const out = createImage(img.width, img.height);
  out.data.set(img.data);
  let moved = 0;
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] < ALPHA_CUT) continue;
    const c = pour[hex(out.data, i)];
    if (c) { out.data.set(rgb(c), i); moved++; }
  }
  writeFileSync(join(to, 'provost.png'), encodePNG(out));
  const next = { ...sc, id: 'provost', material: 'native', source: 'provost.png',
    pixellab: { tool: 'ramp re-pour of barrow_knight (0 generations)', from: 'muster/barrow_knight', object: sc.pixellab.object, onto: CHAR },
    notes: 'The Provost is the Barrow Knight burned in his plate (brief 12 P3): every earth and bronze pixel of muster/barrow_knight\'s locked frames, by luminance rank, onto ' + CHAR.join(' ') + ' by tools/world-art/import-barrow-2026-11-14.mjs. No pixel moved, none drawn.' };
  writeFileSync(join(to, 'provost.json'), JSON.stringify(next, null, 2) + '\n');
  console.log('  ✓ pyrefolk/provost: ' + moved + ' pixels re-poured from muster/barrow_knight');
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
    if (!id || id === 'provost') provost();
  }
  for (const [part, fn] of Object.entries(GROUNDS)) if (want(part) && !id) fn();
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
