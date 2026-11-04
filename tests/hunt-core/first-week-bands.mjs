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
//   level-gap      under a floor the XP stays and the gold goes, and a watched hunt and a closed browser walk the same swings.
//   risk-ladder    THE RISK (Tyler 2026-11-04 UTC): in range is safe; under a floor an average hero dies and a built one holds and earns about double the ground that fits; a watched hunt
//                  and a closed browser die alike; a Level 1 behind high friends earns next to nothing, and a party that pushes together is paid in full.
//   vs-alone       the Party window's measured line against a full mix on two grounds.
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

/* THE WORDS, PLAYED: a Level 11 sword and shield in the Glade against Wickstead, the ground that fits it; in its armor, then in the practice set */
cases['above-your-level-words'] = (R) => {
  const words = HL.ABOVE_LEVEL_WORDS;
  if (!/More XP/.test(words) || !/hit harder/.test(words) || !/spend more on food than you earn/.test(words) || !/or die/.test(words)) return 'the words claim something this case does not play: ' + words;
  const L = 11, fits = recommendedHunt([L], 1);
  const above = G.OPEN_GROUNDS.mosslight_glade;
  if (!String(HL.rangeWords(HL.huntRows().find((r) => r.hunt === above.hunt), L)).includes(words)) return 'a Level ' + L + ' hero is not warned on ' + above.hunt;
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
/* THE LEVEL GAP (Tyler 2026-11-02, his 10-18 "waste hunt"): under a floor the XP stays and the gold goes, BOTH PATHS. "Viewed" settles every 10 s, as a watched
   hunt does; "browser closed" settles the same span in one 10-minute cut. The swings must match (TICK-1), because a Level gained counts from the next swing either way. */
cases['level-gap'] = (R) => {
  const glade = G.OPEN_GROUNDS.mosslight_glade;
  for (const [L, pm] of [[7, 2800], [15, 1200], [16, 1000], [40, 1000], [undefined, 1000]]) if (G.underFloorPm(glade, L) !== pm) return 'underFloorPm at Level ' + L + ' reads ' + G.underFloorPm(glade, L) + ', not ' + pm;
  const play = (ground, level, windowMs) => R.runCell({ id: 'gap:' + ground + ':' + level + ':' + windowMs, ground, party: ['tank'], level, hours: 1, seeds: 1, ...(windowMs ? { windowMs } : {}) }).heroes[0];
  const viewed = play(glade.id, 7, 10000), closed = play(glade.id, 7, 600000);
  for (const k of ['levelXpPerH', 'takenPerH', 'storePerH', 'coinPerH']) if (viewed[k] !== closed[k]) return k + ': viewed ' + viewed[k] + ', browser closed ' + closed[k];
  /* THE BLOW ITSELF: in the same practice set, a landed blow at Level 7 is the gap's bigger than at the floor (accuracy aside: Defense moves that). */
  const perLanded = (h) => h.dmgPerMonsterSwing / Math.max(0.01, (h.landedPct || 0) / 100);
  const bare = (level) => R.runCell({ id: 'gapb:' + level, ground: glade.id, party: ['tank'], level, hours: 0.5, seeds: 1, gear: { starter: true } }).heroes[0];
  const low = bare(7), floor = bare(16);
  if (!(perLanded(low) > perLanded(floor) * 1.25)) return 'a landed blow at Level 7 averages ' + perLanded(low).toFixed(1) + ', at the floor ' + perLanded(floor).toFixed(1) + ': the gap is not in the blow';
  const fits = play(G.OPEN_GROUNDS.meadowbrook_thicket.id, 7);
  if (!(viewed.levelXpPerH > fits.levelXpPerH * 1.5)) return 'under the floor pays ' + viewed.levelXpPerH + ' XP/h against ' + fits.levelXpPerH + ': the ruling keeps the higher XP';
  if (!(viewed.profitPerH < fits.profitPerH * 0.5)) return 'under the floor nets ' + viewed.profitPerH + ' g/h against ' + fits.profitPerH + ': the ruling says it loses gold';
  return null;
};

/* THE RISK LADDER (Tyler 2026-11-04 UTC: "dying should come if people take big risks ... otherwise what is the point of the game?"). tools/balance-sim plan risk has the whole table; this holds its shape.
   AVERAGE: the Level's helm, body and boots on store food. BUILT: every slot of the Level's best on crafted food, eating early. BOTH PATHS: a watched hunt (10 s settles) and a closed browser (10 min). */
const AVERAGE = Object.freeze({ gear: { armourSlots: ['helmet', 'body', 'boots'] } }), BUILT = Object.freeze({ supply: 'own', bar: { eatPct: 70 } });
cases['risk-ladder'] = (R) => {
  const play = (ground, party, level, build, o) => R.runCell({ id: 'risk:' + ground + ':' + party + ':' + level + ':' + JSON.stringify([build, o]), ground, party, level, hours: 1, seeds: 1, windowMs: 120000, ...build, ...(o || {}) }).heroes;
  /* IN RANGE IS SAFE: the top ground, a full mix on store food at its floor. */
  for (const h of play('coppercap_warrens', PARTIES.four, 32, AVERAGE)) if (h.deaths) return 'in range, the Warrens at 32 killed ' + h.style + ' ' + h.deaths + ' time(s)';
  /* ONE STEP PAST: six Levels under the Glade, the average hero dies inside the hour; the built one holds and earns well over the ground that fits it. */
  const [avg] = play('mosslight_glade', ['tank'], 10, AVERAGE), [built] = play('mosslight_glade', ['tank'], 10, BUILT), [fits] = play('wickstead', ['tank'], 10, BUILT);
  if (!avg.deaths) return 'six Levels under the Glade an average hero held an hour (typical ' + avg.encMinHpPct.p50 + '%)';
  if (built.deaths) return 'six Levels under the Glade a built hero died ' + built.deaths + ' time(s): the build no longer changes the outcome';
  if (!(built.levelXpPerH > fits.levelXpPerH * 1.5)) return 'pushing pays ' + built.levelXpPerH + ' XP/h against ' + fits.levelXpPerH + ' on the ground that fits: the push is the fastest way up, or there is no reason to try';
  /* THE GOLD IS THE OTHER PRICE: on store food the push costs more than it earns, where the ground that fits pays. */
  if (!(avg.profitPerH < 0)) return 'the average push nets ' + avg.profitPerH + ' g/h: the waste hunt loses gold';
  /* FAR PAST: ten Levels under, alone and average is minutes; a built party holds. */
  const [far] = play('mosslight_glade', ['tank'], 6, AVERAGE);
  if (!(far.deaths >= 3)) return 'ten Levels under the Glade an average hero died ' + far.deaths + ' time(s) in an hour: that is minutes, or there is no far past';
  for (const h of play('mosslight_glade', PARTIES.four, 6, BUILT)) if (h.deaths) return 'ten Levels under the Glade a built party lost ' + h.style + ' ' + h.deaths + ' time(s)';
  /* BOTH PATHS: the same hero dies on the same swings, watched or not. */
  const [viewed] = play('mosslight_glade', ['tank'], 10, AVERAGE, { windowMs: 10000 }), [closed] = play('mosslight_glade', ['tank'], 10, AVERAGE, { windowMs: 600000 });
  for (const k of ['deaths', 'levelXpPerH', 'takenPerH', 'storePerH']) if (viewed[k] !== closed[k]) return k + ': viewed ' + viewed[k] + ', browser closed ' + closed[k];
  /* THE LEVEL SHARE, NOT A BLOCK: a Level 1 walks in behind three Level 37s and takes next to nothing; a party under the floor together is paid as one. */
  const [t37, , , low] = play('coppercap_warrens', ['tank', 'healer', 'mage', 'bow'], [37, 37, 37, 1], {}, { gearBySeat: [{}, {}, {}, STARTER] });
  if (!(low.levelXpPerH < t37.levelXpPerH * 0.05)) return 'a Level 1 behind three Level 37s earns ' + low.levelXpPerH + ' XP/h against their ' + t37.levelXpPerH;
  const [, , , lowClosed] = play('coppercap_warrens', ['tank', 'healer', 'mage', 'bow'], [37, 37, 37, 1], {}, { gearBySeat: [{}, {}, {}, STARTER], windowMs: 600000 });
  if (lowClosed.levelXpPerH !== low.levelXpPerH) return 'the low seat earns ' + low.levelXpPerH + ' XP/h viewed, ' + lowClosed.levelXpPerH + ' with the browser closed';
  const pushers = play('coppercap_warrens', ['tank', 'healer', 'mage', 'bow'], 29, BUILT);
  const most = Math.max(...pushers.map((h) => h.levelXpPerH));
  if (pushers.some((h) => h.deaths === 0 && Math.abs(h.levelXpPerH - most) > most * 0.02)) return 'a party that pushes together is paid unevenly: ' + pushers.map((h) => h.levelXpPerH).join(', ');
  const [, , , near] = play('coppercap_warrens', ['tank', 'healer', 'mage', 'bow'], [37, 37, 37, 25], {}, {});
  if (Math.abs(near.levelXpPerH - t37.levelXpPerH) > t37.levelXpPerH * 0.1) return 'a Level 25 with Level 37s is cut, inside the range: ' + near.levelXpPerH + ' XP/h against ' + t37.levelXpPerH;
  if (G.underFloorSharePm(G.OPEN_GROUNDS.coppercap_warrens, 1, 37) >= 10 || G.underFloorSharePm(G.OPEN_GROUNDS.mill_cellar, 1, 37) !== 1000) return 'the share reads ' + G.underFloorSharePm(G.OPEN_GROUNDS.coppercap_warrens, 1, 37) + ' on the Warrens, ' + G.underFloorSharePm(G.OPEN_GROUNDS.mill_cellar, 1, 37) + ' on a ground in range';
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

const GLADE_SOFT = [['hp: 30, atk: 10, baseAcc: 0.8, def: 1, xp: 165', 'hp: 30, atk: 2, def: 1, xp: 165'], ['hp: 32, atk: 12, baseAcc: 0.8, def: 2, xp: 225', 'hp: 32, atk: 2, def: 2, xp: 225'],
  ['hp: 35, atk: 9, baseAcc: 0.8, def: 4, xp: 260', 'hp: 35, atk: 2, def: 4, xp: 260'], ['hp: 70, atk: 18, baseAcc: 0.8, def: 10, xp: 360', 'hp: 70, atk: 2, def: 10, xp: 360'],
  ['hp: 78, atk: 18, baseAcc: 0.8, def: 11, xp: 520', 'hp: 78, atk: 2, def: 11, xp: 520'], ['hp: 74, atk: 18, baseAcc: 0.8, def: 8, xp: 420', 'hp: 74, atk: 2, def: 8, xp: 420']].map(([a, b]) => ['src/data/monsters.js', a, b]);
/* THE MUTANTS: each breaks one first-week way to fight, the way a data row would */
const mutants = [
  { name: 'the Glade hits at the old accuracy: its floor is not felt', case: 'glade-harder',
    edits: [['src/core/combat.js', 'const base = monster && Number.isFinite(monster.baseAcc) ? monster.baseAcc : b.monsterBaseAccuracy;', 'const base = b.monsterBaseAccuracy;'], ...GLADE_SOFT.map(([f, a]) => [f, a, a.replace(/atk: \d+/, 'atk: 2')])] },
  { name: 'the level gap never reaches the blow: under a floor costs no gold', case: 'level-gap',
    edits: [['src/core/hunt/damage.js', "const gap = t.side === 'hero' ? underFloorPm(inst.ground, t.heroLv) : 1000;", 'const gap = 1000;']] },
  { name: 'the level gap is a nudge again: past a floor is safe', case: 'risk-ladder', edits: [['src/data/hunt-tuning.js', 'underFloorAtkPm: 200,', 'underFloorAtkPm: 30,']] },
  { name: 'the level gap is a wall: no build holds past a floor', case: 'risk-ladder', edits: [['src/data/hunt-tuning.js', 'underFloorAtkPm: 200,', 'underFloorAtkPm: 800,']] },
  { name: 'in range bites too: the gap starts twenty Levels over the floor', case: 'risk-ladder',
    edits: [['src/data/hunt-grounds.js', "if (!band || !Number.isInteger(level) || level >= band[0]) return 1000;\n  return 1000 + HUNT_TUNING.underFloorAtkPm * (band[0] - level);", "if (!band || !Number.isInteger(level) || level >= band[0] + 20) return 1000;\n  return 1000 + HUNT_TUNING.underFloorAtkPm * (band[0] + 20 - level);"]] },
  { name: 'the level share is gone: a Level 1 earns what its friends earn', case: 'risk-ladder', edits: [['src/core/hunt/xp-share.js', 'const seat = underFloorSharePm(ground, h.heroLv, top);', 'const seat = 1000;']] },
  { name: 'the level share cuts every seat under the floor: a party that pushes is punished', case: 'risk-ladder',
    edits: [['src/data/hunt-grounds.js', "level >= band[0] || level * 1000 >= top * HUNT_TUNING.partyShareRangePm) return 1000;", "level >= band[0]) return 1000;\n  if (level < band[0]) return 500;"]] },
  { name: 'the Level is read once and kept: a cut changes the swings', case: 'level-gap',
    edits: [['src/core/combat-sim.js', 'u.heroLv = snap.level;', 'u.heroLv = u.heroLv || snap.level;']] },
  { name: 'the Thicket pays the old 1.52 on its wider pull, and the window still says 20%', case: 'vs-alone',
    edits: [['src/data/party-class-xp.js', 'row([980, 1290], [970, 1180, 1310], [970, 1210, 1260, 1300])', 'row([980, 1290], [970, 1180, 1310], [970, 1210, 1260, 1520])']] },
  { name: '"before bonuses" reads what was paid again', case: 'before-bonuses',
    edits: [['supabase/functions/hr-accrue/accrual.js', 'if (Number.isInteger(t.rawLevelXp) && t.rawLevelXp > 0) rawXp.level = t.rawLevelXp;', '']] },
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
    edits: [['src/data/monsters.js', 'hp: 15, atk: 4, def: 1, xp: 56, gp: [3, 6], speed: 3400', 'hp: 15, atk: 14, def: 1, xp: 56, gp: [3, 6], speed: 3400']] },
  /* THE UNIQUE CATCH (proved when written): at atk 12 drop-tables (profit-floor, caster-floor, ranger-floor), sewer,
     conditions and forest-cave all stay green, since their heroes wear the ladder kit's armour; only a fresh party in the
     practice sets dips (the tank: 3 in 2 h). level-curve C1 asks for a re-measure, not a fix. */
  { name: 'the Sewer\'s Culvert Bats bite a third harder (atk 9 -> 12): a fresh party\'s tank keeps dipping under 25%', case: 'party-millrace_sewer',
    edits: [['src/data/monsters.js', 'hp: 70, atk: 9, def: 1, xp: 288, gp: [12, 31], speed: 4400', 'hp: 70, atk: 12, def: 1, xp: 288, gp: [12, 31], speed: 4400']] },
];

const R = makeReport('hunt-core/first-week-bands');
const RUN = await loadCellRunner(ROOT);
const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
let PLAY = await loadPlay(ROOT);
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
    const home = PLAY;
    try { PLAY = await loadPlay(p.root); why = cases[mu.case](await loadCellRunner(p.root)); } catch (e) { why = 'threw ' + e.message; } finally { PLAY = home; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases (' + SOLO.join(', ') + ' alone; ' + PAIR + ' in a party), ' + mutants.length + ' mutants caught');
R.finish();
