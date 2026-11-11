// ════════════════════════════════════════════════════════════════════════
// src/app/slot-offer.js — BUY A HERO SLOT, ON "YOUR CHARACTERS" (tracker r45).
//
// Tyler 2026-11-09: every account starts with ONE hero slot; the second costs
// about a week of play (300,000 gold, then 750,000 and 1,500,000), up to four
// heroes in all (Tyler 2026-11-07: the fifth slot is gone). Gold
// is the ACCOUNT's (Tyler 2026-10-23, one purse for every hero:
// 2026-12-15-account-gold.sql), so there is nobody to pick: the
// slot is paid from "your gold". Every number shown is the server's: the price
// and the cap come from the envelope's `account.hero_slot_offer`
// (AccountSession.slotOffer), the gold from the heroes' own hr_load answers
// (the newest wallet version among them). The button sends ONE intent
// (AccountSession.buySlot → hr_buy_hero_slot) and the roster is re-read from
// the server on its answer; nothing here is authority.
//
// PURE: strings in, strings out. src/app/boot.js mounts and wires it.
// ════════════════════════════════════════════════════════════════════════

import { whole } from '../render/format.js?v=0.2.119';
import { t } from '../render/player-text.js?v=0.2.119';

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
 * The line above the roster: how many may play at once AND how many this account can field, so "Up to 4" never stands
 * beside two slots with no word on the other two (blind playtest 2026-10-31). '' until the server has said. Pure.
 * @param stated  AccountSession.statedLimit(): the server's limit, or null
 * @param limit   AccountSession.limit(): that, under the tab's ceiling
 * @param owned   the roster's slots
 * @param offer   AccountSession.slotOffer
 * @param rows    AccountSession.roster() rows: with an empty one, buying more isn't the next thing to read
 */
export function playLineOf(stated, limit, owned, offer, rows) {
  if (stated === null) return '';
  if (stated <= 1) return 'One can play at a time.';
  const most = Math.min(stated, limit);
  if (!(owned < most)) return 'Up to ' + most + ' can play at once.';
  if (anEmptySlot(rows)) return 'You own ' + owned + ' hero ' + (owned === 1 ? 'slot' : 'slots') + ', and up to ' + most + ' heroes can play at once.';
  /* The price is the offer block's (the server's quote, right under the roster), so the line names none (designer 2026-11-09). */
  return t('slots.more_cost_gold', { count: owned, most });
}

/* A slot the account owns with no hero in it: nothing need be bought to make the next one (newcomer panel 2026-11-01: it read as if a second hero cost 15,000). */
const anEmptySlot = (rows) => (Array.isArray(rows) ? rows : []).some((r) => r && !r.exists);

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
  if (!offer || !purse || actor === null || anEmptySlot(roster)) return '';
  const nth = ORDINAL[offer.slotId] || '';
  const short = offer.cost - purse.gold;
  const heroes = (Array.isArray(roster) ? roster : []).filter((r) => r && r.exists).length;
  return '<section class="slot-offer" data-slot-id="' + offer.slotId + '">'
    + '<p class="slot-offer-lead">' + (nth ? 'A ' + nth + ' hero slot' : 'Another hero slot') + ' costs ' + whole(offer.cost) + ' gold'
    + (offer.max ? '. An account holds up to ' + offer.max + ' heroes' : '') + '.</p>'
    /* The second hero is a week away for most players (designer 2026-11-09, table E: about 56 hours of hunting for the
       second slot): while the account has ONE hero, say so and point at other players meanwhile. */
    + (heroes === 1 ? '<p class="slot-offer-lead slot-offer-note">' + t('slots.one_hero_note') + '</p>' : '')
    + '<p class="slot-offer-purse">Your gold: ' + whole(purse.gold) + '</p>'
    + (short > 0 ? '<p class="slot-offer-short">You need ' + whole(short) + ' more gold.</p>' : '')
    + '<button type="button" class="slot-offer-buy" data-app="buy-slot" data-slot-id="' + offer.slotId + '" data-pay="' + actor + '"'
    + (o.pending || short > 0 ? ' disabled' : '') + '>'
    + (o.pending ? 'Buying…' : 'Buy a hero slot for ' + whole(offer.cost) + ' gold') + '</button>'
    + '</section>';
}
