// ============================================================================
// supabase/functions/hr-accrue/equip.js — THE EQUIP INTENT (b366).
//
// "Wear this." / "Take that off." / "Apply this loadout."
//
// Read ./intents.js first — it is the contract. This file is its ninth
// implementation and its SECOND collecting one; ./set-activity.js is the first
// and this file shares its collect rather than copying it.
//
// ── WHY THIS VERB EXISTS, AND WHY IT IS PHASE 2's PREREQUISITE ──────────────
// Until now NOTHING told the server about a client equip. There was no verb
// anywhere in src/net/*. The consequences were not theoretical:
//
//   · b362, reported live — "every time I am using the corresponding weapon
//     type it gets duplicated when I equip it." Both sides hold gear DISJOINTLY
//     (an equipped copy is not also in the bag), so a client equip moved a unit
//     out of the client's bag while the server's `player_inventory` row went on
//     counting it. The b359 max-merge then handed that stale figure back into
//     the bag while the same copy sat in the slot. Item created from nothing,
//     once per equip round trip, on tradeable gear.
//   · b363 shipped `unaccountedEquipped()` — a client-side DISCOUNT that
//     subtracts copies this client is wearing that the envelope does not also
//     show worn. It is a tourniquet on a wound whose cause is this missing
//     verb, and its own header names the two conditions that retire it. This
//     file is the first of them.
//   · live-settlement.md §12(1): equipment is read at collect time and prices
//     the WHOLE window — measured 12.8x gold / 20x XP naked->BiS over 12 h.
//     Live settling shrank the exposure to ~90 s. It CLOSES here, because the
//     equip that changes the pricing now collects the window first (see below).
//
// ── WHAT THE CLIENT MAY SEND, AND WHAT IT MAY NOT ───────────────────────────
//   {"verb":"equip","slot":N,"intentId":"<uuid>",
//    "equip":{"weapon":"iron_sword","shield":null}}
//
// A slot NAME and an item NAME. Nothing else, and there is nothing else it
// could truthfully contribute: an equip moves exactly ONE unit and the server
// decides where it came from. No quantity (it is always one), no stats (they
// are `ITEMS[id]`, server-side), no source-slot field (the source is the player's own
// `player_inventory` row, debited under a lock), and no price.
//
// ── WHY IT COLLECTS FIRST, AND WHY THAT IS DERIVED RATHER THAN CHOSEN ───────
// `hr_apply` stamps `accrued_to = now()` on a delta carrying `equip` — the same
// line that makes `set_activity` collect (STAMPING_DELTA_KEYS). So an equip
// that did not collect first would DISCARD every unpaid second since the last
// settle, on every gesture, invisibly.
//
// The ORDER also closes §12(1), and only in this direction: the window is
// priced against the gear the player was ACTUALLY WEARING while it elapsed, and
// only then does the swap land. Collecting AFTER would price the whole unpaid
// span at the NEW gear — turning a 90 s residue into "fight naked all night,
// equip BiS, settle", which is a repeatable exploit rather than a rounding
// exposure.
//
// ── THE AUTHORITY IS hr_apply, NOT THIS FILE ────────────────────────────────
// Everything below the shape check is an EARLY ANSWER. `hr_apply`'s equip block
// (2026-08-11-apply-engine.sql §EQUIPMENT, current body in the fight-carry
// link) re-checks, under a row lock, against the GENERATED catalogues:
//   · the equip slot exists            (hr_equip_slots)
//   · the item exists                  (hr_items)
//   · the item fits that slot          (hr_item_slots, ring1/ring2 expanded)
//   · reqSkill/reqLv against SERVER skills, derived from player_skills
//   · THE PLAYER OWNS A COPY — the debit IS the ownership check, and the whole
//     op is a TRANSFER (one unit out of player_inventory, one unit of whatever
//     was in the slot back in), so the total the player owns is CONSERVED and
//     an equip/unequip dupe is arithmetically impossible rather than merely
//     unimplemented.
// What the early answers buy is a NAMED refusal one round trip earlier and —
// far more valuable — a refusal that costs NO COLLECT, because a shape refused
// here returns before the gate.
//
// DELIBERATELY NOT ANSWERED EARLY: the reqSkill/reqLv gate. Answering it here
// needs a level-from-xp derivation, and a second copy of that curve in the
// payload is the `unifyObject` failure this program exists to prevent. It costs
// one round trip on a refusal a well-behaved client never sends.
//
// ⚠ THIS FILE WRITES NO TABLE. Same as every intent module: the connection is
//   `hr_engine`, which holds zero table privileges in every schema.
// ============================================================================

import {
  collectGate, intentNameOf, INTENT_ERRORS, rateBucketFor, requiresKey,
  collectsFirst, guardStampKeys, catalogueGet,
} from './intents.js';
import { refusalBody } from './envelope.js';
import { EQUIP_SLOT_INDEX, ITEM_EQUIP_SLOTS } from './catalogue.js';
import { READ_SQL, APPLY_SQL, collectCurrentWindow } from './set-activity.js';

/** The verb's own name, used to build `journal.intent`. */
export const VERB = 'equip';

/**
 * Validate the OPERATIONS against the in-process catalogue. Pure — no database,
 * no clock, no envelope.
 *
 * ⚠ `catalogueGet`, NEVER truthiness. A slot name off the wire is bounded by
 *   /^[a-z0-9_]{1,32}$/ and an item id by /^[a-z0-9_]{1,64}$/ — both of which
 *   match `constructor` and `__proto__`, both of which are TRUTHY on a plain
 *   object. The indexes are null-prototype and the reader is the shared one, so
 *   the same class of bypass that reached three database statements in the
 *   activity intent cannot be spelled here.
 *
 * @param ops  the parsed `{slot: itemId|null}` from request.js, or null
 * @returns { ok:true, ops } | { ok:false, error, detail }
 */
export function validateOps(ops) {
  if (!ops || typeof ops !== 'object' || Array.isArray(ops)) {
    return { ok: false, error: INTENT_ERRORS.BAD_EQUIP, detail: { why: 'no equip operations' } };
  }
  const slots = Object.keys(ops);
  if (slots.length === 0) {
    return { ok: false, error: INTENT_ERRORS.BAD_EQUIP, detail: { why: 'no equip operations' } };
  }
  for (const s of slots) {
    if (catalogueGet(EQUIP_SLOT_INDEX, s) !== true) {
      return { ok: false, error: 'unknown_equip_slot', detail: { equip_slot: s } };
    }
    const item = ops[s];
    if (item === null) continue;              // UNEQUIP — always shape-legal
    const fits = catalogueGet(ITEM_EQUIP_SLOTS, item);
    /* ABSENT means the item is not equipment AT ALL, which is a different fact
       than the fact "exists but does not fit here", and is reported as a
       different code.
       An id that is in no catalogue whatsoever also lands here — correct, and
       hr_apply distinguishes the two the same way against hr_items. */
    if (!fits) {
      return { ok: false, error: INTENT_ERRORS.UNKNOWN_ITEM, detail: { item_id: item } };
    }
    if (fits[s] !== true) {
      return { ok: false, error: 'wrong_slot', detail: { item_id: item, equip_slot: s } };
    }
  }
  return { ok: true, ops };
}

/**
 * The delta.
 *
 * `journal.kind` is `'equip'` — a real `c_ledger_kinds` value, and the RIGHT
 * one, unlike `set_activity`'s deliberate `'admin'`. An equip genuinely MOVES
 * VALUE between two server-owned containers, so journal rule 6 ("journal value
 * transfers") applies squarely. It is also human-paced — a handful per session,
 * not per tick — so it cannot be the `game_events` mistake at ledger scale.
 *
 * ⚠ NO `accrued_to` KEY. hr_apply stamps it from `now()` because the delta
 *   carries `equip`; a client-supplied instant would be a clock crossing into
 *   the economy, which rule 2 forbids outright.
 */
export function equipDelta(ops) {
  const slots = Object.keys(ops).sort();
  return {
    equip: ops,
    journal: {
      kind: 'equip',
      /* The slot NAMES, sorted, so the intent string is stable for one gesture
         however the client ordered its keys — `hr_apply`'s `intent_mismatch`
         compares exactly this string, and a key replayed with the same ops in a
         different order must be a REPLAY, not a mismatch. */
      intent: intentNameOf(VERB, ...slots),
      /* The ops themselves, so a support request can reconstruct the swap. The
         items are NAMES the server re-validated; no number rides here. */
      meta: { ops: slots.map((s) => ({ slot: s, item: ops[s] })) },
    },
  };
}

/**
 * THE INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      the character slot — the only request-derived value that
 *                    reaches a query, and it selects a row the caller owns.
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.equip     the parsed `{equipSlot: itemId|null}` map
 */
export async function runEquip(o) {
  const { exec, user, slot, intentId, equip } = o;

  /* (0) SHAPE FIRST — before ANY database work, so a malformed client cannot
         spend a real player's rate budget by looping on garbage, AND so a
         refusal never costs the collect this verb would otherwise run. */
  if (requiresKey(VERB) && !intentId) {
    return { status: 400, body: { ok: false, error: INTENT_ERRORS.MISSING_INTENT_ID } };
  }
  const decl = validateOps(equip);
  if (!decl.ok) {
    return {
      status: decl.error === INTENT_ERRORS.BAD_EQUIP ? 400 : 409,
      body: { ok: false, error: decl.error, ...(decl.detail || {}) },
    };
  }

  /* (1) GATE + READ, one statement, gate first (review D3). The bucket comes
         out of the registry, never a literal. */
  const [read] = await exec(READ_SQL, [user, slot, rateBucketFor(VERB)]);
  if (!read || read.allowed !== true) {
    return { status: 429, body: { ok: false, error: INTENT_ERRORS.RATE_LIMITED } };
  }
  const env = read.state;
  if (!env || env.ok !== true) {
    return { status: 409, body: { ok: false, error: (env && env.error) || INTENT_ERRORS.NO_CHARACTER } };
  }
  const st = env.state;

  /* (2) ⚠ COLLECT BEFORE EQUIP. See the header for why the ORDER — not merely
         the fact — is the thing that closes §12(1). `collectsFirst` is read
         from the registry here and nowhere else; the same `collectCurrentWindow`
         the activity intent uses is imported rather than copied, so the two
         verbs can never come to price one window differently. */
  const collect = collectsFirst(VERB)
    ? await collectCurrentWindow({
      exec, user, slot, env, st,
      nowMs: new Date(read.now).getTime(),
      capMs: Number(read.cap_ms) || 0,
    })
    : { outcome: 'nothing', version: env.version, reason: 'verb_does_not_collect' };
  const gate = collectGate(collect);

  /* NO C3 ESCAPE HATCH HERE, DELIBERATELY. `set_activity` may force-close an
     unpriceable window because the alternative is a character frozen on a
     pointer it cannot leave — a lockout. An equip has no such argument: the
     player can always stop, and force-closing on a swap would discard a window
     for a gesture that has nothing to do with it, with no way for the player to
     connect the two. A refusing collect refuses the equip; the recovery is the
     `accrue` verb, which owns the degrade ladder. */
  if (!gate.proceed) {
    return {
      status: 409,
      body: await refusalBody({
        exec, verb: VERB, user, slot, decorate: decorateEquipment,
        refusal: { error: gate.error, stage: 'collect', detail: collect.detail ?? null },
        fallback: env,
      }),
    };
  }

  /* (3) THE SWAP. The version is the one the COLLECT left behind, because a
         collect that paid has already bumped it. */
  const version = gate.version ?? env.version;
  const delta = equipDelta(decl.ops);

  /* ⚠ THE STAMP GUARD, RUN ON THE DELTA THIS VERB ACTUALLY BUILT. It passes
     here because `collectsFirst` is true — and that is exactly the point: the
     day someone flips the registry row to `false` to "make equipping snappier",
     this returns `would_confiscate` instead of silently eating every player's
     unpaid window. A comment cannot do that. */
  const stamp = guardStampKeys(VERB, delta);
  if (stamp) {
    return { status: 409, body: { ok: false, verb: VERB, error: stamp.error, keys: stamp.keys } };
  }

  const [applied] = await exec(APPLY_SQL, [user, slot, version, intentId, JSON.stringify(delta)]);
  const res = applied && applied.res;

  if (!res || res.ok !== true) {
    /* ⚠ THE COLLECT MAY HAVE PAID. A refused swap does NOT roll it back — they
       are two applies, deliberately — so `collected` rides along. Dropping it
       because the SWAP failed would report genuinely applied payment as
       nothing, which is the b349 defect this shape was fixed for. */
    return {
      status: 409,
      body: await refusalBody({
        exec, verb: VERB, user, slot, decorate: decorateEquipment,
        refusal: {
          error: (res && res.error) || 'apply_failed', stage: 'equip', detail: res ?? null,
          collected: collect.receipt || null,
        },
        fallback: null,
      }),
    };
  }

  /* THE ENVELOPE. `hr_state_of` verbatim. `equipment` is READ OUT OF
     `res.state`, never echoed from the request — the same rule, and the same
     reason, as `set_activity`'s `activity`: a replayed equip that echoed the
     client's map would report the CLIENT's own instruction as though the server
     had performed it, while `state` said something else. */
  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb: VERB,
      equipment: equipmentOf(res),
      collected: collect.receipt || null,
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}

/** The loadout, AS THE SERVER HOLDS IT. One reader, so a refusal and a success
    report the same field from the same place. */
function equipmentOf(env) {
  const e = env && env.equipment;
  return (e && typeof e === 'object') ? e : {};
}

/** This intent's top-level summary of the server's state, handed to the shared
    `refusalBody`. */
function decorateEquipment(env) { return { equipment: equipmentOf(env) }; }
