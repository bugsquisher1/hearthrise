// ════════════════════════════════════════════════════════════════════════
// tools/qa/coverage/map.mjs — EVERYTHING THE COVERAGE BOT MUST REACH, READ FROM THE DATA.
//
// PURE. No world, no clock. One call, coverageMap(), lists every skill, hunting ground and tier,
// gathering node and crop, recipe, item (with its doors and uses on paper), bestiary entry and
// gold sink or purchase the game's data modules hold today. Nothing here is typed by hand: a new
// ground in src/data/hunt-grounds.js, a recipe in recipes.js or an offer in shops.js is a new
// row in this map with no edit (the ground pack lane's next ground is picked up as it lands).
//
// What "on paper" means: src/data/catalogue-coherence.js already proves every item has a door and
// a use in the DATA. The bot proves it in PLAY; this map carries the paper verdict beside each row
// (`paper`), so the report can say "the data has a door here, and play never walked through it"
// apart from "the data itself has no open door" (UNREACHABLE's planned fates).
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from '../../../src/data/skills.js';
import { ARTISAN_RECIPES } from '../../../src/data/recipes.js';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from '../../../src/data/gathering.js';
import { ITEMS } from '../../../src/data/items.js';
import { OPEN_GROUNDS } from '../../../src/data/hunt-grounds.js';
import { HUNT_INDEX } from '../../../src/data/hunts.js';
import { tiersOf } from '../../../src/data/hunt-tiers.js';
import { MONSTERS } from '../../../src/data/monsters.js';
import { SHOP_OFFERS } from '../../../src/data/shops.js';
import { SHOP_LISTED_OFFER_IDS } from '../../../src/data/supply-basics.js';
import { TEMPER_OFFERS } from '../../../src/data/temper.js';
import { HALLMARK_OFFERS, recipeOutcomes } from '../../../src/data/jewelry.js';
import { SINK_RULES } from '../../../src/data/gold-sinks.js';
import { STORAGE_CHESTS } from '../../../src/data/homestead-tiers.js';
import { BLESSING_TIERS } from '../../../src/data/blessings.js';
import { TITLES } from '../../../src/data/titles.js';
import { BOSS_CALLS } from '../../../src/data/boss-calls.js';
import { TOWN_WORKS } from '../../../src/data/town-works.js';
import { TROPHY_STAGES } from '../../../src/data/bestiary.js';
import { NAMED_FUELS } from '../../../src/data/hearth.js';
import { itemSources, itemUses, reachableSources, recipeInputs, UNREACHABLE } from '../../../src/data/catalogue-coherence.js';

/** The cap of a skill (the gather and artisan rows stop at 99; combat skills run on, Tyler 2026-10-14). */
export const capOf = (skillId) => (SKILLS_DEF[skillId] && SKILLS_DEF[skillId].cat === 'combat' ? null : 99);

/** The monsters a ground's packs and spawn list name (its bestiary entries). */
export function monstersOfGround(g) {
  const met = new Set();
  for (const p of g.pockets || []) for (const s of (p.pack || []).concat(p.spawns || [])) if (s && s.monster) met.add(s.monster);
  for (const s of (HUNT_INDEX[g.hunt] || {}).spawns || []) met.add(s.monster);
  return [...met].filter((id) => MONSTERS[id]);
}

/** The tag a not-reachable-on-paper item carries (catalogue-coherence's UNREACHABLE fate), or null. */
function paperFate(id) {
  for (const [fate, ids] of Object.entries(UNREACHABLE || {})) if (Array.isArray(ids) ? ids.includes(id) : ids && ids[id]) return fate;
  return null;
}

/**
 * The whole map. Every list is sorted by the order a player meets it (band floor, required level), so a report reads
 * as a route. @returns {{skills, nodes, recipes, grounds, monsters, items, sinks, counts}}
 */
export function coverageMap() {
  const sources = itemSources(), uses = itemUses(), reach = reachableSources();

  const skills = Object.entries(SKILLS_DEF).map(([id, s]) => ({ id, name: s.name, cat: s.cat, cap: capOf(id) }));

  const nodes = [];
  for (const [skill, list] of [['woodcutting', TREES], ['mining', ROCKS], ['fishing', FISH_SPOTS]]) {
    for (const n of list) nodes.push({ kind: 'gather', skill, id: n.id, name: n.name, req: n.req, prod: n.prod });
  }
  for (const [id, c] of Object.entries(CROPS)) nodes.push({ kind: 'crop', skill: 'farming', id, name: c.name, req: c.req || 1, prod: c.prod, seed: c.seed, hours: c.hours });

  const recipes = [];
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) {
    for (const r of list || []) {
      if (!r || !r.id) continue;
      recipes.push({ skill, id: r.id, name: r.name || r.id, req: r.req || 1, inputs: recipeInputs(r), outputs: r.output ? recipeOutcomes(r) : [], gated: r.gated || null, ms: r.ms || 0 });
    }
  }

  const grounds = Object.entries(OPEN_GROUNDS).map(([id, g]) => {
    const h = HUNT_INDEX[g.hunt] || {};
    return { id, hunt: g.hunt, name: h.name || id, band: (h.band || [1, 1]).slice(), groupFit: g.groupFit || 'both',
      party: (g.pockets || []).some((p) => p.minParty), tiers: tiersOf(id), monsters: monstersOfGround(g) };
  }).sort((a, b) => a.band[0] - b.band[0] || (a.id < b.id ? -1 : 1));

  const monsters = [...new Set(grounds.flatMap((g) => g.monsters))].map((id) => ({ id, name: MONSTERS[id].name || id, boss: MONSTERS[id].boss === true,
    grounds: grounds.filter((g) => g.monsters.includes(id)).map((g) => g.id) }));

  const items = Object.keys(ITEMS).sort().map((id) => ({ id, name: ITEMS[id].n || id, type: ITEMS[id].type || null,
    sources: sources.get(id) || [], uses: uses.get(id) || [], paper: reach.get(id) || null, fate: reach.has(id) ? null : paperFate(id) }));

  /* EVERY WAY GOLD LEAVES BY CHOICE, each with the verb that buys it. A row's `verb` is what hands.mjs sends. */
  const sinks = [];
  for (const o of SHOP_OFFERS) {
    if (!o || !o.id) continue;
    const gold = (o.cost || []).filter((c) => c.kind === 'currency' && c.id === 'gold').reduce((s, c) => s + c.amount, 0);
    const items = (o.cost || []).filter((c) => c.kind === 'item').map((c) => ({ id: c.id, qty: c.amount }));
    const verb = o.table === 'supply' || o.table === 'seed' || o.table === 'equip' ? 'shop_buy' : o.table === 'character_slot' ? 'hr_buy_hero_slot' : 'unlock_buy';
    const grants = (o.grant || []).filter((g) => g && g.kind === 'item').map((g) => g.id);
    sinks.push({ id: o.id, table: o.table, name: o.name || o.id, gold, items, grants, verb, listed: o.table === 'supply' ? SHOP_LISTED_OFFER_IDS.has(o.id) : null });
  }
  for (const o of TEMPER_OFFERS) sinks.push({ id: o.offer_id, table: 'temper', name: o.name, gold: o.gold, items: Object.entries(o.items).map(([id, qty]) => ({ id, qty })), verb: 'unlock_buy' });
  for (const o of HALLMARK_OFFERS) sinks.push({ id: 'hallmark.' + o.from, table: 'hallmark', name: 'Hallmark ' + o.from, gold: o.gold || 0, items: [{ id: o.from, qty: 1 }, { id: o.gem, qty: 1 }], verb: 'hr_hallmark' });
  for (const c of STORAGE_CHESTS) {
    const cost = c.cost || {};
    sinks.push({ id: 'chest.' + c.id, table: 'storage_chest', name: c.name || c.id, gold: cost.gold || 0, verb: 'hr_storage_chest_build',
      items: Object.entries(cost).filter(([k]) => k !== 'gold').map(([id, qty]) => ({ id, qty })) });
  }
  for (const b of BLESSING_TIERS) sinks.push({ id: 'blessing.' + b.tier, table: 'blessing', name: 'Blessing ' + b.tier, gold: null, items: [], verb: 'hr_blessing_buy' });
  for (const [id, t] of Object.entries(TITLES)) sinks.push({ id: 'title.' + id, table: 'title', name: t.name, gold: t.price, items: [], verb: 'hr_title_buy', kills: t.kills, monsters: t.monsters });
  for (const [id, b] of Object.entries(BOSS_CALLS)) sinks.push({ id: 'boss_call.' + id, table: 'boss_call', name: 'Call out ' + b.boss, gold: b.fee, items: [], verb: 'hr_boss_call', from: b.from });
  for (const id of Object.keys(TOWN_WORKS)) sinks.push({ id: 'town_works.' + id, table: 'town_works', name: TOWN_WORKS[id].name, gold: TOWN_WORKS[id].minGift, items: [], verb: 'hr_town_works_give' });
  for (const [kind, r] of Object.entries(SINK_RULES)) sinks.push({ id: 'sink.' + kind, table: 'sink', name: kind, gold: (r.prices || [r.priceBase || 0])[0], items: [], verb: 'hr_' + kind });
  sinks.push({ id: 'stamina_refill', table: 'stamina', name: 'Stamina refill', gold: null, items: [], verb: 'hr_stamina_refill' });
  for (const s of TROPHY_STAGES) sinks.push({ id: 'bestiary.' + s.id, table: 'bestiary', name: 'Bestiary stage ' + s.stage + ' (' + s.at + ' kills)', gold: null, items: [], verb: 'hr_bestiary_activate', kills: s.at });
  for (const id of Object.keys(NAMED_FUELS)) sinks.push({ id: 'hearth.' + id, table: 'hearth', name: 'Burn ' + id, gold: 0, items: [{ id, qty: 1 }], verb: 'hr_hearth_burn' });

  const map = { skills, nodes, recipes, grounds, monsters, items, sinks };
  map.counts = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.length]));
  /* lookups the brain reads (not part of the report's JSON) */
  Object.defineProperty(map, 'itemIndex', { value: new Map(items.map((i) => [i.id, i])) });
  Object.defineProperty(map, 'cropOfSeed', { value: new Map(nodes.filter((n) => n.kind === 'crop').map((n) => [n.seed, n])) });
  return map;
}
