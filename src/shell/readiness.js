// ════════════════════════════════════════════════════════════════════════
// src/shell/readiness.js — IS THIS CHARACTER READY TO HUNT? (QoL 2, Tyler 10-18)
//
// PURE. The readiness checklist the hunt prep window shows for every open
// character before a hunt starts ("Druid: 0 drinks"). It reads only what the
// server projected into that character's envelope — the worn set, the action
// bar, the bag, stamina and gold — and
// says what is missing. Display only: it gates nothing (the server decides
// whether a hunt may start) and spends nothing.
//
//   readinessOf(cs) → { name, ready, checks: [{ id, ok, text }], short: [words] }
// ════════════════════════════════════════════════════════════════════════
import { settingsOf, staminaOf, analyzerOf } from '../session/hunt-sections.js?v=0.2.25';
import { bagOf, equipmentOf, goldOf, nameOf } from '../session/item-sections.js?v=0.2.25';
import { kindOf } from './bag-model.js?v=0.2.25';
import { itemName } from './widgets/bits.js?v=0.2.25';
import { storeOf } from './bar-draft.js?v=0.2.25';
import { whole } from '../render/format.js?v=0.2.25';

const PLURAL = Object.freeze({ food: 'food', drink: 'drinks', ammo: 'ammo' });
const PLURAL_CAP = Object.freeze({ food: 'Food', drink: 'Drink', ammo: 'Ammo' });
/* The slot ids that name a kind, not one item (condition-metrics.js CONSUME_KINDS / ATTACK_KINDS). */
const KIND_OF_SLOT = Object.freeze({ food: 'food', drink: 'drink', loaded: 'ammo' });

/**
 * @param {object} cs a CharacterSession
 */
export function readinessOf(cs) {
  const name = nameOf(cs) || 'Character ' + ((cs && Number.isInteger(cs.slot) ? cs.slot : 0) + 1);
  const bag = bagOf(cs);
  const checks = [];
  const short = [];
  if (!bag) return { name, ready: false, checks: [{ id: 'loading', ok: false, text: 'Reading this character…' }], short: ['not read yet'] };
  const have = new Map(bag.map((r) => [r.id, r.qty]));
  const eq = equipmentOf(cs) || {};
  checks.push({ id: 'weapon', ok: !!eq.weapon, text: eq.weapon ? 'Weapon: ' + itemName(eq.weapon) : 'No weapon worn' });
  if (!eq.weapon) short.push('no weapon');

  /* What the bar spends, by kind: the total in the bag of every item its slots name. */
  const s = settingsOf(cs);
  if (s) {
    /* A slot naming Any food / Any drink, or an ammo line with a plain partner, has the store behind
       it, paid per use (bar-draft.js storeOf): nobody has to buy first (Tyler 10-18). */
    const byKind = { food: new Set(), drink: new Set(), ammo: new Set() };
    const backed = {};
    const storeOn = s.supplySource === 'store' || s.onEmpty === 'switch';
    for (const sl of s.slots) {
      if (sl.empty || sl.action.type === 'ability') continue;
      const k = KIND_OF_SLOT[sl.item] || kindOf(sl.item);
      if (!byKind[k]) continue;
      if (!KIND_OF_SLOT[sl.item]) byKind[k].add(sl.item);
      const st = storeOn ? storeOf(sl.action) : null;
      if (st && (!backed[k] || (st.price !== null && st.price < backed[k].price))) backed[k] = st;
      if (KIND_OF_SLOT[sl.item]) for (const r of bag) if (kindOf(r.id) === k) byKind[k].add(r.id);
    }
    for (const [k, ids] of Object.entries(byKind)) {
      if (!ids.size && !backed[k]) continue;
      const n = Array.from(ids).reduce((t, id) => t + (have.get(id) || 0), 0);
      const st = backed[k];
      const store = st ? (st.price === null ? 'then the store as used' : 'then the store, ' + (st.from ? 'from ' : '') + st.price + ' gp each as used') : '';
      checks.push({ id: k, ok: n > 0 || !!st, text: st ? PLURAL_CAP[k] + ': ' + (n > 0 ? whole(n) + ' of your own, ' + store : store.replace(/^then the store/, 'the store')) : whole(n) + ' ' + PLURAL[k] + ' for the bar' });
      if (n === 0 && !st) short.push('0 ' + PLURAL[k]);
    }
  } else checks.push({ id: 'bar', ok: true, text: 'The action bar is set when a hunt is chosen' });

  const st = staminaOf(cs);
  if (st) {
    checks.push({ id: 'stamina', ok: st.msLeft > 0, text: st.msLeft > 0 ? 'Stamina left' : 'No stamina left: rest first' });
    if (!(st.msLeft > 0)) short.push('no stamina');
  }
  const gp = goldOf(cs);
  /* How long the gold lasts: the gold and, while a hunt runs, the server's supply spend an hour (the analyzer's waste). */
  if (gp !== null) {
    const an = analyzerOf(cs);
    const spend = an && an.hero.perHour.waste > 0 ? an.hero.perHour.waste : null;
    checks.push({ id: 'gold-now', ok: true, text: 'Gold: ' + whole(gp) + ' gp' + (spend ? ' · supplies about ' + whole(spend) + ' gp an hour on this hunt, about ' + (Math.floor((gp / spend) * 10) / 10) + ' h of gold' : '') });
  }
  return { name, ready: short.length === 0, checks, short };
}

/** "Druid: 0 drinks, no stamina" or "Tyler: ready". */
export function readinessLine(r) {
  return r.name + ': ' + (r.ready ? 'ready' : r.short.join(', '));
}
