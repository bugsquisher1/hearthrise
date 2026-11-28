#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/module-preload.mjs — THE CLIENT PAGE FETCHES EVERY MODULE AT ONCE, THE SIGN-IN SCREEN'S FIRST.
//
//   node tests/module-preload.mjs             the guard
//   node tests/module-preload.mjs --write     regenerate play.html's block and src/app/game-modules.js (after adding or dropping an import)
//   node tests/module-preload.mjs --selftest  planted defects must go RED, the clean page GREEN
//
// mutant-anchors: none — the proof edits in-memory copies of play.html, the list and the module map, never the tree
//
// The browser finds an ES module only when its importer has arrived and been
// parsed, so the client's modules came in one import level at a time: on
// 10-23 eight levels cost 1.61 s of a cold boot (live v0.2.38 in the pane: the
// module graph done 6.9 s after navigation). So every module is asked for at once.
// A preload is fetched, never run early: evaluation order stays the import graph's.
//
// TWO HALVES (lane b-first-load 2026-11-13). Asked for all at once from the HTML, the game's 520 files stood in front
// of the sign-in form (a throttled phone: 17 s before it showed). The entry (src/app/boot.js) now imports only what
// the sign-in screen draws; the rest of the game is src/app/game-half.js, a dynamic import boot.js starts as it runs,
// with its files preloaded at that moment from a generated list. So the sign-in half's files come first and alone,
// and the game's land while the player types (or, signed in already, straight after).
//   MP-1  play.html's block lists exactly the SIGN-IN HALF: the entry and its static graph (no dynamic import followed)
//   MP-5  src/app/game-modules.js lists exactly the rest of what the page loads: every literal dynamic import() and
//         ITS graph (the game half, the World pane's runtime src/world/world-boot.js), less the sign-in half
//   MP-2  each preload in the block at the source's own query (tools/lib/version-stamp.mjs sourceQuery: '' once the source is
//         bare; a different ?v= is another module key, a second fetch, the preload wasted). The site build stamps the block
//         with the rest of the page (tools/build-site.mjs SITE-9). The list carries none; boot.js adds its own stamp.
//   MP-3  non-vacuity: the entry is found in play.html and the whole graph is deep
//         (a reader that stopped at the first level would pass MP-1 vacuously)
//   MP-4  the classic scripts at the end of the body (supabase-js, storage)
//         are preloaded too: each blocks the parser, so unpreloaded they came one
//         round trip after another, after the modules (measured 10-24)
//   MP-6  THE FIRST-LOAD CEILING: the sign-in half (its modules and the body's classic scripts, as files on disk) stays
//         under BOOT_BUDGET in count and bytes. A big eager import into the entry's graph (the session, the shell, a
//         data table) goes red here with the file that brought it, instead of quietly putting it back in front of the
//         sign-in form. The game half has no ceiling here: it loads behind the first screen.
//   MP-7  ON NEED STAYS ON NEED (lane/boot-path-diet 2026-11-27: the town's ceiling rose ten times in two days, mostly code a hero in
//         town never runs): no module of ON_NEED is in either half and no stylesheet of ON_NEED is linked by the page. Each loads by
//         URL when its window opens or a viewed hunt starts (tools/lib/site-delivery.mjs RUNTIME_MODULES), never with the page.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'play.html';
const LIST = 'src/app/game-modules.js';
const BEGIN = '<!-- MODULE PRELOAD';
const END = '<!-- /MODULE PRELOAD -->';
const HEAD = BEGIN + ' (generated: node tests/module-preload.mjs --write). The sign-in screen\'s modules, asked for at once\n'
  + '     while this page is parsed; the game\'s are src/app/game-modules.js, asked for by boot.js. Fetched, never run early. -->';
const MIN_MODULES = 100;   // MP-3: the client is ~500 modules
/* MP-6: measured 2026-11-13 at 34 modules + 3 classic scripts, 430 KB on disk (the 520-file 5.6 MB first load before the split).
   About a fifth of headroom: a few small modules pass, one big table or the session's graph does not. */
export const BOOT_BUDGET = Object.freeze({ files: 45, bytes: 520 * 1024 });
/* MP-7: what loads on need, and what loads it. A module here imported into either half, or a sheet linked by the page, is red. */
export const ON_NEED = Object.freeze({
  'src/hunt-view/live-engine.js': 'the hunt prediction: src/session/live-link.js loads it when a viewed hero\'s hunt opens',
  'src/core/combat-sim.js': 'the instance engine, run in the browser only by the prediction',
  'src/core/hunt/signature-rules.js': 'Signature rules (the engine\'s)',
  'src/core/hunt/reactions.js': 'monster reactions (the engine\'s)',
  'src/core/hunt-rewards.js': 'the reward roll (the engine\'s)',
  'src/core/trait-roll.js': 'trait pieces (the engine\'s)',
  'src/core/personal-loot.js': 'personal loot dealing (the engine\'s)',
  'src/shell/windows/talents/index.js': 'the Roads map: src/shell/windows/talents.js loads it on the window\'s first open',
  'src/styles/roads.css': 'the Roads map\'s stylesheet, loaded with the map',
});

/* Line-start import/export statements with a `from` (multi-line named lists included), bare
   side-effect imports, and literal dynamic import(): relative specifiers only. */
const STATIC_RE = /^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/gm;
const BARE_RE = /^[ \t]*import\s*['"](\.{1,2}\/[^'"]+)['"]/gm;
const DYNAMIC_RE = /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/** The repo-relative modules `file` imports (static, and literal dynamic unless `staticOnly`), resolved, queries stripped. */
export function importsOf(file, src, staticOnly = false) {
  const out = [];
  for (const re of staticOnly ? [STATIC_RE, BARE_RE] : [STATIC_RE, BARE_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) out.push(posix.normalize(posix.join(posix.dirname(file), m[1].split('?')[0])));
  }
  return out;
}

/** Every module reachable from `entry` through `read(file) → source`: a sorted list, the entry first. `staticOnly`: the
    graph the entry needs before it runs (no dynamic import followed). */
export function graphOf(entry, read, staticOnly = false) {
  const seen = new Set([entry]), queue = [entry];
  while (queue.length) {
    const f = queue.shift();
    for (const d of importsOf(f, read(f), staticOnly)) if (!seen.has(d)) { seen.add(d); queue.push(d); }
  }
  return [entry, ...Array.from(seen).filter((f) => f !== entry).sort()];
}

/** The two halves of the page's graph: `boot` (the entry's static graph, the entry first) and `game` (the rest, sorted). */
export function halvesOf(entry, read) {
  const boot = graphOf(entry, read, true), inBoot = new Set(boot);
  return { boot, game: graphOf(entry, read).filter((f) => !inBoot.has(f)) };
}

/** The entry module play.html runs: its one <script type="module" src>. */
export function entryOf(html) {
  const m = /<script type="module" src="([^"?]+)(?:\?v=[^"]*)?"><\/script>/.exec(html);
  return m ? m[1] : null;
}

/** The classic <script src> tags after the block (the body's), in page order, queries stripped. */
export function classicOf(html) {
  const b = html.indexOf(END);
  return [...html.slice(b < 0 ? 0 : b).matchAll(/<script src="([^"?]+)(?:\?v=[^"]*)?"><\/script>/g)].map((m) => m[1]);
}

/** The generated block for `modules` and the body's `classic` scripts at `query` (the source's: '?v=X.Y.Z' or ''). The entry is listed too, so its own
    fetch starts with the rest (measured: left to its tag at the end of the body it was asked for last, 0.5 s after the
    others, and the page waited on it). */
export function blockFor(modules, query, classic = []) {
  return HEAD + '\n' + classic.map((f) => '<link rel="preload" as="script" href="' + f + query + '">')
    .concat(modules.map((f) => '<link rel="modulepreload" href="' + f + query + '">')).join('\n') + '\n' + END;
}

/** src/app/game-modules.js for the game half `modules`: packed several to a line, so the list grows by a line for every few
    modules the game gains, not one each (tests/client-module-size.mjs holds src/app to its line cap). */
export function listFor(modules) {
  const lines = [];
  for (const f of modules) {
    const item = "'" + f + "',";
    if (lines.length && lines[lines.length - 1].length + 1 + item.length <= 120) lines[lines.length - 1] += ' ' + item;
    else lines.push('  ' + item);
  }
  return [
    '// ════════════════════════════════════════════════════════════════════════',
    '// src/app/game-modules.js — GENERATED by node tests/module-preload.mjs --write. Do not edit.',
    '//',
    '// Every module the page loads past the sign-in screen (src/app/game-half.js and the World pane\'s runtime), repo-',
    '// relative, without the release stamp: boot.js preloads them all at once, at its own stamp, as it starts the game half.',
    '// ════════════════════════════════════════════════════════════════════════',
    '',
    'export const GAME_MODULES = Object.freeze([',
    ...lines,
    ']);',
    '',
  ].join('\n');
}

/** The sign-in half's weight: `files` (its modules + the classic scripts) and `bytes` on disk; `heaviest` names the big ones. */
export function bootWeight(boot, classic, size) {
  const all = boot.concat(classic).map((f) => [f, size(f)]);
  return { files: all.length, bytes: all.reduce((a, [, n]) => a + n, 0), heaviest: all.sort((x, y) => y[1] - x[1]).slice(0, 4) };
}

/** Problems with `html`'s block and the generated `list` against the graph (`read`) at `query`; [] when they hold. */
export function check(html, read, query, list, size) {
  const problems = [];
  const entry = entryOf(html);
  if (!entry) return ['MP-3 no <script type="module"> entry in ' + PAGE];
  const graph = graphOf(entry, read);
  const depth = (() => { let d = 0, level = [entry]; const seen = new Set(level); while (level.length) { d++; level = level.flatMap((f) => importsOf(f, read(f))).filter((x) => !seen.has(x) && seen.add(x)); } return d; })();
  if (graph.length < MIN_MODULES || depth < 4) problems.push('MP-3 the graph from ' + entry + ' is ' + graph.length + ' modules over ' + depth + ' levels: the reader is not following imports');
  const { boot, game } = halvesOf(entry, read);
  if (list !== listFor(game)) {
    const named = new Set([...String(list).matchAll(/'([^']+)',/g)].map((m) => m[1]));
    const missing = game.filter((f) => !named.has(f)), stale = [...named].filter((f) => !game.includes(f));
    problems.push('MP-5 ' + LIST + ' is not the game half (' + ([missing.length ? 'missing ' + missing.slice(0, 4).join(', ') : '',
      stale.length ? 'not in it ' + stale.slice(0, 4).join(', ') : ''].filter(Boolean).join('; ') || 'stale text') + '): run node tests/module-preload.mjs --write');
  }
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if (a < 0 || b < a) return problems.concat(['MP-1 ' + PAGE + ' has no MODULE PRELOAD block: run node tests/module-preload.mjs --write']);
  const listed = new Map();
  for (const m of html.slice(a, b).matchAll(/<link rel="modulepreload" href="([^"?]+)((?:\?v=[^"]*)?)">/g)) listed.set(m[1], m[2]);
  const want = new Set(boot);
  const missing = [...want].filter((f) => !listed.has(f)), stale = [...listed.keys()].filter((f) => !want.has(f));
  if (missing.length || stale.length) {
    problems.push('MP-1 the preload block is not the sign-in half (' + [missing.length ? 'missing ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? ' +' + (missing.length - 4) : '') : '',
      stale.length ? 'not the sign-in screen\'s ' + stale.slice(0, 4).join(', ') : ''].filter(Boolean).join('; ') + '): run node tests/module-preload.mjs --write');
  }
  const scripts = new Map();
  for (const m of html.slice(a, b).matchAll(/<link rel="preload" as="script" href="([^"?]+)((?:\?v=[^"]*)?)">/g)) scripts.set(m[1], m[2]);
  const classic = classicOf(html);
  if (classic.join() !== [...scripts.keys()].join()) {
    problems.push('MP-4 the classic scripts preloaded (' + [...scripts.keys()].join(', ') + ') are not the body\'s (' + classic.join(', ') + '): run node tests/module-preload.mjs --write');
  }
  for (const [f, v] of scripts) listed.set(f, v);
  const off = [...listed].filter(([, q]) => q !== query);
  if (off.length) problems.push('MP-2 ' + off.length + ' preload(s) not at the source\'s query "' + query + '": ' + off.slice(0, 3).map(([f, q]) => f + q).join(', '));
  const w = bootWeight(boot, classic, size);
  if (w.files > BOOT_BUDGET.files || w.bytes > BOOT_BUDGET.bytes) {
    problems.push('MP-6 the sign-in screen now loads ' + w.files + ' files, ' + Math.round(w.bytes / 1024) + ' KB (ceiling ' + BOOT_BUDGET.files + ' files, '
      + Math.round(BOOT_BUDGET.bytes / 1024) + ' KB; heaviest ' + w.heaviest.map(([f, n]) => f + ' ' + Math.round(n / 1024) + ' KB').join(', ')
      + '): import the game\'s modules through src/app/game-half.js, not into ' + entry + '\'s static graph');
  }
  const halves = new Set(boot.concat(game));
  const back = Object.keys(ON_NEED).filter((f) => halves.has(f));
  const sheets = new Set([...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].map((m) => m[1]));
  back.push(...Object.keys(ON_NEED).filter((f) => f.endsWith('.css') && sheets.has(f)));
  if (back.length) problems.push('MP-7 ' + back.join(', ') + ' now load(s) with the page, not on need (' + ON_NEED[back[0]] + '): import it by URL where it is needed, never statically or by a literal import()');
  return problems;
}

const readFile = (f) => {
  const p = join(ROOT, f);
  if (!existsSync(p)) throw new Error(f + ' is imported but does not exist');
  return readFileSync(p, 'utf8');
};
const sizeOf = (f) => (existsSync(join(ROOT, f)) ? statSync(join(ROOT, f)).size : 0);   // a planted module (the proof) weighs nothing
const readList = () => (existsSync(join(ROOT, LIST)) ? readFile(LIST).replace(/\r\n/g, '\n') : '');
const queryOf = () => sourceQuery(ROOT);

if (process.argv.includes('--write')) {
  const html = readFile(PAGE), version = queryOf();
  const { boot, game } = halvesOf(entryOf(html), readFile);
  /* the page's own line endings (a Windows checkout writes CRLF): never a file of mixed endings */
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const block = blockFor(boot, version, classicOf(html)).split('\n').join(eol);
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  const next = a >= 0 && b > a ? html.slice(0, a) + block + html.slice(b + END.length) : html.replace('</head>', block + eol + '</head>');
  writeFileSync(join(ROOT, PAGE), next);
  writeFileSync(join(ROOT, LIST), listFor(game));
  console.log('module-preload --write: ' + boot.length + ' sign-in modules in ' + PAGE + ' at "' + version + '", ' + game.length + ' game modules in ' + LIST);
  process.exit(0);
}

if (process.argv.includes('--selftest')) {
  const html = readFile(PAGE), version = queryOf(), list = readList();   /* `version` is the source's query: '?v=X.Y.Z' or '' */
  const { boot, game } = halvesOf(entryOf(html), readFile);
  const deep = boot[boot.length - 1];
  const extra = 'src/app/never-imported.js';
  const OTHER = ['0', '0', '1'].join('.');   // another build's cache-buster
  const withBoot = (text) => (f) => (f === 'src/app/boot.js' ? readFile(f) + text : f === 'src/app/never-listed.js' ? '' : readFile(f));
  const cases = [
    ['the shipped page', html, readFile, list, sizeOf, null],
    ['a module the sign-in half gained, not listed', html, withBoot("\nimport { x } from './never-listed.js" + version + "';\n"), list, sizeOf, 'MP-1'],
    /* the page's own line endings (a Windows checkout is CRLF): the planted edit lands either way */
    ['a module dropped from the block', html.replace(new RegExp('<link rel="modulepreload" href="' + deep.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(?:\\?v=[^"]*)?">\\r?\\n'), ''), readFile, list, sizeOf, 'MP-1'],
    ['a module listed that nothing loads', html.replace(END, '<link rel="modulepreload" href="' + extra + version + '">\n' + END), readFile, list, sizeOf, 'MP-1'],
    ['a game module back in the block (it would compete with the sign-in screen again)', html.replace(END, '<link rel="modulepreload" href="' + game[0] + version + '">\n' + END), readFile, list, sizeOf, 'MP-1'],
    ['a preload at another version', html.replace('href="' + deep + version + '"', 'href="' + deep + '?v=' + OTHER + '"'), readFile, list, sizeOf, 'MP-2'],
    ['the block deleted', html.slice(0, html.indexOf(BEGIN)) + html.slice(html.indexOf(END) + END.length), readFile, list, sizeOf, 'MP-1'],
    ['a multi-line import list the reader must follow', html, withBoot("\nexport {\n  y,\n} from './never-listed.js" + version + "';\n"), list, sizeOf, 'MP-1'],
    ['a game module dropped from the list', html, readFile, list.replace(" '" + game[game.length - 1] + "',", ''), sizeOf, 'MP-5'],
    ['the dynamic import not followed (the World pane)', html, (f) => (f === 'src/app/world-pane.js' ? readFile(f).replace(/import\('\.\.\/world\/world-boot\.js(?:\?v=[^']*)?'\)/, "import(name)") : readFile(f)), list, sizeOf, 'MP-5'],
    ['a new dynamic import, not in the list', html, withBoot("\nconst late = () => import('./never-listed.js" + version + "');\n"), list, sizeOf, 'MP-5'],
    ['a reader that stops at the first level', html, (f) => (f === 'src/app/boot.js' ? readFile(f) : ''), list, sizeOf, 'MP-3'],
    ['a classic script added to the body, not preloaded', html.replace('<script type="module"', '<script src="src/platform/extra.js' + version + '"></script>\n<script type="module"'), readFile, list, sizeOf, 'MP-4'],
    ['a classic script preload dropped', html.replace(/<link rel="preload" as="script" href="[^"]*">\r?\n/, ''), readFile, list, sizeOf, 'MP-4'],
    /* MP-6: the class this lane removed, put back: the session's graph imported by the entry (block and list regenerated, so only the ceiling can see it) */
    ...(() => {
      const heavy = withBoot("\nimport { AccountSession as A2 } from '../session/account-session.js" + version + "';\n");
      const h = halvesOf('src/app/boot.js', heavy);
      const page = html.slice(0, html.indexOf(BEGIN)) + blockFor(h.boot, version, classicOf(html)) + html.slice(html.indexOf(END) + END.length);
      return [['a big eager import into the sign-in half (the session), block and list regenerated', page, heavy, listFor(h.game), sizeOf, 'MP-6'],
        ['one big file in the sign-in half (a 600 KB module)', html, readFile, list, (f) => (f === deep ? 600 * 1024 : sizeOf(f)), 'MP-6']];
    })(),
    /* MP-7: the hunt engine imported statically by its link again (block and list regenerated, so only MP-7 sees it), and the map's sheet linked by the page */
    ...(() => {
      const eager = (f) => (f === 'src/session/live-link.js' ? "import { createLiveEngine } from '../hunt-view/live-engine.js" + version + "';\n" + readFile(f) : readFile(f));
      const h = halvesOf('src/app/boot.js', eager);
      const page = html.slice(0, html.indexOf(BEGIN)) + blockFor(h.boot, version, classicOf(html)) + html.slice(html.indexOf(END) + END.length);
      return [['the hunt engine back on the town path (live-link imports it), list regenerated', page, eager, listFor(h.game), sizeOf, 'MP-7'],
        ['the Roads stylesheet linked by the page again', html.replace('</head>', '<link rel="stylesheet" href="src/styles/roads.css">\n</head>'), readFile, list, sizeOf, 'MP-7']];
    })(),
  ];
  let bad = 0;
  for (const [name, h, read, l, size, want] of cases) {
    if (want !== null && h === html && read === readFile && l === list && size === sizeOf) { console.log('✗ ' + name + ' → HARNESS: the planted edit changed nothing'); bad++; continue; }
    const got = check(h, read, version, l, size);
    const ok = want === null ? got.length === 0 : got.some((g) => g.startsWith(want));
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name} → ${got.find((g) => want && g.startsWith(want)) || got[0] || 'GREEN'} (want ${want || 'GREEN'})`);
  }
  if (bad) { console.error(`✗ module-preload --selftest: ${bad} case(s) wrong`); process.exit(1); }
  console.log('✓ module-preload --selftest: all ' + cases.length + ' cases behave');
  process.exit(0);
}

const html = readFile(PAGE);
const problems = check(html, readFile, queryOf(), readList(), sizeOf);
for (const p of problems) console.error('✗ ' + p);
if (problems.length) process.exit(1);
const halves = halvesOf(entryOf(html), readFile), weight = bootWeight(halves.boot, classicOf(html), sizeOf);
console.log('✓ module-preload: ' + PAGE + ' preloads the sign-in screen\'s ' + halves.boot.length + ' modules at "' + queryOf() + '" (' + weight.files + ' files, '
  + Math.round(weight.bytes / 1024) + ' KB of a ' + BOOT_BUDGET.files + '-file, ' + Math.round(BOOT_BUDGET.bytes / 1024) + ' KB ceiling); ' + LIST + ' the game\'s ' + halves.game.length);
