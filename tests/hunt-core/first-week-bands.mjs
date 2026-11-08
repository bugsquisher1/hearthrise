// tests/hunt-core/first-week-bands.mjs — THE FIRST WEEK HOLDS ITS BAND, EVERY WAY TO FIGHT (Tyler's balance ruling
// 2026-10-25; lane b-balance-baseline). Run by run-all.mjs; `--only a,b` plays just those cases and their mutants. Plays the REAL engine through tools/balance-sim's cell
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
//   bigger-pulls-words  a harder hunt's words and the coach's "How hard can you hunt?" (more monsters pay more once your heroes can hold them), played: a Level 18 hero in Wickstead at 8 each
//                  against as built, and a fresh one who cannot hold them (it dips, and its food bill eats the gain).
//   cape-cut       a Houndskin Cloak and a food's buff, played: each reaches the fight and moves damage taken as far as dice allow, the same swings viewed or with the browser closed
//   risk-ladder    THE RISK IS THE MONSTERS (Tyler 2026-11-04): in range is safe; on a harder ground a hero earns well over the ground that fits and its supply bill follows, an unready hero dies and
//                  a built one holds, with no rule behind any of it (hunt-core/damage.mjs same-blow-at-any-level); a watched hunt and a closed browser die alike; a Level 1 behind high friends earns
//                  next to nothing, and a party that pushes together is paid in full.
//   armor-rungs    balance ruling 2026-10-25 §9: every armor rung on its own ground, exact: each weight's mean piece takes 3-5% off what reaches HP, and only the cloth pieces named here stand still.
//   vs-alone       the Party window's measured line against a full mix on two grounds.
//   weapon-rungs   the hammer's and the hatchets' tier 2 and tier 3 each pay at least +5% Level XP an hour over the tier behind, on the first ground the rung is worn for.
//   glade-harder   Tyler's harder monsters (accuracy 0.80), both paths: felt at the floor, no death, profit, pace, the top eases, a held pull pays.
//   before-bonuses the analyzer's "before bonuses" is the even share, not what was paid.
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
const PCX = await import(pathToFileURL(join(ROOT, 'src/data/party-class-xp.js')).href + V);
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

/* THE WORDS, PLAYED: a Level 11 sword and shield in the Glade against Wickstead, the ground that fits it, and a hero not ready for it */
cases['above-your-level-words'] = (R) => {
  const words = HL.ABOVE_LEVEL_WORDS;
  if (!/More XP/.test(words) || !/stronger than you/.test(words) || !/spend more on supplies/.test(words) || !/or to die/.test(words)) return 'the words claim something this case does not play: ' + words;
  const L = 11, fits = recommendedHunt([L], 1);
  const above = G.OPEN_GROUNDS.mosslight_glade;
  if (!String(HL.rangeWords(HL.huntRows().find((r) => r.hunt === above.hunt), L)).includes(words)) return 'a Level ' + L + ' hero is not warned on ' + above.hunt;
  const play = (ground, style, level, gear) => R.runCell({ id: 'words:' + ground + ':' + style + ':' + level, ground, party: [style], level, hours: 1, seeds: 1, ...(gear ? { gear } : {}) }).heroes[0];
  const inFit = play(groundOf(fits.hunt), 'tank', L), inAbove = play(above.id, 'tank', L);
  if (!(inAbove.levelXpPerH > inFit.levelXpPerH)) return 'more XP: ' + inAbove.levelXpPerH + ' Level XP/h above the level, ' + inFit.levelXpPerH + ' on the ground that fits';
  if (!(inAbove.dmgPerMonsterSwing > inFit.dmgPerMonsterSwing)) return 'stronger: ' + inAbove.dmgPerMonsterSwing + ' a monster swing above the level, ' + inFit.dmgPerMonsterSwing + ' on the ground that fits';
  if (!(inAbove.storePerH > 1000 && inAbove.storePerH > inFit.storePerH * 3)) return 'more on supplies: ' + inAbove.storePerH + ' g/h on the store above the level, ' + inFit.storePerH + ' on the ground that fits';
  const dies = play(above.id, 'sword', 2, STARTER);
  if (!dies.deaths) return 'or to die: a Level 2 sword in the practice set lived an hour in the Glade';
  return null;
};

cases['bigger-pulls-words'] = (R) => {
  const play = (level, density, gear) => R.runCell({ id: 'pull:' + level + ':' + density, ground: 'wickstead', party: ['tank'], level, hours: 1, seeds: 1, ...(density ? { density } : {}), ...(gear ? { gear } : {}) }).heroes[0];
  const built = play(18, 0), big = play(18, 8), fresh = play(8, 8, STARTER);
  if (!(big.levelXpPerH > built.levelXpPerH && big.profitPerH > built.profitPerH)) return 'a hero who can hold 8 earns ' + big.levelXpPerH + ' XP/h, ' + big.profitPerH + ' g/h at 8, ' + built.levelXpPerH + ', ' + built.profitPerH + ' as built';
  if (!(fresh.profitPerH < big.profitPerH / 2)) return 'a fresh hero who cannot hold 8 nets ' + fresh.profitPerH + ' g/h against ' + big.profitPerH + ': the words say "once your heroes can hold them"';
  return null;
};
/* THE RISK IS THE MONSTERS (Tyler 2026-11-04: "either A. The player or party dies, or B. They have to spend more on supplies to stay alive ... it's inherent in the game, not a penalty driven system").
   tools/balance-sim plans risk and riskclimb have the whole table; this holds its shape. AVERAGE: the Level's helm, body and boots on store food. BUILT: every slot of the Level's best on crafted food,
   eating early. BOTH PATHS: a watched hunt (10 s settles) and a closed browser (10 min). */
const AVERAGE = Object.freeze({ gear: { armourSlots: ['helmet', 'body', 'boots'] } }), BUILT = Object.freeze({ supply: 'own', bar: { eatPct: 70 } });
cases['risk-ladder'] = (R) => {
  const play = (ground, party, level, build, o) => R.runCell({ id: 'risk:' + ground + ':' + party + ':' + level + ':' + JSON.stringify([build, o]), ground, party, level, hours: 1, seeds: 1, windowMs: 120000, ...build, ...(o || {}) }).heroes;
  /* IN RANGE IS SAFE: the top ground, a full mix on store food at its floor. */
  for (const h of play('coppercap_warrens', PARTIES.four, 32, AVERAGE)) if (h.deaths) return 'in range, the Warrens at 32 killed ' + h.style + ' ' + h.deaths + ' time(s)';
  /* A PUSH PAYS AND THE BILL FOLLOWS, ON ITS OWN: a Level 10 alone, six Levels under the Glade, against Wickstead in its range. */
  const [avg] = play('mosslight_glade', ['tank'], 10, AVERAGE), [fits] = play('wickstead', ['tank'], 10, AVERAGE);
  if (!(avg.levelXpPerH > fits.levelXpPerH * 1.5)) return 'pushing pays ' + avg.levelXpPerH + ' XP/h against ' + fits.levelXpPerH + ' on the ground that fits: the push is the fastest way up, or there is no reason to try';
  if (!(avg.storePerH > 1000 && avg.storePerH > fits.storePerH * 3)) return 'the push bills ' + avg.storePerH + ' g/h on the store against ' + fits.storePerH + ' on the ground that fits: harder monsters cost supplies, or nothing is at stake';
  if (!(avg.profitPerH < fits.profitPerH * 0.5)) return 'the push nets ' + avg.profitPerH + ' g/h against ' + fits.profitPerH + ': the waste hunt loses gold';
  /* THE BUILD DECIDES: fifteen Levels under, the practice set dies; ten under, a built hero holds, and eats far more of its own food than on the ground that fits. */
  /* "Dies" (re-derived 2026-11-05 from the rule, with the fixture on the server's map): at least twice an hour on the mean of eight dice. The old "3 in one seed's hour" was a number read off the fixture's old map; here one seed reads anywhere from 0 to 6, so one seed is a coin. These eight read 3.0 an hour, twelve 2.5, eight others 3.5. */
  const [poor] = play('mosslight_glade', ['tank'], 1, { gear: STARTER }, { seeds: 8 }), [built] = play('mosslight_glade', ['tank'], 6, BUILT), [builtFits] = play('meadowbrook_thicket', ['tank'], 6, BUILT);
  if (!(poor.deaths >= 2 * poor.hours)) return 'fifteen Levels under the Glade the practice set died ' + poor.deaths + ' time(s) in ' + poor.hours + ' h (typical ' + poor.encMinHpPct.p50 + '%)';
  if (built.deaths) return 'ten Levels under the Glade a built hero died ' + built.deaths + ' time(s): the build no longer changes the outcome';
  if (!(built.eatsPerH.own >= 20 && built.eatsPerH.own > builtFits.eatsPerH.own * 3)) return 'a built hero ate ' + built.eatsPerH.own + ' of its own meals an hour above its level, ' + builtFits.eatsPerH.own + ' on the ground that fits';
  /* ARMOR READS WHO STRUCK, ON THE DEFAULT FOOD (2026-11-04; the hero who never touched its bar): three pieces of bronze pay at the Glade's floor and lose gold ten Levels under it; a curve on the hero's own Level paid there. BOTH PATHS. */
  const SHRIMP = { gear: AVERAGE.gear, startBar: true };
  const [pushed] = play('mosslight_glade', ['tank'], 6, SHRIMP), [floor] = play('mosslight_glade', ['tank'], 16, SHRIMP);
  if (!(pushed.profitPerH < 0)) return 'ten Levels under the Glade on the default food nets ' + pushed.profitPerH + ' g/h: a push pays for itself';
  /* ...and each swing that reaches the pushed hero is worth far more than at the floor (more of them land, and its armor reads the stronger attacker). Measured on the
     formula's rows (lane/b-ground-formula, 2026-11-07): 18.6 against 13.2 a swing, 1.41x; on a curve keyed to the hero's own Level its armor would read 6, not the monster's. */
  if (!(pushed.dmgPerMonsterSwing >= 1.25 * floor.dmgPerMonsterSwing)) return 'ten Levels under the Glade a swing reaches the hero for ' + pushed.dmgPerMonsterSwing + ' against ' + floor.dmgPerMonsterSwing + ' at the floor: under 1.25x, armor is not reading who struck';
  if (!(floor.raw.income >= 1.25 * floor.raw.store)) return 'at the Glade\'s floor on the default food coin and commons are ' + floor.incomePerH + ' g/h against ' + floor.storePerH + ': under +25%';
  const [armoredView] = play('mosslight_glade', ['tank'], 10, SHRIMP, { windowMs: 10000 }), [armoredClosed] = play('mosslight_glade', ['tank'], 10, SHRIMP, { windowMs: 600000 });
  for (const k of ['deaths', 'levelXpPerH', 'takenPerH', 'storePerH']) if (armoredView[k] !== armoredClosed[k]) return 'armored, ' + k + ': viewed ' + armoredView[k] + ', browser closed ' + armoredClosed[k];
  /* BOTH PATHS: the same hero dies on the same swings, watched or not. */
  const [viewed] = play('mosslight_glade', ['tank'], 1, { gear: STARTER }, { windowMs: 10000 }), [closed] = play('mosslight_glade', ['tank'], 1, { gear: STARTER }, { windowMs: 600000 });
  for (const k of ['deaths', 'levelXpPerH', 'takenPerH', 'storePerH']) if (viewed[k] !== closed[k]) return k + ': viewed ' + viewed[k] + ', browser closed ' + closed[k];
  /* THE LEVEL SHARE, NOT A BLOCK: a Level 1 walks in behind three Level 37s and takes next to nothing; a party under the floor together is paid as one. */
  const [t37, , , lone] = play('coppercap_warrens', ['tank', 'healer', 'mage', 'bow'], [37, 37, 37, 1], {}, { gearBySeat: [{}, {}, {}, STARTER] });
  if (!(lone.levelXpPerH < t37.levelXpPerH * 0.05)) return 'a Level 1 behind three Level 37s earns ' + lone.levelXpPerH + ' XP/h against their ' + t37.levelXpPerH;
  const [, , , lowClosed] = play('coppercap_warrens', ['tank', 'healer', 'mage', 'bow'], [37, 37, 37, 1], {}, { gearBySeat: [{}, {}, {}, STARTER], windowMs: 600000 });
  if (lowClosed.levelXpPerH !== lone.levelXpPerH) return 'the low seat earns ' + lone.levelXpPerH + ' XP/h viewed, ' + lowClosed.levelXpPerH + ' with the browser closed';
  const pushers = play('coppercap_warrens', ['tank', 'healer', 'mage', 'bow'], 29, BUILT);
  const most = Math.max(...pushers.map((h) => h.levelXpPerH));
  if (pushers.some((h) => h.deaths === 0 && Math.abs(h.levelXpPerH - most) > most * 0.02)) return 'a party that pushes together is paid unevenly: ' + pushers.map((h) => h.levelXpPerH).join(', ');
  const [, , , near] = play('coppercap_warrens', ['tank', 'healer', 'mage', 'bow'], [37, 37, 37, 25], {}, {});
  if (Math.abs(near.levelXpPerH - t37.levelXpPerH) > t37.levelXpPerH * 0.1) return 'a Level 25 with Level 37s is cut, inside the range: ' + near.levelXpPerH + ' XP/h against ' + t37.levelXpPerH;
  if (G.underFloorSharePm(G.OPEN_GROUNDS.coppercap_warrens, 1, 37) >= 10 || G.underFloorSharePm(G.OPEN_GROUNDS.mill_cellar, 1, 37) !== 1000) return 'the share reads ' + G.underFloorSharePm(G.OPEN_GROUNDS.coppercap_warrens, 1, 37) + ' on the Warrens, ' + G.underFloorSharePm(G.OPEN_GROUNDS.mill_cellar, 1, 37) + ' on a ground in range';
  return null;
};

/* A MEANINGFUL ARMOR UPGRADE IS 3-5% LESS ACTUAL INCOMING DAMAGE (balance ruling 2026-10-25 §9). The unit is a piece a player finds, so the bar reads a rung's mean piece on its own ground. Plate's first rung on the Glade reads 5.1 and
   stays under 5.5. Cloth is over the band on its second rung and stays: its flat ward is worth more against bigger blows, and that step lands it level with leather on its own ground (board 2026-11-05). */
const RUNG_BAR = Object.freeze({ plate: [3, 5.5], leather: [3, 5.5], cloth: [3, 9.5] });
const STANDS_STILL = Object.freeze(['cloth:1:boots', 'cloth:1:gloves', 'cloth:1:belt']);
cases['cape-cut'] = (R) => {
  const play = (o) => R.runCell({ id: 'cape:' + JSON.stringify(o), ground: 'coppercap_warrens', party: ['tank'], level: 40, hours: 1, seeds: 4, windowMs: 120000, ...o }).heroes[0];
  const CAPED = { gear: { also: { cape: 'houndskin_cloak' } } };
  const bare = play({}), caped = play(CAPED);
  const cut = 1 - caped.takenPerH / bare.takenPerH;
  if (!(cut > 0.04 && cut < 0.1)) return 'a Houndskin Cloak moved damage taken by ' + (cut * 100).toFixed(1) + '% at the Warrens, not its 7%';
  const viewed = play({ ...CAPED, seeds: 1, windowMs: 10000 }), closed = play({ ...CAPED, seeds: 1, windowMs: 600000 });
  for (const k of ['deaths', 'levelXpPerH', 'takenPerH', 'storePerH']) if (viewed[k] !== closed[k]) return 'caped, ' + k + ': viewed ' + viewed[k] + ', browser closed ' + closed[k];
  /* A FOOD'S CUT REACHES THE FIGHT, the same hook. An hour's dice hide 3-5% (a hero with a cut draws differently, four seeds read -0.3% for a 5% buff), so reach is a buff they cannot hide, on a hero in no armor (in plate a 40% buff meets the 60% cap); the exact mean is temper.mjs's. Both paths on a real size. */
  const buffed = (magnitude) => ({ buffs: [{ type: 'defense', magnitude, until: new Date(Date.UTC(2026, 9, 18, 13, 0, 0)).toISOString() }] });
  const NAKED = { gear: { noArmour: true } };
  const fedCut = 1 - play({ ...NAKED, ...buffed(40) }).takenPerH / play(NAKED).takenPerH;
  if (!(fedCut > 0.25 && fedCut < 0.55)) return 'a 40% food moved damage taken by ' + (fedCut * 100).toFixed(1) + '% at the Warrens';
  const fedViewed = play({ ...buffed(5), seeds: 1, windowMs: 10000 }), fedClosed = play({ ...buffed(5), seeds: 1, windowMs: 600000 });
  for (const k of ['deaths', 'levelXpPerH', 'takenPerH', 'storePerH']) if (fedViewed[k] !== fedClosed[k]) return 'fed, ' + k + ': viewed ' + fedViewed[k] + ', browser closed ' + fedClosed[k];
  return null;
};
cases['armor-rungs'] = (R) => {
  const rows = R.armorRungs();
  if (rows.length !== 15) return 'the rungs read ' + rows.length + ' rows, not 15';
  for (const r of rows) {
    const tag = r.line + ' tier ' + r.from + ' to ' + r.to + ' on ' + r.ground;
    if (r.mean < RUNG_BAR[r.line][0] || r.mean > RUNG_BAR[r.line][1]) return tag + ': the mean piece takes ' + r.mean + '% off, outside ' + RUNG_BAR[r.line].join('-') + '%';
    if (!(r.set > r.mean * 2)) return tag + ': the whole set takes ' + r.set + '% off against a piece\'s ' + r.mean + '%';
    for (const [slot, pct] of Object.entries(r.pieces)) if (!(pct > 0) && !STANDS_STILL.includes(r.line + ':' + r.from + ':' + slot)) return tag + ': the ' + slot + ' stops no more damage than the tier below';
  }
  return null;
};

/* "LEVEL XP BEFORE BONUSES" IS THE EVEN SHARE (blind party test 2026-11-01: it always equalled what was paid). A mixed party was paid above it, a one-class
   Sewer party under it; alone the two are one number. Both paths: the same totals in 30 s and 10 min cuts. */
cases['before-bonuses'] = () => {
  const totals = (ground, roles, windowMs) => {
    const sum = { raw: 0, paid: 0 };
    PLAY.run(ground, 17, roles, { spanMs: 1800000, windowMs, onWindow: (out) => { for (const p of out.members) { sum.raw += (p.hunt.raw_xp && p.hunt.raw_xp.level) || 0; sum.paid += p.delta.level_xp || 0; } } });
    return sum;
  };
  const mixed = totals('wickstead', ['tank', 'healer'], 30000);
  if (!(mixed.raw > 0 && mixed.paid > mixed.raw)) return 'a mixed party was paid ' + mixed.paid + ' on a share of ' + mixed.raw;
  const again = totals('wickstead', ['tank', 'healer'], 600000);
  if (again.raw !== mixed.raw || again.paid !== mixed.paid) return 'browser closed reads ' + JSON.stringify(again) + ', viewed ' + JSON.stringify(mixed);
  const cut = totals('millrace_sewer', ['tank', 'tank'], 30000);
  if (!(cut.paid < cut.raw)) return 'a one-class Sewer party was paid ' + cut.paid + ' on a share of ' + cut.raw;
  const lone = totals('wickstead', ['tank'], 30000);
  if (Math.abs(lone.raw - lone.paid) > lone.paid * 0.01) return 'a lone hero reads ' + lone.raw + ' before bonuses and ' + lone.paid + ' paid';
  return null;
};

/* THE PARTY WINDOW'S LINE IS MEASURED (designer 2026-11-02): the full mix against the same heroes alone, within 10 points of what the window says. */
cases['vs-alone'] = (R) => {
  const lone = (g, s, L) => R.runCell({ id: 'va:' + g + ':' + s, ground: g, party: [s], level: L, hours: 0.5, seeds: 1, windowMs: 120000 }).heroes[0].levelXpPerH;
  const MIX = ['tank', 'healer', 'bow', 'mage'];
  for (const [g, L, roles] of [['meadowbrook_thicket', 10, ['tank', 'healer', 'ranger', 'mage']], ['mosslight_glade', 24, ['tank', 'healer', 'ranger', 'mage']]]) {
    const hs = R.runCell({ id: 'va:' + g, ground: g, party: MIX, level: L, hours: 0.5, seeds: 2, windowMs: 120000 }).heroes;
    const each = hs.reduce((s, h) => s + h.levelXpPerH, 0) / hs.length, alone = MIX.reduce((s, x) => s + lone(g, x, L), 0) / MIX.length;
    const got = Math.round((each / alone - 1) * 100), said = PCX.partyVsAlone(g, roles);
    if (Math.abs(got - said) > 10) return g + ': a full mix measures ' + got + '% against alone, and the Party window says ' + said + '%';
  }
  /* A THICKET FOUR OF ONE ROLE READS ITS OWN LINE (ONE_ROLE_VS_ALONE; CLAUDE.md §6), played on the two that sit furthest apart: a four of wands over solo, a four of shields under. */
  for (const s of ['mage', 'tank']) {
    const cell = (party) => R.runCell({ id: 'va1:' + party.length + ':' + s, ground: 'meadowbrook_thicket', party, level: 10, hours: HOURS, seeds: 2, windowMs: 120000 });
    const got = Math.round((cell(Array(4).fill(s)).party.levelXpPerHeroPerH / cell([s]).heroes[0].levelXpPerH - 1) * 100), said = PCX.partyVsAlone('meadowbrook_thicket', Array(4).fill(s));
    if (Math.abs(got - said) > 5) return 'a Thicket four of ' + s + ' measures ' + got + '% against alone, and the Party window says ' + said + '%';
  }
  return null;
};

/* THE WEAPON LADDER (balance ruling 10-25 §8: a meaningful upgrade is +5-8% measured hunting performance). One tier up, everything else equal, on the first ground the rung is worn for, as built: Level XP an hour
   at least +5%. Only where killing sets the pace: on the Thicket and Wickstead as built the walk does, and a 200/200 weapon moves XP only +1-4% there, so no row can answer and those grounds aren't asked. */
cases['weapon-rungs'] = (R) => {
  const xp = (g, L, s, gear) => R.runCell({ id: 'wr:' + [g, L, s, gear ? 'behind' : 'worn'].join(':'), ground: g, party: [s], level: L, hours: HOURS, seeds: 2, windowMs: 120000, ...(gear ? { gear } : {}) }).heroes[0].levelXpPerH;
  for (const [g, L] of [['mosslight_glade', 16], ['coppercap_warrens', 45]]) for (const s of ['hammer', 'axes']) {
    const behind = xp(g, L, s, { tierOffset: -1, only: 'weapon' }), worn = xp(g, L, s, null);
    if (worn < 1.05 * behind) return s + ' at L' + L + ' in ' + g + ': the rung pays ' + worn + ' Level XP/h against ' + behind + ' one tier behind (+' + Math.round((worn / behind - 1) * 1000) / 10 + '%, the bar is +5%)';
  }
  return null;
};

/* HARDER MONSTERS (Tyler 2026-11-02: the Glade's accuracy 0.80 at its own attack), BOTH PATHS. The Glade's floor is felt by melee, nobody dies, the hunt still pays its +25%, XP holds the pace, the top of its band
   is easy again, a pull still pays once held, and a watched hunt (10 s settles) and a closed browser (10 min) walk the same swings. */
cases['glade-harder'] = (R) => {
  const play = (s, level, o) => R.runCell({ id: 'gh:' + s + ':' + level + ':' + JSON.stringify(o || {}), ground: 'mosslight_glade', party: [s], level, hours: 1, seeds: 1, ...(o || {}) }).heroes[0];
  for (const s of ['tank', 'hammer']) {
    const h = play(s, 16);
    if (!(h.encMinHpPct.p50 < 92)) return s + ' at the floor: typical ' + h.encMinHpPct.p50 + '% (it read 94% before the harder Glade, 88-89% after): the hero should feel it';
    if (!(h.encMinHpPct.p50 >= 60)) return s + ' at the floor: typical ' + h.encMinHpPct.p50 + '%, under Normal';
  }
  for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) {
    const h = play(s, 16);
    const why = judge({ heroes: [h] }, 16, 'glade floor');
    if (why) return why;
  }
  const viewed = play('tank', 16), closed = play('tank', 16, { windowMs: 600000 });
  for (const k of ['levelXpPerH', 'takenPerH', 'storePerH', 'coinPerH']) if (viewed[k] !== closed[k]) return k + ': viewed ' + viewed[k] + ', browser closed ' + closed[k];
  const top = play('tank', 31);
  if (!(top.encMinHpPct.p50 > 90)) return 'the top of the band reads ' + top.encMinHpPct.p50 + '%: outgrowing a ground should show';
  const built = play('mage', 31), held = play('mage', 31, { density: 8 });
  if (!(held.levelXpPerH > built.levelXpPerH && held.profitPerH > built.profitPerH)) return 'a pull held at the top pays ' + held.levelXpPerH + ' XP/h, ' + held.profitPerH + ' g/h against ' + built.levelXpPerH + ', ' + built.profitPerH;
  return null;
};

const GLADE_SOFT = [['hp: 30, atk: 11, baseAcc: 0.8, def: 1, xp: 155', 'hp: 30, atk: 2, def: 1, xp: 155'], ['hp: 26, atk: 14, baseAcc: 0.85, def: 1, xp: 172', 'hp: 26, atk: 2, def: 1, xp: 172'],
  ['hp: 48, atk: 11, baseAcc: 0.82, def: 6, xp: 309', 'hp: 48, atk: 2, def: 6, xp: 309'], ['hp: 74, atk: 21, baseAcc: 0.8, def: 11, xp: 533', 'hp: 74, atk: 2, def: 11, xp: 533'],
  ['hp: 81, atk: 22, baseAcc: 0.84, def: 14, xp: 609', 'hp: 81, atk: 2, def: 14, xp: 609'], ['hp: 69, atk: 20, baseAcc: 0.78, def: 10, xp: 481', 'hp: 69, atk: 2, def: 10, xp: 481']].map(([a, b]) => ['src/data/monsters.js', a, b]);
/* THE MUTANTS: each breaks one first-week way to fight, the way a data row would */
const mutants = [
  { name: 'the Glade hits at the old accuracy: its floor is not felt', case: 'glade-harder',
    edits: [['src/core/combat.js', 'const base = monster && Number.isFinite(monster.baseAcc) ? monster.baseAcc : b.monsterBaseAccuracy;', 'const base = b.monsterBaseAccuracy;'], ...GLADE_SOFT.map(([f, a]) => [f, a, a.replace(/atk: \d+/, 'atk: 2')])] },
  { name: 'armor reads the hero\'s Level again: a push on the default food pays for itself', case: 'risk-ladder',
    edits: [['src/core/hunt/damage.js', "mitigationOf(target.armour, source && source.side === 'mon' ? levelAtTier(monsterLevelOf(MONSTERS[source.kind]), inst.tier) : 1)", 'mitigationOf(target.armour, target.heroLv || 1)']] },
  { name: 'Studded Boots stop no more than Leather Boots again', case: 'armor-rungs', edits: [['src/data/items.js', "leather_boots:{n:'Leather Boots',icon:'🥾',v:35,type:'armor',slot:'boots',defB:1},", "leather_boots:{n:'Leather Boots',icon:'🥾',v:35,type:'armor',slot:'boots',defB:2},"]] },
  { name: 'leather is thin as cloth: its rungs stop being worth finding', case: 'armor-rungs', edits: [['src/data/gear-tiers.js', "{ key: 'leather', vmul: 0.70, defMul: 0.55,", "{ key: 'leather', vmul: 0.70, defMul: 0.25,"]] },
  { name: 'an Iron Platebody is barely over Bronze: plate\'s first rung goes flat', case: 'armor-rungs', edits: [['src/data/gear-tiers.js', "def: [6, 12, 22, 34, 50, 68, 90], bars: 5,", "def: [6, 6, 22, 34, 50, 68, 90], bars: 5,"]] },
  { name: 'the level share is gone: a Level 1 earns what its friends earn', case: 'risk-ladder', edits: [['src/core/hunt/xp-share.js', 'const seat = underFloorSharePm(ground, h.heroLv, top);', 'const seat = 1000;']] },
  { name: 'the level share cuts every seat under the floor: a party that pushes is punished', case: 'risk-ladder',
    edits: [['src/data/hunt-grounds.js', "level >= band[0] || level * 1000 >= top * HUNT_TUNING.partyShareRangePm) return 1000;", "level >= band[0]) return 1000;\n  if (level < band[0]) return 500;"]] },
  { name: 'the Thicket pays the old 1.52 on its wider pull, and the window still says 20%', case: 'vs-alone',
    edits: [['src/data/party-class-xp.js', 'row([930, 1290], [880, 1180, 1310], [940, 1100, 1150, 1180])', 'row([930, 1290], [880, 1180, 1310], [940, 1100, 1150, 1520])']] },
  { name: 'the Iron Warhammer is back at 7/12: its upgrade pays under +5%', case: 'weapon-rungs',
    edits: [['src/data/items.js', "weaponType:'hammer',atkB:7,strB:16},", "weaponType:'hammer',atkB:7,strB:12},"]] },
  { name: 'the Steel Warhammer is back at 9/19: over the Iron it pays under +5%', case: 'weapon-rungs',
    edits: [['src/data/gear-tiers.js', 'str: [7, 16, 23, 28, 39, 52, 68],', 'str: [7, 16, 19, 28, 39, 52, 68],']] },
  { name: 'the Iron Hatchets are back at 7/7: their upgrade pays under +5%', case: 'weapon-rungs',
    edits: [['src/data/gear-tiers.js', 'atk: [4, 9, 14, 19, 25, 33, 42], str: [4, 11, 14, 21, 22, 29, 38],', 'atk: [4, 7, 14, 19, 25, 33, 42], str: [4, 7, 14, 21, 22, 29, 38],']] },
  { name: 'a Thicket four of one weapon is paid 0.85, and the window still tells a four of wands it earns more than alone', case: 'vs-alone',
    edits: [['src/data/party-class-xp.js', 'row([930, 1290], [880, 1180, 1310], [940, 1100, 1150, 1180])', 'row([930, 1290], [880, 1180, 1310], [850, 1100, 1150, 1180])']] },
  { name: '"before bonuses" reads what was paid again', case: 'before-bonuses',
    edits: [['supabase/functions/hr-accrue/accrual.js', 'if (Number.isInteger(t.rawLevelXp) && t.rawLevelXp > 0) rawXp.level = t.rawLevelXp;', '']] },
  { name: 'a full box brings no more kills than the room as built, and the words still say bigger pulls pay', case: 'bigger-pulls-words',
    edits: [['src/data/hunt-grounds.js', 'const n = Math.min(PARTY_SCALE.maxHeroes, Math.max(1, Math.floor(Number(partySize) || 1)));\n  const max = Array.isArray(ground && ground.densityMax) ? ground.densityMax[n - 1] : DENSITY_FULL_BOX;', 'const n = Math.min(PARTY_SCALE.maxHeroes, Math.max(1, Math.floor(Number(partySize) || 1)));\n  const max = 1;']] },
  { name: 'a cape reads nothing on the hook, so it does nothing in a fight', case: 'cape-cut', edits: [['src/core/mitigation.js', 'nat(eq && eq.steadyPm) + ', '']] },
  { name: 'a food reads nothing on the hook, so it does nothing in a fight', case: 'cape-cut', edits: [['src/core/mitigation.js', " + Math.round((Number(bonus && bonus('steady')) || 0) * 1000);", ";"]] },
  { name: 'a cape guards again: damage taken falls by half', case: 'cape-cut', edits: [['src/data/slot-ladders.js', 'reqLv: 22, steadyPm: 70,', 'reqLv: 22, defB: 4,']] },
  { name: 'the unready hero is safe: a hero in no armor takes 60% less from every blow', case: 'risk-ladder', expect: 'fifteen Levels under',
    edits: [['src/core/mitigation.js', 'if (!dodgePm && !absorbPm && !ward) return NO_MITIGATION;', 'if (!dodgePm && !absorbPm && !ward) return Object.freeze({ dodgePm: 0, absorbPm: 600, ward: 0, keepPm: 0 });']] },
  { name: 'the unready hero is nearly safe: a hero in no armor takes 25% less, still dying now and then', case: 'risk-ladder', expect: 'fifteen Levels under',
    edits: [['src/core/mitigation.js', 'if (!dodgePm && !absorbPm && !ward) return NO_MITIGATION;', 'if (!dodgePm && !absorbPm && !ward) return Object.freeze({ dodgePm: 0, absorbPm: 250, ward: 0, keepPm: 0 });']] },
  { name: 'the Glade\'s crows and vines bite no harder than Wickstead\'s rats, so a push costs nothing', case: 'risk-ladder',
    edits: GLADE_SOFT },
  { name: 'the Glade\'s crows and vines bite no harder than Wickstead\'s rats, and the words still say stronger', case: 'above-your-level-words',
    edits: GLADE_SOFT },
  { name: 'store food at the Glade costs next to nothing, and the words still say expect to spend more', case: 'above-your-level-words',
    edits: [['src/data/supply-basics.js', "heal('salted_shrimp', 'Salted Shrimp', 'cooked_shrimp', 72, 14)", "heal('salted_shrimp', 'Salted Shrimp', 'cooked_shrimp', 72, 1)"],
      ['src/data/supply-basics.js', "heal('salted_trout', 'Salted Trout', 'cooked_trout', 120, 40)", "heal('salted_trout', 'Salted Trout', 'cooked_trout', 120, 1)"]] },
  { name: 'the Cellar\'s rats, slimes and wasps armoured like a Coppercap foreman (def 0 -> 60): a fresh hero cannot clear it', case: 'solo-mill_cellar',
    edits: [['src/data/monsters.js', 'hp: 6, atk: 3, baseAcc: 0.34, def: 0, xp: 23, gp: [1, 2], formula: true, speed: 3400,', 'hp: 6, atk: 3, baseAcc: 0.34, def: 60, xp: 23, gp: [1, 2], formula: true, speed: 3400,'],
      ['src/data/monsters.js', 'hp: 8, atk: 3, baseAcc: 0.28, def: 0, xp: 33, gp: [1, 3], formula: true, speed: 2400,', 'hp: 8, atk: 3, baseAcc: 0.28, def: 60, xp: 33, gp: [1, 3], formula: true, speed: 2400,'],
      ['src/data/monsters.js', 'hp: 8, atk: 3, baseAcc: 0.47, def: 0, xp: 36, gp: [1, 3],', 'hp: 8, atk: 5, baseAcc: 0.43, def: 60, xp: 36, gp: [1, 3],']] },
  { name: 'Thin Turnip Juice costs six times as much (a fresh Mage in the Thicket pays more than it earns)', case: 'solo-meadowbrook_thicket',
    edits: [['src/data/supply-basics.js', "mana('thin_turnip_juice', 'Thin Turnip Juice', 'turnip_juice', 72, 10)", "mana('thin_turnip_juice', 'Thin Turnip Juice', 'turnip_juice', 72, 60)"]] },
  { name: 'Wickstead\'s Granary Rats bite like a Rat King (atk 5 -> 14)', case: 'solo-wickstead',
    edits: [['src/data/monsters.js', 'hp: 15, atk: 4, baseAcc: 0.46, def: 0, xp: 68, gp: [2, 7], formula: true, speed: 3400', 'hp: 15, atk: 14, baseAcc: 0.46, def: 0, xp: 68, gp: [2, 7], formula: true, speed: 3400']] },
  /* THE UNIQUE CATCH (proved when written): at atk 12 drop-tables (profit-floor, caster-floor, ranger-floor), sewer,
     conditions and forest-cave all stay green, since their heroes wear the ladder kit's armour; only a fresh party in the
     practice sets dips (the tank: 3 in 2 h). level-curve C1 asks for a re-measure, not a fix. RE-AIMED on the formula's bat (atk 6 at
     to-hit 0.63, lane/b-ground-formula-2): at 12 the duo's tank dips once (the bar allows one), at 14 three times in 2 h, as the old 12 did. */
  { name: 'the Sewer\'s Culvert Bats bite more than twice as hard (atk 6 -> 14): a fresh party\'s tank keeps dipping under 25%', case: 'party-millrace_sewer',
    edits: [['src/data/monsters.js', 'hp: 53, atk: 7, baseAcc: 0.44, def: 1, xp: 256, gp: [9, 25], formula: true, speed: 4400', 'hp: 53, atk: 14, baseAcc: 0.44, def: 1, xp: 256, gp: [9, 25], formula: true, speed: 4400']] },
];

const R = makeReport('hunt-core/first-week-bands');
const RUN = await loadCellRunner(ROOT);
const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
let PLAY = await loadPlay(ROOT);
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
for (const k of ONLY || []) R.ok(!!cases[k], '--only names no case ' + k);
for (const [cn, fn] of Object.entries(cases).filter(([k]) => !ONLY || ONLY.includes(k))) {
  let why = null;
  try { why = fn(RUN); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
const PICKED = mutants.filter((m) => !ONLY || ONLY.includes(m.case));
for (const mu of PICKED) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    let why = null;
    const home = PLAY;
    try { PLAY = await loadPlay(p.root); why = cases[mu.case](await loadCellRunner(p.root)); } catch (e) { why = 'threw ' + e.message; } finally { PLAY = home; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    if (why && mu.expect) R.ok(why.startsWith(mu.expect), 'mutant "' + mu.name + '" was caught by the wrong line: ' + why.slice(0, 160));
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases (' + SOLO.join(', ') + ' alone; ' + PAIR + ' in a party), ' + PICKED.length + ' mutants caught');
R.finish();
