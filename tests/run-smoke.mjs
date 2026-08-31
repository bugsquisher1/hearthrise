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
import { companionPerkGuard } from './companion-perk.mjs';
import { companionXpGuard } from './companion-xp.mjs';
import { artisanProgressGuard } from './artisan-progress-model.mjs';
import { goalCountersGuard } from './goal-counters.mjs';
import { inventoryCompleteGuard } from './inventory-complete-probe.mjs';
import { goalCatalogueDriftGuard } from './goal-catalogue-drift.mjs';
import { collectionRenownClaimDriftGuard } from './collection-renown-claim-drift.mjs';
import { bountyDriftGuard } from './bounty-drift.mjs';
import { unlockBuyGuard } from './unlock-buy.mjs';
import { marketV2Guard } from './market-v2.mjs';
import { marketIntentGuard } from './market-intent.mjs';
import { runAll as equipIntentGuards } from './equip-intent.mjs';
import { runAll as eatIntentGuards } from './eat-intent.mjs';
import { guard as skillRowUpsertGuard } from './skill-row-upsert.mjs';
import { guard as leaderboardSourceGuard } from './leaderboard-server-source.mjs';
import { itemsCatalogueGuard, itemsCatalogueMutationGuard } from './items-catalogue.mjs';
import { cutoverImportGuard } from './cutover-import.mjs';
import { clientWriteSweep2Guard } from './client-write-sweep-2.mjs';
import { clientWriteSweep3Guard } from './client-write-sweep-3.mjs';
import { clientWriteSweep4Guard } from './client-write-sweep-4.mjs';
import { clientWriteSweep5Guard } from './client-write-sweep-5.mjs';
import { bugTriageGuard } from './bug-triage.mjs';
import { slotSwitchGuard } from './slot-switch.mjs';
import { nativeDialogGuard } from './native-dialog.mjs';
import { clanDepositOwnershipGuard } from './clan-deposit-ownership.mjs';
import { clanEconomySinksGuard } from './clan-economy-sinks.mjs';
import { feastCatalogueDriftGuard } from './clan-feast-catalogue-drift.mjs';
import { rpcGateBucketGuard } from './rpc-gate-bucket-guard.mjs';
/* b461 — the quest MODAL's server credit path, and the catalogue-refill
   ownership interlock that stops a regen wiping another migration's offers.
   Both replay the real migration chain into PGlite and drive real RPCs. */
import { modalGoalClaimGuard } from './modal-goal-claim.mjs';
import { traitBuyGuard } from './trait-buy.mjs';
/* b497 — the two designer rulings that move server-owned numbers. Both replay
   the real migration chain into PGlite and drive real RPCs, because both are
   client/server CONTRACTS: the board DRAWS a kill count the accept CLAMPS, and
   the entry trait is granted by the same RPC that mints the starting kit. */
import { autoEatAtCreationGuard } from './auto-eat-at-creation.mjs';
import { bountyDifficultyCountGuard } from './bounty-difficulty-count.mjs';
import { combatStyleGuard } from './combat-style.mjs';
import { accrueEnvelopeAwayGuard } from './accrue-envelope-away.mjs';
import { unlockOfferOwnershipGuard } from './unlock-offer-ownership.mjs';
import { unlockCatalogueOwnershipGuard } from './unlock-catalogue-ownership.mjs';
import { runAll as activitySeamGuards } from './activity-seam.mjs';
import { runAll as artisanAccrualGuards } from './artisan-accrual.mjs';
import { runAll as liveSettlementGuards, engineGuard as settleReport,
  sqlGuard as settleSqlReport } from './live-settlement.mjs';
import { runAll as goldCensusGuard } from './gold-site-census.mjs';
import { runAll as deltaTransportGuards } from './delta-transport.mjs';
import { runAll as jwtGuards } from './jwt-verify.mjs';
import { runAll as corsGuards } from './cors-preflight.mjs';
import { runAll as iconBootOrderGuard } from './icon-boot-order.mjs';
import { reachabilityGuard } from './reachability.mjs';
import { recipeYieldGuard, recipeYieldMutationGuard } from './recipe-yield-guard.mjs';
import { cacheBusterGuard, cacheBusterMutationGuard } from './cache-buster-guard.mjs';
import { pack as packEdge, runAll as packCheck } from '../tools/pack-edge.mjs';
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

/* Everything this harness prints, kept so the run can assert at the end that
   every guard it expected actually reported. See REQUIRED_GUARD_MARKERS. The
   tap is install-once and passes through untouched — a harness that swallowed
   or reordered its own output would be a worse problem than the one it guards. */
const TRANSCRIPT = [];
{
  const real = console.log.bind(console);
  console.log = (...args) => { TRANSCRIPT.push(args.join(' ')); real(...args); };
}
const argv = process.argv.slice(2);
const argOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const HEADED = argv.includes('--headed');
const EXTERNAL_URL = argOf('--url');
/* b461: overridable for a loaded machine (parallel agent worktrees each running
   their own Chromium suite blew the 120s in-page budget three times in a row on
   code that passed 999/999 alone). Only the wall-clock budget flexes — every
   assertion still has to pass. `HR_SUITE_TIMEOUT_MS=300000 node tests/run-smoke.mjs`. */
const SUITE_TIMEOUT_MS = Number(process.env.HR_SUITE_TIMEOUT_MS) > 0 ? Number(process.env.HR_SUITE_TIMEOUT_MS) : 120_000;

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

// ── The combat-drop attribution guard (b370) ────────────────────────────────
// "Drops this fight" is an ALLOWLIST: it shows a credit only if the one
// combat-drop credit site declared it. That design is fail-closed — a feature
// added later that credits the bag is non-combat by default and cannot pollute
// the rail — but the guarantee rests entirely on there being exactly ONE
// writer. A second declaration site would quietly restore the old failure mode
// (shop purchases, market buys and worker hauls listed as loot) with every
// in-browser test still green, because those tests can only see behaviour they
// thought to exercise. The structural invariant needs a structural guard.
async function combatCreditGuard() {
  const problems = [];
  const files = [];
  async function walkSrc(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { await walkSrc(full); continue; }
      if (extname(e.name).toLowerCase() === '.js') files.push(full);
    }
  }
  await walkSrc(join(ROOT, 'src'));
  if (files.length < 20) problems.push(`only ${files.length} src files scanned — the guard is checking nothing`);
  const writers = [];
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (rel.includes('smoke-test')) continue;            // the suite may drive it
    const text = await readFile(f, 'utf8');
    if (!text.includes('__hrCombatCredits')) continue;
    // combat-screens.js is the READER; everyone else touching it is a writer.
    if (rel.endsWith('features/combat-screens.js')) continue;
    writers.push(rel);
  }
  if (writers.length !== 1 || !writers[0].endsWith('legacy.js')) {
    problems.push('the combat-drop declaration must have exactly one writer '
      + '(COMBAT_FX.addItem in src/legacy.js) — found: ' + (writers.join(', ') || 'NONE'));
  }
  // The away replay runs the same resolveKill through the same fx, so it must
  // keep overriding addItem with the silent binding. Without that override a
  // whole night's drops land in the rail of the next fight the player starts.
  const legacy = await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8');
  const binding = legacy.match(/addItem:function\(id,qty\)\{[\s\S]{0,400}?\n  \},/);
  if (!binding) {
    problems.push('could not find COMBAT_FX.addItem in src/legacy.js — the guard is checking nothing');
  } else if (!/_awaySegmentAtMs\s*!=\s*null/.test(binding[0])) {
    problems.push('COMBAT_FX.addItem no longer gates on the away latch — an away replay\'s drops '
      + 'will be claimed by the live "Drops this fight" rail');
  }
  // src/core is packed verbatim into the hr-accrue Edge Function, so the
  // attribution must never reach into it: that would drift the deployed
  // payload for a purely client-side display concern.
  const sim = await readFile(join(ROOT, 'src', 'core', 'combat-sim.js'), 'utf8');
  if (/__hrCombatCredits/.test(sim)) {
    problems.push('core/combat-sim.js references the rail\'s attribution bucket — src/core is '
      + 'packed into the Edge Function and must stay free of client display concerns');
  }
  return { problems, note: `1 declaration site (${writers[0] || 'none'}), away latched, core clean` };}

// ── The showTab single-owner guard (b405) ───────────────────────────────────
// window.showTab has ONE owner: the tap registry's patchedShowTab
// (src/utils/showtab-registry.js), installed once over the base function. Every
// feature that used to reach navigation reassigned window.showTab, each
// capturing the previous owner and racing the others' install order — the exact
// fragility that let b227/b334 flake and that froze a panel whenever a wrapper
// dropped a trigger. This guard fails the build if a raw `window.showTab =`
// reappears anywhere in src/** outside the registry and its safe.js delegate,
// so the single-owner model cannot silently erode back into a monkey-patch pile.
async function showTabOwnershipGuard() {
  const problems = [];
  const files = [];
  async function walkSrc(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { await walkSrc(full); continue; }
      if (extname(e.name).toLowerCase() === '.js') files.push(full);
    }
  }
  await walkSrc(join(ROOT, 'src'));
  if (files.length < 50) problems.push(`only ${files.length} src files scanned — the guard is checking nothing`);

  // The only two files permitted to assign window.showTab: the registry (the
  // owner) and safe.js (its legacy fallback path, only when the registry is
  // absent, e.g. an isolated module test).
  const ALLOWED = new Set(['src/utils/showtab-registry.js', 'src/utils/safe.js']);
  // Any assignment to window.showTab: `window.showTab =` (with optional spaces),
  // but NOT a comparison (`window.showTab ===`/`==`/`!=`).
  const ASSIGN = /window\.showTab\s*=(?!=)/;
  let registryPresent = false;
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (rel === 'src/utils/showtab-registry.js') registryPresent = true;
    const text = await readFile(f, 'utf8');
    if (rel.includes('smoke-test')) continue;          // the suite may stub it in a test
    if (ALLOWED.has(rel)) continue;
    // strip line comments so a doc reference to the pattern doesn't trip it
    for (const line of text.split('\n')) {
      const code = line.replace(/\/\/.*$/, '');
      if (ASSIGN.test(code)) {
        problems.push(`${rel}: raw \`window.showTab =\` reassignment — use `
          + `window.HearthriseShowTab.wrapShowTab('<label>', fn) instead (single-owner model)`);
      }
    }
  }
  if (!registryPresent) problems.push('src/utils/showtab-registry.js is missing — the single owner has no home');

  // The base showTab must hand ownership to the registry right after it is declared.
  const legacy = await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8');
  if (!/HearthriseShowTab\s*&&\s*window\.HearthriseShowTab\.install\(\)/.test(legacy)
      && !/window\.HearthriseShowTab\.install\(\)/.test(legacy)) {
    problems.push('src/legacy.js never calls window.HearthriseShowTab.install() — the registry '
      + 'owner is never installed over the base showTab');
  }
  return { problems, note: `${files.length} src files scanned, single owner intact` };
}

// ── The avatar-asset guard (b371, live audit F2) ─────────────────────────────
// `assets/avatars/_placeholder.webp` was the DEFAULT portrait — the one face a
// player with no portrait sees, and the fallback every avatar surface resolves
// to. It 404'd in production for its whole life. The file was committed, the
// path was correct, and every local server served it: the deploy is GitHub
// Pages, Pages runs Jekyll, and **Jekyll excludes every file and directory
// whose name begins with an underscore**. Confirmed against the live site —
// `/assets/avatars/_placeholder.webp` → 404 while its sibling `knight.webp`
// → 200, same directory, same commit.
//
// Two claims, because either one alone would have missed it:
//   1. EXISTENCE — every `assets/...` path referenced by index.html or src/**
//      resolves to a real file in the repo. (Catches a rename or a typo.)
//   2. NO LEADING UNDERSCORE in any shipped path segment. (Catches the class:
//      a file that exists here and cannot exist on the deploy.) `.nojekyll`
//      now ships too, but a hosting flag is a second line of defence, not the
//      contract — this guard is the contract.
//
// Scoped to `assets/avatars/**` plus any referenced path whose segment starts
// with `_`, so it is a sharp claim rather than a slow whole-tree crawl that
// would rot into a skip.
async function avatarAssetGuard() {
  const problems = [];
  const files = [join(ROOT, 'index.html')];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(js|mjs|css|html)$/.test(e.name)) files.push(p);
    }
  };
  await walk(join(ROOT, 'src'));
  if (files.length < 50) return ['only ' + files.length + ' files scanned — the guard is checking nothing'];

  const REF = /(?:^|['"`(\s])(assets\/[A-Za-z0-9_@./-]+\.(?:webp|png|jpg|jpeg|svg|gif|ico|webmanifest))/g;
  const seen = new Map();                       // path → first file that names it
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    let m;
    while ((m = REF.exec(text))) {
      const p = m[1];
      // Template-literal interpolation makes a path unresolvable statically.
      if (p.includes('${') || p.includes("' +") || p.includes('" +')) continue;
      if (!seen.has(p)) seen.set(p, relative(ROOT, f).replace(/\\/g, '/'));
    }
  }
  const avatars = [...seen.keys()].filter((p) => p.startsWith('assets/avatars/'));
  if (!avatars.length) problems.push('no assets/avatars/** reference found — the guard is checking nothing');

  for (const [p, from] of seen) {
    const underscored = p.split('/').some((seg) => seg.startsWith('_'));
    if (underscored) {
      problems.push(`${p} (referenced by ${from}) has a leading-underscore path segment — ` +
        'GitHub Pages/Jekyll will not serve it. Rename the file.');
    }
    // Existence is checked for the avatar set (the F2 surface) and for anything
    // the underscore rule already flagged.
    if (!p.startsWith('assets/avatars/') && !underscored) continue;
    if (!existsSync(join(ROOT, ...p.split('/')))) {
      problems.push(`${p} (referenced by ${from}) does not exist in the repo`);
    }
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

// ── The supply-chain guard (2026-08-23, open-beta security audit) ────────────
// A sibling of secretGuard, and it exists for the same reason: a repo-wide,
// filesystem-level check catches the class, where a per-file review catches the
// instance.
//
// THE FINDING. src/net/auth.js did `import('https://cdn.skypack.dev/@supabase/
// supabase-js')` — the module the player's EMAIL AND PASSWORD are handed to and
// which holds the session token, fetched UNPINNED from a third party with no
// integrity check (a dynamic import() cannot carry one), fanning out to five
// more fetches from that origin. Two requests to that URL seconds apart
// resolved to two DIFFERENT library versions. A compromise of that origin was a
// compromise of every Hearthrise account, and the whole suite was green.
//
// THE RULE: shipped client source may not fetch EXECUTABLE code from an origin
// we do not control. Data is a different question and is not covered here.
//
// THE ALLOWLIST is deliberately tiny and each entry states what makes it
// tolerable. An entry that cannot state that does not belong in it.
async function supplyChainGuard() {
  // A <script> TAG can carry Subresource Integrity; a dynamic import() cannot.
  // That is the entire basis on which the one exception below is allowed, so
  // the allowlist is keyed on the mechanism, not on the vendor's reputation.
  const SCRIPT_TAG_ALLOWED = [
    // Sentry crash reporting. Version-pinned URL + a committed sha384 that
    // src/observability.js assigns to script.integrity, with crossOrigin set
    // (which SRI requires). Smoke test SEC-SRI-1 asserts all three.
    'browser.sentry-cdn.com',
  ];
  // Non-executable subresources. A stylesheet cannot execute; the worst a
  // hostile fonts.googleapis.com could do is restyle the page. Listed so the
  // scan below does not have to guess at intent.
  const NON_EXECUTABLE_ALLOWED = ['fonts.googleapis.com', 'fonts.gstatic.com'];

  const SKIP_DIRS = new Set(['.git', 'node_modules', 'worktrees', '.venv', 'dist', 'build',
    '_archive', '.legacy', 'vendor']);   // vendor/ IS the fix; it is pinned + hashed by SEC-CDN-2
  const problems = [];
  const files = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(full); continue; }
      const ext = extname(e.name).toLowerCase();
      if (ext !== '.js' && ext !== '.html') continue;
      files.push(full);
    }
  }
  await walk(join(ROOT, 'src'));
  files.push(join(ROOT, 'index.html'));

  // THE CONTROL. This guard has to be able to say it looked at something. A
  // walk that silently found nothing is the always-null probe this repo has
  // shipped six of.
  if (files.length < 30) {
    problems.push(`supply-chain guard walked only ${files.length} files — it is checking nothing`);
    return problems;
  }

  // Tests are excluded from the *executable-import* rule (they legitimately
  // name hostile URLs as fixtures) but NOT from the file walk, so a real call
  // site that migrates into a test file is still visible in the diff.
  const isTest = (rel) => rel.includes('smoke-test.js') || rel.startsWith('tests/');

  for (const f of files) {
    let text;
    try { text = await readFile(f, 'utf8'); } catch { continue; }
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (isTest(rel)) continue;
    // Strip comments so the codebase can keep EXPLAINING the hole it closed
    // without the guard failing on its own documentation.
    const src = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
                    .replace(/<!--[\s\S]*?-->/g, ' ');

    const hits = [];
    for (const m of src.matchAll(/\bimport\s*\(\s*['"`](https?:\/\/[^'"`]+)/g)) hits.push(['dynamic import()', m[1]]);
    for (const m of src.matchAll(/\bfrom\s*['"`](https?:\/\/[^'"`]+)/g)) hits.push(['static import', m[1]]);
    for (const m of src.matchAll(/\.src\s*=\s*['"`](https?:\/\/[^'"`]+\.js[^'"`]*)/g)) hits.push(['script.src', m[1]]);
    for (const m of src.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)/gi)) hits.push(['<script src>', m[1]]);
    for (const m of src.matchAll(/<link[^>]+href=["'](https?:\/\/[^"']+)/gi)) hits.push(['<link href>', m[1]]);

    for (const [kind, url] of hits) {
      let host = '';
      try { host = new URL(url).host; } catch { continue; }
      if (NON_EXECUTABLE_ALLOWED.includes(host) && (kind === '<link href>')) continue;
      if (SCRIPT_TAG_ALLOWED.includes(host) && (kind === '<script src>' || kind === 'script.src')) continue;
      if (kind === 'dynamic import()' || kind === 'static import') {
        problems.push(`${rel}: ${kind} of executable code from ${host} — an import() CANNOT carry an integrity `
          + `hash, so nothing verifies what arrives. Vendor it under src/vendor/ (pinned filename) and load it `
          + `from our own origin. This is the exact hole the 2026-08-23 audit found in src/net/auth.js.`);
      } else {
        problems.push(`${rel}: ${kind} loads ${url} from ${host}, which is not on the SRI-verified allowlist. `
          + `Either add an integrity hash and allowlist the host here (with the reason), or self-host it.`);
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
      /* ⚠ b456 — DRIVEN WITH THE LOCAL BLOB LIVE, AND (4) BELOW SAYS WHY.
         Every property this guard pins — probe-once, tell-the-player-once, latch
         the dead token, count server evidence, learn the clock from a 200 — is
         implemented in `fetchWithAuthRetry`, which only the game_saves UPSERT
         goes through. Under the b455 capstone `snapshotIfDue` takes the
         `isBlobRetired()` branch and PUTs through `hr_put_client_state`
         (src/net/client-state.js putClientState), a bare fetch that touches none
         of it. So the four properties are exercised where they are implemented,
         and the ARMED gap is measured separately and reported. */
      const CAP = window.HearthriseCapstone;
      const blobWasRetired = !!(CAP && CAP.isBlobRetired && CAP.isBlobRetired());
      try { if (CAP && CAP.__setBlobRetired) CAP.__setBlobRetired(false); } catch (e) {}
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

        /* ── (4) THE ARMED WRITE, MEASURED. Same dead-token scenario, but with
           the capstone in its shipped position, so the request that goes out is
           the hr_put_client_state PUT rather than the game_saves upsert. */
        if (blobWasRetired && CAP && CAP.__setBlobRetired) {
          CAP.__setBlobRetired(null);              // back to the shipped (armed) state
          let aHits = 0, aTold = 0;
          window.fetch = () => { aHits++; return Promise.resolve(new Response('{"code":"PGRST303"}', { status: 401 })); };
          S.setClockTrusted(true);
          S.resetAuthGate({ streak: S.AUTH_DEAD_AFTER_TRIES - 1, firstAt: Date.now() - 1000, blockedUntil: 0, serverFails: 0 });
          await S.__withConfig({ ...base, onAuthError: async () => false, onAuthExpired: () => { aTold++; } },
            async () => { await S.snapshotIfDue(true, false); });
          out.armedWriteHits = aHits;
          out.armedWriteTold = aTold;
          out.armedWriteLatched = S.getAuthGate().dead;
          out.armedWriteServerFails = S.getAuthGate().serverFails;
          CAP.__setBlobRetired(false);
        }
      } finally {
        window.fetch = real;
        S.setClockTrusted(true);
        S.resetAuthGate();
        S.__resetSyncHealth();
        try { if (CAP && CAP.__setBlobRetired) CAP.__setBlobRetired(null); } catch (e) {}
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
    /* ⚠ b456 — RED ON PURPOSE UNTIL A PRODUCT FIX. The capstone replaced the
       game_saves upsert with an hr_put_client_state PUT that does NOT go through
       fetchWithAuthRetry, so the periodic save write no longer feeds the auth
       breaker at all: a 401 is not counted as server evidence, the dead-token
       latch never closes, and `onAuthExpired` never fires — which is the b331
       loop this guard exists to make impossible. (Reads still go through the
       retry wrapper, so a player may still learn from a poll; the WRITE path's
       own hardening is simply gone, and with it this guard's ability to see it.)
       Fix: route putClientState through the same auth/retry wrapper, or give it
       the same accounting. Owner: Systems Engineer. */
    if (r.armedWriteHits !== undefined) {
      if (r.armedWriteTold !== 1) {
        problems.push(`ARMED (capstone) write: the player was told ${r.armedWriteTold} times that their sign-in `
          + 'died (expected exactly 1) — hr_put_client_state bypasses fetchWithAuthRetry, so the save write no '
          + 'longer participates in the b331 auth breaker');
      }
      if (r.armedWriteLatched !== true) {
        problems.push('ARMED (capstone) write: a server-confirmed dead token did not terminate — the b331 '
          + 'infinite-retry loop can come back on the one periodic write the game still makes');
      }
      if (!(r.armedWriteServerFails >= 1)) {
        problems.push('ARMED (capstone) write: the 401 was not recorded as server evidence');
      }
    }
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
      /* b459: this guard's subject is the game_saves autosave ADDRESSING (blob →
         the active slot) — the DORMANT save path. Under the armed capstone the
         autosave ships residue via hr_put_client_state instead and this capture
         goes vacuous (the exact blindness the burn-down flagged). Drive the
         dormant path via the seam; the armed write's addressing rides
         putClientState's own pinnedSlot contract. */
      try { if (window.HearthriseCapstone && window.HearthriseCapstone.__setBlobRetired) window.HearthriseCapstone.__setBlobRetired(false); } catch (e) {}
      // Become a player with three characters, on the third — through the REAL
      // slot API (unlockSlot/switchSlot), not by writing the profile record.
      P.init();
      window.G.gems = 5000;
      // gold-arm: gems is a SERVER_OF_RECORD field, so unlockSlot's affordability
      // read is fail-closed until the balance is stamped the way hr_load does. Go
      // through the REAL applyRecord path (never poke _record) so this still proves
      // the armed read path works. Each unlockSlot debits gems (a raw client write),
      // which staleness-invalidates the stamp — so RE-STAMP (with a monotonic
      // version) before each buy, exactly as a fresh envelope would in production.
      let stampV = Date.now();
      const stampGems = () => {
        if (!window.HearthriseRecord) return;
        try {
          window.HearthriseRecord.applyRecord(window.G, {
            ok: true, version: ++stampV, now: new Date().toISOString(),
            state: { gold: window.G.gold, gems: window.G.gems },
          });
        } catch (e) {}
      };
      stampGems(); P.unlockSlot(1);
      stampGems(); P.unlockSlot(2);
      P.switchSlot(2);
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
    const seeded = await page.evaluate(() => {
      const G = window.G; if (!G) return { ok: false, why: 'no G' };
      try {
        /* b492 — STATE THE PRECONDITIONS. `G.skills[s] = …` assumed the fresh-G
           factory literal was still in G at boot. Under the blob-retire capstone
           it is not: loadLocal now forgets every server-of-record field, so
           `G.skills` is legitimately ABSENT until the server answers and the bare
           index threw. The `catch (e) {}` then swallowed it and this guard
           silently measured an EMPTY game — no inventory, no skills, no fight —
           which is exactly the kind of screen that never overflows and never
           proves anything. Same class as the bug this build fixes: a guard that
           is also silent is half a defect. */
        if (!G.inventory || typeof G.inventory !== 'object') G.inventory = {};
        if (!G.skills || typeof G.skills !== 'object') G.skills = {};
        const itemIds = Object.keys(window.ITEMS || {});
        itemIds.slice(0, 80).forEach((id, i) => { G.inventory[id] = (i % 9) + 1; });
        Object.keys(window.SKILLS_DEF || {}).forEach((s) => { G.skills[s] = 200000; });
        G.gold = 12345678; G.gems = 137;
        G.activeMonster = 'goblin'; G.monsterHp = 15; G.monsterMaxHp = 15;
        G.playerHp = 90; G.playerMaxHp = 99;
        if (typeof window.refreshAll === 'function') window.refreshAll();
        return { ok: true, items: Object.keys(G.inventory).length, skills: Object.keys(G.skills).length };
      } catch (e) { return { ok: false, why: String((e && e.message) || e) }; }
    });
    /* VACUITY FIRST. An empty screen never overflows, so a seeding failure turns
       every assertion below into a pass. */
    if (!seeded.ok || !seeded.items || !seeded.skills) {
      problems.push('the representative save did not seed ('
        + (seeded.why || JSON.stringify(seeded))
        + ') — every overflow assertion below would pass vacuously on an empty game');
    }
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
// PREFLIGHT - the MONSTER ART MANIFEST must match the filesystem.
//
// src/data/monster-art.js carries `SHIPPED`, a hand-maintained list of the
// monster ids whose portrait actually exists. It has to be hand-maintained
// because the browser cannot stat a file - but a hand-maintained list of
// what is on disk is exactly the kind of claim this repo has been burned by,
// so it is not trusted: this walks both art folders in Node and fails in
// BOTH directions.
//
//   * an id in SHIPPED with no file  -> a 404 and a broken image in the arena
//   * a file on disk not in SHIPPED  -> art was delivered and never wired,
//                                       which is how a portrait sits unused
//   * a file whose name is not a monster id -> the mis-map class of defect
//     (this repo shipped a boar named bear.png and a vampire named
//     dragon.png), caught before a player sees it
//
// The six Hunt/raid boss portraits live in the same folder and are NOT in
// MONSTERS, so they are allowlisted explicitly rather than by pattern.
// ── The cache-buster / duplicate-module preflight (b493) ────────────────────
// See tests/cache-buster-guard.mjs for the defect this closes. Two checks, in
// this order, because the second one is the interesting failure: every
// browser-loaded reference is at the CURRENT build, and no module is reachable
// at two versions (which loads it twice, with two copies of its state).
// The mutation control runs alongside — a guard asserting an absence is worth
// nothing unless it is proven to still be able to see.
async function cacheBusterPreflight() {
  let r, m;
  try {
    r = await cacheBusterGuard();
    m = await cacheBusterMutationGuard();
  } catch (e) {
    console.error(`\nCache-buster preflight FAILED — the guard threw: ${e.message}\n`);
    return 1;
  }
  if (m.problems.length) {
    console.error(`\nCache-buster preflight — THE GUARD ITSELF IS BROKEN:\n  · ${m.problems.join('\n  · ')}\n`);
    return 1;
  }
  if (r.problems.length) {
    console.error(`\nCache-buster preflight FAILED (${r.problems.length}) — run ./bump-version.sh ${r.cache}\n`
      + `  · ${r.problems.join('\n  · ')}\n`);
    return 1;
  }
  console.log(`Cache-buster preflight: ${r.note}; ${m.note}`);
  return 0;
}

async function monsterArtPreflight() {
  const mod = join(ROOT, 'src', 'data', 'monster-art.js');
  try { await stat(mod); } catch { return 0; }
  const { readdir } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  const art = await import(pathToFileURL(mod).href);
  const { MONSTERS } = await import(pathToFileURL(join(ROOT, 'src', 'data', 'monsters.js')).href);

  /* Portraits for bosses that live in src/data/bosses.js, not MONSTERS. */
  const NON_ROSTER = new Set(['crownless_wyrm', 'emberclad_tyrant', 'hollow_regent',
    'maw_below', 'sunken_choir', 'warden_long_dark']);

  const onDisk = new Set();
  for (const dir of [art.PAINTED_DIR, art.HEARTHFIRE_DIR]) {
    let files = [];
    try { files = await readdir(join(ROOT, dir)); } catch { continue; }
    files.filter((f) => f.endsWith('.png')).forEach((f) => onDisk.add(f.slice(0, -4)));
  }

  const problems = [];
  art.SHIPPED.forEach((id) => {
    if (!MONSTERS[id]) problems.push(`SHIPPED lists "${id}", which is not a monster`);
    else if (!onDisk.has(id)) problems.push(`SHIPPED lists "${id}" but ${art.pathFor(id)} does not exist (would 404)`);
  });
  const shipped = new Set(art.SHIPPED);
  onDisk.forEach((id) => {
    if (NON_ROSTER.has(id)) return;
    if (!MONSTERS[id]) problems.push(`${id}.png is on disk but "${id}" is not a monster id (mis-named delivery?)`);
    else if (!shipped.has(id)) problems.push(`${id}.png is on disk but "${id}" is not in SHIPPED — art delivered, never wired`);
  });
  /* A reviewed reject may never also be shipped. The item side learned this
     as `REJECTED_WRONG_SUBJECT` in b358: without the guard, a later pass that
     re-copies a whole delivery folder silently un-rejects the wrong art. */
  Object.keys(art.WAVE1_REJECTED || {}).forEach((id) => {
    if (shipped.has(id)) problems.push(`"${id}" is in WAVE1_REJECTED AND in SHIPPED — pick one`);
    if (onDisk.has(id)) problems.push(`"${id}" is in WAVE1_REJECTED but ${id}.png is on disk — a reject must not be delivered`);
    if (!MONSTERS[id]) problems.push(`WAVE1_REJECTED lists "${id}", which is not a monster`);
  });

  /* Every wired path must point INTO the shipped icons-bundle. */
  const wired = art.wiredIconMap();
  Object.keys(wired).forEach((id) => {
    if (!/^assets\/icons-bundle\//.test(wired[id])) problems.push(`${id} wired to an unshipped folder: ${wired[id]}`);
  });

  if (problems.length) {
    const NL = String.fromCharCode(10);
    console.error(NL + 'Monster art preflight FAILED (' + problems.length + '):' + NL
      + '  ' + problems.join(NL + '  ') + NL);
    return 1;
  }
  console.log(`Monster art preflight: ${art.SHIPPED.length} portraits wired, `
    + `${art.pendingArt().length} awaiting the batch, 0 mismatches`);
  return 0;
}

// PREFLIGHT — the ITEM ART MANIFEST must match the filesystem, both ways.
//
// The item-side twin of monsterArtPreflight(), and it exists for the same
// reason at 4x the scale: src/data/item-art.js claims 386 item ids have art,
// and the browser cannot stat a file, so that claim is data. Untrusted data.
// This walks assets/icons-bundle/hearthfire/{armour,food,items,weapons} in
// Node and fails in BOTH directions:
//
//   * an id in SHIPPED with no file          -> a 404 and a broken slot
//   * a file on disk not in SHIPPED          -> art delivered and never wired
//   * an id in SHIPPED that is not an ITEMS key -> the mis-map class of defect
//   * a wired path outside assets/icons-bundle/ -> an unshipped folder
//   * an id listed in two category folders   -> pathFor() would be ambiguous
//
// It also asserts the WITHHOLD lists stay honest: a REJECTED_WRONG_SUBJECT or
// UNRESOLVED_FILES entry must NOT also be shipped, or the whole point of
// reviewing 512 images at render size is lost the first time someone
// regenerates the manifest.
async function itemArtPreflight() {
  const mod = join(ROOT, 'src', 'data', 'item-art.js');
  try { await stat(mod); } catch { return 0; }
  const { readdir } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  const art = await import(pathToFileURL(mod).href);
  const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src', 'data', 'items.js')).href);

  const problems = [];
  const seen = new Map();          // id -> category, to catch a duplicate id
  for (const cat of art.CATEGORIES) {
    const list = art.SHIPPED[cat] || [];
    for (const id of list) {
      if (seen.has(id)) problems.push(`"${id}" is in both ${seen.get(id)}/ and ${cat}/ — pathFor() is ambiguous`);
      seen.set(id, cat);
      if (!ITEMS[id]) problems.push(`SHIPPED.${cat} lists "${id}", which is not an ITEMS key`);
    }
    let files = [];
    try { files = await readdir(join(ROOT, art.HEARTHFIRE_DIR, cat)); } catch { files = []; }
    const onDisk = new Set(files.filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)));
    list.forEach((id) => {
      if (!onDisk.has(id)) problems.push(`SHIPPED.${cat} lists "${id}" but ${art.HEARTHFIRE_DIR}${cat}/${art.fileFor(id)} does not exist (would 404)`);
    });
    const inList = new Set(list);
    onDisk.forEach((id) => {
      if (!inList.has(id)) problems.push(`${cat}/${id}.png is on disk but not in SHIPPED.${cat} — art delivered, never wired`);
    });
  }

  const wired = art.wiredIconMap();
  Object.keys(wired).forEach((id) => {
    if (!/^assets\/icons-bundle\//.test(wired[id])) problems.push(`${id} wired to an unshipped folder: ${wired[id]}`);
    if (art.pathFor(id) !== wired[id]) problems.push(`${id}: pathFor() and wiredIconMap() disagree`);
  });
  /* A withheld file must never also be shipped. */
  [...art.REJECTED_WRONG_SUBJECT, ...art.UNRESOLVED_FILES, ...(art.WITHHELD_BESPOKE_ART || [])].forEach((key) => {
    const [cat, id] = String(key).split('/');
    if ((art.SHIPPED[cat] || []).indexOf(id) >= 0) problems.push(`"${key}" is withheld AND shipped — pick one`);
  });

  if (problems.length) {
    const NL = String.fromCharCode(10);
    console.error(NL + 'Item art preflight FAILED (' + problems.length + '):' + NL
      + '  ' + problems.join(NL + '  ') + NL);
    return 1;
  }
  const n = art.CATEGORIES.reduce((a, c) => a + (art.SHIPPED[c] || []).length, 0);
  const uncovered = Object.keys(ITEMS).filter((id) => !art.pathFor(id)).length;
  console.log(`Item art preflight: ${n} item icons wired, ${art.REJECTED_WRONG_SUBJECT.length} withheld (wrong subject), `
    + `${art.UNRESOLVED_FILES.length} unresolved filenames, ${uncovered} items still on old art/emoji, 0 mismatches`);
  return 0;
}

/* The art-batch colour table (tools/lib/art-palette.mjs) + its deriver. Guards
   the one failure that is invisible until ~600 funded images have been paid for:
   an item whose subject line names a colour the table does not know is generated
   with the STYLE ANCHOR's own palette, which is the salmon-pink-iron defect
   art-direction-picker.md §0.10c exists to fix. Cheap — no browser, no API. */
async function artPalettePreflight() {
  const mod = join(ROOT, 'tests', 'art-palette.mjs');
  try { await stat(mod); } catch { return 0; }
  const { pathToFileURL } = await import('node:url');
  const { artPaletteGuard } = await import(pathToFileURL(mod).href);
  let problems = [];
  try { problems = await artPaletteGuard(); } catch (e) { problems = [`guard threw: ${e.message}`]; }
  if (problems.length) {
    const NL = String.fromCharCode(10);
    console.error(NL + 'Art palette preflight FAILED (' + problems.length + '):' + NL
      + '  ' + problems.join(NL + '  ') + NL);
    return 1;
  }
  console.log('Art palette preflight: 597/597 subject lines mapped, tier identity distinct, strip manifest joins');
  return 0;
}

/* COMBAT-UI-17 — the painted-backdrop wave. Filesystem + CSS-string guard
   (see tests/background-wave.mjs header for the three things it proves).
   Cheap — no browser. */
async function backgroundWavePreflight() {
  const mod = join(ROOT, 'tests', 'background-wave.mjs');
  try { await stat(mod); } catch { return 0; }
  const { pathToFileURL } = await import('node:url');
  const { backgroundWaveGuard } = await import(pathToFileURL(mod).href);
  let r;
  try { r = backgroundWaveGuard(); } catch (e) { r = { ok: false, fails: [`guard threw: ${e.message}`] }; }
  if (!r.ok) {
    const NL = String.fromCharCode(10);
    console.error(NL + 'Background wave preflight FAILED (' + r.fails.length + '):' + NL
      + '  ' + r.fails.join(NL + '  ') + NL);
    return 1;
  }
  console.log('Background wave preflight: 12 plates shipped (bg_combat_demon, bg_board_planks rejected at QC), all classes accounted for, no stacked dungeon.jpg layers');
  return 0;
}

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

// The bounty monster→tier catalogue is generated from src/data/monsters.js. A
// stale one credits a bounty at the wrong tier's reward, so --check gates it.
async function bountyMonsterPreflight() {
  const gen = join(ROOT, 'tools', 'gen-bounty-monsters.mjs');
  try { await stat(gen); } catch { return 0; }
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [gen, '--check'], { encoding: 'utf8' });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status === 0) { console.log(`Bounty catalogue preflight: ${out || 'in sync'}`); return 0; }
  console.error(`\nBounty catalogue preflight FAILED — src/data/monsters.js no longer matches the generated SQL.\n${out}\n`);
  return 1;
}

// The farm-gate catalogues (hr_crops.regrow_limit, hr_crop_plot_tier,
// hr_plot_tier, hr_farm_yield_perk) are generated from src/core/farm.js +
// src/data/gathering.js + perks + companions. A stale one lets the server gate
// a plant on the wrong plot tier, price a deed upgrade wrong, pay the wrong
// farmYield perk, or (worst) revert the finite-perennial cap — so --check gates it.
async function farmCataloguePreflight() {
  const gen = join(ROOT, 'tools', 'gen-farm-catalogues.mjs');
  try { await stat(gen); } catch { return 0; }
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [gen, '--check'], { encoding: 'utf8' });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status === 0) { console.log(`Farm catalogue preflight: ${out || 'in sync'}`); return 0; }
  console.error(`\nFarm catalogue preflight FAILED — src/core/farm.js / gathering.js no longer matches the generated SQL.\n${out}\n`);
  return 1;
}

// The raid-chest reward catalogue (hr_hunt_boss_reward) is generated from
// src/data/raid-bosses.js. It is what raid_claim reads to mint the Hunt chest
// materials + signature into player_inventory. A stale one mints the wrong
// materials (real player item gain/loss under the inventory flip), so --check
// gates it exactly like the farm catalogues.
async function raidBossRewardPreflight() {
  const gen = join(ROOT, 'tools', 'gen-raid-boss-rewards.mjs');
  try { await stat(gen); } catch { return 0; }
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [gen, '--check'], { encoding: 'utf8' });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status === 0) { console.log(`Raid boss-reward preflight: ${out || 'in sync'}`); return 0; }
  console.error(`\nRaid boss-reward preflight FAILED — src/data/raid-bosses.js no longer matches the generated SQL.\n${out}\n`);
  return 1;
}

// PREFLIGHT — the invite gate is real and the client presents a code correctly.
// On 2026-08-23 production held 8 accounts against 3 consumed invites: the gate
// was three client-side courtesies and account-gate.js — the actual front door
// — had no invite field at all. Nothing in this suite could see it, because
// nothing asserted a NEGATIVE about signup. tests/beta-invite-gate.mjs does;
// its static half needs no network and runs here. Its --live half (real POST to
// /auth/v1/signup, trigger + auth-hook registration) needs a token CI does not
// have and is run by hand after any change to auth config, auth.users or
// beta_invites.
//
// b46x: the beta went OPEN, so the client half now asserts "a code travels when
// given, and NOTHING travels when not" rather than "a code always travels". The
// server half is unchanged.
async function betaInviteGatePreflight() {
  const guard = join(ROOT, 'tests', 'beta-invite-gate.mjs');
  try { await stat(guard); } catch { return 0; }
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [guard], { encoding: 'utf8' });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status === 0) {
    console.log(`Beta invite gate preflight: ${out.split('\n').pop()}`);
    return 0;
  }
  console.error(`\nBeta invite gate preflight FAILED — the invite gate or the client's presentation of a code has drifted.\n${out}\n`);
  return 1;
}

// PREFLIGHT — SECURITY CONDITION S5: src/data/items.js ⊆ hr_items.
//
// The check above regenerates the SQL and compares it to the file, so both
// sides come out of the same generator. THIS one reads the two artefacts
// independently — the ids by importing the ESM module, the rows by parsing the
// shipped .sql as text — because under the absolute envelope an item the server
// has never heard of is omitted from every envelope, and omission means ZERO.
// A new item that reaches clients before its catalogue row lands would be
// deleted from every bag that holds it at the first settle. Full reasoning in
// tests/items-catalogue.mjs; mutation-proven by ITEMS-CATALOGUE-GUARD.
async function itemsCataloguePreflight() {
  const { problems, note } = await itemsCatalogueGuard();
  if (problems.length) {
    console.error(`\nItem catalogue preflight (S5) FAILED:\n  · ${problems.join('\n  · ')}\n`);
    return 1;
  }
  /* ITEMS-CATALOGUE-GUARD — the guard graded, not merely run. See the block in
     tests/items-catalogue.mjs: a check that cannot demonstrate it sees failure
     is treated as broken here, not as a pass. */
  const m = await itemsCatalogueMutationGuard();
  if (m.problems.length) {
    console.error(`\nItem catalogue preflight (S5) — THE GUARD ITSELF IS BROKEN:\n  · ${m.problems.join('\n  · ')}\n`);
    return 1;
  }
  console.log(`Item catalogue preflight (S5): ${note}; ${m.note}`);
  return 0;
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
    /* b354. THE PRICE hr_unlock_buy CHARGES. Until the generated offer table is
       regenerated and re-applied, the server charges the OLD price for the NEW
       shop row — and, worse, enforces the OLD property-tier gate. */
    ['gen-unlock-offers.mjs', 'Unlock offer preflight',
      'a price, a prerequisite or the eligibility predicate moved and the generated offer '
      + 'catalogue no longer matches — hr_unlock_buy charges out of that table'],
    /* slices 2 & 3. The gold-spend ladders (worker_hire/farm_land/bank) are
       generated from src/data/gold-ladders.js and drift-guarded against the live
       game data they mirror (workers.js HIRE_COSTS, homestead.js TIERS,
       legacy.js BANK_SPACE + PLOT_BUILDINGS). A balance change to any of those
       without a matching manifest edit — or a hand-edit of the migration —
       fails here, because hr_unlock_buy charges out of that seeded table. */
    ['gen-gold-ladders.mjs', 'Gold-ladder preflight',
      'a gold-spend ladder price, its tier gate or the bank curve moved and the generated '
      + 'migration no longer matches the game data — hr_unlock_buy charges out of that table'],
    /* slice 4. The companion unlocks (companion.*) are generated from
       src/data/companion-unlocks.js, drift-guarded against src/data/companions.js
       (price + skill req per shop companion), AND the migration's hr_unlock_buy is
       DERIVED from 2026-08-16-unlock-buy.sql plus one skill gate. A companion
       price/skill edit, a new shop companion, OR a hand-edit of the restated body
       fails here — hr_unlock_buy both charges out of that table and runs that body. */
    ['gen-companion-unlocks.mjs', 'Companion-unlock preflight',
      'a companion price or skill requirement moved, a shop companion was added, or the derived '
      + 'hr_unlock_buy is no longer unlock-buy.sql’s body plus the one declared skill gate'],
    /* NON-SHOP companion grants. hr_companion_grant gates out of hr_companion_grants,
       the allowlist generated DIRECTLY from src/data/companions.js. A non-shop
       companion added/removed, a source kind or the dragon_egg hatch item changed
       without regenerating — or a hand-edit of the migration — fails here, because the
       RPC refuses anything not in that catalogue and the companion:<id> hr_unlocks
       ladders must match the grantable set. */
    ['gen-companion-grants.mjs', 'Companion-grant preflight',
      'a non-shop companion was added/removed, a source kind or the dragon_egg hatch item moved, '
      + 'or the generated companion-grant migration was hand-edited'],
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
    /* Phase 0 of live settlement. The SAME rule applied to the two biggest
       bodies in the repo: 2026-08-17-fight-carry.sql restates the WHOLE of
       hr_apply (63 KB) and hr_state_of, and a hand-edit between the anchors is
       how b346's ownership flag, b348's tool_carry key, the S5 accrued_to stamp
       and the 12M XP clamp silently disappear from a body nobody reads. */
    ['derive-fight-carry.mjs', 'fight-carry derivation',
      'the restated hr_apply / hr_state_of in 2026-08-17-fight-carry.sql are no longer '
      + 'gem-daily-budget\'s and tool-carry\'s bodies plus this file\'s declared patches'],
    /* Phase 2, part 1. The SAME rule again, one link further down the chain:
       2026-08-18-equip-release-codes.sql restates the WHOLE of hr_apply (now
       69 KB) to add five codes to one array. Everything the two links above
       protect lives in that body, so a hand-edit here deletes it just as
       thoroughly and with a much smaller-looking diff. */
    ['derive-equip-release.mjs', 'equip-release derivation',
      'the restated hr_apply in 2026-08-18-equip-release-codes.sql is no longer fight-carry’s '
      + 'body plus this file’s ONE declared patch'],
    /* b370, the `unknown_skill` incident's permanent fix. The SAME rule one
       more link down: 2026-08-18-skill-row-upsert.sql restates the WHOLE of
       hr_apply (70 KB) to turn six lines of XP grant into a catalogue check
       plus an upsert. Everything the three links above protect lives in that
       body — including b366's five release codes, which a hand-edit would drop
       while the diff still looked like it was about skills. */
    ['derive-skill-row-upsert.mjs', 'skill-row-upsert derivation',
      'the restated hr_apply in 2026-08-18-skill-row-upsert.sql is no longer equip-release-codes’ '
      + 'body plus this file’s ONE declared patch'],
    /* ELEMENTS/ENCHANTING v1. The SAME rule, one link further: 2026-08-18-
       enchant.sql restates the WHOLE of hr_apply (to add the enchant delta key
       + block + stamp + ledger kind + release code) AND hr_state_of (to return
       the enchant field), so a hand-edit deletes everything the four links above
       protect. Both bodies are GENERATED by tools/derive-enchant.mjs. */
    ['derive-enchant.mjs', 'enchant derivation',
      'the restated hr_apply / hr_state_of in 2026-08-18-enchant.sql are no longer '
      + 'skill-row-upsert’s and fight-carry’s bodies plus this file’s declared enchant patches'],
    /* Live-progress Slices 2+3. The SAME rule, one link further: 2026-08-21-
       streak-state.sql restates the WHOLE of hr_apply (to advance the daily
       settle streak from now() on an accrual delta) AND hr_state_of (to project
       the streak and EXCLUDE the ev:kill_monster:% + ev:loot:% populations from
       the generic envelope), so a hand-edit deletes everything the five links
       above protect. Both bodies are GENERATED by tools/derive-live-progress.mjs. */
    ['derive-live-progress.mjs', 'live-progress streak/state derivation',
      'the restated hr_apply / hr_state_of in 2026-08-21-streak-state.sql are no longer '
      + 'the enchant body plus this file’s declared streak + prefix-exclusion patches'],
    /* inventory-flip Step B1. The SAME rule, one link further: 2026-08-24-
       inventory-complete.sql restates the WHOLE of hr_state_of to add ONE additive
       top-level `inventory_complete` boolean — the server-stamped completeness
       signal the dormant absolute-replace flip (src/net/accrue.js) waits on. A
       hand-edit between the anchors would delete everything the six links above
       protect (streak, enchant, fight, the two prefix exclusions) with a diff
       that looks like it is only about inventory. GENERATED by
       tools/derive-inventory-complete.mjs from the streak-state body. */
    ['derive-inventory-complete.mjs', 'inventory-complete signal derivation',
      'the restated hr_state_of in 2026-08-24-inventory-complete.sql is no longer '
      + 'the streak-state body plus this file’s ONE declared inventory_complete patch'],
    /* Bounty-Marks server-of-record. The SAME rule, one link further:
       2026-08-26-marks-record.sql restates the WHOLE of hr_state_of (to project the
       `marks` scalar) AND hr_rpc_gate (to admit the hr_bounty_spend bucket) from the
       workers body, so a hand-edit between the anchors deletes everything every link
       above protects. GENERATED by tools/derive-marks.mjs from 2026-08-25-workers.sql. */
    ['derive-marks.mjs', 'bounty-marks record derivation',
      'the restated hr_state_of / hr_rpc_gate in 2026-08-26-marks-record.sql are no longer '
      + 'the workers body plus this file’s declared marks-projection + spend-bucket patches'],
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

/* ── MUTATION RESIDUE RECOVERY — RUNS BEFORE EVERYTHING ELSE ──────────────
   Two of this repo's harnesses (`artisan-accrual.mjs --selftest`,
   `live-settlement.mjs --mutate`) plant real defects in real production files
   and restore them afterwards. On 2026-08-16 one of those runs was killed by a
   timeout partway through and the restore never ran: `bag[id] = have - take;`
   in the deployed accrual engine stayed replaced by a comment — the artisan
   simulation stopped debiting its inputs, i.e. an ITEM-DUPLICATION BUG sitting
   in the working tree, found only because a reviewer read the diff.

   ⚠ A SIGNAL HANDLER DOES NOT CLOSE THIS ON WINDOWS. Measured: Node cannot trap
     SIGTERM there — the handler is registered and never called — and a harness
     timeout IS a SIGTERM. So the durable mechanism is a JOURNAL written to disk
     BEFORE the first mutation, and this is the thing that reads it.

   It runs first, unconditionally, and it SHOUTS rather than healing silently:
   a leaked mutation means a run died, and that is worth knowing even after it
   has been put right. It cannot fail the suite for a clean tree — with no
   journal it does nothing at all. */
const recoverMutationResidue = async () => {
  const { recoverJournal } = await import('./mutation-safety.mjs');
  const fixed = recoverJournal();
  if (fixed.length) {
    console.log(`\n⚠ Mutation residue recovered — ${fixed.length} production file(s) were left `
      + 'MUTATED by an interrupted mutation harness and have been restored from the journal:');
    for (const f of fixed) console.log(`    ${f}`);
    console.log('  Check `git diff` before committing; the run that died proved nothing.\n');
  }
};

// PREFLIGHT — no batch recipe may be a gold faucet.
//
// 2026-08-18: `iron_arrows` kept a v:60 book value the b343 ammo ladder had
// rebased to 1-12, and `vendorPriceOf` pays non-raw items FULL book value —
// 16.7x input, ~2.9M gold/hour, enough for ONE player to exhaust the
// 25,000,000/day server-wide inflow budget in 8.6 hours through the
// server-authoritative `vendor_sell` verb. Pure data, so it runs before the
// browser starts. Mutation-proven; see the header of recipe-yield-guard.mjs for
// why a plain "outputQty <= 50" cap would have missed this and failed eight
// correct recipes.
async function recipeYieldPreflight() {
  const { problems, note } = await recipeYieldGuard();
  if (problems.length) {
    console.error(`\nRecipe faucet preflight FAILED:\n  · ${problems.join('\n  · ')}\n`);
    return 1;
  }
  const m = await recipeYieldMutationGuard();
  if (m.problems.length) {
    console.error(`\nRecipe faucet preflight — THE GUARD ITSELF IS BROKEN:\n  · ${m.problems.join('\n  · ')}\n`);
    return 1;
  }
  console.log(`Recipe faucet preflight: ${note}; ${m.note}`);
  return 0;
}

// PREFLIGHT — the Quartermaster trade ledger, driven as a pure module.
//
// The browser suite's B372-SCRIP-1 drives the real `applyEnvelopeState`
// end-to-end; this runs the unit-level properties that are only cheap to state
// exhaustively — above all the 36-shape fuzz asserting the ledger can never
// mint. See the header of tests/item-ledger.mjs.
async function itemLedgerPreflight() {
  const { spawnSync } = await import('node:child_process');
  const f = join(ROOT, 'tests', 'item-ledger.mjs');
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`\nItem-ledger preflight FAILED:\n${r.stdout || ''}${r.stderr || ''}\n`);
    return 1;
  }
  const passes = (r.stdout.match(/ PASS /g) || []).length;
  console.log(`Item-ledger preflight: ${passes} assertions green (mint fuzz included)`);
  return 0;
}

const run = async () => {
  await recoverMutationResidue();
  /* FIRST, AND IT COSTS ~200ms. A stale `?v=` makes a module load TWICE with two
     copies of its state, and the symptom is not "stale code" — it is a scatter
     of unrelated-looking test failures across arm seams, prediction ledgers and
     inventory (b493: 19 of them, on an assembly whose every branch was green).
     Running it before the browser starts turns a two-hour root-cause hunt into
     one line naming the file. */
  if (await cacheBusterPreflight()) process.exit(1);
  if (await monsterArtPreflight()) process.exit(1);
  if (await itemArtPreflight()) process.exit(1);
  if (await artPalettePreflight()) process.exit(1);
  if (await backgroundWavePreflight()) process.exit(1);
  if (await catalogueDriftPreflight()) process.exit(1);
  if (await bountyMonsterPreflight()) process.exit(1);
  if (await farmCataloguePreflight()) process.exit(1);
  if (await raidBossRewardPreflight()) process.exit(1);
  if (await betaInviteGatePreflight()) process.exit(1);
  if (await itemsCataloguePreflight()) process.exit(1);
  if (await recipeYieldPreflight()) process.exit(1);
  if (await itemLedgerPreflight()) process.exit(1);
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
    /* ── The companion perk-channel guard (2026-08-20-companion-model) ───────
       The equipped companion's passive bonus is server-owned and byte-parity-
       safe: a seeded fight with a companion equipped scores BYTE-IDENTICAL away
       vs live (it draws no rng and pays on the permanent channel), the level
       curve matches the client, and the degrade path is inert. This is the
       AWAY-1 obligation for the companion layer. */
    const companionProblems = await companionPerkGuard();
    if (companionProblems.length) {
      console.log('\nCompanion perk guard (away == live with a pet equipped) — FAILED:');
      for (const p of companionProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nCompanion perk guard — a seeded fight with a companion equipped is byte-identical '
        + 'away vs live; the passive bonus is server-owned and draw-free.');
    }
    /* ── The companion XP writer guard (dormant server-of-record) ────────────
       The WRITE half of the companion channel: the accrual engine credits the
       equipped pet a `stat companion_xp:<id>` op for its role-matched actions
       (per kill / per gather-yield / per produce — the awardXpForRole basis),
       draw-free so away == live, clamped to the L30 cap, and INERT while the arm
       switch is dormant. The projection (hr_perks_of) already reads that row. */
    const companionXpProblems = companionXpGuard();
    if (companionXpProblems.length) {
      console.log('\nCompanion XP writer guard — FAILED:');
      for (const p of companionXpProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nCompanion XP writer guard — the engine credits the equipped pet per role-matched '
        + 'action (client parity), byte-identical away vs live, capped; dormant emits nothing.');
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

    /* ── The daily/quest counter guard (b353, Designer Ruling 3.1) ──────
       "An away night that pays XP and items but leaves 'Slay 10 monsters' at
       0/10 reads as 'my night didn't count'." The two fx handlers core has
       always called and the accrual engine never listened to, wired — and
       proven end to end on a real PostgreSQL with the whole migration chain
       applied: a seeded 2h combat night advances 'ev:kill_any' by EXACTLY the
       kill count, a gather night advances 'ev:gather' by the YIELD (tool
       doubles included), and — the load-bearing half — neither touches the
       other's counter, which is the only thing that distinguishes this model
       from a handler that increments everything.

       It also pins the day key to `public.hr_utc_day_key` (whose FM format
       strips leading zeros, so a hand-written ISO slice would be a second
       day-key universe), binds the event vocabulary to BOTH sides — core's
       emit sites and legacy.js's authored QUEST_DEFS/DAILY_TASK_POOL — and
       executes the retention claim: hr_progress_prune sweeps the daily
       population and leaves the lifetime one.
       `node tests/goal-counters.mjs --mutate` plants nine real defects, six in
       the accrual engine and three in src/core/goals.js. */
    const goalProblems = await goalCountersGuard();
    if (goalProblems.length) {
      console.log('\nGoal counters guard (an away night moves the dailies) — FAILED:');
      for (const p of goalProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nGoal counters guard — an away combat night moves \'slay N\' by exactly the kill '
        + 'count, a gather night by the yield, and neither touches the other\'s counter.');
    }

    /* ── inventory-flip Step B1: the server `inventory_complete` signal ──────
       Data-loss-critical: a wrong TRUE lets the dormant absolute-replace flip
       (src/net/accrue.js) DELETE a legit crafted/looted stack. Proves the real
       hr_state_of emits inventory_complete only when the settle loop has no
       pending window (TRUE idle/drained, FALSE open-window/no-active_since),
       pins the SQL threshold to accrual.js ACCRUE_MIN_MS, and asserts the client
       arm gate still refuses without an observed complete envelope. */
    const invCompleteProblems = await inventoryCompleteGuard();
    if (invCompleteProblems.length) {
      console.log('\nInventory-complete signal guard (B1) — FAILED:');
      for (const p of invCompleteProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nInventory-complete signal guard — hr_state_of stamps inventory_complete only on a '
        + 'drained pointer, the 60s threshold is pinned to ACCRUE_MIN_MS, and the flip cannot arm '
        + 'against a server that does not emit it.');
    }

    /* ── The goal catalogue drift guard (b414) ──────────────────────────
       The DAILY-TASK + QUEST gold payouts are now server-credited
       (hr_claim_daily / hr_claim_quest). This binds the reward catalogue across
       its three homes — src/data/goal-catalogue.js, legacy.js
       QUEST_DEFS/DAILY_TASK_POOL, and the migration SQL — so a player can never
       be shown one gold number and credited another, the server selection can
       never offer a different set than the client, and no gold-bearing goal can
       silently lose its payout under arm. */
    const catProblems = await goalCatalogueDriftGuard();
    if (catProblems.length) {
      console.log('\nGoal catalogue drift guard — FAILED:');
      for (const p of catProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nGoal catalogue drift guard — catalogue, legacy.js authored rows, and the credit '
        + 'RPC SQL all agree on every daily/quest goal + reward + the selection pool order.');
    }

    /* ── The collection-milestone + renown-rank claim drift guard ──────────
       The COLLECTION-LOG milestone and RENOWN rank gold/gem payouts are now
       server-credited (hr_claim_milestone / hr_claim_rank). This binds each
       reward catalogue across its three homes — src/data/{collection-milestones,
       renown-ranks}.js, the authored client rows (collection-log.js MILESTONES /
       renown.js RANKS), and the migration SQL — plus the hunterAll threshold to
       the monster-catalogue size, so a player can never be shown one reward and
       credited another, nor a milestone/rank threshold drift from what verifies it. */
    const crProblems = await collectionRenownClaimDriftGuard();
    if (crProblems.length) {
      console.log('\nCollection/renown claim drift guard — FAILED:');
      for (const p of crProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nCollection/renown claim drift guard — milestone + rank catalogues, client rows, '
        + 'and the credit RPC SQL all agree on every threshold + gold + gems.');
    }

    /* ── The bounty economy drift guard (server-owned bounty turn-in) ─────
       The kill-driven bounty (type 'cull') turn-in now credits server-owned
       gold + Bounty Marks (hr_accept_bounty / hr_claim_bounty). This binds the
       reward, required-kill range and tier-unlock ladder in src/core/bounty.js
       to the CASE constants the migration credits from, so a player can never be
       shown one bounty reward and paid another. The monster→tier catalogue is
       bound separately by the generator's --check below. */
    const bntProblems = await bountyDriftGuard();
    if (bntProblems.length) {
      console.log('\nBounty drift guard — FAILED:');
      for (const p of bntProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nBounty drift guard — bounty.js reward/range/tier tables and the credit RPC SQL agree.');
    }

    /* ── b497 · THE DIFFICULTY SCALES THE KILL COUNT (designer ruling) ─────
       The b489 inversion: bountyCount read (type, tier) only, so the board's
       EASY and NORMAL slots drew from the same range while the reward table
       already paid easy 0.85x — Easy was strictly the best-paying contract on
       the board. The ruling scales the COUNT (0.90/1.00/1.20/1.50) so
       gold-per-kill rises with commitment. The guard above binds the tables
       statically; this one asks the DATABASE, because both sides of a static
       comparison are JavaScript and a Postgres/JS rounding disagreement would
       be invisible to it. It replays the chain into PGlite and drives a real
       signed-in accept at every difficulty: the range round-trips, an
       out-of-range request clamps to the SCALED bounds, 'elite' is still
       refused (Security 2026-08-23), and gold-per-kill is monotonic at all six
       tiers. `--selftest` plants six real defects; every one must read RED. */
    const bntCountProblems = await bountyDifficultyCountGuard();
    if (bntCountProblems.length) {
      console.log('\nBounty difficulty count — FAILED:');
      for (const p of bntCountProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nBounty difficulty count — Postgres and bounty.js agree on all 24 scaled ranges '
        + 'and the first-contract bracket; the accept clamps to the scaled bounds, elite stays '
        + 'refused, and gold-per-kill rises with difficulty at every tier.');
    }

    /* ── The kill-credit plausibility-cap drift guard (bug #5) ──────────────
       hr_bounty_kill_cap reproduces src/core/kill-time.js in SQL so
       hr_credit_kills can clamp a client's claimed kills to the physical maximum
       a character of its level could make. Binds the integer coefficients + the
       migration's GATE(c) anchors to the core model so the two runtimes cannot
       diverge (a divergence = an honest kill refused, or a forged one accepted). */
    try {
      const { killTimeDriftGuard } = await import('./kill-time-drift.mjs');
      const r = await killTimeDriftGuard();
      console.log(`\nKill-time drift guard — ${r.checks}`);
    } catch (e) {
      console.log('\nKill-time drift guard — FAILED:');
      for (const p of (e.problems || [e.message])) console.log(`  ✗ ${p}`);
      exitCode = 1;
    }

    /* ── The combat-XP cap drift guard (bug #5 root pt2) ─────────────────────
       Binds src/core/combat-xp-cap.js to hr_combat_xp_cap in
       2026-08-31-combat-xp-credit.sql, so the ATTENDED-combat-XP credit's per-skill
       physical-max ceiling agrees bit-for-bit across Node and Postgres — a
       divergence would refuse an honest gain (the level keeps reverting) or accept
       a forged one (a leaderboard the cap should have bounded). */
    try {
      const { combatXpCapDriftGuard } = await import('./combat-xp-cap-drift.mjs');
      const r = await combatXpCapDriftGuard();
      console.log(`\nCombat-XP cap drift guard — ${r.checks}`);
    } catch (e) {
      console.log('\nCombat-XP cap drift guard — FAILED:');
      for (const p of (e.problems || [e.message])) console.log(`  ✗ ${p}`);
      exitCode = 1;
    }

    /* ── The combat-XP settle watermark-split guard (bug #5 root pt2) ────────
       Proves the accrual engine credits combat XP only for the window at/after
       combat_xp_accrued_to (so a live credit is not double-paid by the settle) AND
       that with no watermark it is byte-identical to the pre-split behaviour (the
       AWAY-1 parity property). */
    try {
      const { combatXpSettleSplitGuard } = await import('./combat-xp-settle-split.mjs');
      const r = await combatXpSettleSplitGuard();
      console.log(`\nCombat-XP settle-split guard — ${r.checks}`);
    } catch (e) {
      console.log('\nCombat-XP settle-split guard — FAILED:');
      for (const p of (e.problems || [e.message])) console.log(`  ✗ ${p}`);
      exitCode = 1;
    }

    /* ── The Bounty-Marks record guard (server-of-record slice) ─────────────
       Proves the CLIENT half of 2026-08-26-marks-record.sql: arm OFF is a no-op
       (marksOf reads G.bountyHunter.marks); arm ON reads the server's record and
       FAIL-CLOSES to UNKNOWN before an envelope, refuses over-spend, and never
       lets a forged local marks value be vouched for. The server half is proven
       by the migration's own §5 self-check on apply. */
    const { marksRecordGuard } = await import('./marks-record.mjs');
    const marksProblems = await marksRecordGuard();
    if (marksProblems.length) {
      console.log('\nBounty-Marks record guard — FAILED:');
      for (const p of marksProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nBounty-Marks record guard — dormant no-regression + armed server-read/fail-closed/over-spend-refused.');
    }

    /* ── The Rested record guard (server-of-record slice, b437) ─────────────
       Proves the CLIENT half of 2026-08-22-rested-record.sql: arm OFF is a no-op
       (restedOf reads G.restedXp/G.restedAt); arm ON reads the server's record,
       FAIL-CLOSES to UNKNOWN before an envelope, COUPLES the count + watermark
       (both known or neither), never vouches for a forged local value, and treats
       a zero-epoch watermark as UNKNOWN rather than banking at 1970. The server
       half — whole-quanta accrual, exact watermark advance, idempotent replay,
       cap + monotone clamps — is proven by the migration's own §4 self-check. */
    const { restedRecordGuard } = await import('./rested-record.mjs');
    const restedProblems = await restedRecordGuard();
    if (restedProblems.length) {
      console.log('\nRested record guard — FAILED:');
      for (const p of restedProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nRested record guard — dormant no-regression + armed server-read/fail-closed/coupled/watermark-safe.');
    }

    /* ── The Rooms record guard (server-of-record slice, b431) ──────────────
       Proves the CLIENT half of the rooms record: arm OFF is a no-op (roomsMap
       reads G.rooms byte-for-byte); arm ON reads the server's room map (shaped
       from the `progress` array by pickRooms), FAIL-CLOSES to a SAFE EMPTY MAP
       before an envelope — never undefined (so Object.values never throws at
       boot), never a forged local rung — treats an absent progress array as
       UNKNOWN and a present-but-roomless one as KNOWN-empty, and never vouches
       for a client-overwritten map. This is the arm-blocker that stops an
       UNKNOWN rooms state from crashing boot or granting an unconfirmed room. */
    const { roomsRecordGuard } = await import('./rooms-record.mjs');
    const roomsProblems = await roomsRecordGuard();
    if (roomsProblems.length) {
      console.log('\nRooms record guard — FAILED:');
      for (const p of roomsProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nRooms record guard — dormant no-regression + armed server-read/fail-closed-empty/no-forged-room/never-throws.');
    }

    /* ── The Equipment record guard (worn-set read side, b446) ──────────────
       Proves the CLIENT half of the b433 equipment record: src/net/record.js +
       src/net/equipment-record.js read the worn set from the server record under
       arm and fail-close to a SAFE EMPTY MAP — Object.values/keys/entries/for-in
       and equippedItem NEVER throw across UNKNOWN / known-empty / absent-envelope,
       and a forged/overwritten G.equipment never crosses (the b347 fingerprint
       catches it). DORMANT leaves G.equipment byte-for-byte. This is the last
       arm-blocker that stops an UNKNOWN equipment state from crashing boot/combat
       or granting unconfirmed gear. */
    const { equipmentRecordGuard } = await import('./equipment-record.mjs');
    const equipmentProblems = await equipmentRecordGuard();
    if (equipmentProblems.length) {
      console.log('\nEquipment record guard — FAILED:');
      for (const p of equipmentProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nEquipment record guard — dormant no-regression + armed server-read/fail-closed-empty/no-forged-item/never-throws.');
    }

    /* ── The Bank item-store guard (bank-store slice, b438) ─────────────────
       Proves the CLIENT half of 2026-08-27-bank-store.sql: reconcileBank folds
       the server-owned bank (res.bank) through the SAME serverOwnedItem carve-out
       as the bag, so arming the inventory flip cannot strand/delete a banked item.
       DORMANT (unarmed / incomplete envelope) leaves G.bank UNTOUCHED; ABSOLUTE
       owns the server truth for OWNED ids (omitted = removed), never deletes/lowers
       EXCLUDED ids, and preserves the bank-SPACE counters. The server half — atomic
       deposit/withdraw, clamp, no-dupe, no-negative, idempotent replay — is proven
       by the migration's own §6 self-check on apply. */
    const { bankStoreGuard } = await import('./bank-store.mjs');
    const bankProblems = await bankStoreGuard();
    if (bankProblems.length) {
      console.log('\nBank item-store guard — FAILED:');
      for (const p of bankProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nBank item-store guard — dormant leaves G.bank untouched; absolute owns server truth, keeps excluded, preserves space counters.');
    }

    /* ── The companion-roster reconstruction guard (blob-retire blocker) ─────
       Proves the CLIENT half of 2026-08-22-companion-record.sql: under the
       blob-retire arm accrue.js reconcileCompanions rebuilds G.companions.
       {ownedIds,xp,equipped} from the envelope's `companions` projection (owned ∪
       fox, per-id xp, equipped-safety) instead of ensureCompanionState defaulting
       every player to the starter fox with 0 XP. DORMANT it is a pure no-op (the
       client keeps authoring the roster); ARMED-BEFORE-THE-ENVELOPE is fail-closed
       (empty roster, never a fox-reset that could persist); awardCompanionXp is
       gated off under arm (the server owns companion XP). The server half — the
       full roster projection — is proven by the migration's own §2 self-check. */
    const { companionsRecordGuard } = await import('./companions-record.mjs');
    const compProblems = await companionsRecordGuard();
    if (compProblems.length) {
      console.log('\nCompanion-record guard — FAILED:');
      for (const p of compProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nCompanion-record guard — dormant no-op; armed rebuild from envelope (not fox-reset); fail-closed pre-envelope; xp-award gated off under arm.');
    }

    /* ── The arm-homing guard (strand-audit mechanical net) ──────────────────
       BLOB_RETIRED is the union of every arm: any persisted field homed by no
       mechanism is stranded under arm (crash / data reset). This fails the build
       the instant a blob field is added that nothing reconstructs — the net that
       would have caught companions/farm before they shipped as strands. */
    const { armHomingGuard } = await import('./arm-homing-guard.mjs');
    const homingProblems = await armHomingGuard();
    if (homingProblems.length) {
      console.log('\nArm-homing guard — FAILED:');
      for (const p of homingProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    }

    /* ── The inventory-mint census (un-backed OWNABLE mint tripwire) ─────────
       Enumerates every client G.inventory-mint site and fails the build the
       instant a NEW un-classified one appears, so a future addItem(gatherProduct)
       with no server write cannot silently re-open the inventory-flip data-loss
       landmine. Also asserts flipArmBlockers() stays NON-EMPTY (fail-closed) while
       any un-backed ownable lane (raid, workers) exists — the flip physically
       cannot arm and delete a client-minted raid/worker haul. */
    const { inventoryMintCensusGuard } = await import('./inventory-mint-census.mjs');
    const mintProblems = await inventoryMintCensusGuard();
    if (mintProblems.length) {
      console.log('\nInventory-mint census — FAILED:');
      for (const p of mintProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nInventory-mint census — OK: every mint site classified; arm-gate fail-closed while un-backed lanes (raid, workers) exist.');
    }

    /* ── The farm-record guard (blob-retire capstone, CRITICAL blocker) ──────
       Proves the CLIENT half of the farm reconstruction: under the capstone arm
       the client stops loading the save blob, so accrue.js reconcileFarm rebuilds
       G.farmPlots from the envelope's `farm` projection (verified live: {i,crop,
       planted_at,watered_at} per planted plot) instead of leaving G.farmPlots
       undefined — which would throw in startFarmCheck + both render loops and
       vanish every standing crop. DORMANT it is a pure no-op; ARMED it rebuilds
       crops/real-planted_at/waterings and (if the projection carries it) the plot
       tier; FAIL-CLOSED an absent farm array leaves a populated farm untouched
       (a lean/idle envelope never wipes crops) while an empty array is an
       unplanted claim; and the guarded (G.farmPlots||[]) read never throws on an
       undefined farm. */
    const { farmRecordGuard } = await import('./farm-record.mjs');
    const farmProblems = await farmRecordGuard();
    if (farmProblems.length) {
      console.log('\nFarm-record guard — FAILED:');
      for (const p of farmProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nFarm-record guard — dormant no-op; armed rebuild from envelope (crops/planted_at/waterings/tier); fail-closed absent (no wipe); empty-array claim; undefined-farm no-throw.');
    }

    /* ── The client_state home guard (non-authority residue, b439) ──────────
       Proves the CLIENT half of 2026-08-28-client-state.sql: DORMANT,
       clientField(G,f) reads the save blob byte-for-byte (no regression); ARMED
       (flag + master switch, post-wipe only) it sources the residue from the
       server envelope's client_state and yields a fallback for a server-absent
       key (self-only — no fail-closed UNKNOWN); putClientState builds the correct
       hr_put_client_state call and refuses a bad/unconfigured request non-fatally.
       The server half — shallow merge, idempotent replay, bad/oversized patch
       refused, hr_state_of projects it, no client write policy — is proven by the
       migration's own §6 self-check on apply. */
    const { clientStateGuard } = await import('./client-state.mjs');
    const clientStateProblems = await clientStateGuard();
    if (clientStateProblems.length) {
      console.log('\nClient-state home guard — FAILED:');
      for (const p of clientStateProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nClient-state home guard — dormant no-regression (blob) + armed server-read + putClientState builds the RPC.');
    }

    /* ── The farm-sync transport guard (b435 farm RPCs, DORMANT) ─────────────
       Proves the CLIENT half the security review found missing on main: the
       four farm gestures (plant/water/harvest/upgrade) route through
       src/net/farm-sync.js under isFarmServerArmed(). DORMANT the arm is false
       (no regression — legacy farming runs client-side). ARMED, the transport
       builds the right hr_farm_* RPC calls (only ids/slot/plot/idem cross the
       wire), reconcileFarmResult renders the RESPONSE into G, and harvest applies
       the server's produce/XP ONCE (no local roll → no double credit). Every
       failure is non-fatal. The server half is proven by
       2026-08-22-server-farming-complete.sql's own §10 self-check on apply. */
    const { farmSyncGuard } = await import('./farm-sync.mjs');
    const farmSyncProblems = await farmSyncGuard();
    if (farmSyncProblems.length) {
      console.log('\nFarm-sync transport guard — FAILED:');
      for (const p of farmSyncProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nFarm-sync transport guard — dormant no-regression + armed RPC shape + reconcile-from-response (produce once, no double credit) + fail-safe.');
    }

    /* ⚠ The blob-retire capstone guard runs LATE (search "blob-retire capstone
       guard — runs after the pglite guards"), NOT here. Importing its module
       chain (capstone.js + events.js) poisons pglite's ability to re-instantiate
       in the same process, so if it ran before the SQL-replay guards below every
       one of them would fail with a pglite "pathname" crash. pglite is a
       test-only dependency and the capstone runs only in the browser, so running
       the guard after the last bootReplay is a clean fix — position does not
       change what it verifies. */

    /* ── The artisan accrual guard (b356) ───────────────────────────────
       `artisan` is 290 of the 344 `hr_activities` rows and every one of them
       paid NOTHING until this landed — declared idle rather than confiscated,
       but zero all the same. It is also the first payable kind whose
       simulation SPENDS: an input leaves the bag on every tick, so the
       property that matters is not only "does it pay what the client pays" but
       "can it ever propose a debit deeper than the SERVER'S inventory" — which
       hr_apply answers with `insufficient_item`, a 409 that is not on the
       degrade ladder and therefore costs the whole night.

       Seven claims, each with a control: a payable kind with no simulation is
       refused rather than priced as combat; parity against a TRANSCRIPTION of
       legacy.js (not a call into the same span function); the material clamp,
       swept rather than sampled; exhaustion pays what it worked and CLEARS the
       pointer; the recipe gate is a server progress row and fails closed on
       every shape of "I do not have the scroll"; noBurn comes out of the
       unlock rows and the bench payability model is a property rather than a
       list of names; and the delta shape — including `journal.kind = 'craft'`,
       because `player_ledger_kind_check` does not accept `artisan` and naming
       it would cost a player their night.
       See tests/artisan-accrual.mjs. */
    const artisanAccrualProblems = await artisanAccrualGuards();
    if (artisanAccrualProblems.length) {
      console.log('\nArtisan accrual guard (a smithing night pays, and pays no more than the bag) — FAILED:');
      for (const p of artisanAccrualProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nArtisan accrual guard — a smithing night pays exactly what the shipped client '
        + "pays, production is clamped to the SERVER'S inventory and swept across five supply levels, "
        + 'running out stops the run and clears the pointer, and the recipe gate is a server row that '
        + 'fails closed.');
    }

    /* ── Live settlement, PHASE 0 (the in-flight fight is server state) ──
       The defect it guards is not a rounding loss: before this, every accrual
       window started a FRESH monster at full HP, so any target whose
       time-to-kill exceeded the window paid ZERO — measured 0 kills / 0 gold at
       60 s, 90 s, 120 s and 300 s cadences against a 520 HP dragon that one
       60-minute window pays 3 kills for. It is also a live under-payment today
       on every set_activity collect.

       It grades BOTH halves, because either alone is trustable and wrong: the
       engine half (does a settled hour pay what one window pays, and is a
       span that starts fresh byte-identical either way) and the SQL half, on
       real PostgreSQL through the whole migration chain — a forged checkpoint
       is refused against the GENERATED monster ceiling, and a banked
       nearly-dead boss is voided by any activity change, including a switch
       back to the same target. `node tests/live-settlement.mjs --mutate`
       plants seven real defects, one of which is the shipped bug itself, and
       requires all seven to go red. See tests/live-settlement.mjs. */
    const settleProblems = await liveSettlementGuards();
    if (settleProblems.length) {
      console.log('\nLive settlement Phase 0 (the in-flight fight is server state) — FAILED:');
      for (const p of settleProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nLive settlement Phase 0 — a settled hour pays what one window pays, a span that '
        + 'starts fresh is byte-identical with and without the column, a forged checkpoint is refused '
        + 'against the generated monster ceiling, and a banked boss does not survive a switch.');
      for (const line of settleReport.report || []) console.log(`  ${line}`);
      for (const line of settleSqlReport.report || []) console.log(`  ${line}`);
    }

    /* ── The unlock-purchase guard (b354) ───────────────────────────────
       The other half of the artisan model: the model made a Kitchen rung
       READABLE, and this makes it BUYABLE — by the server, out of a generated
       price catalogue, with the merge `GREATEST(existing, granted)` rather
       than `+=`. The whole migration chain replays here, so both new
       migrations' self-verifying blocks execute on every suite run, and the
       real Edge module then buys a real rung and cooks a real span with it.
       `--selftest` plants sixteen real defects; every one must read RED. */
    /* ── Phase 2 — THE EQUIP INTENT (b366) ──────────────────
       The verb that closes the b362 dupe class STRUCTURALLY: equipping is a
       transfer through hr_apply, so the total a player owns is conserved and a
       dupe is arithmetically impossible rather than merely unimplemented. The
       whole migration chain replays here, so the new migration's self-verifying
       block — including its load-bearing NEGATIVE, that insufficient_item is
       NOT on the intent-key release list — executes on every suite run, and the
       real Edge module then equips, unequips, and is refused a copy it does not
       own. The CLIENT half is EQUIP-FLIP-1/2 and EQUIP-WIRE-1 in the browser
       suite. */
    const equipProblems = await equipIntentGuards();
    if (equipProblems.length) {
      console.log('\nEquip intent (Phase 2) — FAILED:');
      for (const p of equipProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nEquip intent (Phase 2) — an equip is a CONSERVING transfer through hr_apply, a '
        + 'copy the player does not own is refused, a catalogue-staleness refusal releases the '
        + 'intent key and the ownership refusal does not, and the verb collects the window BEFORE '
        + 'it swaps the gear that prices it.');
    }

    /* ── Manual eat (Paione P0, 2026-08-25) ─────────────────────────────
       The REAL runEat bytes, behind index.ts's one-statement exec seam, against
       the real migration chain in PGlite: an eat DEBITS the food server-side
       (the P0 — a client-only debit was restored by the absolute reconcile, so
       the food "returned"), CREDITS the heal clamped to max_hp, is idempotent on
       replay (no double-debit), DEBITS even at full server hp (the live-combat
       case — no already_full gate), refuses insufficient_item / intent_mismatch,
       and every stateful refusal carries the envelope. */
    const eatProblems = await eatIntentGuards();
    if (eatProblems.length) {
      console.log('\nEat intent (manual food) — FAILED:');
      for (const p of eatProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nEat intent (manual food) — a manual eat debits the food through hr_apply '
        + 'exactly once, credits the catalogue heal clamped to max_hp, is idempotent on replay, and '
        + 'the eaten food does not return: player_inventory holds one fewer unit for the absolute '
        + 'reconcile to read.');
    }

    /* ── The `unknown_skill` incident's permanent fix (b370) ────────────
       hr_apply used to answer a legitimate XP grant with `unknown_skill`
       whenever the character had no player_skills ROW for the skill — which is
       every character older than the skill, because rows are seeded once at
       creation and the catalogue grows afterwards. The refusal STORED itself
       against the intent key so "Try again" replayed it, and hr_reject rolls
       the protected block back WHOLE, so each one also discarded that window's
       gold, items and every OTHER skill's XP. 51 aggregated rejections in one
       night. A missing row is a row to CREATE. Production was backfilled by
       hand, which removes the symptom and not the defect — the next skill added
       to src/data/skills.js would do it again — so the guard grades the GRANT,
       against a character whose row is deleted to reproduce the live state.
       `node tests/skill-row-upsert.mjs --mutate` plants three real defects
       (revert to the bare UPDATE; drop the catalogue check so a client string
       mints a skill row; overwrite XP instead of adding) and requires all three
       to read RED — each with the migration's own §3 deliberately blinded, so
       the BEHAVIOUR is what fails rather than a static self-check. */
    const skillRowProblems = await skillRowUpsertGuard();
    if (skillRowProblems.length) {
      console.log('\nSkill-row upsert (the unknown_skill incident) — FAILED:');
      for (const p of skillRowProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nSkill-row upsert — a known-but-rowless skill is granted and its row created, a '
        + 'genuinely unknown skill id still refuses unknown_skill and mints nothing, an existing '
        + 'row still ACCUMULATES, and the per-call XP clamp still holds.');
      for (const line of skillRowUpsertGuard.report || []) console.log(`  ${line}`);
    }

    /* ── Security S2: the boards stop ranking the save blob ──────────────
       public.leaderboard_ranked was a materialized view over
       game_saves.snapshot — the CLIENT-AUTHORED save file — so `G.gold = 1e12`
       → autosave bought rank #1 on Wealth, and the same line took Total Level,
       Combat Level and every skill board. It also read the display name out of
       that blob when a player had no profiles row, which published a name of
       their choosing to every other player's screen. Rebuilt over player_state
       and player_skills by 2026-08-18-leaderboard-server-source.sql.
         The guard asserts BOTH directions, which is the whole point: a view
       that ranks nothing at all would satisfy "the forgery is dead" perfectly,
       so every negative is paired with a legitimate server-written change that
       MUST move the same board. `node tests/leaderboard-server-source.mjs
       --mutate` plants six real defects (wealth re-sourced from the blob; the
       F5 revoke dropped so the recreated matview re-inherits anon SELECT;
       renown re-added from the blob; the playerName impersonation fallback
       restored; the missing-skill-row coalesce defaulting to 0; and the §0
       predecessor gate weakened to a term the older migration also contains)
       and requires all six to read RED. */
    const leaderboardProblems = await leaderboardSourceGuard();
    if (leaderboardProblems.length) {
      console.log('\nLeaderboard server source (S2) — FAILED:');
      for (const p of leaderboardProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nLeaderboard server source — a forged game_saves snapshot moves no board, a '
        + 'server-written XP/gold change does, the matview is not client-selectable, names come '
        + 'from profiles, and the two boards with no server source rank nobody.');
      for (const line of leaderboardSourceGuard.report || []) console.log(`  ${line}`);
    }

    const unlockProblems = await unlockBuyGuard();
    if (unlockProblems.length) {
      console.log('\nUnlock purchase guard (hr_unlock_buy) — FAILED:');
      for (const p of unlockProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nUnlock purchase guard — a bought Kitchen rung reaches hr_perks_of and cooks a '
        + 'span with 0 burns; a double buy, a skipped rung, a replay and a stale version all refuse '
        + 'by name with gold measured.');
    }

    /* ── The market guard (market v2) ───────────────────────────────────
       THE FIRST CROSS-PLAYER VALUE TRANSFER. Every other economy guard in this
       suite measures ONE character, because every other verb touches one;
       hr_market_buy is the first function that writes a row belonging to
       somebody who is not the caller, so this one measures BOTH and states its
       assertions as conservation identities (Σgold+Σtax, Σitems+Σescrow). The
       whole migration chain replays here, so 2026-08-17-market-v2.sql's own
       self-verifying blocks — §0's refuse-to-install with both scan controls
       and §11's structural, source, cron and immutability checks — execute on
       every suite run. `node tests/market-v2.mjs --selftest` plants seventeen
       real defects; every one must read RED. */
    const marketProblems = (await marketV2Guard()).failures;
    if (marketProblems.length) {
      console.log('\nMarket v2 guard (two-player transfer) — FAILED:');
      for (const p of marketProblems) console.log(`  x ${p}`);
      exitCode = 1;
    } else {
      console.log('\nMarket v2 guard — a real list/buy moves gold and items between two real '
        + 'characters exactly once; replay, stale version, self-trade, a stranger\'s cancel, a '
        + 'double collect, a racing expiry and both per-day transfer fuses all refuse by name, '
        + 'with BOTH sides measured and conservation held.');
    }

    /* ── The market's EDGE half (b355) ─────────────────────────────────
       market-v2.mjs grades the AUTHORITY layer with well-formed SQL
       parameters. Nobody hands the server well-formed SQL parameters — an
       attacker hands it an HTTP BODY — and everything between the two
       (parseIntent, the registry, the shape refusals, the argument lists) is
       code no SQL test can see. This drives the REAL Edge modules with
       genuinely hostile bodies and counts statements, so "refused before any
       database work" is measured rather than read. The load-bearing one is
       M-WIRE: hr_market_buy is bound exactly six parameters, none of them a
       price. `node tests/market-intent.mjs --selftest` plants nine defects;
       every one must read RED. */
    const marketIntentProblems = (await marketIntentGuard()).failures;
    if (marketIntentProblems.length) {
      console.log('\nMarket intent guard (the Edge half) — FAILED:');
      for (const p of marketIntentProblems) console.log(`  x ${p}`);
      exitCode = 1;
    } else {
      console.log('\nMarket intent guard — every hostile body (poisoned prototype, numeric-string '
        + 'price, braced uuid, SQL-shaped listing) is refused by name before it costs a database '
        + 'statement; the buyer\'s wire binds a listing and a count and no price; a replay carries '
        + 'the envelope and no receipt.');
    }

    /* ── The cutover import (b355) ──────────────────────────────────────
       The one moment a client-authored save blob is allowed to become server
       state. Six synthetic snapshots — normal, maxed, forged (1e12 gold),
       unknown ids, unlocks, corrupt — driven through the REAL tool and the
       REAL RPC on a real PostgreSQL with the whole chain applied, so
       2026-08-17-cutover-import.sql's own self-verifying block executes here
       on every run.

       The two arms worth naming: a FIELD_MAP with a missing entry fails the
       run BY NAME (the b350 declaration-gap lesson applied to a one-off), and
       an imported Kitchen rung is followed all the way to
       makeBonus('noBurn') > 0 through hr_perks_of — because "the row is in
       the table" is not the claim, "the Kitchen stops burning food" is, and
       that is the ordering dependency the artisan flip waits on.
       `node tests/cutover-import.mjs --selftest` plants thirteen real
       defects; every one must read RED. */
    const cutoverProblems = await cutoverImportGuard();
    if (cutoverProblems.length) {
      console.log('\nCutover import guard — FAILED:');
      for (const p of cutoverProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nCutover import guard — a maxed save imports unclamped, a forged one clamps AND '
        + 'reports, unknown ids drop by name, an imported Kitchen rung reaches makeBonus(\'noBurn\'), '
        + 'and a re-run skips on the marker.');
    }

    /* ── The client-write-grant sweep, batch 2 (Security) ───────────────
       display_names and leaderboard_meta — the two cross-player identity /
       ranking surfaces among the 21 tables the batch-1 baseline recorded. The
       grants are dead (RLS on, SELECT-only policy) and each is ONE plausible
       policy away from being live: a rename policy on display_names bypasses
       the reserved-name list, the length bound and the charset rule, all of
       which exist ONLY inside claim_display_name; an UPDATE on
       leaderboard_meta pins the staleness gate and freezes all 21 boards.
       The whole chain replays here, so the migration's four refuse-to-install
       checks and its execute-the-refusal probe run on every suite run, and
       both confirmed writers are then DRIVEN for real. `--selftest` plants
       eight real defects; every one must read RED. */
    const sweep2Problems = await clientWriteSweep2Guard();
    if (sweep2Problems.length) {
      console.log('\nClient write grant sweep batch 2 (display_names, leaderboard_meta) — FAILED:');
      for (const p of sweep2Problems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nClient write sweep guard — no client write privilege survives on display_names '
        + 'or leaderboard_meta (MAINTAIN included), the refusal is on the GRANT rather than on RLS, '
        + 'both writer RPCs still work, and the four baseline rows are consumed.');
    }

    /* ── The client-write-grant sweep, batch 3 (Security) ───────────────
       raid_claims and raid_contributions — the batch-2 reviewer's #1 pick on
       blast radius, because raid_contributions is the ONE table in the baseline
       that has already hosted a LIVE client-write exploit: the b209 "own
       contribution claim" UPDATE policy, removed by raid-hardening, whose GRANT
       was never removed. Its damage/strikes set the payout BAND and, on a
       partial kill, the clan-wide factor — how much SOMEBODY ELSE is paid — and
       DELETE on raid_claims is unlimited weekly chest replay.
       Plus PART B: the MAINTAIN pass over batch 1's six catalogues, which
       reported "0 remain" and were not — information_schema cannot see PG17's
       MAINTAIN, so every measurement in that file was blind to it. C2b
       demonstrates that blindness rather than asserting it.
       The whole chain replays here, so the migration's refuse-to-install checks
       (including the server-DERIVED privilege vocabulary) and its
       execute-the-refusal probe run on every suite run, and both confirmed
       writers are then DRIVEN as a signed-in player. `--selftest` plants twelve
       real defects; every one must read RED. */
    const sweep3Problems = await clientWriteSweep3Guard();
    if (sweep3Problems.length) {
      console.log('\nClient write grant sweep batch 3 (raid_claims, raid_contributions, MAINTAIN) '
        + '— FAILED:');
      for (const p of sweep3Problems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nClient write sweep batch 3 — no client write privilege survives on either raid '
        + "table or on batch 1's six catalogues (MAINTAIN included), the refusal is on the GRANT "
        + 'rather than on RLS, raid_claim and raid_strike still write, and the four baseline rows '
        + 'are consumed.');
    }

    /* ── The client write grant sweep, BATCH 4 — the last one ───────────
       All seventeen remaining baselined tables in one change: world_event_*
       (world_event_totals is a shared, whole-population aggregate — its goal
       and met_at decide what EVERY participant is paid), clan_* (clan_ledger
       is the append-only journal every clan daily cap is READ FROM; a client
       DELETE resets every cap and erases the evidence they were spent), and
       maintenance_* (where the nightly detector's own failures surface).
       After it, public.hr_client_write_baseline is EMPTY — every table batch 1
       found in the dead-grant class has been swept rather than recorded.

       ⚠ THE TWO THINGS THIS GUARD CARRIES THAT ITS PREDECESSORS COULD NOT:
       (1) ALL FORTY-TWO confirmed writers are driven for real BEFORE and AFTER
           the revoke on identical fixtures, and each must actually CHANGE its
           target table (row fingerprint, not a returned ok:true). An after-only
           drive cannot tell "the revoke was harmless" from "this never worked
           on the replay".
       (2) THE LIVE-POLICY RECONCILIATION. clan_members ("join as self",
           "leave as self") and clans ("clans creatable") carry LIVE client
           write policies, so their grants are NOT dead, they were never in the
           class and never baselined, and this batch must not touch them. C6
           asserts they keep their policies, keep the grants behind them, stay
           unbaselined, and that the raw client founding/joining path still
           WORKS — the one arm that catches a sweep quietly widening its revoke.
       `--selftest` plants twenty-one real defects; every one must read RED. */
    const sweep4Problems = await clientWriteSweep4Guard();
    if (sweep4Problems.length) {
      console.log('\nClient write grant sweep batch 4 (world_event_*, clan_*, maintenance_*) '
        + '— FAILED:');
      for (const p of sweep4Problems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nClient write sweep batch 4 — no client write privilege survives on any of the '
        + '17 remaining tables (MAINTAIN included), all 42 confirmed writers still write before AND '
        + 'after the revoke, clan_members/clans keep the live policies and grants they need, and '
        + 'the dead-grant baseline is now EMPTY.');
    }

    /* ── Client write sweep batch 5 (the state becomes a property) ────────
       Three coupled pieces in one migration: (1) a FAIL-CLOSED default ACL so a
       new table is not born client-writable; (2) a SCHEMA-WIDE MAINTAIN revoke
       so nothing keeps the one privilege the detector could not see; (3) the
       DETECTOR TAKEOVER — check (4) moves off information_schema (blind to
       MAINTAIN and to matviews) onto has_table_privilege over pg_class. The
       guard proves a fresh table is born SELECT-only, zero client MAINTAIN pairs
       remain, and a re-granted MAINTAIN — on a table OR a matview — is named and
       fatal, while clan_members/clans keep the live grants their policies use.
       `--selftest` plants seven real defects; every one must read RED. */
    const sweep5Problems = await clientWriteSweep5Guard();
    if (sweep5Problems.length) {
      console.log('\nClient write grant sweep batch 5 (fail-closed default ACL + MAINTAIN revoke + '
        + 'detector takeover) — FAILED:');
      for (const p of sweep5Problems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nClient write sweep batch 5 — the generator is fail-closed (a new table is born '
        + 'SELECT-only), zero client MAINTAIN pairs remain across tables and matviews, and check (4) '
        + 'now names and fails on a MAINTAIN grant permanently.');
    }

    /* ── Display-prediction guard (b455) ──────────────────────────────────
       The seam that makes an ARMED client feel instant without letting it
       author a record. It guards two properties of one mechanism, both bought
       with live incidents: a gather tick / kill / craft must move the number
       ON THE ACTION (not at the server's ~90s settle floor), and the b347
       fingerprint must stay intact so the display can never bounce a level-60
       skill to level 1. Plus the two ways a prediction layer goes wrong —
       double-counting at the settle, and a prediction leaking into an
       authority read. DORMANT is asserted byte-for-byte. */
    const predictProblems = (await import('./predict-display.mjs')).predictDisplayGuard
      ? await (await import('./predict-display.mjs')).predictDisplayGuard() : { problems: [], notes: [] };
    if (predictProblems.problems.length) {
      console.log('\nDisplay-prediction guard (instant + authoritative) — FAILED:');
      for (const p of predictProblems.problems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nDisplay-prediction guard — a tick moves the display instantly with the record '
        + 'byte-unchanged, the settle retires exactly what it restated, authority is blind to every '
        + 'prediction, and the lvl-1 bounce is unreachable.');
      for (const n of predictProblems.notes) console.log(`    · ${n}`);
    }

    /* ── Bug-report triage pipe ────────────────────────────────────────
       The intake pipe is only half a loop if nothing can record what was DONE
       about a report, so 2026-08-17-bug-triage.sql adds status/triage_note/
       triaged_at and closes the one unrated write path: the direct-PostgREST
       FALLBACK insert, which never crosses bug_report_submit's 6/hour + 20/day
       cap. The guard REPRODUCES that flood first (45 inserts from one account,
       all landing) — a guard never shown the door it closes is decoration —
       then proves the backstop refuses the 46th while a second account and the
       operator path are untouched. It also holds the line the brief for this
       work would have crossed: submit() must reach sendSupabase ONLY behind
       !relay.ok, because the relay ALREADY wrote the row, so an unconditional
       "also insert" would file every report twice and defeat the idem key. */
    const bugTriageProblems = await bugTriageGuard();
    if (bugTriageProblems.length) {
      console.log('\nBug-report triage pipe — FAILED:');
      for (const p of bugTriageProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nBug-triage guard — the unrated fallback flood is reproduced then refused per-account, '
        + 'resolved is derived from status, triaged_at cannot be backdated, reports stay append-only, '
        + 'and the client still files each report exactly once.');
    }

    /* ── The clan Storehouse's possession check (Security P0, b366) ─────
       `clan_deposit` validated the item, clamped it by gold value, journalled
       it — and never debited the depositor. A devtools call therefore minted
       materials into clan_stores, castle_tier, contribution points and the
       clan_power leaderboard: four surfaces that all cross to other players.
       2026-08-18-clan-deposit-ownership.sql ports hr_market_list's escrow debit
       into it and moves the write section inside a protected block, so a mixed
       batch with one short row rolls back WHOLE instead of committing the good
       half. The guard drives two real players through the real A9-wrapped RPC
       on a fully replayed PGlite chain; `--selftest` plants five real defects
       (including the P0 itself) and every one must read RED. */
    const clanDepositProblems = await clanDepositOwnershipGuard();
    if (clanDepositProblems.length) {
      console.log('\nClan Storehouse ownership debit — FAILED:');
      for (const p of clanDepositProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nClan-deposit ownership guard — an unowned deposit is refused and moves nothing, an '
        + 'owned one debits exactly, and a mixed batch with one short row rolls back whole.');
    }

    /* ── The clan economy-sinks guard (2026-08-27) ───────────────────────
       Three pre-cutover holes closed: clan_contribute now debits the caller's
       server-owned gold (was a free treasury/ranking mint), clan_feast_deposit
       now consumes real cooked food from player_inventory (was a free meter),
       and the value-less legacy buy_listing RPC is dropped. Drives the real
       rate-gated RPCs on a fully replayed PGlite chain with this migration
       appended, proving conservation (gold/food out == treasury/meter in),
       refusal when the caller cannot pay, the day/call clamps, the level
       cascade, and that buy_listing is gone. */
    const econSinkProblems = await clanEconomySinksGuard();
    if (econSinkProblems.length) {
      console.log('\nClan economy-sinks — FAILED:');
      for (const p of econSinkProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nClan economy-sinks guard — contribute debits gold (conserved), feast consumes food, '
        + 'buy_listing removed.');
    }

    /* ── The feast catalogue drift guard ─────────────────────────────────
       hr_feast_foods (the server-authoritative feast heal values) is hand-seeded
       from src/data/items.js. This binds the seed to the data: any cooked food
       added / renamed / re-valued in items.js that is not mirrored in the
       migration fails the build. */
    const feastDriftProblems = await feastCatalogueDriftGuard();
    if (feastDriftProblems.length) {
      console.log('\nFeast catalogue drift — FAILED:');
      for (const p of feastDriftProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nFeast catalogue drift guard — hr_feast_foods matches items.js exactly (28 cooked foods).');
    }

    /* ── The RPC-gate bucket drift guard (2026-08-29) ────────────────────
       hr_rpc_gate fail-closes an unlisted bucket as "rate_limited" with zero
       telemetry. A stale-template replacement dropped five live buckets and
       froze trait buys / style sets / quest claims / residue saves for days
       (the b484–b487 wave). This asserts every caller bucket in the migration
       chain is admitted by the FINAL gate definition's case list. */
    try {
      const gateBuckets = await rpcGateBucketGuard();
      console.log(`\nRPC-gate bucket guard — ${gateBuckets.buckets} caller bucket(s) all admitted by ${gateBuckets.finalDef}.`);
    } catch (e) {
      console.log('\nRPC-gate bucket guard — FAILED:\n' + String(e.message || e));
      exitCode = e.harness ? 2 : 1;
    }

    /* ── ONE IDEMPOTENCY KEY, ONE INTENT (b493/b494 security finding #7) ──
       player_intents is ONE key namespace for every verb. hr_apply compares the
       stored intent AND slot before serving a cached envelope; twelve other
       SECURITY DEFINER RPCs read the same cache and compared neither, so a uuid
       burned on a free verb answered a money verb with the wrong envelope —
       self-only, but it spends a completed daily for nothing. The guard drives a
       real player through the real RPCs on a fully replayed PGlite chain, and
       asserts the property at CHAIN END, which is the only position from which a
       LATER migration restating a patched body (the b484–b487 class) is visible.
       `--selftest` plants seven real defects; every one must read RED. */
    try {
      const { intentMismatchGuard } = await import('./intent-mismatch.mjs');
      const intentProblems = await intentMismatchGuard();
      if (intentProblems.length) {
        console.log('\nIntent-mismatch guard — FAILED:');
        for (const p of intentProblems) console.log(`  ✗ ${p}`);
        exitCode = 1;
      } else {
        console.log('\nIntent-mismatch guard — one key answers one intent on one slot; a genuine '
          + 'replay still replays; twelve bodies guarded at chain end; the helper reaches nobody.');
      }
    } catch (e) {
      console.log('\nIntent-mismatch guard — FAILED:\n' + String(e.message || e));
      exitCode = e.harness ? 2 : 1;
    }

    /* ── The generalized cron-health detector (the b319 lesson) ──────────
       hr_cron_health alarmed on the size of ONE hardcoded table. b319's own
       migration says a policy that cannot fire is worse than no policy, so this
       guard asserts every ARM fires at its fuse (database size + growth,
       per-table size + growth + row delta, connection headroom, the never-ran
       escalation), that NONE fires on a healthy database, that the sensitivity
       scale which makes the first half testable cannot be raised into an off
       switch, and that the detector's own tables are bounded and unreachable by
       a client. `--selftest` plants eight real defects; every one must read RED. */
    try {
      const { cronHealthGuard } = await import('./cron-health.mjs');
      const cronProblems = await cronHealthGuard();
      if (cronProblems.length) {
        console.log('\nCron-health guard — FAILED:');
        for (const p of cronProblems) console.log(`  ✗ ${p}`);
        exitCode = 1;
      } else {
        console.log('\nCron-health guard — every arm fires at its fuse, none on a healthy database, '
          + 'the scale cannot be raised, retention bounds the detector itself.');
      }
    } catch (e) {
      console.log('\nCron-health guard — FAILED:\n' + String(e.message || e));
      exitCode = e.harness ? 2 : 1;
    }

    /* ── The quest-MODAL claim guard (b461) ──────────────────────────────
       Hearthrise has THREE goal systems; b414 gave two of them a server credit
       path and the modal's Daily/Weekly tabs never got one, so under the live
       gold arm every Claim button in it was silently dead. The guard drives a
       real player through the real rate-gated hr_claim_goal on a fully replayed
       PGlite chain — complete/incomplete, replay, idempotency key, weekly summed
       over the ISO week, another week's counter kept out, an empty reward
       refused before the consume — and BINDS legacy.js's authored pools to the
       server catalogue and to the counters the accrual engine stamps, so a goal
       nothing grades (or a counter nothing reads) fails the build by name.
       `--selftest` plants seven real defects; every one must read RED. */
    const modalGoalProblems = await modalGoalClaimGuard();
    if (modalGoalProblems.length) {
      console.log('\nQuest-modal goal claim — FAILED:');
      for (const p of modalGoalProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nQuest-modal goal claim guard — completion read from the server\'s own counters, '
        + 'credited once, idempotent on replay, weekly derived from the ISO week, whole reward '
        + '(gold + gems + XP + items) server-applied.');
    }

    /* ── The b497 goal-gold retune guard ─────────────────────────────────
       The Designer's balance ruling re-prices THREE server surfaces that live
       in three different places: five rows of hr_goal_rewards, four CASE arms
       inside hr_claim_daily__ungated and one inside hr_claim_quest__ungated.
       Editing the AUTHORING migrations makes a rebuild correct and does nothing
       to a database that already has the old bodies installed, so the repo-side
       drift guards are blind to whether the FORWARD migration actually works.
       This one replays the chain with the authoring files reverted to the
       pre-ruling numbers — the shape production is in — makes the migration do
       real work, and then PLAYS it: a real player refused at 59 logs, paid 300
       at 60, paid the LOWERED 150 for three plantings, refused the onboarding
       quest at 5 harvests and paid at 6. It also proves the file re-applies as a
       no-op on both a transitioned and a rebuilt database, and REFUSES each of
       the three surfaces when it is drifted underneath it.
       `--selftest` plants six real defects; every one must read RED. */
    try {
      const { goalGoldRetuneGuard } = await import('./goal-gold-retune.mjs');
      const ggrProblems = await goalGoldRetuneGuard();
      if (ggrProblems.length) {
        console.log('\nGoal-gold retune guard — FAILED:');
        for (const p of ggrProblems) console.log(`  ✗ ${p}`);
        exitCode = 1;
      } else {
        console.log('\nGoal-gold retune guard — the pre-ruling database transitions on all three '
          + 'surfaces, re-applies as a no-op, refuses a drifted surface, and pays a real player the '
          + `ruled amounts.\n  ${ggrProblems.coverage}`);
      }
    } catch (e) {
      console.log('\nGoal-gold retune guard — FAILED:\n' + String(e.message || e));
      exitCode = e.harness ? 2 : 1;
    }

    /* ── The kill → DAILY-goal credit guard (live report #41 residual) ───
       Daily AND weekly kill goals grade on player_progress(kind='daily',
       key='ev:kill_any', period=<utc day key>), whose only writer was the
       away/span-sim (60-99% undercount). hr_credit_kills wrote 'ev:kill_any'
       only as the LIFETIME stat row, so an attended kill-30 daily sat at
       "30/30 · Confirming…" with no Claim. The guard drives a real player
       through the real rate-gated hr_credit_kills on a fully replayed PGlite
       chain and then through the real hr_claim_goal — so the assertion is "the
       player can now claim", not "a row exists". It also proves the CONTAINMENT
       that makes the new bounty-free branch reviewable: a credit with no active
       bounty moves the daily row and NOTHING else (not the lifetime counters
       hr_renown_of scores and hr_claim_quest pays on, not the bestiary, not
       gold/gems), the anchor closes its window, a settle-first credit pays
       nothing, and the per-day ceiling binds. `--selftest` plants nine real
       defects, two of them with the migration's own gate short-circuited so the
       guard alone has to see them; every one must read RED. */
    try {
      const { killDailyCreditGuard } = await import('./kill-daily-credit.mjs');
      const kdcProblems = await killDailyCreditGuard();
      if (kdcProblems.length) {
        console.log('\nKill → daily-goal credit guard — FAILED:');
        for (const p of kdcProblems) console.log(`  ✗ ${p}`);
        exitCode = 1;
      } else {
        console.log('\nKill → daily-goal credit guard — the daily ev:kill_any row is stamped by '
          + 'both branches, the bounty-free branch writes that row and nothing else, the anchor '
          + '+ per-day ceiling bind, a replay does not double-stamp, and hr_claim_goal pays '
          + 'kill_more/wk_kills off it.');
      }
    } catch (e) {
      console.log('\nKill → daily-goal credit guard — FAILED:\n' + String(e.message || e));
      exitCode = e.harness ? 2 : 1;
    }

    /* ── The renown kill-faucet guard (Security R5) ───────────────────────
       A LIVE, PRE-EXISTING faucet in the deployed 2026-08-30 code:
       hr_credit_kills writes stat/ev:kill_any and stat/ev:kill_monster:<id>,
       and hr_renown_of SCORES both (0.05/kill; 5/kill for is_boss ids) — because
       hr_bounty_kills reads that same bestiary row, so moving renown is a side
       effect of making a bounty completable. Measured at 65 boss kills/min
       behind ONE held bounty = 19,500 renown/hour, ~8.5x honest, against a score
       that gates hr_claim_rank (1,603,000 gold + 925 gems per character) and the
       renownAllXp perk on the LIVE level boards.
       The guard drives a real player through the REAL hr_accept_bounty /
       hr_credit_kills / hr_claim_bounty against a REAL is_boss monster on a fully
       replayed PGlite chain. ⚠ Its FIRST check is the HONEST CONTROL — a
       server-simulated settle must still score in full — because every other
       assertion here is "a number did not move" and they all pass trivially if
       renown is broken to always return 0. `--selftest` plants seven real
       defects, two with the migration's own gate short-circuited; every one must
       read RED. */
    try {
      const { renownKillFaucetGuard } = await import('./renown-kill-faucet.mjs');
      const rkfProblems = await renownKillFaucetGuard();
      if (rkfProblems.length) {
        console.log('\nRenown kill-faucet guard — FAILED:');
        for (const p of rkfProblems) console.log(`  ✗ ${p}`);
        exitCode = 1;
      } else {
        console.log('\nRenown kill-faucet guard — a client kill credit scores ZERO renown '
          + '(sustained spam and throttled credits included) while a server settle still scores in '
          + 'full, the discount is per-monster and unprunable, the bestiary row still moves and the '
          + `bounty turn-in still pays. hr_renown_of read cost: ${renownKillFaucetGuard.readCost}.`);
      }
    } catch (e) {
      console.log('\nRenown kill-faucet guard — FAILED:\n' + String(e.message || e));
      exitCode = e.harness ? 2 : 1;
    }

    /* ── The permanent-TRAIT purchase guard (b46x) ───────────────────────
       Under the live marks arm legacy.js buyTrait() failed closed with no
       server verb behind it, so AUTO-EAT — the purchase the death sheet
       teaches on a player's FIRST death — could not be bought at all. The
       guard drives a real player through the real rate-gated hr_trait_buy on
       a fully replayed PGlite chain: unknown trait, prerequisite, short
       marks (and that the refusal is NOT cached under its key), the debit,
       the ownership row hr_auto_eat_tier reads, auto-eat switched on through
       its single writer at the tier-clamped threshold, the idempotent replay,
       already_owned, one ledger row per purchase and the envelope projection.
       It also BINDS legacy.js TRAITS to public.hr_traits in both directions,
       so a price that differs by one Mark fails the build by name.
       `--selftest` plants ten real defects; every one must read RED. */
    const traitBuyProblems = await traitBuyGuard();
    if (traitBuyProblems.length) {
      console.log('\nPermanent-trait purchase — FAILED:');
      for (const p of traitBuyProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nTrait-buy guard — server-priced, prerequisite-gated, debited exactly once, '
        + 'idempotent on replay, already_owned refused, refusals not cached, auto-eat enabled '
        + 'through its single writer, ownership projected on the envelope.');
    }

    /* ── b497 · AUTO-EAT I IS FREE AT CREATION (designer ruling) ───────────
       The last new-player death loop: a 10-max-HP character takes 4.94 damage
       per goblin kill, the death sheet teaches "unlock Auto-Eat", Auto-Eat is
       priced in Marks, and the cheapest Mark is an 80-120 kill contract away.
       The AWAY half was the P0 — simulateSpan BREAKS on the first death, so a
       new player who left a fight running overnight was credited ~30 seconds of
       a twelve-hour night. hr_create_character now writes the same
       player_progress flag row hr_trait_buy writes and sets the switch with the
       SAME clamp expression hr_set_auto_eat evaluates — but NOT through
       hr_set_auto_eat, which bumps `version` and writes a ledger row that
       2026-08-17-cutover-import.sql reads as "this character has already
       played". The guard replays the chain into PGlite and drives a real
       create: the trait lands in the shape hr_auto_eat_tier reads, the switch is
       on at a DERIVED tier-I clamp, version stays 0 and the journal stays one
       row so a cutover dry-run still imports, the shop refuses to re-sell it,
       the PAID upgrade is unchanged, creation is still an ensure,
       §grant-existing is gated + idempotent, and no ACL or policy moved.
       `--selftest` plants seven real defects — five of which also blind the
       migration's own self-check, so the guard alone must see them. */
    const autoEatCreationProblems = await autoEatAtCreationGuard();
    if (autoEatCreationProblems.length) {
      console.log('\nAuto-Eat at creation — FAILED:');
      for (const p of autoEatCreationProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nAuto-Eat at creation — the entry trait is granted in the shape the tier reader '
        + 'expects, switched on at a DERIVED tier-I clamp, leaves version 0 + one ledger row so the '
        + 'cutover still imports, unsellable twice, and the 100-Mark upgrade is untouched.');
    }

    /* ── THE COMBAT STYLE IS SERVER STATE (P0, live — Paione) ────────────
       "Strength/Defense/HP exp is not saving — only Attack saves." The accrual
       engine settled every combat window with `resolveStyle(eq.weaponType,
       null)`, i.e. the family default (Accurate, 100% to Attack), because the
       chosen style had no server home. Skills are server-of-record and armed, so
       each settle overwrote the client's predicted Strength/Defence XP with it.
       This guard DRIVES THE REAL ENGINE over a real seeded span and asserts a
       server-stored sword/defensive routes to Defence and sword/aggressive to
       Strength (with a null-style CONTROL, so it cannot be satisfied by an
       engine that pays everything), that the styled TOTAL is preserved (a style
       is a route, not a multiplier), that a foreign family cannot leak, that the
       input is not mutated, and that speedMod reaches the swing interval. It
       also BINDS src/core/styles.js to public.hr_combat_styles in both
       directions. `--selftest` plants six real defects; every one must read RED. */
    const styleProblems = await combatStyleGuard();
    if (styleProblems.length) {
      console.log('\nCombat-style authority — FAILED:');
      for (const p of styleProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nCombat-style guard — the engine routes settle XP to the SERVER-STORED style, '
        + 'catalogue bound to src/core/styles.js both ways, never read from a request body, '
        + 'collect-first guarded, accrued_to never stamped.');
    }

    /* ── THE ENVELOPE CONTRACT: every accrued:true carries `away` (b475) ─
       The standalone parallel-settle branch in index.ts (pointer idle, rested
       bank and/or worker crew owe) returned accrued:true WITHOUT an `away`
       receipt, so the client gate isEnvelopeApplicable classified a genuine
       grant as `malformed` — three of those tripped ACCRUE_HALT_AFTER_TRIES and
       raised "Away progress is paused" while HIDING the grant the server made.
       Affected any returning player idle with a pending rested bank (everyone
       banks on wall-clock) or a worker crew. This guard proves the source
       attaches `away` (RED against pre-fix index.ts) AND that the rested-only /
       worker-only responses pass the real client gate, while the same responses
       WITHOUT away read malformed — the class this would have caught. */
    const envAwayProblems = await accrueEnvelopeAwayGuard();
    if (envAwayProblems.length) {
      console.log('\nAccrue envelope contract (every accrued:true carries away) — FAILED:');
      for (const p of envAwayProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nAccrue-envelope-away guard — the standalone rested/worker settle attaches a '
        + 'well-formed away receipt (pure projection, no rolls); the real client gate accepts it '
        + 'and fails closed on a missing receipt.');
    }

    /* ── The catalogue-refill ownership interlock (b461) ─────────────────
       hr_unlock_offers is written by TWO generators. The shop one refilled with
       a bare `delete from public.hr_unlock_offers;`, so a regen deleted all 48
       worker_hire / farm_land / bank offers in PRODUCTION and three gold sinks
       started answering `unknown_offer`. The 08-19 file had warned about it in
       prose; prose is not an interlock. This replays the chain and then
       re-applies the shop catalogue ALONE — the exact operation that caused it. */
    const offerOwnerProblems = await unlockOfferOwnershipGuard();
    if (offerOwnerProblems.length) {
      console.log('\nUnlock-offer ownership — FAILED:');
      for (const p of offerOwnerProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nUnlock-offer ownership guard — each generator refills only the rows it owns; '
        + 're-applying the shop catalogue alone preserves all 48 gold-ladder offers.');
    }

    /* ── The SAME interlock, on the sibling table (b498) ─────────────────
       The guard above declared hr_unlocks out of scope — "whose merge rows are
       upserted rather than refilled and were therefore never at risk". That was
       false: 2026-08-16-unlocks.generated.sql refills hr_unlocks with a bare
       `delete from public.hr_unlocks;`, and its 2026-08-23 regen destroyed the
       17 non-shop companion rows in PRODUCTION, which then ran 65 rows against
       a repo that rebuilds 82 for a week. This replays that exact operation and
       requires the DECLARED repair list to restore the catalogue exactly. */
    const catOwnerProblems = await unlockCatalogueOwnershipGuard();
    if (catOwnerProblems.length) {
      console.log('\nUnlock-catalogue ownership — FAILED:');
      for (const p of catOwnerProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nUnlock-catalogue ownership guard — the chain rebuilds all 21 companion rows; '
        + 're-applying the wholesale unlock catalogue alone is repaired exactly by the declared '
        + 'repair list, which is cross-checked against the apply manifest.');
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

    /* ── The gold-site census (b354) ─────────────────────────────────────
       The same failure as the activity seam, applied to money — and with a
       worse symptom, because a gold site the server was never told about
       does not error. It goes on paying a client-authored number forever,
       under a green suite.

       The surface was hand-counted twice ("~40", then "47") by two agents
       with a scanner that was written, run and thrown away both times, and
       it was already wrong: b350's extraction moved legacy.js underneath
       it. This derives the site list from the SOURCE on every push and
       fails the build on any site missing from src/net/gold-sites.js —
       with a control that blinds one pattern and demands the count fall
       while staying above zero, because a scanner that reports 0 "drops"
       too. `node tests/gold-site-census.mjs --selftest` plants five real
       defects (two of them in a file that does not exist yet — the T6
       lesson) and every one must turn it red. */
    const goldCensus = await goldCensusGuard();
    if (goldCensus.problems.length) {
      console.log('\nGold-site census (every client gold write is declared) — FAILED:');
      for (const p of goldCensus.problems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log(`\nGold-site census — ${goldCensus.note}.`);
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

    const creditProblems = await combatCreditGuard();
    if (creditProblems.problems.length) {
      console.log('\nCombat-drop attribution guard — FAILED:');
      for (const p of creditProblems.problems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log(`Combat-drop attribution guard — ${creditProblems.note}.`);
    }

    const showTabProblems = await showTabOwnershipGuard();
    if (showTabProblems.problems.length) {
      console.log('\nshowTab owner guard — FAILED:');
      for (const p of showTabProblems.problems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log(`showTab owner guard — ${showTabProblems.note}.`);
    }

    const migProblems = await migrationGuard();
    if (migProblems.length) {
      console.log('\nMigration guard — FAILED:');
      for (const p of migProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Migration guard — every migration ends on a SQL terminator, no tool artifacts.');
    }

    const avatarProblems = await avatarAssetGuard();
    if (avatarProblems.length) {
      console.log('\nAvatar asset guard — FAILED:');
      for (const p of avatarProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Avatar asset guard — every referenced avatar asset exists and no shipped path starts with "_".');
    }

    const secretProblems = await secretGuard();
    if (secretProblems.length) {
      console.log('\nSecret guard — FAILED:');
      for (const p of secretProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Secret guard — no webhook URL, PAT or service-role key anywhere in the repo.');
    }

    const supplyProblems = await supplyChainGuard();
    if (supplyProblems.length) {
      console.log('\nSupply-chain guard — FAILED:');
      for (const p of supplyProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Supply-chain guard — no shipped module fetches executable code from an unverified origin.');
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

    const switchProblems = await slotSwitchGuard(browser, url, { root: ROOT });
    if (switchProblems.length) {
      console.log('\nSlot-switch guard (a hung server may not freeze the tab) — FAILED:');
      for (const p of switchProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Slot-switch guard — against a transport that never answers, the switch stays off the main '
        + 'thread, raises no native dialog, fails in bounded time and tells the player.');
    }

    /* b373: the generalisation of the slot-switch guard above. That one proves
       ONE path cannot freeze; this one proves no path under src/ can, by
       refusing a native confirm/prompt/alert call site anywhere. It is a static
       scan and needs no browser — the rename prompt that froze the b372 FTUE
       run sat one click from the most-visited screen and no in-page test ever
       reached it. */
    const nativeDialogProblems = await nativeDialogGuard(ROOT);
    if (nativeDialogProblems.length) {
      console.log('\nNative-dialog guard (no window.confirm/prompt/alert under src/) — FAILED:');
      for (const p of nativeDialogProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Native-dialog guard — no main-thread-blocking confirm/prompt/alert call site exists under '
        + 'src/, outside a documented allowlist.');
    }

    const iconOrderProblems = await iconBootOrderGuard(browser, url);
    if (iconOrderProblems.length) {
      console.log('\nIcon boot-order guard (no icon arrives after first paint) — FAILED:');
      for (const p of iconOrderProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Icon boot-order guard — the icon map is complete before the engine\'s first paint, '
        + 'and a late map still repaints the active screen.');
    }

    const landProblems = await landscapeGuard(browser, url);
    if (landProblems.length) {
      console.log('\nLandscape guard (820×360 phone) — FAILED:');
      for (const p of landProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Landscape guard — every screen fits a landscape phone, no sideways scroll.');
    }

    /* ── The reachability guard (b371) ──────────────────────────────────
       The landscape guard above asks whether a screen SPILLS SIDEWAYS. This
       one asks the question that has now shipped broken twice: can the player
       actually press the button. b366 put Eat and Stop below the fold of a
       landscape phone; b370 put FIGHT — the primary action of the primary
       screen — 8px below the fold of a 1366x768 laptop with nothing that
       scrolls, and the cure written for b366 was fenced inside a media query
       no desktop matches. Neither was visible to any test: the in-page suite
       runs at one desktop size and cannot see a fold at all.
       For each declared (screen, CTA) pair it scrolls only what a PLAYER can
       scroll — `scrollIntoView` moves `overflow:hidden` boxes and would have
       called the b370 defect reachable — then asserts the control is inside
       the viewport and that `elementFromPoint` at its centre returns it.
       `node tests/reachability.mjs --mutate` re-plants each shipped defect and
       fails if the guard lets one through. */
    const reachProblems = await reachabilityGuard(browser, url);
    if (reachProblems.length) {
      console.log('\nReachability guard (every primary CTA is pressable) — FAILED:');
      for (const p of reachProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Reachability guard — every declared primary CTA is on screen and hit-testable '
        + 'at 1366x768, 1280x800, 1440x900 and 922x423.');
    }

    /* ── The blob-retire capstone guard — runs after the pglite guards ───────
       The finish line: src/net/capstone.js retires the client save blob behind
       ONE flag (BLOB_RETIRED, DORMANT). Proven dormant (byte-for-byte: flag off,
       clientField reads G, snapshot() carries residue, canProceedArmed no-ops) and
       armed (clientField reads the server bag, the residue patch excludes authority
       fields, and — the anti-data-loss property — an absent/garbage/pre-envelope
       server answer leaves canProceedArmed FALSE so the client never authors or
       falls back to a local save). The load/save/reconcile SEAMS are gated in
       sync.js / auth.js / accrue.js; this proves the pure core they gate on.
       ⚠ MUST run after every bootReplay-based guard — importing its chain
       poisons pglite re-instantiation (see the note where this used to sit). */
    const { blobRetireGuard } = await import('./blob-retire.mjs');
    const blobRetireProblems = await blobRetireGuard();
    if (blobRetireProblems.length) {
      console.log('\nBlob-retire capstone guard — FAILED:');
      for (const p of blobRetireProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nBlob-retire capstone guard — dormant no-regression + armed server-load fail-closed (no local fallback).');
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
    /* ── "All green" MUST MEAN EVERY GUARD SPOKE (2026-08-17, review) ──────
       A run was observed reporting All green while one server-tier guard had
       silently not run at all. That is the worst possible failure for a test
       harness: the absence of a verdict rendered as a passing verdict, and
       nothing in the output distinguishes the two — the guard's paragraph is
       simply not there, and nobody counts paragraphs.

       So the manifest below is asserted against what was actually printed. It
       is checked ONLY when the run is otherwise green, deliberately: a guard
       that FAILS prints a different banner and would trip this too, producing a
       confusing second error on top of a real one.

       ⚠ THIS IS A MARKER CHECK, NOT A CALL-GRAPH CHECK, and the limitation is
         real: it proves each guard EMITTED ITS LINE, not that the line was
         earned. Rewording a banner fails the build until this list is updated —
         that is the intended cost, and it is one line. What it cannot see is a
         guard that prints its success banner while asserting nothing; that is
         what each guard's own `--mutate` harness is for. */
    const REQUIRED_GUARD_MARKERS = [
      'Core guard', 'Accrual guard', 'Auto-eat authority guard', 'Perk channel guard',
      'Artisan progress model guard', 'Goal counters guard', 'Artisan accrual guard',
      'Live settlement Phase 0', 'Equip intent (Phase 2)', 'Skill-row upsert',
      'Unlock purchase guard', 'Market v2 guard', 'Market intent guard',
      'Cutover import guard', 'Client write sweep guard', 'Client write sweep batch 3',
      'Client write sweep batch 4', 'Client write sweep batch 5', 'Bug-triage guard',
      'Display-prediction guard',
      'Goal-gold retune guard',
      'Clan-deposit ownership guard', 'Activity-seam guard', 'Delta-transport guard',
      'Reachability guard',
      'Identity guard', 'CORS preflight guard', 'Account-wall guard', 'Migration guard',
      'Icon boot-order guard', 'Avatar asset guard', 'showTab owner guard',
      'Secret guard', 'Slot-switch guard', 'Native-dialog guard',
    ];
    if (exitCode === 0) {
      const said = TRANSCRIPT.join('\n');
      const silent = REQUIRED_GUARD_MARKERS.filter((m) => !said.includes(m));
      if (silent.length) {
        console.log(`\n${silent.length} EXPECTED GUARD(S) NEVER REPORTED, yet the run was about to `
          + 'say All green. A guard that does not run is indistinguishable from one that passed, '
          + 'which is how a silent skip survives a review:');
        for (const m of silent) console.log(`  ? ${m}`);
        console.log('  If a banner was deliberately reworded, update REQUIRED_GUARD_MARKERS in '
          + 'tests/run-smoke.mjs in the same commit.');
        exitCode = 1;
      }
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
