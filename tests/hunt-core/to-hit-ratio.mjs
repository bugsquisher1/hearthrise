// tests/hunt-core/to-hit-ratio.mjs — TO-HIT AS A RATIO OF TWO RATINGS, PLAYED (src/data/to-hit.js; balance program 21-combat.md B2,
// Tyler 2026-11-20 ruled 21-1 and 21-2; build row L15, engine batch 1). Run by run-all.mjs. Its formula half (85% / 70% at every Level,
// +10 Defense's worth, every row rated, the reference hero generated) is tests/balance-sheet.mjs; this is the engine playing it.
//
//   monsters-land-the-ratio  one monster swinging at one hero for 2,000 s of hunt time through the real resolveAttacks, on its real row:
//                            the share of its blows that land is the ratio of its aim against 20 + the hero's Defense rating, within 3.5
//                            points, at three Defense ratings, on Normal, on a harder tier (the aim x the tier's dial) and under a boss's
//                            enrage (the aim x the enrage). The rule is typed here (A >= D ? 1 - D / 2A : A / 2D, base 20, rails 5-97%),
//                            never asked of the engine, so the engine can't agree with itself.
//   both-paths               BOTH PATHS (CLAUDE.md §4): a lone hammer on a full ground for an hour of the settle the world tick runs
//                            (tools/balance-sim cell.mjs -> hr-accrue -> combat-sim.js), watched (10 s settles) and with the browser closed
//                            (10 min settles): the same kills, Level XP, damage taken, deaths and landed share, to the unit; and its
//                            monsters land 55-75% of their blows on it (the career hammer: the ratio's 70% on a regular, less on the rest).
//
// mutant-anchors: src/core/combat.js src/data/to-hit.js src/data/hunt-tiers.js src/core/hunt/boss-phases.js src/core/hunt/damage.js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCore, plant, makeReport, ROOT } from './fixtures/h1.js';
import { H, E, inst2, sc2, world, groundRow } from './fixtures/h2.js';

const { loadCellRunner } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/cell.mjs')).href);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

/* THE RULE, typed (src/data/to-hit.js, 2026-11-20) */
const BASE = 20, MIN = 0.05, MAX = 0.97;
const ruled = (aim, def) => { const a = Math.max(1, aim), d = BASE + def; return Math.max(MIN, Math.min(MAX, a >= d ? 1 - d / (2 * a) : a / (2 * d))); };

/* One monster `kind` at `hp` of a million swinging at one hero of Defense rating `def` (no armour: nothing dodges) for 2,000 s, the dial `tier`
   on the instance. Answers its landed share. The hero taps it for 6 a blow, so it never falls. */
function landedShare(M, kind, def, tier, hp) {
  const k = H(M, 1, 12, 3, 'tank', { hp: 100000000, maxHp: 100000000, target: 2, def, maxHit: 6 });
  k.armour = null;
  const m = E(M, 2, 0, 13, 3, 1, { kind, hp: hp || 1000000, maxHp: 1000000 });
  const inst = inst2(M, world(M, [k, m], { phase: 'fight', leader: 1 }), groundRow({ hunt: 'coppercap_warrens' }));
  if (tier) inst.tier = tier;
  const sc = sc2(M, 11);
  for (let i = 0; i < 20000; i++) { M.movement.occupancy(inst); M.damage.resolveAttacks(inst, sc); sc.atMs += 100; }
  const mine = sc.events.filter((e) => e.u === 2 && (e.type === 'dmg' || e.type === 'miss'));
  return { n: mine.length, share: mine.filter((e) => e.type === 'dmg').length / Math.max(1, mine.length) };
}

const cases = {
  'monsters-land-the-ratio': ({ M }) => {
    const row = M.MONSTERS.hobgoblin_foreman;
    if (!row || !(row.aim > 0)) return 'fixture: the Hobgoblin Foreman has no aim (' + (row && row.aim) + ')';
    const boss = Object.keys(M.MONSTERS).find((id) => M.MONSTERS[id].formula && M.MONSTERS[id].phases && M.MONSTERS[id].phases.enrageAtkPm > 1000 && M.MONSTERS[id].phases.enragePm >= 200);
    if (!boss) return 'fixture: no formula boss with an enrage';
    const B = M.MONSTERS[boss], deadly = { id: 'deadly', pull: [8, 8, 8, 8], dmgPm: 1330, hpPm: 1000, xpPm: 1000 };
    const runs = [];
    for (const def of [5, 40, 90]) {
      runs.push(['the foreman on Normal, Defense ' + def, landedShare(M, 'hobgoblin_foreman', def, null), ruled(row.aim, def)]);
      runs.push(['the foreman on a 1330 dial, Defense ' + def, landedShare(M, 'hobgoblin_foreman', def, deadly), ruled((row.aim * 1330) / 1000, def)]);
    }
    /* under his enrage line (a tenth of his HP left): his aim x the enrage */
    runs.push([boss + ' enraged, Defense 20', landedShare(M, boss, 20, null, 100000), ruled((B.aim * B.phases.enrageAtkPm) / 1000, 20)]);
    for (const [what, got, want] of runs) {
      if (got.n < 900) return what + ': the fixture swung ' + got.n + ' times';
      if (Math.abs(got.share - want) > 0.035) return what + ': lands ' + (got.share * 100).toFixed(1) + '% of ' + got.n + ' blows, the ratio says ' + (want * 100).toFixed(1) + '%';
    }
    return null;
  },
  'both-paths': ({ R }) => {
    /* the played hero (cell.mjs profile 'played': the career skill line, the reference hero's own) */
    const cell = { ground: 'hasks_ford', party: ['hammer'], level: 50, hours: 1, seeds: 1, profile: 'played' };
    const viewed = R.runCell({ ...cell, id: 'th:viewed', windowMs: 10000 }), closed = R.runCell({ ...cell, id: 'th:closed', windowMs: 600000 });
    const v = viewed.heroes[0], c = closed.heroes[0];
    if (!(viewed.party.killsPerH > 50)) return 'the fixture killed ' + viewed.party.killsPerH + ' an hour';
    if (viewed.party.killsPerH !== closed.party.killsPerH) return 'kills: viewed ' + viewed.party.killsPerH + ', browser closed ' + closed.party.killsPerH;
    for (const k of ['levelXpPerH', 'takenPerH', 'deaths', 'landedPct', 'storePerH']) if (v[k] !== c[k]) return k + ': viewed ' + v[k] + ', browser closed ' + c[k];
    /* 70% on a regular, less on its heavies and elites (MEASURED 63.4%; 81.5% on the old line's 85% rail) */
    if (!(v.landedPct >= 55 && v.landedPct <= 75)) return 'the Ford\'s monsters land ' + v.landedPct + '% of their blows on the career hammer at 50 (the ratio: about 63%)';
    return null;
  },
};

const D = 'src/core/hunt/damage.js';
const mutants = [
  { name: 'the hero\'s defense rating counts ten more than the rule', case: 'monsters-land-the-ratio',
    edits: [['src/core/combat.js', 'return heldToHit(toHitRatio(monsterAim(monster), TO_HIT.base + (Number(playerDefense) || 0)));', 'return heldToHit(toHitRatio(monsterAim(monster), TO_HIT.base + 10 + (Number(playerDefense) || 0)));']] },
  { name: 'the ratio halves the wrong side (1 - D / 3A)', case: 'monsters-land-the-ratio',
    edits: [['src/data/to-hit.js', 'return a >= d ? 1 - d / (2 * a) : a / (2 * d);', 'return a >= d ? 1 - d / (3 * a) : a / (2 * d);']] },
  { name: 'a tier raises the blow and not the aim', case: 'monsters-land-the-ratio',
    edits: [['src/data/hunt-tiers.js', '...(Number.isFinite(row.aim) ? { aim: (row.aim * dmg) / 1000 } : {}),', '']] },
  { name: 'an enrage raises the blow and not the aim', case: 'monsters-land-the-ratio',
    edits: [['src/core/hunt/boss-phases.js', 'Number.isFinite(row.aim) ? { aim: (row.aim * ph.enrageAtkPm) / 1000 } : {});', '{});']] },
  { name: 'the old straight line comes back (0.50 + 2% an attack point over Defense)', case: 'monsters-land-the-ratio',
    edits: [['src/core/combat.js', 'return heldToHit(toHitRatio(monsterAim(monster), TO_HIT.base + (Number(playerDefense) || 0)));', 'return Math.max(0.05, Math.min(0.85, 0.5 + (((monster && monster.atk) || 1) - playerDefense) * 0.02));']] },
  { name: 'a swing\'s clock is not stored between settles (a watched hunt swings on a different beat)', case: 'both-paths',
    edits: [[D, ", ['element', 'str'], ['swingLeftMs', 'int']]),", ", ['element', 'str']]),"]] },
];

const REPORT = makeReport('hunt-core/to-hit-ratio');
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const ctxOf = async (root) => ({ M: await loadCore(root), R: await loadCellRunner(root) });
const REAL = await ctxOf(ROOT);
for (const [cn, fn] of Object.entries(cases).filter(([k]) => !ONLY || ONLY.includes(k))) {
  let why = null;
  try { why = await fn(REAL); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  REPORT.ok(!why, cn + ': ' + why);
}
const PICKED = mutants.filter((m) => !ONLY || ONLY.includes(m.case));
for (const mu of PICKED) {
  /* the planted engine under this tree's simulator (cell.mjs reads the engine from the root it is handed, first-week-bands' way): a planted copy of
     tools/balance-sim would need tests/_is-main.mjs and tools/lib too, and a mutant that only made the harness throw would read as caught */
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    let why = null;
    try {
      why = await cases[mu.case]({ M: await loadCore(p.root), R: await loadCellRunner(p.root) });
    } catch (e) { why = 'threw ' + e.message; }
    /* a throw is the harness failing, never the case catching the defect */
    REPORT.ok(!!why && !why.startsWith('threw '), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + (why ? ' (' + why.slice(0, 200) + ')' : ''));
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!REPORT.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
REPORT.finish();
