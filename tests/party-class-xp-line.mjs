#!/usr/bin/env node
// tests/party-class-xp-line.mjs — A SAME-CLASS PARTY NEVER BEATS SOLO, PER HEAD (Tyler 2026-10-31).
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
//   --lines      every ground's Party window line, measured, beside what the data says
//   --write      writes the measured lines into the rows (the default cut only, so what the guard reads is what is written)
//   --seed-base N   plays seeds N.. instead of 0.. (the designer's read of how far fresh dice move a line; never with --write)
//   --middle     plays the band's middle Level instead of its floor (the designer's read of how a line moves through the band; never with --write)
//
// THE PARTY WINDOW'S LINE IS MEASURED TOO (lane/d-party-lines, 2026-11-15). Before a hunt the Party window says "Each of you gets about
// N% more (or less) Level XP than hunting alone" (party-class-xp.js PARTY_VS_ALONE, a pack's partyVsAlone). The same cells answer it, by
// the method the rows were always measured with: one class is the mean of the size's five one-class parties; two of two the mean of
// the three duo mixes, three of three of the two trio mixes, four of four the four; a cell between (three of two, four of two and of
// three) is its size's mix times the pay cell's ratio (a party's XP cell moves no blow). Each against the same heroes alone as built.
// A line more than LINE_TOL points from that measurement is RED: a pay cell, a lone hero or a monster moved and nobody re-measured
// what the player reads. --write puts the fresh measurement into the rows, never a hand.
//
// NO EXCEPTION (lane/b-one-difficulty, 2026-11-08): every cell answers to 1.00. Tyler 11-02's one accepted over-solo party, a Thicket four of
// wands at its default pull (bar 1.05), reads 0.74 since a monster pays its whole kill for any party size, so its allowance and its five mutants retire.
//
// mutant-anchors: src/data/party-class-xp.js src/data/hunt-grounds.js src/core/hunt/xp-share.js
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ROOT, plant } from './hunt-core/fixtures/h1.js';
import { PLAY_TREES } from './hunt-core/fixtures/play-ground.mjs';
import { loadCellRunner } from '../tools/balance-sim/cell.mjs';
import { runPool } from '../tools/balance-sim/pool.mjs';

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
/* THE LINE'S PARTIES: the one-class parties of a size, and the mixes of a size (each mix holds as many classes as heroes). */
const ONE_CLASS_OF = Object.freeze({ 2: Object.keys(DUOS), 3: Object.keys(LARGER).filter((n) => LARGER[n].length === 3), 4: Object.keys(LARGER).filter((n) => LARGER[n].length === 4) });
const MIXES_OF = Object.freeze({ 2: ['duo tank+healer', 'duo tank+bow', 'duo tank+wand'], 3: ['trio tank+healer+bow', 'trio tank+healer+wand'], 4: ['four'] });
/* HOW FAR A LINE MAY SIT FROM A FRESH MEASUREMENT, in points of the percent the player reads. The rows are whole fives, so a line
   written from one set of dice reads up to 2.5 off it by rounding, and fresh dice move a measured line too. Measured (lane/d-party-lines,
   2026-11-15, all 135 lines): seeds 3-5 against seeds 0-2 moved a line by a median 0.9 points and at most 4.8, and lines written from
   either set read at most 6.0 off the other. 7.5 sits over that, and a red means a line a step and a half off or more: the drift that
   opened this (the board's "The Mage at 110 and up") was 10-20 points, Pyre Field's four saying +0 where it measured +20. */
const LINE_TOL = 7.5;

const argOf = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : dflt; };
const SEED_BASE = argOf('--seed-base', 0);

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const G = await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href + V);
const { HUNT_INDEX } = await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href + V);
const PCX_HERE = await import(pathToFileURL(join(ROOT, 'src/data/party-class-xp.js')).href + V);
const { PARTY_CLASSES } = PCX_HERE;
const { STYLES } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/gear.mjs')).href);

const groundIds = Object.keys(G.HUNT_GROUNDS);
const floorOf = (g) => HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band[0];
/* --middle: the band's middle Level instead of its floor (a designer's read; never with --write) */
const MIDDLE = process.argv.includes('--middle');
const levelOf = (g) => { const b = HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band; return MIDDLE ? Math.round((b[0] + b[1]) / 2) : b[0]; };
/* A STAGED ground (a pack not yet open) is played as it ships, its own drops on the gear ladder (tools/balance-sim/gear.mjs openAlso,
   the grader's rule): otherwise a ground whose tier drops only there is played a tier under. With it, every staged ground at or under its
   floor: packs ship in road order, so the Pauper Vaults (165) is reached in the Morrow's Dawnsteel (tools/pack.mjs check --with, its board
   section), where with its own drops alone every way played its legs, boots, gloves and belt a tier short (Ember for Dawnsteel; lane/d-party-lines). */
const isOpen = (g) => Object.prototype.hasOwnProperty.call(G.OPEN_GROUNDS, g);
const stagedGear = (g) => (isOpen(g) ? {} : { gear: { openAlso: groundIds.filter((x) => !isOpen(x) && floorOf(x) <= floorOf(g)) } });

const cellOf = (g, arm, seed, party, name) => ({
  id: [g, arm.id, seed, name].join(':'), ground: g, party, level: levelOf(g), hours: party.length === 1 && arm.density === null ? SOLO_HOURS : HOURS, seeds: 1, seedBase: SEED_BASE + seed,
  ...(arm.density === null ? {} : { density: arm.density }), ...stagedGear(g),
});

function oneClassProblems() {
  const classOf = (style) => Object.keys(PARTY_CLASSES).find((c) => PARTY_CLASSES[c].roles.includes(STYLES[style].role));
  return Object.entries({ ...DUOS, ...LARGER }).filter(([, p]) => new Set(p.map(classOf)).size !== 1).map(([n, p]) => n + ' (' + p + ') is not one class');
}

/** The cells a sweep plays. The CI cut: the default pull every seed for duos and lone heroes, the first seed for a larger
    party; 8 each, the first two seeds for duos and lone heroes, the first for a four. --wide: larger parties two seeds and
    every seed at 8 each. A party cell and its lone heroes share their seeds, so each cell's solos are played. */
function planOf(seeds, only = {}) {
  const jobs = [];
  const want = (name) => !only.parties || only.parties.includes(name);
  for (const g of only.grounds || groundIds) for (const arm of only.arms || ARMS) for (let seed = 0; seed < seeds; seed++) {
    const eight = arm.density !== null;
    if (!WIDE && eight && seed > 1) continue;
    for (const w of WAYS) jobs.push(cellOf(g, arm, seed, [w], 'solo-' + w));
    for (const [n, p] of Object.entries(DUOS)) if (want(n)) jobs.push(cellOf(g, arm, seed, p, n));
    if (seed < (WIDE && !eight ? 2 : 1)) for (const [n, p] of Object.entries(LARGER)) if ((WIDE || !eight || p.length === 4) && want(n)) jobs.push(cellOf(g, arm, seed, p, n));
    /* the mixes, every seed at the default pull: the Party window's line is read off them (--mixed prints them, 10-25 §5) */
    if (!eight) for (const [n, p] of Object.entries(MIXED)) if (want(n)) jobs.push(cellOf(g, arm, seed, p, n));
  }
  return jobs;
}

/** THE PARTY WINDOW'S LINE, MEASURED: { ground: { size: [percent at 1 class, at 2, ...] } }, unrounded, read off judge's default-pull rows
    and the pay table `PC` (the tree's own party-class-xp.js). A ground with no pay row is left out; a cell whose parties weren't played is NaN. */
function linesOf(rows, PC) {
  const at = new Map(rows.filter((r) => r.armId === 'pull').map((r) => [r.g + ':' + r.name, r.ratio]));
  const mean = (g, names) => { const v = names.map((n) => at.get(g + ':' + n)); return v.every(Number.isFinite) ? meanOf(v) : NaN; };
  const out = {};
  for (const g of new Set(rows.map((r) => r.g))) {
    const pay = PC.PARTY_CLASS_XP[g];
    if (!pay) continue;
    const row = {};
    for (const n of [2, 3, 4]) {
      const top = mean(g, MIXES_OF[n]), c = pay[n];
      row[n] = c.map((_, i) => (i === 0 ? mean(g, ONE_CLASS_OF[n]) : (top * c[i]) / c[c.length - 1])).map((r) => (r - 1) * 100);
    }
    out[g] = row;
  }
  return out;
}
/* whole fives, as the window reads them (never a "-0") */
const fiveOf = (x) => { const v = Math.round(x / 5) * 5; return v === 0 ? 0 : v; };

/** Every line cell more than LINE_TOL from its measurement: [{ g, n, k, said, got }] (k = the classes held). `said`: the tree's PARTY_VS_ALONE. */
function lineDrift(lines, said) {
  const out = [];
  for (const [g, row] of Object.entries(lines)) for (const n of [2, 3, 4]) row[n].forEach((got, i) => {
    if (!Number.isFinite(got)) return;
    const s = said[g] && said[g][n] ? said[g][n][i] : undefined;
    if (!Number.isInteger(s) || Math.abs(got - s) > LINE_TOL) out.push({ g, n, k: i + 1, said: s, got });
  });
  return out;
}
const lineWords = (d) => d.g + ', ' + d.n + ' heroes of ' + d.k + ' class' + (d.k > 1 ? 'es' : '') + ': the Party window says ' + d.said + '%, measured ' + d.got.toFixed(1) + '%';

/* THE WRITER. A ground's line lives in its pack (`partyVsAlone: { 2: [..], 3: [..], 4: [..] },`) or in party-class-xp.js BASE_VS_ALONE
   (`<ground>: said([..], [..], [..]),`). Exactly one row is replaced per ground, any other count refuses. Answers the [file, ground] pairs written. */
function writeLines(lines) {
  const arr = (a) => '[' + a.map(fiveOf).join(', ') + ']';
  const done = [];
  for (const [g, row] of Object.entries(lines)) {
    if ([2, 3, 4].some((n) => row[n].some((x) => !Number.isFinite(x)))) throw new Error('party line writer: ' + g + ' was not measured whole');
    const packFile = join('src/data/grounds', g, 'pack.js');
    let pack = false;
    try { pack = /\bpartyVsAlone:/.test(readFileSync(join(ROOT, packFile), 'utf8')); } catch { pack = false; }
    const file = pack ? packFile : 'src/data/party-class-xp.js';
    const re = pack ? /^(\s*)partyVsAlone: \{ 2: \[[^\]]*\], 3: \[[^\]]*\], 4: \[[^\]]*\] \},$/gm
      : new RegExp('^(\\s*)' + g + ': said\\(\\[[^\\]]*\\], \\[[^\\]]*\\], \\[[^\\]]*\\]\\),$', 'gm');
    const src = readFileSync(join(ROOT, file), 'utf8');
    const hits = src.match(re) || [];
    if (hits.length !== 1) throw new Error('party line writer: ' + file + ' has ' + hits.length + ' rows for ' + g);
    const to = pack ? 'partyVsAlone: { 2: ' + arr(row[2]) + ', 3: ' + arr(row[3]) + ', 4: ' + arr(row[4]) + ' },'
      : g + ': said(' + arr(row[2]) + ', ' + arr(row[3]) + ', ' + arr(row[4]) + '),';
    writeFileSync(join(ROOT, file), src.replace(re, (_, ind) => ind + to));
    done.push([file, g]);
  }
  return done;
}

/** Play `jobs` on the tree at `root` through the pool: a Map of id -> metrics, or null with the failure printed. */
async function playAll(root, jobs, workers) {
  const tmp = mkdtempSync(join(tmpdir(), 'party-class-xp-'));
  const out = join(tmp, 'cells.jsonl');
  try {
    /* cpuMax 101: never hold. The pool's own workers are the load here, on a CI box of this many cores. */
    const res = await runPool(jobs, out, { root, workers, cpuMax: 101, log: () => {} });
    if (res.failed || res.done !== jobs.length) { console.log('  ✗ ' + res.failed + ' cell(s) failed, ' + res.done + ' of ' + jobs.length + ' played'); return null; }
    return new Map(readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { const c = JSON.parse(l); return [c.id, c]; }));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
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
const MUTANTS = [
  { name: 'the Sewer pays a same-class pair 1425', cells: [['millrace_sewer', ['bow', 'bow']]],
    edits: [['src/data/party-class-xp.js', 'millrace_sewer: row([1110, 1820]', 'millrace_sewer: row([1425, 1820]']] },
  /* RE-AIMED (lane/d-party-xp-cells, 2026-11-11): with one pack for every group a one-class Wickstead pair reads 0.60-0.66 at its cell, so a 1300 slip
     stays under; the slip that matters now is a one-class pair paid the mix's cell. */
  { name: 'Wickstead pays a same-class pair the mix\'s 2420', cells: [['wickstead', ['bow', 'bow']], ['wickstead', ['tank', 'tank']], ['wickstead', ['healer', 'healer']]],
    edits: [['src/data/party-class-xp.js', 'wickstead: row([1070, 2420]', 'wickstead: row([2420, 2420]']] },
  { name: 'a one-class pair paid 1645 on one row (the Warrens)', cells: [['coppercap_warrens', ['bow', 'bow']]],
    edits: [['src/data/party-class-xp.js', 'coppercap_warrens: row([1085, 1500]', 'coppercap_warrens: row([1645, 1500]']] },
  { name: 'every party reads its top cell, classes or no classes', cells: [['mosslight_glade', ['bow', 'bow']], ['wickstead', ['bow', 'bow']]],
    edits: [['src/data/party-class-xp.js', 'return { permille: cells[Math.min(Math.max(classes.length, 1), cells.length) - 1], classes };', 'return { permille: cells[cells.length - 1], classes };']] },
  { name: 'a shield Melee and a Melee count as two classes', cells: [['millrace_sewer', ['tank', 'axes']], ['meadowbrook_thicket', ['tank', 'axes']]],
    edits: [['src/data/party-class-xp.js', "melee: Object.freeze({ label: 'Melee', roles: Object.freeze(['tank', 'melee_dps']) }),",
      "melee: Object.freeze({ label: 'Melee', roles: Object.freeze(['melee_dps']) }), tanks: Object.freeze({ label: 'Tank', roles: Object.freeze(['tank']) }),"]] },
  /* (re-aimed, lane/c-brook-bear: Tyler 2026-11-11 retired the ground's party pull, so the plant brings one back in the engine, the full box for a party) */
  { name: 'a party with no pick draws the full box (the Cellar pair)', cells: [['mill_cellar', ['bow', 'bow']]],
    edits: [['src/data/hunt-grounds.js', 'const p = Number.isInteger(pick) && pick > 0 ? pick : 0;', 'const p = Number.isInteger(pick) && pick > 0 ? pick : (n > 1 ? 8 : 0);']] },
  /* A ONE-CLASS CELL PAID LIKE A MIX, on another size and another ground than the rows above, and a four's shares lifted in the engine. */
  /* RE-AIMED (lane/d-party-xp-cells): the mixes' cells roughly doubled when the party pull went (Tyler 11-11), so each slip pays the NEW mix cell,
     and the engine slip lifts a four's shares x3 (x1.5 reads a Thicket four of wands 0.62, under the bar by design now). */
  { name: 'the Thicket\'s three of wands paid a mix\'s 2750', cells: [['meadowbrook_thicket', LARGER.wands3]],
    edits: [['src/data/party-class-xp.js', 'meadowbrook_thicket: row([1145, 2375], [1110, 2750, 3055]', 'meadowbrook_thicket: row([1145, 2375], [2750, 2750, 3055]']] },
  { name: 'Wickstead\'s four of wands paid the mix\'s 4070', cells: [['wickstead', LARGER.wands4]],
    edits: [['src/data/party-class-xp.js', 'wickstead: row([1070, 2420], [1315, 2750, 3010], [1460, 3835, 3965, 4070])', 'wickstead: row([1070, 2420], [1315, 2750, 3010], [4070, 4070, 4070, 4070])']] },
  { name: 'a four\'s shares x3 in the engine', cells: [['meadowbrook_thicket', LARGER.wands4]],
    edits: [['src/core/hunt/xp-share.js', 'const paid = (raw * party * multOf(sc, h)) / 1000;', 'const paid = (raw * party * (heroes.length === 4 ? 3 : 1) * multOf(sc, h)) / 1000;']] },
];

/* THE LINE'S PROOF. Each plants a slip the Party window's line must catch and plays only what that one line cell needs: its ground's lone
   heroes and the parties of its size, on the guard's own seeds and cut. The Cellar (Level 1) keeps it cheap. A slip of one step (5 points)
   is inside LINE_TOL by design; two steps is the smallest the guard promises to catch. */
const LINE_MUTANTS = [
  { name: 'the Cellar\'s four of four classes is paid a third more, and the window keeps its line', line: ['mill_cellar', 4, 4],
    edits: [['src/data/party-class-xp.js', 'mill_cellar: row([1255, 2540], [1445, 3300, 3475], [1955, 4375, 4445, 4890])', 'mill_cellar: row([1255, 2540], [1445, 3300, 3475], [1955, 4375, 4445, 6520])']] },
  { name: 'a hero alone loses the solo boost, and the window keeps its line', line: ['mill_cellar', 2, 2],
    edits: [['src/data/party-class-xp.js', 'export const SOLO_XP_PM = 1150;', 'export const SOLO_XP_PM = 1000;']] },
  /* a pair of two classes reads two steps (10 points) over its row on every ground: the slip a hand-typed row makes, without naming today's value */
  { name: 'a pair of two classes reads its line two steps high', line: ['mill_cellar', 2, 2],
    edits: [['src/data/party-class-xp.js', 'const said = (two, three, four) => Object.freeze({ 2: Object.freeze(two),', 'const said = (two, three, four) => Object.freeze({ 2: Object.freeze(two.map((v, i) => (i ? v + 10 : v))),']] },
];

/** One line cell measured on the tree at `root`: { got, said } in points. */
async function lineCellOn(root, [g, n, k]) {
  const jobs = planOf(3, { grounds: [g], arms: [ARMS[0]], parties: k === 1 ? ONE_CLASS_OF[n] : MIXES_OF[n] });
  const played = await playAll(root, jobs, 4);
  if (!played) return { got: NaN, said: NaN };
  const PC = await import(pathToFileURL(join(root, 'src/data/party-class-xp.js')).href + V);
  return { got: linesOf(judge(jobs, (id) => played.get(id)).rows, PC)[g][n][k - 1], said: PC.PARTY_VS_ALONE[g][n][k - 1] };
}

async function mutate() {
  /* red until a verdict is reached: a sweep that stops short never exits 0 */
  process.exitCode = 2;
  let escaped = 0;
  /* THE LINE'S CONTROL, then its mutants: on this tree each line a mutant reads stands within LINE_TOL, so a mutant's red is the mutant's. */
  for (const key of new Set(LINE_MUTANTS.map((mu) => mu.line.join(':')))) {
    const [g, n, k] = key.split(':');
    const c = await lineCellOn(ROOT, [g, Number(n), Number(k)]);
    if (!(Math.abs(c.got - c.said) <= LINE_TOL)) { console.log('  ✗ CONTROL: on this tree ' + key + ' says ' + c.said + '% and measures ' + c.got.toFixed(1) + '%'); escaped++; }
  }
  for (const mu of LINE_MUTANTS) {
    /* the pool's workers load the Hunts list's advice (tools/balance-sim/worker.mjs recommendedHunt), so the planted tree carries it */
    const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures', 'src/shell/hunt-list.js', 'src/render']);
    try {
      const c = await lineCellOn(p.root, mu.line);
      const hit = !(Math.abs(c.got - c.said) <= LINE_TOL);
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + mu.name + ' (says ' + c.said + '%, measures ' + c.got.toFixed(1) + '%, tolerance ' + LINE_TOL + ')');
      if (!hit) escaped++;
    } finally { p.done(); }
  }
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
  const all = MUTANTS.length + LINE_MUTANTS.length;
  console.log(escaped ? 'party-class-xp-line --mutate: ' + escaped + ' ESCAPED' : 'party-class-xp-line --mutate: ' + all + '/' + all + ' caught');
  process.exitCode = escaped ? 1 : 0;
}

async function main() {
  if (process.argv.includes('--mutate')) return mutate();
  const bad = oneClassProblems();
  if (bad.length) { for (const b of bad) console.log('  ✗ ' + b); process.exitCode = 1; return; }
  if (!groundIds.length) { console.log('  ✗ no grounds to play'); process.exitCode = 1; return; }
  const seeds = argOf('--seeds', 3), workers = argOf('--workers', 4);
  /* red until a verdict is reached: a sweep that stops short never exits 0 */
  process.exitCode = 2;
  const writing = process.argv.includes('--write');
  if (writing && (WIDE || MIDDLE || seeds !== 3 || SEED_BASE !== 0)) { console.log('  ✗ --write reads the guard\'s own cut only (no --wide, --middle, --seeds or --seed-base): what is written is what the guard measures'); process.exitCode = 1; return; }
  const jobs = planOf(seeds);
  const mixedNames = Object.keys(MIXED);
  const t0 = Date.now();
  let code = 2;
  try {
    const played = await playAll(ROOT, jobs, workers);
    if (!played) return;
    const cpu = [...played.values()].reduce((s, c) => s + c.ms, 0);
    const { rows, problems } = judge(jobs, (id) => played.get(id));
    const same = rows.filter((r) => !mixedNames.includes(r.name));
    if (process.argv.includes('--table')) for (const r of same) console.log('  ' + cellWords(r));
    if (process.argv.includes('--mixed')) for (const r of rows.filter((x) => mixedNames.includes(x.name))) console.log('  MIXED ' + cellWords(r));
    /* THE PARTY WINDOW'S LINE against a fresh measurement (or, with --write, written from it) */
    const lines = linesOf(rows, PCX_HERE);
    if (writing) for (const [file, g] of writeLines(lines)) console.log('  wrote ' + g + "'s line into " + file);
    const drift = writing ? [] : lineDrift(lines, PCX_HERE.PARTY_VS_ALONE);
    if (process.argv.includes('--lines') || writing) for (const [g, row] of Object.entries(lines)) {
      const said = PCX_HERE.PARTY_VS_ALONE[g] || {};
      console.log('  LINE ' + g.padEnd(20) + [2, 3, 4].map((n) => n + ': ' + row[n].map((x, i) => (said[n] ? said[n][i] : '-') + '/' + x.toFixed(1)).join(' ')).join('   ') + '   (said/measured)');
    }
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
    for (const d of drift) console.log('  ✗ ' + lineWords(d) + ' (more than ' + LINE_TOL + ' points: node tests/party-class-xp-line.mjs --write re-measures it)');
    const lineCells = Object.values(lines).reduce((s, row) => s + row[2].length + row[3].length + row[4].length, 0);
    const ok = !reds.length && !problems.length && !drift.length;
    console.log('party-class-xp-line: ' + (ok ? 'green' : 'RED, ' + reds.length + ' cell(s) over the line, ' + drift.length + ' Party window line(s) off the measurement') + ': ' + same.length + ' party cells on ' + groundIds.length + ' grounds, '
      + lineCells + ' Party window lines judged at ' + LINE_TOL + ' points, ' + seeds + ' seeds, bar ' + BAR.toFixed(2) + ', ' + Math.round((Date.now() - t0) / 1000) + ' s (' + Math.round(cpu / 1000) + ' s of cells)');
    code = ok ? 0 : 1;
  } finally {
    process.exitCode = code;
  }
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
