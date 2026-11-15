#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/ledger-fold.mjs — THE LEDGER'S FOLD TIER, PROVEN BY RUNNING IT: EVERY FOLDED ROW'S VALUE IS IN A WINDOW, TO THE UNIT,
//   AND NOTHING THAT READS THE JOURNAL MOVES (supabase/migrations/2027-04-27-ledger-fold.sql, -arm.sql, -disarm.sql;
//   CLAUDE.md §1 "every shared-surface write is journalled", §6 "player_ledger journals every value movement").
//
//   node tests/ledger-fold.mjs              the guard
//   node tests/ledger-fold.mjs --mutate     every planted defect must turn its arm red   (--only=<id> for one)
//
// mutant-anchors: supabase/migrations/2027-04-27-ledger-fold.sql, supabase/migrations/2027-04-28-ledger-fold-arm.sql
//
// The fold is the one path that deletes player_ledger rows inside retention, so it is proved the way the 90-day prune is
// (tests/ledger-rollup.mjs): the whole chain replayed on a real PostgreSQL (PGlite), a ledger built, the jobs run EXACTLY as
// cron calls them, and the result read against figures this file works out itself, in JavaScript, from the rows as they
// stood before (never by the fold's own SQL), and against the hunt's own tally for rows the real engine wrote.
//
//   LF-ORDER     the install file is in `order`; the arm and the kill switch are STAGED in `excluded`, never replayed
//   LF-INERT     as installed the tier is OFF: the job's own command answers off and reads nothing
//   LF-ARM-REFUSED  the arm file refuses a ledger the model misses (under 900 in 1,000 fit), and leaves the tier off
//   LF-ARM       the arm file turns it on, records the dry run it read, and a second apply changes nothing
//   LF-DIAL      detail_days 2 is refused: a server reader looks back 48 hours
//   LF-DRY       the dry run answers inside a READ ONLY transaction (where the real fold is refused), names the same figures
//                the real run then produces, and moves no row; the Coordinator's screen prints them
//   LF-FOLD      the job's command, run until nothing waits: every run answers, in batches that end on a window boundary
//   LF-CONSERVE  per hero, kind, intent, hunt session and UTC day: rows, gold in and out, units, the day-budget columns, time,
//                kills by monster, items, skill XP and Level XP in the windows equal the folded rows', worked out here
//   LF-EXACT     the windows list exactly the rows that should fold, each once; those rows are gone; every other row is
//                byte for byte what it was (a death, a shop row, a row inside the days of detail)
//   LF-LEFT      a row whose meta carries a key the model lacks, or a typed column, keeps its detail and is counted
//   LF-WINDOWS   no window crosses its 15 minutes or its hero; a batch never splits one
//   LF-REAL      a hunt the real engine settled (tools/settle-cost.mjs, the tick's door): every row it journalled folds, and
//                the windows add up to the hunt's own tally (coins, kills, skill and Level XP, loot, supplies used)
//   LF-NOOP      a second fold moves nothing
//   LF-LOCKS     a ledger row inside retention with no window is refused deletion (a recent one, one the fold left); the
//                ledger and the windows are never updated or truncated; a window inside retention is never deleted; a
//                forged window is refused
//   LF-READERS   every server reader of the journal answers the same before and after the fold, for every hero; the hunt
//                tallies do not move; and the census of functions that read player_ledger is the pinned one
//   LF-REPORTS   tools/vitals.mjs's day table and tools/economy-watch.local.mjs's three reads (their own SQL, lifted) return
//                the same rows before and after; read WITHOUT the windows, the folded days go quiet (the control)
//   LF-OBSERVE   the fold's line (tools/lib/ledger-journal.mjs) reads OK only when on, fresh and nothing behind
//   LF-DRILL     every job that deletes journal rows fires on a minute ending in 7, and the restore drill's paged read of the
//                ledger (100 s), started after the wait it is told, never has one fire under it: tier on or off, any second
//   LF-PRUNE     past retain_days: fold then hr_ledger_windows_prune writes the rollup hr_ledger_prune writes from the same
//                rows left as detail, column for column; a second prune moves nothing
//   LF-KILL      the kill switch: the fold answers off, no window can be written, the windows stand; armed again it resumes
//   LF-TWICE     the install file applied again on the chain end, tier on and windows standing, applies and moves no body
//   LF-SELFCHECK (--mutate) the install file's own §6 refuses a defect at apply time
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay, manifest, ROOT, LAST_PATCHED } from './schema-replay.mjs';
import { journal, FOLD_STATE, foldLine, planSql, planLines, ledgerQuietWaitMin } from '../tools/lib/ledger-journal.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
/* one constant a statement: tests/mutant-anchors.mjs reads each mutant's `file` from these */
const FILE = '2027-04-27-ledger-fold.sql';
const ARM = '2027-04-28-ledger-fold-arm.sql';
const OFF = '2027-04-28-ledger-fold-disarm.sql';
const read = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const SRC = { file: read(FILE), arm: read(ARM), off: read(OFF) };
/* js: what a red arm prints, cut to 700 characters. full: what a comparison reads, never cut. */
const js = (v) => String(JSON.stringify(v === undefined ? null : v)).slice(0, 700);
const full = (v) => String(JSON.stringify(v === undefined ? null : v));
const harness = (m) => Object.assign(new Error(m), { harness: true });
const ISO = `'YYYY-MM-DD"T"HH24:MI:SS".000Z"'`;
const CRON_FOLD = 'select public.hr_ledger_fold(20000)';
const CRON_PRUNE = 'select public.hr_ledger_windows_prune(20000)';

/* Three accounts no migration knows, two heroes each; two more for the retention arm. */
const U = [1, 2, 3].map((n) => `000000f0-0000-4000-8000-00001edf000${n}`);
const P = '000000f0-0000-4000-8000-00001edf00a1', Q = '000000f0-0000-4000-8000-00001edf00a2';

// ── THE REPORTS' OWN SQL, LIFTED (a guard is its own anchor: if a tool's query moves, this throws, it does not pass) ──────
function liftReports() {
  const v = readFileSync(join(ROOT, 'tools', 'vitals.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const e = readFileSync(join(ROOT, 'tools', 'economy-watch.local.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const cut = (src, re, what) => { const m = re.exec(src); if (!m) throw harness(`cannot lift ${what}: the tool's text moved`); return m[1]; };
  const day = cut(v, /\nconst QUERY = \(hasWindows\) => `([\s\S]*?)`;\n/, 'tools/vitals.mjs QUERY');
  const FROM = cut(e, /\nconst FROM = "([^"\n]*)";\n/, 'economy-watch FROM');
  const NOT_GM = cut(e, /\nconst NOT_GM = '([^'\n]*)';\n/, 'economy-watch NOT_GM');
  const FAMILY_VERBS = JSON.parse(cut(e, /\nconst FAMILY_VERBS = Object\.freeze\((\[[^\]\n]*\])\);\n/, 'economy-watch FAMILY_VERBS').replace(/'/g, '"'));
  const tpl = (name) => cut(e, new RegExp('\\nconst ' + name + ' = \\(w\\) => `([\\s\\S]*?)`;\\n'), 'economy-watch ' + name);
  const build = (body, names) => new Function(...names, 'return `' + body + '`');
  const eco = (name) => { const f = build(tpl(name), ['journal', 'FROM', 'NOT_GM', 'FAMILY_VERBS', 'w']); return (w) => f(journal, FROM, NOT_GM, FAMILY_VERBS, w); };
  const d = build(day, ['journal', 'hasWindows']);
  return { vitals: (w) => d(journal, w), flows: eco('FLOWS'), heroes: eco('HEROES'), held: eco('HELD') };
}

// ── THE ORACLE: totals worked out HERE, from rows as JavaScript read them, by none of the fold's own functions ────────────
const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
function emptyTotal() {
  return { n: 0, gold_pos: 0, gold_neg: 0, qty_pos: 0, qty_neg: 0, xp_pos: 0, xp_neg: 0, gold_in: 0, xp_in: 0, qty_in: 0, gems_in: 0,
    ms: 0, ticks: 0, kills: 0, qty: 0, made: 0, burnt: 0, g: 0, lx: 0, bill: 0, taxed: 0, tax: 0, km: {}, i: {}, x: {}, items: {}, names: {} };
}
const addMap = (acc, m) => { for (const [k, v] of Object.entries(m || {})) acc[k] = (acc[k] || 0) + num(v && typeof v === 'object' ? v.qty : v); };
/* a ledger row (window = false) or a window (true) into a total; a window's meta is its rows' meta, summed, so the same reads serve */
function addTo(t, r, window) {
  const m = r.meta || {}, d = m.delta || {};
  if (window) {
    t.n += num(r.n);
    for (const c of ['gold_pos', 'gold_neg', 'qty_pos', 'qty_neg', 'xp_pos', 'xp_neg']) t[c] += num(r[c]);
  } else {
    t.n += 1;
    for (const c of ['gold', 'qty', 'xp']) { t[c + '_pos'] += Math.max(num(r[c]), 0); t[c + '_neg'] += Math.max(-num(r[c]), 0); }
  }
  for (const c of ['gold_in', 'xp_in', 'qty_in', 'gems_in']) t[c] += num(r[c]);
  for (const k of ['ms', 'ticks', 'kills', 'qty', 'made', 'burnt']) t[k] += num(m[k]);
  t.g += num(d.g); t.lx += num(d.lx); t.bill += num(m.gold);
  t.taxed += num(d.bt && d.bt.c); t.tax += num(d.bt && d.bt.g);
  addMap(t.km, m.km); addMap(t.i, d.i); addMap(t.x, d.x); addMap(t.items, m.items);
  /* delta.k: a row names its keys in an array, a window counts them */
  if (Array.isArray(d.k)) for (const k of d.k) t.names[k] = (t.names[k] || 0) + 1;
  else addMap(t.names, d.k);
}
const clean = (t) => JSON.stringify(t, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));
const keyOf = (r, at) => [r.user_id, r.slot, r.kind, r.intent, r.session_id || '', dayOf(at)].join('|');
const FOLDED_KIND = (r) => (r.intent === 'accrue' && ['gather', 'craft', 'combat'].includes(r.kind)) || (r.kind === 'hunt' && ['supply_buy', 'supply_own'].includes(r.intent));
/* what the model must leave: this file's own unknown key, or a typed column */
const UNFIT = (r) => (r.meta && Object.prototype.hasOwnProperty.call(r.meta, 'zz_probe')) || r.item_id !== null || r.skill_id !== null;

// ── THE LEDGER (triggers off, as a restored database's rows arrive: the purse stamp wants a live wallet) ───────────────────
const AT = (days, clock, secs) => `(date_bin(interval '1 day', now() - make_interval(days => ${days}), timestamptz '2000-01-01 00:00:00+00') + interval '${clock}' + make_interval(secs => ${secs}))`;
async function seed(db) {
  /* each account holds a purse: economy-watch's journal sum is over the accounts that do */
  const accounts = [...U, P, Q].map((u) => `('${u}'::uuid)`).join(', ');
  await db.exec(`insert into auth.users (id) values ${accounts} on conflict (id) do nothing;
    insert into public.account_wallet (user_id, gold) select a.id, 1000 from (values ${accounts}) a(id) on conflict (user_id) do nothing;`);
  await db.exec('set session_replication_role = replica');
  const heroes = `(select u.uid, s.slot, row_number() over (order by u.uid, s.slot) as h from unnest(array[${U.map((u) => `'${u}'`).join(', ')}]::uuid[]) u(uid), generate_series(0, 1) s(slot)) h`;
  /* a hunt a day, 40 minutes from 18:00 UTC, a settle a minute, days 1 to 9 back: a third inside the days of detail */
  await db.exec(`
insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, gold_kind, session_id, meta, at)
select h.uid, h.slot, 'combat', 'accrue', (j % 7) * 3, (j % 7) * 3, 100 + (j * 7 + d) % 50, j % 3, 0, 100000 + d * 1000 + j, 'hunt_loot', md5('s' || h.h || ':' || d)::uuid,
       jsonb_strip_nulls(jsonb_build_object('ms', 60000, 'ticks', 30 + j % 4, 'kills', j % 4, 'mon', 'ground_' || (d % 3),
         'km', case when j % 4 > 0 then jsonb_strip_nulls(jsonb_build_object('rat', j % 4 - j % 2, 'bat', nullif(j % 2, 0))) end,
         'from', to_char((t.at - interval '60 seconds') at time zone 'UTC', ${ISO}), 'to', to_char(t.at at time zone 'UTC', ${ISO}),
         'delta', jsonb_strip_nulls(jsonb_build_object('g', nullif((j % 7) * 3, 0), 'i', case when j % 3 > 0 then jsonb_build_object('hide', j % 3, 'fang', 1) end,
                    'x', jsonb_build_object('melee', 60 + j % 30, 'defense', 40 + (j + d) % 20), 'lx', (j * 3 + d) % 50,
                    'k', case when j % 5 = 0 then jsonb_build_array('accrued_to', 'hp', 'progress') else jsonb_build_array('accrued_to', 'hp') end)))),
       t.at
  from ${heroes}, generate_series(1, 9) d, generate_series(0, 39) j, lateral (select ${AT('d', '18 hours', 'j * 60 + h.h')}) t(at);
insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, session_id, meta, at)
select h.uid, h.slot, 'hunt', 'supply_own', 0, -(1 + j % 3), md5('s' || h.h || ':' || d)::uuid,
       jsonb_build_object('side', 'bag', 'source', 'own', 'items', case when j % 2 = 0 then jsonb_build_object('potion', 1 + j % 3) else jsonb_build_object('arrow', j % 3, 'potion', 1) end), t.at
  from ${heroes}, generate_series(1, 9) d, generate_series(0, 9) j, lateral (select ${AT('d', '18 hours', 'j * 240 + 7 + h.h')}) t(at);
insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, purse, gold_kind, session_id, meta, at)
select h.uid, h.slot, 'hunt', 'supply_buy', -(4 + j) * 2, -(4 + j), 90000 + j, 'hunt_supply', md5('s' || h.h || ':' || d)::uuid,
       jsonb_build_object('reason', 'supply_buy', 'source', 'store', 'gold', (4 + j) * 2,
         'items', case when j % 2 = 0 then jsonb_build_object('arrow', jsonb_build_object('qty', 4 + j, 'price', 2))
                       else jsonb_build_object('arrow', jsonb_build_object('qty', 2 + j, 'price', 2), 'potion', jsonb_build_object('qty', 2, 'price', 2)) end), t.at
  from ${heroes}, generate_series(1, 9) d, generate_series(0, 4) j, lateral (select ${AT('d', '18 hours', 'j * 480 + 11 + h.h')}) t(at);
insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, gold_kind, meta, at)
select h.uid, h.slot, 'gather', 'accrue', 0, 0, 25 * (10 + j % 3), 10 + j % 3, 0, 80000, 'town_work',
       jsonb_strip_nulls(jsonb_build_object('ms', 90000, 'ticks', 30, 'qty', 10 + j % 3, 'capped', false, 'node', case when d % 2 = 0 then 'oak' else 'ash' end, 'skill', 'woodcutting',
         'w', case when j % 4 = 0 then (j + 1) || ',' || (j % 3) end, 'src', case when j % 2 = 0 then 'tick' end,
         'stopped', case when j = 19 then 'bag_full' end, 'room_for', case when j = 19 then 'oak_log' end,
         'from', to_char((t.at - interval '90 seconds') at time zone 'UTC', ${ISO}), 'to', to_char(t.at at time zone 'UTC', ${ISO}),
         'delta', jsonb_build_object('i', jsonb_build_object('oak_log', 10 + j % 3), 'x', jsonb_build_object('woodcutting', 25 * (10 + j % 3)), 'k', jsonb_build_array('accrued_to')))), t.at
  from ${heroes}, generate_series(1, 9) d, generate_series(0, 19) j, lateral (select ${AT('d', '9 hours', 'j * 90 + h.h')}) t(at) where h.slot = 1;
insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, gold_kind, meta, at)
select h.uid, h.slot, 'craft', 'accrue', -(1 + j % 2), 0, 10 * (5 + j % 2), 5 + j % 2, 0, 70000 - j, 'bench_tax',
       jsonb_build_object('ms', 60000, 'ticks', 5 + j % 2, 'capped', false, 'made', 5 + j % 2, 'burnt', j % 2, 'recipe', 'bar_' || (d % 2), 'skill', 'smithing',
         'stopped', null, 'out_of', null, 'n', 100 - j * 6, 'left', 94 - j * 6,
         'from', to_char((t.at - interval '60 seconds') at time zone 'UTC', ${ISO}), 'to', to_char(t.at at time zone 'UTC', ${ISO}),
         'delta', jsonb_build_object('g', -(1 + j % 2), 'i', jsonb_build_object('bar', 5 + j % 2, 'ore', -2 * (5 + j % 2)), 'x', jsonb_build_object('smithing', 10 * (5 + j % 2)),
                    'k', jsonb_build_array('accrued_to', 'bench_tax'), 'bt', jsonb_build_object('c', 5 + j % 2, 'mg', 250, 'g', 1 + j % 2, 'cr', (j * 250) % 1000))), t.at
  from ${heroes}, generate_series(1, 9) d, generate_series(0, 9) j, lateral (select ${AT('d', '12 hours', 'j * 60 + h.h')}) t(at) where h.slot = 0;
/* what must NOT fold: a death, a shop row, a hunt row of another intent, a key the model lacks, a typed column */
insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, session_id, meta, at)
select h.uid, h.slot, 'combat', 'death', 0, 0, 0, 0, md5('s' || h.h || ':' || d)::uuid, jsonb_build_object('monster', 'rat', 'deaths_today', 1), ${AT('d', '18 hours', '2399 + h.h')}
  from ${heroes}, generate_series(1, 9) d;
insert into public.player_ledger (user_id, slot, kind, intent, gold, purse, gold_kind, meta, at)
select h.uid, h.slot, 'shop', 'shop_buy:probe:' || d, -25, 60000, 'shop', '{}'::jsonb, ${AT('d', '8 hours', 'h.h')} from ${heroes}, generate_series(1, 9) d;
insert into public.player_ledger (user_id, slot, kind, intent, session_id, meta, at)
select h.uid, h.slot, 'hunt', 'resume', md5('s' || h.h || ':' || d)::uuid, jsonb_build_object('reason', 'left', 'resumed', false), ${AT('d', '18 hours', '2400 + h.h')} from ${heroes}, generate_series(1, 9) d;
insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, gold_kind, session_id, meta, at)
select h.uid, h.slot, 'combat', 'accrue', 5, 5, 0, 0, 0, 50000, 'hunt_loot', md5('s' || h.h || ':' || d)::uuid,
       jsonb_build_object('ms', 60000, 'ticks', 30, 'kills', 1, 'mon', 'ground_0', 'zz_probe', d, 'delta', jsonb_build_object('g', 5)), ${AT('d', '18 hours', '2401 + h.h')}
  from ${heroes}, generate_series(1, 9) d;
insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, gems_in, purse, gold_kind, meta, at)
select h.uid, h.slot, 'gather', 'accrue', 'oak_log', 3, 0, 0, 0, 3, 0, 50000, 'town_work', jsonb_build_object('ms', 1000, 'ticks', 1, 'qty', 3), ${AT('d', '9 hours', '1900 + h.h')}
  from ${heroes}, generate_series(1, 9) d where h.h = 1;
/* PAST RETENTION, twice over: P's rows fold, Q's carry this file's unknown key and are pruned as detail. Value for value the same. */
insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, xp, gold_in, xp_in, qty_in, gems_in, purse, gold_kind, session_id, meta, at)
select a.uid, 0, x.kind, x.intent, x.gold, x.qty, x.xp, x.gold_in, 0, 0, x.gems_in, 40000, x.gold_kind, md5('old')::uuid,
       case when a.fits then x.meta else x.meta || '{"zz_probe": 1}'::jsonb end, ${AT('120', '12 hours', 'x.j * 30')}
  from (values ('${P}'::uuid, true), ('${Q}'::uuid, false)) a(uid, fits),
       (select j, 'combat' as kind, 'accrue' as intent, (j % 5) * 10 as gold, null::bigint as qty, case when j % 3 = 0 then -7 else 9 end as xp, (j % 5) * 10 as gold_in, j % 2 as gems_in,
               'hunt_loot' as gold_kind, jsonb_build_object('ms', 60000, 'ticks', 30, 'kills', 1, 'mon', 'ground_0', 'delta', jsonb_build_object('g', (j % 5) * 10)) as meta
          from generate_series(0, 11) j
        union all
        select 20 + j, 'hunt', 'supply_buy', -(3 + j), -(1 + j), null, null, 0, 'hunt_supply',
               jsonb_build_object('reason', 'supply_buy', 'source', 'store', 'gold', 3 + j, 'items', jsonb_build_object('arrow', jsonb_build_object('qty', 1 + j, 'price', 3)))
          from generate_series(0, 3) j) x;`);
  await db.exec('set session_replication_role = origin');
}

/* Rows as JavaScript reads them: one shape for the oracle, whatever the driver made of a bigint or a timestamp. */
async function ledgerRows(db, where = 'true') {
  return (await db.query(`select id::text as id, user_id::text as user_id, slot, kind, intent, item_id, skill_id, qty::text as qty, gold::text as gold, xp::text as xp,
      gold_in::text as gold_in, xp_in::text as xp_in, qty_in::text as qty_in, gems_in::text as gems_in, session_id::text as session_id, purse::text as purse, gold_kind, meta,
      to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at
    from public.player_ledger where ${where} order by id`)).rows;
}
async function windowRows(db, where = 'true') {
  return (await db.query(`select id::text as id, user_id::text as user_id, slot, kind, intent, session_id::text as session_id, gold_kind, n, array_to_json(ids)::text as ids,
      to_char(window_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as window_from, to_char(window_to at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as window_to,
      round(extract(epoch from window_to - window_from))::int as width_s,
      gold_pos::text as gold_pos, gold_neg::text as gold_neg, qty_pos::text as qty_pos, qty_neg::text as qty_neg, xp_pos::text as xp_pos, xp_neg::text as xp_neg,
      gold_in::text as gold_in, xp_in::text as xp_in, qty_in::text as qty_in, gems_in::text as gems_in, purse::text as purse, meta
    from public.player_ledger_windows where ${where} order by id`)).rows.map((w) => ({ ...w, ids: JSON.parse(w.ids).map(String) }));
}

// ── THE CENSUS OF FUNCTIONS THAT READ player_ledger (LF-READERS) ──────────────────────────────────────────────────────
// name -> [read sites, how far back it reads, why the fold cannot move it]. The fold takes accrue rows of gather, craft and
// combat and hunt supply_buy / supply_own rows OLDER THAN 3 DAYS, so a reader is safe when it reads no further back than 48
// hours, or reads only other rows. A function here with a different count, or one not here at all, is RED: read its
// predicate against that sentence, then pin it.
const READERS = {
  hr_apply: [1, 'today', 'kind hearthfind'],
  hr_backfill_lifetime_facts: [3, 'all', 'kinds hearthfind and bounty, never folded'],
  hr_boss_call_quote: [1, 'today', 'kind shop'],
  hr_buy_gem_unlock__ungated: [1, 'today', 'kind gem_unlock'],
  hr_buy_hero_slot__ungated: [1, 'today', 'kind hero_slot'],
  hr_day_budget_used: [2, 'today', 'the day budget: every kind, the UTC day only'],
  hr_death_log_view: [1, '2 days after a death', 'intent blessing_used, never folded'],
  hr_dungeon_cooldowns: [1, 'the longest cooldown', 'kind dungeon'],
  hr_dungeon_settle: [2, 'today', 'kind dungeon'],
  hr_gm_grant_gold: [1, 'today', 'kind admin'],
  hr_gm_grant_item: [1, 'today', 'kind admin'],
  hr_gm_grant_level: [1, 'today', 'kind admin'],
  hr_gm_hero: [1, '7 days, the newest 5 rows', 'ACCEPTED: a game master\'s last-five list shows detail only; a hero idle past 3 days lists its deaths and purchases, its hunts are in player_ledger_windows (tools/char-state.local.mjs prints them)'],
  hr_hallmark_view: [1, 'today', 'kind shop'],
  hr_hero_colors_saved_today: [1, 'today', 'kind shop'],
  hr_hero_rename_quote: [1, 'today', 'kind shop'],
  hr_hunt_apply_member: [2, '25 hours; today', 'the kill bound reads 25 hours of the session; the day\'s buys read today'],
  hr_hunt_settle_session: [9, '25 hours', 'every read is the session past its high-water mark, 25 hours at most'],
  hr_market_buy: [2, 'today', 'kind trade'],
  hr_market_list: [1, 'today', 'kind trade'],
  hr_market_mine: [4, '30 days; today', 'kind trade, never folded'],
  hr_quartermaster_buy: [1, 'today', 'kind dungeon'],
  hr_recipe_learn__ungated: [1, 'today', 'kind recipe'],
  hr_scaled_hours_today: [1, 'today', 'kind shop'],
  hr_sink_bought_today: [1, 'today', 'kind shop'],
  hr_stamina_refill_quote: [1, 'today', 'kind shop'],
  hr_state_of: [1, 'today', 'kind hearthfind'],
  hr_tick_stall_status: [3, '48 hours at most', 'p_hours is clamped to 48: THE reader detail_days >= 3 exists for'],
  hr_training_section: [1, 'the open session', 'kind shop'],
  hr_trait_buy__ungated: [1, 'today', 'kind trait'],
  hr_unlock_buy: [1, 'today', 'kind shop'],
};
/* the fold's own machinery and the prune: they read old rows because that is their work */
const OWN = new Set(['hr_ledger_fold', 'hr_ledger_fold_plan', 'hr_ledger_fold_range', 'hr_ledger_fold_candidates', 'hr_ledger_window_proved', 'hr_ledger_prune', 'hr_ledger_immutable']);
async function readerCensus(db) {
  const { rows } = await db.query(`select p.proname, p.prosrc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc ilike '%player_ledger%'`);
  const got = {};
  for (const { proname, prosrc } of rows) {
    if (OWN.has(proname)) continue;
    const code = String(prosrc).replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
    const n = (code.match(/\b(?:from|join)\s+(?:only\s+)?public\.player_ledger\b(?![_.])/gi) || []).length;
    if (n) got[proname] = n;
  }
  const bad = [];
  for (const [name, n] of Object.entries(got)) {
    if (!READERS[name]) bad.push(`${name} reads player_ledger (${n} site(s)) and is not in the census`);
    else if (READERS[name][0] !== n) bad.push(`${name} reads player_ledger at ${n} site(s), the census pins ${READERS[name][0]}`);
  }
  for (const name of Object.keys(READERS)) if (!got[name]) bad.push(`${name} is in the census and no longer reads player_ledger`);
  return { bad, n: Object.keys(got).length };
}

// ── THE SCENARIO ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** @returns {Promise<Map<string,string>>} the red arms */
async function scenario(db, src, { real = true, quiet = false } = {}) {
  const red = new Map();
  const arm = (id, ok, said, detail = '') => {
    if (!ok) red.set(id, detail);
    if (!quiet) console.log(ok ? `  ✓ ${id} — ${said}` : `  ✗ ${id} — ${String(detail).slice(0, 900)}`);
  };
  const one = async (sql, params) => { const row = (await db.query(sql, params)).rows[0]; return row ? row[Object.keys(row)[0]] : null; };
  /* a statement that may be refused, in its own savepoint: its message, or null when it ran */
  const refused = async (sql, params) => {
    await db.exec('savepoint lf');
    try { await db.query(sql, params); await db.exec('release savepoint lf'); return null; }
    catch (e) { await db.exec('rollback to savepoint lf'); return String(e.message); }
  };
  const apply = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return String(e.message).split('\n')[0]; } };
  const R = liftReports();

  /* LF-INERT: as installed */
  const cfg0 = (await db.query('select detail_days, window_minutes, retain_days from public.hr_ledger_config')).rows[0];
  const inert = await one(CRON_FOLD);
  const jobs = (await db.query(`select jobname, schedule, command from cron.job where jobname in ('hr-ledger-fold', 'hr-ledger-windows-prune') order by 1`)).rows;
  arm('LF-INERT', cfg0.detail_days === null && cfg0.window_minutes === 15 && inert && inert.ok === true && inert.off === true
    && jobs.length === 2 && jobs[0].command === CRON_FOLD && jobs[0].schedule === '7-59/10 * * * *' && jobs[1].schedule === '57 * * * *' && jobs[1].command === CRON_PRUNE,
  'installed OFF: detail_days is NULL, the job\'s command answers off, both jobs are scheduled', js({ cfg0, inert, jobs }));

  /* A REAL HUNT (the tick's door, the shipped engine): two heroes, ten 90-second windows. Its rows are then dated back a
     week, 45 seconds apart, so they wait for the fold as a week-old hunt's do. */
  let hunt = null;
  if (real) {
    const { prepare } = await import('../tools/settle-cost.mjs');
    const run = await prepare({ db, heroes: 2, windows: 10, door: 'fire', hunt: 'millrace_sewer' });
    await run.warm();
    for (let w = 2; w <= 10; w++) await run.step(w);
    hunt = { users: run.users, sessions: run.sessions };
    await db.exec('set session_replication_role = replica');
    await db.query(`with r as (select l.id, l.at, row_number() over (partition by l.user_id order by l.id) as rn from public.player_ledger l where l.session_id = any ($1::uuid[]))
      update public.player_ledger l set at = ${AT('7', '6 hours', 'r.rn * 45')} from r where l.id = r.id and l.at = r.at`, [hunt.sessions]);
    await db.exec('set session_replication_role = origin');
  }
  await seed(db);

  /* LF-ARM-REFUSED: a ledger the model misses. Three unknown-key rows for every one that waits, in a transaction that rolls back. */
  await db.exec('begin');
  await db.exec('set local session_replication_role = replica');
  await db.exec(`insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, gold_kind, meta, at)
    select '${U[0]}'::uuid, 0, 'gather', 'accrue', 0, 0, 0, 0, 0, 1, 'town_work', jsonb_build_object('ms', 1, 'zz_probe', j), ${AT('20', '3 hours', 'j')}
      from generate_series(1, 3 * (select count(*)::int from public.player_ledger)) j`);
  await db.exec('set local session_replication_role = origin');
  const eRefused = await apply(src.arm);
  await db.exec('rollback');
  const stillOff = await one('select detail_days from public.hr_ledger_config');
  arm('LF-ARM-REFUSED', eRefused !== null && /ARM REFUSED/.test(eRefused) && /zz_probe/.test(eRefused) && stillOff === null,
    'under 900 in 1,000 rows fit: the arm refuses, names the key, and the tier stays off', js({ eRefused, stillOff }));

  /* LF-ARM */
  const eArm = await apply(src.arm);
  const armed = (await db.query('select c.detail_days, s.last, s.folded_to, s.runs from public.hr_ledger_config c, public.hr_ledger_fold_state s')).rows[0];
  const eArm2 = await apply(src.arm);
  const armed2 = (await db.query('select c.detail_days, s.last, s.folded_to, s.runs from public.hr_ledger_config c, public.hr_ledger_fold_state s')).rows[0];
  arm('LF-ARM', eArm === null && armed.detail_days === 3 && armed.last && armed.last.dry_run === true && Boolean(armed.last.armed_at) && num(armed.last.folded) > 0
    && eArm2 === null && full(armed2) === full(armed) && num(armed.runs) === 0,
  `on at 3 days, the dry run it read is kept (${armed.last && armed.last.folded} rows into ${armed.last && armed.last.windows} windows), a second apply changes nothing`, js({ eArm, armed, eArm2 }));

  /* LF-DIAL */
  await db.exec('begin');
  const eDial = await refused('update public.hr_ledger_config set detail_days = 2 where only_row');
  await db.exec('rollback');
  arm('LF-DIAL', eDial !== null && /hr_ledger_config_detail_days_ck/.test(eDial), 'detail_days 2 is refused by the dial\'s CHECK', js({ eDial }));

  /* BEFORE: every row, as it stands. */
  const before = await ledgerRows(db);
  const cut = await one(`select to_char(date_bin(interval '15 minutes', now() - interval '3 days', timestamptz '2000-01-01 00:00:00+00') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);
  const shouldFold = before.filter((r) => FOLDED_KIND(r) && r.at < cut && !UNFIT(r));
  const shouldLeave = before.filter((r) => FOLDED_KIND(r) && r.at < cut && UNFIT(r));
  if (shouldFold.length < 1000 || shouldLeave.length < 20 || before.filter((r) => FOLDED_KIND(r) && r.at >= cut).length < 100) {
    throw harness(`the fixture is thin: ${shouldFold.length} rows to fold, ${shouldLeave.length} to leave, so the arms below would prove little`);
  }
  const want = new Map();
  for (const r of shouldFold) { const k = keyOf(r, r.at); if (!want.has(k)) want.set(k, emptyTotal()); addTo(want.get(k), r, false); }

  /* LF-DRY */
  const stateBefore = full((await db.query('select * from public.hr_ledger_fold_state')).rows[0]);
  await db.exec('begin read only');
  let dry = null, dryVia = null, toolRow = null, eDry = null, eWrite = null;
  try {
    dry = await one('select public.hr_ledger_fold_plan(1000000, null, null)');
    dryVia = await one('select public.hr_ledger_fold(1000000, true)');
    toolRow = (await db.query(planSql(null))).rows[0];   /* tools/ledger-fold.local.mjs's own read */
  } catch (e) { eDry = String(e.message); }
  await db.exec('rollback');
  await db.exec('begin read only');
  try { await db.query(CRON_FOLD); } catch (e) { eWrite = String(e.message); }
  await db.exec('rollback');
  const screen = planLines(toolRow || {}).join('\n');
  const leftKeys = dry ? [...new Set((dry.left_by || []).map((l) => l.why))].sort().join(' | ') : '';
  arm('LF-DRY', eDry === null && dry && dry.ok === true && dry.dry_run === true && num(dry.folded) === shouldFold.length && num(dry.left) === shouldLeave.length
    && dryVia && num(dryVia.folded) === num(dry.folded) && num(dryVia.windows) === num(dry.windows)
    && leftKeys === 'column item_id or skill_id | key zz_probe' && eWrite !== null && /read-only transaction/.test(eWrite)
    && (await ledgerRows(db)).length === before.length && num(await one('select count(*) from public.player_ledger_windows')) === 0
    && full((await db.query('select * from public.hr_ledger_fold_state')).rows[0]) === stateBefore
    && screen.includes(`Would fold: ${shouldFold.length.toLocaleString('en-US')} rows into ${num(dry.windows).toLocaleString('en-US')} windows`) && screen.includes('key zz_probe')
    && screen.includes(`The journal now: ${before.length.toLocaleString('en-US')} rows`),
  `inside a READ ONLY transaction (the real fold is refused there): ${dry && dry.folded} rows would fold into ${dry && dry.windows} windows, ${dry && dry.left} stay; nothing moved`,
  js({ eDry, eWrite, dry: dry && { folded: dry.folded, left: dry.left, windows: dry.windows, left_by: dry.left_by }, want: [shouldFold.length, shouldLeave.length], screen: screen.slice(0, 200) }));

  /* THE FOLD, between two readings of everything that reads the journal: one transaction, so both readings see one now(). */
  const heroes = [...(hunt ? hunt.users.map((u) => [u, 0]) : []), ...U.flatMap((u) => [[u, 0], [u, 1]])];
  const readAll = async () => {
    const out = {};
    const ask = async (name, sql, params) => {
      await db.exec('savepoint rd');
      try { out[name] = full((await db.query(sql, params)).rows); await db.exec('release savepoint rd'); }
      catch (e) { await db.exec('rollback to savepoint rd'); out[name] = 'REFUSED ' + String(e.message).split('\n')[0]; }
    };
    for (const [u, s] of heroes) {
      for (const fn of ['hr_state_of', 'hr_death_log_view', 'hr_dungeon_cooldowns', 'hr_training_section', 'hr_stamina_refill_quote', 'hr_hero_rename_quote',
        'hr_hallmark_view', 'hr_scaled_hours_today', 'hr_hero_colors_saved_today', 'hr_market_mine']) {
        await ask(`${fn} ${u.slice(-4)}:${s}`, `select public.${fn}($1::uuid, $2::int) as v`, [u, s]);
      }
      await ask(`hr_day_budget_used ${u.slice(-4)}:${s}`, 'select public.hr_day_budget_used($1::uuid, $2::int, now()) as v', [u, s]);
    }
    await ask('hr_tick_stall_status', 'select public.hr_tick_stall_status(now(), 48, 1) as v');
    await ask('hunt_session_tally', 'select md5(coalesce(string_agg(to_jsonb(t)::text, \'|\' order by t.session_id), \'\')) as v, count(*) as n from public.hunt_session_tally t');
    for (const sid of hunt ? hunt.sessions : []) await ask('hr_hunt_view ' + sid.slice(0, 8), 'select public.hr_hunt_view($1::uuid) as v', [sid]);
    return out;
  };
  const reports = async (w) => {
    const rows = async (sql) => full((await db.query(sql)).rows.map((r) => JSON.stringify(r)).sort());
    const held = (await db.query(R.held(w))).rows[0];
    return { vitals: await rows(R.vitals(w)), flows: await rows(R.flows(w)), heroes: await rows(R.heroes(w)), journal: String(held.journal), rolled: String(held.rolled) };
  };
  await db.exec('begin');
  const readersA = await readAll();
  const reportsA = await reports(true);
  const reportsOld = await reports(false);
  const runs = [];
  let eFold = null;
  try {
    for (let i = 0; i < 200; i++) {
      const r = await one('select public.hr_ledger_fold(600)');   /* a small limit, so the cursor is seen to move in batches */
      runs.push(r);
      if (!r || r.ok !== true || !r.more) break;
    }
  } catch (e) { eFold = String(e.message).split('\n')[0]; }
  if (eFold !== null) {
    await db.exec('rollback');
    arm('LF-FOLD', false, '', 'the fold raised: ' + eFold);
    return red;
  }
  const readersB = await readAll();
  const reportsB = await reports(true);
  const reportsBlind = await reports(false);
  await db.exec('commit');

  /* LF-FOLD */
  const last = runs[runs.length - 1] || {};
  const folded = runs.reduce((s, r) => s + num(r && r.folded), 0), left = runs.reduce((s, r) => s + num(r && r.left), 0);
  const state = (await db.query(`select to_char(folded_to at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as folded_to, runs, rows_folded, windows, rows_left, last from public.hr_ledger_fold_state`)).rows[0];
  const boundary = runs.every((r) => r && r.ok === true && new Date(r.to).getTime() % 900000 === 0);
  arm('LF-FOLD', runs.length >= 3 && last.more === false && boundary && folded === shouldFold.length && left === shouldLeave.length
    && state.folded_to === cut && num(state.runs) === runs.length && num(state.rows_folded) === folded && num(state.rows_left) === left,
  `${runs.length} runs of the job's command took ${folded} rows, every batch ending on a window boundary, the cursor at the cut`,
  js({ runs: runs.length, folded, want: shouldFold.length, left, wantLeft: shouldLeave.length, cursor: state.folded_to, cut, boundary, last }));

  /* LF-CONSERVE / LF-EXACT / LF-LEFT / LF-WINDOWS */
  const windows = await windowRows(db);
  const after = await ledgerRows(db);
  const got = new Map();
  for (const w of windows) { const k = keyOf(w, w.window_from); if (!got.has(k)) got.set(k, emptyTotal()); addTo(got.get(k), w, true); }
  const diff = [];
  for (const [k, t] of want) { if (!got.has(k)) diff.push(k + ' has no window'); else if (clean(got.get(k)) !== clean(t)) diff.push(`${k}: rows ${clean(t)} windows ${clean(got.get(k))}`); }
  for (const k of got.keys()) if (!want.has(k)) diff.push(k + ' is a window over rows that should not have folded');
  arm('LF-CONSERVE', want.size >= 100 && !diff.length,
    `${want.size} (hero, kind, intent, session, day) totals agree to the unit: gold in and out, units, the day budget, time, kills by monster, items, skill and Level XP`,
    `${diff.length} of ${want.size} differ: ${diff.slice(0, 2).join(' ;; ')}`);

  const held = windows.flatMap((w) => w.ids).sort();
  const wantIds = shouldFold.map((r) => r.id).sort();
  const afterById = new Map(after.map((r) => [r.id, full(r)]));
  const moved = before.filter((r) => !wantIds.includes(r.id) && afterById.get(r.id) !== full(r)).map((r) => r.id);
  const lingering = wantIds.filter((id) => afterById.has(id));
  arm('LF-EXACT', full(held) === full(wantIds) && new Set(held).size === held.length && !lingering.length && !moved.length && after.length === before.length - wantIds.length,
    `the windows list the ${wantIds.length} folded rows, each once; those are gone and the other ${after.length} rows are byte for byte what they were`,
    js({ held: held.length, want: wantIds.length, lingering: lingering.length, moved: moved.slice(0, 5), after: after.length }));

  const leftStill = shouldLeave.filter((r) => afterById.has(r.id)).length;
  const leftSaid = (last.left_by || []).concat(...runs.slice(0, -1).map((r) => r.left_by || []));
  arm('LF-LEFT', leftStill === shouldLeave.length && leftSaid.some((l) => l.why === 'key zz_probe') && leftSaid.some((l) => l.why === 'column item_id or skill_id'),
    `${leftStill} rows the model does not list kept their detail and were counted by key`, js({ leftStill, want: shouldLeave.length, leftSaid: leftSaid.slice(0, 4) }));

  const beforeById = new Map(before.map((r) => [r.id, r]));
  const LABELS = ['mon', 'node', 'recipe', 'skill', 'src', 'capped', 'stopped', 'out_of', 'room_for', 'side', 'source', 'reason'];
  const sig = (w) => [w.user_id, w.slot, w.kind, w.intent, w.session_id, w.gold_kind, w.window_from, ...LABELS.map((l) => js(w.meta[l]))].join('|');
  const astray = windows.filter((w) => w.width_s !== 900 || new Date(w.window_from).getTime() % 900000 !== 0 || w.ids.some((id) => {
    const r = beforeById.get(id);
    return !r || r.user_id !== w.user_id || r.slot !== w.slot || r.kind !== w.kind || r.intent !== w.intent || r.at < w.window_from || r.at >= w.window_to;
  }));
  arm('LF-WINDOWS', windows.length > 0 && !astray.length && new Set(windows.map(sig)).size === windows.length,
    `${windows.length} windows: each holds one hero's rows of one kind inside its own 15 minutes, and no batch split one`,
    js({ astray: astray.length, windows: windows.length, distinct: new Set(windows.map(sig)).size }));

  /* LF-REAL */
  if (hunt) {
    const tally = (await db.query('select session_id::text as session_id, coins::text as coins, kills::text as kills, xp, loot, supplies from public.hunt_session_tally where session_id = any ($1::uuid[])', [hunt.sessions])).rows;
    const bad = [];
    let rowsOfHunt = 0;
    for (const t of tally) {
      const mine = windows.filter((w) => w.session_id === t.session_id);
      const sum = emptyTotal();
      for (const w of mine) addTo(sum, w, true);
      rowsOfHunt += sum.n;
      const xp = { ...sum.x, ...(sum.lx ? { level: sum.lx } : {}) };
      const combat = mine.filter((w) => w.kind === 'combat').reduce((s, w) => s + num(w.gold_pos) - num(w.gold_neg), 0);
      const drop0 = (o) => clean(Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, num(v)])));
      if (combat !== num(t.coins)) bad.push(`coins ${combat} vs the tally's ${t.coins}`);
      if (sum.kills !== num(t.kills)) bad.push(`kills ${sum.kills} vs ${t.kills}`);
      if (drop0(xp) !== drop0(t.xp)) bad.push(`xp ${drop0(xp)} vs ${drop0(t.xp)}`);
      if (drop0(sum.i) !== drop0(t.loot)) bad.push(`loot ${drop0(sum.i)} vs ${drop0(t.loot)}`);
      if (drop0(sum.items) !== drop0(t.supplies)) bad.push(`supplies ${drop0(sum.items)} vs ${drop0(t.supplies)}`);
    }
    const unfolded = after.filter((r) => hunt.sessions.includes(r.session_id) && FOLDED_KIND(r)).length;
    arm('LF-REAL', tally.length === 2 && rowsOfHunt >= 20 && !bad.length && unfolded === 0 && tally.every((t) => num(t.kills) > 0),
      `the engine's own rows (${rowsOfHunt} of a two-hero hunt) all fold, and their windows add up to the hunt's tally: coins, kills, skill and Level XP, loot, supplies`,
      js({ bad, unfolded, rowsOfHunt, tally: tally.length }));
  }

  /* LF-NOOP */
  const fp = () => one('select md5(coalesce(string_agg(to_jsonb(w)::text, \'|\' order by w.id), \'\')) from public.player_ledger_windows w');
  const fp0 = await fp();
  const again = await one(CRON_FOLD);
  arm('LF-NOOP', again && again.ok === true && num(again.folded) === 0 && num(again.windows) === 0 && num(again.seen) === 0 && (await fp()) === fp0
    && (await ledgerRows(db)).length === after.length,
  'a second fold reads nothing new and moves nothing', js({ again }));

  /* LF-LOCKS */
  const recent = before.find((r) => FOLDED_KIND(r) && r.at >= cut);
  const aWindow = windows[0];
  const forged = `insert into public.player_ledger_windows (user_id, slot, kind, intent, session_id, gold_kind, window_from, window_to, n, ids, first_at, last_at, gold_pos, gold_in, meta)
    select l.user_id, l.slot, l.kind, l.intent, l.session_id, l.gold_kind, date_bin(interval '15 minutes', l.at, timestamptz '2000-01-01 00:00:00+00'),
           date_bin(interval '15 minutes', l.at, timestamptz '2000-01-01 00:00:00+00') + interval '15 minutes', 1, array[l.id], l.at, l.at, coalesce(l.gold, 0) + 1, coalesce(l.gold_in, 0), l.meta
      from public.player_ledger l where l.id = $1`;
  await db.exec('begin');
  const locks = {
    recentRow: await refused('delete from public.player_ledger where id = $1', [recent.id]),
    leftRow: await refused('delete from public.player_ledger where id = $1', [shouldLeave[0].id]),
    update: await refused('update public.player_ledger set gold = 1 where id = $1', [recent.id]),
    truncate: await refused('truncate public.player_ledger'),
    windowUpdate: await refused('update public.player_ledger_windows set gold_pos = gold_pos + 1 where id = $1', [aWindow.id]),
    windowDelete: await refused('delete from public.player_ledger_windows where id = $1', [aWindow.id]),
    windowTruncate: await refused('truncate public.player_ledger_windows'),
    forged: await refused(forged, [shouldLeave[0].id]),
  };
  await db.exec('rollback');
  arm('LF-LOCKS', /retention window/.test(locks.recentRow || '') && /retention window/.test(locks.leftRow || '') && /append-only/.test(locks.update || '')
    && /append-only/.test(locks.truncate || '') && /append-only/.test(locks.windowUpdate || '') && /retention window/.test(locks.windowDelete || '')
    && /append-only/.test(locks.windowTruncate || '') && /does not account for its rows|of another kind/.test(locks.forged || ''),
  'a row with no window is refused deletion (one inside the days of detail, one the fold left); the ledger and the windows are never updated, truncated or forged',
  js(locks));

  /* LF-READERS */
  const moved2 = Object.keys(readersA).filter((k) => readersA[k] !== readersB[k]);
  const census = await readerCensus(db);
  const answered = Object.values(readersA).filter((v) => !String(v).startsWith('REFUSED')).length;
  arm('LF-READERS', !moved2.length && !census.bad.length && answered >= heroes.length * 4,
    `${Object.keys(readersA).length} readings (${heroes.length} heroes, ${answered} answered) are the same before and after the fold; the ${census.n} functions that read player_ledger are the pinned ones`,
    js({ moved: moved2.slice(0, 4), a: moved2[0] && readersA[moved2[0]].slice(0, 200), b: moved2[0] && readersB[moved2[0]].slice(0, 200), census: census.bad.slice(0, 6) }));

  /* LF-REPORTS */
  const same = ['vitals', 'flows', 'heroes', 'journal', 'rolled'].filter((k) => reportsA[k] !== reportsB[k]);
  const unioned = ['vitals', 'flows', 'heroes', 'journal'].filter((k) => reportsA[k] !== reportsOld[k]);
  const quiet2 = ['vitals', 'flows', 'heroes', 'journal'].filter((k) => reportsBlind[k] !== reportsA[k]);
  arm('LF-REPORTS', !same.length && !unioned.length && quiet2.length === 4,
    'vitals\' day table and economy-watch\'s flows, heroes and journal sum are the same before and after; read without the windows, all four go quiet',
    js({ differ: same, unioned, wentQuiet: quiet2 }));

  /* LF-OBSERVE */
  const st = (await db.query(FOLD_STATE)).rows[0];
  const lineNow = foldLine(st);
  const eightDays = shouldLeave.filter((r) => r.at >= new Date(Date.now() - 8 * 86400000 + 60000).toISOString()).length;
  arm('LF-OBSERVE', lineNow.ok === false && /still detail/.test(lineNow.text) && num(st.behind) > 0 && num(st.behind) <= shouldLeave.length && num(st.behind) >= eightDays - 12
    && foldLine({ ...st, behind: 0 }).ok === true && foldLine({ ...st, behind: 0, last_age_s: 4000 }).ok === false
    && foldLine({ ...st, detail_days: null }).ok === true && foldLine(null).ok === true,
  `the fold's line alarms on the ${st.behind} rows it left as detail, on a job gone quiet, and reads OK with neither`, js({ lineNow, behind: st.behind, eightDays }));

  /* LF-DRILL: the fires, read from cron.job; a 100-second read started at every second of the hour after its wait. */
  const sched = (await db.query(`select jobname, schedule from cron.job where jobname in ('hr-ledger-prune', 'hr-ledger-fold', 'hr-ledger-windows-prune') order by 1`)).rows;
  const minutesOf = (cron) => { const f = cron.split(' ')[0]; const m = /^(\d+)(?:-(\d+)\/(\d+))?$/.exec(f); if (!m) throw harness('a ledger job\'s schedule is not one this guard reads: ' + cron);
    const out = []; for (let x = Number(m[1]); x <= Number(m[2] || m[1]); x += Number(m[3] || 60)) out.push(x); return out; };
  const fires = { on: sched.flatMap((j) => minutesOf(j.schedule)), off: sched.filter((j) => j.jobname === 'hr-ledger-prune').flatMap((j) => minutesOf(j.schedule)) };
  const hit = [];
  let unwaited = 0;
  const under = (tier, start) => fires[tier].some((f) => [f * 60, f * 60 + 3600].some((x) => x > start && x <= start + 100));
  for (const tier of ['on', 'off']) {
    for (let t = 0; t < 3600; t++) {
      /* the drill reads the minute, then sleeps that many minutes from the second it is */
      if (under(tier, t + ledgerQuietWaitMin(Math.floor(t / 60), tier === 'on') * 60)) hit.push(tier + ' ' + t);
      if (under(tier, t)) unwaited++;   /* the control: started at once, some reads DO meet a fire */
    }
  }
  arm('LF-DRILL', sched.length === 3 && fires.on.length === 8 && fires.on.every((f) => f % 10 === 7) && !hit.length && unwaited > 600
    && ledgerQuietWaitMin(3, true) === 0 && ledgerQuietWaitMin(14, true) === 6
    && ledgerQuietWaitMin(14, false) === 0 && ledgerQuietWaitMin(6, false) === 4,
  'the three jobs that delete journal rows fire on a minute ending in 7; a 100-second read of the ledger, started when the drill is told, meets none of them',
  js({ sched, fires, hit: hit.slice(0, 5) }));

  /* LF-PRUNE: P's rows folded, Q's left as detail; then both retention jobs, as cron calls them. */
  const pruneW = await one(CRON_PRUNE);
  const pruneR = await one('select public.hr_ledger_prune(20000)');
  const roll = async (u) => full((await db.query(`select slot, month::text as month, kind, n::text as n, gold_in::text as gold_in, gold_out::text as gold_out, xp_in::text as xp_in, xp_out::text as xp_out,
      qty_in::text as qty_in, qty_out::text as qty_out, gems_in::text as gems_in from public.player_ledger_rollup where user_id = $1 order by slot, month, kind`, [u])).rows);
  const rp = await roll(P), rq = await roll(Q);
  const pruneW2 = await one(CRON_PRUNE), pruneR2 = await one('select public.hr_ledger_prune(20000)');
  arm('LF-PRUNE', num(pruneW) > 0 && num(pruneR) === 16 && rp === rq && JSON.parse(rp).length === 2 && /"xp_out":"[1-9]/.test(rp) && /"qty_out":"[1-9]/.test(rp) && /"gems_in":"[1-9]/.test(rp)
    && num(pruneW2) === 0 && num(pruneR2) === 0 && (await roll(P)) === rp
    && num(await one('select count(*) from public.player_ledger_windows where user_id = $1', [P])) === 0,
  `fold then the windows' prune (${pruneW} windows) writes the rollup the prune writes from the same rows left as detail (${pruneR} rows), column for column; a second run of both moves nothing`,
  js({ pruneW, pruneR, rp, rq, pruneW2, pruneR2 }));

  /* LF-KILL */
  const eOff = await apply(src.off);
  const offAnswer = await one(CRON_FOLD);
  await db.exec('begin');
  const offForged = await refused(forged, [shouldLeave[0].id]);
  const offDelete = await refused('delete from public.player_ledger where id = $1', [shouldLeave[0].id]);
  await db.exec('rollback');
  const standing = num(await one('select count(*) from public.player_ledger_windows'));
  const eOn = await apply(src.arm);
  const onAnswer = await one(CRON_FOLD);
  arm('LF-KILL', eOff === null && offAnswer && offAnswer.off === true && /fold tier is off/.test(offForged || '') && /retention window/.test(offDelete || '')
    && standing === windows.length - num(pruneW) && eOn === null && onAnswer && onAnswer.ok === true && onAnswer.off === undefined && num(onAnswer.folded) === 0
    && (await one('select detail_days from public.hr_ledger_config')) === 3,
  `the kill switch: the fold answers off, no window can be written, the ${standing} windows stand; armed again it resumes at its cursor`,
  js({ eOff, offAnswer, offForged, offDelete, standing, eOn, onAnswer }));

  /* LF-TWICE */
  const bodies = () => one(`select md5(string_agg(pg_get_functiondef(p.oid), '' order by p.proname, p.oid::regprocedure::text)) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'hr\\_ledger\\_%'`);
  const b0 = await bodies(), w0 = await fp();
  const eTwice = await apply(src.file);
  arm('LF-TWICE', eTwice === null && (await bodies()) === b0 && (await fp()) === w0 && (await one('select detail_days from public.hr_ledger_config')) === 3,
    'the install file applies again on the chain end, tier on and windows standing: no body, window or dial moves', js({ eTwice }));
  return red;
}

// ── THE MUTANTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The install file's own §6 catches most of these at apply time, which is the first line and stays: LF-SELFCHECK proves that
   for four of them. The rest carry SILENCE (the §6 block returns at once), so the defect reaches THIS guard's own arms. */
const SILENCE = [['begin\n  -- (a) THE SURFACE: nothing here is reachable by a client role, the tables have no policy, every lock is armed\n',
  'begin\n  return;\n  -- (a) THE SURFACE: nothing here is reachable by a client role, the tables have no policy, every lock is armed\n']];
const HELD_BY_A_WINDOW = `         and exists (select 1 from public.player_ledger_windows w
                      where w.user_id = old.user_id and w.slot = old.slot
                        and w.window_from <= old.at and w.window_from > old.at - interval '1 day'
                        and w.window_to > old.at and old.id = any (w.ids)) then`;
const MUTANTS = [
  { id: 'gold_miscounted_twice', arm: 'LF-CONSERVE', why: 'the fold and its proof both count gold out as gold in', file: FILE, edits: [...SILENCE,
    ['             coalesce(sum(greatest(coalesce(c.gold, 0), 0)), 0), coalesce(sum(greatest(-coalesce(c.gold, 0), 0)), 0),', '             coalesce(sum(abs(coalesce(c.gold, 0))), 0), 0,'],
    ['         coalesce(sum(greatest(coalesce(l.gold, 0), 0)), 0) as gold_pos, coalesce(sum(greatest(-coalesce(l.gold, 0), 0)), 0) as gold_neg,', '         coalesce(sum(abs(coalesce(l.gold, 0))), 0) as gold_pos, 0::numeric as gold_neg,']] },
  { id: 'fold_miscounts_proof_right', arm: 'LF-FOLD', why: 'the fold alone drops the units; the proof refuses its windows', file: FILE, edits: [...SILENCE,
    ['             coalesce(sum(greatest(coalesce(c.qty, 0), 0)), 0),  coalesce(sum(greatest(-coalesce(c.qty, 0), 0)), 0),', '             coalesce(sum(greatest(coalesce(c.qty, 0), 0)), 0),  0,']] },
  { id: 'items_keep_the_last', arm: 'LF-CONSERVE', why: 'the model keeps a window\'s last loot instead of its sum', file: FILE, edits: [...SILENCE,
    ['                "i": {"*": "sum"}, "x": {"*": "sum"}, "st": {"*": "sum"}, "k": "names",', '                "i": {"*": "last"}, "x": {"*": "sum"}, "st": {"*": "sum"}, "k": "names",']] },
  { id: 'row_goes_without_a_window', arm: 'LF-LOCKS', why: 'past detail_days a ledger row is deletable with no window', file: FILE, edits: [...SILENCE, [HELD_BY_A_WINDOW, '         then']] },
  { id: 'row_goes_without_a_window_seen_at_apply', arm: 'LF-SELFCHECK', why: 'the same, with the file\'s own §6 left on', file: FILE, edits: [[HELD_BY_A_WINDOW, '         then']] },
  { id: 'unknown_key_folded_away', arm: 'LF-LEFT', why: 'a key the model lacks is dropped and its row folded', file: FILE, edits: [...SILENCE,
    ["    if node is null then return jsonb_build_object('ok', false, 'why', 'key ' || p_path || k); end if;", '    continue when node is null;'],
    ["    node := coalesce(p_model -> k, p_model -> '*');\n    if jsonb_typeof(node) = 'object' then\n      a := a || jsonb_build_object(k, public.hr_ledger_meta_merge(node, a -> k, v));",
      "    node := coalesce(p_model -> k, p_model -> '*');\n    continue when node is null;\n    if jsonb_typeof(node) = 'object' then\n      a := a || jsonb_build_object(k, public.hr_ledger_meta_merge(node, a -> k, v));"]] },
  { id: 'typed_row_folded', arm: 'LF-SELFCHECK', why: 'a row with an item_id folds and loses it', file: FILE, edits: [
    ['                 (l.item_id is null and l.skill_id is null) as typed,', '                 true as typed,'],
    ['                             or l.item_id is not null or l.skill_id is not null\n', '']] },
  { id: 'scope_ignored', arm: 'LF-SELFCHECK', why: 'a call for one account folds everyone', file: FILE, edits: [
    ['             and (p_only is null or l.user_id = p_only)\n             and m.model is not null) c', '             and m.model is not null) c']] },
  { id: 'dry_run_writes', arm: 'LF-DRY', why: 'the dry run is volatile and moves the cursor\'s counters', file: FILE, edits: [...SILENCE,
    ['returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$\ndeclare\n  v_t0 constant timestamptz := clock_timestamp();\n  r jsonb; v_lo timestamptz; v_hi timestamptz; v_w interval;\n  v_seen bigint := 0; v_ok bigint := 0; v_windows bigint := 0; v_left jsonb := \'[]\'::jsonb; v_by jsonb := \'[]\'::jsonb;\nbegin\n',
      'returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$\ndeclare\n  v_t0 constant timestamptz := clock_timestamp();\n  r jsonb; v_lo timestamptz; v_hi timestamptz; v_w interval;\n  v_seen bigint := 0; v_ok bigint := 0; v_windows bigint := 0; v_left jsonb := \'[]\'::jsonb; v_by jsonb := \'[]\'::jsonb;\nbegin\n  update public.hr_ledger_fold_state set runs = runs + 1 where only_row;\n']] },
  { id: 'dry_run_volatile_seen_at_apply', arm: 'LF-SELFCHECK', why: 'the dry run is not STABLE, with §6 left on', file: FILE, edits: [
    ['returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$\ndeclare\n  v_t0 constant timestamptz := clock_timestamp();\n  r jsonb; v_lo',
      'returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$\ndeclare\n  v_t0 constant timestamptz := clock_timestamp();\n  r jsonb; v_lo']] },
  { id: 'rollup_drops_xp', arm: 'LF-PRUNE', why: 'the windows\' prune writes no XP to the rollup', file: FILE, edits: [...SILENCE,
    ['             sum(w.n), sum(w.gold_pos), sum(w.gold_neg), sum(w.xp_pos), sum(w.xp_neg),', '             sum(w.n), sum(w.gold_pos), sum(w.gold_neg), 0, 0,']] },
  { id: 'two_days_allowed', arm: 'LF-DIAL', why: 'detail_days may go under the 48 hours a reader looks back', file: FILE, edits: [...SILENCE,
    ['      check (detail_days is null or (detail_days >= 3 and detail_days < retain_days)); end if;', '      check (detail_days is null or (detail_days >= 1 and detail_days < retain_days)); end if;']] },
  { id: 'batch_splits_a_window', arm: 'LF-WINDOWS', why: 'a batch ends at its limit, mid-window', file: FILE, edits: [...SILENCE,
    ['  select date_bin(v_w, x.at, c_origin) + v_w into v_hi\n', '  select x.at + interval \'1 microsecond\' into v_hi\n']] },
  { id: 'fold_fires_off_the_seven', arm: 'LF-DRILL', why: 'the fold fires on another minute of ten, under the restore drill\'s read of the ledger', file: FILE, edits: [...SILENCE,
    ["  perform public.hr_cron_ensure('hr-ledger-fold', '7-59/10 * * * *',", "  perform public.hr_cron_ensure('hr-ledger-fold', '2-59/10 * * * *',"]] },
  { id: 'arm_gate_off', arm: 'LF-ARM-REFUSED', why: 'the arm file turns the tier on over a ledger the model misses', file: ARM, edits: [
    ['  if v_seen > 0 and v_fold * 1000 < v_seen * c_fit_permille then', '  if false then']] },
  { id: 'arm_records_nothing', arm: 'LF-ARM', why: 'the arm file keeps no record of what it read', file: ARM, edits: [
    ["  update public.hr_ledger_fold_state set last = v || jsonb_build_object('armed_at', now()), last_at = now() where only_row;\n", ''],
    ["  if (select s.last->>'armed_at' from public.hr_ledger_fold_state s where s.only_row) is null then\n    raise exception 'VERIFY: the dry run was not recorded'; end if;\n", '']] },
];

function plant(sql, edits) {
  let s = sql;
  for (const [find, repl] of edits) {
    const n = s.split(find).length - 1;
    if (n !== 1) throw harness(`mutant anchor matched ${n} times: ${find.slice(0, 90)}`);
    s = s.replace(find, () => repl);
  }
  return s;
}

async function main() {
  const m = await manifest();
  if (!MUTATE) {
    console.log('\nledger-fold — the fold tier on the replayed chain, the jobs run as cron calls them\n');
    const note = String((m._order_notes || {})[FILE] || '');
    const ex = (f) => String((m.excluded || {})[f] || '');
    const ordered = (m.order || []).includes(FILE) && /\b(STAGED|APPLIED)\b/.test(note) && /SECURITY LIST/.test(note)
      && !(m.order || []).includes(ARM) && !(m.order || []).includes(OFF) && /\bSTAGED\b/.test(ex(ARM)) && /NOT REVERSIBLE/.test(ex(ARM)) && /explicit go/.test(ex(ARM)) && /\bSTAGED\b/.test(ex(OFF));
    console.log(ordered ? `  ✓ LF-ORDER — ${FILE} is in \`order\` (on the EA Security list); the arm (not reversible, on an explicit go) and the kill switch are STAGED in \`excluded\``
      : '  ✗ LF-ORDER — the install file must be in `order` with a note naming the Security list; the arm and the kill switch STAGED in `excluded`, the arm\'s note saying it is not reversible');
    let db, red;
    try { ({ db } = await bootReplay()); red = await scenario(db, SRC); }
    catch (e) { console.error(`ledger-fold: HARNESS — ${String(e.message).split('\n').slice(0, 3).join(' ')}`); process.exit(2); }
    const n = red.size + (ordered ? 0 : 1);
    console.log(n ? `\nledger-fold: RED (${n})` : '\nledger-fold: green');
    process.exit(n ? 1 : 0);
  }
  console.log('\nledger-fold --mutate\n');
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
  let survived = 0;
  for (const mu of MUTANTS.filter((x) => !only || x.id === only)) {
    let src = SRC, db = null, red = null;
    try {
      const patches = !CONTROL && mu.file === FILE ? new Map([[FILE, mu.edits]]) : undefined;
      if (!CONTROL && mu.file !== FILE) src = { ...SRC, arm: plant(SRC.arm, mu.edits) };
      else if (!CONTROL) src = { ...SRC, file: plant(SRC.file, mu.edits) };
      try { ({ db } = await bootReplay(patches ? { patches, upTo: LAST_PATCHED } : {})); }
      catch (e) {
        if (e.harness) throw e;
        /* the chain refused the patched file: that is its §6, if it says so in its own words */
        red = new Map(/VERIFY\([a-i]\)/.test(String(e.message)) ? [['LF-SELFCHECK', String(e.message).split('\n')[0]]] : [['(the replay failed)', String(e.message).split('\n')[0]]]);
      }
      /* the control (HR_MUTANT_CONTROL: nothing planted) prints every arm: one red there is this guard's own defect */
      if (!red) red = await scenario(db, src, { real: false, quiet: !CONTROL });
    } catch (e) {
      console.error(`ledger-fold: HARNESS — ${mu.id}: ${String(e.message).split('\n').slice(0, 2).join(' ')}`);
      process.exit(2);
    } finally { if (db && db.close) await db.close().catch(() => {}); }
    const caught = red.has(mu.arm);
    console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red arms: ${[...red.keys()].join(', ') || 'none'}`);
    if (!caught) survived++;
  }
  console.log(survived ? `\nledger-fold --mutate: ${survived} SURVIVED` : '\nledger-fold --mutate: every planted defect was caught by its arm');
  process.exit(survived ? 1 : 0);
}
await main();
