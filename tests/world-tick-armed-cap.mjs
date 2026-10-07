// ============================================================================
// tests/world-tick-armed-cap.mjs — AN ARMED TICK NEVER PAYS PAST THE OFFLINE
//                                   CAP, AND AN ARMED STALL IS NOT SILENT
//
//   node tests/world-tick-armed-cap.mjs            the guard
//   node tests/world-tick-armed-cap.mjs --mutate   every mutant must go RED
//
// docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md F1 and F2, implemented by
// supabase/migrations/2026-10-07-world-tick-armed-cap.sql. The migration's own
// §4 executes the same properties at apply time; this guard re-measures them on
// the PGlite chain replay as `hr_engine` (the role the edge settles as), adds
// the SHADOW-PARITY differential the file cannot carry (the 2026-10-06 stall
// body, run side by side with the new one on the same histories), and proves
// each arm can fail.
//
//   P-IDEM  the file re-applies byte-identically (its §0 accepts its own
//           bodies, its §4 passes a second time, inventory and bodies unmoved)
//   C1  ★ F1: armed gather, raw accrued_to 20 h old: the single span to now
//           is refused fenced_cap (cap_ms = hr_offline_cap_ms) and writes ZERO
//           ledger rows; version unmoved
//   C2  ★ F1, the drip: a 90 s window chained from the same 20 h mark is
//           refused fenced_cap (a chain cannot pay the gap a span may not)
//   C3  a span (cap - 1 h) old pays exactly one window, and the paid span is
//           <= cap: what accrue pays for that absence
//   C4  cap + 1 s is refused; a fresh 90 s window pays; 25 h answers
//           fenced_24h (8b still first)
//   C5  the SHADOW branch is untouched: unarmed combat, raw 20 h, current
//           chain → journals in shadow, zero ledger rows
//   S1  ★ F2: gather armed, a gather sentinel, 2 h of rostered fires, zero
//           gather windows → armed_stalled, stalled, ok=false
//   S2  no armed sentinel → no armed verdict, never a stall
//   S3  40 tick ledger rows/h → armed ok
//   S4  the arm boundary (an hour of shadow rows, then an hour split 19
//           shadow / 20 tick, each table alone under the floor) → armed ok
//   S5  non-tick gather ledger rows (accrue) do not count as tick windows
//   S6  ★ SHADOW PARITY: on five histories (nothing armed healthy/stalled,
//           partial with and without a combat sentinel, every channel armed)
//           the new body's judged/sentinel/mode/watched/buckets equal the
//           2026-10-06 body's, and its shadow_stalled equals the old stalled
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const MIG = '2026-10-07-world-tick-armed-cap.sql';
const PREV = '2026-10-06-world-tick-arm-guards.sql';
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

const UG = '00000000-0000-4000-8000-0000000ca207';   // gather
const UC = '00000000-0000-4000-8000-0000000cb207';   // combat
const HOLDER = 'cron:postgres';
let keyN = 0;
const KEY = () => `0000ca27-0000-4000-8000-${String(++keyN).padStart(12, '0')}`;

async function arms(db, { log = true } = {}) {
  const red = [];
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) { if (log) console.log(`  ✓ ${id} — ${okMsg}`); } else { red.push(id); if (log) console.log(`  ✗ ${id} — ${badMsg}`); }
  };
  const one = async (sql, p) => (await db.query(sql, p)).rows[0];
  const n = async (sql, p) => Number(Object.values(await one(sql, p))[0]);
  const cfg = (set) => db.exec(`update public.hr_tick_config set ${set} where id;`);
  const gact = (await one("select activity_id from public.hr_activities where kind = 'gather' order by activity_id limit 1"))?.activity_id;
  const cact = (await one("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1"))?.activity_id;
  if (!gact || !cact) throw Object.assign(new Error('no gather/combat activity in hr_activities'), { harness: true });
  await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = '{}'");
  await db.exec(`insert into auth.users (id) values ('${UG}'), ('${UC}') on conflict do nothing;`);
  const cap = Number((await one('select public.hr_offline_cap_ms($1::uuid, 0) as c', [UG])).c);
  if (!(cap > 2 * 3600000 && cap <= 20 * 3600000)) throw Object.assign(new Error(`fixture cap ${cap} ms`), { harness: true });

  const makeChar = async (u, kind, act, accruedSql, shadowSql = 'null') => {
    await db.exec(`delete from public.hr_tick_ownership where user_id = '${u}';`);
    await db.exec(`
      insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                       active_kind, active_id, active_since)
      values ('${u}', 0, 0, 0, 10, 10, 1, ${accruedSql}, '${kind}', '${act}', '2000-01-01 00:00:00+00')
      on conflict (user_id, slot) do update
        set version = 1, gold = 0, accrued_to = ${accruedSql}, active_kind = '${kind}', active_id = '${act}',
            active_since = '2000-01-01 00:00:00+00';`);
    await db.exec(`
      insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until, shadow_accrued_to)
      values ('${u}', 0, '${kind}', true, '${HOLDER}', now() + interval '10 minutes', ${shadowSql});`);
  };
  const st = async (u) => one('select accrued_to, version, gold from public.player_state where user_id = $1 and slot = 0', [u]);
  const iso = (d, s) => new Date(new Date(d).getTime() + s * 1000).toISOString();
  const nowIso = async () => new Date((await one("select date_trunc('second', now()) as t")).t).toISOString();
  /* A settle as the EDGE issues it: `set local role hr_engine` in its own txn. */
  const settle = async (u, ch, from, to) => {
    const meta = ch === 'gather' ? "'src','tick','qty',2,'ticks',1" : "'src','tick','ticks',1,'kills',0";
    const ver = Number((await st(u)).version);
    await db.exec('begin; set local role hr_engine;');
    try {
      return (await one(`
        select public.hr_tick_settle($1, $2::uuid, 0, $3, $4::bigint, $5::timestamptz, $6::timestamptz,
                 $7::uuid,
                 jsonb_build_object('gold', 3, 'accrued_to', to_jsonb($6::timestamptz),
                   'journal', jsonb_build_object('kind', $3::text, 'intent', 'accrue',
                     'meta', jsonb_build_object(${meta})))) as r`,
      [HOLDER, u, ch, ver, from, to, KEY()])).r;
    } finally { await db.exec('commit;'); }
  };
  const windowRows = (u, ch) => n(`select count(*) from public.player_ledger
                                    where user_id = $1 and kind = $2 and intent = 'accrue'`, [u, ch]);

  // ── F1 ───────────────────────────────────────────────────────────────────
  await cfg("armed_channels = array['gather']");
  {
    await makeChar(UG, 'gather', gact, "date_trunc('second', now()) - interval '20 hours'");
    const s0 = await st(UG);
    const w0 = await windowRows(UG, 'gather');
    const r1 = await settle(UG, 'gather', new Date(s0.accrued_to).toISOString(), await nowIso());
    const r2 = await settle(UG, 'gather', new Date(s0.accrued_to).toISOString(), iso(s0.accrued_to, 90));
    const s1 = await st(UG);
    const dw = (await windowRows(UG, 'gather')) - w0;
    ok('C1', r1.error === 'fenced_cap' && r1.mode === 'armed' && Number(r1.cap_ms) === cap && dw === 0
        && Number(s1.version) === Number(s0.version),
      `armed 20 h span refused fenced_cap (cap_ms ${cap}), 0 ledger rows, version unmoved`,
      `${JSON.stringify(r1)} ledger +${dw} version ${s0.version}->${s1.version}`);
    ok('C2', r2.error === 'fenced_cap',
      'a 90 s window dripping from the same 20 h mark is refused fenced_cap',
      `drip ${JSON.stringify(r2)}`);

    await makeChar(UG, 'gather', gact, `date_trunc('second', now()) - interval '${cap - 3600000} milliseconds'`);
    const t0 = await st(UG);
    const w1 = await windowRows(UG, 'gather');
    const r3 = await settle(UG, 'gather', new Date(t0.accrued_to).toISOString(), await nowIso());
    const t1 = await st(UG);
    const paidMs = new Date(t1.accrued_to).getTime() - new Date(t0.accrued_to).getTime();
    const dw3 = (await windowRows(UG, 'gather')) - w1;
    ok('C3', r3.ok === true && r3.paid === true && dw3 === 1 && paidMs > 0 && paidMs <= cap,
      `a span (cap - 1 h) old pays one window of ${paidMs} ms <= cap ${cap}`,
      `${JSON.stringify(r3)} rows +${dw3} paid ${paidMs} ms cap ${cap}`);

    await makeChar(UG, 'gather', gact, `date_trunc('second', now()) - interval '${cap + 1000} milliseconds'`);
    const b0 = await st(UG);
    const r4 = await settle(UG, 'gather', new Date(b0.accrued_to).toISOString(), await nowIso());
    await makeChar(UG, 'gather', gact, "date_trunc('second', now()) - interval '90 seconds'");
    const f0 = await st(UG);
    const r5 = await settle(UG, 'gather', new Date(f0.accrued_to).toISOString(), iso(f0.accrued_to, 90));
    await makeChar(UG, 'gather', gact, "date_trunc('second', now()) - interval '25 hours'");
    const d0 = await st(UG);
    const r6 = await settle(UG, 'gather', new Date(d0.accrued_to).toISOString(), iso(d0.accrued_to, 90));
    ok('C4', r4.error === 'fenced_cap' && r5.ok === true && r5.paid === true && r6.error === 'fenced_24h',
      'cap + 1 s refused fenced_cap; a fresh 90 s window pays; 25 h answers fenced_24h first',
      `cap+1s ${JSON.stringify(r4)}; fresh ${JSON.stringify(r5)}; 25 h ${JSON.stringify(r6)}`);

    await makeChar(UC, 'combat', cact, "date_trunc('second', now()) - interval '20 hours'",
      "date_trunc('second', now()) - interval '2 minutes'");
    const c0 = await one(`select greatest(ps.accrued_to, o.shadow_accrued_to) as m from public.player_state ps
                            join public.hr_tick_ownership o on o.user_id = ps.user_id and o.slot = ps.slot
                           where ps.user_id = $1 and ps.slot = 0`, [UC]);
    const l0 = await windowRows(UC, 'combat');
    const r7 = await settle(UC, 'combat', new Date(c0.m).toISOString(), iso(c0.m, 30));
    const dl7 = (await windowRows(UC, 'combat')) - l0;
    ok('C5', r7.ok === true && r7.mode === 'shadow' && dl7 === 0,
      'SHADOW combat, raw 20 h on a current chain, journals in shadow and writes 0 ledger rows',
      `${JSON.stringify(r7)} ledger +${dl7}`);
  }

  // ── F2 ───────────────────────────────────────────────────────────────────
  // Both fixtures become sentinels: on their channel since 2000, raw mark
  // 5 min old, owned. Histories are planted at instants no real row occupies.
  await makeChar(UG, 'gather', gact, "now() - interval '5 minutes'");
  await makeChar(UC, 'combat', cact, "now() - interval '5 minutes'");
  const fires = (at) => db.query(`insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds)
                                  select $1::timestamptz - make_interval(secs => g * 10), 'posted', 5, 2, 10
                                    from generate_series(1, 719) g`, [at]);
  const shadow = (at, u, ch, lo, hi) => db.query(`insert into public.hr_tick_shadow (at, user_id, slot, channel, holder,
                                  window_from, window_to, version, intent_id, delta)
                                  select $1::timestamptz - make_interval(secs => g * 90), $2::uuid, 0, $3, 'armed-cap',
                                         $1::timestamptz - make_interval(secs => g * 90 + 90),
                                         $1::timestamptz - make_interval(secs => g * 90), 1, gen_random_uuid(), '{}'::jsonb
                                    from generate_series($4::int, $5::int) g`, [at, u, ch, lo, hi]);
  const ledgerRows = (at, tick, lo, hi) => db.query(`insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
                                  select $2::uuid, 0, 'gather', 'accrue',
                                         case when $3 then jsonb_build_object('src', 'tick', 'qty', 1)
                                              else jsonb_build_object('qty', 1) end,
                                         $1::timestamptz - make_interval(secs => g * 90)
                                    from generate_series($4::int, $5::int) g`, [at, UG, tick, lo, hi]);
  const status = async (at) => (await one('select public.hr_tick_stall_status($1::timestamptz, 2, 30) as s', [at])).s;
  const prev = async (at) => (await one('select public.hr_tick_stall_status_prev($1::timestamptz, 2, 30) as s', [at])).s;
  const A = '2004-07-01 12:00:00+00', B = '2005-07-01 12:00:00+00', C = '2006-07-01 12:00:00+00';
  const brief = (s) => JSON.stringify({ ...s, buckets: undefined, armed: (s.armed || []).map((a) => ({ ...a, buckets: undefined })) });

  {
    await cfg("armed_channels = array['gather']");
    // A (2004): zero gather windows, combat healthy
    await fires(A); await shadow(A, UC, 'combat', 1, 79);
    const s1 = await status(A);
    ok('S1', s1.armed_judged === true && s1.armed_stalled === true && s1.stalled === true && s1.ok === false
        && s1.shadow_stalled === false && s1.judged === true && s1.armed?.[0]?.channel === 'gather',
      'gather armed, 2 h rostered, zero gather windows, sentinel present: ARMED STALL; combat shadow ok',
      brief(s1));
    await db.exec(`update public.hr_tick_ownership set owned = false where user_id = '${UG}';`);
    const s2 = await status(A);
    await db.exec(`update public.hr_tick_ownership set owned = true where user_id = '${UG}';`);
    ok('S2', s2.armed_judged === false && s2.armed_stalled === false && s2.stalled === false,
      'no armed sentinel: no armed verdict, never a stall', brief(s2));

    // B (2005): tick ledger rows healthy
    await fires(B); await shadow(B, UC, 'combat', 1, 79); await ledgerRows(B, true, 1, 79);
    const s3 = await status(B);
    ok('S3', s3.armed_judged === true && s3.armed_stalled === false && s3.stalled === false,
      '40 tick ledger rows/h: armed ok', brief(s3));

    // C (2006): the arm boundary
    await fires(C); await shadow(C, UC, 'combat', 1, 79);
    // Armed ~30 min ago: the older hour is all shadow rows (~39), the newer
    // hour is ~19 shadow rows then 20 tick rows, so EACH hour needs both
    // tables to clear the 30-row floor.
    await shadow(C, UG, 'gather', 21, 79); await ledgerRows(C, true, 1, 20);
    const s4 = await status(C);
    ok('S4', s4.armed_judged === true && s4.armed_stalled === false,
      'the arm boundary (an hour of shadow rows, then an hour split shadow/tick): armed ok', brief(s4));

    await ledgerRows(A, false, 1, 79);                // accrue rows, not tick rows
    const s5 = await status(A);
    ok('S5', s5.armed_stalled === true,
      'non-tick gather accrue rows do not count as tick windows: still STALLED', brief(s5));
  }

  // ── S6 shadow parity against the 2026-10-06 body ─────────────────────────
  {
    const D = '2007-07-01 12:00:00+00';               // gather rows only, combat silent
    await fires(D); await shadow(D, UG, 'gather', 1, 79);
    const E = '2007-08-01 12:00:00+00';               // nothing at all
    await fires(E);
    const KEYS = ['judged', 'sentinel', 'mode', 'watched_channels', 'armed_channels', 'buckets', 'hours', 'min_rows_per_hour'];
    const cases = [];
    const probe = async (name, armedSql, at, ownedCombat = true) => {
      await cfg(`armed_channels = ${armedSql}`);
      await db.exec(`update public.hr_tick_ownership set owned = ${ownedCombat} where user_id = '${UC}';`);
      const nw = await status(at); const od = await prev(at);
      const diff = KEYS.filter((k) => JSON.stringify(nw[k]) !== JSON.stringify(od[k]));
      if (nw.shadow_stalled !== od.stalled) diff.push('shadow_stalled');
      if (!nw.armed_stalled && (nw.stalled !== od.stalled || nw.ok !== od.ok)) diff.push('stalled');
      cases.push({ name, diff });
    };
    await probe('none/healthy', "'{}'", A);
    await probe('none/silent', "'{}'", E);
    await probe('partial/combat-silent', "array['gather']", D);
    await probe('partial/no-combat-sentinel', "array['gather']", D, false);
    await probe('all-armed', "array['combat','gather','artisan']", D);
    await db.exec(`update public.hr_tick_ownership set owned = true where user_id = '${UC}';`);
    const bad = cases.filter((c) => c.diff.length);
    ok('S6', bad.length === 0,
      `shadow verdict identical to the 2026-10-06 body on ${cases.length} histories`,
      bad.map((c) => `${c.name}: ${c.diff.join(',')}`).join('; '));
  }
  await cfg("armed_channels = '{}'");
  return red;
}

const bodies = async (db) => (await db.query(
  `select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as h from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('hr_tick_settle', 'hr_tick_stall_status') order by 1`)).rows
  .map((r) => r.h).join(',');

async function boot() {
  /* THIS FILE'S STATE, not the chain end: 2026-10-08-world-tick-party-fences.sql
     restates hr_tick_stall_status after it (F2b: an ONLINE character is not an
     armed sentinel, which is exactly what S5 plants), so this file's §0 lock
     would refuse a re-apply over the chain end, and S5 measures this body's
     tick-row rule. The chain-end body has its own guard,
     tests/world-tick-party-fences.mjs. */
  const { db } = await bootReplay({ upTo: MIG });
  await db.exec(PREV_STALL);
  return db;
}

if (!MUTATE) {
  console.log('\nworld-tick-armed-cap: the armed tick pays at most the offline cap; an armed stall is judged');
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
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: armed windows stay inside the cap; armed stalls are judged; the shadow verdict is unchanged');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate: one function re-created from THIS file's text with one line
//    broken (the file's own §0/§4 would refuse a patched file on its md5 lock
//    before any behaviour ran, which proves the lock, not the arms).
const SETTLE = fnSource(MIG_SQL, 'hr_tick_settle');
const STALL = fnSource(MIG_SQL, 'hr_tick_stall_status');
const MUTANTS = [
  { name: 'noCapFence', fn: SETTLE, why: 'the armed branch ignores the cap again (F1 as found)', expect: /C1/,
    find: "  if v_cap_ms <= 0\n     or v_st.accrued_to < greatest(now(), p_window_to) - v_cap_ms * interval '1 millisecond' then",
    repl: '  if v_cap_ms <= 0 then' },
  { name: 'capOnSpanNotAbsence', fn: SETTLE, why: 'the cap bounds one window, so a chain drips the whole gap', expect: /C2/,
    find: "     or v_st.accrued_to < greatest(now(), p_window_to) - v_cap_ms * interval '1 millisecond' then",
    repl: "     or p_window_to - p_window_from > v_cap_ms * interval '1 millisecond' then" },
  { name: 'capOffByAnHour', fn: SETTLE, why: 'the cap is read an hour long', expect: /C4/,
    find: "greatest(now(), p_window_to) - v_cap_ms * interval '1 millisecond' then",
    repl: "greatest(now(), p_window_to) - v_cap_ms * interval '1 millisecond' - interval '1 hour' then" },
  { name: 'armedNeverJudged', fn: STALL, why: 'armed channels are never judged (F2 as found)', expect: /S1/,
    find: '    v_ajudged := coalesce(v_cfg.enabled, false) and v_asent;',
    repl: '    v_ajudged := false;' },
  { name: 'noArmedSentinel', fn: STALL, why: 'an armed channel with nobody on it is judged a stall', expect: /S2/,
    find: '    v_asent := exists (', repl: '    v_asent := true or exists (' },
  { name: 'tickRowsIgnored', fn: STALL, why: 'tick ledger rows are not counted', expect: /S3/,
    find: "and pl.kind = v_kind and pl.meta->>'src' = 'tick'),", repl: 'and false),' },
  { name: 'nonTickCounted', fn: STALL, why: 'an accrue row passes for a tick window', expect: /S5/,
    find: "and pl.kind = v_kind and pl.meta->>'src' = 'tick'),", repl: 'and pl.kind = v_kind),' },
  { name: 'boundaryIsAStall', fn: STALL, why: 'shadow rows of the armed channel are not counted', expect: /S4/,
    find: "or (e->>'tick_rows')::int + (e->>'shadow_rows')::int >= v_min);",
    repl: "or (e->>'tick_rows')::int >= v_min);" },
  { name: 'stalledNotUnion', fn: STALL, why: 'an armed stall never reaches `stalled`', expect: /S1/,
    find: "    'stalled', v_stalled or v_any_as,", repl: "    'stalled', v_stalled," },
  { name: 'judgedFoldsArmed', fn: STALL, why: '`judged` stops meaning "the unarmed shadow is watched"', expect: /S6/,
    find: "    'judged', v_judged,", repl: "    'judged', v_judged or v_any_aj," },
  { name: 'shadowCountsArmed', fn: STALL, why: "the shadow rule counts an armed channel's rows", expect: /S6/,
    find: '                                 and not (s.channel = any (v_armed))),',
    repl: '                                 and true),' },
];

console.log('\nworld-tick-armed-cap --mutate: every mutant must go RED on its named arm');
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
