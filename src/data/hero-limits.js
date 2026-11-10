// ════════════════════════════════════════════════════════════════════════
// src/data/hero-limits.js — HOW MANY HEROES: THE SLOTS AN ACCOUNT HOLDS AND
// HOW MANY PLAY AT ONCE. One home for both numbers (architecture audit
// 2026-11-09, S10: the limits were typed as literals into gates and sentences).
//
// THE SERVER IS THE AUTHORITY for every one of them; these rows are what it is
// generated from, or what it is held equal to:
//   playAtOnce   -> hr_hunt_limits.max_concurrent, written by
//                   tools/gen-hunt-sessions.mjs (through SESSION_CONFIG);
//                   tests/play-cap.mjs holds the catalogue and the words to it.
//                   A page reads the server's own `account.max_concurrent`.
//   slotIdMax    -> the slot-id SHAPE bound the server clamps to (hr_load,
//                   hr-accrue request.js MAX_SLOT, the player_state CHECK).
//                   Not a hero count: it bounds what a slot id may be.
//   startSlots   -> the slots a new account holds (slot 0).
//   boughtSlots  -> the hero-slot ladder's rungs, COUNTED from
//                   src/data/shops.js `character_slot.*` (the server's
//                   hr_hero_slots, bound by tests/hero-slot-buy.mjs). A page
//                   reads the server's own `account.hero_slots_max`.
//
// A GATE reads the server's value (AccountSession.limit(), slotOffer); these
// bound a request's shape and write the sentences that state the rule.
// tests/hero-limit-literals.mjs keeps a new literal out of the client.
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { SHOP_OFFERS } from './shops.js?v=0.2.114';

const startSlots = 1;
const boughtSlots = SHOP_OFFERS.filter((o) => o.table === 'character_slot').length;

export const HERO_LIMITS = Object.freeze({
  /** Heroes one login may play at the same time (Tyler 2026-10-17). */
  playAtOnce: 4,
  /** The highest slot id the server's shape allows (0-based). */
  slotIdMax: 5,
  startSlots,
  boughtSlots,
  /** Every slot an account can hold (Tyler 2026-11-08: four). */
  slots: startSlots + boughtSlots,
});

const WORDS = Object.freeze(['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']);
/** A small count as a sentence says it ("four"), else its digits. `cap`: "Four". */
export function countWord(n, cap = false) {
  const w = WORDS[n] || String(n);
  return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

/** "one hero slot" / "two hero slots": the slots a new account holds. */
export const START_SLOTS_WORDS = countWord(HERO_LIMITS.startSlots) + (HERO_LIMITS.startSlots === 1 ? ' hero slot' : ' hero slots');
/** "three": the slots gold buys beyond them. */
export const BOUGHT_SLOTS_WORD = countWord(HERO_LIMITS.boughtSlots);
/** "four": how many play at once. */
export const PLAY_AT_ONCE_WORD = countWord(HERO_LIMITS.playAtOnce);
/** "All four heroes can play" while every slot fits under the play cap, else "Up to four heroes can play". */
export const ALL_PLAY_WORDS = HERO_LIMITS.slots <= HERO_LIMITS.playAtOnce
  ? 'All ' + countWord(HERO_LIMITS.slots) + ' heroes can play'
  : 'Up to ' + PLAY_AT_ONCE_WORD + ' heroes can play';
