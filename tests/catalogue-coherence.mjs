#!/usr/bin/env node
// ============================================================
// tests/catalogue-coherence.mjs — EVERY ITEM HAS A SOURCE AND A USE, EVERY SKILL
// HAS A CONSUMER (W0.4, coherence audit 2026-10-10).
//
//   node tests/catalogue-coherence.mjs            the guard
//   node tests/catalogue-coherence.mjs --mutate   mutation proof (every arm bites)
//
// WHY. The audit found 40 catalogued items no player could ever obtain (rows
// authored ahead of engines that never landed), a Rally Seal nothing spent,
// and a Collection Log that counted all of them so 100% was impossible. They
// were cut in W0. This guard keeps the class closed as content grows 10x:
//
//   C1  every ITEMS id has at least one SOURCE (src/data/catalogue-coherence.js
//       itemSources — drops, gathering, recipes, shops, quests, dungeons, the
//       start kit, hearthfinds, and a short list of engine-coded grants);
//   C2  every ITEMS id has at least one USE (spent, worn, eaten, planted,
//       redeemed, opens something, or named vendor trash);
//   C3  every effect kind an item declares is LIVE (item-effects.js);
//   C4  every SKILLS_DEF skill has a CONSUMER — something uses what it makes,
//       or (combat) an engine reads its level;
//   C5  every engine-coded source/use/consumer row still points at code that
//       names it (a row cannot outlive the code it describes);
//   C6  the Local Shop sells STARTER gear only (no tier >= 2 equippable for gold
//       — top-10 #2: the first upgrade a player wears is one they made);
//   C7  the Collection Log's denominator is obtainableItemIds(), and that set is
//       the whole catalogue.
//
// THE PENDING LIST is shrink-only. It names the few gaps the audit assigned to
// OTHER W0 lanes, with the lane. An id that gains a use must be removed from it
// (a stale row fails), and no id may be added without a lane to own it.
//
// Exit 0 clean, 1 on any violation, 2 harness error.
// ============================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  itemSources, itemUses, skillConsumers, deadEffectKinds, obtainableItemIds,
  CODED_SOURCES, CODED_USES, ENGINE_SKILL_CONSUMERS,
  // The SAME data identities the module reads (see its re-export note).
  ITEMS, SKILLS_DEF, SHOP_OFFERS, ARTISAN_RECIPES, MONSTERS,
} from '../src/data/catalogue-coherence.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const realRead = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* Gaps the audit handed to another W0 lane. SHRINK-ONLY: see the header. */
export const PENDING_USE = Object.freeze({
  void_essence:     'w0f — boss materials craft the best gear',
  riftmaw_husk:     'w0f — boss materials craft the best gear',
  elderscale_heart: 'w0f — boss materials craft the best gear',
  warboss_standard: 'w0f — boss trophies hang in the trophy room',
  lexarch_seal:     'w0f — boss trophies hang in the trophy room',
  voidwoven_sigil:  'w0f — boss trophies hang in the trophy room',
  dragon_relic:     'w0f — boss trophies hang in the trophy room',
});
export const PENDING_CONSUMER = Object.freeze({
  prayer: 'w0e — Prayer does something in a fight (audit top-10 #8)',
});

const EQUIP_TYPES = { weapon: 1, armor: 1, jewelry: 1, ammo: 1 };

export function check({ read = realRead } = {}) {
  const fails = [];
  const ids = Object.keys(ITEMS);
  const src = itemSources();
  const uses = itemUses();

  // C1 / C2
  const noSource = ids.filter((id) => !src.has(id));
  if (noSource.length) fails.push(`C1 ${noSource.length} item(s) with NO SOURCE (no drop, node, recipe, shop, reward or coded grant): ${noSource.join(', ')}`);
  const noUse = ids.filter((id) => !uses.has(id) && !PENDING_USE[id]);
  if (noUse.length) fails.push(`C2 ${noUse.length} item(s) with NO USE (nothing spends, wears, eats, plants or redeems them): ${noUse.join(', ')}`);
  const staleUse = Object.keys(PENDING_USE).filter((id) => !ITEMS[id] || uses.has(id));
  if (staleUse.length) fails.push(`C2 stale PENDING_USE row(s) — the gap is closed, delete the row: ${staleUse.join(', ')}`);

  // C3
  const dead = deadEffectKinds();
  if (dead.length) fails.push(`C3 item(s) declare an effect no engine reads: ${dead.join(', ')}`);

  // C4
  const consumers = skillConsumers();
  const noConsumer = Object.keys(SKILLS_DEF).filter((s) => !consumers.has(s) && !PENDING_CONSUMER[s]);
  if (noConsumer.length) fails.push(`C4 skill(s) with NO CONSUMER (nothing uses what they make): ${noConsumer.join(', ')}`);
  const staleSkill = Object.keys(PENDING_CONSUMER).filter((s) => !SKILLS_DEF[s] || consumers.has(s));
  if (staleSkill.length) fails.push(`C4 stale PENDING_CONSUMER row(s) — delete the row: ${staleSkill.join(', ')}`);

  // C5 — every coded row is still true of its file.
  const coded = [
    ...Object.entries(CODED_SOURCES).map(([id, r]) => ['source', id, r]),
    ...Object.entries(CODED_USES).map(([id, r]) => ['use', id, r]),
    ...Object.entries(ENGINE_SKILL_CONSUMERS).map(([id, r]) => ['consumer', id, r]),
  ];
  for (const [kind, id, r] of coded) {
    let text = '';
    try { text = read(r.file); } catch (e) { fails.push(`C5 coded ${kind} ${id}: ${r.file} is unreadable (${e.message})`); continue; }
    if (text.indexOf(r.needle) < 0) fails.push(`C5 coded ${kind} ${id}: ${r.file} no longer contains ${JSON.stringify(r.needle)} — the row describes code that is gone`);
    if (kind !== 'consumer' && !ITEMS[id]) fails.push(`C5 coded ${kind} ${id}: not an item`);
    if (kind === 'consumer' && !SKILLS_DEF[id]) fails.push(`C5 coded consumer ${id}: not a skill`);
  }

  // C6 — the Local Shop is a starter counter.
  const loud = [];
  for (const o of SHOP_OFFERS) {
    if (!o || o.table !== 'equip') continue;
    for (const g of o.grant || []) {
      const it = ITEMS[g.id] || {};
      if (EQUIP_TYPES[it.type] && Number(it.tier) >= 2) loud.push(`${o.id} (tier ${it.tier})`);
      if (EQUIP_TYPES[it.type] && Number(it.reqLv) > 1 && it.type !== 'companion') loud.push(`${o.id} (req ${it.reqSkill} ${it.reqLv})`);
    }
  }
  if (loud.length) fails.push(`C6 the Local Shop sells past-starter gear, undercutting Smithing/Crafting: ${loud.join(', ')}`);

  // C7 — the Collection Log counts what can be got, and that is everything.
  const ob = obtainableItemIds();
  if (ob.size !== ids.length) fails.push(`C7 obtainableItemIds() has ${ob.size} of ${ids.length} items — the Collection Log would be unfinishable`);
  const log = read('src/features/collection-log.js');
  if (!/HearthriseCatalogue/.test(log) || !/obtainable/.test(log)) {
    fails.push('C7 src/features/collection-log.js no longer reads HearthriseCatalogue.obtainable — it is counting raw ITEMS again');
  }
  const main = read('src/main.js');
  if (!/HearthriseCatalogue/.test(main)) fails.push('C7 src/main.js no longer publishes window.HearthriseCatalogue');

  return { fails, counts: { items: ids.length, skills: Object.keys(SKILLS_DEF).length, pendingUse: Object.keys(PENDING_USE).length, pendingConsumer: Object.keys(PENDING_CONSUMER).length } };
}

/* ── THE MUTATION PROOF ──────────────────────────────────────────────────────
   Every arm is driven red by a planted defect on the LIVE data objects (the
   same identities the module reads), then the plant is removed. A control run
   first proves the tree is clean, so a red mutant measures the plant alone. */
function mutate() {
  const results = [];
  const run = (name, arm, plant) => {
    let undo;
    try {
      undo = plant();
      const r = check(undo && undo.read ? { read: undo.read } : {});
      const hit = r.fails.some((f) => f.startsWith(arm));
      results.push([name, hit]);
    } finally { if (undo && undo.restore) undo.restore(); }
  };
  const control = check();
  if (control.fails.length) { console.error('MUTATE CONTROL: the tree is not clean:\n  ' + control.fails.join('\n  ')); process.exit(2); }

  run('an item with no source', 'C1', () => {
    ITEMS.__mut_orphan = { n: 'Orphan', v: 1, type: 'weapon', slot: 'weapon' };
    return { restore: () => { delete ITEMS.__mut_orphan; } };
  });
  run('a dropped item with no use', 'C2', () => {
    ITEMS.__mut_drop = { n: 'Dead Drop', v: 1 };
    MONSTERS.slime.drops.push({ id: '__mut_drop', ch: 0.1 });
    return { restore: () => { MONSTERS.slime.drops.pop(); delete ITEMS.__mut_drop; } };
  });
  run('an item loses its only use', 'C2', () => {
    const saved = {};
    for (const skill of Object.keys(ARTISAN_RECIPES)) {
      saved[skill] = ARTISAN_RECIPES[skill];
      ARTISAN_RECIPES[skill] = saved[skill].filter((r) => {
        const inp = Object.assign({}, r.inputs || {}, r.secondary || {});
        if (r.input) inp[r.input] = 1;
        return !('rat_tail' in inp);
      });
    }
    return { restore: () => { Object.assign(ARTISAN_RECIPES, saved); } };
  });
  run('a stale PENDING_USE row', 'C2', () => {
    const it = ITEMS.void_essence; const was = it.heals;
    it.heals = 1;
    return { restore: () => { if (was === undefined) delete it.heals; else it.heals = was; } };
  });
  run('an item declares a dormant effect', 'C3', () => {
    const it = ITEMS.bronze_sword; const was = it.effects;
    it.effects = ['queue_slot'];
    return { restore: () => { if (was === undefined) delete it.effects; else it.effects = was; } };
  });
  run('a skill nothing consumes', 'C4', () => {
    SKILLS_DEF.__mut_skill = { name: 'Idle Hands', cat: 'artisan' };
    return { restore: () => { delete SKILLS_DEF.__mut_skill; } };
  });
  run('a coded source whose code is gone', 'C5', () => ({
    read: (rel) => (rel === 'src/core/artisan.js' ? realRead(rel).split("BURNT_ITEM = 'burnt_food'").join('BURNT = 0') : realRead(rel)),
  }));
  run('the shop sells Iron again', 'C6', () => {
    SHOP_OFFERS.push({ id: 'equip.iron_platebody', table: 'equip', cost: [{ kind: 'currency', id: 'gold', amount: 800 }],
      grant: [{ kind: 'item', id: 'iron_platebody', amount: 1 }], repeatable: true });
    return { restore: () => { SHOP_OFFERS.pop(); } };
  });
  run('the Collection Log counts raw ITEMS', 'C7', () => ({
    read: (rel) => (rel === 'src/features/collection-log.js' ? realRead(rel).split('HearthriseCatalogue').join('ITEMS_ALL') : realRead(rel)),
  }));

  let bad = 0;
  for (const [name, hit] of results) {
    console.log(`  ${hit ? 'CAUGHT ' : 'MISSED '} ${name}`);
    if (!hit) bad++;
  }
  // The plants are gone: the tree is clean again.
  const after = check();
  if (after.fails.length) { console.error('MUTATE: a plant leaked into the tree:\n  ' + after.fails.join('\n  ')); process.exit(2); }
  console.log(`catalogue-coherence --mutate: ${results.length} mutants, ${bad} missed`);
  process.exit(bad ? 1 : 0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]);
if (isMain) {
  try {
    if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) mutate();
    const { fails, counts } = check();
    if (fails.length) {
      console.error('catalogue-coherence: RED');
      fails.forEach((f) => console.error('  ✗ ' + f));
      process.exit(1);
    }
    console.log(`catalogue-coherence: OK — ${counts.items} items each with a source and a use, `
      + `${counts.skills} skills each with a consumer, the shop sells starter gear only, `
      + `the Collection Log counts the obtainable catalogue (pending: ${counts.pendingUse} item uses, `
      + `${counts.pendingConsumer} skill consumer, owned by other W0 lanes)`);
  } catch (e) {
    console.error('catalogue-coherence: HARNESS ERROR — ' + (e && e.stack || e));
    process.exit(2);
  }
}
