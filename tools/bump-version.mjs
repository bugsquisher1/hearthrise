#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/bump-version.mjs — A RELEASE IS ONE STRING, WRITTEN ONCE. (./bump-version.sh runs this.)
//
//   ./bump-version.sh X.Y.Z ["Title"]   build-info's version, cache and date; the CHANGELOG heading (with a title);
//                                        play.html's preload block and src/app/game-modules.js; then the cache-buster guard
//   ./bump-version.sh --check           node tests/cache-buster-guard.mjs: the source in one stamp state, one key per module
//   ./bump-version.sh --selftest        the bump on scratch copies of the tree, stamped and bare
//
// THE STAMP IS NOT THE BUMP'S ANY MORE (architecture audit 2026-11-18, item 1). The site build writes ?v=<version> on
// every import and page as it builds the Pages artifact (tools/build-site.mjs SITE-9), so a release moves three lines in
// src/build-info.js and one in CHANGELOG.md, and no lane conflicts on 3,000 stamps after it.
//   TRANSITIONAL, until tools/strip-version-stamps.mjs has run on main: while the source still carries its stamps
//   (a branch deploy serves it as-is), the bump restamps every module and page at the new version with the build's own
//   transform (tools/lib/version-stamp.mjs stampFile), so bump and build cannot disagree. On a bare source it writes no stamp.
//   THE PRELOAD IS THE GRAPH THE RELEASE SHIPS (lane r-green-first, 2026-11-07): the bump is the one step every release
//   runs on the assembled tree, so the block is re-derived here (BUMP-4).
// Exit: 0 bumped · 1 the tree is not fit after the bump (the guard's lines say why) · 2 usage or harness.
// mutant-anchors: none — --selftest bumps scratch copies of src/, the pages and CHANGELOG.md, never this tree
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isMain } from '../tests/_is-main.mjs';
import { ROOT, readBuild, sourceQuery, stampFile, stripFile } from './lib/version-stamp.mjs';
import { checkSource, sourceFiles } from '../tests/cache-buster-guard.mjs';

const SEMVER = /^\d+\.\d+\.\d+$/;
const today = () => new Date().toISOString().slice(0, 10);

/** build-info.js with `version`, `cache` and `date` set; throws unless each field is there exactly once. */
export function setBuildInfo(text, version, date) {
  let out = text;
  for (const [k, v] of [['version', version], ['cache', version], ['date', date]]) {
    const re = new RegExp('(\\b' + k + ":\\s*')[^']*(')", 'g');
    const n = (out.match(re) || []).length;
    if (n !== 1) throw new Error('src/build-info.js: ' + n + ' `' + k + ":` fields, expected 1");
    out = out.replace(re, (_, a, b) => a + v + b);
  }
  return out;
}

/** CHANGELOG.md with `## vX.Y.Z — DATE (Title)` above the newest entry; unchanged when that version has one already. */
export function addChangelogHeading(text, version, date, title) {
  if (new RegExp('^## v' + version.replace(/\./g, '\\.') + ' ', 'm').test(text)) return text;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const at = text.search(/^## v/m);
  const head = '## v' + version + ' — ' + date + ' (' + title + ')' + eol + eol;
  return at < 0 ? text.replace(/\s*$/, eol + eol) + head : text.slice(0, at) + head + text.slice(at);
}

/** Bump the tree at `root`. Returns { code, said: string[] }. `preload: false` is the proof's control (BUMP-4). */
export async function bump(root, version, { title = '', date = today(), preload = true } = {}) {
  const said = [];
  if (!SEMVER.test(version)) return { code: 2, said: ['usage: ./bump-version.sh <MAJOR.MINOR.PATCH> ["Title"]   (semver: a patch per release, a minor per milestone, 1.0.0 for full release)'] };
  const infoPath = join(root, 'src', 'build-info.js');
  const was = readBuild(root);
  writeFileSync(infoPath, setBuildInfo(readFileSync(infoPath, 'utf8'), version, date));
  said.push('build-info: ' + was.version + ' -> ' + version + ', dated ' + date);

  const logPath = join(root, 'CHANGELOG.md');
  if (title && existsSync(logPath)) {
    const before = readFileSync(logPath, 'utf8'), after = addChangelogHeading(before, version, date, title);
    if (after !== before) writeFileSync(logPath, after);
    said.push(after !== before ? 'CHANGELOG: ## v' + version + ' — ' + date + ' (' + title + '), the entry under it is yours to write' : 'CHANGELOG: v' + version + ' has its heading already');
  } else said.push('CHANGELOG: add `## v' + version + ' — ' + date + ' (Title)` and the entry (or pass the title: ./bump-version.sh ' + version + ' "Title")');

  /* TRANSITIONAL: restamp a stamped source with the build's transform; a bare one is left bare */
  if (sourceQuery(root)) {
    const files = await sourceFiles(root);
    let moved = 0;
    for (const [rel, text] of Object.entries(files)) {
      const next = stampFile(rel, text, version);
      if (next !== text) { writeFileSync(join(root, rel), next); moved++; }
    }
    said.push('the source still carries its stamps (until tools/strip-version-stamps.mjs runs): ' + moved + ' file(s) restamped at ?v=' + version);
  }

  if (preload && existsSync(join(root, 'tests', 'module-preload.mjs'))) {
    const r = spawnSync(process.execPath, [join(root, 'tests', 'module-preload.mjs'), '--write'], { cwd: root, encoding: 'utf8' });
    if (r.status !== 0) return { code: 1, said: said.concat(['play.html\'s preload block could not be re-derived: ' + (r.stderr || r.stdout).trim()]) };
    said.push((r.stdout || '').trim());
  }

  const g = checkSource(await sourceFiles(root));
  if (g.problems.length) return { code: 1, said: said.concat(g.problems.map((p) => '✗ ' + p)) };
  said.push('✓ ' + g.note);
  return { code: 0, said };
}

// ── THE PROOF ────────────────────────────────────────────────────────────
async function selftest() {
  const NEXT = '9.8.7', DATE = '2031-02-03', made = [], results = [];
  const from = readBuild(ROOT).version;
  /* a scratch tree: src (the vendor bundles stay out: nothing reads them here), the pages, the CHANGELOG, and the two tools the bump runs */
  const scratch = (state) => {
    const dir = mkdtempSync(join(tmpdir(), 'hr-bump-'));
    made.push(dir);
    cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (p) => !/[\\/]src[\\/]vendor([\\/]|$)/.test(p.slice(ROOT.length)) });
    for (const f of readdirSync(ROOT)) if (/\.html$/.test(f) || f === 'CHANGELOG.md') cpSync(join(ROOT, f), join(dir, f));
    for (const f of ['tests/module-preload.mjs', 'tools/lib/version-stamp.mjs']) { mkdirSync(dirname(join(dir, f)), { recursive: true }); cpSync(join(ROOT, f), join(dir, f)); }
    if (state) for (const [rel, text] of Object.entries(walkSync(dir))) writeFileSync(join(dir, rel), state === 'bare' ? stripFile(rel, text) : stampFile(rel, text, from));
    return dir;
  };
  const check = (name, ok, detail) => results.push([name, !!ok, detail || '']);
  try {
    for (const state of ['stamped', 'bare']) {
      const dir = scratch(state);
      const r = await bump(dir, NEXT, { title: 'Proof', date: DATE });
      const info = readBuild(dir);
      check('BUMP-1 ' + state + ': version, cache and date move together', r.code === 0 && info.version === NEXT && info.cache === NEXT && info.date === DATE, r.said.join(' | '));
      const files = await sourceFiles(dir), g = checkSource(files);
      const stamps = Object.values(files).join('').match(/\?v=\d[\d.]*/g) || [];
      check('BUMP-2 ' + state + ': ' + (state === 'stamped' ? 'every stamp moves to the new release' : 'no stamp is written into a bare source'),
        g.problems.length === 0 && g.state === state && (state === 'stamped' ? stamps.length > 1000 && stamps.every((s) => s === '?v=' + NEXT) : stamps.length === 0), g.problems[0] || stamps.length + ' stamps');
      const log = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
      check('BUMP-3 ' + state + ': the CHANGELOG heading goes above the newest entry, once', log.indexOf('## v' + NEXT + ' — ' + DATE + ' (Proof)') === log.search(/^## v/m)
        && (await bump(dir, NEXT, { title: 'Proof', date: DATE })).code === 0 && readFileSync(join(dir, 'CHANGELOG.md'), 'utf8') === log);
    }
    /* BUMP-4: a lane added an import and forgot --write (v0.2.106's client-guards-2, run 42394831391): the bump repairs it; without its preload step it does not */
    const drop = (dir) => {
      const p = join(dir, 'play.html'), html = readFileSync(p, 'utf8');
      writeFileSync(p, html.replace(/^<link rel="modulepreload" href="src\/app\/[^"]*">\r?\n/m, ''));
      return spawnSync(process.execPath, [join(dir, 'tests', 'module-preload.mjs')], { cwd: dir }).status;
    };
    for (const [preload, want] of [[true, 0], [false, 1]]) {
      const dir = scratch(null), before = drop(dir);
      await bump(dir, from, { preload });
      const after = spawnSync(process.execPath, [join(dir, 'tests', 'module-preload.mjs')], { cwd: dir }).status;
      check('BUMP-4 ' + (preload ? 'the bump re-derives a stale preload block' : 'CONTROL the bump without its preload step leaves it stale'), before === 1 && after === want, 'before ' + before + ', after ' + after);
    }
    check('BUMP-5 a version that is not semver is refused', (await bump(scratch(null), 'v0.2', {})).code === 2);
    check('BUMP-6 a build-info with two version fields is refused, not half-written', (() => { try { setBuildInfo("version: '1.0.0', version: '1.0.0', cache: '1.0.0', date: 'x'", NEXT, DATE); return false; } catch { return true; } })());
  } catch (e) {
    console.error('✗ bump-version --selftest: HARNESS ' + (e && e.stack || e));
    return 2;
  } finally {
    for (const d of made) rmSync(d, { recursive: true, force: true });
  }
  let bad = 0;
  for (const [name, ok, detail] of results) { if (!ok) bad++; console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : ' → ' + detail.slice(0, 300))); }
  if (bad) { console.error('✗ bump-version --selftest: ' + bad + ' of ' + results.length + ' wrong'); return 1; }
  console.log('✓ bump-version --selftest: all ' + results.length + ' cases behave');
  return 0;
}

/** The scratch tree's modules and pages, { rel: text } (sync: the proof's setup). */
function walkSync(root) {
  const out = {};
  const into = (rel) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const p = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (rel || e.name === 'src') into(p); } else if (/^[^/]+\.html$/.test(p) || (p.startsWith('src/') && p.endsWith('.js'))) out[p] = readFileSync(join(root, p), 'utf8');
    }
  };
  into('');
  return out;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--selftest') process.exit(await selftest());
    const r = await bump(ROOT, String(args[0] || ''), { title: args[1] || '' });
    for (const l of r.said) console.log(l);
    if (r.code === 0) console.log('OK. Now write the CHANGELOG entry, then commit.');
    process.exit(r.code);
  } catch (e) {
    console.error('✗ bump-version: HARNESS ' + (e && e.message || e));
    process.exit(2);
  }
}
