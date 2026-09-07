#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/token-single-source.mjs — ONE PLACE WHERE A TOKEN IS BORN (slice 5)
//
//   node tests/token-single-source.mjs             gate
//   node tests/token-single-source.mjs --report    gate + the full tables
//   node tests/token-single-source.mjs --write     re-record the undefined-token ratchet
//   node tests/token-single-source.mjs --selftest  mutation proof
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// Until cleanup slice 5 the design tokens were declared in FOUR stylesheets at
// four different points in the load order: legacy.css opened with a :root
// ladder, theme-cozy.css re-declared most of it twice (once for the retired
// cream theme, once for Hearthlight), art-direction.css re-declared the surface
// and type scale over the top, and board-and-shop.css added a scene palette on
// the same root selector. 367 declarations, of which 41 were dead on arrival —
// same property, same selector, redefined later with a DIFFERENT value. Nobody
// could answer "what is --ink?" without replaying nine <link> tags by hand, and
// "I changed the token and nothing moved" was a normal afternoon.
//
// src/styles/tokens.css is now the single source. This guard is what keeps it
// single: the next person who adds `:root{--new-thing:…}` to the bottom of
// legacy.css because that is where they were working gets a red build with the
// file and line, not a silent fifth ladder.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
//  A · SINGLE SOURCE. No custom property is declared on a root-ish selector
//      (:root, html[…], body[…]) anywhere in src/styles/*.css except tokens.css.
//      A theme is a block in tokens.css, not a sheet of its own.
//
//  B · COMPONENT SCOPE IS AN ALLOWLIST. A custom property declared on an
//      ordinary selector is a genuinely local variable — `.td-doll{--td-cell}`
//      sizes one grid, `.fs-scrim{--tier-tint}` tints one overlay by foe tier.
//      Those are correct and they must NOT move to tokens.css: they vary per
//      element, which is the one thing the ladder cannot express. The list is
//      short and it is written down here, so a fifth one is a decision somebody
//      makes on purpose rather than a habit.
//
//  C · NO TOKEN IS READ THAT NOTHING DEFINES. A BARE `var(--x)` — no fallback
//      after the comma — whose name is declared nowhere makes the whole
//      declaration invalid at computed-value time, so the property silently
//      reverts to its initial value: a card with no background, a border with
//      no colour. That is check C, and it is a ratchet
//      (tests/token-single-source.baseline.json): a NEW one is red, the list
//      may only shrink.
//
//      `var(--x, something)` is NOT a failure. A token with a fallback is an
//      optional hook — homestead-rooms.css reads `var(--surface-2, transparent)`
//      on purpose. Those are recorded in the baseline as `optional_hooks` for
//      visibility and never gate.
//
// Definitions come from three places, all of them counted:
//   · tokens.css and the component-scoped allowlist (CSS),
//   · element.style.setProperty('--x', …) from JS,
//   · custom properties written into JS-authored CSS text or inline style
//     attributes (`style="--gsz:18px"`, injected <style> strings). Those are
//     real declarations that simply do not live in a .css file.
// Two more are runtime dials on <html> — --vh and --reduce-fx — in RUNTIME_ROOT.
//
// Exit: 0 green (or green-with-notes) · 1 an assertion failed · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, readdirSync, mkdtempSync, cpSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const BASELINE = join(ROOT, 'tests', 'token-single-source.baseline.json');
const SOURCE_SHEET = 'tokens.css';

/* B — the whole allowlist. Each entry says WHY it is local; an entry without a
   reason is an entry nobody defended. */
const COMPONENT_SCOPED = {
  '--td-cell': 'paper-doll cell size; .td-doll re-declares it per breakpoint',
  '--cs-bleed': 'clan-seat scene bleed; local to .hr-cs',
  '--cs-inset': 'clan-seat scene inset; local to .hr-cs',
  '--tier-tint': 'combat scrim tint, one value per [data-foe-tier]; varies per element',
};

/* Root-level dials WRITTEN BY JS, never declared in CSS. */
const RUNTIME_ROOT = {
  '--vh': 'src/mobile.js — real viewport unit for mobile URL-bar chrome',
  '--reduce-fx': 'src/legacy.js + src/settings-page.js — the reduce-visual-effects switch',
};

const stripComments = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ');

/* A read is BARE when the closing paren follows the name directly: var(--x).
   var(--x, y) carries its own answer and can never make a declaration invalid. */
function scanUses(text, where, bare, hooks) {
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
    const t = m[2] === ')' ? bare : hooks;
    if (!t.has(m[1])) t.set(m[1], new Set());
    t.get(m[1]).add(where);
  }
}
const ROOTISH = /^(?::root|html|body)(?:\s*\[[^\]]*\])*$/;
export const isRootish = (sel) => {
  const s = String(sel || '').trim();
  if (!s || s.startsWith('@')) return false;
  return s.split(',').every((p) => ROOTISH.test(p.trim()));
};

/* A hand walker, not a CSS library: a dependency inside a build gate is a
   liability, and the shape here is only "selector { declarations }". Returns
   every declaration with its selector and 1-based line. */
export function declarations(text) {
  const out = [];
  const src = text;
  const stack = [];
  let i = 0, chunk = 0;
  const lineAt = (p) => src.slice(0, p).split('\n').length;
  const flush = (from, to, sel) => {
    for (const part of stripComments(src.slice(from, to)).split(';')) {
      const at = part.indexOf(':');
      if (at < 0) continue;
      const prop = part.slice(0, at).trim();
      if (!/^(--[\w-]+|[-\w]+)$/.test(prop)) continue;
      out.push({ prop, value: part.slice(at + 1).trim(), sel, line: lineAt(from) });
    }
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; } continue; }
    if (c === '{') { stack.push({ sel: stripComments(src.slice(chunk, i)).replace(/\s+/g, ' ').trim(), start: i + 1 }); i++; chunk = i; continue; }
    if (c === '}') {
      const b = stack.pop();
      if (b) flush(chunk, i, b.sel);
      i++; chunk = i;
      if (stack.length) stack[stack.length - 1].start = i;
      continue;
    }
    i++;
  }
  return out;
}

const sheets = (root) => {
  const dir = join(root, 'src', 'styles');
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.css')).sort() : [];
};
const walkJs = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkJs(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
};

export function measure(root) {
  const rootishOutside = [];      // A
  const badComponent = [];        // B
  const defined = new Set(Object.keys(RUNTIME_ROOT));
  const uses = new Map();         // BARE var(--x) -> Set(where)
  const hooks = new Map();        // var(--x, fallback) -> Set(where)
  const componentUses = [];

  for (const f of sheets(root)) {
    const text = readFileSync(join(root, 'src', 'styles', f), 'utf8');
    for (const d of declarations(text)) {
      if (!d.prop.startsWith('--')) continue;
      const rootish = isRootish(d.sel);
      if (rootish) {
        if (f !== SOURCE_SHEET) rootishOutside.push(`${f}:${d.line}  ${d.sel} { ${d.prop} }`);
        defined.add(d.prop);
      } else {
        componentUses.push({ file: f, line: d.line, sel: d.sel, prop: d.prop });
        if (!COMPONENT_SCOPED[d.prop]) badComponent.push(`${f}:${d.line}  ${d.sel} { ${d.prop} } — not in the component-scoped allowlist`);
        else defined.add(d.prop);
      }
    }
    scanUses(stripComments(text), f, uses, hooks);
  }

  // JS: var() reads and setProperty writes both count.
  for (const p of walkJs(join(root, 'src'))) {
    const rel = 'src/' + relative(join(root, 'src'), p).split(sep).join('/');
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) defined.add(m[1]);
    // `style="--gsz:18px"` and injected stylesheet text are declarations too.
    for (const m of text.matchAll(/(--[\w-]+)\s*:\s*[^;'"`)\s]/g)) defined.add(m[1]);
    scanUses(text, rel, uses, hooks);
  }

  const undefinedUses = [...uses.keys()].filter((t) => !defined.has(t)).sort()
    .map((t) => ({ token: t, used_by: [...uses.get(t)].sort() }));
  const optionalHooks = [...hooks.keys()].filter((t) => !defined.has(t) && !uses.has(t)).sort()
    .map((t) => ({ token: t, used_by: [...hooks.get(t)].sort() }));
  return { rootishOutside, badComponent, defined: [...defined].sort(), uses, hooks, undefinedUses, optionalHooks, componentUses };
}

const NOTE = 'BARE var(--x) reads — no fallback — whose token is declared nowhere in CSS, in JS '
  + 'setProperty, or in JS-authored style text. Each one makes its whole declaration invalid at '
  + 'computed-value time, so the property silently reverts to its initial value. This is a ratchet: '
  + 'the list may only shrink. A new one is red; fixing one prints a note and is re-recorded with '
  + '--write. These are real bugs, not exemptions.';

export function run(argv = [], root = ROOT) {
  const m = measure(root);

  if (argv.includes('--write')) {
    writeFileSync(BASELINE, JSON.stringify({
      note: NOTE,
      measured: new Date().toISOString().slice(0, 10),
      single_source: 'src/styles/' + SOURCE_SHEET,
      component_scoped_allowlist: COMPONENT_SCOPED,
      runtime_root: RUNTIME_ROOT,
      known_undefined: m.undefinedUses,
      optional_hooks_note: 'var(--x, fallback) reads whose token is declared nowhere. Deliberate '
        + 'hooks, not failures; recorded only so the list cannot grow unnoticed.',
      optional_hooks: m.optionalHooks,
    }, null, 2) + '\n');
    console.log(`✓ ratchet written → tests/token-single-source.baseline.json (${m.undefinedUses.length} undefined tokens recorded)`);
    return 0;
  }
  if (!existsSync(BASELINE)) { console.error('TOKENS: no baseline. Run --write once.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const known = new Set((base.known_undefined || []).map((r) => r.token));

  const fails = [];
  const notes = [];
  for (const r of m.rootishOutside) fails.push('A · token declared on a root selector outside tokens.css: ' + r);
  for (const r of m.badComponent) fails.push('B · ' + r);
  for (const u of m.undefinedUses) {
    if (!known.has(u.token)) fails.push(`C · bare var(${u.token}) but nothing declares it — the whole declaration goes invalid: ${u.used_by.join(', ')}`);
  }
  const nowUndef = new Set(m.undefinedUses.map((u) => u.token));
  for (const t of known) if (!nowUndef.has(t)) notes.push(`${t} is now defined — run --write to tighten the ratchet`);

  if (argv.includes('--report')) {
    console.log(`  single source: src/styles/${SOURCE_SHEET}`);
    console.log(`  tokens declared: ${m.defined.length} · var() reads: ${m.uses.size} · component-scoped declarations: ${m.componentUses.length}`);
    for (const c of m.componentUses) console.log(`    ${c.file}:${c.line}  ${c.sel} { ${c.prop} }`);
    console.log(`  BARE var() with no declaration: ${m.undefinedUses.length} (ratchet ceiling ${known.size})`);
    for (const u of m.undefinedUses) console.log(`    ${u.token.padEnd(16)} ${u.used_by.join(', ')}`);
    console.log(`  optional hooks — var(--x, fallback), declared nowhere: ${m.optionalHooks.length}`);
    for (const u of m.optionalHooks) console.log(`    ${u.token.padEnd(16)} ${u.used_by.join(', ')}`);
  }

  if (fails.length) {
    console.error(`  ✗ token single source: ${fails.length} failure(s)`);
    for (const f of fails) console.error('      ' + f);
    console.error('\n  Design tokens live in src/styles/tokens.css and nowhere else. If the value');
    console.error('  varies per ELEMENT it is a component-scoped variable — add it to');
    console.error('  COMPONENT_SCOPED in this file with the reason. If it varies per THEME it is');
    console.error('  a token: declare it in the right block of tokens.css.');
    return 1;
  }
  console.log(`✓ token single source: ${m.defined.length} tokens, all declared in ${SOURCE_SHEET} `
    + `(+${Object.keys(COMPONENT_SCOPED).length} component-scoped, +${Object.keys(RUNTIME_ROOT).length} runtime); `
    + `${m.undefinedUses.length} bare undefined read(s), none new; ${m.optionalHooks.length} optional hooks`);
  if (notes.length) { console.log('  ratchet notes:'); for (const n of notes) console.log('      ' + n); }
  return 0;
}

/* ── MUTATION PROOF ──────────────────────────────────────────────────────
   Every assertion is planted in a scratch copy of the tree and must be caught.
   A guard that has never been red is not a guard (CLAUDE.md §4). */
function selftest() {
  const fails = [];
  const tmp = mkdtempSync(join(tmpdir(), 'hr-tok-'));
  try {
    // the WHOLE of src/: check C counts declarations made from JS, so a copy
    // with only the stylesheets would report every JS-declared token as missing
    // and the proof would be measuring the harness instead of the guard.
    cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true });
    const victim = join(tmp, 'src', 'styles', 'combat-hud.css');
    const orig = readFileSync(victim, 'utf8');
    const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const known = new Set((base.known_undefined || []).map((r) => r.token));
    const probe = () => {
      const m = measure(tmp);
      return {
        A: m.rootishOutside.length,
        B: m.badComponent.length,
        C: m.undefinedUses.filter((u) => !known.has(u.token)).map((u) => u.token),
      };
    };

    // 0. the clean tree is clean — otherwise every result below is meaningless
    let p = probe();
    if (p.A || p.B || p.C.length) fails.push(`SELFTEST: the unmutated tree is already failing (A=${p.A} B=${p.B} C=${p.C.join(',')}) — the proof would be vacuous`);

    // 1 · A — a fifth ladder in another sheet
    writeFileSync(victim, orig + '\n:root { --sneaky-token: #123456; }\n');
    if (!probe().A) fails.push('SELFTEST: a :root token planted outside tokens.css was NOT caught (A)');

    // 1b · A — the same thing wearing a theme selector
    writeFileSync(victim, orig + '\nbody[data-theme="hearthlight"] { --sneaky-token: #123456; }\n');
    if (!probe().A) fails.push('SELFTEST: a body[data-theme] token planted outside tokens.css was NOT caught (A)');

    // 2 · B — a component variable nobody defended
    writeFileSync(victim, orig + '\n.some-card { --undeclared-local: 4px; }\n');
    if (!probe().B) fails.push('SELFTEST: a non-allowlisted component variable was NOT caught (B)');

    // 2b · B — an allowlisted one is fine
    writeFileSync(victim, orig + '\n.td-doll-variant { --td-cell: 52px; }\n');
    if (probe().B) fails.push('SELFTEST: an ALLOWLISTED component variable was reported — the allowlist does not work (B)');

    // 3 · C — a BARE var() nothing declares
    writeFileSync(victim, orig + '\n.some-card { color: var(--totally-undeclared); }\n');
    if (!probe().C.includes('--totally-undeclared')) fails.push('SELFTEST: a bare var() with no declaration was NOT caught (C)');

    // 3a · C — the SAME name with a fallback is an optional hook, never a failure
    writeFileSync(victim, orig + '\n.some-card { color: var(--totally-undeclared, #fff); }\n');
    if (probe().C.length) fails.push('SELFTEST: var(--x, fallback) was reported as a failure — optional hooks must not gate (C)');

    // 3c · a token declared only in JS-authored style text counts as declared
    writeFileSync(victim, orig + '\n.some-card { font-size: var(--gsz); }\n');
    if (probe().C.length) fails.push('SELFTEST: a token declared only in JS-authored style text was reported as undeclared (C)');

    // 3b · C — an existing known-undefined token stays quiet (the ratchet holds, it does not re-fail)
    const anyKnown = [...known][0];
    if (anyKnown) {
      writeFileSync(victim, orig + `\n.some-card { color: var(${anyKnown}); }\n`);
      if (probe().C.length) fails.push('SELFTEST: a token already in the ratchet was reported as NEW (C)');
    }

    // 4 · a legitimate use of a real token is silent
    writeFileSync(victim, orig + '\n.some-card { color: var(--ink); border-color: var(--line); }\n');
    p = probe();
    if (p.A || p.B || p.C.length) fails.push('SELFTEST: an ordinary, correct use of two real tokens was reported');

    // 5 · a comment is not a declaration
    writeFileSync(victim, orig + '\n/* :root { --commented-out: 1px; } */\n');
    if (probe().A) fails.push('SELFTEST: a commented-out :root block counted as a declaration');

    writeFileSync(victim, orig);
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  if (fails.length) { for (const f of fails) console.error('  ✗ ' + f); return 1; }
  console.log('✓ token-single-source --selftest: 11 planted mutations judged correctly '
    + '(root ladder in another sheet, themed root ladder, undefended component var, allowlisted var, '
    + 'bare undefined var, that same var WITH a fallback, a JS-declared token, a ratcheted var, '
    + 'a correct use, a commented-out block, and a clean starting tree)');
  return 0;
}

if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  process.exit(argv.includes('--selftest') ? selftest() : run(argv));
}
