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
// WHAT IT NEVER DOES (the decisions, 2026-10-22):
//   · never touches the weapon, the off-hand or the ammo: the
//     hands set the style and the role (ruling 2026-10-16) and the player picks
//     every supply (ruling 2026-10-21)
//   · never takes off a piece of another armour weight (the player chose heavy,
//     medium or light), nor one carrying an effect the numbers do not price
//     (a bane, an away effect); it fills EMPTY slots first, then upgrades within
//     the worn piece's own weight
//   · never picks a piece the server's skills say the hero cannot wear yet
//     (unknown skills read as "cannot", the safe side)
//   · never breaks a tie for the player: when two pieces for one slot trade off
//     (each better at something), the slot is left and named in `choices`
// Display and intent NAMES only: nothing here is a gate the server trusts.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.38';
import { EQUIP_SLOT_META, expandItemSlot } from '../data/gathering.js?v=0.2.38';
import { ARMOUR_WEIGHT } from '../data/core-model.js?v=0.2.38';
import { loadoutOf } from '../core/member.js?v=0.2.38';
import { armourWeights, maxHpFor, maxManaFor } from '../core/vitals.js?v=0.2.38';
import { itemName } from './widgets/bits.js?v=0.2.38';

/* The slots the hands and the quiver fill: the player's own choice, never this one. */
const STYLE_SLOTS = new Set(['weapon', 'shield', 'ammo']);
/* Every other equip slot, in the catalogue's order (a new slot row joins with no code). */
const UPGRADE_SLOTS = Object.freeze(Object.keys(EQUIP_SLOT_META).filter((s) => !STYLE_SLOTS.has(s)));
const EPS = 1e-9;
const num = (v) => (Number.isFinite(v) ? v : 0);
const weightOf = (it) => (it && ARMOUR_WEIGHT[it.armourClass]) || 'none';
/* A piece whose worth the numbers do not hold (a bane, an away effect) is the player's call. */
const unpriced = (it) => !!(it && (it.bane || it.awayEffect || (Array.isArray(it.effects) && it.effects.length)));

function meets(it, skills) {
  if (!it.reqSkill || !(it.reqLv > 1)) return true;
  const s = skills && skills[it.reqSkill];
  return !!s && Number.isInteger(s.level) && s.level >= it.reqLv;
}

/* The numbers a worn set fights with, for the style its weapon sets. */
function numbersOf(worn, level) {
  const { eq, setBonus, profile } = loadoutOf(worn, ITEMS);
  let acc = 0, dmg = 0;
  for (const id of Object.values(worn)) {
    const it = ITEMS[id];
    if (!it) continue;
    acc += num(it[profile.accuracyBonusField]);
    dmg += num(it[profile.strengthBonusField]);
  }
  const w = armourWeights(worn, ITEMS);
  return { acc, dmg, def: num(eq.defB), crit: num(eq.critB) + (setBonus ? num(setBonus.critB) : 0),
    hp: maxHpFor(level, w.heavy), mana: maxManaFor(level, w.light), style: profile.accuracySkill };
}

const DIMS = Object.freeze(['acc', 'dmg', 'def', 'crit', 'hp', 'mana']);
function dominates(a, b) {
  let more = false;
  for (const k of DIMS) { if (a[k] < b[k] - EPS) return false; if (a[k] > b[k] + EPS) more = true; }
  return more;
}
const same = (a, b) => DIMS.every((k) => Math.abs(a[k] - b[k]) < EPS);

const STYLE_WORDS = Object.freeze({ melee: 'Melee', ranged: 'Ranged', magic: 'Magic' });
/* What one pick adds, in words, in reading order: [{ label, text }]. */
function gainsOf(before, after) {
  const style = STYLE_WORDS[after.style] || 'Melee';
  const label = { acc: style + ' accuracy', dmg: style + ' damage', def: 'Defense', crit: 'critical chance', hp: 'health', mana: 'mana' };
  const out = [];
  for (const k of DIMS) {
    const d = after[k] - before[k];
    if (d < EPS) continue;
    out.push({ label: label[k], text: '+' + (k === 'crit' ? (Math.round(d * 1000) / 10) + '%' : Math.round(d)) + ' ' + label[k] });
  }
  return out;
}

/* The best piece in the bag for one slot, or { choice } when two trade off, or null. */
function bestFor(slot, worn, left, o) {
  const cur = worn[slot] || null;
  const curIt = cur ? ITEMS[cur] : null;
  if (curIt && unpriced(curIt)) return null;
  const now = numbersOf(worn, o.level);
  const better = [];
  for (const [id, n] of left) {
    const it = ITEMS[id];
    if (n < 1 || !it || !it.slot || !expandItemSlot(it.slot).includes(slot) || unpriced(it) || !meets(it, o.skills)) continue;
    if (curIt && weightOf(it) !== weightOf(curIt)) continue;
    const after = numbersOf(Object.assign({}, worn, { [slot]: id }), o.level);
    if (dominates(after, now)) better.push({ id, after });
  }
  const front = better.filter((c) => !better.some((x) => x !== c && dominates(x.after, c.after)));
  if (!front.length) return null;
  front.sort((a, b) => (a.id < b.id ? -1 : 1));
  if (front.some((c) => !same(c.after, front[0].after))) return { choice: front.map((c) => c.id) };
  return { id: front[0].id, before: now, after: front[0].after };
}

/**
 * What "Equip upgrades" would put on.
 * @param {{ bag: {id:string, qty:number}[], equipment: object, skills: object|null, level: number|null }} o
 *        all from the server's envelope (item-sections.js bagOf/equipmentOf/skillsOf, the Level)
 * @returns {{ ops: object, picks: {slot:string, id:string, replaces:string|null, gains:{label:string,text:string}[]}[],
 *             choices: {slot:string, ids:string[]}[] }}  `ops` is the ONE `equip` delta (empty: nothing to do)
 */
export function upgradePlan(o) {
  const worn = Object.assign({}, (o && o.equipment) || {});
  const left = new Map();
  for (const r of (o && o.bag) || []) if (r && Number.isInteger(r.qty) && r.qty > 0) left.set(r.id, r.qty);
  const ctx = { skills: (o && o.skills) || null, level: Math.max(1, Math.floor(num(o && o.level)) || 1) };
  const ops = {}, picks = [], choices = [];
  /* Empty slots first (the second ring goes beside the first, never over it), then same-weight upgrades. */
  for (const pass of [(s) => !worn[s], (s) => !!worn[s] && !(s in ops)]) {
    for (const slot of UPGRADE_SLOTS) {
      if (!pass(slot)) continue;
      const b = bestFor(slot, worn, left, ctx);
      if (!b) continue;
      if (b.choice) { choices.push({ slot, ids: b.choice }); continue; }
      picks.push({ slot, id: b.id, replaces: worn[slot] || null, gains: gainsOf(b.before, b.after) });
      ops[slot] = b.id;
      worn[slot] = b.id;
      left.set(b.id, left.get(b.id) - 1);
    }
  }
  return { ops, picks, choices };
}

const listWords = (parts) => (parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]);

/** The preview: "Wear Leather Gloves (+1 Melee accuracy) and Bronze Belt (+2 Defense)." naming at most `names` pieces
    with `gains` gains each (the button's title passes more). A slot left for the player says so after it. '' when
    there is nothing to put on. */
export function upgradeWords(plan, names = 2, gains = 1) {
  if (!plan || !plan.picks.length) return '';
  const byId = new Map();
  for (const p of plan.picks) { const g = byId.get(p.id); if (g) g.n++; else byId.set(p.id, { p, n: 1 }); }
  const groups = Array.from(byId.values());
  const named = groups.slice(0, names).map(({ p, n }) => itemName(p.id) + (n > 1 ? ' ×' + n : '') + ' (' + p.gains.slice(0, gains).map((g) => g.text).join(', ') + (n > 1 ? ' each' : '') + ')');
  const more = groups.length - named.length;
  if (more > 0) named.push(more + (more === 1 ? ' more piece' : ' more pieces'));
  const left = plan.choices.map((c) => (EQUIP_SLOT_META[c.slot] || {}).label || c.slot);
  return 'Wear ' + listWords(named) + '.' + (left.length ? ' ' + listWords(left) + ': two pieces trade off, so pick on the doll.' : '');
}
