#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/import-catacombs-2026-11-16.mjs — THE UNMARKED CATACOMBS' FIVE BODIES → art/world/<set>/ (lane/a-catacomb-art).
//
//   node tools/world-art/import-catacombs-2026-11-16.mjs [--only bodies|heads] [--id <body>]
//
// Imports what art/world-src/gen-2026-11-16/uc-note.json KEPT, for the Catacombs' two sets: `vaultdead` (the Keepers' dead:
// the Shrouded Pauper, the Bone Wall, Keeper Dunn) and `vaultliving` (what came in from outside: the Night Carter, the Vault
// Leech). It is a driver: every pixel goes through the one importer (port-pixellab.mjs unit / idle) and import-clips.mjs
// (catacomb-clips.mjs), never by hand. Repeatable: every file it writes is a function of art/world-src. Then: build.mjs
// --set vaultdead / vaultliving, tests/world-assets.mjs.
//
//   BODIES   each body's 8 rotations and v3 walk (unit), its idle from the kept idle clip (idle), then its swing, fall and
//            flinch (import-clips.mjs --id). Every body was drawn with PixelLab's sticky palette (hr-world-56-v2), so each names
//            the ramps its rotations wear and is `native`. `lift`: the ramp steps a body goes up so its ring reads 3:1 on the
//            Catacombs' floor (ART_DIRECTION §4). Measured on the stand-in floor the staged map stands on (the Sewer's painted
//            ground under the map's open tiles, median 0.013, as dim as the Hold's); re-measured when the vault floor lands.
//   HEADS    the five 32 px heads (one 64-candidate call), each checked 32x32, on the palette, binary alpha.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { decodePNG, encodePNG } from './png.mjs';
import { ROOT } from './build.mjs';
import { inPalette } from './lock.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const G16 = 'art/world-src/gen-2026-11-16/uc-bodies';
const FACING = ['south', 'east', 'north', 'west', 'south-east', 'south-west', 'north-east', 'north-west'];
const abs = (p) => join(ROOT, p);
const TOOL = (name) => join(ROOT, 'tools', 'world-art', name);

function run(tool, argv) {
  const r = spawnSync(process.execPath, [TOOL(tool), ...argv], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) { process.stderr.write(r.stderr || ''); throw new Error(tool + ' ' + argv.slice(0, 6).join(' ') + ' … exit ' + r.status); }
}

/* THE BODIES. rot: the 8 rotations (<facing>.png); walk: [dir, skip] the walk's frames per facing less `skip` leading stills;
   idle: the kept idle clip (<facing>/fNN.png, f00 the still). */
const B = (id) => `${G16}/${id}`;
export const BODIES = Object.freeze([
  { set: 'vaultdead', id: 'shrouded_pauper', cls: 'character', rot: `${B('shrouded_pauper')}/rotations`, walk: [`${B('shrouded_pauper')}/walk`, 1],
    idle: `${B('shrouded_pauper')}/idle`, ramps: 'shadow,stone,bone,earth,iron,steel,bronze,skin', object: '73682e97-0931-4a4f-b305-8098105d8f30', name: 'UC Shrouded Pauper' },
  /* the dun habit reads 1.59:1 raw on the stand-in floor; two steps up its ramps, 3.14:1 (the Hold's lift for a dark body) */
  { set: 'vaultdead', id: 'keeper_dunn', cls: 'character', rot: `${B('keeper_dunn')}/rotations`, walk: [`${B('keeper_dunn')}/walk`, 1],
    idle: `${B('keeper_dunn')}/idle`, ramps: 'shadow,earth,stone,skin,bone,torch,bronze,iron,gold', lift: 2, object: '6d53dcba-b582-4a30-9911-ac7eff01189f', name: 'UC Keeper Dunn' },
]);

const pngs = (dir) => readdirSync(abs(dir)).filter((f) => /^(frame_|f)?\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

/** One body: staged as port-pixellab.mjs unit reads it (rotations, walk/<facing>/<i>.png), ported, then its idle. */
function body(b) {
  const stage = mkdtempSync(join(tmpdir(), 'hr-catacomb-'));
  try {
    for (const f of FACING) {
      copyFileSync(abs(`${b.rot}/${f}.png`), join(stage, f + '.png'));
      const src = `${b.walk[0]}/${f}`;
      mkdirSync(join(stage, 'walk', f), { recursive: true });
      pngs(src).slice(b.walk[1]).forEach((file, i) => copyFileSync(abs(`${src}/${file}`), join(stage, 'walk', f, i + '.png')));
    }
    run('port-pixellab.mjs', ['unit', '--set', b.set, '--id', b.id, '--class', b.cls, '--dir', stage, '--object', b.object, '--name', b.name, '--hit', '3',
      '--ramps', b.ramps, ...(b.lift ? ['--lift', String(b.lift)] : [])]);
  } finally { rmSync(stage, { recursive: true, force: true }); }
  run('port-pixellab.mjs', ['idle', '--set', b.set, '--id', b.id, '--clip', abs(b.idle)]);
}

/* ── HEADS (one create_1_direction_object call, 64 candidates at 32 px): the picks, each 32x32 on the palette with binary alpha ── */
export const HEADS = Object.freeze([]);
function heads() {
  for (const id of HEADS) {
    const img = decodePNG(readFileSync(abs('art/world-src/gen-2026-11-16/uc-heads/picks/' + id + '.png')));
    if (img.width !== 32 || img.height !== 32) throw new Error('head ' + id + ' is ' + img.width + 'x' + img.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3];
      if (a !== 0 && a !== 255) throw new Error('head ' + id + ' has partial alpha');
      if (a === 255 && !inPalette(img.data[i], img.data[i + 1], img.data[i + 2])) throw new Error('head ' + id + ' has an off-palette pixel');
    }
    writeFileSync(abs('assets/icons-bundle/pixel/heads/' + id + '.png'), encodePNG(img));
  }
  console.log('  ✓ ' + HEADS.length + ' heads -> assets/icons-bundle/pixel/heads');
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
  }
  if (want('heads') && !id) heads();
}

if (isMain(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('import-catacombs: ' + (e && e.message || e)); process.exit(2); }
}
