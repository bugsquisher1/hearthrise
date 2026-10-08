#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/content-holes.mjs — THE CONTENT-HOLE CLASSES CANNOT COME BACK.
//
// The 2026-10-08 content audit (game-designer, lane/content-holes) found seven
// classes of hole, every one a DATA shape a single guard can see:
//
//   CH-1  an item with no source at all ("catalogued, not obtainable") that is
//         not a declared hatch (src/data/item-effects.js isItemDormant);
//   CH-2  the inverse: a dormant (hatched) item that HAS a source — an object
//         that lies about itself;
//   CH-3  an equip slot with no item at some gear tier (the offhand slot had
//         none at all; tier 3 capes went empty when the Bulwark moved);
//   CH-4  a gear ladder rung whose live recipe sits off its own curve
//         (Rune Sword at 75 on the Emberforged rung, Iron Warhammer at 35);
//   CH-5  a drop-only crafting material nothing consumes (the raid mats), a
//         boss whose signature is not in its own dungeon's loot (the Crypt), a
//         hatch-source companion whose source item does not exist (Whelp);
//   CH-6  a starting kit or early quest that hands out seeds the player cannot
//         plant yet, or seeds plot rows the server's camp cap refuses;
//   CH-7  a dead stretch: a skill ladder with a gap of more than MAX_GAP levels
//         between unlocks (Farming 88→99, Prayer 15→35, Runecrafting 45→60…).
//
//   node tests/content-holes.mjs            gate
//   node tests/content-holes.mjs --selftest mutation proof (each class bites)
//
// Pure data, no database, no network, milliseconds. NO ?v= on the imports
// (this is tests/**, b332).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';
import { ITEMS } from '../src/data/items.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { MONSTERS } from '../src/data/monsters.js';
import { DUNGEONS, QM_STOCK } from '../src/data/dungeons.js';
import { BOSSES } from '../src/data/bosses.js';
import { RAID_BOSSES } from '../src/data/raid-bosses.js';
import { SHOP_OFFERS } from '../src/data/shops.js';
import { HEARTHFIND_TABLE } from '../src/data/hearthfind.js';
import { TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOTS, expandItemSlot } from '../src/data/gathering.js';
import { SKILLS_DEF } from '../src/data/skills.js';
import { COMPANIONS } from '../src/data/companions.js';
import { START_CURRENCY, START_INVENTORY } from '../src/data/start-kit.js';
import { QUEST_REWARDS } from '../src/data/goal-catalogue.js';
import { GEAR_LADDERS, MATERIAL_TIERS } from '../src/data/gear-tiers.js';
import { isItemDormant } from '../src/data/item-effects.js';
import { BURNT_ITEM } from '../src/core/artisan.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

/* The rung each gear tier opens at (MATERIAL_TIERS.smith) — the ladder every
   equippable without a `tier` is placed on by its own reqLv. */
const RUNGS = MATERIAL_TIERS.map((m) => m.smith);
const tierOf = (it) => (it.tier ? Math.min(7, it.tier) : 0) || (Number.isFinite(it.reqLv)
  ? RUNGS.reduce((t, lv, i) => (it.reqLv >= lv ? i + 1 : t), 1) : 0);

/* Slots that must hold an item at every one of the seven gear tiers.
   `companion` is a pet pointer and `ring2` is ring1's twin. Jewellery runs its
   own ~16-level cadence (slot-ladders.js), so it is held to CONTINUITY instead:
   no gap wider than JEWEL_GAP between consecutive wield levels. */
const JEWEL_SLOTS = ['necklace', 'earrings', 'ring1'];
const JEWEL_GAP = 20;
const TIERED_SLOTS = EQUIP_SLOTS.filter((s) => s !== 'companion' && s !== 'ring2' && !JEWEL_SLOTS.includes(s));
const MAX_GAP = 13;                         // CH-7 — the widest stretch with nothing new
const TOP_RUNG = 90;                        // CH-7 — and something new in the last ten levels
const GAP_SKILLS = ['farming', 'prayer', 'runecrafting', 'stonemason', 'smithing', 'crafting', 'cooking'];
const CURVE_SLACK = 5;                      // CH-4 — a hand row may sit this close to the curve
const EARLY_QUEST_FARMING = { farmhand: 10, first_blood: 1 };   // CH-6 — the level the quest is met at

function recipeList(R) {
  const out = [];
  for (const [skill, list] of Object.entries(R)) for (const r of list || []) out.push({ skill, r });
  return out;
}
const inputsOf = (r) => {
  if (r.inputs) return r.inputs;
  const i = {}; if (r.input) i[r.input] = r.inputQty || 1;
  if (r.secondary) Object.assign(i, r.secondary);
  return i;
};

/** Every id that enters the world, and how. */
function sources(d) {
  const src = new Map();
  const add = (id, why) => { if (id) { if (!src.has(id)) src.set(id, []); src.get(id).push(why); } };
  d.TREES.forEach((n) => add(n.prod, 'wc')); d.ROCKS.forEach((n) => add(n.prod, 'mine'));
  d.FISH_SPOTS.forEach((n) => add(n.prod, 'fish'));
  Object.entries(d.CROPS).forEach(([k, c]) => { add(k, 'crop'); add(c.prod, 'crop'); });
  Object.entries(d.MONSTERS).forEach(([m, mm]) => (mm.drops || []).forEach((x) => add(x.id, 'drop:' + m)));
  Object.entries(d.DUNGEONS).forEach(([k, dg]) => (dg.loot || []).forEach((l) => add(l.id, 'dungeon:' + k)));
  d.QM_STOCK.forEach((q) => add(q.id, 'quartermaster'));
  d.SHOP_OFFERS.forEach((o) => (o.grant || []).forEach((g) => { if (g.kind === 'item') add(g.id, 'shop'); }));
  d.HEARTHFIND_TABLE.forEach((r) => add(r.item, 'hearthfind'));
  d.RAID_BOSSES.forEach((b) => { add(b.sig, 'raid'); Object.keys((b.reward && b.reward.items) || {}).forEach((i) => add(i, 'raid')); });
  Object.values(d.QUEST_REWARDS).forEach((q) => Object.keys(q.items || {}).forEach((i) => add(i, 'quest')));
  Object.keys(d.START_INVENTORY).forEach((i) => add(i, 'start-kit'));
  add(BURNT_ITEM, 'cooking-burn');
  recipeList(d.ARTISAN_RECIPES).forEach(({ skill, r }) => add(r.output, 'recipe:' + skill));
  return src;
}

const exempt = (it) => it.rarity === 'currency' || it.tag === 'currency' || it.premium || it.type === 'companion';

export function check(d) {
  const P = [];
  const add = (id, msg) => P.push(id + ' ' + msg);
  const src = sources(d);

  // CH-1 / CH-2
  for (const [id, it] of Object.entries(d.ITEMS)) {
    if (exempt(it)) continue;
    const dormant = isItemDormant(it, d.SKILLS_DEF);
    const has = src.has(id);
    /* `retired: true` — an id kept as a save key with no source left on purpose
       (never delete an id a player may own). It must STAY sourceless. */
    if (it.retired) { if (has) add('CH-2', `"${id}" is retired but enters the world via ${src.get(id).join(', ')}`); continue; }
    if (!has && !dormant) add('CH-1', `"${id}" has no source (drop, recipe, shop, dungeon, quest, gather) and is not a declared hatch`);
    if (has && dormant) add('CH-2', `"${id}" is a dormant hatch item but enters the world via ${src.get(id).join(', ')}`);
  }

  // CH-3 — every tiered slot holds an obtainable item at every tier.
  const have = {}, levels = {};
  for (const [id, it] of Object.entries(d.ITEMS)) {
    if (!it.slot || !src.has(id) || isItemDormant(it, d.SKILLS_DEF)) continue;
    const t = tierOf(it);
    expandItemSlot(it.slot).forEach((s) => {
      (have[s] = have[s] || new Set()).add(t);
      (levels[s] = levels[s] || new Set()).add(it.reqLv || 1);
    });
  }
  for (const s of JEWEL_SLOTS) {
    const lv = [...(levels[s] || [])].sort((a, b) => a - b); lv.push(99);
    if (lv[0] !== 1) add('CH-3', `slot "${s}" has nothing wearable at level 1`);
    for (let i = 1; i < lv.length; i++) {
      if (lv[i] - lv[i - 1] > JEWEL_GAP) add('CH-3', `slot "${s}" has nothing new from level ${lv[i - 1]} to ${lv[i]}`);
    }
  }
  for (const s of TIERED_SLOTS) {
    for (let t = 1; t <= 7; t++) {
      if (!(have[s] && have[s].has(t))) add('CH-3', `slot "${s}" has no obtainable item at tier ${t}`);
    }
  }

  // CH-4 — every generated ladder rung's live recipe sits on its curve.
  const live = {};
  recipeList(d.ARTISAN_RECIPES).forEach(({ r }) => {
    if (r.output && !r.gated && (!live[r.output] || r.req < live[r.output].req)) live[r.output] = r;
  });
  for (const lane of d.GEAR_LADDERS) {
    for (const rung of lane.rungs) {
      const r = live[rung.itemId];
      if (!r) { add('CH-4', `${lane.key} t${rung.tier} → ${rung.itemId} has no recipe`); continue; }
      if (Math.abs(r.req - rung.curveReq) > CURVE_SLACK) {
        add('CH-4', `${rung.itemId} forges at ${r.req} via ${r.id}, its ladder curve says ${rung.curveReq}`);
      }
    }
  }

  // CH-5 — loot that means something.
  const consumed = new Set();
  recipeList(d.ARTISAN_RECIPES).forEach(({ r }) => Object.keys(inputsOf(r)).forEach((i) => consumed.add(i)));
  for (const [k, dg] of Object.entries(d.DUNGEONS)) {
    for (const l of dg.loot || []) {
      const it = d.ITEMS[l.id];
      if (it && it.tag === 'crafting-mat' && !consumed.has(l.id)) add('CH-5', `${k} drops crafting mat "${l.id}" that no recipe consumes`);
    }
  }
  for (const b of Object.values(d.BOSSES)) {
    if (!b.dungeon) continue;
    const loot = new Set(((d.DUNGEONS[b.dungeon] || {}).loot || []).map((l) => l.id));
    if (!(b.signature || []).length) add('CH-5', `boss ${b.id} has no signature prize`);
    (b.signature || []).forEach((sid) => {
      if (!loot.has(sid)) add('CH-5', `boss ${b.id}'s signature "${sid}" is not in ${b.dungeon}'s loot`);
    });
  }
  for (const [cid, c] of Object.entries(d.COMPANIONS)) {
    const [kind, arg] = String(c.source || '').split(':');
    if (kind === 'hatch' && !(d.ITEMS[arg] && src.has(arg))) add('CH-5', `companion ${cid} hatches from "${arg}", which has no item row or no source`);
  }

  // CH-6 — the first hour's seeds are plantable, and the kit matches the camp.
  const seedReq = (id) => { const c = Object.values(d.CROPS).find((x) => x.seed === id); return c ? c.req : null; };
  Object.keys(d.START_INVENTORY).forEach((id) => {
    const r = seedReq(id);
    if (r !== null && r > 1) add('CH-6', `the start kit carries "${id}", which needs Farming ${r}`);
  });
  Object.entries(EARLY_QUEST_FARMING).forEach(([q, lv]) => {
    Object.keys(((d.QUEST_REWARDS[q] || {}).items) || {}).forEach((id) => {
      const r = seedReq(id);
      if (r !== null && r > lv) add('CH-6', `quest ${q} (met around Farming ${lv}) pays "${id}", which needs Farming ${r}`);
    });
  });
  if (d.START_CURRENCY.farmPlots !== d.campPlotCap) {
    add('CH-6', `the start kit seeds ${d.START_CURRENCY.farmPlots} farm plots; the server's camp cap is ${d.campPlotCap}`);
  }

  // CH-7 — dead stretches.
  const ladders = { farming: Object.values(d.CROPS).map((c) => c.req) };
  recipeList(d.ARTISAN_RECIPES).forEach(({ skill, r }) => { (ladders[skill] = ladders[skill] || []).push(r.req); });
  for (const sk of GAP_SKILLS) {
    const lv = [...new Set(ladders[sk] || [])].sort((a, b) => a - b);
    if (!lv.length || lv[lv.length - 1] < TOP_RUNG) add('CH-7', `${sk}'s last unlock is ${lv[lv.length - 1]}: nothing new from there to 99`);
    lv.push(99);
    for (let i = 1; i < lv.length; i++) {
      if (lv[i] - lv[i - 1] > MAX_GAP) add('CH-7', `${sk} has nothing new from ${lv[i - 1]} to ${lv[i]} (${lv[i] - lv[i - 1]} levels)`);
    }
  }
  return P;
}

/* The camp's plot cap, read from the server body that enforces it — the
   chain-end migration defining `v_plot_cap := (v_prop_tier + 1) * N`. */
function campPlotCap() {
  const order = JSON.parse(readFileSync(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  let n = null;
  for (const f of order) {
    let sql; try { sql = readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8'); } catch { continue; }
    const m = sql.match(/v_plot_cap\s*:=\s*\(v_prop_tier\s*\+\s*1\)\s*\*\s*(\d+)/);
    if (m) n = Number(m[1]);
  }
  if (n === null) throw new Error('CONTROL: no migration defines v_plot_cap — the anchor moved');
  return n;
}

const DATA = {
  ITEMS, ARTISAN_RECIPES, MONSTERS, DUNGEONS, QM_STOCK, BOSSES, RAID_BOSSES, SHOP_OFFERS,
  HEARTHFIND_TABLE, TREES, ROCKS, FISH_SPOTS, CROPS, SKILLS_DEF, COMPANIONS, START_CURRENCY,
  START_INVENTORY, QUEST_REWARDS, GEAR_LADDERS, campPlotCap: campPlotCap(),
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const MUTATIONS = [
  ['CH-1', 'an item loses its only source (Draconia stops dropping the Jaw)', (d) => {
    d.MONSTERS = clone(d.MONSTERS); d.MONSTERS.draconia.drops = d.MONSTERS.draconia.drops.filter((x) => x.id !== 'draconias_jaw'); }],
  ['CH-2', 'a dormant hatch item is given a drop', (d) => {
    d.MONSTERS = clone(d.MONSTERS); d.MONSTERS.slime.drops.push({ id: 'tithe_box', ch: 0.001 }); }],
  ['CH-3', 'the offhand slot loses its tier-4 shield', (d) => {
    d.ITEMS = { ...d.ITEMS }; delete d.ITEMS.mithril_kiteshield; }],
  ['CH-4', 'the Rune Sword forge goes back to 75', (d) => {
    d.ARTISAN_RECIPES = clone(d.ARTISAN_RECIPES); d.ARTISAN_RECIPES.smithing.find((r) => r.id === 'forge_rune_sword').req = 75; }],
  ['CH-5', 'the Riftmaw Aegis recipe is deleted (riftmaw_husk is vendor stock again)', (d) => {
    d.ARTISAN_RECIPES = clone(d.ARTISAN_RECIPES); d.ARTISAN_RECIPES.smithing = d.ARTISAN_RECIPES.smithing.filter((r) => r.id !== 'forge_riftmaw_aegis'); }],
  ['CH-5', 'the Crypt loses its maul', (d) => {
    d.DUNGEONS = clone(d.DUNGEONS); d.DUNGEONS.crypt_of_bones.loot = d.DUNGEONS.crypt_of_bones.loot.filter((l) => l.id !== 'marrowbone_maul'); }],
  ['CH-5', 'the dragon egg item is removed', (d) => {
    d.ITEMS = { ...d.ITEMS }; delete d.ITEMS.dragon_egg; }],
  ['CH-6', 'the start kit carries carrot seeds again', (d) => {
    d.START_INVENTORY = { ...d.START_INVENTORY, carrot_seed: 3 }; }],
  ['CH-6', 'farmhand pays wheat seeds again', (d) => {
    d.QUEST_REWARDS = clone(d.QUEST_REWARDS); d.QUEST_REWARDS.farmhand.items = { wheat_seed: 5 }; }],
  ['CH-6', 'the kit seeds four plots at a two-plot camp', (d) => {
    d.START_CURRENCY = { ...d.START_CURRENCY, farmPlots: 4 }; }],
  ['CH-7', 'Farming loses Dawnbloom (88 → 99 is dead again)', (d) => {
    d.CROPS = { ...d.CROPS }; delete d.CROPS.dawnbloom; }],
];

if (process.argv.includes('--selftest')) {
  const base = check(DATA);
  if (base.length) { console.error('SELFTEST: the real tree is not green:\n  ' + base.join('\n  ')); process.exit(1); }
  let missed = 0;
  for (const [code, name, mutate] of MUTATIONS) {
    const d = { ...DATA }; mutate(d);
    const got = check(d);
    const hit = got.some((p) => p.startsWith(code + ' '));
    console.log(`  ${hit ? 'caught' : 'MISSED'}  ${code}  ${name}`);
    if (!hit) missed++;
  }
  if (missed) { console.error(`SELFTEST FAILED: ${missed} mutation(s) not caught`); process.exit(1); }
  console.log(`SELFTEST PASS content-holes: all ${MUTATIONS.length} mutations caught by a named class.`);
} else {
  const p = check(DATA);
  if (p.length) { console.error('✗ content-holes: ' + p.length + ' hole(s)\n  ' + p.join('\n  ')); process.exit(1); }
  console.log(`✓ content-holes: ${Object.keys(ITEMS).length} items sourced or hatched, ${TIERED_SLOTS.length} slots × 7 tiers filled, `
    + `${GEAR_LADDERS.length} ladders on curve, no stretch over ${MAX_GAP} levels in ${GAP_SKILLS.length} skills.`);
}
