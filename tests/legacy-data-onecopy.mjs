#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/legacy-data-onecopy.mjs — src/legacy.js AUTHORS NO ITEM OR RECIPE
//
//   node tests/legacy-data-onecopy.mjs             # the guard
//   node tests/legacy-data-onecopy.mjs --selftest  # every planted copy must be CAUGHT
//
// ── WHY ─────────────────────────────────────────────────────────────────
// src/data/items.js and src/data/recipes.js are the only authored copies.
// main.js merges items.js INTO legacy.js's `ITEMS` binding (same identity, ESM
// winning per key) and publishes recipes.js over `window.ARTISAN_RECIPES`, so
// any item or recipe literal in legacy.js is never read — it only drifts. On
// 2026-10-08 four such copies were cut (the 153-entry ITEMS literal, the
// block-18 artisan items, the block-21 NEW_ITEMS + recipe arrays and the inline
// ARTISAN_RECIPES table); the item copies disagreed with src/data/* in 19
// values. This is the static twin of the in-page MON-ONECOPY-1 / ITEM-ONECOPY-1
// counts: those see what legacy.js declared at boot, this refuses the TEXT, so
// a copy cannot land in a branch that never boots it.
//
// ── THE RULES (comments stripped first; strings kept) ───────────────────
//   L1  `const ITEMS={…}` and `const MONSTERS={…}` are declared EMPTY.
//   L2  no item-entry literal: `<id>:{ n:'Name', … v:<number> … }`.
//   L3  no recipe-entry literal: an object with `output:'<id>'` AND an
//       `inputs:{…}` / `input:'<id>'` field.
//   L4  no write that could seed either table: `window.ARTISAN_RECIPES =`,
//       `ITEMS[…] =`, `ITEMS.<id> =`, `Object.assign(ITEMS, …)`.
//
// NO ?v= on the imports (tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'src/legacy.js';

/* Blank every comment, keeping newlines (so line numbers survive) and keeping
   string and template bodies intact (the literals this guard looks for live in
   code, and a quoted `//` must not start a comment). */
export function stripComments(src) {
  let out = '';
  let i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop; continue;
    }
    out += c; i++;
  }
  return out;
}

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

export function scan(src) {
  const code = stripComments(src);
  const problems = [];
  const hit = (rule, idx, what) => problems.push(`${rule} ${FILE}:${lineOf(code, idx)} — ${what}`);

  // L1 — the two shadowed bindings exist and are EMPTY.
  for (const name of ['ITEMS', 'MONSTERS']) {
    const m = new RegExp(`\\bconst\\s+${name}\\s*=\\s*\\{([^}]*)\\}`).exec(code);
    if (!m) hit('L1', 0, `\`const ${name}={}\` is missing — the binding must exist (bare ${name}[…] reads) and be empty`);
    else if (m[1].trim()) hit('L1', m.index, `\`const ${name}\` is declared with entries — src/data/ is the only copy`);
  }

  // L2 — item-entry literals.
  const ITEM = /\b[a-z][a-z0-9_]*\s*:\s*\{\s*n\s*:\s*(['"])(?:(?!\1)[^\\\n]|\\.)*\1[^{}\n]*?\bv\s*:\s*-?\d/g;
  for (let m; (m = ITEM.exec(code));) hit('L2', m.index, 'an item-entry literal (`id:{n:…, v:…}`): ' + m[0].slice(0, 60));

  // L3 — recipe-entry literals: an object holding both an output and an input field.
  const OBJ = /\{[^{}]*\boutput\s*:\s*['"][a-z0-9_]+['"][^{}]*\}|\{[^{}]*\binputs?\s*:\s*(?:\{[^{}]*\}|['"][a-z0-9_]+['"])[^{}]*\boutput\s*:\s*['"][a-z0-9_]+['"][^{}]*\}/g;
  for (let m; (m = OBJ.exec(code));) {
    if (/\binputs?\s*:/.test(m[0]) && /\boutput\s*:/.test(m[0])) hit('L3', m.index, 'a recipe-entry literal (`{…inputs/input…, output:…}`): ' + m[0].slice(0, 60).replace(/\s+/g, ' '));
  }

  // L4 — writes that could seed either table.
  const WRITES = [
    [/\bwindow\.ARTISAN_RECIPES\s*=(?!=)/g, '`window.ARTISAN_RECIPES =` — main.js publishes src/data/recipes.js; legacy.js does not author recipes'],
    [/(?<![\w.$])ITEMS\s*(?:\[[^\]\n]+\]|\.[A-Za-z_$][\w$]*)\s*=(?!=)/g, 'a write into ITEMS — src/data/items.js is the only copy'],
    [/\bObject\.assign\(\s*(?:window\.)?ITEMS\b/g, '`Object.assign(ITEMS, …)` — main.js is the only merge'],
  ];
  for (const [re, what] of WRITES) for (let m; (m = re.exec(code));) hit('L4', m.index, what);
  return problems;
}

const argv = process.argv.slice(2);
const real = readFileSync(join(ROOT, FILE), 'utf8');

if (argv.includes('--selftest')) {
  /* CLEAN ARM first: the real file must be green, or every "caught" below is a
     guard that is red at rest, not a guard that bites. */
  const clean = scan(real);
  const fails = [];
  if (clean.length) fails.push('CLEAN ARM is red on the real file:\n  ' + clean.join('\n  '));
  const anchorItems = 'const ITEMS={};';
  if (!real.includes(anchorItems)) fails.push('the mutation anchor `' + anchorItems + '` is gone — re-point the selftest');
  const MUTATIONS = [
    ['L1 entries back in ITEMS', real.replace(anchorItems, "const ITEMS={ bones:{n:'Bones',v:1} };")],
    ['L1 entries back in MONSTERS', real.replace('const MONSTERS={};', "const MONSTERS={ slime:{hp:5} };")],
    ['L1 ITEMS binding deleted', real.replace(anchorItems, 'var __gone = 0;')],
    ['L2 a NEW_ITEMS block', real + "\n(function(){ var NEW_ITEMS = {\n  bronze_bar: {n:'Bronze Bar', icon:'x', v:32},\n}; })();\n"],
    ['L2 a quoted-key-free item with a double-quoted name', real + '\nvar __x = { hunters_feast: {n:"Hunter\'s Feast", heals:35, v:420} };\n'],
    ['L3 a recipe array (inputs map)', real + "\n[{id:'smelt_bronze', name:'Bronze Bar', inputs:{copper_ore:2, coal:1}, output:'bronze_bar', xp:20}].forEach(function(){});\n"],
    ['L3 a recipe (legacy input/output dialect)', real + "\nvar __r = {id:'cook_shrimp', input:'shrimp', output:'cooked_shrimp', xp:30};\n"],
    ['L4 window.ARTISAN_RECIPES assigned', real + '\nwindow.ARTISAN_RECIPES = window.ARTISAN_RECIPES || {};\n'],
    ['L4 ITEMS[k] seeded', real + '\nObject.keys(x).forEach(function(k){ if(!ITEMS[k]) ITEMS[k] = x[k]; });\n'],
    ['L4 ITEMS.id patched', real + '\nITEMS.bones = {};\n'],
    ['L4 Object.assign(ITEMS…)', real + '\nObject.assign(ITEMS, extra);\n'],
  ];
  for (const [name, text] of MUTATIONS) {
    if (text === real) { fails.push(`${name}: the mutation did not apply — vacuous`); continue; }
    const got = scan(text);
    if (got.length <= clean.length) fails.push(`${name}: NOT caught`);
  }
  /* And what must NOT be refused: a literal inside a comment, and a read. */
  const SAFE = [
    ['a literal in a block comment', real + "\n/* var NEW_ITEMS = { bronze_bar: {n:'Bronze Bar', v:32} }; */\n"],
    ['a literal in a line comment', real + "\n// {id:'x', inputs:{a:1}, output:'y'}\n"],
    ['an equality read of ITEMS', real + "\nif (ITEMS[id] === undefined) {}\n"],
  ];
  for (const [name, text] of SAFE) {
    if (scan(text).length !== clean.length) fails.push(`${name}: wrongly refused (false positive)`);
  }
  if (fails.length) {
    console.error('✗ legacy-data-onecopy --selftest:\n  ' + fails.join('\n  '));
    process.exit(1);
  }
  console.log(`✓ legacy-data-onecopy --selftest: clean arm green, ${MUTATIONS.length}/${MUTATIONS.length} planted copies caught, ${SAFE.length} safe shapes left alone`);
  process.exit(0);
}

const problems = scan(real);
if (problems.length) {
  console.error(`✗ legacy-data-onecopy: ${problems.length} item/recipe copy finding(s) in ${FILE}. `
    + 'Author items in src/data/items.js and recipes in src/data/recipes.js — never here.\n  '
    + problems.join('\n  '));
  process.exit(1);
}
console.log(`✓ legacy-data-onecopy: ${FILE} declares ITEMS/MONSTERS empty and authors no item or recipe literal`);
