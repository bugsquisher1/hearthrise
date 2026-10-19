// ════════════════════════════════════════════════════════════════════════
// src/shell/readiness.js — IS THIS CHARACTER READY TO HUNT? (QoL 2, Tyler 10-18)
//
// PURE. The readiness checklist the hunt prep window shows for every open
// character before a hunt starts ("Druid: 0 drinks"). It reads only what the
// server projected into that character's envelope — the worn set, the action
// bar, the bag, the restock targets, stamina, gold and the refill quote — and
// says what is missing. Display only: it gates nothing (the server decides
// whether a hunt may start) and spends nothing.
//
//   readinessOf(cs) → { name, ready, checks: [{ id, ok, text }], short: [words] }
// ════════════════════════════════════════════════════════════════════════
import { settingsOf, staminaOf } from '../session/hunt-sections.js?v=0.2.1';
import { bagOf, equipmentOf, rulesOf, shopOf, goldOf, nameOf } from '../session/item-sections.js?v=0.2.1';
import { kindOf } from './bag-model.js?v=0.2.1';
import { itemName } from './widgets/bits.js?v=0.2.1';
import { whole } from '../render/format.js?v=0.2.1';

const PLURAL = Object.freeze({ food: 'food', drink: 'drinks', ammo: 'ammo' });

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
    const byKind = { food: new Set(), drink: new Set(), ammo: new Set() };
    for (const sl of s.slots) if (!sl.empty && sl.action.type !== 'ability' && byKind[kindOf(sl.item)]) byKind[kindOf(sl.item)].add(sl.item);
    for (const [k, ids] of Object.entries(byKind)) {
      if (!ids.size) continue;
      const n = Array.from(ids).reduce((t, id) => t + (have.get(id) || 0), 0);
      const store = s.supplySource === 'store' || s.onEmpty === 'switch';
      checks.push({ id: k, ok: n > 0, text: whole(n) + ' ' + PLURAL[k] + ' for the bar' + (n === 0 && store ? ' (the store will charge per use)' : '') });
      if (n === 0) short.push('0 ' + PLURAL[k]);
    }
  } else checks.push({ id: 'bar', ok: true, text: 'The action bar is set when a hunt is chosen' });

  /* The restock targets: each supply below its target. */
  const rules = rulesOf(cs);
  if (rules) {
    for (const [id, target] of Object.entries(rules.restock)) {
      const n = have.get(id) || 0;
      if (n < target) { checks.push({ id: 'restock:' + id, ok: false, text: whole(n) + ' of ' + whole(target) + ' ' + itemName(id) }); short.push(whole(n) + '/' + whole(target) + ' ' + itemName(id)); }
    }
  }
  const st = staminaOf(cs);
  if (st) {
    checks.push({ id: 'stamina', ok: st.msLeft > 0, text: st.msLeft > 0 ? 'Stamina left' : 'No stamina left: rest first' });
    if (!(st.msLeft > 0)) short.push('no stamina');
  }
  const quote = (shopOf(cs) || {}).refill;
  const gp = goldOf(cs);
  if (quote && quote.total > 0 && gp !== null && gp < quote.total) { checks.push({ id: 'gold', ok: false, text: 'Not enough gold to refill' }); short.push('short of gold'); }
  return { name, ready: short.length === 0, checks, short };
}

/** "Druid: 0 drinks, 4/20 Wheat Bread" or "Tyler: ready". */
export function readinessLine(r) {
  return r.name + ': ' + (r.ready ? 'ready' : r.short.join(', '));
}
