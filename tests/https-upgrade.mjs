#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/https-upgrade.mjs — EVERY ROOT PAGE MOVES AN http:// VISIT TO https:// FIRST.
//
//   node tests/https-upgrade.mjs             the guard
//   node tests/https-upgrade.mjs --selftest  every planted defect must turn it RED
//
// mutant-anchors: none — every --selftest mutation transforms an in-memory copy of the pages and the script, never a file
//
// WHY (Coordinator QA, 2026-10-20): GitHub Pages served http://hearthrise.net
// with no redirect, and the hr-accrue CORS allowlist holds https origins only
// (supabase/functions/hr-accrue/cors.js), so on http every hunt call was
// refused: the hunt froze and only the server's background tick moved it. The
// fix is the page, not the allowlist: src/platform/https-upgrade.js replaces
// an http page with the same URL on https before anything else runs.
//
//   HU-1  every root *.html loads src/platform/https-upgrade.js?v=… as a plain
//         classic script (no type, async or defer), inside <head>, and it is
//         the FIRST <script> of the page (so before every module script)
//   HU-2  the script, run against a fake location: an http visit on a real
//         host goes to https with the same host (port included), path, query
//         and hash; https is left alone; localhost, 127.0.0.1, [::1] and
//         *.localhost stay on http (local dev)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT } from './_client-harness.mjs';

const SCRIPT = 'src/platform/https-upgrade.js';
const TAG = /^<script\s+src="src\/platform\/https-upgrade\.js\?v=\d[\d.]*"\s*><\/script>$/;

/** The root pages as { name: text }. */
function pages() {
  const out = {};
  for (const f of readdirSync(ROOT)) if (/\.html$/i.test(f)) out[f] = readFileSync(join(ROOT, f), 'utf8');
  return out;
}

/* Comments hold example tags; they are not markup. */
const uncomment = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

/** HU-1 over one page's text: [] when the redirect is the first script in <head>. */
export function pageFails(name, html) {
  const h = uncomment(html);
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(h);
  if (!head) return ['HU-1 ' + name + ' has no <head>'];
  const first = /<script\b[^>]*>[\s\S]*?<\/script>/i.exec(h);
  if (!first) return ['HU-1 ' + name + ' has no script at all, so no https redirect'];
  if (!TAG.test(first[0].trim())) return ['HU-1 ' + name + '’s first script is not the plain https redirect: ' + first[0].slice(0, 120)];
  if (first.index < head.index || first.index > head.index + head[0].length) return ['HU-1 ' + name + '’s https redirect is not inside <head>'];
  return [];
}

/** Run the script against `href`; the URL it replaced the page with, or null. */
export function redirectOf(src, href) {
  const u = new URL(href);
  let to = null;
  const location = { protocol: u.protocol, hostname: u.hostname, host: u.host, pathname: u.pathname, search: u.search, hash: u.hash,
    replace: (x) => { to = String(x); }, assign: (x) => { to = 'assign:' + x; } };
  Object.defineProperty(location, 'href', { get: () => href, set: (x) => { to = 'href:' + x; } });
  vm.runInNewContext(src, { window: { location }, location });
  return to;
}

const CASES = Object.freeze([
  ['http://hearthrise.net/play.html?invite=7#party', 'https://hearthrise.net/play.html?invite=7#party'],
  ['http://hearthrise.net/', 'https://hearthrise.net/'],
  ['http://bugsquisher1.github.io/hearthrise/index.html', 'https://bugsquisher1.github.io/hearthrise/index.html'],
  ['http://hearthrise.net:8080/play.html', 'https://hearthrise.net:8080/play.html'],
  ['https://hearthrise.net/play.html', null],
  ['http://localhost:5173/play.html', null],
  ['http://127.0.0.1:8080/play.html', null],
  ['http://[::1]:8080/play.html', null],
  ['http://hearthrise.localhost/play.html', null],
]);

/** HU-2 over the script's text. */
export function scriptFails(src) {
  const fails = [];
  for (const [from, want] of CASES) {
    let got;
    try { got = redirectOf(src, from); } catch (e) { got = 'threw ' + e.message; }
    if (got !== want) fails.push('HU-2 ' + from + ' → ' + (got || 'stays') + '; want ' + (want || 'stays'));
  }
  return fails;
}

function check(pageTexts, src) {
  const fails = [];
  const names = Object.keys(pageTexts);
  if (!names.length) fails.push('HU-1 no root *.html found');
  for (const n of names) fails.push(...pageFails(n, pageTexts[n]));
  fails.push(...scriptFails(src));
  return fails;
}

function selftest() {
  const p = pages();
  const src = readFileSync(join(ROOT, SCRIPT), 'utf8');
  const clean = check(p, src);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); return 1; }
  const tagOf = (html) => /<script\s+src="src\/platform\/https-upgrade\.js[^"]*"\s*><\/script>\n?/.exec(html)[0];
  const play = p['play.html'];
  const MUT = [
    ['a page drops the redirect', { 'play.html': play.replace(tagOf(play), '') }, src],
    ['the redirect loads after the kill-switch', { 'play.html': play.replace(tagOf(play), '').replace('</head>', tagOf(play) + '</head>') }, src],
    ['the redirect moves into <body>', { 'play.html': play.replace(tagOf(play), '').replace('</body>', tagOf(play) + '</body>') }, src],
    ['the redirect is deferred', { 'play.html': play.replace(tagOf(play), tagOf(play).replace('<script ', '<script defer ')) }, src],
    ['the redirect is a module', { 'play.html': play.replace(tagOf(play), tagOf(play).replace('<script ', '<script type="module" ')) }, src],
    ['the notice page drops it', { 'index.html': p['index.html'].replace(tagOf(p['index.html']), '') }, src],
    ['a new root page has none', { 'extra.html': '<!doctype html><html><head><meta charset="utf-8"><script type="module" src="src/app/boot.js?v=1"></script></head><body></body></html>' }, src],
    ['the hash is lost', {}, src.replace(' + l.hash', '')],
    ['the query is lost', {}, src.replace(' + l.search', '')],
    ['the port is lost', {}, src.replace("'https://' + l.host", "'https://' + l.hostname")],
    ['https also redirects (a loop)', {}, src.replace("if (l.protocol !== 'http:') return;", '')],
    ['local dev is sent to https', {}, src.replace(/if \(h === 'localhost'[^\n]*\n/, '')],
    ['*.localhost is sent to https', {}, src.replace(" || /\\.localhost$/.test(h)", '')],
    ['[::1] is sent to https', {}, src.replace("h === '[::1]' || h === '::1' || ", '')],
  ];
  let bad = 0;
  for (const [name, override, s] of MUT) {
    const changed = Object.keys(override).some((k) => override[k] !== p[k]) || s !== src;
    if (!changed) { console.log('  ✗ ' + name + ' — anchor not found'); bad++; continue; }
    const fails = check(Object.assign({}, p, override), s);
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'https-upgrade --selftest: ' + bad + ' escaped' : 'https-upgrade --selftest: ' + MUT.length + '/' + MUT.length + ' mutants caught');
  return bad ? 1 : 0;
}

function main() {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const p = pages();
  const fails = check(p, readFileSync(join(ROOT, SCRIPT), 'utf8'));
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'https-upgrade: ' + fails.length + ' RED'
    : 'https-upgrade: ' + Object.keys(p).length + ' root pages move http to https first; local dev stays on http');
  process.exit(fails.length ? 1 : 0);
}
main();
