#!/usr/bin/env node
// tools/balance-sim/catacomb-armor.mjs — THE CATACOMBS' 24 HELMETS AND BOOTS MEASURED ON THE REAL ENGINE (game-designer,
// lane/d-catacomb-armor; the design is docs/planning/PRIORITY_BOARD.md "2026-11-16 The Unmarked Catacombs descent" §6, the rows are
// src/data/catacomb-armor.js, hidden). A what-if tool: it writes nothing to src/.
//
//   node tools/balance-sim/catacomb-armor.mjs [--seeds 6] [--hours 1] [--workers 2] [--only own|where|next] [--out <file.jsonl>] [--cpu 98]
//
// Every piece is played as what it is: its standard twin worn (forced on the slot, so the base and the piece differ in the attribute
// only), plus the attribute, on the same dice (paired seeds):
//   resistPm, steadyPm   a what-if puts the attribute on the twin's own row in both engine instances for that cell only (worker.mjs
//                        applyWhatIf), so the fight reads it through the hooks the live settle uses (equipmentStats, mitigation)
//   meleePlus, rangedPlus  the hero's skill N levels up: a +skill piece plays exactly as that many more skill levels (the built
//                        rule, tests/hunt-core/tower-weapons-play.mjs as-skill-levels on lane/d-tower-weapons; main's engine does
//                        not read the field yet)
// Three tables, a lone hero, Level XP an hour, damage taken a monster swing (safety: an hour's damage moves with kill speed), damage
// an hour, the typical low HP and deaths, against the same hero in the twin:
//   own     each piece at its key's Level on the ground the game sends that Level to (Wickstead 15, Hask's Ford 45, the Pyre Field 75,
//           Krell's Hold 88): a sword wears the plate helms (+Melee), a tank the plate boots, a bow the leather, a Mage the cloth
//   where   the element pieces on a ground that casts their element near their Level (the Sewer and the Glade for the Bronze poison
//           boots, the Warrens' Blasting Charge for the Silver fire hat at 45, the Slake's Cold Bilge for the Silver ice slippers at 50)
//   next    each piece that works everywhere (the plate helm, the plate boots, the leather hood) at the NEXT tier's Level, against that
//           tier's standard piece (Bronze at 30 on the Glade, Silver at 60 on the Slake, Gold at 88 at Krell's Hold). A 1% read: give it
//           20 seeds (--only next)
// Exit 0 when every cell ran; 1 otherwise.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runPool } from './pool.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SEEDS = Number(arg('seeds', 3)), HOURS = Number(arg('hours', 1)), WORKERS = Number(arg('workers', 2)), CPU = Number(arg('cpu', 98));
const OUT = arg('out', join(tmpdir(), 'catacomb-armor-' + Date.now() + '.jsonl'));

const u = (p) => pathToFileURL(join(ROOT, p)).href;
const { CATACOMB_ARMOR, CATACOMB_TIERS, attributeOf } = await import(u('src/data/catacomb-armor.js'));
const { MATERIAL_TIERS, GEAR_LADDERS } = await import(u('src/data/gear-tiers.js'));
const LADDER = Object.fromEntries(GEAR_LADDERS.map((l) => [l.key, l.ids]));

/* who wears each piece: the plate helm's +Melee on a lone sword, the plate boots on a tank, leather on a bow, cloth on a Mage */
const STYLE = Object.freeze({ plate: 'tank', leather: 'bow', cloth: 'mage' });
const styleOf = (r) => (r.slot === 'helmet' && r.weight === 'plate' ? 'sword' : STYLE[r.weight]);
const OWN_GROUND = Object.freeze({ 15: 'wickstead', 30: 'mosslight_glade', 45: 'hasks_ford', 60: 'the_slake', 75: 'pyre_field', 88: 'krells_hold' });
const WHERE = Object.freeze({ tanners_boots: [['millrace_sewer', 15], ['mosslight_glade', 20]], bakers_cap: [['coppercap_warrens', 45]],
  fishwifes_slippers: [['the_slake', 50]] });
const levelOfTier = (t) => MATERIAL_TIERS[t - 1].level;
const twinAt = (weight, slot, tier) => LADDER[weight + ':' + slot][tier - 1];

const jobs = [];
const SK = (L, plus = {}) => [{ melee: L, ranged: L, magic: L, defense: L, ...Object.fromEntries(Object.entries(plus).map(([k, n]) => [k, L + n])) }];
/* a cell: one hero of `style` at Level L on `ground`, its helmet and boots forced, an optional attribute */
function cell(id, ground, L, style, wear, piece) {
  const job = { id, ground, party: [style], level: L, hours: HOURS, seeds: SEEDS, segmentH: HOURS, gearBySeat: [{ also: wear }], skillsBySeat: SK(L) };
  if (piece) {
    const at = attributeOf(piece);
    const skill = { meleePlus: 'melee', rangedPlus: 'ranged', magicPlus: 'magic', defensePlus: 'defense' }[at.field];
    if (skill) job.skillsBySeat = SK(L, { [skill]: at.size });
    else job.whatIf = { items: { [piece.twin]: { [at.field]: at.value } } };
  }
  jobs.push(job);
}
const wearOf = (weight, tier) => ({ helmet: twinAt(weight, 'helmet', tier), boots: twinAt(weight, 'boots', tier) });
const rows = [];
for (const r of CATACOMB_ARMOR) {
  const t = CATACOMB_TIERS[r.key], L = levelOfTier(t), style = styleOf(r);
  const g = OWN_GROUND[L];
  cell(`base:own:${style}:${r.weight}:${t}`, g, L, style, wearOf(r.weight, t), null);
  cell(`own:${r.id}`, g, L, style, wearOf(r.weight, t), r);
  rows.push({ table: 'own', r, id: `own:${r.id}`, base: `base:own:${style}:${r.weight}:${t}`, where: g, L });
  for (const [wg, wL] of WHERE[r.id] || []) {
    cell(`base:where:${r.id}:${wg}`, wg, wL, style, wearOf(r.weight, t), null);
    cell(`where:${r.id}:${wg}`, wg, wL, style, wearOf(r.weight, t), r);
    rows.push({ table: 'where', r, id: `where:${r.id}:${wg}`, base: `base:where:${r.id}:${wg}`, where: wg, L: wL });
  }
  const works = (r.slot === 'helmet' && r.weight !== 'cloth') || (r.slot === 'boots' && r.weight === 'plate');
  if (works && t < 7) {
    const nt = t + 1;
    const NL = levelOfTier(nt), ng = OWN_GROUND[NL];
    /* the next tier's standard set, and the same with this piece's slot back on this piece */
    cell(`base:next:${style}:${r.weight}:${nt}`, ng, NL, style, wearOf(r.weight, nt), null);
    cell(`next:${r.id}`, ng, NL, style, { ...wearOf(r.weight, nt), [r.slot]: r.twin }, r);
    rows.push({ table: 'next', r, id: `next:${r.id}`, base: `base:next:${style}:${r.weight}:${nt}`, where: ng, L: NL, nextTwin: twinAt(r.weight, r.slot, nt) });
  }
}
/* --only own|where|next plays one table (the next-tier reads are about 1%, so they want more seeds than the rest) */
const ONLY = arg('only', null);
const keep = (id) => !ONLY || id.startsWith(ONLY + ':') || id.startsWith('base:' + ONLY + ':');
const uniq = [...new Map(jobs.filter((j) => keep(j.id)).map((j) => [j.id, j])).values()];
const res = await runPool(uniq, OUT, { root: ROOT, workers: WORKERS, cpuMax: CPU });
const got = Object.fromEntries(readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((x) => [x.id, x.heroes[0]]));
const ratio = (a, b, k) => (got[a] && got[b] && got[b][k] ? (got[a][k] / got[b][k]).toFixed(3) : '-');
const low = (id) => (got[id] && got[id].encMinHpPct ? got[id].encMinHpPct.p50 : '-');
const deaths = (id) => (got[id] ? got[id].deaths : '-');
for (const table of ['own', 'where', 'next'].filter((t) => !ONLY || t === ONLY)) {
  console.log('\n' + table.toUpperCase() + ': the piece over ' + (table === 'next' ? 'the next tier\'s standard piece' : 'its standard twin') + ' (the same dice). XP = Level XP an hour, a swing = damage taken a monster swing, taken = damage taken an hour, low = typical lowest HP %, deaths');
  console.log('| Piece | Ground, Level | XP | A swing | Taken | Low, twin -> piece | Deaths, twin -> piece |');
  console.log('|---|---|---|---|---|---|---|');
  for (const x of rows.filter((y) => y.table === table)) console.log(`| ${x.r.name} | ${x.where} ${x.L} | ${ratio(x.id, x.base, 'levelXpPerH')} | ${ratio(x.id, x.base, 'dmgPerMonsterSwing')} | ${ratio(x.id, x.base, 'takenPerH')} | ${low(x.base)} -> ${low(x.id)} | ${deaths(x.base)} -> ${deaths(x.id)} |`);
}
console.log(`\n${res.done} cells, ${res.failed} failed, ${Math.round(res.ms / 1000)} s; rows in ${OUT}`);
if (!arg('out', null)) rmSync(OUT, { force: true });
process.exit(res.failed ? 1 : 0);
