// ════════════════════════════════════════════════════════════════════════
// src/shell/next-buy.js — "BACK IN TOWN": THE ONE THING THE PURSE SHOULD BUY NEXT.
//
// Audit 2026-11-15 F12/F20: a hero banked a million gold by Level 50 and wore the Practice Shield to 87, and the
// hunt summary's Back in town card said nothing once the bag was sorted. With gold to spend it now names ONE buy the
// purse covers, never a wall of options, in this order (lane/a-next-steps; the designer's handoff, board "2026-11-15 The audit's balance
// findings" F8 and F12: a Shop piece over a practice one, then the next room rung, then the dummy; gear and Tempering ahead as power):
//   gear     a Shop piece Equip upgrades would put on (upgrade-plan.js upgradePlan, the one plan every Equip press uses,
//            over the worn set after the bag's own upgrades go on): a bare slot first, then the cheapest. Its weight rule
//            is the plan's (weightFits, designer ruling 2b of 2026-11-18): a bare slot any weight, a worn piece off the
//            weight chosen at Tamsin's only that weight at its tier or higher, so a better piece of a worn off weight is never the buy
//   find     no Shop piece fills a bare armor slot, or one worn off the chosen weight: the piece of the hero's weight the plan
//            would then put on and where it comes from (a bench, a ground's drop), its Show opening there (findPiece)
//   temper   the next Tempering rung of the worn weapon, then of the armor worn (temper-sections.js), gold and material in hand
//   room     the cheapest next House room rung the house is ready for and the purse and materials cover (home-sections.js; the
//            first rung of a bench's room also ends its tax, bench-tax.js BENCH_TAX_ROOMS)
//   dummy    the next skill on the account's training dummy (training-sections.js), a house to put it in owned
// Its words are labels (Tyler 2026-11-14: "Recommended: 4+ players"), never sentences: "Next buy: Bronze-Rimmed Shield (140 gp)", "+1 Defense vs Practice Shield".
// PURE (nextBuy) over the server's sections; nextBuyOf reads them from a CharacterSession. Every price, rung, gate and count
// is the server's (CLAUDE.md §6): nothing here is a gate the server trusts, and the press only opens the window where the
// buy is made (goto.js targetOf), where the server prices it again.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.143';
import { ROOM_PERKS } from '../data/perks.js?v=0.2.143';
import { EQUIP_SLOT_META } from '../data/gathering.js?v=0.2.143';
import { ARMOUR_WEIGHT, ARMOUR_SLOTS } from '../data/core-model.js?v=0.2.143';
import { upgradePlan, preferredWeight, meets, offWeight, weightFits } from './upgrade-plan.js?v=0.2.143';
import { wherePlaces } from './item-lore.js?v=0.2.143';
import { itemName } from './widgets/bits.js?v=0.2.143';
import { gold } from '../render/format.js?v=0.2.143';
import { t } from '../render/player-text.js?v=0.2.143';
import { shopOf, bagOf, bankOf, goldOf, equipmentOf, skillsOf } from '../session/item-sections.js?v=0.2.143';
import { levelOf } from '../session/character-sections.js?v=0.2.143';
import { tallyOf } from '../session/tally-sections.js?v=0.2.143';
import { settingsOf } from '../session/hunt-sections.js?v=0.2.143';
import { temperRowsOf } from '../session/temper-sections.js?v=0.2.143';
import { trainingOf } from '../session/training-sections.js?v=0.2.143';
import { homeOf } from '../session/home-sections.js?v=0.2.143';

const pct = (pm) => String(pm / 10) + '%';
/* A room whose rungs do something (the House window offers no purchase for one that does nothing yet). */
const roomDoes = (room) => (ROOM_PERKS[room] || []).some((m) => Object.values(m || {}).some((v) => v > 0));
/* Every material a step asks for, in the bag then the account's Storage (the House window's own order, house.js costLines). */
const holds = (items, bag, bank) => {
  const have = (id) => ((bag || []).find((r) => r.id === id) || { qty: 0 }).qty + ((bank || []).find((r) => r.id === id) || { qty: 0 }).qty;
  return (items || []).every((it) => have(it.id) >= it.qty);
};

/* An armor piece's weight ('heavy' | 'medium' | 'light'), or null for a piece with none (jewelry, a weapon, a shield, a cape). */
const weightOf = (it) => (it && ARMOUR_WEIGHT[it.armourClass]) || null;

/* A Shop piece Equip upgrades would put on: the plan over the shop's affordable gear as if it were in the bag. The full-game audit's A11 (Next
   buy sold Leather Gloves, medium, to a heavy hero at Level 9 and they stayed on to 85) is the plan's weight rule now: the pair still fills a
   bare slot, and a heavy piece of their tier or higher moves them off (designer ruling 2b of 2026-11-18). */
function gearBuy(o) {
  const offers = (o.shop && o.shop.offers ? o.shop.offers : []).filter((x) => x.kind === 'gear' && x.price <= o.purse && ITEMS[x.item] && ITEMS[x.item].slot);
  if (!offers.length) return null;
  const price = new Map(offers.map((x) => [x.item, x.price]));
  const plan = upgradePlan({ bag: offers.map((x) => ({ id: x.item, qty: 1 })), equipment: o.equipment, skills: o.skills, level: o.level, prefer: o.prefer, chosen: o.chosen });
  const picks = plan.picks.filter((p) => price.has(p.id));
  if (!picks.length) return null;
  /* a bare slot first, then the cheapest, then by id (one answer for one envelope) */
  picks.sort((a, b) => (Number(!!a.replaces) - Number(!!b.replaces)) || (price.get(a.id) - price.get(b.id)) || (a.id < b.id ? -1 : 1));
  const p = picks[0];
  /* a move to the chosen weight names what it gives up too, as the Equip upgrades line does (upgrade-plan.js `costs`) */
  const gains = p.gains.slice(0, 2).concat((p.costs || []).slice(0, 1)).map((g) => g.text).join(", ");
  return { kind: 'gear', title: t('summary.buy_gear', { item: itemName(p.id), price: gold(price.get(p.id)) }),
    words: gains ? (p.replaces ? t('summary.buy_gear_better', { gains, worn: itemName(p.replaces) })
      : t('summary.buy_gear_empty', { gains, slot: ((EQUIP_SLOT_META[p.slot] || {}).label || p.slot).toLowerCase() })) : '',
    icon: p.id, place: { kind: 'shop', item: p.id } };
}

/* Every armor row for a slot, by weight, built once from the catalogue (a new piece's row joins with no code). */
let BY_SLOT = null;
function piecesFor(slot, weight) {
  if (!BY_SLOT) {
    BY_SLOT = new Map();
    for (const [id, it] of Object.entries(ITEMS)) {
      const w = weightOf(it);
      if (!w || it.type !== 'armor' || !ARMOUR_SLOTS.includes(it.slot)) continue;
      const k = it.slot + ':' + w;
      if (!BY_SLOT.has(k)) BY_SLOT.set(k, []);
      BY_SLOT.get(k).push(id);
    }
  }
  return BY_SLOT.get(slot + ':' + weight) || [];
}

/* WHERE THE HERO'S WEIGHT COMES FROM (the full-game audit's A11): an armor slot bare, or worn off the weight chosen at Tamsin's, that no Shop piece
   fills. Names the best piece of the hero's weight for the slot the hero can wear now that the game hands out somewhere (item-lore.js wherePlaces:
   a bench, the Shop, a ground's drop), else the first one it grows into, and where it comes from, linked there. For a worn slot only a piece the
   plan would move it to (weightFits: the same tier or higher), so the line never names one Equip upgrades leaves in the bag. From the catalogue
   rows, so the drop homes move the answer with no code here. Bare slots first, in the doll's order. */
function findPiece(o) {
  const w = o.prefer, eq = o.equipment || {};
  if (!w) return null;
  const level = Number.isInteger(o.level) ? o.level : null;
  const open = ARMOUR_SLOTS.filter((s) => !eq[s]).concat(ARMOUR_SLOTS.filter((s) => eq[s] && offWeight(ITEMS[eq[s]], o.chosen)));
  for (const slot of open) {
    const worn = eq[slot] ? ITEMS[eq[slot]] : null;
    const found = piecesFor(slot, w).filter((id) => weightFits(worn, ITEMS[id], o.chosen))
      .map((id) => ({ id, it: ITEMS[id], where: wherePlaces(id)[0] || null })).filter((x) => x.where && x.where.place);
    const now = found.filter((x) => meets(x.it, o.skills, level)).sort((a, b) => (b.it.tier || 0) - (a.it.tier || 0) || (b.it.reqLv || 0) - (a.it.reqLv || 0) || (a.id < b.id ? -1 : 1));
    const later = found.filter((x) => !meets(x.it, o.skills, level)).sort((a, b) => (a.it.reqLv || 0) - (b.it.reqLv || 0) || (a.id < b.id ? -1 : 1));
    const p = now[0] || later[0];
    if (!p) continue;
    const kind = t('summary.find_kind', { weight: t('summary.weight_' + w), slot: ((EQUIP_SLOT_META[slot] || {}).label || slot).toLowerCase() });
    return { kind: 'find', title: t(now[0] ? 'summary.find_gear' : 'summary.find_gear_at', { item: itemName(p.id), what: kind, level: p.it.reqLv || 1 }),
      words: p.where.words, icon: p.id, place: p.where.place };
  }
  return null;
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
 * @param {{ purse: number|null, equipment: object, skills: object|null, level: number|null, prefer?: string|null, chosen?: string|null, shop: {offers:{item:string,kind:string,price:number}[]}|null,
 *           temper: object|null, dummy: object|null, home: object|null, bag: {id:string,qty:number}[]|null, bank: {id:string,qty:number}[]|null }} o
 *        `equipment`: the worn set with the bag's own Equip upgrades already on (so a piece the bag holds is never bought);
 *        `chosen`: the weight picked at Tamsin's and `prefer`: preferredWeight's, as upgradePlan reads them
 * @returns {{ kind: string, title: string, words: string, icon: string|null, glyph?: string, place: object }|null}  `icon` an item's, else `glyph` (data/glyphs.js)
 */
export function nextBuy(o) {
  if (!o || !Number.isSafeInteger(o.purse) || o.purse <= 0) return null;
  return gearBuy(o) || findPiece(o) || temperBuy(o) || roomBuy(o) || dummyBuy(o);
}

/** This character's next buy, from what the server sent. `plan`: the bag's own Equip upgrades (upgrade-line.js upgradeOf), put on first. */
export function nextBuyOf(cs, plan) {
  const eq = equipmentOf(cs) || {};
  const lv = levelOf(cs), tally = tallyOf(cs), s = settingsOf(cs), tr = trainingOf(cs);
  return nextBuy({ purse: goldOf(cs), equipment: Object.assign({}, eq, plan && plan.ops ? plan.ops : {}), skills: skillsOf(cs), level: lv ? lv.level : null,
    chosen: tally ? tally.weight : null, prefer: preferredWeight(tally ? tally.weight : null, eq, s ? s.role : null), shop: shopOf(cs), temper: temperRowsOf(cs), dummy: tr ? tr.dummy : null,
    home: homeOf(cs), bag: bagOf(cs), bank: bankOf(cs) });
}
