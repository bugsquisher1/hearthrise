#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/audit-2026-11-19-server/scale-probe.mjs — the 2026-11-19 server audit's measurements.
//
//   node tools/qa/audit-2026-11-19-server/scale-probe.mjs [--n 300] [--windows 30] [--json out.json]
//
// READ-ONLY toward everything but its own in-memory PGlite replay of the chain (tests/schema-replay.mjs); every
// part runs inside one transaction that is rolled back. The edge is the shipped one (tick.js runTick,
// hunt-settle.js settleHunt), the cron is the shipped hr_tick_cron_run, the fixtures are the standing guards'
// (tests/hunt-sessions-settle.mjs HARNESS; tests/hunt-tick-shards.mjs's outage kit, restated here because it is
// not exported).
//
//   PART A  one hunt-hour on the world tick (browser closed), a lone hero and a party of four on real grounds, in
//           the steady 100 s windows: statements (= pooled transactions) a settle, engine CPU a settle, rows
//           written a settle by table, ledger rows a hero-hour by kind, WAL bytes a settle.
//   PART B  the fan-out dial: N lone hunts all due. Instances and bodies a fire leases; fires to lease them all;
//           hr_tick_cron_run's own time with N open sessions (due, and not due).
//   PART C  one body of four four-hero parties under the shipped engine budget (HUNT_ENGINE_BUDGET_MS), on a CPU
//           clock: how many settle and how many are deferred (cpu_budget), and the body's engine CPU.
//
// Counts, rows and bytes are the SQL's own and hold on any machine. Milliseconds are this machine's and PGlite's
// (WASM, one backend): read ratios, never production's absolute time.
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET } from '../../../tests/world-tick-token-shims.mjs';
import { HARNESS } from '../../../tests/hunt-sessions-settle.mjs';
import { bootReplay } from '../../../tests/schema-replay.mjs';

const { ROOT, STRONG, loadEdge, pinDice, hunter, character, one, q, makeExec, groundsOf } = HARNESS;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', 300));
const WINDOWS = Number(arg('--windows', 30));
const JSON_OUT = arg('--json', null);
const WINDOW_MS = 100000;
const uidOf = (i) => '00000000-0000-4000-8000-0000002b' + String(i).padStart(4, '0');
const idem = () => crypto.randomUUID();
const cpuClock = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : null; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (x) => (x === null ? null : Math.round(x * 10) / 10);

/* `body` null keeps the chain's own body dials (1004-tick-pack-heroes.sql: 16 instances and 16 heroes a body); the audit's
   2026-11-19 run set 4 here, the chain's value then. */
async function armCron(db, body = null, bodies = 32) {
  await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
  await db.query(`update public.hr_tick_config set enabled = true, flush_seconds = 90, cadence_seconds = 10, batch_limit = 200,
                    lease_ms = 30000, shards = 1, fold_windows = 1, catchup_windows = 1, hunt_body_max = coalesce($1::int, hunt_body_max), hunt_bodies_max = $2,
                    edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue' where id`, [body, bodies]);
  /* The URL is the guards' own (hr_tick_config_edge_url_ck admits only the project's shape). Nothing is sent: pg_net
     is SHIM_NET, a plain queue table inside PGlite, which has no network. */
  await db.query('delete from net.http_request_queue');
}
async function fire(db) {
  await db.query('delete from net.http_request_queue');
  const t0 = performance.now();
  await one(db, 'select public.hr_tick_cron_run()');
  const ms = performance.now() - t0;
  const bodies = (await q(db, `select convert_from(body, 'UTF8') as b from net.http_request_queue order by id`))
    .map((r) => JSON.parse(r.b)).filter((b) => Array.isArray(b.hunts) && b.hunts.length);
  return { ms, bodies };
}
const tuples = async (db) => Object.fromEntries((await q(db, `select relname, (n_tup_ins)::int as i, (n_tup_upd)::int as u, (n_tup_del)::int as d
  from pg_stat_xact_user_tables where schemaname = 'public' and n_tup_ins + n_tup_upd + n_tup_del > 0`)).map((r) => [r.relname, r]));
const tupleDiff = (a, b) => {
  const out = {};
  for (const k of Object.keys(b)) {
    const x = a[k] || { i: 0, u: 0, d: 0 };
    const d = { i: b[k].i - x.i, u: b[k].u - x.u, d: b[k].d - x.d };
    if (d.i + d.u + d.d > 0) out[k] = d;
  }
  return out;
};
const walPos = async (db) => { try { return Number(await one(db, `select (pg_current_wal_insert_lsn() - '0/0'::pg_lsn)::bigint`)); } catch { return null; } };

/* a counting exec: statements (each is one pooled transaction in index.ts execTick), time by the function it calls */
function countingExec(db) {
  const base = makeExec(db);
  const stat = { n: 0, by: {} };
  const exec = async (text, params) => {
    /* the hunt read names hr_rate_gate first (null on the tick's door): label it by what it reads */
    const s = String(text);
    const name = s.includes('hr_hunt_instance_read') ? 'hr_hunt_instance_read'
      : (s.match(/public\.(hr_[a-z0-9_]+)/) || [null, 'holder (per body)'])[1];
    const t0 = performance.now();
    try { return await base(text, params); } finally {
      const ms = performance.now() - t0;
      stat.n += 1;
      const b = stat.by[name] || (stat.by[name] = { n: 0, ms: 0 });
      b.n += 1; b.ms += ms;
    }
  };
  return { exec, stat };
}

/* `n` parties of `size` on a real ground (tests/hunt-tick-shards.mjs outageParties' shape and kit). */
const WORDS = ['Alder', 'Birch', 'Cedar', 'Dogwood', 'Elm', 'Fir', 'Gorse', 'Hazel'];
async function parties(db, M, n, size, hunt, kit, base) {
  const asUser = (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const out = [];
  for (let k = 0; k < n; k++) {
    const uids = Array.from({ length: size }, (_, i) => uidOf(base + k * 10 + i));
    for (const uid of uids) await character(db, M, uid, kit);
    if (size > 1) {
      for (let i = 1; i < size; i++) {
        await asUser(uids[i]);
        const nm = await one(db, 'select public.hr_character_name_set(0, $1, $2::uuid)', [`${WORDS[k]}probe ${'ABCDEF'[i]}`, idem()]);
        if (!nm || nm.ok !== true) throw new Error('name refused: ' + JSON.stringify(nm));
      }
      await asUser(uids[0]);
      const inv = await one(db, 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', [`${WORDS[k]}probe B`, idem()]);
      if (!inv || inv.ok !== true) throw new Error('invite refused: ' + JSON.stringify(inv));
      const party = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [uids[0]]);
      await db.query('update public.hunt_parties set hunt_id = $2 where id = $1', [party, hunt]);
      const listed = await one(db, 'select public.hr_hunt_party_list(0, true, $1::uuid)', [idem()]);
      if (!listed || listed.ok !== true) throw new Error('list refused: ' + JSON.stringify(listed));
      for (let i = 1; i < size; i++) {
        await asUser(uids[i]);
        const j = await one(db, 'select public.hr_hunt_party_join(0, $1::uuid, $2::uuid)', [party, idem()]);
        if (!j || j.ok !== true) throw new Error('join refused: ' + JSON.stringify(j));
      }
    }
    const sids = [];
    for (const uid of uids) {
      await asUser(uid);
      const e = await one(db, 'select public.hr_hunt_enter(0, $1, $2::jsonb, 0, null, $3::uuid)', [hunt, JSON.stringify(kit.bag), idem()]);
      if (!e || e.ok !== true) throw new Error('enter refused: ' + JSON.stringify(e));
      sids.push(e.session.id);
    }
    const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sids[0]]);
    out.push({ uids, sids, inst });
  }
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  return out;
}
async function backdate(db, sids, secs) {
  const t = `date_trunc('second', now() - make_interval(secs => ${Number(secs)}))`;
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t},
                    next_swing_at = ${t} where id = any ($1::uuid[])`, [sids]);
  await db.query(`update public.hunt_instances i set settled_to = ${t}, next_swing_at = ${t}
                    from public.hunt_sessions h where h.instance_id = i.id and h.id = any ($1::uuid[])`, [sids]);
}
const nowMsOf = async (db) => Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
const inSave = async (db, name, fn) => {
  await db.query(`savepoint ${name}`);
  try { return await fn(); } finally { await db.query(`rollback to savepoint ${name}`); }
};

/* PART A: `windows` steady windows of one instance on the world tick. */
async function hourOnTheTick(db, M, fx, label, windows) {
  const sids = fx.flatMap((p) => p.sids);
  const heroes = sids.length;
  const startBehind = (windows + 2) * (WINDOW_MS / 1000);
  await backdate(db, sids, startBehind);
  await armCron(db);
  const nowMs = await nowMsOf(db);
  const start = Math.floor((nowMs - startBehind * 1000) / 1000) * 1000;
  const { exec, stat } = countingExec(db);
  const rows = []; const wal = []; const eng = []; const stmts = []; const dbms = []; const cron = [];
  const byTable = {};
  const led0 = Number(await one(db, 'select count(*) from public.player_ledger where session_id = any ($1::uuid[])', [sids]));
  let ran = 0; let ended = null; const outcomes = {};
  for (let k = 1; k <= windows; k++) {
    await db.query(`update public.hunt_tick_lease set lease_until = now() - interval '1 second' where session_id = any ($1::uuid[])`, [sids]);
    const t0 = await tuples(db); const w0 = await walPos(db); const n0 = stat.n;
    const ms0 = Object.values(stat.by).reduce((a, b) => a + b.ms, 0);
    const f = await fire(db);
    const mine = f.bodies.filter((b) => b.hunts.some((h) => sids.includes(h.session_id)));
    if (!mine.length) { ended = `no body at window ${k}`; break; }
    let h = null;
    for (const b of mine) {
      h = (await M.TK.runTick({ exec, atMs: start + k * WINDOW_MS, body: b, engineClock: cpuClock, grounds: groundsOf(M) })).body.hunts || {};
      for (const [kk, v] of Object.entries(h.reasons || {})) outcomes[kk] = (outcomes[kk] || 0) + v;
    }
    const t1 = await tuples(db); const w1 = await walPos(db);
    const d = tupleDiff(t0, t1);
    if (!h || !h.settled) { ended = `window ${k}: ${JSON.stringify(h)}`; break; }
    ran += 1;
    cron.push(f.ms);
    let total = 0;
    for (const [tname, v] of Object.entries(d)) {
      const b = byTable[tname] || (byTable[tname] = { i: 0, u: 0, d: 0 });
      b.i += v.i; b.u += v.u; b.d += v.d; total += v.i + v.u + v.d;
    }
    rows.push(total);
    if (w0 !== null && w1 !== null) wal.push(w1 - w0);
    if (Number.isFinite(h.engine_ms)) eng.push(h.engine_ms);
    stmts.push(stat.n - n0);
    dbms.push(Object.values(stat.by).reduce((a, b) => a + b.ms, 0) - ms0);
    if (h.ended) { ended = `a hunt ended at window ${k}`; break; }
  }
  const led = await q(db, `select kind, intent, count(*)::int as n, round(avg(pg_column_size(l.*)))::int as row_bytes
    from public.player_ledger l where session_id = any ($1::uuid[]) group by 1, 2 order by 3 desc`, [sids]);
  const ledN = led.reduce((a, r) => a + r.n, 0) - led0;
  const hours = ran * WINDOW_MS / 3600000;
  const intents = Number(await one(db, 'select count(*) from public.player_intents where user_id = any ($1::uuid[])', [fx.flatMap((p) => p.uids)]));
  const tally = await q(db, 'select round(avg(pg_column_size(t.*)))::int as b from public.hunt_session_tally t where session_id = any ($1::uuid[])', [sids]);
  const world = await q(db, 'select octet_length(world) as b from public.hunt_instances where id = any ($1::uuid[])', [fx.map((p) => p.inst)]);
  return {
    label, heroes, windows_ran: ran, stopped: ended, outcomes,
    statements_a_settle: med(stmts), statements_by_function: Object.fromEntries(Object.entries(stat.by).map(([k, v]) => [k, { calls_a_settle: r1(v.n / Math.max(1, ran)), pglite_ms_a_call: r1(v.ms / v.n) }])),
    pooled_transactions_a_settle: med(stmts), network_round_trips_a_settle: med(stmts) * 4,
    engine_cpu_ms_a_settle: { med: r1(med(eng)), p95: r1(p95(eng)) },
    pglite_db_ms_a_settle: { med: r1(med(dbms)), p95: r1(p95(dbms)) },
    cron_run_pglite_ms: r1(med(cron)),
    row_writes_a_settle: { med: med(rows), p95: p95(rows), mean: r1(mean(rows)) },
    row_writes_a_settle_by_table: Object.fromEntries(Object.entries(byTable).sort((a, b) => (b[1].i + b[1].u + b[1].d) - (a[1].i + a[1].u + a[1].d))
      .map(([k, v]) => [k, { ins: r1(v.i / ran), upd: r1(v.u / ran), del: r1(v.d / ran) }])),
    wal_bytes_a_settle: { med: med(wal), mean: r1(mean(wal)) },
    ledger_rows_total: ledN, ledger_rows_a_hero_hour: r1(ledN / heroes / hours), ledger_by_kind: led,
    player_intents_rows: intents, intents_a_hero_hour: r1(intents / heroes / hours),
    tally_row_bytes: tally[0] && tally[0].b, world_bytes: world.map((w) => w.b),
  };
}

/* PART B: N lone hunts all due at once. */
async function fanOut(db, M, n) {
  const t0 = Date.now();
  const first = await hunter(db, M, STRONG);
  const sids = [first.sid];
  for (let i = 1; i < n; i++) {
    const uid = uidOf(5000 + i);
    await character(db, M, uid, STRONG);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const e = await one(db, `select public.hr_hunt_enter(0, 'mill_cellar', $1::jsonb, 0, null, $2::uuid)`, [JSON.stringify(STRONG.bag), idem()]);
    if (!e || e.ok !== true) throw new Error('enter refused: ' + JSON.stringify(e));
    sids.push(e.session.id);
  }
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  const buildMs = Date.now() - t0;
  await armCron(db);
  /* nothing due: every session settled 20 s ago */
  await backdate(db, sids, 20);
  const idle = [];
  for (let i = 0; i < 5; i++) idle.push((await fire(db)).ms);
  /* all due: every session owed 100 s */
  await backdate(db, sids, 100);
  const fires = [];
  let leased = 0;
  for (let k = 1; k <= 40 && leased < n; k++) {
    const f = await fire(db);
    const inst = f.bodies.reduce((a, b) => a + b.hunts.length, 0);
    leased += inst;
    fires.push({ fire: k, cron_ms: r1(f.ms), bodies: f.bodies.length, sessions: inst, largest_body: Math.max(0, ...f.bodies.map((b) => b.hunts.length)) });
    if (!inst) break;
  }
  /* one body settled by the shipped runTick on the shipped budget: lone hunts on the fixture ground */
  await db.query('update public.hunt_tick_lease set lease_until = now() - interval \'1 second\'');
  const f = await fire(db);
  const { exec, stat } = countingExec(db);
  const bodies = [];
  for (const b of f.bodies.slice(0, 3)) {
    const t1 = performance.now();
    const h = (await M.TK.runTick({ exec, body: b, engineClock: cpuClock, grounds: groundsOf(M) })).body.hunts || {};
    bodies.push({ sessions: b.hunts.length, settled: h.settled, deferred: h.deferred || 0, engine_ms: h.engine_ms, wall_ms: r1(performance.now() - t1) });
  }
  /* THE DRAIN (added 2026-11-19, lane/c-server-cost): every due hunt settled end to end. Each fire leases, and EVERY body it
     posts runs through the shipped runTick on the shipped budget (a CPU clock), so a body's deferred tail gives its leases
     back (1004-tick-pack-heroes.sql) and rides the next fire; fires until no session is still owed its 100 s. */
  await db.query('update public.hunt_tick_lease set lease_until = now() - interval \'1 second\'');
  // (the sample bodies above already settled their sessions: the drain takes every one still owed, never backdating a settled one)
  const drain = { fires: 0, bodies: 0, settled: 0, deferred: 0, freed: 0, engine_ms: 0, max_body_engine_ms: 0 };
  const owed = async () => Number(await one(db, `select count(*) from public.hunt_sessions where id = any ($1::uuid[]) and ended_at is null
                                                   and settled_to <= now() - interval '90 seconds'`, [sids]));
  for (let k = 1; k <= 40 && await owed() > 0; k++) {
    const fd = await fire(db);
    if (!fd.bodies.length) break;
    drain.fires = k;
    for (const b of fd.bodies) {
      const h = (await M.TK.runTick({ exec: makeExec(db), body: b, engineClock: cpuClock, grounds: groundsOf(M) })).body.hunts || {};
      drain.bodies += 1; drain.settled += h.settled || 0; drain.deferred += h.deferred || 0; drain.freed += h.freed || 0; drain.refused = (drain.refused || 0) + (h.refused || 0);
      drain.engine_ms += h.engine_ms || 0; drain.max_body_engine_ms = Math.max(drain.max_body_engine_ms, h.engine_ms || 0);
    }
  }
  drain.still_owed = await owed();
  drain.seconds_to_settle_all = drain.fires * 10;
  return { n, fixture_build_s: Math.round(buildMs / 1000), cron_run_ms_nothing_due: { med: r1(med(idle)), max: r1(Math.max(...idle)) },
    fires, fires_to_lease_all: fires.filter((x) => x.sessions).length, seconds_to_lease_all: fires.filter((x) => x.sessions).length * 10,
    sample_bodies: bodies, statements_in_sample: stat.n, drain };
}

/* PART C: one body of `n` four-hero parties, the shipped budget, a CPU clock. */
async function fullBody(db, M, n, hunt, kit) {
  const fx = await parties(db, M, n, 4, hunt, kit, 700);
  const sids = fx.flatMap((p) => p.sids);
  await backdate(db, sids, 100);
  await armCron(db, n, 32);
  const f = await fire(db);
  const { exec } = countingExec(db);
  const out = [];
  for (const b of f.bodies) {
    const c0 = cpuClock();
    const h = (await M.TK.runTick({ exec, body: b, engineClock: cpuClock })).body.hunts || {};
    out.push({ sessions: b.hunts.length, settled: h.settled, deferred: h.deferred || 0, reasons: h.reasons, engine_ms: h.engine_ms, engine_max_ms: h.engine_max_ms, process_cpu_ms: Math.round(cpuClock() - c0) });
  }
  return { parties: n, hunt, bodies: out };
}

const t00 = Date.now();
const { db } = await bootReplay();
await pinDice(db);
const M = await loadEdge(ROOT);
const result = { at: new Date().toISOString(), node: process.version, budget_ms: M.HS.HUNT_ENGINE_BUDGET_MS, span_ms: M.HS.HUNT_SETTLE_SPAN_MS,
  dials: (await q(db, 'select cadence_seconds, flush_seconds, lease_ms, hunt_body_max, hunt_body_heroes, hunt_bodies_max, shards from public.hr_tick_config where id'))[0] };
const KIT10 = { level: 10, inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }], gold: 200000 };
const KIT20 = { level: 20, inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }], gold: 200000 };
await db.query('begin');
try {
  const part = async (name, fn) => {
    const t0 = Date.now();
    try { result[name] = await inSave(db, name.replace(/[^a-z0-9_]/gi, '_'), fn); }
    catch (e) { result[name] = { error: String(e && e.message || e).slice(0, 400) }; }
    console.error(`${name}: ${Math.round((Date.now() - t0) / 1000)} s`);
  };
  await part('A_lone_thicket_L10', async () => hourOnTheTick(db, M, await parties(db, M, 1, 1, 'meadowbrook_thicket', KIT10, 100), 'lone hero, meadowbrook_thicket, Level 10', WINDOWS));
  await part('A_party4_sewer_L20', async () => hourOnTheTick(db, M, await parties(db, M, 1, 4, 'millrace_sewer', KIT20, 200), 'party of four, millrace_sewer, Level 20', WINDOWS));
  await part('C_full_body_4x4', async () => fullBody(db, M, 4, 'millrace_sewer', KIT20));
  await part('B_fan_out', async () => fanOut(db, M, N));
} finally { await db.query('rollback'); }
result.total_s = Math.round((Date.now() - t00) / 1000);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
process.exit(0);
