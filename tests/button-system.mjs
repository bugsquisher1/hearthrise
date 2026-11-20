#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/button-system.mjs — ONE BUTTON SYSTEM ACROSS EVERY WINDOW (UI audit 2026-11-18 #3)
//
//   node tests/button-system.mjs             the guard
//   node tests/button-system.mjs --list      every window press and the role it was given
//   node tests/button-system.mjs --selftest  every planted defect goes red, the clean tree stays green
//
// mutant-anchors: none — every --selftest mutant transforms an in-memory copy of the files (readTree), never a file
//
// ci-step: client-guards | Presentation floor - one button system
// ci-run: node tests/button-system.mjs
// ci-run: node tools/mutant-gate.mjs node tests/button-system.mjs --selftest
//
// THE FINDING. The audit counted four button looks across the windows (a gold plate, a steel frame, a sunk well,
// and words with no box at all) and bare presses in the Shop, Party and Friends: a Buy, a Message or an Accept read
// as a label. The rule it set, the Burning Tower's chest being the model:
//   GOLD PRIMARY      the window's main action: the raised gold plate (.hw-primary, .hh-tool.is-primary), one a
//                     window (window-head.js oneGold draws any second one steel; alpha-windows AW-94 proves it)
//   FRAMED SECONDARY  every other action: the title band's steel (a 2 px --steel-btn frame on --fill-1); in a
//                     window every .hh-tool that is not gold or a link is drawn so
//   TEXT LINK         navigation (opens another window, a page or a fold; goes back): gold words, no box
//                     (.hh-tool.is-link)
// A window's tabs, choices and rows are not buttons in this sense: a tab is underlined, a choice is a sunk well
// that lifts gold when picked, a row is pressed whole. Each keeps the one look it has.
//
// THE RULES
//   BS-1 ONE HOME     the three looks are painted in src/styles/shell.css only. No other sheet's rule whose
//                     subject is a press (.hh-tool, .hw-primary, .is-primary, .is-second, .is-link, or a bare
//                     `button`) sets its colour, fill, border, shadow, filter, face or underline. Layout (size,
//                     padding, margin, flex, alignment, font-size) stays the window's own.
//   BS-2 A ROLE EACH  every <button> a window or account screen writes (src/shell/windows/**, src/app/**) carries
//                     a role class (hh-tool, hw-primary) or a listed tab / choice / row / head class (CONTROLS,
//                     each with its reason). A new class with a look of its own is red until it is one of those.
//   BS-3 THE THREE    shell.css draws exactly the three looks: in a window an .hh-tool that is not gold or a link
//                     has the steel frame on the panel fill; a link has no frame and no fill and is gold; the
//                     plate is gold-plate.png; a demoted plate (.is-second) is the framed secondary.
//
// Exit 0 green, 1 red, 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const HOME = 'src/styles/shell.css';

/* The presses that are not buttons in the audit's sense, each the one look of its kind. A class here is a decision. */
export const CONTROLS = Object.freeze({
  // the title band (window-head.js): the window's key, close, Back and ? are the frame's own steel squares
  'hs-close': 'head', 'hs-back': 'head', 'hs-help': 'head',
  // tabs: underlined words under the band
  'hw-tab': 'tab', 'st-tab': 'tab', 'ha-tab': 'tab', 'ca-tab': 'tab', 'char-tab': 'tab',
  // choices: a sunk well, lifted gold when picked (hunt.css .hh-seg is the general one)
  'hh-seg': 'choice', 'hw-cat': 'choice', 'tc-stoke': 'choice', 'tc-pick': 'choice', 'tk-wing': 'choice', 'tk-door': 'choice',
  'tk-key': 'choice', 'hv-powder': 'choice', 'tw-place': 'choice', 'hw-of-swatch': 'choice', 'hw-of-card': 'choice',
  'hw-soil': 'choice', 'ca-rs': 'choice', 'ca-item': 'choice',
  // rows pressed whole: a list's line, a doll's slot, a landing, a page in a table of contents, a name
  'hw-go': 'row', 'hw-mi': 'row', 'hw-slot': 'row', 'tt-lbl': 'row', 'ca-row': 'row', 'hw-dl-head': 'row', 'mf-open': 'row',
  'hw-icon-name': 'row', 'hc-name': 'row', 'hc-link': 'row', 'ck-toc-go': 'row', 'hpb-ready': 'row', 'char-pick': 'row',
  'hs-name': 'row', 'hero-dye': 'choice',
  // the chat's own: its tab's x and the "New messages" pill over the log
  'hc-x': 'head', 'hc-pill': 'head',
  // the top bar and the icon row (the HUD over the World, not a window): its icons, its group menus' lines, the hero tabs' tools
  'hs-launch': 'bar', 'hs-launch-item': 'bar', 'char-tool': 'bar', 'char-unopened': 'bar', 'world-scene': 'bar', 'hs-wfold': 'bar',
  // the coach card's own presses (src/shell/launcher.js): one card, in a window's coach slot or over the World
  'hs-coach-close': 'coach', 'hs-coach-tab': 'coach', 'hs-coach-off': 'coach', 'hs-coach-got': 'coach', 'hs-coach-min': 'coach', 'hs-coach-more': 'coach',
});
/* The classes the system paints: the framed .hh-tool (gold with .is-primary, a link with .is-link), the plate .hw-primary, the
   link in a sentence (.hs-goto) and the account cards' link (.auth-link). */
const ROLES = ['hh-tool', 'hw-primary', 'hs-goto', 'auth-link'];

// ── reading ───────────────────────────────────────────────────────────────
export function readTree(root = ROOT) {
  const files = new Map();
  const walk = (d, keep) => {
    for (const f of readdirSync(join(root, d))) {
      const p = d + '/' + f;
      if (statSync(join(root, p)).isDirectory()) walk(p, keep);
      else if (keep(p)) files.set(p, readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n'));
    }
  };
  walk('src/styles', (p) => p.endsWith('.css'));
  /* the windows, the shell's own modules that write into them (the title band, the Tower's stage, goto's links), the account
     screens; not src/shell/widgets (the HUD panels, where .hh-tool is the quiet text command) */
  walk('src/shell', (p) => p.endsWith('.js') && !p.startsWith('src/shell/widgets/'));
  walk('src/app', (p) => p.endsWith('.js'));
  return files;
}

/* Every rule of a sheet: { sel, decls, line } with @media/@supports bodies walked into, comments gone. */
export function rulesOf(css) {
  const out = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const walk = (from, to) => {
    let i = from;
    while (i < to) {
      const open = text.indexOf('{', i);
      if (open < 0 || open >= to) return;
      const head = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < to && depth; j++) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; }
      const close = j - 1;
      if (head.startsWith('@')) { if (/^@(media|supports|layer|container)/.test(head)) walk(open + 1, close); }
      else out.push({ sel: head, decls: text.slice(open + 1, close), line: text.slice(0, open).split('\n').length });
      i = j;
    }
  };
  walk(0, text.length);
  return out;
}

/* A selector list split at its top-level commas (not the ones inside :is()/:not()/:has()). */
export function splitSelectors(sel) {
  const out = []; let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++; else if (ch === ')') depth--;
    if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/* The subject compound: what follows the last top-level combinator. Null for a pseudo-element (its own box). */
export function subjectOf(sel) {
  let depth = 0, last = 0;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
    else if (!depth && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) last = i + 1;
  }
  const s = sel.slice(last).trim();
  return /::|:(before|after)\b/.test(s) ? null : s;
}
/* The subject without what its pseudo-classes' arguments name (:not(.is-primary) does not make it a primary). */
const bare = (s) => { let d = 0, o = ''; for (const ch of s) { if (ch === '(') d++; if (!d) o += ch; if (ch === ')') d--; } return o; };
export const isPress = (subject, also = new Set()) => {
  const s = bare(subject);
  if (/\.(hh-tool|hw-primary|hs-goto|auth-link|is-primary|is-second|is-link)(?![\w-])/.test(s) || /^button(?![\w-])/.test(s)) return true;
  for (const m of s.matchAll(/\.([\w-]+)/g)) if (also.has(m[1])) return true;
  return false;
};
/* The classes a window writes BESIDE a role on its buttons (tt-go, hv-buy, auth-submit): a sheet painting one of those is
   painting the button. A state word (is-*, has-*) is not one: it marks rows and panes as often as presses. */
export function coClassesOf(files) {
  const out = new Set();
  for (const p of pressesOf(files)) {
    if (!p.roles.length) continue;
    for (const w of p.cls.split(/\s+/)) if (w && !ROLES.includes(w) && !/^(is|has)-/.test(w) && !(w in CONTROLS)) out.add(w);
  }
  return out;
}
const PAINT = /^(color|background(-color|-image)?|border(?!-radius|-collapse|-spacing)(-[a-z-]+)?|box-shadow|filter|font-family|font|text-decoration(-[a-z-]+)?|opacity|text-shadow)$/;
export const paintOf = (decls) => decls.split(';').map((d) => d.trim()).filter(Boolean)
  .map((d) => d.slice(0, d.indexOf(':')).trim().toLowerCase()).filter((p) => PAINT.test(p));

// ── the rules ─────────────────────────────────────────────────────────────
export function check(files) {
  const fails = [];
  /* BS-1 */
  const also = coClassesOf(files);
  for (const [file, css] of files) {
    if (!file.endsWith('.css') || file === HOME) continue;
    for (const r of rulesOf(css)) {
      const props = paintOf(r.decls);
      if (!props.length) continue;
      for (const sel of splitSelectors(r.sel)) {
        const sub = subjectOf(sel);
        if (sub && isPress(sub, also)) fails.push('BS-1 ' + file + ':' + r.line + ' paints a press (' + props.join(', ') + ') outside ' + HOME + ': ' + sel);
      }
    }
  }
  /* BS-2 */
  for (const p of pressesOf(files)) {
    if (p.roles.length || p.controls.length) continue;
    fails.push('BS-2 ' + p.file + ':' + p.line + ' a <button class="' + p.cls + '"> has no role (hh-tool, hw-primary) and no listed control class');
  }
  /* BS-3 */
  const home = rulesOf(files.get(HOME) || '');
  const decl = (want) => home.filter((r) => splitSelectors(r.sel).includes(want)).map((r) => r.decls).join(';');
  const FRAMED = ':is(.hs-win, .auth-card) .hh-tool:not(.is-primary, .is-link)';
  const framed = decl(FRAMED);
  /* the frame: --steel-frame (the steel button's 2 px inside three sides) and the bottom border in the same steel, on the fill */
  const FRAME = (d) => /box-shadow:\s*var\(--steel-frame\)/.test(d) && /border-bottom(-color)?:\s*(2px solid )?var\(--steel-btn\)/.test(d) && /background:\s*var\(--fill-1\)/.test(d);
  if (!FRAME(framed))
    fails.push('BS-3 ' + HOME + ' draws no framed secondary (' + FRAMED + ': --steel-frame and a --steel-btn foot on --fill-1): ' + JSON.stringify(framed.trim().slice(0, 160)));
  const token = rulesOf(files.get('src/styles/tokens.css') || '').map((r) => r.decls).join(';').match(/--steel-frame:\s*([^;]*)/);
  if (!token || (token[1].match(/inset [-0-9px ]+var\(--steel-btn\)/g) || []).length !== 3)
    fails.push('BS-3 src/styles/tokens.css --steel-frame is not the steel button\'s 2 px on three sides: ' + JSON.stringify(token && token[1]));
  const link = decl('.hh-tool.is-link');
  if (!/border:\s*0/.test(link) || !/background:\s*none/.test(link) || !/color:\s*var\(--gold-2\)/.test(link))
    fails.push('BS-3 ' + HOME + ' draws no text link (.hh-tool.is-link: no frame, no fill, --gold-2): ' + JSON.stringify(link.trim().slice(0, 160)));
  const plate = decl('.hh-tool.is-primary');
  if (!/gold-plate\.png/.test(plate)) fails.push('BS-3 ' + HOME + ' draws no gold plate (.hh-tool.is-primary)');
  const second = decl('.hs-win :is(.hw-primary, .hh-tool.is-primary).is-second');
  if (!FRAME(second) || !/border-image:\s*none/.test(second))
    fails.push('BS-3 a demoted plate (.is-second) is not the framed secondary: ' + JSON.stringify(second.trim().slice(0, 160)));
  return fails;
}

/* Every <button> written by a window or account-screen module, with its classes split into roles and controls. */
export function pressesOf(files) {
  const out = [];
  for (const [file, src] of files) {
    if (!file.endsWith('.js')) continue;
    const re = /<button\b([^>]*)>/g;
    let m;
    while ((m = re.exec(src))) {
      const raw = (m[1].match(/class="([^"]*)"/) || [, ''])[1];
      /* a class built in code ('is-' + kind) counts by its fixed words only */
      const cls = raw.replace(/'\s*\+[\s\S]*?\+\s*'/g, ' ').replace(/'\s*\+[\s\S]*$/, '').trim();
      const words = cls.split(/\s+/).filter(Boolean);
      out.push({ file, line: src.slice(0, m.index).split('\n').length, cls,
        roles: words.filter((w) => ROLES.includes(w)), controls: words.filter((w) => w in CONTROLS) });
    }
  }
  return out;
}

// ── the proof ─────────────────────────────────────────────────────────────
const MUTANTS = [
  ['a window paints its own button (BS-1)', 'src/styles/windows.css', (s) => s + '\n.hw-shop-x .hh-tool { background: var(--bg-0); box-shadow: var(--hw-well); }\n'],
  ['a window recolours the gold plate (BS-1)', 'src/styles/market.css', (s) => s + '\n.hw-mk-x .hw-primary { color: var(--ink); }\n'],
  ['a window frames a bare button inside @media (BS-1)', 'src/styles/tower.css', (s) => s + '\n@media (max-width: 540px) { .tt-x button { border: 2px solid var(--steel-btn); } }\n'],
  ['a link is underlined by its window (BS-1)', 'src/styles/summary.css', (s) => s + '\n.hsum-x .hh-tool.is-link { text-decoration: underline; }\n'],
  ['a press with a look of its own (BS-2)', 'src/shell/windows/shop.js', (s) => s.replace('<button type="button" class="hh-tool" data-hs-act="sell"', '<button type="button" class="hw-sell-btn" data-hs-act="sell"')],
  ['an account screen press with no class (BS-2)', 'src/app/slot-offer.js', (s) => s + "\nexport const x = '<button type=\"button\" data-x=\"1\">x</button>';\n"],
  ['a window paints a press through its own class (BS-1)', 'src/styles/tower.css', (s) => s + '\n.tt-go { background: var(--fill-2); }\n'],
  ['a window recolours the link in a sentence (BS-1)', 'src/styles/windows.css', (s) => s + '\n.hw-pick-ways .hs-goto { color: var(--ink); }\n'],
  ['the framed secondary is bare words again (BS-3)', HOME, (s) => s.replace(':is(.hs-win, .auth-card) .hh-tool:not(.is-primary, .is-link) { border-bottom-color: var(--steel-btn); box-shadow: var(--steel-frame);',
    ':is(.hs-win, .auth-card) .hh-tool:not(.is-primary, .is-link) { border-bottom-color: var(--steel-btn);')],
  ['the framed secondary is a sunk well (BS-3)', HOME, (s) => s.replace(':is(.hs-win, .auth-card) .hh-tool:not(.is-primary, .is-link) { border-bottom-color: var(--steel-btn); box-shadow: var(--steel-frame);',
    ':is(.hs-win, .auth-card) .hh-tool:not(.is-primary, .is-link) { border-bottom-color: var(--steel-btn); box-shadow: var(--steel-well);')],
  ['the frame token loses a side (BS-3)', 'src/styles/tokens.css', (s) => s.replace('--steel-frame: inset 2px 0 0 var(--steel-btn), inset -2px 0 0 var(--steel-btn), inset 0 2px 0 var(--steel-btn);',
    '--steel-frame: inset 2px 0 0 var(--steel-btn), inset -2px 0 0 var(--steel-btn);')],
  ['the link draws a box (BS-3)', HOME, (s) => s.replace('.hh-tool.is-link { padding: 0 2px; border: 0; background: none;', '.hh-tool.is-link { padding: 0 2px; border: 0; background: var(--fill-1);')],
  ['a demoted plate keeps only its foot rule (BS-3)', HOME, (s) => s.replace('border-image: none; box-shadow: var(--steel-frame); background: var(--fill-1); color: var(--ink); filter: none;',
    'border-image: none; background: var(--fill-1); color: var(--ink); filter: none;')],
];

function selftest() {
  const tree = readTree();
  const clean = check(tree);
  let bad = 0;
  if (clean.length) { console.log('✗ the clean tree is red, so no mutant can be judged:\n  ' + clean.join('\n  ')); return 1; }
  console.log('✓ clean control: the tree is green');
  for (const [name, file, edit] of MUTANTS) {
    const copy = new Map(tree);
    const before = copy.get(file);
    if (before === undefined) { console.log('✗ ' + name + ': no ' + file); bad++; continue; }
    const after = edit(before);
    if (after === before) { console.log('✗ ' + name + ': the mutant did not apply'); bad++; continue; }
    copy.set(file, after);
    const red = check(copy);
    if (red.length) console.log('✓ caught: ' + name + '  (' + red[0].slice(0, 110) + ')');
    else { console.log('✗ MISSED: ' + name); bad++; }
  }
  console.log(bad ? bad + ' of ' + MUTANTS.length + ' mutants not caught' : 'All ' + MUTANTS.length + ' mutants caught, clean control green');
  return bad ? 1 : 0;
}

function list() {
  for (const p of pressesOf(readTree())) console.log(p.file + ':' + p.line + '  ' + (p.roles.join(' ') || p.controls.map((c) => c + '(' + CONTROLS[c] + ')').join(' ') || 'NO ROLE') + '  [' + p.cls + ']');
}

export function run(argv = []) {
  try {
    if (argv.includes('--selftest')) return selftest();
    if (argv.includes('--list')) { list(); return 0; }
    const fails = check(readTree());
    if (fails.length) { console.log('✗ button-system: ' + fails.length + ' finding(s)\n  ' + fails.join('\n  ')); return 1; }
    const n = pressesOf(readTree()).length;
    console.log('✓ button-system: the three looks live in ' + HOME + ' only, and each of ' + n + ' window presses has a role');
    return 0;
  } catch (e) { console.log('HARNESS: ' + (e && e.stack || e)); return 2; }
}

if (isMain(import.meta.url)) process.exit(run(process.argv.slice(2)));
