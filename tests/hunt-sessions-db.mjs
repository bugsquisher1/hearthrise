#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-sessions-db.mjs — HUNT SESSIONS, THE DATABASE HALF (lane C1,
// ruling HR-2026-10-14). Drives the real chain on PGlite.
//
//   node tests/hunt-sessions-db.mjs            the guard
//   node tests/hunt-sessions-db.mjs --mutate   every planted defect must be CAUGHT
//
// ARMS (each in its own transaction, rolled back)
//   G1  the generated catalogue matches src/data (gen-hunt-sessions --check) and
//       the table CHECK lists equal the data: hunt_sessions.end_reason AS
//       INSTALLED ON THE CHAIN (the C2 catalogue regenerates it; 'vigour' left
//       it 2026-10-14) = END_ORDER, and the event types = EVENT_COPY
//   K1  THE KILL SWITCH SHIPS OFF: C1 seeds hr_hunt_config.enabled = false, only
//       lane C2's arm file turns it on, and a paused enter opens nothing
//       (Security GO-WITH-CHANGES item 1)
//   R1  A SETTLE REFUSAL RAISES: a real hr_apply under the session GUC, then a
//       stale settle, in one statement — the ledger row and the version bump
//       hr_apply made are rolled back with it (Security item 2)
//   B1  BAG CONSERVATION: across pack, settle, restock, change and leave, the bag
//       side of the journal equals the bag per (session, item), every pair
//       cancels, and inventory + consumed = what the character started with
//   S1  ONE OPEN SESSION: a second enter is `hunt_open`, the partial unique index
//       refuses a second open row, and the pointer guard refuses any other writer
//   F1  FORGED INPUT REFUSED: a qty above stock, a client time in the bag, a
//       fractional qty, a window in the future, a use above what is left — each
//       refused, and nothing moved
//   P1  A PRESS ONLY RE-ORDERS: a press writes no bag / ledger / tally row; a
//       settle can drop a queued press but never add one; a window's heal uses
//       are capped by the cooldown with or without presses queued
//   T1  TALLY = Σ LEDGER over two settles: coins, xp, loot, supplies, kills and
//       deaths equal the session's stamped ledger rows, each row folded once
//   D1  THE DROP on the chain: the combat away columns and functions are
//       gone, last_away_receipt and hr_offline_cap_ms stay (gathering keeps
//       both until lane G — swap then delete), the grant is the flat 720, and
//       a planted reader makes a second apply of the drop file refuse
//   C1  a SECOND apply of the hunt-session files, in chain order (C1's
//       catalogue, C1's file, the C2 forward catalogue that supersedes C1's
//       rows, and C2's settle file, which edits four C1 bodies), is
//       byte-identical (schema inventory, function bodies + ACLs, catalogue rows)
// --mutate plants each defect into the LIVE function body (create or replace,
// rolled back) and requires the arm that owns it to go red; two more defects
// are planted in the migration TEXT and must be refused by its own §8.
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { END_ORDER, EVENT_COPY } from '../src/data/hunt-sessions.js';
import { ACTION_SET_LIMITS } from '../src/data/rule-subjects.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const MIG = '2026-10-21-hunt-sessions.sql';
const CAT = '2026-10-21-hunt-sessions-catalogue.generated.sql';
/* The FORWARD catalogue the generator writes today (lane C2): C1's is applied
   history and is superseded wholesale by this one, later in the chain. */
const { OUT_NAME: CAT_NOW } = await import('../tools/gen-hunt-sessions.mjs');
const SETTLE = '2026-10-22-hunt-sessions-settle.sql';
const MIG_TEXT = readFileSync(join(ROOT, 'supabase', 'migrations', MIG), 'utf8').replace(/\r\n/g, '\n');
const UID = '00000000-0000-4000-8000-0000000c1d01';
/* Lane C2's file that flips the kill switch on; K1 reads which side of it the chain stopped. */
const ARM = '2026-10-22-hunt-sessions-arm.sql';
let chainArmed = JSON.parse(readFileSync(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order.includes(ARM);

/* ── harness ─────────────────────────────────────────────────────────────── */
async function q(db, sql, params) { return (await db.query(sql, params)).rows; }
async function one(db, sql, params) { const r = await q(db, sql, params); return r[0] ? Object.values(r[0])[0] : undefined; }
async function call(db, fn, args) {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  return one(db, `select public.${fn}(${ph}) as r`, args);
}
const idem = () => crypto.randomUUID();

/* A probe character holding 20 Cooked Shrimp and 50 Bronze Arrows, signed in. */
async function probe(db) {
  // The switch ships OFF (Security item 1); every arm opens it inside its own
  // rolled-back transaction. K1 proves the shipped value and the refusal.
  await db.query(`update public.hr_hunt_config set enabled = true where id`);
  await db.query(`insert into auth.users (id) values ($1)`, [UID]);
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [UID]);
  const r = await call(db, 'hr_create_character', [0]);
  if (!r || r.created !== true) throw new Error(`probe character refused: ${JSON.stringify(r)}`);
  await db.query(`delete from public.player_inventory where user_id = $1 and slot = 0`, [UID]);
  await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty)
                  values ($1, 0, 'cooked_shrimp', 20), ($1, 0, 'bronze_arrows', 50)`, [UID]);
}
const inv = (db, item) => one(db, `select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)::int`, [UID, item]);
const bagLeft = (db, sid, item) => one(db, `select coalesce((select qty_left from public.hunt_bag where session_id = $1 and item_id = $2), 0)::int`, [sid, item]);

async function enter(db, bag) {
  return call(db, 'hr_hunt_enter', [0, 'mill_cellar', JSON.stringify(bag), 0, null, null, idem()]);
}
/* Put the session into its hunting phase 9 minutes ago, so a settle window fits. */
async function startHunting(db, sid) {
  await db.query(`update public.hunt_sessions set entered_at = now() - interval '10 minutes',
                    hunt_from = now() - interval '9 minutes', settled_to = now() - interval '9 minutes',
                    next_swing_at = now() - interval '9 minutes' where id = $1`, [sid]);
  return one(db, `select settled_to from public.hunt_sessions where id = $1`, [sid]);
}
/* The engine's own ledger rows, stamped through the GUC exactly as C2 will. */
async function engineRows(db, sid, rows) {
  await db.query(`select set_config('hr.hunt_session', $1, true)`, [sid]);
  for (const r of rows) {
    await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, meta) values ($1, 0, $2, $3, $4, $5)`,
      [UID, r.kind, r.intent, r.gold || 0, JSON.stringify(r.meta || {})]);
  }
  await db.query(`select set_config('hr.hunt_session', '', true)`);
}
const at = (from, s) => new Date(new Date(from).getTime() + s * 1000).toISOString();
/* The applier RAISES every refusal (HR000, message = the code). Read it back as
   {ok:false, error} inside a savepoint so the arm's transaction survives. */
async function settle(db, sid, delta) {
  await db.query('savepoint settle');
  try {
    const r = await call(db, 'hr_hunt_settle_session', [UID, 0, sid, JSON.stringify(delta)]);
    await db.query('release savepoint settle');
    return r;
  } catch (e) {
    await db.query('rollback to savepoint settle');
    return { ok: false, error: String(e.message).split('\n')[0], raised: true };
  }
}

async function inTx(db, fn) {
  await db.query('begin');
  try { return await fn(); } finally { await db.query('rollback'); }
}

/* ── ARMS ────────────────────────────────────────────────────────────────── */
const ARMS = {
  /* K1 — THE SWITCH SHIPS OFF (Security item 1). The chain seeds it false, and
     while it is false hr_hunt_enter / hr_hunt_change open nothing. */
  async K1(db, red) {
    // C1 seeds it false; lane C2's arm file (ordered after the edge deploy) is
    // the ONE writer that turns it on. A chain stopped at C1 must read false,
    // the full chain true.
    const seeded = await one(db, `select enabled from public.hr_hunt_config where id`);
    if (seeded !== chainArmed) red.push(`K1: hr_hunt_config reads enabled=${seeded} on a chain ${chainArmed ? 'through' : 'stopped before'} ${ARM} (want ${chainArmed})`);
    await probe(db);
    await db.query(`update public.hr_hunt_config set enabled = false where id`);
    const e = await enter(db, [{ item: 'cooked_shrimp', qty: 5 }]);
    if (e?.error !== 'hunts_paused') red.push(`K1: an enter while paused answered ${JSON.stringify(e)}`);
    const n = await one(db, `select count(*)::int from public.hunt_sessions where user_id = $1`, [UID]);
    if (n !== 0 || await inv(db, 'cooked_shrimp') !== 20) red.push('K1: a paused enter opened a session or moved the bag');
  },

  /* R1 — A REFUSAL AFTER hr_apply LEAVES NO VALUE (Security item 2). One
     statement does what C2's settle transaction does: a real hr_apply under the
     session GUC (a stamped ledger row, a version bump), then a stale settle. The
     settle must RAISE, so the statement and everything hr_apply wrote is gone. */
  async R1(db, red) {
    await probe(db);
    const e = await enter(db, [{ item: 'cooked_shrimp', qty: 5 }]);
    const sid = e.session.id;
    const from = await startHunting(db, sid);
    const ver = await one(db, `select version::int from public.player_state where user_id = $1 and slot = 0`, [UID]);
    const rows0 = await one(db, `select count(*)::int from public.player_ledger where user_id = $1`, [UID]);
    const block = (settleSql) => `do $r1$ declare v jsonb; begin
        perform set_config('hr.hunt_session', '${sid}', true);
        v := public.hr_apply('${UID}', 0, ${ver}, gen_random_uuid(),
               '{"fight":{"monster":"rat","hp":3,"kills":0},"journal":{"intent":"set_activity"}}'::jsonb);
        perform set_config('hr.hunt_session', '', true);
        if coalesce(v->>'ok', 'false') <> 'true' then raise exception 'R1 CONTROL: hr_apply answered %', v; end if;
        ${settleSql}
      end $r1$`;
    // CONTROL: hr_apply alone writes a stamped row (else the arm proves nothing).
    await db.query('savepoint r1c');
    try {
      await db.exec(block(''));
      const stamped = await one(db, `select count(*)::int from public.player_ledger where user_id = $1 and session_id = $2`, [UID, sid]);
      if (stamped < 1) red.push('R1: CONTROL — hr_apply under the GUC wrote no stamped ledger row');
    } catch (err) { red.push(`R1: CONTROL threw ${String(err.message).split('\n')[0]}`); }
    await db.query('rollback to savepoint r1c');
    const bad = JSON.stringify({ swing_from: 99, swing_to: 100, to: at(from, 60), next_swing_at: at(from, 61) });
    await db.query('savepoint r1');
    let raised = null;
    try { await db.exec(block(`perform public.hr_hunt_settle_session('${UID}', 0, '${sid}', '${bad}'::jsonb);`)); }
    catch (err) { raised = String(err.message).split('\n')[0]; await db.query('rollback to savepoint r1'); }
    if (raised === null) await db.query('release savepoint r1');
    if (raised !== 'session_moved') red.push(`R1: a stale settle after hr_apply ${raised === null ? 'did NOT raise' : `raised "${raised}"`}`);
    const rows1 = await one(db, `select count(*)::int from public.player_ledger where user_id = $1`, [UID]);
    const ver1 = await one(db, `select version::int from public.player_state where user_id = $1 and slot = 0`, [UID]);
    if (rows1 !== rows0 || ver1 !== ver) red.push(`R1: the refused settle left hr_apply's value behind (ledger ${rows0} -> ${rows1}, version ${ver} -> ${ver1})`);
  },

  async B1(db, red) {
    await probe(db);
    const e = await enter(db, [{ item: 'cooked_shrimp', qty: 12 }, { item: 'bronze_arrows', qty: 50 }]);
    if (!e || e.ok !== true) return red.push(`B1: enter answered ${JSON.stringify(e)}`);
    const sid = e.session.id;
    const from = await startHunting(db, sid);
    const s = await settle(db, sid, { swing_from: 0, swing_to: 20, to: at(from, 60), next_swing_at: at(from, 61),
      uses: { cooked_shrimp: 4, bronze_arrows: 20 } });
    if (!s || s.ok !== true) return red.push(`B1: settle answered ${JSON.stringify(s)}`);
    await db.query(`update public.hunt_sessions set settled_to = now(), next_swing_at = now() where id = $1`, [sid]);
    const r = await call(db, 'hr_hunt_restock', [0, 'cooked_shrimp', 5, idem()]);
    if (!r || r.ok !== true) return red.push(`B1: restock answered ${JSON.stringify(r)}`);
    const c = await call(db, 'hr_hunt_change', [0, 'goblin_warren', idem()]);
    if (!c || c.ok !== true) return red.push(`B1: change answered ${JSON.stringify(c)}`);
    const l = await call(db, 'hr_hunt_leave', [0, idem()]);
    if (!l || l.ok !== true) return red.push(`B1: leave answered ${JSON.stringify(l)}`);
    const drift = await q(db, `select x.session_id, x.item_id, x.j, coalesce(b.qty_left, 0) as left
        from (select session_id, item_id, sum(q) as j from (
                select session_id, item_id, qty as q from public.player_ledger
                 where user_id = $1 and kind = 'hunt' and meta->>'side' = 'bag' and item_id is not null
                union all
                select l.session_id, i.key, -(i.value::bigint) from public.player_ledger l, jsonb_each_text(l.meta->'items') i
                 where l.user_id = $1 and l.kind = 'hunt' and l.intent = 'hunt_consume') u group by 1, 2) x
        left join public.hunt_bag b on b.session_id = x.session_id and b.item_id = x.item_id
       where x.j <> coalesce(b.qty_left, 0)`, [UID]);
    if (drift.length) red.push(`B1: bag side of the journal <> the bag: ${JSON.stringify(drift)}`);
    const pairs = await q(db, `select intent, sum(qty)::int as net from public.player_ledger
        where user_id = $1 and kind = 'hunt' and intent <> 'hunt_consume' group by intent having sum(qty) <> 0`, [UID]);
    if (pairs.length) red.push(`B1: pairs do not cancel: ${JSON.stringify(pairs)}`);
    const shrimp = await inv(db, 'cooked_shrimp'); const arrows = await inv(db, 'bronze_arrows');
    if (shrimp + 4 !== 20 || arrows + 20 !== 50) red.push(`B1: inventory + consumed: shrimp ${shrimp}+4, arrows ${arrows}+20`);
    const open = await one(db, `select count(*)::int from public.hunt_sessions where user_id = $1 and ended_at is null`, [UID]);
    if (open !== 0) red.push(`B1: ${open} session(s) still open after leave`);
  },

  async S1(db, red) {
    await probe(db);
    const e = await enter(db, [{ item: 'cooked_shrimp', qty: 5 }]);
    if (!e || e.ok !== true) return red.push(`S1: enter answered ${JSON.stringify(e)}`);
    const e2 = await enter(db, [{ item: 'cooked_shrimp', qty: 5 }]);
    if (e2?.error !== 'hunt_open') red.push(`S1: a second enter answered ${JSON.stringify(e2)}`);
    await db.query('savepoint s1');
    try {
      await db.query(`insert into public.hunt_sessions (user_id, slot, hunt_id, falls_limit, hunt_from, settled_to, next_swing_at)
                      values ($1, 0, 'rat', 3, now(), now(), now())`, [UID]);
      red.push('S1: a second open row was admitted');
    } catch (err) { if (!/unique|duplicate/i.test(err.message)) red.push(`S1: second row refused for the wrong reason: ${err.message}`); }
    await db.query('rollback to savepoint s1');
    await db.query('savepoint s2');
    try {
      await db.query(`update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0`, [UID]);
      red.push('S1: the pointer moved while a hunt was open');
    } catch (err) { if (!/hunt_open/.test(err.message)) red.push(`S1: pointer refused for the wrong reason: ${err.message}`); }
    await db.query('rollback to savepoint s2');
    const n = await one(db, `select count(*)::int from public.hunt_sessions where user_id = $1 and ended_at is null`, [UID]);
    if (n !== 1) red.push(`S1: ${n} open sessions`);
  },

  async F1(db, red) {
    await probe(db);
    const cases = [
      [[{ item: 'cooked_shrimp', qty: 999 }], 'insufficient_item'],
      [[{ item: 'cooked_shrimp', qty: 3, at: 1 }], 'bad_bag'],
      [[{ item: 'cooked_shrimp', qty: 2.5 }], 'bad_qty'],
      [[{ item: 'cooked_shrimp', qty: -4 }], 'bad_qty'],
      [[{ item: 'gold_coin', qty: 1 }], 'unknown_supply'],
    ];
    for (const [bag, want] of cases) {
      const r = await enter(db, bag);
      if (r?.error !== want) red.push(`F1: bag ${JSON.stringify(bag)} answered ${JSON.stringify(r)}, wanted ${want}`);
    }
    if (await inv(db, 'cooked_shrimp') !== 20) red.push('F1: a refused enter moved inventory');
    const e = await enter(db, [{ item: 'cooked_shrimp', qty: 6 }]);
    const sid = e.session.id;
    const from = await startHunting(db, sid);
    const fut = await settle(db, sid, { swing_from: 0, swing_to: 2, to: new Date(Date.now() + 3600e3).toISOString(),
      next_swing_at: new Date(Date.now() + 3601e3).toISOString() });
    if (fut?.error !== 'window_in_future') red.push(`F1: a future window answered ${JSON.stringify(fut)}`);
    const short = await settle(db, sid, { swing_from: 0, swing_to: 2, to: at(from, 60), next_swing_at: at(from, 61), uses: { cooked_shrimp: 7 } });
    if (short?.error !== 'bag_short') red.push(`F1: 7 from a bag of 6 answered ${JSON.stringify(short)}`);
    const neg = await settle(db, sid, { swing_from: 0, swing_to: 2, to: at(from, 60), next_swing_at: at(from, 61), uses: { cooked_shrimp: -2 } });
    if (neg?.error !== 'bad_uses') red.push(`F1: a negative use answered ${JSON.stringify(neg)}`);
    const rs = await call(db, 'hr_hunt_restock', [0, 'cooked_shrimp', 1000, idem()]);
    if (rs?.error !== 'insufficient_item' && rs?.error !== 'settle_first') red.push(`F1: restock 1000 answered ${JSON.stringify(rs)}`);
    if (await bagLeft(db, sid, 'cooked_shrimp') !== 6 || await inv(db, 'cooked_shrimp') !== 14) red.push('F1: a refusal moved the bag');
  },

  async P1(db, red) {
    await probe(db);
    const e = await enter(db, [{ item: 'cooked_shrimp', qty: 15 }]);
    const sid = e.session.id;
    const before = await one(db, `select count(*)::int from public.player_ledger where user_id = $1`, [UID]);
    const p = await call(db, 'hr_hunt_use', [0, 0, idem()]);
    if (p?.ok !== true) return red.push(`P1: a press answered ${JSON.stringify(p)}`);
    const after = await one(db, `select count(*)::int from public.player_ledger where user_id = $1`, [UID]);
    if (after !== before || await bagLeft(db, sid, 'cooked_shrimp') !== 15) red.push('P1: a press moved value');
    const from = await startHunting(db, sid);
    const grow = await settle(db, sid, { swing_from: 0, swing_to: 4, to: at(from, 10), next_swing_at: at(from, 11), presses_left: [0, 0] });
    if (grow?.error !== 'bad_presses') red.push(`P1: a settle that invents a press answered ${JSON.stringify(grow)}`);
    // 10 s admits floor(10000 / 2000) + 1 = 6 heals, presses or not.
    const over = await settle(db, sid, { swing_from: 0, swing_to: 4, to: at(from, 10), next_swing_at: at(from, 11),
      uses: { cooked_shrimp: 7 }, presses_left: [] });
    if (over?.error !== 'too_many_uses') red.push(`P1: 7 heals in 10 s with a press queued answered ${JSON.stringify(over)}`);
    const ok = await settle(db, sid, { swing_from: 0, swing_to: 4, to: at(from, 10), next_swing_at: at(from, 11),
      uses: { cooked_shrimp: 6 }, presses_left: [] });
    if (ok?.ok !== true) red.push(`P1: 6 heals in 10 s answered ${JSON.stringify(ok)}`);
    const left = await one(db, `select jsonb_array_length(presses) from public.hunt_sessions where id = $1`, [sid]);
    if (left !== 0) red.push(`P1: the consumed press is still queued (${left})`);
  },

  async T1(db, red) {
    await probe(db);
    const e = await enter(db, [{ item: 'cooked_shrimp', qty: 10 }, { item: 'bronze_arrows', qty: 40 }]);
    const sid = e.session.id;
    const from = await startHunting(db, sid);
    await engineRows(db, sid, [
      { kind: 'accrue', intent: 'tick', gold: 25, meta: { delta: { g: 25, x: { attack: 40, hitpoints: 13 }, i: { bones: 2, rat_tail: 1 } }, kills: 5 } },
      { kind: 'combat', intent: 'death', meta: { monster: 'slime' } },
    ]);
    let s = await settle(db, sid, { swing_from: 0, swing_to: 20, to: at(from, 60), next_swing_at: at(from, 61), falls: 1,
      uses: { cooked_shrimp: 3, bronze_arrows: 18 } });
    if (s?.ok !== true) return red.push(`T1: settle 1 answered ${JSON.stringify(s)}`);
    await engineRows(db, sid, [{ kind: 'accrue', intent: 'tick', gold: 9, meta: { delta: { g: 9, x: { attack: 7 }, i: { bones: 1 } }, kills: 2 } }]);
    s = await settle(db, sid, { swing_from: 20, swing_to: 40, to: at(from, 120), next_swing_at: at(from, 121), falls: 1,
      uses: { cooked_shrimp: 1, bronze_arrows: 9 } });
    if (s?.ok !== true) return red.push(`T1: settle 2 answered ${JSON.stringify(s)}`);
    const t = (await q(db, `select * from public.hunt_session_tally where session_id = $1`, [sid]))[0];
    const L = (await q(db, `select
        coalesce(sum(gold) filter (where kind <> 'hunt'), 0)::int as coins,
        coalesce(sum((meta->>'kills')::int) filter (where meta ? 'kills'), 0)::int as kills,
        count(*) filter (where kind = 'combat' and intent = 'death')::int as deaths
        from public.player_ledger where session_id = $1`, [sid]))[0];
    const xp = Object.fromEntries((await q(db, `select x.key, sum(x.value::numeric)::int as v from public.player_ledger l,
        jsonb_each_text(coalesce(l.meta->'delta'->'x', '{}')) x where l.session_id = $1 group by 1`, [sid])).map((r) => [r.key, r.v]));
    const loot = Object.fromEntries((await q(db, `select x.key, sum(x.value::numeric)::int as v from public.player_ledger l,
        jsonb_each_text(coalesce(l.meta->'delta'->'i', '{}')) x where l.session_id = $1 group by 1`, [sid])).map((r) => [r.key, r.v]));
    const sup = Object.fromEntries((await q(db, `select i.key, sum(i.value::numeric)::int as v from public.player_ledger l,
        jsonb_each_text(l.meta->'items') i where l.session_id = $1 and l.intent = 'hunt_consume' group by 1`, [sid])).map((r) => [r.key, r.v]));
    const rows = await one(db, `select count(*)::int from public.player_ledger where session_id = $1 and intent = 'hunt_consume'`, [sid]);
    if (rows !== 2) red.push(`T1: ${rows} consumption rows for two settles (want one per settle)`);
    const num = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]).sort());
    const eq = (a, b) => JSON.stringify(num(a)) === JSON.stringify(num(b));
    if (Number(t.coins) !== L.coins || Number(t.kills) !== L.kills || Number(t.deaths) !== L.deaths) {
      red.push(`T1: tally coins/kills/deaths ${t.coins}/${t.kills}/${t.deaths} vs ledger ${L.coins}/${L.kills}/${L.deaths}`);
    }
    if (!eq(t.xp, xp)) red.push(`T1: tally xp ${JSON.stringify(t.xp)} vs ledger ${JSON.stringify(xp)}`);
    if (!eq(t.loot, loot)) red.push(`T1: tally loot ${JSON.stringify(t.loot)} vs ledger ${JSON.stringify(loot)}`);
    if (!eq(t.supplies, sup)) red.push(`T1: tally supplies ${JSON.stringify(t.supplies)} vs ledger ${JSON.stringify(sup)}`);
    if (L.coins !== 34 || L.kills !== 7) red.push(`T1: CONTROL — the fixture ledger is ${JSON.stringify(L)}`);
  },
};

/* D1 — THE DROP, PLACED BY LANE C2 (2026-10-22-hunt-sessions-away-readers.sql
   removed the last readers; the drop file sits in the replay order right after
   it). On the chain every dropped object is GONE, hr_offline_cap_ms is KEPT
   (gather and artisan keep their horizon until lane G), the away receipt is
   KEPT (gathering still returns through the "while you were away" card until
   lane G — the designer loop check's swap THEN delete), and the restated
   hr_vigour_of grants a clanless character the flat 720. AND THE FENCE STILL
   BITES: with a body that reads a dropped name planted on the chain, a second
   apply of the drop file REFUSES ("still read by"). Rolled back. */
const DROP = '2026-10-22-hunt-sessions-drop-away.sql';
const DROP_TEXT = readFileSync(join(ROOT, 'supabase', 'migrations', DROP), 'utf8').replace(/\r\n/g, '\n');
async function d1(db, text = DROP_TEXT) {
  const red = [];
  const cols = await one(db, `select count(*)::int from information_schema.columns where table_schema = 'public'
      and table_name = 'player_state' and column_name in ('auto_eat_enabled', 'auto_eat_food',
                                                          'auto_eat_pct', 'auto_eat_set_at')`);
  if (cols !== 0) red.push(`D1: ${cols} away column(s) survived the drop on the chain`);
  const receipt = await one(db, `select count(*)::int from information_schema.columns where table_schema = 'public'
      and table_name = 'player_state' and column_name = 'last_away_receipt'`);
  if (receipt !== 1) red.push('D1: player_state.last_away_receipt was dropped; gathering still returns through it until lane G');
  const projected = await one(db, `select position('last_away_receipt' in
      pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure)) > 0`);
  if (!projected) red.push('D1: hr_state_of no longer projects last_away_receipt; the gathering card renders nothing after a reload');
  const fns = await one(db, `select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('hr_set_auto_eat', 'hr_credit_kills', 'hr_credit_kills__ungated',
                                                   'hr_attended_kills')`);
  if (fns !== 0) red.push(`D1: ${fns} away function(s) survived the drop on the chain`);
  if (!(await one(db, `select to_regprocedure('public.hr_offline_cap_ms(uuid,integer)') is not null`))) {
    red.push('D1: hr_offline_cap_ms was dropped; gather and artisan still read it until lane G');
  }
  const grant = await one(db, `select (public.hr_vigour_of(gen_random_uuid(), 0)->>'grant_min')::int`);
  if (grant !== 720) red.push(`D1: a clanless character's daily Vigour grant is ${grant}, not the flat 720`);
  await db.query('begin');
  try {
    await db.exec(`create function public.hr__d1_reader() returns void language plpgsql as $f$
                   begin perform public.hr_set_auto_eat(0, true, null, null, false); end $f$`);
    let refused = null;
    try { await db.exec(text); } catch (e) { refused = String(e.message); }
    if (!refused || !/still read by/.test(refused)) {
      red.push(`D1: the drop file applied over a planted reader (${refused ? refused.slice(0, 120) : 'it applied'})`);
    }
  } finally { await db.query('rollback'); }
  return red;
}

async function runArms(db, only) {
  const red = [];
  for (const [name, arm] of Object.entries(ARMS)) {
    if (only && !only.includes(name)) continue;
    try { await inTx(db, () => arm(db, red)); } catch (err) { red.push(`${name}: threw ${String(err.message).split('\n')[0]}`); }
  }
  return red;
}

/* G1 — generator and CHECK-list drift. The end-reason wall is read off the
   CHAIN (pg_constraint), not C1's text: the C2 catalogue regenerates it. */
async function g1(db) {
  const red = [];
  const chk = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen-hunt-sessions.mjs'), '--check'], { encoding: 'utf8' });
  if (chk.status !== 0) red.push(`G1: gen-hunt-sessions --check exited ${chk.status}: ${chk.stderr.trim()}`);
  const list = (re) => { const m = MIG_TEXT.match(re); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null; };
  const defs = await q(db, `select pg_get_constraintdef(c.oid) d from pg_constraint c
      where c.conrelid = 'public.hunt_sessions'::regclass and c.contype = 'c'
        and pg_get_constraintdef(c.oid) like '%end_reason = ANY%'`);
  const ends = defs.length === 1 ? [...defs[0].d.matchAll(/'([a-z_]+)'::text/g)].map((x) => x[1]) : null;
  /* The event types too: regenerated from EVENT_COPY by the C2 catalogue
     (stamina_low replaced vigour_low; `cover` joined, 2026-10-14). */
  const tdefs = await q(db, `select pg_get_constraintdef(c.oid) d from pg_constraint c
      where c.conrelid = 'public.hunt_session_events'::regclass and c.contype = 'c'
        and pg_get_constraintdef(c.oid) like '%type = ANY%'`);
  const types = tdefs.length === 1 ? [...tdefs[0].d.matchAll(/'([a-z_]+)'::text/g)].map((x) => x[1]) : null;
  if (JSON.stringify(ends) !== JSON.stringify([...END_ORDER])) {
    red.push(`G1: hunt_sessions.end_reason CHECK on the chain ${JSON.stringify(ends)} (${defs.length} constraint(s)) <> END_ORDER`);
  }
  const rows = (await q(db, 'select reason from public.hr_hunt_end_reasons order by ord')).map((r) => r.reason);
  if (JSON.stringify(rows) !== JSON.stringify([...END_ORDER])) red.push(`G1: hr_hunt_end_reasons on the chain ${JSON.stringify(rows)} <> END_ORDER`);
  /* THE BAR'S SIZE IS DATA (ACTION_SET_LIMITS.slots, 20 since 2026-10-14): ONE
     length wall on the stored bar and ONE on the queued presses, each at it. */
  for (const [table, col] of [['player_action_sets', 'slots'], ['hunt_sessions', 'presses']]) {
    const walls = await q(db, `select pg_get_constraintdef(c.oid) d from pg_constraint c
        where c.conrelid = $1::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like $2`,
      ['public.' + table, `%jsonb_array_length(${col})%`]);
    if (walls.length !== 1 || !walls[0].d.includes(`<= ${ACTION_SET_LIMITS.slots}`)) {
      red.push(`G1: ${table}.${col} carries ${walls.length} length wall(s) ${JSON.stringify(walls.map((w) => w.d))}, want one at ${ACTION_SET_LIMITS.slots}`);
    }
  }
  if (JSON.stringify(types) !== JSON.stringify(Object.keys(EVENT_COPY))) red.push(`G1: hunt_session_events.type CHECK ${JSON.stringify(types)} <> EVENT_COPY keys`);
  return red;
}

/* C1 — a second apply of both files is byte-identical. */
async function c1(db) {
  const red = [];
  const { inventory } = await import('./schema-replay.mjs');
  const snap = async () => JSON.stringify([await inventory(db),
    await q(db, `select p.oid::regprocedure::text f, md5(p.prosrc) h, p.proacl::text acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and (p.proname like 'hr_hunt%' or p.proname in ('hr_rpc_gate', 'hr_mark_seen',
                   'hr_action_set_put', 'hr_action_set_delete', 'hr_jsonb_add', 'hr_ledger_session_stamp')) order by 1`),
    await q(db, `select * from public.hr_hunt_supplies order by 1`), await q(db, `select * from public.hr_hunt_travel order by 1`),
    await q(db, `select * from public.hr_hunt_limits order by 1`), await q(db, `select * from public.hr_hunt_vendor_value order by 1`),
    await q(db, `select proname, identity_args, grantee from public.hr_client_rpc_baseline order by 1, 2, 3`),
    await q(db, `select pg_get_constraintdef(oid) d from pg_constraint where conname = 'player_ledger_kind_check'`)]);
  const before = await snap();
  for (const f of [CAT, MIG, CAT_NOW, SETTLE]) {
    try { await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8')); } catch (e) {
      red.push(`C1: a second apply of ${f} raised: ${String(e.message).split('\n')[0]}`);
    }
  }
  if (await snap() !== before) red.push('C1: a second apply changed the schema, a body, an ACL, a catalogue row or the baseline');
  return red;
}

/* ── THE MUTANTS ─────────────────────────────────────────────────────────── */
/* The live body of one function, extracted from the migration text. */
function fnText(name) {
  const start = MIG_TEXT.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`mutant anchor: no function ${name}`);
  const end = MIG_TEXT.indexOf('\nend $$;', start);
  if (end < 0) throw new Error(`mutant anchor: no end for ${name}`);
  return MIG_TEXT.slice(start, end + '\nend $$;'.length);
}
function plant(name, from, to) {
  const src = fnText(name);
  if (src.split(from).length !== 2) throw new Error(`mutant anchor moved in ${name}: ${from.slice(0, 60)}`);
  return src.replace(from, to);
}
const BODY_MUTANTS = [
  { name: 'pack writes only the bag side (pair broken)', arm: 'B1', fn: 'hr_hunt_ledger_pair',
    from: "         (p_user, p_slot, 'hunt', p_intent, p_item, p_qty,\n          jsonb_build_object('side', case when p_to_session is null then 'inventory' else 'bag' end),\n          p_to_session);",
    to: "         (p_user, p_slot, 'hunt', p_intent, p_item, 0,\n          jsonb_build_object('side', case when p_to_session is null then 'inventory' else 'bag' end),\n          p_to_session);" },
  { name: 'leave forgets to return the bag', arm: 'B1', fn: 'hr_hunt_close',
    from: "        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;\n      perform public.hr_hunt_ledger_pair",
    to: "        on conflict (user_id, slot, item_id) do update set qty = pi.qty;\n      perform public.hr_hunt_ledger_pair" },
  { name: 'enter ignores an already-open session', arm: 'S1', fn: 'hr_hunt_enter',
    from: '  if v_s.id is not null then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object(\'ok\', false, \'error\', \'hunt_open\', \'session\', v_s.id)); end if;',
    to: '' },
  { name: 'enter trusts the client qty', arm: 'F1', fn: 'hr_hunt_enter',
    from: '    if coalesce(v_have, 0) < (v_line->>\'qty\')::bigint then', to: '    if false then' },
  { name: 'enter admits unknown bag keys (a client time)', arm: 'F1', fn: 'hr_hunt_enter',
    from: "k not in ('item', 'qty', 'essential'))", to: "k not in ('item', 'qty', 'essential', 'at'))" },
  { name: 'settle trusts a future window', arm: 'F1', fn: 'hr_hunt_settle_session',
    from: "  if v_to > now() + c_skew then perform public.hr_reject('window_in_future'); end if;", to: '' },
  { name: 'a settle refusal RETURNS instead of raising (hr_apply value kept)', arm: 'R1', fn: 'hr_hunt_settle_session',
    from: "    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;",
    to: "    return jsonb_build_object('ok', false, 'error', 'session_moved'); end if;" },
  { name: 'enter ignores the kill switch', arm: 'K1', fn: 'hr_hunt_enter',
    from: "  if not coalesce((select enabled from public.hr_hunt_config where id), false) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunts_paused')); end if;\n  if p_hunt is null",
    to: "  if p_hunt is null" },
  { name: 'settle ignores the cooldown cap', arm: 'P1', fn: 'hr_hunt_settle_session',
    from: '    if v_heals > v_win / v_cd_heal + 1 or v_buffs > v_win / v_cd_buff + 1 then', to: '    if false then' },
  { name: 'settle accepts invented presses', arm: 'P1', fn: 'hr_hunt_settle_session',
    from: "      if v_j >= jsonb_array_length(v_stored) then perform public.hr_reject('bad_presses'); end if;\n      v_keep := v_keep || jsonb_build_array(v_stored->v_j);",
    to: "      v_keep := v_keep || jsonb_build_array(jsonb_build_object('slot', (p_delta->'presses_left'->>v_i)::int));" },
  { name: 'a press consumes from the bag', arm: 'P1', fn: 'hr_hunt_use',
    from: '  update public.hunt_sessions\n     set presses = presses ||',
    to: "  update public.hunt_bag set qty_left = qty_left - 1 where session_id = v_s.id and qty_left > 0 and item_id = (select item_id from public.hunt_bag where session_id = v_s.id and qty_left > 0 order by item_id limit 1);\n  update public.hunt_sessions\n     set presses = presses ||" },
  { name: 'the fold reads past the high-water mark (double count)', arm: 'T1', fn: 'hr_hunt_settle_session',
    from: "    from public.player_ledger l where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from;",
    to: "    from public.player_ledger l where l.session_id = p_session and l.id > 0 and l.at >= v_fold_from;" },
  { name: 'the fold drops xp', arm: 'T1', fn: 'hr_hunt_settle_session',
    from: 'xp = public.hr_jsonb_add(t.xp, v_xp)', to: 'xp = t.xp' },
];
/* Defects in the migration TEXT that its own §8 must refuse (the replay raises). */
const TEXT_MUTANTS = [
  { name: 'the kill switch is seeded ON', arm: 'K1',
    from: 'insert into public.hr_hunt_config (id, enabled) values (true, false) on conflict (id) do nothing;',
    to: 'insert into public.hr_hunt_config (id, enabled) values (true, true) on conflict (id) do nothing;' },
  { name: '§8: a settle refusal returns instead of raising', want: 'GATE(e0)',
    from: "    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;",
    to: "    return jsonb_build_object('ok', false, 'error', 'session_moved'); end if;" },
  // (hr_hunt_change carries the same two lines; the trailing p_preset line makes the anchor enter's alone)
  { name: '§8: enter ignores the kill switch', want: 'GATE(b0)',
    from: "  if not coalesce((select enabled from public.hr_hunt_config where id), false) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunts_paused')); end if;\n"
      + "  if p_hunt is null or not exists (select 1 from public.hr_hunt_travel where hunt_id = p_hunt) then\n"
      + "    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_hunt')); end if;\n  if p_preset is null",
    to: "  if p_hunt is null or not exists (select 1 from public.hr_hunt_travel where hunt_id = p_hunt) then\n"
      + "    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_hunt')); end if;\n  if p_preset is null" },
  { name: '§8: the one-open index is not unique', want: 'GATE(c3)',
    from: 'create unique index if not exists hunt_sessions_one_open', to: 'create index if not exists hunt_sessions_one_open' },
  { name: '§8: a verb is granted to anon', want: 'GATE(a)',
    from: 'grant execute on function public.hr_hunt_use(int, int, uuid) to authenticated;',
    to: 'grant execute on function public.hr_hunt_use(int, int, uuid) to authenticated, anon;' },
];

/* ── main ────────────────────────────────────────────────────────────────── */
const { bootReplay } = await import('./schema-replay.mjs');
const { db } = await bootReplay({});
if (!MUTATE) {
  const red = [...(await g1(db)), ...(await runArms(db)), ...(await d1(db)), ...(await c1(db))];
  await db.close?.();
  if (red.length) { console.error('hunt-sessions-db RED\n  ' + red.join('\n  ')); process.exit(1); }
  console.log('hunt-sessions-db: G1 K1 R1 B1 S1 F1 P1 T1 D1 C1 green');
} else {
  let escaped = 0;
  const control = await runArms(db);
  if (control.length) { console.log(`  CONTROL RED: ${control[0]}`); escaped++; }
  for (const m of BODY_MUTANTS) {
    await db.query('begin');
    let red;
    try {
      await db.exec(plant(m.fn, m.from, m.to));
      red = [];
      try { await ARMS[m.arm](db, red); } catch (err) { red.push(`${m.arm}: threw ${String(err.message).split('\n')[0]}`); }
    } finally { await db.query('rollback'); }
    const mine = red.filter((r) => r.startsWith(m.arm));
    console.log(`  ${mine.length ? 'caught ' : 'ESCAPED'} ${m.name}${mine.length ? ` (${mine[0].slice(0, 90)})` : ''}`);
    if (!mine.length) escaped++;
  }
  /* D1 bites: the drop file with its reader scan blinded applies over a planted reader. */
  {
    const anchor = "  if v_readers is not null then\n";
    if (DROP_TEXT.split(anchor).length !== 2) throw new Error('D1 mutant anchor moved');
    const red = await d1(db, DROP_TEXT.replace(anchor, '  if false then\n'));
    const caught = red.some((r) => r.startsWith('D1'));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'} D1: the drop file's reader scan blinded${caught ? ` (${red[0].slice(0, 90)})` : ''}`);
    if (!caught) escaped++;
  }
  /* G1 bites ON THE CHAIN: Vigour is let back into the end-reason wall, and
     into the catalogue — each alone must be red. Rolled back. */
  for (const [label, sql] of [
    ['the end_reason CHECK re-admits vigour', `alter table public.hunt_sessions drop constraint hunt_sessions_end_reason_check;
       alter table public.hunt_sessions add constraint hunt_sessions_end_reason_check
         check (end_reason in ('falls', 'heals_out', 'ammo_out', 'vigour', 'hours', 'left', 'changed', 'server'))`],
    ['hr_hunt_end_reasons gains vigour', `insert into public.hr_hunt_end_reasons (reason, ord) values ('vigour', 99)`],
  ]) {
    await db.query('begin');
    let red = [];
    try { await db.exec(sql); red = await g1(db); } finally { await db.query('rollback'); }
    const caught = red.some((r) => r.startsWith('G1'));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'} G1: ${label}${caught ? ` (${red[0].slice(0, 90)})` : ''}`);
    if (!caught) escaped++;
  }
  await db.close?.();
  chainArmed = false; // every TEXT mutant boots the chain up to C1's file only
  for (const m of TEXT_MUTANTS) {
    let raised = null; const armRed = [];
    try {
      const { db: d2 } = await bootReplay({ patches: new Map([[MIG, [[m.from, m.to]]]]), upTo: MIG });
      if (m.arm) { try { await inTx(d2, () => ARMS[m.arm](d2, armRed)); } catch (err) { armRed.push(`${m.arm}: threw ${err.message}`); } }
      await d2.close?.();
    } catch (e) { raised = m.want && String(e.message).includes(m.want) ? m.want : null; }
    const mine = m.arm ? armRed.filter((r) => r.startsWith(m.arm)) : [];
    const caught = raised || mine.length;
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'} ${m.name}${raised ? ` (${raised})` : mine.length ? ` (${mine[0].slice(0, 90)})` : ''}`);
    if (!caught) escaped++;
  }
  /* G1 bites: an event type dropped from the chain's CHECK list is red. */
  {
    const { db: d3 } = await bootReplay({});
    await d3.query('begin');
    let red = [];
    try {
      const def = await one(d3, `select pg_get_constraintdef(oid) from pg_constraint where conname = 'hunt_session_events_type_check'`);
      await d3.exec(`alter table public.hunt_session_events drop constraint hunt_session_events_type_check;
        alter table public.hunt_session_events add constraint hunt_session_events_type_check ${def.replace("'cover'::text, ", '')}`);
      red = await g1(d3);
    } finally { await d3.query('rollback'); await d3.close?.(); }
    const caught = red.some((r) => r.startsWith('G1'));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'} G1: an event type dropped from the CHECK list`);
    if (!caught) escaped++;
  }
  if (escaped) { console.error(`hunt-sessions-db --mutate: ${escaped} mutant(s) escaped`); process.exit(1); }
  console.log('hunt-sessions-db --mutate: every mutant caught');
}
