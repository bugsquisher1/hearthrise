// ════════════════════════════════════════════════════════════════════════
// src/session/time-intents.js — BOUGHT TIME: THE STANDING RULE'S PRESSES (lane B1, supabase/migrations/1071-work-blocks.sql).
//
// A block itself is bought by CharacterSession.buyTime (hr_time_buy). These are the two SETTINGS beside it, each one RPC under a fresh
// key, never a number the server does not check:
//   setTimeRule(account, cs, kind, upTo)   ONE hr_time_auto_set(p_kind, p_slot, p_up_to, p_max_price, p_idem): the hero's "buy up to N
//                                          blocks of this kind a day" (0 = off, the default). The server buys them (its sweep), never this
//   answerTimeOffer(account, cs, upTo)     ONE hr_time_offer_answer(p_slot, p_up_to, p_idem): the account's one answer to the coach card
//                                          (12-targets 9.3): a choice sets every hero's rule, 0 is Not now. H1 paints the card
// On ok the hero is taken from the answer's envelope (rule 11); a refusal re-reads once (A20).
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';
import { newIdem } from './catch-up.js';

const KINDS = new Set(['hunt', 'work']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** An answer whose body carries `envelope` (rule 11), restated as that envelope so CharacterSession._settled takes it as a load. */
export function envelopeOf(ans) {
  const b = ans && ans.ok && isObj(ans.body) && ans.body.ok === true ? ans.body : null;
  return b && isObj(b.envelope) ? Object.assign({}, ans, { body: b.envelope }) : ans;
}

async function press(cs, send) {
  const ans = await send();
  const b = ans && isObj(ans.body) ? ans.body : {};
  if (!(ans && ans.ok && b.ok === true)) {
    await afterRefusal(cs, ans);
    return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused' };
  }
  if (typeof cs.load === 'function') await cs.load(isObj(b.envelope) ? b.envelope : null);
  return { ok: true };
}

const ready = (account, cs) => !!(account && account.server && cs && cs.status !== 'closed' && Number.isInteger(cs.slot));
const blocks = (n) => Number.isInteger(n) && n >= 0 && n <= 24;

/** The hero's standing rule for `kind`: buy up to `upTo` blocks a UTC day (0 turns it off). */
export function setTimeRule(account, cs, kind, upTo) {
  if (!ready(account, cs) || !KINDS.has(kind) || !blocks(upTo)) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'time_auto', () => press(cs, () => account.server.rpc('hr_time_auto_set',
    { p_kind: kind, p_slot: cs.slot, p_up_to: upTo, p_max_price: null, p_idem: newIdem() })));
}

/** The account's answer to the block-rule card: one of its choices, or 0 for Not now. */
export function answerTimeOffer(account, cs, upTo) {
  if (!ready(account, cs) || !blocks(upTo)) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'time_offer', () => press(cs, () => account.server.rpc('hr_time_offer_answer',
    { p_slot: cs.slot, p_up_to: upTo, p_idem: newIdem() })));
}
