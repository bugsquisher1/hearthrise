#!/usr/bin/env node
// tests/_chrome.mjs — the ONE place a page runner picks its Chromium (b561).
//
//   HR_CHROME unset       → Playwright's own download (CI)
//   HR_CHROME=<existing>  → that executable (a sandbox with a preinstalled build)
//   HR_CHROME=<missing>   → exit 1, one line naming the path; no Playwright stack
//   HR_CHROME unset, off CI, a headless launch, and Playwright's own headless shell NOT installed
//                         → the newest installed chromium_headless_shell-* in Playwright's browser folder
//                           (%LOCALAPPDATA%/ms-playwright on Windows, or PLAYWRIGHT_BROWSERS_PATH), one stderr line naming it
//
//   node tests/_chrome.mjs             # print what a runner would launch
//   node tests/_chrome.mjs --selftest  # the arms above, asserted
// mutant-anchors: none — the proof plants HR_CHROME values into a child process and a browser folder into a fake, never a tree file
//
// THE FALLBACK (lane/c-guard-batch-142). playwright-core 1.65.1 wants chromium_headless_shell-1255 and this PC had only 1234, so every
// local browser test died at launch unless HR_CHROME was set by hand. Nothing is downloaded here. CI (CI set) never falls back: it
// installs the build its Playwright wants, and a launch there fails exactly as before if that install is missing.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';

export function chromePath(env = process.env, exists = existsSync) {
  const p = env.HR_CHROME;
  if (!p) return undefined;
  if (!exists(p)) throw new Error(`HR_CHROME=${p} does not exist — unset it to use Playwright's Chromium, or point it at a chrome binary`);
  return p;
}

/* Playwright's browser folder, as its registry finds it: PLAYWRIGHT_BROWSERS_PATH ("0" = inside the package), else the OS cache. */
function browsersDir(env, pkgDir) {
  const p = env.PLAYWRIGHT_BROWSERS_PATH;
  if (p === '0') return join(pkgDir, '.local-browsers');
  if (p) return p;
  if (process.platform === 'win32') return env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'ms-playwright') : null;
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'ms-playwright');
  return join(env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'ms-playwright');
}

/* The headless shell the installed Playwright launches: its browser folder, revision and version (null if Playwright is not installed). */
function wantedShell(env) {
  try {
    const here = createRequire(import.meta.url);
    let pkg;
    try { pkg = createRequire(here.resolve('playwright/package.json')).resolve('playwright-core/package.json'); }
    catch { pkg = here.resolve('playwright-core/package.json'); }
    const shell = JSON.parse(readFileSync(join(dirname(pkg), 'browsers.json'), 'utf8')).browsers.find((b) => b.name === 'chromium-headless-shell');
    const dir = browsersDir(env, dirname(pkg));
    return shell && dir ? { dir, revision: String(shell.revision), version: JSON.parse(readFileSync(pkg, 'utf8')).version } : null;
  } catch { return null; }
}

const REAL_IO = { exists: existsSync, list: (d) => { try { return readdirSync(d); } catch { return []; } }, wanted: wantedShell };
const SHELL_EXES = ['chrome-headless-shell.exe', 'chrome-headless-shell', 'headless_shell.exe', 'headless_shell'];

/** When Playwright's own headless shell is missing (off CI, HR_CHROME unset): the newest installed chromium_headless_shell-* and the
    line that names it, or null (Playwright's default stands, and its own error if it has nothing to launch). */
export function fallbackShell(env = process.env, io = REAL_IO) {
  if (env.HR_CHROME || env.CI) return null;
  const want = io.wanted(env);
  if (!want) return null;
  if (io.exists(join(want.dir, `chromium_headless_shell-${want.revision}`, 'INSTALLATION_COMPLETE'))) return null;
  const builds = io.list(want.dir).map((n) => /^chromium_headless_shell-(\d+)$/.exec(n)).filter(Boolean)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  for (const [build] of builds) {
    const root = join(want.dir, build);
    if (!io.exists(join(root, 'INSTALLATION_COMPLETE'))) continue;
    for (const sub of io.list(root)) for (const exe of SHELL_EXES) {
      const path = join(root, sub, exe);
      if (io.exists(path)) {
        return { path, build, line: `_chrome: Playwright ${want.version} wants chromium_headless_shell-${want.revision}, not installed; using ${build} (${path})` };
      }
    }
  }
  return null;
}

let named = false;
export function launchOptions(extra = {}, env = process.env, exists = existsSync, io = REAL_IO) {
  let p;
  try { p = chromePath(env, exists); }
  catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
  if (p) return { ...extra, executablePath: p };
  const fb = extra.headless === false ? null : fallbackShell(env, io);
  if (!fb) return { ...extra };
  if (!named) { named = true; console.error(fb.line); }
  return { ...extra, executablePath: fb.path };
}

/* ONE CHROMIUM PER RUN (2026-10-20). A page runner's --mutate arm calls its checks
   once per mutant, and each call launched (and closed) its own browser. Each call
   now LEASES the run's one browser. Isolation is the context — browser.newContext()
   has its own cookies, storage, HTTP cache and service workers — which every runner
   already opens per page; a lease's close() closes exactly the contexts it opened.
   A browser that died is relaunched. It goes down with the process: Playwright kills
   the browsers it launched on exit, and every runner ends in process.exit. */
let shared = null;
export async function leaseBrowser(chromium, extra = { headless: true }) {
  let browser = shared && await shared.catch(() => null);
  if (!browser || !browser.isConnected()) {
    shared = chromium.launch(launchOptions(extra));
    browser = await shared;
  }
  const mine = new Set();
  return {
    newContext: async (o) => { const c = await browser.newContext(o); mine.add(c); return c; },
    close: async () => { for (const c of mine) await c.close().catch(() => {}); mine.clear(); },
  };
}

function selftest() {
  const fails = [];
  const check = (name, ok, got) => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — got ${got}`}`); if (!ok) fails.push(name); };

  /* A fake browser folder: `files` are paths under PW that exist; Playwright wants chromium_headless_shell-1255. */
  const PW = join('fake', 'ms-playwright');
  const fake = (files) => {
    const set = new Set(files.map((f) => join(PW, ...f.split('/'))));
    return {
      exists: (p) => set.has(p),
      list: (d) => [...new Set([...set].filter((p) => p.startsWith(d + sep)).map((p) => p.slice(d.length + 1).split(sep)[0]))],
      wanted: () => ({ dir: PW, revision: '1255', version: '1.65.1' }),
    };
  };
  const shell = (rev, done = true) => [`chromium_headless_shell-${rev}/chrome-headless-shell-win64/chrome-headless-shell.exe`,
    ...(done ? [`chromium_headless_shell-${rev}/INSTALLATION_COMPLETE`] : [])];
  const OLD = fake([...shell(999), ...shell(1234), ...shell(1300, false), 'chromium-1234/INSTALLATION_COMPLETE']);

  const a = launchOptions({ headless: true }, {}, existsSync, fake([...shell(1255), ...shell(1234)]));
  check('A unset, Playwright\'s own shell installed → Playwright default (no executablePath)', !('executablePath' in a) && a.headless === true, JSON.stringify(a));

  /* D: the PC of 2026-11-19. The newest COMPLETE build by number (1234, not 999 by string order, not the unfinished 1300), named once. */
  const said = [];
  const err = console.error;
  console.error = (...m) => said.push(m.join(' '));
  let d, d2;
  try { d = launchOptions({ headless: true }, {}, existsSync, OLD); d2 = launchOptions({ headless: true }, {}, existsSync, OLD); }
  finally { console.error = err; }
  const want = join(PW, 'chromium_headless_shell-1234', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
  check('D unset, wanted shell missing → the newest installed shell, one line naming it, once per process',
    d.executablePath === want && d2.executablePath === want && said.length === 1 && !said[0].includes('\n')
      && said[0].includes('chromium_headless_shell-1255') && said[0].includes('using chromium_headless_shell-1234'),
    JSON.stringify({ d, said }));

  const e = launchOptions({ headless: true }, { CI: 'true' }, existsSync, OLD);
  check('E CI set, wanted shell missing → Playwright default, as before (CI installs its own)', !('executablePath' in e), JSON.stringify(e));
  const f = launchOptions({ headless: false }, {}, existsSync, OLD);
  check('F a headed launch → never a headless shell', !('executablePath' in f), JSON.stringify(f));
  const g = launchOptions({ headless: true }, {}, existsSync, fake(['chromium-1234/INSTALLATION_COMPLETE', ...shell(1240, false)]));
  check('G wanted shell missing and no complete shell installed → Playwright default (its own error)', !('executablePath' in g), JSON.stringify(g));

  const b = launchOptions({}, { HR_CHROME: process.execPath });
  check('B valid path → that path is used', b.executablePath === process.execPath, JSON.stringify(b));

  const bogus = '/nonexistent/hr-chrome-selftest/chrome';
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)],
    { env: { ...process.env, HR_CHROME: bogus }, encoding: 'utf8' });
  const cerr = (r.stderr || '').trim();
  check('C invalid path → exit 1, one line naming the path',
    r.status === 1 && cerr.includes(bogus) && cerr.split('\n').length === 1 && !/\bat \S+:\d+/.test(cerr),
    `status=${r.status} stderr=${JSON.stringify(cerr)}`);

  console.log(fails.length ? `✗ _chrome selftest: ${fails.length} arm(s) failed` : '✓ _chrome selftest: 7/7 arms hold');
  process.exit(fails.length ? 1 : 0);
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  const o = launchOptions();
  console.log(`✓ chromium: ${o.executablePath || "Playwright's default"}`);
}
