#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/cellar-outgrown.mjs — THE MILL CELLAR ENDS ITS HUNT AT LEVEL 5 AND A HERO PAST IT CAN'T START ONE THAT RUNS ON (lane/d-first-day-path;
//   the board's 2026-11-19 complete balance look, change 1: three of seven first heroes sat in the Cellar 6 to 12 hours past it).
//   src/data/hunt-grounds.js endsAtLevel, src/core/action-rules.js `outgrown`, supabase/migrations/2027-05-28-cellar-outgrown.sql and its catalogue.
//   The hunt viewed and with the browser closed are tests/hunt-live.mjs LV-OUTGROWN; this file holds the door, the proof and the engine's edges.
//
//   node tests/cellar-outgrown.mjs              the guard
//   node tests/cellar-outgrown.mjs --arm=door   one arm
//   node tests/cellar-outgrown.mjs --mutate     every planted defect must turn its arm red (--mutant=<part of a name>)
//
// mutant-anchors: supabase/migrations/2027-05-28-cellar-outgrown.sql src/core/action-rules.js src/core/combat-sim.js
//
//   CO-DATA    the number is the data's: hr_hunt_grounds.ends_at_level is hunt-grounds.js endsAtLevel on every ground (the Cellar's alone set),
//              END_ORDER's outgrown is in hr_hunt_end_reasons and resumes, and the Hunts list reads the Cellar's band as the Level under it
//   CO-DOOR    signed in through hr_hunt_enter: a hero one Level under the exit enters the Cellar; at the exit it is refused `outgrown` naming
//              the Level and NOTHING opens; the same hero enters the Thicket (the refusal is the exit's alone)
//   (CO-SCALED, the scaled way past the Cellar's exit, left with the scaled hunts: 1071-retire-tier-chain.sql; CO-DOOR holds the exit alone)
//   CO-PROOF   the settle proves the end from the Level it holds: a window ending `outgrown` one XP under the exit is refused end_not_proven
//              and moves nothing; at the exit the same window ends the session `outgrown`, an automatic end
//   CO-ENGINE  the one engine, browser closed (the settle the world tick runs): a tank twenty rats under the exit ends `outgrown` at the exit,
//              at the same instant on ten-minute and 90-second windows; a hero already at the exit (a hunt the door would have refused) ends
//              at its first boundary, never a kill; a ground without an exit never ends that way
//   CO-IDEM    a second apply of the two files moves no body, catalogue row or end reason (on the chain up to them: catacombs.mjs's rule)
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';

const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const { one, q } = H;
const ROOT = H.ROOT;
const FILE = '2027-05-28-cellar-outgrown.sql';
const FILES = ['2027-05-28-cellar-outgrown-hunt-sessions-catalogue.generated.sql', FILE];
const CELLAR = 'mill_cellar', THICKET = 'meadowbrook_thicket';
const [A] = H.UIDS;
const T0 = Date.UTC(2026, 9, 18, 12, 0, 0);
const idem = () => crypto.randomUUID();
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
async function as(db, uid, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await asUser(db, uid);
  const v = await one(db, sql, params);
  await asUser(db, '');
  return v;
}
const levelTo = (db, uid, xp) => db.query('update public.player_state set level_xp = $2 where user_id = $1 and slot = 0', [uid, xp]);
const openOf = async (db, uid) => Number(await one(db, 'select count(*)::int from public.hunt_sessions where user_id = $1 and ended_at is null', [uid]));
const closeAll = (db, uid) => db.query(`select public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = $1 and h.ended_at is null`, [uid]);
const fileText = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');

const imp = (root, p) => import(pathToFileURL(join(root, p)).href);
const G = await imp(ROOT, 'src/data/hunt-grounds.js');
const EXIT = G.HUNT_GROUNDS[CELLAR].endsAtLevel;

/* ── CO-DATA ──────────────────────────────────────────────────────────────── */
async function dataArm(db) {
  const bad = [];
  const rows = await q(db, 'select hunt_id, ends_at_level from public.hr_hunt_grounds where ends_at_level is not null order by hunt_id');
  const want = Object.values(G.HUNT_GROUNDS).filter((g) => Number.isInteger(g.endsAtLevel)).map((g) => ({ hunt_id: g.hunt, ends_at_level: g.endsAtLevel }));
  if (JSON.stringify(rows.map((r) => [r.hunt_id, Number(r.ends_at_level)])) !== JSON.stringify(want.map((r) => [r.hunt_id, r.ends_at_level]))) bad.push('CO-DATA hr_hunt_grounds carries ' + JSON.stringify(rows) + ', the data ' + JSON.stringify(want));
  if (!(Number.isInteger(EXIT) && EXIT > 1) || want.length !== 1) bad.push('CO-DATA CONTROL: the Cellar\'s exit reads ' + EXIT + ' and ' + want.length + ' grounds carry one');
  const r = (await q(db, "select resumes from public.hr_hunt_end_reasons where reason = 'outgrown'"))[0];
  if (!r || r.resumes !== true) bad.push('CO-DATA END_ORDER\'s outgrown is not an automatic end in hr_hunt_end_reasons: ' + JSON.stringify(r));
  const HL = await import(pathToFileURL(join(ROOT, 'src/shell/hunt-list.js')).href);
  const row = HL.huntRows().find((x) => x.hunt === CELLAR);
  if (!row || row.band[1] !== EXIT - 1 || HL.fitWords(row, EXIT).words !== 'Outgrown' || HL.recommendedHunt(EXIT, 1).hunt === CELLAR) bad.push('CO-DATA the Hunts list reads the Cellar ' + JSON.stringify(row && row.band) + ', at ' + EXIT + ' ' + JSON.stringify(row && HL.fitWords(row, EXIT)));
  return bad;
}

/* One probe hero, in town, at `xp` Level XP, with food and gold. */
async function hero(db, M, xp) {
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await H.character(db, M, A, { level: EXIT, inv: { cooked_shrimp: 200 }, gold: 50000 });
  await levelTo(db, A, xp);
}
const enter = (db, hunt) => as(db, A, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [hunt, idem()]);

/* ── CO-DOOR ──────────────────────────────────────────────────────────────── */
async function doorArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    await hero(db, M, M.XP.charXpForLevel(EXIT) - 1);
    let v = await enter(db, CELLAR);
    if (!v || v.ok !== true) bad.push('CO-DOOR one XP under Level ' + EXIT + ', the Cellar answered ' + JSON.stringify(v));
    await closeAll(db, A);
    await levelTo(db, A, M.XP.charXpForLevel(EXIT));
    v = await enter(db, CELLAR);
    if (!v || v.error !== 'outgrown' || v.level !== EXIT || v.hunt !== CELLAR) bad.push('CO-DOOR at Level ' + EXIT + ', the Cellar answered ' + JSON.stringify(v));
    if (await openOf(db, A)) bad.push('CO-DOOR a refused door opened a hunt');
    v = await enter(db, THICKET);
    if (!v || v.ok !== true) bad.push('CO-DOOR CONTROL: at Level ' + EXIT + ' the Thicket answered ' + JSON.stringify(v));
    return bad;
  });
}

/* ── CO-PROOF ─────────────────────────────────────────────────────────────── */
/* One instance window of `swings` swings as the engine proposes it (the migration's own §4 helper): one member, no kill, no XP, ending `reason`. */
const SETTLE_FN = `create or replace function pg_temp.co_settle(p_inst uuid, p_swings bigint, p_reason text) returns jsonb
  language plpgsql set search_path = public, pg_catalog as $b$
  declare v_i public.hunt_instances%rowtype; v_s public.hunt_sessions%rowtype; v_t bigint; v_to timestamptz;
          v_eat timestamptz; v_mto timestamptz; v_ver bigint; v_s0 bigint; v_e jsonb;
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    select * into v_i from public.hunt_instances where id = p_inst;
    select * into v_s from public.hunt_sessions where instance_id = p_inst and ended_at is null;
    v_t := public.hr_hunt_limit('swing_interval_ms');
    v_eat := v_s.settled_to + make_interval(secs => p_swings * v_t / 1000.0);
    v_mto := v_eat + interval '1 millisecond';
    v_to := v_i.settled_to + make_interval(secs => p_swings * v_t / 1000.0);
    v_s0 := public.hr_stamina_of(v_s.user_id, v_s.slot, v_s.settled_to);
    select version into v_ver from public.player_state where user_id = v_s.user_id and slot = v_s.slot;
    execute 'set local role hr_engine';
    v_e := public.hr_hunt_apply_instance(p_inst, v_i.world_swing,
      jsonb_build_object('to', v_to, 'world_swing', v_i.world_swing + p_swings, 'world', null),
      jsonb_build_array(jsonb_build_object('user', v_s.user_id, 'slot', v_s.slot, 'session', v_s.id, 'version', v_ver, 'intent', gen_random_uuid(),
        'delta', jsonb_build_object('accrued_to', v_mto, 'level_xp', 0, 'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
          'meta', jsonb_build_object('ms', p_swings * v_t, 'ticks', p_swings, 'kills', 0, 'mon', v_s.hunt_id, 'from', v_s.settled_to, 'to', v_mto))),
        'hunt', jsonb_build_object('swing_from', v_s.swing_index, 'swing_to', v_s.swing_index + p_swings, 'to', v_mto, 'next_swing_at', v_mto,
          'uses', '{}'::jsonb, 'paid_ms', p_swings * v_t, 'raw_xp', '{}'::jsonb,
          'hints', jsonb_build_object('slot_dry', '{}'::jsonb, 'rare_drop', '[]'::jsonb, 'death', '[]'::jsonb),
          'ended', jsonb_build_object('reason', p_reason, 'at', v_eat), 'buys', '{}'::jsonb, 'cover', '{}'::jsonb,
          'stamina', greatest(0, v_s0 - p_swings * v_t), 'death_xp', '[]'::jsonb, 'unit_id', null, 'tick_ms', v_t),
        'analyzer', null)), null, null);
    execute 'reset role';
    return v_e;
  end $b$`;
async function proofArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    await hero(db, M, M.XP.charXpForLevel(EXIT) - 100);
    const e = await enter(db, CELLAR);
    if (!e || e.ok !== true) return ['CO-PROOF HARNESS: the enter answered ' + JSON.stringify(e)];
    const sid = e.session.id;
    await db.query(`update public.hunt_sessions set entered_at = date_trunc('second', now()) - interval '21 minutes', hunt_from = date_trunc('second', now()) - interval '20 minutes',
                      settled_to = date_trunc('second', now()) - interval '20 minutes', next_swing_at = date_trunc('second', now()) - interval '20 minutes' where id = $1`, [sid]);
    await db.query(`update public.hunt_instances set settled_to = (select settled_to from public.hunt_sessions where id = $1), next_swing_at = (select settled_to from public.hunt_sessions where id = $1)
                     where id = (select instance_id from public.hunt_sessions where id = $1)`, [sid]);
    await db.query(SETTLE_FN);
    /* the settle runs as hr_engine, which draws the pinned uuids (H.pinDice): granted in this rolled-back transaction */
    await db.query('grant usage on sequence public.hr_test_uuid_seq to hr_engine');
    const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
    const settled0 = String(await one(db, 'select settled_to::text from public.hunt_sessions where id = $1', [sid]));
    await levelTo(db, A, M.XP.charXpForLevel(EXIT) - 1);
    let v = await one(db, 'select pg_temp.co_settle($1::uuid, 30, $2)', [inst, 'outgrown']);
    if (!v || v.error !== 'end_not_proven' || String(await one(db, 'select settled_to::text from public.hunt_sessions where id = $1', [sid])) !== settled0
        || (await one(db, 'select ended_at from public.hunt_sessions where id = $1', [sid])) !== null) bad.push('CO-PROOF one XP under Level ' + EXIT + ' an outgrown window answered ' + JSON.stringify(v));
    await levelTo(db, A, M.XP.charXpForLevel(EXIT));
    v = await one(db, 'select pg_temp.co_settle($1::uuid, 30, $2)', [inst, 'outgrown']);
    const end = await one(db, 'select end_reason from public.hunt_sessions where id = $1', [sid]);
    if (!v || v.ok !== true || end !== 'outgrown') bad.push('CO-PROOF at Level ' + EXIT + ' the outgrown window answered ' + JSON.stringify(v) + ', the session ended ' + end);
    return bad;
  });
}

/* ── CO-ENGINE (no database: the settle the world tick runs, src/core through the hr-accrue bundle) ───────── */
let PLAY = null;
async function engineArm(_db, M, root = ROOT) {
  const bad = [];
  const { loadPlay } = await imp(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs');
  const P = root === ROOT ? (PLAY || (PLAY = await loadPlay(ROOT))) : await loadPlay(root);
  const key = P.memberKey('tank', 0);
  const start = (xp) => () => ({ levelXp: xp });
  const ends = (windowMs, xp, hunt = CELLAR) => {
    let end = null;
    const x = P.run(hunt, EXIT - 1, ['tank'], { spanMs: 40 * 60000, windowMs, start: start(xp), bag: () => ({ cooked_shrimp: { loaded: 400 } }),
      onWindow: (w) => { for (const m of w.members) if (m.hunt.ended && !end) end = { reason: m.hunt.ended.reason, at: Date.parse(m.hunt.ended.at) }; } });
    const lv = M.XP.charLevelFromXp(((x.members || []).find((m) => m.key === key) || {}).levelXp);
    return { end, kills: x.totals.kills, lv };
  };
  const under = M.XP.charXpForLevel(EXIT) - 20 * P.MONSTERS.rat.xp;
  const long = ends(600000, under), short = ends(90000, under);
  if (!long.end || long.end.reason !== 'outgrown' || !(long.kills > 0)) bad.push('CO-ENGINE a tank twenty rats under Level ' + EXIT + ' ended ' + JSON.stringify(long.end) + ' after ' + long.kills + ' kills, want outgrown');
  if (!long.end || !short.end || long.end.at !== short.end.at || long.end.reason !== short.end.reason) bad.push('CO-ENGINE the end moved with the cut: ' + JSON.stringify(long.end) + ' on 10 min windows, ' + JSON.stringify(short.end) + ' on 90 s');
  if (Number.isInteger(long.lv) && long.lv < EXIT) bad.push('CO-ENGINE the hunt ended at Level ' + long.lv + ', under the exit ' + EXIT);
  const at = ends(600000, M.XP.charXpForLevel(EXIT));
  if (!at.end || at.end.reason !== 'outgrown' || at.kills !== 0) bad.push('CO-ENGINE a hero already at Level ' + EXIT + ' ran on: ended ' + JSON.stringify(at.end) + ' after ' + at.kills + ' kills, want outgrown at its first boundary');
  const thicket = ends(600000, M.XP.charXpForLevel(EXIT), THICKET);
  if (thicket.end && thicket.end.reason === 'outgrown') bad.push('CO-ENGINE CONTROL: the Thicket (no exit) ended outgrown');
  return bad;
}

/* ── CO-IDEM ──────────────────────────────────────────────────────────────── */
/* The second apply is judged on the chain UP TO this file (tests/catacombs.mjs's rule): a later file may move a body this one pins
   (1005-lever-horizon.sql splices hr_hunt_settle_session), and on the whole chain the pin rightly refuses to splice over it.
   Booted once, for this arm alone. */
let IDEM_DB = null;
async function idemArm() {
  if (!IDEM_DB) { IDEM_DB = (await bootReplay({ upTo: FILE })).db; await H.pinDice(IDEM_DB); }
  const db = IDEM_DB;
  return H.inTx(db, async () => {
    const bad = [];
    const snap = async () => JSON.stringify([
      await q(db, `select string_agg(md5(replace(prosrc, chr(13), '')), ',' order by oid::regprocedure::text) m from pg_proc where oid = any (array[
        'public.hr_hunt_admit(uuid,integer,text)'::regprocedure, 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure, 'public.hr_hunt_scaled_at_door(uuid,integer,text)'::regprocedure])`),
      await q(db, 'select hunt_id, ends_at_level from public.hr_hunt_grounds order by hunt_id'), await q(db, 'select * from public.hr_hunt_end_reasons order by ord')]);
    const before = await snap();
    /* the pinned uuids (H.pinDice) are a sequence the file's own §4 draws from under hr_engine (its settle): granted in this rolled-back transaction */
    await db.query('grant usage on sequence public.hr_test_uuid_seq to hr_engine');
    for (const f of FILES) {
      try { await db.exec(fileText(f)); } catch (e) { bad.push(`CO-IDEM the second apply of ${f} RAISED: ` + String(e.message).split('\n')[0]); return bad; }
    }
    if (await snap() !== before) bad.push('CO-IDEM the second apply moved a body, a ground\'s exit or an end reason');
    return bad;
  });
}

const ARMS = { data: dataArm, door: doorArm, proof: proofArm, engine: engineArm, idem: idemArm };

/* ── THE MUTANTS: a defect the exit exists to refuse, planted in the booted chain's live body (SQL) or a planted copy of src (the engine) ── */
const FN = { admit: 'public.hr_hunt_admit(uuid,integer,text)', settle: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)' };
const MUTANTS = [
  { name: 'the door asks no Level', arm: 'door', want: /^CO-DOOR at Level/, fn: FN.admit,
    find: "    if exists (select 1 from public.hr_hunt_grounds g\n                where g.hunt_id = p_hunt and g.ends_at_level is not null and public.hr_level_of(p_user, p_slot) >= g.ends_at_level)\n",
    replace: "    if false and exists (select 1 from public.hr_hunt_grounds g\n                where g.hunt_id = p_hunt and g.ends_at_level is not null and public.hr_level_of(p_user, p_slot) >= g.ends_at_level)\n" },
  { name: 'the door refuses one Level early', arm: 'door', want: /^CO-DOOR one XP under/, fn: FN.admit,
    find: 'public.hr_level_of(p_user, p_slot) >= g.ends_at_level) then', replace: 'public.hr_level_of(p_user, p_slot) >= g.ends_at_level - 1) then' },
  { name: 'the proof takes any outgrown end', arm: 'proof', want: /^CO-PROOF one XP under/, fn: FN.settle,
    find: "      when 'outgrown' then exists (select 1 from public.hr_hunt_grounds g", replace: "      when 'outgrown' then true or exists (select 1 from public.hr_hunt_grounds g" },
  { name: 'the engine never ends a hunt outgrown', arm: 'engine', want: /^CO-ENGINE a tank twenty rats under/, src: [['src/core/action-rules.js',
    '  outgrown: (hs) => Number.isInteger(hs.endsAtLevel) && Number.isInteger(hs.levelNow) && hs.levelNow >= hs.endsAtLevel,', '  outgrown: () => false,']] },
  { name: 'the engine ends a Level early', arm: 'engine', want: /^CO-ENGINE (a hero|the hunt ended at Level|a tank)/, src: [['src/core/action-rules.js',
    'hs.levelNow >= hs.endsAtLevel,', 'hs.levelNow >= hs.endsAtLevel - 1,']] },
  { name: 'the engine reads the Level only once a window (a cut moves the end)', arm: 'engine', want: /^CO-ENGINE (the end moved with the cut|a tank)/, src: [['src/core/combat-sim.js',
    '    readLevels(members, endsAt);\n    if (tw) for (const m of members) m.hs.floorEndsAtMs', '    if (atMs === startMs) readLevels(members, endsAt);\n    if (tw) for (const m of members) m.hs.floorEndsAtMs']] },
];

async function runArm(db, M, name) {
  try { return await ARMS[name](db, M); } catch (e) { return ['THREW ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
}

async function main() {
  const M = await H.loadEdge(ROOT);
  const mutate = process.argv.includes('--mutate') || process.argv.includes('--selftest');
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const needDb = mutate || !only || only !== 'engine';
  let db = null;
  if (needDb) {
    try { ({ db } = await bootReplay()); await H.pinDice(db); } catch (e) { console.error('cellar-outgrown: the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
  }
  if (mutate) {
    const { plant } = await import('./hunt-core/fixtures/h1.js');
    const { PLAY_TREES } = await import('./hunt-core/fixtures/play-ground.mjs');
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
        const p = plant(m.src, PLAY_TREES);
        try { got = await engineArm(null, M, p.root).catch((e) => ['THREW ' + String(e && e.message)]); } finally { p.done(); }
      }
      const hit = got.some((x) => m.want.test(x));
      if (!hit) escaped++;
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${m.name}: ${String(got[0] || 'every check held').slice(0, 160)}`);
    }
    console.log(escaped ? `cellar-outgrown --mutate: ${escaped} ESCAPED` : `cellar-outgrown --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const bad = [], ran = [];
  for (const name of Object.keys(ARMS)) {
    if (only && name !== only) continue;
    ran.push(name);
    const got = await runArm(db, M, name);
    console.log((got.length ? '✗ ' : '✓ ') + name);
    bad.push(...got);
  }
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? `cellar-outgrown: ${bad.length} FAILED` : 'cellar-outgrown: green (' + ran.join(', ') + ')');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
