#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/this-week.mjs — THE HOME "YOUR WEEK" CARD AND THE REALM'S TODAY CELLS
//
//   node tests/this-week.mjs             gate
//   node tests/this-week.mjs --selftest  mutation proof (clean arm + 11 plants
//                                        + 2 negative controls)
//
// src/data/this-week.js names the server period counters the card shows;
// src/features/this-week.js renders them from the one tally cache
// (window.HearthriseTally.peek, filled by src/features/daily-quests.js from
// hr_tally_state), never from G. The goals board this card once borrowed its
// rows from is retired (2026-10-16-goal-board-retire.sql).
//   WEEK-1  THIS_WEEK counters are ones the server stamps ('gold', a core
//           GOAL_EVENTS type, or a goal-period.js counter), unique, with a
//           positive par; every goal-period.js counter has a row (no counter
//           ticks into the void)
//   WEEK-2  THIS_WEEK_TODAY counters are ones the server stamps
//   WEEK-3  labels are 3-24 letters and unique
//   WEEK-4  leads + QUIET: 100-140 chars, lore charset, no digit, no trailing
//           full stop, unique, no stat word, no copy of another lore line
//   WEEK-5  the hr-accrue payload never names this-week (class A)
//   WEEK-6  the feature never calls the tally RPC or its refresh seam
//   WEEK-7  the feature never reads G or a predicted/display seam
//   WEEK-8  the hearth band reads no residue delta and prints the realm cells
//   WEEK-9  the tally cache is deep-frozen and peek() expires at 120 s
// Never imports another tests/*.mjs: a guard that runs its own gate at module
// top level would exit this process with ITS code.
//
// Exit: 0 green · 1 red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const CHARSET = /^[A-Za-z ,.;:'’!?—-]+$/u;
const EXTRA_VOCAB = ['xp', 'percent', 'damage', 'chance', 'bonus', 'crit', 'drop rate',
  'gold find', 'yield', 'speed'];

/** The string values of an object literal `<decl> {…};` in source text. */
function labelValues(srcText, decl) {
  const at = srcText.indexOf(decl);
  if (at < 0) throw Object.assign(new Error(`${decl} not found`), { harness: true });
  const body = srcText.slice(at, srcText.indexOf('};', at));
  return [...body.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
}

const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Pure. Returns [{id, msg}] — empty is green. */
export function check(d) {
  const problems = [];
  const add = (id, msg) => problems.push({ id, msg });
  const stamped = new Set(['gold', ...d.coreEvents.map((t) => 'ev:' + t), ...d.periodCounters.map((t) => 'ev:' + t)]);

  const mine = d.week.map((r) => r.counter);
  for (const r of d.week) {
    if (!stamped.has(r.counter)) add('WEEK-1', `THIS_WEEK counter ${r.counter} is not one the server stamps`);
    if (!(Number.isInteger(r.par) && r.par > 0)) add('WEEK-1', `THIS_WEEK ${r.counter} par ${r.par} is not a positive integer`);
  }
  if (new Set(mine).size !== mine.length) add('WEEK-1', 'THIS_WEEK names a counter twice');
  for (const c of d.periodCounters) {
    if (!mine.includes('ev:' + c)) add('WEEK-1', `goal-period.js stamps ev:${c} and no THIS_WEEK row reads it`);
  }
  for (const r of d.today) if (!stamped.has(r.counter)) add('WEEK-2', `THIS_WEEK_TODAY counter ${r.counter} is not one the server stamps`);

  for (const rows of [d.week, d.today]) {   // unique within the card, and within the band
    const labels = new Set();
    for (const r of rows) {
      const s = typeof r.label === 'string' ? r.label : '';
      if (s.length < 3 || s.length > 24 || !/^[A-Za-z' ]+$/.test(s)) add('WEEK-3', `${r.counter} label ${JSON.stringify(s)} is not 3-24 letters`);
      if (labels.has(s)) add('WEEK-3', `${r.counter} label "${s}" is not unique`);
      labels.add(s);
    }
  }

  const vocab = d.vocab.map((w) => [w, new RegExp(`(^|[^A-Za-z])${reEsc(w)}($|[^A-Za-z])`, 'i')]);
  const foreign = new Set(d.foreignLines);
  const seen = new Map();
  for (const [where, line] of [...d.week.map((r) => [r.counter, r.lead]), ['QUIET', d.quiet]]) {
    const s = typeof line === 'string' ? line : '';
    if (s.length < 100 || s.length > 140) add('WEEK-4', `${where} lead is ${s.length} chars (want 100-140)`);
    if (!CHARSET.test(s)) add('WEEK-4', `${where} lead has a character outside the charset`);
    if (/[0-9]/.test(s)) add('WEEK-4', `${where} lead contains a digit`);
    if (s.endsWith('.')) add('WEEK-4', `${where} lead ends in a full stop`);
    if (seen.has(s)) add('WEEK-4', `${where} lead duplicates ${seen.get(s)}`);
    else seen.set(s, where);
    if (foreign.has(s)) add('WEEK-4', `${where} lead copies another lore line`);
    for (const [w, re] of vocab) if (re.test(s)) add('WEEK-4', `${where} lead uses the stat word "${w}"`);
  }

  for (const f of d.packedFiles) {
    if (/this-week/.test(String(f.origin || '')) || /this-week/.test(String(f.content || ''))) {
      add('WEEK-5', `hr-accrue packs ${f.origin || f.name}, which names this-week — it must stay client-only`);
    }
  }

  const feat = stripJs(d.feature);
  for (const w of ['hr_tally_state', 'tallyState(', '.refresh(', 'rpc(']) {
    if (feat.includes(w)) add('WEEK-6', `the feature names ${w} — it reads the cache, it never fetches`);
  }
  if (/\bG\s*[.[]/.test(feat)) add('WEEK-7', 'the feature reads G');
  for (const w of ['window.G', 'getProgress', 'localProgress', 'ForDisplay(']) {
    if (feat.includes(w)) add('WEEK-7', `the feature names ${w}`);
  }

  for (const w of ['today.kills', 'today.harvested', 'today.gathered', 'G.stats.kills', '>Harvest<']) {
    if (d.home.includes(w)) add('WEEK-8', `home-dashboard.js still reads ${w}`);
  }
  const block = (cls) => {
    const at = d.home.indexOf(`'<div class="${cls}">'`);
    return at < 0 ? '' : d.home.slice(at, d.home.indexOf("'</div>';", at));
  };
  for (const cls of ['hd-ledger', 'hd-ledger-m']) {
    if (!block(cls).includes('realmLeds()')) add('WEEK-8', `the .${cls} block does not print realmLeds()`);
  }
  const at = d.home.indexOf('function realmLeds(');
  if (at < 0 || !d.home.slice(at, d.home.indexOf('\n    }', at)).includes('.todayCells(')) {
    add('WEEK-8', 'realmLeds() does not read todayCells');
  }

  const cache = stripJs(d.cache);
  if (!/var PEEK_MS = 120000;/.test(cache)) add('WEEK-9', 'the tally cache does not declare PEEK_MS = 120000');
  if (!/return _tally && \(Date\.now\(\) - _tallyAt\) < PEEK_MS \? _tally : null;/.test(cache)) {
    add('WEEK-9', 'peek() does not expire at PEEK_MS of _tallyAt');
  }
  if ((cache.match(/_tally = deepFreeze\(\{/g) || []).length < 2) add('WEEK-9', 'a tally write is not deep-frozen');
  return problems;
}

async function loadReal() {
  /* A missing data or feature file is a finding (red), not a harness error. */
  let data;
  try { data = await import('../src/data/this-week.js'); }
  catch (e) { data = { THIS_WEEK: [], THIS_WEEK_TODAY: [], THIS_WEEK_QUIET: '' }; }
  const { THIS_WEEK, THIS_WEEK_QUIET, THIS_WEEK_TODAY } = data;
  const readOr = (p) => { try { return read(p); } catch (e) { return ''; } };
  const { GOAL_EVENTS } = await import('../src/core/goals.js');
  const { MODAL_GOAL_COUNTERS } = await import('../supabase/functions/hr-accrue/goal-period.js');
  const { pack } = await import('../tools/pack-edge.mjs');
  const packed = await pack('hr-accrue');
  const vocab = [...new Set([
    ...labelValues(read('src/render/companion-lines.js'), 'export const COMPANION_LABELS = {'),
    ...labelValues(read('src/features/homestead.js'), 'var KEY_LABEL = {'),
    ...EXTRA_VOCAB,
  ].map((w) => w.toLowerCase()))];
  const strings = (o) => (typeof o === 'string' ? [o] : (o && typeof o === 'object' ? Object.values(o).flatMap(strings) : []));
  const foreignLines = [];
  for (const f of ['lore-notes', 'lucky-rumours', 'homestead-lore', 'charm-lore', 'monster-notes', 'item-descriptions']) {
    const mod = await import(`../src/data/${f}.js`);
    for (const v of Object.values(mod)) if (typeof v !== 'function') foreignLines.push(...strings(v));
  }
  return {
    coreEvents: [...GOAL_EVENTS], periodCounters: [...MODAL_GOAL_COUNTERS],
    week: THIS_WEEK, today: THIS_WEEK_TODAY, quiet: THIS_WEEK_QUIET,
    vocab, foreignLines, packedFiles: packed.files,
    feature: readOr('src/features/this-week.js'),
    home: read('src/features/home-dashboard.js'),
    cache: readOr('src/features/daily-quests.js'),
  };
}

async function run() {
  const d = await loadReal();
  const problems = check(d);
  if (problems.length) {
    console.error(`  ✗ this-week: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`      ${p.id}  ${p.msg}`);
    return 1;
  }
  console.log(`✓ this-week: ${d.week.length} weekly rows on server-stamped counters (every period counter read), `
    + `${d.today.length} daily cells, ${d.vocab.length} stat words absent, not in the ${d.packedFiles.length}-file `
    + 'edge payload, tally cache frozen + expiring');
  return 0;
}

/* ── MUTATION PROOF (CLAUDE.md §4): a clean arm, then one plant per WEEK id,
   each caught by its OWN id, and two edits that must stay green. */
function fixture() {
  const L = (s) => s.padEnd(110, ' and the valley remembers it well');
  const counters = ['ev:kill_any', 'ev:chopped', 'ev:cooked', 'gold'];
  return {
    coreEvents: ['kill_any', 'cooked'], periodCounters: ['chopped'],
    week: counters.map((c, i) => ({ counter: c, par: 10 + i, label: 'Row ' + 'ABCD'[i], lead: L('A week of kind ' + 'ABCD'[i]) })),
    today: [{ counter: 'ev:kill_any', label: 'Kills today' }, { counter: 'gold', label: 'Gold earned' }],
    quiet: L('The week is still young'),
    vocab: ['all xp', 'gather', 'speed', 'xp'],
    foreignLines: ['A goblin measures a raid by what it carries home'],
    packedFiles: [{ name: 'index.ts', origin: 'supabase/functions/hr-accrue/index.ts', content: 'x' }],
    feature: "import { THIS_WEEK } from '../data/this-week.js';\nfunction live(){ var S = window.HearthriseTally; return S ? S.peek() : null; }\n",
    home: "    function realmLeds() {\n      var c = TW.todayCells(TW.live());\n    }\n"
      + "    html += '<div class=\"hd-ledger\">' + xpLed + realmLeds() + '</div>';\n"
      + "    html += '<div class=\"hd-ledger-m\">' + xpLed + realmLeds() + '</div>';\n",
    cache: 'var PEEK_MS = 120000;\nfunction peek() {\n  return _tally && (Date.now() - _tallyAt) < PEEK_MS ? _tally : null;\n}\n'
      + '_tally = deepFreeze({ day: 1 });\n_tally = deepFreeze({ day: 2 });\n',
  };
}

function selftest() {
  let bad = 0;
  const say = (ok, label) => { if (!ok) bad++; console.log(`  ${ok ? 'ok   ' : 'WRONG'}  ${label}`); };
  const clean = check(fixture());
  say(clean.length === 0, `clean arm: 0 problems${clean.length ? ' → ' + clean.map((p) => p.id + ' ' + p.msg).join('; ') : ''}`);
  const arms = [
    ['a row on a counter nothing stamps', 'WEEK-1', (f) => { f.week.push({ counter: 'ev:fish_dreams', par: 5, label: 'Dreams', lead: f.quiet.replace('young', 'wet') }); }],
    ['a period counter with no row', 'WEEK-1', (f) => { f.periodCounters.push('mined'); }],
    ['TODAY counter nothing stamps', 'WEEK-2', (f) => { f.today[0].counter = 'ev:naps'; }],
    ['a label with a digit', 'WEEK-3', (f) => { f.week[0].label = 'Row 1'; }],
    ["a lead with 'speed'", 'WEEK-4', (f) => { f.week[1].lead = f.week[1].lead.replace('A week', 'A speed week'); }],
    ["a lead with '5'", 'WEEK-4', (f) => { f.week[2].lead = f.week[2].lead.replace('A week', 'A 5 week'); }],
    ['pack src/data/this-week.js', 'WEEK-5', (f) => { f.packedFiles.push({ name: '_shared/this-week.js', origin: 'src/data/this-week.js', content: '' }); }],
    ["feature 'tallyState('", 'WEEK-6', (f) => { f.feature += 'GC.tallyState().then(x);\n'; }],
    ["feature 'G.stats'", 'WEEK-7', (f) => { f.feature += 'var k = G.stats.kills;\n'; }],
    ["home 'today.kills'", 'WEEK-8', (f) => { f.home += 'var kills = today.kills;\n'; }],
    ['cache without 120000', 'WEEK-9', (f) => { f.cache = f.cache.replace('120000', '999999'); }],
  ];
  for (const [label, want, mutate] of arms) {
    const f = fixture(); mutate(f);
    const ids = new Set(check(f).map((p) => p.id));
    say(ids.has(want), `${label} → ${want}${ids.has(want) ? '' : ' (got ' + [...ids] + ')'}`);
  }
  const controls = [
    ['a comment naming hr_tally_state', (f) => { f.feature += '/* the cache is filled by hr_tally_state */\n// tallyState( lives in daily-quests\n'; }],
    ['a whitespace edit', (f) => { f.feature = f.feature.replace(/\n/g, '\n\n  '); f.home = f.home.replace(/\n/g, '\n\n'); }],
  ];
  for (const [label, mutate] of controls) {
    const f = fixture(); mutate(f);
    const got = check(f);
    say(got.length === 0, `control: ${label} stays green${got.length ? ' (got ' + got.map((p) => p.id) + ')' : ''}`);
  }
  console.log(bad ? `✗ this-week --selftest: ${bad} arm(s) wrong`
    : `✓ this-week --selftest: clean arm green, ${arms.length}/${arms.length} plants caught, ${controls.length} controls green`);
  return bad ? 1 : 0;
}

const main = process.argv.includes('--selftest') ? async () => selftest() : run;
main().then((code) => process.exit(code), (e) => {
  console.error(`  ✗ this-week harness error: ${e && e.stack || e}`);
  process.exit(2);
});
