// ============================================================================
// supabase/functions/hr-accrue/enchant.js — THE ENCHANT INTENT (ELEMENTS v1).
//
// "Apply this rune to my weapon."
//
// Read ./intents.js first — it is the contract. This file is a CLONE of
// ./equip.js: the tenth intent, the THIRD collecting one (after set_activity and
// equip), and it shares equip's `collectCurrentWindow` rather than copying it.
// It deliberately follows equip line for line; where it differs, the difference
// is called out.
//
// ── WHAT THE CLIENT MAY SEND, AND WHAT IT MAY NOT ───────────────────────────
//   {"verb":"enchant","slot":N,"intentId":"<uuid>",
//    "enchant":{"slot":"weapon","rune":"ember_rune"}}
//
// A slot NAME and a rune item NAME. Nothing else, and there is nothing else it
// could truthfully contribute: the ELEMENT is `hr_runes[rune]`, resolved
// server-side; the MAGNITUDE is the element's, server-side; the SUCCESS is not a
// roll (an enchant either applies or is refused by name). No element, no
// magnitude, no success bit, no source slot — the rune comes out of the player's
// own `player_inventory` row, debited under a lock.
//
// ── WHY IT COLLECTS FIRST, AND WHY THAT IS DERIVED RATHER THAN CHOSEN ───────
// `hr_apply` stamps `accrued_to = now()` on a delta carrying `enchant` — the
// same §S5 line that makes `equip` and `set_activity` collect (STAMP_KEYS /
// STAMPING_DELTA_KEYS both carry 'enchant'). So an enchant that did not collect
// first would DISCARD every unpaid second since the last settle, on every
// gesture, invisibly.
//
// The ORDER also closes the enchant analogue of live-settlement §12(1), and
// only in this direction: the window is priced against the WEAPON THE PLAYER WAS
// ACTUALLY FIGHTING WITH while it elapsed — its pre-enchant element — and only
// then does the rune land. Collecting AFTER would price the whole unpaid span at
// the NEW element, turning a 90 s residue into "fight cheap all night, enchant,
// settle", a repeatable exploit rather than a rounding exposure.
//
// ── THE AUTHORITY IS hr_apply, NOT THIS FILE ────────────────────────────────
// Everything below the shape check is an EARLY ANSWER. hr_apply's enchant block
// (2026-08-18-enchant.sql) re-checks, under a row lock, against the GENERATED
// catalogue:
//   · the rune resolves to an element   (hr_runes → else unknown_item)
//   · the slot is the weapon slot AND it holds a weapon
//                                       (player_equipment + hr_items.kind → else wrong_slot)
//   · THE PLAYER OWNS A COPY — the debit IS the ownership check (else
//     insufficient_item)
// What the early answers buy is a NAMED refusal one round trip earlier and — far
// more valuable — a refusal that costs NO COLLECT, because a shape refused here
// returns before the gate.
//
// ⚠ THIS FILE WRITES NO TABLE. The connection is `hr_engine`, which holds zero
//   table privileges in every schema. The whole capability is "propose a delta
//   to a function that re-validates every invariant".
// ============================================================================

import {
  collectGate, intentNameOf, INTENT_ERRORS, rateBucketFor, requiresKey,
  collectsFirst, guardStampKeys, catalogueGet,
} from './intents.js';
import { refusalBody } from './envelope.js';
import { RUNE_ELEMENT, ENCHANT_SLOTS } from './catalogue.js';
import { READ_SQL, APPLY_SQL, collectCurrentWindow } from './set-activity.js';

/** The verb's own name, used to build `journal.intent`. */
export const VERB = 'enchant';

/**
 * Validate the OPERATION against the in-process catalogues. Pure — no database,
 * no clock, no envelope.
 *
 * ⚠ `catalogueGet`, NEVER truthiness. A slot name off the wire is bounded by
 *   /^[a-z0-9_]{1,32}$/ and a rune id by /^[a-z0-9_]{1,64}$/ — both of which
 *   match `constructor` and `__proto__`, both truthy on a plain object. The
 *   indexes are null-prototype and the reader is the shared one.
 *
 * @param op  the parsed `{slot, rune}` from request.js, or null
 * @returns { ok:true, slot, rune } | { ok:false, error, detail }
 */
export function validateOp(op) {
  if (!op || typeof op !== 'object' || Array.isArray(op)) {
    return { ok: false, error: INTENT_ERRORS.BAD_ENCHANT, detail: { why: 'no enchant operation' } };
  }
  const { slot, rune } = op;
  /* An unreadable slot or rune arrived as null from request.js — a SHAPE
     failure, reported as bad_enchant rather than as a catalogue miss. */
  if (slot === null || slot === undefined || rune === null || rune === undefined) {
    return { ok: false, error: INTENT_ERRORS.BAD_ENCHANT, detail: { why: 'slot and rune are both required' } };
  }
  /* v1: WEAPON ONLY. A well-formed slot name that is not enchantable is
     `wrong_slot` — the same code hr_apply raises for a slot that holds no
     weapon — not `bad_enchant`, because the request WAS readable; it just names
     a slot this build cannot enchant. */
  if (catalogueGet(ENCHANT_SLOTS, slot) !== true) {
    return { ok: false, error: 'wrong_slot', detail: { equip_slot: slot } };
  }
  /* The rune must be a real rune. ABSENT means the item is not a rune AT ALL,
     which hr_apply reports as `unknown_item` against hr_runes — one code, one
     meaning. */
  if (catalogueGet(RUNE_ELEMENT, rune) === undefined) {
    return { ok: false, error: INTENT_ERRORS.UNKNOWN_ITEM, detail: { item_id: rune } };
  }
  return { ok: true, slot, rune };
}

/**
 * The delta.
 *
 * `journal.kind` is `'enchant'` — a real `c_ledger_kinds` value (added in
 * 2026-08-18-enchant.sql), and the RIGHT one: an enchant CONSUMES a rune and
 * changes server-owned state, so journal rule 6 applies. It is human-paced, so
 * it cannot be the `game_events` mistake at ledger scale.
 *
 * ⚠ THE DELTA CARRIES THE RUNE ID, NOT THE ELEMENT. hr_apply resolves
 *   rune → element from `hr_runes` under the lock, exactly as the equip delta
 *   carries the item id and hr_apply looks its slot up. A client-supplied
 *   element would be a value crossing into server state, which rule 2 forbids.
 *
 * ⚠ NO `accrued_to` KEY. hr_apply stamps it from `now()` because the delta
 *   carries `enchant`; a client-supplied instant would be a clock crossing.
 */
export function enchantDelta(slot, rune) {
  return {
    enchant: { [slot]: rune },
    journal: {
      kind: 'enchant',
      /* The slot NAME, so the intent string is stable for one gesture and
         hr_apply's `intent_mismatch` compares exactly this string. The rune is
         deliberately NOT in the name, exactly as equip's item is not: a gesture
         is retried with the SAME key only when unanswered, and a re-enchant with
         a different rune is a NEW gesture with a new key. */
      intent: intentNameOf(VERB, slot),
      /* Both names, so a support request can reconstruct the enchant. The rune
         is a NAME the server re-validated; no element or magnitude rides here. */
      meta: { slot, rune },
    },
  };
}

/**
 * THE INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      the character slot — selects a row the caller owns.
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.enchant   the parsed `{slot, rune}` operation
 */
export async function runEnchant(o) {
  const { exec, user, slot, intentId, enchant } = o;

  /* (0) SHAPE FIRST — before ANY database work, so a malformed client cannot
         spend a real player's rate budget by looping on garbage, AND so a
         refusal never costs the collect this verb would otherwise run. */
  if (requiresKey(VERB) && !intentId) {
    return { status: 400, body: { ok: false, error: INTENT_ERRORS.MISSING_INTENT_ID } };
  }
  const decl = validateOp(enchant);
  if (!decl.ok) {
    return {
      status: decl.error === INTENT_ERRORS.BAD_ENCHANT ? 400 : 409,
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

  /* (2) ⚠ COLLECT BEFORE ENCHANT. See the header for why the ORDER is the thing
         that closes the exploit. `collectsFirst` is read from the registry here
         and nowhere else; the same `collectCurrentWindow` set_activity and equip
         use is imported rather than copied, so the three verbs can never come to
         price one window differently. */
  const collect = collectsFirst(VERB)
    ? await collectCurrentWindow({
      exec, user, slot, env, st,
      nowMs: new Date(read.now).getTime(),
      capMs: Number(read.cap_ms) || 0,
    })
    : { outcome: 'nothing', version: env.version, reason: 'verb_does_not_collect' };
  const gate = collectGate(collect);

  /* NO C3 ESCAPE HATCH HERE, DELIBERATELY — same as equip. An enchant has no
     lockout argument: the player can always stop. A refusing collect refuses the
     enchant; the recovery is the `accrue` verb, which owns the degrade ladder. */
  if (!gate.proceed) {
    return {
      status: 409,
      body: await refusalBody({
        exec, verb: VERB, user, slot, decorate: decorateEnchant,
        refusal: { error: gate.error, stage: 'collect', detail: collect.detail ?? null },
        fallback: env,
      }),
    };
  }

  /* (3) THE ENCHANT. The version is the one the COLLECT left behind, because a
         collect that paid has already bumped it. */
  const version = gate.version ?? env.version;
  const delta = enchantDelta(decl.slot, decl.rune);

  /* ⚠ THE STAMP GUARD, RUN ON THE DELTA THIS VERB ACTUALLY BUILT. It passes
     because `collectsFirst` is true — the day someone flips the registry row to
     `false`, this returns `would_confiscate` instead of silently eating every
     player's unpaid window. */
  const stamp = guardStampKeys(VERB, delta);
  if (stamp) {
    return { status: 409, body: { ok: false, verb: VERB, error: stamp.error, keys: stamp.keys } };
  }

  const [applied] = await exec(APPLY_SQL, [user, slot, version, intentId, JSON.stringify(delta)]);
  const res = applied && applied.res;

  if (!res || res.ok !== true) {
    /* ⚠ THE COLLECT MAY HAVE PAID. A refused enchant does NOT roll it back — two
       applies, deliberately — so `collected` rides along. */
    return {
      status: 409,
      body: await refusalBody({
        exec, verb: VERB, user, slot, decorate: decorateEnchant,
        refusal: {
          error: (res && res.error) || 'apply_failed', stage: 'enchant', detail: res ?? null,
          collected: collect.receipt || null,
        },
        fallback: null,
      }),
    };
  }

  /* THE ENVELOPE. `hr_state_of` verbatim. `enchant` is READ OUT OF the server's
     returned state, never echoed from the request — the same rule, and the same
     reason, as equip's `equipment`: a replayed enchant that echoed the client's
     rune would report the CLIENT's own instruction as though the server had
     performed it, while `state` said something else. */
  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb: VERB,
      enchant: enchantOf(res),
      collected: collect.receipt || null,
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}

/** The enchant state, AS THE SERVER HOLDS IT: `{ <equip_slot>: <element> }`. One
    reader, so a refusal and a success report the same field from the same
    place. hr_state_of returns it top-level, next to `equipment`. */
function enchantOf(env) {
  const e = env && env.enchant;
  return (e && typeof e === 'object') ? e : {};
}

/** This intent's top-level summary of the server's state, handed to the shared
    `refusalBody`. */
function decorateEnchant(env) { return { enchant: enchantOf(env) }; }
