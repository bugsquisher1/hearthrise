// ============================================================================
// tests/world-tick-scale.mjs — THE WORLD TICK SCALES PAST THE OWNED COHORT
//
//   node tests/world-tick-scale.mjs            the guard
//   node tests/world-tick-scale.mjs --mutate   every mutant must go RED
//
// docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, section "Scale" (the
// stage 2/3 prerequisites of the gather widen: S1 due-only roster, S2 sharded
// fires, S3 multi-window catch-up, S4 ledger fold). Every claim is re-measured
// on the PGlite chain replay; the cost claims are STRUCTURAL (counted function
// calls and ledger rows under pg_stat_user_functions), never wall-clock.
//
//   S1 — supabase/migrations/2026-10-11-world-tick-due-roster.sql
//   P-IDEM  the newest file of this lane re-applies byte-identically
//   R1  ★ a due armed gatherer (10 min) is rostered and leased; `state` NULL
//   R2  ★ not due (30 s, 89 s): not rostered, lease untouched
//   R3  the boundary: one flush exactly is due
//   R4  ★ shadow uses the chained mark (raw 2 h, chain 20 s -> not due;
//           chain 5 min -> due, served at the chain mark)
//   R5  the line follows hr_tick_config.flush_seconds
//   R6  ★ THE EDGE AGREES: every character the roster serves, driven through
//           the shipped runTick, is settled — never a `below_flush` skip
//   R7  ★ NO HYDRATION: a roster call over due characters calls hr_state_of
//           zero times (pg_stat_user_functions)
//   R8  grants: hr_tick only
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { runTick } from '../supabase/functions/hr-accrue/tick.js';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);

/* This lane's files, OLDEST FIRST. The newest is the one P-IDEM re-applies
   (each file's §0 accepts its predecessor's body or its own, so an older file
   re-applied over a newer body refuses by design). */
const LANE = [
  '2026-10-11-world-tick-due-roster.sql',
];
const read = async (f) => (await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8')).replace(/\r\n/g, '\n');
const SQL = Object.fromEntries(await Promise.all(LANE.map(async (f) => [f, await read(f)])));
const NEWEST = LANE[LANE.length - 1];

/** The chain-end `create or replace function public.<name>(` statement of this lane, verbatim. */
function fnSource(name) {
  for (const f of [...LANE].reverse()) {
    const sql = SQL[f];
    const start = sql.indexOf(`create or replace function public.${name}(`);
    if (start < 0) continue;
    const as = sql.indexOf('\nas $$', start);
    const end = sql.indexOf('$$;', as + 6);
    if (as < 0 || end < 0) break;
    return sql.slice(start, end + 3);
  }
  throw Object.assign(new Error(`${name} not found in this lane's files`), { harness: true });
}

/* A fresh character per run: player_ledger is append-only (hr_ledger_immutable),
   so a fixture is never reused across the control and mutant runs. */
let RUN = 0;
const U = (n) => `00000000-0000-4000-8000-${(0x7200 + RUN).toString(16).padStart(4, '0')}${n.toString(16).padStart(8, '0')}`;

async function arms(db, { log = true } = {}) {
  RUN += 1;
  const red = [];
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) { if (log) console.log(`  ✓ ${id} — ${okMsg}`); }
    else { red.push(id); if (log) console.log(`  ✗ ${id} — ${badMsg}`); }
  };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const cfg = (set) => db.exec(`update public.hr_tick_config set ${set} where id;`);
  const gact = (await one("select activity_id from public.hr_activities where kind = 'gather' order by activity_id limit 1"))?.activity_id;
  const cact = (await one("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1"))?.activity_id;
  if (!gact || !cact) throw Object.assign(new Error('hr_activities lacks a gather or combat row'), { harness: true });
  const HOLDER = (await one("select left('cron:' || coalesce(current_database(), 'db'), 64) as h")).h;

  /* A clean tick cohort per run: every arm reads the roster, and earlier
     runs' (control, mutant) rows must not be in it. */
  await db.exec('delete from public.hr_tick_ownership;');
  await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['gather'],"
    + " flush_seconds = 90, cadence_seconds = 10, batch_limit = 200, lease_ms = 30000,"
    + " edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue'");

  /** A character `ageS` seconds behind; owned on its channel; optional shadow chain age. */
  const char = async (u, { ageS = 600, kind = 'gather', chainS = null } = {}) => {
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
    await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                              active_kind, active_id, active_since)
             values ($1, 0, 0, 0, 10, 10, 1, date_trunc('milliseconds', now()) - make_interval(secs => $2), $3, $4,
                     now() - interval '3 hours')
             on conflict (user_id, slot) do update set version = 1, gold = 0,
               accrued_to = excluded.accrued_to, active_kind = excluded.active_kind,
               active_id = excluded.active_id, active_since = excluded.active_since`,
    [u, ageS, kind, kind === 'combat' ? cact : gact]);
    await q(`insert into public.hr_tick_ownership (user_id, slot, channel, owned, shadow_accrued_to)
             values ($1, 0, $2, true, case when $3::int is null then null
                                           else date_trunc('milliseconds', now()) - make_interval(secs => $3::int) end)`,
    [u, kind, chainS]);
    return u;
  };
  const roster = (kinds, holder = 'scale-proof', shard = 0) => q(
    `select * from public.hr_tick_roster($1::text[], $2, 500, $3, 30000, null::timestamptz, null::uuid, null::int)`,
    [kinds, shard, holder]);
  const lease = async (u, ch = 'gather') => (await one(
    'select lease_holder from public.hr_tick_ownership where user_id = $1 and slot = 0 and channel = $2', [u, ch]))?.lease_holder ?? null;
  const calls = async (fn) => {
    await q('select pg_stat_force_next_flush()');
    return Number((await one('select coalesce(sum(calls), 0)::int as n from pg_stat_user_functions where funcname = $1', [fn])).n);
  };
  await db.exec("set track_functions = 'all'");

  // ── S1 ──────────────────────────────────────────────────────────────────
  {
    const due = await char(U(1), { ageS: 600 });
    const fresh = await char(U(2), { ageS: 30 });
    const near = await char(U(3), { ageS: 89 });
    const edge = await char(U(4), { ageS: 90 });
    const chainFresh = await char(U(5), { ageS: 7200, kind: 'combat', chainS: 20 });
    const chainDue = await char(U(6), { ageS: 7200, kind: 'combat', chainS: 300 });
    const hydr0 = await calls('hr_state_of');
    const rows = await roster(['gather', 'combat']);
    const hydr = (await calls('hr_state_of')) - hydr0;
    const by = Object.fromEntries(rows.map((r) => [String(r.user_id), r]));

    ok('R1', !!by[due] && by[due].state === null && (await lease(due)) === 'scale-proof',
      'a gatherer 10 min behind is rostered and leased, and its row carries no hydrated state',
      `due row ${JSON.stringify(by[due] ? { state: by[due].state } : null)} lease ${await lease(due)}`);
    ok('R2', !by[fresh] && !by[near] && (await lease(fresh)) === null && (await lease(near)) === null,
      'gatherers 30 s and 89 s behind are neither rostered nor leased',
      `fresh ${!!by[fresh]}/${await lease(fresh)} near ${!!by[near]}/${await lease(near)}`);
    /* THE BOUNDARY, ON ONE CLOCK. now() is the transaction's, so a mark set to
       now() - 90 s and read by the roster in the same transaction is EXACTLY
       one flush old — the only way to tell `<=` from `<`. */
    await db.exec('begin');
    let atLine;
    try {
      await q("update public.player_state set accrued_to = now() - interval '90 seconds' where user_id = $1", [edge]);
      await q("update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = $1", [edge]);
      atLine = (await roster(['gather'], 'scale-proof-line')).some((r) => String(r.user_id) === edge);
    } finally { await db.exec('commit'); }
    ok('R3', !!by[edge] && atLine, 'a mark exactly one flush (90 s) old is due, on the same clock',
      `the one-flush boundary was not served (later clock ${!!by[edge]}, same clock ${atLine})`);
    const chainMark = (await one(`select shadow_accrued_to from public.hr_tick_ownership
                                   where user_id = $1 and channel = 'combat'`, [chainDue])).shadow_accrued_to;
    ok('R4', !by[chainFresh] && !!by[chainDue]
        && new Date(by[chainDue].accrued_to).getTime() === new Date(chainMark).getTime(),
      'shadow combat is due on its CHAIN: raw 2 h + chain 20 s is not served; chain 5 min is, at the chain mark',
      `chainFresh ${!!by[chainFresh]}, chainDue ${by[chainDue] ? by[chainDue].accrued_to : 'absent'} vs ${chainMark}`);
    ok('R7', hydr === 0 && rows.length >= 3,
      `a roster call serving ${rows.length} due characters called hr_state_of 0 times`,
      `the roster called hr_state_of ${hydr} time(s) for ${rows.length} rows — it hydrates again`);

    // R5 the line follows the config
    await db.exec('update public.hr_tick_ownership set lease_holder = null, lease_until = null;');
    await cfg('flush_seconds = 600');
    const r600 = (await roster(['gather'])).map((r) => String(r.user_id));
    const five = await char(U(7), { ageS: 300 });
    const r600b = (await roster(['gather'], 'scale-proof-2')).map((r) => String(r.user_id));
    await cfg('flush_seconds = 90');
    ok('R5', r600.includes(due) && !r600.includes(edge) && !r600b.includes(five),
      'at flush 600 s the 10 min gatherer is due and the 90 s / 5 min ones are not',
      `flush 600: ${JSON.stringify({ due: r600.includes(due), edge: r600.includes(edge), five: r600b.includes(five) })}`);

    // R6 the edge agrees with the roster
    await db.exec('update public.hr_tick_ownership set lease_holder = null, lease_until = null;');
    await q("delete from public.hr_tick_ownership where channel = 'combat'");
    const served = await roster(['gather'], HOLDER);
    const exec = async (text, params) => {
      await db.exec('begin'); await db.exec('set local role hr_engine');
      try { return (await db.query(text, params)).rows; } finally { await db.exec('commit'); }
    };
    let fire;
    try {
      fire = (await runTick({ exec, probe: false,
        body: { op: 'tick', roster: served.map((r) => ({ user_id: String(r.user_id), slot: r.slot })),
          cadence_ms: 10000, flush_ms: 90000 } })).body;
    } catch (e) { fire = { threw: String(e.message).slice(0, 120) }; }
    const reasons = (fire && fire.reasons) || {};
    ok('R6', served.length >= 3 && fire && fire.ok === true && !reasons.below_flush
        && fire.processed === served.length,
      `the shipped runTick settled every one of the ${served.length} characters the roster served `
      + `(processed ${fire && fire.processed}, no below_flush)`,
      `served ${served.length}; fire ${JSON.stringify(fire)}`);

    // R8 grants
    const sig = 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)';
    const g = {};
    for (const role of ['hr_tick', 'hr_engine', 'anon', 'authenticated', 'service_role']) {
      g[role] = (await one('select has_function_privilege($1, $2, \'execute\') as x', [role, sig])).x;
    }
    ok('R8', g.hr_tick && !g.hr_engine && !g.anon && !g.authenticated && !g.service_role,
      'hr_tick_roster EXECUTE is hr_tick only among the request roles', JSON.stringify(g));
  }

  return red;
}

const bodies = async (db) => (await db.query(
  `select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as h from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('hr_tick_roster', 'hr_tick_cron_run', 'hr_shard_of')
    order by 1`)).rows.map((r) => r.h).join(',');

async function boot() {
  const { db } = await bootReplay({ upTo: NEWEST });
  return db;
}

if (!MUTATE) {
  console.log('\nworld-tick-scale: the tick serves only what is due, fans out, catches up and folds — paying exactly what single windows pay');
  let db;
  try { db = await boot(); } catch (e) {
    console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
  }
  const inv0 = JSON.stringify(await inventory(db));
  const b0 = await bodies(db);
  let err = null;
  try { await db.exec(SQL[NEWEST]); } catch (e) { err = String(e.message).split('\n')[0]; }
  const idem = !err && JSON.stringify(await inventory(db)) === inv0 && (await bodies(db)) === b0;
  console.log(idem
    ? `  ✓ P-IDEM — ${NEWEST} re-applied byte-identically (§0 accepted its own body, its self-check passed twice)`
    : `  ✗ P-IDEM — ${err || 'the re-apply moved the schema or a body'}`);
  let red;
  try { red = await arms(db); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  if (!idem) red.push('P-IDEM');
  console.log(red.length ? `\nRED: ${red.join(', ')}`
    : '\nGREEN: the roster serves only due characters without hydrating them, and the edge settles every one it serves');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate: one function re-created from this lane's chain-end text with
//    one line broken (each file's own self-check md5 lock would refuse a
//    patched FILE before any behaviour ran, which proves the lock, not the arms).
const SRC = { roster: fnSource('hr_tick_roster') };
const GRANTS = 'revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) from public;\n'
  + 'revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) from anon, authenticated, service_role, hr_engine;\n'
  + 'grant  execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) to hr_tick;\n';
const RESTORE = `${SRC.roster}\n${GRANTS}`;
const MUTANTS = [
  { name: 'noDueLine', fn: 'roster', why: 'the roster serves every owned character again (8 of 9 visits wasted)', expect: /R2/,
    find: '       and m.mark <= now() - v_flush\n', repl: '' },
  { name: 'strictDueLine', fn: 'roster', why: 'a mark exactly one flush old waits a fire', expect: /R3/,
    find: '       and m.mark <= now() - v_flush\n', repl: '       and m.mark < now() - v_flush\n' },
  { name: 'dueOnRawMark', fn: 'roster', why: 'the due line reads the raw accrued_to, not the chained mark the edge probes', expect: /R4/,
    find: '       and m.mark <= now() - v_flush\n', repl: '       and ps.accrued_to <= now() - v_flush\n' },
  { name: 'flushConstant', fn: 'roster', why: 'the due line ignores flush_seconds', expect: /R5/,
    find: '       and m.mark <= now() - v_flush\n', repl: "       and m.mark <= now() - interval '90 seconds'\n" },
  { name: 'hydrates', fn: 'roster', why: 'the roster hydrates every row again (17 ms/row nobody reads)', expect: /R1|R7/,
    find: '         null::jsonb                                                     as state',
    repl: '         public.hr_state_of(ps.user_id, ps.slot)                        as state' },
  { name: 'dueTooLate', fn: 'roster', why: 'the due line is two flushes (a due character waits a whole extra flush)', expect: /R3|R6|R1/,
    find: '       and m.mark <= now() - v_flush\n', repl: '       and m.mark <= now() - 2 * v_flush\n' },
  { name: 'grantEngine', fn: 'roster', why: 'hr_engine is granted EXECUTE on the roster', expect: /R8/,
    find: null, repl: '\ngrant execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) to hr_engine;' },
];

console.log('\nworld-tick-scale --mutate: every mutant must go RED on its named arm');
let db;
try { db = await boot(); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const control = await arms(db, { log: false });
if (control.length) { console.error(`harness: the unmutated control is red (${control.join(', ')})`); process.exit(2); }
console.log(`[mutants] ${MUTANTS.length}`);
let survived = 0;
for (const m of MUTANTS) {
  const base = SRC[m.fn];
  let src;
  if (m.find === null) src = base + m.repl;
  else {
    if (base.split(m.find).length !== 2) { console.error(`harness: ${m.name}: anchor matched ${base.split(m.find).length - 1}x`); process.exit(2); }
    src = base.replace(m.find, () => m.repl);
  }
  if (!CONTROL) {
    try { await db.exec(src); } catch (e) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
  }
  let red;
  try { red = await arms(db, { log: false }); } catch (e) { red = [`threw: ${e.message}`]; }
  try { await db.exec('rollback;'); } catch { /* not inside a transaction */ }
  await db.exec(RESTORE);
  const hit = red.some((id) => m.expect.test(id));
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${red.join(', ')}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${red.length ? `red only via ${red.join(', ')}` : 'SURVIVED'}`); }
}
const after = await arms(db, { log: false });
if (after.length) { console.error(`harness: the restored bodies are red (${after.join(', ')})`); process.exit(2); }
await db.close();
if (CONTROL) {
  console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${MUTANTS.length - survived} arm(s) read caught`);
  process.exit(survived === MUTANTS.length ? 0 : 1);
}
console.log(survived ? `\nRED: ${survived} mutant(s) survived` : `\nGREEN: all ${MUTANTS.length} mutants caught`);
process.exit(survived ? 1 : 0);
