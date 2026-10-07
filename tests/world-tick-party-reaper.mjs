// ============================================================================
// tests/world-tick-party-reaper.mjs — A PARTY HUNT NOBODY CAN TICK IS ENDED
//
//   node tests/world-tick-party-reaper.mjs            the guard
//   node tests/world-tick-party-reaper.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-08-world-tick-party-reaper.sql, answering
// Security PD1 on party-drop (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md):
// a hunt whose mark is >= 24 h behind is never rostered, so its members stay
// partied and every accrue is refused party_settle_required. The file's §5
// executes the scenario once at apply time; this guard re-measures it on every
// push on the PGlite chain replay — the reaper as the OWNER (how pg_cron runs
// it), the roster as hr_tick, the settle and the solo apply as hr_engine — and
// proves each arm can fail.
//
//   P-IDEM  the file re-applies byte-identically
//   R1  ★ PD1 reproduced (ARMED, 30 h: not rostered, hunters partied), then the
//           reaper ENDS it (stale_hunt), journals one stop row per hunter with
//           the stale mark and own cap; nothing paid, no player_state moved
//   R2  ★ the members accrue SOLO afterwards; the party path answers
//           no_party_hunt for the fenced span
//   R3  ★ hunts inside 24 h (1 h, and 24 h - 60 s: the roster's side of the
//           partition) are untouched and still rostered
//   R4  ★ the partition's other side: 24 h + 60 s is reaped
//   R5  ★ DISARMED: a 30 h-stale hunt in shadow is ended too
//   R6  a member already sat out of the hunt is not named by the stop
//   R7  idempotent: a second run reaps and writes nothing
//   R8  no role holds EXECUTE; hr_engine and hr_tick are refused (42501)
//   R9  the cron job is scheduled every 10 minutes with its command
//
// Not provable on one PGlite connection, argued in the file instead: SKIP
// LOCKED never waits on a settle or a verb in flight.
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const MIG = '2026-10-08-world-tick-party-reaper.sql';
const MIG_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');

/** The `create or replace function public.<name>(` statement, verbatim, through its closing `$$;`. */
function fnSource(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const as = sql.indexOf('\nas $$', start);
  const end = sql.indexOf('$$;', as + 6);
  if (start < 0 || as < 0 || end < 0) throw Object.assign(new Error(`${name} not found`), { harness: true });
  return sql.slice(start, end + 3);
}

const H = 3600000;
const ZERO = '00000000-0000-0000-0000-000000000000';
let RUN = 0;
const uid = (n) => `00000000-0000-4000-8000-${RUN.toString(16).padStart(4, '0')}0000${n.toString(16).padStart(4, '0')}`;
const HOLDER = 'guard:party-reaper';

async function arms(db, { log = true } = {}) {
  RUN += 1;
  const red = [];
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) { if (log) console.log(`  ✓ ${id} — ${okMsg}`); } else { red.push(id); if (log) console.log(`  ✗ ${id} — ${badMsg}`); }
  };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const cfg = (set) => db.exec(`update public.hr_tick_config set ${set} where id;`);
  const cact = (await one("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1"))?.activity_id;
  if (!cact) throw Object.assign(new Error('no combat activity in hr_activities'), { harness: true });
  const dbNow = async () => new Date((await one("select date_trunc('second', now()) as t")).t).getTime();
  const iso = (ms) => new Date(ms).toISOString();

  let seq = 0;
  /** A party of `n` hunters, every mark (party + members) at `markMs`. */
  const party = async (n, markMs) => {
    const users = Array.from({ length: n }, () => uid(++seq));
    for (const u of users) {
      await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
      await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                                active_kind, active_id, active_since, consec_falls, recovering_until)
               values ($1, 0, 500, 0, 7, 10, 1, $2, 'combat', $3, '2000-01-01 00:00:00+00', 2, '2001-01-01 00:00:00+00')`,
        [u, iso(markMs), cact]);
    }
    const pid = (await one('insert into public.party (leader_user, leader_slot) values ($1, 0) returning id', [users[0]])).id;
    for (let i = 0; i < n; i++) {
      await q(`insert into public.party_member (party_id, user_id, slot, role, joined_at)
               values ($1, $2, 0, $3, now() - make_interval(hours => $4))`,
        [pid, users[i], i === 0 ? 'leader' : 'member', 40 - i]);
    }
    const hunt = (await one('insert into public.party_hunt (party_id, active_id, accrued_to) values ($1, $2, $3) returning id',
      [pid, cact, iso(markMs)])).id;
    return { pid, hunt, users };
  };
  /** The reaper, as the OWNER (pg_cron's context). */
  const reap = async () => (await one('select public.hr_party_reap_stale(200) as r')).r;
  const reaped = (r, P) => (r?.hunts || []).find((h) => h.hunt === P.hunt);
  const hunt = (P) => one('select ended_at, stopped_by, accrued_to from public.party_hunt where id = $1', [P.hunt]);
  const stops = (P) => q(`select user_id, reason, mark, member_mark, cap_ms, hunters, at, day_key
                            from public.party_hunt_roster_log where hunt_id = $1 and event = 'stop' order by user_id`, [P.hunt]);
  const partied = async (u) => (await one('select public.hr_partied($1::uuid, 0) as p', [u])).p;
  const anyRows = async (users) => Number((await one(
    'select count(*)::int as n from public.player_ledger where user_id = any($1::uuid[])', [users])).n);
  const stateOf = async (users) => JSON.stringify(await q(
    'select to_jsonb(ps) as s from public.player_state ps where user_id = any($1::uuid[]) order by user_id', [users]));
  const rostered = async (P) => {
    await db.exec('begin; set local role hr_tick;');
    try {
      return (await q(`select x.party_id from public.hr_party_roster(array['combat'], 200, $1, 30000, null, null) x
                        where x.party_id = $2`, [HOLDER, P.pid])).length === 1;
    } finally { await db.exec('commit;'); }
  };
  const asEngine = async (sql, p) => {
    await db.exec('begin; set local role hr_engine;');
    try { return (await one(sql, p)).r; } finally { await db.exec('commit;'); }
  };

  await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['combat']");
  let now = await dbNow();

  // ── R1 / R6 ARMED, 30 h stale; RS sat out of it ─────────────────────────
  const M = now - 30 * H;
  const P = await party(3, M);
  const [RA, RB, RS] = P.users;
  await q('update public.player_state set accrued_to = now() - interval \'1 hour\' where user_id = $1', [RS]);
  await q(`insert into public.party_hunt_roster_log (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, cap_ms, hunters)
           values (public.hr_utc_day_key(now()), $1, $2, $3, 0, 'drop', 'fenced_cap', $4, 0, 2)`, [P.pid, P.hunt, RS, iso(M)]);
  const fresh = await party(2, now - 1 * H);
  const edgeIn = await party(2, now - 24 * H + 60000);
  const edgeOut = await party(2, now - 24 * H - 60000);
  const all = [...P.users, ...fresh.users, ...edgeIn.users, ...edgeOut.users];

  const pd1 = !(await rostered(P)) && (await partied(RA)) && (await partied(RB));
  const s0 = await stateOf(all); const l0 = await anyRows(all);
  const pver = Number((await one('select version from public.party where id = $1', [P.pid])).version);
  let r1;
  try { r1 = await reap(); } catch (e) { r1 = { threw: e.message }; }
  const h1 = await hunt(P);
  const j1 = await stops(P);
  const caps = Object.fromEntries(await Promise.all([RA, RB].map(async (u) =>
    [u, Number((await one('select public.hr_offline_cap_ms($1::uuid, 0) as c', [u])).c)])));
  ok('R1', pd1 && r1.ok === true && reaped(r1, P)?.members === 2
    && h1.ended_at !== null && h1.stopped_by === 'stale_hunt' && new Date(h1.accrued_to).getTime() === M
    && Number((await one('select version from public.party where id = $1', [P.pid])).version) === pver + 1
    && j1.length === 2 && j1.every((x) => [RA, RB].includes(x.user_id) && x.reason === 'stale_hunt'
      && new Date(x.mark).getTime() === M && x.member_mark === null && x.hunters === 0 && Number(x.cap_ms) === caps[x.user_id])
    && !(await partied(RA)) && !(await partied(RB))
    && (await anyRows(all)) === l0 && (await stateOf(all)) === s0,
    'PD1 reproduced (not rostered, partied) then ENDED: stale_hunt, one stop row per hunter (stale mark, own cap), '
    + 'unpartied; no ledger row, no player_state field moved',
    JSON.stringify({ pd1, r1, h1, j1: j1.length, ledger: (await anyRows(all)) - l0, state: (await stateOf(all)) === s0 }));
  ok('R6', !j1.some((x) => x.user_id === RS), 'the member already sat out is not named by the stop',
    JSON.stringify(j1.map((x) => x.user_id)));

  // ── R2 solo accrue; the party path is closed ─────────────────────────────
  {
    const at = iso(await dbNow());
    const ps = await asEngine(`select public.hr_party_tick_settle($1, $2::uuid, $3::timestamptz, $4::timestamptz,
                                 $5::uuid, $6::text::jsonb) as r`,
      [HOLDER, P.pid, iso(M), iso(M + 90000), ZERO,
        JSON.stringify([RA, RB].map((u) => ({ user: u, slot: 0, version: 1, delta: { accrued_to: iso(M + 90000) } })))]);
    const solo = await asEngine('select public.hr_apply($1::uuid, 0, 1, gen_random_uuid(), $2::text::jsonb) as r',
      [RA, JSON.stringify({ gold: 11, accrued_to: at, journal: { kind: 'combat', intent: 'accrue', meta: { ticks: 1 } } })]);
    const soloRows = Number((await one(`select count(*)::int as n from public.player_ledger
                                         where user_id = $1 and kind = 'combat' and intent = 'accrue' and not (meta ? 'party')`, [RA])).n);
    ok('R2', ps?.error === 'no_party_hunt' && solo?.ok === true && soloRows === 1,
      'RA accrues SOLO after the reap; the party path answers no_party_hunt for the fenced span',
      JSON.stringify({ party: ps, solo }));
  }

  // ── R3 / R4 the partition ───────────────────────────────────────────────
  {
    const hf = await hunt(fresh); const he = await hunt(edgeIn); const ho = await hunt(edgeOut);
    ok('R3', hf.ended_at === null && he.ended_at === null && !reaped(r1, fresh) && !reaped(r1, edgeIn)
      && (await stops(fresh)).length === 0 && (await stops(edgeIn)).length === 0
      && (await partied(fresh.users[0])) && (await partied(edgeIn.users[0])) && (await rostered(fresh)) && (await rostered(edgeIn)),
      'hunts 1 h and 24 h - 60 s behind are untouched, still partied and still rostered',
      JSON.stringify({ hf, he }));
    ok('R4', ho.stopped_by === 'stale_hunt' && reaped(r1, edgeOut)?.members === 2 && !(await partied(edgeOut.users[0])),
      '24 h + 60 s behind is reaped: every live hunt is either rostered or reaped', JSON.stringify(ho));
  }

  // ── R5 DISARMED ─────────────────────────────────────────────────────────
  {
    now = await dbNow();
    const D = await party(2, now - 30 * H);
    await cfg("armed_channels = '{}'");
    const was = await partied(D.users[0]);
    let r; try { r = await reap(); } catch (e) { r = { threw: e.message }; }
    await cfg("armed_channels = array['combat']");
    const hd = await hunt(D);
    ok('R5', was && hd.stopped_by === 'stale_hunt' && reaped(r, D)?.members === 2 && (await stops(D)).length === 2
      && !(await partied(D.users[0])) && !(await partied(D.users[1])),
      'combat DISARMED: a 30 h-stale hunt is ended too (disarming no longer leaves it stuck)', JSON.stringify({ r, hd }));
  }

  // ── R7 idempotent ───────────────────────────────────────────────────────
  {
    const j0 = Number((await one('select count(*)::int as n from public.party_hunt_roster_log')).n);
    let r; try { r = await reap(); } catch (e) { r = { threw: e.message }; }
    ok('R7', r.ok === true && r.reaped === 0
      && Number((await one('select count(*)::int as n from public.party_hunt_roster_log')).n) === j0,
      'a second run reaps nothing and writes nothing', JSON.stringify(r));
  }

  // ── R8 nobody but the owner ─────────────────────────────────────────────
  {
    const grants = (await q(`select r.role, has_function_privilege(r.role, 'public.hr_party_reap_stale(int)', 'execute') as x
                               from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) r(role)
                              where r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role)`))
      .filter((g) => g.x).map((g) => g.role);
    const refused = [];
    for (const role of ['hr_engine', 'hr_tick']) {
      await db.exec(`begin; set local role ${role};`);
      try { await q('select public.hr_party_reap_stale(1)'); } catch (e) { if (/permission denied|not callable/.test(e.message)) refused.push(role); }
      try { await db.exec('rollback;'); } catch { /* already */ }
    }
    ok('R8', grants.length === 0 && refused.length === 2, 'no role holds EXECUTE; hr_engine and hr_tick are refused',
      JSON.stringify({ grants, refused }));
  }

  // ── R9 the schedule ─────────────────────────────────────────────────────
  {
    const job = await one("select schedule, command from cron.job where jobname = 'hr-party-reap'");
    ok('R9', job?.schedule === '*/10 * * * *' && job?.command === 'select public.hr_party_reap_stale(200)',
      'hr-party-reap runs every 10 minutes', JSON.stringify(job));
  }
  await cfg("armed_channels = '{}'");
  return red;
}

const bodies = async (db) => (await db.query(
  `select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as h from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('hr_party_reap_stale', 'hr_party_tick_settle', 'hr_party_roster', 'hr_partied', 'hr_party_sat_out')
    order by 1`)).rows.map((r) => r.h).join(',');

async function boot() {
  const { db } = await bootReplay({ upTo: MIG });
  return db;
}

if (!MUTATE) {
  console.log('\nworld-tick-party-reaper: a party hunt nobody can tick (>= 24 h behind) is ended, in every mode');
  let db;
  try { db = await boot(); } catch (e) {
    console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
  }
  const inv0 = JSON.stringify(await inventory(db));
  const b0 = await bodies(db);
  let err = null;
  try { await db.exec(MIG_SQL); } catch (e) { err = String(e.message).split('\n')[0]; }
  const idem = !err && JSON.stringify(await inventory(db)) === inv0 && (await bodies(db)) === b0
    && b0.split(',').length === 5;
  console.log(idem
    ? `  ✓ P-IDEM — ${MIG} re-applied byte-identically (§0 accepted, §5 passed twice)`
    : `  ✗ P-IDEM — ${err || 'the re-apply moved the schema or a body'}`);
  let red;
  try { red = await arms(db); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  if (!idem) red.push('P-IDEM');
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: a stale party hunt is ended as a server Stop, journalled, nothing paid; fresh hunts untouched');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate: the reaper re-created from THIS file's text with one line broken
//    (the file's own §5 md5 lock would refuse a patched FILE before any
//    behaviour ran, which proves the lock, not the arms).
const REAP = fnSource(MIG_SQL, 'hr_party_reap_stale');
const GRANT_ENGINE = '\ngrant execute on function public.hr_party_reap_stale(int) to hr_engine;';
const MUTANTS = [
  { name: 'neverReaps', why: 'the reaper selects nothing (PD1 stands)', expect: /R1/,
    find: '       and h.accrued_to <= now() - c_max_span\n', repl: '       and false\n' },
  { name: 'spanTooShort', why: 'the threshold is narrower than the roster\'s 24 h (live hunts ended)', expect: /R3/,
    find: "  c_max_span constant interval := interval '24 hours';", repl: "  c_max_span constant interval := interval '1 hour';" },
  { name: 'spanTooLong', why: 'the threshold is wider than the roster\'s 24 h (a gap nobody serves)', expect: /R4/,
    find: "  c_max_span constant interval := interval '24 hours';", repl: "  c_max_span constant interval := interval '25 hours';" },
  { name: 'noJournal', why: 'the stop is not journalled', expect: /R1/,
    find: '     order by pm.user_id, pm.slot;\n    get diagnostics', repl: '       and false\n     order by pm.user_id, pm.slot;\n    get diagnostics' },
  { name: 'journalsSatOut', why: 'a member already sat out is named by the stop', expect: /R6/,
    find: '       and not public.hr_party_sat_out(v_h.id, pm.user_id, pm.slot)\n     order by', repl: '\n     order by' },
  { name: 'noEnd', why: 'the hunt is journalled but never ended (members stay partied)', expect: /R1/,
    find: "       set ended_at = now(), stopped_by = 'stale_hunt', version = version + 1",
    repl: '       set version = version + 1' },
  { name: 'heals', why: 'the stop also touches player_state (a free heal / a moved mark)', expect: /R1/,
    find: '    update public.party set version = version + 1 where id = v_h.party_id;',
    repl: "    update public.party set version = version + 1 where id = v_h.party_id;\n    update public.player_state ps set hp = ps.max_hp, consec_falls = 0, recovering_until = null\n      from public.party_member pm where pm.party_id = v_h.party_id and ps.user_id = pm.user_id and ps.slot = pm.slot;" },
  { name: 'armedOnly', why: 'the reaper only runs while combat is armed (disarming leaves PD1)', expect: /R5/,
    find: '  v_limit := least(greatest(coalesce(p_limit, 200), 1), 1000);\n',
    repl: "  v_limit := least(greatest(coalesce(p_limit, 200), 1), 1000);\n  if (select not coalesce('combat' = any (c.armed_channels), false) from public.hr_tick_config c where c.id) then\n    return jsonb_build_object('ok', true, 'reaped', 0, 'skipped', 0, 'hunts', '[]'::jsonb);\n  end if;\n" },
  { name: 'reReapsEnded', why: 'an ended hunt is reaped again (journal rows per run)', expect: /R7/,
    find: '     where h.ended_at is null\n       and h.accrued_to', repl: '     where true\n       and h.accrued_to',
    and: ['     where id = v_cand.id and ended_at is null\n', '     where id = v_cand.id\n'] },
  { name: 'grantEngine', why: 'hr_engine is granted EXECUTE', expect: /R8/, find: null, repl: GRANT_ENGINE },
];

console.log('\nworld-tick-party-reaper --mutate: every mutant must go RED on its named arm');
let db;
try { db = await boot(); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const control = await arms(db, { log: false });
if (control.length) { console.error(`harness: the unmutated control is red (${control.join(', ')})`); process.exit(2); }
let survived = 0;
for (const m of MUTANTS) {
  let src;
  if (m.find === null) src = REAP + m.repl;
  else {
    if (REAP.split(m.find).length !== 2) { console.error(`harness: ${m.name}: anchor matched ${REAP.split(m.find).length - 1}x`); process.exit(2); }
    src = REAP.replace(m.find, () => m.repl);
    if (m.and) {
      if (src.split(m.and[0]).length !== 2) { console.error(`harness: ${m.name}: second anchor matched ${src.split(m.and[0]).length - 1}x`); process.exit(2); }
      src = src.replace(m.and[0], () => m.and[1]);
    }
  }
  try { await db.exec(src); } catch (e) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
  let red;
  try { red = await arms(db, { log: false }); } catch (e) { red = [`threw: ${e.message}`]; }
  try { await db.exec('rollback;'); } catch { /* not inside a transaction */ }
  await db.exec(`${REAP}\nrevoke execute on function public.hr_party_reap_stale(int) from public;\n`
    + 'revoke execute on function public.hr_party_reap_stale(int) from anon, authenticated, service_role, hr_engine, hr_tick;');
  const hit = red.some((id) => m.expect.test(id));
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${red.join(', ')}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${red.length ? `red only via ${red.join(', ')}` : 'SURVIVED'}`); }
}
const after = await arms(db, { log: false });
if (after.length) { console.error(`harness: the restored body is red (${after.join(', ')})`); process.exit(2); }
await db.close();
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
