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
//   P-IDEM  the newest file of this lane re-applies byte-identically
//
//   S1 — supabase/migrations/2026-10-11-world-tick-due-roster.sql
//   R1  ★ a due armed gatherer (10 min) is rostered and leased; `state` NULL
//   R2  ★ not due (30 s, 89 s): not rostered, lease untouched
//   R3  the boundary: exactly one flush is due (same clock)
//   R4  ★ shadow uses the chained mark (raw 2 h, chain 20 s -> not due;
//           chain 5 min -> due, served at the chain mark)
//   R5  the line follows hr_tick_config.flush_seconds
//   R6  ★ THE EDGE AGREES: every character the roster serves, driven through
//           the shipped runTick, is settled — never a `below_flush` skip
//   R7  ★ NO HYDRATION: a roster call over due characters calls hr_state_of
//           zero times (pg_stat_user_functions)
//   R8  grants: hr_tick only
//
//   S2 — supabase/migrations/2026-10-11-world-tick-shards.sql + tick.js
//        TICK_HOLDER_SQL (pg_net / Vault / pgcrypto stubbed by
//        tests/world-tick-token-shims.mjs, the same stubs the token guards pin)
//   H1  ★ END TO END at shards = 4: one fire queues one POST per non-empty
//           shard; the bodies' rosters are pairwise DISJOINT and cover every
//           due character; each body names its shard and its rows are leased
//           to that shard's holder; every body's MAC verifies with tick.js's
//           own gate; and the shipped runTick, handed each body, settles every
//           character (the edge's holder equals the driver's lease)
//   H2  ★ shards = 1 is the single-POST driver: one POST, shard 0, holder
//           `left('cron:'||db,64)`, no fan-out keys in the log, settles
//   H3  ★ a body naming the wrong shard settles nothing (no_lease)
//   H4  ★ NO CROSS-SHARD CLAIM: a character leased by shard 3, dial moved to
//           2, is not served to its new shard until that lease ends
//   H5  tick.js MAX_SHARDS equals the hr_tick_config_shards_ck ceiling
//   H6  the keyset cursor is per shard: a full batch resumes, a short one
//           resets, and the config row's retired cursor stays NULL
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import * as TICK from '../supabase/functions/hr-accrue/tick.js';
import { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET, K_SECRET } from './world-tick-token-shims.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);

/* This lane's files, OLDEST FIRST. The newest is the one P-IDEM re-applies
   (each file's §0 accepts its predecessor's body or its own, so an older file
   re-applied over a newer body refuses by design). */
const LANE = [
  '2026-10-11-world-tick-due-roster.sql',
  '2026-10-11-world-tick-shards.sql',
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

async function arms(db, { log = true, tick = TICK } = {}) {
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
    + " flush_seconds = 90, cadence_seconds = 10, batch_limit = 200, lease_ms = 30000, shards = 1,"
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
  /** The one-statement seam index.ts hands the tick, as the real role. */
  const exec = async (text, params) => {
    await db.exec('begin'); await db.exec('set local role hr_engine');
    try { return (await db.query(text, params)).rows; } finally { await db.exec('commit'); }
  };
  const fireEdge = async (body) => {
    try { return (await tick.runTick({ exec, probe: false, body })).body; }
    catch (e) { return { threw: String(e.message).slice(0, 160) }; }
  };
  const holderOf = async (k) => (await one(
    "select case when $1::int = 0 then left('cron:' || coalesce(current_database(), 'db'), 64)"
    + " else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || $1::int end as h", [k])).h;
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
    const fire = await fireEdge({ op: 'tick', roster: served.map((r) => ({ user_id: String(r.user_id), slot: r.slot })),
      cadence_ms: 10000, flush_ms: 90000 });
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

  // ── S2 ──────────────────────────────────────────────────────────────────
  {
    const queue = async () => (await q(`select id, headers, convert_from(body, 'UTF8') as body
                                          from net.http_request_queue order by id`))
      .map((r) => ({ id: r.id, headers: r.headers, raw: r.body, j: JSON.parse(r.body) }));
    const cronFire = async () => {
      await q('delete from net.http_request_queue');
      return (await one('select public.hr_tick_cron_run() as r')).r;
    };
    const lastNote = async () => (await one('select outcome, rostered, detail from public.hr_tick_cron_log order by id desc limit 1')) || {};
    const macOk = (p) => {
      const h = new Headers(Object.entries(p.headers || {}));
      const g = tick.tickGate(h, K_SECRET, Date.now());
      return !!(g && g.ok && tick.tickBodyAuthOk(g.token, new TextEncoder().encode(p.raw), K_SECRET));
    };
    const selectors = (b) => (b.roster || []).map((r) => ({ user_id: String(r.user_id), slot: r.slot }));

    // H1 the fan-out, end to end
    await db.exec('delete from public.hr_tick_ownership;');
    await q('delete from public.hr_tick_shard_cursor');
    await cfg('shards = 4');
    const fx = [];
    for (let i = 0; i < 24; i++) fx.push(await char(U(100 + i), { ageS: 600 }));
    const want = new Set((await q('select distinct public.hr_tick_shard_of(u, 4) as s from unnest($1::uuid[]) u', [fx])).map((r) => r.s));
    const out = await cronFire();
    const posts = await queue();
    const seen = new Map();
    let overlap = 0; let wrongShard = 0; let wrongLease = 0;
    for (const p of posts) {
      const k = p.j.shard;
      const hk = await holderOf(k);
      if (p.j.holder !== hk) wrongLease++;
      for (const r of p.j.roster || []) {
        const u = String(r.user_id);
        if (seen.has(u)) overlap++;
        seen.set(u, k);
        if (r.shard !== k || 'state' in r) wrongShard++;
        if ((await lease(u)) !== hk) wrongLease++;
      }
    }
    const shardSet = new Set(posts.map((p) => p.j.shard));
    const note = await lastNote();
    ok('H1a', out && out.outcome === 'posted' && posts.length === want.size && want.size >= 2
        && shardSet.size === posts.length && overlap === 0 && wrongShard === 0 && wrongLease === 0
        && seen.size === fx.length && fx.every((u) => seen.has(u))
        && note.detail && note.detail.shards === 4
        && (note.detail.rostered_by_shard || []).reduce((a, b) => a + b, 0) === fx.length,
      `shards = 4: ${posts.length} POSTs (one per non-empty shard), disjoint rosters covering all ${fx.length} `
      + 'due characters, each row leased to its body\'s shard holder, logged per shard',
      JSON.stringify({ out, posts: posts.length, want: [...want], overlap, wrongShard, wrongLease, seen: seen.size,
        note: note.detail && { shards: note.detail.shards, by: note.detail.rostered_by_shard } }));
    ok('H1b', posts.length > 0 && posts.every(macOk),
      'every body\'s X-HR-Tick-Auth verifies with tick.js tickGate + tickBodyAuthOk over the queued bytes',
      `MAC per body: ${JSON.stringify(posts.map(macOk))}`);
    let settled = 0; const why = {};
    for (const p of posts) {
      const f = await fireEdge(p.j);
      settled += Number(f.processed || 0);
      for (const [r, n] of Object.entries(f.reasons || {})) why[r] = (why[r] || 0) + n;
      if (f.threw) why.threw = f.threw;
    }
    ok('H1c', settled === fx.length && !why.no_lease,
      `the shipped runTick, handed each shard's body, settled all ${fx.length} characters (the edge's holder is the driver's)`,
      `settled ${settled}/${fx.length}; reasons ${JSON.stringify(why)}`);

    // H2 one shard is the single-POST driver
    await db.exec('delete from public.hr_tick_ownership;');
    await cfg('shards = 1');
    const one1 = [await char(U(200), { ageS: 600 }), await char(U(201), { ageS: 600 }), await char(U(202), { ageS: 600 })];
    const o2 = await cronFire();
    const p2 = await queue();
    const n2 = await lastNote();
    const f2 = p2.length === 1 ? await fireEdge(p2[0].j) : { processed: 0 };
    ok('H2', o2.outcome === 'posted' && p2.length === 1 && p2[0].j.shard === 0 && p2[0].j.holder === HOLDER
        && !('shards' in (n2.detail || {})) && !('rostered_by_shard' in (n2.detail || {}))
        && (n2.detail || {}).holder === HOLDER && !('shards' in o2)
        && selectors(p2[0].j).length === 3 && f2.processed === 3,
      `shards = 1: one POST, shard 0, holder ${HOLDER}, no fan-out keys logged, and it settles all 3`,
      JSON.stringify({ o2, posts: p2.map((p) => ({ shard: p.j.shard, holder: p.j.holder, n: (p.j.roster || []).length })),
        detail: n2.detail, f2 }));

    // H3 a body naming the wrong shard settles nothing
    await db.exec('delete from public.hr_tick_ownership;');
    const w = [await char(U(300), { ageS: 600 }), await char(U(301), { ageS: 600 })];
    const h2 = await holderOf(2);
    await q("update public.hr_tick_ownership set lease_holder = $2, lease_until = now() + interval '5 minutes' where user_id = any($1::uuid[])", [w, h2]);
    const l0 = Number((await one('select count(*)::int as n from public.player_ledger where user_id = any($1::uuid[])', [w])).n);
    const f3 = await fireEdge({ op: 'tick', shard: 1, roster: w.map((u) => ({ user_id: u, slot: 0 })), cadence_ms: 10000, flush_ms: 90000 });
    const f3b = await fireEdge({ op: 'tick', roster: w.map((u) => ({ user_id: u, slot: 0 })), cadence_ms: 10000, flush_ms: 90000 });
    const l1 = Number((await one('select count(*)::int as n from public.player_ledger where user_id = any($1::uuid[])', [w])).n);
    const f3c = await fireEdge({ op: 'tick', shard: 2, roster: w.map((u) => ({ user_id: u, slot: 0 })), cadence_ms: 10000, flush_ms: 90000 });
    ok('H3', Number((f3.reasons || {}).no_lease) === 2 && Number((f3b.reasons || {}).no_lease) === 2 && l1 === l0
        && f3c.processed === 2,
      'characters leased to shard 2: a body naming shard 1, and one naming none, settle nothing (no_lease x2, '
      + 'zero ledger rows); the body naming shard 2 settles both',
      JSON.stringify({ shard1: f3.reasons, none: f3b.reasons, ledger: l1 - l0, shard2: f3c }));

    // H4 no cross-shard claim across a dial move
    await db.exec('delete from public.hr_tick_ownership;');
    await cfg('shards = 4');
    let mover = null;
    for (let i = 0; i < 64 && !mover; i++) {
      const u = U(400 + i);
      const s = (await one('select public.hr_tick_shard_of($1::uuid, 4) as a, public.hr_tick_shard_of($1::uuid, 2) as b', [u]));
      if (s.a === 3 && s.b !== 3) mover = u;
    }
    if (!mover) throw Object.assign(new Error('H4: no fixture hashes to shard 3 of 4'), { harness: true });
    await char(mover, { ageS: 600 });
    const r4a = (await roster(['gather'], await holderOf(3), 3)).some((r) => String(r.user_id) === mover);
    await cfg('shards = 2');
    const k2 = (await one('select public.hr_shard_of($1::uuid) as k', [mover])).k;
    const r4b = (await roster(['gather'], await holderOf(k2), k2)).some((r) => String(r.user_id) === mover);
    await q("update public.hr_tick_ownership set lease_until = now() - interval '1 second' where user_id = $1", [mover]);
    const r4c = (await roster(['gather'], await holderOf(k2), k2)).some((r) => String(r.user_id) === mover);
    ok('H4', r4a && !r4b && r4c,
      `a character leased by shard 3 of 4 is not served to its new shard ${k2} of 2 while that lease lives, and is once it ends`,
      JSON.stringify({ leasedBy3: r4a, servedWhileLeased: r4b, servedAfter: r4c }));

    // H5 the edge's ceiling is the CHECK's
    const ck = (await one("select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'hr_tick_config_shards_ck'"))?.d || '';
    const hi = Number((ck.match(/shards <= (\d+)/) || [])[1]);
    ok('H5', hi === tick.MAX_SHARDS && /shards >= 1/.test(ck),
      `tick.js MAX_SHARDS ${tick.MAX_SHARDS} equals the CHECK ceiling (${ck})`,
      `MAX_SHARDS ${tick.MAX_SHARDS} vs ${ck}`);

    // H6 the cursor is per shard
    await db.exec('delete from public.hr_tick_ownership;');
    await q('delete from public.hr_tick_shard_cursor');
    await cfg('shards = 1, batch_limit = 2');
    for (let i = 0; i < 5; i++) await char(U(500 + i), { ageS: 600 + i });
    const b1 = (await cronFire(), (await queue())[0]?.j.roster || []).map((r) => String(r.user_id));
    const c1 = await one('select cursor_at from public.hr_tick_shard_cursor where shard = 0');
    const b2 = (await cronFire(), (await queue())[0]?.j.roster || []).map((r) => String(r.user_id));
    const b3 = (await cronFire(), (await queue())[0]?.j.roster || []).map((r) => String(r.user_id));
    const c3 = await one('select cursor_at from public.hr_tick_shard_cursor where shard = 0');
    const cfgCur = await one('select cursor_at, cursor_user, cursor_slot from public.hr_tick_config where id');
    await cfg('batch_limit = 200');
    const all3 = new Set([...b1, ...b2, ...b3]);
    ok('H6', b1.length === 2 && b2.length === 2 && b3.length === 1 && all3.size === 5
        && c1 && c1.cursor_at !== null && c3 && c3.cursor_at === null
        && cfgCur.cursor_at === null && cfgCur.cursor_user === null && cfgCur.cursor_slot === null,
      'batch 2 over 5 due: fires serve 2, 2, 1 distinct characters; the shard cursor holds after a full '
      + 'batch and resets after a short one; the config row\'s retired cursor stays NULL',
      JSON.stringify({ b1: b1.length, b2: b2.length, b3: b3.length, distinct: all3.size, c1, c3, cfgCur }));
    await cfg('shards = 1');
  }

  return red;
}

const bodies = async (db) => (await db.query(
  `select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as h from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('hr_tick_roster', 'hr_tick_cron_run', 'hr_shard_of', 'hr_tick_shard_of')
    order by 1`)).rows.map((r) => r.h).join(',');

async function boot() {
  const { db } = await bootReplay({ upTo: NEWEST });
  /* What Supabase has and PGlite does not, from the ONE copy the token guards
     pin against node:crypto and the migration's own vector. */
  await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
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
    : '\nGREEN: the roster serves only due characters without hydrating them; one fire fans out to disjoint, '
      + 'correctly-leased shards the edge settles; the edge settles every one it is served');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate ──────────────────────────────────────────────────────────────
// SQL mutants re-create ONE function from this lane's chain-end text with one
// line broken (each file's own self-check md5 lock would refuse a patched FILE
// before any behaviour ran, which proves the lock, not the arms). EDGE mutants
// patch a COPY of the function directory under the OS temp dir (never the
// tracked file: Security S-UM-1) and hand the arms that copy's runTick.
const SRC = {
  roster: fnSource('hr_tick_roster'),
  cron: fnSource('hr_tick_cron_run'),
  shardOf: fnSource('hr_shard_of'),
};
const RESTORE = [
  SRC.roster, SRC.cron, SRC.shardOf,
  'revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) from public;',
  'revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) from anon, authenticated, service_role, hr_engine;',
  'grant  execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) to hr_tick;',
  'revoke execute on function public.hr_tick_cron_run() from public;',
  'revoke execute on function public.hr_tick_cron_run() from anon, authenticated, service_role, hr_engine, hr_tick;',
  'revoke execute on function public.hr_shard_of(uuid) from public;',
  'revoke execute on function public.hr_shard_of(uuid) from anon, authenticated, service_role, hr_engine, hr_tick;',
].join('\n');
const MUTANTS = [
  // S1
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
  // S2
  { name: 'oneHolderForAll', fn: 'cron', why: 'every shard leases under shard 0\'s name (the edge of shard k settles nothing)', expect: /H1/,
    find: "                     else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || k end;",
    repl: "                     else left('cron:' || coalesce(current_database(), 'db'), 64) end;" },
  { name: 'noShardKey', fn: 'cron', why: 'the body does not name its shard (the edge settles it as shard 0)', expect: /H1/,
    find: "                                   'shard', k,\n", repl: '' },
  { name: 'shardConstant', fn: 'shardOf', why: 'hr_shard_of is `select 0` again: one fire, one POST, whatever the dial', expect: /H1|H4/,
    find: "  select public.hr_tick_shard_of(p_user,\n           coalesce((select c.shards from public.hr_tick_config c where c.id), 1))",
    repl: '  select 0' },
  { name: 'cursorNeverAdvances', fn: 'cron', why: 'a full batch does not store its cursor (the next fire re-serves it)', expect: /H6/,
    find: '      values (k, v_last_a, v_last_u, v_last_s, now())', repl: '      values (k, null, null, null, now())' },
  { name: 'fanOutLoggedAlways', fn: 'cron', why: 'a one-shard fire logs fan-out keys (the single-POST log row is not preserved)', expect: /H2/,
    find: '    || case when v_shards > 1\n            then jsonb_build_object(\'shards\'',
    repl: '    || case when true\n            then jsonb_build_object(\'shards\'' },
  { name: 'edgeHolderIgnoresShard', edge: 'tick.js', why: 'the edge settles every shard under shard 0\'s holder', expect: /H1|H3/,
    find: '  const [h] = await exec(TICK_HOLDER_SQL, [body.shard]);', repl: '  const [h] = await exec(TICK_HOLDER_SQL, [0]);' },
  { name: 'edgeHolderSpelling', edge: 'tick.js', why: 'the edge spells shard k\'s holder differently from the driver', expect: /H1|H3/,
    find: " + \" else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || $1::int end as holder\";",
    repl: " + \" else left('cron:' || coalesce(current_database(), 'db'), 58) || '-s' || $1::int end as holder\";" },
  { name: 'edgeMaxShards', edge: 'tick.js', why: 'the edge ceiling drifts from the CHECK', expect: /H5/,
    find: 'export const MAX_SHARDS = 16;', repl: 'export const MAX_SHARDS = 8;' },
];

/** A patched COPY of the edge, imported fresh. Returns the module and its temp root. */
async function edgeCopy(file, find, repl) {
  const base = await mkdtemp(join(tmpdir(), 'hr-wts-'));
  const dir = join(base, 'supabase', 'functions', 'hr-accrue');
  await cp(join(ROOT, 'supabase', 'functions', 'hr-accrue'), dir, { recursive: true });
  await cp(join(ROOT, 'src', 'core'), join(base, 'src', 'core'), { recursive: true });
  await cp(join(ROOT, 'src', 'data'), join(base, 'src', 'data'), { recursive: true });
  if (find !== null && !CONTROL) {
    const src = (await readFile(join(dir, file), 'utf8')).replace(/\r\n/g, '\n');
    if (src.split(find).length !== 2) {
      throw Object.assign(new Error(`edge anchor matched ${src.split(find).length - 1}x in ${file}`), { harness: true });
    }
    await writeFile(join(dir, file), src.replace(find, () => repl), 'utf8');
  }
  const mod = await import(pathToFileURL(join(dir, 'tick.js')).href);
  return { mod, base };
}

console.log('\nworld-tick-scale --mutate: every mutant must go RED on its named arm');
let db;
try { db = await boot(); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const control = await arms(db, { log: false });
if (control.length) { console.error(`harness: the unmutated control is red (${control.join(', ')})`); process.exit(2); }
console.log(`[mutants] ${MUTANTS.length}`);
let survived = 0;
for (const m of MUTANTS) {
  let red;
  let tmp = null;
  try {
    if (m.edge) {
      const c = await edgeCopy(m.edge, m.find, m.repl);
      tmp = c.base;
      try { red = await arms(db, { log: false, tick: c.mod }); } catch (e) { red = [`threw: ${e.message}`]; }
    } else {
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
      try { red = await arms(db, { log: false }); } catch (e) { red = [`threw: ${e.message}`]; }
    }
  } catch (e) {
    if (e.harness) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
    throw e;
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  }
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
