// ════════════════════════════════════════════════════════════════════════
// tests/window-globals-exist.mjs — THE window.Hearthrise* CENSUS.
//
// WHY THIS EXISTS (b515). src/net/dungeon-scrip-record.js read
// `window.HearthriseAccrue.isServerAccrualEnabled()`. Nothing in the repo has ever
// assigned that name — the accrual module publishes `window.HearthriseAccrual` — so
// the read was permanently undefined, serverActive() was permanently false, and the
// dungeon-settle ARM was dormant in every browser while the flag said ON and the
// changelog said shipped. Every dungeon clear fell into the client mint and the
// reward vanished on the next reload.
//
// A misspelt global is SILENT in JS: `window.Nope && ...` is just falsy, so the
// failure mode is a feature that quietly does nothing. This guard is the census that
// makes it loud: every `window.Hearthrise<Name>` READ under src/** must have a
// matching ASSIGNMENT (`HearthriseName =` on any receiver, or `HearthriseName:` as a
// publish-map key — main.js publishes several through Object.assign(window, {...}))
// somewhere in src/** or index.html. Comments and the KNOWN_ABSENT allowlist are the
// only exemptions, and each allowlist entry carries its reason.
//
// Run GREEN:  node tests/window-globals-exist.mjs
// List it:    node tests/window-globals-exist.mjs --list
// Prove RED:  node tests/window-globals-exist.mjs --selftest   (plants a misspelling)
//
// NO ?v= on the imports (tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* Reads that are SUPPOSED to have no assignment. Each needs a reason; a stale
   exemption hides the next typo, so keep this list at three-ish entries. */
const KNOWN_ABSENT = {
  HearthriseLicence: 'AWAY-HONEST asserts the retired away-gate API is ABSENT — the read IS the assertion',
  HearthriseRecipes: 'optional namespace with an explicit `|| window` fallback in the suite',
  HearthriseTelemetry: 'optional analytics sink; client-state.js guards with `if (T && typeof T.event === "function")`',
};

const NAME = /\bwindow\.(Hearthrise[A-Za-z0-9_]*)/g;
/* An assignment, two shapes:
     WRITE — `Hearthrise<Name> =` on any receiver (window./root./globalThis./bare).
             `==`/`===`/`=>` are reads, not writes.
     KEY   — `Hearthrise<Name>:` as an object-literal key (main.js publishes several
             through Object.assign(window, {...})), and ONLY when the name is not a
             property access: `cond ? window.HearthriseX : null` is a ternary READ,
             and counting its colon as a publish is exactly how the first cut of this
             guard failed its own selftest. */
const ASSIGN_WRITE = /\b(Hearthrise[A-Za-z0-9_]*)\s*=(?![=>])/g;
const ASSIGN_KEY = /(?:^|[^.\w$])(Hearthrise[A-Za-z0-9_]*)\s*:/g;

/** Strip // line comments and block comments so a name only MENTIONED in prose
    (HearthriseChat is discussed in three comments and exists nowhere else) neither
    counts as a read nor as an assignment. Naive but sufficient: the corpus has no
    "//" inside a string that carries a Hearthrise* name. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html)$/.test(e)) out.push(p);
  }
  return out;
}

export function census(overlay = {}) {
  const files = [...walk(join(ROOT, 'src')), join(ROOT, 'index.html')];
  const reads = new Map();       // name -> [ 'file:line', ... ]
  const assigns = new Map();     // name -> [ 'file:line', ... ]
  for (const f of files) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    const raw = Object.prototype.hasOwnProperty.call(overlay, rel)
      ? overlay[rel] : readFileSync(f, 'utf8');
    const src = stripComments(raw);
    const lineOf = (idx) => src.slice(0, idx).split('\n').length;
    for (const m of src.matchAll(NAME)) {
      if (!reads.has(m[1])) reads.set(m[1], []);
      reads.get(m[1]).push(`${rel}:${lineOf(m.index)}`);
    }
    for (const re of [ASSIGN_WRITE, ASSIGN_KEY]) {
      for (const m of src.matchAll(re)) {
        if (!assigns.has(m[1])) assigns.set(m[1], []);
        assigns.get(m[1]).push(`${rel}:${lineOf(m.index)}`);
      }
    }
  }
  return { reads, assigns };
}

export function dangling(overlay = {}) {
  const { reads, assigns } = census(overlay);
  const out = [];
  for (const [name, sites] of reads) {
    if (assigns.has(name)) continue;
    if (KNOWN_ABSENT[name]) continue;
    out.push({ name, sites });
  }
  return { dangling: out, reads, assigns };
}

const argv = process.argv.slice(2);

if (argv.includes('--selftest')) {
  /* MUTATION: plant the exact b511 typo back into the real caller and require RED. */
  const rel = 'src/net/dungeon-scrip-record.js';
  const real = readFileSync(join(ROOT, rel), 'utf8');
  const mutated = real.replace(/window\.HearthriseAccrual/g, 'window.HearthriseAccrue');
  if (mutated === real) {
    console.error('x selftest could not plant the mutation — dungeon-scrip-record.js no longer reads window.HearthriseAccrual');
    process.exit(1);
  }
  const base = dangling().dangling;
  if (base.length) {
    console.error('x selftest cannot run: the guard is already RED — ' + base.map((d) => d.name).join(', '));
    process.exit(1);
  }
  const hit = dangling({ [rel]: mutated }).dangling;
  const caught = hit.some((d) => d.name === 'HearthriseAccrue');
  console.log(caught
    ? '  planted window.HearthriseAccrue (the b511 typo): RED — ' + hit.map((d) => d.name + ' @ ' + d.sites[0]).join(', ')
    : '  x planted typo STAYED GREEN — the census does not bite');
  const k = Object.keys(KNOWN_ABSENT);
  console.log(`  allowlist holds ${k.length} intentional absences: ${k.join(', ')}`);
  process.exit(caught ? 0 : 1);
}

const { dangling: bad, reads, assigns } = dangling();

if (argv.includes('--list')) {
  const names = [...new Set([...reads.keys(), ...assigns.keys()])].sort();
  for (const n of names) {
    const r = (reads.get(n) || []).length; const a = (assigns.get(n) || []).length;
    const mark = a ? 'OK ' : (KNOWN_ABSENT[n] ? '-- ' : 'XX ');
    console.log(`${mark}${n.padEnd(30)} reads:${String(r).padStart(3)} assigns:${String(a).padStart(2)}`);
  }
}

console.log(`window-globals-exist: ${reads.size} names READ, ${assigns.size} names ASSIGNED across src/** + index.html`
  + ` (${Object.keys(KNOWN_ABSENT).length} intentional absences allowlisted).`);

if (bad.length) {
  for (const d of bad) {
    console.error(`x window.${d.name} is READ but never assigned anywhere in src/** or index.html`);
    for (const s of d.sites.slice(0, 6)) console.error(`    ${s}`);
  }
  console.error(`\n${bad.length} dangling window global(s). A misspelt global is silently undefined — the`
    + ` feature behind it is DEAD, not loudly broken (b515: window.HearthriseAccrue kept the dungeon arm`
    + ` off while the flag said ON). Fix the name, or add it to KNOWN_ABSENT with a reason.`);
  process.exit(1);
}
process.exit(0);
