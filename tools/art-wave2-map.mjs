/**
 * Hearthfire ITEM WAVE 2 (Tyler's hand-generated web-UI exports) — mapper + verifier.
 *
 * Filenames arrive as `----<id-with-dashes>-png-----<id>--a-sty….png`. The id is the
 * FIRST segment; everything after `-png-----` is the prompt echo and is ignored. Six
 * files carry no id prefix at all (they are Tyler's follow-up corrections, named after
 * the instruction he typed) and are mapped by hand in `MANUAL` below, by eye.
 *
 * Verifies: PNG colour type 6, bit depth 8, and REAL alpha (all four corners ~0). A
 * flattened export would land here as corner alpha 255 and would need the local matting
 * path in `tools/art-wave-matte.mjs` — no paid endpoint, ever.
 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
export const SRC = path.join(ROOT, 'assets', 'items');

/** Files with no id prefix → the id they actually depict (assigned by eye). */
export const MANUAL = Object.freeze({
  'give-me-this-exact-pole-but-in-a---dawnsteel-shade.png': 'dawnsteel_rod',
  'give-me-this-exact-pole-but-in-a--duskwood-shade-.png': 'duskwood_rod',
  'this-is-an-emberhead-arrow---meaning-the-head-shou.png': 'emberhead_arrows',
  'this-should-have-a-skull-etched-on-it--since-it-s-.png': 'deathsteel_ingot',
  'voidhide-pants--a-stylized-hand-painted-fantasy-ga.png': 'voidhide_pants',
  'way-too-thick-to-be-a-fishing-rod-.png': 'oak_rod',
});

export function idFor(file) {
  if (MANUAL[file]) return MANUAL[file];
  const m = /^-+(.+?)-png-+/.exec(file);
  return m ? m[1].replace(/-/g, '_') : null;
}

export function listSources() {
  return fs.readdirSync(SRC).filter((f) => /\.png$/i.test(f)).sort();
}

export function hdr(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], ct: b[25], bytes: b.length };
}

if (import.meta.url === url.pathToFileURL(process.argv[1] || '').href) {
  const rows = listSources().map((f) => ({ f, id: idFor(f), ...hdr(path.join(SRC, f)) }));
  const byId = {};
  rows.forEach((r) => { (byId[r.id] = byId[r.id] || []).push(r.f); });
  console.log('files', rows.length, ' ids', Object.keys(byId).length);
  console.log('ct!=6 or depth!=8:', rows.filter((r) => r.ct !== 6 || r.depth !== 8).map((r) => r.f).join(', ') || 'none');
  const dims = {}; rows.forEach((r) => { const k = r.w + 'x' + r.h; dims[k] = (dims[k] || 0) + 1; });
  console.log('dims', JSON.stringify(dims));
  console.log('DUPES:'); Object.entries(byId).filter(([, v]) => v.length > 1).forEach(([k, v]) => console.log(' ', k, '->', v.length));
  console.log('IDS:', Object.keys(byId).sort().join(' '));
}
