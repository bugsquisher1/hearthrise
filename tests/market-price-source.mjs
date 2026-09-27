#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/market-price-source.mjs — NO PRICE STATISTIC IS AUTHORED BY THE BROWSER
//
//   node tests/market-price-source.mjs             the guard
//   node tests/market-price-source.mjs --selftest  mutation proof
//
// CLAUDE.md §1/§6. Until b559 the Market's "7d avg", "Top movers" and the
// tooltip's "Player market avg" were computed from a per-browser localStorage
// series that recorded this browser's own Buy taps — refused ones included —
// and a Math.random seeder. Every number a player reads about the market must
// come from the server. Scope: shipped src/** (the in-page suite is excluded).
//
//   MP-1  zero Math.random in src/market.js, src/net/market-*.js, src/item-ux.js
//         (comments and string literals stripped first).
//   MP-2  the retired history key appears at most once, only on a
//         localStorage.removeItem( line in src/market.js; none of the retired
//         series' identifiers appears anywhere in shipped code.
//   MP-3  none of the retired phrases appears in shipped code.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const HISTORY_KEY = 'hearthrise:market:history';
const RETIRED_IDENTS = ['recordSale', 'getStats7d', 'getTopMovers7d', 'getMarketAvgPrice', 'seedFakeListings', 'clearSeed'];
const RETIRED_PHRASES = ['7d avg', 'vs avg', 'Top movers', 'Player market avg', 'No 7-day sales', 'market avg', 'last sale'];
const RANDOM_FREE = (p) => p === 'src/market.js' || p === 'src/item-ux.js' || /^src\/net\/market-[^/]+\.js$/.test(p);

/** Two views of a JS source: comments blanked (strings kept), and comments AND
 *  string/template/regex literals blanked. Newlines survive so lines map 1:1. */
export function strip(src) {
  let noC = '', noCS = '';
  let i = 0, prev = '';
  const put = (c, keepInStrings) => { noC += keepInStrings; noCS += c; };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') { put(' ', ' '); i++; }
      continue;
    }
    if (c === '/' && n === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { const k = src[i] === '\n' ? '\n' : ' '; put(k, k); i++; }
      put(' ', ' '); put(' ', ' '); i += 2;
      continue;
    }
    const regexOk = c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev));
    if (c === '"' || c === "'" || c === '`' || regexOk) {
      const q = c; put(q, q); i++;
      let inClass = false;
      while (i < src.length) {
        const d = src[i];
        if (d === '\\') { put(' ', d + (src[i + 1] || '')); noCS += ' '; i += 2; continue; }
        if (q === '/' && d === '[') inClass = true;
        else if (q === '/' && d === ']') inClass = false;
        if (d === q && !inClass) break;
        if (d === '\n' && q !== '`') break;
        put(d === '\n' ? '\n' : ' ', d); i++;
      }
      if (i < src.length) { put(src[i], src[i]); i++; }
      prev = 'x';
      continue;
    }
    put(c, c);
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return { noC, noCS };
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(name)) out.push(p);
  }
  return out;
}

export function loadTree() {
  const files = {};
  for (const abs of walk(join(ROOT, 'src'), [])) {
    const rel = relative(ROOT, abs).split(sep).join('/');
    if (rel.startsWith('src/features/smoke/') || rel === 'src/features/smoke-test.js') continue;
    files[rel] = readFileSync(abs, 'utf8');
  }
  return files;
}

export function check(files) {
  const problems = [];
  const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
  let keyHits = 0;
  for (const [p, src] of Object.entries(files)) {
    const { noC, noCS } = strip(src);
    if (RANDOM_FREE(p)) {
      for (const m of noCS.matchAll(/\bMath\.random\b/g)) problems.push(`MP-1 ${p}:${lineOf(noCS, m.index)} Math.random`);
    }
    for (let idx = noC.indexOf(HISTORY_KEY); idx >= 0; idx = noC.indexOf(HISTORY_KEY, idx + 1)) {
      keyHits++;
      const line = noC.split('\n')[lineOf(noC, idx) - 1];
      if (p !== 'src/market.js' || !/localStorage\.removeItem\(/.test(line) || /getItem|setItem/.test(line)) {
        problems.push(`MP-2 ${p}:${lineOf(noC, idx)} the retired price-history key is read or written`);
      }
    }
    for (const id of RETIRED_IDENTS) {
      for (const m of noCS.matchAll(new RegExp('\\b' + id + '\\b', 'g'))) problems.push(`MP-2 ${p}:${lineOf(noCS, m.index)} ${id}`);
    }
    for (const ph of RETIRED_PHRASES) {
      for (let idx = noC.indexOf(ph); idx >= 0; idx = noC.indexOf(ph, idx + 1)) problems.push(`MP-3 ${p}:${lineOf(noC, idx)} "${ph}"`);
    }
  }
  if (keyHits > 1) problems.push(`MP-2 the retired price-history key appears ${keyHits}× in shipped src (at most 1: the purge)`);
  if (Object.keys(files).length < 50) problems.push(`only ${Object.keys(files).length} src files scanned — the guard is checking nothing`);
  return problems;
}

function selftest() {
  const base = loadTree();
  const cases = [
    ['clean tree', {}, null],
    ['Math.random in market.js code', { 'src/market.js': (s) => s + '\nvar __x = Math.random();\n' }, 'MP-1'],
    ['setItem of the history key', { 'src/market.js': (s) => s + "\nlocalStorage.setItem('" + HISTORY_KEY + "', '{}');\n" }, 'MP-2'],
    ['a retired identifier', { 'src/item-ux.js': (s) => s + '\nwindow.getMarketAvgPrice && 0;\n' }, 'MP-2'],
    ['a "7d avg" phrase in item-ux.js', { 'src/item-ux.js': (s) => s + "\nvar __y = '7d avg ' + x;\n" }, 'MP-3'],
    ['comment-only and string-only Math.random', { 'src/market.js': (s) => s + "\n// Math.random\nvar __z = 'Math.random';\n" }, null],
  ];
  let bad = 0;
  for (const [name, muts, want] of cases) {
    const files = { ...base };
    for (const [p, f] of Object.entries(muts)) files[p] = f(files[p]);
    const got = check(files);
    const ok = want === null ? got.length === 0 : got.some((g) => g.startsWith(want));
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name} → ${got.length ? got[0] : 'GREEN'} (want ${want || 'GREEN'})`);
  }
  if (bad) { console.error(`✗ market-price-source --selftest: ${bad} case(s) wrong`); process.exit(1); }
  console.log(`✓ market-price-source --selftest: all ${cases.length} cases behave (non-vacuous)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--selftest')) selftest();
  else {
    const problems = check(loadTree());
    if (problems.length) {
      for (const p of problems) console.error('✗ ' + p);
      console.error(`✗ market-price-source: ${problems.length} problem(s) — the browser authors a market price statistic`);
      process.exit(1);
    }
    console.log('✓ market-price-source: no client-authored price statistic in shipped src (MP-1..MP-3)');
  }
}
