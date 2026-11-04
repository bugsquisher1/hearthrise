#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// desktop/tests/prove-local.mjs — THE REAL GAME IN THE REAL SHELL, ON A LOCAL WORLD. NO PRODUCTION, NO SECRETS.
//
//   node tests/prove-local.mjs [--tail]    (from desktop/; a machine's first run replays the chain, about 6 min)
//                                          --tail skips the reload and the closed-app steps: hard kill, sizes, banner, fullscreen
//
// A brand-new account from the real sign-in screen, a hero, a hunt, a reload, the app closed while the server keeps
// hunting, the app reopened still signed in, a hard kill (Steam's Stop), then resize and fullscreen.
// HR_DESKTOP_SHOTS=DIR keeps the screenshots. Exit 0 green, 1 red, 2 harness.
// mutant-anchors: none — a prototype's proof, not a repo guard
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, atDoor, createHero, createReport, dropProfile, enterHunt, freshProfile, launch, readLayout, signUpAndIn, waitTownFrame } from './_harness.mjs';

const { openWorld } = await import(pathToFileURL(join(REPO, 'tools/qa/local-world.mjs')).href);
const r = createReport('prove-local');
/* No timer tick: a skip settles the way the tick does (the tool's own smoke runs so), and one process holds the file server and the
   database, so a tick in flight stalls a page load for minutes on a busy PC. */
const world = await openWorld({ tickMs: false });
r.step('local world up (replayed chain, real engine, auth shim)', true);
const profile = freshProfile('local');
const sql = async (q) => (await world.db.query(q)).rows[0];
let a = null;
try {
  a = await launch({ url: world.url, profile });
  await atDoor(a.page);
  r.step('the window loads the real play.html', /play\.html/.test(a.page.url()), a.page.url());
  const where = await a.main(({ screen }) => {
    const w = globalThis.__hrShell.win, b = w.getBounds();
    const seen = screen.getAllDisplays().some((d) => b.x < d.bounds.x + d.bounds.width && b.x + b.width > d.bounds.x && b.y < d.bounds.y + d.bounds.height && b.y + b.height > d.bounds.y);
    return { focused: w.isFocused(), seen, bounds: b, displays: screen.getAllDisplays().map((d) => ({ bounds: d.bounds, scale: d.scaleFactor })), gpu: w.isVisible() };
  });
  r.note('window and displays', where);
  r.step('the window is off every screen and has no focus', !where.focused && !where.seen, where.bounds);

  await signUpAndIn(a.page, 'steam@local-world.test');
  await a.page.waitForSelector('.char-row, [data-app="create"]');
  r.step('sign-in: a new account from the real screens', true);
  await a.shot('01-characters');
  await createHero(a.page, 'Marlow');
  await waitTownFrame(a.page);
  r.step('hero made, the town painted', true);
  await a.shot('02-town');
  const townLayout = await readLayout(a.page);
  r.note('layout 1440x900 (default window)', townLayout);

  await enterHunt(a.page, 'mill_cellar');
  r.step('hunt: Mill Cellar entered', !!(await sql(`select id from public.hunt_sessions where ended_at is null`)));
  await a.shot('03-hunting');
  const xp0 = Number((await sql(`select level_xp::bigint as xp from public.player_state limit 1`)).xp);
  await world.skip(10);
  const xp1 = Number((await sql(`select level_xp::bigint as xp from public.player_state limit 1`)).xp);
  r.step('the hero fought on the server (a real settle)', xp1 > xp0, { xp0, xp1 });

  if (!process.argv.includes('--tail')) {
    await a.page.reload({ waitUntil: 'load' });
    await a.page.waitForSelector('[data-hs-act="leave"]');
    r.step('reload: the hunt comes back from the server', true);
    await a.shot('04-after-reload');

    await a.close();
    a = null;
    const xp2 = Number((await sql(`select level_xp::bigint as xp from public.player_state limit 1`)).xp);
    await world.skip(10);
    const xp3 = Number((await sql(`select level_xp::bigint as xp from public.player_state limit 1`)).xp);
    r.step('app closed: the hunt keeps running on the server', xp3 > xp2 && !!(await sql(`select id from public.hunt_sessions where ended_at is null`)), { xp2, xp3 });

    a = await launch({ url: world.url, profile });
    await a.page.waitForSelector('.char-row, .hs-launchers, form[data-auth="sign-in"]');
    r.step('app restart: still signed in', !(await a.page.$('form[data-auth="sign-in"]')));
    if (await a.page.$('[data-app="play"]')) await a.page.click('[data-app="play"]');
    await a.page.waitForSelector('[data-hs-act="leave"]');
    r.step('app restart: pressed Play, back in the same hunt', true);
    await a.shot('05-after-restart');
  }

  /* STEAM'S STOP: no goodbye. A session stored moments ago must still be there: the risk is a refresh token rotated on the server whose
     new value was still in Chromium's write-behind when the process died. So the app refreshes, and dies 1.5 s later. */
  const before = await a.page.evaluate(() => JSON.parse(localStorage.getItem('hr-auth')).refresh_token);
  const refreshed = await a.page.evaluate(async () => {
    const stored = JSON.parse(localStorage.getItem('hr-auth'));
    const res = await fetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'local' }, body: JSON.stringify({ refresh_token: stored.refresh_token }) });
    const s = await res.json();
    localStorage.setItem('hr-auth', JSON.stringify({ ...stored, ...s }));
    return s.refresh_token;
  });
  r.step('hard kill: a token rotation just happened', !!refreshed && refreshed !== before);
  await a.page.waitForTimeout(1500);
  await a.kill();
  a = null;
  a = await launch({ url: world.url, profile });
  await a.page.waitForSelector('.char-row, .hs-launchers, form[data-auth="sign-in"]');
  const kept = await a.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('hr-auth')).refresh_token; } catch { return null; } });
  r.step('hard kill 1.5 s after a rotation: the stored refresh token is the new one', kept === refreshed, kept === refreshed ? '' : kept === before ? 'the OLD one (the write was lost)' : 'gone');
  r.step('hard kill: still signed in', !(await a.page.$('form[data-auth="sign-in"]')));
  if (await a.page.$('[data-app="play"]')) await a.page.click('[data-app="play"]');
  await a.page.waitForSelector('[data-hs-act="leave"]');

  /* SIZES. The Deck's first: it must take the desktop layout. */
  const sizes = [[1280, 800], [1280, 720], [1024, 640], [1920, 1080], [2560, 1440]];
  for (const [w, h] of sizes) {
    await a.setSize(w, h);
    await a.page.waitForTimeout(500);
    const l = await readLayout(a.page);
    r.note('layout ' + w + 'x' + h, l);
    r.step(w + 'x' + h + ': desktop layout, nothing overflows the page', l.inner[0] === w && l.inner[1] === h && !l.mobile && l.overflow[0] <= 0 && l.overflow[1] <= 0, l.inner);
    r.step(w + 'x' + h + ': the action bar and the icon row are on screen', !!l.launchers && l.launchers.inView && (!l.bar || l.bar.inView), { bar: l.bar, launchers: l.launchers });
    await a.shot('06-size-' + w + 'x' + h);
  }

  /* THE NEW-VERSION BANNER: the web's answer to a release must work in the window too. The served build-info says "newer". */
  await a.page.route('**/src/build-info.js?n=*', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: "export const BUILD = { version: '9.9.9', cache: '9.9.9' };" }));
  await a.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await a.page.waitForSelector('.new-version [data-nv="reload"]', { timeout: 30000 });
  await a.page.unroute('**/src/build-info.js?n=*');
  await a.page.click('.new-version [data-nv="reload"]');
  await a.page.waitForFunction(() => !document.querySelector('.new-version'), null, { polling: 200 });
  await a.page.waitForSelector('[data-hs-act="leave"]');
  r.step('a new release: the banner shows, Reload reloads the window, the hunt is still there', true);
  r.note('pushes delivered over the app\'s socket', world.pushed());

  r.step('no console errors', a.errors.length === 0, a.errors.slice(0, 5).join(' | '));
  r.step('nothing left the machine', a.offsite.length === 0 && world.offsite.length === 0, [...a.offsite, ...world.offsite].slice(0, 5).join(' | '));
  await a.close();

  /* FULLSCREEN, on a window never shown (no frames, so layout only): it must not appear on Tyler's screen. */
  a = await launch({ url: world.url, profile, env: { HR_DESKTOP_HIDDEN: '1' } });
  await a.page.waitForFunction(() => !!document.querySelector('.char-row, .hs-launchers'), null, { polling: 200 });
  await a.main(() => { globalThis.__hrShell.win.setFullScreen(true); });
  await a.page.waitForFunction(() => innerWidth > 1440, null, { polling: 200, timeout: 15000 }).catch(() => {});
  const fs = await a.main(() => { const w = globalThis.__hrShell.win; return { full: w.isFullScreen(), visible: w.isVisible(), bounds: w.getBounds() }; });
  const fsl = await a.page.evaluate((q) => ({ inner: [innerWidth, innerHeight], mobile: matchMedia(q).matches, overflow: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight] }), '(max-width: 540px), (max-height: 540px) and (max-width: 1024px)');
  r.note('fullscreen', { ...fs, layout: fsl });
  r.step('fullscreen: the page takes the whole display, desktop layout, nothing shown', fs.full && !fs.visible && !fsl.mobile && fsl.inner[0] === fs.bounds.width && fsl.inner[1] === fs.bounds.height, { fs, inner: fsl.inner });
  await a.main(() => { const w = globalThis.__hrShell.win; w.setFullScreen(false); });
  await a.page.waitForFunction(() => innerWidth <= 1440, null, { polling: 200, timeout: 15000 }).catch(() => {});
  r.step('fullscreen off: the window comes back', !(await a.main(() => globalThis.__hrShell.win.isFullScreen())));
} catch (e) {
  r.step('the walk finished', false, String(e && e.stack || e).slice(0, 800));
  if (a) await a.shot('zz-failed').catch(() => {});
} finally {
  if (a) await a.close();
  await world.close();
  dropProfile(profile);
}
process.exit(r.finish());
