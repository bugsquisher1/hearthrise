// src/core/hunt-spawn.js — a hunt instance's world: made, joined and left (dual-runtime: browser + Deno edge).
//
// `huntFor` resolves a combat pointer to its named hunt. The pull cycle's spawn
// roll is src/core/hunt/pull-cycle.js (every pack spawns from its pocket's
// rows): the C2 single-foe `pickSpawn` was retired with the single-foe swing
// (HUNT_SCREEN_SPEC §1.1 one-path table; lane S1, 2026-10-17).
import { HUNT_INDEX } from '../data/hunts.js';
import { densityFor, partyPick } from '../data/hunt-grounds.js';
import { MONSTERS } from '../data/monsters.js';
import { HUNT_ROLES, roleForWeapon, disciplineOf } from '../data/hunt-roles.js';
import { disciplineAbilities, ABILITIES } from '../data/abilities.js';
import { makeUnit, makeWorld } from './hunt/world-state.js';
import { spawnPack, pullLeader, PHASE } from './hunt/pull-cycle.js';
import { pickLeader, settingsOf } from './hunt/roles.js';
import { heroSlots, heroStopRules, stopRulesProblem } from './hunt/conditions.js';
import { isHero } from './hunt/sides.js';
import { normalize, grantsOf } from './talents.js';
import { wornTraitsOf } from './hunt/trait-rules.js';
import { wornSignatureOf } from './hunt/signature-rules.js';
import { wornImbuesOf } from './imbue.js';

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
 * takes its defaults); its stop rules, density and settings: ONLY the ones the stored
 * options set. A setting the player left unset is its role's default for the party as it
 * stands in the world at each boundary, which only the engine knows (roles.settingsOf, read
 * by combat-sim.js syncUnit and heroUnit): a hero is the same whatever party read it.
 * Null when the weapon has no role.
 *
 * BORROWED MOVES (src/core/borrow-blow.js, src/core/hunt/talent-rows.js lend): the moves of another weapon this hero may hold, ONE list
 * (`borrowed`): the ones the server's build lends at its Level (`talents`, hr_talents_view's nodes: src/core/talents.js grantsOf, each at
 * its band's penalty and opening Level), and `o.borrowed`, a borrow handed whole (the Lab's and the tests' seam: an ability id, or
 * { move, penaltyPm } to price it; the edge's settle never hands one, hr-accrue/hunt-settle.js). They join its discipline's for the bar,
 * each reads its native weapon's blow, and each plays 17 section 3's rules (heals on Mend's clock, Magic at Mend's rate, native reach).
 *
 * @param o { weaponType (the role key), options (player_action_sets.options), bar (the stored slots), lead (leads its party), borrowed,
 *            hold (the party's hold seat: hunt_parties.hold_seat, null = take turns),
 *            leaveTogether (the hero's "Leave if anyone leaves the hunt or dies"),
 *            wornTraits, wornSignature, wornImbues (the server's projections, hr_hunt_instance_read), readAtMs (the hunt session's
 *            settled_to that read stood at: a worn imbuement's msLeft counts from it) }
 */
export function heroSetup(o) {
  const opt = (o && o.options && typeof o.options === 'object') ? o.options : {};
  const role = roleForWeapon(o.weaponType || 'neutral', opt.role);
  if (!role) return null;
  const row = HUNT_ROLES[role];
  const native = disciplineAbilities(disciplineOf(o.weaponType || 'neutral'));
  const discipline = disciplineOf(o.weaponType || 'neutral');
  /* THE ROADS (src/core/talents.js): the build the server projected (hr_talents_view `nodes`, none while the switch is off) and the
     moves it lends at the hero's Level (`level`: the window's start; a borrow only opens, so the bar holds every one it may cast) */
  const talents = o.talents && typeof o.talents === 'object' ? normalize(o.talents) : null;
  const lent = talents ? grantsOf(talents, discipline, o.level).borrowed : [];
  /* a borrow handed whole: an id, or { move, penaltyPm } (its price, permille off what it lands, 1..999) */
  const handed = Array.isArray(o.borrowed) ? o.borrowed : [];
  const handedId = (b) => (typeof b === 'string' ? b : b && typeof b === 'object' && typeof b.move === 'string' ? b.move : null);
  /* a borrowed move: an ability row of another discipline, once (a universal row is every weapon's already) */
  const borrowed = [...new Set([...handed.map(handedId), ...lent])].filter((id) => typeof id === 'string'
    && Object.prototype.hasOwnProperty.call(ABILITIES, id) && !ABILITIES[id].universal && !native.includes(id));
  /* the handed prices, for the borrowed moves the build does not lend (the build's own band prices those: lentModsOf) */
  const lentPm = {};
  for (const b of handed) if (b && typeof b === 'object' && borrowed.includes(b.move) && !lent.includes(b.move)
    && Number.isInteger(b.penaltyPm) && b.penaltyPm > 0 && b.penaltyPm < 1000) lentPm[b.move] = b.penaltyPm;
  const allowed = native.concat(borrowed);
  /* THE TRAITS IT WEARS (src/core/hunt/trait-rules.js): the server's projection of its worn pieces' Traits, [{ id, rank }]. DARK: nothing
     hands one while GEAR_STEPS.traitsLive is false (tests/hunt-core/trait-rules.mjs dark); the Lab and the tests do */
  const worn = wornTraitsOf(o.wornTraits);
  /* THE SIGNATURE IT PLAYS (src/core/hunt/signature-rules.js): the first it equipped, the server's projection. DARK: nothing hands one while
     SIGNATURE_RULES.live is false (tests/hunt-core/signature-rules.mjs dark) */
  const sg = wornSignatureOf(o.wornSignature);
  /* THE IMBUEMENTS IT WEARS (src/core/imbue.js): the server's projection of hero_worn_imbue, [{ id, band, msLeft }], one a kind, each to
     readAtMs + msLeft. DARK: nothing hands one while the `imbuements` switch is off; the Lab and the tests do (no readAtMs: the span) */
  const imb = wornImbuesOf(o.wornImbues, o.readAtMs);
  const pick = (k, dv) => (opt[k] === undefined || opt[k] === null ? dv : opt[k]);
  /* the player's own setting, or no key at all (its default is the engine's to read, for the party standing then) */
  const own = (k, as) => (opt[k] === undefined || opt[k] === null ? {} : { [as]: opt[k] });
  const stops = Array.isArray(opt.stop_rules) && !stopRulesProblem(opt.stop_rules) ? opt.stop_rules : [];
  return {
    role,
    /* THE BAR as the engine runs it (conditions.js heroSlots): the stored slots the
       hero's discipline can act on, then an empty ability lane's role rule set
       (ROLE_RULES) and, for a hero whose bar holds nothing, the start kit's bar. */
    slots: heroSlots(o.bar, role, (id) => allowed.includes(id)),
    borrowed,
    /* a handed borrow's price (talent-rows.js lentModsOf); absent with none */
    ...(Object.keys(lentPm).length ? { lentPm: Object.freeze(lentPm) } : {}),
    /* the build and the weapon's discipline the settle grants it on at every boundary (combat-sim.js syncUnit); absent with no build */
    ...(talents ? { talents: Object.freeze(talents), discipline } : {}),
    /* the Traits as the engine plays them (unknown ids and ranks dropped, the key rule applied); absent with none */
    ...(worn ? { wornTraits: worn } : {}),
    /* the Signature as the engine plays it (an unknown id dropped, one a hero); absent with none */
    ...(sg ? { wornSignature: sg } : {}),
    /* the imbuements as the engine plays them (unknown, spent and doubled kinds dropped); absent with none */
    ...(imb ? { wornImbues: imb } : {}),
    stopRules: heroStopRules(stops),
    /* MONSTER DENSITY: the stored pick; the span clamps it to the ground (hunt-grounds.js densityFor). In a
       party only the LEADER's counts (`lead`, the server's hr_hunt_instance_read `leads`; partyPick). */
    density: Number.isInteger(opt.density) ? opt.density : 0,
    /* THE DANGER SCALE'S PLAN (src/core/hunt/danger.js riskOf, lane/v1-climb): a risk stance and the step the hunt starts at; a stance the
       engine does not know plays off the scale. Only the party leader's counts. Absent on a hero whose plan names none. */
    ...(typeof opt.risk === 'string' && opt.risk ? { risk: opt.risk, danger: Number.isInteger(opt.danger) && opt.danger >= 0 ? opt.danger : 0 } : {}),
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
    settings: { ...own('distance', 'dist'), ...own('chase', 'chase'), ...own('target_mode', 'tmode'), ...own('stance', 'stance'),
      ...kindPick(opt.target_kind), ...rowPick(opt.row) },
  };
}

/* THE ROW (src/core/hunt/monster-roles.js rowOf; wave 2): 'front' or 'back' from the plan, the server's `row` on the options it reads, as
   settings' `row`; absent, the hero's role decides. Anything else is none. */
const rowPick = (v) => (v === 'front' || v === 'back' ? { row: v } : {});

/* THE KIND FIRST (targeting.js kindOf; the Krell's Hold design's engine piece 4, remembered per ground): the monster kind the hero
   takes first on this ground, the server's `target_kind` on the options it reads (a MONSTERS id), as settings' `tkind`; absent with
   none. Anything but a catalogue id is none, so a forged or stale value only ever falls back to the Target setting alone. */
const kindPick = (v) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(MONSTERS, v) ? { tkind: v } : {});

/* One hero unit: the server-read hero at `tile`, its own settings over its role's
   defaults for the party in the world with it (roles.settingsOf, which the settle asks
   again at every boundary: combat-sim.js syncUnit). */
function heroUnit(id, h, partyRoles, tile) {
  const s = settingsOf(h.role, h.settings, partyRoles);
  const [x, y] = tile;
  const u = makeUnit({ id, side: 'hero', kind: h.role, pocket: null, alive: true, hp: h.hp ?? h.maxHp, maxHp: h.maxHp,
    x, y, fx: x, fy: y, speed: HUNT_ROLES[h.role].speed, role: h.role, dist: s.dist, chase: s.chase, tmode: s.tmode,
    stance: s.stance, acc: h.acc, maxHit: h.maxHit, def: h.def || 0, element: h.element || '',
    mana: h.mana ?? h.maxMana ?? 0, maxMana: h.maxMana || 0, regenPm: h.regenPm || 1000 });
  /* THE KIND FIRST is not persisted (the settle writes it at every boundary, combat-sim.js syncUnit): set on the unit it joins with */
  const tkind = h.settings && h.settings.tkind;
  if (typeof tkind === 'string') Object.assign(u, { tkind });
  /* THE ROW, the same (monster-roles.js rowOf) */
  const row = h.settings && h.settings.row;
  if (row === 'front' || row === 'back') Object.assign(u, { row });
  return u;
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
 * `o.tier` (the swing's dial, src/core/hunt/dial.js: the Danger scale step's, null = the rows as written) is the dial the first packs
 * spawn on, as every respawn does; `o.monsters` the rows they spawn from (combat-sim.js huntPlayOf; the catalogue when absent). `o.tower` ({ floor, atMs }: the
 * Burning Tower, src/core/hunt/tower.js) is the floor whose room stands first and the instant it stands (its time starts there).
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
  /* THE BURNING TOWER: the floor is a working value of the span (never encoded); the room's start is the pocket's persisted respawn instant. */
  if (o && o.tower) /** @type {any} */ (world).towerFloor = o.tower.floor;
  const inst = { world, ground, grid, occ: null, tier: (o && o.tier) || null, makeUnit, monsters: (o && o.monsters) || MONSTERS };
  for (let p = 0; p < ground.pockets.length; p++) spawnPack(inst, p, null);
  if (o && o.tower) /** @type {any} */ (world).packs[0].respawnAtMs = o.tower.atMs;
  return world;
}

/**
 * A HERO JOINS A RUNNING INSTANCE at its seat's entrance tile, as the next unit
 * id (ids stay ascending: world-state.validate). The pull leader is re-read
 * (pull-cycle.js pullLeader). Answers the new unit id.
 */
export function joinHero(world, ground, hero, seat) {
  const roles = world.units.filter((u) => isHero(u)).map((u) => u.role).concat([hero.role]);
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
