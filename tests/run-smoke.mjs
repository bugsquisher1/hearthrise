// ============================================================
// tests/run-smoke.mjs — THE NODE GUARD SUITE (one step of the gate).
//
// Until the client reset (2026-10-17) this also booted the old client in
// headless Chromium and ran its in-page suite (src/features/smoke-test.js);
// that client and its suite are deleted. The new client is booted by
// tests/client-boot.mjs (its own CI step). What stays here is the node half:
// the server/engine/economy guards this file has always orchestrated, the
// catalogue and asset preflights, and the repo-wide secret, supply-chain,
// migration and edge-payload checks.
//
//   node tests/run-smoke.mjs
//
// Exit codes: 0 = all green · 1 = a guard is red · 2 = harness problem.
//
// ⚠ THIS FILE IS NOT THE GATE. IT IS ONE STEP OF THE GATE: the GitHub matrix
// (.github/workflows/smoke.yml) is, and `node tests/run-ci-local.mjs` derives
// the same list locally.
// ============================================================

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
import { unlockBuyGuard } from './unlock-buy.mjs';
import { marketV2Guard } from './market-v2.mjs';
import { runAll as equipIntentGuards } from './equip-intent.mjs';
import { runAll as eatIntentGuards } from './eat-intent.mjs';
import { guard as skillRowUpsertGuard } from './skill-row-upsert.mjs';
import { guard as leaderboardSourceGuard } from './leaderboard-server-source.mjs';
import { itemsCatalogueGuard, itemsCatalogueMutationGuard } from './items-catalogue.mjs';
import { clientWriteSweep2Guard } from './client-write-sweep-2.mjs';
import { clientWriteSweep3Guard } from './client-write-sweep-3.mjs';
import { clientWriteSweep4Guard } from './client-write-sweep-4.mjs';
import { clientWriteSweep5Guard } from './client-write-sweep-5.mjs';
import { bugTriageGuard } from './bug-triage.mjs';
import { nativeDialogGuard } from './native-dialog.mjs';
import { clanDepositOwnershipGuard } from './clan-deposit-ownership.mjs';
import { clanEconomySinksGuard } from './clan-economy-sinks.mjs';
import { feastCatalogueDriftGuard } from './clan-feast-catalogue-drift.mjs';
import { rpcGateBucketGuard } from './rpc-gate-bucket-guard.mjs';
import { heroSlotBuyGuard } from './hero-slot-buy.mjs';
import { accrueEnvelopeAwayGuard } from './accrue-envelope-away.mjs';
import { unlockOfferOwnershipGuard } from './unlock-offer-ownership.mjs';
import { unlockCatalogueOwnershipGuard } from './unlock-catalogue-ownership.mjs';
import { companionGrantHardeningGuard } from './companion-grant-hardening.mjs';
import { companionCodesSeverityGuard } from './companion-codes-severity.mjs';
import { runAll as artisanAccrualGuards } from './artisan-accrual.mjs';
import { runAll as activitySeamGuards } from './activity-seam.mjs';
import { runAll as liveSettlementGuards, engineGuard as settleReport,
  sqlGuard as settleSqlReport } from './live-settlement.mjs';
import { runAll as deltaTransportGuards } from './delta-transport.mjs';
import { runAll as jwtGuards } from './jwt-verify.mjs';
import { runAll as corsGuards } from './cors-preflight.mjs';
import { recipeYieldGuard, recipeYieldMutationGuard } from './recipe-yield-guard.mjs';
import { cacheBusterGuard, cacheBusterMutationGuard } from './cache-buster-guard.mjs';
import { pack as packEdge, runAll as packCheck } from '../tools/pack-edge.mjs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (process.env.GITHUB_ACTIONS === 'true') {
  let promoted = 0;
  for (const k of ['log', 'error']) {
    const orig = console[k].bind(console);
    console[k] = (...args) => {
      orig(...args);
      const line = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
      if (promoted < 10 && line.includes('✗')) {
        promoted++;
        const msg = line.split(String.fromCharCode(13)).join('').split(String.fromCharCode(10)).join(' ').split('%').join('%25').trim().slice(0, 600);
        process.stdout.write('::error title=smoke red::' + msg + String.fromCharCode(10));
      }
    };
  }
}

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

/* Everything this harness prints, kept so the run can assert at the end that
   every guard it expected actually reported. See REQUIRED_GUARD_MARKERS. */
const TRANSCRIPT = [];
{
  const real = console.log.bind(console);
  console.log = (...args) => { TRANSCRIPT.push(args.join(' ')); real(...args); };
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
//   A. ZERO TOLERANCE in shipped client source (src/**, old-client.html, sw.js and
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
    return rel.startsWith('src/') || /^[^/]+\.html$/.test(rel) || rel === 'sw.js'
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
  files.push(join(ROOT, 'index.html'), join(ROOT, 'play.html'));

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
  const isTest = (rel) => rel.includes('smoke-test.js')
    || rel.startsWith('src/features/smoke/')   // the suite is a directory since 2026-09-14
    || rel.startsWith('tests/');

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
  if (await catalogueDriftPreflight()) process.exit(1);
  if (await farmCataloguePreflight()) process.exit(1);
  if (await itemsCataloguePreflight()) process.exit(1);
  if (await recipeYieldPreflight()) process.exit(1);
  if (await unlockModelPreflight()) process.exit(1);
  /* `--preflights`: the data preflights above and nothing else (seconds, no browser, no replay). tools/lane-done.mjs runs
     this so a generated catalogue left stale by a data edit (the 2026-10-19 Unlock preflight red) cannot pass lane-done. */
  if (process.argv.includes('--preflights')) { console.log('run-smoke --preflights: every data preflight green'); process.exit(0); }
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
    /* ── The companion XP guard ──────────────────────────────────────────
       The per-action rule (companionActionXp / companionSpanXp) stays pinned;
       the ENGINE writer was deleted outright in lane C2, so the guard now
       proves no hunt, gather or bench night (attended or away) emits a
       companion_xp op or companion_xp_frac. */
    const companionXpProblems = companionXpGuard();
    if (companionXpProblems.length) {
      console.log('\nCompanion XP guard — FAILED:');
      for (const p of companionXpProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nCompanion XP guard — the per-action rule is pinned; the engine writes no companion XP '
        + '(deleted in lane C2) on a hunt, gather or bench night, attended or away.');
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

    /* tests/kill-time-drift.mjs and tests/combat-xp-cap-drift.mjs were RETIRED by the core rebuild
       (2026-10-19): src/core/kill-time.js (swing speed by weapon/style, deleted with the speed mods) and
       src/core/combat-xp-cap.js + hr_combat_xp_cap (the attended combat-XP door, dropped) are gone. Kill
       and XP bounds now live in the one settle: hr_hunt_apply_member's kills_over / value_over /
       death_xp_over, proven by tests/hunt-sessions-settle.mjs VALUE / DEATHXP. hr_bounty_kill_cap
       remains only for the dormant bounty surface (handed to the dormant-surface lane). */

    /* tests/combat-xp-settle-split.mjs and tests/combat-xp-settle-first.mjs
       were RETIRED by lane C2 (closed rebuild, 2026-10-14): both graded the
       combat_xp_accrued_to watermark between the client's ATTENDED combat-XP
       credit (hr_credit_combat_xp) and the away span. A fight is now a hunt
       session priced ONLY by hunt_settle / the world tick — there is no attended
       credit and no away combat span, so there is no second payer to split
       against. One payer is proven by tests/hunt-sessions-settle.mjs BOTH-PATH.
       Deliberately unregistered, not forgotten. */

    /* ── Room identity perks (b521, Designer ruling 1b) ─────────────────────
       With the Forge/Workshop PERMISSION gate gone, each room must sell its
       identity mechanic from the rung a player can afford: the extra bar and
       the free craft ladder 1/2/4/6/8% from rung 1 instead of appearing at the
       tier-3 rung most accounts never reach. Graded through src/core/perks.js
       — the adapter BOTH sides read — so a rung-1 owner's proc chance is
       proven to arrive, not merely to exist in the generated table. The 8%
       ceiling (b227 power budget) is pinned in the same pass. */
    const { roomIdentityPerksGuard } = await import('./room-identity-perks.mjs');
    const identityProblems = await roomIdentityPerksGuard();
    if (identityProblems.length) {
      console.log('\nRoom identity perks guard — FAILED:');
      for (const p of identityProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nRoom identity perks guard — Forge yield_smithing / Workshop craftSave pay from rung 1; ceiling still 8%.');
    }

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
    /* set_activity refuses, on shape, a bench the engine cannot pay (S6/S6d),
       and the gather catalogue has one shape in data and engine (S3). See
       tests/activity-seam.mjs. */
    const activitySeamProblems = await activitySeamGuards();
    if (activitySeamProblems.length) {
      console.log('\nActivity seam guard (set_activity refuses an unpayable bench) — FAILED:');
      for (const p of activitySeamProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nActivity seam guard — set_activity refuses an unpayable bench on shape; gather catalogue agrees.');
    }
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

    /* ── The market's EDGE half (b355) RETIRED 2026-10-19: the market_list / market_cancel /
       market_buy edge verbs left with the old market (Security, reopen review); the SQL half's
       revocation is its own lane. tests/market-intent.mjs retired with them. */

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

    /* ── The activity-intent contract (collect-before-switch et al.) ─────
       2026-08-31: this test sat RED and ORPHANED for a week — invoked by
       nothing, failing on its own anti-vacuity controls after the world
       became fully payable (found by the ammo lane; the CI-masking class in
       miniature). Wired here as a spawned script (it is main-style, not an
       exported guard) so it can never orphan again: a red exit fails the
       build by name. 22 groups on real PG18 + the deployed intent module. */
    try {
      const { spawnSync } = await import('node:child_process');
      const r = spawnSync(process.execPath, [join(ROOT, 'tests', 'activity-intent.mjs')],
        { encoding: 'utf8', timeout: 600_000 });
      if (r.status !== 0) {
        console.log('\nActivity-intent contract — FAILED:');
        console.log((r.stdout || '').split('\n').slice(-12).join('\n'));
        console.log(r.stderr || '');
        exitCode = 1;
      } else {
        console.log('\nActivity-intent contract — collect-before-switch, forfeit partition, refusal '
          + 'envelopes and the skip taxonomy all hold on a full PGlite chain.');
      }
    } catch (e) {
      console.log('\nActivity-intent contract — FAILED:\n' + String(e.message || e));
      exitCode = 1;
    }

    /* ── The generalized cron-health detector (the b319 lesson) ──────────
       hr_cron_health alarmed on the size of ONE hardcoded table. b319's own
       migration says a policy that cannot fire is worse than no policy, so this
       guard asserts every ARM fires at its fuse (database size + growth,
       per-table size + growth + row delta, connection headroom, the never-ran
       escalation), that NONE fires on a healthy database, that the sensitivity
       scale which makes the first half testable cannot be raised into an off
       switch, and that the detector's own tables are bounded and unreachable by
       a client. `--selftest` plants eight real defects (every one must read RED) plus three
       HARNESS defects — a second sample that never arrived — which must abort
       loudly instead of reading as "the arm did not fire". */
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
      // A HARNESS fault means the guard could not take its own measurement (the
      // second hr_db_samples row never arrived, the replay would not boot), so
      // NOTHING was graded. Saying "FAILED" there blames the detector for the
      // harness, which is how a real red gets read as a flake and re-run.
      console.log(`\nCron-health guard — ${e.harness ? 'HARNESS FAULT (nothing graded)' : 'FAILED'}:\n`
        + String(e.message || e));
      exitCode = e.harness ? 2 : 1;
    }

    /* The b497 goal-gold retune guard (tests/goal-gold-retune.mjs) was deleted with
       daily quests in the 2026-10-14 demolition; its migration stays in the chain. */
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

    /* ── The HERO-SLOT purchase guard (2026-09-08) ───────────────────────
       Three live defects in one surface. The Buy button was LIT AND DEAD:
       hr_unlock_offers refuses the character_slot namespace by construction
       (a hero slot is priced in gems and that catalogue has a gold column
       and no other), and the only other path was a client-side G.gems debit
       the next envelope reconciles away — so the click dead-ended through a
       confirm modal with no visible outcome. Ownership was client-authored
       in the G.heroSlotsUnlocked residue, which is the b371 gem dupe
       ("the purchase became free"). And hr_create_character validated its
       slot for SHAPE ONLY, so {"p_slot":4} minted a fifth character with a
       full starting kit for nothing — the whole 3,100-gem ladder bypassed
       by one fetch, five times over.
       The guard drives a real player through the real rate-gated
       hr_buy_hero_slot on a fully replayed PGlite chain: shape and catalogue
       refusals, the ladder, the exact debit from the CALLING character's
       wallet with the entitlement on the ACCOUNT row, the idempotent replay,
       already_owned, insufficient-then-buyable-with-the-same-key, the
       grandfathered two-character account (the production shape — zero
       character_slot flag rows), the premium waiver as OWNERSHIP rather
       than a price of zero, cross-verb key reuse, the create gate, and the
       account-scoped projection. It also BINDS the three copies of the price
       ladder — src/multi-character.js SLOT_COSTS_GEMS, the generated
       src/data/shops.js offers, and public.hr_hero_slots — so a price that
       differs by one gem fails the build by name.
       `--selftest` plants sixteen real defects; every one must read RED. */
    const heroSlotProblems = await heroSlotBuyGuard();
    if (heroSlotProblems.length) {
      console.log('\nHero-slot purchase — FAILED:');
      for (const p of heroSlotProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nHero-slot guard — server-priced, ladder-ordered, debited once from the wallet '
        + 'the player can see, entitlement on the account row, idempotent on replay, grandfathered '
        + 'characters kept, the premium waiver expressed as ownership rather than a free price, and '
        + 'the free-character mint closed.');
    }

    /* (b497 Auto-Eat-at-creation guard retired by lane C2 — see the import note.) */

    /* THE COMBAT STYLE guard (tests/combat-style.mjs) RETIRED 2026-10-19 (core rebuild): combat styles are
       deleted; a blow's XP goes to the weapon family's skill, guarded in the one engine by
       tests/hunt-core/xp-share.mjs (the xp-routes case and its mutants). */

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

    /* ── The three SECURITY conditions on hr_companion_grant ─────────────
       The reseed above ARMED an already-live client-callable RPC. C1 turns the
       storage guard's 23514 into a machine code instead of a PostgREST 500 the
       client cannot tell from an outage; C2 ENFORCES the whelp req_item, which
       measured its precondition and granted anyway; C3 renames the client's
       p_source to `claimed_source` so the ledger stops presenting it as a peer
       of the server-derived catalogue_source.

       Driven through the REAL RPC on a rebuilt database, with the two arms the
       migration's own §4 cannot run: C1's second layer with the pre-check
       neutralised (a single backend cannot race the catalogue delete), and the
       derivation chain — 2026-08-22-companion-grant.sql is GENERATED and still
       carries the pre-hardening body, so re-applying it alone reverts all three
       in silence. See tests/companion-grant-hardening.mjs. */
    const cgHardenProblems = await companionGrantHardeningGuard();
    if (cgHardenProblems.length) {
      console.log('\nCompanion-grant hardening (C1 machine code · C2 req_item · C3 claimed_source) '
        + '— FAILED:');
      for (const p of cgHardenProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nCompanion-grant hardening guard — a missing companion:<id> catalogue row '
        + 'answers unknown_unlock:<key> on both layers without consuming the req_item, whelp is '
        + 'refused without its dragon_egg and consumes exactly one when held, the ledger separates '
        + 'claimed_source from catalogue_source, every other storage-guard violation still '
        + 'propagates, and the hardening file is the manifest\'s last toucher of the RPC.');
    }

    /* ── C6: the two new refusal codes join the severity taxonomy ─────────
       The hardening above gave hr_companion_grant two machine refusals and
       journalled both through hr_record_rejection — which grades severity from
       its OWN arrays, and neither code was in either, so both landed 'normal'
       forever, at any n. Security's C6 ruling files them separately, because
       they are separate populations: `unknown_unlock` is a destroyed unlock
       catalogue (never player behaviour, damage on call ONE) and becomes an
       INCIDENT on its first occurrence; `missing_req_item` is a stale client
       once and a signature fifty times, so it ESCALATES on the existing
       50/user/slot/day counter.

       Measured through the real function AND end-to-end through the real RPC
       with the code read off the row the verb wrote — the only thing that can
       see the emitted code drifting from the graded code — plus the two
       controls that make the proof non-vacuous (one occurrence must STAY
       normal; an unclassified code must stay normal at ANY n) and a dual-shape
       arm that applies the migration to the COMMENT-STRIPPED body production
       actually runs. See tests/companion-codes-severity.mjs. */
    const codeSevProblems = await companionCodesSeverityGuard();
    if (codeSevProblems.length) {
      console.log('\nCompanion-code severity (C6: unknown_unlock incident · missing_req_item '
        + 'escalates) — FAILED:');
      for (const p of codeSevProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('\nCompanion-code severity guard — unknown_unlock is an incident on its FIRST '
        + 'occurrence and missing_req_item stays normal on its first and escalates at '
        + 'c_escalate_at, proven through the real hr_record_rejection and end-to-end through the '
        + 'real hr_companion_grant; an unclassified control code stays normal at any n; every '
        + 'incumbent code survived the patch; the ACL is unchanged across the definer-body '
        + 'replace; and both anchors match the comment-stripped body production runs.');
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

    const supplyProblems = await supplyChainGuard();
    if (supplyProblems.length) {
      console.log('\nSupply-chain guard — FAILED:');
      for (const p of supplyProblems) console.log(`  ✗ ${p}`);
      exitCode = 1;
    } else {
      console.log('Supply-chain guard — no shipped module fetches executable code from an unverified origin.');
    }

    /* b373: no path under src/ can freeze the tab, by
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

    /* ── "All green" MUST MEAN EVERY GUARD SPOKE (2026-08-17, review) ──────
       The manifest below is asserted against what was actually printed, ONLY
       when the run is otherwise green: a guard that does not run is otherwise
       indistinguishable from one that passed. A retired guard leaves this list
       in the SAME commit. */
    const REQUIRED_GUARD_MARKERS = [
      'Core guard', 'Accrual guard', 'Auto-eat authority guard', 'Perk channel guard',
      'Artisan progress model guard', 'Goal counters guard', 'Artisan accrual guard',
      'Live settlement Phase 0', 'Equip intent (Phase 2)', 'Skill-row upsert',
      'Unlock purchase guard', 'Market v2 guard',
      /* 'Market intent guard' — REMOVED 2026-10-20: tests/market-intent.mjs retired with the market edge verbs
         in e634976 (2026-10-19), which left its marker here; masked on main until the native-dialog red cleared. */
      /* 'Cutover import guard' — REMOVED 2026-09-07 with tests/cutover-import.mjs, whose
         subject hr_import_apply is dropped by 2026-09-07-drop-dead-server-objects.sql. A
         retired guard must leave this list in the SAME commit, or the run reports it as
         never-reported — which is the right alarm and the wrong cause. */
      'Client write sweep guard', 'Client write sweep batch 3',
      'Client write sweep batch 4', 'Client write sweep batch 5', 'Bug-triage guard',
      
      /* 'Goal-gold retune guard' — REMOVED 2026-10-17: its guard left with the demolition's daily quests (c0a11d871). */
      'Clan-deposit ownership guard', 'Delta-transport guard',
      
      'Identity guard', 'CORS preflight guard', 'Migration guard',
      
      'Secret guard', 'Native-dialog guard',
      /* Every census, by name. Each is the only thing in the tree that can
         see its own class of write — a silent skip of any one of them is
         exactly the state the codebase was already in. */
      
      
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
    }    if (exitCode === 0) console.log('\nAll green.\n');
  } catch (err) {
    console.error('\nHarness failure:', err.message);
    exitCode = 2;
  } finally {
    /* A failing run leaves its whole transcript where the CI artifact step globs. */
    if (exitCode !== 0) {
      try {
        await writeFile(join(ROOT, 'tests', 'smoke-run.log'),
          `# run-smoke.mjs failure transcript — exitCode ${exitCode} — ${new Date().toISOString()}\n\n`
          + TRANSCRIPT.join('\n') + '\n', 'utf8');
      } catch { /* forensics are best-effort; never mask the real failure */ }
    }
  }
  /* process.exitCode, never process.exit(): Node 24 on win32 aborts a process
     that has used fetch() when exit() is called (the exit code becomes 127). */
  process.exitCode = exitCode;
};

run();
