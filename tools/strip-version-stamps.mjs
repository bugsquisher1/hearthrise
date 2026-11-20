#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/strip-version-stamps.mjs — THE FLAG DAY: THE SOURCE STOPS CARRYING THE RELEASE.
//
//   node tools/strip-version-stamps.mjs            take every ?v= out of src/**/*.js (not src/vendor/) and the root pages
//   node tools/strip-version-stamps.mjs --check    the same, written nowhere: exit 0 when the source is bare, 1 with what is left
//   node tools/strip-version-stamps.mjs --selftest the refusals and the strip, planted in scratch git trees
//
// WHY (architecture audit 2026-11-18, item 1). ./bump-version.sh rewrote about 3,000 `?v=X.Y.Z` stamps in about 440
// files at every release, and every lane branch then conflicted on them when it merged the next set. The stamp is now
// written at publish time (tools/build-site.mjs, SITE-9), so the source needs none. This takes them out, once.
//
// RUN IT ONLY WHEN Pages serves the built site (Settings > Pages > Source: GitHub Actions, .github/workflows/pages.yml):
// a branch deploy of bare source serves every module unstamped, from a ten-minute cache, after every release.
// At a release boundary, with no lane open on src/, on a clean checkout of the set branch:
//   node tools/strip-version-stamps.mjs && node tools/build-site.mjs --check && node tests/cache-buster-guard.mjs
//   git commit -am "flag day: the source carries no ?v= (tools/strip-version-stamps.mjs)"
// A lane branched before it that merges after it: resolve each conflict as the other side's line without its stamp,
// commit the merge, then run this on the lane (idempotent; only the stamps the merge brought back move).
//
// SAFE BY CONSTRUCTION. It refuses (exit 3, nothing written) a tree it cannot strip whole:
//   DIRTY      any change or untracked file in the checkout (the commit after it must be the strip and only the strip)
//   MID-OP     a merge, rebase, cherry-pick or revert in progress (half the tree is the other side's)
//   PARTIAL    a sparse checkout, a tracked file missing from disk, or a path argument (the whole tree or nothing)
//   ROOT       --root is not the top of a git checkout
//   CHANGED    a file the site would serve differently: every stripped file must build (tools/lib/version-stamp.mjs
//              stampFile) to the same bytes it builds to today, so a stamp the build does not write back (a pinned
//              asset URL, a stamp inside new URL(…)) is named and the strip does not start. Players get the same site.
// Exit: 0 done (or nothing to strip) · 1 --check found stamps, or the strip left one · 2 harness · 3 refused.
// mutant-anchors: none — --selftest plants into scratch git trees under the OS temp folder, never this checkout
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isMain } from '../tests/_is-main.mjs';
import { ROOT, readBuild, stampKind, stampFile, stripFile, moduleStamps, pageTags } from './lib/version-stamp.mjs';

export const REFUSED = 3;
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Every module and page the stamp covers, repo-relative. */
function stampedFiles(root) {
  const out = [];
  const into = (rel) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const p = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (rel || e.name === 'src') into(p); } else if (stampKind(p)) out.push(p);
    }
  };
  into('');
  return out.sort();
}

/** Why `root` cannot be stripped whole, or null. */
export function refusal(root, args = []) {
  const paths = args.filter((a) => !a.startsWith('--'));
  if (paths.length) return 'PARTIAL path arguments (' + paths.join(' ') + '): the strip takes the whole tree or nothing';
  let top;
  try { top = git(root, ['rev-parse', '--show-toplevel']).trim(); } catch { return 'ROOT ' + root + ' is not a git checkout'; }
  if (resolve(top).toLowerCase() !== resolve(root).toLowerCase()) return 'ROOT ' + root + ' is not the top of its checkout (' + top + ')';
  for (const op of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const p = git(root, ['rev-parse', '--git-path', op]).trim();
    if (existsSync(resolve(root, p))) return 'MID-OP a ' + op.replace(/_HEAD$|-.*$/, '').toLowerCase() + ' is in progress: finish it and commit first';
  }
  let sparse = '';
  try { sparse = git(root, ['config', '--get', 'core.sparseCheckout']).trim(); } catch { /* unset */ }
  if (sparse === 'true') return 'PARTIAL a sparse checkout: files outside it would keep their stamps';
  const gone = git(root, ['ls-files', '--deleted']).trim();
  if (gone) return 'PARTIAL tracked files missing from disk: ' + gone.split('\n').slice(0, 3).join(', ');
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=normal']).trim();
  if (dirty) return 'DIRTY the checkout has changes: ' + dirty.split('\n').slice(0, 3).map((l) => l.trim()).join(', ') + ' (commit them first; the strip is a commit of its own)';
  if (!existsSync(join(root, 'src', 'build-info.js'))) return 'PARTIAL no src/build-info.js: not a Hearthrise tree';
  return null;
}

/**
 * The strip, planned in memory and checked before a byte is written.
 * @returns {{ refused?: string, files: {rel: string, before: string, after: string}[], stamps: number, left: string[] }}
 */
export function plan(root) {
  const { version } = readBuild(root);
  const files = [], changed = [];
  let stamps = 0;
  for (const rel of stampedFiles(root)) {
    const before = readFileSync(join(root, rel), 'utf8');
    const after = stripFile(rel, before);
    if (after === before) continue;
    stamps += (before.match(/\?v=\d/g) || []).length - (after.match(/\?v=\d/g) || []).length;
    if (stampFile(rel, after, version) !== stampFile(rel, before, version)) changed.push(rel);
    files.push({ rel, before, after });
  }
  const left = files.flatMap(({ rel, after }) => (stampKind(rel) === 'page' ? pageTags(after).filter((t) => t.query).map((t) => rel + ': ' + t.ref + t.query)
    : moduleStamps(after).map((s) => rel + ': ' + s.text)));
  if (changed.length) {
    return { refused: 'CHANGED the site would serve ' + changed.length + ' file(s) differently without their stamps: ' + changed.slice(0, 5).join(', ')
      + '. A stamp the build does not write back (an asset URL, a new URL(…) argument) must move to run time first (BUILD.cache, or the module\'s own new URL(import.meta.url).search).', files, stamps, left };
  }
  return { files, stamps, left };
}

/** Strip `root` (or only report, with `write: false`). Returns the exit code and prints what it did. */
export function stripTree(root, { write = true, args = [], log = console.log } = {}) {
  if (write) {
    const why = refusal(root, args);
    if (why) { log('✗ strip-version-stamps: refused, nothing written. ' + why); return REFUSED; }
  }
  const p = plan(root);
  if (p.refused) { log('✗ strip-version-stamps: refused, nothing written. ' + p.refused); return REFUSED; }
  if (!p.files.length) { log('✓ strip-version-stamps: the source carries no ?v=, nothing to strip (the site build stamps it: tools/build-site.mjs SITE-9)'); return 0; }
  if (!write) {
    log('✗ strip-version-stamps --check: ' + p.stamps + ' stamp(s) in ' + p.files.length + ' file(s), e.g. ' + p.files.slice(0, 3).map((f) => f.rel).join(', ') + '. Run node tools/strip-version-stamps.mjs');
    return 1;
  }
  for (const f of p.files) writeFileSync(join(root, f.rel), f.after);
  if (p.left.length) { log('✗ strip-version-stamps: wrote the strip, but ' + p.left.length + ' stamp(s) survived it: ' + p.left.slice(0, 3).join(', ')); return 1; }
  log('✓ strip-version-stamps: ' + p.stamps + ' stamp(s) out of ' + p.files.length + ' file(s); every file builds to the bytes it built to before (tools/build-site.mjs stamps ?v=' + readBuild(root).version + ' back on at publish)');
  return 0;
}

// ── THE PROOF ────────────────────────────────────────────────────────────
function selftest() {
  const V = readBuild(ROOT).version, OLD = '0.0.9';
  const TREE = {
    'src/build-info.js': "export const BUILD = Object.freeze({\n  version:   '" + V + "',\n  cache:     '" + V + "',\n});\n",
    'src/app/boot.js': "import { a } from './a.js?v=" + V + "';\nimport '../data/rows.js?v=" + V + "';\n/** @type {typeof import('./a.js?v=" + V + "')} */\nconst late = () => import('./a.js?v=" + V + "');\nconst URL_A = new URL('./a.js', import.meta.url).href + new URL(import.meta.url).search;\nconst CREST = 'assets/x.png?v=' + 'x';\n",
    'src/app/a.js': "export { rows } from \"../data/rows.js?v=" + V + "\";\nexport const a = 1;\n",
    'src/data/rows.js': 'export const rows = [];\n',
    'src/vendor/lib.js': "fetch('/flags/?v=2');\n",
    'play.html': '<!doctype html>\n<link rel="stylesheet" href="src/styles/x.css?v=' + V + '">\n<script src="src/vendor/lib.js?v=' + V + '"></script>\n<a href="index.html">x</a>\n<link href="https://fonts.example/css?family=A">\n<script type="module" src="src/app/boot.js?v=' + V + '"></script>\n',
    'index.html': '<!doctype html>\n<script src="src/app/a.js?v=' + V + '"></script>\n',
    'tests/keep.mjs': "// tests carry no stamp; the strip never reads them\nexport const x = 1;\n",
  };
  const made = [];
  const tree = (edits = {}, commit = true) => {
    const dir = mkdtempSync(join(tmpdir(), 'hr-strip-'));
    made.push(dir);
    for (const [rel, text] of Object.entries({ ...TREE, ...edits })) { if (text === null) continue; mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
    const g = (...a) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=strip-proof', '-c', 'user.email=strip-proof@localhost', '-C', dir, ...a], { stdio: 'ignore' });
    g('init', '-q'); if (commit) { g('add', '-A'); g('commit', '-q', '-m', 'tree'); }
    return { dir, g };
  };
  const snapshot = (dir) => Object.fromEntries(Object.keys(TREE).filter((r) => existsSync(join(dir, r))).map((r) => [r, readFileSync(join(dir, r), 'utf8')]));
  const quiet = () => {};
  const cases = [];
  const check = (name, ok, detail = '') => cases.push([name, !!ok, detail]);
  try {
    /* THE STRIP: a clean stamped tree comes out bare, and builds back to itself */
    {
      const { dir } = tree();
      const before = snapshot(dir), code = stripTree(dir, { log: quiet }), after = snapshot(dir);
      const bare = Object.entries(after).filter(([r]) => stampKind(r)).every(([r, t]) => !/\?v=\d/.test(t));
      const rebuilt = Object.keys(before).filter((r) => stampKind(r)).every((r) => stampFile(r, after[r], V) === stampFile(r, before[r], V));
      check('a clean stamped tree is stripped bare (exit 0)', code === 0 && bare, 'exit ' + code);
      check('every stripped file builds to its old bytes (the site is unchanged)', rebuilt && stampFile('src/app/boot.js', after['src/app/boot.js'], V) === before['src/app/boot.js']);
      check('the vendor folder, the runtime URLs, a link to a page and an outside URL are untouched',
        after['src/vendor/lib.js'] === before['src/vendor/lib.js'] && after['src/app/boot.js'].includes("new URL('./a.js', import.meta.url).href + new URL(import.meta.url).search")
        && after['play.html'].includes('href="index.html"') && after['play.html'].includes('css?family=A"') && after['tests/keep.mjs'] === before['tests/keep.mjs']);
      const { g } = { g: (...a) => execFileSync('git', ['-c', 'user.name=p', '-c', 'user.email=p@localhost', '-C', dir, ...a], { stdio: 'ignore' }) };
      g('commit', '-qam', 'strip');
      const again = snapshot(dir), code2 = stripTree(dir, { log: quiet });
      check('IDEMPOTENT a second run on the bare tree writes nothing (exit 0)', code2 === 0 && JSON.stringify(snapshot(dir)) === JSON.stringify(again), 'exit ' + code2);
      check('--check on the bare tree is green', stripTree(dir, { write: false, log: quiet }) === 0);
    }
    /* --check on a stamped tree names what is left and writes nothing */
    {
      const { dir } = tree();
      const before = snapshot(dir), code = stripTree(dir, { write: false, log: quiet });
      check('--check on a stamped tree is red (exit 1) and writes nothing', code === 1 && JSON.stringify(snapshot(dir)) === JSON.stringify(before), 'exit ' + code);
    }
    /* THE REFUSALS: each leaves every byte where it was */
    const refused = (name, setup, want) => {
      const t = tree(...(setup.tree || []));
      if (setup.after) setup.after(t);
      const before = snapshot(t.dir);
      let said = '';
      const code = stripTree(t.dir, { args: setup.args || [], log: (s) => { said += s; } });
      check(name, code === REFUSED && said.includes(want) && JSON.stringify(snapshot(t.dir)) === JSON.stringify(before), 'exit ' + code + ': ' + said.slice(0, 140));
    };
    refused('DIRTY an uncommitted edit', { after: ({ dir }) => writeFileSync(join(dir, 'src/data/rows.js'), 'export const rows = [1];\n') }, 'DIRTY');
    refused('DIRTY an untracked module', { after: ({ dir }) => writeFileSync(join(dir, 'src/app/new.js'), "import './a.js?v=" + V + "';\n") }, 'DIRTY');
    refused('MID-OP a merge in progress', { after: ({ dir }) => writeFileSync(join(dir, '.git', 'MERGE_HEAD'), '0'.repeat(40) + '\n') }, 'MID-OP');
    refused('PARTIAL a tracked file missing from disk', { after: ({ dir }) => rmSync(join(dir, 'src/app/a.js')) }, 'PARTIAL');
    refused('PARTIAL a path argument', { args: ['src/app'] }, 'PARTIAL');
    refused('PARTIAL a sparse checkout', { after: ({ g }) => g('config', 'core.sparseCheckout', 'true') }, 'PARTIAL');
    refused('ROOT a folder that is no checkout', { tree: [{}, false], after: ({ dir }) => rmSync(join(dir, '.git'), { recursive: true, force: true }) }, 'ROOT');
    refused('CHANGED a pinned asset stamp the build does not write back', { tree: [{ 'src/app/a.js': "export const CREST = '<img src=\"assets/x.png?v=" + V + "\">';\n" }] }, 'CHANGED');
    refused('CHANGED a stamp inside new URL(…) (game-master.js before this lane)', { tree: [{ 'src/app/a.js': "export const B = new URL('./boot.js?v=" + V + "', import.meta.url).href;\n" }] }, 'CHANGED');
    /* the strip normalises nothing: a stale stamp is a stamp, and goes like the rest (the build writes the current one) */
    {
      const { dir } = tree({ 'src/app/a.js': "export { rows } from '../data/rows.js?v=" + OLD + "';\n" });
      const code = stripTree(dir, { log: quiet });
      check('a stamp at another release is stripped too (the merge of a stale branch)', code === 0 && !snapshot(dir)['src/app/a.js'].includes('?v='), 'exit ' + code);
    }
  } catch (e) {
    console.error('✗ strip-version-stamps --selftest: HARNESS ' + (e && e.stack || e));
    return 2;
  } finally {
    for (const d of made) rmSync(d, { recursive: true, force: true });
  }
  let bad = 0;
  for (const [name, ok, detail] of cases) { if (!ok) bad++; console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : ' → ' + detail)); }
  if (bad) { console.error('✗ strip-version-stamps --selftest: ' + bad + ' of ' + cases.length + ' wrong'); return 1; }
  console.log('✓ strip-version-stamps --selftest: all ' + cases.length + ' cases behave');
  return 0;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.includes('--selftest')) process.exit(selftest());
    const at = args.indexOf('--root');
    const root = at >= 0 ? resolve(String(args[at + 1] || '')) : ROOT;
    const rest = args.filter((a, i) => a !== '--root' && i !== at + 1 && a !== '--check');
    process.exit(stripTree(root, { write: !args.includes('--check'), args: at >= 0 ? rest : args.filter((a) => a !== '--check') }));
  } catch (e) {
    console.error('✗ strip-version-stamps: HARNESS ' + (e && e.message || e));
    process.exit(2);
  }
}
