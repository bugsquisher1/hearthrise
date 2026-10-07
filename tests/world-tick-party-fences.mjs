// ============================================================================
// tests/world-tick-party-fences.mjs — AN ARMED PARTY NEVER PAYS PAST 24 H OR
//                                     ANY MEMBER'S OFFLINE CAP, AND AN ONLINE
//                                     PLAYER IS NOT A STALL SENTINEL
//
//   node tests/world-tick-party-fences.mjs            the guard
//   node tests/world-tick-party-fences.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-08-world-tick-party-fences.sql, answering the two
// items the Security review of 2026-10-07-world-tick-armed-cap.sql left
// (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md): the M4 blocker
// (hr_party_tick_settle had neither the 24 h fence nor the cap fence on its
// armed branch) and F2b (the armed stall sentinel false-alarms while its player
// is online). The file's §4 executes the same properties once, at apply time;
// this guard re-measures them on every push on the PGlite chain replay, as
// `hr_engine` (the role the edge settles as), adds the differential against
// the 2026-10-07 stall body, and proves each arm can fail.
//
//   P-IDEM  the file re-applies byte-identically (its §0 accepts its own
//           bodies, its §4 passes a second time, inventory and bodies unmoved)
//   P1  ★ armed combat party, marks 25 h old → fenced_24h; zero ledger rows,
//           gold/version/marks unmoved, the hunt not ended
//   P2  ★ marks 13 h old: member A's cap 15 h (clan level 7), member B's 12 h,
//           A listed FIRST → the whole window refused fenced_cap naming B with
//           B's own cap; nothing moved
//   P3  a fresh window, and one 11 h old (inside the smallest cap), pay both
//           members and move the party mark
//   P4  SHADOW untouched: combat unarmed, a 25 h hunt mark on a current shadow
//           chain journals in shadow, zero ledger rows
//   S1  ★ F2b: gather armed, 2 h rostered, zero tick windows, the only gather
//           sentinel settled ONLINE (client accrue rows) → no armed verdict
//   S2  ★ plus an OFFLINE gatherer with 10 tick rows (under the floor) →
//           judged, STALLED: a real stall is still caught
//   S3  the online player's rows aged out of the window → sentinel again →
//           STALLED
//   S4  a non-tick row of ANOTHER kind does not unseat a gather sentinel
//   S5  ★ PARITY: on histories with no client rows the new body's whole answer
//           equals the 2026-10-07 body's (nothing changed but F2b)
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const MIG = '2026-10-08-world-tick-party-fences.sql';
const PREV = '2026-10-07-world-tick-armed-cap.sql';
const read = async (f) => (await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8')).replace(/\r\n/g, '\n');
const MIG_SQL = await read(MIG);
const PREV_SQL = await read(PREV);

/** One `create or replace function public.<name>(` statement, verbatim. */
function fnSource(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const end = sql.indexOf('end $$;', start);
  if (start < 0 || end < 0) throw Object.assign(new Error(`${name} not found`), { harness: true });
  return sql.slice(start, end + 'end $$;'.length);
}
const PREV_STALL = fnSource(PREV_SQL, 'hr_tick_stall_status')
  .replace('create or replace function public.hr_tick_stall_status(',
           'create or replace function public.hr_tick_stall_status_prev(');

const PA = '00000000-0000-4000-8000-0000000e1081';   // sorts first; clan level 7 → cap 15 h
const PB = '00000000-0000-4000-8000-0000000e1082';   // no clan → cap 12 h
const UG = '00000000-0000-4000-8000-0000000e1083';   // gather, online
const UG2 = '00000000-0000-4000-8000-0000000e1084';  // gather, offline
const UC = '00000000-0000-4000-8000-0000000e1085';   // combat, the unarmed sentinel
const HOLDER = 'guard:party-fences';
const H = 3600000;

async function arms(db, { log = true } = {}) {
  const red = [];
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) { if (log) console.log(`  ✓ ${id} — ${okMsg}`); } else { red.push(id); if (log) console.log(`  ✗ ${id} — ${badMsg}`); }
  };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const cfg = (set) => db.exec(`update public.hr_tick_config set ${set} where id;`);
  const cact = (await one("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1"))?.activity_id;
  const gact = (await one("select activity_id from public.hr_activities where kind = 'gather' order by activity_id limit 1"))?.activity_id;
  if (!cact || !gact) throw Object.assign(new Error('no combat/gather activity in hr_activities'), { harness: true });

  await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['combat']");
  for (const u of [PA, PB, UG, UG2, UC]) await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
  const clan = (await one("insert into public.clans (name, created_by, level) values ('party fences guard', $1, 7) returning id", [PA])).id;
  await q('insert into public.clan_members (clan_id, user_id) values ($1, $2)', [clan, PA]);
  const capA = Number((await one('select public.hr_offline_cap_ms($1::uuid, 0) as c', [PA])).c);
  const capB = Number((await one('select public.hr_offline_cap_ms($1::uuid, 0) as c', [PB])).c);
  if (capA !== 15 * H || capB !== 12 * H) throw Object.assign(new Error(`fixture caps A ${capA} B ${capB}`), { harness: true });

  const mark25 = (await one("select date_trunc('second', now()) - interval '25 hours' as t")).t;
  for (const [u, kind, act, acc] of [[PA, 'combat', cact, mark25], [PB, 'combat', cact, mark25],
    [UG, 'gather', gact, null], [UG2, 'gather', gact, null], [UC, 'combat', cact, null]]) {
    await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                              active_kind, active_id, active_since)
             values ($1, 0, 500, 0, 10, 10, 1, coalesce($4::timestamptz, now() - interval '5 minutes'), $2, $3,
                     '2000-01-01 00:00:00+00')`, [u, kind, act, acc]);
  }
  const party = (await one('insert into public.party (leader_user, leader_slot) values ($1, 0) returning id', [PA])).id;
  await q("insert into public.party_member (party_id, user_id, slot, role) values ($1, $2, 0, 'leader'), ($1, $3, 0, 'member')",
    [party, PA, PB]);
  const hunt = (await one('insert into public.party_hunt (party_id, active_id, accrued_to) values ($1, $2, $3) returning id',
    [party, cact, mark25])).id;
  await q(`insert into public.party_tick_lease (party_id, owned, lease_holder, lease_until)
           values ($1, true, $2, now() + interval '30 minutes')
           on conflict (party_id) do update set owned = true, lease_holder = $2, lease_until = now() + interval '30 minutes'`,
    [party, HOLDER]);

  const setMarks = async (m) => {
    await q('update public.party_hunt set accrued_to = $2 where id = $1', [hunt, m]);
    await q('update public.player_state set accrued_to = $2 where user_id = any($1::uuid[]) and slot = 0', [[PA, PB], m]);
  };
  const snap = async () => JSON.stringify({
    st: await q('select user_id, gold, version, accrued_to from public.player_state where user_id = any($1::uuid[]) order by user_id', [[PA, PB]]),
    led: await q('select count(*)::int as n from public.player_ledger where user_id = any($1::uuid[])', [[PA, PB]]),
    hunt: await q('select accrued_to, ended_at from public.party_hunt where id = $1', [hunt]),
  });
  const accrueRows = async () => Number((await one(
    "select count(*)::int as n from public.player_ledger where kind = 'combat' and intent = 'accrue' and user_id = any($1::uuid[])",
    [[PA, PB]])).n);
  /** A party settle as the EDGE issues it: `set local role hr_engine`, A listed FIRST. */
  const settle = async (from, to) => {
    const vers = Object.fromEntries((await q('select user_id, version from public.player_state where user_id = any($1::uuid[])',
      [[PA, PB]])).map((r) => [r.user_id, Number(r.version)]));
    const members = [PA, PB].map((u) => ({
      user: u, slot: 0, version: vers[u],
      delta: { gold: 7, accrued_to: new Date(to).toISOString(),
        journal: { kind: 'combat', intent: 'accrue',
          meta: { src: 'tick', ticks: 1,
            party: { id: party, hunt, dmg_bp: 5000, xp_bp: 5000, floor: 0, fellow_bp: 1500, roll: 4242 } } } },
    }));
    await db.exec('begin; set local role hr_engine;');
    try {
      return (await one(`select public.hr_party_tick_settle($1, $2::uuid, $3::timestamptz, $4::timestamptz,
                           gen_random_uuid(), $5::text::jsonb) as r`,
        [HOLDER, party, new Date(from).toISOString(), new Date(to).toISOString(), JSON.stringify(members)])).r;
    } finally { await db.exec('commit;'); }
  };
  const plus = (t, s) => new Date(new Date(t).getTime() + s * 1000).toISOString();
  const ago = async (sql) => (await one(`select date_trunc('second', now()) - interval '${sql}' as t`)).t;

  // ── THE PARTY FENCES ─────────────────────────────────────────────────────
  {
    const s0 = await snap();
    const r1 = await settle(mark25, plus(mark25, 90));
    const s1 = await snap();
    ok('P1', r1.error === 'fenced_24h' && r1.mode === 'armed' && r1.paid === false && r1.member?.user === PA && s1 === s0,
      'armed party window from a 25 h mark: fenced_24h, nothing moved, the hunt not ended',
      `${JSON.stringify(r1)} moved=${s1 !== s0}`);

    const m13 = await ago('13 hours');
    await setMarks(m13);
    const t0 = await snap();
    const r2 = await settle(m13, plus(m13, 90));
    const t1 = await snap();
    ok('P2', r2.error === 'fenced_cap' && r2.member?.user === PB && Number(r2.cap_ms) === capB && t1 === t0,
      'marks 13 h old, A (15 h cap, listed first) admits, B (12 h) does not: the WHOLE window refused naming B with B\'s cap',
      `${JSON.stringify(r2)} moved=${t1 !== t0}`);

    const paid = [];
    for (const age of ['300 seconds', '11 hours']) {
      const m = await ago(age);
      await setMarks(m);
      const l0 = await accrueRows();
      const r = await settle(m, plus(m, 90));
      const l1 = await accrueRows();
      const h = await one('select accrued_to from public.party_hunt where id = $1', [hunt]);
      paid.push({ age, ok: r.ok === true && r.mode === 'armed' && r.paid === true && l1 - l0 === 2
        && new Date(h.accrued_to).getTime() === new Date(plus(m, 90)).getTime(), r, rows: l1 - l0 });
    }
    ok('P3', paid.every((p) => p.ok),
      'a fresh window and an 11 h one (inside the smallest cap) pay both members; the party mark moves',
      JSON.stringify(paid.filter((p) => !p.ok)));

    await cfg("armed_channels = '{}'");
    await setMarks(mark25);
    const sm = await ago('2 minutes');
    await q('update public.party_tick_lease set shadow_accrued_to = $2, shadow_state = null where party_id = $1', [party, sm]);
    const l0 = await accrueRows();
    const r4 = await settle(sm, plus(sm, 30));
    const l1 = await accrueRows();
    ok('P4', r4.ok === true && r4.mode === 'shadow' && Number(r4.journalled) === 2 && l1 === l0,
      'SHADOW: a 25 h hunt mark on a current chain journals in shadow, zero ledger rows',
      `${JSON.stringify(r4)} ledger +${l1 - l0}`);
  }

  // ── F2b ──────────────────────────────────────────────────────────────────
  await cfg("armed_channels = array['gather']");
  await q(`insert into public.hr_tick_ownership (user_id, slot, channel, owned) values
           ($1, 0, 'gather', true), ($2, 0, 'gather', false), ($3, 0, 'combat', true)`, [UG, UG2, UC]);
  const fires = (at) => q(`insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds)
                           select $1::timestamptz - make_interval(secs => g * 10), 'posted', 5, 2, 10
                             from generate_series(1, 719) g`, [at]);
  const combatShadow = (at) => q(`insert into public.hr_tick_shadow (at, user_id, slot, channel, holder,
                           window_from, window_to, version, intent_id, delta)
                           select $1::timestamptz - make_interval(secs => g * 90), $2::uuid, 0, 'combat', 'pf',
                                  $1::timestamptz - make_interval(secs => g * 90 + 90),
                                  $1::timestamptz - make_interval(secs => g * 90), 1, gen_random_uuid(), '{}'::jsonb
                             from generate_series(1, 79) g`, [at, UC]);
  /* `n` rows for `u`, one per `step` s, ending `offset` s before `at`. */
  const ledger = (at, u, kind, tick, n, step = 90, offset = 0) => q(`insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
                           select $2::uuid, 0, $3, 'accrue',
                                  case when $4 then jsonb_build_object('src', 'tick', 'qty', 1) else jsonb_build_object('qty', 1) end,
                                  $1::timestamptz - make_interval(secs => $7::int + g * $6::int)
                             from generate_series(1, $5::int) g`, [at, u, kind, tick, n, step, offset]);
  const status = async (at) => (await one('select public.hr_tick_stall_status($1::timestamptz, 2, 30) as s', [at])).s;
  const prev = async (at) => (await one('select public.hr_tick_stall_status_prev($1::timestamptz, 2, 30) as s', [at])).s;
  const brief = (s) => JSON.stringify({ ...s, buckets: undefined, armed: (s.armed || []).map((a) => ({ ...a, buckets: undefined })) });
  const owned = (u, v) => q('update public.hr_tick_ownership set owned = $2 where user_id = $1', [u, v]);
  {
    const A = '2014-07-01 12:00:00+00';
    await fires(A); await combatShadow(A); await ledger(A, UG, 'gather', false, 79);
    const s1 = await status(A);
    ok('S1', s1.armed_judged === false && s1.armed_stalled === false && s1.stalled === false && s1.armed?.[0]?.sentinel === false,
      'the only gather sentinel was ONLINE (79 client accrue rows, 0 tick windows): no armed verdict, no stall', brief(s1));

    await owned(UG2, true);
    await ledger(A, UG2, 'gather', true, 10, 700);
    const s2 = await status(A);
    await owned(UG2, false);
    ok('S2', s2.armed_judged === true && s2.armed_stalled === true && s2.stalled === true && s2.ok === false,
      'an OFFLINE gatherer with 10 tick rows in 2 h beside the online one: judged, STALLED', brief(s2));

    const B = '2015-07-01 12:00:00+00';
    await fires(B); await combatShadow(B); await ledger(B, UG, 'gather', false, 40, 90, 2 * 3600);
    const s3 = await status(B);
    ok('S3', s3.armed_judged === true && s3.armed_stalled === true,
      'the online player\'s client rows all older than the window: a sentinel again, STALLED', brief(s3));

    const C = '2016-07-01 12:00:00+00';
    await fires(C); await combatShadow(C); await ledger(C, UG, 'craft', false, 79);
    const s4 = await status(C);
    ok('S4', s4.armed_judged === true && s4.armed_stalled === true,
      'a non-tick row of ANOTHER kind (craft) does not unseat a gather sentinel', brief(s4));
  }

  // ── S5: everything but F2b is the 2026-10-07 body ────────────────────────
  {
    const D = '2017-07-01 12:00:00+00';             // gather tick rows healthy, combat healthy
    await fires(D); await combatShadow(D); await ledger(D, UG2, 'gather', true, 79);
    const E = '2017-08-01 12:00:00+00';             // nothing at all
    await fires(E);
    const cases = [];
    const probe = async (name, armedSql, at, ownedUG2 = false) => {
      await cfg(`armed_channels = ${armedSql}`);
      await owned(UG2, ownedUG2);
      const nw = await status(at); const od = await prev(at);
      if (JSON.stringify(nw) !== JSON.stringify(od)) cases.push(`${name}: ${brief(nw)} vs ${brief(od)}`);
    };
    await probe('none/healthy', "'{}'", D);
    await probe('none/silent', "'{}'", E);
    await probe('gather/healthy', "array['gather']", D, true);
    await probe('gather/silent', "array['gather']", E, true);
    await probe('gather/stalled-B', "array['gather']", '2015-07-01 12:00:00+00');
    await probe('all-armed', "array['combat','gather','artisan']", D, true);
    await owned(UG2, false);
    ok('S5', cases.length === 0,
      'with no client row in the window the whole answer equals the 2026-10-07 body\'s on 6 histories',
      cases.join(' | '));
  }
  await cfg("armed_channels = '{}'");
  return red;
}

const bodies = async (db) => (await db.query(
  `select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as h from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('hr_party_tick_settle', 'hr_tick_stall_status') order by 1`)).rows
  .map((r) => r.h).join(',');

async function boot() {
  const { db } = await bootReplay({ upTo: MIG });
  await db.exec(PREV_STALL);
  return db;
}

if (!MUTATE) {
  console.log('\nworld-tick-party-fences: an armed party pays inside 24 h and every member\'s cap; online is not a stall');
  let db;
  try { db = await boot(); } catch (e) {
    console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
  }
  const inv0 = JSON.stringify(await inventory(db));
  const b0 = await bodies(db);
  let err = null;
  try { await db.exec(MIG_SQL); } catch (e) { err = String(e.message).split('\n')[0]; }
  const idem = !err && JSON.stringify(await inventory(db)) === inv0 && (await bodies(db)) === b0
    && b0.split(',').length === 2;
  console.log(idem
    ? `  ✓ P-IDEM — ${MIG} re-applied byte-identically (§0 accepted its own bodies, §4 passed twice)`
    : `  ✗ P-IDEM — ${err || 'the re-apply moved the schema or a body'}`);
  let red;
  try { red = await arms(db); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  if (!idem) red.push('P-IDEM');
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: armed party windows stay inside 24 h and every member\'s cap; an online player is not a stall sentinel');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate: one function re-created from THIS file's text with one line
//    broken (the file's own §0/§4 md5 lock would refuse a patched file before
//    any behaviour ran, which proves the lock, not the arms).
const PARTY = fnSource(MIG_SQL, 'hr_party_tick_settle');
const STALL = fnSource(MIG_SQL, 'hr_tick_stall_status');
const MUTANTS = [
  { name: 'no24hFence', fn: PARTY, why: 'the party armed branch has no 24 h fence (as found)', expect: /P1/,
    find: "    if v_adm is distinct from 'admit' then", repl: '    if false then' },
  { name: 'noCapFence', fn: PARTY, why: 'the party armed branch has no cap fence (as found)', expect: /P2/,
    find: "    if v_cap_ms <= 0\n       or v_st.accrued_to < greatest(now(), p_window_to) - v_cap_ms * interval '1 millisecond' then",
    repl: '    if v_cap_ms <= 0 then' },
  { name: 'firstMembersCap', fn: PARTY, why: 'one member\'s cap is applied to the whole party', expect: /P2/,
    find: '    v_cap_ms := coalesce(public.hr_offline_cap_ms(v_mu, v_ms), 0);',
    repl: "    v_cap_ms := coalesce(public.hr_offline_cap_ms((p_members->0->>'user')::uuid, 0), 0);" },
  { name: 'capOnSpanNotAbsence', fn: PARTY, why: 'the cap bounds one window, so a 90 s drip pays the gap', expect: /P2/,
    find: "       or v_st.accrued_to < greatest(now(), p_window_to) - v_cap_ms * interval '1 millisecond' then",
    repl: "       or p_window_to - p_window_from > v_cap_ms * interval '1 millisecond' then" },
  { name: 'noOnlineExclusion', fn: STALL, why: 'an online player is a stall sentinel (F2b as found)', expect: /S1/,
    find: "                  and pl.meta->>'src' is distinct from 'tick'));",
    repl: "                  and pl.meta->>'src' is distinct from 'tick' and false));" },
  { name: 'tickRowsUnseat', fn: STALL, why: 'tick rows also unseat a sentinel, so an under-floor stall goes unjudged', expect: /S2/,
    find: "                  and pl.meta->>'src' is distinct from 'tick'));", repl: '                  and true));' },
  { name: 'anyKindUnseats', fn: STALL, why: 'a client row of any kind unseats the sentinel', expect: /S4/,
    find: '                  and pl.kind = v_kind\n', repl: '' },
  { name: 'windowUnbounded', fn: STALL, why: 'client rows from before the window still unseat the sentinel', expect: /S3/,
    find: '                  and pl.at >= p_now - make_interval(hours => v_hours)\n', repl: '' },
];

console.log('\nworld-tick-party-fences --mutate: every mutant must go RED on its named arm');
let survived = 0;
for (const m of MUTANTS) {
  if (m.fn.split(m.find).length !== 2) { console.error(`harness: ${m.name}: anchor matched ${m.fn.split(m.find).length - 1}x`); process.exit(2); }
  let db;
  try { db = await boot(); await db.exec(m.fn.replace(m.find, () => m.repl)); } catch (e) {
    console.error(`harness: ${m.name}: ${e.message}`); process.exit(2);
  }
  let red;
  try { red = await arms(db, { log: false }); } catch (e) { red = [`threw: ${e.message}`]; }
  const hit = red.some((id) => m.expect.test(id));
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${red.join(', ')}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${red.length ? `red only via ${red.join(', ')}` : 'SURVIVED'}`); }
  await db.close();
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
