// ============================================================
// src/core/combat-sim.js — ONE COMBAT LOOP. The whole point of this file
// is that there is not a second one.
//
// ── WHAT THIS REPLACES ───────────────────────────────────────────────
// legacy.js used to carry two combat loops: `combatTick()` for live play
// and `processOfflineCombat()` for an absence. They were written from the
// same sketch and then drifted for two years. Measured differences at the
// moment of deletion — every one of them a silent loss to the away player:
//
//   1. no crit roll at all (and so no `stats.crits`)
//   2. no kill XP — `m.xp` was never granted. ~21% of all combat XP.
//   3. no Boss-of-the-Day drop/XP lift
//   4. no `dropRate` food-buff term in the drop chance
//   5. no `HearthriseDropLog.recordKill` — the collection log under-reported
//      every overnight
//   6. no `updateDaily('kill_any')` — "Slay 10 monsters" made zero progress
//   7. no `updateQuest('kill_any'/'kill_monster')`
//   8. no `HearthriseFarm.rollKillDeed`
//   9. it never called `window.killMonster`, so the five feature modules
//      that WRAP that function (dungeon keys, companions, pets, the
//      collection log, the chronicle) were all skipped away as well
//  10. it used the flat `COMBAT_BALANCE.tickMs` instead of `combatTickMs()`,
//      so gear speed (`spdB`) and the weapon-family speed identity did not
//      apply — a hammer swung 26% more often away than it does live
//   11. `stats.deaths` was never incremented (nor was it live — a bug in
//      BOTH paths, which is exactly what a single loop makes visible)
//
// None of those were decisions. Nine of the eleven are one copy-paste gap
// repeated. That is the argument for the one-formula mandate in
// docs/design/away-time-ruling.md, and this file is that mandate.
//
// ── HOW ONE FUNCTION SERVES EVERY CALLER ─────────────────────────────
// A fight is a HUNT SESSION (ruling HR-2026-10-14). `simulateSpan(state, ctx)`
// with `state.huntSession` walks the session's absolute swing clock
// (`simulateHuntSpan`), and the world tick, the player's hunt verbs and the
// edge settle all reach it through the one edge settle (hunt-settle.js). The
// away combat span, Auto-Eat, the Recovery ladder, the Retreat and the Boss of
// the Day were deleted outright with the closed rebuild (lane C2).
//
// ONE SWING is `stepSwing` (src/core/hunt/world-step.js): the instance
// world's sub-steps, then the session hero's swing. This file keeps the loop
// round it — the absolute swing clock, the end checks, stamina, the knockout
// window and the tally (HUNT_SCREEN_SPEC §1.1 engine contract #1).
//
// Everything impure is INJECTED, which is what keeps this file runnable in
// Deno with no browser:
//   • `ctx.swingSeed(i)`      — the edge's keyed HMAC per swing (src/core/rng.js)
//   • `ctx.bonus(key)`        — the perk stack
//   • `ctx.playerRolls(m)` / `ctx.monsterRolls(m)` / `ctx.weakness(m)`
//   • `ctx.fx`                — the effect sink; missing handlers are no-ops
//   • `ctx.ground` / `ctx.grid` — the hunt ground row and its grid, when the
//                               session carries a world (`hs.world`)
//
// `state` is the player-state object, MUTATED in place (the convention
// src/core/progression.js `grantXp` set: copying a 40-field save per swing
// is the alternative).
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { COMBAT_BALANCE } from './combat.js?v=589';
import { resumeHpFor } from './recovery.js?v=589';
import { runActionBar, endReasonAt, deathXpLoss, staminaStep } from './action-rules.js?v=589';
import { createRng } from './rng.js?v=589';
import { tickBuffs, pruneBuffs, hasActiveBuff } from './buffs.js?v=589';
import { stepSwing, OUTCOME, fxOf, call } from './hunt/world-step.js?v=589';
import { makeEvent } from './hunt/events.js?v=589';

/* The swing's outcomes and its kill / death hand-offs live with the swing;
   published here too, because this module is the engine's front door
   (src/core/index.js `combatSim`). */
export { stepSwing, OUTCOME, resolveKill, resolveDeath } from './hunt/world-step.js?v=589';

/* WHY A COMBAT SPAN STOPPED BEFORE THE ABSENCE DID — the same contract
   src/core/skill-sim.js and src/core/artisan-sim.js publish under this name.
   `null` means "it ran the whole window". Imported by accrual.js as
   `COMBAT_STOP`. */
export const STOP_REASON = Object.freeze({});

/**
 * The swing interval of a span: `ctx.tickMs` (the server derives it from
 * server-owned equipment), CLAMPED to `COMBAT_BALANCE.minTickMs` (600 ms) so a
 * hostile or garbage value cannot inflate the swing budget. `minTickMs` is an
 * explicit opt-in to a finer floor; absent, zero, negative or non-numeric =
 * the real floor. Never plumb a client-supplied value into either.
 */
export function resolveTickMs(ctx) {
  const req = Number((ctx || {}).tickMs);
  const asked = (isFinite(req) && req > 0) ? req : COMBAT_BALANCE.tickMs;
  /* The opt-in. A finer granularity is a DELIBERATE argument, never a
     side effect of a permissive floor: a caller that genuinely wants
     sub-swing resolution (a unit test measuring a single tick, a tuning
     harness) states `minTickMs` itself and owns the consequence. Anything
     non-numeric, zero or negative falls back to the real floor. */
  const optIn = Number((ctx || {}).minTickMs);
  const floor = (isFinite(optIn) && optIn > 0) ? optIn : COMBAT_BALANCE.minTickMs;
  return Math.max(floor, asked);
}

/* THE HUNT SPAN'S TWO STATE REPAIRS. The away span below keeps its own inline
   copies byte-for-byte until lane C2 deletes that span with the away model
   (ruling §3); these two are what survives it.
   Repair: a fight whose HP never reached this process (NaN would never kill). */
function repairFight(state, ctx) {
  if (!state.activeMonster) return;
  const m0 = (ctx.monsters || {})[state.activeMonster];
  if (m0) {
    if (!(state.monsterMaxHp > 0)) state.monsterMaxHp = m0.hp;
    if (!(state.monsterHp > 0)) state.monsterHp = state.monsterMaxHp;
  }
  if (!(state.playerMaxHp > 0)) state.playerMaxHp = 10;
  if (!(state.playerHp > 0)) state.playerHp = state.playerMaxHp;
}

/* THE PER-SWING SEED (ruling HR-2026-10-14 §4; Security, C1 review item 3).
   INJECTED, never derived here: `ctx.swingSeed(swingIndex)` is the server's
   keyed mix of the session secret (hr_seed(user, slot, 'hunt:' || session)) and
   the label `hunt:<session>:<swing_index>` — HMAC-SHA256 in the edge
   (supabase/functions/hr-accrue/hunt-seed.js), which needs a crypto primitive
   this browser-shared file must not import. A 32-bit hash of the secret's TEXT
   (the FNV mix this replaced) collapsed the 64-bit secret into one 32-bit state
   recoverable from observed swings. No seeder, or a seeder that answers
   anything but an unsigned 32-bit integer, refuses the swing: an unseeded hunt
   swing is a predictable one. */
function swingSeedOf(ctx, swingIndex) {
  const f = ctx && ctx.swingSeed;
  if (typeof f !== 'function') {
    throw new Error('simulateHuntSpan: a hunt session needs ctx.swingSeed(swingIndex) — refusing an unseeded swing');
  }
  const v = f(swingIndex);
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) {
    throw new Error('simulateHuntSpan: ctx.swingSeed answered ' + String(v) + ', not an unsigned 32-bit integer');
  }
  return v;
}

/* Up again: same foe at full HP, the character at 40% (recovery.js). */
function standUp(state, ctx) {
  const mr0 = (ctx.monsters || {})[state.activeMonster];
  if (mr0) { state.monsterMaxHp = mr0.hp; state.monsterHp = mr0.hp; }
  state.playerHp = resumeHpFor(state.playerMaxHp);
}

/* The tally a hunt session keeps, fed through the same fx doors the caller's
   own sinks use: every value the swing moves passes here once, then on. */
function tallyFx(fx, hs, events, clock) {
  const t = hs.tally;
  const add = (o, k, n) => { o[k] = (o[k] || 0) + n; };
  return Object.assign({}, fx, {
    addXp(skill, amount, ...rest) { add(t.xp, skill, Number(amount) || 0); return call(fx, 'addXp', skill, amount, ...rest); },
    addItem(id, n, ...rest) {
      add(t.loot, id, Number(n) || 0);
      /* Loot the session may sell to cover a shop charge (row 3) joins the pool as it drops. */
      if (hs.cover && hs.cover[id] && Number(n) > 0) hs.cover[id].avail += Math.floor(Number(n));
      return call(fx, 'addItem', id, n, ...rest);
    },
    /* The coins a kill drops are in the purse at once: an NPC basic bought
       later in the same window may spend them (the database credits them in
       the same settle, before the buys are debited). */
    onLoot(gp, ...rest) {
      t.coins += Number(gp) || 0;
      hs.purse = Math.max(0, Math.floor(Number(hs.purse) || 0)) + Math.max(0, Math.floor(Number(gp) || 0));
      return call(fx, 'onLoot', gp, ...rest);
    },
    onDrop(ev, ...rest) {
      if (ev && ev.rare) events.push(makeEvent('rare_drop', clock.atMs, { item: ev.id }));
      return call(fx, 'onDrop', ev, ...rest);
    },
  });
}

/**
 * A HUNT SESSION'S SPAN (ruling HR-2026-10-14 §2/§4). One `stepSwing` per swing,
 * driven by the session's ABSOLUTE swing clock instead of a per-window tick
 * budget: a swing happens at `hs.nextSwingAtMs` if that instant is inside
 * [.., toMs), and the clock then advances by one swing interval. Every swing
 * draws from its own seed (`hunt:<session>:<swing_index>`), so N ten-second
 * windows and one N x 10 s span run the same swings with the same dice in the
 * same order (TICK-1). No rate multiplier, no away scope: a hunt is a hunt.
 *
 * Each boundary, in order: the end checks (action-rules.js END_ORDER, and
 * `endedAtMs` is that boundary) → a knocked-out boundary drains buffs, earns
 * nothing and RESTS stamina one interval → otherwise one swing (stamina DRAINS
 * one interval), the action bar inside it → the buff queue drains one
 * interval. Vigour plays no part in a hunt (2026-10-14 rulings).
 *
 * THE WORLD (`hs.world`, a decoded world-state.js world, when the session has
 * one) steps at EVERY boundary past the end checks — knocked out and between
 * pulls too, with no hero swing — so the instance never pauses for one hero.
 * Its track and events ride out as `huntTrack` / `huntWorldEvents`.
 */
function simulateHuntSpan(state, ctx) {
  const hs = state.huntSession;
  const tickMs = resolveTickMs(ctx);
  const toMs = Number(ctx.toMs) || 0;
  let recoverUntilMs = Number(state.recoveringUntilMs);
  if (!isFinite(recoverUntilMs) || recoverUntilMs <= 0) recoverUntilMs = 0;
  let downed = recoverUntilMs > 0 || hs.down === true;
  /* Only a standing fight is repaired: a downed one is stood up at its next
     boundary, and an ended one is never touched again — repairing either here
     would make the state depend on how many windows the span was cut into. */
  if (!downed && !hs.endedReason) repairFight(state, ctx);
  const events = [];
  hs._events = events;
  const clock = { atMs: hs.nextSwingAtMs };
  const fx = tallyFx(fxOf(ctx), hs, events, clock);
  let ticks = 0; let kills = 0; let foodEaten = 0; let crits = 0; let deaths = 0;
  let recoverMs = 0; let buffPaidMs = 0;
  const deathLog = []; const buffsExpired = []; const consumed = Object.create(null);
  const xpLostTotal = {};
  const drain = () => {
    const q = Array.isArray(state.buffs) && state.buffs.length ? state.buffs : null;
    if (q) for (const t of tickBuffs(q, tickMs, { away: false, active: true }).expired) buffsExpired.push(t);
  };
  const huntTrack = []; const huntWorldEvents = [];
  const swingCtxOf = (atMs, swing, fight) => Object.assign({}, ctx, { atMs, fx, state, fight, swingMs: tickMs,
    rng: createRng(swingSeedOf(ctx, swing)) });
  const keep = (r) => { for (const t of r.track) huntTrack.push(t); for (const e of r.events) huntWorldEvents.push(e); return r; };
  const worldOnly = (atMs, swing) => { if (hs.world) keep(stepSwing(hs.world, swingCtxOf(atMs, swing, false))); };

  while (!hs.endedReason && state.activeMonster && hs.nextSwingAtMs < toMs) {
    const atMs = hs.nextSwingAtMs;
    clock.atMs = atMs;
    const why = endReasonAt(hs, atMs);
    if (why) {
      hs.endedReason = why;
      hs.endedAtMs = atMs;
      events.push(makeEvent('ended', atMs, { reason: why }));
      break;
    }
    const swing = hs.swingIndex;
    hs.swingIndex = swing + 1;
    hs.nextSwingAtMs = atMs + tickMs;
    if (atMs < recoverUntilMs) {
      drain();
      recoverMs += tickMs;
      hs.tally.downMs += tickMs;
      if (hs.staminaMs !== null && hs.staminaMs !== undefined) hs.staminaMs = staminaStep(hs.staminaMs, tickMs, false);
      worldOnly(atMs, swing);
      continue;
    }
    if (hs.staminaMs !== null && hs.staminaMs !== undefined) hs.staminaMs = staminaStep(hs.staminaMs, tickMs, true);
    if (downed) { downed = false; recoverUntilMs = 0; standUp(state, ctx); }
    /* THE SPAWN CYCLE (Security design review 2026-10-14 item 1). A pull that
       is cleared is back `respawnMs` after it STARTED: until then the hero is
       out on the ground with nothing to fight — hunting (stamina drains, the
       interval is paid) but swinging at nothing. The pull comes back on the
       first boundary at or after `respawnAtMs`, and the next one is due one
       respawn after that. Draws nothing, so the dice of every swing are the
       same however the windows were cut (TICK-1); the state is the session
       row's (pull_left / respawn_at), carried window to window. */
    const pl = hs.pull;
    if (pl.left <= 0) {
      if (atMs < pl.respawnAtMs) {
        /* Between pulls the bar still works (a heal at <= 50% eats now, a
           press lands now) — the same rules, no dice. */
        if (runActionBar(state, Object.assign({}, ctx, { atMs, fx }))) foodEaten++;
        drain();
        hs.tally.paidMs += tickMs;
        hs.tally.waitMs = (Number(hs.tally.waitMs) || 0) + tickMs;
        worldOnly(atMs, swing);
        continue;
      }
      pl.left = pl.size;
      pl.respawnAtMs = atMs + pl.respawnMs;
      pl.pulls++;
    }
    if (typeof fx.mark === 'function') fx.mark(atMs);
    const facing = state.activeMonster;
    const swingCtx = swingCtxOf(atMs, swing, true);
    const buffLive = hasActiveBuff(state.buffs);
    const r = keep((typeof fx.segment === 'function')
      ? (() => { let out; fx.segment(atMs, () => { out = stepSwing(hs.world || null, swingCtx); }); return out; })()
      : stepSwing(hs.world || null, swingCtx));
    const sup = r.supply;
    if (sup && sup.spent > 0) consumed[sup.id] = (consumed[sup.id] || 0) + sup.spent;
    ticks++;
    hs.tally.swings++;
    hs.tally.paidMs += tickMs;
    if (buffLive) buffPaidMs += tickMs;
    drain();
    if (r.crit) crits++;
    if (r.ate) foodEaten++;
    if (r.outcome === OUTCOME.KILL) { kills++; hs.tally.kills++; pl.left--; }
    if (r.outcome === OUTCOME.DEATH) {
      deaths++;
      hs.falls = (Math.floor(Number(hs.falls)) || 0) + 1;
      hs.tally.deaths++;
      state.activeMonster = facing;
      downed = true;
      const rec = Number(r.recoverMs) || 0;
      const fellAtMs = hs.nextSwingAtMs;
      if (rec > 0) recoverUntilMs = fellAtMs + rec;
      /* THE PRICE OF THE FALL (Tyler 2026-10-14; action-rules.js deathXpLoss).
         Read off the RUNNING xp at this boundary and debited here, so a later
         fall in the same span prices off what is left and a span cut into N
         windows debits exactly what one span does (TICK-1). Stated on the
         death log and the fall event; the settle journals it and the database
         re-checks every number (hr_hunt_apply). Draws nothing. */
      const xpLost = deathXpLoss(state.skills, ctx.style);
      for (const k in xpLost) state.skills[k] = (Number(state.skills[k]) || 0) - xpLost[k];
      for (const k in xpLost) xpLostTotal[k] = (xpLostTotal[k] || 0) + xpLost[k];
      deathLog.push({ atMs: fellAtMs, monster: facing, recoverMs: rec, resumeHp: state.playerHp, xpLost });
      events.push(makeEvent('fall', fellAtMs, { monster: facing, xpLost }));
      continue;
    }
    if (r.outcome === OUTCOME.STOP) break;
  }

  /* AN END THAT IS ALREADY CERTAIN is stamped at the VERY NEXT boundary, even
     when that boundary lies past this window's end: a buy the purse could not
     cover (the flag is not part of the stored session, so a later window could
     not see it), and the falls limit reached on this window's last swing
     (hr_hunt_settle_session requires that end in the SAME settle as the fall).
     Ending here makes the instant the same however the windows were cut; the
     full end order is asked at that boundary, so an earlier reason that also
     holds there wins, exactly as the loop would have answered. */
  if (!hs.endedReason && (hs.goldOut === true || endReasonAt(hs, hs.nextSwingAtMs) === 'falls')) {
    const why = endReasonAt(hs, hs.nextSwingAtMs) || 'gold_out';
    hs.endedReason = why;
    hs.endedAtMs = hs.nextSwingAtMs;
    events.push(makeEvent('ended', hs.nextSwingAtMs, { reason: why }));
  }
  if (buffsExpired.length && Array.isArray(state.buffs)) state.buffs = pruneBuffs(state.buffs);
  /* An ENDED hunt leaves no knockout behind: the character walks home (a flat
     minute is shorter than any walk back plus a new hunt's walk out), and the
     line is the same however the windows were cut — a span that ran past the
     line would otherwise clear it while a window cut inside it kept it. */
  state.recoveringUntilMs = (!hs.endedReason && recoverUntilMs > toMs) ? recoverUntilMs : 0;
  hs.down = hs.endedReason ? false : downed;
  delete hs._events;
  return {
    kills, foodEaten, crits, ticks, deaths, recoverMs,
    died: deaths > 0,
    survivedMs: ticks * tickMs,
    recoverRemainingMs: Math.max(0, recoverUntilMs - toMs),
    deathLog,
    recoverLadder: deathLog.map((d) => d.recoverMs),
    stoppedBy: null,
    buffPaidMs,
    buffsExpired,
    consumed: Object.assign({}, consumed),
    huntEnded: hs.endedReason ? { reason: hs.endedReason, atMs: hs.endedAtMs } : null,
    huntEvents: events,
    huntTrack,
    huntWorldEvents,
    /* Every fall's XP debit, summed per skill (already taken off state.skills). */
    xpLost: xpLostTotal,
  };
}

/**
 * Simulate a SPAN of elapsed time. A fight is a HUNT SESSION (ruling
 * HR-2026-10-14; the away combat span was deleted outright with the closed
 * rebuild): with `state.huntSession` this is `simulateHuntSpan`, the one engine
 * the world tick, the player's hunt verbs and the edge settle all run. Anything
 * else is not a fight the server prices — the span is EMPTY, never a guess.
 *
 * `tickMs` is clamped by `resolveTickMs` (the 600 ms floor); the server derives
 * it from server-owned equipment and never reads it from a request body.
 */
export function simulateSpan(state, ctx) {
  if (state && state.huntSession) return simulateHuntSpan(state, ctx);
  return {
    kills: 0, foodEaten: 0, crits: 0, ticks: 0, deaths: 0, recoverMs: 0, died: false, survivedMs: 0,
    recoverRemainingMs: 0, deathLog: [], recoverLadder: [], stoppedBy: null, buffPaidMs: 0, buffsExpired: [],
    consumed: {}, huntEnded: null, huntEvents: [], huntTrack: [], huntWorldEvents: [], xpLost: {},
  };
}
