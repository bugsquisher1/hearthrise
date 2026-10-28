// ════════════════════════════════════════════════════════════════════════
// tests/window-globals-exist.mjs — THE WINDOW-GLOBAL CENSUS.
//
// WHY THIS EXISTS (b515). src/net/dungeon-scrip-record.js read
// `window.HearthriseAccrue.isServerAccrualEnabled()`. Nothing in the repo has ever
// assigned that name — the accrual module publishes `window.HearthriseAccrual` — so
// the read was permanently undefined, serverActive() was permanently false, and the
// dungeon-settle ARM was dormant in every browser while the flag said ON.
//
// AND AGAIN (2026-10-22, the room-purpose lane). src/world/world-boot.js read
// `win.HearthriseRooms` / `win.HearthriseTrophies` / `win.ROOMS` (through a `win`
// alias of window, which the first cut of this guard never looked at) — globals the
// scrapped old client published and the rebuilt client never sets — so the home in
// the World showed no rooms whatever the player bought.
//
// A missing global is SILENT in JS: `win.Nope && ...` is just falsy, so the failure
// mode is a feature that quietly does nothing. This census makes it loud. Under
// src/** (not src/vendor/**) and the root *.html pages, with comments stripped:
//   1. every mention of a `Hearthrise<Name>` identifier, on ANY receiver or bare,
//      that is not itself an assignment, is a READ; it must have an ASSIGNMENT
//      (`Hearthrise<Name> =` on any receiver, or `Hearthrise<Name>:` as a
//      publish-map key) somewhere in the same corpus;
//   2. every `window.X` / `win.X` / `globalThis.X` / `self.X` read of any other name
//      must be either assigned the same way (`window.X =`) somewhere in the corpus,
//      a browser/runtime API (PLATFORM), or a vendor script's global (VENDOR).
// KNOWN_ABSENT is the only other exemption, and each entry carries its reason.
//
// Run GREEN:  node tests/window-globals-exist.mjs
// List it:    node tests/window-globals-exist.mjs --list
// Prove RED:  node tests/window-globals-exist.mjs --selftest   (plants each shape)
//
// NO ?v= on the imports (tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* Reads that are SUPPOSED to have no assignment. Each needs a reason; a stale
   exemption hides the next missing global, so keep this list near empty. */
const KNOWN_ABSENT = {
  /* EMPTY since the client reset (2026-10-17): every entry named a read in the
     deleted client or its in-page suite. */
};

/* What the browser (or Deno / Node, for the dual-runtime modules) provides on the
   global object. A new legitimate platform read joins this list in its own commit. */
const PLATFORM = new Set([
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'document', 'location', 'history', 'navigator', 'screen',
  'parent', 'top', 'opener', 'performance', 'PerformanceObserver', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver',
  'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'queueMicrotask', 'requestIdleCallback', 'matchMedia', 'getComputedStyle', 'getSelection', 'devicePixelRatio', 'innerWidth', 'innerHeight',
  'outerWidth', 'outerHeight', 'scrollX', 'scrollY', 'crypto', 'fetch', 'console', 'localStorage', 'sessionStorage',
  'indexedDB', 'caches', 'WebSocket', 'Worker', 'URL', 'Blob', 'Image', 'Event', 'CustomEvent', 'AbortController',
  'BroadcastChannel', 'CompressionStream', 'TextEncoder', 'TextDecoder', 'structuredClone', 'isSecureContext', 'origin',
  'Deno', 'process', 'globalThis', 'open', 'close', 'focus', 'print', 'name',
]);
/* Globals a <script> in src/vendor/** publishes (UMD builds; their minified
   assignment shapes are not worth parsing). Each is loaded by a root page. */
const VENDOR = new Set(['supabase', 'Sentry', 'posthog']);

const PREFIXED = /(?:^|[^\w$])(Hearthrise[A-Z][A-Za-z0-9_]*)/g;
const RECEIVER = /\b(?:window|win|globalThis)\.([A-Za-z_$][\w$]*)/g;
/* `win` is the window alias the modules take (startApp(win), `const win = window`);
   a file that declares `win` as something else (shell.js: a window FRAME element)
   has no alias, and its `win.x` reads are not global reads. */
const WIN_NOT_WINDOW = /\b(?:const|let|var)\s+win\s*=(?!\s*(?:window|globalThis)\b)/;
/* An assignment:
     WRITE — `<name> =` on any receiver (window./root./globalThis./bare).
             `==`/`===`/`=>` are reads, not writes.
     KEY   — `Hearthrise<Name>:` as an object-literal key (a publish through
             Object.assign(window, {...})), and ONLY when the name is not a property
             access: `cond ? window.HearthriseX : null` is a ternary READ. */
const isWrite = (src, end) => /^\s*=(?![=>])/.test(src.slice(end, end + 8));
const isKey = (src, start, end) => /^\s*:/.test(src.slice(end, end + 4)) && !/[.?]\s*$/.test(src.slice(Math.max(0, start - 8), start));

/** Strip block comments, one-line '…' / "…" string contents and // line comments
    (in that order), so a name only MENTIONED in prose or a message neither counts
    as a read nor as an assignment. Naive but sufficient for this corpus. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, (m) => m[0] + ' '.repeat(m.length - 2) + m[0])
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'vendor') walk(p, out); }
    else if (/\.(js|mjs|html)$/.test(e)) out.push(p);
  }
  return out;
}

export function census(overlay = {}) {
  const files = [...walk(join(ROOT, 'src')), ...readdirSync(ROOT).filter((n) => n.endsWith('.html')).map((n) => join(ROOT, n))];
  const reads = new Map();       // name -> [ 'file:line', ... ]
  const assigns = new Map();     // name -> [ 'file:line', ... ]
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const f of files) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    const raw = Object.prototype.hasOwnProperty.call(overlay, rel) ? overlay[rel] : readFileSync(f, 'utf8');
    const src = stripComments(raw);
    const at = (idx) => `${rel}:${src.slice(0, idx).split('\n').length}`;
    const seen = new Set();
    for (const m of src.matchAll(PREFIXED)) {
      const start = m.index + m[0].length - m[1].length, end = m.index + m[0].length;
      seen.add(start);
      if (isWrite(src, end) || isKey(src, start, end)) add(assigns, m[1], at(start));
      else add(reads, m[1], at(start));
    }
    const winAlias = !WIN_NOT_WINDOW.test(src);
    for (const m of src.matchAll(RECEIVER)) {
      const start = m.index + m[0].length - m[1].length, end = m.index + m[0].length;
      if (seen.has(start)) continue;          // a Hearthrise* name, counted above
      if (!winAlias && m[0].startsWith('win.')) continue;
      if (isWrite(src, end)) add(assigns, m[1], at(start));
      else add(reads, m[1], at(start));
    }
  }
  return { reads, assigns };
}

export function dangling(overlay = {}) {
  const { reads, assigns } = census(overlay);
  const out = [];
  for (const [name, sites] of reads) {
    if (assigns.has(name) || KNOWN_ABSENT[name]) continue;
    if (!name.startsWith('Hearthrise') && (PLATFORM.has(name) || VENDOR.has(name))) continue;
    out.push({ name, sites });
  }
  return { dangling: out, reads, assigns };
}

const argv = process.argv.slice(2);

if (argv.includes('--selftest')) {
  /* MUTATIONS, each planted into a real client module, each must go RED by name;
     and one CONTROL (a platform read through the same alias) must stay green. */
  const base = dangling().dangling;
  if (base.length) {
    console.error('x selftest cannot run: the guard is already RED — ' + base.map((d) => d.name).join(', '));
    process.exit(1);
  }
  const plant = (rel, line) => ({ [rel]: readFileSync(join(ROOT, rel), 'utf8') + '\n' + line + '\n' });
  const cases = [
    ['the b511 typo, window.HearthriseAccrue', 'src/app/boot.js', 'const __p = window.HearthriseAccrue;', 'HearthriseAccrue', true],
    ['the 10-22 shape, a scrapped global through a `win` alias', 'src/world/world-boot.js', 'const __p = (w) => w.HearthriseRooms;', 'HearthriseRooms', true],
    ['an unprefixed scrapped global, win.ROOMS', 'src/world/world-boot.js', 'const __p = win.ROOMS;', 'ROOMS', true],
    ['an unprefixed scrapped global, globalThis.DUNGEONS', 'src/data/item-authority.js', 'const __p = globalThis.DUNGEONS;', 'DUNGEONS', true],
    ['CONTROL: a platform read, win.requestAnimationFrame', 'src/world/world-boot.js', 'const __p = win.requestAnimationFrame;', 'requestAnimationFrame', false],
  ];
  let ok = true;
  for (const [what, rel, line, name, red] of cases) {
    const hit = dangling(plant(rel, line)).dangling.some((d) => d.name === name);
    const pass = hit === red;
    ok = ok && pass;
    console.log((pass ? '  ok ' : '  x  ') + what + ': ' + (hit ? 'RED' : 'green') + (pass ? '' : ' (expected ' + (red ? 'RED' : 'green') + ')'));
  }
  console.log(`  allowlist holds ${Object.keys(KNOWN_ABSENT).length} intentional absences`);
  process.exit(ok ? 0 : 1);
}

const { dangling: bad, reads, assigns } = dangling();

if (argv.includes('--list')) {
  const names = [...new Set([...reads.keys(), ...assigns.keys()])].sort();
  for (const n of names) {
    const r = (reads.get(n) || []).length; const a = (assigns.get(n) || []).length;
    const mark = a ? 'OK ' : (KNOWN_ABSENT[n] ? '-- ' : (PLATFORM.has(n) || VENDOR.has(n)) && !n.startsWith('Hearthrise') ? 'pl ' : 'XX ');
    console.log(`${mark}${n.padEnd(30)} reads:${String(r).padStart(3)} assigns:${String(a).padStart(2)}`);
  }
}

console.log(`window-globals-exist: ${reads.size} global names READ, ${assigns.size} ASSIGNED across src/** (not vendor) + the root pages`
  + ` (${Object.keys(KNOWN_ABSENT).length} intentional absences allowlisted).`);

if (bad.length) {
  for (const d of bad) {
    console.error(`x ${d.name} is READ off the global object but never assigned anywhere in src/** or a root *.html page`);
    for (const s of d.sites.slice(0, 6)) console.error(`    ${s}`);
  }
  console.error(`\n${bad.length} dangling global(s). A missing global is silently undefined — the feature behind`
    + ` it is DEAD, not loudly broken (b515 HearthriseAccrue; 10-22 HearthriseRooms: the home showed no rooms).`
    + ` Read the server's section through the session instead, fix the name, or (a real platform API) add it to PLATFORM.`);
  process.exit(1);
}
