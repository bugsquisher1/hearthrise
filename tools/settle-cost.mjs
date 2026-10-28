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
  [(s) => s.includes('hr_hunt_instance_read') && s.includes('hr_state_of'), 'read (gate + instance + caller envelope)'],
  [(s) => s.includes('hr_hunt_instance_read'), 'read (gate + instance)'],
  [(s) => s.includes('hr_hunt_apply_instance'), 'apply (hr_hunt_apply_instance)'],
  [(s) => s.includes('hr_perks_of'), 'perks (hr_perks_of)'],
  [(s) => s.includes('hr_state_of'), 'caller envelope (hr_state_of)'],
];
const labelOf = (sql) => (LABELS.find(([k]) => k(sql)) || [null, 'tick: ' + sql.replace(/\s+/g, ' ').trim().slice(0, 50)])[1];

export async function prepare({ heroes = 4, windows = 8, hunt = 'millrace_sewer', windowMs = 90000, door = 'fire', db: given,
  upTo, edgeRoot } = {}) {
  if (!['fire', 'player', 'pieces'].includes(door)) throw new Error('door is fire | player | pieces');
  const H = (await import('../tests/hunt-sessions-settle.mjs')).HARNESS;
  let db = given;
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
  const t = `date_trunc('second', now() - make_interval(secs => ${Math.ceil(back / 1000)}))`;
  for (const sid of sids) {
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
  }
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sids[0]]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
  const from = Number(await one(db, `select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1`, [inst]));
  await db.query('commit');

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
  let stat = true, rows0 = 0, settled = 0;
  const fires = [];
  return {
    async warm() {
      await settle(from + windowMs);
      try { await db.exec(`set track_functions = 'all'`); await db.query('select pg_stat_reset()'); } catch { stat = false; }
      rows0 = await ledgerRows();
    },
    async step(w) {
      recording = true;
      try { const r = await settle(from + w * windowMs); if (r.fire) fires.push(r.fire); settled++; } finally { recording = false; }
    },
    report: () => reportOf(),
  };
  async function reportOf() {
  const out = { door, heroes, hunt, windows: settled, windowMs, phases_ms_per_settle: {}, statements: [], functions: [], tables: [],
    ledger_rows_per_window: +(((await ledgerRows()) - rows0) / settled).toFixed(1),
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

/** One measurement: prepare, warm, `windows` windows, report. */
export async function measure(o = {}) {
  const m = await prepare(o);
  await m.warm();
  for (let w = 2; w <= (o.windows || 8) + 1; w++) await m.step(w);
  return m.report();
}

/** BEFORE and AFTER in one process, their windows INTERLEAVED (a, b, a, b ...): whatever else loads the machine
    loads both alike, so their milliseconds compare. */
export async function compare(a, b, windows) {
  const ma = await prepare({ ...a, windows });
  const mb = await prepare({ ...b, windows });
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
  const base = { heroes: Number(arg('heroes', 4)), hunt: arg('hunt', 'millrace_sewer'), door: arg('door', 'fire') };
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
