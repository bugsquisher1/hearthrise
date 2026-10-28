// art/review/opt-review-2026-10-28/client-static.mjs — what play.html asks a cold browser to fetch, from the files.
//
//   node art/review/opt-review-2026-10-28/client-static.mjs [out.json]
//
// Counts the <link rel=modulepreload> list, walks the static ESM import graph from play.html's module entry points
// (import ... from '...?v=', import('...') with a literal), and sums raw and gzip bytes by kind (JS, CSS, images
// referenced by the art manifests are measured separately by client-cold.mjs from the real network). No network.
import { readFileSync, existsSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'));
const html = readFileSync(join(ROOT, 'play.html'), 'utf8');
const strip = (u) => u.split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
const preload = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => strip(m[1]));
const entries = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => strip(m[1]));
const inlineImports = [...html.matchAll(/import\s*(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/g)].map((m) => strip(m[1]));
const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => strip(m[1])).filter((u) => !/^https?:/.test(u));
const classic = [...html.matchAll(/<script(?![^>]+type="module")[^>]+src="([^"]+)"/g)].map((m) => strip(m[1])).filter((u) => !/^https?:/.test(u));

const graph = new Map();
const dyn = new Set();
function walk(rel) {
  if (graph.has(rel)) return;
  const f = join(ROOT, rel);
  if (!existsSync(f)) { graph.set(rel, { missing: true }); return; }
  const src = readFileSync(f, 'utf8');
  graph.set(rel, { bytes: statSync(f).size });
  const base = dirname(rel);
  for (const m of src.matchAll(/(?:^|[;\n}])\s*(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1] || m[2];
    if (!spec || !spec.startsWith('.')) continue;
    walk(normalize(join(base, spec.split('?')[0])).split('\\').join('/'));
  }
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (m[1].startsWith('.')) dyn.add(normalize(join(base, m[1].split('?')[0])).split('\\').join('/'));
  }
}
for (const e of [...entries, ...inlineImports.filter((u) => u.endsWith('.js'))]) walk(e);
const staticSet = [...graph.keys()].filter((k) => !graph.get(k).missing);
const sizes = (list) => {
  let raw = 0, gz = 0, br = 0;
  for (const rel of list) { const f = join(ROOT, rel); if (!existsSync(f)) continue; const b = readFileSync(f); raw += b.length; gz += gzipSync(b, { level: 6 }).length; br += brotliCompressSync(b).length; }
  return { files: list.length, raw_kb: +(raw / 1024).toFixed(1), gzip_kb: +(gz / 1024).toFixed(1), brotli_kb: +(br / 1024).toFixed(1) };
};
const biggest = staticSet.map((k) => [k, graph.get(k).bytes]).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, b]) => ({ file: k, kb: +(b / 1024).toFixed(1) }));
const notPreloaded = staticSet.filter((k) => !preload.includes(k) && !entries.includes(k));
const preloadNotInGraph = preload.filter((k) => !graph.has(k));

/* the depth of the static import chain: the waterfall a browser would walk without modulepreload */
const depthMemo = new Map();
function depth(rel, seen = new Set()) {
  if (depthMemo.has(rel)) return depthMemo.get(rel);
  if (seen.has(rel)) return 0;
  seen.add(rel);
  const f = join(ROOT, rel);
  if (!existsSync(f)) return 0;
  const src = readFileSync(f, 'utf8');
  let d = 0;
  for (const m of src.matchAll(/(?:^|[;\n}])\s*(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]/g)) {
    if (!m[1].startsWith('.')) continue;
    d = Math.max(d, depth(normalize(join(dirname(rel), m[1].split('?')[0])).split('\\').join('/'), seen));
  }
  depthMemo.set(rel, d + 1);
  return d + 1;
}
const imgDir = (d) => { let n = 0, b = 0; const st = [join(ROOT, d)]; while (st.length) { const p = st.pop(); if (!existsSync(p)) continue;
  for (const e of readdirSync(p, { withFileTypes: true })) { const q = join(p, e.name); if (e.isDirectory()) st.push(q); else if (/\.(png|webp|jpg)$/i.test(e.name)) { n++; b += statSync(q).size; } } } return { files: n, mb: +(b / 1048576).toFixed(2) }; };

const res = {
  play_html_kb: +(Buffer.byteLength(html) / 1024).toFixed(1),
  modulepreload_links: preload.length,
  module_entries: entries, classic_scripts: classic, stylesheets: css,
  static_graph_modules: staticSet.length, dynamic_import_targets: dyn.size,
  static_graph_bytes: sizes(staticSet), preload_bytes: sizes(preload), css_bytes: sizes(css), classic_bytes: sizes(classic),
  import_chain_depth: Math.max(0, ...entries.map((e) => depth(e))),
  in_graph_not_preloaded: notPreloaded.length, preloaded_not_in_static_graph: preloadNotInGraph.length,
  preloaded_not_in_static_graph_sample: preloadNotInGraph.slice(0, 10),
  biggest_modules: biggest,
  image_dirs: { 'assets/icons-bundle': imgDir('assets/icons-bundle'), 'assets/world': imgDir('assets/world'), assets: imgDir('assets') },
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
