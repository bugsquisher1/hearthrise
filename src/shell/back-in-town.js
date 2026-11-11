// ════════════════════════════════════════════════════════════════════════
// src/shell/back-in-town.js — "BACK IN TOWN": THE TRIP HOME AS A LIST OF PRESSES.
//
// Tyler 2026-11-11: the whole UX must flow, and coming back from a hunt had no
// guided flow (after 4 h the summary's gold button was still the first tutorial
// card, selling had four routes, depositing was one press per stack). The hunt
// summary (windows/hunt-summary.js) shows these steps under the hunt's numbers,
// each ONE press with its real count and value, in the order a player does them:
//   equip     what Equip upgrades would put on (upgrade-plan.js): ONE `equip`
//   sell      every stack the LOOT PLAN marks Sell (Dispatch loot's own rule, never
//             a second "junk only" rule, Coordinator 2026-11-11): ONE `vendor_sell_many`
//   deposit   every stack the loot plan marks Deposit: ONE hr_bank_move_many, all
//             or nothing (depositPlanned below, session/storage-intents.js)
//   bless     every Blessing not on, while the purse covers the next one: the
//             Services tab's own Bless all (bless-all.js)
//   again     Hunt again, the summary's own press
// PURE except depositPlanned (the one intent helper). Every count and value is the
// server's: the bag, the worn set, the loot plan, the shop's bids, the depot and the
// Blessings all come from the envelope's sections; nothing here is a gate the server
// trusts. A step with nothing to do is not listed; a step the player pressed on this
// card that now has nothing left is listed as done, so the player sees what happened;
// the first open step is the card's ONE gold press, else Hunt again is.
// ════════════════════════════════════════════════════════════════════════
import { sellPlan, isStartKit, SELL_LINES_MAX } from './bag-model.js?v=0.2.123';
import { upgradeWords } from './upgrade-plan.js?v=0.2.123';
import { upgradeOf } from './widgets/upgrade-line.js?v=0.2.123';
import { bagOf, rulesOf, shopOf, blessingsOf, goldOf } from '../session/item-sections.js?v=0.2.123';
import { moveStorageMany } from '../session/storage-intents.js?v=0.2.123';
import { itemName } from './widgets/bits.js?v=0.2.123';
import { gold, listWords } from '../render/format.js?v=0.2.123';
import { t } from '../render/player-text.js?v=0.2.123';

const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']);
const names = (ids) => listWords(ids.map(itemName));

/* What the loot plan marks `rule` for, in the bag's order: never a locked stack (the server's Dispatch loot skips them too),
   never the starting kit for a sale (hr_loot_plan_refusal start_kit). [{ id, qty }] */
function planned(bag, rules, rule) {
  if (!bag || !rules) return [];
  return bag.filter((r) => rules.loot[r.id] === rule && !rules.locked.has(r.id) && !(rule === 'sell' && isStartKit(r.id)));
}

/**
 * The Back in town steps from the server's sections, and which press is the gold one.
 * @param {{ plan: object|null, bag: {id:string,qty:number}[]|null, rules: {locked:Set, loot:object}|null, bids: Map|null,
 *           blessings: {tiers:{tier:number,price:number,held:boolean}[], freeUntil:number|null}|null, purse: number|null, did: Map<string,string> }} o
 *        plan: upgradePlan's answer (upgrade-line.js upgradeOf); bids: the shop's (shopOf); purse: goldOf; did: the steps pressed on this
 *        card, each with its title as it was pressed (a done row keeps saying what it did: "Sell 17 stacks for 5,407 gp · Done")
 * @returns {{ steps: {id:string, title:string, words:string, verb:string, icon:string|null, done:boolean, count:number,
 *             ops?:object, lines?:{item:string,qty:number}[], tiers?:number[]}[], primary: string }}
 */
export function townSteps(o) {
  const did = (o && o.did) || new Map();
  const out = [];
  const add = (step) => {
    if (step.count > 0) out.push(Object.assign(step, { done: false }));
    else if (did.has(step.id)) out.push(Object.assign(step, { done: true, title: did.get(step.id) || step.title, words: '' }));
  };
  /* equip: the plan's picks, ONE delta */
  const plan = o && o.plan;
  const picks = plan && Array.isArray(plan.picks) ? plan.picks : [];
  add({ id: 'equip', count: picks.length, title: t('summary.equip_n', { count: picks.length }), words: picks.length ? upgradeWords(plan) : '',
    verb: t('controls.equip'), icon: picks.length ? picks[0].id : null, ops: plan && plan.ops ? Object.assign({}, plan.ops) : {} });
  /* sell: the plan's Sell stacks at the shop's bids (a stack with no bid is not sold: nothing could show what it brings), one sale's worth of lines */
  const bag = (o && o.bag) || [], rules = (o && o.rules) || null, bids = (o && o.bids) || null;
  const sale = sellPlan(bag, planned(bag, rules, 'sell').map((r) => r.id), { locked: rules ? rules.locked : null, bids });
  const lines = sale.lines.slice(0, SELL_LINES_MAX);
  const total = lines.reduce((n, l) => n + (bids && bids.has(l.item) ? bids.get(l.item) * l.qty : 0), 0);
  add({ id: 'sell', count: lines.length, title: t('summary.sell_n', { count: lines.length, total: gold(total) }),
    words: lines.length ? t('summary.sell_words', { names: names(lines.map((l) => l.item)) }) : '', verb: t('controls.sell'), icon: lines.length ? lines[0].item : null, lines });
  /* deposit: the plan's Deposit stacks, whole, with their worth when the shop bids on any */
  const dep = planned(bag, rules, 'deposit');
  const worth = dep.reduce((n, r) => n + (bids && bids.has(r.id) ? bids.get(r.id) * r.qty : 0), 0);
  add({ id: 'deposit', count: dep.length, title: t(worth > 0 ? 'summary.deposit_worth' : 'summary.deposit_n', worth > 0 ? { count: dep.length, worth: gold(worth) } : { count: dep.length }),
    words: dep.length ? t('summary.deposit_words', { count: dep.length, names: names(dep.map((r) => r.id)) }) : '', verb: t('controls.deposit'), icon: dep.length ? dep[0].id : null,
    lines: dep.map((r) => ({ item: r.id, qty: r.qty })) });
  /* bless: the tiers not on, while the purse covers the next (the server prices each as it is bought); a purse not read yet reads as enough */
  const b = o && o.blessings;
  const missing = b ? b.tiers.filter((x) => !x.held) : [];
  const purse = o && Number.isFinite(o.purse) ? o.purse : null;
  const can = missing.length > 0 && (purse === null || purse >= missing[0].price);
  const cost = missing.reduce((n, x) => n + x.price, 0);
  add({ id: 'bless', count: can ? missing.length : 0, title: t('summary.bless_n', { names: listWords(missing.map((x) => ROMAN[x.tier] || String(x.tier))) }),
    words: !can ? '' : cost > 0 ? t('summary.bless_cost', { total: gold(cost) }) : t('summary.bless_free', { level: b && b.freeUntil !== null ? b.freeUntil : '' }),
    verb: t('summary.bless'), icon: null, tiers: missing.map((x) => x.tier) });
  const first = out.find((s) => !s.done);
  return { steps: out, primary: first ? first.id : 'again' };
}

/** This character's steps, from what the server sent. `did`: the steps pressed on this card (the window's scratch). */
export function townStepsOf(cs, did) {
  const shop = shopOf(cs);
  return townSteps({ plan: upgradeOf(cs), bag: bagOf(cs), rules: rulesOf(cs), bids: shop ? shop.bids : null, blessings: blessingsOf(cs), purse: goldOf(cs), did });
}

/**
 * Put the plan's Deposit stacks away: ONE hr_bank_move_many naming the stacks (whole, at the server's own counts), all of them or none
 * (lane/c-bank-move-many, storage-intents.js). A refusal names the stack it stopped on, and its words are the answer. `moved` counts the
 * stacks that went: the server's count, or none.
 * @returns {Promise<{ok:boolean, error?:string, moved:number}>}
 */
export async function depositPlanned(account, cs, lines) {
  const r = await moveStorageMany(account, cs, lines.map((l) => l.item), 'deposit');
  return Object.assign({ moved: r && r.ok ? r.count : 0 }, r || { ok: false, error: 'network' });
}
