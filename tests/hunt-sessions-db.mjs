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
//       the table CHECK lists equal the data (END_ORDER, EVENT_COPY)
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
//   C1  a SECOND apply of both files is byte-identical (schema inventory,
//       function bodies + ACLs, catalogue rows)
// --mutate plants each defect into the LIVE function body (create or replace,
// rolled back) and requires the arm that owns it to go red; two more defects
// are planted in the migration TEXT and must be refused by its own §8.
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { END_ORDER, EVENT_COPY } from '../src/data/hunt-sessions.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const MIG = '2026-10-21-hunt-sessions.sql';
const CAT = '2026-10-21-hunt-sessions-catalogue.generated.sql';
const MIG_TEXT = readFileSync(join(ROOT, 'supabase', 'migrations', MIG), 'utf8').replace(/\r\n/g, '\n');
const UID = '00000000-0000-4000-8000-0000000c1d01';

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
async function settle(db, sid, delta) { return call(db, 'hr_hunt_settle_session', [UID, 0, sid, JSON.stringify(delta)]); }

async function inTx(db, fn) {
  await db.query('begin');
  try { return await fn(); } finally { await db.query('rollback'); }
}

/* ── ARMS ────────────────────────────────────────────────────────────────── */
const ARMS = {
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
        from (select session_id, item_id, sum(qty) as j from public.player_ledger
               where user_id = $1 and kind = 'hunt' and meta->>'side' = 'bag' group by 1, 2) x
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
    const sup = Object.fromEntries((await q(db, `select item_id as key, (-sum(qty))::int as v from public.player_ledger
        where session_id = $1 and intent = 'hunt_consume' group by 1`, [sid])).map((r) => [r.key, r.v]));
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

async function runArms(db, only) {
  const red = [];
  for (const [name, arm] of Object.entries(ARMS)) {
    if (only && !only.includes(name)) continue;
    try { await inTx(db, () => arm(db, red)); } catch (err) { red.push(`${name}: threw ${String(err.message).split('\n')[0]}`); }
  }
  return red;
}

/* G1 — generator and CHECK-list drift. */
function g1() {
  const red = [];
  const chk = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen-hunt-sessions.mjs'), '--check'], { encoding: 'utf8' });
  if (chk.status !== 0) red.push(`G1: gen-hunt-sessions --check exited ${chk.status}: ${chk.stderr.trim()}`);
  const list = (re) => { const m = MIG_TEXT.match(re); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null; };
  const ends = list(/end_reason\s+text check \(end_reason in \(([^)]*)\)\)/);
  const types = list(/type\s+text not null check \(type in \(([^)]*)\)\)/);
  if (JSON.stringify(ends) !== JSON.stringify([...END_ORDER])) red.push(`G1: hunt_sessions.end_reason CHECK ${JSON.stringify(ends)} <> END_ORDER`);
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
  for (const f of [CAT, MIG]) {
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
    from: "  if v_to > now() + c_skew then return jsonb_build_object('ok', false, 'error', 'window_in_future'); end if;", to: '' },
  { name: 'settle ignores the cooldown cap', arm: 'P1', fn: 'hr_hunt_settle_session',
    from: '    if v_heals > v_win / v_cd_heal + 1 or v_buffs > v_win / v_cd_buff + 1 then', to: '    if false then' },
  { name: 'settle accepts invented presses', arm: 'P1', fn: 'hr_hunt_settle_session',
    from: "      if v_j >= jsonb_array_length(v_stored) then return jsonb_build_object('ok', false, 'error', 'bad_presses'); end if;\n      v_keep := v_keep || jsonb_build_array(v_stored->v_j);",
    to: "      v_keep := v_keep || jsonb_build_array(jsonb_build_object('slot', (p_delta->'presses_left'->>v_i)::int));" },
  { name: 'a press consumes from the bag', arm: 'P1', fn: 'hr_hunt_use',
    from: '  update public.hunt_sessions\n     set presses = presses ||',
    to: "  update public.hunt_bag set qty_left = qty_left - 1 where session_id = v_s.id and qty_left > 0 and item_id = (select item_id from public.hunt_bag where session_id = v_s.id and qty_left > 0 order by item_id limit 1);\n  update public.hunt_sessions\n     set presses = presses ||" },
  { name: 'the fold reads past the high-water mark (double count)', arm: 'T1', fn: 'hr_hunt_settle_session',
    from: "    from public.player_ledger l where l.session_id = p_session and l.id > v_hwm;",
    to: "    from public.player_ledger l where l.session_id = p_session and l.id > 0;" },
  { name: 'the fold drops xp', arm: 'T1', fn: 'hr_hunt_settle_session',
    from: 'xp = public.hr_jsonb_add(t.xp, v_xp)', to: 'xp = t.xp' },
];
/* Defects in the migration TEXT that its own §8 must refuse (the replay raises). */
const TEXT_MUTANTS = [
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
  const red = [...g1(), ...(await runArms(db)), ...(await c1(db))];
  await db.close?.();
  if (red.length) { console.error('hunt-sessions-db RED\n  ' + red.join('\n  ')); process.exit(1); }
  console.log('hunt-sessions-db: G1 B1 S1 F1 P1 T1 C1 green');
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
  await db.close?.();
  for (const m of TEXT_MUTANTS) {
    let raised = null;
    try {
      const { db: d2 } = await bootReplay({ patches: new Map([[MIG, [[m.from, m.to]]]]), upTo: MIG });
      await d2.close?.();
    } catch (e) { raised = String(e.message).includes(m.want) ? m.want : null; }
    console.log(`  ${raised ? 'caught ' : 'ESCAPED'} ${m.name}${raised ? ` (${raised})` : ''}`);
    if (!raised) escaped++;
  }
  /* G1 bites: a CHECK list that drifts from the data is red. */
  {
    const saved = MIG_TEXT;
    const drifted = saved.replace("'vigour_low', 'ended'", "'ended'");
    const types = [...drifted.match(/type\s+text not null check \(type in \(([^)]*)\)\)/)[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    const caught = JSON.stringify(types) !== JSON.stringify(Object.keys(EVENT_COPY));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'} G1: an event type dropped from the CHECK list`);
    if (!caught) escaped++;
  }
  if (escaped) { console.error(`hunt-sessions-db --mutate: ${escaped} mutant(s) escaped`); process.exit(1); }
  console.log('hunt-sessions-db --mutate: every mutant caught');
}
