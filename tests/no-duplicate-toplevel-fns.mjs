// ============================================================================
// tests/no-duplicate-toplevel-fns.mjs — TWO FUNCTIONS WITH ONE NAME IN ONE
// SCOPE MEANS ONE OF THEM IS DEAD CODE NOBODY CAN SEE.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// src/legacy.js is ~21k lines of classic script. Function DECLARATIONS hoist, so
// if the same name is declared twice in the SAME scope the later one wins for
// every call site in the file, including the ones written above it. The earlier
// body is unreachable — it can be edited, tested and reviewed and change nothing.
// That is the worst kind of defect: a fix that lands in the dead twin.
//
// A 2026-09-06 audit counted eight duplicated column-0 names (boot ×3,
// refreshAll, paintAll, buildOverlay, itemImg, migrate, fmtQty, applyAll ×2 each)
// and assumed all sixteen bodies shared one scope. THEY DO NOT. The file is a
// sequence of top-level IIFEs; each duplicate pair straddles at least one
// column-0 `})();`, so the two bodies are closure-locals of DIFFERENT modules and
// neither shadows the other. Measured, not assumed — see A3. Nothing was deleted,
// because deleting either half of any pair would have removed live code.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
//   A1  no two column-0 `function name(` declarations sit in the SAME top-level
//       segment (segments are delimited by column-0 IIFE terminators `})();`).
//       Same segment = same scope = the earlier body is dead. HARD FAIL, no
//       allowlist: this is the bug, and it is never acceptable.
//   A2  every CROSS-segment duplicate name is PINNED in KNOWN_SPLIT_NAMES with a
//       note. A new one fails (name a legacy-module function distinctly, or say
//       here why the collision is fine); a pin whose duplicate is gone also fails,
//       so the census cannot rot.
//   A3  THE EXECUTED PROOF. The file is instantiated in a `vm` context (it throws
//       on `window` immediately — irrelevant, function declarations are hoisted
//       before the first statement runs), and the global object is read. For each
//       duplicated name, EITHER no definition reached script scope (all are inside
//       IIFEs), OR the one that did is NOT the last-declared — both of which prove
//       the later declaration cannot be shadowing the earlier at script scope. If
//       the global resolves to the LAST declaration the guard fails: that is the
//       ambiguous case, and it is exactly the dead-twin shape.
//   A4  THE CONTROL (--selftest). Synthetic sources that DO collide must be
//       reported, and honest ones must not.
//
// Usage:  node tests/no-duplicate-toplevel-fns.mjs [--list] [--selftest]
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const FILE = fileURLToPath(new URL('../src/legacy.js', import.meta.url));

/** Column-0 declarations only: an indented `function` is inside something, and
 *  this guard is about the file's own top-level segments. */
const DECL_RE = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;
/** A column-0 `})();` ends a top-level IIFE. Nested IIFEs in this file are
 *  indented, so column-0 is a reliable segment boundary. */
const SEG_RE = /^\}\)\(\);?\s*$/;

/**
 * CROSS-SEGMENT duplicates that exist today and are NOT bugs: two legacy modules
 * that each grew a helper with the same obvious name. Each is a closure-local of
 * its own IIFE. They are pinned rather than renamed because renaming ~16 call
 * sites inside a 21k-line monolith is churn with a real regression risk and zero
 * behavioural gain; the guard's job is to stop the NEXT one from arriving
 * unnoticed and to fail loudly if any of them ever lands in one scope (A1).
 */
export const KNOWN_SPLIT_NAMES = {
  applyAll: 'two per-module "repaint everything I own" helpers, different IIFEs',
  boot: 'the script-level boot (script scope) plus two per-module boots inside their own IIFEs',
  buildOverlay: 'two overlay builders in different UI modules',
  fmtQty: 'two quantity formatters in different UI modules',
  itemImg: 'two item-thumbnail helpers in different UI modules',
  migrate: 'two per-module save/shape migrators, different IIFEs',
  paintAll: 'two per-module full-repaint helpers, different IIFEs',
  /* refreshAll: UNPINNED 2026-09-07 by cleanup slice 8b. The second body was
     block 38's icon-repaint helper; it left with the icon layer for
     src/render/icons.js, so only the script-scope refreshAll remains and the
     name is no longer duplicated. The pin is removed rather than kept "just in
     case" — with it gone this guard now FAILS if a second refreshAll is ever
     declared in legacy.js again, which is stricter than the pin was. */
};

/** Pure core: parse declarations + segment indices out of a source string. */
export function declarations(src) {
  const lines = src.split('\n');
  const out = [];
  let seg = 0;
  for (let i = 0; i < lines.length; i++) {
    if (SEG_RE.test(lines[i])) { seg++; continue; }
    const m = DECL_RE.exec(lines[i]);
    if (m) out.push({ name: m[1], line: i + 1, seg });
  }
  return out;
}

/** A1 + A2, pure. */
export function audit(src, pins = KNOWN_SPLIT_NAMES) {
  const decls = declarations(src);
  const byName = new Map();
  for (const d of decls) {
    if (!byName.has(d.name)) byName.set(d.name, []);
    byName.get(d.name).push(d);
  }
  const findings = [];
  const dupNames = [];
  for (const [name, ds] of byName) {
    if (ds.length < 2) continue;
    dupNames.push(name);
    const segs = new Map();
    for (const d of ds) {
      if (!segs.has(d.seg)) segs.set(d.seg, []);
      segs.get(d.seg).push(d.line);
    }
    for (const [seg, ls] of segs) {
      if (ls.length > 1) {
        findings.push(`A1 ${name}() is declared ${ls.length}× in the SAME top-level segment `
          + `#${seg} (lines ${ls.join(', ')}). Declarations hoist, so the LAST one wins for the `
          + `whole segment and the earlier body is unreachable. Delete the dead one.`);
      }
    }
    if (segs.size > 1 && !Object.prototype.hasOwnProperty.call(pins, name)) {
      findings.push(`A2 ${name}() is declared in ${segs.size} different top-level segments `
        + `(lines ${ds.map((d) => d.line).join(', ')}) and is not pinned in KNOWN_SPLIT_NAMES. `
        + `Give the new one a distinct name, or pin it with a note saying why the collision is safe.`);
    }
  }
  for (const name of Object.keys(pins)) {
    if (!dupNames.includes(name)) {
      findings.push(`A2 KNOWN_SPLIT_NAMES pins "${name}" but it is no longer duplicated. `
        + `Remove the pin — a census that describes a codebase nobody is running is worse than none.`);
    }
  }
  return { findings, decls, dupNames };
}

/** A3: which duplicated names actually reached SCRIPT scope, and from which body. */
export function scriptScopeProof(src, dupNames) {
  const findings = [];
  const ctx = vm.createContext({});
  try { new vm.Script(src, { filename: 'legacy.js' }).runInContext(ctx, { timeout: 15000 }); }
  catch (e) { /* expected: the file needs a DOM. Hoisting already happened. */ }
  const rows = [];
  for (const name of dupNames) {
    const fn = ctx[name];
    if (typeof fn !== 'function') { rows.push({ name, at: null }); continue; }
    const body = String(fn);
    const idx = src.indexOf(body);
    const at = idx < 0 ? null : src.slice(0, idx).split('\n').length;
    rows.push({ name, at });
    const lines = declarations(src).filter((d) => d.name === name).map((d) => d.line);
    const last = Math.max(...lines);
    if (at === last) {
      findings.push(`A3 ${name}() IS on the script global and resolves to the LAST declaration `
        + `(line ${at} of ${lines.join(', ')}). That is the dead-twin shape: an earlier top-level `
        + `declaration would be unreachable. Prove which bodies are module-local, or delete the dead one.`);
    }
  }
  return { findings, rows };
}

function selftest() {
  const cases = [
    ['same-segment duplicate (the real bug)',
      'function f(){ return 1; }\nfunction f(){ return 2; }\n', 'A1 f()'],
    ['unpinned cross-segment duplicate',
      '(function(){\nfunction g(){}\n})();\n(function(){\nfunction g(){}\n})();\n', 'A2 g()'],
  ];
  let bad = 0;
  for (const [what, src, expect] of cases) {
    const { findings } = audit(src, {});
    const ok = findings.length === 1 && findings[0].startsWith(expect);
    console.log(`  ${ok ? '✓' : '✗'} bites: ${what}`);
    if (!ok) { bad++; console.log(`      got: ${findings.join(' | ') || '(nothing)'}`); }
  }
  const stale = audit('function h(){}\n', { zzz: 'gone' });
  const okStale = stale.findings.length === 1 && stale.findings[0].includes('no longer duplicated');
  console.log(`  ${okStale ? '✓' : '✗'} bites: a stale pin`);
  if (!okStale) bad++;
  const honest = audit('(function(){\nfunction g(){}\n})();\n(function(){\nfunction g(){}\n})();\n',
    { g: 'pinned' });
  const okHonest = honest.findings.length === 0;
  console.log(`  ${okHonest ? '✓' : '✗'} passes: a pinned cross-segment duplicate`);
  if (!okHonest) { bad++; console.log(`      ${honest.findings.join(' | ')}`); }
  // A3's control: a genuine same-scope pair must be caught by the executed proof.
  const p = scriptScopeProof('function f(){ return 1; }\nfunction f(){ return 2; }\n', ['f']);
  const okP = p.findings.length === 1 && p.findings[0].startsWith('A3 f()');
  console.log(`  ${okP ? '✓' : '✗'} bites (executed): the global resolves to the LAST declaration`);
  if (!okP) { bad++; console.log(`      ${p.findings.join(' | ') || '(nothing)'}`); }
  if (bad) { console.error(`no-duplicate-toplevel-fns --selftest: ${bad} control(s) failed.`); process.exit(1); }
  console.log('no-duplicate-toplevel-fns --selftest: all controls green.');
  process.exit(0);
}

const argv = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  if (argv.includes('--selftest')) selftest();
  const src = readFileSync(FILE, 'utf8');
  const { findings, decls, dupNames } = audit(src);
  if (!decls.length) {
    console.error('no-duplicate-toplevel-fns: found NO column-0 declarations in src/legacy.js — the scanner is broken.');
    process.exit(1);
  }
  const proof = scriptScopeProof(src, dupNames);
  const all = findings.concat(proof.findings);
  if (argv.includes('--list')) {
    for (const name of dupNames.sort()) {
      const ds = decls.filter((d) => d.name === name);
      const at = (proof.rows.find((r) => r.name === name) || {}).at;
      console.log(`  ${name.padEnd(16)} lines ${ds.map((d) => `${d.line}(seg${d.seg})`).join(', ')}`
        + `  script-scope: ${at ? `line ${at}` : 'none (all module-local)'}`);
    }
  }
  if (all.length) {
    console.error(`Duplicate top-level functions — ${all.length} finding(s):`);
    for (const f of all) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`Duplicate top-level fns — ${decls.length} column-0 declaration(s) in src/legacy.js across `
    + `${Math.max(...decls.map((d) => d.seg)) + 1} top-level segment(s); no same-scope shadow, `
    + `${dupNames.length} pinned cross-segment name(s).`);
  process.exit(0);
}
