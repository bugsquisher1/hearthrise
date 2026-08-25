// ============================================================================
// supabase/functions/hr-accrue/eat.js — INTENT: MANUAL FOOD CONSUMPTION.
//
// "Eat one Turnip." — sent to the server, which DEBITS the food and CREDITS the
// heal. The client sends a NAME; the heal amount, the HP clamp and the debit are
// all the server's.
//
// ── THE P0 THIS CLOSES (Paione, 2026-08-25, QA slot 0) ──────────────────────
// `window.eatFood` (src/legacy.js) healed and debited G.inventory CLIENT-ONLY
// and sent NO server intent. Inventory authority is now LIVE
// (isInventoryAuthorityLive()===true), so the ABSOLUTE inventory reconcile
// (accrue.js applyEnvelopeState) restored the eaten OWNABLE food from server
// truth on the next envelope/reload: eat 1 Turnip (qty 2→1, HP +2) → reload →
// Turnip back to 2. A free heal AND an effective dupe. Cooked outputs are
// protected from the reconcile so they did not return; OWNABLE raw foods — raw
// fish, crops — DID. This verb makes the consumption REAL server-side so the
// absolute reconcile reflects a debit that actually happened.
//
// ── THE HEAL MODEL — A DECISION, WRITTEN DOWN ───────────────────────────────
// HP is a STANDALONE server value (player_state.hp), and an eat is a plain
// credit to it — NOT integrated into combat-sim. The reasons:
//   · hr_apply already takes `hp` as a client-proposed ABSOLUTE clamped to
//     [0, max_hp] (apply-engine.sql §R10): combat is not yet server-resolved, so
//     the only authority on a live fight's HP is the client's prediction, which
//     the envelope reconciles by RAISING (accrue.js's HP floor never lowers).
//   · An eat therefore computes newHp = min(max_hp, serverHp + heals) from the
//     SERVER's current hp and the CATALOGUE heal, and proposes it. The client
//     never sends the heal or the hp — read the argument list in index.ts.
//   · This is strictly MORE authoritative than R10's bare client absolute: the
//     magnitude comes from src/data, not the wire. It is safe by CLAUDE.md's
//     target property regardless — HP is not tradeable, rankable or
//     contributable, so no forged value can cross into another player's economy.
//   · During a LIVE fight the server's player_state.hp lags (damage is settled
//     at accrual), so an eat mid-fight is priced against that lagged hp — the
//     same combat-HP-ownership limitation the accrual engine already has. It is
//     NOT this verb's to fix (that is the separate max_hp/HP-derivation work);
//     it changes nothing about whether the food is duped, which is the P0.
//
// Same shape as vendor_sell (an `item` name → a server-priced delta), but the
// delta CANNOT be precomputed by runValueIntent: `hp` depends on the state READ.
// So this composes the shared primitives from ./spend.js (gate+read, apply,
// refusal envelope) around an env-dependent delta rather than reusing
// runValueIntent.
//
// PURE ESM. No I/O, no Deno, no globals — driven from Node by tests/eat-intent.mjs.
// ============================================================================

import { INTENT_ERRORS, intentNameOf, catalogueGet, requiresKey, guardStampKeys } from './intents.js';
import { ITEMS } from '../../../src/data/items.js';
import { gateAndRead, applyDelta, refusalBody } from './spend.js';

/** The verb's own name. */
export const VERB = 'eat';

/**
 * Resolve an item id to what makes it edible, or to a refusal that says why.
 * Pure — no database, no clock, no HP.
 *
 * `heals` and `buff` are read from the catalogue; `heals` is the ONLY number
 * that ever reaches the delta, and it comes from src/data — never the request.
 *
 * ⚠ `catalogueGet`, NEVER `ITEMS[id]` (review C6, same as vendor_sell): the id
 *   shape /^[a-z0-9_]{1,64}$/ matches `constructor`/`__proto__`, both truthy on
 *   ITEMS, so a truthiness guard would read a function's properties as food.
 *
 * @returns { ok:true, item, name, heals, hasBuff } | { ok:false, status, error, detail? }
 */
export function resolveFood(itemId) {
  if (typeof itemId !== 'string' || itemId === '') {
    return { ok: false, status: 400, error: INTENT_ERRORS.BAD_ITEM };
  }
  const item = catalogueGet(ITEMS, itemId);
  if (item === undefined) {
    return { ok: false, status: 409, error: INTENT_ERRORS.UNKNOWN_ITEM, detail: { item: itemId } };
  }
  const heals = Number(item.heals) || 0;
  const hasBuff = !!item.buff;
  /* NOT FOOD: a real item that neither heals nor buffs. A key, a bar, an ore —
     eating it would debit an item for no effect, which is a bug not a gesture. */
  if (!(heals > 0) && !hasBuff) {
    return { ok: false, status: 409, error: INTENT_ERRORS.ITEM_NOT_FOOD, detail: { item: itemId } };
  }
  return { ok: true, item: itemId, name: item.n || itemId, heals, hasBuff };
}

/**
 * THE DELTA. `items` is NEGATIVE (one unit consumed) and `hp` is the ABSOLUTE
 * the server computed. hr_apply applies both inside one protected block, so
 * there is no ordering in which the heal lands and the food is not debited, and
 * it re-clamps `hp` to [0, max_hp] and re-checks `have - 1 >= 0` under the row
 * lock — the debit IS the ownership check.
 *
 * ⚠ `hp` IS OMITTED when the food only carries a buff (heals === 0): writing an
 *   absolute equal to the current hp would be a no-op that still risks a clamp
 *   surprise, and there is no reason to touch a column the eat does not move.
 *
 * @param food   a resolved food object from resolveFood
 * @param newHp  min(max_hp, serverHp + food.heals), computed by the caller from
 *               the SERVER's hp. Never a client value.
 */
export function eatDelta(food, newHp) {
  const delta = {
    items: { [food.item]: -1 },
    journal: {
      /* `combat`, an allowlisted ledger kind: a heal is a combat-adjacent
         action and there is no `consume` kind. The daily budget sums gold_in /
         xp_in / qty_in from the delta, and an eat mints none of those (the item
         op is a DEBIT), so the kind choice does not affect any budget.
         `intent` NAMES THE FOOD — hr_apply's intent_mismatch compares exactly
         this string, so one key reused for a different food is a loud refusal,
         and one key replayed for the SAME food debits exactly once. */
      kind: 'combat',
      intent: intentNameOf(VERB, food.item),
      meta: { item: food.item, heals: food.heals },
    },
  };
  if (food.heals > 0) delta.hp = newHp;
  return delta;
}

/**
 * THE INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      selects a row the caller already owns
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.item      the food item id from request.js, or null
 * @returns { status, body }
 */
export async function runEat(o) {
  const { exec, user, slot, intentId, item: itemId } = o;

  /* (0) SHAPE FIRST — before any database work. eat has no `qty` (it consumes
     exactly one), so shapeRefusal (which requires a qty) is not used; the two
     shape checks are inlined. */
  if (requiresKey(VERB) && !intentId) {
    return { status: 400, body: { ok: false, verb: VERB, error: INTENT_ERRORS.MISSING_INTENT_ID } };
  }
  const food = resolveFood(itemId);
  if (!food.ok) {
    return {
      status: food.status,
      body: { ok: false, verb: VERB, error: food.error, ...(food.detail || {}) },
    };
  }

  /* (1) GATE + READ. The rate budget is spent on the gate before the state read
     (review D3), and the server HP the heal is priced against comes from this
     read — never the client. */
  const read = await gateAndRead({ exec, user, slot, verb: VERB });
  if (read.refusal) return read.refusal;
  const env = read.env;
  const st = env.state || {};
  const serverHp = Number(st.hp) || 0;
  const maxHp = Number(st.max_hp) || 0;

  /* (2) ALREADY-FULL, on SERVER hp. A pure heal (heals, no buff) at full HP
     wastes the food for no visible effect — the b224 "kept your X" rule, now
     enforced where the HP is actually owned. Refused with the envelope so the
     client reconciles its optimistic local debit rather than losing the food. A
     buff food is never blocked: its value is the timed buff, not the heal. */
  if (food.heals > 0 && !food.hasBuff && maxHp > 0 && serverHp >= maxHp) {
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb: VERB,
        refusal: { error: INTENT_ERRORS.ALREADY_FULL, stage: 'plan', detail: { hp: serverHp, maxHp } },
        fallback: env,
      }),
    };
  }

  const newHp = food.heals > 0 ? Math.min(maxHp, serverHp + food.heals) : serverHp;
  const delta = eatDelta(food, newHp);

  /* (2b) RULE 3's DELTA HALF. eat does not collect first, so its delta must not
     carry a stamping key. It carries `items`/`hp`/`journal` and never will
     carry one — but the check runs on the delta actually built, so a future
     "eat-and-equip" gimmick is a refusal, not a silent confiscation. */
  const stamp = guardStampKeys(VERB, delta);
  if (stamp) {
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb: VERB,
        refusal: { error: stamp.error, stage: 'plan', detail: { keys: stamp.keys } },
        fallback: env,
      }),
    };
  }

  /* (3) THE APPLY. `env.version` is what this call read; hr_apply refuses a
     stale one (concurrency control) and debits under the row lock, refusing
     `insufficient_item` if the player has no copy. The key is the CLIENT's. */
  const res = await applyDelta({ exec, user, slot, version: env.version, intentId, delta });
  if (!res || res.ok !== true) {
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb: VERB,
        refusal: { error: (res && res.error) || 'apply_failed', stage: 'apply', detail: res ?? null },
        fallback: null,
      }),
    };
  }

  /* (4) THE ENVELOPE, verbatim, plus a receipt for RENDERING. Gold, inventory,
     hp and version all come out of `res` (the state after the write), never the
     request. The receipt is null on a replay (this invocation moved nothing);
     the envelope still carries the true balance. */
  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb: VERB,
      receipt: res.replayed === true ? null
        : { item: food.item, name: food.name, heals: food.heals, hp: newHp },
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}
