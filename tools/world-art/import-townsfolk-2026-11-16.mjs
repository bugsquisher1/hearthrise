#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/import-townsfolk-2026-11-16.mjs — HAVORA'S TOWNSFOLK, EACH IN A BODY OF THEIR OWN → art/world/townsfolk/.
//
//   node tools/world-art/import-townsfolk-2026-11-16.mjs [--id <body>]
//
// lane/a-living-town round 3 (the asset director's handoff of 2026-11-16: the townsfolk wore the Quarry Brute in townsfolk dyes,
// which read as one man in six shirts). Each body is a PixelLab Pro Flash object (style 1, high top-down, the hr-world-56-v2
// palette, Tamsin's south still as the style image), its south read before its rotations and its rotations before its clips, a
// v3 walk of 6 and a v3 idle of 8 per facing. The raw picks are art/world-src/gen-2026-11-16-folk/<body>/ (rotations/<facing>.png,
// walk/<facing>/frame_NNN.png, idle/<facing>/frame_NNN.png: the object ZIP's layout, frame_000 the still each clip started
// from), with the request, the seeds, the refused rolls and the gens in note.json beside them.
// It is a driver: every pixel goes through the one importer (port-pixellab.mjs unit, then idle), never by hand. Each body names
// the ramps its south wears, so every frame is snapped onto them and the sprite is `native` (the south was drawn on the palette;
// the rotations and clips come back near it). Repeatable: every file it writes is a function of art/world-src.
// Then: build.mjs --set townsfolk, tests/world-assets.mjs, tests/town-life.mjs.
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, mkdtempSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT } from './build.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const G = 'art/world-src/gen-2026-11-16-folk';
const FACING = ['south', 'east', 'north', 'west', 'south-east', 'south-west', 'north-east', 'north-west'];
const abs = (p) => join(ROOT, p);

function run(tool, argv) {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'world-art', tool), ...argv], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) { process.stderr.write(r.stderr || ''); throw new Error(tool + ' ' + argv.slice(0, 6).join(' ') + ' … exit ' + r.status); }
}

/* THE BODIES: object (the 8-direction Pro Flash object), ramps (what its south wears), walk skip (frame_000 is the still). */
export const FOLK_BODIES = Object.freeze([
  { id: 'folk_market_woman', object: '3300bc6b-aa94-41c2-829f-4cdc42db331e', name: 'S1 market woman',
    ramps: 'shadow,earth,bone,skin,bronze,blood,cloth,leaf,gold' },
  { id: 'folk_water_carrier', object: '8a434966-705f-44f5-bd8e-ca9bc2d68e44', name: 'S1 water carrier',
    ramps: 'shadow,stone,earth,bronze,skin,steel,mithril,frost,water' },
  { id: 'folk_dock_porter', object: '51e287e9-526e-4099-b4e8-f6fc7462d45b', name: 'S1 dock porter',
    ramps: 'shadow,earth,bone,bronze,water,steel,skin,torch' },
  { id: 'folk_fishmonger', object: 'cabbf241-072d-4fd5-bdce-78c327be334a', name: 'S1 fishmonger',
    ramps: 'stone,shadow,bone,iron,moss,earth,skin,steel,mithril' },
]);

const pngs = (dir) => readdirSync(abs(dir)).filter((f) => /^(frame_|f)?\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

/** One body: staged as port-pixellab.mjs unit reads it (rotations, walk/<facing>/<i>.png less the still), ported, then its idle. */
function body(b) {
  const src = `${G}/${b.id.replace(/^folk_/, '')}`;
  const stage = mkdtempSync(join(tmpdir(), 'hr-folk-'));
  try {
    for (const f of FACING) {
      copyFileSync(abs(`${src}/rotations/${f}.png`), join(stage, f + '.png'));
      mkdirSync(join(stage, 'walk', f), { recursive: true });
      pngs(`${src}/walk/${f}`).slice(1).forEach((file, i) => copyFileSync(abs(`${src}/walk/${f}/${file}`), join(stage, 'walk', f, i + '.png')));
    }
    run('port-pixellab.mjs', ['unit', '--set', 'townsfolk', '--id', b.id, '--class', 'character', '--dir', stage, '--object', b.object, '--name', b.name,
      '--ramps', b.ramps, '--meta', abs(`${src}/meta.json`)]);
  } finally { rmSync(stage, { recursive: true, force: true }); }
  run('port-pixellab.mjs', ['idle', '--set', 'townsfolk', '--id', b.id, '--clip', abs(`${src}/idle`), '--meta', abs(`${src}/idle-meta.json`)]);
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--id');
  const only = i > 0 ? process.argv[i + 1] : null;
  mkdirSync(abs('art/world/townsfolk'), { recursive: true });
  for (const b of FOLK_BODIES) if (!only || b.id === only) body(b);
}
