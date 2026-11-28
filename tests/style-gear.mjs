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
//   SG-3  the cloth line: every tier-1 and tier-2 piece is reachable light armour (armourClass cloth: a drop since
//         2026-11-18, Tyler: armor, weapons and shields drop, a bench makes none), tier 1
//         worn from its material's Level (src/data/gear-tiers.js: tier 1 at 1, tier 2 at 10), and each tier's set carries more magic damage than the last
//   (SG-4, SG-5 and SG-6 RETIRED WITH THE BENCH, lane/bench-cut-data 2026-11-28, 09-crafting.md 4.13: their subject was the reforge rows,
//         Klappa's Klub's and the Steelgrate's. No bench reforges anything now: both drop, and a drop's sale is the loot band's, held by
//         tests/hunt-core/drop-tables.mjs.)
//   SG-7  Klappa's Klub (Tyler 2026-11-03, the tribute to Andy): the club hero's rung between the kit and the Iron Warhammer, a Scarce drop of
//         the Thicket's Gray Whelps (the bench cut), so a Level 5 hero on the ground it opens at reaches it; PLAYED: its blow and a real
//         Thicket hunt on the settle
//   SG-8  cloth's damage is a premium, not the hit (designer 2026-11-15, lane/d-mage-110): from tier 2 up, every tier of the ladder (the
//         step tiers past Dawnsteel too, the retired weapon line's WL9), a Mage in its tier's wand,
//         spellbook and six cloth pieces at that tier's Level (Magic at the Level) hits at most 1.3 times a warhammer at the same Level
//         (Melee at the Level), the engine's own max hit (playerCombatRolls). At 0.4 of the plate twin's defence it was 1.5 at tier 3 and
//         1.9 at tier 7 (today 1.19-1.28), and a lone Mage earned 1.4-1.8 times the pace from the Slake to the Pauper Vaults (the board's section)
//   SG-9  a weapon carries ONLY its own style's accuracy and damage (the pair src/core/member.js deriveProfile rolls it on: a bow the
//         Ranged pair, a wand or staff the Magic pair, every other kind the Melee pair). The post-140 audit's C6 (designer: a data bug):
//         every bow, crossbow, wand and staff carried a Melee pair copying its own numbers, which combat never read, but the item card
//         called it "Melee accuracy/damage" and the doll ranked on it, so an Oak Wand (7/8) read better than an Iron Sword (7/6)
//
//   node tests/style-gear.mjs            the shipped data
//   node tests/style-gear.mjs --mutate   each arm driven red by a planted defect on the live objects
//
// Exit: 0 green · 1 a finding or a mutant escaped · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { isMain as isEntryModule } from './_is-main.mjs';
import { STYLE_LADDER, CLOTH_LADDER } from '../src/data/style-gear.js';
import { START_EQUIPMENT, START_INVENTORY } from '../src/data/start-kit.js';
/* ITEMS and MONSTERS are the SAME identities reachableSources reads (its re-export), so a plant reaches it. */
import { reachableSources, ITEMS, MONSTERS } from '../src/data/catalogue-coherence.js';
import { roleWeaponOf } from '../src/data/hunt-roles.js';
import { OPEN_GROUNDS } from '../src/data/hunt-grounds.js';
import { HUNT_INDEX } from '../src/data/hunts.js';
import { playerCombatRolls } from '../src/core/combat.js';
import { deriveProfile } from '../src/core/member.js';
import { skillXpForLevel } from '../src/core/xp.js';
import { GEAR_LADDERS, MATERIAL_TIERS } from '../src/data/gear-tiers.js';

/* Every style's accuracy and damage fields (SG-9: a weapon carries its own pair only). */
const STYLE_PAIRS = Object.freeze(['atkB', 'strB', 'rangeAtkB', 'rangeStrB', 'magicAtkB', 'magicStrB']);
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
      /* its material's wear Level (12-targets 8.3: worn from the tier's item Level less wearAhead; bronze 1, iron 10) */
      const want = (MATERIAL_TIERS[Number(tier) - 1] || {}).level;
      /* Worn by the hero's Level (Tyler 2026-10-24: every piece of gear), never a skill. */
      if (it.reqSkill !== 'level' || Number(it.reqLv) !== want) fails.push(`SG-3 tier ${tier}: ${id} is worn at ${it.reqSkill} ${it.reqLv}, want Level ${want}`);
      magic += (it.magicStrB || 0);
    }
    if (!(magic > lastMagic)) fails.push(`SG-3 tier ${tier}: the set carries ${magic} magic damage, not more than the tier below (${lastMagic})`);
    lastMagic = magic;
  }

  /* SG-9: a weapon carries only its own style's accuracy and damage, the pair the engine rolls it on (the header) */
  for (const [id, it] of Object.entries(ITEMS)) {
    if (!it || it.type !== 'weapon') continue;
    const p = deriveProfile(it.weaponType), mine = [p.accuracyBonusField, p.strengthBonusField];
    const other = STYLE_PAIRS.filter((k) => !mine.includes(k) && it[k] !== undefined);
    if (other.length) fails.push(`SG-9 ${id} (${it.weaponType}) carries ${other.join(', ')}: a weapon carries its own style's ${mine.join(' and ')} only (the card would say another style)`);
  }
  /* SG-8: cloth's damage is a premium on the wand and book, not the hit (the header). A zero-defence foe: the gear and the skill only. */
  const lad = Object.fromEntries(GEAR_LADDERS.map((l) => [l.key, l.ids]));
  const maxHitOf = (equipment, L) => playerCombatRolls({ def: 0, tier: 1 }, { items: ITEMS, equipment,
    skills: { melee: skillXpForLevel('melee', L), magic: skillXpForLevel('magic', L) }, profile: deriveProfile(ITEMS[equipment.weapon].weaponType) }).maxHit;
  /* every tier of the ladder, the step tiers past Dawnsteel too (the retired weapon line's WL9 catch, 12-targets 8.8: past Dawnsteel a Mage wears
     its tier's formula wand and cloth, not a line) */
  for (let t = 1; t < lad['weapon:wand'].length; t++) {
    const wand = lad['weapon:wand'][t], book = lad.spellbook[t], hammer = lad['weapon:warhammer'][t];
    const L = Number((ITEMS[wand] || {}).reqLv);
    const robes = Object.fromEntries(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'].map((sl) => [sl, lad['cloth:' + sl][t]]));
    const mage = maxHitOf({ weapon: wand, shield: book, ...robes }, L), melee = maxHitOf({ weapon: hammer }, L);
    if (!(mage <= 1.3 * melee)) fails.push(`SG-8 tier ${t + 1} at Level ${L}: a Mage in full cloth hits ${mage}, ${(mage / melee).toFixed(2)} times the warhammer's ${melee} (at most 1.3)`);
  }
  /* SG-7: the row reads; the blow is played in club() below (the hunt only in the plain run: it takes seconds). */
  const kclub = ITEMS.klappas_club, pclub = ITEMS.practice_club, iron = ITEMS.iron_warhammer;
  if (!kclub) fails.push('SG-7 Klappa\'s Klub is gone');
  else {
    if (!(pclub.reqLv < kclub.reqLv && kclub.reqLv < iron.reqLv)) fails.push(`SG-7 worn at Level ${kclub.reqLv}: not between the Practice Club (${pclub.reqLv}) and the Iron Warhammer (${iron.reqLv})`);
    if (!(kclub.strB > pclub.strB && kclub.atkB >= pclub.atkB)) fails.push(`SG-7 no better than the Practice Club (${kclub.atkB}/${kclub.strB} against ${pclub.atkB}/${pclub.strB})`);
    if (!(kclub.strB <= iron.strB && kclub.atkB < iron.atkB)) fails.push(`SG-7 not under the Iron Warhammer at its own Level (${kclub.atkB}/${kclub.strB} against ${iron.atkB}/${iron.strB})`);
    /* the formula's club at its own Level (docs/design/redesign/28-named-pieces.md row 62): no borrowed piece, no offset */
    if (kclub.statsAs !== undefined || kclub.statPlus !== undefined || kclub.iL !== kclub.reqLv) fails.push(`SG-7 Klappa's Club is not the formula's club at its own Level (statsAs ${kclub.statsAs}, item Level ${kclub.iL}, Level ${kclub.reqLv})`);
    /* its door: a drop of a body on a ground that opens at or under the Klub's own Level, so the club hero finds it where it can wear it */
    if (!reach.has('klappas_club') || !firstHuntDoor('klappas_club', kclub.reqLv)) fails.push(`SG-7 Klappa's Klub has no drop on a ground a Level ${kclub.reqLv} hero hunts`);
  }
  return fails;
}

/* A drop of a body placed on an open ground whose band opens at or under `level` (the Thicket opens at 5). */
function firstHuntDoor(id, level) {
  return Object.values(OPEN_GROUNDS).some((g) => Number(((HUNT_INDEX[g.hunt] || {}).band || [Infinity])[0]) <= level
    && (g.pockets || []).flatMap((p) => (p.pack || []).concat(p.spawns || [], p.adds || [])).some((s) => ((MONSTERS[s.monster] || {}).drops || []).some((d) => d.id === id)));
}

/* SG-7, played: what it does in a fight. Answers failures. */
function club() {
  const fails = [];
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
  /* a rung's one door is its drop row since 2026-11-18. The Oak Wand's homes are read from the rows: the Sewer's slimes dropped it until
     the sweep put the Sewer on bronze and the wand on the Glade's vine (12-targets 8.3), and a named home stopped biting (2026-11-26) */
  const undrop = (mid, item) => { const m = MONSTERS[mid]; const was = m.drops; m.drops = was.filter((d) => d.id !== item); return () => { m.drops = was; }; };
  const undropAll = (item) => {
    const undo = Object.keys(MONSTERS).filter((mid) => (MONSTERS[mid].drops || []).some((d) => d.id === item)).map((mid) => undrop(mid, item));
    if (!undo.length) throw new Error('style-gear --mutate: no monster drops ' + item + ', so its plant removes nothing');
    return () => undo.reverse().forEach((u) => u());
  };
  run('the wand rung loses its drop (a style with no reachable upgrade)', 'SG-1', () => undropAll('oak_wand'));
  /* every body that drops it, read from the rows (the Chief and his called copy, and now the Warlock and the Color
     Sergeant too): a named list of two stopped biting once a second home dropped it (2026-11-23) */
  run('the wand\'s tier-3 rung loses every drop', 'SG-1', () => {
    const undo = Object.keys(MONSTERS).filter((mid) => (MONSTERS[mid].drops || []).some((d) => d.id === 'willow_wand')).map((mid) => undrop(mid, 'willow_wand'));
    return () => undo.reverse().forEach((u) => u());
  });
  run('the hatchets rung worn only at Melee 30', 'SG-2', () => setField('iron_hatchets', 'reqLv', 30));
  run('the crossbow rung no stronger than the practice crossbow', 'SG-2', () => { const a = setField('oak_crossbow', 'rangeAtkB', 4); const b = setField('oak_crossbow', 'rangeStrB', 4); return () => { b(); a(); }; });
  run('the club rung one-handed again', 'SG-2', () => setField('iron_warhammer', 'twoHanded', false));
  run('an adept robe worn from the old iron Level 15', 'SG-3', () => setField('adept_body', 'reqLv', 15));
  run('an adept robe that is plate', 'SG-3', () => setField('adept_body', 'armourClass', 'plate'));
  /* the old cloth row on one piece: the Duskwood Robe Top at 0.4 of the Dawn Platebody's 90 (36, not 10) */
  run('the Duskwood Robe Top back at 0.4 of its plate twin\'s defence', 'SG-8', () => setField('duskweave_body', 'magicStrB', 36));
  /* past Dawnsteel (the retired weapon line's WL9 mutant "the wand line carries the Mage past the bar", on the ladder's own Wolfram wand) */
  run('the Rowan Wand past the bar at Wolfram (its damage half again: a Mage past 1.3 times the Wolfram Warhammer)', 'SG-8', () => setField('rowan_wand', 'magicStrB', 130));
  run('the Scholar set back at 0.4 (the Mage 1.5 times the Willow Warhammer at Level 30)', 'SG-8', () => {
    const undo = ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'].map((sl, i) => setField('scholar_' + sl, 'magicStrB', [4, 9, 6, 3, 2, 3][i]));
    return () => undo.reverse().forEach((u) => u());
  });
  /* SG-9: the C6 rows back (a generated wand and a generated bow, a hand-written boss wand), and a melee weapon with a Magic pair */
  run('the Oak Wand carries its Melee pair again (the C6 card: "Melee accuracy 7")', 'SG-9', () => { const a = setField('oak_wand', 'atkB', 7); const b = setField('oak_wand', 'strB', 8); return () => { b(); a(); }; });
  run('the Duskwood Bow carries a Melee damage copy', 'SG-9', () => setField('duskwood_bow', 'strB', 36));
  run('the Banishing Censer carries a Melee copy (atkB 15)', 'SG-9', () => setField('void_censer', 'atkB', 15));
  run('an Iron Sword with a Magic pair', 'SG-9', () => setField('iron_sword', 'magicAtkB', 3));
  run('Klappa\'s Club worn from Level 1', 'SG-7', () => setField('klappas_club', 'reqLv', 1));
  run('Klappa\'s Club as true as the Iron Warhammer', 'SG-7', () => setField('klappas_club', 'atkB', ITEMS.iron_warhammer.atkB));
  run('Klappa\'s Club no harder than the Practice Club', 'SG-7', () => setField('klappas_club', 'strB', 6));
  run('Klappa\'s Club borrows the Iron Warhammer\'s numbers again', 'SG-7', () => setField('klappas_club', 'statsAs', 'iron_warhammer'));
  /* (re-aimed by the bench cut: its door is the Gray Whelp's drop row, not the Cellar rats' fangs for a reforge) */
  run('Klappa\'s Klub loses its Gray Whelp drop', 'SG-7', () => undrop('gray_whelp', 'klappas_club'));

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
      + 'the cloth line drops at tiers 1 and 2; Klappa\'s Klub drops in the Thicket between the kit and the Iron Warhammer');
  } catch (e) { console.error('style-gear: HARNESS ERROR — ' + (e && e.stack || e)); process.exit(2); }
}
