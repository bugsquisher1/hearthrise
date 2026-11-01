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
//   above-your-level-words  THE WORDS ON A GROUND ABOVE YOUR LEVEL ARE TRUE (panel 2026-11-01: "expect losses" sat on the best XP on the list):
//                  hunt-list.js ABOVE_LEVEL_WORDS claims more XP, harder hits, and that weak armor can spend more on food than it earns or
//                  die. Each claim is played here against the ground that fits: a balance change that makes one false turns this red.
//   bigger-pulls-words  the Hunts window's "Bigger pulls pay more once your heroes can hold them", played: a Level 18 hero in Wickstead at 8 each
//                  against as built, and a fresh one who cannot hold them (it dips, and its food bill eats the gain).
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
const HL = await import(pathToFileURL(join(ROOT, 'src/shell/hunt-list.js')).href + V);
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

/* THE WORDS, PLAYED: a Level 11 sword and shield in the Glade against Wickstead, the ground that fits it; in its armor, then in the practice set */
cases['above-your-level-words'] = (R) => {
  const words = HL.ABOVE_LEVEL_WORDS;
  if (!/more XP/.test(words) || !/hit harder/.test(words) || !/spend more on food than you earn/.test(words) || !/or die/.test(words)) return 'the words claim something this case does not play: ' + words;
  const L = 11, fits = recommendedHunt([L], 1);
  const above = G.OPEN_GROUNDS.mosslight_glade;
  if (HL.rangeWords(HL.huntRows().find((r) => r.hunt === above.hunt), L) !== words) return 'a Level ' + L + ' hero is not warned on ' + above.hunt;
  const play = (ground, style, level, gear) => R.runCell({ id: 'words:' + ground + ':' + style + ':' + level, ground, party: [style], level, hours: 1, seeds: 1, ...(gear ? { gear } : {}) }).heroes[0];
  const inFit = play(groundOf(fits.hunt), 'tank', L), inAbove = play(above.id, 'tank', L), bare = play(above.id, 'tank', L, STARTER);
  if (!(inAbove.levelXpPerH > inFit.levelXpPerH)) return 'more XP: ' + inAbove.levelXpPerH + ' Level XP/h above the level, ' + inFit.levelXpPerH + ' on the ground that fits';
  if (!(inAbove.dmgPerMonsterSwing > inFit.dmgPerMonsterSwing)) return 'harder hits: ' + inAbove.dmgPerMonsterSwing + ' a monster swing above the level, ' + inFit.dmgPerMonsterSwing + ' on the ground that fits';
  if (!(bare.storePerH > bare.incomePerH)) return 'weak armor spends more than it earns: ' + bare.storePerH + ' g/h on the store against ' + bare.incomePerH + ' g/h earned';
  if (inAbove.deaths) return 'armored, a hero is told only weak armor dies, and died ' + inAbove.deaths + ' time(s)';
  const dies = play(above.id, 'sword', 2, STARTER);
  if (!dies.deaths) return 'or die: a Level 2 sword in the practice set lived an hour in the Glade';
  return null;
};

cases['bigger-pulls-words'] = (R) => {
  const play = (level, density, gear) => R.runCell({ id: 'pull:' + level + ':' + density, ground: 'wickstead', party: ['tank'], level, hours: 1, seeds: 1, ...(density ? { density } : {}), ...(gear ? { gear } : {}) }).heroes[0];
  const built = play(18, 0), big = play(18, 8), fresh = play(8, 8, STARTER);
  if (!(big.levelXpPerH > built.levelXpPerH && big.profitPerH > built.profitPerH)) return 'a hero who can hold 8 earns ' + big.levelXpPerH + ' XP/h, ' + big.profitPerH + ' g/h at 8, ' + built.levelXpPerH + ', ' + built.profitPerH + ' as built';
  if (!(fresh.profitPerH < big.profitPerH / 2)) return 'a fresh hero who cannot hold 8 nets ' + fresh.profitPerH + ' g/h against ' + big.profitPerH + ': the words say "once your heroes can hold them"';
  return null;
};
const GLADE_SOFT = [['hp: 30, atk: 10, def: 1, xp: 165', 'hp: 30, atk: 2, def: 1, xp: 165'], ['hp: 32, atk: 12, def: 2, xp: 225', 'hp: 32, atk: 2, def: 2, xp: 225'],
  ['hp: 35, atk: 9, def: 4, xp: 260', 'hp: 35, atk: 2, def: 4, xp: 260'], ['hp: 70, atk: 18, def: 10, xp: 360', 'hp: 70, atk: 2, def: 10, xp: 360'],
  ['hp: 78, atk: 18, def: 11, xp: 520', 'hp: 78, atk: 2, def: 11, xp: 520'], ['hp: 74, atk: 18, def: 8, xp: 420', 'hp: 74, atk: 2, def: 8, xp: 420']].map(([a, b]) => ['src/data/monsters.js', a, b]);
/* THE MUTANTS: each breaks one first-week way to fight, the way a data row would */
const mutants = [
  { name: 'a full box brings no more kills than the room as built, and the words still say bigger pulls pay', case: 'bigger-pulls-words',
    edits: [['src/data/hunt-grounds.js', 'const n = Math.min(PARTY_SCALE.maxHeroes, Math.max(1, Math.floor(Number(partySize) || 1)));\n  const max = Array.isArray(ground && ground.densityMax) ? ground.densityMax[n - 1] : DENSITY_FULL_BOX;', 'const n = Math.min(PARTY_SCALE.maxHeroes, Math.max(1, Math.floor(Number(partySize) || 1)));\n  const max = 1;']] },
  { name: 'the Glade\'s crows and vines bite no harder than Wickstead\'s rats, and the words still say harder', case: 'above-your-level-words',
    edits: GLADE_SOFT },
  { name: 'store food at the Glade costs next to nothing, and the words still say weak armor loses gold', case: 'above-your-level-words',
    edits: [['src/data/supply-basics.js', "heal('salted_shrimp', 'Salted Shrimp', 'cooked_shrimp', 72, 14)", "heal('salted_shrimp', 'Salted Shrimp', 'cooked_shrimp', 72, 1)"],
      ['src/data/supply-basics.js', "heal('salted_trout', 'Salted Trout', 'cooked_trout', 120, 40)", "heal('salted_trout', 'Salted Trout', 'cooked_trout', 120, 1)"]] },
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
