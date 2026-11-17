// ════════════════════════════════════════════════════════════════════════
// src/shell/sink-words.js — WHAT A REFUSED GOLD SINK MEANS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. The server's refusal (2027-02-27-town-shows.sql, -town-crier.sql, 2027-03-04-town-works.sql) carries the numbers; these are the designer's sentences around them
// (priority board, "2026-11-04 Gold sinks"). A code with no number to say reads from src/data/refusal-words.js. src/shell/intent-words.js is the only caller.
// ════════════════════════════════════════════════════════════════════════
import { whole } from '../render/format.js?v=0.2.134';
import { TOWN_WORKS } from '../data/town-works.js?v=0.2.134';

const num = (v) => Number.isInteger(v);
const SHOW_NOUN = Object.freeze({ town_powder: 'powders', town_round: 'rounds' });

/**
 * The sentence for a refused sink, or null when it isn't one or has nothing of its own to say.
 * @param {{error?: string, verb?: string, perDay?: number|null, waitS?: number|null, bookedS?: number|null, n?: number|null, max?: number|null, need?: number|null, level?: number|null, price?: number|null, project?: string, left?: number|null, min?: number|null}} r
 * @param {string|null} heroName
 */
export function sinkRefusal(r, heroName) {
  if (!r || typeof r.verb !== 'string') return null;
  if (r.verb === 'town_powder' || r.verb === 'town_round') {
    /* LABELS, like the table's own rows (Tyler 2026-11-14): "Daily limit: 5 powders per account" */
    if (r.error === 'show_limit' && num(r.perDay)) return 'Your account has used all ' + r.perDay + ' ' + SHOW_NOUN[r.verb] + ' for today. They reset at midnight UTC.';
    if (r.error === 'show_busy' && r.verb === 'town_powder' && num(r.bookedS)) {
      const n = Math.max(1, Math.ceil(r.bookedS / 60));
      return 'The Hearth is booked with powders for the next ' + n + ' min. You weren\'t charged.';
    }
    if (r.error === 'show_busy' && r.verb === 'town_round' && num(r.waitS)) return 'A round is already going. You weren\'t charged. Try again in ' + Math.max(1, r.waitS) + ' s.';
  }
  if (r.verb === 'crier') {
    if (r.error === 'crier_level' && num(r.need) && num(r.level)) return 'The Crier takes heroes from Level ' + r.need + '. ' + (heroName || 'This hero') + ' is level ' + r.level + '.';
    if (r.error === 'crier_long' && num(r.n)) return 'That\'s ' + r.n + ' letters. The Crier takes ' + (num(r.max) ? r.max : 120) + ' at most.';
    if (r.error === 'crier_limit' && num(r.perDay)) return 'Your account has used all ' + r.perDay + ' Crier lines for today. They reset at midnight UTC.';
    if (r.error === 'crier_busy' && num(r.waitS)) return 'The Crier is busy. You weren\'t charged. Try again in ' + Math.max(1, r.waitS) + ' s.';
  }
  if (r.verb === 'town_works') {
    const name = (TOWN_WORKS[r.project] && TOWN_WORKS[r.project].name) || 'The Works';
    if (r.error === 'works_limit' && num(r.perDay)) return 'Your account has given ' + whole(r.perDay) + ' gp today, the daily limit. It resets at midnight UTC.';
    if (r.error === 'works_over' && num(r.left)) return 'You can give ' + whole(r.left) + ' gp more today.';
    if (r.error === 'works_short' && num(r.left)) return name + ' only needs ' + whole(r.left) + ' gp more.';
    if (r.error === 'works_small' && num(r.min)) return 'Gifts start at ' + whole(r.min) + ' gp.';
    if (r.error === 'works_done') return name + ' is finished. There\'s nothing else to build.';
  }
  if (r.error === 'quote_changed' && num(r.price)) return 'The price changed to ' + whole(r.price) + ' gp. You weren\'t charged. Press again to pay.';
  return null;
}
