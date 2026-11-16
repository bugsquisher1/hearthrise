#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/training-day.local.mjs — WHOLE TRAINING DAYS THROUGH THE WORLD TICK, ON THE REPLAYED CHAIN (a measuring tool, not a guard).
//
// tests/training-gear-db.mjs proves the training verbs and four minutes through both doors. The train-every-spare-hour career
// (tools/balance-sim/train-career.mjs) asks what a player who trains for whole days meets: hour edges paid one by one, a 12-hour
// session ending `hours`, an item's bank running dry mid-session, the next sealed one opening itself, a purse that runs out. This
// plays those days with the browser closed (the world tick, the shipped edge, the replayed chain, the switch turned on in this
// database only) and prints what the server wrote: XP, fees, books, end reasons, Level XP and stamina.
//
//   node tools/qa/training-day.local.mjs [D1]   (one day by its tag)  exit 0: every day read as the rules say · 1: one did not (listed) · 2: harness
//
// The days (a Level 30 hero, Melee 30, the yard):
//   D1  a 24 h Training Sword bought and opened, a session played to its end: 12 paid hours, ended `hours`, 720,000 Melee XP, 12 h left
//   D2  a second session on the same bank: 720,000 again, the bank empty at the end
//   D3  5.5 h left in the bank and a sealed 12 h sword in the bag: the bank runs dry inside hour 6 and the sealed one opens itself, so
//       all 12 hours pay the item's rate (720,000), one automatic open, 5.5 h left
//   D4  5.5 h left and nothing sealed: 5.5 h at 60,000 and 6.5 h at 30,000 = 525,000
//   D5  a purse that pays three hours: ended `gold_out` at the third hour's end, 90,000 XP, nothing owed, the purse never under 0
// Every day: no Level XP, no coin, and the stamina pool rests: emptied at the start, it reads min(cap, hours trained) at the end.
// mutant-anchors: none — a manual measuring tool, not a CI guard
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from '../../tests/schema-replay.mjs';
import { setGold } from '../../tests/_gold.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const H = (await import('../../tests/hunt-sessions-settle.mjs')).HARNESS;
const { one, q, makeExec } = H;
const HOUR = 3600000;
const FLUSH = 600000;
const A = Date.UTC(2026, 9, 25, 12, 0, 0);
const idem = () => crypto.randomUUID();
const ts = (ms) => `to_timestamp(${ms / 1000})`;

async function as(db, uid, sql, params) {
  await db.query('begin');
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  try { const v = await one(db, sql, params); await db.query('commit'); return v; } catch (e) { await db.query('rollback'); throw e; }
}
const purse = async (db, uid) => Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [uid]));
const melee = async (db, uid) => Number(await one(db, `select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = 'melee'`, [uid]));
const levelXp = async (db, uid) => Number(await one(db, 'select level_xp from public.player_state where user_id = $1 and slot = 0', [uid]));
const books = async (db, uid) => (await q(db, `select banked_ms, opened_ms, spent_ms from public.player_training_gear where user_id = $1 and slot = 0 and skill = 'melee'`, [uid]))[0] || null;
const feeOf = async (db, uid) => Number(await one(db, `select public.hr_training_fee(public.hr_skill_level('melee', coalesce((select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = 'melee'), 0)))`, [uid]));

/** One session from its start to its end (or `untilMs`), the browser closed: the world tick, FLUSH a call. */
async function playSession(db, M, uid, untilMs) {
  const fee = await feeOf(db, uid);
  const v = await as(db, uid, 'select public.hr_training_start(0, $1, $2, $3, $4::uuid)', ['melee', 'yard', fee, idem()]);
  if (!v || v.ok !== true) return { refused: v };
  const sid = v.session_id;
  /* the session's clock to the anchor (a test clock: the hunt starts at A) */
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
  await db.query(`update public.hunt_sessions set entered_at = ${ts(A)} - interval '1 minute', hunt_from = ${ts(A)}, settled_to = ${ts(A)}, next_swing_at = ${ts(A)} where id = $1`, [sid]);
  await db.query(`update public.hunt_instances set settled_to = ${ts(A)}, next_swing_at = ${ts(A)} where id = $1`, [inst]);
  await db.query(`update public.player_state set stamina_ms = 0, stamina_at = ${ts(A)} where user_id = $1 and slot = 0`, [uid]);
  const exec = makeExec(db);
  /* the world tick at each FLUSH step, called again until the session reaches the step (one call settles a capped span) or ends; a call
     that moves nothing three times running is a stuck session */
  let calls = 0, stuck = 0, still = 0, last = A, lastBody = null;
  const read = async () => (await q(db, 'select settled_to, ended_at from public.hunt_sessions where id = $1', [sid]))[0];
  steps: for (let at = A + FLUSH; at <= untilMs; at += FLUSH) {
    for (;;) {
      const s = await read();
      if (s.ended_at) break steps;
      const to = new Date(s.settled_to).getTime();
      if (to >= at) break;
      if (to <= last && calls) {
        if (++still >= 3) {
          stuck++;
          const row = (await q(db, 'select settled_to, next_swing_at, hours_limit, refusals, version from public.hunt_sessions where id = $1', [sid]))[0];
          console.log('      STUCK at ' + ((to - A) / HOUR).toFixed(3) + ' h (step ' + ((at - A) / HOUR).toFixed(3) + ' h): ' + JSON.stringify(row) + '\n      tick: ' + JSON.stringify(lastBody).slice(0, 1200));
          break steps;
        }
      } else still = 0;
      last = to;
      /* compressed time: the per-user rate window would refuse a real day's settles packed into seconds (rate_limited), so it is emptied */
      await db.query('delete from public.hunt_tick_lease');
      await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
      lastBody = (await M.TK.runTick({ exec, atMs: at, body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: FLUSH, hunts: [{ user_id: uid, slot: 0, session_id: sid }] } })).body;
      calls++;
    }
  }
  const s = (await q(db, 'select settled_to, ended_at, end_reason, hours_limit from public.hunt_sessions where id = $1', [sid]))[0];
  const fees = await q(db, `select gold, meta from public.player_ledger where user_id = $1 and intent like 'training\\_fee:%' and meta->>'session' = $2 order by id`, [uid, sid]);
  /* the first hour is paid by the start (its own ledger row, the quoted fee); every later hour by its settle (training_fee:<hunt>:<hour>) */
  return { sid, calls, stuck, end: s.end_reason, endedAt: s.ended_at ? (new Date(s.ended_at).getTime() - A) / HOUR : null, hours: s.hours_limit,
    feeRows: fees.length + 1, feeSum: fee - fees.reduce((n, f) => n + Number(f.gold), 0) };
}

async function day(db, M, uid, name, setup, want) {
  if (process.argv[2] && !name.startsWith(process.argv[2])) return 0;
  await setup();
  const xp0 = await melee(db, uid), lx0 = await levelXp(db, uid), g0 = await purse(db, uid);
  const autos0 = Number(await one(db, `select count(*) from public.player_ledger where user_id = $1 and intent like 'training\\_gear\\_open:%' and (meta->>'auto')::boolean`, [uid]));
  const s = await playSession(db, M, uid, A + 13 * HOUR);
  const xp = (await melee(db, uid)) - xp0, lx = (await levelXp(db, uid)) - lx0, g1 = await purse(db, uid), b = await books(db, uid);
  const autos = Number(await one(db, `select count(*) from public.player_ledger where user_id = $1 and intent like 'training\\_gear\\_open:%' and (meta->>'auto')::boolean`, [uid])) - autos0;
  const bankH = b ? Number(b.banked_ms) / HOUR : 0;
  /* THE POOL RESTS WHILE THE HERO TRAINS: emptied at the session's start (A), read at its end on the server's own rule (hr_stamina_of),
     it holds the hours trained, up to the cap; a training day must leave a full hunting day behind it */
  const endAt = A + Math.round((s.endedAt || 0) * HOUR);
  const rested = s.endedAt ? Number(await one(db, `select public.hr_stamina_of($1, 0, ${ts(endAt)})`, [uid])) / HOUR : null;
  const cap = Number(await one(db, `select public.hr_stamina_cap($1, 0, ${ts(endAt)})`, [uid])) / HOUR;
  const got = { end: s.end, endedAt: s.endedAt, xp, levelXp: lx, feeRows: s.feeRows, feeSum: s.feeSum, purseMoved: g0 - g1, bankH, autos, stuck: s.stuck,
    books: b ? Number(b.banked_ms) === Number(b.opened_ms) - Number(b.spent_ms) : true, staminaH: rested, capH: cap, refused: s.refused || null };
  const bad = [];
  for (const [k, v] of Object.entries(want)) if (JSON.stringify(got[k]) !== JSON.stringify(v)) bad.push(k + ' ' + JSON.stringify(got[k]) + ' (want ' + JSON.stringify(v) + ')');
  if (got.levelXp !== 0) bad.push('Level XP ' + got.levelXp);
  if (!got.books) bad.push('books off ' + JSON.stringify(b));
  if (got.stuck) bad.push(got.stuck + ' tick calls moved nothing');
  if (!got.refused && got.purseMoved !== got.feeSum) bad.push('the purse moved ' + got.purseMoved + ', the fees ' + got.feeSum);
  if (g1 < 0) bad.push('the purse went under 0: ' + g1);
  if (s.endedAt && got.staminaH !== Math.min(cap, s.endedAt)) bad.push('stamina after ' + s.endedAt + ' h of training reads ' + got.staminaH + ' h (cap ' + cap + ' h)');
  console.log((bad.length ? 'RED ' : 'ok  ') + name + '  ' + JSON.stringify(got) + (bad.length ? '\n      ' + bad.join('\n      ') : ''));
  return bad.length;
}

async function main() {
  const b = await bootReplay();
  const db = b.db;
  await H.pinDice(db);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await db.query('update public.hr_tick_config set enabled = true where id');
  await db.query("update public.hr_feature_switches set scope = 'everyone' where switch_id = 'training_gear'");
  const M = await H.loadEdge(H.ROOT);
  const uid = '00000000-0000-4000-8000-00007a1ed0a1', poor = '00000000-0000-4000-8000-00007a1ed0a2';
  await db.query('begin');
  await H.character(db, M, uid, { level: 30, gold: 2000000 });
  await H.character(db, M, poor, { level: 30, gold: 0 });
  await db.query('commit');
  for (const u of [uid, poor]) await db.query("insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, 'weapon', 'iron_sword') on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id", [u]);
  let red = 0;
  const buy = async (u, item, price) => { const v = await as(db, u, 'select public.hr_training_gear_buy(0, $1, $2, $3::uuid)', [item, price, idem()]); if (!v || v.ok !== true) throw new Error('buy ' + JSON.stringify(v)); };
  const open = async (u, item) => { const v = await as(db, u, 'select public.hr_training_gear_open(0, $1, $2::uuid)', [item, idem()]); if (!v || v.ok !== true) throw new Error('open ' + JSON.stringify(v)); };
  const bankTo = (u, ms) => db.query(`update public.player_training_gear set banked_ms = $2, spent_ms = opened_ms - $2 where user_id = $1 and slot = 0 and skill = 'melee'`, [u, ms]);
  red += await day(db, M, uid, 'D1 a 24 h sword, one session', async () => { await buy(uid, 'training_sword_24h', 450000); await open(uid, 'training_sword_24h'); },
    { end: 'hours', endedAt: 12, xp: 720000, feeRows: 12, bankH: 12, autos: 0 });
  red += await day(db, M, uid, 'D2 the same bank, a second session', async () => {}, { end: 'hours', endedAt: 12, xp: 720000, feeRows: 12, bankH: 0, autos: 0 });
  red += await day(db, M, uid, 'D3 5.5 h left + a sealed 12 h sword', async () => { await bankTo(uid, 5.5 * HOUR); await buy(uid, 'training_sword_12h', 250000); },
    { end: 'hours', endedAt: 12, xp: 720000, feeRows: 12, bankH: 5.5, autos: 1 });
  red += await day(db, M, uid, 'D4 5.5 h left, nothing sealed', async () => {}, { end: 'hours', endedAt: 12, xp: 525000, feeRows: 12, bankH: 0, autos: 0 });
  red += await day(db, M, poor, 'D5 a purse for three hours', async () => {
    const fee = await feeOf(db, poor);
    await setGold((sql, p) => db.query(sql, p).then((r) => r.rows), poor, 0, 3 * fee + Math.floor(fee / 2));
  }, { end: 'gold_out', endedAt: 3, xp: 90000, feeRows: 3 });
  console.log(red ? 'training-day: ' + red + ' day(s) off the rules' : 'training-day: every day read as the rules say');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
