// ════════════════════════════════════════════════════════════════════════
// src/shell/readiness.js — IS THIS CHARACTER READY TO HUNT? (QoL 2, Tyler 10-18)
//
// PURE. The readiness checklist the hunt prep window shows for every open
// character before a hunt starts ("Ranger: 0 ammo"). It reads only what the
// server projected into that character's envelope — the worn set, the action
// bar, the bag, stamina and gold — and
// says what is missing. Display only: it gates nothing (the server decides
// whether a hunt may start) and spends nothing.
//
//   readinessOf(cs) → { name, ready, checks: [{ id, ok, text }], short: [words] }
// ════════════════════════════════════════════════════════════════════════
import { settingsOf, staminaOf, analyzerOf } from '../session/hunt-sections.js?v=0.2.69';
import { bagOf, equipmentOf, goldOf, nameOf } from '../session/item-sections.js?v=0.2.69';
import { kindOf } from './bag-model.js?v=0.2.69';
import { itemName } from './widgets/bits.js?v=0.2.69';
import { storeOf } from './bar-draft.js?v=0.2.69';
import { whole } from '../render/format.js?v=0.2.69';
import { CONSUMABLES } from '../data/consumables.js?v=0.2.69';
import { BARE_WORDS, HEADS_UP_KINDS, spareWords } from './hunt-go.js?v=0.2.69';

const PLURAL = Object.freeze({ food: 'food', drink: 'drinks', ammo: 'ammo' });
const PLURAL_CAP = Object.freeze({ food: 'Food', drink: 'Drink', ammo: 'Ammo' });
/* The slot id that names no one item: the loaded ammo (condition-metrics.js ATTACK_KINDS). */
const KIND_OF_SLOT = Object.freeze({ loaded: 'ammo' });
/* What kind a slot's ONE item is: a food or drink by its consumable row (crafted or store), else by the bag model. */
const slotKind = (id) => KIND_OF_SLOT[id] || (CONSUMABLES[id] ? CONSUMABLES[id].kind : kindOf(id));
const storeItem = (id) => !!CONSUMABLES[id] && CONSUMABLES[id].source === 'store';

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
    /* A slot naming a store food or drink, or an ammo line with a plain partner, has the store behind
       it, paid per use (bar-draft.js storeOf): nobody has to buy first (Tyler 10-18). */
    const byKind = { food: new Set(), drink: new Set(), ammo: new Set() };
    const backed = {};
    /* A kind the bar spends at all: a loaded-ammo slot with no arrows in the bag still says so (and stops a shooter). */
    const wants = {};
    const storeOn = s.supplySource === 'store' || s.onEmpty === 'switch';
    for (const sl of s.slots) {
      if (sl.empty || sl.action.type === 'ability') continue;
      const k = slotKind(sl.item);
      if (!byKind[k]) continue;
      wants[k] = true;
      if (!KIND_OF_SLOT[sl.item] && !storeItem(sl.item)) byKind[k].add(sl.item);
      const st = storeOn ? storeOf(sl.action, s.store) : null;
      if (st && (!backed[k] || (st.price !== null && st.price < backed[k].price))) backed[k] = st;
      if (KIND_OF_SLOT[sl.item]) for (const r of bag) if (kindOf(r.id) === k) byKind[k].add(r.id);
    }
    for (const [k, ids] of Object.entries(byKind)) {
      if (!wants[k]) continue;
      const n = Array.from(ids).reduce((t, id) => t + (have.get(id) || 0), 0);
      const st = backed[k];
      const store = st ? (st.price === null ? 'then the store as used' : 'then the store, ' + st.price + ' gp each as used') : '';
      /* An empty food or drink slot is a heads-up, never a blocker (designer 2026-10-29, Tyler's "0 food" report): it
         names the empty stock and, when the bag carries food the bar does not name, the fix. Empty ammo stops a shooter. */
      const out = n === 0 && !st;
      const heads = HEADS_UP_KINDS.has(k);
      const named = Array.from(ids).map(itemName);
      const text = out ? PLURAL_CAP[k] + ': ' + (named.length ? 'no ' + named.join(' or ') + ' left' : 'none for the bar') + '. ' + ((heads && spareWords(k, bag, ids)) || BARE_WORDS[k])
        : st ? PLURAL_CAP[k] + ': ' + (n > 0 ? whole(n) + ' of your own, ' + store : store.replace(/^then the store/, 'the store')) : whole(n) + ' ' + PLURAL[k] + ' for the bar';
      checks.push({ id: k, ok: !out || heads, text });
      if (out && !heads) short.push('0 ' + PLURAL[k]);
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

/** "Ranger: 0 ammo, no stamina" or "Tyler: ready" (an empty food or drink slot is a heads-up, never short). */
export function readinessLine(r) {
  return r.name + ': ' + (r.ready ? 'ready' : r.short.join(', '));
}
