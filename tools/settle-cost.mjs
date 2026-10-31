#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/settle-cost.mjs — WHAT ONE HUNT INSTANCE SETTLE COSTS THE DATABASE.
//
//   node tools/settle-cost.mjs [--door=fire|player|pieces] [--heroes=4] [--windows=8]
//                              [--hunt=millrace_sewer] [--json=out.json]
//   node tools/settle-cost.mjs --compare=<rev> ...   BEFORE (rev) vs AFTER (this tree), interleaved
//   node tools/settle-cost.mjs --before=<rev> ...    BEFORE alone
//
// The instrument behind lane/c-settle-cost (2026-10-28 optimization review: a 4-hero
// party settle cost 1.48 s of DB on live, 61 reads at 440 ms and 35 commits at 457 ms).
// It replays the real chain on PGlite (tests/schema-replay.mjs), builds a party of
// `heroes` on a REAL ground with the real catalogue, and settles `windows` windows of
// 90 s (the tick's flush) as hr_engine through the shipped edge: `fire` = one world-tick
// fire over every member's selector (tick.js runTick, the browser closed), `player` =
// the viewed hero's own hunt_settle (the hunt viewed), `pieces` = the leader's settle
// through hunt-settle.js's three exported pieces. It reports:
//   · per statement the edge sends: calls, mean and total ms (wall, PGlite);
//   · per function (track_functions = all): calls, total and self ms, top N by self;
//   · per catalogue table: seq + index scans per settle (hr_hunt_limits above all).
// PGlite is WASM, one backend: its milliseconds are NOT production's (expect a constant
// factor), but the SHAPE (which function, how many calls, which table scans) is the
// same SQL on the same chain, so before/after on one machine is a fair comparison.
// Read-only toward the repo; never touches production. Not a CI step.
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };

/* The statements the edge sends, by their first distinctive call. */
const LABELS = [
  [(s) => s.includes('hr_accrue_cap_ms'), 'hello: state + span cap'],
  [(s) => s.includes('hr_seed') && s.includes('hr_perks_of'), 'hello: seeds + perks'],
  [(s) => /hr_(bestiary|trophy|collection)_of|hr_hunt_open_of|'accrue'::text/.test(s), 'hello: gate, bestiary, trophies, hunt, collection'],
  [(s) => s.includes('hr_hunt_instance_read') && s.includes('hr_state_of'), 'read (gate + instance + caller envelope)'],
  [(s) => s.includes('hr_hunt_instance_read'), 'read (gate + instance)'],
  [(s) => s.includes('hr_hunt_apply_instance'), 'apply (hr_hunt_apply_instance)'],
  [(s) => s.includes('hr_perks_of'), 'perks (hr_perks_of)'],
  [(s) => s.includes('hr_state_of'), 'caller envelope (hr_state_of)'],
];
const labelOf = (sql) => (LABELS.find(([k]) => k(sql)) || [null, 'tick: ' + sql.replace(/\s+/g, ' ').trim().slice(0, 50)])[1];

export async function prepare({ heroes = 4, windows = 8, hunt = 'millrace_sewer', windowMs = 90000, door = 'fire', db: given,
  upTo, edgeRoot, pg = false, helloState = null, anchorMs = null } = {}) {
  if (!['fire', 'player', 'pieces', 'viewed'].includes(door)) throw new Error('door is fire | player | pieces | viewed');
  if (pg && upTo) throw new Error('--pg replays this tree\'s whole chain; --upto is PGlite only');
  const H = (await import('../tests/hunt-sessions-settle.mjs')).HARNESS;
  let db = given;
  /* `pg`: the chain on a local PostgreSQL 17, production's major version (tools/pg-replay.mjs: PGlite is 18, and 18
     caches the plans of SQL functions that 17 re-plans on every statement that calls them). */
  if (!db && pg) ({ db } = await (await import('./pg-replay.mjs')).bootPg());
  if (!db) ({ db } = await (await import('../tests/schema-replay.mjs')).bootReplay(upTo ? { upTo } : undefined));
  await H.pinDice(db);
  const M = await H.loadEdge(edgeRoot || H.ROOT);
  /* Does this tree's runTick take the guard's clock seam (`opts.atMs`)? Without it the fire door replays its loop. */
  const seam = readFileSync(join(edgeRoot || H.ROOT, 'supabase', 'functions', 'hr-accrue', 'tick.js'), 'utf8').includes('opts.atMs');
  const one = H.one;
  const idem = () => crypto.randomUUID();
  const asUser = (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  /* The fixture is built in ONE committed transaction (asUser's claim is transaction-local); every settle after it
     runs in its own, as on production. */
  await db.query('begin');

  /* THE PARTY: `heroes` characters (one account each, the settle test's fixture), Level 20, a bag of food, gold. */
  const uids = H.UIDS.slice(0, heroes);
  const kit = { level: 20, inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }], gold: 200000 };
  for (const uid of uids) await H.character(db, M, uid, kit);
  if (heroes > 1) {
    for (let i = 1; i < heroes; i++) {
      await asUser(uids[i]);
      const n = await one(db, 'select public.hr_character_name_set(0, $1, $2::uuid)', [`Costhero ${String.fromCharCode(65 + i)}`, idem()]);
      if (!n || n.ok !== true) throw new Error('name refused: ' + JSON.stringify(n));
    }
    await asUser(uids[0]);
    const inv = await one(db, 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', ['Costhero B', idem()]);
    if (!inv || inv.ok !== true) throw new Error('invite refused: ' + JSON.stringify(inv));
    const party = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [uids[0]]);
    await db.query('update public.hunt_parties set hunt_id = $2 where id = $1', [party, hunt]);
    const listed = await one(db, 'select public.hr_hunt_party_list(0, true, $1::uuid)', [idem()]);
    if (!listed || listed.ok !== true) throw new Error('list refused: ' + JSON.stringify(listed));
    for (let i = 1; i < heroes; i++) {
      await asUser(uids[i]);
      const j = await one(db, 'select public.hr_hunt_party_join(0, $1::uuid, $2::uuid)', [party, idem()]);
      if (!j || j.ok !== true) throw new Error('join refused: ' + JSON.stringify(j));
    }
  }
  const sids = [];
  for (const uid of uids) {
    await asUser(uid);
    const e = await one(db, `select public.hr_hunt_enter(0, $1, $2::jsonb, 0, null, $3::uuid)`, [hunt, JSON.stringify(kit.bag), idem()]);
    if (!e || e.ok !== true) throw new Error('enter refused: ' + JSON.stringify(e));
    sids.push(e.session.id);
  }
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  const back = (windows + 2) * windowMs;
  /* anchorMs: the hunt's start instant, the SAME for a before and an after run (the engine is seeded, so two runs from one
     anchor propose the same worlds and rows; only values read off the server clock itself differ) */
  const t = Number.isFinite(anchorMs) ? `to_timestamp(${Math.floor(anchorMs / 1000)})` : `date_trunc('second', now() - make_interval(secs => ${Math.ceil(back / 1000)}))`;
  for (const sid of sids) {
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
  }
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sids[0]]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
  const from = Number(await one(db, `select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1`, [inst]));
  await db.query('commit');
  /* production's planner reads analysed tables; a fresh PostgreSQL database has no statistics yet */
  if (pg) await db.exec('analyze');

  /* THE EXEC SEAM, timed per statement (the role switch is outside the clock). */
  const stmts = new Map();
  let recording = false;
  const exec = async (text, params) => {
    await db.exec('set role hr_engine');
    const t0 = performance.now();
    try { return (await db.query(text, params)).rows; } finally {
      const ms = performance.now() - t0;
      await db.exec('reset role');
      if (recording) { const k = labelOf(text); const s = stmts.get(k) || { calls: 0, ms: 0 }; s.calls++; s.ms += ms; stmts.set(k, s); }
    }
  };
  /* THE DOORS. `fire`: one world-tick fire per window, every member's selector in one body (the roster packs an
     instance whole), through the shipped tick.js runTick — browser closed, the common case. `player`: the viewed
     hero's own hunt_settle (settleHunt mode settle, project + live, as index.ts runs it) — hunt viewed. `pieces`: the
     leader's settle through the three exported pieces, no tick loop. */
  /* THE VIEWED DOOR (lane/c-settle-cost-2): what a WATCHED party costs production, statement for statement — measured live
     2026-10-30 05:58-05:59 UTC (pg_stat_statements, the QA account's four heroes in one party, every hero open in the
     browser): 7 hunter hellos, 3 of them landing a settle, the other 4 the live view's asks below the floor. A hello is
     index.ts's accrue read (the rate gate, the state + span cap, the bestiary, trophy, open-hunt and collection reads), its
     seed read, then settleHunt (mode settle, project, live) under the requester's frame-self marker; frames are ON and
     every member is open in a client, so a landed commit pushes one frame to each OTHER member. Per window here: one landed
     hello, after the early ones (VIEWED_ASKS: 4 every 3 windows, live's ratio). realtime.send is a recording stub (the
     replay has no Realtime), so the frames' bytes are kept for the before/after diff. */
  const viewer = { user: uids[0], marker: String(uids[0]).toLowerCase() + ':0' };
  let helloRead = null;
  if (door === 'viewed') {
    await db.exec(`create schema if not exists realtime;
      create table if not exists realtime.bench_frames (n bigserial primary key, topic text, event text, payload jsonb);
      create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
        language sql as $f$ insert into realtime.bench_frames (topic, event, payload) values (topic, event, payload) $f$;
      update public.hr_tick_config set frame_push = true where id;`);
    /* helloState: a test seam (tests/settle-budget.mjs): 'read' | 'legacy' instead of what index.ts reads */
    helloRead = await helloStatements(edgeRoot || H.ROOT, helloState);
  }
  const execSelf = async (text, params) => {
    await db.exec(`begin; set local role hr_engine; select set_config('hr.frame_self', '${viewer.marker}', true)`);
    const t0 = performance.now();
    try { const r = (await db.query(text, params)).rows; await db.exec('commit'); return r; }
    catch (e) { await db.exec('rollback'); throw e; }
    finally {
      const ms = performance.now() - t0;
      if (recording) { const k = labelOf(text); const s = stmts.get(k) || { calls: 0, ms: 0 }; s.calls++; s.ms += ms; stmts.set(k, s); }
    }
  };
  /* index.ts's hello for a hunter, in its statements: the read transaction, the seed transaction, the hunt settle. */
  const hello = async (o) => {
    const u = viewer.user;
    await db.query('insert into public.character_presence (user_id, slot, seen_at) select unnest($1::uuid[]), 0, now() on conflict (user_id, slot) do update set seen_at = excluded.seen_at', [uids]);
    await helloRead.read(execSelf, u, 0);
    await execSelf(`select (public.hr_seed($1::uuid, $2::int, $3) & 4294967295)::bigint as seed,
             public.hr_seed($1::uuid, $2::int, $4)::text as salt, public.hr_perks_of($1::uuid, $2::int) as perks`, [u, 0, 'accrue:x', 'intent:accrue:x']);
    return M.HS.settleHunt({ exec: execSelf, user: u, slot: 0, mode: 'settle', bucket: null, project: true, live: true, ...o });
  };
  const phases = { read: 0, propose: 0, commit: 0, wall: 0 };
  const kills = [];
  const killsOf = (out) => (out.members || []).reduce((n, m) => n + Number((m.delta && m.delta.journal && m.delta.journal.meta && m.delta.journal.meta.kills) || 0), 0);
  const ledgerRows = async () => Number(await one(db, `select count(*) from public.player_ledger where session_id = any($1::uuid[])`, [sids]));
  const settle = async (toMs) => {
    const t0 = performance.now();
    try {
      if (door === 'fire' && !seam) {
        /* AN OLDER tick.js has no clock seam: its hunt loop is replayed here, statement for statement (one
           settleHunt per selector, in body order, mode tick), with the window ended at the seam. */
        const hunts = { settled: 0, nothing: 0, refused: 0, reasons: {} };
        for (let i = 0; i < uids.length; i++) {
          const v = await M.HS.settleHunt({ exec, user: uids[i], slot: 0, mode: 'tick', session: sids[i], atMs: toMs });
          const k = v.outcome === 'paid' ? 'settled' : (v.outcome === 'nothing' ? 'nothing' : 'refused');
          hunts[k]++; if (v.reason) hunts.reasons[v.reason] = (hunts.reasons[v.reason] || 0) + 1;
        }
        if (hunts.settled < 1) throw new Error('the fire settled nothing: ' + JSON.stringify(hunts));
        return { fire: hunts };
      }
      if (door === 'fire') {
        const r = (await M.TK.runTick({ exec, atMs: toMs,
          body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: windowMs, hunts: uids.map((u, i) => ({ user_id: u, slot: 0, session_id: sids[i] })) } })).body;
        if (!r.hunts || r.hunts.settled < 1) throw new Error('the fire settled nothing: ' + JSON.stringify(r.hunts || r));
        return { fire: r.hunts };
      }
      if (door === 'viewed') {
        const w = Math.round((toMs - from) / windowMs);
        const early = Math.floor((w * VIEWED_ASKS[0]) / VIEWED_ASKS[1]) - Math.floor(((w - 1) * VIEWED_ASKS[0]) / VIEWED_ASKS[1]);
        for (let i = 0; i < early; i++) {
          const a = await hello({ minWindowMs: 1e15 });
          if (a.reason !== 'below_min_span' || !a.body.hunt_live || !a.body.state) throw new Error('an early ask did not answer the live start point: ' + JSON.stringify({ o: a.outcome, r: a.reason }));
          if (recording) { asks++; answers.push(a.body); }
        }
        const v = await hello({ atMs: toMs });
        if (v.outcome !== 'paid' || !v.body.state) throw new Error('the viewed hello settled nothing: ' + JSON.stringify({ o: v.outcome, r: v.reason }));
        if (recording) answers.push(v.body);
        return { player: v.outcome };
      }
      if (door === 'player') {
        const v = await M.HS.settleHunt({ exec, user: uids[0], slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs: toMs });
        if (v.outcome !== 'paid') throw new Error('the player door settled nothing: ' + JSON.stringify({ o: v.outcome, r: v.reason }));
        return { player: v.outcome };
      }
      let t1 = performance.now();
      const plan = await M.HS.readHuntSettle({ exec, user: uids[0], slot: 0, atMs: toMs }, 'tick');
      if (recording) phases.read += performance.now() - t1;
      if (plan.answer) throw new Error('window skipped: ' + plan.answer.reason);
      t1 = performance.now();
      const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
      if (recording) phases.propose += performance.now() - t1;
      if (!p.out.accrued) throw new Error('window skipped: ' + p.out.reason);
      t1 = performance.now();
      const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
      if (recording) phases.commit += performance.now() - t1;
      if (!res || res.ok !== true) throw new Error('settle refused: ' + JSON.stringify(res).slice(0, 400));
      if (recording) kills.push(killsOf(p.out));
      return { res };
    } finally { if (recording) phases.wall += performance.now() - t0; }
  };
  if (door === 'fire') await db.query('update public.hr_tick_config set enabled = true where id');

  /* warm(): one window (plan caches, first-touch rows), then the stats are zeroed; step(w): window w (2..windows+1);
     report(): the measured windows. */
  let stat = true, rows0 = 0, settled = 0, asks = 0, frames0 = 0;
  const answers = [];
  const framesSent = async () => (door === 'viewed' ? Number(await one(db, 'select count(*) from realtime.bench_frames')) : 0);
  const fires = [];
  return {
    async warm() {
      await settle(from + windowMs);
      try {
        await db.exec(`set track_functions = 'all'`);
        /* the warm window's pending counters flush first, or they land after the reset and count as a measured window */
        try { await db.query('select pg_stat_force_next_flush()'); } catch { /* PG < 15 */ }
        await db.query('select 1');
        await db.query('select pg_stat_reset()');
      } catch { stat = false; }
      rows0 = await ledgerRows();
      frames0 = await framesSent();
    },
    async step(w) {
      recording = true;
      try { const r = await settle(from + w * windowMs); if (r.fire) fires.push(r.fire); settled++; } finally { recording = false; }
    },
    report: () => reportOf(),
    /* ONE WINDOW (w) of the leader's instance through the three exported pieces (read, propose, commit), statement by
       statement as hr_engine with no transaction control of its own: tests/settle-budget.mjs SB-4 settles the same window
       twice inside one transaction (a savepoint between) and compares every row it wrote. Not recorded. */
    async commitWindow(w) {
      const plan = await M.HS.readHuntSettle({ exec, user: uids[0], slot: 0, atMs: from + w * windowMs }, 'tick');
      if (plan.answer) return { skipped: plan.answer.reason };
      const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
      if (!p.out.accrued) return { skipped: p.out.reason };
      return M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    },
    users: uids,
    /* the measured settles' bytes, for a before/after diff: the ledger rows, the frames pushed, the viewer's answers */
    async evidence() {
      const ledger = await H.q(db, `select user_id, slot, kind, intent, gold, qty, item_id, meta, purse from public.player_ledger
                                     where session_id = any($1::uuid[]) order by id`, [sids]);
      const pushed = door === 'viewed' ? await H.q(db, 'select topic, event, payload from realtime.bench_frames order by n') : [];
      return { ledger, frames: pushed, answers };
    },
  };
  async function reportOf() {
  const out = { door, heroes, hunt, windows: settled, windowMs, phases_ms_per_settle: {}, statements: [], functions: [], tables: [],
    ledger_rows_per_window: +(((await ledgerRows()) - rows0) / settled).toFixed(1),
    ...(door === 'viewed' ? { early_asks_per_window: +(asks / settled).toFixed(2), frames_per_window: +(((await framesSent()) - frames0) / settled).toFixed(2) } : {}),
    ...(fires.length ? { fire_hunts_last: fires[fires.length - 1] } : {}) };
  for (const [k, v] of Object.entries(phases)) out.phases_ms_per_settle[k] = +(v / settled).toFixed(1);
  for (const [k, v] of stmts) out.statements.push({ statement: k, calls_per_settle: +(v.calls / settled).toFixed(2), mean_ms: +(v.ms / v.calls).toFixed(1), ms_per_settle: +(v.ms / settled).toFixed(1) });
  out.statements.sort((a, b) => b.ms_per_settle - a.ms_per_settle);
  out.db_ms_per_settle = +out.statements.reduce((n, s) => n + s.ms_per_settle, 0).toFixed(1);
  if (stat) {
    try { await db.query('select pg_stat_force_next_flush()'); } catch { /* PG < 15 */ }
    await db.query('select 1');
    try { await db.query('select pg_stat_clear_snapshot()'); } catch { /* none */ }
    const f = await db.query(`select funcname, calls, total_time, self_time from pg_stat_user_functions where schemaname = 'public' order by self_time desc`);
    out.functions = f.rows.map((r) => ({ fn: r.funcname, calls_per_settle: +(Number(r.calls) / settled).toFixed(1),
      self_ms_per_settle: +(Number(r.self_time) / settled).toFixed(1), total_ms_per_settle: +(Number(r.total_time) / settled).toFixed(1) }));
    const tb = await db.query(`select relname, seq_scan, idx_scan, n_tup_ins + n_tup_upd + n_tup_del as writes from pg_stat_user_tables
                                where schemaname = 'public' and (seq_scan > 0 or idx_scan > 0) order by seq_scan + coalesce(idx_scan, 0) desc`);
    out.tables = tb.rows.map((r) => ({ table: r.relname, seq_per_settle: +(Number(r.seq_scan) / settled).toFixed(1),
      idx_per_settle: +(Number(r.idx_scan || 0) / settled).toFixed(1), writes_per_settle: +(Number(r.writes) / settled).toFixed(1) }));
  }
  out.kills_per_window = kills;
  return out;
  }
}

/* Live's ask mix: 4 early live asks for every 3 landed settles (see the viewed door). */
const VIEWED_ASKS = [4, 3];

/* index.ts's accrue read for a hunter, statement for statement (index.ts is Deno TypeScript the replay cannot import,
   so its read is restated here): the rate gate; the state term with the span cap (hr_accrue_read where that tree's
   index.ts reads it, 2027-02-10-settle-reads.sql, else hr_state_of); the bestiary, trophy, open-hunt and collection
   reads. tests/settle-budget.mjs SB-0 pins this restatement to index.ts's own statement. */
export const HELLO_STATE_SQL = {
  read: 'select public.hr_accrue_read($1::uuid, $2::int) as state, public.hr_accrue_cap_ms($1::uuid, $2::int) as cap_ms, now() as now',
  legacy: 'select public.hr_state_of($1::uuid, $2::int) as state, public.hr_accrue_cap_ms($1::uuid, $2::int) as cap_ms, now() as now',
};
async function helloStatements(root, force) {
  const indexTs = readFileSync(join(root, 'supabase', 'functions', 'hr-accrue', 'index.ts'), 'utf8');
  const state = force ? HELLO_STATE_SQL[force] : /public\.hr_accrue_read\(\$\{user\}::uuid, \$\{slot\}::int\)\s+as state,/.test(indexTs) ? HELLO_STATE_SQL.read : HELLO_STATE_SQL.legacy;
  return { state, read: async (exec, u, s) => {
    await exec(`select public.hr_rate_gate($1::uuid, $2::int, 'accrue'::text) as allowed`, [u, s]);
    await exec(state, [u, s]);
    await exec('select monster_id, kills from public.hr_bestiary_of($1::uuid, $2::int)', [u, s]);
    await exec('select monster_id, stage from public.hr_trophy_of($1::uuid, $2::int)', [u, s]);
    await exec('select public.hr_hunt_open_of($1::uuid, $2::int) as session', [u, s]);
    await exec('select count(*)::int as n from public.hr_collection_of($1::uuid, $2::int)', [u, s]);
  } };
}

/** One measurement: prepare, warm, `windows` windows, report. */
export async function measure(o = {}) {
  const m = await prepare(o);
  await m.warm();
  for (let w = 2; w <= (o.windows || 8) + 1; w++) await m.step(w);
  const r = await m.report();
  /* --evidence=<file>: the measured settles' ledger rows, frames and answers, for a before/after byte diff */
  if (o.evidence) writeFileSync(o.evidence, JSON.stringify(await m.evidence(), null, 1));
  return r;
}

/** BEFORE and AFTER in one process, their windows INTERLEAVED (a, b, a, b ...): whatever else loads the machine
    loads both alike, so their milliseconds compare. */
export async function compare(a, b, windows) {
  /* one hunt start for both (a minute of slack for the second fixture), so their settles are the same settles */
  const anchorMs = Math.floor((Date.now() - (windows + 3) * (a.windowMs || 90000)) / 1000) * 1000;
  const ma = await prepare({ ...a, windows, anchorMs });
  const mb = await prepare({ ...b, windows, anchorMs });
  await ma.warm(); await mb.warm();
  for (let w = 2; w <= windows + 1; w++) { await ma.step(w); await mb.step(w); }
  return [await ma.report(), await mb.report()];
}

/* `--before=<rev>`: the SAME measurement of an older tree — the chain replayed up to the last migration that rev
   places (`--upto=<file>` overrides) and the edge + src/core + src/data that rev holds, extracted to a temp dir. */
function edgeAt(rev) {
  const dir = mkdtempSync(join(tmpdir(), 'hr-settle-cost-'));
  const tar = join(dir, 'tree.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tar, rev, 'supabase/functions/hr-accrue', 'src/core', 'src/data', 'src/build-info.js'], { cwd: ROOT });
  execFileSync('tar', ['-xf', 'tree.tar'], { cwd: dir });   // relative: GNU tar reads `C:` as a remote host
  return dir;
}
function lastMigrationAt(rev) {
  const order = JSON.parse(execFileSync('git', ['show', `${rev}:tests/schema-apply-order.json`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })).order;
  return order[order.length - 1];
}

function print(r, top, title) {
  console.log(`\n── ${title}: door ${r.door}, ${r.heroes} hero(es) on ${r.hunt}, ${r.windows} windows of ${r.windowMs / 1000} s;`
    + ` ledger rows/window ${r.ledger_rows_per_window}${r.kills_per_window.length ? '; kills/window ' + r.kills_per_window.join(',') : ''}`
    + `${r.fire_hunts_last ? '; last fire ' + JSON.stringify(r.fire_hunts_last) : ''}`);
  console.log(`phases ms/window: ${JSON.stringify(r.phases_ms_per_settle)}  DB ms/window: ${r.db_ms_per_settle}`);
  console.table(r.statements);
  if (r.functions.length) console.table(r.functions.slice(0, top));
  if (r.tables.length) console.table(r.tables.slice(0, Math.min(top, 12)));
}

/* `--compare=<rev>`: BEFORE (`rev`'s chain and edge) and AFTER (this tree), interleaved in one process. */
async function main() {
  const base = { heroes: Number(arg('heroes', 4)), hunt: arg('hunt', 'millrace_sewer'), door: arg('door', 'fire'),
    pg: process.argv.includes('--pg'), evidence: arg('evidence', null) };
  const windows = Number(arg('windows', 8));
  const top = Number(arg('top', 20));
  const rev = arg('compare', null) || arg('before', null);
  const old = rev ? { upTo: arg('upto', lastMigrationAt(rev)), edgeRoot: edgeAt(rev) } : null;
  let res;
  if (arg('compare', null)) {
    const [a, b] = await compare({ ...base, ...old }, base, windows);
    print(a, top, `BEFORE ${rev} (chain up to ${old.upTo})`);
    print(b, top, 'AFTER (this tree)');
    const calls = (r, fn) => (r.functions.find((f) => f.fn === fn) || { calls_per_settle: 0 }).calls_per_settle;
    console.log('\n── per window, BEFORE -> AFTER');
    console.table([['DB ms (statements)', a.db_ms_per_settle, b.db_ms_per_settle], ['wall ms', a.phases_ms_per_settle.wall, b.phases_ms_per_settle.wall],
      ...['hr_state_of', 'hr_state_sections_of', 'hr_hunt_limit', 'hr_char_level', 'hr_char_xp_for_level', 'hr_perks_of', 'hr_hunt_member_state']
        .map((f) => [`${f} calls`, calls(a, f), calls(b, f)]),
      ['ledger rows', a.ledger_rows_per_window, b.ledger_rows_per_window]].map(([k, x, y]) => ({ measure: k, before: x, after: y })));
    res = { before: a, after: b };
  } else {
    res = await measure({ ...base, windows, ...(old || {}) });
    print(res, top, old ? `BEFORE ${rev} (chain up to ${old.upTo})` : 'this tree');
  }
  const j = arg('json', null);
  if (j) writeFileSync(j, JSON.stringify(res, null, 1));
  process.exit(0);
}
if (isMain(import.meta.url)) main().catch((e) => { console.error('settle-cost: ' + (e && e.stack || e)); process.exit(1); });
