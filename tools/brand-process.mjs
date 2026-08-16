/**
 * tools/brand-process.mjs — the Hearthrise brand asset pipeline (b360).
 *
 * Takes the four Tyler-approved Recraft exports and produces the shipped set in
 * `assets/brand/`. Deterministic and re-runnable: run it again on the same
 * sources and you get byte-comparable output, so the shipped assets are always
 * DERIVED from the approved originals rather than hand-edited copies nobody can
 * reproduce.
 *
 *   node tools/brand-process.mjs [source-dir]
 *
 * The four approved Recraft exports are kept at `assets/art-pilot/brand-src/`
 * (gitignored, like the rest of art-pilot — source, never shipped) so this is
 * re-runnable without hunting through a Downloads folder. Nothing under
 * assets/brand/ should ever be hand-edited: edit the tool, re-run, look at it.
 *
 * ── WHAT IT DOES, AND WHY EACH STEP EXISTS ──────────────────────────────────
 *
 * 1 · CREST (heraldic shield PNG → transparent, tight-cropped PNG)
 *     The export is gilt linework on a FLAT dark-brown field — measured:
 *     46.9% of the canvas is exactly rgb(42,34,32) and the shield's own
 *     interior is the same value, not a separate fill. So the field is a
 *     matte, not part of the drawing, and keeping it would paste a brown
 *     rectangle onto the sidebar (and onto parchment in cozy-light, where it
 *     would be indefensible). We chroma-key it with a soft ramp and UNMATTE
 *     (recover the true colour of each partially-covered edge pixel) so the
 *     scrollwork keeps its antialiasing instead of gaining a brown fringe.
 *
 * 2 · MARK (the same crest, square-padded) — favicon + PWA icon.
 *
 * 3 · WORDMARK (SVG → SVG)
 *     Three edits, all structural, none redrawn:
 *       a. drop the 11 KB c2pa <metadata> blob (a third of the file);
 *       b. drop the full-canvas background rect — the wordmark has to sit on
 *          the sidebar and on the splash, not on its own dark plate;
 *       c. drop the small sun glyph above the lettering. It is redundant
 *          beside the crest (which is itself a rising sun) and at sidebar
 *          scale it collapses into a smudge. Selected GEOMETRICALLY — every
 *          top-level element whose bbox bottom sits above SUN_CUT — so the
 *          rule is auditable and cannot silently take a letterform with it
 *          (measured: the sun bottoms out at y=472.2, the lettering starts at
 *          y=490.8).
 *     Then the viewBox is tightened onto the measured lettering bbox, so the
 *     consumer can size it by width alone and get no invisible padding.
 *
 *     ── the counters, which the first cut got wrong ──
 *     Four shapes in the letterforms are painted in the PLATE colour
 *     (#151618) rather than being real holes — the TH ligature's gap, the R
 *     bowls, the A counter. Delete the plate and they stop being invisible
 *     and start being near-black blobs; harmless on the hearthlight sidebar,
 *     and obviously broken on cozy-light parchment. Caught by rendering the
 *     first output on BOTH surfaces, not by reading the file. They are
 *     therefore converted into a real <mask>: same pixels on dark, actual
 *     transparency everywhere else.
 *
 * 4 · SPLASH (dawn homestead PNG → JPEG)
 *     1.9 MB of PNG-24 photographic paint on the FIRST screen a player ever
 *     sees, behind a 76% scrim. JPEG q0.86 is visually identical under that
 *     scrim and roughly a tenth of the bytes.
 *
 * 5 · BADGE (hearth roundel SVG → SVG), metadata stripped. Not wired to a
 *     surface yet; available for loading / welcome-back.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || path.join(ROOT, 'assets', 'art-pilot', 'brand-src');
const OUT = path.join(ROOT, 'assets', 'brand');

const SOURCES = {
  crest:  'fantasy-game-logo-emblem--a-heraldic-shield-contai.png',
  word:   'fantasy-rpg-game-logo-with-the-word--hearthrise--i.svg',
  splash: 'warm-panoramic-fantasy-landscape-at-dawn--a-cozy-h.png',
  badge:  'cozy-fantasy-game-logo--a-stone-hearth-with-a-warm.svg',
};

/* Chroma-key ramp, in max-channel distance from the sampled matte colour.
   KEY_LO: measured noise floor of the flat field (41–45 / 30–35 / 30–33 → 5).
   KEY_HI: below this the pixel is treated as a blend and unmatted. */
const KEY_LO = 7;
const KEY_HI = 30;
/* Everything above this y in the wordmark's 1024 canvas is the redundant sun. */
const SUN_CUT = 480;
/* Sized from the measured render sites, not from a round number. The crest's
   largest appearance anywhere is the login lockup at 104 CSS px tall — 312
   device px on a DPR-3 phone — so 384 is 1:1 there with headroom, and it is
   fetched on EVERY page load. 512 cost 270 KB for pixels nothing displays.
   The MARK is a different job: Android's PWA installer wants a real 512, and
   apple-touch-icon is consumed at 180x3 = 540. That one stays big on purpose. */
const CREST_PX  = 384;   // long edge of the transparent crest
const MARK_PX   = 512;   // square favicon / PWA icon
const SPLASH_Q  = 0.86;

fs.mkdirSync(OUT, { recursive: true });
const src = (k) => path.join(SRC, SOURCES[k]);
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const writeDataUrl = (dest, url) => {
  fs.writeFileSync(dest, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  return fs.statSync(dest).size;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
await page.goto('about:blank');

const report = [];

/* ── 1 + 2 · crest + mark ────────────────────────────────────────────────── */
const crest = await page.evaluate(async ({ dataUrl, KEY_LO, KEY_HI, CREST_PX, MARK_PX }) => {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const im = x.getImageData(0, 0, W, H), d = im.data;

  // The matte colour is the modal value of the border ring, not one corner —
  // one corner is a sample size of one.
  const ring = [];
  for (let i = 0; i < W; i += 4) { ring.push((0 * W + i) * 4, ((H - 1) * W + i) * 4); }
  for (let j = 0; j < H; j += 4) { ring.push((j * W) * 4, (j * W + W - 1) * 4); }
  const med = (arr) => arr.sort((a, b) => a - b)[arr.length >> 1];
  const mr = med(ring.map((k) => d[k])), mg = med(ring.map((k) => d[k + 1])), mb = med(ring.map((k) => d[k + 2]));

  let minX = W, minY = H, maxX = -1, maxY = -1, opaque = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 4;
    const dist = Math.max(Math.abs(d[k] - mr), Math.abs(d[k + 1] - mg), Math.abs(d[k + 2] - mb));
    let a = (dist - KEY_LO) / (KEY_HI - KEY_LO);
    a = a <= 0 ? 0 : a >= 1 ? 1 : a;
    if (a === 0) { d[k + 3] = 0; continue; }
    if (a < 1) {
      // unmatte: observed = a*true + (1-a)*matte  →  true = (observed - (1-a)*matte)/a
      for (let ch = 0; ch < 3; ch++) {
        const m = ch === 0 ? mr : ch === 1 ? mg : mb;
        d[k + ch] = Math.max(0, Math.min(255, Math.round((d[k + ch] - (1 - a) * m) / a)));
      }
    }
    d[k + 3] = Math.round(a * 255);
    if (a > 0.5) {
      opaque++;
      if (i < minX) minX = i; if (i > maxX) maxX = i;
      if (j < minY) minY = j; if (j > maxY) maxY = j;
    }
  }
  x.putImageData(im, 0, 0);

  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const scale = CREST_PX / Math.max(cw, ch);
  const t = document.createElement('canvas');
  t.width = Math.round(cw * scale); t.height = Math.round(ch * scale);
  const tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high';
  tx.drawImage(c, minX, minY, cw, ch, 0, 0, t.width, t.height);

  // square-padded copy for the favicon / PWA icon
  const s = document.createElement('canvas'); s.width = s.height = MARK_PX;
  const sx = s.getContext('2d'); sx.imageSmoothingQuality = 'high';
  const k2 = MARK_PX / Math.max(cw, ch);
  const dw = Math.round(cw * k2), dh = Math.round(ch * k2);
  sx.drawImage(c, minX, minY, cw, ch, Math.round((MARK_PX - dw) / 2), Math.round((MARK_PX - dh) / 2), dw, dh);

  return {
    matte: [mr, mg, mb], bbox: [minX, minY, cw, ch],
    opaquePct: +(100 * opaque / (W * H)).toFixed(2),
    crest: t.toDataURL('image/png'), crestW: t.width, crestH: t.height,
    mark: s.toDataURL('image/png'),
  };
}, { dataUrl: b64(src('crest')), KEY_LO, KEY_HI, CREST_PX, MARK_PX });

report.push(['hearthrise-crest.png', `${crest.crestW}x${crest.crestH}`,
  writeDataUrl(path.join(OUT, 'hearthrise-crest.png'), crest.crest),
  `matte rgb(${crest.matte}) · content bbox ${crest.bbox.join(',')} · ${crest.opaquePct}% opaque`]);
report.push(['hearthrise-mark.png', `${MARK_PX}x${MARK_PX}`,
  writeDataUrl(path.join(OUT, 'hearthrise-mark.png'), crest.mark), 'square-padded, favicon + PWA']);

/* ── 3 · wordmark ────────────────────────────────────────────────────────── */
const rawWord = fs.readFileSync(src('word'), 'utf8');
await page.setContent(`<body style="margin:0">${rawWord}</body>`);
const word = await page.evaluate(({ SUN_CUT, PLATE }) => {
  const NS = 'http://www.w3.org/2000/svg';
  const root = document.querySelector('svg');
  const kill = [], defs = [], gold = [], counters = [];
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  [...root.children].forEach((el) => {
    if (el.tagName === 'metadata') { kill.push(el); return; }
    if (el.tagName === 'defs') { defs.push(el); return; }
    let b; try { b = el.getBBox(); } catch (e) { return; }
    // the full-canvas background plate
    if (b.width >= root.viewBox.baseVal.width && b.height >= root.viewBox.baseVal.height) { kill.push(el); return; }
    // the redundant sun glyph: entirely above the lettering
    if (b.y + b.height < SUN_CUT) { kill.push(el); return; }
    // a shape painted in the plate colour is a counter, not a drawing
    if ((el.getAttribute('fill') || '').toLowerCase() === PLATE) { counters.push(el); }
    else {
      gold.push(el);
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
    }
  });
  const removed = kill.length;
  kill.forEach((el) => el.remove());

  const pad = 2;
  const vb = [minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2].map((n) => +n.toFixed(2));

  // counters → a real cut-out
  const mask = document.createElementNS(NS, 'mask');
  mask.setAttribute('id', 'hr-wordmark-counters');
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  /* The mask REGION must be stated explicitly. Its userSpaceOnUse default is
     -10%/120% of the VIEWPORT measured from the user-space origin — and this
     artwork lives at y≈489–622, far outside that box, so an implicit region
     masks the whole wordmark away to nothing. (It did: first run rendered an
     empty rectangle. Verified by looking, which is the only reason it was
     caught before it shipped.) */
  mask.setAttribute('x', vb[0]); mask.setAttribute('y', vb[1]);
  mask.setAttribute('width', vb[2]); mask.setAttribute('height', vb[3]);
  const lit = document.createElementNS(NS, 'rect');
  lit.setAttribute('x', vb[0]); lit.setAttribute('y', vb[1]);
  lit.setAttribute('width', vb[2]); lit.setAttribute('height', vb[3]);
  lit.setAttribute('fill', '#fff');
  mask.appendChild(lit);
  counters.forEach((el) => { el.setAttribute('fill', '#000'); mask.appendChild(el); });
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('mask', 'url(#hr-wordmark-counters)');
  gold.forEach((el) => g.appendChild(el));
  root.appendChild(mask);
  root.appendChild(g);

  root.setAttribute('viewBox', vb.join(' '));
  root.setAttribute('width', String(vb[2]));
  root.setAttribute('height', String(vb[3]));
  root.removeAttribute('xmlns:c2pa');
  root.removeAttribute('xmlns:xlink');
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'Hearthrise');
  return { svg: root.outerHTML, vb, removed, kept: gold.length, counters: counters.length, defs: defs.length };
}, { SUN_CUT, PLATE: '#151618' });
const wordOut = '<?xml version="1.0" encoding="utf-8"?>\n' + word.svg + '\n';
fs.writeFileSync(path.join(OUT, 'hearthrise-wordmark.svg'), wordOut, 'utf8');
report.push(['hearthrise-wordmark.svg', word.vb.slice(2).join('x'), Buffer.byteLength(wordOut),
  `${word.kept} gilt + ${word.counters} masked counters, ${word.removed} removed (metadata + plate + sun) · was ${rawWord.length} B`]);

/* ── 4 · splash ──────────────────────────────────────────────────────────── */
const splash = await page.evaluate(async ({ dataUrl, q }) => {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return { url: c.toDataURL('image/jpeg', q), w: c.width, h: c.height };
}, { dataUrl: b64(src('splash')), q: SPLASH_Q });
report.push(['hearthrise-splash.jpg', `${splash.w}x${splash.h}`,
  writeDataUrl(path.join(OUT, 'hearthrise-splash.jpg'), splash.url),
  `q${SPLASH_Q} · source PNG was ${fs.statSync(src('splash')).size} B`]);

/* ── 5 · badge ───────────────────────────────────────────────────────────── */
const rawBadge = fs.readFileSync(src('badge'), 'utf8');
await page.setContent(`<body style="margin:0">${rawBadge}</body>`);
const badge = await page.evaluate(() => {
  const root = document.querySelector('svg');
  [...root.children].forEach((el) => { if (el.tagName === 'metadata') el.remove(); });
  root.removeAttribute('xmlns:c2pa');
  root.removeAttribute('xmlns:xlink');
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'Hearthrise');
  return root.outerHTML;
});
const badgeOut = '<?xml version="1.0" encoding="utf-8"?>\n' + badge + '\n';
fs.writeFileSync(path.join(OUT, 'hearthrise-badge.svg'), badgeOut, 'utf8');
report.push(['hearthrise-badge.svg', '—', Buffer.byteLength(badgeOut), `was ${rawBadge.length} B`]);

await browser.close();

console.log('\nassets/brand/');
for (const [f, dim, bytes, note] of report) {
  console.log(`  ${f.padEnd(28)} ${String(dim).padEnd(11)} ${String((bytes / 1024).toFixed(1) + ' KB').padStart(9)}   ${note}`);
}
console.log('');
