#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/world-no-authority.mjs — THE WORLD PANE IS A WINDOW, NOT A PLAYER
//
//   node tests/world-no-authority.mjs             the guard
//   node tests/world-no-authority.mjs --selftest  every planted violation must go RED
//
// The World pane draws what the server says (CLAUDE.md §1: the client sends
// intents and renders state; it never authors a number). Its code lives in
// src/world/** with its map rows in src/data/world/**, and none of it may:
//   W-G      assign to G — except G._world, the display scratch that is never
//            persisted or sent (aliases of window.G count, so do Object.assign,
//            delete and ++/--)
//   W-IMPORT import the engine that decides outcomes or the seams that record
//            them: core/combat-sim, core/rng, net/accrue, net/record — or reach
//            them through window.HearthriseCore / HearthriseAccrual /
//            HearthriseCombatSim / HearthriseRecord
//   W-CALL   talk to the server or run the game: fetch, XMLHttpRequest,
//            WebSocket, EventSource, sendBeacon, .rpc / rpc(), declareActivity,
//            startCombat, simulate* (the AWAY-12 one-engine rule, extended to
//            src/world), Math.random, setInterval
//   W-STORE  persist anything: localStorage, sessionStorage, indexedDB
// Comments are stripped and string contents blanked before the code rules run
// (a docstring may say "Math.random"); import specifiers are read separately.
// A scan that reads too few files is itself red — a rule that reads nothing
// reports nothing.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCOPES = ['src/world', 'src/data/world'];
const MIN_FILES = 12;

function walk(dir, out = []) {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const n of readdirSync(join(ROOT, dir)).sort()) {
    const p = dir + '/' + n;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/**
 * Split source into `code` (comments removed, string/template text blanked,
 * `${…}` kept as code, newlines kept so line numbers hold) and `specs` (every
 * import specifier with its offset). Throws on an unterminated string or comment.
 */
function lex(src) {
  let code = '', i = 0;
  const specs = [];
  const n = src.length;
  const keep = (c) => { code += c; };
  const blank = (c) => { code += c === '\n' ? '\n' : ' '; };
  const lastSig = () => { for (let k = code.length - 1; k >= 0; k--) if (!/\s/.test(code[k])) return code.slice(Math.max(0, k - 6), k + 1); return ''; };
  const depth = [];   // template nesting: the brace count at which each ${ opened
  let braces = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unterminated comment');
      for (let k = i; k < end + 2; k++) blank(src[k]);
      i = end + 2; continue;
    }
    if (c === '\'' || c === '"') {
      const start = i, q = code.length;
      keep(c); i++;
      let text = '';
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') { text += src[i + 1]; blank(src[i]); blank(src[i + 1]); i += 2; continue; }
        if (src[i] === '\n') throw new Error('unterminated string at ' + start);
        text += src[i]; blank(src[i]); i++;
      }
      if (i >= n) throw new Error('unterminated string at ' + start);
      keep(c); i++;
      if (/(\bfrom|\bimport|import\s*\()\s*$/.test(code.slice(Math.max(0, q - 16), q))) specs.push({ at: q, spec: text });
      continue;
    }
    if (c === '`' || (c === '}' && depth.length && depth[depth.length - 1] === braces)) {
      if (c === '}') depth.pop();
      keep(c); i++;
      let closed = false;
      while (i < n) {
        if (src[i] === '\\') { blank(src[i]); blank(src[i + 1]); i += 2; continue; }
        if (src[i] === '`') { keep('`'); i++; closed = true; break; }
        if (src[i] === '$' && src[i + 1] === '{') { keep('$'); keep('{'); i += 2; depth.push(braces); closed = true; break; }
        blank(src[i]); i++;
      }
      if (!closed) throw new Error('unterminated template');
      continue;
    }
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]$|\b(return|typeof|case|in|of)$/.test(lastSig())) {
      keep(c); i++;
      let cls = false;
      while (i < n && (src[i] !== '/' || cls)) { if (src[i] === '\\') { blank(src[i]); blank(src[i + 1]); i += 2; continue; } if (src[i] === '[') cls = true; if (src[i] === ']') cls = false; if (src[i] === '\n') throw new Error('unterminated regex'); blank(src[i]); i++; }
      keep('/'); i++; continue;
    }
    if (c === '{') braces++;
    if (c === '}') braces--;
    keep(c); i++;
  }
  if (depth.length) throw new Error('unterminated template expression');
  return { code, specs };
}

const lineOf = (text, at) => text.slice(0, at).split('\n').length;
const FORBIDDEN_MODULE = /(^|\/)(core\/combat-sim|core\/rng|net\/accrue|net\/record)\.js(\?|$)/;
const FORBIDDEN_GLOBAL = /\b(HearthriseCore|HearthriseAccrual|HearthriseCombatSim|HearthriseRecord)\b/g;
const CALLS = [
  [/\bfetch\s*\(/g, 'fetch()'], [/\bXMLHttpRequest\b/g, 'XMLHttpRequest'], [/\bWebSocket\b/g, 'WebSocket'],
  [/\bEventSource\b/g, 'EventSource'], [/\bsendBeacon\b/g, 'sendBeacon'], [/(\.|\b)rpc\s*\(/g, 'rpc()'],
  [/\bdeclareActivity\b/g, 'declareActivity'], [/\bstartCombat\b/g, 'startCombat'], [/\bsimulate[A-Z]\w*/g, 'simulate*'],
  [/\bMath\s*\.\s*random\b/g, 'Math.random'], [/\bsetInterval\b/g, 'setInterval'],
];
const STORES = /\b(localStorage|sessionStorage|indexedDB)\b/g;
const ASSIGN = '(?:=(?!=)|\\+=|-=|\\*=|\\/=|%=|\\|\\|=|&&=|\\?\\?=|\\+\\+|--)';

/** Every violation in one file's source: [{ rule, line, what }]. */
function scan(rel, src) {
  const out = [];
  let lexed;
  try { lexed = lex(src); } catch (e) { return [{ rule: 'W-LEX', line: 0, what: rel + ' could not be read: ' + e.message }]; }
  const { code, specs } = lexed;
  const hit = (rule, at, what) => out.push({ rule, line: lineOf(code, at), what });
  for (const s of specs) if (FORBIDDEN_MODULE.test(s.spec)) hit('W-IMPORT', s.at, 'imports ' + s.spec);
  for (const m of code.matchAll(FORBIDDEN_GLOBAL)) hit('W-IMPORT', m.index, 'reaches ' + m[1] + ' through window');
  for (const [re, what] of CALLS) for (const m of code.matchAll(re)) hit('W-CALL', m.index, what);
  for (const m of code.matchAll(STORES)) hit('W-STORE', m.index, m[1]);
  const aliases = new Set(['G']);
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(?\s*(?:(?:window|win|globalThis|self)\s*\.\s*)?G\b(?!\s*\.)/g)) aliases.add(m[1]);
  const roots = '(?:(?:window|win|globalThis|self)\\s*\\.\\s*G|' + [...aliases].map((a) => a.replace(/\$/g, '\\$')).join('|') + ')';
  const lead = '(?<![\\w$.])';
  const chain = '(?:\\s*(?:\\.\\s*[A-Za-z_$][\\w$]*|\\[[^\\]]*\\]))*';   // G.a.b[c] — the FIRST segment decides
  const prop = new RegExp(lead + roots + '\\s*(?:\\.\\s*([A-Za-z_$][\\w$]*)|\\[([^\\]]*)\\])' + chain + '\\s*' + ASSIGN, 'g');
  for (const m of code.matchAll(prop)) if (m[1] !== '_world') hit('W-G', m.index, 'writes G.' + (m[1] || '[' + m[2].trim() + ']'));
  const pre = new RegExp('(?:\\+\\+|--)\\s*' + roots + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)', 'g');
  for (const m of code.matchAll(pre)) if (m[1] !== '_world') hit('W-G', m.index, 'writes G.' + m[1]);
  const whole = new RegExp('(?<![\\w$.])(?:window|win|globalThis|self)\\s*\\.\\s*G\\s*' + ASSIGN, 'g');
  for (const m of code.matchAll(whole)) hit('W-G', m.index, 'replaces window.G');
  const via = new RegExp('\\b(?:Object\\s*\\.\\s*(?:assign|defineProperty|defineProperties|setPrototypeOf)|Reflect\\s*\\.\\s*(?:set|defineProperty|deleteProperty))\\s*\\(\\s*' + roots + '\\s*[,)]', 'g');
  for (const m of code.matchAll(via)) hit('W-G', m.index, 'writes G through ' + m[0].split('(')[0].replace(/\s/g, ''));
  const del = new RegExp('\\bdelete\\s+' + roots + '\\s*(?:\\.\\s*([A-Za-z_$][\\w$]*)|\\[)', 'g');
  for (const m of code.matchAll(del)) if (m[1] !== '_world') hit('W-G', m.index, 'deletes from G');
  return out;
}

function scanTree() {
  const files = SCOPES.flatMap((d) => walk(d));
  const findings = [];
  for (const rel of files) for (const f of scan(rel, readFileSync(join(ROOT, rel), 'utf8'))) findings.push(Object.assign({ file: rel }, f));
  return { files, findings };
}

function selftest() {
  let bad = 0;
  const { files, findings } = scanTree();
  const need = ['src/world/store.js', 'src/world/world-boot.js', 'src/world/render/canvas-backend.js'];
  if (findings.length || files.length < MIN_FILES || !need.every((f) => files.includes(f))) {
    console.log('  ✗ clean control: ' + findings.length + ' finding(s) over ' + files.length + ' files at rest'); bad++;
  } else console.log('  ✓ clean control — ' + files.length + ' real files scan clean');
  const host = 'src/world/world-boot.js';
  const text = readFileSync(join(ROOT, host), 'utf8');
  const at = text.indexOf('  function sync() {');
  if (at < 0) { console.log('  ✗ could not find the plant site in ' + host); process.exit(1); }
  const plant = (line) => text.slice(0, at) + '  ' + line + '\n' + text.slice(at);
  const top = (line) => line + '\n' + text;
  const CASES = [
    ['W-G', 'a write to a server field', plant('G.gold = 1;')],
    ['W-G', 'a write through an alias of window.G', plant('const g = win.G; g.hp = 0;')],
    ['W-G', 'a write through a defaulted alias', plant('const H = win.G || {}; H.skills = {};')],
    ['W-G', 'Object.assign onto G', plant('Object.assign(window.G, { hp: 1 });')],
    ['W-G', 'replacing window.G', plant('window.G = {};')],
    ['W-G', 'delete from G', plant('delete G.inventory;')],
    ['W-G', 'an increment of a nested G field', plant('G.stats.kills++;')],
    ['W-G', 'a nested write', plant('G.skills.attack = 5;')],
    ['W-G', 'a nested write through an alias', plant('const g = window.G; g.inventory[id] = 0;')],
    ['W-G', 'a computed-key write', plant("G['gold'] = 5;")],
    ['W-IMPORT', 'importing the combat engine', top("import { simulateTick } from '../core/combat-sim.js?v=1';")],
    ['W-IMPORT', 'importing the RNG', top("import { rngFor } from '../core/rng.js?v=1';")],
    ['W-IMPORT', 'importing the accrual seam', top("import '../net/accrue.js?v=1';")],
    ['W-IMPORT', 'a dynamic import of the record seam', plant("import('../net/record.js?v=1');")],
    ['W-IMPORT', 'the engine through window', plant('const sim = window.HearthriseCore.combatSim;')],
    ['W-CALL', 'fetch', plant("fetch('/rest/v1/player_state');")],
    ['W-CALL', 'an rpc', plant("sb.rpc('hr_world_walk', {});")],
    ['W-CALL', 'declareActivity', plant("window.declareActivity('combat');")],
    ['W-CALL', 'startCombat', plant("window.startCombat('rat');")],
    ['W-CALL', 'a second simulation (AWAY-12)', plant('simulateSpan(ctx);')],
    ['W-CALL', 'Math.random', plant('const r = Math.random();')],
    ['W-CALL', 'setInterval', plant('setInterval(step, 1000);')],
    ['W-CALL', 'a WebSocket', plant("new WebSocket('wss://x');")],
    ['W-STORE', 'localStorage', plant("localStorage.setItem('pos', '1');")],
  ];
  const GREEN = [
    ['the display scratch', plant('G._world.pos = { x: 1, y: 2 };')],
    ['a read compared with ===', plant('if (G.gold === 1) last = 0;')],
    ['a comment naming everything', plant('// fetch( Math.random() G.gold = 1 setInterval localStorage')],
    ['a string naming everything', plant("const msg = 'no fetch( or Math.random() or G.gold = 1 here';")],
    ['a template with a clean expression', plant('const t = `x ${frames + 1} Math.random`;')],
  ];
  for (const [rule, why, src] of CASES) {
    const f = scan(host, src);
    if (f.some((x) => x.rule === rule)) console.log('  ✓ ' + rule + ' caught: ' + why);
    else { console.log('  ✗ ' + rule + ' NOT CAUGHT: ' + why + (f.length ? ' (got ' + f.map((x) => x.rule).join(',') + ')' : '')); bad++; }
  }
  for (const [why, src] of GREEN) {
    const f = scan(host, src);
    if (!f.length) console.log('  ✓ stays green: ' + why);
    else { console.log('  ✗ false positive on ' + why + ': ' + f.map((x) => x.rule + ' ' + x.what).join('; ')); bad++; }
  }
  if (bad) { console.error('world-no-authority --selftest FAILED — ' + bad + ' unproven'); process.exit(1); }
  console.log('world-no-authority --selftest PASSED — clean control, ' + CASES.length + ' violations caught, ' + GREEN.length + ' negative controls green.');
}

if (process.argv.includes('--selftest')) selftest();
else {
  const { files, findings } = scanTree();
  if (files.length < MIN_FILES) {
    console.error('world-no-authority: only ' + files.length + ' files under ' + SCOPES.join(', ') + ' (expected >= ' + MIN_FILES + ') — the scan is reading nothing');
    process.exit(1);
  }
  if (findings.length) {
    for (const f of findings) console.error('  ✗ ' + f.rule + '  ' + f.file + ':' + f.line + '  ' + f.what);
    console.error('world-no-authority: ' + findings.length + ' violation(s). The world renders server state; it never writes it.');
    process.exit(1);
  }
  console.log('world-no-authority: green — ' + files.length + ' files under ' + SCOPES.join(', ') + ' write only G._world, import no engine, call no server, store nothing');
}
