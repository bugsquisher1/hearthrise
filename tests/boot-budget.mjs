// ════════════════════════════════════════════════════════════════════════
// tests/boot-budget.mjs — THE PLAYER DOES NOT DOWNLOAD THE TEST SUITE
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// Paione, 2026-09-11: "it takes long to start". Measured on this tree at b534:
// src/features/smoke-test.js is 3.75 MB of the 10.4 MB of JavaScript under
// src/**, and src/main.js imported it STATICALLY. So every player, on every
// cold boot, downloaded, parsed and evaluated the entire 1,232-test suite —
// before the account gate they are actually waiting for was usable. A test
// suite is developer weight; shipping it to the player is a bug, not a
// tradeoff.
//
// The suite is a DYNAMIC import now (src/features/smoke-test-loader.js). It is
// fetched when, and only when, somebody asks for it: the harness flag at boot,
// or the player's own Ctrl+Shift+T / 🧪 control.
//
// ── THE PROPERTIES ──────────────────────────────────────────────────────────
//   BOOT-1  A PLAYER boot (no harness flag) never requests smoke-test.js.
//           This is the fix, and it is the half a regression undoes: a single
//           `import './features/smoke-test.js'` anywhere in the static graph
//           puts 3.75 MB back on every player's first paint, silently.
//   BOOT-2  A HARNESS boot (__HR_TEST_HARNESS__) DOES request it, and
//           window.__smokeTest becomes the ESM suite. Without this half, the
//           cheapest way to pass BOOT-1 is to delete the suite from the app —
//           and every headless runner would then silently run legacy.js's
//           ~40-test block-29 __smokeTest and report green.
//   BOOT-3  Every page runner that awaits window.__smokeTest sets the harness
//           flag BEFORE load AND waits on __smokeTestSource === 'esm'. The
//           legacy monolith publishes its own window.__smokeTest, so a bare
//           `typeof window.__smokeTest === 'function'` resolves on the WRONG
//           suite. Source scan; no browser.
//   BOOT-4  Ctrl+Shift+T on a player page fetches the suite on demand. A
//           dynamic import is one keystroke away from a DEAD CONTROL — the
//           defect class this repo ships most often (the button looks fine and
//           silently does nothing).
//
// It also MEASURES and prints medians over three cold boots: the account gate
// painted, window.HearthriseCore, `esm-boot` (main.js's body, which runs only
// after EVERY static import in its graph is fetched and evaluated), and the
// bytes on the wire — on localhost and again on an ordinary 4G line.
//
// READ THE RIGHT ROW. Measured 2026-09-11, b534, same tree, static vs dynamic:
//   localhost   esm-boot 546 → 503 ms          (nothing: 11 MB over loopback)
//   4G 12 Mbps  esm-boot 12990 → 10344 ms      (-2.6 s, -20%)
//   bytes       JS 10304 → 6508 KiB            (-3796 KiB, -37%)
// `gate` and `core` did NOT move and were never going to: index.html paints the
// account wall and publishes HearthriseCore from scripts ABOVE main.js. Quoting
// those two as the win would be a lie that the next author would inherit.
//
// Every number here is REPORTED, never gated — a wall clock on a shared CI
// runner measures the runner. The byte counts are deterministic and are the
// input for the next slice (the remaining static imports, printed as a top-10
// so the ordering work can be queued on evidence).
//
//   node tests/boot-budget.mjs              # measure + gate
//   node tests/boot-budget.mjs --selftest   # mutation proof (must go RED)
//   node tests/boot-budget.mjs --runs 5
//
// Exit: 0 green · 1 a property failed · 2 harness (no Chromium, server, boot).
// ════════════════════════════════════════════════════════════════════════

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const argv = process.argv.slice(2);
const SELFTEST = argv.includes('--selftest');
const argOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const RUNS = Math.max(1, parseInt(argOf('--runs', '3'), 10) || 3);

const SUITE = 'features/smoke-test.js';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

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
      } catch { res.writeHead(404).end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* Stamped into the page before any script runs. performance.now() is measured
   from navigation start, so these two numbers are what a player waits through.
   rAF polling costs the same on both sides of the change, so the comparison is
   fair even though the absolute number carries the poll's granularity. */
const MARKERS = () => {
  window.__bb = { gate: null, core: null, esm: null };
  const tick = () => {
    try {
      if (window.__bb.gate == null) {
        const g = document.getElementById('hr-account-gate');
        if (g && g.getBoundingClientRect().height > 0) window.__bb.gate = performance.now();
      }
      if (window.__bb.core == null && window.HearthriseCore) window.__bb.core = performance.now();
      /* THE MARKER THE SUITE ACTUALLY MOVED. `gate` and `core` are painted and
         published by scripts that sit ABOVE main.js in index.html, so neither
         ever waited for the suite — quoting them as the win would be a lie.
         main.js's body runs only once EVERY static import in its graph has been
         fetched and evaluated, and __esmBoot is the first thing it writes. */
      if (window.__bb.esm == null && window.__esmBoot) window.__bb.esm = performance.now();
    } catch (e) {}
    if (window.__bb.gate != null && window.__bb.core != null && window.__bb.esm != null) return;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const kb = (n) => (n == null ? '   n/a' : (n / 1024).toFixed(0).padStart(6) + ' KiB');
const ms = (n) => (n == null ? '  n/a' : String(Math.round(n)).padStart(5) + ' ms');

/**
 * One cold boot. Fresh context => empty HTTP cache, and the server answers
 * no-store on top of that, so nothing is measured warm.
 *
 * @param {object} o
 * @param {boolean} o.harness      set __HR_TEST_HARNESS__ before load
 * @param {(page:any)=>Promise<void>} [o.mutate]  plant a defect in what the browser loads
 * @param {boolean} [o.press]      after the boot settles, press Ctrl+Shift+T as a player would
 */
async function boot(browser, url, { harness, mutate, press, throttle } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  /* THE NUMBER THE PLAYER ACTUALLY FEELS. On 127.0.0.1 the whole 11 MB arrives
     in a few milliseconds, so the wall clock is nearly identical with and
     without the suite — measuring localhost, not the game. A player is on a
     phone: 12 Mbps down, 40 ms RTT is an ordinary 4G line, and at that rate
     3.75 MB is about 2.6 s of pure transfer that nobody was getting anything
     for. Reported, never gated: a throttled wall clock on a shared CI runner
     is still a measurement of the runner. */
  if (throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 40,
      downloadThroughput: (12 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8,
    });
  }
  const requested = [];
  page.on('request', (r) => requested.push(r.url()));
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e).slice(0, 160)));
  if (mutate) await mutate(page);
  await page.addInitScript(MARKERS);
  if (harness) await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });

  const out = { requested, pageErrors, gate: null, core: null, esm: null, smokeSource: null, smokeType: 'undefined' };
  // The two numbers a player feels. Neither is gated; a missing one is reported.
  await page.waitForFunction(() => window.__bb && window.__bb.core != null && window.__bb.esm != null,
    { timeout: 60_000 }).catch(() => {});
  if (!harness) await page.waitForFunction(() => window.__bb && window.__bb.gate != null, { timeout: 30_000 }).catch(() => {});
  // The harness half has to be given the same 60 s the real runners give it.
  if (harness) {
    await page.waitForFunction(() => window.__smokeTestSource === 'esm' && typeof window.__smokeTest === 'function',
      { timeout: 60_000 }).catch(() => {});
  } else {
    // A player boot is allowed to settle: the loader, the icon pass and the
    // deferred boot queue all run after `load`. If the suite were going to be
    // pulled in late, this is where it would show up.
    await page.waitForTimeout(2500);
  }

  /* BOOT-4 — the control an admin actually uses. Moving the suite behind a
     dynamic import is one keystroke away from moving it behind a DEAD CONTROL,
     which is this codebase's most-shipped defect class: the button looks fine
     and silently does nothing.

     The setup call is explicit because the account wall DEFERS the engine boot:
     signed out, window.G and window.showTab never arrive, so main.js's
     tryBootFeatures() poll never calls any setup — the key was equally dead at
     the wall before this change. Arming it here is exactly the call main.js
     makes a moment after sign-in, and the specifier is derived from
     HearthriseBuild.cache so this is the SAME module instance main.js imported
     (a different ?v= would be a second module with its own state — b493). */
  if (press) {
    const armed = await page.evaluate(async () => {
      const v = window.HearthriseBuild && window.HearthriseBuild.cache;
      if (!v) return 'no build number on the page';
      const m = await import(`/src/features/smoke-test-loader.js?v=${v}`);
      if (typeof m.setupSmokeTestLoader !== 'function') return 'the loader exports no setup';
      m.setupSmokeTestLoader();
      return null;
    }).catch((e) => String(e && e.message || e));
    out.armError = armed;
    out.beforePress = requested.length;
    await page.keyboard.press('Control+Shift+T');
    await page.waitForFunction(() => window.__smokeTestSource === 'esm', { timeout: 60_000 }).catch(() => {});
  }

  const m = await page.evaluate(() => ({
    gate: window.__bb ? window.__bb.gate : null,
    core: window.__bb ? window.__bb.core : null,
    esm: window.__bb ? window.__bb.esm : null,
    smokeSource: window.__smokeTestSource || null,
    smokeType: typeof window.__smokeTest,
    res: performance.getEntriesByType('resource').map((r) => ({
      name: r.name, enc: r.encodedBodySize || 0, dec: r.decodedBodySize || 0, type: r.initiatorType,
    })),
  }));
  Object.assign(out, m);
  await context.close();
  return out;
}

const isSuite = (u) => u.includes(SUITE);
const jsBytes = (res) => res.filter((r) => /\.js(\?|$)/.test(r.name)).reduce((n, r) => n + r.dec, 0);
const allBytes = (res) => res.reduce((n, r) => n + r.dec, 0);

function report(label, runs) {
  const g = median(runs.map((r) => r.gate));
  const c = median(runs.map((r) => r.core));
  const e = median(runs.map((r) => r.esm));
  const j = median(runs.map((r) => jsBytes(r.res)));
  const a = median(runs.map((r) => allBytes(r.res)));
  const n = median(runs.map((r) => r.res.length));
  console.log(`  ${label.padEnd(16)} gate ${ms(g)} · core ${ms(c)} · esm-boot ${ms(e)} · JS ${kb(j)} · all ${kb(a)}`);
  return { gate: g, core: c, esm: e, js: j, all: a, requests: n };
}

/** Top N src/** modules by bytes actually delivered on this boot. */
function topModules(res, n = 10) {
  const seen = new Map();
  for (const r of res) {
    const mm = /\/(src\/[^?]*\.js)/.exec(r.name);
    if (!mm || !r.dec) continue;
    seen.set(mm[1], Math.max(seen.get(mm[1]) || 0, r.dec));
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/* ── BOOT-3 — the runners' half, scanned from source ─────────────────────────
   legacy.js block 29 publishes its own window.__smokeTest, so waiting on
   `typeof window.__smokeTest === 'function'` can resolve on the ~40-test v1
   block instead of the 1,232-test ESM suite, and report a green that means
   nothing. Every runner must pin the ESM suite by its source marker, and must
   set the harness flag before load or the suite is never imported at all. */
/* `[^)]*` does NOT work here and looked as though it did: every real wait is
   `waitForFunction(() => …`, so the class stops dead at the `)` of the arrow's
   empty parameter list and matches nothing. BOOT-3 was green over ZERO runners
   until --selftest's clean control asked how many it had actually read. */
const AWAITS_SUITE = /waitForFunction\([\s\S]{0,300}?__smokeTest/;

export function scanRunnerText(rel, text) {
  const problems = [];
  // Only the files that AWAIT the suite are runners; the rest merely mention it.
  if (!AWAITS_SUITE.test(text)) return problems;
  if (!/__HR_TEST_HARNESS__\s*=\s*true/.test(text)) {
    problems.push(`BOOT-3  ${rel} awaits window.__smokeTest but never sets __HR_TEST_HARNESS__ — `
      + 'the suite is a dynamic import now, so nothing would ever load it and the wait would time out.');
  }
  const waits = [...text.matchAll(/waitForFunction\(([\s\S]{0,220}?)\{\s*timeout/g)].map((m) => m[1]);
  for (const w of waits) {
    if (!w.includes('__smokeTest')) continue;
    if (!w.includes('__smokeTestSource')) {
      problems.push(`BOOT-3  ${rel} waits on a bare \`typeof window.__smokeTest === 'function'\` — that is `
        + "satisfied by legacy.js block 29's v1 suite. Pin the ESM suite: `window.__smokeTestSource === 'esm'`.");
    }
  }
  return problems;
}

/** [{ rel, text }] for every .mjs under tests/ and tools/ that awaits the suite. */
async function runnerSources() {
  const out = [];
  for (const root of ['tests', 'tools']) {
    for (const f of await readdir(join(ROOT, root))) {
      if (!f.endsWith('.mjs')) continue;
      const p = join(ROOT, root, f);
      const text = await readFile(p, 'utf8');
      if (!AWAITS_SUITE.test(text)) continue;
      out.push({ rel: relative(ROOT, p).replace(/\\/g, '/'), text });
    }
  }
  return out;
}

async function scanRunners() {
  const problems = [];
  const sources = await runnerSources();
  /* A source rule that reads nothing reports nothing, and reads as green. That
     is exactly how the first cut of AWAITS_SUITE shipped. State the population. */
  if (!sources.length) {
    problems.push('BOOT-3  no .mjs under tests/ or tools/ was recognised as a suite runner. '
      + 'tests/run-smoke.mjs is one, so the detector is broken, not the tree — BOOT-3 is reading nothing.');
  }
  for (const { rel, text } of sources) problems.push(...scanRunnerText(rel, text));
  return { problems, count: sources.length };
}

/* ── --selftest — the mutation proof ─────────────────────────────────────────
   Each defect is planted into what the BROWSER loads (page.route rewrites the
   real module on its way over the wire), not into a marker or a copy of the
   rule, and each must be caught by its own named property. A clean control runs
   first: a rule that is red at rest proves nothing below it. */
async function selftest(browser, url) {
  let bad = 0;
  const V = (await readFile(join(ROOT, 'src', 'build-info.js'), 'utf8').then((t) => /cache:\s*(\d+)/.exec(t)?.[1])) || '';

  const rewrite = (glob, fn) => async (page) => {
    await page.route(glob, async (route) => {
      const r = await route.fetch();
      route.fulfill({ status: 200, contentType: 'text/javascript', body: fn(await r.text()) });
    });
  };

  const cases = [
    { id: 'M0-clean-control', want: null,
      why: 'an unmutated player boot must be GREEN, or every "caught" below is an artefact',
      harness: false, mutate: null,
      check: (r) => (r.requested.some(isSuite) ? 'BOOT-1' : null) },

    { id: 'M1-static-import-returns', want: 'BOOT-1',
      why: 'THE REGRESSION THIS GUARD OWNS: one static import of the suite anywhere in main.js\'s '
        + 'graph puts 3.75 MB back on every player\'s cold boot, and nothing else would notice',
      harness: false,
      mutate: rewrite('**/src/main.js*', (t) => `import './${SUITE}?v=${V}';\n` + t),
      check: (r) => (r.requested.some(isSuite) ? 'BOOT-1' : null) },

    { id: 'M2-loader-neutered', want: 'BOOT-2',
      why: 'the cheapest way to pass BOOT-1 is to stop loading the suite at all — after which every '
        + 'headless runner silently falls through to legacy.js block 29 and reports a meaningless green',
      harness: true,
      mutate: rewrite('**/src/features/smoke-test-loader.js*', () => 'export function setupSmokeTestLoader(){}\nexport function loadSmokeTest(){return Promise.resolve(null);}\n'),
      check: (r) => ((!r.requested.some(isSuite) || r.smokeSource !== 'esm') ? 'BOOT-2' : null) },

    { id: 'M6-key-unwired', want: 'BOOT-4',
      why: 'a dynamic import is one keystroke away from a DEAD CONTROL — the 🧪 button and Ctrl+Shift+T '
        + 'are the only doors left, and a door that silently does nothing is this repo\'s most-shipped defect',
      harness: false, press: true,
      mutate: rewrite('**/src/features/smoke-test-loader.js*',
        (t) => t.replace("e.ctrlKey && e.shiftKey && e.key === 'T'", 'false')),
      check: (r) => ((!r.requested.some(isSuite) || r.smokeSource !== 'esm') ? 'BOOT-4' : null) },
  ];

  console.log('boot-budget --selftest: each mutation must be caught by its named property');
  for (const c of cases) {
    const r = await boot(browser, url, { harness: c.harness, mutate: c.mutate, press: c.press });
    const got = c.check(r);
    if (c.want === null) {
      if (got) { console.log(`  ✗ ${c.id} — the clean control is RED (${got})`); bad++; }
      else console.log(`  ✓ ${c.id} — clean control green`);
    } else if (got !== c.want) {
      console.log(`  ✗ ${c.id} — NOT CAUGHT (wanted ${c.want}, guard stayed green)`);
      bad++;
    } else {
      console.log(`  ✓ ${c.id} — caught by ${got}`);
    }
    console.log(`      ${c.why}`);
  }

  /* BOOT-3 is a SOURCE rule, so it is proven the same way: the REAL scanner is
     handed a REAL runner's text with one defect planted in it. A clean control
     first — every runner in the tree as it stands must scan clean. */
  const sources = await runnerSources();
  if (!sources.length) { console.log('  ✗ M3/M4 — no runner awaits the suite; BOOT-3 has nothing to read'); bad++; }
  else {
    const cleanProblems = sources.flatMap(({ rel, text }) => scanRunnerText(rel, text));
    if (cleanProblems.length) { console.log(`  ✗ M3-clean-control — ${sources.length} runners scan RED at rest`); bad++; }
    else console.log(`  ✓ M3-clean-control — all ${sources.length} runners scan clean`);
    console.log('      the text the mutations are planted into must itself be clean');

    // The gate that matters is the one the release waits on; plant there.
    const victim = sources.find((s) => s.rel === 'tests/run-smoke.mjs') || sources[0];
    const bare = victim.text.replace(/window\.__smokeTestSource\s*===\s*'esm'\s*&&\s*/g, '');
    if (bare === victim.text) { console.log('  ✗ M4-bare-wait — could not plant the defect'); bad++; }
    else if (!scanRunnerText(victim.rel, bare).some((p) => /bare/.test(p))) {
      console.log('  ✗ M4-bare-wait — NOT CAUGHT'); bad++;
    } else console.log(`  ✓ M4-bare-wait — caught by BOOT-3 in ${victim.rel}`);
    console.log("      a runner that waits on a bare __smokeTest resolves on legacy.js's v1 suite and reports a green that means nothing");

    const noFlag = victim.text.replace(/__HR_TEST_HARNESS__\s*=\s*true/g, '__HR_TEST_HARNESS__ = false');
    if (!scanRunnerText(victim.rel, noFlag).some((p) => /never sets/.test(p))) {
      console.log('  ✗ M5-no-harness-flag — NOT CAUGHT'); bad++;
    } else console.log(`  ✓ M5-no-harness-flag — caught by BOOT-3 in ${victim.rel}`);
    console.log('      without the flag nothing imports the suite, and the runner hangs for its full 60 s timeout');
  }

  console.log();
  if (bad) { console.error(`boot-budget --selftest FAILED — ${bad} unproven`); return 1; }
  console.log('boot-budget --selftest PASSED — 2 clean controls green, 5/5 mutations caught.');
  return 0;
}

(async () => {
  const { server, port } = await serve();
  const url = `http://127.0.0.1:${port}/index.html`;
  let browser;
  try { browser = await chromium.launch(); }
  catch (e) { console.error('boot-budget: no Chromium (npx playwright install chromium):', e.message); server.close(); process.exit(2); }

  let code = 0;
  try {
    if (SELFTEST) {
      code = await selftest(browser, url);
    } else {
      console.log(`boot-budget — ${RUNS} cold boots per column, empty cache, no-store\n`);
      const player = [];
      for (let i = 0; i < RUNS; i++) player.push(await boot(browser, url, { harness: false }));
      const harness = [await boot(browser, url, { harness: true })];

      const p = report('player', player);
      report('harness', harness);
      const slow = [];
      for (let i = 0; i < Math.min(RUNS, 2); i++) slow.push(await boot(browser, url, { harness: false, throttle: true }));
      report('player @ 4G', slow);
      console.log();

      const problems = [];
      const leaked = player.filter((r) => r.requested.some(isSuite)).length;
      if (leaked) {
        problems.push(`BOOT-1  the player boot requested ${SUITE} in ${leaked}/${RUNS} runs. The suite is `
          + '3.75 MB of developer weight; a player must never pay for it. Load it from '
          + 'src/features/smoke-test-loader.js on demand, not from a static import.');
      }
      const h = harness[0];
      if (!h.requested.some(isSuite)) {
        problems.push(`BOOT-2  a harness boot did NOT request ${SUITE} — the suite is unreachable, and every `
          + 'headless runner would fall through to legacy.js block 29.');
      }
      if (h.smokeSource !== 'esm' || h.smokeType !== 'function') {
        problems.push(`BOOT-2  after a harness boot window.__smokeTestSource is ${JSON.stringify(h.smokeSource)} `
          + `and typeof window.__smokeTest is "${h.smokeType}" — the ESM suite never published itself.`);
      }
      const pressed = await boot(browser, url, { harness: false, press: true });
      if (pressed.armError) {
        problems.push(`BOOT-4  could not arm the loader the way main.js does: ${pressed.armError}`);
      } else if (pressed.requested.slice(0, pressed.beforePress).some(isSuite)) {
        problems.push('BOOT-4  the control test is worthless: the suite was already fetched before the key '
          + 'was pressed, so BOOT-1 and BOOT-4 are measuring the same boot.');
      } else if (!pressed.requested.some(isSuite) || pressed.smokeSource !== 'esm') {
        problems.push('BOOT-4  Ctrl+Shift+T on a player page did NOT load the suite '
          + `(requested=${pressed.requested.some(isSuite)}, source=${JSON.stringify(pressed.smokeSource)}). `
          + 'The 🧪 control and the key are the only way in now — a dead control here is a feature that no '
          + 'longer exists.');
      }

      const runners = await scanRunners();
      problems.push(...runners.problems);

      console.log(`  top src/** modules on a PLAYER boot (bytes delivered):`);
      for (const [f, b] of topModules(player[0].res)) console.log(`    ${kb(b)}  ${f}`);
      console.log();
      console.log(`  player-boot JS: ${kb(p.js)} across ${player[0].res.filter((r) => /\.js(\?|$)/.test(r.name)).length} files`);
      /* A boot that throws still "loads". Reported, not gated: this guard owns
         the weight of the boot, and a thrown error belongs to whichever guard
         owns the code that threw — but it must not be invisible here either. */
      const threw = [...new Set(player.flatMap((r) => r.pageErrors))];
      if (threw.length) {
        console.log(`  ⚠ ${threw.length} uncaught error(s) during a player boot (not gated here):`);
        for (const e of threw.slice(0, 5)) console.log('      · ' + e);
      }
      console.log();

      if (problems.length) {
        for (const s of problems) console.error('  ✗ ' + s);
        code = 1;
      } else {
        console.log('  ✓ BOOT-1 player boot never fetches the suite · BOOT-2 harness boot does, and publishes it '
          + `· BOOT-3 all ${runners.count} page runners set the harness flag and pin the ESM suite `
          + '· BOOT-4 Ctrl+Shift+T fetches it on demand');
      }
    }
  } catch (e) {
    console.error('boot-budget: harness failure —', e && e.stack || e);
    code = 2;
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
  process.exit(code);
})();
