#!/usr/bin/env node
// tools/balance-sim/tower-weapons.mjs — THE TOWER WEAPONS MEASURED ON THE REAL ENGINE (game-designer, lane/d-tower-weapons; the design is
// docs/planning/PRIORITY_BOARD.md "2026-11-14 The Burning Tower" §6). A what-if tool: it writes nothing to src/.
//
//   node tools/balance-sim/tower-weapons.mjs [--seeds 2] [--hours 1] [--workers 4] [--out <file.jsonl>] [--only skill|rank]
//
// TWO TABLES, Level XP an hour against the same hero in the ladder's kit (tools/balance-sim/gear.mjs kitOf: per slot the best piece its
// Level wears that a player can get today), on the ground the game sends that Level to, the same dice (paired seeds):
//   skill   THE +SKILL ALONE at Levels 45, 60, 75 and 90: the hero's weapon skill raised by 2 and by 4, everything else as it was. A tower
//           weapon rolls exactly as its standard twin on a hero N levels up (tests/hunt-core/tower-weapons-play.mjs as-skill-levels), so
//           this is a +2 or +4 weapon's real effect at each Level, for the seven ways to fight.
//   rank    EACH KEY'S WEAPONS against the ladder: at the Level the key's weapons are worn from (its weaponTier's), and at the Level the
//           NEXT tier is worn from, the hero in the tower weapon of its family instead of the ladder's. The design's rule: Bronze, Silver
//           and Gold beat the standard weapon of their own rank and stay under the next tier; Platinum (no standard tier above it) may sit
//           about a tier up.
// Every cell plays its hours as hunts (a death ends one and the next starts: cell.mjs). Two seeds read in bands, not to the digit: a skill
// level moves a max hit in whole steps.
// Exit 0 when every cell ran; 1 otherwise.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runPool } from './pool.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SEEDS = Number(arg('seeds', 2)), HOURS = Number(arg('hours', 1)), WORKERS = Number(arg('workers', 4)), ONLY = arg('only', null);
const OUT = arg('out', join(tmpdir(), 'tower-weapons-' + Date.now() + '.jsonl'));

const u = (p) => pathToFileURL(join(ROOT, p)).href;
const { CHEST_KEYS } = await import(u('src/data/chests.js'));
const { MATERIAL_TIERS } = await import(u('src/data/gear-tiers.js'));
const { ITEMS } = await import(u('src/data/items.js'));

/* the seven ways to fight (gear.mjs STYLES), each with the family it holds and the skill its weapon raises */
const STYLES = Object.freeze({ sword: ['sword', 'melee'], hammer: ['warhammer', 'melee'], axes: ['hatchets', 'melee'], bow: ['bow', 'ranged'],
  crossbow: ['crossbow', 'ranged'], mage: ['wand', 'magic'], healer: ['staff', 'magic'] });
/* the ground the game sends a lone hero to at each Level (hunts.js bands: Wickstead 8-18, the Glade 16-31, Hask's Ford 45-60, the Slake
   50-65, the Pyre Field 70-90, Krell's Hold 85-110) */
const GROUND = Object.freeze({ 15: 'wickstead', 30: 'mosslight_glade', 45: 'hasks_ford', 60: 'the_slake', 75: 'pyre_field', 88: 'krells_hold', 90: 'krells_hold', 100: 'krells_hold' });
const levelOfTier = (t) => MATERIAL_TIERS[t - 1].level;

const jobs = [];
const cell = (id, L, style, o = {}) => jobs.push({ id, ground: GROUND[L], party: [style], level: L, hours: HOURS, seeds: SEEDS, segmentH: HOURS,
  ...(o.weapon ? { gearBySeat: [{ also: { weapon: o.weapon } }] } : {}),
  /* every cell names its skills (the paired base included), so a +skill cell differs from its base in that one skill only */
  skillsBySeat: [{ melee: L, ranged: L, magic: L, defense: L, [STYLES[style][1]]: L + (o.plus || 0) }] });
const levels = new Set();
if (ONLY !== 'rank') for (const L of [45, 60, 75, 90]) { levels.add(L); for (const s of Object.keys(STYLES)) { cell(`skill:${L}:${s}:+2`, L, s, { plus: 2 }); cell(`skill:${L}:${s}:+4`, L, s, { plus: 4 }); } }
const rankRows = [];
if (ONLY !== 'skill') for (const k of CHEST_KEYS) {
  if (Object.keys(k.weapons).length < 7) continue;
  const own = levelOfTier(k.weaponTier), next = k.weaponTier < MATERIAL_TIERS.length ? levelOfTier(k.weaponTier + 1) : 100;
  for (const L of [own, next]) {
    levels.add(L);
    for (const [s, [fam]] of Object.entries(STYLES)) { cell(`rank:${k.id}:${L}:${s}`, L, s, { weapon: k.weapons[fam] }); rankRows.push({ key: k, L, s, own: L === own }); }
  }
}
for (const L of levels) for (const s of Object.keys(STYLES)) cell(`base:${L}:${s}`, L, s);

const res = await runPool(jobs, OUT, { root: ROOT, workers: WORKERS });
const rows = Object.fromEntries(readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.id, r]));
const xph = (id) => (rows[id] ? rows[id].heroes[0].levelXpPerH : null);
const weaponOf = (id) => (rows[id] ? rows[id].heroes[0].kit.weapon : '?');
const ratio = (a, b) => (xph(a) && xph(b) ? (xph(a) / xph(b)).toFixed(3) : '-');

if (ONLY !== 'rank') {
  console.log('\n+SKILL ALONE: Level XP an hour against the same hero with no bonus (the ladder kit, the same dice)');
  console.log('| Way to fight | ' + [45, 60, 75, 90].map((L) => `${L} +2 | ${L} +4`).join(' | ') + ' |');
  console.log('|---' + '|---'.repeat(8) + '|');
  for (const s of Object.keys(STYLES)) console.log(`| ${s} | ` + [45, 60, 75, 90].map((L) => `${ratio(`skill:${L}:${s}:+2`, `base:${L}:${s}`)} | ${ratio(`skill:${L}:${s}:+4`, `base:${L}:${s}`)}`).join(' | ') + ' |');
}
if (ONLY !== 'skill') {
  console.log('\nEACH KEY\'S WEAPON AGAINST THE LADDER\'S: Level XP an hour, the tower weapon over the ladder\'s best at that Level (the same dice)');
  console.log('| Key | Level | Way to fight | Tower weapon | Ladder weapon | Ratio |');
  console.log('|---|---|---|---|---|---|');
  for (const r of rankRows) console.log(`| ${r.key.name} (+${r.key.skillPlus}) | ${r.L}${r.own ? ' (its own)' : ' (next tier)'} | ${r.s} | ${ITEMS[r.key.weapons[STYLES[r.s][0]]].n} | ${(ITEMS[weaponOf(`base:${r.L}:${r.s}`)] || {}).n || '?'} | ${ratio(`rank:${r.key.id}:${r.L}:${r.s}`, `base:${r.L}:${r.s}`)} |`);
}
console.log(`\n${res.done} cells, ${res.failed} failed, ${Math.round(res.ms / 1000)} s; rows in ${OUT}`);
if (!arg('out', null)) rmSync(OUT, { force: true });
process.exit(res.failed ? 1 : 0);
