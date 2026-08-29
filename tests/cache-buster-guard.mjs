// ============================================================================
// tests/cache-buster-guard.mjs — THE DUPLICATE-MODULE-INSTANCE GUARD (b493).
//
// ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
// The assembled b493 release failed 19 smoke tests that every constituent
// branch had passed in isolation. The cause was not any of the branches. It was
// fourteen `?v=491` import specifiers that survived the 492→493 bump:
//
//     src/main.js:368                     import ./features/boot-hydration.js?v=491
//     src/features/boot-hydration.js:69   … from ../net/record.js?v=491
//     src/net/client-state.js:51          … from ./accrue.js?v=491
//     src/net/record.js:115               … from ./predict.js?v=491      (+10 more)
//
// (Those four are written WITHOUT their quotes on purpose. This file lives under
//  tests/, where tools/pack-edge.mjs `versionQueryGuard` forbids a quoted
//  versioned specifier outright — a `?v=` in a tree the browser never loads can
//  only rot, and one froze at ?v=326 for five builds. That rule is right, and it
//  applies to a file that merely TALKS about the query too, so nothing below is
//  a quoted specifier either: the controls read the real files instead of
//  embedding copies of them, which is the better control anyway.)
//
// A `?v=` is not decoration to the browser — it is part of the module KEY. So
// `record.js?v=491` and `record.js?v=493` are two DIFFERENT modules: fetched
// twice, evaluated twice, each with its own module-level state. Six modules ran
// as doubles on that tree — record, accrue, capstone, predict, auth, styles —
// which means two accrual kill-switch overrides, two prediction ledgers, two
// blob-retire capstones, two session states. Whichever copy evaluated LAST won
// the `window.Hearthrise*` handle, so the suite drove one instance while the
// game ran on the other:
//
//     R = window.HearthriseRecord      → the ?v=491 copy (evaluated last)
//     R.__setSkillsRecordArm(false)    → disarms the 491 copy
//     S.skillXpOf(...)                 → skill-record.js imports record.js?v=493
//                                        …which is still ARMED
//     ✗ "dormant skillXpOf did not answer the local value: source:'record'"
//
// In production the same split is worse than a failing test: it is a player
// whose gold prediction is retired on a ledger nobody reads.
//
// ── WHY THE EXISTING GATES DID NOT SEE IT ───────────────────────────────────
// `bump-version.sh <new>` rewrote only `?v=<old>` (492→493) and then verified
// only that no `?v=<old>` was left behind. A specifier merged in from a branch
// cut at build 491 matched neither, so it passed the bump's own verification
// silently. `bump-version.sh --check` DOES catch it — it compares against the
// CURRENT number rather than the old one — but it is a separate command that
// nobody had run, and `node tests/run-smoke.mjs`, the gate everyone does run,
// never asserted the invariant at all. Two gates, one blind, and the blind one
// was the one in the loop.
//
// This guard puts the invariant inside the suite, and adds the assertion the
// shell check cannot make: not just "is every version current" but "is any
// module reachable at TWO versions" — the property that actually breaks the
// game. The duplicate check is version-agnostic on purpose, so it still fires
// on a hand-edited pair that happens to be internally consistent with neither
// build number.
//
// Pure Node, no browser, no server. Runs as a preflight so a stale specifier
// costs one second instead of a full suite plus a root-cause investigation.
// ============================================================================

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Every quoted string in a shipped source that ends in `.js?v=<n>`. That shape
   is the whole population of browser-loaded JS cache-busters: static imports,
   dynamic `import()`, and the suite's own `fetch('src/x.js?v=n')` source reads.
   Anchoring on `.js` before the query is what keeps the two legitimate
   non-module pins out of it — icon-swap.js's sprite pin ?v=88 is a bare query
   concatenated onto a filename, and legacy.js's `legacy.js?v=111` is prose in a
   comment, not a quoted specifier. Both are correct to leave frozen. */
const SPEC_RE = /['"`]([^'"`\s]+\.js)\?v=(\d+)['"`]/g;

/* index.html's own tags. The extension is required so the comment on line 12,
   which spells out a script tag ending in ?v=111 as an EXAMPLE, is not read as a
   real tag — the same carve-out bump-version.sh --check makes. */
const HTML_RE = /(?:src|href)="([^"]*\.[a-z0-9]+)\?v=(\d+)"/g;

/* A relative .js import carrying NO ?v= at all: the original b148 gap, where a
   browser serves a stale module for ~10 minutes after a deploy.
   TWO DELIBERATE NARROWINGS, each bought by a real false positive on this tree:
     • `(`, `)`, `=` and `;` may not sit between the keyword and the specifier.
       Without that, `export const BUILD_INFO_URL = (() => new URL('../build-info.js', …))`
       (src/net/build-watch.js) reads as an unversioned import. It is a runtime
       URL resolution, correctly unversioned, and flagging it would gate the
       suite on a non-problem.
     • no backticks. `import(\`./x.js\`)` is not a shape this repo uses, and
       allowing them makes prose that MENTIONS a module inside backticks
       (src/utils/showtab-registry.js:19) look like an import.
   `import()` needs its own branch precisely because it is the one legal shape
   with a paren in it. */
const MISSING_RE = /(?:\bfrom\b|\bimport\b|\bexport\b)[^'"();=]*['"](\.\.?\/[^'"]*\.js)['"]|\bimport\s*\(\s*['"](\.\.?\/[^'"]*\.js)['"]/g;

async function walk(dir, out = []) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function rel(p) { return relative(ROOT, p).split(sep).join('/'); }

/** Line number of a character offset — so a problem names a place, not a file. */
function lineAt(text, index) { return text.slice(0, index).split('\n').length; }

/**
 * THE GUARD. Returns { problems, note, cache, specifiers }.
 *
 * Three independent assertions, because they fail for different reasons and a
 * single merged message would hide the one that matters:
 *   1. DUPLICATE  — a module reachable at two versions (runs twice, state splits)
 *   2. STALE      — a version that is not the current build (serves old code)
 *   3. MISSING    — a relative .js import with no ?v= (serves old code, quietly)
 */
export async function cacheBusterGuard() {
  const problems = [];

  const buildInfo = await readFile(join(ROOT, 'src', 'build-info.js'), 'utf8');
  const m = buildInfo.match(/cache:\s*(\d+)/);
  if (!m) return { problems: ['could not read BUILD.cache from src/build-info.js'], note: '', cache: null };
  const cache = m[1];

  /* Every (module, version) pair the browser would load, keyed by the RESOLVED
     path so `../net/record.js` from features/ and `./record.js` from net/ are
     recognised as the same module. */
  const byModule = new Map();     // resolved path -> Map(version -> [{file,line}])
  let specifiers = 0;

  const files = await walk(join(ROOT, 'src'));
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    SPEC_RE.lastIndex = 0;
    let hit;
    while ((hit = SPEC_RE.exec(text)) !== null) {
      specifiers++;
      const [, spec, version] = hit;
      const line = lineAt(text, hit.index);
      if (version !== cache) {
        problems.push(`STALE  ${rel(file)}:${line} — "${spec}?v=${version}" but the build is ${cache}`);
      }
      /* A bare/absolute specifier ("src/legacy.js") is resolved from the repo
         root; a relative one from its importer. Either way the key is a path. */
      const target = spec.startsWith('.') ? resolve(dirname(file), spec) : resolve(ROOT, spec);
      if (!byModule.has(target)) byModule.set(target, new Map());
      const versions = byModule.get(target);
      if (!versions.has(version)) versions.set(version, []);
      versions.get(version).push({ file: rel(file), line });
    }
    MISSING_RE.lastIndex = 0;
    while ((hit = MISSING_RE.exec(text)) !== null) {
      problems.push(`MISSING ${rel(file)}:${lineAt(text, hit.index)} — "${hit[1] || hit[2]}" carries no ?v=; `
        + 'a browser serves the previous build for ~10 minutes after deploy');
    }
  }

  /* THE ASSERTION THE SHELL CHECK CANNOT MAKE. Reported first and in full: this
     is the one whose symptom is a bizarre test failure rather than stale code. */
  const dupes = [];
  for (const [target, versions] of byModule) {
    if (versions.size < 2) continue;
    const detail = [...versions.entries()]
      .map(([v, sites]) => `?v=${v} (${sites.map((s) => s.file + ':' + s.line).join(', ')})`)
      .join('  vs  ');
    dupes.push(`DUPLICATE ${rel(target)} is imported at ${versions.size} different versions — it will be `
      + `fetched and EVALUATED ${versions.size} times, with ${versions.size} separate copies of its `
      + `module state, and the last one evaluated wins any window.* handle:\n            ${detail}`);
  }
  problems.unshift(...dupes);

  /* index.html's tags, held to the same current-build rule. */
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  HTML_RE.lastIndex = 0;
  let h;
  let tags = 0;
  while ((h = HTML_RE.exec(html)) !== null) {
    tags++;
    if (h[2] !== cache) {
      problems.push(`STALE  index.html:${lineAt(html, h.index)} — "${h[1]}?v=${h[2]}" but the build is ${cache}`);
    }
  }

  const note = `build ${cache}; ${specifiers} module specifier(s) + ${tags} index.html tag(s) all current, `
    + `${byModule.size} distinct module(s), none double-loaded`;
  return { problems, note, cache, specifiers };
}

/* The query prefix, assembled rather than written. This file may not contain a
   quoted `?v=` literal (see the header note), and the mutation fixtures below
   need one. This is NOT the `const V = ?v=328` indirection versionQueryGuard
   was hardened against — that was a real import specifier hiding from a scan;
   this is a REGEX FIXTURE that is never resolved, imported or fetched. */
const Q = '?' + 'v=';

/**
 * THE CONTROL. A guard that cannot fail is a guard that is not running, and
 * this one asserts an ABSENCE — the failure mode is silent blindness, which is
 * exactly what happened to bump-version.sh's own post-bump verification.
 *
 * TWO HALVES, and the second is the one worth having:
 *   • SYNTHETIC — each pattern must MATCH the shape it is supposed to catch.
 *   • ON-DISK   — each pattern must NOT match the real lines it must leave
 *     alone, read from the real files rather than from a copy pasted in here.
 *     A copy drifts; a copy is also how the first cut of this guard came to
 *     "prove" it left build-watch.js alone while flagging it in the same run.
 */
export async function cacheBusterMutationGuard() {
  const problems = [];
  const cases = [
    { name: 'a stale specifier', text: `fetch('src/legacy.js${Q}491')`, re: SPEC_RE, want: ['src/legacy.js', '491'] },
    { name: 'a versioned relative import', text: `from '../net/record.js${Q}493'`, re: SPEC_RE, want: ['../net/record.js', '493'] },
    { name: 'an unversioned relative import', text: `import { x } from './net/record.js';`, re: MISSING_RE, want: ['./net/record.js'] },
    { name: 'an unversioned bare import', text: `import './net/record.js';`, re: MISSING_RE, want: ['./net/record.js'] },
    { name: 'an unversioned dynamic import', text: `await import('./net/record.js');`, re: MISSING_RE, want: ['./net/record.js'] },
    { name: 'a stale index.html tag', text: `<script src="src/main.js${Q}491">`, re: HTML_RE, want: ['src/main.js', '491'] },
  ];
  for (const c of cases) {
    c.re.lastIndex = 0;
    const hit = c.re.exec(c.text);
    if (!hit) { problems.push(`the guard is BLIND to ${c.name} — its own pattern does not match it`); continue; }
    /* Compare against the captured groups that actually fired — MISSING_RE has
       two alternatives (static / dynamic) and only one group is ever set. */
    const got = hit.slice(1).filter((g) => typeof g !== 'undefined');
    for (let i = 0; i < c.want.length; i++) {
      if (got[i] !== c.want[i]) problems.push(`${c.name}: captured "${got[i]}", expected "${c.want[i]}"`);
    }
  }

  /* THE ON-DISK HALF. Four real files, each carrying a shape that MUST NOT be
     reported. `trigger` keeps the check from going vacuous: if the line these
     exist to protect is ever removed, the control says so instead of passing
     because there was nothing left to find. */
  const frozen = [
    /* SPEC_RE cases: the file may hold ordinary versioned imports, which the
       pattern is RIGHT to match. What it must never report is the pinned
       version — so the assertion is on the number, not on the hit count. */
    { file: 'src/icon-swap.js', re: SPEC_RE, trigger: 'v=88', forbidVersion: '88',
      why: "icon-swap's sprite pin is a bare query concatenated onto a filename, not a module specifier" },
    { file: 'src/legacy.js', re: SPEC_RE, trigger: 'v=111', forbidVersion: '111',
      why: "legacy.js's kill-switch prose is an unquoted example in a comment" },
    /* MISSING_RE cases: these two files must yield NO hit at all. Both were real
       false positives of the first cut. */
    { file: 'src/net/build-watch.js', re: MISSING_RE, trigger: 'BUILD_INFO_URL',
      why: 'build-watch resolves a runtime URL; it is not an import and is correctly unversioned' },
    { file: 'src/utils/showtab-registry.js', re: MISSING_RE, trigger: 'wrapShowTab',
      why: 'prose that names a module inside backticks is not an import' },
  ];
  for (const f of frozen) {
    let text;
    try { text = await readFile(join(ROOT, f.file), 'utf8'); }
    catch { problems.push(`the control cannot read ${f.file} — it is proving nothing`); continue; }
    if (!text.includes(f.trigger)) {
      problems.push(`${f.file} no longer contains "${f.trigger}" — this control is now vacuous, re-point or retire it`);
      continue;
    }
    f.re.lastIndex = 0;
    let hit;
    while ((hit = f.re.exec(text)) !== null) {
      if (f.forbidVersion) {
        if (hit[2] === f.forbidVersion) {
          problems.push(`the guard false-positives in ${f.file} on "${hit[1]}" at v${hit[2]} — ${f.why}`);
        }
        continue;
      }
      const got = hit.slice(1).filter((g) => typeof g !== 'undefined')[0];
      problems.push(`the guard false-positives in ${f.file} on "${got}" — ${f.why}`);
    }
  }
  return { problems, note: `${cases.length} mutations caught, ${frozen.length} real-file pins left alone` };
}
