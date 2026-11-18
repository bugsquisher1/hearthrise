// ════════════════════════════════════════════════════════════════════════
// src/shell/weak-food.js — THE ONE WEAK-FOOD RULE: A BAR'S STORE FOOD UNDER A MEASURED FLOOR.
//
// PURE. Every place that warns about store food reads this one rule (audit 2026-11-18 A25: a Level 85 hero died at Krell's Hold
// on the bar the game built; the Barrows' page warned, the Hold's page did not, and the hall below it said "Bar food: Salted Shrimp.
// Change that slot" without saying which slot):
//   a ground's page     Before you go (hunt-go.js beforeLines), the floor its bag guide measured for the hero's Level (supplies.js storeFloorFor)
//   a keyed hall        its door (windows/boss-hall-pane.js), the hall's own measured floor (boss-halls.js `storeFloor`), for each own hero
//   a bar slot          its hover while the hero hunts there (slot-waits.js), the slot's own food
// THE RULE: the strongest store food the bar buys (a slot that is on and not set to leave instead of buying) heals less than the floor's
// store food. A bar with no store food is never told (it eats its own stock, then nothing: food is optional, Tyler 2026-10-29).
// Every number is the SERVER's: what a store food heals is its store row as the server prices it (hunt_settings.store, `amount`), and
// the HP the sentence names is the server's. With no row for either food the rule says nothing (no client copy, CLAUDE.md §1).
// The answer names the bar's SLOTS that hold that food (1 = the bar's first), the slot a player changes. A floor speaks in the Level band
// it was measured for (groundFloor, hallFloor), and a page names each slot once (notSaid). Display only: nothing here gates a press; the
// hunt always runs.
// ════════════════════════════════════════════════════════════════════════
import { CONSUMABLES } from '../data/consumables.js?v=0.2.140';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.140';
import { storeFloorFor } from '../data/supplies.js?v=0.2.140';
import { storeName } from './bar-draft.js?v=0.2.140';
import { whole, listWords } from '../render/format.js?v=0.2.140';
import { t } from '../render/player-text.js?v=0.2.140';

/* WHERE A FLOOR SPEAKS (the 139 audit's B2: at Level 5 the Barrows and the Hold named a food and the Pyre, the Slake and the Ford did not). A
   floor is MEASURED for a lone hero in its place's Level band (supplies.js storeFloorFor; a hall's own row), so it speaks from the band's
   first Level up, on every ground and hall alike. Under the band no store food is the fix, and the page's own range line says what is
   ("Levels under", the death cost). A Level the server has not sent reads as in the band (the floor's answer, as before). */
const inBand = (hunt, level) => {
  const band = HUNT_INDEX[hunt] && HUNT_INDEX[hunt].band;
  return !Number.isInteger(level) || !Array.isArray(band) || level >= band[0];
};
/** The store food measured safe on ground `hunt` at `level`, or null (none named, or under the band). */
export function groundFloor(hunt, level) {
  return hunt && inBand(hunt, level) ? storeFloorFor(hunt, Number.isInteger(level) ? level : null) : null;
}
/** A keyed hall's own floor (boss-halls.js `storeFloor`) at `level`, or null (none, or under the hall's band). */
export function hallFloor(hall, level) {
  return hall && hall.storeFloor && inBand(hall.hunt, level) ? hall.storeFloor : null;
}
/** ONCE PER SLOT (B2: the Hold's page said "Pick Salted Trout" and "Pick Salted Swordfish" for slot 4): `weak` less the slots `said` already
    names, or null when none are left. The ground's line speaks first; a hall below it names only what that line did not. */
export function notSaid(weak, said) {
  if (!weak) return null;
  const slots = said ? weak.slots.filter((n) => !said.slots.includes(n)) : weak.slots;
  return slots.length ? Object.assign({}, weak, { slots }) : null;
}

/* What one store food heals, from the server's own store rows: null when the server sent no heal row for it. */
function healOf(set, id) {
  const r = set && Array.isArray(set.store) ? set.store.find((x) => x && x.id === id && x.kind === 'heal') : null;
  return r && Number.isInteger(r.amount) ? r.amount : null;
}

/* A slot that buys a store food when it fires: on, not set to leave instead of buying, a store food row. */
function storeFoodSlot(sl) {
  if (!sl || sl.empty || sl.enabled === false || sl.why === 'store_off' || !sl.action || sl.action.type !== 'consume') return null;
  const c = CONSUMABLES[sl.action.id];
  return c && c.kind === 'food' && c.source === 'store' ? sl.action.id : null;
}

/**
 * THE RULE. `set` a settings view (hunt-sections.js settingsOf: the server's bar and store rows), `floor` the store food id measured safe
 * (a ground's storeFloorFor, a hall's storeFloor). `only` (a store food id) asks about that one food, a slot's own, instead of the bar's best.
 * @returns {{ food: string, heal: number, want: string, slots: number[] } | null}  `slots` 1-based, the bar's slots holding `food`
 */
export function weakFoodOf(set, floor, only) {
  const want = floor ? healOf(set, floor) : null;
  if (want === null || !set || !Array.isArray(set.slots)) return null;
  let food = null, heal = null;
  if (only) { food = only; heal = healOf(set, only); }
  else {
    for (const sl of set.slots) {
      const id = storeFoodSlot(sl), h = id ? healOf(set, id) : null;
      if (h !== null && (heal === null || h > heal)) { food = id; heal = h; }
    }
  }
  if (food === null || heal === null || heal >= want) return null;
  const slots = [];
  set.slots.forEach((sl, i) => { if (storeFoodSlot(sl) === food) slots.push(i + 1); });
  return { food, heal, want: floor, slots };
}

/**
 * THE SENTENCE, in its table's words: 'prep' a page (names the slot, "Slot 4: Salted Shrimp heals 72 of 1,208 HP. Pick Salted Trout"),
 * 'bar' the slot's own hover (it IS the slot). `hpMax` the server's full HP (0 or null: the sentence without it); `who` another own hero's
 * name, said before the slot ("Bryony's slot 4: ..."). '' for no answer.
 */
export function weakFoodWords(home, weak, hpMax, who) {
  if (!weak) return '';
  const vars = { food: storeName(weak.food), want: storeName(weak.want), heal: whole(weak.heal), hp: hpMax > 0 ? whole(hpMax) : '' };
  const hp = hpMax > 0 ? '_hp' : '';
  if (home === 'bar') return t('bar.food_weak' + hp, vars);
  const n = listWords(weak.slots.map(String), 4);
  const where = who ? t(weak.slots.length > 1 ? 'prep.food_where_peer_many' : 'prep.food_where_peer', { name: who, n })
    : t(weak.slots.length > 1 ? 'prep.food_where_many' : 'prep.food_where', { n });
  return t('prep.food_weak' + hp, Object.assign(vars, { where }));
}
