// ════════════════════════════════════════════════════════════════════════
// src/shell/market-words.js — WHAT A MARKET REFUSAL SAYS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. The design's refusal table (docs/planning/PRIORITY_BOARD.md, "Marketplace design
// (2026-10-24)"): one sentence per code, naming the number or the hero the server's answer
// or section gives. intent-words.js refusalText asks here first for a market verb; a code
// not named here reads from src/data/refusal-words.js like every other.
// ════════════════════════════════════════════════════════════════════════
import { whole, listWords } from '../render/format.js?v=0.2.134';
import { depotOf } from '../session/item-sections.js?v=0.2.134';

/** Why the Weighhouse won't list a stack, by the server's `why` (hr_market_items: its one listable rule). The sentence is the rule, never a guess.
    `say` follows "You can't sell these to other players."; `tag` heads its names in the Sell tab's list. */
const NO_BUYER = Object.freeze({ say: 'The shop won\'t buy them, so they\'re yours to use.', tag: 'no shop value' });
const WHY_NOT = Object.freeze({
  start_kit: { say: 'Every new hero starts with them.', tag: 'starting kit' },
  no_value: NO_BUYER,
  no_shop_price: NO_BUYER,
  untradeable: { say: 'Gifts and trophies stay with you.', tag: 'gift or trophy' },
  premium: { say: 'Premium rewards stay with you.', tag: 'premium reward' },
});
const capital = (s) => s[0].toUpperCase() + s.slice(1);
/** The one stack's refusal: "You can't sell these to other players. Every new hero starts with them." */
export function notListableWords(why) {
  return 'You can\'t sell these to other players.' + (Object.prototype.hasOwnProperty.call(WHY_NOT, why) ? ' ' + WHY_NOT[why].say : '');
}
/**
 * The Sell tab's line over what it leaves out, by reason: "3 stacks can't be sold to other players. Starting kit: Cooked
 * Shrimp and Bread. Gift or trophy: Wolf Trophy." `kept`: [{ name, why }] from the server's summaries.
 */
export function keptWords(kept) {
  if (!kept.length) return '';
  const byWhy = new Map();
  for (const k of kept) { const said = Object.prototype.hasOwnProperty.call(WHY_NOT, k.why) ? WHY_NOT[k.why].tag : 'not tradeable'; byWhy.set(said, [...(byWhy.get(said) || []), k.name]); }
  return whole(kept.length) + (kept.length === 1 ? ' stack' : ' stacks') + ' can\'t be sold to other players. '
    + Array.from(byWhy, ([said, names]) => capital(said) + ': ' + listWords(names) + '.').join(' ');
}

const MARKET_VERBS = new Set(['market_list', 'market_buy', 'market_cancel', 'market_browse', 'market_item', 'market_mine']);

/** Who the Weighhouse trades with, in the server's numbers: a refusal's, or the rules row's in the window. */
export const lockedWords = (minLevel, minSkill) => 'The Weighhouse opens to you at Level ' + whole(minLevel) + ', or once a crafting skill reaches ' + whole(minSkill) + '.';

/** The next UTC midnight as this player's clock reads it (display only): when the daily counts reset. */
function resetWords() {
  const now = new Date();
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const WORDS = Object.freeze({
  insufficient_item: () => 'You don\'t have that many left.',
  price_below_shop: (f) => (f.floor === undefined ? 'That\'s below the shop price.'
    : 'That\'s below the shop price of ' + whole(f.floor) + ' gp each.'),
  price_above_cap: (f) => 'That\'s above the highest price allowed' + (f.ceiling === undefined ? '.' : ', ' + whole(f.ceiling) + ' gp each.'),
  storage_no_room: (f, cs) => {
    const d = cs ? depotOf(cs) : null;
    return 'Your storage has no room for unsold items. Build ' + (d && d.next ? 'the ' + d.next.name : 'another chest') + ' first.';
  },
  too_many_listings: (f) => 'You can only have ' + whole(f.limit) + ' listings at once.',
  list_daily_cap: (f) => 'You\'ve hit today\'s limit of ' + whole(f.limit) + ' listings. It resets at ' + resetWords() + '.',
  insufficient_gold: (f, cs, r) => (r.verb === 'market_list' ? 'You need ' + whole(f.need) + ' gp for the listing fee.'
    : 'You need ' + whole(f.need) + ' gp. You have ' + whole(f.have) + '.'),
  not_enough: (f) => (f.available === undefined ? 'There aren\'t that many left at that price.'
    : 'Only ' + whole(f.available) + (f.available === 1 ? ' is' : ' are') + ' left at that price.'),
  bag_full: (f, cs) => 'Your bag is full. Send it to storage instead.',
  market_locked: (f) => (f.min_level === undefined || f.min_skill_level === undefined ? null : lockedWords(f.min_level, f.min_skill_level)),
});

/** The sentence for a refused market verb, or null when the general table says it. @param {object} r refusalOf's answer */
export function marketRefusal(r, cs) {
  if (!r || !MARKET_VERBS.has(r.verb) || !Object.prototype.hasOwnProperty.call(WORDS, r.error)) return null;
  return WORDS[r.error](r.figures || {}, cs, r);
}
