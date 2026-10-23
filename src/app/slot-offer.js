// ════════════════════════════════════════════════════════════════════════
// src/app/slot-offer.js — BUY A HERO SLOT, ON "YOUR CHARACTERS" (tracker r45).
//
// Tyler 2026-10-17: every account starts with two hero slots; more, up to
// five, cost gold. Gold belongs to a hero, so a slot is paid from one hero's
// purse, picked here. Every number shown is the server's: the price and the
// cap come from the envelope's `account.hero_slot_offer`
// (AccountSession.slotOffer), each hero's gold from its own hr_load. The
// button sends ONE intent (AccountSession.buySlot → hr_buy_hero_slot) and the
// roster is re-read from the server on its answer; nothing here is authority.
//
// PURE: strings in, strings out. src/app/boot.js mounts and wires it.
// ════════════════════════════════════════════════════════════════════════

import { whole } from '../render/format.js?v=0.2.34';
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.34';

const ORDINAL = Object.freeze(['first', 'second', 'third', 'fourth', 'fifth', 'sixth']);

/* What the player reads for each refusal the server can give. */
const REFUSAL = Object.freeze({
  already_owned: 'You already own that hero slot.',
  slot_cap: 'You have every hero slot there is.',
  requires_previous_slot: 'Buy the hero slots before this one first.',
  hero_slot_daily_cap: 'That is enough hero slots for today. Try again tomorrow.',
  rate_limited: 'Too many tries. Wait a minute, then try again.',
  no_character: 'That hero cannot pay. Pick another one.',
  slot_unpriced: 'That hero slot is not for sale.',
});

/** The sentence a refused purchase shows. `payer` is the paying hero's name. Pure. */
export function slotRefusalText(r, payer) {
  if (r && r.reason === 'insufficient_gold') {
    const who = payer || 'That hero';
    return Number.isSafeInteger(r.shortBy) && r.shortBy > 0 ? who + ' needs ' + whole(r.shortBy) + ' more gold.' : who + ' does not have enough gold.';
  }
  return (r && REFUSAL[r.reason]) || 'The hero slot could not be bought. Try again in a minute.';
}

/** The heroes that could pay: roster rows holding a hero whose gold the server stated. Pure. */
function payersOf(roster) {
  return (Array.isArray(roster) ? roster : []).filter((r) => r && r.exists && Number.isSafeInteger(r.gold));
}

/** The default payer: the kept pick if it still can pay, else the richest hero (lowest slot on a tie). Pure. */
export function pickPayer(payers, kept) {
  if (payers.some((p) => p.slot === kept)) return kept;
  let best = null;
  for (const p of payers) if (!best || p.gold > best.gold) best = p;
  return best ? best.slot : null;
}

/**
 * The offer block under the roster, or '' (no offer: the account is at the cap or the server said
 * nothing; nobody to pay: no hero yet). Pure.
 * @param offer    AccountSession.slotOffer: { slotId, cost, max } | null
 * @param roster   AccountSession.roster() rows
 * @param o        { payer: slot, pending: bool }
 */
export function slotOfferHtml(offer, roster, o = {}) {
  const payers = payersOf(roster);
  if (!offer || !payers.length) return '';
  const payer = pickPayer(payers, o.payer);
  const p = payers.find((x) => x.slot === payer);
  const nth = ORDINAL[offer.slotId] || '';
  const short = p ? offer.cost - p.gold : offer.cost;
  const label = (n) => esc(n.name || 'Unnamed hero') + ' (' + whole(n.gold) + ' gold)';
  const from = payers.length > 1
    ? '<label class="slot-offer-from">Paid from <select class="slot-offer-payer" data-app="slot-payer"' + (o.pending ? ' disabled' : '') + '>'
      + payers.map((n) => '<option value="' + n.slot + '"' + (n.slot === payer ? ' selected' : '') + '>' + label(n) + '</option>').join('')
      + '</select></label>'
    : '<p class="slot-offer-from">Paid from ' + label(p) + '.</p>';
  return '<section class="slot-offer" data-slot-id="' + offer.slotId + '">'
    + '<p class="slot-offer-lead">' + (nth ? 'A ' + nth + ' hero slot' : 'Another hero slot') + ' costs ' + whole(offer.cost) + ' gold'
    + (offer.max ? ', up to ' + offer.max + ' heroes in all' : '') + '.</p>'
    + from
    + (short > 0 ? '<p class="slot-offer-short">' + esc(p.name || 'This hero') + ' needs ' + whole(short) + ' more gold.</p>' : '')
    + '<button type="button" class="auth-submit slot-offer-buy" data-app="buy-slot" data-slot-id="' + offer.slotId + '" data-pay="' + payer + '"'
    + (o.pending || short > 0 ? ' disabled' : '') + '>'
    + (o.pending ? 'Buying…' : 'Buy a hero slot — ' + whole(offer.cost) + ' gold') + '</button>'
    + '</section>';
}
