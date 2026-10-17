// src/core/hunt-spawn.js — a hunt instance's world: made, joined and left (dual-runtime: browser + Deno edge).
//
// `huntFor` resolves a combat pointer to its named hunt. The pull cycle's spawn
// roll is src/core/hunt/pull-cycle.js (every pack spawns from its pocket's
// rows): the C2 single-foe `pickSpawn` was retired with the single-foe swing
// (HUNT_SCREEN_SPEC §1.1 one-path table; lane S1, 2026-10-17).
import { HUNT_INDEX } from '../data/hunts.js?v=590';
import { HUNT_ROLES, roleForWeapon } from '../data/hunt-roles.js?v=590';
import { ABILITIES } from '../data/abilities.js?v=590';
import { makeUnit, makeWorld } from './hunt/world-state.js?v=590';
import { spawnPack, PHASE } from './hunt/pull-cycle.js?v=590';
import { pickLeader, defaultSettings } from './hunt/roles.js?v=590';

/** The named hunt a combat pointer names, or null (a monster id / unknown). */
export function huntFor(activeId) {
  return (typeof activeId === 'string' && HUNT_INDEX[activeId]) || null;
}

/* The abilities a discipline's bar may hold, in data order (the default bar). */
const disciplineBar = (d) => Object.values(ABILITIES).filter((a) => a.disciplines.includes(d)).map((a) => a.id);

/**
 * A CHARACTER'S HERO IN A HUNT, from server-read values only (spec §3.2 #1,
 * §3.7): its role from the equipped weapon TYPE (never the outfit), a staff's
 * Mage / Healer pick from its options; its bar, the stored order of its
 * discipline's abilities (any other id is dropped; empty = the discipline's
 * own order); its settings, the stored options over its role's defaults for
 * this party (`partyRoles`, roles.defaultSettings). Null when the weapon has
 * no role.
 *
 * @param o { weaponType, options (player_action_sets.options), bar (ability ids), partyRoles }
 */
export function heroSetup(o) {
  const opt = (o && o.options && typeof o.options === 'object') ? o.options : {};
  const role = roleForWeapon(o.weaponType || 'neutral', opt.role);
  if (!role) return null;
  const row = HUNT_ROLES[role];
  const allowed = disciplineBar(row.discipline);
  const stored = Array.isArray(o.bar) ? o.bar.filter((id) => allowed.includes(id)) : [];
  const roles = Array.isArray(o.partyRoles) && o.partyRoles.length ? o.partyRoles : [role];
  const d = defaultSettings(role, roles);
  const pick = (k, dv) => (opt[k] === undefined || opt[k] === null ? dv : opt[k]);
  return {
    role,
    bar: stored.length ? stored : allowed,
    actionSet: pick('action_set', 'hunt'),
    range: row.range,
    maxMana: row.mana,
    element: '',
    settings: { dist: pick('distance', d.dist), chase: pick('chase', d.chase), tmode: pick('target_mode', d.tmode),
      stance: pick('stance', d.stance) },
    foodBelowPct: pick('food_below_pct', undefined),
    drinkBelowPct: pick('drink_below_pct', undefined),
  };
}

/* One hero unit: the server-read hero at `tile`, its settings over its role's
   defaults for this party (roles.defaultSettings). */
function heroUnit(id, h, partyRoles, tile) {
  const s = Object.assign(defaultSettings(h.role, partyRoles), h.settings || {});
  const [x, y] = tile;
  return makeUnit({ id, side: 'hero', kind: h.role, pocket: null, alive: true, hp: h.hp ?? h.maxHp, maxHp: h.maxHp,
    x, y, fx: x, fy: y, speed: HUNT_ROLES[h.role].speed, role: h.role, dist: s.dist, chase: s.chase, tmode: s.tmode,
    stance: s.stance, acc: h.acc, maxHit: h.maxHit, def: h.def || 0, element: h.element || '',
    mana: h.mana ?? h.maxMana ?? 0, maxMana: h.maxMana || 0 });
}

/**
 * A NEW HUNT INSTANCE'S WORLD (HUNT_SCREEN_SPEC §1.1 #4, §3.2): the party at the
 * ground's entrance (seat i on `ground.start[i]`), every pack spawned, the leader
 * picked by role order, phase travel. A solo hunt is a party of one.
 *
 * `party` is [{ role, maxHp, hp?, acc, maxHit, def, element, maxMana?, mana?, settings? }],
 * each a server-read hero: `role` a src/data/hunt-roles.js id, `acc` permille,
 * `settings` the character's own { dist, chase, tmode, stance } (an absent key
 * takes the role's default for this party). Heroes are units 1..n.
 */
export function newHuntWorld(ground, grid, party) {
  if (!Array.isArray(party) || !party.length || party.length > ground.start.length) {
    throw new Error('newHuntWorld: a party of 1..' + ground.start.length + ' heroes');
  }
  const roles = party.map((h) => h.role);
  const units = party.map((h, i) => heroUnit(i + 1, h, roles, ground.start[i]));
  const world = makeWorld({ ground: ground.id, swing: 0, leader: pickLeader(units), phase: PHASE.TRAVEL,
    routeIdx: 0, nextId: units.length + 1, packs: ground.pockets.map(() => ({ aggro: false, holder: null })) });
  world.units = units;
  const inst = { world, ground, grid, occ: null, makeUnit };
  for (let p = 0; p < ground.pockets.length; p++) spawnPack(inst, p, null);
  return world;
}

/**
 * A HERO JOINS A RUNNING INSTANCE at its seat's entrance tile, as the next unit
 * id (ids stay ascending: world-state.validate). The leader is re-picked by role
 * order. Answers the new unit id.
 */
export function joinHero(world, ground, hero, seat) {
  const roles = world.units.filter((u) => u.side === 'hero').map((u) => u.role).concat([hero.role]);
  const id = world.nextId;
  world.nextId += 1;
  world.units.push(heroUnit(id, hero, roles, ground.start[Math.max(0, seat) % ground.start.length]));
  world.leader = pickLeader(world.units);
  return id;
}

/**
 * A HERO LEAVES the instance (its session ended): the unit goes, every monster on
 * it drops its target, and a pack it held loses its holder. The leader is
 * re-picked; with no hero left the party is gone and `leader` is null.
 */
export function leaveHero(world, unitId) {
  world.units = world.units.filter((u) => u.id !== unitId);
  for (const u of world.units) if (u.target === unitId) u.target = null;
  for (const p of world.packs) if (p.holder === unitId) { p.holder = null; p.aggro = false; }
  if (world.leader === unitId || !world.units.some((u) => u.id === world.leader)) world.leader = pickLeader(world.units);
}
