// tests/hunt-core/hunt-tiers.mjs — THREE WAYS TO HUNT A GROUND (Tyler 2026-11-04, lane/c-difficulty-tiers). Run by run-all.mjs. Plays the REAL engine through tools/balance-sim's cell runner
// (the settle the world tick runs, play-ground.mjs), deterministic on a commit. The rows are src/data/hunt-tiers.js; the blow, armor's read and the kill's XP are hunt-core/damage.mjs a-tier-is-the-monsters-stats; the server's half is tests/hunt-tiers-db.mjs.
//
//   rows                  Normal is the ground as it stands; each harder tier rises in pull, power and XP; Deadly is the full box at every size (Tyler 10-18); every pull fits its ground; no name is the post-launch game mode.
//   catalogue             the server's rows (hr_hunt_tiers) are the data's, digit for digit.
//   normal-is-the-ground  no tier, Normal, a word nobody offers and a tier the ground doesn't offer all play the same hunt, digit for digit.
//   harder-tier-costs     Deadly against Normal for one hero: more monsters a pull, a bigger bill, 20% more Level XP a kill, the same gold and loot a kill.
//   ladder                the rule that keeps people moving: a ground's Deadly doesn't beat the next ground's Normal on XP at the Level that fits it.
//
// --only a,b plays just those cases and their mutants. About a minute on one core, mutants included.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const { loadCellRunner } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/cell.mjs')).href);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const T = await import(pathToFileURL(join(ROOT, 'src/data/hunt-tiers.js')).href + V);
const G = await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href + V);
const CATALOGUE = '2027-02-27-hunt-tiers.sql';
const WINDOW = 120000;

const cell = (ground, party, level, tier, hours = 1) => ({ id: [ground, party, level, tier].join(':'), ground, party, level, hours, seeds: 1, windowMs: WINDOW,
  ...(tier ? { options: { tier } } : {}), ...(T.HUNT_TIERS[tier] && T.HUNT_TIERS[tier].pull[0] ? { density: T.pullOfTier(T.HUNT_TIERS[tier], party.length) } : {}) });
/* The numbers of a played cell, its row and its id left out. */
const digits = (r) => JSON.stringify({ party: r.party, heroes: r.heroes });
const pooled = (r, f) => r.heroes.reduce((s, h) => s + f(h) * h.hours, 0) / r.heroes.reduce((s, h) => s + h.hours, 0);

const cases = {
  rows: () => {
    const N = T.HUNT_TIERS[T.DEFAULT_TIER];
    if (N.powerPm !== 1000 || N.xpPm !== 1000 || N.pull.some((p) => p !== 0)) return 'Normal moved off the ground as it stands: ' + JSON.stringify(N);
    const order = T.TIER_IDS.map((id) => T.HUNT_TIERS[id]);
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1], b = order[i];
      if (!(b.powerPm > a.powerPm) || !(b.xpPm > a.xpPm)) return b.id + ' is not harder and better paid than ' + a.id;
      if (b.pull.some((p, s) => p < a.pull[s])) return b.id + ' brings fewer monsters than ' + a.id;
    }
    for (const t of order) if (t.pull.length !== G.PARTY_SCALE.maxHeroes || t.pull.some((p, s) => s && p < t.pull[s - 1])) return t.id + ' pull must be one entry a party size, never falling: ' + t.pull;
    /* SLIGHTLY MORE XP (Tyler 2026-11-04): a kill never pays more than +25% for a tier, and power is what it's paid for. */
    if (order.some((t) => t.xpPm > 1250)) return 'a tier pays more than slightly more XP: ' + order.map((t) => t.xpPm);
    const top = order[order.length - 1];
    if (top.pull.some((p) => p !== G.FULL_BOX)) return 'the top tier is not the full box (Tyler 10-18: every hunt reaches 8): ' + top.pull;
    for (const id of T.TIERED_GROUNDS) {
      const g = G.OPEN_GROUNDS[id];
      if (!g) return id + ' offers tiers but is no open ground';
      for (const t of order) for (let s = 0; s < t.pull.length; s++) if (t.pull[s] > g.densityMax[s]) return id + ' cannot spawn ' + t.id + "'s " + t.pull[s] + ' for ' + (s + 1);
    }
    /* "Hardcore" is the post-launch game mode's word (game-modes-roadmap). */
    if (Object.values(T.TIER_NAME).some((n) => /hardcore/i.test(n))) return 'a tier is named for the game mode: ' + Object.values(T.TIER_NAME);
    return T.tiersOf('mill_cellar').join() === T.DEFAULT_TIER ? null : 'a ground off the list offers ' + T.tiersOf('mill_cellar');
  },
  catalogue: () => {
    const sql = readFileSync(join(ROOT, 'supabase', 'migrations', CATALOGUE), 'utf8');
    const got = [...sql.matchAll(/\('([a-z_]+)', '([a-z]+)', '\{([0-9,]+)\}'::int\[\], (\d+), (\d+)\)/g)].map((m) => [m[1], m[2], m[3], m[4], m[5]].join('|')).sort();
    const want = [];
    for (const g of T.TIERED_GROUNDS) for (const id of T.TIER_IDS.filter((x) => x !== T.DEFAULT_TIER)) { const t = T.HUNT_TIERS[id]; want.push([g, id, t.pull.join(), t.powerPm, t.xpPm].join('|')); }
    want.sort();
    return got.join(';') === want.join(';') ? null : 'the catalogue says ' + got.join(';') + ' and the data ' + want.join(';');
  },
  'normal-is-the-ground': (R) => {
    const base = digits(R.runCell({ ...cell('mosslight_glade', ['tank'], 24, null, 0.5) }));
    for (const [tier, ground] of [['normal', 'mosslight_glade'], ['hardcore', 'mosslight_glade']]) {
      const got = digits(R.runCell({ ...cell(ground, ['tank'], 24, null, 0.5), options: { tier } }));
      if (got !== base) return tier + ' on the Glade plays differently from no tier at all';
    }
    /* a tier the ground doesn't offer plays Normal's stats, whatever the pull */
    const plain = digits(R.runCell(cell('mill_cellar', ['tank'], 4, null, 0.5)));
    return digits(R.runCell({ ...cell('mill_cellar', ['tank'], 4, null, 0.5), options: { tier: 'deadly' } })) === plain ? null : 'Deadly moved the Cellar, which doesn\'t offer it';
  },
  'harder-tier-costs': (R) => {
    /* The same hero, the same Level, the full box: the row the tier changes is the only change. */
    const flat = R.runCell({ ...cell('mosslight_glade', ['tank'], 31, null), density: 8 });
    const dead = R.runCell(cell('mosslight_glade', ['tank'], 31, 'deadly'));
    const f = flat.heroes[0], d = dead.heroes[0];
    if (!(flat.party.killsPerH > 100 && dead.party.killsPerH > 100)) return 'the fixture killed ' + flat.party.killsPerH + ' and ' + dead.party.killsPerH + ' an hour';
    if (!(d.storePerH > f.storePerH * 1.3)) return 'a Deadly store bill of ' + d.storePerH + ' against ' + f.storePerH + ': it hits no harder';
    if (!(d.takenPerH > f.takenPerH * 1.3)) return 'a Deadly hero takes ' + d.takenPerH + ' an hour against ' + f.takenPerH;
    const perKill = (h, r, n) => n / r.party.killsPerH;
    const xp = perKill(d, dead, d.levelXpPerH) / perKill(f, flat, f.levelXpPerH);
    if (!(xp > 1.15 && xp < 1.25)) return 'a Deadly kill pays ' + xp.toFixed(3) + ' times the Level XP, the row says 1.2';
    const coin = perKill(d, dead, d.coinPerH) / perKill(f, flat, f.coinPerH);
    if (!(coin > 0.9 && coin < 1.1)) return 'a Deadly kill pays ' + coin.toFixed(3) + ' times the coin (Tyler: the same gold)';
    const loot = perKill(d, dead, d.incomePerH - d.coinPerH) / perKill(f, flat, f.incomePerH - f.coinPerH);
    if (!(loot > 0.85 && loot < 1.15)) return 'a Deadly kill pays ' + loot.toFixed(3) + ' times the loot (Tyler: the same drops)';
    return null;
  },
  ladder: (R) => {
    /* At the Level the upper ground opens, every way the sample can come: a lone single target, a lone area hero, a mixed four. The upper ground's own bill is its business: this is the rule that keeps people moving. */
    for (const [lower, upper, level] of [['mosslight_glade', 'coppercap_warrens', 32]]) for (const party of [['tank'], ['mage'], ['tank', 'healer', 'bow', 'mage']]) {
      const a = R.runCell(cell(lower, party, level, 'deadly')), b = R.runCell(cell(upper, party, level, null));
      const xa = pooled(a, (h) => h.levelXpPerH), xb = pooled(b, (h) => h.levelXpPerH);
      if (!(xa < xb)) return lower + ' on Deadly reads ' + Math.round(xa) + ' XP/h and ' + upper + ' on Normal ' + Math.round(xb) + ' for ' + party.join('+') + ' at ' + level + ': nobody moves on';
    }
    return null;
  },
};

const mutants = [
  { name: 'the data and the catalogue part: Deadly hits harder in the data only', case: 'catalogue', edits: [['src/data/hunt-tiers.js', "deadly: { id: 'deadly', pull: [8, 8, 8, 8], powerPm: 1500,", "deadly: { id: 'deadly', pull: [8, 8, 8, 8], powerPm: 1600,"]] },
  { name: 'Deadly stops at six', case: 'rows', edits: [['src/data/hunt-tiers.js', "deadly: { id: 'deadly', pull: [8, 8, 8, 8],", "deadly: { id: 'deadly', pull: [6, 6, 6, 6],"]] },
  { name: 'the settle reads no tier at all', case: 'harder-tier-costs', edits: [['src/core/combat-sim.js', "const tier = tierRowOf(ctx.ground.id, tierPick(members.filter((m) => !m.left && m.unitId !== null)));", "const tier = null;"]] },
  { name: 'a tier pays more gold a kill', case: 'harder-tier-costs', edits: [['src/core/hunt-rewards.js', "const y = yieldPm / 1000;", "const y = (yieldPm / 1000) * (ctx.tier ? ctx.tier.xpPm / 1000 : 1);"]] },
  { name: 'a word nobody offers plays the last tier', case: 'normal-is-the-ground', edits: [['src/data/hunt-tiers.js', "return tiersOf(groundId).includes(id) ? HUNT_TIERS[id] : HUNT_TIERS[DEFAULT_TIER];", "return HUNT_TIERS[id] || HUNT_TIERS.deadly;"]] },
  { name: 'Deadly pays double XP: the Glade beats the Warrens', case: 'ladder', edits: [['src/data/hunt-tiers.js', "powerPm: 1500, xpPm: 1200 }", "powerPm: 1500, xpPm: 2400 }"]] },
];

const R = makeReport('hunt-core/hunt-tiers');
const RUN = await loadCellRunner(ROOT);
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
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures', 'tools/balance-sim']);
  try {
    let why = null;
    try {
      /* a planted row is the planted module's: the cases read it through the planted runner, the rows and the catalogue through their own import */
      if (mu.case === 'catalogue' || mu.case === 'rows') {
        const TP = await import(pathToFileURL(join(p.root, 'src/data/hunt-tiers.js')).href + V);
        const keep = { rows: T.HUNT_TIERS.deadly.pull, pm: T.HUNT_TIERS.deadly.powerPm };
        T.HUNT_TIERS.deadly.pull = TP.HUNT_TIERS.deadly.pull; T.HUNT_TIERS.deadly.powerPm = TP.HUNT_TIERS.deadly.powerPm;
        try { why = cases[mu.case](); } finally { T.HUNT_TIERS.deadly.pull = keep.rows; T.HUNT_TIERS.deadly.powerPm = keep.pm; }
      } else {
        const { loadCellRunner: planted } = await import(pathToFileURL(join(p.root, 'tools/balance-sim/cell.mjs')).href);
        why = cases[mu.case](await planted(p.root));
      }
    } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
R.finish();
