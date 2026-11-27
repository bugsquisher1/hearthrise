#!/usr/bin/env node
// tests/worn-imbues-db.mjs — THE IMBUEMENTS A HERO WEARS ARE THE SERVER'S, AND RUN OUT AT ONE INSTANT ON BOTH DOORS (1077-worn-imbues.sql,
// lane/worn-imbues, backend-architect, 2026-11-27; 21-flame-temper-imbue-loot.md sections 3 and 10, CLAUDE.md §1, §4 both paths, §6).
// The engine's half (the run-out instant, heroSetup's set surviving the engine's re-read) is tests/imbue.mjs IM-8.
//
//   node tests/worn-imbues-db.mjs            the guard
//   node tests/worn-imbues-db.mjs --mutate   the proof: each planted SQL or edge defect turns its case red
//
// THE MEASURE: the replayed chain (PGlite), the shipped world tick (browser closed, the `fire` door, the 90 s flush) and the viewed hello
// (hunt viewed, the `viewed` door, 30 s windows) through tools/settle-cost.mjs, the real engine: a Level 60 four from four accounts in the
// play-ground's Level 60 kit (a mithril sword and shield tank, three mithril hammers) on Hask's Ford (its Fordsunk is a brute) on Steady.
// Every hero wears a Brute Edge (band 70) that runs out 90.037 s into the hunt, 37 ms after the closed hunt's first window ends.
// THE LOUD EDGE (WI-2 only): at Level 60 an Edge is 0.6 of a step (x ramp) and a blow's steps are rounded whole (amount.js blowAmount),
// so the real one moves a 270 s hunt by a hit point or two of damage dealt (MEASURED, three fixtures: Muster in steel or the kit, Hask's
// Ford, the Slake): too little for a guard to read a run-out on. So WI-2's edge plants the size (IMBUE.steps 40, the consumable cap 120;
// trait-pieces-db plants its drop rate the same way): 12 steps on a brute at Level 60, a fight a run-out visibly ends. The server re-proves
// no imbuement number, so the plant reaches only the engine; every door plays the same plant.
// The leader also wears a Fire Ward and a Life Leech; the second hero has a Life Leech row on a bare head, the third a Brute Edge row in
// its helmet (another kind's slot).
//   WI-1 DARK: with the switch as applied (off) the read hands every member worn_imbues null, the plan's heroes wear none, and the timer
//        moves no row in 270 hunted seconds.
//   WI-2 BOTH PATHS, AND THE RUN-OUT: lit, the closed hunt (three 90 s windows) and the viewed one (nine 30 s windows) from one anchor store
//        the SAME world, bags, Level XP, tallies (damage dealt, taken, healed, kills) and worn rows; the Edge ran out inside a window on
//        both doors (its row gone, the Ward's 270 s shorter); every live start point the viewer was handed carries the Edge to the one
//        instant anchor + 90.037 s, then not at all; and the fight differs from the same four dark (the imbuements played).
//   WI-3 THE PROJECTION: the read hands the leader its three, in equip-slot order, and every other hero its Edge alone (not a row on a
//        bare head, not one in another kind's slot); the plan hands each hero each one to the read's settled_to plus its msLeft.
//   WI-4 IN TOWN: lit, an apply while the hero hunts answers hunt_open and journals nothing.
//
// mutant-anchors: supabase/migrations/1077-worn-imbues.sql supabase/functions/hr-accrue/hunt-settle.js src/core/combat-sim.js
// ci-step: db-replay | Worn imbuements - the read's projection, both paths with a run-out mid-window, applied in town only (1077)
// ci-run: node tests/worn-imbues-db.mjs
// ci-run: node tools/mutant-gate.mjs node tests/worn-imbues-db.mjs --mutate
import { isMain } from './_is-main.mjs';
import { bootReplay, closeReplays } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { plant } from './hunt-core/fixtures/h1.js';
import { decodeStored } from '../src/core/hunt/world-state.js';

const GROUND = 'hasks_ford';
const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const HELD = 570;
/* the hunt: 270 s, three windows closed (the 90 s flush), nine viewed (30 s). The Edge runs out inside the closed hunt's second window
   [90, 180) and the viewed hunt's fourth [90, 120): an Edge played to its window's end would fight 60 s longer closed than viewed */
const SPAN_MS = 270000;
const RUN_MS = 90037;
/* THE LOUD EDGE (the header): the size planted on WI-2's edge, every door alike */
const LOUD = Object.freeze([['src/data/imbue-rules.js', '  steps: 2,', '  steps: 40,'], ['src/data/power-ledger.js', '  consumableStepsMax: 6,', '  consumableStepsMax: 120,']]);
const LONG_MS = 72000000;
/* the play-ground's Level 60 kit (tests/hunt-core/fixtures/play-ground.mjs kitFor): a tank, then three hammers; the second hero's head is
   bare, so its Life Leech row has no piece to sit on */
const TANK = Object.freeze({ weapon: 'mithril_sword', shield: 'coppercap_shield', body: 'mithril_platebody', helmet: 'steel_helm' });
const HAMMER = Object.freeze({ weapon: 'mithril_warhammer', shield: null, body: 'mithril_platebody', helmet: 'steel_helm' });
const gearOf = (i) => (i === 0 ? TANK : i === 1 ? { ...HAMMER, helmet: null } : HAMMER);
const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
const exec = (db) => async (text, params) => { await db.exec('set role hr_engine'); try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); } };

/* the held step and the stance (danger-db's planWith), the worn rows, and the switch as the four enters */
const fixture = ({ lit }) => async ({ db, uids, asUser, one: q, idem: id }) => {
  for (const uid of uids) {
    await db.query('insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held) values ($1, 0, $2, 0, $3) on conflict (user_id, slot, hunt_id) do update set danger_held = excluded.danger_held', [uid, GROUND, HELD]);
  }
  await asUser(uids[0]);
  const r = await q(db, 'select public.hr_hunt_risk_set(0, $1, $2::uuid)', ['steady', id()]);
  if (!r || r.ok !== true) throw new Error('the stance was refused: ' + JSON.stringify(r).slice(0, 200));
  await db.query(`insert into public.hero_worn_imbue (user_id, slot, equip_slot, imbue_id, band, quality, ms_left) values
      ($1, 0, 'weapon', 'brute_edge', 70, 'plain', $4), ($1, 0, 'body', 'fire_ward', 45, 'plain', $5), ($1, 0, 'helmet', 'life_leech', 50, 'plain', $5),
      ($2, 0, 'weapon', 'brute_edge', 70, 'plain', $4), ($2, 0, 'helmet', 'life_leech', 50, 'plain', $5),
      ($3, 0, 'weapon', 'brute_edge', 70, 'plain', $4), ($3, 0, 'helmet', 'brute_edge', 70, 'plain', $5),
      ($6, 0, 'weapon', 'brute_edge', 70, 'plain', $4)`, [uids[0], uids[1], uids[2], RUN_MS, LONG_MS, uids[3]]);
  await db.query("update public.hr_flags set enabled = $1 where key = 'imbuements'", [lit === true]);
};

const EVIDENCE = [];
async function door(db, which, o = {}) {
  const windowMs = which === 'viewed' ? 30000 : 90000;
  const windows = SPAN_MS / windowMs - 1;
  const run = await prepare({ heroes: 4, windows, windowMs, hunt: GROUND, door: which, db, level: 60, anchorMs: ANCHOR, gear: gearOf,
    edgeRoot: o.edgeRoot, beforeEnter: fixture(o) });
  if (o.enterOnly) return { run, db, users: run.users };
  await run.warm();
  for (let w = 2; w <= windows + 1; w++) await run.step(w);
  const inst = (await db.query('select id, refusals, world::text as world, ceil(extract(epoch from settled_to) * 1000)::bigint::text as to_ms from public.hunt_instances where hunt_id = $1', [GROUND])).rows[0];
  return { run, db, inst, users: run.users, evidence: which === 'viewed' ? await run.evidence() : null };
}

/* each seat's bag, Level XP, worn rows and its hunt's tally (kills, and the damage it dealt, took and healed: the stored world is cut at
   a pull's boundary, where a blow that landed one HP more leaves no trace, so the tally is what shows an imbuement played): one text */
const stateOf = async (db) => JSON.stringify((await db.query(`select s.seat, p.level_xp::text as xp,
      (select coalesce(jsonb_agg(jsonb_build_array(i.item_id, i.qty::text) order by i.item_id), '[]'::jsonb) from public.player_inventory i where i.user_id = s.user_id and i.slot = s.slot) as bag,
      (select coalesce(jsonb_agg(jsonb_build_array(w.equip_slot, w.imbue_id, w.ms_left::text) order by w.equip_slot), '[]'::jsonb) from public.hero_worn_imbue w where w.user_id = s.user_id and w.slot = s.slot) as worn,
      (select jsonb_build_array(t.kills::text, t.dealt, t.taken, t.healed) from public.hunt_session_tally t where t.session_id = s.id) as tally
    from public.hunt_sessions s join public.player_state p on p.user_id = s.user_id and p.slot = s.slot
   where s.hunt_id = $1 order by s.seat`, [GROUND])).rows);
/* the same, less the worn rows (a dark hunt's timer never moved them): what the fight did */
const fightOf = (text) => JSON.stringify(JSON.parse(text).map(({ worn, ...rest }) => rest));
const wornOf = async (db, uid) => JSON.stringify((await db.query(`select equip_slot, imbue_id, ms_left::text as ms from public.hero_worn_imbue where user_id = $1 and slot = 0 order by equip_slot`, [uid])).rows);

async function dark(boot) {
  const problems = [];
  const r = await door((await boot()).db, 'fire', { lit: false });
  if (Number(r.inst.refusals) !== 0) problems.push('WI-1 ' + r.inst.refusals + ' window(s) refused');
  const read = await one(r.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [r.users[0]]);
  if (!read || read.open !== true || read.members.length !== 4) return [...problems, 'WI-1 CONTROL: the hunt is not open with four (' + JSON.stringify(read).slice(0, 120) + ')'];
  for (const m of read.members) if (!Object.prototype.hasOwnProperty.call(m, 'worn_imbues') || m.worn_imbues !== null) problems.push('WI-1 a dark read hands ' + JSON.stringify(m.worn_imbues));
  const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
  const M = await H.loadEdge(H.ROOT);
  const plan = await M.HS.readHuntSettle({ exec: exec(r.db), user: r.users[0], slot: 0, atMs: ANCHOR + SPAN_MS + 90000 }, 'tick');
  if (plan.answer) problems.push('WI-1 CONTROL: no plan (' + plan.answer.reason + ')');
  else for (const m of plan.members) if (m.hero.wornImbues) problems.push('WI-1 a dark plan hands ' + m.key + ' ' + JSON.stringify(m.hero.wornImbues));
  const worn = await wornOf(r.db, r.users[0]);
  const want = JSON.stringify([{ equip_slot: 'body', imbue_id: 'fire_ward', ms: String(LONG_MS) }, { equip_slot: 'helmet', imbue_id: 'life_leech', ms: String(LONG_MS) },
    { equip_slot: 'weapon', imbue_id: 'brute_edge', ms: String(RUN_MS) }]);
  if (worn !== want) problems.push('WI-1 a dark hunt moved the timer: ' + worn);
  /* WI-4: lit now, the leader still hunting: the apply is refused hunt_open and journals nothing */
  await r.db.query("update public.hr_flags set enabled = true where key = 'imbuements'");
  await r.db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 1) on conflict (user_id, slot, item_id) do update set qty = excluded.qty', [r.users[0], 'imbue_brute_edge']);
  const rows = async () => Number(await one(r.db, 'select count(*) from public.player_ledger where user_id = $1', [r.users[0]]));
  const before = await rows();
  await r.db.query('begin');
  try {
    await r.db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [r.users[0]]);
    const fee = Number(await one(r.db, "select public.hr_imbue_fee(public.hr_worn_level($1::uuid, 0, 'weapon'), public.hr_level_of($1::uuid, 0))", [r.users[0]]));
    const a = await one(r.db, "select public.hr_imbue_apply(0, 'weapon', 'brute_edge', $1::bigint, $2::uuid)", [fee, crypto.randomUUID()]);
    if (!a || a.error !== 'hunt_open' || !a.session) problems.push('WI-4 an apply while hunting answered ' + JSON.stringify(a).slice(0, 200));
    EVIDENCE.push('WI-4 an apply mid-hunt answered ' + (a && a.error));
    await r.db.query('commit');
  } catch (e) { await r.db.query('rollback'); throw e; }
  if (await rows() !== before || await wornOf(r.db, r.users[0]) !== want) problems.push('WI-4 a refused apply journalled a row or moved a worn row');
  EVIDENCE.push('WI-1 dark: every read worn_imbues null, the plan wears none, the rows after 270 s ' + worn);
  return problems;
}

async function projection(boot) {
  const problems = [];
  const r = await door((await boot()).db, 'pieces', { lit: true, enterOnly: true });
  const read = await one(r.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [r.users[0]]);
  if (!read || read.open !== true || read.members.length !== 4) return ['WI-3 CONTROL: the hunt is not open with four (' + JSON.stringify(read).slice(0, 120) + ')'];
  const lead = [{ id: 'fire_ward', band: 45, msLeft: LONG_MS }, { id: 'life_leech', band: 50, msLeft: LONG_MS }, { id: 'brute_edge', band: 70, msLeft: RUN_MS }];
  /* every other hero: its Edge alone (the second's Leech sits on a bare head, the third's second Edge in its helmet) */
  const edgeOnly = [{ id: 'brute_edge', band: 70, msLeft: RUN_MS }];
  for (const m of read.members) {
    const want = JSON.stringify(m.user === r.users[0] ? lead : edgeOnly);
    if (JSON.stringify(m.worn_imbues) !== want) problems.push('WI-3 the read hands ' + (m.user === r.users[0] ? 'the leader' : 'seat ' + m.seat) + ' ' + JSON.stringify(m.worn_imbues));
  }
  const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
  const M = await H.loadEdge(H.ROOT);
  const plan = await M.HS.readHuntSettle({ exec: exec(r.db), user: r.users[0], slot: 0, atMs: ANCHOR + 90000 }, 'tick');
  if (plan.answer) return [...problems, 'WI-3 CONTROL: no plan (' + plan.answer.reason + ')'];
  const until = (ms) => ANCHOR + ms;
  for (const m of plan.members) {
    const edge = { id: 'brute_edge', band: 70, kind: 'edge', untilMs: until(RUN_MS) };
    const want = JSON.stringify(m.user === r.users[0] ? [{ id: 'fire_ward', band: 45, kind: 'ward', untilMs: until(LONG_MS) }, { id: 'life_leech', band: 50, kind: 'leech', untilMs: until(LONG_MS) },
      edge] : [edge]);
    if (JSON.stringify(m.hero.wornImbues || null) !== want) problems.push('WI-3 the plan hands ' + m.key + ' ' + JSON.stringify(m.hero.wornImbues || null));
  }
  EVIDENCE.push('WI-3 the read hands the leader ' + JSON.stringify(lead.map((x) => x.id)) + ' and the others their Edge alone; the plan to ' + until(RUN_MS) + ' for the Edge');
  return problems;
}

async function bothPaths(boot, o = {}) {
  const problems = [];
  const edge = plant([...LOUD, ...(o.edits || [])], ['supabase/functions/hr-accrue']);
  try {
    const closed = await door((await boot()).db, 'fire', { lit: true, edgeRoot: edge && edge.root });
    const viewed = await door((await boot()).db, 'viewed', { lit: true, edgeRoot: edge && edge.root });
    const off = await door((await boot()).db, 'fire', { lit: false, edgeRoot: edge && edge.root });
    for (const [name, r] of [['browser closed', closed], ['hunt viewed', viewed], ['dark', off]]) {
      if (Number(r.inst.refusals) !== 0) problems.push('WI-2 ' + name + ': ' + r.inst.refusals + ' window(s) refused');
      if (Number(r.inst.to_ms) !== ANCHOR + SPAN_MS) problems.push('WI-2 CONTROL: ' + name + ' settled to ' + r.inst.to_ms + ', want ' + (ANCHOR + SPAN_MS));
    }
    const a = await stateOf(closed.db), b = await stateOf(viewed.db);
    if (closed.inst.world !== viewed.inst.world) problems.push('WI-2 the doors stored different worlds (the Edge ran out on another boundary)');
    if (a !== b) problems.push('WI-2 the doors stored different heroes:\n      closed ' + a.slice(0, 400) + '\n      viewed ' + b.slice(0, 400));
    /* the imbuements played: the lit fight is not the dark one (the world, or what each hero dealt, took, healed, killed and found) */
    const fa = fightOf(a), fd = fightOf(await stateOf(off.db));
    const played = closed.inst.world !== off.inst.world || fa !== fd;
    if (!played) problems.push('WI-2 the imbuements changed nothing: the lit hunt stored the dark hunt\'s world and fight');
    if (!decodeStored(JSON.parse(closed.inst.world)).risk) problems.push('WI-2 CONTROL: the stored world is not on the Danger scale');
    if (process.env.WI_TRACE) console.log('  . lit ', fa.slice(0, 600), '\n  . dark', fd.slice(0, 600));
    /* the timer: the Edge spent and gone on both doors, the Ward and the Leech 270 s shorter */
    const want = JSON.stringify([{ equip_slot: 'body', imbue_id: 'fire_ward', ms: String(LONG_MS - SPAN_MS) }, { equip_slot: 'helmet', imbue_id: 'life_leech', ms: String(LONG_MS - SPAN_MS) }]);
    for (const [name, r] of [['closed', closed], ['viewed', viewed]]) {
      const got = await wornOf(r.db, r.users[0]);
      if (got !== want) problems.push('WI-2 the ' + name + ' leader\'s worn rows after the hunt are ' + got);
    }
    /* every live start point the viewer was handed: the Edge to the one instant, while it stands, then gone */
    const lives = (viewed.evidence.answers || []).map((x) => x.hunt_live).filter(Boolean);
    let carried = 0, after = 0;
    for (const live of lives) {
      const self = live.members.find((m) => m.self);
      const edgeOn = ((self && self.hero && self.hero.wornImbues) || []).find((w) => w.id === 'brute_edge');
      const at = Number(live.instance.settled_to_ms);
      if (at < ANCHOR + RUN_MS) {
        if (!edgeOn || edgeOn.untilMs !== ANCHOR + RUN_MS) problems.push('WI-2 a live start point at +' + (at - ANCHOR) + ' ms carries the Edge as ' + JSON.stringify(edgeOn || null));
        else carried++;
      } else if (edgeOn) problems.push('WI-2 a live start point at +' + (at - ANCHOR) + ' ms still carries the spent Edge');
      else after++;
    }
    if (!carried || !after) problems.push('WI-2 CONTROL: the viewer was handed ' + carried + ' start point(s) with the Edge standing and ' + after + ' after it ran out (want both)');
    EVIDENCE.push('WI-2 lit: doors ' + (closed.inst.world === viewed.inst.world && a === b ? 'store one world and the same heroes' : 'DIFFER') + ', '
      + (played ? 'a different' : 'the SAME') + ' fight from dark (world ' + (closed.inst.world === off.inst.world ? 'equal' : 'differs') + ', tallies ' + (fa === fd ? 'equal' : 'differ') + '); the leader after 270 s ' + await wornOf(closed.db, closed.users[0])
      + '; live start points ' + carried + ' with the Edge to +' + RUN_MS + ' ms, ' + after + ' after');
  } finally { if (edge) edge.done(); }
  return problems;
}

/* --mutate: a SQL defect planted in a replayed function body, or an edge or engine defect planted on a copy of the edge */
const MUTANTS = [
  { name: 'the projection ignores the switch', fn: 'public.hr_worn_imbues_of(uuid,integer)',
    find: "if not public.hr_flag_on('imbuements') then return null; end if;", repl: 'if false then return null; end if;', want: /^WI-1/, test: dark },
  { name: 'an apply mid-hunt is let through', fn: 'public.hr_imbue_apply(integer,text,text,bigint,uuid)',
    find: '  if v_s.id is not null then\n', repl: '  if false then\n', want: /^WI-4/, test: dark },
  { name: 'a row on a bare slot plays', fn: 'public.hr_worn_imbues_of(uuid,integer)',
    find: '            join public.player_equipment e on e.user_id = w.user_id and e.slot = w.slot and e.equip_slot = w.equip_slot\n', repl: '', want: /^WI-3/, test: projection },
  { name: 'a row in another kind\'s slot plays', fn: 'public.hr_worn_imbues_of(uuid,integer)',
    find: 'on r.imbue_id = w.imbue_id and r.equip_slot = w.equip_slot', repl: 'on r.imbue_id = w.imbue_id', want: /^WI-3/, test: projection },
  { name: 'the read hands no worn imbuements', fn: 'public.hr_hunt_instance_read(uuid,integer)',
    find: "'worn_imbues', public.hr_worn_imbues_of(h.user_id, h.slot),", repl: "'worn_imbues', null::jsonb,", want: /^WI-3/, test: projection },
  { name: 'the edge never hands them to the hero', edits: [['supabase/functions/hr-accrue/hunt-settle.js', 'wornImbues: m._wornImbues, readAtMs: m._readAtMs,', 'wornImbues: null, readAtMs: m._readAtMs,']], want: /^WI-2/, test: bothPaths },
  { name: 'the edge hands no read instant (each plays to its window\'s end)', edits: [['supabase/functions/hr-accrue/hunt-settle.js', 'wornImbues: m._wornImbues, readAtMs: m._readAtMs,', 'wornImbues: m._wornImbues, readAtMs: null,']], want: /^WI-2/, test: bothPaths },
  { name: 'the fight never reads the run-out', edits: [['src/core/combat-sim.js', 'const imb = imbuesAt(m.hero.wornImbues, atMs);', 'const imb = imbuesAt(m.hero.wornImbues, NaN);']], want: /^WI-2/, test: bothPaths },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    for (const m of MUTANTS) {
      const boot = async () => {
        const b = await bootReplay();
        if (m.fn) {
          const def = await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn]);
          if (!def.replace(/\r/g, '').includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 60)));
          await b.db.exec(def.replace(/\r/g, '').replace(m.find, () => m.repl));
        }
        return b;
      };
      let got = [];
      try { got = await m.test(boot, { edits: m.edits || [] }); } catch (e) { got = [(/HARNESS/.test(String(e && e.message)) ? '' : 'THREW ') + String(e && e.message).slice(0, 200)]; }
      await closeReplays();
      if (got.some((p) => /HARNESS/.test(p))) { console.log('  HARNESS ' + m.name + ': ' + got[0]); process.exitCode = 2; return; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got[0] || 'every check held').slice(0, 160));
    }
    console.log(escaped ? 'worn-imbues-db --mutate: ' + escaped + ' ESCAPED' : 'worn-imbues-db --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const boot = () => bootReplay();
  /* one case's replays at a time (an unclosed replay is ~300 MB) */
  const problems = [];
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  for (const c of [dark, projection, bothPaths].filter((f) => !only || f.name === only)) { problems.push(...await c(boot)); await closeReplays(); }
  for (const e of EVIDENCE) console.log('  ' + e);
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'worn-imbues-db: ' + problems.length + ' FAILED' : 'worn-imbues-db: green (dark, the projection, both paths with a run-out mid-window, applied in town only)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
