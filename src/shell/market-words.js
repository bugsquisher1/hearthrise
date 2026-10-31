// ════════════════════════════════════════════════════════════════════════
// src/shell/market-words.js — WHAT A MARKET REFUSAL SAYS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. The design's refusal table (docs/planning/PRIORITY_BOARD.md, "Marketplace design
// (2026-10-24)"): one sentence per code, naming the number or the hero the server's answer
// or section gives. intent-words.js refusalText asks here first for a market verb; a code
// not named here reads from src/data/refusal-words.js like every other.
// ════════════════════════════════════════════════════════════════════════
import { whole } from '../render/format.js?v=0.2.78';
import { depotOf, nameOf } from '../session/item-sections.js?v=0.2.78';

const MARKET_VERBS = new Set(['market_list', 'market_buy', 'market_cancel', 'market_browse', 'market_item', 'market_mine']);

/** The next UTC midnight as this player's clock reads it (display only): when the daily counts reset. */
function resetWords() {
  const now = new Date();
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const WORDS = Object.freeze({
  insufficient_item: () => 'You don\'t have that many any more.',
  price_below_shop: (f) => (f.floor === undefined ? 'That\'s less than the shop pays. Ask at least that, or sell it at the shop.'
    : 'The shop pays ' + whole(f.floor) + ' for one. Ask at least that, or sell it at the shop.'),
  price_above_cap: (f) => 'That\'s more than this can be listed for.' + (f.ceiling === undefined ? '' : ' The most is ' + whole(f.ceiling) + ' each.'),
  storage_no_room: (f, cs) => {
    const d = cs ? depotOf(cs) : null;
    return 'Unsold items come back to your storage, and it has no room for a new kind. Make room, or build '
      + (d && d.next ? 'the ' + d.next.name : 'another storage chest') + ' in the House.';
  },
  too_many_listings: (f) => 'You have ' + whole(f.limit) + ' listings up. Cancel one or wait for a sale.',
  list_daily_cap: (f) => 'That\'s ' + whole(f.limit) + ' listings today. You can list again after the daily reset at ' + resetWords() + '.',
  insufficient_gold: (f, cs, r) => (r.verb === 'market_list' ? 'The listing fee is ' + whole(f.need) + ' gold.'
    : 'You need ' + whole(f.need) + ' gold. You have ' + whole(f.have) + '.'),
  not_enough: (f) => (f.available === undefined ? 'There aren\'t that many left at that price.'
    : 'Only ' + whole(f.available) + (f.available === 1 ? ' is' : ' are') + ' left at that price.'),
  bag_full: (f, cs) => ((cs && nameOf(cs)) || 'Your hero') + '\'s bag is full. Send it to your storage instead.',
  market_locked: (f) => 'The Weighhouse trades with heroes of Level ' + whole(f.min_level) + ' or higher. Reach it on any hero to buy and sell here.',
});

/** The sentence for a refused market verb, or null when the general table says it. @param {object} r refusalOf's answer */
export function marketRefusal(r, cs) {
  if (!r || !MARKET_VERBS.has(r.verb) || !Object.prototype.hasOwnProperty.call(WORDS, r.error)) return null;
  return WORDS[r.error](r.figures || {}, cs, r);
}
