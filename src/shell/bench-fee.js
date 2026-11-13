// ════════════════════════════════════════════════════════════════════════
// src/shell/bench-fee.js — WHAT THE PUBLIC BENCH TAKES, IN PLAIN WORDS (Tyler 2026-11-01).
//
// "The public bench takes 3 gold a craft. A workshop in your house takes none." Every number is the server's `bench_tax` section
// (src/session/bench-sections.js) and its purse, read here and spent nowhere. The server stops a job it cannot pay and says
// so; these are the words for that stop, before Start and after it, and they name the stack the shop would pay it back with.
// ════════════════════════════════════════════════════════════════════════
import { taxFor, craftsCovered, canPayNext, dueNext } from '../core/bench-tax.js?v=0.2.129';
import { benchTaxOf, benchFeeMg, benchRunOf } from '../session/bench-sections.js?v=0.2.129';
import { goldOf, shopOf } from '../session/item-sections.js?v=0.2.129';
import { whole } from '../render/format.js?v=0.2.129';
import { itemName } from './widgets/bits.js?v=0.2.129';

const roomWords = (t, skill) => (t && t.rooms[skill] ? t.rooms[skill].room : null);

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
  return mg > 0 ? 'The public bench takes ' + feeWords(mg) + '.' : '';
}

/** The full sentence, with what takes it off. */
export function feeFullWords(cs, w) {
  const row = feeRowWords(cs, w);
  const room = roomWords(benchTaxOf(cs), w.skill);
  return row && room ? row + ' A ' + room + ' in your house takes none.' : row;
}

/** The skill's start screen, before any press: the share and what takes it off, or what the account's room already does. */
export function feeHeadWords(cs, skill) {
  const t = benchTaxOf(cs);
  const r = t && t.rooms[skill];
  if (!r) return '';
  if (r.free) return 'No bench fee: you have a ' + r.room + ' in your house.';
  return 'The public bench takes ' + (r.permille / 10) + '% of what you make, at shop prices. A ' + r.room + ' in your house takes none.';
}

/** The live tax this hero's next run of `w` would owe, from the server's numbers, or null. */
export function rowTax(cs, w) {
  const t = benchTaxOf(cs);
  return w && w.kind === 'artisan' && t ? taxFor({ carry_mg: t.carry, keep: t.keep }, benchFeeMg(cs, w.id), goldOf(cs)) : null;
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
  return best ? 'your ' + whole(best.qty) + ' ' + itemName(best.id) : null;
}

/* What to do about it, in the player's words: gathering is always free. */
function payWords(cs) {
  const stack = bestStackWords(cs);
  return stack ? 'Sell ' + stack + ' at the shop, or gather something. Gathering is free.' : 'Gather something and sell it. Gathering is free.';
}

/** Why this row cannot start for gold (plain words), or ''. */
export function feeBlock(cs, w) {
  const tax = rowTax(cs, w);
  if (!tax || canPayNext(tax)) return '';
  const t = benchTaxOf(cs);
  const kept = t && t.keep > 0 ? ' and keep ' + whole(t.keep) : '';
  return 'The public bench wants ' + whole(dueNext(tax)) + ' gold for this. You have ' + whole(tax.purse) + kept + '. ' + payWords(cs);
}

/** The latest run's end, in words, while nothing runs; '' when there is none to tell. Gold first: that stop needs an answer. */
export function benchEndWords(cs, recipeName) {
  const run = benchRunOf(cs);
  if (!run || !run.end) return '';
  const paid = run.gold > 0 ? whole(run.gold) + ' gold paid to the public bench.' : '';
  const name = recipeName(run.recipe);
  if (run.end === 'gold') {
    const t = benchTaxOf(cs);
    const why = t && t.keep > 0 ? 'the bench fee would take your gold below the ' + whole(t.keep) + ' you keep.' : 'out of gold for the bench fee.';
    return name + ' stopped after ' + whole(run.crafts) + ': ' + why + (paid ? ' ' + paid : '') + ' ' + payWords(cs);
  }
  return paid ? name + ': ' + whole(run.crafts) + ' done. ' + paid : '';
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
