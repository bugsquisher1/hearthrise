// ════════════════════════════════════════════════════════════════════════
// src/shell/loot-dispatch.js — THE LOOT PLAN AND "DISPATCH LOOT".
//
// Tyler 2026-10-25: every item carries a destination plan — Keep in bag, Deposit
// in storage, Sell — and nothing moves at pickup any more; "Dispatch loot" runs the
// plans in town (hr_loot_dispatch, supabase/migrations/2027-01-23-loot-dispatch.sql).
// "Don't pick up" stays the pickup filter, a choice of its own. The server owns
// every number: this module names the choices, says why a control is off from the
// server's own sections, and turns the server's ONE answer into one line.
//   LOOT_CHOICES / planWords      the plans and the pickup filter, in menu order
//   planShown(cs, id, plan)       whether a plan is offered for this item at all (the two Luck plans only where the server's luck
//                                 section names the item: Salvage a stack it prices in rivets, Use the Lucky Rivet; dark, neither)
//   salvageWords(cs, id)          the line beside Salvage: "12 Lucky Rivets", or "No rivets: bought or crafted" past the allowance
//   planBlock(id, plan, bids)     why a plan is off for this item, or ''
//   dispatchBlock(cs)             why Dispatch loot is off right now, or ''
//   dispatchWords(answer)         "Stored 9 stacks, sold 5 for 1,240 gp. 2 didn't fit: Storage is full."
//   runDispatch(account, cs, sc, repaint)  ONE hr_loot_dispatch (src/session/loot-intents.js); the window's
//                                 controls off until it answers
// The Inventory (its item menu, its This hunt tab, its tools row) and the Storage
// window read this; the bag and Storage change only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { isStartKit } from './bag-model.js?v=0.2.142';
import { bagOf, rulesOf } from '../session/item-sections.js?v=0.2.142';
import { huntOf } from '../session/hunt-sections.js?v=0.2.142';
import { whole, gold } from '../render/format.js?v=0.2.142';
import { dispatchLoot } from '../session/loot-intents.js?v=0.2.142';
import { runIntent, refusalWords } from './intent-words.js?v=0.2.142';
import { t } from '../render/player-text.js?v=0.2.142';
import { busyWords } from './training-words.js?v=0.2.142';
import { luckOf } from '../session/luck-sections.js?v=0.2.142';
import { LUCK_ITEM } from '../data/luck.js?v=0.2.142';

/** The plans, then the pickup filter: [rule, words, group]. The rule is the server's word (player_item_rules.loot_rule). Salvage and Use
    are Luck's (1013-luck.sql), offered only where planShown says. */
export const LOOT_CHOICES = Object.freeze([
  Object.freeze(['keep', t('controls.keep'), 'plan']),
  Object.freeze(['deposit', t('controls.deposit'), 'plan']),
  Object.freeze(['sell', t('controls.sell'), 'plan']),
  Object.freeze(['salvage', t('shop.plan_salvage'), 'plan']),
  Object.freeze(['use', t('shop.plan_use'), 'plan']),
  Object.freeze(['ignore', 'Don\'t pick up', 'pickup']),
]);
const LUCK_PLANS = new Set(['salvage', 'use']);

/** Whether `plan` is offered for item `id` at all: every plan always, but Salvage only for a stack the server's luck section prices in
    rivets and Use only for the Lucky Rivet, both only while that section is there (the `luck` switch on for the account). */
export function planShown(cs, id, plan) {
  if (!LUCK_PLANS.has(plan)) return true;
  const lk = luckOf(cs);
  if (!lk) return false;
  return plan === 'use' ? id === LUCK_ITEM : lk.salvage.has(id);
}

/** The line beside Salvage, the server's numbers: the rivets one piece pays, or why it pays none (past the account's allowance). */
export function salvageWords(cs, id) {
  const lk = luckOf(cs);
  const x = lk ? lk.salvage.get(id) : null;
  if (!x) return '';
  return x.left > 0 ? t('shop.salvage_rivets', { n: whole(x.rivets) }) : t('shop.salvage_none');
}
const WORDS = new Map(LOOT_CHOICES.map(([v, w]) => [v, w]));
/** The words for a rule the server holds (no rule = Keep in bag). */
export const planWords = (rule) => WORDS.get(rule || 'keep') || WORDS.get('keep');

/* The hero's starting kit may be deposited but takes no Sell plan (hr_loot_plan_refusal 'start_kit': no gold from the kit). */
const MOVES = new Set(['deposit', 'sell', 'salvage', 'use']);

/** Why `plan` is off for item `id`, or '' — the server's two refusals by item, said before the press. `bids`: the shop's.
    The shop's section bids only on what the bag HOLDS (hr_shop_view), so a stack the bag no longer holds (sold at
    the shop after this hunt: playtest 2026-10-29, "Decide once" rang a Sell its row called off) has no bid to read:
    pass `held` false and the server's own refusal answers the press. */
export function planBlock(id, plan, bids, held = true) {
  if (!MOVES.has(plan)) return '';
  if (plan === 'sell' && isStartKit(id)) return 'Shop doesn\'t buy starting kit';
  if (plan === 'sell' && held && bids && !bids.has(id)) return 'The shop does not buy this.';
  return '';
}

/** Why Dispatch loot is off for this hero now, or '' (from the server's bag, rules and hunt; nothing planned = off). */
export function dispatchBlock(cs) {
  const h = huntOf(cs);
  if (h && !h.ended) return busyWords(cs, 'Dispatch loot works in town');
  const rules = rulesOf(cs), bag = bagOf(cs);
  if (!rules || !bag) return 'Loading bag…';
  const planned = bag.some((r) => MOVES.has(rules.loot[r.id]) && !rules.locked.has(r.id) && !(rules.loot[r.id] === 'sell' && isStartKit(r.id)));
  if (planned) return '';
  /* A plan that has run is not "nothing set" (designer re-read 2026-11-11: that line stood right under "Sold 17 for 5,407 gp."). The words on the
     item menu, and no "in the Inventory (B)" said inside the Inventory (core-loop play 2026-10-30). */
  return Object.values(rules.loot).some((v) => MOVES.has(v)) ? t('shop.dispatch_all_moved') : t('shop.dispatch_none_set');
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
  if (sold) did.push('sold ' + stacks(sold) + ' for ' + gold(g));
  /* LUCK: "Salvaged 41. 492 Lucky Rivets. Used 492: +492 Luck" (the answer's own numbers) */
  const salv = num(a.salvaged && a.salvaged.units), used = num(a.used && a.used.rivets);
  let line = did.length ? did.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.' : (salv || used ? '' : 'Nothing moved.');
  if (salv) line += (line ? ' ' : '') + t('shop.dispatch_salvaged', { units: whole(salv), rivets: whole(num(a.salvaged.rivets)) }) + '.';
  if (used) line += (line ? ' ' : '') + t('shop.dispatch_used', { rivets: whole(used) }) + '.';
  if (num(kept.no_rivets)) line += ' ' + t('shop.dispatch_no_rivets', { stacks: stacks(num(kept.no_rivets)) }) + '.';
  if (typeof a.sell_refused === 'string' && a.sell_refused) line += ' Nothing sold: ' + refusalWords(a.sell_refused, 'loot_dispatch');
  if (unplaced) line += ' ' + whole(unplaced) + ' didn\'t fit: Storage is full.';
  if (num(kept.locked)) line += ' ' + stacks(num(kept.locked)) + ' locked, so kept.';
  if (num(kept.later)) line += ' ' + stacks(num(kept.later)) + ' more next press.';
  return line;
}

/** ONE Dispatch loot for the window whose scratch is `sc`; the answer's line replaces the busy words. */
export function runDispatch(account, cs, sc, repaint) {
  return runIntent(sc, repaint, () => dispatchLoot(account, cs), 'Dispatching loot…', (r) => dispatchWords(r.dispatch), cs);
}
