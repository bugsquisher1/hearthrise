#!/usr/bin/env node
// tools/world-art/import-heads-icons-2026-11-12.mjs — brief 15-18's picks into the shipped tree.
//
//   node tools/world-art/import-heads-icons-2026-11-12.mjs           write the 43 heads and 22 icons
//   node tools/world-art/import-heads-icons-2026-11-12.mjs --check   compare the tree with the picks; write nothing
//
// SOURCE: art/world-src/gen-2026-11-12/<batch>/picks/<id>.png, each already 32x32, hr-world-56-v2, binary alpha.
//   heads  -> assets/icons-bundle/pixel/heads/<monster id>.png  (src/data/monster-art.js HEAD_ART / HEAD_ART_AHEAD)
//   icons  -> assets/icons-bundle/pixel/items/<item id>.png      (src/data/item-art.js ITEM_ART_AHEAD until the rows land)
// One free pixel fix, documented here and nowhere else: pyre_priest. Every roll painted the ash on his brow as a cross
// (art brief 18); a real faith's sign on the enemy who burns the dead is not ours to use, so the cross's dark pixels
// (the pixels of its two bars) go back to the skin tone and a broken grey smear runs across the brow in its place.
// Each file is checked on palette and alpha before it is written; a pick that is not clean stops the import.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';
import { inPalette } from './lock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = 'art/world-src/gen-2026-11-12/';
const HEADS_OUT = 'assets/icons-bundle/pixel/heads/';
const ITEMS_OUT = 'assets/icons-bundle/pixel/items/';

/** Heads, by batch folder: the 30 live monsters, the 7 March bodies and Krell's 6 faces. */
export const HEAD_BATCHES = Object.freeze({
  'heads-sample': ['rat', 'gray_wolf', 'brook_bear', 'kobold_tosher', 'culvert_bat'],
  'heads-beasts': ['barn_spider', 'barn_wasp', 'briarcoat_wolf', 'carrion_crow', 'cistern_spider', 'dire_gray', 'drain_rat', 'granary_rat',
    'gray_whelp', 'grayjaw', 'hive_wasp', 'orchard_boar', 'rat_king'],
  'heads-folk': ['chief_coppercap', 'glade_poacher', 'goblin_digger', 'goblin_scavenger', 'goblin_skulker', 'goblin_sluicer', 'hobgoblin_foreman',
    'rook_poacher', 'slime', 'sump_slime', 'turncoat', 'walking_vine'],
  'heads-krell-march-and-rerolls': ['farmhand', 'hasks_lookout', 'grave_guard', 'gatekeeper', 'lord_krell', 'pyre_priest',
    'mudlark', 'wight', 'banded_pikeman', 'bannerman', 'barrow_knight', 'captain_hask', 'fordsunk'],
});

/** Icons, by batch folder. toll_token and the tier 7 ids are the packs' own (lane/b-krells-hold-pack c06c43b23 renamed void* to slakehide/shroudweave). */
export const ICON_BATCHES = Object.freeze({
  'icons-krell-muster-ford': ['farmhands_tag', 'lookouts_whistle', 'barrow_nail', 'priests_cord', 'gatekeepers_chain', 'coffin_nail', 'urn_shard', 'toll_token'],
  'icons-tier7': ['slakehide_helmet', 'slakehide_body', 'slakehide_pants', 'slakehide_boots', 'slakehide_gloves', 'slakehide_belt',
    'shroudweave_helmet', 'shroudweave_body', 'shroudweave_pants', 'shroudweave_boots', 'shroudweave_gloves', 'shroudweave_belt'],
  'heads-krell-march-and-rerolls': ['hall_key', 'shroud_pin'],
});

/* pyre_priest's brow: the cross sat in x16-19, y5-10 (its dark pixels are the ones darker than the skin tone 6). The skin tone, then the smear. */
const SKIN = [170, 164, 154];
const SMEAR = [[15, 7, [138, 134, 125]], [16, 7, [106, 104, 101]], [16, 8, [138, 134, 125]], [17, 8, [106, 104, 101]], [18, 9, [138, 134, 125]], [19, 9, [106, 104, 101]]];
export function smearBrow(img) {
  const out = { width: img.width, height: img.height, data: Uint8Array.from(img.data) };
  const put = (x, y, c) => { const i = (y * out.width + x) * 4; out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255; };
  for (let y = 5; y <= 10; y++) for (let x = 16; x <= 19; x++) {
    const i = (y * out.width + x) * 4;
    if (out.data[i] + out.data[i + 1] + out.data[i + 2] < 3 * 100) put(x, y, SKIN);   // dark cross pixel (the pale-cream ones stay)
  }
  for (const [x, y, c] of SMEAR) put(x, y, c);
  return out;
}

function clean(id, img) {
  if (img.width !== 32 || img.height !== 32) throw new Error(id + ' is ' + img.width + 'x' + img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    if (a !== 0 && a !== 255) throw new Error(id + ' has partial alpha');
    if (a === 255 && !inPalette(img.data[i], img.data[i + 1], img.data[i + 2])) throw new Error(id + ' has an off-palette pixel');
  }
}

/** [out path, bytes] for every file the import owns. */
export function plan(root = ROOT) {
  const files = [];
  const take = (batches, outDir) => {
    for (const [batch, ids] of Object.entries(batches)) for (const id of ids) {
      let img = decodePNG(readFileSync(join(root, SRC, batch, 'picks', id + '.png')));
      if (id === 'pyre_priest') img = smearBrow(img);
      clean(id, img);
      files.push([outDir + id + '.png', encodePNG(img)]);
    }
  };
  take(HEAD_BATCHES, HEADS_OUT);
  take(ICON_BATCHES, ITEMS_OUT);
  return { files, heads };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const { files } = plan();
  let drift = 0;
  for (const [rel, bytes] of files) {
    const at = join(ROOT, rel);
    if (check) { if (!existsSync(at) || !readFileSync(at).equals(bytes)) { drift++; console.error('drift: ' + rel); } continue; }
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, bytes);
  }
  console.log((check ? (drift ? 'RED ' + drift + ' drifted' : 'green') : 'wrote') + ' ' + files.length + ' files');
  process.exit(drift ? 1 : 0);
}
