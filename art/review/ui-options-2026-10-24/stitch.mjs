#!/usr/bin/env node
// art/review/ui-options-2026-10-24/stitch.mjs <out.png> <tile dir> <tl> <tr> <bl> <br>
// The browser pane captures at most ~800 px across, so a 1440x900 (or 922x423) view is shot as four quarter
// tiles (the page scaled x2 by a CSS transform on <html>, overflow hidden so nothing re-lays out) and joined
// here into one PNG about 1.1x (desktop) or 1.7x (phone) the CSS size. A tile name without ".png" is the
// pane's saved blob id (mcp-Claude_Browser-blob-<id>.png in <tile dir>).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit } from '../../../tools/world-art/png.mjs';

const [out, dir, ...ids] = process.argv.slice(2);
const file = (id) => (id.endsWith('.png') ? id : join(dir, 'mcp-Claude_Browser-blob-' + id + '.png'));
const [tl, tr, bl, br] = ids.map((id) => decodePNG(readFileSync(file(id))));
const w = tl.width, h = tl.height;
const img = createImage(w * 2, h * 2);
blit(img, tl, 0, 0, w, h, 0, 0);
blit(img, tr, 0, 0, w, h, w, 0);
blit(img, bl, 0, 0, w, h, 0, h);
blit(img, br, 0, 0, w, h, w, h);
writeFileSync(out, encodePNG(img));
console.log(out + ' ' + img.width + 'x' + img.height);
