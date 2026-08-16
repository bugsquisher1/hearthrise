/**
 * Hearthfire FULL ITEM BATCH processor  ·  Art Director, 2026-08-16
 *
 * Descends from `tools/art-pilot-process.mjs` (13 images) and keeps its two
 * proven ideas — measure alpha in a real browser, and normalise the export's
 * translucent interior BEFORE the downscale so the resample interpolates
 * already-correct values. Two things had to change to survive 512 images:
 *
 *  1. THE BBOX CROP DID NOT FIRE. On the full batch, 501 of 512 sources
 *     returned a content bbox of exactly 1024x1024 — i.e. no crop at all —
 *     even though the subject occupies a fraction of the frame. Cause: the
 *     Recraft export carries a faint uniform speckle across the WHOLE canvas
 *     (~0.1% of pixels in every one of the 16 alpha bins, corners measured at
 *     alpha 2-32). A `max over any pixel with a > 8` bbox therefore always
 *     hits the frame edge; raising the threshold to 128 did not help, because
 *     the speckle reaches that high too. The fix is to stop asking "is any
 *     pixel here?" and ask "does this row/column carry CONTENT?" — a
 *     projection with a minimum run, which is immune to isolated speckle.
 *
 *  2. THE SPECKLE HAD TO BE ERASED, not merely ignored. Left in, it renders
 *     as a faint grey haze over the whole 64 px box on the dark hearthlight
 *     surface — 512 slightly-dirty tiles. Alphas at or below LOW are zeroed.
 *     That band is a <13%-opacity fringe: measured, it is ~0.5% of pixels and
 *     none of it is the painted anti-aliased edge (the histogram is strongly
 *     bimodal, 0-15 and 240-255, with the real edge ramp living above LOW).
 *
 * Usage: node tools/art-batch-process.mjs <src> <dest> [--px 256] [--tsv f]
 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const argv = process.argv.slice(2);
const SRC = argv[0];
const DEST = argv[1];
const arg = (n, d) => { const i = argv.indexOf(n); return i > 0 ? argv[i + 1] : d; };
const ITEM_PX = +arg('--px', 256);
const TSV = arg('--tsv', '');

const HIGH = 240;   // >= this is "the artist meant solid"      -> 255
const LOW  = 32;    // <= this is export speckle / dead fringe   -> 0
const MIN_RUN_FRAC = 0.004;  // a row/col needs this fraction of its length in
                             // >=128-alpha pixels to count as content (~4 px
                             // of 1024) — kills speckle, keeps a sword tip.

function walk(d) { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(walk(p)); else if (/\.png$/i.test(e.name)) o.push(p); } return o; }
function hdr(f) { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], ct: b[25], bytes: b.length }; }

/* Walk up for node_modules rather than assuming it sits next to the tool: a
   git worktree has no node_modules of its own, and hardcoding the main
   checkout's absolute path would make this tool machine-specific. */
export function findPlaywright(from) {
  let d = from;
  for (let i = 0; i < 8; i++) {
    const p = path.join(d, 'node_modules', 'playwright', 'index.mjs');
    if (fs.existsSync(p)) return url.pathToFileURL(p).href;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error('playwright not found walking up from ' + from);
}
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const { chromium } = await import(findPlaywright(HERE));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');

const rows = [];
for (const src of walk(SRC)) {
  const rel = path.relative(SRC, src).replace(/\\/g, '/');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(src).toString('base64');

  const out = await page.evaluate(async ({ dataUrl, ITEM_PX, HIGH, LOW, MIN_RUN_FRAC }) => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;

    let srcOpaque = 0, srcTrans = 0, srcPartial = 0;
    for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a === 255) srcOpaque++; else if (a === 0) srcTrans++; else srcPartial++; }
    const at = (x, y) => d[(y * W + x) * 4 + 3];
    const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];

    // ── ALPHA NORMALISE (see header) ──────────────────────────────────────
    let lifted = 0, zeroed = 0;
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i];
      if (a >= HIGH) { if (a !== 255) { d[i] = 255; lifted++; } }
      else if (a <= LOW) { if (a !== 0) { d[i] = 0; zeroed++; } }
    }
    g.putImageData(new ImageData(d, W, H), 0, 0);

    // ── PROJECTION CROP (see header) ──────────────────────────────────────
    const colN = new Uint32Array(W), rowN = new Uint32Array(H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (d[(y * W + x) * 4 + 3] >= 128) { colN[x]++; rowN[y]++; } }
    const needC = Math.max(2, Math.round(H * MIN_RUN_FRAC));
    const needR = Math.max(2, Math.round(W * MIN_RUN_FRAC));
    let minX = 0, maxX = W - 1, minY = 0, maxY = H - 1;
    while (minX < W && colN[minX] < needC) minX++;
    while (maxX >= 0 && colN[maxX] < needC) maxX--;
    while (minY < H && rowN[minY] < needR) minY++;
    while (maxY >= 0 && rowN[maxY] < needR) maxY--;
    if (maxX < minX || maxY < minY) return { error: 'no content after normalise' };
    // one-pixel breathing room so a hard-cropped edge never touches the frame
    minX = Math.max(0, minX - 1); minY = Math.max(0, minY - 1);
    maxX = Math.min(W - 1, maxX + 1); maxY = Math.min(H - 1, maxY + 1);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;

    const s = Math.min(1, ITEM_PX / Math.max(cw, ch));
    const outW = Math.max(1, Math.round(cw * s)), outH = Math.max(1, Math.round(ch * s));

    const o = document.createElement('canvas'); o.width = outW; o.height = outH;
    const og = o.getContext('2d', { willReadFrequently: true });
    og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
    og.clearRect(0, 0, outW, outH);
    og.drawImage(c, minX, minY, cw, ch, 0, 0, outW, outH);

    const od = og.getImageData(0, 0, outW, outH).data;
    let oOpaque = 0, oTrans = 0;
    for (let i = 3; i < od.length; i += 4) { if (od[i] === 255) oOpaque++; else if (od[i] === 0) oTrans++; }

    return {
      srcW: W, srcH: H, cropX: minX, cropY: minY, cropW: cw, cropH: ch,
      srcOpaquePct: +(100 * srcOpaque / (W * H)).toFixed(1),
      srcTransPct: +(100 * srcTrans / (W * H)).toFixed(1),
      srcPartialPct: +(100 * srcPartial / (W * H)).toFixed(1),
      liftedPct: +(100 * lifted / (W * H)).toFixed(2),
      zeroedPct: +(100 * zeroed / (W * H)).toFixed(2),
      corners, outW, outH,
      outOpaquePct: +(100 * oOpaque / (outW * outH)).toFixed(1),
      outTransPct: +(100 * oTrans / (outW * outH)).toFixed(1),
      png: o.toDataURL('image/png'),
    };
  }, { dataUrl, ITEM_PX, HIGH, LOW, MIN_RUN_FRAC });

  if (out.error) { rows.push({ rel, error: out.error }); continue; }
  const dst = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, Buffer.from(out.png.split(',')[1], 'base64'));
  const h = hdr(dst);
  rows.push({ rel, ...out, png: undefined, outCt: h.ct, outBytes: h.bytes, outHdrW: h.w, outHdrH: h.h });
}
await browser.close();

const head = 'file\tsrc\tcrop\tsrc op/tr/part %\tlifted%\tzeroed%\tcorners\tout\tct\tKB\tout op/tr %';
const lines = rows.map((r) => r.error ? `${r.rel}\tERROR ${r.error}` : [
  r.rel, `${r.srcW}x${r.srcH}`, `${r.cropW}x${r.cropH}@${r.cropX},${r.cropY}`,
  `${r.srcOpaquePct}/${r.srcTransPct}/${r.srcPartialPct}`, r.liftedPct, r.zeroedPct,
  r.corners.join(','), `${r.outHdrW}x${r.outHdrH}`, r.outCt, (r.outBytes / 1024).toFixed(0),
  `${r.outOpaquePct}/${r.outTransPct}`,
].join('\t'));
if (TSV) fs.writeFileSync(TSV, [head, ...lines].join('\n'));

const ok = rows.filter((r) => !r.error);
const bad = rows.filter((r) => r.error);
const totalKB = ok.reduce((a, r) => a + r.outBytes, 0) / 1024;
const badCt = ok.filter((r) => r.outCt !== 6);
console.log(`processed ${ok.length}  errors ${bad.length}  long-edge ${ITEM_PX}px`);
console.log(`total ${(totalKB / 1024).toFixed(1)} MB   mean ${(totalKB / ok.length).toFixed(0)} KB   max ${(Math.max(...ok.map(r => r.outBytes)) / 1024).toFixed(0)} KB`);
console.log(`colour type 6 (RGBA): ${ok.length - badCt.length}/${ok.length}` + (badCt.length ? '  FAIL: ' + badCt.map(r => r.rel).join(',') : ''));
console.log(`uncropped (crop == source frame): ${ok.filter(r => r.cropW === r.srcW && r.cropH === r.srcH).length}`);
console.log(`mean out opaque% ${(ok.reduce((a, r) => a + r.outOpaquePct, 0) / ok.length).toFixed(1)}  mean out transparent% ${(ok.reduce((a, r) => a + r.outTransPct, 0) / ok.length).toFixed(1)}`);
bad.forEach((r) => console.log('ERROR', r.rel, r.error));
