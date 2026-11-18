// ============================================================
// src/core/hunt/tower.js — THE BURNING TOWER'S FLOORS IN THE ONE ENGINE (src/data/tower.js; Tyler 2026-11-14; the board's
// "2026-11-14 The Burning Tower" §2)
//
// A climb is a hunt instance on the Tower's ground (hunt-grounds.js TOWER_GROUNDS, `tower`), settled by src/core/combat-sim.js like
// any hunt, viewed or not (CLAUDE.md §6). Its session mode (session-modes.js `tower`) decides what a death costs and what a kill pays;
// these rules decide what stands in the room, and every one lives here so the hunt files carry one call each:
//
//   A FLOOR IS ONE ROOM (towerRoom, towerPull): TOWER_RULES.roomSize monsters picked from the rosters of the open grounds whose band
//     holds Level F (balance-sheet.js GROUND_ROSTER, hunts.js bands; "the fire remembers what was fed to it"), a deterministic pick by
//     floor number, no dice. A LANDING (every landingEvery-th floor) puts its Keeper in the first slot: one of them at the formula's
//     `boss` role, a kind no other slot of the room takes. Bosses of the grounds never stand in the Tower.
//   ITS ROWS ARE THE STAT FORMULA AT LEVEL F (towerMonsters): every roster monster at its own role and art tier, Level F, on a floor-F
//     ground of the Tower's fit, no coin and no drops: the ONE table a swing reads (world-step.js inst.monsters, hunt-rewards.js
//     ctx.monsters) while floor F stands. A floor above floorTop plays floorTop's rows.
//   THE STAIR (towerCleared, from pull-cycle.js runPhase): when the room's last monster falls, every hero standing in it clears floor F
//     (a `floor` event naming them), F moves on, and the next room stands TOWER_RULES.stairMs later (the pocket's respawn: the ground's
//     respawnMs IS the stair). At least two swings, so a floor's rows only change at a swing boundary with none of its monsters standing.
//   THE FLOOR'S TIME (towerEndsAt -> action-rules.js `floor_time`): a room not cleared floorLimitMs after it stood (landingLimitMs on a
//     landing) ends the climb for everyone in it.
//
// WHERE THE FLOOR LIVES. Not in the stored world (its shape does not move): the server keeps it (tower_runs, 2027-04-24-tower-climb.sql)
// and hands the engine the floor whose room stands, or stands next, at every window's start (hr_hunt_instance_read `tower_floor`: the
// run's start, or the highest floor its heroes cleared + 1). Inside a span it is `world.towerFloor`, a working value combat-sim.js sets
// from that read and the stair moves; it is never encoded. The instant the room stood is the pocket's own persisted respawnAtMs (the
// first room's is the world's first instant), so a window cut anywhere ends a floor at the same instant (TICK-1).
//
// Draws nothing. PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { TOWER_RULES, TOWER_PARTY_XP, validateTower } from '../../data/tower.js?v=0.2.139';
import { formulaStats, GROUND_ROSTER, MONSTER_ROLES } from '../../data/balance-sheet.js?v=0.2.139';
import { MONSTERS } from '../../data/monsters.js?v=0.2.139';
import { OPEN_HUNTS } from '../../data/hunts.js?v=0.2.139';
import { COMBAT_BALANCE } from '../combat.js?v=0.2.139';
import { hashSeed } from '../rng.js?v=0.2.139';
import { makeEvent } from './events.js?v=0.2.139';

/* The stair against the engine's swing (src/data/tower.js leaves this check to the one place the swing is known). */
{
  const bad = validateTower(TOWER_RULES, TOWER_PARTY_XP, COMBAT_BALANCE.tickMs);
  if (bad.length) throw new Error('src/core/hunt/tower.js: the Tower\'s rules do not hold against the engine: ' + bad.join('; '));
}

/** The Tower's rules when `ground` is the Tower, else null. */
export function towerOf(ground) {
  return ground && ground.tower === true ? TOWER_RULES : null;
}

/** The Level floor `floor` plays at: the floor itself, from 1, never past floorTop. */
export function towerLevelOf(floor) {
  return Math.min(Math.max(1, Math.floor(Number(floor) || 1)), TOWER_RULES.floorTop);
}

/** Is floor `floor` a landing (its room holds a Keeper)? */
const isLanding = (floor) => Number.isInteger(floor) && floor > 0 && floor % TOWER_RULES.landingEvery === 0;

/** How long floor `floor`'s room may stand before the climb ends `floor_time`. */
const towerLimitMs = (floor) => (isLanding(floor) ? TOWER_RULES.landingLimitMs : TOWER_RULES.floorLimitMs);

/* THE LADDER the rooms are picked from: every OPEN hunt with a roster, its band and its monsters' roles (a monster on two grounds keeps
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

/* The monsters floor F's room may hold: every non-boss roster monster of the grounds whose band holds its Level (past the top band,
   the top band's), sorted. */
function poolAt(floor) {
  const L = Math.min(towerLevelOf(floor), ladder().top);
  const ids = new Set();
  for (const b of ladder().bands) if (L >= b.floor && L <= b.top) for (const id of b.ids) ids.add(id);
  return [...ids].sort();
}

/**
 * FLOOR F'S ROOM: roomSize monster ids, slot by slot, picked by the floor's number (no dice: the same room on every path and every
 * cut). On a landing, slot 0 is the Keeper, a kind no other slot of the room takes (its row is the boss role's, the room's other
 * kinds their own role's). Answers { monsters: [id], keeper: id | null }.
 */
export function towerRoom(floor) {
  const F = Math.max(1, Math.floor(Number(floor) || 1));
  const pool = poolAt(F);
  const keeper = isLanding(F) ? pool[hashSeed('tower', 'keeper', F) % pool.length] : null;
  const rest = keeper ? pool.filter((id) => id !== keeper) : pool;
  const monsters = keeper ? [keeper] : [];
  for (let i = monsters.length; i < TOWER_RULES.roomSize; i++) monsters.push(rest[hashSeed('tower', 'slot', F, i) % rest.length]);
  return { monsters, keeper };
}

/* One monster as it fights on floor F at `role`: the catalogue row with the formula's numbers at Level F, no coin, no drops. */
function rowAt(id, role, floor) {
  const row = MONSTERS[id];
  const L = towerLevelOf(floor);
  const s = formulaStats({ level: L, role, tier: row.tier, floor: L, fit: TOWER_RULES.fit, ground: TOWER_RULES.hunt });
  return Object.freeze({ ...row, level: L, hp: s.hp, atk: s.atk, baseAcc: s.baseAcc, def: s.def, xp: s.xp, gp: Object.freeze([0, 0]),
    drops: Object.freeze([]) });
}

/* A few floors' tables, kept: a span walks one floor at a time, and the live view and the settle the same few. */
const TABLES = new Map();
const KEEP = 8;

/**
 * THE TABLE A SWING READS WHILE FLOOR F STANDS: the catalogue with every roster monster of the ladder on its floor-F row (so a kind
 * left standing by another deploy's room still fights at Level F) and, on a landing, the Keeper's kind on the boss role's.
 */
export function towerMonsters(floor) {
  const F = Math.max(1, Math.floor(Number(floor) || 1));
  const hit = TABLES.get(F);
  if (hit) return hit;
  const table = Object.assign({}, MONSTERS);
  for (const [id, role] of ladder().roles) table[id] = rowAt(id, role, F);
  const { keeper } = towerRoom(F);
  if (keeper) table[keeper] = rowAt(keeper, 'boss', F);
  if (TABLES.size >= KEEP) TABLES.delete(TABLES.keys().next().value);
  TABLES.set(F, Object.freeze(table));
  return TABLES.get(F);
}

/**
 * THE MOST ONE KILL ON FLOOR F CAN PAY, in Level XP before its mode and its party share: the formula's XP at Level F at the best-paying
 * role (art tier moves a blow, never the XP). The server's bound for the floor (hr_tower_floors, tools/gen-tower.mjs) is this.
 */
export function towerXpMax(floor) {
  const L = towerLevelOf(floor);
  let best = 0;
  for (const role of Object.keys(MONSTER_ROLES)) {
    best = Math.max(best, formulaStats({ level: L, role, tier: 1, floor: L, fit: TOWER_RULES.fit, ground: TOWER_RULES.hunt }).xp);
  }
  return best;
}

/** The rows floor `floor`'s room spawns (pull-cycle.js spawnPack): its monsters on the pocket's own spawn tiles, slot by slot. */
export function towerPull(inst, p) {
  const spots = inst.ground.pockets[p].spawns;
  return towerRoom(inst.world.towerFloor).monsters.map((monster, i) => ({ monster, x: spots[i % spots.length].x, y: spots[i % spots.length].y }));
}

/**
 * THE STAIR (pull-cycle.js runPhase: the room's last monster is down). Every hero standing in the room clears the floor (a `floor` event:
 * `floor` the number, `by` the unit ids of the heroes standing, as a flat object), the floor moves on, and the next room stands
 * stairMs from now: the pocket's respawn, and the instant its time starts.
 */
export function towerCleared(inst, sc) {
  const w = inst.world;
  const by = {};
  for (const u of w.units) if (u.side === 'hero' && u.alive) by[u.id] = true;
  sc.emit(makeEvent('floor', sc.atMs, { floor: w.towerFloor, by }));
  w.towerFloor += 1;
}

/** The instant the climb in `world` runs out of time on the floor standing (or about to stand), for every hero in it. */
export function towerEndsAt(world) {
  const pack = world && world.packs && world.packs[0];
  return pack ? pack.respawnAtMs + towerLimitMs(world.towerFloor) : null;
}
