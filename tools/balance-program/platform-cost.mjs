#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/platform-cost.mjs — WHERE A SETTLE'S DATABASE TIME GOES, on the replayed chain (48-platform-cost.md;
// lane/d-platform-cost). NO NETWORK. Every fixture is built inside a transaction that is rolled back; nothing is written to disk.
//
//   node tools/balance-program/platform-cost.mjs profile [--only <fixture>]   per fixture of tests/per-player-cost.mjs, settled through its
//        own door (the world tick's bodies, or a watched tab's hello): database ms a settle by STATEMENT the engine sends, and inside
//        them by plpgsql FUNCTION (self time, track_functions = all), journal rows and row writes a settle. PGlite, in this process:
//        the ms are this machine's, read them as SHARES; 48 scales them to production's own per-call means.
//   node tools/balance-program/platform-cost.mjs window [--only <fixture>]    the closed door committed every 100, 300, 600 and 1,200 s
//        over the same 20 simulated minutes: database ms a commit and a hero-hour, journal rows a hero-hour, and PARITY: the heroes'
//        end state (tests/hunt-sessions-settle.mjs snapshot, canon) must be byte-identical whichever cadence settled it.
//        The edge's 2 minute slice (hunt-settle.js HUNT_SETTLE_SPAN_MS) is bypassed HERE ONLY, by proposing the longer window
//        directly: the measurement is "what a commit costs at that cadence", not a claim the edge can simulate it in one request.
//   node tools/balance-program/platform-cost.mjs aged [--only <fixture>]      the closed door with 0, 1,500 and 4,500 journal rows
//        already written today for each hero (production's mean before a commit is 1,452 away and 2,315 watched, its p90 4,600):
//        how a commit's cost grows with the day's journal (the day-budget reads sum today's rows on every settle).
//   node tools/balance-program/platform-cost.mjs ladder                       the account-day and the ladder: pure arithmetic on
//        platform-cost.json (the measured inputs: production reads by platform-cost.local.mjs, this file's own runs), printed as
//        48's tables, judged against the ruled C2 band (standards.mjs).
//   node tools/balance-program/platform-cost.mjs --selftest                   the ladder's arithmetic and its verdict on planted inputs
//
// Reads only. Writes nothing. Not a guard: tests/per-player-cost.mjs is the ratchet; this is the instrument behind 48's ladder.
// mutant-anchors: none — --selftest plants a rung that triples the closed commit into an in-memory copy of the ladder; no tracked file is patched
// ci-step: economy-selftests | Platform cost ladder - its account-day is its hand-computed lines, no rung raises the day, a planted rung that does is caught
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/platform-cost.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const onlyArg = () => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1] : null; };

/* ── THE INSTRUMENTED DOOR ───────────────────────────────────────────────────────────────────────────────────────────── */
/** The statement a call is: the first public function it names (the edge calls functions), else its first word. */
function keyOf(text) {
  /* the settle's read opens with the player door's rate gate (hunt-settle.js HUNT_STATE_SQL): it is the read, not the gate */
  if (/hr_hunt_instance_read/.test(String(text))) return 'settle read (hr_hunt_instance_read)';
  const m = /public\.(hr_[a-z0-9_]+)/.exec(String(text));
  return m ? m[1] : String(text).trim().split(/\s+/)[0].toLowerCase();
}
/** index.ts's exec (tests/hunt-sessions-settle.mjs makeExec: role hr_engine, one statement), timed and counted by statement. */
/* --read-materialized (a MEASUREMENT of a proposed fix, never a patch of the edge): the settle read's `r` CTE as `materialized`, so
   hr_hunt_instance_read runs once and not once a reference to `r.inst` (the inlined CTE duplicates a stable call) */
const MATERIALIZE = argv.includes('--read-materialized');
function timedExec(base, stat) {
  return async (text0, params) => {
    const text = MATERIALIZE ? String(text0).replace(/\br as \(select g\.allowed/, 'r as materialized (select g.allowed') : text0;
    const t0 = performance.now();
    try { return await base(text, params); } finally {
      const k = keyOf(text);
      stat.ms[k] = (stat.ms[k] || 0) + performance.now() - t0;
      stat.n[k] = (stat.n[k] || 0) + 1;
    }
  };
}
const funcs = async (db) => Object.fromEntries((await db.query(`select funcname as f, calls::int as c, self_time::float8 as s
  from pg_stat_xact_user_functions where schemaname = 'public'`)).rows.map((r) => [r.f, { c: r.c, s: r.s }]));
const tables = async (db) => Object.fromEntries((await db.query(`select relname as t, (seq_tup_read + coalesce(idx_tup_fetch, 0))::float8 as rd,
  (n_tup_ins + n_tup_upd + n_tup_del)::int as w, n_tup_ins::int as ins from pg_stat_xact_user_tables where schemaname = 'public'`)).rows
  .map((r) => [r.t, { rd: r.rd, w: r.w, ins: r.ins }]));
const diff = (a, b, f) => Object.fromEntries(Object.keys(b).map((k) => [k, f(b[k], a[k])]).filter(([, v]) => v !== null));
const add = (acc, d, f) => { for (const [k, v] of Object.entries(d)) acc[k] = f(acc[k], v); return acc; };

async function boot() {
  const { bootReplay } = await import('../../tests/schema-replay.mjs');
  const { HARNESS } = await import('../../tests/hunt-sessions-settle.mjs');
  const P = await import('../../tests/per-player-cost.mjs');
  const { db } = await bootReplay();
  await HARNESS.pinDice(db);
  await db.exec(`set track_functions = 'all'`);
  const M = await HARNESS.loadEdge(HARNESS.ROOT);
  return { db, M, H: HARNESS, P };
}

/* per-player-cost.mjs's tick, as the cron drives it (armCron, fire, backdate: restated, that file keeps them private) */
async function armCron(db, H) {
  const { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET } = await import('../../tests/world-tick-token-shims.mjs');
  await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
  await db.query(`update public.hr_tick_config set enabled = true, flush_seconds = 90, cadence_seconds = 10, batch_limit = 200,
                    lease_ms = 30000, shards = 1, fold_windows = 1, catchup_windows = 1, hunt_body_max = 4, hunt_bodies_max = 32,
                    edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue' where id`);
  await db.query('delete from net.http_request_queue');
}
async function fire(db, H) {
  await db.query('delete from net.http_request_queue');
  await H.one(db, 'select public.hr_tick_cron_run()');
  return (await H.q(db, `select convert_from(body, 'UTF8') as b from net.http_request_queue order by id`)).map((r) => JSON.parse(r.b));
}
async function backdate(db, fx, secs) {
  const t = `date_trunc('second', now() - make_interval(secs => ${typeof secs === 'number' ? Number(secs) : secs}))`;
  if (fx.sids.length) {
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t},
                      next_swing_at = ${t} where id = any ($1::uuid[])`, [fx.sids]);
    await db.query(`update public.hunt_instances i set settled_to = ${t}, next_swing_at = ${t}
                      from public.hunt_sessions h where h.instance_id = i.id and h.id = any ($1::uuid[])`, [fx.sids]);
  }
  for (const [u, s] of fx.heroes) {
    if (fx.sids.length) continue;
    await db.query(`update public.player_state set active_since = ${t}, accrued_to = ${t} where user_id = $1 and slot = $2`, [u, s]);
    await db.query(`update public.hr_return_anchor set real_return_at = ${t} where user_id = $1 and slot = $2`, [u, s]);
  }
}
const paidMs = async (db, H, fx) => (fx.sids.length
  ? Number(await H.one(db, 'select coalesce(sum(floor(extract(epoch from settled_to) * 1000)), 0)::bigint from public.hunt_sessions where id = any ($1::uuid[])', [fx.sids]))
  : Number(await H.one(db, `select coalesce(sum(floor(extract(epoch from accrued_to) * 1000)), 0)::bigint from public.player_state
      where (user_id, slot) in (select x.u, x.s from unnest($1::uuid[], $2::int[]) as x(u, s))`, [fx.heroes.map((h) => h[0]), fx.heroes.map((h) => h[1])])));

/* AGED: `rows` journal rows written earlier today for each hero, shaped like a hunted day's (accrue rows with ms, supply rows). */
async function ageLedger(db, fx, rows) {
  if (!rows) return;
  /* history, not a write the game makes: the journal's own triggers (a hunt is open) are skipped for these rows only */
  await db.query(`set local session_replication_role = replica`);
  for (const [u, s] of fx.heroes) {
    await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta, at)
      select $1::uuid, $2::int, case when g % 9 < 4 then 'combat' else 'hunt' end, case when g % 9 < 4 then 'accrue' else 'supply_own' end,
             0, 0, 0, 0, jsonb_build_object('ms', 100000, 'items', jsonb_build_object('cooked_shrimp', 1)),
             greatest(date_trunc('day', now() at time zone 'utc') at time zone 'utc', now() - interval '6 hours') + (g * interval '1 second')
      from generate_series(1, $3::int) g`, [u, s, rows]);
  }
  await db.query(`set local session_replication_role = origin`);
  await db.query('analyze public.player_ledger');
}

const WINDOW_MS = 100000;
const POLL_MS = 16000;
const EARLY = [3, 5];

/** One fixture through its own door: per settle, ms by statement and by function, rows read by table, rows written, journal rows. */
async function profileFixture(ctx, name, { windows = 8, aged = 0 } = {}) {
  const { db, M, H, P } = ctx;
  const f = P.FIXTURES[name];
  const fx = await f.build(db, M);
  await ageLedger(db, fx, aged);
  /* production plans with statistics (autoanalyze); a freshly replayed chain has none, and its default estimates pick nested
     loops that call a function a row (the settle read's 512 hr_hunt_setup_live calls for four heroes): measure with them */
  if (!argv.includes('--no-analyze')) await db.query('analyze');
  const door = f.door;
  const n = door === 'watched' ? 16 : windows;
  const step = door === 'watched' ? POLL_MS : WINDOW_MS;
  const behind = Math.ceil(((n + 2) * step) / 1000);
  await backdate(db, fx, behind);
  await armCron(db, H);
  const nowMs = Number(await H.one(db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
  const start = Math.floor((nowMs - behind * 1000) / 1000) * 1000;
  const acc = { ms: {}, n: {}, fn: {}, rd: {}, writes: 0, ins: 0, cron_ms: 0 };
  const paid0 = await paidMs(db, H, fx);
  const led0 = Number(await H.one(db, 'select count(*) from public.player_ledger where user_id = any ($1::uuid[])', [[...new Set(fx.heroes.map((h) => h[0]))]]));
  let settles = 0; let held = null;
  const base = H.makeExec(db);
  for (let k = 1; k <= n; k++) {
    const stat = { ms: {}, n: {} };
    const exec = timedExec(base, stat);
    if (door !== 'watched') {
      if (fx.sids.length) await db.query(`update public.hunt_tick_lease set lease_until = now() - interval '1 second' where session_id = any ($1::uuid[])`, [fx.sids]);
      else await db.query(`update public.hr_tick_ownership set lease_until = now() - interval '1 second' where user_id = any ($1::uuid[])`, [fx.heroes.map((x) => x[0])]);
    }
    const f0 = await funcs(db); const t0 = await tables(db);
    let ended = false;
    if (door === 'watched') {
      const early = Math.floor((k * EARLY[0]) / EARLY[1]) - Math.floor(((k - 1) * EARLY[0]) / EARLY[1]);
      for (let i = 0; i <= early; i++) {
        const last = i === early;
        const [u, s] = fx.heroes[0];
        await exec(`select public.hr_rate_gate($1::uuid, $2::int, 'accrue'::text) as allowed`, [u, s]);
        await exec('select public.hr_accrue_read($1::uuid, $2::int) as state, public.hr_accrue_cap_ms($1::uuid, $2::int) as cap_ms, now() as now', [u, s]);
        await exec('select monster_id, kills from public.hr_bestiary_of($1::uuid, $2::int)', [u, s]);
        await exec('select monster_id, stage from public.hr_trophy_of($1::uuid, $2::int)', [u, s]);
        await exec('select public.hr_hunt_open_of($1::uuid, $2::int) as session', [u, s]);
        await exec('select count(*)::int as n from public.hr_collection_of($1::uuid, $2::int)', [u, s]);
        await exec(`select (public.hr_seed($1::uuid, $2::int, $3) & 4294967295)::bigint as seed, public.hr_seed($1::uuid, $2::int, $4)::text as salt,
                    public.hr_perks_of($1::uuid, $2::int) as perks`, [u, s, 'accrue:x', 'intent:accrue:x']);
        const o = last ? { atMs: start + k * step } : { minWindowMs: 1e15 };
        const v = await M.HS.settleHunt({ exec, user: u, slot: s, mode: 'settle', bucket: null, project: true, live: true, grounds: H.groundsOf(M),
          ...o, ...(held === null ? {} : { have: held }) });
        if (last) {
          if (v.outcome !== 'paid') throw new Error(`${name} poll ${k}: ${v.outcome}/${v.reason}`);
          if (v.body && Number.isSafeInteger(v.body.version)) held = v.body.version;
          ended = !!(v.body && v.body.hunt_ended);
        }
      }
    } else {
      const c0 = performance.now();
      const bodies = (await fire(db, H)).filter((b) => (Array.isArray(b.hunts) && b.hunts.some((h) => fx.sids.includes(h.session_id)))
        || (Array.isArray(b.roster) && b.roster.some((r) => fx.heroes.some(([u, s]) => r.user_id === u && Number(r.slot) === s))));
      acc.cron_ms += performance.now() - c0;
      if (!bodies.length) throw new Error(`${name}: no tick body served the fixture at window ${k}`);
      let h = null;
      for (const b of bodies) h = (await M.TK.runTick({ exec, atMs: start + k * step, body: b, grounds: H.groundsOf(M) })).body;
      ended = !!(h && h.hunts && h.hunts.ended);
    }
    const f1 = await funcs(db); const t1 = await tables(db);
    if (k > 1) {   // the first settle plans every statement: it is the warm-up, as per-player-cost's cpu column
      settles += 1;
      add(acc.ms, stat.ms, (a, b) => (a || 0) + b); add(acc.n, stat.n, (a, b) => (a || 0) + b);
      add(acc.fn, diff(f0, f1, (b, a) => (b.s - (a ? a.s : 0) > 0 ? { s: b.s - (a ? a.s : 0), c: b.c - (a ? a.c : 0) } : null)),
        (a, b) => ({ s: (a ? a.s : 0) + b.s, c: (a ? a.c : 0) + b.c }));
      add(acc.rd, diff(t0, t1, (b, a) => (b.rd - (a ? a.rd : 0)) || null), (a, b) => (a || 0) + b);
      for (const [t, v] of Object.entries(t1)) { acc.writes += v.w - (t0[t] ? t0[t].w : 0); acc.ins += v.ins - (t0[t] ? t0[t].ins : 0); }
    }
    if (ended) break;
  }
  const heroHours = (await paidMs(db, H, fx) - paid0) / 3600000;
  const led = Number(await H.one(db, 'select count(*) from public.player_ledger where user_id = any ($1::uuid[])', [[...new Set(fx.heroes.map((h) => h[0]))]])) - led0;
  return { name, door, heroes: fx.heroes.length, settles, heroHours, ledgerRows: led, aged, ...acc };
}

const r1 = (x) => Math.round(x * 10) / 10;
function printProfile(p) {
  const per = (x) => x / p.settles;
  const dbMs = Object.values(p.ms).reduce((a, b) => a + b, 0);
  console.log(`\n## ${p.name}  door ${p.door}, ${p.heroes} hero(es), ${p.settles} measured settles${p.aged ? `, ${p.aged} journal rows today a hero` : ''}`);
  console.log(`database ms a settle (PGlite, this machine): ${r1(per(dbMs))}  | a hero-settle: ${r1(per(dbMs) / p.heroes)}  | journal rows a settle ${r1(p.ledgerRows / (p.settles + 1))}`
    + `  | row writes a settle ${r1(per(p.writes))}${p.door === 'closed' ? `  | the cron fire (driver, not the hero) ${r1(p.cron_ms / (p.settles + 1))} ms` : ''}`);
  console.log('statement | calls a settle | ms a settle | share');
  for (const [k, v] of Object.entries(p.ms).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`${k} | ${r1(per(p.n[k]))} | ${r1(per(v))} | ${Math.round((v / dbMs) * 100)}%`);
  const fnTotal = Object.values(p.fn).reduce((a, b) => a + b.s, 0);
  console.log('function (self time) | calls a settle | ms a settle | share of function time');
  for (const [k, v] of Object.entries(p.fn).sort((a, b) => b[1].s - a[1].s).slice(0, 14)) console.log(`${k} | ${r1(per(v.c))} | ${r1(per(v.s))} | ${Math.round((v.s / fnTotal) * 100)}%`);
  console.log('table | rows read a settle (seq + index fetches)');
  for (const [k, v] of Object.entries(p.rd).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`${k} | ${Math.round(per(v))}`);
}

async function inFixture(db, fn) {
  await db.query('begin');
  try { return await fn(); } finally { await db.query('rollback'); }
}

async function profile() {
  const ctx = await boot();
  const only = onlyArg();
  for (const name of Object.keys(ctx.P.FIXTURES)) {
    if (only && !name.includes(only)) continue;
    const p = await inFixture(ctx.db, () => profileFixture(ctx, name));
    printProfile(p);
  }
}

async function aged() {
  const ctx = await boot();
  const only = onlyArg() || 'closed';
  console.log('AGED: database ms a commit (PGlite) by journal rows already written today a hero');
  console.log('fixture | rows today a hero | ms a commit | ms a hero-commit | player_ledger rows read a commit | day-budget fns ms a commit');
  for (const name of Object.keys(ctx.P.FIXTURES)) {
    if (!name.includes(only) || ctx.P.FIXTURES[name].door !== 'closed') continue;
    for (const rows of [0, 1500, 4500]) {
      const p = await inFixture(ctx.db, () => profileFixture(ctx, name, { windows: 6, aged: rows }));
      const dbMs = Object.values(p.ms).reduce((a, b) => a + b, 0) / p.settles;
      const dayFns = Object.entries(p.fn).filter(([k]) => /day_budget|_today|budget/.test(k)).reduce((a, [, v]) => a + v.s, 0) / p.settles;
      console.log([name, rows, r1(dbMs), r1(dbMs / p.heroes), Math.round((p.rd.player_ledger || 0) / p.settles), r1(dayFns)].join(' | '));
    }
  }
}

/* ── WINDOW: the same 20 simulated minutes committed at four cadences ──────────────────────────────────────────────────── */
/* ONE fixture, built once, every cadence run from the same savepoint (TICK-1's compareRuns): the same instance, secret, seeds
   and clock. Built once per cadence instead, the pinned uuid sequence (it does not roll back) gives each run another instance
   secret, and so other seeds: that is not a cadence difference. */
async function windowRun(ctx, fx, from, stepMs, spanMs) {
  const { db, M, H } = ctx;
  const stat = { ms: {}, n: {} };
  const exec = timedExec(H.makeExec(db), stat);
  const led0 = Number(await H.one(db, 'select count(*) from public.player_ledger where session_id = any ($1::uuid[])', [fx.sids]));
  let commits = 0; let commitMs = 0; let readMs = 0;
  const [u, s] = fx.heroes[0];
  for (let t = from + stepMs; t <= from + spanMs; t += stepMs) {
    const r0 = performance.now();
    const plan = await M.HS.readHuntSettle({ exec, user: u, slot: s, grounds: H.groundsOf(M), atMs: t }, 'tick');
    readMs += performance.now() - r0;
    if (plan.answer) break;
    const p = await M.HS.proposeHuntSettle(plan, t, 0);
    if (!p.out.accrued) break;
    const c0 = performance.now();
    const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    if (t > from + stepMs) { commitMs += performance.now() - c0; commits += 1; }
    if (!res || res.ok !== true) throw new Error(`at ${stepMs / 1000} s: commit refused ${JSON.stringify(res).slice(0, 300)}`);
    if (p.out.ended) break;
  }
  const led = Number(await H.one(db, 'select count(*) from public.player_ledger where session_id = any ($1::uuid[])', [fx.sids])) - led0;
  const snaps = [];
  for (let i = 0; i < fx.heroes.length; i++) snaps.push(await H.snapshot(db, fx.sids[i], fx.heroes[i][0]));
  return { commits, commitMs, readMs, led, heroes: fx.heroes.length, canon: H.canon(snaps.map((x) => ({ ...x, ledger: null }))), ledgerSums: H.canon(snaps.map((x) => x.ledger)), first: H.firstDiff };
}
async function windows() {
  const ctx = await boot();
  const only = onlyArg();
  const SPAN = 20 * 60000;
  console.log('WINDOW: one 20-minute span of a closed hunt, committed at four cadences. Database ms are PGlite\'s (this machine); the first commit is the warm-up and is not counted.');
  console.log('fixture | commit every | commits | ms a commit | commit ms a hero-hour | journal rows a hero-hour | end state = the 100 s run | journal sums = the 100 s run');
  for (const name of ['lone_L10_meadowbrook_thicket', 'party4_L20_millrace_sewer', 'supply4_L50_hasks_ford_deadly', 'krell4_L80_deadly_closed']) {
    if (only && !name.includes(only)) continue;
    let ref = null;
    const si = argv.indexOf('--steps');
    const steps = si >= 0 ? argv[si + 1].split(',').map((x) => Number(x) * 1000) : [100000, 300000, 600000, 1200000];
    const runs = await inFixture(ctx.db, async () => {
      const fx = await ctx.P.FIXTURES[name].build(ctx.db, ctx.M);
      await backdate(ctx.db, fx, Math.ceil(SPAN / 1000) + 30);
      const from = Number(await ctx.H.one(ctx.db, 'select floor(extract(epoch from i.settled_to) * 1000)::bigint from public.hunt_instances i join public.hunt_sessions h on h.instance_id = i.id where h.id = $1', [fx.sids[0]]));
      const out = [];
      for (const step of steps) {
        await ctx.db.query('savepoint cadence');
        out.push(await windowRun(ctx, fx, from, step, SPAN));
        await ctx.db.query('rollback to savepoint cadence');
      }
      return out;
    });
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]; const w = runs[i];
      if (!ref) ref = w;
      const hh = (SPAN / 3600000) * w.heroes;
      const msA = w.commits ? w.commitMs / w.commits : NaN;
      console.log([name, step / 1000 + ' s', w.commits + 1, r1(msA), Math.round((msA * (3600000 / step))) / w.heroes | 0, r1(w.led / hh),
        w.canon === ref.canon ? 'IDENTICAL' : 'DIFFERS', w.ledgerSums === ref.ledgerSums ? 'IDENTICAL' : 'DIFFERS'].join(' | '));
      if (argv.includes('--why') && w.canon !== ref.canon) console.log('   first difference: ' + String(w.first(ref.canon, w.canon)).slice(0, 600));
    }
  }
}

/* ── THE LADDER: pure arithmetic on the measured inputs (platform-cost.json) ────────────────────────────────────────── */
/* One account-day of FOUR HEROES HUNTING AS A PARTY (77% of production's hunted hours are fours, REAL): `watchedH` hours with the hunt
   on screen (the instance at the watched cadence, the tab's reads, its frames), the rest of the 12 hunted hours with the browser
   closed, 12 hours of town work a hero, `townTabH` hours of a tab standing in town, `presses` presses, and its share of the cron. */
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
/** A closed commit of `shape` ('four' or 'lone'), seconds: its read and its apply's core (no frame, no projection). */
const closedCommitS = (m, shape) => (m.closedCommitMs[shape].read + m.closedCommitMs[shape].core * (m.closedCoreFactor || 1)) / 1000;
/** A watched four-hour, seconds: the polls, the commits at their cadence, the off-screen load and the unattributed rest. */
function watchedHourS(m) {
  const w = m.watched;
  const commit = m.closedCommitMs.four.core + sum(w.commitMs);
  const read = w.readOverride != null ? w.readOverride : m.closedCommitMs.four.read;   // the settle read, run by the landed poll and each early ask
  return (w.pollsAnHour * (w.readsAPoll * read + sum(w.pollMs)) + m.watchedCommitsAnHour * commit) / 1000 + w.offscreenLoadSAnHour + w.residualSAnHour;
}
/** One account-day in database-seconds, by line. */
function accountDay(m, day) {
  const hunt = (day.huntH - day.watchedH) * m.awayCommitsAnHour * closedCommitS(m, 'four');
  const watched = day.watchedH * watchedHourS(m);
  const town = m.townDayS != null ? m.townDayS : day.heroes * day.townH * m.townHeroHourS;
  const townTab = day.townTabH * m.townTabHourS;
  const presses = day.presses * m.pressS;
  const fixed = m.fixedSADay / day.accounts;
  return { hunt, watched, town, townTab, presses, fixed, total: hunt + watched + town + townTab + presses + fixed };
}
/** Each rung changes the inputs; the ladder is cumulative, in this order. `R` = platform-cost.json's rung inputs. */
function rungsOf(R) {
  const each = (m, part, f) => { for (const s of ['four', 'lone']) m.closedCommitMs[s][part] *= f; };
  return [
    { id: 'R0', roadmap: 'new (48 section 8)', layer: 'edge SQL, one word', name: 'the settle read reads the party once (`r as materialized`)',
      apply: (m) => { each(m, 'read', R.R0.readFactor); return m; } },
    { id: 'L01', roadmap: 'L01 (28 change 1)', layer: 'edge + server, staged', name: 'no off-screen poll, tick packing, the 5-minute prune',
      apply: (m) => { m.watched.offscreenLoadSAnHour = 0; return m; } },
    { id: 'T1', roadmap: 'new (28 card, town)', layer: 'edge + server read', name: 'the town tick reads the hero\'s engine inputs, not the whole hero',
      apply: (m) => { m.townHeroHourS *= R.T1.townFactor; return m; } },
    { id: 'L12', roadmap: 'L12 (28-1)', layer: 'edge + server', name: 'confirm in the edge, commit at the flush: a watched instance commits every 100 s',
      apply: (m) => { m.watchedCommitsAnHour = R.L12.commitsAnHour; m.watched.loneCommitsAnHour = R.L12.commitsAnHour; return m; } },
    { id: 'L24', roadmap: 'L24 (28 change 4)', layer: 'server + client', name: 'delta envelopes: the projection, the frames, the hello and a press carry what moved',
      apply: (m) => { const f = R.L24.stateFactor; const p = m.watched.pollMs; const c = m.watched.commitMs;
        p.helloReads *= f; p.earlyAskState *= f; c.projection *= f; c.frames *= f; m.pressS = (m.pressS - 0.048) + 0.048 * f; return m; } },
    { id: 'L25', roadmap: 'L25 (28-7)', layer: 'server + client', name: 'one heartbeat: a town tab alone sends nothing',
      apply: (m) => { m.townTabHourS = 0; return m; } },
    { id: 'L07', roadmap: 'L07, L21', layer: 'content + client', name: 'Carry on and the plans: 20 presses a day',
      apply: (m, day) => { day.presses = R.L07.presses; return m; } },
    { id: 'L13', roadmap: 'L13 (28-2, 43 E18)', layer: 'server', name: 'the hourly journal: one row a hero an hour an activity',
      apply: (m) => { each(m, 'core', R.L13.coreFactor); return m; } },
    { id: 'P1', roadmap: 'new (48 section 8)', layer: 'server plans', name: 'the read calls no function a row, the skill curve is read by its XP, a limit is read once',
      apply: (m) => { each(m, 'read', R.P1.readFactor); each(m, 'core', R.P1.coreFactor); return m; } },
    { id: 'TCF', roadmap: '59 row 30 (formula, P05, P-X28)', layer: 'formula + server', name: 'town work paid in closed form: start, each paid hour, stop',
      apply: (m) => { m.townDayS = R.TCF.townDayS; return m; } },
    { id: 'RES', roadmap: 'new (48 section 10, step 2)', layer: 'client + server', name: 'an open tab sends only its confirm and its heartbeat (the measured 33.5 s a watched four-hour beyond them, found and removed)',
      apply: (m) => { m.watched.residualSAnHour = 0; return m; } },
    { id: 'C10', roadmap: 'new (48 section 7)', layer: 'dial + edge', name: 'a closed hunt commits every 10 minutes: fold_windows 6, the edge slice sized by engine time',
      apply: (m) => { m.closedCoreFactor = R.C10.commitFactor; m.awayCommitsAnHour = R.C10.commitsAnHour; return m; } },
  ];
}
/** The ladder on one day: today, then each rung on top of the last. */
function climb(today, day, rungs) {
  let m = structuredClone(today); const d = { ...day };
  const out = [{ id: 'today', name: 'today', layer: '', roadmap: '', ...accountDay(m, d) }];
  for (const r of rungs) { m = r.apply(structuredClone(m), d); out.push({ id: r.id, name: r.name, layer: r.layer, roadmap: r.roadmap, ...accountDay(m, d) }); }
  return out;
}
/** The verdict against the ruled band: at or under it meets. */
function verdict(total, band) { return total <= band ? 'MEETS' : `OVER x${(total / band).toFixed(1)}`; }
function loadInputs() { return JSON.parse(readFileSync(join(HERE, 'platform-cost.json'), 'utf8')); }

function ladder() {
  const J = loadInputs();
  const t = J.today;
  console.log(`Today: a closed four commit ${r1(closedCommitS(t, 'four') * 1000)} ms (${r1(t.awayCommitsAnHour * closedCommitS(t, 'four'))} s a four-hour), a lone one ${r1(closedCommitS(t, 'lone') * 1000)} ms, a watched four-hour ${r1(watchedHourS(t))} s (REAL +107 to +119), a town hero-hour ${t.townHeroHourS} s.`);
  for (const [label, day] of Object.entries(J.days)) {
    const band = day.accounts >= 10000 ? J.bands['C2.10k'] : J.bands['C2.1k'];
    console.log(`\n## ${label}: band C2 ${band}`);
    console.log('rung | roadmap | layer | change | closed hunt | watched | town work | town tab | presses | cron share | TOTAL | against C2');
    for (const s of climb(t, day, rungsOf(J.rungs))) {
      console.log([s.id, s.roadmap, s.layer, s.name, r1(s.hunt), r1(s.watched), r1(s.town), r1(s.townTab), r1(s.presses), r1(s.fixed), r1(s.total), verdict(s.total, band)].join(' | '));
    }
  }
  heroesTable(J);
  bossTable(J);
}

/* ── THE TARGET DESIGN: every choice taken, and what each one is worth inside it (48 sections 1 and 3) ─────────────────── */
/* T1 is a step on the way, not a choice of the target: town work in closed form replaces what it saves */
const NOT_A_TARGET_CHOICE = new Set(['T1']);
/** The target with every choice taken except `skip` (null: all of them). */
function targetWithout(J, skip) {
  let m = structuredClone(J.today); const d = { presses: 100 };
  for (const r of rungsOf(J.rungs)) if (r.id !== skip) m = r.apply(m, d);
  return { m, presses: d.presses };
}
/** The target on a stateful engine host: a viewed hunt's confirm is answered from memory (no database read), a closed hunt commits once an hour. */
function onHost(m, H) {
  const h = structuredClone(m);
  h.watched.readsAPoll = 0; h.watched.pollMs = { confirm: 0 };
  h.awayCommitsAnHour = H.closedCommitsAnHour; h.closedCoreFactor = H.closedCommitFactor;
  return h;
}
function design() {
  const J = loadInputs();
  const T = targetWithout(J, null);
  console.log('THE TARGET: four heroes from day one, 12 h hunted and 12 h of town work a hero, every choice of 48 section 3 taken. Database-seconds an account-day.');
  console.log('day shape | the target (the edge engine) | the target on a stateful engine host | C2');
  for (const [label, day] of Object.entries(J.days)) {
    const band = day.accounts >= 10000 ? J.bands['C2.10k'] : J.bands['C2.1k'];
    const a = accountDay(T.m, { ...day, presses: T.presses }); const h = accountDay(onHost(T.m, J.rungs.HOST), { ...day, presses: T.presses });
    console.log([label, `${r1(a.total)} ${verdict(a.total, band)}`, `${r1(h.total)} ${verdict(h.total, band)}`, band].join(' | '));
  }
  const [closed, real] = Object.keys(J.days);
  const at = (x, label) => accountDay(x.m, { ...J.days[label], presses: x.presses }).total;
  const base = [at(T, closed), at(T, real)];
  console.log(`\nWHAT EACH CHOICE IS WORTH: the target with that one choice not taken (${closed} / ${real})`);
  console.log('choice | roadmap | layer | the choice | not taken: closed / real-shaped | it is worth');
  for (const r of rungsOf(J.rungs)) {
    if (NOT_A_TARGET_CHOICE.has(r.id)) continue;
    const x = targetWithout(J, r.id); const c = at(x, closed); const w = at(x, real);
    console.log([r.id, r.roadmap, r.layer, r.name, `${r1(c)} / ${r1(w)}`, `${r1(c - base[0])} / ${r1(w - base[1])}`].join(' | '));
  }
}

/* ── HEROES AN ACCOUNT (Tyler 2026-11-21: every account has all four heroes from the start) ─────────────────────────── */
/** One account-day with `n` LONE heroes (each its own instance) on `day`'s hours: one of them on screen for day.watchedH, the others
    hunting closed but framed while the tab is open (open in a client), presses a share of four heroes' 100. */
function loneAccountDay(m, day, n) {
  const away = m.awayCommitsAnHour;
  const c1 = closedCommitS(m, 'lone');
  const frame = m.watched.commitMs.frames / 3 / 1000;            // one member's frame (the four's three frames)
  const w = m.watched;
  const read = m.closedCommitMs.lone.read;
  const loneHour = (w.lonePollsAnHour * (w.readsAPoll * read + sum(w.pollMs)) + w.loneCommitsAnHour * (m.closedCommitMs.lone.core + w.commitMs.projection)) / 1000
    + w.offscreenLoadSAnHour * (n - 1) / 3 + w.residualSAnHour;
  const hunt = (n * day.huntH - day.watchedH) * away * c1;
  const watched = day.watchedH * (loneHour + (n - 1) * away * frame);
  const town = m.townDayS != null ? m.townDayS * n / 4 : n * day.townH * m.townHeroHourS;
  const townTab = day.townTabH * m.townTabHourS;
  const presses = day.presses * (n / 4) * m.pressS;
  const fixed = m.fixedSADay / day.accounts;
  return { hunt, watched, town, townTab, presses, fixed, total: hunt + watched + town + townTab + presses + fixed };
}
function afterLadder(J) { let m = structuredClone(J.today); const d = { presses: 100 }; for (const r of rungsOf(J.rungs)) m = r.apply(m, d); return { m, presses: d.presses }; }
function heroesTable(J) {
  const { m: after, presses } = afterLadder(J);
  const rows = [['1 hero', 1, false], ['2 lone heroes', 2, false], ['3 lone heroes', 3, false], ['4 lone heroes', 4, false], ['4 heroes as one party', 4, true]];
  for (const label of [Object.keys(J.days)[0], Object.keys(J.days)[1]]) {
    const day = J.days[label];
    console.log(`\n## HEROES AN ACCOUNT, ${label}, 12 h hunted and 12 h of town work a hero from the first day`);
    console.log('account | today | a hero, today | after the ladder | a hero, after | against C2 at 1,000 (60), after');
    for (const [name, n, party] of rows) {
      const a = party ? accountDay(J.today, day) : loneAccountDay(J.today, day, n);
      const b = party ? accountDay(after, { ...day, presses }) : loneAccountDay(after, { ...day, presses }, n);
      console.log([name, r1(a.total), r1(a.total / n), r1(b.total), r1(b.total / n), verdict(b.total, J.bands['C2.1k'])].join(' | '));
    }
  }
}

/* ── A WORLD BOSS: one shared fight, many accounts' heroes (the MMO layer's first envelope; no fixture exists) ─────────── */
/** One fight of `n` heroes, one hero an account, in seconds: its commits (the window the edge's engine time allows, or the host's),
    their frames, and the viewers' reads of the whole instance (today's door: every viewer polls the instance every 16 s). */
function bossFight(B, n, design) {
  const S = B.minutes * 60;
  const engineWindowS = design === 'host' ? B.hostWindowS : Math.min(B.hostWindowS, B.edgeBudgetMs / (B.engineMsAHeroSimS * n));
  const commits = S / engineWindowS;
  const commitMs = B.prodFactor * (B.pglite.fixedMs + B.pglite.perMemberMs * n) + B.viewShare * n * B.frameMs;
  const readMs = B.prodFactor * (B.pglite.readFixedMs + B.pglite.readPerMemberMs * n);
  const viewerReads = design === 'polls' ? B.viewShare * n * (S / B.pollS) * B.readsAPoll * readMs : 0;
  const total = (commits * commitMs + viewerReads) / 1000;
  return { windowS: engineWindowS, commits, commitMs, total, perAccount: total / n };
}
function bossTable(J) {
  const B = J.boss;
  console.log(`\n## A WORLD BOSS: one ${B.minutes}-minute fight, one hero an account, every member's tab open. ESTIMATED from the replay's per-member cost x production's factor ${B.prodFactor}`);
  console.log('heroes in the fight | design | window s | commits | ms a commit | database-s the fight | a hero (account), the fight | share of C2 a day, 1,000 / 10,000');
  for (const n of B.sizes) {
    for (const [design, label] of [['polls', 'today: the edge engine, every viewer reads the instance every 16 s'], ['broadcast', 'one broadcast a commit, no viewer reads, the edge engine'], ['host', 'one broadcast a commit, a stateful engine host']]) {
      const f = bossFight(B, n, design);
      console.log([n, label, r1(f.windowS), r1(f.commits), Math.round(f.commitMs), r1(f.total), r1(f.perAccount), Math.round(100 * f.perAccount / J.bands['C2.1k']) + '% / ' + Math.round(100 * f.perAccount / J.bands['C2.10k']) + '%'].join(' | '));
    }
  }
}

function selftest() {
  const fails = [];
  const arm = (label, ok, detail = '') => { console.log(`  ${ok ? 'ok    ' : 'FAILED'}  ${label}${detail ? '  ' + detail : ''}`); if (!ok) fails.push(label); };
  const m = { awayCommitsAnHour: 36, watchedCommitsAnHour: 200, closedCommitMs: { four: { read: 20, core: 30 }, lone: { read: 10, core: 10 } },
    watched: { pollsAnHour: 200, readsAPoll: 1, pollMs: { a: 10 }, commitMs: { b: 70 }, offscreenLoadSAnHour: 5, residualSAnHour: 3 },
    townHeroHourS: 1, townTabHourS: 2, pressS: 0.1, fixedSADay: 1000 };
  const day = { accounts: 1000, heroes: 4, huntH: 12, townH: 12, watchedH: 2, townTabH: 1, presses: 50 };
  /* by hand: closed commit 50 ms; watched hour = 200 x (20 + 10) ms + 200 x (30 + 70) ms + 5 + 3 = 6 + 20 + 8 = 34 s;
     closed 10 h x 36 x 0.05 = 18; watched 2 x 34 = 68; town 48; town tab 2; presses 5; cron 1 */
  arm('ARITHMETIC: a watched hour is its polls, its commits and its loads', Math.abs(watchedHourS(m) - 34) < 1e-9, `${watchedHourS(m)}`);
  const a = accountDay(m, day);
  arm('ARITHMETIC: the account-day is the sum of its hand-computed lines', Math.abs(a.total - (18 + 68 + 48 + 2 + 5 + 1)) < 1e-9, `${a.total}`);
  arm('VERDICT: at the band meets, a hair over is over', verdict(60, 60) === 'MEETS' && verdict(60.01, 60).startsWith('OVER'));
  const J = loadInputs();
  for (const [label, d] of Object.entries(J.days)) {
    const steps = climb(J.today, d, rungsOf(J.rungs));
    arm(`LADDER (${label}): no rung raises the day`, steps.every((s, i) => i === 0 || s.total <= steps[i - 1].total + 1e-9), steps.map((s) => s.id + ' ' + r1(s.total)).join(', '));
  }
  /* the no-rise check bites: a rung that raises the cost is caught */
  const planted = rungsOf(J.rungs).map((r) => (r.id === 'L13' ? { ...r, apply: (mm) => { mm.closedCommitMs.four.core *= 3; return mm; } } : r));
  const bad = climb(J.today, J.days[Object.keys(J.days)[0]], planted);
  arm('MUTANT: a rung that triples the closed commit is caught by the no-rise check', !bad.every((s, i) => i === 0 || s.total <= bad[i - 1].total + 1e-9));
  /* the inputs reproduce the REAL watched hour within its measured range */
  /* the REAL watched hour (107 to 119 s) was measured while the settle read was the old 19.1 ms statement: the model at that read lands in it */
  const w = watchedHourS({ ...J.today, watched: { ...J.today.watched, readOverride: J.today.watched.calibrationReadMs } });
  arm('CALIBRATION: the model\'s watched four-hour at the old read sits in the REAL range (107 to 119 s)', w >= 107 && w <= 119, `${r1(w)}`);
  const ap = J.today.closedCommitMs.four.core + sum(J.today.watched.commitMs);
  arm('CALIBRATION: a watched commit\'s apply sits within 10% of production\'s hr_hunt_apply_instance mean (203 ms)', Math.abs(ap - 203) <= 20.3, `${r1(ap)}`);
  /* the target: no choice is worth less than nothing, and the host never costs more than the edge */
  const T = targetWithout(J, null); const d0 = Object.values(J.days)[1];
  const t0 = accountDay(T.m, { ...d0, presses: T.presses }).total;
  const worth = rungsOf(J.rungs).filter((r) => !NOT_A_TARGET_CHOICE.has(r.id)).map((r) => { const x = targetWithout(J, r.id); return [r.id, accountDay(x.m, { ...d0, presses: x.presses }).total - t0]; });
  arm('DESIGN: every choice of the target is worth zero or more', worth.every(([, v]) => v >= -1e-9), worth.map(([k, v]) => k + ' ' + r1(v)).join(', '));
  arm('DESIGN: the stateful host never costs more than the edge', accountDay(onHost(T.m, J.rungs.HOST), { ...d0, presses: T.presses }).total <= t0 + 1e-9);
  arm('KEY: a statement is named by the public function it calls', keyOf('select public.hr_hunt_apply_instance($1::uuid)') === 'hr_hunt_apply_instance' && keyOf('begin') === 'begin');
  console.log(fails.length ? `platform-cost --selftest: ${fails.length} FAILED` : 'platform-cost --selftest: green');
  return fails.length ? 1 : 0;
}

async function main() {
  const cmd = argv.find((a) => !a.startsWith('--') && a !== onlyArg());
  if (argv.includes('--selftest')) return selftest();
  if (cmd === 'profile') await profile();
  else if (cmd === 'window') await windows();
  else if (cmd === 'aged') await aged();
  else if (cmd === 'ladder') ladder();
  else if (cmd === 'design') design();
  else { console.log('usage: node tools/balance-program/platform-cost.mjs profile|window|aged [--only <fixture>] | ladder | --selftest'); return 2; }
  return 0;
}
if (isMain(import.meta.url)) main().then((c) => process.exit(c)).catch((e) => { console.error(e.stack || e.message); process.exit(2); });
