#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-tick-shards.mjs — THE WORLD TICK'S HUNT SETTLES, PACKED BY LOAD
// (supabase/migrations/2026-11-04-hunt-tick-shards.sql + hr-accrue tick.js
// HUNT_BODY_BUDGET_MS + accrual.js accrueHunt's world bound).
//
//   node tests/hunt-tick-shards.mjs            the guard (26 hunts: 3 bodies)
//   node tests/hunt-tick-shards.mjs --outage   OUTAGE + CATCH-UP alone (their own CI step; --mutate --outage: their
//                                              mutants and 2027-02-04-tick-span.sql's §5 bites)
//   node tests/hunt-tick-shards.mjs --only=A,B these arms (HR_SPAN_REPORT=1: per-arm seconds, OUTAGE's numbers)
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
//   FANOUT   (2027-02-03-tick-capacity.sql) the bodies a fire queues are
//            hr_tick_config.hunt_bodies_max, not a literal 16: at one hunt a body
//            and two bodies a fire, two of three due hunts ride and one waits;
//            the chain carries the file's dials (body 4, 32 bodies)
//   BUDGET   a body past its time budget STARTS no settle: every selector is
//            `deferred`, nothing is written
//   WORLD  ★ a window whose world would encode past the bound is REFUSED by the
//            engine (world_too_large) and never committed: the instance clock,
//            swing and world are unmoved and no ledger row is written; the same
//            window under the real bound pays (control)
//   (lane/c-tick-span, 2027-02-04-tick-span.sql + hunt-settle.js HUNT_SETTLE_SPAN_MS /
//    HUNT_ENGINE_BUDGET_MS: a body's engine CPU is bounded whatever the backlog)
//   RECLAIM ★ a session whose settle LANDED is re-offered at the very next fire (its
//            lease records the clock it was taken at, and the clock moved); a
//            deferred one (nothing landed) is not, until its lease ends
//   FUSE   ★ a body carries its selectors MOST BEHIND FIRST (aged against md5, so
//            md5 order would be the reverse) and starts no settle once its engine
//            budget is spent: on a 600 ms-a-run clock and a 1 s budget two of
//            three settle, the least behind is deferred (cpu_budget) and writes
//            nothing; the summary carries what the runs measured
//   LADDER   a settle's degrade steps and its retry run no engine past the budget
//            (world_too_large: 2 runs, not 4; session_moved: no retry), each with
//            its control under an unspent budget
//   CATCH-UP ★ after a 10-min outage a hero's mid-hunt verb (a settings edit; an engine verb's settle-before-
//            mutate) is never left failing: refused only `settle_first` (the "catching up" words) until the
//            player's own settle — the hunt re-read, a verb's collect, what the client's catch-up runs — takes
//            slice after slice within ITS OWN budget, then it lands, within 3 rounds. BOTH PATHS: browser
//            closed (two tick fires, then the player returns) and hunt viewed (the player's own settles alone).
//            The caught-up answer: hunt_behind_ms under the 20 s slack, hunt_slices > 1, one timeline from
//            the first slice's start, the envelope current, its engine under EDGE_CPU_MS; the rows both paths
//            write are the same
//   OUTAGE ★ THE BUG (lane/c-settle-cost): a 30-min tick outage under a FULL body
//            (4 four-hero parties on the real Millrace Sewer) drains through the
//            real cron (hr_tick_cron_run: the reclaim, the order, the fan-out) and
//            the shipped runTick within 2 x ceil(30 min / (span - cadence)) fires,
//            every body's measured engine time under EDGE_CPU_MS with its largest
//            run inside the headroom beside HUNT_ENGINE_BUDGET_MS — BOTH PATHS:
//            the browser closed (the tick alone) and the hunt viewed (two heroes'
//            own settles between fires, each request under EDGE_CPU_MS too). No
//            time lost or doubled (each session's journalled window ms sum to its
//            clock's move), tally = ledger, and both paths write the rows the same
//            hunt writes in the pre-fix 15-min windows (the cut moves nothing)
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

const { ROOT, UIDS, STRONG, loadEdge, pinDice, hunter, character, one, q, inTx, makeExec, groundsOf, snapshot, canon, firstDiff } = HARNESS;
const UID0 = UIDS[0];
const MUTATE = process.argv.includes('--mutate');
const LOAD = process.argv.includes('--load');
/* --outage: the tick-span step alone — OUTAGE and CATCH-UP (real 4-hero parties on the real ground, ~4-5 min), and with
   --mutate their mutants and 2027-02-04-tick-span.sql's §5 bites (a replay of their own) — so CI runs it as its own step
   beside the rest of this file's (db-replay-3 vs db-replay-8, which measured 22.1 of its 30 min before this lane). */
const OUTAGE_ONLY = process.argv.includes('--outage');
const SPAN_STEP = new Set(['OUTAGE', 'CATCH-UP']);
const inScope = (arm) => SPAN_STEP.has(arm) === OUTAGE_ONLY;
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
    const r = (await M.TK.runTick({ exec, grounds: groundsOf(M), huntBudgetMs: 3600000, engineBudgetMs: 1e9,
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
    /* PACK measures the packing, the leases and one settle a hunt, not the engine budget (FUSE / OUTAGE do): a body
       of hunt_body_max instances on a loaded box may legitimately defer its tail. */
    const r = (await M.TK.runTick({ exec, grounds: groundsOf(M), engineBudgetMs: 1e9, body: b })).body;
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
  /* The file re-applies (the Coordinator's retry, a rebuild) byte-identically: its §0 admits its own
     body, the dial and its CHECK are not doubled, and the installed definitions and ACLs do not move.
     MEASURED AT ITS OWN POSITION (a replay up to this file), not at the chain head: a later file
     (2027-01-01-server-perf.sql) restates hr_hunt_roster, whose image this file's §0 pins, and a re-apply
     of THIS file after it is refused by design (it would put the dead last_seen_at predicate back). */
  IDEM: async () => {
    const { bootReplay } = await import('./schema-replay.mjs');
    const { db } = await bootReplay({ upTo: MIG });
    const problems = [];
    const look = async () => JSON.stringify(await q(db, `
      select p.oid::regprocedure::text as fn, md5(pg_get_functiondef(p.oid)) as def, p.proacl::text as acl
        from pg_proc p where p.oid in ('public.hr_tick_cron_run()'::regprocedure, 'public.hr_hunt_roster_sharded(text,integer,integer)'::regprocedure)
      union all
      select 'ck', pg_get_constraintdef(c.oid), count(*) over ()::text from pg_constraint c where c.conname = 'hr_tick_config_hunt_body_max_ck'
      order by 1`));
    const before = await look();
    try { await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')); } catch (e) { return [`the second apply raised: ${String(e.message).slice(0, 300)}`]; }
    if (await look() !== before) problems.push('the second apply moved a definition, an ACL or the CHECK');
    return problems;
  },
  'PACK-LEASE-SETTLE': async (db, M) => inTx(db, async () => (await packAndSettle(db, M, N_GUARD)).problems),

  /* FANOUT (2027-02-03-tick-capacity.sql): the bodies a fire may queue are hr_tick_config.hunt_bodies_max (was the
     literal 16 in hr_hunt_roster_sharded): at one hunt a body, two bodies a fire take two of three due hunts and the
     third waits; three bodies take all three. The file's own dials ride the chain (body 4, 32 bodies). */
  FANOUT: async (db, M) => inTx(db, async () => {
    const problems = [];
    const cfg = (await q(db, 'select hunt_body_max, hunt_bodies_max from public.hr_tick_config where id'))[0];
    if (!cfg || cfg.hunt_body_max !== 4 || cfg.hunt_bodies_max !== 32) problems.push(`the chain's dials are ${JSON.stringify(cfg)}, not body 4 / 32 bodies`);
    const sids = await hunters(db, M, 3);
    await armCron(db);
    await db.query('update public.hr_tick_config set hunt_body_max = 1, hunt_bodies_max = 2 where id');
    await db.query('savepoint fanout');
    const two = await fire(db);
    const taken = two.bodies.flatMap((b) => b.hunts.map((h) => h.session_id)).filter((s) => sids.includes(s));
    if (two.bodies.length !== 2 || taken.length !== 2) problems.push(`at 2 bodies a fire the cron queued ${two.bodies.length} bodies carrying ${taken.length} of 3 due hunts`);
    await db.query('rollback to savepoint fanout');
    await db.query('update public.hr_tick_config set hunt_bodies_max = 3 where id');
    const three = await fire(db);
    if (three.bodies.length !== 3) problems.push(`at 3 bodies a fire the cron queued ${three.bodies.length} bodies for 3 due hunts`);
    return problems;
  }),

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

/* ── lane/c-tick-span ─────────────────────────────────────────────────────── */
const SPAN_MIG = '2027-02-04-tick-span.sql';
const msOf = (t) => new Date(t).getTime();
/* n due solo hunters on the fixture ground, `behindMs[i]` behind the database's now (sessions and instances). */
async function aged(db, M, behindMs) {
  const sids = await hunters(db, M, behindMs.length);
  for (let i = 0; i < sids.length; i++) {
    const t = `date_trunc('second', now() - make_interval(secs => ${behindMs[i] / 1000}))`;
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sids[i]]);
    await db.query(`update public.hunt_instances i set settled_to = ${t}, next_swing_at = ${t} from public.hunt_sessions h
                      where h.instance_id = i.id and h.id = $1`, [sids[i]]);
  }
  return sids;
}
const clockOf = async (db, sids) => Object.fromEntries((await q(db, 'select id, settled_to from public.hunt_sessions where id = any ($1::uuid[])', [sids]))
  .map((r) => [r.id, msOf(r.settled_to)]));
/* A fake engine timer: every run measures `per` ms (proposeHuntSettle reads it twice a run). */
const fakeClock = (per) => { let t = 0; return () => (t += per); };
/* THE CPU CLOCK (OUTAGE): what the edge's limit counts is CPU, and accrueHunt is synchronous, so this process's CPU
   across one run is that run's CPU. A wall clock would also count the moments the OS gave the CPU to another
   process (a loaded box measured a 2-min slice at 4 s of wall); the edge's own timer is performance.now, which only
   over-counts (a safe fuse). */
const cpuClock = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
/* The arms run the edge at the chain's dials: one body of up to 4 instances. */
async function armSpan(db) {
  await armCron(db);
  await db.query('update public.hr_tick_config set hunt_body_max = 4, hunt_bodies_max = 32 where id');
}

/* THE OUTAGE FIXTURE: `n` parties of `size` on a REAL ground (the chain's catalogue, no fixture row), every
   hero Level 20 with 300 shrimp packed and a full purse (tools/settle-cost.mjs's kit, the heaviest common load). */
const OUTAGE_KIT = { level: 20, inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }], gold: 200000 };
const PARTY_WORDS = ['Alder', 'Birch', 'Cedar', 'Dogwood', 'Elm', 'Fir'];
async function outageParties(db, M, n, size, hunt) {
  const asUser = (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const out = [];
  for (let k = 0; k < n; k++) {
    const uids = Array.from({ length: size }, (_, i) => uidOf(300 + k * 10 + i));
    for (const uid of uids) await character(db, M, uid, OUTAGE_KIT);
    if (size > 1) {
      for (let i = 1; i < size; i++) {
        await asUser(uids[i]);
        const nm = await one(db, 'select public.hr_character_name_set(0, $1, $2::uuid)', [`${PARTY_WORDS[k]}hero ${'ABCDEF'[i]}`, idem()]);
        if (!nm || nm.ok !== true) throw new Error('name refused: ' + JSON.stringify(nm));
      }
      await asUser(uids[0]);
      const inv = await one(db, 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', [`${PARTY_WORDS[k]}hero B`, idem()]);
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
      const e = await one(db, 'select public.hr_hunt_enter(0, $1, $2::jsonb, 0, null, $3::uuid)', [hunt, JSON.stringify(OUTAGE_KIT.bag), idem()]);
      if (!e || e.ok !== true) throw new Error('enter refused: ' + JSON.stringify(e));
      sids.push(e.session.id);
    }
    const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sids[0]]);
    out.push({ uids, sids, inst });
  }
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  return out;
}
const OUTAGE_MS = 30 * 60000;
/* The optimization review's 4-hero engine p95 per simulated second (hunt-settle.js WHY 2 MIN), the rate the span is sized on. */
const P95_ENGINE_MS_PER_SIM_S = 6.2;
const OUTAGE_HUNT = 'millrace_sewer';
/* One path of the outage, from the savepoint the fixture stands at: fires every 10 s of SIMULATED time c_k (the
   database clock is the transaction's, frozen, so every simulated instant sits in its past and the edge settles to
   it through runTick's atMs seam; a lease's 30 s is three fires, lapsed here by hand since the frozen clock never
   reaches it), until every instance owes less than a cadence; then fires at the common end instant E until every
   instance stands there. `viewed`: the leaders of parties 0 and 2 also settle their own hunt (the player's door,
   mode settle + project + live, a fresh budget a request) 3.3 s before each fire. */
async function outagePath(db, M, fx, o) {
  const problems = [];
  const exec = makeExec(db);
  const span = M.HS.HUNT_SETTLE_SPAN_MS;
  const nMax = 2 * Math.ceil(OUTAGE_MS / (span - CADENCE_MS));
  const nowMs = Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
  const c = (k) => nowMs - 100000 - (nMax + 1 - k) * CADENCE_MS;     // c(nMax + 1) = the end instant E, 100 s in the past
  const E = c(nMax + 1);
  const allSids = fx.flatMap((p) => p.sids);
  const insts = fx.map((p) => p.inst);
  const instClock = async () => (await q(db, 'select id, settled_to from public.hunt_instances where id = any ($1::uuid[])', [insts]))
    .map((r) => msOf(r.settled_to));
  if (o.viewed) {
    await db.query(`insert into public.character_presence (user_id, slot, seen_at) values ($1, 0, now()), ($2, 0, now())
                      on conflict (user_id, slot) do update set seen_at = excluded.seen_at`, [fx[0].uids[0], fx[2].uids[0]]);
  }
  const leasedAt = new Map();
  const bodies = [];
  const players = [];
  let drained = null;
  const fireAt = async (k, atMs) => {
    for (const [sid, at] of leasedAt) {
      if (k - at >= 3) { await db.query('update public.hunt_tick_lease set lease_until = now() - interval \'1 second\' where session_id = $1', [sid]); leasedAt.delete(sid); }
    }
    if (o.viewed) {
      for (const lead of [fx[0].uids[0], fx[2].uids[0]]) {
        const budget = M.HS.engineBudget(undefined, cpuClock);
        const v = await M.HS.settleHunt({ exec, user: lead, slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs: atMs - 3333, budget });
        players.push({ k, outcome: v.outcome, reason: v.reason, ms: budget.spentMs, runs: budget.runs });
      }
    }
    const f = await fire(db);
    for (const b of f.bodies) {
      for (const h of b.hunts) leasedAt.set(h.session_id, k);
      const r = (await M.TK.runTick({ exec, atMs, body: b, engineClock: cpuClock })).body.hunts || {};
      bodies.push({ k, n: b.hunts.length, ...r });
    }
  };
  for (let k = 1; k <= nMax; k++) {
    await fireAt(k, c(k));
    const owed = (await instClock()).map((t) => c(k) - t);
    if (owed.every((x) => x < CADENCE_MS)) { drained = k; break; }
  }
  if (drained === null) problems.push(`${o.label}: the 30-min backlog of a full body did not drain in ${nMax} fires (still owed: ${(await instClock()).map((t) => Math.round((c(nMax) - t) / 1000) + ' s').join(', ')})`);
  for (let k = 0; k < 4 && (await instClock()).some((t) => E - t >= 2000); k++) await fireAt(1000 + k, E);
  const left = (await instClock()).map((t) => E - t);
  /* a settle ends on a swing boundary: at most one swing (2 s) either side of the instant it was asked for */
  if (left.some((x) => !(Math.abs(x) < 2000))) problems.push(`${o.label}: after the drain the instances stand ${left.join(', ')} ms short of the end instant`);

  /* EVERY BODY UNDER THE EDGE'S CPU: its measured engine time, and its largest run inside the headroom the budget leaves. */
  const B = M.HS.HUNT_ENGINE_BUDGET_MS;
  const worst = bodies.reduce((a, b) => ((b.engine_ms || 0) > (a.engine_ms || 0) ? b : a), {});
  const maxRun = Math.max(0, ...bodies.map((b) => b.engine_max_ms || 0));
  for (const b of bodies) {
    if (!((b.engine_ms || 0) < M.HS.EDGE_CPU_MS)) { problems.push(`${o.label}: fire ${b.k}'s body ran ${b.engine_ms} ms of engine, over the edge's ${M.HS.EDGE_CPU_MS} ms CPU`); break; }
  }
  if (!(maxRun + B < M.HS.EDGE_CPU_MS)) problems.push(`${o.label}: a body's largest engine run took ${maxRun} ms; beside the ${B} ms budget it can pass the edge's ${M.HS.EDGE_CPU_MS} ms`);
  if (!bodies.some((b) => (b.settled || 0) >= 4)) problems.push(`CONTROL ${o.label}: no fire settled the whole body (${JSON.stringify(bodies.slice(0, 2))})`);
  for (const pl of players) {
    if (!(pl.ms < M.HS.EDGE_CPU_MS)) { problems.push(`${o.label}: a player's own settle ran ${Math.round(pl.ms)} ms of engine (${pl.runs} runs), over ${M.HS.EDGE_CPU_MS} ms`); break; }
  }
  if (o.viewed && !players.some((pl) => pl.outcome === 'paid')) problems.push(`CONTROL ${o.label}: no player settle landed (${JSON.stringify(players.slice(0, 3))})`);

  /* NO LOST OR DOUBLED TIME; TALLY = LEDGER. */
  let maxWindowMs = 0;
  for (const sid of allSids) {
    const [r] = await q(db, `select floor(extract(epoch from h.settled_to) * 1000)::bigint as to_ms,
        (select coalesce(sum((l.meta->>'ms')::bigint), 0) from public.player_ledger l where l.session_id = h.id and l.kind = 'combat' and l.intent = 'accrue') as ms,
        (select coalesce(max((l.meta->>'ms')::bigint), 0) from public.player_ledger l where l.session_id = h.id and l.kind = 'combat' and l.intent = 'accrue') as max_ms,
        (select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::int else 0 end), 0) from public.player_ledger l where l.session_id = h.id) as lkills,
        (select coalesce(sum(case when l.kind <> 'hunt' then l.gold else 0 end), 0) from public.player_ledger l where l.session_id = h.id) as lcoins,
        t.kills as tkills, t.coins as tcoins
      from public.hunt_sessions h left join public.hunt_session_tally t on t.session_id = h.id where h.id = $1`, [sid]);
    maxWindowMs = Math.max(maxWindowMs, Number(r.max_ms));
    if (Number(r.ms) !== Number(r.to_ms) - o.t0) { problems.push(`${o.label}: session ${sid.slice(-4)} journalled ${r.ms} ms of hunt for a clock that moved ${Number(r.to_ms) - o.t0} ms (time lost or doubled)`); break; }
    if (Number(r.tkills) !== Number(r.lkills) || Number(r.tcoins) !== Number(r.lcoins)) { problems.push(`${o.label}: session ${sid.slice(-4)} tally ${r.tkills}/${r.tcoins} != ledger ${r.lkills}/${r.lcoins}`); break; }
  }
  /* EVERY RUN SIZED FOR THE EDGE, ON ANY BOX (lane/a-v0263-reds2): the CPU checks above read this process's clock, and
     a fast runner ran a pre-fix 15-min 4-hero window in under the ~1.2 s of headroom (run 40789905806: the mutant
     survived). The largest window the drain actually journalled, priced at the 4-hero p95 the span is sized on
     (hunt-settle.js WHY 2 MIN: 6.2 ms of engine per simulated second), must fit beside the budget under the limit:
     2 min = 744 ms + 800 < 2000; 15 min = 5580 ms. Deterministic: the ledger's window ms, not a timer. */
  if (!(maxWindowMs > 0)) problems.push(`CONTROL ${o.label}: no combat window was journalled`);
  else if (!((maxWindowMs / 1000) * P95_ENGINE_MS_PER_SIM_S + B < M.HS.EDGE_CPU_MS)) {
    problems.push(`${o.label}: a run settled a ${Math.round(maxWindowMs / 1000)} s window; at the 4-hero p95 (${P95_ENGINE_MS_PER_SIM_S} ms/s) that is ${Math.round((maxWindowMs / 1000) * P95_ENGINE_MS_PER_SIM_S)} ms beside the ${B} ms budget, over the edge's ${M.HS.EDGE_CPU_MS} ms`);
  }
  const snaps = [];
  for (const p of fx) for (let i = 0; i < p.sids.length; i++) snaps.push(await snapshot(db, p.sids[i], p.uids[i]));
  return { problems, snaps, E, drained, nMax, fires: bodies.length, worst, maxRun, players: players.length,
    deferred: bodies.reduce((a, b) => a + (b.deferred || 0), 0) };
}
/* The same backlog settled in the PRE-FIX 15-min windows, through hunt-settle.js's pieces (the proposal's window is the
   caller's: readHuntSettle's cap bounds only the plan it offers). */
async function outageReference(db, M, fx, E) {
  const exec = makeExec(db);
  for (const p of fx) {
    for (let k = 0; k < 8; k++) {
      const plan = await M.HS.readHuntSettle({ exec, user: p.uids[0], slot: 0, atMs: E }, 'tick');
      if (plan.answer) break;
      const pr = await M.HS.proposeHuntSettle(plan, Math.min(E, plan.fromMs + 15 * 60000), 0);
      if (!pr.out.accrued) break;
      const res = await M.HS.commitHuntSettle(exec, { ...pr.commit, project: null });
      if (!res || res.ok !== true) throw new Error('reference window refused: ' + JSON.stringify(res).slice(0, 300));
    }
  }
  const snaps = [];
  for (const p of fx) for (let i = 0; i < p.sids.length; i++) snaps.push(await snapshot(db, p.sids[i], p.uids[i]));
  return snaps;
}

const SPAN_ARMS = {
  /* The file re-applies at its own position byte-identically: §0 admits its own body, the column is not doubled. */
  'SPAN-IDEM': async () => {
    const { bootReplay } = await import('./schema-replay.mjs');
    const { db } = await bootReplay({ upTo: SPAN_MIG });
    const look = async () => JSON.stringify(await q(db, `
      select p.oid::regprocedure::text as fn, md5(pg_get_functiondef(p.oid)) as def, p.proacl::text as acl
        from pg_proc p where p.oid = 'public.hr_hunt_roster_sharded(text,integer,integer)'::regprocedure
      union all
      select 'col', c.data_type || ':' || c.is_nullable, count(*) over ()::text from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'hunt_tick_lease'
      order by 1, 2`));
    const before = await look();
    try { await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', SPAN_MIG), 'utf8')); } catch (e) { return [`the second apply raised: ${String(e.message).slice(0, 300)}`]; }
    return (await look()) === before ? [] : ['the second apply moved the roster, its ACL or the lease columns'];
  },

  RECLAIM: async (db, M) => inTx(db, async () => {
    const problems = [];
    const sids = await aged(db, M, [20 * 60000, 20 * 60000 + 1000]);
    await armSpan(db);
    const exec = makeExec(db);
    const leases = () => q(db, 'select l.session_id, l.settled_to = h.settled_to as rec from public.hunt_tick_lease l join public.hunt_sessions h on h.id = l.session_id where l.session_id = any ($1::uuid[])', [sids]);
    const posted = (f) => f.bodies.flatMap((b) => b.hunts.map((h) => h.session_id)).filter((x) => sids.includes(x)).sort();
    const f1 = await fire(db);
    if (posted(f1).length !== 2) return [`CONTROL: the first fire posted ${posted(f1).length} of the 2 due hunts`];
    if ((await leases()).filter((l) => l.rec).length !== 2) problems.push('the leases do not record the clocks they were taken at');
    if (posted(await fire(db)).length) problems.push('CONTROL: a second fire before any settle re-posted a leased hunt');
    const c0 = await clockOf(db, sids);
    for (const b of f1.bodies) await M.TK.runTick({ exec, grounds: groundsOf(M), body: b });
    const c1 = await clockOf(db, sids);
    if (!sids.every((x) => c1[x] - c0[x] >= M.HS.HUNT_SETTLE_SPAN_MS - 2000)) return [...problems, `CONTROL: the body did not settle a slice of each (${JSON.stringify(sids.map((x) => c1[x] - c0[x]))} ms)`];
    /* the settles LANDED: both are re-offered at the very next fire, under leases that record the moved clocks */
    const f3 = await fire(db);
    if (posted(f3).join() !== [...sids].sort().join()) problems.push(`after the body's settles landed the next fire re-posted ${posted(f3).length} of 2 (a landed settle's lease must end)`);
    if ((await leases()).filter((l) => l.rec).length !== 2) problems.push('a re-offered lease does not record the moved clock');
    /* a body that settles nothing (its engine budget spent at once): nothing landed, so nothing is re-offered */
    for (const b of f3.bodies) {
      const r = (await M.TK.runTick({ exec, grounds: groundsOf(M), engineBudgetMs: 0, body: b })).body.hunts || {};
      if (r.settled !== 0 || r.deferred !== b.hunts.length) problems.push(`CONTROL: a spent budget's body answered ${JSON.stringify(r)}`);
    }
    if (posted(await fire(db)).length) problems.push('a deferred hunt (nothing landed) was re-offered before its lease ended');
    return problems;
  }),

  FUSE: async (db, M) => inTx(db, async () => {
    const problems = [];
    /* three due hunts aged AGAINST md5: the instance first in md5 order is the least behind */
    const sids = await hunters(db, M, 3);
    const md5Order = (await q(db, 'select id from public.hunt_sessions where id = any ($1::uuid[]) order by md5(instance_id::text), instance_id', [sids])).map((r) => r.id);
    const t = (m) => `date_trunc('second', now() - make_interval(mins => ${m}))`;
    for (let i = 0; i < 3; i++) {
      await db.query(`update public.hunt_sessions set entered_at = ${t(11 + i)}, hunt_from = ${t(10 + i)}, settled_to = ${t(10 + i)}, next_swing_at = ${t(10 + i)} where id = $1`, [md5Order[i]]);
      await db.query(`update public.hunt_instances i set settled_to = ${t(10 + i)}, next_swing_at = ${t(10 + i)} from public.hunt_sessions h where h.instance_id = i.id and h.id = $1`, [md5Order[i]]);
    }
    const oldestFirst = [md5Order[2], md5Order[1], md5Order[0]];
    await armSpan(db);
    const f = await fire(db);
    const body = f.bodies[0];
    const order = body ? body.hunts.map((h) => h.session_id).filter((x) => sids.includes(x)) : [];
    if (f.bodies.length !== 1 || order.join() !== oldestFirst.join()) problems.push(`the body carries the hunts ${order.map((x) => md5Order.indexOf(x)).join(',')} (md5 rank); want the most behind first: 2,1,0`);
    if (!body) return problems;
    const c0 = await clockOf(db, sids);
    const r = (await M.TK.runTick({ exec: makeExec(db), grounds: groundsOf(M), body, engineBudgetMs: 1000, engineClock: fakeClock(600) })).body.hunts || {};
    if (r.settled !== 2 || r.deferred !== 1 || (r.reasons || {}).cpu_budget !== 1) problems.push(`at 600 ms a run and a 1 s budget the body answered ${JSON.stringify(r)}; want 2 settled, 1 deferred cpu_budget`);
    if (r.engine_ms !== 1200 || r.engine_max_ms !== 600) problems.push(`the summary reports engine_ms ${r.engine_ms} / max ${r.engine_max_ms}, not what its runs measured (1200 / 600)`);
    const c1 = await clockOf(db, sids);
    if (c1[md5Order[0]] !== c0[md5Order[0]]) problems.push('the deferred (least behind) hunt moved');
    if (!(c1[md5Order[2]] > c0[md5Order[2]] && c1[md5Order[1]] > c0[md5Order[1]])) problems.push('the two most behind were not the ones settled');
    if ((await stampedOf(db, [md5Order[0]])).length) problems.push('the deferred hunt wrote a ledger row');
    const r2 = (await M.TK.runTick({ exec: makeExec(db), grounds: groundsOf(M), body: { ...body, hunts: body.hunts.filter((h) => h.session_id === md5Order[0]) } })).body.hunts || {};
    if (r2.settled !== 1) problems.push(`CONTROL: under the shipped budget the deferred hunt answered ${JSON.stringify(r2)}`);
    return problems;
  }),

  LADDER: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid } = await hunter(db, M, STRONG);
    const exec = makeExec(db);
    /* THE DEGRADE LADDER: a 64-byte world bound refuses every window, so each step halves it (1 + 3 runs) */
    await db.query('savepoint ladder');
    const spent = M.HS.engineBudget(1000, fakeClock(600));
    const a = await M.HS.settleHunt({ exec, user: UID0, slot: 0, mode: 'tick', session: sid, grounds: groundsOf(M), worldMaxBytes: 64, budget: spent });
    if (a.outcome !== 'refused' || a.reason !== 'world_too_large' || spent.runs !== 2) problems.push(`a ladder on a 600 ms-a-run clock and a 1 s budget answered ${a.outcome}/${a.reason} after ${spent.runs} engine run(s); want refused world_too_large after 2`);
    await db.query('rollback to savepoint ladder');
    const wide = M.HS.engineBudget(1e9, fakeClock(600));
    const b = await M.HS.settleHunt({ exec, user: UID0, slot: 0, mode: 'tick', session: sid, grounds: groundsOf(M), worldMaxBytes: 64, budget: wide });
    if (b.outcome !== 'refused' || wide.runs !== 1 + M.HS.HUNT_MAX_DEGRADE) problems.push(`CONTROL: an unspent budget's ladder answered ${b.outcome} after ${wide.runs} runs (want ${1 + M.HS.HUNT_MAX_DEGRADE})`);
    await db.query('rollback to savepoint ladder');
    /* THE RETRY: another settler moves the instance between this settle's read and its commit (session_moved) */
    const racing = () => {
      let raced = false;
      return async (sql, prm) => {
        if (!raced && String(sql).includes('hr_hunt_apply_instance(')) {
          raced = true;
          const plan = await M.HS.readHuntSettle({ exec, user: UID0, slot: 0, grounds: groundsOf(M) }, 'tick');
          /* attempt 1: another key (the same derived key would answer the stale commit `replayed`, not session_moved) */
          const pr = await M.HS.proposeHuntSettle(plan, plan.fromMs + 30000, 1);
          await M.HS.commitHuntSettle(exec, { ...pr.commit, project: null });
        }
        return exec(sql, prm);
      };
    };
    const one1 = M.HS.engineBudget(1000, fakeClock(1200));
    const c = await M.HS.settleHunt({ exec: racing(), user: UID0, slot: 0, mode: 'tick', session: sid, grounds: groundsOf(M), budget: one1 });
    if (c.outcome !== 'refused' || c.reason !== 'session_moved' || one1.runs !== 1) problems.push(`a raced settle past its budget answered ${c.outcome}/${c.reason} after ${one1.runs} run(s); want refused session_moved, no retry`);
    await db.query('rollback to savepoint ladder');
    const two = M.HS.engineBudget(1e9, fakeClock(1200));
    const d = await M.HS.settleHunt({ exec: racing(), user: UID0, slot: 0, mode: 'tick', session: sid, grounds: groundsOf(M), budget: two });
    if (d.outcome !== 'paid' || two.runs !== 2) problems.push(`CONTROL: a raced settle under an unspent budget answered ${d.outcome}/${d.reason} after ${two.runs} runs (want paid after the retry)`);
    /* THE PLAYER DOOR'S CATCH-UP stops at its budget (25 min owed, 600 ms a run, 800 ms): two slices, no more; neither
       capped commit builds an envelope, the answer reads the caller's ONCE; the tick door takes one slice whatever is owed */
    await db.query('rollback to savepoint ladder');
    const seen = [];
    const spy = async (sql, prm) => { seen.push([String(sql), prm]); return exec(sql, prm); };
    const pb = M.HS.engineBudget(800, fakeClock(600));
    const pl = await M.HS.settleHunt({ exec: spy, user: UID0, slot: 0, mode: 'settle', bucket: null, project: true, live: true, grounds: groundsOf(M), budget: pb });
    const applies = seen.filter(([s]) => s.includes('hr_hunt_apply_instance('));
    const states = seen.filter(([s]) => s.includes('hr_state_of(')).length;
    if (pl.outcome !== 'paid' || pb.runs !== 2 || (pl.body || {}).hunt_slices !== 2 || !((pl.body || {}).hunt_behind_ms > 60000)) {
      problems.push(`a player's catch-up at 600 ms a run and an 800 ms budget answered ${pl.outcome} after ${pb.runs} runs, ${JSON.stringify(pl.body && { slices: pl.body.hunt_slices, behind: pl.body.hunt_behind_ms })}; want 2 slices, still behind`);
    }
    if (applies.length !== 2 || applies.some(([, prm]) => prm[4] !== null) || states !== 1 || !(pl.body && pl.body.state)) {
      problems.push(`the catch-up's capped commits projected ${applies.filter(([, prm]) => prm[4] !== null).length} envelope(s) and the answer read ${states} (want 0 and 1, and an envelope on the answer)`);
    }
    await db.query('rollback to savepoint ladder');
    const tb = M.HS.engineBudget(1e9, fakeClock(600));
    const tk = await M.HS.settleHunt({ exec, user: UID0, slot: 0, mode: 'tick', session: sid, grounds: groundsOf(M), budget: tb });
    if (tk.outcome !== 'paid' || tb.runs !== 1) problems.push(`CONTROL: the tick door took ${tb.runs} slice(s) of a 25-min backlog (one a fire)`);
    return problems;
  }),

  'CATCH-UP': async (db, M) => inTx(db, async () => {
    const problems = [];
    const fx = await outageParties(db, M, 1, 4, OUTAGE_HUNT);
    const p = fx[0];
    const lead = p.uids[0];
    await armSpan(db);
    const t = `date_trunc('second', now() - interval '10 minutes')`;
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = any ($1::uuid[])`, [p.sids]);
    await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [p.inst]);
    const exec = makeExec(db);
    const preset = Number(await one(db, 'select preset from public.hunt_sessions where id = $1', [p.sids[0]]));
    const nowMs = Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
    const clock = async () => Number(await one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1', [p.inst]));
    /* the player's mid-hunt settings edit, as the client sends it (a NEW key each ask) */
    const verb = async () => {
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [lead]);
      await db.query('delete from public.hr_rate_counters where user_id = $1', [lead]);
      const r = await one(db, 'select public.hr_action_set_options(0, $1, $2::jsonb, $3::uuid)', [preset, JSON.stringify({ stance: 'offensive' }), idem()]);
      await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
      return r;
    };
    /* the player's own settle (the hunt re-read the client's catch-up runs), its engine on the CPU clock */
    const playerSettle = async () => {
      const budget = M.HS.engineBudget(undefined, cpuClock);
      const v = await M.HS.settleHunt({ exec, user: lead, slot: 0, mode: 'settle', bucket: null, project: true, live: true, budget });
      return { v, budget };
    };
    const until = async (label, settle) => {
      const seen = [];
      for (let round = 0; round < 3; round++) {
        const r = await verb();
        if (r && r.ok === true) return { rounds: round, seen };
        seen.push(r && r.error);
        if (!r || r.error !== 'settle_first') { problems.push(`${label}: the verb answered ${JSON.stringify(r).slice(0, 200)}, not the catching-up refusal`); return null; }
        await settle();
      }
      problems.push(`${label}: the verb still refused ${JSON.stringify(seen)} after 3 catch-up rounds`);
      return null;
    };
    const caught = [];
    const viaPlayer = async () => {
      const from = await clock();
      const { v, budget } = await playerSettle();
      caught.push({ v, budget, from });
    };
    await db.query('savepoint catch_up');

    /* BROWSER CLOSED: the tick has taken two slices, the player returns and edits its setup */
    const sel = p.uids.map((u, i) => ({ user_id: u, slot: 0, session_id: p.sids[i] }));
    for (let k = 0; k < 2; k++) await M.TK.runTick({ exec, engineClock: cpuClock, body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts: sel } });
    if (!(nowMs - (await clock()) > 20000)) problems.push('CONTROL closed: two tick fires already caught the hunt up');
    const a = await until('browser closed', viaPlayer);
    if (a && !a.seen.length) problems.push('CONTROL closed: the verb was never refused (no outage to catch up)');
    const closedSnaps = [];
    for (let i = 0; i < p.sids.length; i++) closedSnaps.push(await snapshot(db, p.sids[i], p.uids[i]));
    await db.query('rollback to savepoint catch_up');

    /* HUNT VIEWED: the player's own settles alone (the 16 s re-read), the verb pressed at once */
    await db.query(`insert into public.character_presence (user_id, slot, seen_at) values ($1, 0, now())
                      on conflict (user_id, slot) do update set seen_at = excluded.seen_at`, [lead]);
    const b = await until('hunt viewed', viaPlayer);
    const viewedSnaps = [];
    for (let i = 0; i < p.sids.length; i++) viewedSnaps.push(await snapshot(db, p.sids[i], p.uids[i]));
    /* the engine verbs' settle-before-mutate (set-activity.js collectCurrentWindow) catches up the same way: rolled back */
    await db.query('rollback to savepoint catch_up');
    const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [lead]);
    const col = await M.SA.collectCurrentWindow({ exec, user: lead, slot: 0, env, st: env.state || {}, nowMs, capMs: 8 * 3600000, pointerSurvives: true });
    if (!col || col.outcome !== 'paid' || !(nowMs - (await clock()) < 20000 || (col.env && col.env.hunt_behind_ms > 0))) {
      problems.push(`a verb's settle-before-mutate after a 10-min outage answered ${col && col.outcome}/${col && (col.reason || col.error)}, ${nowMs - (await clock())} ms behind`);
    }

    /* THE CAUGHT-UP ANSWERS */
    for (const c of caught) {
      const body = c.v.body || {};
      if (c.v.outcome !== 'paid') { problems.push(`a catch-up settle answered ${c.v.outcome}/${c.v.reason}`); continue; }
      if (!(c.budget.spentMs < M.HS.EDGE_CPU_MS)) problems.push(`a catch-up call ran ${Math.round(c.budget.spentMs)} ms of engine (${c.budget.runs} runs), over ${M.HS.EDGE_CPU_MS}`);
      if (!Number.isFinite(body.hunt_behind_ms)) problems.push('a catch-up answer carries no hunt_behind_ms');
      if (!body.state || !Number.isSafeInteger(body.version)) problems.push('a catch-up answer carries no envelope');
      if (body.hunt_slices > 1 && body.hunt_from_ms !== c.from) problems.push(`a ${body.hunt_slices}-slice answer's timeline starts at ${body.hunt_from_ms}, not the first slice's ${c.from}`);
    }
    if (!caught.some((c) => (c.v.body || {}).hunt_slices > 1)) problems.push(`CONTROL: no catch-up took more than one slice (${JSON.stringify(caught.map((c) => (c.v.body || {}).hunt_slices))})`);
    const final = caught[caught.length - 1];
    if (final && !((final.v.body || {}).hunt_behind_ms < 20000)) problems.push(`the last catch-up left the hunt ${(final.v.body || {}).hunt_behind_ms} ms behind, past the 20 s slack`);
    if (canon(closedSnaps) !== canon(viewedSnaps)) problems.push(`the browser-closed and viewed catch-ups wrote different rows ${firstDiff(canon(closedSnaps), canon(viewedSnaps))}`);
    if (process.env.HR_SPAN_REPORT) console.log(`CATCH-UP: closed ${JSON.stringify(a)}, viewed ${JSON.stringify(b)}, answers ${JSON.stringify(caught.map((c) => ({ slices: c.v.body.hunt_slices || 1, behind: c.v.body.hunt_behind_ms, engine: Math.round(c.budget.spentMs), runs: c.budget.runs })))}`);
    return problems;
  }),

  OUTAGE: async (db, M) => inTx(db, async () => {
    const problems = [];
    const fx = await outageParties(db, M, 4, 4, OUTAGE_HUNT);
    await armSpan(db);
    /* every clock OUTAGE_MS behind the first simulated fire, at one whole second */
    const span = M.HS.HUNT_SETTLE_SPAN_MS;
    const nMax = 2 * Math.ceil(OUTAGE_MS / (span - CADENCE_MS));
    const t = `date_trunc('second', now() - make_interval(secs => ${(100000 + nMax * CADENCE_MS + OUTAGE_MS) / 1000}))`;
    const all = fx.flatMap((p) => p.sids);
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = any ($1::uuid[])`, [all]);
    await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = any ($1::uuid[])`, [fx.map((p) => p.inst)]);
    const t0 = Number(await one(db, `select floor(extract(epoch from ${t}) * 1000)::bigint`));
    await db.query('savepoint outage');
    const closed = await outagePath(db, M, fx, { label: 'browser closed', t0 });
    await db.query('rollback to savepoint outage');
    if (closed.problems.length) return closed.problems;
    const viewed = await outagePath(db, M, fx, { label: 'hunt viewed', viewed: true, t0 });
    await db.query('rollback to savepoint outage');
    const ref = await outageReference(db, M, fx, closed.E);
    problems.push(...closed.problems, ...viewed.problems);
    if (canon(closed.snaps) !== canon(ref)) problems.push(`the browser-closed drain wrote different rows from the same hunt in 15-min windows ${firstDiff(canon(closed.snaps), canon(ref))}`);
    if (canon(viewed.snaps) !== canon(closed.snaps)) problems.push(`the hunt viewed wrote different rows from the browser closed ${firstDiff(canon(viewed.snaps), canon(closed.snaps))}`);
    if (!(Number(closed.snaps[0].tally && closed.snaps[0].tally.kills) > 20)) problems.push(`CONTROL: the first party's leader killed ${closed.snaps[0].tally && closed.snaps[0].tally.kills} in 30 min`);
    if (process.env.HR_SPAN_REPORT) {
      for (const [k, v] of [['closed', closed], ['viewed', viewed]]) {
        console.log(`OUTAGE ${k}: drained at fire ${v.drained} of ${v.nMax}, ${v.fires} bodies, ${v.deferred} deferred, worst body ${JSON.stringify({ engine_ms: v.worst.engine_ms, max: v.worst.engine_max_ms, settled: v.worst.settled })}, largest run ${v.maxRun} ms, ${v.players} player settles`);
      }
    }
    return problems;
  }),
};

async function runArms(root, db, only) {
  const M = await loadEdge(root);
  const out = {};
  for (const [name, arm] of Object.entries({ ...ARMS, ...SPAN_ARMS })) {
    if (only && !only.includes(name)) continue;
    const t0 = Date.now();
    try { out[name] = await arm(db, M); } catch (e) { out[name] = [`threw: ${String(e && e.stack || e).slice(0, 600)}`]; }
    if (process.env.HR_SPAN_REPORT) console.log(`  ${name}: ${Math.round((Date.now() - t0) / 1000)} s`);
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
  /* lane/c-tick-span */
  { arm: 'FUSE', name: '[tick-span] each settle of a body gets its own engine budget (the body\'s CPU is unbounded)', file: join(FN, 'tick.js'),
    from: '          budget: engine, ...(Number.isFinite(opts.atMs)', to: '          ...(Number.isFinite(opts.atMs)' },
  { arm: 'FUSE', name: '[tick-span] the body starts settles past its spent budget', file: join(FN, 'tick.js'),
    from: '      if (engine.spentMs >= engine.limitMs) {', to: '      if (false) {' },
  { arm: 'FUSE', name: '[tick-span] the engine run is not charged to the budget', file: join(FN, 'hunt-settle.js'),
    from: '    budget.spentMs += p.engineMs;\n', to: '' },
  { arm: 'LADDER', name: '[tick-span] a degrade step runs the engine past the budget', file: join(FN, 'hunt-settle.js'),
    from: '    if (degraded > 0 && budgetSpent(budget)) return pending;\n', to: '' },
  { arm: 'LADDER', name: '[tick-span] a retry runs the engine past the budget', file: join(FN, 'hunt-settle.js'),
    from: '    if (attempt > 0 && budgetSpent(budget)) return last;\n', to: '' },
  { arm: 'LADDER', name: '[tick-span] the player door catches up past its budget', file: join(FN, 'hunt-settle.js'),
    from: '         && slices[slices.length - 1].behindMs > 0 && !budgetSpent(budget)) {', to: '         && slices[slices.length - 1].behindMs > 0) {' },
  { arm: 'LADDER', name: '[tick-span] every catch-up slice builds an envelope', file: join(FN, 'hunt-settle.js'),
    from: "    const projected = o.project === true && !(mode === 'settle' && plan.toMs < plan.endMs);", to: '    const projected = o.project === true;' },
  { arm: 'CATCH-UP', name: '[tick-span] the player door settles one slice a call (a mid-hunt verb fails for minutes)', file: join(FN, 'hunt-settle.js'),
    from: "  if (mode !== 'settle' || first.outcome !== 'paid') return first;", to: '  return first;' },
  { arm: 'OUTAGE', name: '[tick-span] THE BUG: the settle span is the pre-fix 15 min', file: join(FN, 'hunt-settle.js'),
    from: 'export const HUNT_SETTLE_SPAN_MS = 2 * 60000;', to: 'export const HUNT_SETTLE_SPAN_MS = 15 * 60000;' },
];
const DB_MUTANTS = [
  { arm: 'PACK-LEASE-SETTLE', name: 'the packer ignores hunt_body_max (one body for everything)', fn: 'public.hr_hunt_roster_sharded(text,integer,integer)',
    find: '- 1)::int / v_per as b', replace: '- 1)::int / 1000 as b' },
  { arm: 'PACK-LEASE-SETTLE', name: 'a live lease is re-claimed by the next fire', fn: 'public.hr_hunt_roster_sharded(text,integer,integer)',
    find: 'and (l.session_id is null or l.lease_until < now()\n', replace: 'and (l.session_id is null or l.lease_until < now() or true\n' },
  { arm: 'RECLAIM', name: '[tick-span] a landed settle waits out its lease (the next slice every third fire)', fn: 'public.hr_hunt_roster_sharded(text,integer,integer)',
    find: 'or (l.settled_to is not null and h.settled_to > l.settled_to))', replace: 'or false)' },
  { arm: 'RECLAIM', name: '[tick-span] the lease records no clock', fn: 'public.hr_hunt_roster_sharded(text,integer,integer)',
    find: "now() + v_lease, p.st from packed p", replace: "now() + v_lease, null::timestamptz from packed p" },
  { arm: 'RECLAIM', name: '[tick-span] a lease over an unmoved clock is re-claimed', fn: 'public.hr_hunt_roster_sharded(text,integer,integer)',
    find: 'and h.settled_to > l.settled_to))', replace: 'and h.settled_to >= l.settled_to))' },
  { arm: 'FUSE', name: '[tick-span] a body runs in md5 order (the deferred tail starves)', fn: 'public.hr_hunt_roster_sharded(text,integer,integer)',
    find: 'order by p.b, p.inst_from, md5(p.inst::text)', replace: 'order by p.b, md5(p.inst::text)' },

  { arm: 'PACK-LEASE-SETTLE', name: 'every body is leased under one holder', fn: 'public.hr_hunt_roster_sharded(text,integer,integer)',
    find: "select p.id, v_prefix || ':h' || p.b, now() + v_lease", replace: "select p.id, v_prefix || ':h0', now() + v_lease" },
  { arm: 'PACK-LEASE-SETTLE', name: 'the cron posts the packed hunts in one body', fn: 'public.hr_tick_cron_run()',
    find: '     group by r.body\n     order by r.body', replace: '     group by 0 * r.body\n     order by 0 * r.body' },
  { arm: 'FANOUT', name: '[tick-capacity] the roster keeps the literal 16 bodies a fire', fn: 'public.hr_hunt_roster_sharded(text,integer,integer)',
    find: '  c_bodies := least(greatest(coalesce(c_bodies, 16), 1), 64);', replace: '  c_bodies := 16;' },
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
/* 2027-02-03-tick-capacity.sql's §5 bites: its roster body is pinned by md5 in §0 and §5(a), so a mutant of the
   body RE-PINS both to the mutated md5 and the refusal must come from the behavioural gate named in `expect`. */
const CAP = '2027-02-03-tick-capacity.sql';
const CAP_MUTANTS = [
  { name: '[tick-capacity] the roster keeps the literal 16 bodies a fire', expect: '§5(c)',
    find: '  c_bodies := least(greatest(coalesce(c_bodies, 16), 1), 64);', replace: '  c_bodies := 16;' },
  { name: '[tick-capacity] the dials are left as they were', expect: '§5(a)',
    find: 'update public.hr_tick_config set hunt_body_max = 4, hunt_bodies_max = 32 where id;',
    replace: 'update public.hr_tick_config set hunt_body_max = 12 where id;' },
];
/* 2027-02-04-tick-span.sql's §5 bites: the roster body is pinned by md5 in §0 and §5(a), so a body mutant RE-PINS both
   (spanPatches) and the refusal must come from the behavioural gate named in `expect`. */
const SPAN_SQL_MUTANTS = [
  { name: '[tick-span] a landed settle waits out its lease', expect: '§5(e)',
    find: '            or (l.settled_to is not null and h.settled_to > l.settled_to))', replace: '            or false)' },
  { name: '[tick-span] a body runs in md5 order', expect: '§5(b)',
    find: 'order by p.b, p.inst_from, md5(p.inst::text)', replace: 'order by p.b, md5(p.inst::text)' },
  { name: '[tick-span] the lease records no clock', expect: '§5(c)',
    find: 'now() + v_lease, p.st from packed p', replace: 'now() + v_lease, null::timestamptz from packed p' },
  { name: '[tick-span] a lease over an unmoved clock is re-claimed', expect: '§5(d)',
    find: 'and h.settled_to > l.settled_to))', replace: 'and h.settled_to >= l.settled_to))' },
];
function spanPatches(m) {
  const src = readFileSync(join(ROOT, 'supabase', 'migrations', SPAN_MIG), 'utf8').replace(/\r\n/g, '\n');
  const body = (t) => { const a = t.indexOf('create or replace function public.hr_hunt_roster_sharded('); const o = t.indexOf('$function$', a) + 10; return t.slice(o, t.indexOf('$function$', o)); };
  const md5 = (t) => createHash('md5').update(t, 'utf8').digest('hex');
  const was = md5(body(src));
  const now = md5(body(src.replace(m.find, () => m.replace)));
  return [[m.find, m.replace], [`is distinct from '${was}' then`, `is distinct from '${now}' then`], [`<> '${was}' then`, `<> '${now}' then`]];
}
function capPatches(m) {
  const src = readFileSync(join(ROOT, 'supabase', 'migrations', CAP), 'utf8').replace(/\r\n/g, '\n');
  const body = (t) => { const a = t.indexOf('create or replace function public.hr_hunt_roster_sharded('); const o = t.indexOf('$function$', a) + 10; return t.slice(o, t.indexOf('$function$', o)); };
  const md5 = (t) => createHash('md5').update(t, 'utf8').digest('hex');
  const was = md5(body(src));
  const now = md5(body(src.replace(m.find, () => m.replace)));
  return was === now ? [[m.find, m.replace]]
    : [[m.find, m.replace], [`distinct from '${was}' then`, `distinct from '${now}' then`], [`<> '${was}' then`, `<> '${now}' then`]];
}
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
    const mine = (list) => list.filter((m) => inScope(m.arm || ''));
    for (const m of mine(MUTANTS)) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-hts-'));
      try {
        for (const d of ['src/core', 'src/data', FN]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
        const p = join(dir, m.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error(`✗ mutant "${m.name}": marker not found exactly once in ${m.file}`); bad++; continue; }
        writeFileSync(p, src.replace(m.from, () => m.to));
        const res = await runArms(dir, db, [m.arm]);
        if (process.env.HR_SPAN_REPORT) for (const x of (res[m.arm] || []).slice(0, 4)) console.log(`    ${x}`);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    for (const m of mine(DB_MUTANTS)) {
      const def = String(await one(db, `select pg_get_functiondef($1::regprocedure)`, [m.fn])).split(String.fromCharCode(13)).join('');
      if (def.split(m.find).length !== 2) { console.error(`✗ db mutant "${m.name}": anchor not found exactly once`); bad++; continue; }
      await db.exec(def.replace(m.find, () => m.replace));
      try {
        const res = await runArms(ROOT, db, [m.arm]);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { await db.exec(def); }
    }
    /* the older migrations' §5 bites belong to the plain file's proof; this lane's file's to --outage */
    const sqlOf = (list) => ((list === SPAN_SQL_MUTANTS) === OUTAGE_ONLY ? list : []);
    for (const m of sqlOf(SQL_MUTANTS)) {
      let refused = null;
      try { await bootReplay({ patches: new Map([[m.file, sqlPatches(m)]]), upTo: LAST_PATCHED }); } catch (e) { refused = String(e.message); }
      if (refused && refused.includes(m.expect)) console.log(`✓ the §5 of ${m.file} refuses (${m.expect}): ${m.name}`);
      else { console.error(`✗ ${m.file} applied: ${m.name}${refused ? ' (' + refused.slice(0, 200) + ')' : ''}`); bad++; }
    }
    for (const m of sqlOf(CAP_MUTANTS)) {
      let refused = null;
      try { await bootReplay({ patches: new Map([[CAP, capPatches(m)]]), upTo: LAST_PATCHED }); } catch (e) { refused = String(e.message); }
      if (refused && refused.includes(m.expect)) console.log(`✓ the §5 of ${CAP} refuses (${m.expect}): ${m.name}`);
      else { console.error(`✗ ${CAP} applied: ${m.name}${refused ? ' (' + refused.slice(0, 200) + ')' : ''}`); bad++; }
    }
    for (const m of sqlOf(SPAN_SQL_MUTANTS)) {
      let refused = null;
      try { await bootReplay({ patches: new Map([[SPAN_MIG, spanPatches(m)]]), upTo: LAST_PATCHED }); } catch (e) { refused = String(e.message); }
      if (refused && refused.includes(m.expect)) console.log(`✓ the §5 of ${SPAN_MIG} refuses (${m.expect}): ${m.name}`);
      else { console.error(`✗ ${SPAN_MIG} applied: ${m.name}${refused ? ' (' + refused.slice(0, 200) + ')' : ''}`); bad++; }
    }
    const total = mine(MUTANTS).length + mine(DB_MUTANTS).length + sqlOf(SQL_MUTANTS).length + sqlOf(CAP_MUTANTS).length + sqlOf(SPAN_SQL_MUTANTS).length;
    const tag = OUTAGE_ONLY ? ' --outage' : '';
    console.log(bad ? `hunt-tick-shards --mutate${tag}: ${bad} mutant(s) survived` : `hunt-tick-shards --mutate${tag}: all ${total} mutants killed`);
    process.exit(bad ? 1 : 0);
  }
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const scope = Object.keys({ ...ARMS, ...SPAN_ARMS }).filter(inScope);
  const res = await runArms(ROOT, db, onlyArg ? onlyArg.slice(7).split(',') : scope);
  let bad = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems && problems.length) { bad++; for (const p of problems) console.error(`✗ ${name}: ${p}`); }
    else console.log(`✓ ${name}`);
  }
  const tag = OUTAGE_ONLY ? ' --outage' : '';
  console.log(bad ? `hunt-tick-shards${tag}: ${bad} arm(s) red` : `hunt-tick-shards${tag}: all ${Object.keys(res).length} arms green`);
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) main();
