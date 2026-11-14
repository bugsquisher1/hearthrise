#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-carry-race.mjs — CARRY IN ON A REAL POSTGRESQL 17, TWO CONNECTIONS AT ONCE.
//
//   node tests/hunt-carry-race.mjs                the proof; exit 0 = no unit duplicated, none lost
//   node tests/hunt-carry-race.mjs --only=R3,R5a  those races
//   node tests/hunt-carry-race.mjs --mutate       every planted defect must go red
//
// WHY THIS IS NOT IN tests/hunt-sessions-settle.mjs. PGlite is ONE backend: its CARRY-IN arm plays each ORDER the locks
// admit, one after the other, and so can never show that the locks admit only those orders. This file runs the same
// chain, the same fixture and the real engine on a local PostgreSQL 17 cluster (tools/pg-replay.mjs, the production major
// version), a separate backend per actor, and it does not hope for an overlap, it makes one: a GATE connection holds the
// hero's character lock while the actors start, the watcher sees each actor's backend parked on a real Lock wait
// (pg_stat_activity, pg_blocking_pids), then the gate lets go and Postgres decides. PostgreSQL grants an advisory lock's
// queue first come, first served, so the order the actors parked in is the order they run; each race's answers
// prove which order it got. A client press goes as PostgREST sends it: one transaction, `authenticated`, the claim local.
//
//   R1   two presses at once, two keys, a NEW line: both land, the units add up, two matched pairs
//   R2   two presses at once, two keys, stock for one: one lands, the other insufficient_item with the true stack
//   R3   one key at once (a double press): one move, one matched pair, both answers the same
//   R5a  a press and a settle spending that supply, the browser closed (the tick's door), the press first
//   R5b  the same, the settle first
//   R5c  the hunt viewed (the player's door, its commit building the viewer's envelope), the press first
//   R5d  the same, the settle first
//   R6a  a settle spending the LAST of the line, the press first
//   R6b  the same, the settle first
//   R7a  a press and the settle that ENDS the hunt, the press first (the close gives it back whole)
//   R7b  the same, the settle first (no_hunt, nothing moved)
//   R8   a press and a Leave at once
//   R9   a press and a Storage deposit of one stack at once: one lands
//   R10  a party's settle (the instance lock, then each hero) with a press on each hero: no deadlock, both conserve
//   R11  the storm: every round a real settle, three presses (one a replayed key) and a Storage move, all at once
//
// THE BOOK, after every race, for the hero and item: backpack + Storage + hunt bag + eaten = what the hero began with;
// journal's bag side - eaten = the hunt bag (tests/hunt-sessions-db.mjs B1); journal's inventory side = the backpack's move;
// every carry's pair matched (one +qty, one -qty).
//
// CI: smoke.yml's pg17 job, plain + --mutate (.github/actions/postgres-17, since 2026-11-14). Never touches production or the
// machine's own PostgreSQL service: it starts tools/pg-replay.mjs's scratch cluster. Env: HR_PG_PORT, HR_PG_DATA, HR_PG_BIN;
// HR_PG_TEMPLATE = an existing chain database to clone, this lane's files applied over it, instead of the build
// of the whole chain (45 s on a GitHub runner, measured 2026-11-14). Exit: 0 green (--mutate: every mutant caught) · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootPg, attachPg } from '../tools/pg-replay.mjs';
import { HARNESS as H } from './hunt-sessions-settle.mjs';

const MUTATE = process.argv.includes('--mutate');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const TEMPLATE = process.env.HR_PG_TEMPLATE || undefined;
const LANE_FILES = ['2027-02-21-rune-spells.generated.sql', '2027-02-21-hunt-carry-in.sql'];
const UID = H.UIDS[0];
const FROM = Date.UTC(2026, 9, 29, 12, 0, 0);
const SHRIMP = 'cooked_shrimp';
const eat = (id) => ({ action: { type: 'consume', id }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 99 }], join: 'and' });
const HERO = { fromMs: FROM, level: 10, hp: 20, gold: 100000, inv: { [SHRIMP]: 100 }, bag: [],
  options: { supply_source: 'mine', on_empty: 'switch', gold_floor: 0, slots: [eat(SHRIMP), eat('salted_shrimp')] } };
const idem = () => crypto.randomUUID();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A --mutate defect, planted in every world built while it is set. */
let PLANT = null;

/* ── THE WORLD: a fresh database, a hero hunting, one connection per actor ── */
async function world(M, hero) {
  const { db, name } = await bootPg({ template: TEMPLATE, log: (s) => console.log(s) });
  const conns = [];
  const open = async (label) => {
    const c = await attachPg(name);
    c.label = label;
    c.pid = (await c.query('select pg_backend_pid() as p')).rows[0].p;
    conns.push(c);
    return c;
  };
  const w = { db, name, conns, problems: [], notes: [] };
  /* a chain template older than this lane's last edit: its files over the clone (their §0 accepts the images they replace) */
  if (TEMPLATE) for (const f of LANE_FILES) await db.exec(readFileSync(join(H.ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n'));
  await H.pinDice(db);
  if (PLANT) await PLANT(db);
  w.gate = await open('gate'); w.watch = await open('watch'); w.A = await open('A'); w.B = await open('B'); w.C = await open('C'); w.S = await open('settle');
  w.pin = async (ms) => { for (const c of [db, ...conns]) await c.query(`select set_config('hr.test_now', $1, false)`, [new Date(ms).toISOString()]); };
  await w.pin(FROM);
  await db.query('begin');
  w.h = await H.hunter(db, M, hero);
  await db.query('commit');
  w.close = async () => { for (const c of conns) await c.close(); await db.close(); };
  return w;
}

/* One client intent, as PostgREST sends it: its own transaction, `authenticated`, the claim local to it. */
async function asClient(c, uid, sql, params) {
  await c.exec('begin');
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await c.exec('set local role authenticated');
    const r = await c.query(sql, params);
    await c.exec('commit');
    return Object.values(r.rows[0])[0];
  } catch (e) { await c.exec('rollback').catch(() => {}); throw e; }
}
const carry = (c, qty, key = idem(), uid = UID, item = SHRIMP) => asClient(c, uid, 'select public.hr_hunt_restock(0, $1::text, $2::bigint, $3::uuid) r', [item, qty, key]);
const deposit = (c, qty, dir = 'deposit', uid = UID) => asClient(c, uid, 'select public.hr_bank_move(0, $1::text, $2::bigint, $3::text, $4::uuid) r', [SHRIMP, qty, dir, idem()]);
const leave = (c, uid = UID) => asClient(c, uid, 'select public.hr_hunt_leave(0, $1::uuid) r', [idem()]);

/* THE GATE: holds the hero's character lock in an open transaction, both of hr_hunt_lock's first two steps: the advisory
   key (the hunt verbs and the settle queue here) and the player_state row (the bag verbs, hr_bank_move, queue here). */
async function holdGate(w, uid = UID) {
  await w.gate.exec('begin');
  await w.gate.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [uid + ':0']);
  await w.gate.query('select 1 from public.player_state where user_id = $1 and slot = 0 for update', [uid]);
  return () => w.gate.exec('commit');
}
/* The actor's backend is parked on a real lock; the evidence is what Postgres says, not a sleep. A second hunt verb of one
   account may park on the `hunt` rate bucket's row (`transactionid`) the first holds to its commit: every hunt verb's order. */
async function parked(w, c, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    const r = (await w.watch.query(`select wait_event_type t, wait_event e, pg_blocking_pids(pid) b from pg_stat_activity where pid = $1`, [c.pid])).rows[0];
    if (r && r.t === 'Lock') return `${c.label} (pid ${c.pid}) waits on ${r.e}, blocked by ${JSON.stringify(r.b)}`;
    if (Date.now() - t0 > ms) { w.problems.push(`CONTROL: ${c.label} never parked on a lock (last ${JSON.stringify(r)}): it did not wait for the character lock`); return null; }
    await sleep(5);
  }
}
/* Start the actors in this order, each parked before the next starts, then let go. */
async function race(w, actors, uid = UID) {
  const open = await holdGate(w, uid);
  const running = [];
  for (const [c, fn] of actors) {
    running.push(fn(c).then((v) => v, (e) => ({ threw: String(e && e.message).split('\n')[0], code: e && e.code })));
    w.notes.push(await parked(w, c));
  }
  await open();
  return Promise.all(running);
}

/* A settle's first two thirds on the settle connection (read, engine), its commit left to race. `viewed`: the player's door. */
async function proposal(w, M, toMs, uid = UID, viewed = false) {
  await w.pin(toMs);
  const exec = H.makeExec(w.S);
  const door = viewed ? { mode: 'settle', bucket: null, project: true, live: true } : {};
  const plan = await M.HS.readHuntSettle({ exec, user: uid, slot: 0, grounds: H.groundsOf(M), atMs: toMs, ...door }, viewed ? 'settle' : 'tick');
  if (plan.answer) throw new Error('read answered ' + JSON.stringify(plan.answer));
  const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
  if (!p.out.accrued) throw new Error('propose answered ' + JSON.stringify(p.out).slice(0, 200));
  return { commit: (c) => M.HS.commitHuntSettle(H.makeExec(c), { ...p.commit, project: viewed ? { user: uid, slot: 0 } : null }), uses: Number((p.commit.members.find((m) => m.user === uid).hunt.uses || {})[SHRIMP] || 0), raw: p };
}
const settle = async (w, M, toMs) => { const p = await proposal(w, M, toMs); const res = await p.commit(w.S); if (!res || res.ok !== true) w.problems.push(`CONTROL: the settle to +${toMs - FROM} answered ${JSON.stringify(res).slice(0, 200)}`); return p; };

/* ── THE BOOK ── */
const row = async (db, sql, params) => (await db.query(sql, params)).rows[0];
async function book(db, sid, uid = UID, item = SHRIMP) {
  return row(db, `select
      coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $3), 0)::bigint held,
      coalesce((select qty from public.account_bank where user_id = $1 and item_id = $3), 0)::bigint bank,
      coalesce((select qty_left from public.hunt_bag where session_id = $2 and item_id = $3), 0)::bigint left_,
      coalesce((select qty_loaded from public.hunt_bag where session_id = $2 and item_id = $3), 0)::bigint loaded,
      coalesce((select sum((l.meta->'items'->>$3)::bigint) from public.player_ledger l where l.session_id = $2 and l.intent = 'supply_own'), 0)::bigint eaten,
      coalesce((select sum(l.qty) from public.player_ledger l where l.session_id = $2 and l.kind = 'hunt' and l.meta->>'side' = 'bag' and l.item_id = $3), 0)::bigint bag_side,
      coalesce((select sum(l.qty) from public.player_ledger l where l.user_id = $1 and l.slot = 0 and l.kind = 'hunt' and l.meta->>'side' = 'inventory' and l.item_id = $3), 0)::bigint inv_side,
      (select count(*) from public.player_ledger l where l.user_id = $1 and l.slot = 0 and l.intent = 'hunt_pack' and l.item_id = $3 and l.meta->>'side' = 'bag')::int bag_rows,
      (select count(*) from public.player_ledger l where l.user_id = $1 and l.slot = 0 and l.intent = 'hunt_pack' and l.item_id = $3 and l.meta->>'side' = 'inventory')::int inv_rows`, [uid, sid, item]);
}
/* What every race must leave: `start` units on the hero, nothing made, nothing lost, the journal agreeing. */
async function audit(w, sid, start, label, uid = UID) {
  const b = await book(w.db, sid, uid);
  const num = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Number(v)]));
  const say = JSON.stringify(num);
  if (num.held + num.bank + num.left_ + num.eaten !== start) w.problems.push(`${label}: UNITS: backpack ${num.held} + Storage ${num.bank} + hunt bag ${num.left_} + eaten ${num.eaten} <> the ${start} it began with ${say}`);
  if (num.bag_side - num.eaten !== num.left_) w.problems.push(`${label}: the journal's bag side less eaten <> the hunt bag ${say}`);
  if (num.bag_rows !== num.inv_rows) w.problems.push(`${label}: hunt_pack rows are not matched pairs ${say}`);
  return num;
}
const ok = (r) => r && r.ok === true;

/* ── THE RACES ── */
const RACES = {
  async R1(M) {
    const w = await world(M, HERO);
    const [a, b] = await race(w, [[w.A, (c) => carry(c, 30)], [w.B, (c) => carry(c, 40)]]);
    if (!ok(a) || !ok(b)) w.problems.push(`two keys answered ${JSON.stringify([a, b])}`);
    const n = await audit(w, w.h.sid, 100, 'R1');
    if (n.loaded !== 70 || n.left_ !== 70 || n.held !== 30 || n.bag_rows !== 2) w.problems.push(`R1: two carries of 30 and 40 left ${JSON.stringify(n)}`);
    if (a.left !== 30 || b.left !== 70) w.problems.push(`R1: the second press did not read the first's line: ${a.left} then ${b.left}`);
    w.notes.push(`answers: left ${a.left} then ${b.left}; book ${JSON.stringify(n)}`);
    return w;
  },
  async R2(M) {
    const w = await world(M, { ...HERO, inv: { [SHRIMP]: 10 } });
    const [a, b] = await race(w, [[w.A, (c) => carry(c, 7)], [w.B, (c) => carry(c, 7)]]);
    const landed = [a, b].filter(ok);
    const refused = [a, b].filter((r) => r && r.error === 'insufficient_item');
    if (landed.length !== 1 || refused.length !== 1 || refused[0].have !== 3 || refused[0].need !== 7) w.problems.push(`stock for one answered ${JSON.stringify([a, b])}`);
    const n = await audit(w, w.h.sid, 10, 'R2');
    if (n.left_ !== 7 || n.held !== 3 || n.bag_rows !== 1) w.problems.push(`R2: left ${JSON.stringify(n)}`);
    w.notes.push(`answers: ${JSON.stringify([a, b])}`);
    return w;
  },
  async R3(M) {
    const w = await world(M, HERO);
    const key = idem();
    const [a, b] = await race(w, [[w.A, (c) => carry(c, 5, key)], [w.B, (c) => carry(c, 5, key)]]);
    if (!ok(a) || !ok(b) || H.canon(a) !== H.canon(b)) w.problems.push(`one key twice answered ${JSON.stringify([a, b])}`);
    const n = await audit(w, w.h.sid, 100, 'R3');
    if (n.left_ !== 5 || n.held !== 95 || n.bag_rows !== 1) w.problems.push(`R3: ONE KEY MOVED TWICE: ${JSON.stringify(n)}`);
    w.notes.push(`answers equal: ${H.canon(a) === H.canon(b)}; book ${JSON.stringify(n)}`);
    return w;
  },
  R5a: (M) => pressAndSettle(M, 'press', 30, 'R5a'),
  R5b: (M) => pressAndSettle(M, 'settle', 30, 'R5b'),
  R5c: (M) => pressAndSettle(M, 'press', 30, 'R5c', true),
  R5d: (M) => pressAndSettle(M, 'settle', 30, 'R5d', true),
  R6a: (M) => pressAndSettle(M, 'press', 2, 'R6a'),
  R6b: (M) => pressAndSettle(M, 'settle', 2, 'R6b'),
  R7a: (M) => pressAndEnd(M, 'press', 'R7a'),
  R7b: (M) => pressAndEnd(M, 'settle', 'R7b'),
  async R8(M) {
    const w = await world(M, { ...HERO, bag: [{ item: SHRIMP, qty: 10 }] });
    await settle(w, M, FROM + 10000);
    await w.pin(FROM + 12000);
    const [a, b] = await race(w, [[w.A, (c) => carry(c, 20)], [w.B, (c) => leave(c)]]);
    if (!ok(a) || !ok(b)) w.problems.push(`a press and a Leave answered ${JSON.stringify([a, b]).slice(0, 300)}`);
    await audit(w, w.h.sid, 100, 'R8 (pending)');
    /* the Leave's own close, whenever it lands: the carried units come home with the packed ones */
    for (let t = 20000; t <= 120000; t += 10000) {
      const open = (await row(w.db, 'select ended_at is null o from public.hunt_sessions where id = $1', [w.h.sid])).o;
      if (!open) break;
      await settle(w, M, FROM + t);
    }
    const n = await audit(w, w.h.sid, 100, 'R8');
    const s = await row(w.db, 'select end_reason r from public.hunt_sessions where id = $1', [w.h.sid]);
    if (s.r !== 'left' || n.left_ !== 0 || n.held + n.eaten !== 100) w.problems.push(`R8: the hunt ended ${s.r} with ${JSON.stringify(n)}`);
    w.notes.push(`carry left ${a.left}; hunt ended ${s.r}; book ${JSON.stringify(n)}`);
    return w;
  },
  async R9(M) {
    const w = await world(M, { ...HERO, inv: { [SHRIMP]: 10 } });
    await settle(w, M, FROM + 10000);
    await w.pin(FROM + 12000);
    const [a, b] = await race(w, [[w.A, (c) => carry(c, 8)], [w.B, (c) => deposit(c, 8)]]);
    const landed = [a, b].filter(ok);
    if (landed.length !== 1 || [a, b].filter((r) => r && r.error === 'insufficient_item').length !== 1) w.problems.push(`one stack, two movers answered ${JSON.stringify([a, b]).slice(0, 400)}`);
    const n = await audit(w, w.h.sid, 10, 'R9');
    if (n.held !== 2 || n.left_ + n.bank !== 8) w.problems.push(`R9: left ${JSON.stringify(n)}`);
    w.notes.push(`carry ${ok(a) ? 'landed' : a.error}, deposit ${ok(b) ? 'landed' : b && b.error}; book ${JSON.stringify(n)}`);
    return w;
  },
  async R10(M) {
    const w = await world(M, { fromMs: FROM, party: [{ ...HERO, bag: [{ item: SHRIMP, qty: 20 }] }, { ...HERO, bag: [{ item: SHRIMP, qty: 20 }] }] });
    await settle(w, M, FROM + 10000);
    const p = await proposal(w, M, FROM + 20000);
    const [u0, u1] = H.UIDS;
    /* the settle holds the instance, takes hero 0, parks on hero 1's lock (the gate holds it); each hero's press queues behind */
    const open = await holdGate(w, u1);
    const running = [p.commit(w.S).then((v) => v, (e) => ({ threw: String(e.message).split('\n')[0], code: e.code }))];
    w.notes.push(await parked(w, w.S));
    const press0 = carry(w.A, 15, idem(), u0).then((v) => v, (e) => ({ threw: String(e.message).split('\n')[0], code: e.code }));
    w.notes.push(await parked(w, w.A));
    const press1 = carry(w.B, 25, idem(), u1).then((v) => v, (e) => ({ threw: String(e.message).split('\n')[0], code: e.code }));
    w.notes.push(await parked(w, w.B));
    await open();
    const [res, a, b] = await Promise.all([running[0], press0, press1]);
    if (!res || res.ok !== true) w.problems.push(`R10: the party's settle answered ${JSON.stringify(res).slice(0, 300)}`);
    if (!ok(a) || !ok(b)) w.problems.push(`R10: the presses answered ${JSON.stringify([a, b]).slice(0, 300)}`);
    for (const [i, u] of [u0, u1].entries()) {
      const sid = w.h.sids[i];
      const n = await audit(w, sid, 100, `R10 hero ${i}`, u);
      if (n.loaded !== 20 + (i ? 25 : 15)) w.problems.push(`R10 hero ${i}: ${JSON.stringify(n)}`);
      w.notes.push(`hero ${i} book ${JSON.stringify(n)}`);
    }
    return w;
  },
  async R11(M) {
    const START = 2000;
    const w = await world(M, { ...HERO, inv: { [SHRIMP]: START }, bag: [{ item: SHRIMP, qty: 50 }] });
    const ROUNDS = 24;
    const landed = new Map();
    const refused = {}; let moved = 0; let lastKey = null; let lastQty = 0;
    const note = (r, key, qty) => {
      if (r && r.threw) w.problems.push(`R11: a press threw ${r.threw} (${r.code})`);
      else if (ok(r)) { if (!landed.has(key)) landed.set(key, qty); else if (landed.get(key) !== qty) w.problems.push('R11: a replay answered another qty'); } else { const e = (r && r.error) || 'none'; refused[e] = (refused[e] || 0) + 1; }
    };
    const guard = (p) => p.then((v) => v, (e) => ({ threw: String(e.message).split('\n')[0], code: e.code }));
    for (let i = 1; i <= ROUNDS; i++) {
      const p = await proposal(w, M, FROM + i * 10000);
      const ka = idem(); const kb = idem();
      const qa = 1 + (i * 7) % 11; const qb = 1 + (i * 13) % 17;
      /* a settle, two new presses, a replay of the last round's key, a Storage move: all on the wire together, unparked */
      const [res, a, b, again, bank] = await Promise.all([
        guard(p.commit(w.S)), guard(carry(w.A, qa, ka)), guard(carry(w.B, qb, kb)),
        guard(lastKey ? carry(w.C, lastQty, lastKey) : Promise.resolve(null)),
        guard(i % 3 === 0 ? deposit(w.gate, 3) : Promise.resolve(null)),
      ]);
      if (!res || res.ok !== true) w.problems.push(`R11 round ${i}: the settle answered ${JSON.stringify(res).slice(0, 240)}`);
      note(a, ka, qa); note(b, kb, qb);
      if (lastKey && again && again.threw) w.problems.push(`R11: a replay threw ${again.threw}`);
      if (lastKey && ok(again) && !landed.has(lastKey)) w.problems.push('R11: a replay of a refused key moved the stack');
      if (bank && bank.threw) w.problems.push(`R11: a Storage move threw ${bank.threw}`);
      if (ok(bank)) moved += 3;
      lastKey = ka; lastQty = qa;
      await audit(w, w.h.sid, START, `R11 round ${i}`);
      /* the storm is faster than the real minute the `hunt` bucket counts: a press must reach the locks, not the limiter */
      await w.db.exec('delete from public.hr_rate_counters');
    }
    /* home: everything that was carried and not eaten comes back */
    await settle(w, M, FROM + (ROUNDS + 1) * 10000);
    await w.pin(FROM + (ROUNDS + 1) * 10000 + 15000);
    const lv = await leave(w.A);
    if (!ok(lv)) w.problems.push(`R11: the Leave answered ${JSON.stringify(lv).slice(0, 200)}`);
    for (let t = ROUNDS + 2; t <= ROUNDS + 20; t++) {
      if (!(await row(w.db, 'select ended_at is null o from public.hunt_sessions where id = $1', [w.h.sid])).o) break;
      await settle(w, M, FROM + t * 10000);
    }
    const n = await audit(w, w.h.sid, START, 'R11 at home');
    const want = [...landed.values()].reduce((x, y) => x + y, 50);
    if (n.loaded !== want) w.problems.push(`R11: the line loaded ${n.loaded}, the landed keys say ${want}`);
    if (n.left_ !== 0) w.problems.push(`R11: ${n.left_} units still in an ended hunt`);
    if (n.bank !== moved) w.problems.push(`R11: Storage holds ${n.bank}, the answers say ${moved}`);
    if (!(n.eaten > 0)) w.problems.push('R11: CONTROL: nothing was eaten, so no settle raced a press over stock');
    if (!(landed.size > 10)) w.problems.push(`R11: CONTROL: only ${landed.size} presses landed`);
    w.notes.push(`${ROUNDS} rounds: ${landed.size} presses landed, refused ${JSON.stringify(refused)}, Storage ${moved}; book ${JSON.stringify(n)}`);
    return w;
  },
};

/* A PRESS AND A SETTLE THAT SPENDS THE SAME SUPPLY. The engine read the line at `packed`, spends U of it; the press adds 25. */
async function pressAndSettle(M, first, packed, label, viewed = false) {
  const w = await world(M, { ...HERO, bag: [{ item: SHRIMP, qty: packed }] });
  const p = await proposal(w, M, FROM + 20000, UID, viewed);
  if (!(p.uses > 0)) w.problems.push(`${label}: CONTROL: the window spends none of the shrimp`);
  if (packed <= 2 && p.uses !== packed) w.problems.push(`${label}: CONTROL: the window spends ${p.uses} of ${packed}, not the last of the line`);
  const actors = [[w.A, (c) => carry(c, 25)], [w.S, (c) => p.commit(c)]];
  const [a, res] = first === 'press' ? await race(w, actors) : (await race(w, actors.slice().reverse())).reverse();
  if (!ok(a)) w.problems.push(`${label}: the press answered ${JSON.stringify(a).slice(0, 240)}`);
  if (!res || res.ok !== true) w.problems.push(`${label}: the settle answered ${JSON.stringify(res).slice(0, 300)} (a press must cost it no retry)`);
  if (viewed && !(res && res.state && res.state.ok !== false)) w.problems.push(`${label}: CONTROL: the viewed settle built no envelope: ${JSON.stringify(res).slice(0, 200)}`);
  const n = await audit(w, w.h.sid, 100, label);
  if (n.left_ !== packed + 25 - p.uses) w.problems.push(`${label}: the line is ${n.left_}, want read ${packed} + carried 25 - used ${p.uses}`);
  /* which order ran, from the press's own answer: it saw the debit, or it did not */
  const saw = first === 'press' ? packed + 25 : packed - p.uses + 25;
  if (a && a.left !== saw) w.problems.push(`${label}: CONTROL: the ${first} did not run first (the press read ${a.left}, want ${saw})`);
  /* the next windows spend the carried units, before the store (a window with no blow taken eats nothing: several) */
  const mark = Number((await row(w.db, 'select coalesce(max(id), 0)::bigint m from public.player_ledger')).m);
  const before = n.left_;
  for (const t of [40000, 60000, 80000, 100000]) { await settle(w, M, FROM + t); await audit(w, w.h.sid, 100, `${label} at +${t} ms`); }
  const n2 = await audit(w, w.h.sid, 100, `${label} next windows`);
  if (!(n2.left_ < before)) w.problems.push(`${label}: the next windows spent none of the ${before} carried (${JSON.stringify(n2)})`);
  const bought = Number((await row(w.db, `select count(*)::int c from public.player_ledger where session_id = $1 and intent = 'supply_buy' and id > $2 and meta->'items' ? 'salted_shrimp'`, [w.h.sid, mark])).c);
  if (n2.left_ > 0 && bought) w.problems.push(`${label}: the store sold food while ${n2.left_} carried shrimp were left`);
  w.notes.push(`the press read ${a && a.left} (read ${packed}, window used ${p.uses}); line after ${n.left_}, after the next windows ${n2.left_}`);
  return w;
}

/* A PRESS AND THE SETTLE THAT ENDS THE HUNT (its stamina runs out in the window). */
async function pressAndEnd(M, first, label) {
  const w = await world(M, { ...HERO, stamina: 25000 });
  await settle(w, M, FROM + 10000);
  const p = await proposal(w, M, FROM + 30000);
  const actors = [[w.A, (c) => carry(c, 25)], [w.S, (c) => p.commit(c)]];
  const [a, res] = first === 'press' ? await race(w, actors) : (await race(w, actors.slice().reverse())).reverse();
  if (!res || res.ok !== true) w.problems.push(`${label}: the settle answered ${JSON.stringify(res).slice(0, 300)}`);
  const s = await row(w.db, 'select end_reason r from public.hunt_sessions where id = $1', [w.h.sid]);
  if (s.r !== 'stamina') w.problems.push(`${label}: CONTROL: the window ended ${s.r}, not stamina`);
  if (first === 'press' ? !ok(a) : (!a || a.error !== 'no_hunt')) w.problems.push(`${label}: the press answered ${JSON.stringify(a).slice(0, 240)}`);
  const n = await audit(w, w.h.sid, 100, label);
  if (n.left_ !== 0 || n.held !== 100 - n.eaten) w.problems.push(`${label}: the ended hunt left ${JSON.stringify(n)}`);
  if (first === 'press' && n.loaded !== 25) w.problems.push(`${label}: the press landed but the line loaded ${n.loaded}`);
  if (first !== 'press' && n.loaded !== 0) w.problems.push(`${label}: a refused press loaded ${n.loaded}`);
  w.notes.push(`press: ${ok(a) ? 'landed, ' + a.left + ' left' : a && a.error}; hunt ended ${s.r}; book ${JSON.stringify(n)}`);
  return w;
}

/* ── MUTANTS: a defect planted in the body each race then runs on. Each must go red, on a named problem. ── */
const RESTOCK = 'public.hr_hunt_restock(integer,text,bigint,uuid)';
const patch = (find, to) => async (db) => {
  const def = String((await db.query('select pg_get_functiondef($1::regprocedure) d', [RESTOCK])).rows[0].d).split(String.fromCharCode(13)).join('');
  if (def.split(find).length !== 2) throw new Error(`mutant anchor not found exactly once: ${find.slice(0, 60)}`);
  await db.exec(def.replace(find, () => to));
};
/* The body live today: the key replayed BEFORE any lock, so a double press moves the stack twice. */
const liveBody = async (db) => {
  const src = readFileSync(join(H.ROOT, 'supabase', 'migrations', '2026-10-21-hunt-sessions.sql'), 'utf8').replace(/\r\n/g, '\n');
  const at = src.indexOf('create or replace function public.hr_hunt_restock(p_slot int');
  const stop = src.indexOf('end $$;', at) + 'end $$;'.length;
  await db.exec(src.slice(at, stop));
};
const noLock = patch('  v_s := public.hr_hunt_lock(v_uid, p_slot);',
  '  select * into v_s from public.hunt_sessions where user_id = v_uid and slot = p_slot and ended_at is null;');
const MUTANTS = [
  { name: 'the live body (2026-10-21): the key is replayed before any lock', plant: liveBody, races: ['R3'], want: /ONE KEY MOVED TWICE/ },
  /* without the lock a press runs past a settle that holds it: the row locks still add up, but the end's close no longer has the last word */
  { name: 'the press takes no character lock', plant: noLock, races: ['R7b'], want: /the press answered/ },
  { name: 'the press overwrites the line it adds to', plant: patch('qty_left = qty_left + p_qty', 'qty_left = p_qty'), races: ['R5a'], want: /UNITS/ },
  { name: 'the press never takes the units out of the backpack', plant: patch('update public.player_inventory set qty = qty - p_qty where user_id = v_uid and slot = p_slot and item_id = p_item;', 'perform 1;'), races: ['R1'], want: /UNITS/ },
];

async function runOne(M, name) {
  const t0 = Date.now();
  let w;
  try { w = await RACES[name](M); }
  catch (e) { return { name, problems: [`HARNESS: ${String(e && e.stack || e).slice(0, 600)}`], notes: [], ms: Date.now() - t0 }; }
  const res = { name, problems: w.problems, notes: w.notes.filter(Boolean), ms: Date.now() - t0 };
  await w.close();
  return res;
}

async function main() {
  const M = await H.loadEdge(H.ROOT);
  const { db, name: probe } = await bootPg({ template: TEMPLATE, log: (m) => console.log(m) });
  console.log(`hunt-carry-race on ${String((await db.query('select version() v')).rows[0].v).split(',')[0]} (clones of ${probe.slice(0, 4)}…)`);
  await db.close();
  if (MUTATE) {
    let bad = 0;
    for (const m of MUTANTS) {
      for (const name of m.races) {
        PLANT = m.plant;
        const res = await runOne(M, name);
        PLANT = null;
        const hit = res.problems.some((p) => m.want.test(p));
        if (hit) console.log(`✓ ${name} goes red on: ${m.name}  (${res.problems.find((p) => m.want.test(p)).slice(0, 160)})`);
        else { bad++; console.error(`✗ ${name} stayed green on: ${m.name}  ${JSON.stringify(res.problems).slice(0, 400)}`); }
      }
    }
    console.log(bad ? `hunt-carry-race --mutate: ${bad} mutant(s) survived` : `hunt-carry-race --mutate: all ${MUTANTS.length} mutants killed`);
    process.exit(bad ? 1 : 0);
  }
  let red = 0; let total = 0;
  for (const name of Object.keys(RACES)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    total++;
    const res = await runOne(M, name);
    const line = `${name} (${(res.ms / 1000).toFixed(1)} s)`;
    if (res.problems.length) { red++; console.error(`✗ ${line}`); for (const p of res.problems) console.error(`    ${p}`); }
    else console.log(`✓ ${line}`);
    for (const n of res.notes) console.log(`    ${n}`);
  }
  console.log(red ? `hunt-carry-race: ${red} of ${total} races red` : `hunt-carry-race: all ${total} races green, no unit duplicated or lost`);
  process.exit(red ? 1 : 0);
}

main().catch((e) => { console.error(`HARNESS: ${e && e.stack || e}`); process.exit(2); });
