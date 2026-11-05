// ════════════════════════════════════════════════════════════════════════
// src/shell/setup-words.js — WHAT A SETUP SLOT COSTS, IN WORDS. PURE.
//
// The designer's button and refusal (priority board, "2026-11-04 Gold sinks"), with the server's numbers: the count and the
// next price come from `setup_slots` or hr_setup_locked's answer. Nothing here knows how many are free or what a rung costs: Tyler may
// move both with one row (src/data/gold-sinks.js).
// ════════════════════════════════════════════════════════════════════════
import { gold } from '../render/format.js?v=0.2.97';

const ORDINALS = Object.freeze(['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']);
const aNew = (n) => { const o = ORDINALS[n - 1] || 'new'; return (o === 'eighth' ? 'an ' : 'a ') + o; };

/** "Buy a fourth setup: 15,000 gp", for a hero holding `count` slots. */
export function setupBuyWords(count, price) {
  return 'Buy ' + aNew(count + 1) + ' setup: ' + gold(price);
}

/** "This hero's 3 setup slots are full. Delete one, or buy a fourth for 15,000 gp." With no rung left (null) there is nothing to buy. */
export function setupFullWords(count, price) {
  const held = count === 1 ? 'This hero\'s 1 setup slot is full.' : 'This hero\'s ' + count + ' setup slots are full.';
  return held + ' Delete one' + (price === null ? ' to save a new setup.' : ', or buy ' + aNew(count + 1) + ' for ' + gold(price) + '.');
}
