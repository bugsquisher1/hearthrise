// ════════════════════════════════════════════════════════════════════════
// desktop/tests/_harness.mjs — DRIVE THE REAL SHELL, HIDDEN, ONE AT A TIME.
//
// launch() starts Electron through Playwright with the window off every screen (HR_DESKTOP_PLACE): shown without activating, no
// taskbar button, can't take focus, so Tyler's PC stays his. A window that was never shown (HR_DESKTOP_HIDDEN=1) gets no frames at
// all: requestAnimationFrame never fires, so neither Playwright's visibility checks nor the World run in it. That mode is only for
// the fullscreen step, which must not happen on a window the screen can see. Each launch has its own throwaway profile unless a
// test passes one to reopen. Every off-machine request is listed and, on a local world, refused.
// mutant-anchors: none — a prototype's proof harness, not a repo guard
// ════════════════════════════════════════════════════════════════════════
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
export const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = join(DESKTOP, '..');
export const ELECTRON_BIN = require('electron');
export const SHOTS = process.env.HR_DESKTOP_SHOTS || join(tmpdir(), 'hr-desktop-shots');
mkdirSync(SHOTS, { recursive: true });

export const OFF_SCREEN = '-20000,-20000';
export const PASSWORD = 'local-world-password';   // throwaway: these accounts live and die with an in-memory world
export const MOBILE_QUERY = '(max-width: 540px), (max-height: 540px) and (max-width: 1024px)';

export function freshProfile(tag = 'p') { return mkdtempSync(join(tmpdir(), 'hr-desktop-' + tag + '-')); }
export function dropProfile(dir) { try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); } catch { /* a temp folder */ } }

/** The steps of one proof: prints as it goes, exits non-zero if any failed. */
export function createReport(name) {
  const fails = [], facts = {}, t0 = Date.now();
  return {
    facts,
    step(what, ok, got = '') { console.log((ok ? '  ok   ' : '  RED  ') + what + (got !== '' ? ' -- ' + (typeof got === 'string' ? got : JSON.stringify(got)) : '') + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)'); if (!ok) fails.push(what); return ok; },
    note(what, value) { facts[what] = value; console.log('  fact ' + what + ': ' + (typeof value === 'string' ? value : JSON.stringify(value))); },
    finish() { console.log(fails.length ? name + ': RED (' + fails.length + ')\n  ' + fails.join('\n  ') : name + ': green'); return fails.length ? 1 : 0; },
  };
}

/**
 * @param {object} o
 * @param {string} [o.url]        HR_DESKTOP_URL: a loopback world, else the live site
 * @param {string} [o.profile]    a profile folder to reuse
 * @param {string} [o.executable] a packaged build, else the repo's Electron over desktop/
 * @param {string[]} [o.args]     extra Chromium switches
 * @param {object} [o.env]
 * @param {(url: URL) => boolean} [o.block] requests to refuse and list; default: anything off a local world's host
 */
export async function launch(o = {}) {
  const profile = o.profile || freshProfile();
  const env = { ...process.env, HR_DESKTOP_PLACE: OFF_SCREEN, HR_DESKTOP_USER_DATA: profile, ...(o.env || {}) };
  delete env.ELECTRON_RUN_AS_NODE;
  if (env.HR_DESKTOP_HIDDEN === '1') delete env.HR_DESKTOP_PLACE;
  if (o.url) env.HR_DESKTOP_URL = o.url; else delete env.HR_DESKTOP_URL;
  const spawnAt = Date.now();
  const executable = o.executable || process.env.HR_DESKTOP_EXE;   // a packaged build (tools/package.mjs), else the repo's Electron over desktop/
  const app = await electron.launch({
    executablePath: executable || ELECTRON_BIN,
    args: [...(executable ? [] : [DESKTOP]), ...(o.args || [])],
    env,
    timeout: 180000,
  });
  const offsite = [], errors = [], failed = [];
  const context = app.context();
  const local = o.url ? new URL(o.url).host : null;
  const block = o.block || (local ? (u) => u.host !== local && u.protocol !== 'data:' && u.protocol !== 'blob:' && u.protocol !== 'file:' : null);
  if (block) await context.route((u) => block(u), (r) => { offsite.push(r.request().url()); return r.abort(); });
  const page = await app.firstWindow({ timeout: 120000 });
  page.setDefaultTimeout(180000);             // a busy machine: the steps wait, a dead end still fails
  page.setDefaultNavigationTimeout(300000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => failed.push(r.url() + ' ' + (r.failure() && r.failure().errorText)));
  const pid = app.process().pid;
  return {
    app, page, profile, spawnAt, offsite, errors, failed, pid,
    main: (fn, arg) => app.evaluate(fn, arg),
    async metrics() { return app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type, kb: m.memory.workingSetSize, cpu: m.cpu.percentCPUUsage }))); },
    async shot(name) { const file = join(SHOTS, name + '.png'); await page.screenshot({ path: file }); return file; },
    async close() { await app.close().catch(() => {}); },
    /** What Steam's Stop or a crash does: no goodbye, no flush. Returns once every process is gone: until then the single-instance
        lock still stands, and a new launch hands over to the dying one and quits. */
    async kill() {
      const pids = (await this.metrics()).map((m) => m.pid);
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' });
      for (let i = 0; i < 60; i++) {
        const out = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', maxBuffer: 1 << 24 }).stdout || '';
        if (!pids.some((p) => out.includes('"' + p + '"'))) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error('the killed app is still running');
    },
  };
}

/** The town's first painted frame: the World's canvas has non-empty pixels. */
export async function waitTownFrame(page, timeout = 120000) {
  await page.waitForFunction(() => {
    const c = document.querySelector('.world-stage canvas');
    if (!c || !c.width || !c.height) return false;
    const g = c.getContext('2d');
    if (!g) return true;
    const d = g.getImageData(c.width >> 1, c.height >> 1, 16, 16).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  }, null, { polling: 50, timeout });
  return Date.now();
}

export const atDoor = (page) => page.waitForSelector('form[data-auth="sign-in"], .char-row, .hs-launchers, [data-closed-notice]');

/** Sign up from the real screen (the shim confirms at once), sign in, end at the characters screen. */
export async function signUpAndIn(page, email, password = PASSWORD) {
  await page.waitForSelector('form[data-auth="sign-in"]');
  await page.click('[data-auth-go="create"]');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.fill('input[name=confirm]', password);
  await page.click('.auth-submit');
  await page.waitForFunction(() => /Check your email/.test(document.querySelector('.auth-message')?.textContent || ''));
  await page.click('[data-auth-go="sign-in"]');
  await signIn(page, email, password);
}

export async function signIn(page, email, password = PASSWORD) {
  await page.waitForSelector('form[data-auth="sign-in"]');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('.auth-submit');
}

export async function createHero(page, name, slot = 0) {
  await page.click('[data-app="create"][data-slot="' + slot + '"]');
  await page.fill('.hero-name', name);
  await page.click('.hero-confirm');
  await page.waitForSelector('#panel-world[data-slot="' + slot + '"] .world-stage canvas');
  await page.waitForSelector('.hs-launchers');
}

export async function enterHunt(page, huntId) {
  await page.click('[data-hs-open="hunts"]');
  await page.click('.hw-hunt[data-hunt="' + huntId + '"]');
  await page.click('.hw-hunt-enter');
  await page.waitForSelector('[data-hs-act="leave"]');
}

/** Every number a layout proof reads, for one size. */
export const readLayout = (page) => page.evaluate((mobileQuery) => {
  const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), inView: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 }; };
  const canvas = document.querySelector('.world-stage canvas');
  const smallest = () => {
    const seen = new Map();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const t = n.nodeValue.trim();
      if (!t) continue;
      const el = n.parentElement;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || !el.getClientRects().length) continue;
      const size = parseFloat(cs.fontSize);
      if (!seen.has(size)) seen.set(size, t.slice(0, 24));
    }
    const sizes = [...seen.keys()].sort((a, b) => a - b);
    return { px: sizes[0], sample: seen.get(sizes[0]) };
  };
  return {
    inner: [innerWidth, innerHeight], dpr: devicePixelRatio,
    mobile: matchMedia(mobileQuery).matches, touch: document.documentElement.classList.contains('is-touch'),
    pointer: { fine: matchMedia('(pointer: fine)').matches, hover: matchMedia('(hover: hover)').matches },
    overflow: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight],
    canvas: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.getBoundingClientRect().width, cssH: canvas.getBoundingClientRect().height, rendering: getComputedStyle(canvas).imageRendering } : null,
    launchers: box('.hs-launchers'), bar: box('.hb-bar'), strip: box('.hs-strip, .char-strip'),
    smallestText: smallest(),
  };
}, MOBILE_QUERY);

export const exists = existsSync;
