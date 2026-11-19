#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tower-climb.mjs — A BURNING TOWER CLIMB PLAYS FLOOR AFTER FLOOR ON THE ONE ENGINE, BOTH PATHS, AND THE SERVER RE-PROVES EVERY FLOOR
//   (lane/c-tower-climb; Tyler 2026-11-14, the board's "2026-11-14 The Burning Tower" §2-§4; src/data/tower.js, src/core/hunt/tower.js,
//   supabase/migrations/2027-04-24-tower-climb.sql). On the replayed chain with the shipped engine, BOTH PATHS (CLAUDE.md §4): the
//   browser closed (the world tick, tick.js runTick) and the hunt viewed (the player's settle, hunt-settle.js settleHunt).
//
//   node tests/tower-climb.mjs              the guard
//   node tests/tower-climb.mjs --arm=doors  one arm
//   node tests/tower-climb.mjs --mutate     every planted defect must turn its arm red (--mutant=<part of a name>)
//
// mutant-anchors: src/core/hunt/tower.js, src/data/tower.js, src/core/hunt-rewards.js, src/core/hunt/xp-share.js, src/core/combat-sim.js,
//   supabase/migrations/2027-04-24-tower-climb.sql, supabase/migrations/2027-05-03-tower-arm.sql
//
//   TC-ROOM    the room: floor F's five at Level F (the stat formula), a Keeper on every landing at the boss role and no second of his kind,
//              the same room every read (no dice), a floor past the top playing the top's rows; past the heat's floor (src/data/tower.js
//              `heat`) the blows x the floor's heat and HP, defense and XP the formula's still; the rows pay no coin and drop nothing; the
//              server's per-floor bound (hr_tower_floors) is the engine's own, row for row
//   TC-CURVE   THE CLIMB GETS HARDER EVERY BAND (lane/d-tower-curve 2026-11-19; Andy: "Everything between floor 100 > 170 felt the same"):
//              past the heat's floor every band of ten floors hits at least 12% harder than the band below it (its rooms' summed max hits;
//              the plain formula's own step there is 4-9%); and on the real engine a played Level 74 four climbing from floor 91 (6 climbs)
//              sees its typical low (the median, over a band's floors, of its lowest seat's low HP) never rise more than 3 points band to
//              band, and the band 30 floors past 101-110 at least 15 points lower, or most climbs over before it (the plain formula: 4-9)
//   TC-ENGINE  the engine alone: a climb clears floors one after another from the server's floor, ends `died` with no XP lost, pays no coin,
//              no item and no Bestiary or task count, pays Level XP at the mode's share of the kill (session-modes.js xpPm) and every skill route at the same
//              share; a room that stood its time ends the climb `floor_time` for everyone in it
//   TC-DOORS   one hero from floor 1, the browser closed and the hunt viewed: the same floors land (the run's top, its floors and kills),
//              the hero's best (the record its checkpoints are read from), the end `died` with no death_xp row and the
//              Blessings untouched, no coin credited, no item but one key a landing (the chest lane), no ev: count; the run's end stamped and journalled once; the two doors
//              land the same rows
//   TC-AFTER   WHEN THE HUNT ENDS after a climb (designer 2026-11-18: one plan, shown at the Tower's door): the hero's choice, set by the real
//              verb, is frozen on the climb's row and its automatic end runs it as a ground hunt's, both doors, the same rows: the yard at
//              the server's fee (one fee row, one plan row), or waiting in town with no gold moved
//   TC-FORGED  the settle refuses a forged window: a skipped floor, a repeated floor, a floor added past what the engine cleared, a floor
//              claimed off the Tower, coin, an item, a Bestiary count, inflated Level XP; the untampered window lands (the control)
//   TC-START   the one door: off while the switch is off, `tower_only` through the ordinary door, an unreached checkpoint refused with the
//              list, a checkpoint the hero reached opened on the floor after it, a replayed key answered once
//   TC-CHECKPOINT  Tyler 2026-11-16 (the 60-below week is gone): a hero of best 50 picks landing 30 and climbs from 31; no pick is the best
//              (51); a forged landing 60 and a landing 35 (no checkpoint) are refused with the list and open nothing; a PARTY of best 50 and
//              best 20, started by its leader, climbs from 21 (the highest landing both reached), one run a seat, every seat or none: a
//              pick of 30 opens nobody; a seat that isn't the leader starts nothing
//   TC-ARM     2027-05-03-tower-arm.sql: the switch is OFF on the chain up to the file before it and ON for everyone (a stranger included)
//              on the whole chain; on the chain before it, with another switch moved, the file turns it on and moves no other switch row; a
//              second apply moves nothing, the schema included; 2027-04-24-tower-climb.sql applied again over the armed row re-applies (its
//              probe puts the switch back as it found it) and leaves it armed
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { bootReplay, chainFiles, inventory } from './schema-replay.mjs';

const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const { one, q, makeExec } = H;
const ROOT = H.ROOT;
const UID = H.UIDS[0];
const FN = join('supabase', 'functions', 'hr-accrue');
const SPAN = 20 * 60000;
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const rewind = (db) => db.query(`select setval('public.hr_test_uuid_seq', 1000, false)`);
const idem = () => crypto.randomUUID();

/* The engine's own instances (src/core imports src/data with the build's ?v=), the play fixture, and the edge. */
async function load(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const { loadPlay } = await import(u('tests/hunt-core/fixtures/play-ground.mjs'));
  return { ...(await H.loadEdge(root)), T: await import(u('src/core/hunt/tower.js') + V), TD: await import(u('src/data/tower.js') + V),
    MON: await import(u('src/data/monsters.js') + V), BS: await import(u('src/data/balance-sheet.js') + V), CB: await import(u('src/core/combat.js') + V),
    G: await import(u('src/data/hunt-grounds.js') + V), SMD: await import(u('src/data/session-modes.js') + V), CH: await import(u('src/data/chests.js') + V), HG: await import(u('src/core/hunt-ground.js')),
    P: await loadPlay(root), root };
}

/* ── TC-ROOM ──────────────────────────────────────────────────────────────── */
async function roomArm(db, M) {
  const bad = [];
  const { towerRoom, towerMonsters, towerXpMax, towerLevelOf } = M.T;
  const R = M.TD.TOWER_RULES;
  /* THE HEAT, derived here from the data row alone (the oracle): a whole permille a floor past heat.from, compounding, rounded each step */
  const heatOf = (F) => { let pm = 1000; for (let f = R.heat.from + 1; f <= towerLevelOf(F); f++) pm = Math.round((pm * (1000 + R.heat.perFloorPm)) / 1000); return pm / 1000; };
  const hot = (F) => { const k = heatOf(F), S = M.BS.STAT_FORMULA; return k === 1 ? undefined : { formula: { ...S, blow: { ...S.blow, lo: S.blow.lo * k, hi: S.blow.hi * k } } }; };
  if (!(heatOf(R.heat.from + 10) > 1)) bad.push(`TC-ROOM the heat warms nothing past floor ${R.heat.from} (${JSON.stringify(R.heat)})`);
  for (const F of [1, 9, 10, 20, 45, 50, 100, 101, 110, 147, R.floorTop, R.floorTop + 70]) {
    const room = towerRoom(F), tab = towerMonsters(F), L = towerLevelOf(F);
    if (room.monsters.length !== R.roomSize) bad.push(`TC-ROOM floor ${F} holds ${room.monsters.length}, not ${R.roomSize}`);
    if (JSON.stringify(towerRoom(F)) !== JSON.stringify(room)) bad.push(`TC-ROOM floor ${F}'s room moved between two reads`);
    const landing = F % R.landingEvery === 0;
    if (landing !== (room.keeper !== null) || (landing && room.monsters[0] !== room.keeper)) bad.push(`TC-ROOM floor ${F}: the Keeper is ${room.keeper} (a landing: ${landing})`);
    if (room.keeper && room.monsters.slice(1).includes(room.keeper)) bad.push(`TC-ROOM floor ${F}: the Keeper's kind ${room.keeper} stands in another slot too`);
    for (const id of room.monsters) {
      const row = tab[id], base = M.MON.MONSTERS[id];
      if (!row || row.level !== L) { bad.push(`TC-ROOM floor ${F}: ${id} is not at Level ${L}`); continue; }
      if (base.boss === true) bad.push(`TC-ROOM floor ${F}: a ground's boss ${id} stands in the Tower`);
      if (!(row.gp[0] === 0 && row.gp[1] === 0) || row.drops.length) bad.push(`TC-ROOM floor ${F}: ${id} pays coin ${row.gp} or drops ${row.drops.length}`);
      const role = id === room.keeper ? 'boss' : Object.values(M.BS.GROUND_ROSTER).map((r) => r[id]).find(Boolean);
      const spec = { level: L, role, tier: base.tier, floor: L, fit: R.fit, ground: R.hunt };
      const s = M.BS.formulaStats(spec), h = M.BS.formulaStats(spec, hot(F));
      /* HP, defense and XP are the plain formula's on every floor (the heat moves blows only); the blow is the heated formula's */
      if (row.hp !== s.hp || row.def !== s.def || row.xp !== s.xp) bad.push(`TC-ROOM floor ${F}: ${id} is not the formula's ${role} at Level ${L}`);
      if (row.atk !== h.atk || row.baseAcc !== h.baseAcc) bad.push(`TC-ROOM floor ${F}: ${id} hits for ${row.atk} at ${row.baseAcc}, not the formula's x the heat ${heatOf(F)} (${h.atk} at ${h.baseAcc})`);
      if (row.xp > towerXpMax(F)) bad.push(`TC-ROOM floor ${F}: ${id} pays ${row.xp}, over the floor's bound ${towerXpMax(F)}`);
    }
  }
  const srv = await q(db, 'select floor, level, xp_max from public.hr_tower_floors order by floor');
  if (srv.length !== R.floorTop) bad.push(`TC-ROOM the server holds ${srv.length} floors, not ${R.floorTop}`);
  for (const r of srv) if (Number(r.xp_max) !== towerXpMax(r.floor) || Number(r.level) !== towerLevelOf(r.floor)) { bad.push(`TC-ROOM the server's floor ${r.floor} bound is not the engine's`); break; }
  const rules = (await q(db, 'select * from public.hr_tower_rules'))[0] || {};
  if (rules.hunt_id !== R.hunt || Number(rules.stair_ms) !== R.stairMs || Number(rules.room_size) !== R.roomSize || Number(rules.landing_every) !== R.landingEvery
      || 'week_back' in rules) bad.push('TC-ROOM hr_tower_rules is not src/data/tower.js');
  return bad;
}

/* ── TC-ENGINE ────────────────────────────────────────────────────────────── */
function climbOf(M, o) {
  return M.P.run(M.TD.TOWER_RULES.hunt, o.level, o.roles || ['tank'], { ground: M.G.TOWER_GROUNDS[M.TD.TOWER_RULES.hunt], sessionMode: o.mode || 'tower',
    tower: { floor: o.floor || 1 }, spanMs: o.spanMs || SPAN, windowMs: o.windowMs || 10000, dropEnded: true, ...(o.onWindow ? { onWindow: o.onWindow } : {}) });
}
async function engineArm(db, M) {
  const bad = [];
  const deltas = [];
  /* 60 s windows: several floors stand and fall inside one window, so the engine's own stair moves the floor, not only the server's read
     at each window's start (a 10 s window holds about one floor and hides a stair that never climbs) */
  const r = climbOf(M, { level: 10, windowMs: 60000, onWindow: (out) => { for (const p of out.members) deltas.push(p); } });
  const perWindow = Math.max(0, ...deltas.map((p) => ((p.hunt.tower && p.hunt.tower.floors) || []).length));
  if (perWindow < 2) bad.push(`TC-ENGINE CONTROL: no window cleared two floors (the most was ${perWindow}), so the engine's stair is unproven`);
  const floors = (r.tower && r.tower.floors[M.P.memberKey('tank', 0)]) || [];
  if (floors.length < 10) bad.push(`TC-ENGINE CONTROL: a Level 10 tank cleared ${floors.length} floors (want a landing)`);
  if (floors.some((f, i) => f !== i + 1)) bad.push(`TC-ENGINE the floors cleared are not 1, 2, 3, ... from the server's floor: ${floors.slice(0, 20)}`);
  if (!r.ended.some((e) => / died$/.test(e))) bad.push(`TC-ENGINE the climb ended ${JSON.stringify(r.ended)}, not died`);
  if (r.totals.coin || Object.keys(r.items).length) bad.push(`TC-ENGINE the Tower paid coin ${r.totals.coin} or items ${JSON.stringify(r.items)}`);
  for (const p of deltas) {
    const d = p.delta, h = p.hunt;
    if (d.gold || d.items || d.hearthfind || (d.journal.meta && d.journal.meta.km)) { bad.push('TC-ENGINE a window paid ' + JSON.stringify({ gold: d.gold, items: d.items, km: d.journal.meta.km })); break; }
    if ((d.progress || []).some((o) => String(o.key).startsWith('ev:'))) { bad.push('TC-ENGINE a window counted ' + JSON.stringify(d.progress.filter((o) => String(o.key).startsWith('ev:')))); break; }
    if ((h.death_xp || []).some((x) => Object.keys(x).length)) { bad.push('TC-ENGINE a death in the Tower was priced ' + JSON.stringify(h.death_xp)); break; }
  }
  /* THE MODE'S SHARE: the split pays the mode's xpPm of the kill (one hero: the Tower's flat 1000 cell, no solo boost); a skill route the same share */
  const pm = M.SMD.SESSION_MODES.tower.xpPm;
  const hero = { id: 1, side: 'hero', alive: true, role: 'tank', heroLv: 10 };
  const evs = [];
  const sc = { atMs: 0, emit: (e) => evs.push(e) };
  M.XS.shareKillXp({ world: { units: [hero], xpGroup: null }, ground: M.G.TOWER_GROUNDS[M.TD.TOWER_RULES.hunt], xpPm: pm }, { t: 9, u: 1, xp: 1000 }, sc);
  const x = evs.find((e) => e.type === 'xp');
  if (!x || x.amount !== Math.floor(1000 * pm / 1000)) bad.push(`TC-ENGINE a 1000 XP kill paid one hero alone ${x && x.amount} in the Tower, not ${Math.floor(1000 * pm / 1000)}`);
  const four = [1, 2, 3, 4].map((id) => ({ ...hero, id, role: ['tank', 'healer', 'ranger', 'mage'][id - 1] }));
  const evs4 = [];
  M.XS.shareKillXp({ world: { units: four, xpGroup: null }, ground: M.G.TOWER_GROUNDS[M.TD.TOWER_RULES.hunt], xpPm: pm }, { t: 9, u: 1, xp: 1000 }, { atMs: 0, emit: (e) => evs4.push(e) });
  const head = Math.floor(1000 * pm / 1000 / 4 * M.TD.TOWER_PARTY_XP[4] / 1000);
  if (!evs4.filter((e) => e.type === 'xp').every((e) => e.amount === head)) bad.push(`TC-ENGINE a four paid ${evs4.filter((e) => e.type === 'xp').map((e) => e.amount)} a head, not the flat row's ${head}`);
  const gained = {};
  M.HR.rewardSwing(new Map([[1, { state: { skills: {} }, hs: { tally: { kills: 0 } }, family: 'sword', armoured: false,
    fx: { addXp: (k, n) => { gained[k] = (gained[k] || 0) + n; } } }]]), [{ type: 'dmg', u: 1, t: 2, amount: 100, atMs: 0 }],
    { units: [{ id: 2, side: 'mon', kind: 'rat', alive: true }] }, { rng: null, pay: M.SMD.sessionPayOf('tower') });
  const melee = Object.values(gained)[0];
  const full = {};
  M.HR.rewardSwing(new Map([[1, { state: { skills: {} }, hs: { tally: { kills: 0 } }, family: 'sword', armoured: false,
    fx: { addXp: (k, n) => { full[k] = (full[k] || 0) + n; } } }]]), [{ type: 'dmg', u: 1, t: 2, amount: 100, atMs: 0 }],
    { units: [{ id: 2, side: 'mon', kind: 'rat', alive: true }] }, { rng: null });
  if (!(melee > 0) || Math.abs(melee - Object.values(full)[0] * pm / 1000) > 1e-9) bad.push(`TC-ENGINE a blow's skill XP in the Tower is ${melee}, not ${pm} permille of the hunt's ${Object.values(full)[0]}`);
  /* THE FLOOR'S TIME: a room that has stood its time ends the climb for everyone in it, `floor_time`; the same room unaged plays on */
  const ft = floorTimeRun(M);
  if (ft.control !== null) bad.push(`TC-ENGINE CONTROL: the room unaged ended the climb ${ft.control}`);
  if (ft.aged !== 'floor_time') bad.push(`TC-ENGINE a room that stood ${M.TD.TOWER_RULES.floorLimitMs / 1000} s ended the climb ${ft.aged}, not floor_time`);
  return bad;
}
/* One 4 s window on floor 1 (the room still standing), then the next 4 s twice: as it is, and with the room standing since floorLimitMs + 1 s
   ago (the pocket's respawn instant is the room's: the persisted field tower.js towerEndsAt reads). Answers each window's end reason, or null. */
function floorTimeRun(M) {
  const ground = M.G.TOWER_GROUNDS[M.TD.TOWER_RULES.hunt];
  let world = null, next = 0, member = null;
  M.P.run(M.TD.TOWER_RULES.hunt, 10, ['tank'], { ground, sessionMode: 'tower', tower: { floor: 1 }, spanMs: 4000, windowMs: 4000, dropEnded: true,
    onWindow: (out, members) => { world = out.world; next = out.settledTo; member = members[0]; } });
  if (!world) return { control: 'no world', aged: 'no world' };
  const grid = M.HG.gridOfMap(ground.map);
  const play = (text) => {
    const out = M.AC.accrueHunt({ instance: { id: '00000000-0000-4000-8000-0000000c5e01', nextSwingAtMs: next, world: text }, window: { fromMs: next, toMs: next + 4000 },
      secret: '-4611686018427387904', ground, grid, items: M.P.ITEMS, monsters: M.P.MONSTERS, members: [JSON.parse(JSON.stringify(member))], sessionMode: 'tower', towerFloor: 1 });
    const p = (out.members || [])[0];
    return p && p.hunt.ended ? p.hunt.ended.reason : null;
  };
  const w = JSON.parse(world);
  const at = M.WS.FIELDS.pack.map(([n]) => n).indexOf('respawnAtMs');
  const control = play(world);
  w.p[0][at] = next - M.TD.TOWER_RULES.floorLimitMs - 1000;
  return { control, aged: play(JSON.stringify(w)) };
}

/* ── TC-CURVE ─────────────────────────────────────────────────────────────── */
/* THE CLIMB GETS HARDER EVERY BAND (lane/d-tower-curve, 2026-11-19; src/data/tower.js `heat` says why). Engine only, no database.
   The rows: a band's mean of its rooms' summed max hits (combat.js monsterMaxHit), band over band, for the ten bands past the heat's floor.
   The felt shape: a PLAYED four at Level 74 (tools/balance-sim/cell.mjs profile 'played': the recorded bars, accessories, own stock, the party
   skill line; no player's data) climbs from floor 91, 6 climbs on the real settle, read by tools/balance-sim/tower-curve.mjs bandTable. Measured
   (the board's "2026-11-19 The Tower's curve"): its typical low 77 / 74 / 69 / 64 / 54% from 91-100 to 131-140 (the 101-110 to 131-140 drop
   20 on two seed sets); with no heat 77 / 75 / 72 / 69 / 66 (drop 4 and 9); with the 11-19 monsters +10% and the heat most climbs end at 128-131. */
const CURVE = Object.freeze({ bandStepMin: 1.12, level: 74, party: Object.freeze(['tank', 'bow', 'mage', 'healer']), from: 91, seeds: 6, minutes: 40, riseMax: 3, dropMin: 15 });
async function curveArm(_db, M) {
  const bad = [];
  const R = M.TD.TOWER_RULES, from = R.heat.from, every = R.landingEvery;
  const band = (top) => {
    let s = 0;
    for (let f = top - every + 1; f <= top; f++) { const r = M.T.towerRoom(f), t = M.T.towerMonsters(f); s += r.monsters.reduce((a, id) => a + M.CB.monsterMaxHit(t[id]), 0); }
    return s / every;
  };
  for (let top = from + every; top <= from + 10 * every; top += every) {
    const step = band(top) / band(top - every);
    if (step < CURVE.bandStepMin) { bad.push(`TC-CURVE floors ${top - every + 1}-${top} hit only x${step.toFixed(3)} the band below (want x${CURVE.bandStepMin} or more past floor ${from})`); break; }
  }
  /* the simulator from the same tree as the engine under test (a mutant's tree carries its own copy) */
  const u = (p) => pathToFileURL(join(M.root, p)).href;
  const { loadCellRunner } = await import(u('tools/balance-sim/cell.mjs'));
  const TCV = await import(u('tools/balance-sim/tower-curve.mjs'));
  const climbs = await TCV.measure({ runner: await loadCellRunner(M.root), starts: [CURVE.from], seeds: CURVE.seeds, minutes: CURVE.minutes, party: [...CURVE.party], level: CURVE.level });
  const rows = TCV.bandTable(climbs, CURVE.from + every - 1, CURVE.from + 8 * every - 1);
  const at = (top) => rows.find((r) => r.band === top && r.low !== null && r.reached * 2 >= r.climbs) || null;
  const first = at(from + every);
  if (!first || first.reached !== climbs.length) { bad.push(`TC-CURVE CONTROL: the Level ${CURVE.level} four did not all stand on floors ${from + 1}-${from + every} (${JSON.stringify(rows[1])})`); return bad; }
  const held = rows.filter((r) => at(r.band));
  for (let i = 1; i < held.length; i++) {
    if (held[i].low > held[i - 1].low + CURVE.riseMax) bad.push(`TC-CURVE floors ${held[i].band - every + 1}-${held[i].band} read a typical low of ${held[i].low}%, ${held[i].low - held[i - 1].low} over the band below (want at most +${CURVE.riseMax})`);
  }
  const later = at(from + 4 * every);
  if (later && first.low - later.low < CURVE.dropMin) {
    bad.push(`TC-CURVE floors ${from + 3 * every + 1}-${from + 4 * every} read a typical low of ${later.low}%, only ${first.low - later.low} under ${from + 1}-${from + every}'s ${first.low}% (want ${CURVE.dropMin} or more, or most climbs over by then): ${held.map((r) => r.band + ':' + r.low).join(' ')}`);
  }
  return bad;
}

/* ── THE DATABASE: a climber, and its run through either door ─────────────── */
async function boot() {
  const { db } = await bootReplay();
  await H.pinDice(db);
  return db;
}
async function climber(db, M, o = {}) {
  await rewind(db);
  await H.character(db, M, UID, { level: o.level || 12, inv: {}, gold: 200000 });
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await db.query('update public.hr_tick_config set enabled = true where id');
  await db.query("update public.hr_feature_switches set scope = 'accounts', accounts = array[$1::uuid] where switch_id = 'burning_tower'", [UID]);
  if (o.before) await o.before();
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [UID]);
  const r = await one(db, 'select public.hr_tower_start(0, $1, $2::uuid)', [o.landing === undefined ? 0 : o.landing, idem()]);
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  if (!r || r.ok !== true) throw new Error('hr_tower_start refused: ' + JSON.stringify(r));
  const sid = r.session_id;
  const t = `date_trunc('second', now() - make_interval(mins => ${Number(o.minutesAgo || 25)}))`;
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
  const from = Number(await one(db, `select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1`, [inst]));
  return { sid, inst, from };
}
const VIEWED_AT = (from) => [from + 7001, from + 33333, from + 61234, from + 200001, from + 333333, from + 600000, from + SPAN];
async function drive(db, M, door, h) {
  const exec = makeExec(db);
  const cuts = door === 'closed' ? [h.from + SPAN] : VIEWED_AT(h.from);
  for (const at of cuts) {
    for (let guard = 0; guard < 60; guard++) {
      const s = (await q(db, 'select settled_to, ended_at from public.hunt_sessions where id = $1', [h.sid]))[0];
      if (s.ended_at || Date.parse(s.settled_to) >= at) break;
      if (door === 'closed') {
        await db.query('delete from public.hunt_tick_lease');
        const r = (await M.TK.runTick({ exec, grounds: {}, atMs: at,
          body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts: [{ user_id: UID, slot: 0, session_id: h.sid }] } })).body;
        if (!r.hunts || r.hunts.settled < 1) throw new Error('the world tick settled nothing: ' + JSON.stringify(r.hunts || r).slice(0, 300));
      } else {
        const v = await M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs: at, minWindowMs: 0, grounds: {} });
        if (v.outcome !== 'paid') throw new Error('the player\'s settle answered ' + JSON.stringify({ o: v.outcome, r: v.reason, d: v.body && v.body.detail }).slice(0, 400));
      }
    }
    if ((await q(db, 'select ended_at from public.hunt_sessions where id = $1', [h.sid]))[0].ended_at) break;
  }
}
async function rows(db, h) {
  return one(db, `select jsonb_build_object(
      'run', (select to_jsonb(r) - 'session_id' - 'instance_id' - 'started_at' - 'ended_at' - 'updated_at' from public.tower_runs r where r.session_id = $2),
      'best', (select jsonb_build_array(p.best_floor, p.best_landing) from public.tower_progress p where p.user_id = $1 and p.slot = 0),
      'landings', (select jsonb_agg(f order by f) from public.tower_runs r, generate_series(r.start_floor, coalesce(r.top_floor, 0)) f
                    where r.session_id = $2 and f % (select t.landing_every from public.hr_tower_rules t where t.id) = 0),
      'run_rows', (select count(*) from public.player_ledger where user_id = $1 and intent = 'tower_run'),
      'level_xp', (select level_xp from public.player_state where user_id = $1 and slot = 0),
      'skills', (select jsonb_object_agg(skill_id, xp) from public.player_skills where user_id = $1 and slot = 0 and skill_id in ('melee', 'ranged', 'magic', 'defense')),
      'death_rows', (select count(*) from public.player_ledger where session_id = $2 and intent = 'death_xp'),
      'coin_rows', (select count(*) from public.player_ledger where session_id = $2 and gold > 0),
      'ev', (select count(*) from public.player_progress where user_id = $1 and key like 'ev:%'),
      'items', (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = $1 and slot = 0),
      'end', (select h.end_reason from public.hunt_sessions h where h.id = $2),
      'mode', (select i.session_mode from public.hunt_instances i where i.id = $3))`, [UID, h.sid, h.inst]);
}

/* ── TC-DOORS ─────────────────────────────────────────────────────────────── */
async function doorsArm(db, M) {
  const bad = [];
  const runs = {};
  for (const door of ['closed', 'viewed']) {
    const r = await H.inTx(db, async () => {
      const h = await climber(db, M, {});
      const s0 = await rows(db, h);
      try { await drive(db, M, door, h); } catch (e) { return { err: String(e.message).slice(0, 400) }; }
      return { s0, s1: await rows(db, h) };
    });
    const tag = `TC-DOORS the ${door === 'closed' ? 'browser closed' : 'hunt viewed'}:`;
    if (r.err) { bad.push(`${tag} ${r.err}`); continue; }
    runs[door] = r;
    const { s0, s1 } = r;
    const run = s1.run || {};
    if (s1.mode !== 'tower') bad.push(`${tag} the instance plays ${s1.mode}`);
    if (!(run.top_floor >= 10)) { bad.push(`${tag} CONTROL: the climb reached floor ${run.top_floor} (want a landing): ${JSON.stringify(run)}`); continue; }
    if (run.floors !== run.top_floor - run.start_floor + 1 || run.start_floor !== 1) bad.push(`${tag} the run ${JSON.stringify(run)} is not floors 1 to its top`);
    if (!(run.kills >= (run.floors - 1) * M.TD.TOWER_RULES.roomSize)) bad.push(`${tag} the run cleared ${run.floors} floors on ${run.kills} kills`);
    if (JSON.stringify(s1.best) !== JSON.stringify([run.top_floor, Math.floor(run.top_floor / 10) * 10])) bad.push(`${tag} the best reads ${JSON.stringify(s1.best)} after a climb to ${run.top_floor}`);
    const want = []; for (let l = 10; l <= run.top_floor; l += 10) want.push(l);
    if (JSON.stringify(s1.landings) !== JSON.stringify(want)) bad.push(`${tag} the run crossed landings ${JSON.stringify(s1.landings)}, not ${JSON.stringify(want)}`);
    if (s1.end !== 'died' || run.end_reason !== 'died' || Number(s1.run_rows) !== 1) bad.push(`${tag} the climb ended ${s1.end} (run ${run.end_reason}, ${s1.run_rows} run rows), not died once`);
    if (Number(s1.death_rows) !== 0) bad.push(`${tag} the death journalled ${s1.death_rows} death_xp row(s): a death in the Tower costs nothing`);
    if (!(Number(s1.level_xp) > Number(s0.level_xp))) bad.push(`${tag} the Level XP did not rise (${s0.level_xp} -> ${s1.level_xp})`);
    for (const k of Object.keys(s0.skills || {})) if (Number((s1.skills || {})[k]) < Number(s0.skills[k])) bad.push(`${tag} ${k} fell ${s0.skills[k]} -> ${s1.skills[k]}`);
    if (Number(s1.coin_rows) !== 0) bad.push(`${tag} ${s1.coin_rows} ledger row(s) credited coin`);
    if (Number(s1.ev) !== Number(s0.ev)) bad.push(`${tag} a Bestiary or task count moved (${s0.ev} -> ${s1.ev})`);
    /* the bag moves by the landings' keys alone (2027-04-27-tower-chest.sql hr_tower_key_mint: one key a landing the run cleared, src/data/chests.js keyForLanding) */
    const keyed = { ...(s0.items || {}) };
    for (const l of s1.landings || []) { const kr = M.CH.keyForLanding(l); if (kr) keyed[kr.item] = (keyed[kr.item] || 0) + 1; }
    const sorted = (o) => JSON.stringify(Object.keys(o).sort().map((x) => [x, o[x]]));
    if (sorted(s1.items || {}) !== sorted(keyed)) bad.push(`${tag} the bag moved ${JSON.stringify(s0.items)} -> ${JSON.stringify(s1.items)}, not by one key a landing`);
  }
  if (runs.closed && runs.viewed) {
    const sig = (r) => JSON.stringify([r.s1.run, r.s1.best, r.s1.landings, r.s1.level_xp, r.s1.skills, r.s1.end]);
    if (sig(runs.closed) !== sig(runs.viewed)) bad.push(`TC-DOORS the browser closed lands ${sig(runs.closed).slice(0, 260)}, the hunt viewed ${sig(runs.viewed).slice(0, 260)}`);
  }
  return bad;
}

/* ── TC-AFTER ─────────────────────────────────────────────────────────────── */
/* WHEN THE HUNT ENDS, AFTER A CLIMB (the designer's ruling, 2026-11-18: one plan, shown at the Tower's door, run after a climb too): the
   hero's choice, stored by the real verb before the door, is frozen on the climb's hunt_sessions row (2027-04-25-hunt-itinerary.sql
   hr_hunt_after_freeze, a trigger on every hunt row) and the climb's automatic end runs it as a ground hunt's does (hr_hunt_resume, then
   the minute's sweep for the yard), both doors, the same rows: the yard started at the server's fee (one fee row, one plan row), or waiting
   in town with no gold moved. tests/hunt-sessions-settle.mjs ITINERARY proves the same rows for a ground hunt. */
const fee = async (db) => Number(await one(db, `select public.hr_training_fee(public.hr_skill_level('melee', coalesce((select xp from public.player_skills
    where user_id = $1 and slot = 0 and skill_id = 'melee'), 0)))::text`, [UID]));
const purse = async (db) => Number(await one(db, 'select coalesce((select w.gold from public.account_wallet w where w.user_id = $1), 0)::text', [UID]));
async function afterArm(db, M) {
  const bad = [];
  const CASES = [
    { tag: 'the yard', pick: ['train', 'melee'], want: { state: 'started', active: 'combat:training_yard_melee', ran: 1 } },
    { tag: 'waiting in town', pick: ['wait', null], want: { state: 'waited', why: 'chose_wait', active: 'idle:', ran: 0 } },
  ];
  for (const c of CASES) {
    const lands = {};
    for (const door of ['closed', 'viewed']) {
      const tag = `TC-AFTER ${c.tag}, the ${door === 'closed' ? 'browser closed' : 'hunt viewed'}:`;
      const r = await H.inTx(db, async () => {
        const h = await climber(db, M, { before: async () => {
          await db.query('delete from public.hr_rate_counters');
          await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [UID]);
          const p = await one(db, 'select public.hr_hunt_after_set(0, $1, $2, $3::uuid)', [c.pick[0], c.pick[1], idem()]);
          await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
          await db.query('delete from public.hr_rate_counters');
          if (!p || p.ok !== true) throw new Error('hr_hunt_after_set answered ' + JSON.stringify(p));
        } });
        const frozen = await one(db, `select jsonb_build_object('choice', after_choice, 'skill', after_skill) from public.hunt_sessions where id = $1`, [h.sid]);
        try { await drive(db, M, door, h); } catch (e) { return { err: String(e.message).slice(0, 400) }; }
        const end = await one(db, 'select end_reason from public.hunt_sessions where id = $1', [h.sid]);
        const gold0 = await purse(db);
        await db.query('delete from public.hr_rate_counters');
        const ran = Number(await one(db, 'select public.hr_hunt_after_sweep(50)'));
        const done = await one(db, 'select after_done from public.hunt_sessions where id = $1', [h.sid]);
        const active = await one(db, `select coalesce(active_kind, '') || ':' || coalesce(active_id, '') from public.player_state where user_id = $1 and slot = 0`, [UID]);
        const rows = await one(db, `select jsonb_agg(jsonb_build_object('intent', regexp_replace(l.intent, ':[0-9]+$', ''), 'gold', l.gold,
                                          'meta', l.meta - 'at' - 'session' - 'hunt_session') order by l.id)
                                      from public.player_ledger l where l.user_id = $1
                                       and (l.intent in ('resume', 'after_hunt') or l.intent like 'training_start:%')`, [UID]);
        return { frozen, end, ran, done, active, rows, gold0, gold1: await purse(db), fee: await fee(db) };
      });
      if (r.err) { bad.push(`${tag} ${r.err}`); continue; }
      if (!r.frozen || r.frozen.choice !== c.pick[0] || (r.frozen.skill ?? null) !== c.pick[1]) bad.push(`${tag} the climb froze ${JSON.stringify(r.frozen)}, not the hero's ${JSON.stringify(c.pick)}`);
      if (r.end !== 'died') { bad.push(`${tag} CONTROL: the climb ended ${r.end}, not an automatic end`); continue; }
      const d = r.done || {};
      if (d.state !== c.want.state || (d.why ?? null) !== (c.want.why ?? null)) bad.push(`${tag} the climb's plan came to ${JSON.stringify(r.done)}, wanted ${c.want.state}${c.want.why ? ' / ' + c.want.why : ''}`);
      if (r.active !== c.want.active) bad.push(`${tag} the hero is ${r.active}, not ${c.want.active}`);
      if (r.ran !== c.want.ran) bad.push(`${tag} the sweep ran ${r.ran} hunt(s), not ${c.want.ran}`);
      const fees = (r.rows || []).filter((x) => x.intent === 'training_start:training_yard_melee');
      const outs = (r.rows || []).filter((x) => x.intent === 'after_hunt');
      if (c.want.state === 'started') {
        /* a ground hunt's rows (hunt-sessions-settle.mjs ITINERARY): the server's fee once, the plan's outcome once, the yard's own place */
        if (!(r.fee > 0) || d.fee !== r.fee || d.skill !== 'melee' || d.place !== 'yard' || r.gold1 !== r.gold0 - r.fee) bad.push(`${tag} the yard charged ${d.fee} (purse ${r.gold0} -> ${r.gold1}), not the server's ${r.fee}`);
        if (fees.length !== 1 || Number(fees[0].gold) !== -r.fee || outs.length !== 1) bad.push(`${tag} the fee and the plan's outcome are not journalled once each: ${JSON.stringify(r.rows).slice(0, 300)}`);
      } else if (r.gold1 !== r.gold0 || fees.length || outs.length) bad.push(`${tag} gold or a fee moved with nothing started (${r.gold0} -> ${r.gold1}, ${JSON.stringify(r.rows).slice(0, 200)})`);
      lands[door] = JSON.stringify([r.frozen, r.end, { ...d, at: null, session: null }, r.active, r.rows, r.gold0 - r.gold1]);
    }
    if (lands.closed && lands.viewed && lands.closed !== lands.viewed) bad.push(`TC-AFTER ${c.tag}: the browser closed lands ${lands.closed.slice(0, 240)}, the hunt viewed ${lands.viewed.slice(0, 240)}`);
  }
  return bad;
}

/* ── TC-FORGED ────────────────────────────────────────────────────────────── */
const FORGERIES = [
  ['a skipped floor', 'tower_floor_forged', (m) => { m.hunt.tower.floors = m.hunt.tower.floors.map((f) => f + 1); }],
  ['a repeated floor', 'tower_floor_forged', (m) => { m.hunt.tower.floors = [m.hunt.tower.floors[0], ...m.hunt.tower.floors]; }],
  ['floors past what the engine cleared', /tower_floor_forged|tower_too_fast/, (m) => { const f = m.hunt.tower.floors; for (let i = 0; i < 6; i++) f.push(f[f.length - 1] + 1); }],
  ['coin in the Tower', 'mode_pays', (m) => { m.delta.gold = 500; }],
  ['an item in the Tower', 'mode_pays', (m) => { m.delta.items = { bones: 3 }; }],
  ['a Bestiary count in the Tower', 'mode_pays', (m) => { m.delta.journal.meta.km = { rat: m.delta.journal.meta.kills }; }],
  ['Level XP past the floors\' bound', 'value_over', (m) => { m.delta.level_xp = (m.delta.level_xp || 0) * 50 + 100000; }],
];
async function forgedArm(db, M) {
  const bad = [];
  const r = await H.inTx(db, async () => {
    const h = await climber(db, M, {});
    const exec = makeExec(db);
    for (let i = 0; i < 40; i++) {
      const plan = await M.HS.readHuntSettle({ exec, user: UID, slot: 0, grounds: {}, atMs: h.from + SPAN }, 'tick');
      if (plan.answer) return { err: 'the read answered ' + plan.answer.reason };
      const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
      if (!p.commit) return { err: 'the engine proposed nothing: ' + (p.out && p.out.reason) };
      const mine = p.commit.members[0];
      if (!(mine.hunt.tower && mine.hunt.tower.floors.length && mine.delta.level_xp > 0)) {
        const ok = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
        if (!ok || ok.ok !== true) return { err: 'an honest window was refused: ' + JSON.stringify(ok).slice(0, 300) };
        continue;
      }
      const out = [];
      for (const [name, want, edit] of FORGERIES) {
        const f = JSON.parse(JSON.stringify(p.commit));
        edit(f.members[0]);
        /* each forgery alone: a counted refusal moves the session (its refusals and version), which the next commit of this window would meet */
        await db.query('savepoint tc_forge');
        const res = await M.HS.commitHuntSettle(exec, { ...f, project: null });
        await db.query('rollback to savepoint tc_forge');
        out.push({ name, want, res: JSON.stringify(res).slice(0, 300), ok: !!(res && res.ok === true) });
      }
      /* THE CONTROL: the same window untampered lands and moves the run to its last floor */
      const top0 = await one(db, 'select top_floor from public.tower_runs where session_id = $1', [h.sid]);
      const honest = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
      const top1 = await one(db, 'select top_floor from public.tower_runs where session_id = $1', [h.sid]);
      return { out, honest: JSON.stringify(honest).slice(0, 300), honestOk: !!(honest && honest.ok === true), top0, top1, claimed: mine.hunt.tower.floors };
    }
    return { err: 'no window cleared a floor' };
  });
  if (r.err) return [`TC-FORGED CONTROL: ${r.err}`];
  for (const x of r.out) {
    const hit = typeof x.want === 'string' ? x.res.includes(x.want) : x.want.test(x.res);
    if (x.ok || !hit) bad.push(`TC-FORGED ${x.name} answered ${x.res}, not ${x.want}`);
  }
  if (!r.honestOk || Number(r.top1) !== r.claimed[r.claimed.length - 1]) bad.push(`TC-FORGED CONTROL: the untampered window answered ${r.honest} and moved the run ${r.top0} -> ${r.top1} (claimed ${r.claimed})`);
  /* a floor claimed by a session that is no climb */
  const off = await H.inTx(db, async () => {
    await rewind(db);
    const h = await H.hunter(db, M, { ...H.STRONG });
    const exec = makeExec(db);
    const plan = await M.HS.readHuntSettle({ exec, user: UID, slot: 0, grounds: H.groundsOf(M), atMs: h.from + 60000 }, 'tick');
    if (plan.answer) return { err: plan.answer.reason };
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    if (!p.commit) return { err: 'nothing proposed' };
    const f = JSON.parse(JSON.stringify(p.commit));
    f.members[0].hunt.tower = { floors: [1] };
    return { res: JSON.stringify(await M.HS.commitHuntSettle(exec, { ...f, project: null })).slice(0, 300) };
  });
  if (off.err) bad.push(`TC-FORGED CONTROL: the hunt off the Tower: ${off.err}`);
  else if (!/bad_tower/.test(off.res)) bad.push(`TC-FORGED a hunt off the Tower claiming a floor answered ${off.res}, not bad_tower`);
  return bad;
}

/* ── TC-START ─────────────────────────────────────────────────────────────── */
async function startArm(db, M) {
  const bad = [];
  const r = await H.inTx(db, async () => {
    await rewind(db);
    await H.character(db, M, UID, { level: 12, inv: {}, gold: 200000 });
    await db.query('update public.hr_hunt_config set enabled = true where id');
    const hunt = M.TD.TOWER_RULES.hunt;
    const out = {};
    await db.query("update public.hr_feature_switches set scope = 'off' where switch_id = 'burning_tower'");
    out.off = await as(db, UID, 'select public.hr_tower_start(0, 0, $1::uuid)', [idem()]);
    await db.query("update public.hr_feature_switches set scope = 'accounts', accounts = array[$1::uuid] where switch_id = 'burning_tower'", [UID]);
    out.door = await as(db, UID, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [hunt, idem()]);
    out.unearned = await as(db, UID, 'select public.hr_tower_start(0, 20, $1::uuid)', [idem()]);
    out.open0 = Number(await one(db, 'select count(*) from public.hunt_sessions where user_id = $1 and ended_at is null', [UID]));
    /* a landing reached (the settle's own write of the best): its checkpoint is offered */
    await db.query("insert into public.tower_progress (user_id, slot, hunt_id, best_floor, best_landing) values ($1, 0, $2, 14, 10)", [UID, M.TD.TOWER_RULES.hunt]);
    const key = idem();
    out.ten = await as(db, UID, 'select public.hr_tower_start(0, 10, $1::uuid)', [key]);
    out.again = await as(db, UID, 'select public.hr_tower_start(0, 10, $1::uuid)', [key]);
    out.runs = Number(await one(db, 'select count(*) from public.tower_runs where user_id = $1', [UID]));
    out.floor = await one(db, `select public.hr_hunt_instance_read($1, 0)->'instance'->'tower_floor'`, [UID]);
    return out;
  });
  if (r.off.error !== 'feature_off') bad.push(`TC-START the switch off answered ${JSON.stringify(r.off)}`);
  if (r.door.ok === true || !JSON.stringify(r.door).includes('tower_only')) bad.push(`TC-START the ordinary door answered ${JSON.stringify(r.door).slice(0, 200)}`);
  if (r.unearned.error !== 'bad_landing' || JSON.stringify(r.unearned.checkpoints) !== '[0]' || r.open0 !== 0) bad.push(`TC-START an unreached checkpoint answered ${JSON.stringify(r.unearned)} (${r.open0} open)`);
  if (r.ten.ok !== true || r.ten.floor !== 11 || JSON.stringify(r.ten.checkpoints) !== '[0,10]') bad.push(`TC-START the checkpoint the hero reached answered ${JSON.stringify(r.ten).slice(0, 200)}`);
  if (r.runs !== 1 || Number(r.floor) !== 11) bad.push(`TC-START a replayed key made ${r.runs} runs; the engine reads floor ${r.floor}`);
  return bad;
}
/* the signed-in hero `uid` calls a verb (its rate counters cleared: the arms call far more often than a player) */
async function as(db, uid, sql, p) {
  await db.query('delete from public.hr_rate_counters');
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  const v = await one(db, sql, p);
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  return v;
}

/* ── TC-CHECKPOINT ────────────────────────────────────────────────────────── */
const UID2 = H.UIDS[1];
const best = (db, uid, floor) => db.query('insert into public.tower_progress (user_id, slot, hunt_id, best_floor, best_landing) values ($1, 0, $4, $2, $3)', [uid, floor, Math.floor(floor / 10) * 10, 'the_burning_tower']);
const openOf = async (db) => q(db, 'select s.user_id, r.start_floor, r.party from public.hunt_sessions s left join public.tower_runs r on r.session_id = s.id where s.ended_at is null order by s.user_id');
async function checkpointArm(db, M) {
  const bad = [];
  const base = async (uids) => {
    await rewind(db);
    for (const u of uids) await H.character(db, M, u, { level: 12, inv: {}, gold: 200000 });
    await db.query('update public.hr_hunt_config set enabled = true where id');
    await db.query("update public.hr_feature_switches set scope = 'accounts', accounts = $1::uuid[] where switch_id = 'burning_tower'", [uids]);
  };
  /* ALONE: best 53 (landing 50) */
  const solo = await H.inTx(db, async () => {
    await base([UID]);
    await best(db, UID, 53);
    const out = {};
    out.sixty = await as(db, UID, 'select public.hr_tower_start(0, 60, $1::uuid)', [idem()]);
    out.thirtyFive = await as(db, UID, 'select public.hr_tower_start(0, 35, $1::uuid)', [idem()]);
    out.open0 = (await openOf(db)).length;
    out.thirty = await as(db, UID, 'select public.hr_tower_start(0, 30, $1::uuid)', [idem()]);
    out.runs = await openOf(db);
    out.journal = await one(db, "select meta from public.player_ledger where user_id = $1 and intent = 'tower_start:30'", [UID]);
    return out;
  });
  const cps = '[0,10,20,30,40,50]';
  if (solo.sixty.error !== 'bad_landing' || JSON.stringify(solo.sixty.checkpoints) !== cps || solo.thirtyFive.error !== 'bad_landing' || solo.open0 !== 0) {
    bad.push(`TC-CHECKPOINT a forged landing 60 answered ${JSON.stringify(solo.sixty)}, 35 ${JSON.stringify(solo.thirtyFive)} (${solo.open0} open)`);
  }
  if (solo.thirty.ok !== true || solo.thirty.landing !== 30 || solo.thirty.floor !== 31 || solo.runs.length !== 1 || solo.runs[0].start_floor !== 31
      || !solo.journal || solo.journal.landing !== 30) {
    bad.push(`TC-CHECKPOINT landing 30 of best 50 answered ${JSON.stringify(solo.thirty).slice(0, 200)}, runs ${JSON.stringify(solo.runs)}`);
  }
  const def = await H.inTx(db, async () => { await base([UID]); await best(db, UID, 53); return { r: await as(db, UID, 'select public.hr_tower_start(0, null, $1::uuid)', [idem()]), runs: await openOf(db) }; });
  if (def.r.ok !== true || def.r.landing !== 50 || def.runs.length !== 1 || def.runs[0].start_floor !== 51) bad.push(`TC-CHECKPOINT no pick (the best) answered ${JSON.stringify(def.r).slice(0, 200)}, runs ${JSON.stringify(def.runs)}`);
  /* A PARTY: the leader best 50, the second best 20 */
  const party = await H.inTx(db, async () => {
    await base([UID, UID2]);
    await best(db, UID, 53); await best(db, UID2, 27);
    const named = await as(db, UID2, 'select public.hr_character_name_set(0, $1, $2::uuid)', ['Climb Second', idem()]);
    if (!named || named.ok !== true) return { err: 'name refused: ' + JSON.stringify(named) };
    const inv = await as(db, UID, 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', ['Climb Second', idem()]);
    if (!inv || inv.ok !== true) return { err: 'invite refused: ' + JSON.stringify(inv) };
    const pid = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [UID]);
    const listed = await as(db, UID, 'select public.hr_hunt_party_list(0, true, $1::uuid)', [idem()]);
    const joined = await as(db, UID2, 'select public.hr_hunt_party_join(0, $1::uuid, $2::uuid)', [pid, idem()]);
    if (!listed || listed.ok !== true || !joined || joined.ok !== true) return { err: 'list/join refused: ' + JSON.stringify([listed, joined]) };
    const out = {};
    out.notLeader = await as(db, UID2, 'select public.hr_tower_start(0, 0, $1::uuid)', [idem()]);
    out.thirty = await as(db, UID, 'select public.hr_tower_start(0, 30, $1::uuid)', [idem()]);
    out.open0 = (await openOf(db)).length;
    out.start = await as(db, UID, 'select public.hr_tower_start(0, null, $1::uuid)', [idem()]);
    out.runs = await openOf(db);
    return out;
  });
  if (party.err) { bad.push('TC-CHECKPOINT HARNESS: ' + party.err); return bad; }
  if (party.notLeader.ok === true || (await openOf(db)).length) bad.push(`TC-CHECKPOINT a seat that isn't the leader answered ${JSON.stringify(party.notLeader).slice(0, 200)}`);
  if (party.thirty.error !== 'bad_landing' || JSON.stringify(party.thirty.checkpoints) !== '[0,10,20]' || party.open0 !== 0) {
    bad.push(`TC-CHECKPOINT a party pick past its lowest seat answered ${JSON.stringify(party.thirty).slice(0, 200)} (${party.open0} open)`);
  }
  if (party.start.ok !== true || party.start.landing !== 20 || party.runs.length !== 2 || party.runs.some((x) => x.start_floor !== 21 || x.party !== 2)) {
    bad.push(`TC-CHECKPOINT a party of best 50 and best 20 answered ${JSON.stringify(party.start).slice(0, 200)}, runs ${JSON.stringify(party.runs)}`);
  }
  return bad;
}

/* ── TC-ARM (2027-05-03-tower-arm.sql) ────────────────────────────────────────
   The whole chain leaves burning_tower on for everyone. The chain up to the file before the arm leaves it off; on that database another
   switch moved (factions to testers), the file applied: on for a stranger, every other row exactly as it was (scope, accounts, note,
   updated_at); applied again: nothing moves, the schema included (a byte-identical second apply); then 2027-04-24-tower-climb.sql applied
   again over the armed row: it re-applies and leaves the switch armed. A mutant's edit of a migration's text rides in SQL_EDIT. */
const ARM_FILE = '2027-05-03-tower-arm.sql';
let SQL_EDIT = null;
const migration = (name) => {
  let t = readFileSync(join(ROOT, 'supabase', 'migrations', name), 'utf8').replace(/\r\n/g, '\n');
  if (SQL_EDIT && SQL_EDIT.file === name) for (const [a, b] of SQL_EDIT.edits) t = t.replace(a, () => b);
  return t;
};
async function armArm(db) {
  const bad = [];
  const stranger = '00000000-0000-4000-8000-00007a3e9e99';
  const rows = (d) => q(d, 'select switch_id, scope, accounts::text as accounts, note, updated_at::text as at from public.hr_feature_switches order by switch_id');
  const tower = async (d) => (await rows(d)).find((r) => r.switch_id === 'burning_tower');
  const others = async (d) => JSON.stringify((await rows(d)).filter((r) => r.switch_id !== 'burning_tower'));
  const on = async (d) => (await one(d, "select public.hr_feature_on('burning_tower', $1::uuid)", [stranger])) === true;
  const first = (e) => String(e && e.message).split('\n')[0].slice(0, 200);
  const all = await tower(db);
  if (!all || all.scope !== 'everyone' || all.accounts !== '{}' || !await on(db)) bad.push('TC-ARM the whole chain leaves burning_tower at ' + JSON.stringify(all));
  const order = (await chainFiles()).map(([n]) => n);
  if (order.indexOf(ARM_FILE) < 1) { bad.push('TC-ARM ' + ARM_FILE + ' is not in the chain'); return bad; }
  const { db: pre } = await bootReplay({ upTo: order[order.indexOf(ARM_FILE) - 1] });
  try {
    const sw0 = await tower(pre);
    if (!sw0 || sw0.scope !== 'off' || await on(pre)) bad.push('TC-ARM the chain before the arm leaves burning_tower at ' + JSON.stringify(sw0) + ' (off until the arm)');
    await pre.query("update public.hr_feature_switches set scope = 'testers', updated_at = '2026-01-01T00:00:00Z' where switch_id = 'factions'");
    const other = await others(pre);
    const sql = migration(ARM_FILE);
    try { await pre.exec(sql); } catch (e) { bad.push('TC-ARM the file refused: ' + first(e)); return bad; }
    if (!await on(pre)) bad.push('TC-ARM applied over an off switch, burning_tower is still off for a stranger');
    if (await others(pre) !== other) bad.push('TC-ARM the file moved another switch row');
    const before = JSON.stringify({ inv: await inventory(pre), rows: await rows(pre) });
    try { await pre.exec(sql); } catch (e) { bad.push('TC-ARM a second apply refused: ' + first(e)); return bad; }
    if (JSON.stringify({ inv: await inventory(pre), rows: await rows(pre) }) !== before) bad.push('TC-ARM a second apply moved something');
    const armed = JSON.stringify(await tower(pre));
    try { await pre.exec(migration('2027-04-24-tower-climb.sql')); } catch (e) { bad.push('TC-ARM 2027-04-24-tower-climb.sql refused a second apply over the armed switch: ' + first(e)); return bad; }
    if (JSON.stringify(await tower(pre)) !== armed || !await on(pre)) bad.push('TC-ARM 2027-04-24-tower-climb.sql applied again moved the armed switch to ' + JSON.stringify(await tower(pre)));
  } finally { await pre.close(); }
  return bad;
}

const ARMS = { room: roomArm, engine: engineArm, curve: curveArm, doors: doorsArm, after: afterArm, forged: forgedArm, start: startArm, checkpoint: checkpointArm, arm: armArm };
/* THE CLIMB'S HARNESS, shared (tests/tower-chest.mjs mints its keys through these climbs, both doors). */
export const HARNESS = Object.freeze({ boot, load, climber, drive, rows, UID, SPAN });

/* ── THE MUTANTS ──────────────────────────────────────────────────────────── */
const MUTANTS = [
  { name: 'the stair does not move the floor', arm: 'engine', want: /^TC-ENGINE/, file: 'src/core/hunt/tower.js', from: '  w.towerFloor += 1;', to: '' },
  { name: 'the Tower pays coin', arm: 'engine', want: /^TC-ENGINE/, file: 'src/core/hunt-rewards.js',
    from: "  const row = !pay || (pay.coin && pay.drops) ? row0 : { ...row0, ...(pay.coin ? {} : { gp: null }), ...(pay.drops ? {} : { drops: [] }) };",
    to: "  const row = !pay || (pay.coin && pay.drops) ? row0 : { ...row0, gp: [5, 9], ...(pay.drops ? {} : { drops: [] }) };" },
  { name: 'the Tower counts the Bestiary', arm: 'engine', want: /^TC-ENGINE/, file: 'src/core/hunt-rewards.js', from: '  if (!bestiary) return;\n', to: '' },
  { name: 'the split ignores the mode', arm: 'engine', want: /^TC-ENGINE/, file: 'src/core/hunt/xp-share.js',
    from: '  const raw = (xpPm === 1000 ? xp : (xp * xpPm) / 1000) / heroes.length;', to: '  const raw = xp / heroes.length;' },
  { name: 'the floor\'s time is never asked', arm: 'engine', want: /^TC-ENGINE/, file: 'src/core/combat-sim.js',
    from: '    if (tw) for (const m of members) m.hs.floorEndsAtMs = world && m.unitId !== null ? towerEndsAt(world, tw) : null;', to: '' },
  /* THE CURVE (lane/d-tower-curve), each line its own mutant: the data's heat off (the played four's felt line), the rooms that never read it (the rows'
     band step), a heat that thickens HP (so XP passes the server's per-floor bound) */
  { name: 'the fire never heats', arm: 'curve', want: /^TC-CURVE floors 131-140 read a typical low/, file: 'src/data/tower.js',
    from: '  heat: Object.freeze({ from: 100, perFloorPm: 10 }),', to: '  heat: Object.freeze({ from: 100, perFloorPm: 0 }),' },
  { name: 'the rooms never read the heat', arm: 'curve', want: /^TC-CURVE floors [0-9]+-[0-9]+ hit only/, file: 'src/core/hunt/tower.js',
    from: '  const s = formulaStats({ level: L, role, tier: row.tier, floor: L, fit: run.fit, ground: run.hunt }, heatOpts(floor, run));',
    to: '  const s = formulaStats({ level: L, role, tier: row.tier, floor: L, fit: run.fit, ground: run.hunt });' },
  { name: 'the heat thickens HP too', arm: 'room', want: /^TC-ROOM/, file: 'src/core/hunt/tower.js',
    from: '  return { formula: { ...F, blow: { ...F.blow, lo: F.blow.lo * k, hi: F.blow.hi * k } } };',
    to: '  return { formula: { ...F, blow: { ...F.blow, lo: F.blow.lo * k, hi: F.blow.hi * k }, hp: { ...F.hp, base: F.hp.base * k, perLevel: F.hp.perLevel * k } } };' },
  { name: 'a climb freezes no plan of its hero\'s', arm: 'after', want: /^TC-AFTER .*froze/, fn: 'public.hr_hunt_after_freeze()',
    find: '  new.after_choice := coalesce(new.after_choice, v_def);',
    replace: "  new.after_choice := case when exists (select 1 from public.hr_tower_rules r where r.hunt_id = new.hunt_id) then v_def else coalesce(new.after_choice, v_def) end;" },
  { name: 'a climb\'s end runs no plan', arm: 'after', want: /^TC-AFTER .*plan came to/, fn: 'public.hr_hunt_resume(uuid,integer,uuid,text,bigint)',
    find: '  if p_end is null or not coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = p_end), false) then',
    replace: '  if p_end is null or exists (select 1 from public.hunt_sessions s join public.hr_tower_rules r on r.hunt_id = s.hunt_id where s.id = p_session)\n     or not coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = p_end), false) then' },
  { name: 'the order check is gone', arm: 'forged', want: /^TC-FORGED (a skipped|a repeated)/, fn: 'public.hr_tower_check(uuid,jsonb,timestamp with time zone,timestamp with time zone)',
    find: "  if exists (select 1 from jsonb_array_elements(v_f) with ordinality e(v, i) where (e.v #>> '{}')::bigint <> v_lo + e.i - 1) then",
    replace: '  if false then' },
  { name: 'the mode pays what it likes', arm: 'forged', want: /^TC-FORGED (coin|an item|a Bestiary)/, fn: 'public.hr_mode_pays(text,jsonb)',
    find: "  if not found then return 'mode'; end if;", replace: "  return null;" },
  { name: 'the kill bound ignores the mode', arm: 'forged', want: /^TC-FORGED Level XP/, fn: 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
    find: '  if v_mode.xp_pm <> 1000 then v_vb_xp := ceil(v_vb_xp * v_mode.xp_pm / 1000.0)::bigint; end if;', replace: '  v_vb_xp := v_vb_xp * 100;' },
  { name: 'the checkpoint is not checked', arm: 'checkpoint', want: /^TC-CHECKPOINT a forged landing 60/, fn: 'public.hr_run_start(uuid,integer,text,integer,uuid,text,text,text)',
    find: '    if v_cps is null or v_pick is null or v_pick <> all (v_cps) then', replace: '    if v_cps is null or v_pick is null then' },
  { name: 'a party climbs from its strongest seat', arm: 'checkpoint', want: /^TC-CHECKPOINT a party/, fn: 'public.hr_run_record(uuid,integer,text)',
    find: '(select min(coalesce(p.best_floor, 0)) from public.hunt_party_members m', replace: '(select max(coalesce(p.best_floor, 0)) from public.hunt_party_members m' },
  { name: 'no pick starts at the bottom, not the best', arm: 'checkpoint', want: /^TC-CHECKPOINT (no pick|a party of)/, fn: 'public.hr_run_start(uuid,integer,text,integer,uuid,text,text,text)',
    find: '    v_pick := coalesce(p_landing, v_cps[cardinality(v_cps)]);', replace: '    v_pick := coalesce(p_landing, 0);' },
  { name: 'a party start leaves the second seat runless', arm: 'checkpoint', want: /^TC-CHECKPOINT a party of/, fn: 'public.hr_run_start(uuid,integer,text,integer,uuid,text,text,text)',
    find: '                                       else exists (select 1 from public.hunt_party_members m where m.party_id = v_party\n                                                     and m.user_id = h.user_id and m.slot = h.slot) end);\n    insert into public.tower_runs',
    replace: '                                       else exists (select 1 from public.hunt_party_members m where m.party_id = v_party\n                                                     and m.user_id = h.user_id and m.slot = h.slot) end);\n    v_party := null;\n    insert into public.tower_runs' },
  { name: 'the ordinary door admits the Tower', arm: 'start', want: /^TC-START the ordinary door/, fn: 'public.hr_hunt_admit(uuid,integer,text)',
    find: "    if current_setting('hr.tower', true) is distinct from p_hunt then", replace: '    if false then' },
  { name: 'the best is not written', arm: 'doors', want: /^TC-DOORS/, fn: 'public.hr_tower_write(uuid,integer,uuid,jsonb,bigint,timestamp with time zone)',
    find: '  insert into public.tower_progress (user_id, slot, hunt_id, best_floor, best_landing, best_at, updated_at)', replace: '  return;\n  insert into public.tower_progress (user_id, slot, hunt_id, best_floor, best_landing, best_at, updated_at)' },
  { name: 'the arm writes on every apply', arm: 'arm', want: /^TC-ARM a second apply moved/, sql: { file: ARM_FILE, edits: [
    ["   where switch_id = 'burning_tower' and (scope <> 'everyone' or cardinality(accounts) <> 0);", "   where switch_id = 'burning_tower';"]] } },
  { name: 'the arm moves another switch', arm: 'arm', want: /^TC-ARM the file moved another switch row/, sql: { file: ARM_FILE, edits: [
    ["   where switch_id = 'burning_tower' and (scope <> 'everyone' or cardinality(accounts) <> 0);",
     "   where switch_id in ('burning_tower', 'factions') and (scope <> 'everyone' or cardinality(accounts) <> 0);"],
    ["  if v_after is distinct from v_before then raise exception 'tower-arm §1: another switch row moved'; end if;\n", '']] } },
  { name: 'the climb\'s probe wants the switch off again', arm: 'arm', want: /^TC-ARM 2027-04-24-tower-climb\.sql refused/, sql: { file: '2027-04-24-tower-climb.sql', edits: [
    ["where f.switch_id = 'burning_tower') is distinct from v_sw then", "where f.switch_id = 'burning_tower') is distinct from 'off|{}' then"]] } },
];

async function runArm(db, M, name) {
  try { return await ARMS[name](db, M); } catch (e) { return ['THREW ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
}

async function main() {
  let db;
  try { db = await boot(); } catch (e) { console.error('tower-climb: the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
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
        try { got = await runArm(db, await load(ROOT), m.arm); } finally { await db.exec(def); }
      } else if (m.sql) {
        const text = readFileSync(join(ROOT, 'supabase', 'migrations', m.sql.file), 'utf8').replace(/\r\n/g, '\n');
        for (const [a] of m.sql.edits) if (text.split(a).length !== 2) { console.error(`HARNESS: ${m.sql.file} has no single ${JSON.stringify(a.slice(0, 70))}`); process.exit(2); }
        SQL_EDIT = m.sql;
        try { got = await runArm(db, await load(ROOT), m.arm); } finally { SQL_EDIT = null; }
      } else {
        const dir = mkdtempSync(join(tmpdir(), 'hr-tc-'));
        try {
          /* + the balance simulator TC-CURVE plays (it reads the tree it sits in) */
          for (const d of ['src/core', 'src/data', 'src/session', FN, 'tests/hunt-core/fixtures', 'tests/_is-main.mjs', 'tools/balance-sim']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
          cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
          const p = join(dir, m.file);
          let src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
          if (src.split(m.from).length !== 2) { console.error(`HARNESS: ${m.file} has no single ${JSON.stringify(m.from.slice(0, 70))}`); process.exit(2); }
          src = src.replace(m.from, () => m.to);
          writeFileSync(p, src);
          let M;
          try { M = await load(dir); } catch (e) { got = ['THREW loading the mutated tree: ' + String(e.message).slice(0, 160)]; }
          if (M) got = await runArm(db, M, m.arm);
        } finally { rmSync(dir, { recursive: true, force: true }); }
      }
      const hit = got.some((x) => m.want.test(x));
      if (!hit) escaped++;
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${m.name}: ${String(got[0] || 'every check held').slice(0, 160)}`);
    }
    console.log(escaped ? `tower-climb --mutate: ${escaped} ESCAPED` : `tower-climb --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const M = await load(ROOT);
  const bad = [];
  for (const name of Object.keys(ARMS)) {
    if (only && name !== only) continue;
    const got = await runArm(db, M, name);
    console.log((got.length ? '✗ ' : '✓ ') + name);
    bad.push(...got);
  }
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? `tower-climb: ${bad.length} FAILED` : 'tower-climb: green (the room, the engine, the curve, both doors, a climb runs its hero\'s plan when it ends, forged windows refused, the one door, the arm)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
