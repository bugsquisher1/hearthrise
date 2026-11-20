// ════════════════════════════════════════════════════════════════════════
// src/shell/upgrade-plan.js — "EQUIP UPGRADES": WHAT ONE PRESS WOULD PUT ON.
//
// PURE (no DOM). A new hero buys gloves and a belt and may never wear them
// (gold-sinks designer + the 10-22 playtest: four menus per piece). This picks,
// from the server's bag, every piece that is STRICTLY BETTER for the hero's
// current way of fighting, and the Inventory and the Shop send the picks as
// ONE `equip` intent (the engine applies a multi-slot delta atomically; the
// server re-checks slot, requirement and ownership under the lock).
//
// WHAT "BETTER" MEANS (the same pure core every fight is priced by):
//   the style        src/core/member.js loadoutOf: the worn weapon's family picks
//                    which accuracy and damage fields count (Melee atkB/strB,
//                    Ranged rangeAtkB/rangeStrB, Magic magicAtkB/magicStrB)
//   the numbers      those two sums, worn defence and critical chance (with the
//                    armour-set bonus, combat.js), max health and max mana
//                    (src/core/vitals.js: armour weight against the Level)
//   strictly better  no number lower and at least one higher, over the WHOLE worn
//                    set (so breaking a set bonus or a -1 accuracy penalty counts)
//   jewelry perks    a crafted piece's perks (src/data/jewelry.js) are numbers too, as the
//                    worn set plays them (combat.js jewelPerksOf: each perk once, the largest
//                    worn): a Follow-through ring beats a plain one, a second Keen ring beside
//                    a Keen ring adds nothing, and Keen against Surge is the player's pick
//                    (played 2026-11-09: a plain Banded Signet stayed on over a perked one)
//   a bane           a weapon's damage against one monster kind (src/core/bane.js, the engine's clamped
//                    multiplier) is a number too: gaining one is a plus, losing one blocks the pick, so a
//                    better blade of the family goes on and a worn bane is never traded away unseen
//                    (designer re-read 2026-11-11: Level 16 with the Practice Sword and 6 Bramble Blades);
//                    a plain weapon that beats the worn bane on every number is a CHOICE the line says,
//                    never a swap (designer small call 2, 2026-11-11: tradeOf below).
//                    A BANE COUNTS ONLY WHERE IT WINS (audit 2026-11-15 F15: a Level 55 hero kept the Level 15 Bramble
//                    Blade over 40 Mithril Swords, told "each piece is better at something", and died twice at the
//                    Barrows, where nothing is a plant): two sets whose banes differ are compared by the blow each
//                    lands (the engine's own accuracy x largest hit, combat.js playerCombatRolls, on the server's
//                    skills) on every monster of that kind living on an open ground whose Level band holds the hero's
//                    Level. No such monster, or the plain piece lands more on each: the bane is not a reason, and the
//                    bigger numbers go on
//   a resistance     a worn set's resistance (`resistPm` on its pieces, as the engine resolves and caps it: combat.js equipmentStats,
//                    elements.js resistProfile; an element, and `physical` once lane/c-krell-uniques' Banded Legguards land) is
//                    a number too, WEIGHED THE SAME LEVEL-BAND WAY AS A BANE (lane/a-next-steps): it counts only where a monster
//                    on an open ground whose band holds the hero's Level deals that damage (its swing is physical, each of its
//                    spells its own element: monster-spells.js castsOf, what the engine plays). Gaining one there is a plus;
//                    losing one there is the player's call, said (tradeOf: "Iron Platelegs adds +4 Defense, and Bronze
//                    Platelegs cuts fire damage by 10%"); a resistance against what nothing in range deals is no reason
//   a tier step      a higher material tier of the weight worn is judged with the
//                    set bonus left out of both sides, and the line says which set
//                    bonus it ends (designer ruling 2026-10-31, played: Marlow, Level
//                    16 in a full Bronze plate set, wore none of ten Iron Platebodies,
//                    because each one alone broke the set's +1% critical chance). The
//                    set rewards finishing a tier; it never holds a hero below one.
//   the weapon       only for a better one of the SAME FAMILY in the same grip, which sets the
//                    same style and role (designer ruling 2026-11-03; blind panel: a sword
//                    hero wore the Practice Sword for 19 hunted hours over eight Iron Swords)
// WHAT IT NEVER DOES (the decisions, 2026-10-22):
//   · never changes the style: never another weapon family, never a weapon into empty
//     hands, never a piece into an empty off-hand, never the ammo: the hands set the style
//     and the role (ruling 2026-10-16) and the player picks every supply (ruling 2026-10-21).
//     A WORN off-hand takes a better one of its own kind (a shield for a shield, a spellbook
//     for a spellbook of its discipline; audit 2026-11-15 F8: a Level 31 tank still held the
//     Practice Shield over better shields), the same rule as the weapon's family: the role never moves
//   · never moves a worn armor piece to another weight but the one chosen at Tamsin's, nor takes
//     off one carrying an effect the numbers do not price (an away effect); it fills EMPTY slots
//     first, then upgrades worn ones. THE WEIGHT RULE (weightFits; designer ruling 2b of 2026-11-18,
//     the full-game audit's A11, undoing the 139 audit's B6): a bare armor slot takes the best piece
//     that beats bare in ANY weight; a worn piece OFF the chosen weight takes only a piece of that
//     weight of the same tier or higher (the weight was chosen once and isn't asked again), even
//     where it beats the worn one on no number; any other worn piece only a better one of its own
//   · never picks a piece the server's skills say the hero cannot wear yet
//     (unknown skills read as "cannot", the safe side)
//   · never breaks a tie on a worn slot for the player: when two pieces for one slot trade off
//     (each better at something), the slot is left and named in `choices`. A tie between
//     weights goes to the weight preferredWeight names (designer 2026-11-04); with none of it,
//     a bare armor slot takes the piece that guards most, so it never waits (played 2026-11-04)
// Display and intent NAMES only: nothing here is a gate the server trusts.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.142';
import { EQUIP_SLOT_META, expandItemSlot } from '../data/gathering.js?v=0.2.142';
import { ARMOUR_WEIGHT, ARMOUR_SLOTS } from '../data/core-model.js?v=0.2.142';
import { JEWEL_PERKS } from '../data/jewelry.js?v=0.2.142';
import { loadoutOf } from '../core/member.js?v=0.2.142';
import { jewelPerksOf, playerCombatRolls } from '../core/combat.js?v=0.2.142';
import { baneIndex, baneMultFor, classOfMonster, MONSTER_CLASSES } from '../core/bane.js?v=0.2.142';
import { MONSTERS } from '../data/monsters.js?v=0.2.142';
import { OPEN_HUNTS } from '../data/hunts.js?v=0.2.142';
import { castsOf, spellRow, mends, SPELL_SWITCH } from '../data/monster-spells.js?v=0.2.142';
import { ELEMENTS, PHYSICAL } from '../data/elements.js?v=0.2.142';
import { armourWeights, maxHpFor, maxManaFor } from '../core/vitals.js?v=0.2.142';
import { roleWeaponOf, wornRoleKey } from '../data/hunt-roles.js?v=0.2.142';
import { itemName } from './widgets/bits.js?v=0.2.142';
import { t } from '../render/player-text.js?v=0.2.142';
import { reqHave } from './item-lore.js?v=0.2.142';
import { baneKindName } from './bag-model.js?v=0.2.142';
import { wornWeightOf } from './hunt-ground-facts.js?v=0.2.142';
import { WEIGHT_FOR_ROLE } from '../data/hunt-tutorial.js?v=0.2.142';

/* The off-hand and the quiver: the player's own choice, never this one. */
const STYLE_SLOTS = new Set(['shield', 'ammo']);
/* Every other equip slot, in the catalogue's order (a new slot row joins with no code). */
const UPGRADE_SLOTS = Object.freeze(Object.keys(EQUIP_SLOT_META).filter((s) => !STYLE_SLOTS.has(s)));
/* The one style slot a press may touch, and only like for like (sameOffhand below). */
const OFFHAND = 'shield';
const EPS = 1e-9;
/* The armor weights a player picks (Tamsin's tally: tally-sections.js), the same words ARMOUR_WEIGHT maps to. */
const PREFER = new Set(['heavy', 'medium', 'light']);
const num = (v) => (Number.isFinite(v) ? v : 0);
const weightOf = (it) => (it && ARMOUR_WEIGHT[it.armourClass]) || 'none';
/* A piece whose worth the numbers do not hold (an away effect, an effect kind other than a bane) is the player's call. A bane is priced: banesOf. */
const unpriced = (it) => !!(it && (it.awayEffect || (Array.isArray(it.effects) && it.effects.some((e) => e !== 'bane'))));
/* The damage multiplier the worn set has against each monster kind, as the engine clamps it (bane.js baneMultFor), 1 = none. */
const banesOf = (worn) => { const ix = baneIndex(worn, ITEMS); return Object.fromEntries(MONSTER_CLASSES.map((c) => [c, baneMultFor(c, ix)])); };

/** The server's own number against the row's requirement (the hero's Level for gear, Tyler 2026-10-24; item-lore.js
    reqHave, the one reader); a number the server has not sent reads as "cannot", the safe side. Next buy reads it too. */
export function meets(it, skills, level) {
  if (!it.reqSkill || !(it.reqLv > 1)) return true;
  const have = reqHave(it.reqSkill, skills, level);
  return have !== null && have >= it.reqLv;
}

/* THE GROUNDS A LEVEL HUNTS: the open grounds whose Level band holds it, the one place a bane (preyAt) and a resistance (threatsAt) are weighed. */
const groundsAt = (level) => OPEN_HUNTS.filter((h) => Array.isArray(h.band) && !(level < h.band[0] || level > h.band[1]));
/* WHERE A BANE CAN MATTER: the monsters of each kind on those grounds ({ kind: [monster id] }), one answer a Level. */
const PREY = new Map();
function preyAt(level) {
  if (PREY.has(level)) return PREY.get(level);
  const out = {};
  for (const h of groundsAt(level)) {
    for (const s of h.spawns || []) { const c = classOfMonster(MONSTERS[s.monster]); if (c && !(out[c] || (out[c] = [])).includes(s.monster)) out[c].push(s.monster); }
  }
  PREY.set(level, out);
  return out;
}
/* WHERE A RESISTANCE CAN MATTER: the kinds of damage the monsters on those same grounds deal (a Set of resist keys): `physical` for a monster
   that swings (a monster's swing carries no element, damage.js swing), and each spell's own element, `physical` for one with none (a mend
   strikes nobody). The spells are the ones the engine plays now (castsOf: the switch), so the answer is cached a Level and a switch. */
const THREATS = new Map();
export function threatsAt(level) {
  const key = level + (SPELL_SWITCH.live === true ? ':on' : ':off');
  if (THREATS.has(key)) return THREATS.get(key);
  const out = new Set();
  for (const h of groundsAt(level)) {
    for (const s of h.spawns || []) {
      const m = MONSTERS[s.monster];
      if (!m) continue;
      if (m.atk > 0) out.add(PHYSICAL);
      for (const id of castsOf(m)) { const r = spellRow(id); if (r && !mends(r)) out.add(r.element || PHYSICAL); }
    }
  }
  THREATS.set(key, out);
  return out;
}
/* The server's skills as the engine reads them ({ skill: xp }: item-sections.js skillsOf keeps only rows with their xp). No curve is read here
   (session-core LVL-0): a skill the server has not sent reads as 0 xp, the weakest blow, so it never makes a bane look stronger than it is. */
const xpOf = (skills) => Object.fromEntries(Object.entries(skills || {}).map(([k, r]) => [k, r && Number.isFinite(r.xp) ? r.xp : 0]));

/* The numbers a worn set fights with, for the style its weapon sets; `set` false leaves the set bonus out. `prey`: the blow it lands
   (accuracy x largest hit, the engine's) on each monster a bane could matter against (preyAt), by kind. */
function numbersOf(worn, level, set = true, skills = null) {
  const { eq, setBonus, profile } = loadoutOf(worn, ITEMS);
  const at = preyAt(level), xp = xpOf(skills), prey = {};
  for (const c of Object.keys(at)) prey[c] = at[c].map((id) => { const r = playerCombatRolls(MONSTERS[id], { equipment: worn, items: ITEMS, eq, profile, setBonus: null, skills: xp }); return r.accuracy * r.maxHit; });
  let acc = 0, dmg = 0;
  for (const id of Object.values(worn)) {
    const it = ITEMS[id];
    if (!it) continue;
    acc += num(it[profile.accuracyBonusField]);
    dmg += num(it[profile.strengthBonusField]);
  }
  const w = armourWeights(worn, ITEMS);
  return { acc, dmg, def: num(eq.defB), steady: num(eq.steadyPm), crit: num(eq.critB) + (set && setBonus ? num(setBonus.critB) : 0),
    hp: maxHpFor(level, w.heavy), mana: maxManaFor(level, w.light), style: profile.accuracySkill, perks: jewelPerksOf(worn, ITEMS) || {}, banes: banesOf(worn), prey,
    /* the worn set's resistance as the engine resolves and caps it (absent: none), and what deals damage in range (threatsAt) */
    resist: /** @type {{ resistPm?: Record<string, number> }} */ (eq).resistPm || {}, threats: threatsAt(level) };
}

/* The critical chance a worn set's armour-set bonus adds (combat.js, through loadoutOf), 0 with none. */
const setCritOf = (worn) => { const { setBonus } = loadoutOf(worn, ITEMS); return setBonus ? num(setBonus.critB) : 0; };
/* A worn armour piece, and in the bag one of its weight from a higher material tier. */
const tierStep = (it, cur) => !!cur && it.type === 'armor' && cur.type === 'armor' && num(it.tier) > num(cur.tier);

/** A worn armor piece (a catalogue row) of a weight other than `chosen`, the one the hero picked at Tamsin's (null: none picked, so nothing is off it).
    Jewelry, capes, weapons and shields carry no weight and are never off it. Next buy's "where that weight comes from" reads it (next-buy.js findPiece). */
export function offWeight(cur, chosen) {
  return !!cur && PREFER.has(chosen) && ARMOUR_SLOTS.includes(cur.slot) && PREFER.has(weightOf(cur)) && weightOf(cur) !== chosen;
}
/* Never a lower tier: the material tier where both pieces have one, else (a unique with none) the Level each is worn from. */
const notLower = (it, cur) => (Number.isFinite(it.tier) && Number.isFinite(cur.tier) ? it.tier >= cur.tier : num(it.reqLv) >= num(cur.reqLv));
/**
 * THE WEIGHT RULE (the header; designer ruling 2b of 2026-11-18), the ONE reader Equip upgrades (bestFor), Next buy (next-buy.js, through
 * upgradePlan) and its "where that weight comes from" line (findPiece) share: may `it` take the slot `cur` holds (catalogue rows; `cur` null:
 * bare) for a hero who chose `chosen` at Tamsin's? Bare: any weight. Worn off the chosen weight: only that weight, the same tier or higher.
 * Worn otherwise (of the chosen weight, no weight chosen, or a piece with none): only the worn piece's own weight. Pure.
 */
export function weightFits(cur, it, chosen) {
  if (!cur) return true;
  if (offWeight(cur, chosen)) return weightOf(it) === chosen && notLower(it, cur);
  return weightOf(it) === weightOf(cur);
}

const DIMS = Object.freeze(['acc', 'dmg', 'def', 'steady', 'crit', 'hp', 'mana']);
/* The perks either side plays, in the catalogue's order, and one side's size of one (permille, 0 when it plays none). */
const perksIn = (a, b) => Object.keys(JEWEL_PERKS).filter((p) => p in a.perks || p in b.perks);
const perkOf = (n, p) => num(n.perks[p]);
/* A BANE IS WEIGHED WHERE IT PLAYS (the header): for a kind the two sets' banes differ on, the blow each lands on that kind's monsters in the hero's
   range: -1 `a` lands less on one, 1 it lands more on one and less on none, 0 neither (or no such monster: the bane is no reason either way). */
function baneSide(a, b, c) {
  if (Math.abs(a.banes[c] - b.banes[c]) < EPS || !a.prey[c] || !b.prey[c]) return 0;
  let more = false;
  for (let i = 0; i < a.prey[c].length; i++) { if (a.prey[c][i] < b.prey[c][i] - EPS) return -1; if (a.prey[c][i] > b.prey[c][i] + EPS) more = true; }
  return more ? 1 : 0;
}
/* A RESISTANCE IS WEIGHED WHERE IT PLAYS (the header): the keys either side resists that something in range deals, in the engine's key order
   (the order resistProfile writes), and one side's permille of one (0 when it resists none). */
const RESIST_ORDER = Object.freeze([...ELEMENTS, PHYSICAL]);
const resistsIn = (a, b) => RESIST_ORDER.filter((k) => (k in a.resist || k in b.resist) && a.threats.has(k));
const resistOf = (n, k) => num(n.resist[k]);
/* `traits` false judges the plain numbers only (the trades below): a worn bane or resistance that plays in range is still never traded away by this. */
function dominates(a, b, traits = true) {
  let more = false;
  for (const k of DIMS) { if (a[k] < b[k] - EPS) return false; if (a[k] > b[k] + EPS) more = true; }
  for (const p of perksIn(a, b)) { if (perkOf(a, p) < perkOf(b, p)) return false; if (perkOf(a, p) > perkOf(b, p)) more = true; }
  if (traits) for (const c of MONSTER_CLASSES) { const side = baneSide(a, b, c); if (side < 0) return false; if (side > 0) more = true; }
  if (traits) for (const k of resistsIn(a, b)) { if (resistOf(a, k) < resistOf(b, k)) return false; if (resistOf(a, k) > resistOf(b, k)) more = true; }
  return more;
}
/* The monster kinds a swap would lose a bane against WHERE THAT BANE WINS, each with the worn piece's own clamped number (the set's best for that kind is the worn piece's, since the swap drops it). */
const banesLost = (now, after) => MONSTER_CLASSES.filter((c) => after.banes[c] < now.banes[c] - EPS && baneSide(after, now, c) < 0).map((c) => ({ cls: c, pct: Math.round((now.banes[c] - 1) * 100) }));
/* The resistances a swap would lower WHERE THEY PLAY, each by how much (whole percent points of the engine's capped profile). */
const resistsLost = (now, after) => resistsIn(now, after).filter((k) => resistOf(after, k) < resistOf(now, k)).map((k) => ({ resist: k, pct: (resistOf(now, k) - resistOf(after, k)) / 10 }));
const same = (a, b) => DIMS.every((k) => Math.abs(a[k] - b[k]) < EPS) && perksIn(a, b).every((p) => perkOf(a, p) === perkOf(b, p))
  && MONSTER_CLASSES.every((c) => baneSide(a, b, c) === 0) && resistsIn(a, b).every((k) => resistOf(a, k) === resistOf(b, k));
/* A resist key's word, the monster page's own ("Fire", "Physical"). */
const elementWord = (k) => t('monster.el_' + k);

const STYLE_WORDS = Object.freeze({ melee: 'Melee', ranged: 'Ranged', magic: 'Magic' });
/* What one pick adds, in words, in reading order: [{ label, text }]. `cost`: what it takes away instead, the numbers only (a move to the chosen
   weight may: weightFits; it never loses a resistance, and a bane or a perk is no armor piece's), so the line never calls a trade a plain gain. */
function gainsOf(before, after, cost = false) {
  const style = STYLE_WORDS[after.style] || 'Melee';
  const label = { acc: style + ' accuracy', dmg: style + ' damage', def: 'Defense', steady: 'damage taken', crit: 'critical chance', hp: 'health', mana: 'mana' };
  const out = [];
  for (const k of DIMS) {
    const d = cost ? before[k] - after[k] : after[k] - before[k];
    if (d < EPS) continue;
    /* less damage taken reads with a minus, so a cost there reads with a plus */
    const sign = (k === 'steady') === cost ? '+' : '-';
    out.push({ label: label[k], text: sign + (k === 'steady' ? d / 10 + '%' : k === 'crit' ? (Math.round(d * 1000) / 10) + '%' : Math.round(d)) + ' ' + label[k] });
  }
  if (cost) return out;
  /* a perk gained or raised, by the name the piece and the tooltip give it (upgradeWords drops it when the piece's name says it) */
  for (const p of perksIn(after, before)) if (perkOf(after, p) > perkOf(before, p)) out.push({ label: JEWEL_PERKS[p].name, perk: p, text: t('shop.upgrade_adds_perk', { perk: JEWEL_PERKS[p].name }) });
  /* a bane gained: listed after the stats, so the preview's first gain stays the accuracy or damage it adds */
  for (const c of MONSTER_CLASSES) if (after.banes[c] > before.banes[c] + EPS) out.push({ label: 'bane', bane: c, text: t('item.bane_more', { pct: Math.round((after.banes[c] - 1) * 100), kind: baneKindName(c) }) });
  /* a resistance gained where it plays, last for the same reason */
  for (const k of resistsIn(after, before)) if (resistOf(after, k) > resistOf(before, k)) out.push({ label: 'resist', resist: k, text: t('shop.upgrade_resist_gain', { pct: (resistOf(after, k) - resistOf(before, k)) / 10, element: elementWord(k) }) });
  return out;
}

/* A weapon that plays what the worn one plays: its family (hunt-roles.js roleWeaponOf: sword, hammer, axe, wand, staff, ranged), the same grip (a bow and a crossbow share
   their family, and a crossbow can hold a shield), and the worn set's role unmoved. Empty hands have no family, so they stay the player's choice of style. */
const sameHands = (id, cur, worn) => roleWeaponOf(ITEMS[id]) === roleWeaponOf(ITEMS[cur]) && !!ITEMS[id].twoHanded === !!ITEMS[cur].twoHanded
  && wornRoleKey(Object.assign({}, worn, { weapon: id }), ITEMS) === wornRoleKey(worn, ITEMS);
/* An off-hand that plays what the worn one plays: its kind (a shield, a spellbook), its discipline, and the worn set's role unmoved. An empty off-hand stays the player's choice. */
const sameOffhand = (id, cur, worn) => !!cur && !!ITEMS[cur] && !!ITEMS[id].offhand && ITEMS[id].offhand === ITEMS[cur].offhand && (ITEMS[id].discipline || null) === (ITEMS[cur].discipline || null)
  && wornRoleKey(Object.assign({}, worn, { [OFFHAND]: id }), ITEMS) === wornRoleKey(worn, ITEMS);

/* A WORN BANE OR RESISTANCE AGAINST A PLAIN STRONGER PIECE IS THE PLAYER'S CALL, SAID (designer 2026-11-11 small call 2: Iron Sword +7/+6 everywhere
   against a worn Bramble Blade +6/+5 and +40% on plant monsters; where the hero hunts next decides it). Nothing goes on, and the slot is named as a
   choice: the plain pieces that beat the worn one on every number and lose only a bane (the hands: a bane is a weapon's, bane.js) or a resistance
   (any slot, lane/a-next-steps) WHERE IT PLAYS, with what the worn piece keeps (its own clamped numbers). A swap by hand sticks: the worn piece does
   not dominate the plain one, so the next press leaves it. `gain`: a resistance trade's words name what the plain piece adds. */
function tradeOf(slot, cur, now, fits, worn, o, set) {
  if (!cur) return null;
  const plain = [];
  for (const id of fits) {
    const after = numbersOf(Object.assign({}, worn, { [slot]: id }), o.level, set, o.skills);
    const lost = [...(slot === 'weapon' ? banesLost(now, after) : []), ...resistsLost(now, after)];
    if (lost.length && dominates(after, now, false)) plain.push({ id, after, lost });
  }
  const front = plain.filter((c) => !plain.some((x) => x !== c && dominates(x.after, c.after, false))).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!front.length) return null;
  const gain = front[0].lost.some((l) => 'resist' in l) ? (gainsOf(now, front[0].after)[0] || { text: '' }).text : null;
  return { choice: front.map((c) => c.id), keeps: cur, lost: front[0].lost, ...(gain ? { gain } : {}) };
}

/* The best piece in the bag for one slot, or { choice } when two trade off (`keeps`: the worn bane or resistance a plain stronger piece would lose), or null. */
/** @returns {{ choice?: string[], keeps?: any, lost?: any, gain?: string, id?: string, before?: any, after?: any, moved?: boolean }|null}  `moved`: a move to the chosen weight */
function bestFor(slot, worn, left, o) {
  const cur = worn[slot] || null;
  const curIt = cur ? ITEMS[cur] : null;
  if (curIt && unpriced(curIt)) return null;
  /* a worn piece off the chosen weight moves to it (weightFits) without beating the worn one on every number */
  const move = offWeight(curIt, o.chosen);
  const fits = [];
  for (const [id, n] of left) {
    const it = ITEMS[id];
    if (n < 1 || !it || !it.slot || !expandItemSlot(it.slot).includes(slot) || unpriced(it) || !meets(it, o.skills, o.level)) continue;
    if (!weightFits(curIt, it, o.chosen)) continue;
    if (slot === 'weapon' && !sameHands(id, cur, worn)) continue;
    if (STYLE_SLOTS.has(slot) && !sameOffhand(id, cur, worn)) continue;
    fits.push(id);
  }
  /* A tier step in the bag: every piece for this slot is judged with the set bonus out of both sides (the header). */
  const set = !fits.some((id) => tierStep(ITEMS[id], curIt));
  const now = numbersOf(worn, o.level, set, o.skills);
  const better = [];
  for (const id of fits) {
    const after = numbersOf(Object.assign({}, worn, { [slot]: id }), o.level, set, o.skills);
    /* the move, like every swap here, never trades away a resistance where it plays (the header) */
    if (move ? !resistsLost(now, after).length : dominates(after, now)) better.push({ id, after });
  }
  let front = better.filter((c) => !better.some((x) => x !== c && dominates(x.after, c.after)));
  if (!front.length) return tradeOf(slot, cur, now, fits, worn, o, set);
  /* A tie between weights is settled by the weight the player already chose (Tamsin's, the server's tally row):
     a decision made once is not asked again (playtest 2026-10-29: a heavy-paid tank came home with a Bronze
     Platebody and a Leather Body and wore neither). No choice made: the tie stands. */
  if (o.prefer && front.some((c) => !same(c.after, front[0].after))) {
    const mine = front.filter((c) => weightOf(ITEMS[c.id]) === o.prefer);
    if (mine.length) front = mine;
    /* A BARE ARMOR SLOT NEVER WAITS (played 2026-11-04: a hero fought a night with nothing on, over 140 pieces in the bag): none of that weight
       here, the piece that guards most goes on. Every piece in `front` beats bare, and the worn piece moves to the chosen weight later (weightFits). */
    else if (!curIt && ARMOUR_SLOTS.includes(slot)) front = [front.reduce((a, c) => (c.after.def > a.after.def || (c.after.def === a.after.def && c.id < a.id) ? c : a))];
  }
  front.sort((a, b) => (a.id < b.id ? -1 : 1));
  if (front.some((c) => !same(c.after, front[0].after))) return { choice: front.map((c) => c.id) };
  /* ONE PRESS DOES WHAT TWO WOULD: a bare slot's pick off the chosen weight is followed by the move the next press would make (a heavy bow hero's
     bare boots take the Leather Boots that beat bare, and the next press would move them to the Bronze Boots), so the line never shows again. */
  if (!curIt && offWeight(ITEMS[front[0].id], o.chosen)) {
    const moved = bestFor(slot, Object.assign({}, worn, { [slot]: front[0].id }), left, o);
    if (moved && moved.id) return { id: moved.id, before: now, after: moved.after, moved: true };
  }
  return { id: front[0].id, before: now, after: front[0].after, ...(move ? { moved: true } : {}) };
}

/**
 * THE WEIGHT A TIE GOES TO: the one the player chose at Tamsin's, else the one the hero already wears most, else the one her board and her first card call right for the way it fights
 * (hunt-tutorial.js WEIGHT_FOR_ROLE). So Equip upgrades never leaves a hero bare for want of a choice nobody asked for. Pure.
 */
export function preferredWeight(chosen, equipment, role) {
  return chosen || wornWeightOf(equipment || {}) || WEIGHT_FOR_ROLE[role] || null;
}

/**
 * What "Equip upgrades" would put on.
 * @param {{ bag: {id:string, qty:number}[], equipment: object, skills: object|null, level: number|null, prefer?: string|null, chosen?: string|null }} o
 *        all from the server's envelope (item-sections.js bagOf/equipmentOf/skillsOf, the Level, `chosen`: the armor weight the hero picked
 *        at Tamsin's (the server's tally row), the only weight a worn piece is moved to, and `prefer`: preferredWeight's, which settles a tie)
 * @returns {{ ops: object, picks: {slot:string, id:string, replaces:string|null, gains:{label:string,text:string}[], costs?:{label:string,text:string}[], ends?:number}[],
 *             choices: {slot:string, ids:string[]}[] }}  `ops` is the ONE `equip` delta (empty: nothing to do); `costs`: what a move to the chosen weight gives up
 */
export function upgradePlan(o) {
  const worn = Object.assign({}, (o && o.equipment) || {});
  const left = new Map();
  for (const r of (o && o.bag) || []) if (r && Number.isInteger(r.qty) && r.qty > 0) left.set(r.id, r.qty);
  /* a weight picked at Tamsin's is the one a tie goes to as well (preferredWeight puts it first) */
  const chosen = o && PREFER.has(o.chosen) ? o.chosen : null;
  const ctx = { skills: (o && o.skills) || null, level: Math.max(1, Math.floor(num(o && o.level)) || 1),
    chosen, prefer: chosen || (o && PREFER.has(o.prefer) ? o.prefer : null) };
  const ops = {}, picks = [], choices = [];
  /* Empty slots first (the second ring goes beside the first, never over it), then worn ones, by the weight rule (weightFits). */
  for (const pass of [(s) => !worn[s], (s) => !!worn[s] && !(s in ops)]) {
    for (const slot of UPGRADE_SLOTS.concat(OFFHAND)) {
      if (!pass(slot)) continue;
      const b = bestFor(slot, worn, left, ctx);
      if (!b) continue;
      if (b.choice) { choices.push({ slot, ids: b.choice, ...(b.keeps ? { keeps: b.keeps, lost: b.lost } : {}), ...(b.gain ? { gain: b.gain } : {}) }); continue; }
      /* the set bonus this pick ends, if it ends one (the set's own critical chance, so a piece's own that a move gives up is a cost, not a set) */
      const lost = setCritOf(worn) - setCritOf(Object.assign({}, worn, { [slot]: b.id }));
      picks.push({ slot, id: b.id, replaces: worn[slot] || null, gains: gainsOf(b.before, b.after), ...(b.moved ? { costs: gainsOf(b.before, b.after, true) } : {}),
        ...(lost > EPS ? { ends: lost } : {}) });
      ops[slot] = b.id;
      worn[slot] = b.id;
      left.set(b.id, left.get(b.id) - 1);
    }
  }
  return { ops, picks, choices };
}

const listWords = (parts, last = ' and ') => (parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + last + parts[parts.length - 1]);

/** The preview: "Upgrade: Leather Gloves +1 Melee accuracy and Bronze Belt +2 Defense" naming at most `names` pieces
    with `gains` gains each (the button's title passes more). A slot left for the player says so after it. With
    nothing to put on but a tie standing, the line says why the button is off and which pieces trade off (playtest
    2026-10-29 #11: it said nothing). '' when there is neither. */
export function upgradeWords(plan, names = 2, gains = 1) {
  if (!plan) return '';
  if (!plan.picks.length) {
    if (!Array.isArray(plan.choices) || !plan.choices.length) return '';
    /* a worn bane against a plain stronger weapon: the plain one hits harder, the worn one's bane in the tooltip's own words (item.bane_more) */
    /* a worn resistance against a plain piece that adds a number: what the plain one adds, and what the worn one keeps off ("fire damage by 10%") */
    const ties = plan.choices.map((c) => (c.keeps && !c.lost.some((l) => l.cls)
      ? t('shop.upgrade_tie_resist', { plain: listWords(c.ids.map(itemName), ' or '), gain: c.gain || '', worn: itemName(c.keeps),
        cuts: listWords(c.lost.filter((l) => l.resist).map((l) => t('shop.upgrade_resist_cut', { element: elementWord(l.resist).toLowerCase(), pct: l.pct }))) })
      : c.keeps
        ? t('shop.upgrade_tie_bane', { plain: listWords(c.ids.map(itemName), ' or '), bane: itemName(c.keeps),
          more: listWords(c.lost.filter((l) => l.cls).map((l) => t('item.bane_more', { pct: l.pct, kind: baneKindName(l.cls) }))) })
        : ((EQUIP_SLOT_META[c.slot] || {}).label || c.slot) + ': ' + listWords(c.ids.map(itemName), ' or ')));
    const weights = plan.choices.some((c) => new Set(c.ids.map((id) => weightOf(ITEMS[id]))).size > 1);
    return t(weights ? 'shop.upgrade_tie_weights' : 'shop.upgrade_tie', { ties: ties.join('. ') });
  }
  const byId = new Map();
  for (const p of plan.picks) { const g = byId.get(p.id); if (g) g.n++; else byId.set(p.id, { p, n: 1 }); }
  const groups = Array.from(byId.values());
  /* a perk the piece's own name already says ("Banded Signet (Follow-through)") is not said twice; the tooltip holds its sentence */
  /* a move to the chosen weight says what it gives up beside what it adds ("Bronze Gauntlets (+11 health, -1 Melee accuracy)") */
  const said = (p) => p.gains.filter((g) => !(g.perk && itemName(p.id).includes(g.label))).slice(0, gains).concat((p.costs || []).slice(0, gains));
  /* the gains follow the name in a bracket, "Leather Hood (+2 Defense)"; a catalogue name with its own bracket takes a comma, "Banded Signet (Keen), +2 Defense" */
  const named = groups.slice(0, names).map(({ p, n }) => {
    const name = itemName(p.id) + (n > 1 ? ' ×' + n : '');
    return said(p).length ? name + (name.includes('(') ? ', ' : ' (') + said(p).map((g) => g.text).join(', ') + (n > 1 ? ' each' : '') + (name.includes('(') ? '' : ')') : name;
  });
  const more = groups.length - named.length;
  if (more > 0) named.push(more + (more === 1 ? ' more piece' : ' more pieces'));
  const left = plan.choices.map((c) => (EQUIP_SLOT_META[c.slot] || {}).label || c.slot);
  const ends = plan.picks.reduce((n, p) => n + num(p.ends), 0);
  return 'Upgrade: ' + listWords(named) + (ends > EPS ? '. Set bonus lost: +' + (Math.round(ends * 1000) / 10) + '% critical chance' : '')
    + (left.length ? '. ' + listWords(left) + ': pick on the doll' : '');
}
