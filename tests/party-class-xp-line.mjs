#!/usr/bin/env node
// tests/party-class-xp-line.mjs — A PARTY'S LEVEL XP READS ITS SIZE ALONE (Tyler 2026-11-21, the sitting, S-10 option c).
//
// "Size alone for the first build": a party's cell reads how many heroes are alive at the kill, never which weapons they hold,
// the ground or the tier (src/data/party-class-xp.js PARTY_SIZE_XP). The classes rule this file held from 2026-10-31 ("party exp
// should only be better if there are different classes") may come back as one row of the table once Deadly is sized on the fixed
// tool; until then this guard holds the size table and plays it on the REAL engine (tools/balance-sim's cell runner, the settle the
// world tick runs):
//   SA-1 ONE TABLE BY SIZE, read statically: the table names the sizes 2, 3 and 4, one whole-permille cell each; the reader takes a
//        party's size and nothing else; nothing exports a class reader; no ground pack carries a pay cell (src/data/grounds/shape.js
//        refuses one too); the module's own validate() is clean.
//   SA-2 THE SETTLE PAYS THE SIZE CELL, WHATEVER THE LINEUP: at Muster Barrows' floor, a party of one class and a party of mixed
//        classes of each size, and a hero alone, played on this tree and on a copy whose table is flat (every cell 1000, no solo
//        boost): the same dice, the same kills, so Level XP on the tree over Level XP on the flat copy IS the factor the engine paid.
//        It must be the size's cell (SOLO_XP_PM alone) for every lineup, within a kill's rounding.
//   SA-3 BOTH PATHS: a mixed four and a four of one class on Hask's Ford's Deadly, watched (30 s settles) and with the browser
//        closed (10 min), are paid the same Level XP to the point.
//
// WHAT IT NO LONGER BINDS, AND WHY (lane/c-formula-steps, 2026-11-21; build plan FB-2, T-03): the one-class line (a party of one class
// at or under its heroes alone) left with the classes rule (S-10 c). The harder tiers' two bars, a mixed party at or over the same
// heroes alone and a Deadly four at most 2.5x the pace contract, are party-size and tier targets: Tyler 2026-11-21 ("lets just not
// really worry about the targets for solo / group stuff ... its a no brainer to hunt together") rules out bands for solo against
// group, and the critical review's step 1 holds every tier number open until the fixed tool's full matrix reads it (FB-8 sizes the
// tier table in engine batch 2). Both readings are still PRINTED by --report, against the sheet's numbers (balance-sheet.js PARTY,
// tests/balance-grade.mjs keeps the two the same), so nothing that moves them is hidden; neither is a bar.
//
//   node tests/party-class-xp-line.mjs             the guard (SA-1 to SA-3; about a minute)
//   node tests/party-class-xp-line.mjs --mutate    the proof: each mutant turns its check red
//   --report     also play every ground's harder tiers and PRINT each mixed party against the same heroes alone and each Deadly four
//                against the pace contract (no bar)
//   --write      (with --report) rewrite the Party window's measured lines, one number a size a tier (party-class-xp.js BASE_VS_ALONE
//                and each pack's partyVsAlone), from this run's mixed parties
//   --seeds N    --workers N
//
// mutant-anchors: src/data/party-class-xp.js src/core/hunt/xp-share.js src/data/grounds/hasks_ford/pack.js
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

/* The two numbers the report prints its readings against (Tyler 2026-11-16; tests/balance-grade.mjs holds them equal to the sheet's
   balance-sheet.js PARTY.vsAloneMin and deadlyFourVsContractMax, PACE_FROM to its paceFromLevel). Printed, never a bar (header). */
const ALONE_BAR = 1.0;
const PACE_CAP = 2.5;
/* SA-2: a kill's share floors to a whole XP, so the paid factor over a quarter hour of kills reads within this of the cell */
const FACTOR_TOL = 0.005;
const SA2 = Object.freeze({ ground: 'muster_barrows', hours: 0.25 });
/* a party of one class and a party of every class it can hold, at each size; and a hero alone */
const LINEUPS = Object.freeze({
  lone: ['bow'],
  'pair, one class': ['bow', 'bow'], 'pair, two classes': ['tank', 'healer'],
  'three, one class': ['mage', 'mage', 'mage'], 'three, three classes': ['tank', 'healer', 'bow'],
  'four, one class': ['bow', 'bow', 'bow', 'bow'], 'four, four classes': ['tank', 'healer', 'bow', 'mage'],
});
const PATH_FOURS = Object.freeze({ 'a mixed four': LINEUPS['four, four classes'], 'a four of one class': LINEUPS['four, one class'] });

/* --report: the mixes the Party window's lines are measured on, and the lone ways they are read against */
const HARDER = Object.freeze(['dangerous', 'deadly']);
const TIER_MIXED = Object.freeze({ 'duo tank+healer': ['tank', 'healer'], 'duo tank+bow': ['tank', 'bow'], 'trio tank+healer+bow': ['tank', 'healer', 'bow'], four: ['tank', 'healer', 'bow', 'mage'] });
const TIER_WAYS = Object.freeze(['tank', 'healer', 'bow', 'mage']);
const NORMAL_MIXED = Object.freeze({ 'duo tank+healer': ['tank', 'healer'], 'duo tank+bow': ['tank', 'bow'], 'trio tank+healer+bow': ['tank', 'healer', 'bow'], four: ['tank', 'healer', 'bow', 'mage'] });
const TIER_HOURS = 0.5;
const NORMAL_HOURS = 0.25;

const argOf = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : dflt; };
const meanOf = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const V = sourceQuery(ROOT);
const imp = (root, p) => import(pathToFileURL(join(root, p)).href + V + (root === ROOT ? '' : (V ? '&' : '?') + 'm=' + Math.random()));
const G = await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href + V);
const { HUNT_INDEX } = await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href + V);
const T = await import(pathToFileURL(join(ROOT, 'src/data/hunt-tiers.js')).href + V);
const { contractXpPerH } = await import(pathToFileURL(join(ROOT, 'src/data/balance-sheet.js')).href + V);
const { LEVEL_PACE } = await import(pathToFileURL(join(ROOT, 'src/data/core-model.js')).href + V);
const PACE_FROM = LEVEL_PACE.targets[0][0];

const groundIds = Object.keys(G.HUNT_GROUNDS);
const floorOf = (g) => HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band[0];
/* A STAGED ground is played as it ships, its own drops on the gear ladder (tools/balance-sim/gear.mjs openAlso, the grader's rule) */
const stagedGear = (g) => (Object.prototype.hasOwnProperty.call(G.OPEN_GROUNDS, g) ? {} : { gear: { openAlso: [g] } });
const harderOf = (g) => T.tiersOf(g).filter((t) => HARDER.includes(t));
const paceLevelOf = (g) => Math.min(Math.max(floorOf(g), PACE_FROM), HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band[1]);
const tierCellOf = (g, tier, seed, party, name, windowMs, at) => {
  const pull = tier === 'normal' ? null : T.pullOfTier(T.tierRowOf(g, tier), party.length);
  return { id: ['tier', g, tier, seed, name].join(':'), ground: g, party, level: at || floorOf(g), hours: tier === 'normal' ? NORMAL_HOURS : TIER_HOURS, seeds: 1, seedBase: seed,
    ...(tier === 'normal' ? {} : { options: { tier } }), ...(pull ? { density: pull } : {}), ...(windowMs ? { windowMs } : {}), ...stagedGear(g) };
};

// ── SA-1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** One table by size, read statically. `P`: the party-class-xp.js module, `packs`: GROUND_PACKS. Each answer is a reason. */
function oneTableProblems(P, packs) {
  const out = [];
  const sizes = Object.keys(P.PARTY_SIZE_XP || {});
  if (sizes.join() !== '2,3,4') out.push('the party table names ' + (sizes.join(', ') || 'nothing') + ', not the sizes 2, 3 and 4');
  for (const n of sizes) if (!Number.isInteger(P.PARTY_SIZE_XP[n]) || P.PARTY_SIZE_XP[n] <= 0) out.push('the cell for ' + n + ' heroes is ' + JSON.stringify(P.PARTY_SIZE_XP[n]) + ', not one whole permille');
  if (typeof P.partySizeXp !== 'function' || P.partySizeXp.length !== 1) out.push('the reader takes ' + (P.partySizeXp ? P.partySizeXp.length : 'no') + ' argument(s): the party\'s size only');
  for (const k of ['partyClassXp', 'PARTY_CLASSES', 'PARTY_CLASS_XP']) if (k in P) out.push('party-class-xp.js exports ' + k + ' again: a class reader beside the size table');
  for (const p of packs) for (const k of ['partyClassXp', 'partySizeXp']) if (p[k] !== undefined) out.push('the ' + p.id + ' pack carries its own party cell (' + k + ')');
  for (const v of P.validate(Object.keys(G.HUNT_GROUNDS))) out.push('validate: ' + v);
  return out;
}

// ── SA-2 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The flat copy: every cell 1000 and no solo boost, so the settle pays the plain even share. Its edits read this tree's own lines. */
const flatEdits = () => {
  const src = readFileSync(join(ROOT, 'src/data/party-class-xp.js'), 'utf8');
  const table = (/export const PARTY_SIZE_XP = Object\.freeze\(\{[^}]*\}\);/.exec(src) || [null])[0];
  const solo = (/export const SOLO_XP_PM = \d+;/.exec(src) || [null])[0];
  if (!table || !solo) return null;
  return [['src/data/party-class-xp.js', table, 'export const PARTY_SIZE_XP = Object.freeze({ 2: 1000, 3: 1000, 4: 1000 });'],
    ['src/data/party-class-xp.js', solo, 'export const SOLO_XP_PM = 1000;']];
};

/** The factor the settle paid each lineup on this tree, or on this tree with `edits` planted (a mutant): { name: { paid, want, kills } }, or a
    reason string. The flat copy carries the same edits, so the two differ by the table alone. */
async function paidFactors(edits = []) {
  const flatten = flatEdits();
  if (!flatten) return 'party-class-xp.js has no PARTY_SIZE_XP or SOLO_XP_PM line to flatten';
  const trees = [...PLAY_TREES, 'tests/hunt-core/fixtures'];
  const tree = edits.length ? plant(edits, trees) : null;
  const flat = plant([...edits, ...flatten], trees);
  try {
    const root = tree ? tree.root : ROOT;
    const P = await imp(root, 'src/data/party-class-xp.js');
    const [R, F] = [await loadCellRunner(root), await loadCellRunner(flat.root)];
    const out = {};
    for (const [name, party] of Object.entries(LINEUPS)) {
      const cell = { id: 'sa2:' + name, ground: SA2.ground, party, level: floorOf(SA2.ground), hours: SA2.hours, seeds: 1, seedBase: 0, ...stagedGear(SA2.ground) };
      const a = R.runCell(cell), b = F.runCell(cell);
      const xp = (r) => r.heroes.reduce((s, h) => s + h.raw.levelXp, 0);
      out[name] = { paid: xp(a) / xp(b), want: (party.length === 1 ? P.SOLO_XP_PM : P.PARTY_SIZE_XP[Math.min(party.length, 4)]) / 1000, kills: [a.party.killsPerH, b.party.killsPerH] };
    }
    return out;
  } finally { flat.done(); if (tree) tree.done(); }
}
const factorProblems = (f) => (typeof f === 'string' ? [f] : Object.entries(f).flatMap(([name, x]) => [
  ...(x.kills[0] !== x.kills[1] ? ['HARNESS: ' + name + ' killed ' + x.kills[0] + ' an hour on the tree and ' + x.kills[1] + ' on the flat copy: a cell moved a blow'] : []),
  ...(!(Math.abs(x.paid - x.want) <= FACTOR_TOL) ? [name + ' is paid ' + x.paid.toFixed(4) + ' of the even share, its size\'s cell is ' + x.want.toFixed(3)] : []),
]));

// ── SA-3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Both paths: each four on Hask's Ford's Deadly, watched (30 s settles) and browser closed (10 min), paid the same Level XP. */
function bothPaths(R) {
  const g = 'hasks_ford';
  if (!harderOf(g).includes('deadly')) return ['hasks_ford has no Deadly tier to play both paths on'];
  const out = [];
  for (const [name, party] of Object.entries(PATH_FOURS)) {
    const xp = (w) => R.runCell(tierCellOf(g, 'deadly', 0, party, 'paths', w)).heroes.map((h) => h.raw.levelXp);
    const viewed = xp(30000), closed = xp(600000);
    if (viewed.join(',') !== closed.join(',')) out.push(name + ' on Hask\'s Ford\'s Deadly: viewed ' + viewed + ', browser closed ' + closed);
  }
  return out;
}

// ── --report and --write ──────────────────────────────────────────────────────────────────────────────────────────────────
function reportPlanOf(seeds) {
  const jobs = [];
  for (const g of groundIds) for (const tier of ['normal', ...harderOf(g)]) for (let seed = 0; seed < Math.min(seeds, 2); seed++) {
    for (const w of TIER_WAYS) jobs.push(tierCellOf(g, tier, seed, [w], 'solo-' + w));
    for (const [n, p] of Object.entries(tier === 'normal' ? NORMAL_MIXED : TIER_MIXED)) jobs.push(tierCellOf(g, tier, seed, p, n));
    if (tier === 'deadly' && paceLevelOf(g) !== floorOf(g)) jobs.push(tierCellOf(g, tier, seed, TIER_MIXED.four, 'pace-four', undefined, paceLevelOf(g)));
  }
  return jobs;
}
/** Rows { g, tier, name, party, head, same, alone, pace }: a head against the same heroes alone on the tier, and a Deadly four's pace. */
function judgeReport(jobs, at) {
  const rows = [];
  for (const g of groundIds) for (const tier of ['normal', ...harderOf(g)]) {
    const seeds = [...new Set(jobs.filter((j) => j.id.startsWith('tier:' + g + ':' + tier + ':')).map((j) => j.seedBase))];
    const alone = (w) => meanOf(seeds.map((s) => at(['tier', g, tier, s, 'solo-' + w].join(':')).heroes[0].levelXpPerH));
    const headOf = (name) => meanOf(seeds.map((s) => at(['tier', g, tier, s, name].join(':')).party.levelXpPerHeroPerH));
    for (const [name, party] of Object.entries(tier === 'normal' ? NORMAL_MIXED : TIER_MIXED)) {
      const head = headOf(name), same = meanOf(party.map(alone));
      const paced = tier === 'deadly' && name === 'four' ? (paceLevelOf(g) !== floorOf(g) ? headOf('pace-four') : head) / contractXpPerH(paceLevelOf(g)) : null;
      rows.push({ g, tier, name, party, head: Math.round(head), same: Math.round(same), alone: head / same, pace: paced });
    }
  }
  return rows;
}
const reportWords = (r) => r.g + ', ' + r.tier + ', ' + r.party.join('+') + ': ' + r.head + ' Level XP/h a head, the same heroes alone ' + r.same + ' = ' + r.alone.toFixed(3)
  + (r.alone < ALONE_BAR ? ' (under ' + ALONE_BAR.toFixed(2) + ')' : '') + (r.pace === null ? '' : ', ' + r.pace.toFixed(2) + 'x the pace contract' + (r.pace > PACE_CAP ? ' (over ' + PACE_CAP + ')' : ''));

/* THE PARTY WINDOW'S LINES BY SIZE (--write; party-class-xp.js PARTY_VS_ALONE's method): each size's line is its full mix's reading on the tier,
   in whole percent to the nearest 5: a pair the mean of tank + Healer and tank + bow, a three tank + Healer + bow, a four tank + Healer + bow + wand. */
function linesOf(rows) {
  const five = (r) => Math.round(((r - 1) * 100) / 5) * 5 || 0;
  const out = {};
  for (const g of groundIds) {
    out[g] = {};
    for (const tier of ['normal', ...harderOf(g)]) {
      const t = (name) => rows.find((r) => r.g === g && r.tier === tier && r.name === name).alone;
      out[g][tier] = { 2: five(meanOf([t('duo tank+healer'), t('duo tank+bow')])), 3: five(t('trio tank+healer+bow')), 4: five(t('four')) };
    }
  }
  return out;
}
/** Write each ground's line where it lives: the base grounds' rows in party-class-xp.js, a pack's in its pack.js. Answers the files written. */
function writeLines(lines, packIds) {
  const sized = (r) => 'size(' + r[2] + ', ' + r[3] + ', ' + r[4] + ')';
  const plain = (r) => '{ 2: ' + r[2] + ', 3: ' + r[3] + ', 4: ' + r[4] + ' }';
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
      if (!re.test(src)) throw new Error(g + ': party-class-xp.js has no BASE_VS_ALONE row to write');
      src = src.replace(re, '  ' + g + ': lines({ ' + each(byTier, sized) + ' }),');
    }
  }
  writeFileSync(pcx, src);
  written.push('src/data/party-class-xp.js');
  return written;
}

// ── THE PROOF ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Each mutant reaches the rule the way a data row or a code slip would. The engine and size slips are played (SA-2); the static ones read (SA-1). */
const MUTANTS = [
  { name: 'the engine pays a party with a repeated role the even share (the classes rule back, typed in the engine)', check: 'SA-2',
    edits: [['src/core/hunt/xp-share.js', 'const cell = partySizeXp(heroes.length);', 'const cell = heroes.length > 1 && new Set(heroes.map((h) => h.role)).size < heroes.length ? 1000 : partySizeXp(heroes.length);']] },
  { name: 'the reader pays every party the pair\'s cell', check: 'SA-2',
    edits: [['src/data/party-class-xp.js', '  return PARTY_SIZE_XP[Math.min(n, Math.max(...SIZES))];', '  return PARTY_SIZE_XP[2];']] },
  { name: 'a hero alone loses the solo boost', check: 'SA-2',
    edits: [['src/data/party-class-xp.js', '  if (n === 1) return SOLO_XP_PM;', '  if (n === 1) return 1000;']] },
  { name: 'the engine reads the size cell of the party\'s first hero only', check: 'SA-2',
    edits: [['src/core/hunt/xp-share.js', 'const cell = partySizeXp(heroes.length);', 'const cell = partySizeXp(heroes[0].role === \'ranger\' ? 1 : heroes.length);']] },
  { name: 'a ground pack brings back its own party cell', check: 'SA-1',
    edits: [['src/data/grounds/hasks_ford/pack.js', '  partyVsAlone: {', '  partyClassXp: { 2: [990, 1760], 3: [1150, 2145, 2310], 4: [1150, 2700, 3025, 3030] },\n  partyVsAlone: {']] },
  { name: 'the table keyed by classes again', check: 'SA-1',
    edits: [['src/data/party-class-xp.js', 'export const PARTY_SIZE_XP = Object.freeze({ 2: 1500, 3: 1700, 4: 1700 });', 'export const PARTY_SIZE_XP = Object.freeze({ 2: [880, 1500], 3: [990, 1600, 1700], 4: [970, 1580, 1670, 1700] });']] },
  { name: 'the reader takes the roles again', check: 'SA-1',
    edits: [['src/data/party-class-xp.js', 'export function partySizeXp(n) {', 'export function partySizeXp(n, roles) {']] },
  { name: 'a class reader exported beside the size table', check: 'SA-1',
    edits: [['src/data/party-class-xp.js', 'export function partySizeXp(n) {', 'export const partyClassXp = (roles) => ({ permille: partySizeXp(roles.length), classes: [] });\nexport function partySizeXp(n) {']] },
];

async function staticOn(root) {
  try {
    return oneTableProblems(await imp(root, 'src/data/party-class-xp.js'), (await imp(root, 'src/data/grounds/index.js')).GROUND_PACKS);
  } catch (e) { return ['the data refuses to load: ' + (e && e.message ? e.message.split('\n')[0] : String(e))]; }
}
async function checkOn(which, edits = []) {
  if (which === 'SA-1') {
    if (!edits.length) return staticOn(ROOT);
    const p = plant(edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
    try { return await staticOn(p.root); } finally { p.done(); }
  }
  try { return factorProblems(await paidFactors(edits)); }
  catch (e) { return ['the settle refuses to run: ' + (e && e.message ? e.message.split('\n')[0] : String(e))]; }
}

async function mutate() {
  let escaped = 0;
  /* THE CONTROL: this tree is clean on both checks, so a mutant's red is the mutant's */
  for (const which of ['SA-1', 'SA-2']) {
    const here = await checkOn(which);
    if (here.length) { console.log('  ✗ CONTROL ' + which + ': on this tree ' + here.join('; ')); escaped++; }
  }
  for (const mu of MUTANTS) {
    const why = await checkOn(mu.check, mu.edits);
    console.log('  ' + (why.length ? 'caught ' : 'ESCAPED') + ' ' + mu.check + ' ' + mu.name + (why.length ? ' (' + why[0].slice(0, 160) + ')' : ''));
    if (!why.length) escaped++;
  }
  console.log(escaped ? 'party-class-xp-line --mutate: ' + escaped + ' ESCAPED' : 'party-class-xp-line --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught, control clean');
  process.exitCode = escaped ? 1 : 0;
}

async function main() {
  if (process.argv.includes('--mutate')) return mutate();
  const t0 = Date.now();
  const P = await imp(ROOT, 'src/data/party-class-xp.js');
  const { GROUND_PACKS } = await imp(ROOT, 'src/data/grounds/index.js');
  const problems = oneTableProblems(P, GROUND_PACKS).map((x) => 'SA-1 ' + x);
  const f = await paidFactors();
  if (typeof f !== 'string') for (const [name, x] of Object.entries(f)) console.log('  SA-2 ' + name.padEnd(22) + ' paid ' + x.paid.toFixed(4) + ' of the even share (its cell ' + x.want.toFixed(3) + ')');
  problems.push(...factorProblems(f).map((x) => 'SA-2 ' + x));
  problems.push(...bothPaths(await loadCellRunner(ROOT)).map((x) => 'SA-3 ' + x));
  if (process.argv.includes('--write') && !process.argv.includes('--report')) problems.push('--write needs --report (the lines read the mixes)');
  if (process.argv.includes('--report')) {
    const seeds = argOf('--seeds', 2), workers = argOf('--workers', 4);
    const jobs = reportPlanOf(seeds);
    const tmp = mkdtempSync(join(tmpdir(), 'party-size-xp-'));
    try {
      /* cpuMax 101: never hold. The pool's own workers are the load here. */
      const res = await runPool(jobs, join(tmp, 'cells.jsonl'), { root: ROOT, workers, cpuMax: 101, log: () => {} });
      if (res.failed || res.done !== jobs.length) problems.push('REPORT: ' + res.failed + ' cell(s) failed, ' + res.done + ' of ' + jobs.length + ' played');
      else {
        const played = new Map(readFileSync(join(tmp, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { const c = JSON.parse(l); return [c.id, c]; }));
        const rows = judgeReport(jobs, (id) => played.get(id));
        for (const r of rows) console.log('  REPORT ' + reportWords(r));
        console.log('  REPORT (printed, no bar): ' + rows.filter((r) => r.tier !== 'normal' && r.alone < ALONE_BAR).length + ' harder-tier mix(es) under the same heroes alone, '
          + rows.filter((r) => r.pace !== null && r.pace > PACE_CAP).length + ' Deadly four(s) over ' + PACE_CAP + 'x the contract');
        if (process.argv.includes('--write')) {
          const lines = linesOf(rows);
          for (const [g, r] of Object.entries(lines)) console.log('  LINE ' + g.padEnd(20) + JSON.stringify(r) + (JSON.stringify(r) === JSON.stringify(P.PARTY_VS_ALONE[g]) ? ' (as written)' : ' (was ' + JSON.stringify(P.PARTY_VS_ALONE[g]) + ')'));
          console.log('  wrote ' + writeLines(lines, GROUND_PACKS.map((x) => x.id)).join(', '));
        }
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  for (const p of problems) console.log('  ✗ ' + p);
  console.log('party-class-xp-line: ' + (problems.length ? 'RED, ' + problems.length + ' problem(s)' : 'green') + ': one table by size ' + JSON.stringify(P.PARTY_SIZE_XP)
    + ', every lineup paid its size\'s cell on the settle, both paths the same, ' + Math.round((Date.now() - t0) / 1000) + ' s');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
