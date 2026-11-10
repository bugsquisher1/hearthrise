#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/level-xp-ceiling.mjs — RANKED LEVEL XP HAS A CEILING BY THE CLOCK, ON THE REAL SETTLE, BOTH PATHS.
//
//   node tests/level-xp-ceiling.mjs            the guard
//   node tests/level-xp-ceiling.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: none — the DB mutants are anchored edits of the LIVE bodies (pg_get_functiondef), checked when planted
//
// supabase/migrations/2027-04-02-level-xp-ceiling*.sql (DISCOVERIES 2026-11-10 row 4): one settle's Level XP was
// bounded by its kills only; an hour and a day had no ceiling. The migration proves the rule's arithmetic on a
// probe (its §3). This drives the REAL settle (supabase/functions/hr-accrue hunt-settle.js, as hr_engine, on the
// replayed chain, the real Mill Cellar, a Level 20 hero), the way the game does, on both paths:
//   LX-CAT      the server's one row is what tools/gen-level-xp-ceiling.mjs derives from the sheet, factor for factor
//   LX-CLOSED   BROWSER CLOSED (the tick's one-minute slices): at the real ceiling every honest settle lands and Level XP
//               is earned; under an hour's ceiling of 1 the first settle that pays any is refused value_over
//               (level_xp_hour): nothing is forged, and no Level XP past the ceiling is credited or journalled
//   LX-VIEWED   HUNT VIEWED (the player door's 16 s settles): the same, on the settles a watched hunt makes (path parity itself
//               is tests/hunt-sessions-settle.mjs's)
//   LX-DAY      both paths: with a day's ceiling a few settles deep, the settles land until the day's journalled Level
//               XP would pass it, then the next is refused value_over (level_xp_day); what landed is at or under it
//   LX-OWN-DAY  only this hero's own UTC day counts: yesterday's Level XP and another hero's of the account are not
//               in the sum (an honest settle lands beside them)
//   LX-SMALL    a hero whose WHOLE Level XP is at or under the day's ceiling is never refused by the day
//   LX-MISSING  no ceiling row: a Level-XP-paying settle is refused catalogue_missing (it never passes unread)
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
const { one, inTx, UIDS } = H;
const UID = UIDS[0];
const MIN = 60000;
const ARMS = ['LX-CAT', 'LX-CLOSED', 'LX-VIEWED', 'LX-DAY', 'LX-OWN-DAY', 'LX-SMALL', 'LX-MISSING'];
const HERO = { level: 20, inv: { cooked_shrimp: 60 }, bag: [{ item: 'cooked_shrimp', qty: 50 }], gold: 1000000, realGround: true, minutesAgo: 12 };
const SPAN = 8 * MIN;
const PATHS = { closed: H.ticksOf(MIN, SPAN), viewed: H.ticksOf(16000, SPAN) };

const levelXp = async (db) => Number(await one(db, 'select level_xp::text from public.player_state where user_id = $1 and slot = 0', [UID]));
const dayLx = async (db) => Number(await one(db, `select coalesce(sum((meta->'delta'->>'lx')::numeric), 0)::text from public.player_ledger
  where user_id = $1 and slot = 0 and jsonb_typeof(meta->'delta'->'lx') = 'number' and at >= public.hr_utc_day_start(now())`, [UID]));
const ceilingRow = (db) => one(db, 'select to_jsonb(c) from public.hr_level_xp_ceiling c where c.id');
const setCeiling = (db, hour, day) => db.query('update public.hr_level_xp_ceiling set hour_max = $1, day_max = $2 where id', [hour, day]);

/* Settle the cuts one by one, raw: each landed settle's Level XP, and the first refusal (the run stops there). */
async function walk(db, M, from, cuts) {
  const landed = []; let refusal = null;
  for (const t of cuts(from)) {
    const before = await levelXp(db);
    const r = await H.settleTo(db, M, t, { raw: true });
    if (r.skipped) { if (r.skipped === 'no_hunt') break; continue; }
    if (r.res && r.res.ok === true) { landed.push((await levelXp(db)) - before); continue; }
    refusal = { res: r.res, text: JSON.stringify(r.res), before, after: await levelXp(db) };
    break;
  }
  return { landed, earned: landed.reduce((a, b) => a + b, 0), refusal };
}

const ARM = {
  'LX-CAT': async (db) => {
    const bad = [];
    const G = await import(pathToFileURL(join(ROOT, 'tools', 'gen-level-xp-ceiling.mjs')).href);
    const want = G.ceiling(await G.inputs(ROOT));
    const row = await ceilingRow(db);
    const got = row && { level: row.top_level, contract: Number(row.contract), bandPm: row.band_pm, partyPm: row.party_pm, tierPm: row.tier_pm, eventPm: row.event_pm,
      safetyPm: row.safety_pm, measured: Number(row.measured), hour: Number(row.hour_max), day: Number(row.day_max) };
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push('the server holds ' + JSON.stringify(got) + ', the sheet derives ' + JSON.stringify(want));
    const g = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen-level-xp-ceiling.mjs'), '--check'], { encoding: 'utf8' });
    if (g.status !== 0) bad.push(String(g.stderr || g.stdout || '').trim().split('\n')[0]);
    return bad;
  },
  /* One path: honest at the real ceiling, then the same hunt under a ceiling smaller than one settle's XP. */
  ...Object.fromEntries(Object.entries({ 'LX-CLOSED': 'closed', 'LX-VIEWED': 'viewed' }).map(([arm, path]) => [arm, async (db, M, memo) => inTx(db, async () => {
    const bad = [];
    const h = await H.hunter(db, M, HERO);
    await db.query('savepoint lx_path');
    const honest = await walk(db, M, h.from, PATHS[path]);
    if (honest.refusal) bad.push('at the real ceiling an honest settle was refused: ' + honest.refusal.text.slice(0, 220));
    if (!(honest.earned > 0)) bad.push('CONTROL: the honest hunt earned no Level XP (' + honest.earned + '): the arm proves nothing');
    await db.query('rollback to savepoint lx_path');
    /* THE SAME HUNT under an hour's ceiling of 1 Level XP: its first settle that pays any is over it. No value is forged:
       the engine's own honest window is what the ceiling refuses. */
    await setCeiling(db, 1, 1000000000000);
    const x0 = await levelXp(db), l0 = await dayLx(db);
    const w = await walk(db, M, h.from, PATHS[path]);
    if (!w.refusal) bad.push('under an hour\'s ceiling of 1 the hunt\'s settles landed (' + w.earned + ' Level XP)');
    else if (!/"error":"value_over"/.test(w.refusal.text) || !/level_xp_hour/.test(w.refusal.text)) bad.push('over the hour\'s ceiling the settle answered ' + w.refusal.text.slice(0, 220));
    if (w.earned > 1 || (await levelXp(db)) - x0 > 1 || (await dayLx(db)) - l0 > 1) bad.push('Level XP past the ceiling was credited: ' + ((await levelXp(db)) - x0));
    if (!(await one(db, 'select (ended_at is null)::text from public.hunt_sessions where id = $1', [h.sid]))) bad.push('CONTROL: the session is gone');
    return bad;
  })])),
  'LX-DAY': async (db, M) => {
    const bad = [];
    for (const path of ['closed', 'viewed']) {
      await inTx(db, async () => {
        const h = await H.hunter(db, M, HERO);
        await db.query('savepoint lx_day');
        const honest = await walk(db, M, h.from, PATHS[path]);
        await db.query('rollback to savepoint lx_day');
        const paid = honest.landed.filter((x) => x > 0);
        if (honest.refusal || paid.length < 3) { bad.push(path + ': CONTROL: the honest hunt has ' + paid.length + ' Level-XP-paying settles'); return; }
        /* the day's ceiling sits halfway through this hunt's own Level XP; the hour's is the same number, over every settle of it */
        const day = Math.floor(honest.earned / 2);
        if (Math.max(...paid) > day) { bad.push(path + ': CONTROL: one settle paid ' + Math.max(...paid) + ' of the hunt\'s ' + honest.earned + ' Level XP'); return; }
        await setCeiling(db, day, day);
        const l0 = await dayLx(db);
        const w = await walk(db, M, h.from, PATHS[path]);
        const journalled = (await dayLx(db)) - l0;
        if (!w.refusal) bad.push(path + ': a hunt earning ' + honest.earned + ' Level XP ran whole under a day\'s ceiling of ' + day);
        else if (!/"error":"value_over"/.test(w.refusal.text) || !/level_xp_day/.test(w.refusal.text)) bad.push(path + ': past the day the settle answered ' + w.refusal.text.slice(0, 220));
        else if (w.refusal.after !== w.refusal.before) bad.push(path + ': the refused settle moved Level XP');
        if (!(w.earned > 0)) bad.push(path + ': no Level XP landed before the day\'s ceiling (the first paying settle was refused)');
        if (journalled > day || journalled !== w.earned) bad.push(path + ': ' + journalled + ' Level XP is journalled today for ' + w.earned + ' landed, under a ceiling of ' + day);
      });
    }
    return bad;
  },
  'LX-OWN-DAY': async (db, M) => inTx(db, async () => {
    const bad = [];
    /* yesterday's Level XP on this hero, and today's on another hero of the account, journalled before the hunt opens: far
       past any ceiling below, and neither is this hero's day */
    const h = await H.hunter(db, M, { ...HERO, beforeEnter: () => db.query(`insert into public.player_ledger (user_id, slot, kind, intent, meta, at) values
      ($1, 0, 'admin', 'lx probe', jsonb_build_object('delta', jsonb_build_object('lx', 900000000)), public.hr_utc_day_start(now()) - interval '1 second'),
      ($1, 1, 'admin', 'lx probe', jsonb_build_object('delta', jsonb_build_object('lx', 900000000)), now())`, [UID]) });
    await db.query('savepoint lx_own');
    const honest = await walk(db, M, h.from, PATHS.closed);
    await db.query('rollback to savepoint lx_own');
    if (honest.refusal || !(honest.earned > 0)) { bad.push('CONTROL: the honest hunt earned ' + honest.earned + ' Level XP'); return bad; }
    await setCeiling(db, honest.earned + 5, honest.earned + 5);
    const w = await walk(db, M, h.from, PATHS.closed);
    if (w.refusal) bad.push('an honest day was refused beside yesterday\'s and another hero\'s Level XP: ' + w.refusal.text.slice(0, 220));
    if (w.earned !== honest.earned) bad.push('the hunt earned ' + w.earned + ' Level XP, ' + honest.earned + ' at the real ceiling');
    return bad;
  }),
  'LX-SMALL': async (db, M) => inTx(db, async () => {
    const bad = [];
    /* A Level 1 hero whose ledger already journals far more than a day's ceiling TODAY (XP it no longer holds): its whole
       Level XP stays at or under the ceiling, so the day is not what refuses it. */
    const h = await H.hunter(db, M, { ...HERO, level: undefined, beforeEnter: () => db.query(`insert into public.player_ledger (user_id, slot, kind, intent, meta, at) values
      ($1, 0, 'admin', 'lx probe', jsonb_build_object('delta', jsonb_build_object('lx', 900000000)), now())`, [UID]) });
    await setCeiling(db, 100000, 100000);
    const w = await walk(db, M, h.from, H.ticksOf(MIN, 3 * MIN));
    const total = await levelXp(db);
    if (!w.refusal && (total > 100000 || !(w.earned > 0))) { bad.push('CONTROL: the fresh hero earned ' + w.earned + ' and holds ' + total + ' Level XP; the arm wants some, under the 100,000 ceiling'); return bad; }
    if (w.refusal) bad.push('a hero holding ' + total + ' Level XP in all was refused: ' + w.refusal.text.slice(0, 220));
    return bad;
  }),
  'LX-MISSING': async (db, M) => inTx(db, async () => {
    const bad = [];
    const h = await H.hunter(db, M, HERO);
    await db.query('delete from public.hr_level_xp_ceiling');
    const x0 = await levelXp(db);
    const w = await walk(db, M, h.from, PATHS.closed);
    if (!w.refusal) bad.push('with no ceiling row the hunt\'s settles landed (' + w.earned + ' Level XP credited unread)');
    else if (!/catalogue_missing/.test(w.refusal.text)) bad.push('with no ceiling row the settle answered ' + w.refusal.text.slice(0, 220));
    if (w.earned !== 0 || (await levelXp(db)) !== x0) bad.push('Level XP was credited with no ceiling row: ' + w.earned);
    return bad;
  }),
};

export async function runArms(db, M, only) {
  const out = {}; const memo = {};
  for (const name of ARMS) {
    if (only && !only.includes(name)) continue;
    try { out[name] = await ARM[name](db, M, memo); } catch (e) { out[name] = ['threw: ' + String(e && e.message || e).slice(0, 400)]; }
  }
  return out;
}

/* DB mutants: one anchored edit of a live body (it must occur exactly once), the arm that must go red. */
const SIG = { member: 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', over: 'public.hr_level_xp_over(uuid,integer,numeric,bigint,bigint)' };
export const DB_MUTANTS = [
  { arm: 'LX-CLOSED', name: 'the settle never refuses on the ceiling\'s answer', fn: SIG.member, find: 'if v_lxo is not null then perform public.hr_reject(', replace: 'if false then perform public.hr_reject(' },
  { arm: 'LX-VIEWED', name: 'the settle never asks the ceiling', fn: SIG.member,
    find: "then public.hr_level_xp_over(p_user, p_slot, (p_delta->>'level_xp')::numeric, v_win, v_lx0) end;", replace: 'then null::jsonb end;' },
  { arm: 'LX-CLOSED', name: 'a call is held to the day\'s ceiling, not its hour\'s', fn: SIG.over, find: 'v_call := ceil(v_hour::numeric * greatest(', replace: 'v_call := ceil(v_day::numeric * greatest(' },
  { arm: 'LX-DAY', name: 'the day is never read', fn: SIG.over, find: 'if coalesce(p_before, 0) + p_level_xp > v_day then', replace: 'if false then' },
  { arm: 'LX-DAY', name: 'the day lets one more settle through (>= read as >, twice over)', fn: SIG.over, find: 'if v_today > v_day then', replace: 'if v_today > v_day * 2 then' },
  { arm: 'LX-OWN-DAY', name: 'the day counts yesterday', fn: SIG.over, find: 'and l.at >= public.hr_utc_day_start(now()) and l.at < ', replace: 'and l.at < ' },
  { arm: 'LX-OWN-DAY', name: 'the day counts every hero of the account', fn: SIG.over, find: 'where l.user_id = p_user and l.slot = p_slot and jsonb_typeof(', replace: 'where l.user_id = p_user and jsonb_typeof(' },
  { arm: 'LX-SMALL', name: 'every hero is read against the day, whatever it holds', fn: SIG.over, find: 'if coalesce(p_before, 0) + p_level_xp > v_day then', replace: 'if true then' },
  { arm: 'LX-MISSING', name: 'a missing ceiling passes', fn: SIG.over,
    find: "return jsonb_build_object('error', 'catalogue_missing', 'limit', 'level_xp_ceiling'); end if;", replace: 'return null; end if;' },
  { arm: 'LX-CAT', name: 'the server\'s row is not the sheet\'s (an hour halved by hand)', sql: 'update public.hr_level_xp_ceiling set hour_max = hour_max / 2 where id',
    undo: 'update public.hr_level_xp_ceiling set hour_max = hour_max * 2 where id' },
];

export async function mutate(db, M, pick) {
  let bad = 0;
  const need = (m, res) => {
    const p = (res[m.arm] || [])[0];
    if (!p) { console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name); return 1; }
    if (/^threw|CONTROL/.test(p)) { console.error('✗ harness: ' + m.arm + ' did not judge: ' + m.name + ' (' + p.slice(0, 200) + ')'); return 1; }
    console.log('✓ ' + m.arm + ' goes red on: ' + m.name + '  (' + p.slice(0, 120) + ')'); return 0;
  };
  for (const m of DB_MUTANTS.filter((x) => !pick || x.name.includes(pick))) {
    if (m.sql) {
      await db.exec(m.sql);
      try { bad += need(m, await runArms(db, M, [m.arm])); } finally { await db.exec(m.undo); }
      continue;
    }
    const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split(String.fromCharCode(13)).join('');
    if (def.split(m.find).length !== 2) { console.error('✗ db mutant "' + m.name + '": anchor found ' + (def.split(m.find).length - 1) + ' time(s) in ' + m.fn); bad++; continue; }
    await db.exec(def.replace(m.find, () => m.replace));
    try { bad += need(m, await runArms(db, M, [m.arm])); } finally { await db.exec(def); }
  }
  return bad;
}

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  await H.pinDice(db);
  const M = await H.loadEdge(ROOT);
  if (MUTATE) {
    const clean = await runArms(db, M);
    const red = Object.entries(clean).filter(([, p]) => p && p.length);
    if (red.length) { for (const [n, p] of red) console.error('✗ clean control RED: ' + n + ': ' + p[0]); process.exit(1); }
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const bad = await mutate(db, M, pick);
    console.log(bad ? 'level-xp-ceiling --mutate: ' + bad + ' mutant(s) survived' : 'level-xp-ceiling --mutate: all ' + (pick ? 'picked' : DB_MUTANTS.length) + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const res = await runArms(db, M, onlyArg ? onlyArg.slice(7).split(',') : undefined);
  let red = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems && problems.length) { red++; for (const p of problems) console.error('✗ ' + name + ': ' + p); }
    else console.log('✓ ' + name);
  }
  console.log(red ? 'level-xp-ceiling: ' + red + ' arm(s) red' : 'level-xp-ceiling: all ' + Object.keys(res).length + ' arms green');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
