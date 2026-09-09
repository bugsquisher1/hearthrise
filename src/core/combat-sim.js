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

import { COMBAT_BALANCE, rollAttack, rollCrit, applyCrit } from './combat.js?v=525';
import { rollDropTable } from './drops.js?v=525';
import { resolveHearthfind } from './hearthfind.js?v=525';
import { hitXpRoute, killXpRoute } from './styles.js?v=525';
import { applyGoldFind } from './pacing.js?v=525';
/* `retreatAtFall` ONLY — the two rungs stay in away.js beside the recovery
   ladder, where the design tables live. This file asks the table; it does not
   restate it, so a designer moving a rung moves it in exactly one place. */
import { AWAY_RATE_MULT, CHANNEL, channelApplies, rateMult, recoveryFor, resumeHpFor, utcDaySegments,
         retreatAtFall } from './away.js?v=525';
/* THE RETREAT'S FOODLESS FACT (rev. 3). `chooseFood` is the SAME chooser
   `resolveAutoEat` asks and the same one accrual.js derives the receipt's
   `hadFood` from — one definition of "is there anything here I could eat", so
   the trigger and the sentence explaining it cannot disagree. It draws no
   random numbers and mutates nothing, so it is safe to call inside a seeded
   fight (§2.1's contract on `spendForSwings` applies for the same reason). */
import { chooseFood, resolveAutoEat } from './auto-eat.js?v=525';
/* THE FORECAST's seeded dice (ruling item 7). A fixed seed, never a clock —
   see `forecastFight` at the foot of this file. */
import { createRng } from './rng.js?v=525';
import { NO_BONUS } from './botd.js?v=525';
import { tickBuffs, pruneBuffs, hasActiveBuff } from './buffs.js?v=525';
/* THE CONSUMPTION SEAM (design item E1). The arithmetic lives in ./ammo.js and
   is imported rather than restated — one field, one carry, one guard. Nothing
   below branches on `ctx.away`, which is what keeps the AWAY-1 parity property
   true of the quiver as well as of the XP. */
import { spendForSwings, applyAmmoMult } from './ammo.js?v=525';

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

/* WHY A COMBAT SPAN STOPPED BEFORE THE ABSENCE DID — the same contract
   src/core/skill-sim.js and src/core/artisan-sim.js already publish under this
   name, and for the same reason: STATED by the simulation, never inferred by a
   renderer. `null` means "it ran the whole window", which is the ordinary night
   and is NOT the same thing as `paidMs < awayMs` (flooring a tick count already
   makes that true on a perfectly honest night).
   Imported by accrual.js as `COMBAT_STOP`, beside `STOP_REASON` (skill) and
   `ARTISAN_STOP`, so three tables with one shape cannot be confused for one. */
export const STOP_REASON = Object.freeze({
  /* Recovery rev. 3. The hero pulled back to camp: consecutive falls with no
     kill between them reached the rung in src/core/away.js `retreatAtFall`. */
  RETREAT: 'retreat',
});

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
  /* ── THE RETREAT COUNTER IS RESET BY *ANY* KILL (rev. 3) ─────────────────
     This one line is what makes the rule "CONSECUTIVE falls" rather than
     "falls today", and it is the whole reason the ruling rejected a daily cap:
     a hero who can win at all never retreats, because winning once clears the
     count. It lives at the TOP of the kill, before any drop or XP branch can
     return early, so there is no kill in this engine that fails to clear it.
     Written on `state` (the same object `resolveDeath` increments and hr_apply
     re-validates from the engine proposal) — never a per-window tally, which
     would be re-zeroed by every 90-second settle and make the rule unreachable.
     ⚠ ONLY WHEN THE COUNTER EXISTS. `undefined`/`null` is the "no such column"
       sentinel `resolveDeath` gates the whole rule on; writing 0 over it here
       would silently ARM the Retreat on a database that has never heard of it,
       which is the deploy-order hazard the sentinel exists to remove. */
  if (state.consecFalls !== null && typeof state.consecFalls !== 'undefined') {
    state.consecFalls = 0;
  }

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

  /* THE HEARTHFIND (Feature Slate §2). LAST, after every other draw this kill
     makes, so a monster with no table row is byte-identical to its
     pre-Hearthfind self and one WITH a row cannot shift its own gold or drops.
     Nothing scales it — no dropMult, no dropRate buff, no featured multiplier
     — because "never boostable by anything paid" is cheapest to keep true by
     giving the roll no modifier to take. The GRANT is not here: hr_apply looks
     the pair up in its own catalogue and writes the item, the ledger row and
     the world_finds row itself. */
  const found = resolveHearthfind(state, 'monster', id, ctx);

  const info = { gp, monster: m, monsterId: id, drops: rolled.dropped, events: rolled.events, featured: feat };
  if (found) info.hearthfind = found;
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
 *
 * RECOVERY (First-Night Idle Rescue, rev. 2). A death no longer ENDS the run —
 * it interrupts it, for `recoveryFor` in src/core/away.js: free on the day's
 * FIRST fall, then 2m, 4m, 8m … to a 64m cap, held to one rung while the
 * character is still a novice by LIFETIME death count.
 *
 * THE TWO COUNTS THE LADDER READS ARE DURABLE SERVER COUNTERS, NOT THIS
 * WINDOW'S. `state.deathsTodayBefore` / `state.deathsLifetimeBefore` are seeded
 * from `player_progress` (kind='stat' key='deaths', period=<UTC day> and '')
 * by whoever built this state — the accrual engine reads them off hr_state_of's
 * envelope. `state.stats.deaths` is the WINDOW-LOCAL tally, which is why it is
 * ADDED to both: that sum is `D_at_span_start + deaths_so_far`, i.e. the
 * in-span escalation, with no second counter to keep in step.
 *   ⚠ A caller that seeds neither (the live client before its state hydrates)
 *     gets the day's-first-fall grace, which is the UNDER-charging direction —
 *     and it is only ever a PREDICTION there, because the authoritative stamp
 *     is written by hr_apply from the engine's own read of the two rows.
 *
 * This function only REPORTS the number; the caller that owns a timeline
 * (`simulateSpan`) turns it into an absolute `recovering_until`, because it is
 * the only caller that knows which instant this death happened at.
 *
 * THE CHARACTER GETS UP AT `resumeHpFor(maxHp)` — 40%, not full. A full heal
 * made dying the cheapest heal in the game; see away.js's note.
 *
 * The activity pointer is deliberately NOT touched (it never was here — see the
 * note below), so resuming after recovery is the absence of a change.
 */
export function resolveDeath(state, ctx) {
  const fx = fxOf(ctx);
  state.stats = state.stats || {};
  const soFar = Math.floor(Number(state.stats.deaths) || 0);
  const base = (v) => { const n = Math.floor(Number(v)); return isFinite(n) && n >= 0 ? n : 0; };
  const todayBefore = base(state.deathsTodayBefore) + soFar;
  const lifeBefore  = base(state.deathsLifetimeBefore) + soFar;
  const recoverMs = recoveryFor({ deathsTodayBefore: todayBefore, deathsLifetimeBefore: lifeBefore });
  /* ── WAS THE BAG EMPTY *AT THIS FALL*? (Recovery rev. 3) ──────────────────
     Read from the LIVE SIMULATED BAG, here, at the instant of the fall — NOT
     from accrual.js's `hadFood`, which is a window-OPEN snapshot. The ruling is
     explicit about the difference and it is not a nicety: a hero who left home
     with forty Trout and ate the last one two hours into the night is foodless
     NOW, and now is when the decision is made. `hadFood` stays exactly what it
     is (the receipt's "you had no cooked food" sentence) and is untouched.

     ONE OBJECT, BOTH RUNTIMES. `state.inventory` IS the live bag by identity —
     `G.inventory` on the client, and accrual.js's `bag` (`startInv + every
     addItem - every autoEat`) on the server, assigned `state.inventory = bag`
     for exactly this reason. There is nothing here to plumb and nothing to
     keep in step.

     ⚠ THE NOMINATION IS DELIBERATELY `null`, AND THE ANSWER IS THE SAME EITHER
       WAY. `chooseFood(nominated, …)` returns `nominated` only when it is
       auto-eatable AND held, and otherwise falls through to the SAME scan of
       the whole bag — so as a BOOLEAN ("is there anything here I could eat")
       the nomination cannot change the result. Passing null keeps this call
       free of a per-runtime auto-eat config that would then have to be
       mirrored, checked and eventually drift. RETREAT-A5 pins the equivalence.

     ⚠ NO CATALOGUE ⇒ NOT FOODLESS, which is the opposite fail-direction from
       `recoveryFor`'s `harsh()`, and deliberately so. Those two counters only
       ever buy RELIEF, so garbage must buy none. This one only ever buys a
       SHORTER run, so an unreadable catalogue must not buy the harsher rung —
       a bare `simulateTick(state, {})` in a test would otherwise retreat a fed
       character three falls early. Every production caller passes `ctx.items`. */
  const cat = ctx && ctx.items;
  const foodless = cat ? !chooseFood(null, state.inventory, cat, Infinity) : false;
  /* ── THE CONSECUTIVE-FALL COUNT, INCLUDING THIS FALL ─────────────────────
     Seeded from `player_state.consec_falls` (projected by hr_state_of, written
     ONLY by hr_apply from this engine's proposal) and reset to 0 by ANY kill in
     `resolveKill`. Incremented here rather than in `simulateSpan` because the
     ATTENDED tick has no span: one engine, one counter, one place it moves.

     ⚠ THE FIELD'S PRESENCE IS THE SWITCH, and it has to be, because THE EDGE
       DEPLOY AND THE MIGRATION CAN LAND IN EITHER ORDER. `undefined`/`null` here
       means "this database has no consec_falls column" (accrual.js seeds null
       for exactly that case) or "this client has not had an envelope yet", and a
       character with no counter NEVER RETREATS — the pre-Retreat behaviour, byte
       for byte. Without this gate an engine deployed ahead of its migration
       would start pulling every foodless character back to camp off a counter
       that lives only inside one window and that nothing durable backs, which is
       a behaviour change nobody applied. Every other self-configuring input in
       this system (tool_carry, fight, ammo_carry, recovering_until) has the same
       property and it is the reason the two halves are safe in either order. */
  const hasCounter = state.consecFalls !== null && typeof state.consecFalls !== 'undefined';
  const consecFalls = hasCounter ? base(state.consecFalls) + 1 : 0;
  if (hasCounter) state.consecFalls = consecFalls;
  const retreat = hasCounter && retreatAtFall({ consecFalls, foodless });
  state.stats.deaths = soFar + 1;
  state.playerHp = resumeHpFor(state.playerMaxHp);
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
  /* THE WHOLE FALL, AS DATA — stated once, here, and read by the death sheet
     without re-deriving a single number of it. `deathsToday` is `n` in the
     ladder (the count AFTER this fall), `nextRecoverMs` is what the NEXT fall
     today would cost, and both come from the same table the server stamps
     from, so the sheet's warning cannot promise a rung the server will not
     charge. `resumeHp` is what the character is actually standing on. */
  const info = {
    died: true, streakBroken, recoverMs,
    deathsToday: todayBefore + 1,
    deathsLifetime: lifeBefore + 1,
    nextRecoverMs: recoveryFor({ deathsTodayBefore: todayBefore + 1, deathsLifetimeBefore: lifeBefore + 1 }),
    resumeHp: state.playerHp,
    /* ── THE RETREAT, AS DATA (rev. 3) ────────────────────────────────────
       Three facts, stated once here and read without re-derivation by all four
       consumers — `simulateSpan` (which owns the timeline and ends the run),
       accrual.js (which idles the pointer and proposes the counter), the
       attended death sheet ("You pulled back") and the away card's copy. A
       renderer that recomputed `retreat` from a count and a bag would be the
       second copy of the rule, and the second copy is always the one that is
       wrong six months later.
       ⚠ `foodless` is the fact AT THIS FALL. It is what decides WHICH sentence
         the player reads, and it is not interchangeable with the receipt's
         window-open `hadFood`. */
    consecFalls,
    foodless,
    retreat,
  };
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
 *
 * ⚠ THE AMMO SPEND DRAWS NOTHING, AND THAT IS A CONTRACT. `spendForSwings` is
 *   a deterministic carry, never a dice roll (src/core/ammo.js §2.1). If it
 *   ever consumed a draw it would shift every roll after it and the parity
 *   test would be comparing two different fights — which is also why a
 *   "20% chance to consume" model was rejected in favour of `ammoPerShot: 0.2`.
 */
export function simulateTick(state, ctx) {
  const fx = fxOf(ctx);
  const monsters = ctx.monsters || {};
  const id = state.activeMonster;
  if (!id) return { outcome: OUTCOME.STOP, reason: 'no-target' };
  const m = monsters[id];
  if (!m) { state.activeMonster = null; return { outcome: OUTCOME.STOP, reason: 'unknown-monster' }; }

  /* ── E1: THE ARROW IS SPENT ON THE SWING ──────────────────────────────
     Hit or miss, kill or not (R3). That is what makes the burn a pure
     function of time, which is what makes the pre-flight projection and the
     away card's dry-out line the same expression evaluated at two moments —
     `consumablesPerHour` / `dryAtMs` in ./ammo.js. Spending on HITS would make
     the rate a function of the monster's defence and the player's accuracy, so
     a high-accuracy build would be CHEAPER to run and the projection could not
     be computed before the target was chosen.

     Charged BEFORE the roll and applied to it, because `startMult` is the
     supply state the swing is loosed at: the swing that spends the LAST arrow
     is a supplied swing and hits at full strength; the next one is weak.

     No-ammo loadouts are byte-identical to the pre-E1 engine — `applyAmmoMult`
     returns its input unchanged at a multiplier of 1, and `spendForSwings`
     returns without touching `state` when the slot is empty or the rung free. */
  const supply = spendForSwings(state, 1, ctx);

  const roll = ctx.playerRolls(m);
  let pDmg = rollAttack(ctx.rng, roll.accuracy, applyAmmoMult(roll.maxHit, supply.startMult));

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
    return { outcome: OUTCOME.KILL, crit: didCrit, pDmg, kill: info || null, supply };
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
    /* `recoverMs` rides the outcome for the same reason `supply` does: the span
       needs it to know how many ticks this character is Knocked Out for, and a
       caller that re-derived it would be a second copy of the first-death
       grace. */
    const d = resolveDeath(state, ctx);
    /* `retreat` / `foodless` / `consecFalls` ride the outcome for the same
       reason `recoverMs` does: the span has to know whether THIS fall ended the
       run, and a caller that re-derived it would be a second copy of the rule.
       The attended tick reads `retreat` too (legacy.js COMBAT_FX.onDeath), so
       both paths branch off one boolean computed in one place. */
    return { outcome: OUTCOME.DEATH, crit: didCrit, pDmg, mDmg, ate, supply,
             recoverMs: d.recoverMs, retreat: d.retreat, foodless: d.foodless,
             consecFalls: d.consecFalls };
  }
  /* `supply` rides on EVERY outcome, kill included, because the span's
     `consumed` tally is built from it and an arrow spent on a killing blow is
     still an arrow. Returned rather than accumulated into `state`: the client's
     `state` IS `G`, and a new top-level G field would be a save-allowlist
     question for a number that is only ever a per-span readout. */
  return { outcome: OUTCOME.HIT, crit: didCrit, pDmg, mDmg, ate, supply };
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

  /* ── THE RECOVERY CLOCK (First-Night Idle Rescue) ───────────────────────
     ONE ABSOLUTE INSTANT, never a per-window counter. `recoverUntilMs` is
     seeded from `state.recoveringUntilMs` (the server's `recovering_until`
     column) and is only ever MOVED FORWARD by a death, to
     `thisTickInstant + recoverMs`. Nothing recomputes it from a remaining-ms counter, and
     that is the whole of exploit R1: the live settle cadence is ~90 s, so a
     counter would be re-zeroed by every settle and two minutes of Knocked Out
     would cost a player who reloads nothing at all. An absolute instant is the
     same instant however many times the window is sliced.

     A tick is a RECOVERY tick when its own instant is before that line. It
     simulates nothing — no swing, no XP, no loot, no food — but it DOES spend
     the tick's budget and DOES drive the buff clock, because time passing is
     the one thing being Knocked Out does not stop (b347/b351: paying and
     draining are one change, and here only the paying half is switched off). */
  let recoverUntilMs = Number(state.recoveringUntilMs);
  if (!isFinite(recoverUntilMs) || recoverUntilMs <= 0) recoverUntilMs = 0;
  /* DOWN, as a fact separate from the CLOCK. They are not the same thing and
     collapsing them cost a free kill: a FIRST-EVER death recovers in zero, so
     there is no clock at all, and the character must still be stood back up
     with a full-HP foe in front of them. Without this flag the next tick swung
     at a monster `resolveDeath` had left on 0 HP and scored an instant kill —
     a death would have PAID. Seeded true when the window opens mid-recovery,
     because a character the server says is down is a character who was. */
  let downed = recoverUntilMs > 0;
  let deaths = 0;       // deaths INSIDE this credited window
  let recoverMs = 0;    // ms of this window spent Knocked Out
  /* ONE ENTRY PER DEATH, and this is the ONLY per-death record the system
     keeps. It is what the N3 ledger row is built from (the accrual engine turns
     each entry into one `player_ledger` row through hr_apply) and what the
     receipt's ladder line reads. It is BOUNDED BY THE LADDER ITSELF: recovery
     doubles to a 64-minute cap, so a twelve-hour night cannot hold more than
     about twenty deaths however hard a character tries — which is why a
     per-death row is affordable here and a per-TICK row never would be. */
  const deathLog = [];
  const baseCount = (v) => { const n = Math.floor(Number(v)); return isFinite(n) && n >= 0 ? n : 0; };

  /* ── THE RETREAT (rev. 3) ────────────────────────────────────────────────
     WHAT ENDED THE RUN, stated by the simulation exactly as skill-sim.js and
     artisan-sim.js state their own stops. `null` is the ordinary night.

     THE ORDER INSIDE THE FALL IS THE RULING AND IT IS LOAD-BEARING: the
     retreating fall is a FALL FIRST. It charges its own ladder rung, stamps
     `recoverUntilMs`, and writes its `deathLog` row — and only THEN does the
     run end. Retreating before charging would make the third foodless fall the
     cheapest fall in the game and turn "pull back" into a way to dodge the
     ladder; RETREAT-W3 is the assertion that it cannot.

     Everything after the retreat is IDLE: no swing, no XP, no drop, no food
     burn, no death row, and no recovery tick either — the span simply stops
     being simulated, which is why `idleMs` is a field and not a subtraction a
     renderer performs. */
  let stopReason = null;
  let retreatAtMs = null;       // the absolute instant the hero pulled back
  let retreatUntilMs = 0;       // the recovery line the retreating fall stamped
  let retreatFoodless = false;  // was the bag empty AT that fall? decides the copy
  let retreatFalls = 0;         // consecutive falls at the retreat (3 or 6 today)

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

  /* ── THE SUPPLY LEDGER FOR THIS SPAN (consumable-economy.md §10) ─────────
     STATED BY THE SIMULATION, never inferred by a renderer — the same rule as
     `blessed`, `crits` and `died`. The away card has to be able to say "you
     ran out of Steel Arrows 4h 20m in — the rest of the night fought at a
     quarter strength", and §10's binding condition is that the pre-flight
     quote and the post-hoc report come from one expression. `dryAtMs` in
     ./ammo.js is that expression evaluated BEFORE the span; these three fields
     are the same fact observed after it, so the two cannot disagree.

     `consumed` is an AGGREGATE per item id, not a row per tick: §13.2 —
     "13,636 arrows over an 8-hour absence is 13,636 ledger rows if anyone gets
     that wrong." The server folds this into its one signed `items` delta. */
  const consumed = Object.create(null);
  let dryAtSpanMs = null;          // ms INTO the span at which the stack hit 0
  let dryItemId = null;            // which stack ran out
  let weakTicks = 0;               // ticks simulated at the unsupplied multiplier

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

    /* `ran` counts SIMULATED ticks only. Recovery ticks spend the segment's
       budget without incrementing it, so `survivedMs` (the earning span) and
       `ticks` (swings) both stay honest with no second subtraction. */
    let ran = 0;
    const run = () => {
      for (let i = 0; i < n; i++) {
        if (!state.activeMonster) break;
        /* THE TICK'S OWN INSTANT. The same expression `fx.mark` already uses —
           one statement of "which moment is this tick", so the recovery line
           and the combat-XP watermark cannot disagree about it. */
        const atMs = seg.fromMs + i * tickMs;
        if (recoverUntilMs > atMs) {
          /* KNOCKED OUT. Spend the tick, drain the buff queue, earn nothing.
             `ran` is NOT incremented — `survivedMs` means "ms that earned", and
             a renderer that read recovery time as earning time would tell the
             player their night paid when it did not. */
          const rq = liveQueue();
          if (rq) {
            const rbt = tickBuffs(rq, tickMs, buffCtx);
            for (const t of rbt.expired) buffsExpired.push(t);
          }
          recoverMs += tickMs;
          continue;
        }
        /* UP AGAIN, FULL HP, SAME FOE — the resume half of the rule. Runs on
           the FIRST non-recovery tick after a recovery, so the fight the player
           left is the fight that carries on. */
        if (downed) {
          downed = false;
          recoverUntilMs = 0;
          const mr0 = (ctx.monsters || {})[state.activeMonster];
          if (mr0) { state.monsterMaxHp = mr0.hp; state.monsterHp = mr0.hp; }
          /* 40%, NOT full (away.js `resumeHpFor`). Restated here rather than
             left to `resolveDeath` because a window can OPEN mid-recovery, in
             which case no death happened inside it and nobody stood the
             character up. Same function, so the two cannot disagree. */
          state.playerHp = resumeHpFor(state.playerMaxHp);
        }
        /* THE TICK CLOCK, for a caller that needs to attribute this tick's XP to
           an instant (the away combat-XP settle clamps its credited window to
           combat_xp_accrued_to — src/core/combat-xp-cap.js / accrual.js). A pure
           notification: no arithmetic here changes, and it is a NO-OP for every
           caller that does not define `fx.mark` (the live client, the AWAY-1
           fixtures), so parity is byte-for-byte preserved. */
        if (typeof segFx.mark === 'function') segFx.mark(seg.fromMs + i * tickMs);
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
        /* THE SUPPLY LEDGER, folded per tick and reported once. `sup.startMult`
           is the multiplier the swing that just happened actually ran at, so a
           span never has to average two states it was never in.
           `dryAtMs` is stamped on the FIRST tick whose swing was unsupplied —
           `ticks + ran` is that tick's index, and index x tickMs is the same
           closed form `ammo.js dryAtMs()` quoted before the span began. §10:
           the pre-flight promise and the post-hoc report are one expression. */
        const sup = r.supply;
        if (sup) {
          if (sup.spent > 0) consumed[sup.id] = (consumed[sup.id] || 0) + sup.spent;
          if (sup.startMult < 1) {
            weakTicks++;
            if (dryAtSpanMs === null) {
              dryAtSpanMs = (ticks + ran) * tickMs;
              dryItemId = sup.id;
            }
          }
        }
        ran++;
        if (q) {
          if (buffLive) buffPaidMs += tickMs;
          const bt = tickBuffs(q, tickMs, buffCtx);
          for (const t of bt.expired) buffsExpired.push(t);
        }
        if (r.crit) crits++;
        if (r.ate) foodEaten++;
        if (r.outcome === OUTCOME.KILL) kills++;
        if (r.outcome === OUTCOME.DEATH) {
          died = true; diedTo = facing; deaths++;
          /* THE POINTER SURVIVES THE DEATH. `fx.onDeath` nulls `activeMonster`
             on the client (legacy COMBAT_FX.onDeath -> stopCombat), which used
             to be how the run ended; it is restored here so the loop keeps the
             same target and the accrual engine's `!state.activeMonster` test
             sees a character who is still fighting slimes, just face-down. */
          state.activeMonster = facing;
          downed = true;
          /* From the END of the swing that killed them — the dying tick was
             simulated and earned, the next one is the first that does not.
             ⚠ ONLY when there is a recovery to serve. A first-ever death
               recovers in ZERO (the grace), and stamping `atMs + tickMs` for it
               would leave a line in the future at the end of a window and
               report a character who is up as still recovering. */
          const rec = Number(r.recoverMs) || 0;
          if (rec > 0) recoverUntilMs = atMs + tickMs + rec;
          /* `state.stats.deaths` has ALREADY been incremented by resolveDeath,
             so it is the count AFTER this fall — which is exactly `n` in the
             ladder and exactly what the receipt and the ledger row want. */
          deathLog.push({
            atMs: atMs + tickMs,
            monster: facing,
            recoverMs: rec,
            deathsToday:    baseCount(state.deathsTodayBefore)    + deaths,
            deathsLifetime: baseCount(state.deathsLifetimeBefore) + deaths,
            resumeHp: state.playerHp,
          });
          /* THE RETREAT, AFTER THE FALL HAS BEEN PAID FOR IN FULL. Every line
             above has already run for this fall — the rung charged, the line
             stamped, the ledger row written, `stats.deaths` incremented — which
             is the ruling's "the triggering fall charges its rung and stamps
             recovering_until BEFORE the retreat", expressed as ORDER rather
             than as a comment nobody can execute.
             `r.retreat` is `resolveDeath`'s own answer; nothing is re-derived
             here, so the attended tick and this span cannot disagree about
             which fall was the last one (RETREAT-W1, the AWAY-1 property). */
          if (r.retreat) {
            stopReason = STOP_REASON.RETREAT;
            retreatAtMs = atMs + tickMs;
            retreatUntilMs = recoverUntilMs;
            retreatFoodless = !!r.foodless;
            retreatFalls = Math.max(0, Math.floor(Number(r.consecFalls) || 0));
            break;
          }
          continue;
        }
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
    /* THE ONE `break` THE LOOP IS ALLOWED, and it is not the one below. The
       segment's own bookkeeping runs FIRST (a retreat two minutes into a
       segment must still report the two minutes it earned and the featured
       time it spent), and only then does the span stop. */
    if (stopReason) break;
    /* NO `if (died) break;`. That line WAS the cliff: one death two minutes into
       a twelve-hour night ended the simulation and the remaining eleven hours
       fifty-eight minutes paid nothing. A death is now a pause, and the pause is
       expressed as ticks that do not swing — which is why there is nothing here
       to replace it with. */
  }

  /* Drop what ran out. An expired entry already pays nothing (`activeBuffs`
     filters on `remainingMs > 0`), so this is not correctness — it is the
     player not coming back to a row reading "0s" that no live tick will ever
     clear: `tickBuffs` skips an already-dead buff, so nothing else would
     prune it. Reassigns rather than splices, matching `window.pruneBuffs`. */
  if (buffsExpired.length && Array.isArray(state.buffs)) state.buffs = pruneBuffs(state.buffs);

  const spanMs = Math.max(0, (Number(ctx.toMs) || 0) - (Number(ctx.fromMs) || 0));

  /* THE RESULTING RECOVERY LINE, written back onto `state` as an ABSOLUTE so
     the accrual engine can propose it verbatim (`delta.recovering_until`) and
     the next window can seed from it. Cleared to 0 once it is in the past —
     "still recovering" is a claim about the future and nothing else. */
  const toMs = Number(ctx.toMs) || 0;
  const recoverRemainingMs = Math.max(0, recoverUntilMs - toMs);
  state.recoveringUntilMs = recoverRemainingMs > 0 ? recoverUntilMs : 0;

  /* ── THE IDLE TAIL (rev. 3) ──────────────────────────────────────────────
     The slice of the span that accrued as NOTHING because the hero had already
     pulled back to camp. STATED, for the same b341 reason every other field
     here is: `paidMs + recoverMs + idleMs === awayMs` is then an equality a
     test can assert and a card can quote, and no renderer has to discover the
     tail by subtracting two numbers whose flooring it does not own.
     0 on every night that did not retreat, so nothing about the shipped
     surfaces moves by a byte. */
  const idleMs = stopReason ? Math.max(0, spanMs - survivedMs - recoverMs) : 0;

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
    /* ── THE RECOVERY PAYLOAD (First-Night Idle Rescue) ────────────────────
       STATED BY THE SIMULATION, never inferred by a renderer — the same b341
       rule that governs `died`, `blessed` and `crits`, and it matters more here
       than anywhere: the receipt has to say "you fell four times and spent
       eight minutes on the floor", and a card that divided `awayMs - paidMs` by
       two minutes to guess the count would be wrong on every night that ended
       mid-recovery.

       `deaths`            deaths inside the CREDITED window (not the lifetime
                           counter — that is `stats.deaths`).
       `recoverMs`         ms of this window spent Knocked Out. Never earning.
       `recoverRemainingMs` >0 when the window closed while still down, so the
                           card can say "1:47 to go" instead of implying the
                           character is up and fighting.
       `died` / `diedTo` / `survivedMs` KEEP THEIR EXACT SHIPPED MEANINGS —
       three surfaces read them and this change may not move any of the three. */
    deaths,
    recoverMs,
    recoverRemainingMs,
    /* THE PER-DEATH RECORD. Stated by the simulation (b341), never inferred:
       the ledger row and the receipt's `free, 2m, 4m…` line both need to know
       WHICH rung each fall landed on, and a renderer that divided total
       recovery by a rung would be wrong on every night with a novice clamp or
       a cap in it. */
    deathLog,
    /* The rungs, in order, as the ladder ACTUALLY charged them — the receipt's
       "tonight it went free, 2m, 4m" line. Projected off deathLog rather than
       regenerated from a count, because a night that hit the novice clamp or
       the 64-minute cap does not match the bare doubling and a regenerated
       ladder would OVERSTATE the penalty. */
    recoverLadder: deathLog.map((d) => d.recoverMs),
    /* ── THE RETREAT PAYLOAD (rev. 3) ─────────────────────────────────────
       `stoppedBy` is the same key skill-sim and artisan-sim publish, so the
       three away paths answer "what ended this?" in one vocabulary and the
       away card's STOP_COPY table needs no combat special case. It is `null`
       on every ordinary night, which is what keeps every shipped renderer
       byte-identical.

         stoppedBy       'retreat' | null
         retreatMs       ms INTO the span at which the hero pulled back — the
                         same shape as `dryMs` above, and the number the copy
                         quotes ("you pulled back to camp 2h 14m in").
                         ⚠ null means "no retreat"; ZERO would mean one at the
                           very first tick, so test `!== null`, never truthiness
                           — the same trap `dryMs` documents.
         retreatUntilMs  the ABSOLUTE recovery line the retreating fall stamped.
                         Stated because `recoveringUntilMs` may have elapsed by
                         the end of a long window, and "the fall was charged" is
                         then unprovable from the end state alone (RETREAT-W3).
         retreatFoodless was the bag empty AT that fall? Decides WHICH of the
                         two ruled sentences the player reads. Not `hadFood`.
         retreatFalls    the consecutive-fall count that tripped it (3 or 6).
                         Read by the copy so the sentence cannot promise a rung
                         the table no longer charges.
         idleMs          the tail that paid nothing. See its note above. */
    stoppedBy: stopReason,
    retreatMs: (stopReason && retreatAtMs !== null)
      ? Math.max(0, retreatAtMs - (Number(ctx.fromMs) || 0)) : null,
    retreatUntilMs: stopReason ? retreatUntilMs : 0,
    retreatFoodless: stopReason ? retreatFoodless : false,
    retreatFalls: stopReason ? retreatFalls : 0,
    idleMs,
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
    /* ── THE SUPPLY HALF OF THE HONESTY PAYLOAD (§10) ────────────────────
       `consumed` is `{itemId: qty}` — what the quiver actually paid, aggregated.
       `dryMs` is how far into the span the stack hit zero, `dryItemId` names
       it, and `weakMs` is how much of the span was fought unsupplied. §10's
       first rule is that the card must never say "you ran out" without saying
       what it cost, and it cannot say what it cost from a number nobody stated.

       ⚠ TEST `dryMs !== null`, NEVER `if (dryMs)`. `null` means "it never ran
         out"; ZERO means "it was already empty when the span began", which is
         the most important case to say out loud and the one a truthiness check
         silently reports as a good night. */
    consumed: Object.assign({}, consumed),
    dryMs: dryAtSpanMs,
    dryItemId,
    weakMs: weakTicks * tickMs,
    featuredMs,              // ms spent on a Boss of the Day / Week
    featuredDropMult,        // the drop multiplier that featured time paid (1 when none)
    capped: !!ctx.capped,
    rateMult: rate,
    segments: segLog,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   THE FORECAST (Recovery Rule rev. 3, item 7 — "NEVER REFUSE A FIGHT, WARN ONCE")

   The ruling REJECTED refusing an overmatched fight, by name, as the
   residue-ahead class: beating something you should not be able to beat is a
   reward, and a client that decides a player may not try has taken an authority
   it does not own. So the answer is a warning the player can walk straight
   past, and the warning has to be TRUE.

   WHICH IS WHY IT IS THE SIMULATION AND NOT A DPS FORMULA. A closed-form
   "time to kill vs time to die" would be a SECOND combat model — the exact
   thing docs/design/away-time-ruling.md and AWAY-12 exist to forbid — and it
   would be wrong in all the ways the real loop is subtle: crit rolls, the
   accuracy distribution, auto-eat, ammo running dry, the weakness multiplier,
   the Boss of the Day. A player warned by a formula would be warned about a
   fight that does not exist. `forecastFight` runs `simulateSpan`, which is the
   fight that does exist. FORECAST-1 is that assertion.

   FOUR PROPERTIES, each deliberate:
     1. PURE. The caller's state is DEEP-CLONED first, so a forecast cannot heal
        a character, eat their food, spend an arrow, move a counter or advance a
        buff. `simulateSpan` mutates in place by design; this is the one caller
        that must not let it.
     2. FIXED SEED. Same state, same answer, every time it is asked — a warning
        that flickered between two taps of the same button would teach the
        player to ignore it. The seed is a constant, not a clock.
     3. ADVISORY ONLY. Nothing here is proposed to the server, journalled, or
        read back. `fx` is EMPTY: no `addItem`, no `addXp`, no `killMonster`, no
        toast. The only handler is an auto-eat bound to the CLONE.
     4. SHORT. 30 simulated minutes — long enough for a foodless character to
        fall two or three times and for a hopeless matchup to score zero kills,
        short enough that the whole thing is ~750 ticks of arithmetic.
   ════════════════════════════════════════════════════════════════════════════ */

/** The forecast horizon. 30 simulated minutes (the ruling's number). */
export const FORECAST_MS = 1800000;
/** The forecast's seed. A CONSTANT: an unstable warning is a warning nobody reads. */
export const FORECAST_SEED = 0x4845_4152;   // "HEAR"

/* A deep clone that cannot be defeated by a save growing a new field.
   ⚠ DELIBERATELY NOT AN ALLOWLIST. The obvious implementation copies "the
     fields the simulation touches", and that list is the `snapshotG` mistake in
     miniature: the day someone adds a field to the loop, the forecast starts
     simulating a character who does not have it, silently and only in the
     warning. Structure in, structure out.
   Functions, class instances and anything else exotic are DROPPED rather than
   shared, because a shared reference is precisely the mutation this exists to
   prevent. Plain data is all the simulation reads. */
function cloneState(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = cloneState(v[i]);
    return out;
  }
  /* Object.getPrototypeOf(v) !== Object.prototype is NOT the test: a save
     restored through JSON.parse has a null-prototype object in it here and
     there, and both are plain data. Anything with a constructor that is not
     Object or that is callable is not state. */
  if (typeof v === 'function') return undefined;
  const out = {};
  for (const k of Object.keys(v)) {
    const c = cloneState(v[k]);
    if (typeof c !== 'undefined') out[k] = c;
  }
  return out;
}

/**
 * What would the next half hour of this fight look like?
 *
 * @param state  the live player state. NOT MUTATED — cloned first.
 * @param ctx    the same ctx the live tick builds (rolls, bonus, style, items,
 *               monsters, botd). Its `rng`, `fx`, `away`, `fromMs`, `toMs`,
 *               `capped` and `botdFor` are all REPLACED here, so a caller
 *               cannot accidentally hand the forecast the live effect sink.
 * @param opts   { monsterId?, autoEat?: {enabled, owned, threshold, foodId},
 *                 spanMs?, seed?, tickMs? }
 * @returns { kills, deaths, foodEaten, foodless, retreat, ticks, spanMs,
 *            survivedMs, summary }  — `foodless` is the bag at the END of the
 *            forecast, which is the question the warning asks.
 */
export function forecastFight(state, ctx, opts) {
  const o = opts || {};
  const src = ctx || {};
  const sim = cloneState(state) || {};
  if (o.monsterId) sim.activeMonster = o.monsterId;
  const monsters = src.monsters || {};
  const m0 = monsters[sim.activeMonster];
  /* NO TARGET, NO FORECAST. `null` rather than a zeroed object: "we did not
     look" and "we looked and it is hopeless" are different answers and the
     caller must not be able to render one as the other. */
  if (!m0) return null;
  /* Start the imagined fight from a FULL-HP foe and the character's REAL
     health. Anything else forecasts a fight nobody is about to have — a boss
     already on 5 HP would forecast as trivially winnable. */
  sim.monsterMaxHp = m0.hp;
  sim.monsterHp = m0.hp;
  if (!(sim.playerMaxHp > 0)) sim.playerMaxHp = 10;
  if (!(sim.playerHp > 0)) sim.playerHp = sim.playerMaxHp;
  /* THE FORECAST IS NOT KNOCKED OUT. The recovery line is a fact about NOW;
     the question here is "if you fight, what happens", and a live clock would
     make the first minutes of every forecast pay nothing and read as hopeless. */
  sim.recoveringUntilMs = 0;

  const eat = o.autoEat || {};
  const items = src.items || {};
  let foodEaten = 0;
  const spanMs = Math.max(0, Number(o.spanMs) || FORECAST_MS);

  const fctx = Object.assign({}, src, {
    /* ATTENDED SCOPE. The player is about to sit and watch this, so the
       forecast is priced the way the next half hour will actually be priced. */
    away: false,
    rng: createRng(Number.isFinite(Number(o.seed)) ? Number(o.seed) : FORECAST_SEED),
    fromMs: 0,
    toMs: spanMs,
    capped: false,
    /* PINNED to the caller's already-resolved boss, never re-resolved per
       segment: `fromMs` is 0 here, and `botdFor(0)` would ask which monster was
       featured at the epoch. */
    botdFor: null,
    botd: src.botd,
    tickMs: Number(o.tickMs) || src.tickMs || COMBAT_BALANCE.tickMs,
    /* THE EMPTY SINK. Every reward handler is absent, so `resolveKill` runs its
       arithmetic against the clone and reaches nothing outside it. The ONE
       handler present is auto-eat, because a forecast that could not eat would
       tell a fully-provisioned character they are about to die. It is the SAME
       `resolveAutoEat` the live tick and the server both ask — the forecast
       cannot be optimistic about food in a way the fight is not. */
    fx: {
      autoEat() {
        const d = resolveAutoEat({
          enabled: !!eat.enabled,
          owned: !!eat.owned,
          hp: sim.playerHp,
          maxHp: sim.playerMaxHp,
          threshold: eat.threshold,
          foodId: eat.foodId || null,
          inventory: sim.inventory,
          items,
        });
        if (!d) return false;
        sim.playerHp = d.hp;
        sim.inventory[d.foodId] -= 1;
        if (sim.inventory[d.foodId] <= 0) delete sim.inventory[d.foodId];
        foodEaten++;
        return true;
      },
    },
  });

  const summary = simulateSpan(sim, fctx);
  return {
    kills: summary.kills,
    deaths: summary.deaths,
    foodEaten,
    /* THE BAG AT THE END OF THE FORECAST, asked with the same chooser
       `resolveDeath` asks — so "you have no food" and "you fell foodless" are
       one fact and cannot contradict each other on screen. */
    foodless: !chooseFood(eat.foodId || null, sim.inventory, items, Infinity),
    retreat: summary.stoppedBy === STOP_REASON.RETREAT,
    ticks: summary.ticks,
    survivedMs: summary.survivedMs,
    /* HOW LONG UNTIL THE FIRST FALL — the number the warning quotes ("will put
       you down in about 40 seconds"). Taken from the simulation's own deathLog
       rather than from a time-to-die formula, for the reason this whole
       function exists: a warning derived from a second model is a warning about
       a fight that does not happen. `null` when the forecast never fell, so the
       copy omits the clause rather than inventing a number. */
    firstDeathMs: (summary.deathLog && summary.deathLog.length)
      ? Math.max(0, summary.deathLog[0].atMs) : null,
    spanMs,
    summary,
  };
}

/* ── THE WARNING RULE (ruling item 7), AS A FUNCTION AND NOT AS FOUR ifs ────
   Two conditions, exactly as ruled, and NOTHING else:
     · the forecast contains deaths AND the bag is foodless  → "no food"
     · the forecast lands zero kills                          → "out of league"
   A fed character who dies twice and still kills things is NOT warned: they are
   playing the game. Returns null when there is nothing to say, so the caller is
   one truthy check and can never invent a third case. */
export const FORECAST_WARNING = Object.freeze({
  NO_FOOD: 'no-food',
  UNWINNABLE: 'unwinnable',
});

export function forecastWarning(f) {
  if (!f) return null;
  const deaths = Math.max(0, Math.floor(Number(f.deaths) || 0));
  const kills = Math.max(0, Math.floor(Number(f.kills) || 0));
  /* ORDER IS THE RULING'S. A foodless character who also kills nothing is told
     about the food first, because that is the fix they own. */
  if (deaths > 0 && f.foodless) return FORECAST_WARNING.NO_FOOD;
  if (kills === 0) return FORECAST_WARNING.UNWINNABLE;
  return null;
}
