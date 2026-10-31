// tests/hunt-core/first-week-bands.mjs — THE FIRST WEEK HOLDS ITS BAND, EVERY WAY TO FIGHT (Tyler's balance ruling
// 2026-10-25; lane b-balance-baseline). Run by run-all.mjs. Plays the REAL engine through tools/balance-sim's cell
// runner (the settle the world tick runs, play-ground.mjs), deterministic on a commit. Every bar is one of the
// ruling's absolute targets, never a pinned number, so a legitimate data change re-pins nothing; a balance move that
// breaks a first-week hard target turns it red.
//
// THE FRESH HERO: the style's practice set ONLY (start-kit.js STARTER_SETS: every new hero owns all six; no armour),
// every combat skill at its Level, the reference bar and store supplies bought per use (the store bill is the whole
// supply cost). Seven ways to fight: sword + shield, dual axes, hammer, bow, crossbow + shield, wand + spellbook, staff.
//
//   solo-<ground>  for each ground the Hunts window sends a LONE hero to in the first day (recommendedHunt, Levels
//                  1-15: today the Mill Cellar, the Meadowbrook Thicket and Wickstead), at its floor, each way to fight
//                  alone plays an hour on two seeds and holds every bar below
//   party-<ground> the first ground the Hunts window sends a PAIR to that a lone hero is not (today the Millrace Sewer
//                  at 8: the tutorial's "Into the sewer, together"), at its floor: a duo (tank + healer) and a four
//                  (tank + healer + bow + mage) in the practice sets, every hero holding every bar
//   THE BARS (per hero): no death; coin + commons at least +25% over the store bill (Tyler 10-20, a minimum); Level XP
//   an hour at least half the pace of record at that Level (level-pace.json: a way to fight that cannot clear the ground
//   earns nothing near it). ALONE: no dip under 25% HP (a close call; the ruling allows one per 12 h, and the first
//   solo floors measured none in 48 h a way to fight) and the typical encounter at 60% HP or more (Normal or easier).
//   THE STARTER PARTY, whose tank takes every blow in practice gear: at most one dip in the cell (measured 0.25-0.5 per
//   12 h) and the typical encounter at 50% or more (its first hour measured 61%, Normal's lower edge: the bar is the
//   middle of Hard, so a reshuffle of the dice does not trip it and a lethal floor does).
//
// Measured when written (lane b-balance-baseline, 1,146 cells, tools/balance-sim/verdict-summary.json): the worst
// first-day hero is the Healer at 0.82x the pace; the practice sets' twelve-hour hunts finished 112 of 112 alone at the
// first floors and 8 of 8 as a duo or a four at the Sewer floor. About 40 s on one core, mutants included.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const { loadCellRunner } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/cell.mjs')).href);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const PACE = JSON.parse(readFileSync(join(ROOT, 'tools/balance-sim/level-pace.json'), 'utf8'));

const WAYS = Object.freeze(['tank', 'axes', 'hammer', 'bow', 'crossbow', 'mage', 'healer']);
const PARTIES = Object.freeze({ duo: ['tank', 'healer'], four: ['tank', 'healer', 'bow', 'mage'] });
const BAR = Object.freeze({ solo: { minHpP50: 60, dips: 0 }, party: { minHpP50: 50, dips: 1 }, margin: 0.25, paceShare: 0.5 });
const HOURS = 1, SOLO_SEEDS = 1, PARTY_SEEDS = 2;
const STARTER = Object.freeze({ starter: true });

/* THE FIRST DAY'S GROUNDS, from the game's own advice (never a typed list): where a lone hero is sent at Levels 1-15,
   and the first ground a pair is sent to that a lone hero is not */
const { recommendedHunt } = await import(pathToFileURL(join(ROOT, 'src/shell/hunt-list.js')).href + V);
const G = await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href + V);
const { HUNT_INDEX } = await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href + V);
const groundOf = (hunt) => Object.values(G.OPEN_GROUNDS).find((g) => g.hunt === hunt).id;
const SOLO = [...new Set(Array.from({ length: 15 }, (_, i) => recommendedHunt([i + 1], 1)).filter(Boolean).map((r) => r.hunt))].map(groundOf);
const PAIR = Array.from({ length: 25 }, (_, i) => recommendedHunt([i + 1, i + 1], 2)).filter(Boolean).map((r) => groundOf(r.hunt)).find((g) => !SOLO.includes(g));
const floorOf = (g) => HUNT_INDEX[G.OPEN_GROUNDS[g].hunt].band[0];

/** The bars, per hero of a played cell: null when every hero holds them, else the first one broken, in words. */
export function judge(r, level, tag) {
  const bar = r.heroes.length > 1 ? BAR.party : BAR.solo;
  for (const h of r.heroes) {
    const who = tag + ' ' + h.style + ' at L' + level;
    if (h.deaths) return who + ': ' + h.deaths + ' death(s) in ' + h.hours + ' h (killed by ' + JSON.stringify(h.killers) + ')';
    if (h.closeCallsPer12h.k > bar.dips) return who + ': ' + h.closeCallsPer12h.k + ' dip(s) under 25% HP in ' + h.hours + ' h (the bar is ' + bar.dips + ')';
    if (h.encMinHpPct.p50 !== null && h.encMinHpPct.p50 < bar.minHpP50) return who + ': the typical encounter bottoms out at ' + h.encMinHpPct.p50 + '% HP (the bar is ' + bar.minHpP50 + '%)';
    if (h.raw.income < (1 + BAR.margin) * h.raw.store) return who + ': coin + commons ' + h.incomePerH + ' g/h against a ' + h.storePerH + ' g/h store bill (under +25%)';
    const pace = PACE.rate[Math.min(level, PACE.ceiling - 1)];
    if (h.levelXpPerH < BAR.paceShare * pace) return who + ': ' + h.levelXpPerH + ' Level XP/h, under half the pace of record (' + pace + ')';
  }
  return null;
}

const cases = {};
for (const g of SOLO) {
  cases['solo-' + g] = (R) => {
    const L = floorOf(g);
    for (const s of WAYS) {
      const why = judge(R.runCell({ id: 'fw:' + g + ':' + s, ground: g, party: [s], level: L, gear: STARTER, hours: HOURS, seeds: SOLO_SEEDS }), L, g + ' alone,');
      if (why) return why;
    }
    return null;
  };
}
if (PAIR) {
  cases['party-' + PAIR] = (R) => {
    const L = floorOf(PAIR);
    for (const [k, party] of Object.entries(PARTIES)) {
      const why = judge(R.runCell({ id: 'fw:' + PAIR + ':' + k, ground: PAIR, party, level: L, gear: STARTER, hours: HOURS, seeds: PARTY_SEEDS }), L, PAIR + ' ' + k + ',');
      if (why) return why;
    }
    return null;
  };
}
/* the advice itself: the first day is three solo grounds then a party floor, or this guard plays nothing new */
cases['first-day-grounds'] = () => (SOLO.length >= 2 && PAIR ? null : 'the Hunts window sends a lone hero to ' + SOLO.join(', ') + ' and a pair first to ' + PAIR);

/* THE MUTANTS: each breaks one first-week way to fight, the way a data row would */
const mutants = [
  { name: 'the Cellar\'s rats, slimes and wasps armoured like a Coppercap foreman (def 0 -> 60): a fresh hero cannot clear it', case: 'solo-mill_cellar',
    edits: [['src/data/monsters.js', 'hp: 9, atk: 2, def: 0, xp: 27, gp: [1, 4], speed: 3400,', 'hp: 9, atk: 2, def: 60, xp: 27, gp: [1, 4], speed: 3400,'],
      ['src/data/monsters.js', 'hp: 8, atk: 2, def: 0, xp: 22, gp: [1, 3], speed: 2400,', 'hp: 8, atk: 2, def: 60, xp: 22, gp: [1, 3], speed: 2400,'],
      ['src/data/monsters.js', 'hp: 8, atk: 4, def: 0, xp: 36, gp: [1, 4],', 'hp: 8, atk: 4, def: 60, xp: 36, gp: [1, 4],']] },
  { name: 'Thin Turnip Juice costs six times as much (a fresh Mage in the Thicket pays more than it earns)', case: 'solo-meadowbrook_thicket',
    edits: [['src/data/supply-basics.js', "mana('thin_turnip_juice', 'Thin Turnip Juice', 'turnip_juice', 72, 10)", "mana('thin_turnip_juice', 'Thin Turnip Juice', 'turnip_juice', 72, 60)"]] },
  { name: 'Wickstead\'s Granary Rats bite like a Rat King (atk 4 -> 14)', case: 'solo-wickstead',
    edits: [['src/data/monsters.js', 'hp: 15, atk: 4, def: 1, xp: 56, gp: [3, 7], speed: 3400', 'hp: 15, atk: 14, def: 1, xp: 56, gp: [3, 7], speed: 3400']] },
  /* THE UNIQUE CATCH (proved when written): at atk 12 drop-tables (profit-floor, caster-floor, ranger-floor), sewer,
     conditions and forest-cave all stay green, since their heroes wear the ladder kit's armour; only a fresh party in the
     practice sets dips (the tank: 3 in 2 h). level-curve C1 asks for a re-measure, not a fix. */
  { name: 'the Sewer\'s Culvert Bats bite a third harder (atk 9 -> 12): a fresh party\'s tank keeps dipping under 25%', case: 'party-millrace_sewer',
    edits: [['src/data/monsters.js', 'hp: 70, atk: 9, def: 1, xp: 288, gp: [14, 38], speed: 4400', 'hp: 70, atk: 12, def: 1, xp: 288, gp: [14, 38], speed: 4400']] },
];

const R = makeReport('hunt-core/first-week-bands');
const RUN = await loadCellRunner(ROOT);
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = fn(RUN); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    let why = null;
    try { why = cases[mu.case](await loadCellRunner(p.root)); } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases (' + SOLO.join(', ') + ' alone; ' + PAIR + ' in a party), ' + mutants.length + ' mutants caught');
R.finish();
