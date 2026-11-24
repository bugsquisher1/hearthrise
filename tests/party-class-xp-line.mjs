#!/usr/bin/env node
// tests/party-class-xp-line.mjs — A SAME-CLASS PARTY NEVER BEATS SOLO, PER HEAD (Tyler 2026-10-31).
//
// RETIRED AS A CI GUARD 2026-11-22 (T-03; docs/design/redesign/12-targets.md 2.6): the redesign drops the 10-31 rule (a four earns
// more because it holds deeper on the Danger scale). V4 holds the lineup rule now: tests/lineup-v4.mjs. This file stays as the
// measuring tool for the party table the tier grounds still read (--table --mixed --write); tests/guards-unregistered.json says so.
//
// "Party exp should only be better if there are different classes in the party." The table that pays it is
// src/data/party-class-xp.js, on the room as built for every group (Tyler 2026-11-11 retired a party's own Normal pull); this plays the line itself on
// the REAL engine, through tools/balance-sim's cell runner (the settle the world tick runs): every ground (HUNT_GROUNDS,
// never a typed list, so a new ground with no row is judged too), at the party's default pull and at 8 each, on several
// seeds, at the ground's floor Level, in the ladder kit.
//
// THE MEASURE: Level XP per hero per hour in the party, over the mean of what the SAME heroes (each its own way to fight)
// earn per hour alone, seeds pooled (one seed is dice: a short cell swings several percent, designer 11-01). The worst
// single seed is printed beside it. A Melee pair of a shield and two axes is compared with the mean of its two solos: how
// the two fare together against how those two fare apart.
//
// THE BAR IS 1.00. At the default pull, against each hero alone AS BUILT (what no pick spawns for either). At 8 each, against
// each hero alone at ITS better pull (as built or 8 each: the board's "best pull against the members' best pull alone"), since
// a lone hero can press + too: a lone hero at 8 earns up to 1.5x its as-built, so a party at 8 against a lone hero as built
// reads 1.2-1.7 on the solo grounds whatever the class. That reading is printed on every 8-each cell and is not the bar.
//
//   node tests/party-class-xp-line.mjs             the guard (the CI cut: 15-minute party cells, duos on every seed)
//   node tests/party-class-xp-line.mjs --mutate    the proof: each mutant turns its cell red
//   --wide       the designer's read: 30-minute cells, every size on more seeds (about 4x the guard)
//   --seeds N    --workers N   --table every cell's ratio   --mixed the mixed parties too (10-25 §5)
//   --write      (with --mixed) rewrite the Party window's measured lines, one per tier (party-class-xp.js BASE_VS_ALONE and each pack's partyVsAlone) from this run
//
// THE HARDER TIERS ARE THE PARTY'S (Tyler 2026-11-16: "normal isn't meant for parties anyway", "its not restricted, but it's not necessarily meant
// for them"). On Normal a mixed party may earn under its heroes alone: no mixed bar there. ONE TABLE (Tyler 2026-11-16: "just balance the hunting
// grounds xp vs having a unique formula everywhere"; lane/d-flat-party-xp): the party's cell is party-class-xp.js PARTY_CLASS_XP for every ground and
// tier, and each ground's own dials carry the rest, so on Dangerous and Deadly, at the floor on the tier's own pull, every ground answers two bars:
//   alone  every mixed party (a pair, a three, a four) earns at least what the SAME heroes earn alone on the same tier (a head over their mean, bar
//          ALONE_BAR; Tyler 2026-11-16 "every Dangerous/Deadly party mix stays >= the same heroes alone"). The head over its best way alone is printed.
//   pace   a mixed four on Deadly (tank, Healer, bow, wand; and Andy's: axe, bow, wand and a Healer 5 Levels under) earns at most PACE_CAP x the
//          pace contract a head at its top Level (balance-sheet.js contractXpPerH; it read 3.3-4.4x on the per-ground rows)
// A HEALER'S TIER (designer ruling 2026-11-19): where the ground's own row makes the tier a Healer's tier at the floor (hunt-tiers.js HEALER_TIERS), a
// mix with no Healer is printed against its heroes alone, not bound; every mix with a Healer is bound there as anywhere.
// and ONE TABLE, read statically: the table holds sizes, never a ground; no ground pack carries a pay cell of its own (src/data/grounds/shape.js
// refuses one too); and BOTH PATHS: a Deadly four watched (30 s settles) and with the browser closed (10 min) is paid the same Level XP to the point.
//
// NO EXCEPTION (lane/b-one-difficulty, 2026-11-08): every cell answers to 1.00. Tyler 11-02's one accepted over-solo party, a Thicket four of
// wands at its default pull (bar 1.05), reads 0.74 since a monster pays its whole kill for any party size, so its allowance and its five mutants retire.
//
// mutant-anchors: src/data/party-class-xp.js src/data/hunt-grounds.js src/core/hunt/xp-share.js src/data/grounds/unmarked_catacombs/pack.js
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ROOT, plant } from './hunt-core/fixtures/h1.js';
import { PLAY_TREES } from './hunt-core/fixtures/play-ground.mjs';
import { loadCellRunner } from '../tools/balance-sim/cell.mjs';
import { runPool } from '../tools/balance-sim/pool.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';
import { CATACOMB_WING_GROUNDS } from '../src/data/catacomb-wings.js';

const BAR = 1.0;
const WIDE = process.argv.includes('--wide');
/* A party cell's hours, and a lone hero's as built: every party is judged against those, and they are the cheapest cells. */
const HOURS = WIDE ? 0.5 : 0.25;
const SOLO_HOURS = 0.5;
/* null = no pick: the party's default pull (the room as built where a ground has none, and for a lone hero). */
const ARMS = Object.freeze([{ id: 'pull', density: null, words: 'default pull' }, { id: 'eight', density: 8, words: '8 each' }]);
/* Every party is ONE class by the game's map (oneClassProblems holds it). */
const DUOS = Object.freeze({ shields: ['tank', 'tank'], melee: ['tank', 'axes'], bows: ['bow', 'bow'], wands: ['mage', 'mage'], staves: ['healer', 'healer'] });
const LARGER = Object.freeze({ shields3: ['tank', 'tank', 'tank'], melee3: ['tank', 'axes', 'axes'], bows3: ['bow', 'bow', 'bow'], wands3: ['mage', 'mage', 'mage'], staves3: ['healer', 'healer', 'healer'],
  shields4: ['tank', 'tank', 'tank', 'tank'], melee4: ['tank', 'axes', 'axes', 'axes'], bows4: ['bow', 'bow', 'bow', 'bow'], wands4: ['mage', 'mage', 'mage', 'mage'], staves4: ['healer', 'healer', 'healer', 'healer'] });
/* The mixes the designer's table was measured on (--mixed: a read for 10-25 §5, never the bar). */
const MIXED = Object.freeze({ 'duo tank+healer': ['tank', 'healer'], 'duo tank+bow': ['tank', 'bow'], 'duo tank+wand': ['tank', 'mage'], 'trio tank+healer+bow': ['tank', 'healer', 'bow'], 'trio tank+healer+wand': ['tank', 'healer', 'mage'],
  'four': ['tank', 'healer', 'bow', 'mage'] });
const WAYS = Object.freeze(['tank', 'axes', 'bow', 'mage', 'healer']);
/* THE HARDER TIERS' MIXES (Tyler 2026-11-16, above): a pair, a three and a four, each seat against its own way alone on the same tier. */
const HARDER = Object.freeze(['dangerous', 'deadly']);
const TIER_MIXED = Object.freeze({ 'duo tank+healer': MIXED['duo tank+healer'], 'duo tank+bow': MIXED['duo tank+bow'], 'trio tank+healer+bow': MIXED['trio tank+healer+bow'], four: MIXED.four });
/* Andy's four (the live party that read about 5x, 2026-11-16): judged on pace only, its Healer 5 Levels under the floor (a seat under the floor earns its
   own Level's pace alone, so its "alone" is no bar). */
const ANDY = Object.freeze({ party: Object.freeze(['axes', 'bow', 'mage', 'healer']), under: Object.freeze([0, 0, 0, 5]) });
const TIER_WAYS = Object.freeze(['tank', 'healer', 'bow', 'mage']);
const ALONE_BAR = 1.0;
const PACE_CAP = 2.5;
/* THE NUMBERS THAT STAND (Tyler 2026-11-16, asked whether the Thicket and Wickstead should become solo grounds: "all hunts work the same for everyone
   regardless as often as we can, the only difference is the Solo Exp boost"). Their harder tiers bring no bigger pull (floors under
   balance-sheet.js TIER_PULL_FROM_FLOOR), so a party there walks the same room a hero alone does and a mixed four reads about 0.64-0.70 of its
   heroes alone on Dangerous and Deadly. No label hides it and no bar binds it: each run PRINTS their mixes against their heroes alone, and the
   pace cap still binds there. A ground that reads at or over the bar again is named, so its line can go. */
const STANDS = Object.freeze({ meadowbrook_thicket: 'Tyler 2026-11-16', wickstead: 'Tyler 2026-11-16' });
/* A HEALER'S TIER BINDS THE PARTIES THAT BRING ONE (designer ruling 2026-11-19, the board's "2026-11-19 Two rulings for v0.2.142"). Where a ground's own
   measured row makes a tier a Healer's tier at the cell's Level (src/data/hunt-tiers.js HEALER_TIERS: a four with no Healer was measured to die there
   and one with a Healer holds; the Hunts page says "Recommended: Healer"), a mix with no Healer is no party the game sends there: its alone bar is
   PRINTED, never binding, on every run (the line reads "a Healer's tier"), and every mix with a Healer answers the bar as anywhere. The case: the staged
   Unmarked Catacombs' Deadly (a Healer's tier to 186, its whole band), where the tank alone dies 28-29 times a half hour and a tank and bow pair read
   0.968 of the two alone; both sides of that ratio are deaths, not a way to hunt. The pace cap and both paths bind as ever. */
const healerless = (party) => !party.includes('healer');
/* A HARDER TIER'S CELL IS HALF AN HOUR (lane/d-party-pace, 2026-11-18): a party walks a ground's route faster than a hero alone, so a 15-minute cell
   compares them on different rooms. With the Sewer at 5, a tank + Healer pair on its Deadly read 0.94 of the same heroes alone in 15-minute cells
   (140 kills an hour, 182 Level XP a kill) and 1.19 in half-hour cells on the same two seeds (152, 220), 1.19 again on four seeds. */
const TIER_HOURS = 0.5;
/* THE PACE CAP READS FROM LEVEL 10 (lane/d-party-pace; Tyler 2026-11-18 "Yes, open at 5" over the 11-16 cap where they meet, CLAUDE.md §0): the contract is
   the trend past the first ten Levels, which are paced one by one (src/data/core-model.js LEVEL_PACE: its first target is Level 10 at 6 h), and every
   first ground overshoots it (the Thicket alone at 5 reads 2.2x). The Sewer at 5 reads 3.2x on NORMAL for a four, so a cap read there judges the
   ground's floor, not what Deadly adds. A ground whose floor is under 10 has its Deadly fours' pace read at Level 10 (inside its band); the alone bar
   stays at the floor. PACE_FROM is set where LEVEL_PACE is read, below. */

const argOf = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : dflt; };

const V = sourceQuery(ROOT);
const G = await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href + V);
const { HUNT_INDEX } = await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href + V);
const { PARTY_CLASSES } = await import(pathToFileURL(join(ROOT, 'src/data/party-class-xp.js')).href + V);
const { STYLES } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/gear.mjs')).href);
const T = await import(pathToFileURL(join(ROOT, 'src/data/hunt-tiers.js')).href + V);
const { contractXpPerH } = await import(pathToFileURL(join(ROOT, 'src/data/balance-sheet.js')).href + V);
const { LEVEL_PACE } = await import(pathToFileURL(join(ROOT, 'src/data/core-model.js')).href + V);
const PACE_FROM = LEVEL_PACE.targets[0][0];

const groundIds = Object.keys(G.HUNT_GROUNDS);
const floorOf = (g) => HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band[0];
/* A STAGED ground (a pack not yet open) is played as it ships, its own drops on the gear ladder (tools/balance-sim/gear.mjs openAlso,
   the grader's rule): otherwise a ground whose tier drops only there is played a tier under. */
const stagedGear = (g) => (Object.prototype.hasOwnProperty.call(G.OPEN_GROUNDS, g) ? {} : { gear: { openAlso: [g] } });

const cellOf = (g, arm, seed, party, name) => ({
  id: [g, arm.id, seed, name].join(':'), ground: g, party, level: floorOf(g), hours: party.length === 1 && arm.density === null ? SOLO_HOURS : HOURS, seeds: 1, seedBase: seed,
  ...(arm.density === null ? {} : { density: arm.density }), ...stagedGear(g),
});

/* The Level a ground's Deadly fours are paced at: its floor, or PACE_FROM when the floor is under it (never past the band's top). */
const paceLevelOf = (g) => Math.min(Math.max(floorOf(g), PACE_FROM), HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band[1]);
/* A harder tier's cell: the floor (or `at`), the tier's own pull for the party's size. Ids start 'tier:' (judge() reads the others). */
const tierCellOf = (g, tier, seed, party, name, windowMs, under, at) => {
  const pull = T.pullOfTier(T.tierRowOf(g, tier), party.length);
  const lv0 = at || floorOf(g);
  const level = under ? under.map((u) => Math.max(1, lv0 - u)) : lv0;
  return { id: ['tier', g, tier, seed, name].join(':'), ground: g, party, level, hours: TIER_HOURS, seeds: 1, seedBase: seed, options: { tier },
    ...(pull ? { density: pull } : {}), ...(windowMs ? { windowMs } : {}), ...stagedGear(g) };
};
const harderOf = (g) => T.tiersOf(g).filter((t) => HARDER.includes(t));

/** The harder tiers' cells: every ground's Dangerous and Deadly, the four ways alone and the three mixes, on min(seeds, 2) seeds. */
function tierPlanOf(seeds) {
  const jobs = [];
  for (const g of groundIds) for (const tier of harderOf(g)) for (let seed = 0; seed < Math.min(seeds, 2); seed++) {
    for (const w of TIER_WAYS) jobs.push(tierCellOf(g, tier, seed, [w], 'solo-' + w));
    for (const [n, p] of Object.entries(TIER_MIXED)) jobs.push(tierCellOf(g, tier, seed, p, n));
    if (tier === 'deadly') jobs.push(tierCellOf(g, tier, seed, ANDY.party, 'andy', undefined, ANDY.under));
    /* the pace cells, where the floor is under PACE_FROM */
    if (tier === 'deadly' && paceLevelOf(g) !== floorOf(g)) {
      jobs.push(tierCellOf(g, tier, seed, MIXED.four, 'pace-four', undefined, undefined, paceLevelOf(g)));
      jobs.push(tierCellOf(g, tier, seed, ANDY.party, 'pace-andy', undefined, ANDY.under, paceLevelOf(g)));
    }
  }
  return jobs;
}

/** The harder tiers' verdict: rows { g, tier, name, party, head, same (the same heroes alone, their mean), alone (head over same), best (its best way
    alone), seat (head over best, printed), pace (head over the contract at the floor) }. Andy's four reads pace only (alone null). */
function judgeTiers(jobs, at) {
  const rows = [];
  for (const g of groundIds) for (const tier of harderOf(g)) {
    const seeds = [...new Set(jobs.filter((j) => j.ground === g && j.id.startsWith('tier:' + g + ':' + tier + ':')).map((j) => j.seedBase))];
    const alone = (w) => meanOf(seeds.map((s) => at(['tier', g, tier, s, 'solo-' + w].join(':')).heroes[0].levelXpPerH));
    const headOf = (name) => meanOf(seeds.map((s) => at(['tier', g, tier, s, name].join(':')).party.levelXpPerHeroPerH));
    for (const [name, party] of Object.entries(TIER_MIXED)) {
      const head = headOf(name), same = meanOf(party.map(alone)), best = Math.max(...party.map(alone));
      /* a Deadly four's pace at paceLevelOf (its own cells where the floor is under PACE_FROM) */
      const paced = tier === 'deadly' && name === 'four' && paceLevelOf(g) !== floorOf(g) ? headOf('pace-four') : head;
      rows.push({ g, tier, name, party, head: Math.round(head), same: Math.round(same), alone: head / same, best: Math.round(best), seat: head / best, pace: paced / contractXpPerH(tier === 'deadly' && name === 'four' ? paceLevelOf(g) : floorOf(g)),
        /* the cells play the floor: a Healer's tier there leaves a mix with no Healer printed, not bound (HEALER_TIERS, above) */
        healerTier: healerless(party) && T.isHealerTier(g, tier, floorOf(g)) });
    }
    if (tier === 'deadly') { const low = paceLevelOf(g) !== floorOf(g), head = headOf(low ? 'pace-andy' : 'andy'); rows.push({ g, tier, name: 'andy', party: ANDY.party, head: Math.round(head), same: null, alone: null, best: null, seat: null, pace: head / contractXpPerH(paceLevelOf(g)) }); }
  }
  return rows;
}
const PACED = Object.freeze(['four', 'andy']);
const tierRed = (r) => (r.alone !== null && !Object.hasOwn(STANDS, r.g) && !r.healerTier && !(r.alone >= ALONE_BAR)) || (r.tier === 'deadly' && PACED.includes(r.name) && !(r.pace <= PACE_CAP));
const tierWords = (r) => r.g + ', ' + r.tier + ', ' + r.party.join('+') + (r.name === 'andy' ? ' (a Healer 5 under)' : '') + ': ' + r.head + ' Level XP/h a head'
  + (r.alone === null ? '' : ', the same heroes alone ' + r.same + ' = ' + r.alone.toFixed(3) + ' (its best way alone ' + r.best + ' = ' + r.seat.toFixed(3) + ')')
  + (r.healerTier ? ' (a Healer\'s tier, no Healer: printed, not bound)' : '')
  + (PACED.includes(r.name) ? ', ' + r.pace.toFixed(2) + 'x the pace contract' + (r.tier === 'deadly' ? ' (cap ' + PACE_CAP + ')' : '') : '');

/** BOTH PATHS: a Deadly four on Hask's Ford (the hottest before the cut), watched (30 s settles) and browser closed (10 min), paid the same Level XP. */
function bothPaths(R) {
  const g = 'hasks_ford';
  if (!harderOf(g).includes('deadly')) return 'hasks_ford has no Deadly tier to play both paths on';
  const xp = (w) => R.runCell(tierCellOf(g, 'deadly', 0, MIXED.four, 'paths', w)).heroes.map((h) => h.raw.levelXp);
  const viewed = xp(30000), closed = xp(600000);
  return viewed.join(',') === closed.join(',') ? null : 'a Deadly four on Hask\'s Ford: viewed ' + viewed + ', browser closed ' + closed;
}

function oneClassProblems() {
  const classOf = (style) => Object.keys(PARTY_CLASSES).find((c) => PARTY_CLASSES[c].roles.includes(STYLES[style].role));
  return Object.entries({ ...DUOS, ...LARGER }).filter(([, p]) => new Set(p.map(classOf)).size !== 1).map(([n, p]) => n + ' (' + p + ') is not one class');
}

/** The cells a sweep plays. The CI cut: the default pull every seed for duos and lone heroes, the first seed for a larger
    party; 8 each, the first two seeds for duos and lone heroes, the first for a four. --wide: larger parties two seeds and
    every seed at 8 each. A party cell and its lone heroes share their seeds, so each cell's solos are played. */
function planOf(seeds, mixed) {
  const jobs = [];
  for (const g of groundIds) for (const arm of ARMS) for (let seed = 0; seed < seeds; seed++) {
    const eight = arm.density !== null;
    if (!WIDE && eight && seed > 1) continue;
    for (const w of WAYS) jobs.push(cellOf(g, arm, seed, [w], 'solo-' + w));
    for (const [n, p] of Object.entries(DUOS)) jobs.push(cellOf(g, arm, seed, p, n));
    if (seed < (WIDE && !eight ? 2 : 1)) for (const [n, p] of Object.entries(LARGER)) if (WIDE || !eight || p.length === 4) jobs.push(cellOf(g, arm, seed, p, n));
    if (mixed && !eight) for (const [n, p] of Object.entries(MIXED)) jobs.push(cellOf(g, arm, seed, p, n));
  }
  return jobs;
}

const meanOf = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/** The verdict over played cells. `at(id)`: a played cell's metrics. Answers { rows, reds, problems }. */
function judge(jobs, at) {
  const problems = [];
  /* way -> seed -> Level XP/h alone, per ground and arm */
  const solo = new Map();
  const soloOf = (g, armId, way, seed) => solo.get([g, armId, way, seed].join(':'));
  for (const j of jobs) {
    const [g, armId, seed, name] = j.id.split(':');
    if (!name.startsWith('solo-')) continue;
    const xp = at(j.id).heroes[0].levelXpPerH;
    solo.set([g, armId, j.party[0], seed].join(':'), xp);
    if (armId === 'pull' && !(xp > 0)) problems.push(j.id + ': a hero alone earned no Level XP, so nothing can be judged against it');
  }
  const cells = new Map();
  for (const j of jobs) {
    const [g, armId, seed, name] = j.id.split(':');
    if (name.startsWith('solo-')) continue;
    const key = [g, armId, name].join(':');
    const c = cells.get(key) || { g, armId, name, party: j.party, heads: [], built: [], picked: [], perSeed: [] };
    const head = at(j.id).party.levelXpPerHeroPerH;
    const built = meanOf(j.party.map((w) => soloOf(g, 'pull', w, seed)));
    c.heads.push(head); c.built.push(built);
    c.picked.push(j.party.map((w) => soloOf(g, armId, w, seed)));
    c.perSeed.push(head / built);
    cells.set(key, c);
  }
  const rows = [...cells.values()].map((c) => {
    const head = meanOf(c.heads), built = meanOf(c.built);
    /* The same heroes alone at THEIR better pull: each way's as-built or the arm's own, seeds pooled (a lone hero can press + too). */
    const best = meanOf(c.party.map((w, i) => Math.max(meanOf(c.built.map((_, s) => soloOf(c.g, 'pull', w, s))), meanOf(c.picked.map((p) => p[i])))));
    return { ...c, head: Math.round(head), mean: Math.round(built), ratio: head / built, worstSeed: Math.max(...c.perSeed), best: Math.round(best), vsBest: head / best };
  });
  return { rows, problems };
}

const armWords = (id) => ARMS.find((a) => a.id === id).words;
const cellWords = (r) => r.g + ', ' + armWords(r.armId) + ', ' + r.party.join('+') + ': ' + r.head + ' Level XP/h per head, ' + r.mean + ' alone as built = ' + r.ratio.toFixed(3)
  + ' (worst of ' + r.perSeed.length + ' seeds ' + r.worstSeed.toFixed(3) + ')' + (r.armId === 'pull' ? '' : ', ' + r.best + ' alone at the better pull = ' + r.vsBest.toFixed(3));

/* ── THE PROOF. Each mutant reaches the rule the way a data row or a code slip would, and plays the cell it should move. ── */
/* ONE TABLE (Tyler 2026-11-16; lane/d-flat-party-xp): the per-ground rows the old mutants edited are retired, so each slip is written against the one
   table's line as it stands (read here, so a retune of the numbers keeps every mutant aimed), and played where a party kills fastest against its
   heroes alone (the Barrow Muster and the Warrens, the grounds that set the one-class column). */
const TABLE_LINE = (/export const PARTY_CLASS_XP = row\(.*\);/.exec(readFileSync(join(ROOT, 'src/data/party-class-xp.js'), 'utf8')) || ['(no PARTY_CLASS_XP line)'])[0];
const { PARTY_CLASS_XP: TAB } = await import(pathToFileURL(join(ROOT, 'src/data/party-class-xp.js')).href + V);
const tableLine = (t) => 'export const PARTY_CLASS_XP = row([' + t[2].join(', ') + '], [' + t[3].join(', ') + '], [' + t[4].join(', ') + ']);';
const withCells = (n, cells) => tableLine({ ...TAB, [n]: cells });
const scaled = (k) => tableLine(Object.fromEntries([2, 3, 4].map((n) => [n, TAB[n].map((v) => Math.round(v * k))])));
const MUTANTS = [
  { name: 'a same-class pair paid the mix\'s cell', cells: [['muster_barrows', ['bow', 'bow']], ['coppercap_warrens', ['bow', 'bow']], ['muster_barrows', ['mage', 'mage']]],
    edits: [['src/data/party-class-xp.js', TABLE_LINE, withCells(2, [TAB[2][1], TAB[2][1]])]] },
  { name: 'every party reads its top cell, classes or no classes', cells: [['muster_barrows', ['bow', 'bow']], ['coppercap_warrens', ['bow', 'bow']]],
    edits: [['src/data/party-class-xp.js', 'const cell = cells[Math.min(Math.max(classes.length, 1), cells.length) - 1];', 'const cell = cells[cells.length - 1];']] },
  { name: 'a shield Melee and a Melee count as two classes', cells: [['muster_barrows', ['tank', 'axes']], ['coppercap_warrens', ['tank', 'axes']]],
    edits: [['src/data/party-class-xp.js', "melee: Object.freeze({ label: 'Melee', roles: Object.freeze(['tank', 'melee_dps']) }),",
      "melee: Object.freeze({ label: 'Melee', roles: Object.freeze(['melee_dps']) }), tanks: Object.freeze({ label: 'Tank', roles: Object.freeze(['tank']) }),"]] },
  /* (re-aimed, lane/c-brook-bear: Tyler 2026-11-11 retired the ground's party pull, so the plant brings one back in the engine, the full box for a party) */
  { name: 'a party with no pick draws the full box (the Cellar pair)', cells: [['mill_cellar', ['bow', 'bow']]],
    edits: [['src/data/hunt-grounds.js', 'const p = Number.isInteger(pick) && pick > 0 ? pick : 0;', 'const p = Number.isInteger(pick) && pick > 0 ? pick : (n > 1 ? 8 : 0);']] },
  /* A ONE-CLASS CELL PAID LIKE A MIX on the other sizes, and a four's shares lifted in the engine. */
  { name: 'a three of one class paid the mix\'s cell', cells: [['muster_barrows', LARGER.wands3], ['coppercap_warrens', LARGER.bows3]],
    edits: [['src/data/party-class-xp.js', TABLE_LINE, withCells(3, [TAB[3][2], TAB[3][2], TAB[3][2]])]] },
  { name: 'a four of one class paid the mix\'s cell', cells: [['muster_barrows', LARGER.wands4], ['coppercap_warrens', LARGER.bows4]],
    edits: [['src/data/party-class-xp.js', TABLE_LINE, withCells(4, [TAB[4][3], TAB[4][3], TAB[4][3], TAB[4][3]])]] },
  { name: 'a four\'s shares x3 in the engine', cells: [['muster_barrows', LARGER.wands4], ['meadowbrook_thicket', LARGER.wands4]],
    edits: [['src/core/hunt/xp-share.js', 'const paid = (raw * party * multOf(sc, h)) / 1000;', 'const paid = (raw * party * (heroes.length === 4 ? 3 : 1) * multOf(sc, h)) / 1000;']] },
];

/* THE HARDER TIERS' BARS BITE (Tyler 2026-11-16): the table at the old per-ground rows' scale, a table cut so deep a Deadly mix earns under its
   heroes alone, a mix read as one class, and ONE GROUND PAID ITS OWN CELL (the stopgap's shape, typed in the engine): each plays its ground's tier at the
   floor, one seed, against the same tree's lone ways on the tier. */
const TIER_MUTANTS = [
  { name: 'the table at the old rows\' scale (x1.7): a Deadly four past ' + PACE_CAP + 'x the contract', g: 'mosslight_glade', tier: 'deadly', party: 'four', bar: 'pace',
    edits: [['src/data/party-class-xp.js', TABLE_LINE, scaled(1.7)]] },
  { name: 'the table cut too deep (x0.5): a Deadly mix under its heroes alone', g: 'hasks_ford', tier: 'deadly', party: 'duo tank+healer', bar: 'alone',
    edits: [['src/data/party-class-xp.js', TABLE_LINE, scaled(0.5)]] },
  { name: 'a mixed party\'s cell read as one class on Dangerous (the Glade three)', g: 'mosslight_glade', tier: 'dangerous', party: 'trio tank+healer+bow', bar: 'alone',
    edits: [['src/data/party-class-xp.js', 'const cell = cells[Math.min(Math.max(classes.length, 1), cells.length) - 1];', 'const cell = cells[0];']] },
  /* lane/d-party-pace: the pace read at Level 10 on a ground whose floor is under it still bites */
  { name: 'the Sewer\'s Deadly pays x2.5 a kill: a four at Level 10 past ' + PACE_CAP + 'x the contract', g: 'millrace_sewer', tier: 'deadly', party: 'four', bar: 'pace',
    edits: [['src/data/balance-sheet.js', 'deadly: Object.freeze({ hpPm: 1250, xpPm: 1220 }) }),', 'deadly: Object.freeze({ hpPm: 1250, xpPm: 3050 }) }),']] },
  /* A HEALER'S TIER (lane/d-142-rulings): it excuses a mix with no Healer only, and only where the data makes it one. With a Healer the bar binds
     there as anywhere (Krell's Hold's Deadly is a Healer's tier at its floor); and the Catacombs' tank and bow pair, printed today, binds the day its
     Deadly stops being a Healer's tier at the floor */
  { name: 'the table cut too deep on a Healer\'s tier (x0.5): Krell\'s Hold\'s Deadly pair WITH a Healer under its heroes alone', g: 'krells_hold', tier: 'deadly', party: 'duo tank+healer', bar: 'alone',
    edits: [['src/data/party-class-xp.js', TABLE_LINE, scaled(0.5)]] },
  /* (seed 0 alone reads that pair at 1.07, the two seeds' 0.968: the table cut makes it plainly under, and only the moved row lets the bar see it) */
  { name: 'the Catacombs\' Deadly no Healer\'s tier at its floor (healerTiers 165) and the table cut (x0.5): the tank and bow pair binds and reads under its heroes alone', g: 'unmarked_catacombs', tier: 'deadly', party: 'duo tank+bow', bar: 'alone',
    edits: [['src/data/grounds/unmarked_catacombs/pack.js', '  healerTiers: { deadly: 186 },', '  healerTiers: { deadly: 165 },'], ['src/data/party-class-xp.js', TABLE_LINE, scaled(0.5)]] },
  { name: 'one ground pays its own cell (Hask\'s Ford x1.7, typed in the engine)', g: 'hasks_ford', tier: 'deadly', party: 'four', bar: 'pace',
    edits: [['src/core/hunt/xp-share.js', 'const cell = partyClassXp(heroes.map((h) => h.role)).permille;', "const cell = Math.round(partyClassXp(heroes.map((h) => h.role)).permille * (ground && ground.id === 'hasks_ford' ? 1.7 : 1));"]] },
];

/* ONE TABLE, READ STATICALLY (Tyler 2026-11-16): the table holds party sizes and nothing else; no ground pack carries a pay cell of its own; the reader
   takes the party's roles, never a ground. Each answer is a reason, null when it holds. `P`: the party-class-xp.js module, `packs`: GROUND_PACKS. */
function oneTableProblems(P, packs) {
  const out = [];
  if (Object.keys(P.PARTY_CLASS_XP).join() !== '2,3,4') out.push('the party table names ' + Object.keys(P.PARTY_CLASS_XP) + ', not the sizes 2, 3 and 4');
  for (const p of packs) if (p.partyClassXp !== undefined) out.push('the ' + p.id + ' pack carries its own party cell');
  if (P.partyClassXp.length !== 1) out.push('partyClassXp reads ' + P.partyClassXp.length + ' arguments: the party\'s roles only, never a ground');
  return out;
}
const STATIC_MUTANTS = [
  { name: 'a ground pack brings back its own party cell', edits: [['src/data/grounds/hasks_ford/pack.js', "  partyVsAlone: {", "  partyClassXp: { 2: [990, 1760], 3: [1150, 2145, 2310], 4: [1150, 2700, 3025, 3030] },\n  partyVsAlone: {"]] },
  { name: 'the table keyed by ground again', edits: [['src/data/party-class-xp.js', TABLE_LINE, 'export const PARTY_CLASS_XP = Object.freeze({ ...row([990, 1500], [990, 1580, 1700], [970, 1450, 1615, 1650]), mosslight_glade: row([1085, 2035], [1290, 2190, 2360], [1270, 2730, 2940, 3000]) });']] },
  { name: 'the reader takes a ground again', edits: [['src/data/party-class-xp.js', 'export function partyClassXp(roles) {', 'export function partyClassXp(roles, groundId) {']] },
];

async function mutate() {
  let escaped = 0;
  const pull = ARMS[0];
  /* THE CONTROL: on this tree every party a mutant plays stands under the bar, so a mutant's red is the mutant's. */
  const ratioOn = (R, g, party) => {
    const solos = new Map();
    for (const w of new Set(party)) solos.set(w, R.runCell(cellOf(g, pull, 0, [w], 'solo-' + w)).heroes[0].levelXpPerH);
    return R.runCell(cellOf(g, pull, 0, party, 'x')).party.levelXpPerHeroPerH / meanOf(party.map((w) => solos.get(w)));
  };
  const Rh = await loadCellRunner(ROOT);
  const over = [...new Set(MUTANTS.flatMap((mu) => mu.cells.map(([g, party]) => g + ':' + party.join('+'))))]
    .map((k) => { const [g, p] = k.split(':'); return [k, ratioOn(Rh, g, p.split('+'))]; }).filter(([, r]) => !(r <= BAR));
  if (over.length) { console.log('  ✗ CONTROL: on this tree ' + over.map(([k, r]) => k + ' ' + r.toFixed(3)).join(', ') + ' already over ' + BAR.toFixed(2)); escaped++; }
  for (const mu of MUTANTS) {
    const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
    try {
      const R = await loadCellRunner(p.root);
      const seen = mu.cells.map(([g, party]) => ({ ratio: ratioOn(R, g, party), bar: BAR }));
      const hit = seen.some((x) => x.ratio > x.bar);
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + mu.name + ' (' + seen.map((x) => x.ratio.toFixed(3) + ' against ' + x.bar.toFixed(2)).join(', ') + ')');
      if (!hit) escaped++;
    } finally { p.done(); }
  }
  /* the harder tiers: a control on this tree first, then each mutant turns its bar red */
  /* the Healer's tier as the tree under test writes it (a mutant may move a pack's healerTiers), the verdict's own excuse (tierRed) */
  const healerTierOn = async (root, mu) => healerless(TIER_MIXED[mu.party])
    && (await import(pathToFileURL(join(root, 'src/data/hunt-tiers.js')).href + V + (V ? '&' : '?') + 'm=' + Math.random())).isHealerTier(mu.g, mu.tier, floorOf(mu.g));
  const tierOn = (R, mu) => {
    const party = TIER_MIXED[mu.party];
    const same = meanOf(party.map((w) => R.runCell(tierCellOf(mu.g, mu.tier, 0, [w], 'solo-' + w)).heroes[0].levelXpPerH));
    const head = R.runCell(tierCellOf(mu.g, mu.tier, 0, party, mu.party)).party.levelXpPerHeroPerH;
    /* the pace bar plays the four where the run reads it (paceLevelOf) */
    const paced = mu.bar === 'pace' && paceLevelOf(mu.g) !== floorOf(mu.g) ? R.runCell(tierCellOf(mu.g, mu.tier, 0, party, mu.party, undefined, undefined, paceLevelOf(mu.g))).party.levelXpPerHeroPerH : head;
    return { alone: head / same, pace: paced / contractXpPerH(paceLevelOf(mu.g)) };
  };
  const redOf = (mu, x) => (mu.bar === 'pace' ? !(x.pace <= PACE_CAP) : !x.healerTier && !(x.alone >= ALONE_BAR));
  const said = (mu, x) => (mu.bar === 'pace' ? x.pace.toFixed(2) + 'x the contract against ' + PACE_CAP : x.alone.toFixed(3) + ' of the same heroes alone against ' + ALONE_BAR.toFixed(2)
    + (x.healerTier ? ', a Healer\'s tier with no Healer (printed)' : ''));
  for (const mu of TIER_MUTANTS) {
    const here = { ...tierOn(Rh, mu), healerTier: await healerTierOn(ROOT, mu) };
    if (redOf(mu, here)) { console.log('  ✗ CONTROL: on this tree ' + mu.g + ' ' + mu.tier + ' ' + mu.party + ' already reads ' + said(mu, here)); escaped++; continue; }
    const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
    try {
      const x = { ...tierOn(await loadCellRunner(p.root), mu), healerTier: await healerTierOn(p.root, mu) };
      const hit = redOf(mu, x);
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + mu.name + ' (' + said(mu, x) + ')');
      if (!hit) escaped++;
    } finally { p.done(); }
  }
  /* ONE TABLE, read statically: the control holds on this tree, each mutant names its reason. A tree whose data refuses to load (grounds/shape.js
     refuses a pack's own pay cell at definePack) is caught by that refusal: its message is the reason. */
  const staticOn = async (root) => {
    try {
      return oneTableProblems(await import(pathToFileURL(join(root, 'src/data/party-class-xp.js')).href + V + (V ? '&' : '?') + 'm=' + Math.random()),
        (await import(pathToFileURL(join(root, 'src/data/grounds/index.js')).href + V + (V ? '&' : '?') + 'm=' + Math.random())).GROUND_PACKS);
    } catch (e) { return ['the data refuses to load: ' + (e && e.message ? e.message : String(e))]; }
  };
  const here = await staticOn(ROOT);
  if (here.length) { console.log('  ✗ CONTROL: on this tree ' + here.join('; ')); escaped++; }
  for (const mu of STATIC_MUTANTS) {
    const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
    try {
      const why = await staticOn(p.root);
      console.log('  ' + (why.length ? 'caught ' : 'ESCAPED') + ' ' + mu.name + (why.length ? ' (' + why.join('; ') + ')' : ''));
      if (!why.length) escaped++;
    } finally { p.done(); }
  }
  const all = MUTANTS.length + TIER_MUTANTS.length + STATIC_MUTANTS.length;
  console.log(escaped ? 'party-class-xp-line --mutate: ' + escaped + ' ESCAPED' : 'party-class-xp-line --mutate: ' + all + '/' + all + ' caught');
  process.exitCode = escaped ? 1 : 0;
}

/* THE PARTY WINDOW'S LINES, MEASURED (--write; the method of party-class-xp.js PARTY_VS_ALONE), ONE PER TIER the ground offers (lane/d-party-pace: the window
   reads the leader's tier). Each at the floor, on the tier's own pull, a head against the same heroes alone ON THAT TIER, in whole percent to the nearest 5.
   Normal: one class is the mean of its one-class parties of that size; two of two, three of three and four of four the mean of the played mixes; three of
   two, four of two and four of three the size's mix times the table's cell ratio (a cell moves no blow). Dangerous and Deadly (the harder-tier arm's cells):
   two of two the mean of the two played pairs, three of three the trio, four of four the four, every other cell the size's mix times the cell ratio.
   Answers { ground: { normal: { 2: [..], 3: [..], 4: [..] }, dangerous?: .., deadly?: .. } }. */
function linesOf(rows, tierRows, table) {
  const five = (r) => Math.round(((r - 1) * 100) / 5) * 5 || 0;
  const scaled = (m2, m3, m4, one2, one3, one4) => ({ 2: [five(one2 === null ? (m2 * table[2][0]) / table[2][1] : one2), five(m2)],
    3: [five(one3 === null ? (m3 * table[3][0]) / table[3][2] : one3), five((m3 * table[3][1]) / table[3][2]), five(m3)],
    4: [five(one4 === null ? (m4 * table[4][0]) / table[4][3] : one4), five((m4 * table[4][1]) / table[4][3]), five((m4 * table[4][2]) / table[4][3]), five(m4)] });
  const out = {};
  for (const g of groundIds) {
    const on = rows.filter((r) => r.g === g && r.armId === 'pull');
    const one = (n) => meanOf(on.filter((r) => !Object.hasOwn(MIXED, r.name) && r.party.length === n).map((r) => r.ratio));
    const mix = (n) => meanOf(on.filter((r) => Object.hasOwn(MIXED, r.name) && r.party.length === n).map((r) => r.ratio));
    out[g] = { normal: scaled(mix(2), mix(3), mix(4), one(2), one(3), one(4)) };
    for (const tier of harderOf(g)) {
      const t = (name) => tierRows.find((r) => r.g === g && r.tier === tier && r.name === name).alone;
      out[g][tier] = scaled(meanOf([t('duo tank+healer'), t('duo tank+bow')]), t('trio tank+healer+bow'), t('four'), null, null, null);
    }
  }
  return out;
}

/** Write each ground's line where it lives: the base grounds' rows in party-class-xp.js, a pack's in its pack.js. Answers the files written. */
function writeLines(lines, packIds) {
  const said = (r) => 'said([' + r[2].join(', ') + '], [' + r[3].join(', ') + '], [' + r[4].join(', ') + '])';
  const plain = (r) => '{ 2: [' + r[2].join(', ') + '], 3: [' + r[3].join(', ') + '], 4: [' + r[4].join(', ') + '] }';
  const each = (byTier, one) => Object.entries(byTier).map(([tier, r]) => tier + ': ' + one(r)).join(', ');
  const written = [];
  const pcx = join(ROOT, 'src/data/party-class-xp.js');
  let src = readFileSync(pcx, 'utf8');
  for (const [g, byTier] of Object.entries(lines)) {
    if (packIds.includes(g)) {
      const f = join(ROOT, 'src/data/grounds', g, 'pack.js');
      const ps = readFileSync(f, 'utf8'), re = /^ {2}partyVsAlone: \{ normal: .*\},$/m;
      if (!re.test(ps)) throw new Error(g + ': its pack has no partyVsAlone line to write');
      writeFileSync(f, ps.replace(re, '  partyVsAlone: { ' + each(byTier, plain) + ' },'));
      written.push('src/data/grounds/' + g + '/pack.js');
    } else {
      const re = new RegExp('^ {2}' + g + ': lines\\(\\{ normal: .*\\}\\),$', 'm');
      /* a Catacomb wing carries the Catacombs' line (src/data/catacomb-wings.js) until the designer writes its own: printed above, not written */
      if (!re.test(src) && Object.prototype.hasOwnProperty.call(CATACOMB_WING_GROUNDS, g)) { console.log('  (' + g + ' carries the Catacombs line: measured, not written)'); continue; }
      if (!re.test(src)) throw new Error(g + ': party-class-xp.js has no BASE_VS_ALONE row to write');
      src = src.replace(re, '  ' + g + ': lines({ ' + each(byTier, said) + ' }),');
    }
  }
  writeFileSync(pcx, src);
  written.push('src/data/party-class-xp.js');
  return written;
}

async function main() {
  if (process.argv.includes('--mutate')) return mutate();
  const P = await import(pathToFileURL(join(ROOT, 'src/data/party-class-xp.js')).href + V);
  const { GROUND_PACKS } = await import(pathToFileURL(join(ROOT, 'src/data/grounds/index.js')).href + V);
  const bad = [...oneClassProblems(), ...oneTableProblems(P, GROUND_PACKS)];
  if (bad.length) { for (const b of bad) console.log('  ✗ ' + b); process.exitCode = 1; return; }
  if (!groundIds.length) { console.log('  ✗ no grounds to play'); process.exitCode = 1; return; }
  const seeds = argOf('--seeds', 3), workers = argOf('--workers', 4);
  const lineJobs = planOf(seeds, process.argv.includes('--mixed'));
  const tierJobs = tierPlanOf(seeds);
  const jobs = [...lineJobs, ...tierJobs];
  const mixedNames = Object.keys(MIXED);
  const tmp = mkdtempSync(join(tmpdir(), 'party-class-xp-'));
  const out = join(tmp, 'cells.jsonl');
  const t0 = Date.now();
  let code = 2;
  try {
    /* cpuMax 101: never hold. The pool's own workers are the load here, on a CI box of this many cores. */
    const res = await runPool(jobs, out, { root: ROOT, workers, cpuMax: 101, log: () => {} });
    if (res.failed || res.done !== jobs.length) { console.log('  ✗ ' + res.failed + ' cell(s) failed, ' + res.done + ' of ' + jobs.length + ' played'); return; }
    const played = new Map(readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { const c = JSON.parse(l); return [c.id, c]; }));
    const cpu = [...played.values()].reduce((s, c) => s + c.ms, 0);
    const { rows, problems } = judge(lineJobs, (id) => played.get(id));
    const tierRows = judgeTiers(tierJobs, (id) => played.get(id));
    for (const r of tierRows) if (process.argv.includes('--table') || r.name === 'four' || r.healerTier || tierRed(r)) console.log('  TIER ' + tierWords(r));
    const tierReds = tierRows.filter(tierRed);
    for (const g of Object.keys(STANDS)) {
      const mine = tierRows.filter((r) => r.g === g && r.alone !== null);
      if (!mine.length) continue;
      const low = mine.reduce((m, r) => (r.alone < m.alone ? r : m));
      console.log('  STANDS (' + STANDS[g] + ') ' + g + ': its harder-tier mixes read ' + Math.min(...mine.map((r) => r.alone)).toFixed(2) + '-' + Math.max(...mine.map((r) => r.alone)).toFixed(2)
        + ' of the same heroes alone (lowest ' + low.tier + ' ' + low.party.join('+') + ')' + (mine.every((r) => r.alone >= ALONE_BAR) ? '; every mix at or over the bar now, so this line can go' : ''));
    }
    const paths = bothPaths(await loadCellRunner(ROOT));
    if (paths) problems.push(paths);
    const same = rows.filter((r) => !mixedNames.includes(r.name));
    if (process.argv.includes('--table')) for (const r of same) console.log('  ' + cellWords(r));
    if (process.argv.includes('--write')) {
      if (!process.argv.includes('--mixed')) { console.log('  ✗ --write needs --mixed (the lines read the mixes)'); return; }
      const lines = linesOf(rows, tierRows, P.PARTY_CLASS_XP);
      for (const [g, r] of Object.entries(lines)) console.log('  LINE ' + g.padEnd(20) + JSON.stringify(r) + (JSON.stringify(r) === JSON.stringify(P.PARTY_VS_ALONE[g]) ? ' (as written)' : ' (was ' + JSON.stringify(P.PARTY_VS_ALONE[g]) + ')'));
      console.log('  wrote ' + writeLines(lines, GROUND_PACKS.map((x) => x.id)).join(', '));
    }
    for (const r of rows.filter((x) => mixedNames.includes(x.name))) console.log('  MIXED ' + cellWords(r));
    for (const g of groundIds) for (const arm of ARMS) {
      const on = (r) => (arm.id === 'pull' ? r.ratio : r.vsBest);
      const top = same.filter((r) => r.g === g && r.armId === arm.id).sort((a, b) => on(b) - on(a))[0];
      console.log('  ' + g.padEnd(20) + arm.words.padEnd(13) + ' worst ' + on(top).toFixed(3) + ' ' + top.party.join('+'));
    }
    const eight = same.filter((r) => r.armId === 'eight');
    console.log('  8 each against alone as built (read, not the bar): ' + eight.filter((r) => r.ratio > BAR).length + ' of ' + eight.length + ' cells over ' + BAR.toFixed(2));
    const reds = same.filter((r) => (r.armId === 'pull' ? r.ratio : r.vsBest) > BAR);
    for (const p of problems) console.log('  ✗ ' + p);
    for (const r of reds) console.log('  ✗ ' + cellWords(r));
    for (const r of tierReds) console.log('  ✗ TIER ' + tierWords(r));
    const ok = !reds.length && !tierReds.length && !problems.length;
    console.log('party-class-xp-line: ' + (ok ? 'green' : 'RED, ' + reds.length + ' cell(s) over the line, ' + tierReds.length + ' harder-tier mix(es) off its bars') + ': ' + same.length + ' party cells on ' + groundIds.length + ' grounds, ' + seeds + ' seeds, bar ' + BAR.toFixed(2)
      + '; one table; ' + tierRows.length + ' harder-tier parties, every mix at or over its heroes alone (' + ALONE_BAR.toFixed(2) + '), a Deadly four at most ' + PACE_CAP + 'x the contract, both paths ' + (paths ? 'APART' : 'the same') + ', ' + Math.round((Date.now() - t0) / 1000) + ' s (' + Math.round(cpu / 1000) + ' s of cells)');
    code = ok ? 0 : 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    process.exitCode = code;
  }
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
