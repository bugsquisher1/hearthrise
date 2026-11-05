#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/boss-call-db.mjs — CALL OUT ON THE REPLAYED CHAIN WITH THE SHIPPED EDGE (supabase/migrations/2027-03-02-boss-call.sql; the engine's half is tests/boss-call.mjs).
//
//   node tests/boss-call-db.mjs            the guard
//   node tests/boss-call-db.mjs --mutate   every planted defect must turn it red
//
// mutant-anchors: supabase/migrations/2027-03-02-boss-call.sql
//
//   BD-WORDS   every refusal: a party of one, a member, a stale price, an unknown call, each in its code, each charging nothing and opening nothing
//   BD-CHARGE  the leader pays the server's price, one ledger row kind shop; the member pays nothing; a replayed key charges once and answers the same
//   BD-PURSE   a purse that can't pay refuses and rolls every seat back out; the door shuts behind it
//   BD-LIMIT   3 a UTC day across this account's heroes; midnight UTC opens the next three
//   BD-DOOR    no other door reaches the room: enter, Start, Hunt again, a move mid-hunt, a member's join: none opens a session; a normal ground is untouched
//   BD-FORGED  a window on a called room that pays anything is refused whole, by the settle, whatever the engine proposed: coin, an item, XP, Level XP, a kill, a Hearthfind
//   BD-BOTH    the kill, a death and the limit, each with the browser closed (the tick) and the hunt viewed (index.ts's settle): the same end on the same instant, no hunt left open
//   BD-PAID    after each: no XP, no coin but the fee and the store's bill, no loot, no kill in the tally, no Bestiary row, the Bestiary's total unmoved, the party on its ground
//   BD-PRIZE   the kill reaches the title's counter for each hero present; price 0, once; one System line a fight; nothing without the kill
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';
import { setGold } from './_gold.mjs';
import { BOSS_CALLS, BOSS_CALL_RULES } from '../src/data/boss-calls.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const EM = (await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href + V)).MONSTERS;
const PM = (await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href)).MONSTERS;
const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const { one, q } = H;
const KING = BOSS_CALLS.rat_king;
const FEE = KING.fee;
const UIDS = Array.from({ length: 8 }, (_, i) => '00000000-0000-4000-8000-0000000bc0' + String(i + 10));
const WINDOW = 90000;
const GEAR = Object.freeze({ helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots', weapon: 'steel_sword', shield: 'coppercap_shield' });
const STAFF = Object.freeze({ helmet: 'scholar_helmet', body: 'scholar_body', pants: 'scholar_pants', boots: 'scholar_boots', weapon: 'willow_staff' });
const idem = () => crypto.randomUUID();
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const purse = async (db, uid) => Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [uid]));

async function as(db, uid, sql, params) {
  await db.query('begin');
  await asUser(db, uid);
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  try { const v = await one(db, sql, params); await db.query('commit'); return v; } catch (e) { await db.query('rollback'); throw e; }
}
const call = (db, uid, price, key, id = 'rat_king', slot = 0) => as(db, uid, 'select public.hr_boss_call($1, $2, $3, $4::uuid)', [slot, id, price, key || idem()]);
const openIn = async (db, party) => Number(await one(db, 'select count(*) from public.hunt_sessions where instance_id = $1 and ended_at is null', [party]));

/* A party on no ground: `n` heroes, one account each. */
async function party(db, M, uids, { level = 60, gold = 200000, gear = [GEAR, STAFF, GEAR, GEAR], names = 'Bossb' } = {}) {
  const kit = { level, inv: { cooked_shrimp: 400 }, gold };
  for (const [i, uid] of uids.entries()) {
    await db.query('begin');
    await H.character(db, M, uid, kit);
    await db.query('commit');
    for (const [slot, item] of Object.entries(gear[i] || {})) {
      await db.query('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, $2, $3) on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id', [uid, slot, item]);
    }
    const named = await as(db, uid, 'select public.hr_character_name_set(0, $1, $2::uuid)', [names + String.fromCharCode(97 + i), idem()]);
    if (!named || named.ok !== true) throw new Error('harness: name refused: ' + JSON.stringify(named));
  }
  const inv = await as(db, uids[0], 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', [names + 'b', idem()]);
  if (!inv || inv.ok !== true) throw new Error('harness: invite refused: ' + JSON.stringify(inv));
  const id = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [uids[0]]);
  const listed = await as(db, uids[0], 'select public.hr_hunt_party_list(0, true, $1::uuid)', [idem()]);
  if (!listed || listed.ok !== true) throw new Error('harness: list refused: ' + JSON.stringify(listed));
  for (const uid of uids.slice(1)) {
    const j = await as(db, uid, 'select public.hr_hunt_party_join(0, $1::uuid, $2::uuid)', [id, idem()]);
    if (!j || j.ok !== true) throw new Error('harness: join refused: ' + JSON.stringify(j));
  }
  return id;
}

/* ── THE VERB ─────────────────────────────────────────────────────────────── */
async function verbArms(db, M) {
  const bad = [];
  const [a, b] = UIDS;
  await db.query('begin');
  await H.character(db, M, a, { level: 20, gold: 100000 });
  await db.query('commit');
  /* BD-WORDS: a hero with no party, then a party of one */
  let v = await call(db, a, FEE);
  if (v.error !== 'call_party') bad.push('BD-WORDS no party answered ' + JSON.stringify(v));
  await db.query(`select public.hr_party_open($1::uuid, 0)`, [a]);
  v = await call(db, a, FEE);
  if (v.error !== 'call_party') bad.push('BD-WORDS a party of one answered ' + JSON.stringify(v));
  await db.query('begin');
  await H.character(db, M, b, { level: 20, gold: 100000 });
  await db.query('commit');
  const pid = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [a]);
  await db.query('select public.hr_party_seat_into($1::uuid, $2::uuid, 0)', [pid, b]);
  v = await call(db, b, FEE);
  if (v.error !== 'call_leader') bad.push('BD-WORDS a member answered ' + JSON.stringify(v));
  v = await call(db, a, FEE + 1);
  if (v.error !== 'quote_changed' || !v.boss_call || Number(v.boss_call.price) !== FEE) bad.push('BD-WORDS a stale price answered ' + JSON.stringify(v));
  v = await call(db, a, 1);
  if (v.error !== 'quote_changed') bad.push('BD-WORDS a forged low price answered ' + JSON.stringify(v));
  v = await call(db, a, FEE, null, 'no_such_call');
  if (v.error !== 'call_unknown') bad.push('BD-WORDS an unknown call answered ' + JSON.stringify(v));
  if (await purse(db, a) !== 100000 || await purse(db, b) !== 100000 || Number(await one(db, 'select count(*) from public.hunt_sessions where instance_id = $1', [pid]))) bad.push('BD-WORDS a refusal moved something');

  /* BD-DOOR: the leader's own Start, an enter, nobody in the room */
  v = await as(db, a, 'select public.hr_hunt_party_start(0, $1, $2::uuid)', [KING.hunt, idem()]);
  if (v.error !== 'not_ready' || !v.seats || v.seats[0].error !== 'call_only') bad.push('BD-DOOR Start answered ' + JSON.stringify(v));
  v = await as(db, a, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [KING.hunt, idem()]);
  if (v.ok === true) bad.push('BD-DOOR an enter walked in: ' + JSON.stringify(v));
  if (await openIn(db, pid)) bad.push('BD-DOOR a refused door opened a session');
  const [c] = UIDS.slice(4);
  await db.query('begin');
  await H.character(db, M, c, { level: 20, gold: 100000 });
  await db.query('commit');
  v = await as(db, c, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [KING.hunt, idem()]);
  if (v.error !== 'call_only') bad.push('BD-DOOR a lone hero\'s enter answered ' + JSON.stringify(v));
  v = await as(db, c, `select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, $1::uuid)`, [idem()]);
  if (v.ok !== true) bad.push('BD-DOOR a normal ground refused a lone hero: ' + JSON.stringify(v));
  v = await as(db, c, 'select public.hr_hunt_change(0, $1, $2::uuid)', [KING.hunt, idem()]);
  if (v.error !== 'call_only') bad.push('BD-DOOR a move mid-hunt answered ' + JSON.stringify(v));

  /* BD-CHARGE */
  const key = idem();
  v = await call(db, a, FEE, key);
  if (v.ok !== true) bad.push('BD-CHARGE the call answered ' + JSON.stringify(v));
  if (await purse(db, a) !== 100000 - FEE) bad.push('BD-CHARGE the leader\'s purse reads ' + await purse(db, a));
  if (await purse(db, b) !== 100000) bad.push('BD-CHARGE the member paid: ' + await purse(db, b));
  if (await openIn(db, pid) !== 2) bad.push('BD-CHARGE ' + await openIn(db, pid) + ' heroes in the room, want 2');
  const rows = await q(db, `select slot, kind, intent, gold from public.player_ledger where user_id = $1 and intent like 'boss\\_call:%'`, [a]);
  if (rows.length !== 1 || rows[0].kind !== 'shop' || rows[0].intent !== `boss_call:rat_king:${FEE}`) bad.push('BD-CHARGE the ledger reads ' + JSON.stringify(rows));
  const again = await call(db, a, FEE, key);
  if (await purse(db, a) !== 100000 - FEE || Number(await one(db, `select count(*) from public.player_ledger where user_id = $1 and intent like 'boss\\_call:%'`, [a])) !== 1) bad.push('BD-CHARGE a replay charged again: ' + JSON.stringify(again));
  /* BD-DOOR: a member can't walk in behind them; a hero in the room can't change or restart out of it for free */
  v = await as(db, a, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [KING.hunt, idem()]);
  if (v.ok === true) bad.push('BD-DOOR a second enter walked in');

  /* BD-PURSE, on a fresh party: every seat out again */
  await db.query(`select public.hr_hunt_close(h.id, 'server', now(), true) from public.hunt_sessions h where h.instance_id = $1 and h.ended_at is null`, [pid]);
  await setGold((sql, p) => db.query(sql, p).then((r) => r.rows), a, 0, FEE - 1);
  v = await call(db, a, FEE);
  if (v.error !== 'insufficient_gold') bad.push('BD-PURSE a short purse answered ' + JSON.stringify(v));
  if (await openIn(db, pid)) bad.push('BD-PURSE a short purse left ' + await openIn(db, pid) + ' in the room');
  if (await purse(db, a) !== FEE - 1) bad.push('BD-PURSE a refused call charged');
  if ((await one(db, `select current_setting('hr.boss_call', true)`)) && (await one(db, `select current_setting('hr.boss_call', true)`)) !== '') bad.push('BD-PURSE the door stayed open');

  /* BD-LIMIT: rows of today from another of this account's heroes count; yesterday's don't; midnight opens three more */
  await setGold((sql, p) => db.query(sql, p).then((r) => r.rows), a, 0, 1000000);
  await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, at)
      select $1, 1, 'shop', 'boss_call:rat_king:' || $2::text, 0, '{}'::jsonb, public.hr_utc_day_start(now()) - interval '1 second' from generate_series(1, 5)`, [a, FEE]);
  let quote = await as(db, a, `select public.hr_boss_call_view(0, 'rat_king')`);
  if (!quote.ok || quote.quote.used !== 1 || quote.quote.left !== 2) bad.push('BD-LIMIT yesterday counted: ' + JSON.stringify(quote));
  await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, meta) select $1, 1, 'shop', 'boss_call:rat_king:' || $2::text, 0, '{}'::jsonb from generate_series(1, 2)`, [a, FEE]);
  v = await call(db, a, FEE);
  if (v.error !== 'call_limit') bad.push('BD-LIMIT the fourth call, across slots, answered ' + JSON.stringify(v));
  quote = await as(db, a, `select public.hr_boss_call_view(0, 'rat_king')`);
  if (!quote.ok || quote.quote.available !== false || quote.quote.why !== 'call_limit' || quote.quote.left !== 0) bad.push('BD-LIMIT the page reads ' + JSON.stringify(quote));
  await db.query('begin');
  await db.query(`select set_config('hr.test_now', (public.hr_utc_day_start(now()) + interval '1 day 1 minute')::text, true)`);
  await asUser(db, a);
  const tomorrow = await one(db, `select public.hr_boss_call_quote($1::uuid, 0, 'rat_king')`, [a]);
  await db.query('rollback');
  if (tomorrow.used !== 0 || tomorrow.available !== true) bad.push('BD-LIMIT midnight UTC reads ' + JSON.stringify(tomorrow));
  return bad;
}

/* ── THE FIGHT ON THE SERVER, BOTH DOORS ──────────────────────────────────── */
async function backdate(db, party, anchorMs) {
  const t = `to_timestamp(${Math.floor(anchorMs / 1000)})`;
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where instance_id = $1 and ended_at is null`, [party]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [party]);
}
const makeExec = (db) => async (text, params) => { await db.exec('set role hr_engine'); try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); } };

async function fightToEnd(db, M, door, uids, party, anchorMs) {
  const exec = makeExec(db);
  await db.query('update public.hr_tick_config set enabled = true where id');
  const sids = (await q(db, 'select user_id, id from public.hunt_sessions where instance_id = $1 and ended_at is null order by seat', [party]));
  for (let w = 1, n = Math.ceil(BOSS_CALL_RULES.limitMs / WINDOW) + 2; w <= n && await openIn(db, party); w++) {
    const atMs = anchorMs + w * WINDOW;
    if (door === 'fire') {
      await db.query('delete from public.hunt_tick_lease');
      const r = (await M.TK.runTick({ exec, atMs, body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: WINDOW, hunts: sids.map((s) => ({ user_id: s.user_id, slot: 0, session_id: s.id })) } })).body;
      if (!r.hunts || r.hunts.settled < 1) throw new Error('fire settled nothing: ' + JSON.stringify(r.hunts || r).slice(0, 300));
    } else {
      const v = await M.HS.settleHunt({ exec, user: uids[0], slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs, minWindowMs: 0 });
      if (v.outcome !== 'paid') throw new Error('viewed settled nothing: ' + JSON.stringify({ o: v.outcome, r: v.reason, d: v.body && v.body.detail }).slice(0, 400));
    }
  }
  return (await q(db, 'select h.user_id, h.end_reason, h.ended_at, t.coins, t.kills, t.xp, t.loot, t.deaths from public.hunt_sessions h join public.hunt_session_tally t on t.session_id = h.id where h.instance_id = $1 order by h.seat', [party]));
}

const JOBS = [
  { name: 'the kill', want: ['boss_felled'], level: 60, uids: [0, 1], row: null },
  { name: 'a death', want: ['died', 'party_member_died'], level: 2, uids: [2, 3], gear: [{}, {}], row: null },
  { name: 'the limit', want: ['boss_time'], level: 60, uids: [4, 5], row: { hp: 100000000, atk: 1, baseAcc: 0 } },
];

async function bothDoors(door, boot) {
  const bad = [];
  const { db } = await boot();
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const ends = {};
  const row = EM[KING.monster];
  const keep = { hp: row.hp, atk: row.atk, baseAcc: row.baseAcc };
  for (const job of JOBS) {
    const uids = job.uids.map((i) => UIDS[i]);
    const anchorMs = Date.UTC(2026, 9, 25, 12, 0, 0);
    const pid = await party(db, M, uids, { level: job.level, gold: 200000, names: 'Boss' + job.uids[0], gear: job.gear });
    const lx0 = await q(db, 'select user_id, level_xp from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [uids]);
    const sk0 = await q(db, 'select user_id, skill_id, xp from public.player_skills where user_id = any($1::uuid[]) and slot = 0 order by user_id, skill_id', [uids]);
    const inv0 = await q(db, `select user_id, item_id, qty from public.player_inventory where user_id = any($1::uuid[]) and slot = 0 and item_id <> 'cooked_shrimp' order by user_id, item_id`, [uids]);
    const sheet0 = await q(db, 'select public.hr_character_sheet_view(u, 0)->$2 as b from unnest($1::uuid[]) u', [uids, 'bestiary']);
    const made = await call(db, uids[0], FEE);
    if (made.ok !== true) { bad.push(`BD-BOTH ${door} ${job.name}: the call answered ${JSON.stringify(made)}`); continue; }
    if (await one(db, 'select hunt_id from public.hunt_parties where id = $1', [pid]) !== KING.hunt) bad.push(`BD-BOTH ${door} ${job.name}: the party is not on the room`);
    await backdate(db, pid, anchorMs);
    if (job.row) for (const inst of [row, PM[KING.monster]]) Object.assign(inst, job.row);
    let got;
    try { got = await fightToEnd(db, M, door, uids, pid, anchorMs); } finally { for (const inst of [row, PM[KING.monster]]) Object.assign(inst, keep); }
    if (await openIn(db, pid)) bad.push(`BD-BOTH ${door} ${job.name}: ${await openIn(db, pid)} heroes still in the room`);
    const reasons = [...new Set(got.map((g) => g.end_reason))].sort();
    if (reasons.join() !== job.want.join()) bad.push(`BD-BOTH ${door} ${job.name}: ended ${reasons.join()}, want ${job.want.join()}`);
    ends[job.name] = got.map((g) => g.end_reason + '@' + new Date(g.ended_at).toISOString());
    if (job.name === 'the limit' && !got.every((g) => new Date(g.ended_at).getTime() === anchorMs + BOSS_CALL_RULES.limitMs)) bad.push(`BD-BOTH ${door} the limit ended at ${got.map((g) => g.ended_at)}`);
    /* BD-PAID */
    for (const g of got) {
      if (Number(g.coins) !== 0 || Number(g.kills) !== 0 || Object.keys(g.loot || {}).length || Object.entries(g.xp || {}).some(([, n]) => Number(n) > 0)) bad.push(`BD-PAID ${door} ${job.name}: the tally reads ${JSON.stringify({ c: g.coins, k: g.kills, l: g.loot, x: g.xp })}`);
    }
    const lx1 = await q(db, 'select user_id, level_xp from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [uids]);
    for (const [i, r] of lx1.entries()) if (Number(r.level_xp) > Number(lx0[i].level_xp)) bad.push(`BD-PAID ${door} ${job.name}: Level XP rose`);
    const sk1 = await q(db, 'select user_id, skill_id, xp from public.player_skills where user_id = any($1::uuid[]) and slot = 0 order by user_id, skill_id', [uids]);
    for (const [i, r] of sk1.entries()) if (sk0[i] && Number(r.xp) > Number(sk0[i].xp)) bad.push(`BD-PAID ${door} ${job.name}: ${r.skill_id} rose`);
    const inv1 = await q(db, `select user_id, item_id, qty from public.player_inventory where user_id = any($1::uuid[]) and slot = 0 and item_id <> 'cooked_shrimp' order by user_id, item_id`, [uids]);
    if (JSON.stringify(inv1) !== JSON.stringify(inv0)) bad.push(`BD-PAID ${door} ${job.name}: the bag moved: ${JSON.stringify(inv1).slice(0, 160)}`);
    const moved = await one(db, `select coalesce(sum(gold) filter (where gold > 0), 0) from public.player_ledger where user_id = any($1::uuid[]) and kind <> 'hunt'`, [uids]);
    if (Number(moved) !== 0 && job.level !== 60) bad.push(`BD-PAID ${door} ${job.name}: ${moved} gold came in`);
    if (Number(await one(db, `select count(*) from public.hunt_session_events e join public.hunt_sessions h on h.id = e.session_id where h.instance_id = $1 and e.type in ('rare_drop', 'level_up')`, [pid]))) bad.push(`BD-PAID ${door} ${job.name}: a rare or level event`);
    for (const uid of uids) {
      if (Number(await one(db, 'select count(*) from public.hr_bestiary_of($1::uuid, 0) b where b.monster_id = $2', [uid, KING.monster]))) bad.push(`BD-PAID ${door} ${job.name}: a Bestiary row`);
    }
    const sheet1 = await q(db, 'select public.hr_character_sheet_view(u, 0)->$2 as b from unnest($1::uuid[]) u', [uids, 'bestiary']);
    if (JSON.stringify(sheet1) !== JSON.stringify(sheet0)) bad.push(`BD-PAID ${door} ${job.name}: the Bestiary read moved: ${JSON.stringify(sheet1)}`);
    if (await one(db, 'select hunt_id from public.hunt_parties where id = $1', [pid]) !== KING.from) bad.push(`BD-PAID ${door} ${job.name}: the party stands on ${await one(db, 'select hunt_id from public.hunt_parties where id = $1', [pid])}`);
    /* BD-PRIZE */
    const counters = await q(db, `select user_id, value from public.player_progress where user_id = any($1::uuid[]) and slot = 0 and kind = 'stat' and period_key = '' and key = 'ev:kill_monster:' || $2`, [uids, KING.monster]);
    const felled = job.name === 'the kill';
    if (felled ? !(counters.length === uids.length && counters.every((c) => Number(c.value) === 1)) : counters.length) bad.push(`BD-PRIZE ${door} ${job.name}: the counters read ${JSON.stringify(counters)}`);
    const lines = Number(await one(db, `select count(*) from public.chat_messages m where m.channel = 'system' and m.from_id = any($1::uuid[]) and m.body like '%called out the Rat King%'`, [uids]));
    if (lines !== (felled ? 1 : 0)) bad.push(`BD-PRIZE ${door} ${job.name}: ${lines} System lines`);
    const before = await purse(db, uids[0]);
    const claim = await as(db, uids[0], `select public.hr_title_buy(0, 'grate_thief', 0, $1::uuid)`, [idem()]);
    if (felled ? claim.ok !== true : claim.error !== 'title_kills') bad.push(`BD-PRIZE ${door} ${job.name}: the claim answered ${JSON.stringify(claim)}`);
    if (await purse(db, uids[0]) !== before) bad.push(`BD-PRIZE ${door} ${job.name}: the claim moved gold`);
  }
  return { bad, ends };
}

/* BD-FORGED: the engine's own window, tampered between its proposal and its commit: the settle refuses, whole. */
async function forged(boot) {
  const bad = [];
  const { db } = await boot();
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const uids = UIDS.slice(0, 2);
  const pid = await party(db, M, uids, { level: 60, names: 'Bossf' });
  const made = await call(db, uids[0], FEE);
  if (made.ok !== true) return ['BD-FORGED the call answered ' + JSON.stringify(made)];
  const anchorMs = Date.UTC(2026, 9, 25, 12, 0, 0);
  await backdate(db, pid, anchorMs);
  const exec = makeExec(db);
  const P = [['coin', (d) => { d.gold = 5; }], ['an item', (d) => { d.items = { bones: 1 }; }], ['skill XP', (d) => { d.xp = { melee: 1 }; }], ['Level XP', (d) => { d.level_xp = 1; }],
    ['a kill', (d) => { d.journal.meta.kills = 1; d.journal.meta.km = { [KING.monster]: 1 }; }], ['a Hearthfind', (d) => { d.hearthfind = { item: 'bones', source_kind: 'monster', source_id: KING.monster }; }],
    ['another boss\'s counter', (d) => { d.progress = [{ kind: 'stat', key: 'ev:kill_monster:rat_king', period: '', add: 1, state: 'active' }]; }],
    ['a kill stat', (d) => { d.progress = [{ kind: 'stat', key: 'kills', period: '', add: 1, state: 'active' }]; }]];
  for (const [name, plantIt] of P) {
    const plan = await M.HS.readHuntSettle({ exec, user: uids[0], slot: 0, atMs: anchorMs + WINDOW }, 'tick');
    if (plan.answer) { bad.push('BD-FORGED harness: ' + plan.answer.reason); break; }
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    if (!p.out.accrued) { bad.push('BD-FORGED harness: nothing proposed: ' + p.out.reason); break; }
    plantIt(p.commit.members[0].delta);
    const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    const said = JSON.stringify(res);
    if (!res || res.ok === true || !said.includes('called_pays')) bad.push('BD-FORGED ' + name + ' answered ' + said.slice(0, 200));
    /* a refused window is a strike, and the sixth forfeits the hunt (the settle's fuse): each plant is judged alone */
    await db.query('update public.hunt_instances set refusals = 0 where id = $1', [pid]);
    await db.query('update public.hunt_sessions set refusals = 0 where instance_id = $1', [pid]);
  }
  /* A clean window still lands: the refusals above were the plants, not the room. */
  const plan = await M.HS.readHuntSettle({ exec, user: uids[0], slot: 0, atMs: anchorMs + WINDOW }, 'tick');
  if (plan.answer) return [...bad, 'BD-FORGED the clean window answered ' + plan.answer.reason];
  const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
  const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
  if (!res || res.ok !== true) bad.push('BD-FORGED the clean window was refused: ' + JSON.stringify(res).slice(0, 200));
  return bad;
}

const ARMS = {
  verb: async (boot) => { const { db } = await boot(); await H.pinDice(db); const M = await H.loadEdge(H.ROOT); await db.query('update public.hr_hunt_config set enabled = true where id'); return verbArms(db, M); },
  forged,
  doors: async (boot) => {
    const a = await bothDoors('fire', boot), b = await bothDoors('viewed', boot);
    const bad = [...a.bad, ...b.bad];
    for (const k of Object.keys(a.ends)) if (JSON.stringify(a.ends[k]) !== JSON.stringify(b.ends[k])) bad.push(`BD-BOTH ${k}: the browser closed ends ${JSON.stringify(a.ends[k])}, the hunt viewed ${JSON.stringify(b.ends[k])}`);
    return bad;
  },
};

const FN = { admit: 'public.hr_hunt_admit(uuid,integer,text)', apply: 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', verb: 'public.hr_boss_call(integer,text,bigint,uuid)', quote: 'public.hr_boss_call_quote(uuid,integer,text)',
  settle: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', best: 'public.hr_bestiary_of(uuid,integer)', closed: 'public.hr_boss_call_closed()', felled: 'public.hr_boss_call_felled()' };
const MUTANTS = [
  { name: 'every door opens the room', fn: FN.admit, find: "and current_setting('hr.boss_call', true) is distinct from p_hunt then", repl: 'and false then', arm: 'verb', want: /BD-DOOR/ },
  { name: 'a stale price is taken', fn: FN.verb, find: "if (v_q->>'price')::bigint <> p_price then", repl: 'if false then', arm: 'verb', want: /BD-WORDS/ },
  { name: 'the verb charges the client\'s number', fn: FN.verb, find: "'gold', -p_price,", repl: "'gold', -least(p_price, 1),", arm: 'verb', want: /BD-CHARGE/ },
  { name: 'a member may call', fn: FN.quote, find: "when not (v_p.leader_user = p_user and v_p.leader_slot = p_slot) then 'call_leader'", repl: "when false then 'call_leader'", arm: 'verb', want: /BD-WORDS/ },
  { name: 'a party of one may call', fn: FN.quote, find: 'or v_seats < r.party_min then', repl: 'then', arm: 'verb', want: /BD-WORDS/ },
  { name: 'the limit is per hero', fn: FN.quote, find: "where l.user_id = p_user and l.kind = 'shop'", repl: "where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop'", arm: 'verb', want: /BD-LIMIT/ },
  { name: 'the limit never turns over', fn: FN.quote, find: "and l.at >= public.hr_utc_day_start(now()))::int", repl: ')::int', arm: 'verb', want: /BD-LIMIT/ },
  { name: 'a short purse keeps the seats', fn: FN.verb, find: "v_no := v_a || jsonb_build_object('ok', false); raise exception using errcode = 'HR879', message = 'call_refused'; end if;", repl: "return v_a || jsonb_build_object('ok', false); end if;", arm: 'verb', want: /BD-PURSE/ },
  { name: 'the settle takes what a called window pays', fn: FN.apply, find: 'public.hr_boss_call_pays(p_delta, c.monster_id) is not null)', repl: 'false)', arm: 'forged', want: /BD-FORGED/ },
  { name: 'the money line lets XP through', fn: 'public.hr_boss_call_pays(jsonb,text)', find: "k not in ('accrued_to', 'hp', 'journal', 'progress', 'deaths')", repl: "k not in ('accrued_to', 'hp', 'journal', 'progress', 'deaths', 'xp')", arm: 'forged', want: /BD-FORGED/ },
  { name: 'the Bestiary counts him', fn: FN.best, find: "and pp.key not like '%\\_called'", repl: '', arm: 'doors', want: /BD-PAID/ },
  { name: 'the party stays on the room', fn: FN.closed, find: 'update public.hunt_parties p set hunt_id = v_from', repl: 'update public.hunt_parties p set hunt_id = p.hunt_id', arm: 'doors', want: /BD-PAID/ },
  { name: 'every hero posts a System line', fn: FN.felled, find: "and h.end_reason = 'boss_felled' and h.ended_at = new.ended_at", repl: 'and false', arm: 'doors', want: /BD-PRIZE/ },
  { name: 'the limit is not owed', fn: FN.settle, find: 'or exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and v_to > v_s.hunt_from + make_interval(secs => c.limit_ms / 1000.0) + c_skew) then', repl: 'then', arm: 'owed', want: /BD-OWED/ },
];

/* The limit, as the settle owes it: a window past it with no end is refused, whatever the engine proposed. */
ARMS.owed = async (boot) => {
  const bad = [];
  const { db } = await boot();
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const uids = UIDS.slice(0, 2);
  const pid = await party(db, M, uids, { level: 60, names: 'Bosso' });
  await call(db, uids[0], FEE);
  const anchorMs = Date.UTC(2026, 9, 25, 12, 0, 0);
  await backdate(db, pid, anchorMs);
  const exec = makeExec(db);
  /* Walk to a window with its end stripped from the proposal, past the limit and the skew. */
  await db.query(`update public.hunt_sessions set entered_at = entered_at - make_interval(secs => ${BOSS_CALL_RULES.limitMs / 1000 + 120}), hunt_from = hunt_from - make_interval(secs => ${BOSS_CALL_RULES.limitMs / 1000 + 120}) where instance_id = $1`, [pid]);
  const plan = await M.HS.readHuntSettle({ exec, user: uids[0], slot: 0, atMs: anchorMs + WINDOW }, 'tick');
  const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
  for (const m of p.commit.members) m.hunt.ended = null;
  const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
  if (!res || res.ok === true || !JSON.stringify(res).includes('end_missing')) bad.push('BD-OWED a window past the limit with no end answered ' + JSON.stringify(res).slice(0, 200));
  return bad;
};

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) {
      const bad = await ARMS.verb(() => bootReplay());
      console.log('boss-call-db --mutate: control ran the clean tree: ' + (bad.length ? bad.join('; ') : 'green'));
      process.exit(0);
    }
    let escaped = 0;
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    for (const m of list) {
      const boot = async () => {
        const b = await bootReplay();
        const def = (await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r/g, '');
        if (!def.includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 70)));
        await b.db.exec(def.replace(m.find, () => m.repl));
        return b;
      };
      let got = [];
      try { got = await ARMS[m.arm](boot); } catch (e) { if (/HARNESS/.test(String(e.message))) throw e; got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every check held').slice(0, 150));
    }
    console.log(escaped ? `boss-call-db --mutate: ${escaped} ESCAPED` : `boss-call-db --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const boot = () => bootReplay();
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const bad = [];
  for (const arm of Object.keys(ARMS)) if (!only || arm === only) bad.push(...await ARMS[arm](boot));
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? 'boss-call-db: ' + bad.length + ' FAILED' : 'boss-call-db: green (the verb, the one door, the forged windows, three ends through both doors, the prize)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
