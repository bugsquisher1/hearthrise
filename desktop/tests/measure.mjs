#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// desktop/tests/measure.mjs — THE SHELL'S NUMBERS, BESIDE THE PLAIN BROWSER, ON ONE LOCAL WORLD.
//
//   node tests/measure.mjs                 one app launch and one installed-Chrome launch: start, town, hunt, memory, frame rate at 1280x800
//   node tests/measure.mjs --restart       adds a second app launch on the same profile, process start to town
//   node tests/measure.mjs --scales        adds a launch at each forced Windows scale: page ratio, the World's canvas, an icon's pixels
//   HR_DESKTOP_EXE=path                    a packaged build instead of the repo's Electron
//
//   MEMORY  sum of the working set of every process, in town and in a hunt, settled for 20 s. The twin is the installed Chrome in
//           new-headless mode, the only one that shows no window: same engine, no real window, so read it as close, not equal.
//
// Numbers are facts, not pass/fail. Exit 0 finished, 1 a step failed.
// mutant-anchors: none — a prototype's measurement, not a repo guard
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PASSWORD, REPO, createHero, createReport, dropProfile, enterHunt, freshProfile, launch, readLayout, signUpAndIn, waitTownFrame } from './_harness.mjs';

const { openWorld } = await import(pathToFileURL(join(REPO, 'tools/qa/local-world.mjs')).href);
const r = createReport('measure');

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
const atPlay = (page) => page.waitForFunction(() => !!document.querySelector('[data-app="play"], .hs-launchers'), null, { polling: 100 });
const pressPlay = async (page) => { if (await page.$('[data-app="play"]')) await page.click('[data-app="play"]'); };

/* No timer tick: on this one-process world a tick holds the file server too, and a start-up number would measure that. */
const world = await openWorld({ tickMs: false });
const profile = freshProfile('measure');
const email = 'measure@local-world.test';
let browser = null;
try {
  /* ── the app ── */
  let a = await launch({ url: world.url, profile });
  const start = await a.main(() => process.getCreationTime());
  await a.page.waitForFunction(() => !!document.querySelector('form[data-auth="sign-in"]'), null, { polling: 100 });
  r.note('app: process start -> sign-in form (ms)', Math.round(Date.now() - start));
  r.note('app: engine', await a.main(() => ({ electron: process.versions.electron, chrome: process.versions.chrome })));
  await signUpAndIn(a.page, email);
  await a.page.waitForSelector('[data-app="create"]');
  await a.setSize(1280, 800);
  await createHero(a.page, 'Tamber');
  await waitTownFrame(a.page);
  await a.page.waitForTimeout(20000);
  const appPids = async () => (await a.metrics()).map((x) => x.pid);
  const townMB = workingSetMB(await appPids());
  const types = await a.metrics();
  r.note('app processes in town', types.map((m) => m.type + ' ' + Math.round(m.kb / 1024) + ' MB'));
  const fpsTown = await a.page.evaluate(FPS);
  const layout = await readLayout(a.page);
  r.note('layout 1280x800, town', layout);
  await a.shot('m-1280x800-town');
  await enterHunt(a.page, 'mill_cellar');
  await world.skip(1);
  await a.page.waitForTimeout(20000);
  const huntMB = workingSetMB(await appPids());
  const fpsHunt = await a.page.evaluate(FPS);
  r.note('layout 1280x800, hunt', await readLayout(a.page));
  await a.shot('m-1280x800-hunt');
  r.note('app memory (MB working set, all processes)', { town: townMB, hunt: huntMB });
  r.note('app fps at 1280x800', { town: fpsTown, hunt: fpsHunt });
  r.step('app: no console errors', a.errors.length === 0, a.errors.slice(0, 3).join(' | ').slice(0, 300));
  await a.page.click('[data-hs-act="leave"]');
  await a.page.waitForFunction(() => !!document.querySelector('.hsum-card'), null, { polling: 200, timeout: 120000 }).catch(() => {});
  const closing = Date.now();
  await a.close();
  r.note('app: close -> process gone (ms)', Date.now() - closing);

  if (process.argv.includes('--restart')) {
    a = await launch({ url: world.url, profile });
    const s2 = await a.main(() => process.getCreationTime());
    await atPlay(a.page);
    const rosterAt = Date.now();
    await pressPlay(a.page);
    const townAt = await waitTownFrame(a.page);
    r.note('app, signed in: process start -> characters screen, -> first town frame, press included (ms)', { roster: Math.round(rosterAt - s2), town: Math.round(townAt - s2) });
    await a.close();
  }

  /* ── the plain browser: same world, same account, same size ── */
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const local = new URL(world.origin).host;
  await ctx.route((u) => u.host !== local && u.protocol !== 'data:' && u.protocol !== 'blob:', (x) => x.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(300000);
  const t0 = Date.now();
  await page.goto(world.url, { waitUntil: 'commit' });
  await page.waitForFunction(() => !!document.querySelector('form[data-auth="sign-in"]'), null, { polling: 100 });
  r.note('Chrome, already running: new page -> sign-in form (ms)', Date.now() - t0);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await page.click('.auth-submit');
  await atPlay(page);
  await pressPlay(page);
  await waitTownFrame(page);
  await page.waitForTimeout(20000);
  const cdp = await browser.newBrowserCDPSession();
  const browserPids = async () => (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map((p) => p.id);
  const bTown = workingSetMB(await browserPids());
  const bFps = await page.evaluate(FPS);
  await enterHunt(page, 'mill_cellar');
  await page.waitForTimeout(20000);
  const bHunt = workingSetMB(await browserPids());
  r.note('Chrome memory (MB working set, all processes)', { town: bTown, hunt: bHunt, fpsTown: bFps, version: browser.version() });
  await browser.close();
  browser = null;

  if (process.argv.includes('--scales')) {
    for (const [scale, integer] of [['1.25', false], ['1.25', true], ['1.5', false], ['1.5', true]]) {
      const c = await launch({ url: world.url, profile, args: ['--force-device-scale-factor=' + scale], env: integer ? {} : { HR_DESKTOP_NO_INTEGER: '1' } });
      await atPlay(c.page);
      await pressPlay(c.page);
      await waitTownFrame(c.page);
      await c.page.waitForTimeout(1200);
      const l = await readLayout(c.page);
      const icon = await c.page.evaluate(() => {
        const e = document.querySelector('.hs-launchers img, .hs-launchers canvas, .hs-launchers [class*=icon]');
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { cssW: b.width, devW: b.width * devicePixelRatio, whole: Number.isInteger(+(b.width * devicePixelRatio).toFixed(3)) };
      });
      const tag = 'crisp-' + scale + (integer ? '-whole' : '-raw');
      await c.shot(tag);
      r.note(tag, { dpr: l.dpr, inner: l.inner, canvas: l.canvas, mobile: l.mobile, icon, zoom: await c.main(() => globalThis.__hrShell.zoom()) });
      await c.close();
    }
  }
} catch (e) {
  r.step('the measuring finished', false, String(e && e.stack || e).slice(0, 800));
} finally {
  if (browser) await browser.close().catch(() => {});
  await world.close();
  dropProfile(profile);
}
process.exit(r.finish());
