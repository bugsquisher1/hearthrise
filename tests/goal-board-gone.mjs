#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/goal-board-gone.mjs — THE OLD GOALS BOARD STAYS CUT, AND THE ONE DAILY
//                             LIST COUNTS NOTHING IN THE BROWSER
//
//   node tests/goal-board-gone.mjs             gate
//   node tests/goal-board-gone.mjs --selftest  mutation proof (clean arm + one
//                                              plant per rule + 2 controls)
//
// W0 (coherence audit #5, Tyler: "do it all"): Hearthrise had two daily lists.
// The daily/weekly goals board counted in the browser (a client baseline over
// G.stats, a client gold watermark, a client level-up counter) and the server
// could not verify it; it is cut, client and server
// (supabase/migrations/2026-10-16-goal-board-retire.sql). The server-paid daily
// quests are the one list (src/features/daily-quests.js), read from the
// server's tally.
//   GB-1  no shipped client code names the board: its pools, getters, claim,
//         transport verbs, RPCs, baselines or the client counters it fed
//   GB-2  the residue no longer carries the board's slates or gold watermark
//   GB-3  the chain retires the board: the retire file is in the apply order
//         after the file that made it, drops both RPCs, both bodies and the
//         catalogue, and no later file re-creates any of them
//   GB-4  the one daily list reads the server's tally, never a task's
//         browser-counted `progress`
// Pure text, no database, milliseconds.
//
// Exit: 0 green · 1 red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize, relative } from 'node:path';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const RETIRE = '2026-10-16-goal-board-retire.sql';
const CREATOR = '2026-08-23-modal-goal-claims.sql';

/* What the board WAS, by name. A name here reappearing in shipped code is the
   board coming back, whatever it is called around it. */
const BOARD_NAMES = [
  'DAILY_GOAL_POOL', 'WEEKLY_GOAL_POOL', 'DAILY_REWARDS', 'getGoalsForToday', 'getWeeklyGoals',
  'claimQuestReward', 'claimGoal', 'goalState(', 'hr_claim_goal', 'hr_goal_state', 'hr_goal_rewards',
  'HearthriseGoalState', '__hrSyncServerGoals', 'renderDailyGoals', 'readSource', '_dailyGoldDelta',
  'dailyGoldStart', 'dailyGoals', 'weeklyGoals', 'stats.levelups',
];
const RESIDUE_GONE = ['dailyGoals', 'weeklyGoals', 'dailyGoldStart'];

const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
const stripSql = (s) => s.replace(/--[^\n]*/g, '');

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.js$/.test(n)) out.push(p);
  }
  return out;
}

/** Pure. Returns [{id, msg}] — empty is green. */
export function check(d) {
  const problems = [];
  const add = (id, msg) => problems.push({ id, msg });

  for (const [file, text] of d.client) {
    const code = stripJs(text);
    for (const name of BOARD_NAMES) {
      if (code.includes(name)) add('GB-1', `${file} names ${name} — the goals board is cut`);
    }
  }

  const m = /RESIDUE_FIELDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/.exec(d.clientState);
  if (!m) add('GB-2', 'RESIDUE_FIELDS literal not found in src/net/client-state.js');
  else {
    const names = [...stripJs(m[1]).matchAll(/'([^']+)'/g)].map((x) => x[1]);
    for (const f of RESIDUE_GONE) if (names.includes(f)) add('GB-2', `RESIDUE_FIELDS still carries ${f}`);
  }

  const at = d.order.indexOf(RETIRE), made = d.order.indexOf(CREATOR);
  if (at < 0) add('GB-3', `${RETIRE} is not in tests/schema-apply-order.json order`);
  else if (made < 0 || made > at) add('GB-3', `${RETIRE} does not run after ${CREATOR}`);
  const retire = stripSql(d.sql.get(RETIRE) || '');
  for (const want of [
    /drop function if exists public\.hr_claim_goal\(text, boolean, int, uuid\)/,
    /drop function if exists public\.hr_claim_goal__ungated\(text, boolean, int, uuid\)/,
    /drop function if exists public\.hr_goal_state\(int\)/,
    /drop function if exists public\.hr_goal_state__ungated\(int\)/,
    /drop table if exists public\.hr_goal_rewards/,
  ]) if (!want.test(retire)) add('GB-3', `${RETIRE} does not ${want.source.replace(/\\/g, '')}`);
  if (at >= 0) {
    for (const f of d.order.slice(at + 1)) {
      const s = stripSql(d.sql.get(f) || '');
      if (/create\s+(or\s+replace\s+)?function\s+public\.(hr_claim_goal|hr_goal_state)\b/i.test(s)
          || /create\s+table\s+(if\s+not\s+exists\s+)?public\.hr_goal_rewards\b/i.test(s)) {
        add('GB-3', `${f} re-creates a goals-board object after ${RETIRE}`);
      }
    }
  }

  const list = stripJs(d.dailyList);
  if (!list.includes('tallyState(') || !list.includes('HearthriseTally')) {
    add('GB-4', 'src/features/daily-quests.js does not read the server tally');
  }
  if (/\b(task|t|q)\.progress\b/.test(list)) {
    add('GB-4', 'src/features/daily-quests.js reads a task\'s browser-counted .progress');
  }
  return problems;
}

function loadReal() {
  const client = [];
  for (const p of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, p).replace(/\\/g, '/');
    if (rel.startsWith('src/features/smoke/') || rel === 'src/features/smoke-test.js') continue;
    client.push([rel, readFileSync(p, 'utf8')]);
  }
  const manifest = JSON.parse(read('tests/schema-apply-order.json'));
  const order = [...(manifest.pre_schema || []), ...manifest.order];
  const sql = new Map();
  for (const f of order) { try { sql.set(f, read(`supabase/migrations/${f}`)); } catch (e) { /* drift is schema-replay's */ } }
  return {
    client, order, sql,
    clientState: read('src/net/client-state.js'),
    dailyList: read('src/features/daily-quests.js'),
  };
}

function run() {
  const d = loadReal();
  const problems = check(d);
  if (problems.length) {
    console.error(`  ✗ goal-board-gone: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`      ${p.id}  ${p.msg}`);
    return 1;
  }
  console.log(`✓ goal-board-gone: ${d.client.length} client files name none of the board's ${BOARD_NAMES.length} parts, `
    + `the residue carries none of its fields, ${RETIRE} retires it at the chain end, and the one daily list `
    + 'reads the server tally');
  return 0;
}

function fixture() {
  return {
    client: [['src/features/x.js', "// readSource was here\nvar a = window.HearthriseTally;\n"]],
    order: [CREATOR, 'mid.sql', RETIRE],
    sql: new Map([[CREATOR, 'create table if not exists public.hr_goal_rewards ();'], ['mid.sql', 'select 1;'],
      [RETIRE, ['drop function if exists public.hr_claim_goal(text, boolean, int, uuid);',
        'drop function if exists public.hr_claim_goal__ungated(text, boolean, int, uuid);',
        'drop function if exists public.hr_goal_state(int);',
        'drop function if exists public.hr_goal_state__ungated(int);',
        'drop table if exists public.hr_goal_rewards;'].join('\n')]]),
    clientState: "export const RESIDUE_FIELDS = Object.freeze([\n  'daily', // the shown sheet\n  'dailyReward',\n]);",
    dailyList: 'var t = window.HearthriseTally; GC.tallyState(); var n = serverCount(task);',
  };
}

function selftest() {
  let bad = 0;
  const say = (ok, label) => { if (!ok) bad++; console.log(`  ${ok ? 'ok   ' : 'WRONG'}  ${label}`); };
  const clean = check(fixture());
  say(clean.length === 0, `clean arm: 0 problems${clean.length ? ' → ' + clean.map((p) => p.id + ' ' + p.msg).join('; ') : ''}`);
  const arms = [
    ['a client file calls getGoalsForToday()', 'GB-1', (f) => { f.client[0][1] += 'getGoalsForToday();\n'; }],
    ['a client counter G.stats.levelups++', 'GB-1', (f) => { f.client[0][1] += 'G.stats.levelups = (G.stats.levelups||0)+1;\n'; }],
    ['the transport grows claimGoal again', 'GB-1', (f) => { f.client[0][1] += "claimGoal: function(){ return call('hr_claim_goal'); }\n"; }],
    ["RESIDUE_FIELDS carries 'dailyGoals'", 'GB-2', (f) => { f.clientState = f.clientState.replace("'dailyReward',", "'dailyReward',\n  'dailyGoals',"); }],
    ['the retire file is out of the order', 'GB-3', (f) => { f.order = f.order.filter((x) => x !== RETIRE); }],
    ['the retire file keeps the catalogue', 'GB-3', (f) => { f.sql.set(RETIRE, f.sql.get(RETIRE).replace('drop table if exists public.hr_goal_rewards;', '')); }],
    ['a later file re-creates hr_claim_goal', 'GB-3', (f) => { f.order.push('later.sql'); f.sql.set('later.sql', 'create or replace function public.hr_claim_goal() returns void language sql as $$ select $$;'); }],
    ['the list reads task.progress', 'GB-4', (f) => { f.dailyList += 'var shown = task.progress;'; }],
    ['the list stops reading the tally', 'GB-4', (f) => { f.dailyList = 'var n = 0;'; }],
  ];
  for (const [label, want, mutate] of arms) {
    const f = fixture(); mutate(f);
    const ids = new Set(check(f).map((p) => p.id));
    say(ids.has(want), `${label} → ${want}${ids.has(want) ? '' : ' (got ' + [...ids] + ')'}`);
  }
  const controls = [
    ['a comment naming hr_goal_state', (f) => { f.client[0][1] += '/* the retired hr_goal_state */\n// claimQuestReward is gone\n'; }],
    ['a SQL comment in a later file', (f) => { f.order.push('later.sql'); f.sql.set('later.sql', '-- create or replace function public.hr_claim_goal is retired\nselect 1;'); }],
  ];
  for (const [label, mutate] of controls) {
    const f = fixture(); mutate(f);
    const got = check(f);
    say(got.length === 0, `control: ${label} stays green${got.length ? ' (got ' + got.map((p) => p.id) + ')' : ''}`);
  }
  console.log(bad ? `✗ goal-board-gone --selftest: ${bad} arm(s) wrong`
    : `✓ goal-board-gone --selftest: clean arm green, ${arms.length}/${arms.length} plants caught, ${controls.length} controls green`);
  return bad ? 1 : 0;
}

try {
  process.exit(process.argv.includes('--selftest') ? selftest() : run());
} catch (e) {
  console.error(`  ✗ goal-board-gone harness error: ${e && e.stack || e}`);
  process.exit(2);
}
