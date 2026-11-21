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

/* ── A JOB'S COUNT AND ITS "THEN" (plan L08, retention R3; supabase/migrations/1009-job-counts.sql) ──────────────────────
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
