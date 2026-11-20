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
//             Services tab's own Bless all (bless-all.js); never after a hunt whose death costs nothing (the Tower)
//   ground    THE NEXT GROUND (hunt-list.js nextGroundFrom; audit 2026-11-18 A12: on a phone Hunt again kept a hero in the Mill Cellar all night
//             after Level 5 and nothing said there was a better ground): the Hunts list's Recommended ground when it is a step up from the one
//             just hunted, by the server's Levels, its Show opening that ground in Hunts. Never the gold press (it points, Hunt again stays),
//             EXCEPT after a ground outgrown (audit 2026-11-19 L2: the card opened on a greyed Hunt again and this row sat under the sticky
//             foot): Hunt again can't go, so the next ground is the press over every chore, the summary's foot carrying it as Go to <ground>
//   again     Hunt again, the summary's own press
//   buy       THE NEXT BUY (next-buy.js, lane/a-next-steps; audit 2026-11-15 F12/F20: gold piled up and this card went silent): the one most
//             useful thing the purse covers, last, its Show opening where it is bought. Never the gold press: it points, it buys nothing
// PURE except depositPlanned (the one intent helper). Every count and value is the
// server's: the bag, the worn set, the loot plan, the shop's bids, the depot and the
// Blessings all come from the envelope's sections; nothing here is a gate the server
// trusts. A step with nothing to do is not listed; a step the player pressed on this
// card that now has nothing left is listed as done, so the player sees what happened;
// the first open step is the card's ONE gold press, else Hunt again is (after a ground outgrown, the next ground is).
// ════════════════════════════════════════════════════════════════════════
import { sellPlan, isStartKit } from './bag-model.js';
import { upgradeWords } from './upgrade-plan.js';
import { upgradeOf } from './widgets/upgrade-line.js';
import { nextBuyOf } from './next-buy.js';
import { bagOf, rulesOf, shopOf, blessingsOf, goldOf } from '../session/item-sections.js';
import { moveStorageMany } from '../session/storage-intents.js';
import { huntOf, sessionModeOfHunt, huntBestsOf } from '../session/hunt-sections.js';
import { levelOf } from '../session/character-sections.js';
import { partyMembershipOf } from '../session/party-sections.js';
import { nextGroundFrom, adviceLevels } from './hunt-list.js';
import { itemName } from './widgets/bits.js';
import { gold, listWords } from '../render/format.js';
import { t } from '../render/player-text.js';

const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']);
const names = (ids) => listWords(ids.map(itemName));

/* What the loot plan marks `rule` for, in the bag's order: never a locked stack (the server's Dispatch loot skips them too),
   never the starting kit for a sale (hr_loot_plan_refusal start_kit). [{ id, qty }] */
function planned(bag, rules, rule) {
  if (!bag || !rules) return [];
  return bag.filter((r) => rules.loot[r.id] === rule && !rules.locked.has(r.id) && !(rule === 'sell' && isStartKit(r.id)));
}
/** @typedef {Map<string, number>} Bids  item id to the shop's bid (gold per unit) */


/**
 * The Back in town steps from the server's sections, and which press is the gold one.
 * @param {{ plan: object|null, bag: {id:string,qty:number}[]|null, rules: {locked:Set<string>, loot:object}|null, bids: Bids|null,
 *           blessings: {tiers:{tier:number,price:number,held:boolean}[], freeUntil:number|null}|null, purse: number|null, did: Map<string,string>,
 *           buy?: {title:string, words:string, icon:string|null, glyph?:string|null, place:object}|null, free?: boolean,
 *           ground?: {row:{hunt:string,name:string,band:number[]}, levels:number[]}|null, outgrown?: boolean }} o
 *        plan: upgradePlan's answer (upgrade-line.js upgradeOf); bids: the shop's (shopOf); purse: goldOf; did: the steps pressed on this
 *        card, each with its title as it was pressed (a done row keeps saying what it did: "Sell 17 stacks for 5,407 gp · Done"); buy: next-buy.js nextBuy's answer;
 *        free: the hunt's mode takes nothing for a death (the Tower), so no Bless step; ground: the next ground (nextGroundFrom) and the Levels it was read for;
 *        outgrown: the hunt ended `outgrown` (hunt-grounds.js endsAtLevel), so it has no Hunt again and the next ground is the press
 * @returns {{ steps: {id:string, title:string, words:string, verb:string, icon:string|null, done:boolean, count:number,
 *             ops?:object, lines?:{item:string,qty:number}[], tiers?:number[], place?:object, name?:string, glyph?:string|null}[], primary: string }}
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
  const lines = sale.lines, total = sale.total;   // one sale's worth: sellPlan stops at SELL_LINES_MAX
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
  /* ...never after a hunt whose mode takes nothing for a death (`free`: the Tower), where a Blessing has nothing to cut (QA gate 2026-11-17) */
  const offer = can && !(o && o.free);
  const cost = missing.reduce((n, x) => n + x.price, 0);
  add({ id: 'bless', count: offer ? missing.length : 0, title: t('summary.bless_n', { names: listWords(missing.map((x) => ROMAN[x.tier] || String(x.tier))) }),
    words: !offer ? '' : cost > 0 ? t('summary.bless_cost', { total: gold(cost) }) : t('summary.bless_free', { level: b && b.freeUntil !== null ? b.freeUntil : '' }),
    verb: t('summary.bless'), icon: null, tiers: missing.map((x) => x.tier) });
  /* ground: the step up the Hunts list recommends, after the chores and before the buy; it points, so never the gold press */
  const g = o && o.ground;
  const lv = g && g.row && Array.isArray(g.levels) ? g.levels.filter(Number.isInteger) : [];
  if (lv.length) {
    const lo = Math.min(...lv), hi = Math.max(...lv);
    const levels = lo === hi ? t('hunts.level_one', { level: lo }) : t('hunts.levels_range', { lo, hi });
    out.push({ id: 'ground', count: 1, done: false, title: t('summary.ground_up', { ground: g.row.name }), name: g.row.name, verb: t('controls.show'), icon: null, glyph: 'uiMap',
      words: t('summary.ground_up_words', { band: t('hunts.levels_range', { lo: g.row.band[0], hi: g.row.band[1] }), levels }), place: { kind: 'hunt', hunt: g.row.hunt } });
  }
  /* buy: one line, last, never the gold press (its press only opens the window where it is bought) */
  const buy = o && o.buy;
  if (buy) out.push({ id: 'buy', count: 1, done: false, title: buy.title, words: buy.words, verb: t('controls.show'), icon: buy.icon || null, glyph: buy.glyph || null, place: buy.place });
  const first = out.find((s) => !s.done && s.id !== 'buy' && s.id !== 'ground');
  /* A GROUND OUTGROWN (`outgrown`: the hunt ended at its endsAtLevel, src/data/hunt-grounds.js) has no Hunt again (the server refuses it), so
     the card's press is the next ground, where the hero goes now, ahead of the chores (audit 2026-11-19 L2: the chores' gold row lay under the
     sticky foot, which led with a greyed Hunt again); each chore keeps its own press */
  if (o && o.outgrown && out.some((s) => s.id === 'ground')) return { steps: out, primary: 'ground' };
  return { steps: out, primary: first ? first.id : 'again' };
}

/** This character's steps, from what the server sent. `did`: the steps pressed on this card (the window's scratch). */
export function townStepsOf(cs, did) {
  const shop = shopOf(cs), plan = upgradeOf(cs);
  /* the steps follow the hunt the server holds ended (the summary shows them on that hunt's card only) */
  const h = huntOf(cs);
  const free = !!h && h.ended && sessionModeOfHunt(h.huntId).deathLossPm === 0;
  return townSteps({ plan, bag: bagOf(cs), rules: rulesOf(cs), bids: shop ? shop.bids : null, blessings: blessingsOf(cs), purse: goldOf(cs), did, buy: nextBuyOf(cs, plan), free, ground: groundOf(cs, h),
    outgrown: !!h && h.ended && h.endReason === 'outgrown' });
}

/**
 * THE WAY ON FROM A GROUND OUTGROWN, for the away card (windows/away.js): the next ground's { hunt, name } when the hunt the server holds
 * ended `outgrown` and the Hunts list recommends a step up, else null. The ground the summary's foot presses.
 */
export function outgrownGroundOf(cs) {
  const h = huntOf(cs);
  const g = h && h.ended && h.endReason === 'outgrown' ? groundOf(cs, h) : null;
  return g ? { hunt: g.row.hunt, name: g.row.name } : null;
}

/* The next ground off the hunt the server holds ended (hunt-list.js nextGroundFrom), read for the server's Levels: this hero's, or its
   party's seats (the Hunts window's own advice, hunt-list.js adviceLevels), or null. */
function groundOf(cs, h) {
  const lv = levelOf(cs), party = partyMembershipOf(cs);
  if (!h || !h.ended || !lv) return null;
  const levels = [].concat(adviceLevels(lv.level, party)).filter(Number.isInteger);
  /* a huntRows() row (recommendation types it a bare object) */
  const row = /** @type {{hunt: string, name: string, band: number[]}|null} */ (nextGroundFrom(h.huntId, levels, party ? party.seats.length : 1, undefined, huntBestsOf(cs)));
  return row ? { row, levels } : null;
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
