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

import { whole, gold } from '../render/format.js?v=0.2.140';
import { t } from '../render/player-text.js?v=0.2.140';

const ORDINAL = Object.freeze(['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth']);

/* What the player reads for each refusal the server can give (labels: src/data/text/slots.js). */
const REFUSAL = Object.freeze({
  already_owned: 'slots.refused_owned',
  slot_cap: 'slots.refused_cap',
  requires_previous_slot: 'slots.refused_previous',
  hero_slot_daily_cap: 'slots.refused_daily',
  rate_limited: 'slots.refused_rate',
  no_character: 'slots.refused_no_hero',
  slot_unpriced: 'slots.refused_unpriced',
});

/** The words a refused purchase shows. Pure. */
export function slotRefusalText(r) {
  if (r && r.reason === 'insufficient_gold') {
    return Number.isSafeInteger(r.shortBy) && r.shortBy > 0 ? t('slots.short', { gold: whole(r.shortBy) }) : t('slots.refused_gold');
  }
  return t((r && REFUSAL[r.reason]) || 'slots.refused_other');
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
  if (stated <= 1) return t('slots.play_one');
  const most = Math.min(stated, limit);
  if (!(owned < most)) return t('slots.play_up_to', { most });
  if (anEmptySlot(rows)) return t('slots.play_owned', { count: owned, most });
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
 * BUY ASKS FIRST, the way a stamina refill does (audit 2026-11-18 A7: 300,000 gold went on one click while a
 * 5,500 gp refill asks): the first press only asks (`o.asking`), naming the slot and the server's price, with
 * "Buy for N gold" and Cancel; only that second press sends the intent (src/app/boot.js).
 * @param offer    AccountSession.slotOffer: { slotId, cost, max } | null
 * @param roster   AccountSession.roster() rows
 * @param o        { pending: bool, asking: bool }
 */
export function slotOfferHtml(offer, roster, o = {}) {
  const purse = rosterPurse(roster);
  const actor = actingSlot(roster);
  if (!offer || !purse || actor === null || anEmptySlot(roster)) return '';
  const nth = ORDINAL[offer.slotId] || '';
  const short = offer.cost - purse.gold;
  const heroes = (Array.isArray(roster) ? roster : []).filter((r) => r && r.exists).length;
  /* the question stands only while the purse covers the price and nothing is in flight */
  const asking = !!o.asking && !o.pending && short <= 0;
  const press = asking
    ? '<span class="slot-offer-do"><button type="button" class="slot-offer-buy is-yes" data-app="buy-slot-yes" data-slot-id="' + offer.slotId + '" data-pay="' + actor + '">'
      + t('slots.buy_for', { cost: whole(offer.cost) }) + '</button>'
      + '<button type="button" class="slot-offer-no" data-app="buy-slot-no">' + t('controls.cancel') + '</button></span>'
    : '<button type="button" class="slot-offer-buy" data-app="buy-slot" data-slot-id="' + offer.slotId + '" data-pay="' + actor + '"'
      + (o.pending || short > 0 ? ' disabled' : '') + '>'
      + (o.pending ? t('slots.buying') : t('slots.buy', { cost: whole(offer.cost) })) + '</button>';
  return '<section class="slot-offer" data-slot-id="' + offer.slotId + '">'
    + '<p class="slot-offer-lead">' + t(nth ? (offer.max ? 'slots.offer_nth_max' : 'slots.offer_nth') : (offer.max ? 'slots.offer_any_max' : 'slots.offer_any'),
      Object.assign({ cost: whole(offer.cost) }, nth ? { nth } : {}, offer.max ? { max: offer.max } : {})) + '</p>'
    /* The second hero is a week away for most players (designer 2026-11-09, table E: about 56 hours of hunting for the
       second slot): while the account has ONE hero, say so and point at other players meanwhile. */
    + (heroes === 1 ? '<p class="slot-offer-lead slot-offer-note">' + t('slots.one_hero_note') + '</p>' : '')
    /* The gold and what is short stand together, each on ONE line, beside the press while both fit, the press under them when not
       (UI audit 2026-11-18: in a grid beside the press "Need 299,500 more gold" set one word a line). */
    + '<div class="slot-offer-pay"><div class="slot-offer-fund"><p class="slot-offer-purse">' + t('slots.purse', { gold: gold(purse.gold) }) + '</p>'
    + (short > 0 ? '<p class="slot-offer-short">' + t('slots.short', { gold: whole(short) }) + '</p>' : '')
    + (asking ? '<p class="slot-offer-ask" role="alert">' + t(nth ? 'slots.ask_nth' : 'slots.ask_any', Object.assign({ cost: whole(offer.cost) }, nth ? { nth } : {})) + '</p>' : '')
    + '</div>' + press + '</div>'
    + '</section>';
}
