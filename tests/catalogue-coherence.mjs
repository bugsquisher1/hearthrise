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
//       the whole catalogue;
//   C8  armour climbs (2026-10-21: iron plate gave LESS max HP than bronze, its
//       hand-authored rows had no armourClass so vitals.js counted no armour):
//       C8a every armour row in an ARMOUR_SLOTS slot carries an armourClass with
//           an armour weight (core-model.js ARMOUR_WEIGHT);
//       C8b every rung of the crafted ladder (gear-tiers.js GEAR_ITEMS ids, the
//           hand-authored overrides included) keeps its line's class, and defB
//           never falls as the tier rises inside a (class, slot);
//       C8c a full set of tier t of a class gives at least the max HP, max mana
//           and defence of the tier t-1 set, at tier t's Level (vitals.js).
//       C8d a hand-authored rung keeps every field its generated rung carries
//           (the line's style fields: plate's rangeAtkB/magicAtkB penalty,
//           leather's rangeAtkB/critB) — its own values win, a dropped one fails.
//   C9  every source is one a player can REACH (designer 2026-10-22: 140 items dropped only
//       from monsters no open ground spawns, and C1 counted that as a source):
//       C9a every item with a source has a reachable one (reachableSources: open grounds,
//           the listed shop table, kit, gathering, quests, crafts from reachable inputs),
//           or a row in UNREACHABLE naming its fate;
//       C9b no stale row: each tagged id is in ITEMS, has a source, is not AWAITING_ROSTER,
//           is listed once, and is still out of reach;
//       C9c the fate tells the truth: a planned door's items are reached with every planned
//           door open and not without their own; a no-door fate's items are never reached;
//       C9d the rows outside `staged` stay under UNREACHABLE_CEILING, which only falls.
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
import { isMain as isEntryModule } from './_is-main.mjs';
import { GEAR_ITEMS } from '../src/data/gear-tiers.js';
import { ARMOUR_WEIGHT, ARMOUR_SLOTS } from '../src/data/core-model.js';
import { armourWeights, maxHpFor, maxManaFor } from '../src/core/vitals.js';
import {
  itemSources, itemUses, skillConsumers, deadEffectKinds, obtainableItemIds,
  CODED_SOURCES, CODED_USES, ENGINE_SKILL_CONSUMERS, AWAITING_ROSTER,
  reachableSources, plannedDoors, UNREACHABLE, UNREACHABLE_FATES, UNREACHABLE_CEILING,
  // The SAME data identities the module reads (see its re-export note).
  ITEMS, SKILLS_DEF, SHOP_OFFERS, ARTISAN_RECIPES, MONSTERS,
} from '../src/data/catalogue-coherence.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const realRead = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* Gaps the audit handed to another W0 lane. SHRINK-ONLY: see the header. */
export const PENDING_USE = Object.freeze({
  warboss_standard: 'w0f — boss trophies hang in the trophy room',
  lexarch_seal:     'w0f — boss trophies hang in the trophy room',
  voidwoven_sigil:  'w0f — boss trophies hang in the trophy room',
  dragon_relic:     'w0f — boss trophies hang in the trophy room',
});
export const PENDING_CONSUMER = Object.freeze({
  prayer: 'w0e — Prayer does something in a fight (audit top-10 #8)',
});

const EQUIP_TYPES = { weapon: 1, armor: 1, jewelry: 1, ammo: 1 };

export function check({ read = realRead, unreachable = UNREACHABLE } = {}) {
  const fails = [];
  const ids = Object.keys(ITEMS);
  const src = itemSources();
  const uses = itemUses();

  // C1 / C2
  /* AWAITING_ROSTER (src/data/catalogue-coherence.js): kept, sourceless until
     the new roster, exempt from C1/C2, shrink-only — a row that gained a
     source or left ITEMS is stale and fails here. */
  const awaiting = new Set(AWAITING_ROSTER);
  const staleAwait = AWAITING_ROSTER.filter((id) => !ITEMS[id] || src.has(id));
  if (staleAwait.length) fails.push(`C1 stale AWAITING_ROSTER row(s) — the id gained a source or left ITEMS, delete the row: ${staleAwait.join(', ')}`);
  const noSource = ids.filter((id) => !src.has(id) && !awaiting.has(id));
  if (noSource.length) fails.push(`C1 ${noSource.length} item(s) with NO SOURCE (no drop, node, recipe, shop, reward or coded grant): ${noSource.join(', ')}`);
  const noUse = ids.filter((id) => !uses.has(id) && !PENDING_USE[id] && !awaiting.has(id));
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
  if (ob.size + awaiting.size !== ids.length) fails.push(`C7 obtainableItemIds() has ${ob.size} of ${ids.length} items (${awaiting.size} awaiting the roster) — the Collection Log would be unfinishable`);
  // C8 — armour climbs.
  fails.push(...armourLadderFails());
  // C9 — a source a player can reach.
  const far = reachFails({ src, awaiting, unreachable });
  fails.push(...far.fails);
  return { fails, counts: { items: ids.length, skills: Object.keys(SKILLS_DEF).length, pendingUse: Object.keys(PENDING_USE).length, pendingConsumer: Object.keys(PENDING_CONSUMER).length, awaiting: AWAITING_ROSTER.length, ...far.counts } };
}

/* C9. Every source a player can walk through, and every out-of-reach item tagged with the door that will
   source it, the tag proved by opening that door. */
export function reachFails({ src = itemSources(), awaiting = new Set(AWAITING_ROSTER), unreachable = UNREACHABLE } = {}) {
  const out = [];
  const reach = reachableSources();
  const fateOf = new Map();
  const dupes = [];
  for (const [fate, list] of Object.entries(unreachable)) {
    if (!UNREACHABLE_FATES[fate]) out.push(`C9c unknown fate ${JSON.stringify(fate)} (fates: ${Object.keys(UNREACHABLE_FATES).join(', ')})`);
    for (const id of list) { if (fateOf.has(id)) dupes.push(id); fateOf.set(id, fate); }
  }
  if (dupes.length) out.push(`C9b id(s) tagged twice: ${dupes.join(', ')}`);
  const lies = Object.keys(ITEMS).filter((id) => src.has(id) && !reach.has(id) && !awaiting.has(id) && !fateOf.has(id));
  if (lies.length) out.push(`C9a ${lies.length} item(s) whose every source is out of a player's reach (a monster no open ground spawns, a shop table the Shop does not list, a craft from such an input) — give one a reachable source or tag its fate in UNREACHABLE: ${lies.join(', ')}`);
  const stale = [...fateOf.keys()].filter((id) => !ITEMS[id] || !src.has(id) || awaiting.has(id) || reach.has(id));
  if (stale.length) out.push(`C9b stale UNREACHABLE row(s) — the id is reachable now, has no source (C1's AWAITING_ROSTER) or left ITEMS; delete the row and lower the ceiling: ${stale.join(', ')}`);
  const all = reachableSources(plannedDoors());
  const without = {};
  for (const [id, fate] of fateOf) {
    const f = UNREACHABLE_FATES[fate];
    if (!f || reach.has(id)) continue;
    if (f.open) {
      without[fate] ||= reachableSources(plannedDoors(fate));
      if (!all.has(id)) out.push(`C9c ${id} is tagged ${fate} but opening every planned door does not reach it`);
      else if (without[fate].has(id)) out.push(`C9c ${id} is tagged ${fate} but another door reaches it (${without[fate].get(id)}): tag that door`);
    } else if (all.has(id)) out.push(`C9c ${id} is tagged ${fate} (no door) but a planned door reaches it (${all.get(id)}): tag that door`);
  }
  const held = [...fateOf.values()].filter((f) => f !== 'staged').length;
  if (held > UNREACHABLE_CEILING) out.push(`C9d ${held} out-of-reach rows outside \`staged\`, over the ceiling ${UNREACHABLE_CEILING}: the list only shrinks — source the item instead`);
  if (held < UNREACHABLE_CEILING) out.push(`C9d ${held} out-of-reach rows outside \`staged\`, under the ceiling ${UNREACHABLE_CEILING}: lower UNREACHABLE_CEILING to ${held}`);
  return { fails: out, counts: { outOfReach: fateOf.size, reachable: reach.size } };
}

/* C8. The ladder is the generated rung ids (GEAR_ITEMS) read through the LIVE rows,
   so a hand-authored override that drops a field the generator set is judged by the
   line it sits on. Uniques and drops off the ladder answer to C8a only: they are
   sidegrades with their own stats, not rungs. */
export function armourLadderFails(items = ITEMS) {
  const out = [];
  const armourSlot = new Set(ARMOUR_SLOTS);
  const noClass = Object.keys(items).filter((id) => {
    const it = items[id];
    return it && it.type === 'armor' && armourSlot.has(it.slot) && !ARMOUR_WEIGHT[it.armourClass];
  });
  if (noClass.length) out.push(`C8a ${noClass.length} armour row(s) with no armourClass (max HP/mana count them as no armour): ${noClass.join(', ')}`);

  const lines = {};   // class -> slot -> [{ id, tier, live }]
  for (const id of Object.keys(GEAR_ITEMS)) {
    const gen = GEAR_ITEMS[id]; const live = items[id];
    if (!gen || gen.type !== 'armor' || !armourSlot.has(gen.slot) || !live) continue;
    if (live.armourClass !== gen.armourClass) out.push(`C8b ${id}: armourClass ${JSON.stringify(live.armourClass)} but its rung is on the ${gen.armourClass} line`);
    const dropped = Object.keys(gen).filter((k) => gen[k] != null && live[k] == null);
    if (dropped.length) out.push(`C8d ${id}: drops ${dropped.join(', ')}, which its ${gen.armourClass} line rung carries`);
    ((lines[gen.armourClass] ||= {})[gen.slot] ||= []).push({ id, tier: gen.tier, live });
  }
  for (const cls of Object.keys(lines)) {
    const bySlot = lines[cls];
    for (const slot of Object.keys(bySlot)) {
      const rungs = bySlot[slot].sort((a, b) => a.tier - b.tier);
      for (let i = 1; i < rungs.length; i++) {
        const a = rungs[i - 1]; const b = rungs[i];
        if ((b.live.defB || 0) < (a.live.defB || 0)) out.push(`C8b ${cls} ${slot}: ${b.id} (tier ${b.tier}, def ${b.live.defB}) is below ${a.id} (tier ${a.tier}, def ${a.live.defB})`);
      }
    }
    const tiers = [...new Set(Object.values(bySlot).flat().map((r) => r.tier))].sort((a, b) => a - b);
    const setOf = (t) => {
      const equipment = {}; let def = 0; let lv = 1;
      for (const slot of ARMOUR_SLOTS) {
        const r = (bySlot[slot] || []).find((x) => x.tier === t);
        if (!r) continue;
        equipment[slot] = r.id; def += r.live.defB || 0; lv = Math.max(lv, Number(r.live.reqLv) || 1);
      }
      return { equipment, def, lv };
    };
    for (let i = 1; i < tiers.length; i++) {
      const lo = setOf(tiers[i - 1]); const hi = setOf(tiers[i]);
      const L = hi.lv;
      const wl = armourWeights(lo.equipment, items); const wh = armourWeights(hi.equipment, items);
      const hp = [maxHpFor(L, wl.heavy), maxHpFor(L, wh.heavy)];
      const mana = [maxManaFor(L, wl.light), maxManaFor(L, wh.light)];
      if (hp[1] < hp[0] || mana[1] < mana[0] || hi.def < lo.def) {
        out.push(`C8c ${cls} tier ${tiers[i]} set at Level ${L}: ${hp[1]} max HP / ${mana[1]} mana / ${hi.def} def, below tier ${tiers[i - 1]}'s ${hp[0]} / ${mana[0]} / ${lo.def}`);
      }
    }
  }
  return out;
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
      const opts = {};
      if (undo && undo.read) opts.read = undo.read;
      if (undo && undo.unreachable) opts.unreachable = undo.unreachable;
      const r = check(opts);
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
        return !('flux_salt' in inp);
      });
    }
    return { restore: () => { Object.assign(ARTISAN_RECIPES, saved); } };
  });
  run('a stale AWAITING_ROSTER row (the id left ITEMS)', 'C1', () => {
    const id = AWAITING_ROSTER[0]; const was = ITEMS[id];
    delete ITEMS[id];
    return { restore: () => { ITEMS[id] = was; } };
  });
  run('a stale PENDING_USE row', 'C2', () => {
    const it = ITEMS.warboss_standard; const was = it.heals;
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
  run('an item nobody can obtain', 'C7', () => {
    ITEMS.__c7_probe = { name: 'Probe', type: 'material' };
    return { restore: () => { delete ITEMS.__c7_probe; } };
  });

  run('iron plate loses its armourClass (the 2026-10-21 bug)', 'C8a', () => {
    const it = ITEMS.iron_platebody; const was = it.armourClass;
    delete it.armourClass;
    return { restore: () => { it.armourClass = was; } };
  });
  run('a ladder rung changes line', 'C8b', () => {
    const it = ITEMS.steel_helm; const was = it.armourClass;
    it.armourClass = 'leather';
    return { restore: () => { it.armourClass = was; } };
  });
  run('a higher tier gives less defence', 'C8b', () => {
    const it = ITEMS.iron_platebody; const was = it.defB;
    it.defB = 5;
    return { restore: () => { it.defB = was; } };
  });
  run('iron plate drops the plate line magic penalty', 'C8d', () => {
    const it = ITEMS.iron_platebody; const was = it.magicAtkB;
    delete it.magicAtkB;
    return { restore: () => { it.magicAtkB = was; } };
  });
  run('a tier of the plate line is missing a slot (its set gives less max HP)', 'C8c', () => {
    const was = ITEMS.iron_helm;
    delete ITEMS.iron_helm;
    return { restore: () => { ITEMS.iron_helm = was; } };
  });

  /* C9 — the out-of-reach class (designer 2026-10-22). */
  const farFind = (id) => {
    ITEMS[id] = { n: 'Far Find', v: 1, type: 'weapon', slot: 'weapon' };
    MONSTERS.dragon.drops.push({ id, ch: 0.1 });
    return () => { MONSTERS.dragon.drops.pop(); delete ITEMS[id]; };
  };
  run('an item whose only source is a monster no open ground spawns', 'C9a', () => ({ restore: farFind('__mut_far') }));
  run('an out-of-reach item gains a reachable source (a stale row)', 'C9b', () => {
    MONSTERS.slime.drops.push({ id: UNREACHABLE.cut[0], ch: 0.01 });
    return { restore: () => { MONSTERS.slime.drops.pop(); } };
  });
  run('a tagged item leaves ITEMS', 'C9b', () => {
    const id = UNREACHABLE.later[0]; const was = ITEMS[id];
    delete ITEMS[id];
    return { restore: () => { ITEMS[id] = was; } };
  });
  const retag = (id, from, to) => ({ ...UNREACHABLE, [from]: UNREACHABLE[from].filter((x) => x !== id), [to]: [...UNREACHABLE[to], id] });
  run('a dragon material tagged as the staged ground\'s', 'C9c', () => ({ unreachable: retag('dragon_bones', 'later', 'staged') }));
  run('a seed the farm door opens tagged as a cut', 'C9c', () => ({ unreachable: retag('tomato_seed', 'farming', 'cut') }));
  run('the list grows: a new out-of-reach item tagged instead of sourced', 'C9d', () => {
    const restore = farFind('__mut_far2');
    return { unreachable: { ...UNREACHABLE, cut: [...UNREACHABLE.cut, '__mut_far2'] }, restore };
  });

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

const isMain = isEntryModule(import.meta.url);
if (isMain) {
  try {
    if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) mutate();
    const { fails, counts } = check();
    if (fails.length) {
      console.error('catalogue-coherence: RED');
      fails.forEach((f) => console.error('  ✗ ' + f));
      process.exit(1);
    }
    console.log(`catalogue-coherence: OK — ${counts.items} items each with a source and a use (${counts.awaiting} held, sourceless, for the roster), `
      + `${counts.skills} skills each with a consumer, the shop sells starter gear only, `
      + `the Collection Log counts the obtainable catalogue, armour climbs inside its class, `
      + `${counts.reachable} items reachable and ${counts.outOfReach} out of reach each tagged with the door that will source it (pending: ${counts.pendingUse} item uses, `
      + `${counts.pendingConsumer} skill consumer, owned by other W0 lanes)`);
  } catch (e) {
    console.error('catalogue-coherence: HARNESS ERROR — ' + (e && e.stack || e));
    process.exit(2);
  }
}
