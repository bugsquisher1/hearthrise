#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/platform-seam.mjs — ONE FILE TOUCHES WEB STORAGE (W4.1, the shell seam)
//
//   node tests/platform-seam.mjs             the guard
//   node tests/platform-seam.mjs --selftest  mutation proof
//
// One web core ships to the browser now, a Steam desktop shell next and a mobile
// shell later. A shell may need its own persistence backend, so the browser
// stores are named in exactly one shipped file — src/platform/storage.js — and
// everything else calls HearthriseStorage (the device store) or
// HearthriseStorage.session (the tab store).
//
//   PS-1  no direct browser storage in shipped src: localStorage, sessionStorage,
//         indexedDB, document.cookie, navigator.storage and Storage.prototype
//         appear in CODE only under src/platform/ (comments blanked; a string
//         literal that is exactly a store's name counts, so window['localStorage']
//         is caught). Out of scope: src/vendor/ (third party) and the in-page suite
//         (src/features/smoke/, src/features/smoke-test.js), which must reach
//         beneath the seam to prove it — plant what the device holds, refuse a
//         write, spy on the backend.
//   PS-2  the seam loads first: in play.html, src/platform/storage.js is a plain
//         classic script (no defer/async/module) ahead of every other src/ script
//         but src/vendor/ and src/platform/ (the cache kill-switch).
//   PS-3  the tab id stays a TAB id (CLAUDE.md §6): src/session/account-session.js
//         touches the tab key only inside tabSessionId, and only with a durable
//         write; src/app/boot.js hands the account session the seam's .session
//         (tab) store.
//   PS-4  the seam keeps its contract, EXECUTED in a vm against fake backends:
//         normal round trip; another tab's removal is seen; a refusing backend
//         never throws, set() answers false, the value reads back for the page and
//         {durable:true} keeps nothing; a blocked backend (the getter throws)
//         behaves the same; keys() is a snapshot; the tab store is its own backend.
//   PS-5  non-vacuity: ≥ 50 shipped files scanned, and src/app/boot.js names the seam
//         (the client injects the stores from boot; no other module may reach for one).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { strip as stripJs } from './_js-strip.mjs';
import { isMain } from './_is-main.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SEAM = 'src/platform/storage.js';
const SYNC = 'src/session/account-session.js';
const BOOT = 'src/app/boot.js';
const EXEMPT = (p) => p.startsWith('src/platform/') || p.startsWith('src/vendor/')
  || p.startsWith('src/features/smoke/') || p === 'src/features/smoke-test.js';
const DIRECT = /\b(?:localStorage|sessionStorage|indexedDB)\b|\bdocument\s*\.\s*cookie\b|\bnavigator\s*\.\s*storage\b|\bStorage\s*\.\s*prototype\b/g;
const NAMED = /(['"`])(?:localStorage|sessionStorage|indexedDB)\1/g;
const MIN_FILES = 50;
const MIN_CONSUMERS = 1;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(name)) out.push(p);
  }
  return out;
}

export function loadTree() {
  const files = {};
  for (const abs of walk(join(ROOT, 'src'), [])) files[relative(ROOT, abs).split(sep).join('/')] = readFileSync(abs, 'utf8');
  return { files, html: readFileSync(join(ROOT, 'play.html'), 'utf8') };
}

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
// The selftest re-checks the whole tree per case with one file changed; strip each text once.
const stripped = new Map();
const strip = (src) => { if (!stripped.has(src)) stripped.set(src, stripJs(src)); return stripped.get(src); };

function ps1(files, problems) {
  let scanned = 0, consumers = 0;
  for (const [p, src] of Object.entries(files)) {
    if (EXEMPT(p)) continue;
    scanned++;
    const { noC, noCS } = strip(src);
    if (/\bHearthriseStorage\b/.test(noCS)) consumers++;
    for (const m of noCS.matchAll(DIRECT)) problems.push(`PS-1 ${p}:${lineOf(noCS, m.index)} ${m[0]} — go through HearthriseStorage (${SEAM})`);
    for (const m of noC.matchAll(NAMED)) problems.push(`PS-1 ${p}:${lineOf(noC, m.index)} ${m[0]} — a store reached by name is still a direct touch`);
  }
  if (scanned < MIN_FILES) problems.push(`PS-5 only ${scanned} shipped src files scanned (< ${MIN_FILES}) — the guard is checking nothing`);
  if (consumers < MIN_CONSUMERS || !/\bHearthriseStorage\b/.test(strip(files[BOOT] || '').noCS)) problems.push(`PS-5 ${BOOT} does not name HearthriseStorage — the seam is not the path`);
}

function ps2(html, problems) {
  const tags = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>/g)]
    .map((m) => ({ attrs: m[1], src: (m[1].match(/\bsrc="([^"?]+)/) || [])[1] }))
    .filter((t) => t.src && t.src.startsWith('src/'));
  const at = tags.findIndex((t) => t.src === SEAM);
  if (at < 0) { problems.push(`PS-2 play.html does not load ${SEAM}`); return; }
  if (/\b(?:defer|async)\b|type="module"/.test(tags[at].attrs)) problems.push(`PS-2 ${SEAM} must be a plain classic script — every classic script after it reads it at parse time`);
  const early = tags.slice(0, at).filter((t) => !t.src.startsWith('src/vendor/') && !t.src.startsWith('src/platform/'));
  for (const t of early) problems.push(`PS-2 play.html loads ${t.src} before ${SEAM}`);
}

function bodyOf(src, name) {
  const at = src.search(new RegExp('function\\s+' + name + '\\s*\\('));
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return { start: at, end: j + 1, text: src.slice(at, j + 1) };
  }
  return null;
}

function ps3(files, problems) {
  const { noC } = strip(files[SYNC] || '');
  const body = bodyOf(noC, 'tabSessionId');
  if (!body) { problems.push(`PS-3 ${SYNC} has no tabSessionId() — the tab session has nothing to key on`); return; }
  for (const m of noC.matchAll(/\btabKey\b/g)) {
    if (m.index < body.start || m.index >= body.end) problems.push(`PS-3 ${SYNC}:${lineOf(noC, m.index)} the tab key used outside tabSessionId()`);
  }
  if (!/\.set\(\s*cfg\.tabKey\s*,[^;]*\{\s*durable\s*:\s*true\s*\}/.test(body.text)) problems.push('PS-3 tabSessionId() writes the tab key without {durable:true} — a refused id would read back as this tab\'s');
  const boot = strip(files[BOOT] || '').noC;
  if (!/new AccountSession\(\{[^}]*\btab:\s*HS\.session\b/.test(boot)) problems.push(`PS-3 ${BOOT} does not hand the account session the TAB store (HS.session) — the id would be shared by every tab of the browser`);
}

/* ── PS-4: run the seam ───────────────────────────────────────────────────── */
function fakeStorage({ refuseWrites = false } = {}) {
  const m = new Map();
  const quota = () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; };
  return {
    m,
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (refuseWrites) quota(); m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
  };
}

function bootSeam(src, win) {
  vm.runInNewContext(src, { window: win, console: { log() {} } }, { filename: SEAM, timeout: 2000 });
  return win.HearthriseStorage;
}

function ps4(src, problems) {
  const bad = (msg) => problems.push('PS-4 ' + msg);
  try {
    const local = fakeStorage(), tab = fakeStorage();
    const S = bootSeam(src, { localStorage: local, sessionStorage: tab });
    if (!S || typeof S.get !== 'function' || !S.session || typeof S.createStore !== 'function') return bad('the seam does not publish HearthriseStorage with .session and .createStore');
    if (S.available !== true || S.session.available !== true) bad('a working backend probed as unavailable');
    if (S.set('k', 1) !== true || S.get('k') !== '1' || local.m.get('k') !== '1') bad('a normal write did not land in the device store as a string');
    local.m.delete('k');
    if (S.get('k') !== null) bad('another tab removed a key and this page still reads it — a stale copy outlived the backend');
    if (S.session.set('t', 'x') !== true || tab.m.get('t') !== 'x' || local.m.has('t')) bad('the TAB store did not write to sessionStorage alone');
    if (S.setJSON('j', { a: 1 }) !== true || S.getJSON('j', null).a !== 1) bad('setJSON/getJSON did not round-trip');
    local.m.set('bad', '{nope');
    if (S.getJSON('bad', 'fb') !== 'fb' || S.getJSON('missing', 'fb') !== 'fb') bad('getJSON did not fall back on malformed / missing');
    const loop = {}; loop.self = loop;
    if (S.setJSON('loop', loop) !== false) bad('a circular value did not answer false');
    local.m.set('w1', '1'); local.m.set('w2', '2');
    for (const k of S.keys()) S.remove(k);
    if (local.m.size !== 0) bad('removing while walking keys() skipped entries — keys() is not a snapshot');

    for (const [label, win] of [
      ['refusing (quota)', { localStorage: fakeStorage({ refuseWrites: true }), sessionStorage: fakeStorage() }],
      ['blocked (SecurityError)', Object.defineProperty({ sessionStorage: fakeStorage() }, 'localStorage', { get() { const e = new Error('insecure'); e.name = 'SecurityError'; throw e; } })],
    ]) {
      const R = bootSeam(src, win);
      let threw = null, wrote, durable;
      try {
        wrote = R.set('pref', 'v');
        durable = R.set('id', 'x', { durable: true });
        R.get('nothing'); R.remove('nothing'); R.keys(); R.getJSON('nothing', 0);
      } catch (e) { threw = e; }
      if (threw) { bad(`${label}: the seam threw ${threw.name} into its caller`); continue; }
      if (R.available !== false) bad(`${label}: probed as available`);
      if (wrote !== false) bad(`${label}: set() answered ${wrote} for a write the backend refused`);
      if (R.get('pref') !== 'v') bad(`${label}: a refused preference does not read back for the rest of the page`);
      if (durable !== false || R.get('id') !== null) bad(`${label}: a refused {durable:true} write was kept (a refused id would read back as real)`);
      if (!R.keys().includes('pref')) bad(`${label}: keys() hides the page's stand-ins`);
      R.remove('pref');
      if (R.get('pref') !== null) bad(`${label}: remove() left the stand-in behind`);
    }
  } catch (e) {
    bad(`the seam could not be executed: ${e.message}`);
  }
}

export function check({ files, html }) {
  const problems = [];
  if (!files[SEAM]) problems.push(`PS-4 ${SEAM} is missing`);
  ps1(files, problems);
  ps2(html, problems);
  ps3(files, problems);
  if (files[SEAM]) ps4(files[SEAM], problems);
  return problems;
}

function selftest() {
  const base = loadTree();
  const plant = (p, f) => (t) => ({ ...t, files: { ...t.files, [p]: f(t.files[p] || '') } });
  const swap = (p, a, b) => plant(p, (s) => { if (!s.includes(a)) throw new Error(`selftest anchor missing in ${p}: ${a}`); return s.replace(a, b); });
  const html = (f) => (t) => ({ ...t, html: f(t.html) });
  const SEAM_TAG = '<script src="src/platform/storage.js?v=';
  const cases = [
    ['clean tree', (t) => t, null],
    ['a direct localStorage read in a shipped file', plant('src/app/sign-in.js', (s) => s + "\nvar __x = localStorage.getItem('x');\n"), 'PS-1'],
    ['sessionStorage reached by name', plant('src/session/server.js', (s) => s + "\nvar __y = window['sessionStorage'];\n"), 'PS-1'],
    ['document.cookie', plant('src/app/world-pane.js', (s) => s + "\ndocument.cookie = 'a=1';\n"), 'PS-1'],
    ['indexedDB', plant('src/net/auth.js', (s) => s + "\nconst __db = indexedDB.open('hr');\n"), 'PS-1'],
    ['negative control: storage named in a comment and inside prose', plant('src/app/sign-in.js', (s) => s + "\n// localStorage.setItem(k, v)\nvar __p = 'kept in localStorage for now';\n"), null],
    ['negative control: the seam may reach beneath itself', plant(SEAM, (s) => s + '\nfunction __rawProbe() { return window.localStorage; }\n'), null],
    ['the seam loaded after the glyphs', html((h) => {
      const m = h.match(/[ \t]*<script src="src\/platform\/storage\.js\?v=\d[\d.]*"><\/script>\r?\n/);
      return h.replace(m[0], '').replace(/([ \t]*<script src="src\/data\/glyphs\.js\?v=\d[\d.]*"><\/script>\r?\n)/, '$1' + m[0]);
    }), 'PS-2'],
    ['the seam deferred', html((h) => h.replace(SEAM_TAG, '<script defer src="src/platform/storage.js?v=')), 'PS-2'],
    ['the tab id moved to the device store', swap(BOOT, 'tab: HS.session, channel', 'tab: HS, channel'), 'PS-3'],
    ['the tab id written without durable', swap(SYNC, 'tab.set(cfg.tabKey, id, { durable: true })', 'tab.set(cfg.tabKey, id)'), 'PS-3'],
    ['the tab key read outside tabSessionId', plant(SYNC, (s) => s + '\nexport const __leak = (t) => t.get(SESSION_CONFIG.tabKey);\n'), 'PS-3'],
    ['boot stops naming the seam', swap(BOOT, 'const HS = win.HearthriseStorage;', 'const HS = win.Store;'), 'PS-5'],
    ['the seam keeps every write as a stand-in (stale after another tab removes)', swap(SEAM, 'delete standIn[key];\n        return true;', 'standIn[key] = s;\n        return true;'), 'PS-4'],
    ['a durable write keeps its refused value', swap(SEAM, 'if (!(opts && opts.durable)) standIn[key] = s;', 'standIn[key] = s;'), 'PS-4'],
    ['the seam throws into its caller', swap(SEAM, 'if (!(opts && opts.durable)) standIn[key] = s;\n        return false;', 'throw e;'), 'PS-4'],
    ['the tab store wired to localStorage', swap(SEAM, 'return root.sessionStorage;', 'return root.localStorage;'), 'PS-4'],
    ['keys() misses backend entries', swap(SEAM, 'for (var i = 0; i < b.length; i++)', 'for (var i = 0; i < Math.min(1, b.length); i++)'), 'PS-4'],
    ['most of the tree gone', (t) => ({ ...t, files: Object.fromEntries(Object.entries(t.files).filter(([p], i) => i < 10 || p === SEAM || p === SYNC || p === BOOT)) }), 'PS-5'],
  ];
  let wrong = 0;
  for (const [name, mutate, want] of cases) {
    let got;
    const t0 = Date.now();
    try { got = check(mutate(base)); } catch (e) { console.error(`✗ ${name} → harness: ${e.message}`); wrong++; continue; }
    const ok = want === null ? got.length === 0 : got.some((g) => g.startsWith(want));
    if (!ok) wrong++;
    console.log(`${ok ? '✓' : '✗'} ${name} → ${got.length ? got[0] : 'GREEN'} (want ${want || 'GREEN'}, ${Date.now() - t0} ms)`);
  }
  if (wrong) { console.error(`✗ platform-seam --selftest: ${wrong} case(s) wrong`); process.exit(1); }
  console.log(`✓ platform-seam --selftest: all ${cases.length} cases behave (non-vacuous)`);
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else {
    const problems = check(loadTree());
    if (problems.length) {
      for (const p of problems) console.error('✗ ' + p);
      console.error(`✗ platform-seam: ${problems.length} problem(s) — web storage reached around ${SEAM}`);
      process.exit(1);
    }
    console.log(`✓ platform-seam: shipped src reaches web storage only through ${SEAM} (PS-1..PS-5)`);
  }
}
