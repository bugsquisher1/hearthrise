// src/core/hunt-spawn.js — a hunt instance's world: made, joined and left (dual-runtime: browser + Deno edge).
//
// `huntFor` resolves a combat pointer to its named hunt. The pull cycle's spawn
// roll is src/core/hunt/pull-cycle.js (every pack spawns from its pocket's
// rows): the C2 single-foe `pickSpawn` was retired with the single-foe swing
// (HUNT_SCREEN_SPEC §1.1 one-path table; lane S1, 2026-10-17).
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.39';
import { densityFor, partyPick } from '../data/hunt-grounds.js?v=0.2.39';
import { HUNT_ROLES, roleForWeapon, disciplineOf } from '../data/hunt-roles.js?v=0.2.39';
import { disciplineAbilities } from '../data/abilities.js?v=0.2.39';
import { makeUnit, makeWorld } from './hunt/world-state.js?v=0.2.39';
import { spawnPack, pullLeader, PHASE } from './hunt/pull-cycle.js?v=0.2.39';
import { pickLeader, defaultSettings } from './hunt/roles.js?v=0.2.39';
import { heroSlots, heroStopRules, stopRulesProblem } from './hunt/conditions.js?v=0.2.39';

/** The named hunt a combat pointer names, or null (a monster id / unknown). */
export function huntFor(activeId) {
  return (typeof activeId === 'string' && HUNT_INDEX[activeId]) || null;
}

/**
 * A CHARACTER'S HERO IN A HUNT, from server-read values only (spec §3.2 #1,
 * §3.7): its role from the worn set's ROLE KEY (hunt-roles.js wornRoleKey: the
 * weapon and the shield beside it; never the outfit), a staff's Mage / Healer pick
 * from its options; its bar, the stored slots (conditions.js: an ability outside
 * the key's discipline, hunt-roles.js ROLE_KEYS, is dropped; a lane the bar leaves empty
 * takes its defaults); its stop rules, density and settings, the stored options
 * over its role's defaults for this party (`partyRoles`, roles.defaultSettings).
 * Null when the weapon has no role.
 *
 * @param o { weaponType (the role key), options (player_action_sets.options), bar (the stored slots), partyRoles, lead (leads its party),
 *            hold (the party's hold seat: hunt_parties.hold_seat, null = take turns),
 *            leaveTogether (the hero's "Leave if anyone leaves the hunt or dies") }
 */
export function heroSetup(o) {
  const opt = (o && o.options && typeof o.options === 'object') ? o.options : {};
  const role = roleForWeapon(o.weaponType || 'neutral', opt.role);
  if (!role) return null;
  const row = HUNT_ROLES[role];
  const allowed = disciplineAbilities(disciplineOf(o.weaponType || 'neutral'));
  const roles = Array.isArray(o.partyRoles) && o.partyRoles.length ? o.partyRoles : [role];
  const d = defaultSettings(role, roles);
  const pick = (k, dv) => (opt[k] === undefined || opt[k] === null ? dv : opt[k]);
  const stops = Array.isArray(opt.stop_rules) && !stopRulesProblem(opt.stop_rules) ? opt.stop_rules : [];
  return {
    role,
    /* THE BAR as the engine runs it (conditions.js heroSlots): the stored slots the
       hero's discipline can act on, then an empty ability lane's role rule set
       (ROLE_RULES) and, for a hero whose bar holds nothing, the start kit's bar. */
    slots: heroSlots(o.bar, role, (id) => allowed.includes(id)),
    stopRules: heroStopRules(stops),
    /* MONSTER DENSITY: the stored pick; the span clamps it to the ground (hunt-grounds.js densityFor). In a
       party only the LEADER's counts (`lead`, the server's hr_hunt_instance_read `leads`; partyPick). */
    density: Number.isInteger(opt.density) ? opt.density : 0,
    lead: o.lead === true,
    /* WHO HOLDS THE PACK (Tyler 2026-10-22): the seat whose tank holds every lap, the leader's pick (only a
       leading hero carries it; combat-sim.js holdPick); null = the tanks take turns. */
    hold: o.lead === true && Number.isInteger(o.hold) && o.hold >= 0 ? o.hold : null,
    /* LEAVE TOGETHER (Tyler 2026-10-22): the hero's own box "Leave if anyone leaves the hunt or dies", the
       server's player_state.party_leave_together (default on) read by the settle (hr_hunt_instance_read
       `leave_together`); anything but an explicit true is off, so an engine reading a server that does not
       carry it yet sends nobody home (combat-sim.js cascadeFrom). */
    leaveTogether: o.leaveTogether === true,
    /* THE GATHERING SHARE: stored, INERT until the gathering engine lands (hunt-sessions.js GATHER_SHARE). */
    gatherShare: Number.isInteger(opt.gather_share) ? opt.gather_share : 0, gatherInert: true,
    actionSet: pick('action_set', 'hunt'),
    range: row.range,
    element: '',
    settings: { dist: pick('distance', d.dist), chase: pick('chase', d.chase), tmode: pick('target_mode', d.tmode),
      stance: pick('stance', d.stance) },
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
    mana: h.mana ?? h.maxMana ?? 0, maxMana: h.maxMana || 0, regenPm: h.regenPm || 1000 });
}

/**
 * A NEW HUNT INSTANCE'S WORLD (HUNT_SCREEN_SPEC §1.1 #4, §3.2): the party at the
 * ground's entrance (seat i on `ground.start[i]`), every pack spawned, the leader
 * picked by role order, phase travel. A solo hunt is a party of one.
 *
 * `party` is [{ role, maxHp, hp?, acc, maxHit, def, element, maxMana?, mana?, settings? }],
 * each a server-read hero: `role` a src/data/hunt-roles.js id, `acc` permille,
 * `settings` the character's own { dist, chase, tmode, stance } (an absent key
 * takes the role's default for this party). Heroes are units 1..n. `o.density`, when given,
 * is the density the packs spawn at (the settle's whole entering party), else the party's own.
 */
export function newHuntWorld(ground, grid, party, o) {
  if (!Array.isArray(party) || !party.length || party.length > ground.start.length) {
    throw new Error('newHuntWorld: a party of 1..' + ground.start.length + ' heroes');
  }
  const roles = party.map((h) => h.role);
  const units = party.map((h, i) => heroUnit(i + 1, h, roles, ground.start[i]));
  const world = makeWorld({ ground: ground.id, swing: 0, leader: pickLeader(units), phase: PHASE.TRAVEL,
    routeIdx: 0, nextId: units.length + 1, packs: ground.pockets.map(() => ({ aggro: false, holder: null })),
    /* MONSTER DENSITY: the leader's pick (partyPick: the hero flagged `lead`, else the first), clamped to the ground
       for this party size; `o.density` when the settle opens the world for a party still walking in (combat-sim). */
    density: o && Number.isInteger(o.density) ? o.density
      : densityFor(ground, party.length, partyPick(party.map((h, i) => ({ density: h.density, lead: h.lead === true, seat: i })))) });
  world.units = units;
  const inst = { world, ground, grid, occ: null, makeUnit };
  for (let p = 0; p < ground.pockets.length; p++) spawnPack(inst, p, null);
  return world;
}

/**
 * A HERO JOINS A RUNNING INSTANCE at its seat's entrance tile, as the next unit
 * id (ids stay ascending: world-state.validate). The pull leader is re-read
 * (pull-cycle.js pullLeader). Answers the new unit id.
 */
export function joinHero(world, ground, hero, seat) {
  const roles = world.units.filter((u) => u.side === 'hero').map((u) => u.role).concat([hero.role]);
  const id = world.nextId;
  world.nextId += 1;
  world.units.push(heroUnit(id, hero, roles, ground.start[Math.max(0, seat) % ground.start.length]));
  world.leader = pullLeader({ world });
  return id;
}

/**
 * A HERO LEAVES the instance (its session ended): the unit goes, every monster on
 * it drops its target, and a pack it held loses its holder. The pull leader is
 * re-read (pullLeader); with no hero left the party is gone and `leader` is null.
 */
export function leaveHero(world, unitId) {
  world.units = world.units.filter((u) => u.id !== unitId);
  for (const u of world.units) if (u.target === unitId) u.target = null;
  for (const p of world.packs) if (p.holder === unitId) { p.holder = null; p.aggro = false; }
  if (world.leader === unitId || !world.units.some((u) => u.id === world.leader)) world.leader = pullLeader({ world });
}
