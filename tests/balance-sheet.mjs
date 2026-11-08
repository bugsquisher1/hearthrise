#!/usr/bin/env node
// tests/balance-sheet.mjs — THE TARGET SHEET, THE STAT FORMULA AND THE TIER TABLE HOLD THEIR OWN RULES (src/data/balance-sheet.js;
// lane/b-ground-formula, Tyler 2026-11-07 "is there a formula you can start following?"). Pure, about a second, no engine play
// (the measured half is tools/balance-sim/sheet-check.mjs on a plan 'formula' run).
//
//   restated-engine   the formula's damage scale per tier and to-hit per point are combat.js's own numbers (it divides a blow by
//                     the first and derives baseAcc with the second, so a drift would write wrong rows silently)
//   same-level-read   every role at every Level 1-200 reads back through the ENGINE's own monsterAccuracy and monsterMaxHit: its
//                     to-hit at a same-Level hero is the formula's (within a rounding point) and its blow is the formula's share of
//                     that hero's base HP (within one atk step)
//   blows-capped      no role's largest blow passes the sheet's regular cap at any Level (BALANCE_SHEET.blows)
//   curves-climb      HP, XP and coin never fall as a Level rises, for every role (a scaled ground only gets harder and richer)
//   tiers             the one table: each harder tier pulls at least as many, hits at least as hard, pays more XP, and never moves coin;
//                     the Cellar is Normal only
//   roster            tools/gen-ground-stats.mjs names only real monsters and real roles, and its --selftest bites
//
// --mutate: each case is run against a planted wrong copy and must go red.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const { BUILD } = await import(u('src/build-info.js'));
const V = '?v=' + BUILD.version;
const REAL = await import(u('src/data/balance-sheet.js'));
const C = await import(u('src/core/combat.js') + V);
const { MONSTERS } = await import(u('src/data/monsters.js'));
const GEN = await import(u('tools/gen-ground-stats.mjs'));

const CASES = {
  'restated-engine': (B) => {
    const bad = [];
    for (const t of [1, 2, 3, 4, 5, 6]) {
      const engine = C.COMBAT_BALANCE.monsterDamageScaleByTier[t] || C.COMBAT_BALANCE.monsterAttackDamageScale;
      if (B.DAMAGE_SCALE_BY_TIER[t] !== engine) bad.push('tier ' + t + ' damage scale ' + B.DAMAGE_SCALE_BY_TIER[t] + ', the engine\'s ' + engine);
    }
    if (B.ACC_PER_POINT !== C.COMBAT_BALANCE.monsterAccuracyPerPoint) bad.push('to-hit per point ' + B.ACC_PER_POINT + ', the engine\'s ' + C.COMBAT_BALANCE.monsterAccuracyPerPoint);
    return bad;
  },
  'same-level-read': (B) => {
    const bad = [];
    for (const role of B.ROLE_IDS) for (let L = 1; L <= 200; L++) for (const tier of [1, 3, 5]) for (const floor of [1, 16]) {
      const f = B.formulaStats({ level: L, role, tier, floor }, { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES });
      const row = { atk: f.atk, baseAcc: f.baseAcc, tier };
      const hit = C.monsterAccuracy(row, L), want = Math.min(0.85, Math.max(0.05, f.hitVsSameLevel));
      if (Math.abs(hit - want) > 0.0101) { bad.push(role + ' L' + L + ' T' + tier + ' floor ' + floor + ': to-hit ' + hit.toFixed(3) + ', the formula ' + want); break; }
      const share = C.monsterMaxHit(row) / B.STAT_FORMULA.refHp(L), step = B.DAMAGE_SCALE_BY_TIER[tier] / B.STAT_FORMULA.refHp(L);
      if (f.atk > 1 && Math.abs(share - f.blowShare) > step) { bad.push(role + ' L' + L + ' T' + tier + ': blow ' + share.toFixed(3) + ' of HP, the formula ' + f.blowShare); break; }
    }
    return bad;
  },
  'blows-capped': (B) => {
    const bad = [];
    for (const role of B.ROLE_IDS) for (let L = 1; L <= 200; L++) {
      const f = B.formulaStats({ level: L, role, tier: 2, floor: L }, { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES });
      if (f.blowShare > B.BALANCE_SHEET.blows.regularMaxShare) { bad.push(role + ' L' + L + ': blow ' + f.blowShare + ' of a same-Level hero, cap ' + B.BALANCE_SHEET.blows.regularMaxShare); break; }
    }
    return bad;
  },
  'curves-climb': (B) => {
    const bad = [];
    for (const role of B.ROLE_IDS) {
      let was = null;
      for (let L = 1; L <= 200; L++) {
        const f = B.formulaStats({ level: L, role, tier: 2, floor: L }, { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES });
        /* coin is the roll's MEAN (STAT_FORMULA.gp.keepMean: lo..2 x mean - lo, so the top can step down a coin as the bottom steps up) */
        if (was && (f.hp < was.hp || f.xp < was.xp || f.gp[0] + f.gp[1] < was.gp[0] + was.gp[1])) { bad.push(role + ' falls from Level ' + (L - 1) + ' to ' + L); break; }
        was = f;
      }
    }
    if (!(B.rampAt(B.STAT_FORMULA.ramp.from) === 0 && B.rampAt(B.STAT_FORMULA.ramp.to) === 1)) bad.push('the danger ramp does not run 0 to 1 over its Levels');
    return bad;
  },
  tiers: (B) => {
    const bad = [], T = B.TIER_DIALS;
    if (T.normal.dmgPm !== 1000 || T.normal.hpPm !== 1000 || T.normal.xpPm !== 1000 || T.normal.pull !== 0) bad.push('Normal is not the ground as it stands');
    let was = T.normal;
    for (const id of ['dangerous', 'deadly']) {
      const t = T[id];
      /* ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08): a tier's pull is one number, for one hero or four */
      if (!Number.isInteger(t.pull) || t.pull < 0) bad.push(id + ' pull is not one number for every group: ' + JSON.stringify(t.pull));
      else if (t.pull < was.pull && t.pull !== 0) bad.push(id + ' pulls fewer than the tier before');
      for (const [g, o] of Object.entries(B.TIER_PULL_OVERRIDES)) if (o[id] !== undefined && !Number.isInteger(o[id])) bad.push(g + ' ' + id + ' pull is not one number for every group: ' + JSON.stringify(o[id]));
      if (!(t.dmgPm >= was.dmgPm && t.hpPm >= was.hpPm && t.xpPm > was.xpPm)) bad.push(id + ' is not harder and better paid than the tier before');
      if ('gpPm' in t || 'coinPm' in t) bad.push(id + ' moves coin (Tyler 2026-11-07: never)');
      was = t;
    }
    if (!(B.TIER_PULL_OVERRIDES.mill_cellar && B.TIER_PULL_OVERRIDES.mill_cellar.normalOnly)) bad.push('the Mill Cellar offers a harder tier');
    for (const [g, o] of Object.entries(B.TIER_PULL_OVERRIDES)) if (!o.why) bad.push(g + '\'s override has no reason');
    if (bad.length) return bad; /* (tierRowFor refuses a pull a party size, so the rows below can't be read) */
    /* the engine row a ground gets: never softer than the table, the table's own on a full ground, harder the gentler the ground */
    for (const id of ['dangerous', 'deadly']) {
      let above = Infinity;
      for (let floor = 1; floor <= 60; floor++) {
        const r = B.tierRowFor(floor, id, { tiers: T, formula: B.STAT_FORMULA });
        if (r.dmgPm < T[id].dmgPm || r.dmgPm > above) { bad.push(id + ' on a floor-' + floor + ' ground hits ' + r.dmgPm + ' permille'); break; }
        if (floor >= B.STAT_FORMULA.ramp.to && r.dmgPm !== T[id].dmgPm) { bad.push(id + ' on a full ground is not the table\'s ' + T[id].dmgPm); break; }
        above = r.dmgPm;
      }
    }
    return bad;
  },
  roster: () => {
    const bad = [];
    for (const [g, rows] of Object.entries(GEN.ROSTER)) for (const [id, role] of Object.entries(rows)) {
      if (!MONSTERS[id]) bad.push(g + ': ' + id + ' is not a monster');
      if (!REAL.MONSTER_ROLES[role]) bad.push(g + ': ' + id + ' has no role ' + role);
    }
    try { execFileSync(process.execPath, [join(ROOT, 'tools/gen-ground-stats.mjs'), '--selftest'], { stdio: 'pipe' }); } catch (e) { bad.push('gen-ground-stats --selftest is red: ' + String(e.stdout || e.message).trim()); }
    return bad;
  },
  /* THE FENCE: every row that says `formula: true` (monster-classes.js auditRoster then skips its hand bands) is the formula's, digit
     for digit, and stands on the roster; a ground the formula has written has every one of its roster rows written. */
  'rows-are-the-formula': (B, M = MONSTERS) => {
    const bad = [], D = { MONSTERS: M, formulaStats: B.formulaStats, floorOf: GEN_D.floorOf, fitOf: GEN_D.fitOf };
    const onRoster = new Set(Object.values(GEN.ROSTER).flatMap((r) => Object.keys(r)));
    for (const [id, m] of Object.entries(M)) if (m && m.formula === true && !onRoster.has(id)) bad.push(id + ' says formula: true and is on no ground\'s roster');
    for (const g of Object.keys(GEN.ROSTER)) {
      const rows = GEN.proposeGround(g, D), written = rows.filter((r) => M[r.id].formula === true);
      if (written.length && written.length !== rows.length) bad.push(g + ': ' + written.length + ' of ' + rows.length + ' roster rows written (a ground moves whole)');
      for (const r of written) if (r.drift.length) bad.push(r.id + ' (' + g + '): ' + r.drift.map((k) => k + ' ' + JSON.stringify(r.today[k]) + ', the formula ' + JSON.stringify(r.formula[k])).join('; '));
    }
    return bad;
  },
};
/* the generator's own ground readers (floor and fit from src/data), for the fence */
const GEN_D = await (async () => {
  const { HUNT_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  return { floorOf: (g) => HUNT_INDEX[HUNT_GROUNDS[g].hunt].band[0], fitOf: (g) => (HUNT_GROUNDS[g].pockets.some((p) => p.forParty) ? 'party' : HUNT_GROUNDS[g].groupFit || 'both') };
})();

/* THE MUTANTS: a planted copy of the module with one rule broken; the named case must go red on it. */
const plant = (patch) => {
  const B = { ...REAL, ...patch };
  const opts = { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES };
  B.formulaStats = (spec, o) => REAL.formulaStats(spec, { ...opts, ...(o || {}) });
  return B;
};
const MUTANTS = [
  ['restated-engine', 'tier 3 scale restated as 5.4', () => plant({ DAMAGE_SCALE_BY_TIER: { ...REAL.DAMAGE_SCALE_BY_TIER, 3: 5.4 } })],
  ['same-level-read', 'to-hit per point restated as 0.01', () => { const B = plant({}); B.formulaStats = (spec, o) => { const f = REAL.formulaStats(spec, o); return { ...f, baseAcc: Math.round((f.hitVsSameLevel - (f.atk - spec.level) * 0.01) * 100) / 100 }; }; return B; }],
  ['blows-capped', 'a regular blow of 40% of HP', () => plant({ STAT_FORMULA: { ...REAL.STAT_FORMULA, blow: { lo: 0.10, hi: 0.40 } } })],
  ['curves-climb', 'HP falling past Level 100', () => { const B = plant({}); B.formulaStats = (spec, o) => { const f = REAL.formulaStats(spec, o); return { ...f, hp: spec.level > 100 ? f.hp - spec.level : f.hp }; }; return B; }],
  ['curves-climb', 'coin falling past Level 100', () => { const B = plant({}); B.formulaStats = (spec, o) => { const f = REAL.formulaStats(spec, o); return { ...f, gp: spec.level > 100 ? [f.gp[0] - 1, f.gp[1] - spec.level] : f.gp }; }; return B; }],
  ['tiers', 'Deadly paying coin', () => plant({ TIER_DIALS: { ...REAL.TIER_DIALS, deadly: { ...REAL.TIER_DIALS.deadly, gpPm: 1200 } } })],
  ['tiers', 'Dangerous hitting softer than Normal', () => plant({ TIER_DIALS: { ...REAL.TIER_DIALS, dangerous: { ...REAL.TIER_DIALS.dangerous, dmgPm: 900 } } })],
  ['tiers', 'Dangerous pulling by party size again (a lone hero 3, a four 6)', () => plant({ TIER_DIALS: { ...REAL.TIER_DIALS, dangerous: { ...REAL.TIER_DIALS.dangerous, pull: [3, 5, 5, 6] } } })],
  ['tiers', 'a ground giving a lone hero its own Deadly pull again', () => plant({ TIER_PULL_OVERRIDES: { ...REAL.TIER_PULL_OVERRIDES, wickstead: { deadly: [0, 8, 8, 8], why: 'a lone hero keeps the ground as it stands' } } })],
];

/* a roster with one ground written by the formula, then one of its rows nudged off it, or one row left behind */
const writtenGround = (nudge) => {
  const g = 'wickstead', D = { MONSTERS, formulaStats: REAL.formulaStats, floorOf: GEN_D.floorOf, fitOf: GEN_D.fitOf };
  const M = { ...MONSTERS };
  for (const r of GEN.proposeGround(g, D)) M[r.id] = { ...MONSTERS[r.id], ...r.formula, formula: true };
  nudge(M, Object.keys(GEN.ROSTER[g]));
  return M;
};
MUTANTS.push(['rows-are-the-formula', 'a written row one atk point off', () => ({ M: writtenGround((M, ids) => { M[ids[0]] = { ...M[ids[0]], atk: M[ids[0]].atk + 1 }; }) })]);
MUTANTS.push(['rows-are-the-formula', 'a ground written all but one row', () => ({ M: writtenGround((M, ids) => { const { formula, ...hand } = M[ids[1]]; M[ids[1]] = hand; }) })]);
MUTANTS.push(['rows-are-the-formula', 'a hand row off every roster flagged as the formula\'s', () => {
  const onRoster = new Set(Object.values(GEN.ROSTER).flatMap((r) => Object.keys(r)));
  const off = Object.keys(MONSTERS).find((id) => !onRoster.has(id));
  return { M: { ...MONSTERS, [off]: { ...MONSTERS[off], formula: true } } };
}]);
MUTANTS.push(['rows-are-the-formula', 'a written row\'s coin doubled', () => ({ M: { ...MONSTERS, rat_king: { ...MONSTERS.rat_king, gp: MONSTERS.rat_king.gp.map((g) => g * 2) } } })]);

const mutate = process.argv.includes('--mutate');
let red = 0;
for (const [name, fn] of Object.entries(CASES)) {
  const bad = fn(REAL);
  if (bad.length) { red++; console.error('  RED  ' + name + '\n        ' + bad.slice(0, 5).join('\n        ')); } else console.log('  ok   ' + name);
}
if (mutate) for (const [name, what, make] of MUTANTS) {
  const made = make();
  const bad = made.M ? CASES[name](REAL, made.M) : CASES[name](made);
  if (!bad.length) { red++; console.error('  MUTANT SURVIVED  ' + name + ': ' + what); } else console.log('  caught  ' + name + ': ' + what);
}
if (red) { console.error('balance-sheet: RED (' + red + ')'); process.exit(1); }
console.log('balance-sheet: green' + (mutate ? ' (' + MUTANTS.length + ' mutants caught)' : ''));
