// ════════════════════════════════════════════════════════════════════════
// src/shell/upgrade-plan.js — "EQUIP UPGRADES": WHAT ONE PRESS WOULD PUT ON, IN WORDS.
// THE PICK IS src/core/upgrade-pick.js (designer D-2, lane/c-company: the server's Start wears the same pick); this file words it (each
// pick's gains and costs, a tie's sentence) and keeps upgradePlan's shape for the Inventory, the Shop, Next buy and the end card.
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
import { ITEMS } from '../data/items.js';
import { EQUIP_SLOT_META } from '../data/gathering.js';
import { JEWEL_PERKS } from '../data/jewelry.js';
import { MONSTER_CLASSES } from '../core/bane.js';
import { pickUpgrades, EPS, DIMS, perksIn, perkOf, resistsIn, resistOf, weightOf } from '../core/upgrade-pick.js';
import { itemName } from './widgets/bits.js';
import { t } from '../render/player-text.js';
import { baneKindName } from './bag-model.js';

export { meets, offWeight, weightFits, preferredWeight, threatsAt } from '../core/upgrade-pick.js';

const num = (v) => (Number.isFinite(v) ? v : 0);

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


/**
 * What "Equip upgrades" would put on: src/core/upgrade-pick.js's pick, with each pick's gains (and a move's costs) in words.
 * @param {{ bag: {id:string, qty:number}[], equipment: object, skills: object|null, level: number|null, prefer?: string|null, chosen?: string|null }} o
 * @returns {{ ops: object, picks: {slot:string, id:string, replaces:string|null, gains:{label:string,text:string}[], costs?:{label:string,text:string}[], ends?:number}[],
 *             choices: {slot:string, ids:string[]}[] }}  `ops` is the ONE `equip` delta (empty: nothing to do); `costs`: what a move to the chosen weight gives up
 */
export function upgradePlan(o) {
  const p = pickUpgrades(o);
  return {
    ops: p.ops,
    picks: p.picks.map((k) => ({ slot: k.slot, id: k.id, replaces: k.replaces, gains: gainsOf(k.before, k.after),
      ...(k.moved ? { costs: gainsOf(k.before, k.after, true) } : {}), ...(k.ends ? { ends: k.ends } : {}) })),
    /* a resistance trade's line names what the plain piece adds */
    choices: p.choices.map(({ gainFrom, gainTo, ...c }) => (gainFrom ? { ...c, gain: (gainsOf(gainFrom, gainTo)[0] || { text: '' }).text } : c)),
  };
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
