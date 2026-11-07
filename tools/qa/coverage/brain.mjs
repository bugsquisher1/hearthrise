// ════════════════════════════════════════════════════════════════════════
// tools/qa/coverage/brain.mjs — "WHAT WOULD A SENSIBLE PLAYER DO NEXT?"
//
// PURE. No world, no clock, no randomness: the same hero in the same state gets the same answer, so a
// run is reproducible and the in-game "what next" can reuse it later. Input: a hero's VIEW (view.mjs,
// read from the server's own envelope), the coverage map (map.mjs, read from data) and the bot's
// MEMORY (what it tried and what the server refused). Output: ONE action with the rule that chose it
// and the reason in plain words, or null, which the runner logs as a stall with the hero's state.
//
// The rules run in order; the first that answers wins. Each is small and says why. They read DATA for
// every list (recipes, nodes, crops, grounds, offers), so new content is a new candidate with no edit.
//   1  harvest       a crop on the shared land is ready
//   2  plant         an empty plot and a seed this hero's Farming can grow
//   3  wear          a better piece for a slot, that this hero's way of fighting wears and its Level allows
//   4  sell          loot the hero has no use for (trash, worse gear, a pile past what its crafts need)
//   5  buy           a listed Shop row that opens something (a tool for a skill, gear for an empty slot)
//   6  build         a house tier, a room rung, a plot or a chest the purse and the bag can pay
//   7  craft         back in town with stock for a bench (a visit's budget at most): the least-trained
//                    artisan skill's best recipe, so loot becomes what another skill uses
//   8  hunt          stamina left: the game's own advice for this Level (src/shell/hunt-list.js), a ground
//                    in band not yet visited first, a harder tier once Normal is held twice
//   9  gather        no hunt (stamina out): the least-trained gathering skill's best node, until rested
//   -  nothing       the runner logs a STALL with the hero's state and lets half an hour pass
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../../../src/data/items.js';
import { wornByRole } from '../../../src/data/hunt-tutorial.js';
import { recommendedHunt } from '../../../src/shell/hunt-list.js';
import { roleForWeapon, roleKeyOf, shootsItem } from '../../../src/data/hunt-roles.js';
import { isShield } from '../../../src/data/shields.js';
import { pacedActionMs } from '../../../src/core/pacing.js';

/* How the brain spends time. Plain numbers, not balance: how long a sensible player stays on one thing. */
export const PACE = Object.freeze({
  huntStretchMin: 120,     // one hunt, then back to town to sell, wear and craft
  minStaminaToHuntMin: 45, // under this a hunt is not worth the walk; rest with town work
  workStretchMin: 60,      // one town job at a time
  visitMin: 90,            // between two hunts, at most this long at the benches turning loot into goods
  minBatches: 5,           // a bench job is worth starting for at least this many
  restMin: 30,             // nothing to do: let time pass and look again
  keepGold: 300,           // never spend the purse under this (store food and arrows are bought per use on a hunt)
  bagKindsSoft: 70,        // past this many kinds in the bag, sell what has no use
});

const owned = (v, id) => (v.bag[id] || 0) + (v.storage[id] || 0);
const tierOf = (id) => { const it = ITEMS[id] || {}; return [Number(it.reqLv) || 0, Number(it.tier) || 0, Number(it.v) || 0]; };
const better = (a, b) => { const x = tierOf(a), y = tierOf(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
const tried = (mem, key) => mem.refused.has(key) || (mem.cooldown.get(key) || 0) > mem.hour;

/**
 * What the hero is saving stock for: the cheapest house tier (data: shops.js `property`) not yet bought, and the server's
 * next storage chest (its envelope's depot.next). item -> count. The sell and craft rules keep these; the stock rule fetches them.
 */
export function wantedItems(v, map, mem) {
  const out = new Map();
  const add = (id, n) => out.set(id, Math.max(out.get(id) || 0, n));
  const home = map.sinks.filter((s) => s.table === 'property' && !mem.bought.has(s.id) && !tried(mem, 'build:' + s.id)).sort((a, b) => a.gold - b.gold)[0];
  if (home) for (const c of home.items) add(c.id, c.qty);
  if (v.depotNext) for (const [id, n] of Object.entries(v.depotNext.items)) add(id, n);
  /* the gold those builds cost: a fighter fetches materials only once the purse is there (a crafter fetches them anyway) */
  out.gold = Math.min(home ? home.gold : Infinity, v.depotNext ? v.depotNext.gold : Infinity);
  return out;
}

/** The role a worn set plays (hunt-roles.js, the one weapon -> role table). */
export function roleOf(worn) {
  return roleForWeapon(roleKeyOf(ITEMS[worn.weapon] || null, ITEMS[worn.shield] || null)) || 'melee_dps';
}

/**
 * Where a group of `size` at `levels` hunts next: a ground in band it has not hunted yet first (coverage), else the game's
 * own advice (src/shell/hunt-list.js recommendedHunt, the party's when size > 1). A lone hero is never sent to a party ground.
 * A harder tier once Normal held twice there with no death (Tyler 2026-11-04: pushing is a warned choice).
 */
function pickGround({ levels, size, map, mem, staminaMin }) {
  const lo = Math.min(...levels), hi = Math.max(...levels);
  const advised = recommendedHunt(size > 1 ? levels : lo, size);
  const inBand = map.grounds.filter((g) => g.band[0] <= lo && hi <= g.band[1] && (size > 1 || !g.party));
  const fresh = inBand.find((g) => !mem.visited.has(g.id + ':normal') && !tried(mem, 'hunt:' + g.id + ':normal'));
  const ground = fresh || (advised && map.grounds.find((g) => g.hunt === advised.hunt)) || inBand[0] || null;
  if (!ground) return null;
  const held = mem.held.get(ground.id + ':normal') || 0;
  const tier = ground.tiers.find((t) => t !== 'normal' && held >= 2 && !mem.visited.has(ground.id + ':' + t) && !tried(mem, 'hunt:' + ground.id + ':' + t)) || 'normal';
  const minutes = Math.min(PACE.huntStretchMin, Math.max(10, staminaMin - 5));
  return { type: 'hunt', ground: ground.id, hunt: ground.hunt, tier, minutes, key: 'hunt:' + ground.id + ':' + tier,
    why: (fresh === ground ? 'a ground in band not yet hunted' : 'the ground the game advises at Level ' + levels.join('/')) + (tier !== 'normal' ? ', trying ' + tier : '') + (size > 1 ? ' (a party of ' + size + ')' : '') };
}

/** The party's next hunt, for its leader (`vs` every member's view, leader first), or null. */
export function partyHunt({ vs, map, mem }) {
  const stamina = Math.min(...vs.map((v) => v.staminaMin));
  if (stamina < PACE.minStaminaToHuntMin) return null;
  const a = pickGround({ levels: vs.map((v) => v.level), size: vs.length, map, mem, staminaMin: stamina });
  return a ? { rule: 'party hunt', ...a } : null;
}

// ── THE RULES ────────────────────────────────────────────────────────────
const RULES = [
  { id: 'harvest', pick: ({ v }) => {
    const p = v.farm.find((x) => x.crop && x.ready);
    return p ? { type: 'harvest', plot: p.idx, why: 'the ' + p.crop + ' on plot ' + p.idx + ' is ready' } : null;
  } },

  { id: 'plant', pick: ({ v, map, mem }) => {
    const empty = v.farm.find((x) => !x.crop);
    if (!empty) return null;
    const crops = map.nodes.filter((n) => n.kind === 'crop' && n.req <= (v.skills.farming || 1) && owned(v, n.seed) > 0 && !tried(mem, 'plant:' + n.id));
    const best = crops.sort((a, b) => b.req - a.req)[0];
    return best ? { type: 'plant', plot: empty.idx, crop: best.id, key: 'plant:' + best.id, why: 'plot ' + empty.idx + ' is empty and a ' + best.seed + ' is in hand' } : null;
  } },

  { id: 'wear', pick: ({ v, mem }) => {
    if (v.hunting) return null;
    const role = mem.way ? mem.way.role : roleOf(v.worn);
    for (const id of Object.keys(v.bag)) {
      const it = ITEMS[id];
      if (!it || !it.slot || it.slot === 'weapon' && mem.way && !mem.way.keepsWeapon(id)) continue;
      if ((Number(it.reqLv) || 0) > v.level || !wornByRole(id, role) || tried(mem, 'wear:' + id)) continue;
      if (it.slot === 'ammo' && !shootsItem(role, it)) continue;
      const slot = it.slot === 'ring' ? (v.worn.ring1 ? 'ring2' : 'ring1') : it.slot;
      if (it.slot === 'shield' && it.twoHanded) continue;
      if (slot === 'shield' && ITEMS[v.worn.weapon] && ITEMS[v.worn.weapon].twoHanded) continue;
      if (slot === 'shield' && isShield(it) && role !== 'tank') continue;
      const now = v.worn[slot];
      if (!now || better(id, now)) return { type: 'equip', map: { [slot]: id }, key: 'wear:' + id, why: (now ? ITEMS[id].n + ' is better than ' + (ITEMS[now] ? ITEMS[now].n : now) : 'nothing worn on ' + slot) };
    }
    return null;
  } },

  { id: 'sell', pick: ({ v, map, mem }) => {
    if (v.hunting) return null;
    const lines = [];
    const kinds = Object.keys(v.bag).length;
    const role = mem.way ? mem.way.role : roleOf(v.worn);
    const want = wantedItems(v, map, mem);
    for (const [id, qty] of Object.entries(v.bag)) {
      const it = ITEMS[id];
      if (!it || !(qty > 0) || mem.locked.has(id) || want.has(id) || tried(mem, 'sell:' + id) || !(Number(it.v) > 0)) continue;
      const row = map.itemIndex.get(id);
      const trash = row && row.uses.length > 0 && row.uses.every((u) => u === 'vendor trash');
      const worseGear = it.slot && Object.values(v.worn).some((w) => w && ITEMS[w] && ITEMS[w].slot === it.slot && better(w, id));
      /* a piece this way of fighting never wears (plate to a caster, cloth to a tank): the shop's coin is its use here */
      const notMine = it.slot && it.slot !== 'ammo' && !wornByRole(id, role) && !(it.slot === 'weapon' && mem.way && mem.way.keepsWeapon(id));
      const crowded = kinds > PACE.bagKindsSoft && !it.heals && !it.mana;
      if (trash || worseGear || notMine || crowded) lines.push({ item: id, qty: Math.min(qty, 1000), why: trash ? 'trash' : worseGear ? 'worse than worn' : notMine ? 'not worn by a ' + role : 'bag crowded' });
      if (lines.length >= 64) break;
    }
    return lines.length ? { type: 'sell', lines: lines.map(({ item, qty }) => ({ item, qty })), why: lines.length + ' stacks with no use for this hero (' + [...new Set(lines.map((l) => l.why))].join(', ') + ')' } : null;
  } },

  { id: 'buy', pick: ({ v, map, mem }) => {
    if (v.hunting) return null;
    const role = mem.way ? mem.way.role : roleOf(v.worn);
    for (const s of map.sinks) {
      if (s.verb !== 'shop_buy' || s.listed !== true || tried(mem, 'buy:' + s.id) || mem.bought.has(s.id)) continue;
      if (v.gold - s.gold < PACE.keepGold) continue;
      const item = s.grants && s.grants[0];
      const it = item && ITEMS[item];
      if (!it || owned(v, item) > 0 || Object.values(v.worn).includes(item)) continue;
      const tool = it.type === 'tool' && it.toolSkill;
      const seed = !!it.seed;
      const gear = it.slot && wornByRole(item, role) && (Number(it.reqLv) || 0) <= v.level && !v.worn[it.slot === 'ring' ? 'ring1' : it.slot];
      if (tool || gear || (seed && (map.cropOfSeed.get(item) || {}).req <= (v.skills.farming || 1) && v.farm.some((p) => !p.crop))) {
        return { type: 'buy', offer: s.id, qty: 1, key: 'buy:' + s.id, why: tool ? 'a ' + it.n + ' for ' + it.toolSkill : gear ? 'nothing on ' + it.slot + ' yet' : 'a seed for an empty plot' };
      }
    }
    return null;
  } },

  { id: 'build', pick: ({ v, map, mem }) => {
    if (v.hunting) return null;
    for (const s of map.sinks) {
      if (s.verb !== 'unlock_buy' || !['property', 'plot', 'room'].includes(s.table) || mem.bought.has(s.id) || tried(mem, 'build:' + s.id)) continue;
      if (v.gold - s.gold < PACE.keepGold * 2) continue;
      if (!s.items.every((c) => owned(v, c.id) >= c.qty)) continue;
      return { type: 'unlock', offer: s.id, key: 'build:' + s.id, why: s.name + ': the purse and the bag can pay it' };
    }
    /* the server's own next buys, at the server's price: a storage chest, the next hero, the land's next tier */
    const c = v.depotNext;
    if (c && c.can && v.gold - c.gold >= PACE.keepGold && Object.entries(c.items).every(([id, n]) => owned(v, id) >= n) && !tried(mem, 'chest:' + c.chest)) {
      return { type: 'chest', chest: c.chest, price: c.gold, key: 'chest:' + c.chest, why: 'the depot is full-ish and the ' + c.chest + ' is paid for' };
    }
    const h = v.heroSlot;
    if (h && v.gold - h.gold >= PACE.keepGold * 10 && !tried(mem, 'slot:' + h.slotId)) {
      return { type: 'slot', slotId: h.slotId, price: h.gold, key: 'slot:' + h.slotId, why: 'gold\'s first job is the next hero (the coach\'s own order, hunt-tutorial.js)' };
    }
    const f = v.farmUpgrade;
    if (f && v.gold - f.gold >= PACE.keepGold && v.deeds >= f.deeds && (v.skills.farming || 1) >= f.farming && !tried(mem, 'land:' + f.level)) {
      return { type: 'land', level: f.level, key: 'land:' + f.level, why: 'the land\'s tier ' + f.level + ' opens the next crops' };
    }
    return null;
  } },

  { id: 'craft', pick: ({ v, map, mem }) => {
    if (v.hunting || (mem.focus !== 'crafter' && mem.visitMin >= PACE.visitMin)) return null;
    const lv = (s) => v.skills[s] || 1;
    const want = wantedItems(v, map, mem);
    /* it turns held stock into what another skill uses (fish -> food, ore -> bars -> gear, logs -> planks, bones -> Inner Flame);
       never the stock a wanted build is waiting for */
    const spare = (id) => owned(v, id) - (want.get(id) || 0);
    const crafts = map.recipes.filter((r) => r.req <= lv(r.skill) && !tried(mem, 'work:' + r.id)
      && Object.entries(r.inputs).length && Object.entries(r.inputs).every(([id, n]) => spare(id) >= n * PACE.minBatches) && (!r.gated || owned(v, r.gated) > 0));
    /* the least-trained skill's highest recipe it can make, so every bench is trained */
    crafts.sort((a, b) => lv(a.skill) - lv(b.skill) || b.req - a.req);
    if (!crafts.length) return null;
    const r = crafts[0];
    const batches = Math.min(...Object.entries(r.inputs).map(([id, n]) => Math.floor(spare(id) / n)));
    const count = Math.min(batches, 100000);
    /* the bench stops at its count (2026-12-01-bench-count.sql): wait as long as the count takes, the visit's budget at most */
    const budget = mem.focus === 'crafter' ? PACE.workStretchMin : PACE.visitMin - mem.visitMin;
    const minutes = Math.min(budget, PACE.workStretchMin, Math.max(1, Math.ceil((count * pacedActionMs(r.ms)) / 60000) + 1));
    return { type: 'work', kind: 'artisan', id: r.id, skill: r.skill, count, minutes, key: 'work:' + r.id,
      why: 'back in town, the bag holds ' + batches + ' batches for ' + r.name };
  } },

  { id: 'stock', pick: ({ v, map, mem }) => {
    if (v.hunting || mem.focus === 'party' || (mem.focus !== 'crafter' && mem.visitMin >= PACE.visitMin)) return null;
    const lv = (s) => v.skills[s] || 1;
    /* a wanted build (the next house tier, the next chest) waits on something a node this hero can work makes: go and get it */
    const want = wantedItems(v, map, mem);
    if (mem.focus !== 'crafter' && v.gold < want.gold + PACE.keepGold) return null;
    for (const [id, need] of want) {
      const short = need - owned(v, id);
      if (short <= 0) continue;
      const n = map.nodes.find((x) => x.kind === 'gather' && x.prod === id && x.req <= lv(x.skill) && !tried(mem, 'work:' + x.id));
      if (!n) continue;
      const budget = mem.focus === 'crafter' ? PACE.workStretchMin : PACE.visitMin - mem.visitMin;
      return { type: 'work', kind: 'gather', id: n.id, skill: n.skill, minutes: Math.max(10, Math.min(budget, PACE.workStretchMin)), key: 'work:' + n.id,
        why: short + ' ' + id + ' short for a wanted build' };
    }
    return null;
  } },

  { id: 'hunt', pick: ({ v, map, mem }) => {
    if (v.hunting || v.staminaMin < PACE.minStaminaToHuntMin || mem.focus !== 'combat') return null;
    return pickGround({ levels: [v.level], size: 1, map, mem, staminaMin: v.staminaMin });
  } },

  { id: 'gather', pick: ({ v, map, mem }) => {
    if (v.hunting || mem.focus === 'party') return null;
    const lv = (s) => v.skills[s] || 1;
    /* the least-trained gathering skill, its best node (a hunt was not possible, or the stamina is out) */
    const nodes = map.nodes.filter((n) => n.kind === 'gather' && n.req <= lv(n.skill) && !tried(mem, 'work:' + n.id));
    nodes.sort((a, b) => lv(a.skill) - lv(b.skill) || b.req - a.req);
    if (!nodes.length) return null;
    const n = nodes[0];
    const minutes = v.staminaMin < PACE.minStaminaToHuntMin ? Math.max(PACE.workStretchMin, v.staminaCapMin - v.staminaMin) : PACE.workStretchMin;
    return { type: 'work', kind: 'gather', id: n.id, skill: n.skill, minutes: Math.min(minutes, 240), key: 'work:' + n.id,
      why: (v.staminaMin < PACE.minStaminaToHuntMin ? 'stamina is low; ' : '') + n.skill + ' is the least trained gathering skill' };
  } },
];

/**
 * The next action, or null (a stall: the runner logs the hero's state with it).
 * @param {{v: object, map: object, mem: object}} ctx
 * @returns {{rule: string, type: string, why: string} | null}
 */
export function nextAction(ctx) {
  for (const r of RULES) {
    const a = r.pick(ctx);
    if (a) return { rule: r.id, ...a };
  }
  return null;
}

/**
 * Is a running hunt still what the player wants? False once the game's advice for this Level moved to a ground
 * with a higher floor (a sensible player walks on: "Right for your level" changed), so the stretch ends early.
 */
export function keepHunting({ v, map, levels = null, size = 1 }, action) {
  const advised = recommendedHunt(levels || v.level, size);
  const here = map.grounds.find((g) => g.id === action.ground);
  const there = advised && map.grounds.find((g) => g.hunt === advised.hunt);
  return !(here && there && there.band[0] > here.band[0]);
}

/** The rule ids in order (the report names them; a test pins that each answers on its own fixture). */
export const RULE_IDS = Object.freeze(RULES.map((r) => r.id));

/** A fresh memory for one hero. `way`: { id, role, keepsWeapon(id) } (one per way to fight, run.mjs); `focus`: 'combat' (hunts, and
    turns its loot into goods between hunts) or 'crafter' (never hunts: gathers and works the benches, as a player's second hero does). */
export function newMemory(way = null, focus = 'combat') {
  return { hour: 0, visitMin: 0, way, focus, refused: new Set(), cooldown: new Map(), visited: new Set(), held: new Map(), bought: new Set(), locked: new Set(), wanted: new Set() };
}
