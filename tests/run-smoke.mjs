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
import { autoEatAuthorityGuard } from './auto-eat-authority.mjs';
import { perkChannelGuard } from './perk-channel.mjs';
import { artisanProgressGuard } from './artisan-progress-model.mjs';
import { runAll as activitySeamGuards } from './activity-seam.mjs';
import { runAll as deltaTransportGuards } from './delta-transport.mjs';
import { runAll as jwtGuards } from './jwt-verify.mjs';
import { runAll as corsGuards } from './cors-preflight.mjs';
import { pack as packEdge, runAll as packCheck } from '../tools/pack-edge.mjs';
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
// ── The pre-auth RPC surface (b349) ─────────────────────────────────────────
// Which RPCs may a client legitimately call with no session? Answered from
// tests/rpc-resolution.baseline.json — the CI-verified record of what
// production actually answers an anonymous caller — and NOT from the client's
// own src/net/server-rpc.js list, so the two cannot vouch for each other. An
// entry whose baseline code is 42501 is authenticated-only: the client sending
// it anonymously is a guaranteed refusal and pure dashboard noise.
async function anonSafeRpcNames() {
  const raw = JSON.parse(await readFile(join(ROOT, 'tests', 'rpc-resolution.baseline.json'), 'utf8'));
  const safe = new Set();
  for (const [sig, v] of Object.entries(raw)) {
    if (v && v.status === 200) safe.add(sig.split('(')[0]);
  }
  return safe;
}

// The client's own idea of the anonymous surface (src/net/server-rpc.js
// ANON_CALLABLE) must equal what production actually permits. These two are
// read from different files maintained by different people for different
// reasons, which is the only arrangement in which either can check the other:
//   • an RPC in ANON_CALLABLE but NOT anon-granted → the client will keep
//     sending refused calls, which is the b349 bug wearing a new hat;
//   • an RPC anon-granted but NOT in ANON_CALLABLE → the client refuses a call
//     it is entitled to make, and a public surface silently stops working.
async function anonSurfaceGuard() {
  const problems = [];
  const src = await readFile(join(ROOT, 'src', 'net', 'server-rpc.js'), 'utf8');
  const m = /var\s+ANON_CALLABLE\s*=\s*\{([^}]*)\}/.exec(src);
  if (!m) {
    problems.push('ANON_CALLABLE is gone from src/net/server-rpc.js — the client no longer has one '
      + 'answer to "may this RPC go out without a session", so every transport helper is free to '
      + 'invent its own again');
    return { problems, note: '' };
  }
  const claimed = new Set([...m[1].matchAll(/([A-Za-z_][\w]*)\s*:\s*true/g)].map((x) => x[1]));
  const actual = await anonSafeRpcNames();
  for (const n of claimed) {
    if (!actual.has(n)) {
      problems.push(`server-rpc.js says ${n} may be called anonymously, but rpc-resolution.baseline.json `
        + `says production refuses an anonymous caller. Either the grant never landed or the client list is `
        + `stale — every such call is a logged 42501.`);
    }
  }
  for (const n of actual) {
    if (!claimed.has(n)) {
      problems.push(`production answers ${n} to an anonymous caller but server-rpc.js will refuse to send `
        + `it without a session — a public surface that stops working for signed-out and expired-token `
        + `players. Add it to ANON_CALLABLE, or close the grant.`);
    }
  }
  return { problems, note: `${claimed.size} anon-callable RPC(s) — ${[...claimed].join(', ')} — match the live grant baseline` };
}

async function wallGuard(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  /* b349 — WHAT LEFT THE CLIENT, not what the client believes it would send.
     A session-less boot sent hr_server_now() with the anon key in the
     Authorization header on EVERY page load: 3,249 refused calls in 24h, 19%
     of all database traffic answering 42501, which made the error dashboard
     useless as an incident signal. Observed, never routed — the point is to
     grade the real behaviour of a real boot, and after the fix there is
     nothing left to send. */
  const rpcCalls = [];
  page.on('request', (r) => {
    const m = /\/rest\/v1\/rpc\/([^?]+)/.exec(r.url());
    if (!m) return;
    let anon = true;
    try {
      const tok = String(r.headers()['authorization'] || '').replace(/^Bearer\s+/i, '');
      anon = JSON.parse(Buffer.from(tok.split('.')[1] || '', 'base64').toString('utf8')).role !== 'authenticated';
    } catch { anon = true; }
    rpcCalls.push({ name: m[1], anon });
  });

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

    // ── b349: no authenticated-only RPC may leave a session-less client ──
    const anonSafe = await anonSafeRpcNames();
    const leaked = rpcCalls.filter((c) => c.anon && !anonSafe.has(c.name));
    if (leaked.length) {
      const tally = {};
      for (const c of leaked) tally[c.name] = (tally[c.name] || 0) + 1;
      problems.push(
        'THE b349 BUG: ' + leaked.length + ' authenticated-only RPC call(s) left a client with no session — '
        + Object.entries(tally).map(([n, k]) => n + ' ×' + k).join(', ')
        + '. Postgres answers every one of these 42501 and the client cannot tell that apart from a call it '
        + 'forgot to read. Hold the call behind HearthriseGate.whenSignedIn() and let HearthriseRpc.mayCall() '
        + 'refuse it at the transport; if the RPC genuinely should be public, that is a GRANT change plus a '
        + 'tests/rpc-resolution.targets.json entry, not a silent call.');
    }
    /* THE CONTROL. "Zero leaked calls" also passes against a listener that
       never fired, a renamed REST path, or a boot that died before it got to
       the network. The public honour roll is read on every boot, signed out
       included, so the observation is only meaningful if it saw that. */
    if (!rpcCalls.length) {
      problems.push('the RPC observer recorded NOTHING on a full boot — it is not watching the requests it '
        + 'claims to grade, so the "no pre-auth call" result above is worthless');
    }
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
//
// b332 — PACKABILITY NOW RUNS HERE TOO. `pack-edge --check` existed but nothing
// invoked it on a push, so the two things it proves (the payload is packable at
// all, and no relative specifier still carries a `?v=` the Supabase bundler
// would read as part of the filename) only ran when somebody remembered. The
// first real deploy failed at the bundler on exactly that. A guard nobody runs
// is not a guard, so `runAll()` is wired in below, and `pack()`'s own problems —
// which this used to discard while keeping the hash — are surfaced. Reporting a
// hash for a payload that cannot deploy is the decoration failure again.
async function deployedPayloadGuard() {
  const problems = await packCheck();
  const { hash, problems: packProblems } = await packEdge('hr-accrue');
  for (const p of packProblems) problems.push(`[hr-accrue] ${p}`);
  if (problems.length) return { problems, note: '' };
  /* ⚠ THIS GUARD USED TO SKIP WHENEVER HR_ACCRUE_URL WAS UNSET, AND PRINT A
     GREEN SUITE. It cost us a live incident on 2026-08-15: b343 (26 new items),
     b344 and the price commits all landed, the deployed engine stayed on the
     previous payload, and the check that exists precisely to catch that said
     SKIPPED under a passing run. Three hours of drift sat under a green test —
     the engine that is about to own every progression value was running a copy
     of the game with 400 items while the game had 426.

     The env vars were never actually needed. `tests/rpc-resolution.mjs` already
     established the right pattern: read the project url and the ANON key out of
     src/net/supabase-bootstrap.js rather than duplicating them into config, so
     the check cannot be silently switched off by a missing variable. The anon
     key is public and already committed — there is no secret here to withhold.

     Env vars still WIN when set, so a branch or a local stack can be pointed at
     deliberately. What is gone is the ability to skip by accident. */
  let url = process.env.HR_ACCRUE_URL;
  let derivedKey = '';
  if (!url) {
    try {
      const boot = await readFile(new URL('../src/net/supabase-bootstrap.js', import.meta.url), 'utf8');
      const base = (boot.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
      derivedKey = (boot.match(/eyJ[A-Za-z0-9_\-.]{40,}/) || [])[0] || '';
      if (base) url = `${base}/functions/v1/hr-accrue`;
    } catch { /* fall through to the hard failure below */ }
  }
  if (!url) {
    problems.push('the deployed-payload check could not resolve the function url — neither HR_ACCRUE_URL nor '
      + 'a project url in src/net/supabase-bootstrap.js. This guard must never silently skip: it is the only '
      + 'thing that notices the deployed engine running a different copy of the game than this repo.');
    return { problems, note: '' };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const key = process.env.HR_ACCRUE_KEY || derivedKey;
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

// ── The auth-resilience guard (b331) ─────────────────────────────────────────
// WHY THIS IS NOT IN THE IN-PAGE SUITE: `tryRun` calls its test function and
// takes the return value, so an `async` test resolves after the runner has
// already recorded PASS — it would assert nothing, which is the exact family of
// failure this program has been bitten by eleven times. The in-page b331 tests
// are therefore all synchronous, and they can only see the decision made BEFORE
// the first `await`. The half they structurally cannot reach is the half that
// runs on the RESPONSE: the refresh-and-retry, the breaker's server-confirmed
// escalation, and — the one a mutation proved untested — the step where a 200
// carrying a locally-"expired" token teaches this device that its own clock is
// wrong. That is what this awaits.
//
// The two failures it pins are mirror images, and the second was introduced by
// the fix for the first:
//   A. token genuinely dead  -> exactly ONE request, then terminate + tell the player.
//   B. token fine, CLOCK 2h fast -> keep syncing, never terminate, and stop
//      trusting the local clock. (A token whose exp is 2h past, read by a
//      correct clock, is bit-for-bit a valid token read by a clock 2h fast.)
async function authResilienceGuard(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
  const problems = [];
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => !!window.HearthriseSync, { timeout: 60_000 });
    const r = await page.evaluate(async () => {
      const S = window.HearthriseSync;
      const jwt = (claims) => {
        const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return b64({ alg: 'ES256' }) + '.' + b64(claims) + '.sig';
      };
      const past = jwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 7200 });
      const real = window.fetch;
      const out = {};
      const base = {
        snapshotEndpoint: 'https://example.invalid/rest/v1/game_saves',
        apiKey: 'anon', userId: () => 'u1', authToken: () => past,
        onSyncFailure: () => {}, onSyncRecovered: () => {},
      };
      try {
        // ── A. the token really is dead: the server refuses it ──────────────
        let hits = 0, told = 0;
        window.fetch = () => { hits++; return Promise.resolve(new Response('{"code":"PGRST303"}', { status: 401 })); };
        S.setClockTrusted(true);
        // One short of terminal, no corroboration yet — so this attempt must
        // PROBE, be refused, and only then terminate.
        S.resetAuthGate({ streak: S.AUTH_DEAD_AFTER_TRIES - 1, firstAt: Date.now() - 1000, blockedUntil: 0, serverFails: 0 });
        await S.__withConfig({ ...base, onAuthError: async () => false, onAuthExpired: () => { told++; } },
          async () => { await S.snapshotIfDue(true, false); });
        out.deadHits = hits;                       // must be 1: no pointless retry
        out.deadTold = told;                       // must be 1: the player is told
        out.deadLatched = S.getAuthGate().dead;    // must be true
        out.deadServerFails = S.getAuthGate().serverFails;
        out.stillTrustsClock = S.isClockTrusted(); // a 401 does NOT exonerate the clock

        // ── B. the token is fine; this device's clock is two hours fast ─────
        // The refresh is made to FAIL here on purpose, so the ONLY thing that
        // can teach us is the server's 200. Otherwise a broken 200-path would
        // hide behind the refresh path and the guard would prove nothing.
        hits = 0; told = 0;
        window.fetch = () => { hits++; return Promise.resolve(new Response('[]', { status: 200 })); };
        S.setClockTrusted(true);
        S.resetAuthGate({ streak: S.AUTH_DEAD_AFTER_TRIES - 1, firstAt: Date.now() - 600000, blockedUntil: 0, serverFails: 0 });
        await S.__withConfig({ ...base, onAuthError: async () => false, onAuthExpired: () => { told++; } },
          async () => { await S.snapshotIfDue(true, false); });
        await new Promise((r) => setTimeout(r, 0));
        out.skewHits = hits;                       // the request went out
        out.skewTold = told;                       // must be 0: nothing is wrong with the session
        out.skewLatched = S.getAuthGate().dead;    // must be false
        out.clockDistrusted = !S.isClockTrusted(); // must be true: the 200 taught us

        // ── B2. the same lesson from the OTHER witness: the issuer ──────────
        // No response at all (the network is down), but the refresh succeeds —
        // so a token the ISSUER just minted is one our clock calls expired.
        S.setClockTrusted(true);
        S.resetAuthGate();
        window.fetch = () => Promise.reject(new Error('offline'));
        await S.__withConfig({ ...base, onAuthError: async () => true, onAuthExpired: () => {} },
          async () => { await S.snapshotIfDue(true, false); });
        await new Promise((r) => setTimeout(r, 0));
        out.refreshTaughtUs = !S.isClockTrusted(); // must be true, with zero server help
        // …and having learnt it, the local veto is retired: further requests flow
        // even with the server having refused us in the past.
        hits = 0;
        window.fetch = () => { hits++; return Promise.resolve(new Response('[]', { status: 200 })); };
        S.resetAuthGate({ serverFails: 5 });
        await S.__withConfig({ ...base, onAuthError: async () => true, onAuthExpired: () => {} },
          async () => { await S.snapshotIfDue(true, false); });
        out.afterLearningHits = hits;              // must be >= 1
      } finally {
        window.fetch = real;
        S.setClockTrusted(true);
        S.resetAuthGate();
        S.__resetSyncHealth();
      }
      return out;
    });

    if (r.deadHits !== 1) problems.push(`a dead token cost ${r.deadHits} request(s); it must probe exactly once and then stop`);
    if (r.deadTold !== 1) problems.push(`the player was told ${r.deadTold} times that their sign-in died (expected exactly 1)`);
    if (r.deadLatched !== true) problems.push('a server-confirmed dead token did not terminate — the b331 loop can come back');
    if (!(r.deadServerFails >= 1)) problems.push('the 401 was not recorded as server evidence');
    if (r.stillTrustsClock !== true) problems.push('a 401 wrongly exonerated the local clock — that would disarm the breaker');
    if (!(r.skewHits >= 1)) problems.push('a clock 2h fast blocked the request — a valid session would be bricked');
    if (r.skewTold !== 0) problems.push('a player with a VALID token was told their sign-in expired');
    if (r.skewLatched !== false) problems.push('a local clock error terminated a healthy session — the incident, inverted');
    if (r.clockDistrusted !== true) problems.push('a 200 carrying a locally-"expired" token did not teach this device that its clock is wrong');
    if (r.refreshTaughtUs !== true) problems.push('a freshly REFRESHED token that reads "expired" did not teach this device that its clock is wrong');
    if (!(r.afterLearningHits >= 1)) problems.push('the local expiry veto survived proof that the clock is wrong');
  } catch (err) {
    problems.push('harness failure: ' + err.message);
  } finally {
    await ctx.close().catch(() => {});
  }
  return problems;
}

// ── The save-slot guard (b342) ───────────────────────────────────────────────
// WHY THIS IS NOT IN THE IN-PAGE SUITE, AND WHY IT EXISTS AT ALL:
//
// "the client hard-codes character slot 0" has now been found THREE times —
// accrue.js and character.js (b339), record.js (b340), and src/net/sync.js,
// which carries the SAVE ITSELF (b342). The b339 fix shipped nine mutations and
// the one that SLIPPED was exactly this shape: a test configured the module and
// proved the module resolved the slot correctly, while the CALLER went on
// pinning `slot: 0`. B342-1 in the in-page suite drives auth.js's
// buildSaveWiring() directly, which closes that specific gap — but it can still
// be defeated by putting `slot: 0` in the half of enableLiveSync()'s setupSync
// literal that was not extracted. Any test of a partial extraction can.
//
// So this one reads the BYTES. It boots the real index.html, drives a player
// through the real multi-character API onto character 3, signs in for real, and
// asserts on the actual outgoing HTTP request. The only stub is the
// third-party supabase-js SDK, which is fetched from a CDN and is not the thing
// under test — setupAuth() -> enableLiveSync() -> setupSync() -> snapshotIfDue()
// is all real. There is nowhere to hide a slot from it.
//
// It pins BOTH directions, because they are two different failures:
//   WRITE  the autosave upserts (user_id, slot) — the wrong slot silently
//          overwrites another character's cloud save every 60 seconds.
//   READ   the pull feeds decideRestore(), which resolves by FRESHNESS. Reading
//          another character's row compares two different saves by timestamp,
//          so the wrong one gets restored over the live game. "Newest wins" is
//          only correct between two copies of the SAME save.
const SUPABASE_SDK_STUB = `
export function createClient(url, key, opts) {
  return { auth: {
    setSession: async (s) => ({ data: { session: s }, error: null }),
    refreshSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: (cb) => ({ data: { subscription: { unsubscribe(){} } } }),
    getSession: async () => ({ data: { session: null } }),
  } };
}
export default { createClient };
`;
async function saveSlotGuard(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
  await page.route(/cdn\.skypack\.dev/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: SUPABASE_SDK_STUB }));
  const problems = [];
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => typeof window.G !== 'undefined' && !!window.HearthriseProfile
      && !!window.HearthriseAuth && !!window.HearthriseSync, { timeout: 60_000 });
    await page.waitForTimeout(5_000);

    const r = await page.evaluate(async () => {
      const P = window.HearthriseProfile;
      // Become a player with three characters, on the third — through the REAL
      // slot API (unlockSlot/switchSlot), not by writing the profile record.
      P.init();
      window.G.gems = 5000;
      P.unlockSlot(1); P.unlockSlot(2); P.switchSlot(2);
      const activeSlot = P.activeSlot();

      const seen = [];
      const realFetch = window.fetch;
      window.fetch = (input, init) => {
        seen.push({
          url: typeof input === 'string' ? input : (input && input.url) || String(input),
          method: (init && init.method) || 'GET',
          body: (init && init.body) || null,
        });
        // A definitive "no row" so the b314 reconcile completes and releases the
        // snapshot gate, instead of holding uploads and retrying forever.
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      try {
        const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        localStorage.setItem('hearthrise:supabaseSession', JSON.stringify({
          access_token: b64({ alg: 'ES256' }) + '.'
            + b64({ sub: 'user-A', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.sig',
          refresh_token: 'rt', user: { id: 'user-A' },
        }));
        // The real thing: this reaches enableLiveSync() and its setupSync literal.
        await window.HearthriseAuth.setupAuth({ url: 'https://proj.supabase.co', anonKey: 'anon-key' });
        await new Promise((res) => setTimeout(res, 1200));
        await window.HearthriseSync.snapshotIfDue(true, false);
        await new Promise((res) => setTimeout(res, 300));
      } finally { window.fetch = realFetch; }

      const pull = seen.find((s) => /game_saves\?/.test(s.url) && s.method === 'GET');
      const post = seen.find((s) => /game_saves/.test(s.url) && s.method === 'POST');
      let writeSlot = null;
      if (post && post.body) { try { writeSlot = JSON.parse(post.body).slot; } catch (e) {} }
      const m = pull ? String(pull.url).match(/slot=eq\.(\d+)/) : null;
      return {
        activeSlot,
        sawPull: !!pull, sawWrite: !!post,
        readSlot: m ? Number(m[1]) : null,
        writeSlot,
        pullUrl: pull ? pull.url : null,
      };
    });

    // Vacuity first: a guard that silently observed nothing is the failure this
    // program has met eleven times.
    if (r.activeSlot !== 2) problems.push(`the harness never reached character 3 (activeSlot=${r.activeSlot}) — nothing below was tested`);
    if (!r.sawWrite) problems.push('no autosave request was captured — the write assertion would pass vacuously');
    if (!r.sawPull) problems.push('no cloud-read request was captured — the read assertion would pass vacuously');
    if (r.sawWrite && r.writeSlot !== 2) {
      problems.push(`the autosave wrote slot ${r.writeSlot} while the player is on character 3 (slot 2) — `
        + 'game_saves is UNIQUE (user_id, slot), so this silently overwrites another character\'s cloud save');
    }
    if (r.sawPull && r.readSlot !== 2) {
      problems.push(`the cloud read asked for slot ${r.readSlot} while the player is on character 3 (${r.pullUrl}) — `
        + 'decideRestore compares by freshness, so a different character\'s save would be restored over the live game');
    }
    if (r.sawPull && r.sawWrite && r.readSlot !== r.writeSlot) {
      problems.push(`read slot ${r.readSlot} != write slot ${r.writeSlot} — the save is read from one character and written to another`);
    }
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

    /* b348 — THE COMBAT STYLE PICKER MUST SAY WHAT XP IT GIVES, ON A PHONE.
       Xarn: "Combat styles no longer show what XP they give. It used to show:
       Controlled / Def/att/str." Cause: `#panel-combat .csb-btn small
       {display:none}` inside theme-cozy's mobile media query — so the fact was
       in the DOM and computed away, and the desktop-width in-page suite could
       never see it. The in-page CSSOM guard catches the RULE; this catches the
       RESULT, at a viewport where the rule actually applies. Both, because a
       future density pass could hide it by some other mechanism (a zero height,
       a clipped parent) that no rule-scan would name. */
    const styleSeen = await page.evaluate(async () => {
      const panel = document.getElementById('panel-combat');
      if (!panel) return { err: 'no combat panel' };
      /* WAIT FOR THE PANEL TO ACTUALLY OPEN. `#panel-combat.active
         .combat-style-block` is what forces the ribbon visible
         (audit-overrides.css), so measuring before showTab has taken effect
         reads display:none and blames the label for the panel being shut —
         which is exactly what this guard did on its first run. */
      for (let i = 0; i < 20 && !panel.classList.contains('active'); i++) {
        try { window.showTab('combat'); } catch (e) {}
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!panel.classList.contains('active')) return { err: 'the combat panel never opened' };
      /* The picker lives on the phone Combat panel's dedicated Style sub-tab,
         and it is reached BY TAPPING IT — which is also the only correct way,
         because the seeded save above is mid-fight and combat-mobile-tabs.js
         steers a live fight to the Arena until the player chooses for
         themselves (b334). Writing `dataset.mobileSub` directly is silently
         undone by that steer within 1.5s; the tap sets `_playerChose` and
         sticks, exactly as a player's does. */
      const tab = panel.querySelector('#cmb-mob-tabs .cmt-btn[data-sub="style"]');
      if (tab) tab.click(); else panel.dataset.mobileSub = 'style';
      await new Promise((r) => setTimeout(r, 150));
      if (panel.dataset.mobileSub !== 'style') {
        return { err: 'tapping the Style sub-tab did not open it (sub=' + panel.dataset.mobileSub + ')' };
      }
      if (typeof window.renderStyleSelector === 'function') window.renderStyleSelector();
      await new Promise((r) => setTimeout(r, 200));
      const block = document.querySelector('.combat-style-block');
      if (!block) return { err: 'the style picker did not render at all' };
      const br = block.getBoundingClientRect();
      /* If the picker itself is not laid out, the XP label being invisible is a
         CONSEQUENCE, not the fault — say which, or a future reader chases the
         wrong thing (and the sub-tab machinery genuinely can put it in a hidden
         host depending on which combat hosts exist at that instant). */
      if (!(br.width > 0 && br.height > 0)) {
        const chain = [];
        for (let e = block; e && e !== document.documentElement; e = e.parentElement) {
          chain.push((e.id ? '#' + e.id : e.tagName) + '[' + String(e.className) + ']=' + getComputedStyle(e).display);
        }
        return { err: 'the style picker is not laid out on the Style sub-tab'
          + ` · body[${document.body.className}] blocks=${document.querySelectorAll('.combat-style-block').length}`
          + ` · ${chain.join(' < ')}` };
      }
      const btns = [...block.querySelectorAll('.csb-btn')];
      if (!btns.length) return { err: 'no style buttons rendered' };
      const bad = btns.filter((b) => {
        const t = b.querySelector('.csb-trains');
        if (!t || !t.textContent.trim()) return true;
        if (getComputedStyle(t).display === 'none') return true;
        const r = t.getBoundingClientRect();
        return !(r.width > 0 && r.height > 0);
      }).map((b) => (b.getAttribute('data-style-key') || b.textContent.trim()));
      return { total: btns.length, bad, sample: btns[0].innerText.replace(/\s+/g, ' ').trim() };
    });
    if (styleSeen.err) problems.push(`combat style picker: ${styleSeen.err}`);
    else if (styleSeen.bad.length) {
      problems.push(`combat style buttons hide their XP route on a phone: ${styleSeen.bad.join(', ')}`
        + ` (rendered: "${styleSeen.sample}")`);
    }

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

// PREFLIGHT — the price catalogue must match the shop tables it was extracted
// from.
//
// A server that authorises a spend must own the price, and every price in the
// game lives in a table inside src/legacy.js — a classic script that neither
// ESM nor Deno can import (the b222 trap). tools/gen-shops.mjs extracts them
// into src/data/shops.js, which makes a SECOND COPY, and a second copy is only
// defensible while something proves it is not diverging. That is this check.
// It fails in both directions: a price edited in legacy.js without a
// regenerate, and a hand edit to the generated file.
//
// NOT skippable on an empty extraction: the generator hard-fails a table that
// yields zero rows, because an empty table diffs clean against an empty
// committed file and would report "in sync" forever while asserting nothing —
// this repo's signature failure, at instance #15.
// It runs in TWO parts, and the second is not optional. `--check` passing
// proves nothing by itself, so tests/shop-drift-guard.mjs mutates the real
// sources in a temp copy and asserts the guard goes RED for each — eight
// mutations, each preceded by a green control. ~3s. The repo's own rule
// (tests/rpc-resolution.mjs) is that a probe which cannot demonstrate it can
// see failure is treated as broken, not as a pass.
async function shopDriftPreflight() {
  const gen = join(ROOT, 'tools', 'gen-shops.mjs');
  try { await stat(gen); } catch { return 0; }
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [gen, '--check'], { encoding: 'utf8' });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status !== 0) {
    console.error(`\nPrice preflight FAILED — a shop price no longer matches src/data/shops.js.\n${out}\n`);
    return 1;
  }
  const meta = join(ROOT, 'tests', 'shop-drift-guard.mjs');
  try { await stat(meta); } catch { console.log(`Price preflight: ${out}`); return 0; }
  const m = spawnSync(process.execPath, [meta], { encoding: 'utf8' });
  const mout = ((m.stdout || '') + (m.stderr || '')).trim();
  if (m.status !== 0) {
    console.error(`\nPrice preflight FAILED — the drift guard is BLIND. It reports "in sync" but `
      + `cannot see a price change.\n${mout}\n`);
    return 1;
  }
  console.log(`Price preflight: ${out}`);
  console.log(`  ${mout}`);
  return 0;
}

// PREFLIGHT - the ROOM RUNG PAYLOAD must match src/legacy.js.
//
// Same trap as the prices, with a sharper consequence: BOTH SIDES READ THE
// GENERATED FILE AT RUNTIME. src/legacy.js getBonus delegates to
// src/core/perks.js, and so does the accrual engine, so a stale
// src/data/perks.js does not merely mis-describe the game - it IS the game,
// on both sides, including the Kitchen's `noBurn`. The check therefore fails
// the build rather than warning.
//
// The generator also hard-fails on a room count, a rung count or a KEY SET
// that no longer matches its tripwires, so an anchor that silently missed
// cannot produce an empty table that diffs clean against an empty committed
// file - this repo's signature failure.
async function perkDriftPreflight() {
  const gen = join(ROOT, 'tools', 'gen-perks.mjs');
  try { await stat(gen); } catch { return 0; }
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [gen, '--check'], { encoding: 'utf8' });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status !== 0) {
    console.error(`\nPerk preflight FAILED - a room rung no longer matches src/data/perks.js.\n${out}\n`);
    return 1;
  }
  console.log(`Perk preflight: ${out}`);
  return 0;
}

// PREFLIGHT — the UNLOCK CATALOGUE must match src/data, and the restated
// hr_perks_of must still be perk-channel's body plus its four declared patches.
//
// Two checks, one block, because they fail for the same reason and both are
// silent otherwise:
//   · hr_unlocks is what hr_unlock_guard and hr_unlock_levels read. A stale
//     catalogue makes a newly added unlock UNWRITABLE — the guard refuses it,
//     hr_apply answers bad_delta, and whoever earned it loses the night.
//   · 2026-08-16-artisan-progress-model.sql restates hr_perks_of in order to
//     add ONE key. `create or replace` on a body you have not read is the most
//     destructive statement in this repo, so the body is EXTRACTED from
//     2026-08-15-perk-channel.sql and patched at named anchors. A hand-edit
//     between the markers, or a moved anchor, fails here.
async function unlockModelPreflight() {
  const { spawnSync } = await import('node:child_process');
  for (const [tool, label, why] of [
    ['gen-unlocks.mjs', 'Unlock preflight',
      'a shop grant or a recipe gate no longer matches the generated catalogue'],
    ['derive-perks-of.mjs', 'hr_perks_of derivation',
      'the restated hr_perks_of is no longer perk-channel\'s body plus its declared patches'],
    /* b353. The same rule applied to THE DETECTOR, and the reason it is worth a
       third entry rather than being trusted to review: every other restated
       body in this repo fails loudly when it is damaged, and
       hr_assert_grant_hygiene fails SILENTLY. A restatement that dropped one of
       its nine checks reads as a clean night for as long as nobody looks. */
    ['derive-grant-hygiene.mjs', 'hr_assert_grant_hygiene derivation',
      'the restated grant detector is no longer grant-hygiene\'s body plus its declared patch — '
      + 'i.e. a check may have been deleted while every self-check still passed'],
  ]) {
    const gen = join(ROOT, 'tools', tool);
    try { await stat(gen); } catch { continue; }
    const r = spawnSync(process.execPath, [gen, '--check'], { encoding: 'utf8' });
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    if (r.status !== 0) {
      console.error(`\n${label} FAILED — ${why}.\n${out}\n`);
      return 1;
    }
    console.log(`${label}: ${out}`);
  }
  return 0;
}

const run = async () => {
  if (await catalogueDriftPreflight()) process.exit(1);
  if (await shopDriftPreflight()) process.exit(1);
  if (await perkDriftPreflight()) process.exit(1);
  if (await unlockModelPreflight()) process.exit(1);
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

    /* ── The auto-eat authority guard ───────────────────────────────────
       The accrual guard above proves the ENGINE eats correctly. This proves
       the DATABASE only ever lets it: hr_set_auto_eat is the sole writer of
       the three columns the engine reads, and it is the thing standing
       between "the server heals you" and "the server hands every character
       a 100-Bounty-Mark trait". Runs a real PostgreSQL in process (PGlite)
       with the real migrations applied verbatim, and pairs every refusal
       with a control. See tests/auto-eat-authority.mjs. */
    const autoEatProblems = await autoEatAuthorityGuard();
    if (autoEatProblems.length) {
      console.log('\nAuto-eat authority guard (the entitlement gate holds) — FAILED:');
      for (const p of autoEatProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nAuto-eat authority guard — the entitlement gate, the catalogue, the threshold, '
        + 'collect_first and the grants all hold, each against a control.');
    }

    /* ── The perk channel guard (b349) ───────────────────────
       The whole chain, EXECUTED: a player_progress unlock row ->
       hr_unlock_levels -> hr_perks_of -> normalisePerkState -> makeBonus ->
       burnChance, on a real PostgreSQL in process with the real migration
       applied verbatim. Its parity block starts from ONE SAVE and travels
       BOTH real adapters — the client's clientPerkState() shape and the
       server's unlock rows — because the adapters are where drift lives.
       `node tests/perk-channel.mjs --mutate` plants six real defects and
       fails if any escapes; five of the six are caught by the migration's
       own self-check, which is the stronger place to catch them. */
    const perkProblems = await perkChannelGuard();
    if (perkProblems.length) {
      console.log('\nPerk channel guard (noBurn reaches the engine) — FAILED:');
      for (const p of perkProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nPerk channel guard — an unlock row reaches burnChance with the client\'s own '
        + 'magnitude; the degrade path is inert; a forged state cannot name a number.');
    }
    /* ── The artisan progress model guard (b352) ────────────────────────
       The two shapes that block a server-paid artisan night, end to end on a
       real PostgreSQL with the WHOLE migration chain applied — so both new
       migrations' own self-verifying blocks execute here on every run, not
       only when somebody applies them.

       The load-bearing half is the DELETIONS: a recipe unlock row is written
       through hr_apply, the recipe cooks, the row is deleted, and the same
       seeded span must LOCK at tick 0; a Kitchen rung makes a 400-cook span
       burn NOTHING, and deleting it must restore the catalogue's 25% byte for
       byte. A gate that opens when its state is missing hands out eight
       recipes. `--mutate` plants twelve real defects; the two that would
       silently zero the whole channel are planted TWICE, once with the
       migration's own self-check silenced, so this guard is proven to catch
       them alone. */
    const artisanProblems = await artisanProgressGuard();
    if (artisanProblems.length) {
      console.log('\nArtisan progress model guard (unlockedRecipes + noBurn) — FAILED:');
      for (const p of artisanProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nArtisan progress model guard — a recipe row opens the gate and its deletion '
        + 'closes it; a Kitchen rung cooks a span with 0 burns and its deletion restores the '
        + 'catalogue rate.');
    }

    /* ── The activity-seam guard (b348) ─────────────────────────────────
       The one guard that would have stopped Tyler's switch-on test failing.
       The server's SETTABLE_KINDS is DERIVED from PAYABLE_KINDS, so teaching
       the engine to pay gathering widened it in a single edit — correctly, and
       invisibly to the client, which went on declaring nothing. Seven accruals
       ran against a pointer that had never been set.

       This asserts the two lists are one contract, that every settable kind
       has a real declaration site, that the client's gather index IS the
       engine's, and that an activity the engine cannot price declares `idle`
       rather than nothing. See tests/activity-seam.mjs. */
    const seamProblems = await activitySeamGuards();
    if (seamProblems.length) {
      console.log('\nActivity-seam guard (the client declares what the server can set) — FAILED:');
      for (const p of seamProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nActivity-seam guard — every settable kind is declarable, wired to a call site, and '
        + 'resolves through the accrual engine\'s own catalogue.');
    }

    /* ── The delta-transport guard (the 2026-08-15 P0) ───────────────────
       hr_apply had NEVER applied a delta through the Edge Function: both
       call sites bound a `JSON.stringify`d delta into a `::jsonb` parameter,
       and postgres.js — which learns the resolved parameter type from
       ParameterDescription on the describe-first path `prepare:false` always
       takes — re-serialised it into a jsonb STRING SCALAR. hr_apply's first
       guard is `jsonb_typeof(p_delta) <> 'object'`, so every call answered
       409 bad_delta.

       tests/activity-intent.mjs could not see it and never will: it drives
       the same module bytes but injects a PGlite `exec`, and the bug is in
       the TRANSPORT. 27 mutations passed against code that had never once
       worked in production. This guard changes exactly one thing — the wire.
       PGlite is exposed over the real PostgreSQL protocol and the REAL
       postgres@3.4.5 driver connects to it with the Edge Function's own pool
       options, so `runSetActivity` runs end to end against the real
       hr_apply. It carries its own control: if the double-encode ever stops
       being reproducible, that is reported as a FAILURE, because every
       assertion after it would be passing for free.
       `node tests/delta-transport.mjs --selftest` reinstates the shipped bug
       at each call site and requires both to turn the run RED. */
    const { problems: deltaProblems, note: deltaNote } = await deltaTransportGuards();
    if (deltaProblems.length) {
      console.log('\nDelta-transport guard (the delta reaches hr_apply as a jsonb OBJECT) — FAILED:');
      for (const p of deltaProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log(`\nDelta-transport guard — ${deltaNote}.`);
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

    /* ── Deployable, then deployed-vs-repo (S10, b332) ──────────────────
       TWO questions, in order, because the second is meaningless without
       the first:
         1. IS IT DEPLOYABLE? `pack-edge` runAll() — packability plus the
            no-`?v=`-in-the-payload rule the first real deploy bought at the
            cost of a 400 from the hosted bundler. This used to exist and be
            invoked by nobody on a push.
         2. IS IT DEPLOYED? `pack-edge --check` re-derives the payload from
            the same repo it just read, so it structurally cannot answer "do
            the bytes running in production match this branch?". The function
            reports the sha256 it was packed with on a GET; this compares
            that with the digest recomputed here. SKIPPED, LOUDLY, when no
            URL is configured — a check that prints nothing when it does not
            run is the failure this program has hit six times. */
    /* ── The CORS preflight guard ───────────────────────────────────────
       The deployed hr-accrue was unreachable from every browser — no
       `Access-Control-*` header, no OPTIONS branch — while curl, Node and
       every guard here reported it healthy, because NONE OF THEM ISSUES A
       PREFLIGHT. Only a browser does. This drives the shipped cors.js with
       a real OPTIONS carrying Origin and Access-Control-Request-Headers,
       asserts the wrapper is the only Deno.serve registration in the packed
       payload, and — when HR_ACCRUE_URL is set — preflights PRODUCTION.
       See tests/cors-preflight.mjs. */
    const { problems: corsProblems, note: corsNote } = await corsGuards();
    if (corsProblems.length) {
      console.log('\nCORS preflight guard (a browser can reach hr-accrue) — FAILED:');
      for (const p of corsProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log(`\nCORS preflight guard — a real OPTIONS from hearthrise.net is admitted; ${corsNote}`);
    }

    const deployProblems = await deployedPayloadGuard();
    if (deployProblems.problems.length) {
      console.log('\nEdge payload guard (packable, then deployed bytes == repo bytes) — FAILED:');
      for (const p of deployProblems.problems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log(`Edge payload guard — ${deployProblems.note}`);
    }

    const anonSurface = await anonSurfaceGuard();
    if (anonSurface.problems.length) {
      console.log('\nAnon-surface guard (the client\'s anon list == the live grants) — FAILED:');
      for (const p of anonSurface.problems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log(`Anon-surface guard — ${anonSurface.note}.`);
    }

    // Wall guard FIRST, in its own clean context, before the harness page below
    // ever declares itself. b349: it also grades what left the client on the
    // wire — a session-less boot may issue no authenticated-only RPC.
    const wallProblems = await wallGuard(browser, url);
    if (wallProblems.length) {
      console.log('\nAccount-wall guard — FAILED:');
      for (const p of wallProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nAccount-wall guard — a clean boot is walled, nothing behind it, and no authenticated RPC left it.');
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

    const authProblems = await authResilienceGuard(browser, url);
    if (authProblems.length) {
      console.log('\nAuth-resilience guard (expired token vs wrong clock) — FAILED:');
      for (const p of authProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Auth-resilience guard — a dead token costs one request and terminates; a 2h-fast clock keeps syncing.');
    }

    const slotProblems = await saveSlotGuard(browser, url);
    if (slotProblems.length) {
      console.log('\nSave-slot guard (the autosave addresses the character being played) — FAILED:');
      for (const p of slotProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Save-slot guard — on character 3, the real save path reads and writes slot 2 on the wire.');
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
  /* ⚠ `process.exit(exitCode)` HERE, NOT `process.exitCode`, WAS A LANDMINE ON
     WINDOWS — and it sat directly in front of the next step in the program.
     Node 24 on win32 aborts with
       Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:76
     when `process.exit()` is called in a process that has ever used `fetch()`,
     even after the response body is drained and the global undici dispatcher is
     closed (both tried; both still crash). The exit code becomes 127.
     Two guards here use fetch the moment HR_ACCRUE_URL is set — which is
     exactly what the handoff's NEXT #1 asks for — so a fully GREEN suite would
     have exited 127 and read as a failure, while every red one reported the
     wrong code. Setting `exitCode` and letting the loop drain exits correctly
     and immediately (measured: same second, no lingering handle, browser and
     static server are already closed in the `finally` above). */
  process.exitCode = exitCode;
};

run();
