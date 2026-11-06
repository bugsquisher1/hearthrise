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
  const { tierRowOf } = await import(u('src/data/hunt-tiers.js'));
  const grounds = Object.values(G.OPEN_GROUNDS).map((g) => ({ id: g.id, band: HUNT_INDEX[g.hunt].band.slice(), groupFit: g.pockets.some((p) => p.minParty) ? 'party' : g.groupFit,
    soloFrom: g.soloFrom || null, densityMax: g.densityMax ? g.densityMax[0] : 8 })).sort((a, b) => a.band[0] - b.band[0]);
  const { ITEMS } = await import(u('src/data/items.js'));
  /* Every cape and jewelry slot's best row a Level can wear. */
  const dressOf = (L) => Object.fromEntries(['cape', 'necklace', 'ring', 'earrings'].map((slot) => [slot, Object.keys(ITEMS).filter((id) => ITEMS[id].slot === slot && (ITEMS[id].reqLv || 0) <= L).sort((a, b) => (ITEMS[b].reqLv || 0) - (ITEMS[a].reqLv || 0))[0]]).filter(([, id]) => id));
  /* The casters' default slots and the rune family each spends (plan pacefinal's rune and Mend rows). */
  const { ROLE_RULES } = await import(u('src/data/rule-subjects.js'));
  const { ABILITIES } = await import(u('src/data/abilities.js'));
  const { runeId } = await import(u('src/data/runes.js'));
  const familyOf = (abilityId) => (ITEMS[(ABILITIES[abilityId] || {}).rune] || {}).family || null;
  return { grounds, tierLevels: MATERIAL_TIERS.map((t) => t.level), tierRowOf, dressOf, ROLE_RULES, familyOf, runeId };
}

const uniq = (xs) => [...new Set(xs)].sort((a, b) => a - b);
const levelsOf = (band, wide) => uniq([band[0] - 10, band[0] - 5, band[0], Math.round((band[0] + band[1]) / 2), band[1], band[1] + 5, ...(wide ? [band[1] + 10] : [])].filter((l) => l >= 1));
const inBand = (band) => uniq([band[0], Math.round((band[0] + band[1]) / 2), band[1]]);
const tag = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => k + '=' + (Array.isArray(v) ? v.join('+') : typeof v === 'object' ? JSON.stringify(v) : v)).join(',');
const cellOf = (o) => ({ id: tag({ g: o.ground, p: o.party, L: o.level, d: o.density, gear: o.gear, bar: o.bar, sup: o.supply, h: o.hours, s: o.seeds, seg: o.segmentH, x: o.x }), ...o });

/* The Levels the tier plans play each ground at: in range, past it, and pushing. */
export const TIER_LEVELS = Object.freeze({
  meadowbrook_thicket: [5, 8, 12, 15, 2], wickstead: [8, 13, 16, 18, 20, 5], millrace_sewer: [8, 16, 20, 25, 5],
  mosslight_glade: [16, 24, 31, 40, 10, 6], coppercap_warrens: [32, 41, 50, 60, 26, 20],
});
/* The ladder's rungs, by the game's own advice (recommendedHunt) and its Level bands: [lower, upper, Levels at and past the upper's floor]. */
export const TIER_RUNGS = Object.freeze([['meadowbrook_thicket', 'wickstead', [8, 12]], ['meadowbrook_thicket', 'millrace_sewer', [8, 12]], ['wickstead', 'mosslight_glade', [16, 20]], ['millrace_sewer', 'mosslight_glade', [16, 20]], ['mosslight_glade', 'coppercap_warrens', [32, 38]]]);
/* One cell on a tier as written: its pull from the ground's own row, its size's entry. */
const tierCell = (axes, o) => {
  const row = axes.tierRowOf(o.ground, o.tier), pull = row.pull[o.party.length - 1];
  return { ...cellOf({ ground: o.ground, party: o.party, level: o.level, density: pull || null, gear: o.gear, bar: o.bar, supply: o.supply, hours: o.hours, seeds: o.seeds, x: o.x }), ...(o.tier === 'normal' ? {} : { options: { tier: o.tier } }), windowMs: 120000 };
};
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
  if (name === 'ladder') {
    /* THE GROUND LADDER (the Level curve's contract past the last ground, LEVEL_PACE.contract): what each ground pays a
       lone hero IN ITS OWN BAND, as built: every solo ground at its floor, middle and top, and a party ground only from
       the Level it is solo-able (soloFrom), every style, 2 seeds. */
    for (const g of G) {
      const from = g.groupFit === 'party' ? g.soloFrom : g.band[0];
      if (!Number.isInteger(from)) continue;
      for (const s of SOLO_STYLES) for (const L of uniq([from, Math.round((from + g.band[1]) / 2), g.band[1]])) {
        out.push(cellOf({ ground: g.id, party: [s], level: L, hours: H(2), seeds: 2, x: 'LAD' }));
      }
    }
    return out;
  }
  if (name === 'pace' || name === 'pacebounds') {
    /* THE LEVEL PACE (balance layer 1, tools/balance-sim/pace.mjs): every solo style's life from Level 1 to the last
       ground's top, where the game recommends, as built (the reference: the median style); 15-minute chunks while
       Levels come in minutes. 'pacebounds' adds the bounds the reference is not: the full box (density 8) and a party
       of four own heroes. */
    const top = Math.max(...G.map((g) => g.band[1]));
    const life = { kind: 'career', startLevel: 1, targetLevel: top, maxHours: pick(500, 800), chunkH: 1, chunkByLevel: [[1, 0.25], [10, 1]], seed: 0 };
    if (name === 'pace') for (const s of SOLO_STYLES) out.push({ ...life, id: 'P:pace:' + s + ':s0', party: [s] });
    if (name === 'pacebounds') {
      for (const s of ['tank', 'hammer', 'bow', 'mage']) out.push({ ...life, id: 'P:box:' + s + ':s0', party: [s], density: 8 });
      out.push({ ...life, id: 'P:four:s0', party: PARTIES.four });
    }
    return out;
  }
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
  if (name === 'verdict') {
    /* THE VERDICT (lane b-balance-baseline, 2026-10-31): today's game against the ruling, ground x way to fight, and the
       first week first. Every open ground, every style, Level band +-10; in-band gear vs THE STARTER KIT (the practice
       set alone, no armour: a fresh hero) through Level 25; solo and parties of 2 and 4; density as built (the low pull)
       and the full box (8); three seeds a cell. V1 solo as built, V2 solo full box in band, V3 the starter kit, V4
       parties, V5 the upgrade steps at each tier Level, V6 TWELVE-HOUR HUNTS (one segment = one unattended hunt: does
       it finish?) on the first grounds' floor and middle, four seeds each. */
    const STARTER = { starter: true };
    const early = G.filter((g) => g.band[0] <= 16);
    for (const g of G) {
      const lv = levelsOf(g.band, true), ib = inBand(g.band);
      for (const s of SOLO_STYLES) {
        for (const L of lv) out.push(cellOf({ ground: g.id, party: [s], level: L, hours: H(2), seeds: 3, x: 'V1' }));
        for (const L of ib) out.push(cellOf({ ground: g.id, party: [s], level: L, density: 8, hours: H(1.5), seeds: 3, x: 'V2' }));
        if (g.band[0] > 16) continue;
        for (const L of lv.filter((l) => l <= 25)) {
          out.push(cellOf({ ground: g.id, party: [s], level: L, gear: STARTER, hours: H(2), seeds: 3, x: 'V3' }));
          if (ib.includes(L)) out.push(cellOf({ ground: g.id, party: [s], level: L, density: 8, gear: STARTER, hours: H(1.5), seeds: 3, x: 'V3' }));
        }
      }
      for (const pk of ['duo', 'four']) for (const L of ib) for (const density of [null, 8]) {
        out.push(cellOf({ ground: g.id, party: PARTIES[pk], level: L, density, hours: H(1.5), seeds: 3, x: 'V4' + pk }));
        if (L <= 25 && g.band[0] <= 16) out.push(cellOf({ ground: g.id, party: PARTIES[pk], level: L, density, gear: STARTER, hours: H(1.5), seeds: 3, x: 'V4' + pk }));
      }
    }
    for (const T of axes.tierLevels.filter((t) => t > 1 && t <= 50)) {
      const g = G.filter((x) => x.groupFit !== 'party' && x.band[0] <= T).pop();
      for (const s of SOLO_STYLES) for (const only of [null, 'weapon', 'armour', 'body']) for (const density of [null, 8]) {
        out.push(cellOf({ ground: g.id, party: [s], level: T + 1, density, gear: only ? { tierOffset: -1, only } : null, hours: H(2), seeds: 3, x: 'V5' }));
      }
    }
    for (const g of early) for (const L of uniq([g.band[0], Math.round((g.band[0] + g.band[1]) / 2)])) {
      const party = (s) => (g.groupFit === 'party' ? null : [s]);
      for (const s of ['tank', 'hammer', 'axes', 'bow', 'crossbow', 'mage', 'healer']) {
        if (!party(s)) continue;
        out.push(cellOf({ ground: g.id, party: [s], level: L, hours: H(12), seeds: 4, segmentH: 12, x: 'V6' }));
        if (L <= 8) out.push(cellOf({ ground: g.id, party: [s], level: L, gear: STARTER, hours: H(12), seeds: 4, segmentH: 12, x: 'V6' }));
      }
      if (g.groupFit !== 'solo') for (const pk of ['duo', 'four']) {
        out.push(cellOf({ ground: g.id, party: PARTIES[pk], level: L, hours: H(12), seeds: 2, segmentH: 12, x: 'V6' + pk }));
        /* a fresh party in the practice sets at the first party floor (the tutorial's "Into the sewer, together") */
        if (L <= 8) out.push(cellOf({ ground: g.id, party: PARTIES[pk], level: L, gear: STARTER, hours: H(12), seeds: 4, segmentH: 12, x: 'V6' + pk }));
      }
    }
    const rank = (j) => (/x=V6/.test(j.id) ? 0 : /x=V4/.test(j.id) ? 1 : 2);
    return out.map((j, i) => [rank(j), i, j]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
  }
  if (name === 'b1120') {
    /* LANE b-balance-1120 (2026-11-01, v0.2.82): the panel's five claims, on the same dice. x=R: hunting above your Level
       (the 10-18 "waste hunt"), x=P: parties against the same heroes alone, x=W: one upgrade step, x=D: in-band danger,
       x=DD: deep 12 h hunts for the deaths bound, C: careers (gold and hours, hours 1-20 first). */
    const STARTER = { starter: true };
    const MIX = PARTIES.four;
    const REACH = [[7, ['meadowbrook_thicket', 'wickstead', 'millrace_sewer', 'mosslight_glade'], [null, STARTER]],
      [12, ['meadowbrook_thicket', 'wickstead', 'millrace_sewer', 'mosslight_glade'], [null]], [25, ['mosslight_glade', 'millrace_sewer', 'coppercap_warrens'], [null]]];
    for (const [L, gs, kits] of REACH) for (const ground of gs) for (const gear of kits) for (const density of [null, 8]) {
      out.push(cellOf({ ground, party: MIX, level: L, density, gear, hours: H(L === 7 ? 4 : 2), seeds: 2, x: 'R' }));
      for (const s of ['tank', 'hammer', 'mage']) out.push(cellOf({ ground, party: [s], level: L, density, gear, hours: H(2), seeds: 2, x: 'R' }));
    }
    /* a 2 min settle for the cells that read XP and gold: any cut walks the same swings (TICK-1), and it costs less */
    const coarse = { windowMs: 120000 };
    const midOf = (g) => Math.round((g.band[0] + g.band[1]) / 2);
    const COMPS = [['tank', 'healer'], MIX, ['tank', 'hammer', 'bow', 'mage'], ['tank', 'tank'], ['bow', 'bow'], ['mage', 'mage'],
      ['tank', 'tank', 'tank', 'tank'], ['bow', 'bow', 'bow', 'bow'], ['mage', 'mage', 'mage', 'mage']];
    for (const g of G.filter((x) => x.id !== 'mill_cellar')) for (const density of [null, 8]) {
      for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) out.push({ ...cellOf({ ground: g.id, party: [s], level: midOf(g), density, hours: H(2), seeds: 2, x: 'P' }), ...coarse });
      for (const party of COMPS) out.push({ ...cellOf({ ground: g.id, party, level: midOf(g), density, hours: H(1), seeds: 2, x: 'P' }), ...coarse });
    }
    /* the party pull itself: the rows the 11-01 table first measured (duo 4, three 5, four 6), same class and mixed; and a lone hero's
       default pull moved to 4, the other way to put danger in the default */
    for (const [ground, level] of [['meadowbrook_thicket', 10], ['wickstead', 13], ['mosslight_glade', 24]]) {
      for (const party of [['tank', 'tank'], ['bow', 'bow'], ['tank', 'healer']]) out.push({ ...cellOf({ ground, party, level, density: 4, hours: H(1), seeds: 2, x: 'P' }), ...coarse });
      for (const party of [['tank', 'tank', 'tank', 'tank'], ['bow', 'bow', 'bow', 'bow'], MIX]) out.push({ ...cellOf({ ground, party, level, density: 6, hours: H(1), seeds: 2, x: 'P' }), ...coarse });
      for (const s of ['tank', 'hammer', 'mage']) out.push(cellOf({ ground, party: [s], level, density: 4, hours: H(2), seeds: 2, x: 'D' }));
    }
    /* the upgrade steps: everything else equal, on the ground that Level's lone hero is sent to */
    for (const T of axes.tierLevels.filter((t) => t > 1 && t <= 30)) {
      const g = G.filter((x) => x.groupFit !== 'party' && x.band[0] <= T + 1).pop();
      for (const s of ['tank', 'hammer', 'axes', 'bow', 'mage', 'healer']) for (const only of [null, 'weapon', 'armour']) for (const density of [null, 8]) {
        out.push({ ...cellOf({ ground: g.id, party: [s], level: T + 1, density, gear: only ? { tierOffset: -1, only } : null, hours: H(3), seeds: 2, x: 'W' }), ...coarse });
      }
    }
    const life = { kind: 'career', startLevel: 1, targetLevel: 40, maxHours: 30, chunkH: 1, chunkByLevel: [[1, 0.25], [8, 0.5], [12, 1]], seed: 0 };
    for (const s of ['tank', 'hammer', 'axes', 'bow', 'mage', 'healer']) out.push({ ...life, id: 'C:life:' + s, party: [s] });
    for (const s of ['hammer', 'mage']) out.push({ ...life, id: 'C:box:' + s, party: [s], density: 8 });
    out.push({ ...life, id: 'C:four', party: MIX });
    out.push({ ...life, id: 'C:four:box', party: MIX, density: 8 });
    /* the pusher: from Level 7 straight to the Glade and it never leaves, alone and as a four, as built and at the full box */
    const push = { ...life, startLevel: 7, ground: 'mosslight_glade', chunkByLevel: [[1, 0.5], [12, 1]] };
    out.push({ ...push, id: 'C:push:four', party: MIX }, { ...push, id: 'C:push:four:box', party: MIX, density: 8 });
    out.push({ ...push, id: 'C:push:tank', party: ['tank'] }, { ...push, id: 'C:push:box:tank', party: ['tank'], density: 8 });
    for (const g of G.filter((x) => x.groupFit !== 'party')) for (const L of [g.band[0], g.band[1]]) for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) for (const density of [null, 8]) {
      out.push(cellOf({ ground: g.id, party: [s], level: L, density, hours: H(2), seeds: 2, x: 'D' }));
      if (g.band[0] <= 16 && L === g.band[0]) out.push(cellOf({ ground: g.id, party: [s], level: L, density, gear: STARTER, hours: H(2), seeds: 2, x: 'D' }));
    }
    for (const g of G.filter((x) => x.groupFit === 'party')) for (const L of [g.band[0], g.band[1]]) for (const party of [PARTIES.duo, MIX]) {
      out.push(cellOf({ ground: g.id, party, level: L, hours: H(1), seeds: 2, x: 'D' }));
    }
    for (const [ground, party, level, density] of [['meadowbrook_thicket', ['healer'], 5, null], ['mosslight_glade', ['healer'], 16, null], ['mosslight_glade', ['hammer'], 16, 8]]) {
      out.push(cellOf({ ground, party, level, density, hours: H(24), seeds: 2, segmentH: 12, x: 'DD' }));
    }
    const stage = (j) => (/x=R/.test(j.id) ? 0 : j.id.startsWith('C:') ? 1 : /x=P/.test(j.id) ? 2 : /x=W/.test(j.id) ? 3 : 4);
    return out.map((j, i) => [stage(j), i, j]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
  }
  if (name === 'b1120w') {
    /* LANE b-balance-1120's candidates, in the sim only (worker.mjs whatIf): every monster's row HP (a data row: the kill's
       yield does not read it, so XP and coin per kill stay) and the blow scale, on the same dice as today (x=W0). */
    const blow = (k) => ({ monsterAttackDamageScale: Math.round(5.4 * k * 100) / 100, monsterDamageScaleByTier: { 3: Math.round(4.0 * k * 100) / 100, 4: 4.0, 5: 3.0, 6: 2.2 } });
    const hp = (k) => ({ '*': { hp: '*' + k } });
    const VARIANTS = [['W0', null], ['Hx2', { monsters: hp(2) }], ['Hx2B', { monsters: hp(2), combat: blow(1.5) }]];
    const cells = [];
    for (const [ground, L] of [['mosslight_glade', 16], ['wickstead', 8], ['meadowbrook_thicket', 5], ['mosslight_glade', 24]]) {
      for (const s of ['tank', 'hammer', 'mage', 'healer']) for (const density of [null, 8]) cells.push({ ground, party: [s], level: L, density, hours: H(2), seeds: 2 });
    }
    for (const density of [null, 8]) {
      cells.push({ ground: 'mosslight_glade', party: PARTIES.four, level: 7, density, hours: H(2), seeds: 2 }, { ground: 'mosslight_glade', party: ['tank'], level: 7, density, hours: H(2), seeds: 2 }, { ground: 'mosslight_glade', party: ['tank'], level: 12, density, hours: H(2), seeds: 2 });
      for (const s of ['hammer', 'mage']) cells.push({ ground: 'wickstead', party: [s], level: 16, density, gear: { tierOffset: -1, only: 'weapon' }, hours: H(2), seeds: 2 }, { ground: 'wickstead', party: [s], level: 16, density, hours: H(2), seeds: 2 });
    }
    for (const c of cells) for (const [x, whatIf] of VARIANTS) out.push({ ...cellOf({ ...c, x }), ...(whatIf ? { whatIf } : {}) });
    return out;
  }
  if (name === 'b1102a') {
    /* LANE b-rulings-1102, Tyler's "harder monsters": the search for the smallest change, in the sim only. Every monster's atk
       (accuracy and blow) x m: kill speed and yield do not read it, so XP/h should hold. A ground's floor and top, Level kit,
       as built, five ways to fight. x=A100 is today. */
    for (const [ground, levels] of [['mosslight_glade', [16, 31]], ['wickstead', [8, 18]], ['meadowbrook_thicket', [5, 15]]]) for (const level of levels) for (const party of [['tank'], ['hammer'], ['bow'], ['mage'], ['healer']]) {
      for (const m of [1, 1.5, 2, 2.5, 3]) {
        const x = 'A' + Math.round(m * 100);
        out.push({ ...cellOf({ ground, party, level, hours: H(1), seeds: 2, x }), ...(m > 1 ? { whatIf: { monsters: { '*': { atk: '*' + m } } } } : {}) });
      }
    }
    return out;
  }
  if (name === 'b1102b') {
    /* Round 2: blows make the spikes (light armor's close calls at atk x2), so hit MORE OFTEN instead: the monsters' base accuracy (src/core
       combat.js monsterBaseAccuracy, cap monsterMaxAccuracy), alone and with a smaller atk step. No blow gets bigger at B alone. */
    const V = [[65, 1], [80, 1], [65, 1.5], [80, 1.25], [80, 1.5]];
    for (const [ground, levels] of [['mosslight_glade', [16, 24]], ['wickstead', [8]], ['meadowbrook_thicket', [5]]]) for (const level of levels) for (const party of [['tank'], ['hammer'], ['bow'], ['mage'], ['healer']]) {
      for (const [b, m] of V) {
        out.push({ ...cellOf({ ground, party, level, hours: H(1), seeds: 2, x: 'B' + b + 'A' + Math.round(m * 100) }), whatIf: { combat: { monsterBaseAccuracy: b / 100 }, ...(m > 1 ? { monsters: { '*': { atk: '*' + m } } } : {}) } });
      }
    }
    return out;
  }
  if (name === 'b1102c') {
    /* Round 3: the candidate every hold-rule allows. Base accuracy 0.80 everywhere (no blow gets bigger; light armor's close calls stay near today),
       atk by ground. Measured while the level gap was live (it's gone since 2026-11-04). x=C0 is that day's numbers, x=C1 the candidate. */
    const ATK = { mill_cellar: 1, meadowbrook_thicket: 1.25, wickstead: 1.5, millrace_sewer: 1.25, mosslight_glade: 1.5, coppercap_warrens: 1 };
    const FIVE = [['tank'], ['hammer'], ['bow'], ['mage'], ['healer']];
    const FOUR = PARTIES.four;
    const cells = [];
    for (const [ground, L] of [['meadowbrook_thicket', 5], ['meadowbrook_thicket', 10], ['wickstead', 8], ['wickstead', 13], ['mosslight_glade', 16], ['mosslight_glade', 24]]) for (const party of FIVE) cells.push({ ground, party, level: L });
    for (const [ground, L] of [['mill_cellar', 1], ['meadowbrook_thicket', 5], ['wickstead', 8]]) for (const party of FIVE) cells.push({ ground, party, level: L, gear: { starter: true } });
    for (const [ground, L] of [['wickstead', 13], ['mosslight_glade', 16], ['mosslight_glade', 24]]) for (const party of [['tank'], ['hammer'], ['mage']]) cells.push({ ground, party, level: L, density: 8 });
    for (const [ground, L] of [['millrace_sewer', 8], ['millrace_sewer', 17], ['coppercap_warrens', 32], ['meadowbrook_thicket', 7]]) cells.push({ ground, party: FOUR, level: L });
    cells.push({ ground: 'millrace_sewer', party: PARTIES.duo, level: 8, gear: { starter: true } });
    cells.push({ ground: 'mosslight_glade', party: FOUR, level: 7 }, { ground: 'mosslight_glade', party: ['tank'], level: 7 }, { ground: 'mosslight_glade', party: ['hammer'], level: 7 }, { ground: 'mosslight_glade', party: ['tank'], level: 12 });
    const go = (c, x, extra) => { const m = ATK[c.ground]; return { ...cellOf({ hours: H(1), seeds: 2, ...c, ...extra, x }), ...(x === 'C1' ? { whatIf: { combat: { monsterBaseAccuracy: 0.8 }, ...(m > 1 ? { monsters: { '*': { atk: '*' + m } } } : {}) } } : {}) }; };
    for (const c of cells) for (const x of ['C1', 'C0']) out.push(go(c, x));
    /* twelve-hour hunts, the unattended bound, the candidate only */
    for (const [ground, party, L, gear] of [['meadowbrook_thicket', ['healer'], 5, { starter: true }], ['wickstead', ['bow'], 8, null], ['mosslight_glade', ['mage'], 16, null], ['mosslight_glade', ['tank'], 16, null]]) {
      out.push(go({ ground, party, level: L, gear, hours: H(24), seeds: 2, segmentH: 12 }, 'C1'));
    }
    return out;
  }
  if (name === 'b1102d') {
    /* Can the FIRST grounds reach 60-80 at all? Fights that last far longer (HP x3, x5) with the same accuracy step and bigger blows. What it costs in kills, and who dies. */
    for (const [ground, L, gear] of [['meadowbrook_thicket', 5, { starter: true }], ['meadowbrook_thicket', 10, null], ['wickstead', 8, { starter: true }], ['wickstead', 13, null], ['mosslight_glade', 24, null]]) {
      for (const party of [['tank'], ['hammer'], ['bow'], ['mage'], ['healer']]) for (const [x, hp, atk] of [['D3a15', 3, 1.5], ['D3a20', 3, 2], ['D5a15', 5, 1.5], ['D5a20', 5, 2]]) {
        out.push({ ...cellOf({ ground, party, level: L, gear, hours: H(1), seeds: 2, x }), whatIf: { combat: { monsterBaseAccuracy: 0.8 }, monsters: { '*': { hp: '*' + hp, atk: '*' + atk } } } });
      }
    }
    return out;
  }
  if (name === 'b1102e') {
    /* Round 4: per ground, since a global accuracy step breaks the first hour (Thicket L5 practice tank: 2 deaths in 2 h). The Glade's three candidates, floor to top, as built
       and at 8 each; Wickstead's two lighter ones with the practice set; the party grounds at the accuracy step alone. */
    const V = (b, m) => ({ whatIf: { combat: { monsterBaseAccuracy: b / 100 }, ...(m > 1 ? { monsters: { '*': { atk: '*' + m } } } : {}) } });
    const FIVE = [['tank'], ['hammer'], ['bow'], ['mage'], ['healer']];
    for (const [b, m] of [[80, 1.25], [80, 1.5], [65, 1.5]]) {
      const x = 'E' + b + 'a' + Math.round(m * 100);
      for (const L of [16, 24, 31]) for (const party of FIVE) out.push({ ...cellOf({ ground: 'mosslight_glade', party, level: L, hours: H(2), seeds: 2, x }), ...V(b, m) });
      for (const L of [16, 24, 31]) for (const party of [['tank'], ['hammer'], ['mage']]) for (const density of [4, 8]) out.push({ ...cellOf({ ground: 'mosslight_glade', party, level: L, density, hours: H(1), seeds: 2, x }), ...V(b, m) });
    }
    for (const [b, m] of [[65, 1.25], [65, 1.5]]) {
      const x = 'E' + b + 'a' + Math.round(m * 100);
      for (const party of FIVE) {
        out.push({ ...cellOf({ ground: 'wickstead', party, level: 8, gear: { starter: true }, hours: H(1), seeds: 2, x }), ...V(b, m) });
        out.push({ ...cellOf({ ground: 'wickstead', party, level: 8, hours: H(1), seeds: 2, x }), ...V(b, m) });
      }
      for (const L of [13, 18]) out.push({ ...cellOf({ ground: 'wickstead', party: ['tank'], level: L, hours: H(1), seeds: 2, x }), ...V(b, m) });
    }
    /* the unattended bound on the lighter Glade candidate: twelve-hour hunts at its floor */
    for (const party of FIVE) out.push({ ...cellOf({ ground: 'mosslight_glade', party, level: 16, hours: H(24), seeds: 2, segmentH: 12, x: 'EL80a125' }), ...V(80, 1.25) });
    for (const [ground, level] of [['millrace_sewer', 8], ['millrace_sewer', 17], ['coppercap_warrens', 32], ['coppercap_warrens', 41]]) for (const b of [65, 80]) {
      out.push({ ...cellOf({ ground, party: PARTIES.four, level, hours: H(1), seeds: 2, x: 'E' + b + 'a100' }), ...V(b, 1) });
    }
    return out;
  }
  if (name === 'b1102f') {
    /* THE BUILT ROWS, no what-if: Tyler's option A in the data, the gap live. The final table: the Glade floor to top, the pulls, the pusher, twelve-hour hunts, and two lives. */
    const FIVE = [['tank'], ['hammer'], ['bow'], ['mage'], ['healer']];
    for (const level of [16, 24, 31]) for (const party of FIVE) out.push(cellOf({ ground: 'mosslight_glade', party, level, hours: H(2), seeds: 2, x: 'F' }));
    for (const level of [16, 24, 31]) for (const party of [['tank'], ['hammer'], ['mage']]) for (const density of [4, 8]) out.push(cellOf({ ground: 'mosslight_glade', party, level, density, hours: H(1), seeds: 2, x: 'F' }));
    for (const party of [['tank'], ['hammer'], ['mage'], PARTIES.four]) out.push(cellOf({ ground: 'mosslight_glade', party, level: 7, hours: H(1), seeds: 2, x: 'F' }));
    out.push(cellOf({ ground: 'mosslight_glade', party: PARTIES.four, level: 24, hours: H(1), seeds: 2, x: 'F' }));
    for (const party of FIVE) out.push(cellOf({ ground: 'mosslight_glade', party, level: 16, hours: H(24), seeds: 2, segmentH: 12, x: 'FL' }));
    out.push({ kind: 'career', id: 'C:four', party: PARTIES.four, startLevel: 1, targetLevel: 40, maxHours: 12, chunkH: 1, chunkByLevel: [[1, 0.25], [8, 0.5], [12, 1]], seed: 0 });
    out.push({ kind: 'career', id: 'C:tank', party: ['tank'], startLevel: 1, targetLevel: 40, maxHours: 45, chunkH: 1, chunkByLevel: [[1, 0.25], [8, 0.5], [12, 1]], seed: 0 });
    return out;
  }
  if (name === 'b1102t') {
    /* Tyler's party call: same-weapon friends in the Thicket lose about 6-15%, party gold stays below solo. Every way to fight alone, in twos, threes and fours of one weapon, and the mixed three. */
    const coarse = { windowMs: 120000 };
    for (const level of [5, 10]) {
      for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) {
        for (const n of [1, 2, 3, 4]) out.push({ ...cellOf({ ground: 'meadowbrook_thicket', party: Array(n).fill(s), level, hours: H(1), seeds: 2, x: 'T' }), ...coarse });
      }
      for (const party of [PARTIES.duo, PARTIES.trio, PARTIES.four]) out.push({ ...cellOf({ ground: 'meadowbrook_thicket', party, level, hours: H(1), seeds: 2, x: 'T' }), ...coarse });
    }
    return out;
  }
  if (name === 'b1102u') {
    /* The cost of pulling same-weapon coin under solo: threes at 4 each and fours at 5 each, the one row narrower than Tyler's wider pull, against plan b1102t's alone cells. */
    const coarse = { windowMs: 120000 };
    for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) for (const [n, density] of [[3, 4], [4, 5]]) out.push({ ...cellOf({ ground: 'meadowbrook_thicket', party: Array(n).fill(s), level: 10, density, hours: H(1), seeds: 2, x: 'U' }), ...coarse });
    for (const [party, density] of [[PARTIES.trio, 4], [PARTIES.four, 5]]) out.push({ ...cellOf({ ground: 'meadowbrook_thicket', party, level: 10, density, hours: H(1), seeds: 2, x: 'U' }), ...coarse });
    return out;
  }
  if (name === 'b1102p') {
    /* The Party window's "about N% more Level XP each than alone": every ground x party size x class count, against the same heroes alone, at the default pull. */
    const coarse = { windowMs: 120000 };
    const COMP = [['tank', 'tank'], ['tank', 'healer'], ['tank', 'tank', 'tank'], ['tank', 'tank', 'healer'], ['tank', 'bow', 'healer'],
      ['tank', 'tank', 'tank', 'tank'], ['tank', 'tank', 'bow', 'bow'], ['tank', 'tank', 'bow', 'healer'], ['tank', 'healer', 'bow', 'mage']];
    for (const [ground, level] of [['meadowbrook_thicket', 10], ['wickstead', 13], ['mosslight_glade', 24], ['millrace_sewer', 17], ['mill_cellar', 4], ['coppercap_warrens', 41]]) {
      for (const s of ['tank', 'bow', 'mage', 'healer']) out.push({ ...cellOf({ ground, party: [s], level, hours: H(1), seeds: 2, x: 'Q' }), ...coarse });
      for (const party of COMP) out.push({ ...cellOf({ ground, party, level, hours: H(1), seeds: 2, x: 'Q' }), ...coarse });
    }
    return out;
  }
  if (name === 'b1120f') {
    /* The friends' blind party (lane f5-friends, v0.2.82): a mixed three in the Mill Cellar against the same heroes alone, the same three at
       the party's pull alone (the pull's share of the gain), and one class at the party's pull (the bonus's share: same pull, same dice). */
    const coarse = { windowMs: 120000 };
    const TRIO = ['tank', 'bow', 'healer'];
    for (const [gear, level] of [[{ starter: true }, 3], [null, 3], [null, 6]]) {
      out.push({ ...cellOf({ ground: 'mill_cellar', party: TRIO, level, gear, hours: H(1), seeds: 3, x: 'F' }), ...coarse });
      out.push({ ...cellOf({ ground: 'mill_cellar', party: ['tank', 'tank', 'tank'], level, gear, hours: H(1), seeds: 3, x: 'F' }), ...coarse });
      for (const s of TRIO) for (const density of [null, 5]) out.push({ ...cellOf({ ground: 'mill_cellar', party: [s], level, density, gear, hours: H(1), seeds: 3, x: 'F' }), ...coarse });
    }
    return out;
  }
  if (name === 'b1120g') {
    /* The same lane's level-gap term, in the sim only: every monster's `atk` (its accuracy AND its blow) x (1 + k per Level the
       hero stands under the ground's floor). An ENGINE change if chosen (the settle reads the hero's Level against the floor);
       played here as a monsters what-if, since every hero of a cell stands at one Level. In band is untouched by definition. */
    const refs = [['mosslight_glade', 7, 9], ['mosslight_glade', 12, 4], ['coppercap_warrens', 25, 7], ['wickstead', 5, 3]];
    for (const [ground, level, gap] of refs) for (const party of [['tank'], ['hammer'], ['mage'], PARTIES.four]) for (const [x, k] of [['G3', 0.03], ['G5', 0.05], ['G8', 0.08], ['G12', 0.12]]) {
      out.push({ ...cellOf({ ground, party, level, hours: H(2), seeds: 2, x }), whatIf: { monsters: { '*': { atk: '*' + Math.round((1 + k * gap) * 100) / 100 } } } });
    }
    return out;
  }
  if (name === 'gold1103') {
    /* LANE c-gold-matters (2026-11-03): what a new account earns, hour by hour, and what each ground's floor can bear.
       C: lives from Level 1 (every style alone, a duo and a four: two heroes are free, four are the optimizer), x=F: every
       style at every open ground's floor, middle and top in Level kit, 2 seeds, x=T: the thin kits at the floors (the practice
       set a hero who never equips anything stands in), x=Q: the party grounds' parties, x=B: a pull held at 8 each. */
    const life = { kind: 'career', startLevel: 1, targetLevel: 60, maxHours: 30, chunkH: 1, chunkByLevel: [[1, 0.25], [8, 0.5], [12, 1]], seed: 0 };
    for (const s of ['tank', 'hammer', 'axes', 'bow', 'mage', 'healer']) out.push({ ...life, id: 'C:life:' + s, party: [s] });
    out.push({ ...life, id: 'C:duo', party: PARTIES.duo, maxHours: 20 });
    out.push({ ...life, id: 'C:four', party: PARTIES.four, maxHours: 20 });
    const mid = (g) => Math.round((g.band[0] + g.band[1]) / 2);
    for (const g of G) for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) for (const L of uniq([g.band[0], mid(g), g.band[1]])) {
      out.push(cellOf({ ground: g.id, party: [s], level: Math.max(1, L), hours: H(1), seeds: 2, x: 'F' }));
    }
    for (const g of G.filter((x) => x.band[0] <= 16)) for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) {
      out.push(cellOf({ ground: g.id, party: [s], level: Math.max(1, g.band[0]), gear: { starter: true }, hours: H(1), seeds: 2, x: 'T' }));
    }
    for (const g of G.filter((x) => x.groupFit === 'party' || x.band[0] >= 8)) for (const party of [PARTIES.duo, PARTIES.four]) for (const L of uniq([g.band[0], mid(g), g.band[1]])) {
      out.push(cellOf({ ground: g.id, party, level: L, hours: H(1), seeds: 2, x: 'Q' }));
    }
    for (const [ground, level] of [['wickstead', 13], ['mosslight_glade', 16], ['mosslight_glade', 24], ['coppercap_warrens', 45]]) for (const s of ['tank', 'hammer', 'mage']) {
      out.push(cellOf({ ground, party: [s], level, density: 8, hours: H(1), seeds: 2, x: 'B' }));
    }
    return out;
  }
  if (name === 'gold1103l') {
    /* THE LADDER AT ONE LEVEL (Tyler 2026-11-03: harder monsters pay more, nothing rewards staying on a weak ground): the same
       hero, same kit, on every ground its Level could stand on, so a ground reads against the one below it at equal strength. */
    for (const L of [5, 8, 10, 13, 16, 20, 25, 31, 40]) for (const g of G) {
      if (L < g.band[0] - 12 || L > g.band[1] + 8) continue;
      for (const s of ['tank', 'hammer', 'mage']) out.push(cellOf({ ground: g.id, party: [s], level: L, hours: H(1), seeds: 2, x: 'L' }));
    }
    return out;
  }
  if (name === 'gu1104') {
    /* THE GEAR UPGRADE'S EVIDENCE (Tyler 2026-11-04: "some sort of upgrade system that slightly increases gear power"; lane/c-gear-upgrade). C: what a lone hero, a pair and a four earn to hour 100, spending
       nothing, the piles it must bite on. The rest, in the sim only (worker.mjs whatIf): the Level's kit with its weapon's fighting numbers or its armor value at +10% and +20%, against the same hero one tier
       behind (gear.mjs tierOffset), on the same dice, so the most an upgrade gives reads against the step it must not pass. Armor adds whole points to the body piece (mitigation.js floors each piece). */
    const life = { kind: 'career', startLevel: 1, targetLevel: 200, maxHours: 100, chunkH: 1, chunkByLevel: [[1, 0.25], [8, 0.5], [12, 1]], seed: 0 };
    for (const s of ['tank', 'hammer', 'mage']) out.push({ ...life, id: 'C:life:' + s, party: [s] });
    out.push({ ...life, id: 'C:duo', party: PARTIES.duo });
    out.push({ ...life, id: 'C:four', party: PARTIES.four, maxHours: 50 });
    const WEAPONS = { iron_sword: { atkB: 7, strB: 6 }, iron_warhammer: { atkB: 7, strB: 16 }, longbow: { atkB: 9, strB: 6, rangeAtkB: 9, rangeStrB: 6 }, oak_wand: { atkB: 7, strB: 8, magicAtkB: 7, magicStrB: 8 }, oak_staff: { atkB: 6, strB: 9, magicAtkB: 6, magicStrB: 9 },
      steel_sword: { atkB: 12, strB: 10 }, steel_warhammer: { atkB: 9, strB: 23 }, willow_longbow: { atkB: 14, strB: 10, rangeAtkB: 14, rangeStrB: 10 }, willow_wand: { atkB: 12, strB: 13, magicAtkB: 12, magicStrB: 13 }, willow_staff: { atkB: 10, strB: 14, magicAtkB: 10, magicStrB: 14 } };
    const weaponsAt = (m) => Object.fromEntries(Object.entries(WEAPONS).map(([id, f]) => [id, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v * m * 100) / 100]))]));
    const ARMOR = { 10: { iron_platebody: 16, studded_body: 9, adept_body: 5, steel_platebody: 29, boarhide_body: 16, scholar_body: 9 }, 20: { iron_platebody: 19, studded_body: 11, adept_body: 6, steel_platebody: 35, boarhide_body: 19, scholar_body: 11 } };
    const armorAt = (pct) => Object.fromEntries(Object.entries(ARMOR[pct]).map(([id, defB]) => [id, { defB }]));
    const VARIANTS = [['base', {}], ['W10', { whatIf: { items: weaponsAt(1.1) } }], ['W20', { whatIf: { items: weaponsAt(1.2) } }], ['A10', { whatIf: { items: armorAt(10) } }], ['A20', { whatIf: { items: armorAt(20) } }],
      ['stepW', { gear: { tierOffset: -1, only: 'weapon' } }], ['stepA', { gear: { tierOffset: -1, only: 'armour' } }]];
    for (const L of [24, 40]) for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) for (const [x, o] of VARIANTS) {
      out.push({ ...cellOf({ ground: 'mosslight_glade', party: [s], level: L, hours: H(2), seeds: 2, x: 'P' + x, ...(o.gear ? { gear: o.gear } : {}) }), ...(o.whatIf ? { whatIf: o.whatIf } : {}) });
    }
    /* a bigger pull, where armor and the bill matter most, and a four on the party ground */
    for (const s of ['tank', 'hammer', 'mage']) for (const [x, o] of VARIANTS.slice(0, 5)) {
      out.push({ ...cellOf({ ground: 'mosslight_glade', party: [s], level: 24, density: 8, hours: H(2), seeds: 2, x: 'B' + x }), ...(o.whatIf ? { whatIf: o.whatIf } : {}) });
    }
    for (const [x, o] of VARIANTS) {
      out.push({ ...cellOf({ ground: 'coppercap_warrens', party: PARTIES.four, level: 40, hours: H(1), seeds: 2, x: 'Q' + x, ...(o.gear ? { gear: o.gear } : {}) }), windowMs: 120000, ...(o.whatIf ? { whatIf: o.whatIf } : {}) });
    }
    return out;
  }
  if (name === 'gu1104d') {
    /* The second half (sim only): a hero's EVERY blow at +5% and +10%, spells and cleaves too, stood in for by the monsters' HP (a weapon's numbers never reach a spell: gu1104's W cells read 0 to +0.7% on a mage and a bow), and armor at about +5%. */
    const DEALT = [['D5', { whatIf: { monsters: { '*': { hp: '*0.952' } } } }], ['D10', { whatIf: { monsters: { '*': { hp: '*0.909' } } } }]];
    for (const L of [24, 40]) for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) for (const [x, o] of DEALT) out.push({ ...cellOf({ ground: 'mosslight_glade', party: [s], level: L, hours: H(2), seeds: 2, x: 'P' + x }), whatIf: o.whatIf });
    for (const s of ['tank', 'hammer', 'mage']) for (const [x, o] of DEALT) out.push({ ...cellOf({ ground: 'mosslight_glade', party: [s], level: 24, density: 8, hours: H(2), seeds: 2, x: 'B' + x }), whatIf: o.whatIf });
    const A5 = { items: { iron_platebody: { defB: 14 }, studded_body: { defB: 8 }, steel_platebody: { defB: 25 }, boarhide_body: { defB: 14 } } };
    for (const L of [24, 40]) for (const s of ['tank', 'hammer', 'bow']) out.push({ ...cellOf({ ground: 'mosslight_glade', party: [s], level: L, hours: H(2), seeds: 2, x: 'PA5' }), whatIf: A5 });
    for (const s of ['tank', 'hammer']) out.push({ ...cellOf({ ground: 'mosslight_glade', party: [s], level: 24, density: 8, hours: H(2), seeds: 2, x: 'BA5' }), whatIf: A5 });
    return out;
  }
  if (name === 'gu1105') {
    /* TEMPERING ON ITS REAL HOOK (src/core/temper.js, on the settle; replaces gu1104's stand-ins): a whole ladder of Blows, of Armor, and both, against rung 0 and one tier behind, same dice. */
    const FULL = { blows: { 'temper:blows:2': 5, 'temper:blows:3': 5 }, armor: { 'temper:armor:2': 5, 'temper:armor:3': 5 } };
    const VARIANTS = [['base', {}], ['Bmax', { temper: FULL.blows }], ['Amax', { temper: FULL.armor }], ['Both', { temper: { ...FULL.blows, ...FULL.armor } }]];
    const STEPS = [['stepW', { gear: { tierOffset: -1, only: 'weapon' } }], ['stepA', { gear: { tierOffset: -1, only: 'armour' } }]];
    for (const [ground, L] of [['mosslight_glade', 24], ['coppercap_warrens', 38]]) for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) for (const [x, o] of [...VARIANTS, ...STEPS]) {
      out.push({ ...cellOf({ ground, party: [s], level: L, hours: H(2), seeds: 2, x: 'P' + x, ...(o.gear ? { gear: o.gear } : {}) }), ...(o.temper ? { temper: o.temper } : {}) });
    }
    for (const s of ['tank', 'hammer', 'mage']) for (const [x, o] of VARIANTS) {
      out.push({ ...cellOf({ ground: 'mosslight_glade', party: [s], level: 24, density: 8, hours: H(2), seeds: 2, x: 'B' + x }), ...(o.temper ? { temper: o.temper } : {}) });
    }
    for (const [x, o] of VARIANTS) {
      out.push({ ...cellOf({ ground: 'coppercap_warrens', party: PARTIES.four, level: 40, hours: H(1), seeds: 2, x: 'Q' + x }), windowMs: 120000, ...(o.temper ? { temper: o.temper } : {}) });
    }
    return out;
  }
  if (name === 'risk') {
    /* THE RISK LADDER (Tyler 2026-11-04 UTC): a harder ground pays more and hits harder, and any hero may walk in. Every open ground at its floor and 3, 6, 10, 15 and 25 Levels under, three builds:
       poor = the practice set, no armor; average = the Level's best helm, body and boots on store food; optimized = every slot of the Level's best on crafted food, eating early. Read by risk-table.mjs. */
    const BUILDS = { poor: { gear: { starter: true } }, average: { gear: { armourSlots: ['helmet', 'body', 'boots'] } }, optimized: { supply: 'own', bar: { eatPct: 70 } } };
    for (const g of G) for (const gap of [0, 3, 6, 10, 15, 25]) {
      const level = g.band[0] - gap;
      if (level < 1) continue;
      for (const [x, b] of Object.entries(BUILDS)) {
        out.push({ ...cellOf({ ground: g.id, party: ['tank'], level, hours: H(2), seeds: 2, x: 'R' + gap + x, ...b }), windowMs: 120000 });
        out.push({ ...cellOf({ ground: g.id, party: PARTIES.four, level, hours: H(1), seeds: 2, x: 'R' + gap + x, ...b }), windowMs: 120000 });
      }
    }
    return out;
  }
  if (name === 'riskclimb') {
    /* DOES THE PAY CLIMB WITH THE GROUND, AND THE BILL WITH IT? One hero at one Level on every ground its Level hasn't outgrown: alone and a full mix, average and built (plan risk's builds). */
    const BUILDS = { average: { gear: { armourSlots: ['helmet', 'body', 'boots'] } }, optimized: { supply: 'own', bar: { eatPct: 70 } } };
    for (const g of G) for (const level of [10, 13, 24, 29]) for (const party of [['tank'], PARTIES.four]) for (const [x, b] of Object.entries(BUILDS)) {
      if (level > g.band[1]) continue;
      out.push({ ...cellOf({ ground: g.id, party, level, hours: H(party.length > 1 ? 1 : 2), seeds: 2, x: 'C' + x, ...b }), windowMs: 120000 });
    }
    return out;
  }
  if (name === 'riskwhat') {
    /* A PROPOSAL'S EVIDENCE, IN THE SIM ONLY (worker.mjs whatIf; never written to a data file): the party grounds' monsters at atk x1.25 and x1.5, at the floor and pushing, a full mix and a pair, on store food. */
    const avg = { gear: { armourSlots: ['helmet', 'body', 'boots'] } };
    for (const [ground, levels] of [['coppercap_warrens', [32, 26, 17]], ['millrace_sewer', [8, 5, 2]]]) for (const level of levels) for (const party of [PARTIES.four, PARTIES.duo]) for (const m of [1, 1.25, 1.5]) {
      out.push({ ...cellOf({ ground, party, level, hours: H(1), seeds: 2, x: 'W' + m * 100, ...avg }), windowMs: 120000, ...(m > 1 ? { whatIf: { monsters: { '*': { atk: '*' + m } } } } : {}) });
    }
    return out;
  }
  if (name === 'armorw') {
    /* The monsters' own stats, sim only (worker.mjs whatIf): the Glade and the Warrens at atk x1, x1.25 and x1.5 on today's tree, in range and pushing, alone in every way to fight at the floor and a pair and a four. */
    const THREE = { armourSlots: ['helmet', 'body', 'boots'] }, TWO = { armourSlots: ['helmet', 'body'] };
    const VARIANTS = { startAvg: { gear: THREE, startBar: true }, avg: { gear: THREE }, two: { gear: TWO }, kit: {} };
    const cell = (ground, party, level, x, b, m) => ({ ...cellOf({ ground, party, level, hours: H(1), seeds: 2, x, ...b }), windowMs: 120000, ...(m > 1 ? { whatIf: { monsters: { '*': { atk: '*' + m } } } } : {}) });
    for (const m of [1, 1.25, 1.5]) for (const [ground, levels, floor] of [['mosslight_glade', [16, 24, 31, 13, 10, 6], 16], ['coppercap_warrens', [32, 41, 26, 17], 32]]) {
      for (const level of levels) {
        for (const b of ['startAvg', 'kit']) { const x = 'W' + m * 100 + b; out.push(cell(ground, ['tank'], level, x, VARIANTS[b], m)); out.push(cell(ground, PARTIES.four, level, x, VARIANTS[b], m)); out.push(cell(ground, PARTIES.duo, level, x, VARIANTS[b], m)); }
        if (level === floor) {
          for (const b of ['avg', 'two']) out.push(cell(ground, ['tank'], level, 'W' + m * 100 + b, VARIANTS[b], m));
          for (const s of ['hammer', 'bow', 'mage', 'healer']) out.push(cell(ground, [s], level, 'W' + m * 100 + 'kit', VARIANTS.kit, m));
        }
      }
    }
    return out;
  }
  if (name === 'armor') {
    /* WHAT ARMOR READS (2026-11-04): in range and pushing, alone and in a four, the first-hour grounds, on today's default food and the ground's guide food. x = A<build>, plus W125 when every Warrens monster's atk is x1.25
       (sim only). startPoor / startAvg play START_BAR as shipped; avg / kit the ground's guide food on the store; built every slot on crafted food, eating early. Read by risk-table.mjs --compare. */
    const THREE = { armourSlots: ['helmet', 'body', 'boots'] };
    const BUILDS = { startPoor: { gear: { starter: true }, startBar: true }, startAvg: { gear: THREE, startBar: true }, avg: { gear: THREE }, kit: {}, built: { supply: 'own', bar: { eatPct: 70 } } };
    const ROWS = { mill_cellar: [1, 3], meadowbrook_thicket: [5, 10, 2], wickstead: [8, 13, 5, 2], millrace_sewer: [8, 16, 5, 2], mosslight_glade: [16, 24, 31, 13, 10, 6, 1], coppercap_warrens: [32, 41, 50, 29, 26, 22, 17, 7] };
    const cell = (ground, party, level, x, b, whatIf) => ({ ...cellOf({ ground, party, level, hours: H(1), seeds: 2, x, ...b }), windowMs: 120000, ...(whatIf ? { whatIf } : {}) });
    for (const [ground, levels] of Object.entries(ROWS)) for (const level of levels) {
      for (const [b, o] of Object.entries(BUILDS)) out.push(cell(ground, ['tank'], level, 'A' + b, o));
      for (const b of ['startAvg', 'kit']) out.push(cell(ground, PARTIES.four, level, 'A' + b, BUILDS[b]));
      if (level < (axes.grounds.find((g) => g.id === ground) || { band: [0] }).band[0]) out.push(cell(ground, PARTIES.four, level, 'Abuilt', BUILDS.built));
      if (ground === 'coppercap_warrens') {
        const w = { monsters: { '*': { atk: '*1.25' } } };
        for (const b of ['startAvg', 'kit']) { out.push(cell(ground, ['tank'], level, 'A' + b + 'W125', BUILDS[b], w)); out.push(cell(ground, PARTIES.four, level, 'A' + b + 'W125', BUILDS[b], w)); }
      }
    }
    /* the other two armor lines: medium (dodge) and light (ward), at a floor and pushing */
    for (const [ground, level] of [['meadowbrook_thicket', 5], ['millrace_sewer', 8], ['mosslight_glade', 16], ['mosslight_glade', 10], ['coppercap_warrens', 32], ['coppercap_warrens', 22]]) {
      for (const s of ['bow', 'mage']) out.push(cell(ground, [s], level, 'Akit', BUILDS.kit));
    }
    return out;
  }
  if (name === 'tierpull') {
    /* THE PULL WITH NO TIER (lane/c-difficulty-tiers, Tyler 2026-11-04: "what if we consider not having a dial for amount of mobs?"): today's rows, the Glade and the Warrens, every way to fight, what each pull pays in range.
       Read by tiers-table.mjs --pull. x=P. */
    for (const [ground, levels] of [['mosslight_glade', [16, 24, 31]], ['coppercap_warrens', [32, 41, 50]]]) for (const level of levels) for (const density of [null, 4, 5, 6, 8]) {
      for (const s of SOLO_STYLES) out.push({ ...cellOf({ ground, party: [s], level, density, hours: H(1), seeds: 2, x: 'P' }), windowMs: 120000 });
      for (const party of [PARTIES.four, PARTIES.four_dps]) out.push({ ...cellOf({ ground, party, level, density, hours: H(1), seeds: 2, x: 'P' }), windowMs: 120000 });
    }
    return out;
  }
  if (name === 'tierfinal') {
    /* THE TIERS AS WRITTEN (src/data/hunt-tiers.js): every ground that offers them, in range, pushing and past the ground, every way to fight, alone, a pair, a three, two fours. x = F<tier>. A cell's pull is its row's. */
    const WHO = [['tank'], ['sword'], ['hammer'], ['axes'], ['bow'], ['crossbow'], ['mage'], ['healer'], PARTIES.duo, PARTIES.trio, PARTIES.four, PARTIES.four_dps];
    for (const [ground, levels] of Object.entries(TIER_LEVELS)) for (const level of levels) for (const party of WHO) for (const tier of ['normal', 'dangerous', 'deadly']) {
      out.push(tierCell(axes, { ground, party, level, tier, hours: H(1), seeds: 2, x: 'F' + tier }));
    }
    return out;
  }
  if (name === 'tierrows') {
    /* THE LOWER GROUNDS' ROWS, IN THE SIM ONLY (whatIf on hunt-tiers.js; never written to a data file): pull, power and XP on the three grounds the sample's numbers don't fit. x = R<tier>:<pull>:<power>:<xp>. */
    const WHO = [['tank'], ['hammer'], ['bow'], ['mage'], ['healer'], PARTIES.duo, PARTIES.four, PARTIES.four_dps];
    const CANDS = {
      meadowbrook_thicket: [['dangerous', [0, 0, 0, 0], 1250, 1050], ['dangerous', [0, 0, 0, 0], 1500, 1050], ['deadly', [0, 0, 0, 0], 2000, 1100], ['deadly', [0, 0, 0, 0], 2500, 1100], ['deadly', [0, 0, 0, 0], 3000, 1100], ['deadly', [3, 6, 6, 6], 2000, 1000]],
      wickstead: [['dangerous', [3, 4, 4, 5], 1200, 1050], ['dangerous', [3, 4, 4, 5], 1500, 1050], ['deadly', [5, 8, 8, 8], 1500, 1100], ['deadly', [5, 8, 8, 8], 2000, 1100], ['deadly', [4, 8, 8, 8], 2000, 1100]],
      millrace_sewer: [['dangerous', [0, 5, 5, 6], 1200, 1050], ['dangerous', [0, 5, 5, 6], 1500, 1050], ['deadly', [0, 8, 8, 8], 1500, 1100], ['deadly', [0, 8, 8, 8], 2000, 1100]],
    };
    for (const [ground, rows] of Object.entries(CANDS)) for (const level of { meadowbrook_thicket: [5, 8, 12], wickstead: [8, 16, 20], millrace_sewer: [8, 16, 20] }[ground]) for (const [tier, pull, powerPm, xpPm] of rows) for (const party of WHO) {
      const density = pull[party.length - 1];
      out.push({ ...cellOf({ ground, party, level, density: density || null, hours: H(1), seeds: 2, x: 'R' + tier + ':' + pull.join('') + ':' + powerPm + ':' + xpPm }), options: { tier }, windowMs: 120000, whatIf: { tiers: { [ground]: { [tier]: { id: tier, pull, powerPm, xpPm } } } } });
    }
    return out;
  }
  if (name === 'tiercaps') {
    /* WHY A LONE HERO HAS NO BIGGER PULL ON THE CAPPED GROUNDS: the rows refused, alone, in the sim only (whatIf; never written to a data file). Read by tiers-table.mjs --caps against plan tierladder's Normals. x = C<pull alone>:<power>:<xp>. */
    const REFUSED = [['meadowbrook_thicket', [8, 8, 8, 8], 1000, 1000, [8, 12]], ['meadowbrook_thicket', [3, 6, 6, 6], 2000, 1000, [8, 12]], ['wickstead', [8, 8, 8, 8], 2000, 1000, [16, 20]], ['wickstead', [8, 8, 8, 8], 2000, 1100, [16, 20]], ['millrace_sewer', [4, 8, 8, 8], 1750, 1100, [16, 20]], ['millrace_sewer', [8, 8, 8, 8], 1750, 1100, [16, 20]]];
    for (const [ground, pull, powerPm, xpPm, levels] of REFUSED) for (const level of levels) for (const s of ['hammer', 'axes', 'bow', 'mage']) {
      out.push({ ...cellOf({ ground, party: [s], level, density: pull[0], hours: H(1), seeds: 2, x: 'C' + pull[0] + ':' + powerPm + ':' + xpPm }), options: { tier: 'deadly' }, windowMs: 120000, whatIf: { tiers: { [ground]: { deadly: { id: 'deadly', pull, powerPm, xpPm } } } } });
    }
    return out;
  }
  if (name === 'armortier') {
    /* BALANCE RULING §9 ON THE REAL SETTLE (a meaningful armor upgrade is 3-5% less actual incoming damage): each rung on its own ground, the whole set and the body one tier behind, three weights. Same dice. */
    for (const [ground, level] of [['wickstead', 16], ['millrace_sewer', 16], ['mosslight_glade', 16], ['mosslight_glade', 31], ['coppercap_warrens', 32]]) for (const s of ['tank', 'bow', 'mage']) {
      for (const [x, gear] of [['Tnew', {}], ['Tset', { tierOffset: -1, only: 'armour' }], ['Tbody', { tierOffset: -1, only: 'body' }], ['Thelmet', { tierOffset: -1, only: 'helmet' }]]) {
        out.push({ ...cellOf({ ground, party: [s], level, gear, hours: H(2), seeds: 2, x }), windowMs: 120000 });
      }
    }
    return out;
  }
  if (name === 'tierladder') {
    /* THE LADDER RULE (src/data/hunt-tiers.js): a ground's top tier must not beat the next ground's Normal at the Level that fits it, or nobody moves on. Each rung at the upper ground's floor and past it, the rows as written, the Tempered kit beside the plain one (x = L<tier>, LT<tier>: every rung of both tracks, tier 1 has none). Read by tiers-table.mjs --ladder. */
    const WHO = [['tank'], ['sword'], ['hammer'], ['axes'], ['bow'], ['crossbow'], ['mage'], ['healer'], PARTIES.duo, PARTIES.trio, PARTIES.four, PARTIES.four_dps];
    const FULL = { 'temper:blows:2': 5, 'temper:blows:3': 5, 'temper:armor:2': 5, 'temper:armor:3': 5 };
    for (const [lower, upper, levels] of TIER_RUNGS) for (const level of levels) for (const party of WHO) for (const [x, temper] of [['L', null], ['LT', level >= 15 ? FULL : null]]) {
      if (x === 'LT' && !temper) continue;
      const t = temper ? { temper } : {};
      out.push({ ...tierCell(axes, { ground: lower, party, level, tier: 'normal', hours: H(1), seeds: 2, x: x + 'normal' }), ...t });
      out.push({ ...tierCell(axes, { ground: lower, party, level, tier: 'dangerous', hours: H(1), seeds: 2, x: x + 'dangerous' }), ...t });
      out.push({ ...tierCell(axes, { ground: lower, party, level, tier: 'deadly', hours: H(1), seeds: 2, x: x + 'deadly' }), ...t });
      out.push({ ...tierCell(axes, { ground: upper, party, level, tier: 'normal', hours: H(1), seeds: 2, x: x + 'normal' }), ...t });
    }
    /* DRESSED: the same rungs with every cape and jewelry slot's best at that Level, on crafted food eaten early: where a guard or food change would show. x = LB. */
    for (const [lower, upper, levels] of TIER_RUNGS) for (const level of levels) for (const party of WHO) {
      const kit = { gear: { also: axes.dressOf(level) }, supply: 'own', bar: { eatPct: 70 }, party, level, hours: H(1), seeds: 2 };
      out.push(tierCell(axes, { ...kit, ground: lower, tier: 'deadly', x: 'LBdeadly' }));
      out.push(tierCell(axes, { ...kit, ground: upper, tier: 'normal', x: 'LBnormal' }));
    }
    return [...new Map(out.map((c) => [c.id, c])).values()];
  }
  if (name === 'firsthour') {
    /* LEVELS 1-8, WHERE A NEW HERO CAN WALK: every first ground at Levels 1, 3, 5, 8, on the shipped bar. Every way to fight alone in the practice set, the tank in three bronze pieces, a four in the practice set. */
    const THREE = { armourSlots: ['helmet', 'body', 'boots'] };
    for (const ground of ['mill_cellar', 'meadowbrook_thicket', 'wickstead', 'millrace_sewer', 'mosslight_glade']) for (const level of [1, 3, 5, 8]) {
      for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) out.push({ ...cellOf({ ground, party: [s], level, gear: { starter: true }, startBar: true, hours: H(1), seeds: 2, x: 'Fpractice' }), startBar: true, windowMs: 120000 });
      out.push({ ...cellOf({ ground, party: ['tank'], level, gear: THREE, startBar: true, hours: H(1), seeds: 2, x: 'Fbronze' }), startBar: true, windowMs: 120000 });
      out.push({ ...cellOf({ ground, party: PARTIES.four, level, gear: { starter: true }, startBar: true, hours: H(1), seeds: 2, x: 'Fpractice' }), startBar: true, windowMs: 120000 });
    }
    return out;
  }
  if (name === 'gladefour') {
    /* IS THERE A STATS-ONLY ANSWER TO THE GLADE'S MIXED FOUR? Sim only: every monster's atk or the pull, at the floor, in range and pushing, a four against the lone hero who has to live with the same row. */
    const lone = { armourSlots: ['helmet', 'body'] };
    const row = (party, level, gear, x, extra) => ({ ...cellOf({ ground: 'mosslight_glade', party, level, gear, hours: H(1), seeds: 2, x, ...(extra && extra.density ? { density: extra.density } : {}) }), windowMs: 120000, ...(extra && extra.m > 1 ? { whatIf: { monsters: { '*': { atk: '*' + extra.m } } } } : {}) });
    for (const m of [1, 1.05, 1.1, 1.25, 1.5, 2, 3]) {
      for (const L of [16, 24, 13, 10, 6]) out.push(row(PARTIES.four, L, {}, 'Gatk' + m * 100, { m }));
      out.push(row(['tank'], 16, lone, 'Gatk' + m * 100, { m }));
    }
    for (const d of [4, 5, 6, 8]) for (const L of [16, 24, 13, 10, 6]) out.push(row(PARTIES.four, L, {}, 'Gpull' + d, { density: d }));
    /* the monsters' other own stats: their level (armor reads it) and their HP (the fight lasts longer, the XP doesn't move) */
    for (const [x, fields] of [['Glevel150', { level: '*1.5' }], ['Glevel200', { level: '*2' }], ['Ghp150', { hp: '*1.5' }], ['Ghp200', { hp: '*2' }]]) {
      for (const [party, L, gear] of [[PARTIES.four, 16, {}], [PARTIES.four, 10, {}], [PARTIES.four, 6, {}], [['tank'], 16, lone]]) {
        out.push({ ...row(party, L, gear, x), whatIf: { monsters: { '*': fields } } });
      }
    }
    return out;
  }
  if (name === 'bowrush') {
    /* THE LEVEL 1 BOW (2026-11-05): a fresh hero's practice set and shipped bar on grounds far above it, kiters against the rest, deep enough to read a death; then the Glade's monsters' own speed (sim only), with the in-range floors it must not move. */
    const fresh = { gear: { starter: true }, startBar: true };
    const run = (ground, party, level, x, b, whatIf, seeds = 4) => ({ ...cellOf({ ground, party, level, hours: H(2), seeds, x, ...b }), windowMs: 120000, ...(whatIf ? { whatIf } : {}) });
    for (const [ground, levels] of [['mosslight_glade', [1, 5, 10, 15]], ['coppercap_warrens', [1, 5, 10, 20]], ['millrace_sewer', [1, 5]]]) for (const level of levels) for (const s of ['bow', 'crossbow', 'mage']) out.push(run(ground, [s], level, 'B0', fresh));
    const SPEEDS = { B3400: 3400, B3800: 3800, B4400: 4400 };
    for (const [x, sp] of [['B0', 0], ...Object.entries(SPEEDS)]) {
      const w = sp ? { monsters: Object.fromEntries(['glade_poacher', 'goblin_sluicer', 'brook_bear', 'rook_poacher', 'carrion_crow'].map((id) => [id, { speed: Math.max(sp, id === 'carrion_crow' ? 4400 : 0) }])) } : null;
      for (const level of [1, 5, 10]) for (const s of ['bow', 'mage']) out.push(run('mosslight_glade', [s], level, x + 'S', fresh, w));
      /* the floors it must not move: every way to fight at 16 and 24 in the Level's kit, the lone tank in helm and body, a full mix */
      for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) out.push(run('mosslight_glade', [s], 16, x + 'F', {}, w, 2));
      out.push(run('mosslight_glade', ['tank'], 16, x + 'F', { gear: { armourSlots: ['helmet', 'body'] } }, w, 2));
      out.push(run('mosslight_glade', ['bow'], 24, x + 'F', {}, w, 2));
      out.push(run('mosslight_glade', PARTIES.four, 16, x + 'F', {}, w, 2));
    }
    return out;
  }
  if (name === 'jewelry') {
    /* CRAFTED JEWELRY (lane/c-jewelry-sample, src/data/jewelry.js): two plain Banded Signets against the sample's Hallmarked pairs on the
       same dice, every way to fight at the Glade's middle. Blows wear Keen + Follow-through twice (a perk counts once); casts wear Surge on both. */
    const RINGS = {
      Pplain: { ring1: 'banded_signet', ring2: 'banded_signet' },
      Hblows: { ring1: 'banded_signet_keen_follow', ring2: 'banded_signet_keen_follow' },
      Hcasts: { ring1: 'banded_signet_surge_follow', ring2: 'banded_signet_keen_surge' },
    };
    for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) for (const [x, also] of Object.entries(RINGS)) {
      out.push({ ...cellOf({ ground: 'mosslight_glade', party: [s], level: 24, gear: { also }, hours: H(2), seeds: 4, x }), windowMs: 120000 });
    }
    return out;
  }
  if (name === 'pacefinal') {
    /* THE FINAL PACE RE-MEASURE'S READS (lane/b-pace-final, 2026-11-06), on the set that holds every change that moves combat or drops.
       Read by pacefinal-table.mjs. x = T<tier> | R<rune tier><s store | o own> | M<Greater Mend's line>.
       T: every tier on every ground that has one, in band and where the game sends a lone hero past it (the Glade to 50; the Warrens from
          its soloFrom), every way to fight alone; the parties on the two top grounds. The fastest honest hour and the skill rates at 50. */
    const SOLO_AT = { meadowbrook_thicket: [5, 10, 15], wickstead: [8, 13, 18], millrace_sewer: [8, 16, 25], mosslight_glade: [16, 24, 31, 40, 50], coppercap_warrens: [45, 48, 50] };
    const PARTY_AT = { mosslight_glade: [16, 31], coppercap_warrens: [32, 41, 50] };
    for (const tier of ['normal', 'dangerous', 'deadly']) {
      for (const [ground, levels] of Object.entries(SOLO_AT)) for (const level of levels) for (const s of SOLO_STYLES) out.push(tierCell(axes, { ground, party: [s], level, tier, hours: H(2), seeds: 2, x: 'T' + tier }));
      for (const [ground, levels] of Object.entries(PARTY_AT)) for (const level of levels) for (const party of Object.values(PARTIES)) out.push(tierCell(axes, { ground, party, level, tier, hours: H(2), seeds: 2, x: 'T' + tier }));
    }
    /* R: the casters on each rune tier their Magic casts (Scored from 15, Etched from 30): the store's deeper rune named on every rune slot
       (the bar a player sets), or the hero's own runes carried (a self-binding caster: 100%, no bill). Same dice as the default (R1s). */
    const casterSlots = (role, tier, mendPct) => axes.ROLE_RULES[role].map((sl) => {
      const y = JSON.parse(JSON.stringify(sl));
      const fam = y.action.store ? axes.familyOf(y.action.id) : null;
      if (fam && tier > 1) y.action.store = 'plain_' + axes.runeId(fam, tier);
      if (mendPct) for (const c of y.conditions) if (c.metric === 'ally_hp_pct') c.value = mendPct;
      return y;
    });
    const ownRunes = (role, tier) => Object.fromEntries(axes.ROLE_RULES[role].filter((sl) => sl.action.store).map((sl) => [axes.runeId(axes.familyOf(sl.action.id), tier), 100000]));
    const runeVariants = (level) => [[1, 's'], ...(level >= 15 ? [[2, 's'], [2, 'o']] : []), ...(level >= 30 ? [[3, 's'], [3, 'o']] : [])];
    const runeCell = (ground, party, level, tier, rt, src, seeds) => {
      const casters = [...new Set(party.map((s) => STYLES[s].role).filter((r) => r === 'mage' || r === 'healer'))];
      const slotsByRole = rt > 1 && src === 's' ? Object.fromEntries(casters.map((r) => [r, casterSlots(r, rt)])) : null;
      const bagByRole = src === 'o' ? Object.fromEntries(casters.map((r) => [r, ownRunes(r, rt)])) : null;
      return { ...tierCell(axes, { ground, party, level, tier, hours: H(2), seeds, x: 'R' + rt + src + ':' + tier }), ...(slotsByRole ? { slotsByRole } : {}), ...(bagByRole ? { bagByRole } : {}) };
    };
    const RUNE_SOLO = [['mosslight_glade', 16, 'normal'], ['mosslight_glade', 24, 'normal'], ['mosslight_glade', 24, 'deadly'], ['mosslight_glade', 31, 'normal'], ['mosslight_glade', 50, 'normal'],
      ['coppercap_warrens', 45, 'normal'], ['coppercap_warrens', 50, 'normal'], ['coppercap_warrens', 50, 'deadly']];
    for (const [ground, level, tier] of RUNE_SOLO) for (const s of ['mage', 'healer']) for (const [rt, src] of runeVariants(level)) out.push(runeCell(ground, [s], level, tier, rt, src, 4));
    for (const [ground, level] of [['coppercap_warrens', 32], ['coppercap_warrens', 50]]) for (const [rt, src] of runeVariants(level)) out.push(runeCell(ground, PARTIES.four, level, 'normal', rt, src, 2));
    /* M: the healer's "needs healing" line (Greater Mend under it, Green Sickness only over it): as built 70 (the slots written out, so it
       must read the default digit for digit), 80, 90. Alone and as the four's healer. */
    for (const [ground, level, party] of [['mosslight_glade', 24, ['healer']], ['mosslight_glade', 50, ['healer']], ['coppercap_warrens', 50, ['healer']],
      ['mosslight_glade', 24, PARTIES.four], ['coppercap_warrens', 41, PARTIES.four], ['coppercap_warrens', 50, PARTIES.four]]) for (const pct of [70, 80, 90]) {
      out.push({ ...tierCell(axes, { ground, party, level, tier: 'normal', hours: H(2), seeds: 4, x: 'M' + pct }), slotsByRole: { healer: casterSlots('healer', 1, pct) } });
    }
    return out;
  }
  if (name === 'capes') {
    /* A CAPE AND STUDS, before and after guard came off them (2026-11-05): every way to fight, at the Glade's middle and at the Warrens, with no cape, with the rows as they were (whatIf), and as they are. */
    const DRESSED = { cape: 'houndskin_cloak', earrings: 'copper_studs' };
    const BEFORE = { items: { houndskin_cloak: { defB: 4, steadyPm: 0 }, copper_studs: { defB: 1 } } };
    for (const [ground, level] of [['mosslight_glade', 24], ['coppercap_warrens', 40]]) for (const s of ['tank', 'hammer', 'bow', 'mage']) {
      const cell = (x, gear, whatIf) => ({ ...cellOf({ ground, party: [s], level, gear, hours: H(2), seeds: 4, x }), windowMs: 120000, ...(whatIf ? { whatIf } : {}) });
      out.push(cell('Nnone', {}), cell('Bbefore', { also: DRESSED }, BEFORE), cell('Aafter', { also: DRESSED }));
      out.push(cell('Ahound', { also: { cape: 'houndskin_cloak' } }), cell('Agray', { also: { cape: 'graypelt_cloak' } }));
    }
    return out;
  }
  if (name === 'capes22') {
    /* THE LEVEL 22 RUNG, where it comes in: a hero at the rung's Level in helm and body, with no cape, the Graypelt below it, the Houndskin. */
    for (const s of ['tank', 'hammer', 'bow', 'mage']) for (const [x, also] of [['Nnone', null], ['Agray', { cape: 'graypelt_cloak' }], ['Ahound', { cape: 'houndskin_cloak' }]]) {
      out.push({ ...cellOf({ ground: 'mosslight_glade', party: [s], level: 22, gear: { armourSlots: ['helmet', 'body'], ...(also ? { also } : {}) }, hours: H(2), seeds: 4, x }), windowMs: 120000 });
    }
    return out;
  }
  if (name === 'bowspeed') {
    /* WHICH OF THE GLADE'S ROWS: the speed sets, smallest first (sim only), the fresh bow and mage on the rush, every in-range floor beside them. */
    const fresh = { gear: { starter: true }, startBar: true };
    const run = (party, level, x, b, whatIf, seeds) => ({ ...cellOf({ ground: 'mosslight_glade', party, level, hours: H(2), seeds, x, ...b }), windowMs: 120000, ...(whatIf ? { whatIf } : {}) });
    const speeds = (poacher, rook, sluicer, bear) => ({ monsters: { glade_poacher: { speed: poacher }, rook_poacher: { speed: rook }, goblin_sluicer: { speed: sluicer }, brook_bear: { speed: bear } } });
    const SETS = { S0: null, S1: speeds(3800, 3800, 3000, 3000), S2: speeds(3800, 3800, 3400, 3400), S3: speeds(3600, 3600, 3600, 3600), S4: speeds(3800, 3800, 3800, 3000), S5: speeds(3800, 3800, 3800, 3800) };
    for (const [x, w] of Object.entries(SETS)) {
      for (const level of [1, 5, 10]) out.push(run(['bow'], level, x, fresh, w, 4));
      for (const level of [1, 5]) out.push(run(['mage'], level, x, fresh, w, 4));
      for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) out.push(run([s], 16, x + 'F', {}, w, 2));
      out.push(run(['tank'], 16, x + 'F', { gear: { armourSlots: ['helmet', 'body'] } }, w, 2));
      out.push(run(PARTIES.four, 16, x + 'F', {}, w, 2));
    }
    return out;
  }
  if (name === 'riskleech') {
    /* WHAT THE GONE BLOCK LETS IN: a low hero sat behind three friends who hold the ground. Levels [friends x3, the low seat]; the low seat stands last, a bow or a mage, in the practice set or the Level's kit. */
    for (const [ground, friends, lows] of [['coppercap_warrens', 37, [1, 8, 18, 25]], ['mosslight_glade', 24, [1, 8]], ['meadowbrook_thicket', 12, [1]]]) {
      for (const low of lows) for (const s of ['bow', 'mage']) for (const [x, gear] of [['start', { starter: true }], ['kit', {}]]) {
        out.push({ ...cellOf({ ground, party: ['tank', 'healer', 'mage', s], level: [friends, friends, friends, low], hours: H(1), seeds: 2, x: 'Leech' + x }), gearBySeat: [{}, {}, {}, gear], windowMs: 120000 });
      }
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
