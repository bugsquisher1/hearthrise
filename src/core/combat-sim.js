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
// ── HOW ONE FUNCTION SERVES THREE CALLERS ────────────────────────────
// `simulateTick(state, ctx)` is called with `ctx.away === false` by the
// live 2.4s tick, and with `ctx.away === true` by the accrual replay. The
// difference is ctx, never code.
//
// Everything impure is INJECTED, which is what keeps this file runnable in
// Deno with no browser:
//   • `ctx.rng`               — src/core/rng.js contract
//   • `ctx.bonus(key)`        — the perk stack (a seven-deep wrapper chain
//                               on the client; a server-side sum in Deno).
//                               The blessing and buff channels gate
//                               themselves via src/core/away.js, so this
//                               function needs no opinion about them.
//   • `ctx.playerRolls(m)` / `ctx.monsterRolls(m)` / `ctx.weakness(m)`
//                             — the client routes these through its WRAPPED
//                               window.* helpers on purpose; delegation must
//                               not quietly remove a link from a chain.
//   • `ctx.botd`              — the segment's featured-boss resolver
//   • `ctx.fx`                — the effect sink. Every mutation the world
//                               outside `state` needs. Missing handlers are
//                               no-ops, so a bare `simulateTick(state,{...})`
//                               in a test simulates without side effects.
//
// `state` is the player-state object. It is MUTATED in place — the same
// convention src/core/progression.js `grantXp` established, because the
// alternative is copying a 40-field save 18,000 times per replay.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { COMBAT_BALANCE, rollAttack, rollCrit, applyCrit } from './combat.js?v=463';
import { rollDropTable } from './drops.js?v=463';
import { hitXpRoute, killXpRoute } from './styles.js?v=463';
import { applyGoldFind } from './pacing.js?v=463';
import { AWAY_RATE_MULT, CHANNEL, channelApplies, rateMult, utcDaySegments } from './away.js?v=463';
import { NO_BONUS } from './botd.js?v=463';
import { tickBuffs, pruneBuffs, hasActiveBuff } from './buffs.js?v=463';

export { AWAY_RATE_MULT };

const NOOP = () => {};
function fxOf(ctx) { return (ctx && ctx.fx) || {}; }
function call(fx, name, ...args) {
  const f = fx[name];
  return typeof f === 'function' ? f(...args) : undefined;
}

/* Outcomes, named so a caller never compares against a bare string. */
export const OUTCOME = {
  HIT: 'hit', KILL: 'kill', DEATH: 'death', STOP: 'stop',
};

/**
 * Resolve a KILL: gold, drops, kill XP, and every counter a kill feeds.
 *
 * This is the function `killMonster()` in legacy.js became, and the one
 * the away replay reaches through the same wrapped `window.killMonster`,
 * so the five feature modules hooked onto that name observe an away kill
 * exactly as they observe a live one.
 *
 * PRESENTATION IS NOT HERE. No toast, no combat-log line, no repaint —
 * those arrive through `fx.onKill` / `fx.onDrop`, which the client makes
 * silent while away (a 12-hour replay would otherwise queue several
 * hundred "Defeated Slime" toasts and repaint the topbar for each one).
 */
export function resolveKill(state, m, ctx) {
  const fx = fxOf(ctx);
  const rng = ctx.rng;
  const id = state.activeMonster;
  const bonus = typeof ctx.bonus === 'function' ? ctx.bonus : () => 0;

  const gp = applyGoldFind(rng.int(m.gp[0], m.gp[1]), bonus);
  state.gold = (state.gold || 0) + gp;
  call(fx, 'onLoot', gp, m, ctx);
  state.stats = state.stats || {};
  state.stats.kills = (state.stats.kills || 0) + 1;
  state.combatKillsThisFoe = (state.combatKillsThisFoe || 0) + 1;

  /* b254 Boss of the Day. Per the ruling this applies AWAY, resolved for
     THIS SEGMENT's instant — an absence crossing UTC midnight pays each
     half its own day's boss. `ctx.botd` is rebound per segment by
     simulateSpan; live it is bound to now. */
  const feat = (ctx.botd && typeof ctx.botd.killBonuses === 'function')
    ? ctx.botd.killBonuses(id) : NO_BONUS;

  const dropMult = (typeof ctx.weakness === 'function' ? ctx.weakness(m) : { dropMult: 1 }).dropMult;
  /* THE BALANCE ASSERTION the designer asked for (ruling, "Balance risk"):
     rollDropTable applies `min(0.95, ch x dropMult x (1+dropBuff) x featured)`
     — the cap is AFTER every multiplier, and a guaranteed drop (ch >= 1) is
     returned untouched, so a weekly boss's x2.0 can never turn one guaranteed
     drop into two. Enforced in src/core/drops.js and asserted in the suite.
     `dropRate` is a BUFF key, so away it reads 0 without a special case. */
  const rolled = rollDropTable(m.drops, {
    dropMult,
    dropBuff: bonus('dropRate'),
    featuredMult: feat.dropMult,
  }, rng);

  for (const ev of rolled.events) {
    call(fx, 'addItem', ev.id, 1);
    if (ev.rare) state.stats.rareDrops = (state.stats.rareDrops || 0) + 1;
    call(fx, 'onDrop', ev, m, ctx);
  }

  /* The five away omissions the ruling names. They are BASE rewards, so
     they run unconditionally — there is no `if (!away)` anywhere below. */
  call(fx, 'recordKill', id, rolled.dropped);
  call(fx, 'rollKillDeed', m);
  for (const g of killXpRoute(ctx.style, m.xp, feat.xpMult)) call(fx, 'addXp', g.skill, g.amount);
  call(fx, 'updateDaily', 'kill_any', 1);
  call(fx, 'updateQuest', 'kill_any', 1, { target: id });
  call(fx, 'updateQuest', 'kill_monster', 1, { target: id });
  call(fx, 'handleBountyKill', id, m);

  const info = { gp, monster: m, monsterId: id, drops: rolled.dropped, events: rolled.events, featured: feat };
  call(fx, 'onKill', info, ctx);

  /* Respawn the same foe and keep fighting — the behaviour both loops had. */
  state.monsterHp = m.hp;
  state.monsterMaxHp = m.hp;
  return info;
}

/**
 * Resolve a DEATH. Both paths, one rule.
 *
 * `stats.deaths` is incremented here, which means it now increments at all:
 * the ruling's sixth omission is that NEITHER loop ever touched it, so the
 * Hero screen has been reporting 0 deaths to every player since launch.
 */
export function resolveDeath(state, ctx) {
  const fx = fxOf(ctx);
  state.stats = state.stats || {};
  state.stats.deaths = (state.stats.deaths || 0) + 1;
  state.playerHp = state.playerMaxHp;
  state.monsterHp = 0;
  /* A death breaks a bounty STREAK — the one bounty type that measures
     uninterrupted kills. Away used to do this and live used to do this; it
     is here now so it cannot be done in only one of them again. */
  let streakBroken = false;
  if (state.bountyHunter && state.bountyHunter.active && state.bountyHunter.active.type === 'streak') {
    streakBroken = true;
    state.bountyHunter.active.progress = 0;
    state.bountyHunter.active.streak = 0;
  }
  const info = { died: true, streakBroken };
  /* The caller stops the fight: on the client that is `stopCombat()`, which
     also tells the launchpad the activity ended and clears the interval.
     Core must not null `activeMonster` first — stopCombat reads it to decide
     whether to record the stop. */
  call(fx, 'onDeath', ctx, info);
  return info;
}

/**
 * ONE tick. `ctx.away` decides scope and presentation; nothing else differs.
 *
 * Draw order is fixed and load-bearing — it is what makes a seeded fight
 * replay identically through both paths, and what the parity test asserts:
 *   1. player swing   (rollAttack: up to 2 draws)
 *   2. crit           (1 draw, only on a landed hit)
 *   3. [kill] gold    (1 draw) then the drop table (1 draw per row)
 *   4. monster swing  (rollAttack: up to 2 draws)
 */
export function simulateTick(state, ctx) {
  const fx = fxOf(ctx);
  const monsters = ctx.monsters || {};
  const id = state.activeMonster;
  if (!id) return { outcome: OUTCOME.STOP, reason: 'no-target' };
  const m = monsters[id];
  if (!m) { state.activeMonster = null; return { outcome: OUTCOME.STOP, reason: 'unknown-monster' }; }

  const roll = ctx.playerRolls(m);
  let pDmg = rollAttack(ctx.rng, roll.accuracy, roll.maxHit);

  /* CRITS APPLY AWAY (the ruling reverses the old behaviour). Crit is gear —
     `critB` from equipment plus the armour-set bonus — so it is a permanent
     property and omitting it away was a hidden, gear-scaled penalty of ~7.5%
     typical and up to 30% at the 0.60 cap. The `damage_crit` FOOD buff is
     excluded away, and needs no code here: it arrives through `bonus('crit')`
     on the buff channel, which src/core/away.js closes. */
  let didCrit = false;
  if (pDmg > 0 && rollCrit(ctx.rng, roll.critChance)) {
    pDmg = applyCrit(pDmg, COMBAT_BALANCE.critMult);
    didCrit = true;
    state.stats = state.stats || {};
    state.stats.crits = (state.stats.crits || 0) + 1;
  }
  state._lastPlayerCrit = didCrit;
  state.monsterHp = Math.max(0, state.monsterHp - pDmg);
  call(fx, 'onSwing', m, pDmg, didCrit, ctx);

  if (pDmg > 0) {
    for (const g of hitXpRoute(ctx.style, pDmg)) call(fx, 'addXp', g.skill, g.amount);
  }

  if (state.monsterHp <= 0) {
    /* Through `fx.killMonster` when the caller supplies one, because on the
       client that name carries five wrappers (dungeon keys, companions,
       pets, collection log, chronicle) that an away kill must also trigger.
       Falling back to resolveKill keeps this file usable bare, in Deno and
       in tests. */
    const info = typeof fx.killMonster === 'function' ? fx.killMonster(m) : resolveKill(state, m, ctx);
    return { outcome: OUTCOME.KILL, crit: didCrit, pDmg, kill: info || null };
  }

  const mr = ctx.monsterRolls(m);
  const mDmg = rollAttack(ctx.rng, mr.accuracy, mr.maxHit);
  state.playerHp = Math.max(0, state.playerHp - mDmg);
  call(fx, 'onMonsterSwing', m, mDmg, ctx);

  /* Healing auto-eat STAYS away and keeps consuming food. It is survival,
     not a bonus — the ruling is explicit. It is also heal-only: it never
     applies a food's timed buff (b163). */
  const ate = !!call(fx, 'autoEat', ctx);

  if (state.playerHp <= 0) {
    resolveDeath(state, ctx);
    return { outcome: OUTCOME.DEATH, crit: didCrit, pDmg, mDmg, ate };
  }
  return { outcome: OUTCOME.HIT, crit: didCrit, pDmg, mDmg, ate };
}

/**
 * Simulate a SPAN of elapsed time — the accrual path.
 *
 * @param ctx  everything simulateTick wants, plus:
 *   fromMs, toMs   the span. Server-authoritative timestamps: the accrual
 *                  engine passes `server_last_seen` and `now()`, and the
 *                  client clock is never consulted for authority.
 *   tickMs         the swing interval. Pass `combatTickMs()` — the same
 *                  number live play uses, gear speed and weapon family
 *                  included. The old away loop used the flat 2.4s constant.
 *                  CLAMPED to `COMBAT_BALANCE.minTickMs` (600ms); a hostile
 *                  or garbage value cannot inflate the tick budget.
 *   minTickMs      optional, explicit opt-in to a finer floor. Absent, zero,
 *                  negative or non-numeric = the real floor. Never plumb a
 *                  client-supplied value into this.
 *   botdFor(atMs)  builds the featured-boss resolver for a segment.
 *   capped         did the caller clamp this span at the offline cap?
 *   fx.segment(atMs, run)  optional: lets the caller pin its ambient
 *                  "which instant are we simulating" before running a
 *                  segment's ticks, so a nested wrapped killMonster
 *                  resolves the right day's boss.
 *
 * @returns the welcome-back summary. Every field the ruling's "player-facing
 *          honesty" clause requires is in here, so no renderer has to guess
 *          — and none of them can invent a bonus that was not applied.
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

export function simulateSpan(state, ctx) {
  /* SAFE BY CONSTRUCTION, not by caller discipline. `tickMs` divides elapsed
     time, so it is the accrual path's single largest exploit surface: at a
     1ms floor a twelve-hour absence budgets ~43,200,000 ticks instead of
     ~18,000. The client call is incidentally safe (gear cannot change while
     you are away, and `combatTickMs()` already clamps), but this primitive is
     also the one the accrual Edge Function runs, where `tickMs` would arrive
     from a request body if anyone let it. It clamps itself.

     THE SERVER RULE (docs/design/server-authority.md §3): the accrual engine
     DERIVES tickMs from server-owned equipment and never reads it from the
     client. This clamp is the second line of defence, not the first. */
  const tickMs = resolveTickMs(ctx);
  const segments = utcDaySegments(ctx.fromMs, ctx.toMs);
  const rate = rateMult(ctx);

  /* Repair the in-flight fight before simulating it. `monsterHp` and
     `playerHp` are NO_SYNC (they belong to the device you are fighting on),
     so a save restored FROM THE CLOUD arrives with an activeMonster and no
     hit points. `Math.max(0, undefined - dmg)` is NaN, `NaN <= 0` is false,
     and the replay would then run every tick of a twelve-hour absence
     without ever landing a kill. Silent, total, and only on the cross-device
     path — the one nobody replays locally. */
  if (state.activeMonster) {
    const m0 = (ctx.monsters || {})[state.activeMonster];
    if (m0) {
      if (!(state.monsterMaxHp > 0)) state.monsterMaxHp = m0.hp;
      if (!(state.monsterHp > 0)) state.monsterHp = state.monsterMaxHp;
    }
    if (!(state.playerMaxHp > 0)) state.playerMaxHp = 10;
    if (!(state.playerHp > 0)) state.playerHp = state.playerMaxHp;
  }

  let ticks = 0; let kills = 0; let foodEaten = 0; let crits = 0;
  let died = false; let featuredMs = 0; let featuredDropMult = 1;
  let carryMs = 0;
  /* b341 — HOW LONG THE ABSENCE ACTUALLY PAID, and WHAT ENDED IT.
     `died` has been on this payload since b325 and the welcome-back card never
     read it, so a night that ended sixty seconds in still rendered as
     "8h away — +53 XP … at the base rate". Saying "you died" is not enough on
     its own either: without the span, "8h away" and "you died" sit side by side
     and the player still has to guess which minutes earned. So the simulation
     STATES both — the ruling's rule is that a renderer must never infer. */
  let survivedMs = 0;   // ms actually simulated before the loop stopped
  let diedTo = null;    // the monster id that landed the killing blow
  const segLog = [];

  /* ── THE BUFF CLOCK, DRIVEN BY THIS TIMELINE ────────────────────────────
     Timed buffs are PERSONAL, so they pay away (src/core/away.js `AWAY_SCOPE`
     — Tyler, 2026-08-14: "they should still get their personal / clan buffs").
     A bonus that pays away must also be SPENT away, or a ten-minute Feast
     eaten on the way out covers an eight-hour night. This loop is the only
     away caller that owns a timeline, so this loop owns the clock.

     Crucially, NOTHING is plumbed to make the payout follow. `ctx.bonus` is
     the client's seven-deep getBonus chain, whose buff term reads the SAME
     `state.buffs` array this drains — one identity, not two copies — so the
     Feast simply stops contributing on the tick after it runs out. The server
     builds `state` from DB rows with no `buffs` field, so every line below is
     an inert no-op there until the server grows a buff model.

     Order is load-bearing: SAMPLE, TICK, THEN DRAIN. A buff that is alive when
     the swing happens pays for that swing, exactly as it would live; draining
     first would rob the last swing of a buff's life.

     The queue is READ FRESH each tick rather than captured once, and the
     reason is narrower than it first looks — worth stating, because the
     obvious reason is wrong. `state` IS `G` on the client and
     `window.pruneBuffs()` REASSIGNS `G.buffs`; that alone is harmless, because
     it reassigns to a `filter()`ed array whose ELEMENTS are the same objects,
     so draining through a stale reference still moves the very buffs the
     getBonus chain reads. (Measured: capturing the array once passes a
     reassignment test unchanged.) What a captured reference CANNOT see is a
     buff APPEARING in a queue that was empty when the span began — it would
     never be clocked, so it would pay for the rest of the absence and come
     back reading full. A property lookup per tick costs less than the scan
     beside it, so the hazard is removed rather than reasoned about. AWAY-15(f)
     pins it. */
  /* `active: true` because a running fight IS work — that is the one freeze
     condition `tickBuffs` still honours, and away combat does not meet it. */
  const buffCtx = { away: !!ctx.away, active: true };
  const liveQueue = () => {
    const q = state.buffs;
    return (Array.isArray(q) && q.length > 0) ? q : null;
  };
  let buffPaidMs = 0;              // ms of the span a buff was actually live for
  const buffsExpired = [];         // the types that ran out DURING the absence

  for (const seg of segments) {
    if (!state.activeMonster) break;
    /* Carry the sub-tick remainder across the UTC boundary so splitting a
       span into segments cannot cost the player a swing per midnight. */
    const budget = seg.ms * rate + carryMs;
    const n = Math.floor(budget / tickMs);
    carryMs = budget - n * tickMs;
    if (n <= 0) continue;

    const segCtx = Object.assign({}, ctx, {
      atMs: seg.fromMs,
      botd: (typeof ctx.botdFor === 'function') ? ctx.botdFor(seg.fromMs) : ctx.botd,
    });
    const targetAtSegStart = state.activeMonster;

    let ran = 0;
    const run = () => {
      for (let i = 0; i < n; i++) {
        if (!state.activeMonster) break;
        /* Read the target BEFORE the tick: the death fx nulls `activeMonster`
           (legacy COMBAT_FX.onDeath), so after the fact there is nothing left
           to name and the card would have to say "you died" to nobody. */
        const facing = state.activeMonster;
        /* Read ONCE, before the tick, and both charge and drain THAT queue.
           Reading it again afterwards looks equivalent and is not: `fx.onSwing`
           runs inside the tick, so a buff added during the tick would be
           charged one interval it was never alive for. */
        const q = liveQueue();
        const buffLive = q ? hasActiveBuff(q) : false;
        const r = simulateTick(state, segCtx);
        ran++;
        if (q) {
          if (buffLive) buffPaidMs += tickMs;
          const bt = tickBuffs(q, tickMs, buffCtx);
          for (const t of bt.expired) buffsExpired.push(t);
        }
        if (r.crit) crits++;
        if (r.ate) foodEaten++;
        if (r.outcome === OUTCOME.KILL) kills++;
        if (r.outcome === OUTCOME.DEATH) { died = true; diedTo = facing; break; }
        if (r.outcome === OUTCOME.STOP) break;
      }
    };
    const segFx = fxOf(segCtx);
    if (typeof segFx.segment === 'function') segFx.segment(seg.fromMs, run); else run();

    ticks += ran;
    const featBonus = (segCtx.botd && typeof segCtx.botd.killBonuses === 'function')
      ? segCtx.botd.killBonuses(targetAtSegStart) : NO_BONUS;
    const wasFeatured = featBonus.dropMult > 1 || featBonus.xpMult > 1;
    /* Count only the time actually simulated — a death two minutes into a
       segment must not report eight hours on the featured boss. */
    const simulatedMs = Math.min(seg.ms, ran * tickMs);
    survivedMs += simulatedMs;
    if (wasFeatured) {
      featuredMs += simulatedMs;
      /* The largest drop multiplier this absence actually paid. The welcome-back
         line has to say "+50% drops" (daily, x1.5) or "+100%" (weekly, x2.0) —
         a renderer that guessed "daily" would halve a weekly night in the copy,
         which is the same failure as quoting a bonus nobody paid. Stated by the
         simulation, exactly like `blessed` and `crits`. */
      featuredDropMult = Math.max(featuredDropMult, featBonus.dropMult || 1);
    }
    segLog.push({ fromMs: seg.fromMs, toMs: seg.toMs, ticks: ran, featured: wasFeatured });
    if (died) break;
  }

  /* Drop what ran out. An expired entry already pays nothing (`activeBuffs`
     filters on `remainingMs > 0`), so this is not correctness — it is the
     player not coming back to a row reading "0s" that no live tick will ever
     clear: `tickBuffs` skips an already-dead buff, so nothing else would
     prune it. Reassigns rather than splices, matching `window.pruneBuffs`. */
  if (buffsExpired.length && Array.isArray(state.buffs)) state.buffs = pruneBuffs(state.buffs);

  const spanMs = Math.max(0, (Number(ctx.toMs) || 0) - (Number(ctx.fromMs) || 0));
  return {
    kills,
    foodEaten,
    died,
    /* b341 — the two facts that make `died` sayable on a durable surface.
       `survivedMs` is the span the simulation actually ran; on a death that is
       the ONLY part of the absence that earned anything, because the fx clears
       the target and every later branch of processOffline is gated on it.
       `diedTo` is the monster id, so the card can name the foe. */
    survivedMs,
    diedTo,
    crits,
    ticks,
    hrs: +(spanMs / 3600000).toFixed(2),
    /* ── the honesty payload (ruling, "Player-facing honesty") ──
       Stated by the simulation, not inferred by a renderer. A welcome-back
       card that had to guess would eventually quote a blessing nobody paid. */
    /* ── RULING 3.5 (Game Designer, 2026-08-15): ONE AUTHORITY ────────────
       This was the literal `false`, with the comment "blessings are
       presence-gated (b227)". The value was right and the SOURCE was wrong:
       it restated a decision that `AWAY_SCOPE.blessing` already owns, in four
       places (here, skill-sim, artisan-sim, legacy's own summary). A rule
       written down twice is a rule that can disagree with itself, and the
       first world-boss blessing that pays away would have flipped the table
       and left every welcome-back card in the game still saying "no blessing
       touched this night" — the summary is the ONLY thing a renderer is
       allowed to read, so the lie would have been the player-facing one.

       `channelApplies` is the same resolver `buffs.js` asks and the same one
       `rateMult` two lines below comes from. Nothing here decides anything;
       it reports what the table decided. Flip `AWAY_SCOPE.blessing` and this
       follows in the client, in the three sims and in the Edge Function that
       imports this file — with no second edit and no chance of missing one.

       KNOWN LIMITATION, deliberate: the client's live gate is
       `blessingsApply()` = not-in-replay AND session-online, so a LIVE span
       computed while the connection is down would report `blessed:true` here.
       No production caller is affected — all three span callers pass
       `away:true` — and a span summary has no presence signal but `ctx.away`.
       If a live-span consumer ever appears, it must pass its own gate through
       `ctx`, NOT re-derive the rule here. */
    blessed: channelApplies(CHANNEL.BLESSING, ctx),
    /* ALWAYS FALSE NOW, and deliberately still here.
       Under b326 a held buff was frozen through the absence and three
       renderers printed "your buffs were paused" off this flag. Buffs pay away
       now, so nothing is paused, and the honest value is false — which those
       three renderers already handle (it is the no-buffs-held case they were
       written for). Removing the key instead would leave
       `if (off.buffsPaused)` reading `undefined` on a stale summary and is a
       larger blast radius for no gain. What replaced it as the interesting
       fact is `buffPaidMs` / `buffsExpired` below. */
    buffsPaused: false,
    /* WHAT THE BUFFS ACTUALLY DID, stated rather than inferred — the same rule
       as `blessed`, `crits` and `died`. `buffPaidMs` is the slice of the
       simulated span during which at least one buff was live (0 when none were
       held, and never longer than the span), and `buffsExpired` names the types
       that ran out mid-absence. A welcome-back card can now say "your Hunter's
       Feast covered the first 14 minutes" instead of guessing, and the guess it
       would otherwise make — "the whole night was buffed" — is exactly the mint
       this design exists to prevent. */
    buffPaidMs,
    buffsExpired,
    featuredMs,              // ms spent on a Boss of the Day / Week
    featuredDropMult,        // the drop multiplier that featured time paid (1 when none)
    capped: !!ctx.capped,
    rateMult: rate,
    segments: segLog,
  };
}
