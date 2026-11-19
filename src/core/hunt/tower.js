// ============================================================
// src/core/hunt/tower.js — THE RUN GROUNDS' ROOMS IN THE ONE ENGINE: THE BURNING TOWER'S FLOORS AND THE UNMARKED CATACOMBS' WINGS
// (src/data/tower.js; Tyler 2026-11-14 the Tower, 2026-11-16 the Catacombs' descent; the board's "2026-11-14 The Burning Tower" §2 and
// "2026-11-16 The Unmarked Catacombs descent" §2-§3)
//
// A run is a hunt instance on a run ground (hunt-grounds.js TOWER_GROUNDS: the Tower's flue and the Catacombs' two wings, each `tower`),
// settled by src/core/combat-sim.js like any hunt, viewed or not (CLAUDE.md §6). Its session mode (session-modes.js `tower`, `catacomb`)
// decides what a death costs and what a kill pays; its RUN ROW (src/data/tower.js RUN_GROUNDS, runRulesOf) decides what stands in the room,
// and every rule lives here so the hunt files carry one call each. The descent is NOT a second engine: a wing is a run row with its own
// roster and a fixed Keeper, read by the same functions.
//
//   A ROOM (towerRoom, towerPull): roomSize monsters picked by the room's number (no dice). The Tower picks them from the rosters of the open
//     grounds whose band holds Level F ("the fire remembers what was fed to it"); a wing from its own roster, by weight. A LANDING (a vault
//     door in the Catacombs: every landingEvery-th room) puts its Keeper in the first slot at the formula's `boss` role: on the Tower one of
//     the room's kinds no other slot takes, in a wing its fixed Keeper (Keeper Dunn). Bosses of the grounds never stand in a run.
//   ITS ROWS ARE THE STAT FORMULA AT LEVEL F (towerMonsters): every kind the run can field at its own role and art tier, Level F, on a
//     floor-F ground of the run's fit, no coin and no drops: the ONE table a swing reads while room F stands. A room above floorTop plays
//     floorTop's rows. Past the run's heat.from its blows are x the room's heat (heatOpts).
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
// Tower's own window art) reads as before. Every ENGINE call site passes the ground's own run (towerOf(ground)), and the descent's guard
// (tests/catacombs.mjs CB-ROOM) plays a wing through the real settle, so a call site that forgot it reads the Tower's rooms and turns red.
//
// Draws nothing. PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { TOWER_RULES, TOWER_PARTY_XP, RUN_GROUNDS, runRulesOf, validateTower } from '../../data/tower.js?v=0.2.141';
import { formulaStats, GROUND_ROSTER, MONSTER_ROLES, STAT_FORMULA } from '../../data/balance-sheet.js?v=0.2.141';
import { MONSTERS } from '../../data/monsters.js?v=0.2.141';
import { OPEN_HUNTS } from '../../data/hunts.js?v=0.2.141';
import { COMBAT_BALANCE } from '../combat.js?v=0.2.141';
import { hashSeed } from '../rng.js?v=0.2.141';
import { makeEvent } from './events.js?v=0.2.141';

/* The Tower's run row: the default for a reader that only means the Tower. */
const TOWER = RUN_GROUNDS[TOWER_RULES.hunt];

/* Every run's rules against the engine's swing (src/data/tower.js leaves the check to the one place the swing is known). */
{
  const bad = [];
  for (const run of Object.values(RUN_GROUNDS)) for (const p of validateTower(run, TOWER_PARTY_XP, COMBAT_BALANCE.tickMs)) bad.push(run.hunt + ': ' + p);
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

/** The Level room `floor` plays at: the room itself, from 1, never past the run's floorTop. */
export function towerLevelOf(floor, run = TOWER) {
  return Math.min(Math.max(1, Math.floor(Number(floor) || 1)), run.floorTop);
}

/** Is room `floor` a landing (a vault door: its room holds the Keeper)? */
const isLanding = (floor, run) => Number.isInteger(floor) && floor > 0 && floor % run.landingEvery === 0;

/** How long room `floor`'s room may stand before the run ends `floor_time`. */
const towerLimitMs = (floor, run) => (isLanding(floor, run) ? run.landingLimitMs : run.floorLimitMs);

/* THE TOWER'S LADDER the rooms are picked from: every OPEN hunt with a roster, its band and its monsters' roles (a monster on two grounds keeps
   one role: the sheet's rule). Read once, on first use, from the data the whole engine reads. */
let LADDER = null;
function ladder() {
  if (LADDER) return LADDER;
  const bands = [];
  const roles = new Map();
  for (const h of OPEN_HUNTS) {
    const roster = GROUND_ROSTER[h.id];
    if (!roster || !Array.isArray(h.band)) continue;
    bands.push({ floor: h.band[0], top: h.band[1], ids: Object.keys(roster).filter((id) => roster[id] !== 'boss' && MONSTERS[id]).sort() });
    for (const [id, role] of Object.entries(roster)) if (role !== 'boss' && MONSTERS[id] && !roles.has(id)) roles.set(id, role);
  }
  if (!bands.length) throw new Error('src/core/hunt/tower.js: no open ground has a roster, so no floor has a room');
  LADDER = { bands, roles, top: Math.max(...bands.map((b) => b.top)) };
  return LADDER;
}

/* The kinds a run fields and their roles: the Tower's ladder, or a wing's own roster at its pack's roles. */
function rolesOf(run) {
  if (run.roster === null) return ladder().roles;
  checkRun(run);
  const roles = GROUND_ROSTER[run.rosterGround];
  return new Map(Object.keys(run.roster).sort().map((id) => [id, roles[id]]));
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

/* The seed namespace of a run's picks: the Tower keeps 'tower' (its live rooms never move), a wing its own hunt id. */
const nsOf = (run) => (run.hunt === TOWER_RULES.hunt ? 'tower' : run.hunt);

/**
 * ROOM F: roomSize monster ids, slot by slot, picked by the room's number (no dice: the same room on every path and every cut). On a
 * landing, slot 0 is the Keeper: the Tower's a kind no other slot of the room takes (its row is the boss role's), a wing's its fixed Keeper.
 * Answers { monsters: [id], keeper: id | null }.
 */
export function towerRoom(floor, run = TOWER) {
  const F = Math.max(1, Math.floor(Number(floor) || 1));
  const pool = poolAt(F, run);
  const ns = nsOf(run);
  const keeper = !isLanding(F, run) ? null : run.keeper !== null ? run.keeper : pool[hashSeed(ns, 'keeper', F) % pool.length];
  const rest = keeper ? pool.filter((id) => id !== keeper) : pool;
  const monsters = keeper ? [keeper] : [];
  for (let i = monsters.length; i < run.roomSize; i++) monsters.push(rest[hashSeed(ns, 'slot', F, i) % rest.length]);
  return { monsters, keeper };
}

/* THE HEAT of room `floor` (src/data/tower.js `heat`): the formula with its blows x(1 + perFloorPm/1000) a floor past heat.from, whole
   permille steps (no pow: every runtime reads the same room). HP, defense and XP stay the formula's, the to-hit at a hero is re-derived
   unchanged and a Keeper keeps the boss cap. Undefined at no heat. */
function heatOpts(floor, run) {
  const h = run.heat, L = towerLevelOf(floor, run);
  let pm = 1000;
  if (h && h.perFloorPm > 0) for (let f = h.from + 1; f <= L; f++) pm = Math.round((pm * (1000 + h.perFloorPm)) / 1000);
  if (pm === 1000) return undefined;
  const k = pm / 1000, F = STAT_FORMULA;
  return { formula: { ...F, blow: { ...F.blow, lo: F.blow.lo * k, hi: F.blow.hi * k } } };
}

/* One monster as it fights in room F at `role`: the catalogue row with the formula's numbers at Level F (heated), no coin, no drops. */
function rowAt(id, role, floor, run) {
  const row = MONSTERS[id];
  const L = towerLevelOf(floor, run);
  const s = formulaStats({ level: L, role, tier: row.tier, floor: L, fit: run.fit, ground: run.hunt }, heatOpts(floor, run));
  return Object.freeze({ ...row, level: L, hp: s.hp, atk: s.atk, baseAcc: s.baseAcc, def: s.def, xp: s.xp, gp: Object.freeze([0, 0]),
    drops: Object.freeze([]) });
}

/* A few rooms' tables, kept: a span walks one room at a time, and the live view and the settle the same few. */
const TABLES = new Map();
const KEEP = 8;

/**
 * THE TABLE A SWING READS WHILE ROOM F STANDS: the catalogue with every kind the run fields on its room-F row (so a kind left standing by
 * another deploy's room still fights at Level F) and, on a landing, the Keeper's kind on the boss role's.
 */
export function towerMonsters(floor, run = TOWER) {
  const F = Math.max(1, Math.floor(Number(floor) || 1));
  const key = run.hunt + ':' + F;
  const hit = TABLES.get(key);
  if (hit) return hit;
  const table = Object.assign({}, MONSTERS);
  for (const [id, role] of rolesOf(run)) table[id] = rowAt(id, role, F, run);
  const { keeper } = towerRoom(F, run);
  if (keeper) table[keeper] = rowAt(keeper, 'boss', F, run);
  if (TABLES.size >= KEEP) TABLES.delete(TABLES.keys().next().value);
  TABLES.set(key, Object.freeze(table));
  return TABLES.get(key);
}

/**
 * THE MOST ONE KILL IN ROOM F CAN PAY, in Level XP before its mode and its party share: the formula's XP at Level F at the best-paying
 * role (art tier moves a blow, never the XP). The server's bound for the room (hr_tower_floors, tools/gen-tower.mjs) is this; one table
 * serves every run ground, so the generator refuses a run whose bounds differ from the Tower's.
 */
export function towerXpMax(floor, run = TOWER) {
  const L = towerLevelOf(floor, run), hot = heatOpts(floor, run);
  let best = 0;
  for (const role of Object.keys(MONSTER_ROLES)) {
    best = Math.max(best, formulaStats({ level: L, role, tier: 1, floor: L, fit: run.fit, ground: run.hunt }, hot).xp);
  }
  return best;
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
  for (const u of w.units) if (u.side === 'hero' && u.alive) by[u.id] = true;
  sc.emit(makeEvent('floor', sc.atMs, { floor: w.towerFloor, by }));
  w.towerFloor += 1;
}

/** The instant the run in `world` runs out of time in the room standing (or about to stand), for every hero in it. */
export function towerEndsAt(world, run = TOWER) {
  const pack = world && world.packs && world.packs[0];
  return pack ? pack.respawnAtMs + towerLimitMs(world.towerFloor, run) : null;
}
