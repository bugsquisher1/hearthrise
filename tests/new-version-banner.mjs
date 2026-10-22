#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/new-version-banner.mjs — A TAB LEFT OPEN ACROSS A RELEASE IS TOLD TO RELOAD.
//
//   node tests/new-version-banner.mjs           the rules (pure node, a fake page)
//   node tests/new-version-banner.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/app/new-version.js src/session/server.js src/app/boot.js
// mutant-writes-tree: no — mutants are planted into a temp copy of the files below
//
// Tyler 2026-10-22: an old client kept running after a release and its hero
// snapped back on every answer. src/app/new-version.js asks which build the site
// serves (src/build-info.js, fresh) and raises ONE reload banner when it differs.
//   NV-1  a served version other than the running one shows the banner, once, with the copy;
//         the ask is no-store with a fresh query, so no cache answers it
//   NV-2  the same version, a failed fetch, an error status or a file stating no version: no banner
//   NV-3  Later hides it; the next check that finds the new build shows it again
//   NV-4  Reload deletes every cache and unregisters every service worker, THEN reloads
//   NV-5  focus and a tab becoming visible check; the interval is the stated cadence
//   NV-6  a stale client's answer (PGRST202, unknown_verb, version_conflict, *_mismatch) tells
//         the server link's `stale`; a yes, a plain refusal, the closed game or a network
//         failure does not
//   NV-7  forced checks (a burst of stale answers) ask at most once per forcedGapMs
//   NV-8  the real src/build-info.js states BUILD.version (bump-version.sh keeps it the release)
//   NV-9  boot mounts the watch on every screen and hands its check to the server link
// ════════════════════════════════════════════════════════════════════════
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['src/app/new-version.js', 'src/app/boot.js', 'src/build-info.js', 'src/session/server.js',
  'src/session/intent-ledger.js', 'src/net/supabase-bootstrap.js'];
let seq = 0;

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href + '?t=' + (++seq);
  return { N: await import(u('src/app/new-version.js')), S: await import(u('src/session/server.js')),
    B: await import(u('src/build-info.js')), boot: readFileSync(join(base, 'src/app/boot.js'), 'utf8') };
}

/* ── A fake page: just the DOM the banner uses. ── */
function fakeEl(tag) {
  const attrs = {};
  const listeners = {};
  const el = {
    tag, className: '', type: '', textContent: '', children: [], parentNode: null,
    setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => (k in attrs ? attrs[k] : null),
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    click: () => { for (const fn of listeners.click || []) fn({ target: el }); },
    appendChild: (c) => { c.parentNode = el; el.children.push(c); return c; },
    insertBefore: (c, ref) => { c.parentNode = el; const i = ref ? el.children.indexOf(ref) : -1; el.children.splice(i < 0 ? el.children.length : i, 0, c); return c; },
    removeChild: (c) => { el.children.splice(el.children.indexOf(c), 1); c.parentNode = null; return c; },
    get firstChild() { return el.children[0] || null; },
  };
  return el;
}
function fakeWin(o) {
  const calls = [];
  const order = [];
  const winL = {};
  const docL = {};
  const classes = new Set();
  const body = fakeEl('body');
  body.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) };
  body.appendChild(fakeEl('div'));   // #app
  let served = o.served;
  const doc = { body, visibilityState: 'visible', createElement: fakeEl,
    addEventListener: (ev, fn) => { (docL[ev] = docL[ev] || []).push(fn); }, removeEventListener: () => {} };
  const intervals = [];
  const win = {
    document: doc,
    fetch: async (url, init) => {
      calls.push([url, init]);
      if (served === 'throw') throw new Error('offline');
      if (served === 500) return { ok: false, status: 500, text: async () => '' };
      return { ok: true, status: 200, text: async () => (served === null ? '// nothing' : "export const BUILD = Object.freeze({\n  version:   '" + served + "',\n});") };
    },
    setInterval: (fn, ms) => { intervals.push(ms); return intervals.length; }, clearInterval: () => {},
    addEventListener: (ev, fn) => { (winL[ev] = winL[ev] || []).push(fn); }, removeEventListener: () => {},
    caches: { keys: async () => { order.push('keys'); return ['hearthrise-0.2.27', 'other']; }, delete: async (k) => { order.push('delete:' + k); return true; } },
    navigator: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => { order.push('unregister'); return true; } }] } },
    location: { reload: () => order.push('reload') },
  };
  return { win, doc, body, calls, order, intervals, classes, winL, docL, serve: (v) => { served = v; } };
}
const banner = (p) => p.body.children.find((c) => c.className === 'new-version') || null;
const tick = () => new Promise((r) => setTimeout(r, 0));

async function rules(m) {
  const { N, S, B } = m;
  const fails = [];
  const t = async (id, fn) => { try { const r = await fn(); if (r !== true) fails.push(id + ': ' + r); } catch (e) { fails.push(id + ': threw ' + (e && e.message)); } };
  const mount = (p, extra) => N.mountNewVersion(p.win, Object.assign({ running: '0.2.28', url: 'https://x/src/build-info.js', timers: false, now: () => 1000, fetch: p.win.fetch }, extra));

  await t('NV-1', async () => {
    const p = fakeWin({ served: '0.2.29' });
    const w = mount(p);
    const r1 = await w.check();
    const r2 = await w.check();
    const b = banner(p);
    if (!r1 || !r2 || !b || p.body.children.filter((c) => c.className === 'new-version').length !== 1) return 'the banner did not show once: ' + JSON.stringify([r1, r2, !!b]);
    if (p.body.children[0] !== b || !p.classes.has('has-new-version')) return 'the banner is not above the app';
    const text = b.children.map((c) => c.textContent);
    if (text[0] !== N.NEW_VERSION_COPY.line || text[0] !== 'A new version of Hearthrise is out. Reload to get it.' || text[1] !== 'Reload') return 'the banner says ' + JSON.stringify(text);
    const [url, init] = p.calls[0];
    if (url !== 'https://x/src/build-info.js?n=1000' || !init || init.cache !== 'no-store') return 'the ask was ' + JSON.stringify(p.calls[0]);
    return true;
  });
  await t('NV-2', async () => {
    for (const served of ['0.2.28', 'throw', 500, null]) {
      const p = fakeWin({ served });
      const r = await mount(p).check();
      if (r || banner(p) || p.classes.has('has-new-version')) return 'a banner for served=' + served;
    }
    return true;
  });
  await t('NV-3', async () => {
    const p = fakeWin({ served: '0.2.29' });
    const w = mount(p);
    await w.check();
    banner(p).children.find((c) => c.getAttribute('data-nv') === 'later').click();
    if (banner(p) || w.shown() || p.classes.has('has-new-version')) return 'Later did not hide it';
    await w.check();
    return (banner(p) && w.shown()) || 'the next check did not bring it back';
  });
  await t('NV-4', async () => {
    const p = fakeWin({ served: '0.2.29' });
    const w = mount(p);
    await w.check();
    banner(p).children.find((c) => c.getAttribute('data-nv') === 'reload').click();
    for (let i = 0; i < 10; i++) await tick();
    const o = p.order.join(',');
    return o === 'keys,delete:hearthrise-0.2.27,delete:other,unregister,reload' || 'Reload did ' + o;
  });
  await t('NV-5', async () => {
    const p = fakeWin({ served: '0.2.29' });
    N.mountNewVersion(p.win, { running: '0.2.28', url: 'https://x/b.js', now: () => 1, fetch: p.win.fetch });
    if (p.intervals.join() !== String(N.NEW_VERSION_TIMING.checkEveryMs) || N.NEW_VERSION_TIMING.checkEveryMs > 5 * 60 * 1000) return 'the interval is ' + p.intervals.join();
    for (const fn of p.winL.focus || []) fn();
    await tick(); await tick();
    const afterFocus = p.calls.length;
    for (const fn of p.docL.visibilitychange || []) fn();
    await tick(); await tick();
    if (afterFocus !== 1 || p.calls.length !== 2) return 'focus/visible asked ' + afterFocus + ' then ' + p.calls.length;
    return !!banner(p) || 'a wake check showed nothing';
  });
  await t('NV-6', async () => {
    const answers = [
      [404, { code: 'PGRST202', message: 'Could not find the function' }, true],
      [400, { ok: false, error: 'unknown_verb' }, true],
      [409, { ok: false, error: 'version_conflict' }, true],
      [200, { ok: false, error: 'intent_mismatch' }, true],
      [200, { ok: true }, false],
      [200, { ok: false, error: 'insufficient_gold' }, false],
      [403, { code: 'hr_closed' }, false],
      ['network', null, false],
    ];
    for (const [status, body, want] of answers) {
      let told = 0;
      const fetch = async () => { if (status === 'network') throw new Error('down'); return { ok: status < 300, status, json: async () => body }; };
      const link = S.createServerLink({ url: 'https://x', anonKey: 'anon', token: () => 'jwt', fetch, stale: () => { told++; } });
      await link.rpc('hr_town_move', { p_slot: 0 });
      if ((told === 1) !== want) return JSON.stringify([status, body]) + ' told stale ' + told + ' time(s)';
    }
    return true;
  });
  await t('NV-7', async () => {
    const p = fakeWin({ served: '0.2.28' });
    let clock = 0;
    const w = mount(p, { now: () => clock });
    for (let i = 0; i < 5; i++) await w.check(true);
    if (p.calls.length !== 1) return 'a burst asked ' + p.calls.length + ' times';
    clock = N.NEW_VERSION_TIMING.forcedGapMs;
    await w.check(true);
    return p.calls.length === 2 || 'after the gap the ask count is ' + p.calls.length;
  });
  await t('NV-8', async () => {
    const v = N.servedVersionOf(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8'));
    return (v && v === B.BUILD.version) || 'build-info.js reads as ' + v + ', BUILD.version is ' + B.BUILD.version;
  });
  await t('NV-9', async () => {
    const s = m.boot;
    if (!/const fresh = mountNewVersion\(win\);/.test(s)) return 'boot does not mount the watch for every screen';
    return /createServerLink\(\{[^)]*stale: \(\) => fresh\.check\(true\)/.test(s) || 'the server link is not told to check on a stale answer';
  });
  return fails;
}

/* ── THE MUTANTS: each must turn at least one rule red. ── */
const MUTANTS = [
  ['the running build counts as new', 'src/app/new-version.js', 'if (dead || !served || served === running) return false;', 'if (dead || !served) return false;'],
  ['a cache may answer the check', 'src/session/server.js', "(url, { cache: 'no-store' })", '(url, {})'],
  ['Reload keeps the caches', 'src/app/new-version.js', '      await purge(win);\n      win.location.reload();', '      win.location.reload();'],
  ['Later hides it forever', 'src/app/new-version.js', '  function hide() {\n', '  function hide() {\n    dead = true;\n'],
  ['focus never checks', 'src/app/new-version.js', "  win.addEventListener('focus', onWake);\n", ''],
  ['a burst of stale answers asks every time', 'src/app/new-version.js', 'if (now() - lastForced < NEW_VERSION_TIMING.forcedGapMs)', 'if (false)'],
  ['a stale answer tells nobody', 'src/session/server.js', 'return STALE_CODES.has(code) || /_mismatch$/.test(code);', 'return false;'],
  ['every refusal is a stale client', 'src/session/server.js', 'return STALE_CODES.has(code) || /_mismatch$/.test(code);', 'return true;'],
  ['boot never hands the check to the link', 'src/app/boot.js', 'stale: () => fresh.check(true) });', '});'],
];

async function main() {
  const mutate = process.argv.includes('--mutate');
  const clean = await rules(await load(ROOT));
  if (!mutate) {
    for (const f of clean) console.log('  ✗ ' + f);
    console.log(clean.length ? 'new-version-banner: ' + clean.length + ' rule(s) RED' : 'new-version-banner: every rule holds (9 rules)');
    process.exit(clean.length ? 1 : 0);
  }
  if (clean.length) { console.log('  ✗ clean control is RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'hr-newver-'));
    try {
      for (const f of FILES) { mkdirSync(dirname(join(tmp, f)), { recursive: true }); cpSync(join(ROOT, f), join(tmp, f)); }
      const text = readFileSync(join(tmp, file), 'utf8').replace(/\r\n/g, '\n');
      if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
      writeFileSync(join(tmp, file), text.replace(from, to));
      const fails = await rules(await load(tmp));
      if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(':')[0] + ')');
      else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(bad ? 'new-version-banner --mutate: ' + bad + ' mutant(s) escaped' : 'new-version-banner --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
