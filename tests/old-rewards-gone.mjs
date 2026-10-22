#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// tests/old-rewards-gone.mjs — THE OLD-CLIENT REWARDS STAY CUT
//
//   node tests/old-rewards-gone.mjs             the guard
//   node tests/old-rewards-gone.mjs --selftest  every planted defect must turn it red
//
// Tyler, 2026-10-22 ("do it all"; "we were supposed to delete all that"): every
// old-client reward table the rebuilt client cannot claim is CUT — the quests,
// the collection milestones, the renown rank claims, the daily/weekly goals, the
// old seven-day login cycle — and so is the Fox Companion with its equip slot.
// Rewards come back only as a deliberate new design, never by a revived row.
// supabase/migrations/2026-12-02-old-rewards-cut.sql drops the server half and
// proves it by execution in its §4; this guard is what keeps it all gone. It
// replaces quest-reward-parity, goal-catalogue-drift, quest-xp-absence-pay,
// collection-renown-claim-drift, login-reward-off, goal-counter-kinds and the
// quest half of goal-counters, which each bound a catalogue (or guarded a
// payout door) that no longer exists.
//
//   OR-1  no CODE under src/**, supabase/functions/**, index.html or play.html
//         names a cut catalogue, helper or RPC (comments are not code; string
//         literals are, because an RPC name travels as a string)
//   OR-2  the three cut data files stay deleted
//   OR-3  the companion equip slot and the Fox Companion stay out of the data
//         (EQUIP_SLOTS, EQUIP_SLOT_META, ITEMS: no 'companion' slot or type, no
//         fox_companion row)
//   OR-4  AT THE CHAIN END each cut function, table and client-baseline row is
//         DROPPED: walking tests/schema-apply-order.json in order, the last SQL
//         event that touches it is a drop/delete, never a create/insert. A later
//         migration that restates hr_claim_quest, or re-adds its baseline row,
//         is red here before it is ever applied.
//
// THE SECOND CUT (lane c-cuts-1022b, 2026-12-03-daily-claims-cut.sql): the engine's
// kind='daily' counters (nothing reads them since the daily goals left), and the
// old-client raid_claim / world_event_claim / clan_board_claim doors.
//   OR-5  no ENGINE code (src/core/**, supabase/functions/**) proposes a
//         kind:'daily' progress op — the premium login's clamp is the server's own
//   OR-6  AT THE CHAIN END the last body of hr_farm_harvest and hr_farm_plant
//         writes no kind 'daily' row (comments are not code)
// (The companion pets and the premium daily login were KEPT by Tyler the same
//  day, as bases for later: nothing here guards them out.)
//
// Pure text + two data imports, no database, no network. Exit: 0 green · 1 red · 2 harness.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripComments } from './demolition-absence.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

/* ── What was cut ───────────────────────────────────────────────────────── */
export const NAMES = [
  // src/data/goal-catalogue.js (quests)
  'QUEST_REWARDS', 'STATE_GOAL_TYPES', 'questRewardItems', 'questItemsAreServerCredited', 'questRewardXp',
  'questXpIsServerCredited', 'goalRewardIds',
  // src/data/collection-milestones.js
  'COLLECTION_MILESTONES',
  // src/data/rewards.js (the old login cycle and its claim registry)
  'DAILY_LOGIN_CYCLE', 'DAILY_LOGIN_WEEK_BONUS', 'DAILY_LOGIN_MAX_WEEK_MULT', 'DAILY_LOGIN_STREAK_CAP',
  'priceDailyLogin', 'deriveLoginStreak', 'loginBonusDue', 'loginClaimIsStraight', 'CLAIMABLES', 'claimableFor',
  // the fox
  'fox_companion',
  // the engine's daily counters (hr-accrue goal-period.js and the fx seam that fed them)
  'modalGoalOps', 'updateDaily',
];
/* The server half: every function and table 2026-12-02-old-rewards-cut.sql drops. */
export const CUT_FUNCTIONS = [
  'hr_claim_quest', 'hr_claim_quest__ungated', 'hr_quest_rewards_items_ok',
  'hr_claim_milestone', 'hr_claim_milestone__ungated',
  'hr_claim_rank', 'hr_claim_rank__ungated',
  'hr_claim_daily', 'hr_claim_daily__ungated', 'hr_tally_state', 'hr_daily_task_set', 'hr_daily_task_set_for',
  'hr_daily_task_set_caps', 'hr_daily_task_eligible', 'hr_goal_daily_seed', 'hr_daily_harvest_ready',
  'hr_daily_harvest_rule', 'hr_goal_period_start', 'hr_iso_week_key',
  'hr_claim_lookup', 'hr_login_bonus_ready', 'hr_login_streak', 'hr_claim_last', 'hr_login_price', 'hr_login_catalogue',
  // the goal board, dropped by 2026-10-16-goal-board-retire.sql (goal-counter-kinds guarded its lifetime-counter
  // hazard while hr_claim_goal and hr_claim_quest could pay; with both doors cut, their revival is what is guarded)
  'hr_claim_goal', 'hr_claim_goal__ungated', 'hr_goal_state', 'hr_goal_state__ungated',
  // the second cut (2026-12-03-daily-claims-cut.sql)
  'raid_claim', 'raid_claim__ungated', 'world_event_claim', 'world_event_claim__ungated',
  'clan_board_claim', 'clan_board_claim__ungated',
];
export const CUT_TABLES = ['hr_quest_rewards', 'hr_hunt_loot_roster', 'hr_goal_rewards', 'raid_claims'];
/* Cut before it ever shipped (the milestones' loot roster, staged and withdrawn the same day): no file may make it. */
export const NEVER_SHIPPED = ['table:hr_hunt_loot_roster'];
/* The client RPCs: the old client called them by name, so no code may name them either. */
export const CUT_RPCS = ['hr_claim_quest', 'hr_claim_milestone', 'hr_claim_rank', 'hr_claim_daily', 'hr_tally_state',
  'raid_claim', 'world_event_claim', 'clan_board_claim'];
export const DELETED_FILES = ['src/data/goal-catalogue.js', 'src/data/collection-milestones.js', 'src/data/rewards.js',
  'supabase/functions/hr-accrue/goal-period.js'];
/* OR-6: the daily writers 2026-12-03-daily-claims-cut.sql restated whole. */
export const CLEAN_READERS = ['hr_farm_harvest', 'hr_farm_plant'];
const ENGINE_DIRS = ['src/core/', 'supabase/functions/'];
const DAILY_OP = /\bkind\s*:\s*(['"`])daily\1/;

/** The body of the LAST create of public.<name>( in one SQL text, or null. */
export function lastBody(sql, name) {
  const code = sql.replace(/\r\n/g, '\n');
  const re = new RegExp('create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.' + name + '\\s*\\(', 'gi');
  let at = -1;
  for (let m; (m = re.exec(code));) at = m.index;
  if (at < 0) return null;
  const as = /\bas\s+(\$[a-z_]*\$)/i.exec(code.slice(at));
  if (!as) return null;
  const from = at + as.index + as[0].length;
  const to = code.indexOf(as[1], from);
  return to < 0 ? null : code.slice(from, to);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (nm) => new RegExp('(^|[^\\w$])' + esc(nm) + '(?![\\w$])');

/* ── SQL: the last event per object, in apply order ─────────────────────── */
const sqlCode = (t) => t.replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '');
/** Statements of one file (a rough split on `;` outside dollar quotes is not needed:
    every event below is matched by a regex anchored on its own keywords). */
export function eventsOf(sql) {
  const code = sqlCode(sql), ev = [];
  const fnRe = /\b(create\s+(?:or\s+replace\s+)?function|drop\s+function\s+(?:if\s+exists\s+)?)\s*(?:public\.)?([a-z0-9_]+)\s*\(/gi;
  for (let m; (m = fnRe.exec(code));) ev.push({ at: m.index, kind: 'fn', name: m[2].toLowerCase(), op: /^create/i.test(m[1]) ? 'make' : 'drop' });
  const tbRe = /\b(create\s+table\s+(?:if\s+not\s+exists\s+)?|drop\s+table\s+(?:if\s+exists\s+)?)(?:public\.)?([a-z0-9_]+)/gi;
  for (let m; (m = tbRe.exec(code));) ev.push({ at: m.index, kind: 'table', name: m[2].toLowerCase(), op: /^create/i.test(m[1]) ? 'make' : 'drop' });
  const blRe = /\b(insert\s+into|delete\s+from)\s+(?:public\.)?hr_client_rpc_baseline\b([^;]*)/gi;
  for (let m; (m = blRe.exec(code));) {
    for (const rpc of CUT_RPCS) if (new RegExp("'" + rpc + "'").test(m[2])) ev.push({ at: m.index, kind: 'baseline', name: rpc, op: /^insert/i.test(m[1]) ? 'make' : 'drop' });
  }
  return ev.sort((a, b) => a.at - b.at);
}

function walkCode(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSafe(dir)) {
    if (e.name === 'node_modules' || e.name === 'vendor') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkCode(p, out);
    else if (/\.(m?js|ts|html)$/.test(e.name)) out.push(p);
  }
  return out;
}
import { readdirSync } from 'node:fs';
function readdirSafe(dir) { return readdirSync(dir, { withFileTypes: true }); }

export async function loadWorld() {
  const files = new Map();
  for (const p of [...walkCode(join(ROOT, 'src')), ...walkCode(join(ROOT, 'supabase', 'functions')), join(ROOT, 'index.html'), join(ROOT, 'play.html')]) {
    if (existsSync(p)) files.set(p.slice(ROOT.length + 1).replace(/\\/g, '/'), readFileSync(p, 'utf8'));
  }
  const exists = new Set(DELETED_FILES.filter((f) => existsSync(join(ROOT, f))));
  const order = JSON.parse(readFileSync(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  const sql = order.map((f) => [f, readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8')]);
  const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src', 'data', 'items.js')).href);
  const { EQUIP_SLOTS, EQUIP_SLOT_META } = await import(pathToFileURL(join(ROOT, 'src', 'data', 'gathering.js')).href);
  return { files, exists, sql, items: { ...ITEMS }, slots: [...EQUIP_SLOTS], slotMeta: { ...EQUIP_SLOT_META } };
}

/** Pure. Returns [{id, msg}] — empty is green. */
export function check(w) {
  const problems = [];
  const add = (id, msg) => problems.push({ id, msg });
  for (const [file, text] of w.files) {
    const code = file.endsWith('.html') ? text.replace(/<!--[\s\S]*?-->/g, '') : stripComments(text);
    for (const nm of NAMES.concat(CUT_RPCS)) if (word(nm).test(code)) add('OR-1', `${file} names the cut ${nm} — that reward is gone; a new reward is a new design, not a revived row`);
  }
  for (const f of w.exists) add('OR-2', `${f} is a cut data file and exists again`);
  if (w.slots.includes('companion')) add('OR-3', "EQUIP_SLOTS has the cut 'companion' slot again");
  if (Object.prototype.hasOwnProperty.call(w.slotMeta, 'companion')) add('OR-3', "EQUIP_SLOT_META describes the cut 'companion' slot again");
  for (const [id, it] of Object.entries(w.items)) {
    if (id === 'fox_companion') add('OR-3', 'ITEMS has the cut fox_companion row again');
    else if (it && (it.type === 'companion' || it.slot === 'companion')) add('OR-3', `ITEMS.${id} wears in the cut companion slot`);
  }
  const last = new Map();
  for (const [file, text] of w.sql) for (const e of eventsOf(text)) last.set(e.kind + ':' + e.name, { ...e, file });
  const want = [...CUT_FUNCTIONS.map((n) => 'fn:' + n), ...CUT_TABLES.map((n) => 'table:' + n), ...CUT_RPCS.map((n) => 'baseline:' + n)];
  for (const k of want) {
    const e = last.get(k);
    if (!e) { if (!NEVER_SHIPPED.includes(k)) add('OR-4', `no migration in the apply order ever touches ${k} — the guard's list is stale`); continue; }
    if (e.op !== 'drop') add('OR-4', `${e.file} is the last file to touch ${k}, and it ${e.kind === 'baseline' ? 'inserts the client baseline row' : 'creates it'} — the cut must be the last word`);
  }
  for (const [file, text] of w.files) {
    if (!ENGINE_DIRS.some((d) => file.startsWith(d))) continue;
    if (DAILY_OP.test(stripComments(text))) add('OR-5', `${file} proposes a kind:'daily' progress op — the daily counters were cut (nothing reads them)`);
  }
  for (const name of CLEAN_READERS) {
    let body = null, from = null;
    for (const [file, text] of w.sql) { const b = lastBody(text, name); if (b !== null) { body = b; from = file; } }
    if (body === null) { add('OR-6', `no migration creates ${name} — the guard's list is stale`); continue; }
    const code = body.replace(/--[^\n]*/g, '');
    if (/'daily'/.test(code)) add('OR-6', `${from} leaves ${name} naming kind 'daily' — the daily counters were cut`);
  }
  return problems;
}

function clone(w) { return { files: new Map(w.files), exists: new Set(w.exists), sql: w.sql.map(([f, t]) => [f, t]), items: { ...w.items }, slots: [...w.slots], slotMeta: { ...w.slotMeta } }; }

function selftest(w) {
  let bad = 0;
  const say = (ok, label) => { if (!ok) bad++; console.log(`  ${ok ? 'ok   ' : 'WRONG'}  ${label}`); };
  const clean = check(w);
  say(clean.length === 0, 'clean arm is green' + (clean.length ? ' → ' + clean.map((p) => p.id + ' ' + p.msg).join(' | ') : ''));
  const later = (x, body) => x.sql.push(['2099-01-01-revival.sql', body]);
  const cutFile = (x, fn) => { const i = x.sql.findIndex(([f]) => f === '2026-12-02-old-rewards-cut.sql'); x.sql[i] = [x.sql[i][0], fn(x.sql[i][1])]; };
  const cut2 = (x, fn) => { const i = x.sql.findIndex(([f]) => f === '2026-12-03-daily-claims-cut.sql'); const b = x.sql[i][1]; const a = fn(b); if (a === b) throw new Error('cut2 plant did not change the file'); x.sql[i] = [x.sql[i][0], a]; };
  const arms = [
    ['the quest catalogue comes back in the data (QUEST_REWARDS)', 'OR-1', (x) => { x.files.set('src/data/quests.js', 'export const QUEST_REWARDS = {};\n'); }],
    ['a screen calls the milestone claim again', 'OR-1', (x) => { x.files.set('src/shell/x.js', "rpc('hr_claim_milestone', { p_slot: 0 });\n"); }],
    ['the login cycle is priced on the client again', 'OR-1', (x) => { x.files.set('src/session/y.js', 'const p = priceDailyLogin(3);\n'); }],
    ['src/data/rewards.js is restored', 'OR-2', (x) => { x.exists.add('src/data/rewards.js'); }],
    ['the fox row returns to ITEMS', 'OR-3', (x) => { x.items.fox_companion = { n: 'Fox Companion', type: 'companion', slot: 'companion' }; }],
    ['another item wears in a companion slot', 'OR-3', (x) => { x.items.__pet = { n: 'Pet', type: 'companion', slot: 'companion' }; }],
    ["EQUIP_SLOTS grows the 'companion' slot back", 'OR-3', (x) => { x.slots.push('companion'); }],
    ['a later migration restates hr_claim_quest', 'OR-4', (x) => { later(x, 'create or replace function public.hr_claim_quest(p_quest_id text, p_slot int)\nreturns jsonb language sql as $$ select null::jsonb $$;\n'); }],
    ['a later migration re-adds hr_claim_daily to the client baseline', 'OR-4', (x) => { later(x, "insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values\n  ('hr_claim_daily', 'p_task_id text, p_slot integer', 'authenticated', 'back');\n"); }],
    ['a later migration recreates the quest reward table', 'OR-4', (x) => { later(x, 'create table if not exists public.hr_quest_rewards (quest_id text primary key);\n'); }],
    ['a later migration ships the withdrawn loot roster', 'OR-4', (x) => { later(x, 'create table if not exists public.hr_hunt_loot_roster (item_id text primary key);\n'); }],
    ['the cut file forgets the rank claim', 'OR-4', (x) => { cutFile(x, (t) => t.replace('drop function if exists public.hr_claim_rank(text, integer);\n', '')); }],
    ['the cut file keeps the tally read in the baseline', 'OR-4', (x) => { cutFile(x, (t) => t.replace(", 'hr_tally_state');", ');')); }],
    // the second cut
    ['a later migration re-adds raid_claim to the client baseline', 'OR-4', (x) => { later(x, "insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values\n  ('raid_claim', 'p_scope text', 'authenticated', 'back');\n"); }],
    ['the second cut file forgets world_event_claim__ungated', 'OR-4', (x) => { cut2(x, (t) => t.replace('drop function if exists public.world_event_claim__ungated(text, integer);\n', '')); }],
    ['the engine proposes a kind:daily op again', 'OR-5', (x) => { x.files.set('supabase/functions/hr-accrue/accrual.js', (x.files.get('supabase/functions/hr-accrue/accrual.js') || '') + "\nprogress.push({ kind: 'daily', key: 'ev:kill_any', period: day, add: 1 });\n"); }],
    ['a later migration restates hr_farm_plant writing a daily row', 'OR-6', (x) => { later(x, "create or replace function public.hr_farm_plant(p_slot int, p_plot_idx int, p_crop text, p_idem uuid)\nreturns jsonb language plpgsql as $$ begin insert into public.player_progress (kind) values ('daily'); return null; end $$;\n"); }],
    ['the second cut file keeps the daily harvest row', 'OR-6', (x) => { cut2(x, (s) => s.replace("values (v_uid, p_slot, 'stat', 'ev:harvest'", "values (v_uid, p_slot, 'daily', 'ev:harvest'")); }],
  ];
  for (const [label, want, plant] of arms) {
    const x = clone(w); plant(x);
    const ids = new Set(check(x).map((p) => p.id));
    say(ids.has(want), `${label} → ${want}${ids.has(want) ? '' : ' (got ' + [...ids].join(',') + ')'}`);
  }
  const controls = [
    ['a JS comment naming hr_claim_quest and QUEST_REWARDS', (x) => { x.files.set('src/data/z.js', '// hr_claim_quest and QUEST_REWARDS were cut on 2026-10-22\nexport const z = 1;\n'); }],
    ['a SQL comment that says create function hr_claim_quest(', (x) => { later(x, '-- create or replace function public.hr_claim_quest( was the old body\nselect 1;\n'); }],
    ['a longer identifier (hr_claim_quest_log)', (x) => { x.files.set('src/data/z.js', 'export const hr_claim_quest_log = 1;\n'); }],
    ["a client (not engine) file naming kind: 'daily'", (x) => { x.files.set('src/shell/z.js', "export const row = { kind: 'daily' };\n"); }],
    ["an SQL comment in a clean reader naming kind 'daily'", (x) => { later(x, "create or replace function public.hr_farm_plant(p_slot int, p_plot_idx int, p_crop text, p_idem uuid)\nreturns jsonb language sql as $$\n-- the 'daily' plant row was cut\nselect null::jsonb $$;\n"); }],
  ];
  for (const [label, plant] of controls) {
    const x = clone(w); plant(x);
    const got = check(x);
    say(got.length === 0, `control: ${label} stays green${got.length ? ' (got ' + got.map((p) => p.id + ' ' + p.msg).join(' | ') + ')' : ''}`);
  }
  console.log(bad ? `✗ old-rewards-gone --selftest: ${bad} arm(s) wrong`
    : `✓ old-rewards-gone --selftest: clean arm green, ${arms.length}/${arms.length} plants caught, ${controls.length} controls green`);
  return bad ? 1 : 0;
}

try {
  const w = await loadWorld();
  if (process.argv.includes('--selftest')) process.exit(selftest(w));
  const problems = check(w);
  if (problems.length) {
    console.error(`✗ old-rewards-gone: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`    ${p.id}  ${p.msg}`);
    process.exit(1);
  }
  console.log(`✓ old-rewards-gone: ${w.files.size} files name none of the ${NAMES.length + CUT_RPCS.length} cut names; `
    + `${DELETED_FILES.length} files stay deleted; no companion slot or fox; ${CUT_FUNCTIONS.length} functions, `
    + `${CUT_TABLES.length} tables and ${CUT_RPCS.length} baseline rows end the ${w.sql.length}-file chain dropped; `
    + `the engine proposes no daily op; ${CLEAN_READERS.length} restated farm writers write no daily row`);
} catch (e) {
  console.error(`✗ old-rewards-gone harness error: ${e && e.stack || e}`);
  process.exit(2);
}
