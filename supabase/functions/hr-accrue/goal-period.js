// ════════════════════════════════════════════════════════════════════════
// goal-period.js — THE MODAL-GOAL DAILY COUNTERS (b461).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────
// src/core/goals.js owns the counter contract for the goals CORE EMITS: every
// key it writes comes from an `fx.updateDaily(type)` / `fx.updateQuest(type)`
// call site inside the simulation, and its GOAL_EVENTS vocabulary is bound to
// those literals by tests/goal-counters.mjs. That binding is the reason it is
// trustworthy, and it is also the reason it cannot host these five keys: the
// quest MODAL's goals ("Gather 25 logs", "Mine 25 ores", "Catch 15 fish",
// "Find 5 rare drops", "Gain a skill level") are NOT emitted as events by the
// sim at all. They are read off the accrual SUMMARY — the same
// `stats.chopped` / `stats.mined` / `stats.fished` / `stats.rareDrops`
// counters the engine already files as LIFETIME `stat` rows, plus the
// `levelUps` array the XP grant already produces.
//
// So this is a SECOND PROJECTION OF NUMBERS THE ENGINE ALREADY COMPUTED, not
// a second counter: every value below is the same integer that is being
// written one line earlier as `stat('chopped', …)` / `stat('rare_drops', …)`.
// Nothing is recounted, so the daily row and the lifetime row cannot disagree.
//
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  THE SHAPE (identical to src/core/goals.js's DAILY arm)              ║
// ║                                                                      ║
// ║     kind='daily'   key='ev:<counter>'   period_key='<utc day key>'   ║
// ║                                                                      ║
// ║  Additive, state:'active', never 'claimed'. `kind='daily'` is        ║
// ║  already in hr_apply's progress allowlist and in player_progress'    ║
// ║  kind CHECK, so THIS MODEL REQUIRES NO hr_apply CHANGE.              ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// ── THERE IS NO 'weekly' KIND, AND THAT IS A DECISION ───────────────────
// The obvious build is a mirrored `kind='weekly'` row per counter under an
// ISO-week period key. It was rejected, for three measured reasons:
//   1. It needs hr_apply's progress allowlist widened, i.e. a restatement of a
//      ~1,200-line SECURITY DEFINER body plus a new link on HR_APPLY_CHAIN —
//      the single riskiest edit available in this repo, for a counter.
//   2. It DOUBLES the progress ops on every settle. hr_apply refuses a delta
//      with more than 64 (`too_many_progress_ops`) and `progress_clamp` is on
//      index.ts's DEGRADABLE list, so an over-budget combat night does not
//      fail loudly — it HALVES THE SPAN and pays half the gold to protect a
//      counter. Spending op budget on a derivable number is the wrong trade by
//      four orders of magnitude.
//   3. Two counters for one fact can drift. One cannot.
// A weekly total is instead DERIVED at claim time as the sum of that ISO
// week's seven day rows (see 2026-08-23-modal-goal-claims.sql,
// hr_goal_week_days). Daily rows survive 31 days under hr_progress_prune, so a
// full week is always readable. Zero extra rows, zero extra ops, one truth.
//
// ── THE VOCABULARY IS CLOSED ────────────────────────────────────────────
// An unknown counter name is DROPPED with a receipt, never minted into a key.
// The catalogue that reads these rows (public.hr_goal_rewards) is asserted
// against this list by tests/modal-goal-claim.mjs, in both directions: a key
// here with no goal reading it, or a goal naming a key nothing writes, fails
// the build BY NAME rather than becoming a counter that ticks into the void.
//
// PURE ESM. No DOM, no window, no timers, no Math.random, no I/O. Runs in Node
// and in Deno. Relative imports carry NO `?v=` (b332).
// ════════════════════════════════════════════════════════════════════════

import { utcDayKey, MAX_GOAL_ADD, GOAL_KEY_PREFIX } from '../../../src/core/goals.js';

/* THE COUNTERS THIS FILE OWNS, and the authored goal that reads each one.
   Frozen and sorted so a diff of this list is legible.

   ── ONE NAMING RULE, WITH NO EXCEPTIONS ─────────────────────────────────
   A counter key is `ev:` + the snake_case of the CLIENT STAT the authored goal
   reads. legacy.js's DAILY_GOAL_POOL / WEEKLY_GOAL_POOL name their sources
   literally (`stats.chopped`, `stats.mined`, `stats.fished`, `stats.rareDrops`,
   `stats.levelups`, `stats.planted`), so the key can be read off the goal row
   and nobody has to remember a mapping table.

   ⚠ THREE OF THEM ARE ALSO THE LIFETIME `stat` KEY WRITTEN THREE LINES ABOVE
     EVERY CALL SITE (`chopped` / `mined` / `fished` / `rare_drops`), and that
     is deliberate: the daily row and the lifetime row are the same fact over
     different windows, and two spellings would be two half-counters no screen
     could total (the `tool_doubles` lesson, tests/artisan-accrual.mjs). They
     cannot collide — the lifetime rows are kind='stat' period_key='', these are
     kind='daily' period_key='<day>' — and the `ev:` prefix marks them as GOAL
     counters either way. */
export const MODAL_GOAL_COUNTERS = Object.freeze([
  'chopped',     // stats.chopped   → daily gather_logs (25) · weekly wk_logs (250)
  'fished',      // stats.fished    → daily fish (15)
  'levelups',    // stats.levelups  → daily level_up (1)     · weekly wk_levels (5)
  'mined',       // stats.mined     → daily mine_ore (25)    · weekly wk_gather (250)
  'rare_drops',  // stats.rareDrops → weekly wk_rare (5)
]);
/* NOTE `planted` (daily plant, 5) follows the same rule but is stamped in SQL,
   by hr_farm_plant — planting is settled entirely by the farm RPC and never
   passes through this engine. See 2026-08-23-modal-goal-claims.sql §5. */

/** The player_progress key for a modal-goal counter. One expression, one reader. */
export function modalGoalKey(counter) { return GOAL_KEY_PREFIX + counter; }

/** Is this a counter this file may mint a row for? */
export function isModalGoalCounter(c) { return MODAL_GOAL_COUNTERS.indexOf(c) >= 0; }

/**
 * Turn a bag of {counter: n} into `progress` ops for an hr_apply delta.
 *
 * Every op is kind='daily', period=utcDayKey(nowMs), state='active', add
 * clamped into [1, MAX_GOAL_ADD] against the SAME hr_apply ceiling
 * src/core/goals.js respects. A non-positive count emits nothing (a zero is
 * not a no-op to hr_apply — it is a catalogue lookup, a row lock and a WAL
 * record for nothing).
 *
 * ⚠ THE PERIOD IS `nowMs`, THE DAY THE PLAYER RETURNS — not the credited
 *   window's start and not its end. src/core/goals.js's header states the full
 *   argument; the one-line version is that both alternatives file a night's
 *   work under a day the player can no longer see, which is exactly the
 *   "my night didn't count" failure Ruling 3.1 exists to forbid. Using the
 *   same anchor as the goal counter also means the two arms of one delta can
 *   never land under different period keys.
 *
 * @param nowMs   the SERVER instant of the collect. Never a client clock.
 * @param counts  {chopped?, mined?, fished?, rare_drops?, levelups?}
 * @param events  OPTIONAL sink; push({type,…}) receipts for clamp/drop.
 * @returns       ops, each already valid against hr_apply's progress block.
 */
export function modalGoalOps(nowMs, counts, events) {
  const ops = [];
  if (!counts) return ops;
  const sink = Array.isArray(events) ? events : null;
  const day = utcDayKey(nowMs);

  for (const counter of Object.keys(counts).sort()) {
    const n = Math.floor(Number(counts[counter]) || 0);
    if (n <= 0) continue;
    if (!isModalGoalCounter(counter)) {
      /* Fails CLOSED: an unknown name is reported and dropped, never filed as
         a key nothing can read. The structural guard catches a new name at
         build time; this is what happens if one reaches production anyway. */
      if (sink) sink.push({ type: 'unknown_modal_goal_counter', counter, add: n });
      continue;
    }
    if (!day) {
      /* A missing day key means a non-finite server clock (impossible through
         index.ts, which passes `new Date(select now())`). A row filed under ''
         would be PERMANENT — period_key='' is the permanent population — and
         nothing would ever prune it. Under-credit, never an unsweepable row. */
      if (sink) sink.push({ type: 'goal_no_day_key', event: counter });
      continue;
    }
    let add = n;
    if (add > MAX_GOAL_ADD) {
      if (sink) sink.push({ type: 'goal_clamped', event: counter, kind: 'daily', add: n, to: MAX_GOAL_ADD });
      add = MAX_GOAL_ADD;
    }
    ops.push({ kind: 'daily', key: modalGoalKey(counter), period: day, add, state: 'active' });
  }
  return ops;
}
