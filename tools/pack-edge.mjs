#!/usr/bin/env node
// ============================================================================
// tools/pack-edge.mjs — ship src/core and src/data to a Deno Edge Function
// WITHOUT ever making a second copy of them.
//
// ── THE PROBLEM ────────────────────────────────────────────────────────────
// `src/core/*.js` and `src/data/*.js` are pure ESM and import each other with a
// `?v=NNN` query string — a BROWSER cache-buster (CLAUDE.md, "Build + ship
// workflow": a static import does not inherit index.html's version, so an
// unversioned one runs old code for ten minutes after every deploy).
//
// A Supabase Edge Function must ship its dependencies, and the deploy payload
// is a flat list of (name, content). Those files live OUTSIDE
// supabase/functions/, so their repo paths cannot be used as deploy names.
//
// The three tempting answers are all wrong:
//   • copy src/core into supabase/functions/_shared/  → a committed second copy
//     of the simulation. This repo has the receipt for what that costs: the
//     `unifyObject` header at src/main.js:36 documents an ESM/legacy data
//     double-copy that silently split the dataset so authored content never
//     reached the engine.
//   • strip the `?v=` by hand at deploy time → a manual step that is wrong the
//     first time someone is in a hurry, and it makes the deployed bytes differ
//     from the reviewed bytes.
//   • import from https://hearthrise.net/src/core/… → elegant (the `?v=` does
//     its real job, and there is literally one copy) and REJECTED on security:
//     it makes whoever controls the static host able to replace the code
//     running inside the privileged accrual engine. A server-authoritative
//     engine may not fetch its own rules over the network.
//
// ── THE `?v=` QUESTION IS SETTLED, AND NOT THE WAY THIS FILE USED TO SAY ───
// This header, and `docs/design/HANDOFF-server-authority.md`, both used to
// record: "keep the `?v=`, a module specifier is a URL in both runtimes and the
// query is not part of the file lookup — no `--strip-query` needed." That was
// backed by a REAL local proof (Deno 2.9.5, `deno check` + `deno bundle
// --platform=deno` built the whole 32-module graph with `?v=326` intact) and it
// carried its own caveat: "not yet run against Supabase's hosted eszip, which is
// the same deno_graph but not identical."
//
// The caveat was the true part. First real deploy, CLI 2.114.0:
//
//   WARN: failed to read file: open .../vendor/core/combat.js?v=326: no such
//         file or directory
//   unexpected deploy status 400: {"message":"Failed to bundle the function
//   (reason: Module not found \"file:///tmp/user_fn_.../vendor/core/combat.js
//   ?v=326\". at .../accrual.js:38:8)."}
//
// **Supabase's hosted bundler resolves a relative specifier as a literal FILE
// PATH, query string included.** Local `deno bundle` does not. EXECUTION WINS:
// a payload carrying `?v=` on a relative specifier cannot deploy, so it is not
// a payload. The lesson worth more than the fix: a proof run against a
// near-identical stand-in is evidence, not a result, and the caveat attached to
// it was load-bearing rather than decorative.
//
// ── THE MECHANISM ──────────────────────────────────────────────────────────
// This tool walks the static import graph from an Edge Function's entrypoint,
// collects every reachable `src/core` and `src/data` module, and emits the
// deploy payload with:
//
//   • the core and data files placed as flat siblings under `vendor/core/` and
//     `vendor/data/`, with ONE mechanical transform applied: `?v=NNN` removed
//     from relative import specifiers (`stripVersionQueries`), and nothing
//     else. `--check` asserts exactly that — `packed === strip(disk)` — so the
//     transform is verified, not trusted.
//   • the function's OWN files with exactly two path prefixes substituted:
//     `../../../src/core/` → `./vendor/core/` and `../../../src/data/` →
//     `./vendor/data/`, then the same strip (a no-op there — see below).
//
// ── WHY BYTE-IDENTICAL VENDORING HAD TO GO, AND WHAT REPLACED IT ───────────
// The previous revision defended "the vendored files are byte-identical to the
// repo" at length, and it was defending something real: no drift between the
// rules the server runs and the rules the client runs. But byte-identity was
// always the MEANS; the end was "the server runs exactly the rules the client
// does", and a payload that cannot deploy runs no rules at all.
//
// So the invariant is deliberately weakened by exactly one step, and it is
// still an invariant that a test can hold:
//
//     vendored payload bytes === stripVersionQueries(repo bytes)
//
// — identical after ONE mechanical, total, verifiable transform, rather than
// identical outright. `--check` asserts that equation against the raw bytes on
// disk. A pack() that started rewriting anything else still fails there.
//
// ── WHY THE STRIP IS UNCONDITIONAL, NOT A FLAG ─────────────────────────────
// `--strip-query` used to exist as an opt-in escape hatch. It is GONE, and not
// because the default flipped:
//
//   • **A flag someone must remember is the weakest of the three options.** The
//     deploy is a hand-run command; the guard is a test. Two call sites that
//     must pass the same flag to agree is a coin flip, and the failure is
//     silent (the smoke guard would report a permanent hash mismatch, and the
//     obvious "fix" is to loosen the comparison — which turns the one check
//     that proves deployed bytes equal reviewed bytes into decoration).
//   • **pack() therefore takes no option that can change the payload.** The
//     guard and the deploy pack identically BY CONSTRUCTION — there is no
//     parameter left for them to disagree on — rather than by two call sites
//     happening to pass the same argument today.
//   • A transform you always apply is exercised on every run; a transform
//     behind a flag is exercised the day it is needed and never before.
//
// A useful side effect, stated so nobody treats it as an accident: because the
// `?v=` is stripped, **a cache-buster bump no longer moves the payload hash.**
// `./bump-version.sh 332` rewrites `src/core/*` but the packed bytes are
// unchanged, so a bump alone no longer demands a redeploy. (Worked example in
// the handoff — `fb18806…` → `d362761…` was b330 → b331 with no code change at
// all. That churn is gone.)
//
// ── THE FUNCTION'S OWN FILES CARRY NO `?v=` AT ALL ─────────────────────────
// `bump-version.sh` walks `src/` only (`find src -name '*.js'`), so
// `supabase/functions/**` was outside it and its imports sat frozen at `?v=326`
// while their targets moved to `?v=331` — five builds of silent drift, invisible
// because the query is inert in Node. The fix is not to widen the bump: a
// cache-buster is a BROWSER mechanism, and these files are never served to a
// browser. The query was removed from them, and `versionQueryGuard()` below
// fails the build if one ever comes back. Same reasoning, same fix, for
// `tests/accrual-engine.mjs`, which was frozen at `?v=326` for the same reason.
//
// ── WHAT `--check` PROVES, AND WHAT IT DOES NOT (review S10) ───────────────
// `--check` is a PACKABILITY check. It answers "can this function be packed,
// and is the result self-consistent?" — a missing module, a bare specifier, a
// dynamic import() the walker cannot follow, a specifier escaping the two
// vendor roots, a leftover `../../../src/` in a packed function file, a
// vendored file that packing modified beyond the one allowed transform, or —
// since the failed deploy — any relative specifier in the payload still
// carrying a `?v=` the hosted bundler would treat as part of the filename.
//
// It is NOT, and cannot be, a check that production matches this repo. An
// earlier revision claimed to be exactly that — it called pack(), re-read the
// same paths, re-applied the same pure transform and compared. Both sides came
// from the same bytes through the same function, so `expect !== f.content` was
// unfalsifiable. That is the sixth instance of this class in this program (the
// always-null-probe shape), and it is why the two comparisons below now work
// AGAINST THE RAW DISK BYTES and through the INVERSE substitution:
//
//   • a vendored file must equal `readFile(origin)` verbatim — no transform is
//     applied to either side, so a future pack() that started rewriting vendored
//     content would fail here;
//   • a function file must satisfy `inverse(packed) === readFile(origin)`. The
//     inverse is a different function from the forward one, so this is a
//     round-trip property rather than a restatement.
//
// THE DRIFT THAT ACTUALLY MATTERS — deployed bytes vs repo bytes — is answered
// by `payloadHash()`. pack() stamps the sha256 of the payload into the packed
// copy of `payload-hash.js`; the deployed function returns it from a `GET`; the
// smoke suite fetches that and compares it with `payloadHash()` recomputed from
// the repo. That is a comparison between two independently-sourced values, which
// is the only kind worth making.
//
// ── COST, STATED ───────────────────────────────────────────────────────────
//   • The deployed function carries a snapshot of core+data (~140 KB). It must
//     be REDEPLOYED when either changes — which is true of any Edge Function
//     with dependencies, but it is now a release-checklist item rather than
//     something that happens for free. The payload hash is what turns "somebody
//     forgot" into a failing test.
//   • The two prefix substitutions are a transformation, and a transformation
//     is a thing that can be wrong. It is confined to files under
//     supabase/functions/, never to authored game data.
//
// Usage:
//   node tools/pack-edge.mjs hr-accrue            # print the payload as JSON
//   node tools/pack-edge.mjs hr-accrue --check    # verify, print a summary
//   node tools/pack-edge.mjs hr-accrue --hash     # print the payload sha256
//   node tools/pack-edge.mjs hr-accrue --out dir  # write the payload to a dir
// There is deliberately no flag that changes the payload. See above.
// ============================================================================

import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const FUNCTIONS = join(ROOT, 'supabase', 'functions');

/* The only two roots a function may vendor from. Anything else is a mistake we
   want to hear about at pack time, not at deploy time: `src/features/*` is not
   DOM-free and `src/legacy.js` is the monolith. */
const VENDOR_ROOTS = [
  { repo: join('src', 'core'), packed: 'vendor/core' },
  { repo: join('src', 'data'), packed: 'vendor/data' },
];

const toPosix = (p) => p.split(sep).join('/');

/* Static import/export specifiers. Deliberately NOT a full parser: core and
   data are plain ESM with one specifier per line, and a regex that can be read
   in five seconds is worth more here than a dependency. A dynamic import()
   would be missed — which is why `--check` also asserts none exists. */
const SPECIFIER_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /\bimport\s*\(/;

function specifiersOf(src) {
  const out = [];
  let m;
  SPECIFIER_RE.lastIndex = 0;
  while ((m = SPECIFIER_RE.exec(src))) out.push(m[1]);
  return out;
}

/** Strip the browser cache-buster to get a filesystem path. */
const bare = (spec) => spec.split('?')[0];

function vendorFor(absPath) {
  const rel = relative(ROOT, absPath);
  for (const v of VENDOR_ROOTS) {
    if (rel === v.repo || rel.startsWith(v.repo + sep)) {
      return { root: v, name: v.packed + '/' + toPosix(relative(join(ROOT, v.repo), absPath)) };
    }
  }
  return null;
}

/* THE ONE ALLOWED TRANSFORM ON VENDORED CONTENT.
   Remove `?v=NNN` from relative import specifiers. Nothing else — not from a
   bare/npm/https specifier, not from a string that is not an import, not from
   an asset URL. Total and mechanical, so `packed === strip(disk)` is a property
   `--check` can assert rather than a claim it has to take on faith. */
export function stripVersionQueries(src) {
  return src.replace(/(from\s*['"]\.[^'"]*?)\?v=\d+(['"])/g, '$1$2');
}

/* THE GUARD THE FAILED DEPLOY BOUGHT. Broader than the transform, deliberately:
   `stripVersionQueries` only understands `… from '…'`, so a side-effect import
   (`import './x.js?v=331';`) or an `import()` would slip past it and produce a
   payload the hosted bundler rejects with a message three layers from the cause.
   This looks for the SHAPE that breaks — any relative specifier still carrying a
   `?v=` — in the packed bytes, and fails the pack. A payload that cannot deploy
   must fail here, on a laptop, with the filename in the message.

   The second alternative catches the indirection that would otherwise walk
   straight past a specifier-shaped regex: `const V = '?v=328'` followed by
   an `import()` of a template literal ending in that constant, which is exactly
   what tests/conservation-fuzz.mjs was doing, frozen three builds back. */
const PACKED_QUERY_RE = /['"](\.[^'"]*\?v=\d+|\?v=\d+)['"]/g;

export function versionQueriesIn(src) {
  const out = [];
  let m;
  PACKED_QUERY_RE.lastIndex = 0;
  while ((m = PACKED_QUERY_RE.exec(src))) out.push(m[1]);
  return out;
}

/** Apply the two — and only two — prefix substitutions, then the strip. */
export function rewriteFunctionSource(src) {
  return stripVersionQueries(
    src
      .replaceAll('../../../src/core/', './vendor/core/')
      .replaceAll('../../../src/data/', './vendor/data/'));
}

/** The INVERSE of the two substitutions. Exists so `--check` can verify a
    ROUND TRIP against the bytes on disk instead of re-running the forward
    transform and comparing it to itself (review S10). */
export function unrewriteFunctionSource(packed) {
  return packed
    .replaceAll('./vendor/core/', '../../../src/core/')
    .replaceAll('./vendor/data/', '../../../src/data/');
}

// ── The payload fingerprint ─────────────────────────────────────────────────
// `payload-hash.js` ships inside the payload carrying the sha256 of the payload
// it belongs to. The digest is taken with THIS file's content in its repo
// (placeholder) form, so it never depends on itself and anyone holding the repo
// can recompute it exactly.
export const HASH_FILE = 'payload-hash.js';
export const HASH_PLACEHOLDER = 'unpacked';

/** sha256 over `name\0content\0` for every file, name-sorted. */
export function payloadHash(files) {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    h.update(f.name); h.update('\0'); h.update(f.content); h.update('\0');
  }
  return h.digest('hex');
}

/** Vendored files ship with the one allowed transform applied, always. */
export function vendorSource(src) {
  return stripVersionQueries(src);
}

/**
 * Walk the graph from a function's entrypoint.
 *
 * Takes NO options that can change the payload. That is the property which
 * makes the smoke suite's hash guard and the deploy pack identically by
 * construction; do not add one back.
 *
 * @returns { files: [{name, content, origin}], problems: [string], hash }
 */
export async function pack(fnName) {
  const fnDir = join(FUNCTIONS, fnName);
  const problems = [];
  const files = new Map();        // packed name → { content, origin }
  const seen = new Set();

  const entryCandidates = ['index.ts', 'index.js'];
  let entry = null;
  for (const c of entryCandidates) {
    try { await readFile(join(fnDir, c)); entry = join(fnDir, c); break; } catch { /* next */ }
  }
  if (!entry) return { files: [], problems: [`no entrypoint (${entryCandidates.join(' | ')}) in ${fnName}`] };

  async function visit(abs, packedName, isFunctionFile) {
    const key = resolve(abs);
    if (seen.has(key)) return;
    seen.add(key);

    let src;
    try { src = await readFile(abs, 'utf8'); }
    catch { problems.push(`missing module: ${toPosix(relative(ROOT, abs))}`); return; }

    if (DYNAMIC_RE.test(src) && isFunctionFile) {
      problems.push(`${packedName}: dynamic import() — the packer cannot follow it; use a static import`);
    }

    files.set(packedName, {
      content: isFunctionFile ? rewriteFunctionSource(src) : vendorSource(src),
      origin: toPosix(relative(ROOT, abs)),
      vendored: !isFunctionFile,
    });

    for (const spec of specifiersOf(src)) {
      // Remote and npm: specifiers are the runtime's problem, not ours.
      if (/^(npm:|jsr:|node:|https?:|data:)/.test(spec)) continue;
      if (!spec.startsWith('.')) {
        problems.push(`${packedName}: bare specifier '${spec}' — add it to the import map or vendor it`);
        continue;
      }
      const abs2 = resolve(dirname(abs), bare(spec));
      const v = vendorFor(abs2);
      if (v) { await visit(abs2, v.name, false); continue; }
      const relFn = relative(fnDir, abs2);
      if (relFn.startsWith('..')) {
        problems.push(
          `${packedName}: '${spec}' resolves outside the function AND outside ` +
          `${VENDOR_ROOTS.map((r) => toPosix(r.repo)).join(' / ')} — refusing to vendor it`);
        continue;
      }
      await visit(abs2, toPosix(relFn), true);
    }
  }

  await visit(entry, toPosix(relative(fnDir, entry)), true);

  // deno.json / deno.jsonc ride along untouched if present.
  for (const cfg of ['deno.json', 'deno.jsonc']) {
    try {
      const content = await readFile(join(fnDir, cfg), 'utf8');
      files.set(cfg, { content, origin: toPosix(relative(ROOT, join(fnDir, cfg))), vendored: false, config: true });
    } catch { /* optional */ }
  }

  const out = [...files].map(([name, f]) => ({
    name, content: f.content, origin: f.origin, vendored: f.vendored, config: f.config,
  }));

  /* THE DEPLOY-BLOCKING GUARD. Runs on the FINAL bytes, after every transform,
     so it cannot be fooled by a transform that thinks it did its job. See
     `PACKED_QUERY_RE` — this is the shape the hosted bundler chokes on. */
  for (const f of out) {
    for (const spec of versionQueriesIn(f.content)) {
      problems.push(
        `${f.name}: the packed bytes still carry '${spec}' — Supabase's hosted bundler resolves a `
        + `relative specifier as a literal FILE PATH, query included, and rejects the deploy with `
        + `"Module not found". A ?v= cache-buster is a browser mechanism and must not reach the payload.`);
    }
  }

  /* THE FINGERPRINT. Taken over the payload as it stands — with payload-hash.js
     still carrying the placeholder — and then stamped into that one file. The
     digest therefore never depends on itself, and `payloadHash(pack().files)`
     deliberately does NOT equal it: the value that travels is the one below, and
     it is the one the deployed function reports. */
  const hash = payloadHash(out);
  const stamped = out.find((f) => f.name === HASH_FILE);
  if (stamped) {
    if (!stamped.content.includes(`'${HASH_PLACEHOLDER}'`)) {
      problems.push(`${HASH_FILE}: the placeholder '${HASH_PLACEHOLDER}' is missing — a committed hash is a STALE hash`);
    }
    stamped.content = stamped.content.replace(`'${HASH_PLACEHOLDER}'`, `'${hash}'`);
  }

  return { files: out, problems, hash };
}

/**
 * THE PACKABILITY CHECK. See the header for what this does and does not prove:
 * it is not, and cannot be, a deployed-vs-repo comparison — `payloadHash()` and
 * the function's `GET` are what answer that question.
 *
 * What it does assert, all against the RAW bytes on disk rather than against a
 * re-run of the transform under test:
 *   • every module in the graph exists and is reachable by a static specifier;
 *   • a vendored file equals `stripVersionQueries(source)` — the ONE allowed
 *     transform and nothing else, so a pack() that started rewriting vendored
 *     content still fails here;
 *   • a function file round-trips: `unrewrite(packed) === disk`;
 *   • no `../../../src/` survived into a packed function file;
 *   • no relative specifier in the payload still carries a `?v=` (in pack());
 *   • no file under `supabase/functions/**` carries a `?v=` ON DISK either —
 *     `bump-version.sh` cannot reach them, so a version there can only drift;
 *   • the repo's payload-hash.js still holds the placeholder, never a stale hash.
 */
export async function check(fnName) {
  const { files, problems } = await pack(fnName);
  const out = [...problems];
  if (!files.length) return out;

  for (const f of files) {
    const src = await readFile(join(ROOT, f.origin), 'utf8');

    if (f.name === HASH_FILE) {
      /* Generated: its packed content is the repo content with the placeholder
         replaced. Assert both halves of that — the repo copy must still be a
         placeholder (a committed hash would be stale on the next core edit) and
         the packed copy must carry a real digest. */
      if (!src.includes(`'${HASH_PLACEHOLDER}'`)) {
        out.push(`${f.name}: the repo copy must contain '${HASH_PLACEHOLDER}' — a committed hash is a stale hash`);
      }
      if (!/PAYLOAD_SHA256 = '[0-9a-f]{64}'/.test(f.content)) {
        out.push(`${f.name}: the packed copy was not stamped with a sha256`);
      }
      continue;
    }

    if (f.config) {
      if (f.content !== src) out.push(`${f.name}: a config file rides along untouched — it must equal ${f.origin}`);
      continue;
    }

    if (f.vendored) {
      /* THE WEAKENED-BUT-STILL-HELD INVARIANT (see the header). Byte-identity
         had to go — the hosted bundler rejects the `?v=` — so what stands in its
         place is identity after ONE named, total, mechanical transform. The
         right-hand side is the raw disk bytes put through that transform, not a
         re-run of pack(), so a future pack() that started rewriting anything
         else about vendored content still fails here. */
      if (f.content !== stripVersionQueries(src)) {
        out.push(`${f.name}: a VENDORED file was modified beyond the ?v= strip — it must equal stripVersionQueries(${f.origin})`);
      }
      continue;
    }

    /* ROUND TRIP. `unrewriteFunctionSource` is a different function from the one
       that produced `f.content`, so this cannot pass by construction the way the
       previous `expect !== f.content` did. */
    const back = unrewriteFunctionSource(f.content);
    /* The ?v= strip is not invertible, so the disk side is normalised the same
       way. That is NOT a hole: `versionQueryGuard()` separately asserts the disk
       side has no `?v=` at all, which makes this normalisation a provable no-op
       rather than a place a difference could hide. */
    const want = stripVersionQueries(src);
    if (back !== want) {
      out.push(`${f.name}: packing is not reversible — unrewrite(packed) differs from ${f.origin}`);
    }
    /* The substitution must be total. A leftover `../../../src/` in a packed
       function file would resolve outside the payload and fail at deploy time
       with a message about a missing module, three layers from the cause. */
    if (f.content.includes('../../../src/')) {
      out.push(`${f.name}: an unrewritten '../../../src/' path survived packing`);
    }
  }
  return out;
}

/* ── THE DRIFT GUARD (the second bug the failed deploy uncovered) ───────────
   `bump-version.sh` walks `src/` only, so nothing under these roots has ever
   been bumped: `supabase/functions/**` sat at `?v=326` while `src/core/*` moved
   to `?v=331`, and `tests/accrual-engine.mjs` did the same. Five builds of
   silent drift, invisible because the query is inert in Node.

   The fix is not to widen the bump script. A `?v=` cache-buster exists so a
   BROWSER re-fetches a module; nothing under these roots is ever served to a
   browser, so a version string there has no job to do and can only rot. It was
   removed, and this fails the build if one comes back. That splits the
   cache-buster contract cleanly in two, with no overlap and no gap:

     • `bump-version.sh --check` — everything the browser loads carries the
       CURRENT version (`index.html`, `src/**`).
     • this — everything the browser does not load carries NO version.

   Kept in JS, wired into the smoke suite, rather than mirrored into the bash
   script: one rule, one implementation, running on every push. */
export const NO_VERSION_ROOTS = [
  join('supabase', 'functions'),
  join('tests'),
];

/** Any relative specifier carrying `?v=` in a tree the browser never loads. */
export async function versionQueryGuard() {
  const problems = [];
  const exts = new Set(['.js', '.ts', '.mjs']);
  async function walk(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      if (!exts.has(e.name.slice(e.name.lastIndexOf('.')))) continue;
      const src = await readFile(p, 'utf8');
      for (const spec of versionQueriesIn(src)) {
        problems.push(
          `${toPosix(relative(ROOT, p))}: import '${spec}' carries a ?v= cache-buster. `
          + `bump-version.sh walks src/ only, so this can never be bumped — it froze at ?v=326 for five `
          + `builds. Nothing here is served to a browser; drop the query.`);
      }
    }
  }
  for (const r of NO_VERSION_ROOTS) await walk(join(ROOT, r));
  return problems;
}

/** Every function directory that has an entrypoint. */
export async function functionNames() {
  try {
    const entries = await readdir(FUNCTIONS, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name);
  } catch { return []; }
}

/** Guard entry point for tests/run-smoke.mjs — returns a list of problems. */
export async function runAll() {
  const names = await functionNames();
  /* Tree-wide, so it is reported once rather than once per function. */
  const problems = await versionQueryGuard();
  for (const n of names) {
    /* Only functions that actually vendor from src/ are in scope. A function
       with no local imports (bug-report-bridge) packs to itself and has nothing
       to drift. */
    const r = await check(n);
    for (const p of r) problems.push(`[${n}] ${p}`);
  }
  return problems;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// (`process.argv[1] || ''` — it is undefined under `node -e`, and this module
//  must be importable from any host, not only from a script on disk.)
if (import.meta.url === new URL(`file://${(process.argv[1] || '').split(sep).join('/')}`).href
    || process.argv[1]?.endsWith('pack-edge.mjs')) {
  const args = process.argv.slice(2);
  const fn = args.find((a) => !a.startsWith('--'));
  const outIdx = args.indexOf('--out');

  if (args.includes('--check')) {
    const problems = fn
      ? [...(await versionQueryGuard()), ...(await check(fn)).map((p) => `[${fn}] ${p}`)]
      : await runAll();
    if (problems.length) {
      console.error('pack-edge --check FAILED:');
      for (const p of problems) console.error('  x ' + p);
      process.exit(1);
    }
    const names = fn ? [fn] : await functionNames();
    for (const n of names) {
      const { files, hash } = await pack(n);
      const vend = files.filter((f) => f.vendored && f.name.startsWith('vendor/')).length;
      const bytes = files.reduce((s, f) => s + Buffer.byteLength(f.content), 0);
      console.log(`${n}: ${files.length} files (${vend} vendored), ${(bytes / 1024).toFixed(1)} KB, payload ${hash}`);
    }
    process.exit(0);
  }

  /* The value the DEPLOYED function reports from a GET. Printing it is how a
     release check is done by hand when the smoke suite has no URL configured. */
  if (args.includes('--hash')) {
    const names = fn ? [fn] : await functionNames();
    for (const n of names) console.log(`${n} ${(await pack(n)).hash}`);
    process.exit(0);
  }

  if (!fn) { console.error('usage: node tools/pack-edge.mjs <function> [--check|--out dir]'); process.exit(2); }
  const { files, problems } = await pack(fn);
  if (problems.length) {
    console.error('pack-edge FAILED:');
    for (const p of problems) console.error('  x ' + p);
    process.exit(1);
  }
  if (outIdx >= 0) {
    const dir = args[outIdx + 1];
    for (const f of files) {
      const dest = join(dir, f.name);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, f.content, 'utf8');
    }
    console.log(`wrote ${files.length} files to ${dir}`);
  } else {
    console.log(JSON.stringify(files.map(({ name, content }) => ({ name, content })), null, 2));
  }
}
