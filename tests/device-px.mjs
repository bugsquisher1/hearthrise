#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/device-px.mjs — PIXEL ART DRAWS WHOLE DEVICE PX AT ANY DISPLAY SCALE, IN A REAL CHROMIUM (lane/a-visual-audit).
//
//   node tests/device-px.mjs            the rules
//   node tests/device-px.mjs --mutate   every planted defect must turn a NAMED rule RED; a throw, a plant that does not parse or a
//                                       line with no DP id is HARNESS, never a catch (tests/_mutant-verdict.mjs)
//
// mutant-anchors: src/render/device-px.js src/app/boot.js src/styles/tokens.css src/styles/shell.css src/styles/windows.css src/styles/hunt.css
// mutant-writes-tree: no — mutants are served overrides
//
// Tyler 2026-11-16: the game looked blurry and grainy at Windows' 125 % and 150 %. A display scale is a devicePixelRatio of 1.25
// or 1.5: a frame drawn 6 CSS px for its 3 art px came out 2, 3 and 2 device px wide, and a 32 px icon drew its art at 1.25x or
// 1.5x, its pixels 1 and 2 device px side by side. play.html with supabase-js and the REST paths stubbed
// (tests/_client-harness.mjs), the hero tests/fixtures/alpha-envelope.json in town. Each scale is a Chromium of its OWN device
// scale (--force-device-scale-factor, the path a Windows display takes): DevTools' deviceScaleFactor lays a border out in whole
// CSS px and would not show the defect. What each scale must draw is worked out HERE: one art px of a frame is
// floor(2 x DPR) device px; a 32 px icon is the least whole multiple of its 32 art px that is 24 CSS px or more.
//   DP-1  --dpr: boot writes the screen's devicePixelRatio on <html>, at 100, 110, 125, 150 and 175 %
//   DP-2  FRAMES: with Inventory open, every pixel frame on the page (a border-image from assets/ui) is (its slice) x floor(2 x DPR)
//         device px on each framed side; the Inventory window's left frame, read off the screen, changes colour only on whole art px
//   DP-3  ICONS: every item icon drawn (the bag, the doll, the action bar) is a whole multiple of its art in device px; a bag icon is
//         the least such that is 24 CSS px or more (x1 at 125 %, x2 at 150 %), and its pocket holds it inside the pocket's border
//   DP-4  A SCALE THAT CHANGES is written again: a window dragged to a display of another scale keeps its CSS size and only the
//         resolution query hears it; a browser zoom or a new display scale resizes the page. Pure (a stand-in window, since a
//         headless Chromium cannot change its scale without a resize): the query's change and a resize each rewrite --dpr and arm
//         the query for the new ratio. In the page: a scale and size change under a running World is written
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { launchOptions } from './_chrome.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { judgePlanted, report, exitOf, cleanControl } from './_mutant-verdict.mjs';

const { decodePNG } = await import(pathToFileURL(join(ROOT, 'tools/world-art/png.mjs')).href);
const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const TOWN = Object.assign(clone(BASE_ENV), { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }) });
for (const k of ['hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete TOWN[k];
const wait = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

/* The scales a Windows display or a browser zoom gives; the window is 1920x1080 device px, as a laptop panel. */
const SCALES = [1, 1.1, 1.25, 1.5, 1.75];
/* What each scale must draw, by plain arithmetic: device px an art px of a frame, and a bag icon's whole scale. */
const artPx = (dpr) => Math.max(1, Math.floor(2 * dpr + 1e-9));
const bagScale = (dpr) => { let k = 1; while ((32 * k) / dpr < 24 - 1e-9) k++; return k; };
/* The window frame's left edge, outside in (assets/ui/steel-frame.png, any middle row): six art columns, no two alike side by side. */
const FRAME_LEFT = (() => {
  const img = decodePNG(readFileSync(join(ROOT, 'assets/ui/steel-frame.png')));
  const y = img.height >> 1;
  return Array.from({ length: 6 }, (_, x) => { const i = (y * img.width + x) * 4; return '#' + [0, 1, 2].map((j) => img.data[i + j].toString(16).padStart(2, '0')).join(''); });
})();

async function stub(page) {
  let version = 0;
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(TOWN), { version: ++version, ok: true }));
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load', timeout: 45000 });
  if (!(await wait(page, () => document.querySelector('form[data-auth="sign-in"]')))) return false;
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  if (!(await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]')))) return false;
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

/* Every pixel frame on the page and every item icon, as the browser laid them out (CSS px), and the Inventory window's box. */
const measure = () => {
  const vis = (n) => n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
  const frames = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!/assets\/ui\/[a-z-]+\.png/.test(cs.borderImageSource) || !vis(el)) continue;
    const slice = cs.borderImageSlice.replace('fill', '').trim().split(/\s+/).map(Number);
    const [t, r = t, b = t, l = r] = slice;
    frames.push({ what: (el.className && String(el.className).split(' ')[0]) || el.tagName, art: cs.borderImageSource.match(/ui\/([a-z-]+)\.png/)[1],
      sides: [['top', t, cs.borderTopWidth], ['right', r, cs.borderRightWidth], ['bottom', b, cs.borderBottomWidth], ['left', l, cs.borderLeftWidth]]
        .map(([side, s, w]) => [side, s, parseFloat(w)]).filter(([, , w]) => w > 0) });
  }
  const icons = Array.from(document.querySelectorAll('img.hh-icon')).filter((i) => vis(i) && i.complete && i.naturalWidth).map((i) => {
    const r = i.getBoundingClientRect(), pocket = i.closest('.hw-pocket');
    const pr = pocket && pocket.getBoundingClientRect(), pb = pocket && parseFloat(getComputedStyle(pocket).borderLeftWidth);
    return { src: i.getAttribute('src').split('/').pop(), nat: i.naturalWidth, w: r.width, h: r.height,
      pocket: pocket ? { l: pr.left + pb, t: pr.top + pb, r: pr.right - pb, b: pr.bottom - pb } : null, box: { l: r.left, t: r.top, r: r.right, b: r.bottom } };
  });
  const win = document.querySelector('[data-hs-win="inventory"]');
  const wr = win && win.getBoundingClientRect();
  return { dpr: devicePixelRatio, written: document.documentElement.style.getPropertyValue('--dpr'), frames, icons,
    win: wr ? { x: wr.left, y: wr.top, h: wr.height, bw: parseFloat(getComputedStyle(win).borderLeftWidth) } : null };
};

/* Where the colour changes along a row of device px, as run lengths. */
function runsOf(img, y, x0, n) {
  const at = (x) => { const i = (y * img.width + x) * 4; return img.data[i] + ',' + img.data[i + 1] + ',' + img.data[i + 2]; };
  const runs = []; let prev = null, len = 0;
  for (let x = x0; x < x0 + n; x++) { const c = at(x); if (c === prev) len++; else { if (prev !== null) runs.push(len); prev = c; len = 1; } }
  runs.push(len);
  return runs;
}

async function onScale(dpr, overrides, base) {
  const fails = [], tag = (rule) => rule + ' at ' + Math.round(dpr * 100) + ' %: ';
  const browser = await chromium.launch(launchOptions({ headless: true, args: ['--force-device-scale-factor=' + dpr, '--window-size=' + Math.round(1920 / dpr) + ',' + Math.round(1080 / dpr)] }));
  try {
    const page = await (await browser.newContext({ viewport: null })).newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await stub(page);
    if (!(await signInAndPlay(page, base))) return [tag('DP-1') + 'the World never came up'];
    await page.keyboard.press('b');
    if (!(await wait(page, () => document.querySelector('[data-hs-win="inventory"] .hw-pocket img.hh-icon')))) return [tag('DP-2') + 'Inventory did not open with its bag drawn'];
    /* AT REST: the window slides in (shell.css hs-in, 120 ms); a box read mid-slide is a fractional transform, not the layout. */
    await wait(page, () => { for (let n = document.querySelector('[data-hs-win="inventory"]'); n; n = n.parentElement) if (getComputedStyle(n).transform !== 'none') return false; return true; });
    await wait(page, () => Array.from(document.querySelectorAll('img.hh-icon')).every((i) => i.complete));
    const m = await page.evaluate(measure);
    // ── DP-1 ──
    if (Number(m.written) !== m.dpr) fails.push(tag('DP-1') + '--dpr on <html> reads "' + m.written + '" for a devicePixelRatio of ' + m.dpr);
    // ── DP-2 ──
    const k = artPx(m.dpr);
    if (m.frames.length < 4) fails.push(tag('DP-2') + 'found only ' + m.frames.length + ' pixel frames to measure');
    for (const f of m.frames) for (const [side, slice, w] of f.sides) {
      const dev = w * m.dpr;
      if (Math.abs(dev - slice * k) > 0.05) fails.push(tag('DP-2') + f.what + ' (' + f.art + ') draws its ' + side + ' ' + slice + ' art px in ' + Math.round(dev * 100) / 100 + ' device px, want ' + slice * k);
    }
    if (!m.win) fails.push(tag('DP-2') + 'no Inventory window to read');
    else {
      /* Across the window's left frame at its middle, on the screen: the six art columns of steel-frame.png's left edge, each
         exactly k device px, starting within 2 device px of where the layout puts the window's edge. */
      /* an item's tip (the bag's cursor stands on its first stack) may lie over the edge: it is not what is read here */
      await page.addStyleTag({ content: '.hw-tip, .hw-menu { visibility: hidden !important; }' });
      const shot = decodePNG(await page.screenshot());
      const y = Math.round((m.win.y + m.win.h / 2) * m.dpr), x0 = Math.round(m.win.x * m.dpr);
      const want = FRAME_LEFT.flatMap((c) => Array(k).fill(c));
      const px = (x) => { const i = (y * shot.width + x) * 4; return '#' + [0, 1, 2].map((j) => shot.data[i + j].toString(16).padStart(2, '0')).join(''); };
      const hit = [-2, -1, 0, 1, 2].some((d) => want.every((c, j) => px(x0 + d + j) === c));
      if (!hit) fails.push(tag('DP-2') + 'the window\'s left frame is not its 6 art columns at ' + k + ' device px each: from ' + (x0 - 2) + ' it reads '
        + runsOf(shot, y, x0 - 2, want.length + 4).join('/') + ' device px (' + Array.from({ length: want.length + 4 }, (_, j) => px(x0 - 2 + j)).filter((c, j, a) => c !== a[j - 1]).join(' ') + ')');
    }
    // ── DP-3 ──
    if (!m.icons.length) fails.push(tag('DP-3') + 'no item icon drawn to measure');
    for (const i of m.icons) {
      const kx = (i.w * m.dpr) / i.nat, ky = (i.h * m.dpr) / i.nat;
      if (Math.abs(kx - Math.round(kx)) > 0.02 || Math.abs(ky - Math.round(ky)) > 0.02 || kx < 0.98) fails.push(tag('DP-3') + i.src + ' draws its ' + i.nat + ' art px at ' + Math.round(kx * 1000) / 1000 + 'x');
    }
    const bag = m.icons.filter((i) => i.pocket);
    if (!bag.length) fails.push(tag('DP-3') + 'no bag icon in a pocket');
    for (const i of bag) {
      if (Math.abs((i.w * m.dpr) / i.nat - bagScale(m.dpr)) > 0.02) fails.push(tag('DP-3') + 'a bag icon (' + i.src + ') is ' + Math.round((i.w * m.dpr) / i.nat * 1000) / 1000 + 'x, want ' + bagScale(m.dpr) + 'x');
      const out = Math.max(i.pocket.l - i.box.l, i.pocket.t - i.box.t, i.box.r - i.pocket.r, i.box.b - i.pocket.b);
      if (out > 0.1) fails.push(tag('DP-3') + 'a bag icon (' + i.src + ') reaches ' + Math.round(out * 100) / 100 + ' px over its pocket\'s border');
    }
    if (errors.length) fails.push(tag('DP-1') + 'page errors: ' + errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  return fails;
}

/* DP-4, pure: a stand-in window whose scale the test moves, its listeners called as the browser would. */
async function pureChecks(overrides) {
  const fails = [];
  const file = 'src/render/device-px.js';
  const text = overrides && overrides[file] ? overrides[file] : await readFile(join(ROOT, file), 'utf8');
  const { mountDevicePx } = await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
  const props = new Map(), heard = {}, queries = [];
  const win = { devicePixelRatio: 1,
    document: { documentElement: { style: { getPropertyValue: (k) => props.get(k) || '', setProperty: (k, v) => props.set(k, v) } } },
    matchMedia: (q) => { const mq = { q, on: new Set(), addEventListener: (t, f) => t === 'change' && mq.on.add(f), removeEventListener: (t, f) => mq.on.delete(f) }; queries.push(mq); return mq; },
    addEventListener: (t, f) => { (heard[t] = heard[t] || []).push(f); } };
  mountDevicePx(win);
  if (props.get('--dpr') !== '1') fails.push('DP-4 pure: mounted at a ratio of 1, --dpr reads "' + props.get('--dpr') + '"');
  const armed = () => queries.filter((m) => m.on.size);
  /* a window dragged to a 150 % display: the same CSS size, only the armed query changes */
  win.devicePixelRatio = 1.5;
  const first = armed();
  if (first.length !== 1 || first[0].q !== '(resolution: 1dppx)') fails.push('DP-4 pure: no resolution query armed for the ratio it was mounted at (' + first.map((m) => m.q).join(', ') + ')');
  else {
    for (const f of [...first[0].on]) f();
    if (props.get('--dpr') !== '1.5') fails.push('DP-4 pure: the resolution query changed to 1.5 and --dpr reads "' + props.get('--dpr') + '"');
    const next = armed();
    if (next.length !== 1 || next[0].q !== '(resolution: 1.5dppx)') fails.push('DP-4 pure: after 1.5 the armed queries are ' + JSON.stringify(next.map((m) => m.q)) + ', want only (resolution: 1.5dppx)');
  }
  /* a browser zoom: the page resizes */
  win.devicePixelRatio = 1.25;
  for (const f of heard.resize || []) f();
  if (props.get('--dpr') !== '1.25') fails.push('DP-4 pure: a resize at 1.25 left --dpr at "' + props.get('--dpr') + '"');
  return fails;
}

/* DP-4 in the page: the scale and the size change under a running World (DevTools' device metrics) and --dpr follows. */
async function onChange(base) {
  const browser = await chromium.launch(launchOptions({ headless: true }));
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    await stub(page);
    if (!(await signInAndPlay(page, base))) return ['DP-4 the World never came up'];
    const cdp = await ctx.newCDPSession(page);
    const fails = [];
    for (const [dpr, width] of [[1.5, 1281], [1.25, 1280], [2, 1279]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: dpr, mobile: false });
      if (!(await wait(page, (d) => Number(document.documentElement.style.getPropertyValue('--dpr')) === d, dpr, 5000))) {
        fails.push('DP-4 the scale moved to ' + dpr + ' and --dpr still reads "' + await page.evaluate(() => document.documentElement.style.getPropertyValue('--dpr')) + '"');
        break;
      }
    }
    return fails;
  } finally {
    await browser.close();
  }
}

/* `scales`: the display scales to open the page at (a mutant opens only those its defect shows at); `change`: the page's DP-4 too. */
async function checks(overrides, scales = SCALES, change = true) {
  const { server, port } = await serve(overrides || {});
  const base = 'http://127.0.0.1:' + port;
  try {
    const fails = await pureChecks(overrides);
    for (const dpr of scales) fails.push(...await onScale(dpr, overrides, base));
    if (change) fails.push(...await onChange(base));
    return fails;
  } finally {
    server.close();
  }
}

/* Each plants one defect the rules above exist for and opens the page only at the scales it shows at (none: the pure DP-4).
   [name, file, from, to, scales] */
const MUTANTS = [
  ['boot never writes the screen\'s scale', 'src/app/boot.js', '  mountDevicePx(win);\n', '', [1.25]],
  ['a window dragged to a display of another scale is not written again', 'src/render/device-px.js', "    if (watching) watching.addEventListener('change', write);\n", '', []],
  ['a resized page (a browser zoom) is not written again', 'src/render/device-px.js', "  win.addEventListener('resize', write);\n", '', []],
  ['an art px is 2 CSS px at every scale (today\'s 7.5 device px for 3 art px at 125 %)', 'src/styles/tokens.css', '  --art-px: calc(max(1, round(down, 2 * var(--dpr))) / var(--dpr) * 1px);', '  --art-px: 2px;', [1.25]],
  ['an art px rounds up, and a 125 % frame grows past its layout', 'src/styles/tokens.css', 'round(down, 2 * var(--dpr))', 'round(2 * var(--dpr))', [1.25]],
  ['the window frame is 12 CSS px again', 'src/styles/shell.css', '  border: var(--art-6) solid transparent;\n  border-image: url(\'../../assets/ui/steel-frame.png\') 6 / var(--art-6) stretch;', '  border: 12px solid transparent;\n  border-image: url(\'../../assets/ui/steel-frame.png\') 6 / 12px stretch;', [1.25]],
  ['a small icon is 32 CSS px at every scale (1.25x and 1.5x art)', 'src/styles/tokens.css', '  --icon-1: round(up, 24px, var(--icon-step));', '  --icon-1: 32px;', [1.25]],
  ['a bar icon snaps to 32 CSS px, not 32 device px', 'src/styles/hunt.css', '.hb-slot .hh-icon, .hb-socket-ico .hh-icon { width: round(down, 100% - 4px, var(--icon-step)); height: round(down, 100% - 4px, var(--icon-step)); }', '.hb-slot .hh-icon, .hb-socket-ico .hh-icon { width: round(down, 100% - 4px, 32px); height: round(down, 100% - 4px, 32px); }', [1.25]],
  ['a pocket keeps 44 px when its 2x icon needs more', 'src/styles/windows.css', '  width: max(round(down, clamp(36px, 36px + (100vw - 1024px) / 32, 44px), 2px), calc(var(--icon-1) + 4px)); height: max(round(down, clamp(36px, 36px + (100vw - 1024px) / 32, 44px), 2px), calc(var(--icon-1) + 4px));', '  width: round(down, clamp(36px, 36px + (100vw - 1024px) / 32, 44px), 2px); height: round(down, clamp(36px, 36px + (100vw - 1024px) / 32, 44px), 2px);', [1.5]],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'device-px: ' + fails.length + ' rule(s) RED'
      : 'device-px: at 100, 110, 125, 150 and 175 % every pixel frame is whole device px an art px on every side, every item icon a whole scale (a bag icon x1 at 125 %, x2 at 150 %, inside its pocket), and a changed scale is written again');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await cleanControl(() => checks(null));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  /* A mutant is caught only by a NAMED rule (DP-n); a plant that does not parse, a run that throws, or a line with no rule id is
     HARNESS, never a catch (tests/_mutant-verdict.mjs; lane/c-hollow-proofs-browser 2026-11-20: this loop scored ANY fail line). */
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, from, to, scales] of MUTANTS) {
    const text = (await readFile(join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
    if (text.split(from).length !== 2) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found once in ' + file); counts.harness++; continue; }
    const plant = { [file]: text.replace(from, () => to) };
    console.log(report(name, await judgePlanted(plant, () => checks(plant, scales, false)), counts));
  }
  console.log(exitOf(counts) ? 'device-px --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)'
    : 'device-px --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
}

main();
