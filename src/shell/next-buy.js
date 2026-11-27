// ════════════════════════════════════════════════════════════════════════
// src/shell/next-buy.js — "BACK IN TOWN": THE ONE THING THE PURSE SHOULD BUY NEXT.
//
// Audit 2026-11-15 F12/F20: a hero banked a million gold by Level 50 and wore the Practice Shield to 87, and the
// hunt summary's Back in town card said nothing once the bag was sorted. It names ONE buy, never a wall of options
// (lane/a-next-steps; the designer's handoff, board "2026-11-15 The audit's balance findings" F8 and F12: gear ahead as power):
//   gear     a Shop piece Equip upgrades would put on (upgrade-plan.js upgradePlan, the one plan every Equip press uses,
//            over the worn set after the bag's own upgrades go on): a bare slot first, then the cheapest. Its weight rule
//            is the plan's (weightFits, designer ruling 2b of 2026-11-18): a bare slot any weight, a worn piece off the
//            weight chosen at Tamsin's only that weight at its tier or higher, so a better piece of a worn off weight is never the buy
//   find     no Shop piece fills a bare armor slot, or one worn off the chosen weight: the piece of the hero's weight the plan
//            would then put on and where it comes from (a bench, a ground's drop), its Show opening there (findPiece)
// ...then THE WHOLE SHELF (balance program L03, 2026-11-20; retention dive: at Level 9 with 14,206 gold "between 220 and 300,000 the
// screen names nothing"): each shelf's next rung, the CHEAPEST the purse covers, else the nearest with how much more it needs:
//   room     the cheapest next House room rung the house is ready for, materials in hand (home-sections.js; the first rung of a
//            bench's room also ends its tax, bench-tax.js BENCH_TAX_ROOMS)
//   deed     the House's next property rung, and the rooms it opens       chest  the account Storage's next chest
//   bag      the bag's next rung (bought in Storage)                       dummy  the account's training dummy's next skill, a house owned
//   tool     a better Shop tool for a skill the hero trains (no hero slot: all four are the account's from the start, 1036)
//   refill   a bought hunting block (2 h of stamina), only after a hunt that ran out of stamina
// Its words are labels (Tyler 2026-11-14: "Recommended: 4+ players"), never sentences: "Next buy: Bronze-Rimmed Shield (140 gp)", "+1 Defense vs Practice Shield".
// PURE (nextBuy) over the server's sections; nextBuyOf reads them from a CharacterSession. Every price, rung, gate and count
// is the server's (CLAUDE.md §6): nothing here is a gate the server trusts, and the press only opens the window where the
// buy is made (goto.js targetOf), where the server prices it again.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js';
import { ROOM_PERKS } from '../data/perks.js';
import { EQUIP_SLOT_META } from '../data/gathering.js';
import { ARMOUR_WEIGHT, ARMOUR_SLOTS } from '../data/core-model.js';
import { upgradePlan, preferredWeight, meets, offWeight, weightFits } from './upgrade-plan.js';
import { bestTool } from '../core/tools.js';
import { wherePlaces, toolEffect } from './item-lore.js';
import { itemName } from './widgets/bits.js';
import { gold, hoursWords, listWords } from '../render/format.js';
import { t } from '../render/player-text.js';
import { shopOf, bagOf, bankOf, goldOf, equipmentOf, skillsOf, bagExpandOf, huntBlockOf } from '../session/item-sections.js';
import { levelOf } from '../session/character-sections.js';
import { tallyOf } from '../session/tally-sections.js';
import { settingsOf, huntOf } from '../session/hunt-sections.js';
import { trainingOf } from '../session/training-sections.js';
import { homeOf, chestsOf } from '../session/home-sections.js';
import { wornPiecesOf } from '../session/piece-sections.js';

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
  const plan = upgradePlan({ bag: offers.map((x) => ({ id: x.item, qty: 1 })), equipment: o.equipment, skills: o.skills, level: o.level, pieces: o.pieces || null,
    prefer: o.prefer, chosen: o.chosen });
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

/* ── THE SHELF (balance program L03, docs/design/balance-program/30-plan.md; economy dive change 2: "Next buy walks the whole shelf") ──
   Every gold buy the account can make, one reader a shelf, each answering its own next rungs in its own order as candidates
   { kind, gold, title, words, icon, glyph, place }. A rung that needs a material, a property tier or a free dummy the hero has not got is
   never a candidate, so gold alone stands between the purse and every one. A new sink is one reader in SHELF. */

/* The House's next room rungs the house is ready for, materials in hand (the bag, then Storage), cheapest first. */
function roomRows(o) {
  const h = o.home;
  if (!h) return [];
  return h.rooms.filter((r) => r.next && r.opens <= h.tier && r.next.need <= h.tier && roomDoes(r.room) && holds(r.next.items, o.bag, o.bank))
    .sort((a, b) => (a.next.gold - b.next.gold) || (a.room < b.room ? -1 : 1))
    .map((r) => ({ kind: 'room', gold: r.next.gold, title: t('summary.buy_room', { room: r.name, price: gold(r.next.gold) }),
      words: r.next.name ? t('summary.buy_room_words', { rung: r.next.name }) : '', icon: null, glyph: 'navHouse', place: { kind: 'house' } }));
}

/* The House's next property rung (the deed), materials in hand; its words name the rooms it opens, the server's rows. */
function deedRows(o) {
  const h = o.home;
  const d = h ? h.tiers.find((x) => !x.owned) : null;
  if (!d || d.need > h.tier || !holds(d.items, o.bag, o.bank)) return [];
  const opens = h.rooms.filter((r) => r.opens === d.tier).map((r) => r.name);
  return [{ kind: 'deed', gold: d.gold, title: t('summary.buy_named', { name: d.name, price: gold(d.gold) }),
    words: opens.length ? t('summary.buy_deed_words', { rooms: listWords(opens) }) : '', icon: null, glyph: 'uiHome', place: { kind: 'house' } }];
}

/* The account Storage's next chest, its property tier reached (the server's can_build) and its materials in hand. */
function chestRows(o) {
  const c = o.chests && o.chests.next;
  if (!c || !c.canBuild || !holds(c.items, o.bag, o.bank)) return [];
  return [{ kind: 'chest', gold: c.gold, title: t('summary.buy_named', { name: c.name, price: gold(c.gold) }),
    words: t('summary.buy_chest_words', { count: c.stacks }), icon: null, glyph: 'uiChest', place: { kind: 'house' } }];
}

/* The bag's next rung (hr_bag_expand_view), bought in Storage. */
function bagRows(o) {
  const n = o.bagGrow && o.bagGrow.next;
  return n ? [{ kind: 'bag', gold: n.gold, title: t('summary.buy_bag', { price: gold(n.gold) }), words: t('summary.buy_bag_words', { count: n.adds }),
    icon: null, glyph: 'navInventory', place: { kind: 'storage' } }] : [];
}

/* The training dummy's next skill: a house owned, a skill left, nobody's training on it. */
function dummyRows(o) {
  const d = o.dummy;
  if (!d || !d.hasHome || !Number.isSafeInteger(d.nextPrice) || d.busy) return [];
  return [{ kind: 'dummy', gold: d.nextPrice, title: t('summary.buy_dummy', { price: gold(d.nextPrice) }), words: t('summary.buy_dummy_words'), icon: null, glyph: 'navHouse', place: { kind: 'house' } }];
}

/* A Shop tool a better tier than the best the bag holds for its skill (core/tools.js bestTool, the engine's own read), for a skill this hero
   has trained (a hunter is never sent to the rocks by a pickaxe), cheapest first. */
function toolRows(o) {
  const offers = o.shop && o.shop.offers ? o.shop.offers : [];
  const held = Object.fromEntries((o.bag || []).map((r) => [r.id, r.qty]));
  return offers.filter((x) => {
    const it = x.kind === 'tool' ? ITEMS[x.item] : null;
    const sk = it && it.toolSkill && o.skills ? o.skills[it.toolSkill] : null;
    if (!sk || !(sk.xp > 0)) return false;
    const best = bestTool(it.toolSkill, held, o.equipment, ITEMS);
    return (it.toolTier || 0) > ((best && best.toolTier) || 0);
  }).sort((a, b) => (a.price - b.price) || (a.item < b.item ? -1 : 1))
    .map((x) => ({ kind: 'tool', gold: x.price, title: t('summary.buy_gear', { item: itemName(x.item), price: gold(x.price) }), words: toolEffect(x.item),
      icon: x.item, place: { kind: 'shop', item: x.item } }));
}

/* A bought hunting block, only after a hunt that ran out of stamina (the caller passes the server's quote then, item-sections.js huntBlockOf). */
function refillRows(o) {
  const q = o.refill;
  return q && q.available && Number.isSafeInteger(q.price) ? [{ kind: 'refill', gold: q.price, title: t('summary.buy_refill', { price: gold(q.price) }),
    words: t('summary.buy_refill_words', { time: hoursWords(q.blockMs) }), icon: null, glyph: 'uiHourglass', place: { kind: 'services' } }] : [];
}

/* Every shelf, in the order a tie of one price goes. */
const SHELF = Object.freeze([roomRows, deedRows, chestRows, bagRows, dummyRows, toolRows, refillRows]);

/**
 * The one buy to name, or null (no purse read yet, or nothing on the shelf at all):
 *   1. a Shop piece Equip upgrades would put on, else where the hero's weight comes from (gearBuy, findPiece: power first, the designer's order)
 *   2. else each shelf's next rung the purse covers (else its first), and of those the CHEAPEST the purse covers
 *   3. none covered: the nearest, the cheapest of them all, its words saying how much more it needs (the server's price less the server's purse)
 * @param {{ purse: number|null, equipment: object, skills: object|null, level: number|null, prefer?: string|null, chosen?: string|null, shop: {offers:{item:string,kind:string,price:number}[]}|null,
 *           dummy: object|null, home: object|null, bag: {id:string,qty:number}[]|null, bank: {id:string,qty:number}[]|null,
 *           chests?: object|null, bagGrow?: object|null, refill?: object|null, pieces?: object|null }} o
 *        `equipment`: the worn set with the bag's own Equip upgrades already on (so a piece the bag holds is never bought);
 *        `chosen`: the weight picked at Tamsin's and `prefer`: preferredWeight's, as upgradePlan reads them; `chests`: home-sections.js chestsOf;
 *        `bagGrow`: item-sections.js bagExpandOf; `refill`: huntBlockOf, given only after a hunt out of stamina; `pieces`: the Trait pieces
 *        worn (piece-sections.js wornPiecesOf), so the Shop never names a plain piece over a Rare the steps keep
 * @returns {{ kind: string, title: string, words: string, icon: string|null, glyph?: string, place: object, short?: number }|null}  `icon` an item's, else `glyph` (data/glyphs.js);
 *        `short`: the gold still needed, on a buy the purse does not cover yet
 */
export function nextBuy(o) {
  if (!o || !Number.isSafeInteger(o.purse) || o.purse <= 0) return null;
  const power = gearBuy(o) || findPiece(o);
  if (power) return power;
  const fronts = [];
  SHELF.forEach((read, rank) => {
    const c = read(o);
    const front = c.find((x) => x.gold <= o.purse) || c[0];
    if (front) fronts.push({ rank, row: front });
  });
  fronts.sort((a, b) => (a.row.gold - b.row.gold) || (a.rank - b.rank));
  const buy = fronts.find((f) => f.row.gold <= o.purse);
  if (buy) return buy.row;
  if (!fronts.length) return null;
  const near = fronts[0].row, short = near.gold - o.purse;
  return Object.assign({}, near, { short, words: [near.words, t('summary.buy_need', { short: gold(short) })].filter(Boolean).join(' · ') });
}

/** This character's next buy, from what the server sent. `plan`: the bag's own Equip upgrades (upgrade-line.js upgradeOf), put on first. */
export function nextBuyOf(cs, plan) {
  const eq = equipmentOf(cs) || {};
  const lv = levelOf(cs), tally = tallyOf(cs), s = settingsOf(cs), tr = trainingOf(cs), h = huntOf(cs);
  return nextBuy({ purse: goldOf(cs), equipment: Object.assign({}, eq, plan && plan.ops ? plan.ops : {}), skills: skillsOf(cs), level: lv ? lv.level : null,
    chosen: tally ? tally.weight : null, prefer: preferredWeight(tally ? tally.weight : null, eq, s ? s.role : null), shop: shopOf(cs), dummy: tr ? tr.dummy : null,
    home: homeOf(cs), bag: bagOf(cs), bank: bankOf(cs), chests: chestsOf(cs), bagGrow: bagExpandOf(cs), pieces: wornPiecesOf(cs),
    refill: h && h.ended && h.endReason === 'stamina' ? huntBlockOf(cs) : null });
}
