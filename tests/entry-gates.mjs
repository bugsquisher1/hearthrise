#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/entry-gates.mjs — TWO DOORS THE SERVER KEEPS (lane/c-entry-gates; Tyler 2026-11-18: "A minimum level to enter the tower, and you have to beat
//   the boss in the hunting ground X times before you can call them out"; supabase/migrations/2027-05-05-entry-gates.sql and its two catalogues).
//   On the replayed chain with the shipped edge, through the client's own verbs (signed in), and the count through BOTH PATHS (CLAUDE.md §4): the
//   browser closed (the world tick, tick.js runTick) and the hunt viewed (the player's settle, hunt-settle.js settleHunt).
//
//   node tests/entry-gates.mjs              the guard
//   node tests/entry-gates.mjs --arm=tower  one arm
//   node tests/entry-gates.mjs --mutate     every planted defect must turn its arm red (--mutant=<part of a name>)
//
// mutant-anchors: supabase/migrations/2027-05-05-entry-gates.sql
//
//   EG-DATA   the numbers are the data's rows, never a literal: hr_tower_rules.min_level is src/data/tower.js TOWER_RULES.minLevel; each
//             hr_boss_calls row counts its call's `of` (a ground boss its press's ground fields) at BOSS_CALL_RULES.winsToCall; the section is registered
//   EG-TOWER  hr_tower_start, signed in: a hero one Level under is refused tower_level { need, have } and NOTHING opens (no session, no run, no journal
//             row); the same key opens the climb at the Level (a refusal spends no key). A party: a seat one Level under refuses tower_party_level
//             naming it, nobody opens; raised, every seat climbs. The `entry_gates` section says each of these before the press (ok, short)
//   EG-CALL   hr_boss_call_view and hr_boss_call, signed in: a hero one natural win short (with a hundred CALLED wins, which never count) is quoted
//             call_wins with the count and refused uncharged; at the count it calls and pays once. A party: a seat one short refuses party_wins naming
//             it, nobody charged; at the count both enter, each charged once. The section says each
//   EG-COUNT  the count is the settle's: a hero one natural win short hunts the Sewer; with the browser closed and with the hunt viewed the Rat King's
//             kills land on his counter (the same count through both doors, at least one), the section turns ok and the quote opens; the called
//             row's counter never moves on a normal hunt
//   EG-IDEM   a second apply of the three files moves nothing: the schema's inventory, every body they state, the catalogue rows, the section row
//   EG-SELF   2027-05-05-entry-gates.sql's own §5 bites: the file with its door letting a hero one Level under through, or its quote taking a party
//             seat short of wins, is refused by its own self-check (the replay stops there)
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { bootReplay, inventory } from './schema-replay.mjs';

const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const { one, q, makeExec } = H;
const ROOT = H.ROOT;
const FILE = '2027-05-05-entry-gates.sql';
const FILES = ['2027-05-05-entry-gates-hunt-sessions-catalogue.generated.sql', '2027-05-05-entry-gates-tower-catalogue.generated.sql', FILE];
const { TOWER_RULES } = await import(pathToFileURL(join(ROOT, 'src/data/tower.js')).href);
const { BOSS_CALLS, BOSS_CALL_RULES } = await import(pathToFileURL(join(ROOT, 'src/data/boss-calls.js')).href);
const NEED = TOWER_RULES.minLevel, WINS = BOSS_CALL_RULES.winsToCall;
const KING = BOSS_CALLS.rat_king;
const [A, B, C] = H.UIDS;
const SPAN = 20 * 60000;
const idem = () => crypto.randomUUID();
/* jsonb orders an object's keys its own way: compare the canonical form */
const same = (a, b) => H.canon(a) === H.canon(b);
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
/* A verb as its signed-in client calls it (the rate gate cleared: these arms press a few times a second). */
async function as(db, uid, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await asUser(db, uid);
  const v = await one(db, sql, params);   // an error leaves the transaction aborted: it is the arm's, never masked here
  await asUser(db, '');
  return v;
}
const levelTo = (db, uid, L) => db.query('update public.player_state set level_xp = public.hr_char_xp_for_level($2) where user_id = $1 and slot = 0', [uid, L]);
const winsTo = (db, uid, boss, n) => db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at)
    values ($1, 0, 'stat', 'ev:kill_monster:' || $2, '', $3, now())
    on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value`, [uid, boss, n]);
const gates = (db, uid) => one(db, `select public.hr_state_of($1::uuid, 0)->'entry_gates'`, [uid]);
const nameOf = (db, uid) => one(db, 'select public.hr_character_name($1::uuid, 0)', [uid]);
const purse = async (db, uid) => Number(await one(db, 'select gold::text from public.account_wallet where user_id = $1', [uid]));
const openOf = async (db, uids) => Number(await one(db, 'select count(*)::int from public.hunt_sessions where user_id = any($1::uuid[]) and ended_at is null', [uids]));
const closeAll = (db, uids) => db.query(`select public.hr_hunt_close(h.id, 'died', now(), true) from public.hunt_sessions h where h.user_id = any($1::uuid[]) and h.ended_at is null`, [uids]);

async function boot() {
  const { db } = await bootReplay();
  await H.pinDice(db);
  return db;
}
/* The pinned uuids (H.pinDice) from one point, once an arm: rewound twice in one transaction, a party's id could be an instance's already there. */
const rewind = (db) => db.query("select setval('public.hr_test_uuid_seq', 1000, false)");
/* `uids` heroes at Level `level`, in town, each its own account's only hero with its own name; seated together, the first leading, when `party`. */
async function heroes(db, M, uids, { level, party = false, gold = 200000 } = {}) {
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await db.query("update public.hr_feature_switches set scope = 'everyone', accounts = '{}' where switch_id = 'burning_tower'");
  for (const uid of uids) {
    await H.character(db, M, uid, { level: 20, inv: { cooked_shrimp: 400 }, gold });
    await levelTo(db, uid, level);
    const named = await as(db, uid, 'select public.hr_character_name_set(0, $1, $2::uuid)', ['Gate' + 'abcdefgh'[H.UIDS.indexOf(uid)], idem()]);
    if (!named || named.ok !== true) throw new Error('harness: name refused: ' + JSON.stringify(named));
  }
  if (!party) return null;
  const pid = await one(db, 'select public.hr_party_open($1::uuid, 0)', [uids[0]]);
  for (const uid of uids.slice(1)) await db.query('select public.hr_party_seat_into($1::uuid, $2::uuid, 0)', [pid, uid]);
  return pid;
}

/* ── EG-DATA ──────────────────────────────────────────────────────────────── */
async function dataArm(db) {
  const bad = [];
  const r = (await q(db, 'select min_level from public.hr_tower_rules where id'))[0];
  if (!r || Number(r.min_level) !== NEED) bad.push(`EG-DATA hr_tower_rules.min_level reads ${r && r.min_level}, the data ${NEED}`);
  const rows = await q(db, 'select call_id, boss_id, wins, from_hunt from public.hr_boss_calls order by call_id');
  const want = Object.values(BOSS_CALLS).map((c) => c.id).sort();
  if (JSON.stringify(rows.map((x) => x.call_id)) !== JSON.stringify(want)) bad.push('EG-DATA hr_boss_calls holds ' + rows.map((x) => x.call_id) + ', the data ' + want);
  for (const x of rows) {
    const c = BOSS_CALLS[x.call_id];
    if (!c || x.boss_id !== c.of || Number(x.wins) !== WINS) bad.push(`EG-DATA call ${x.call_id} counts ${x.boss_id} x${x.wins}, the data ${c && c.of} x${WINS}`);
    const fielded = Number(await one(db, 'select count(*)::int from public.hr_hunt_ground_spawns where hunt_id = $1 and monster_id = $2', [x.from_hunt, x.boss_id]));
    if (fielded < 1) bad.push(`EG-DATA call ${x.call_id}: its press's ground ${x.from_hunt} fields no ${x.boss_id}, so nothing could ever count`);
  }
  if (Number(await one(db, "select count(*)::int from public.hr_state_sections where key = 'entry_gates' and fn = 'hr_entry_gates_view'")) !== 1) bad.push('EG-DATA the entry_gates section is not registered');
  if (!(NEED > 1) || !(WINS > 1)) bad.push(`EG-DATA CONTROL: a door at Level ${NEED} or ${WINS} wins tests no refusal`);
  return bad;
}

/* ── EG-TOWER ─────────────────────────────────────────────────────────────── */
async function towerArm(db, M) {
  return H.inTx(db, async () => {
    await rewind(db);
    const bad = [];
    await heroes(db, M, [A], { level: NEED - 1 });
    let g = (await gates(db, A)).tower;
    if (!same(g, { ok: false, need: NEED, level: NEED - 1, short: [] })) bad.push('EG-TOWER one Level under, the section reads ' + JSON.stringify(g));
    const key = idem();
    let v = await as(db, A, 'select public.hr_tower_start(0, 0, $1::uuid)', [key]);
    if (!v || v.error !== 'tower_level' || v.need !== NEED || v.have !== NEED - 1) bad.push('EG-TOWER one Level under, the door answered ' + JSON.stringify(v));
    if (await openOf(db, [A]) || Number(await one(db, 'select count(*)::int from public.tower_runs where user_id = $1', [A]))
        || Number(await one(db, "select count(*)::int from public.player_ledger where user_id = $1 and intent like 'tower_start%'", [A]))) bad.push('EG-TOWER a refused door opened or journalled something');
    await levelTo(db, A, NEED);
    g = (await gates(db, A)).tower;
    if (!g || g.ok !== true || g.level !== NEED) bad.push('EG-TOWER at the Level, the section reads ' + JSON.stringify(g));
    v = await as(db, A, 'select public.hr_tower_start(0, 0, $1::uuid)', [key]);
    if (!v || v.ok !== true || v.floor !== 1) bad.push('EG-TOWER at the Level, the same key answered ' + JSON.stringify(v));
    await closeAll(db, [A]);
    /* A PARTY: the leader at the Level, a seat one under */
    const pid = await heroes(db, M, [B, C], { level: NEED, party: true });
    await levelTo(db, C, NEED - 1);
    const cName = await nameOf(db, C);
    g = (await gates(db, B)).tower;
    if (!g || g.ok !== false || !same(g.short, [{ name: cName, seat: 1, level: NEED - 1 }])) bad.push('EG-TOWER a seat under, the leader\'s section reads ' + JSON.stringify(g));
    v = await as(db, B, 'select public.hr_tower_start(0, 0, $1::uuid)', [idem()]);
    if (!v || v.error !== 'tower_party_level' || v.who !== cName || v.need !== NEED || v.have !== NEED - 1) bad.push('EG-TOWER a seat under, the door answered ' + JSON.stringify(v));
    if (await openOf(db, [B, C])) bad.push('EG-TOWER a refused party door opened a session');
    await levelTo(db, C, NEED);
    if ((await gates(db, B)).tower.ok !== true) bad.push('EG-TOWER every seat at the Level, the section reads ' + JSON.stringify((await gates(db, B)).tower));
    v = await as(db, B, 'select public.hr_tower_start(0, 0, $1::uuid)', [idem()]);
    const runs = Number(await one(db, 'select count(*)::int from public.tower_runs where instance_id = (select instance_id from public.hunt_sessions where user_id = $1 and ended_at is null)', [B]));
    if (!v || v.ok !== true || runs !== 2 || !pid) bad.push(`EG-TOWER every seat at the Level, the door answered ${JSON.stringify(v).slice(0, 200)} (${runs} runs)`);
    return bad;
  });
}

/* ── EG-CALL ──────────────────────────────────────────────────────────────── */
async function callArm(db, M) {
  return H.inTx(db, async () => {
    await rewind(db);
    const bad = [];
    await heroes(db, M, [A], { level: 60 });
    await winsTo(db, A, KING.of, WINS - 1);
    await winsTo(db, A, KING.monster, 100);   // a hundred CALLED wins: the call's own counter, which never earns the next call
    const quote = async (uid) => { const r = await as(db, uid, `select public.hr_boss_call_view(0, $1)`, [KING.id]); return r && r.quote; };
    let qt = await quote(A);
    if (!qt || qt.available !== false || qt.why !== 'call_wins' || !same(qt.wins, { boss: KING.of, have: WINS - 1, need: WINS, short: [] })) bad.push('EG-CALL one win short, the quote reads ' + JSON.stringify(qt && { why: qt.why, wins: qt.wins }));
    let g = (await gates(db, A)).calls[KING.id];
    if (!same(g, { ok: false, boss: KING.of, have: WINS - 1, need: WINS, short: [] })) bad.push('EG-CALL one win short, the section reads ' + JSON.stringify(g));
    const g0 = await purse(db, A);
    let v = await as(db, A, 'select public.hr_boss_call(0, $1, 1, $2::bigint, $3::uuid)', [KING.id, qt ? qt.price : 0, idem()]);
    if (!v || v.error !== 'call_wins' || !v.boss_call || v.boss_call.wins.have !== WINS - 1) bad.push('EG-CALL one win short, the call answered ' + JSON.stringify(v && { error: v.error, ok: v.ok }));
    if (await purse(db, A) !== g0 || await openOf(db, [A]) || Number(await one(db, "select count(*)::int from public.player_ledger where user_id = $1 and intent like 'boss\\_call:%'", [A]))) bad.push('EG-CALL a refused call charged or opened something');
    await winsTo(db, A, KING.of, WINS);
    qt = await quote(A);
    if (!qt || qt.available !== true || qt.wins.have !== WINS || (await gates(db, A)).calls[KING.id].ok !== true) bad.push('EG-CALL at the count, the quote reads ' + JSON.stringify(qt && { why: qt.why, wins: qt.wins }));
    v = await as(db, A, 'select public.hr_boss_call(0, $1, 1, $2::bigint, $3::uuid)', [KING.id, qt ? qt.price : 0, idem()]);
    if (!v || v.ok !== true || await purse(db, A) !== g0 - (qt ? qt.price : 0) || await openOf(db, [A]) !== 1) bad.push('EG-CALL at the count, the call answered ' + JSON.stringify(v && { error: v.error, ok: v.ok }));
    /* A PARTY: the leader at the count, a seat one short */
    await heroes(db, M, [B, C], { level: 60, party: true });
    await winsTo(db, B, KING.of, WINS);
    await winsTo(db, C, KING.of, WINS - 1);
    const cName = await nameOf(db, C);
    qt = await quote(B);
    if (!qt || qt.why !== 'party_wins' || qt.who !== cName || !same(qt.wins.short, [{ name: cName, have: WINS - 1 }]) || qt.wins.have !== WINS) bad.push('EG-CALL a seat one short, the leader\'s quote reads ' + JSON.stringify(qt && { why: qt.why, who: qt.who, wins: qt.wins }));
    g = (await gates(db, B)).calls[KING.id];
    if (!g || g.ok !== false || !same(g.short, [{ name: cName, have: WINS - 1, seat: 1 }])) bad.push('EG-CALL a seat one short, the leader\'s section reads ' + JSON.stringify(g));
    const pb = await purse(db, B), pc = await purse(db, C);
    v = await as(db, B, 'select public.hr_boss_call(0, $1, 1, $2::bigint, $3::uuid)', [KING.id, qt ? qt.price : 0, idem()]);
    if (!v || v.error !== 'party_wins' || await purse(db, B) !== pb || await purse(db, C) !== pc || await openOf(db, [B, C])) bad.push('EG-CALL a seat one short, the call answered ' + JSON.stringify(v && { error: v.error, ok: v.ok }) + ' (or charged)');
    await winsTo(db, C, KING.of, WINS);
    qt = await quote(B);
    v = await as(db, B, 'select public.hr_boss_call(0, $1, 1, $2::bigint, $3::uuid)', [KING.id, qt ? qt.price : 0, idem()]);
    if (!v || v.ok !== true || await openOf(db, [B, C]) !== 2 || await purse(db, B) !== pb - qt.price || await purse(db, C) !== pc - qt.price) bad.push('EG-CALL every seat at the count, the call answered ' + JSON.stringify(v && { error: v.error, ok: v.ok }));
    return bad;
  });
}

/* ── EG-COUNT: the Sewer, both doors ──────────────────────────────────────── */
const HAMMER = Object.freeze({ weapon: 'iron_warhammer', body: 'iron_platebody', helmet: 'iron_helm', pants: 'iron_platelegs', boots: 'iron_boots' });
async function sewer(db, M, door) {
  return H.inTx(db, async () => {
    await rewind(db);
    await heroes(db, M, [A], { level: 20 });
    for (const [slot, item] of Object.entries(HAMMER)) {
      await db.query('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, $2, $3) on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id', [A, slot, item]);
    }
    await winsTo(db, A, KING.of, WINS - 1);
    await db.query('update public.hr_tick_config set enabled = true where id');
    const e = await as(db, A, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [KING.from, idem()]);
    if (!e || e.ok !== true) return { err: 'the Sewer would not open: ' + JSON.stringify(e) };
    const before = await gates(db, A);
    const sid = e.session.id;
    const t = `date_trunc('second', now() - make_interval(mins => ${SPAN / 60000 + 1}))`;
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
    const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
    await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
    const from = Number(await one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1', [inst]));
    const exec = makeExec(db);
    const cuts = door === 'closed' ? [from + SPAN] : [from + 7001, from + 61234, from + 200001, from + 333333, from + 600000, from + SPAN];
    for (const at of cuts) {
      for (let guard = 0; guard < 80; guard++) {
        const s = (await q(db, 'select settled_to, ended_at from public.hunt_sessions where id = $1', [sid]))[0];
        if (s.ended_at || Date.parse(s.settled_to) >= at) break;
        if (door === 'closed') {
          await db.query('delete from public.hunt_tick_lease');
          const r = (await M.TK.runTick({ exec, grounds: {}, atMs: at, body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts: [{ user_id: A, slot: 0, session_id: sid }] } })).body;
          if (!r.hunts || r.hunts.settled < 1) return { err: 'the world tick settled nothing: ' + JSON.stringify(r.hunts || r).slice(0, 300) };
        } else {
          const v = await M.HS.settleHunt({ exec, user: A, slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs: at, minWindowMs: 0, grounds: {} });
          if (v.outcome !== 'paid') return { err: 'the player\'s settle answered ' + JSON.stringify({ o: v.outcome, r: v.reason }).slice(0, 300) };
        }
      }
    }
    const qt = await as(db, A, 'select public.hr_boss_call_quote($1::uuid, 0, $2)', [A, KING.id]);
    return { before: before.calls[KING.id], after: (await gates(db, A)).calls[KING.id], quote: qt && { why: qt.why, wins: qt.wins },
      called: Number(await one(db, "select coalesce(max(value), 0)::int from public.player_progress where user_id = $1 and kind = 'stat' and period_key = '' and key = 'ev:kill_monster:' || $2", [A, KING.monster])),
      settled: Number(await one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_sessions where id = $1', [sid])) - from };
  });
}
async function countArm(db, M) {
  const bad = [];
  const got = {};
  for (const door of ['closed', 'viewed']) {
    const tag = `EG-COUNT the ${door === 'closed' ? 'browser closed' : 'hunt viewed'}:`;
    const r = await sewer(db, M, door);
    if (r.err) { bad.push(`${tag} ${r.err}`); continue; }
    got[door] = r;
    if (!r.before || r.before.have !== WINS - 1 || r.before.ok !== false) bad.push(`${tag} before the hunt the section reads ${JSON.stringify(r.before)}`);
    if (!(r.settled >= SPAN - 1000)) bad.push(`${tag} CONTROL: the hunt settled ${r.settled} ms of ${SPAN}`);
    if (!r.after || !(r.after.have >= WINS) || r.after.ok !== true) bad.push(`${tag} after ${SPAN / 60000} minutes in the Sewer the section reads ${JSON.stringify(r.after)} (no Rat King kill counted)`);
    if (!r.quote || r.quote.why !== null || !(r.quote.wins.have >= WINS)) bad.push(`${tag} after the kills the quote reads ${JSON.stringify(r.quote)}`);
    if (r.called !== 0) bad.push(`${tag} a normal hunt moved the called row's counter to ${r.called}`);
  }
  if (got.closed && got.viewed && got.closed.after && got.viewed.after && got.closed.after.have !== got.viewed.after.have) {
    bad.push(`EG-COUNT the two doors disagree: ${got.closed.after.have} wins with the browser closed, ${got.viewed.after.have} with the hunt viewed`);
  }
  return bad;
}

/* ── EG-IDEM ──────────────────────────────────────────────────────────────── */
const SIGS = ['hr_tower_start(integer,integer,uuid)', 'hr_boss_call_quote(uuid,integer,text)', 'hr_boss_wins(uuid,integer,text)', 'hr_entry_gates_view(uuid,integer)'];
let SQL_EDIT = null;   // a planted edit of one file's text (the mutants' sql form)
const fileText = (f) => {
  const t = readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
  return SQL_EDIT && SQL_EDIT.file === f ? SQL_EDIT.edits.reduce((s, [a, b]) => s.replace(a, () => b), t) : t;
};
async function idemArm(db) {
  return H.inTx(db, async () => {
    await rewind(db);
    const bad = [];
    const snap = async () => JSON.stringify([await inventory(db),
      await q(db, `select string_agg(md5(replace(prosrc, chr(13), '')), ',' order by oid::regprocedure::text) m from pg_proc where oid = any (array[${SIGS.map((s) => `'public.${s}'::regprocedure`).join(',')}])`),
      await q(db, 'select * from public.hr_tower_rules'), await q(db, 'select * from public.hr_boss_calls order by call_id'),
      await q(db, "select key, fn, note from public.hr_state_sections where key = 'entry_gates'"),
      await q(db, "select count(*)::int n, md5(string_agg(floor || ':' || level || ':' || xp_max, ',' order by floor)) from public.hr_tower_floors")]);
    const before = await snap();
    for (const f of FILES) {
      try { await db.exec(fileText(f)); } catch (e) { bad.push(`EG-IDEM the second apply of ${f} RAISED: ` + String(e.message).split('\n')[0]); return bad; }
    }
    if (await snap() !== before) bad.push('EG-IDEM the second apply moved the schema, a body, a catalogue row or the section row');
    return bad;
  });
}

/* ── EG-SELF: the file's own §5 refuses a door that lets the short through ─────── */
async function selfArm() {
  const bad = [];
  for (const [name, find, repl, want] of SELF_PLANTS) {
    let err = null;
    try {
      const { db } = await bootReplay({ patches: new Map([[FILE, [[find, repl]]]]), upTo: FILE });
      await db.close();
    } catch (e) { err = String(e && e.message); }
    if (!err || !want.test(err)) bad.push(`EG-SELF ${name}: the file applied ${err ? 'refused for another reason: ' + err.slice(0, 200) : 'cleanly'}`);
  }
  return bad;
}
const SELF_PLANTS = [
  ['the door lets a hero one Level under through', '    if v_lv < v_need then\n      v_no := jsonb_build_object(\'ok\', false, \'error\', \'tower_level\'', '    if v_lv < v_need - 1 then\n      v_no := jsonb_build_object(\'ok\', false, \'error\', \'tower_level\'', /entry-gates §5\(b\)/],
  ['the quote takes a party seat short of wins', "    if v_gate is null and v_won < r.wins then\n", "    if v_gate is null and v_won < r.wins and v_m.user_id = p_user then\n", /entry-gates §5\(e\)/],
];

const ARMS = { data: dataArm, tower: towerArm, call: callArm, count: countArm, idem: idemArm };

/* ── THE MUTANTS: each a defect the gates exist to refuse, planted in the booted chain's live body ─────────────── */
const FN = { start: 'public.hr_tower_start(integer,integer,uuid)', quote: 'public.hr_boss_call_quote(uuid,integer,text)', wins: 'public.hr_boss_wins(uuid,integer,text)',
  view: 'public.hr_entry_gates_view(uuid,integer)' };
const MUTANTS = [
  { name: 'the door asks no Level', arm: 'tower', want: /^EG-TOWER one Level under, the door/, fn: FN.start, find: '    if v_lv < v_need then\n', replace: '    if false then\n' },
  { name: 'the door asks only the hero, not its seats', arm: 'tower', want: /^EG-TOWER a seat under, the door/, fn: FN.start,
    find: "      if found then\n        v_no := jsonb_build_object('ok', false, 'error', 'tower_party_level'", replace: "      if false then\n        v_no := jsonb_build_object('ok', false, 'error', 'tower_party_level'" },
  { name: 'a missing door Level lets every hero through', arm: 'tower', want: /^EG-TOWER one Level under, the door/, fn: FN.start,
    find: '    select r.min_level into v_need from public.hr_tower_rules r where r.id;\n    if v_need is null then', replace: '    v_need := null;\n    if false then' },
  { name: 'the quote asks no wins', arm: 'call', want: /^EG-CALL one win short, the (quote|call)/, fn: FN.quote,
    find: "  if v_gate is not null and v_why is distinct from 'call_leader' then", replace: '  if false then' },
  { name: 'the quote counts the called row\'s wins', arm: 'call', want: /^EG-CALL one win short, the (quote|call)/, fn: FN.quote,
    find: 'v_won := public.hr_boss_wins(v_m.user_id, v_m.slot, r.boss_id);', replace: 'v_won := public.hr_boss_wins(v_m.user_id, v_m.slot, r.monster_id);' },
  { name: 'the quote asks only the caller', arm: 'call', want: /^EG-CALL a seat one short/, fn: FN.quote,
    find: '    if v_gate is null and v_won < r.wins then\n', replace: '    if v_gate is null and v_won < r.wins and v_m.user_id = p_user and v_m.slot = p_slot then\n' },
  { name: 'the count reads another period', arm: 'count', want: /^EG-COUNT/, fn: FN.wins, find: "and p.period_key = ''", replace: "and p.period_key = 'day'" },
  { name: 'the section\'s Tower ok forgets the seats', arm: 'tower', want: /^EG-TOWER a seat under, the leader's section/, fn: FN.view,
    find: "'ok', v_lv >= v_need and v_short = '[]'::jsonb", replace: "'ok', v_lv >= v_need" },
  { name: 'the section\'s calls always read ok', arm: 'call', want: /^EG-CALL one win short, the section/, fn: FN.view,
    find: "'ok', v_have >= c.wins and v_short = '[]'::jsonb", replace: "'ok', true" },
  { name: 'the section misreads the hero\'s Level', arm: 'tower', want: /^EG-TOWER/, fn: FN.view,
    find: "    if v_need is not null then\n      v_lv := coalesce(public.hr_level_of(p_user, p_slot), 1);", replace: "    if v_need is not null then\n      v_lv := coalesce(public.hr_level_of(p_user, p_slot), 1) + 1;" },
  { name: 'a second apply moves the section row', arm: 'idem', want: /^EG-IDEM/, sql: { file: FILE, edits: [["  on conflict (key) do update set fn = excluded.fn, note = excluded.note;\n\n-- ── §5", "  on conflict (key) do update set fn = excluded.fn, note = excluded.note || '.';\n\n-- ── §5"]] } },
];

async function runArm(db, M, name) {
  try { return await ARMS[name](db, M); } catch (e) { return ['THREW ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
}

async function main() {
  let db;
  try { db = await boot(); } catch (e) { console.error('entry-gates: the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
  const M = await H.loadEdge(ROOT);
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    let escaped = 0;
    for (const m of list) {
      let got = [];
      if (m.fn) {
        const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split('\r').join('');
        if (def.split(m.find).length !== 2) { console.error(`HARNESS: ${m.fn} has no single ${JSON.stringify(m.find.slice(0, 70))}`); process.exit(2); }
        await db.exec(def.replace(m.find, () => m.replace));
        try { got = await runArm(db, M, m.arm); } finally { await db.exec(def); }
      } else {
        const text = readFileSync(join(ROOT, 'supabase', 'migrations', m.sql.file), 'utf8').replace(/\r\n/g, '\n');
        for (const [a] of m.sql.edits) if (text.split(a).length !== 2) { console.error(`HARNESS: ${m.sql.file} has no single ${JSON.stringify(a.slice(0, 70))}`); process.exit(2); }
        SQL_EDIT = m.sql;
        try { got = await runArm(db, M, m.arm); } finally { SQL_EDIT = null; }
      }
      const hit = got.some((x) => m.want.test(x));
      if (!hit) escaped++;
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${m.name}: ${String(got[0] || 'every check held').slice(0, 160)}`);
    }
    /* the file's own §5 (EG-SELF) is its own proof: each plant must be refused by the replay itself */
    const self = await selfArm();
    for (const p of self) { escaped++; console.log('  ESCAPED ' + p); }
    if (!self.length) console.log(`  caught ${SELF_PLANTS.length} planted door(s) by the file's own §5`);
    console.log(escaped ? `entry-gates --mutate: ${escaped} ESCAPED` : `entry-gates --mutate: ${list.length + SELF_PLANTS.length}/${list.length + SELF_PLANTS.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const bad = [];
  for (const name of Object.keys(ARMS)) {
    if (only && name !== only) continue;
    const got = await runArm(db, M, name);
    console.log((got.length ? '✗ ' : '✓ ') + name);
    bad.push(...got);
  }
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? `entry-gates: ${bad.length} FAILED` : 'entry-gates: green (the data, the Tower\'s Level, the call\'s natural wins, the count through both doors, a second apply)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
