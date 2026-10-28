// ════════════════════════════════════════════════════════════════════════
// src/session/tally-intents.js — THE TALLY VERBS: HER BOARD, TAKE, GIVE UP, SET, BE PAID.
//
// Each names only this character's slot and catalogue ids (a task, a weight, a
// slot order), never a count, a price or a reward; the server counts the kills,
// prices the reward, picks the piece and journals it
// (supabase/migrations/2026-12-23-tally-tasks.sql):
//   tallyBoard(account, cs)               hr_tally_view: her board as this hero would be paid now
//   takeTask(account, cs, task, weight)   hr_tally_accept (in town; the weight once, then optional)
//   dropTask(account, cs, task)           hr_tally_drop (the count is lost)
//   setTally(account, cs, change)         hr_tally_set: { task, keep } and/or { weight } and/or { order }
//   collectTally(account, cs)             hr_tally_collect: in town, be paid what is done and due
// On ok the character is RE-READ, so the board changes only from the server's
// envelope. Each is one ask in the account's intent ledger (askVia), so the pressed
// control waits on it.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.63';
import { TALLY_RULES } from '../data/tally-tasks.js?v=0.2.63';
import { parseTally } from './tally-sections.js?v=0.2.63';

const ID = /^[a-z0-9_]{1,40}$/;
const newIdem = () => globalThis.crypto.randomUUID();
const usable = (account, cs) => !!account && !!account.server && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot);
const refuse = () => Promise.resolve({ ok: false, error: 'bad_intent' });
const weightOk = (w) => TALLY_RULES.weights.includes(w);

/* The board row's small facts, bounded; the pick named by ids only. */
function boardRow(r) {
  if (!r || typeof r !== 'object' || !ID.test(String(r.task)) || !ID.test(String(r.hunt)) || !ID.test(String(r.monster))) return null;
  const n = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
  const p = r.pick && typeof r.pick === 'object' && /^[a-z0-9_]{1,64}$/.test(String(r.pick.item))
    ? Object.freeze({ kind: r.pick.pick === 'piece' ? 'piece' : 'material', item: r.pick.item, qty: n(r.pick.qty) || 1 }) : null;
  if (n(r.target) === null || n(r.gold) === null) return null;
  return Object.freeze({ task: r.task, hunt: r.hunt, monster: r.monster, target: r.target, gold: r.gold, party: r.party === true,
    bandMin: n(r.band_min), held: r.held === true, pick: p });
}

async function settled(ans, cs) {
  const b = ans && ans.body && typeof ans.body === 'object' && !Array.isArray(ans.body) ? ans.body : {};
  if (ans && ans.ok && b.ok === true) {
    if (typeof cs.load === 'function') await cs.load();
    const paid = Array.isArray(b.paid) ? b.paid.length : 0;
    return { ok: true, paid, wait: typeof b.wait === 'string' ? b.wait : null };
  }
  return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused' };
}

/** Her board: { ok, board: [row], hunting, tally } — a read the player asked for (opening her window). */
export function tallyBoard(account, cs) {
  if (!usable(account, cs)) return refuse();
  return askVia(cs, 'tally_view', async () => {
    const ans = await account.server.rpc('hr_tally_view', { p_slot: cs.slot });
    const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
    if (!(ans && ans.ok && b.ok === true)) return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused' };
    return { ok: true, board: Object.freeze((Array.isArray(b.board) ? b.board : []).map(boardRow).filter(Boolean)),
      hunting: b.hunting === true, tally: parseTally(b.tally) };
  });
}

/** Take a task at her board (the armour weight once; later null keeps the hero's). */
export function takeTask(account, cs, task, weight) {
  if (!usable(account, cs) || !ID.test(String(task)) || (weight != null && !weightOk(weight))) return refuse();
  return askVia(cs, 'tally_accept', async () => settled(await account.server.rpc('hr_tally_accept',
    { p_slot: cs.slot, p_task: task, p_weight: weight == null ? null : weight, p_idem: newIdem() }), cs));
}

/** Give a held task up. */
export function dropTask(account, cs, task) {
  if (!usable(account, cs) || !ID.test(String(task))) return refuse();
  return askVia(cs, 'tally_drop', async () => settled(await account.server.rpc('hr_tally_drop',
    { p_slot: cs.slot, p_task: task, p_idem: newIdem() }), cs));
}

/** Keep a task, choose her armour weight, or reorder her slots: { task, keep } | { weight } | { order }. */
export function setTally(account, cs, change) {
  const c = change && typeof change === 'object' ? change : {};
  const hasKeep = c.task !== undefined || c.keep !== undefined;
  if (!usable(account, cs) || (hasKeep && (!ID.test(String(c.task)) || typeof c.keep !== 'boolean'))
    || (c.weight !== undefined && !weightOk(c.weight))
    || (c.order !== undefined && (!Array.isArray(c.order) || c.order.length !== TALLY_RULES.slotOrder.length
      || new Set(c.order).size !== c.order.length || !c.order.every((s) => TALLY_RULES.slotOrder.includes(s))))
    || (!hasKeep && c.weight === undefined && c.order === undefined)) return refuse();
  return askVia(cs, 'tally_set', async () => settled(await account.server.rpc('hr_tally_set', {
    p_slot: cs.slot, p_task: hasKeep ? c.task : null, p_keep: hasKeep ? c.keep : null,
    p_weight: c.weight === undefined ? null : c.weight, p_order: c.order === undefined ? null : c.order, p_idem: newIdem() }), cs));
}

/** In town: be paid what is done and due (the server says what, if anything). */
export function collectTally(account, cs) {
  if (!usable(account, cs)) return refuse();
  return askVia(cs, 'tally_collect', async () => settled(await account.server.rpc('hr_tally_collect', { p_slot: cs.slot, p_idem: newIdem() }), cs));
}
