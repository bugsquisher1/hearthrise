// ============================================================================
// supabase/functions/hr-accrue/gm-stop.js — THE GAME MASTER STOPS A HERO, BY THE PLAYER'S OWN PATH.
//
// `gm_stop` is a verb and not a Postgres function for one reason: a town job's stop must COLLECT BEFORE IT
// SWITCHES (intents.js rule 3), and collecting is the game's rules, which live here. So:
//   hr_gm_stop_gate   who asks. Refuses anyone without a row of hr_gm_accounts ({ok:false, error:'refused'}, before
//                     any argument is read), journals it, and ends an open hunt by the statement hr_hunt_leave runs.
//   runSetActivity    a town job: the player's own stop, with the HERO as the subject, so the window is paid and
//                     hr_apply journals it on that hero's row. The caller's rate budget paid at the gate, and the
//                     hero's own (or its ban) cannot refuse this stop: that is GM_READ_SQL, the one difference.
//   hr_gm_stop_result what the switch answered, for the journal.
//
// `gm` is the VERIFIED JWT subject, never a body field. The hero's state is never echoed: the answer says what
// stopped and what it was paid. This file writes no table; the connection is hr_engine.
// PURE ESM behind the injected `exec` seam, Node + Deno. No `?v=`.
// ============================================================================

import { runSetActivity } from './set-activity.js';
import { INTENT_ERRORS } from './intents.js';

export const GM_GATE_SQL = 'select public.hr_gm_stop_gate($1::uuid, $2::uuid, $3::int, $4::text, $5::uuid) as res';
export const GM_RESULT_SQL = 'select public.hr_gm_stop_result($1::uuid, $2::uuid, $3::int, $4::text)';

/* READ_SQL's shape without the hero's rate gate. `$3` (the verb's bucket) is bound by runSetActivity and asked of nothing. */
export const GM_READ_SQL = `
  select $3::text is not null                       as allowed,
         public.hr_state_of($1::uuid, $2::int)      as state,
         public.hr_accrue_cap_ms($1::uuid, $2::int) as cap_ms,
         now()                                      as now`;

const REFUSED_STATUS = Object.freeze({ refused: 403, rate_limited: 429 });

/**
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call, as hr_engine
 * @param o.gm        the VERIFIED JWT subject
 * @param o.stop      request.js readGmStop: { target, slot, reason } (any may be null), or null
 * @param o.intentId  the caller's canonical-uuid key, or null
 * @returns {Promise<{status:number, body:object}>}
 */
export async function runGmStop(o) {
  const { exec, gm, intentId } = o;
  const stop = o.stop || { target: null, slot: null, reason: null };
  /* NO SHAPE REFUSAL BEFORE THE GATE: a stranger hears `refused` whatever it sent. */
  const [row] = await exec(GM_GATE_SQL, [gm, stop.target, stop.slot, stop.reason, intentId || null]);
  const g = row && row.res;
  if (!g || g.ok !== true) {
    const error = (g && g.error) || 'refused';
    return { status: REFUSED_STATUS[error] || 409, body: { ok: false, error } };
  }
  if (g.kind === 'hunt') return { status: 200, body: { ok: true, verb: 'gm_stop', kind: 'hunt', pending: true, hunt: g.hunt } };

  const out = await runSetActivity({
    exec, user: stop.target, slot: stop.slot, intentId, activity: { kind: 'idle', id: null }, readSql: GM_READ_SQL,
  });
  const done = out.status === 200 && out.body && out.body.ok === true;
  const error = done ? null : ((out.body && out.body.error) || INTENT_ERRORS.APPLY_FAILED || 'apply_failed');
  await exec(GM_RESULT_SQL, [gm, stop.target, stop.slot, error]);
  if (!done) return { status: out.status === 200 ? 409 : out.status, body: { ok: false, error } };
  return { status: 200, body: { ok: true, verb: 'gm_stop', kind: 'job', job: g.job, job_id: g.job_id,
    collected: out.body.collected || null, ...(out.body.forfeited ? { forfeited: out.body.forfeited } : {}) } };
}
