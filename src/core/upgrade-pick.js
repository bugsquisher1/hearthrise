// ════════════════════════════════════════════════════════════════════════
// src/core/upgrade-pick.js — "WEAR UPGRADES": WHICH PIECES ARE STRICTLY BETTER, FOR THE CLIENT AND THE SERVER ALIKE.
//
// Designer D-2 (review/05-designer-rulings.md section 2.1 rule 3): "The pick moves to src/core so the server makes it." This is the pick the
// Inventory's Equip upgrades always made (src/shell/upgrade-plan.js), moved whole and unchanged: the shell words it (gains, ties), and the
// company's Start wears it on the server (supabase/functions/hr-accrue/company-wear.js, the "Wear upgrades" plan line), so a hero whose hunt
// ended with the browser closed is dressed by the server's own pick, never the browser's.
// PURE, dual-runtime (Node and Deno), no words and no DOM. WHAT "BETTER" MEANS and WHAT IT NEVER DOES: src/shell/upgrade-plan.js's header,
// the rules this file holds.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js';
import { EQUIP_SLOT_META, expandItemSlot } from '../data/gathering.js';
import { ARMOUR_WEIGHT, ARMOUR_SLOTS } from '../data/core-model.js';
import { JEWEL_PERKS } from '../data/jewelry.js';
import { LEVEL_REQ } from '../data/gear-tiers.js';
import { loadoutOf } from './member.js';
import { jewelPerksOf, playerCombatRolls } from './combat.js';
import { baneIndex, baneMultFor, classOfMonster, MONSTER_CLASSES } from './bane.js';
import { MONSTERS } from '../data/monsters.js';
import { OPEN_HUNTS } from '../data/hunts.js';
import { castsOf, spellRow, mends, SPELL_SWITCH } from '../data/monster-spells.js';
import { ELEMENTS, PHYSICAL } from '../data/elements.js';
import { armourWeights, maxHpFor, maxManaFor } from './vitals.js';
import { roleWeaponOf, wornRoleKey, WEIGHT_FOR_ROLE } from '../data/hunt-roles.js';

/** A skill or Level requirement against the server's numbers: the hero's Level for gear (`LEVEL_REQ`, Tyler 2026-10-24), else the skill's
    level; null when the server has not sent it (item-lore.js and Next buy read it too). */
export function reqHave(req, skills, level) {
  if (req === LEVEL_REQ) return Number.isInteger(level) ? level : null;
  const s = skills && typeof req === 'string' ? skills[req] : null;
  return s && Number.isInteger(s.level) ? s.level : null;
}

/* The worn armor's weight: the most-worn among helmet, body, legs and boots, the heavier on a tie; null for none (hunt-ground-facts.js says it). */
const WORN_WEIGHT_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots']);
const WEIGHTS = Object.freeze(['heavy', 'medium', 'light']);
/** The armour weight an equipment map (slot -> item id) wears most among helmet, body, legs and boots; the heavier on a tie; null for none. */
export function wornWeightOf(eq) {
  const n = { heavy: 0, medium: 0, light: 0 };
  for (const slot of WORN_WEIGHT_SLOTS) {
    const it = eq && ITEMS[eq[slot]];
    const w = it && ARMOUR_WEIGHT[it.armourClass];
    if (w) n[w]++;
  }
  const best = WEIGHTS.reduce((a, w) => (n[w] > n[a] ? w : a), 'heavy');
  return n[best] ? best : null;
}

/* The off-hand and the quiver: the player's own choice, never this one. */
const STYLE_SLOTS = new Set(['shield', 'ammo']);
/* Every other equip slot, in the catalogue's order (a new slot row joins with no code). */
const UPGRADE_SLOTS = Object.freeze(Object.keys(EQUIP_SLOT_META).filter((s) => !STYLE_SLOTS.has(s)));
/* The one style slot a press may touch, and only like for like (sameOffhand below). */
const OFFHAND = 'shield';
export const EPS = 1e-9;
/* The armor weights a player picks (Tamsin's tally: tally-sections.js), the same words ARMOUR_WEIGHT maps to. */
const PREFER = new Set(['heavy', 'medium', 'light']);
const num = (v) => (Number.isFinite(v) ? v : 0);
export const weightOf = (it) => (it && ARMOUR_WEIGHT[it.armourClass]) || 'none';
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

export const DIMS = Object.freeze(['acc', 'dmg', 'def', 'steady', 'crit', 'hp', 'mana']);
/* The perks either side plays, in the catalogue's order, and one side's size of one (permille, 0 when it plays none). */
export const perksIn = (a, b) => Object.keys(JEWEL_PERKS).filter((p) => p in a.perks || p in b.perks);
export const perkOf = (n, p) => num(n.perks[p]);
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
export const resistsIn = (a, b) => RESIST_ORDER.filter((k) => (k in a.resist || k in b.resist) && a.threats.has(k));
export const resistOf = (n, k) => num(n.resist[k]);
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
  /* a resistance trade's words name what the plain piece adds: the shell words it from these two (upgrade-plan.js gainsOf) */
  const gain = front[0].lost.some((l) => 'resist' in l) ? { gainFrom: now, gainTo: front[0].after } : null;
  return { choice: front.map((c) => c.id), keeps: cur, lost: front[0].lost, ...(gain || {}) };
}

/* The best piece in the bag for one slot, or { choice } when two trade off (`keeps`: the worn bane or resistance a plain stronger piece would lose), or null. */
/** @returns {{ choice?: string[], keeps?: any, lost?: any, gainFrom?: any, gainTo?: any, id?: string, before?: any, after?: any, moved?: boolean }|null}  `moved`: a move to the chosen weight */
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
 * (hunt-roles.js WEIGHT_FOR_ROLE). So Equip upgrades never leaves a hero bare for want of a choice nobody asked for. Pure.
 */
export function preferredWeight(chosen, equipment, role) {
  return chosen || wornWeightOf(equipment || {}) || WEIGHT_FOR_ROLE[role] || null;
}


/**
 * WHAT "WEAR UPGRADES" PUTS ON: the pick, no words (the shell's upgrade-plan.js upgradePlan words it; the Start's server half,
 * supabase/functions/hr-accrue/company-wear.js, wears its `ops`).
 * @param {{ bag: {id:string, qty:number}[], equipment: object, skills: object|null, level: number|null, prefer?: string|null, chosen?: string|null }} o
 *        all from the server's state (the bag, the worn set, the skills with their xp, the Level, `chosen`: the armor weight the hero picked
 *        at Tamsin's, the only weight a worn piece is moved to, and `prefer`: preferredWeight's, which settles a tie)
 * @returns {{ ops: object, picks: {slot:string, id:string, replaces:string|null, before:any, after:any, moved?:boolean, ends?:number}[],
 *             choices: {slot:string, ids:string[], keeps?:string, lost?:any[], gainFrom?:any, gainTo?:any}[] }}  `ops` is the ONE `equip` delta
 */
export function pickUpgrades(o) {
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
      if (b.choice) { choices.push({ slot, ids: b.choice, ...(b.keeps ? { keeps: b.keeps, lost: b.lost } : {}), ...(b.gainFrom ? { gainFrom: b.gainFrom, gainTo: b.gainTo } : {}) }); continue; }
      /* the set bonus this pick ends, if it ends one (the set's own critical chance, so a piece's own that a move gives up is a cost, not a set) */
      const lost = setCritOf(worn) - setCritOf(Object.assign({}, worn, { [slot]: b.id }));
      picks.push({ slot, id: b.id, replaces: worn[slot] || null, before: b.before, after: b.after, ...(b.moved ? { moved: true } : {}),
        ...(lost > EPS ? { ends: lost } : {}) });
      ops[slot] = b.id;
      worn[slot] = b.id;
      left.set(b.id, left.get(b.id) - 1);
    }
  }
  return { ops, picks, choices };
}

/* ── THE COMPANY'S START: WHAT EVERY GOING HERO PUTS ON (designer D-2: the "Wear upgrades" plan line, lane/c-company) ───────────────── */
const ID = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The pick's inputs from the server's own projection of one hero: `read(key)` answers a section of hr_state_of (the edge's envelope, or a
 * CharacterSession's record): the bag, the worn set, the skills with their xp, the Level, the weight chosen at Tamsin's and the role the worn
 * set gives (preferredWeight's tie-break). A section the server did not send reads as nothing, the safe side.
 */
export function wearInputOf(read) {
  const inv = read('inventory'), eq = read('equipment'), sk = read('skills'), lv = read('level'), tally = read('tally'), set = read('hunt_settings');
  const bag = isObj(inv) ? Object.entries(inv).filter(([id, n]) => ID.test(id) && Number.isSafeInteger(n) && n > 0).map(([id, qty]) => ({ id, qty })) : [];
  const equipment = isObj(eq) ? Object.fromEntries(Object.entries(eq).filter(([s, id]) => /^[a-z0-9_]{1,32}$/.test(s) && typeof id === 'string' && ID.test(id))) : {};
  const skills = {};
  if (isObj(sk)) {
    for (const [id, r] of Object.entries(sk)) {
      if (/^[a-z_]{1,32}$/.test(id) && isObj(r) && Number.isSafeInteger(r.xp) && r.xp >= 0 && Number.isInteger(r.level) && r.level >= 1) skills[id] = { xp: r.xp, level: r.level };
    }
  }
  const level = isObj(lv) && Number.isInteger(lv.level) && lv.level >= 1 ? lv.level : null;
  const chosen = isObj(tally) && PREFER.has(tally.weight) ? tally.weight : null;
  const role = isObj(set) && typeof set.role === 'string' ? set.role : null;
  return { bag, equipment, skills, level, chosen, prefer: preferredWeight(chosen, equipment, role) };
}

/**
 * The wear lines for the heroes going out ([{ slot, input }] in slot order, input: wearInputOf's): each hero's own bag first, then across the
 * company a piece another going hero holds and does not wear (`from`: the server passes it through the account's Storage, D-2 rule 4).
 * A trade-off is never on it (it stays a choice: a "Needs you" row). At most 48 lines. Pure.
 * @returns {{ slot:number, equip_slot:string, item:string, from?:number }[]}
 */
export function companyWearLines(heroes) {
  const lines = [], left = new Map(), worn = new Map();
  for (const { slot, input } of heroes) {
    left.set(slot, new Map(input.bag.map((r) => [r.id, r.qty])));
    worn.set(slot, Object.assign({}, input.equipment));
  }
  const take = (slot, id) => { const m = left.get(slot); m.set(id, (m.get(id) || 0) - 1); };
  for (const { slot, input } of heroes) {
    for (const [eq, id] of Object.entries(pickUpgrades(input).ops)) {
      if (typeof id !== 'string') continue;
      lines.push({ slot, equip_slot: eq, item: id });
      take(slot, id);
      worn.get(slot)[eq] = id;
    }
  }
  for (const { slot, input } of heroes) {
    const pool = new Map();
    for (const m of left.values()) for (const [id, n] of m) if (n > 0) pool.set(id, (pool.get(id) || 0) + n);
    const plan = pickUpgrades(Object.assign({}, input, { bag: [...pool].map(([id, qty]) => ({ id, qty })), equipment: worn.get(slot) }));
    for (const [eq, id] of Object.entries(plan.ops)) {
      if (typeof id !== 'string' || worn.get(slot)[eq] === id) continue;
      const own = (left.get(slot).get(id) || 0) > 0;
      const donor = own ? null : [...left].find(([s2, m]) => s2 !== slot && (m.get(id) || 0) > 0);
      if (!own && !donor) continue;
      lines.push(own ? { slot, equip_slot: eq, item: id } : { slot, equip_slot: eq, item: id, from: donor[0] });
      take(own ? slot : donor[0], id);
      worn.get(slot)[eq] = id;
    }
  }
  return lines.slice(0, 48);
}
