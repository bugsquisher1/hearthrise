// ============================================================================
// tests/world-tick-party-drop.mjs — A FENCED PARTY MEMBER IS DROPPED FROM THE
//                                   HUNT; THE REST KEEP BEING PAID
//
//   node tests/world-tick-party-drop.mjs            the guard
//   node tests/world-tick-party-drop.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-08-world-tick-party-drop.sql, answering Security's
// seven conditions (c)(1)-(7) on party-fences
// (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md) and the Game Designer's
// ruling. The file's §7 executes the scenario once at apply time; this guard
// re-measures it on every push on the PGlite chain replay, as `hr_engine` (the
// role the edge settles as) and `hr_tick` (the roster's), adds the arms the
// self-check does not carry (shadow, the 60 s backstop, a member-caused
// refusal) and proves each arm can fail.
//
//   P-IDEM  the file re-applies byte-identically (§0 accepts its own bodies, §7
//           passes a second time, inventory and bodies unmoved)
//   D1  ★ (1)(4)(5)(6) armed, marks 13 h old, PB (cap 12 h, the LEADER) and
//           PA/PC (cap 15 h): the driver's PROBE drops PB alone — nothing paid,
//           no player_state field moved, one journal row, leader handed to PA
//   D2  ★ (2) hr_party_roster (as hr_tick) hands the driver PA and PC only
//   D3  ★ (2) a settle still naming PB is refused; PA+PC are paid, nobody else
//   D4  ★ (3) AWAY: PB earns no party pay and is not rejoined while away
//   D5  ★ (3)(4)(5) ATTENDED: PB's own accrue pays solo; no rejoin over a
//           window ending before PB's mark; then a forward-only rejoin moving
//           only accrued_to/version, the solo lease expired, a journal row; PB
//           paid by the party only from there — ledger: 1 solo + 1 party row
//   D6  ★ (7) the day's 3rd drop is not rejoined though PB returned
//   D7  ★ (6) a sat-out ex-leader's Leave lands
//   D8  ★ (6) both remaining hunters past 24 h: the hunt ENDS, nothing paid
//   D9  SHADOW: combat unarmed, nobody is ever dropped
//   D10 (1) a member-caused refusal (stale version) drops nobody
//   D11 the (8c) backstop: a mark inside the cap by now() but not by the
//           window's end (step 2's +60 s) is refused whole, nobody dropped
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const MIG = '2026-10-08-world-tick-party-drop.sql';
const MIG_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');

/** One `create or replace function public.<name>(` statement, verbatim, through its closing `$$;`. */
function fnSource(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const as = sql.indexOf('\nas $$', start);
  const end = sql.indexOf('$$;', as + 6);
  if (start < 0 || as < 0 || end < 0) throw Object.assign(new Error(`${name} not found`), { harness: true });
  return sql.slice(start, end + 3);
}

const H = 3600000;
const ZERO = '00000000-0000-0000-0000-000000000000';
/* Fixture ids carry the RUN as well as the ordinal, so --mutate can run every
   mutant on ONE booted chain (each run plants its own parties and characters). */
let RUN = 0;
const uid = (n) => `00000000-0000-4000-8000-${RUN.toString(16).padStart(4, '0')}0000${n.toString(16).padStart(4, '0')}`;
const HOLDER = 'guard:party-drop';

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
  /** A party: specs [{ clan7, joinedAgoH }], first spec is the LEADER. All marks `markMs`. */
  const party = async (specs, markMs) => {
    const users = specs.map(() => uid(++seq));
    for (const u of users) await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
    const clan = (await one("insert into public.clans (name, created_by, level) values ($1, $2, 7) returning id",
      [`party drop guard ${RUN}.${seq}`, users[0]])).id;
    for (let i = 0; i < specs.length; i++) {
      if (specs[i].clan7) await q('insert into public.clan_members (clan_id, user_id) values ($1, $2)', [clan, users[i]]);
      await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                                active_kind, active_id, active_since, consec_falls, recovering_until)
               values ($1, 0, 500, 0, $2, 10, 1, $3, 'combat', $4, '2000-01-01 00:00:00+00', $5, $6)`,
        [users[i], i === 0 ? 7 : 10, iso(markMs), cact, i === 0 ? 2 : 0, i === 0 ? '2001-01-01 00:00:00+00' : null]);
    }
    const pid = (await one('insert into public.party (leader_user, leader_slot) values ($1, 0) returning id', [users[0]])).id;
    for (let i = 0; i < specs.length; i++) {
      await q(`insert into public.party_member (party_id, user_id, slot, role, joined_at)
               values ($1, $2, 0, $3, now() - make_interval(hours => $4))`,
        [pid, users[i], i === 0 ? 'leader' : 'member', specs[i].joinedAgoH]);
    }
    const hunt = (await one('insert into public.party_hunt (party_id, active_id, accrued_to) values ($1, $2, $3) returning id',
      [pid, cact, iso(markMs)])).id;
    await q(`insert into public.party_tick_lease (party_id, owned, lease_holder, lease_until)
             values ($1, true, $2, now() + interval '30 minutes')
             on conflict (party_id) do update set owned = true, lease_holder = $2, lease_until = now() + interval '30 minutes'`,
      [pid, HOLDER]);
    return { pid, hunt, users };
  };
  const call = async (pid, from, to, members, intent) => {
    await db.exec('begin; set local role hr_engine;');
    try {
      return (await one(`select public.hr_party_tick_settle($1, $2::uuid, $3::timestamptz, $4::timestamptz,
                           $5::uuid, $6::text::jsonb) as r`,
        [HOLDER, pid, from, to, intent || ZERO, JSON.stringify(members)])).r;
    } finally { await db.exec('commit;'); }
  };
  /** The driver's probe: a stale window, a minimal delta per member. */
  const probe = async (P, users) => {
    const at = iso(await dbNow());
    return call(P.pid, '1970-01-01T00:00:00.000Z', at, users.map((u) => ({ user: u, slot: 0, delta: { accrued_to: at } })));
  };
  /** A priced window for `users`, as the edge issues it. */
  const pay = async (P, fromMs, toMs, users, extra = {}) => {
    const vers = Object.fromEntries((await q('select user_id, version from public.player_state where user_id = any($1::uuid[])',
      [users])).map((r) => [r.user_id, Number(r.version)]));
    const members = users.map((u) => ({
      user: u, slot: 0, version: extra.version?.[u] ?? vers[u],
      delta: { gold: 7, accrued_to: iso(toMs),
        journal: { kind: 'combat', intent: 'accrue',
          meta: { src: 'tick', ticks: 1,
            party: { id: P.pid, hunt: P.hunt, dmg_bp: Math.floor(10000 / users.length), xp_bp: 5000, floor: 0,
              fellow_bp: 1500, roll: 4242 } } } },
    }));
    return call(P.pid, iso(fromMs), iso(toMs), members, (await one('select gen_random_uuid() as g')).g);
  };
  const setMarks = async (P, users, ms) => {
    await q('update public.party_hunt set accrued_to = $2 where id = $1', [P.hunt, iso(ms)]);
    await q('update public.player_state set accrued_to = $2 where user_id = any($1::uuid[]) and slot = 0', [users, iso(ms)]);
  };
  const rows = async (users, where = "kind = 'combat' and intent = 'accrue'") => Number((await one(
    `select count(*)::int as n from public.player_ledger where user_id = any($1::uuid[]) and ${where}`, [users])).n);
  const anyRows = async (users) => Number((await one(
    'select count(*)::int as n from public.player_ledger where user_id = any($1::uuid[])', [users])).n);
  const stateOf = async (users) => JSON.stringify(await q(
    'select to_jsonb(ps) as s from public.player_state ps where user_id = any($1::uuid[]) order by user_id', [users]));
  const journal = async (P) => q(`select user_id, event, reason, mark, member_mark, cap_ms, hunters, day_key
                                     from public.party_hunt_roster_log where party_id = $1 order by id`, [P.pid]);
  const partied = async (u) => (await one('select public.hr_partied($1::uuid, 0) as p', [u])).p;
  const mark = async (u) => new Date((await one('select accrued_to from public.player_state where user_id = $1', [u])).accrued_to).getTime();

  await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['combat']");

  // ── THE MAIN PARTY: PB leader (no clan, 12 h), PA, PC (clan 7, 15 h) ──────
  let now = await dbNow();
  const M = now - 13 * H;
  const P = await party([{ clan7: false, joinedAgoH: 3 }, { clan7: true, joinedAgoH: 2 }, { clan7: true, joinedAgoH: 1 }], M);
  const [PB, PA, PC] = P.users;
  const caps = Object.fromEntries(await Promise.all(P.users.map(async (u) =>
    [u, Number((await one('select public.hr_offline_cap_ms($1::uuid, 0) as c', [u])).c)])));
  if (caps[PB] !== 12 * H || caps[PA] !== 15 * H || caps[PC] !== 15 * H) {
    throw Object.assign(new Error(`fixture caps ${JSON.stringify(caps)}`), { harness: true });
  }

  // D1
  {
    const s0 = await stateOf(P.users); const l0 = await anyRows(P.users);
    const r = await probe(P, P.users);
    const j = await journal(P);
    const lead = await one('select leader_user from public.party where id = $1', [P.pid]);
    const roles = Object.fromEntries((await q('select user_id, role, left_at from public.party_member where party_id = $1', [P.pid]))
      .map((x) => [x.user_id, x]));
    const h = await one('select accrued_to, ended_at from public.party_hunt where id = $1', [P.hunt]);
    ok('D1', r.error === 'member_sat_out' && r.hunters === 2 && r.dropped?.length === 1 && r.dropped[0].user === PB
      && r.dropped[0].reason === 'fenced_cap' && Number(r.dropped[0].cap_ms) === 12 * H && r.leader_handoff === true
      && (await stateOf(P.users)) === s0 && (await anyRows(P.users)) === l0
      && h.ended_at === null && new Date(h.accrued_to).getTime() === M
      && j.length === 1 && j[0].user_id === PB && j[0].event === 'drop' && j[0].reason === 'fenced_cap'
      && new Date(j[0].mark).getTime() === M && Number(j[0].cap_ms) === 12 * H && j[0].hunters === 2
      && lead.leader_user === PA && roles[PA].role === 'leader' && roles[PB].role === 'member' && roles[PB].left_at === null
      && (await partied(PB)) === false && (await partied(PA)) === true,
      'the PROBE drops PB alone on PB\'s own 12 h cap: nothing paid or moved, one journal row, leader handed to PA',
      `${JSON.stringify(r)} journal=${JSON.stringify(j)} leader=${lead.leader_user === PA}`);
  }
  // D2
  {
    await db.exec('begin; set local role hr_tick;');
    let row;
    try {
      row = (await q(`select to_jsonb(x) as r from public.hr_party_roster(array['combat'], 200, $1, 300000, null, null) x
                       where x.party_id = $2`, [HOLDER, P.pid]))[0]?.r;
    } finally { await db.exec('commit;'); }
    const got = (row?.members || []).map((m) => m.user_id).sort();
    ok('D2', row && row.member_count === 2 && JSON.stringify(got) === JSON.stringify([PA, PC].sort()),
      'hr_party_roster hands the driver the two hunters only (PB is the party\'s, not the hunt\'s)',
      JSON.stringify({ count: row?.member_count, got }));
  }
  // D3 + D4
  {
    const r0 = await pay(P, M, M + 90000, P.users);
    const paid = [];
    for (let k = 0; k < 3; k++) {
      const from = M + k * 90000;
      const l0 = await rows([PA, PC]);
      const r = await pay(P, from, from + 90000, [PA, PC]);
      paid.push({ ok: r.ok === true && r.paid === true && (await rows([PA, PC])) - l0 === 2 && r.rejoined?.length === 0, r });
    }
    ok('D3', r0.error === 'party_window_already_settled' && paid.every((p) => p.ok),
      'a settle still naming PB is refused as not the hunter set; PA+PC are paid exactly',
      `${JSON.stringify(r0)} ${JSON.stringify(paid.filter((p) => !p.ok))}`);
    ok('D4', (await anyRows([PB])) === 0 && (await mark(PB)) === M && (await partied(PB)) === false,
      'AWAY: PB earns no party pay, keeps the mark the drop left (their own cap pay waits for them), not rejoined',
      `PB rows ${await anyRows([PB])}, mark moved ${(await mark(PB)) - M} ms`);
  }
  // D5 ATTENDED
  {
    now = await dbNow();
    const X = now - 200000;
    await db.exec('begin; set local role hr_engine;');
    let solo;
    try {
      solo = (await one(`select public.hr_apply($1::uuid, 0, 1, gen_random_uuid(), $2::text::jsonb) as r`,
        [PB, JSON.stringify({ gold: 11, accrued_to: iso(X), journal: { kind: 'combat', intent: 'accrue', meta: { ticks: 1 } } })])).r;
    } finally { await db.exec('commit;'); }
    await q(`insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
             values ($1, 0, 'combat', true, 'guard-solo', now() + interval '5 minutes')`, [PB]);
    const M5 = now - 300000;
    await setMarks(P, [PA, PC], M5);
    const w1 = await pay(P, M5, M5 + 90000, [PA, PC]);
    const noBack = w1.ok === true && w1.rejoined?.length === 0 && (await mark(PB)) === X;
    const before = await one(`select to_jsonb(ps) - 'accrued_to' - 'version' - 'updated_at' as s, version
                                from public.player_state ps where user_id = $1`, [PB]);
    const w2 = await pay(P, M5 + 90000, M5 + 180000, [PA, PC]);
    const after = await one(`select to_jsonb(ps) - 'accrued_to' - 'version' - 'updated_at' as s, version
                               from public.player_state ps where user_id = $1`, [PB]);
    const rj = (await journal(P)).filter((x) => x.event === 'rejoin');
    const lease = await one("select lease_until <= now() as expired from public.hr_tick_ownership where user_id = $1 and channel = 'combat'", [PB]);
    const rejoined = w2.ok === true && w2.rejoined?.length === 1 && w2.rejoined[0].user === PB
      && (await mark(PB)) === M5 + 180000 && Number(after.version) === Number(before.version) + 1
      && JSON.stringify(after.s) === JSON.stringify(before.s)
      && rj.length === 1 && new Date(rj[0].mark).getTime() === M5 + 180000 && new Date(rj[0].member_mark).getTime() === X
      && lease.expired === true && (await partied(PB)) === true;
    const w3 = await pay(P, M5 + 180000, M5 + 270000, [PA, PB, PC]);
    const pbParty = await rows([PB], "kind = 'combat' and intent = 'accrue' and meta ? 'party'");
    const pbSolo = await rows([PB], "kind = 'combat' and intent = 'accrue' and not (meta ? 'party')");
    const gold = Number((await one('select gold from public.player_state where user_id = $1', [PB])).gold);
    ok('D5', solo.ok === true && noBack && rejoined && w3.ok === true && w3.members === 3
      && pbParty === 1 && pbSolo === 1 && gold === 500 + 11 + 7,
      'ATTENDED: PB paid solo by their own accrue; no rejoin over a window ending before PB\'s mark; then a forward '
      + 'rejoin moving only accrued_to/version (hp, recovery, falls carried), the solo lease expired, journalled; '
      + 'PB\'s ledger = 1 solo + 1 party row',
      JSON.stringify({ solo: solo.ok, noBack, rejoined, w1: w1.rejoined, w2: w2.rejoined, w3: w3.ok, pbParty, pbSolo, gold }));
  }
  // D6 clamp, D7 leave
  {
    const hm = new Date((await one('select accrued_to from public.party_hunt where id = $1', [P.hunt])).accrued_to).getTime();
    for (let i = 0; i < 2; i++) {
      await q(`insert into public.party_hunt_roster_log (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, cap_ms, hunters)
               values (public.hr_utc_day_key(now()), $1, $2, $3, 0, 'drop', 'fenced_cap', $4, $5, 2)`,
        [P.pid, P.hunt, PB, iso(hm - 1000), 12 * H]);
    }
    const r = await pay(P, hm, hm + 30000, [PA, PC]);
    ok('D6', r.ok === true && r.rejoined?.length === 0 && (await partied(PB)) === false,
      'PB returned (mark past the drop, before the window end) but at the day\'s 3rd drop is NOT rejoined',
      JSON.stringify(r));
    await q("select set_config('request.jwt.claim.sub', $1, false)", [PB]);
    const lv = (await one('select public.hr_party_leave(0, gen_random_uuid()) as r')).r;
    await q("select set_config('request.jwt.claim.sub', '', false)");
    ok('D7', lv.ok === true && lv.left === true, 'a sat-out ex-leader\'s Leave lands', JSON.stringify(lv));
  }
  // D8 end. A settle that THROWS here (e.g. a hand-off with nobody to hand to)
  // is this arm's red, not a harness failure: the property is "ends cleanly".
  {
    now = await dbNow();
    await setMarks(P, [PA, PC], now - 25 * H);
    const l0 = await anyRows([PA, PC]);
    let r; let threw = null;
    try { r = await probe(P, [PA, PC]); } catch (e) { threw = e.message; r = {}; }
    const h = await one('select ended_at, stopped_by from public.party_hunt where id = $1', [P.hunt]);
    ok('D8', !threw && r.error === 'party_hunt_ended' && r.why === 'too_few_hunters' && r.dropped?.length === 2
      && r.dropped.every((d) => d.reason === 'fenced_24h') && h.ended_at !== null && h.stopped_by === 'too_few_hunters'
      && (await anyRows([PA, PC])) === l0 && (await partied(PA)) === false && (await partied(PC)) === false,
      'both remaining hunters past 24 h: both dropped, the hunt ENDS, nothing paid, everyone solo',
      threw ? `threw: ${threw}` : `${JSON.stringify(r)} ${JSON.stringify(h)}`);
  }

  // ── D9 SHADOW: nobody is ever dropped ────────────────────────────────────
  {
    now = await dbNow();
    const S = await party([{ clan7: false, joinedAgoH: 2 }, { clan7: true, joinedAgoH: 1 }], now - 13 * H);
    await cfg("armed_channels = '{}'");
    await q('update public.party_tick_lease set shadow_accrued_to = now() - interval \'2 minutes\' where party_id = $1', [S.pid]);
    const r = await probe(S, S.users);
    await cfg("armed_channels = array['combat']");
    ok('D9', r.error === 'party_window_already_settled' && r.shadow === true && (await journal(S)).length === 0
      && (await partied(S.users[0])) === true,
      'SHADOW: a 13 h mark past a member\'s 12 h cap drops nobody (nothing is paid in shadow)', JSON.stringify(r));
  }
  // ── D10 a member-caused refusal drops nobody ─────────────────────────────
  {
    now = await dbNow();
    const V = await party([{ clan7: false, joinedAgoH: 2 }, { clan7: true, joinedAgoH: 1 }], now - 300000);
    const r = await pay(V, now - 300000, now - 210000, V.users, { version: { [V.users[1]]: 99 } });
    ok('D10', r.error === 'party_window_already_settled' && r.why === 'version_conflict' && (await journal(V)).length === 0,
      'a stale member version refuses the window and drops nobody', JSON.stringify(r));
  }
  // ── D11 the (8c) backstop for the +60 s skew ─────────────────────────────
  {
    now = await dbNow();
    const B0 = now - 12 * H + 30000;                 // inside 12 h by now(), not by now()+40 s
    const B = await party([{ clan7: false, joinedAgoH: 2 }, { clan7: true, joinedAgoH: 1 }], B0);
    const l0 = await anyRows(B.users);
    const r = await pay(B, B0, now + 40000, B.users);
    ok('D11', r.error === 'fenced_cap' && (await journal(B)).length === 0 && (await anyRows(B.users)) === l0,
      'a window ending past now() beyond a member\'s cap is refused whole by the (8c) backstop; nobody dropped',
      JSON.stringify(r));
  }
  await cfg("armed_channels = '{}'");
  return red;
}

const bodies = async (db) => (await db.query(
  `select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as h from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('hr_party_tick_settle', 'hr_party_roster', 'hr_partied', 'hr_party_sat_out') order by 1`)).rows
  .map((r) => r.h).join(',');

async function boot() {
  const { db } = await bootReplay({ upTo: MIG });
  return db;
}

if (!MUTATE) {
  console.log('\nworld-tick-party-drop: a fenced member is dropped from the hunt, the rest keep being paid');
  let db;
  try { db = await boot(); } catch (e) {
    console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
  }
  const inv0 = JSON.stringify(await inventory(db));
  const b0 = await bodies(db);
  let err = null;
  try { await db.exec(MIG_SQL); } catch (e) { err = String(e.message).split('\n')[0]; }
  const idem = !err && JSON.stringify(await inventory(db)) === inv0 && (await bodies(db)) === b0
    && b0.split(',').length === 4;
  console.log(idem
    ? `  ✓ P-IDEM — ${MIG} re-applied byte-identically (§0 accepted its own bodies, §7 passed twice)`
    : `  ✗ P-IDEM — ${err || 'the re-apply moved the schema or a body'}`);
  let red;
  try { red = await arms(db); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  if (!idem) red.push('P-IDEM');
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: a fenced member is dropped alone, the rest are paid, the rejoin is forward-only and clamped, under two hunters ends the hunt');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate: one function re-created from THIS file's text with one line
//    broken (the file's own §0/§7 md5 lock would refuse a patched FILE before
//    any behaviour ran, which proves the lock, not the arms).
const SETTLE = fnSource(MIG_SQL, 'hr_party_tick_settle');
const ROSTER = fnSource(MIG_SQL, 'hr_party_roster');
const PARTIED = fnSource(MIG_SQL, 'hr_partied');
const MUTANTS = [
  { name: 'noDrop', fn: SETTLE, why: 'the armed branch never drops (the party-fences freeze)', expect: /D1/,
    find: '  if not v_shadow then\n    for v_m in', repl: '  if false then\n    for v_m in' },
  { name: 'shadowDrops', fn: SETTLE, why: 'the drop also runs in SHADOW', expect: /D9/,
    find: '  if not v_shadow then\n    for v_m in', repl: '  if true then\n    for v_m in' },
  { name: 'oneCapForAll', fn: SETTLE, why: 'the first hunter\'s cap judges every hunter', expect: /D1/,
    find: "      v_cap_ms := coalesce(public.hr_offline_cap_ms(v_mu, v_ms), 0);\n      v_reason",
    repl: "      v_cap_ms := coalesce(public.hr_offline_cap_ms((select pm.user_id from public.party_member pm where pm.party_id = p_party and pm.user_id <> v_mu order by pm.user_id limit 1), 0), 0);\n      v_reason" },
  { name: 'noJournal', fn: SETTLE, why: 'a drop is not journalled (and so not a drop)', expect: /D1/,
    find: '        from jsonb_array_elements(v_drop) d;', repl: '        from jsonb_array_elements(v_drop) d where false;' },
  { name: 'noHandoff', fn: SETTLE, why: 'a dropped leader keeps the role', expect: /D1/,
    find: "      if exists (select 1 from jsonb_array_elements(v_drop) d\n                  where (d->>'user')::uuid = v_lead.user_id",
    repl: "      if false and exists (select 1 from jsonb_array_elements(v_drop) d\n                  where (d->>'user')::uuid = v_lead.user_id" },
  { name: 'noEnd', fn: SETTLE, why: 'under two hunters the hunt keeps running', expect: /D8/,
    find: '      if v_hunters < 2 then', repl: '      if false then' },
  { name: 'liveSetHasSatOut', fn: SETTLE, why: 'the settle\'s live set still counts the dropped member', expect: /D3/,
    find: "  select count(*) into v_live from public.party_member pm\n   where pm.party_id = p_party and pm.left_at is null\n     and not public.hr_party_sat_out(v_hunt.id, pm.user_id, pm.slot);",
    repl: "  select count(*) into v_live from public.party_member pm\n   where pm.party_id = p_party and pm.left_at is null;" },
  { name: 'rejoinBackward', fn: SETTLE, why: 'a rejoin moves a mark BACK to the window (double pay)', expect: /D5/,
    find: '       or v_st.accrued_to > p_window_to then\n      continue;', repl: '       then\n      continue;' },
  { name: 'rejoinWhileAway', fn: SETTLE, why: 'a member is rejoined before their own path priced them', expect: /D4/,
    find: "       or v_st.accrued_to <= coalesce(v_so.drop_mark, '-infinity'::timestamptz)\n", repl: '' },
  { name: 'noClamp', fn: SETTLE, why: 'drop/rejoin is unclamped', expect: /D6/,
    find: '  c_max_drops_day constant int := 3;', repl: '  c_max_drops_day constant int := 1000;' },
  { name: 'noLeaseExpiry', fn: SETTLE, why: 'a solo lease survives the rejoin', expect: /D5/,
    find: "       set lease_until = now() - interval '1 hour', updated_at = now()", repl: '       set updated_at = now()' },
  { name: 'rejoinHeals', fn: SETTLE, why: 'a rejoin resets recovery/falls (a free heal)', expect: /D5/,
    find: '       set accrued_to = p_window_to, version = version + 1, updated_at = now()',
    repl: '       set accrued_to = p_window_to, version = version + 1, updated_at = now(), hp = max_hp, consec_falls = 0, recovering_until = null' },
  { name: 'noBackstop', fn: SETTLE, why: 'the (8c) window backstop is gone', expect: /D11/,
    find: "    if v_cap_ms <= 0\n       or v_st.accrued_to < greatest(now(), p_window_to) - v_cap_ms * interval '1 millisecond' then",
    repl: '    if v_cap_ms <= 0 then' },
  { name: 'rosterHasSatOut', fn: ROSTER, why: 'the roster hands the driver the dropped member', expect: /D2/,
    find: "           where pm.party_id = t.p_id and pm.left_at is null\n             and not public.hr_party_sat_out(t.h_id, pm.user_id, pm.slot)),",
    repl: '           where pm.party_id = t.p_id and pm.left_at is null),' },
  { name: 'partiedIgnoresSatOut', fn: PARTIED, why: 'a dropped member is still partied (no solo door)', expect: /D1/,
    find: '       and not public.hr_party_sat_out(h.id, m.user_id, m.slot));', repl: '       );' },
];

console.log('\nworld-tick-party-drop --mutate: every mutant must go RED on its named arm');
/* ONE boot, then per mutant: install the broken body, run the arms on fresh
   fixtures, re-install the file's own body. The unmutated control runs first
   and last on the same chain, so a mutant that is red only because the chain
   is cannot be mistaken for a catch. */
let db;
try { db = await boot(); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const control = await arms(db, { log: false });
if (control.length) { console.error(`harness: the unmutated control is red (${control.join(', ')})`); process.exit(2); }
let survived = 0;
for (const m of MUTANTS) {
  if (m.fn.split(m.find).length !== 2) { console.error(`harness: ${m.name}: anchor matched ${m.fn.split(m.find).length - 1}x`); process.exit(2); }
  try { await db.exec(m.fn.replace(m.find, () => m.repl)); } catch (e) {
    console.error(`harness: ${m.name}: ${e.message}`); process.exit(2);
  }
  let red;
  try { red = await arms(db, { log: false }); } catch (e) { red = [`threw: ${e.message}`]; }
  try { await db.exec('rollback;'); } catch { /* not inside a transaction */ }
  await db.exec(m.fn);
  const hit = red.some((id) => m.expect.test(id));
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${red.join(', ')}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${red.length ? `red only via ${red.join(', ')}` : 'SURVIVED'}`); }
}
const after = await arms(db, { log: false });
if (after.length) { console.error(`harness: the restored bodies are red (${after.join(', ')})`); process.exit(2); }
await db.close();
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
