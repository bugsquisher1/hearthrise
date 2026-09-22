// ============================================================================
// services/world-tick/combat.js — THE COMBAT CHANNEL, end to end. MILESTONE 3.
//
// Decision on record, WORLD_TICK_DESIGN.md §16: combat is the tick's THIRD
// channel and the hard one. Gather (§15a/§15b) was chosen first because it is
// the simplest payable kind — a watermark and `tool_carry`, no `fight`
// checkpoint, no `consec_falls`, no recovery clock, no auto-eat, no rare roll.
// Combat is every one of those at once, plus the only drop tables in the game.
//
// ── WHAT THIS FILE IS AND IS NOT ────────────────────────────────────────────
// It is NOT an engine. Every number comes out of `computeAccrual`, which runs
// `src/core/combat-sim.js` — the same function the Edge Function runs, the same
// one the client's live tick runs, and the same one the away replay runs
// (AWAY-1 parity; AWAY-12 forbids a second path). This file decides only WHEN
// to call it, what to carry between calls, and what ONE `hr_tick_settle` intent
// a batch of calls collapses into.
//
// It writes NOTHING. No Supabase client, no `fetch`, no socket, no
// service-role key, no `node:fs` write. `settleCombatSession` returns write
// INTENTS — plain objects naming the RPC and its arguments — which a later step
// hands to a client and this one prints and throws away.
//
// ── WHERE THIS FILE WILL LIVE, AND WHY IT IS HERE TODAY ─────────────────────
// `tick-gather.js` lives in `supabase/functions/hr-accrue/` because the
// `op:'tick'` entry RUNS it, and `tools/pack-edge.mjs` can only vendor from
// `src/core`, `src/data` and the function directory — so a module under
// `services/` is unreachable from an edge payload. `services/world-tick/
// gather.js` is a re-export of it for exactly that reason.
//
// The combat entry does not exist yet: `supabase/functions/hr-accrue/tick.js`
// speaks gather only, and it is itself under an open Security review
// (SEC_WORLD_TICK_M1_2026-09-21.md, verdict BLOCK on three expressions). So
// THIS FILE is not in the payload. (`tick-shadow.js` IS, and the eleven-input
// change there moves `pack-edge --hash` off the 253215e4… the verdict names —
// see WORLD_TICK_DESIGN.md §16.10; this file is not the reason.) When
// the entry learns the combat channel it MOVES to
// `supabase/functions/hr-accrue/tick-combat.js` and this file becomes a
// re-export, exactly as gather did on 2026-09-21.
//
// That is a MOVE, never a copy. There is one copy today and there must be one
// copy after the move: a second combat path is what AWAY-12 forbids, and the
// drift would be silent — the offline guards would keep measuring a file the
// deployed function no longer runs.
//
// ── THE THREE RULES ARE GATHER'S, UNCHANGED ─────────────────────────────────
// 1. CHAIN ON THE ENGINE'S OWN WATERMARK, NEVER ON THE WALL CLOCK. Every call
//    is "from my watermark to now"; `delta.accrued_to` is the instant the
//    engine ACCOUNTED for and becomes the next call's `accruedToMs`. Measured
//    on the gather fixtures: the naive wall-clock chain forfeits 45% of a
//    session (P-G8).
// 2. THE WALL CLOCK ONLY DRIVES THE POLL, NEVER THE WATERMARK.
// 3. THE WRITE UNIT IS THE SETTLED WINDOW, NEVER THE TICK. `player_ledger`
//    costs 407 B/row and `hr_ledger_prune(20000)` hourly deletes at most
//    480,000 rows/day, SHARED by every writer in the game. Combat gets no
//    exemption from that arithmetic (§15a, §15c M-6).
//
// ── WHAT COMBAT ADDS, AND IT IS THE POINT OF THE MILESTONE ──────────────────
// · ELEVEN MORE ENGINE INPUTS (`tick-shadow.js`, the combat block). Two were
//   measured to move a ten-minute window: auto-eat absent is -65.0% gold and
//   -62.5% xp; the death counters absent hands a six-times-dead character the
//   first-death novice grace, which runs in the PAYING direction.
// · THREE PER-CALL CLAMPS THE FOLD MUST RE-CHECK, all of which bite on
//   ordinary play: `progress` (measured 69 ops against hr_apply's cap of 64,
//   on three of four fixtures), `hearthfind` (the fold produces an ARRAY
//   hr_apply refuses), and `deaths`
//   (MAX_DEATH_ROWS, per apply and not per window).
// · THE ATTENDED TOP-UP, WHICH CANNOT BE DECOMPOSED AND IS THEREFORE REFUSED.
// · A SEED LABEL THAT MUST BE THE ENVELOPE'S OWN RENDERING (Security T-2).
//
// Read WORLD_TICK_DESIGN.md §16 before changing anything below; every rule
// here is there with the measurement that motivated it.
//
// PURE ESM, Node + Deno. No `?v=` (not under src/**).
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { hashSeed } from '../../src/core/rng.js';
import { ITEMS } from '../../src/data/items.js';
import { MONSTERS } from '../../src/data/monsters.js';
import { PAYABLE_KINDS, MAX_DEATH_ROWS } from '../../supabase/functions/hr-accrue/accrual.js';
import { shadowTick, advance, hydrate } from '../../supabase/functions/hr-accrue/tick-shadow.js';
import { foldDeltas } from '../../supabase/functions/hr-accrue/tick-contract.js';
/* THE IDEMPOTENCY KEY, IMPORTED AND NOT RE-SPELLED. `tickIntentId` is
   channel-agnostic by construction — `tick:<shard>:<user>:<slot>:<from>:<to>:
   <version>` — and it is the weaker-spelling trap Security's S-3 closed once
   already. One copy means a channel cannot drift into a weaker key. Its home
   moves to tick-contract.js the day combat's production half lands beside
   gather's; until then importing it is the single copy. */
import { tickIntentId } from '../../supabase/functions/hr-accrue/tick-gather.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/* The catalogues a combat window needs, from the SAME modules the edge imports
   (`hr-accrue/index.ts` :104-105). `nodes` is deliberately absent: a combat
   window never reads the gather index, and passing an empty object would be a
   second, wrong statement of that. */
export const COMBAT_CATALOGUES = Object.freeze({
  items: ITEMS,
  monsters: MONSTERS,
});

export const CHANNEL = 'combat';

/* The tick may only ever be pointed at a kind the ENGINE calls payable. Read
   from accrual.js, not retyped — the drift guard CLAUDE.md §2 asks for. */
if (!PAYABLE_KINDS.includes(CHANNEL)) {
  throw new Error(`combat.js: "${CHANNEL}" is not in accrual.js PAYABLE_KINDS`);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG — environment in production (§9 "cadence is config, not code")
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_CADENCE_MS = 10000;   // how often the engine is asked
/* How often a settled batch becomes ONE hr_tick_settle call. 90 s is
   Reliability's measured line and it is `hr_tick_config.flush_seconds`'s
   default, CHECKed `>= cadence_seconds`. Lowering it for the beta is a
   decision with a rows/day number attached, never a convenience. */
export const DEFAULT_FLUSH_MS = 90000;

/* hr_apply's own per-call bounds, RESTATED FROM THE MIGRATION THAT DECLARES
   THEM so the fold re-checks the number the database will actually apply.
   `c_max_progress_ops constant int := 64` and
   `c_max_death_rows constant int := 24` — 2026-09-14-hr-apply-restatement.sql
   :316/:502. `MAX_DEATH_ROWS` comes off accrual.js, which is the engine's own
   copy of the second one; the guard asserts the two agree. */
export const MAX_PROGRESS_OPS = 64;

// ═══════════════════════════════════════════════════════════════════════════
// SESSIONS — where the active set comes from
// ═══════════════════════════════════════════════════════════════════════════

/* ── THE SEED LABEL. THE ENVELOPE'S OWN RENDERING, NEVER A `Date` ───────────
   SECURITY FINDING T-2 (SEC_WORLD_TICK_M1_2026-09-21.md, P0, BLOCKS SHADOW).
   `hr_seed(user, slot, label)` hashes the LABEL, and three places spelled one
   window's label three ways:

     accrue path  'accrue:' + String(st.accrued_to)   -> …739123+00:00
     tick.js:380  'accrue:' + new Date(ms).toISOString()  -> …739Z
     roster :507  'accrue:' || to_char(…,'…MS"Z"')        -> …739Z

   Executed, `hr_seed` over the first two returns -1921344458354348381 and
   7953584315518101330. `Z` versus `+00:00`, and milliseconds versus
   microseconds, are two different RNG streams.

   For gather that costs the measurement. For COMBAT it costs every drop roll,
   every crit and every gold roll — combat is the only channel with rare drop
   tables — so a 48 h shadow read would diverge from what accrual paid BY
   CONSTRUCTION, and the natural reading of that is "the tick is wrong".

   The accrue path is the incumbent with 200 days of live seeds behind it, so
   it is the one that must not move. This function therefore takes the
   watermark's STRING as `hr_state_of` rendered it and takes no Date, no number
   and no format argument — there is nothing here to spell wrongly. */
export function seedLabelFor(accruedToText) {
  if (typeof accruedToText !== 'string' || accruedToText.length === 0) {
    throw new Error('seedLabelFor: the watermark must be the envelope\'s own '
      + 'rendering of accrued_to (a string). Deriving it from a Date is '
      + 'Security finding T-2 — two spellings, two RNG streams.');
  }
  return 'accrue:' + accruedToText;
}

/* THE PRODUCTION SHAPE. One roster row (`hr_tick_roster`) plus its
   `hr_state_of` envelope becomes the in-memory session the loop carries. Every
   field is named here so a reviewer can answer "what can the client influence?"
   from one function. NOTHING is read from a request body: the roster is server
   rows and the clock is `now()`.

   `version` is load-bearing and is NOT a game value: it is
   `player_state.version`, the number `hr_apply` refuses a stale copy of and the
   number §7.1 makes the push frame. The tick never invents one.

   ⚠ THE BLOCK MARKED "COMBAT" IS THE MILESTONE. Each of those keys is a column
     `hr-accrue/index.ts` reads inside the transaction hr_apply locks, and each
     one this function forgot would be a silent divergence — see the two
     measurements in tick-shadow.js's combat block. `undefined` is the
     self-configuring "this database does not have the column" that every other
     input in this system uses; it is NOT a safe default for the auto-eat trio
     or the death counters, which is why C1 asserts the key set structurally
     rather than trusting this function to stay complete. */
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
    /* T-2. The STRING, kept beside the number, because the label is spelled
       from the string and the window is planned from the number. */
    accruedToText: row.accrued_to,
    capMs: row.cap_ms == null ? undefined : Number(row.cap_ms),
    hp: st.hp, maxHp: st.max_hp, gold: st.gold,
    skills: st.skills || {},
    inventory: st.inventory || {},
    equipment: st.equipment || {},
    perks: st.perks,
    buffs: st.buffs,
    goals: st.goals,
    bestiaryKills: st.bestiary_kills,
    // ── COMBAT ──────────────────────────────────────────────────────────────
    /* The end-of-window checkpoints. `null` means the column does not exist on
       this database and the engine must then OMIT the key — an unknown delta
       key is a 409 that costs the whole window. */
    fight: st.fight == null ? null : st.fight,
    consecFalls: st.consec_falls == null ? null : Number(st.consec_falls),
    recoveringUntilMs: st.recovering_until == null
      ? null : Date.parse(st.recovering_until),
    ammoCarry: st.ammo_carry == null ? null : st.ammo_carry,
    /* AUTO-EAT. Without these three the server never heals, the character dies
       early and the night stops paying: measured -65.0% gold and -62.5% xp on
       one ten-minute window, which is `src/core/auto-eat.js`'s own -63%..-99%
       band arriving through the caller instead of through a missing handler.
       `auto_eat_enabled` is also the purchased-trait receipt, so nothing here
       defaults to true. */
    autoEatEnabled: st.auto_eat_enabled === true,
    autoEatFood: st.auto_eat_food ?? null,
    autoEatPct: Number(st.auto_eat_pct),
    /* THE RECOVERY LADDER'S INPUTS. `recoveryFor()` prices a fall from these
       two counters; omitted they read 0 and every fall is charged the
       FIRST-DEATH novice grace. Measured on a character with six deaths today:
       the accrue path charges 3,840,000 ms and the tick charged 0, then
       120,000. Less knockout time is more paying time, so this is a mint. */
    deathsTodayBefore: Number(st.deaths_today) || 0,
    deathsLifetimeBefore: Number(st.deaths_lifetime) || 0,
    /* The split against combat XP a live kill-credit already applied. Absent
       column -> 0 -> the split is inert and the window pays as it did. */
    combatXpAccruedToMs: st.combat_xp_accrued_to
      ? Date.parse(st.combat_xp_accrued_to) : 0,
    /* The self-configuring switch on whether `delta.hearthfind` may be
       proposed at all: a database that does not allowlist the key never sees
       one. */
    hearthfindReady: st.hearthfind_ready === true,
    enchant: st.enchant || {},
    combatStyle: st.combat_style ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE LOOP
// ═══════════════════════════════════════════════════════════════════════════

/* ── THE OFFLINE SEED, OVER THE ENVELOPE'S OWN LABEL ───────────────────────
   `tick-shadow.js` `seedFor` builds its label from `new Date(ms).toISOString()`
   — the `…Z` spelling — which is the WRONG one (T-2) and is the spelling the
   accrue path has never used. Combat cannot inherit it: this is the only
   channel with rare drop tables, so a mis-spelled label is every drop roll.

   THIS DEFECT WAS IN THIS FILE AND THE GUARD FOUND IT. `settleCombatSession`
   originally left `seedOf` unset when no production hook was supplied, so it
   fell through to `seedFor`'s Date path — and C14's value-conservation arm went
   red because the shipped loop and the guard's own chain drew two different
   streams for the same windows. That is T-2 reproduced in miniature, inside the
   module written to prevent it, which is the argument for the fence below: the
   label is now derived in ONE place, from the envelope's own string, and a
   session with no string is REFUSED rather than silently seeded from a Date.

   No secret here and none invented: production hands `settleCombatSession` a
   `seedOf` that calls `hr_seed`, which mixes the 256-bit secret. This
   reproduces the property under test (a distinct stream per watermark, labelled
   the accrue path's way) without the one it is not (unpredictability). */
export function offlineSeedFor(userId, slot, accruedToText) {
  return hashSeed(String(userId), String(slot), seedLabelFor(accruedToText));
}

/* One poll. `watermarkMs` is the SESSION'S WATERMARK — never the previous
   clock tick — and `watermarkText` is that same instant AS THE ENVELOPE
   RENDERED IT, because the seed label is spelled from the string and the window
   is planned from the number. Returns the engine's answer verbatim; this
   function adds nothing to it and subtracts nothing from it. */
export function combatTick(char, watermarkMs, watermarkText, nowMs, opts) {
  const o = opts || {};
  const seedOf = typeof o.seedOf === 'function'
    ? (wmMs) => o.seedOf(wmMs, watermarkText)
    : () => offlineSeedFor(char.userId, char.slot, watermarkText);
  return shadowTick(char, watermarkMs, nowMs, COMBAT_CATALOGUES,
    Object.assign({}, o, { caller: 'tick', seedOf }));
}

/* Settle `[fromMs, toMs]` as a chain of cadence polls, folding each flush
   window into ONE write intent.

   Returns { intents, results, char, watermarkMs, unsettledMs, polls, settled,
             stoppedBy }.
     intents      what a later step hands to hr_tick_settle. Nothing is written.
     unsettledMs  time the engine has NOT yet accounted for. It is OWED, not
                  lost: the next call's watermark is `watermarkMs`.
     stoppedBy    null, 'activity' (the pointer ended — a retreat, a stop, or a
                  monster the catalogue no longer holds), 'seed' (the seed
                  ladder ran out) or 'budget' (maxPolls). */
export function settleCombatSession(session0, fromMs, toMs, opts) {
  const o = opts || {};
  /* ── THE ATTENDED REFUSAL (WORLD_TICK_DESIGN.md 16.6) ────────────────────
     Every term of `min(claimed, attendedKillCap, MAX_FIDELITY x sim) - sim` is
     priced against the SPAN. Hand sixty windows the same claim and it is paid
     sixty times; split the claim and the arithmetic is undefined. There is no
     correct way for a 10 s window to carry an attended top-up.

     THROWN, not silently nulled, because a null that looks like an oversight
     is how this comes back as "someone forgot to plumb it". The under-pay it
     causes for a genuinely attended character is real and is a hard ARM
     blocker named in 16.10; in SHADOW it costs the parity read, which is
     partitioned on `meta.att` instead. */
  if (o.attended != null || session0.attended != null) {
    throw new Error('settleCombatSession: the tick cannot carry an attended '
      + 'top-up — every term of it is priced against the SPAN, so a decomposed '
      + 'window would pay it once per window (WORLD_TICK_DESIGN.md 16.6)');
  }
  const cadenceMs = Math.max(1, Math.floor(o.cadenceMs || DEFAULT_CADENCE_MS));
  const flushMs = Math.max(cadenceMs, Math.floor(o.flushMs || DEFAULT_FLUSH_MS));
  const char = hydrate(session0);
  const shard = Number(session0.shard || 0);
  /* The version the tick HYDRATED at. hr_apply refuses a stale one; on refusal
     the tick rehydrates and re-plans from the NEW accrued_to — it never retries
     the old delta (§10). */
  const version = Number(session0.version);

  let watermarkMs = Number(session0.accruedToMs || fromMs);
  /* ── T-2, ON THE CHAIN AND NOT ONLY ON THE FIRST WINDOW (Security S-1) ────
     The watermark's STRING. Window 1 carries the envelope's own rendering
     verbatim, because that string is the only thing that survives a watermark
     `hr_apply` clamped to a microsecond `now()` — `accruedToMs` has already
     lost those digits and no re-render can put them back.

     Windows 2..N are RE-RENDERED from the instant the engine settled to, in
     the accrue path's spelling. They are NOT chained from
     `res.delta.accrued_to`: accrual.js emits that as
     `new Date(settledTo).toISOString()`, the `…Z` spelling T-2 names, and
     `hr_seed` hashes the LABEL — so one instant became two streams and every
     window after the first drew rolls the accrue path never would. On the one
     channel with rare drop tables that is every drop roll, which is why the
     48 h parity read could not have been believed (WORLD_TICK_DESIGN.md
     §16.3). Re-rendering is exact here and only here: what the engine settles
     to is millisecond-precision by construction, so the accrue path's
     rendering of it has nothing left to truncate. */
  /* T-2, AS A PRECONDITION. A session with no rendered watermark cannot be
     labelled the accrue path's way, and the only other thing to label with is a
     Date — which is the defect. Refusing costs nothing: the watermark has not
     moved, so the next call pays the span. */
  let watermarkText = session0.accruedToText;
  if (typeof watermarkText !== 'string' || watermarkText.length === 0) {
    throw new Error('settleCombatSession: the session carries no `accruedToText` — the seed '
      + 'label must be the hr_state_of rendering of accrued_to, and there is nothing else '
      + 'to spell it from but a Date, which is Security finding T-2');
  }
  let clock = fromMs;
  const results = [];
  const intents = [];
  let stoppedBy = null;

  /* The batch being accumulated in memory. Rule 3: ticks fold, writes flush. */
  let batch = null;
  const openBatch = (wmMs, clockMs) => ({
    fromMs: wmMs, toMs: wmMs, openedAtMs: clockMs,
    deltas: [], metas: [], polls: 0, settled: 0,
  });
  const closeBatch = (clockMs, closedBy) => {
    if (!batch || batch.settled === 0) { batch = null; return; }
    const intent = writeIntent(
      { userId: char.userId, slot: char.slot, shard, version, holder: o.holder ?? null },
      batch.deltas, batch.metas, batch.fromMs, batch.toMs, intents.length);
    /* OPERATOR metadata, never sent. The row RATE is a property of the CLOCK
       (the flush period) while the journal window is a property of the
       WATERMARK, which lags it by up to one tick interval — so extrapolating
       rows/day from window durations over-states the write rate. */
    intent.window.clockMs = Math.max(0, clockMs - batch.openedAtMs);
    intent.window.closedBy = closedBy;
    intents.push(intent);
    batch = null;
  };

  batch = openBatch(watermarkMs, fromMs);
  let flushDue = fromMs + flushMs;

  /* BLAST RADIUS, not balance. A caller naming a wide span must not be able to
     spend unbounded engine time in one request; the remainder is OWED. */
  const maxPolls = Math.max(1, Math.floor(o.maxPolls || Infinity));

  while (clock < toMs) {
    if (results.length >= maxPolls) { stoppedBy = 'budget'; break; }
    /* THE SEED MUST BE IN HAND BEFORE THE ENGINE RUNS. `seedOf` is resolved
       against the WATERMARK, which is only known one window at a time, so a
       production caller pre-resolves a ladder of labels and this loop stops the
       moment it walks past the end of it. Stopping is free: the watermark has
       not moved, so the unsettled tail is paid by the next call. NEVER a
       fallback seed — a window silently simulated on a predictable stream is
       the `fixedSeed` mutant (+48% gold, three rare drops at rate zero), and
       on the one channel with rare drop tables that is the whole risk. */
    if (typeof o.seedOf === 'function' && o.seedOf(watermarkMs, watermarkText) == null) {
      stoppedBy = 'seed';
      break;
    }
    clock = Math.min(clock + cadenceMs, toMs);
    /* RULES 1 + 2. The window is watermark -> clock, and only the engine's
       answer may move the watermark. */
    const res = combatTick(char, watermarkMs, watermarkText, clock, o);
    results.push({ watermarkMs, nowMs: clock, res });
    batch.polls++;
    if (res.accrued) {
      const settledTo = Date.parse(res.delta.accrued_to);
      /* FAIL LOUD rather than write. A watermark that moved backwards or past
         `now` is the double-pay direction and must never reach the fence —
         which would refuse it, but a tick that can PROPOSE it has a bug the
         refusal is hiding. */
      if (!(settledTo >= watermarkMs && settledTo <= clock)) {
        throw new Error(`combat tick: watermark ${new Date(settledTo).toISOString()} outside `
          + `[${new Date(watermarkMs).toISOString()}, ${new Date(clock).toISOString()}]`);
      }
      batch.deltas.push(res.delta);
      if (res.delta.journal && res.delta.journal.meta) batch.metas.push(res.delta.journal.meta);
      batch.settled++;
      batch.toMs = settledTo;
      advance(char, res);
      watermarkMs = settledTo;
      /* THE SAME RENDERING `probeWatermark` CARRIES OUT OF THE FENCE, not the
         engine's ISO string (Security S-1). One instant, one label, one
         stream — for window 2 as for window 1. */
      watermarkText = pgTimestamptzText(settledTo);
      /* ── THE POINTER ENDED, SO THE SESSION ENDS (16.8 item 5) ────────────
         Gather's pointer only moves on a level stop. A combat pointer is idled
         by the engine itself on a RETREAT (Recovery rev. 3) and on a target the
         catalogue no longer holds — measured on a weak fixture: the hero pulls
         back and 58 of the next 60 windows refuse `no_activity`.

         The batch CLOSES here rather than folding across the boundary, for the
         reason `foldGatherMeta` throws on a pointer change: `delta.activity` is
         a complete, re-validated activity statement (hr_apply R11) and a flush
         window that spanned two pointers would journal one row about two runs.
         The character then leaves the roster on the next cadence, because
         `hr_tick_roster` joins on `player_state.active_kind`. */
      if (res.delta.activity) {
        stoppedBy = 'activity';
        closeBatch(clock, 'activity');
        break;
      }
    }
    if (clock >= flushDue || clock >= toMs) {
      closeBatch(clock, clock >= flushDue ? 'flush' : 'end');
      batch = openBatch(watermarkMs, clock);
      flushDue = clock + flushMs;
    }
  }
  closeBatch(clock, 'end');

  return {
    intents, results, char, watermarkMs, watermarkText, stoppedBy,
    unsettledMs: Math.max(0, toMs - watermarkMs),
    polls: results.length,
    settled: results.filter((r) => r.res.accrued).length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE FOLD — where combat is genuinely different from gather
// ═══════════════════════════════════════════════════════════════════════════

/* ── PROGRESS, FOLDED BY KEY. MEASURED 65 OPS AGAINST A CAP OF 64 ───────────
   A combat window files up to TEN progress ops — `stat:kills`, `stat:crits`,
   `stat:deaths` (lifetime), `stat:deaths` (UTC day), `stat:rare_drops`, the
   goal counters (`ev:kill_any`, `ev:kill_monster:<id>`, `ev:loot:<item>` …),
   the modal-goal daily rows, and a `flag:recipe:<id>` per scroll that dropped.
   Nine windows is one 90 s flush at the shipped 10 s cadence. Measured over an
   ordinary ten-minute goblin grind: 53 / 57 / 65 / 56 / 57 / 63 / 44 raw ops
   per flush, against `c_max_progress_ops constant int := 64`. The third one is
   `too_many_progress_ops`, which refuses the WHOLE flush window.

   THIS IS A FOLD, NOT A CLAMP, AND THE DISTINCTION IS THE PERMISSION.
   `hr_apply`'s own loop applies each op as `progress = progress + add` against
   a row keyed on exactly (kind, key, period_key), so summing identical keys
   before the call is arithmetically the same write. Measured across every
   flush above, `sum(add)` is preserved exactly (118/133/145/151/130/172/93,
   raw == folded). Folded: 7 / 10 / 14 / 7 / 10 / 10 / 10.

   `state` is part of the fold key, so a `done` is never summed into an
   `active` — the one value that gates a payout is `claimed` and a delta cannot
   set it at all, but a completion is still a different fact from a tick up.
   First-seen order is preserved, because hr_apply applies them in order and a
   reordered stream is a different (if equivalent) ledger to read. */
export function foldProgressOps(ops) {
  const byKey = new Map();
  const out = [];
  for (const op of ops || []) {
    const k = [op.kind, op.key, op.period ?? '', op.state ?? 'active'].join('\u0000');
    const hit = byKey.get(k);
    if (hit) { hit.add = Math.floor(Number(hit.add || 0)) + Math.floor(Number(op.add || 0)); continue; }
    const copy = { ...op, add: Math.floor(Number(op.add || 0)) };
    byKey.set(k, copy);
    out.push(copy);
  }
  return out;
}

/* ── HEARTHFIND: THE FOLD PRODUCES AN ARRAY AND hr_apply REFUSES IT ─────────
   `foldDeltas` classifies `hearthfind` as APPEND, so two windows that each
   rolled a find produce `hearthfind: [ {...}, {...} ]`. `hr_apply` (§4a-h)
   checks `jsonb_typeof` and answers `bad_hearthfind` — its own restatement
   says so: "the `hearthfind` key is an OBJECT, so the body structurally cannot
   see two". The whole flush would be refused.

   Collapsed to ONE find carrying `dropped`, which is the IDENTICAL rule
   accrual.js already applies WITHIN one window
   (`finds.length > 1 ? { ...finds[0], dropped } : finds[0]`). One rule,
   restated at the one place a second find can now appear; the discard is
   journalled by hr_apply as `hearthfind_span_discard` exactly as it is today.
   `dropped` accumulates the per-window discards too, so the count is the
   number thrown away and not the number of windows. */
export function collapseHearthfind(v) {
  if (v == null) return undefined;
  const list = Array.isArray(v) ? v.filter((x) => x != null) : [v];
  if (list.length === 0) return undefined;
  const carried = list.reduce((a, f) => a + Math.max(0, Math.floor(Number(f.dropped) || 0)), 0);
  const extra = carried + (list.length - 1);
  const first = { ...list[0] };
  delete first.dropped;
  return extra > 0 ? { ...first, dropped: Math.min(extra, 99) } : first;
}

/* Fold a flush window's per-poll deltas into ONE proposed delta, re-checking
   the three per-call clamps that are per-APPLY and not per-window. */
export function foldCombatDelta(deltas) {
  const folded = foldDeltas(deltas);
  if (folded.progress) {
    const ops = foldProgressOps(folded.progress);
    /* AFTER the fold, because the fold is what makes the bound reachable at
       all. It is not reachable on measured play — the worst folded flush above
       is 14 against 64 — but "measured on these fixtures" is not a bound, and
       an op silently dropped here would be a counter a player watches. FAIL
       LOUD: the flush is shortened by its caller, never truncated here. */
    if (ops.length > MAX_PROGRESS_OPS) {
      throw new Error(`foldCombatDelta: ${ops.length} progress ops after the fold `
        + `exceeds hr_apply's c_max_progress_ops (${MAX_PROGRESS_OPS}) — shorten the flush`);
    }
    folded.progress = ops;
  }
  if (folded.hearthfind) {
    const one = collapseHearthfind(folded.hearthfind);
    if (one) folded.hearthfind = one; else delete folded.hearthfind;
  }
  /* DEATHS. Each window already slices to MAX_DEATH_ROWS; nine windows can
     carry nine times that, and hr_apply rejects `> c_max_death_rows` with the
     whole flush attached. Sliced, as accrual.js slices — the ladder bounds
     itself (recovery doubles to a 64-minute cap, so a twelve-hour night cannot
     hold more than ~20 falls), so this is a fuse and not a policy. */
  if (Array.isArray(folded.deaths) && folded.deaths.length > MAX_DEATH_ROWS) {
    folded.deaths = folded.deaths.slice(0, MAX_DEATH_ROWS);
  }
  return folded;
}

/* Fold a flush window's per-poll journal metas into ONE combat journal row.

   THE SHAPE IS NOT NEGOTIABLE. It is `computeAccrual`'s own combat meta —
   `ms, ticks, kills, capped, ate, spent?, w?, from, to` — because a player's
   ledger must not be able to tell a tick from an accrue. The ONE addition is
   `src:'tick'`, and it exists so an OPERATOR can, which is the opposite
   requirement and the reason it is a marker rather than a different shape.

   TEN KEYS AT THE WIDEST, which is exactly `tests/accrual-engine.mjs` SHAPE's
   allowlist length — and it fits only because `att` is STRUCTURALLY ABSENT
   from a tick row (the attended refusal above). That is the key budget the
   refusal buys, and C12 asserts it rather than leaving it to luck.

   Every term is an AGGREGATE, never a per-action list: `game_events` reached
   1.6M rows / 229 MB from six players in four days by journalling every kill. */
export function foldCombatMeta(metas, windowFromMs, windowToMs) {
  const out = { ms: 0, ticks: 0, kills: 0, capped: false, ate: 0 };
  const spent = {};
  let waste = [0, 0];
  for (const m of metas) {
    if (m && Object.prototype.hasOwnProperty.call(m, 'att')) {
      throw new Error('foldCombatMeta: a tick window carried an attended split — '
        + 'the tick refuses `attended` (WORLD_TICK_DESIGN.md 16.6), so this meta '
        + 'did not come from a tick window');
    }
    out.ticks += Math.floor(Number(m.ticks || 0));
    out.kills += Math.floor(Number(m.kills || 0));
    out.ate += Math.floor(Number(m.ate || 0));
    out.capped = out.capped || !!m.capped;
    for (const id of Object.keys(m.spent || {})) {
      spent[id] = (spent[id] || 0) + Math.floor(Number(m.spent[id] || 0));
    }
    if (m.w) {
      const [r, i] = String(m.w).split(',').map((n) => Number(n) || 0);
      waste = [waste[0] + r, waste[1] + i];
    }
  }
  /* `capped` stays a boolean and is ALWAYS present, because the engine always
     emits it. Dropping it when false would make a tick row distinguishable
     from an accrue row by key count, which is the one thing the shape rule
     forbids. `ate` likewise: the engine emits it on every combat row. */
  out.capped = !!out.capped;
  /* `spent` and `w` are omitted entirely when empty, exactly as the engine
     omits them, so a melee night with no death is byte-for-byte the shape it
     already is. A nested value would be refused by artisan-accrual T7; both of
     these are flat (a map of integers, and a comma-joined scalar). */
  if (Object.keys(spent).length) out.spent = spent;
  if (waste[0] || waste[1]) out.w = `${waste[0]},${waste[1]}`;
  /* ⚠ `ms` IS RESTATED FROM THE WATERMARK, NOT SUMMED FROM THE POLLS. Each
     poll is asked "from my watermark to now", so its own `grantMs` INCLUDES
     the sub-tick tail the previous poll deferred; summing them re-counts every
     tail (measured on the gather fixtures at up to +31%, in the OVER-stating
     direction, on the number the away receipt shows as "time credited"). The
     honest value is the span the watermark actually moved, and `accrued_to`
     agrees with it by construction. Guard: C4. */
  out.ms = Math.max(0, Math.floor(windowToMs - windowFromMs));
  out.from = new Date(windowFromMs).toISOString();
  out.to = new Date(windowToMs).toISOString();
  /* THE ONLY DIFFERENCE FROM AN ACCRUE ROW. */
  out.src = 'tick';
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE WRITE INTENT — the tick as "just another server-side caller"
// ═══════════════════════════════════════════════════════════════════════════

/* Build the ONE settle call a flush window collapses into.

   THE DOOR IS `hr_tick_settle` AND IT IS REUSED UNCHANGED, which is the one
   place combat is boring. The fence takes the `player_state` row lock,
   compare-and-sets against `greatest(accrued_to, shadow_accrued_to)`, checks
   the version, binds `p_delta->>'accrued_to'` to `p_window_to`, honours the
   kill switch and the SHADOW flag — none of which is channel-aware. Combat
   adds no argument, no clamp and no fast path. It never calls `hr_apply`
   directly.

   The channel reaches the idempotency key only through the window bounds and
   the version, which is sufficient because a character has exactly one
   pointer: two channels cannot name the same window. */
export function writeIntent(who, deltas, metas, windowFromMs, windowToMs, seq) {
  const folded = foldCombatDelta(deltas);
  /* `journal` is excluded by foldDeltas on purpose (each poll carried its own)
     and is restated here as the single row the flush writes. */
  folded.journal = {
    kind: CHANNEL,
    intent: 'accrue',
    meta: foldCombatMeta(metas, windowFromMs, windowToMs),
  };
  /* The watermark the batch ends on IS the last poll's `accrued_to`. Restated
     from the batch rather than recomputed, so the value the fence stores is
     the value the engine stamped — and so `p_delta->>'accrued_to' =
     p_window_to` holds, which is what stops a caller naming ten seconds and
     paying an hour. */
  folded.accrued_to = new Date(windowToMs).toISOString();
  /* ── S-6: INTENTS 2..N ARE STALE BY CONSTRUCTION, SO THEY CARRY NO VERSION.
     A call settling several flush windows holds ONE hydration, so only the
     first intent's version can still be current: hr_apply bumps `version` on
     every accepted write. The later intents carry `p_version: null`, which
     hr_apply refuses outright (`version_conflict`), plus an explicit
     `rehydrateBefore` contract naming what the caller must do instead. The
     failure mode is "the tick cannot send this without rehydrating", not "the
     tick can send this if it invents a number". */
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
   version is a concurrency token.

   EVERY FIELD A COMBAT PARITY READ ASKS ABOUT IS HERE, which is the point of
   16.9's shadow columns: "the tick paid 5% less" is not an actionable
   sentence, "the tick paid 5% less and ate 0 meals" is. */
export function intentValue(intents) {
  const xp = {}; const items = {};
  let gold = 0; let kills = 0; let ticks = 0; let ms = 0; let ate = 0; let deaths = 0;
  for (const it of intents) {
    const d = it.args.p_delta;
    gold += Number(d.gold || 0);
    for (const k of Object.keys(d.xp || {})) xp[k] = (xp[k] || 0) + Number(d.xp[k] || 0);
    for (const k of Object.keys(d.items || {})) items[k] = (items[k] || 0) + Number(d.items[k] || 0);
    kills += Number(d.journal.meta.kills || 0);
    ticks += Number(d.journal.meta.ticks || 0);
    ate += Number(d.journal.meta.ate || 0);
    ms += Number(d.journal.meta.ms || 0);
    deaths += Array.isArray(d.deaths) ? d.deaths.length : 0;
  }
  return {
    gold, xp: sorted(xp), items: sorted(items),
    kills, ticks, ate, deaths, ms, rows: intents.length,
  };
}

function sorted(m) {
  const out = {};
  for (const k of Object.keys(m).sort()) out[k] = m[k];
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE OFFLINE HALF — fixtures, for the parity guard and a credential-free run
// ═══════════════════════════════════════════════════════════════════════════

/* THE FIXTURE HALF STAYS OFFLINE and moves nowhere when the rest of this file
   moves into the edge payload: it reads `node:fs` and a fixtures directory,
   neither of which belongs in a payload, and nothing in production calls it —
   the tick's active set is server rows (`sessionFromRoster`), never a file.

   Validated against the real catalogues on load, for the reason fixtures.js
   states: a fixture naming a monster the game no longer contains does not
   still test the engine, it tests the engine against a foe with no drop table. */
export function loadCombatSessions(file) {
  const path = file || join(HERE, 'fixtures', 'combat-sessions.json');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const problems = [];
  for (const s of raw.sessions) {
    if (!Object.prototype.hasOwnProperty.call(MONSTERS, s.activeId)) {
      problems.push(`session "${s.name}": monster "${s.activeId}" is not in src/data/monsters.js`);
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
    if (s.autoEatFood && !Object.prototype.hasOwnProperty.call(ITEMS, s.autoEatFood)) {
      problems.push(`session "${s.name}": autoEatFood "${s.autoEatFood}" is not in src/data/items.js`);
    }
  }
  if (problems.length) {
    throw new Error('combat fixture drift against src/data:\n  - ' + problems.join('\n  - '));
  }
  return raw.sessions;
}

/* Resolve the fixture's relative offsets against a scenario start instant.
   Absolute epochs in the JSON would rot; an offset is a property of the
   scenario and stays true.

   `accruedToText` is stamped here in the ACCRUE PATH'S OWN SPELLING — the
   `hr_state_of` JSONB rendering, `+00:00` and no padded fraction — rather than
   `toISOString()`. A fixture that carried the `Z` spelling would make the
   guard agree with the defect T-2 names, and one that carried a padded
   fraction would agree with S-2. */
export function atSpan(session, fromMs) {
  const s = JSON.parse(JSON.stringify(session));
  s.activeKind = CHANNEL;
  s.activeSinceMs = fromMs + Number(s.activeSinceOffsetMs || 0);
  s.accruedToMs = fromMs;
  s.accruedToText = pgTimestamptzText(fromMs);
  if (typeof s.recoveringUntilOffsetMs === 'number') {
    s.recoveringUntilMs = fromMs + s.recoveringUntilOffsetMs;
  }
  delete s.activeSinceOffsetMs;
  delete s.recoveringUntilOffsetMs;
  return s;
}

/* THE ACCRUE PATH'S SPELLING OF A TIMESTAMP, which is what `hr_state_of`'s
   JSONB rendering produces and therefore what `index.ts:785` labels with:
   `+00:00`, never `Z`.

   ⚠ POSTGRES DOES NOT PAD (Security S-2). This function used to write
     `.$1000+00:00` — six digits, always. PostgreSQL renders a timestamptz into
     JSON with TRAILING ZEROS TRIMMED and the fraction OMITTED ENTIRELY on an
     exact second, so the padded form is a string the accrue path cannot emit
     for a millisecond-precision watermark:

       2026-09-18T12:00:00.000Z  ->  2026-09-18T12:00:00+00:00      (no fraction)
       2026-09-18T12:00:09.600Z  ->  2026-09-18T12:00:09.6+00:00    (zeros trimmed)
       2026-09-18T12:00:09.739Z  ->  2026-09-18T12:00:09.739+00:00

     A 10 s cadence lands on an exact second constantly, so the first case is
     the common one, not the corner. `hr_seed` hashes the LABEL, so a padded
     label is a different stream — the same defect T-2 names, one spelling
     over.

   This is the OFFLINE rendering: there is no database in a fixture run, so the
   two paths need a string they can both be held to. It is not the authority on
   what Postgres writes — `tests/sec-world-tick-m3-seed-label.mjs` S-M3-2 is,
   and it asks a real server (pglite) on an exact second, on a trailing-zero
   millisecond and on a three-digit millisecond. On the wire the label is
   spelled by the server and never by JS (`tick.js` SEED_LABEL_EXPR), and a
   watermark carrying real microseconds travels VERBATIM as the envelope's own
   string, which is why `settleCombatSession` never re-renders window 1.

   `ms` is milliseconds, so this can produce at most three fraction digits —
   it cannot invent the microseconds a `now()`-clamped watermark may hold. */
export function pgTimestamptzText(ms) {
  const d = new Date(Math.floor(Number(ms) || 0));
  const iso = d.toISOString();                       // ...T20:00:09.600Z
  const [whole, frac = ''] = iso.slice(0, -1).split('.');
  const trimmed = frac.replace(/0+$/, '');
  return whole + (trimmed ? '.' + trimmed : '') + '+00:00';
}
