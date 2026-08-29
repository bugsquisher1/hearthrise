// ============================================================
// src/core/companion-perk.js — THE EQUIPPED COMPANION'S PASSIVE BONUS,
// as one pure rule, for both sides.
//
// ── WHY THIS FILE EXISTS, AND WHY IT IS NOT src/core/perks.js ────────────
// src/core/perks.js is LAYER 0 — the permanent perk stack (rooms, plots,
// property, renown), and its `makeBonus` applies the PERMANENT_CAP fuse at
// the end because on the server that file IS the whole layer-0 chain. The
// client's getBonus mirrors it: base getBonus (fused) is layer 0.
//
// A companion is LAYER 1 — a WRAPPER the client adds ON TOP of the fused
// layer-0 number (src/features/companions.js `setupCompanions` wraps
// window.getBonus and does `v += cb[key]` AFTER the base returned). It is
// therefore NOT inside the fuse. Folding it into `makeBonus` would clamp
// (rooms + companion) together into 0.20, while the client clamps rooms to
// 0.20 and THEN adds companion on top — the two would disagree exactly when
// a player is near the permanent cap. So the companion is a SEPARATE
// additive layer here too, applied after `bonus(key)`, precisely as the
// client applies it after the fuse. perks.js §5 named this: "it is a wrapper
// layer (layer 1), not part of layer 0, and adding it there would mean that
// file owned a source the client adds elsewhere."
//
// ── WHAT IS SERVER-OWNED, AND WHAT IS NOT (this slice) ───────────────────
// hr_perks_of returns `companion: { id, xp }` — the EQUIPPED id (server
// column player_state.companion_equipped, written only by hr_companion_equip
// after an ownership check) and the companion's XP (a server progress row).
// This module turns that bookkeeping into magnitudes from the COMPANIONS
// catalogue — the same split perks.js uses for rooms: the DATABASE returns
// which companion at what xp; the RULES that price it are JavaScript here.
//
// ⚠ ONLY THE GOVERNED PERCENTAGE KEYS + farmYield ARE PROJECTED. A
//   companion's combat stat points (strB/atkB/defB/crit/hpRegen) reach the
//   client through getEquipmentStats -> `eq`, NOT through getBonus, and the
//   sim reads them from `equipmentStats(equipment,...)`. Projecting those
//   would mean feeding `eq`, a change to the combat damage path — deferred,
//   and every SHOP companion (the b410 un-gate target) has zero combat
//   stats, so the un-gate is complete without them. `rareDrop` is a ghost
//   with no reader (companions.js §1.7). All are OMITTED, not zeroed wrong.
//
// PURE ESM. No DOM, no window, no timers, NO Math.random, NO RNG AT ALL — a
// passive bonus draws nothing, so inserting it into a seeded fight moves no
// later roll. That is the byte-parity guarantee: away and live share every
// draw because this layer adds none. (docs/design/away-time-ruling.md — the
// companion passive bonus is on the `permanent` channel: AWAY_SCOPE.permanent
// is true, so it pays live and away identically.)
// ============================================================

import { COMPANIONS } from '../data/companions.js?v=491';

/* The keys this layer projects: the src/core/perks.js GOVERNED percentage
   keys that a companion can pay, plus farmYield (a flat crop COUNT, governed
   by its own capacity rule, not the percentage fuse). combatXP/raidPower are
   not companion keys; combat stat points and rareDrop are deliberately NOT
   here (see the header). Frozen so a stray write cannot widen the surface. */
export const COMPANION_KEYS = Object.freeze([
  'allXP', 'goldFind', 'gatherSpeed', 'cookSpeed',
  'smithSpeed', 'craftSpeed', 'prayerSpeed', 'farmYield',
]);
const KEY_SET = new Set(COMPANION_KEYS);

export const COMPANION_MAX_LEVEL = 30;

/* The XP curve, PURE, mirroring src/features/companions.js `companionXpToReach`
   / `companionLevelFromXp` (the b228 rebase). That file is a classic-ish
   feature module (it imports the event bus and reaches for window), so it
   cannot be imported in Deno; the math is restated here and pinned equal to
   it by a drift assertion in tests/perk-channel.mjs (the same remedy that
   keeps the power-budget literals honest). Level 1 needs 0 xp, so a database
   with no companion-xp writer yet reads xp 0 -> level 1 -> scale 1 -> the
   base magnitude, which is byte-for-byte what an un-levelled pet pays. */
export function companionXpToReach(L) {
  if (L <= 1) return 0;
  let total = 0;
  for (let i = 1; i < L; i++) total += Math.floor(50 * Math.pow(1.18, i - 1) * i);
  return total;
}

export function companionLevelFromXp(xp) {
  const x = Number(xp);
  if (!Number.isFinite(x) || x <= 0) return 1;
  for (let L = COMPANION_MAX_LEVEL; L >= 1; L--) {
    if (x >= companionXpToReach(L)) return L;
  }
  return 1;
}

/* hasOwnProperty via a detached call — the same NaN-injection guard perks.js
   uses. `COMPANIONS['constructor']` is a function, and reading `.bonus` off it
   then `+= scale*undefined` would be NaN; Set membership + own-key checks shut
   that door. */
function own(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * The equipped companion's passive contribution to one key, or 0.
 *
 * @param key       a getBonus key
 * @param companion the perk state's `companion` sub-object: { id, xp } | null
 */
export function companionKeyBonus(key, companion) {
  if (!key || !KEY_SET.has(key)) return 0;
  if (!companion || typeof companion !== 'object') return 0;
  const id = companion.id;
  if (typeof id !== 'string' || !own(COMPANIONS, id)) return 0;
  const def = COMPANIONS[id];
  const bonus = def && def.bonus;
  if (!bonus || !own(bonus, key)) return 0;
  const base = Number(bonus[key]);
  if (!Number.isFinite(base) || base === 0) return 0;
  const lv = companionLevelFromXp(companion.xp);
  /* +5% per level above 1, over thirty levels (x2.45 at L30) — the exact
     scale src/features/companions.js getCompanionBonus applies. farmYield is
     a flat count and scales the SAME way the client scales it (it multiplies
     the whole bonus map), so parity is preserved rather than special-cased. */
  const scale = 1 + (lv - 1) * 0.05;
  return base * scale;
}

/**
 * The layer-1 companion bonus function for a whole perk state, memoised per
 * call site exactly like makeBonus — the sim asks for the same handful of
 * keys on every one of ~18,000 ticks a night.
 *
 * Returns a function `bonus(key) -> magnitude`. An absent/null companion
 * yields 0 for every key, which is byte-for-byte the pre-companion behaviour.
 *
 * ⚠ NOT CLAMPED. The client adds companion raw, after the fuse; clamping here
 *   would make the server under-pay by whatever the fuse would have bound and
 *   break client/server parity. The permanent fuse governs layer 0 only.
 */
export function companionBonus(perkState) {
  const companion = (perkState && typeof perkState === 'object') ? perkState.companion : null;
  const memo = new Map();
  return function bonus(key) {
    if (memo.has(key)) return memo.get(key);
    const v = companionKeyBonus(key, companion);
    memo.set(key, v);
    return v;
  };
}
