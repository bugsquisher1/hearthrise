// tools/balance-sim/plans.mjs — THE MATRIX, pruned (never a blind cartesian product).
//
// Every axis is read from the game's data: the OPEN grounds (src/data/hunt-grounds.js) and their Level bands
// (src/data/hunts.js), the styles (gear.mjs STYLES: every way to fight the worn set allows), gear by Level (gear.mjs).
// Pruning rules (the brief: "in-band ±10 levels"):
//   - a ground is played at its floor, its middle, its top, and 5 / 10 Levels either side (never under Level 1);
//   - a party ground is played solo only by the styles that can stand alone (every style), and by parties of 2-4 built
//     around a tank and a healer (the compositions a party ground is built for), plus one all-damage four;
//   - density: as built, and the ground's full box (8) for the in-band levels; a density sweep only on the reference
//     cells; upgrade steps only at the Levels a tier changes (15 / 30 / 45 ...);
//   - deep runs (enough hours to bound 1 death per 1,000 h) only on each ground's in-band reference cell.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { STYLES } from './gear.mjs';

export const SOLO_STYLES = Object.freeze(Object.keys(STYLES));
/* the compositions of own heroes a party plays (tank + healer first, Tyler 10-16/22: any mix allowed) */
export const PARTIES = Object.freeze({
  duo: Object.freeze(['tank', 'healer']),
  trio: Object.freeze(['tank', 'healer', 'bow']),
  four: Object.freeze(['tank', 'healer', 'bow', 'mage']),
  four_dps: Object.freeze(['tank', 'hammer', 'bow', 'mage']),
});

export async function loadAxes(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const G = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  const { MATERIAL_TIERS } = await import(u('src/data/gear-tiers.js'));
  const grounds = Object.values(G.OPEN_GROUNDS).map((g) => ({ id: g.id, band: HUNT_INDEX[g.hunt].band.slice(), groupFit: g.pockets.some((p) => p.minParty) ? 'party' : g.groupFit,
    soloFrom: g.soloFrom || null, densityMax: g.densityMax ? g.densityMax[0] : 8 })).sort((a, b) => a.band[0] - b.band[0]);
  return { grounds, tierLevels: MATERIAL_TIERS.map((t) => t.level) };
}

const uniq = (xs) => [...new Set(xs)].sort((a, b) => a - b);
const levelsOf = (band, wide) => uniq([band[0] - 10, band[0] - 5, band[0], Math.round((band[0] + band[1]) / 2), band[1], band[1] + 5, ...(wide ? [band[1] + 10] : [])].filter((l) => l >= 1));
const inBand = (band) => uniq([band[0], Math.round((band[0] + band[1]) / 2), band[1]]);
const tag = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => k + '=' + (Array.isArray(v) ? v.join('+') : typeof v === 'object' ? JSON.stringify(v) : v)).join(',');
const cellOf = (o) => ({ id: tag({ g: o.ground, p: o.party, L: o.level, d: o.density, gear: o.gear, bar: o.bar, sup: o.supply, h: o.hours, s: o.seeds, x: o.x }), ...o });

/**
 * The plans. `scale` multiplies hours (the smoke and estimate modes). Each answers [cells | careers].
 */
export function buildPlan(name, axes, scale = 1) {
  const H = (h) => Math.max(0.25, Math.round(h * scale * 4) / 4);
  const out = [];
  const G = axes.grounds;
  if (name === 'smoke') {
    out.push(cellOf({ ground: 'meadowbrook_thicket', party: ['tank'], level: 10, hours: 0.25, seeds: 1 }));
    return out;
  }
  if (name === 'cost') {
    /* one 15-minute play per ground, solo and a four, as built and at the full box: what an hour costs */
    for (const g of G) for (const party of [['tank'], PARTIES.four]) for (const density of [null, 8]) {
      out.push(cellOf({ ground: g.id, party, level: Math.round((g.band[0] + g.band[1]) / 2), density, hours: 0.25, seeds: 1, x: 'cost' }));
    }
    return out;
  }
  /* THE STAGES (x=S1..S7), run in this order; the full plan is the same matrix with longer runs and more seeds. */
  const full = name === 'full';
  const pick = (a, b) => (full ? b : a);
  /* S1 CAREERS: a hero from Level 1 hunting where the game recommends, as built, carrying its XP chunk to chunk */
  if (name === 'career' || name === 'baseline' || full) {
    for (const s of pick(['tank', 'sword', 'hammer', 'bow', 'mage', 'healer'], SOLO_STYLES)) for (const seed of pick([0], [0, 1, 2])) {
      out.push({ id: 'S1:career:' + s + ':s' + seed, kind: 'career', party: [s], startLevel: 1, targetLevel: pick(50, 60), maxHours: pick(300, 600), chunkH: 1, seed });
    }
    out.push({ id: 'S1:career:four:s0', kind: 'career', party: PARTIES.four, startLevel: 8, targetLevel: 50, maxHours: pick(150, 400), chunkH: 1, seed: 0 });
  }
  if (name === 'career') return out;
  if (name === 'whatif') {
    /* THE CANDIDATE CHANGES, in the sim only (worker.mjs applies a job's `whatIf` to the engine's own rows and restores
       them after): each reference cell is played as today (`x=W0`) and under each candidate on the same dice. */
    const refs = [
      { ground: 'meadowbrook_thicket', party: ['tank'], level: 10 }, { ground: 'meadowbrook_thicket', party: ['tank'], level: 10, density: 8 },
      { ground: 'meadowbrook_thicket', party: ['hammer'], level: 10, density: 8 },
      { ground: 'mosslight_glade', party: ['tank'], level: 24 }, { ground: 'mosslight_glade', party: ['hammer'], level: 24, density: 8 },
      { ground: 'mosslight_glade', party: ['bow'], level: 24, density: 8 }, { ground: 'mosslight_glade', party: ['healer'], level: 24, density: 8 },
      { ground: 'mosslight_glade', party: ['tank'], level: 11 }, { ground: 'coppercap_warrens', party: ['tank'], level: 41 },
      { ground: 'coppercap_warrens', party: ['hammer'], level: 41, density: 8 }, { ground: 'coppercap_warrens', party: ['hammer'], level: 27 },
      { ground: 'millrace_sewer', party: PARTIES.four, level: 17, density: 8 },
    ];
    /* W1/W2: monster blows x1.25 / x1.5 on the EA tiers (1-3): the designer's named lever ("monster damage by tier,
       never the shields"); tiers 4-6 keep theirs (no ground uses them) */
    const dmg = (k) => ({ combat: { monsterAttackDamageScale: Math.round(5.4 * k * 100) / 100, monsterDamageScaleByTier: { 3: Math.round(4.0 * k * 100) / 100, 4: 4.0, 5: 3.0, 6: 2.2 } } });
    const variants = [['W0', null], ['W1dmg125', dmg(1.25)], ['W2dmg150', dmg(1.5)]];
    for (const r of refs) for (const [x, whatIf] of variants) out.push({ ...cellOf({ ...r, hours: H(3), seeds: 2, x }), ...(whatIf ? { whatIf } : {}) });
    return out;
  }
  if (name === 'whatif2' || name === 'whatif3') {
    /* W3: A LEVEL-GAP TERM for heroes UNDER a ground's floor (the danger lane's GAP idea; in band nothing changes): every
       monster's `atk` (its accuracy AND its blow) x (1 + 8% per Level under the floor), so 5 under = x1.4, 10 under =
       x1.8. Played on the under-floor cells, today vs the term, same dice. */
    const refs = [
      { ground: 'coppercap_warrens', party: ['hammer'], level: 27, gap: 5 }, { ground: 'coppercap_warrens', party: ['hammer'], level: 22, gap: 10 },
      { ground: 'coppercap_warrens', party: ['tank'], level: 22, gap: 10 }, { ground: 'mosslight_glade', party: ['tank'], level: 11, gap: 5 },
      { ground: 'mosslight_glade', party: ['hammer'], level: 6, gap: 10 }, { ground: 'millrace_sewer', party: ['bow'], level: 3, gap: 5 },
    ];
    /* whatif3: the same term's calibration, +3% and +5% per Level under (W4 / W5) */
    const steps = name === 'whatif2' ? [['W3gap', 0.08]] : [['W4gap3', 0.03], ['W5gap5', 0.05]];
    for (const { gap, ...r } of refs) {
      if (name === 'whatif2') out.push(cellOf({ ...r, hours: H(3), seeds: 2, x: 'W0' }));
      for (const [x, k] of steps) out.push({ ...cellOf({ ...r, hours: H(3), seeds: 2, x }), whatIf: { monsters: { '*': { atk: '*' + Math.round((1 + k * gap) * 100) / 100 } } } });
    }
    return out;
  }
  if (name === 'career8') {
    /* the same lives at the full box (density 8: the "reasonably efficient" pick wherever it stays safe) */
    for (const s of ['tank', 'hammer', 'bow', 'mage']) out.push({ id: 'S1:career8:' + s + ':s0', kind: 'career', party: [s], startLevel: 1, targetLevel: 50, maxHours: 200, chunkH: 1, seed: 0, density: 8 });
    return out;
  }
  if (name === 'baseline' || full) {
    /* S2 THE SOLO GRID, as built: every style on every ground across its band and +-5 / 10 Levels */
    for (const g of G) for (const s of SOLO_STYLES) for (const L of levelsOf(g.band, full)) {
      out.push(cellOf({ ground: g.id, party: [s], level: L, hours: H(pick(2, 24)), seeds: pick(2, 4), x: 'S2' }));
    }
    /* S3 THE FULL BOX (density 8) in band */
    for (const g of G) for (const s of SOLO_STYLES) for (const L of inBand(g.band)) {
      out.push(cellOf({ ground: g.id, party: [s], level: L, density: 8, hours: H(pick(1, 12)), seeds: pick(2, 4), x: 'S3' }));
    }
    /* S4 PARTIES of own heroes in band: as built at every in-band Level, the full box at the middle */
    for (const g of G) for (const [pk, party] of Object.entries(PARTIES)) {
      for (const L of inBand(g.band)) out.push(cellOf({ ground: g.id, party, level: L, hours: H(pick(1, 12)), seeds: pick(2, 4), x: 'S4' + pk }));
      out.push(cellOf({ ground: g.id, party, level: Math.round((g.band[0] + g.band[1]) / 2), density: 8, hours: H(pick(1, 12)), seeds: pick(2, 4), x: 'S4' + pk }));
    }
    /* S5 UPGRADE STEPS at each tier Level a player can reach and wear: the weapon one tier behind, the armour one tier
       behind, the body alone one tier behind (everything else equal), on that Level's recommended solo ground,
       as built and at the full box. A tier nobody can obtain yet (no source: gear.mjs) has no step to measure. */
    for (const T of axes.tierLevels.filter((t) => t > 1 && t <= 50)) {
      const g = G.filter((x) => x.groupFit !== 'party' && x.band[0] <= T).pop();
      for (const s of SOLO_STYLES) for (const only of [null, 'weapon', 'armour', 'body']) for (const density of [null, 8]) {
        out.push(cellOf({ ground: g.id, party: [s], level: T + 1, density, gear: only ? { tierOffset: -1, only } : null, hours: H(density ? pick(1, 12) : pick(3, 24)), seeds: pick(2, 4), x: 'S5' }));
      }
    }
    /* S6 HEALING CONFIG at each solo ground's top Level, the full box: eat at 40% / 80%, own crafted food, no armour */
    for (const g of G.filter((x) => x.groupFit !== 'party' && x.band[0] > 1)) for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) {
      for (const v of [{ bar: { eatPct: 40 } }, { bar: { eatPct: 80 } }, { supply: 'own' }, { gear: { noArmour: true } }]) {
        out.push(cellOf({ ground: g.id, party: [s], level: g.band[1], density: 8, ...v, hours: H(pick(1, 12)), seeds: 2, x: 'S6' }));
      }
    }
    /* S7 DEEP RUNS: long enough to bound deaths per 1,000 h and read close calls per 12 h */
    out.push(cellOf({ ground: 'meadowbrook_thicket', party: ['tank'], level: 10, hours: H(pick(150, 1000)), seeds: 4, x: 'S7' }));
    out.push(cellOf({ ground: 'mosslight_glade', party: ['tank'], level: 24, hours: H(pick(100, 1000)), seeds: 4, x: 'S7' }));
    out.push(cellOf({ ground: 'mosslight_glade', party: ['hammer'], level: 24, density: 8, hours: H(pick(25, 500)), seeds: 4, x: 'S7' }));
    out.push(cellOf({ ground: 'millrace_sewer', party: PARTIES.four, level: 17, hours: H(pick(15, 250)), seeds: 4, x: 'S7' }));
  }
  /* the long jobs first (careers, deep runs), so the pool's tail is short cells */
  const rank = (j) => (j.kind === 'career' ? 0 : /x=S7/.test(j.id) ? 1 : 2);
  return out.map((j, i) => [rank(j), i, j]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
}
