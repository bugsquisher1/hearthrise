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
//   SG-7  Klappa's Club (Tyler 2026-11-03, the tribute to Andy): the club hero's rung between the kit and the Iron Warhammer, reforged at a
//         fresh bench from the kit's one club (so it is no wage) and what a Level 5 hero can reach; PLAYED: the bench run on the real span,
//         then its blow and a real Thicket hunt on the settle
//
//   node tests/style-gear.mjs            the shipped data
//   node tests/style-gear.mjs --mutate   each arm driven red by a planted defect on the live objects
//
// Exit: 0 green · 1 a finding or a mutant escaped · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { isMain as isEntryModule } from './_is-main.mjs';
import { STYLE_LADDER, CLOTH_LADDER, STYLE_GEAR_RECIPES } from '../src/data/style-gear.js';
import { recipeCategory } from '../src/data/recipes.js';
import { START_EQUIPMENT, START_INVENTORY } from '../src/data/start-kit.js';
/* ITEMS and ARTISAN_RECIPES are the SAME identities reachableSources reads (its re-export), so a plant reaches it. */
import { reachableSources, recipeInputs, ITEMS, ARTISAN_RECIPES, MONSTERS } from '../src/data/catalogue-coherence.js';
import { roleWeaponOf } from '../src/data/hunt-roles.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';
import { ROCKS } from '../src/data/gathering.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { indexArtisanRecipes, simulateArtisanSpan } from '../src/core/artisan-sim.js';
import { playerCombatRolls } from '../src/core/combat.js';
import { deriveProfile } from '../src/core/member.js';
import { skillXpForLevel } from '../src/core/xp.js';

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
  /* SG-7: the row reads; the bench and the blow are played in club() below (the hunt only in the plain run: it takes seconds). */
  const kclub = ITEMS.klappas_club, pclub = ITEMS.practice_club, iron = ITEMS.iron_warhammer;
  const made7 = made.get('klappas_club');
  if (!kclub || !made7) fails.push('SG-7 Klappa\'s Club is gone, or no bench makes it');
  else {
    const r = made7.r, ins = recipeInputs(r);
    if (!(pclub.reqLv < kclub.reqLv && kclub.reqLv < iron.reqLv)) fails.push(`SG-7 worn at Level ${kclub.reqLv}: not between the Practice Club (${pclub.reqLv}) and the Iron Warhammer (${iron.reqLv})`);
    if (!(kclub.strB > pclub.strB && kclub.atkB >= pclub.atkB)) fails.push(`SG-7 no better than the Practice Club (${kclub.atkB}/${kclub.strB} against ${pclub.atkB}/${pclub.strB})`);
    if (!(kclub.strB <= iron.strB && kclub.atkB < iron.atkB)) fails.push(`SG-7 not under the Iron Warhammer at its own Level (${kclub.atkB}/${kclub.strB} against ${iron.atkB}/${iron.strB})`);
    if (ins.practice_club !== 1 || reach.get('practice_club') !== 'start kit') fails.push('SG-7 the reforge does not spend the kit\'s one club: the row becomes a wage');
    /* req 1 keeps its loot from Sell all loot on the first trip home (bag-model.js madeInto: only what the bench can make NOW is kept) */
    if (r.req !== 1) fails.push(`SG-7 opens at Smithing ${r.req}: Sell all loot sells its fangs on the first trip home`);
    for (const id of Object.keys(ins)) if (id !== 'practice_club' && !firstHourDoor(id)) fails.push(`SG-7 ${id}: no door a Level 1-5 hero walks through`);
  }
  return fails;
}

/* The first hour's doors: a monster on the first ground, a level-1 rock, or a level-1 bench from one of those. */
function firstHourDoor(id) {
  const cellar = new Set(HUNT_GROUNDS.mill_cellar.pockets.flatMap((p) => (p.pack || []).concat(p.spawns)).map((s) => s.monster));
  if ([...cellar].some((m) => (MONSTERS[m].drops || []).some((d) => d.id === id))) return true;
  if (ROCKS.some((n) => n.prod === id && n.req <= 1)) return true;
  return Object.values(ARTISAN_RECIPES).flat().some((r) => r.output === id && r.req <= 1 && Object.keys(recipeInputs(r)).every(firstHourDoor));
}

/* SG-7, played: the reforge on the real span, then what it does in a fight. Answers failures. */
function club() {
  const fails = [];
  const reforge = ARTISAN_RECIPES.smithing.find((r) => r.output === 'klappas_club');
  const state = { activeSkill: 'smithing', skillTargetId: reforge.id, skills: { smithing: 0 }, inventory: { practice_club: 1, bronze_bar: 6, small_fang: 3 }, equipment: {}, unlockedRecipes: [], toolCarry: {}, stats: {} };
  let xp = 0;
  const fx = { addItem: (id, n) => { state.inventory[id] = (state.inventory[id] || 0) + n; }, removeItem: (id, n) => { state.inventory[id] = (state.inventory[id] || 0) - n; }, addXp: (s, n) => { xp += n; } };
  const out = simulateArtisanSpan(state, { fromMs: 0, toMs: 600000, recipes: indexArtisanRecipes(ARTISAN_RECIPES), items: ITEMS, rng: { chance: () => false, int: (a) => a, next: () => 0.5 }, bonus: () => 0, fx });
  if (state.inventory.klappas_club !== 1) fails.push('SG-7 the bench did not make the club: ' + JSON.stringify({ bag: state.inventory, stopped: out && out.stoppedBy }));
  if (state.inventory.practice_club > 0 || state.inventory.bronze_bar > 0 || state.inventory.small_fang > 0) fails.push('SG-7 the bench left its inputs: ' + JSON.stringify(state.inventory));
  if (!(xp > 0)) fails.push('SG-7 the reforge paid no Smithing XP');
  /* its blow: on the engine's own roll, against a Gray Whelp, at the Melee a career carries at Level 5 and 10, and at the Warhammer's Level */
  const blow = (weapon, melee) => playerCombatRolls(MONSTERS.gray_whelp, { items: ITEMS, equipment: { weapon }, skills: { melee: skillXpForLevel('melee', melee) }, profile: deriveProfile('club') });
  for (const melee of [8, 20, 25]) {
    const k = blow('klappas_club', melee), p = blow('practice_club', melee), i = blow('iron_warhammer', melee);
    if (!(k.maxHit > p.maxHit)) fails.push(`SG-7 at Melee ${melee} its largest blow (${k.maxHit}) is no more than the Practice Club's (${p.maxHit})`);
    if (!(k.maxHit <= i.maxHit && k.accuracy < i.accuracy)) fails.push(`SG-7 at Melee ${melee} it matches the Iron Warhammer (${k.maxHit}, ${k.accuracy} against ${i.maxHit}, ${i.accuracy})`);
  }
  return fails;
}

/* The hunt, on the settle: fifteen minutes of the Thicket at its floor, the hero's Melee where a career has it. */
async function hunted() {
  const { loadPlay } = await import('./hunt-core/fixtures/play-ground.mjs');
  const play = await loadPlay(fileURLToPath(new URL('..', import.meta.url)));
  const r = play.run('meadowbrook_thicket', 5, ['melee_dps'], { spanMs: 15 * 60000, windowMs: 10000, equipment: () => ({ weapon: 'klappas_club' }),
    start: () => ({ skills: { melee: skillXpForLevel('melee', 8), defense: skillXpForLevel('defense', 3) } }) });
  const fails = [];
  if (!(r.kills > 0)) fails.push('SG-7 no kill in fifteen minutes of the Thicket with Klappa\'s Club');
  if (r.falls) fails.push('SG-7 ' + r.falls + ' death(s) in fifteen minutes of the Thicket with Klappa\'s Club');
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
  run('Klappa\'s Club worn from Level 1', 'SG-7', () => setField('klappas_club', 'reqLv', 1));
  run('Klappa\'s Club as true as the Iron Warhammer', 'SG-7', () => setField('klappas_club', 'atkB', 7));
  run('Klappa\'s Club no harder than the Practice Club', 'SG-7', () => setField('klappas_club', 'strB', 7));
  run('its fangs off the Cellar\'s rats', 'SG-7', () => undrop('rat', 'small_fang'));

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
    const fails = [...check(), ...club(), ...await hunted()];
    if (fails.length) { console.error('style-gear: RED'); fails.forEach((f) => console.error('  ✗ ' + f)); process.exit(1); }
    console.log(`style-gear: OK — ${Object.keys(STYLE_LADDER).length} styles each climb past the practice kit by Level 15 from a door a player can reach; `
      + `the cloth line is made at tiers 1 and 2; ${Object.values(STYLE_GEAR_RECIPES).flat().length} made rungs, none sells above its inputs' book`);
  } catch (e) { console.error('style-gear: HARNESS ERROR — ' + (e && e.stack || e)); process.exit(2); }
}
