#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/daily-board.mjs — ONE DAILY BOARD, FEWER TRACKERS (lane daily-board)
//
//   node tests/daily-board.mjs             gate
//   node tests/daily-board.mjs --selftest  mutation proof (one plant per rule)
//
//   DB-1  src/data/progress-surfaces.js rules every tracker once, with a legal
//         decision; a HIDE row names a server reveal; Home's first hour carries
//         at most FIRST_HOUR_CAP surfaces.
//   DB-2  surfaceShown: unknown number or id hides, FOLD hides, a reached
//         reveal shows (the pure reader, executed).
//   DB-3  Home draws the daily board from HearthriseDailyBoard, no task slate,
//         no week card, and Standings / Hunter's Ledger only through surfaceOn.
//   DB-4  Deeds live in the Collection Log: openAchievements opens its Deeds tab
//         and no second Deeds sheet is built.
//   DB-5  the staged board migration: §4 self-check present, the not_offered
//         gate anchored after wrong_period, no begin/commit, and the apply order
//         puts the board BEFORE the task retirement.
// Text and pure imports only; milliseconds. Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';
import { PROGRESS_SURFACES, FIRST_HOUR_CAP } from '../src/data/progress-surfaces.js';
import { surfaceShown } from '../src/features/progress-surfaces.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

export const TRACKERS = ['daily_board', 'daily_tasks', 'weekly_goals', 'this_week', 'deeds', 'journeymans_road',
  'collection', 'charms', 'hunters_ledger', 'climb_marks', 'trophies', 'lifetime_tally', 'chronicle', 'standings',
  'boss_of_the_day', 'muster', 'daily_login', 'renown', 'first_day_chain'];

/** Pure. Returns [{id, msg}] — empty is green. */
export function check(d) {
  const out = [];
  const add = (id, msg) => out.push({ id, msg });

  const ids = d.rows.map((r) => r.id);
  if (new Set(ids).size !== ids.length) add('DB-1', 'a tracker is ruled twice');
  for (const t of TRACKERS) if (!ids.includes(t)) add('DB-1', `tracker ${t} has no ruling`);
  for (const r of d.rows) {
    if (!['KEEP', 'FOLD', 'HIDE'].includes(r.decision)) add('DB-1', `${r.id}: decision ${r.decision}`);
    if (r.decision === 'HIDE' && !(r.reveal && ['lifetime', 'totalLevel'].includes(r.reveal.kind) && r.reveal.at > 0)) {
      add('DB-1', `${r.id}: a HIDE row needs a server reveal`);
    }
    if (r.decision !== 'HIDE' && r.reveal) add('DB-1', `${r.id}: only a HIDE row reveals`);
  }
  const first = d.rows.filter((r) => r.home);
  if (first.length > d.cap) add('DB-1', `${first.length} first-hour Home surfaces, cap ${d.cap}`);
  if (first.some((r) => r.decision !== 'KEEP')) add('DB-1', 'a first-hour surface is folded or hidden');

  const rd = (life, total) => ({ lifetime: () => life, totalLevel: () => total });
  const cases = [
    ['hunters_ledger', rd(null, null), false], ['hunters_ledger', rd(99, null), false],
    ['hunters_ledger', rd(100, null), true], ['standings', rd(null, 99), false], ['standings', rd(null, 100), true],
    ['this_week', rd(1e9, 1e9), false], ['renown', rd(null, null), true], ['no_such_surface', rd(1e9, 1e9), false],
  ];
  for (const [id, r, want] of cases) {
    let got;
    try { got = d.shown(id, r); } catch (e) { got = 'threw'; }
    if (got !== want) add('DB-2', `surfaceShown(${id}) answered ${got}, want ${want}`);
  }

  const home = stripJs(d.home);
  if (!/HearthriseDailyBoard/.test(home) || /daily\.tasks/.test(home)) add('DB-3', 'Home does not draw the board, or still reads a task slate');
  if (/HearthriseThisWeek[^\n]*\.card\(/.test(home)) add('DB-3', 'Home draws the week card');
  if (!/surfaceOn\('standings'\) && ST/.test(home) || !/surfaceOn\('hunters_ledger'\) && HL/.test(home)) {
    add('DB-3', 'Standings or the Hunter\'s Ledger is drawn on Home without its reveal');
  }

  const ach = stripJs(d.achievements);
  if (!/C\.open\('deeds'\)/.test(ach)) add('DB-4', 'openAchievements does not open the Collection Log Deeds tab');
  if (/ach-overlay/.test(ach)) add('DB-4', 'a second Deeds sheet is built');
  if (!/data-cl-tab="deeds"/.test(d.collection) || !/deedsListHtml/.test(d.collection)) add('DB-4', 'the Collection Log has no Deeds tab');

  const m = d.board;
  if (!/do \$\$[\s\S]*GATE\(d\)[\s\S]*HR819/.test(m)) add('DB-5', 'the board migration carries no executed §4 self-check');
  if (!/wrong_period[\s\S]{0,400}2026-10-11-daily-board\.sql: only the goals on today/.test(m)) add('DB-5', 'the not_offered gate is not anchored after wrong_period');
  if (/^\s*(begin|commit)\s*;/im.test(m.replace(/--[^\n]*/g, ''))) add('DB-5', 'a begin/commit in the migration');
  const o = d.order;
  if (!(o.indexOf('2026-10-11-daily-board.sql') >= 0 && o.indexOf('2026-10-11-daily-board.sql') < o.indexOf('2026-10-12-retire-daily-tasks.sql'))) {
    add('DB-5', 'the apply order does not put the board before the task retirement');
  }
  return out;
}

function real() {
  return {
    rows: PROGRESS_SURFACES, cap: FIRST_HOUR_CAP, shown: surfaceShown,
    home: read('src/features/home-dashboard.js'),
    achievements: read('src/render/achievements.js'),
    collection: read('src/features/collection-log.js'),
    board: read('supabase/migrations/2026-10-11-daily-board.sql'),
    order: JSON.parse(read('tests/schema-apply-order.json')).order,
  };
}

function selftest() {
  let bad = 0;
  const say = (ok, label) => { if (!ok) bad++; console.log(`  ${ok ? 'ok   ' : 'WRONG'}  ${label}`); };
  const clean = check(real());
  say(clean.length === 0, `clean arm: 0 problems${clean.length ? ' → ' + clean.map((p) => p.id + ' ' + p.msg).join('; ') : ''}`);
  const arms = [
    ['a sixth first-hour surface', 'DB-1', (f) => { f.rows = f.rows.map((r) => (r.id === 'charms' ? { ...r, home: true } : r)); }],
    ['standings loses its reveal', 'DB-1', (f) => { f.rows = f.rows.map((r) => (r.id === 'standings' ? { ...r, reveal: null } : r)); }],
    ['a tracker unruled', 'DB-1', (f) => { f.rows = f.rows.filter((r) => r.id !== 'muster'); }],
    ['an unknown count reveals', 'DB-2', (f) => { const s = f.shown; f.shown = (id, r) => (id === 'hunters_ledger' ? true : s(id, r)); }],
    ['Home draws the week card', 'DB-3', (f) => { f.home += "\nhtml += window.HearthriseThisWeek.card();\n"; }],
    ['Standings drawn unconditionally', 'DB-3', (f) => { f.home = f.home.replace("surfaceOn('standings') && ST", 'ST'); }],
    ['Deeds back in their own sheet', 'DB-4', (f) => { f.achievements += "\nov.className = 'ach-overlay';\n"; }],
    ['the claim gate dropped', 'DB-5', (f) => { f.board = f.board.replace("2026-10-11-daily-board.sql: only the goals on today", 'x'); }],
    ['retirement ordered first', 'DB-5', (f) => { f.order = f.order.filter((x) => x !== '2026-10-11-daily-board.sql').concat('2026-10-11-daily-board.sql'); }],
  ];
  for (const [label, want, mutate] of arms) {
    const f = real(); mutate(f);
    const ids = new Set(check(f).map((p) => p.id));
    say(ids.has(want), `${label} → ${want}${ids.has(want) ? '' : ' (got ' + [...ids] + ')'}`);
  }
  console.log(bad ? `✗ daily-board --selftest: ${bad} arm(s) wrong` : `✓ daily-board --selftest: clean arm green, ${arms.length}/${arms.length} plants caught`);
  return bad ? 1 : 0;
}

function run() {
  const p = check(real());
  if (p.length) {
    console.error(`  ✗ daily-board: ${p.length} problem(s)`);
    for (const x of p) console.error(`      ${x.id}  ${x.msg}`);
    return 1;
  }
  console.log(`✓ daily-board: ${PROGRESS_SURFACES.length} trackers ruled, ${PROGRESS_SURFACES.filter((r) => r.home).length}/${FIRST_HOUR_CAP} first-hour surfaces, reveals fail closed, deeds folded, migration ordered`);
  return 0;
}

try { process.exit(process.argv.includes('--selftest') ? selftest() : run()); }
catch (e) { console.error(`  ✗ daily-board harness error: ${e && e.stack || e}`); process.exit(2); }
