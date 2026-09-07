#!/usr/bin/env node
// tests/dead-css.mjs — DERIVED dead-CSS-class census (cleanup slice 3).
//
// WHY THIS EXISTS
// ---------------
// The 2026-09-06 UI audit counted 101 class selectors across the nine
// stylesheets whose class name appears in no shipped JavaScript and no HTML.
// Nine sheets fighting on specificity is already the hardest thing in this
// codebase to reason about (CLAUDE.md §7); rules for elements that are never
// rendered make it worse than it needs to be, because a reader cannot tell
// "this is the rule that wins" from "this is a rule for a screen that was
// deleted in June". Deleting them once is worthless — a copy-pasted block
// brings them back — so the census is DERIVED on every run and the guard fails
// when an unreferenced class rule appears.
//
// DEFINITION OF DEAD (deliberately conservative — a false positive is an
// invisible visual regression, which is the most expensive kind here):
//   a class name C used in a selector is DEAD when
//     (a) C appears in NO src/**/*.js, src/**/*.html or index.html as a token,
//         AND
//     (b) C is not produced by string concatenation. A class built as
//         'scv-tier-' + n never appears whole in any source file, so ANY
//         hyphen-or-underscore-delimited prefix of C that appears in JS/HTML
//         adjacent to a quote or a template hole counts as reach, AND
//     (c) C is not a substring of any identifier/attribute in JS or HTML
//         (a looser net than (a) on purpose), AND
//     (d) C is not on the structural allowlist below (browser/library classes,
//         and classes only ever set by CSS-side state such as :has()).
//   A RULE is deletable only when EVERY selector in it is dead — a rule with
//   one live selector in a comma list keeps the whole rule.
//
// USAGE
//   node tests/dead-css.mjs            # guard: fail if a dead class rule exists
//   node tests/dead-css.mjs --report   # print the census
//   node tests/dead-css.mjs --selftest # mutation proof: plant a dead rule -> red

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Every stylesheet index.html actually loads, plus the ones under src/styles.
function sheets() {
  const dir = path.join(ROOT, 'src', 'styles');
  const out = [];
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.css')) out.push('src/styles/' + f);
  return out;
}

// The corpus that can NAME a class: shipped JS, shipped HTML. Test files are
// deliberately included — a class asserted by the suite is reached.
function consumerFiles() {
  const out = [];
  const walk = (abs, rel) => {
    let ents;
    try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      if (e.name === 'node_modules') continue;
      const a = path.join(abs, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(a, r);
      else if (/\.(js|mjs|html)$/.test(e.name)) out.push(r);
    }
  };
  walk(path.join(ROOT, 'src'), 'src');
  walk(path.join(ROOT, 'tests'), 'tests');
  if (fs.existsSync(path.join(ROOT, 'index.html'))) out.push('index.html');
  return out;
}

// (d) Structural allowlist. Each entry is a class this repo does not author and
// cannot be expected to name in JS.
const STRUCTURAL = [
  /^(?:hover|focus|active|visited|disabled|checked|before|after|root|host)$/,
];

function isStructural(c) { return STRUCTURAL.some(re => re.test(c)); }

// Strip comments and at-rule preludes, then walk rule blocks. Enough of a CSS
// parser for a selector census; it never needs to understand declarations.
function rules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  // Rules at EVERY depth, not just the top level: roughly a third of this
  // codebase's selectors live inside a @media block, and a walker that only
  // saw depth 0 would report a tenth of the truth.
  const out = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '{') {
      stack.push({ prelude: clean.slice(start, i), preludeStart: start });
      start = i + 1;
    } else if (ch === '}') {
      const r = stack.pop();
      if (r) { r.end = i + 1; out.push(r); }
      start = i + 1;
    }
  }
  // At-rule preludes (@media, @supports, @keyframes) are containers, not rules.
  return out.filter(r => r.end != null && !/^\s*@/.test(r.prelude) && r.prelude.includes('.'));
}

function classesIn(prelude) {
  const out = new Set();
  for (const m of prelude.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) out.add(m[1]);
  return out;
}

function census() {
  const consumers = consumerFiles().map(rel => {
    let t = '';
    try { t = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch {}
    return t;
  });
  const blob = consumers.join('\n');

  // (b) concatenation prefixes: every quoted string in JS/HTML, so a class
  // 'scv-tier-3' is reached by the literal 'scv-tier-'.
  const literals = new Set();
  for (const m of blob.matchAll(/['"`]([A-Za-z_][\w -]*)['"`]/g)) literals.add(m[1]);
  for (const m of blob.matchAll(/['"`]([A-Za-z_][\w-]*)(?=\$\{|['"`]\s*\+)/g)) literals.add(m[1]);

  const reached = (c) => {
    if (isStructural(c)) return 'structural';
    const tok = new RegExp('\\b' + c.replace(/[-]/g, '\\-') + '\\b');
    if (tok.test(blob)) return 'named';
    if (blob.includes(c)) return 'substring';           // (c)
    // (b) any delimiter-prefix of the class appearing as a string literal
    const parts = c.split(/(?=[-_])/);
    for (let i = parts.length - 1; i >= 1; i--) {
      const pre = parts.slice(0, i).join('');
      if (literals.has(pre) || literals.has(pre + '-') || blob.includes("'" + pre + "-") ||
          blob.includes('"' + pre + '-') || blob.includes('`' + pre + '-')) return 'concat:' + pre;
    }
    return null;
  };

  const sheetRows = [];
  for (const rel of sheets()) {
    const css = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const r of rules(css)) {
      // Per COMMA BRANCH, not per rule. `#hr-toasts, .toast-col, #notifs` has
      // one dead class and two live ids; deleting the rule on the strength of
      // the dead branch would silently unstyle the toast column. A branch is
      // dead only when it names a class that nothing can set, and the RULE is
      // deletable only when every branch is dead — a branch with no class at
      // all (a bare id or element selector) is never dead.
      const branches = r.prelude.split(',').map(s => s.trim()).filter(Boolean);
      if (!branches.length) continue;
      const cls = [...classesIn(r.prelude)];
      if (!cls.length) continue;
      const allDead = branches.every(b => {
        const bc = [...classesIn(b)];
        return bc.length > 0 && bc.some(c => reached(c) === null);
      });
      if (!allDead) continue;
      sheetRows.push({
        file: rel,
        line: css.slice(0, r.preludeStart).split('\n').length,
        selector: r.prelude.trim().replace(/\s+/g, ' ').slice(0, 120),
        classes: cls,
      });
    }
  }
  return sheetRows;
}

function main() {
  const rows = census();
  if (process.argv.includes('--report')) {
    console.log('dead class rules: ' + rows.length);
    for (const r of rows) console.log('  ' + r.file + ':' + r.line + '  ' + r.selector);
    return 0;
  }
  if (rows.length) {
    console.error('FAIL dead-css: ' + rows.length + ' rule(s) whose every class is named nowhere in shipped JS/HTML.');
    for (const r of rows) console.error('  ' + r.file + ':' + r.line + '  ' + r.selector);
    console.error('Delete the rule, or give the class a consumer.');
    return 1;
  }
  console.log('PASS dead-css: every class rule across ' + sheets().length + ' stylesheets is named by shipped JS or HTML.');
  return 0;
}

function selftest() {
  const target = path.join(ROOT, 'src', 'styles', 'audit-overrides.css');
  const before = fs.readFileSync(target, 'utf8');
  if (census().length !== 0) { console.error('SELFTEST INCONCLUSIVE: baseline already red.'); return 1; }
  // Assembled, not spelled: this file is not in the consumer corpus, but the
  // sibling dead-exports self-test proved how easy it is to make a probe
  // reachable by writing its own name down.
  const cls = 'hrDeadCssProbe' + 'Xyzzy' + '9';
  fs.writeFileSync(target, before + '\n.' + cls + ' { color: red; }\n');
  let red = 0;
  try { red = census().length; } finally { fs.writeFileSync(target, before); }
  if (red === 0) { console.error('SELFTEST FAIL: planted dead rule did not turn the guard red.'); return 1; }
  if (census().length !== 0) { console.error('SELFTEST FAIL: guard stayed red after removing the probe.'); return 1; }
  console.log('SELFTEST PASS dead-css: planted rule -> RED (' + red + '), removed -> GREEN.');
  return 0;
}

process.exit(process.argv.includes('--selftest') ? selftest() : main());
