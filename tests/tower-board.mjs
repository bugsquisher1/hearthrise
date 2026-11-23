#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tower-board.mjs — THE BURNING TOWER'S BOARD ON THE REPLAYED CHAIN: EVERY HERO'S BEST FLOOR RANKED, KEPT ONCE A RISE, READ-ONLY
//   (lane/c-tower-board; Tyler 2026-11-14 "a leaderboard"; supabase/migrations/2027-04-30-tower-board.sql).
//
//   node tests/tower-board.mjs              the guard
//   node tests/tower-board.mjs --arm=order  one arm
//   node tests/tower-board.mjs --mutate     every planted defect must turn its arm red (--mutant=<part of a name>)
//
// mutant-anchors: supabase/migrations/2027-04-30-tower-board.sql
//
//   TB-ORDER  six heroes' bests written as the settle writes them (tower_progress): the place is 1 + the heroes strictly ahead (a higher
//             floor, or the same floor reached first), two who reached a floor in one instant share a place; the field's two above and two
//             below in the board's order, top-down, each a name, a floor, the DAY reached and an outfit, no account id or slot; a seat of the
//             hero's own party is the party's marker, never a rival; a hidden hero is never counted or shown, and still reads its own place;
//             a hero with no floor has no field
//   TB-RISE   BOTH DOORS (the browser closed: the world tick; the hunt viewed: the player's settle) on the real engine: the board row is
//             written exactly once for each settle that raised the hero's best, every write a rise, and it ends equal to the record; a
//             re-climb below the best writes the record row and never the board
//   TB-END    a record climb on the real engine from checkpoint 10: its card's place on the board is rank 1, the heroes it passed are the
//             ones ahead of its old record and now behind it (not the hero tied with the old record, not the one below it), the best of
//             them named
//   TB-WALLS  another player's data is read-only: as the real `authenticated` role the board tables refuse select, insert, update and
//             delete, every board read and the section are refused; the hero's own envelope (hr_load) carries the rivals' names and
//             floors and no other account's id
//   TB-DEPTH  past the board's depth (planted at 2): the place reads `over`, never a rank
//   TB-IDEM   a second apply of the file is byte-identical: the schema inventory, every body it states, the board rows
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';
import { inventory } from './schema-replay.mjs';

const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const TC = (await import('./tower-climb.mjs')).HARNESS;
const ROOT = H.ROOT;
const FILE = '2027-04-30-tower-board.sql';
const SQL = readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n');
const UID = TC.UID;
const idem = () => crypto.randomUUID();
const q = async (db, sql, p) => (await db.query(sql, p)).rows;
const one = async (db, sql, p) => { const r = await q(db, sql, p); return r[0] ? Object.values(r[0])[0] : undefined; };
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const inTx = async (db, fn) => { await db.query('begin'); try { return await fn(); } finally { await db.query('rollback'); } };
const T = '2026-11-10T12:00:00Z';

/* Six heroes, uids sorted as their names (Ash < Dara keeps one stable order inside the shared place). */
const HEROES = Object.freeze({
  Ash: '00000000-0000-4000-8000-00000b0a0d01', Bryn: '00000000-0000-4000-8000-00000b0a0d02', Cole: '00000000-0000-4000-8000-00000b0a0d03',
  Dara: '00000000-0000-4000-8000-00000b0a0d04', Eira: '00000000-0000-4000-8000-00000b0a0d05', Finn: '00000000-0000-4000-8000-00000b0a0d06',
  Gale: '00000000-0000-4000-8000-00000b0a0d07',
});
async function hero(db, uid, name) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await asUser(db, uid);
  const c = await one(db, 'select public.hr_create_character(0)');
  if (!c || c.created !== true) throw new Error('hr_create_character refused ' + name + ': ' + JSON.stringify(c));
  await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0", [uid]);
  await db.query(`insert into public.character_names (user_id, slot, name, canonical) values ($1, 0, $2, public.hr_canon_display_name($2))
                  on conflict (user_id, slot) do update set name = excluded.name, canonical = excluded.canonical`, [uid, name]);
  await asUser(db, '');
}
/* A best written as the settle writes it: the record row on the Tower's ground and the hero's board row, raised (2027-05-08-catacombs.sql: hr_tower_write
   raises the board itself; before it, the record's trigger did, and the raise-only upsert below is then a no-op). Either chain position (TB-IDEM). */
const hasGround = async (db) => Number(await one(db, "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'tower_progress' and column_name = 'hunt_id'")) > 0;
const best = async (db, uid, floor, at) => {
  const g = await hasGround(db);
  await db.query(`insert into public.tower_progress (user_id, slot, ${g ? 'hunt_id, ' : ''}best_floor, best_landing, best_at) values ($1, 0, ${g ? "'the_burning_tower', " : ''}$2, $3, $4::timestamptz)
    on conflict (user_id, slot${g ? ', hunt_id' : ''}) do update set best_floor = greatest(tower_progress.best_floor, excluded.best_floor), best_at = excluded.best_at`, [uid, floor, Math.floor(floor / 10) * 10, at]);
  await db.query(`insert into public.hr_mode_board as b (mode_id, user_id, slot, score, reached_at, updated_at) values ('tower', $1, 0, $2, $3::timestamptz, now())
    on conflict (mode_id, user_id, slot) do update set score = excluded.score, reached_at = excluded.reached_at, updated_at = excluded.updated_at where excluded.score > b.score`, [uid, floor, at]);
};
const towerOf = (db, uid) => one(db, `select public.hr_state_of($1::uuid, 0)->'tower'`, [uid]);
const names = (list) => (list || []).map((h) => h.name).join(',');
const switchOn = (db) => db.query("update public.hr_feature_switches set scope = 'everyone' where switch_id = 'burning_tower'");

/* The six on the board: Bryn 30 | Cole 25 (an hour earlier) | Ash 25, Dara 25 (one instant: one place) | Eira 20 | Finn 5. Gale never climbed. */
async function seed(db) {
  for (const [n, u] of Object.entries(HEROES)) await hero(db, u, n);
  await switchOn(db);
  const H0 = HEROES;
  await best(db, H0.Bryn, 30, T);
  await best(db, H0.Cole, 25, '2026-11-10T11:00:00Z');
  await best(db, H0.Ash, 25, T);
  await best(db, H0.Dara, 25, T);
  await best(db, H0.Eira, 20, '2026-11-10T10:00:00Z');
  await best(db, H0.Finn, 5, T);
}

/* ── TB-ORDER ─────────────────────────────────────────────────────────────── */
async function orderArm(db) {
  return inTx(db, async () => {
    const bad = [];
    await seed(db);
    const P = HEROES;
    const want = { Bryn: [1, '', 'Cole,Ash'], Cole: [2, 'Bryn', 'Ash,Dara'], Ash: [3, 'Bryn,Cole', 'Dara,Eira'], Dara: [3, 'Cole,Ash', 'Eira,Finn'],
      Eira: [5, 'Ash,Dara', 'Finn'], Finn: [6, 'Dara,Eira', ''] };
    for (const [n, [rank, above, below]] of Object.entries(want)) {
      const f = (await towerOf(db, P[n])).field;
      if (!f || f.rank !== rank || 'over' in f || names(f.above) !== above || names(f.below) !== below) bad.push(`TB-ORDER ${n} reads ${JSON.stringify(f)}, not #${rank} under [${above}] over [${below}]`);
    }
    const a = (await towerOf(db, P.Ash)).field;
    const bryn = (a.above || [])[0] || {};
    if (bryn.floor !== 30 || bryn.at !== '2026-11-10' || !('outfit' in bryn)) bad.push('TB-ORDER a rival row reads ' + JSON.stringify(bryn));
    if ((a.above || []).concat(a.below || []).some((h) => Object.keys(h).sort().join() !== 'at,floor,name,outfit')) bad.push('TB-ORDER a rival row carries more than its name, floor, day and outfit: ' + JSON.stringify(a));
    if (Object.values(P).some((u) => JSON.stringify(a).includes(u))) bad.push('TB-ORDER the field carries an account id');
    if ('field' in (await towerOf(db, P.Gale))) bad.push('TB-ORDER a hero who never climbed has a field');
    /* a seat of Ash's party is its party marker, not a rival */
    await db.query('select public.hr_party_seat_into(public.hr_party_open($1::uuid, 0), $2::uuid, 0)', [P.Ash, P.Cole]);
    const pa = await towerOf(db, P.Ash);
    if (names(pa.field.above) !== 'Bryn' || names(pa.field.below) !== 'Dara,Eira' || pa.field.rank !== 3 || names(pa.party) !== 'Cole')
      bad.push('TB-ORDER with Cole seated Ash reads ' + JSON.stringify([pa.field, pa.party]));
    /* hidden: never counted, never shown; the hidden hero still reads its own place among the others */
    await db.query("insert into public.hr_lb_hidden (user_id, slot, reason, note) values ($1, null, 'test', 'tower-board test')", [P.Eira]);
    const fd = (await towerOf(db, P.Dara)).field, ff = (await towerOf(db, P.Finn)).field, fe = (await towerOf(db, P.Eira)).field;
    if (names(fd.below) !== 'Finn' || ff.rank !== 5 || names(ff.above) !== 'Ash,Dara') bad.push('TB-ORDER with Eira hidden Dara reads ' + JSON.stringify(fd) + ', Finn ' + JSON.stringify(ff));
    if (!fe || fe.rank !== 5 || names(fe.above) !== 'Ash,Dara' || names(fe.below) !== 'Finn') bad.push('TB-ORDER hidden Eira reads its own place as ' + JSON.stringify(fe));
    return bad;
  });
}

/* ── TB-RISE ─────────────────────────────────────────────────────────────── */
const AUDIT = `
  create table public.tb_log (n serial, what text, old_score int, new_score int, at timestamptz);
  create function public.tb_log_board() returns trigger language plpgsql as $f$ begin
    insert into public.tb_log (what, old_score, new_score, at) values ('board', case when tg_op = 'UPDATE' then old.score end, new.score, new.reached_at); return null; end $f$;
  create function public.tb_log_best() returns trigger language plpgsql as $f$ begin
    insert into public.tb_log (what, old_score, new_score, at) values (case when new.best_floor > coalesce(case when tg_op = 'UPDATE' then old.best_floor end, 0)
      then 'rise' else 'write' end, case when tg_op = 'UPDATE' then old.best_floor end, new.best_floor, new.best_at); return null; end $f$;
  create trigger tb_log_board after insert or update on public.hr_mode_board for each row execute function public.tb_log_board();
  create trigger tb_log_best after insert or update on public.tower_progress for each row execute function public.tb_log_best();`;
async function riseArm(db, M) {
  const bad = [];
  const sigs = {};
  for (const door of ['closed', 'viewed']) {
    const tag = `TB-RISE the ${door === 'closed' ? 'browser closed' : 'hunt viewed'}:`;
    const r = await inTx(db, async () => {
      await db.exec(AUDIT);
      /* a bare Level 20 (a bare Level 12 tops out at floor 9 on the formulas' floors, lane/tower-boss-formula) */
      const h = await TC.climber(db, M, { level: 20 });
      try { await TC.drive(db, M, door, h); } catch (e) { return { err: String(e.message).slice(0, 300) }; }
      const log1 = await q(db, 'select what, old_score, new_score, at from public.tb_log order by n');
      const row = (await q(db, `select score, reached_at from public.hr_mode_board where user_id = $1 and slot = 0`, [UID]))[0] || null;
      const rec = (await q(db, 'select best_floor, best_at from public.tower_progress where user_id = $1 and slot = 0', [UID]))[0] || null;
      /* A RE-CLIMB BELOW THE BEST: the climb ended (or is ended here), a second one from floor 1 settles two minutes: floors, never a new best */
      if (!(await one(db, 'select ended_at from public.hunt_sessions where id = $1', [h.sid]))) await db.query(`select public.hr_hunt_close($1, 'left', now(), true)`, [h.sid]);
      await db.query('delete from public.tb_log');
      await asUser(db, UID);
      const again = await one(db, 'select public.hr_tower_start(0, 0, $1::uuid)', [idem()]);
      await asUser(db, '');
      if (!again || again.ok !== true) return { err: 'the second climb was refused: ' + JSON.stringify(again).slice(0, 200) };
      const sid = again.session_id;
      /* from where the first climb's clock stopped: earlier would spend stamina time it already spent (the settle refuses stamina_ahead) */
      const t = `(select date_trunc('second', settled_to) + interval '1 second' from public.hunt_sessions where id = '${h.sid}')`;
      await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
      const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
      await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
      const from = Number(await one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1', [inst]));
      /* five minutes of the world tick (a few floors: the first climb's first settle alone stood at floor 5 or less, its record is 10+) */
      for (let guard = 0; guard < 30; guard++) {
        const st = (await q(db, 'select settled_to, ended_at from public.hunt_sessions where id = $1', [sid]))[0];
        if (st.ended_at || Date.parse(st.settled_to) >= from + 300000) break;
        await db.query('delete from public.hunt_tick_lease');
        await M.TK.runTick({ exec: H.makeExec(db), grounds: {}, atMs: from + 300000,
          body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts: [{ user_id: UID, slot: 0, session_id: sid }] } });
      }
      const log2 = await q(db, 'select what, new_score from public.tb_log order by n');
      const top2 = await one(db, 'select top_floor from public.tower_runs where session_id = $1', [sid]);
      return { log1, row, rec, log2, top2 };
    });
    if (r.err) { bad.push(`${tag} ${r.err}`); continue; }
    const board = r.log1.filter((x) => x.what === 'board'), rises = r.log1.filter((x) => x.what === 'rise');
    if (rises.length < 2) { bad.push(`${tag} CONTROL: the climb raised its best ${rises.length} time(s), too few to prove once a rise`); continue; }
    if (board.length !== rises.length) bad.push(`${tag} ${rises.length} settles raised the best and the board was written ${board.length} times`);
    if (board.some((x, i) => x.new_score !== rises[i]?.new_score || (i > 0 && !(x.new_score > x.old_score)) || (i === 0 && x.old_score !== null)))
      bad.push(`${tag} a board write is not its settle's rise: ${JSON.stringify(board.map((x) => [x.old_score, x.new_score]))} vs ${JSON.stringify(rises.map((x) => x.new_score))}`);
    if (!r.row || !r.rec || r.row.score !== r.rec.best_floor || +new Date(r.row.reached_at) !== +new Date(r.rec.best_at))
      bad.push(`${tag} the board reads ${JSON.stringify(r.row)}, the record ${JSON.stringify(r.rec)}`);
    if (!(r.top2 >= 1) || !r.log2.some((x) => x.what === 'write')) bad.push(`${tag} CONTROL: the re-climb wrote no record row (top ${r.top2}, ${JSON.stringify(r.log2)})`);
    else if (!(r.top2 < r.rec.best_floor)) bad.push(`${tag} CONTROL: the re-climb reached ${r.top2}, not below the record ${r.rec.best_floor}`);
    else if (r.log2.some((x) => x.what !== 'write')) bad.push(`${tag} a re-climb below the best (top ${r.top2}) wrote ${JSON.stringify(r.log2)}`);
    /* the doors cut their settles differently (the tick's windows, the viewer's asks), so the writes between differ; the record kept may not */
    sigs[door] = r.row && r.row.score;
  }
  if (sigs.closed !== undefined && sigs.viewed !== undefined && sigs.closed !== sigs.viewed) bad.push(`TB-RISE the browser closed keeps floor ${sigs.closed}, the hunt viewed ${sigs.viewed}`);
  return bad;
}

/* ── TB-END ──────────────────────────────────────────────────────────────── */
async function endArm(db, M) {
  const R = { R1: '00000000-0000-4000-8000-00000b0a0e01', R2: '00000000-0000-4000-8000-00000b0a0e02', R3: '00000000-0000-4000-8000-00000b0a0e03',
    R4: '00000000-0000-4000-8000-00000b0a0e04' };
  return inTx(db, async () => {
    const bad = [];
    const T0 = '2026-11-01T12:00:00Z';
    const h = await TC.climber(db, M, { level: 30, landing: 10, before: async () => {
      /* the climber's record: floor 10 at T0. Ahead of it: R1 (11), R2 (10, reached first). Tied with it in one instant: R3. Below: R4 (9). */
      await best(db, UID, 10, T0);
      await hero(db, R.R1, 'Rook'); await hero(db, R.R2, 'Sela'); await hero(db, R.R3, 'Tamm'); await hero(db, R.R4, 'Ulla');
      await best(db, R.R1, 11, '2026-11-01T10:00:00Z');
      await best(db, R.R2, 10, '2026-11-01T11:00:00Z');
      await best(db, R.R3, 10, T0);
      await best(db, R.R4, 9, '2026-11-01T09:00:00Z');
    } });
    const from = await q(db, 'select from_score, from_at from public.hr_mode_board_last where user_id = $1 and slot = 0', [UID]);
    if (from.length !== 1 || from[0].from_score !== 10 || +new Date(from[0].from_at) !== +new Date(T0)) bad.push('TB-END the climb starts from ' + JSON.stringify(from));
    await TC.drive(db, M, 'closed', h);
    if (!(await one(db, 'select ended_at from public.hunt_sessions where id = $1', [h.sid]))) await db.query(`select public.hr_hunt_close($1, 'left', now(), true)`, [h.sid]);
    const top = await one(db, 'select top_floor from public.tower_runs where session_id = $1', [h.sid]);
    if (!(top >= 12)) { bad.push(`TB-END CONTROL: a Level 30 climb from floor 11 reached ${top}, not past every rival`); return bad; }
    const tw = await towerOf(db, UID);
    const board = tw.last && tw.last.session === h.sid ? tw.last.board : undefined;
    if (JSON.stringify(board) !== JSON.stringify({ name: 'Rook', rank: 1, passed: 2 })) bad.push(`TB-END the record climb to ${top} reads ${JSON.stringify(board)} (last ${JSON.stringify(tw.last && tw.last.session)})`);
    if (tw.field?.rank !== 1 || names(tw.field.below) !== 'Rook,Sela') bad.push('TB-END the field after the climb reads ' + JSON.stringify(tw.field));
    return bad;
  });
}

/* ── TB-WALLS ────────────────────────────────────────────────────────────── */
async function wallsArm(db) {
  return inTx(db, async () => {
    const bad = [];
    await seed(db);
    const P = HEROES;
    const probes = [
      'select count(*) from public.hr_mode_board', 'select count(*) from public.hr_mode_board_last',
      `insert into public.hr_mode_board (mode_id, user_id, slot, score, reached_at) values ('tower', '${P.Ash}', 0, 999, now())`,
      `update public.hr_mode_board set score = 999 where user_id = '${P.Ash}'`, `delete from public.hr_mode_board where user_id = '${P.Bryn}'`,
      `insert into public.hr_mode_board_last (mode_id, user_id, slot, session_id) values ('tower', '${P.Ash}', 0, gen_random_uuid())`,
      `select public.hr_mode_board_field('tower', '${P.Bryn}'::uuid, 0)`, `select public.hr_mode_board_rank('tower', 1, now())`,
      `select public.hr_mode_board_end('tower', '${P.Bryn}'::uuid, 0, gen_random_uuid())`, `select public.hr_tower_section('${P.Bryn}'::uuid, 0)`,
      `select public.hr_mode_board_hero('${P.Bryn}'::uuid, 0, 1, now())`,
    ];
    await asUser(db, P.Ash);
    for (const sql of probes) {
      await db.query('savepoint w');
      let ok = false;
      try { await db.exec('set role authenticated'); await db.query(sql); ok = true; } catch { /* refused: the wall */ }
      await db.query('rollback to savepoint w');
      await db.exec('reset role');
      if (ok) bad.push('TB-WALLS the authenticated role ran: ' + sql);
    }
    /* the hero's own envelope, through the client's own read: the rivals' names and floors, no other account's id */
    await db.exec('set role authenticated');
    let env;
    try { env = await one(db, 'select public.hr_load(0)'); } finally { await db.exec('reset role'); }
    const f = env && env.tower && env.tower.field;
    if (!f || f.rank !== 3 || names(f.above) !== 'Bryn,Cole') bad.push('TB-WALLS hr_load carries the field ' + JSON.stringify(f) + ' (CONTROL: the client read reaches the board)');
    const txt = JSON.stringify(env && env.tower);
    for (const [n, u] of Object.entries(P)) if (n !== 'Ash' && txt.includes(u)) bad.push('TB-WALLS the Tower section carries ' + n + '\'s account id');
    if (await one(db, 'select count(*)::int from public.hr_mode_board where score = 999') !== 0) bad.push('TB-WALLS a client write reached the board');
    return bad;
  });
}

/* ── TB-DEPTH ────────────────────────────────────────────────────────────── */
async function depthArm(db) {
  return inTx(db, async () => {
    const bad = [];
    await seed(db);
    await db.exec("create or replace function public.hr_mode_board_depth() returns int language plpgsql immutable set search_path = public, pg_catalog as $fn$ begin return 2; end $fn$");
    const got = {};
    for (const n of ['Bryn', 'Cole', 'Ash', 'Finn']) got[n] = (await towerOf(db, HEROES[n])).field;
    if (got.Bryn?.rank !== 1 || got.Cole?.rank !== 2 || got.Ash?.rank !== undefined || got.Ash?.over !== 2 || got.Finn?.over !== 2 || names(got.Finn.above) !== 'Dara,Eira')
      bad.push('TB-DEPTH at depth 2 the places read ' + JSON.stringify(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v && { rank: v.rank, over: v.over }]))));
    return bad;
  });
}

/* ── TB-IDEM ─────────────────────────────────────────────────────────────── */
const SIGS = ['hr_tower_section(uuid,integer)', 'hr_mode_board_depth()', 'hr_mode_board_rank(text,integer,timestamp with time zone)',
  'hr_mode_board_hero(uuid,integer,integer,timestamp with time zone)', 'hr_mode_board_place(integer)', 'hr_mode_board_field(text,uuid,integer)',
  'hr_mode_board_end(text,uuid,integer,uuid)', 'hr_tower_board_mode()', 'hr_tower_board_rise()', 'hr_tower_board_run_start()', 'hr_tower_board_run_end()'];
/* Judged where its file sits in the chain (upTo it): 2027-05-08-catacombs.sql restates its section and board triggers for every run ground after it,
   later images this file's §0 pins were never written against. */
/* an `idem` mutant is planted HERE, in the arm's own chain (the shared one is past this file): IDEM_PLANT, set by the mutate loop */
let IDEM_PLANT = null;
async function idemArm() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { db } = await bootReplay({ upTo: FILE });
  try {
    if (IDEM_PLANT) {
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [IDEM_PLANT.fn])).split('\r').join('');
      if (def.split(IDEM_PLANT.find).length !== 2) return [`HARNESS: ${IDEM_PLANT.fn} has no single ${JSON.stringify(IDEM_PLANT.find.slice(0, 80))} at ${FILE}`];
      await db.exec(def.replace(IDEM_PLANT.find, () => IDEM_PLANT.replace));
    }
    return await idemAt(db);
  } finally { await db.close(); }
}
async function idemAt(db) {
  return inTx(db, async () => {
    const bad = [];
    await seed(db);
    /* THE DOOR'S LEVEL IS A LATER FILE'S RULE (2027-05-05-entry-gates.sql, Tyler 2026-11-18): this file's own §6 climbs with new Level 1 heroes,
       so its second apply is judged with the door at Level 1 (the catalogue's floor), in this rolled-back transaction, before either snapshot. */
    if (Number(await one(db, "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'hr_tower_rules' and column_name = 'min_level'")))
      await db.query('update public.hr_tower_rules set min_level = 1 where id');
    const snap = async () => JSON.stringify([await inventory(db),
      await q(db, `select string_agg(md5(replace(prosrc, chr(13), '')), ',' order by oid::regprocedure::text) m from pg_proc where oid = any (array[${SIGS.map((s) => `'public.${s}'::regprocedure`).join(',')}])`),
      await q(db, 'select mode_id, user_id, slot, score, reached_at, updated_at from public.hr_mode_board order by 1, 2, 3'),
      await q(db, "select key, fn, note from public.hr_state_sections where key = 'tower'")]);
    const before = await snap();
    try { await db.exec(SQL); } catch (e) { bad.push('TB-IDEM the second apply RAISED: ' + String(e.message).split('\n')[0]); return bad; }
    if (await snap() !== before) bad.push('TB-IDEM the second apply moved the schema, a body, a board row or the section row');
    return bad;
  });
}

const ARMS = { order: orderArm, rise: riseArm, end: endArm, walls: wallsArm, depth: depthArm, idem: idemArm };

/* ── THE MUTANTS: each a defect the board exists to refuse, planted in the booted chain ─────────────── */
const MUTANTS = [
  { name: 'one instant is not one place', arm: 'order', want: /^TB-ORDER Dara/, fn: 'public.hr_mode_board_rank(text,integer,timestamp with time zone)',
    find: "and ((-b.score), b.reached_at) < ((-p_score), p_at)", replace: "and ((-b.score), b.reached_at, b.user_id) < ((-p_score), p_at, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)" },
  { name: 'who got there first is not asked', arm: 'order', want: /^TB-ORDER (Ash|Cole)/, fn: 'public.hr_mode_board_rank(text,integer,timestamp with time zone)',
    find: "and ((-b.score), b.reached_at) < ((-p_score), p_at)", replace: 'and (-b.score) < (-p_score)' },
  { name: 'a hidden hero is a rival', arm: 'order', want: /^TB-ORDER with Eira hidden/, fn: 'public.hr_mode_board_field(text,uuid,integer)',
    find: "           where b.mode_id = p_mode and ((-b.score), b.reached_at, b.user_id, b.slot) > ((-me.score), me.reached_at, me.user_id, me.slot)\n             and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))",
    replace: "           where b.mode_id = p_mode and ((-b.score), b.reached_at, b.user_id, b.slot) > ((-me.score), me.reached_at, me.user_id, me.slot)" },
  { name: 'a party seat is a rival', arm: 'order', want: /^TB-ORDER with Cole seated/, fn: 'public.hr_mode_board_field(text,uuid,integer)',
    find: "           where b.mode_id = p_mode and ((-b.score), b.reached_at, b.user_id, b.slot) < ((-me.score), me.reached_at, me.user_id, me.slot)\n             and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))\n             and (v_party is null or",
    replace: "           where b.mode_id = p_mode and ((-b.score), b.reached_at, b.user_id, b.slot) < ((-me.score), me.reached_at, me.user_id, me.slot)\n             and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))\n             and (true or" },
  /* the board is raised in hr_tower_write since 2027-05-08-catacombs.sql (the rise trigger on tower_progress is gone) */
  { name: 'the board is written on every settle', arm: 'rise', want: /^TB-RISE/, fn: 'public.hr_tower_write(uuid,integer,uuid,jsonb,bigint,timestamp with time zone)',
    find: '   where excluded.score > b.score;', replace: ';' },
  { name: 'the board never rises', arm: 'rise', want: /^TB-RISE/, fn: 'public.hr_tower_write(uuid,integer,uuid,jsonb,bigint,timestamp with time zone)',
    find: '  on conflict (mode_id, user_id, slot) do update set score = excluded.score, reached_at = excluded.reached_at, updated_at = excluded.updated_at\n   where excluded.score > b.score;',
    replace: '  on conflict (mode_id, user_id, slot) do nothing;' },
  { name: 'the tie with the old record counts as passed', arm: 'end', want: /^TB-END the record climb/, fn: 'public.hr_tower_board_run_end()',
    find: '         and ((-b.score), b.reached_at) < ((-l.from_score), l.from_at)\n         and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))\n       limit v_depth) t;',
    replace: '         and ((-b.score), b.reached_at) <= ((-l.from_score), l.from_at)\n         and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))\n       limit v_depth) t;' },
  { name: 'the climb starts from no record', arm: 'end', want: /^TB-END/, fn: 'public.hr_tower_board_run_start()',
    find: "  select v_mode, new.user_id, new.slot, new.session_id, coalesce(b.score, 0), b.reached_at,", replace: "  select v_mode, new.user_id, new.slot, new.session_id, 0, null," },
  { name: 'a rival row carries its account', arm: 'walls', want: /^TB-WALLS the Tower section carries/, fn: 'public.hr_mode_board_hero(uuid,integer,integer,timestamp with time zone)',
    find: "  return jsonb_build_object('name', public.hr_character_name(p_user, p_slot), 'floor', p_score,",
    replace: "  return jsonb_build_object('id', p_user, 'name', public.hr_character_name(p_user, p_slot), 'floor', p_score," },
  { name: 'the depth is never reached', arm: 'depth', want: /^TB-DEPTH/, fn: 'public.hr_mode_board_rank(text,integer,timestamp with time zone)',
    find: '  return case when v_n >= v_depth then null else v_n + 1 end;', replace: '  return v_n + 1;' },
  { name: 'a second apply restates another body', arm: 'idem', want: /^TB-IDEM/, fn: 'public.hr_mode_board_depth()',
    find: '  return 1000;', replace: '  return 999;' },
];

async function runArm(db, M, name) {
  try { return await ARMS[name](db, M); } catch (e) { return ['THREW ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
}

async function main() {
  let db;
  try { db = await TC.boot(); } catch (e) { console.error('tower-board: the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
  const M = await TC.load(ROOT);
  if (process.argv.includes('--mutate')) {
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    let escaped = 0;
    for (const m of list) {
      if (m.arm === 'idem') {
        IDEM_PLANT = m;
        let gotIdem = [];
        try { gotIdem = await runArm(db, M, m.arm); } finally { IDEM_PLANT = null; }
        const hitIdem = gotIdem.some((x) => m.want.test(x));
        if (!hitIdem) escaped++;
        console.log(`  ${hitIdem ? 'caught ' : 'ESCAPED'} ${m.name}: ${String(gotIdem[0] || 'every check held').slice(0, 170)}`);
        continue;
      }
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split('\r').join('');
      if (def.split(m.find).length !== 2) { console.error(`HARNESS: ${m.fn} has no single ${JSON.stringify(m.find.slice(0, 80))}`); process.exit(2); }
      let got = [];
      await db.exec(def.replace(m.find, () => m.replace));
      if (m.ddl) await db.exec(m.ddl);
      try { got = await runArm(db, M, m.arm); } finally { await db.exec(def); if (m.undo) await db.exec(m.undo); }
      const hit = got.some((x) => m.want.test(x));
      if (!hit) escaped++;
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${m.name}: ${String(got[0] || 'every check held').slice(0, 170)}`);
    }
    console.log(escaped ? `tower-board --mutate: ${escaped} ESCAPED` : `tower-board --mutate: ${list.length}/${list.length} caught`);
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
  console.log(bad.length ? `tower-board: ${bad.length} FAILED` : 'tower-board: green (places with ties, the field, both doors once a rise, a climb\'s end, the walls, the depth, a second apply)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
