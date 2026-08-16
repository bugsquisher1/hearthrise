/**
 * WAVE MATTE  ·  flattened export -> shipped monster portrait  ·  Art Director
 *
 * The wave1 monsters arrived as Recraft WEB-UI exports: 1024x1024 JPEG, no
 * alpha channel at all, composited onto a flat studio white (and, for
 * `fire_devil`, onto a baked transparency CHECKERBOARD — the UI's own
 * backdrop, exported as pixels).
 *
 * WHY THIS IS DONE LOCALLY AND NOT BY THE VENDOR'S removeBackground ENDPOINT.
 * `art-batch-process.mjs`'s header records what the paid matte actually
 * delivers: a ~3%-translucent SUBJECT INTERIOR, a uniform speckle across the
 * whole canvas that defeats a bbox crop, and a soft-alpha backdrop band. Every
 * one of those is a defect this pipeline then has to undo. A flat, uniform,
 * known key does not need a learned matte — it needs a flood fill — and doing
 * it here is deterministic, re-runnable at zero marginal cost, and inspectable.
 *
 * THE THREE THINGS THAT MAKE IT CORRECT RATHER THAN A THRESHOLD:
 *
 *  1. FLOOD FILL FROM THE BORDER, never a global "white is transparent" test.
 *     A global test punches holes through every tooth, eye highlight, bone,
 *     ivory tusk and white beard in the set — and this wave has a frost giant,
 *     a mountain ram, a banshee and a mammoth in it. Connectivity is what
 *     distinguishes "the backdrop" from "a white thing in front of it".
 *
 *  2. THE KEY IS MEASURED, NOT ASSUMED. The border ring's own modal colours
 *     define it, so the checkerboard file needs no special case: its two greys
 *     are simply the two modes that turn up, and the key becomes "neutral and
 *     lighter than the darker of them".
 *
 *  3. COLOUR DECONTAMINATION on the soft edge. JPEG ringing plus the painter's
 *     anti-aliasing leave a 1-2 px band that is part subject, part key. Given
 *     the alpha we chose, the key's contribution is UNMIXED back out
 *     (c = (c - (1-a)*key) / a). Skip it and every dark subject in the set
 *     ships with a white halo, which is invisible on a light review surface
 *     and glaring on hearthlight — the exact failure mode this project keeps
 *     rediscovering.
 *
 * Output matches the shipped pilot's contract: 256x256 SQUARE, colour type 6,
 * subject contained and centred, alpha snapped so the interior is truly solid.
 *
 *   node tools/art-wave-matte.mjs <srcDir> <destDir> [--px 256] [--tsv f]
 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const a = process.argv.slice(2);
const SRC = a[0], DEST = a[1];
const opt = (n, d) => { const i = a.indexOf(n); return i > 0 ? a[i + 1] : d; };
const PX = +opt('--px', 256);
const TSV = opt('--tsv', '');

function walk(d) { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(walk(p)); else if (/\.(png|jpe?g)$/i.test(e.name)) o.push(p); } return o; }
function hdr(f) { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), ct: b[25], bytes: b.length }; }
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

const files = walk(SRC).sort();
const rows = [];
for (const src of files) {
  const rel = path.relative(SRC, src).replace(/\\/g, '/').replace(/\.(png|jpe?g)$/i, '.png');
  const mime = /\.png$/i.test(src) ? 'png' : 'jpeg';
  const dataUrl = `data:image/${mime};base64,` + fs.readFileSync(src).toString('base64');

  const out = await page.evaluate(async ({ dataUrl, PX }) => {
    const NEUTRAL = 16;   // max-min channel spread still counted as "neutral"
    const SPREAD  = 46;   // luminance ramp width of the soft edge
    const BAND    = 2;    // px of soft edge kept around the fill
    const HIGH = 240, LOW = 32;          // alpha snap, as art-batch-process
    const MIN_RUN_FRAC = 0.004;          // projection crop, as art-batch-process

    const img = new Image(); img.src = dataUrl; await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight, N = W * H;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, W, H);
    const d = im.data;

    const lum = new Uint8ClampedArray(N);
    const neutral = new Uint8Array(N);
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      lum[p] = (r * 299 + gg * 587 + b * 114) / 1000;
      neutral[p] = (Math.max(r, gg, b) - Math.min(r, gg, b)) <= NEUTRAL ? 1 : 0;
    }

    // ── 1. MEASURE THE KEY off the border ring (see header note 2) ─────────
    const ringIdx = [];
    for (let x = 0; x < W; x++) { ringIdx.push(x, W + x, (H - 1) * W + x, (H - 2) * W + x); }
    for (let y = 2; y < H - 2; y++) { ringIdx.push(y * W, y * W + 1, y * W + W - 1, y * W + W - 2); }
    const bins = new Map();
    for (const p of ringIdx) {
      if (!neutral[p] || lum[p] < 150) continue;
      const k = lum[p] >> 4;
      const e = bins.get(k) || { n: 0, s: 0 }; e.n++; e.s += lum[p]; bins.set(k, e);
    }
    const modes = [...bins.entries()].filter(([, e]) => e.n / ringIdx.length > 0.06)
      .map(([, e]) => e.s / e.n).sort((p, q) => p - q);
    if (!modes.length) return { error: 'no light neutral key on the border ring' };
    const keyLum = modes[modes.length - 1];          // the brightest key tone
    const floorLum = modes[0] - 10;                  // the darkest key tone, with slack
    const isKey = (p) => neutral[p] && lum[p] >= floorLum;

    // ── 2. FLOOD FILL from every keyed border pixel (see header note 1) ────
    const bg = new Uint8Array(N);
    const stack = [];
    for (const p of ringIdx) if (isKey(p) && !bg[p]) { bg[p] = 1; stack.push(p); }
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      if (x > 0     && !bg[p - 1] && isKey(p - 1)) { bg[p - 1] = 1; stack.push(p - 1); }
      if (x < W - 1 && !bg[p + 1] && isKey(p + 1)) { bg[p + 1] = 1; stack.push(p + 1); }
      if (y > 0     && !bg[p - W] && isKey(p - W)) { bg[p - W] = 1; stack.push(p - W); }
      if (y < H - 1 && !bg[p + W] && isKey(p + W)) { bg[p + W] = 1; stack.push(p + W); }
    }
    // ── 2b. TRAPPED BACKGROUND (see header note 4) ─────────────────────────
    // The border fill cannot reach a key region ENCLOSED by the subject — the
    // white between a mammoth's trunk and its tusks, inside a wyvern's furled
    // wing, between a brood spider's legs. Left in, those ship as blown-out
    // white blobs. But most white in this wave is PAINT (a frost giant's
    // beard, a ram's fleece, a banshee's smoke) and must survive, so the test
    // is not "is it white" — it is "is it FLAT": the composited backdrop is a
    // single value with no brush texture, so a component whose luminance
    // standard deviation is near zero over a meaningful area is backdrop and
    // anything a hand painted is not.
    // FLAT_AREA is deliberately generous (1200 px at 1024 ~= a 35x35 patch, or
    // ~9x9 once downscaled to 256). Anything smaller is not visible at the
    // 56-96 px the portrait actually renders at, so removing it buys nothing
    // and risks punching a hole in a flat ivory or bone highlight. Set to 300
    // it took two small bites out of the mammoth's tusk; the big four trapped
    // regions are all 3800 px and up, so the threshold costs nothing real.
    const FLAT_STD = 2.5, FLAT_AREA = 1200;
    const seen = new Uint8Array(N);
    let trappedN = 0, trappedComp = 0;
    for (let p0 = 0; p0 < N; p0++) {
      if (bg[p0] || seen[p0] || !isKey(p0)) continue;
      const comp = []; const st = [p0]; seen[p0] = 1;
      let sum = 0, sum2 = 0;
      while (st.length) {
        const p = st.pop(); comp.push(p); sum += lum[p]; sum2 += lum[p] * lum[p];
        const x = p % W, y = (p / W) | 0;
        const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
        for (const q of nb) if (q >= 0 && !seen[q] && !bg[q] && isKey(q)) { seen[q] = 1; st.push(q); }
      }
      if (comp.length < FLAT_AREA) continue;
      const mean = sum / comp.length;
      const std = Math.sqrt(Math.max(0, sum2 / comp.length - mean * mean));
      if (std > FLAT_STD || mean < keyLum - 4) continue;
      for (const p of comp) bg[p] = 1;
      trappedN += comp.length; trappedComp++;
    }

    let bgN = 0; for (let p = 0; p < N; p++) bgN += bg[p];

    // ── 3. SOFT EDGE + DECONTAMINATION (see header note 3) ─────────────────
    // The band = non-bg pixels within BAND px of the fill. Only these get a
    // partial alpha; everything else the fill did not reach is solid subject.
    const band = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x; if (bg[p]) continue;
      let near = 0;
      for (let dy = -BAND; dy <= BAND && !near; dy++) for (let dx = -BAND; dx <= BAND; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (bg[ny * W + nx]) { near = 1; break; }
      }
      band[p] = near;
    }
    let softN = 0;
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      if (bg[p]) { d[i + 3] = 0; continue; }
      if (!band[p]) { d[i + 3] = 255; continue; }
      const t = (keyLum - lum[p]) / SPREAD;
      const al = t <= 0 ? 0 : t >= 1 ? 1 : t;
      d[i + 3] = Math.round(al * 255);
      if (al > 0.004 && al < 1) {
        softN++;
        for (let k = 0; k < 3; k++) {
          d[i + k] = Math.max(0, Math.min(255, Math.round((d[i + k] - (1 - al) * keyLum) / al)));
        }
      }
    }
    // alpha snap — the interior must be genuinely solid
    for (let i = 3; i < d.length; i += 4) {
      const al = d[i]; if (al >= HIGH) d[i] = 255; else if (al <= LOW) d[i] = 0;
    }
    g.putImageData(im, 0, 0);

    // ── 4. PROJECTION CROP (speckle-immune; art-batch-process's lesson) ────
    const colN = new Uint32Array(W), rowN = new Uint32Array(H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] >= 128) { colN[x]++; rowN[y]++; }
    const needC = Math.max(2, Math.round(H * MIN_RUN_FRAC));
    const needR = Math.max(2, Math.round(W * MIN_RUN_FRAC));
    let minX = 0, maxX = W - 1, minY = 0, maxY = H - 1;
    while (minX < W && colN[minX] < needC) minX++;
    while (maxX >= 0 && colN[maxX] < needC) maxX--;
    while (minY < H && rowN[minY] < needR) minY++;
    while (maxY >= 0 && rowN[maxY] < needR) maxY--;
    if (maxX < minX || maxY < minY) return { error: 'no content after matte' };
    minX = Math.max(0, minX - 1); minY = Math.max(0, minY - 1);
    maxX = Math.min(W - 1, maxX + 1); maxY = Math.min(H - 1, maxY + 1);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;

    // ── 5. FIT INTO A SQUARE PX x PX, CENTRED — the shipped pilot's shape ──
    const inner = PX - 2;                       // 1 px breathing room each side
    const s = Math.min(inner / cw, inner / ch);
    const dw = Math.max(1, Math.round(cw * s)), dh = Math.max(1, Math.round(ch * s));
    const o = document.createElement('canvas'); o.width = PX; o.height = PX;
    const og = o.getContext('2d', { willReadFrequently: true });
    og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
    og.clearRect(0, 0, PX, PX);
    og.drawImage(c, minX, minY, cw, ch, Math.round((PX - dw) / 2), Math.round((PX - dh) / 2), dw, dh);

    const od = og.getImageData(0, 0, PX, PX).data;
    let opq = 0, tr = 0;
    for (let i = 3; i < od.length; i += 4) { if (od[i] === 255) opq++; else if (od[i] === 0) tr++; }
    const at = (x, y) => od[(y * PX + x) * 4 + 3];
    const corners = [at(0, 0), at(PX - 1, 0), at(0, PX - 1), at(PX - 1, PX - 1)];

    return {
      srcW: W, srcH: H, keyLum: Math.round(keyLum), floorLum: Math.round(floorLum), modes: modes.length,
      bgPct: +(100 * bgN / N).toFixed(1), softPct: +(100 * softN / N).toFixed(2),
      trappedPct: +(100 * trappedN / N).toFixed(2), trappedComp,
      crop: `${cw}x${ch}@${minX},${minY}`, cw, ch,
      opaquePct: +(100 * opq / (PX * PX)).toFixed(1), transPct: +(100 * tr / (PX * PX)).toFixed(1),
      corners, png: o.toDataURL('image/png'),
    };
  }, { dataUrl, PX });

  if (out.error) { rows.push({ rel, error: out.error }); console.log('ERROR', rel, out.error); continue; }
  const dst = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, Buffer.from(out.png.split(',')[1], 'base64'));
  const h = hdr(dst);
  rows.push({ rel, ...out, png: undefined, ct: h.ct, kb: +(h.bytes / 1024).toFixed(0), w: h.w, hh: h.h });
}
await browser.close();

const ok = rows.filter((r) => !r.error);
const head = 'file\tkey\tfloor\tmodes\tbg%\tsoft%\ttrapped%\ttrapN\tcrop\tout\tct\tKB\topaque%\ttrans%\tcorners';
const lines = ok.map((r) => [r.rel, r.keyLum, r.floorLum, r.modes, r.bgPct, r.softPct, r.trappedPct, r.trappedComp, r.crop,
  `${r.w}x${r.hh}`, r.ct, r.kb, r.opaquePct, r.transPct, r.corners.join(',')].join('\t'));
if (TSV) fs.writeFileSync(TSV, [head, ...lines].join('\n'));
console.log(head); lines.forEach((l) => console.log(l));

const badCt = ok.filter((r) => r.ct !== 6);
const badCorner = ok.filter((r) => r.corners.some((v) => v > 8));
const thinKey = ok.filter((r) => r.bgPct < 8);
const ateSubject = ok.filter((r) => r.bgPct > 92);
const notSquare = ok.filter((r) => r.w !== PX || r.hh !== PX);
console.log(`\nprocessed ${ok.length}  errors ${rows.length - ok.length}`);
console.log(`colour type 6: ${ok.length - badCt.length}/${ok.length}` + (badCt.length ? ' FAIL ' + badCt.map((r) => r.rel).join(',') : ''));
console.log(`square ${PX}: ${ok.length - notSquare.length}/${ok.length}` + (notSquare.length ? ' FAIL ' + notSquare.map((r) => r.rel).join(',') : ''));
console.log(`corner alpha == 0: ${ok.length - badCorner.length}/${ok.length}` + (badCorner.length ? ' FAIL ' + badCorner.map((r) => `${r.rel}[${r.corners}]`).join(', ') : ''));
console.log(`SUSPECT key barely fired (bg<8%): ${thinKey.map((r) => `${r.rel}(${r.bgPct})`).join(', ') || 'none'}`);
console.log(`SUSPECT key ate the subject (bg>92%): ${ateSubject.map((r) => `${r.rel}(${r.bgPct})`).join(', ') || 'none'}`);
console.log(`total ${(ok.reduce((s, r) => s + r.kb, 0) / 1024).toFixed(1)} MB  mean ${(ok.reduce((s, r) => s + r.kb, 0) / ok.length).toFixed(0)} KB`);
