#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-tick-shards.mjs — THE WORLD TICK'S HUNT SETTLES, PACKED BY LOAD
// (supabase/migrations/2026-11-04-hunt-tick-shards.sql + hr-accrue tick.js
// HUNT_BODY_BUDGET_MS + accrual.js accrueHunt's world bound).
//
//   node tests/hunt-tick-shards.mjs            the guard (26 hunts: 3 bodies)
//   node tests/hunt-tick-shards.mjs --load     the synthetic load: 100 hunts,
//                                              measured (one body of 100 vs the
//                                              packed bodies), and the fire must
//                                              fit the cadence
//   node tests/hunt-tick-shards.mjs --mutate   every planted defect must go RED
//
// On the real replayed chain (PGlite, the edge as hr_engine; pg_net / Vault /
// pgcrypto stubbed by tests/world-tick-token-shims.mjs):
//
//   PACK   ★ one cron fire over N due hunts queues ceil(N / hunt_body_max) hunt
//            bodies; no body over hunt_body_max sessions; the bodies are
//            pairwise DISJOINT and cover every due session; each body names its
//            own holder and its sessions are leased to it
//   LEASE  ★ a second fire before any settle queues NO hunt body (no hunt is
//            handed to two bodies while a lease lives)
//   SETTLE ★ every body, driven through the shipped runTick, settles every one
//            of its hunts: one stamped accrue row a session, each clock moved
//            (no hunt settled twice, none dropped)
//   BUDGET   a body past its time budget STARTS no settle: every selector is
//            `deferred`, nothing is written
//   WORLD  ★ a window whose world would encode past the bound is REFUSED by the
//            engine (world_too_large) and never committed: the instance clock,
//            swing and world are unmoved and no ledger row is written; the same
//            window under the real bound pays (control)
//   LOAD   (--load) 100 hunts: the packed fire's slowest body (the fire's wall
//            time — bodies are concurrent edge invocations) vs the same 100 in
//            one body; the packed fire must fit the 10 s cadence and its
//            slowest body pg_net's 9 s timeout
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET } from './world-tick-token-shims.mjs';
import { HARNESS } from './hunt-sessions-settle.mjs';
import { isMain } from './_is-main.mjs';

const { ROOT, UIDS, STRONG, loadEdge, pinDice, hunter, character, one, q, inTx, makeExec, groundsOf } = HARNESS;
const UID0 = UIDS[0];
const MUTATE = process.argv.includes('--mutate');
const LOAD = process.argv.includes('--load');
const FN = join('supabase', 'functions', 'hr-accrue');
const MIG = '2026-11-04-hunt-tick-shards.sql';
const N_GUARD = 26;
const N_LOAD = 100;
const CADENCE_MS = 10000;
const PGNET_TIMEOUT_MS = CADENCE_MS - 1000;
const uidOf = (i) => '00000000-0000-4000-8000-0000001a' + String(i).padStart(4, '0');
const idem = () => crypto.randomUUID();

/* N due hunters on the fixture ground, each its own character and solo instance,
   settled 100 s ago (past the 90 s flush: due, the steady-state window). */
async function hunters(db, M, n) {
  const first = await hunter(db, M, STRONG);
  const sids = [first.sid];
  for (let i = 1; i < n; i++) {
    const uid = uidOf(i);
    await character(db, M, uid, STRONG);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const e = await one(db, `select public.hr_hunt_enter(0, 'mill_cellar', $1::jsonb, 0, null, $2::uuid)`,
      [JSON.stringify(STRONG.bag), idem()]);
    if (!e || e.ok !== true) throw new Error('enter refused: ' + JSON.stringify(e));
    sids.push(e.session.id);
  }
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  const t = "date_trunc('second', now() - interval '100 seconds')";
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t},
                    next_swing_at = ${t} where id = any ($1::uuid[])`, [sids]);
  await db.query(`update public.hunt_instances i set settled_to = ${t}, next_swing_at = ${t}
                    from public.hunt_sessions h where h.instance_id = i.id and h.id = any ($1::uuid[])`, [sids]);
  return sids;
}

async function armCron(db) {
  await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
  await db.query(`update public.hr_tick_config set enabled = true, flush_seconds = 90, cadence_seconds = 10, batch_limit = 200,
                    lease_ms = 30000, shards = 1, fold_windows = 1, catchup_windows = 1, hunt_body_max = 12,
                    edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue' where id`);
  await db.query('delete from net.http_request_queue');
}
async function fire(db) {
  await db.query('delete from net.http_request_queue');
  const out = await one(db, 'select public.hr_tick_cron_run()');
  const bodies = (await q(db, `select convert_from(body, 'UTF8') as b from net.http_request_queue order by id`))
    .map((r) => JSON.parse(r.b)).filter((b) => Array.isArray(b.hunts) && b.hunts.length);
  return { out, bodies };
}
const stampedOf = (db, sids) => q(db, `select session_id, count(*)::int as n from public.player_ledger
  where session_id = any ($1::uuid[]) and kind = 'combat' and intent = 'accrue' group by session_id`, [sids]);

/* PACK + LEASE + SETTLE over n hunts; answers the problems and the measurements. */
async function packAndSettle(db, M, n, o = {}) {
  const problems = [];
  const sids = await hunters(db, M, n);
  await armCron(db);
  const per = Number(await one(db, 'select hunt_body_max from public.hr_tick_config where id'));
  const exec = makeExec(db);
  const meas = {};

  if (o.before) {
    /* THE OLD SHAPE, MEASURED: every due hunt in ONE body (what the 2026-10-22
       driver posted), settled serially by the same runTick, then rolled back. */
    await db.query('savepoint before_shards');
    const sel = await q(db, `select user_id, slot, id as session_id from public.hunt_sessions where id = any ($1::uuid[]) order by settled_to, id`, [sids]);
    const t0 = Date.now();
    const r = (await M.TK.runTick({ exec, grounds: groundsOf(M), huntBudgetMs: 3600000,
      body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts: sel } })).body;
    meas.oneBodyMs = Date.now() - t0;
    meas.oneBodySettled = r.hunts ? r.hunts.settled : 0;
    await db.query('rollback to savepoint before_shards');
  }

  const f1 = await fire(db);
  const want = Math.ceil(n / per);
  if (f1.bodies.length !== want) problems.push(`PACK: ${n} due hunts at ${per} a body queued ${f1.bodies.length} hunt bodies, expected ${want}`);
  const seen = new Map();
  for (const b of f1.bodies) {
    if (b.hunts.length > per) problems.push(`PACK: body ${b.hunt_body} carries ${b.hunts.length} hunts, over ${per}`);
    for (const h of b.hunts) {
      if (seen.has(h.session_id)) problems.push(`PACK: session ${h.session_id} rides bodies ${seen.get(h.session_id)} and ${b.hunt_body}`);
      seen.set(h.session_id, b.hunt_body);
    }
    const lease = await q(db, `select holder, count(*)::int as n from public.hunt_tick_lease where session_id = any ($1::uuid[])
                                 and lease_until > now() group by holder`, [b.hunts.map((h) => h.session_id)]);
    if (lease.length !== 1 || lease[0].holder !== b.holder || lease[0].n !== b.hunts.length) {
      problems.push(`PACK: body ${b.hunt_body}'s sessions are not all leased to its holder ${b.holder}: ${JSON.stringify(lease)}`);
    }
  }
  if (new Set(f1.bodies.map((b) => b.holder)).size !== f1.bodies.length) problems.push('PACK: two bodies share a lease holder');
  const missing = sids.filter((s) => !seen.has(s));
  if (missing.length) problems.push(`PACK: ${missing.length} due hunt(s) rode no body`);

  const f2 = await fire(db);
  if (f2.bodies.length) problems.push(`LEASE: a second fire re-posted ${f2.bodies.reduce((a, b) => a + b.hunts.length, 0)} leased hunt(s)`);

  const from = Object.fromEntries((await q(db, `select id, settled_to from public.hunt_sessions where id = any ($1::uuid[])`, [sids]))
    .map((r) => [r.id, new Date(r.settled_to).getTime()]));
  const bodyMs = [];
  for (const b of f1.bodies) {
    const t0 = Date.now();
    const r = (await M.TK.runTick({ exec, grounds: groundsOf(M), body: b })).body;
    bodyMs.push(Date.now() - t0);
    if (!r.hunts || r.hunts.settled !== b.hunts.length) {
      problems.push(`SETTLE: body ${b.hunt_body} settled ${r.hunts && r.hunts.settled} of ${b.hunts.length}: ${JSON.stringify(r.hunts)}`);
    }
  }
  const stamped = await stampedOf(db, sids);
  const once = stamped.filter((r) => r.n === 1).length;
  if (once !== n || stamped.length !== n) problems.push(`SETTLE: ${once} of ${n} hunts wrote exactly one stamped accrue row (${stamped.length} wrote any)`);
  const moved = (await q(db, `select id, settled_to from public.hunt_sessions where id = any ($1::uuid[])`, [sids]))
    .filter((r) => new Date(r.settled_to).getTime() > from[r.id]).length;
  if (moved !== n) problems.push(`SETTLE: ${moved} of ${n} session clocks moved`);
  meas.bodies = f1.bodies.length;
  meas.perBody = f1.bodies.map((b) => b.hunts.length);
  meas.bodyMs = bodyMs;
  meas.maxBodyMs = Math.max(...bodyMs);
  meas.sumBodyMs = bodyMs.reduce((a, b) => a + b, 0);
  return { problems, meas };
}

const ARMS = {
  'PACK-LEASE-SETTLE': async (db, M) => inTx(db, async () => (await packAndSettle(db, M, N_GUARD)).problems),

  BUDGET: async (db, M) => inTx(db, async () => {
    const problems = [];
    const sids = await hunters(db, M, 3);
    await db.query('update public.hr_tick_config set enabled = true where id');
    const exec = makeExec(db);
    const sel = await q(db, 'select user_id, slot, id as session_id from public.hunt_sessions where id = any ($1::uuid[])', [sids]);
    const r = (await M.TK.runTick({ exec, grounds: groundsOf(M), huntBudgetMs: 0,
      body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts: sel } })).body;
    if (!r.hunts || r.hunts.deferred !== 3 || r.hunts.settled !== 0) problems.push(`a body past its budget did not defer all 3: ${JSON.stringify(r.hunts)}`);
    if ((await stampedOf(db, sids)).length) problems.push('a deferred hunt wrote a ledger row');
    const r2 = (await M.TK.runTick({ exec, grounds: groundsOf(M),
      body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts: sel } })).body;
    if (!r2.hunts || r2.hunts.settled !== 3 || 'deferred' in r2.hunts) problems.push(`CONTROL: inside the budget the body did not settle all 3: ${JSON.stringify(r2.hunts)}`);
    return problems;
  }),

  WORLD: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, inst } = await hunter(db, M, STRONG);
    const exec = makeExec(db);
    const look = () => one(db, `select jsonb_build_object('to', i.settled_to, 'swing', i.world_swing, 'world', md5(coalesce(i.world, '')),
        'rows', (select count(*) from public.player_ledger l where l.session_id = $2)) from public.hunt_instances i where i.id = $1`, [inst, sid]);
    const before = JSON.stringify(await look());
    await db.query('savepoint world_bound');
    const r = await M.HS.settleHunt({ exec, user: UID0, slot: 0, mode: 'tick', session: sid,
      grounds: groundsOf(M), worldMaxBytes: 64 });
    if (r.outcome !== 'refused' || r.reason !== 'world_too_large') problems.push(`a 64-byte bound answered ${r.outcome}/${r.reason}, not refused world_too_large`);
    if (JSON.stringify(await look()) !== before) problems.push('a refused oversized world moved the instance or wrote a ledger row');
    await db.query('rollback to savepoint world_bound');
    const ok = await M.HS.settleHunt({ exec, user: UID0, slot: 0, mode: 'tick', session: sid, grounds: groundsOf(M) });
    if (ok.outcome !== 'paid') problems.push(`CONTROL: under the real bound the same window answered ${ok.outcome}/${ok.reason}`);
    return problems;
  }),
};

async function runArms(root, db, only) {
  const M = await loadEdge(root);
  const out = {};
  for (const [name, arm] of Object.entries(ARMS)) {
    if (only && !only.includes(name)) continue;
    try { out[name] = await arm(db, M); } catch (e) { out[name] = [`threw: ${String(e && e.stack || e).slice(0, 600)}`]; }
  }
  return out;
}

const MUTANTS = [
  { arm: 'BUDGET', name: 'the hunt body ignores its time budget', file: join(FN, 'tick.js'),
    from: "      if (now() >= huntDeadline) { hunts.deferred = (hunts.deferred || 0) + 1; continue; }\n", to: '' },
  { arm: 'WORLD', name: 'accrueHunt commits a world past the bound', file: join(FN, 'accrual.js'),
    from: '  if (world !== null && utf8Bytes(world) > maxBytes) {', to: '  if (false) {' },
  { arm: 'WORLD', name: 'the settle treats a refused world as nothing owed (no retry, answered nothing)', file: join(FN, 'hunt-settle.js'),
    from: '    if (!p.out.accrued && p.out.refused) {', to: '    if (false) {' },
];
const DB_MUTANTS = [
  { arm: 'PACK-LEASE-SETTLE', name: 'the packer ignores hunt_body_max (one body for everything)', fn: 'public.hr_hunt_roster_sharded(text,integer,integer)',
    find: '- 1)::int / v_per as b', replace: '- 1)::int / 1000 as b' },
  { arm: 'PACK-LEASE-SETTLE', name: 'a live lease is re-claimed by the next fire', fn: 'public.hr_hunt_roster_sharded(text,integer,integer)',
    find: 'and (l.session_id is null or l.lease_until < now())', replace: 'and (l.session_id is null or l.lease_until < now() or true)' },
  { arm: 'PACK-LEASE-SETTLE', name: 'every body is leased under one holder', fn: 'public.hr_hunt_roster_sharded(text,integer,integer)',
    find: "select p.id, v_prefix || ':h' || p.b, now() + v_lease", replace: "select p.id, v_prefix || ':h0', now() + v_lease" },
  { arm: 'PACK-LEASE-SETTLE', name: 'the cron posts the packed hunts in one body', fn: 'public.hr_tick_cron_run()',
    find: '     group by r.body\n     order by r.body', replace: '     group by 0 * r.body\n     order by 0 * r.body' },
];
/* The §5 self-check's own bites. Each mutant RE-PINS k0's packer md5 to the
   mutated body, so the refusal must come from the behavioural gate it names
   (`expect`), never from the md5 pin. */
const SQL_MUTANTS = [
  { name: 'the packer splits a party across bodies (rank by session)', file: MIG, expect: 'p1:',
    find: '((dense_rank() over (order by md5(d.inst::text), d.inst)) - 1)::int / v_per as b',
    replace: '((dense_rank() over (order by md5(d.id::text), d.id)) - 1)::int / v_per as b' },
  { name: 'the packer re-claims a live lease', file: MIG, expect: 'p2:',
    find: '       and (l.session_id is null or l.lease_until < now())\n       and (h.leave_at',
    replace: '       and (l.session_id is null or l.lease_until < now() or true)\n       and (h.leave_at' },
  { name: 'the ceiling takes the least-behind instances first', file: MIG, expect: 'p4:',
    find: '     order by min(d.settled_to), d.inst', replace: '     order by min(d.settled_to) desc, d.inst' },
  { name: 'the packer rosters an online character every fire', file: MIG, expect: 'p5:',
    find: '                      then 1 else v_fold end))\n  ), pick as (', replace: '                      then 0 else v_fold end))\n  ), pick as (' },
];
function packerProsrc(text) {
  const a = text.indexOf('create or replace function public.hr_hunt_roster_sharded(');
  const open = text.indexOf('$$', a) + 2;
  return text.slice(open, text.indexOf('$$', open));
}
function sqlPatches(m) {
  const src = readFileSync(join(ROOT, 'supabase', 'migrations', m.file), 'utf8').replace(/\r\n/g, '\n');
  const md5 = (t) => createHash('md5').update(t, 'utf8').digest('hex');
  const pinned = md5(packerProsrc(src));
  const mutated = md5(packerProsrc(src.replace(m.find, () => m.replace)));
  return [[m.find, m.replace], [`<> '${pinned}' then`, `<> '${mutated}' then`]];
}

async function main() {
  const { bootReplay, LAST_PATCHED } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) {
    console.error(`✗ the chain would not replay: ${String(e.message).slice(0, 600)}`);
    process.exit(1);
  }
  await pinDice(db);
  if (LOAD) {
    const M = await loadEdge(ROOT);
    const { problems, meas } = await inTx(db, () => packAndSettle(db, M, N_LOAD, { before: true }));
    console.log(`LOAD ${N_LOAD} hunts — before: ONE body, ${meas.oneBodySettled} settled serially in ${meas.oneBodyMs} ms`);
    console.log(`LOAD ${N_LOAD} hunts — after:  ${meas.bodies} bodies of ${meas.perBody.join('/')} — slowest ${meas.maxBodyMs} ms`
      + ` (the fire's wall time: bodies are concurrent invocations), all bodies serially ${meas.sumBodyMs} ms; per body ${meas.bodyMs.join(', ')} ms`);
    if (meas.maxBodyMs > PGNET_TIMEOUT_MS) problems.push(`LOAD: the slowest body took ${meas.maxBodyMs} ms, over pg_net's ${PGNET_TIMEOUT_MS} ms`);
    if (meas.maxBodyMs > CADENCE_MS) problems.push(`LOAD: the packed fire took ${meas.maxBodyMs} ms, over the ${CADENCE_MS} ms cadence`);
    for (const p of problems) console.error(`✗ ${p}`);
    console.log(problems.length ? 'hunt-tick-shards --load: RED' : `hunt-tick-shards --load: ${N_LOAD} hunts settled within the cadence`);
    process.exit(problems.length ? 1 : 0);
  }
  if (MUTATE) {
    let bad = 0;
    for (const m of MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-hts-'));
      try {
        for (const d of ['src/core', 'src/data', FN]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
        const p = join(dir, m.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error(`✗ mutant "${m.name}": marker not found exactly once in ${m.file}`); bad++; continue; }
        writeFileSync(p, src.replace(m.from, () => m.to));
        const res = await runArms(dir, db, [m.arm]);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    for (const m of DB_MUTANTS) {
      const def = String(await one(db, `select pg_get_functiondef($1::regprocedure)`, [m.fn])).split(String.fromCharCode(13)).join('');
      if (def.split(m.find).length !== 2) { console.error(`✗ db mutant "${m.name}": anchor not found exactly once`); bad++; continue; }
      await db.exec(def.replace(m.find, () => m.replace));
      try {
        const res = await runArms(ROOT, db, [m.arm]);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { await db.exec(def); }
    }
    for (const m of SQL_MUTANTS) {
      let refused = null;
      try { await bootReplay({ patches: new Map([[m.file, sqlPatches(m)]]), upTo: LAST_PATCHED }); } catch (e) { refused = String(e.message); }
      if (refused && refused.includes(m.expect)) console.log(`✓ the §5 of ${m.file} refuses (${m.expect}): ${m.name}`);
      else { console.error(`✗ ${m.file} applied: ${m.name}${refused ? ' (' + refused.slice(0, 200) + ')' : ''}`); bad++; }
    }
    const total = MUTANTS.length + DB_MUTANTS.length + SQL_MUTANTS.length;
    console.log(bad ? `hunt-tick-shards --mutate: ${bad} mutant(s) survived` : `hunt-tick-shards --mutate: all ${total} mutants killed`);
    process.exit(bad ? 1 : 0);
  }
  const res = await runArms(ROOT, db);
  let bad = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems && problems.length) { bad++; for (const p of problems) console.error(`✗ ${name}: ${p}`); }
    else console.log(`✓ ${name}`);
  }
  console.log(bad ? `hunt-tick-shards: ${bad} arm(s) red` : `hunt-tick-shards: all ${Object.keys(res).length} arms green`);
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) main();
