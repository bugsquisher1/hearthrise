#!/usr/bin/env node
// prototypes/town-v06/ingest.mjs — a finished PixelLab map object → art/world/<set>/<id>.png + sidecar.
//   node prototypes/town-v06/ingest.mjs <set> <id> <class> <material> <fw>x<fh> <objectId> '<request json>' [shadow] [hover]
// Crops the transparent margin (sources are curated, UN-locked frames; build.mjs locks them),
// anchors on the bottom-centre contact row, and records the exact request in the sidecar.
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, crop } from '../../tools/world-art/png.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [set, id, cls, material, fp, objectId, reqJson, shadow, hover] = process.argv.slice(2);
const res = await fetch('https://api.pixellab.ai/mcp/map-objects/' + objectId + '/download');
if (!res.ok) { console.error('download failed', res.status); process.exit(2); }
const img = decodePNG(Buffer.from(await res.arrayBuffer()));
let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3] >= 128) {
  x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
}
const w = x1 - x0 + 1, h = y1 - y0 + 1;
const out = crop(img, x0, y0, w, h);
writeFileSync(join(ROOT, 'art/world', set, id + '.png'), encodePNG(out));
const side = { id, class: cls, material, source: id + '.png', frame: [w, h], anchor_px: [Math.floor(w / 2), h - 2],
  footprint: fp.split('x').map(Number) };
if (shadow) side.shadow = shadow;
if (hover) side.hover_px = Number(hover);
side.anims = [{ name: 'idle', fps: 0, loop: false, dirs: { s: 1 } }];
side.pixellab = { tool: 'create_map_object', id: objectId, request: JSON.parse(reqJson) };
side.notes = 'Town v0.6 (art/town-v06): same create_map_object settings as the live well/lamppost/bench sidecars.';
writeFileSync(join(ROOT, 'art/world', set, id + '.json'), JSON.stringify(side, null, 2) + '\n');
console.log(id, w + 'x' + h, 'from', img.width + 'x' + img.height);
