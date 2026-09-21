// ============================================================================
// services/world-tick/gather.js — THE GATHER CHANNEL, end to end, IN SHADOW.
//
// Step 2 PREPARATION (2026-09-18). Decision on record, WORLD_TICK_DESIGN.md
// §15a: the first tick-owned channel is GATHER, because it is the only payable
// kind that already flows through `computeAccrual` → `hr_apply` with the
// simplest state (a watermark and `tool_carry`; no `fight` checkpoint, no
// `consec_falls`, no recovery clock, no auto-eat, no rare drop roll) and whose
// client surface is a progress bar rather than an inventory fold — so it can be
// tick-owned BEFORE the inventory ABSOLUTE flip that blocks combat (§7a).
//
// ── WHAT THIS FILE IS AND IS NOT ────────────────────────────────────────────
// It is NOT an engine. Every number comes out of `computeAccrual`, which runs
// `src/core/skill-sim.js` — the same function the Edge Function runs and the
// same one the client's away replay runs (AWAY-12: a second path is forbidden).
// This file decides only WHEN to call it, what to carry between calls, and what
// ONE `hr_apply` intent a batch of calls collapses into.
//
// It writes NOTHING. There is no Supabase client here, no `fetch`, no socket,
// no service-role key, no `node:fs` write. `settleGatherSession` returns write
// INTENTS — plain objects naming the RPC and its arguments — which step 2 hands
// to a client and this step prints and throws away.
//
// ── THE THREE RULES THAT MAKE A TICK EQUAL AN ACCRUAL ───────────────────────
//
// 1. CHAIN ON THE ENGINE'S OWN WATERMARK, NEVER ON THE WALL CLOCK.
//    Every call is "from my watermark to now", exactly as `hr-accrue/index.ts`
//    builds it from `player_state.accrued_to`. The engine answers with
//    `delta.accrued_to` — the instant it actually ACCOUNTED for — and that
//    becomes the next call's `accruedToMs`. The sub-action remainder is left
//    unsettled, not forfeited, and the next cadence pays for it. This is why
//    `caller:'tick'` exists (accrual.js `accrualCaller`, 2026-09-18): a tick is
//    exempt from the min-span floor like a `collect`, but unlike a `collect`
//    its remainder is DEFERRABLE, because the tick's next window is coming.
//    Under the borrowed `'collect'` spelling the measured forfeit was
//    2.0–7.8% of a ten-minute span, in the under-paying direction (§15a).
//
// 2. THE WALL CLOCK ONLY DRIVES THE POLL, NEVER THE WATERMARK.
//    `clock` advances by the cadence; `watermark` advances only by what the
//    engine settled. Conflating the two is the double-pay (`rewind`) and the
//    carry-loss (`unaligned`) mutants in tests/world-tick-parity.mjs.
//
// 3. THE WRITE UNIT IS THE SETTLED WINDOW, NEVER THE TICK.
//    Reliability measured it on the live database (§15a): `player_ledger` costs
//    407 B/row and `hr_ledger_prune(20000)` hourly deletes at most 480,000
//    rows/day. Journalling per 10 s tick goes unbounded from ~56 continuously
//    active characters. So ticks accumulate IN MEMORY and one `hr_apply` intent
//    is emitted per FLUSH window, carrying one journal row whose shape is
//    byte-identical to an ordinary `kind:'gather'` accrue row except for a
//    `src:'tick'` marker.
//
// PURE ESM, Node + Deno. No `?v=` (not under src/**).
// ============================================================================

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { ITEMS } from '../../src/data/items.js';
import { GATHER_NODES } from '../../supabase/functions/hr-accrue/catalogue.js';
import { PAYABLE_KINDS } from '../../supabase/functions/hr-accrue/accrual.js';
import { shadowTick, advance, hydrate } from './shadow.js';
import { foldDeltas } from './contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/* The catalogues a gather window needs, from the SAME modules the edge imports.
   `GATHER_NODES` comes off `hr-accrue/catalogue.js`, which is generated from
   `src/data/gathering.js` — never a second copy (CLAUDE.md §1). */
export const GATHER_CATALOGUES = Object.freeze({
  items: ITEMS,
  monsters: {},                 // a gather window never reads the bestiary
  nodes: GATHER_NODES,
});

export const CHANNEL = 'gather';

/* The tick may only ever be pointed at a kind the ENGINE calls payable. Read
   from accrual.js, not retyped — the drift guard §2 asks for. */
if (!PAYABLE_KINDS.includes(CHANNEL)) {
  throw new Error(`gather.js: "${CHANNEL}" is not in accrual.js PAYABLE_KINDS`);
}

/* ── CONFIG (environment in production; §9 "cadence is config, not code") ──── */
export const DEFAULT_CADENCE_MS = 10000;   // how often the engine is asked
/* How often a settled batch becomes ONE hr_apply call. 90 s is Reliability's
   measured line (§15a): at 500 continuously-active characters a 90 s flush is
   480,000 ledger rows/day, exactly the prune ceiling, and a 10 s flush is 9×
   over it. Lowering this for the beta is a decision with a rows/day number
   attached, never a convenience. */
export const DEFAULT_FLUSH_MS = 90000;

// ═══════════════════════════════════════════════════════════════════════════
// SESSIONS — where the active set comes from
// ═══════════════════════════════════════════════════════════════════════════

/* THE PRODUCTION SHAPE. One roster row (`hr_tick_roster`, the one new RPC) plus
   its `hr_state_of` envelope becomes the in-memory session the loop carries.
   Every field is named here so a reviewer can answer "what can the client
   influence?" from one function — the same discipline `computeAccrual`'s input
   object enforces. NOTHING here is read from a request body: the roster is
   server rows and the clock is `now()`.

   `version` is load-bearing and is NOT a game value: it is
   `player_state.version`, the number `hr_apply` refuses a stale copy of and the
   number §7.1 makes the push frame. The tick never invents one. */
export function sessionFromRoster(row, envelope) {
  const st = envelope || {};
  if (row.active_kind !== CHANNEL) {
    throw new Error(`sessionFromRoster: kind "${row.active_kind}" is not ${CHANNEL}`);
  }
  return {
    userId: row.user_id,
    slot: row.slot,
    shard: Number(row.shard || 0),
    version: Number(row.version),
    activeKind: CHANNEL,
    activeId: row.active_id,
    activeSinceMs: Date.parse(row.active_since),
    accruedToMs: Date.parse(row.accrued_to),
    capMs: row.cap_ms == null ? undefined : Number(row.cap_ms),
    hp: st.hp, maxHp: st.max_hp, gold: st.gold,
    skills: st.skills || {},
    inventory: st.inventory || {},
    equipment: st.equipment || {},
    perks: st.perks,
    buffs: st.buffs,
    goals: st.goals,
    /* null means "the column does not exist for this character" and MUST stay
       null — emitting `tool_carry` against an hr_apply that does not implement
       it is `unknown_delta_key`, a 409 that costs the window (accrual.js). */
    toolCarry: st.tool_carry == null ? null : st.tool_carry,
  };
}

/* THE OFFLINE SHAPE. Fixtures, for the parity guard and for a run with no
   credentials. Validated against the real catalogues on load, for the reason
   fixtures.js states: a fixture naming a node the game no longer contains does
   not still test the engine. */
export function loadGatherSessions(file) {
  const path = file || join(HERE, 'fixtures', 'gather-sessions.json');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const problems = [];
  for (const s of raw.sessions) {
    if (!Object.prototype.hasOwnProperty.call(GATHER_NODES, s.activeId)) {
      problems.push(`session "${s.name}": node "${s.activeId}" is not in the gather index`);
    }
    for (const id of Object.keys(s.inventory || {})) {
      if (!Object.prototype.hasOwnProperty.call(ITEMS, id)) {
        problems.push(`session "${s.name}": inventory item "${id}" is not in src/data/items.js`);
      }
    }
    for (const slot of Object.keys(s.equipment || {})) {
      if (!Object.prototype.hasOwnProperty.call(ITEMS, s.equipment[slot])) {
        problems.push(`session "${s.name}": equipment ${slot}="${s.equipment[slot]}" is not in src/data/items.js`);
      }
    }
  }
  if (problems.length) throw new Error('gather fixture drift against src/data:\n  - ' + problems.join('\n  - '));
  return raw.sessions;
}

/* Resolve relative offsets against a scenario start, as fixtures.js does. */
export function atSpan(session, fromMs) {
  const s = JSON.parse(JSON.stringify(session));
  s.activeKind = CHANNEL;
  s.activeSinceMs = fromMs + Number(s.activeSinceOffsetMs || 0);
  s.accruedToMs = fromMs;
  delete s.activeSinceOffsetMs;
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE LOOP
// ═══════════════════════════════════════════════════════════════════════════

/* One poll. `from` is the SESSION'S WATERMARK — never the previous clock tick.
   Returns the engine's answer verbatim; this function adds nothing to it. */
export function gatherTick(char, watermarkMs, nowMs, opts) {
  return shadowTick(char, watermarkMs, nowMs, GATHER_CATALOGUES,
    Object.assign({ caller: 'tick' }, opts || {}));
}

/* Settle `[fromMs, toMs]` as a chain of cadence polls, folding each flush
   window into ONE write intent.

   Returns { intents, results, char, watermarkMs, unsettledMs }.
     intents      what step 2 hands to hr_apply. Nothing is written here.
     unsettledMs  time the engine has NOT yet accounted for. It is OWED, not
                  lost: the next call's watermark is `watermarkMs`, so it is
                  paid by the following poll. P-G3 asserts it is always under
                  one action interval. */
export function settleGatherSession(session0, fromMs, toMs, opts) {
  const o = opts || {};
  const cadenceMs = Math.max(1, Math.floor(o.cadenceMs || DEFAULT_CADENCE_MS));
  const flushMs = Math.max(cadenceMs, Math.floor(o.flushMs || DEFAULT_FLUSH_MS));
  const char = hydrate(session0);
  const shard = Number(session0.shard || 0);
  /* The version the tick HYDRATED at. hr_apply refuses a stale one; on refusal
     the tick rehydrates and re-plans from the NEW accrued_to — it never retries
     the old delta (§10). The intent carries this value and nothing derives a
     successor locally. */
  let version = Number(session0.version);

  let watermarkMs = Number(session0.accruedToMs || fromMs);
  let clock = fromMs;
  const results = [];
  const intents = [];

  /* The batch being accumulated in memory. Rule 3: ticks fold, writes flush. */
  let batch = null;
  const openBatch = (wmMs, clockMs) => ({ fromMs: wmMs, toMs: wmMs, openedAtMs: clockMs, deltas: [], metas: [], polls: 0, settled: 0 });
  const closeBatch = (clockMs, closedBy) => {
    if (!batch || batch.settled === 0) { batch = null; return; }
    const intent = writeIntent(
      { userId: char.userId, slot: char.slot, shard, version, holder: o.holder ?? null },
      batch.deltas, batch.metas, batch.fromMs, batch.toMs, intents.length);
    /* `closedBy` and `clockMs` are OPERATOR metadata and are never sent. They
       exist because the row RATE is a property of the CLOCK (the flush period)
       while the journal window is a property of the WATERMARK, which lags it by
       up to one action interval — so extrapolating rows/day from window
       durations over-states the write rate by a few percent. The capacity claim
       (P-G3) must be made on the clock. */
    intent.window.clockMs = Math.max(0, clockMs - batch.openedAtMs);
    intent.window.closedBy = closedBy;
    intents.push(intent);
    batch = null;
  };

  batch = openBatch(watermarkMs, fromMs);
  let flushDue = fromMs + flushMs;

  while (clock < toMs) {
    clock = Math.min(clock + cadenceMs, toMs);
    /* RULE 1 + RULE 2. The window is watermark → clock, and only the engine's
       answer may move the watermark. */
    const res = gatherTick(char, watermarkMs, clock, o);
    results.push({ watermarkMs, nowMs: clock, res });
    batch.polls++;
    if (res.accrued) {
      const settledTo = Date.parse(res.delta.accrued_to);
      /* FAIL LOUD rather than write. A watermark that moved backwards or past
         `now` is the double-pay direction and must never reach hr_apply — which
         would refuse it by clamping into [old, now()], but a tick that can
         propose it has a bug the clamp is hiding. */
      if (!(settledTo >= watermarkMs && settledTo <= clock)) {
        throw new Error(`gather tick: watermark ${new Date(settledTo).toISOString()} outside [${new Date(watermarkMs).toISOString()}, ${new Date(clock).toISOString()}]`);
      }
      batch.deltas.push(res.delta);
      if (res.delta.journal && res.delta.journal.meta) batch.metas.push(res.delta.journal.meta);
      batch.settled++;
      batch.toMs = settledTo;
      advance(char, res);
      watermarkMs = settledTo;
    }
    if (clock >= flushDue || clock >= toMs) {
      closeBatch(clock, clock >= flushDue ? 'flush' : 'end');
      batch = openBatch(watermarkMs, clock);
      flushDue = clock + flushMs;
    }
  }
  closeBatch(clock, 'end');

  return {
    intents, results, char, watermarkMs,
    unsettledMs: Math.max(0, toMs - watermarkMs),
    polls: results.length,
    settled: results.filter((r) => r.res.accrued).length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE WRITE INTENT — the tick as "just another server-side caller"
// ═══════════════════════════════════════════════════════════════════════════

/* THE IDEMPOTENCY KEY (§10), CORRECTED 2026-09-21 (Security S-3).
   `tick:<shard>:<user>:<slot>:<windowFromMs>:<windowToMs>:<version>`, hashed
   into a UUID because `hr_apply`'s fourth argument is `uuid`.

   ⚠ THE OLD SPELLING OMITTED `version` AND THE WINDOW END, AND THE HEADER IT
     CARRIED WAS WRONG. It claimed the watermark was a second, independent
     defence: "hr_apply clamps accrued_to into [old, now()], so a replayed
     window is also refused on arithmetic even if the key were lost". Security
     executed that and it is FALSE — hr_apply clamps the TIMESTAMP and applies
     the VALUE regardless, so a replayed window carrying a fresh version paid
     twice and moved the watermark zero milliseconds:

         replayed window  ok=true  gold=100 -> 200  ver=3
         accrued_to moved? NO

     So there was ONE defence, not two, and the tick's key was the weaker of the
     two available spellings: the accrual engine's own key is derived from
     (user, slot, watermark, VERSION, salt) precisely so that a re-derivation
     after a conflict is a NEW key rather than a replay of a stale one.

   The key now includes both terms, and the defence the header wrongly claimed
   now genuinely exists — in SQL, under the row lock, in `hr_tick_settle`:

         select ... from player_state ... for update;          -- lock FIRST
         if p_window_from < v_st.accrued_to then                -- then the CAS
           return 'window_already_settled';

   (2026-09-21-world-tick-settle-fence.sql §3 (6); self-check e10/e16.)
   Three independent defences now: this key, hr_apply's version CAS, and the
   watermark CAS — which needs neither of the others. */
export function tickIntentId(shard, userId, slot, windowFromMs, windowToMs, version) {
  const label = `tick:${shard}:${userId}:${slot}:${Math.floor(windowFromMs)}`
    + `:${Math.floor(Number(windowToMs) || 0)}:${Number(version) || 0}`;
  const h = createHash('sha1').update('hearthrise:world-tick:v1\n' + label).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;                 // version 5
  b[8] = (b[8] & 0x3f) | 0x80;                 // RFC 4122 variant
  const s = b.toString('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/* Fold a flush window's per-poll journal metas into ONE gather journal row.

   THE SHAPE IS NOT NEGOTIABLE. It is `accrueGather`'s own meta — `ms, ticks,
   qty, capped, node, skill, w?, from, to` — because a player's ledger must not
   be able to tell a tick from an accrue. The ONE addition is `src:'tick'`, and
   it exists so an operator CAN tell, which is the opposite requirement and the
   reason it is a marker rather than a different shape.

   Every term is an AGGREGATE, never a per-action list: a 24 h woodcutting night
   is ~27,000 actions and `game_events` already proved what per-action
   journalling costs (1.6M rows / 229 MB from six players in four days). */
export function foldGatherMeta(metas, windowFromMs, windowToMs) {
  const out = {
    ms: 0, ticks: 0, qty: 0, capped: false,
    node: null, skill: null,
  };
  let waste = [0, 0];
  for (const m of metas) {
    out.ticks += Number(m.ticks || 0);
    out.qty += Number(m.qty || 0);
    out.capped = out.capped || !!m.capped;
    /* `node`/`skill` are the POINTER, not a sum. A flush window whose pointer
       changed mid-way is a bug in the caller, not something to average: the
       activity switch settles and closes the batch (see the state machine in
       WORLD_TICK_DESIGN.md §15b). Assert rather than silently keep the last. */
    if (out.node === null) { out.node = m.node ?? null; out.skill = m.skill ?? null; }
    else if ((m.node ?? null) !== out.node) {
      throw new Error(`foldGatherMeta: pointer changed inside one flush window (${out.node} -> ${m.node}); the batch must close on a switch`);
    }
    if (m.w) {
      const [r, i] = String(m.w).split(',').map((n) => Number(n) || 0);
      waste = [waste[0] + r, waste[1] + i];
    }
  }
  /* `capped` stays a boolean and is ALWAYS present, because accrueGather always
     emits it. Dropping it when false would make a tick row distinguishable from
     an accrue row by key count, which is the one thing the shape rule forbids
     (and tests/accrual-engine.mjs SHAPE is an allowlist plus a length bound). */
  out.capped = !!out.capped;
  /* `w` — recoverMs,idleMs, the comma-joined scalar landed 2026-09-18. Summed,
     and omitted entirely when both terms are zero, exactly as accrueGather
     omits it. A nested value would be refused by artisan-accrual T7. */
  if (waste[0] || waste[1]) out.w = `${waste[0]},${waste[1]}`;
  /* ⚠ `ms` IS RESTATED FROM THE WATERMARK, NOT SUMMED FROM THE POLLS, and this
     is the one place a fold could quietly lie to a player's receipt. Each poll
     is asked "from my watermark to now", so a poll's own `grantMs` INCLUDES the
     sub-action tail the previous poll deferred. Summing them re-counts every
     tail: measured on the three fixtures at a 10 s cadence the sum is
     732000 / 761440 / 784560 ms for a 600000 ms span — up to +31%, in the
     OVER-stating direction, on a number the away receipt shows as "time
     credited". The honest value is the span the watermark actually moved, which
     is the batch's own window, and `accrued_to` agrees with it by construction.
     Guard: P-G5. */
  out.ms = Math.max(0, Math.floor(windowToMs - windowFromMs));
  out.from = new Date(windowFromMs).toISOString();
  out.to = new Date(windowToMs).toISOString();
  /* THE ONLY DIFFERENCE FROM AN ACCRUE ROW. */
  out.src = 'tick';
  return out;
}

/* Build the ONE settle call a flush window collapses into.

   THE RPC LIST, as fenced 2026-09-21 (Security S-1/S-3/S-7):
     hr_tick_roster(kinds, shard, limit, holder, lease_ms, cursor)
                                          the active set + the lease. hr_tick ONLY.
     hr_seed(user, slot, 'accrue:'||accrued_to)   the per-window PRNG label.
     hr_state_of(user, slot)              hydration, the client's own projection.
     hr_tick_settle(holder, user, slot, channel, version, window_from,
                    window_to, intent, delta)     THE DOOR. hr_engine ONLY.

   ⚠ THE LAST ONE IS NOT `hr_apply` ANY MORE, AND THAT IS THE POINT. The tick
     does not hold raw hr_apply: `hr_tick_settle` is a SECURITY DEFINER fence
     that takes the player_state row lock, refuses a character the roster has
     not leased to THIS holder, compare-and-sets the settled watermark, honours
     the kill switch and the SHADOW flag — and only then calls `hr_apply`,
     verbatim, as the role the Edge Function already carries.

   Still no second writer, no fast path and no tick-specific clamp: hr_apply
   re-validates every invariant regardless of caller. The fence adds refusals;
   it adds no arithmetic. */
export function writeIntent(who, deltas, metas, windowFromMs, windowToMs, seq) {
  const folded = foldDeltas(deltas);
  /* `journal` is excluded by foldDeltas on purpose (each poll carried its own)
     and is restated here as the single row the flush writes. */
  folded.journal = {
    kind: CHANNEL,
    intent: 'accrue',
    meta: foldGatherMeta(metas, windowFromMs, windowToMs),
  };
  /* The watermark the batch ends on IS the last poll's `accrued_to`. Restated
     from the batch rather than recomputed, so the value hr_apply stores is the
     value the engine stamped. */
  folded.accrued_to = new Date(windowToMs).toISOString();
  /* ── S-6: INTENTS 2..N ARE STALE BY CONSTRUCTION, SO THEY CARRY NO VERSION.
     A call that settles several flush windows holds ONE hydration, so only the
     first intent's version can still be current: `hr_apply` bumps `version` on
     every accepted write, and the second intent computed from the same hydrate
     is therefore stale the moment the first one lands.

     The old code emitted all N carrying the hydration version. That is
     fail-closed (the database refuses them), but it is exactly the line a
     step-2 author "fixes" by substituting a fresh version — and doing that on a
     batch computed from the OLD watermark is S-3's double pay, with an
     honest-looking ledger row.

     So the later intents carry `p_version: null`, which `hr_apply` refuses
     outright (`p_version is null` -> version_conflict), plus an explicit
     `rehydrateBefore` contract naming what the caller must do instead. The
     failure mode is now "the tick cannot send this without rehydrating",
     not "the tick can send this if it invents a number". */
  const n = Number(seq) || 0;
  const rehydrateBefore = n > 0;
  return {
    rpc: 'hr_tick_settle',
    args: {
      p_holder: who.holder ?? null,
      p_user: who.userId,
      p_slot: who.slot,
      p_channel: CHANNEL,
      p_version: rehydrateBefore ? null : who.version,
      p_window_from: new Date(windowFromMs).toISOString(),
      p_window_to: new Date(windowToMs).toISOString(),
      p_intent_id: tickIntentId(who.shard, who.userId, who.slot, windowFromMs,
        windowToMs, rehydrateBefore ? null : who.version),
      p_delta: folded,
    },
    /* Operator metadata; NOT sent. */
    seq: n,
    rehydrateBefore,
    window: { fromMs: windowFromMs, toMs: windowToMs, ms: windowToMs - windowFromMs },
    wroteAnything: false,
  };
}

/* The value a shadow run is compared on. Deliberately not the whole intent:
   the idempotency key is a function of the window, not of the value, and the
   version is a concurrency token. Everything a player can SPEND or RANK is
   here. */
export function intentValue(intents) {
  const xp = {}; const items = {}; let gold = 0; let qty = 0; let ticks = 0; let ms = 0;
  for (const it of intents) {
    const d = it.args.p_delta;
    gold += Number(d.gold || 0);
    for (const k of Object.keys(d.xp || {})) xp[k] = (xp[k] || 0) + Number(d.xp[k] || 0);
    for (const k of Object.keys(d.items || {})) items[k] = (items[k] || 0) + Number(d.items[k] || 0);
    qty += Number(d.journal.meta.qty || 0);
    ticks += Number(d.journal.meta.ticks || 0);
    ms += Number(d.journal.meta.ms || 0);
  }
  return { gold, xp: sorted(xp), items: sorted(items), qty, ticks, ms, rows: intents.length };
}

function sorted(m) {
  const out = {};
  for (const k of Object.keys(m).sort()) out[k] = m[k];
  return out;
}
