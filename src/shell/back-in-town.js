// ════════════════════════════════════════════════════════════════════════
// src/shell/back-in-town.js — "BACK IN TOWN": THE TRIP HOME AS A LIST OF PRESSES.
//
// Tyler 2026-11-11: the whole UX must flow, and coming back from a hunt had no
// guided flow (after 4 h the summary's gold button was still the first tutorial
// card, selling had four routes, depositing was one press per stack). The hunt
// summary (windows/hunt-summary.js) shows these steps under the hunt's numbers,
// each ONE press with its real count and value, in the order a player does them:
//   equip     what Equip upgrades would put on (upgrade-plan.js): ONE `equip`
//   sell      every stack the LOOT PLAN marks Sell (Dispatch loot's own rule) AND the junk no plan
//             holds (balance program L03, 2026-11-20: "Sell junk for N gp" on the end card; the
//             junk is the Shop's own "Sell all junk" set, bag-model.js lootToSell, never a second
//             rule): ONE `vendor_sell_many`, N at the shop's bids. All junk, it reads "Sell junk for N"
//   always    after that sale, the junk it sold that had no plan: "Always sell these", ONE
//             hr_loot_rule_set a stack (the existing per-item plan, Sell), so the next card's
//             sale is the plan's; done once the server's plan says Sell for each
//   deposit   every stack the loot plan marks Deposit: ONE hr_bank_move_many, all
//             or nothing (depositPlanned below, session/storage-intents.js)
//   bless     every Blessing not on, while the purse covers the next one: the
//             Services tab's own Bless all (bless-all.js); never after a hunt whose death costs nothing (the Tower).
//             Its line says what a Blessing does (L03, retention R6), from the server's tier rows
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
import { sellPlan, isStartKit, lootToSell, kindOf, upgradeNeeds } from './bag-model.js';
import { upgradeWords } from './upgrade-plan.js';
import { upgradeOf } from './widgets/upgrade-line.js';
import { nextBuyOf } from './next-buy.js';
import { bagOf, rulesOf, shopOf, blessingsOf, goldOf, nameOf } from '../session/item-sections.js';
import { HUNTS } from '../data/hunts.js';
import { THE_PATH } from '../data/the-path.js';
import { moveStorageMany } from '../session/storage-intents.js';
import { huntOf, sessionModeOfHunt, huntBestsOf } from '../session/hunt-sections.js';
import { homeOf, chestsOf } from '../session/home-sections.js';
import { levelOf } from '../session/character-sections.js';
import { partyMembershipOf } from '../session/party-sections.js';
import { recruitsOf } from '../session/recruit-sections.js';
import { nextGroundFrom, adviceLevels } from './hunt-list.js';
import { itemName } from './widgets/bits.js';
import { gold, listWords } from '../render/format.js';
import { t } from '../render/player-text.js';

const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']);
const names = (ids) => listWords(ids.map(itemName));
/* The most plans one "Always sell these" press sets: each is one hr_loot_rule_set, and they share the server's `hunt` rate bucket (30 a minute,
   hr_rpc_gate) with Hunt again and every bag write, so one press never spends it; a longer list takes the next press. */
const ALWAYS_PER_PRESS = 12;

/* What the loot plan marks `rule` for, in the bag's order: never a locked stack (the server's Dispatch loot skips them too),
   never the starting kit for a sale (hr_loot_plan_refusal start_kit). [{ id, qty }] */
function planned(bag, rules, rule) {
  if (!bag || !rules) return [];
  return bag.filter((r) => rules.loot[r.id] === rule && !rules.locked.has(r.id) && !(rule === 'sell' && isStartKit(r.id)));
}
/** @typedef {Map<string, number>} Bids  item id to the shop's bid (gold per unit) */


/* THE PATH'S OWN LINE for the first Level 5 (src/data/the-path.js first_level_5, designer D-1): the end card says it word for word when it is
   that moment, the Mill Cellar outgrown with the recruits ready; any later outgrown ground with the press still waiting says the summary's line. */
const FIRST_LEVEL_5 = THE_PATH.find((r) => r.id === 'first_level_5');

/* THE RECRUITS this account's one hero has earned (Tyler RD-Q6 a; the server's `recruits` section, recruit-sections.js), with the outgrown
   ground's name: { name, ground, count, level, first }, or null when the server offers no press ready now. */
function partyToMake(cs, h) {
  const o = recruitsOf(cs);
  const ground = h && h.huntId ? (HUNTS.find((x) => x.id === h.huntId) || {}).name : null;
  if (!o || !o.ready || !ground) return null;
  /* the first Level 5 of the account: the Mill Cellar outgrown */
  return { name: nameOf(cs) || '', ground, count: o.slots.length, level: o.level, first: h.huntId === 'mill_cellar' };
}

/**
 * The Back in town steps from the server's sections, and which press is the gold one.
 * @param {{ plan: object|null, bag: {id:string,qty:number}[]|null, rules: {locked:Set<string>, loot:object}|null, bids: Bids|null,
 *           blessings: {tiers:{tier:number,price:number,held:boolean,permille?:number}[], freeUntil:number|null}|null, purse: number|null, did: Map<string,string>,
 *           buy?: {title:string, words:string, icon:string|null, glyph?:string|null, place:object}|null, free?: boolean,
 *           ground?: {row:{hunt:string,name:string,band:number[]}, levels:number[]}|null, outgrown?: boolean, needs?: Set<string>|null, sold?: string[],
 *           party?: {name:string, ground:string, count:number, first?:boolean}|null }} o
 *        plan: upgradePlan's answer (upgrade-line.js upgradeOf); bids: the shop's (shopOf); purse: goldOf; did: the steps pressed on this
 *        card, each with its title as it was pressed (a done row keeps saying what it did: "Sell 17 stacks for 5,407 gp · Done"); buy: next-buy.js nextBuy's answer;
 *        needs: what the House's next steps name (bag-model.js upgradeNeeds), which no junk sale takes; sold: the junk this card's sale took with no plan;
 *        free: the hunt's mode takes nothing for a death (the Tower), so no Bless step; ground: the next ground (nextGroundFrom) and the Levels it was read for;
 *        outgrown: the hunt ended `outgrown` (hunt-grounds.js endsAtLevel), so it has no Hunt again and the next ground is the press;
 *        party: the account still has heroes to make when a ground is outgrown (the Path's first_level_5, designer D-1): Build your party is
 *        the press, and the next ground stays as the second, "Go on alone"
 * @returns {{ steps: {id:string, title:string, words:string, verb:string, icon:string|null, done:boolean, count:number,
 *             ops?:object, lines?:{item:string,qty:number}[], tiers?:number[], place?:object, name?:string, glyph?:string|null, fresh?:string[], items?:string[]}[], primary: string }}
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
  /* sell: the plan's Sell stacks, and the junk no other plan holds (the Shop's Sell all junk set, lootToSell: never a Material, a Rare or what the
     House's next step names, `needs`), at the shop's bids (a stack with no bid is not sold: nothing could show what it brings), one sale's worth
     of lines. No junk is named before the server's plans are read: a locked stack is the plan section's to say. */
  const bag = (o && o.bag) || [], rules = (o && o.rules) || null, bids = (o && o.bids) || null;
  const marked = new Set(planned(bag, rules, 'sell').map((r) => r.id));
  const junk = new Set(rules ? lootToSell(bag, (o && o.needs) || null).filter((id) => !rules.loot[id] && !isStartKit(id)) : []);
  const sale = sellPlan(bag, bag.filter((r) => marked.has(r.id) || junk.has(r.id)).map((r) => r.id), { locked: rules ? rules.locked : null, bids });
  const lines = sale.lines, total = sale.total;   // one sale's worth: sellPlan stops at SELL_LINES_MAX
  const allJunk = lines.length > 0 && lines.every((l) => kindOf(l.item) === 'junk');
  const allMarked = lines.every((l) => marked.has(l.item));
  add({ id: 'sell', count: lines.length, title: allJunk ? t('summary.sell_junk', { total: gold(total) }) : t('summary.sell_n', { count: lines.length, total: gold(total) }),
    words: !lines.length ? '' : allMarked ? t('summary.sell_words', { names: names(lines.map((l) => l.item)) }) : names(lines.map((l) => l.item)),
    verb: t('controls.sell'), icon: lines.length ? lines[0].item : null, lines,
    /* the junk this sale takes that no plan holds yet: what "Always sell these" offers once it is sold */
    fresh: lines.filter((l) => !marked.has(l.item)).map((l) => l.item) });
  /* always: the junk this card sold with no plan (`sold`, the window's scratch), while the server's plan does not say Sell for it; one press sets
     the plan for up to ALWAYS_PER_PRESS of them. Never before the plans are read. */
  const want = rules ? ((o && o.sold) || []).filter((id) => rules.loot[id] !== 'sell' && !isStartKit(id)) : [];
  add({ id: 'always', count: want.length, title: t('summary.always'), words: want.length ? t('summary.always_words', { names: names(want) }) : '',
    verb: t('summary.always_verb'), icon: want.length ? want[0] : null, items: want.slice(0, ALWAYS_PER_PRESS) });
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
  /* WHAT A BLESSING DOES, one line (retention dive R6: "Bless I, II and III. Free until Level 30" and nothing said what one is): the cut a death
     takes with every tier on (the server's top tier's permille, each tier's row counts the ones under it), and that a death uses them up */
  const top = b && b.tiers.length ? b.tiers[b.tiers.length - 1].permille : null;
  const does = Number.isSafeInteger(top) && top > 0 ? t('summary.bless_does', { pct: Math.round(top / 10) + '%' }) : '';
  const price = cost > 0 ? t('summary.bless_cost', { total: gold(cost) }) : t('summary.bless_free', { level: b && b.freeUntil !== null ? b.freeUntil : '' });
  add({ id: 'bless', count: offer ? missing.length : 0, title: t('summary.bless_n', { names: listWords(missing.map((x) => ROMAN[x.tier] || String(x.tier))) }),
    words: !offer ? '' : [does, price].filter(Boolean).join(' · '),
    verb: t('summary.bless'), icon: null, tiers: missing.map((x) => x.tier) });
  /* RECRUIT YOUR PARTY (designer D-1, the Path's first_level_5; Tyler RD-Q6 a): a ground outgrown while the server offers the recruit press.
     The press opens All characters, where ONE press makes the recruits (windows/recruits-pane.js); the next ground stays, "Go on alone" */
  const party = o && o.outgrown && o.party && o.party.count > 0 ? o.party : null;
  if (party) {
    const first = FIRST_LEVEL_5 && party.first;
    /* a short title and the line as its words, so the gold press never squeezes a two-sentence title (art review 2026-11-21 #5); the
       Characters press's own glyph, never the Bless shield a step without one borrows (#6) */
    out.push({ id: 'party', count: party.count, done: false, title: t('summary.party_title', { count: party.count }),
      words: first ? FIRST_LEVEL_5.line.replace('{Name}', party.name)
        : t('summary.party_line', { name: party.name, ground: party.ground, count: party.count, level: party.level }),
      verb: t('summary.party_go'), icon: null, glyph: 'navProfile', place: { kind: 'recruits' } });
  }
  /* ground: the step up the Hunts list recommends, after the chores and before the buy; it points, so never the gold press */
  const g = o && o.ground;
  const lv = g && g.row && Array.isArray(g.levels) ? g.levels.filter(Number.isInteger) : [];
  if (lv.length) {
    const lo = Math.min(...lv), hi = Math.max(...lv);
    const levels = lo === hi ? t('hunts.level_one', { level: lo }) : t('hunts.levels_range', { lo, hi });
    out.push({ id: 'ground', count: 1, done: false, title: t(party ? 'summary.alone_to' : 'summary.ground_up', { ground: g.row.name }), name: g.row.name, verb: t('controls.show'), icon: null, glyph: 'uiMap',
      words: t('summary.ground_up_words', { band: t('hunts.levels_range', { lo: g.row.band[0], hi: g.row.band[1] }), levels }), place: { kind: 'hunt', hunt: g.row.hunt } });
  }
  /* buy: one line, last, never the gold press (its press only opens the window where it is bought) */
  const buy = o && o.buy;
  if (buy) out.push({ id: 'buy', count: 1, done: false, title: buy.title, words: buy.words, verb: t('controls.show'), icon: buy.icon || null, glyph: buy.glyph || null, place: buy.place });
  const first = out.find((s) => !s.done && s.id !== 'buy' && s.id !== 'ground');
  /* A GROUND OUTGROWN (`outgrown`: the hunt ended at its endsAtLevel, src/data/hunt-grounds.js) has no Hunt again (the server refuses it), so
     the card's press is the next ground, where the hero goes now, ahead of the chores (audit 2026-11-19 L2: the chores' gold row lay under the
     sticky foot, which led with a greyed Hunt again); each chore keeps its own press */
  if (party) return { steps: out, primary: 'party' };
  if (o && o.outgrown && out.some((s) => s.id === 'ground')) return { steps: out, primary: 'ground' };
  return { steps: out, primary: first ? first.id : 'again' };
}

/** This character's steps, from what the server sent. `did`: the steps pressed on this card, `sold`: the junk its sale took with no plan (the window's scratch). */
export function townStepsOf(cs, did, sold) {
  const shop = shopOf(cs), plan = upgradeOf(cs);
  /* the steps follow the hunt the server holds ended (the summary shows them on that hunt's card only) */
  const h = huntOf(cs);
  const free = !!h && h.ended && sessionModeOfHunt(h.huntId).deathLossPm === 0;
  return townSteps({ plan, bag: bagOf(cs), rules: rulesOf(cs), bids: shop ? shop.bids : null, blessings: blessingsOf(cs), purse: goldOf(cs), did, buy: nextBuyOf(cs, plan), free, ground: groundOf(cs, h),
    outgrown: !!h && h.ended && h.endReason === 'outgrown', needs: upgradeNeeds(homeOf(cs), chestsOf(cs)), sold: sold || [], party: partyToMake(cs, h) });
}

/**
 * "ALWAYS SELL THESE" (L03): the existing per-item loot plan, Sell, for each item named, ONE hr_loot_rule_set an item (CharacterSession.setLootRule;
 * the server refuses a start-kit item or one the shop won't buy, hr_loot_plan_refusal), sent together so their re-reads ride as one. `set` counts the
 * plans the server took; the first refusal's answer stands for the rest. What the card shows after is the re-read plan section, never this count.
 * @returns {Promise<{ok:boolean, error?:string, set:number}>}
 */
export async function alwaysSell(cs, items) {
  const answers = await Promise.all(items.map((id) => cs.setLootRule(id, 'sell')));
  const set = answers.filter((r) => r && r.ok).length;
  const no = answers.find((r) => !(r && r.ok));
  return Object.assign({ set }, no ? no : { ok: true });
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
