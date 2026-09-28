// ============================================================================
// supabase/functions/hr-accrue/settle-first.js — SETTLE BEFORE MUTATE.
//
// Security F1, docs/planning/SEC_ABSENCE_PRICED_AT_RETURN_2026-09-28.md. The
// return settle prices the whole open window `[accrued_to, now)` with the
// character as it is AT THE REQUEST. So a verb that adds or changes a priceable
// input — a tool in the bag, a buff, a perk rung, food or ammo the simulation
// drains — must first close that window at the OLD state, or the night is paid
// at the state the verb just created (+13.5 % ore measured on a pickaxe claimed
// at return; +5 % drops over a whole absence for a feast eaten at return).
//
// ONE implementation for every settle-before-mutate verb. The registry's
// `collectsFirst` column decides WHETHER (intents.js), `closesWindow` decides
// WHICH CLASS, and set-activity.js `collectCurrentWindow` is the one engine call
// — so a purchase and a switch can never price one window differently (A14).
//
// WHAT IT GUARANTEES A CALLER:
//   · proceed:false  → nothing was written by the settle and the verb must not
//                      commit; `refusal` is the 409 body (stage:'collect',
//                      envelope attached). Recovery is the client's usual one:
//                      run `accrue` (it owns the degrade ladder), then retry the
//                      verb with a NEW key.
//   · proceed:true   → commit at `version` (the settle bumped it if it paid) and
//                      compute anything state-derived from `env` (the envelope
//                      AFTER the settle). `collected` is the settle's receipt,
//                      or null; it rides on the verb's body, success and refusal
//                      alike, because the settle is its own apply and stays paid
//                      whatever the commit does (intents.js rule 4).
//
// PURE ESM, Node + Deno. No `?v=` (not under src/**).
// ============================================================================

import { collectsFirst, closesWindow, collectGate, INTENT_ERRORS } from './intents.js';
import { collectCurrentWindow } from './set-activity.js';
import { refusalBody } from './envelope.js';

/**
 * @param o.exec            the one-statement seam
 * @param o.user            the VERIFIED JWT subject
 * @param o.slot            the character slot
 * @param o.verb            the registry verb
 * @param o.env             the envelope this call read (gate + read statement)
 * @param o.nowMs           that read's server `now()`, in ms
 * @param o.capMs           that read's `hr_offline_cap_ms`
 * @param o.partyOwnsWindow true when party-fence.js found the character partied:
 *                          hr_party_tick_settle owns and prices that window, so
 *                          this verb must not move the watermark at all.
 * @returns {{ proceed: true, env, version, collected } |
 *           { proceed: false, refusal: { status, body } }}
 */
export async function settleBeforeMutate(o) {
  const { exec, user, slot, verb, env, nowMs, capMs } = o;
  const unchanged = (reason) => ({
    proceed: true, env, version: env.version, collected: null, reason,
  });

  if (!collectsFirst(verb)) return unchanged('verb_does_not_collect');

  /* A SWITCH MUST NOT COME HERE. Its own commit stamps `accrued_to`, so it runs
     the privileged collect and then its switch (set-activity.js, equip.js,
     enchant.js). Settling it here would defer a remainder its switch then
     stamps away. Fail closed: a refusal costs a tap. */
  if (closesWindow(verb)) {
    return {
      proceed: false,
      refusal: {
        status: 409,
        body: await refusalBody({
          exec, verb, user, slot,
          refusal: { error: INTENT_ERRORS.COLLECT_REQUIRED, stage: 'collect' },
          fallback: env,
        }),
      },
    };
  }

  if (o.partyOwnsWindow === true) return unchanged('party_owns_window');

  const collect = await collectCurrentWindow({
    exec, user, slot, env, st: env.state || {}, nowMs, capMs, pointerSurvives: true,
  });
  const gate = collectGate(collect);
  if (!gate.proceed) {
    /* NOTHING WAS WRITTEN: a refused collect applies nothing and the watermark
       did not move, so the window is intact for the `accrue` verb's ladder. */
    return {
      proceed: false,
      refusal: {
        status: 409,
        body: await refusalBody({
          exec, verb, user, slot,
          refusal: { error: gate.error, stage: 'collect', detail: collect.detail ?? null },
          fallback: env,
        }),
      },
    };
  }
  return {
    proceed: true,
    env: (collect.outcome === 'paid' && collect.env) ? collect.env : env,
    version: gate.version ?? env.version,
    collected: collect.receipt || null,
    reason: collect.reason || null,
  };
}
