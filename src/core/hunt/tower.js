// ============================================================
// src/core/hunt/tower.js — THE RUN GROUNDS' ROOMS IN THE ONE ENGINE: THE BURNING TOWER'S FLOORS AND THE UNMARKED CATACOMBS' WINGS
// (src/data/tower.js; Tyler 2026-11-14 the Tower, 2026-11-16 the Catacombs' descent; rebuilt from formulas on lane/tower-boss-formula,
// 2026-11-22: docs/design/redesign/02-architecture.md packages 3 and 7, 04-math-strategy.md sections 6 and 7)
//
// A run is a hunt instance on a run ground (hunt-grounds.js TOWER_GROUNDS: the Tower's flue and the Catacombs' two wings, each `tower`),
// settled by src/core/combat-sim.js like any hunt, viewed or not (CLAUDE.md §6). Its session mode (session-modes.js `tower`, `catacomb`)
// decides what a death costs; its RUN ROW (src/data/tower.js RUN_GROUNDS, runRulesOf) decides what stands in the room and what a kill pays,
// and every rule lives here so the hunt files carry one call each. The descent is NOT a second engine: a wing is a run row with its own
// roster and a fixed Keeper, read by the same functions.
//
//   A ROOM (towerRoom, towerPull): picked by the room's number (no dice). The Tower fields its band's MIX (src/data/tower.js TOWER_MIXES:
//     `size` monsters) from the rosters of the open grounds whose band holds the floor's Level ("the fire remembers what was fed to it");
//     a wing roomSize monsters from its own roster, by weight. A LANDING (a vault door in the Catacombs: every landingEvery-th room) puts
//     its Keeper in the first slot at the `keeper` boss kind (src/data/bosses.js): on the Tower one of the room's kinds no other slot takes,
//     in a wing its fixed Keeper (Keeper Dunn). Bosses of the grounds never stand in a run.
//   ITS ROWS (towerMonsters): every kind the run can field, read at the floor's LEVEL by the stat formula (balance-sheet.js formulaStats: the
//     Tower's at its band's stat role, a wing's at its pack's), its HP and blow carried by the floor's DEPTH on the Danger scale
//     ((1 + DANGER.powerStep) ^ depth, danger.js stepRatio) and by the room's share (roomSize / size), and on the Tower its band's REACH
//     (the Danger scale's role table, monster-roles.js, which reads a run ground as on the scale). No coin and no drops. The ONE table a
//     swing reads while room F stands. A room above floorTop plays floorTop's rows.
//   ITS PAY (towerShareXp, xp-share.js): a kill pays each hero the hours table's share of its own Level times the depth ratio at the gap
//     (the floor's Level - the hero's), times the run's payPm and the room's share, split evenly: the one pay rule (04 section 7).
//   THE STAIR (towerCleared, from pull-cycle.js runPhase): when the room's last monster falls, every hero standing in it clears room F (a
//     `floor` event naming them), F moves on, and the next room stands stairMs later (the pocket's respawn).
//   THE ROOM'S TIME (towerEndsAt -> action-rules.js `floor_time`): a room not cleared floorLimitMs after it stood (landingLimitMs at a door)
//     ends the run for everyone in it.
//
// WHERE THE ROOM LIVES. Not in the stored world (its shape does not move): the server keeps it (tower_runs, 2027-04-24-tower-climb.sql) and
// hands the engine the room that stands, or stands next, at every window's start (hr_hunt_instance_read `tower_floor`). Inside a span it is
// `world.towerFloor`, a working value combat-sim.js sets from that read and the stair moves; it is never encoded.
//
// THE RUN ARGUMENT. Every function takes the run row; the Tower's is the default so a reader that only ever meant the Tower (a tool, the
// Tower's own window art) reads as before. Every ENGINE call site passes the ground's own run (towerOf(ground)).
//
// Draws nothing. PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { TOWER_RULES, RUN_GROUNDS, runRulesOf, validateTower, towerLevelAt, towerDepthAt, towerMixOf } from '../../data/tower.js';
import { formulaStats, GROUND_ROSTER, MONSTER_ROLES } from '../../data/balance-sheet.js';
import { MONSTER_ROLES as REACH_ROLES } from '../../data/monster-roles.js';
import { BOSS_KINDS, bossRole } from '../../data/bosses.js';
import { PAY } from '../../data/danger.js';
import { SESSION_MODES } from '../../data/session-modes.js';
import { MONSTERS } from '../../data/monsters.js';
import { OPEN_HUNTS } from '../../data/hunts.js';
import { COMBAT_BALANCE } from '../combat.js';
import { hashSeed } from '../rng.js';
import { makeEvent } from './events.js';
import { isHero } from './sides.js';
import { stepRatio, gapPayRatio, levelShareAt } from './danger.js';

/* The Tower's run row: the default for a reader that only means the Tower. */
const TOWER = RUN_GROUNDS[TOWER_RULES.hunt];

/* THE KEEPER'S STAT ROLE: the elite (or the kind's role) times the keeper's row (src/data/bosses.js), one row every room reads. */
const KEEPER = 'keeper';
const ROLES = Object.freeze({ ...MONSTER_ROLES, [KEEPER]: bossRole(MONSTER_ROLES[BOSS_KINDS.keeper.role], KEEPER) });

/* Every run's rules against the engine's swing and its mixes against the two role tables (src/data/tower.js leaves both to here), and its pay
   under the server's bound. THE BOUND (1063-tower-formula.sql): the settle widens a climb's per-kill bound to the scale's Level ceiling a kill
   (PAY.refKillsHead's share at the gap ceiling) and then cuts it to the session mode's xpPm (1005-lever-horizon.sql). The Tower's most a kill can
   pay a hero is that same share x (PAY.refKillsHead / its refKillsHead) x payPm x its largest room share (roomSize / roomMin), the same gap
   ceiling: so that product must sit at or under the mode's cut, or an honest climb is refused. */
{
  const bad = [];
  for (const run of Object.values(RUN_GROUNDS)) {
    for (const p of validateTower(run, COMBAT_BALANCE.tickMs)) bad.push(run.hunt + ': ' + p);
    const ground = Object.values(SESSION_MODES).find((m) => m.id === (run.family === 'tower' ? 'tower' : 'catacomb'));
    const most = (PAY.refKillsHead / run.pay.refKillsHead) * (run.pay.payPm / 1000) * (run.roomSize / run.roomMin);
    if (!ground || most > ground.xpPm / 1000) bad.push(run.hunt + ': a kill can pay ' + most.toFixed(3) + ' of the scale\'s ceiling, over its mode\'s cut ' + (ground ? ground.xpPm : '?') + ' permille');
    for (const m of run.mixes || []) {
      if (!Object.hasOwn(REACH_ROLES, m.reach)) bad.push(run.hunt + ': mix ' + m.id + ' reaches as ' + m.reach + ', no role of monster-roles.js');
      if (!Object.hasOwn(MONSTER_ROLES, m.role) || m.role === 'boss') bad.push(run.hunt + ': mix ' + m.id + ' stands as ' + m.role + ', no plain stat role');
    }
  }
  if (bad.length) throw new Error('src/core/hunt/tower.js: a run\'s rules do not hold against the engine: ' + bad.join('; '));
}

/* A wing's kinds against the catalogue, checked the first time the wing fields a room, not at load: a wing's monsters come from its own pack
   (src/data/grounds/unmarked_catacombs, staged as a hunting ground), and a catalogue generator's whole view (tools/pack/whole.mjs) leaves a staged
   pack out, so a load-time check would refuse every generator. The engine and the edge read every pack. tests/catacombs.mjs CB-DATA holds it. */
const CHECKED = new Set();
function checkRun(run) {
  if (run.roster === null || CHECKED.has(run.hunt)) return;
  const roles = GROUND_ROSTER[run.rosterGround] || {};
  const bad = [];
  for (const id of [...Object.keys(run.roster), run.keeper]) {
    if (!MONSTERS[id]) bad.push(id + ' is no monster');
    else if (!roles[id] || roles[id] === 'boss') bad.push(id + ' has no non-boss role on ' + run.rosterGround);
  }
  if (bad.length) throw new Error('src/core/hunt/tower.js: ' + run.hunt + ' fields what the catalogue does not hold: ' + bad.join('; '));
  CHECKED.add(run.hunt);
}

/** The run row of `ground` (the Tower or a Catacomb wing) when `ground` is a run ground, else null. */
export function towerOf(ground) {
  return ground && ground.tower === true ? runRulesOf(ground.id) : null;
}

/* The floor whose formulas room `floor` reads: the room itself, from 1, never past the run's floorTop. */
const readAt = (floor, run) => Math.min(Math.max(1, Math.floor(Number(floor) || 1)), run.floorTop);

/** The Level room `floor`'s monsters are read at (src/data/tower.js towerLevelAt), held at floorTop's. */
export function towerLevelOf(floor, run = TOWER) {
  return towerLevelAt(readAt(floor, run), run);
}

/** Room `floor`'s depth on the Danger scale (src/data/tower.js towerDepthAt), held at floorTop's. */
export function towerDepthOf(floor, run = TOWER) {
  return towerDepthAt(readAt(floor, run), run);
}

/** Is room `floor` a landing (a vault door: its room holds the Keeper)? */
const isLanding = (floor, run) => Number.isInteger(floor) && floor > 0 && floor % run.landingEvery === 0;

/** How long room `floor`'s room may stand before the run ends `floor_time`. */
const towerLimitMs = (floor, run) => (isLanding(floor, run) ? run.landingLimitMs : run.floorLimitMs);

/* THE TOWER'S LADDER the rooms are picked from: every OPEN hunt with a roster, its band and its monsters. Read once, on first use, from the
   data the whole engine reads. */
let LADDER = null;
function ladder() {
  if (LADDER) return LADDER;
  const bands = [];
  const ids = new Set();
  for (const h of OPEN_HUNTS) {
    const roster = GROUND_ROSTER[h.id];
    if (!roster || !Array.isArray(h.band)) continue;
    const kinds = Object.keys(roster).filter((id) => roster[id] !== 'boss' && MONSTERS[id]).sort();
    bands.push({ floor: h.band[0], top: h.band[1], ids: kinds });
    for (const id of kinds) ids.add(id);
  }
  if (!bands.length) throw new Error('src/core/hunt/tower.js: no open ground has a roster, so no floor has a room');
  LADDER = { bands, ids: [...ids].sort(), top: Math.max(...bands.map((b) => b.top)) };
  return LADDER;
}

/* The monsters room F may hold, sorted (a wing's: its roster, each id as many times as its weight). The Tower: every non-boss roster monster of
   the grounds whose band holds its Level (past the top band, the top band's). */
function poolAt(floor, run) {
  checkRun(run);
  if (run.roster !== null) return Object.keys(run.roster).sort().flatMap((id) => Array(run.roster[id]).fill(id));
  const L = Math.min(towerLevelOf(floor, run), ladder().top);
  const ids = new Set();
  for (const b of ladder().bands) if (L >= b.floor && L <= b.top) for (const id of b.ids) ids.add(id);
  return [...ids].sort();
}

/* The seed namespace of a run's picks: the Tower keeps 'tower', a wing its own hunt id. */
const nsOf = (run) => (run.hunt === TOWER_RULES.hunt ? 'tower' : run.hunt);

/* How many stand in room F: the band's mix's size on the Tower, roomSize in a wing. */
const sizeOf = (floor, run) => { const m = towerMixOf(floor, run); return m ? m.size : run.roomSize; };

/** THE ROOM'S SHARE: what each of its monsters carries of a reference monster (roomSize / size), and what each kill pays of one. */
export function towerShareOf(floor, run = TOWER) {
  return run.roomSize / sizeOf(floor, run);
}

/**
 * ROOM F: its monster ids, slot by slot, picked by the room's number (no dice: the same room on every path and every cut). On a landing,
 * slot 0 is the Keeper: the Tower's a kind no other slot of the room takes, a wing's its fixed Keeper. Answers { monsters: [id], keeper:
 * id | null, mix: the band's mix id | null }.
 */
export function towerRoom(floor, run = TOWER) {
  const F = Math.max(1, Math.floor(Number(floor) || 1));
  const pool = poolAt(F, run);
  const ns = nsOf(run);
  const mix = towerMixOf(F, run);
  const keeper = !isLanding(F, run) ? null : run.keeper !== null ? run.keeper : pool[hashSeed(ns, 'keeper', F) % pool.length];
  const rest = keeper && pool.length > 1 ? pool.filter((id) => id !== keeper) : pool;
  const monsters = keeper ? [keeper] : [];
  const size = sizeOf(F, run);
  for (let i = monsters.length; i < size; i++) monsters.push(rest[hashSeed(ns, 'slot', F, i) % rest.length]);
  return { monsters, keeper, mix: mix ? mix.id : null };
}

/* One monster as it fights in room F: the catalogue row with the formula's numbers at the floor's Level and `statRole`, its HP and blow x the
   depth's ratio and x `share`, its reach the band's (the Tower), no coin, no drops. A Keeper reads the keeper's boss kind and carries its ramp. */
function rowAt(id, statRole, floor, run, share, reach) {
  const row = MONSTERS[id];
  const L = towerLevelOf(floor, run);
  const s = formulaStats({ level: L, role: statRole, tier: row.tier, floor: L, fit: run.fit, ground: run.hunt }, { roles: ROLES });
  const k = stepRatio(towerDepthOf(floor, run)) * share;
  return Object.freeze({ ...row, level: L, hp: Math.max(1, Math.round(s.hp * k)), atk: Math.max(1, Math.round(s.atk * k)), aim: s.aim,
    evasion: s.evasion, def: s.def, xp: s.xp, gp: Object.freeze([0, 0]), drops: Object.freeze([]),
    ...(reach ? { role: reach } : {}), ...(statRole === KEEPER ? { bossKind: KEEPER } : {}) });
}

/* A few rooms' tables, kept: a span walks one room at a time, and the live view and the settle the same few. */
const TABLES = new Map();
const KEEP = 8;

/**
 * THE TABLE A SWING READS WHILE ROOM F STANDS: the catalogue with every kind the run fields on its room-F row (so a kind left standing by
 * another deploy's room still fights at room F's) and, on a landing, the Keeper's kind on the keeper's.
 */
export function towerMonsters(floor, run = TOWER) {
  const F = Math.max(1, Math.floor(Number(floor) || 1));
  const key = run.hunt + ':' + F;
  const hit = TABLES.get(key);
  if (hit) return hit;
  const table = Object.assign({}, MONSTERS);
  const mix = towerMixOf(F, run);
  const share = towerShareOf(F, run);
  if (mix) for (const id of ladder().ids) table[id] = rowAt(id, mix.role, F, run, share, mix.reach);
  else {
    checkRun(run);
    const roles = GROUND_ROSTER[run.rosterGround];
    for (const id of Object.keys(run.roster).sort()) table[id] = rowAt(id, roles[id], F, run, share, null);
  }
  const { keeper } = towerRoom(F, run);
  if (keeper) table[keeper] = rowAt(keeper, KEEPER, F, run, 1, mix ? mix.reach : null);
  if (TABLES.size >= KEEP) TABLES.delete(TABLES.keys().next().value);
  TABLES.set(key, Object.freeze(table));
  return TABLES.get(key);
}

/**
 * THE MOST ONE KILL IN ROOM F CAN CARRY AS ITS ROW'S XP: the formula's XP at the floor's Level at the best-paying stat role, the Keeper's
 * included (art tier moves a blow, never the XP). The server's per-floor bound (hr_tower_floors, tools/gen-tower.mjs); one table serves every
 * run ground, so the generator refuses a run whose bounds differ from the Tower's. A kill's Level XP is its share of the hero's own Level
 * (towerShareXp), bounded by the server's Level ceiling.
 */
export function towerXpMax(floor, run = TOWER) {
  const L = towerLevelOf(floor, run);
  let best = 0;
  for (const role of Object.keys(ROLES)) {
    best = Math.max(best, formulaStats({ level: L, role, tier: 1, floor: L, fit: run.fit, ground: run.hunt }, { roles: ROLES }).xp);
  }
  return best;
}

/**
 * ONE HERO'S LEVEL XP FOR ONE KILL IN ROOM F (xp-share.js splits it over the heroes at the kill): the hours table's share of its own Level over
 * the run's refKillsHead, x the depth ratio at the gap (the floor's Level - the hero's: danger.js gapPayRatio), x the run's payPm, x the
 * room's share. The one pay rule (04 section 7), read with the Tower's own reference rate and the Tower's own cut.
 */
export function towerShareXp(level, floor, run = TOWER) {
  const L = Number.isInteger(level) && level >= 1 ? level : 1;
  return levelShareAt(L, run.pay.refKillsHead) * gapPayRatio(Math.min(PAY.gapMax, towerLevelOf(floor, run) - L), PAY.payStepXp) * (run.pay.payPm / 1000)
    * towerShareOf(floor, run);
}

/** The rows room `floor`'s room spawns (pull-cycle.js spawnPack): its monsters on the pocket's own spawn tiles, slot by slot. */
export function towerPull(inst, p) {
  const spots = inst.ground.pockets[p].spawns;
  return towerRoom(inst.world.towerFloor, towerOf(inst.ground)).monsters.map((monster, i) => ({ monster, x: spots[i % spots.length].x, y: spots[i % spots.length].y }));
}

/**
 * THE STAIR (pull-cycle.js runPhase: the room's last monster is down). Every hero standing in the room clears it (a `floor` event:
 * `floor` the number, `by` the unit ids of the heroes standing, as a flat object), the room moves on, and the next room stands
 * stairMs from now: the pocket's respawn, and the instant its time starts.
 */
export function towerCleared(inst, sc) {
  const w = inst.world;
  const by = {};
  for (const u of w.units) if (isHero(u) && u.alive) by[u.id] = true;
  sc.emit(makeEvent('floor', sc.atMs, { floor: w.towerFloor, by }));
  w.towerFloor += 1;
}

/** The instant the run in `world` runs out of time in the room standing (or about to stand), for every hero in it. */
export function towerEndsAt(world, run = TOWER) {
  const pack = world && world.packs && world.packs[0];
  return pack ? pack.respawnAtMs + towerLimitMs(world.towerFloor, run) : null;
}
