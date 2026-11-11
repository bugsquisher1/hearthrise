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
//                    never a swap (designer small call 2, 2026-11-11: baneTrade below)
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
//     hands, never the off-hand or the ammo: the hands set the style and the role
//     (ruling 2026-10-16) and the player picks every supply (ruling 2026-10-21)
//   · never takes off a piece of another armour weight (the player chose heavy,
//     medium or light), nor one carrying an effect the numbers do not price
//     (an away effect); it fills EMPTY slots first, then upgrades within
//     the worn piece's own weight
//   · never picks a piece the server's skills say the hero cannot wear yet
//     (unknown skills read as "cannot", the safe side)
//   · never breaks a tie on a worn slot for the player: when two pieces for one slot trade off
//     (each better at something), the slot is left and named in `choices`. An EMPTY slot
//     takes the weight preferredWeight names, so no hero stays bare (designer 2026-11-04)
// Display and intent NAMES only: nothing here is a gate the server trusts.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.121';
import { EQUIP_SLOT_META, expandItemSlot } from '../data/gathering.js?v=0.2.121';
import { ARMOUR_WEIGHT } from '../data/core-model.js?v=0.2.121';
import { JEWEL_PERKS } from '../data/jewelry.js?v=0.2.121';
import { loadoutOf } from '../core/member.js?v=0.2.121';
import { jewelPerksOf } from '../core/combat.js?v=0.2.121';
import { baneIndex, baneMultFor, MONSTER_CLASSES } from '../core/bane.js?v=0.2.121';
import { armourWeights, maxHpFor, maxManaFor } from '../core/vitals.js?v=0.2.121';
import { roleWeaponOf, wornRoleKey } from '../data/hunt-roles.js?v=0.2.121';
import { itemName } from './widgets/bits.js?v=0.2.121';
import { t } from '../render/player-text.js?v=0.2.121';
import { reqHave, baneKindName } from './item-lore.js?v=0.2.121';
import { wornWeightOf } from './hunt-ground-facts.js?v=0.2.121';
import { WEIGHT_FOR_ROLE } from '../data/hunt-tutorial.js?v=0.2.121';

/* The off-hand and the quiver: the player's own choice, never this one. */
const STYLE_SLOTS = new Set(['shield', 'ammo']);
/* Every other equip slot, in the catalogue's order (a new slot row joins with no code). */
const UPGRADE_SLOTS = Object.freeze(Object.keys(EQUIP_SLOT_META).filter((s) => !STYLE_SLOTS.has(s)));
const EPS = 1e-9;
/* The armor weights a player picks (Tamsin's tally: tally-sections.js), the same words ARMOUR_WEIGHT maps to. */
const PREFER = new Set(['heavy', 'medium', 'light']);
const num = (v) => (Number.isFinite(v) ? v : 0);
const weightOf = (it) => (it && ARMOUR_WEIGHT[it.armourClass]) || 'none';
/* A piece whose worth the numbers do not hold (an away effect, an effect kind other than a bane) is the player's call. A bane is priced: banesOf. */
const unpriced = (it) => !!(it && (it.awayEffect || (Array.isArray(it.effects) && it.effects.some((e) => e !== 'bane'))));
/* The damage multiplier the worn set has against each monster kind, as the engine clamps it (bane.js baneMultFor), 1 = none. */
const banesOf = (worn) => { const ix = baneIndex(worn, ITEMS); return Object.fromEntries(MONSTER_CLASSES.map((c) => [c, baneMultFor(c, ix)])); };

/* The server's own number against the row's requirement (the hero's Level for gear, Tyler 2026-10-24; item-lore.js
   reqHave, the one reader); a number the server has not sent reads as "cannot", the safe side. */
function meets(it, skills, level) {
  if (!it.reqSkill || !(it.reqLv > 1)) return true;
  const have = reqHave(it.reqSkill, skills, level);
  return have !== null && have >= it.reqLv;
}

/* The numbers a worn set fights with, for the style its weapon sets; `set` false leaves the set bonus out. */
function numbersOf(worn, level, set = true) {
  const { eq, setBonus, profile } = loadoutOf(worn, ITEMS);
  let acc = 0, dmg = 0;
  for (const id of Object.values(worn)) {
    const it = ITEMS[id];
    if (!it) continue;
    acc += num(it[profile.accuracyBonusField]);
    dmg += num(it[profile.strengthBonusField]);
  }
  const w = armourWeights(worn, ITEMS);
  return { acc, dmg, def: num(eq.defB), steady: num(eq.steadyPm), crit: num(eq.critB) + (set && setBonus ? num(setBonus.critB) : 0),
    hp: maxHpFor(level, w.heavy), mana: maxManaFor(level, w.light), style: profile.accuracySkill, perks: jewelPerksOf(worn, ITEMS) || {}, banes: banesOf(worn) };
}

/* A worn armour piece, and in the bag one of its weight from a higher material tier. */
const tierStep = (it, cur) => !!cur && it.type === 'armor' && cur.type === 'armor' && num(it.tier) > num(cur.tier);

const DIMS = Object.freeze(['acc', 'dmg', 'def', 'steady', 'crit', 'hp', 'mana']);
/* The perks either side plays, in the catalogue's order, and one side's size of one (permille, 0 when it plays none). */
const perksIn = (a, b) => Object.keys(JEWEL_PERKS).filter((p) => p in a.perks || p in b.perks);
const perkOf = (n, p) => num(n.perks[p]);
/* `banes` false judges the plain numbers only (the bane trade below): a worn bane is still never traded away by this. */
function dominates(a, b, banes = true) {
  let more = false;
  for (const k of DIMS) { if (a[k] < b[k] - EPS) return false; if (a[k] > b[k] + EPS) more = true; }
  for (const p of perksIn(a, b)) { if (perkOf(a, p) < perkOf(b, p)) return false; if (perkOf(a, p) > perkOf(b, p)) more = true; }
  if (banes) for (const c of MONSTER_CLASSES) { if (a.banes[c] < b.banes[c] - EPS) return false; if (a.banes[c] > b.banes[c] + EPS) more = true; }
  return more;
}
/* The monster kinds a swap would lose a bane against, each with the worn piece's own clamped number (the set's best for that kind is the worn piece's, since the swap drops it). */
const banesLost = (now, after) => MONSTER_CLASSES.filter((c) => after.banes[c] < now.banes[c] - EPS).map((c) => ({ cls: c, pct: Math.round((now.banes[c] - 1) * 100) }));
const same = (a, b) => DIMS.every((k) => Math.abs(a[k] - b[k]) < EPS) && perksIn(a, b).every((p) => perkOf(a, p) === perkOf(b, p))
  && MONSTER_CLASSES.every((c) => Math.abs(a.banes[c] - b.banes[c]) < EPS);

const STYLE_WORDS = Object.freeze({ melee: 'Melee', ranged: 'Ranged', magic: 'Magic' });
/* What one pick adds, in words, in reading order: [{ label, text }]. */
function gainsOf(before, after) {
  const style = STYLE_WORDS[after.style] || 'Melee';
  const label = { acc: style + ' accuracy', dmg: style + ' damage', def: 'Defense', steady: 'damage taken', crit: 'critical chance', hp: 'health', mana: 'mana' };
  const out = [];
  for (const k of DIMS) {
    const d = after[k] - before[k];
    if (d < EPS) continue;
    out.push({ label: label[k], text: (k === 'steady' ? '-' + d / 10 + '%' : '+' + (k === 'crit' ? (Math.round(d * 1000) / 10) + '%' : Math.round(d))) + ' ' + label[k] });
  }
  /* a perk gained or raised, by the name the piece and the tooltip give it (upgradeWords drops it when the piece's name says it) */
  for (const p of perksIn(after, before)) if (perkOf(after, p) > perkOf(before, p)) out.push({ label: JEWEL_PERKS[p].name, perk: p, text: t('shop.upgrade_adds_perk', { perk: JEWEL_PERKS[p].name }) });
  /* a bane gained: listed after the stats, so the preview's first gain stays the accuracy or damage it adds */
  for (const c of MONSTER_CLASSES) if (after.banes[c] > before.banes[c] + EPS) out.push({ label: 'bane', bane: c, text: t('item.bane_more', { pct: Math.round((after.banes[c] - 1) * 100), kind: baneKindName(c) }) });
  return out;
}

/* A weapon that plays what the worn one plays: its family (hunt-roles.js roleWeaponOf: sword, hammer, axe, wand, staff, ranged), the same grip (a bow and a crossbow share
   their family, and a crossbow can hold a shield), and the worn set's role unmoved. Empty hands have no family, so they stay the player's choice of style. */
const sameHands = (id, cur, worn) => roleWeaponOf(ITEMS[id]) === roleWeaponOf(ITEMS[cur]) && !!ITEMS[id].twoHanded === !!ITEMS[cur].twoHanded
  && wornRoleKey(Object.assign({}, worn, { weapon: id }), ITEMS) === wornRoleKey(worn, ITEMS);

/* A WORN BANE AGAINST A PLAIN STRONGER WEAPON IS THE PLAYER'S CALL, SAID (designer 2026-11-11 small call 2: Iron Sword +7/+6 everywhere against
   a worn Bramble Blade +6/+5 and +40% on plant monsters; where the hero hunts next decides it). Nothing goes on, and the slot is named as a
   choice: the plain weapons of the same hands that beat the worn one on every number and lose only a bane, with the kinds that bane covers
   (the worn piece's own clamped numbers). A swap by hand sticks: the bane does not dominate the plain blade, so the next press leaves it.
   Only the hands: a bane is a weapon's (bane.js), and "hits harder" is a weapon's line. */
function baneTrade(slot, cur, now, fits, worn, o, set) {
  if (slot !== 'weapon' || !cur) return null;
  const plain = [];
  for (const id of fits) {
    const after = numbersOf(Object.assign({}, worn, { [slot]: id }), o.level, set);
    const lost = banesLost(now, after);
    if (lost.length && dominates(after, now, false)) plain.push({ id, after, lost });
  }
  const front = plain.filter((c) => !plain.some((x) => x !== c && dominates(x.after, c.after, false))).sort((a, b) => (a.id < b.id ? -1 : 1));
  return front.length ? { choice: front.map((c) => c.id), keeps: cur, lost: front[0].lost } : null;
}

/* The best piece in the bag for one slot, or { choice } when two trade off (`keeps`: the worn bane a plain stronger weapon would lose), or null. */
function bestFor(slot, worn, left, o) {
  const cur = worn[slot] || null;
  const curIt = cur ? ITEMS[cur] : null;
  if (curIt && unpriced(curIt)) return null;
  const fits = [];
  for (const [id, n] of left) {
    const it = ITEMS[id];
    if (n < 1 || !it || !it.slot || !expandItemSlot(it.slot).includes(slot) || unpriced(it) || !meets(it, o.skills, o.level)) continue;
    if (curIt && weightOf(it) !== weightOf(curIt)) continue;
    if (slot === 'weapon' && !sameHands(id, cur, worn)) continue;
    fits.push(id);
  }
  /* A tier step in the bag: every piece for this slot is judged with the set bonus out of both sides (the header). */
  const set = !fits.some((id) => tierStep(ITEMS[id], curIt));
  const now = numbersOf(worn, o.level, set);
  const better = [];
  for (const id of fits) {
    const after = numbersOf(Object.assign({}, worn, { [slot]: id }), o.level, set);
    if (dominates(after, now)) better.push({ id, after });
  }
  let front = better.filter((c) => !better.some((x) => x !== c && dominates(x.after, c.after)));
  if (!front.length) return baneTrade(slot, cur, now, fits, worn, o, set);
  /* A tie between weights is settled by the weight the player already chose (Tamsin's, the server's tally row):
     a decision made once is not asked again (playtest 2026-10-29: a heavy-paid tank came home with a Bronze
     Platebody and a Leather Body and wore neither). No choice made, or none of that weight: the tie stands. */
  if (o.prefer && front.some((c) => !same(c.after, front[0].after))) {
    const mine = front.filter((c) => weightOf(ITEMS[c.id]) === o.prefer);
    /* A BARE SLOT NEVER WAITS (played 2026-11-04: a hero fought a night with nothing on, over 140 pieces in the bag): none of that weight here, the piece that guards most goes on. Every piece
       in `front` is strictly better than bare, and it stays the player's to change on the doll. */
    if (mine.length) front = mine;
    else if (!curIt) front = [front.reduce((a, c) => (c.after.def > a.after.def || (c.after.def === a.after.def && c.id < a.id) ? c : a))];
  }
  front.sort((a, b) => (a.id < b.id ? -1 : 1));
  if (front.some((c) => !same(c.after, front[0].after))) return { choice: front.map((c) => c.id) };
  return { id: front[0].id, before: now, after: front[0].after };
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
 * @param {{ bag: {id:string, qty:number}[], equipment: object, skills: object|null, level: number|null, prefer?: string|null }} o
 *        all from the server's envelope (item-sections.js bagOf/equipmentOf/skillsOf, the Level, and `prefer`: the
 *        armor weight the hero chose at Tamsin's, which settles a tie between weights)
 * @returns {{ ops: object, picks: {slot:string, id:string, replaces:string|null, gains:{label:string,text:string}[]}[],
 *             choices: {slot:string, ids:string[]}[] }}  `ops` is the ONE `equip` delta (empty: nothing to do)
 */
export function upgradePlan(o) {
  const worn = Object.assign({}, (o && o.equipment) || {});
  const left = new Map();
  for (const r of (o && o.bag) || []) if (r && Number.isInteger(r.qty) && r.qty > 0) left.set(r.id, r.qty);
  const ctx = { skills: (o && o.skills) || null, level: Math.max(1, Math.floor(num(o && o.level)) || 1),
    prefer: o && PREFER.has(o.prefer) ? o.prefer : null };
  const ops = {}, picks = [], choices = [];
  /* Empty slots first (the second ring goes beside the first, never over it), then same-weight upgrades. */
  for (const pass of [(s) => !worn[s], (s) => !!worn[s] && !(s in ops)]) {
    for (const slot of UPGRADE_SLOTS) {
      if (!pass(slot)) continue;
      const b = bestFor(slot, worn, left, ctx);
      if (!b) continue;
      if (b.choice) { choices.push({ slot, ids: b.choice, ...(b.keeps ? { keeps: b.keeps, lost: b.lost } : {}) }); continue; }
      /* the set bonus this pick ends, if it ends one (crit lost with the set counted, the line's words) */
      const lost = numbersOf(worn, ctx.level).crit - numbersOf(Object.assign({}, worn, { [slot]: b.id }), ctx.level).crit;
      picks.push({ slot, id: b.id, replaces: worn[slot] || null, gains: gainsOf(b.before, b.after), ...(lost > EPS ? { ends: lost } : {}) });
      ops[slot] = b.id;
      worn[slot] = b.id;
      left.set(b.id, left.get(b.id) - 1);
    }
  }
  return { ops, picks, choices };
}

const listWords = (parts, last = ' and ') => (parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + last + parts[parts.length - 1]);

/** The preview: "Wear Leather Gloves (+1 Melee accuracy) and Bronze Belt (+2 Defense)." naming at most `names` pieces
    with `gains` gains each (the button's title passes more). A slot left for the player says so after it. With
    nothing to put on but a tie standing, the line says why the button is off and which pieces trade off (playtest
    2026-10-29 #11: it said nothing). '' when there is neither. */
export function upgradeWords(plan, names = 2, gains = 1) {
  if (!plan) return '';
  if (!plan.picks.length) {
    if (!Array.isArray(plan.choices) || !plan.choices.length) return '';
    /* a worn bane against a plain stronger weapon: the plain one hits harder, the worn one's bane in the tooltip's own words (item.bane_more) */
    const ties = plan.choices.map((c) => (c.keeps
      ? t('shop.upgrade_tie_bane', { plain: listWords(c.ids.map(itemName), ' or '), bane: itemName(c.keeps),
        more: listWords(c.lost.map((l) => t('item.bane_more', { pct: l.pct, kind: baneKindName(l.cls) }))) })
      : ((EQUIP_SLOT_META[c.slot] || {}).label || c.slot) + ': ' + listWords(c.ids.map(itemName), ' or ')));
    const weights = plan.choices.some((c) => new Set(c.ids.map((id) => weightOf(ITEMS[id]))).size > 1);
    return t(weights ? 'shop.upgrade_tie_weights' : 'shop.upgrade_tie', { ties: ties.join('. ') });
  }
  const byId = new Map();
  for (const p of plan.picks) { const g = byId.get(p.id); if (g) g.n++; else byId.set(p.id, { p, n: 1 }); }
  const groups = Array.from(byId.values());
  /* a perk the piece's own name already says ("Banded Signet (Follow-through)") is not said twice; the tooltip holds its sentence */
  const said = (p) => p.gains.filter((g) => !(g.perk && itemName(p.id).includes(g.label))).slice(0, gains);
  /* a name that ends in its own bracket takes the gains inside it: "Banded Signet (Follow-through, +1 Melee accuracy)", never two brackets in a row */
  const named = groups.slice(0, names).map(({ p, n }) => {
    const name = itemName(p.id), many = n > 1 ? ' ×' + n : '', own = /^(.*) \((.*)\)$/.exec(name);
    if (!said(p).length) return name + many;
    const words = said(p).map((g) => g.text).join(', ') + (n > 1 ? ' each' : '');
    return own ? own[1] + many + ' (' + own[2] + ', ' + words + ')' : name + many + ' (' + words + ')';
  });
  const more = groups.length - named.length;
  if (more > 0) named.push(more + (more === 1 ? ' more piece' : ' more pieces'));
  const left = plan.choices.map((c) => (EQUIP_SLOT_META[c.slot] || {}).label || c.slot);
  const ends = plan.picks.reduce((n, p) => n + num(p.ends), 0);
  return 'Wear ' + listWords(named) + '.' + (ends > EPS ? ' Your full set\'s +' + (Math.round(ends * 1000) / 10) + '% critical chance ends.' : '')
    + (left.length ? ' ' + listWords(left) + ': two pieces trade off, so pick on the doll.' : '');
}
