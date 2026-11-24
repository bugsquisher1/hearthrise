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
// it walks home with full HP, as every end does (endMember). No knockout, no
// falls, no resume. LEAVE TOGETHER
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

import { COMBAT_BALANCE } from './combat.js';
import { endReasonAt, deathXpLoss, modeDeathShare, staminaStep } from './action-rules.js';
import { createRng } from './rng.js';
import { charLevelFromXp } from './xp.js';
import { densityFor, partyPick } from '../data/hunt-grounds.js';
import { DEFAULT_TIER } from '../data/hunt-tiers.js';
import { stepSwing } from './hunt/world-step.js';
import { makeEvent, trackStep } from './hunt/events.js';
import { newHuntWorld, joinHero, leaveHero } from './hunt-spawn.js';
import { pullLeader } from './hunt/pull-cycle.js';
import { settingsOf } from './hunt/roles.js';
import { rewardSwing } from './hunt-rewards.js';
import { BOSS_CALLS } from '../data/boss-calls.js';
import { roomOf } from './hunt/boss-room.js';
import { trainOf, trainingTick, TRAINING_SLOTS } from './hunt/training.js';
import { towerOf, towerMonsters, towerEndsAt } from './hunt/tower.js';
import { sessionPayOf } from '../data/session-modes.js';
import { dangerOn, dangerDial, openDanger, riskOf, heroCount } from './hunt/danger.js';
import { huntPlayOf, swingRows } from './hunt/play-rows.js';
import { isHero } from './hunt/sides.js';
import { borrowBlowsOf } from './borrow-blow.js';
import { syncTalents } from './hunt/talent-rows.js';
import { syncTraits } from './hunt/trait-rules.js';
import { traitSwing } from './trait-roll.js';
import { scaleItems } from './gear-stats.js';

/* The engine's front door: `combatSim`. */
export { stepSwing } from './hunt/world-step.js';
export { huntPlayOf };   // the one door to a monster row (hunt/play-rows.js)

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

/* THE HUNT'S TIER: the party leader's hero's, else the first standing hero's. The server freezes one on the instance and overlays it on every member (hr_hunt_instance_read `options.tier`). The SAME call on
   the server's settle and the browser's live view (a peer's `hero` carries `tier`). */
const tierPick = (ms) => { const lead = ms.find((x) => x.hero.lead === true) || ms[0]; return (lead && lead.hero.tier) || DEFAULT_TIER; };
/* THE DANGER SCALE'S PLAN (src/core/hunt/danger.js): the same leader's stance and the step it starts at, or null (a tier hunt), and always
   null on a yard, a room, the Tower or a scaled hunt's window (`play`, huntPlayOf's). Read once, when the world opens, and by fightItems. */
function planOf(ground, play, heroes) {
  if (trainOf(ground) || towerOf(ground) || roomOf(ground) || play.level !== null) return null;
  const lead = heroes.find((h) => !!h && h.lead === true) || heroes[0];
  return riskOf(lead);
}

/**
 * THE ITEMS A FIGHT ON `ground` READS (lane/scale-early-grounds, 2026-11-23): the scale view (src/core/gear-stats.js scaleItems) only
 * when its world opens on a plan (planOf, the one rule the world itself opens by), the catalogue as written for every other fight, a tier
 * hunt on a scale ground included. `members`: input rows ({ key, hero }) or a start point's frozen peers ({ key, frozen: { hero } }),
 * read in key order as the engine reads them; `scale` { level } as the server handed the window, or none. The server freezes one stance
 * an instance and overlays it on every member, and a scaled window restarts the world, so a standing world carries the same answer.
 * One door for every reader of a member's gear: the edge settle (accrue-hunt.js), the start point's frozen peers (hunt-settle.js) and
 * the browser's live view (live-engine.js).
 */
export function fightItems(items, ground, members, scale) {
  if (!items || !ground) return items;
  const heroes = (members || []).slice().sort((a, b) => (a.key < b.key ? -1 : 1)).map((m) => (m.frozen ? m.frozen.hero : m.hero) || {});
  return planOf(ground, huntPlayOf(ground.id, scale || null), heroes) ? scaleItems(items, ground) : items;
}

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

/* THE PARTY AS IT STANDS (KNOWN-F1, 2026-11-18): the members with a hero in the world whose hunt has not ended, at
   this instant. A member counts from the boundary its hero arrives to the boundary its hunt ends, both instants of the
   instance's own clock, so every window reads the same party at the same instant however the settles were cut: never
   the party some read happened to see (a read sees a member walking in before it arrives, and drops one that ended
   only at the next settle). The defaults of the settings read it (syncUnit), as the pull's density, the leader's hold
   pick and the tier read the same members. */
const inWorld = (members) => members.filter((m) => !m.left && m.unitId !== null);
const rolesOf = (ms) => ms.map((m) => m.hero.role);

/* The settings and combat snapshot the settle writes onto a member's unit
   (roles.js / damage.js read them there): the hero's options, its role and its
   gear, skills and Level as they stand NOW, so a level gained mid-window counts
   from the next swing however the window was cut. Max HP and max mana are
   raise-only inside a hunt (a Level is never lost in one: a death ends it).
   `roles`: the party standing in the world at this instant (inWorld), whose
   make-up decides a setting the player left unset (roles.settingsOf). */
const PIPELINE_SNAP = Object.freeze(['armorGearPm', 'wardPm', 'blowBp', 'critPm', 'buffDmgPm']);
function syncUnit(u, m, roles) {
  const snap = m.snapshot(m.state);
  u.acc = snap.acc; u.maxHit = snap.maxHit; u.def = snap.def;
  /* THE LEVEL, for the party's level share (xp-share.js) and nothing else: a level gained mid-window counts from the next kill, never persisted, like `mit`. */
  u.heroLv = snap.level;
  /* THE ARMOUR (ruling K7, mitigation.js): the member's gear values at every boundary, never persisted, so a decoded world gets them back here before any blow; each blow prices them against its attacker. */
  u.armour = snap.armour || null;
  /* THE GEAR PART (src/core/hunt/danger.js powerPm: the power step, read on the Danger scale only), the same: never persisted. */
  u.gearPm = Number.isInteger(snap.gearPm) ? snap.gearPm : 0;
  /* THE SKILL PART (the same power step, lane/foundations-block), the same: never persisted. */
  u.skillGapPm = Number.isInteger(snap.skillGapPm) ? snap.skillGapPm : 0;
  /* THE AMOUNT PIPELINE'S READS (src/core/hunt/amount.js, on the Danger scale only), the same: never persisted. */
  for (const k of PIPELINE_SNAP) u[k] = Number.isInteger(snap[k]) ? snap[k] : 0;
  /* TEMPERING, the same: at every boundary from the server's rungs, never persisted, absent at rung 0 (damage.js hurt, abilities.js healOne). */
  if (snap.blowsPm) u.blowsPm = snap.blowsPm; else if (u.blowsPm) delete u.blowsPm;
  if (snap.armorPm) u.armorPm = snap.armorPm; else if (u.armorPm) delete u.armorPm;
  /* CRAFTED JEWELRY'S PERKS, the same: never persisted, absent on a hero that wears none (damage.js roll, abilities.js fire). */
  if (snap.followPm) u.followPm = snap.followPm; else if (u.followPm) delete u.followPm;
  if (snap.surgePm) u.surgePm = snap.surgePm; else if (u.surgePm) delete u.surgePm;
  if (snap.focusPm) u.focusPm = snap.focusPm; else if (u.focusPm) delete u.focusPm;
  /* ELEMENTAL RESISTANCE (Tyler 2026-11-08), the same: from the gear the server holds, never persisted, absent with none (targeting.js elementOn). */
  if (snap.resistPm) u.resistPm = snap.resistPm; else if (u.resistPm) delete u.resistPm;
  /* THE OWN HEAL (the fist line's wraps, src/data/fists.js), the same: never persisted, absent with none (pull-cycle.js tickHeroes). */
  if (snap.selfHealPm) u.selfHealPm = snap.selfHealPm; else if (u.selfHealPm) delete u.selfHealPm;
  /* BORROWED MOVES' BLOWS (src/core/borrow-blow.js): each one's native weapon's reference blow at the hero's Level now, the same: never
     persisted, absent with nothing borrowed (abilities.js blowOf). */
  const bb = borrowBlowsOf(m.hero.borrowed, snap.level);
  if (bb) u.borrowBlows = bb; else if (u.borrowBlows) delete u.borrowBlows;
  syncTalents(u, m.hero, snap.level);   // THE ROADS' grants at the Level now, the same (talent-rows.js syncTalents): none with no build
  syncTraits(u, m.hero);                // THE TRAITS it wears, the same (trait-rules.js syncTraits): none while Traits are dark
  /* A WORN SHIELD, the same (its brace takes a share off a marked monster spell: monster-spells.js, data SHIELD_BRACE). */
  if (m.shield === true) u.shieldWorn = true; else if (u.shieldWorn) delete u.shieldWorn;
  u.maxHp = Math.max(u.maxHp, m.state.playerMaxHp);
  u.maxMana = Math.max(u.maxMana || 0, m.state.playerMaxMana || 0);
  u.regenPm = m.state.regenPm;
  const s = settingsOf(m.hero.role, m.hero.settings, roles);
  u.dist = s.dist; u.chase = s.chase; u.tmode = s.tmode; u.stance = s.stance;
  /* THE KIND FIRST (targeting.js kindOf): never persisted, so written here at every boundary like the gear values above, absent with none */
  const k = m.hero.settings && m.hero.settings.tkind;
  if (typeof k === 'string' && k) u.tkind = k; else if (u.tkind !== undefined) delete u.tkind;
  /* THE ROW the plan set (monster-roles.js rowOf: absent, the hero's role decides), the same: never persisted */
  const row = m.hero.settings && m.hero.settings.row;
  if (row === 'front' || row === 'back') u.row = row; else if (u.row !== undefined) delete u.row;
  /* THE SEAT (the server's hunt_sessions.seat), the same: what a fall back on the Danger scale names its hero by (danger.js noteHurt) */
  if (Number.isSafeInteger(m.seat) && m.seat >= 0) u.seat = m.seat; else if (u.seat !== undefined) delete u.seat;
}

/* A DEATH (Tyler 2026-10-19): priced on the member at once (Level and every
   combat skill, action-rules.js deathXpLoss) at the session mode's share
   (`share`, action-rules.js modeDeathShare: the full price in a hunt, nothing in
   a mode that costs nothing, Tyler 2026-11-14), and its hunt ends `died` at the
   member's next boundary (the end checks). A hero dies once: its hunt is over. */
function die(m, f, out, share) {
  const hs = m.hs;
  if (hs.died) return;
  hs.died = true;
  hs.tally.deaths++;
  m.state.stats = m.state.stats || {};
  m.state.stats.deaths = (m.state.stats.deaths || 0) + 1;
  const xpLost = deathXpLoss(m.state, share);
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

/* OUTGROWN (action-rules.js): each member's Level off its Level XP now, and the ground's `endsAt`. A browser's peer carries no Level XP
   (member.js frozenSide), so only the server and the hero's own browser end it. */
function readLevels(members, endsAt) {
  for (const m of members) {
    m.hs.endsAtLevel = endsAt;
    m.hs.levelNow = endsAt === null ? null : charLevelFromXp(m.state.levelXp);
  }
}

function endMember(m, why, atMs, world, out) {
  const hs = m.hs;
  hs.endedReason = why;
  hs.endedAtMs = atMs;
  out.events.push(makeEvent('ended', atMs, { reason: why, ...(why === 'rule' ? { rule: hs.ruleStop } : {}), ...(why === 'runes_out' ? { ability: hs.runesOut } : {}) }));
  /* EVERY END SENDS THE HERO HOME WHOLE (designer 2026-10-29, extending Tyler 2026-10-19's death rule): town is
     safe and the next hunt starts fresh, so whatever ended it (a death, a leave, stamina, supplies, gold, a stop
     rule, a party end) the hero is back with full HP. Mana is never stored: a hero enters every hunt full
     (hunt-spawn.js). The settle stores this HP (accrual.js delta.hp, hr_apply clamps it to the derived max). */
  m.state.playerHp = m.state.playerMaxHp;
  if (world && m.unitId !== null) leaveHero(world, m.unitId);
  m.left = true;
}

/**
 * THE UNIT BOOK'S HP FOR A UNIT BORN INSIDE A SWING (visual only, never value): its HP after the swing (`u.hp`) with
 * that swing's own HP changes (`evs`) taken back, as the timeline adds them again. Only a `dmg` or a `heal` moves HP: a
 * `status_tick` is the tick's roll, and the `dmg` it lands (damage.js landHit, `dot`) is its HP change, so counting
 * both booked a bled unit too full (lane/a-hp-zero). A pack pulled in the swing it respawns (report #69: the leader
 * waits at the spawn) had its first blows counted twice: a standing monster drawn at 0 HP.
 */
export function bornHpOf(u, evs) {
  let hp = u.hp;
  for (const e of evs) {
    if (e.t !== u.id || !Number.isFinite(e.amount)) continue;
    if (e.type === 'heal') hp -= e.amount; else if (e.type === 'dmg') hp += e.amount;
  }
  return Math.max(0, Math.min(u.maxHp, hp));
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
 * @param {{toMs: number, tickMs?: number, seed: (domain: string, index: number) => number, ground: any, grid: any, monsters?: any, items?: any, hearthfind?: any, xpMultOf?: any, sessionMode?: string, towerFloor?: number, traitDrops?: any}} ctx
 *        { toMs, tickMs (COMBAT_BALANCE.tickMs), seed(domain, index), ground, grid, monsters?, items? (the server's item catalogue: an attack item's footprint),
 *        hearthfind? (an indexed Hearthfind table; the catalogue's when absent), xpMultOf?(unitId),
 *        scale? ({ level }: the server's scale of this window, huntPlayOf; absent = unscaled),
 *        traitDrops? (the server's Trait roll, src/core/trait-roll.js traitSwing: DARK, nothing hands one while GEAR_STEPS.traitsLive is false),
 *        sessionMode? (the instance's frozen mode id, src/data/session-modes.js; absent = the default, an unknown id throws),
 *        towerFloor? (the Burning Tower, src/core/hunt/tower.js: the floor whose room stands, or stands next, at this span's start: the
 *        server's read, hr_hunt_instance_read `tower_floor`; required on the Tower's ground, never read elsewhere) }
 * @returns { world, nextSwingAtMs, swings, track, events, kinds, members: { [key]: summary (on the Tower, `tower`: { floors: the floors
 *            this member cleared standing, in order }) }, scale (the Level it played at, or null) }
 */
export function simulateHuntInstance(inst, ctx) {
  const tick = Number.isInteger(ctx.tickMs) && ctx.tickMs > 0 ? ctx.tickMs : COMBAT_BALANCE.tickMs;
  const toMs = Math.floor(Number(ctx.toMs) || 0);
  const members = inst.members;
  let world = inst.world || null;
  /* A SCALED HUNT (huntPlayOf): its rows, its tier and its pull, the same for every swing of this span. */
  const play = huntPlayOf(ctx.ground.id, ctx.scale || null);
  const monsOf = (onScale) => swingRows(ctx.ground.id, play, onScale);
  /* A TRAINING GROUND (src/core/hunt/training.js): its one dummy as built at any pick, the trained skill its only pay, and no stamina
     spent or proposed (the server's pool rests while the hero trains): the same for every member, from the ground, never stored. */
  const train = trainOf(ctx.ground);
  if (train) for (const m of members) m.hs.staminaMs = null;
  /* THE SESSION MODE (src/data/session-modes.js; Tyler 2026-11-14): the instance's, frozen by the server when it started and read
     back by the edge (hunt_instances.session_mode); absent, the default. A death is priced at its share, the same for every member. */
  const deathShare = modeDeathShare(ctx.sessionMode);
  /* WHAT A KILL PAYS (session-modes.js sessionPayOf; lane/c-tower-climb): the instance's mode, the same for every member. Its XP share rides
     every swing to the split (xp-share.js) and the rewards (hunt-rewards.js), with what it pays at all; a full hunt hands neither, so every
     hunt plays exactly as it did. */
  const pay = sessionPayOf(ctx.sessionMode);
  const fullPay = pay.xpPm === 1000 && pay.coin && pay.drops && pay.bestiary;
  /* THE LEVEL THE GROUND IS OUTGROWN AT (hunt-grounds.js endsAtLevel), or null; none on a SCALED window, which plays at its leader's Level. */
  const endsAt = play.level === null && Number.isInteger(ctx.ground && ctx.ground.endsAtLevel) ? ctx.ground.endsAtLevel : null;
  /* THE BURNING TOWER (src/core/hunt/tower.js): the floor the server says stands (or stands next) when this span starts, a working value of
     the world from here (a world carried from the last span keeps its own: the browser's live view); every swing reads that floor's table
     through play.monsters (huntPlayOf: Normal, never scaled), and the floor's time is an end every member meets. */
  const tw = towerOf(ctx.ground);
  if (tw && !(Number.isInteger(ctx.towerFloor) && ctx.towerFloor >= 1)) throw new Error('simulateHuntInstance: a Tower climb needs the floor the server read (ctx.towerFloor)');
  if (tw && world && !Number.isInteger(world.towerFloor)) world.towerFloor = ctx.towerFloor;
  const pickOf = (ms) => (train || play.normalOf(tierPick(ms)) ? 0 : picker(ms));
  /* A world made in this call: the leader's hold pick is in force from its first lap (not only from the next). */
  let fresh = false;
  /* A BOSS ROOM (src/core/hunt/boss-room.js: a called room or a keyed hall): its limit from the party's first swing (one instant for every member however the windows were cut), and ONE
     FIGHT: whatever ends one hero's ends everyone's, box ticked or not (the box is the hero's own word for a hunt, and this isn't one). CALL OUT (src/data/boss-calls.js) alone pays
     only his drops, on his kill: only a called room hands the rewards its call (hunt-rewards.js calledSwing); a hall pays like any ground. */
  const room = roomOf(ctx.ground);
  const call = ctx.ground && ctx.ground.call ? BOSS_CALLS[ctx.ground.call] : null;
  /* A CALLED ROOM'S TIME SPENDS NO STAMINA (Tyler 2026-11-14: each FIGHT costs stamina, charged by the server as it starts,
     2027-04-24-boss-call-series.sql): no pool is drained or proposed here, so none can end a fight; the same for every member, never stored.
     THE SERIES IS THE SERVER'S: this span plays one fight, his kill ends it `boss_felled`, and the settle starts the next or ends the series. */
  if (call) for (const m of members) m.hs.staminaMs = null;
  if (room) {
    const ends = Math.min(...members.map((m) => Number(m.hs.huntFromMs) || 0)) + room.limitMs;
    for (const m of members) { m.hs.callEndsAtMs = ends; m.hero = Object.assign({}, m.hero, { leaveTogether: true }); }
  }
  /* NO WORLD, NO PLACED HERO: a unit id names a unit of a world that is gone (a stored world of
     another field list restarts: world-state decodeStored), so every member re-enters the fresh one. */
  if (!world) for (const m of members) m.unitId = null;
  let atMs = Math.floor(Number(inst.nextSwingAtMs));
  const startMs = atMs;
  const out = new Map(members.map((m) => [m.key, { ticks: 0, kills: 0, deaths: 0, deathLog: [],
    xpLost: {}, events: [], killsBefore: m.hs.tally.kills, unitEver: m.unitId, floors: [] }]));
  const track = []; const worldEvents = [];
  /* Every unit's kind as it was seen (a corpse is cleared after corpseMs): the analyzer's 'taken by monster'. */
  const kinds = {};
  /* THE PLAYBACK'S UNIT BOOK (visual only, never value): each unit (monster or hero) seen this window as
     [kind, maxHp, hp when first seen] (the window's start, or its spawn), so the client names,
     sizes and fills the bar of a unit it first meets mid-window or after the snapshot stopped
     listing it (a corpse played behind the server); the window's dmg/heal events move the bar. */
  const units = {};
  /* A unit first seen after a swing (`evs`, its events) was born inside it: its book HP is bornHpOf's. */
  const seen = (evs) => { if (world) for (const u of world.units) { kinds[u.id] = u.kind; if (!units[u.id]) units[u.id] = [u.kind, u.maxHp, evs ? bornHpOf(u, evs) : u.hp]; } };
  seen();
  /* ANCHORS (visual only): every unit standing at the window's first instant gets a step on its
     tile, so a unit that never moves inside a window is still placed by it (the track is moves). */
  const anchor = (at) => { if (world) for (const u of world.units) if (u.alive) track.push(trackStep(u.id, u.x, u.y, at)); };
  anchor(atMs);
  let swings = 0;
  for (const m of members) {
    m.left = !!m.hs.endedReason;
    m.hs._events = out.get(m.key).events;
  }
  const roles0 = rolesOf(inWorld(members));
  for (const m of members) {
    const u = world && m.unitId !== null ? world.units.find((x) => x.id === m.unitId) : null;
    if (u) syncUnit(u, m, roles0);
  }
  /* A HERO WITH NO MEMBER walks out first: a session the database closed between
     settles (a kick, a leave at once — hr_hunt_close clears unit_id, not the world)
     left its unit standing, and an unowned hero would earn kills nobody is paid for. */
  if (world) {
    const owned = new Set(inWorld(members).map((m) => m.unitId));
    for (const u of world.units.slice()) if (isHero(u) && !owned.has(u.id)) leaveHero(world, u.id);
  }

  /* WHAT EVERY END CHECK AT A BOUNDARY READS: the no-fight clock (the world's own; a hero not yet in it has none), the Level as the
     XP stands now (OUTGROWN: the XP is stored, so the end lands on the same boundary however the windows are cut), the Tower floor's
     clock, and no no-fight end on a training ground (src/core/hunt/training.js: it pays the time whatever the blows). Read at the top
     of every boundary and again where a window ends, so the two read the same. */
  const boundaryReads = () => {
    for (const m of members) m.hs.fightAtMs = world && m.unitId !== null ? world.fightAt : null;
    readLevels(members, endsAt);
    if (tw) for (const m of members) m.hs.floorEndsAtMs = world && m.unitId !== null ? towerEndsAt(world, tw) : null;
    if (train) for (const m of members) m.hs.fightAtMs = null;
  };
  while (atMs < toMs && members.some((m) => !m.left)) {
    // (0) THE NO-FIGHT CLOCK (designer 2026-10-31) for the end checks: the world's own, a hero not yet in it has none.
    //     LEAVE TOGETHER: every member whose own end holds at this boundary sends the ticked others home with
    //     it, here (they meet the flag in the end checks below), however the members are ordered.
    boundaryReads();
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
          /* ...and on the hunt's tier, the one every respawn reads below (hunt-tiers.js: its health is the packs' from the first), or on the
             Danger scale at the step its plan starts at (src/core/hunt/danger.js; never on a yard, a room, the Tower or a scaled hunt). */
          const plan = planOf(ctx.ground, play, standing.map((x) => x.hero));
          const tier = plan ? dangerDial(ctx.ground, plan.step, standing.length) : play.tierOf(tierPick(standing));
          if (tw) play.monsters = towerMonsters(ctx.towerFloor, tw);
          world = newHuntWorld(ctx.ground, ctx.grid, [heroOf(m)],
            { density: densityFor(ctx.ground, standing.length, pickOf(standing)), tier, monsters: monsOf(!!plan), ...(tw ? { tower: { floor: ctx.towerFloor, atMs } } : {}), ...(plan ? { density: tier.pull[0] } : {}) });
          if (plan) openDanger(world, plan.risk, tier.step);
          fresh = true;
          /* A restarted instance's fresh world counts on from its stored swing (the seed index never repeats). */
          world.swing = Math.max(0, Math.floor(Number(inst.worldSwing) || 0));
          /* A fresh world's quiet starts now: a restart (a party change, a deploy) never ends a fighting hunt. */
          world.fightAt = atMs;
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
    /* THE PARTY AT THIS BOUNDARY, after its ends and arrivals (inWorld): the same members the density, hold and tier picks below read. */
    const roles = rolesOf(inWorld(members));
    const byUnit = new Map();
    for (const m of here) {
      const u = world.units.find((x) => x.id === m.unitId);
      const o = out.get(m.key);
      if (typeof m.buffsAt === 'function') m.buffsAt(atMs);
      if (m.hs.staminaMs !== null && m.hs.staminaMs !== undefined) {
        m.hs.staminaMs = staminaStep(m.hs.staminaMs, tick, true, m.hs.staminaMaxMs);
      }
      m.hs.tally.paidMs += tick; m.hs.tally.swings += 1; o.ticks += 1;
      /* A TRAINING GROUND PAYS ITS TIME (src/core/hunt/training.js): this interval's slice of the hour to the trained skill. */
      if (train) trainingTick(m, train, tick);
      /* The whetstone wears on this swing (member.js wear), so the snapshot below already drops a spent one. */
      if (typeof m.wear === 'function') m.wear(atMs);
      if (u) syncUnit(u, m, roles);
      byUnit.set(m.unitId, m);
    }
    // (2) ONE world swing for the whole instance, then what it paid each member.
    if (world) {
      const sw = world.swing;
      const heroes = {};
      for (const m of members) {
        if (m.left || m.unitId === null) continue;
        byUnit.set(m.unitId, m);
        /* A TRAINING GROUND SHUTS THE BAR (src/core/hunt/training.js): the plain basic alone, no stop rule: the yard spends no supply. */
        heroes[m.unitId] = { hs: m.hs, slots: train ? TRAINING_SLOTS : m.hero.slots, stopRules: train ? [] : m.hero.stopRules, actionSet: m.hero.actionSet,
          range: m.hero.range, rollsVs: m.rollsVs, shotRolls: m.shotRolls, ammo: m.hero.ammo, items: ctx.items || null, skills: m.state.skills };
      }
      /* MONSTER DENSITY for the packs that spawn from here: the party leader's pick (Tyler 2026-10-20),
         clamped to the ground for the party's size (hunt-grounds.js partyPick, densityFor). */
      world.density = densityFor(ctx.ground, world.units.filter((u) => isHero(u)).length,
        pickOf(members.filter((m) => !m.left && m.unitId !== null)));
      /* ON THE DANGER SCALE (src/core/hunt/danger.js dangerDial): the step's own pull, and its dial in place of the tier's */
      const scale = dangerOn(world) ? dangerDial(ctx.ground, world.danger, heroCount(world)) : null;
      if (scale) world.density = scale.pull[0];
      /* THE LEADER'S HOLD PICK, read every swing; it takes force at the next lap boundary (pull-cycle.js), or at once
         in a world just made (every member that enters with it has joined by now). */
      world.holdNext = holdPick(members.filter((m) => !m.left && m.unitId !== null));
      if (fresh) { world.hold = world.holdNext; world.leader = pullLeader({ world }); fresh = false; }
      /* THE TIER (hunt-tiers.js): read every swing, like the hold pick, and never stored on the world. */
      const { ground } = ctx;
      const tier = play.tierOf(tierPick(members.filter((m) => !m.left && m.unitId !== null)));
      /* the floor standing's table on the Tower (read before the swing: a room cleared in it stands again only after the stair) */
      if (tw) play.monsters = towerMonsters(world.towerFloor, tw);
      const r = stepSwing(world, { atMs, swingMs: tick, rng: createRng(seedOf(ctx, 's', sw)),
        ground, grid: ctx.grid, heroes, tier: scale || tier, ...(monsOf(!!scale) ? { monsters: monsOf(!!scale) } : {}),
        ...(typeof ctx.xpMultOf === 'function' ? { xpMultOf: ctx.xpMultOf } : {}), ...(fullPay ? {} : { xpPm: pay.xpPm }) });
      seen(r.events);
      for (const t of r.track) track.push(t);
      for (const e of r.events) worldEvents.push(e);
      /* The rewards' own events (a party's rare roll) follow the swing's, on the server-only `r` stream. */
      /* A KEYED HALL'S BOSS pays his rows as the hall's DAILY PRIZE (boss-halls.js; hunt-rewards.js payPrize): the room names him. */
      const deaths = rewardSwing(byUnit, r.events, world, { rng: createRng(seedOf(ctx, 'r', sw)), monsters: play.monsters || ctx.monsters, tier, hearthfind: ctx.hearthfind, call, ...(scale ? { tier: scale } : {}),
        ...(fullPay ? {} : { pay }), ...(room && room.kind === 'hall' ? { prize: room.monster } : {}), ...(train ? { train } : {}), emit: (e) => worldEvents.push(e),
        /* THE TRAIT ROLL (src/core/trait-roll.js), DARK: only on the scale and only when the server hands one (ctx.traitDrops; none while
           GEAR_STEPS.traitsLive is false). Each hero's own stream for the swing, seed domain t:<unit> (action-rules.js SEED_DOMAIN) */
        ...(ctx.traitDrops && scale && !train ? { traitDrops: traitSwing(ctx.traitDrops, ctx.ground, world.danger, (u) => createRng(seedOf(ctx, 't:' + u, sw))) } : {}) });
      /* THE BURNING TOWER: each hero standing when its room fell cleared the floor (tower.js towerCleared's `floor` event names them). */
      if (tw) for (const e of r.events) if (e.type === 'floor') for (const id of Object.keys(e.by)) { const m = byUnit.get(Number(id)); if (m) out.get(m.key).floors.push(e.floor); }
      /* THE ROOM'S BOSS IS DOWN: everyone still in the fight ends `boss_felled` at their next boundary. */
      if (room && r.events.some((e) => e.type === 'kill' && kinds[e.t] === room.monster)) for (const m of members) if (!m.left) m.hs.bossFelled = true;
      for (const f of deaths) {
        const m = byUnit.get(f.unit);
        const o = out.get(m.key);
        if (!m.hs.died) o.deaths += 1;
        die(m, f, o, deathShare);
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
     cover, a stop rule met, a spell slot out of its runes that says leave (runesOut),
     and a death on this window's last swing (none of
     those flags is part of the stored session, and the database requires the
     `died` end in the SAME settle as the death row). The full end order is
     asked at that boundary, so an earlier reason that also holds there wins —
     the same instant however the windows were cut. */
  /* LEAVE TOGETHER: a member's own certain end cascades first; the ticked others end at their own next
     boundary, the same instant (everyone standing in the world steps in lockstep). */
  const stamped = new Map();
  /* (the end order asked at that boundary reads what the boundary itself would: the Level the last swing left, the world's clocks) */
  boundaryReads();
  for (const m of members) {
    if (m.left || m.unitId === null) continue;
    if (m.hs.goldOut === true || typeof m.hs.ruleStop === 'string' || typeof m.hs.runesOut === 'string' || m.hs.died === true || m.hs.bossFelled === true) {
      stamped.set(m, endReasonAt(m.hs, m.hs.nextSwingAtMs) || 'gold_out');
    }
  }
  /* A member whose OWN end holds at its next boundary (heals_out, ammo_out, outgrown...: not stamped, ended there by the next window)
     keeps it, as the boundary's `own` keeps it when one window reads both ends there: a stamp never renames it `party_member_left`
     (settle-properties DB-SPLIT, nightly 2026-11-19). */
  const ownNext = new Map(stamped);
  for (const m of members) {
    if (m.left || ownNext.has(m)) continue;
    const why = endReasonAt(m.hs, m.hs.nextSwingAtMs);
    if (why && !CASCADE.includes(why)) ownNext.set(m, why);
  }
  for (const [m, why] of stamped) cascadeFrom(m, why, members, ownNext, m.hs.nextSwingAtMs);
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
      ...(tw ? { tower: { floors: o.floors } } : {}),
    };
  }
  return { world, nextSwingAtMs: atMs, swings, track, events: worldEvents, kinds, units, members: summaries, scale: play.level };
}
