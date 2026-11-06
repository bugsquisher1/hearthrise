// tests/hunt-core/hunt-tiers.mjs — THREE WAYS TO HUNT A GROUND (Tyler 2026-11-05, lane/c-difficulty-tiers). Run by run-all.mjs. Plays the REAL engine through tools/balance-sim's cell runner
// (the settle the world tick runs, play-ground.mjs), deterministic on a commit. The rows are src/data/hunt-tiers.js; the blow, armor's read and the kill's XP are hunt-core/damage.mjs a-tier-is-the-monsters-stats; the server's half is tests/hunt-tiers-db.mjs.
//
//   rows                  Normal is the ground as it stands; each harder tier hits harder and pays more, its pull never falls; the Cellar is Normal only and every other open ground offers all three; the full box stays reachable; every pull fits its ground; no name is the post-launch game mode.
//   catalogue             the server's rows (hr_ground_tiers) are the data's, digit for digit.
//   normal-is-the-ground  no tier, Normal, a word nobody offers and a tier the ground doesn't offer all play the same hunt, digit for digit.
//   harder-tier-costs     Deadly against the same pull with no tier, one hero: a bigger bill, the row's XP a kill, the same gold and loot a kill.
//   ladder                the rule that keeps people moving: a ground's top tier doesn't beat the next ground's Normal on XP at the Level that fits it, single target, AoE or a party.
//
// --only a,b plays just those cases and their mutants. About three minutes on one core, mutants included.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const { loadCellRunner } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/cell.mjs')).href);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const REAL = await import(pathToFileURL(join(ROOT, 'src/data/hunt-tiers.js')).href + V);
const G = await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href + V);
/* the newest file that writes hr_ground_tiers' rows (tools/gen-ground-tiers.mjs; 2027-02-27-hunt-tiers.sql made the table and the first rows) */
const CATALOGUE = '2027-03-19-tier-risk.generated.sql';
const WINDOW = 120000;
const GLADE = 'mosslight_glade', WARRENS = 'coppercap_warrens';
const HARDER = ['dangerous', 'deadly'];

/* A cell on a tier as written (T: the data the case reads, a planted copy under a mutant). */
const cellOn = (T) => (ground, party, level, tier, hours = 1) => {
  const pull = tier ? T.pullOfTier(T.tierRowOf(ground, tier), party.length) : 0;
  return { id: [ground, party, level, tier].join(':'), ground, party, level, hours, seeds: 1, windowMs: WINDOW, ...(tier ? { options: { tier } } : {}), ...(pull ? { density: pull } : {}) };
};
/* The numbers of a played cell, its row and its id left out. */
const digits = (r) => JSON.stringify({ party: r.party, heroes: r.heroes });
const pooled = (r, f) => r.heroes.reduce((s, h) => s + f(h) * h.hours, 0) / r.heroes.reduce((s, h) => s + h.hours, 0);

const cases = {
  rows: ({ T }) => {
    const N = T.tierRowOf('mill_cellar', 'deadly');
    if (N.id !== T.DEFAULT_TIER || N.powerPm !== 1000 || N.xpPm !== 1000 || N.pull.some((p) => p !== 0)) return 'Normal moved off the ground as it stands: ' + JSON.stringify(N);
    if (T.tiersOf('mill_cellar').join() !== T.DEFAULT_TIER) return 'the Cellar offers ' + T.tiersOf('mill_cellar');
    for (const id of Object.keys(G.OPEN_GROUNDS)) if (id !== 'mill_cellar' && T.tiersOf(id).join() !== T.TIER_IDS.join()) return id + ' offers ' + T.tiersOf(id) + ', not all three (Tyler: each hunting ground)';
    for (const [id, rows] of Object.entries(T.GROUND_TIERS)) {
      const g = G.OPEN_GROUNDS[id];
      if (!g) return id + ' offers tiers but is no open ground';
      let was = N;
      for (const t of HARDER) {
        const r = rows[t];
        if (!r || r.id !== t) return id + ' has no row for ' + t;
        if (!(r.powerPm > was.powerPm) || !(r.xpPm > was.xpPm)) return id + ': ' + t + ' is not harder and better paid than ' + was.id;
        if (r.pull.length !== G.PARTY_SCALE.maxHeroes || r.pull.some((p, s) => (p && p < was.pull[s]) || (s && p && p < r.pull[s - 1]))) return id + ': ' + t + "'s pull falls: " + r.pull;
        for (let s = 0; s < r.pull.length; s++) if (r.pull[s] > g.densityMax[s]) return id + " cannot spawn " + t + "'s " + r.pull[s] + ' for ' + (s + 1);
        /* SLIGHTLY MORE XP (Tyler 2026-11-04): a kill never pays more than +25% for a tier, and power is what it's paid for. */
        if (r.xpPm > 1250) return id + ': ' + t + ' pays more than slightly more XP: ' + r.xpPm;
        was = r;
      }
    }
    /* THE FULL BOX STAYS REACHABLE (Tyler 10-18), on the grounds whose ladder has room for it, at every party size. */
    for (const id of [GLADE, WARRENS]) if (T.GROUND_TIERS[id].deadly.pull.some((p) => p !== G.FULL_BOX)) return id + ' has lost its full box: ' + T.GROUND_TIERS[id].deadly.pull;
    /* "Hardcore" is the post-launch game mode's word (game-modes-roadmap). */
    if (Object.values(T.TIER_NAME).some((n) => /hardcore/i.test(n))) return 'a tier is named for the game mode: ' + Object.values(T.TIER_NAME);
    return null;
  },
  catalogue: ({ T }) => {
    const sql = readFileSync(join(ROOT, 'supabase', 'migrations', CATALOGUE), 'utf8');
    const got = [...sql.matchAll(/\('([a-z_]+)', '([a-z]+)', '\{([0-9,]+)\}'::int\[\], (\d+), (\d+)\)/g)].map((m) => [m[1], m[2], m[3], m[4], m[5]].join('|')).sort();
    const want = [];
    for (const [g, rows] of Object.entries(T.GROUND_TIERS)) for (const id of HARDER) { const t = rows[id]; want.push([g, id, t.pull.join(), t.powerPm, t.xpPm].join('|')); }
    want.sort();
    return got.join(';') === want.join(';') ? null : 'the catalogue says ' + got.join(';') + ' and the data ' + want.join(';');
  },
  'normal-is-the-ground': ({ R, T }) => {
    const cell = cellOn(T);
    for (const word of ['normal', 'hardcore', 'constructor', '__proto__']) if (T.tierRowOf(GLADE, word).id !== T.DEFAULT_TIER) return 'the word ' + word + ' plays ' + T.tierRowOf(GLADE, word).id + ' on the Glade';
    const base = digits(R.runCell({ ...cell(GLADE, ['tank'], 24, null, 0.5) }));
    for (const tier of ['normal', 'hardcore']) {
      const got = digits(R.runCell({ ...cell(GLADE, ['tank'], 24, null, 0.5), options: { tier } }));
      if (got !== base) return tier + ' on the Glade plays differently from no tier at all';
    }
    /* a tier the ground doesn't offer plays Normal's stats */
    const plain = digits(R.runCell(cell('mill_cellar', ['tank'], 4, null, 0.5)));
    return digits(R.runCell({ ...cell('mill_cellar', ['tank'], 4, null, 0.5), options: { tier: 'deadly' } })) === plain ? null : 'Deadly moved the Cellar, which doesn\'t offer it';
  },
  'harder-tier-costs': ({ R, T }) => {
    /* The same hero, the same Level, the same pull: the tier's stats are the only change. */
    const cell = cellOn(T);
    const row = T.tierRowOf(GLADE, 'deadly');
    const flat = R.runCell({ ...cell(GLADE, ['tank'], 31, null), density: T.pullOfTier(row, 1) });
    const dead = R.runCell(cell(GLADE, ['tank'], 31, 'deadly'));
    const f = flat.heroes[0], d = dead.heroes[0];
    if (!(flat.party.killsPerH > 100 && dead.party.killsPerH > 100)) return 'the fixture killed ' + flat.party.killsPerH + ' and ' + dead.party.killsPerH + ' an hour';
    if (!(d.storePerH > f.storePerH * 1.3)) return 'a Deadly store bill of ' + d.storePerH + ' against ' + f.storePerH + ': it hits no harder';
    if (!(d.takenPerH > f.takenPerH * 1.3)) return 'a Deadly hero takes ' + d.takenPerH + ' an hour against ' + f.takenPerH;
    const perKill = (r, n) => n / r.party.killsPerH;
    const xp = perKill(dead, d.levelXpPerH) / perKill(flat, f.levelXpPerH), want = row.xpPm / 1000;
    if (!(xp > want - 0.05 && xp < want + 0.05)) return 'a Deadly kill pays ' + xp.toFixed(3) + ' times the Level XP, the row says ' + want;
    const coin = perKill(dead, d.coinPerH) / perKill(flat, f.coinPerH);
    if (!(coin > 0.9 && coin < 1.1)) return 'a Deadly kill pays ' + coin.toFixed(3) + ' times the coin (Tyler: the same gold)';
    const loot = perKill(dead, d.incomePerH - d.coinPerH) / perKill(flat, f.incomePerH - f.coinPerH);
    if (!(loot > 0.85 && loot < 1.15)) return 'a Deadly kill pays ' + loot.toFixed(3) + ' times the loot (Tyler: the same drops)';
    return null;
  },
  ladder: ({ R, T }) => {
    /* At the Level the upper ground opens, the ways that bracket it: a lone single target, a lone area hero of each kind, a mixed four. The upper ground's own bill is its business: this is the rule that keeps people moving. tools/balance-sim plan tierladder has every way to fight, past the floor, and Tempered. */
    const cell = cellOn(T);
    const seen = new Map();
    const xp = (ground, party, level, tier) => {
      const k = [ground, party, level, tier].join(':');
      if (!seen.has(k)) seen.set(k, pooled(R.runCell(cell(ground, party, level, tier)), (h) => h.levelXpPerH));
      return seen.get(k);
    };
    for (const [lower, upper, level] of [['meadowbrook_thicket', 'wickstead', 8], ['meadowbrook_thicket', 'millrace_sewer', 8], ['wickstead', GLADE, 16], ['millrace_sewer', GLADE, 16], [GLADE, WARRENS, 32]]) {
      for (const party of [['tank'], ['hammer'], ['mage'], ['tank', 'healer', 'bow', 'mage']]) {
        const a = xp(lower, party, level, 'deadly'), b = xp(upper, party, level, null);
        if (!(a < b)) return lower + ' on Deadly reads ' + Math.round(a) + ' XP/h and ' + upper + ' on Normal ' + Math.round(b) + ' for ' + party.join('+') + ' at ' + level + ': nobody moves on';
      }
    }
    return null;
  },
};

const D = 'src/data/hunt-tiers.js';
const GLADE_ROW = "mosslight_glade: { dangerous: tier('dangerous', [3, 5, 5, 6], 1500, 1100), deadly: tier('deadly', [8, 8, 8, 8], 2750, 1200) },";
const mutants = [
  { name: 'the data and the catalogue part: Deadly hits harder in the data only', case: 'catalogue', edits: [[D, GLADE_ROW, GLADE_ROW.replace('2750, 1200', '2850, 1200')]] },
  { name: 'the Glade loses its full box', case: 'rows', edits: [[D, GLADE_ROW, GLADE_ROW.replace('[8, 8, 8, 8]', '[6, 6, 6, 6]')]] },
  { name: 'the Cellar offers a harder tier', case: 'rows', edits: [[D, "  meadowbrook_thicket: {", "  mill_cellar: { dangerous: tier('dangerous', [0, 0, 0, 0], 1500, 1050), deadly: tier('deadly', [0, 0, 0, 0], 2500, 1100) },\n  meadowbrook_thicket: {"]] },
  { name: 'the settle reads no tier at all', case: 'harder-tier-costs', edits: [['src/core/combat-sim.js', "const tier = tierRowOf(ground.id, tierPick(members.filter((m) => !m.left && m.unitId !== null)));", "const tier = null;"]] },
  { name: 'a tier pays more gold a kill', case: 'harder-tier-costs', edits: [['src/core/hunt-rewards.js', "const y = yieldPm / 1000;", "const y = (yieldPm / 1000) * (ctx.tier ? ctx.tier.xpPm / 1000 : 1);"]] },
  { name: 'a word nobody offers plays a harder tier', case: 'normal-is-the-ground', edits: [[D, "return (rows && Object.prototype.hasOwnProperty.call(rows, id) && rows[id]) || NORMAL;", "return (rows && (rows[id] || rows.deadly)) || NORMAL;"]] },
  { name: 'the Glade pays double XP on Deadly: nobody moves on to the Warrens', case: 'ladder', edits: [[D, GLADE_ROW, GLADE_ROW.replace('2750, 1200', '2750, 2400')]] },
];

const REPORT = makeReport('hunt-core/hunt-tiers');
const RUN = await loadCellRunner(ROOT);
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
for (const k of ONLY || []) REPORT.ok(!!cases[k], '--only names no case ' + k);
for (const [cn, fn] of Object.entries(cases).filter(([k]) => !ONLY || ONLY.includes(k))) {
  let why = null;
  try { why = fn({ R: RUN, T: REAL }); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  REPORT.ok(!why, cn + ': ' + why);
}
const PICKED = mutants.filter((m) => !ONLY || ONLY.includes(m.case));
for (const mu of PICKED) {
  if (!cases[mu.case]) { REPORT.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures', 'tools/balance-sim']);
  try {
    let why = null;
    try {
      const { loadCellRunner: planted } = await import(pathToFileURL(join(p.root, 'tools/balance-sim/cell.mjs')).href);
      why = cases[mu.case]({ R: await planted(p.root), T: await import(pathToFileURL(join(p.root, 'src/data/hunt-tiers.js')).href + V) });
    } catch (e) { why = 'threw ' + e.message; }
    REPORT.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!REPORT.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
REPORT.finish();
