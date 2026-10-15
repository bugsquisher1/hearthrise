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
// Everything impure is INJECTED, which is what keeps this file runnable in
// Deno with no browser:
//   • `ctx.rng` / `ctx.swingSeed(i)` — src/core/rng.js contract; a session's
//                               swing seed is the edge's keyed HMAC
//   • `ctx.bonus(key)`        — the perk stack
//   • `ctx.playerRolls(m)` / `ctx.monsterRolls(m)` / `ctx.weakness(m)`
//   • `ctx.fx`                — the effect sink. Missing handlers are no-ops,
//                               so a bare `simulateTick(state,{...})` in a test
//                               simulates without side effects.
//
// `state` is the player-state object. It is MUTATED in place — the same
// convention src/core/progression.js `grantXp` established, because the
// alternative is copying a 40-field save 18,000 times per replay.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { COMBAT_BALANCE, rollAttack, rollCrit, applyCrit } from './combat.js?v=586';
import { rollDropTable } from './drops.js?v=586';
import { resolveHearthfind } from './hearthfind.js?v=586';
import { hitXpRoute, killXpRoute } from './styles.js?v=586';
import { applyGoldFind } from './pacing.js?v=586';
import { resumeHpFor } from './recovery.js?v=586';
/* HUNT SESSIONS (ruling HR-2026-10-14): the action bar replaces Auto-Eat when
   `state.huntSession` is present, and `simulateSpan` then walks the session's
   absolute swing clock (`simulateHuntSpan` below). */
import { runActionBar, spendFromBag, endReasonAt, deathXpLoss, staminaStep, shopShotFor, buyFromShop,
  floorOf, coverValue } from './action-rules.js?v=586';
import { KNOCKOUT_MS } from '../data/hunt-sessions.js?v=586';
import { BASIC_EFFECT_SHARE } from '../data/supply-basics.js?v=586';
import { createRng } from './rng.js?v=586';
import { pickSpawn } from './hunt-spawn.js?v=586';
import { tickBuffs, pruneBuffs, hasActiveBuff } from './buffs.js?v=586';
/* THE CONSUMPTION SEAM (design item E1). The arithmetic lives in ./ammo.js and
   is imported rather than restated — one field, one carry, one guard. Nothing
   below branches on `ctx.away`, which is what keeps the AWAY-1 parity property
   true of the quiver as well as of the XP. */
import { spendForSwings, applyAmmoMult, readAmmo } from './ammo.js?v=586';


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
export const STOP_REASON = Object.freeze({});

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


  const dropMult = (typeof ctx.weakness === 'function' ? ctx.weakness(m, id) : { dropMult: 1 }).dropMult;
  /* THE BALANCE ASSERTION the designer asked for (ruling, "Balance risk"):
     rollDropTable applies `min(0.95, ch x dropMult x (1+dropBuff))` — the cap
     is AFTER every multiplier, and a guaranteed drop (ch >= 1) is returned
     untouched. Enforced in src/core/drops.js and asserted in the suite. */
  const rolled = rollDropTable(m.drops, {
    dropMult,
    dropBuff: bonus('dropRate'),
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
  for (const g of killXpRoute(ctx.style, m.xp, 1)) call(fx, 'addXp', g.skill, g.amount);
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

  const info = { gp, monster: m, monsterId: id, drops: rolled.dropped, events: rolled.events };
  if (found) info.hearthfind = found;
  call(fx, 'onKill', info, ctx);

  /* RESPAWN. A training fight respawns the same foe (the behaviour both loops
     had). A HUNT (lane C1, src/data/hunts.js) rolls the next foe from its
     weighted spawns on THIS engine's seeded rng, after every other draw this
     kill made — one function, not branched on `ctx.away`, so the attended tick
     and the away span roll the same sequence (AWAY-1). A one-spawn hunt draws
     nothing. An id the roster does not know keeps the current foe. */
  const nextId = (ctx.hunt && ctx.hunt.spawns) ? pickSpawn(ctx.hunt.spawns, rng) : id;
  const next = (nextId !== id && ctx.monsters && ctx.monsters[nextId]) || null;
  if (next) {
    state.activeMonster = nextId;
    state.combatKillsThisFoe = 0;
  }
  state.monsterHp = (next || m).hp;
  state.monsterMaxHp = (next || m).hp;
  return info;
}

/**
 * Resolve a DEATH. One rule (master plan row 16; ruling S/U): a fall is a flat
 * KNOCKOUT_MS knockout and the character gets up at `resumeHpFor(maxHp)` — 40%,
 * never a free heal. The Recovery ladder, the Retreat and the bounty streak
 * left with the away model (closed rebuild, lane C2). `stats.deaths` counts the
 * fall; the two durable death counters ride the info for the death rows.
 *
 * This function only REPORTS the knockout; the caller that owns a timeline
 * (`simulateHuntSpan`) turns it into an absolute recovery line.
 */
export function resolveDeath(state, ctx) {
  const fx = fxOf(ctx);
  state.stats = state.stats || {};
  const soFar = Math.floor(Number(state.stats.deaths) || 0);
  const base = (v) => { const n = Math.floor(Number(v)); return isFinite(n) && n >= 0 ? n : 0; };
  const todayBefore = base(state.deathsTodayBefore) + soFar;
  const lifeBefore  = base(state.deathsLifetimeBefore) + soFar;
  state.stats.deaths = soFar + 1;
  state.playerHp = resumeHpFor(state.playerMaxHp);
  state.monsterHp = 0;
  const info = {
    died: true,
    recoverMs: KNOCKOUT_MS,
    deathsToday: todayBefore + 1,
    deathsLifetime: lifeBefore + 1,
    nextRecoverMs: KNOCKOUT_MS,
    resumeHp: state.playerHp,
  };
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
/* A HUNT'S QUIVER IS ITS BAG. `spendForSwings` runs unchanged over a view
   whose inventory is the bag line of the equipped ammo, and its one
   `removeItem` lands in the bag (spendFromBag) instead of the inventory. The
   carry object is the state's own, so the fractional carry survives swings. */
/* THE SHOP SHOT (Tyler 2026-10-14; supply-basics.js): when the equipped arrow
   or rune has a shop shot behind it (same partner), the quiver is the bag line
   FIRST and then whatever the purse can buy, shot by shot — only on the
   player's own "Switch to Store" choice (shopShotFor reads the set's onDry) —
   and a shop shot fires at BASIC_EFFECT_SHARE of its crafted partner's ammo
   bonus (`shop` on the answer; action-rules.js buyFromShop). A style that
   needs its ammo and can neither draw nor buy a shot marks the session goldOut
   — the hunt ends `gold_out` at the next boundary. */
function spendFromQuiver(state, hunt, ctx) {
  const ammoId = (state.equipment && state.equipment.ammo) || null;
  const line = ammoId && hunt.bag ? hunt.bag[ammoId] : null;
  if (!state.ammoCarry || typeof state.ammoCarry !== 'object') state.ammoCarry = {};
  const bagLeft = line ? Math.max(0, Math.floor(Number(line.left) || 0)) : 0;
  const shot = ammoId ? shopShotFor(hunt, ammoId) : null;
  const price = shot ? shot.price : 0;
  /* What the purse can buy with the floor kept, counting the loot it could sell. */
  const buyable = price > 0
    ? Math.floor(Math.max(0, Math.floor(Number(hunt.purse) || 0) + coverValue(hunt) - floorOf(hunt)) / price) : 0;
  const view = { equipment: state.equipment, ammoCarry: state.ammoCarry,
    inventory: ammoId ? { [ammoId]: bagLeft + buyable } : {} };
  const atMs = Number(ctx.atMs) || 0;
  const opts = { items: ctx.items, weaponType: ctx.weaponType, fx: { removeItem: (id, n) => {
    const fromBag = spendFromBag(hunt, id, Math.min(n, bagLeft), atMs);
    if (n - fromBag > 0 && shot) buyFromShop(hunt, shot.id, n - fromBag);
  } } };
  if (price > 0 && bagLeft + buyable <= 0) {
    const info = readAmmo(view, opts);
    if (info.needed && info.spends && info.perShot > 0) hunt.goldOut = true;
  }
  const out = spendForSwings(view, 1, opts);
  /* A swing loosed with the carried line empty and the store behind it is a
     SHOP SHOT (decided before the draw, so every cut of the window agrees). */
  out.shop = !!shot && bagLeft <= 0 && buyable > 0;
  return out;
}

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
  const hunt = state.huntSession || null;
  const supply = hunt ? spendFromQuiver(state, hunt, ctx) : spendForSwings(state, 1, ctx);

  const roll = ctx.playerRolls(m, supply && supply.shop ? { ammoShare: BASIC_EFFECT_SHARE } : undefined);
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
  /* XP IS EARNED ON DAMAGE DEALT (design ruling). The swing may roll
     past the foe's remaining HP — overkill, crits included — but only the
     HP it actually removed pays hit XP, styled and hitpoints alike. Without
     the clamp a maxed hitter earned ~4 XP per wasted point on a slime. */
  const hpBefore = Math.max(0, state.monsterHp);
  const xpDmg = Math.min(pDmg, hpBefore);
  state.monsterHp = Math.max(0, state.monsterHp - pDmg);
  call(fx, 'onSwing', m, pDmg, didCrit, ctx);

  if (xpDmg > 0) {
    for (const g of hitXpRoute(ctx.style, xpDmg)) call(fx, 'addXp', g.skill, g.amount);
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

  /* THE ACTION BAR is the only eater (Auto-Eat left with the away model): a
     fight outside a hunt session eats nothing. */
  const ate = hunt ? runActionBar(state, ctx) : false;

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
    return { outcome: OUTCOME.DEATH, crit: didCrit, pDmg, mDmg, ate, supply, recoverMs: d.recoverMs };
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
      if (ev && ev.rare) events.push({ type: 'rare_drop', atMs: clock.atMs, item: ev.id });
      return call(fx, 'onDrop', ev, ...rest);
    },
  });
}

/**
 * A HUNT SESSION'S SPAN (ruling HR-2026-10-14 §2/§4). The same simulateTick,
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

  while (!hs.endedReason && state.activeMonster && hs.nextSwingAtMs < toMs) {
    const atMs = hs.nextSwingAtMs;
    clock.atMs = atMs;
    const why = endReasonAt(hs, atMs);
    if (why) {
      hs.endedReason = why;
      hs.endedAtMs = atMs;
      events.push({ type: 'ended', atMs, reason: why });
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
        continue;
      }
      pl.left = pl.size;
      pl.respawnAtMs = atMs + pl.respawnMs;
      pl.pulls++;
    }
    if (typeof fx.mark === 'function') fx.mark(atMs);
    const facing = state.activeMonster;
    const swingCtx = Object.assign({}, ctx, { atMs, fx,
      rng: createRng(swingSeedOf(ctx, swing)) });
    const buffLive = hasActiveBuff(state.buffs);
    const r = (typeof fx.segment === 'function')
      ? (() => { let out; fx.segment(atMs, () => { out = simulateTick(state, swingCtx); }); return out; })()
      : simulateTick(state, swingCtx);
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
      events.push({ type: 'fall', atMs: fellAtMs, monster: facing, xpLost });
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
    events.push({ type: 'ended', atMs: hs.nextSwingAtMs, reason: why });
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
    consumed: {}, huntEnded: null, huntEvents: [], xpLost: {},
  };
}
