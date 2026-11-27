// ════════════════════════════════════════════════════════════════════════
// src/session/talent-intents.js — THE ROADS: ITS PRESSES (lane/roads-sample, 2026-11-23).
//
// supabase/migrations/1064-roads-sample.sql (1069, 1073). A hero's Talent build lives on the server (hero_talents); the client reads the `talents`
// section (src/session/talent-sections.js talentsOf) and sends intents naming a node and a pick, never a point count or a Level:
//   spendSuggested(account, cs, plan)  ONE hr_talent_spend_suggested(p_slot, p_plan, p_idem): every point left along the server's
//                                   suggested order for the worn weapon, never a vow
//   spendTalent(account, cs, node, pick)  ONE hr_talent_spend(p_slot, p_node, p_pick, p_idem): one point on one node
//   setTalentAuto(account, cs, plan)  ONE hr_talent_auto_set(p_slot, p_plan, p_idem) (1069-talent-standing-rule.sql): the standing rule
//                                   "Spend as suggested", a plan word ('party' | 'solo') or null (off); turning it on spends every point
//                                   left now. A SETTING the server holds (player_state.talent_auto), projected as the section's `auto`
//   saveBuild(account, cs, hunt, nodes)   ONE hr_talent_build_save(p_slot, p_hunt, p_nodes, p_idem): a saved build (a plan, past the
//                                   hero's Level allowed) for one ground, checked whole by the server; nodes null deletes it. A pasted
//                                   share code lands here (src/session/plan-share.js): it spends nothing
//   spendPlan(account, cs, hunt)    ONE hr_talent_spend_plan(p_slot, p_hunt, p_idem) (1073-talents-plan-server.sql): "Spend on plan", every
//                                   point the saved build for the hero's planned hunt can take now, in map order, walked by the server.
//                                   `hunt` is the ground the screen shows the plan for, only compared (plan_changed when it moved)
// Refused settle_first (a hunt still being caught up): the hunter's own settle ONCE, then ONE ask under a NEW key (the first wrote
// nothing; src/session/catch-up.js's rule). On ok the hero is taken from the answer's envelope (rule 11), so points and nodes change only
// from the server.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';
import { catchingUp, newIdem } from './catch-up.js';

const NODE = /^[a-z_][a-z_0-9.]{0,63}$/;
const PICK = /^[a-z_]{1,48}$/;
const PLANS = new Set(['party', 'solo']);
const HUNT = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/* `send` asks once under a fresh key (each verb names its own RPC, so the client's whole surface reads in one grep). Each verb is its
   own askVia site (tests/session-core.mjs REFUSE-ASKVIA drives every RPC of a `rule` site), and this is the one rule they share. */
async function press(cs, send) {
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
}

/** "Spend as suggested": every point left on the server's suggested road for plan `plan`. */
export function spendSuggested(account, cs, plan) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !PLANS.has(plan)) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'talent_suggested', () => press(cs, () => account.server.rpc('hr_talent_spend_suggested', { p_slot: cs.slot, p_plan: plan, p_idem: newIdem() })));
}

/** The standing rule: "Spend as suggested" for plan `plan` as each Level comes, or null to turn it off. */
export function setTalentAuto(account, cs, plan) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !(plan === null || PLANS.has(plan))) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'talent_auto', () => press(cs, () => account.server.rpc('hr_talent_auto_set', { p_slot: cs.slot, p_plan: plan, p_idem: newIdem() })));
}

/** One point on node `node` (with option `pick` at a crossroads, else null). */
export function spendTalent(account, cs, node, pick) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !NODE.test(String(node))
    || !(pick === null || PICK.test(String(pick)))) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'talent_spend', () => press(cs, () => account.server.rpc('hr_talent_spend', { p_slot: cs.slot, p_node: node, p_pick: pick, p_idem: newIdem() })));
}

/** A saved build for ground `hunt` ({ nodeId: value }, or null to delete it). The server checks every node against its catalogue. */
export function saveBuild(account, cs, hunt, nodes) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !HUNT.test(String(hunt))
    || !(nodes === null || (isObj(nodes) && Object.keys(nodes).every((id) => NODE.test(id))))) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'talent_build', () => press(cs, () => account.server.rpc('hr_talent_build_save', { p_slot: cs.slot, p_hunt: hunt, p_nodes: nodes, p_idem: newIdem() })));
}

/** "Spend on plan": the server pays the saved build for ground `hunt` (the hero's planned hunt) as far as the points go, in one press. */
export function spendPlan(account, cs, hunt) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !HUNT.test(String(hunt))) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'talent_plan', () => press(cs, () => account.server.rpc('hr_talent_spend_plan', { p_slot: cs.slot, p_hunt: hunt, p_idem: newIdem() })));
}
