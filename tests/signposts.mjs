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
//   SIGN-2  a door opens a real tab (index.html data-tab) or a real skill
//   SIGN-3  lines 30-200 chars, labels 3-40; no digits, emoji or < > &
//   SIGN-4  every CATEGORIES id but recipes has bag.<id>, plus bag.hidden
//   SIGN-5  a line's {placeholders} equal its declared vars
//   SIGN-7  the hr-accrue edge pack carries no signposts file, and no
//           src/core or src/data module imports one
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

async function world() {
  const { SIGNPOSTS } = await import('../src/data/signposts.js');
  const { SKILLS_DEF } = await import('../src/data/skills.js');
  const { pack } = await import('../tools/pack-edge.mjs');
  const inv = readFileSync(join(ROOT, 'src/screens/inventory.js'), 'utf8');
  const catBlock = inv.slice(inv.indexOf('var CATEGORIES = ['), inv.indexOf('];', inv.indexOf('var CATEGORIES = [')));
  const sources = {};
  for (const p of walk(join(ROOT, 'src'))) sources[rel(p)] = readFileSync(p, 'utf8');
  const packed = await pack('hr-accrue');
  return {
    lines: JSON.parse(JSON.stringify(SIGNPOSTS.lines)),
    labels: { ...SIGNPOSTS.labels },
    categoryIds: [...catBlock.matchAll(/\{id:'(\w+)'/g)].map((m) => m[1]),
    tabs: [...new Set([...readFileSync(join(ROOT, 'index.html'), 'utf8').matchAll(/data-tab="([\w-]+)"/g)].map((m) => m[1]))],
    skills: Object.keys(SKILLS_DEF),
    sources,
    packOrigins: packed.files.map((f) => f.origin || f.name),
  };
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
    if (d && d.tab && !w.tabs.includes(d.tab)) fail('SIGN-2', `${key} door tab '${d.tab}' is not a data-tab`);
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
  for (const o of w.packOrigins) if (/signposts/.test(o)) fail('SIGN-7', `the edge pack carries ${o}`);
  for (const [p, t] of Object.entries(w.sources)) {
    if (!/^src\/(core|data)\//.test(p)) continue;
    for (const m of t.matchAll(SPEC_RE)) if (/signposts/.test(m[1])) fail('SIGN-7', `${p} imports ${m[1]}`);
  }
  return fails;
}

const MUTATIONS = {
  unreferencedKey: ['SIGN-1', (w) => { w.lines['zz.orphan'] = { text: 'A line nobody in the game ever shows to a player.' }; }],
  badTab: ['SIGN-2', (w) => { w.lines['bag.all'].door.tab = 'nope'; }],
  digit: ['SIGN-3', (w) => { w.lines['farm.noSeeds'].text += ' Costs 5 gold.'; }],
  missingBagTools: ['SIGN-4', (w) => { delete w.lines['bag.tools']; }],
  undeclaredVar: ['SIGN-5', (w) => { w.lines['home.dailyDone'].text += ' {x}'; }],
  coreImport: ['SIGN-7', (w) => { w.sources['src/core/zz-planted.js'] = "import { SIGNPOSTS } from '../data/signposts.js';\n"; }],
  packCarries: ['SIGN-7', (w) => { w.packOrigins.push('src/data/signposts.js'); }],
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
  console.log(fails.length ? `signposts: ${fails.length} failure(s)` : `signposts: ${Object.keys(w.lines).length} lines, ${Object.keys(w.labels).length} labels, SIGN-1..5,7 green`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
