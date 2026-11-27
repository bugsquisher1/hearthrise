// ============================================================================
// supabase/functions/hr-accrue/company-wear.js — "WEAR UPGRADES": THE SERVER PICKS, POSTGRES DECIDES (lane/c-company FB-6).
//
// Designer D-2 (review/05-designer-rulings.md section 2.1): "Wear upgrades" is a standing plan line that dresses every hero at each Start, in
// town, and "the pick moves to src/core so the server makes it". This verb is that server half. The client presses it as the company's Start
// goes out (src/session/carry-on-intents.js carryOn, while the company's line is on), naming ONLY the heroes going: a list of its own slots.
//
// ── WHAT THE CLIENT MAY SEND ─────────────────────────────────────────────
//   {"verb":"company_wear","slot":N,"intentId":"<uuid>","slots":[0,1,2]}
// Slots and nothing else. No item, no equip slot, no from: the pieces are this file's pick over the server's own projection. A browser that
// was closed while the hunt ended changes nothing: the pick reads hr_state_of, never the client.
//
// ── WHAT IT DOES ─────────────────────────────────────────────────────────
//   (1) the rate gate and the pressing hero's read (spend.js gateAndRead: the bucket is the registry's)
//   (2) each named hero's hr_state_of (the envelope the engine already reads); src/core/upgrade-pick.js wearInputOf + companyWearLines:
//       its own bag's strictly-better pieces, then a piece another named hero holds and does not wear (D-2 rule 4)
//   (3) ONE statement, its own transaction, as hr_engine: hr_company_wear_apply(user, slots, lines, key) re-validates every invariant (own
//       heroes, in town and idle, hr_apply's equip gate under each hero's lock, passes through Storage) and journals. Edge decides WHAT SHOULD
//       HAPPEN; Postgres decides WHETHER IT MAY.
// The answer is the pressing hero's envelope (ok:true), the server's per-hero result (`heroes`: wore / refused / busy) and every named hero's
// envelope (`envelopes`, rule 11).
//
// ── WHY NO COLLECT ───────────────────────────────────────────────────────
// hr_apply stamps accrued_to on an equip (intents.js rule 3). The function dresses only an IDLE hero in town, so there is no unpaid window to
// stamp: a hero with a running job is named `busy` and keeps its gear (the client settles a job the Start stops before it presses).
// ============================================================================
import { INTENT_ERRORS } from './intents.js';
import { gateAndRead } from './spend.js';
import { REFRESH_SQL } from './envelope.js';
import { wearInputOf, companyWearLines } from '../../../src/core/upgrade-pick.js';

export const VERB = 'company_wear';

/* slots as an array literal from text: postgres.js (fetch_types off) sends a JS array as `0,1` (delta-transport T10c) */
const WEAR_SQL = 'select public.hr_company_wear_apply($1::uuid, $2::text::int[], $3::text::jsonb, $4::uuid) as res';
const slotsLiteral = (slots) => '{' + slots.join(',') + '}';

/** The named heroes' wear lines from their envelopes ([{ slot, env }], slot order): the core's pick. Pure. */
export function wearLinesFor(heroes) {
  return companyWearLines(heroes.filter((h) => h.env && h.env.ok === true)
    .map((h) => ({ slot: h.slot, input: wearInputOf((k) => h.env[k], h.slot) })));
}

/**
 * THE INTENT.
 * @param o.exec      (text, params) => Promise<rows[]>
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      the pressing hero (a row the caller owns)
 * @param o.intentId  the caller's canonical-uuid key
 * @param o.slots     request.js readSlots: 1..6 distinct own slots, or null
 * @returns { status, body }
 */
export async function runCompanyWear(o) {
  const { exec, user, slot, intentId, slots } = o;
  if (!intentId) return { status: 400, body: { ok: false, verb: VERB, error: INTENT_ERRORS.MISSING_INTENT_ID } };
  if (!Array.isArray(slots) || !slots.length) return { status: 400, body: { ok: false, verb: VERB, error: INTENT_ERRORS.BAD_SLOTS } };
  const read = await gateAndRead({ exec, user, slot, verb: VERB });
  if (read.refusal) return read.refusal;
  /* each named hero as the server holds it; a slot with no hero reads nothing and wears nothing (the function names it) */
  const heroes = [];
  for (const s of slots) {
    const [row] = s === slot ? [{ state: read.env }] : await exec(REFRESH_SQL, [user, s]);
    heroes.push({ slot: s, env: row && row.state && row.state.ok === true ? row.state : null });
  }
  const lines = wearLinesFor(heroes);
  const [row] = await exec(WEAR_SQL, [user, slotsLiteral(slots), JSON.stringify(lines), intentId]);
  const res = (row && row.res) || null;
  if (!res || res.ok !== true) {
    return { status: 409, body: { ok: false, verb: VERB, error: (res && res.error) || 'wear_refused', stage: 'wear', state: read.env } };
  }
  const envs = res.envelopes && typeof res.envelopes === 'object' ? res.envelopes : {};
  const own = envs[String(slot)] && envs[String(slot)].ok === true ? envs[String(slot)] : read.env;
  return { status: 200, body: { ...own, ok: true, verb: VERB, heroes: Array.isArray(res.heroes) ? res.heroes : [], envelopes: envs,
    ...(res.replayed === true ? { replayed: true } : {}) } };
}
