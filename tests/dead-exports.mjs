#!/usr/bin/env node
// tests/dead-exports.mjs — DERIVED dead-export census (cleanup slice 3).
//
// WHY THIS EXISTS
// ---------------
// The 2026-09-06 client audit counted 64 exported names under src/** with no
// reachable consumer: the declaration, and at most a re-export line, and
// nothing else in the whole repo. Deleting them once is worthless — build+3
// grows them back. So the census is DERIVED on every run (never hand-pinned,
// per CLAUDE.md "Do not touch" #2) and the guard fails when a zero-occurrence
// export appears.
//
// DEFINITION OF DEAD (deliberately conservative — a false positive deletes
// working code, a false negative only leaves a line behind):
//   an exported binding NAME in src/**/*.js is DEAD when
//     (a) the identifier token \bNAME\b occurs in the scanned corpus ONLY
//         inside its own declaring file, AND
//     (b) inside that file it occurs at most twice (declaration + a barrel or
//         window-publish line), AND
//     (c) the string "NAME" never appears quoted anywhere (string-keyed
//         dispatch, window['NAME'], JSON config, SQL comments), AND
//     (d) NAME never appears as a SUBSTRING of an identifier in another file,
//         AND
//     (e) the declaring file is not vendored into the edge bundle.
// (d) is not paranoia, it is a measured near-miss: src/net/dungeon-purchase.js
// exports `recordItemTrade` and publishes it as `window.__recordItemTrade`,
// which src/dungeons.js calls. A \b-anchored token search finds ZERO external
// hits for `recordItemTrade` — the underscore is a word character, so the left
// \b never matches — and the first draft of this census called a live function
// dead. Any alias-shaped occurrence now counts as reach.
// (d) is not a purity rule, it is the payload hash: tools/pack-edge.mjs copies
// src/core/* and part of src/data/* verbatim into hr-accrue, so editing one of
// those files moves payload_sha256 and the in-page payload guard goes red until
// the function is redeployed. Edge-vendored files are a lane-C concern.
//
// The corpus is everything that can reach client code: src/**, index.html,
// tests/**, tools/**, supabase/**, .github/** and docs/**. SQL and markdown
// count: a name mentioned only in a migration comment is still evidence a human
// believes it is live, and this guard would rather keep such a line.
//
// USAGE
//   node tests/dead-exports.mjs            # guard: fail if a dead export exists
//   node tests/dead-exports.mjs --report   # print the census
//   node tests/dead-exports.mjs --selftest # mutation proof: plant one -> red

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_DIRS = ['src', 'tests', 'tools', 'supabase', '.github', 'docs'];
const SCAN_ROOT_FILES = ['index.html'];
const SCAN_EXT = new Set(['.js', '.mjs', '.ts', '.tsx', '.html', '.json', '.sql', '.yml', '.yaml', '.md', '.css', '.sh']);
const SKIP_DIR = new Set(['node_modules', '.git', '.legacy', 'dist', 'build', 'icons3', 'raw-bundle']);

// Files copied verbatim into the hr-accrue payload.
function edgeVendoredFiles() {
  const out = new Set();
  for (const rel of ['src/core', 'src/data']) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) if (f.endsWith('.js')) out.add(rel + '/' + f);
  }
  return out;
}

function walk(abs, rel, acc) {
  let ents;
  try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith('.') && e.name !== '.github') continue;
    if (SKIP_DIR.has(e.name)) continue;
    const a = path.join(abs, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(a, r, acc);
    else if (SCAN_EXT.has(path.extname(e.name))) acc.push(r);
  }
}

function corpus() {
  const files = [];
  for (const d of SCAN_DIRS) walk(path.join(ROOT, d), d, files);
  for (const f of SCAN_ROOT_FILES) if (fs.existsSync(path.join(ROOT, f))) files.push(f);
  const map = new Map();
  for (const rel of files) {
    try { map.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch {}
  }
  return map;
}

const EXPORT_PATTERNS = [
  /^\s*export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^\s*export\s+class\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
];

function declaredExports(sources) {
  const decls = new Map();
  for (const [rel, text] of sources) {
    if (!rel.startsWith('src/') || !rel.endsWith('.js')) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let matched = false;
      for (const re of EXPORT_PATTERNS) {
        const m = re.exec(lines[i]);
        if (m) {
          if (!decls.has(m[1])) decls.set(m[1], { file: rel, line: i + 1, kind: /\bfunction\b/.test(lines[i]) ? 'function' : /\bclass\b/.test(lines[i]) ? 'class' : 'binding' });
          matched = true;
          break;
        }
      }
      if (matched) continue;
      const bl = /^\s*export\s*\{([^}]*)\}/.exec(lines[i]);
      if (bl) {
        for (const part of bl[1].split(',')) {
          const nm = part.trim().split(/\s+as\s+/)[0].trim();
          if (/^[A-Za-z_$][\w$]*$/.test(nm) && !decls.has(nm)) decls.set(nm, { file: rel, line: i + 1, kind: 'barrel' });
        }
      }
    }
  }
  return decls;
}

function census(sources) {
  const decls = declaredExports(sources);
  const vendored = edgeVendoredFiles();
  const rows = [];
  for (const [name, d] of decls) {
    if (name.length < 3) continue; // one/two-letter names are noise, not API
    const esc = name.replace(/\$/g, '\\$');
    const tok = new RegExp('\\b' + esc + '\\b', 'g');
    const quoted = new RegExp('[\'"`]' + esc + '[\'"`]');
    let total = 0;
    const elsewhere = [];
    let dynamic = false;
    for (const [rel, text] of sources) {
      if (!text.includes(name)) continue;
      if (quoted.test(text)) dynamic = true;
      const n = (text.match(tok) || []).length;
      if (!n) {
        // The name is present but never as a whole token: an alias
        // (`window.__NAME`), a concatenated key, or a longer identifier that
        // contains it. Treat every one of those as reach — see (d) above.
        if (rel !== d.file) dynamic = true;
        continue;
      }
      total += n;
      if (rel !== d.file) elsewhere.push(rel);
    }
    rows.push({
      name, file: d.file, line: d.line, kind: d.kind, total, elsewhere, dynamic,
      vendored: vendored.has(d.file),
      dead: elsewhere.length === 0 && total <= 2 && !dynamic && !vendored.has(d.file),
    });
  }
  rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return rows;
}

// The ratchet. After slice 3 the reachable-dead set is EMPTY; any new entry is
// a regression and names itself. Kept-with-reason exports are NOT listed here:
// they are not dead by the definition above (dynamic reach / edge-vendored),
// so the derivation already excludes them and no hand-pin exists to rot.
const ALLOW = new Set([]);

function run() {
  const sources = corpus();
  const rows = census(sources);
  const dead = rows.filter(r => r.dead && !ALLOW.has(r.name));
  return { sources, rows, dead };
}

function main() {
  const argv = process.argv.slice(2);
  const { sources, rows, dead } = run();

  if (argv.includes('--report')) {
    const kept = rows.filter(r => r.elsewhere.length === 0 && r.total <= 2 && !r.dead);
    console.log('scanned ' + sources.size + ' files, ' + rows.length + ' exported names');
    console.log('\nDEAD (' + dead.length + '):');
    for (const r of dead) console.log('  ' + r.file + ':' + r.line + '  ' + r.name + '  [' + r.kind + '] occ=' + r.total);
    console.log('\nKEPT WITH REASON (' + kept.length + ') — zero external tokens but reachable/frozen:');
    for (const r of kept) console.log('  ' + r.file + ':' + r.line + '  ' + r.name + '  ' + (r.vendored ? 'edge-vendored' : '') + (r.dynamic ? ' string-keyed' : ''));
    return 0;
  }

  if (dead.length) {
    console.error('FAIL dead-exports: ' + dead.length + ' exported name(s) with no reachable consumer.');
    for (const r of dead) console.error('  ' + r.file + ':' + r.line + '  ' + r.name + ' (' + r.total + ' token occurrence(s) repo-wide)');
    console.error('Delete the export, or give it a consumer. Do not add it to ALLOW without a written reason.');
    return 1;
  }
  console.log('PASS dead-exports: ' + rows.length + ' exported names, 0 with zero reachable consumers (' + sources.size + ' files scanned).');
  return 0;
}

function selftest() {
  const probe = path.join(ROOT, 'src', 'utils', '__dead_export_probe.js');
  // The probe name is ASSEMBLED, never written as one literal: this file is
  // inside the scanned corpus, so a spelled-out name would give the planted
  // export a second occurrence and the census would (correctly) call it
  // reachable. The first draft of the self-test failed exactly this way.
  const NAME = 'hrDeadExportProbe' + 'Xyzzy' + '9';
  const base = run().dead.length;
  if (base !== 0) { console.error('SELFTEST INCONCLUSIVE: baseline already red (' + base + ' dead).'); return 1; }
  fs.writeFileSync(probe, 'export function ' + NAME + '() { return 1; }\n');
  let red = 0;
  try { red = run().dead.length; } finally { fs.unlinkSync(probe); }
  if (red === 0) { console.error('SELFTEST FAIL: planted dead export did not turn the guard red.'); return 1; }
  if (run().dead.length !== 0) { console.error('SELFTEST FAIL: guard stayed red after removing the probe.'); return 1; }
  console.log('SELFTEST PASS dead-exports: planted export -> RED (' + red + '), removed -> GREEN.');
  return 0;
}

process.exit(process.argv.includes('--selftest') ? selftest() : main());
