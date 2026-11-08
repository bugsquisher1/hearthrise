// tests/hunt-core/area-spells-normal.mjs — THE MONSTERS' SPELLS LEAVE NORMAL SAFE, ALONE AND IN A FOUR (lane/b-area-data; Tyler
// 2026-11-08: "the point of Monsters having aoe spells is so the whole party takes damage to make the hunts feel engaging", and
// "a solo person gets a small exp boost BUT the difficulty should be unchanged"; balance ruling 2026-10-25 §3: Normal at the
// recommended level stays near-zero risk; design: docs/planning/PRIORITY_BOARD.md "2026-11-08 Area spells" §4I). Run by
// run-all.mjs; `--only a,b` plays just those cases and their mutants.
//
// Plays the REAL engine through tools/balance-sim's cell runner (the settle the world tick runs, play-ground.mjs), deterministic
// on a commit, on Normal at each ground's floor, one seed x one hour a cell, on the ladder kit and the reference bar:
//   wickstead  Wickstead at its floor (the Turncoat's Smoke Pot, the Barn Spider's Venom Spray)
//   warrens    the Coppercap Warrens at its floor (the Goblin Digger's Blasting Charge, Chief Coppercap's Slag Toss and Slag Rain)
// Each case plays a lone hero of each way the design measured (sword and shield, hammer, bow, wand) and the mixed four (tank,
// healer, bow, mage).
// THE BARS, per hero: no death; no dip under 25% HP alone, at most one in a four (first-week-bands' bars); and the SPELLS WERE ON:
// the ground's whole-group spell struck every hero at least once (a cell no spell reached proves nothing). Every bar is absolute,
// never a pinned number: a legitimate data change re-pins nothing, a spell that makes Normal deadly turns it red.
//
// Measured when written (lane/b-area-data, this commit): 0 deaths and 0 dips in every cell, alone and in the four, with the five
// lone ways and the four; the four's typical low 95-100% at Wickstead and 84-94% at the Warrens (86-100% with no spell).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const { loadCellRunner } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/cell.mjs')).href);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const { HUNT_INDEX } = await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href + V);
const G = await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href + V);

const ALONE = Object.freeze(['tank', 'hammer', 'bow', 'mage']);
const FOUR = Object.freeze(['tank', 'healer', 'bow', 'mage']);
const BAR = Object.freeze({ dips: { alone: 0, four: 1 } });
const HOURS = 1, SEEDS = 1;
/* the grounds and the group spell each must land: the spell is read off the ground's own casters, never typed here */
const GROUNDS = Object.freeze({ wickstead: 'wickstead', warrens: 'coppercap_warrens' });
const floorOf = (g) => HUNT_INDEX[G.OPEN_GROUNDS[g].hunt].band[0];

/** The whole-group spells the ground's regular casters cast (a boss's pulse may not meet every cell), from `root`'s data. */
async function groupSpellsOn(root, g) {
  const MS = await import(pathToFileURL(join(root, 'src/data/monster-spells.js')).href + V);
  const { MONSTERS } = await import(pathToFileURL(join(root, 'src/data/monsters.js')).href + V);
  const out = new Set();
  for (const p of G.OPEN_GROUNDS[g].pockets) for (const s of [...(p.spawns || []), ...(p.pack || [])]) {
    const m = MONSTERS[s.monster];
    if (!m || m.boss) continue;
    for (const id of MS.spellsOf(m)) if (!MS.marked(MS.spellRow(id))) out.add(id);
  }
  return [...out].sort();
}

/** The bars over one played cell: null when every hero holds them, else the first one broken, in words. */
function judge(r, groups, tag) {
  const four = r.heroes.length > 1;
  for (const h of r.heroes) {
    const who = tag + ' ' + h.style + ' at L' + h.level;
    if (h.deaths) return who + ': ' + h.deaths + ' death(s) in ' + h.hours + ' h on Normal (killed by ' + JSON.stringify(h.killers) + ', spells taken ' + JSON.stringify(h.spellsIn) + ')';
    const dips = h.closeCallsPer12h.k, bar = four ? BAR.dips.four : BAR.dips.alone;
    if (dips > bar) return who + ': ' + dips + ' dip(s) under 25% HP in ' + h.hours + ' h on Normal (the bar is ' + bar + ')';
    const struck = groups.filter((id) => h.spellsIn[id] && h.spellsIn[id].hits > 0);
    if (!struck.length) return who + ': no group spell (' + groups.join(', ') + ') struck it in ' + h.hours + ' h: the spells were not on (' + JSON.stringify(h.spellsIn) + ')';
  }
  return null;
}

const playGround = (key) => async (RUN, root) => {
  const g = GROUNDS[key], L = floorOf(g);
  const groups = await groupSpellsOn(root, g);
  if (!groups.length) return g + ' has no regular casting a group spell';
  for (const s of ALONE) {
    const why = judge(RUN.runCell({ id: 'as:' + g + ':' + s, ground: g, party: [s], level: L, hours: HOURS, seeds: SEEDS }), groups, g + ' alone,');
    if (why) return why;
  }
  return judge(RUN.runCell({ id: 'as:' + g + ':four', ground: g, party: FOUR, level: L, hours: HOURS, seeds: SEEDS }), groups, g + ' four,');
};
const cases = { wickstead: playGround('wickstead'), warrens: playGround('warrens') };

const MS = 'src/data/monster-spells.js', MON = 'src/data/monsters.js';
const mutants = [
  /* the spells-on bar: the rows still list the spells, but the engine never starts one, so a zero-death hour is hollow */
  { name: 'the engine never starts a spell', case: 'wickstead', edits: [['src/core/hunt/monster-spells.js', '      if (begin(inst, sc, u, id, spellRow(id))) break;', '      if (false && begin(inst, sc, u, id, spellRow(id))) break;']] },
  /* and the data: a ground whose regulars cast no group spell is refused before a cell is played */
  { name: 'the Turncoat throws no Smoke Pot', case: 'wickstead', edits: [[MON, "    spells: ['smoke_pot'],\n", '']] },
  /* the death bar: a Blasting Charge at four times the Digger's blow every 2.1 s kills on Normal */
  { name: 'Blasting Charge made deadly on Normal', case: 'warrens',
    edits: [[MS, "range: 6, windupMs: 2000, cdMs: 16000, hitPm: 1500, element: 'ember' }, // the Goblin Digger", "range: 6, windupMs: 2000, cdMs: 2100, hitPm: 4000, element: 'ember' }, // the Goblin Digger"]] },
];

const R = makeReport('hunt-core/area-spells-normal');
const RUN = await loadCellRunner(ROOT);
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
for (const k of ONLY || []) R.ok(!!cases[k], '--only names no case ' + k);
for (const [cn, fn] of Object.entries(cases).filter(([k]) => !ONLY || ONLY.includes(k))) {
  let why = null;
  try { why = await fn(RUN, ROOT); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
const PICKED = process.argv.includes('--no-mutate') ? [] : mutants.filter((m) => !ONLY || ONLY.includes(m.case));
for (const mu of PICKED) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    let why = null;
    try { why = await cases[mu.case](await loadCellRunner(p.root), p.root); } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
R.finish();
