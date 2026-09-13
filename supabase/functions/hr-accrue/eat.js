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
//   · During a LIVE, client-predicted fight the server pointer is IDLE and
//     player_state.hp is STALE-FULL (measured on live QA: active_kind='idle',
//     hp=10/10 while the client shows a goblin fight at 4 HP). The server cannot
//     distinguish that from a genuinely-idle player at full HP. So:
//       — The server does NOT gate on full HP. There is no `already_full`
//         refusal: refusing it would leave the food UNDEBITED during a live
//         fight (server hp reads full), which is exactly Paione's P0 —
//         "I eat 1 mid-combat, it heals and the food returns to 2". The heal
//         credit is a no-op when server hp is already full (min(max,max+h)=max);
//         the DEBIT — the authoritative part — always lands.
//       — Wasting a full-HP eat is refused on the CLIENT (legacy.js eatFood's
//         b224 guard), which is the ONLY place that knows the real hp during a
//         live fight (the client owns combat hp, see events.js NO_SYNC). The
//         server owns the food; the client owns the fight's hp.
//   · The client applies the heal to its combat hp locally (eatFood) and the eat
//     transport PRESERVES that combat hp across the envelope reconcile while a
//     fight is in flight (src/net/... wireServerEat), because accrue.js's HP
//     floor writes an envelope's hp unconditionally during a fight (b373) and
//     would otherwise snap the client's live hp up to the stale-full server hp.
//     Out of combat (idle, genuinely-low server hp — e.g. post-away), the server
//     hp IS the truth and the normal reconcile applies it.
//
// ── THE BUFF MODEL (step 2, 2026-09-13) ────────────────────────────────────
// A Feast's timed effect used to be applied by the CLIENT and by nobody else:
// `window.applyBuff` pushed `{type, magnitude, remainingMs}` into G, the residue
// carried it, and the server — which computes every away kill, drop and XP grant
// — had never heard of it. 2026-09-13-consumable-buffs.sql gave the server the
// clock (player_state.buffs, an ABSOLUTE `until`, one delta key `buff_apply`) and
// deliberately shipped with NO emitter. THIS verb is the emitter.
//
// The rule is one line: a food that carries a buff puts `buff_apply: {item}` in
// THE SAME DELTA as its debit, so one idempotency key debits once and buffs once.
// Everything else about the buff — its type, its strength, how long it lasts and
// the instant it ends — is resolved inside hr_apply from the generated
// hr_item_buffs catalogue and the SERVER's now(), under the character's row lock.
// The client sends a food NAME; it cannot influence the expiry, and there is no
// shape in which it can (see eatDelta).
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
 * `buffType` is the catalogue's OWN type string and it is JOURNAL METADATA ONLY
 * — the buff the server actually grants is resolved a second time inside
 * hr_apply from `hr_item_buffs` under the character lock, from the item id and
 * nothing else. It is safe for this layer to name it because hr_item_buffs is
 * GENERATED from this same src/data/items.js (tools/gen-catalogues.mjs) and
 * tests/buff-queue.mjs [2] asserts the two are equal row for row; if that ever
 * drifts the journal is wrong and the GRANT is still right, which is the only
 * direction this is allowed to be wrong in.
 *
 * @returns { ok:true, item, name, heals, hasBuff, buffType } | { ok:false, status, error, detail? }
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
  /* An OBJECT with a string `type`, not a truthy `buff`. `hr_item_buffs` only
     carries rows the generator could resolve to a real type, so a food whose
     `buff` is a stray truthy value would emit a `buff_apply` the server refuses
     as `bad_buff_item` — and the refusal rolls back the DEBIT, i.e. a broken
     data row would make a perfectly good food uneatable. Read the shape. */
  const buff = (item.buff && typeof item.buff === 'object' && !Array.isArray(item.buff)) ? item.buff : null;
  const buffType = (buff && typeof buff.type === 'string' && buff.type) ? buff.type : null;
  const hasBuff = buffType !== null;
  /* NOT FOOD: a real item that neither heals nor buffs. A key, a bar, an ore —
     eating it would debit an item for no effect, which is a bug not a gesture. */
  if (!(heals > 0) && !hasBuff) {
    return { ok: false, status: 409, error: INTENT_ERRORS.ITEM_NOT_FOOD, detail: { item: itemId } };
  }
  return { ok: true, item: itemId, name: item.n || itemId, heals, hasBuff, buffType };
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
 * @param auto   TRUE when the auto-eater fired this heal (request.js readAuto).
 *               Suppresses `buff_apply` — see the block below.
 */
export function eatDelta(food, newHp, auto) {
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
      /* `buff` NAMES THE TYPE, and it is only present when one was asked for, so
         a journal row for a plain Provision is byte-identical to the pre-buff
         one. It is metadata, never authority — see resolveFood. */
      meta: (food.hasBuff && auto !== true)
        ? { item: food.item, heals: food.heals, buff: food.buffType }
        : { item: food.item, heals: food.heals },
    },
  };
  if (food.heals > 0) delta.hp = newHp;
  /* ── THE BUFF, IN THE SAME DELTA AS THE DEBIT (step 2, 2026-09-13) ─────────
     ONE delta, therefore ONE idempotency key, therefore one debit and one buff:
     hr_apply resolves the type, the magnitude, the duration and the absolute
     `until` from hr_item_buffs + now() under the character lock, so the ONLY
     field that may appear here is the item id — an object carrying `until`,
     `magnitude`, `type`, `duration_ms`, `remaining_ms` or `scale` is refused BY
     NAME as bad_buff_item/forbidden_key (2026-09-13-consumable-buffs.sql §3).
     Emitting it in a SECOND apply would have been two keys for one gesture: a
     replay, a rate refusal or a dropped response between them debits the food
     and never buffs, or buffs twice off one pie. The replay case is covered by
     hr_apply's own intent_mismatch/idempotency (the key names the FOOD), and a
     `buff_at_max` refusal rolls the whole apply back — so the food is NOT
     debited when the buff cannot land, which is the designer's rule ("never eat
     the item for nothing") and is asserted by execution in tests/buff-queue.mjs
     [16] rather than trusted.
     ⚠ `buff_apply` is NOT in intents.js STAMPING_DELTA_KEYS and must never
       become one: hr_apply stamps `accrued_to = now()` on `equip`/`activity`/
       `enchant`, and an eat that closed the accrual window would confiscate an
       unpaid night every time a player ate mid-absence. Asserted in [19].

     ⚠ `items` IS ALWAYS PRESENT ABOVE, AND buff_apply IS NEVER EMITTED ALONE
       (Security F3, 2026-09-13). The SQL block performs no possession check of
       its own — it relies on THIS delta's `items:{[item]:-1}` being the debit,
       which hr_apply re-checks under the row lock. A `buff_apply` without the
       matching -1 would be a free buff off an item you do not own. The coupling
       is enforced server-side (`buff_not_paid`) and asserted by execution in
       tests/buff-queue.mjs [18c]; this function cannot express the bad shape,
       because `items` is built unconditionally from the SAME `food.item`.

     ⚠ AND NOT ON AN AUTO-EAT, which is the OTHER half of shipping this safely.
       Fifteen `foodClass:'healing'` rows in src/data/items.js carry an incidental
       buff (Cooked Herring's +1% gather speed, Goldgill Steak's +2% drop rate),
       and the auto-eater eats exactly that pool — up to 20 sends/min through
       legacy.js's paced FIFO. Buffing every one of them would (1) grant a bonus
       the client never painted (maybeAutoEat heals and never calls applyBuff —
       b163, "HP auto-eat should only HEAL"), and (2) drive the queue onto the
       60-minute cap within ~90 s of a hard fight, after which every auto-eat is
       refused `buff_at_max` — and that refusal rolls the whole apply back, so the
       food is never debited and returns on the next envelope: the b467→b479 "food
       I eat gets restocked" P0, reintroduced by a feature. A buff is for a
       GESTURE; a heal is not a gesture. */
  if (food.hasBuff && auto !== true) delta.buff_apply = { item: food.item };
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
 * @param o.auto      TRUE when the auto-eater fired this heal (request.js readAuto)
 * @returns { status, body }
 */
export async function runEat(o) {
  const { exec, user, slot, intentId, item: itemId, auto } = o;

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

  /* (2) NO SERVER-SIDE "ALREADY FULL" GATE — see the header. During a live
     client-predicted fight the server pointer is idle and server hp reads
     STALE-FULL, so a full-hp gate here would refuse the eat, leave the food
     UNDEBITED, and reproduce Paione's P0. The DEBIT must always land; the heal
     credit is a harmless no-op when server hp is genuinely full. "Do not waste
     food at full HP" is the client's call (eatFood's b224 guard), because the
     client is the only party that knows the real hp mid-fight.

     ⚠ AND THERE IS NO "ALREADY BUFFED" GATE HERE EITHER, for the mirror-image
       reason: the queue's ceiling is a property of the LOCKED row, and this read
       is not under the lock. `buff_at_max` is decided inside hr_apply, where the
       queue cannot change under it; deciding it here would be a check-then-act
       race in which two eats a millisecond apart both pass. The client gets the
       same honest refusal either way — one round trip later and correct. */

  /* Clamp to max_hp ONLY when the server states one (> 0). A DB with max_hp = 0
     is broken, but `min(0, …)` would then propose hp = 0 — so fall back to the
     unclamped sum, which hr_apply re-clamps to [0, max_hp] under the lock
     anyway. The clamp source is player_state.max_hp; when the separate
     HP-derivation fix makes max_hp track the hitpoints level, this tracks it
     automatically with no change here. */
  const newHp = food.heals > 0
    ? (maxHp > 0 ? Math.min(maxHp, serverHp + food.heals) : serverHp + food.heals)
    : serverHp;
  const delta = eatDelta(food, newHp, auto);

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
  let res = await applyDelta({ exec, user, slot, version: env.version, intentId, delta });

  /* ── (3b) THE HEAL MUST LAND EVEN WHEN THE BUFF CANNOT (Security F5, P1) ───
     `buff_at_max` — the 60-minute ceiling, or `why:'segment_budget'` at eight live
     segments of a type — raises inside hr_apply and rolls back the WHOLE delta.
     That is the designer's rule for a FEAST ("never eat the item for nothing") and
     it is right for one. It is badly wrong for the fifteen `foodClass:'healing'`
     rows that carry an incidental buff: a player at the cap presses Eat mid-fight,
     the apply is refused whole, the food is kept, THE HP IS NOT HEALED, and the
     character dies to a button that did nothing. Auto-eat is a purchased trait most
     characters do not own, so the manual press is the common path, not the edge.

     SO: retry ONCE, without the buff, FOR FOOD THAT HEALS.
       · the same `intentId` — `buff_at_max` is a RELEASE code (c_release_codes), the
         first attempt wrote nothing, and the intent NAME is unchanged (`eat:<item>`),
         so hr_apply neither answers `intent_mismatch` nor double-debits. Exactly one
         serving leaves the bag whichever attempt lands.
       · the same `env.version` — the refusal rolled back, so nothing bumped it.
       · `eatDelta(food, newHp, true)` builds the retry, i.e. the AUTO shape: no
         `buff_apply` AND no `meta.buff`, because a journal row must not claim a buff
         the character did not get.
     A PURE-BUFF food (heals === 0) is NOT retried: there would be nothing left to
     buy, and eating it for nothing is exactly what the ruling forbids. Its refusal
     reaches the player as `buff_at_max` and the food stays in the bag.
     The client is told which happened (`buff_skipped:'at_max'`), so the toast can
     say "buff at max — ate it for the heal" instead of silently under-delivering.
     Asserted by execution in tests/buff-queue.mjs [18d]; the away engine is not on
     this path at all (the accrual engine's autoEat never emits `buff_apply`), which
     that arm also measures. */
  let buffSkipped = null;
  if (res && res.ok !== true && res.error === 'buff_at_max'
      && food.heals > 0 && delta.buff_apply !== undefined) {
    buffSkipped = 'at_max';
    res = await applyDelta({
      exec, user, slot, version: env.version, intentId, delta: eatDelta(food, newHp, true),
    });
  }

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
      /* `buff` is the TYPE only — never a magnitude and never a duration. The
         authority on what the player now holds is the envelope's own `buffs`
         block (hr_state_of's projection of the row hr_apply just wrote), which
         the client mirrors in reconcileBuffs; a receipt that restated the
         numbers would be a second copy of them. */
      receipt: res.replayed === true ? null
        : {
          item: food.item, name: food.name, heals: food.heals, hp: newHp,
          ...((food.hasBuff && auto !== true && buffSkipped === null) ? { buff: food.buffType } : {}),
          ...(buffSkipped ? { buff_skipped: buffSkipped } : {}),
        },
      /* TOP-LEVEL TOO, because a replay returns a null receipt and the client still
         has to know the buff it predicted is not there. */
      ...(buffSkipped ? { buff_skipped: buffSkipped } : {}),
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}
