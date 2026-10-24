// ============================================================
// src/core/combat-sim.js — ONE COMBAT LOOP. The whole point of this file
// is that there is not a second one.
//
// legacy.js once carried two combat loops (live and away) that drifted for two
// years; nine of their eleven measured differences were one copy-paste gap
// repeated. That is the one-formula mandate (docs/design/away-time-ruling.md),
// and this file is that mandate: a fight is a HUNT INSTANCE (ruling
// HR-2026-10-14; HUNT_SCREEN_SPEC §1.1), solo or party, and every caller — the
// world tick, the player's settle, a collect — reaches it through the one edge
// settle (supabase/functions/hr-accrue/hunt-settle.js). A solo hunt is a party
// of one. There is no away mode and no `ctx.away` (AWAY-1, AWAY-12).
//
// THE LOOP (spec §1.1 engine contract #1). The instance's absolute swing clock
// walks its boundaries in [.., toMs). At each boundary, for every member whose
// own clock stands there (members in key order):
//   the end checks (action-rules.js END_ORDER) — an ended member's hero leaves
//   the world at that boundary;
//   the swing interval is PAID (stamina drains).
// A hero killed in a swing DIES (Tyler 2026-10-19): its death is priced at once
// (action-rules.js deathXpLoss) and its hunt ends `died` at its next boundary;
// it walks home with full HP. No knockout, no falls, no resume. LEAVE TOGETHER
// (Tyler 2026-10-22): when a member's hunt ends for its OWN reason (left, died,
// out of stamina or supplies ...), every other member standing in the world
// whose hero has the box "Leave if anyone leaves the hunt or dies" ticked
// (hero.leaveTogether, the server's player_state.party_leave_together) ends at
// its own next boundary, `party_member_died` or `party_member_left`, paid for
// every swing up to it and nothing for the end; an unticked hero hunts on.
// Then ONE world swing (src/core/hunt/world-step.js stepSwing) moves every unit
// of every member, and src/core/hunt-rewards.js pays what it did, member by
// member, through each member's own `fx` sink. A member still walking in (its
// clock ahead of the boundary) is not in the world yet; the world steps on.
//
// DICE: the swing stream `s` and the roll stream `r`, both indexed by the
// world's own swing counter, from `ctx.seed(domain, index)` — the edge's
// keyed HMAC of the instance secret (supabase/functions/hr-accrue/hunt-seed.js).
// So N windows and one span walk the same swings with the same dice (TICK-1).
// No seeder, or one that answers anything but an unsigned 32-bit integer,
// refuses the swing: an unseeded hunt swing is a predictable one.
//
// Everything impure is INJECTED: the seeder, the ground and its grid, each
// member's fx, perk stack and combat snapshot. PURE ESM. No DOM, no
// window, no timers, no Math.random.
// ============================================================

import { COMBAT_BALANCE } from './combat.js?v=0.2.42';
import { endReasonAt, deathXpLoss, staminaStep } from './action-rules.js?v=0.2.42';
import { createRng } from './rng.js?v=0.2.42';
import { densityFor, partyPick } from '../data/hunt-grounds.js?v=0.2.42';
import { stepSwing } from './hunt/world-step.js?v=0.2.42';
import { makeEvent, trackStep } from './hunt/events.js?v=0.2.42';
import { newHuntWorld, joinHero, leaveHero } from './hunt-spawn.js?v=0.2.42';
import { pullLeader } from './hunt/pull-cycle.js?v=0.2.42';
import { rewardSwing } from './hunt-rewards.js?v=0.2.42';

/* The engine's front door (src/core/index.js `combatSim`). */
export { stepSwing } from './hunt/world-step.js?v=0.2.42';

/* WHY A COMBAT SPAN STOPPED BEFORE THE WINDOW DID — the same contract
   src/core/skill-sim.js and src/core/artisan-sim.js publish under this name.
   `null` means "it ran the whole window". */
export const STOP_REASON = Object.freeze({});

/* The keyed seed of `domain` at `index`, refused unless it is a uint32. */
function seedOf(ctx, domain, index) {
  const f = ctx && ctx.seed;
  if (typeof f !== 'function') throw new Error('simulateHuntInstance: a hunt needs ctx.seed(domain, index) — refusing an unseeded swing');
  const v = f(domain, index);
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) {
    throw new Error('simulateHuntInstance: ctx.seed answered ' + String(v) + ', not an unsigned 32-bit integer');
  }
  return v;
}

/* The pull's pick of these members: the party leader's (hunt-grounds.js partyPick). The SAME call on
   the server's settle and the browser's live view (a peer's `hero` carries `lead`, member.js FROZEN_KEYS). */
const picker = (ms) => partyPick(ms.map((x) => ({ density: x.hero.density, lead: x.hero.lead === true, seat: x.seat })));

/* WHO HOLDS THE PACK (Tyler 2026-10-22): the seat the party leader's hero names (hunt-spawn.js heroSetup `hold`,
   the server's hunt_parties.hold_seat) as that member's unit, or null (the tanks take turns; that seat is not in
   the hunt). The SAME call on the server's settle and the browser's live view (a peer's `hero` carries `hold`). */
function holdPick(ms) {
  const lead = ms.find((x) => x.hero.lead === true);
  const seat = lead && Number.isInteger(lead.hero.hold) ? lead.hero.hold : null;
  const m = seat === null ? null : ms.find((x) => x.seat === seat && Number.isInteger(x.unitId));
  return m ? m.unitId : null;
}

/* A member's hero, as world-state wants it, from the member's server state. */
function heroOf(m) {
  const snap = m.snapshot(m.state);
  return Object.assign({ role: m.hero.role, maxHp: m.state.playerMaxHp, hp: m.state.playerHp,
    maxMana: m.state.playerMaxMana, element: m.hero.element || '', settings: m.hero.settings, density: m.hero.density,
    regenPm: m.state.regenPm }, snap);
}

/* The settings and combat snapshot the settle writes onto a member's unit
   (roles.js / damage.js read them there): the hero's options, its role and its
   gear, skills and Level as they stand NOW, so a level gained mid-window counts
   from the next swing however the window was cut. Max HP and max mana are
   raise-only inside a hunt (a Level is never lost in one: a death ends it). */
function syncUnit(u, m) {
  const snap = m.snapshot(m.state);
  u.acc = snap.acc; u.maxHit = snap.maxHit; u.def = snap.def;
  /* THE ARMOUR'S MITIGATION (ruling K7, mitigation.js): derived from the member's gear and Level at
     every boundary and never persisted, so a decoded world gets it back here before any blow. */
  u.mit = snap.mit || null;
  u.maxHp = Math.max(u.maxHp, m.state.playerMaxHp);
  u.maxMana = Math.max(u.maxMana || 0, m.state.playerMaxMana || 0);
  u.regenPm = m.state.regenPm;
  if (m.hero.settings) {
    const s = m.hero.settings;
    if (s.dist !== undefined) u.dist = s.dist;
    if (s.chase !== undefined) u.chase = s.chase;
    if (s.tmode !== undefined) u.tmode = s.tmode;
    if (s.stance !== undefined) u.stance = s.stance;
  }
}

/* A DEATH (Tyler 2026-10-19): priced on the member at once (Level and every
   combat skill, action-rules.js deathXpLoss) and its hunt ends `died` at the
   member's next boundary (the end checks). A hero dies once: its hunt is over. */
function die(m, f, out) {
  const hs = m.hs;
  if (hs.died) return;
  hs.died = true;
  hs.tally.deaths++;
  m.state.stats = m.state.stats || {};
  m.state.stats.deaths = (m.state.stats.deaths || 0) + 1;
  const xpLost = deathXpLoss(m.state);
  for (const k in xpLost) {
    if (k === 'level') m.state.levelXp = (Number(m.state.levelXp) || 0) - xpLost[k];
    else m.state.skills[k] = (Number(m.state.skills[k]) || 0) - xpLost[k];
    out.xpLost[k] = (out.xpLost[k] || 0) + xpLost[k];
  }
  out.deathLog.push({ atMs: f.atMs, monster: f.monster, xpLost });
  out.events.push(makeEvent('death', f.atMs, { monster: f.monster, xpLost }));
}

/* LEAVE TOGETHER (Tyler 2026-10-22): `m`'s hunt ends `why` at the instant `at`. A cascaded end (another
   member's) is never a trigger, so two ticked heroes never send each other home in a loop; nor is any end of a
   member the leader removed (a kick sends nobody home, Coordinator ruling 2026-10-23: hs.kicked, the server's
   read). The cascade reaches each OTHER member standing in the world, or walking in and arriving by `at` (it
   ends on arrival, before it joins), whose box is ticked, that has not died and has no end of its own at this
   instant (`own`), once (the first trigger names the reason). The flagged member ends at its own next
   boundary through END_ORDER. */
const CASCADE = Object.freeze(['party_member_died', 'party_member_left']);
function cascadeFrom(m, why, members, own, at) {
  if (!why || CASCADE.includes(why) || m.hs.kicked === true) return;
  for (const o of members) {
    if (o === m || o.left || o.hs.died || o.hs.partyEnd || (own && own.has(o))) continue;
    if (o.unitId === null && !(o.hs.nextSwingAtMs <= at)) continue;
    if (o.hero && o.hero.leaveTogether === true) o.hs.partyEnd = why === 'died' ? 'died' : 'left';
  }
}

function endMember(m, why, atMs, world, out) {
  const hs = m.hs;
  hs.endedReason = why;
  hs.endedAtMs = atMs;
  out.events.push(makeEvent('ended', atMs, { reason: why, ...(why === 'rule' ? { rule: hs.ruleStop } : {}) }));
  const u = world && m.unitId !== null ? world.units.find((x) => x.id === m.unitId) : null;
  /* A DEAD hero is back in town with full HP and mana (Tyler 2026-10-19); any
     other end walks home with the HP it had. */
  if (u) m.state.playerHp = u.alive ? u.hp : m.state.playerMaxHp;
  if (world && m.unitId !== null) leaveHero(world, m.unitId);
  m.left = true;
}

/**
 * THE HUNT INSTANCE'S SPAN (spec §1.1 engine contract).
 *
 * @param inst { world (decoded world-state world, or null before anyone
 *        arrived), nextSwingAtMs (the instance clock), members: [m] in key order }
 *        m = { key, seat, unitId (int or null: not in the world yet), hs
 *        (action-rules.js newHuntSession), state { skills, levelXp, playerHp,
 *        playerMaxHp, playerMaxMana, regenPm, stats, gold (a delta) }, hero { role,
 *        element, settings, slots (hunt-spawn heroSetup), stopRules, density, actionSet, range, ammo },
 *        snapshot(state) → { acc, maxHit, def }, family (the weapon family),
 *        armoured, shield, bonus(key), weakness(row) → { dropMult }, rollsVs?(row) → playerCombatRolls
 *        against that monster (a basic swing's accuracy and weapon weakness), shotRolls?(row, ammo) (the same with
 *        the item a shot spent in the ammo slot: damage.js blow), fx, buffsAt?(atMs) (re-measures the timed
 *        buff queue the member's bonus reads, at each of its boundaries) }
 * @param ctx  { toMs, tickMs (COMBAT_BALANCE.tickMs), seed(domain, index), ground, grid, monsters?, items? (the server's item catalogue: an attack item's footprint),
 *        hearthfind? (an indexed Hearthfind table; the catalogue's when absent), xpMultOf?(unitId) }
 * @returns { world, nextSwingAtMs, swings, track, events, kinds, members: { [key]: summary } }
 */
export function simulateHuntInstance(inst, ctx) {
  const tick = Number.isInteger(ctx.tickMs) && ctx.tickMs > 0 ? ctx.tickMs : COMBAT_BALANCE.tickMs;
  const toMs = Math.floor(Number(ctx.toMs) || 0);
  const members = inst.members;
  let world = inst.world || null;
  /* A world made in this call: the leader's hold pick is in force from its first lap (not only from the next). */
  let fresh = false;
  /* NO WORLD, NO PLACED HERO: a unit id names a unit of a world that is gone (a stored world of
     another field list restarts: world-state decodeStored), so every member re-enters the fresh one. */
  if (!world) for (const m of members) m.unitId = null;
  let atMs = Math.floor(Number(inst.nextSwingAtMs));
  const startMs = atMs;
  const out = new Map(members.map((m) => [m.key, { ticks: 0, kills: 0, deaths: 0, deathLog: [],
    xpLost: {}, events: [], killsBefore: m.hs.tally.kills, unitEver: m.unitId }]));
  const track = []; const worldEvents = [];
  /* Every unit's kind as it was seen (a corpse is cleared after corpseMs): the analyzer's 'taken by monster'. */
  const kinds = {};
  /* THE PLAYBACK'S UNIT BOOK (visual only, never value): each unit (monster or hero) seen this window as
     [kind, maxHp, hp when first seen] (the window's start, or its spawn), so the client names,
     sizes and fills the bar of a unit it first meets mid-window or after the snapshot stopped
     listing it (a corpse played behind the server); the window's dmg/heal events move the bar. */
  const units = {};
  const seen = () => { if (world) for (const u of world.units) { kinds[u.id] = u.kind; if (!units[u.id]) units[u.id] = [u.kind, u.maxHp, u.hp]; } };
  seen();
  /* ANCHORS (visual only): every unit standing at the window's first instant gets a step on its
     tile, so a unit that never moves inside a window is still placed by it (the track is moves). */
  const anchor = (at) => { if (world) for (const u of world.units) if (u.alive) track.push(trackStep(u.id, u.x, u.y, at)); };
  anchor(atMs);
  let swings = 0;
  for (const m of members) {
    m.left = !!m.hs.endedReason;
    m.hs._events = out.get(m.key).events;
    const u = world && m.unitId !== null ? world.units.find((x) => x.id === m.unitId) : null;
    if (u) syncUnit(u, m);
  }
  /* A HERO WITH NO MEMBER walks out first: a session the database closed between
     settles (a kick, a leave at once — hr_hunt_close clears unit_id, not the world)
     left its unit standing, and an unowned hero would earn kills nobody is paid for. */
  if (world) {
    const owned = new Set(members.filter((m) => !m.left && m.unitId !== null).map((m) => m.unitId));
    for (const u of world.units.slice()) if (u.side === 'hero' && !owned.has(u.id)) leaveHero(world, u.id);
  }

  while (atMs < toMs && members.some((m) => !m.left)) {
    // (0) LEAVE TOGETHER: every member whose own end holds at this boundary sends the ticked others home with
    //     it, here (they meet the flag in the end checks below), however the members are ordered.
    const own = new Map();
    for (const m of members) {
      if (m.left || m.hs.nextSwingAtMs > atMs) continue;
      const why = endReasonAt(m.hs, atMs);
      if (why && !CASCADE.includes(why)) own.set(m, why);
    }
    for (const [m, why] of own) cascadeFrom(m, why, members, own, atMs);
    // (1) Each member at this boundary: the end checks, then a paid interval.
    const here = [];
    for (const m of members) {
      if (m.left || m.hs.nextSwingAtMs > atMs) continue;
      const why = endReasonAt(m.hs, atMs);
      if (why) { endMember(m, why, atMs, world, out.get(m.key)); continue; }
      m.hs.swingIndex += 1;
      m.hs.nextSwingAtMs = atMs + tick;
      if (m.unitId === null) {
        if (!world) {
          /* The first packs spawn at the ENTERING party's density (its leader's pick, clamped for their
             number), the same number every respawn reads below, never the first hero's pick alone. */
          const standing = members.filter((x) => !x.left);
          world = newHuntWorld(ctx.ground, ctx.grid, [heroOf(m)],
            { density: densityFor(ctx.ground, standing.length, picker(standing)) });
          fresh = true;
          /* A restarted instance's fresh world counts on from its stored swing (the seed index never repeats). */
          world.swing = Math.max(0, Math.floor(Number(inst.worldSwing) || 0));
          m.unitId = world.units[0].id; anchor(atMs); seen();
        } else {
          m.unitId = joinHero(world, ctx.ground, heroOf(m), m.seat);
          const j = world.units.find((x) => x.id === m.unitId);
          if (j) track.push(trackStep(j.id, j.x, j.y, atMs));
        }
        out.get(m.key).unitEver = m.unitId;
      }
      here.push(m);
    }
    /* The last member ended at this boundary: the instance stops HERE, the world unstepped, exactly
       where a window cut at the end leaves it (the end stamped after the loop) — TICK-1, BOTH-PATH.
       An end met at a window's FIRST boundary (a clock end: stamina, hours, a leave, the kill
       switch) still steps once, so no window is empty (hr_hunt_apply refuses `bad_window`); the
       flagged ends (a death, gold out, a stop rule) are stamped after the loop and never meet it. */
    if (!members.some((m) => !m.left) && atMs > startMs) break;
    const byUnit = new Map();
    for (const m of here) {
      const u = world.units.find((x) => x.id === m.unitId);
      const o = out.get(m.key);
      if (typeof m.buffsAt === 'function') m.buffsAt(atMs);
      if (m.hs.staminaMs !== null && m.hs.staminaMs !== undefined) {
        m.hs.staminaMs = staminaStep(m.hs.staminaMs, tick, true, m.hs.staminaMaxMs);
      }
      m.hs.tally.paidMs += tick; m.hs.tally.swings += 1; o.ticks += 1;
      /* The whetstone wears on this swing (member.js wear), so the snapshot below already drops a spent one. */
      if (typeof m.wear === 'function') m.wear(atMs);
      if (u) syncUnit(u, m);
      byUnit.set(m.unitId, m);
    }
    // (2) ONE world swing for the whole instance, then what it paid each member.
    if (world) {
      const sw = world.swing;
      const heroes = {};
      for (const m of members) {
        if (m.left || m.unitId === null) continue;
        byUnit.set(m.unitId, m);
        heroes[m.unitId] = { hs: m.hs, slots: m.hero.slots, stopRules: m.hero.stopRules, actionSet: m.hero.actionSet,
          range: m.hero.range, rollsVs: m.rollsVs, shotRolls: m.shotRolls, ammo: m.hero.ammo, items: ctx.items || null, skills: m.state.skills };
      }
      /* MONSTER DENSITY for the packs that spawn from here: the party leader's pick (Tyler 2026-10-20),
         clamped to the ground for the party's size (hunt-grounds.js partyPick, densityFor). */
      world.density = densityFor(ctx.ground, world.units.filter((u) => u.side === 'hero').length,
        picker(members.filter((m) => !m.left && m.unitId !== null)));
      /* THE LEADER'S HOLD PICK, read every swing; it takes force at the next lap boundary (pull-cycle.js), or at once
         in a world just made (every member that enters with it has joined by now). */
      world.holdNext = holdPick(members.filter((m) => !m.left && m.unitId !== null));
      if (fresh) { world.hold = world.holdNext; world.leader = pullLeader({ world }); fresh = false; }
      const r = stepSwing(world, { atMs, swingMs: tick, rng: createRng(seedOf(ctx, 's', sw)),
        ground: ctx.ground, grid: ctx.grid, heroes, ...(typeof ctx.xpMultOf === 'function' ? { xpMultOf: ctx.xpMultOf } : {}) });
      seen();
      for (const t of r.track) track.push(t);
      for (const e of r.events) worldEvents.push(e);
      /* The rewards' own events (a party's rare roll) follow the swing's, on the server-only `r` stream. */
      const deaths = rewardSwing(byUnit, r.events, world, { rng: createRng(seedOf(ctx, 'r', sw)), monsters: ctx.monsters, hearthfind: ctx.hearthfind,
        emit: (e) => worldEvents.push(e) });
      for (const f of deaths) {
        const m = byUnit.get(f.unit);
        const o = out.get(m.key);
        if (!m.hs.died) o.deaths += 1;
        die(m, f, o);
        cascadeFrom(m, 'died', members, null, m.hs.nextSwingAtMs);
      }
      for (const [id, m] of byUnit) {
        const u = world.units.find((x) => x.id === id);
        if (u) m.state.playerHp = u.alive ? u.hp : 0;
      }
      swings += 1;
    }
    atMs += tick;
  }

  /* AN END THAT IS ALREADY CERTAIN is stamped at the member's VERY NEXT boundary,
     even when it lies past this window's end: a store use the purse could not
     cover, a stop rule met, and a death on this window's last swing (none of
     those flags is part of the stored session, and the database requires the
     `died` end in the SAME settle as the death row). The full end order is
     asked at that boundary, so an earlier reason that also holds there wins —
     the same instant however the windows were cut. */
  /* LEAVE TOGETHER: a member's own certain end cascades first; the ticked others end at their own next
     boundary, the same instant (everyone standing in the world steps in lockstep). */
  const stamped = new Map();
  for (const m of members) {
    if (m.left || m.unitId === null) continue;
    if (m.hs.goldOut === true || typeof m.hs.ruleStop === 'string' || m.hs.died === true) {
      stamped.set(m, endReasonAt(m.hs, m.hs.nextSwingAtMs) || 'gold_out');
    }
  }
  for (const [m, why] of stamped) cascadeFrom(m, why, members, stamped, m.hs.nextSwingAtMs);
  for (const m of members) {
    if (m.left || !(stamped.has(m) || m.hs.partyEnd)) continue;
    const next = m.hs.nextSwingAtMs;
    endMember(m, stamped.get(m) || endReasonAt(m.hs, next) || 'gold_out', next, world, out.get(m.key));
  }
  const summaries = {};
  for (const m of members) {
    const o = out.get(m.key);
    delete m.hs._events;
    summaries[m.key] = {
      ticks: o.ticks, deaths: o.deaths, died: o.deaths > 0,
      kills: m.hs.tally.kills - o.killsBefore,
      deathLog: o.deathLog, xpLost: o.xpLost, huntEvents: o.events,
      huntEnded: m.hs.endedReason ? { reason: m.hs.endedReason, atMs: m.hs.endedAtMs } : null,
      unitId: m.left ? null : m.unitId,
      unitIdEver: o.unitEver,
    };
  }
  return { world, nextSwingAtMs: atMs, swings, track, events: worldEvents, kinds, units, members: summaries };
}
