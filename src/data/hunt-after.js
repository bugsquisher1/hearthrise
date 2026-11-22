// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-after.js — WHEN THE HUNT ENDS: WHERE THE HERO GOES NEXT.
//
// Tyler 2026-11-15: "I think we just need an itinerary of sorts where a player picks a hunt and picks what they
// want to do when the hunt finishes." One choice a hero, remembered (the first principle: a decision made once is
// not made again), picked on the hunt's page under "When the hunt ends". The server stores it, freezes it on the
// hunt at Enter and runs it when the hunt ends ON ITS OWN (src/data/hunt-sessions.js RESUME_AFTER_END); a hunt the
// player leaves by hand always ends with the hero waiting in town.
//
// AFTER_CHOICES  one row a choice, in the order the control lists them. `runs` is what the server does:
//                  job       back to the hero's job: the gathering job it last had, or the bench it was at when it
//                            set off, for what that bench still had to make then (never the hunt's loot)
//                  nothing   wait in town
//                  training  open a training session at `place` for the skill the player named; a paid place
//                            charges the server's own price when it starts
//                A NEW PLACE TO GO IS A ROW HERE (tools/gen-hunt-after.mjs -> hr_hunt_after_choices), not a new
//                settle body: the server's start reads `runs` and `place`.
// AFTER_DEFAULT  the choice of a hero who never picked: back to the job, so a player who touches nothing keeps
//                what gathering always did.
// JOB_GRACE_S    going hunting stops the job a moment before Enter (the client settles it so the last stretch is
//                paid). A bench the player's own Stop ended no longer ago than this still counts as the job the hero
//                set off from. Longer ago, it was stopped on purpose and is not picked up.
//
// JOB_NEXTS      what a gathering job or a bench run does when the server has counted it out (below).
//
// The words are src/data/text/away.js (t('away.<key>')). PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const AFTER_RUNS = Object.freeze(['job', 'nothing', 'training']);

export const AFTER_CHOICES = Object.freeze([
  Object.freeze({ id: 'job', runs: 'job', place: null }),
  Object.freeze({ id: 'wait', runs: 'nothing', place: null }),
  Object.freeze({ id: 'train', runs: 'training', place: 'yard' }),
]);

export const AFTER_DEFAULT = 'job';

export const JOB_GRACE_S = 60;

export const AFTER_INDEX = Object.freeze(Object.fromEntries(AFTER_CHOICES.map((c) => [c.id, c])));

/* ── A JOB'S COUNT AND ITS "THEN" (plan L08, retention R3; supabase/migrations/1026-job-counts.sql) ──────────────────────
   A gathering job or a bench run takes a COUNT (actions, 1..JOB_COUNT_MAX) and a THEN, both set when it starts. The server
   stops the job on the action that reaches the count and then does the THEN, with the browser open or closed:
     wait   the hero waits in town
     hunt   the hero goes back to its latest hunt (the same ground, tier, setup and bag lines, through the same door as a
            manual restart), ONCE: a job resumed after a hunt ends waiting, so a plan never loops (ruling C8, 27-1)
   A gathering job ALWAYS takes a count (6,001 ore for a 20-ore errand, retention dive 2026-11-20); a bench may run on "All"
   (until its inputs run out), which takes no THEN. JOB_NEXTS rows are the server's CHECK on player_state.active_next. */
export const JOB_NEXT_RUNS = Object.freeze(['nothing', 'hunt']);
export const JOB_NEXTS = Object.freeze([
  Object.freeze({ id: 'wait', runs: 'nothing' }),
  Object.freeze({ id: 'hunt', runs: 'hunt' }),
]);
export const JOB_NEXT_DEFAULT = 'wait';
export const JOB_NEXT_INDEX = Object.freeze(Object.fromEntries(JOB_NEXTS.map((c) => [c.id, c])));
/** The largest count a job takes: player_state.active_left's CHECK (2026-12-01-bench-count.sql). */
export const JOB_COUNT_MAX = 100000;
/** The counts a gathering row offers (the Work window), before its own "X". */
export const GATHER_COUNTS = Object.freeze([20, 100, 1000]);
/** A gathering row's count until the player picks one. */
export const GATHER_COUNT_DEFAULT = 100;

/* ── THE REST PLAN'S ENDING (designer D-11, review/05-designer-rulings.md section 3; Tyler let reversal rows 27 and 27b stand 2026-11-21) ──
   A rest plan is a queue and then ONE ending, chosen once for each hero and kept. It starts no hunt and never loops: a hunt starts on a press in
   a session (CLAUDE.md section 1). The server half (the standing job in closed form, its stop at the next Start, a full bag, the purse or
   STANDING_MAX_HOURS) is FB-10's; these rows are FB-6's (D-11 section 3.7).
     standing   one job with no count: "Gather the best I can", the highest node of one gathering skill the hero's level opens
     train      paid yard time by the hour (never the default: it spends gold); open from the yard's own Level (training.js)
     wait       the hero waits in town
   JOB_NEXTS' `hunt` row goes with FB-10's re-cut of staged 1026 (its CHECK and its sweep move together; D-11 section 3.4). */
export const REST_RUNS = Object.freeze(['standing', 'training', 'nothing']);
export const REST_ENDINGS = Object.freeze([
  Object.freeze({ id: 'standing', runs: 'standing' }),
  Object.freeze({ id: 'train', runs: 'training' }),
  Object.freeze({ id: 'wait', runs: 'nothing' }),
]);
/** What a new account gets and what "Reset the plan" gives (D-11: the usual ending). */
export const REST_ENDING_DEFAULT = 'standing';
/** The standing job stops by itself this long after the hunt ended: both rests of the day and one missed visit (D-11). */
export const STANDING_MAX_HOURS = 24;

/** Every problem with the rest plan's ending rows, as strings. Empty = valid. */
export function validateRest(rows = REST_ENDINGS, def = REST_ENDING_DEFAULT, maxHours = STANDING_MAX_HOURS) {
  const out = [];
  const ids = new Set();
  for (const c of rows) {
    if (!c || typeof c.id !== 'string' || !/^[a-z_]{1,16}$/.test(c.id)) { out.push('an ending has no plain id'); continue; }
    if (ids.has(c.id)) out.push(c.id + ': listed twice');
    ids.add(c.id);
    if (!REST_RUNS.includes(c.runs)) out.push(c.id + ': runs ' + c.runs + ', which is no entry of REST_RUNS');
    /* NO ENDING RUNS A HUNT (D-11): only these three kinds exist, and none of them enters a ground */
    if (/hunt/.test(c.runs)) out.push(c.id + ': an ending may not start a hunt');
  }
  if (!ids.has(def)) out.push('the default ' + def + ' is no ending');
  else if (rows.find((c) => c.id === def).runs === 'training') out.push('the default ending may not cost gold');
  if (!rows.some((c) => c.runs === 'nothing')) out.push('no ending waits in town');
  if (!Number.isInteger(maxHours) || maxHours < 1 || maxHours > 72) out.push('the standing job\'s stop is not whole hours from 1 to 72');
  return out;
}

/* ── "NEEDS YOU" ON THE RETURN CARD (designer D-2 section 2.3) ─────────────────────────────────────────────────────────────────────
   Kinds in a fixed order (D-2's eight and the hunt report's two, each in its band), ONE row a kind for the account (heroes merged into it), NEEDS_SHOWN shown by rank, "{n} more" under them.
   A LINE PROVIDER (src/shell/needs-you/*.js) supplies the rows of one kind and nothing else: a new system adds a provider file and a row
   here, never an edit to the card. A new kind takes a BAND and goes last in it (a rank above an existing row is a designer call).
   What Carry on does is never a row; no row offers a refill, a Crown or a boost.
     band 1  stops a hero hunting     band 2  costs progress     band 3  gains */
export const NEEDS_BANDS = Object.freeze({ stops: 1, costs: 2, gains: 3 });
export const NEEDS_YOU = Object.freeze([
  Object.freeze({ kind: 'outgrown', band: 'stops' }),
  Object.freeze({ kind: 'cannot_start', band: 'stops' }),
  Object.freeze({ kind: 'death', band: 'costs' }),
  Object.freeze({ kind: 'gear_choice', band: 'costs' }),
  /* THE HUNT REPORT (GR-66, FB-7; rule 4: a new kind goes last in its band): a hero's last hunt read Near death and the hero lived
     (src/shell/needs-you/near-death.js); then its cause line, once the server stores the sustain counters (no provider yet) */
  Object.freeze({ kind: 'near_death', band: 'costs' }),
  Object.freeze({ kind: 'fell_back', band: 'costs' }),
  Object.freeze({ kind: 'tier_offer', band: 'gains' }),
  Object.freeze({ kind: 'ground_opened', band: 'gains' }),
  Object.freeze({ kind: 'talent_points', band: 'gains' }),
  Object.freeze({ kind: 'can_build', band: 'gains' }),
  Object.freeze({ kind: 'recruits', band: 'gains' }),   // 1053-recruits.sql
]);
/** How many rows the card shows; the rest is one "{n} more" line. */
export const NEEDS_SHOWN = 3;

/** Every problem with the Needs you rows, as strings. Empty = valid. */
export function validateNeeds(rows = NEEDS_YOU, shown = NEEDS_SHOWN) {
  const out = [];
  const kinds = new Set();
  let band = 0;
  for (const r of rows) {
    if (!r || typeof r.kind !== 'string' || !/^[a-z_]{1,24}$/.test(r.kind)) { out.push('a row has no plain kind'); continue; }
    if (kinds.has(r.kind)) out.push(r.kind + ': listed twice');
    kinds.add(r.kind);
    const b = NEEDS_BANDS[r.band];
    if (!b) { out.push(r.kind + ': band ' + r.band + ' is no band'); continue; }
    if (b < band) out.push(r.kind + ': its band comes before the row above it (rows run by band)');
    band = b;
  }
  if (!Number.isInteger(shown) || shown < 1 || shown > rows.length) out.push('NEEDS_SHOWN is not a whole count of the rows');
  return out;
}

/** Every problem with the job THEN rows, as strings. Empty = valid. */
export function validateJobNexts(rows = JOB_NEXTS, def = JOB_NEXT_DEFAULT) {
  const out = [];
  const ids = new Set();
  for (const c of rows) {
    if (!c || typeof c.id !== 'string' || !/^[a-z_]{1,16}$/.test(c.id)) { out.push('a then has no plain id'); continue; }
    if (ids.has(c.id)) out.push(c.id + ': listed twice');
    ids.add(c.id);
    if (!JOB_NEXT_RUNS.includes(c.runs)) out.push(c.id + ': runs ' + c.runs + ', which is no entry of JOB_NEXT_RUNS');
  }
  if (!ids.has(def)) out.push('the default ' + def + ' is no then');
  else if (rows.find((c) => c.id === def).runs !== 'nothing') out.push('the default then must wait');
  if (!GATHER_COUNTS.includes(GATHER_COUNT_DEFAULT)) out.push('the gathering default count is not offered');
  if (GATHER_COUNTS.some((n) => !Number.isInteger(n) || n < 1 || n > JOB_COUNT_MAX)) out.push('a gathering count is out of range');
  return out;
}

/** Every problem with the rows, as strings. Empty = valid. `places`: the places a hero can train (src/data/training.js). */
export function validateAfter(choices = AFTER_CHOICES, def = AFTER_DEFAULT, graceS = JOB_GRACE_S, places = ['yard', 'house']) {
  const out = [];
  const ids = new Set();
  for (const c of choices) {
    if (!c || typeof c.id !== 'string' || !/^[a-z_]{1,24}$/.test(c.id)) { out.push('a choice has no plain id'); continue; }
    if (ids.has(c.id)) out.push(c.id + ': listed twice');
    ids.add(c.id);
    if (!AFTER_RUNS.includes(c.runs)) out.push(c.id + ': runs ' + c.runs + ', which is no entry of AFTER_RUNS');
    if ((c.runs === 'training') !== (typeof c.place === 'string')) out.push(c.id + ': a place belongs to a training choice, and only to one');
    if (c.runs === 'training' && !places.includes(c.place)) out.push(c.id + ': ' + c.place + ' is no place a hero trains');
  }
  if (!ids.has(def)) out.push('the default ' + def + ' is no choice');
  else if (choices.find((c) => c.id === def).runs === 'training') out.push('the default may not cost gold');
  if (!choices.some((c) => c.runs === 'nothing')) out.push('no choice waits in town');
  if (!Number.isInteger(graceS) || graceS < 0 || graceS > 3600) out.push('grace: not whole seconds within an hour');
  return out;
}
