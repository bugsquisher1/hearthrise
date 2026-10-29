// ============================================================================
// supabase/functions/hr-accrue/tick-artisan.js — THE ARTISAN CHANNEL: A TOWN
// BENCH RUN (the Great Hearth's fuel, a forge, a range, a loom) IS SETTLED BY
// THE SERVER WHETHER OR NOT ITS OWNER'S BROWSER IS OPEN.
//
// lane/c-playtest-open (backend-architect, 2026-10-29), report #68 / lane
// a-hearth-refuel-truth. THE ROOT CAUSE: the engine ends a bench run only when
// a SETTLE finds its input gone, and until this file nothing on the server ever
// settled one: the world tick drove `gather` only and declared `artisan`
// undriven (tick.js UNDRIVEN_CHANNELS). So a Hearth run whose fuel was spent
// kept `player_state.active_kind = 'artisan'` — the town body stood on its fuel
// stand "Fueling" for every other player — until the owner's own client asked
// (src/session/town-poll.js settleSpentBench, the client half). With the browser
// closed it stood there until the owner came back.
//
// ── WHAT THIS FILE IS AND IS NOT ────────────────────────────────────────────
// It is NOT an engine. A window is ONE `computeAccrual` call over [mark, to] —
// exactly the call the owner's own `accrue` makes (index.ts runAccrual), through
// the same tick seam gather uses (tick-shadow.js shadowTick), with the same
// envelope inputs (envelope.js engineInputsFromEnvelope: the bag, the account's
// Storage where the server draws bench inputs from it, the bag's stack cap,
// "make N"'s `activeLeft`), the same catalogues (catalogue.js ARTISAN_RECIPES_ALL)
// and the same `hr_perks_of` read (unlockedRecipes). The engine decides how many
// actions ran, what they consumed and made, what they paid, and whether the run
// is OVER (its delta then carries `activity: idle`, which hr_apply writes, and
// the town trigger moves the body off its stand). This file decides only WHEN to
// call it and what ONE fenced settle the window becomes.
//
// ONE CALL PER WINDOW, NOT A CADENCE CHAIN. Gather chains 10 s polls inside a
// flush because its tool-double carry is a per-action remainder; an artisan
// window has no state a chain would carry that one call does not (the sub-action
// remainder is DEFERRED by `caller:'tick'`, accrual.js settledWatermarkMs, and the
// next window starts at the stamped mark: "a chain of 15 s windows pays the same
// actions as one long window", accrual.js TOWN_SETTLE_MIN_MS). One call means
// one delta and one journal row, so there is no artisan meta to fold.
//
// THE WRITE UNIT IS THE SETTLED WINDOW (rule 3 of tick-gather.js): at most one
// `craft` ledger row per flush (90 s) per running bench, an AGGREGATE of every
// action in it (meta: ms, ticks, made, burnt, recipe, skill, stopped, out_of,
// from, to — the accrue row's shape, plus `src:'tick'`). Never per action.
//
// It writes NOTHING. It returns ONE write intent naming `hr_tick_settle` — the
// fence that locks the character, refuses a character this holder does not
// lease, compare-and-sets the watermark and the version, and only then calls
// hr_apply, which re-validates every invariant whoever calls it.
//
// PURE ESM, Node + Deno. No `?v=` (not under src/**).
// ============================================================================

import { ITEMS } from '../../../src/data/items.js';
import { GATHER_NODES, ARTISAN_RECIPES_ALL } from './catalogue.js';
import { PAYABLE_KINDS } from './accrual.js';
import { shadowTick, advance, hydrate } from './tick-shadow.js';
import { engineInputsFromEnvelope } from './envelope.js';
import { tickIntentId } from './tick-gather.js';

export const CHANNEL = 'artisan';

if (!PAYABLE_KINDS.includes(CHANNEL)) {
  throw new Error(`tick-artisan.js: "${CHANNEL}" is not in accrual.js PAYABLE_KINDS`);
}

/* The catalogues a bench window needs, from the SAME modules the accrue path
   imports (index.ts: ITEMS, GATHER_NODES, ARTISAN_RECIPES_ALL). `monsters` is
   empty: a bench never reads the bestiary. */
export const ARTISAN_CATALOGUES = Object.freeze({
  items: ITEMS,
  monsters: {},
  nodes: GATHER_NODES,
  recipes: ARTISAN_RECIPES_ALL,
});

/* THE SESSION, from server values only (tick.js (5) hands it the fence's mark,
   `hr_state_of`'s envelope, `hr_perks_of` and `hr_offline_cap_ms`). The pointer
   and the watermark are the ROSTER ROW's (the fence's), never `state.accrued_to`.
   `unlockedRecipes` is the accrue path's `?? null` (null = LOCKED), read off the
   same perk state index.ts reads it from. */
export function sessionFromRoster(row, envelope) {
  if (row.active_kind !== CHANNEL) {
    throw new Error(`sessionFromRoster: kind "${row.active_kind}" is not ${CHANNEL}`);
  }
  const perks = row.perks && row.perks.ok === true ? row.perks : null;
  return {
    ...engineInputsFromEnvelope(envelope, Date.parse(row.accrued_to)),
    userId: row.user_id,
    slot: row.slot,
    shard: Number(row.shard || 0),
    version: Number(row.version),
    activeKind: CHANNEL,
    activeId: row.active_id,
    activeSinceMs: Date.parse(row.active_since),
    accruedToMs: Date.parse(row.accrued_to),
    capMs: row.cap_ms == null ? undefined : Number(row.cap_ms),
    perks,
    unlockedRecipes: (perks ? perks.unlockedRecipes : null) ?? null,
  };
}

/* One window, one engine call, from the session's watermark. */
export function artisanTick(char, watermarkMs, nowMs, opts) {
  return shadowTick(char, watermarkMs, nowMs, ARTISAN_CATALOGUES,
    Object.assign({ caller: 'tick' }, opts || {}));
}

/**
 * Settle `[fromMs, toMs]` as ONE window. tick.js (4) has already cut `toMs` to at
 * most one flush past the fence's mark, and refuses a window below the flush line.
 * Returns the driver shape tick.js expects: { intents, results, char, watermarkMs,
 * unsettledMs, polls, settled }. `unsettledMs` is OWED, never lost: the watermark
 * the next fire reads is the one this window stamped.
 */
export function settleArtisanSession(session0, fromMs, toMs, opts) {
  const o = opts || {};
  const char = hydrate(session0);
  const shard = Number(session0.shard || 0);
  const version = Number(session0.version);
  let watermarkMs = Number(session0.accruedToMs || fromMs);
  const results = [];
  const intents = [];
  const done = () => ({
    intents, results, char, watermarkMs,
    unsettledMs: Math.max(0, toMs - watermarkMs),
    polls: results.length,
    settled: intents.length,
  });

  /* THE SEED IS IN HAND BEFORE THE ENGINE RUNS, or nothing runs (never a
     fallback seed on a production call: tick-gather.js settleGatherSession). */
  if (typeof o.seedOf === 'function' && o.seedOf(watermarkMs) == null) return done();
  if (!(toMs > watermarkMs)) return done();

  const res = artisanTick(char, watermarkMs, toMs, o);
  results.push({ watermarkMs, nowMs: toMs, res });
  if (!res.accrued) return done();

  const settledTo = Date.parse(res.delta.accrued_to);
  /* FAIL LOUD rather than write: a watermark behind the mark or past the window
     is the double-pay direction (the fence would refuse it too). */
  if (!(settledTo >= watermarkMs && settledTo <= toMs)) {
    throw new Error(`artisan tick: watermark ${new Date(settledTo).toISOString()} outside `
      + `[${new Date(watermarkMs).toISOString()}, ${new Date(toMs).toISOString()}]`);
  }
  /* A window shorter than one action moved nothing and stopped nothing: the
     mark stays, the next fire's longer window pays it. */
  if (settledTo === watermarkMs) return done();

  intents.push(writeIntent(
    { userId: char.userId, slot: char.slot, shard, version, holder: o.holder ?? null },
    res.delta, watermarkMs, settledTo));
  advance(char, res);
  watermarkMs = settledTo;
  return done();
}

/* THE ONE SETTLE A WINDOW BECOMES. The delta is the engine's, verbatim, plus the
   tick's journal marker; `accrued_to` (the window's end) is the instant the
   engine stamped, which the fence requires to equal `p_window_to`. The intent
   key is tick-gather.js's (user, slot, window, version) derivation, so a replay
   of this window is the same key and a re-derivation after a conflict is not. */
export function writeIntent(who, delta, windowFromMs, windowToMs) {
  const d = { ...delta };
  const j = d.journal || {};
  d.journal = { ...j, meta: { ...(j.meta || {}), src: 'tick' } };
  d.accrued_to = new Date(windowToMs).toISOString();
  return {
    rpc: 'hr_tick_settle',
    args: {
      p_holder: who.holder ?? null,
      p_user: who.userId,
      p_slot: who.slot,
      p_channel: CHANNEL,
      p_version: who.version,
      p_window_from: new Date(windowFromMs).toISOString(),
      p_window_to: new Date(windowToMs).toISOString(),
      p_intent_id: tickIntentId(who.shard, who.userId, who.slot, windowFromMs, windowToMs, who.version),
      p_delta: d,
    },
    seq: 0,
    rehydrateBefore: false,
    window: { fromMs: windowFromMs, toMs: windowToMs, ms: windowToMs - windowFromMs },
    wroteAnything: false,
  };
}
