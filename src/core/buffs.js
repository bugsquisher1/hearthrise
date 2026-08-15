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
// The ruling's answer (docs/design/away-time-ruling.md): a timed buff is
// FROZEN while away. It neither pays nor ticks down, and no food is
// consumed. Both halves are expressed here — `buffBonuses` drops to {}
// away via src/core/away.js's channel table, and `tickBuffs` refuses to
// drain away — so the client and the accrual Edge Function cannot disagree.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { CHANNEL, channelApplies } from './away.js?v=342';

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
  /* THE ONE THE RULING NAMES. Crit applies away — it is gear — but this
     food buff does not, and it is excluded for free: it is a BUFF, and the
     buff channel is out of scope away. There is no special case anywhere. */
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
 * Aggregate a buff queue into { bonusKey: total }.
 *
 * @param buffs the queue (G.buffs)
 * @param ctx   { away } — away returns {} (the FROZEN rule: no pay)
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
 *   away:   FROZEN. Returns immediately, draining nothing. This is the
 *           other half of the exploit fix — a buff that does not pay must
 *           not be spent either, or "frozen" is just a nerf.
 *   active: idle play has never drained buffs (you are not spending the
 *           effect if nothing is running). Preserved: `active === false`
 *           freezes too.
 *
 * @returns { changed, frozen, expired: [type], elapsedMs }
 */
export function tickBuffs(buffs, elapsedMs, ctx) {
  const dt = Number(elapsedMs) || 0;
  const res = { changed: false, frozen: false, expired: [], elapsedMs: dt };
  if (!Array.isArray(buffs) || buffs.length === 0) return res;
  if (ctx && ctx.away) { res.frozen = true; return res; }
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
