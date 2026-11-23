// ════════════════════════════════════════════════════════════════════════
// src/session/talent-intents.js — THE ROADS: THE SERVER'S BUILD, READ SAFELY, AND ITS PRESSES (lane/roads-sample, 2026-11-23).
//
// supabase/migrations/1064-roads-sample.sql. A hero's Talent build lives on the server (hero_talents); the client reads the `talents`
// section and sends intents naming a node and a pick, never a point count or a Level:
//   talentsOf(cs)                   the `talents` section through src/core/talents.js talentsSectionOf, plus the next fork on the suggested
//                                   road (display only), or null while the switch is off (the server projects null) or for none
//   spendSuggested(account, cs, plan)  ONE hr_talent_spend_suggested(p_slot, p_plan, p_idem): every point left along the server's
//                                   suggested order for the worn weapon, never a vow
//   spendTalent(account, cs, node, pick)  ONE hr_talent_spend(p_slot, p_node, p_pick, p_idem): one point on one node
// Refused settle_first (a hunt still being caught up): the hunter's own settle ONCE, then ONE ask under a NEW key (the first wrote
// nothing; src/session/catch-up.js's rule). On ok the hero is taken from the answer's envelope (rule 11), so points and nodes change only
// from the server.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';
import { catchingUp, newIdem } from './catch-up.js';
import { talentsSectionOf, nextFork } from '../core/talents.js';
import { disciplineOf } from '../data/hunt-roles.js';

const NODE = /^[a-z_][a-z_0-9.]{0,63}$/;
const PICK = /^[a-z_]{1,48}$/;
const PLANS = new Set(['party', 'solo']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const read = (cs, key) => (cs && typeof cs.read === 'function' ? cs.read(key) : undefined);

/* One parse per envelope: the section object is replaced whole by each envelope. */
const PARSED = new WeakMap();

/**
 * The hero's Roads as the server holds them, or null (switch off, no hero). `roleKey` is the worn set's role key (hunt-roles.js
 * ROLE_KEYS) the next fork is read for; `plan` 'party' (the default: the company joins at Level 5) or 'solo'.
 * @returns {null | { live: true, level: number, points: number, spent: number, left: number, nodes: object, borrowed: string[],
 *   vowSlots: number, fork: null | { id: string, n: string, move: string|null, cost: number, options: object[] } }}
 */
export function talentsOf(cs, roleKey, plan) {
  const sec = read(cs, 'talents');
  if (!isObj(sec)) return null;
  const p = PLANS.has(plan) ? plan : 'party';
  let byKey = PARSED.get(sec);
  if (!byKey) PARSED.set(sec, (byKey = new Map()));
  const k = String(roleKey) + '|' + p;
  if (byKey.has(k)) return byKey.get(k);
  const t = talentsSectionOf(sec);
  const disc = disciplineOf(roleKey);
  const out = t ? { ...t, left: Math.max(0, t.points - t.spent), fork: disc ? nextFork(t.nodes, disc, p) : null } : null;
  byKey.set(k, out);
  return out;
}

/* `send` asks once under a fresh key (each verb names its own RPC, so the client's whole surface reads in one grep) */
async function press(cs, verb, send) {
  return askVia(cs, verb, async () => {
    let ans = await send();
    if (catchingUp(ans) && typeof cs.hello === 'function') {
      try { await cs.hello(); } catch (e) { /* the second ask's own answer says what the server holds */ }
      ans = await send();
    }
    const b = ans && isObj(ans.body) ? ans.body : {};
    if (!(ans && ans.ok && b.ok === true)) {
      await afterRefusal(cs, ans);   // the screen was behind the server: re-read once (A20)
      return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused' };
    }
    /* the answer carries the hero as the press left it (1064 `envelope`, rule 11); a replayed receipt has none, so the hero is read */
    if (typeof cs.load === 'function') await cs.load(isObj(b.envelope) ? b.envelope : null);
    return { ok: true, spent: Number.isSafeInteger(b.spent) ? b.spent : null };
  });
}

/** "Spend as suggested": every point left on the server's suggested road for plan `plan`. */
export function spendSuggested(account, cs, plan) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !PLANS.has(plan)) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return press(cs, 'talent_suggested', () => account.server.rpc('hr_talent_spend_suggested', { p_slot: cs.slot, p_plan: plan, p_idem: newIdem() }));
}

/** One point on node `node` (with option `pick` at a crossroads, else null). */
export function spendTalent(account, cs, node, pick) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !NODE.test(String(node))
    || !(pick === null || PICK.test(String(pick)))) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return press(cs, 'talent_spend', () => account.server.rpc('hr_talent_spend', { p_slot: cs.slot, p_node: node, p_pick: pick, p_idem: newIdem() }));
}
