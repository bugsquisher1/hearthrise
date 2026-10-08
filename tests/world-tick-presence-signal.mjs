// ============================================================================
// tests/world-tick-presence-signal.mjs — "REAL RETURN" MEANS ACTIVE PRESENCE:
// THE AUTHENTICATED HEARTBEAT CARRIES THE PRESENCE ANCHOR, NEVER PAST A SPENT
// HORIZON
//
//   node tests/world-tick-presence-signal.mjs            the guard
//   node tests/world-tick-presence-signal.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-14-world-tick-presence-signal.sql (Game Designer
// precondition B3): a stamped hr_heartbeat raises hr_return_anchor to now() iff
// the anchor exists, is behind now(), and now() <= greatest(accrued_to,
// anchor + hr_offline_cap_ms). Measured on the PGlite chain replay; beats go
// through the CLIENT verb hr_heartbeat as `authenticated` with the JWT sub set,
// settles and cap reads as hr_engine, fixture writes inside a transaction
// marked as the tick (so the fixture is never presence). Elapsed time is
// simulated by moving stored instants back.
//
//   P-IDEM  the file re-applies byte-identically (§0 accepted, §4 passed twice)
//   S1  ★ PARTIED ONLINE (accrue refused party_settle_required, so never
//           called): beats only, 20 h in 2 h steps, never past R + cap (M4's
//           drop/rejoin predicate); the silent twin crosses at the first step
//           past its cap (OFFLINE is dropped at R + cap)
//   S2  ★ SOLO ONLINE, tick-settled: a beat moves R and the armed window ending
//           past the OLD horizon pays; the silent twin is refused past_horizon
//           and parked once (OFFLINE is parked at R + cap)
//   S3  ★ RESUME AFTER PARKING: a beat after the spent horizon moves nothing and
//           the parked window still pays nothing (no back pay); the return's cap
//           read forfeits the gap, R -> now, unparked, the next window pays, a
//           later beat carries R; the absence was paid exactly the cap
//   S4  no anchor is created; an anchor ahead of now() is not lowered; a tick
//           write of last_seen_at, a throttled beat (20 s floor) and a
//           rate-limited beat (hr_rate_ok bucket) stamp nothing
//   S5  ★ a beat from A moves A's anchor and nothing of B's; a forged
//           last_seen_at a day ahead stamps the SERVER clock
//   S7  ★ same uid, two slots: a beat on slot 0 leaves slot 1 alone
//   S8  the 5-min write floor: a beat 4 min after R writes nothing, 6 min stamps
//   S6  catalogue: hr_heartbeat is one overload taking only p_slot;
//           authenticated cannot UPDATE player_state; hr_heartbeat__ungated is
//           the only body that SETs last_seen_at; the trigger is AFTER UPDATE OF
//           last_seen_at; the stamp is executable by no role
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const MIG = '2026-10-14-world-tick-presence-signal.sql';
const MIG_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');

function fnSource(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const as = sql.indexOf('\nas $$', start);
  const end = sql.indexOf('$$;', as + 6);
  if (start < 0 || as < 0 || end < 0) throw Object.assign(new Error(`${name} not found`), { harness: true });
  return sql.slice(start, end + 3);
}

const H = 3600000;
let RUN = 0;
let SEQ = 0;
const uid = () => { SEQ += 1; return `00000000-0000-4000-8000-${(0xb000 + RUN).toString(16)}${SEQ.toString(16).padStart(8, '0')}`; };
const HOLDER = 'guard:presence-signal';

async function arms(db, { log = true } = {}) {
  RUN += 1;
  const red = [];
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) { if (log) console.log(`  ✓ ${id} — ${okMsg}`); } else { red.push(id); if (log) console.log(`  ✗ ${id} — ${badMsg}`); }
  };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const gact = (await one("select activity_id from public.hr_activities where kind = 'gather' order by activity_id limit 1"))?.activity_id;
  const cact = (await one("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1"))?.activity_id;
  if (!gact || !cact) throw Object.assign(new Error('hr_activities lacks a gather or combat row'), { harness: true });
  await db.exec("update public.hr_tick_config set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['gather'] where id;");
  const nowMs = async () => new Date((await one('select now() as t')).t).getTime();
  const iso = (m) => new Date(m).toISOString();
  const ms = (t) => (t === null || t === undefined ? null : new Date(t).getTime());

  const char = async ({ owned = false } = {}) => {
    const u = uid();
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
    await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to, active_kind, active_id, active_since)
             values ($1, 0, 0, 0, 10, 10, 1, now() - interval '10 seconds', 'gather', $2, '2000-01-01 00:00:00+00')`, [u, gact]);
    if (owned) {
      await q(`insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
               values ($1, 0, 'gather', true, $2, now() + interval '5 minutes')`, [u, HOLDER]);
    }
    return u;
  };
  const st = (u) => one('select accrued_to, version, last_seen_at from public.player_state where user_id = $1 and slot = 0', [u]);
  const anchor = async (u) => ms((await one('select real_return_at from public.hr_return_anchor where user_id = $1 and slot = 0', [u]))?.real_return_at ?? null);
  const capOf = async (u) => Number((await one('select public.hr_offline_cap_ms($1::uuid, 0) as c', [u])).c);
  /** A fixture write in a transaction marked as the world tick: never presence. */
  const tickWrite = async (sql, p) => {
    await db.exec("begin; select set_config('hr.frame_origin', 'tick', true);");
    try { await q(sql, p); } finally { await db.exec('commit;'); }
  };
  /** The CLIENT verb, exactly as PostgREST calls it for the JWT's sub. */
  const beat = async (u, { reset = true } = {}) => {
    if (reset) await q('delete from public.hr_rate_counters where user_id = $1', [u]);
    await db.exec(`begin; select set_config('request.jwt.claim.sub', '${u}', true); set local role authenticated;`);
    try { return (await one('select public.hr_heartbeat(0) as r')).r; }
    catch (e) { return { threw: e.message }; } finally { try { await db.exec('commit;'); } catch { await db.exec('rollback;'); } }
  };
  const settle = async (u, fromMs, toMs) => {
    const s = await st(u);
    await db.exec('begin; set local role hr_engine;');
    try {
      return (await one(`select public.hr_tick_settle($1, $2::uuid, 0, 'gather', $3::bigint, $4::timestamptz, $5::timestamptz,
                           gen_random_uuid(), $6::text::jsonb) as r`,
        [HOLDER, u, s.version, iso(fromMs), iso(toMs),
          JSON.stringify({ accrued_to: iso(toMs), journal: { kind: 'gather', intent: 'accrue', meta: { src: 'tick', ticks: 1 } } })])).r;
    } catch (e) { return { threw: e.message }; } finally { try { await db.exec('commit;'); } catch { await db.exec('rollback;'); } }
  };
  const capRead = async (u) => {
    await db.exec('begin; set local role hr_engine;');
    try { return Number((await one('select public.hr_accrue_cap_ms($1::uuid, 0) as c', [u])).c); }
    catch (e) { return `threw: ${e.message}`; } finally { try { await db.exec('commit;'); } catch { await db.exec('rollback;'); } }
  };
  const ledger = async (u) => Number((await one('select count(*)::int as n from public.player_ledger where user_id = $1', [u])).n);
  const partied = async (u) => (await one('select public.hr_partied($1::uuid, 0) as p', [u])).p === true;

  // ── S1 PARTIED ONLINE vs its silent twin ────────────────────────────────
  {
    const ON = await char();
    const OFF = await char();
    const pid = (await one('insert into public.party (leader_user, leader_slot) values ($1, 0) returning id', [ON])).id;
    await q(`insert into public.party_member (party_id, user_id, slot, role, joined_at)
             values ($1, $2, 0, 'leader', now() - interval '1 hour'), ($1, $3, 0, 'member', now() - interval '1 hour')`, [pid, ON, OFF]);
    await q('insert into public.party_hunt (party_id, active_id, accrued_to) values ($1, $2, now())', [pid, cact]);
    const cap = await capOf(ON);
    // Both last seen 5 min from now (a margin for the arm's own run time), so
    // the twin crosses at the first step with 2 h x step > cap.
    await tickWrite(`update public.hr_return_anchor set real_return_at = now() + interval '5 minutes'
                      where user_id in ($1, $2) and slot = 0`, [ON, OFF]);
    const l0 = await ledger(ON);
    let cross = 0;
    const bad = [];
    for (let i = 1; i <= 10; i++) {
      await tickWrite(`update public.hr_return_anchor set real_return_at = real_return_at - interval '2 hours'
                        where user_id in ($1, $2) and slot = 0`, [ON, OFF]);
      await tickWrite(`update public.player_state set accrued_to = now() - interval '10 seconds',
                         last_seen_at = case when user_id = $1 then now() - interval '2 hours' else null end
                        where user_id in ($1, $2) and slot = 0`, [ON, OFF]);
      const r = await beat(ON);
      const n = await nowMs();
      const a = await anchor(ON);
      if (r?.stamped !== true || a === null || n > a + cap || n - a > 5000) bad.push({ i, r, a, n });
      const b = await anchor(OFF);
      if (!cross && n > b + cap) cross = i;
    }
    const want = Math.floor(cap / (2 * H)) + 1;
    ok('S1', bad.length === 0 && cross === want && (await partied(ON)) && (await partied(OFF)) && (await ledger(ON)) === l0,
      `a partied player who only beats (no accrue, no ledger row) is never past R + cap over 20 h; the silent twin crosses at step ${cross} (cap ${cap / H} h)`,
      JSON.stringify({ bad: bad.slice(0, 3), cross, want }));
  }

  // ── S2 SOLO ONLINE, tick-settled, vs its silent twin ────────────────────
  {
    const ON = await char({ owned: true });
    const OFF = await char({ owned: true });
    const cap = await capOf(ON);
    await tickWrite(`update public.hr_return_anchor set real_return_at = now() - $3::bigint * interval '1 millisecond' + interval '30 seconds'
                      where user_id in ($1, $2) and slot = 0`, [ON, OFF, cap]);
    await tickWrite(`update public.player_state set accrued_to = now() - interval '60 seconds' where user_id in ($1, $2) and slot = 0`, [ON, OFF]);
    const b = await beat(ON);
    const res = {};
    for (const [k, u] of [['on', ON], ['off', OFF]]) {
      const s = await st(u);
      const n = await nowMs();
      res[k] = await settle(u, ms(s.accrued_to), n + 50000);
    }
    const park = Number((await one('select count(*)::int as n from public.hr_tick_horizon_log where user_id = $1', [OFF])).n);
    ok('S2', b?.stamped === true && res.on?.ok === true && res.off?.error === 'past_horizon' && park === 1,
      'a beating tick-settled solo player is paid past the OLD horizon; the silent twin is refused past_horizon and parked once',
      JSON.stringify({ b, res, park }));
  }

  // ── S3 RESUME AFTER PARKING ─────────────────────────────────────────────
  {
    const P = await char({ owned: true });
    const cap = await capOf(P);
    const n0 = await nowMs();
    const R0 = n0 - 20 * H;
    const Hz = R0 + cap;
    await tickWrite('update public.hr_return_anchor set real_return_at = $2 where user_id = $1 and slot = 0', [P, iso(R0)]);
    await tickWrite('update public.player_state set accrued_to = $2, last_seen_at = $3 where user_id = $1 and slot = 0', [P, iso(Hz), iso(R0)]);
    const parked = await settle(P, Hz, Hz + 90000);
    const l0 = await ledger(P);
    const b1 = await beat(P);
    const a1 = await anchor(P);
    const again = await settle(P, Hz, Hz + 90000);
    const l1 = await ledger(P);
    const c = await capRead(P);
    const s2 = await st(P);
    const a2 = await anchor(P);
    const live = Number((await one(`select count(*)::int as n from public.hr_tick_horizon_log l
                                      join public.hr_return_anchor a on a.user_id = l.user_id and a.slot = l.slot
                                                                    and a.real_return_at = l.anchor_at
                                     where l.user_id = $1`, [P])).n);
    const forfeit = await one(`select meta from public.player_ledger where user_id = $1 and intent = 'horizon_forfeit'`, [P]);
    const n1 = await nowMs();
    const next = await settle(P, ms(s2.accrued_to), n1 + 50000);
    await tickWrite("update public.player_state set last_seen_at = now() - interval '1 hour' where user_id = $1 and slot = 0", [P]);
    await tickWrite("update public.hr_return_anchor set real_return_at = now() - interval '1 hour' where user_id = $1 and slot = 0", [P]);
    const b2 = await beat(P);
    const a3 = await anchor(P);
    const n2 = await nowMs();
    ok('S3', parked?.error === 'past_horizon' && b1?.stamped === true && a1 === R0
      && again?.error === 'past_horizon' && l1 === l0
      && c === 1 && a2 === ms(s2.accrued_to) && Math.abs(a2 - n1) < 5000 && live === 0
      && forfeit && ms(forfeit.meta.from) === Hz && ms(forfeit.meta.anchor) === R0
      && next?.ok === true && b2?.stamped === true && Math.abs(a3 - n2) < 5000 && Hz - R0 === cap,
      `a beat after a spent horizon moves nothing and pays nothing; the return forfeits the gap, R -> now, unparked, the next window pays; `
      + `presence carries R again; the 20 h absence was paid ${cap / H} h`,
      JSON.stringify({ parked, b1, a1, R0, again, c, a2, live, forfeit, next, b2, a3 }));
  }

  // ── S4 no anchor; ahead; tick write; throttled; rate-limited ────────────
  {
    const X = await char();
    await q('delete from public.hr_return_anchor where user_id = $1', [X]);
    const bNo = await beat(X);
    const noAnchor = await anchor(X);
    await tickWrite("insert into public.hr_return_anchor (user_id, slot, real_return_at) values ($1, 0, now() + interval '40 seconds') "
      + 'on conflict (user_id, slot) do update set real_return_at = excluded.real_return_at', [X]);
    const ahead = await anchor(X);
    await tickWrite("update public.player_state set last_seen_at = now() - interval '1 hour' where user_id = $1 and slot = 0", [X]);
    const bAhead = await beat(X);
    const aheadAfter = await anchor(X);
    // A tick-marked write of last_seen_at is not presence.
    await tickWrite("update public.hr_return_anchor set real_return_at = now() - interval '1 hour' where user_id = $1 and slot = 0", [X]);
    const back = await anchor(X);
    await tickWrite("update public.player_state set last_seen_at = now() - interval '2 hours' where user_id = $1 and slot = 0", [X]);
    const afterTick = await anchor(X);
    // Throttled: beat once (stamps), push R back, beat again inside the floor.
    await beat(X);
    await tickWrite("update public.hr_return_anchor set real_return_at = now() - interval '1 hour' where user_id = $1 and slot = 0", [X]);
    const back2 = await anchor(X);
    const bThr = await beat(X);
    const afterThr = await anchor(X);
    // Rate-limited: exhaust the 6/min bucket, then a beat past the floor.
    for (let i = 0; i < 7; i++) await beat(X, { reset: false });
    await tickWrite("update public.player_state set last_seen_at = now() - interval '1 hour' where user_id = $1 and slot = 0", [X]);
    const bRl = await beat(X, { reset: false });
    const afterRl = await anchor(X);
    ok('S4', bNo?.stamped === true && noAnchor === null && bAhead?.stamped === true && aheadAfter === ahead
      && afterTick === back && bThr?.throttled === true && afterThr === back2
      && bRl?.error === 'rate_limited' && afterRl === back2,
      'no anchor is created; one ahead of now() is not lowered; a tick write, a throttled beat and a rate-limited beat stamp nothing',
      JSON.stringify({ bNo, noAnchor, ahead, aheadAfter, back, afterTick, bThr, back2, afterThr, bRl, afterRl }));
  }

  // ── S5 another uid; a forged clock ──────────────────────────────────────
  {
    const A = await char();
    const B = await char();
    await tickWrite("update public.hr_return_anchor set real_return_at = now() - interval '1 hour' where user_id in ($1, $2) and slot = 0", [A, B]);
    await tickWrite("update public.player_state set last_seen_at = now() - interval '1 hour' where user_id in ($1, $2) and slot = 0", [A, B]);
    const bB0 = await anchor(B);
    const r = await beat(A);
    const aA = await anchor(A);
    const aB = await anchor(B);
    const n = await nowMs();
    await q("update public.player_state set last_seen_at = now() + interval '1 day' where user_id = $1 and slot = 0", [B]);
    const aBf = await anchor(B);
    const n2 = await nowMs();
    ok('S5', r?.stamped === true && Math.abs(aA - n) < 5000 && aB === bB0 && aBf <= n2 && Math.abs(aBf - n2) < 5000,
      "a beat from A moves A's anchor and nothing of B's; a forged last_seen_at a day ahead stamps the server clock",
      JSON.stringify({ r, aA, aB, bB0, aBf, n2 }));
  }

  // ── S7 same uid, two slots ──────────────────────────────────────────────
  {
    const U = await char();
    await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to, active_kind, active_id, active_since)
             values ($1, 1, 0, 0, 10, 10, 1, now() - interval '10 seconds', 'gather', $2, '2000-01-01 00:00:00+00')`, [U, gact]);
    await tickWrite("update public.hr_return_anchor set real_return_at = now() - interval '1 hour' where user_id = $1 and slot in (0, 1)", [U]);
    await tickWrite("update public.player_state set last_seen_at = now() - interval '1 hour' where user_id = $1 and slot = 0", [U]);
    const s1Before = ms((await one('select real_return_at from public.hr_return_anchor where user_id = $1 and slot = 1', [U])).real_return_at);
    const r = await beat(U);
    const n = await nowMs();
    const a0 = await anchor(U);
    const a1 = ms((await one('select real_return_at from public.hr_return_anchor where user_id = $1 and slot = 1', [U])).real_return_at);
    ok('S7', r?.stamped === true && Math.abs(a0 - n) < 5000 && a1 === s1Before,
      "a beat on slot 0 moves slot 0's anchor and leaves the same account's slot 1 alone",
      JSON.stringify({ r, a0, a1, s1Before }));
  }

  // ── S8 the 5-min write floor ────────────────────────────────────────────
  {
    const F = await char();
    await tickWrite("update public.hr_return_anchor set real_return_at = now() - interval '4 minutes' where user_id = $1 and slot = 0", [F]);
    await tickWrite("update public.player_state set last_seen_at = now() - interval '1 hour' where user_id = $1 and slot = 0", [F]);
    const inside0 = await anchor(F);
    const rIn = await beat(F);
    const inside1 = await anchor(F);
    await tickWrite("update public.hr_return_anchor set real_return_at = now() - interval '6 minutes' where user_id = $1 and slot = 0", [F]);
    await tickWrite("update public.player_state set last_seen_at = now() - interval '1 hour' where user_id = $1 and slot = 0", [F]);
    const rOut = await beat(F);
    const n = await nowMs();
    const outside = await anchor(F);
    ok('S8', rIn?.stamped === true && inside1 === inside0 && rOut?.stamped === true && Math.abs(outside - n) < 5000,
      'a beat 4 min after the anchor writes nothing; one 6 min after stamps now()',
      JSON.stringify({ rIn, inside0, inside1, rOut, outside, n }));
  }

  // ── S6 catalogue ────────────────────────────────────────────────────────
  {
    const bad = [];
    const ov = await q(`select pg_get_function_identity_arguments(p.oid) as a from pg_proc p
                          join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'hr_heartbeat'`);
    if (ov.length !== 1 || ov[0].a !== 'p_slot integer') bad.push(`hr_heartbeat overloads: ${JSON.stringify(ov)}`);
    const upd = await one(`select has_table_privilege('authenticated', 'public.player_state', 'update') as t,
                                  has_column_privilege('authenticated', 'public.player_state', 'last_seen_at', 'update') as c`);
    if (upd.t || upd.c) bad.push('authenticated can UPDATE player_state');
    const writers = (await q(`select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'public' and p.prosrc ~* 'set\\s+last_seen_at\\s*=' order by 1`)).map((r) => r.f);
    if (writers.join(',') !== 'hr_heartbeat__ungated(integer)') bad.push(`last_seen_at writers: ${writers.join(',')}`);
    const trg = await one(`select pg_get_triggerdef(t.oid) as d, t.tgenabled as e from pg_trigger t
                            where t.tgrelid = 'public.player_state'::regclass and t.tgname = 'hr_return_anchor_seen'`);
    if (!trg || trg.e !== 'O' || !/AFTER UPDATE OF last_seen_at ON public\.player_state FOR EACH ROW WHEN \(\(old\.last_seen_at IS DISTINCT FROM new\.last_seen_at\)\) EXECUTE FUNCTION hr_return_anchor_presence\(\)/.test(trg.d)) {
      bad.push(`trigger: ${JSON.stringify(trg)}`);
    }
    for (const role of ['public', 'anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick']) {
      if ((await one(`select has_function_privilege($1, 'public.hr_return_anchor_presence()', 'execute') as x`, [role])).x) bad.push(`${role}:execute`);
    }
    ok('S6', bad.length === 0,
      'hr_heartbeat takes only p_slot; authenticated cannot UPDATE player_state; the heartbeat is the only last_seen_at writer; the trigger is on last_seen_at; the stamp reaches no role',
      JSON.stringify(bad));
  }

  await db.exec("update public.hr_tick_config set armed_channels = '{}' where id;");
  return red;
}

const bodies = async (db) => (await db.query(
  `select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as h from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('hr_return_anchor_presence', 'hr_return_anchor_stamp', 'hr_heartbeat__ungated')
    order by 1`)).rows.map((r) => r.h).join(',');

async function boot() { return (await bootReplay({ upTo: MIG })).db; }

if (!MUTATE) {
  console.log('\nworld-tick-presence-signal: the authenticated heartbeat carries the presence anchor, never past a spent horizon');
  let db;
  try { db = await boot(); } catch (e) { console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2); }
  const inv0 = JSON.stringify(await inventory(db));
  const b0 = await bodies(db);
  let err = null;
  try { await db.exec(MIG_SQL); } catch (e) { err = String(e.message).split('\n')[0]; }
  const idem = !err && JSON.stringify(await inventory(db)) === inv0 && (await bodies(db)) === b0 && b0.split(',').length === 3;
  console.log(idem ? `  ✓ P-IDEM — ${MIG} re-applied byte-identically (§0 accepted, §4 passed twice)`
    : `  ✗ P-IDEM — ${err || 'the re-apply moved the schema or a body'}`);
  let red;
  try { red = await arms(db); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  if (!idem) red.push('P-IDEM');
  console.log(red.length ? `\nRED: ${red.join(', ')}`
    : '\nGREEN: presence keeps an online player inside their horizon; absence still parks at R + cap; no back pay on return');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate ────────────────────────────────────────────────────────────────
const SRC = fnSource(MIG_SQL, 'hr_return_anchor_presence');
const RESTORE = `${SRC}\n`
  + 'revoke execute on function public.hr_return_anchor_presence() from public;\n'
  + 'revoke execute on function public.hr_return_anchor_presence() from anon, authenticated, service_role, hr_engine, hr_tick;';
const MUTANTS = [
  { name: 'heartbeatDoesNotStamp', why: 'the heartbeat moves no anchor (a partied online player is dropped once per cap)', expect: /S1|S2/,
    find: "begin\n  -- THE WORLD TICK IS NOT PRESENCE", repl: "begin\n  return null;\n  -- THE WORLD TICK IS NOT PRESENCE" },
  { name: 'clientTimeTrusted', why: 'the anchor takes the written last_seen_at, not the server clock (a forged time moves R ahead)', expect: /S5/,
    find: '  v_now    timestamptz := now();', repl: '  v_now    timestamptz := new.last_seen_at;' },
  { name: 'otherUidMoves', why: "the stamp loses its user predicate (one player's beat moves every anchor)", expect: /S5/,
    find: '   where user_id = new.user_id and slot = new.slot;\n  return null;\nend $$;',
    repl: '   where slot = new.slot;\n  return null;\nend $$;' },
  { name: 'slotBlind', why: "the stamp loses its slot predicate (a beat on one slot moves the account's other slots)", expect: /S7/,
    find: '   where user_id = new.user_id and slot = new.slot;\n  return null;\nend $$;',
    repl: '   where user_id = new.user_id;\n  return null;\nend $$;' },
  { name: 'noWriteFloor', why: 'every beat writes the anchor (the 5-min write floor is gone)', expect: /S8/,
    find: "  if v_now - v_anchor < interval '5 minutes' then\n    return null;\n  end if;\n", repl: '' },
  { name: 'stampsPastHorizon', why: 'a beat after a spent horizon moves R (the gap past R + cap is paid back)', expect: /S3/,
    find: "    if v_cap <= 0 or v_now > v_anchor + v_cap * interval '1 millisecond' then\n      return null;\n    end if;\n", repl: '' },
  { name: 'createsAnchor', why: 'a beat creates an anchor (a character no real settle anchored is paid by the tick)', expect: /S4/,
    find: '  if v_anchor is null then\n    return null;\n  end if;',
    repl: '  if v_anchor is null then\n    insert into public.hr_return_anchor (user_id, slot, real_return_at) values (new.user_id, new.slot, v_now);\n'
      + '    return null;\n  end if;' },
  { name: 'lowersAnchor', why: 'the write floor is one-sided, so a beat lowers an anchor a settle put ahead of now() (not raise-only)', expect: /S4/,
    find: "  if v_now - v_anchor < interval '5 minutes' then",
    repl: "  if v_now - v_anchor between interval '0 seconds' and interval '5 minutes' then" },
  { name: 'tickIsPresence', why: 'a world-tick write of last_seen_at counts as presence', expect: /S4/,
    find: "  if coalesce(current_setting('hr.frame_origin', true), '') = 'tick' then\n    return null;\n  end if;\n", repl: '' },
  { name: 'grantAuthenticated', why: 'the stamp is executable by authenticated', expect: /S6/,
    find: null, repl: '\ngrant execute on function public.hr_return_anchor_presence() to authenticated;' },
];

const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
console.log('\nworld-tick-presence-signal --mutate: every mutant must go RED on its named arm');
let db;
try { db = await boot(); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const control = await arms(db, { log: false });
if (control.length) { console.error(`harness: the unmutated control is red (${control.join(', ')})`); process.exit(2); }
console.log(`[mutants] ${MUTANTS.length}`);
let survived = 0;
for (const m of MUTANTS) {
  let src;
  if (m.find === null) src = SRC + m.repl;
  else {
    if (SRC.split(m.find).length !== 2) { console.error(`harness: ${m.name}: anchor matched ${SRC.split(m.find).length - 1}x`); process.exit(2); }
    src = SRC.replace(m.find, () => m.repl);
  }
  if (!CONTROL) {
    try { await db.exec(src); } catch (e) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
  }
  let red;
  try { red = await arms(db, { log: false }); } catch (e) { red = [`threw: ${e.message}`]; }
  try { await db.exec('rollback;'); } catch { /* not in a transaction */ }
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
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
