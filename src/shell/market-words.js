// ════════════════════════════════════════════════════════════════════════
// src/shell/market-words.js — WHAT A MARKET REFUSAL SAYS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. The design's refusal table (docs/planning/PRIORITY_BOARD.md, "Marketplace design
// (2026-10-24)"): one sentence per code, naming the number or the hero the server's answer
// or section gives. intent-words.js refusalText asks here first for a market verb; a code
// not named here reads from src/data/refusal-words.js like every other.
// ════════════════════════════════════════════════════════════════════════
import { whole, listWords } from '../render/format.js?v=0.2.138';
import { depotOf } from '../session/item-sections.js?v=0.2.138';

/** Why the Weighhouse won't list a stack, by the server's `why` (hr_market_items: its one listable rule). The sentence is the rule, never a guess. */
const NO_BUYER = 'not bought by the shop, own use only';
const WHY_NOT = Object.freeze({
  start_kit: 'starting kit',
  no_value: NO_BUYER,
  no_shop_price: NO_BUYER,
  untradeable: 'gifts and trophies',
  premium: 'premium rewards',
});
const capital = (s) => s[0].toUpperCase() + s.slice(1);
/** The one stack's refusal: "These can't be sold to other players: every new hero starts with some, even if you made yours." */
export function notListableWords(why) {
  return 'These can\'t be sold to other players' + (Object.prototype.hasOwnProperty.call(WHY_NOT, why) ? ': ' + WHY_NOT[why] + '.' : '.');
}
/**
 * The Sell tab's line over what it leaves out, each stack with its reason: "2 stacks here can't be sold to other players. Cooked
 * Shrimp: every new hero starts with some, ...". `kept`: [{ name, why }] from the server's summaries.
 */
export function keptWords(kept) {
  if (!kept.length) return '';
  const byWhy = new Map();
  for (const k of kept) { const said = WHY_NOT[k.why] || 'not tradeable'; byWhy.set(said, [...(byWhy.get(said) || []), k.name]); }
  return whole(kept.length) + (kept.length === 1 ? ' stack' : ' stacks') + ' here can\'t be sold to other players. '
    + Array.from(byWhy, ([said, names]) => listWords(names) + ': ' + said + '.').join(' ');
}

const MARKET_VERBS = new Set(['market_list', 'market_buy', 'market_cancel', 'market_browse', 'market_item', 'market_mine']);

/** Who the Weighhouse trades with, in the server's numbers: a refusal's, or the rules row's in the window. */
export const lockedWords = (minLevel, minSkill) => 'Requires Level ' + whole(minLevel) + ' or a bench skill at ' + whole(minSkill);

/** The next UTC midnight as this player's clock reads it (display only): when the daily counts reset. */
function resetWords() {
  const now = new Date();
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const WORDS = Object.freeze({
  insufficient_item: () => 'Not enough left',
  price_below_shop: (f) => (f.floor === undefined ? 'Below the shop price'
    : 'Below the shop price: ' + whole(f.floor) + ' each'),
  price_above_cap: (f) => 'Above the highest price' + (f.ceiling === undefined ? '' : ': ' + whole(f.ceiling) + ' each'),
  storage_no_room: (f, cs) => {
    const d = cs ? depotOf(cs) : null;
    return 'Storage full for unsold items, build ' + (d && d.next ? 'the ' + d.next.name : 'another chest');
  },
  too_many_listings: (f) => 'Max listings: ' + whole(f.limit),
  list_daily_cap: (f) => 'Daily limit: ' + whole(f.limit) + ' listings, resets at ' + resetWords(),
  insufficient_gold: (f, cs, r) => (r.verb === 'market_list' ? 'Listing fee: ' + whole(f.need) + ' gold'
    : 'Need ' + whole(f.need) + ' gold, have ' + whole(f.have)),
  not_enough: (f) => (f.available === undefined ? 'There aren\'t that many left at that price.'
    : 'Only ' + whole(f.available) + (f.available === 1 ? ' is' : ' are') + ' left at that price.'),
  bag_full: (f, cs) => 'Bag full, send it to storage',
  market_locked: (f) => (f.min_level === undefined || f.min_skill_level === undefined ? null : lockedWords(f.min_level, f.min_skill_level)),
});

/** The sentence for a refused market verb, or null when the general table says it. @param {object} r refusalOf's answer */
export function marketRefusal(r, cs) {
  if (!r || !MARKET_VERBS.has(r.verb) || !Object.prototype.hasOwnProperty.call(WORDS, r.error)) return null;
  return WORDS[r.error](r.figures || {}, cs, r);
}
