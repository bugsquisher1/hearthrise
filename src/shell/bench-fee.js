// ════════════════════════════════════════════════════════════════════════
// src/shell/bench-fee.js — WHAT THE PUBLIC BENCH TAKES, IN PLAIN WORDS (Tyler 2026-11-01).
//
// "Bench fee: 3 gold a craft / Free with a workshop at home" Every number is the server's `bench_tax` section
// (src/session/bench-sections.js) and its purse, read here and spent nowhere. The server stops a job it cannot pay and says
// so; these are the words for that stop, before Start and after it, and they name the stack the shop would pay it back with.
// ════════════════════════════════════════════════════════════════════════
import { taxFor, craftsCovered, canPayNext, dueNext } from '../core/bench-tax.js?v=0.2.140';
import { benchTaxOf, benchFeeMg, benchRunOf } from '../session/bench-sections.js?v=0.2.140';
import { goldOf, shopOf } from '../session/item-sections.js?v=0.2.140';
import { whole } from '../render/format.js?v=0.2.140';
import { itemNameFor } from './widgets/bits.js?v=0.2.140';
import { t } from '../render/player-text.js?v=0.2.140';

const roomWords = (bt, skill) => (bt && bt.rooms[skill] ? bt.rooms[skill].room : null);

/** "3 gold a craft", "about 2.4 gold a craft", "about 10 gold a craft", "about 1 gold every 2 crafts". The server charges the exact milligold, each
    whole gold as the carry passes it (core/bench-tax.js), so a fee under 10 gold keeps its tenth: "about 3" over 5 crafts that took 12 read as a wrong bill (Tyler 2026-11-01). */
export function feeWords(mg) {
  if (mg >= 10000 || mg % 1000 === 0) return (mg % 1000 === 0 ? '' : 'about ') + whole(Math.round(mg / 1000)) + ' gold a craft';
  if (mg >= 1000) return 'about ' + Math.round(mg / 100) / 10 + ' gold a craft';
  const every = Math.max(1, Math.round(1000 / mg));
  return every === 1 ? 'about 1 gold a craft' : 'about 1 gold every ' + whole(every) + ' crafts';
}

/** The recipe row's line, or '' when the job takes no fee. */
export function feeRowWords(cs, w) {
  const mg = w.kind === 'artisan' ? benchFeeMg(cs, w.id) : 0;
  return mg > 0 ? 'Bench fee: ' + feeWords(mg) : '';
}

/** THE FEE FOR THE PRESS, BEFORE IT (itemization audit 2026-11-18 #1: a new hero's "All" spent 38% of the purse unseen): the whole gold
    `n` crafts take from here, the carry passing one gold each 1000 milligold (core/bench-tax.js, the server's own rule), or 0. */
export function feeTotal(cs, w, n) {
  const tax = rowTax(cs, w);
  return tax && n > 0 ? Math.floor((tax.carry + n * tax.mg) / 1000) : 0;
}

/** The row's line for the count picked: "Bench fee: about 1 gold a craft · 62 gold for all 62 (38% of your gold)"; one craft, the rate alone. */
export function feeLineWords(cs, w, n, all) {
  const row = feeRowWords(cs, w);
  const total = n > 1 ? feeTotal(cs, w, n) : 0;
  if (!row || !(total > 0)) return row;
  const purse = goldOf(cs);
  const share = purse > 0 ? Math.round((total * 100) / purse) : 0;
  return row + ' · ' + t(all ? 'work.fee_all' : 'work.fee_n', { gold: whole(total), n: whole(n) }) + (share >= 10 ? ' ' + t('work.fee_share', { pct: share }) : '');
}

/** The full sentence, with what takes it off. */
export function feeFullWords(cs, w) {
  const row = feeRowWords(cs, w);
  const room = roomWords(benchTaxOf(cs), w.skill);
  return row && room ? row + '\nFree with a ' + room + ' at home' : row;
}

/** The skill's start screen, before any press: the share and what takes it off, or what the account's room already does. */
export function feeHeadWords(cs, skill) {
  const bt = benchTaxOf(cs);
  const r = bt && bt.rooms[skill];
  if (!r) return '';
  if (r.free) return 'No bench fee: ' + r.room + ' at home';
  return 'Bench fee: ' + (r.permille / 10) + '% of output at shop prices\nFree with a ' + r.room + ' at home';
}

/** The live tax this hero's next run of `w` would owe, from the server's numbers, or null. */
export function rowTax(cs, w) {
  const bt = benchTaxOf(cs);
  return w && w.kind === 'artisan' && bt ? taxFor({ carry_mg: bt.carry, keep: bt.keep }, benchFeeMg(cs, w.id), goldOf(cs)) : null;
}

/** How many crafts the purse covers for `w`, or null when no fee limits it. */
export function runsPaid(cs, w) {
  const tax = rowTax(cs, w);
  return tax ? craftsCovered(tax) : null;
}

/* The stack the shop would pay most for, from the server's bids on what the bag holds: "your 40 Iron Bars", or null. */
function bestStackWords(cs) {
  const shop = shopOf(cs);
  const bids = shop && shop.bids;
  const held = (cs && typeof cs.read === 'function' && cs.read('inventory')) || {};
  if (!bids || typeof bids.get !== 'function') return null;
  let best = null;
  for (const [id, bid] of bids) {
    const qty = held[id] || 0;
    if (qty > 0 && bid > 0 && (!best || qty * bid > best.total)) best = { id, qty, total: qty * bid };
  }
  return best ? whole(best.qty) + ' ' + itemNameFor(best.id, best.qty) : null;
}

/* What to do about it, in the player's words: gathering is always free. */
function payWords(cs) {
  const stack = bestStackWords(cs);
  return stack ? 'Sell ' + stack + ' at the shop, or gather for free' : 'Gather for free, then sell';
}

/** Why this row cannot start for gold (plain words), or ''. */
export function feeBlock(cs, w) {
  const tax = rowTax(cs, w);
  if (!tax || canPayNext(tax)) return '';
  const bt = benchTaxOf(cs);
  const kept = bt && bt.keep > 0 ? ', reserve ' + whole(bt.keep) : '';
  return 'Bench fee: ' + whole(dueNext(tax)) + ' gold, have ' + whole(tax.purse) + kept + '. ' + payWords(cs);
}

/** The latest run's end, in words, while nothing runs; '' when there is none to tell. Gold first: that stop needs an answer. */
export function benchEndWords(cs, recipeName) {
  const run = benchRunOf(cs);
  if (!run || !run.end) return '';
  const paid = run.gold > 0 ? 'Bench fee paid: ' + whole(run.gold) + ' gold' : '';
  const name = recipeName(run.recipe);
  if (run.end === 'gold') {
    const bt = benchTaxOf(cs);
    const why = bt && bt.keep > 0 ? 'gold at reserve ' + whole(bt.keep) : 'out of gold for the bench fee';
    return [name + ' stopped after ' + whole(run.crafts) + ', ' + why, paid, payWords(cs)].filter(Boolean).join('\n');
  }
  return paid ? name + ': ' + whole(run.crafts) + ' done\n' + paid : '';
}

/** A job the bench stopped for gold, as one alert line for the return (once per stop: alerts remember the id), or null. */
export function benchStopRecapOf(cs, recipeName) {
  const run = benchRunOf(cs);
  if (!run || run.end !== 'gold' || !Number.isFinite(run.at)) return null;
  return { id: 'bench-gold:' + run.at, kind: 'away', text: benchEndWords(cs, recipeName) };
}

/** "36 gold to the public bench" for the run the hero just stopped, or ''. */
export function benchPaidWords(cs, recipeId, sinceMs) {
  const run = benchRunOf(cs);
  return run && run.recipe === recipeId && run.since === sinceMs && run.gold > 0 ? whole(run.gold) + ' gold to the public bench' : '';
}
