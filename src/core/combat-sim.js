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
//   the swing interval is PAID (its hero standing: stamina drains) or KNOCKED
//   OUT (its hero down: stamina rests).
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
// member's fx, perk stack, combat snapshot and style. PURE ESM. No DOM, no
// window, no timers, no Math.random.
// ============================================================

import { COMBAT_BALANCE } from './combat.js?v=590';
import { resumeHpFor } from './recovery.js?v=590';
import { endReasonAt, deathXpLoss, staminaStep } from './action-rules.js?v=590';
import { createRng } from './rng.js?v=590';
import { KNOCKOUT_MS } from '../data/hunt-sessions.js?v=590';
import { stepSwing } from './hunt/world-step.js?v=590';
import { makeEvent } from './hunt/events.js?v=590';
import { newHuntWorld, joinHero, leaveHero } from './hunt-spawn.js?v=590';
import { rewardSwing } from './hunt-rewards.js?v=590';

/* The engine's front door (src/core/index.js `combatSim`). */
export { stepSwing } from './hunt/world-step.js?v=590';

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

/* A member's hero, as world-state wants it, from the member's server state. */
function heroOf(m) {
  const snap = m.snapshot(m.state);
  return Object.assign({ role: m.hero.role, maxHp: m.state.playerMaxHp, hp: m.state.playerHp,
    maxMana: m.hero.maxMana, element: m.hero.element || '', settings: m.hero.settings }, snap);
}

/* The settings and combat snapshot the settle writes onto a member's unit
   (roles.js / damage.js read them there): the hero's options, its role and its
   gear and skills as they stand NOW, so a level gained mid-window counts from
   the next swing however the window was cut. Max HP is raise-only. */
function syncUnit(u, m) {
  const snap = m.snapshot(m.state);
  u.acc = snap.acc; u.maxHit = snap.maxHit; u.def = snap.def;
  u.maxHp = Math.max(u.maxHp, m.state.playerMaxHp);
  if (m.hero.settings) {
    const s = m.hero.settings;
    if (s.dist !== undefined) u.dist = s.dist;
    if (s.chase !== undefined) u.chase = s.chase;
    if (s.tmode !== undefined) u.tmode = s.tmode;
    if (s.stance !== undefined) u.stance = s.stance;
  }
}

/* The fall's price and its knockout, on the member (the world already knocked
   the hero out for KNOCKOUT_MS; a fall is never a free heal). */
function fall(m, f, out) {
  const hs = m.hs;
  hs.falls = (Math.floor(Number(hs.falls)) || 0) + 1;
  hs.tally.deaths++;
  m.state.stats = m.state.stats || {};
  m.state.stats.deaths = (m.state.stats.deaths || 0) + 1;
  const xpLost = deathXpLoss(m.state.skills, m.style);
  for (const k in xpLost) m.state.skills[k] = (Number(m.state.skills[k]) || 0) - xpLost[k];
  for (const k in xpLost) out.xpLost[k] = (out.xpLost[k] || 0) + xpLost[k];
  out.deathLog.push({ atMs: f.atMs, monster: f.monster, recoverMs: KNOCKOUT_MS,
    resumeHp: resumeHpFor(m.state.playerMaxHp), xpLost });
  out.events.push(makeEvent('fall', f.atMs, { monster: f.monster, xpLost }));
  m.state.recoveringUntilMs = f.atMs + KNOCKOUT_MS;
}

function endMember(m, why, atMs, world, out) {
  const hs = m.hs;
  hs.endedReason = why;
  hs.endedAtMs = atMs;
  out.events.push(makeEvent('ended', atMs, { reason: why }));
  const u = world && m.unitId !== null ? world.units.find((x) => x.id === m.unitId) : null;
  /* An ENDED hunt leaves no knockout behind: the character walks home, up. */
  if (u) m.state.playerHp = u.alive ? u.hp : resumeHpFor(m.state.playerMaxHp);
  if (world && m.unitId !== null) leaveHero(world, m.unitId);
  m.left = true;
}

/**
 * THE HUNT INSTANCE'S SPAN (spec §1.1 engine contract).
 *
 * @param inst { world (decoded world-state world, or null before anyone
 *        arrived), nextSwingAtMs (the instance clock), members: [m] in key order }
 *        m = { key, seat, unitId (int or null: not in the world yet), hs
 *        (action-rules.js newHuntSession), state { skills, playerHp,
 *        playerMaxHp, stats, gold (a delta), recoveringUntilMs }, hero { role,
 *        maxMana, element, settings, bar, actionSet, range, ammo, foodBelowPct,
 *        drinkBelowPct }, snapshot(state) → { acc, maxHit, def }, style,
 *        bonus(key), weakness(row) → { dropMult }, fx }
 * @param ctx  { toMs, tickMs (COMBAT_BALANCE.tickMs), seed(domain, index), ground, grid, monsters? }
 * @returns { world, nextSwingAtMs, swings, track, events, kinds, members: { [key]: summary } }
 */
export function simulateHuntInstance(inst, ctx) {
  const tick = Number.isInteger(ctx.tickMs) && ctx.tickMs > 0 ? ctx.tickMs : COMBAT_BALANCE.tickMs;
  const toMs = Math.floor(Number(ctx.toMs) || 0);
  const members = inst.members;
  let world = inst.world || null;
  let atMs = Math.floor(Number(inst.nextSwingAtMs));
  const out = new Map(members.map((m) => [m.key, { ticks: 0, kills: 0, deaths: 0, recoverMs: 0, deathLog: [],
    xpLost: {}, events: [], killsBefore: m.hs.tally.kills, unitEver: m.unitId }]));
  const track = []; const worldEvents = [];
  /* Every unit's kind as it was seen (a corpse is cleared after corpseMs): the analyzer's 'taken by monster'. */
  const kinds = {};
  const seen = () => { if (world) for (const u of world.units) kinds[u.id] = u.kind; };
  seen();
  let swings = 0;
  for (const m of members) {
    m.left = !!m.hs.endedReason;
    m.hs._events = out.get(m.key).events;
    const u = world && m.unitId !== null ? world.units.find((x) => x.id === m.unitId) : null;
    if (u) syncUnit(u, m);
  }

  while (atMs < toMs && members.some((m) => !m.left)) {
    // (1) Each member at this boundary: the end checks, then a paid or knocked-out interval.
    const here = [];
    for (const m of members) {
      if (m.left || m.hs.nextSwingAtMs > atMs) continue;
      const why = endReasonAt(m.hs, atMs);
      if (why) { endMember(m, why, atMs, world, out.get(m.key)); continue; }
      m.hs.swingIndex += 1;
      m.hs.nextSwingAtMs = atMs + tick;
      if (m.unitId === null) {
        if (!world) { world = newHuntWorld(ctx.ground, ctx.grid, [heroOf(m)]); m.unitId = world.units[0].id; }
        else m.unitId = joinHero(world, ctx.ground, heroOf(m), m.seat);
        out.get(m.key).unitEver = m.unitId;
      }
      here.push(m);
    }
    const byUnit = new Map();
    for (const m of here) {
      const u = world.units.find((x) => x.id === m.unitId);
      const o = out.get(m.key);
      const standing = !!u && u.alive;
      if (m.hs.staminaMs !== null && m.hs.staminaMs !== undefined) {
        m.hs.staminaMs = staminaStep(m.hs.staminaMs, tick, standing, m.hs.staminaMaxMs);
      }
      if (standing) { m.hs.tally.paidMs += tick; m.hs.tally.swings += 1; o.ticks += 1; }
      else { m.hs.tally.downMs += tick; o.recoverMs += tick; }
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
        heroes[m.unitId] = { hs: m.hs, bar: m.hero.bar, actionSet: m.hero.actionSet, range: m.hero.range,
          ammo: m.hero.ammo, foodBelowPct: m.hero.foodBelowPct, drinkBelowPct: m.hero.drinkBelowPct };
      }
      const r = stepSwing(world, { atMs, swingMs: tick, rng: createRng(seedOf(ctx, 's', sw)),
        ground: ctx.ground, grid: ctx.grid, heroes });
      seen();
      for (const t of r.track) track.push(t);
      for (const e of r.events) worldEvents.push(e);
      const falls = rewardSwing(byUnit, r.events, world, { rng: createRng(seedOf(ctx, 'r', sw)), monsters: ctx.monsters });
      for (const f of falls) {
        const m = byUnit.get(f.unit);
        const o = out.get(m.key);
        o.deaths += 1;
        fall(m, f, o);
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
     cover (the flag is not part of the stored session), and the falls limit
     reached on this window's last swing (the database requires that end in the
     SAME settle as the fall). The full end order is asked at that boundary, so
     an earlier reason that also holds there wins — the same instant however
     the windows were cut. */
  for (const m of members) {
    if (m.left || m.unitId === null) continue;
    const next = m.hs.nextSwingAtMs;
    if (m.hs.goldOut === true || endReasonAt(m.hs, next) === 'falls') {
      endMember(m, endReasonAt(m.hs, next) || 'gold_out', next, world, out.get(m.key));
    }
  }
  const summaries = {};
  for (const m of members) {
    const o = out.get(m.key);
    const u = world && m.unitId !== null && !m.left ? world.units.find((x) => x.id === m.unitId) : null;
    const down = !!u && !u.alive;
    /* The knockout line survives the window only while the hero is still down
       in a hunt that goes on. */
    if (m.hs.endedReason || !down) m.state.recoveringUntilMs = 0;
    m.hs.down = !m.hs.endedReason && down;
    delete m.hs._events;
    summaries[m.key] = {
      ticks: o.ticks, deaths: o.deaths, died: o.deaths > 0, recoverMs: o.recoverMs,
      kills: m.hs.tally.kills - o.killsBefore,
      deathLog: o.deathLog, xpLost: o.xpLost, huntEvents: o.events,
      huntEnded: m.hs.endedReason ? { reason: m.hs.endedReason, atMs: m.hs.endedAtMs } : null,
      unitId: m.left ? null : m.unitId,
      unitIdEver: o.unitEver,
    };
  }
  return { world, nextSwingAtMs: atMs, swings, track, events: worldEvents, kinds, members: summaries };
}
