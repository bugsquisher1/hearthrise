// ============================================================
// src/core/auto-eat.js — AUTO-EAT, as one rule, for both sides.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────
// `fx.autoEat` is the one effect handler `src/core/combat-sim.js` calls
// that the SERVER accrual engine did not implement. A missing fx handler
// is a no-op by construction (combat-sim.js `call()` returns undefined for
// an absent name), so the omission was silent: the server simply never
// healed, the character died early, and the night stopped paying. The
// accrual engine's own header called that "an under-pay, not a mint" —
// correct as a security posture, and the wrong player outcome.
//
// MEASURED, 2026-08-14, same seed (0x5eed1234), same 12h window, same
// state, varying only whether auto-eat runs (tests/accrual-engine.mjs
// `autoEatParityGuard` runs this fixture set):
//
//   fixture                     server (no eat)      client (eat)      server pays
//   early-game goblin           1,218 kills / 1.17h  12,790 / 12.00h   -90.5%
//   maxed vs slime              6,007 kills / 4.44h  16,211 / 12.00h   -62.9%
//   maxed vs the day-1 boss        48 kills / 0.13h   4,721 / 12.00h   -99.0%
//
// A player with Auto-Eat bought and switched on would have lost between
// two thirds and ninety-nine per cent of every unattended night on the day
// the kill switch flipped. Auto-Eat is also the shop's stated reason to
// exist — "your fights stop being ninety seconds long", 100 Bounty Marks —
// so the loss lands hardest on the players who paid to avoid it.
//
// ── THE RULE IS HERE, NOT IN TWO PLACES ──────────────────────────────
// The rule used to live only in `src/features/auto-actions.js`
// `maybeAutoEat()`, which is a CLASSIC script: it reads `window.G`, calls
// `window.removeItem`, and Deno cannot import it. So the server could not
// have shared it even if someone had remembered to. That is the same shape
// as the burn maths before b-artisan (`src/features/cooking-fire.js` is now
// a delegating shim over `src/core/artisan.js`) and it gets the same
// treatment: the DECISION moves here as a pure function; the two callers
// keep their own APPLY step, because one mutates `G` and the other
// accumulates a delta for `hr_apply`.
//
// PURE ESM. No DOM, no window, no timers, no Math.random. No RNG at all —
// auto-eat draws nothing, which is what lets it be inserted into a seeded
// fight without moving a single later roll.
// ============================================================

import { isAutoEatable } from '../data/items.js?v=369';

export { isAutoEatable };

/* The shipped default (src/features/auto-actions.js DEFAULTS.eat.threshold).
   Named once so the client, the server and the migration's column default
   cannot each pick their own 0.5. */
export const DEFAULT_THRESHOLD = 0.5;

/* THE STORED FORM IS AN INTEGER PERCENT, 0..100 — see the `auto_eat_pct`
   column in supabase/migrations/2026-08-14-auto-eat.sql.
   Why not a float fraction: the settings slider steps by 0.05, so every
   settable value is an exact multiple of 1%, and an integer column cannot
   arrive as 0.15000000000000002 from a jsonb round trip. `k/100` and the
   literal `0.k` round to the same double for every step the UI offers, which
   `autoEatParityGuard` asserts rather than assumes. */
export function thresholdFromPct(pct) {
  /* `typeof pct !== 'number'` FIRST, and it is not defensive padding.
     `Number(null)` is 0 — finite, in range, and therefore silently accepted as
     "never auto-eat", which is the most damaging value in the range. The client
     (`HearthriseAuto.eatThreshold()`) rejects any non-number and falls back to
     the default, so accepting one here would put the two sides on different
     thresholds for a character whose column had not been read properly. Caught
     by the round-trip assertion in tests/accrual-engine.mjs, not by review. */
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return DEFAULT_THRESHOLD;
  /* `/100`, never `k * 0.05`. A 5%-step slider evaluated by repeated
     multiplication produces 0.15000000000000002 and 0.30000000000000004;
     dividing an integer percent by 100 is exact for every step the UI offers.
     That is the whole reason the stored form is an integer. */
  return Math.max(0, Math.min(100, Math.round(pct))) / 100;
}

/** The inverse, for a caller storing a client-held fraction. */
export function pctFromThreshold(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return Math.round(DEFAULT_THRESHOLD * 100);
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

/* A fraction in [0,1]; anything non-finite falls back to the default. This is
   `HearthriseAuto.eatThreshold()`'s rule: a FALSY-COALESCE would turn a
   deliberate 0% ("never auto-eat") into 50%, which is the b326 bug. */
export function clampThreshold(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return DEFAULT_THRESHOLD;
  return Math.max(0, Math.min(1, n));
}

/**
 * The biggest-healing Provision in the bag.
 *
 * ⚠ TIES ARE BROKEN BY ITEM ID, and that is load-bearing rather than tidy.
 *   `maybeAutoEat` used `it.heals > bestHeals` over `for (var id in inv)`, so
 *   a tie was decided by OBJECT KEY ORDER. On the client that is the player's
 *   insertion history; on the server the inventory arrives from
 *   `jsonb_object_agg`, whose key order is (length, bytewise). Those two orders
 *   do not agree, and the authored catalogue has NINE tied heal values today —
 *   shrimp/carrot at 3, tomato/herring at 4, potato/turnip_mash at 5,
 *   cooked_herring/cooked_wolf_meat at 6, pumpkin/cooked_shrimp at 8,
 *   lobster/goldenroot at 12, cooked_trout/swordfish at 14,
 *   frostfin/wheat_bread at 18, and shark/moonbloom/baked_potato at 20.
 *   So the two sides really would have drained different stacks. The HP paid
 *   is identical either way (that is what a tie means), so this is not a
 *   balance change; it is the difference between a reproducible night and one
 *   that depends on which machine replayed it.
 */
export function bestHealingFood(inventory, items) {
  const inv = inventory || {};
  const cat = items || {};
  let bestId = null;
  let bestHeals = 0;
  for (const id of Object.keys(inv)) {
    if (!((Number(inv[id]) || 0) > 0)) continue;
    const it = cat[id];
    if (!isAutoEatable(it)) continue;
    const heals = Number(it.heals) || 0;
    if (heals > bestHeals || (heals === bestHeals && bestId !== null && id < bestId)) {
      bestId = id;
      bestHeals = heals;
    }
  }
  return bestHeals > 0 ? bestId : null;
}

/**
 * Which food this eat will consume.
 * The nominated food wins if it is a Provision AND the player owns one;
 * otherwise the biggest-healing Provision in the bag. (b220: a Feast or a
 * Draught — `foodClass: 'buff'` — is never eligible, even as the only food
 * owned. Auto-eat burning a Void Banquet to soak one wolf hit is the failure
 * that rule exists to prevent.)
 */
export function chooseFood(nominated, inventory, items) {
  const cat = items || {};
  const inv = inventory || {};
  const nom = nominated ? cat[nominated] : null;
  if (isAutoEatable(nom) && (Number(inv[nominated]) || 0) > 0) return nominated;
  return bestHealingFood(inv, cat);
}

/**
 * THE DECISION. Pure: it reads, it does not consume.
 *
 * Every gate `src/features/auto-actions.js maybeAutoEat()` applies is here,
 * in the same order, so the two sides cannot answer differently:
 *   enabled → trait owned → sane vitals → alive → at or below the threshold
 *   → a legal food is owned.
 *
 * `owned` is the purchased-trait gate (`G.traits.auto_eat` on the client,
 * `player_state.auto_eat_enabled`'s write-time gate on the server). It is a
 * PARAMETER rather than an assumption because the two sides hold the fact in
 * different places, and because defaulting it to true would hand every
 * character a 100-Bounty-Mark trait for free the moment the server started
 * eating.
 *
 * @returns null (no eat) | { foodId, heals, hp } where `hp` is the post-heal
 *          value, already capped at maxHp. The CALLER consumes the food.
 */
export function resolveAutoEat(opts) {
  const o = opts || {};
  if (!o.enabled) return null;
  if (!o.owned) return null;
  const hp = Number(o.hp);
  const maxHp = Number(o.maxHp);
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || !(maxHp > 0)) return null;
  if (hp <= 0) return null;                       // already dead — respawn owns this
  if (hp / maxHp > clampThreshold(o.threshold)) return null;

  const items = o.items || {};
  const foodId = chooseFood(o.foodId, o.inventory, items);
  if (!foodId) return null;
  const heals = Number(items[foodId] && items[foodId].heals) || 0;
  if (!(heals > 0)) return null;

  return { foodId, heals, hp: Math.min(maxHp, hp + heals) };
}
