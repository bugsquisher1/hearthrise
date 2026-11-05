// ════════════════════════════════════════════════════════════════════════
// src/shell/sink-words.js — WHAT A REFUSED GOLD SINK MEANS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. The server's refusal (2027-02-27-town-shows.sql, -town-crier.sql) carries the numbers; these are the designer's sentences around them
// (priority board, "2026-11-04 Gold sinks"). A code with no number to say reads from src/data/refusal-words.js. src/shell/intent-words.js is the only caller.
// ════════════════════════════════════════════════════════════════════════
import { whole } from '../render/format.js?v=0.2.96';

const num = (v) => Number.isInteger(v);
const SHOW_NOUN = Object.freeze({ town_powder: 'powders', town_round: 'rounds' });

/**
 * The sentence for a refused sink, or null when it isn't one or has nothing of its own to say.
 * @param {{error?: string, verb?: string, perDay?: number|null, waitS?: number|null, bookedS?: number|null, n?: number|null, max?: number|null, need?: number|null, level?: number|null, price?: number|null}} r
 * @param {string|null} heroName
 */
export function sinkRefusal(r, heroName) {
  if (!r || typeof r.verb !== 'string') return null;
  if (r.verb === 'town_powder' || r.verb === 'town_round') {
    if (r.error === 'show_limit' && num(r.perDay)) return 'Havora takes ' + r.perDay + ' ' + SHOW_NOUN[r.verb] + ' a day from one account. More after midnight UTC.';
    if (r.error === 'show_busy' && r.verb === 'town_powder' && num(r.bookedS)) {
      const n = Math.max(1, Math.ceil(r.bookedS / 60));
      return 'The Hearth\'s powders are booked for the next ' + n + (n === 1 ? ' minute' : ' minutes') + '. You weren\'t charged.';
    }
    if (r.error === 'show_busy' && r.verb === 'town_round' && num(r.waitS)) return 'Someone\'s round is still going. Try again in ' + Math.max(1, r.waitS) + ' seconds. You weren\'t charged.';
  }
  if (r.verb === 'crier') {
    if (r.error === 'crier_level' && num(r.need) && num(r.level)) return 'The Crier takes words from Level ' + r.need + ' heroes and up. ' + (heroName || 'This hero') + ' is Level ' + r.level + '.';
    if (r.error === 'crier_long' && num(r.n)) return 'The Crier shouts ' + (num(r.max) ? r.max : 120) + ' letters at most. That\'s ' + r.n + '.';
    if (r.error === 'crier_limit' && num(r.perDay)) return 'The Crier takes ' + r.perDay + ' lines a day from one account. More after midnight UTC.';
    if (r.error === 'crier_busy' && num(r.waitS)) return 'The Crier is shouting someone else\'s line. Try again in ' + Math.max(1, r.waitS) + ' seconds. You weren\'t charged.';
  }
  if (r.error === 'quote_changed' && num(r.price)) return 'The price moved to ' + whole(r.price) + ' gp. You weren\'t charged. Press again to pay it.';
  return null;
}
