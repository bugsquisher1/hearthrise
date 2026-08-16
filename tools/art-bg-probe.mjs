/**
 * Background probe for a wave of FLATTENED exports  ·  Art Director
 *
 * The wave1 monsters are Recraft WEB-UI exports: JPEG, no alpha, and the
 * backdrop is whatever the web UI composited onto. Before choosing a
 * background-removal strategy you have to know what you are removing, and a
 * contact sheet cannot tell you (a 3% off-white and a painted cream sky look
 * identical at 160 px). So: measure.
 *
 * Per file it reports
 *   - the modal border colour (the outer 2-px ring, quantised)
 *   - flat%  — fraction of the border ring within TOL of that colour
 *   - the four corner colours
 *   - checker — a baked transparency checkerboard: the border ring alternates
 *     between exactly two greys on a fixed period. Detected as "the ring has
 *     two modes, both near-grey, and the second is >15% of the ring".
 *
 * A file with flat% < 90 has a PAINTED backdrop and no keying will save it.
 *
 *   node tools/art-bg-probe.mjs <dir> [--tsv out.tsv]
 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const a = process.argv.slice(2);
const DIR = a[0];
const TSVi = a.indexOf('--tsv');
const TSV = TSVi > 0 ? a[TSVi + 1] : '';
const TOL = 18;

function walk(d) { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(walk(p)); else if (/\.(png|jpe?g)$/i.test(e.name)) o.push(p); } return o; }
function findPlaywright(from) {
  let d = from;
  for (let i = 0; i < 8; i++) {
    const p = path.join(d, 'node_modules', 'playwright', 'index.mjs');
    if (fs.existsSync(p)) return url.pathToFileURL(p).href;
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  throw new Error('playwright not found walking up from ' + from);
}
const { chromium } = await import(findPlaywright(path.dirname(url.fileURLToPath(import.meta.url))));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');

const files = walk(DIR).sort();
const rows = [];
for (const f of files) {
  const mime = /\.png$/i.test(f) ? 'png' : 'jpeg';
  const dataUrl = `data:image/${mime};base64,` + fs.readFileSync(f).toString('base64');
  const r = await page.evaluate(async ({ dataUrl, TOL }) => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

    // border ring, 2 px deep
    const ring = [];
    for (let x = 0; x < W; x++) { ring.push(px(x, 0), px(x, 1), px(x, H - 1), px(x, H - 2)); }
    for (let y = 2; y < H - 2; y++) { ring.push(px(0, y), px(1, y), px(W - 1, y), px(W - 2, y)); }

    // modal colour on a 16-step quantisation
    const bins = new Map();
    for (const [r0, g0, b0] of ring) {
      const k = (r0 >> 4) + ',' + (g0 >> 4) + ',' + (b0 >> 4);
      const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r0; e.g += g0; e.b += b0; bins.set(k, e);
    }
    const sorted = [...bins.values()].sort((p, q) => q.n - p.n);
    const m0 = sorted[0], m1 = sorted[1];
    const mode = [Math.round(m0.r / m0.n), Math.round(m0.g / m0.n), Math.round(m0.b / m0.n)];
    const mode2 = m1 ? [Math.round(m1.r / m1.n), Math.round(m1.g / m1.n), Math.round(m1.b / m1.n)] : null;

    let flat = 0;
    for (const [r0, g0, b0] of ring) {
      if (Math.abs(r0 - mode[0]) <= TOL && Math.abs(g0 - mode[1]) <= TOL && Math.abs(b0 - mode[2]) <= TOL) flat++;
    }

    // checkerboard: two near-grey modes, second substantial, and they differ
    const grey = (c3) => Math.max(...c3) - Math.min(...c3) < 12;
    const checker = !!(mode2 && grey(mode) && grey(mode2)
      && m1.n / ring.length > 0.15
      && Math.abs(mode[0] - mode2[0]) > 8 && Math.abs(mode[0] - mode2[0]) < 60);

    return {
      W, H, mode, mode2, m1frac: m1 ? +(m1.n / ring.length).toFixed(3) : 0,
      flat: +(100 * flat / ring.length).toFixed(1),
      corners: [px(0, 0), px(W - 1, 0), px(0, H - 1), px(W - 1, H - 1)],
      checker,
    };
  }, { dataUrl, TOL });
  rows.push({ rel: path.relative(DIR, f).replace(/\\/g, '/'), ...r });
}
await browser.close();

const head = 'file\tWxH\tmode\tflat%\tmode2\tmode2frac\tchecker\tcorners';
const lines = rows.map((r) => [r.rel, `${r.W}x${r.H}`, r.mode.join('.'), r.flat,
  r.mode2 ? r.mode2.join('.') : '-', r.m1frac, r.checker ? 'CHECKER' : '', r.corners.map((c) => c.join('.')).join(' ')].join('\t'));
if (TSV) fs.writeFileSync(TSV, [head, ...lines].join('\n'));
console.log(head); lines.forEach((l) => console.log(l));
console.log(`\n${rows.length} files`);
console.log('PAINTED BACKDROP (flat < 90%):', rows.filter((r) => r.flat < 90).map((r) => `${r.rel}(${r.flat})`).join(', ') || 'none');
console.log('CHECKERBOARD:', rows.filter((r) => r.checker).map((r) => r.rel).join(', ') || 'none');
console.log('NON-WHITE FLAT KEY (mode min < 200):', rows.filter((r) => r.flat >= 90 && Math.min(...r.mode) < 200).map((r) => `${r.rel}(${r.mode.join('.')})`).join(', ') || 'none');
