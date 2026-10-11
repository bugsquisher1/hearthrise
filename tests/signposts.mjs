#!/usr/bin/env node
// tests/signposts.mjs — THE DEAD-END COPY IS REACHABLE, TRUE TO ITS SHAPE, CLIENT-ONLY
//
//   node tests/signposts.mjs             the guard
//   node tests/signposts.mjs --selftest  clean arm, then every planted mutation must exit 1
//
// src/data/signposts.js is the copy a player reads at a dead end (an empty bag
// class, a stalled bench, a locked card). Six rules, text and data only:
//   SIGN-1  every line and label key is used: bag.<id> through the bag's CATEGORIES ids,
//           every other key as a literal string somewhere in src/ (not smoke)
//   SIGN-2  a door opens a real tab (index.html data-tab or a HUBS pane in
//           src/nav-consolidation.js) or a real skill
//   SIGN-3  lines 30-200 chars, labels 3-40; no digits, emoji or < > &
//   SIGN-4  every CATEGORIES id but recipes has bag.<id>, plus bag.hidden
//   SIGN-5  a line's {placeholders} equal its declared vars
//   SIGN-7  the hr-accrue edge pack carries no signposts or know-your-foe
//           file, and no src/core or src/data module imports one
//   SIGN-8  RETIRED COPY: no string literal in src/ (not smoke) says the
//           Recovery rev.1 night ("the fight ends", "until you fall"), or the
//           armour/Defence advice the accuracy floor no longer pays
//   SIGN-9  KNOW YOUR FOE: every WEAPON_AXES member has a WEAPON_TYPES label;
//           CHARM_RANKS[0].reveal, so nextOfClass().remaining is the distance
//           to the element reveal; every foe.* line key is a literal in
//           src/features/know-your-foe.js
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const rel = (p) => relative(ROOT, p).split(sep).join('/');

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(n)) out.push(p);
  }
  return out;
}

/** The pane tabs of the menu table: every `tab: '<id>'` inside `var HUBS = [ … ];`. */
function hubPanes(nav) {
  const at = nav.indexOf('var HUBS = [');
  if (at < 0) return [];
  const block = nav.slice(at, nav.indexOf('];', at));
  return [...block.matchAll(/\btab:\s*'([\w-]+)'/g)].map((m) => m[1]);
}

async function world() {
  const { SIGNPOSTS } = await import('../src/data/signposts.js');
  const { SKILLS_DEF } = await import('../src/data/skills.js');
  const { pack } = await import('../tools/pack-edge.mjs');
  const inv = readFileSync(join(ROOT, 'src/screens/inventory.js'), 'utf8');
  const catBlock = inv.slice(inv.indexOf('var CATEGORIES = ['), inv.indexOf('];', inv.indexOf('var CATEGORIES = [')));
  const sources = {};
  for (const p of walk(join(ROOT, 'src'))) sources[rel(p)] = readFileSync(p, 'utf8');
  const packed = await pack('hr-accrue');
  const { WEAPON_TYPES } = await import('../src/core/combat.js');
  const { WEAPON_AXES } = await import('../src/data/monster-classes.js');
  const { CHARM_RANKS } = await import('../src/data/bestiary-charms.js');
  return {
    weaponTypes: { ...WEAPON_TYPES },
    weaponAxes: [...WEAPON_AXES],
    firstRankReveals: !!(CHARM_RANKS[0] && CHARM_RANKS[0].reveal === true),
    lines: JSON.parse(JSON.stringify(SIGNPOSTS.lines)),
    labels: { ...SIGNPOSTS.labels },
    categoryIds: [...catBlock.matchAll(/\{id:'(\w+)'/g)].map((m) => m[1]),
    // A door opens a real screen: a rail button (index.html data-tab) or a
    // pane of the nine-door menu (HUBS in src/nav-consolidation.js, w0d) —
    // panes like the Stable have no rail button of their own any more.
    tabs: [...new Set([
      ...[...readFileSync(join(ROOT, 'index.html'), 'utf8').matchAll(/data-tab="([\w-]+)"/g)].map((m) => m[1]),
      ...hubPanes(readFileSync(join(ROOT, 'src/nav-consolidation.js'), 'utf8')),
    ])],
    skills: Object.keys(SKILLS_DEF),
    sources,
    packOrigins: packed.files.map((f) => f.origin || f.name),
  };
}

const RETIRED = /fight ends|night ends in recovery|until you fall|nobody eats for you|upgrade your armou?r|train defen[cs]e/i;
const REGEX_PREV = /[(,=:[!&|?{};+\-*%<>~^]|^$|\breturn$|\btypeof$/;

/** Every string literal in a JS source (template text included, `${}` holes
    scanned as code), with its line; comments and regex literals never count. */
function stringLiterals(src) {
  const out = [];
  const starts = [0];
  for (let k = 0; k < src.length; k++) if (src[k] === '\n') starts.push(k + 1);
  const lineAt = (i) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= i) lo = m; else hi = m - 1; } return lo + 1; };
  const scan = (i, inHole) => {
    let prev = '', depth = 0;
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
      if (inHole && c === '{') { depth++; i++; prev = c; continue; }
      if (inHole && c === '}') { if (depth-- === 0) return i + 1; i++; prev = c; continue; }
      if (c === "'" || c === '"' || c === '`') {
        const at = i; let j = i + 1, text = '';
        while (j < src.length && src[j] !== c) {
          if (src[j] === '\\') { text += src[j + 1]; j += 2; continue; }
          if (c === '`' && src[j] === '$' && src[j + 1] === '{') { text += '\u0000'; j = scan(j + 2, true); continue; }
          text += src[j]; j++;
        }
        out.push({ text, line: lineAt(at) }); i = j + 1; prev = 'str'; continue;
      }
      if (c === '/' && REGEX_PREV.test(prev)) {
        let j = i + 1, cls = false;
        while (j < src.length && src[j] !== '\n' && (cls || src[j] !== '/')) {
          if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false;
          j++;
        }
        i = j + 1; prev = 're'; continue;
      }
      const w = /[\w$]/.test(c) ? src.slice(i).match(/^[\w$]+/)[0] : c;
      prev = w; i += w.length;
    }
    return i;
  };
  scan(0, false);
  return out;
}

const BAD_CHARS = /[\d<>&]|\p{Extended_Pictographic}/u;
const SPEC_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;

export function check(w) {
  const fails = [];
  const fail = (rule, msg) => fails.push(`${rule}: ${msg}`);
  const corpus = Object.entries(w.sources)
    .filter(([p]) => p !== 'src/data/signposts.js' && !p.startsWith('src/features/smoke') && p !== 'src/features/smoke-test.js')
    .map(([, t]) => t).join('\n');
  for (const key of Object.keys(w.lines)) {
    const used = key.startsWith('bag.') && key !== 'bag.hidden'
      ? w.categoryIds.includes(key.slice(4))
      : ["'", '"', '`'].some((q) => corpus.includes(q + key + q));
    if (!used) fail('SIGN-1', `${key} is never used`);
  }
  for (const key of Object.keys(w.labels)) {
    if (!["'", '"', '`'].some((q) => corpus.includes(q + key + q))) fail('SIGN-1', `label ${key} is never used`);
  }
  for (const [key, l] of Object.entries(w.lines)) {
    const d = l.door;
    if (d && d.tab && !w.tabs.includes(d.tab)) fail('SIGN-2', `${key} door tab '${d.tab}' is not a data-tab or menu pane`);
    if (d && d.skill && !w.skills.includes(d.skill)) fail('SIGN-2', `${key} door skill '${d.skill}' is not in SKILLS_DEF`);
    if (d && !d.tab === !d.skill) fail('SIGN-2', `${key} door needs exactly one of tab or skill`);
    if (d && (String(d.label || '').length < 3 || String(d.label).length > 40 || BAD_CHARS.test(d.label))) fail('SIGN-3', `${key} door label '${d.label}'`);
    const t = String(l.text || '');
    if (t.length < 30 || t.length > 200) fail('SIGN-3', `${key} is ${t.length} chars (30-200)`);
    if (BAD_CHARS.test(t)) fail('SIGN-3', `${key} carries a digit, emoji or < > &`);
    const holes = [...new Set([...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
    if (holes !== [...new Set(l.vars || [])].sort().join(',')) fail('SIGN-5', `${key} placeholders {${holes}} vs vars [${(l.vars || []).join(',')}]`);
    if (/[{}]/.test(t.replace(/\{\w+\}/g, ''))) fail('SIGN-5', `${key} has a stray brace`);
  }
  for (const [key, t] of Object.entries(w.labels)) {
    if (t.length < 3 || t.length > 40 || BAD_CHARS.test(t)) fail('SIGN-3', `label ${key} '${t}'`);
  }
  for (const id of w.categoryIds.filter((c) => c !== 'recipes').concat('hidden')) {
    if (!w.lines['bag.' + id]) fail('SIGN-4', `no bag.${id} line`);
  }
  if (!w.categoryIds.length) fail('SIGN-4', 'no CATEGORIES ids parsed from src/screens/inventory.js');
  if (w.packOrigins.length < 10) fail('SIGN-7', `the hr-accrue pack lists ${w.packOrigins.length} files; the pack did not run`);
  for (const o of w.packOrigins) if (/signposts|know-your-foe/.test(o)) fail('SIGN-7', `the edge pack carries ${o}`);
  for (const [p, t] of Object.entries(w.sources)) {
    if (!/^src\/(core|data)\//.test(p)) continue;
    for (const m of t.matchAll(SPEC_RE)) if (/signposts|know-your-foe/.test(m[1])) fail('SIGN-7', `${p} imports ${m[1]}`);
  }
  for (const [p, t] of Object.entries(w.sources)) {
    if (p.startsWith('src/features/smoke') || p === 'src/features/smoke-test.js') continue;
    for (const l of stringLiterals(t)) if (RETIRED.test(l.text)) fail('SIGN-8', `${p}:${l.line} says retired copy: ${JSON.stringify(l.text.slice(0, 80))}`);
  }
  for (const a of w.weaponAxes) if (!w.weaponTypes[a]) fail('SIGN-9', `weapon axis '${a}' has no WEAPON_TYPES label`);
  if (!w.firstRankReveals) fail('SIGN-9', 'CHARM_RANKS[0].reveal is not true: nextOfClass().remaining is no longer the distance to the reveal');
  const foeSrc = w.sources['src/features/know-your-foe.js'] || '';
  for (const key of Object.keys(w.lines).filter((k) => k.startsWith('foe.'))) {
    if (!["'", '"', '`'].some((q) => foeSrc.includes(q + key + q))) fail('SIGN-9', `${key} is not a literal in src/features/know-your-foe.js`);
  }
  return fails;
}

const MUTATIONS = {
  unreferencedKey: ['SIGN-1', (w) => { w.lines['zz.orphan'] = { text: 'A line nobody in the game ever shows to a player.' }; }],
  badTab: ['SIGN-2', (w) => { w.lines['bag.all'].door.tab = 'nope'; }],
  paneDropped: ['SIGN-2', (w) => { w.tabs = w.tabs.filter((t) => t !== 'stable'); }],
  digit: ['SIGN-3', (w) => { w.lines['farm.noSeeds'].text += ' Costs 5 gold.'; }],
  missingBagTools: ['SIGN-4', (w) => { delete w.lines['bag.tools']; }],
  undeclaredVar: ['SIGN-5', (w) => { w.lines['home.dailyDone'].text += ' {x}'; }],
  coreImport: ['SIGN-7', (w) => { w.sources['src/core/zz-planted.js'] = "import { SIGNPOSTS } from '../data/signposts.js';\n"; }],
  packCarries: ['SIGN-7', (w) => { w.packOrigins.push('src/data/signposts.js'); }],
  retiredCopy: ['SIGN-8', (w) => { w.sources['src/features/zz-planted.js'] = "// the fight ends\nconst t = 'away: until you fall';\n"; }],
  armourAdvice: ['SIGN-8', (w) => { w.sources['src/features/zz-planted.js'] = "const t = 'Train Defence and upgrade your armour.';\n"; }],
  foeCoreImport: ['SIGN-7', (w) => { w.sources['src/data/zz-planted.js'] = "import { facts } from '../features/know-your-foe.js';\n"; }],
  axisUnlabelled: ['SIGN-9', (w) => { delete w.weaponTypes.hammer; }],
  firstRankHidden: ['SIGN-9', (w) => { w.firstRankReveals = false; }],
  foeKeyNotLiteral: ['SIGN-9', (w) => { w.sources['src/features/know-your-foe.js'] = w.sources['src/features/know-your-foe.js'].split("'foe.elementHidden'").join("'foe.' + 'elementHidden'"); }],
  nightKeyUnused: ['SIGN-1', (w) => { for (const p of Object.keys(w.sources)) w.sources[p] = w.sources[p].split("'night.retreat'").join("'zz'"); }],
};

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) {
    const self = fileURLToPath(import.meta.url);
    const run = (env) => spawnSync(process.execPath, [self], { env: { ...process.env, ...env }, encoding: 'utf8' });
    const clean = run({ HR_SIGN_MUTATE: '' });
    if (clean.status !== 0) { console.error('selftest: the CLEAN arm is red\n' + clean.stdout + clean.stderr); process.exit(1); }
    let bad = 0;
    for (const [name, [rule]] of Object.entries(MUTATIONS)) {
      const r = run({ HR_SIGN_MUTATE: name });
      const caught = r.status === 1 && r.stdout.includes(rule + ':');
      console.log(`  ${caught ? 'caught' : 'MISSED'}  ${name} -> ${rule} (exit ${r.status})`);
      if (!caught) bad += 1;
    }
    console.log(bad ? `signposts selftest: ${bad} mutation(s) missed` : `signposts selftest: clean arm green, ${Object.keys(MUTATIONS).length} mutations caught`);
    process.exit(bad ? 1 : 0);
  }
  const w = await world();
  const m = process.env.HR_SIGN_MUTATE;
  if (m) {
    if (!MUTATIONS[m]) { console.error('unknown mutation ' + m); process.exit(2); }
    MUTATIONS[m][1](w);
  }
  const fails = check(w);
  for (const f of fails) console.log('  FAIL  ' + f);
  console.log(fails.length ? `signposts: ${fails.length} failure(s)` : `signposts: ${Object.keys(w.lines).length} lines, ${Object.keys(w.labels).length} labels, SIGN-1..5,7,8,9 green`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
