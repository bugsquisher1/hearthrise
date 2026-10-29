// ════════════════════════════════════════════════════════════════════════
// src/shell/loot-dispatch.js — THE LOOT PLAN AND "DISPATCH LOOT".
//
// Tyler 2026-10-25: every item carries a destination plan — Keep in bag, Deposit
// in storage, Sell — and nothing moves at pickup any more; "Dispatch loot" runs the
// plans in town (hr_loot_dispatch, supabase/migrations/2027-01-23-loot-dispatch.sql).
// "Don't pick up" stays the pickup filter, a choice of its own. The server owns
// every number: this module names the choices, says why a control is off from the
// server's own sections, and turns the server's ONE answer into one line.
//   LOOT_CHOICES / planWords      the three plans and the pickup filter, in menu order
//   planBlock(id, plan, bids)     why a plan is off for this item, or ''
//   dispatchBlock(cs)             why Dispatch loot is off right now, or ''
//   dispatchWords(answer)         "Stored 9 stacks, sold 5 for 1,240 gp. 2 didn't fit: Storage is full."
//   runDispatch(account, cs, sc, repaint)  ONE hr_loot_dispatch (src/session/loot-intents.js); the window's
//                                 controls off until it answers
// The Inventory (its item menu, its This hunt tab, its tools row) and the Storage
// window read this; the bag and Storage change only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { START_INVENTORY, START_EQUIPMENT } from '../data/start-kit.js?v=0.2.64';
import { bagOf, rulesOf } from '../session/item-sections.js?v=0.2.64';
import { huntOf } from '../session/hunt-sections.js?v=0.2.64';
import { whole, gold } from '../render/format.js?v=0.2.64';
import { dispatchLoot } from '../session/loot-intents.js?v=0.2.64';
import { runIntent, refusalWords } from './intent-words.js?v=0.2.64';

/** The three plans, then the pickup filter: [rule, words, group]. The rule is the server's word (player_item_rules.loot_rule). */
export const LOOT_CHOICES = Object.freeze([
  Object.freeze(['keep', 'Keep in bag', 'plan']),
  Object.freeze(['deposit', 'Deposit in storage', 'plan']),
  Object.freeze(['sell', 'Sell', 'plan']),
  Object.freeze(['ignore', 'Don\'t pick up', 'pickup']),
]);
const WORDS = new Map(LOOT_CHOICES.map(([v, w]) => [v, w]));
/** The words for a rule the server holds (no rule = Keep in bag). */
export const planWords = (rule) => WORDS.get(rule || 'keep') || WORDS.get('keep');

/* The hero's starting kit (src/data/start-kit.js, the source the server's hr_start_inventory is generated from): it
   may be deposited but takes no Sell plan (hr_loot_plan_refusal 'start_kit': no gold from the kit). */
const KIT = new Set([...Object.keys(START_INVENTORY), ...Object.values(START_EQUIPMENT)]);
const MOVES = new Set(['deposit', 'sell']);

/** Why `plan` is off for item `id`, or '' — the server's two refusals by item, said before the press. `bids`: the shop's. */
export function planBlock(id, plan, bids) {
  if (!MOVES.has(plan)) return '';
  if (plan === 'sell' && KIT.has(id)) return 'The shop does not buy back your starting kit.';
  if (plan === 'sell' && bids && !bids.has(id)) return 'The shop does not buy this.';
  return '';
}

/** Why Dispatch loot is off for this hero now, or '' (from the server's bag, rules and hunt; nothing planned = off). */
export function dispatchBlock(cs) {
  const h = huntOf(cs);
  if (h && !h.ended) return 'Your hero is out hunting. Dispatch loot works in town.';
  const rules = rulesOf(cs), bag = bagOf(cs);
  if (!rules || !bag) return 'Reading your bag…';
  const planned = bag.some((r) => MOVES.has(rules.loot[r.id]) && !rules.locked.has(r.id) && !(rules.loot[r.id] === 'sell' && KIT.has(r.id)));
  return planned ? '' : 'Nothing in your bag has a Deposit or Sell plan yet. Give an item one from its menu in the Inventory (B).';
}

const stacks = (n) => whole(n) + (n === 1 ? ' stack' : ' stacks');
const num = (v) => (Number.isSafeInteger(v) && v > 0 ? v : 0);

/** The server's answer in one line. Every number is the answer's own. */
export function dispatchWords(a) {
  if (!a || typeof a !== 'object') return 'Done.';
  const stored = num(a.stored && a.stored.stacks), sold = num(a.sold && a.sold.stacks), g = num(a.sold && a.sold.gold);
  const unplaced = num(a.unplaced && a.unplaced.stacks);
  const kept = a.kept || {};
  const did = [];
  if (stored) did.push('stored ' + stacks(stored));
  if (sold) did.push('sold ' + whole(sold) + ' for ' + gold(g));
  let line = did.length ? did.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.' : 'Nothing moved.';
  if (typeof a.sell_refused === 'string' && a.sell_refused) line += ' Nothing sold: ' + refusalWords(a.sell_refused, 'loot_dispatch');
  if (unplaced) line += ' ' + whole(unplaced) + ' didn\'t fit: Storage is full.';
  if (num(kept.locked)) line += ' ' + stacks(num(kept.locked)) + ' locked, so kept.';
  if (num(kept.later)) line += ' ' + stacks(num(kept.later)) + ' more next press.';
  return line;
}

/** ONE Dispatch loot for the window whose scratch is `sc`; the answer's line replaces the busy words. */
export function runDispatch(account, cs, sc, repaint) {
  return runIntent(sc, repaint, () => dispatchLoot(account, cs), 'Dispatching your loot…', (r) => dispatchWords(r.dispatch), cs);
}
