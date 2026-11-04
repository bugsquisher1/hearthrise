#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// desktop/tests/measure.mjs — THE SHELL'S NUMBERS, BESIDE THE PLAIN BROWSER, ON ONE LOCAL WORLD.
//
//   node tests/measure.mjs [--packaged out/Hearthrise-win32-x64/Hearthrise.exe] [--no-crisp]
//
//   COLD START  process start -> the signed-in characters screen -> Play -> the town's first painted frame. A signed-in profile,
//               so nobody's typing is counted. Also from a fresh launch's sign-in form.
//   MEMORY      sum of the working set of every process of the app, in town and in a hunt, settled for 20 s; the same in Chromium
//               (Playwright's full Chromium in new-headless mode, the only one that shows no window: an imperfect twin, see the report).
//   CRISP       at Windows scales 100, 125, 150, 200%: what the page's devicePixelRatio reads, the World's zoom, and whether the
//               icons land on whole device pixels, with the shell's whole-number rule on and off.
//   FPS         requestAnimationFrame and the frame time in town at 1280x800: GPU, and software-only as the floor.
//
// Exit 0 finished (numbers are facts, not pass/fail), 2 harness.
// mutant-anchors: none — a prototype's measurement, not a repo guard
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { REPO, SHOTS, createHero, createReport, dropProfile, enterHunt, freshProfile, launch, readLayout, signUpAndIn, waitTownFrame } from './_harness.mjs';

const { openWorld } = await import(pathToFileURL(join(REPO, 'tools/qa/local-world.mjs')).href);
const argAt = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const packaged = argAt('--packaged');
const r = createReport('measure');
const median = (xs) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)];
const RUNS = Number(process.env.HR_RUNS || 3);

/** Working set of these process ids, MB, from tasklist (the same reader for the app and the browser). */
function workingSetMB(pids) {
  const want = new Set(pids.map(Number));
  const out = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', maxBuffer: 1 << 24 }).stdout || '';
  let kb = 0;
  for (const line of out.split(/\r?\n/)) {
    const m = /^"[^"]*","(\d+)","[^"]*","\d+","([\d,. ]+)\s*K"/.exec(line);
    if (m && want.has(Number(m[1]))) kb += Number(m[2].replace(/[,. ]/g, ''));
  }
  return Math.round(kb / 1024);
}

const FPS = () => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(f);
});

/* No timer tick: on this one-process world a tick holds the file server too, and a start-up number would measure that. */
const world = await openWorld({ tickMs: false });
const profile = freshProfile('measure');
const email = 'measure@local-world.test';
let browser = null;
try {
  /* ── the account, once ── */
  let a = await launch({ url: world.url, profile, executable: packaged });
  await signUpAndIn(a.page, email);
  await a.page.waitForSelector('[data-app="create"]');
  await createHero(a.page, 'Tamber');
  await waitTownFrame(a.page);
  r.note('electron', await a.main(({ app }) => ({ versions: process.versions.electron, chrome: process.versions.chrome, gpu: app.getGPUFeatureStatus().canvas_oop_rasterization, canvas: app.getGPUFeatureStatus()['2d_canvas'] })));
  await a.close();

  /* ── cold start, signed in ── */
  const toRoster = [], toTown = [], toPress = [];
  for (let i = 0; i < RUNS; i++) {
    a = await launch({ url: world.url, profile, executable: packaged });
    const start = await a.main(() => process.getCreationTime());
    await a.page.waitForSelector('[data-app="play"]');
    const rosterAt = Date.now();
    const pressAt = Date.now();
    await a.page.click('[data-app="play"]');
    const townAt = await waitTownFrame(a.page);
    toRoster.push(rosterAt - start); toTown.push(townAt - start); toPress.push(townAt - pressAt);
    if (i === RUNS - 1) r.step('cold start: no console errors', a.errors.length === 0, a.errors.slice(0, 3).join(' | ').slice(0, 300));
    await a.close();
  }
  r.note('cold start, process start -> characters screen (ms)', { runs: toRoster, median: median(toRoster) });
  r.note('cold start, Play press -> first town frame (ms)', { runs: toPress, median: median(toPress) });
  r.note('cold start, process start -> first town frame, press included (ms)', { runs: toTown, median: median(toTown) });

  /* ── memory: the app ── */
  a = await launch({ url: world.url, profile, executable: packaged });
  await a.page.waitForSelector('[data-app="play"]');
  await a.main(() => globalThis.__hrShell.win.setContentSize(1280, 800));
  await a.page.click('[data-app="play"]');
  await waitTownFrame(a.page);
  await a.page.waitForTimeout(20000);
  const appPids = () => a.metrics().then((m) => m.map((x) => x.pid));
  const townMB = workingSetMB(await appPids());
  const types = await a.metrics();
  r.note('app processes', types.map((m) => m.type + ' ' + Math.round(m.kb / 1024) + ' MB'));
  const fpsApp = await a.page.evaluate(FPS);
  await enterHunt(a.page, 'mill_cellar');
  await a.page.waitForTimeout(20000);
  const huntMB = workingSetMB(await appPids());
  const fpsHunt = await a.page.evaluate(FPS);
  await a.page.click('[data-hs-act="leave"]');
  await a.page.waitForFunction(() => !!document.querySelector('.hsum-card'), null, { timeout: 60000 }).catch(() => {});
  r.note('app memory (MB working set, all processes)', { town: townMB, hunt: huntMB });
  r.note('app fps hidden window 1280x800', { town: fpsApp, hunt: fpsHunt });
  await a.close();

  /* ── memory: Chromium, same world, new-headless, same size ── */
  browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const local = new URL(world.origin).host;
  await ctx.route((u) => u.host !== local && u.protocol !== 'data:' && u.protocol !== 'blob:', (x) => x.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  await page.goto(world.url, { waitUntil: 'load' });
  await page.waitForSelector('form[data-auth="sign-in"]');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'local-world-password');
  await page.click('.auth-submit');
  await page.waitForSelector('[data-app="play"]');
  await page.click('[data-app="play"]');
  await waitTownFrame(page);
  await page.waitForTimeout(20000);
  const cdp = await browser.newBrowserCDPSession();
  const browserPids = async () => (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map((p) => p.id);
  const bTown = workingSetMB(await browserPids());
  const bFps = await page.evaluate(FPS);
  await enterHunt(page, 'mill_cellar');
  await page.waitForTimeout(20000);
  const bHunt = workingSetMB(await browserPids());
  r.note('Chromium memory (MB working set, all processes)', { town: bTown, hunt: bHunt, fpsTown: bFps, version: browser.version() });
  await page.click('[data-hs-act="leave"]');
  await browser.close();
  browser = null;

  /* ── crisp: Windows display scaling, forced ── */
  if (!process.argv.includes('--no-crisp')) {
    for (const [scale, integer] of [['1.25', false], ['1.25', true], ['1.5', false], ['1.5', true]]) {
      const c = await launch({ url: world.url, profile, executable: packaged, args: ['--force-device-scale-factor=' + scale], env: integer ? {} : { HR_DESKTOP_NO_INTEGER: '1' } });
      await c.page.waitForSelector('[data-app="play"]');
      await c.page.click('[data-app="play"]');
      await waitTownFrame(c.page);
      await c.page.waitForTimeout(1200);
      const l = await readLayout(c.page);
      const icon = await c.page.evaluate(() => {
        const e = document.querySelector('.hs-launchers img, .hs-launchers canvas, .hs-launchers [class*=icon]');
        if (!e) return null;
        const b = e.getBoundingClientRect();
        const toPx = (v) => v * devicePixelRatio;
        return { cssW: b.width, devW: toPx(b.width), devX: toPx(b.x), whole: Number.isInteger(+toPx(b.width).toFixed(3)) && Number.isInteger(+toPx(b.x).toFixed(3)) };
      });
      const tag = 'crisp-' + scale + (integer ? '-whole' : '-raw');
      await c.shot(tag);
      r.note(tag, { dpr: l.dpr, inner: l.inner, canvas: l.canvas, mobile: l.mobile, icon, bg: await c.main(() => globalThis.__hrShell.zoom()) });
      await c.close();
    }
  }

  /* ── frame rate with no GPU at all: the worst case for a machine this PC is not ── */
  const soft = await launch({ url: world.url, profile, executable: packaged, args: ['--disable-gpu'] });
  await soft.page.waitForSelector('[data-app="play"]');
  await soft.main(() => globalThis.__hrShell.win.setContentSize(1280, 800));
  await soft.page.click('[data-app="play"]');
  await waitTownFrame(soft.page);
  await soft.page.waitForTimeout(3000);
  r.note('fps at 1280x800, --disable-gpu, town', await soft.page.evaluate(FPS));
  await soft.close();
  console.log('shots: ' + SHOTS);
} catch (e) {
  r.step('the measuring finished', false, String(e && e.stack || e).slice(0, 800));
} finally {
  if (browser) await browser.close().catch(() => {});
  await world.close();
  dropProfile(profile);
}
process.exit(r.finish());
