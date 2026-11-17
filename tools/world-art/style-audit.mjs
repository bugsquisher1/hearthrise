// tools/world-art/style-audit.mjs — read-only whole-world STYLE-CONSISTENCY measurement (2026-11-16).
// For every sprite in every shipped atlas (assets/world/atlas-*.json) it measures, on the first south
// idle frame: outline (share of edge pixels that are dark, mean edge luma), palette (saturation, distinct
// colours per 100 px), texture (inner-edge density: neighbour pairs whose luma differs by > 24, and mean
// neighbour contrast), light (luma of the upper-left half minus the lower-right half of the mass) and
// where it is placed (files under src/data that name it). Then it z-scores each sprite against the
// dominant style (the median of the PROPS and BUILDINGS of the town sets) and writes
// art/review/style-audit/metrics.json + outliers.txt. With --crops it writes x4 nearest crops.
//   node tools/world-art/style-audit.mjs [--crops] [--top N]
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, createImage, blit, scaleNearest } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'art/review/style-audit');
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const CROPS = args.includes('--crops');

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
function sat(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; }

function measure(img, x0, y0, w, h) {
  const px = (x, y) => { const i = ((y0 + y) * img.width + x0 + x) * 4; return img.data[i + 3] > 127 ? [img.data[i], img.data[i + 1], img.data[i + 2]] : null; };
  let n = 0, sS = 0, sL = 0; const cols = new Set();
  let edge = 0, edgeDark = 0, edgeL = 0, inner = 0, innerDiff = 0, innerPairs = 0, innerC = 0;
  let minx = w, maxx = -1, miny = h, maxy = -1;
  const L = new Float32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = px(x, y); if (!p) continue;
    n++; sS += sat(...p); const l = luma(...p); sL += l; L[y * w + x] = l; cols.add(p.join(','));
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
  }
  if (n < 12) return null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = L[y * w + x]; if (l < 0) continue;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => { const X = x + dx, Y = y + dy; return X < 0 || Y < 0 || X >= w || Y >= h ? -1 : L[Y * w + X]; });
    if (nb.some((v) => v < 0)) { edge++; edgeL += l; if (l < 60) edgeDark++; }
    else { inner++; for (const v of nb) { innerPairs++; const d = Math.abs(v - l); innerC += d; if (d > 24) innerDiff++; } }
  }
  // light: mean luma of the upper-left vs lower-right half of the bbox, over inner pixels only
  let ul = 0, nul = 0, lr = 0, nlr = 0;
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = L[y * w + x]; if (l < 0) continue;
    const d = (x - cx) / Math.max(1, maxx - minx) + (y - cy) / Math.max(1, maxy - miny);
    if (d < -0.15) { ul += l; nul++; } else if (d > 0.15) { lr += l; nlr++; }
  }
  // pixel grid: colour changes between column x and x+1 (rows likewise) by the parity of x. A sprite drawn at 2x
  // density (every art pixel doubled) has almost no changes at odd x; an even split is native 1x.
  let tx = [0, 0], ty = [0, 0], semi = 0;
  const at = (x, y) => (y0 + y) * img.width + x0 + x;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = at(x, y) * 4; const a = img.data[i + 3]; if (a > 0 && a < 255) semi++;
    if (x + 1 < w) { const j = at(x + 1, y) * 4; if (img.data[i + 3] > 127 && img.data[j + 3] > 127 && (img.data[i] !== img.data[j] || img.data[i + 1] !== img.data[j + 1] || img.data[i + 2] !== img.data[j + 2])) tx[x & 1]++; }
    if (y + 1 < h) { const j = at(x, y + 1) * 4; if (img.data[i + 3] > 127 && img.data[j + 3] > 127 && (img.data[i] !== img.data[j] || img.data[i + 1] !== img.data[j + 1] || img.data[i + 2] !== img.data[j + 2])) ty[y & 1]++; }
  }
  const dbl = (t) => (t[0] + t[1] > 40 ? +(Math.min(t[0], t[1]) / Math.max(t[0], t[1])).toFixed(3) : 1);
  return {
    grid2: Math.min(dbl(tx), dbl(ty)), semi_alpha: semi,    // grid2 near 0 = the art is a 2x upscale; semi_alpha > 0 = resampled edge
    px: n, w: maxx - minx + 1, h: maxy - miny + 1,
    outline_dark: edge ? +(edgeDark / edge).toFixed(3) : 0,       // share of rim pixels that are near-black
    outline_luma: edge ? +(edgeL / edge).toFixed(1) : 0,
    sat: +(sS / n).toFixed(3), luma: +(sL / n).toFixed(1),
    colours_per100: +(cols.size / n * 100).toFixed(1), colours: cols.size,
    grain: innerPairs ? +(innerDiff / innerPairs).toFixed(3) : 0,    // texture density: share of inner neighbour pairs that step > 24 luma
    contrast: innerPairs ? +(innerC / innerPairs).toFixed(1) : 0,
    light: nul && nlr ? +((ul / nul) - (lr / nlr)).toFixed(1) : 0,  // > 0 = lit from the upper left
  };
}

// ---- placement index: which src/data files name each sprite id
function walk(d, out = []) { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p, out); else if (/\.(js|mjs)$/.test(f.name)) out.push(p); } return out; }
const srcFiles = walk(join(ROOT, 'src/data')).map((p) => [p.slice(ROOT.length + 1).replace(/\\/g, '/'), readFileSync(p, 'utf8')]);
const placedIn = (id) => {
  const re = new RegExp(`(^|[^A-Za-z0-9_])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`);
  return srcFiles.filter(([, t]) => re.test(t)).map(([f]) => f).filter((f) => !/atlas-sets|art-budget|monster-names/.test(f));
};

// ---- measure
const dir = join(ROOT, 'assets/world');
const rows = [];
for (const f of readdirSync(dir).filter((x) => /^atlas-.*\.json$/.test(x))) {
  const a = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const img = decodePNG(readFileSync(join(dir, a.image)));
  for (const [id, s] of Object.entries(a.sprites)) {
    if (s.layer === 'fx' || /^(fx_|hearth_(burn|fire|flare))/.test(id)) continue;
    const idle = s.anims.idle || Object.values(s.anims)[0];
    const d = idle.dirs.s || Object.values(idle.dirs)[0];
    if (!d) continue;
    const [x, y] = d[0];
    const m = measure(img, x, y, s.frame[0], s.frame[1]);
    if (!m) continue;
    rows.push({ set: a.set, id, class: s.class, layer: s.layer, frame: s.frame, at: [x, y], placed: placedIn(id), ...m });
  }
}

// ---- dominant style = median of props/buildings (not units, not decals)
const KEYS = ['outline_dark', 'sat', 'colours_per100', 'grain', 'contrast', 'light'];
const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
const mad = (a, m) => med(a.map((v) => Math.abs(v - m))) || 0.001;
const ref = rows.filter((r) => r.layer === 'prop' && r.px > 150 && r.placed.length);
const dom = {}; for (const k of KEYS) { const v = ref.map((r) => r[k]); const m = med(v); dom[k] = { med: m, mad: mad(v, m) }; }
for (const r of rows) {
  r.z = {}; for (const k of KEYS) r.z[k] = +((r[k] - dom[k].med) / (1.4826 * dom[k].mad)).toFixed(2);
  const flat = r.layer === 'decal' || r.class === 'decal' || r.class === 'loot';
  r.score = +((flat ? 0 : Math.abs(r.z.outline_dark)) + Math.abs(r.z.grain) + Math.abs(r.z.colours_per100) * 0.7 + Math.abs(r.z.contrast) * 0.7 + Math.abs(r.z.sat) * 0.5).toFixed(2);
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify({ dominant: dom, rows }, null, 1));
const ranked = rows.filter((r) => r.placed.length && r.px > 60).sort((a, b) => b.score - a.score);
writeFileSync(join(OUT, 'outliers.txt'), `dominant ${JSON.stringify(dom)}\n` + ranked.map((r) => `${r.score}\t${r.set}/${r.id}\t${r.class}\tzd=${r.z.outline_dark} zg=${r.z.grain} zc=${r.z.colours_per100} zk=${r.z.contrast} zs=${r.z.sat} zl=${r.z.light}\t${r.placed.join(',')}`).join('\n'));
console.log(`${rows.length} sprites measured, ${ranked.length} placed; wrote ${OUT}`);

if (CROPS) {
  const atlasImg = {}; const get = (set) => (atlasImg[set] ||= decodePNG(readFileSync(join(dir, `atlas-${set}.png`))));
  const crop = (r) => { const im = createImage(r.frame[0], r.frame[1]); blit(im, get(r.set), r.at[0], r.at[1], r.frame[0], r.frame[1], 0, 0, false); return im; };
  const N = +(args[args.indexOf('--top') + 1] || 40);
  const sheet = (list, name, k = 3) => {
    const cell = 128 * 1, cols = 6, rowsN = Math.ceil(list.length / cols);
    const S = createImage(cols * cell, rowsN * cell);
    for (let i = 0; i < S.data.length; i += 4) { S.data[i] = 60; S.data[i + 1] = 66; S.data[i + 2] = 62; S.data[i + 3] = 255; }
    list.forEach((r, i) => { let c = crop(r); const kk = Math.max(1, Math.min(k, Math.floor(cell / Math.max(r.frame[0], r.frame[1])))); c = scaleNearest(c, kk); blit(S, c, 0, 0, Math.min(c.width, cell), Math.min(c.height, cell), (i % cols) * cell, Math.floor(i / cols) * cell, true); });
    writeFileSync(join(OUT, name), encodePNG(S));
  };
  for (let i = 0; i < Math.min(N, ranked.length); i += 24) sheet(ranked.slice(i, i + 24), `outliers-${String(i / 24 + 1)}.png`);
}
