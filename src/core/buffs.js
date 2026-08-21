// ============================================================
// src/core/buffs.js — the timed-consumable registry, and the buff clock
// as a FUNCTION OF ELAPSED TIME rather than a setInterval.
//
// WHY THIS MOVED (and it is not tidiness)
//
// The buff clock was `setInterval(… 1000)` inside legacy.js's buff-queue
// block. An interval only runs in a live tab. But buffs reached the AWAY
// replay through the getBonus chain, which is not gated on presence. So:
//
//     eat a 10-minute drop-rate buff -> close the tab -> come back 12 hours
//     later -> collect twelve hours of BUFFED gathering -> the buff still
//     reads 10:00, because nothing ticked it.
//
// A live exploit, and not a subtle one. It is not fixable inside an
// interval: "does this buff pay for the hour you were away, and does that
// hour drain it?" is a question about ELAPSED TIME, which an interval
// cannot answer. Hence `tickBuffs(buffs, elapsedMs, ctx)`.
//
// THE ANSWER CHANGED, AND THE QUESTION IS WHY IT WAS EVER "FROZEN"
//
// The first answer (b326) was: a timed buff is FROZEN while away — it neither
// pays nor ticks down. That closed the exploit, but it closed it by removing
// the buff from the away model entirely, and it was justified by a
// timed-vs-permanent split that was never the real line.
//
// The real line is SERVER-WIDE vs PERSONAL (Tyler, 2026-08-14 — see the header
// of src/core/away.js). A blessing is something the world does for people who
// are in it. A Feast is something the player did to their own character, and
// it is still true while they sleep. So the buff channel PAYS away.
//
// Which means it must also DRAIN away, and the two halves are the same rule
// stated once: `AWAY_SCOPE.buff` opens the payout, `tickBuffs` no longer
// refuses to spend the clock, and src/core/combat-sim.js `simulateSpan` hands
// it real elapsed time tick by tick. A ten-minute Feast eaten on the way out
// pays the first ten minutes of the night and expires; the other seven hours
// fifty minutes run unbuffed — which is exactly what would have happened had
// the player sat and watched. The freeze that survives is `active === false`:
// a buff is spent on WORK, and idling is not work. Away combat is work.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { CHANNEL, channelApplies } from './away.js?v=426';

/* Maps buff.type -> {label, bonusKey, isPercent|isFlat, icon}.
   `bonusKey` is the getBonus key the effect pays into; a type with no row
   here is REJECTED by applyBuff, which is how a tooltip promising an
   effect the engine throws away gets caught at authoring time. */
export const BUFFS_DEF = {
  /* Icons chosen to render unambiguously on Segoe UI Emoji and Apple Color
     Emoji — the abstract chart/graph glyphs look like the same coloured
     block on both. */
  gather_speed: { label: 'Gather Speed', bonusKey: 'gatherSpeed', isPercent: true, icon: '🌿' },
  all_xp: { label: 'All XP', bonusKey: 'allXP', isPercent: true, icon: '⭐' },
  drop_rate: { label: 'Drop Rate', bonusKey: 'dropRate', isPercent: true, icon: '🍀' },
  /* b228: `farmYield` is a COUNT of extra crops, never a percentage. This
     entry once claimed isPercent, so Carrot Stew's "15" reached the engine
     as 0.15 of a crop and harvestPlot floored it to nothing. */
  farm_yield: { label: 'Farm Yield', bonusKey: 'farmYield', isPercent: false, isFlat: true, icon: '🌾' },
  damage: { label: 'Damage', bonusKey: 'damage', isPercent: true, icon: '⚔️' },
  /* b238: a FLAT bump to defence (a +4 food buff reads "+4", not "+4%"),
     consumed by monsterCombatRolls. */
  defense: { label: 'Defense', bonusKey: 'defense', isPercent: false, isFlat: true, icon: '🛡️' },
  combat_xp: { label: 'Combat XP', bonusKey: 'combatXP', isPercent: true, icon: '🗡️' },
  gold_find: { label: 'Gold Find', bonusKey: 'goldFind', isPercent: true, icon: '💰' },
  /* Pays into the `crit` bonus key, which is ALSO fed by gear (`critB` + the
     armour-set bonus). Under b326 this buff was the ruling's worked example of
     an exclusion — crit applied away, this did not, and it fell out for free
     because it is a BUFF. That is no longer true in either direction: the buff
     channel pays away now, so a Void Banquet's +5% crit reaches an away swing
     and then runs out mid-night like any other Feast. Still no special case —
     which is the property that survived the rule changing under it. */
  damage_crit: { label: 'Critical Chance', bonusKey: 'crit', isPercent: true, icon: '💥' },
};

/** Is this a buff type the engine can actually pay? */
export function isKnownBuff(type) {
  return !!(type && Object.prototype.hasOwnProperty.call(BUFFS_DEF, type));
}

/** The still-running buffs in a queue. */
export function activeBuffs(buffs) {
  if (!Array.isArray(buffs)) return [];
  return buffs.filter((b) => b && b.remainingMs > 0 && isKnownBuff(b.type));
}

/**
 * Is ANY buff still running? The same predicate as `activeBuffs().length > 0`,
 * without the array — `simulateSpan` asks it once per tick, and an 8-hour
 * absence is ~12,000 ticks. Same answer or this is a bug: the two are asserted
 * equivalent in the suite rather than left to look alike.
 */
export function hasActiveBuff(buffs) {
  if (!Array.isArray(buffs)) return false;
  for (const b of buffs) {
    if (b && b.remainingMs > 0 && isKnownBuff(b.type)) return true;
  }
  return false;
}

/**
 * How much longer until the SOONEST live buff runs out — the next instant at
 * which the away payout changes. `Infinity` when nothing is running, which is
 * the honest answer and also the one a caller can pass straight to
 * `Math.min(remaining, boundary)` without a special case.
 *
 * WHY THIS EXISTS AND WHY IT IS HERE. `simulateSpan` can afford to ask "is a
 * buff alive?" once per swing because it already walks a tick timeline. The
 * gather/artisan away replay does not walk one: it computes `ticks = floor(
 * spanMs / interval)` once and runs that many identical actions, and it CANNOT
 * become a per-tick loop cheaply, because a `gather_speed` buff expiring
 * changes the interval itself — the very number the tick count was derived
 * from. So that caller needs the other shape: split the span at the boundaries
 * and run each slice at its own rate, exactly as `utcDaySegments` splits an
 * absence at the boundaries where the Boss of the Day changes.
 *
 * This is the boundary query for that split, and it lives beside `activeBuffs`
 * so it applies the SAME liveness rule (`remainingMs > 0` and a type the
 * registry knows). A caller re-deriving it would eventually disagree with the
 * function that decides what pays — an unknown buff type would create a
 * boundary that changes nothing, which is a segment that pays twice.
 */
export function nextBuffExpiryMs(buffs) {
  let soonest = Infinity;
  if (!Array.isArray(buffs)) return soonest;
  for (const b of buffs) {
    if (!b || !isKnownBuff(b.type)) continue;
    const r = Number(b.remainingMs);
    if (isFinite(r) && r > 0 && r < soonest) soonest = r;
  }
  return soonest;
}

/**
 * Aggregate a buff queue into { bonusKey: total }.
 *
 * @param buffs the queue (G.buffs)
 * @param ctx   { away } — the buff channel is PERSONAL and pays away; what
 *              stops an away payout is the buff running out, which is a
 *              property of `remainingMs` and therefore of whoever advanced
 *              the clock. See `tickBuffs`.
 */
export function buffBonuses(buffs, ctx) {
  const out = {};
  if (!channelApplies(CHANNEL.BUFF, ctx)) return out;
  for (const b of activeBuffs(buffs)) {
    const def = BUFFS_DEF[b.type];
    /* A FLAT key's magnitude is already in its own units (crops, defence
       points); every other key is a percentage stored as an integer. */
    out[def.bonusKey] = (out[def.bonusKey] || 0) + (def.isFlat ? b.magnitude : b.magnitude / 100);
  }
  return out;
}

/** One key's contribution. The shape getBonus's wrapper wants. */
export function buffBonusFor(buffs, key, ctx) {
  const all = buffBonuses(buffs, ctx);
  return typeof all[key] === 'number' ? all[key] : 0;
}

/**
 * Advance the buff clock by `elapsedMs`. THE clock — there is no other.
 *
 * Mutates `buffs` in place (the queue is player state) and reports what
 * happened so the caller can prune and repaint.
 *
 * @param ctx { away, active }
 *   away:   NOT a freeze any more. An away buff pays (src/core/away.js
 *           `AWAY_SCOPE.buff`), so an away buff must be spent, or "it pays
 *           away" is a mint: ten minutes of Feast would cover eight hours.
 *           The caller supplies the elapsed time; `simulateSpan` supplies one
 *           swing interval per tick, which is what makes a buff expire at the
 *           right INSTANT of the absence rather than at one of its ends.
 *   active: idle play has never drained buffs (you are not spending the
 *           effect if nothing is running). UNCHANGED: `active === false`
 *           still freezes, away or not.
 *
 * @returns { changed, frozen, expired: [type], elapsedMs }
 */
export function tickBuffs(buffs, elapsedMs, ctx) {
  const dt = Number(elapsedMs) || 0;
  const res = { changed: false, frozen: false, expired: [], elapsedMs: dt };
  if (!Array.isArray(buffs) || buffs.length === 0) return res;
  if (ctx && ctx.active === false) { res.frozen = true; return res; }
  if (dt <= 0) return res;
  for (const b of buffs) {
    if (!b || b.remainingMs <= 0) continue;
    b.remainingMs -= dt;
    if (b.remainingMs <= 0) { res.changed = true; res.expired.push(b.type); }
  }
  return res;
}

/** Drop expired entries. Returns the surviving array (a new array). */
export function pruneBuffs(buffs) {
  if (!Array.isArray(buffs)) return [];
  return buffs.filter((b) => b && b.remainingMs > 0);
}
