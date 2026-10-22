// ============================================================================
// tests/hunt-fixture.mjs — A FIGHT IS A HUNT INSTANCE: ONE FIXTURE SHAPE FOR IT.
//
// Not a guard: a helper the guards import. Since lane S1 every fight is a hunt
// INSTANCE (HUNT_SCREEN_SPEC §1.1): a world of units on a ground, stepped by the
// ONE loop (src/core/combat-sim.js simulateHuntInstance) and priced by the ONE
// settle (supabase/functions/hr-accrue/accrual.js accrueHunt). The single-foe
// span (`simulateSpan`, `state.huntSession`, the pull cycle) is deleted. Guards
// that MEASURE a fight (kill rates, drop reach, consumption, goal counters, XP
// routing) put it on an instance, and they all do it the same way, here.
//
// Nothing here is a second engine: it only fills the inputs the one engine
// reads — a fixture GROUND (one open room, one pocket of the measured monster),
// a hero built by src/core/hunt-spawn.js heroSetup, the session by
// src/core/action-rules.js newHuntSession, and the instance's keyed seeder
// (supabase/functions/hr-accrue/hunt-seed.js seederFor).
//
//   huntAccrual(inp, opts)    a computeAccrual-shaped caller: the pointer-era
//                             combat input (activeId = a monster or a hunt id)
//                             settled as ONE instance window through accrueHunt;
//                             answers { accrued, reason?, delta, hunt, summary,
//                             events, levelUps, maxHp, world }. A non-combat
//                             input goes to computeAccrual untouched.
//   huntSpan(state, ctx, opts) a direct engine caller (opts.windowMs cuts it into windows): the test's own state, fx,
//                             rolls and perks as ONE member of an instance, run
//                             through simulateHuntInstance over [ctx.fromMs,
//                             ctx.toMs); answers the member's summary
//                             { ticks, kills, deaths, deathLog, … }.
//
// opts: { seed, food, foodQty, bag, hoursLimit, respawnMs, count, engine,
//         onEmpty, stamina }
//   food/foodQty   loaded into the session bag (own stock; a hero eats under
//                  its food threshold)
//   respawnMs      the fixture pocket's respawn (default 2 s: the measured
//                  monster is always there, so a rate is the fight's, not the walk's)
//   count          copies of the monster in the pocket (default 1)
//
// NO ?v= on the imports (tests/**, not a browser module — b332).
// ============================================================================

import { newHuntSession } from '../src/core/action-rules.js';
import { simulateHuntInstance } from '../src/core/combat-sim.js';
import { heroSetup } from '../src/core/hunt-spawn.js';
import { roleWeaponOf } from '../src/data/hunt-roles.js';
import { makeGrid } from '../src/core/hunt/grid.js';

import { COMBAT_BALANCE } from '../src/core/combat.js';
import { vitalsOf } from '../src/core/vitals.js';
import { HUNT_INDEX } from '../src/data/hunts.js';
import { MONSTERS } from '../src/data/monsters.js';
import { seederFor } from '../supabase/functions/hr-accrue/hunt-seed.js';
import { accrueHunt, computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { levelsOf } from '../src/core/xp.js';

/** hr_seed's text shape (a signed 64-bit integer), from any integer seed. */
export const secretOf = (seed) => String(BigInt.asIntN(64, BigInt(Math.floor(Number(seed) || 0)) * 2654435761n + 1n));
export const FIXTURE_INSTANCE = '00000000-0000-4000-8000-00000000f17e';

/* ONE OPEN ROOM, 14 x 7, walls round it; the heroes start on the west side and
   the one pocket fills the east half. */
const W = 14; const H = 7;
const open = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
export const FIXTURE_GRID = makeGrid(W, H, open, (x, y) => !open(x, y));

/** The monsters a pointer-era `activeId` names: a monster id, or a hunt's spawns. */
export function monstersOf(activeId, monsters) {
  const cat = monsters || MONSTERS;
  if (cat[activeId]) return [activeId];
  const h = HUNT_INDEX[activeId];
  if (h) return h.spawns.map((s) => s.monster).filter((id) => cat[id]);
  throw new Error(`hunt-fixture: '${activeId}' is neither a monster nor a hunt`);
}

/** The fixture ground: one pocket of `ids` (each `count` times), respawning every `respawnMs`. */
export function fixtureGround(ids, o) {
  const x = o || {};
  const n = Math.max(1, Math.floor(Number(x.count) || 1));
  const spawns = [];
  ids.forEach((id, i) => { for (let k = 0; k < n; k++) spawns.push({ monster: id, x: 8 + ((i * n + k) % 4), y: 2 + Math.floor((i * n + k) / 4) % 3 }); });
  return { id: 'fixture_room', hunt: 'fixture', map: 'fixture_room', start: [[2, 3], [2, 2], [2, 4], [3, 3]],
    pockets: [{ room: [6, 1, 12, 5], spawns }], route: [0],
    respawnMs: Math.max(1000, Math.floor(Number(x.respawnMs) || 2000)), pullDist: 1.5 };
}

function bagOf(o) {
  return o.bag || (o.food ? { [o.food]: { loaded: Math.floor(Number(o.foodQty) || 0) } } : {});
}

/** A hunt session as the server stores it, for a fixture. */
export function huntSessionFor(opts) {
  const o = opts || {};
  const fromMs = Math.floor(Number(o.fromMs) || 0);
  return newHuntSession({
    id: o.id || 'fixture-hunt', instanceId: FIXTURE_INSTANCE,
    huntFromMs: fromMs, nextSwingAtMs: fromMs, bag: bagOf(o),
    hoursLimit: o.hoursLimit ?? null,
    onEmpty: o.onEmpty || 'end',
    staminaMs: o.stamina ?? null,
  });
}

/**
 * A pointer-era combat input settled as ONE instance window.
 * inp: { activeKind, activeId, nowMs, accruedToMs, seed, skills, levelXp, xpFrac, hp,
 *        gold, equipment, inventory, perks, items, monsters, hearthfindReady, … }
 *        (computeAccrual's names; max HP and mana are derived from Level and armour).
 */
export function huntAccrual(inp, opts) {
  const o = opts || {};
  /* opts.engine: a loaded copy of accrual.js (a mutation harness); the shipped one by default. */
  const eng = o.engine || { accrueHunt, computeAccrual };
  if (!inp || inp.activeKind !== 'combat') return eng.computeAccrual(inp);
  const fromMs = Math.floor(Number(inp.accruedToMs) || 0);
  const toMs = Math.floor(Number(inp.nowMs) || 0);
  const monsters = inp.monsters || MONSTERS;
  const ids = monstersOf(inp.activeId, monsters);
  /* The ROLE key, as hunt-settle.js memberInput reads it (hunt-roles.js roleWeaponOf: a magic weapon by its
     discipline, wand = Mage, staff = Healer); no weapon fights as the sword fixture, as before. */
  const worn = (inp.items || {})[(inp.equipment || {}).weapon];
  const weaponType = worn ? roleWeaponOf(worn) : 'sword';
  const hero = heroSetup({ weaponType, options: o.options || {}, bar: o.bar || [], partyRoles: [] })
    || heroSetup({ weaponType: 'sword', options: {}, bar: [], partyRoles: [] });
  const member = {
    key: 'fixture', user: inp.userId || 'fixture', slot: inp.slot || 0, seat: 0, unitId: null,
    sessionId: 'fixture-hunt', version: 1, huntId: String(inp.activeId || ''),
    huntSession: { id: 'fixture-hunt', instanceId: FIXTURE_INSTANCE, huntFromMs: fromMs, nextSwingAtMs: fromMs, swingIndex: 0,
      bag: bagOf(o), hoursLimit: o.hoursLimit ?? null,
      onEmpty: o.onEmpty || 'end', staminaMs: o.stamina ?? null, staminaMaxMs: o.stamina ?? 0 },
    skills: inp.skills || {}, levelXp: inp.levelXp ?? 0, xpFrac: inp.xpFrac ?? null, hp: inp.hp, gold: inp.gold || 0,
    equipment: inp.equipment || {}, inventory: inp.inventory || {},
    deathsTodayBefore: 0, deathsLifetimeBefore: 0,
    hearthfindReady: inp.hearthfindReady === true, perks: inp.perks || null, buffs: inp.buffs ?? null, hero,
  };
  const out = eng.accrueHunt({
    instance: { id: FIXTURE_INSTANCE, nextSwingAtMs: fromMs, world: null },
    window: { fromMs, toMs }, secret: secretOf(o.seed ?? inp.seed ?? 1),
    ground: fixtureGround(ids, o), grid: FIXTURE_GRID, items: inp.items || {}, monsters, members: [member],
  });
  if (!out.accrued) return out;
  const m = out.members[0];
  return { accrued: true, world: out.world, settledTo: out.settledTo, ...m };
}

/** The pointer-era fixture's name for the same thing (one window, one instance). */
export function onTrainingHunt(inp, opts) { return huntAccrual(inp, opts); }

/**
 * The test's own fight as ONE member of an instance.
 * state: { activeMonster, playerHp, playerMaxHp?, skills, levelXp?, stats, gold, … }
 *        (max HP / mana / regen default to vitals.js's for the state's Level, no armour)
 * ctx:   { fromMs, toMs, tickMs?, monsters, family, bonus, weakness, fx,
 *          playerRolls(monster) → { accuracy, maxHit }, def?, hearthfind?, xpMultOf? }
 */
export function huntSpan(state, ctx, opts) {
  const o = opts || {};
  const monsters = ctx.monsters || MONSTERS;
  const id = state.activeMonster || o.monster;
  const row = monsters[id];
  if (!row) throw new Error(`hunt-fixture: no monster '${id}'`);
  state.stats = state.stats || {};
  state.gold = state.gold || 0;
  const v = vitalsOf({ levelXp: state.levelXp || 0, skills: state.skills || {}, equipment: {}, items: {} });
  if (!(state.playerMaxHp > 0)) state.playerMaxHp = v.maxHp;
  if (!(state.playerMaxMana > 0)) state.playerMaxMana = v.maxMana;
  if (!(state.regenPm > 0)) state.regenPm = v.regenPm;
  if (state.levelXp === undefined) state.levelXp = 0;
  const fromMs = Math.floor(Number(ctx.fromMs) || 0) || 1;
  const hs = huntSessionFor({ ...o, fromMs });
  const rolls = (st) => {
    const r = ctx.playerRolls ? ctx.playerRolls(row) : { accuracy: 0.8, maxHit: 5 };
    /* The settle's heroSnapshot to-hit rule (member.js): Defence level + the
       defence of gear outside the armour weights (eq.guardB: a shield, a cape)
       + any defence bonus. The fixture hero wears no weighted armour, so it
       carries no mitigation (ruling K7, src/core/mitigation.js). */
    const bonus = ctx.bonus || (() => 0);
    const def = ctx.def ?? Math.floor((Number(levelsOf(st.skills || {}).defense) || 1)
      + (Number((ctx.eq || {}).guardB) || 0) + (Number(bonus('defense')) || 0));
    return { acc: Math.round(r.accuracy * 1000), maxHit: Math.max(1, Math.floor(r.maxHit)), def };
  };
  const hero = heroSetup({ weaponType: o.weaponType || 'sword', options: o.options || {}, bar: o.bar || [], partyRoles: [] });
  const member = {
    key: 'fixture', seat: 0, unitId: null, hs, state, fx: ctx.fx || {}, family: ctx.family || o.weaponType || 'sword',
    bonus: ctx.bonus || (() => 0), weakness: ctx.weakness || (() => ({ dropMult: 1 })), snapshot: rolls,
    hero: { role: hero.role, element: hero.element || '', settings: hero.settings,
      slots: hero.slots, stopRules: hero.stopRules, density: hero.density, actionSet: hero.actionSet, range: hero.range, ammo: o.ammo || null,
      foodBelowPct: hero.foodBelowPct, drinkBelowPct: hero.drinkBelowPct },
  };
  /* opts.windowMs: the span cut into windows of that length, the world and the
     member carried across each cut the way the settle carries them (TICK-1). */
  const toMs = Math.floor(Number(ctx.toMs) || 0);
  const step = Math.max(0, Math.floor(Number(o.windowMs) || 0));
  const base = { tickMs: ctx.tickMs || COMBAT_BALANCE.tickMs,
    seed: seederFor(secretOf(o.seed ?? 1), FIXTURE_INSTANCE), ground: fixtureGround([id], o), grid: FIXTURE_GRID,
    monsters, hearthfind: ctx.hearthfind, ...(ctx.xpMultOf ? { xpMultOf: ctx.xpMultOf } : {}) };
  let world = null; let next = fromMs; let sim = null; let swings = 0; let kills = 0; let deaths = 0; let ticks = 0; let taken = 0;
  for (let t = step ? Math.min(toMs, fromMs + step) : toMs; ; t = Math.min(toMs, t + step)) {
    sim = simulateHuntInstance({ world, nextSwingAtMs: next, members: [member] }, { ...base, toMs: t });
    world = sim.world; next = sim.nextSwingAtMs; swings += sim.swings;
    const f = sim.members.fixture; kills += f.kills; deaths += f.deaths; ticks += f.ticks;
    for (const e of sim.events) if (e.type === 'dmg' && e.t === member.unitId) taken += e.amount;
    if (t >= toMs || hs.endedReason) break;
  }
  return { ...sim.members.fixture, kills, deaths, ticks, taken, hs, swings, world, events: sim.events };
}
