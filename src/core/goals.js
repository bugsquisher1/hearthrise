// ════════════════════════════════════════════════════════════════════════
// src/core/goals.js — THE DAILY/QUEST PROGRESS COUNTER CONTRACT.
//
// ⚠ THIS FILE IS THE KEY CONTRACT. If you are writing a new server intent and
//   you need to move a daily or a quest counter, read this header and nothing
//   else — the shapes below are what `hr_apply` accepts and what
//   `hr_state_of`'s progress envelope returns, and inventing a parallel shape
//   is how the quest workstream gets handed a contract it has to break.
//
// ── WHY IT EXISTS (Designer Ruling 3.1, CUTOVER-BLOCKING) ───────────────
// "An away night that pays XP and items but leaves 'Slay 10 monsters' at 0/10
// reads as 'my night didn't count'." Until this file, `supabase/functions/
// hr-accrue/accrual.js` carried TWO named gaps — `updateDaily` and
// `updateQuest` were listed as deliberately-absent fx handlers with the reason
// "no server progress model". This is that model.
//
// ── THE SEAM WAS ALREADY THERE ──────────────────────────────────────────
// Nothing below invents an event. `src/core/combat-sim.js` resolveKill already
// calls `fx.updateDaily('kill_any', 1)` / `fx.updateQuest('kill_any', 1, …)`,
// and `src/core/skill-sim.js` resolveGatherTick already calls
// `fx.updateDaily('gather', qty)` / `fx.updateQuest('gather', qty)` — on the
// SAME function bodies the live client runs. The server was simply not
// listening. A missing fx handler is a no-op by construction, which is exactly
// why the gap was silent. So this is a LISTENER, not a second counter: an away
// kill and a live kill move the same row because they pass through one call
// site.
//
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  THE KEY CONTRACT                                                    ║
// ║                                                                      ║
// ║   DAILY   kind='daily'  key='ev:<type>'  period_key='<utc day key>'  ║
// ║   QUEST   kind='stat'   key='ev:<type>'  period_key=''               ║
// ║                                                                      ║
// ║  Both are ADDITIVE counters carrying `state:'active'` — never        ║
// ║  'claimed', which gates a payout and has its own path. Both kinds are ║
// ║  already in hr_apply's six-kind progress allowlist, so THIS MODEL    ║
// ║  REQUIRES NO MIGRATION — see "NO MIGRATION" below, which is a claim  ║
// ║  a test executes rather than a hope.                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// ── WHY `kind` IS WHAT IT IS (the artisan model's rule, applied) ─────────
// 2026-08-16-artisan-progress-model.sql established the rule this file obeys:
// `player_progress.kind` IS THE WRITE CAPABILITY, NOT A TAXONOMY. It decides
// who may write a row and what two writes do.
//
//   kind='daily'   in the allowlist · additive · period-keyed. A count that
//                  resets is exactly what a daily task is, and additive is the
//                  CORRECT merge for a count.
//   kind='stat'    in the allowlist · additive · permanent. The lifetime event
//                  count a quest reads.
//   kind='quest'   DELIBERATELY NOT WRITTEN BY THE ENGINE. That key space
//                  belongs to the quest LIFECYCLE — `key=<quest_id>`,
//                  `state='active'|'done'|'claimed'` — and `state='claimed'`
//                  is the one transition that gates a payout (review S13,
//                  hr_apply's separate `progress_claim` block). An engine that
//                  wrote quest rows would be writing into the claim path's key
//                  space with an additive merge. It writes COUNTERS; the claim
//                  path reads them and owns completion.
//   kind='unlock'  not in the allowlist at all (rooms, levels). Untouched here.
//
// ── WHY A QUEST COUNTER IS A LIFETIME COUNT AND NOT PER-QUEST ───────────
// `hundred_kills` in legacy.js's QUEST_DEFS is already a MIRRORED quest: it
// reads `stats.kills` rather than counting `kill_any` events, and the file
// says why — "it is correct on a save that already had the kills before the
// quest existed and it cannot drift from the counter it displays". This model
// makes EVERY quest that shape, against a server-owned counter:
//
//     quest progress = min(goal, stat['ev:<type>'])
//
// The beta is WIPED at cutover, so every character starts at zero and the
// lifetime count IS the quest's progress — no baseline to store, nothing to
// migrate, and a quest authored a year from now is retro-correct on a
// character that already did the work. Two quests sharing a type (goal 5 and
// goal 100 on `kill_any`) read the same row and complete at their own goals,
// which is what the client already does.
//
// ── WHY THE DAILY PERIOD IS THE DAY THE PLAYER RETURNS ──────────────────
// `period_key = utcDayKey(nowMs)` where `nowMs` is the SERVER clock at collect
// time — NOT the credited window's start and NOT its end. All three were
// considered and the other two are wrong in the same direction, which is the
// direction Ruling 3.1 exists to forbid:
//   · window START (`credit.fromMs`): a night from 22:00 to 10:00 credits ALL
//     of it to YESTERDAY, and the player comes back to "Slay 25" at 0/25 —
//     precisely "my night didn't count".
//   · window END (`credit.toMs`): identical failure on any CAPPED absence,
//     which is the common long one. A 40h absence capped at 12h has a window
//     that ended 28 hours ago, so a full night's kills land on a day the
//     player cannot see any more.
//   · RETURN (`nowMs`): the counter moves on the dailies the player is looking
//     at. It is also EXACTLY what the live client does today — `updateDaily`
//     advances the tasks that exist at replay time — so it is not a change in
//     behaviour, and it cannot credit a day that has not started (`nowMs` is
//     `select now()`, and hr_apply stamps `accrued_to` from the same clock).
// The cost, stated: a window that genuinely spanned two UTC days credits one
// day's dailies. That is a bounded UNDER-credit of at most one day, never a
// mint (a night can only ever complete one day's dailies either way), and
// splitting it exactly is not available at any honest price — `simulateSpan`
// segments by UTC day for Boss-of-the-Day, but `simulateSkillSpan` slices by
// BUFF EXPIRY and its slices carry no timestamps. One rule both paths satisfy
// identically beats two rules that agree today.
//
// ── THE DAY KEY IS THE DATABASE'S, NOT A SECOND ONE ─────────────────────
// `utcDayKey` reproduces `public.hr_utc_day_key(timestamptz)` — which is
//     to_char((p_at at time zone 'utc')::date, 'FMYYYY-FMMM-FMDD')
// and note the **FM**: it strips leading zeros, so 16 August 2026 is
// `2026-8-16`, NOT `2026-08-16`. A hand-written ISO slice would look right,
// pass review, and file every away night under a period key no clan/daily
// surface in the database has ever used. tests/goal-counters.mjs asserts this
// function against the REAL SQL function over a sweep of instants, so the two
// cannot drift.
//
// ── THE VOCABULARY IS BOUND TO THE AUTHORED DATA, IN BOTH DIRECTIONS ────
// `GOAL_EVENTS` is not a list somebody keeps in sync. tests/goal-counters.mjs
// asserts:
//   (a) every `fx.updateDaily(`/`fx.updateQuest(` type literal in src/core/**
//       is a member of GOAL_EVENTS ∪ UNCOUNTED_EVENTS — a new EMIT site must
//       be classified, or the build fails by name;
//   (b) every `type:` authored in legacy.js's QUEST_DEFS and DAILY_TASK_POOL
//       is a member of GOAL_EVENTS — a new authored GOAL of an unknown type
//       fails by name rather than silently never moving.
// That is the b350 lesson stated as a guard: *derivation removes the second
// LIST; it does not remove the second SIDE.* The consequence is the property
// the mandate asks for — **a new daily that reuses an existing event type is a
// data row and nothing else.** The handler counts whatever type core reports;
// it has no per-event branch.
//
// ⚠ THE AUTHORED ROWS THEMSELVES STILL LIVE IN src/legacy.js (QUEST_DEFS ~3402,
//   DAILY_TASK_POOL ~3535). Moving them into src/data/goals.js is the right
//   end state and is RECOMMENDED FOLLOW-UP owned by the Systems Engineer — one
//   of the daily factories calls `farmPlotCap()`, a legacy global, so the move
//   is a client behaviour change and not a file copy. It is deliberately NOT
//   done here: the alternative available to a server author is to COPY those
//   rows into a data module, and a second copy of game data is the failure this
//   repo has been burned by (see src/main.js `unifyObject`). The guard above
//   binds the two sides without duplicating either.
//
// ── NO MIGRATION, AND WHY THAT IS A RESULT RATHER THAN AN OMISSION ──────
// Every property this model needs already exists and is asserted by
// tests/goal-counters.mjs against the real chain:
//   · 'daily' and 'stat' are both in hr_apply's progress allowlist and in
//     player_progress' kind CHECK.                            (G6)
//   · `ev:<type>` is ≤ 64 chars and the day key is ≤ 16.      (G6)
//   · hr_progress_prune deletes period_key <> '' older than 31 days, so the
//     DAILY population is swept and the lifetime one is not.  (G8)
//   · hr_state_of returns period rows within the SAME 31 days and permanent
//     rows unfiltered, under LIMIT 1000 with `progress_truncated`. The daily
//     population this model adds is bounded by
//     |GOAL_EVENTS| x 31 = 6 x 31 = 186 rows inside the read window. (G8)
//   · hr_unlock_guard fires on `period_key = ''` and passes a non-'unlock'
//     kind through untouched, so the permanent counters are legal. (G7)
// A migration that added a table or a kind would have to be added to
// player-state.sql's by-name RLS/grant lists to inherit the repo's only static
// "no client writer" defence. Not needing one is strictly better.
//
// PURE ESM. No DOM, no window, no timers, no Math.random, no I/O. Runs in Node
// and in Deno, and is vendored into the Edge Function payload by
// tools/pack-edge.mjs.
// ════════════════════════════════════════════════════════════════════════

/* THE VOCABULARY. Every event type an authored daily or quest is allowed to
   be built on, and therefore every counter key the server can mint.

   These are the exact strings `updateDaily(type)` / `updateQuest(type)` are
   called with — six of them, matching the six types used across QUEST_DEFS and
   DAILY_TASK_POOL. Frozen and sorted so a diff of this list is legible. */
export const GOAL_EVENTS = Object.freeze([
  'cooked',     // artisan bench — cooking
  'crafted',    // artisan bench — crafting
  'gather',     // woodcutting / mining / fishing
  'harvest',    // farm
  'kill_any',   // combat
  'smithed',    // artisan bench — smithing
]);

/* EVENTS CORE EMITS THAT THIS MODEL DELIBERATELY DOES NOT COUNT, each with
   its reason. Being on this list is a DECISION; being on neither list is a
   build failure, which is the point.

     kill_monster — TARGET-SCOPED. resolveKill emits it as
                    `fx.updateQuest('kill_monster', 1, { target: id })` and the
                    client only advances a quest whose `q.target` matches. A
                    key `ev:kill_monster` that counted every kill regardless of
                    target would be a wrong number, and `ev:kill_monster:<id>`
                    is a key shape with no authored consumer today — inventing
                    one now is exactly the "hand the quest workstream a contract
                    it has to break" this file was written to avoid. NO
                    AUTHORED GOAL DECLARES A `target`; tests/goal-counters.mjs
                    asserts that, so the day one does, this decision is
                    re-opened by name rather than by a wrong counter. */
export const UNCOUNTED_EVENTS = Object.freeze(['kill_monster']);

/* The key namespace. `ev:` mirrors the `recipe:` / `room:` / `plot:`
   convention 2026-08-16-artisan-progress-model.sql landed, so a reader of
   player_progress can tell at a glance which model wrote a row — and so an
   event type can never collide with an existing `stat` key (`kills`, `crits`,
   `gathered`, `chopped`, `mined`, `fished`, `tool_doubles`, `deaths`,
   `rare_drops`), which are lifetime counters with a different meaning that
   this model must not disturb. */
export const GOAL_KEY_PREFIX = 'ev:';

/** The player_progress key for a goal event type. One expression, one reader. */
export function goalKey(type) { return GOAL_KEY_PREFIX + type; }

/** Is this a type the server may mint a counter for? */
export function isGoalEvent(type) { return GOAL_EVENTS.indexOf(type) >= 0; }

/* hr_apply's `c_max_progress_add`. Restated here because the ENGINE has to
   clamp against it (see recordGoalOps) and a value it cannot see is a value it
   cannot respect. `progress_clamp` IS on index.ts's DEGRADABLE list, so an
   over-limit op would not 409 the night — it would HALVE THE SPAN and pay half
   the gold and half the XP, to protect a counter whose goal is 25. Clamping
   the counter is the cheaper loss by four orders of magnitude, and it is
   reported (`goal_clamped`) rather than silent.

   THE HEADROOM, so the number is measured rather than assumed. The absolute
   physical ceiling on one accrual is ACCRUE_MAX_SPAN_MS (24h) divided by the
   floor on an action interval (MIN_ACTION_MS = 500 ms), i.e. 172,800 actions;
   gathering can yield 2 per action with a tool double, so 345,600 — a 2.89x
   margin, at rates no shipped node or weapon comes close to. Asserted, not
   asserted-by-comment: tests/goal-counters.mjs G9 recomputes it from the real
   constants and fails if the margin drops below 2x. */
export const MAX_GOAL_ADD = 1000000;

/**
 * THE UTC DAY KEY — `public.hr_utc_day_key(timestamptz)`, in JS.
 *
 * ⚠ NO ZERO PADDING. The SQL is `to_char(…, 'FMYYYY-FMMM-FMDD')` and FM is the
 *   fill-mode prefix that strips leading zeros: `2026-8-16`, not `2026-08-16`.
 *   This is the same key `clan_period_totals` and the Muster have been storing
 *   since 2026-08-08, so a padded one would be a second day-key universe that
 *   looks correct in every screenshot.
 *
 * @param ms  a SERVER instant in epoch ms. Never a client clock.
 * @returns   the key, or '' for a non-finite input — which the caller treats
 *            as "emit no daily op", because a counter filed under '' would be
 *            a PERMANENT row (period_key='' is the permanent population) and
 *            would never be pruned.
 */
export function utcDayKey(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

/**
 * THE COUNTER. Two accumulators, because core has two seams and they are not
 * interchangeable: `fx.updateDaily` and `fx.updateQuest` are called at the
 * same sites with the same amounts today, but they are separate calls with
 * separate meanings, and a single accumulator fed by both would double every
 * count. Mirroring the seam exactly means that if core ever moves one without
 * the other, the server moves the same one.
 *
 * Unknown types are DROPPED and REPORTED, never minted into a key. The
 * structural guard catches a new type at build time; this is what happens if
 * one reaches production anyway, and it fails in the direction that cannot
 * create a row nobody can read.
 */
export function makeGoalCounter() {
  const daily = Object.create(null);
  const quest = Object.create(null);
  const unknown = Object.create(null);

  const add = (bag, type, amt) => {
    const n = Math.floor(Number(amt) || 0);
    if (n <= 0) return;
    if (typeof type !== 'string' || !isGoalEvent(type)) {
      if (typeof type === 'string' && type) unknown[type] = (unknown[type] || 0) + n;
      return;
    }
    bag[type] = (bag[type] || 0) + n;
  };

  return {
    /* `meta` is accepted and IGNORED. The client ignores it too for every
       authored goal — `updateQuest` only consults `meta.target` when the quest
       row declares `q.target`, and no authored row does. The guard asserts
       that, so this is a stated equivalence rather than an assumption. */
    daily(type, amt) { add(daily, type, amt); },
    quest(type, amt /* , meta */) { add(quest, type, amt); },
    counts() { return { daily: { ...daily }, quest: { ...quest } }; },
    unknownTypes() { return { ...unknown }; },
  };
}

/**
 * Turn the counter into `progress` ops for an hr_apply delta.
 *
 * @param counter  a makeGoalCounter()
 * @param nowMs    the SERVER instant of the collect — the day the counters
 *                 credit. See the header for why this and not the window.
 * @param events   OPTIONAL sink; push({type,…}) receipts for anything clamped
 *                 or dropped, so a support request is answerable.
 * @returns        an array of ops, each already valid against hr_apply's
 *                 progress block: a kind in its allowlist, a key of 1..64
 *                 chars, a period of ≤16, `state:'active'`, and `add` in
 *                 [1, MAX_GOAL_ADD].
 *
 * ⚠ `state: 'active'` AND NEVER ANYTHING ELSE. A counter has no lifecycle, and
 *   the first draft therefore OMITTED the field — legal in the database (the
 *   column is nullable and hr_apply coalesces an absent state to 'active' for
 *   its own check) but wrong twice over. It made two rows of the same kind,
 *   written by the same builder three lines apart (`stat:kills` carries
 *   'active'), differ in shape for no reason a reader could see; and
 *   tests/accrual-engine.mjs' SHAPE block already asserts every progress op a
 *   delta carries names a settable state, which is a shipped contract this
 *   file does not get to widen. The one value that must never appear is
 *   'claimed' — that gates a payout (review S13) and hr_apply refuses it from
 *   the generic progress block, which is the protection, not this line.
 *
 * OP COUNT, against hr_apply's `c_max_progress_ops` = 64: at most
 * 2 x |GOAL_EVENTS| = 12, and a real night produces TWO (a combat night moves
 * `kill_any` only; a gather night moves `gather` only). The rest of the delta's
 * progress array is 4 stat ops plus at most one recipe unlock, so the ceiling
 * is never approached. G9 asserts the bound from the real constants.
 */
export function goalProgressOps(counter, nowMs, events) {
  const ops = [];
  if (!counter) return ops;
  const { daily, quest } = counter.counts();
  const day = utcDayKey(nowMs);
  const sink = Array.isArray(events) ? events : null;

  const clamp = (type, n, where) => {
    if (n <= MAX_GOAL_ADD) return n;
    if (sink) sink.push({ type: 'goal_clamped', event: type, kind: where, add: n, to: MAX_GOAL_ADD });
    return MAX_GOAL_ADD;
  };

  /* Sorted, so a delta is byte-stable for the same night. The idempotency key
     is derived from the watermark rather than from the delta, so this is not
     load-bearing for correctness — it is load-bearing for a DIFF, and a
     receipt nobody can diff is a receipt nobody checks. */
  for (const type of Object.keys(daily).sort()) {
    /* A missing day key means a non-finite server clock, which cannot happen
       through index.ts (`new Date(select now())`) and would file a permanent
       row that nothing prunes if it did. Refuse the DAILY op and keep the
       lifetime one: under-credit, never an unsweepable row. */
    if (!day) {
      if (sink) sink.push({ type: 'goal_no_day_key', event: type });
      continue;
    }
    ops.push({ kind: 'daily', key: goalKey(type), period: day,
               add: clamp(type, daily[type], 'daily'), state: 'active' });
  }
  for (const type of Object.keys(quest).sort()) {
    ops.push({ kind: 'stat', key: goalKey(type), period: '',
               add: clamp(type, quest[type], 'stat'), state: 'active' });
  }

  const unknown = counter.unknownTypes();
  for (const type of Object.keys(unknown).sort()) {
    if (sink) sink.push({ type: 'unknown_goal_event', event: type, add: unknown[type] });
  }
  return ops;
}
