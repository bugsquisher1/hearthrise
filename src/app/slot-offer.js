// ════════════════════════════════════════════════════════════════════════
// src/app/slot-offer.js — BUY A HERO SLOT, ON "YOUR CHARACTERS" (tracker r45).
//
// Tyler 2026-10-17: every account starts with two hero slots; more, up to
// five, cost gold. Gold is the ACCOUNT's (Tyler 2026-10-23, one purse for
// every hero: 2026-12-15-account-gold.sql), so there is nobody to pick: the
// slot is paid from "your gold". Every number shown is the server's: the price
// and the cap come from the envelope's `account.hero_slot_offer`
// (AccountSession.slotOffer), the gold from the heroes' own hr_load answers
// (the newest wallet version among them). The button sends ONE intent
// (AccountSession.buySlot → hr_buy_hero_slot) and the roster is re-read from
// the server on its answer; nothing here is authority.
//
// PURE: strings in, strings out. src/app/boot.js mounts and wires it.
// ════════════════════════════════════════════════════════════════════════

import { whole } from '../render/format.js?v=0.2.64';

const ORDINAL = Object.freeze(['first', 'second', 'third', 'fourth', 'fifth', 'sixth']);

/* What the player reads for each refusal the server can give. */
const REFUSAL = Object.freeze({
  already_owned: 'You already own that hero slot.',
  slot_cap: 'You have every hero slot there is.',
  requires_previous_slot: 'Buy the hero slots before this one first.',
  hero_slot_daily_cap: 'That is enough hero slots for today. Try again tomorrow.',
  rate_limited: 'Too many tries. Wait a minute, then try again.',
  no_character: 'Create a hero first, then buy another slot.',
  slot_unpriced: 'That hero slot is not for sale.',
});

/** The sentence a refused purchase shows. Pure. */
export function slotRefusalText(r) {
  if (r && r.reason === 'insufficient_gold') {
    return Number.isSafeInteger(r.shortBy) && r.shortBy > 0 ? 'You need ' + whole(r.shortBy) + ' more gold.' : 'You do not have enough gold.';
  }
  return (r && REFUSAL[r.reason]) || 'The hero slot could not be bought. Try again in a minute.';
}

/**
 * The account's purse as the roster read it: the newest wallet version among its heroes' answers
 * ({ gold, v }), or null when no hero stated one. Pure.
 */
function rosterPurse(roster) {
  let best = null;
  for (const r of Array.isArray(roster) ? roster : []) {
    if (!r || !r.exists || !Number.isSafeInteger(r.gold) || r.gold < 0) continue;
    const v = Number.isSafeInteger(r.goldV) && r.goldV >= 0 ? r.goldV : 0;
    if (!best || v > best.v) best = { gold: r.gold, v };
  }
  return best;
}

/** The hero the purchase is journalled under: the lowest slot holding one, or null. Pure. */
function actingSlot(roster) {
  const slots = (Array.isArray(roster) ? roster : []).filter((r) => r && r.exists && Number.isInteger(r.slot)).map((r) => r.slot);
  return slots.length ? Math.min(...slots) : null;
}

/**
 * The offer block under the roster, or '' (no offer: the account is at the cap or the server said
 * nothing; no hero yet, so no gold to show). Pure.
 * @param offer    AccountSession.slotOffer: { slotId, cost, max } | null
 * @param roster   AccountSession.roster() rows
 * @param o        { pending: bool }
 */
export function slotOfferHtml(offer, roster, o = {}) {
  const purse = rosterPurse(roster);
  const actor = actingSlot(roster);
  if (!offer || !purse || actor === null) return '';
  const nth = ORDINAL[offer.slotId] || '';
  const short = offer.cost - purse.gold;
  return '<section class="slot-offer" data-slot-id="' + offer.slotId + '">'
    + '<p class="slot-offer-lead">' + (nth ? 'A ' + nth + ' hero slot' : 'Another hero slot') + ' costs ' + whole(offer.cost) + ' gold'
    + (offer.max ? ', up to ' + offer.max + ' heroes in all' : '') + '.</p>'
    + '<p class="slot-offer-purse">Your gold: ' + whole(purse.gold) + '</p>'
    + (short > 0 ? '<p class="slot-offer-short">You need ' + whole(short) + ' more gold.</p>' : '')
    + '<button type="button" class="slot-offer-buy" data-app="buy-slot" data-slot-id="' + offer.slotId + '" data-pay="' + actor + '"'
    + (o.pending || short > 0 ? ' disabled' : '') + '>'
    + (o.pending ? 'Buying…' : 'Buy a hero slot — ' + whole(offer.cost) + ' gold') + '</button>'
    + '</section>';
}
