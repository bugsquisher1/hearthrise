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
// ── THE MECHANISM ──────────────────────────────────────────────────────────
// This tool walks the static import graph from an Edge Function's entrypoint,
// collects every reachable `src/core` and `src/data` module, and emits the
// deploy payload with:
//
//   • the core and data files BYTE-IDENTICAL to the repo, `?v=` and all. They
//     are placed as flat siblings under `vendor/core/` and `vendor/data/`, so
//     their own relative imports (`./xp.js?v=326`) still resolve, untouched.
//     Nothing is rewritten, so nothing can drift.
//   • the function's OWN files with exactly two path prefixes substituted:
//     `../../../src/core/` → `./vendor/core/` and `../../../src/data/` →
//     `./vendor/data/`. That is the whole transformation: two string
//     replacements, in files this repo authored for this purpose, verified by
//     --check.
//
// The `?v=NNN` survives into Deno untouched, because a module specifier is a
// URL in both runtimes and the query is not part of the file lookup. The
// version therefore costs the server nothing — it is ignored where it has no
// job to do.
//
// ⚠ HALF OF THAT IS PROVEN AND HALF IS NOT. Node resolves these specifiers
//   today, every time the suite runs (tests/core-purity.mjs and
//   tests/accrual-engine.mjs import `src/core/*.js?v=326` in plain Node). Deno
//   uses the same URL-based resolution, but the SUPABASE DEPLOY BUNDLER has not
//   been exercised against it here — see the escape-hatch block by
//   `STRIP_QUERY_FLAG` below, which reduces that unknown to a single flag.
//   Do not upgrade this comment to "verified" until a deploy has actually
//   succeeded.
//
// ── WHAT `--check` PROVES, AND WHAT IT DOES NOT (review S10) ───────────────
// `--check` is a PACKABILITY check. It answers "can this function be packed,
// and is the result self-consistent?" — a missing module, a bare specifier, a
// dynamic import() the walker cannot follow, a specifier escaping the two
// vendor roots, a leftover `../../../src/` in a packed function file, or a
// vendored file that packing modified.
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
//   node tools/pack-edge.mjs hr-accrue --strip-query   # escape hatch, see below
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

/* ── THE ONE UNVERIFIED ASSUMPTION, AND ITS ESCAPE HATCH ────────────────────
   The `?v=NNN` is carried into Deno untouched, because a module specifier is a
   URL in both runtimes and the query is not part of the file lookup. Node
   proves that half every time the test suite runs (tests/core-purity.mjs and
   tests/accrual-engine.mjs import `src/core/*.js?v=326` in plain Node). Deno
   uses the same URL-based resolution — but the SUPABASE deploy bundler
   (deno_graph/eszip) has not been exercised against it in this environment,
   because branch creation requires a `confirm_cost` tool that is not exposed
   here and deploying a probe to production was not an acceptable substitute.

   So the assumption is isolated to ONE flag rather than baked in. If a deploy
   ever fails to resolve `./xp.js?v=326`, pack with `--strip-query`: the
   vendored files then ship with the cache-buster removed from their import
   specifiers ONLY (their contents are otherwise untouched, and the repo files
   are never modified). That is a one-word change to a deploy command, not a
   redesign — which is the whole reason it is written down before it is needed.

   It is OFF by default deliberately: shipping the bytes unmodified is the
   stronger property, and a transformation you do not need is a transformation
   that can be wrong. */
export const STRIP_QUERY_FLAG = '--strip-query';

/** Remove `?v=NNN` from relative import specifiers. Nothing else. */
export function stripVersionQueries(src) {
  return src.replace(/(from\s*['"]\.[^'"]*?)\?v=\d+(['"])/g, '$1$2');
}

/** Apply the two — and only two — prefix substitutions. */
export function rewriteFunctionSource(src, opts) {
  const out = src
    .replaceAll('../../../src/core/', './vendor/core/')
    .replaceAll('../../../src/data/', './vendor/data/');
  return opts?.stripQuery ? stripVersionQueries(out) : out;
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

/** Vendored files ship verbatim — unless the escape hatch is armed. */
export function vendorSource(src, opts) {
  return opts?.stripQuery ? stripVersionQueries(src) : src;
}

/**
 * Walk the graph from a function's entrypoint.
 * @returns { files: [{name, content, origin}], problems: [string] }
 */
export async function pack(fnName, opts) {
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
      content: isFunctionFile ? rewriteFunctionSource(src, opts) : vendorSource(src, opts),
      origin: toPosix(relative(ROOT, abs)),
      verbatim: !isFunctionFile,
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
      files.set(cfg, { content, origin: toPosix(relative(ROOT, join(fnDir, cfg))), verbatim: true });
    } catch { /* optional */ }
  }

  const out = [...files].map(([name, f]) => ({
    name, content: f.content, origin: f.origin, verbatim: f.verbatim,
  }));

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
 *   • a vendored file is byte-identical to its source — no transform on either
 *     side of that comparison;
 *   • a function file round-trips: `unrewrite(packed) === disk`;
 *   • no `../../../src/` survived into a packed function file;
 *   • the repo's payload-hash.js still holds the placeholder, never a stale hash.
 */
export async function check(fnName, opts) {
  const { files, problems } = await pack(fnName, opts);
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

    if (f.verbatim) {
      /* No transform on either side. A future pack() that started rewriting
         vendored content — the exact failure this whole tool exists to prevent —
         fails here. (With --strip-query armed the bytes are deliberately
         modified, so the assertion is the narrower one that only the query
         strings moved.) */
      if (!opts?.stripQuery) {
        if (f.content !== src) out.push(`${f.name}: a VENDORED file was modified — it must be byte-identical to ${f.origin}`);
      } else if (f.content !== stripVersionQueries(src)) {
        out.push(`${f.name}: a VENDORED file was modified beyond the ?v= strip`);
      }
      continue;
    }

    /* ROUND TRIP. `unrewriteFunctionSource` is a different function from the one
       that produced `f.content`, so this cannot pass by construction the way the
       previous `expect !== f.content` did. */
    const back = unrewriteFunctionSource(f.content);
    // The ?v= strip is not invertible, so with the escape hatch armed the disk
    // side is normalised the same way instead.
    const want = opts?.stripQuery ? stripVersionQueries(src) : src;
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
  const problems = [];
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
if (import.meta.url === new URL(`file://${process.argv[1].split(sep).join('/')}`).href
    || process.argv[1]?.endsWith('pack-edge.mjs')) {
  const args = process.argv.slice(2);
  const fn = args.find((a) => !a.startsWith('--'));
  const outIdx = args.indexOf('--out');
  const opts = { stripQuery: args.includes(STRIP_QUERY_FLAG) };

  if (args.includes('--check')) {
    const problems = fn ? (await check(fn, opts)).map((p) => `[${fn}] ${p}`) : await runAll();
    if (problems.length) {
      console.error('pack-edge --check FAILED:');
      for (const p of problems) console.error('  x ' + p);
      process.exit(1);
    }
    const names = fn ? [fn] : await functionNames();
    for (const n of names) {
      const { files, hash } = await pack(n, opts);
      const vend = files.filter((f) => f.verbatim && f.name.startsWith('vendor/')).length;
      const bytes = files.reduce((s, f) => s + Buffer.byteLength(f.content), 0);
      console.log(`${n}: ${files.length} files (${vend} vendored verbatim), ${(bytes / 1024).toFixed(1)} KB, payload ${hash.slice(0, 16)}…`);
    }
    process.exit(0);
  }

  /* The value the DEPLOYED function reports from a GET. Printing it is how a
     release check is done by hand when the smoke suite has no URL configured. */
  if (args.includes('--hash')) {
    const names = fn ? [fn] : await functionNames();
    for (const n of names) console.log(`${n} ${(await pack(n, opts)).hash}`);
    process.exit(0);
  }

  if (!fn) { console.error('usage: node tools/pack-edge.mjs <function> [--check|--out dir]'); process.exit(2); }
  const { files, problems } = await pack(fn, opts);
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
