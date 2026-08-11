// ============================================================
// tests/run-smoke.mjs — headless runner for the in-game smoke suite (b215)
//
// The 168-test suite in src/features/smoke-test.js is genuinely good, but it
// only ever ran when a human pressed Ctrl+Shift+T in a browser — so it could
// not gate a push, and by the team's own workflow note it typically ran AFTER
// a bug was already live. This script loads the real index.html in headless
// Chromium, calls window.__smokeTest(), and exits non-zero on any failure,
// which turns those existing tests into an actual merge gate. No test rewrites.
//
//   node tests/run-smoke.mjs [--url http://localhost:8123] [--headed]
//
// Exit codes: 0 = all green · 1 = failing tests, runtime errors, or console
// errors · 2 = harness/setup problem (couldn't load the page or find the suite).
// ============================================================

import { chromium } from 'playwright';
import { runAll as coreGuards } from './core-purity.mjs';
import { runAll as accrualGuards } from './accrual-engine.mjs';
import { runAll as jwtGuards } from './jwt-verify.mjs';
import { pack as packEdge } from '../tools/pack-edge.mjs';
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const argv = process.argv.slice(2);
const argOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const HEADED = argv.includes('--headed');
const EXTERNAL_URL = argOf('--url');
const SUITE_TIMEOUT_MS = 120_000;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

// Minimal static server — the game is a static folder with no build step, so
// serving ROOT is the whole "build".
function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let filePath = normalize(join(ROOT, urlPath === '/' ? '/index.html' : urlPath));
        if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
        const info = await stat(filePath).catch(() => null);
        if (info?.isDirectory()) filePath = join(filePath, 'index.html');
        const body = await readFile(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        }).end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ── The wall guard (b224) ────────────────────────────────────────────────────
// The suite below runs through the account-wall bypass, so it can never see the
// state a real first-time player sees. This pass does: a clean context, storage
// wiped, NO harness flag. It asserts the wall is up, that the engine genuinely
// did not boot behind it (window.G is published by legacy.js boot(), which the
// gate defers), that nothing was written to the player's save, and that the
// console is clean — which is the only automated check that catches a module
// throwing behind the wall, because no in-page test can reach that state.
async function wallGuard(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const problems = [];
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await page.reload({ waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(6_000);

    const seen = await page.evaluate(() => ({
      gate: !!window.HearthriseGate,
      open: window.HearthriseGate ? window.HearthriseGate.isOpen() : null,
      reason: window.HearthriseGate ? window.HearthriseGate.openReason() : null,
      wall: !!document.getElementById('hr-account-gate'),
      engineBooted: typeof window.G !== 'undefined',
      appVisible: document.querySelector('.app')
        ? getComputedStyle(document.querySelector('.app')).visibility : 'missing',
      wroteSave: localStorage.getItem('hearthbound-save-v2') !== null,
      wroteProfile: localStorage.getItem('hearthrise:profile') !== null,
      modals: document.querySelectorAll(
        '.ftue-root, #beta-banner-overlay, #hr-welcome-modal, .hr-id-scrim, .hr-dl-scrim, #hr-post-signup-modal'
      ).length,
      hasEmail: !!document.querySelector('#hr-account-gate input[type="email"]'),
      hasPassword: !!document.querySelector('#hr-account-gate input[type="password"]'),
    }));

    if (!seen.gate) problems.push('HearthriseGate is not installed');
    if (seen.open !== false) problems.push(`the gate opened without a session (reason=${seen.reason})`);
    if (!seen.wall) problems.push('no wall rendered for a clean boot');
    if (!seen.hasEmail || !seen.hasPassword) problems.push('the wall has no sign-in fields');
    if (seen.engineBooted) problems.push('window.G exists — the engine booted behind the wall');
    if (seen.appVisible !== 'hidden') problems.push(`the game shell is ${seen.appVisible} behind the wall`);
    if (seen.wroteSave) problems.push('a save was written behind the wall (this is how a beta save dies)');
    if (seen.wroteProfile) problems.push('a character profile was created behind the wall');
    if (seen.modals) problems.push(`${seen.modals} modal(s) stacked on the wall`);

    const real = errors.filter((t) => !/Failed to load resource|net::ERR|supabase|skypack|raw\.githubusercontent/i.test(t));
    if (real.length) problems.push('console errors behind the wall: ' + real.slice(0, 5).join(' | '));
  } catch (err) {
    problems.push('harness failure: ' + err.message);
  } finally {
    await ctx.close().catch(() => {});
  }
  return problems;
}

// ── The deployed-payload guard (review S10) ─────────────────────────────────
// `tools/pack-edge.mjs --check` calls pack(), re-reads the same paths and
// re-applies the same pure transform. Both sides of its comparison come from
// the same bytes through the same function, so it can tell you the function is
// PACKABLE and nothing at all about what is running in production. That gap is
// the one that matters: the deploy payload carries a snapshot of src/core and
// src/data, so an edit to the simulation that was never redeployed means the
// server and the client disagree about what a night was worth — silently, and
// in the player's data.
//
// So: pack() stamps the payload's sha256 into payload-hash.js, the deployed
// function returns it from a GET, and this compares the two.
//
// Configure with HR_ACCRUE_URL (the function's URL) and, because the function is
// deployed with verify_jwt = true, HR_ACCRUE_KEY (the project's anon/publishable
// key — the gateway accepts it as a token, and the GET returns nothing secret).
// With neither set the check reports SKIPPED and says what it needs. It never
// passes quietly.
async function deployedPayloadGuard() {
  const problems = [];
  const { hash } = await packEdge('hr-accrue');
  const url = process.env.HR_ACCRUE_URL;
  if (!url) {
    return { problems, note: `repo payload ${hash.slice(0, 16)}… · deployed check SKIPPED (set HR_ACCRUE_URL, and HR_ACCRUE_KEY for the gateway)` };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const key = process.env.HR_ACCRUE_KEY || '';
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: key ? { Authorization: `Bearer ${key}`, apikey: key } : {},
    });
    clearTimeout(t);
    if (!res.ok) {
      problems.push(`GET ${url} returned ${res.status} — cannot read the deployed payload hash`);
      return { problems, note: '' };
    }
    const body = await res.json();
    if (body?.payload_sha256 !== hash) {
      problems.push(
        `the deployed hr-accrue reports payload ${String(body?.payload_sha256).slice(0, 16)}… but this repo packs to `
        + `${hash.slice(0, 16)}… — src/core, src/data or the function changed and was never redeployed. `
        + 'Redeploy with `node tools/pack-edge.mjs hr-accrue --out <dir>`.');
      return { problems, note: '' };
    }
    return { problems, note: `deployed hr-accrue matches this repo (${hash.slice(0, 16)}…)` };
  } catch (e) {
    problems.push(`could not reach ${url}: ${e?.message || e}`);
    return { problems, note: '' };
  }
}

// ── The migration guard (b228) ───────────────────────────────────────────────
// A `</content>` tag leaked into a migration file yesterday: a tool artifact,
// invisible in review, and fatal the moment anyone runs the SQL. Nothing in the
// suite could catch it, because the browser never loads these files.
//
// So this is a repo-content check, run at the same layer as the wall guard.
// Two claims, both cheap:
//   1. No file contains a tool/markup artifact (an XML-ish tag on its own).
//   2. Every file ENDS on a real SQL terminator — `end $$;` or a bare `;` —
//      which is what a truncated or artifact-suffixed file fails.
async function migrationGuard() {
  const dir = join(ROOT, 'supabase', 'migrations');
  const problems = [];
  let names = [];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort();
  } catch {
    return ['could not read supabase/migrations'];
  }
  if (!names.length) problems.push('no migrations found — the guard is checking nothing');
  for (const name of names) {
    const text = await readFile(join(dir, name), 'utf8');
    const artifact = text.match(/<\/?(content|antml|invoke|parameter|function_results)\b[^>]*>/i);
    if (artifact) problems.push(`${name}: tool artifact in the file — ${artifact[0]}`);
    const lines = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
    const last = lines[lines.length - 1] || '';
    if (!/;$/.test(last)) problems.push(`${name}: last line is not a SQL terminator — "${last.slice(0, 60)}"`);
  }
  return problems;
}

// ── The secret guard (b322) ──────────────────────────────────────────────────
// A LIVE Discord webhook URL sat in src/bug-report.js as a plain constant for
// ~200 builds. hearthrise.net is GitHub Pages serving a PUBLIC repo, so that
// token was readable by anyone — in the shipped bundle and in git history
// forever. A webhook token permits POST (fake reports), PATCH (rename) and
// DELETE (destroy it), and the failure mode of a bug reporter is SILENCE: had
// anyone deleted it, reports would simply have stopped arriving.
//
// Deleting the constant does not stop this recurring; a guard does. This is the
// real deliverable of that fix. Two rules, both cheap:
//
//   A. ZERO TOLERANCE in shipped client source (src/**, index.html, sw.js and
//      any root-level .js). Not even a commented-out or blank one — a blank
//      placeholder is an invitation to paste a real value back in.
//   B. REPO-WIDE, credential-shaped only: a webhook URL with a real snowflake
//      id and a long token, a GitHub PAT, or a JWT whose payload claims
//      service_role. Shaped so documentation placeholders ("…/1234.../abcd…")
//      do not trip it, because a guard that cries wolf gets deleted.
//
// The needles are assembled from fragments so this file cannot match itself.
async function secretGuard() {
  const D = ['discord', 'com'].join('.') + '/api/' + 'webhooks';
  const SHAPED = new RegExp(
    '(?:discord|discordapp)\\.com/api/webhooks/[0-9]{15,}/[A-Za-z0-9_-]{40,}', 'i');
  const PAT = /\b(?:ghp|gho|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/;
  const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{16,})\.[A-Za-z0-9_-]{8,}\b/g;

  const SKIP_DIRS = new Set(['.git', 'node_modules', 'worktrees', '.venv', 'dist', 'build']);
  const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.html', '.htm',
    '.css', '.md', '.sql', '.toml', '.yml', '.yaml', '.sh', '.txt', '.webmanifest', '.svg']);
  const SELF = normalize(join(ROOT, 'tests', 'run-smoke.mjs'));

  const problems = [];
  const files = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(full); continue; }
      if (!TEXT_EXT.has(extname(e.name).toLowerCase())) continue;
      const info = await stat(full).catch(() => null);
      if (!info || info.size > 4_000_000) continue;   // skip generated monsters
      files.push(full);
    }
  }
  await walk(ROOT);
  if (files.length < 50) problems.push(`only ${files.length} files scanned — the guard is checking nothing`);

  // Client source is everything the browser downloads.
  const isClientSource = (f) => {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
    return rel.startsWith('src/') || rel === 'index.html' || rel === 'sw.js'
      || (!rel.includes('/') && rel.endsWith('.js'));
  };

  for (const f of files) {
    if (normalize(f) === SELF) continue;             // the guard states the pattern
    let text;
    try { text = await readFile(f, 'utf8'); } catch { continue; }
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');

    if (isClientSource(f) && text.includes(D)) {
      problems.push(`${rel}: a Discord webhook URL is in SHIPPED CLIENT SOURCE — secrets belong in an Edge Function secret, never in the bundle`);
    }
    const shaped = text.match(SHAPED);
    if (shaped) {
      problems.push(`${rel}: a credential-shaped Discord webhook URL is committed (…${shaped[0].slice(-8)}) — regenerate it in Discord and move it to a server-side secret`);
    }
    const pat = text.match(PAT);
    if (pat) problems.push(`${rel}: a GitHub personal access token is committed (${pat[0].slice(0, 8)}…)`);

    JWT.lastIndex = 0;
    let m;
    while ((m = JWT.exec(text)) !== null) {
      let payload = '';
      try { payload = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
      catch { continue; }
      if (/"role"\s*:\s*"service_role"/.test(payload)) {
        problems.push(`${rel}: a SERVICE ROLE key is committed — that key bypasses RLS entirely; rotate it now`);
        break;
      }
    }
  }
  return problems;
}
// ── The cold-load guard (b323) ───────────────────────────────────────────────
// THE FAILURE IT EXISTS FOR, verbatim from production:
//
//   TypeError: Cannot read properties of undefined (reading 'xp')
//     at getCombatLevel (legacy.js:1508)  <- renderMonsterList  x3
//   TypeError: Cannot read properties of undefined (reading 'combat')
//     at getArmorSetBonus (legacy.js:1484) <- applyAll          x2
//   TypeError: Cannot read properties of undefined (reading 'xp')
//     at getLevel (legacy.js:1506)         <- checkAchievements x1
//
// Six pageerrors on a cold load. legacy.js is a CLASSIC script that registers
// 21 top-level timers at parse time; src/core-bridge.js is a MODULE and is
// therefore deferred, so on a slow first load those timers fire into an engine
// whose maths has not arrived. src/core-ready.js parks them until it has.
//
// NO WARM-PAGE TEST CAN SEE THIS — every other pass in this file, and the whole
// in-page suite, loads a page where the module graph is already there. So this
// guard MANUFACTURES the cold load: it holds the /src/core/ and core-bridge.js
// responses back by COLD_DELAY_MS via route interception (which works against a
// local server AND against --url production) and requires ZERO pageerrors.
//
// It also asserts the gate's own contract, because a gate that "passes" by
// never releasing would freeze the game: the core must be online, the shim must
// have uninstalled itself, and the Phase-0 constant identity must survive.
async function coldLoadGuard(browser, url) {
  const COLD_DELAY_MS = 2_000;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 160)));
  await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
  try {
    // Delay ONLY the simulation core's module graph. Everything else loads at
    // full speed, which is precisely the shape of the real bug: classic scripts
    // already running, module not there yet.
    await page.route(/\/src\/(core-bridge\.js|core\/)/, async (route) => {
      await new Promise((r) => setTimeout(r, COLD_DELAY_MS));
      await route.continue();
    });
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => !!window.HearthriseCore, { timeout: 60_000 })
      .catch(() => problems.push('the core never came online even after the delayed modules arrived'));
    await page.waitForTimeout(3_000);   // let every parked boot timer drain

    if (pageErrors.length) {
      const seen = [...new Set(pageErrors)];
      problems.push(`${pageErrors.length} uncaught error(s) on a cold load — ` +
        'a boot timer ran before window.HearthriseCore existed: ' + seen.slice(0, 4).join(' | '));
    }
    const gate = await page.evaluate(() => ({
      gateLoaded: typeof window.whenCoreReady === 'function',
      released: typeof window.isCoreReady === 'function' ? window.isCoreReady() : null,
      core: !!window.HearthriseCore,
      uninstalled: /\[native code\]/.test(String(window.setTimeout)) &&
                   /\[native code\]/.test(String(window.setInterval)),
      // Phase 0's load-bearing property: the constants are ONE object, not a copy.
      paceIdentity: !!window.HearthriseCore && window.PACE === window.HearthriseCore.pacing.PACE,
      // The engine must actually be alive, not merely quiet.
      booted: typeof window.G !== 'undefined' && typeof window.getCombatLevel === 'function',
      combatLevel: (() => { try { return window.getCombatLevel(); } catch (e) { return 'threw: ' + e.message; } })(),
    }));
    if (!gate.gateLoaded) problems.push('src/core-ready.js is not loaded — nothing protects the boot window');
    if (gate.released !== true) problems.push('the readiness gate never released; boot timers are still parked');
    if (!gate.uninstalled) problems.push('the readiness shim did not uninstall — every timer in the game is wrapped forever');
    if (!gate.paceIdentity) problems.push('window.PACE is no longer the core PACE object (Phase 0 identity broken)');
    if (!gate.booted) problems.push('the engine did not boot after the delayed core arrived');
    if (typeof gate.combatLevel !== 'number') problems.push('getCombatLevel() is not answering after a cold load: ' + gate.combatLevel);
  } catch (err) {
    problems.push('harness failure: ' + err.message);
  } finally {
    await ctx.close().catch(() => {});
  }
  return problems;
}

// ── The landscape guard (b260) ───────────────────────────────────────────────
// Landscape is now the ONLY mobile orientation (portrait is gated, b259). The
// in-page suite runs at desktop width, so it never sees the cramped landscape
// phone layout where every mobile bug this program chased actually lived
// (topbar overlap, rail, toasts, cards spilling). This pass boots the game at a
// landscape-PHONE viewport with a representative FILLED save and asserts no
// screen scrolls sideways — the "everything overflows / must scroll sideways"
// report that kicked off the whole mobile effort. Horizontal overflow only: a
// vertical scroll is legitimate, a horizontal one is a broken layout.
async function landscapeGuard(browser, url) {
  const TABS = ['home','profile','character','combat','skills','farming','house',
    'social','clan','shop','market','bounty','stable','events','dungeons','inventory'];
  const ctx = await browser.newContext({
    viewport: { width: 820, height: 360 },
    hasTouch: true, isMobile: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
  const problems = [];
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => typeof window.G !== 'undefined', { timeout: 60_000 });
    await page.waitForTimeout(4_000);

    // Seed a representative filled save so panels render real content, not empty
    // states (empty screens never overflow — a full inventory grid does).
    await page.evaluate(() => {
      const G = window.G; if (!G) return;
      try {
        const itemIds = Object.keys(window.ITEMS || {});
        itemIds.slice(0, 80).forEach((id, i) => { G.inventory[id] = (i % 9) + 1; });
        Object.keys(window.SKILLS_DEF || {}).forEach((s) => { G.skills[s] = 200000; });
        G.gold = 12345678; G.gems = 137;
        G.activeMonster = 'goblin'; G.monsterHp = 15; G.monsterMaxHp = 15;
        G.playerHp = 90; G.playerMaxHp = 99;
        if (typeof window.refreshAll === 'function') window.refreshAll();
      } catch (e) {}
    });
    await page.waitForTimeout(500);

    // The portrait gate must NOT be showing in landscape.
    const gateShown = await page.evaluate(() => {
      const g = document.getElementById('hr-rotate-gate');
      return g ? getComputedStyle(g).display !== 'none' : false;
    });
    if (gateShown) problems.push('the portrait gate is visible in LANDSCAPE (should be hidden)');

    for (const tab of TABS) {
      const res = await page.evaluate(async (t) => {
        try { if (typeof window.showTab === 'function') window.showTab(t); } catch (e) {}
        await new Promise((r) => setTimeout(r, 180));
        const vw = document.documentElement.clientWidth;
        // getBoundingClientRect reports an element's TRUE position even when an
        // overflow:hidden ancestor visually clips it — so this catches content
        // that spills off the right edge whether the page scrolls sideways OR
        // the app clips it (and the player just loses the cut-off part).
        let worst = 0, offender = '';
        document.querySelectorAll('.panel.active, .panel.active *').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
          if (cs.position === 'fixed') return;               // fixed chrome (rail) sits by design
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          const past = r.right - vw;
          if (past > worst) {
            worst = past;
            offender = el.tagName + (el.id ? '#' + el.id : '') +
              (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
          }
        });
        return { over: Math.round(worst), offender };
      }, tab);
      if (res.over > 8) {
        problems.push(`${tab}: content spills ${res.over}px past the right edge — widest: ${res.offender}`);
      }
    }
  } catch (err) {
    problems.push('harness failure: ' + err.message);
  } finally {
    await ctx.close().catch(() => {});
  }
  return problems;
}

// PREFLIGHT — the server catalogue must match src/data/*.js.
//
// Postgres cannot import ESM, so a handful of facts it MUST enforce (which item
// ids exist, which are bind-on-pickup, which equip slot an item fits) are
// GENERATED into SQL by tools/gen-catalogues.mjs. A generated file that has
// fallen behind its source is a silently wrong allowlist — bop items become
// listable, deleted item ids stay valid — so drift fails the build here, in the
// suite everyone already runs, rather than in a migration nobody re-applies.
// Skipped only when the generator is absent (older checkouts), never on drift.
async function catalogueDriftPreflight() {
  const gen = join(ROOT, 'tools', 'gen-catalogues.mjs');
  try { await stat(gen); } catch { return 0; }
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [gen, '--check'], { encoding: 'utf8' });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status === 0) { console.log(`Catalogue preflight: ${out || 'in sync'}`); return 0; }
  console.error(`\nCatalogue preflight FAILED — src/data/*.js no longer matches the generated SQL.\n${out}\n`);
  return 1;
}

const run = async () => {
  if (await catalogueDriftPreflight()) process.exit(1);
  let server = null, url = EXTERNAL_URL;
  if (!url) { const s = await serve(); server = s.server; url = `http://127.0.0.1:${s.port}/`; }

  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Console errors and page crashes are signal too — a suite can pass while the
  // app is throwing in the background.
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  // ── TEST-ONLY: the account-wall bypass (b224) ────────────────────────────
  // Hearthrise requires an account (DECISIONS 2026-08-08). src/net/account-gate.js
  // walls off a clean boot, which would break all 274 tests below — so the
  // harness declares itself with an explicit global, injected BEFORE any page
  // script runs. Deliberately a JS global and not a URL parameter: it cannot be
  // typed into an address bar, bookmarked, or sent to a friend. And the gate
  // IGNORES it on the hosts real players use (account-gate.js PLAYER_HOSTS), so
  // pointing --url at production correctly hits the wall instead of bypassing
  // it. Never set this anywhere but here.
  await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });

  let exitCode = 0;
  try {
    /* ── The core guard (Phase 0, server authority) ─────────────────────
       Runs FIRST and outside the browser entirely, because that is the
       whole claim: src/core/* is the shared simulation, and it must import
       and produce correct numbers in plain Node (and therefore in Deno,
       where the Edge Functions run). Nothing in the page can prove that —
       an in-browser test always has `window`. It also pins the seeded-PRNG
       contract and a set of balance anchors. See tests/core-purity.mjs. */
    const coreProblems = await coreGuards();
    if (coreProblems.length) {
      console.log('\nCore guard (src/core is pure, deterministic, DOM-free) — FAILED:');
      for (const p of coreProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nCore guard — src/core imports in plain Node, is DOM-free, and replays from a seed.');
    }

    /* ── The accrual guard (Phase C, server authority) ──────────────────
       Also outside the browser, and for a stronger reason than the core
       guard: the thing under test is the SERVER's copy of the simulation,
       and the property that matters is that it is not a copy at all — a
       span computed by supabase/functions/hr-accrue must equal the span
       the client computes for the same state and the same seed. A browser
       test cannot see the Edge Function, and a deployed Edge Function
       cannot be diffed against the client without one of these. It also
       pins the hostile-input contract (no client-supplied tickMs,
       minTickMs, atMs, capMs or elapsed can inflate a grant) and the
       packer's drift guard. See tests/accrual-engine.mjs. */
    const accrualProblems = await accrualGuards();
    if (accrualProblems.length) {
      console.log('\nAccrual guard (server accrual == client simulation) — FAILED:');
      for (const p of accrualProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nAccrual guard — server accrual matches the client for the same seed; hostile inputs inert.');
    }

    /* ── The identity guard (D2) ────────────────────────────────────────
       The accrual engine's ENTIRE authorisation model is "the sub in this
       token is the player". It used to be a DECODE — the shell read the
       claim and believed it — resting on `verify_jwt` being on at a
       gateway, a setting that lived in no file and no test. This executes
       the verifier against a real ES256 key pair and against the LIVE
       published JWKS of the project, and asserts every forgery is refused.
       See tests/jwt-verify.mjs. */
    const { problems: jwtProblems, note: jwtNote } = await jwtGuards();
    if (jwtProblems.length) {
      console.log('\nIdentity guard (the accrual JWT is VERIFIED, not decoded) — FAILED:');
      for (const p of jwtProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log(`\nIdentity guard — every forged token refused; ${jwtNote}`);
    }

    /* ── Deployed-vs-repo (S10) ─────────────────────────────────────────
       `pack-edge --check` re-derives the payload from the same repo it
       just read, so it structurally cannot answer "do the bytes running in
       production match this branch?". The function reports the sha256 it
       was packed with on a GET; this compares that with the digest
       recomputed here. SKIPPED, LOUDLY, when no URL is configured — a
       check that prints nothing when it does not run is the failure this
       program has hit six times. */
    const deployProblems = await deployedPayloadGuard();
    if (deployProblems.problems.length) {
      console.log('\nEdge payload guard (deployed bytes == repo bytes) — FAILED:');
      for (const p of deployProblems.problems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log(`Edge payload guard — ${deployProblems.note}`);
    }

    // Wall guard FIRST, in its own clean context, before the harness page below
    // ever declares itself.
    const wallProblems = await wallGuard(browser, url);
    if (wallProblems.length) {
      console.log('\nAccount-wall guard — FAILED:');
      for (const p of wallProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nAccount-wall guard — a clean boot is walled, nothing behind it.');
    }

    const migProblems = await migrationGuard();
    if (migProblems.length) {
      console.log('\nMigration guard — FAILED:');
      for (const p of migProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Migration guard — every migration ends on a SQL terminator, no tool artifacts.');
    }

    const secretProblems = await secretGuard();
    if (secretProblems.length) {
      console.log('\nSecret guard — FAILED:');
      for (const p of secretProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Secret guard — no webhook URL, PAT or service-role key anywhere in the repo.');
    }

    const coldProblems = await coldLoadGuard(browser, url);
    if (coldProblems.length) {
      console.log('\nCold-load guard (core modules delayed 2s) — FAILED:');
      for (const p of coldProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Cold-load guard — a slow core module graph produces zero uncaught errors.');
    }

    const landProblems = await landscapeGuard(browser, url);
    if (landProblems.length) {
      console.log('\nLandscape guard (820×360 phone) — FAILED:');
      for (const p of landProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Landscape guard — every screen fits a landscape phone, no sideways scroll.');
    }

    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });

    // The suite is registered by main.js's deferred feature boot.
    await page.waitForFunction(() => typeof window.__smokeTest === 'function', { timeout: 60_000 });
    // Let the engine settle (legacy boot + icon sweeps + deferred setups).
    await page.waitForTimeout(6_000);

    const result = await page.evaluate(async (timeout) => {
      const suite = await Promise.race([
        Promise.resolve(window.__smokeTest({ silent: true })),
        new Promise((_, rej) => setTimeout(() => rej(new Error('suite timed out')), timeout)),
      ]);
      return {
        passed: suite.passed, failed: suite.failed,
        runtimeErrors: suite.runtimeErrors, total: suite.total,
        failures: (suite.results || [])
          .filter((r) => r.status !== 'PASS')
          .map((r) => ({ name: r.name, why: r.why })),
      };
    }, SUITE_TIMEOUT_MS);

    const build = await page.evaluate(() => window.HearthriseBuild?.buildString?.() ?? 'unknown');

    console.log(`\nHearthrise smoke suite — ${build}`);
    console.log(`  passed ${result.passed}/${result.total}   failed ${result.failed}   runtime errors ${result.runtimeErrors}`);

    if (result.failures.length) {
      console.log('\nFailures:');
      for (const f of result.failures) console.log(`  ✗ ${f.name}\n      ${f.why || '(no detail)'}`);
      exitCode = 1;
    }
    if (result.runtimeErrors > 0) {
      console.log(`\n${result.runtimeErrors} runtime error(s) captured during the suite.`);
      exitCode = 1;
    }
    // Ignore benign network noise from the offline/beta posture (Supabase and
    // the CDN-hosted icon fetches are expected to fail with no credentials).
    const realErrors = consoleErrors.filter(
      (t) => !/Failed to load resource|net::ERR|supabase|raw\.githubusercontent/i.test(t)
    );
    if (realErrors.length) {
      console.log('\nConsole errors:');
      for (const t of realErrors.slice(0, 15)) console.log(`  ! ${t}`);
      exitCode = 1;
    }
    if (exitCode === 0) console.log('\nAll green.\n');
  } catch (err) {
    console.error('\nHarness failure:', err.message);
    exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    server?.close();
  }
  process.exit(exitCode);
};

run();
