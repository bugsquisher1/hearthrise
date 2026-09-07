#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/css-ab-pixel-diff.mjs — PROVE A CSS CHANGE MOVED NO PIXEL
//
//   node tools/css-ab-pixel-diff.mjs                 diff working tree vs HEAD
//   node tools/css-ab-pixel-diff.mjs --ref <sha>     …vs any ref
//   node tools/css-ab-pixel-diff.mjs --control       A/A: measure the noise floor
//   node tools/css-ab-pixel-diff.mjs --mutate        plant a token change, prove it bites
//   node tools/css-ab-pixel-diff.mjs --screens combat,inventory --out <dir>
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// Half of the CSS cleanup programme is moves and restatements that are supposed
// to change nothing: extracting the token ladder, converging breakpoint
// spellings, folding a sheet into another. "It should be identical" is exactly
// the claim nobody can check by looking at two screenshots, and the visual gate
// (tests/visual-qa-gate.mjs) deliberately does NOT fail on pixel deltas — it
// watches for clipped text and new P1s, not for a surface going one shade off.
//
// This measures the thing directly, and the method matters more than the tool:
//
//   ONE page load. ONE frozen DOM. TWO stylesheet states.
//
// Two browser runs cannot be compared — a toast, a progress bar, a random board
// layout and Chromium's own gradient dithering all move between them. (Measured:
// naive before/after screenshots of the same unchanged tree differed by up to
// 38,799 pixels.) So this loads the game once, kills every pending timer and
// rAF so the DOM cannot change, then swaps the <link href> of every stylesheet
// between the working tree and the reference and screenshots both. Anything that
// differs is CSS, and nothing else.
//
// Two details that are not optional, both learned by being wrong:
//   · Both captures must follow the SAME number of swaps. A swap forces a
//     re-raster and Chromium's gradient dithering is not bit-stable across
//     rasters; without a warm-up swap the identical-bytes control still showed
//     14,124 pixels at Δ1.
//   · Run --control before you believe a zero. A harness that cannot swap
//     reports zero for everything; this one asserted its own swap count only
//     after it had silently done nothing for a whole run.
//
// Exit: 0 no pixel differs · 1 pixels differ (diff PNGs written) · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const argv = process.argv.slice(2);
const argOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const REF = argOf('--ref', 'HEAD');
const CONTROL = argv.includes('--control');
const MUTATE = argv.includes('--mutate');
const OUT = join(ROOT, argOf('--out', join('docs', 'reports', 'css-ab')));
const SCREENS = argOf('--screens', 'combat,inventory,profile,farming').split(',').map((s) => s.trim()).filter(Boolean);
const VIEWPORTS = [{ key: 'desktop', width: 1440, height: 900 }, { key: 'landscape', width: 922, height: 423 }];
const REFDIR = join(ROOT, '.css-ab-ref');            // materialised reference sheets
const REFURL = '/.css-ab-ref';

/* ── a 40-line PNG codec: 8-bit RGB/RGBA, non-interlaced, which is what
      Chromium emits. A dependency inside a proof is a liability. ────────── */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, inter = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; inter = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || inter !== 0 || (ct !== 6 && ct !== 2)) throw new Error(`unsupported png bd=${bd} ct=${ct} interlace=${inter}`);
  const ch = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++];
    const line = Buffer.from(raw.subarray(q, q + stride)); q += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      line[x] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 4] = line[x * ch];
      out[(y * w + x) * 4 + 1] = line[x * ch + 1];
      out[(y * w + x) * 4 + 2] = line[x * ch + 2];
      out[(y * w + x) * 4 + 3] = ch === 4 ? line[x * ch + 3] : 255;
    }
    prev = line;
  }
  return { width: w, height: h, data: out };
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const pngChunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

/* ── reference sheets ──────────────────────────────────────────────────── */
const sheetNames = () => [...readFileSync(join(ROOT, 'index.html'), 'utf8')
  .matchAll(/<link[^>]+href="src\/styles\/([\w-]+\.css)\?/g)].map((m) => m[1]);

function materialiseReference(names) {
  mkdirSync(REFDIR, { recursive: true });
  writeFileSync(join(REFDIR, '__empty.css'), '');
  const missing = [];
  for (const n of names) {
    if (CONTROL) { writeFileSync(join(REFDIR, n), readFileSync(join(ROOT, 'src', 'styles', n))); continue; }
    try {
      const body = execFileSync('git', ['show', `${REF}:src/styles/${n}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
      writeFileSync(join(REFDIR, n), body);
    } catch { missing.push(n); }      // a sheet added since the ref: nothing to compare against
  }
  return missing;
}

/* ── static server ─────────────────────────────────────────────────────── */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const p = decodeURIComponent((req.url || '/').split('?')[0]);
        let f = normalize(join(ROOT, p === '/' ? '/index.html' : p));
        if (!f.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
        const info = await stat(f).catch(() => null);
        if (info?.isDirectory()) f = join(f, 'index.html');
        const body = await readFile(f);
        res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
      } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const MID_GAME = () => {
  const G = window.G; if (!G) return;
  if (!G.skills || typeof G.skills !== 'object') G.skills = {};
  if (!G.inventory || typeof G.inventory !== 'object') G.inventory = {};
  G.gold = 250000; G.gems = 40;
  ['attack', 'strength', 'defense', 'hitpoints', 'mining', 'woodcutting', 'fishing', 'cooking', 'smithing', 'crafting', 'farming', 'ranged', 'magic'].forEach((s) => { G.skills[s] = 300000; });
  Object.assign(G.inventory, { copper_ore: 500, iron_ore: 400, coal: 300, normal_log: 400, oak_log: 200, shrimp: 200, cooked_shrimp: 120, iron_bar: 150, bronze_bar: 120, turnip: 60, dungeon_scrip: 250, bone_key: 3, rune_axe: 1, steel_hammer: 1, dawn_sword: 1, dawn_platebody: 1, farm_deed: 4 });
};

async function main() {
  const names = sheetNames();
  if (!names.length) { console.error('css-ab: no stylesheet links found in index.html'); return 2; }
  const missing = materialiseReference(names);
  if (missing.length) console.log(`  note: ${missing.join(', ')} does not exist at ${REF} — the reference serves an empty sheet in its slot`);

  let mutated = null;
  if (MUTATE) {
    // Prove the harness bites: repaint the primary ink and expect a large diff.
    mutated = join(ROOT, 'src', 'styles', names[0]);
    mutated = { path: mutated, orig: readFileSync(mutated, 'utf8') };
    writeFileSync(mutated.path, mutated.orig + '\n/* css-ab --mutate */\n:root,body[data-theme="hearthlight"]{--ink:#ff0000}\n');
  }

  await mkdir(OUT, { recursive: true });
  const { server, port } = await serve();
  const url = `http://127.0.0.1:${port}/index.html`;
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  const results = [];
  let harnessError = null;

  const setSheets = async (page, mode, state) => {
    await page.evaluate(({ m, REFURL, missing }) => {
      window.__swapped = 0;
      const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter((l) => l.dataset.abName || /(^|\/)src\/styles\//.test(l.getAttribute('href') || ''));
      for (const l of links) {
        // Stamp the canonical name ONCE: after a swap the href no longer carries
        // it, and re-deriving sends the next swap looking for the wrong file.
        if (!l.dataset.abName) l.dataset.abName = (l.getAttribute('href') || '').split('/').pop().split('?')[0];
        const n = l.dataset.abName;
        const href = m === 'ref' ? REFURL + '/' + (missing.includes(n) ? '__empty.css' : n) : '/src/styles/' + n;
        if (new URL(l.href).pathname === href) continue;
        window.__swapped++;
        l.setAttribute('href', href);
      }
    }, { m: mode, REFURL, missing });
    // Poll from NODE: the freeze below stubs the page timers and rAF, which is
    // exactly the machinery page.waitForFunction polls with.
    // `l.sheet` alone is not enough: mid-swap a link can expose the PREVIOUS
    // CSSOM object, and a screenshot taken then shows the app with a sheet
    // missing — measured once as a 385,201-pixel "regression" that was really a
    // combat screen rendered with theme-cozy absent. Demand rules, and demand
    // the count match what that file actually contains.
    const ready = ({ m, REFURL }) => [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter((l) => l.dataset.abName)
      .every((l) => {
        const path = new URL(l.href).pathname;
        if (!path.startsWith(m === 'ref' ? REFURL : '/src/styles')) return false;
        // The CSSOM object still carries the URL it was PARSED from, so this is
        // exact: a stale sheet fails here even though `l.sheet` is truthy.
        if (!l.sheet || l.sheet.href !== l.href) return false;
        try { return l.sheet.cssRules.length > 0 || path.endsWith('__empty.css'); } catch { return false; }
      });
    const deadline = Date.now() + 30_000;
    for (;;) {
      if (await page.evaluate(ready, { m: mode, REFURL })) break;
      if (Date.now() > deadline) throw new Error(`css-ab: the "${mode}" sheets never became live`);
      await new Promise((r) => setTimeout(r, 100));
    }
    const n = await page.evaluate(() => window.__swapped || 0);
    if (mode !== state.mode && !n) throw new Error(`css-ab: swapping to "${mode}" changed nothing — the harness would be blind`);
    state.mode = mode;
  };

  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const state = { mode: 'work' };
      await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
      await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForFunction(() => typeof window.G !== 'undefined', { timeout: 60_000 });
      await page.evaluate(() => { try { if (window.HearthriseGate) window.HearthriseGate.isOpen = () => true; } catch (e) {} });
      await page.evaluate(MID_GAME);
      await page.waitForTimeout(3000);
      await page.evaluate(() => {
        try { if (window.G) { window.G.ftueDone = true; window.G.ftueStep = 99; if (window.G.flags) window.G.flags.ftue = 'done'; } } catch (e) {}
        window.__kill = () => {
          document.querySelectorAll('body > *, .panel.active > *').forEach((e) => {
            const c = getComputedStyle(e); if (c.position !== 'fixed' || c.pointerEvents === 'none') return;
            const r = e.getBoundingClientRect();
            if (r.width > innerWidth * 0.6 && r.height > innerHeight * 0.5) e.style.setProperty('display', 'none', 'important');
          });
          document.querySelectorAll('.ftue-root,.ftue-overlay,#ftue-overlay,.modal.open,.qm-overlay,.scv-overlay,.mon-detail.show,.dr-overlay,#daily-reward-overlay,.welcome-overlay,#welcome-modal').forEach((e) => e.style.setProperty('display', 'none', 'important'));
          document.querySelectorAll('.toast,.toast-wrap,#toast-host').forEach((e) => { e.style.display = 'none'; });
        };
        window.__kill();
        const s = document.createElement('style');
        s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
        document.documentElement.appendChild(s);   // NOT in <head>: must not shift sheet order
      });
      for (const scr of SCREENS) {
        await page.evaluate((t) => { try { if (typeof window.showTab === 'function') window.showTab(t); } catch (e) {} }, scr);
        await page.waitForTimeout(1200);
        await page.evaluate(() => {
          window.__kill();
          const hi = setTimeout(() => {}, 0);
          for (let i = 0; i <= hi; i++) { clearTimeout(i); clearInterval(i); }
          window.setTimeout = () => 0; window.setInterval = () => 0; window.requestAnimationFrame = () => 0;
        });
        await page.waitForTimeout(200);
        // Warm-up swap so NEITHER capture is the boot raster (see the header).
        await setSheets(page, 'ref', state);
        await setSheets(page, 'work', state);
        const workBuf = await page.screenshot();
        await setSheets(page, 'ref', state);
        const refBuf = await page.screenshot();
        await setSheets(page, 'work', state);

        const name = `${vp.key}-${scr}`;
        const a = decodePng(refBuf), b = decodePng(workBuf);
        if (a.width !== b.width || a.height !== b.height) { results.push({ name, n: Infinity, maxd: 255 }); continue; }
        let n = 0, maxd = 0;
        const diff = { width: a.width, height: a.height, data: Buffer.alloc(a.width * a.height * 4) };
        for (let i = 0; i < a.data.length; i += 4) {
          const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
          if (d > 0) { n++; maxd = Math.max(maxd, d); diff.data[i] = 255; diff.data[i + 3] = 255; }
          else { const g = (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 6 + 120; diff.data[i] = diff.data[i + 1] = diff.data[i + 2] = g; diff.data[i + 3] = 255; }
        }
        if (n) {
          await writeFile(join(OUT, name + '-ref.png'), refBuf);
          await writeFile(join(OUT, name + '-work.png'), workBuf);
          await writeFile(join(OUT, name + '-diff.png'), encodePng(diff));
        }
        results.push({ name, n, maxd });
        console.log(`  ${name.padEnd(24)} differing px ${String(n).padStart(9)}   max channel Δ ${maxd}`);
      }
      await page.close();
    }
  } catch (e) { harnessError = e; } finally {
    await browser.close(); server.close();
    if (mutated) writeFileSync(mutated.path, mutated.orig);
    await rm(REFDIR, { recursive: true, force: true });
  }
  if (harnessError) { console.error('  ✗ ' + harnessError.message); return 2; }

  const worst = Math.max(0, ...results.map((r) => r.n));
  const label = CONTROL ? 'CONTROL (A/A, identical sheets)' : MUTATE ? 'MUTATION PROOF' : `working tree vs ${REF}`;
  console.log(`\n  ${label}: worst differing-pixel count ${worst} across ${results.length} screen(s)`);
  if (MUTATE) {
    if (worst > 0) { console.log('✓ css-ab --mutate: a planted --ink change was seen on ' + results.filter((r) => r.n).length + '/' + results.length + ' screens — the harness bites'); return 0; }
    console.error('  ✗ css-ab --mutate: a planted --ink change produced NO pixel difference. The harness is blind; every zero it has reported is worthless.');
    return 2;
  }
  if (CONTROL) {
    if (worst === 0) { console.log('✓ css-ab --control: the noise floor is zero — a zero from a real run means something'); return 0; }
    console.error('  ✗ css-ab --control: identical stylesheets differ by ' + worst + ' px. Fix the harness before trusting any run.');
    return 2;
  }
  if (worst === 0) { console.log('✓ css-ab: no pixel differs. Run --control once alongside this to show the floor is zero.'); return 0; }
  console.log(`  diff PNGs → ${OUT}`);
  return 1;
}

if (!existsSync(join(ROOT, 'index.html'))) { console.error('css-ab: run from the repo'); process.exit(2); }
process.exit(await main());
