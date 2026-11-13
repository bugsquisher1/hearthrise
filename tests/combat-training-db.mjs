#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/combat-training-db.mjs — COMBAT TRAINING ON THE REPLAYED CHAIN WITH THE SHIPPED EDGE (supabase/migrations/2027-04-16-combat-training.sql;
// the engine's half is tests/combat-training.mjs).
//
//   node tests/combat-training-db.mjs            the guard
//   node tests/combat-training-db.mjs --mutate   every planted defect must turn it red
//
// mutant-anchors: supabase/migrations/2027-04-16-combat-training.sql
//
//   TD-VERB    the view quotes the catalogue's price; a forged price is quote_changed and charges nothing; the first hour is charged on the
//              server's number, one shop row on the caller's key, and a replay charges once; a hero in a party is refused; no other door
//              (enter, Hunt again, a move mid-hunt) opens a training ground
//   TD-DOORS   a yard session from an EMPTY stamina pool to its end, with the browser closed (the world tick) and with the hunt viewed (the
//              player's settle), the same on both: the next hour charged at its first instant (one training_fee row, the session stamped,
//              hours_limit 2), then a purse that can't pay the next ends it gold_out at that hour's first instant with nothing owed; the
//              trained skill's XP only, no Level XP, coin, loot or kill; the stamina row never written (the pool rested); no hunt left open
//   TD-FORGED  a training window that pays Level XP, coin, an item, another skill or a kill is refused whole by the settle, whatever the
//              engine proposed; the clean window lands
//   TD-AGAIN   the lane's four files applied a second time move nothing: the schema's inventory, every body they write, the catalogue rows
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
const UIDS = Array.from({ length: 8 }, (_, i) => '00000000-0000-4000-8000-0000007a1e' + String(i + 10));
const WINDOW = 60000;
const HOUR = 3600000;
const idem = () => crypto.randomUUID();
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const purse = async (db, uid) => Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [uid]));
const gold = (db, uid, n) => setGold((sql, p) => db.query(sql, p).then((r) => r.rows), uid, 0, n);

async function as(db, uid, sql, params) {
  await db.query('begin');
  await asUser(db, uid);
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  try { const v = await one(db, sql, params); await db.query('commit'); return v; } catch (e) { await db.query('rollback'); throw e; }
}
const start = (db, uid, price, key, skill = 'melee', where = 'yard') => as(db, uid, 'select public.hr_training_start(0, $1, $2, $3, $4::uuid)', [skill, where, price, key || idem()]);
const feeOf = async (db, uid, skill = 'melee') => Number(await one(db, `select public.hr_training_fee(public.hr_skill_level($2, coalesce((select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = $2), 0)))`, [uid, skill]));

async function hero(db, M, uid, o = {}) {
  await db.query('begin');
  await H.character(db, M, uid, { level: o.level || 20, inv: { cooked_shrimp: 200 }, gold: o.gold == null ? 100000 : o.gold });
  await db.query('commit');
  await db.query("insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, 'weapon', 'iron_sword') on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id", [uid]);
}

async function boot(o) {
  const b = await bootReplay(o);
  await H.pinDice(b.db);
  await b.db.query('update public.hr_hunt_config set enabled = true where id');
  return { ...b, M: await H.loadEdge(H.ROOT) };
}

/* ── THE VERB ─────────────────────────────────────────────────────────────── */
async function verbArm(bootFn) {
  const bad = [];
  const { db, M } = await bootFn();
  const [a, b] = UIDS;
  await hero(db, M, a);
  const fee = await feeOf(db, a);
  /* THE `training` SECTION, as the envelope carries it (src/session/training-sections.js reads it) */
  const sec = (await one(db, 'select public.hr_state_of($1::uuid, 0)', [a])).training;
  const melee = sec && Array.isArray(sec.quotes) ? sec.quotes.find((x) => x.skill === 'melee') : null;
  if (!sec || JSON.stringify(sec.skills) !== '["melee","ranged","magic","defense"]' || !melee || Number(melee.fee_h) !== fee || sec.run !== null || sec.last_stop !== null
      || !sec.dummy || sec.dummy.needs !== 'homestead' || sec.dummy.has_home !== false || Number(sec.dummy.next_price) !== 150000 || sec.dummy.ladder.length !== 4 || sec.dummy.busy !== null) {
    bad.push('TD-VERB the section reads ' + JSON.stringify(sec).slice(0, 400));
  }
  let v = await start(db, a, fee + 1);
  if (v.error !== 'quote_changed' || Number(v.fee) !== fee) bad.push('TD-VERB a stale price answered ' + JSON.stringify(v));
  v = await start(db, a, 1);
  if (v.error !== 'quote_changed') bad.push('TD-VERB a forged low price answered ' + JSON.stringify(v));
  if (await purse(db, a) !== 100000 || Number(await one(db, 'select count(*) from public.hunt_sessions where user_id = $1', [a]))) bad.push('TD-VERB a refused price moved something');
  /* no other door */
  v = await as(db, a, `select public.hr_hunt_enter(0, 'training_yard_melee', '[]'::jsonb, 0, null, $1::uuid)`, [idem()]);
  if (v.ok === true || !JSON.stringify(v).includes('training_only')) bad.push('TD-VERB an enter answered ' + JSON.stringify(v));
  v = await as(db, a, `select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, $1::uuid)`, [idem()]);
  if (v.ok !== true) bad.push('TD-VERB a normal ground refused: ' + JSON.stringify(v));
  v = await as(db, a, `select public.hr_hunt_change(0, 'training_yard_melee', $1::uuid)`, [idem()]);
  if (v.ok === true || !JSON.stringify(v).includes('training_only')) bad.push('TD-VERB a move mid-hunt answered ' + JSON.stringify(v));
  await db.query(`select public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = $1 and h.ended_at is null`, [a]);
  /* the charge, on the caller's key */
  const key = idem();
  v = await start(db, a, fee, key);
  if (v.ok !== true) bad.push('TD-VERB the start answered ' + JSON.stringify(v));
  if (await purse(db, a) !== 100000 - fee) bad.push('TD-VERB the purse reads ' + await purse(db, a) + ', want ' + (100000 - fee));
  const rows = await q(db, `select kind, intent, gold, meta->>'reason' as reason from public.player_ledger where user_id = $1 and intent like 'training\\_%'`, [a]);
  if (rows.length !== 1 || rows[0].kind !== 'shop' || rows[0].intent !== `training_start:training_yard_melee:${fee}` || Number(rows[0].gold) !== -fee || rows[0].reason !== 'training_fee') bad.push('TD-VERB the ledger reads ' + JSON.stringify(rows));
  await start(db, a, fee, key);
  if (await purse(db, a) !== 100000 - fee || Number(await one(db, `select count(*) from public.player_ledger where user_id = $1 and intent like 'training\\_%'`, [a])) !== 1) bad.push('TD-VERB a replay charged again');
  v = await start(db, a, fee);
  if (v.ok === true || await purse(db, a) !== 100000 - fee) bad.push('TD-VERB a hero already training started again: ' + JSON.stringify(v));
  /* Hunt again from a training ground */
  const ended = await one(db, `select id from public.hunt_sessions where user_id = $1 and ended_at is null`, [a]);
  await db.query(`select public.hr_hunt_close($1::uuid, 'left', now(), true)`, [ended]);
  v = await as(db, a, 'select public.hr_hunt_restart(0, $1::uuid, $2::uuid)', [ended, idem()]);
  if (v && v.ok === true) bad.push('TD-VERB Hunt again reopened the yard for free: ' + JSON.stringify(v).slice(0, 200));
  /* a party */
  await hero(db, M, b);
  await db.query('select public.hr_party_open($1::uuid, 0)', [b]);
  v = await start(db, b, await feeOf(db, b));
  if (v.error !== 'in_party' || await purse(db, b) !== 100000) bad.push('TD-VERB a hero in a party answered ' + JSON.stringify(v));
  return bad;
}

/* ── BOTH DOORS TO THE END ────────────────────────────────────────────────── */
const ts = (ms) => `to_timestamp(${ms / 1000})`;
async function moveClock(db, sid, huntFromMs, settledMs) {
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
  await db.query(`update public.hunt_sessions set entered_at = ${ts(huntFromMs)} - interval '1 minute', hunt_from = ${ts(huntFromMs)}${settledMs == null ? '' : `, settled_to = ${ts(settledMs)}, next_swing_at = ${ts(settledMs)}`} where id = $1`, [sid]);
  if (settledMs != null) await db.query(`update public.hunt_instances set settled_to = ${ts(settledMs)}, next_swing_at = ${ts(settledMs)} where id = $1`, [inst]);
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

async function doorArm(bootFn, door) {
  const bad = [];
  const { db, M } = await bootFn();
  await db.query('update public.hr_tick_config set enabled = true where id');
  const uid = UIDS[4];
  await hero(db, M, uid);
  const A = Date.UTC(2026, 9, 25, 12, 0, 0);
  /* AN EMPTY POOL, stamped an hour before the anchor: training opens on it and never writes it */
  await db.query(`update public.player_state set stamina_ms = 0, stamina_at = ${ts(A - HOUR)} where user_id = $1 and slot = 0`, [uid]);
  const fee = await feeOf(db, uid);
  const v = await start(db, uid, fee);
  if (v.ok !== true) return ['TD-DOORS ' + door + ' the start answered ' + JSON.stringify(v)];
  const sid = v.session_id;
  const xp0 = Number(await one(db, `select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = 'melee'`, [uid]));
  const lx0 = Number(await one(db, 'select level_xp from public.player_state where user_id = $1 and slot = 0', [uid]));
  /* hour 1 began 58 minutes before the anchor: the settle stops at its end (A + 2 min) and buys hour 2 there */
  await moveClock(db, sid, A - 58 * 60000, A);
  try { await settleTo(db, M, door, uid, sid, A + 4 * 60000); } catch (e) { return ['TD-DOORS ' + door + ' hour 2: ' + String(e.message).slice(0, 300)]; }
  const s1 = (await q(db, 'select hours_limit, ended_at from public.hunt_sessions where id = $1', [sid]))[0];
  const hr2 = await q(db, `select kind, gold, session_id, gold_kind, meta from public.player_ledger where user_id = $1 and intent = 'training_fee:training_yard_melee:2'`, [uid]);
  if (s1.ended_at || Number(s1.hours_limit) !== 2) bad.push(`TD-DOORS ${door} the second hour: hours ${s1.hours_limit}, ended ${s1.ended_at}`);
  if (hr2.length !== 1 || hr2[0].kind !== 'shop' || Number(hr2[0].gold) !== -fee || hr2[0].session_id !== null || hr2[0].meta.session !== sid || hr2[0].gold_kind !== 'shop'
      || hr2[0].meta.reason !== 'training_fee' || Number(hr2[0].meta.hour) !== 2) bad.push(`TD-DOORS ${door} the hourly row reads ${JSON.stringify(hr2)}`);
  if (await purse(db, uid) !== 100000 - 2 * fee) bad.push(`TD-DOORS ${door} the purse reads ${await purse(db, uid)}, want ${100000 - 2 * fee}`);
  /* the envelope's `training` section says the same: the run on the yard, both hours' gold */
  const mid = (await one(db, 'select public.hr_state_of($1::uuid, 0)', [uid])).training;
  if (!mid || !mid.run || mid.run.skill !== 'melee' || mid.run.where !== 'yard' || Number(mid.run.paid) !== 2 * fee || Number(mid.run.fee_h) !== fee) bad.push(`TD-DOORS ${door} the section mid-run reads ${JSON.stringify(mid && mid.run)}`);
  /* the session stands settled at A + 4 min; hour 2 now ends 2 minutes later; the purse can't pay hour 3: gold_out at that instant, nothing owed */
  await moveClock(db, sid, A + 6 * 60000 - 2 * HOUR, null);
  await gold(db, uid, fee - 1);
  try { await settleTo(db, M, door, uid, sid, A + 9 * 60000); } catch (e) { return [...bad, 'TD-DOORS ' + door + ' hour 3: ' + String(e.message).slice(0, 300)]; }
  const s2 = (await q(db, 'select end_reason, ended_at, hours_limit from public.hunt_sessions where id = $1', [sid]))[0];
  if (s2.end_reason !== 'gold_out' || new Date(s2.ended_at).getTime() !== A + 6 * 60000) bad.push(`TD-DOORS ${door} the end: ${JSON.stringify(s2)}, want gold_out at ${new Date(A + 6 * 60000).toISOString()}`);
  if (await purse(db, uid) !== fee - 1 || Number(await one(db, `select count(*) from public.player_ledger where user_id = $1 and intent like 'training\\_fee:%:3'`, [uid]))) bad.push(`TD-DOORS ${door} a purse that could not pay was charged`);
  /* the pay: the trained skill only */
  const xp1 = Number(await one(db, `select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = 'melee'`, [uid]));
  const lx1 = Number(await one(db, 'select level_xp from public.player_state where user_id = $1 and slot = 0', [uid]));
  const others = await q(db, `select t.xp, t.kills, t.coins, t.loot from public.hunt_session_tally t where t.session_id = $1`, [sid]);
  if (!(xp1 > xp0) || lx1 !== lx0) bad.push(`TD-DOORS ${door} melee ${xp0} -> ${xp1}, Level XP ${lx0} -> ${lx1}`);
  const t = others[0] || {};
  if (Number(t.kills) || Number(t.coins) || (t.loot && Object.keys(t.loot).length) || Object.keys(t.xp || {}).some((k) => k !== 'melee')) bad.push(`TD-DOORS ${door} the tally reads ${JSON.stringify(t)}`);
  /* no stamina written: the stamp is the one set before the start, and the pool rested since */
  const st = (await q(db, 'select stamina_ms, stamina_at from public.player_state where user_id = $1 and slot = 0', [uid]))[0];
  if (Number(st.stamina_ms) !== 0 || new Date(st.stamina_at).getTime() !== A - HOUR) bad.push(`TD-DOORS ${door} the stamina row was written: ${JSON.stringify(st)}`);
  if (Number(await one(db, 'select count(*) from public.hunt_sessions where user_id = $1 and ended_at is null', [uid]))) bad.push(`TD-DOORS ${door} a hunt is left open`);
  const after = (await one(db, 'select public.hr_state_of($1::uuid, 0)', [uid])).training;
  if (!after || after.run !== null || !after.last_stop || after.last_stop.reason !== 'gold_out' || after.last_stop.skill !== 'melee') bad.push(`TD-DOORS ${door} the section after the end reads ${JSON.stringify(after && { run: after.run, last: after.last_stop })}`);
  return { bad, end: { reason: s2.end_reason, at: new Date(s2.ended_at).getTime() - A, melee: xp1 - xp0, purse: await purse(db, uid) } };
}

/* ── A FORGED WINDOW ──────────────────────────────────────────────────────── */
async function forgedArm(bootFn) {
  const bad = [];
  const { db, M } = await bootFn();
  const uid = UIDS[6];
  await hero(db, M, uid);
  const v = await start(db, uid, await feeOf(db, uid));
  if (v.ok !== true) return ['TD-FORGED the start answered ' + JSON.stringify(v)];
  const A = Date.UTC(2026, 9, 25, 12, 0, 0);
  await moveClock(db, v.session_id, A - 10 * 60000, A);
  const exec = makeExec(db);
  /* each refused by the training window's OWN check (hr_training_window), named: a later layer (the general value bound) refusing it too
     is defence in depth, never the proof that this one holds */
  const PAYS = /"training_pays"/, OVER = /"value_over".*"what": ?"training"/;
  const forge = [
    ['Level XP', (d) => { d.level_xp = 5; }, PAYS], ['coin', (d) => { d.gold = 10; }, PAYS], ['an item', (d) => { d.items = { bones: 1 }; }, PAYS],
    ['another skill', (d) => { d.xp = { ...(d.xp || {}), defense: 3 }; }, PAYS], ['a kill', (d) => { d.journal.meta.kills = 1; }, PAYS],
    ['a Hearthfind', (d) => { d.hearthfind = { id: 'x' }; }, PAYS], ['a mountain of the skill', (d) => { d.xp = { melee: 100000000 }; }, OVER],
  ];
  for (const [name, mut, want] of forge) {
    /* each forge is its own first refusal: the sixth in a row would forfeit the hunt (hr_hunt_settle_refused), which is not this arm's subject */
    await db.query('update public.hunt_sessions set refusals = 0 where id = $1', [v.session_id]);
    await db.query('update public.hunt_instances set refusals = 0 where id = (select instance_id from public.hunt_sessions where id = $1)', [v.session_id]);
    const plan = await M.HS.readHuntSettle({ exec, user: uid, slot: 0, atMs: A + WINDOW }, 'tick');
    if (plan.answer) { bad.push('TD-FORGED ' + name + ': the read answered ' + plan.answer.reason); continue; }
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    for (const m of p.commit.members) mut(m.delta);
    const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    if (!res || res.ok === true || !want.test(JSON.stringify(res))) bad.push('TD-FORGED ' + name + ' answered ' + JSON.stringify(res).slice(0, 240));
  }
  const plan = await M.HS.readHuntSettle({ exec, user: uid, slot: 0, atMs: A + WINDOW }, 'tick');
  if (plan.answer) return [...bad, 'TD-FORGED the clean window answered ' + plan.answer.reason];
  const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
  const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
  if (!res || res.ok !== true) bad.push('TD-FORGED the clean window was refused: ' + JSON.stringify(res).slice(0, 200));
  return bad;
}

/* ── A SECOND APPLY ───────────────────────────────────────────────────────── */
const FILES = ['2027-04-16-combat-training-hunts-catalogue.generated.sql', '2027-04-16-combat-training-hunt-sessions-catalogue.generated.sql',
  '2027-04-16-combat-training-gold-sinks-catalogue.generated.sql', '2027-04-16-combat-training.sql'];
async function againArm(bootFn) {
  const bad = [];
  const { db } = await bootFn();
  const read = async () => JSON.stringify({ inv: await inventory(db),
    bodies: await q(db, `select p.proname, md5(p.prosrc) as m from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'hr\\_training\\_%' or p.proname in ('hr_hunt_admit', 'hr_hunt_enter_check', 'hr_hunt_apply_member', 'hr_house_dummy_unlock')) order by 1`),
    rules: await q(db, 'select * from public.hr_training_rules'), grounds: await q(db, 'select * from public.hr_training_grounds order by hunt_id'),
    sinks: await q(db, 'select * from public.hr_sink_rules order by sink_id'), hunts: await q(db, 'select * from public.hr_hunts order by hunt_id'),
    baseline: await q(db, `select proname, identity_args, grantee, note from public.hr_client_rpc_baseline where proname in ('hr_training_start', 'hr_house_dummy_unlock') order by 1`) });
  const before = await read();
  for (const f of FILES) {
    try { await db.exec(readFileSync(join(H.ROOT, 'supabase/migrations', f), 'utf8')); } catch (e) { bad.push('TD-AGAIN ' + f + ' refused a second apply: ' + String(e.message).split('\n')[0].slice(0, 200)); return bad; }
  }
  if ((await read()) !== before) bad.push('TD-AGAIN a second apply moved something');
  return bad;
}

const ARMS = {
  again: (b) => againArm(b),
  verb: (b) => verbArm(b),
  doors: async (b) => {
    const fire = await doorArm(b, 'fire');
    const viewed = await doorArm(b, 'viewed');
    const bad = [...(fire.bad || fire), ...(viewed.bad || viewed)];
    if (fire.end && viewed.end && JSON.stringify(fire.end) !== JSON.stringify(viewed.end)) bad.push('TD-DOORS the browser closed ended ' + JSON.stringify(fire.end) + ', the hunt viewed ' + JSON.stringify(viewed.end));
    return bad;
  },
  forged: (b) => forgedArm(b),
};

const FN = { hour: 'public.hr_training_hour(uuid,integer,uuid,timestamp with time zone,bigint,bigint,jsonb)', window: 'public.hr_training_window(uuid,integer,text,timestamp with time zone,timestamp with time zone,jsonb)',
  start: 'public.hr_training_start(integer,text,text,bigint,uuid)', member: 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
  admit: 'public.hr_hunt_admit(uuid,integer,text)', quote: 'public.hr_training_quote(uuid,integer,text,text)',
  section: 'public.hr_training_section(uuid,integer)' };
const MUTANTS = [
  { name: 'the next hour is never bought', fn: FN.hour, find: 'if v_s.hours_limit >= v_max or p_to is distinct from', repl: 'if true or p_to is distinct from', arm: 'doors', want: /TD-DOORS/ },
  { name: 'a short purse trains on', fn: FN.hour, find: "    perform public.hr_hunt_close(p_session, 'gold_out', p_to, true);\n", repl: '', arm: 'doors', want: /TD-DOORS/ },
  { name: 'the hour is charged to nobody', fn: FN.hour, find: 'v_g := public.hr_purse_move(p_user, -v_fee, 0);', repl: 'v_g := public.hr_purse_of(p_user);', arm: 'doors', want: /TD-DOORS/ },
  { name: 'a training window stamps the pool', fn: FN.member, find: '  if not v_train then\n    if v_e <> greatest(0, v_s0 - v_paid) then', repl: '  if true then\n    if v_e <> greatest(0, v_s0 - v_paid) then', arm: 'doors', want: /TD-DOORS/ },
  { name: 'the window check is never asked', fn: FN.member, find: '  if v_train then perform public.hr_training_window(', repl: '  if false then perform public.hr_training_window(', arm: 'forged', want: /TD-FORGED/ },
  { name: 'the window check lets Level XP through', fn: FN.window, find: "k not in ('accrued_to', 'hp', 'journal', 'xp', 'xp_frac', 'progress')", repl: "k not in ('accrued_to', 'hp', 'journal', 'xp', 'xp_frac', 'progress', 'level_xp')", arm: 'forged', want: /TD-FORGED/ },
  { name: 'the window check pays any skill', fn: FN.window, find: 'where e.key <> v_t.skill or jsonb_typeof', repl: 'where jsonb_typeof', arm: 'forged', want: /TD-FORGED/ },
  { name: 'the start charges the client\'s number', fn: FN.start, find: "(case when v_price > 0 then jsonb_build_object('gold', -v_price) else '{}'::jsonb end)", repl: "(case when v_price > 0 then jsonb_build_object('gold', -least(v_price, 1)) else '{}'::jsonb end)", arm: 'verb', want: /TD-VERB/ },
  { name: 'a stale price is taken', fn: FN.start, find: '  if v_price <> p_fee_seen then', repl: '  if false then', arm: 'verb', want: /TD-VERB/ },
  { name: 'every door opens the yard', fn: FN.admit, find: "    if current_setting('hr.training', true) is distinct from p_hunt then", repl: '    if false then', arm: 'verb', want: /TD-VERB/ },
  { name: 'a second apply moves a body', fn: FN.quote, find: 'declare v_t public.hr_training_grounds%rowtype; v_r public.hr_training_rules%rowtype;', repl: 'declare /* moved by a probe */ v_t public.hr_training_grounds%rowtype; v_r public.hr_training_rules%rowtype;', arm: 'again', want: /TD-AGAIN/ },
  { name: 'the section counts only the first hour', fn: FN.section, find: "and l.intent like 'training\\_%' and l.meta->>'session' = v_s.id::text", repl: "and l.intent like 'training\\_start%' and l.meta->>'session' = v_s.id::text", arm: 'doors', want: /TD-DOORS .* section mid-run/ },
  { name: 'the section forgets the last stop', fn: FN.section, find: "   where h.user_id = p_user and h.slot = p_slot and h.ended_at is not null\n", repl: "   where false\n", arm: 'doors', want: /TD-DOORS .* section after the end/ },
  { name: 'a party may train', fn: FN.quote, find: "v_why := case when public.hr_hunt_party_of(p_user, p_slot) is not null then 'in_party'", repl: "v_why := case when false then 'in_party'", arm: 'verb', want: /TD-VERB/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) {
      const bad = await ARMS.verb(() => boot());
      console.log('combat-training-db --mutate: control ran the clean tree: ' + (bad.length ? bad.join('; ') : 'green'));
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
      try { got = await ARMS[m.arm](planted); } catch (e) { if (/HARNESS/.test(String(e.message))) throw e; got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every check held').slice(0, 150));
    }
    console.log(escaped ? `combat-training-db --mutate: ${escaped} ESCAPED` : `combat-training-db --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const bad = [];
  for (const arm of Object.keys(ARMS)) if (!only || arm === only) bad.push(...await ARMS[arm]((o) => boot(o)));
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? 'combat-training-db: ' + bad.length + ' FAILED' : 'combat-training-db: green (the verb, the one door, the hourly charge and gold_out through both doors, the forged windows)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
