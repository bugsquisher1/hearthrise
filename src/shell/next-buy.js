// ════════════════════════════════════════════════════════════════════════
// src/shell/next-buy.js — "BACK IN TOWN": THE ONE THING THE PURSE SHOULD BUY NEXT.
//
// Audit 2026-11-15 F12/F20: a hero banked a million gold by Level 50 and wore the Practice Shield to 87, and the
// hunt summary's Back in town card said nothing once the bag was sorted. With gold to spend it now names ONE buy the
// purse covers, never a wall of options, in this order (lane/a-next-steps; the designer's handoff, board "2026-11-15 The audit's balance
// findings" F8 and F12: a Shop piece over a practice one, then the next room rung, then the dummy; gear and Tempering ahead as power):
//   gear     a Shop piece better than what is worn (upgrade-plan.js: the same "strictly better" every Equip press uses,
//            over the worn set after the bag's own upgrades go on): a bare slot first, then the cheapest
//   temper   the next Tempering rung of the worn weapon, then of the armor worn (temper-sections.js), gold and material in hand
//   room     the cheapest next House room rung the house is ready for and the purse and materials cover (home-sections.js; the
//            first rung of a bench's room also ends its tax, bench-tax.js BENCH_TAX_ROOMS)
//   dummy    the next skill on the account's training dummy (training-sections.js), a house to put it in owned
// Its words are labels (Tyler 2026-11-14: "Recommended: 4+ players"), never sentences: "Next buy: Bronze-Rimmed Shield (140 gp)", "+1 Defense vs Practice Shield".
// PURE (nextBuy) over the server's sections; nextBuyOf reads them from a CharacterSession. Every price, rung, gate and count
// is the server's (CLAUDE.md §6): nothing here is a gate the server trusts, and the press only opens the window where the
// buy is made (goto.js targetOf), where the server prices it again.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.136';
import { ROOM_PERKS } from '../data/perks.js?v=0.2.136';
import { EQUIP_SLOT_META } from '../data/gathering.js?v=0.2.136';
import { upgradePlan, preferredWeight } from './upgrade-plan.js?v=0.2.136';
import { itemName } from './widgets/bits.js?v=0.2.136';
import { gold } from '../render/format.js?v=0.2.136';
import { t } from '../render/player-text.js?v=0.2.136';
import { shopOf, bagOf, bankOf, goldOf, equipmentOf, skillsOf } from '../session/item-sections.js?v=0.2.136';
import { levelOf } from '../session/character-sections.js?v=0.2.136';
import { tallyOf } from '../session/tally-sections.js?v=0.2.136';
import { settingsOf } from '../session/hunt-sections.js?v=0.2.136';
import { temperRowsOf } from '../session/temper-sections.js?v=0.2.136';
import { trainingOf } from '../session/training-sections.js?v=0.2.136';
import { homeOf } from '../session/home-sections.js?v=0.2.136';

const pct = (pm) => String(pm / 10) + '%';
/* A room whose rungs do something (the House window offers no purchase for one that does nothing yet). */
const roomDoes = (room) => (ROOM_PERKS[room] || []).some((m) => Object.values(m || {}).some((v) => v > 0));
/* Every material a step asks for, in the bag then the account's Storage (the House window's own order, house.js costLines). */
const holds = (items, bag, bank) => {
  const have = (id) => ((bag || []).find((r) => r.id === id) || { qty: 0 }).qty + ((bank || []).find((r) => r.id === id) || { qty: 0 }).qty;
  return (items || []).every((it) => have(it.id) >= it.qty);
};

/* A Shop piece better than the worn set: the plan over the shop's affordable gear as if it were in the bag. */
function gearBuy(o) {
  const offers = (o.shop && o.shop.offers ? o.shop.offers : []).filter((x) => x.kind === 'gear' && x.price <= o.purse && ITEMS[x.item] && ITEMS[x.item].slot);
  if (!offers.length) return null;
  const price = new Map(offers.map((x) => [x.item, x.price]));
  const plan = upgradePlan({ bag: offers.map((x) => ({ id: x.item, qty: 1 })), equipment: o.equipment, skills: o.skills, level: o.level, prefer: o.prefer });
  const picks = plan.picks.filter((p) => price.has(p.id));
  if (!picks.length) return null;
  /* a bare slot first, then the cheapest, then by id (one answer for one envelope) */
  picks.sort((a, b) => (Number(!!a.replaces) - Number(!!b.replaces)) || (price.get(a.id) - price.get(b.id)) || (a.id < b.id ? -1 : 1));
  const p = picks[0];
  const gains = p.gains.slice(0, 2).map((g) => g.text).join(", ");
  return { kind: 'gear', title: t('summary.buy_gear', { item: itemName(p.id), price: gold(price.get(p.id)) }),
    words: gains ? (p.replaces ? t('summary.buy_gear_better', { gains, worn: itemName(p.replaces) })
      : t('summary.buy_gear_empty', { gains, slot: ((EQUIP_SLOT_META[p.slot] || {}).label || p.slot).toLowerCase() })) : '',
    icon: p.id, place: { kind: 'shop', item: p.id } };
}

/* The next Tempering rung the hero can take now: the weapon's, then the armor's. */
function temperBuy(o) {
  const rows = o.temper;
  if (!rows) return null;
  for (const [track, row] of [['blows', rows.blows], ['armor', rows.armor]]) {
    const l = row && row.ladder;
    if (!l || !l.offer || !(l.gold <= o.purse) || row.needs.some((n) => n.short > 0) || !Number.isFinite(row.nextPm)) continue;
    return { kind: 'temper', title: t('summary.buy_temper', { piece: row.piece, price: gold(l.gold) }),
      words: t(track === 'blows' ? 'summary.buy_temper_blows' : 'summary.buy_temper_armor', { pct: pct(row.nextPm) }),
      icon: track === 'blows' && o.equipment && o.equipment.weapon ? o.equipment.weapon : null, glyph: 'navStore', place: { kind: 'temper' } };
  }
  return null;
}

/* The training dummy's next skill: a house owned, a skill left, its price in the purse, nobody's training on it. */
function dummyBuy(o) {
  const d = o.dummy;
  if (!d || !d.hasHome || !Number.isSafeInteger(d.nextPrice) || d.nextPrice > o.purse || d.busy) return null;
  return { kind: 'dummy', title: t('summary.buy_dummy', { price: gold(d.nextPrice) }), words: t('summary.buy_dummy_words'), icon: null, glyph: 'navHouse', place: { kind: 'house' } };
}

/* The cheapest next room rung the house is ready for, whose gold and materials are in hand. */
function roomBuy(o) {
  const h = o.home;
  if (!h) return null;
  const ready = h.rooms.filter((r) => r.next && r.opens <= h.tier && r.next.need <= h.tier && roomDoes(r.room) && r.next.gold <= o.purse && holds(r.next.items, o.bag, o.bank));
  if (!ready.length) return null;
  const r = ready.sort((a, b) => (a.next.gold - b.next.gold) || (a.room < b.room ? -1 : 1))[0];
  return { kind: 'room', title: t('summary.buy_room', { room: r.name, price: gold(r.next.gold) }), words: r.next.name ? t('summary.buy_room_words', { rung: r.next.name }) : '',
    icon: null, glyph: 'navHouse', place: { kind: 'house' } };
}

/**
 * The one buy to name, or null (no purse read yet, or nothing the purse covers).
 * @param {{ purse: number|null, equipment: object, skills: object|null, level: number|null, prefer?: string|null, shop: {offers:{item:string,kind:string,price:number}[]}|null,
 *           temper: object|null, dummy: object|null, home: object|null, bag: {id:string,qty:number}[]|null, bank: {id:string,qty:number}[]|null }} o
 *        `equipment`: the worn set with the bag's own Equip upgrades already on (so a piece the bag holds is never bought)
 * @returns {{ kind: string, title: string, words: string, icon: string|null, glyph?: string, place: object }|null}  `icon` an item's, else `glyph` (data/glyphs.js)
 */
export function nextBuy(o) {
  if (!o || !Number.isSafeInteger(o.purse) || o.purse <= 0) return null;
  return gearBuy(o) || temperBuy(o) || roomBuy(o) || dummyBuy(o);
}

/** This character's next buy, from what the server sent. `plan`: the bag's own Equip upgrades (upgrade-line.js upgradeOf), put on first. */
export function nextBuyOf(cs, plan) {
  const eq = equipmentOf(cs) || {};
  const lv = levelOf(cs), tally = tallyOf(cs), s = settingsOf(cs), tr = trainingOf(cs);
  return nextBuy({ purse: goldOf(cs), equipment: Object.assign({}, eq, plan && plan.ops ? plan.ops : {}), skills: skillsOf(cs), level: lv ? lv.level : null,
    prefer: preferredWeight(tally ? tally.weight : null, eq, s ? s.role : null), shop: shopOf(cs), temper: temperRowsOf(cs), dummy: tr ? tr.dummy : null,
    home: homeOf(cs), bag: bagOf(cs), bank: bankOf(cs) });
}
