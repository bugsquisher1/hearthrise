// tools/world-art/style-crop.mjs — read-only: one x-scaled contact strip of atlas sprites, to READ side by side.
//   node tools/world-art/style-crop.mjs <out.png> <scale> <set:id> [<set:id> ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, createImage, blit, scaleNearest } from './png.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [out, k, ...ids0] = process.argv.slice(2);
// `--terrain`: the interior tile (1111) of every terrain of every atlas, 3 per row group, x2, with mean luma/sat printed.
if (ids0[0] === '--terrain') {
  const { readdirSync } = await import('node:fs');
  const tiles = [];
  for (const f of readdirSync(join(ROOT, 'assets/world')).filter((n) => /^atlas-.*\.json$/.test(n))) {
    const a = JSON.parse(readFileSync(join(ROOT, 'assets/world', f), 'utf8'));
    if (!a.terrain) continue;
    const img = decodePNG(readFileSync(join(ROOT, 'assets/world', a.image)));
    for (const [id, t] of Object.entries(a.terrain)) {
      const list = t.tiles['1111'] || Object.values(t.tiles)[0];
      const seen = new Set();
      for (const [x, y] of list) { const key = `${x},${y}`; if (seen.has(key) || seen.size >= 3) continue; seen.add(key); const c = createImage(32, 32); blit(c, img, x, y, 32, 32, 0, 0, false); tiles.push({ id: `${a.set}:${id}`, img: c }); }
    }
  }
  const cols = 24, S = createImage(cols * 66, Math.ceil(tiles.length / cols) * 66);
  tiles.forEach((t, i) => blit(S, scaleNearest(t.img, 2), 0, 0, 64, 64, (i % cols) * 66, Math.floor(i / cols) * 66, true));
  writeFileSync(out, encodePNG(S));
  console.log(tiles.map((t, i) => `${i}:${t.id}`).join(' '));
  process.exit(0);
}
// `--set <name>` instead of ids: every placed, non-decal sprite of that atlas set (from metrics.json), shelf-packed, x2 up to 64 px, x1 above.
let ids = ids0;
const SET = ids0[0] === '--set';
if (SET) {
  const m = JSON.parse(readFileSync(join(ROOT, 'art/review/style-audit/metrics.json'), 'utf8'));
  ids = m.rows.filter((r) => r.set === ids0[1] && r.placed.length && r.layer !== 'decal').map((r) => `${r.set}:${r.id}`);
  console.log(ids.map((s, i) => `${i}:${s.split(':')[1]}`).join(' '));
}
const items = ids.map((s) => {
  const [set, id] = s.split(':');
  const a = JSON.parse(readFileSync(join(ROOT, `assets/world/atlas-${set}.json`), 'utf8'));
  const sp = a.sprites[id]; if (!sp) throw new Error(`no ${s}`);
  const an = sp.anims.idle || Object.values(sp.anims)[0];
  const [x, y] = (an.dirs.s || Object.values(an.dirs)[0])[0];
  const img = decodePNG(readFileSync(join(ROOT, 'assets/world', a.image)));
  const c = createImage(sp.frame[0], sp.frame[1]);
  blit(c, img, x, y, sp.frame[0], sp.frame[1], 0, 0, false);
  return scaleNearest(c, SET ? (Math.max(sp.frame[0], sp.frame[1]) <= 64 ? 2 : 1) : +k);
});
if (SET) {
  const WW = 1500; let x = 8, y = 8, rowH = 0; const pos = [];
  for (const i of items) { if (x + i.width > WW) { x = 8; y += rowH + 8; rowH = 0; } pos.push([x, y]); x += i.width + 8; rowH = Math.max(rowH, i.height); }
  const S = createImage(WW, y + rowH + 8);
  for (let i = 0; i < S.data.length; i += 4) { S.data[i] = 70; S.data[i + 1] = 76; S.data[i + 2] = 72; S.data[i + 3] = 255; }
  items.forEach((i, n) => blit(S, i, 0, 0, i.width, i.height, pos[n][0], pos[n][1], true));
  writeFileSync(out, encodePNG(S)); process.exit(0);
}
const W = items.reduce((s, i) => s + i.width + 8, 8), H = Math.max(...items.map((i) => i.height)) + 16;
const S = createImage(W, H);
for (let i = 0; i < S.data.length; i += 4) { S.data[i] = 70; S.data[i + 1] = 76; S.data[i + 2] = 72; S.data[i + 3] = 255; }
let x = 8; for (const i of items) { blit(S, i, 0, 0, i.width, i.height, x, 8, true); x += i.width + 8; }
writeFileSync(out, encodePNG(S));
