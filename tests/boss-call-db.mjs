#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/boss-call-db.mjs — CALL OUT, A SERIES, ON THE REPLAYED CHAIN WITH THE SHIPPED EDGE (supabase/migrations/2027-04-24-boss-call-series.sql on
// 2027-03-12-boss-call.sql; the engine's half is tests/boss-call.mjs).
//
//   node tests/boss-call-db.mjs            the guard
//   node tests/boss-call-db.mjs --mutate   every planted defect must turn it red
//
// mutant-anchors: supabase/migrations/2027-03-12-boss-call.sql supabase/migrations/2027-03-22-live-events.sql supabase/migrations/2027-04-05-call-out-alone.sql supabase/migrations/2027-04-24-boss-call-series.sql
//
// TYLER'S RULING, 2026-11-14 ("BOSS CALL = option B with your adjustments"): a slider to fight the called boss N times in a row, on the one engine; each fight
// costs stamina plus a small gold fee; no daily cap (stamina is the limit); pays only his drops, only on a win. This guard plays it on both doors.
//
//   BD-WORDS   a hero alone and a party of one are quoted, alone: one fight's price and stamina, the slider's top and its table, what the room covers; every
//              refusal (a member, a stale or forged price, an unknown call) in its code, charging nothing and opening nothing
//   BD-DROPS   (audit F24) the quote names what a win can drop: his table in its order, each row's odds as the catalogue holds them (the data's called row)
//   BD-DANGER  (audit F24) the quote reads the room: his Level, the seats under it and the lowest, whether a tank and a healer stand in it (the worn set's
//              role), and a bar that holds slots and no food; a bar that holds nothing runs the start kit's and is not counted
//   BD-COUNT   a forged count (0, negative, past the catalogue's top, none) is refused bad_fights with the server's top, never clamped
//   BD-ALONE   a hero in no party calls a series: the first fight's fee and stamina, one shop row, ONE seat on an instance of its own, the series on its session;
//              a replay charges once; a hero already hunting, or already in the room, is refused uncharged
//   BD-CHARGE  every seat pays the first fight, its own stamina and its own fee, one ledger row each; a replayed key charges once
//   BD-PURSE   a purse that can't pay (the caller's, a member's) refuses and names it; one that moved after the quote rolls every seat back out; the door shuts
//   BD-SHORT   a hero with less than a fight's stamina (the caller, a member) is refused by name, uncharged
//   BD-NOCAP   there is no daily cap: a day of calls behind it, the quote is still open and counts nothing
//   BD-DOOR    no other door reaches the room: enter, Start, Hunt again, a move mid-hunt, a member's join: none opens a session; a normal ground is untouched
//   BD-FORGED  a window on a called room that pays off the line is refused whole, whatever the engine proposed: coin, XP, a kill, a Hearthfind, an item with
//              no kill; on his kill's own window: an item off his table, his item twice, XP, a second kill, a kill that ends nothing, a win with no kill.
//              A forged stamina number is ignored: the pool is the server's
//   BD-BOTH    one fight: the kill, a death (by his blows, and with his spells on), the limit, each with the browser closed (the tick) and the hunt viewed
//              (index.ts's settle): the same end on the same instant, no hunt left open; a hero ALONE, the kill and a death, on both doors the same
//   BD-PAID    after each: no XP, no coin; loot only on the kill and only off his table; every seat's purse down its own fee and store bill; no Bestiary row
//   BD-SERIES  N fights in a row through both doors: each win rolls his table once, each fight is charged once to each hero (stamina and fee), the room's time
//              drains and rests nothing, it ends at its count; a pair the same; the session shows the server's count
//   BD-LOSS    a death in the second fight ends the series there: two fights charged, one won, no third
//   BD-STAM    out of stamina ends it `stamina` on the last win it could pay for, uncharged for the next; in a pair it ends for both: the short hero says stamina,
//              the other comes home with it (`party_member_left`) and its session names who ran out of what
//   BD-GOLD    out of gold (the purse under the fee over the hero's "Keep at least") ends it `gold_out` the same way
//   BD-LIMIT2  the second fight's limit runs from ITS start, to the millisecond
//   BD-PRIZE   the kill reaches the title's counter for each hero present, once a win; one System line a room (alone: it says so); nothing without the kill
//   BD-RECORD  each hero's session keeps the fight's record (hunt_session_tally.fight, read through hr_hunt_view): where he stood at the end, what that hero's
//              bar fired, the same through both doors; a forged record is refused; every other hunt's section has no such key
//   BD-OWED    a fight's limit is owed from the fight's start: a window past it with no end is refused
//   BD-AGAIN   every file of each lane applied a second time moves nothing: the schema's inventory, every spliced body and the catalogue rows, byte for byte;
//              an older file that restates a spliced body whole (faction-standing's settle, training-gear's member read) is refused by its own pin, moving nothing
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import { bootReplay, closeReplays, inventory } from './schema-replay.mjs';
import { setGold } from './_gold.mjs';
import { BOSS_CALLS, BOSS_CALL_RULES } from '../src/data/boss-calls.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = sourceQuery(ROOT);
const ADD_ID = 'drain_rat_called';
const EM = (await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href + V)).MONSTERS;
const PM = (await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href)).MONSTERS;
const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const { one, q } = H;
const KING = BOSS_CALLS.rat_king;
/* ONE FIGHT'S PRICE, the data's (the server's catalogue is generated from it): gold and stamina. */
const FEE = KING.fight.fee;
const STAM = KING.fight.staminaMs;
const TOP = BOSS_CALL_RULES.maxFights;
const TABLE = PM[KING.monster].drops.map((d) => d.id);
const UIDS = Array.from({ length: 40 }, (_, i) => '00000000-0000-4000-8000-0000000bc' + String(i + 100));
const WINDOW = 90000;
const GEAR = Object.freeze({ helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots', weapon: 'steel_sword', shield: 'coppercap_shield' });
const STAFF = Object.freeze({ helmet: 'scholar_helmet', body: 'scholar_body', pants: 'scholar_pants', boots: 'scholar_boots', weapon: 'willow_staff' });
/* A boss a strong hero fells in a few swings and who hurts nobody: the series' arms measure the charge and the count, never the fight. */
const SOFT = Object.freeze({ hp: 400, atk: 1, aim: 1, spells: [] });
const SOFT_ADD = Object.freeze({ hp: 60, atk: 1, aim: 1 });
const idem = () => crypto.randomUUID();
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const purse = async (db, uid) => Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [uid]));
const pool = async (db, uid) => Number(await one(db, 'select stamina_ms::text from public.player_state where user_id = $1 and slot = 0', [uid]));
const poolNow = async (db, uid) => Number(await one(db, 'select public.hr_stamina_of($1::uuid, 0, now())::text', [uid]));
const gold = (db, uid, n) => setGold((sql, p) => db.query(sql, p).then((r) => r.rows), uid, 0, n);
/* The hero's own "Keep at least" (the catalogue's default until a player moves it): a later fight never takes the purse under it. */
const keepOf = async (db, uid) => Number(await one(db, `select greatest(0, coalesce((public.hr_hunt_supply_of($1::uuid, 0, public.hr_hunt_active_set($1::uuid, 0))->>'gold_floor')::bigint, 0))::text`, [uid]));

/* NATURAL WINS BEFORE THE CALL (2027-05-05-entry-gates.sql; Tyler 2026-11-18: "you have to beat the boss in the hunting ground X times before you can
   call them out"): every probe hero here has beaten each called boss on his ground the data's count of times (his Bestiary counter, the row the settle
   writes), so these arms measure the call itself. The gate's own refusals and passes are tests/entry-gates.mjs's. The data's numbers, so a chain
   cut before the gate (BD-AGAIN) takes the rows as the harmless counters they are there. */
const earned = (db, uid) => db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at)
    select $1::uuid, 0, 'stat', 'ev:kill_monster:' || b, '', $3::bigint, now() from unnest($2::text[]) b
    on conflict (user_id, slot, kind, key, period_key) do update set value = greatest(public.player_progress.value, excluded.value)`,
  [uid, Object.values(BOSS_CALLS).map((c) => c.of), BOSS_CALL_RULES.winsToCall]);

async function as(db, uid, sql, params) {
  await db.query('begin');
  await asUser(db, uid);
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  try { const v = await one(db, sql, params); await db.query('commit'); return v; } catch (e) { await db.query('rollback'); throw e; }
}
const call = (db, uid, fights, price, key, id = 'rat_king', slot = 0) => as(db, uid, 'select public.hr_boss_call($1, $2, $3::int, $4::bigint, $5::uuid)', [slot, id, fights, price, key || idem()]);
const view = (db, uid) => as(db, uid, `select public.hr_boss_call_view(0, 'rat_king')`);
const openIn = async (db, party) => Number(await one(db, 'select count(*) from public.hunt_sessions where instance_id = $1 and ended_at is null', [party]));
const calls = (db, uid) => q(db, `select slot, kind, intent, gold, meta from public.player_ledger where user_id = $1 and intent like 'boss\\_call:%' order by id`, [uid]);

/* A party on no ground: `n` heroes, one account each. */
async function party(db, M, uids, { level = 60, gold: g = 200000, gear = [GEAR, STAFF, GEAR, GEAR], names = 'Bossb' } = {}) {
  const kit = { level, inv: { cooked_shrimp: 400 }, gold: g };
  for (const [i, uid] of uids.entries()) {
    await db.query('begin');
    await H.character(db, M, uid, kit);
    await earned(db, uid);
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

/* A hero in no party, named, in its kit: the lone caller. */
async function solo(db, M, uid, { level = 60, gold: g = 200000, gear = GEAR, name = 'Lonea' } = {}) {
  await db.query('begin');
  await H.character(db, M, uid, { level, inv: { cooked_shrimp: 400 }, gold: g });
  await earned(db, uid);
  await db.query('commit');
  for (const [slot, item] of Object.entries(gear || {})) {
    await db.query('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, $2, $3) on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id', [uid, slot, item]);
  }
  const named = await as(db, uid, 'select public.hr_character_name_set(0, $1, $2::uuid)', [name, idem()]);
  if (!named || named.ok !== true) throw new Error('harness: name refused: ' + JSON.stringify(named));
}
/* A NORMAL GROUND (no call, no exit) for a hero of these arms' Level 20: BD-DOOR's lone hero hunts it, BD-ALONE reads it hunting elsewhere. */
const NORMAL = 'meadowbrook_thicket';
const bare = async (db, M, uid, g = 100000) => { await db.query('begin'); await H.character(db, M, uid, { level: 20, gold: g }); await earned(db, uid); await db.query('commit'); };

/* ── THE VERB ─────────────────────────────────────────────────────────────── */
async function verbArms(db, M) {
  const bad = [];
  const [a, b] = UIDS;
  await bare(db, M, a);
  const pool0 = await poolNow(db, a);
  /* BD-WORDS: a hero with no party, then a party of one: each is quoted, alone, one fight's price and the slider's table (a warning, never a refusal: ruling 2, 2026-11-10) */
  const alone = (v) => {
    const t = v && v.ok === true ? v.quote : null;
    return !!t && t.available === true && t.why === null && t.alone === true && t.seats === 1 && t.price === FEE && t.fight_stamina_ms === STAM && t.max_fights === TOP
      && t.limit_ms === BOSS_CALL_RULES.limitMs && Array.isArray(t.totals.fee) && t.totals.fee.length === TOP && t.totals.stamina_ms.length === TOP
      && t.totals.fee.every((n, i) => n === (i + 1) * FEE) && t.totals.stamina_ms.every((n, i) => n === (i + 1) * STAM)
      && t.covers === Math.min(TOP, Math.floor(pool0 / STAM)) && t.heroes === 1 && !('party_min' in t) && !('per_day' in t) && !('left' in t) && !('used' in t);
  };
  let quoted = await view(db, a);
  if (!alone(quoted)) bad.push('BD-WORDS a hero alone is quoted ' + JSON.stringify(quoted && quoted.quote && { ...quoted.quote, totals: '...' }));
  await db.query(`select public.hr_party_open($1::uuid, 0)`, [a]);
  quoted = await view(db, a);
  if (!alone(quoted)) bad.push('BD-WORDS a party of one is quoted ' + JSON.stringify(quoted && quoted.quote && { ...quoted.quote, totals: '...' }));
  /* BD-DROPS and BD-DANGER (audit F24): what a win can drop, and the server's reading of the room, both in the quote the page lists */
  {
    const boss = PM[KING.monster];
    const read = async () => (await view(db, a)).quote;
    let t = await read();
    const want = boss.drops.map((d) => [d.id, Math.round(d.ch * 1000000)]);
    if (!t || JSON.stringify((t.drops || []).map((d) => [d.item, d.ppm])) !== JSON.stringify(want)) bad.push('BD-DROPS the quote names ' + JSON.stringify(t && t.drops).slice(0, 200) + ', want his table and its odds');
    const lv = Number(await one(db, 'select public.hr_char_level((select level_xp from public.player_state where user_id = $1 and slot = 0))', [a]));
    const roleOf = () => one(db, 'select public.hr_hunt_role_of($1::uuid, 0)', [a]);
    const fits = async (q2, food, why) => {
      const role = await roleOf();
      const d = q2 && q2.danger;
      if (!d || d.boss_level !== boss.level || d.lowest !== lv || d.under !== (lv < boss.level ? 1 : 0) || d.tank !== (role === 'tank') || d.healer !== (role === 'healer') || d.no_food !== food)
        bad.push('BD-DANGER ' + why + ' reads ' + JSON.stringify(d) + ' (Level ' + lv + ', role ' + role + ', his Level ' + boss.level + ')');
    };
    if (!(lv < boss.level)) bad.push('BD-DANGER CONTROL: the probe hero is not under his Level');
    await fits(t, 0, 'a fresh hero, its bar the start kit\'s');
    /* the shield comes off: nobody in the room holds him */
    const wasTank = (await roleOf()) === 'tank';
    await db.query(`delete from public.player_equipment where user_id = $1 and slot = 0 and equip_slot = 'shield'`, [a]);
    if (wasTank && (await roleOf()) === 'tank') bad.push('BD-DANGER CONTROL: the hero is still a tank with no shield');
    await fits(await read(), 0, 'a hero with no shield');
    /* a bar that holds a slot and no food is counted; with food on it, it is not */
    const preset = Number(await one(db, 'select public.hr_hunt_active_set($1::uuid, 0)', [a]));
    await db.query(`insert into public.player_action_sets (user_id, slot, preset, name, slots) values ($1, 0, $2, 'Probe', '[{"action":{"type":"ability","id":"power_strike"}}]'::jsonb)
        on conflict (user_id, slot, preset) do update set slots = excluded.slots`, [a, preset]);
    await fits(await read(), 1, 'a bar with no food');
    await db.query(`update public.player_action_sets set slots = slots || '[{"action":{"type":"consume","id":"salted_shrimp"}}]'::jsonb where user_id = $1 and slot = 0 and preset = $2`, [a, preset]);
    await fits(await read(), 0, 'a bar that eats');
    await db.query('delete from public.player_action_sets where user_id = $1 and slot = 0 and preset = $2', [a, preset]);
  }
  let v;
  await bare(db, M, b);
  const pid = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [a]);
  await db.query('select public.hr_party_seat_into($1::uuid, $2::uuid, 0)', [pid, b]);
  v = await call(db, b, 3, FEE);
  if (v.error !== 'call_leader') bad.push('BD-WORDS a member answered ' + JSON.stringify(v));
  quoted = await view(db, a);
  if (!quoted.ok || quoted.quote.alone !== false || quoted.quote.seats !== 2 || quoted.quote.available !== true) bad.push('BD-WORDS the leader of two is quoted ' + JSON.stringify(quoted));
  /* BD-DANGER: both seats are read, the member's Level too */
  if (!quoted.ok || !quoted.quote.danger || quoted.quote.danger.under !== 2) bad.push('BD-DANGER a pair under his Level reads ' + JSON.stringify(quoted.ok && quoted.quote.danger));
  for (const price of [FEE + 1, FEE - 1, 1, 0]) {
    v = await call(db, a, 3, price);
    if (v.error !== 'quote_changed' || !v.boss_call || Number(v.boss_call.price) !== FEE) bad.push('BD-WORDS a price of ' + price + ' answered ' + JSON.stringify({ ...v, boss_call: v.boss_call && v.boss_call.price }));
  }
  v = await call(db, a, 3, FEE, null, 'no_such_call');
  if (v.error !== 'call_unknown') bad.push('BD-WORDS an unknown call answered ' + JSON.stringify(v));
  /* BD-COUNT: a forged count is refused with the server's top, never clamped to it */
  for (const n of [0, -1, TOP + 1, 1000000, null]) {
    v = await call(db, a, n, FEE);
    if (v.error !== 'bad_fights' || v.max_fights !== TOP) bad.push('BD-COUNT ' + n + ' fights answered ' + JSON.stringify(v));
  }
  if (await purse(db, a) !== 100000 || await purse(db, b) !== 100000 || await poolNow(db, a) < pool0
      || Number(await one(db, 'select count(*) from public.hunt_sessions where instance_id = $1', [pid]))) bad.push('BD-WORDS a refusal moved something');

  /* BD-DOOR: the leader's own Start, an enter, nobody in the room */
  v = await as(db, a, 'select public.hr_hunt_party_start(0, $1, $2::uuid)', [KING.hunt, idem()]);
  if (v.error !== 'not_ready' || !v.seats || v.seats[0].error !== 'call_only') bad.push('BD-DOOR Start answered ' + JSON.stringify(v));
  v = await as(db, a, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [KING.hunt, idem()]);
  if (v.ok === true) bad.push('BD-DOOR an enter walked in: ' + JSON.stringify(v));
  if (await openIn(db, pid)) bad.push('BD-DOOR a refused door opened a session');
  const c = UIDS[4];
  await bare(db, M, c);
  v = await as(db, c, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [KING.hunt, idem()]);
  if (v.error !== 'call_only') bad.push('BD-DOOR a lone hero\'s enter answered ' + JSON.stringify(v));
  /* a normal ground a Level 20 hero still enters: the Thicket (the Mill Cellar's hunt ends at Level 5 and its door refuses this hero: hunt-grounds.js endsAtLevel) */
  v = await as(db, c, `select public.hr_hunt_enter(0, $2, '[]'::jsonb, 0, null, $1::uuid)`, [idem(), NORMAL]);
  if (v.ok !== true) bad.push('BD-DOOR a normal ground refused a lone hero: ' + JSON.stringify(v));
  v = await as(db, c, 'select public.hr_hunt_change(0, $1, $2::uuid)', [KING.hunt, idem()]);
  if (v.error !== 'call_only') bad.push('BD-DOOR a move mid-hunt answered ' + JSON.stringify(v));

  /* BD-ALONE: a hero in no party calls a series of three: one seat, the first fight charged, the series on its session */
  const d = UIDS[12];
  await bare(db, M, d);
  const dPool = await poolNow(db, d);
  const dKey = idem();
  v = await call(db, d, 3, FEE, dKey);
  if (v.ok !== true || v.entered !== 1 || v.party !== null || v.fights !== 3 || v.gold !== -FEE) bad.push('BD-ALONE the lone call answered ' + JSON.stringify({ ...v, boss_call: null }));
  if (await purse(db, d) !== 100000 - FEE) bad.push('BD-ALONE the purse reads ' + await purse(db, d) + ', want ' + (100000 - FEE));
  if (await pool(db, d) !== dPool - STAM) bad.push('BD-ALONE the pool reads ' + await pool(db, d) + ', want ' + (dPool - STAM));
  const room = await q(db, 'select id, instance_id, call_fights, call_fight, call_won, call_fee, call_stamina_ms, hours_limit, fight_from = hunt_from as same from public.hunt_sessions where user_id = $1 and slot = 0 and hunt_id = $2 and ended_at is null', [d, KING.hunt]);
  if (room.length !== 1) bad.push('BD-ALONE ' + room.length + ' of the caller\'s sessions in the room, want 1');
  else {
    const r = room[0];
    if (Number(await one(db, 'select count(*) from public.hunt_sessions where instance_id = $1', [r.instance_id])) !== 1) bad.push('BD-ALONE the room holds more than its caller');
    if (Number(await one(db, 'select count(*) from public.hunt_parties where id = $1', [r.instance_id]))) bad.push('BD-ALONE the room is a party\'s');
    if (r.call_fights !== 3 || r.call_fight !== 1 || r.call_won !== 0 || Number(r.call_fee) !== FEE || r.call_stamina_ms !== STAM || r.hours_limit !== null || r.same !== true) bad.push('BD-ALONE the session reads ' + JSON.stringify(r));
    const seen = await one(db, `select public.hr_hunt_view($1::uuid)->'call'`, [r.id]);
    if (!seen || seen.fights !== 3 || seen.fight !== 1 || seen.won !== 0 || seen.paid_gold !== FEE || seen.paid_stamina_ms !== STAM) bad.push('BD-ALONE the view reads ' + JSON.stringify(seen));
  }
  const dRows = await calls(db, d);
  if (dRows.length !== 1 || dRows[0].kind !== 'shop' || dRows[0].intent !== `boss_call:rat_king:3:${FEE}` || Number(dRows[0].gold) !== -FEE || dRows[0].meta.fight !== 1 || dRows[0].meta.fights !== 3) bad.push('BD-ALONE the ledger reads ' + JSON.stringify(dRows));
  const dAgain = await call(db, d, 3, FEE, dKey);
  if (await purse(db, d) !== 100000 - FEE || await pool(db, d) !== dPool - STAM || (await calls(db, d)).length !== 1) bad.push('BD-ALONE a replay charged again: ' + JSON.stringify({ ...dAgain, boss_call: null }));
  v = await call(db, d, 3, FEE);
  if (v.ok === true || await purse(db, d) !== 100000 - FEE || await pool(db, d) !== dPool - STAM) bad.push('BD-ALONE a hero in the room called again: ' + JSON.stringify(v));
  /* a hero hunting elsewhere (c, on the normal ground since BD-DOOR) is refused by the start, charged nothing, and stays where it was */
  const cPurse = await purse(db, c);
  v = await call(db, c, 1, FEE);
  if (v.ok === true || await purse(db, c) !== cPurse
      || Number(await one(db, `select count(*) from public.hunt_sessions where user_id = $1 and ended_at is null and hunt_id = $2`, [c, NORMAL])) !== 1) bad.push('BD-ALONE a hero hunting elsewhere answered ' + JSON.stringify(v));

  /* BD-CHARGE: every seat pays the first fight, its own stamina and its own fee */
  const aPool = await poolNow(db, a), bPool = await poolNow(db, b);
  const key = idem();
  v = await call(db, a, 4, FEE, key);
  if (v.ok !== true || v.fights !== 4) bad.push('BD-CHARGE the call answered ' + JSON.stringify({ ...v, boss_call: null }));
  if (await purse(db, a) !== 100000 - FEE) bad.push('BD-CHARGE the leader\'s purse reads ' + await purse(db, a));
  if (await purse(db, b) !== 100000 - FEE) bad.push('BD-CHARGE the member\'s purse reads ' + await purse(db, b) + ': each seat pays its own first fight');
  if (await pool(db, a) !== aPool - STAM || await pool(db, b) !== bPool - STAM) bad.push('BD-CHARGE the pools read ' + await pool(db, a) + ' and ' + await pool(db, b) + ', want one fight off each');
  if (await openIn(db, pid) !== 2) bad.push('BD-CHARGE ' + await openIn(db, pid) + ' heroes in the room, want 2');
  if (Number(await one(db, 'select count(*) from public.hunt_sessions where instance_id = $1 and ended_at is null and call_fights = 4 and call_fight = 1 and call_won = 0 and call_fee = $2 and hours_limit is null', [pid, FEE])) !== 2) bad.push('BD-CHARGE the room\'s sessions do not carry the series');
  const aRows = await calls(db, a), bRows = await calls(db, b);
  if (aRows.length !== 1 || aRows[0].kind !== 'shop' || aRows[0].intent !== `boss_call:rat_king:4:${FEE}` || Number(aRows[0].gold) !== -FEE) bad.push('BD-CHARGE the leader\'s ledger reads ' + JSON.stringify(aRows));
  if (bRows.length !== 1 || bRows[0].kind !== 'shop' || bRows[0].intent !== 'boss_call:rat_king:fight' || Number(bRows[0].gold) !== -FEE || bRows[0].meta.fight !== 1) bad.push('BD-CHARGE the member\'s ledger reads ' + JSON.stringify(bRows));
  const again = await call(db, a, 4, FEE, key);
  if (await purse(db, a) !== 100000 - FEE || await purse(db, b) !== 100000 - FEE || await pool(db, b) !== bPool - STAM || (await calls(db, a)).length !== 1 || (await calls(db, b)).length !== 1) bad.push('BD-CHARGE a replay charged again: ' + JSON.stringify({ ...again, boss_call: null }));
  /* BD-DOOR: a member can't walk in behind them */
  v = await as(db, a, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [KING.hunt, idem()]);
  if (v.ok === true) bad.push('BD-DOOR a second enter walked in');

  /* BD-PURSE, on the party again, every seat out: the caller's purse, then a member's, by name */
  await db.query(`select public.hr_hunt_close(h.id, 'server', now(), true) from public.hunt_sessions h where h.instance_id = $1 and h.ended_at is null`, [pid]);
  await gold(db, a, FEE - 1);
  v = await call(db, a, 2, FEE);
  if (v.error !== 'insufficient_gold' || (v.boss_call && v.boss_call.covers !== 0)) bad.push('BD-PURSE a short purse answered ' + JSON.stringify({ ...v, boss_call: v.boss_call && v.boss_call.covers }));
  await gold(db, a, 100000);
  await gold(db, b, FEE - 1);
  v = await call(db, a, 2, FEE);
  if (v.error !== 'party_gold' || !v.boss_call || typeof v.boss_call.who !== 'string' || !v.boss_call.who) bad.push('BD-PURSE a member\'s short purse answered ' + JSON.stringify({ ...v, boss_call: v.boss_call && v.boss_call.who }));
  if (await openIn(db, pid)) bad.push('BD-PURSE a short purse left ' + await openIn(db, pid) + ' in the room');
  if (await purse(db, a) !== 100000 || await purse(db, b) !== FEE - 1) bad.push('BD-PURSE a refused call charged');
  /* THE PURSE MOVED AFTER THE QUOTE (another hero of the account spent it): played with a quote that still says yes. The verb's own charge refuses,
     and every seat rolls back out, the caller's charge with them. */
  {
    const def = (await one(db, `select pg_get_functiondef('public.hr_boss_call_quote(uuid,integer,text)'::regprocedure)`)).replace(/\r/g, '');
    const blind = def.replace("v_why := 'insufficient_gold';", 'v_why := null;').replace("v_why := 'party_gold'; v_who := public.hr_character_name(v_a.user_id, v_a.slot0);", 'v_why := null;');
    if (blind === def) throw new Error('HARNESS: the quote has no purse line to blind');
    await db.exec(blind);
    v = await call(db, a, 2, FEE);
    if (v.error !== 'party_gold') bad.push('BD-PURSE a member\'s purse that moved after the quote answered ' + JSON.stringify({ ...v, boss_call: null }));
    if (await openIn(db, pid) || await purse(db, a) !== 100000 || (await calls(db, a)).length !== 1) bad.push('BD-PURSE a member who could not pay left the leader charged, or a hero in the room');
    await gold(db, b, 100000);
    await gold(db, a, FEE - 1);
    v = await call(db, a, 2, FEE);
    if (v.error !== 'insufficient_gold') bad.push('BD-PURSE a caller\'s purse that moved after the quote answered ' + JSON.stringify({ ...v, boss_call: null }));
    if (await openIn(db, pid) || await purse(db, a) !== FEE - 1 || await purse(db, b) !== 100000) bad.push('BD-PURSE a caller who could not pay left a seat in the room, or a member charged');
    await db.exec(def);
    await gold(db, a, 100000);
  }
  if ((await one(db, `select current_setting('hr.boss_call', true)`)) && (await one(db, `select current_setting('hr.boss_call', true)`)) !== '') bad.push('BD-PURSE the door stayed open');

  /* BD-SHORT: less than one fight's stamina, the member's then the caller's: refused by name, nobody charged */
  await db.query(`update public.player_state set stamina_ms = $2, stamina_at = now() where user_id = $1 and slot = 0`, [b, STAM - 60000]);
  v = await call(db, a, 2, FEE);
  if (v.error !== 'party_stamina' || !v.boss_call || !v.boss_call.who || v.boss_call.covers !== 0) bad.push('BD-SHORT a member with no stamina answered ' + JSON.stringify({ ...v, boss_call: v.boss_call && { who: v.boss_call.who, covers: v.boss_call.covers } }));
  await db.query(`update public.player_state set stamina_ms = $2, stamina_at = now() where user_id = $1 and slot = 0`, [a, STAM - 60000]);
  v = await call(db, a, 2, FEE);
  if (v.error !== 'call_stamina') bad.push('BD-SHORT a caller with no stamina answered ' + JSON.stringify({ ...v, boss_call: null }));
  if (await openIn(db, pid) || await purse(db, a) !== 100000 || await purse(db, b) !== 100000) bad.push('BD-SHORT a refusal charged, or opened the room');

  /* BD-NOCAP: no daily cap (Tyler 2026-11-14: stamina is the limit). A day of calls behind this account, the quote is open and counts nothing. */
  await db.query(`update public.player_state set stamina_ms = $2, stamina_at = now() where user_id = any($1::uuid[]) and slot = 0`, [[a, b], 10 * STAM]);
  await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, meta) select $1, 0, 'shop', 'boss_call:rat_king:fight', null, '{}'::jsonb from generate_series(1, 12)`, [a]);
  const open = await view(db, a);
  if (!open.ok || open.quote.available !== true || open.quote.why !== null || 'left' in open.quote || 'used' in open.quote) bad.push('BD-NOCAP after a day of calls the page reads ' + JSON.stringify({ ...open.quote, totals: null }));
  if (open.ok && open.quote.covers !== 10) bad.push('BD-NOCAP ten fights of stamina each cover ' + open.quote.covers);
  return bad;
}

/* ── THE FIGHT ON THE SERVER, BOTH DOORS ──────────────────────────────────── */
async function backdate(db, room, anchorMs) {
  const t = `to_timestamp(${Math.floor(anchorMs / 1000)})`;
  /* the pool's stamp walks back with the room's clock (the verb stamped it at the arrival): a stamp ahead of the session refuses every window */
  await db.query(`update public.player_state ps set stamina_at = ${t} from public.hunt_sessions h where h.instance_id = $1 and h.ended_at is null and ps.user_id = h.user_id and ps.slot = h.slot`, [room]);
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t},
      fight_from = case when fight_from is null then null else ${t} end where instance_id = $1 and ended_at is null`, [room]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [room]);
}
const makeExec = (db) => async (text, params) => { await db.exec('set role hr_engine'); try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); } };

/* Settle the room window by window until it empties (or `stop` says so before a window): the tick's fire, or the player's own settle. */
async function fightToEnd(db, M, door, uids, room, anchorMs, { fights = 1, stop = null, oneSlice = false } = {}) {
  const exec = makeExec(db);
  await db.query('update public.hr_tick_config set enabled = true where id');
  const sids = (await q(db, 'select user_id, id from public.hunt_sessions where instance_id = $1 and ended_at is null order by seat', [room]));
  for (let w = 1, n = fights * (Math.ceil(BOSS_CALL_RULES.limitMs / WINDOW) + 2); w <= n && await openIn(db, room); w++) {
    if (stop && await stop(w)) break;
    const atMs = anchorMs + w * WINDOW;
    if (door === 'fire') {
      await db.query('delete from public.hunt_tick_lease');
      const r = (await M.TK.runTick({ exec, atMs, body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: WINDOW, hunts: sids.map((s) => ({ user_id: s.user_id, slot: 0, session_id: s.id })) } })).body;
      if (!r.hunts || r.hunts.settled < 1) throw new Error('fire settled nothing: ' + JSON.stringify(r.hunts || r).slice(0, 300));
    } else {
      /* The player's own settle catches a room up slice after slice in one call (several fights of a series at once: BD-SERIES plays that). `oneSlice`
         spends its engine budget on the first, so a job that plants a row between two fights gets its turn there, as the tick's fire does. */
      const v = await M.HS.settleHunt({ exec, user: uids[0], slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs, minWindowMs: 0,
        ...(oneSlice ? { budget: M.HS.engineBudget(0) } : {}) });
      if (v.outcome !== 'paid') throw new Error('viewed settled nothing: ' + JSON.stringify({ o: v.outcome, r: v.reason, d: v.body && v.body.detail }).slice(0, 400));
    }
  }
  return (await q(db, `select h.id, h.user_id, h.end_reason, h.ended_at, h.fight_from, h.call_fights, h.call_fight, h.call_won, t.coins, t.kills, t.xp, t.loot, t.deaths
                         from public.hunt_sessions h join public.hunt_session_tally t on t.session_id = h.id where h.instance_id = $1 and h.hunt_id = $2 order by h.seat`, [room, KING.hunt]));
}

const JOBS = [
  { name: 'the kill', want: ['boss_felled'], level: 60, uids: [0, 1], row: null },
  /* A DEATH BY HIS BLOWS: one hero falls and the other's hunt ends with it. His spells are off this row for the arm, because a cast
     fells both Level 2 heroes on one instant (7 of 24 dice in the engine, never with the spells off) and that is the next arm's end. */
  { name: 'a death', want: ['died', 'party_member_died'], level: 2, uids: [2, 3], gear: [{}, {}], row: { spells: [] } },
  /* A DEATH WITH HIS SPELLS ON, his real row: whichever of the two ends the dice give, both doors give the same one on the same instant. */
  { name: 'a death to his spells', want: ['died', 'party_member_died'], or: ['died'], level: 2, uids: [14, 15], gear: [{}, {}], row: null },
  { name: 'the limit', want: ['boss_time'], level: 60, uids: [4, 5], row: { hp: 100000000, atk: 1, aim: 1 }, stood: [999, 1000], manyWindows: true },
  /* THE PHASES: a death with the wave up, and the limit with the wave up (a row that takes 1 a blow, so his first line falls inside ten minutes and his last HP doesn't). */
  { name: 'a death in the add wave', want: ['died', 'party_member_died'], level: 60, uids: [6, 7], row: { hp: 2000, atk: 1, aim: 1 }, add: { hp: 100000, atk: 800, aim: 100000 }, stood: [1, 500] },
  { name: 'the limit with the wave up', want: ['boss_time'], level: 60, uids: [8, 9], row: { hp: 410, atk: 1, aim: 1, def: 100000 }, add: { hp: 10000000, atk: 1, aim: 1 }, stood: [1, 500] },
  /* A HERO ALONE (the designer's ruling 2, 2026-11-10): the same room and the same fight for one seat, through both doors. */
  { name: 'a lone kill', want: ['boss_felled'], level: 60, uids: [10], lone: true, felled: true, row: null, stood: [0, 0] },
  { name: 'a lone death', want: ['died'], level: 2, uids: [11], lone: true, gear: [{}], row: null },
];

/* What the bag gained since `inv0` (rows of user, item, qty), as { user: { item: qty } }. */
function gained(inv0, inv1) {
  const was = new Map(inv0.map((r) => [r.user_id + ':' + r.item_id, Number(r.qty)]));
  const out = {};
  for (const r of inv1) {
    const n = Number(r.qty) - (was.get(r.user_id + ':' + r.item_id) || 0);
    if (n !== 0) (out[r.user_id] = out[r.user_id] || {})[r.item_id] = n;
    was.delete(r.user_id + ':' + r.item_id);
  }
  for (const [k, n] of was) { const [u, item] = k.split(':'); (out[u] = out[u] || {})[item] = -n; }
  return out;
}
const bagOf = (db, uids) => q(db, `select user_id, item_id, qty from public.player_inventory where user_id = any($1::uuid[]) and slot = 0 and item_id <> 'cooked_shrimp' order by user_id, item_id`, [uids]);

async function bothDoors(door, boot) {
  const bad = [];
  const { db } = await boot();
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const ends = {};
  const row = EM[KING.monster];
  const keep = { hp: row.hp, atk: row.atk, aim: row.aim, def: row.def, spells: row.spells };
  const ADD = EM[ADD_ID];
  const keepAdd = { hp: ADD.hp, atk: ADD.atk, aim: ADD.aim };
  for (const job of JOBS) {
    const uids = job.uids.map((i) => UIDS[i]);
    const anchorMs = Date.UTC(2026, 9, 25, 12, 0, 0);
    const lone = job.lone === true;
    const party0 = lone ? null : await party(db, M, uids, { level: job.level, gold: 200000, names: 'Boss' + job.uids[0], gear: job.gear });
    if (lone) await solo(db, M, uids[0], { level: job.level, gear: job.gear ? job.gear[0] : GEAR, name: 'Lone' + job.uids[0] + 'a' });
    const lx0 = await q(db, 'select user_id, level_xp from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [uids]);
    const sk0 = await q(db, 'select user_id, skill_id, xp from public.player_skills where user_id = any($1::uuid[]) and slot = 0 order by user_id, skill_id', [uids]);
    const inv0 = await bagOf(db, uids);
    const sheet0 = await q(db, 'select public.hr_character_sheet_view(u, 0)->$2 as b from unnest($1::uuid[]) u', [uids, 'bestiary']);
    const made = await call(db, uids[0], 1, FEE);
    if (made.ok !== true) { bad.push(`BD-BOTH ${door} ${job.name}: the call answered ${JSON.stringify(made)}`); continue; }
    /* the room's instance: the party's, or a lone hero's own session (a solo session is its own instance) */
    const pid = lone ? await one(db, 'select instance_id from public.hunt_sessions where user_id = $1 and slot = 0 and hunt_id = $2 and ended_at is null', [uids[0], KING.hunt]) : party0;
    if (lone ? !pid || made.entered !== 1 || made.party !== null : await one(db, 'select hunt_id from public.hunt_parties where id = $1', [pid]) !== KING.hunt) bad.push(`BD-BOTH ${door} ${job.name}: the ${lone ? 'hero is not alone in' : 'party is not on'} the room: ${JSON.stringify(made).slice(0, 160)}`);
    if (!pid) continue;
    await backdate(db, pid, anchorMs);
    if (job.row) for (const inst of [row, PM[KING.monster]]) Object.assign(inst, job.row);
    if (job.add) for (const inst of [ADD, PM[ADD_ID]]) Object.assign(inst, job.add);
    let got;
    try { got = await fightToEnd(db, M, door, uids, pid, anchorMs); } finally {
      for (const inst of [row, PM[KING.monster]]) Object.assign(inst, keep);
      for (const inst of [ADD, PM[ADD_ID]]) Object.assign(inst, keepAdd);
    }
    if (await openIn(db, pid)) bad.push(`BD-BOTH ${door} ${job.name}: ${await openIn(db, pid)} heroes still in the room`);
    const reasons = [...new Set(got.map((g) => g.end_reason))].sort();
    if (reasons.join() !== job.want.join() && reasons.join() !== (job.or || job.want).join()) bad.push(`BD-BOTH ${door} ${job.name}: ended ${reasons.join()}, want ${job.want.join()}${job.or ? ' or ' + job.or.join() : ''}`);
    /* Two deaths are one cast's: a second death at a later instant is a fight that ran on past the first. */
    if (got.filter((g) => g.end_reason === 'died').length > 1 && new Set(got.map((g) => new Date(g.ended_at).getTime())).size !== 1) bad.push(`BD-BOTH ${door} ${job.name}: two deaths at two instants: ${got.map((g) => g.ended_at)}`);
    /* BD-RECORD: each hero's, and the view says what the row says. */
    const recs = await q(db, `select t.fight, public.hr_hunt_view(h.id)->'tally'->'fight' as seen from public.hunt_sessions h join public.hunt_session_tally t on t.session_id = h.id where h.instance_id = $1 and h.hunt_id = $2 order by h.seat`, [pid, KING.hunt]);
    if (recs.length !== uids.length) bad.push(`BD-RECORD ${door} ${job.name}: ${recs.length} sessions`);
    const felled = job.name === 'the kill' || job.felled === true;
    const [lo, hi] = job.stood || (felled ? [0, 0] : [1, 1000]);
    for (const r of recs) {
      if (!r.fight) { bad.push(`BD-RECORD ${door} ${job.name}: no record`); continue; }
      if (JSON.stringify(r.seen) !== JSON.stringify(r.fight)) bad.push(`BD-RECORD ${door} ${job.name}: the view reads ${JSON.stringify(r.seen)}, the row ${JSON.stringify(r.fight)}`);
      if (!(r.fight.boss_pm >= lo && r.fight.boss_pm <= hi)) bad.push(`BD-RECORD ${door} ${job.name}: he stood at ${r.fight.boss_pm}, want ${lo}..${hi}`);
    }
    /* What fired is the sum of the windows, not the last one: Power Strike every 6 s over ten minutes is many times what one window of ${WINDOW} ms can hold. */
    if (job.manyWindows && !recs.some((r) => r.fight && Number(r.fight.fired.power_strike) > 2 * (WINDOW / 6000))) bad.push(`BD-RECORD ${door} ${job.name}: ten minutes fired ${JSON.stringify(recs.map((r) => r.fight && r.fight.fired))}: only the last window kept`);
    const inv1 = await bagOf(db, uids);
    const got1 = gained(inv0, inv1);
    ends[job.name] = got.map((g) => g.end_reason + '@' + new Date(g.ended_at).toISOString()).concat(recs.map((r) => JSON.stringify(r.fight)), [JSON.stringify(got1)]);
    if (job.want[0] === 'boss_time' && !got.every((g) => new Date(g.ended_at).getTime() === anchorMs + BOSS_CALL_RULES.limitMs)) bad.push(`BD-BOTH ${door} the limit ended at ${got.map((g) => g.ended_at)}`);
    /* BD-PAID: never XP, coin or a kill in the tally; loot only on the kill, only off his table, at most one of a row; the bag gains exactly it */
    for (const g of got) {
      if (Number(g.coins) !== 0 || Number(g.kills) !== 0 || Object.entries(g.xp || {}).some(([, n]) => Number(n) > 0)) bad.push(`BD-PAID ${door} ${job.name}: the tally reads ${JSON.stringify({ c: g.coins, k: g.kills, x: g.xp })}`);
      const loot = Object.entries(g.loot || {}).filter(([id]) => id !== '*');
      if (!felled && loot.length) bad.push(`BD-PAID ${door} ${job.name}: a fight nobody won paid ${JSON.stringify(g.loot)}`);
      for (const [id, n] of loot) if (!TABLE.includes(id) || Number(n) !== 1) bad.push(`BD-PAID ${door} ${job.name}: the win paid ${id} x${n}, off his table or past one a win`);
      const mine = got1[g.user_id] || {};
      if (JSON.stringify(Object.entries(mine).sort()) !== JSON.stringify(loot.map(([id, n]) => [id, Number(n)]).sort())) bad.push(`BD-PAID ${door} ${job.name}: the bag gained ${JSON.stringify(mine)}, the tally says ${JSON.stringify(g.loot)}`);
    }
    if (felled) {
      /* the certain rows of his table land once a win, shared by the room (rollDropTable: one roll for the party) */
      for (const d of PM[KING.monster].drops.filter((x) => x.ch === 1)) {
        const n = got.reduce((s, g) => s + Number((g.loot || {})[d.id] || 0), 0);
        if (n !== 1) bad.push(`BD-PAID ${door} ${job.name}: his certain ${d.id} landed ${n} times for one win`);
      }
    }
    const lx1 = await q(db, 'select user_id, level_xp from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [uids]);
    for (const [i, r] of lx1.entries()) if (Number(r.level_xp) > Number(lx0[i].level_xp)) bad.push(`BD-PAID ${door} ${job.name}: Level XP rose`);
    const sk1 = await q(db, 'select user_id, skill_id, xp from public.player_skills where user_id = any($1::uuid[]) and slot = 0 order by user_id, skill_id', [uids]);
    for (const [i, r] of sk1.entries()) if (sk0[i] && Number(r.xp) > Number(sk0[i].xp)) bad.push(`BD-PAID ${door} ${job.name}: ${r.skill_id} rose`);
    /* the purse: what it held, less its own fee (EVERY seat's), less the store's bill (journalled per hero, supply_buy): not a coin came in */
    for (const [i, uid] of uids.entries()) {
      const bill = Number(await one(db, `select coalesce(sum(-gold), 0) from public.player_ledger where user_id = $1 and kind = 'hunt' and intent = 'supply_buy'`, [uid]));
      const want = 200000 - FEE - bill;
      if (await purse(db, uid) !== want) bad.push(`BD-PAID ${door} ${job.name}: seat ${i}'s purse reads ${await purse(db, uid)}, want ${want}`);
    }
    if (Number(await one(db, `select count(*) from public.hunt_session_events e join public.hunt_sessions h on h.id = e.session_id where h.instance_id = $1 and (e.type = 'level_up' or (e.type = 'rare_drop' and not (e.data->>'item' = any($2::text[]))))`, [pid, TABLE]))) bad.push(`BD-PAID ${door} ${job.name}: a level event, or a rare off his table`);
    for (const uid of uids) {
      if (Number(await one(db, 'select count(*) from public.hr_bestiary_of($1::uuid, 0) b where b.monster_id = $2', [uid, KING.monster]))) bad.push(`BD-PAID ${door} ${job.name}: a Bestiary row`);
    }
    const sheet1 = await q(db, 'select public.hr_character_sheet_view(u, 0)->$2 as b from unnest($1::uuid[]) u', [uids, 'bestiary']);
    if (JSON.stringify(sheet1) !== JSON.stringify(sheet0)) bad.push(`BD-PAID ${door} ${job.name}: the Bestiary read moved: ${JSON.stringify(sheet1)}`);
    if (lone) {
      if (await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [uids[0]]) !== null) bad.push(`BD-PAID ${door} ${job.name}: a lone call left the hero in a party`);
    } else if (await one(db, 'select hunt_id from public.hunt_parties where id = $1', [pid]) !== KING.from) bad.push(`BD-PAID ${door} ${job.name}: the party stands on ${await one(db, 'select hunt_id from public.hunt_parties where id = $1', [pid])}`);
    /* BD-PRIZE */
    const counters = await q(db, `select user_id, value from public.player_progress where user_id = any($1::uuid[]) and slot = 0 and kind = 'stat' and period_key = '' and key = 'ev:kill_monster:' || $2`, [uids, KING.monster]);
    if (felled ? !(counters.length === uids.length && counters.every((c) => Number(c.value) === 1)) : counters.length) bad.push(`BD-PRIZE ${door} ${job.name}: the counters read ${JSON.stringify(counters)}`);
    const lines = Number(await one(db, `select count(*) from public.chat_messages m where m.channel = 'system' and m.from_id = any($1::uuid[]) and m.body like '%called out the Rat King%'`, [uids]));
    if (lines !== (felled ? 1 : 0)) bad.push(`BD-PRIZE ${door} ${job.name}: ${lines} System lines`);
    /* the line says who brought him down: a party, or a hero alone */
    const said = lone ? 'called out the Rat King alone and brought him down.' : 'and party called out the Rat King and brought him down.';
    if (felled && Number(await one(db, `select count(*) from public.chat_messages m where m.channel = 'system' and m.from_id = any($1::uuid[]) and m.body = $2`, [uids, said])) !== 1) {
      bad.push(`BD-PRIZE ${door} ${job.name}: the System line reads ${JSON.stringify(await q(db, `select body from public.chat_messages m where m.channel = 'system' and m.from_id = any($1::uuid[])`, [uids]))}, want "${said}"`);
    }
    const before = await purse(db, uids[0]);
    const claim = await as(db, uids[0], `select public.hr_title_buy(0, 'grate_thief', 0, $1::uuid)`, [idem()]);
    if (felled ? claim.ok !== true : claim.error !== 'title_kills') bad.push(`BD-PRIZE ${door} ${job.name}: the claim answered ${JSON.stringify(claim)}`);
    if (await purse(db, uids[0]) !== before) bad.push(`BD-PRIZE ${door} ${job.name}: the claim moved gold`);
  }
  return { bad, ends };
}

/* ── THE SERIES, BOTH DOORS ───────────────────────────────────────────────────
   `fights` the count called; `uids` the room; `after1` a row planted once the second fight has started (the loss, the second limit); `pools` each seat's stamina
   before the call (fights' worth, plus half a fight); `purse` the caller's gold as fights' worth over its "Keep at least", less one coin; `want` each seat's
   end, `paid` each seat's fights charged, `won` the room's wins. */
const SERIES = [
  { name: 'three wins alone', fights: 3, uids: [16], lone: true, want: ['boss_felled'], paid: [3], won: 3 },
  { name: 'three wins, a pair', fights: 3, uids: [17, 18], want: ['boss_felled', 'boss_felled'], paid: [3, 3], won: 3 },
  { name: 'a loss in the second fight', arm: 'BD-LOSS', fights: 3, uids: [19], lone: true, after1: { hp: 100000000, atk: 60000, aim: 100000, spells: [] }, want: ['died'], paid: [2], won: 1 },
  { name: 'out of stamina alone', arm: 'BD-STAM', fights: 5, uids: [20], lone: true, pools: [2], want: ['stamina'], paid: [2], won: 2 },
  { name: 'a pair, one out of stamina', arm: 'BD-STAM', fights: 5, uids: [21, 22], pools: [null, 1], want: ['party_member_left', 'stamina'], paid: [1, 1], won: 1, by: [1, 'stamina'] },
  { name: 'out of gold', arm: 'BD-GOLD', fights: 5, uids: [23], lone: true, purse: 3, want: ['gold_out'], paid: [2], won: 2 },
  { name: 'the second fight\'s limit', arm: 'BD-LIMIT2', fights: 2, uids: [24], lone: true, after1: { hp: 100000000, atk: 1, aim: 1, spells: [] }, want: ['boss_time'], paid: [2], won: 1 },
];

async function seriesDoors(door, boot) {
  const bad = [];
  const { db } = await boot();
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const ends = {};
  const row = EM[KING.monster], ADD = EM[ADD_ID];
  const keep = { hp: row.hp, atk: row.atk, aim: row.aim, def: row.def, spells: row.spells };
  const keepAdd = { hp: ADD.hp, atk: ADD.atk, aim: ADD.aim };
  const setRow = (o) => { for (const inst of [row, PM[KING.monster]]) Object.assign(inst, o); };
  for (const job of SERIES) {
    const tag = (job.arm || 'BD-SERIES') + ' ' + door + ' ' + job.name;
    const uids = job.uids.map((i) => UIDS[i]);
    const anchorMs = Date.UTC(2026, 9, 25, 12, 0, 0);
    const lone = job.lone === true;
    const party0 = lone ? null : await party(db, M, uids, { level: 60, gold: 200000, names: 'Ser' + job.uids[0] });
    if (lone) await solo(db, M, uids[0], { level: 60, name: 'Ser' + job.uids[0] + 'a' });
    const floor = await keepOf(db, uids[0]);
    const gold0 = job.purse ? job.purse * FEE + floor - 1 : 200000;
    if (job.purse) await gold(db, uids[0], gold0);
    for (const [i, uid] of uids.entries()) {
      /* stamped an hour ahead, so the pool reads exactly this at the press and at the arrival (a stamp behind them rests a few real milliseconds) */
      if (job.pools && job.pools[i] != null) await db.query(`update public.player_state set stamina_ms = $2, stamina_at = now() + interval '1 hour' where user_id = $1 and slot = 0`, [uid, job.pools[i] * STAM + STAM / 2]);
    }
    const pool0 = [];
    for (const uid of uids) pool0.push(await poolNow(db, uid));
    const inv0 = await bagOf(db, uids);
    const made = await call(db, uids[0], job.fights, FEE);
    if (made.ok !== true) { bad.push(`${tag}: the call answered ${JSON.stringify({ ...made, boss_call: null })}`); continue; }
    const pid = lone ? await one(db, 'select instance_id from public.hunt_sessions where user_id = $1 and slot = 0 and hunt_id = $2 and ended_at is null', [uids[0], KING.hunt]) : party0;
    /* the pool after the press: the arrival's reading, less the first fight (it never moves again but by a fight) */
    const pool1 = [];
    for (const uid of uids) pool1.push(await pool(db, uid));
    await backdate(db, pid, anchorMs);
    setRow(SOFT);
    for (const inst of [ADD, PM[ADD_ID]]) Object.assign(inst, SOFT_ADD);
    let got, planted = false, from2 = null;
    try {
      got = await fightToEnd(db, M, door, uids, pid, anchorMs, { fights: job.fights, oneSlice: !!job.after1, stop: async () => {
        /* once the second fight has started, the row the job wants for it */
        if (job.after1 && !planted && Number(await one(db, 'select coalesce(max(call_fight), 0) from public.hunt_sessions where instance_id = $1 and ended_at is null', [pid])) >= 2) {
          planted = true;
          from2 = await one(db, 'select max(fight_from) from public.hunt_sessions where instance_id = $1 and ended_at is null', [pid]);
          /* THE RECORD IS ONE FIGHT'S (the losing line reads it): the second fight starts with none, not with the first one's */
          const rec = await q(db, 'select t.fight from public.hunt_session_tally t join public.hunt_sessions h on h.id = t.session_id where h.instance_id = $1 and h.ended_at is null', [pid]);
          if (rec.some((r) => r.fight !== null)) bad.push(`${tag}: the second fight began with the first fight's record: ${JSON.stringify(rec.map((r) => r.fight))}`);
          setRow(job.after1);
        }
        return false;
      } });
    } finally {
      setRow(keep);
      for (const inst of [ADD, PM[ADD_ID]]) Object.assign(inst, keepAdd);
    }
    if (await openIn(db, pid)) { bad.push(`${tag}: ${await openIn(db, pid)} heroes still in the room`); continue; }
    if (job.after1 && !planted) bad.push(`${tag} CONTROL: the second fight never started`);
    const by = new Map(got.map((g) => [g.user_id, g]));
    const sig = [];
    for (const [i, uid] of uids.entries()) {
      const g = by.get(uid);
      if (!g) { bad.push(`${tag}: seat ${i} has no session`); continue; }
      if (g.end_reason !== job.want[i]) bad.push(`${tag}: seat ${i} ended ${g.end_reason}, want ${job.want[i]}`);
      if (g.call_fights !== job.fights || g.call_fight !== job.paid[i] || g.call_won !== job.won) bad.push(`${tag}: seat ${i}'s series reads ${g.call_fight} of ${g.call_fights} fought, ${g.call_won} won; want ${job.paid[i]} fought, ${job.won} won`);
      /* EACH FIGHT CHARGED ONCE: the fee, from this seat's own purse (no store bill: he hurts nobody), one ledger row a fight */
      const bill = Number(await one(db, `select coalesce(sum(-gold), 0) from public.player_ledger where user_id = $1 and kind = 'hunt' and intent = 'supply_buy'`, [uid]));
      const had = i === 0 ? gold0 : 200000;
      if (await purse(db, uid) !== had - job.paid[i] * FEE - bill) bad.push(`${tag}: seat ${i}'s purse reads ${await purse(db, uid)}, want ${had - job.paid[i] * FEE - bill} (${job.paid[i]} fights at ${FEE})`);
      const rows = await calls(db, uid);
      const fightsPaid = rows.map((r) => r.meta.fight).join();
      if (rows.length !== job.paid[i] || fightsPaid !== Array.from({ length: job.paid[i] }, (_, k) => k + 1).join() || rows.some((r) => r.kind !== 'shop' || Number(r.gold) !== -FEE)) bad.push(`${tag}: seat ${i}'s ledger reads ${JSON.stringify(rows.map((r) => [r.intent, r.gold, r.meta.fight]))}`);
      /* ...AND ITS STAMINA: the room's own time drains nothing and rests nothing, so the pool is the press's less one fight a later fight, to the millisecond */
      const left = await pool(db, uid);
      if (left !== pool1[i] - (job.paid[i] - 1) * STAM) bad.push(`${tag}: seat ${i}'s pool reads ${left}, want ${pool1[i] - (job.paid[i] - 1) * STAM} (the press left ${pool1[i]}, ${job.paid[i] - 1} more fights at ${STAM})`);
      if (pool1[i] > pool0[i] - STAM + 5000 || pool1[i] < pool0[i] - STAM) bad.push(`${tag}: the press left seat ${i} ${pool1[i]} of ${pool0[i]}, want one fight off`);
      /* ...and the pool READ at the room's last instant is the pool it holds: its stamp walked with every window, so no second in the room was rest */
      const read = Number(await one(db, 'select public.hr_stamina_of($1::uuid, 0, $2::timestamptz)::text', [uid, g.ended_at]));
      if (read !== left) bad.push(`${tag}: seat ${i}'s pool reads ${read} at the room's last instant and holds ${left}: the room's time rested it`);
      /* the title's counter: once a win this hero stood in */
      const n = Number(await one(db, `select coalesce(max(value), 0) from public.player_progress where user_id = $1 and slot = 0 and kind = 'stat' and period_key = '' and key = 'ev:kill_monster:' || $2`, [uid, KING.monster]));
      if (n !== job.won) bad.push(`${tag}: seat ${i}'s counter reads ${n}, want ${job.won}`);
      const seen = await one(db, `select public.hr_hunt_view($1::uuid)->'call'`, [g.id]);
      if (!seen || seen.fights !== job.fights || seen.fight !== job.paid[i] || seen.won !== job.won || seen.paid_gold !== job.paid[i] * FEE || seen.paid_stamina_ms !== job.paid[i] * STAM) bad.push(`${tag}: seat ${i}'s view reads ${JSON.stringify(seen)}`);
      if (Number(g.coins) !== 0 || Number(g.kills) !== 0 || Object.entries(g.xp || {}).some(([, x]) => Number(x) > 0)) bad.push(`${tag}: seat ${i}'s tally reads ${JSON.stringify({ c: g.coins, k: g.kills, x: g.xp })}`);
      for (const [id, x] of Object.entries(g.loot || {})) if (id !== '*' && (!TABLE.includes(id) || Number(x) > job.won)) bad.push(`${tag}: seat ${i} looted ${id} x${x}: off his table, or more than a win's roll each`);
      /* (the pool as what the fights after the press took: a party seat arrives on the room's next boundary, a few real milliseconds of rest apart a run) */
      sig.push([g.end_reason, new Date(g.ended_at).toISOString(), g.call_fight, g.call_won, await purse(db, uid), pool1[i] - left, JSON.stringify(Object.entries(g.loot || {}).sort())]);
    }
    /* HIS TABLE IS ROLLED ONCE A WIN: its certain rows land exactly once a win, for the room */
    for (const d of PM[KING.monster].drops.filter((x) => x.ch === 1)) {
      const n = got.reduce((s, g) => s + Number((g.loot || {})[d.id] || 0), 0);
      if (n !== job.won) bad.push(`${tag}: his certain ${d.id} landed ${n} times in ${job.won} wins`);
    }
    const bag = gained(inv0, await bagOf(db, uids));
    for (const g of got) {
      const loot = Object.entries(g.loot || {}).filter(([id]) => id !== '*').map(([id, x]) => [id, Number(x)]).sort();
      if (JSON.stringify(Object.entries(bag[g.user_id] || {}).sort()) !== JSON.stringify(loot)) bad.push(`${tag}: a bag gained ${JSON.stringify(bag[g.user_id] || {})}, its tally says ${JSON.stringify(g.loot)}`);
    }
    /* SAY WHY: a hero sent home because another could not pay reads who, and what it ran out of (hr_hunt_view end_by / end_by_why, the server's rows) */
    if (job.by) {
      const seen = await one(db, 'select public.hr_hunt_view($1::uuid)', [by.get(uids[0]).id]);
      const who = await one(db, 'select public.hr_character_name($1::uuid, 0)', [uids[job.by[0]]]);
      if (!seen || seen.end_by !== who || seen.end_by_why !== job.by[1]) bad.push(`${tag}: the hero sent home reads end_by ${JSON.stringify(seen && seen.end_by)} (${JSON.stringify(seen && seen.end_by_why)}), want ${who} (${job.by[1]})`);
    }
    /* every hero's end is the room's one instant */
    if (new Set(got.map((g) => new Date(g.ended_at).getTime())).size !== 1) bad.push(`${tag}: the room ended at ${got.map((g) => g.ended_at)}`);
    /* BD-LIMIT2: the second fight's limit ran from ITS start, to the millisecond, not from the session's */
    if (job.arm === 'BD-LIMIT2' && from2) {
      const at = new Date(got[0].ended_at).getTime(), f2 = new Date(from2).getTime();
      if (at !== f2 + BOSS_CALL_RULES.limitMs || f2 <= anchorMs) bad.push(`${tag}: ended ${new Date(at).toISOString()}; the second fight began ${new Date(f2).toISOString()} and its limit falls ${new Date(f2 + BOSS_CALL_RULES.limitMs).toISOString()}`);
    }
    /* the record is the LAST fight's (the losing line reads it): a room that ended on a win reads nothing left of him */
    if (job.want.every((w) => w !== 'died' && w !== 'boss_time')) {
      const recs = await q(db, 'select t.fight from public.hunt_session_tally t join public.hunt_sessions h on h.id = t.session_id where h.instance_id = $1 and h.hunt_id = $2', [pid, KING.hunt]);
      if (!recs.length || recs.some((r) => !r.fight || r.fight.boss_pm !== 0)) bad.push(`${tag}: the record reads ${JSON.stringify(recs.map((r) => r.fight))}`);
    }
    ends[job.name] = sig;
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
  const made = await call(db, uids[0], 2, FEE);
  if (made.ok !== true) return ['BD-FORGED the call answered ' + JSON.stringify(made)];
  const anchorMs = Date.UTC(2026, 9, 25, 12, 0, 0);
  await backdate(db, pid, anchorMs);
  const exec = makeExec(db);
  const strikes = async (room) => {
    /* a refused window is a strike, and the sixth forfeits the hunt (the settle's fuse): each plant is judged alone */
    await db.query('update public.hunt_instances set refusals = 0 where id = $1', [room]);
    await db.query('update public.hunt_sessions set refusals = 0 where instance_id = $1', [room]);
  };
  const KILL = { kind: 'stat', key: 'ev:kill_monster:' + KING.monster, period: '', add: 1, state: 'active' };
  /* A WINDOW NOBODY WON IN (his real row: the pair is still fighting him) */
  const P = [['coin', (m) => { m.delta.gold = 5; }], ['an item', (m) => { m.delta.items = { bones: 1 }; }], ['skill XP', (m) => { m.delta.xp = { melee: 1 }; }], ['Level XP', (m) => { m.delta.level_xp = 1; }],
    ['a kill', (m) => { m.delta.journal.meta.kills = 1; m.delta.journal.meta.km = { [KING.monster]: 1 }; }], ['a Hearthfind', (m) => { m.delta.hearthfind = { item: 'bones', source_kind: 'monster', source_id: KING.monster }; }],
    ['another boss\'s counter', (m) => { m.delta.progress = [{ kind: 'stat', key: 'ev:kill_monster:rat_king', period: '', add: 1, state: 'active' }]; }],
    ['a kill stat', (m) => { m.delta.progress = [{ kind: 'stat', key: 'kills', period: '', add: 1, state: 'active' }]; }],
    /* his kill claimed, and his table with it, in a window that ends nothing: a roll with no fight spent */
    ['a kill that ends nothing', (m) => { m.delta.progress = [KILL]; m.delta.items = { rat_tail: 1 }; }, 'called_pays'],
    /* a fight called won with no kill in its window */
    ['a win with no kill', (m) => { m.hunt.ended = { reason: 'boss_felled', at: m.hunt.to }; }, 'end_not_proven']];
  for (const [name, plantIt, want = 'called_pays'] of P) {
    const plan = await M.HS.readHuntSettle({ exec, user: uids[0], slot: 0, atMs: anchorMs + WINDOW }, 'tick');
    if (plan.answer) { bad.push('BD-FORGED harness: ' + plan.answer.reason); break; }
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    if (!p.out.accrued) { bad.push('BD-FORGED harness: nothing proposed: ' + p.out.reason); break; }
    if (p.commit.members.some((m) => m.hunt.ended)) { bad.push('BD-FORGED harness: the first window ended the fight'); break; }
    plantIt(p.commit.members[0]);
    const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    const said = JSON.stringify(res);
    if (!res || res.ok === true || !said.includes(want)) bad.push('BD-FORGED ' + name + ' answered ' + said.slice(0, 200));
    await strikes(pid);
  }
  /* BD-LOSS, THE ROOM'S PLAN (hr_boss_call_plan, what the settle decides before any member lands): a pair that both won goes on; a death beside the
     win (the kill and a hero's fall in one swing), a leave, or a hero still fighting plans nothing, so the win's end closes the room for everyone. */
  {
    const seats = await q(db, 'select id, user_id from public.hunt_sessions where instance_id = $1 and ended_at is null order by seat', [pid]);
    const at = new Date(anchorMs + 40000).toISOString();
    const mem = (ends) => JSON.stringify(seats.map((s, i) => ({ user: s.user_id, slot: 0, session: s.id, hunt: { ended: ends[i] ? { reason: ends[i], at } : null } })));
    const planOf = (ends) => one(db, 'select public.hr_boss_call_plan($1::uuid, $2::jsonb, $3::timestamptz)', [pid, mem(ends), at]);
    const both = await planOf(['boss_felled', 'boss_felled']);
    if (!both || both.next !== true || Object.keys(both.stop).length) bad.push('BD-LOSS CONTROL: a pair that both won plans ' + JSON.stringify(both));
    for (const ends of [['boss_felled', 'died'], ['died', 'boss_felled'], ['boss_felled', 'left'], ['boss_felled', null], ['boss_felled', 'party_member_died']]) {
      const plan = await planOf(ends);
      if (plan !== null) bad.push('BD-LOSS a room that ended ' + ends.join(' and ') + ' planned a next fight: ' + JSON.stringify(plan));
    }
  }
  /* A forged record: the settle's bad_analyzer, whole. */
  for (const [name, f] of [['past the top', { boss_pm: 1001, fired: {} }], ['a stray key', { boss_pm: 5, fired: {}, gold: 9 }], ['a negative count', { boss_pm: 5, fired: { eat: -1 } }], ['not a number', { boss_pm: 'x', fired: {} }]]) {
    const plan = await M.HS.readHuntSettle({ exec, user: uids[0], slot: 0, atMs: anchorMs + WINDOW }, 'tick');
    if (plan.answer) { bad.push('BD-RECORD harness: ' + plan.answer.reason); break; }
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    p.commit.members[0].analyzer.fight = f;
    const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    if (!res || res.ok === true || !JSON.stringify(res).includes('bad_analyzer')) bad.push('BD-RECORD a record ' + name + ' answered ' + JSON.stringify(res).slice(0, 200));
    await strikes(pid);
  }
  /* A record on any other hunt is refused, and a session with none has no such key: every other hunt's section stays as it was. */
  if (await one(db, `select public.hr_boss_fight_ok('{"boss_pm":5,"fired":{}}'::jsonb, 'millrace_sewer')`)) bad.push('BD-RECORD a normal hunt may carry a record');
  {
    const sid = await one(db, 'select id from public.hunt_sessions where instance_id = $1 limit 1', [pid]);
    await db.query('update public.hunt_session_tally set fight = null where session_id = $1', [sid]);
    if (await one(db, `select public.hr_hunt_view($1::uuid)->'tally' ? 'fight'`, [sid])) bad.push('BD-RECORD a session with no record shows a fight key');
    const cellar = await one(db, `select public.hr_hunt_view(h.id) ? 'call' from public.hunt_sessions h where h.call_fights is null limit 1`);
    if (cellar === true) bad.push('BD-FORGED a hunt with no series shows a call key');
  }
  /* A clean window still lands: the refusals above were the plants, not the room. */
  {
    const plan = await M.HS.readHuntSettle({ exec, user: uids[0], slot: 0, atMs: anchorMs + WINDOW }, 'tick');
    if (plan.answer) return [...bad, 'BD-FORGED the clean window answered ' + plan.answer.reason];
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    if (!res || res.ok !== true) bad.push('BD-FORGED the clean window was refused: ' + JSON.stringify(res).slice(0, 200));
  }

  /* HIS KILL'S OWN WINDOW (a soft row: a lone hero fells him in the first window of a series of two). Each plant rides the real kill and is refused whole;
     then the same window lands with a forged stamina number, which is ignored: the pool is the server's. */
  const w = UIDS[30];
  await solo(db, M, w, { level: 60, name: 'Forgew' });
  const wPool0 = await poolNow(db, w);
  const made2 = await call(db, w, 2, FEE);
  if (made2.ok !== true) return [...bad, 'BD-FORGED the lone call answered ' + JSON.stringify({ ...made2, boss_call: null })];
  const room = await one(db, 'select instance_id from public.hunt_sessions where user_id = $1 and slot = 0 and hunt_id = $2 and ended_at is null', [w, KING.hunt]);
  const wPool1 = await pool(db, w);
  await backdate(db, room, anchorMs);
  const row = EM[KING.monster], ADD = EM[ADD_ID];
  const keep = { hp: row.hp, atk: row.atk, aim: row.aim, def: row.def, spells: row.spells };
  const keepAdd = { hp: ADD.hp, atk: ADD.atk, aim: ADD.aim };
  for (const inst of [row, PM[KING.monster]]) Object.assign(inst, SOFT);
  for (const inst of [ADD, PM[ADD_ID]]) Object.assign(inst, SOFT_ADD);
  try {
    const isKill = (op) => op.kind === 'stat' && op.key === KILL.key;
    const W = [
      ['an item off his table', (m) => { m.delta.items = { ...(m.delta.items || {}), steel_platebody: 1 }; }, 'called_pays'],
      ['his item twice', (m) => { m.delta.items = { ...(m.delta.items || {}), rat_tail: 2 }; }, 'called_pays'],
      ['skill XP on a win', (m) => { m.delta.xp = { melee: 1 }; }, 'called_pays'],
      ['coin on a win', (m) => { m.delta.gold = 5; }, 'called_pays'],
      ['a second kill', (m) => { m.delta.progress = [...m.delta.progress, KILL]; }, 'called_pays'],
      /* ...and with nothing else in the window to refuse it: the title's counter moves once a fight */
      ['a second kill and no drops', (m) => { m.delta.progress = [KILL, KILL]; delete m.delta.items; }, 'called_pays'],
      ['a loot count past the item', (m) => { m.delta.progress = [...m.delta.progress, { kind: 'stat', key: 'ev:loot:rat_tail', period: '', add: 5, state: 'active' }]; }, 'called_pays'],
      ['the end stripped off his kill', (m) => { m.hunt.ended = null; }, 'called_pays'],
      ['his kill stripped off the end', (m) => { m.delta.progress = m.delta.progress.filter((op) => !isKill(op) && !/^ev:loot:/.test(op.key) && op.key !== 'rare_drops'); delete m.delta.items; }, 'end_not_proven'],
    ];
    for (const [name, plantIt, want] of W) {
      const plan = await M.HS.readHuntSettle({ exec, user: w, slot: 0, atMs: anchorMs + WINDOW }, 'tick');
      if (plan.answer) { bad.push('BD-FORGED harness (win): ' + plan.answer.reason); break; }
      const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
      const m = p.commit.members[0];
      if (!m.hunt.ended || m.hunt.ended.reason !== 'boss_felled' || !m.delta.progress.some(isKill) || !m.delta.items) { bad.push('BD-FORGED harness: the first window is not his kill: ' + JSON.stringify(m.hunt.ended)); break; }
      plantIt(m);
      const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
      const said = JSON.stringify(res);
      if (!res || res.ok === true || !said.includes(want)) bad.push('BD-FORGED ' + name + ' answered ' + said.slice(0, 220));
      await strikes(room);
    }
    if (await pool(db, w) !== wPool1 || await purse(db, w) !== 200000 - FEE || (await bagOf(db, [w])).length) bad.push('BD-FORGED a refused win moved the pool, the purse or the bag');
    /* the same window, a forged stamina number on it: it lands, and the pool is one more fight down, nothing else */
    const plan = await M.HS.readHuntSettle({ exec, user: w, slot: 0, atMs: anchorMs + WINDOW }, 'tick');
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    p.commit.members[0].hunt.stamina = 43200000;
    const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    if (!res || res.ok !== true) bad.push('BD-FORGED a win with a forged stamina number was refused: ' + JSON.stringify(res).slice(0, 220));
    else {
      if (await pool(db, w) !== wPool1 - STAM) bad.push('BD-FORGED the engine\'s stamina number moved the pool: ' + await pool(db, w) + ', want ' + (wPool1 - STAM));
      const s = (await q(db, 'select call_fight, call_won, ended_at from public.hunt_sessions where user_id = $1 and hunt_id = $2', [w, KING.hunt]))[0];
      if (!s || s.call_fight !== 2 || s.call_won !== 1 || s.ended_at !== null) bad.push('BD-FORGED after the win the series reads ' + JSON.stringify(s));
      if (await purse(db, w) !== 200000 - 2 * FEE) bad.push('BD-FORGED the second fight was not charged: ' + await purse(db, w));
      if ((await one(db, 'select world from public.hunt_instances where id = $1', [room])) !== null) bad.push('BD-FORGED the next fight kept the old room\'s world');
    }
    if (wPool1 > wPool0 - STAM + 5000) bad.push('BD-FORGED harness: the press left ' + wPool1 + ' of ' + wPool0);
  } finally {
    for (const inst of [row, PM[KING.monster]]) Object.assign(inst, keep);
    for (const inst of [ADD, PM[ADD_ID]]) Object.assign(inst, keepAdd);
  }
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
  series: async (boot) => {
    const a = await seriesDoors('fire', boot), b = await seriesDoors('viewed', boot);
    const bad = [...a.bad, ...b.bad];
    for (const k of Object.keys(a.ends)) if (JSON.stringify(a.ends[k]) !== JSON.stringify(b.ends[k])) bad.push(`BD-SERIES ${k}: the browser closed ends ${JSON.stringify(a.ends[k])}, the hunt viewed ${JSON.stringify(b.ends[k])}`);
    return bad;
  },
};

const FN = { view: 'public.hr_hunt_view(uuid)', admit: 'public.hr_hunt_admit(uuid,integer,text)', apply: 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', verb: 'public.hr_boss_call(integer,text,integer,bigint,uuid)', quote: 'public.hr_boss_call_quote(uuid,integer,text)',
  settle: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', best: 'public.hr_bestiary_of(uuid,integer)', closed: 'public.hr_boss_call_closed()', felled: 'public.hr_boss_call_felled()',
  pays: 'public.hr_boss_call_pays(jsonb,text)', plan: 'public.hr_boss_call_plan(uuid,jsonb,timestamp with time zone)', step: 'public.hr_boss_call_step(uuid,integer,uuid,jsonb,jsonb)',
  inst: 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', read: 'public.hr_hunt_member_read(public.hunt_sessions)' };
const MUTANTS = [
  { name: 'the settle takes a forged record', fn: FN.apply, find: "(p_analyzer ? 'fight' and not public.hr_boss_fight_ok(p_analyzer->'fight', v_s.hunt_id))", repl: 'false', arm: 'forged', want: /BD-RECORD/ },
  { name: 'the record is never written', fn: FN.apply, find: "fight = case when p_analyzer ? 'fight' then", repl: 'fight = case when false then', arm: 'doors', want: /BD-RECORD/ },
  { name: 'the record keeps the first window\'s boss', fn: FN.apply, find: "jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',", repl: "jsonb_build_object('boss_pm', coalesce(t.fight->'boss_pm', p_analyzer->'fight'->'boss_pm'),", arm: 'doors', want: /BD-RECORD/ },
  { name: 'what fired is only the last window', fn: FN.apply, find: "public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))", repl: "coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb)", arm: 'doors', want: /BD-RECORD/ },
  { name: 'the view never shows it', fn: FN.view, find: "|| case when t.fight is null then '{}'::jsonb else jsonb_build_object('fight', t.fight) end", repl: '', arm: 'doors', want: /BD-RECORD/ },
  { name: 'every session shows a fight key', fn: FN.view, find: "case when t.fight is null then '{}'::jsonb else", repl: "case when false then '{}'::jsonb else", arm: 'forged', want: /BD-RECORD/ },
  { name: 'a normal hunt may carry a record', fn: 'public.hr_boss_fight_ok(jsonb,text)', find: "if not exists (select 1 from public.hr_boss_calls c where c.hunt_id = p_hunt) then return false; end if;", repl: '', arm: 'forged', want: /BD-RECORD/ },
  { name: 'every door opens the room', fn: FN.admit, find: "and current_setting('hr.boss_call', true) is distinct from p_hunt then", repl: 'and false then', arm: 'verb', want: /BD-DOOR/ },
  { name: 'a stale price is taken', fn: FN.verb, find: "if (v_q->>'price')::bigint <> p_price then", repl: 'if false then', arm: 'verb', want: /BD-WORDS/ },
  { name: 'the verb charges the client\'s number', fn: FN.verb, find: "(case when p_price > 0 then jsonb_build_object('gold', -p_price) else '{}'::jsonb end)",
    repl: "(case when p_price > 0 then jsonb_build_object('gold', -least(p_price, 1)) else '{}'::jsonb end)", arm: 'verb', want: /BD-ALONE|BD-CHARGE/ },
  { name: 'a member may call', fn: FN.quote, find: "when v_party is not null and not (v_p.leader_user = p_user and v_p.leader_slot = p_slot) then 'call_leader'", repl: "when false then 'call_leader'", arm: 'verb', want: /BD-WORDS/ },
  /* THE LOCK, BACK (the designer's ruling 2, 2026-11-10, retired it): a hero alone is refused again. */
  { name: 'a lone call is refused', fn: FN.quote, find: 'v_why := case when v_party is not null', repl: "v_why := case when v_party is null then 'call_party' when v_party is not null", arm: 'verb', want: /BD-WORDS|BD-ALONE/ },
  { name: 'the quote never says alone', fn: FN.quote, find: "'alone', v_seats = 1,", repl: "'alone', false,", arm: 'verb', want: /BD-WORDS/ },
  { name: 'a lone call takes the party door', fn: FN.verb, find: '    if v_party is null then', repl: '    if false then', arm: 'verb', want: /BD-ALONE/ },
  { name: 'a lone fight is called a party\'s', fn: FN.felled, find: 'case when exists (select 1 from public.hunt_sessions h where h.instance_id = new.instance_id and h.id <> new.id)', repl: 'case when true', arm: 'doors', want: /BD-PRIZE/ },
  /* THE DAILY CAP, BACK (Tyler 2026-11-14 retired it: stamina is the limit). */
  { name: 'a daily cap is back', fn: FN.quote, find: "then 'call_leader' end;",
    repl: "then 'call_leader' when (select count(*) from public.player_ledger l where l.user_id = p_user and l.kind = 'shop' and l.intent like 'boss\\_call:%' and l.at >= public.hr_utc_day_start(now())) >= 3 then 'call_limit' end;", arm: 'verb', want: /BD-NOCAP/ },
  { name: 'a short purse keeps the seats', fn: FN.verb, find: "v_no := v_a || jsonb_build_object('ok', false); raise exception using errcode = 'HR879', message = 'call_refused'; end if;", repl: "return v_a || jsonb_build_object('ok', false); end if;", arm: 'verb', want: /BD-PURSE/ },
  { name: 'a member who can\'t pay keeps the leader charged', fn: FN.verb, find: "            raise exception using errcode = 'HR879', message = 'call_refused'; end if;\n        else\n          v_g := public.hr_purse_of(v_m.user_id);", repl: "            return v_no; end if;\n        else\n          v_g := public.hr_purse_of(v_m.user_id);", arm: 'verb', want: /BD-PURSE/ },
  { name: 'the settle takes what a called window pays', fn: FN.apply, find: 'public.hr_boss_call_pays(p_delta, c.monster_id) is not null)', repl: 'false)', arm: 'forged', want: /BD-FORGED/ },
  { name: 'the money line lets XP through', fn: FN.pays, find: "k not in ('accrued_to', 'hp', 'journal', 'progress', 'deaths')", repl: "k not in ('accrued_to', 'hp', 'journal', 'progress', 'deaths', 'xp')", arm: 'forged', want: /BD-FORGED/ },
  { name: 'the Bestiary counts him', fn: FN.best, find: "and pp.key not like '%\\_called'", repl: '', arm: 'doors', want: /BD-PAID/ },
  { name: 'the party stays on the room', fn: FN.closed, find: 'update public.hunt_parties p set hunt_id = v_from', repl: 'update public.hunt_parties p set hunt_id = p.hunt_id', arm: 'doors', want: /BD-PAID/ },
  { name: 'every hero posts a System line', fn: FN.felled, find: "and h.end_reason = 'boss_felled' and h.ended_at = new.ended_at", repl: 'and false', arm: 'doors', want: /BD-PRIZE/ },
  { name: 'a second apply splices again', fn: FN.closed, find: 'declare v_from text;', repl: 'declare v_from text; -- a body the second apply will move back', arm: 'again', want: /BD-AGAIN/ },
  { name: 'the limit is not owed', fn: FN.settle, find: 'where c.hunt_id = v_s.hunt_id and v_to > coalesce(v_s.fight_from, v_s.hunt_from) + make_interval(secs => c.limit_ms / 1000.0) + c_skew) then', repl: 'where false) then', arm: 'owed', want: /BD-OWED/ },
  /* ── WHAT A WIN EARNS AND WHAT THE ROOM RISKS (audit F24) ── */
  { name: 'the quote names no drops', fn: FN.quote, find: "'drops', r.drops,", repl: "'drops', '[]'::jsonb,", arm: 'verb', want: /BD-DROPS/ },
  { name: 'a hero under his Level is not counted', fn: FN.quote, find: 'if v_lv < v_boss then v_under := v_under + 1; end if;', repl: '', arm: 'verb', want: /BD-DANGER/ },
  { name: 'only the caller is read for the danger', fn: FN.quote, find: 'v_lv := public.hr_char_level(coalesce((select ps.level_xp from public.player_state ps where ps.user_id = v_m.user_id and ps.slot = v_m.slot), 0));', repl: 'v_lv := public.hr_char_level(coalesce((select ps.level_xp from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot), 0)) + (case when v_m.user_id = p_user and v_m.slot = p_slot then 0 else 500 end);', arm: 'verb', want: /BD-DANGER/ },
  { name: 'every room reads as holding a tank', fn: FN.quote, find: "v_tank := v_tank or v_role is not distinct from 'tank';", repl: 'v_tank := true;', arm: 'verb', want: /BD-DANGER/ },
  { name: 'a bar with no food is not counted', fn: FN.quote, find: 'v_nofood := v_nofood + 1; end if;', repl: 'null; end if;', arm: 'verb', want: /BD-DANGER/ },
  { name: 'a bar that holds nothing is counted as having no food', fn: FN.quote, find: "if (select bool_or(jsonb_typeof(sl.value->'action') = 'object')\n               and not bool_or(", repl: "if (select not coalesce(bool_or(", arm: 'verb', want: /BD-DANGER|THREW/ },
  /* ── THE SERIES (2027-04-24-boss-call-series.sql) ── */
  { name: 'a forged count is taken', fn: FN.verb, find: 'if p_fights is null or p_fights < 1 or p_fights > v_c.max_fights then', repl: 'if false then', arm: 'verb', want: /BD-COUNT|THREW/ },
  { name: 'a forged count is clamped, not refused', fn: FN.verb, find: 'if p_fights is null or p_fights < 1 or p_fights > v_c.max_fights then', repl: 'p_fights := greatest(1, least(coalesce(p_fights, 1), v_c.max_fights));\n  if false then', arm: 'verb', want: /BD-COUNT/ },
  { name: 'a member\'s first fight is free', fn: FN.verb, find: 'v_g := public.hr_purse_move(v_m.user_id, -v_fee, 0);', repl: 'v_g := public.hr_purse_of(v_m.user_id);', arm: 'verb', want: /BD-CHARGE/ },
  { name: 'the press spends no stamina', fn: FN.verb, find: 'set stamina_ms = v_stam - v_c.fight_stamina_ms, stamina_at = v_m.hunt_from,', repl: 'set stamina_ms = v_stam, stamina_at = v_m.hunt_from,', arm: 'verb', want: /BD-ALONE|BD-CHARGE/ },
  { name: 'a hero with no stamina may call', fn: FN.quote, find: "if v_m.user_id = p_user and v_m.slot = p_slot then v_why := 'call_stamina';", repl: 'if v_m.user_id = p_user and v_m.slot = p_slot then v_why := null;', arm: 'verb', want: /BD-SHORT/ },
  { name: 'a member with no stamina is taken along', fn: FN.quote, find: "else v_why := 'party_stamina'; v_who := public.hr_character_name(v_m.user_id, v_m.slot); end if;", repl: 'end if;', arm: 'verb', want: /BD-SHORT/ },
  { name: 'the next fight is free', fn: FN.step, find: 'v_g := public.hr_purse_move(p_user, -v_s.call_fee, 0);', repl: 'v_g := public.hr_purse_of(p_user);', arm: 'series', want: /BD-SERIES/ },
  { name: 'the next fight costs no stamina', fn: FN.step, find: 'set stamina_ms = stamina_ms - v_s.call_stamina_ms, stamina_at = v_at', repl: 'set stamina_ms = stamina_ms, stamina_at = v_at', arm: 'series', want: /BD-SERIES/ },
  { name: 'the next fight is charged twice', fn: FN.step, find: 'set stamina_ms = stamina_ms - v_s.call_stamina_ms, stamina_at = v_at', repl: 'set stamina_ms = stamina_ms - 2 * v_s.call_stamina_ms, stamina_at = v_at', arm: 'series', want: /BD-SERIES|BD-STAM|THREW/ },
  { name: 'the next fight leaves no ledger row', fn: FN.step, find: "values (p_user, p_slot, 'shop', 'boss_call:' || v_c.call_id || ':fight', nullif(-v_s.call_fee, 0),", repl: "select p_user, p_slot, 'shop', 'boss_call:' || v_c.call_id || ':fight', nullif(-v_s.call_fee, 0),", arm: 'series', want: /BD-SERIES|THREW/ },
  { name: 'the room\'s time rests the pool', fn: FN.apply, find: 'update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;\n  elsif not v_train then', repl: 'null;\n  elsif not v_train then', arm: 'series', want: /BD-SERIES|THREW/ },
  { name: 'the room\'s time drains the pool', fn: FN.apply, find: '    v_e := v_s0;\n', repl: '    v_e := greatest(0, v_s0 - v_paid);\n', arm: 'series', want: /BD-SERIES|BD-STAM/ },
  { name: 'the series never ends at its count', fn: FN.plan, find: 'where h.id is null or h.call_fights is null or h.call_fight >= h.call_fights) then return null; end if;', repl: 'where h.id is null or h.call_fights is null) then return null; end if;', arm: 'series', want: /BD-SERIES|THREW/ },
  { name: 'the series stops after one fight', fn: FN.settle, find: "elsif v_end = 'boss_felled' and nullif(current_setting('hr.boss_plan', true), '') is not null", repl: "elsif false and nullif(current_setting('hr.boss_plan', true), '') is not null", arm: 'series', want: /BD-SERIES/ },
  { name: 'a win is not counted', fn: FN.step, find: 'update public.hunt_sessions set call_won = call_won + 1 where id = p_session;', repl: 'null;', arm: 'series', want: /BD-SERIES/ },
  { name: 'stamina never stops the series', fn: FN.plan, find: "if public.hr_stamina_of(v_m.user_id, v_m.slot, v_m.settled_to) < v_m.call_stamina_ms then v_short := 'stamina'; end if;", repl: '', arm: 'series', want: /BD-STAM|THREW/ },
  { name: 'gold never stops the series', fn: FN.plan, find: "if coalesce(v_p, 0) - v_b - v_f < v_floor then v_short := 'gold_out'; end if;", repl: '', arm: 'series', want: /BD-GOLD|THREW/ },
  { name: 'the series spends the hero\'s "Keep at least"', fn: FN.plan, find: "v_floor := greatest(0, coalesce((public.hr_hunt_supply_of(v_m.user_id, v_m.slot, v_m.preset)->>'gold_floor')::bigint, 0));", repl: 'v_floor := 0;', arm: 'series', want: /BD-GOLD/ },
  { name: 'a hero who can pay is told he can\'t', fn: FN.step, find: "v_why := coalesce(v_plan->'stop'->>(p_user::text || ':' || p_slot::text), 'party_member_left');", repl: "v_why := coalesce(v_plan->'stop'->>(p_user::text || ':' || p_slot::text), 'stamina');", arm: 'series', want: /BD-STAM/ },
  { name: 'a hero sent home by another\'s empty pool reads only that he won', fn: FN.step, find: "v_why := coalesce(v_plan->'stop'->>(p_user::text || ':' || p_slot::text), 'party_member_left');", repl: "v_why := coalesce(v_plan->'stop'->>(p_user::text || ':' || p_slot::text), 'boss_felled');", arm: 'series', want: /BD-STAM/ },
  { name: 'a death beside the win goes on to the next fight', fn: FN.plan, find: "where e.value->'hunt'->'ended'->>'reason' is distinct from 'boss_felled'", repl: "where e.value->'hunt'->'ended'->>'reason' is null", arm: 'forged', want: /BD-LOSS/ },
  { name: 'the second fight\'s limit runs from the first', fn: FN.read, find: 'coalesce(p_s.fight_from, p_s.hunt_from)', repl: 'p_s.hunt_from', arm: 'series', want: /BD-LIMIT2|THREW/ },
  { name: 'the second fight\'s limit is proved from the first', fn: FN.settle, find: 'and v_end_at >= coalesce(v_s.fight_from, v_s.hunt_from) + make_interval(secs => c.limit_ms / 1000.0) - c_skew)', repl: 'and v_end_at >= v_s.hunt_from + make_interval(secs => c.limit_ms / 1000.0) - c_skew + interval \'1 hour\')', arm: 'series', want: /BD-LIMIT2|THREW/ },
  { name: 'the next fight keeps the fight\'s record', fn: FN.inst, find: 'update public.hunt_session_tally t set fight = null\n        from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null and t.session_id = h.id and t.fight is not null;', repl: 'null;', arm: 'series', want: /BD-LOSS|BD-LIMIT2/ },
  { name: 'a win pays off his table', fn: FN.pays, find: "or (e.value #>> '{}')::int > coalesce((v_drops->>e.key)::int, 0)", repl: '', arm: 'forged', want: /BD-FORGED/ },
  { name: 'drops with no kill', fn: FN.pays, find: "and not (v_win and k = 'items')", repl: "and k <> 'items'", arm: 'forged', want: /BD-FORGED/ },
  { name: 'two kills in one window', fn: FN.pays, find: "if v_kills > 1 then return 'progress:ev:kill_monster'; end if;", repl: '', arm: 'forged', want: /BD-FORGED/ },
  { name: 'a kill that ends nothing is taken', fn: FN.step, find: "if v_won and coalesce(v_held, v_end) is distinct from 'boss_felled' and v_end is distinct from 'died' then", repl: 'if false then', arm: 'forged', want: /BD-FORGED/ },
  { name: 'a win with no kill is taken', fn: FN.step, find: "if coalesce(v_held, v_end) = 'boss_felled' and not v_won then", repl: 'if false then', arm: 'forged', want: /BD-FORGED/ },
  { name: 'the engine\'s stamina number is the pool', fn: FN.apply, find: '    v_e := v_s0;\n', repl: "    v_e := coalesce((v_stam #>> '{}')::bigint, v_s0);\n", arm: 'forged', want: /BD-FORGED/ },
  /* (No mutant for hr_hunt_apply_instance's `v_world := null`: the engine already proposes no world once every hero has ended, accrual.js, so dropping
     the server's own belt changes nothing a test can see. BD-FORGED still reads the instance's world after a win: null.) */
  { name: 'a second apply of the series moves something', fn: FN.plan, find: 'declare v_m record;', repl: 'declare v_m record; /* a body the second apply will move back */', arm: 'again2', want: /BD-AGAIN/ },
];

/* BD-AGAIN: the four files again, on the chain as of the lane's own last file. A later lane's full-replace catalogue (2027-03-14-jewelry's
   hunt-sessions rows) is newer than these, so re-applying them on the WHOLE chain rolls that lane's rows back by design: the claim is that
   these files are idempotent where they stand, which only the chain up to them can say. */
const AGAIN_UP_TO = '2027-03-12-boss-call.sql';
const reader = (db) => async () => JSON.stringify({ inv: await inventory(db),
  bodies: await q(db, `select p.proname, md5(p.prosrc) as m from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('hr_hunt_admit', 'hr_hunt_settle_session', 'hr_hunt_apply_member', 'hr_hunt_apply_instance',
    'hr_hunt_member_read', 'hr_hunt_view', 'hr_bestiary_of', 'hr_boss_call', 'hr_boss_call_view', 'hr_boss_call_quote', 'hr_boss_call_pays', 'hr_boss_call_plan', 'hr_boss_call_step', 'hr_boss_call_closed', 'hr_boss_call_felled') order by 1`),
  calls: await q(db, 'select * from public.hr_boss_calls order by call_id'), titles: await q(db, 'select * from public.hr_titles order by title_id'), hunts: await q(db, 'select * from public.hr_hunts order by hunt_id'),
  bounds: await q(db, 'select * from public.hr_hunt_kill_bounds order by monster_id'), base: await q(db, `select proname, identity_args, grantee, note from public.hr_client_rpc_baseline where proname like 'hr\\_boss%' order by 1, 2`) });
async function againOn(db, files) {
  const bad = [];
  const read = reader(db);
  const before = await read();
  for (const f of files) {
    try { await db.exec(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8')); } catch (e) { bad.push('BD-AGAIN ' + f + ' refused a second apply: ' + String(e.message).split('\n')[0].slice(0, 200)); return bad; }
  }
  if ((await read()) !== before) bad.push('BD-AGAIN a second apply of ' + files[files.length - 1] + ' moved something');
  return bad;
}
ARMS.again = async (boot) => {
  const { db } = await boot({ upTo: AGAIN_UP_TO });
  return againOn(db, ['2027-03-12-boss-call-hunts-catalogue.generated.sql', '2027-03-12-boss-call-hunt-sessions-catalogue.generated.sql', '2027-03-12-boss-call-titles-catalogue.generated.sql', '2027-03-12-boss-call.sql']);
};
/* ...and the series' three files, on the chain as of ITS last file. */
const SERIES_FILES = ['2027-05-01-v0135-items-catalogue.generated.sql', '2027-05-01-v0135-hunt-sessions-catalogue.generated.sql', '2027-04-24-boss-call-series.sql'];
/* OLDER files that restate a spliced body whole. Applied over the series each would erase that body's CALL-SERIES splices; its own pin must refuse,
   moving nothing: faction-standing's settle (five splices) and training-gear's member read (one; the series' anchor sits on its image). */
const OLDER_WHOLE = Object.freeze([
  ['2027-04-22-faction-standing.sql', /PIN: hr_hunt_settle_session/],
  ['2027-04-23-training-gear.sql', /PIN: public\.hr_hunt_member_read/],
]);
ARMS.again2 = async (boot) => {
  const { db } = await boot({ upTo: SERIES_FILES[2] });
  const bad = await againOn(db, SERIES_FILES);
  const read = reader(db), before = await read();
  for (const [file, pin] of OLDER_WHOLE) {
    let raised = null;
    try { await db.exec(readFileSync(join(ROOT, 'supabase/migrations', file), 'utf8')); } catch (e) { raised = String(e.message).split('\n')[0]; }
    if (!raised || !pin.test(raised)) bad.push('BD-AGAIN ' + file + ' applied over the series ' + (raised ? 'raised ' + raised.slice(0, 160) : 'was taken: the splices are gone'));
    if ((await read()) !== before) bad.push('BD-AGAIN ' + file + ' applied over the series moved a spliced body');
  }
  return bad;
};

/* The limit, as the settle owes it: a window past it with no end is refused, whatever the engine proposed. The limit is the FIGHT's. */
ARMS.owed = async (boot) => {
  const bad = [];
  const { db } = await boot();
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const uids = UIDS.slice(0, 2);
  const pid = await party(db, M, uids, { level: 60, names: 'Bosso' });
  await call(db, uids[0], 2, FEE);
  const anchorMs = Date.UTC(2026, 9, 25, 12, 0, 0);
  await backdate(db, pid, anchorMs);
  const exec = makeExec(db);
  /* Walk to a window with its end stripped from the proposal, past the fight's limit and the skew. */
  await db.query(`update public.hunt_sessions set entered_at = entered_at - make_interval(secs => ${BOSS_CALL_RULES.limitMs / 1000 + 120}), hunt_from = hunt_from - make_interval(secs => ${BOSS_CALL_RULES.limitMs / 1000 + 120}),
      fight_from = fight_from - make_interval(secs => ${BOSS_CALL_RULES.limitMs / 1000 + 120}) where instance_id = $1`, [pid]);
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
    const list = MUTANTS.filter((m) => !m.equivalent && (!pick || m.name.includes(pick)));
    /* ONE REPLAY AT A TIME (lane/fix135-boss-call-db). Every v0.2.135 release run was killed inside this loop ("The operation was canceled.", no
       timeout, during the same mutant, its 37th): each mutant booted a replay and none was ever closed, and an unclosed replay is never collected
       (tests/schema-replay.mjs closeReplays). So each mutant closes what it booted, and the loop holds the line in two ways: the registry must have
       seen the mutant's boot, and past the first WARM mutants the process may grow at most RSS_GROWTH_MB over the largest it was during them (an
       unclosed replay is ~300 MB; closed, the arms swing 0.7-1.6 GB on the dev machine, so the warm-up holds the heavy arm's size, not the light one's). */
    const RSS_GROWTH_MB = 1024, WARM = 5;
    const mb = (b) => Math.round(b / 1048576);
    let base = 0;
    for (const [i, m] of list.entries()) {
      const boot = async (o) => {
        const b = await bootReplay(o);
        const def = (await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r/g, '');
        if (!def.includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 70)));
        await b.db.exec(def.replace(m.find, () => m.repl));
        return b;
      };
      let got = [];
      try { got = await ARMS[m.arm](boot); } catch (e) { if (/HARNESS/.test(String(e.message))) throw e; got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      const booted = await closeReplays();
      const rss = process.memoryUsage().rss;
      if (i < WARM) base = Math.max(base, rss);
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every check held').slice(0, 150) + '  [rss ' + mb(rss) + ' MB]');
      if (!booted) { console.log('boss-call-db --mutate: HARNESS: closeReplays saw no replay for "' + m.name + '": the registry is not seeing the boots it must close'); process.exit(2); }
      if (i >= WARM && mb(rss - base) > RSS_GROWTH_MB) {
        console.log(`boss-call-db --mutate: RED: the process grew ${mb(rss - base)} MB past its first ${WARM} mutants (${mb(base)} -> ${mb(rss)} MB, the line is ${RSS_GROWTH_MB}): a replay is not being closed`);
        process.exit(1);
      }
    }
    console.log(escaped ? `boss-call-db --mutate: ${escaped} ESCAPED` : `boss-call-db --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const boot = (o) => bootReplay(o);
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const bad = [];
  for (const arm of Object.keys(ARMS)) if (!only || arm === only) { bad.push(...await ARMS[arm](boot)); await closeReplays(); }
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? 'boss-call-db: ' + bad.length + ' FAILED' : 'boss-call-db: green (the verb, the one door, the forged windows, one fight and a series through both doors, the prize)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
