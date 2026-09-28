#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/standings.mjs — ONE NAMED CROWN PER SKILL BOARD, UNIQUE IN THE WORLD,
//                       AND THE STANDINGS STAY CLIENT-ONLY DISPLAY
//
//   node tests/standings.mjs             gate
//   node tests/standings.mjs --selftest  mutation proof (clean arm + 4 plants)
//
// src/data/standings.js names the crown a skill board's rank 1 wears, and
// src/features/standings.js draws Home's 'Your standing' block from one
// hr_leaderboard answer the leaderboard transport holds.
//   STAND-1  the crown keys equal the SKILL_ORDER literal in leaderboards.js,
//            which equals keys(SKILLS_DEF)
//   STAND-2  every crown is 'the <Name>', unique, and collides with no name in
//            the whole name corpus (monsters, items, gear, titles, ranks,
//            renown, board crowns, rallies) in either direction
//   STAND-3  the hr-accrue edge pack carries neither file, no src/core or
//            src/data module imports one, and the data file imports nothing
//   STAND-4  the feature file reads no transport, currency, storage, raw skill
//            copy or display prediction, and writes nothing to G
//
// Exit: 0 green · 1 red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const rel = (p) => relative(ROOT, p).split(sep).join('/');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const NEW_FILES = ['src/data/standings.js', 'src/features/standings.js'];
const SPEC_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
const CROWN_RE = /^the [A-Z][A-Za-z' -]{2,20}$/;
const FORBIDDEN = ['hr_leaderboard', 'rpc(', 'fetch(', 'G.skills', 'localStorage', 'HearthriseStorage',
  'G.gold', 'G.gems', 'addItem', 'hearth_token'];
const MIN_CORPUS = 600;

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(n)) out.push(p);
  }
  return out;
}

/** Source text with block and line comments removed (string contents kept). */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

/** Pure. Returns [{id, msg}]; empty is green. */
export function check(w) {
  const problems = [];
  const add = (id, msg) => problems.push({ id, msg });
  const crownKeys = Object.keys(w.crowns);
  const same = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
  if (!same([...crownKeys].sort(), [...w.skillOrder].sort())) {
    add('STAND-1', `STANDING_CROWNS keys [${crownKeys}] differ from SKILL_ORDER [${w.skillOrder}]`);
  }
  if (!same([...w.skillOrder].sort(), [...w.skillsDef].sort())) {
    add('STAND-1', `SKILL_ORDER [${w.skillOrder}] differs from keys(SKILLS_DEF) [${w.skillsDef}]`);
  }
  if (crownKeys.length !== 17) add('STAND-1', `STANDING_CROWNS has ${crownKeys.length} keys, want 17`);

  if (w.corpus.length < MIN_CORPUS) add('STAND-2', `the name corpus holds ${w.corpus.length} names (want ${MIN_CORPUS}+); a source did not load`);
  const corpus = w.corpus.map((n) => String(n).toLowerCase());
  const seen = new Map();
  for (const [skill, crown] of Object.entries(w.crowns)) {
    if (!CROWN_RE.test(String(crown))) { add('STAND-2', `${skill} crown ${JSON.stringify(crown)} is not 'the <Name>'`); continue; }
    const low = crown.toLowerCase();
    if (seen.has(low)) add('STAND-2', `${skill} crown "${crown}" repeats ${seen.get(low)}`);
    seen.set(low, skill);
    const core = low.slice(4);
    for (const name of corpus) {
      if (name.includes(core)) { add('STAND-2', `${skill} crown "${crown}" sits inside the name "${name}"`); break; }
      if (name.length >= 5 && core.includes(name)) { add('STAND-2', `${skill} crown "${crown}" contains the name "${name}"`); break; }
    }
  }

  if (w.packOrigins.length < 10) add('STAND-3', `the hr-accrue pack lists ${w.packOrigins.length} files; the pack did not run`);
  for (const o of w.packOrigins) if (NEW_FILES.includes(o)) add('STAND-3', `the edge pack carries ${o}`);
  for (const [p, t] of Object.entries(w.sources)) {
    if (!/^src\/(core|data)\//.test(p)) continue;
    for (const m of t.matchAll(SPEC_RE)) if (/standings\.js/.test(m[1])) add('STAND-3', `${p} imports ${m[1]}`);
  }
  if (/(^|\n)\s*import\b/.test(w.sources['src/data/standings.js'] || '')) add('STAND-3', 'src/data/standings.js imports a module');

  const feat = stripComments(w.sources['src/features/standings.js'] || '');
  if (!feat) add('STAND-4', 'src/features/standings.js is missing');
  for (const f of FORBIDDEN) if (feat.includes(f)) add('STAND-4', `src/features/standings.js uses ${f}`);
  if (/\w*ForDisplay\w*\(/.test(feat)) add('STAND-4', 'src/features/standings.js calls a *ForDisplay accessor');
  if (/\bG\.[\w$]+\s*=(?!=)/.test(feat)) add('STAND-4', 'src/features/standings.js writes to G');
  return problems;
}

async function loadReal() {
  let crowns = {};
  try { ({ STANDING_CROWNS: crowns } = await import('../src/data/standings.js')); } catch (e) { crowns = {}; }
  const { SKILLS_DEF } = await import('../src/data/skills.js');
  const { MONSTERS } = await import('../src/data/monsters.js');
  const { ITEMS } = await import('../src/data/items.js');
  const { GEAR_ITEMS } = await import('../src/data/gear-tiers.js');
  const { HEARTHFIND_TROPHIES, HEARTHFIND_SET_TITLE } = await import('../src/data/hearthfind.js');
  const { CHARM_RANK_NAMES } = await import('../src/data/bestiary-charms.js');
  const { TROPHY_STAGE_NAMES } = await import('../src/data/bestiary.js');
  const { SKILL_GUIDE } = await import('../src/data/skill-guide.js');
  const { pack } = await import('../tools/pack-edge.mjs');
  const lb = read('src/features/leaderboards.js');
  const orderLit = /var SKILL_ORDER = \[([\s\S]*?)\]/.exec(lb);
  if (!orderLit) throw Object.assign(new Error('SKILL_ORDER literal not found'), { harness: true });
  const renown = read('src/features/renown.js');
  const corpus = [
    ...Object.values(MONSTERS).map((m) => m && m.name),
    ...Object.values(ITEMS).map((i) => i && i.n),
    ...Object.values(GEAR_ITEMS).map((i) => i && i.n),
    ...HEARTHFIND_TROPHIES.map((t) => t.titleName), HEARTHFIND_SET_TITLE.name,
    ...Object.values(CHARM_RANK_NAMES), ...Object.values(TROPHY_STAGE_NAMES),
    ...Object.values(SKILL_GUIDE).map((g) => g.title),
    ...[...renown.matchAll(/name: '([^']+)', +title: '([^']+)'/g)].flatMap((m) => [m[1], m[2]]),
    ...[...lb.matchAll(/crown: '([^']+)'/g)].map((m) => m[1]),
    ...[...read('src/features/muster.js').matchAll(/name: '(The [^']+)'/g)].map((m) => m[1]),
  ].filter((n) => typeof n === 'string' && n.trim());
  const sources = {};
  for (const p of walk(join(ROOT, 'src'))) sources[rel(p)] = readFileSync(p, 'utf8');
  const packed = await pack('hr-accrue');
  return {
    crowns: { ...crowns },
    skillOrder: [...orderLit[1].matchAll(/'(\w+)'/g)].map((m) => m[1]),
    skillsDef: Object.keys(SKILLS_DEF),
    corpus: [...new Set(corpus)],
    sources,
    packOrigins: packed.files.map((f) => f.origin || f.name),
  };
}

const MUTATIONS = {
  dropMining: ['STAND-1', (w) => { delete w.crowns.mining; }],
  archmage: ['STAND-2', (w) => { w.crowns.magic = 'the Archmage'; }],
  coreImport: ['STAND-3', (w) => { w.sources['src/core/zz.js'] = "import { STANDING_CROWNS } from '../data/standings.js';\n"; }],
  fetchCall: ['STAND-4', (w) => { w.sources['src/features/standings.js'] += "\nfetch('x');\n"; }],
};

async function main() {
  if (process.argv.includes('--selftest')) {
    const self = fileURLToPath(import.meta.url);
    const run = (m) => spawnSync(process.execPath, [self], { env: { ...process.env, HR_STAND_MUTATE: m }, encoding: 'utf8' });
    const clean = run('');
    if (clean.status !== 0) { console.error('selftest: the CLEAN arm is red\n' + clean.stdout + clean.stderr); process.exit(1); }
    let caught = 0;
    for (const [name, [id]] of Object.entries(MUTATIONS)) {
      const r = run(name);
      const ok = r.status === 1 && r.stdout.includes(id + ':');
      console.log(`  ${ok ? 'caught' : 'MISSED'}  ${name} -> ${id} (exit ${r.status})`);
      if (ok) caught += 1;
    }
    const n = Object.keys(MUTATIONS).length;
    console.log(`standings selftest: clean arm green, ${caught} of ${n} caught`);
    process.exit(caught === n ? 0 : 1);
  }
  const w = await loadReal();
  const m = process.env.HR_STAND_MUTATE;
  if (m) {
    if (!MUTATIONS[m]) { console.error('unknown mutation ' + m); process.exit(2); }
    MUTATIONS[m][1](w);
  }
  const problems = check(w);
  for (const p of problems) console.log(`  FAIL  ${p.id}: ${p.msg}`);
  console.log(problems.length
    ? `standings: ${problems.length} failure(s)`
    : `standings: ${Object.keys(w.crowns).length} crowns against ${w.corpus.length} names, STAND-1..4 green`);
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
