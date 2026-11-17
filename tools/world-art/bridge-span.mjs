#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/bridge-span.mjs — HAVORA'S BRIDGE CUT TO ITS RIVER (lane/a-havora-art 2026-11-16; Tyler on the great bridge:
// "awkward": twelve tiles of deck over a six-tile river, the abutments standing on the road, a plank strip under it).
//
// havora/havora_bridge (384 x 192: a stone abutment each end, a deck of seven bays, a rail post every ~51 px) is cut to a span
// that crosses a six-tile river bank to bank: two whole bays come out of the middle, at a post's left edge on both sides of the
// cut (posts at x 136 and 238), so the posts keep their rhythm and no bay is half a bay. Nothing is drawn: every pixel is the
// bridge's own. 282 x 192, an eight-tile footprint, its abutments on the two banks.
//
//   node tools/world-art/bridge-span.mjs            write art/world/havora/havora_bridge_span.png
//   node tools/world-art/bridge-span.mjs --check    exit 1 if the committed span differs from a fresh cut
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { decodePNG, encodePNG, createImage, blit, pixelHash } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = 'art/world-src/havora-bridge/havora_bridge.png', OUT = 'art/world/havora/havora_bridge_span.png';
/* the cut: [CUT_FROM, CUT_TO) leaves the bridge (the left edges of its 3rd and 5th rail posts: two bays) */
export const CUT_FROM = 136, CUT_TO = 238;

export function span(src) {
  const w = src.width - (CUT_TO - CUT_FROM);
  const out = createImage(w, src.height);
  blit(out, src, 0, 0, CUT_FROM, src.height, 0, 0);
  blit(out, src, CUT_TO, 0, src.width - CUT_TO, src.height, CUT_FROM, 0);
  return out;
}

function main() {
  const img = span(decodePNG(readFileSync(join(ROOT, SRC))));
  if (process.argv.includes('--check')) {
    const ok = pixelHash(decodePNG(readFileSync(join(ROOT, OUT)))) === pixelHash(img);
    console.log(ok ? '✓ bridge-span: the committed span is a fresh cut' : '✗ bridge-span: the committed span differs from a fresh cut');
    process.exit(ok ? 0 : 1);
  }
  writeFileSync(join(ROOT, OUT), encodePNG(img));
  console.log('✓ wrote', OUT, img.width + 'x' + img.height);
}
if (isMain(import.meta.url)) main();
