// ============================================================================
// tests/world-tick-gather-widen.mjs — ARMED GATHER WIDENS BY SERVER ENROLMENT,
// AND ONE STALLED GATHERER IS NAMED
//
//   node tests/world-tick-gather-widen.mjs            the guard
//   node tests/world-tick-gather-widen.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-10-world-tick-gather-widen.sql (stage 1 of the
// gather widen; design note "Gather widen" in
// docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md). The file's §8 executes
// its scenario once at apply time (it runs here too: the chain is booted
// THROUGH it); this guard re-measures every claim on the PGlite chain replay,
// as the OWNER (how pg_cron runs enrol and how an operator calls the judge),
// and proves each arm can fail.
//
//   P-IDEM  the file re-applies byte-identically (§0 accepts its own body)
//   W1  ★ a fresh in-bucket gatherer is enrolled (owned) and journalled with
//           its bucket, permille and accrued_to; NOTHING is paid (no ledger
//           row, no player_state field moved)
//   W2  ★ not enrolled: out of bucket, stale return (> fresh_s), not on
//           gather, partied, and an operator's owned = false row (not flipped)
//   W3  ★ the max_owned fuse: room for one -> exactly the freshest-then-lowest
//           key; then state 'full' and nothing more
//   W4  ★ disarmed -> 'disarmed', disabled -> 'disabled', permille 0 -> 'off':
//           none enrols
//   W5  idempotent: a second run enrols and journals nothing
//   W6  ★ the lag judge: a gatherer 30 min behind with no tick payment is
//           STUCK and named; one 30 min behind but paid by the tick a minute
//           ago is MOVING (not stuck); a fresh one is not stuck
//   W7  ★ unenrol: exactly the journal-enrolled rows go (journalled
//           'unenrol'), operator rows stay, permille -> 0, nothing re-enrols,
//           a second unenrol removes nothing
//   W8  ★ THE RESIDUAL, CLOSED: three healthy armed gatherers keep both hours
//           above the 30-windows floor, so the aggregate armed judge reads
//           judged and NOT stalled — while one stalled gatherer among them is
//           named by lag_stalled. The pre-existing keys keep their meaning.
//   W9  no role holds EXECUTE on the three functions; hr_engine and hr_tick
//           are refused by name; no role holds a privilege on either table
//   W10 the cron job hr-tick-enrol is scheduled every minute with its command
//   W12 tools/vitals.mjs ARMED_LAG (the V6 read a person sees) agrees with the
//           DB lag judge on the same fixtures: stuck and judged counts equal
//   W11 the staged kill file 2026-10-10-world-tick-gather-unwiden.sql runs and
//           its own read-back assertions pass
//
// Not provable on one PGlite connection, argued in the file instead: the
// advisory lock serialising enrol and unenrol.
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const MIG = '2026-10-10-world-tick-gather-widen.sql';
const KILL = '2026-10-10-world-tick-gather-unwiden.sql';
const MIG_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
const KILL_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', KILL), 'utf8')).replace(/\r\n/g, '\n');
// tools/vitals.mjs's ARMED_LAG, lifted verbatim (W12): the person's V6 read must
// never disagree with the database's lag judge.
const VITALS_SRC = (await readFile(join(ROOT, 'tools', 'vitals.mjs'), 'utf8')).replace(/\r\n/g, '\n');
const VITALS_LAG = (() => {
  const a = VITALS_SRC.indexOf('const ARMED_LAG = `');
  const b = VITALS_SRC.indexOf('`;', a);
  if (a < 0 || b < 0) throw Object.assign(new Error('ARMED_LAG not found in tools/vitals.mjs'), { harness: true });
  return VITALS_SRC.slice(a + 'const ARMED_LAG = `'.length, b);
})();

/** The `create or replace function public.<name>(` statement, verbatim, through its closing `$$;`. */
function fnSource(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const as = sql.indexOf('\nas $$', start);
  const end = sql.indexOf('$$;', as + 6);
  if (start < 0 || as < 0 || end < 0) throw Object.assign(new Error(`${name} not found`), { harness: true });
  return sql.slice(start, end + 3);
}

/** The bucket, computed the way the file states it: md5(uuid text), 28 bits, mod 1000. */
const bucketOf = (u) => parseInt(createHash('md5').update(u).digest('hex').slice(0, 7), 16) % 1000;
const PERMILLE = 500;
let RUN = 0;
let SEQ = 0;
/** A fresh uuid for this run whose bucket is in (want = true) or out of the 500 ‰ cohort. */
const uidIn = (want) => {
  for (;;) {
    SEQ += 1;
    const u = `00000000-0000-4000-8000-${RUN.toString(16).padStart(4, '0')}${SEQ.toString(16).padStart(8, '0')}`;
    if ((bucketOf(u) < PERMILLE) === want) return u;
  }
};

async function arms(db, { log = true } = {}) {
  RUN += 1;
  const red = [];
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) { if (log) console.log(`  ✓ ${id} — ${okMsg}`); } else { red.push(id); if (log) console.log(`  ✗ ${id} — ${badMsg}`); }
  };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const cfg = (set) => db.exec(`update public.hr_tick_config set ${set} where id;`);
  const coh = (set) => db.exec(`update public.hr_tick_cohort set ${set} where channel = 'gather';`);
  const gact = (await one("select activity_id from public.hr_activities where kind = 'gather' order by activity_id limit 1"))?.activity_id;
  const cact = (await one("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1"))?.activity_id;
  if (!gact || !cact) throw Object.assign(new Error('hr_activities lacks a gather or combat row'), { harness: true });

  // A clean gather cohort per run (the guard's own database only): the fuse
  // counts every owned row, and earlier runs' rows must not fill it.
  await db.exec("delete from public.hr_tick_ownership where channel = 'gather';");
  // Earlier runs' fixtures (control, mutants) are parked off gather, so a
  // mutant that over-enrols in one run cannot fill the next run's fuse.
  await q("update public.player_state set active_kind = 'combat', active_id = $1 where user_id::text like '00000000-0000-4000-8000-%' and active_kind = 'gather'", [cact]);
  await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['gather']");
  await coh(`permille = ${PERMILLE}, max_owned = 100, fresh_s = 600`);

  /** A character; `ago` minutes since its last real settle. */
  const char = async (u, { ago = 0, kind = 'gather', since = 180 } = {}) => {
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
    await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                              active_kind, active_id, active_since)
             values ($1, 0, 0, 0, 10, 10, 1, now() - make_interval(mins => $2), $3, $4, now() - make_interval(mins => $5))`,
      [u, ago, kind, kind === 'combat' ? cact : gact, since]);
    return u;
  };
  const own = (u, owned = true) => q(`insert into public.hr_tick_ownership (user_id, slot, channel, owned)
                                      values ($1, 0, 'gather', $2)`, [u, owned]);
  const enrol = async () => (await one('select public.hr_tick_enrol(200) as r')).r;
  const unenrol = async () => (await one("select public.hr_tick_unenrol('gather') as r")).r;
  const gstate = (r) => (r?.channels || []).find((c) => c.channel === 'gather')?.state;
  const owned = async (u) => (await one(`select owned from public.hr_tick_ownership
                                          where user_id = $1 and slot = 0 and channel = 'gather'`, [u]))?.owned ?? null;
  const journal = (u) => q(`select event, reason, permille, bucket, accrued_to, at
                              from public.hr_tick_enrolment where user_id = $1 order by id`, [u]);
  const ledger = async (us) => Number((await one(
    'select count(*)::int as n from public.player_ledger where user_id = any($1::uuid[])', [us])).n);
  const state = async (us) => JSON.stringify(await q(
    'select to_jsonb(ps) as s from public.player_state ps where user_id = any($1::uuid[]) order by user_id', [us]));
  const stall = async () => (await one('select public.hr_tick_stall_status(now(), 2, 30) as s')).s;
  const lagOf = (s) => (s?.armed || []).find((a) => a.channel === 'gather')?.lag;
  const tickRow = (u, minsAgo) => q(`insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
                                      values ($1, 0, 'gather', 'accrue', '{"src":"tick"}'::jsonb,
                                              now() - make_interval(mins => $2))`, [u, minsAgo]);

  // ── W1 / W2 / W5 ────────────────────────────────────────────────────────
  const A = await char(uidIn(true));
  const O = await char(uidIn(false));
  const S = await char(uidIn(true), { ago: 20 });
  const C = await char(uidIn(true), { kind: 'combat' });
  const X = await char(uidIn(true));
  await own(X, false);
  const P = await char(uidIn(true));
  {
    const pid = (await one('insert into public.party (leader_user, leader_slot) values ($1, 0) returning id', [P])).id;
    await q(`insert into public.party_member (party_id, user_id, slot, role, joined_at) values ($1, $2, 0, 'leader', now())`, [pid, P]);
    await q('insert into public.party_hunt (party_id, active_id, accrued_to) values ($1, $2, now())', [pid, cact]);
  }
  const fixtures = [A, O, S, C, X, P];
  const l0 = await ledger(fixtures); const s0 = await state(fixtures);
  let r1; try { r1 = await enrol(); } catch (e) { r1 = { threw: e.message }; }
  const jA = await journal(A);
  const accA = (await one('select accrued_to from public.player_state where user_id = $1', [A])).accrued_to;
  ok('W1', r1.ok === true && gstate(r1) === 'open' && (await owned(A)) === true
    && jA.length === 1 && jA[0].event === 'enrol' && jA[0].reason === 'cohort' && jA[0].permille === PERMILLE
    && jA[0].bucket === bucketOf(A) && new Date(jA[0].accrued_to).getTime() === new Date(accA).getTime()
    && (await ledger(fixtures)) === l0 && (await state(fixtures)) === s0,
    'a fresh in-bucket gatherer is enrolled and journalled (bucket, permille, accrued_to); nothing paid',
    JSON.stringify({ r1, jA, ledger: (await ledger(fixtures)) - l0 }));
  const outs = { O: await owned(O), S: await owned(S), C: await owned(C), X: await owned(X), P: await owned(P) };
  const jOut = (await Promise.all([O, S, C, X, P].map(journal))).flat().length;
  ok('W2', outs.O === null && outs.S === null && outs.C === null && outs.P === null && outs.X === false && jOut === 0,
    'not enrolled: out of bucket, stale (20 min), combat, partied; the operator owned = false row is not flipped',
    JSON.stringify({ outs, jOut }));
  {
    const j0 = Number((await one('select count(*)::int as n from public.hr_tick_enrolment')).n);
    let r; try { r = await enrol(); } catch (e) { r = { threw: e.message }; }
    ok('W5', r.ok === true && r.enrolled === 0
      && Number((await one('select count(*)::int as n from public.hr_tick_enrolment')).n) === j0,
      'a second run enrols and journals nothing', JSON.stringify(r));
  }

  // ── W3 the fuse ─────────────────────────────────────────────────────────
  {
    // Two fresh candidates at the same instant: the tie breaks on user_id.
    const [B1, B2] = [uidIn(true), uidIn(true)].sort();
    await char(B1); await char(B2);
    await q(`update public.player_state set accrued_to = now() where user_id = any($1::uuid[])`, [[B1, B2]]);
    const have = Number((await one("select count(*)::int as n from public.hr_tick_ownership where channel = 'gather' and owned")).n);
    await coh(`max_owned = ${Math.min(100, have + 1)}`);
    let r; try { r = await enrol(); } catch (e) { r = { threw: e.message }; }
    let r2; try { r2 = await enrol(); } catch (e) { r2 = { threw: e.message }; }
    const after = Number((await one("select count(*)::int as n from public.hr_tick_ownership where channel = 'gather' and owned")).n);
    ok('W3', r.enrolled === 1 && (await owned(B1)) === true && (await owned(B2)) === null
      && gstate(r2) === 'full' && after === have + 1,
      'room for one admits exactly the lowest key of two equally fresh returns; then full',
      JSON.stringify({ r, r2, have, after }));
    await coh('max_owned = 100');
  }

  // ── W4 disarmed / disabled / off ────────────────────────────────────────
  {
    const D = await char(uidIn(true));
    const res = {};
    await cfg("armed_channels = '{}'");
    try { res.disarmed = gstate(await enrol()); } catch (e) { res.disarmed = e.message; }
    await cfg("armed_channels = array['gather'], enabled = false");
    try { res.disabled = (await enrol()).outcome; } catch (e) { res.disabled = e.message; }
    await cfg('enabled = true');
    await coh('permille = 0');
    try { res.off = gstate(await enrol()); } catch (e) { res.off = e.message; }
    await coh(`permille = ${PERMILLE}`);
    res.owned = await owned(D);
    ok('W4', res.disarmed === 'disarmed' && res.disabled === 'disabled' && res.off === 'off' && res.owned === null,
      'disarmed, disabled and permille 0 each enrol nothing', JSON.stringify(res));
    // D would be taken by the next enrol; park it off gather for the rest of the run.
    await q("update public.player_state set active_kind = 'combat', active_id = $2 where user_id = $1", [D, cact]);
  }

  // ── W6 / W8 the lag judge, and the residual it closes ───────────────────
  {
    const Y = await char(uidIn(true), { ago: 30 });        // stuck: 30 min, never paid
    const Z = await char(uidIn(true), { ago: 30 });        // moving: 30 min, paid 1 min ago
    // Parked (presence horizon): 30 min behind, unpaid, but refused
    // past_horizon for its current absence — waiting, not stuck.
    const K = await char(uidIn(true), { ago: 30 });
    await own(Y); await own(Z); await own(K);
    await tickRow(Z, 1);
    await q(`insert into public.hr_tick_horizon_log (user_id, slot, anchor_at, channel, horizon_at, cap_ms, mark)
             select a.user_id, a.slot, a.real_return_at, 'gather', a.real_return_at + interval '12 hours', 43200000,
                    a.real_return_at
               from public.hr_return_anchor a where a.user_id = $1 and a.slot = 0`, [K]);
    // Three healthy armed gatherers: fresh, and 35 tick windows in each of the
    // last two hours between them (the aggregate floor is 30/h).
    const H = [await char(uidIn(true), { ago: 0, since: 240 }), await char(uidIn(true), { ago: 0, since: 240 }),
      await char(uidIn(true), { ago: 0, since: 240 })];
    for (const h of H) await own(h);
    for (let i = 0; i < 70; i++) await tickRow(H[i % 3], 2 + Math.floor(i * 116 / 70));
    await q(`insert into public.hr_tick_cron_log (at, outcome, rostered, ms)
             values (now() - interval '30 minutes', 'posted', 5, 50), (now() - interval '90 minutes', 'posted', 5, 50)`);
    let s; try { s = await stall(); } catch (e) { s = { threw: e.message }; }
    const lag = lagOf(s) || {};
    const named = (u) => (lag.stuck_sample || []).some((x) => x.user_id === u);
    ok('W6', lag.threshold_s === 900 && named(Y) && !named(Z) && !named(K) && lag.parked >= 1 && !named(A) && !H.some(named)
      && lag.stuck >= 1 && Number(lag.worst_s) >= 1800 && lag.judged === true && lag.stalled === true,
      'Y (30 min, unpaid) is STUCK and named; Z (30 min, paid a minute ago) is MOVING; fresh ones are not stuck',
      JSON.stringify(lag));
    const keys = ['ok', 'stalled', 'judged', 'shadow_stalled', 'armed_judged', 'armed_stalled', 'armed', 'mode',
      'armed_channels', 'watched_channels', 'sentinel', 'hours', 'min_rows_per_hour', 'at', 'buckets'];
    const g = (s?.armed || []).find((a) => a.channel === 'gather') || {};
    ok('W8', s.armed_judged === true && s.armed_stalled === false && g.stalled === false
      && s.lag_judged === true && s.lag_stalled === true && named(Y)
      && keys.every((k) => k in s) && ['channel', 'ledger_kind', 'sentinel', 'judged', 'stalled', 'buckets'].every((k) => k in g),
      'the aggregate armed judge reads judged + NOT stalled (healthy gatherers keep the floor) while lag_stalled names '
      + 'the one stuck gatherer; every pre-existing key keeps its meaning',
      JSON.stringify({ armed_judged: s.armed_judged, armed_stalled: s.armed_stalled, lag_stalled: s.lag_stalled,
        buckets: g.buckets }));
    // Y, Z and the healthy three are operator-owned; leave them for W7.
    arms.operator = [X, Y, Z, K, ...H];

    // W12: vitals' restatement (runbook V6) reads the same stuck set as the DB.
    let v; try { v = await one(arms.lagSql || VITALS_LAG); } catch (e) { v = { threw: e.message }; }
    const dbStuck = Number(lag.stuck); const dbJudged = Number(lag.characters);
    ok('W12', v && v.channel === 'gather' && Number(v.stuck) === dbStuck && Number(v.judged) === dbJudged && dbStuck >= 1,
      `tools/vitals.mjs ARMED_LAG agrees with hr_tick_stall_status: ${dbStuck} stuck of ${dbJudged}`,
      JSON.stringify({ vitals: v, db: { stuck: lag.stuck, characters: lag.characters } }));
  }

  // ── W7 unenrol ──────────────────────────────────────────────────────────
  {
    const enrolled = (await q(`select distinct user_id from public.hr_tick_enrolment
                                where event = 'enrol' and user_id::text like $1`,
      [`00000000-0000-4000-8000-${RUN.toString(16).padStart(4, '0')}%`])).map((x) => x.user_id);
    let r; try { r = await unenrol(); } catch (e) { r = { threw: e.message }; }
    const left = Number((await one("select count(*)::int as n from public.hr_tick_ownership where user_id = any($1::uuid[])",
      [enrolled])).n);
    const opRows = Number((await one("select count(*)::int as n from public.hr_tick_ownership where user_id = any($1::uuid[]) and channel = 'gather'",
      [arms.operator])).n);
    const unj = Number((await one(`select count(*)::int as n from public.hr_tick_enrolment
                                   where user_id = any($1::uuid[]) and event = 'unenrol' and reason = 'rollback'`, [enrolled])).n);
    const permille = (await one("select permille from public.hr_tick_cohort where channel = 'gather'")).permille;
    const F = await char(uidIn(true));
    let r2; try { r2 = await enrol(); } catch (e) { r2 = { threw: e.message }; }
    let r3; try { r3 = await unenrol(); } catch (e) { r3 = { threw: e.message }; }
    ok('W7', r.ok === true && enrolled.length >= 2 && r.unenrolled === enrolled.length && left === 0
      && unj === enrolled.length && opRows === arms.operator.length && permille === 0
      && gstate(r2) === 'off' && (await owned(F)) === null && r3.unenrolled === 0,
      'unenrol removes exactly the journal-enrolled rows (journalled), keeps the operator rows, zeroes the dial; '
      + 'nothing re-enrols; a second unenrol removes nothing',
      JSON.stringify({ r, enrolled: enrolled.length, left, unj, opRows, permille, r2: gstate(r2), r3 }));
    await coh(`permille = ${PERMILLE}`);
    await q("update public.player_state set active_kind = 'combat', active_id = $2 where user_id = $1", [F, cact]);
  }

  // ── W9 nobody but the owner ─────────────────────────────────────────────
  {
    const fns = ['public.hr_tick_cohort_bucket(uuid)', 'public.hr_tick_enrol(int)', 'public.hr_tick_unenrol(text)',
      'public.hr_tick_stall_status(timestamptz,int,int)'];
    const grants = [];
    for (const f of fns) {
      for (const g of await q(`select r.role, has_function_privilege(r.role, $1, 'execute') as x
                                 from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) r(role)
                                where r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role)`, [f])) {
        if (g.x) grants.push(`${g.role}:${f}`);
      }
    }
    const tbl = (await q(`select r.rolname || ':' || t.rel as k from (values ('public.hr_tick_cohort'), ('public.hr_tick_enrolment')) t(rel)
                           cross join pg_roles r
                          where r.rolname in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick')
                            and has_table_privilege(r.rolname, t.rel, 'select,insert,update,delete,truncate')`)).map((x) => x.k);
    const refused = [];
    for (const role of ['hr_engine', 'hr_tick']) {
      for (const call of ['select public.hr_tick_enrol(1)', "select public.hr_tick_unenrol('gather')"]) {
        await db.exec(`begin; set local role ${role};`);
        try { await q(call); } catch (e) { if (/permission denied|not callable/.test(e.message)) refused.push(`${role}:${call}`); }
        try { await db.exec('rollback;'); } catch { /* already */ }
      }
    }
    ok('W9', grants.length === 0 && tbl.length === 0 && refused.length === 4,
      'no role holds EXECUTE on the functions or any privilege on the tables; hr_engine and hr_tick are refused',
      JSON.stringify({ grants, tbl, refused }));
  }

  // ── W10 the schedule ────────────────────────────────────────────────────
  {
    const job = await one("select schedule, command from cron.job where jobname = 'hr-tick-enrol'");
    ok('W10', job?.schedule === '* * * * *' && job?.command === 'select public.hr_tick_enrol(200)',
      'hr-tick-enrol runs every minute', JSON.stringify(job));
  }

  // ── W11 the staged kill file ────────────────────────────────────────────
  {
    const K = await char(uidIn(true));
    let r; try { r = await enrol(); } catch (e) { r = { threw: e.message }; }
    const before = await owned(K);
    let err = null;
    try { await db.exec(KILL_SQL); } catch (e) { err = String(e.message).split('\n')[0]; }
    ok('W11', before === true && err === null && (await owned(K)) === null
      && (await one("select permille from public.hr_tick_cohort where channel = 'gather'")).permille === 0
      && Number((await one("select count(*)::int as n from public.hr_tick_ownership where user_id = any($1::uuid[])",
        [arms.operator])).n) === arms.operator.length,
      `${KILL} unenrols the cohort, keeps the operator rows and passes its own read-back`,
      JSON.stringify({ r, before, err }));
    await q("update public.player_state set active_kind = 'combat', active_id = $2 where user_id = $1", [K, cact]);
  }

  await cfg("armed_channels = '{}'");
  await coh(`permille = ${PERMILLE}, max_owned = 100`);
  return red;
}

const bodies = async (db) => (await db.query(
  `select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as h from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('hr_tick_stall_status', 'hr_tick_enrol', 'hr_tick_unenrol', 'hr_tick_cohort_bucket')
    order by 1`)).rows.map((r) => r.h).join(',');

async function boot() {
  const { db } = await bootReplay({ upTo: MIG });
  return db;
}

if (!MUTATE) {
  console.log('\nworld-tick-gather-widen: armed gather widens by server enrolment; one stalled gatherer is named');
  let db;
  try { db = await boot(); } catch (e) {
    console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
  }
  const inv0 = JSON.stringify(await inventory(db));
  const b0 = await bodies(db);
  const coh0 = JSON.stringify((await db.query('select channel, permille, max_owned, fresh_s from public.hr_tick_cohort')).rows);
  let err = null;
  try { await db.exec(MIG_SQL); } catch (e) { err = String(e.message).split('\n')[0]; }
  const idem = !err && JSON.stringify(await inventory(db)) === inv0 && (await bodies(db)) === b0
    && b0.split(',').length === 4
    && JSON.stringify((await db.query('select channel, permille, max_owned, fresh_s from public.hr_tick_cohort')).rows) === coh0
    && coh0 === JSON.stringify([{ channel: 'gather', permille: 100, max_owned: 20, fresh_s: 600 }]);
  console.log(idem
    ? `  ✓ P-IDEM — ${MIG} re-applied byte-identically (§0 accepted, §8 passed twice); stage-1 dial gather 100 ‰ / 20 / 600 s`
    : `  ✗ P-IDEM — ${err || `the re-apply moved the schema, a body or the dial (${coh0})`}`);
  let red;
  try { red = await arms(db); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  if (!idem) red.push('P-IDEM');
  console.log(red.length ? `\nRED: ${red.join(', ')}`
    : '\nGREEN: returning gatherers in the cohort are enrolled by the server, nothing paid; the fuse, the arm and the dial bound it; one stuck gatherer is named; the kill restores the operator cohort');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate: one function re-created from THIS file's text with one line
//    broken (the file's own §8 md5 lock would refuse a patched FILE before any
//    behaviour ran, which proves the lock, not the arms).
const SRC = {
  enrol: fnSource(MIG_SQL, 'hr_tick_enrol'),
  unenrol: fnSource(MIG_SQL, 'hr_tick_unenrol'),
  stall: fnSource(MIG_SQL, 'hr_tick_stall_status'),
  vitals: VITALS_LAG,
};
const RESTORE = `${SRC.enrol}\n${SRC.unenrol}\n${SRC.stall}\n`
  + 'revoke execute on function public.hr_tick_enrol(int) from public;\n'
  + 'revoke execute on function public.hr_tick_enrol(int) from anon, authenticated, service_role, hr_engine, hr_tick;\n'
  + 'revoke execute on function public.hr_tick_unenrol(text) from public;\n'
  + 'revoke execute on function public.hr_tick_unenrol(text) from anon, authenticated, service_role, hr_engine, hr_tick;\n'
  + 'revoke execute on function public.hr_tick_stall_status(timestamptz, int, int) from public;\n'
  + 'revoke execute on function public.hr_tick_stall_status(timestamptz, int, int) from anon, authenticated, service_role, hr_engine, hr_tick;';
const MUTANTS = [
  { name: 'ignoresBucket', fn: 'enrol', why: 'out-of-bucket characters are enrolled', expect: /W2/,
    find: '             and public.hr_tick_cohort_bucket(ps.user_id) < v_c.permille\n', repl: '' },
  { name: 'ignoresFresh', fn: 'enrol', why: 'a stale return is enrolled (no per-character fresh watermark)', expect: /W2/,
    find: '             and ps.accrued_to >  now() - make_interval(secs => v_c.fresh_s)\n', repl: '' },
  { name: 'enrolsPartied', fn: 'enrol', why: 'a partied character is enrolled (invariant 7)', expect: /W2/,
    find: '             and not public.hr_partied(ps.user_id, ps.slot)\n', repl: '' },
  { name: 'flipsOperatorRow', fn: 'enrol', why: "an operator's owned = false exclusion is flipped", expect: /W2/,
    find: `             and not exists (select 1 from public.hr_tick_ownership o
                              where o.user_id = ps.user_id and o.slot = ps.slot
                                and o.channel = v_c.channel)\n`,
    repl: `             and not exists (select 1 from public.hr_tick_ownership o
                              where o.user_id = ps.user_id and o.slot = ps.slot
                                and o.channel = v_c.channel and o.owned)\n`,
    and: ['          on conflict (user_id, slot, channel) do nothing\n',
      '          on conflict (user_id, slot, channel) do update set owned = true\n'] },
  { name: 'enrolsAnyKind', fn: 'enrol', why: 'a character not on the channel is enrolled', expect: /W2/,
    find: '           where ps.active_kind = v_c.channel\n', repl: '           where true\n' },
  { name: 'noFuse', fn: 'enrol', why: 'max_owned is ignored', expect: /W3/,
    find: '      v_room := least(v_c.max_owned - v_have, v_limit);', repl: '      v_room := v_limit;' },
  { name: 'enrolsShadow', fn: 'enrol', why: 'a DISARMED channel keeps enrolling', expect: /W4/,
    find: "    elsif not (v_c.channel = any (coalesce(v_cfg.armed_channels, '{}'::text[])))\n          or not",
    repl: '    elsif not' },
  { name: 'enrolsWhileDisabled', fn: 'enrol', why: 'a disabled tick still enrols', expect: /W4/,
    find: '  if not found or not coalesce(v_cfg.enabled, false) then', repl: '  if not found then' },
  { name: 'noJournal', fn: 'enrol', why: 'the enrolment is not journalled (and so cannot be rolled back)', expect: /W1/,
    find: '          from cand c join ins i on i.user_id = c.user_id and i.slot = c.slot;',
    repl: '          from cand c join ins i on i.user_id = c.user_id and i.slot = c.slot where false;' },
  { name: 'enrolPays', fn: 'enrol', why: 'enrolment moves a player_state field', expect: /W1/,
    find: '        get diagnostics v_n = row_count;\n',
    repl: "        get diagnostics v_n = row_count;\n        update public.player_state set gold = gold + 1 where active_kind = v_c.channel;\n" },
  { name: 'unenrolsOperator', fn: 'unenrol', why: 'unenrol deletes operator rows too', expect: /W7|W11/,
    find: `       and (select e.event from public.hr_tick_enrolment e
             where e.user_id = o.user_id and e.slot = o.slot and e.channel = o.channel
             order by e.id desc limit 1) = 'enrol'\n`, repl: '' },
  { name: 'unenrolKeepsDial', fn: 'unenrol', why: 'unenrol leaves permille up, so the cron re-enrols behind it', expect: /W7|W11/,
    find: '  update public.hr_tick_cohort set permille = 0, updated_at = now()\n   where channel = p_channel;\n', repl: '' },
  { name: 'lagIgnoresMoving', fn: 'stall', why: 'a catching-up (moving) gatherer reads as stuck', expect: /W6/,
    find: "             'stuck',       count(*) filter (where j.lag_s > extract(epoch from c_lag) and not j.moving and not j.parked),",
    repl: "             'stuck',       count(*) filter (where j.lag_s > extract(epoch from c_lag) and not j.parked),",
    and: ['               where j2.lag_s > extract(epoch from c_lag) and not j2.moving and not j2.parked\n',
      '               where j2.lag_s > extract(epoch from c_lag) and not j2.parked\n'] },
  { name: 'lagParkedIsStuck', fn: 'stall', why: 'a PARKED gatherer (paid to its horizon, waiting) reads as stuck', expect: /W6/,
    find: "             'stuck',       count(*) filter (where j.lag_s > extract(epoch from c_lag) and not j.moving and not j.parked),",
    repl: "             'stuck',       count(*) filter (where j.lag_s > extract(epoch from c_lag) and not j.moving),",
    and: ['               where j2.lag_s > extract(epoch from c_lag) and not j2.moving and not j2.parked\n',
      '               where j2.lag_s > extract(epoch from c_lag) and not j2.moving\n'] },
  { name: 'lagThresholdHour', fn: 'stall', why: 'the lag threshold is an hour (a 30-minute stall is invisible)', expect: /W6|W8/,
    find: "  c_lag      constant interval := interval '15 minutes';", repl: "  c_lag      constant interval := interval '60 minutes';" },
  { name: 'lagFoldedIntoArmedStalled', fn: 'stall', why: 'the lag verdict is folded into armed_stalled (the arm file reads it)', expect: /W8/,
    find: '    v_any_as := v_any_as or v_astall;\n', repl: '    v_any_as := v_any_as or v_astall or v_ls;\n' },
  { name: 'lagNotReported', fn: 'stall', why: 'lag_stalled never turns true', expect: /W6|W8/,
    find: "    v_ls := v_lj and (v_lag->>'stuck')::int > 0;", repl: '    v_ls := false;' },
  { name: 'vitalsLagHour', fn: 'vitals', why: 'vitals restates the lag rule at 60 min (the person reads OK while the DB reads STUCK)', expect: /W12/,
    find: "         where ps.accrued_to < now() - interval '15 minutes'\n", repl: "         where ps.accrued_to < now() - interval '60 minutes'\n" },
  { name: 'vitalsLagIgnoresMoving', fn: 'vitals', why: 'vitals calls a catching-up character stuck', expect: /W12/,
    find: "                              and pl.meta ->> 'src' = 'tick')\n           -- PARKED", repl: "                              and false)\n           -- PARKED" },
  { name: 'vitalsParkedIsStuck', fn: 'vitals', why: 'vitals calls a parked gatherer stuck', expect: /W12/,
    find: '                            where h.user_id = o.user_id and h.slot = o.slot)) as stuck,',
    repl: '                            where false)) as stuck,' },
  { name: 'grantEngine', fn: 'enrol', why: 'hr_engine is granted EXECUTE on enrol', expect: /W9/,
    find: null, repl: '\ngrant execute on function public.hr_tick_enrol(int) to hr_engine;' },
];

console.log('\nworld-tick-gather-widen --mutate: every mutant must go RED on its named arm');
let db;
try { db = await boot(); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const control = await arms(db, { log: false });
if (control.length) { console.error(`harness: the unmutated control is red (${control.join(', ')})`); process.exit(2); }
// tests/mutant-control.mjs protocol: under HR_MUTANT_CONTROL=1 NOTHING is
// planted, and every arm must then read `survived` — an arm "caught" with no
// mutant is caught by something other than its mutant.
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
console.log(`[mutants] ${MUTANTS.length}`);
let survived = 0;
for (const m of MUTANTS) {
  const base = SRC[m.fn];
  let src;
  if (m.find === null) src = base + m.repl;
  else {
    if (base.split(m.find).length !== 2) { console.error(`harness: ${m.name}: anchor matched ${base.split(m.find).length - 1}x`); process.exit(2); }
    src = base.replace(m.find, () => m.repl);
    if (m.and) {
      if (src.split(m.and[0]).length !== 2) { console.error(`harness: ${m.name}: second anchor matched ${src.split(m.and[0]).length - 1}x`); process.exit(2); }
      src = src.replace(m.and[0], () => m.and[1]);
    }
  }
  if (m.fn === 'vitals') { if (!CONTROL) arms.lagSql = src; }
  else if (!CONTROL) {
    try { await db.exec(src); } catch (e) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
  }
  let red;
  try { red = await arms(db, { log: false }); } catch (e) { red = [`threw: ${e.message}`]; }
  try { await db.exec('rollback;'); } catch { /* not inside a transaction */ }
  arms.lagSql = null;
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
  // Nothing was planted: every arm must have survived.
  console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${MUTANTS.length - survived} arm(s) read caught`);
  process.exit(survived === MUTANTS.length ? 0 : 1);
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
