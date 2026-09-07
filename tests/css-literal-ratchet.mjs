#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/css-literal-ratchet.mjs — THE HARDCODED-COLOUR RATCHET (cleanup slice 1)
//
//   node tests/css-literal-ratchet.mjs             gate against the baseline
//   node tests/css-literal-ratchet.mjs --report    print the tables, gate too
//   node tests/css-literal-ratchet.mjs --write     re-record the baseline
//   node tests/css-literal-ratchet.mjs --selftest  mutation proof (adds/removes one)
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// CLAUDE.md §7 says "no hardcoded colours — every colour is a CSS token from
// theme-cozy.css", and the repo has said that for months while nine stylesheets
// accumulated thousands of raw colour literals and hundreds of `!important`s. A
// rule that nothing measures is a preference. This is the measurement: it does
// NOT demand the debt be paid today, it demands it never grows again. Per file,
// per metric, today's number is the ceiling. Convert one literal to a token and
// the ceiling drops (run --write). Add one and the build is red with the file
// named.
//
// `!important` is ratcheted beside the literals for the same reason: three
// stylesheets fight on specificity here (legacy / audit-overrides / theme-cozy),
// and every new `!important` makes the next honest fix harder. It is a debt
// counter, not a ban.
//
// ── WHAT COUNTS (the method, printed by --report so it is never folklore) ────
//  · Comments (/* … */) are stripped before anything is counted.
//  · Quoted strings inside a declaration value are stripped (so content:"white"
//    and font-family:"Black Ops" are not colours).
//  · Only DECLARATION VALUES are scanned — selectors, at-rule preludes and
//    property names never contribute.
//  · CUSTOM-PROPERTY DEFINITIONS in a theme block are EXEMPT: a `--token:#2b1d12`
//    inside `:root`, `html[data-theme…]` or `body[data-theme…]` IS the token
//    ladder, and counting it would punish the fix. A `--x:#fff` written on an
//    ordinary component selector is NOT exempt: that is a literal wearing a
//    variable's coat.
//  · A literal is: #rgb / #rgba / #rrggbb / #rrggbbaa, rgb( rgba( hsl( hsla(
//    hwb( lab( lch( oklab( oklch( color( , or one of the 148 CSS named colours
//    as a whole token. `transparent`, `currentColor` and `inherit` are NOT
//    literals — they carry no palette decision.
//  · `!important` is a raw occurrence count over the comment-stripped text.
//  · The JS table counts hex colours inside string literals in src/**/*.js —
//    the other door the same debt walks through (inline styles, canvas fills).
//
// Exit: 0 green (or green-with-note) · 1 a count rose · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, readdirSync, mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const BASELINE = join(ROOT, 'tests', 'css-literal-ratchet.baseline.json');

const NAMED = ('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown '
 + 'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod '
 + 'darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon '
 + 'darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray '
 + 'dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green '
 + 'greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon '
 + 'lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon '
 + 'lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta '
 + 'maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen '
 + 'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive '
 + 'olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru '
 + 'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell '
 + 'sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan thistle tomato turquoise '
 + 'violet wheat white whitesmoke yellow yellowgreen').split(' ');
NAMED.push('teal');   // listed separately: "no stray teal" is an art-direction rule here.
const NAMED_RE = new RegExp('(^|[^\\w-])(' + NAMED.join('|') + ')(?![\\w-])', 'gi');
const FUNC_RE = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/gi;
const HEX_RE = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-z])/gi;

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* A THEME BLOCK is where the token ladder is allowed to hold raw values. Only
   these shapes qualify; an empty selector (top level) never does. */
function isThemeBlock(sel) {
  const s = String(sel || '').trim();
  if (!s) return false;
  return s.split(',').every((part) => {
    const p = part.trim();
    if (!p) return false;
    return /^:root(\[[^\]]*\])?$/.test(p)
      || /^(html|body)\[data-theme[^\]]*\]$/.test(p)
      || /^\[data-theme[^\]]*\]$/.test(p)
      || /^:root\s*,?$/.test(p);
  });
}

/* Count colour literals in the VALUE half of every declaration, plus !important.
   A hand parser rather than a CSS library: the shape is declarations inside
   braces, and a dependency inside a build gate is a liability (see run-ci-local). */
export function countCss(text) {
  const src = stripComments(text);
  const important = (src.match(/!\s*important/gi) || []).length;
  let literals = 0;
  const stack = [];            // selector strings of the open blocks
  let buf = '';

  const countDecl = (decl) => {
    const at = decl.indexOf(':');
    if (at < 0) return;
    const prop = decl.slice(0, at).trim();
    if (!/^[-\w*]+$/.test(prop)) return;                       // not a declaration
    if (prop.startsWith('--') && stack.some(isThemeBlock)) return;   // the token ladder
    let val = decl.slice(at + 1);
    val = val.replace(/"[^"]*"|'[^']*'/g, ' ');                // no colours live in strings
    literals += (val.match(HEX_RE) || []).length
      + (val.match(FUNC_RE) || []).length
      + (val.match(NAMED_RE) || []).length;
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') { stack.push(buf.trim()); buf = ''; continue; }
    if (ch === '}') { stack.pop(); buf = ''; continue; }
    if (ch === ';') { countDecl(buf); buf = ''; continue; }
    buf += ch;
  }
  countDecl(buf);
  return { literals, important };
}

export function countJs(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  let n = 0;
  const strRe = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = strRe.exec(src))) n += (m[0].match(HEX_RE) || []).length;
  return { literals: n };
}

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

export function measure(root) {
  const css = {}; const js = {};
  const stylesDir = join(root, 'src', 'styles');
  if (existsSync(stylesDir)) {
    for (const f of readdirSync(stylesDir).filter((n) => n.endsWith('.css')).sort()) {
      const r = countCss(readFileSync(join(stylesDir, f), 'utf8'));
      css[f] = { literals: r.literals, important: r.important };
    }
  }
  const srcDir = join(root, 'src');
  if (existsSync(srcDir)) {
    for (const p of walk(srcDir)) {
      if (!p.endsWith('.js')) continue;
      const rel = 'src/' + relative(srcDir, p).split(sep).join('/');
      const r = countJs(readFileSync(p, 'utf8'));
      if (r.literals) js[rel] = { literals: r.literals };
    }
  }
  return { css, js };
}

function compare(now, base) {
  const fails = []; const downs = [];
  const cmp = (table, nowT, baseT, metrics) => {
    for (const f of Object.keys(nowT).sort()) {
      const b = baseT[f];
      for (const k of metrics) {
        const n = nowT[f][k];
        const o = b ? (b[k] || 0) : 0;
        if (n > o) fails.push(`${table} ${f}: ${k} ${o} → ${n} (+${n - o})`
          + (b ? '' : ' — file is not in the baseline; a NEW file starts at zero'));
        else if (n < o) downs.push(`${table} ${f}: ${k} ${o} → ${n}`);
      }
    }
    for (const f of Object.keys(baseT)) if (!nowT[f]) downs.push(`${table} ${f}: gone`);
  };
  cmp('css', now.css, base.css || {}, ['literals', 'important']);
  cmp('js ', now.js, base.js || {}, ['literals']);
  return { fails, downs };
}

const METHOD = 'comments stripped; declaration VALUES only; quoted strings dropped; custom properties '
  + 'in :root / html[data-theme…] / body[data-theme…] blocks exempt; literal = hex(3/4/6/8) | '
  + 'rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color( | one of 149 CSS named colours as a whole token '
  + '(transparent/currentColor/inherit excluded); !important = raw occurrences; '
  + 'js table = hex inside string literals in src/**/*.js';

function printReport(m) {
  console.log('  method: ' + METHOD);
  console.log('\n  stylesheet                    literals  !important');
  let a = 0; let b = 0;
  for (const [f, v] of Object.entries(m.css)) {
    a += v.literals; b += v.important;
    console.log('    ' + f.padEnd(28) + String(v.literals).padStart(8) + String(v.important).padStart(12));
  }
  console.log('    ' + 'TOTAL'.padEnd(28) + String(a).padStart(8) + String(b).padStart(12));
  const jsE = Object.entries(m.js).sort((x, y) => y[1].literals - x[1].literals);
  console.log(`\n  js hex-in-string: ${jsE.reduce((n, [, v]) => n + v.literals, 0)} in ${jsE.length} file(s)`);
  for (const [f, v] of jsE.slice(0, 8)) console.log('    ' + f.padEnd(40) + String(v.literals).padStart(6));
  if (jsE.length > 8) console.log(`    …and ${jsE.length - 8} more`);
}

export function run(argv = []) {
  const now = measure(ROOT);
  if (argv.includes('--write')) {
    writeFileSync(BASELINE, JSON.stringify({
      method: METHOD,
      measured: new Date().toISOString().slice(0, 10),
      note: 'Ceilings, not targets. Counts may only fall. Regenerate with '
        + '`node tests/css-literal-ratchet.mjs --write` when they do — never to make a red build green.',
      ...now,
    }, null, 2) + '\n');
    printReport(now);
    console.log('\n✓ baseline written → tests/css-literal-ratchet.baseline.json');
    return 0;
  }
  if (!existsSync(BASELINE)) { console.error('CSS-RATCHET: no baseline. Run --write once.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { fails, downs } = compare(now, base);
  if (argv.includes('--report')) printReport(now);
  if (fails.length) {
    console.error('  ✗ hardcoded-colour ratchet: ' + fails.length + ' count(s) ROSE');
    for (const f of fails) console.error('      ' + f);
    console.error('\n  CLAUDE.md §7: every colour is a token from theme-cozy.css. This guard does not');
    console.error('  ask you to pay the existing debt — only not to add to it. Use an existing');
    console.error('  --token, or add one to the theme block and reference it.');
    return 1;
  }
  const tot = Object.values(now.css).reduce((n, v) => n + v.literals, 0);
  const imp = Object.values(now.css).reduce((n, v) => n + v.important, 0);
  console.log(`✓ hardcoded-colour ratchet: ${tot} css literals / ${imp} !important across `
    + `${Object.keys(now.css).length} sheets, ${Object.values(now.js).reduce((n, v) => n + v.literals, 0)} js hex — none rose`);
  if (downs.length) {
    console.log(`  ratchet down: run --write (${downs.length} count(s) fell)`);
    for (const d of downs.slice(0, 10)) console.log('      ' + d);
  }
  return 0;
}

/* ── MUTATION PROOF ──────────────────────────────────────────────────────
   A ratchet that has never bitten is a decoration. This copies src/styles to a
   temp root, plants one defect at a time, and demands each is caught BY THIS
   GUARD; then removes one and demands the "ratchet down" note instead of a
   failure. It also proves the two exemptions do not leak. */
function selftest() {
  const fails = [];
  if (!existsSync(BASELINE)) { console.error('SELFTEST: no baseline; run --write first.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const tmp = mkdtempSync(join(tmpdir(), 'hr-ratchet-'));
  const cssOnly = (m) => ({ css: m.css, js: base.js || {} });
  try {
    cpSync(join(ROOT, 'src', 'styles'), join(tmp, 'src', 'styles'), { recursive: true });
    const victim = join(tmp, 'src', 'styles', 'combat-hud.css');
    const orig = readFileSync(victim, 'utf8');
    const caught = (metric) => compare(cssOnly(measure(tmp)), base)
      .fails.some((f) => f.includes('combat-hud.css') && f.includes(metric));

    const cases = [
      ['a raw hex on a component rule', '\n.hr-ratchet-selftest { color: #ff00ff; }\n', 'literals'],
      ['a named colour on a component rule', '\n.hr-ratchet-selftest { border-color: rebeccapurple; }\n', 'literals'],
      ['an rgba() on a component rule', '\n.hr-ratchet-selftest { background: rgba(1,2,3,.4); }\n', 'literals'],
      ['a stray teal', '\n.hr-ratchet-selftest { color: teal; }\n', 'literals'],
      ['a new !important', '\n.hr-ratchet-selftest { display: block !important; }\n', 'important'],
      ['a literal wearing a variable\'s coat on a NON-theme selector',
        '\n.hr-ratchet-selftest { --my-colour: #123456; }\n', 'literals'],
    ];
    for (const [label, snippet, metric] of cases) {
      writeFileSync(victim, orig + snippet);
      if (!caught(metric)) fails.push(`SELFTEST: ${label} was NOT caught`);
    }

    // the two exemptions must not leak
    writeFileSync(victim, orig + '\nbody[data-theme="hearthlight"] { --my-colour: #123456; }\n');
    if (caught('literals')) fails.push('SELFTEST: a token definition inside a theme block was counted as debt — the guard would punish the fix');
    writeFileSync(victim, orig + '\n/* .x { color: #abcdef; } */\n');
    if (caught('literals')) fails.push('SELFTEST: a colour inside a comment was counted');
    writeFileSync(victim, orig + '\n.hr-ratchet-selftest { content: "white"; font-family: "Black Ops"; }\n');
    if (caught('literals')) fails.push('SELFTEST: a colour word inside a quoted string was counted');
    writeFileSync(victim, orig + '\n.hr-ratchet-selftest { color: transparent; background: currentColor; }\n');
    if (caught('literals')) fails.push('SELFTEST: transparent/currentColor were counted as palette decisions');

    // PAYING the debt must be a note, not a failure. audit-overrides.css is the
    // victim here because combat-hud.css's own !importants all live in comments
    // (which is exactly why the comment-stripped count is 12 and grep says 19).
    writeFileSync(victim, orig);
    const payer = join(tmp, 'src', 'styles', 'audit-overrides.css');
    const payerOrig = readFileSync(payer, 'utf8');
    writeFileSync(payer, payerOrig.replace(/!\s*important/gi, '').replace(HEX_RE, 'var(--ink)'));
    const down = compare(cssOnly(measure(tmp)), base);
    writeFileSync(payer, payerOrig);
    if (down.fails.length) fails.push('SELFTEST: paying the debt produced a FAILURE, not a ratchet-down note: ' + down.fails[0]);
    if (!down.downs.some((d) => d.includes('audit-overrides.css') && d.includes('important'))) fails.push('SELFTEST: removing every !important produced no ratchet-down note');
    if (!down.downs.some((d) => d.includes('audit-overrides.css') && d.includes('literals'))) fails.push('SELFTEST: tokenising every hex produced no ratchet-down note');
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  // the JS half, on synthetic sources
  if (countJs('const c = "#ff8800";').literals !== 1) fails.push('SELFTEST: js hex-in-string not counted');
  if (countJs('const c = 0x112233;').literals !== 0) fails.push('SELFTEST: a js number literal was counted as a colour');
  if (countJs('// #ff8800\n').literals !== 0) fails.push('SELFTEST: a js line-comment hex was counted');

  if (fails.length) { for (const f of fails) console.error('  ✗ ' + f); return 1; }
  console.log('✓ css-literal-ratchet --selftest: 6 planted defects each caught by THIS guard; '
    + '4 exemptions proven not to leak; a decrease is a note, not a failure; 3 js cases');
  return 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/css-literal-ratchet.mjs')) {
  process.exit(process.argv.includes('--selftest') ? selftest() : run(process.argv.slice(2)));
}
