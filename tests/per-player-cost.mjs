#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/per-player-cost.mjs — WHAT ONE HERO COSTS THE SERVER ONLY GOES DOWN
// (architecture audit 2026-11-18, new rule 10; CLAUDE.md §6)
//
//   node tests/per-player-cost.mjs                     the ratchet (replays the chain, plays the shipped engine)
//   node tests/per-player-cost.mjs --write             tighten the baseline to what this tree measures (never raises)
//   node tests/per-player-cost.mjs --write --raise "<why>"   raise it, with the reason recorded beside the number
//   node tests/per-player-cost.mjs --selftest          two planted regressions must go red; the clean control must pass
//
// mutant-anchors: none — --selftest plants a ledger-duplicating trigger and an extra statement in this file's own
//   counting exec, both in memory; no tracked file is patched
//
// ── WHY ────────────────────────────────────────────────────────────────────
// The 2026-11-19 server audit (tools/qa/audit-2026-11-19-server/findings.md)
// put the ceiling at about 110-130 accounts online before the database passes
// 70% CPU, and named per-hero cost as the lever: "thousands online on this
// design means a 16-64 core database, or cutting per-account cost 3-4x". A cost
// nobody measures only grows (game_events reached 94% of the database at six
// players, by logging one row per kill). So the two numbers that set the walls
// are measured on every run, on the replayed chain with the SHIPPED edge
// (supabase/functions/hr-accrue tick.js runTick + hunt-settle.js), browser
// closed, in steady 100 s world-tick windows:
//   statements a settle   pooled transactions (= network round trips x4) the
//                         engine spends on one settle; exact, deterministic.
//   ledger rows a hero-hour   player_ledger rows one hunting hero writes an hour
//                         (wall 4: the prune's 480,000 rows a day).
//   row writes a settle   inserts + updates + deletes a settle (WAL, wall 1).
// for a lone hero (meadowbrook_thicket, Level 10) and a party of four
// (millrace_sewer, Level 20), the audit's two fixtures. The baseline in
// tests/per-player-cost.baseline.json only SHRINKS: a measurement above it is
// red; --write tightens it to the new measurement; raising it needs --raise and
// a written reason, which is the reviewable diff.
//
// BUDGET-PIN. The capacity sampler (1002-ops-capacity-sample.sql) reads a body's engine time against
// hr_ops.capacity_config.edge_budget_ms; this run also holds that number to the shipped HUNT_ENGINE_BUDGET_MS.
//
// TOLERANCE. Statements are counted exactly (0%). Ledger rows and row writes
// follow the fight, and a session's dice follow its random id, so they carry a
// band (TOL below), sized from the audit's spread (43-49 ledger rows a
// hero-hour over 36 windows): a regression the size of one extra row a kill
// (about +100%) is far outside it.
//
// Counts hold on any machine; nothing here reads a millisecond.
//
// LUCK ON (lane/d-luck-build, 2026-11-20; balance-program/01-model.md §7 allowance): the same fixtures are measured again with the
// `luck` switch on for everyone, against the SAME baseline. Luck v3.1 writes nothing while a hunt runs (1013-luck.sql hr_luck_fold
// folds a hunt into the account once, at its end), so a settle with Luck on costs what a dark one does: a red here is a Luck counter
// back on the settle path. --selftest plants one (an account_kills upsert a combat row) and requires it red.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET } from './world-tick-token-shims.mjs';
import { HARNESS } from './hunt-sessions-settle.mjs';
import { bootReplay } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const { ROOT, loadEdge, pinDice, character, one, q, makeExec, groundsOf } = HARNESS;
const BASELINE = join(ROOT, 'tests', 'per-player-cost.baseline.json');
const argv = process.argv.slice(2);
const WINDOWS = 12;
const WINDOW_MS = 100000;
const TOL = { statements_a_settle: 0, ledger_rows_a_hero_hour: 0.2, row_writes_a_settle: 0.2 };
const METRICS = Object.keys(TOL);
const uidOf = (i) => '00000000-0000-4000-8000-0000003c' + String(i).padStart(4, '0');
const idem = () => crypto.randomUUID();
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const r1 = (x) => Math.round(x * 10) / 10;

async function armCron(db) {
  await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
  await db.query(`update public.hr_tick_config set enabled = true, flush_seconds = 90, cadence_seconds = 10, batch_limit = 200,
                    lease_ms = 30000, shards = 1, fold_windows = 1, catchup_windows = 1, hunt_body_max = 4, hunt_bodies_max = 32,
                    edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue' where id`);
  await db.query('delete from net.http_request_queue');   // SHIM_NET: a queue table, no network
}
async function fire(db) {
  await db.query('delete from net.http_request_queue');
  await one(db, 'select public.hr_tick_cron_run()');
  return (await q(db, `select convert_from(body, 'UTF8') as b from net.http_request_queue order by id`))
    .map((r) => JSON.parse(r.b)).filter((b) => Array.isArray(b.hunts) && b.hunts.length);
}
const tuples = async (db) => Object.fromEntries((await q(db, `select relname, (n_tup_ins + n_tup_upd + n_tup_del)::int as n
  from pg_stat_xact_user_tables where schemaname = 'public'`)).map((r) => [r.relname, r.n]));

/* Every statement the engine sends is one pooled transaction (index.ts execTick). `extra`: the selftest's planted round trip. */
function countingExec(db, extra) {
  const base = makeExec(db);
  const stat = { n: 0 };
  const exec = async (text, params) => {
    stat.n += 1;
    if (extra && /hr_tick_settle/.test(String(text))) { stat.n += 1; await base('select 1', []); }
    return base(text, params);
  };
  return { exec, stat };
}

const WORDS = ['Alder', 'Birch', 'Cedar', 'Dogwood'];
async function party(db, M, size, hunt, kit, base) {
  const asUser = (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const uids = Array.from({ length: size }, (_, i) => uidOf(base + i));
  for (const uid of uids) await character(db, M, uid, kit);
  if (size > 1) {
    for (let i = 1; i < size; i++) {
      await asUser(uids[i]);
      const nm = await one(db, 'select public.hr_character_name_set(0, $1, $2::uuid)', [`${WORDS[0]}cost ${'ABCDEF'[i]}`, idem()]);
      if (!nm || nm.ok !== true) throw new Error('name refused: ' + JSON.stringify(nm));
    }
    await asUser(uids[0]);
    const inv = await one(db, 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', [`${WORDS[0]}cost B`, idem()]);
    if (!inv || inv.ok !== true) throw new Error('invite refused: ' + JSON.stringify(inv));
    const pid = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [uids[0]]);
    await db.query('update public.hunt_parties set hunt_id = $2 where id = $1', [pid, hunt]);
    const listed = await one(db, 'select public.hr_hunt_party_list(0, true, $1::uuid)', [idem()]);
    if (!listed || listed.ok !== true) throw new Error('list refused: ' + JSON.stringify(listed));
    for (let i = 1; i < size; i++) {
      await asUser(uids[i]);
      const j = await one(db, 'select public.hr_hunt_party_join(0, $1::uuid, $2::uuid)', [pid, idem()]);
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
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  return { uids, sids };
}
async function backdate(db, sids, secs) {
  const t = `date_trunc('second', now() - make_interval(secs => ${Number(secs)}))`;
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t},
                    next_swing_at = ${t} where id = any ($1::uuid[])`, [sids]);
  await db.query(`update public.hunt_instances i set settled_to = ${t}, next_swing_at = ${t}
                    from public.hunt_sessions h where h.instance_id = i.id and h.id = any ($1::uuid[])`, [sids]);
}

/** WINDOWS steady world-tick windows of one hunt; the three numbers. */
async function measure(db, M, fx, { extra = false } = {}) {
  const { sids } = fx;
  const behind = (WINDOWS + 2) * (WINDOW_MS / 1000);
  await backdate(db, sids, behind);
  await armCron(db);
  const nowMs = Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
  const start = Math.floor((nowMs - behind * 1000) / 1000) * 1000;
  const { exec, stat } = countingExec(db, extra);
  const led0 = Number(await one(db, 'select count(*) from public.player_ledger where session_id = any ($1::uuid[])', [sids]));
  const stmts = []; const rows = []; let ran = 0;
  for (let k = 1; k <= WINDOWS; k++) {
    await db.query(`update public.hunt_tick_lease set lease_until = now() - interval '1 second' where session_id = any ($1::uuid[])`, [sids]);
    const t0 = await tuples(db); const n0 = stat.n;
    const mine = (await fire(db)).filter((b) => b.hunts.some((h) => sids.includes(h.session_id)));
    if (!mine.length) throw new Error(`no tick body leased the hunt at window ${k}`);
    let h = null;
    for (const b of mine) h = (await M.TK.runTick({ exec, atMs: start + k * WINDOW_MS, body: b, grounds: groundsOf(M) })).body.hunts || {};
    if (!h || !h.settled) throw new Error(`window ${k} did not settle: ${JSON.stringify(h)}`);
    const t1 = await tuples(db);
    rows.push(Object.keys(t1).reduce((a, t) => a + (t1[t] - (t0[t] || 0)), 0));
    stmts.push(stat.n - n0);
    ran += 1;
    if (h.ended) break;
  }
  const led = Number(await one(db, 'select count(*) from public.player_ledger where session_id = any ($1::uuid[])', [sids])) - led0;
  const hours = ran * WINDOW_MS / 3600000;
  if (ran < WINDOWS) throw new Error(`the hunt ended after ${ran} of ${WINDOWS} windows: the fixture no longer lasts a measurement`);
  return { statements_a_settle: med(stmts), ledger_rows_a_hero_hour: r1(led / sids.length / hours), row_writes_a_settle: med(rows) };
}

const KIT10 = { level: 10, inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }], gold: 200000 };
const KIT20 = { level: 20, inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }], gold: 200000 };
const FIXTURES = {
  lone_L10_meadowbrook_thicket: { size: 1, hunt: 'meadowbrook_thicket', kit: KIT10, base: 100 },
  party4_L20_millrace_sewer: { size: 4, hunt: 'millrace_sewer', kit: KIT20, base: 200 },
};

/** One measurement of every fixture, each inside its own rolled-back savepoint. `plant`: the selftest's defect. */
async function measureAll(db, M, plant = null, luck = false) {
  const out = {};
  await db.query('begin');
  try {
    for (const [name, f] of Object.entries(FIXTURES)) {
      await db.query('savepoint fx');
      try {
        if (plant === 'ledger_dup') {
          await db.exec(`create or replace function public.hr_planted_ledger_dup() returns trigger language plpgsql as $p$
            begin if new.intent is distinct from 'planted_dup' then
              insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, session_id, at)
              values (new.user_id, new.slot, new.kind, 'planted_dup', 0, '{}'::jsonb, new.session_id, new.at); end if;
              return null; end $p$;
            create trigger hr_planted_ledger_dup after insert on public.player_ledger for each row execute function public.hr_planted_ledger_dup();`);
        }
        if (luck) await db.query(`update public.hr_feature_switches set scope = 'everyone', accounts = '{}' where switch_id = 'luck'`);
        if (plant === 'luck_write') {
          await db.exec(`create or replace function public.hr_planted_luck_write() returns trigger language plpgsql as $p$
            begin if jsonb_typeof(new.meta->'km') = 'object' then
              insert into public.account_kills as a (user_id, monster_id, kills) select new.user_id, e.key, (e.value #>> '{}')::bigint
                from jsonb_each(new.meta->'km') e on conflict (user_id, monster_id) do update set kills = a.kills + excluded.kills; end if;
              return null; end $p$;
            create trigger hr_planted_luck_write after insert on public.player_ledger for each row execute function public.hr_planted_luck_write();`);
        }
        const fx = await party(db, M, f.size, f.hunt, f.kit, f.base);
        out[name] = await measure(db, M, fx, { extra: plant === 'extra_statement' });
        /* LUCK ON: what Luck itself wrote while the hunt ran (its three tables and its ledger rows): nothing, by design */
        if (luck) out[name].luck_rows = Number(await one(db, `select (select count(*) from public.account_kills) + (select count(*) from public.account_found)
          + (select count(*) from public.account_luck) + (select count(*) from public.player_ledger where intent like 'luck%')`));
      } finally { await db.query('rollback to savepoint fx'); }
    }
  } finally { await db.query('rollback'); }
  return out;
}

/* THE CAPACITY SAMPLER READS THE SAME BUDGET (supabase/migrations/1002-ops-capacity-sample.sql): its edge wall is a body's
   engine time over hr_ops.capacity_config.edge_budget_ms, which must be the shipped engine's HUNT_ENGINE_BUDGET_MS, or the
   wall reads the wrong ceiling. Null = the sampler is not in this chain. */
async function budgetPin(db, M) {
  if (!(await one(db, "select to_regclass('hr_ops.capacity_config') is not null"))) return null;
  const sql = Number(await one(db, 'select edge_budget_ms from hr_ops.capacity_config where id'));
  return sql === Number(M.HS.HUNT_ENGINE_BUDGET_MS) ? null : `hr_ops.capacity_config.edge_budget_ms ${sql} != hunt-settle.js HUNT_ENGINE_BUDGET_MS ${M.HS.HUNT_ENGINE_BUDGET_MS}`;
}

/** Red lines: a measured value above its baseline by more than its tolerance. */
export function judge(measured, base) {
  const red = []; const tighter = [];
  for (const [fx, m] of Object.entries(measured)) {
    const b = (base.fixtures || {})[fx];
    if (!b) { red.push(`${fx}: no baseline (run --write)`); continue; }
    for (const k of METRICS) {
      const cap = b[k] * (1 + TOL[k]);
      if (m[k] > cap) red.push(`${fx} ${k}: ${m[k]} > ${b[k]}${TOL[k] ? ` (+${TOL[k] * 100}% = ${r1(cap)})` : ''}`);
      else if (m[k] < b[k] * (1 - TOL[k]) || (TOL[k] === 0 && m[k] < b[k])) tighter.push(`${fx} ${k}: ${m[k]} < ${b[k]}`);
    }
  }
  return { red, tighter };
}

async function main() {
  const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  const { db } = await bootReplay();
  await pinDice(db);
  const M = await loadEdge(ROOT);

  if (argv.includes('--selftest')) {
    if (!base) { console.error('per-player-cost: no baseline; run --write first'); return 2; }
    const fails = [];
    const arm = (label, cond, detail) => { console.log(`  ${cond ? 'ok    ' : 'FAILED'}  ${label}  ${detail}`); if (!cond) fails.push(label); };
    const clean = judge(await measureAll(db, M), base);
    arm('CONTROL: the tree as it is measures inside its baseline', clean.red.length === 0, clean.red.join('; ') || 'green');
    const dup = judge(await measureAll(db, M, 'ledger_dup'), base);
    arm('MUTANT ledger_dup: a second ledger row for every row is red', dup.red.some((r) => r.includes('ledger_rows_a_hero_hour')), dup.red.join('; ') || 'NOT red');
    const ext = judge(await measureAll(db, M, 'extra_statement'), base);
    arm('MUTANT extra_statement: one more round trip a settle is red', ext.red.some((r) => r.includes('statements_a_settle')), ext.red.join('; ') || 'NOT red');
    const luckyM = await measureAll(db, M, null, true);
    const lucky = judge(luckyM, base);
    const luckyRows = Object.values(luckyM).map((m) => m.luck_rows);
    arm('CONTROL: Luck on measures inside the same baseline and writes no Luck row mid-hunt', lucky.red.length === 0 && luckyRows.every((n) => n === 0),
      (lucky.red.join('; ') || 'green') + ' ' + JSON.stringify(luckyRows));
    const lwM = await measureAll(db, M, 'luck_write', true);
    const lw = judge(lwM, base);
    const lwRows = Object.values(lwM).map((m) => m.luck_rows);
    arm('MUTANT luck_write: a Luck counter written each settle is red', lw.red.some((r) => r.includes('row_writes_a_settle')) || lwRows.some((n) => n > 0), lw.red.join('; ') || JSON.stringify(lwRows));
    arm('CONTROL: the sampler\'s edge budget is the engine\'s', (await budgetPin(db, M)) === null, (await budgetPin(db, M)) || 'pinned');
    await db.query('begin');
    try {
      await db.query('update hr_ops.capacity_config set edge_budget_ms = edge_budget_ms + 100 where id');
      const pin = await budgetPin(db, M);
      arm('MUTANT budget_drift: a sampler budget off the engine\'s is red', pin !== null, pin || 'NOT red');
    } finally { await db.query('rollback'); }
    return fails.length ? 1 : 0;
  }

  const measured = await measureAll(db, M);
  for (const [fx, m] of Object.entries(measured)) console.log(`  ${fx.padEnd(30)} ${METRICS.map((k) => `${k} ${m[k]}`).join(', ')}`);

  if (argv.includes('--write')) {
    const raiseAt = argv.indexOf('--raise');
    const why = raiseAt > 0 ? argv[raiseAt + 1] : null;
    if (base && !why) {
      const { red } = judge(measured, base);
      const up = Object.entries(measured).some(([fx, m]) => METRICS.some((k) => base.fixtures[fx] && m[k] > base.fixtures[fx][k]));
      if (red.length || up) { console.error(`--write only tightens; a higher number needs --raise "<why>"${red.length ? `:\n  ${red.join('\n  ')}` : ''}`); return 1; }
    }
    if (why !== null && (!why || why.length < 20)) { console.error('--raise needs a reason of at least 20 characters'); return 1; }
    const fixtures = {};
    for (const [fx, m] of Object.entries(measured)) {
      const b = base && base.fixtures[fx];
      fixtures[fx] = why || !b ? { ...m } : Object.fromEntries(METRICS.map((k) => [k, Math.min(m[k], b[k])]));
    }
    const history = [...((base && base.history) || []), { at: new Date().toISOString().slice(0, 10), fixtures, ...(why ? { raised: why } : {}) }].slice(-20);
    writeFileSync(BASELINE, JSON.stringify({ _readme: [
      'Per-hero server cost, measured by tests/per-player-cost.mjs (CLAUDE.md §6 rule 10). Only shrinks:',
      '--write tightens to a lower measurement; a higher one needs --raise "<why>", recorded in history.',
    ], windows: WINDOWS, tolerance: TOL, fixtures, history }, null, 1) + '\n');
    console.log('per-player-cost: baseline written');
    return 0;
  }

  if (!base) { console.error('per-player-cost: no baseline; run --write'); return 2; }
  const { red, tighter } = judge(measured, base);
  /* LUCK ON: the same fixtures with the luck switch on for everyone, held to the same baseline (the header) */
  const lucky = await measureAll(db, M, null, true);
  for (const [fx, m] of Object.entries(lucky)) console.log(`  ${(fx + ' (Luck on)').padEnd(30)} ${METRICS.map((k) => `${k} ${m[k]}`).join(', ')}`);
  for (const r of judge(lucky, base).red) red.push('LUCK ON ' + r);
  for (const [fx, m] of Object.entries(lucky)) if (m.luck_rows !== 0) red.push(`LUCK ON ${fx}: Luck wrote ${m.luck_rows} row(s) while the hunt ran (want 0: the fold is once a hunt, at its end)`);
  const pin = await budgetPin(db, M);
  if (pin) red.push(`BUDGET-PIN ${pin}`);
  if (red.length) {
    for (const r of red) console.error(`  RED  ${r}`);
    console.error('\nper-player-cost: a hero costs the server more than the baseline (rule 10). Cut it, or');
    console.error('  node tests/per-player-cost.mjs --write --raise "<why this cost is worth it>"');
    return 1;
  }
  for (const t of tighter) console.log(`  can tighten: ${t}  (node tests/per-player-cost.mjs --write)`);
  console.log('per-player-cost: green — no hero costs more than the baseline');
  return 0;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c)).catch((e) => { console.error(e.stack || e.message); process.exit(2); });
