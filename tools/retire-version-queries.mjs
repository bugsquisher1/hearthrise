#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/retire-version-queries.mjs — THE MECHANICAL HALF OF RETIRING ?v= (Phase 3 of lane/b-ship-build). PREPARED, NOT RUN: the Coordinator runs it at a clean seam, with
// no lane open, once the built site has served real releases. It touches about 1,700 lines, which is why no lane may do it beside other lanes.
//
//   node tools/retire-version-queries.mjs            the plan: what it would change, by kind; writes nothing
//   node tools/retire-version-queries.mjs --write    rewrites this tree
//   node tools/retire-version-queries.mjs --prove    in the OS temp folder: rewrites a copy of the client and builds it. The code that runs must come out byte-identical to the
//                                                    build of this tree (a chunk's NAME still moves: esbuild's hash covers the source map, whose sources did change), and the edge
//                                                    payload's sha256 must not move. That is the proof ?v= no longer does anything for a player.
//
// WHAT IT REWRITES
//   src/**/*.js (not src/vendor)   every quoted specifier or path ending in ?v=X.Y.Z
//   *.html at the root             every src="..?v=X.Y.Z" and href="..?v=X.Y.Z"
//   tests/**/*.mjs                 mutant anchors and page routes naming a source line with its query (a stale anchor would turn a --mutate red)
// WHAT IT DOES NOT: the guards and scripts that know about ?v= are real changes with their own proofs; the list, with what replaces each guard's catch, is on the
// priority board (docs/planning/PRIORITY_BOARD.md, 2026-11-04). It prints that list's files too, so nothing is forgotten at the seam. Rollback note: after this runs, the
// plain-folder deploy has no cache-buster, so deploy-site.yml's one-step rollback is only clean BEFORE it.
// mutant-anchors: none — --prove rewrites a copy in the OS temp folder and judges the build of it
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const QUERY = '\\?v=\\d+\\.\\d+\\.\\d+';
const IN_SOURCE = new RegExp('(?<=[\'"`][^\'"`\\n]*\\.(?:js|css|png|webp|json))' + QUERY + '(?=[\'"`])', 'g');
const IN_PAGE = new RegExp('(?<=\\b(?:src|href)="[^"]*)' + QUERY + '(?=")', 'g');
const ANCHOR_IN_TEST = /(?<=['"`][^'"`\n]*\.js)\?v=(?:\d+\.\d+\.\d+)?(?=['"`])/g;
/* The guards and scripts a person changes at the seam, each with its replacement on the board. */
const BY_HAND = ['bump-version.sh', 'tests/cache-buster-guard.mjs', 'tests/module-preload.mjs', 'tests/site-files-immutable.mjs', 'tests/platform-seam.mjs', 'tools/pack-edge.mjs', 'tools/lane-done.mjs', 'tools/mutant-gate.mjs', 'tools/guard-anchors.mjs', 'tools/lib/guard-deps.mjs', 'tools/verdict-cache.mjs', 'tools/hooks/edit-checks.mjs', 'tools/assemble-release.local.mjs', 'src/site-files.js', 'src/build-info.js', 'src/platform/sw-killswitch.js', 'src/platform/load-shell.js', 'sw.js', '.github/workflows/smoke.yml', 'CLAUDE.md §5'];

function walk(dir, keep) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') out.push(...walk(f, keep)); } else if (keep.test(e.name)) out.push(f);
  }
  return out;
}
const count = (t, re) => (t.match(re) || []).length;

/** Rewrite `root`'s files; answers the counts by kind and how many files moved. */
function rewrite(root, write, { tests = true } = {}) {
  const kinds = { source: 0, page: 0, test: 0 };
  let files = 0;
  const apply = (f, kind, re) => {
    const t = readFileSync(f, 'utf8');
    const n = count(t, re);
    if (!n) return;
    kinds[kind] += n; files++;
    if (write) writeFileSync(f, t.replace(re, ''));
  };
  for (const f of walk(join(root, 'src'), /\.js$/)) apply(f, 'source', IN_SOURCE);
  for (const e of readdirSync(root, { withFileTypes: true })) if (e.isFile() && e.name.endsWith('.html')) apply(join(root, e.name), 'page', IN_PAGE);
  if (tests) for (const f of walk(join(root, 'tests'), /\.mjs$/)) apply(f, 'test', ANCHOR_IN_TEST);
  return { kinds, files };
}

const argv = process.argv.slice(2);
if (argv.includes('--prove')) {
  const { buildSite } = await import('./build-site.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'hr-retire-'));
  let code = 1;
  try {
    const copy = join(dir, 'tree');
    for (const d of ['src', 'assets/world', 'assets/brand', 'assets/ui', 'assets/icons-bundle', 'legal', 'prototypes/hunt-sim']) cpSync(join(ROOT, d), join(copy, d), { recursive: true });
    for (const f of ['play.html', 'index.html', 'sw.js', 'CNAME', '.nojekyll']) cpSync(join(ROOT, f), join(copy, f));
    const r = rewrite(copy, true, { tests: false });
    const left = walk(join(copy, 'src'), /\.js$/).filter((f) => new RegExp(QUERY).test(readFileSync(f, 'utf8')));
    const builtAt = '2026-11-04T00:00:00Z';
    const was = await buildSite({ out: join(dir, 'was'), builtAt });
    const now = await buildSite({ root: copy, out: join(dir, 'now'), builtAt });
    /* A chunk's text with every chunk name and the map link taken out, keyed by itself: two builds run the same code when the two sets match. */
    const NAME = /\b(?:c|boot)-[A-Z0-9]{8}\.js/g;
    const code_ = (d, release) => new Set(Object.keys(release.files).map((k) => { const t = readFileSync(join(d, k)); return /\/(c|boot)-[A-Z0-9]{8}\.js$/.test(k) ? 'chunk ' + createHash('sha256').update(t.toString('utf8').replace(/\/\/# sourceMappingURL=.*$/m, '').replace(NAME, 'CHUNK')).digest('hex') : k + ' ' + release.files[k]; }));
    const a = code_(join(dir, 'was'), was.release), b = code_(join(dir, 'now'), now.release);
    const differ = [...new Set([...a, ...b])].filter((k) => !a.has(k) || !b.has(k));
    const page = (d) => readFileSync(join(d, 'play.html'), 'utf8').replace(NAME, 'CHUNK');
    const pageSame = page(join(dir, 'was')) === page(join(dir, 'now'));
    console.log('rewrote ' + r.kinds.source + ' in source and ' + r.kinds.page + ' in pages, ' + r.files + ' files; source files still naming a version: ' + left.length + (left.length ? ' (' + left.slice(0, 3).map((f) => relative(copy, f).split(sep).join('/')).join(', ') + ')' : ''));
    console.log(a.size + ' built files, ' + differ.length + ' whose code or bytes differ' + (differ.length ? ': ' + differ.slice(0, 6).join(', ') : '') + '; play.html ' + (pageSame ? 'the same but for chunk names' : 'differs'));
    /* The engine: the same payload from the rewritten tree. */
    for (const d of ['supabase/functions', 'tools']) cpSync(join(ROOT, d), join(copy, d), { recursive: true });
    cpSync(join(ROOT, 'tests/_is-main.mjs'), join(copy, 'tests/_is-main.mjs'));
    cpSync(join(ROOT, 'supabase/config.toml'), join(copy, 'supabase/config.toml'));
    const hashOf = (cwd) => spawnSync(process.execPath, ['tools/pack-edge.mjs', 'hr-accrue', '--hash'], { cwd, encoding: 'utf8' }).stdout.trim();
    const engineWas = hashOf(ROOT), engineNow = hashOf(copy);
    console.log('edge payload ' + engineWas.slice(0, 16) + (engineWas === engineNow && engineWas ? ' unchanged' : ' MOVED to ' + engineNow.slice(0, 16)));
    code = differ.length === 0 && pageSame && left.length === 0 && engineWas && engineWas === engineNow ? 0 : 1;
    console.log(code ? 'retire --prove: RED' : 'retire --prove: the built site does not change when every ?v= is gone');
  } finally { try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* the OS tidies its own temp */ } }
  process.exit(code);
}
const write = argv.includes('--write');
const r = rewrite(ROOT, write);
console.log((write ? 'rewrote ' : 'would rewrite ') + r.kinds.source + ' in source, ' + r.kinds.page + ' in pages, ' + r.kinds.test + ' in tests, ' + r.files + ' files');
console.log('by hand at the same seam (priority board 2026-11-04, each with what replaces its catch):\n  ' + BY_HAND.join('\n  '));
