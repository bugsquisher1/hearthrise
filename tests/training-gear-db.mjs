#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/training-gear-db.mjs — THE FIXED TRAINING RATE AND THE TRAINING ITEMS ON THE REPLAYED CHAIN WITH THE SHIPPED EDGE
// (supabase/migrations/2027-04-23-training-gear.sql and its two catalogues; Tyler 2026-11-14: one rate for every skill and Level, the
// item at 200%, a flat gold price, Crowns-bought goods bound; the engine's half is tests/combat-training.mjs and
// tools/balance-sim/yard-table.mjs).
//
//   node tests/training-gear-db.mjs            the guard
//   node tests/training-gear-db.mjs --mutate   every planted defect must turn it red
//
// mutant-anchors: supabase/migrations/2027-04-23-training-gear.sql
//
//   TG-VERB    the switch off refuses the three verbs; on: a forged price is quote_changed and charges nothing, a bound row is not for
//              sale, the buy charges the catalogue's price once on its key and lands one sealed item in the bag, the account's day stops
//              at buy_per_day, the open banks its hours once on its key and a second is still_open, Storage opens when the bag holds none,
//              none held is none_held; a hero under Level 10 can't start training and pays nothing
//   TG-DOORS   a yard session with 60 s of item time banked and one sealed bound sword in the bag, through the world tick (the browser
//              closed) and the player's settle (the hunt viewed), the same on both: four minutes pay EXACTLY 4,000 Melee XP (30,000 an hour
//              and the item's 30,000 more), no Level XP; the bank's 60 s run out and the sealed sword opens itself (one auto ledger row,
//              the bag empty), the books hold (banked = opened - spent, spent 240 s); no stamina written
//   TG-PLAIN   the same four minutes with no item: exactly 2,000, nothing banked, nothing opened
//   TG-FORGED  a window that claims item time the server doesn't hold is session_moved; XP past the time bound is value_over; a claim
//              past the window is training_pays; each refused whole, the clean window lands
//   TG-BOUND   the market refuses every bound row (not_tradeable, untradeable) and the vendor has no bid for one; a gold row lists, at most
//              at the Arms Master's own price
//   TG-AGAIN   the lane's three files applied a second time move nothing
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';
import { bootReplay, inventory } from './schema-replay.mjs';
import { setGold } from './_gold.mjs';

const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const { one, q, makeExec } = H;
const UIDS = Array.from({ length: 8 }, (_, i) => '00000000-0000-4000-8000-00007a1e9e' + String(i + 10));
const WINDOW = 60000;
const HOUR = 3600000;
const FILES = ['2027-04-23-training-gear-items-catalogue.generated.sql', '2027-04-23-training-gear-hunt-sessions-catalogue.generated.sql', '2027-04-23-training-gear.sql'];
const idem = () => crypto.randomUUID();
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const purse = async (db, uid) => Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [uid]));
const gold = (db, uid, n) => setGold((sql, p) => db.query(sql, p).then((r) => r.rows), uid, 0, n);
const bagQty = async (db, uid, item) => Number(await one(db, 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)', [uid, item]));
const books = async (db, uid, skill = 'melee') => (await q(db, 'select banked_ms, opened_ms, spent_ms, use_on from public.player_training_gear where user_id = $1 and slot = 0 and skill = $2', [uid, skill]))[0] || null;

async function as(db, uid, sql, params) {
  await db.query('begin');
  await asUser(db, uid);
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  try { const v = await one(db, sql, params); await db.query('commit'); return v; } catch (e) { await db.query('rollback'); throw e; }
}
const buy = (db, uid, item, price, key) => as(db, uid, 'select public.hr_training_gear_buy(0, $1, $2, $3::uuid)', [item, price, key || idem()]);
const open = (db, uid, item, key) => as(db, uid, 'select public.hr_training_gear_open(0, $1, $2::uuid)', [item, key || idem()]);
const flip = (db, uid, skill, on, key) => as(db, uid, 'select public.hr_training_gear_switch(0, $1, $2, $3::uuid)', [skill, on, key || idem()]);
const start = (db, uid, price, key, skill = 'melee', where = 'yard') => as(db, uid, 'select public.hr_training_start(0, $1, $2, $3, $4::uuid)', [skill, where, price, key || idem()]);
const feeOf = async (db, uid, skill = 'melee') => Number(await one(db, `select public.hr_training_fee(public.hr_skill_level($2, coalesce((select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = $2), 0)))`, [uid, skill]));
const switchOn = (db) => db.query("update public.hr_feature_switches set scope = 'everyone' where switch_id = 'training_gear'");

async function hero(db, M, uid, o = {}) {
  await db.query('begin');
  await H.character(db, M, uid, { level: o.level || 20, inv: o.inv || {}, gold: o.gold == null ? 3000000 : o.gold });
  await db.query('commit');
  await db.query("insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, 'weapon', 'iron_sword') on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id", [uid]);
}

async function boot(o) {
  const b = await bootReplay(o);
  await H.pinDice(b.db);
  await b.db.query('update public.hr_hunt_config set enabled = true where id');
  return { ...b, M: await H.loadEdge(H.ROOT) };
}

/* ── THE VERBS ────────────────────────────────────────────────────────────── */
async function verbArm(bootFn) {
  const bad = [];
  const { db, M } = await bootFn();
  const [a, b] = UIDS;
  await hero(db, M, a);
  let v = await buy(db, a, 'training_sword_12h', 250000);
  if (v.error !== 'feature_off') bad.push('TG-VERB the buy with the switch off answered ' + JSON.stringify(v));
  v = await open(db, a, 'training_sword_12h');
  if (v.error !== 'feature_off') bad.push('TG-VERB the open with the switch off answered ' + JSON.stringify(v));
  await switchOn(db);
  v = await buy(db, a, 'training_sword_12h', 249999);
  if (v.error !== 'quote_changed' || Number(v.price) !== 250000) bad.push('TG-VERB a forged price answered ' + JSON.stringify(v));
  v = await buy(db, a, 'training_sword_12h_bound', 250000);
  if (v.error !== 'not_for_sale') bad.push('TG-VERB a bound row for gold answered ' + JSON.stringify(v));
  v = await buy(db, a, 'iron_sword', 250000);
  if (v.error !== 'bad_item') bad.push('TG-VERB a sword that trains nothing answered ' + JSON.stringify(v));
  if (await purse(db, a) !== 3000000) bad.push('TG-VERB a refused buy moved the purse to ' + await purse(db, a));
  /* the buy, on its key */
  const key = idem();
  v = await buy(db, a, 'training_sword_12h', 250000, key);
  if (v.ok !== true || await purse(db, a) !== 2750000 || await bagQty(db, a, 'training_sword_12h') !== 1) bad.push('TG-VERB the buy answered ' + JSON.stringify(v).slice(0, 200) + ', purse ' + await purse(db, a));
  await buy(db, a, 'training_sword_12h', 250000, key);
  const rows = await q(db, `select kind, gold, meta->>'price' as price from public.player_ledger where user_id = $1 and intent like 'training\\_gear\\_buy:%'`, [a]);
  if (rows.length !== 1 || rows[0].kind !== 'shop' || Number(rows[0].gold) !== -250000 || await purse(db, a) !== 2750000) bad.push('TG-VERB a replayed buy charged again: ' + JSON.stringify(rows));
  /* the account's day: ten in all, the eleventh refused, nothing charged */
  for (let i = 0; i < 9; i++) await buy(db, a, 'training_bow_12h', 250000);
  v = await buy(db, a, 'training_bow_12h', 250000);
  if (v.error !== 'buy_limit' || Number(v.max) !== 10 || await purse(db, a) !== 3000000 - 10 * 250000) bad.push('TG-VERB the eleventh buy answered ' + JSON.stringify(v) + ', purse ' + await purse(db, a));
  /* the open, on its key; a second is still_open */
  const ok = idem();
  v = await open(db, a, 'training_sword_12h', ok);
  let g = await books(db, a);
  if (v.ok !== true || !g || Number(g.banked_ms) !== 12 * HOUR || Number(g.opened_ms) !== 12 * HOUR || await bagQty(db, a, 'training_sword_12h') !== 0) bad.push('TG-VERB the open answered ' + JSON.stringify(v).slice(0, 200) + ', books ' + JSON.stringify(g));
  await open(db, a, 'training_sword_12h', ok);
  g = await books(db, a);
  if (!g || Number(g.opened_ms) !== 12 * HOUR) bad.push('TG-VERB a replayed open banked twice: ' + JSON.stringify(g));
  await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'training_sword_24h_bound', 1)`, [a]);
  v = await open(db, a, 'training_sword_24h_bound');
  if (v.error !== 'still_open' || await bagQty(db, a, 'training_sword_24h_bound') !== 1) bad.push('TG-VERB a second open answered ' + JSON.stringify(v));
  v = await open(db, a, 'training_wand_24h');
  if (v.error !== 'none_held') bad.push('TG-VERB an item nobody holds answered ' + JSON.stringify(v));
  /* Storage: the bag holds no shield, the account's Storage does */
  await db.query(`insert into public.account_bank (user_id, item_id, qty, updated_at) values ($1, 'training_shield_12h_bound', 2, now())`, [a]);
  v = await open(db, a, 'training_shield_12h_bound');
  const sh = await books(db, a, 'defense');
  if (v.ok !== true || v.from !== 'storage' || !sh || Number(sh.banked_ms) !== 12 * HOUR
      || Number(await one(db, `select qty from public.account_bank where user_id = $1 and item_id = 'training_shield_12h_bound'`, [a])) !== 1) bad.push('TG-VERB a Storage open answered ' + JSON.stringify(v).slice(0, 200));
  /* the switch */
  v = await flip(db, a, 'melee', false);
  if (v.ok !== true || ((await books(db, a)) || {}).use_on !== false) bad.push('TG-VERB the switch answered ' + JSON.stringify(v).slice(0, 200));
  /* the Level gate: a Level 5 hero can't start, and pays nothing */
  await hero(db, M, b, { level: 5, gold: 100000 });
  v = await start(db, b, await feeOf(db, b));
  if (v.error !== 'low_level' || await purse(db, b) !== 100000 || Number(await one(db, 'select count(*) from public.hunt_sessions where user_id = $1', [b]))) bad.push('TG-VERB a Level 5 start answered ' + JSON.stringify(v));
  /* the section says it: the rate, the offers, the day */
  const sec = (await one(db, 'select public.hr_state_of($1::uuid, 0)', [a])).training;
  if (!sec || !sec.rate || sec.rate.xp_h !== 30000 || sec.rate.xp_h_item !== 60000 || sec.rate.min_level !== 10 || !Array.isArray(sec.offers) || sec.offers.length !== 8
      || !sec.shop || sec.shop.on !== true || sec.shop.today !== 10 || sec.shop.max !== 10 || !Array.isArray(sec.gear) || sec.gear.length !== 4) {
    bad.push('TG-VERB the section reads ' + JSON.stringify(sec && { rate: sec.rate, offers: (sec.offers || []).length, shop: sec.shop, gear: (sec.gear || []).length }).slice(0, 300));
  }
  return bad;
}

/* ── BOTH DOORS ───────────────────────────────────────────────────────────── */
const ts = (ms) => `to_timestamp(${ms / 1000})`;
async function moveClock(db, sid, huntFromMs, settledMs) {
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
  await db.query(`update public.hunt_sessions set entered_at = ${ts(huntFromMs)} - interval '1 minute', hunt_from = ${ts(huntFromMs)}, settled_to = ${ts(settledMs)}, next_swing_at = ${ts(settledMs)} where id = $1`, [sid]);
  await db.query(`update public.hunt_instances set settled_to = ${ts(settledMs)}, next_swing_at = ${ts(settledMs)} where id = $1`, [inst]);
}
async function settleTo(db, M, door, uid, sid, atMs) {
  const exec = makeExec(db);
  for (let guard = 0; guard < 40; guard++) {
    const s = (await q(db, 'select settled_to, ended_at from public.hunt_sessions where id = $1', [sid]))[0];
    if (s.ended_at || new Date(s.settled_to).getTime() >= atMs) return;
    if (door === 'fire') {
      await db.query('delete from public.hunt_tick_lease');
      const r = (await M.TK.runTick({ exec, atMs, body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: WINDOW, hunts: [{ user_id: uid, slot: 0, session_id: sid }] } })).body;
      if (!r.hunts || r.hunts.settled < 1) throw new Error('fire settled nothing: ' + JSON.stringify(r.hunts || r).slice(0, 300));
    } else {
      const v = await M.HS.settleHunt({ exec, user: uid, slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs, minWindowMs: 0 });
      if (v.outcome !== 'paid') throw new Error('viewed settled nothing: ' + JSON.stringify({ o: v.outcome, r: v.reason, d: v.body && v.body.detail }).slice(0, 400));
    }
  }
  throw new Error('harness: the session never reached ' + new Date(atMs).toISOString());
}

async function doorArm(bootFn, door, withItem) {
  const tag = withItem ? 'TG-DOORS ' + door : 'TG-PLAIN ' + door;
  const bad = [];
  const { db, M } = await bootFn();
  await db.query('update public.hr_tick_config set enabled = true where id');
  await switchOn(db);
  /* one hero a door and a case: the arms share one replayed database (main boots it once) */
  const uid = UIDS[(withItem ? 2 : 4) + (door === 'fire' ? 0 : 1)];
  await hero(db, M, uid);
  const A = Date.UTC(2026, 9, 25, 12, 0, 0);
  await db.query(`update public.player_state set stamina_ms = 0, stamina_at = ${ts(A - HOUR)} where user_id = $1 and slot = 0`, [uid]);
  await db.query(`update public.player_skills set xp_frac = 0 where user_id = $1 and slot = 0`, [uid]).catch(() => {});
  if (withItem) {
    /* one bought and opened, then (test-only) its bank drawn down to 60 s; one sealed bound sword in the bag */
    const v = await buy(db, uid, 'training_sword_12h', 250000);
    if (v.ok !== true) return [tag + ' the buy answered ' + JSON.stringify(v)];
    const o = await open(db, uid, 'training_sword_12h');
    if (o.ok !== true) return [tag + ' the open answered ' + JSON.stringify(o)];
    await db.query(`update public.player_training_gear set banked_ms = 60000, spent_ms = opened_ms - 60000 where user_id = $1 and slot = 0 and skill = 'melee'`, [uid]);
    await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'training_sword_12h_bound', 1)`, [uid]);
  }
  const fee = await feeOf(db, uid);
  const v = await start(db, uid, fee);
  if (v.ok !== true) return [tag + ' the start answered ' + JSON.stringify(v)];
  const sid = v.session_id;
  const xp0 = Number(await one(db, `select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = 'melee'`, [uid]));
  const lx0 = Number(await one(db, 'select level_xp from public.player_state where user_id = $1 and slot = 0', [uid]));
  /* the hour began ten minutes before the anchor: four minutes inside it */
  await moveClock(db, sid, A - 10 * 60000, A);
  try { await settleTo(db, M, door, uid, sid, A + 4 * 60000); } catch (e) { return [tag + ' ' + String(e.message).slice(0, 300)]; }
  const xp1 = Number(await one(db, `select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = 'melee'`, [uid]));
  const lx1 = Number(await one(db, 'select level_xp from public.player_state where user_id = $1 and slot = 0', [uid]));
  const want = withItem ? 4000 : 2000;
  if (xp1 - xp0 !== want || lx1 !== lx0) bad.push(`${tag} four minutes paid ${xp1 - xp0} Melee XP (want exactly ${want}) and ${lx1 - lx0} Level XP`);
  const g = await books(db, uid);
  const autos = await q(db, `select item_id, qty, meta from public.player_ledger where user_id = $1 and intent like 'training\\_gear\\_open:%' and (meta->>'auto')::boolean`, [uid]);
  if (withItem) {
    if (!g || Number(g.banked_ms) !== 12 * HOUR - 180000 || Number(g.spent_ms) !== 12 * HOUR - 60000 + 240000 || Number(g.banked_ms) !== Number(g.opened_ms) - Number(g.spent_ms)) bad.push(`${tag} the books read ${JSON.stringify(g)}`);
    if (autos.length !== 1 || autos[0].item_id !== 'training_sword_12h_bound' || Number(autos[0].qty) !== -1 || autos[0].meta.session !== sid || await bagQty(db, uid, 'training_sword_12h_bound') !== 0) bad.push(`${tag} the sealed sword's opening: ${JSON.stringify(autos)}`);
  } else if (g || autos.length) bad.push(`${tag} a hero with no item banked ${JSON.stringify(g)} or opened ${autos.length}`);
  const st = (await q(db, 'select stamina_ms, stamina_at from public.player_state where user_id = $1 and slot = 0', [uid]))[0];
  if (Number(st.stamina_ms) !== 0 || new Date(st.stamina_at).getTime() !== A - HOUR) bad.push(`${tag} the stamina row was written: ${JSON.stringify(st)}`);
  return { bad, end: { xp: xp1 - xp0, books: g, autos: autos.length } };
}

/* ── A FORGED WINDOW ──────────────────────────────────────────────────────── */
async function forgedArm(bootFn) {
  const bad = [];
  const { db, M } = await bootFn();
  await switchOn(db);
  const uid = UIDS[6];
  await hero(db, M, uid);
  /* a bank of item time the hero has switched off: a claim on it is refused by the server's budget alone (the spend could pay it) */
  const b0 = await buy(db, uid, 'training_sword_12h', 250000);
  const o0 = await open(db, uid, 'training_sword_12h');
  const f0 = await flip(db, uid, 'melee', false);
  if (b0.ok !== true || o0.ok !== true || f0.ok !== true) return ['TG-FORGED the bank answered ' + JSON.stringify([b0.error, o0.error, f0.error])];
  const v = await start(db, uid, await feeOf(db, uid));
  if (v.ok !== true) return ['TG-FORGED the start answered ' + JSON.stringify(v)];
  const A = Date.UTC(2026, 9, 25, 12, 0, 0);
  await moveClock(db, v.session_id, A - 10 * 60000, A);
  const exec = makeExec(db);
  const forge = [
    /* half the window claimed at the item's rate, and the XP that claim would pay (inside the time bound): only the bank refuses it */
    ['item time the hero switched off', (d) => { d.journal.meta.boost_ms = WINDOW / 2; d.xp = { melee: Math.floor((d.xp && d.xp.melee || 0) * 1.5) }; }, /"session_moved"/],
    ['XP past the time bound', (d) => { d.xp = { melee: (d.xp && d.xp.melee || 0) + 2 }; }, /"value_over".*"what": ?"training"/],
    ['a claim past the window', (d) => { d.journal.meta.boost_ms = 10 * WINDOW; }, /"training_pays"/],
    ['a claim of the wrong shape', (d) => { d.journal.meta.boost_ms = -5; }, /"training_pays"/],
  ];
  for (const [name, mut, want] of forge) {
    await db.query('update public.hunt_sessions set refusals = 0 where id = $1', [v.session_id]);
    await db.query('update public.hunt_instances set refusals = 0 where id = (select instance_id from public.hunt_sessions where id = $1)', [v.session_id]);
    const plan = await M.HS.readHuntSettle({ exec, user: uid, slot: 0, atMs: A + WINDOW }, 'tick');
    if (plan.answer) { bad.push('TG-FORGED ' + name + ': the read answered ' + plan.answer.reason); continue; }
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    for (const m of p.commit.members) mut(m.delta);
    const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    if (!res || res.ok === true || !want.test(JSON.stringify(res))) bad.push('TG-FORGED ' + name + ' answered ' + JSON.stringify(res).slice(0, 240));
  }
  const plan = await M.HS.readHuntSettle({ exec, user: uid, slot: 0, atMs: A + WINDOW }, 'tick');
  if (plan.answer) return [...bad, 'TG-FORGED the clean window answered ' + plan.answer.reason];
  const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
  const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
  if (!res || res.ok !== true) bad.push('TG-FORGED the clean window was refused: ' + JSON.stringify(res).slice(0, 200));
  const g = await books(db, uid);
  if (!g || Number(g.spent_ms) !== 0 || Number(g.banked_ms) !== 12 * HOUR) bad.push('TG-FORGED a switched-off bank was spent: ' + JSON.stringify(g));
  return bad;
}

/* ── BOUND NEVER TRADES ───────────────────────────────────────────────────── */
async function boundArm(bootFn) {
  const bad = [];
  const { db, M } = await bootFn();
  const uid = UIDS[7];
  await hero(db, M, uid, { level: 40, inv: { training_bow_12h_bound: 2, training_bow_12h: 2 } });
  await db.query('update public.hr_market_config set enabled = true');
  const list = async (item, ask) => {
    const ver = await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [uid]);
    /* as the player (the market's identity seam: a caller names only itself) */
    return as(db, uid, `select public.hr_market_list($1::uuid, 0, $2::bigint, $3::uuid, 'bag', $4, 1::bigint, $5::bigint)`, [uid, ver, idem(), item, ask]);
  };
  for (const item of ['training_bow_12h_bound', 'training_sword_24h_bound', 'training_wand_12h_bound', 'training_shield_24h_bound']) {
    if (item === 'training_bow_12h_bound') {
      const v = await list(item, 100000);
      if (v.ok === true || v.error !== 'not_tradeable' || !v.detail || v.detail.why !== 'untradeable') bad.push('TG-BOUND a bound row listed: ' + JSON.stringify(v).slice(0, 200));
    }
    const m = (await q(db, 'select listable, why from public.hr_market_items where item_id = $1', [item]))[0];
    if (!m || m.listable || m.why !== 'untradeable') bad.push('TG-BOUND the market\'s rule reads ' + item + ' as ' + JSON.stringify(m));
    if (Number(await one(db, 'select count(*) from public.hr_hunt_vendor_value where item_id = $1', [item]))) bad.push('TG-BOUND the shop bids for ' + item);
  }
  let v = await list('training_bow_12h', 250001);
  if (v.ok === true || v.error !== 'price_above_cap') bad.push('TG-BOUND a gold row listed over the Arms Master\'s price: ' + JSON.stringify(v).slice(0, 200));
  v = await list('training_bow_12h', 200000);
  if (v.ok !== true) bad.push('TG-BOUND a gold row would not list: ' + JSON.stringify(v).slice(0, 200));
  return bad;
}

/* ── A SECOND APPLY ───────────────────────────────────────────────────────── */
async function againArm(bootFn) {
  const bad = [];
  const { db } = await bootFn({ upTo: FILES[FILES.length - 1] });
  const read = async () => JSON.stringify({ inv: await inventory(db),
    bodies: await q(db, `select p.proname, md5(p.prosrc) as m from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'hr\\_training\\_%' or p.proname = 'hr_hunt_member_read') order by 1`),
    rules: await q(db, 'select * from public.hr_training_rules'), gear: await q(db, 'select * from public.hr_training_gear order by item_id'),
    items: await q(db, `select * from public.hr_items where kind = 'training' order by item_id`), sw: await q(db, `select switch_id, scope from public.hr_feature_switches where switch_id = 'training_gear'`),
    baseline: await q(db, `select proname, identity_args, grantee, note from public.hr_client_rpc_baseline where proname like 'hr\\_training\\_gear\\_%' order by 1`) });
  const before = await read();
  for (const f of FILES) {
    try { await db.exec(readFileSync(join(H.ROOT, 'supabase/migrations', f), 'utf8')); } catch (e) { bad.push('TG-AGAIN ' + f + ' refused a second apply: ' + String(e.message).split('\n')[0].slice(0, 200)); return bad; }
  }
  if ((await read()) !== before) bad.push('TG-AGAIN a second apply moved something');
  return bad;
}

/* The boot an arm gets: the first call boots, every later call answers the same database; a scoped boot (upTo) is always its own. */
function once(f) {
  let p = null;
  return (o) => (o && o.upTo ? f(o) : (p = p || f(o)));
}

const both = async (b, withItem) => {
  const fire = await doorArm(b, 'fire', withItem);
  const viewed = await doorArm(b, 'viewed', withItem);
  const bad = [...(fire.bad || fire), ...(viewed.bad || viewed)];
  if (fire.end && viewed.end && JSON.stringify(fire.end) !== JSON.stringify(viewed.end)) bad.push((withItem ? 'TG-DOORS' : 'TG-PLAIN') + ' the browser closed ended ' + JSON.stringify(fire.end) + ', the hunt viewed ' + JSON.stringify(viewed.end));
  return bad;
};
const ARMS = {
  again: (b) => againArm(b),
  verb: (b) => verbArm(b),
  doors: (b) => both(b, true),
  plain: (b) => both(b, false),
  forged: (b) => forgedArm(b),
  bound: (b) => boundArm(b),
};

const FN = { window: 'public.hr_training_window(uuid,integer,text,timestamp with time zone,timestamp with time zone,jsonb)',
  buy: 'public.hr_training_gear_buy(integer,text,bigint,uuid)', open: 'public.hr_training_gear_open(integer,text,uuid)',
  quote: 'public.hr_training_quote(uuid,integer,text,text)', budget: 'public.hr_training_gear_budget(uuid,integer,text)',
  read: 'public.hr_hunt_member_read(public.hunt_sessions)', take: 'public.hr_training_gear_take(uuid,integer,text,text,boolean,uuid)' };
const MUTANTS = [
  { name: 'the claim is never held to the server\'s item time', fn: FN.window, find: '  if v_claim > public.hr_training_gear_budget(p_user, p_slot, v_t.skill) then', repl: '  if false then', arm: 'forged', want: /TG-FORGED/ },
  { name: 'the time bound counts every ms as item time', fn: FN.window, find: '* (v_r.boost_pm - 1000) / 1000 * v_claim) / 3600000) + 1;', repl: '* (v_r.boost_pm - 1000) / 1000 * v_win) / 3600000) + 1;', arm: 'forged', want: /TG-FORGED/ },
  { name: 'the item time is never spent', fn: FN.window, find: 'set banked_ms = banked_ms - v_claim, spent_ms = spent_ms + v_claim,', repl: 'set banked_ms = banked_ms, spent_ms = spent_ms,', arm: 'doors', want: /TG-DOORS/ },
  { name: 'the next sealed item never opens itself', fn: FN.window, find: "else public.hr_training_gear_take(p_user, p_slot, v_item, 'bag', true, v_sid) end;", repl: 'else v_claim end;', arm: 'doors', want: /TG-DOORS/ },
  { name: 'the read gives no item time', fn: FN.read, find: "'train_boost_ms', (select public.hr_training_gear_budget(", repl: "'train_boost_ms', 0 * (select public.hr_training_gear_budget(", arm: 'doors', want: /TG-DOORS/ },
  { name: 'the buy charges the client\'s number', fn: FN.buy, find: "           'gold', -v_g.price,", repl: "           'gold', -least(v_g.price, 1),", arm: 'verb', want: /TG-VERB/ },
  { name: 'a stale price is taken', fn: FN.buy, find: '  if v_g.price <> p_price_seen then', repl: '  if false then', arm: 'verb', want: /TG-VERB/ },
  { name: 'the day never fills', fn: FN.buy, find: '  if v_today >= v_max then', repl: '  if false then', arm: 'verb', want: /TG-VERB/ },
  { name: 'the switch is never asked', fn: FN.buy, find: "  if not public.hr_feature_on('training_gear', v_uid) then", repl: '  if false then', arm: 'verb', want: /TG-VERB/ },
  { name: 'a second item opens over hours still banked', fn: FN.open, find: '  if v_bank > 0 then', repl: '  if false then', arm: 'verb', want: /TG-VERB/ },
  { name: 'an open takes nothing', fn: FN.take, find: "  if p_from = 'bag' then", repl: "  if false then", arm: 'verb', want: /TG-VERB/ },
  { name: 'a hero under Level 10 trains', fn: FN.quote, find: "v_why := case when v_level < v_r.min_level then 'low_level'", repl: "v_why := case when false then 'low_level'", arm: 'verb', want: /TG-VERB/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) {
      const bad = await ARMS.verb(() => boot());
      console.log('training-gear-db --mutate: control ran the clean tree: ' + (bad.length ? bad.join('; ') : 'green'));
      process.exit(0);
    }
    let escaped = 0;
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    for (const m of list) {
      const planted = async (o) => {
        const b = await boot(o);
        const def = (await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r/g, '');
        if (!def.includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 70)));
        await b.db.exec(def.replace(m.find, () => m.repl));
        return b;
      };
      let got = [];
      try { got = await ARMS[m.arm](once(planted)); } catch (e) { if (/HARNESS/.test(String(e.message))) throw e; got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every check held').slice(0, 150));
    }
    console.log(escaped ? `training-gear-db --mutate: ${escaped} ESCAPED` : `training-gear-db --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const bad = [];
  /* ONE replayed database for every arm (a replay is minutes): each arm's heroes are its own; TG-AGAIN boots its own, to the lane's last file */
  const shared = once((o) => boot(o));
  for (const arm of Object.keys(ARMS)) if (!only || arm === only) bad.push(...await ARMS[arm](shared));
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? 'training-gear-db: ' + bad.length + ' FAILED' : 'training-gear-db: green (the verbs, the Level gate, the exact rate and the item time through both doors, the next item opening itself, the forged windows, bound never listed, a second apply)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
