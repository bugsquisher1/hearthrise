// ============================================================================
// tests/cache-buster-guard.mjs — ONE KEY PER MODULE, IN THE SOURCE (b493).
//
//   node tests/cache-buster-guard.mjs     the guard and its mutation proof (also run by tests/run-smoke.mjs as a preflight,
//                                         and by `bash bump-version.sh --check`)
//
// ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
// The assembled b493 release failed 19 smoke tests that every constituent
// branch had passed in isolation: fourteen import specifiers still carried the
// build before last after a bump (record.js, accrue.js, predict.js, auth.js…).
// A `?v=` is part of the module KEY, so `record.js` at two versions is two
// modules, fetched twice, evaluated twice, each with its own module state: two
// accrual kill-switches, two prediction ledgers, two sessions. The suite drove
// one instance while the game ran on the other. In production that is a
// player whose gold prediction retires on a ledger nobody reads.
//
// ── WHERE THE RULE LIVES NOW (architecture audit 2026-11-18, item 1) ────────
// The release stamp is written at publish time: tools/build-site.mjs stamps
// every module specifier and page tag with ?v=<BUILD.version> as it builds the
// Pages artifact, and its SITE-9 holds the BUILT site to "every reference at the
// one current stamp" (so no module is reachable at two). The source carries no
// stamp once tools/strip-version-stamps.mjs has run (the flag day).
//
// What is left for the SOURCE is the same defect one level down: Node (the
// guards, the edge's own tests, the balance tools) imports src/ as it is, so a
// module the source reaches at two keys runs twice there too. The source must be
// in ONE state (tools/lib/version-stamp.mjs):
//   bare      no stamp anywhere (the end state)
//   stamped   every specifier and tag at the current build (until the flag day;
//             a branch deploy serves this source as-is)
// and never both. A tree with both is red, and the line names its fix:
//   STAMPED   a stamp in a bare source (a branch cut before the flag day merged
//             in after it): node tools/strip-version-stamps.mjs
//   MISSING   an unstamped specifier in a stamped source (the b148 gap: served
//             stale for ten minutes after a deploy): ./bump-version.sh <build>
//   STALE     a stamp that is not the current build: ./bump-version.sh <build>
//   DUPLICATE a module reached at two keys, reported first, version-agnostic
//
// Pure Node, no browser, no server, ~200 ms, so a stray stamp costs one line
// naming the file instead of a scatter of unrelated-looking reds.
// mutant-anchors: none — the mutation proof plants into in-memory copies of the source, stamped and bare, never a file
// ============================================================================

import { readFile, readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { versionQueriesIn, stripVersionQueries } from '../tools/pack-edge.mjs';
import { ROOT, VENDOR, readBuild, stampKind, moduleSpecifiers, moduleStamps, pageTags, stampFile, stripFile } from '../tools/lib/version-stamp.mjs';
import { isMain } from './_is-main.mjs';

/** Every module and page the stamp covers, as { rel: text }. */
export async function sourceFiles(root = ROOT) {
  const out = {};
  async function walk(rel) {
    let entries = [];
    try { entries = await readdir(join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if ((rel || e.name === 'src') && p + '/' !== VENDOR) await walk(p); } else if (stampKind(p)) out[p] = await readFile(join(root, p), 'utf8');
    }
  }
  await walk('');
  return out;
}

const lineAt = (text, i) => text.slice(0, i).split('\n').length;

/**
 * THE GUARD over `files` ({ rel: text }, the source's modules and pages). Returns { problems, note, cache, state }.
 * Pure: the proof hands it planted copies.
 */
export function checkSource(files) {
  const problems = [];
  if (!files['src/build-info.js']) return { problems: ['could not read src/build-info.js'], note: '', cache: null, state: null };
  let cache;
  try { cache = readBuild('', files['src/build-info.js']).cache; } catch (e) { return { problems: [e.message], note: '', cache: null, state: null }; }

  const stamped = [], bare = [];   // { file, line, ref, version }
  const byModule = new Map();      // resolved module -> Map(query -> [file:line])
  for (const [file, text] of Object.entries(files)) {
    if (stampKind(file) === 'page') {
      for (const t of pageTags(text)) (t.query ? stamped : bare).push({ file, line: lineAt(text, t.at), ref: t.ref + t.query, version: t.query.slice(3) });
      continue;
    }
    const specAt = new Set();
    for (const s of moduleSpecifiers(text)) {
      specAt.add(s.at);
      const ref = { file, line: lineAt(text, s.at), ref: s.spec + s.query, version: s.query.slice(3) };
      (s.query ? stamped : bare).push(ref);
      const target = posix.normalize(posix.join(posix.dirname(file), s.spec));
      if (!byModule.has(target)) byModule.set(target, new Map());
      const at = byModule.get(target);
      if (!at.has(s.query)) at.set(s.query, []);
      at.get(s.query).push(file + ':' + ref.line);
    }
    /* a quoted stamp that is no specifier (a pinned asset URL: the b511 cache lock) */
    for (const s of moduleStamps(text)) if (!specAt.has(s.at)) stamped.push({ file, line: lineAt(text, s.at), ref: s.text, version: s.version });
  }

  /* DUPLICATE first: its symptom is a bizarre test failure, not stale code */
  for (const [target, at] of byModule) {
    if (at.size < 2) continue;
    problems.push(`DUPLICATE ${target} is imported at ${at.size} keys: it is evaluated ${at.size} times, each with its own module state:\n            `
      + [...at].map(([q, sites]) => (q || '(bare)') + ' ' + sites.slice(0, 3).join(', ')).join('  vs  '));
  }
  const state = !stamped.length ? 'bare' : !bare.length ? 'stamped' : bare.length >= stamped.length ? 'bare' : 'stamped';
  if (state === 'bare') {
    for (const s of stamped) problems.push(`STAMPED ${s.file}:${s.line} "${s.ref}": the source carries no ?v= (the site build stamps it, tools/build-site.mjs SITE-9). Run node tools/strip-version-stamps.mjs`);
  } else {
    for (const s of bare) problems.push(`MISSING ${s.file}:${s.line} "${s.ref}" carries no ?v= and the rest of the source does: a branch deploy serves it stale for ten minutes. Run ./bump-version.sh ${cache}`);
    for (const s of stamped) if (s.version !== cache) problems.push(`STALE  ${s.file}:${s.line} "${s.ref}" but the build is ${cache}. Run ./bump-version.sh ${cache}`);
  }
  const refs = stamped.length + bare.length;
  const note = state === 'bare'
    ? `the source is bare: ${refs} module specifier(s) and page tag(s), none stamped (the site build stamps ?v=${cache}), ${byModule.size} distinct module(s), none at two keys`
    : `the source is stamped at ${cache} (until tools/strip-version-stamps.mjs runs): ${refs} reference(s), ${byModule.size} distinct module(s), none at two keys`;
  return { problems, note, cache, state };
}

/** The guard on this checkout. */
export async function cacheBusterGuard(root = ROOT) {
  return checkSource(await sourceFiles(root));
}

/* The query prefix, assembled: this file lives under tests/, where tools/pack-edge.mjs versionQueryGuard
   refuses a quoted versioned specifier, and the fixtures below need one. They are never imported or fetched. */
const Q = '?' + 'v=';

/**
 * THE PROOF. A guard that asserts an absence fails silently, so each rule is planted into an in-memory copy of the
 * real source, in BOTH states (the source stamped at the build, and stripped bare), whatever state the disk is in.
 */
export async function cacheBusterMutationGuard(root = ROOT) {
  const problems = [];
  const disk = await sourceFiles(root);
  const cache = readBuild('', disk['src/build-info.js']).cache;
  const each = (f) => Object.fromEntries(Object.entries(disk).map(([rel, t]) => [rel, f(rel, t)]));
  const STAMPED = each((rel, t) => stampFile(rel, t, cache)), BARE = each((rel, t) => stripFile(rel, t));
  const host = 'src/app/boot.js', page = 'play.html';
  const firstSpec = (t) => moduleSpecifiers(t)[0];
  const edit = (tree, rel, f) => ({ ...tree, [rel]: f(tree[rel]) });
  const OLD = ['0', '0', '9'].join('.');
  /* the host's first import of a module other files import too: one stale key on it is a second instance */
  const importers = new Map();
  for (const [rel, t] of Object.entries(STAMPED)) if (stampKind(rel) === 'module') for (const s of moduleSpecifiers(t)) { const k = posix.normalize(posix.join(posix.dirname(rel), s.spec)); importers.set(k, (importers.get(k) || 0) + 1); }
  const shared = moduleSpecifiers(STAMPED[host]).find((s) => importers.get(posix.normalize(posix.join(posix.dirname(host), s.spec))) > 1);
  const cases = [
    ['CLEAN the source stamped at the build', STAMPED, null],
    ['CLEAN the source bare', BARE, null],
    ['a shared module one build stale in one importer (the b493 double load)', shared && edit(STAMPED, host, (t) => t.slice(0, shared.at) + t.slice(shared.at).replace(shared.spec + shared.query, shared.spec + Q + OLD)), 'DUPLICATE'],
    ['a specifier one build stale, alone in its module', edit(STAMPED, host, (t) => t.replace(Q + cache, Q + OLD)), 'STALE'],
    ['a stamped import that lost its stamp (the b148 gap)', edit(STAMPED, host, (t) => { const s = firstSpec(t); return t.slice(0, s.at) + t.slice(s.at).replace(s.spec + s.query, s.spec); }), 'MISSING'],
    ['a stale page tag', edit(STAMPED, page, (t) => t.replace(Q + cache, Q + OLD)), 'STALE'],
    ['a stale lane merged into the bare source (one stamp back)', edit(BARE, host, (t) => { const s = firstSpec(t); return t.slice(0, s.at) + t.slice(s.at).replace(s.spec, s.spec + Q + cache); }), 'STAMPED'],
    ['a stamp back on a bare page', edit(BARE, page, (t) => t.replace('src/app/boot.js"', 'src/app/boot.js' + Q + cache + '"')), 'STAMPED'],
    ['a quoted pin in a bare source (b511: a cache lock no release moves)', edit(BARE, host, (t) => t + "\nconst PIN = BASE + '" + Q + "88';\n"), 'STAMPED'],
    ['a quoted pin in a stamped source', edit(STAMPED, host, (t) => t + "\nconst PIN = BASE + '" + Q + "88';\n"), 'STALE'],
    ['CONTROL a runtime URL in a bare source (new URL(…, import.meta.url) is no specifier)', edit(BARE, host, (t) => t + "\nconst U = new URL('../build-info.js', import.meta.url).href + new URL(import.meta.url).search;\n"), null],
    ['CONTROL prose that names a stamp, unquoted', edit(BARE, host, (t) => t + '\n// e.g. a browser stuck on legacy.js' + Q + '111 after a bad deploy\n'), null],
  ];
  for (const [name, tree, want] of cases) {
    if (!tree) { problems.push(`${name}: HARNESS nothing on the real source to plant this into`); continue; }
    const got = checkSource(tree).problems;
    const ok = want === null ? got.length === 0 : got.some((p) => p.startsWith(want));
    if (!ok) problems.push(`${name}: wanted ${want || 'GREEN'}, got ${got[0] ? got[0].slice(0, 160) : 'GREEN'}`);
  }
  /* THE EDGE HALF: versionQueryGuard must still see, and the pack must still strip, a dotted query (semver, 2026-10-18) */
  const edge = [
    ['a dotted relative specifier', `import './x.js${Q}0.1.0';`, (s) => versionQueriesIn(s).length === 1],
    ['a dotted bare query constant', `const V = '${Q}0.1.0';`, (s) => versionQueriesIn(s).length === 1],
    ['a clean specifier', `import './x.js';`, (s) => versionQueriesIn(s).length === 0],
    ['the pack strip on a dotted query', `import { a } from './x.js${Q}0.1.0';`, (s) => stripVersionQueries(s) === "import { a } from './x.js';"],
  ];
  for (const [name, text, holds] of edge) if (!holds(text)) problems.push(`pack-edge is wrong about ${name}`);
  return { problems, note: `${cases.length} cases on the source stamped and bare, ${edge.length} edge-pack shapes held` };
}

if (isMain(import.meta.url)) {
  const r = await cacheBusterGuard();
  const m = await cacheBusterMutationGuard();
  for (const p of m.problems) console.error('✗ the guard itself: ' + p);
  for (const p of r.problems) console.error('✗ ' + p);
  if (m.problems.length || r.problems.length) process.exit(1);
  console.log('✓ cache-buster-guard: ' + r.note + '; ' + m.note);
}
