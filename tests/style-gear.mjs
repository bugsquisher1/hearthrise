#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/style-gear.mjs — EVERY WAY TO FIGHT CLIMBS (designer 2026-10-22, src/data/style-gear.js)
//
// The bug class: a style a hero can pick (the weapon sets the style, Tyler 2026-10-16; every hero holds all
// seven practice weapons, Tyler 2026-10-20) with no upgrade a player can reach. Until this lane only the
// sword climbed on the open grounds, and no cloth armour could be had.
//
//   SG-1  every style's practice weapon is in the start kit, and each of its rungs is an item a player can
//         REACH (catalogue-coherence reachableSources: open grounds, the listed Shop, gathering, crafts from
//         reachable inputs) playing that same style (its role weapon key)
//   SG-2  the first rung is worn at Level 15 or below (the sword's Iron Sword rung) and beats the practice
//         weapon on its style's accuracy + damage; a rung is two-handed exactly when its practice weapon is
//   SG-3  the cloth line: every tier-1 and tier-2 piece is reachable light armour (armourClass cloth), tier 1
//         worn at Level 1 and tier 2 at Level 15, and each tier's set carries more magic damage than the last
//   SG-4  a made piece never sells for more than the BOOK value of what went in (the bench is never a faucet)
//   SG-5  every made rung opens at or below the level it is worn at, from inputs a player can reach without it
//   SG-6  every made rung sits in a Work-window category (recipes.js recipeCategory), never uncategorized
//
//   node tests/style-gear.mjs            the shipped data
//   node tests/style-gear.mjs --mutate   each arm driven red by a planted defect on the live objects
//
// Exit: 0 green · 1 a finding or a mutant escaped · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { isMain as isEntryModule } from './_is-main.mjs';
import { STYLE_LADDER, CLOTH_LADDER, STYLE_GEAR_RECIPES } from '../src/data/style-gear.js';
import { recipeCategory } from '../src/data/recipes.js';
import { START_EQUIPMENT, START_INVENTORY } from '../src/data/start-kit.js';
/* ITEMS and ARTISAN_RECIPES are the SAME identities reachableSources reads (its re-export), so a plant reaches it. */
import { reachableSources, recipeInputs, ITEMS, ARTISAN_RECIPES, MONSTERS } from '../src/data/catalogue-coherence.js';
import { roleWeaponOf } from '../src/data/hunt-roles.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';

/* A weapon's power for its own style: accuracy + damage of the style it rolls (the engine sums these fields). */
const power = (it) => {
  if (!it) return 0;
  if (it.weaponType === 'ranged') return (it.rangeAtkB || 0) + (it.rangeStrB || 0);
  if (it.weaponType === 'magic' || it.offhand === 'spellbook') return (it.magicAtkB || 0) + (it.magicStrB || 0);
  return (it.atkB || 0) + (it.strB || 0);
};
/* The style key a piece plays: a spellbook is the off-hand of the wand style, every weapon its role key. */
const styleOf = (it) => (it && it.offhand === 'spellbook' ? 'spellbook' : roleWeaponOf(it));

export function check() {
  const fails = [];
  const reach = reachableSources();
  const kit = new Set(Object.keys(START_INVENTORY).concat(Object.values(START_EQUIPMENT)));
  const made = new Map();
  for (const [skill, rows] of Object.entries(STYLE_GEAR_RECIPES)) for (const r of rows) made.set(r.output, { skill, r });

  for (const [style, row] of Object.entries(STYLE_LADDER)) {
    const p = ITEMS[row.practice];
    if (!p || !kit.has(row.practice)) fails.push(`SG-1 ${style}: practice weapon ${row.practice} is not in the start kit`);
    if (!row.rungs.length) fails.push(`SG-1 ${style}: no rung above the practice kit`);
    row.rungs.forEach((id, i) => {
      const it = ITEMS[id];
      if (!it) { fails.push(`SG-1 ${style}: rung ${id} is not an item`); return; }
      if (!reach.has(id)) fails.push(`SG-1 ${style}: rung ${id} has no source a player can reach`);
      if (p && styleOf(it) !== styleOf(p)) fails.push(`SG-1 ${style}: rung ${id} plays ${styleOf(it)}, the practice weapon ${styleOf(p)}`);
      if (i === 0) {
        if (!(Number(it.reqLv) <= 15)) fails.push(`SG-2 ${style}: first rung ${id} is worn at ${it.reqSkill} ${it.reqLv}, past the sword's 15`);
        if (p && !(power(it) > power(p))) fails.push(`SG-2 ${style}: first rung ${id} (${power(it)}) does not beat ${row.practice} (${power(p)})`);
      }
      if (p && !!it.twoHanded !== !!p.twoHanded) fails.push(`SG-2 ${style}: rung ${id} is ${it.twoHanded ? 'two' : 'one'}-handed, ${row.practice} is not`);
    });
  }

  let lastMagic = 0;
  for (const [tier, ids] of Object.entries(CLOTH_LADDER)) {
    let magic = 0;
    for (const id of ids) {
      const it = ITEMS[id];
      if (!it || it.armourClass !== 'cloth') { fails.push(`SG-3 tier ${tier}: ${id} is not cloth armour`); continue; }
      if (!reach.has(id)) fails.push(`SG-3 tier ${tier}: ${id} has no source a player can reach`);
      const want = Number(tier) === 1 ? 1 : 15;
      /* Worn by the hero's Level (Tyler 2026-10-24: every piece of gear), never a skill. */
      if (it.reqSkill !== 'level' || Number(it.reqLv) !== want) fails.push(`SG-3 tier ${tier}: ${id} is worn at ${it.reqSkill} ${it.reqLv}, want Level ${want}`);
      magic += (it.magicStrB || 0);
    }
    if (!(magic > lastMagic)) fails.push(`SG-3 tier ${tier}: the set carries ${magic} magic damage, not more than the tier below (${lastMagic})`);
    lastMagic = magic;
  }

  for (const [id, { skill, r }] of made) {
    const ins = recipeInputs(r);
    const book = Object.entries(ins).reduce((s, [k, q]) => s + q * (Number((ITEMS[k] || {}).v) || 0), 0);
    const sell = vendorPriceOf(ITEMS, id) * (r.outputQty || 1);
    if (sell > book) fails.push(`SG-4 ${r.id}: ${id} sells for ${sell} g, its inputs are worth ${book} g at book (the bench would mint gold)`);
    const it = ITEMS[id] || {};
    const wear = it.type === 'armor' ? Infinity : Number(it.reqLv) || 1;
    if (!(Number(r.req) <= wear)) fails.push(`SG-5 ${r.id}: opens at ${skill} ${r.req}, after ${id} is worn at ${wear}`);
    const far = Object.keys(ins).filter((k) => k === id || !reach.has(k));
    if (far.length) fails.push(`SG-5 ${r.id}: input(s) a player cannot reach: ${far.join(', ')}`);
    if (!(ARTISAN_RECIPES[skill] || []).some((x) => x.id === r.id)) fails.push(`SG-6 ${r.id}: not on the ${skill} bench (ARTISAN_RECIPES)`);
    else if (!recipeCategory(skill, r, ITEMS)) fails.push(`SG-6 ${r.id}: no Work-window category (recipeCategory returns null)`);
  }
  return fails;
}

/* ── THE MUTATION PROOF: each arm red on a planted defect, the plant removed after. */
function mutate() {
  const results = [];
  const run = (name, arm, plant) => {
    const undo = plant();
    try { results.push([name, check().some((f) => f.startsWith(arm))]); } finally { undo(); }
  };
  const control = check();
  if (control.length) { console.error('MUTATE CONTROL: the tree is not clean:\n  ' + control.join('\n  ')); process.exit(2); }
  const setField = (id, k, v) => { const had = Object.prototype.hasOwnProperty.call(ITEMS[id], k); const was = ITEMS[id][k]; ITEMS[id][k] = v; return () => { if (had) ITEMS[id][k] = was; else delete ITEMS[id][k]; }; };
  const unbench = (skill, rid) => { const list = ARTISAN_RECIPES[skill]; const at = list.findIndex((x) => x.id === rid); const [row] = list.splice(at, 1); return () => list.splice(at, 0, row); };
  /* a rung has two doors since the loot bands (made, and a Sewer Rare): a style loses its upgrade only when both close */
  const undrop = (mid, item) => { const m = MONSTERS[mid]; const was = m.drops; m.drops = was.filter((d) => d.id !== item); return () => { m.drops = was; }; };
  run('the wand rung loses its recipe and its drop (a style with no reachable upgrade)', 'SG-1', () => { const a = unbench('crafting', 'carve_oak_wand'); const b = undrop('sump_slime', 'oak_wand'); return () => { b(); a(); }; });
  run('the wand\'s tier-3 rung loses its one drop (the Chief\'s hoard)', 'SG-1', () => undrop('chief_coppercap', 'willow_wand'));
  run('the hatchets rung worn only at Melee 30', 'SG-2', () => setField('iron_hatchets', 'reqLv', 30));
  run('the crossbow rung no stronger than the practice crossbow', 'SG-2', () => { const a = setField('oak_crossbow', 'rangeAtkB', 4); const b = setField('oak_crossbow', 'rangeStrB', 4); return () => { b(); a(); }; });
  run('the club rung one-handed again', 'SG-2', () => setField('iron_warhammer', 'twoHanded', false));
  run('an adept robe that is plate', 'SG-3', () => setField('adept_body', 'armourClass', 'plate'));
  /* worn gear sells at half book (loot-bands.js): a 600 g Longbow sells for 300, over the 275 its planks and thread cost */
  run('the Longbow at 600 g (it sells for more than its inputs)', 'SG-4', () => setField('longbow', 'v', 600));
  run('a rung worn before its recipe opens (Level 10, made at Smithing 15)', 'SG-5', () => setField('iron_hatchets', 'reqLv', 10));
  run('a made rung from an input no player can reach', 'SG-5', () => {
    const was = ITEMS.silk_thread; delete ITEMS.silk_thread;
    return () => { ITEMS.silk_thread = was; };
  });
  run('a made rung whose output type no Work-window tab claims', 'SG-6', () => setField('oak_wand', 'type', 'trinket'));

  let bad = 0;
  for (const [name, hit] of results) { console.log(`  ${hit ? 'CAUGHT ' : 'MISSED '} ${name}`); if (!hit) bad++; }
  const after = check();
  if (after.length) { console.error('MUTATE: a plant leaked:\n  ' + after.join('\n  ')); process.exit(2); }
  console.log(`style-gear --mutate: ${results.length} mutants, ${bad} missed`);
  process.exit(bad ? 1 : 0);
}

if (isEntryModule(import.meta.url)) {
  try {
    if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) mutate();
    const fails = check();
    if (fails.length) { console.error('style-gear: RED'); fails.forEach((f) => console.error('  ✗ ' + f)); process.exit(1); }
    console.log(`style-gear: OK — ${Object.keys(STYLE_LADDER).length} styles each climb past the practice kit by Level 15 from a door a player can reach; `
      + `the cloth line is made at tiers 1 and 2; ${Object.values(STYLE_GEAR_RECIPES).flat().length} made rungs, none sells above its inputs' book`);
  } catch (e) { console.error('style-gear: HARNESS ERROR — ' + (e && e.stack || e)); process.exit(2); }
}
